#!/usr/bin/env python3
"""
fakebin.py: an in-memory JSONBin (API v3), so the REAL broker can run offline in tests.

The broker reaches JSONBin two ways, and neither is patched here: broker_patch.py (/state, /roster,
/analysis, /prefs) calls urllib.request.urlopen, and broker.py (the older tracker routes) calls requests.
Instead, fakebin emulates JSONBin at the HTTP level:

  FakeJSONBin       keeps bins in memory, as JSON text (a stored record can never alias a live object),
                    and answers the JSONBin v3 calls with JSONBin's own refusals.
  FakeBinServer     serves that API over real HTTP on 127.0.0.1, so the broker gets genuine HTTPError,
                    timeout and connection-reset behaviour from its own client library; it also serves
                    the test-only /__admin API (Admin below; broker_up.py adds broker-aware routes).
  install_redirect  points the HTTP clients at that server: urllib's urlopen and requests'
                    HTTPAdapter.send rewrite https://api.jsonbin.io/... to it and refuse every other
                    non-loopback host, and socket.getaddrinfo refuses non-loopback names, so nothing in
                    the process can reach the network, even through a client this file does not know.

JSONBin behaviour emulated
  GET    /v3/b/<id>/latest, /v3/b/<id>   {"record": <stored>, "metadata": {...}}; with X-Bin-Meta: false,
                                          the bare record (broker.py sends that; broker_patch.py does not)
  PUT    /v3/b/<id>                       replaces the record: {"record": ..., "metadata": {"parentId": ...}}
  POST   /v3/b                            creates a bin (X-Bin-Name), like create_bins.py
  DELETE /v3/b/<id>
  401 without the right X-Master-Key; 404 for an unknown bin; 400 for a PUT that is not
  application/json, is empty, or is not strict JSON (NaN and Infinity are refused); 403
  "error code: 1010" for the default Python-urllib User-Agent (Cloudflare's block, the reason
  broker_patch.py sends its own UA).

Faults, per bin (or "*" for every bin), optionally only for reads or writes, and only for the next N:
  status   answer with that HTTP status (500, 502, 429, 404, ...) and a JSONBin-style {"message"}
  timeout  hold the request without answering until recovered (or `hang` seconds pass, then drop it).
           The client gives up after its own timeout, or after `after` seconds when given (the redirect
           lowers the client's timeout for that bin only), so a timeout test need not wait 10 s.
  drop     close the connection without a response
  slow     answer normally, after `delay` seconds

Self-test (no broker needed):  python3 fakebin.py --selftest
"""

import collections
import itertools
import json
import re
import socket
import socketserver
import sys
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

JSONBIN_HOST = "api.jsonbin.io"
_LOOPBACK = {"", "localhost", "127.0.0.1", "::1", "ip6-localhost", "ip6-loopback", "0.0.0.0", "::"}


def is_loopback(host):
    if host is None:
        return True
    if isinstance(host, (bytes, bytearray)):
        host = host.decode("ascii", "replace")
    h = str(host).strip("[]").lower()
    return h in _LOOPBACK or h.startswith("127.") or h.endswith(".localhost")


def _reject_constant(name):
    raise ValueError(f"{name} is not valid JSON")


def loads_strict(data):
    """JSON the way JSONBin accepts it: no NaN / Infinity."""
    if isinstance(data, (bytes, bytearray)):
        data = data.decode("utf-8")
    return json.loads(data, parse_constant=_reject_constant)


def dumps_strict(obj):
    return json.dumps(obj, allow_nan=False, ensure_ascii=False, separators=(",", ":"))


def _iso(ts):
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(ts)) + ".%03dZ" % int((ts % 1) * 1000)


