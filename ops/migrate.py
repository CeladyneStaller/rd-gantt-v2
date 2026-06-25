#!/usr/bin/env python3
"""
migrate.py — Celadyne Gantt / Q-tracker bins -> unified R&D suite v1.2
================================================================================
UNION + association-aware merge.

Sources:
  * divisional / Gantt bin  -> PORTFOLIO roadmap (divisions, products, models,
    initiatives, milestones) AND the Gantt's own roadmap objectives (real
    initiative links + canonical product/model). The Gantt also holds the
    association maps `importProductAssoc` / `importAssociations` that bridge the
    division bins' local ids to canonical product/model/initiative.
  * each quarter bin        -> the quarterly OKR objectives + their execution
    (KRs, stage-gates, tasks).

Objectives from both sources are UNIONED and deduped by (normalized name,
division): a collision merges (Gantt side wins associations, execution is the
union of both); with no collision it is a plain union. Quarter objectives have
their product/model resolved through `importProductAssoc` and their initiative
through `importAssociations`; anything unresolved falls back to a per-division
umbrella initiative. Invariant: every objective product/model id exists in the
canonical products[]/models[] or is nulled (no dangling refs).

Field mapping (per objective, over all merged members):
  * Every legacy KPI (keyResults[].kpis, .kpis, stageGates[].kpis, child tasks'
    kpis) -> one key result, deduped by (name, direction, target). increase->up,
    decrease->down, current->seed kpiUpdate, units->unit. notMeasured / target
    0|None -> carried unscored.
  * task -> unified task (isStageGate tasks are the gates, not re-imported as
    tasks, but their KPIs still feed key results). stageGates -> stage-gates.
  * milestone/delivery -> milestones; dates -> integer day-counts (epoch 2020-01-01).
  * dependencies -> milestoneEdges (MS<->MS) / objectiveEdges (OBJ<->OBJ); other
    pairs dropped+counted. resources/equipment/model.status not migrated.

DRY-RUN by default. --apply writes via the broker (needs --token); originals untouched.
"""
import argparse
import json
import os
import sys
import time
from datetime import date

# ---- id allocation (mirrors core.js allocId) -------------------------------
ID_PREFIX = {"division": "DIV", "initiative": "INIT", "milestone": "MS",
             "objective": "OBJ", "keyResult": "KR", "stageGate": "SG",
             "task": "TSK", "kpi": "KPI"}
ID_PAD = {"initiative": 2, "milestone": 2, "objective": 2}


def _stem(t, parent_id, opts):
    if t == "division":
        return opts["code"]
    parent_stem = parent_id[parent_id.index("-") + 1:]
    if t == "objective":
        return f"{parent_stem}-{opts['quarter']}"
    return parent_stem


def alloc_id(t, parent_id, existing, **opts):
    base = f"{ID_PREFIX[t]}-{_stem(t, parent_id, opts)}-"
    mx = 0
    for i in existing:
        if i.startswith(base):
            try:
                mx = max(mx, int(i[len(base):]))
            except ValueError:
                pass
    pad = ID_PAD.get(t, 0)
    return f"{base}{str(mx + 1).zfill(pad) if pad else mx + 1}"


# ---- helpers ---------------------------------------------------------------
EPOCH = date(2020, 1, 1)
DIVISION_NAME_TO_ID = {"fuelcell": "DIV-FC", "electrolyzer": "DIV-EL",
                       "exploration": "DIV-EXP", "experimental": "DIV-EXP"}
DIVISION_DISPLAY = {"DIV-FC": "Fuel Cell", "DIV-EL": "Electrolyzer", "DIV-EXP": "Exploration"}
DEP_TARGET_IS_PREDECESSOR = True  # P.dependencies[].id = X means X precedes P (X -> P).


def iso_to_day(s):
    if not s:
        return None
    try:
        return (date.fromisoformat(str(s)[:10]) - EPOCH).days
    except ValueError:
        return None


def quarter_of(s):
    if not s:
        return None
    try:
        d = date.fromisoformat(str(s)[:10])
        return f"{d.year}Q{(d.month - 1) // 3 + 1}"
    except ValueError:
        return None


def dir_of(d):
    return "up" if d == "increase" else "down"


def norm(s):
    return " ".join((s or "").lower().split())


