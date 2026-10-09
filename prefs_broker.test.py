"""
/prefs/{email} on the broker Railway actually runs: broker/broker.py's `app` (CORS and all), which mounts
broker/broker_patch.py's router. Driven over HTTP in-process (FastAPI TestClient); only JSONBin is faked,
at the same seam the self-check fakes it (_jsonbin_get / _jsonbin_put), so the cache, the lock and the
merge under test are the real ones.

Deliberately NOT the root-level broker_patch.py: that copy is not what Railway deploys.
"""
import importlib
import json
import os
import sys
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("RD_SRC") or HERE
BROKER_DIR = next((d for d in (os.path.join(ROOT, "broker"), os.path.join(ROOT, "Broker"), os.path.join(HERE, "broker"))
                   if os.path.exists(os.path.join(d, "broker_patch.py"))), None)
if not BROKER_DIR:
    print("FAIL could not find broker/broker_patch.py (the deployed broker) under " + ROOT)
    sys.exit(1)

os.environ["PREFS_BIN"] = "bin_prefs"
os.environ["ALLOWED_ORIGINS"] = "https://celadynestaller.github.io,https://celadyne.atlassian.net"
sys.path.insert(0, BROKER_DIR)
for m in ("broker", "broker_patch", "broker_core"):
    sys.modules.pop(m, None)
broker = importlib.import_module("broker")
bp = importlib.import_module("broker_patch")
from fastapi.testclient import TestClient  # noqa: E402

out, fails = [], 0


def ok(c, msg):
    global fails
    out.append(("ok   " if c else "FAIL ") + msg)
    if not c:
        fails += 1


ok(os.path.dirname(os.path.abspath(bp.__file__)) == os.path.abspath(BROKER_DIR),
   "the router under test is the deployed broker/broker_patch.py (" + os.path.relpath(bp.__file__, ROOT) + ")")

# ---- fake JSONBin at the broker's own seam ----
BINS = {}
CALLS = {"get": 0, "put": 0}
FAIL = {"get": False, "put": False}


def fake_get(bin_id):
    CALLS["get"] += 1
    if FAIL["get"] or bin_id not in BINS:
        return None                       # what _jsonbin_get returns on any HTTP error
    return {"record": json.loads(json.dumps(BINS[bin_id])), "metadata": {"id": bin_id}}


def fake_put(bin_id, payload):
    CALLS["put"] += 1
    if FAIL["put"]:
        raise urllib.error.URLError("jsonbin down")
    BINS[bin_id] = json.loads(json.dumps(payload))


bp._jsonbin_get = fake_get
bp._jsonbin_put = fake_put


def fresh(seed):
    BINS.clear()
    BINS["bin_prefs"] = seed
    bp._PREFS["w"] = None
    bp.PREFS_BIN = "bin_prefs"
    FAIL["get"] = FAIL["put"] = False


c = TestClient(broker.app, raise_server_exceptions=False)   # a server error is a 500 RESPONSE, as uvicorn sends it
B1 = {"win": 14, "style": "compact"}
B2 = {"win": 3, "style": "cards"}
def stored():
    d = BINS.get("bin_prefs")
    d = d.get("doc") if isinstance(d, dict) else None
    d = d.get("users") if isinstance(d, dict) else None
    return d if isinstance(d, dict) else {}


def body(r):
    try:
        j = r.json()
    except Exception:
        return {}
    return j if isinstance(j, dict) else {}


def prefs(r):
    p = body(r).get("prefs")
    return p if isinstance(p, dict) else {}


def kb(r):
    k = prefs(r).get("kbDone")
    return k if isinstance(k, dict) else {}


def mine(email="corey@x.com", area="kbDone"):
    u = stored().get(email)
    a = u.get(area) if isinstance(u, dict) else None
    return a if isinstance(a, dict) else {}


def bin_version():
    d = BINS.get("bin_prefs")
    return d.get("version") if isinstance(d, dict) else None

# ---- not configured: a clear 503, never a pretend-empty answer ----
fresh({})
bp.PREFS_BIN = None
r = c.get("/prefs/corey@x.com")
ok(r.status_code == 503 and "PREFS_BIN" in r.text, "PREFS_BIN unset: GET answers 503 naming the variable")
ok(c.patch("/prefs/corey@x.com", json={"kbDone": {"B1": B1}}).status_code == 503, "...and PATCH 503s too")

# ---- a fresh bin, either seed ----
for seed, label in (({}, "seeded {}"), ({"version": 0, "updatedAt": None, "doc": {}}, "seeded by create_bins.py")):
    fresh(seed)
    r = c.get("/prefs/corey@x.com")
    ok(r.status_code == 200 and r.json() == {"email": "corey@x.com", "prefs": {}, "version": 0},
       f"a fresh bin ({label}): someone with nothing saved gets 200 and {{}}, not 404")