# --------------------------------------------------------------------------- faults
class Fault:
    _ids = itertools.count(1)
    MODES = ("status", "timeout", "drop", "slow")

    def __init__(self, target, mode="status", status=500, ops="all", times=None, delay=0.0,
                 after=None, hang=60.0, body=None):
        if isinstance(mode, int) or (isinstance(mode, str) and mode.isdigit()):
            status, mode = int(mode), "status"
        if mode not in self.MODES:
            raise ValueError(f"unknown fault mode {mode!r} (use one of {', '.join(self.MODES)}, or an HTTP status)")
        if ops not in ("all", "read", "write"):
            raise ValueError("ops must be 'all', 'read' or 'write'")
        self.id = next(Fault._ids)
        self.target = target
        self.mode = mode
        self.status = int(status)
        self.ops = ops
        self.times = None if times is None else int(times)
        self.delay = float(delay or 0)
        self.after = None if after is None else float(after)
        self.hang = float(hang if hang is not None else 60.0)
        self.body = body
        self.used = 0
        self.released = threading.Event()     # set by recover(); a request held by "timeout" then answers

    def matches(self, op):
        return self.ops == "all" or self.ops == op

    def to_json(self):
        return {"id": self.id, "target": self.target, "mode": self.mode,
                "status": self.status if self.mode == "status" else None, "ops": self.ops,
                "timesLeft": self.times, "used": self.used, "delay": self.delay, "after": self.after,
                "hang": self.hang}


