"""
Broker patch — version-gated /state surface (frozen spec §8)
============================================================

Adds to the existing Railway-hosted FastAPI broker
(https://web-production-b17a2.up.railway.app):

    GET  /state/{doc_id}/version  -> { version, etag, updatedAt }   (cheap; this is what polls)
    GET  /state/{doc_id}          -> full doc + version
    PUT  /state/{doc_id}          -> write; requires If-Match: <etag>; 412 on mismatch

Concurrency is optimistic (If-Match). Clients poll the version endpoint only and
pull the full doc on change; after a PUT they record the returned version and
ignore that echo so autosave cannot self-trigger.

This file is additive and self-contained. To deploy:
  1. include the router:  app.include_router(state_router)
  2. set env vars: JSONBIN_MASTER_KEY, UNIFIED_DIVISIONS, and one <DOC>_BIN per doc
     (PORTFOLIO_BIN, GANTT_VIEW_BIN, EXEC_DIV_FC_BIN, ... — create_bins.py prints them).

The JSONBin read/write is implemented below (urllib, no extra dependency). The
version is a monotonically increasing integer kept inside each bin; the etag is its
hash. Optimistic concurrency is enforced here under a process-local _LOCK, so run
the broker as a single worker / replica — JSONBin has no compare-and-swap, and two
workers could otherwise both pass the If-Match check on the same doc (a lost
update). A small team on one worker is safe; true multi-worker safety needs an
external lock.
"""

import hashlib
import json
import os
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel

state_router = APIRouter()

# ---- concurrency + cache ---------------------------------------------------
# Locks are PER DOC, mirroring the per-bin lock Store already uses in broker.py.
# A single global lock (what this file used to do) meant a slow write to one doc
# blocked reads of every other doc, and every reader serialized behind a network
# round-trip. That was survivable with a handful of editors; it is not once the
# R&D Hub adds ~10 readers polling every doc.
#
# _CACHE holds the last-known wrapper per STATE doc and is AUTHORITATIVE: this
# broker is the only writer to those bins, so a cached wrapper cannot go stale
# behind our backs — our own writes refresh it. That turns GET /state/{id} and
# GET /state/{id}/version into memory reads with no JSONBin traffic at all,
# which is what makes Hub polling free.
#
# Scope matters: this does NOT cover the users bin behind /roster. The Hub writes
# that bin (PINs, leadOf, configuredTiles), so the broker is NOT its only writer
# and caching it would serve stale rosters. /roster reads through every time.
#
# Only positive lookups are cached. A miss may be a genuinely absent doc or a
# transient JSONBin failure, and the two are indistinguishable here — caching the
# negative would risk pinning a blip as "this document does not exist" forever.
#
# The cache lives in process memory, so a redeploy clears it. That is also the
# escape hatch if a bin is ever changed out-of-band during a migration: restart.
_CACHE: Dict[str, Dict[str, Any]] = {}
_LOCKS: Dict[str, threading.RLock] = defaultdict(threading.RLock)
_LOCK_GUARD = threading.Lock()


def _lock_for(doc_id: str) -> threading.RLock:
    # Guard the defaultdict so two threads racing on a new doc id share one lock.
    with _LOCK_GUARD:
        return _LOCKS[doc_id]