# ---- write, then read back through the real load path ----
fresh({})
r = c.patch("/prefs/corey@x.com", json={"kbDone": {"B1": B1}})
ok(r.status_code == 200 and prefs(r) == {"kbDone": {"B1": B1}} and body(r).get("version") == 1,
   "PATCH stores the choice and answers with the person's settings (version 1)")
ok(bin_version() == 1 and stored() == {"corey@x.com": {"kbDone": {"B1": B1}}},
   "...as a version-1 wrapper in the prefs bin, keyed by email")
bp._PREFS["w"] = None                      # a restarted broker: nothing in memory
ok(prefs(c.get("/prefs/corey@x.com")) == {"kbDone": {"B1": B1}},
   "after a restart, GET reads back exactly what was written")

# ---- merging ----
c.patch("/prefs/corey@x.com", json={"kbDone": {"B2": B2}})
ok(mine() == {"B1": B1, "B2": B2}, "a second device's change to another board merges in")
c.patch("/prefs/erin@x.com", json={"kbDone": {"B1": {"win": "none", "style": "cards"}}})
ok(mine() == {"B1": B1, "B2": B2} and (mine("erin@x.com").get("B1") or {}).get("win") == "none",
   "another person's settings are their own and leave this person's untouched")
c.patch("/prefs/corey@x.com", json={"kbDone": {"B2": {"win": 30, "style": "cards"}}})
ok((mine().get("B2") or {}).get("win") == 30, "the same board again: the later write wins")
c.patch("/prefs/corey@x.com", json={"other": {"k": 1}})
ok(mine() == {"B1": B1, "B2": {"win": 30, "style": "cards"}} and mine(area="other") == {"k": 1},
   "a new area lands beside kbDone without a broker change, and kbDone is untouched")

# ---- the email is one key however it is typed ----
c.patch("/prefs/COREY%40X.com", json={"kbDone": {"B3": B2}})
ok("B3" in mine() and "COREY@X.com" not in stored(), "a capitalised email is the same person")
ok("B3" in kb(c.get("/prefs/Corey@X.Com")), "...for reads too")
c.patch("/prefs/" + "corey%2Btest%40x.com", json={"kbDone": {"B1": B1}})
ok("corey+test@x.com" in stored(), "a + address survives URL-encoding as the right person")

# ---- deleting ----
c.patch("/prefs/corey@x.com", json={"kbDone": {"B3": None}})
ok("B3" not in mine() and "B1" in mine(), "null deletes a board (a reset to the default is never stored)")
c.patch("/prefs/corey@x.com", json={"other": {"k": None}})
ok("other" not in (stored().get("corey@x.com") or {"other": 1}), "an emptied area is removed, not left as {}")
c.patch("/prefs/corey+test@x.com", json={"kbDone": {"B1": None}})
ok("corey+test@x.com" not in stored(), "an emptied person leaves no record at all")
before = CALLS["put"]
r = c.patch("/prefs/nobody@x.com", json={"kbDone": {"B9": None}})
ok(r.status_code == 200 and prefs(r) == {} and CALLS["put"] == before, "deleting what is not there is a no-op, not a write")

# ---- cheap and safe ----
before, v = CALLS["put"], bin_version()
r = c.patch("/prefs/corey@x.com", json={"kbDone": {"B1": B1}})
ok(CALLS["put"] == before and body(r).get("version") == v, "re-sending what already landed writes nothing and keeps the version")
g = CALLS["get"]
for _ in range(25):
    c.get("/prefs/corey@x.com"); c.get("/prefs/erin@x.com")
ok(CALLS["get"] == g, "50 reads after a write -> 0 JSONBin fetches (the broker is the only writer)")
held = bp._PREFS["w"]
snapshot = json.dumps(held, sort_keys=True)
c.patch("/prefs/corey@x.com", json={"kbDone": {"B4": B2}})
ok(json.dumps(held, sort_keys=True) == snapshot and bp._PREFS["w"] is not held,
   "a write swaps in a new wrapper and never mutates the one a lock-free reader may be holding")

# ---- failures ----
fresh({"version": 4, "updatedAt": 1.0, "doc": {"users": {"erin@x.com": {"kbDone": {"B1": B1}}}, "note": "keep"}})
FAIL["get"] = True
ok(c.get("/prefs/erin@x.com").status_code == 502, "a failed read is a 502 ...")
r = c.patch("/prefs/corey@x.com", json={"kbDone": {"B1": B1}})
ok(r.status_code == 502 and stored() == {"erin@x.com": {"kbDone": {"B1": B1}}},
   "...and a PATCH during it writes nothing — a failed read is never mistaken for an empty bin, which would erase everyone")