# --------------------------------------------------------------------------- the store
class FakeJSONBin:
    """Bins in memory plus the JSONBin v3 semantics the broker relies on. Thread-safe."""

    def __init__(self, master_key=None, check_ua=True, max_log=5000):
        self.master_key = master_key
        self.check_ua = check_ua
        self._lock = threading.RLock()
        self._bins = {}        # bin id -> {"text", "createdAt", "updatedAt", "writes", "name"}
        self._aliases = {}     # alias (a document id such as "portfolio", or "users") -> bin id
        self._faults = {}      # bin id or "*" -> Fault
        self._log = collections.deque(maxlen=max_log)
        self._seq = itertools.count(1)

    # ---- bins (direct access: no faults, no log) ----
    def put_bin(self, bin_id, record, alias=None, name=None):
        text = dumps_strict(record)
        now = time.time()
        with self._lock:
            b = self._bins.get(bin_id)
            if b is None:
                self._bins[bin_id] = {"text": text, "createdAt": _iso(now), "updatedAt": now, "writes": 0,
                                      "name": name or alias}
            else:
                b["text"] = text
                b["updatedAt"] = now
            if alias:
                self._aliases[alias] = bin_id

    def get_bin(self, bin_id):
        with self._lock:
            b = self._bins.get(bin_id)
            return None if b is None else json.loads(b["text"])

    def delete_bin(self, bin_id):
        with self._lock:
            return self._bins.pop(bin_id, None) is not None

    def resolve(self, name):
        """An alias or a bin id -> the bin id (None when neither is known)."""
        with self._lock:
            if name in self._aliases:
                return self._aliases[name]
            return name if name in self._bins else None

    def alias_of(self, bin_id):
        with self._lock:
            for a, b in self._aliases.items():
                if b == bin_id:
                    return a
        return None

    def summary(self):
        out = []
        with self._lock:
            for bin_id, b in sorted(self._bins.items()):
                rec = json.loads(b["text"])
                ver = rec.get("version") if isinstance(rec, dict) and isinstance(rec.get("version"), int) else None
                out.append({"name": self.alias_of(bin_id) or bin_id, "binId": bin_id, "version": ver,
                            "bytes": len(b["text"].encode("utf-8")), "writes": b["writes"],
                            "updatedAt": b["updatedAt"]})
        return out

    def reset(self):
        """Forget every bin, alias, fault and log entry."""
        self.clear_faults()
        with self._lock:
            self._bins.clear()
            self._aliases.clear()
            self._log.clear()

    # ---- faults ----
    def _key(self, target):
        if target in (None, "", "*"):
            return "*"
        return self.resolve(target) or target

    def set_fault(self, target, **kw):
        key = self._key(target)
        f = Fault(key, **kw)
        with self._lock:
            old = self._faults.get(key)
            self._faults[key] = f
        if old:
            old.released.set()
        return f

    def clear_faults(self, target=None):
        with self._lock:
            keys = list(self._faults) if target is None else [self._key(target)]
            gone = [self._faults.pop(k) for k in keys if k in self._faults]
        for f in gone:
            f.released.set()
        return len(gone)

    def faults(self):
        with self._lock:
            return [f.to_json() for f in self._faults.values()]

    def _find(self, bin_id, op):
        for key in (bin_id, "*"):
            f = self._faults.get(key)
            if f is not None and f.matches(op):
                return key, f
        return None, None

    def take_fault(self, bin_id, op):
        """The fault that applies to this request, counting it against `times`. A fault used up by
        `times` is removed but NOT released: a request it is holding stays held."""
        with self._lock:
            key, f = self._find(bin_id, op)
            if f is None:
                return None
            f.used += 1
            if f.times is not None:
                f.times -= 1
                if f.times <= 0:
                    self._faults.pop(key, None)
            return f

    def peek_fault(self, bin_id, op):
        with self._lock:
            return self._find(bin_id, op)[1]

    def client_timeout(self, bin_id, op, timeout):
        """The client-side timeout to use for a request: lowered to the fault's `after` while a
        timeout fault with `after` is set on that bin; otherwise the caller's own."""
        f = self.peek_fault(bin_id, op)
        if f is None or f.mode != "timeout" or f.after is None:
            return timeout
        cap = f.after
        if isinstance(timeout, tuple):
            return tuple(cap if t is None else min(float(t), cap) for t in timeout)
        if isinstance(timeout, (int, float)):
            return min(float(timeout), cap)
        return cap                                  # None or socket._GLOBAL_DEFAULT_TIMEOUT

    # ---- log ----
    def record(self, entry, status, t0):
        e = dict(entry)
        e["seq"] = next(self._seq)
        e["t"] = round(t0, 3)
        e["ms"] = round((time.time() - t0) * 1000, 1)
        e["status"] = status
        e["name"] = self.alias_of(e.get("bin")) or e.get("bin")
        with self._lock:
            self._log.append(e)

    def log(self, since=0, name=None):
        bin_id = self.resolve(name) if name else None
        with self._lock:
            return [dict(e) for e in self._log
                    if e["seq"] > since and (name is None or e.get("bin") in (bin_id, name))]

    def clear_log(self):
        with self._lock:
            self._log.clear()

    # ---- JSONBin v3 ----
    @staticmethod
    def route(method, path):
        """(bin id or None, 'read' | 'write') for a /v3/b/... request."""
        parts = [unquote(p) for p in (path or "").split("/") if p]
        bin_id = parts[2] if len(parts) >= 3 and parts[:2] == ["v3", "b"] else None
        return bin_id, ("read" if method in ("GET", "HEAD") else "write")

    def handle(self, method, path, headers, body):
        """One JSONBin v3 call -> (status, JSON-able payload or bytes, extra response headers)."""
        parts = [unquote(p) for p in (path or "").split("/") if p]
        if len(parts) < 2 or parts[:2] != ["v3", "b"]:
            return 404, {"message": "Route not found!"}, {}
        ua = headers.get("User-Agent") or ""
        if self.check_ua and ua.lower().startswith("python-urllib"):
            # Cloudflare in front of JSONBin blocks urllib's default User-Agent.
            return 403, b"error code: 1010", {"Content-Type": "text/plain; charset=UTF-8"}
        if self.master_key is not None:
            key = headers.get("X-Master-Key")
            if not key:
                return 401, {"message": "You need to pass X-Master-Key in the header to read a private bin"}, {}
            if key != self.master_key:
                return 401, {"message": "Invalid X-Master-Key provided"}, {}
        if method == "POST" and len(parts) == 2:
            return self._create(headers, body)
        if len(parts) < 3:
            return 404, {"message": "Route not found!"}, {}
        bin_id, rest = parts[2], parts[3:]
        missing = (404, {"message": "Bin not found or it doesn't belong to your account"}, {})
        if method in ("GET", "HEAD"):
            if rest not in ([], ["latest"]):
                return 404, {"message": "Bin version not found"}, {}
            with self._lock:
                b = self._bins.get(bin_id)
                snap = None if b is None else (b["text"], b["createdAt"])
            if snap is None:
                return missing
            record = json.loads(snap[0])
            if (headers.get("X-Bin-Meta") or "").strip().lower() == "false":
                return 200, record, {}
            return 200, {"record": record, "metadata": {"id": bin_id, "private": True, "createdAt": snap[1]}}, {}
        if method == "PUT" and not rest:
            ctype = (headers.get("Content-Type") or "").lower()
            if "application/json" not in ctype:
                return 400, {"message": "You need to pass Content-Type set to application/json"}, {}
            if not body or not body.strip():
                return 400, {"message": "Bin cannot be blank"}, {}
            try:
                record = loads_strict(body)
            except ValueError:
                return 400, {"message": "Invalid JSON. Please try again"}, {}
            with self._lock:
                b = self._bins.get(bin_id)
                if b is None:
                    return missing
                b["text"] = dumps_strict(record)
                b["updatedAt"] = time.time()
                b["writes"] += 1
            return 200, {"record": record, "metadata": {"parentId": bin_id, "private": True}}, {}
        if method == "DELETE" and not rest:
            if not self.delete_bin(bin_id):
                return missing
            return 200, {"metadata": {"id": bin_id, "versionsDeleted": 0}, "message": "Bin deleted successfully"}, {}
        return 404, {"message": "Route not found!"}, {}

    def _create(self, headers, body):
        ctype = (headers.get("Content-Type") or "").lower()
        if "application/json" not in ctype:
            return 400, {"message": "You need to pass Content-Type set to application/json"}, {}
        if not body or not body.strip():
            return 400, {"message": "Bin cannot be blank"}, {}
        try:
            record = loads_strict(body)
        except ValueError:
            return 400, {"message": "Invalid JSON. Please try again"}, {}
        bin_id = uuid.uuid4().hex[:24]
        name = headers.get("X-Bin-Name")
        self.put_bin(bin_id, record, name=name)
        private = (headers.get("X-Bin-Private") or "true").strip().lower() != "false"
        meta = {"id": bin_id, "createdAt": _iso(time.time()), "private": private}
        if name:
            meta["name"] = name
        return 200, {"record": record, "metadata": meta}, {}


