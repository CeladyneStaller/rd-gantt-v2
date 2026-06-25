#!/usr/bin/env python3
"""
build.py — inline the shared core into the shell templates (frozen spec §12.3)
=============================================================================

Asserted string-replacement, in the established pipeline style: read core.js,
confirm the injection marker appears exactly once in each template, replace it,
and write a single-file HTML to /mnt/user-data/outputs/. No surrounding code in
the templates is touched — only the marker line is replaced.

    python build.py            # build planning_app.html + execution_app.html
    python build.py --check    # run the Node core harness first, then build

The marker in each template is exactly:  <script>/*__CORE__*/</script>
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = "."
CORE = os.path.join(HERE, "core.js")
MARKER = "/*__CORE__*/"

TARGETS = [
    ("planning_app.template.html", "planning_app.html"),
    ("execution_app.template.html", "execution_app.html"),
]


def transform(template_path: str, core_src: str) -> str:
    with open(template_path, "r", encoding="utf-8") as f:
        html = f.read()
    count = html.count(MARKER)
    assert count == 1, f"{os.path.basename(template_path)}: expected exactly 1 core marker, found {count}"
    out = html.replace(MARKER, "\n" + core_src + "\n")
    # post-conditions: marker gone, a known core symbol now present inline
    assert MARKER not in out, "marker survived replacement"
    assert "window.RDCore" in out, "core did not inline (RDCore export missing)"
    assert "function cascade" in out, "core did not inline (cascade missing)"
    return out


def run_check() -> None:
    print("→ running core harness (node core.test.js)")
    r = subprocess.run(["node", os.path.join(HERE, "core.test.js")],
                       capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        sys.exit("core harness FAILED — aborting build")


def main():
    if "--check" in sys.argv:
        run_check()
    os.makedirs(OUT, exist_ok=True)
    with open(CORE, "r", encoding="utf-8") as f:
        core_src = f.read()

    built = []
    for tmpl, outname in TARGETS:
        tpath = os.path.join(HERE, tmpl)
        if not os.path.exists(tpath):
            sys.exit(f"missing template: {tpath}")
        html = transform(tpath, core_src)
        opath = os.path.join(OUT, outname)
        with open(opath, "w", encoding="utf-8") as f:
            f.write(html)
        kb = round(len(html.encode("utf-8")) / 1024, 1)
        built.append((outname, kb))
        print(f"✓ built {outname}  ({kb} KB, core inlined)")

    print("\nbuild complete:")
    for name, kb in built:
        print(f"   {OUT}/{name}  ({kb} KB)")


if __name__ == "__main__":
    main()
