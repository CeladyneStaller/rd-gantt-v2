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

This file is additive: paste the router into the existing app, or include it with
`app.include_router(state_router)`. Storage here is shown against the existing
JSONBin/broker token model; the version is a monotonically increasing integer and
the etag is its hash. Replace `_load_raw` / `_save_raw` with the broker's existing
bin read/write (kept behind the same threading lock + backoff already in place).
"""

import hashlib
import json
import threading
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request, Response
from pydantic import BaseModel

state_router = APIRouter()

# ---- storage shim ----------------------------------------------------------
# Replace these two with the broker's existing JSONBin/bin accessors. Each stored
# document is wrapped as: { "version": int, "updatedAt": float, "doc": <payload> }.
_LOCK = threading.RLock()
_STORE: Dict[str, Dict[str, Any]] = {}  # in-memory stand-in for the bin layer


def _load_raw(doc_id: str) -> Optional[Dict[str, Any]]:
    return _STORE.get(doc_id)


def _save_raw(doc_id: str, wrapped: Dict[str, Any]) -> None:
    _STORE[doc_id] = wrapped


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
    # Minimal in-process exercise of the concurrency contract, no server needed.
    class _Resp:
        def __init__(self): self.headers = {}

    # seed
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
    print("broker_patch self-check OK")