# --------------------------------------------------------------------------- admin API
def _body_json(body):
    if not body or not body.strip():
        return {}
    return json.loads(body)


class Admin:
    """The test-only /__admin API over a FakeJSONBin. Names are aliases (document ids such as
    "portfolio" or "EXEC-DIV-FC", or "users" / "analysis" / "prefs") or raw bin ids. broker_up.py
    subclasses this to add the broker-aware routes (edit through the broker, reset, restart, config)."""

    def __init__(self, store):
        self.store = store
        self.routes = []
        self.add("GET", r"/__admin/?", self.summary)
        self.add("GET", r"/__admin/docs/?", self.list_docs)
        self.add("GET", r"/__admin/docs/(?P<name>[^/]+)", self.read_doc)
        self.add("PUT", r"/__admin/docs/(?P<name>[^/]+)", self.write_raw)
        self.add("DELETE", r"/__admin/docs/(?P<name>[^/]+)", self.delete_doc)
        self.add("GET", r"/__admin/faults/?", self.list_faults)
        self.add("POST", r"/__admin/fail", self.fail)
        self.add("POST", r"/__admin/recover", self.recover)
        self.add("GET", r"/__admin/log/?", self.get_log)
        self.add("DELETE", r"/__admin/log/?", self.clear_log)

    def add(self, method, pattern, fn):
        self.routes.append((method, re.compile("^" + pattern + "$"), fn))

    def handle(self, method, path, query, body):
        for m, rx, fn in self.routes:
            if m != method:
                continue
            mt = rx.match(path)
            if mt:
                try:
                    data = _body_json(body)
                except ValueError as e:
                    return 400, {"error": f"body is not JSON: {e}"}
                args = {k: unquote(v) for k, v in mt.groupdict().items()}
                return fn(data=data, query=query, **args)
        return 404, {"error": f"no admin route {method} {path}"}

    # ---- routes ----
    def summary(self, **_):
        return 200, {"bins": self.store.summary(), "faults": self.store.faults()}

    def list_docs(self, **_):
        return 200, {"docs": self.store.summary()}

    def read_doc(self, name, **_):
        bin_id = self.store.resolve(name)
        if bin_id is None:
            return 404, {"error": f"no bin named {name!r}"}
        rec = self.store.get_bin(bin_id)
        if rec is None:
            return 404, {"error": f"bin {bin_id} for {name!r} does not exist (deleted?)"}
        out = {"name": name, "binId": bin_id, "record": rec}
        if isinstance(rec, dict) and isinstance(rec.get("version"), int):
            out.update(version=rec["version"], updatedAt=rec.get("updatedAt"), doc=rec.get("doc"))
        return 200, out

    def write_raw(self, name, data, **_):
        """Replace a bin's stored record out of band, exactly as given ({"record": ...}). The broker
        caches /state and /prefs documents authoritatively once read, so a broker that has read this one
        will not see the change until a restart; /roster reads through and sees it at once, /analysis
        after its 60 s TTL."""
        if "record" not in data:
            return 400, {"error": 'body must be {"record": <the raw bin content>}'}
        bin_id = self.store.resolve(name)
        if bin_id is None:
            if not data.get("create"):
                return 404, {"error": f"no bin named {name!r} (pass \"create\": true to make one)"}
            bin_id = name
        self.store.put_bin(bin_id, data["record"], alias=name if bin_id != name else None)
        return self.read_doc(name)

    def delete_doc(self, name, **_):
        bin_id = self.store.resolve(name)
        if bin_id is None or not self.store.delete_bin(bin_id):
            return 404, {"error": f"no bin named {name!r}"}
        return 200, {"ok": True, "binId": bin_id}

    def list_faults(self, **_):
        return 200, {"faults": self.store.faults()}

    def fail(self, data, **_):
        target = data.get("target", data.get("doc", data.get("bin")))
        if target is None:
            return 400, {"error": 'name the bin: {"target": "portfolio" | "users" | "<bin id>" | "*", "mode": ...}'}
        if target != "*" and self.store.resolve(target) is None:
            return 404, {"error": f"no bin named {target!r}"}
        kw = {k: data[k] for k in ("mode", "status", "ops", "times", "delay", "after", "hang", "body") if k in data}
        try:
            f = self.store.set_fault(target, **kw)
        except (TypeError, ValueError) as e:
            return 400, {"error": str(e)}
        return 200, {"ok": True, "fault": f.to_json()}

    def recover(self, data, **_):
        target = data.get("target", data.get("doc", data.get("bin")))
        n = self.store.clear_faults(target)
        return 200, {"ok": True, "cleared": n}

    def get_log(self, query, **_):
        since = int((query.get("since") or ["0"])[0])
        name = (query.get("name") or [None])[0]
        return 200, {"log": self.store.log(since=since, name=name)}

    def clear_log(self, **_):
        self.store.clear_log()
        return 200, {"ok": True}