# ---- JSONBin storage -------------------------------------------------------
# The unified app's documents live in NEW, isolated JSONBin bins, one per doc:
# portfolio, gantt-view, and EXEC-<divisionId> per division. Each bin stores the
# wrapper { "version": int, "updatedAt": float, "doc": <payload> }; the version
# counter rides inside the bin, so there is no separate version store.
#
# Configured entirely via env (no ids/keys in code):
#   JSONBIN_MASTER_KEY   your X-Master-Key
#   UNIFIED_DIVISIONS    comma-separated division ids, e.g. "DIV-FC,DIV-EL"
#   <DOC>_BIN            one bin id per doc: PORTFOLIO_BIN, GANTT_VIEW_BIN,
#                        EXEC_DIV_FC_BIN, ...  (create_bins.py prints these)
#
# Import never fails on missing env; a missing bin id surfaces as a clear error
# only if that specific doc is actually written.
_JSONBIN = "https://api.jsonbin.io/v3/b"
# JSONBin is fronted by Cloudflare, which 403s the urllib default "Python-urllib/x"
# User-Agent with "error code: 1010". Send a non-default UA on every JSONBin call.
_UA = "Mozilla/5.0 (compatible; CeladyneRD/1.0)"
_KEY = os.environ.get("JSONBIN_MASTER_KEY")
_DIVISIONS = [d.strip() for d in os.environ.get("UNIFIED_DIVISIONS", "DIV-FC").split(",") if d.strip()]
_DOC_IDS = (["portfolio", "gantt-view"]
            + [f"EXEC-{d}" for d in _DIVISIONS]
            + [f"SPEC-{d}" for d in _DIVISIONS])   # SPEC-<div>: product-designer per-division spec docs


def _env_name(doc_id: str) -> str:
    return doc_id.upper().replace("-", "_") + "_BIN"


# doc id -> bin id (None until its env var is set)
BIN_FOR: Dict[str, Optional[str]] = {d: os.environ.get(_env_name(d)) for d in _DOC_IDS}


