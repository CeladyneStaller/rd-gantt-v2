#!/usr/bin/env python3
"""
build.py — build the five apps and refresh the broker's engine copy
===================================================================

The apps are the Calm workspace (source in calm/). This builds them from calm/ against this repo's own
rdcore.js and writes the single-file pages beside this script (RD_OUT overrides):

    planning_app.html  execution_app.html  sales_app.html  product_designer.html  my_projects.html

    python build.py            # build the five apps
    python build.py --check    # run the Node core harness and every Calm suite first, then build

The old shell templates (*_app.template.html) are retired; calm/ is the source of truth for the pages.
"""

import filecmp
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# OUT was hardcoded to the sandbox path, which on a Windows checkout resolves to C:\mnt\user-data\outputs.
# Same convention sweep.py already uses: sandbox writes there, a real checkout writes beside the script.
SANDBOX = os.path.isdir("/mnt/user-data/outputs") and os.path.isdir("/home/claude")
OUT = os.environ.get("RD_OUT") or ("/mnt/user-data/outputs" if SANDBOX else HERE)
CORE = os.path.join(HERE, "rdcore.js")
CALM = os.path.join(HERE, "calm")
PAGES = ("planning_app.html", "execution_app.html", "sales_app.html", "product_designer.html", "my_projects.html")

# The broker deploys from its own root, so the engine it serves to the R&D Hub is a SECOND copy of rdcore.js
# living in the broker's directory. A copy you have to remember to make is a copy that drifts — and when it
# drifts nothing breaks loudly: the Hub and the apps simply band the same score differently. Editing the engine
# and refreshing the broker's copy are two thoughts; this makes them one action.
# No-op when there is no broker directory here, so this is harmless for any other checkout.
BROKER_DIRS = ("Broker", "broker")


def sync_broker_copy():
    """Copy rdcore.js into the broker's deploy root, if it lives in this tree. Returns (path, changed) or None.
    Byte-for-byte: the broker hashes the file after Python's universal-newline read, so a verbatim copy
    produces the identical etag regardless of the checkout's line endings."""
    for d in BROKER_DIRS:
        bdir = os.path.join(HERE, d)
        if not os.path.isdir(bdir):
            continue
        dst = os.path.join(bdir, "rdcore.js")
        if os.path.exists(dst) and filecmp.cmp(CORE, dst, shallow=False):
            return dst, False
        shutil.copy2(CORE, dst)
        return dst, True
    return None


def run_check() -> None:
    print("→ running core harness (node core.test.js)")
    r = subprocess.run(["node", os.path.join(HERE, "core.test.js")], capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        sys.exit("core harness FAILED — aborting build")
    print("→ building the Calm sample boards and running every Calm suite")
    r = subprocess.run([sys.executable, os.path.join(CALM, "build.py")], cwd=CALM, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stdout.write(r.stdout + r.stderr)
        sys.exit("Calm sample build FAILED — aborting build")
    # the suites run Python too (the board parser, the live builds): hand them this interpreter, so a machine
    # without `python3` (Windows) works
    env = dict(os.environ, RD_PYTHON=sys.executable)
    r = subprocess.run(["node", os.path.join(CALM, "test", "run_all.js")], cwd=CALM, capture_output=True, text=True, env=env)
    tail = (r.stdout or "").strip().splitlines()[-1:] or ["(no output)"]
    print("  " + tail[0])
    if r.returncode != 0:
        sys.stdout.write(r.stdout)
        sys.exit("Calm suites FAILED — aborting build")


def main():
    if "--check" in sys.argv:
        run_check()
    if not os.path.isdir(CALM):
        sys.exit(f"missing {CALM}: the apps are built from calm/")
    os.makedirs(OUT, exist_ok=True)
    r = subprocess.run([sys.executable, os.path.join(CALM, "standalone.py"), "--live", "--out=" + OUT], cwd=CALM)
    if r.returncode != 0:
        sys.exit("Calm live build FAILED")
    missing = [p for p in PAGES if not os.path.exists(os.path.join(OUT, p))]
    if missing:
        sys.exit("build did not produce: " + ", ".join(missing))

    synced = sync_broker_copy()
    if synced:
        dst, changed = synced
        rel = os.path.relpath(dst, HERE)
        print(f"\u2713 {'updated' if changed else 'already current'}: {rel}  (the engine the Hub loads)")
        if changed:
            print(f"  commit {rel} and redeploy the broker, or the Hub keeps the old engine")

    print("\nbuild complete:")
    for name in PAGES:
        kb = round(os.path.getsize(os.path.join(OUT, name)) / 1024, 1)
        print(f"   {OUT}/{name}  ({kb} KB)")


if __name__ == "__main__":
    main()