# --------------------------------------------------------------------------- HTTP server
class _HTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = False
    allow_reuse_address = True

    def server_bind(self):
        # HTTPServer.server_bind would call socket.getfqdn (a reverse lookup); not needed on loopback.
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"
    server_version = "fakebin/1.0"
    sys_version = ""

    def log_message(self, fmt, *args):
        if self.server.app.verbose:
            sys.stderr.write("[fakebin] %s\n" % (fmt % args))

    def do_GET(self):
        self._dispatch()

    do_HEAD = do_PUT = do_POST = do_DELETE = do_PATCH = do_GET

    def _read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n > 0 else b""

    def _send(self, status, payload, headers=None):
        if isinstance(payload, (bytes, bytearray)):
            data, ctype = bytes(payload), "application/octet-stream"
        else:
            data, ctype = json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8"
        hdrs = {"Content-Type": ctype}
        hdrs.update(headers or {})
        try:
            self.send_response(status)
            for k, v in hdrs.items():
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)
        except OSError:                       # the client already gave up (timeout tests)
            self.close_connection = True

    def _drop(self):
        self.close_connection = True
        try:
            self.connection.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

    def _dispatch(self):
        app = self.server.app
        u = urlsplit(self.path)
        try:
            if u.path == "/__admin" or u.path.startswith("/__admin/"):
                status, obj = app.admin.handle(self.command, u.path, parse_qs(u.query), self._read_body())
                self._send(status, obj, {"Cache-Control": "no-store"})
            elif u.path.startswith("/v3/"):
                self._jsonbin(u.path)
            else:
                self._send(404, {"message": "Route not found!"})
        except Exception as e:  # noqa: BLE001 — report, never kill the server thread
            if app.verbose:
                traceback.print_exc()
            self._send(500, {"error": f"{type(e).__name__}: {e}"})

    def _jsonbin(self, path):
        store = self.server.app.store
        t0 = time.time()
        body = self._read_body()
        bin_id, op = store.route(self.command, path)
        entry = {"method": self.command, "path": path, "bin": bin_id, "op": op, "fault": None,
                 "ua": self.headers.get("User-Agent"),
                 "headers": sorted({k.lower() for k in self.headers.keys()})}
        # Each outcome is logged BEFORE the client can see it, so whoever observed a failure also finds it
        # in the log.
        fault = store.take_fault(bin_id or "", op)
        if fault is not None:
            entry["fault"] = fault.status if fault.mode == "status" else fault.mode
            if fault.mode == "slow":
                time.sleep(fault.delay)
            elif fault.mode == "timeout":
                if not fault.released.wait(fault.hang):
                    store.record(entry, "timeout", t0)
                    self._drop()
                    return
                # recovered while held: answer now, late (the client has usually given up by then)
                entry["heldUntilRecover"] = True
            elif fault.mode == "drop":
                store.record(entry, "dropped", t0)
                self._drop()
                return
            else:
                store.record(entry, fault.status, t0)
                self._send(fault.status, fault.body if fault.body is not None
                           else {"message": f"fakebin: injected HTTP {fault.status}"})
                return
        status, payload, headers = store.handle(self.command, path, self.headers, body)
        store.record(entry, status, t0)
        self._send(status, payload, headers)


