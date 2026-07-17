#!/usr/bin/env python3
"""
build.py — inline the shared core into the shell templates (frozen spec §12.3)
=============================================================================

Asserted string-replacement, in the established pipeline style: read rdcore.js,
confirm the injection marker appears exactly once in each template, replace it,
and write a single-file HTML beside this script (RD_OUT overrides). No surrounding code in
the templates is touched — only the marker line is replaced.

    python build.py            # build planning_app.html + execution_app.html
    python build.py --check    # run the Node core harness first, then build

The marker in each template is exactly:  <script>/*__CORE__*/</script>
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# OUT was hardcoded to the sandbox path, which on a Windows checkout resolves to C:\mnt\user-data\outputs.
# Same convention sweep.py already uses: sandbox writes there, a real checkout writes beside the script.
SANDBOX = os.path.isdir("/mnt/user-data/outputs") and os.path.isdir("/home/claude")
OUT = os.environ.get("RD_OUT") or ("/mnt/user-data/outputs" if SANDBOX else HERE)
CORE = os.path.join(HERE, "rdcore.js")
MARKER = "/*__CORE__*/"

TARGETS = [
    ("planning_app.template.html", "planning_app.html"),
    ("execution_app.template.html", "execution_app.html"),
    ("product_designer.template.html", "product_designer.html"),
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


# The three tool apps share one theme palette (same :root var names). This guards
# against silent drift: the light-palette block, seed script, and toggle handler
# must be byte-identical across them. (index.html is bespoke and excluded.)
_PAL_START = 'html[data-theme="light"]{'
_PAL_END = '--scrim:rgba(15,23,42,.32);\n  }'
_SEED_SIG = "document.documentElement.setAttribute('data-theme',t);"
_HANDLER_SIG = "b.getAttribute('data-theme-set')"


def _theme_palette(html: str) -> str:
    i = html.find(_PAL_START)
    j = html.find(_PAL_END, i)
    assert i != -1 and j != -1, "theme light-palette block not found"
    return html[i:j + len(_PAL_END)]


def check_theme_sync() -> None:
    palettes = {}
    for tmpl, _ in TARGETS:
        with open(os.path.join(HERE, tmpl), "r", encoding="utf-8") as f:
            h = f.read()
        palettes[tmpl] = _theme_palette(h)
        assert _SEED_SIG in h, f"{tmpl}: theme seed script missing"
        assert _HANDLER_SIG in h, f"{tmpl}: theme toggle handler missing"
    ref = next(iter(palettes.values()))
    drift = [t for t, v in palettes.items() if v != ref]
    assert not drift, "theme light-palette DRIFT across tool apps: " + ", ".join(drift)
    print(f"✓ theme palette in sync across {len(TARGETS)} tool apps ({len(ref)} chars)")


def main():
    if "--check" in sys.argv:
        run_check()
    check_theme_sync()
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