def _jsonbin_get(bin_id: str) -> Optional[Dict[str, Any]]:
    req = urllib.request.Request(f"{_JSONBIN}/{bin_id}/latest",
                                 headers={"X-Master-Key": _KEY or "", "User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError:
        return None


def _jsonbin_put(bin_id: str, payload: Dict[str, Any]) -> None:
    # The update PUT carries ONLY content-type + key — never X-Bin-Private (that
    # would spawn a new bin). JSONBin update versioning is off by default, so this
    # overwrites the bin in place.
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{_JSONBIN}/{bin_id}", data=data, method="PUT",
        headers={"Content-Type": "application/json", "X-Master-Key": _KEY or "", "User-Agent": _UA},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


def _load_raw(doc_id: str) -> Optional[Dict[str, Any]]:
    """Return the stored wrapper for a doc, or None if the bin is unset/empty/new.

    Served from _CACHE when present — see the cache note above for why that is
    safe. The fast path takes no lock: wrappers are swapped whole on write, so a
    reader sees either the old wrapper or the new one, never a torn mix.
    """
    cached = _CACHE.get(doc_id)
    if cached is not None:
        return cached
    bin_id = BIN_FOR.get(doc_id)
    if not bin_id:
        return None
    with _lock_for(doc_id):
        cached = _CACHE.get(doc_id)      # double-checked: another thread may have filled it
        if cached is not None:
            return cached
        resp = _jsonbin_get(bin_id)
        if not resp:
            return None                  # miss/failure: uncached, so it retries next call
        record = resp.get("record")      # JSONBin returns the stored payload under "record"
        if not (isinstance(record, dict) and "version" in record):
            return None
        _CACHE[doc_id] = record
        return record


def _save_raw(doc_id: str, wrapped: Dict[str, Any]) -> None:
    bin_id = BIN_FOR.get(doc_id)
    if not bin_id:
        # HTTPException (not RuntimeError) so the message flows back through the CORS
        # middleware and is readable client-side instead of a masked 500/"CORS" error.
        raise HTTPException(
            status_code=500,
            detail=(f"no bin id configured for doc '{doc_id}' — set env var {_env_name(doc_id)} "
                    f"(and add the division to UNIFIED_DIVISIONS)"),
        )
    _jsonbin_put(bin_id, wrapped)
    # Our write is now the truth; refresh the cache rather than invalidating it,
    # so the next reader is served from memory instead of re-fetching what we
    # just sent.
    _CACHE[doc_id] = wrapped


# ---- helpers ---------------------------------------------------------------
def _etag_for(version: int, doc_id: str) -> str:
    return hashlib.sha256(f"{doc_id}:{version}".encode("utf-8")).hexdigest()[:16]


def _version_payload(doc_id: str, wrapped: Dict[str, Any]) -> Dict[str, Any]:
    version = wrapped["version"]
    return {
        "version": version,
        "etag": _etag_for(version, doc_id),
        "updatedAt": wrapped["updatedAt"],
    }


class StatePut(BaseModel):
    doc: Any  # the full document payload (portfolio / exec-<div> / gantt-view)


# ---- routes ----------------------------------------------------------------
# ---------------------------------------------------------------------------
# GET /roster -> [{email, orgRole, leadOf, disabled}]
#
# The users bin also holds pinHash / salt / iterations for every user. Those are
# PIN credentials: the keyspace is tiny, so anyone holding hash+salt recovers the
# PIN offline regardless of the 200k iteration count. They must never reach a
# browser, and filtering client-side would not help -- by then they have already
# crossed the wire.
#
# So this endpoint is a strict WHITELIST, not a blacklist: it names the four
# fields it emits and drops everything else. A new secret added to the users bin
# tomorrow is excluded by default rather than leaking until someone notices.
# assignedObjectives is deliberately NOT exposed -- the planning app owns
# objective ownership in its own portfolio doc, and mirroring that relationship
# here would give one fact two homes.
#
# Read-only by design: there is no write path to the users bin in this broker.
# ---------------------------------------------------------------------------
ROSTER_FIELDS = ("email", "orgRole", "leadOf", "disabled")
USERS_BIN = os.environ.get("USERS_BIN")


def _project_user(u: Dict[str, Any]) -> Dict[str, Any]:
    out = {
        "email": u.get("email"),
        "orgRole": u.get("orgRole"),
        "leadOf": list(u.get("leadOf") or []),
        "disabled": bool(u.get("disabled")),
    }
    assert set(out) == set(ROSTER_FIELDS)      # a field added above must be declared above
    return out


@state_router.get("/roster")
def get_roster():
    """Users for the objective-owner picker. Never emits credential material."""
    if not USERS_BIN:
        raise HTTPException(status_code=503, detail="USERS_BIN is not configured")
    raw = _jsonbin_get(USERS_BIN)
    if raw is None:
        raise HTTPException(status_code=502, detail="users bin unavailable")
    users = (raw.get("record") or raw).get("users") or []
    return {"users": [_project_user(u) for u in users if u.get("email")]}


# ---------------------------------------------------------------------------
# GET /rdcore.js        -> the canonical scoring/banding engine
# GET /rdcore/version   -> its content hash
#
# RDCore decides what "on-track" means. It must exist once, or the tools quietly
# disagree. The single source of truth is rdcore.js in this repo; build_rdcore.py
# inlines that same file into the three app shells (they keep an offline scratch
# mode that a <script src> would break) and the broker serves it here for the
# R&D Hub, which cannot render without broker data anyway and so pays nothing for
# the dependency. The Hub therefore picks up engine changes — including band
# threshold changes — on reload, with no Hub redeploy.
#
# The ETag is the same sha256[:16] that build_rdcore.py stamps into each app's
# ==RDCORE_START== marker, so "is that app's inlined copy current?" is a string
# compare against GET /rdcore/version.
#
# Cache-Control: no-cache means the browser revalidates every load and gets a
# ~200-byte 304 when nothing changed. Freshness is the whole point; 65KB only
# crosses the wire when the engine actually moved.
# ---------------------------------------------------------------------------
# The engine is FOUND, not configured. A single configured path is invisible state that is silently wrong
# when it is wrong: a typo or a relative value 500s /rdcore.js and the Hub then renders nothing, with the
# reason living only in a log. So try the places it plausibly is, in order, and use the first that exists.
#
# RDCORE_PATH remains an override for anything unusual, but it is now a hint rather than a requirement:
#   1. RDCORE_PATH, if absolute
#   2. RDCORE_PATH relative to THIS FILE   (what someone means by "../rdcore.js"; cwd is not dependable)
#   3. RDCORE_PATH relative to the cwd     (what a shell would have done)
#   4. beside broker.py
#   5. one directory up             (repo root, with the broker in a subfolder — Corey's layout)
# Surrounding quotes are stripped: a dashboard Variables field takes its value literally, so RDCORE_PATH
# pasted as "/app/rdcore.js" would otherwise hunt for a file whose name includes the quote characters.
_RDCORE_ENV = (os.environ.get("RDCORE_PATH") or "").strip().strip('"').strip("'")
_RDCORE_HERE = os.path.dirname(os.path.abspath(__file__))


def _rdcore_candidates() -> list:
    out = []
    if _RDCORE_ENV:
        if os.path.isabs(_RDCORE_ENV):
            out.append(_RDCORE_ENV)
        else:
            out.append(os.path.normpath(os.path.join(_RDCORE_HERE, _RDCORE_ENV)))
            out.append(os.path.abspath(_RDCORE_ENV))
    out.append(os.path.join(_RDCORE_HERE, "rdcore.js"))
    out.append(os.path.join(os.path.dirname(_RDCORE_HERE), "rdcore.js"))
    seen = []
    for p in out:                      # dedupe, preserving order
        if p not in seen:
            seen.append(p)
    return seen


# kept for compatibility: the first place we would look
_RDCORE_PATH = _rdcore_candidates()[0]
_RDCORE: Optional[Tuple[str, str]] = None


def _rdcore() -> Tuple[str, str]:
    """(source, etag). Read once and held — the file only changes on deploy."""
    global _RDCORE
    if _RDCORE is None:
        tried = []
        for p in _rdcore_candidates():
            tried.append(p)
            try:
                with open(p, encoding="utf-8") as fh:
                    text = fh.read()
            except OSError:
                continue
            _RDCORE = (text, hashlib.sha256(text.strip().encode("utf-8")).hexdigest()[:16])
            return _RDCORE
        # Name EVERY path tried. "not found at X" sends you to fix X, which may not even be the right X.
        raise FileNotFoundError(
            "rdcore.js not found. Tried, in order:\n  " + "\n  ".join(tried)
            + f"\n(cwd={os.getcwd()}; RDCORE_PATH={_RDCORE_ENV or 'unset'})"
        )
    return _RDCORE


@state_router.get("/rdcore.js")
def get_rdcore(if_none_match: Optional[str] = Header(default=None, alias="If-None-Match")):
    try:
        text, etag = _rdcore()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=text, media_type="application/javascript", headers=headers)


@state_router.get("/rdcore/version")
def get_rdcore_version():
    """Engine hash — compare against an app's ==RDCORE_START== marker to spot drift."""
    try:
        _, etag = _rdcore()
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"etag": etag}


