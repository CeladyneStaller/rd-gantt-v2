"""
test_auth_gate.py — the broker token, the client gate and JSONBin failure handling on the routes the Calm
pages call. Driven over HTTP in-process: FastAPI's TestClient against broker.py's real `app` (CORS and all),
which mounts broker_patch.py's router.

JSONBin is faked at the lowest seam, urllib.request.urlopen, so the real _jsonbin_get / _jsonbin_put —
including the rule "only JSONBin's 404 means missing; anything else is a failure" — are what is under test.
No network: the fake answers only JSONBin-shaped requests, and anything else is recorded and fails the run.
Every credential and bin id here is an obvious fake.

Run: `python3 test_auth_gate.py` (exits non-zero on any failure).
"""
import copy
import importlib
import io
import json
import logging
import os
import socket
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN = "test-token-not-a-secret"
FAKE_KEY = "fake-master-key"
ORIGIN = "https://celadynestaller.github.io"

# Env must be set before importing the broker: bin ids, divisions and CORS origins are read at import.
os.environ.update({
    "BROKER_TOKEN": TOKEN,
    "JSONBIN_MASTER_KEY": FAKE_KEY,
    "UNIFIED_DIVISIONS": "DIV-FC",
    "BIZ_DIVISIONS": "DIV-FIN",
    "PORTFOLIO_BIN": "fake-bin-portfolio",
    "GANTT_VIEW_BIN": "fake-bin-gantt-view",
    "EXEC_DIV_FC_BIN": "fake-bin-exec-fc",
    "SPEC_DIV_FC_BIN": "fake-bin-spec-fc",
    "BIZ_DIV_FIN_BIN": "fake-bin-biz-fin",
    "ORDERS_BIN": "fake-bin-orders",
    "USERS_BIN": "fake-bin-users",
    "ANALYSIS_INDEX_BIN": "fake-bin-analysis",
    "PREFS_BIN": "fake-bin-prefs",
    "ALLOWED_ORIGINS": ORIGIN,
})
os.environ.pop("RD_ALLOWED_CLIENTS", None)

sys.path.insert(0, HERE)
for _m in ("broker", "broker_patch", "broker_core"):
    sys.modules.pop(_m, None)
broker = importlib.import_module("broker")
bp = importlib.import_module("broker_patch")
from fastapi.testclient import TestClient  # noqa: E402

out, fails = [], 0


