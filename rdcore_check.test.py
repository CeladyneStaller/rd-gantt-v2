"""
Guards build_rdcore.py's broker check. Exists because the scheme fix was silently clobbered by a backwards cp
and a `grep -q ... && echo` reported its absence by printing NOTHING — which read as success.
A harness asserts; a grep whispers.
"""
import importlib.util
import os
import sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build_rdcore.py")
spec = importlib.util.spec_from_file_location("brd", SRC)
m = importlib.util.module_from_spec(spec)
sys.argv = ["build_rdcore.py"]
spec.loader.exec_module(m)

out, fails = [], 0


def ok(c, msg):
    global fails
    out.append(("ok   " if c else "FAIL ") + msg)
    if not c:
        fails += 1


# --- the actual bug Corey hit twice: a bare hostname ---
st, det = m.check_broker("web-production-b17a2.up.railway.app", "deadbeef")
ok("unknown url type" not in det, "a BARE hostname no longer produces 'unknown url type'")
ok("https://web-production-b17a2.up.railway.app/rdcore/version" in det,
   "...the scheme is defaulted to https and the path appended")
ok(st in ("ok", "drift", "error"), "...and it returns a real status")

# --- other shapes people paste ---
for given, want in [
    ("https://h.example.app", "https://h.example.app/rdcore/version"),
    ("http://h.example.app", "http://h.example.app/rdcore/version"),      # explicit http is respected
    ("h.example.app/", "https://h.example.app/rdcore/version"),           # trailing slash
    ("  h.example.app  ", "https://h.example.app/rdcore/version"),        # stray whitespace
]:
    _, d = m.check_broker(given, "deadbeef")
    ok(want in d, f"{given!r} -> {want}")

# --- the summary must not call an unreachable broker "drift" ---
src = open(SRC, encoding="utf-8").read()
ok("drifted" in src, "the summary tracks drift separately from reachability")
ok(src.count('print("drift detected') == 1, "drift is announced in exactly one place")
i = src.index("if drifted:")
tail = src[i:i + 420]
ok("could not run" in tail, "an unreachable broker reports that a check could not run, NOT drift")
ok("all {checked} inlined copies match" in tail, "a clean run still says so plainly")

# --- an HTTP error must surface the broker's OWN detail, not a bare "Internal Server Error" ---
# Corey hit a real 500 whose body said exactly where rdcore.js was missing; urllib hides that.
import http.server, json as _j, threading, urllib.error


class _H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = _j.dumps({"detail": "rdcore.js not found at /app/rdcore.js - commit it beside broker.py, "
                                   "or point RDCORE_PATH at it"}).encode()
        self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = http.server.HTTPServer(("127.0.0.1", 0), _H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
st, det = m.check_broker(f"http://127.0.0.1:{srv.server_port}", "deadbeef")
srv.shutdown()
ok(st == "error", "a 500 is an error status")
ok("rdcore.js not found at /app/rdcore.js" in det,
   "the broker's OWN detail is surfaced (not a bare 'Internal Server Error')")
ok("commit it beside broker.py" in det, "...including what to actually do about it")
ok("HTTP 500" in det, "...alongside the status code")

# --- fail-on-zero must survive (a checker that checks nothing cannot report success) ---
ok("no app files found to check" in src, "fail-on-zero guard is still present")

# --- and it must never write ---
ok("write_text(app_path" not in src, "the tool has no write path — build.py owns inlining")
ok("def check_broker" in src and "urllib.request" in src, "the broker check is real, not a stub")

for l in out:
    if l.startswith("FAIL"):
        print(l)
print(f"\n{fails}/{len(out)} FAILED" if fails else f"\nPASS - {len(out)} rdcore-check assertions green")
sys.exit(1 if fails else 0)