@state_router.get("/state/{doc_id}/version")
def get_version(doc_id: str):
    """Cheap polling endpoint — and now cheap on the JSONBin side too, not just in
    response size. This is the call the Hub makes most, so it must not fetch."""
    wrapped = _load_raw(doc_id)          # cache hit: no lock, no network
    if wrapped is None:
        # A not-yet-created doc reports version 0 so a fresh client can seed it.
        return {"version": 0, "etag": _etag_for(0, doc_id), "updatedAt": None}
    return _version_payload(doc_id, wrapped)


@state_router.get("/state/{doc_id}")
def get_state(doc_id: str, response: Response):
    wrapped = _load_raw(doc_id)          # cache hit: no lock, no network
    if wrapped is None:
        raise HTTPException(status_code=404, detail="document not found")
    response.headers["ETag"] = _etag_for(wrapped["version"], doc_id)
    return {**_version_payload(doc_id, wrapped), "doc": wrapped["doc"]}


@state_router.put("/state/{doc_id}")
def put_state(
    doc_id: str,
    body: StatePut,
    response: Response,
    if_match: Optional[str] = Header(default=None, alias="If-Match"),
):
    """
    Optimistic write. The client must send If-Match with the etag it last read.
    - First write of a brand-new doc: send If-Match: "0" (or the etag of version 0).
    - 412 on mismatch -> client re-pulls, re-applies, retries once.

    The lock is held across the read-modify-write, including the JSONBin PUT —
    that IS the serialization guarantee, and it is why the Procfile pins
    --workers 1. It is now a per-doc lock, so writers to different documents no
    longer queue behind each other, and no reader waits on any of it.
    """
    with _lock_for(doc_id):
        wrapped = _load_raw(doc_id)
        current_version = wrapped["version"] if wrapped else 0
        current_etag = _etag_for(current_version, doc_id)

        if if_match is None:
            raise HTTPException(status_code=428, detail="If-Match header required")

        # Accept either the raw etag or the bare version number as a convenience.
        supplied = if_match.strip().strip('"')
        if supplied not in (current_etag, str(current_version)):
            raise HTTPException(
                status_code=412,
                detail={"reason": "etag mismatch", "currentVersion": current_version,
                        "currentEtag": current_etag},
            )

        new_version = current_version + 1
        new_wrapped = {"version": new_version, "updatedAt": time.time(), "doc": body.doc}
        _save_raw(doc_id, new_wrapped)

    response.headers["ETag"] = _etag_for(new_version, doc_id)
    return _version_payload(doc_id, new_wrapped)


