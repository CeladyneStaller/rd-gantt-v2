#!/usr/bin/env python3
"""Can Gantt and quarter objectives be deduped/merged, and by what key?
Also surfaces association structures the Gantt bin holds."""
import glob
import json
import os


def load(f):
    return json.load(open(f, encoding="utf-8"))


def norm(s):
    return " ".join((s or "").lower().split())


g = load("export/divisional.json")
gp = g.get("projects", [])
gbyid = {p.get("id"): p for p in gp}

print("=== Gantt bin: top-level keys (any association structure beyond products/projects?) ===")
for k, v in g.items():
    if isinstance(v, list):
        print(f"  {k}: list[{len(v)}]")
    elif isinstance(v, dict):
        print(f"  {k}: dict{list(v)[:10]}")
    else:
        print(f"  {k}: {str(v)[:80]!r}")

sample_obj = next((p for p in gp if p.get("projectType") == "objective"), {})
src_like = [k for k in sample_obj if any(t in k.lower() for t in ("source", "external", "import", "origin"))]
print("\nobjective-project keys that look like a source/import reference:", src_like or "(none)")

gobjs = [p for p in gp if p.get("projectType") == "objective"]
gnames = {}
for o in gobjs:
    gnames.setdefault(norm(o.get("name")), o)

print(f"\n=== Gantt objectives ({len(gobjs)}): name | division | product/model | parent initiative ===")
for o in sorted(gobjs, key=lambda x: norm(x.get("name"))):
    par = gbyid.get(o.get("parentId"))
    pn = par.get("name") if (par and par.get("projectType") == "initiative") else f"({par.get('projectType') if par else 'ROOT'})"
    print(f"  {(o.get('name') or '')[:48]:48} | {(o.get('division') or '')[:12]:12} | {o.get('productLine')}/{o.get('productModel')} | init: {pn}")

qnames = set()
print("\n=== Quarter objectives, matched to Gantt by normalized name ===")
matched = qonly = 0
for f in sorted(glob.glob("export/quarter_*.json")):
    did = os.path.basename(f)[len("quarter_"):-len(".json")]
    objs = [p for p in load(f).get("projects", []) if p.get("projectType") == "objective"]
    print(f"\n  -- {did} ({len(objs)}) --")
    for o in objs:
        qnames.add(norm(o.get("name")))
        gm = gnames.get(norm(o.get("name")))
        if gm:
            matched += 1
            par = gbyid.get(gm.get("parentId"))
            pn = par.get("name") if (par and par.get("projectType") == "initiative") else "ROOT"
            print(f"     MATCH   {(o.get('name') or '')[:46]!r:48} -> Gantt init: {pn}")
        else:
            qonly += 1
            print(f"     q-only  {(o.get('name') or '')[:46]!r}")

gonly = [o for o in gobjs if norm(o.get("name")) not in qnames]
print(f"\nGantt-only objectives (roadmap, no quarter execution): {len(gonly)}")
for o in gonly[:40]:
    print(f"     g-only  {(o.get('name') or '')[:46]!r}")
print(f"\nSUMMARY: matched={matched}  quarter-only={qonly}  gantt-only={len(gonly)}  (gantt total {len(gobjs)})")
