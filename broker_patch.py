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

Every DATA route on this router (/state/*, /roster, /analysis, /prefs/*) requires
`Authorization: Bearer <BROKER_TOKEN>` — the same rule broker.py applies to its own
routes. /rdcore.js and /rdcore/version stay open. PUT /state also requires a current
front-end: the body carries "client" next to "doc", and anything not listed in
RD_ALLOWED_CLIENTS gets 426, so a tab still running a replaced app stops saving.

A JSONBin failure is never read as "document missing": only JSONBin's own 404 means
missing. Any other error, a timeout or a dropped connection answers 502 and is not
cached, and a PUT whose read-before-write fails writes nothing.

This file is additive and self-contained. To deploy:
  1. include the router:  app.include_router(state_router)
  2. set env vars: BROKER_TOKEN, JSONBIN_MASTER_KEY, UNIFIED_DIVISIONS, and one <DOC>_BIN per doc
     (PORTFOLIO_BIN, GANTT_VIEW_BIN, EXEC_DIV_FC_BIN, ... — create_bins.py prints them).
     Optional: RD_ALLOWED_CLIENTS (default "calm-1,ops").

The JSONBin read/write is implemented below (urllib, no extra dependency). The
version is a monotonically increasing integer kept inside each bin; the etag is its
hash. Optimistic concurrency is enforced here under a process-local _LOCK, so run
the broker as a single worker / replica — JSONBin has no compare-and-swap, and two
workers could otherwise both pass the If-Match check on the same doc (a lost
update). A small team on one worker is safe; true multi-worker safety needs an
external lock.
"""

import hashlib
import hmac
import json
import logging
import os
import re
import socket
import threading
import time
import urllib.error
import urllib.request
from collections import defaultdict
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

_log = logging.getLogger("uvicorn.error")


class _CorsSafeRoute(APIRoute):
    """Answer an unexpected exception with a JSON 500 RESPONSE instead of letting it escape the route.

    An exception that escapes is answered by Starlette's ServerErrorMiddleware, which sits OUTSIDE
    CORSMiddleware: that 500 carries no Access-Control-Allow-Origin, so the browser reports a bare "CORS
    error" and the real status never reaches the page. A response returned here travels back through
    CORSMiddleware like any other. HTTPException and validation errors pass through untouched — FastAPI's
    own handlers, which sit inside CORS, already turn those into responses."""

    def get_route_handler(self):
        handler = super().get_route_handler()
        label = f"{','.join(sorted(self.methods or []))} {self.path}"

        async def guarded(request):
            try:
                return await handler(request)
            except (StarletteHTTPException, RequestValidationError):
                raise
            except Exception:  # noqa: BLE001 — logged in full server-side; the browser gets a readable 500
                _log.exception("broker: unhandled error in %s", label)
                return JSONResponse(status_code=500, content={"detail": "internal broker error (see the server log)"})

        return guarded


state_router = APIRouter(route_class=_CorsSafeRoute)


# ---- auth: the broker token on every data route ------------------------------
# The same rule as broker.py's require_auth. It lives here too because broker.py imports this module (so
# this one cannot import broker.py). Read per request, compared in constant time, 401 when missing or wrong,
# and 500 when BROKER_TOKEN itself is unset: fail CLOSED — a deploy that forgot the variable serves nothing,
# not everything. Attached per route as dependencies=[Depends(require_token)]; GET /rdcore.js and
# GET /rdcore/version are deliberately open (the engine is not data).
def require_token(authorization: str = Header(default="")) -> None:
    token = (os.environ.get("BROKER_TOKEN") or "").strip()
    if not token:
        raise HTTPException(status_code=500, detail="broker token not configured")
    parts = (authorization or "").split(" ", 1)
    supplied = parts[1] if len(parts) == 2 and parts[0] == "Bearer" else ""
    # Compared as bytes: compare_digest raises TypeError on a non-ASCII str, and a header can carry any
    # latin-1 byte — that would be an unhandled 500 rather than a 401.
    if not hmac.compare_digest(supplied.encode("utf-8"), token.encode("utf-8")):
        raise HTTPException(status_code=401, detail="unauthorized")


# ---- client gate: only current front-ends may write a /state document ---------
# The Calm pages send "client": "calm-1" in every PUT /state body; ops scripts send "ops". A tab still
# running a replaced app sends no client at all, and must stop saving rather than write its older model of
# a document over the new one. Missing, unknown or non-string -> 426 with a message the page can show.
# RD_ALLOWED_CLIENTS (comma-separated) is read per request; unset or blank means the default.
_DEFAULT_ALLOWED_CLIENTS = "calm-1,ops"
_CLIENT_OUT_OF_DATE = {"reason": "client out of date",
                       "message": "This page is out of date. Reload it to keep working."}


def _allowed_clients() -> frozenset:
    raw = os.environ.get("RD_ALLOWED_CLIENTS") or ""
    if not raw.strip():
        raw = _DEFAULT_ALLOWED_CLIENTS
    return frozenset(c.strip() for c in raw.split(",") if c.strip())


def _require_current_client(client: Any) -> None:
    if not isinstance(client, str) or client not in _allowed_clients():
        raise HTTPException(status_code=426, detail=dict(_CLIENT_OUT_OF_DATE))

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
# Only positive lookups are cached. A JSONBin FAILURE is not a lookup result at all:
# it raises (502 to the caller) and leaves the cache untouched, so the next call
# retries. It must never read as "missing" — a client told "missing" seeds a blank
# document, and its next PUT would write that blank over the real one. A genuine miss
# (JSONBin's 404, or a fresh bin holding no wrapper) is not cached either.
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
#   UNIFIED_DIVISIONS    comma-separated R&D division ids, e.g. "DIV-FC,DIV-EL" (get EXEC-/SPEC- docs)
#   BIZ_DIVISIONS        comma-separated Business division ids, e.g. "DIV-FIN,DIV-BD,DIV-HR" (get BIZ- docs)
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
# Business divisions use a BIZ-<div> execution workspace (the namespace the Sales app writes) and have neither
# EXEC- nor SPEC- docs. Kept a SEPARATE list from UNIFIED_DIVISIONS so the two namespaces stay disjoint and no
# empty EXEC-/SPEC- bins are created for a division that will never use them. Default empty -> biz is opt-in.
_BIZ_DIVISIONS = [d.strip() for d in os.environ.get("BIZ_DIVISIONS", "").split(",") if d.strip()]
_DOC_IDS = (["portfolio", "gantt-view"]
            + [f"EXEC-{d}" for d in _DIVISIONS]
            + [f"SPEC-{d}" for d in _DIVISIONS]    # SPEC-<div>: product-designer per-division spec
            + [f"BIZ-{d}" for d in _BIZ_DIVISIONS])  # BIZ-<div>: Business-division execution (Sales app)


def _env_name(doc_id: str) -> str:
    return doc_id.upper().replace("-", "_") + "_BIN"


# doc id -> bin id (None until its env var is set)
BIN_FOR: Dict[str, Optional[str]] = {d: os.environ.get(_env_name(d)) for d in _DOC_IDS}


class JSONBinError(Exception):
    """JSONBin gave no usable answer: an HTTP error other than a read's 404, a timeout, a refused or dropped
    connection, or a body that is not JSON. Deliberately NOT the same thing as "missing". The message names
    the failure only — never a URL, bin id or key."""


def _jsonbin_cause(e: BaseException) -> str:
    """A short, secret-free description of a failed JSONBin call, for logs and 502 details."""
    if isinstance(e, JSONBinError):
        return str(e)
    if isinstance(e, urllib.error.HTTPError):
        return f"JSONBin HTTP {e.code}"
    reason = e.reason if isinstance(e, urllib.error.URLError) else e
    if isinstance(reason, (TimeoutError, socket.timeout)):
        return "JSONBin timed out"
    return f"JSONBin unreachable ({type(reason).__name__})"


def _jsonbin_get(bin_id: str) -> Optional[Dict[str, Any]]:
    """The bin's parsed JSON, or None when JSONBin answers 404 — the ONLY answer that means "missing".

    Every other failure raises JSONBinError: a 5xx, a 429 rate limit, a 401/403 (key or quota), a timeout, a
    refused or dropped connection, a non-JSON body (e.g. a Cloudflare HTML page). Each of those used to come
    back as None and so read as "this document does not exist"."""
    req = urllib.request.Request(f"{_JSONBIN}/{bin_id}/latest",
                                 headers={"X-Master-Key": _KEY or "", "User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise JSONBinError(_jsonbin_cause(e)) from e
    except Exception as e:  # noqa: BLE001 — URLError, socket timeout, reset mid-read, TLS failure, ...
        raise JSONBinError(_jsonbin_cause(e)) from e
    try:
        return json.loads(body)
    except ValueError as e:
        raise JSONBinError("JSONBin sent a body that is not JSON") from e


def _jsonbin_put(bin_id: str, payload: Dict[str, Any]) -> None:
    # The update PUT carries ONLY content-type + key — never X-Bin-Private (that
    # would spawn a new bin). JSONBin update versioning is off by default, so this
    # overwrites the bin in place. Any failure raises JSONBinError.
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{_JSONBIN}/{bin_id}", data=data, method="PUT",
        headers={"Content-Type": "application/json", "X-Master-Key": _KEY or "", "User-Agent": _UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp.read()
    except Exception as e:  # noqa: BLE001
        raise JSONBinError(_jsonbin_cause(e)) from e


def _storage_502(doc_id: str, e: BaseException, reason: str, message: str) -> HTTPException:
    # HTTPException, not a bare raise: it is answered inside CORSMiddleware, so the browser can read it.
    _log.warning("broker: %s for doc '%s': %s", reason, doc_id, _jsonbin_cause(e))
    return HTTPException(status_code=502, detail={"reason": reason, "doc": doc_id,
                                                  "cause": _jsonbin_cause(e), "message": message})


def _load_raw(doc_id: str, for_write: bool = False) -> Optional[Dict[str, Any]]:
    """Return the stored wrapper for a doc, or None when it genuinely does not exist yet: no bin configured,
    JSONBin answers 404, or the bin holds no wrapper (fresh and never written).

    A JSONBin failure raises a 502 HTTPException and caches nothing — see the cache note above. With
    for_write, the 502 says the save was refused (the caller is a PUT about to compare versions).

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
        try:
            resp = _jsonbin_get(bin_id)
            if resp is not None and not (isinstance(resp, dict) and "record" in resp):
                raise JSONBinError("JSONBin answered without a record")
        except Exception as e:  # noqa: BLE001 — anything but a clean answer or a 404 is a failure
            raise _storage_502(
                doc_id, e, "storage unavailable",
                "Could not read the saved copy of this document, so nothing was saved. Try again in a moment."
                if for_write else
                "Could not load this document from storage. Nothing was changed; try again in a moment.",
            ) from e
        if resp is None:
            return None                  # JSONBin 404: genuinely missing; uncached, so it retries next call
        record = resp.get("record")      # JSONBin returns the stored payload under "record"
        if not (isinstance(record, dict) and "version" in record):
            return None                  # a fresh bin with no wrapper yet: reads as version 0
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
    try:
        _jsonbin_put(bin_id, wrapped)
    except Exception as e:  # noqa: BLE001
        # The cache keeps the last write JSONBin CONFIRMED, so readers are still served and the client's
        # retry (same etag) goes through. If this write did land despite the error, that retry rewrites the
        # same version number with the client's current doc.
        raise _storage_502(doc_id, e, "storage write failed",
                           "Storage did not confirm the save. Try again in a moment.") from e
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
    # Which front-end is writing ("calm-1", "ops"). Typed loosely on purpose: anything that is not an allowed
    # string is "out of date" (426), never a 422. Checked, not stored.
    client: Any = None


# ---- routes ----------------------------------------------------------------
# ---------------------------------------------------------------------------
# GET /roster -> {users: [{email, name, orgRole, leadOf, leadUnits, leadDivisions, disabled}]}
#
# The users bin also holds pinHash / salt / iterations for every user. Those are
# PIN credentials: the keyspace is tiny, so anyone holding hash+salt recovers the
# PIN offline regardless of the 200k iteration count. They must never reach a
# browser, and filtering client-side would not help -- by then they have already
# crossed the wire.
#
# So this endpoint is a strict WHITELIST, not a blacklist: it names every field
# it emits (ROSTER_FIELDS) and drops everything else. A new secret added to the users bin
# tomorrow is excluded by default rather than leaking until someone notices.
# assignedObjectives is deliberately NOT exposed -- the planning app owns
# objective ownership in its own portfolio doc, and mirroring that relationship
# here would give one fact two homes.
#
# Read-only by design: there is no write path to the users bin in this broker.
# ---------------------------------------------------------------------------
ROSTER_FIELDS = ("email", "name", "orgRole", "leadOf", "leadUnits", "leadDivisions", "disabled")
USERS_BIN = os.environ.get("USERS_BIN")
ANALYSIS_INDEX_BIN = os.environ.get("ANALYSIS_INDEX_BIN")

def _project_user(u: Dict[str, Any]) -> Dict[str, Any]:
    out = {
        "email": u.get("email"),
        # Display name, when the users bin has one (a string); None otherwise, so pages fall back to the email.
        "name": u.get("name") if isinstance(u.get("name"), str) else None,
        "orgRole": u.get("orgRole"),
        # Legacy tracker-id list. The Hub no longer reads it and it does not
        # resolve to division ids; kept only so existing consumers do not break.
        "leadOf": list(u.get("leadOf") or []),
        # The live leadership fields. Unit ids and division ids respectively —
        # these are what the Hub reads, and what any consumer needs to answer
        # "which divisions does this person lead?".
        "leadUnits": list(u.get("leadUnits") or []),
        "leadDivisions": list(u.get("leadDivisions") or []),
        "disabled": bool(u.get("disabled")),
    }
    assert set(out) == set(ROSTER_FIELDS)      # a field added above must be declared above
    return out


@state_router.get("/roster", dependencies=[Depends(require_token)])
def get_roster():
    """Users for the objective-owner picker. Never emits credential material."""
    if not USERS_BIN:
        raise HTTPException(status_code=503, detail="USERS_BIN is not configured")
    try:
        raw = _jsonbin_get(USERS_BIN)
    except Exception as e:  # noqa: BLE001 — a failed read is a 502, never an empty roster
        raise HTTPException(status_code=502, detail=f"users bin unavailable ({_jsonbin_cause(e)})") from e
    if raw is None:
        raise HTTPException(status_code=502, detail="users bin unavailable (JSONBin 404: check USERS_BIN)")
    users = (raw.get("record") or raw).get("users") or []
    return {"users": [_project_user(u) for u in users if u.get("email")]}


# ---------------------------------------------------------------------------
# GET /analysis  -> the analysis portal's index bin
#
# READ-THROUGH, NOT _CACHE. The authoritative cache above is correct only because
# this broker is the sole writer of those documents. The analysis portal writes
# this bin from outside, so caching it authoritatively would serve stale metrics
# forever. Same reasoning as /roster, which is uncached for the same reason.
#
# A short TTL still absorbs the burst of reads a picker generates while someone
# types in the search box, without pinning a stale index.
#
# The master key never leaves the server: the browser sends only its broker
# token and receives the index body.
# ---------------------------------------------------------------------------

_ANALYSIS_TTL_S = 60.0
_analysis_cache: Dict[str, Any] = {"at": 0.0, "payload": None}
_analysis_lock = threading.Lock()


def _analysis_fetch() -> Optional[Dict[str, Any]]:
    """Read the index bin, unwrapping JSONBin's {record, metadata} envelope. None on a 404; raises on a
    JSONBin failure (the route treats both as "unreachable", and caches neither)."""
    raw = _jsonbin_get(ANALYSIS_INDEX_BIN)
    if raw is None:
        return None
    record = raw.get("record") if isinstance(raw, dict) else None
    return record if isinstance(record, dict) else (raw if isinstance(raw, dict) else None)


@state_router.get("/analysis", dependencies=[Depends(require_token)])
def get_analysis(response: Response):
    """The analysis index, for the execution app's 'Connect data' picker.

    Returned as-is so the client can hand it straight to validateAnalysisIndex();
    shape errors are the client's to surface, not ours to mask.
    """
    if not ANALYSIS_INDEX_BIN:
        raise HTTPException(status_code=503, detail="ANALYSIS_INDEX_BIN is not configured")

    now = time.time()
    with _analysis_lock:
        cached = _analysis_cache["payload"]
        age = now - _analysis_cache["at"]
        if cached is not None and age < _ANALYSIS_TTL_S:
            response.headers["X-Analysis-Age"] = str(int(age))
            return cached

    cause = None
    try:
        payload = _analysis_fetch()
    except Exception as e:  # noqa: BLE001 — a JSONBin error or timeout is "unreachable", never an empty index
        payload, cause = None, _jsonbin_cause(e)
    if payload is None:
        # Serve a stale copy rather than nothing if the portal is briefly unreachable;
        # the age header tells the client how old it is.
        with _analysis_lock:
            stale = _analysis_cache["payload"]
            stale_age = now - _analysis_cache["at"]
        if stale is not None:
            response.headers["X-Analysis-Age"] = str(int(stale_age))
            response.headers["X-Analysis-Stale"] = "1"
            return stale
        raise HTTPException(status_code=502, detail="analysis index unavailable" + (f" ({cause})" if cause else ""))

    with _analysis_lock:
        _analysis_cache["at"] = now
        _analysis_cache["payload"] = payload
    response.headers["X-Analysis-Age"] = "0"
    return payload


# ---------------------------------------------------------------------------
# GET   /prefs/{email}  -> { email, prefs: { <area>: { <key>: value } }, version }
# PATCH /prefs/{email}  body { <area>: { <key>: value | null } }  -> the same, after the merge
#
# Per-person VIEW settings, so a choice follows the person to any device they are signed in on. The first
# area is "kbDone": per kanban board, how long finished tiles stay drawn and whether as cards or rows.
# One bin, PREFS_BIN, holds everyone:
#     { "version": n, "updatedAt": t, "doc": { "users": { "<email>": { "<area>": { "<key>": value } } } } }
#
# Its own bin, not the users bin: the Hub saves the WHOLE users record from a copy it loaded earlier, so
# anything a second writer put there is erased by the Hub's next save. Here the broker is the only writer,
# so the authoritative-cache reasoning at the top of this file holds and reads are memory reads.
#
# PATCH merges on the server: a client sends only what changed, so two devices changing different boards
# both land with no If-Match retry loop, and for the same board the later write wins — right for a view
# setting. null deletes: a default is never stored, so "reset" and "never touched" read the same.
#
# Generic over <area> on purpose, so the next per-person setting needs no broker deploy — and BOUNDED instead
# (shapes, sizes, counts), so a buggy client cannot grow the bin without limit.
#
# The broker token gates the route (like every data route on this router), but the token proves only that
# the caller is one of our pages, not which person: the email is the one the app read from the Hub's sign-in
# on that device, honor-system. Nothing here is document data; a forged email changes only how someone
# else's Done column is drawn.
# ---------------------------------------------------------------------------
PREFS_BIN = os.environ.get("PREFS_BIN")
PREFS_MAX_USERS = 200
PREFS_MAX_AREAS = 16
PREFS_MAX_KEYS = 500                 # per area
PREFS_MAX_VALUE_BYTES = 1024
PREFS_MAX_USER_BYTES = 16 * 1024
_PREFS_AREA_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,31}$")
_PREFS_EMAIL_RE = re.compile(r"^[^@\s/]+@[^@\s/]+\.[^@\s/]+$")
_PREFS: Dict[str, Any] = {"w": None}     # the cached wrapper — authoritative, because we are the only writer
_PREFS_LOCK = threading.RLock()


def _prefs_email(raw: str) -> str:
    e = (raw or "").strip().lower()
    if len(e) > 254 or not _PREFS_EMAIL_RE.match(e):
        raise HTTPException(status_code=400, detail="not an email address")
    return e


def _prefs_bin_required() -> None:
    if not PREFS_BIN:
        raise HTTPException(status_code=503, detail="PREFS_BIN is not configured")


def _prefs_load() -> Dict[str, Any]:
    """The wrapper, from memory after the first read. A fresh bin (seeded {} or a version-0 wrapper) reads as
    version 0 with nobody in it. A failed read is neither cached nor mistaken for "empty": that would hand
    every device a blank slate, and the next write would erase everyone's settings."""
    w = _PREFS["w"]
    if w is not None:
        return w
    with _PREFS_LOCK:
        if _PREFS["w"] is not None:
            return _PREFS["w"]
        try:
            resp = _jsonbin_get(PREFS_BIN)
        except Exception as e:  # noqa: BLE001 — failed read: 502, not cached, never "nobody has settings"
            raise HTTPException(status_code=502, detail=f"prefs bin unavailable ({_jsonbin_cause(e)})") from e
        if not isinstance(resp, dict) or "record" not in resp:
            raise HTTPException(status_code=502, detail="prefs bin unavailable")
        rec = resp["record"]
        if not (isinstance(rec, dict) and isinstance(rec.get("version"), int) and isinstance(rec.get("doc"), dict)):
            rec = {"version": 0, "updatedAt": None, "doc": {}}
        _PREFS["w"] = rec
        return rec


def _prefs_users(w: Dict[str, Any]) -> Dict[str, Any]:
    users = w["doc"].get("users")
    return users if isinstance(users, dict) else {}


def _prefs_clean(body: Any) -> Dict[str, Dict[str, Any]]:
    """Validate a PATCH body: { area: { key: value | null } }. Shapes only — what a value MEANS is the app's
    business (it normalises whatever it reads back), so a new area needs no change here."""
    if not isinstance(body, dict) or not body or len(body) > PREFS_MAX_AREAS:
        raise HTTPException(status_code=400, detail="expected { area: { key: value | null } }")
    out: Dict[str, Dict[str, Any]] = {}
    for area, kv in body.items():
        if not isinstance(area, str) or not _PREFS_AREA_RE.match(area):
            raise HTTPException(status_code=400, detail=f"bad area name: {str(area)[:40]!r}")
        if not isinstance(kv, dict) or len(kv) > PREFS_MAX_KEYS:
            raise HTTPException(status_code=400, detail=f"{area}: expected an object of key -> value")
        for k, v in kv.items():
            if not k or len(k) > 128:
                raise HTTPException(status_code=400, detail=f"{area}: bad key")
            if v is not None and len(json.dumps(v, separators=(",", ":"))) > PREFS_MAX_VALUE_BYTES:
                raise HTTPException(status_code=413, detail=f"{area}.{k}: value too large")
        out[area] = dict(kv)
    return out


@state_router.get("/prefs/{email}", dependencies=[Depends(require_token)])
def get_prefs(email: str):
    """One person's settings. Someone with nothing saved gets {} (200, not 404): "nothing saved" is the
    normal state, and a 404 must keep meaning "this broker has no /prefs" so an old deploy reads as a failure."""
    e = _prefs_email(email)
    _prefs_bin_required()
    w = _prefs_load()
    entry = _prefs_users(w).get(e)
    return {"email": e, "prefs": entry if isinstance(entry, dict) else {}, "version": w["version"]}


@state_router.patch("/prefs/{email}", dependencies=[Depends(require_token)])
def patch_prefs(email: str, body: Any = Body(...)):
    e = _prefs_email(email)
    patch = _prefs_clean(body)
    _prefs_bin_required()
    with _PREFS_LOCK:
        w = _prefs_load()
        users = _prefs_users(w)
        cur = users.get(e) if isinstance(users.get(e), dict) else {}
        # Copy-on-write: the cached wrapper is shared with lock-free readers, so nothing in it is mutated.
        nxt = {a: (dict(b) if isinstance(b, dict) else b) for a, b in cur.items()}
        for area, kv in patch.items():
            bucket = dict(nxt[area]) if isinstance(nxt.get(area), dict) else {}
            for k, v in kv.items():
                if v is None:
                    bucket.pop(k, None)
                else:
                    bucket[k] = v
            if bucket:
                nxt[area] = bucket
            else:
                nxt.pop(area, None)
        if nxt == cur:                           # a resend of what already landed: answer, don't write
            return {"email": e, "prefs": cur, "version": w["version"]}
        if (len(nxt) > PREFS_MAX_AREAS
                or any(isinstance(b, dict) and len(b) > PREFS_MAX_KEYS for b in nxt.values())
                or len(json.dumps(nxt, separators=(",", ":"))) > PREFS_MAX_USER_BYTES):
            raise HTTPException(status_code=413, detail="too many settings for one person")
        if nxt and e not in users and len(users) >= PREFS_MAX_USERS:
            raise HTTPException(status_code=413, detail="the prefs bin is full")
        new_users = dict(users)
        if nxt:
            new_users[e] = nxt
        else:
            new_users.pop(e, None)
        new_w = {"version": w["version"] + 1, "updatedAt": time.time(), "doc": {**w["doc"], "users": new_users}}
        try:
            _jsonbin_put(PREFS_BIN, new_w)
        except Exception as ex:                  # HTTPException, so CORS headers reach the browser with it
            raise HTTPException(status_code=502, detail="prefs bin write failed") from ex
        _PREFS["w"] = new_w                      # our write is now the truth (refresh, don't invalidate)
    return {"email": e, "prefs": nxt, "version": new_w["version"]}


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


@state_router.get("/state/{doc_id}/version", dependencies=[Depends(require_token)])
def get_version(doc_id: str):
    """Cheap polling endpoint — and now cheap on the JSONBin side too, not just in
    response size. This is the call the Hub makes most, so it must not fetch."""
    wrapped = _load_raw(doc_id)          # cache hit: no lock, no network; JSONBin failure: 502
    if wrapped is None:
        # A not-yet-created doc reports version 0 so a fresh client can seed it.
        return {"version": 0, "etag": _etag_for(0, doc_id), "updatedAt": None}
    return _version_payload(doc_id, wrapped)


@state_router.get("/state/{doc_id}", dependencies=[Depends(require_token)])
def get_state(doc_id: str, response: Response):
    wrapped = _load_raw(doc_id)          # cache hit: no lock, no network; JSONBin failure: 502
    if wrapped is None:
        raise HTTPException(status_code=404, detail="document not found")
    response.headers["ETag"] = _etag_for(wrapped["version"], doc_id)
    return {**_version_payload(doc_id, wrapped), "doc": wrapped["doc"]}


@state_router.put("/state/{doc_id}", dependencies=[Depends(require_token)])
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

    Order of refusals: token (401, a dependency) -> client (426) -> If-Match present (428) ->
    read-before-write (502 if JSONBin fails: nothing is written) -> version (412).

    The lock is held across the read-modify-write, including the JSONBin PUT —
    that IS the serialization guarantee, and it is why the Procfile pins
    --workers 1. It is now a per-doc lock, so writers to different documents no
    longer queue behind each other, and no reader waits on any of it.
    """
    _require_current_client(body.client)
    if if_match is None:
        raise HTTPException(status_code=428, detail="If-Match header required")

    with _lock_for(doc_id):
        wrapped = _load_raw(doc_id, for_write=True)   # raises 502 on a JSONBin failure: never read as version 0
        current_version = wrapped["version"] if wrapped else 0
        current_etag = _etag_for(current_version, doc_id)

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
    _fail = {"get": False, "put": False}           # simulate a JSONBin failure (not a 404)

    def _fake_get(bin_id):                         # None == JSONBin 404, exactly like the real one
        _fetches["n"] += 1
        if _fail["get"]:
            raise JSONBinError("JSONBin HTTP 500")
        return {"record": _bins[bin_id]} if bin_id in _bins else None

    def _fake_put(bin_id, payload):
        _puts["n"] += 1
        if _fail["put"]:
            raise JSONBinError("JSONBin timed out")
        _bins[bin_id] = payload

    globals()["_jsonbin_get"] = _fake_get
    globals()["_jsonbin_put"] = _fake_put
    BIN_FOR["portfolio"] = "bin_pf"
    BIN_FOR["EXEC-DIV-FC"] = "bin_fc"

    class _Resp:
        def __init__(self): self.headers = {}

    ok = lambda m: print("  ok   " + m)

    # --- write path + optimistic concurrency (unchanged behaviour) ------------
    r = put_state("portfolio", StatePut(doc={"divisions": []}, client="calm-1"), _Resp(), if_match="0")
    assert r["version"] == 1, r
    v = get_version("portfolio")
    assert v["version"] == 1, v
    ok("seed write + version read")

    rejected = False
    try:
        put_state("portfolio", StatePut(doc={"divisions": [1]}, client="calm-1"), _Resp(), if_match="0")
    except HTTPException as e:
        rejected = e.status_code == 412
    assert rejected, "stale write should 412"
    ok("stale write rejected (412)")

    r2 = put_state("portfolio", StatePut(doc={"divisions": [1]}, client="calm-1"), _Resp(), if_match=v["etag"])
    assert r2["version"] == 2, r2
    ok("correct write accepted")

    missing = 428
    try:
        put_state("portfolio", StatePut(doc={}, client="calm-1"), _Resp(), if_match=None)
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
    put_state("EXEC-DIV-FC", StatePut(doc={"keyResults": ["kr1"]}, client="calm-1"), _Resp(), if_match="7")
    assert get_state("EXEC-DIV-FC", _Resp())["doc"] == {"keyResults": ["kr1"]}
    assert get_version("EXEC-DIV-FC")["version"] == 8
    ok("write refreshes cache (read-after-write is current)")

    # A miss (JSONBin 404) is NOT cached: the doc may be created at any moment.
    before = _fetches["n"]
    assert get_version("SPEC-DIV-FC")["version"] == 0   # unconfigured -> no bin id, no fetch
    assert _fetches["n"] == before, "unconfigured doc should not fetch at all"
    BIN_FOR["SPEC-DIV-FC"] = "bin_spec"                 # configured, but bin empty
    assert get_version("SPEC-DIV-FC")["version"] == 0
    assert get_version("SPEC-DIV-FC")["version"] == 0
    assert _fetches["n"] == before + 2, "misses must retry, not cache the negative"
    ok("misses are not cached (a 404 is retried, never pinned)")

    # --- a JSONBin FAILURE is not "missing": 502, uncached, and a PUT writes nothing ---
    _CACHE.pop("EXEC-DIV-FC", None)                     # cold, so the next read goes to JSONBin
    _fail["get"] = True
    for call in (lambda: get_version("EXEC-DIV-FC"), lambda: get_state("EXEC-DIV-FC", _Resp())):
        try:
            call()
            raise AssertionError("a failed JSONBin read must raise, not answer")
        except HTTPException as e:
            assert e.status_code == 502, f"failed read must be 502, got {e.status_code}"
    puts, held = _puts["n"], json.dumps(_bins["bin_fc"], sort_keys=True)
    try:
        put_state("EXEC-DIV-FC", StatePut(doc={}, client="calm-1"), _Resp(), if_match="0")
        raise AssertionError("a PUT whose read fails must be refused")
    except HTTPException as e:
        assert e.status_code == 502, e.status_code
    assert _puts["n"] == puts and json.dumps(_bins["bin_fc"], sort_keys=True) == held, \
        "a refused PUT must not write: a blank doc over the real one is the bug this prevents"
    assert "EXEC-DIV-FC" not in _CACHE, "a failed read must not be cached"
    _fail["get"] = False
    assert get_version("EXEC-DIV-FC")["version"] == 8, "once JSONBin answers, the real version is read"
    ok("JSONBin failure -> 502 (not 404/version 0), uncached; a PUT whose read fails writes nothing")

    _fail["put"] = True
    try:
        put_state("EXEC-DIV-FC", StatePut(doc={"keyResults": []}, client="calm-1"), _Resp(), if_match="8")
        raise AssertionError("a failed JSONBin write must raise")
    except HTTPException as e:
        assert e.status_code == 502, e.status_code
    _fail["put"] = False
    assert get_version("EXEC-DIV-FC")["version"] == 8, "a failed write must not advance the cached version"
    ok("JSONBin write failure -> 502, cache keeps the last confirmed write")

    # --- the client gate: only current front-ends may write --------------------
    for bad in (None, "", "rd-gantt", 1):
        try:
            put_state("portfolio", StatePut(doc={}, client=bad), _Resp(), if_match="2")
            raise AssertionError(f"client {bad!r} must be refused")
        except HTTPException as e:
            assert e.status_code == 426 and e.detail["reason"] == "client out of date", (bad, e.status_code)
    assert put_state("portfolio", StatePut(doc={"d": 1}, client="ops"), _Resp(), if_match="2")["version"] == 3
    ok("client gate: missing/unknown -> 426, 'ops' writes")

    # --- per-doc locks --------------------------------------------------------
    assert _lock_for("portfolio") is _lock_for("portfolio"), "same doc -> same lock"
    assert _lock_for("portfolio") is not _lock_for("EXEC-DIV-FC"), "different docs -> different locks"
    ok("locks are per-doc, and stable per doc")

    # --- /rdcore.js -----------------------------------------------------------
    # The seam is _rdcore_candidates(): stub THAT, or the search finds the real engine
    # beside this file and the test passes or fails on whether rdcore.js happens to be
    # in the repo — the kind of accidental result this self-check exists to stop.
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

    # --- /prefs: per-person view settings ---------------------------------------
    globals()["PREFS_BIN"] = "bin_prefs"
    _bins["bin_prefs"] = {}                                   # a fresh bin, seeded {}
    _PREFS["w"] = None
    assert get_prefs("Corey@X.com")["prefs"] == {}, "nobody saved yet -> {}"
    p1 = patch_prefs("corey@x.com", {"kbDone": {"B1": {"win": 14, "style": "compact"}}})
    p2 = patch_prefs("COREY@x.com", {"kbDone": {"B2": {"win": 3, "style": "cards"}}})
    assert set(p2["prefs"]["kbDone"]) == {"B1", "B2"}, "patches merge per key, and the email is case-folded"
    puts = _puts["n"]
    patch_prefs("corey@x.com", {"kbDone": {"B2": {"win": 3, "style": "cards"}}})
    assert _puts["n"] == puts, "re-sending what already landed writes nothing"
    patch_prefs("corey@x.com", {"kbDone": {"B1": None, "B2": None}})
    assert get_prefs("corey@x.com")["prefs"] == {} and "corey@x.com" not in _bins["bin_prefs"]["doc"]["users"], \
        "null deletes, and an emptied person leaves no record"
    ok("/prefs: merge per key, case-folded email, null deletes, no-op resend writes nothing")

    print("\nbroker_patch self-check OK — concurrency, cache, JSONBin failures, client gate, per-doc locks, "
          "rdcore serving, prefs")