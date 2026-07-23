"""
Option 3 keeps a SECOND rdcore.js in the broker's deploy root. build.py makes that copy in the same pass that
reads the engine, so it cannot be forgotten. Written against Corey's real layout:

    rd-gantt-v2/build.py, rdcore.js, *_app.template.html
    rd-gantt-v2/Broker/broker_patch.py     <- Railway deploys THIS as its own root (/app)
    rd-gantt-v2/Broker/rdcore.js           <- the copy the Hub actually loads
"""
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
out, fails = [], 0


def ok(c, msg):
    global fails
    out.append(("ok   " if c else "FAIL ") + msg)
    if not c:
        fails += 1


def build_tree(broker_dirname="Broker", crlf=False):
    """A minimal checkout: build.py + rdcore.js + templates, optionally with a broker subfolder."""
    root = tempfile.mkdtemp()
    for f in ("build.py", "rdcore.js", "planning_app.template.html",
              "execution_app.template.html", "sales_app.template.html", "product_designer.template.html"):
        src = os.path.join(HERE, f)
        if not os.path.exists(src):
            return None
        shutil.copy2(src, os.path.join(root, f))
    if crlf:                                    # a Windows checkout: engine stored CRLF
        p = os.path.join(root, "rdcore.js")
        data = open(p, "rb").read().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
        open(p, "wb").write(data)
    if broker_dirname:
        os.makedirs(os.path.join(root, broker_dirname))
        open(os.path.join(root, broker_dirname, "broker_patch.py"), "w").write("# broker\n")
    return root


def run(root):
    env = dict(os.environ)
    env.pop("RD_OUT", None)
    # force the not-sandbox branch so it behaves like Corey's checkout
    src = open(os.path.join(root, "build.py"), encoding="utf-8").read().replace(
        'os.path.isdir("/mnt/user-data/outputs") and os.path.isdir("/home/claude")', "False", 1)
    open(os.path.join(root, "build_sim.py"), "w", encoding="utf-8").write(src)
    p = subprocess.run([sys.executable, "build_sim.py"], cwd=root, capture_output=True, text=True, env=env)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def broker_etag(path):
    """Exactly what the broker computes: universal-newline read, strip, sha256, first 16."""
    with open(path, encoding="utf-8") as fh:
        return hashlib.sha256(fh.read().strip().encode("utf-8")).hexdigest()[:16]


root = build_tree()
if root is None:
    print("FAIL missing source files"); sys.exit(1)

rc, log = run(root)
copy = os.path.join(root, "Broker", "rdcore.js")
ok(rc == 0, "the build succeeds with a broker directory present")
ok(os.path.exists(copy), "rdcore.js is copied into the broker's deploy root automatically")
ok(open(copy, "rb").read() == open(os.path.join(root, "rdcore.js"), "rb").read(),
   "...byte-for-byte identical to the canonical engine")
ok(broker_etag(copy) == broker_etag(os.path.join(root, "rdcore.js")),
   "...so the etag the BROKER computes matches the repo's engine")
ok("Broker" in log and "Hub loads" in log, "the build says it updated the copy the Hub loads")
ok("redeploy" in log, "...and that a redeploy is needed, since a copy nobody deploys is not a copy")

# second run: nothing changed
rc2, log2 = run(root)
ok(rc2 == 0 and "already current" in log2, "a second build reports the copy already current, not a spurious update")
ok("redeploy" not in log2.split("already current")[1][:200] if "already current" in log2 else False,
   "...and does not nag about redeploying when nothing moved")

# the engine changes -> the copy follows
with open(os.path.join(root, "rdcore.js"), "a", encoding="utf-8") as fh:
    fh.write("\n// touched\n")
rc3, log3 = run(root)
ok(rc3 == 0 and "updated" in log3, "editing the engine updates the broker copy on the next build")
ok(broker_etag(copy) == broker_etag(os.path.join(root, "rdcore.js")),
   "...and the etags track each other, so the Hub cannot silently lag")
shutil.rmtree(root)

# --- a CRLF checkout (Corey's apps report CRLF) ---
root = build_tree(crlf=True)
rc, log = run(root)
copy = os.path.join(root, "Broker", "rdcore.js")
ok(rc == 0 and os.path.exists(copy), "a CRLF checkout still syncs")
ok(broker_etag(copy) == broker_etag(os.path.join(root, "rdcore.js")),
   "...and CRLF does not change the broker's etag (universal-newline read normalises it)")
shutil.rmtree(root)

# --- lowercase directory name ---
root = build_tree(broker_dirname="broker")
rc, log = run(root)
ok(rc == 0 and os.path.exists(os.path.join(root, "broker", "rdcore.js")), "a lowercase 'broker' directory works too")
shutil.rmtree(root)

# --- NO broker directory: must be a harmless no-op ---
root = build_tree(broker_dirname=None)
rc, log = run(root)
ok(rc == 0, "a checkout with no broker directory still builds")
ok("Hub loads" not in log, "...and says nothing about a copy that does not apply")
ok(os.path.exists(os.path.join(root, "planning_app.html")), "...and still produces the apps")
shutil.rmtree(root)

for l in out:
    if l.startswith("FAIL"):
        print(l)
print(f"\n{fails}/{len(out)} FAILED" if fails else f"\nPASS - {len(out)} broker-sync assertions green")
sys.exit(1 if fails else 0)
