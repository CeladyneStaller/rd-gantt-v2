#!/usr/bin/env python3
"""
export_mapped.py: build seed set "mapped" from the real (older) snapshot in rd-gantt-v2/mapped.

    python3 test/live/export_mapped.py [snapshot_dir] [out_dir]
      snapshot_dir  default: the repo's mapped/ (calm/test/live -> rd-gantt-v2/mapped)
      out_dir       default test/live/seeds/mapped

The snapshot holds REAL company documents: keep this seed inside the sandbox (never publish or share it).

    state/portfolio.json, state/EXEC-*.json, state/gantt-view.json   copied as they are
    (no SPEC- documents in the snapshot: broker_up seeds them as fresh version-0 bins, which is what
     create_bins.py leaves before anything writes them)
    bins/users.json            four FAKE users (cto, lead, ic, and a disabled ic) with fake credentials
    bins/analysis-index.json   {"schema": 2, "runs": []}
    bins/prefs.json            {"version": 0, "updatedAt": null, "doc": {"users": {}}}
    manifest.json              UNIFIED_DIVISIONS from the snapshot's divisions (no kind -> R&D)
"""
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "mapped"))
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "seeds", "mapped")
DOC_RE = re.compile(r"^(portfolio|gantt-view|(EXEC|SPEC|BIZ)-[A-Za-z0-9_-]+)\.json$")


def read(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def write(rel, obj):
    f = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(f), exist_ok=True)
    with open(f, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def fake_user(email, name, org_role, lead=(), disabled=False):
    local = email.split("@")[0]
    return {"email": email, "name": name, "role": "admin" if org_role in ("cto", "ceo") else "user",
            "orgRole": org_role, "leadOf": list(lead), "leadUnits": [], "leadDivisions": list(lead),
            "disabled": disabled, "pinHash": f"FAKE-TEST-PINHASH-{local}-not-a-real-credential",
            "salt": f"FAKE-TEST-SALT-{local}", "iterations": 1}


def main():
    docs = {m.group(1): os.path.join(SRC, f) for f in sorted(os.listdir(SRC)) if (m := DOC_RE.match(f))}
    if "portfolio" not in docs:
        sys.exit(f"export_mapped: no portfolio.json in {SRC}")
    portfolio = read(docs["portfolio"])
    divisions = sorted(portfolio.get("divisions") or [], key=lambda d: d.get("order") or 0)
    unified = [d["id"] for d in portfolio.get("divisions") or [] if (d.get("kind") or "rd") != "biz"]
    biz = [d["id"] for d in portfolio.get("divisions") or [] if d.get("kind") == "biz"]
    lead_div = unified[0] if unified else (divisions[0]["id"] if divisions else None)

    for sub in ("state", "bins"):
        d = os.path.join(OUT, sub)
        if os.path.isdir(d):
            for f in os.listdir(d):
                if f.endswith(".json"):
                    os.unlink(os.path.join(d, f))
    for doc_id, path in docs.items():
        write(f"state/{doc_id}.json", read(path))
    if "gantt-view" not in docs:
        write("state/gantt-view.json", {"overrides": {}})

    users = [
        fake_user("cto.test@celadyne.test", "Test CTO", "cto"),
        fake_user("lead.test@celadyne.test", "Test Lead", "lead", [lead_div] if lead_div else []),
        fake_user("ic.test@celadyne.test", "Test Engineer", "ic"),
        fake_user("former.test@celadyne.test", "Former Engineer", "ic", disabled=True),
    ]
    write("bins/users.json", {"users": users})
    write("bins/analysis-index.json", {"schema": 2, "runs": []})
    write("bins/prefs.json", {"version": 0, "updatedAt": None, "doc": {"users": {}}})
    write("manifest.json", {
        "name": "mapped",
        "description": "REAL snapshot from rd-gantt-v2/mapped (portfolio, EXEC docs, gantt-view) with fake users. "
                       "Sandbox only. Regenerate: python3 test/live/export_mapped.py",
        "source": SRC,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "unifiedDivisions": unified,
        "bizDivisions": biz,
        "stateVersion": 1,
        "missingState": "fresh",
        "bins": {
            "users": {"env": "USERS_BIN", "file": "bins/users.json"},
            "analysis": {"env": "ANALYSIS_INDEX_BIN", "file": "bins/analysis-index.json"},
            "prefs": {"env": "PREFS_BIN", "file": "bins/prefs.json"},
        },
        "signIn": {"cto": users[0]["email"], "lead": users[1]["email"], "ic": users[2]["email"]},
    })
    print(f"export_mapped: wrote {os.path.relpath(OUT)}: {', '.join(docs)}"
          f"{'' if 'gantt-view' in docs else ', gantt-view'}; UNIFIED_DIVISIONS={','.join(unified)} "
          f"BIZ_DIVISIONS={','.join(biz)}; {len(users)} fake users")


if __name__ == "__main__":
    main()