FAIL["get"] = False
ok(prefs(c.get("/prefs/erin@x.com")) == {"kbDone": {"B1": B1}}, "...nor cached: the next read gets the real settings")
c.patch("/prefs/corey@x.com", json={"kbDone": {"B2": B2}})
ok((BINS.get("bin_prefs") or {}).get("doc", {}).get("note") == "keep" and bin_version() == 5,
   "other top-level fields in the bin survive a write, and the version counts on from the stored one")
FAIL["put"] = True
r = c.patch("/prefs/corey@x.com", json={"kbDone": {"B2": None}})
ok(r.status_code == 502 and r.headers.get("content-type", "").startswith("application/json"),
   "a failed JSONBin write is a readable 502, not a bare 500")
FAIL["put"] = False
ok(kb(c.get("/prefs/corey@x.com")).get("B2") == B2 and mine().get("B2") == B2,
   "...and the failed write changed nothing, in memory or in the bin")

# ---- validation ----
fresh({})
for bad in ("corey", "corey@x", "@x.com", "a b@x.com", "x" * 250 + "@x.com"):
    ok(c.get("/prefs/" + bad).status_code == 400, f"GET rejects a non-email ({bad[:20]!r})")
ok(c.patch("/prefs/corey", json={"kbDone": {"B1": B1}}).status_code == 400, "PATCH rejects a non-email")
for body, label in (([], "a list"), ({}, "an empty object"), ({"kbDone": [1]}, "an area that is not an object"),
                    ({"1bad": {"k": 1}}, "an area name starting with a digit"), ({"a-b": {"k": 1}}, "an area name with a dash"),
                    ({"kbDone": {"x" * 129: 1}}, "a key over 128 characters")):
    ok(c.patch("/prefs/corey@x.com", json=body).status_code == 400, f"PATCH rejects {label}")
ok(c.patch("/prefs/corey@x.com", json={"kbDone": {"B1": "x" * 2000}}).status_code == 413, "PATCH rejects an oversized value (413)")
ok("bin_prefs" in BINS and BINS["bin_prefs"] == {}, "...and none of the rejected requests wrote anything")
for i in range(20):
    c.patch("/prefs/corey@x.com", json={"kbDone": {f"board-{i:03d}-" + "y" * 80: {"win": 14, "style": "compact", "pad": "z" * 700}}})
r = c.patch("/prefs/corey@x.com", json={"kbDone": {"one-more": {"win": 14, "style": "compact", "pad": "z" * 700}}})
ok(r.status_code == 413, "one person's settings are capped (16 KB) — 413, not an ever-growing bin")
saved_max = bp.PREFS_MAX_USERS
bp.PREFS_MAX_USERS = 2
c.patch("/prefs/erin@x.com", json={"kbDone": {"B1": B1}})
r = c.patch("/prefs/third@x.com", json={"kbDone": {"B1": B1}})
ok(r.status_code == 413 and "third@x.com" not in stored(), "the number of people is capped too")
ok(c.patch("/prefs/erin@x.com", json={"kbDone": {"B2": B2}}).status_code == 200, "...without stopping people already in it")
bp.PREFS_MAX_USERS = saved_max

# ---- the generic /state routes cannot reach this bin ----
r = c.get("/state/prefs")
ok(r.status_code == 404, "GET /state/prefs is not a document")
before = json.dumps(BINS["bin_prefs"], sort_keys=True)
r = c.put("/state/prefs", json={"doc": {}}, headers={"If-Match": "0"})
ok(r.status_code >= 400 and json.dumps(BINS["bin_prefs"], sort_keys=True) == before,
   "PUT /state/prefs cannot overwrite everyone's settings in one go")

# ---- CORS: the browser can actually send the PATCH ----
for origin in ("https://celadynestaller.github.io", "https://celadyne.atlassian.net"):
    r = c.options("/prefs/corey@x.com", headers={"Origin": origin, "Access-Control-Request-Method": "PATCH",
                                                 "Access-Control-Request-Headers": "content-type,authorization"})
    ok(r.status_code == 200 and r.headers.get("access-control-allow-origin") == origin and "PATCH" in r.headers.get("access-control-allow-methods", ""),
       f"a PATCH preflight from {origin} is allowed")
r = c.options("/prefs/corey@x.com", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "PATCH"})
ok(r.headers.get("access-control-allow-origin") is None, "...and one from an unlisted origin is not")

for l in out:
    if l.startswith("FAIL"):
        print(l)
print(f"\n{fails}/{len(out)} FAILED" if fails else f"\nPASS - {len(out)} prefs-broker assertions green")
sys.exit(1 if fails else 0)
