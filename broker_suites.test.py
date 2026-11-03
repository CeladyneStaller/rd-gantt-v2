"""
The broker's own test files (broker/test_*.py) from the repo sweep, which only collects root-level
*.test.py. test_auth_gate.py is the one that matters most: the token on every data route, the 426 for
pages that predate the update, and JSONBin failures answering 502 instead of "document missing".

    python broker_suites.test.py
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = next((d for d in (os.environ.get("RD_OUT"), HERE) if d and os.path.isdir(os.path.join(d, "broker"))), None)
TESTS = ("test_auth_gate.py", "test_broker_app.py", "test_broker_core.py")
COUNT = re.compile(r"PASS - (\d+) [^\n]*assertions green|PASS=(\d+) FAIL=0")

if BASE is None:
    print("FAIL: no broker/ folder beside this harness (or in RD_OUT)")
    sys.exit(1)

total, failed = 0, []
for name in TESTS:
    path = os.path.join(BASE, "broker", name)
    if not os.path.exists(path):
        failed.append(f"{name}: missing")
        continue
    env = dict(os.environ)
    env.pop("BROKER_TOKEN", None)          # each test sets the token it expects
    env.pop("RD_ALLOWED_CLIENTS", None)
    try:
        p = subprocess.run([sys.executable, name], cwd=os.path.dirname(path), env=env, capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=300)
    except subprocess.TimeoutExpired:
        failed.append(f"{name}: timed out")
        continue
    out = (p.stdout or "") + (p.stderr or "")
    m = COUNT.search(out)
    if p.returncode or not m:
        last = [l for l in out.strip().splitlines() if l.strip()][-3:]
        failed.append(f"{name}: exited {p.returncode}: " + " | ".join(last))
        continue
    n = int(m.group(1) or m.group(2))
    total += n
    print(f"ok   {name} ({n} checks)")   # not "name: n" -- sweep.py's count pattern would take a bare trailing number

for f in failed:
    print("FAIL " + f)
print(f"\n{len(failed)} broker suite(s) FAILED" if failed else f"\nPASS - {total} broker-suite assertions green")
sys.exit(1 if failed else 0)