class Report:
    def __init__(self):
        self.counts = {}
        self.flags = []

    def bump(self, k, n=1):
        self.counts[k] = self.counts.get(k, 0) + n

    def flag(self, m):
        self.flags.append(m)

    def dump(self):
        print("\n=== MIGRATION DRY-RUN REPORT ===")
        print("counts:")
        for k in sorted(self.counts):
            print(f"  {k:46} {self.counts[k]}")
        if self.flags:
            print(f"\nflags ({len(self.flags)}):")
            for f in self.flags[:60]:
                print(f"  ! {f}")
            if len(self.flags) > 60:
                print(f"  ... and {len(self.flags) - 60} more")
        else:
            print("\nflags: none")
        print("================================")


# ---- the build -------------------------------------------------------------
def build(divisional, quarter_docs, rep):
    portfolio = {"divisions": [], "products": [], "models": [], "initiatives": [],
                 "milestones": [], "milestoneEdges": [], "objectives": [],
                 "objectiveEdges": [], "kpiDefs": []}

    div_ids = set()
    for p in divisional.get("projects", []):
        did = DIVISION_NAME_TO_ID.get(p.get("division"))
        if did:
            div_ids.add(did)
    for did in quarter_docs:
        div_ids.add(did)
    for i, d in enumerate(sorted(div_ids)):
        portfolio["divisions"].append({"id": d, "name": DIVISION_DISPLAY.get(d, d), "order": i})
        rep.bump("divisions")

    canon_products, canon_models = set(), set()
    for i, p in enumerate(divisional.get("products", []) or []):
        did = DIVISION_NAME_TO_ID.get(p.get("division"))
        portfolio["products"].append({"id": p["id"], "divisionId": did,
                                      "name": p.get("name") or p["id"], "order": i})
        canon_products.add(p["id"])
        rep.bump("products")
        for j, m in enumerate(p.get("models", []) or []):
            portfolio["models"].append({"id": m["id"], "productId": p["id"],
                                        "name": m.get("name") or m["id"], "order": j})
            canon_models.add(m["id"])
            rep.bump("models")

    projects = divisional.get("projects", []) or []
    gbyid = {p.get("id"): p for p in projects}
    remap = {}
    init_ids, ms_ids = [], []
    ms_new = set()

    for p in projects:
        if p.get("projectType") != "initiative":
            continue
        did = DIVISION_NAME_TO_ID.get(p.get("division"))
        if not did:
            rep.flag(f"initiative {p.get('name','?')!r}: unmapped division {p.get('division')!r} — skipped")
            continue
        nid = alloc_id("initiative", did, init_ids)
        init_ids.append(nid)
        remap[p["id"]] = nid
        portfolio["initiatives"].append({
            "id": nid, "divisionId": did, "name": p.get("name", ""), "desc": p.get("notes", ""),
            "plannedStart": iso_to_day(p.get("start")), "plannedEnd": iso_to_day(p.get("end")),
            "order": p.get("order", 0), "productId": p.get("productLine"), "modelId": p.get("productModel")})
        rep.bump("initiatives")
        for g in p.get("stageGates") or []:
            mid = alloc_id("milestone", nid, ms_ids)
            ms_ids.append(mid)
            portfolio["milestones"].append({"id": mid, "initiativeId": nid, "name": g.get("name", ""),
                                            "plannedDate": iso_to_day(g.get("endDate") or g.get("startDate")), "order": 0})
            ms_new.add(mid)
            rep.bump("milestones (from initiative gates)")

    umbrella = {}
    for did in sorted(div_ids):
        uid = alloc_id("initiative", did, init_ids)
        init_ids.append(uid)
        umbrella[did] = uid
        portfolio["initiatives"].append({
            "id": uid, "divisionId": did, "name": f"Unassigned — {DIVISION_DISPLAY.get(did, did)}",
            "desc": "Holds migrated objectives without a resolved initiative link; re-parent in-app.",
            "plannedStart": None, "plannedEnd": None, "order": 999, "productId": None, "modelId": None})
        rep.bump("initiatives (umbrella)")

    for p in projects:
        if p.get("projectType") not in ("milestone", "delivery"):
            continue
        did = DIVISION_NAME_TO_ID.get(p.get("division"))
        if not did:
            rep.flag(f"milestone {p.get('name','?')!r}: unmapped division {p.get('division')!r} — skipped")
            continue
        par = p.get("parentId")
        init_new = remap[par] if (par in gbyid and gbyid[par].get("projectType") == "initiative" and par in remap) else umbrella[did]
        mid = alloc_id("milestone", init_new, ms_ids)
        ms_ids.append(mid)
        remap[p["id"]] = mid
        portfolio["milestones"].append({"id": mid, "initiativeId": init_new, "name": p.get("name", ""),
                                        "plannedDate": iso_to_day(p.get("end") or p.get("start")), "order": p.get("order", 0)})
        ms_new.add(mid)
        rep.bump("milestones" if p.get("projectType") == "milestone" else "milestones (from deliveries)")

    # milestone -> milestone edges
    edge_seq = [0]

    def edge_id(pre):
        edge_seq[0] += 1
        return f"{pre}-{edge_seq[0]}"

    lead_nonzero = 0
    for p in projects:
        host_new = remap.get(p.get("id"))
        if host_new not in ms_new:
            continue
        for dep in p.get("dependencies") or []:
            tgt_new = remap.get(dep.get("id"))
            if tgt_new not in ms_new:
                rep.bump("dependencies dropped (not milestone<->milestone)")
                continue
            if (dep.get("leadDays") or 0) != 0:
                lead_nonzero += 1
            frm, to = (tgt_new, host_new) if DEP_TARGET_IS_PREDECESSOR else (host_new, tgt_new)
            portfolio["milestoneEdges"].append({"id": edge_id("MSE"), "fromMs": frm, "toMs": to,
                                                "lagDays": dep.get("leadDays") or 0})
            rep.bump("milestoneEdges")

    # ---- association maps (the layer the Gantt holds) ----
    prod_assoc = divisional.get("importProductAssoc", {}) or {}
    assoc = divisional.get("importAssociations", {}) or {}
    assoc_rev = {}
    for gid, refs in assoc.items():
        for ref in (refs or []):
            assoc_rev[ref] = gid

    def prefix_of(did):
        return did.split("-", 1)[1].lower() if "-" in did else did.lower()

    def resolve_pm(did, qid, fb_pl, fb_pm):
        a = prod_assoc.get(f"{prefix_of(did)}_{qid}") or {}
        pl = a.get("productLine") or fb_pl
        pm = a.get("productModel") or fb_pm
        return (pl if pl in canon_products else None), (pm if pm in canon_models else None)

    def resolve_init(did, qid):
        gid = assoc_rev.get(f"{prefix_of(did)}_{qid}")
        if gid is None:
            return None
        gp = gbyid.get(int(gid)) if str(gid).lstrip("-").isdigit() else gbyid.get(gid)
        seen = set()
        while gp and gp.get("id") not in seen:
            seen.add(gp.get("id"))
            if gp.get("projectType") == "initiative":
                return remap.get(gp["id"])
            par = gp.get("parentId")
            if par is None or par == gp.get("id"):
                break
            gp = gbyid.get(par)
        return None

    # ---- collect objective inputs from both sources ----
    inputs = []
    for p in projects:
        if p.get("projectType") == "objective":
            did = DIVISION_NAME_TO_ID.get(p.get("division"))
            if not did:
                rep.flag(f"gantt objective {p.get('name','?')!r}: unmapped division — skipped")
                continue
            inputs.append({"src": "gantt", "p": p, "did": did, "siblings": projects, "byid": gbyid})
    for did, qdoc in quarter_docs.items():
        qps = (qdoc or {}).get("projects", []) or []
        qbyid = {x.get("id"): x for x in qps}
        for p in qps:
            if p.get("projectType") == "objective":
                inputs.append({"src": "quarter", "p": p, "did": did, "siblings": qps, "byid": qbyid})

    # Merge units: a quarter objective merges with a gantt objective ONLY on an
    # unambiguous single (name, division) match across sources. Same-source
    # duplicates (e.g. two Gantt "Internal Stack Validation" under different
    # initiatives) are NEVER merged.
    gantt_objs = [m for m in inputs if m["src"] == "gantt"]
    quarter_objs = [m for m in inputs if m["src"] == "quarter"]
    gantt_idx = {}
    for g in gantt_objs:
        gantt_idx.setdefault((norm(g["p"].get("name")), g["did"]), []).append(g)
    units = []
    claimed = set()
    for q in quarter_objs:
        cands = [g for g in gantt_idx.get((norm(q["p"].get("name")), q["did"]), []) if id(g) not in claimed]
        if len(cands) == 1:
            claimed.add(id(cands[0]))
            units.append([cands[0], q])
        else:
            units.append([q])
            if len(cands) > 1:
                rep.flag(f"quarter objective {q['p'].get('name','?')!r} matched {len(cands)} gantt objectives by name — kept standalone (no merge)")
    for g in gantt_objs:
        if id(g) not in claimed:
            units.append([g])

    exec_docs = {d: {"objectiveState": [], "keyResults": [], "kpis": [], "stageGates": [],
                     "tasks": [], "kpiUpdates": []} for d in div_ids}
    obj_ids, kr_ids, sg_ids, task_ids, kpi_ids = [], [], [], [], []
    obj_id_by_member = {}
    ts_base = int(time.time() * 1000)
    ts_seq = [0]

    def next_ts():
        ts_seq[0] += 1
        return ts_base + ts_seq[0]

    for members in units:
        did = members[0]["did"]
        gms = [m for m in members if m["src"] == "gantt"]
        qms = [m for m in members if m["src"] == "quarter"]
        prim = (qms or gms)[0]["p"]

        q = None
        for m in (qms + gms):
            q = quarter_of(m["p"].get("start")) or quarter_of(m["p"].get("end"))
            if q:
                break
        q = q or "UNSET"
        if q == "UNSET":
            rep.flag(f"objective {prim.get('name','?')!r} ({did}): no derivable quarter — set in-app")
        oid = alloc_id("objective", did, obj_ids, quarter=q)
        obj_ids.append(oid)

        initiativeId = None
        for m in gms:
            par = gbyid.get(m["p"].get("parentId"))
            if par and par.get("projectType") == "initiative" and par["id"] in remap:
                initiativeId = remap[par["id"]]
                break
        if initiativeId is None:
            for m in qms:
                initiativeId = resolve_init(did, m["p"].get("id"))
                if initiativeId:
                    rep.bump("quarter objective -> real initiative (importAssociations)")
                    break
        if initiativeId is None:
            initiativeId = umbrella[did]
            rep.bump("objective -> umbrella initiative (no link resolved)")

        productId = modelId = None
        for m in gms:
            pl = m["p"].get("productLine")
            pm = m["p"].get("productModel")
            pl = pl if pl in canon_products else None
            pm = pm if pm in canon_models else None
            if pl:
                productId, modelId = pl, pm
                break
        if productId is None:
            for m in qms:
                pl, pm = resolve_pm(did, m["p"].get("id"), m["p"].get("productLine"), m["p"].get("productModel"))
                if pl:
                    productId, modelId = pl, pm
                    rep.bump("quarter objective product resolved via importProductAssoc")
                    break

        ps = next((iso_to_day(m["p"].get("start")) for m in (qms + gms) if m["p"].get("start")), None)
        pe = next((iso_to_day(m["p"].get("end")) for m in (qms + gms) if m["p"].get("end")), None)
        prog = prim.get("progress") or 0
        status = "complete" if prog >= 100 else ("in-progress" if prog > 0 else "not-started")
        portfolio["objectives"].append({
            "id": oid, "divisionId": did, "initiativeId": initiativeId, "milestoneIds": [],
            "quarter": q, "statement": prim.get("name", ""), "owner": ", ".join(prim.get("assignedTo") or []),
            "plannedStart": ps, "plannedEnd": pe, "order": prim.get("order", 0),
            "productId": productId, "modelId": modelId,
            "layer": ("execution" if qms else "roadmap")})
        exec_docs[did]["objectiveState"].append({"objectiveId": oid, "status": status})
        rep.bump("objectives (total)")
        if gms and qms:
            rep.bump("objectives merged (name+division collision)")
        elif gms:
            rep.bump("objectives from gantt roadmap")
        else:
            rep.bump("objectives from quarter execution")
        for m in members:
            obj_id_by_member[(m["src"], m["p"].get("id"), did)] = oid

        ex = exec_docs[did]
        kr_by_name, gate_by_name = {}, {}
        kpi_seen, task_seen = set(), set()

        def make_kr(name):
            key = norm(name)
            if key in kr_by_name:
                return kr_by_name[key]
            krid = alloc_id("keyResult", oid, kr_ids)
            kr_ids.append(krid)
            ex["keyResults"].append({"id": krid, "objectiveId": oid, "statement": name or "",
                                     "status": None, "order": len(kr_by_name)})
            kr_by_name[key] = krid
            rep.bump("keyResults")
            return krid

        def make_kpi(kpi, host_type, host_id, src):
            name = (kpi.get("name") or "").strip()
            if not name:
                return
            seen_key = (host_id, name.lower(), kpi.get("direction"), kpi.get("target"))
            if seen_key in kpi_seen:
                return
            kpi_seen.add(seen_key)
            kid = alloc_id("kpi", oid, kpi_ids)
            kpi_ids.append(kid)
            tgt = kpi.get("target")
            unscored = bool(kpi.get("notMeasured")) or tgt in (0, None)
            ex["kpis"].append({"id": kid, "objectiveId": oid, "hostType": host_type, "hostId": host_id,
                               "name": name, "direction": dir_of(kpi.get("direction")),
                               "target": (None if unscored else tgt), "unit": kpi.get("units"), "order": 0})
            rep.bump(f"kpis (under {host_type})")
            cur = kpi.get("current")
            if cur is not None and not kpi.get("notMeasured"):
                ex["kpiUpdates"].append({"id": "UPD-" + kid, "kpiId": kid, "value": cur,
                                         "timestamp": next_ts(), "note": f"migrated from {src}"})
                rep.bump("kpiUpdates (seed readings)")

        for m in members:
            p = m["p"]
            siblings = m["siblings"]
            byid = m["byid"]
            # native Key Results -> KR hosting its KPIs
            for kr in p.get("keyResults") or []:
                krid = make_kr(kr.get("name", ""))
                for kpi in kr.get("kpis") or []:
                    make_kpi(kpi, "keyResult", krid, f"KR:{kr.get('name', '')}")
            # stage-gates -> SG hosting its KPIs (gate.kpis + its backing task's kpis)
            for g in p.get("stageGates") or []:
                gname = norm(g.get("name"))
                sgid = gate_by_name.get(gname)
                if sgid is None:
                    sgid = alloc_id("stageGate", oid, sg_ids)
                    sg_ids.append(sgid)
                    ex["stageGates"].append({"id": sgid, "objectiveId": oid, "name": g.get("name", ""), "gate_id": None,
                                             "plannedDate": iso_to_day(g.get("endDate") or g.get("startDate")),
                                             "actualDate": None, "status": None, "order": 0})
                    gate_by_name[gname] = sgid
                    rep.bump("stageGates")
                for kpi in g.get("kpis") or []:
                    make_kpi(kpi, "stageGate", sgid, f"gate:{g.get('name', '')}")
                bt = byid.get(g.get("subProjectId"))
                if bt:
                    for kpi in bt.get("kpis") or []:
                        make_kpi(kpi, "stageGate", sgid, f"gate-task:{bt.get('name', '')}")
            # objective-level KPIs have no KR/gate host under v1.3 -> drop + count
            for kpi in p.get("kpis") or []:
                if (kpi.get("name") or "").strip():
                    rep.bump("KPIs dropped (objective-level, no host)")
            # tasks
            for t in siblings:
                if t.get("parentId") != p.get("id") or t.get("projectType") != "task":
                    continue
                if t.get("isStageGate"):
                    continue  # gate-backing task; its KPIs went to the gate above
                for kpi in t.get("kpis") or []:
                    if (kpi.get("name") or "").strip():
                        rep.bump("KPIs dropped (non-gate task, no host)")
                tname = norm(t.get("name"))
                if tname in task_seen:
                    continue
                task_seen.add(tname)
                tid = alloc_id("task", oid, task_ids)
                task_ids.append(tid)
                ex["tasks"].append({"id": tid, "objectiveId": oid, "name": t.get("name", ""),
                                    "plannedStart": iso_to_day(t.get("start")), "plannedEnd": iso_to_day(t.get("end")),
                                    "percentComplete": t.get("progress") or 0, "actualStart": None,
                                    "actualEnd": iso_to_day(t.get("completedDate")), "order": t.get("order", 0)})
                rep.bump("tasks")

    # objective -> objective edges (within the same source/bin)
    for inp in inputs:
        p = inp["p"]
        src = inp["src"]
        did = inp["did"]
        byid = inp["byid"]
        host_oid = obj_id_by_member.get((src, p.get("id"), did))
        if not host_oid:
            continue
        for dep in p.get("dependencies") or []:
            tgt = byid.get(dep.get("id"))
            if not tgt or tgt.get("projectType") != "objective":
                rep.bump("dependencies dropped (not objective<->objective)")
                continue
            tgt_did = did if src == "quarter" else DIVISION_NAME_TO_ID.get(tgt.get("division"))
            tgt_oid = obj_id_by_member.get((src, tgt.get("id"), tgt_did))
            if not tgt_oid:
                rep.bump("dependencies dropped (objective target unmapped)")
                continue
            if (dep.get("leadDays") or 0) != 0:
                lead_nonzero += 1
            frm, to = (tgt_oid, host_oid) if DEP_TARGET_IS_PREDECESSOR else (host_oid, tgt_oid)
            portfolio["objectiveEdges"].append({"id": edge_id("OBJE"), "fromObj": frm, "toObj": to,
                                                "lagDays": dep.get("leadDays") or 0})
            rep.bump("objectiveEdges")

    total_deps = sum(len(p.get("dependencies") or []) for p in projects)
    total_deps += sum(len(p.get("dependencies") or []) for qd in quarter_docs.values()
                      for p in (qd or {}).get("projects", []) or [])
    if total_deps:
        rep.bump("dependency links (total in source)", total_deps)
    if lead_nonzero:
        rep.flag(f"{lead_nonzero} dependency link(s) have non-zero leadDays mapped as positive lagDays — verify sign vs the Gantt")
    return portfolio, exec_docs