class FakeBinServer:
    """The fake JSONBin (and its /__admin API) on 127.0.0.1:<port>, served from a daemon thread."""

    def __init__(self, store, host="127.0.0.1", port=0, admin=None, verbose=False):
        self.store = store
        self.admin = admin or Admin(store)
        self.verbose = verbose
        self.httpd = _HTTPServer((host, port), _Handler)
        self.httpd.app = self
        self._thread = None

    @property
    def port(self):
        return self.httpd.server_address[1]

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}"

    def start(self):
        self._thread = threading.Thread(target=self.httpd.serve_forever, kwargs={"poll_interval": 0.2},
                                        name="fakebin", daemon=True)
        self._thread.start()
        return self

    def stop(self):
        self.store.clear_faults()             # release held requests
        self.httpd.shutdown()
        self.httpd.server_close()


# --------------------------------------------------------------------------- client redirect
_STATE = {}


def install_redirect(server_url, store=None):
    """Send every https://api.jsonbin.io request made with urllib or requests to `server_url`, and
    refuse every other non-loopback host (also at socket.getaddrinfo). Idempotent: a second call only
    re-points the target."""
    _STATE["server_url"] = server_url.rstrip("/")
    _STATE["store"] = store
    if _STATE.get("installed"):
        return
    _STATE["installed"] = True

    import urllib.error
    import urllib.request

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # never through a proxy

    def _target(parts):
        return _STATE["server_url"] + (parts.path or "/") + (("?" + parts.query) if parts.query else "")

    def _timeout_for(method, path, timeout):
        st = _STATE.get("store")
        if st is None:
            return timeout
        bin_id, op = st.route(method, path)
        return st.client_timeout(bin_id or "", op, timeout)

    def urlopen(url, data=None, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, *args, **kwargs):
        req = url if isinstance(url, urllib.request.Request) else urllib.request.Request(url)
        parts = urlsplit(req.full_url)
        host = (parts.hostname or "").lower()
        if host == JSONBIN_HOST:
            body = data if data is not None else req.data
            method = getattr(req, "method", None) or ("POST" if body is not None else "GET")
            r2 = urllib.request.Request(_target(parts), data=body, headers=dict(req.header_items()), method=method)
            return opener.open(r2, timeout=_timeout_for(method, parts.path, timeout))
        if is_loopback(host):
            return opener.open(req, data, timeout)
        raise urllib.error.URLError(f"fakebin: outbound network is disabled in tests (refused {host})")

    urllib.request.urlopen = urlopen

    try:
        import requests
        import requests.adapters
        import requests.exceptions
    except ImportError:          # the broker's older routes need requests; the /state surface does not
        requests = None
    if requests is not None:
        orig_send = requests.adapters.HTTPAdapter.send

        def send(self, request, stream=False, timeout=None, verify=True, cert=None, proxies=None):
            parts = urlsplit(request.url)
            host = (parts.hostname or "").lower()
            if host == JSONBIN_HOST:
                request = request.copy()
                request.url = _target(parts)
                return orig_send(self, request, stream=stream, timeout=_timeout_for(request.method, parts.path, timeout),
                                 verify=verify, cert=cert, proxies={})
            if is_loopback(host):
                return orig_send(self, request, stream=stream, timeout=timeout, verify=verify, cert=cert, proxies={})
            raise requests.exceptions.ConnectionError(
                f"fakebin: outbound network is disabled in tests (refused {host})", request=request)

        requests.adapters.HTTPAdapter.send = send

    real_getaddrinfo = socket.getaddrinfo

    def getaddrinfo(host, *args, **kwargs):
        if is_loopback(host):
            return real_getaddrinfo(host, *args, **kwargs)
        name = host.decode() if isinstance(host, (bytes, bytearray)) else host
        raise socket.gaierror(socket.EAI_NONAME, f"fakebin: network access is disabled in tests (refused lookup of {name})")

    socket.getaddrinfo = getaddrinfo


