"""
The broker must FIND its engine, not be told where it is. Written after three rounds lost to a path:
the default looked beside broker.py, Corey's rdcore.js sits one level up, and RDCORE_PATH was set to a
RELATIVE value ("main/rdcore.js") which resolved against the container cwd and missed.

Exercises the real resolver from broker_patch.py against Corey's actual layout:
    Main/Broker/broker_patch.py
    Main/rdcore.js
"""
import os
import re
import sys
import tempfile

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "broker_patch.py")
src = open(SRC, encoding="utf-8").read()

# lift the resolver out (importing the module needs fastapi + env)
start = src.index("_RDCORE_ENV = ")
end = src.index("_RDCORE: Optional[Tuple[str, str]] = None")   # the resolver ends where the cache begins
BLOCK = src[start:end]

out, fails = [], 0


def ok(c, msg):
    global fails
    out.append(("ok   " if c else "FAIL ") + msg)
    if not c:
        fails += 1


def resolve(env_value, here, cwd):
    """Run the real candidate logic with RDCORE_PATH=env_value, broker at `here`, process cwd `cwd`."""
    ns = {"os": os}
    old_env, old_cwd = os.environ.get("RDCORE_PATH"), os.getcwd()
    if env_value is None:
        os.environ.pop("RDCORE_PATH", None)
    else:
        os.environ["RDCORE_PATH"] = env_value
    os.chdir(cwd)
    try:
        block = BLOCK.replace(
            '_RDCORE_HERE = os.path.dirname(os.path.abspath(__file__))',
            f'_RDCORE_HERE = {here!r}')
        exec(block, ns)
        return ns["_rdcore_candidates"]()
    finally:
        os.chdir(old_cwd)
        os.environ.pop("RDCORE_PATH", None)
        if old_env is not None:
            os.environ["RDCORE_PATH"] = old_env


root = tempfile.mkdtemp()
main = os.path.join(root, "Main")
broker = os.path.join(main, "Broker")
os.makedirs(broker)
engine = os.path.join(main, "rdcore.js")           # Corey's layout: repo root, broker in a subfolder
open(engine, "w").write("// engine\n")
open(os.path.join(broker, "broker_patch.py"), "w").write("# broker\n")

found = lambda cands: next((p for p in cands if os.path.exists(p)), None)

# --- the case that matters: NO configuration at all ---
c = resolve(None, broker, root)
ok(found(c) == engine, "with RDCORE_PATH UNSET the engine one level up is found (no configuration needed)")
ok(os.path.join(broker, "rdcore.js") in c, "...having looked beside broker.py first")

# --- the value Corey actually had: a RELATIVE path ---
c = resolve("main/rdcore.js", broker, root)
ok(any("main/rdcore.js" in p or "main\\\\rdcore.js" in p for p in c),
   "a relative RDCORE_PATH is tried against the broker file AND the cwd")
ok(found(c) == engine, "...and even when that relative value misses, the fallback still finds the engine")

# --- quotes pasted into a dashboard field ---
c = resolve('"' + engine + '"', broker, root)
ok(found(c) == engine, 'RDCORE_PATH pasted WITH quotes still resolves (a Variables field takes them literally)')
c = resolve("'" + engine + "'", broker, root)
ok(found(c) == engine, "...single quotes too")
c = resolve("  " + engine + "  ", broker, root)
ok(found(c) == engine, "...and stray whitespace")

# --- an absolute override is honoured first ---
other = os.path.join(root, "elsewhere.js")
open(other, "w").write("// other\n")
c = resolve(other, broker, root)
ok(c[0] == other and found(c) == other, "an absolute RDCORE_PATH is tried FIRST and wins")

# --- beside broker.py still works (the original default) ---
beside = os.path.join(broker, "rdcore.js")
open(beside, "w").write("// beside\n")
c = resolve(None, broker, root)
ok(found(c) == beside, "an engine beside broker.py takes precedence over the one a level up")
os.remove(beside)

# --- no duplicates, and a real diagnosis when nothing exists ---
c = resolve(None, broker, root)
ok(len(c) == len(set(c)), "the candidate list has no duplicates")
os.remove(engine)
c = resolve(None, broker, root)
ok(found(c) is None, "with the engine genuinely absent, nothing is found")
ok(len(c) >= 2, "...and more than one location was attempted, so the error can name them all")

# --- the failure message must list EVERY path tried, not just one ---
ok('"\\n  ".join(tried)' in src, "the FileNotFoundError names every path tried, in order")
ok("cwd=" in src and "RDCORE_PATH=" in src, "...plus the cwd and the env value, since both decide the outcome")
ok("detail=str(e)" in src, "both endpoints relay that full message to the client, not a re-guessed single path")

for l in out:
    if l.startswith("FAIL"):
        print(l)
print(f"\n{fails}/{len(out)} FAILED" if fails else f"\nPASS - {len(out)} rdcore-resolution assertions green")
sys.exit(1 if fails else 0)