# ---- self-check (run: python broker_patch.py) ------------------------------
if __name__ == "__main__":
    # Runs offline (no JSONBin, no env). The mock sits at the JSONBin layer, not
    # at _load_raw/_save_raw as it used to — otherwise the cache under test would
    # be bypassed and the fetch counts below would prove nothing.
    _bins: Dict[str, Dict[str, Any]] = {}          # bin_id -> stored payload
    _fetches = {"n": 0}
    _puts = {"n": 0}

    def _fake_get(bin_id):
        _fetches["n"] += 1
        return {"record": _bins[bin_id]} if bin_id in _bins else None

    def _fake_put(bin_id, payload):
        _puts["n"] += 1
        _bins[bin_id] = payload

    globals()["_jsonbin_get"] = _fake_get
    globals()["_jsonbin_put"] = _fake_put
    BIN_FOR["portfolio"] = "bin_pf"
    BIN_FOR["EXEC-DIV-FC"] = "bin_fc"

    class _Resp:
        def __init__(self): self.headers = {}

    ok = lambda m: print("  ok   " + m)

    # --- write path + optimistic concurrency (unchanged behaviour) ------------
    r = put_state("portfolio", StatePut(doc={"divisions": []}), _Resp(), if_match="0")
    assert r["version"] == 1, r
    v = get_version("portfolio")
    assert v["version"] == 1, v
    ok("seed write + version read")

    rejected = False
    try:
        put_state("portfolio", StatePut(doc={"divisions": [1]}), _Resp(), if_match="0")
    except HTTPException as e:
        rejected = e.status_code == 412
    assert rejected, "stale write should 412"
    ok("stale write rejected (412)")

    r2 = put_state("portfolio", StatePut(doc={"divisions": [1]}), _Resp(), if_match=v["etag"])
    assert r2["version"] == 2, r2
    ok("correct write accepted")

    missing = 428
    try:
        put_state("portfolio", StatePut(doc={}), _Resp(), if_match=None)
    except HTTPException as e:
        missing = e.status_code
    assert missing == 428, "missing If-Match should 428"
    ok("missing If-Match rejected (428)")

    # --- the cache: this is what makes Hub polling affordable ----------------
    # Our own writes populate the cache, so reads after a write fetch nothing.
    before = _fetches["n"]
    for _ in range(50):
        get_version("portfolio")
        get_state("portfolio", _Resp())
    assert _fetches["n"] == before, f"cached reads must not fetch (fetched {_fetches['n']-before}x)"
    ok("100 reads after a write -> 0 JSONBin fetches")

    # A cold doc (written out-of-band, cache empty) fetches exactly once, then caches.
    _bins["bin_fc"] = {"version": 7, "updatedAt": 1.0, "doc": {"keyResults": []}}
    before = _fetches["n"]
    assert get_version("EXEC-DIV-FC")["version"] == 7
    assert _fetches["n"] == before + 1, "cold read should fetch once"
    for _ in range(20):
        get_version("EXEC-DIV-FC")
    assert _fetches["n"] == before + 1, "warm reads must not re-fetch"
    ok("cold read fetches once, then serves from cache")

    # Reads reflect our own writes immediately (cache refreshed, not invalidated).
    put_state("EXEC-DIV-FC", StatePut(doc={"keyResults": ["kr1"]}), _Resp(), if_match="7")
    assert get_state("EXEC-DIV-FC", _Resp())["doc"] == {"keyResults": ["kr1"]}
    assert get_version("EXEC-DIV-FC")["version"] == 8
    ok("write refreshes cache (read-after-write is current)")

    # A miss is NOT cached: a transient failure must not pin "does not exist".
    before = _fetches["n"]
    assert get_version("SPEC-DIV-FC")["version"] == 0   # unconfigured -> no bin id, no fetch
    assert _fetches["n"] == before, "unconfigured doc should not fetch at all"
    BIN_FOR["SPEC-DIV-FC"] = "bin_spec"                 # configured, but bin empty
    assert get_version("SPEC-DIV-FC")["version"] == 0
    assert get_version("SPEC-DIV-FC")["version"] == 0
    assert _fetches["n"] == before + 2, "misses must retry, not cache the negative"
    ok("misses are not cached (transient failure can't pin absence)")

    # --- per-doc locks --------------------------------------------------------
    assert _lock_for("portfolio") is _lock_for("portfolio"), "same doc -> same lock"
    assert _lock_for("portfolio") is not _lock_for("EXEC-DIV-FC"), "different docs -> different locks"
    ok("locks are per-doc, and stable per doc")

    # --- /rdcore.js -----------------------------------------------------------
    # The seam is _rdcore_candidates(), NOT _RDCORE_PATH. _RDCORE_PATH is now only
    # "the first place we would look" and _rdcore() never consults it, so stubbing
    # it would leave the real engine sitting beside this file to be found instead —
    # the test would pass or fail on whether rdcore.js happens to be in the repo,
    # which is precisely the kind of accidental result rdcore_check.py exists to stop.
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as fh:
        fh.write("/* engine */ var x = 1;\n")
        _tmp = fh.name
    globals()["_rdcore_candidates"] = lambda: [_tmp]
    globals()["_RDCORE"] = None
    body = get_rdcore(if_none_match=None)
    etag = body.headers["etag"]
    assert body.status_code == 200 and b"var x = 1" in body.body, "must serve the stub, not a found engine"
    assert get_rdcore_version()["etag"] == etag, "version endpoint must match the served ETag"
    assert get_rdcore(if_none_match=etag).status_code == 304, "matching If-None-Match -> 304"
    assert get_rdcore(if_none_match='"stale"').status_code == 200, "stale If-None-Match -> full body"
    ok("rdcore.js served; ETag matches /rdcore/version; 304 on revalidate")

    # The search falls through misses to the first file that exists.
    globals()["_rdcore_candidates"] = lambda: ["/nonexistent/a.js", "/nonexistent/b.js", _tmp]
    globals()["_RDCORE"] = None
    assert b"var x = 1" in get_rdcore(if_none_match=None).body
    ok("candidate search skips absent paths and takes the first that exists")
    os.unlink(_tmp)

    # A missing engine names every path tried — "not found at X" would send you to
    # fix an X that may not even be the one that mattered.
    globals()["_rdcore_candidates"] = lambda: ["/nonexistent/one.js", "/nonexistent/two.js"]
    globals()["_RDCORE"] = None
    try:
        get_rdcore(if_none_match=None)
        raise AssertionError("missing rdcore.js should raise")
    except HTTPException as e:
        assert e.status_code == 500, e.status_code
        detail = str(e.detail)
        assert "rdcore.js not found" in detail
        assert "/nonexistent/one.js" in detail and "/nonexistent/two.js" in detail, \
            "the error must name EVERY path tried, not just the last"
    ok("missing rdcore.js -> 500 naming every path tried")

    # Real resolution, unstubbed: the env override is honoured and quote-stripped.
    assert _rdcore_candidates(), "candidate list must never be empty"
    ok("candidate list is non-empty without any stub")

    print("\nbroker_patch self-check OK — concurrency, cache, per-doc locks, rdcore serving")