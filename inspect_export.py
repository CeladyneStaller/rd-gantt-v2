#!/usr/bin/env python3
"""Inventory v2 — parent linkage + field shapes, to finalize the migration mapper."""
import json
from collections import Counter


def load(f):
    return json.load(open(f, encoding="utf-8"))


FILES = ["export/divisional.json", "export/quarter_DIV-FC.json",
         "export/quarter_DIV-EL.json", "export/quarter_DIV-EXP.json"]

for f in FILES:
    try:
        d = load(f)
    except FileNotFoundError:
        continue
    ps = d.get("projects", [])
    byid = {p.get("id"): p for p in ps}
    print(f"\n=== {f} — parent linkage ===")
    for ptype in ["initiative", "objective", "milestone", "task", "delivery", "checklist"]:
        items = [p for p in ps if p.get("projectType") == ptype]
        if not items:
            continue
        parents = Counter((byid.get(p.get("parentId")) or {}).get("projectType", "ROOT/none") for p in items)
        print(f"  {ptype:11} n={len(items):<3} parents: {dict(parents)}")

# field-shape samples
dv = load("export/divisional.json")["projects"]
fc = load("export/quarter_DIV-FC.json")["projects"]


def first(projects, pred):
    for p in projects:
        if pred(p):
            return p
    return None


kr = next((k for p in (dv + fc) for k in (p.get("keyResults") or [])), None)
print("\n=== sample keyResult ===")
print(json.dumps(kr, indent=2) if kr else "(none populated anywhere)")

task = first(fc, lambda p: p.get("projectType") == "task")
print("\n=== sample task (quarter_DIV-FC) ===")
print(json.dumps(task, indent=2)[:1300] if task else "(none)")

ms = first(dv, lambda p: p.get("projectType") == "milestone")
print("\n=== sample milestone (divisional) ===")
print(json.dumps(ms, indent=2)[:1000] if ms else "(none)")

dl = first(dv, lambda p: p.get("projectType") == "delivery")
print("\n=== sample delivery (divisional) ===")
print(json.dumps(dl, indent=2)[:1000] if dl else "(none)")