#!/usr/bin/env python3
"""Dump the Gantt import-association maps' VALUES so the migrator can resolve
quarter objectives to canonical product/model/initiative."""
import json

g = json.load(open("export/divisional.json", encoding="utf-8"))


def show(name, n=10):
    v = g.get(name)
    print(f"\n=== {name} ===")
    if isinstance(v, dict):
        prefixes = sorted({k.split("_")[0] for k in v if "_" in k})
        print(f"  ({len(v)} keys)  prefixes: {prefixes or '(none with _)'}")
        for i, (k, val) in enumerate(v.items()):
            if i >= n:
                print(f"  ... +{len(v) - n} more")
                break
            print(f"  {k!r}: {json.dumps(val)[:220]}")
    elif isinstance(v, list):
        print(f"  list[{len(v)}]: {json.dumps(v)[:400]}")
    else:
        print(f"  {json.dumps(v)[:300]}")


for nm in ["importProductAssoc", "importAssociations", "importTypeFilter",
           "importDelayExclusions", "divisionColors", "productColors"]:
    show(nm)

print("\n=== computedStatus shape ===")
cs = g.get("computedStatus", {})
print("  keys:", list(cs)[:10])
if isinstance(cs.get("objectives"), (dict, list)):
    o = cs["objectives"]
    print("  objectives:", f"dict[{len(o)}] sample {json.dumps(list(o.items())[:2])[:200]}" if isinstance(o, dict) else f"list[{len(o)}] sample {json.dumps(o[:2])[:200]}")

prods = sorted(p["id"] for p in g.get("products", []))
print("\n=== canonical Gantt product ids ===")
print(" ", prods)
print("\n(compare to a quarter objective's productLine, e.g. product-1775244574165 — confirm mismatch)")