def ok(cond, msg):
    global fails
    out.append(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        fails += 1


ok(os.path.dirname(os.path.abspath(bp.__file__)) == HERE,
   "the router under test is broker_patch.py beside this file (the deployed copy)")


# ---- capture the broker's log lines (and keep them off the console) ------------
class _Capture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.records = []

    def emit(self, record):
        self.records.append(record)


CAP = _Capture()
_lg = logging.getLogger("uvicorn.error")
_lg.addHandler(CAP)
_lg.setLevel(logging.DEBUG)
_lg.propagate = False


# ---- fake JSONBin at urllib.request.urlopen -------------------------------------
JSONBIN = "https://api.jsonbin.io/v3/b/"


class _Resp(io.BytesIO):
    """What urlopen returns: a readable body that is also a context manager."""

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


class _ResetMidRead(_Resp):
    def read(self, *a):
        raise ConnectionResetError(104, "Connection reset by peer")


def _http_error(code):
    def fail(url):
        raise urllib.error.HTTPError(url, code, "fake", None, io.BytesIO(b'{"message":"fake failure"}'))
    return fail


def _raises(make):
    def fail(url):
        raise make()
    return fail


# Every way a JSONBin read can fail that is NOT "the bin does not exist".
FAILURES = {
    "HTTP 500": _http_error(500),
    "HTTP 502": _http_error(502),
    "HTTP 503": _http_error(503),
    "HTTP 429 (rate limited)": _http_error(429),
    "HTTP 401 (key rejected)": _http_error(401),
    "HTTP 403 (quota)": _http_error(403),
    "HTTP 400": _http_error(400),
    "connect timeout": _raises(lambda: urllib.error.URLError(socket.timeout("timed out"))),
    "read timeout": _raises(lambda: socket.timeout("timed out")),
    "connection refused": _raises(lambda: urllib.error.URLError(ConnectionRefusedError(111, "Connection refused"))),
    "DNS failure": _raises(lambda: urllib.error.URLError(socket.gaierror(-2, "Name or service not known"))),
    "connection reset mid-read": lambda url: _ResetMidRead(b""),
    "a 200 that is not JSON (Cloudflare page)": lambda url: _Resp(b"<html>error code: 1010</html>"),
}


class FakeJSONBin:
    def __init__(self):
        self.bins = {}          # bin id -> stored record
        self.fail = {}          # (method, bin id) -> failure
        self.calls = []         # (method, bin id), in order
        self.unexpected = []    # anything that is not a JSONBin bin read/update

    def urlopen(self, req, data=None, timeout=None, **kw):
        if not isinstance(req, urllib.request.Request):
            self.unexpected.append("urlopen called with a bare URL")
            raise AssertionError("unexpected outbound request")
        url, method = req.full_url, req.get_method()
        hdrs = {k.lower(): v for k, v in req.header_items()}
        if not url.startswith(JSONBIN):
            self.unexpected.append(f"{method} to a non-JSONBin URL")
            raise AssertionError("unexpected outbound request")
        rest = url[len(JSONBIN):]
        if method == "GET" and rest.endswith("/latest"):
            bin_id = rest[:-len("/latest")]
        elif method == "PUT" and "/" not in rest:
            bin_id = rest
        else:
            self.unexpected.append(f"{method} {rest}")
            raise AssertionError("unexpected JSONBin request")
        if hdrs.get("x-master-key") != FAKE_KEY or not hdrs.get("user-agent") or "x-bin-private" in hdrs:
            self.unexpected.append(f"{method} {bin_id}: wrong headers")
        self.calls.append((method, bin_id))
        fail = self.fail.get((method, bin_id))
        if fail:
            return fail(url)
        if bin_id not in self.bins:      # JSONBin answers 404 for a bin that does not exist, read or update
            raise urllib.error.HTTPError(url, 404, "Not Found", None, io.BytesIO(b'{"message":"Bin not found"}'))
        if method == "GET":
            return _Resp(json.dumps({"record": self.bins[bin_id], "metadata": {"id": bin_id}}).encode())
        self.bins[bin_id] = json.loads(req.data.decode("utf-8"))
        return _Resp(json.dumps({"record": self.bins[bin_id], "metadata": {"parentId": bin_id}}).encode())

    def gets(self, bin_id):
        return sum(1 for m, b in self.calls if m == "GET" and b == bin_id)

    def puts(self):
        return sum(1 for m, _ in self.calls if m == "PUT")


FAKE = FakeJSONBin()
urllib.request.urlopen = FAKE.urlopen       # the broker looks this up at call time

PORTFOLIO = {"divisions": [{"id": "DIV-FC", "kind": "rd"}, {"id": "DIV-FIN", "kind": "biz"}],
             "objectives": [{"id": "OBJ-FC-1"}]}
USERS = {"users": [
    {"email": "ada@x.com", "name": "Ada Lovelace", "role": "admin", "orgRole": "cto",
     "pinHash": "fake-hash-1", "salt": "fake-salt-1", "iterations": 200000,
     "leadOf": [], "leadUnits": ["UNIT-TECH"], "leadDivisions": ["DIV-FC"], "disabled": False},
    {"email": "bob@x.com", "role": "user", "orgRole": "lead",
     "pinHash": "fake-hash-2", "salt": "fake-salt-2", "iterations": 200000},
], "schemaVersion": 1}
INDEX = {"schema": 2, "runs": [{"job_id": "j-1", "sample_name": "MEA-1"}]}
PREFS = {"version": 2, "updatedAt": 1.0, "doc": {"users": {"ada@x.com": {"kbDone": {"B1": {"win": 14}}}}}}


def seed():
    FAKE.bins = copy.deepcopy({
        "fake-bin-portfolio": {"version": 3, "updatedAt": 1.0, "doc": PORTFOLIO},
        "fake-bin-gantt-view": {"version": 0, "updatedAt": None, "doc": {}},     # create_bins.py's seed
        "fake-bin-exec-fc": {"version": 5, "updatedAt": 1.0, "doc": {"keyResults": ["KR-1"]}},
        "fake-bin-users": USERS,
        "fake-bin-analysis": INDEX,
        "fake-bin-prefs": PREFS,
    })
    FAKE.fail.clear()
    FAKE.calls.clear()
    bp._CACHE.clear()
    bp._analysis_cache.update({"at": 0.0, "payload": None})
    bp._PREFS["w"] = None


def stored_version(bin_id="fake-bin-portfolio"):
    return (FAKE.bins.get(bin_id) or {}).get("version")


def detail(r):
    try:
        j = r.json()
    except Exception:  # noqa: BLE001
        return None
    return j.get("detail") if isinstance(j, dict) else None


def ddict(r):
    """The detail when it is an object (502 / 412 / 426 bodies), else {} — so a wrong status reports a
    FAIL line instead of crashing the harness."""
    d = detail(r)
    return d if isinstance(d, dict) else {}


c = TestClient(broker.app, raise_server_exceptions=False)   # a server error is a 500 RESPONSE, as uvicorn sends it
AUTH = {"Authorization": "Bearer " + TOKEN}


def put(doc_id="portfolio", body=None, if_match="3", auth=True, origin=None):
    h = dict(AUTH) if auth else {}
    if if_match is not None:
        h["If-Match"] = if_match
    if origin:
        h["Origin"] = origin
    return c.put(f"/state/{doc_id}", headers=h, json=body)


# =============================================================================================
# 1. Route inventory: every route on the router is gated unless it is deliberately open
# =============================================================================================
GATED = {("GET", "/state/{doc_id}"), ("GET", "/state/{doc_id}/version"), ("PUT", "/state/{doc_id}"),
         ("GET", "/roster"), ("GET", "/analysis"), ("GET", "/prefs/{email}"), ("PATCH", "/prefs/{email}")}
OPEN = {("GET", "/rdcore.js"), ("GET", "/rdcore/version")}
gated, open_ = set(), set()
for route in bp.state_router.routes:
    deps = {getattr(d, "dependency", None) for d in getattr(route, "dependencies", [])}
    for m in route.methods:
        (gated if bp.require_token in deps else open_).add((m, route.path))
ok(gated == GATED, f"exactly the seven data routes carry require_token (got {sorted(gated)})")
ok(open_ == OPEN, f"only /rdcore.js and /rdcore/version are open — a new route must be gated or listed here "
                  f"(got {sorted(open_)})")
# (How include_router mounts these differs across FastAPI versions — older ones copy each route keeping its
# class, newer ones wrap the router — so section 7 proves the class is in effect through broker.app itself.)
ok(len(bp.state_router.routes) == len(GATED | OPEN)
   and all(isinstance(r, bp._CorsSafeRoute) for r in bp.state_router.routes),
   "every route on the router uses the CORS-safe route class")

# =============================================================================================
# 2. The broker token on every data route
# =============================================================================================
ROUTES = [
    ("GET", "/state/portfolio", {}),
    ("GET", "/state/portfolio/version", {}),
    ("PUT", "/state/portfolio", {"json": {"doc": {"divisions": []}, "client": "calm-1"}, "headers": {"If-Match": "3"}}),
    ("GET", "/roster", {}),
    ("GET", "/analysis", {}),
    ("GET", "/prefs/ada@x.com", {}),
    ("PATCH", "/prefs/ada@x.com", {"json": {"kbDone": {"B2": {"win": 3}}}}),
]
BAD_AUTH = [
    ("no Authorization header", None),
    ("a wrong token", "Bearer wrong-token"),
    ("the token under another scheme", "Basic " + TOKEN),
    ("a lowercase scheme (same rule as broker.py)", "bearer " + TOKEN),
    ("the bare token", TOKEN),
    ("an empty bearer", "Bearer "),
    ("a non-ASCII token (401, not a 500)", b"Bearer t\xe9st-token"),
]


def call(method, path, kw, authorization=None, extra=None):
    h = dict(kw.get("headers", {}))
    if authorization is not None:
        h["Authorization"] = authorization
    h.update(extra or {})
    return c.request(method, path, headers=h, json=kw.get("json"))


for method, path, kw in ROUTES:
    for label, value in BAD_AUTH:
        seed()
        r = call(method, path, kw, value)
        ok(r.status_code == 401 and detail(r) == "unauthorized" and FAKE.calls == [],
           f"{method} {path} with {label} -> 401 before any JSONBin traffic (got {r.status_code})")
    seed()
    r = call(method, path, kw, "Bearer " + TOKEN)
    ok(r.status_code == 200, f"{method} {path} with the right token -> 200 (got {r.status_code})")

seed()
ok(c.get("/state/portfolio", headers=AUTH).json().get("doc") == PORTFOLIO, "with the token, GET /state returns the doc")
r = put(body={"doc": {"divisions": ["new"]}, "client": "calm-1"}, if_match="3")
ok(r.status_code == 200 and r.json()["version"] == 4 and FAKE.bins["fake-bin-portfolio"]["doc"] == {"divisions": ["new"]},
   "with the token, PUT /state writes through to JSONBin as version 4")
seed()
r = c.patch("/prefs/ada@x.com", headers=AUTH, json={"kbDone": {"B2": {"win": 3}}})
ok(r.status_code == 200 and FAKE.bins["fake-bin-prefs"]["doc"]["users"]["ada@x.com"]["kbDone"].get("B2") == {"win": 3},
   "with the token, PATCH /prefs writes through to JSONBin")
seed()
r = put(body={"doc": {"divisions": []}, "client": "calm-1"}, if_match="3", auth=False)
ok(r.status_code == 401 and stored_version() == 3 and FAKE.puts() == 0, "PUT /state without the token writes nothing")

# ---- BROKER_TOKEN unset: fail closed --------------------------------------------
for unset_as in (None, "   "):
    saved = os.environ.pop("BROKER_TOKEN")
    if unset_as is not None:
        os.environ["BROKER_TOKEN"] = unset_as
    what = "unset" if unset_as is None else "blank"
    for method, path, kw in ROUTES:
        seed()
        r = call(method, path, kw, "Bearer ")       # an empty bearer must not match an empty token
        ok(r.status_code == 500 and detail(r) == "broker token not configured" and FAKE.calls == [],
           f"BROKER_TOKEN {what}: {method} {path} -> 500 'broker token not configured' (fail closed), no JSONBin call")
    ok(c.get("/rdcore.js").status_code == 200 and c.get("/rdcore/version").status_code == 200,
       f"BROKER_TOKEN {what}: the open engine routes still answer")
    os.environ["BROKER_TOKEN"] = saved

# ---- the open routes stay open ------------------------------------------------------
seed()
r = c.get("/rdcore.js")
ok(r.status_code == 200 and "javascript" in r.headers.get("content-type", "") and len(r.content) > 1000,
   "GET /rdcore.js needs no token")
etag = c.get("/rdcore/version").json().get("etag")
ok(bool(etag) and r.headers.get("etag") == etag, "GET /rdcore/version needs no token, and matches the served ETag")
ok(c.get("/rdcore.js", headers={"Authorization": "Bearer wrong-token"}).status_code == 200,
   "...and an unrelated (wrong) Authorization header does not break the open route")
ok(c.get("/rdcore.js", headers={"If-None-Match": etag}).status_code == 304, "...and revalidation still answers 304")
ok(c.get("/health").status_code == 200, "GET /health (broker.py) stays open")
ok(FAKE.calls == [], "the open routes never touch JSONBin")

# =============================================================================================
# 3. The client gate on PUT /state
# =============================================================================================
OUT_OF_DATE = {"reason": "client out of date", "message": "This page is out of date. Reload it to keep working."}
for label, body in [
    ("no client (what an old tab sends)", {"doc": {"x": 1}}),
    ("client null", {"doc": {"x": 1}, "client": None}),
    ("client ''", {"doc": {"x": 1}, "client": ""}),
    ("an unknown client", {"doc": {"x": 1}, "client": "rd-gantt-v2"}),
    ("'CALM-1' (exact match only)", {"doc": {"x": 1}, "client": "CALM-1"}),
    ("' calm-1' (no trimming of the value)", {"doc": {"x": 1}, "client": " calm-1"}),
    ("a number", {"doc": {"x": 1}, "client": 1}),
    ("a list", {"doc": {"x": 1}, "client": ["calm-1"]}),
]:
    seed()
    r = put(body=body, if_match="3")
    ok(r.status_code == 426 and detail(r) == OUT_OF_DATE,
       f"PUT /state with {label} -> 426 'client out of date' (got {r.status_code} {detail(r)!r})")
    ok(FAKE.calls == [] and stored_version() == 3, f"...{label}: refused before any JSONBin read or write")

seed()
ok(put(body={"doc": {}}, if_match="0").status_code == 426, "no client + a stale If-Match -> 426, not 412 (gate first)")
seed()
ok(put(body={"doc": {}}, if_match=None).status_code == 426, "no client + no If-Match -> 426, not 428")
seed()
ok(put(body={"doc": {}}, auth=False).status_code == 401, "no token + no client -> 401 (auth before the gate)")
seed()
ok(put(body={"doc": {}, "client": "calm-1"}, if_match=None).status_code == 428, "calm-1 without If-Match -> 428")
seed()
r = put(body={"doc": {}, "client": "calm-1"}, if_match="0")
ok(r.status_code == 412 and ddict(r).get("currentVersion") == 3, "calm-1 with a stale If-Match -> 412")
seed()
r = put(body={"doc": {"by": "calm"}, "client": "calm-1"}, if_match="3")
ok(r.status_code == 200 and r.json()["version"] == 4 and stored_version() == 4, "client 'calm-1' -> 200, written")
r = put(body={"doc": {"by": "ops"}, "client": "ops"}, if_match=r.json()["etag"])
ok(r.status_code == 200 and r.json()["version"] == 5 and FAKE.bins["fake-bin-portfolio"]["doc"] == {"by": "ops"},
   "client 'ops' -> 200, written (etag form of If-Match)")
ok("client" not in FAKE.bins["fake-bin-portfolio"], "the client id is checked, not stored in the document wrapper")

# ---- RD_ALLOWED_CLIENTS overrides the default ------------------------------------
os.environ["RD_ALLOWED_CLIENTS"] = "calm-2"
seed()
ok(put(body={"doc": {}, "client": "calm-1"}).status_code == 426, "RD_ALLOWED_CLIENTS=calm-2: calm-1 -> 426")
seed()
ok(put(body={"doc": {}, "client": "ops"}).status_code == 426, "...and ops -> 426 (the list replaces the default)")
seed()
ok(put(body={"doc": {}, "client": "calm-2"}).status_code == 200, "...while calm-2 -> 200")
os.environ["RD_ALLOWED_CLIENTS"] = " calm-2 , ops ,"
seed()
ok(put(body={"doc": {}, "client": "ops"}).status_code == 200 and put(body={"doc": {}, "client": "calm-2"},
                                                                     if_match="4").status_code == 200,
   "entries are trimmed and blank entries ignored")
os.environ["RD_ALLOWED_CLIENTS"] = "   "
seed()
ok(put(body={"doc": {}, "client": "calm-1"}).status_code == 200, "a blank RD_ALLOWED_CLIENTS falls back to the default")
os.environ.pop("RD_ALLOWED_CLIENTS")
seed()
ok(put(body={"doc": {}, "client": "rd-gantt"}).status_code == 426 and put(body={"doc": {}, "client": "calm-1"}).status_code == 200,
   "unset again: back to the default calm-1,ops")

# =============================================================================================
# 4. JSONBin read failures are 502 — never "missing" — and are not cached
# =============================================================================================
for label, fail in FAILURES.items():
    seed()
    FAKE.fail[("GET", "fake-bin-portfolio")] = fail
    r = c.get("/state/portfolio", headers=AUTH)
    d = detail(r) or {}
    ok(r.status_code == 502 and isinstance(d, dict) and d.get("reason") == "storage unavailable"
       and d.get("doc") == "portfolio" and bool(d.get("message")),
       f"{label}: GET /state -> 502 'storage unavailable', not 404 (got {r.status_code})")
    v = c.get("/state/portfolio/version", headers=AUTH)
    ok(v.status_code == 502, f"{label}: GET /state/.../version -> 502, not 'version 0' (got {v.status_code})")
    ok("portfolio" not in bp._CACHE, f"{label}: the failure is not cached")
    ok(FAKE_KEY not in r.text + v.text and "fake-bin-" not in r.text + v.text,
       f"{label}: the 502 names neither the bin id nor the key")
    w = put(body={"doc": {}, "client": "calm-1"}, if_match="0")
    ok(w.status_code == 502 and FAKE.puts() == 0 and stored_version() == 3,
       f"{label}: a PUT whose read-before-write fails -> 502, and nothing is written")
    del FAKE.fail[("GET", "fake-bin-portfolio")]
    n = FAKE.gets("fake-bin-portfolio")
    r2 = c.get("/state/portfolio", headers=AUTH)
    ok(r2.status_code == 200 and r2.json()["version"] == 3 and FAKE.gets("fake-bin-portfolio") == n + 1,
       f"{label}: once JSONBin answers, the real doc is read (re-fetched: nothing was cached)")
    ok(put(body={"doc": {}, "client": "calm-1"}, if_match="0").status_code == 412,
       f"{label}: ...so a blank seed (If-Match 0) is refused 412 instead of overwriting version 3")

for label, cause in (("HTTP 500", "JSONBin HTTP 500"), ("HTTP 429 (rate limited)", "JSONBin HTTP 429"),
                     ("read timeout", "JSONBin timed out"), ("connect timeout", "JSONBin timed out"),
                     ("a 200 that is not JSON (Cloudflare page)", "JSONBin sent a body that is not JSON")):
    seed()
    FAKE.fail[("GET", "fake-bin-portfolio")] = FAILURES[label]
    ok(ddict(c.get("/state/portfolio", headers=AUTH)).get("cause") == cause,
       f"the 502 says what failed: {label} -> {cause!r}")
seed()
FAKE.fail[("GET", "fake-bin-portfolio")] = FAILURES["HTTP 500"]
w = put(body={"doc": {}, "client": "calm-1"}, if_match="3")
ok("nothing was saved" in (ddict(w).get("message") or ""), "a refused PUT tells the page that nothing was saved")

# ---- the seam's own contract: None ONLY for a 404, JSONBinError for everything else ----
# (The routes also catch broadly, so they would stay safe even if this slipped; this pins the seam itself.)
seed()
ok(bp._jsonbin_get("fake-bin-does-not-exist") is None, "_jsonbin_get: a JSONBin 404 -> None, the one 'missing'")
for label, fail in FAILURES.items():
    FAKE.fail[("GET", "fake-bin-portfolio")] = fail
    try:
        bp._jsonbin_get("fake-bin-portfolio")
        ok(False, f"_jsonbin_get: {label} must raise")
    except bp.JSONBinError as e:
        ok("fake-bin-" not in str(e) and FAKE_KEY not in str(e), f"_jsonbin_get: {label} -> JSONBinError (secret-free)")
    except Exception as e:  # noqa: BLE001
        ok(False, f"_jsonbin_get: {label} -> JSONBinError (got {type(e).__name__})")
for label in ("HTTP 500", "HTTP 404", "read timeout", "connection refused"):
    FAKE.fail[("PUT", "fake-bin-portfolio")] = FAILURES.get(label) or _http_error(404)
    try:
        bp._jsonbin_put("fake-bin-portfolio", {"version": 9, "updatedAt": 1.0, "doc": {}})
        ok(False, f"_jsonbin_put: {label} must raise")
    except bp.JSONBinError:
        ok(stored_version() == 3, f"_jsonbin_put: {label} -> JSONBinError, bin unchanged")
    except Exception as e:  # noqa: BLE001
        ok(False, f"_jsonbin_put: {label} -> JSONBinError (got {type(e).__name__})")

# ---- a JSONBin answer without a record is a failure too, not "missing" -----------
seed()
FAKE.fail[("GET", "fake-bin-portfolio")] = lambda url: _Resp(b'{"message": "odd"}')
ok(c.get("/state/portfolio", headers=AUTH).status_code == 502, "a 200 without a 'record' -> 502, not 404")

# ---- a genuine "not found" is still missing ------------------------------------------
seed()
del FAKE.bins["fake-bin-exec-fc"]
r = c.get("/state/EXEC-DIV-FC", headers=AUTH)
ok(r.status_code == 404 and detail(r) == "document not found", "JSONBin 404 -> GET /state 404 (genuinely missing)")
v = c.get("/state/EXEC-DIV-FC/version", headers=AUTH)
ok(v.status_code == 200 and v.json()["version"] == 0, "JSONBin 404 -> version 0")
ok("EXEC-DIV-FC" not in bp._CACHE and FAKE.gets("fake-bin-exec-fc") == 2, "a 404 is not cached either")
w = put("EXEC-DIV-FC", body={"doc": {}, "client": "calm-1"}, if_match="0")
ok(w.status_code == 502 and ddict(w).get("reason") == "storage write failed",
   "seeding a doc whose bin is gone fails loudly (502 from the write), it is not silently recreated")
seed()
FAKE.bins["fake-bin-exec-fc"] = {}                           # a bin that exists but holds no wrapper yet
ok(c.get("/state/EXEC-DIV-FC", headers=AUTH).status_code == 404, "a bin holding no wrapper reads as not-yet-created")
w = put("EXEC-DIV-FC", body={"doc": {"keyResults": []}, "client": "calm-1"}, if_match="0")
ok(w.status_code == 200 and w.json()["version"] == 1 and stored_version("fake-bin-exec-fc") == 1,
   "...and a fresh client seeds it with If-Match 0")
seed()
r = c.get("/state/gantt-view", headers=AUTH)
ok(r.status_code == 200 and r.json()["version"] == 0 and r.json()["doc"] == {},
   "create_bins.py's version-0 seed reads as an existing, empty doc (unchanged)")
seed()
r = c.get("/state/SPEC-DIV-XX", headers=AUTH)
ok(r.status_code == 404 and FAKE.calls == [], "an unconfigured doc id is missing with no JSONBin call (unchanged)")
BIZ = c.get("/state/BIZ-DIV-FIN/version", headers=AUTH)
ok(BIZ.status_code == 200 and BIZ.json()["version"] == 0, "a configured BIZ- doc whose bin 404s reads as version 0")

# ---- the customer orders document (November 9): known, its own bin, seeded by the first save ----
seed()
ok("orders" in bp._DOC_IDS and bp._env_name("orders") == "ORDERS_BIN" and bp.BIN_FOR.get("orders") == "fake-bin-orders",
   "orders is a /state document whose bin comes from ORDERS_BIN")
r = c.get("/state/orders", headers=AUTH)
ok(r.status_code == 404 and detail(r) == "document not found", "orders whose bin 404s: GET 404, so a fresh page starts it")
v = c.get("/state/orders/version", headers=AUTH)
ok(v.status_code == 200 and v.json()["version"] == 0, "...and its version reads 0, so polling is quiet")
FAKE.bins["fake-bin-orders"] = {"version": 0, "updatedAt": None, "doc": {}}     # what ONLY=orders create_bins.py makes
bp._CACHE.pop("orders", None)
r = c.get("/state/orders", headers=AUTH)
ok(r.status_code == 200 and r.json()["version"] == 0 and r.json()["doc"] == {}, "create_bins.py's seed reads as an empty orders doc")
w = put("orders", body={"doc": {"v": 1, "seq": 1001, "processes": {}, "orders": {"o-1": {"no": 1001}}}, "client": "calm-1"}, if_match="0")
ok(w.status_code == 200 and w.json()["version"] == 1 and stored_version("fake-bin-orders") == 1,
   "the first save of orders (If-Match 0) writes version 1")
ok(c.get("/state/orders", headers=AUTH).json()["doc"]["orders"]["o-1"]["no"] == 1001, "...and reads back")
w2 = put("orders", body={"doc": {"v": 1}, "client": "calm-1"}, if_match="0")
ok(w2.status_code == 412 and ddict(w2).get("currentVersion") == 1, "a second editor still on version 0 gets 412 (the page merges and saves again)")
w3 = put("orders", body={"doc": {"v": 1}, "client": "calm-0"}, if_match=w.json()["etag"])
ok(w3.status_code == 426, "a page that predates the update can't write orders either (426)")
_orders_bin = bp.BIN_FOR.pop("orders")              # the broker deployed before ORDERS_BIN was set
bp._CACHE.pop("orders", None)
try:
    n = len(FAKE.calls)
    ok(c.get("/state/orders", headers=AUTH).status_code == 404 and len(FAKE.calls) == n,
       "without ORDERS_BIN, orders reads as missing with no JSONBin call")
    w4 = put("orders", body={"doc": {}, "client": "calm-1"}, if_match="0")
    ok(w4.status_code == 500 and "ORDERS_BIN" in str(detail(w4)) and "UNIFIED_DIVISIONS" not in str(detail(w4)),
       "...and a save says which variable to set, without the division hint")
    w5 = put("EXEC-DIV-XX", body={"doc": {}, "client": "calm-1"}, if_match="0")
    ok(w5.status_code == 500 and "EXEC_DIV_XX_BIN" in str(detail(w5)) and "UNIFIED_DIVISIONS" in str(detail(w5)),
       "a division document still gets the division hint")
finally:
    bp.BIN_FOR["orders"] = _orders_bin

# ---- the cache still makes polling free --------------------------------------------
seed()
c.get("/state/portfolio", headers=AUTH)
n = len(FAKE.calls)
for _ in range(20):
    c.get("/state/portfolio/version", headers=AUTH)
    c.get("/state/portfolio", headers=AUTH)
ok(len(FAKE.calls) == n, "40 reads of a warm doc -> 0 JSONBin calls (cache semantics unchanged)")
FAKE.fail[("GET", "fake-bin-portfolio")] = FAILURES["HTTP 503"]
ok(c.get("/state/portfolio", headers=AUTH).status_code == 200, "a warm doc is still served while JSONBin is down")

# =============================================================================================
# 5. JSONBin write failures: 502, and the cache keeps the last confirmed write
# =============================================================================================
for label in ("HTTP 500", "read timeout", "connection refused"):
    seed()
    c.get("/state/portfolio", headers=AUTH)                       # warm: version 3
    FAKE.fail[("PUT", "fake-bin-portfolio")] = FAILURES[label]
    w = put(body={"doc": {"new": 1}, "client": "calm-1"}, if_match="3")
    ok(w.status_code == 502 and ddict(w).get("reason") == "storage write failed",
       f"{label} on the JSONBin PUT -> 502 'storage write failed' (got {w.status_code})")
    r = c.get("/state/portfolio", headers=AUTH)
    ok(r.json().get("version") == 3 and r.json().get("doc") == PORTFOLIO,
       f"{label}: the cache still holds the last confirmed write")
    del FAKE.fail[("PUT", "fake-bin-portfolio")]
    ok(put(body={"doc": {"new": 1}, "client": "calm-1"}, if_match="3").status_code == 200,
       f"{label}: the retry with the same etag lands")

# =============================================================================================
# 6. /roster, /analysis, /prefs: failures are 502, never an empty answer, never cached
# =============================================================================================
seed()
r = c.get("/roster", headers=AUTH)
users = r.json().get("users") or []
by = {u.get("email"): u for u in users}
ok(r.status_code == 200 and set(by) == {"ada@x.com", "bob@x.com"}, "GET /roster lists the users")
ok(by.get("ada@x.com", {}).get("name") == "Ada Lovelace", "a user's name passes through /roster")
ok("name" in by.get("bob@x.com", {}) and by["bob@x.com"]["name"] is None, "...and is null when the bin has none")
ok(all(set(u) == set(bp.ROSTER_FIELDS) for u in users), "every roster entry is exactly the allow-list")
ok(not any(s in r.text for s in ("pinHash", "salt", "iterations", "fake-hash", "fake-salt", '"role"')),
   "no PIN material (or the auth role) crosses the wire")
c.get("/roster", headers=AUTH)
ok(FAKE.gets("fake-bin-users") == 2, "/roster reads through every time (uncached, unchanged)")
for label in ("HTTP 500", "read timeout", "connection refused"):
    seed()
    FAKE.fail[("GET", "fake-bin-users")] = FAILURES[label]
    r = c.get("/roster", headers=AUTH)
    ok(r.status_code == 502 and "users" not in r.json(), f"{label}: GET /roster -> 502, not an empty roster")
seed()
del FAKE.bins["fake-bin-users"]
ok(c.get("/roster", headers=AUTH).status_code == 502, "a missing users bin -> 502 (a roster is never 'empty')")

seed()
r = c.get("/analysis", headers=AUTH)
ok(r.status_code == 200 and r.json() == INDEX, "GET /analysis returns the index")
for label in ("HTTP 500", "read timeout"):
    seed()
    FAKE.fail[("GET", "fake-bin-analysis")] = FAILURES[label]
    r = c.get("/analysis", headers=AUTH)
    ok(r.status_code == 502 and bp._analysis_cache["payload"] is None,
       f"{label}: GET /analysis with nothing cached -> 502, and nothing cached")
seed()
c.get("/analysis", headers=AUTH)
bp._analysis_cache["at"] -= bp._ANALYSIS_TTL_S + 1
FAKE.fail[("GET", "fake-bin-analysis")] = FAILURES["read timeout"]
r = c.get("/analysis", headers=AUTH)
ok(r.status_code == 200 and r.json() == INDEX and r.headers.get("x-analysis-stale") == "1",
   "a timeout past the TTL serves the last good index, flagged stale (unchanged)")

for label in ("HTTP 500", "connect timeout"):
    seed()
    FAKE.fail[("GET", "fake-bin-prefs")] = FAILURES[label]
    ok(c.get("/prefs/ada@x.com", headers=AUTH).status_code == 502, f"{label}: GET /prefs -> 502")
    r = c.patch("/prefs/bob@x.com", headers=AUTH, json={"kbDone": {"B1": {"win": 3}}})
    ok(r.status_code == 502 and FAKE.puts() == 0 and bp._PREFS["w"] is None,
       f"{label}: PATCH /prefs -> 502, nothing written, nothing cached")
    del FAKE.fail[("GET", "fake-bin-prefs")]
    r = c.get("/prefs/ada@x.com", headers=AUTH)
    ok(r.status_code == 200 and r.json()["prefs"] == {"kbDone": {"B1": {"win": 14}}},
       f"{label}: once JSONBin answers, the real settings are read")

# =============================================================================================
# 7. CORS: error responses reach the browser readable
# =============================================================================================
H = {"Origin": ORIGIN}


def acao(r):
    return r.headers.get("access-control-allow-origin")


seed()
r = c.get("/state/portfolio", headers=H)
ok(r.status_code == 401 and acao(r) == ORIGIN, "a 401 carries Access-Control-Allow-Origin")
seed()
r = put(body={"doc": {}}, origin=ORIGIN)
ok(r.status_code == 426 and acao(r) == ORIGIN, "a 426 carries Access-Control-Allow-Origin")
seed()
FAKE.fail[("GET", "fake-bin-portfolio")] = FAILURES["read timeout"]
r = c.get("/state/portfolio", headers={**AUTH, **H})
ok(r.status_code == 502 and acao(r) == ORIGIN, "a 502 from a JSONBin timeout carries Access-Control-Allow-Origin")
r = put(body={"doc": {}, "client": "calm-1"}, if_match="0", origin=ORIGIN)
ok(r.status_code == 502 and acao(r) == ORIGIN, "a refused PUT's 502 carries Access-Control-Allow-Origin")
seed()
FAKE.fail[("PUT", "fake-bin-portfolio")] = FAILURES["HTTP 500"]
r = put(body={"doc": {}, "client": "calm-1"}, if_match="3", origin=ORIGIN)
ok(r.status_code == 502 and acao(r) == ORIGIN, "a failed write's 502 carries Access-Control-Allow-Origin")
seed()
FAKE.fail[("GET", "fake-bin-users")] = FAILURES["HTTP 500"]
r = c.get("/roster", headers={**AUTH, **H})
ok(r.status_code == 502 and acao(r) == ORIGIN, "a /roster 502 carries Access-Control-Allow-Origin")
saved = os.environ.pop("BROKER_TOKEN")
r = c.get("/state/portfolio", headers={**AUTH, **H})
ok(r.status_code == 500 and acao(r) == ORIGIN, "the fail-closed 500 carries Access-Control-Allow-Origin")
os.environ["BROKER_TOKEN"] = saved
r = c.get("/state/portfolio", headers={"Authorization": b"Bearer t\xe9st", **H})
ok(r.status_code == 401 and acao(r) == ORIGIN, "a non-ASCII token is a readable 401, not a CORS-less 500")

# ---- an unexpected error is a readable 500, not a CORS-less one ------------------------
seed()
CAP.records.clear()
FAKE.bins["fake-bin-users"] = {"users": [{"email": "x@y.z", "leadOf": 5}]}     # list(5) -> TypeError
r = c.get("/roster", headers={**AUTH, **H})
ok(r.status_code == 500 and acao(r) == ORIGIN and "internal broker error" in str(detail(r)),
   "an unhandled error inside a route -> JSON 500 WITH Access-Control-Allow-Origin")
ok(any(rec.levelno >= logging.ERROR and rec.exc_info for rec in CAP.records),
   "...and the full traceback is logged server-side")
seed()
FAKE.bins["fake-bin-users"] = ["not", "an", "object"]
r = c.get("/roster", headers={**AUTH, **H})
ok(r.status_code == 500 and acao(r) == ORIGIN, "a users bin of the wrong shape -> readable 500 too")

# ---- preflight: the Calm pages send Authorization on every call, so every call preflights ----
seed()
r = c.options("/state/portfolio", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "PUT",
                                           "Access-Control-Request-Headers": "authorization,content-type,if-match"})
ok(r.status_code == 200 and acao(r) == ORIGIN and "PUT" in r.headers.get("access-control-allow-methods", ""),
   "a PUT preflight with authorization + if-match is allowed without a token")
r = c.options("/roster", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET",
                                  "Access-Control-Request-Headers": "authorization"})
ok(r.status_code == 200 and acao(r) == ORIGIN, "a GET preflight carrying authorization is allowed")
ok(FAKE.calls == [], "preflights never touch JSONBin")

# =============================================================================================
# 8. Nothing secret in the logs, and no request the fake did not expect
# =============================================================================================
logged = "\n".join(CAP.format(rec) for rec in CAP.records)
ok(bool(CAP.records), "the broker logged its storage failures")
ok(FAKE_KEY not in logged and TOKEN not in logged and "fake-bin-" not in logged,
   "no master key, broker token or bin id appears in any log line")
ok(FAKE.unexpected == [], f"the broker made no request the fake JSONBin did not recognise: {FAKE.unexpected}")

for line in out:
    if line.startswith("FAIL"):
        print(line)
print(f"\n{fails}/{len(out)} FAILED" if fails else f"\nPASS - {len(out)} auth-gate assertions green")
sys.exit(1 if fails else 0)