# ---- driver ----------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="indir", required=True)
    ap.add_argument("--out", dest="outdir", default=None)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--broker", default="https://web-production-b17a2.up.railway.app")
    ap.add_argument("--token", default=None)
    args = ap.parse_args()
    rep = Report()

    def load(name):
        p = os.path.join(args.indir, name)
        return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None

    divisional = load("divisional.json") or load("gantt.json") or {}
    quarter_docs = {}
    for fn in sorted(os.listdir(args.indir)):
        if fn.startswith("quarter_") and fn.endswith(".json"):
            quarter_docs[fn[len("quarter_"):-len(".json")]] = load(fn)

    portfolio, exec_docs = build(divisional, quarter_docs, rep)
    gantt_view = {"overrides": {}}
    rep.dump()

    if args.outdir:
        os.makedirs(args.outdir, exist_ok=True)
        json.dump(portfolio, open(os.path.join(args.outdir, "portfolio.json"), "w"), indent=2)
        json.dump(gantt_view, open(os.path.join(args.outdir, "gantt-view.json"), "w"), indent=2)
        for did, ex in exec_docs.items():
            json.dump(ex, open(os.path.join(args.outdir, f"EXEC-{did}.json"), "w"), indent=2)
        print(f"mapped docs written to {args.outdir}/ (review before --apply)")

    if not args.apply:
        print("DRY RUN — nothing written through the broker. Re-run with --apply to commit.")
        return

    if not args.token:
        print("--apply requires --token")
        sys.exit(1)
    import urllib.request
    ua = "Mozilla/5.0 (compatible; CeladyneRD/1.0)"

    def put(doc_id, doc):
        vreq = urllib.request.Request(f"{args.broker}/state/{doc_id}/version",
                                      headers={"Authorization": f"Bearer {args.token}", "User-Agent": ua})
        with urllib.request.urlopen(vreq) as r:
            etag = json.loads(r.read())["etag"]
        body = json.dumps({"doc": doc}).encode()
        preq = urllib.request.Request(f"{args.broker}/state/{doc_id}", data=body, method="PUT",
                                      headers={"Authorization": f"Bearer {args.token}", "Content-Type": "application/json",
                                               "If-Match": etag, "User-Agent": ua})
        with urllib.request.urlopen(preq) as r:
            return json.loads(r.read())

    print(put("portfolio", portfolio))
    print(put("gantt-view", gantt_view))
    for did, ex in exec_docs.items():
        print(put(f"EXEC-{did}", ex))
    print("apply complete — originals untouched.")


if __name__ == "__main__":
    main()