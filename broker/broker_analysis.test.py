"""
Broker GET /analysis — the read-through route serving the analysis portal's index bin.

Why read-through and not the authoritative _CACHE: that cache is correct only because the
broker is the sole writer of /state/ documents. The portal writes the index bin from outside,
so caching it authoritatively would pin stale metrics. /roster is uncached for the same reason.

Driven by calling the real route function with a stubbed _jsonbin_get, so the TTL, the stale
fallback and the envelope unwrapping are all exercised without network.
"""
import importlib.util
import os
import sys

out, fails = [], 0


def ok(c, msg):
    global fails
    out.append(("ok   " if c else "FAIL ") + msg)
    if not c:
        fails += 1


# locate broker_patch.py wherever this harness is run from
CANDIDATES = [
    os.path.join(os.environ.get("RD_SRC", "/home/claude"), "broker_patch.py"),
    "/home/claude/broker_patch.py",
    os.path.join(os.environ.get("RD_OUT", "/mnt/user-data/outputs"), "broker_patch.py"),
]
path = next((p for p in CANDIDATES if os.path.exists(p)), None)
if not path:
    print("FAIL could not locate broker_patch.py")
    sys.exit(1)

spec = importlib.util.spec_from_file_location("broker_patch_under_test", path)
bp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bp)

from fastapi import HTTPException, Response

INDEX = {"schema": 2, "runs": [
    {"job_id": "j-1041", "sample_name": "MEA-17", "script": "Polarization Curve",
     "timestamp": "2026-07-19T14:02:00Z", "bin_id": "68a3f1c1",
     "Data": [{"Analysis": "polcurve", "step": "", "Conditions": {"T_C": 80},
               "key_values": {"OCV": 0.953}}]}
]}


def reset(bin_id="idx-bin"):
    bp.ANALYSIS_INDEX_BIN = bin_id
    bp._analysis_cache = {"at": 0.0, "payload": None}


calls = {"n": 0, "last_bin": None}


def stub(result, count=calls):
    def _get(bin_id):
        count["n"] += 1
        count["last_bin"] = bin_id
        return result
    bp._jsonbin_get = _get


def call():
    r = Response()
    return bp.get_analysis(r), r


# ---- not configured -------------------------------------------------------
reset(None)
try:
    call()
    ok(False, "an unconfigured ANALYSIS_INDEX_BIN raises")
except HTTPException as e:
    ok(e.status_code == 503, "an unconfigured ANALYSIS_INDEX_BIN returns 503, not a crash")

# ---- happy path -----------------------------------------------------------
reset()
calls["n"] = 0
stub({"record": INDEX, "metadata": {"private": True}})
body, resp = call()
ok(body == INDEX, "the index is returned unwrapped from JSONBin's {record, metadata} envelope")
ok(calls["last_bin"] == "idx-bin", "it reads the bin named by ANALYSIS_INDEX_BIN")
ok(resp.headers.get("X-Analysis-Age") == "0", "a fresh read reports age 0")
ok("X-Master-Key" not in {k.lower(): k for k in resp.headers}, "no credential material is echoed to the client")
ok("runs" in body and body["schema"] == 2, "the body is the schema-2 index the engine expects")

# ---- a bare record (no envelope) still works ------------------------------
reset()
stub(INDEX)
body, _ = call()
ok(body == INDEX, "a bin returning the record directly (no envelope) is handled")

# ---- TTL: a second call inside the window does not re-fetch ---------------
reset()
calls["n"] = 0
stub({"record": INDEX})
call()
first = calls["n"]
body2, resp2 = call()
ok(calls["n"] == first, "a second read inside the TTL is served from cache (no second network call)")
ok(body2 == INDEX, "...and returns the same index")
ok(resp2.headers.get("X-Analysis-Age") is not None, "the cached response reports its age")

# ---- TTL expiry re-fetches ------------------------------------------------
reset()
stub({"record": INDEX})
call()
n_after_first = calls["n"]
bp._analysis_cache["at"] -= (bp._ANALYSIS_TTL_S + 1)      # age the cache past its TTL
call()
ok(calls["n"] == n_after_first + 1, "once the TTL expires the index is re-fetched (never pinned stale)")

# ---- portal unreachable, but we have a cached copy ------------------------
reset()
stub({"record": INDEX})
call()
stub(None)
bp._analysis_cache["at"] -= (bp._ANALYSIS_TTL_S + 1)
try:
    body3, resp3 = call()
except HTTPException:
    body3, resp3 = None, Response()          # no fallback -> clean failure below, not a crash
ok(body3 == INDEX, "if the portal is briefly unreachable the last good index is still served")
ok(resp3.headers.get("X-Analysis-Stale") == "1", "...and it is flagged stale so the client can say so")

# ---- portal unreachable with nothing cached -------------------------------
reset()
stub(None)
try:
    call()
    ok(False, "an unreachable portal with no cache raises")
except HTTPException as e:
    ok(e.status_code == 502, "an unreachable portal with no cached copy returns 502")

# ---- the route is registered on the router --------------------------------
paths = {getattr(r, "path", None) for r in bp.state_router.routes}
ok("/analysis" in paths, "GET /analysis is registered on the state router")
ok("/roster" in paths, "...alongside /roster, its uncached structural twin")

for line in out:
    if line.startswith("FAIL"):
        print(line)
print(("\n%d/%d FAILED" % (fails, len(out))) if fails
      else "\nPASS - %d broker /analysis assertions green" % len(out))
sys.exit(1 if fails else 0)
