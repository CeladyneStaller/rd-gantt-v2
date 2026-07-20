#!/usr/bin/env python3
# Phase 0 of the Company > Unit > Division hierarchy: the DATA MODEL only.
# migrate.build() must now emit:
#   - a first-class `units` collection [{id,name,order}]
#   - `unitId` and `kind` on every division (kind absent-means-'rd', so migrate writes it explicitly)
#   - the Business divisions SEEDED even when the source project data has none, so the tree is whole
# and it must stay ADDITIVE and IDEMPOTENT. No engine/scoring change is asserted here — that is Phase 1.
import os, sys, importlib.util

OUT = os.environ.get("RD_OUT", "/mnt/user-data/outputs")
spec = importlib.util.spec_from_file_location("migrate", os.path.join(OUT, "migrate.py"))
migrate = importlib.util.module_from_spec(spec); spec.loader.exec_module(migrate)

n = 0; fails = 0
def ok(cond, msg):
    global n, fails; n += 1
    if not cond: fails += 1; print("FAIL " + msg)

def run(divisional, quarter_docs):
    rep = migrate.Report()
    portfolio, _exec = migrate.build(divisional, quarter_docs, rep)
    return portfolio

def by_id(rows):
    return {r["id"]: r for r in rows}

# ---- a source with the three R&D divisions present (as the real data has today) ----
divisional = {"projects": [
    {"id": "p1", "division": "fuelcell",    "name": "FC proj"},
    {"id": "p2", "division": "electrolyzer","name": "EL proj"},
    {"id": "p3", "division": "exploration", "name": "EXP proj"},
]}
P = run(divisional, {})

# ---- units are first-class, ordered ----
ok("units" in P, "the portfolio now carries a units collection")
units = by_id(P.get("units", []))
ok(set(units) == {"UNIT-BIZ", "UNIT-TECH"}, "both units are seeded (Business, Technical)")
ok(units.get("UNIT-BIZ", {}).get("name") == "Business" and units.get("UNIT-TECH", {}).get("name") == "Technical",
   "units carry their display names")
ok(all("order" in u for u in P.get("units", [])) and len(P.get("units", [])) > 0, "units carry an order")
ok(units.get("UNIT-BIZ", {}).get("order") != units.get("UNIT-TECH", {}).get("order")
   or not units, "the two units have distinct order values")

# ---- every division has unitId + kind ----
divs = by_id(P["divisions"])
ok(all("unitId" in d and "kind" in d for d in P["divisions"]),
   "every division carries both unitId and kind")

# ---- R&D divisions: Technical unit, kind rd ----
for d in ("DIV-FC", "DIV-EL", "DIV-EXP"):
    ok(divs.get(d, {}).get("unitId") == "UNIT-TECH", f"{d} sits under the Technical unit")
    ok(divs.get(d, {}).get("kind") == "rd", f"{d} is kind 'rd'")

# ---- Business divisions: SEEDED even though the source had none, under Business, kind biz ----
for d in ("DIV-FIN", "DIV-BD", "DIV-HR"):
    ok(d in divs, f"{d} is seeded even though the source project data had no business divisions")
    ok(divs.get(d, {}).get("unitId") == "UNIT-BIZ", f"{d} sits under the Business unit")
    ok(divs.get(d, {}).get("kind") == "biz", f"{d} is kind 'biz'")
ok(divs.get("DIV-FIN", {}).get("name") == "Financial" and divs.get("DIV-HR", {}).get("name") == "Human Resources",
   "seeded business divisions carry their display names")

# ---- the two flavours partition cleanly ----
rd = [d["id"] for d in P["divisions"] if d["kind"] == "rd"]
biz = [d["id"] for d in P["divisions"] if d["kind"] == "biz"]
ok(set(rd) == {"DIV-FC", "DIV-EL", "DIV-EXP"}, "exactly the three R&D divisions are kind rd")
ok(set(biz) == {"DIV-FIN", "DIV-BD", "DIV-HR"}, "exactly the three business divisions are kind biz")
ok(all(divs[i]["unitId"] == "UNIT-TECH" for i in rd), "all rd divisions are under Technical")
ok(all(divs[i]["unitId"] == "UNIT-BIZ" for i in biz), "all biz divisions are under Business")

# ---- ADDITIVE: the existing collections are untouched in shape ----
for coll in ("divisions", "products", "models", "initiatives", "milestones",
             "objectives", "objectiveEdges", "kpiDefs"):
    ok(coll in P, f"the existing '{coll}' collection is still present")

# ---- IDEMPOTENT: building the same input twice yields identical units + division hierarchy fields ----
P2 = run(divisional, {})
def hier(pf):
    return (sorted((u["id"], u["name"], u["order"]) for u in pf["units"]),
            sorted((d["id"], d.get("unitId"), d.get("kind")) for d in pf["divisions"]))
ok(hier(P) == hier(P2), "re-running the migration produces the identical unit/division hierarchy (idempotent)")

# ---- a source that ALREADY contains a business division id (via quarter_docs) is not duplicated ----
P3 = run(divisional, {"DIV-FIN": {"projects": []}})
fin_rows = [d for d in P3["divisions"] if d["id"] == "DIV-FIN"]
ok(len(fin_rows) == 1, "a business division already present in the source is not duplicated by the seed")
ok(fin_rows[0]["kind"] == "biz" and fin_rows[0]["unitId"] == "UNIT-BIZ",
   "...and still gets its biz/UNIT-BIZ hierarchy fields")

# ---- an UNKNOWN division id falls back to kind rd (absent-means-rd) with no unit ----
P4 = run(divisional, {"DIV-XYZ": {"projects": []}})
xyz = by_id(P4["divisions"]).get("DIV-XYZ")
ok(xyz is not None, "an unknown division from the source still appears")
ok(xyz["kind"] == "rd", "an unmapped division defaults to kind rd (absent-means-rd)")
ok(xyz["unitId"] is None, "...and has no unit (falls into the Unassigned bucket downstream)")

if fails:
    print(f"\n{fails} / {n} FAILED"); sys.exit(1)
print(f"\nPASS - {n} hierarchy phase-0 (data model) assertions green")