# --------------------------------------------------------------------------- self-test
def _selftest():
    import urllib.error
    import urllib.request

    key = "selftest-key"
    store = FakeJSONBin(master_key=key)
    srv = FakeBinServer(store).start()
    install_redirect(srv.url, store)
    store.put_bin("bin-pf", {"version": 3, "updatedAt": 1.0, "doc": {"a": 1}}, alias="portfolio")
    UA = "Mozilla/5.0 (compatible; CeladyneRD/1.0)"
    base = "https://api.jsonbin.io/v3/b"
    ok = lambda m: print("  ok   " + m)

    def get(bin_id, headers=None, timeout=10):
        h = {"X-Master-Key": key, "User-Agent": UA}
        h.update(headers or {})
        with urllib.request.urlopen(urllib.request.Request(f"{base}/{bin_id}/latest", headers=h), timeout=timeout) as r:
            return json.loads(r.read())

    def put(bin_id, payload, headers=None):
        h = {"Content-Type": "application/json", "X-Master-Key": key, "User-Agent": UA}
        h.update(headers or {})
        req = urllib.request.Request(f"{base}/{bin_id}", data=json.dumps(payload).encode(), method="PUT", headers=h)
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())

    def status_of(fn):
        try:
            fn()
        except urllib.error.HTTPError as e:
            return e.code
        return 200

    r = get("bin-pf")
    assert r["record"] == {"version": 3, "updatedAt": 1.0, "doc": {"a": 1}} and r["metadata"]["id"] == "bin-pf", r
    ok("urllib GET /latest -> {record, metadata} (the broker_patch.py read)")
    assert put("bin-pf", {"version": 4, "updatedAt": 2.0, "doc": {"a": 2}})["metadata"]["parentId"] == "bin-pf"
    assert store.get_bin("bin-pf")["version"] == 4
    ok("urllib PUT replaces the record")
    assert status_of(lambda: get("bin-pf", {"User-Agent": "Python-urllib/3.13"})) == 403
    assert status_of(lambda: get("bin-pf", {"X-Master-Key": "wrong"})) == 401
    assert status_of(lambda: get("nope")) == 404
    ok("JSONBin refusals: default urllib UA 403, wrong key 401, unknown bin 404")
    req = urllib.request.Request(f"{base}/bin-pf", data=b'{"version": NaN}', method="PUT",
                                 headers={"Content-Type": "application/json", "X-Master-Key": key, "User-Agent": UA})
    assert status_of(lambda: urllib.request.urlopen(req, timeout=5)) == 400
    ok("NaN is refused like JSONBin refuses it")

    import requests
    rr = requests.get(f"{base}/bin-pf/latest", headers={"X-Master-Key": key, "X-Bin-Meta": "false"}, timeout=5)
    assert rr.status_code == 200 and rr.json()["version"] == 4, rr.text
    rr = requests.put(f"{base}/bin-pf", json={"version": 5, "updatedAt": 3.0, "doc": {}}, headers={"X-Master-Key": key}, timeout=5)
    assert rr.status_code == 200 and store.get_bin("bin-pf")["version"] == 5
    ok("requests GET (X-Bin-Meta: false -> bare record) and PUT (the broker.py path)")

    store.set_fault("portfolio", mode=500, ops="read", times=1)
    assert status_of(lambda: get("bin-pf")) == 500
    assert get("bin-pf")["record"]["version"] == 5
    ok("a 500 for one read, then normal again (times=1)")

    store.set_fault("portfolio", mode="timeout", after=0.3)
    t = time.time()
    try:
        get("bin-pf")
        raise AssertionError("timeout fault should time out")
    except (TimeoutError, socket.timeout, urllib.error.URLError):
        pass
    assert time.time() - t < 3, "the client timeout should be lowered to `after`"
    store.clear_faults()
    assert get("bin-pf")["record"]["version"] == 5
    ok("timeout: the client gives up after `after` seconds; recover answers again")

    store.set_fault("*", mode="drop")
    try:
        get("bin-pf")
        raise AssertionError("drop fault should fail")
    except (OSError, urllib.error.URLError):
        pass
    store.clear_faults()
    ok("drop: connection closed without a response")

    try:
        urllib.request.urlopen("https://example.com/", timeout=2)
        raise AssertionError("other hosts must be refused")
    except urllib.error.URLError as e:
        assert "disabled" in str(e), e
    try:
        socket.getaddrinfo("example.com", 443)
        raise AssertionError("lookups of other hosts must be refused")
    except socket.gaierror:
        pass
    try:
        requests.get("https://example.com/", timeout=2)
        raise AssertionError("requests to other hosts must be refused")
    except requests.exceptions.ConnectionError:
        pass
    ok("other hosts refused (urllib, requests, getaddrinfo)")

    seen = {e["status"] for e in store.log(name="portfolio")}
    assert {200, 500, 403, 401, "dropped"} <= seen, seen
    ok("the request log names the bin and records each outcome")
    srv.stop()
    print("\nfakebin self-test OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    else:
        print(__doc__)
