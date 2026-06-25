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
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel

state_router = APIRouter()
_LOCK = threading.RLock()

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
_DOC_IDS = ["portfolio", "gantt-view"] + [f"EXEC-{d}" for d in _DIVISIONS]


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
    """Return the stored wrapper for a doc, or None if the bin is unset/empty/new."""
    bin_id = BIN_FOR.get(doc_id)
    if not bin_id:
        return None
    resp = _jsonbin_get(bin_id)
    if not resp:
        return None
    record = resp.get("record")  # JSONBin returns the stored payload under "record"
    return record if isinstance(record, dict) and "version" in record else None


def _save_raw(doc_id: str, wrapped: Dict[str, Any]) -> None:
    bin_id = BIN_FOR.get(doc_id)
    if not bin_id:
        raise RuntimeError(
            f"no bin id configured for doc '{doc_id}' — set env var {_env_name(doc_id)} "
            f"(and add the division to UNIFIED_DIVISIONS if it is an EXEC doc)"
        )
    _jsonbin_put(bin_id, wrapped)


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
@state_router.get("/state/{doc_id}/version")
def get_version(doc_id: str):
    """Cheap polling endpoint. 404 if the document does not exist yet."""
    with _LOCK:
        wrapped = _load_raw(doc_id)
    if wrapped is None:
        # A not-yet-created doc reports version 0 so a fresh client can seed it.
        return {"version": 0, "etag": _etag_for(0, doc_id), "updatedAt": None}
    return _version_payload(doc_id, wrapped)


@state_router.get("/state/{doc_id}")
def get_state(doc_id: str, response: Response):
    with _LOCK:
        wrapped = _load_raw(doc_id)
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
    """
    with _LOCK:
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
    # Exercise the route + concurrency logic against an in-memory backend so this
    # runs offline (no JSONBin, no env). The routes resolve _load_raw / _save_raw
    # from module globals at call time, so overriding them here is sufficient.
    _mem: Dict[str, Dict[str, Any]] = {}
    globals()["_load_raw"] = lambda doc_id: _mem.get(doc_id)
    globals()["_save_raw"] = lambda doc_id, wrapped: _mem.__setitem__(doc_id, wrapped)

    class _Resp:
        def __init__(self): self.headers = {}

    # seed (first write of a new doc uses If-Match "0")
    r = put_state("portfolio", StatePut(doc={"divisions": []}), _Resp(), if_match="0")
    assert r["version"] == 1, r
    v = get_version("portfolio")
    assert v["version"] == 1, v
    # stale write rejected
    rejected = False
    try:
        put_state("portfolio", StatePut(doc={"divisions": [1]}), _Resp(), if_match="0")
    except HTTPException as e:
        rejected = e.status_code == 412
    assert rejected, "stale write should 412"
    # correct write accepted
    r2 = put_state("portfolio", StatePut(doc={"divisions": [1]}), _Resp(), if_match=v["etag"])
    assert r2["version"] == 2, r2
    # an unknown / unconfigured doc reads as version 0 (load returns None)
    assert get_version("EXEC-DIV-XX")["version"] == 0
    print("broker_patch self-check OK (route + concurrency logic; storage mocked)")