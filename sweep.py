#!/usr/bin/env python3
"""Run every harness and guard the ASSERTION COUNT, not just the exit code.

Three separate incidents this session produced green output that proved nothing:
  1. a stale 5-assertion copy of gantt_cancelled.cjs kept passing for ~7 turns while the code it was
     supposed to cover had been silently lost;
  2. an escaping slip made an injected script fail to parse, so it reported "PASS - 0 assertions green"
     and exited 0 (this happened twice);
  3. ms_delete.cjs re-rendered by hand and so passed 16/16 against a bug the user then hit in the app.
Exit status alone cannot distinguish "all assertions passed" from "no assertions ran". This runner:
  * always deletes local harness copies and re-copies from outputs (fixes cause 1),
  * fails a harness that reports ZERO assertions (fixes cause 2),
  * fails a harness whose count DROPS below its recorded baseline (catches silent test deletion),
  * names harnesses that report no count at all, so they are known-unguarded rather than invisibly so.

  python3 sweep.py            run + check against harness_counts.json
  python3 sweep.py --update   run + rewrite the baseline (use after intentionally adding assertions)
"""
import glob, json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SANDBOX = os.path.isdir("/mnt/user-data/outputs") and os.path.isdir("/home/claude")
# Sandbox: harnesses live in outputs and run from /home/claude (which is NOT reliably empty between turns,
# so they are always re-copied). Anywhere else: they run in place, beside this script.
OUT = os.environ.get("RD_OUT") or ("/mnt/user-data/outputs" if SANDBOX else HERE)
CWD = os.environ.get("RD_SRC") or ("/home/claude" if SANDBOX else HERE)
TMP = os.environ.get("RD_TMP") or ("/tmp" if SANDBOX else HERE)
BASE = os.path.join(OUT, "harness_counts.json")
# matches: "352 assertions green" / "36 planning-app assertions green" / "45 assertions green"
COUNT_RE = re.compile(r"(\d+)\s+[^\n]{0,70}?assertions?\s+green")
ENV = dict(os.environ, RD_OUT=OUT, RD_SRC=CWD, RD_TMP=TMP)
_nm = os.path.join(CWD, "node_modules")
if os.path.isdir(_nm):
    ENV["NODE_PATH"] = _nm          # otherwise let node resolve node_modules itself


def refresh():
    """Never trust the run directory to hold the current harnesses. No-op when they already live there."""
    if os.path.abspath(OUT) == os.path.abspath(CWD):
        return len(glob.glob(f"{OUT}/*.cjs") + glob.glob(f"{OUT}/*.test.js"))
    for f in glob.glob(f"{CWD}/*.cjs") + glob.glob(f"{CWD}/*.test.js"):
        os.remove(f)
    n = 0
    for p in glob.glob(f"{OUT}/*.cjs") + glob.glob(f"{OUT}/*.test.js"):
        shutil.copy(p, CWD); n += 1
    return n


def etb_plumbing():
    """etb_phase*.test.js read this slice of the execution template; regenerate it each run."""
    t = os.path.join(OUT, "execution_app.template.html")
    if not os.path.exists(t):
        t = os.path.join(CWD, "execution_app.template.html")
    if not os.path.exists(t):
        return
    lines = open(t, encoding="utf-8").read().split("\n")
    a = next((i for i, l in enumerate(lines) if "var __etbSaveTimer" in l), None)
    b = next((i for i, l in enumerate(lines) if l.startswith("function etbSyncObjective")), None)
    if a is not None and b is not None:
        open(os.path.join(TMP, "etb_plumbing.js"), "w", encoding="utf-8").write("\n".join(lines[a:b]))


def run(name):
    p = subprocess.run(["node", name], capture_output=True, text=True, cwd=CWD, env=ENV,
                       encoding="utf-8", errors="replace")   # harness output is UTF-8, not the OS default
    out = (p.stdout or "") + (p.stderr or "")
    m = COUNT_RE.search(out)
    return p.returncode, (int(m.group(1)) if m else None), out


def main():
    update = "--update" in sys.argv
    base = json.load(open(BASE, encoding="utf-8")) if os.path.exists(BASE) else {}
    copied = refresh(); etb_plumbing()
    names = sorted(os.path.basename(p) for p in glob.glob(f"{OUT}/*.cjs") + glob.glob(f"{OUT}/*.test.js"))
    print(f"harness dir : {OUT}\nrun dir     : {CWD}\nfound       : {copied} harness file(s)\n")
    if not names:
        print(f"FAIL: no harnesses found in {OUT}\n"
              f"      Finding nothing is NOT a pass. Point the runner at the directory holding the\n"
              f"      *.cjs / *.test.js harnesses and the built *_app.html files, e.g.\n"
              f"        RD_OUT=/path/to/harnesses python3 sweep.py      (or set RD_OUT in the environment)\n"
              f"      Windows PowerShell:  $env:RD_OUT='C:\\path\\to\\harnesses'; python3 sweep.py")
        sys.exit(1)

    fails, grew, unguarded, counts = [], [], [], {}
    for n in names:
        rc, cnt, out = run(n)
        counts[n] = cnt
        want = base.get(n)
        if rc != 0:
            # Show WHY. A node crash (module not found, syntax error) contains neither "FAIL" nor "threw",
            # so keying only on those markers hid the real reason and made this undiagnosable remotely.
            why = ""
            for l in out.splitlines():
                t = l.strip()
                if not t:
                    continue
                if "FAIL" in t or "threw" in t or "Error" in t or t.startswith("throw"):
                    why = t[:160]; break
            if not why:
                why = next((l.strip()[:160] for l in out.splitlines() if l.strip()), "(no output)")
            fails.append((n, f"exited {rc}: {why}"))
        elif cnt == 0:
            fails.append((n, "reported ZERO assertions - the harness almost certainly failed to parse"))
        elif cnt is None:
            unguarded.append(n)
        elif want is not None and cnt < want:
            fails.append((n, f"assertion count DROPPED {want} -> {cnt}"))
        elif want is not None and cnt > want:
            grew.append((n, want, cnt))

    total = sum(c for c in counts.values() if c)
    print(f"{len(names) - len(fails)}/{len(names)} harnesses green   ({total} assertions counted)")
    if unguarded:
        print(f"\nno count reported (exit-code only, NOT count-guarded): {', '.join(unguarded)}")
    if grew:
        print("\nassertion counts grew (rerun with --update to accept):")
        for n, w, c in grew:
            print(f"  {n}: {w} -> {c}")
    if fails:
        print(f"\n{len(fails)} FAILED:")
        for n, why in fails:
            print(f"  {n}: {why}")
    if update:
        json.dump(counts, open(BASE, "w", encoding="utf-8"), indent=1, sort_keys=True)
        print(f"\nbaseline written: {BASE}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
