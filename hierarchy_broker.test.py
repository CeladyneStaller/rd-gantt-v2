#!/usr/bin/env python3
# Phase 2 loose end: the planning app now REQUESTS BIZ-<div> docs for business divisions, so the broker must be
# able to SERVE them and create_bins must MAKE them. Two things this pins:
#   1. broker_patch._DOC_IDS / BIN_FOR include BIZ-<div> exactly when BIZ_DIVISIONS is set (and only those).
#   2. create_bins.DOC_IDS equals broker _DOC_IDS for the same env — otherwise the env lines create_bins prints
#      would not match the <DOC>_BIN names BIN_FOR reads, and the broker would resolve None for the new bins.
import os, sys, importlib.util

OUT = os.environ.get("RD_OUT", "/mnt/user-data/outputs")
n = 0; fails = 0
def ok(cond, msg):
    global n, fails; n += 1
    if not cond: fails += 1; print("FAIL " + msg)

# ---- import broker_patch with a representative env (module-level _DOC_IDS/BIN_FOR compute before the routes,
#      so fastapi is not exercised) ----
os.environ["UNIFIED_DIVISIONS"] = "DIV-FC,DIV-EL"
os.environ["BIZ_DIVISIONS"] = "DIV-FIN,DIV-BD,DIV-HR"
os.environ.setdefault("JSONBIN_MASTER_KEY", "test-key")
spec = importlib.util.spec_from_file_location("broker_patch", os.path.join(OUT, "broker_patch.py"))
bp = importlib.util.module_from_spec(spec); spec.loader.exec_module(bp)

# ---- 1. the broker's doc set ----
biz_docs = [d for d in bp._DOC_IDS if d.startswith("BIZ-")]
ok(set(biz_docs) == {"BIZ-DIV-FIN", "BIZ-DIV-BD", "BIZ-DIV-HR"},
   "the broker builds BIZ-<div> docs for each BIZ_DIVISIONS entry")
ok("BIZ-DIV-FIN" in bp.BIN_FOR, "BIN_FOR is keyed for the BIZ- docs (so the /state handler can resolve them)")

# a biz division gets ONLY a BIZ- doc — no EXEC-/SPEC- (those belong to R&D divisions)
ok("EXEC-DIV-FIN" not in bp._DOC_IDS and "SPEC-DIV-FIN" not in bp._DOC_IDS,
   "a business division gets no EXEC-/SPEC- doc (the two namespaces stay disjoint)")
# an R&D division still gets EXEC-/SPEC- and NOT a BIZ- doc
ok("EXEC-DIV-FC" in bp._DOC_IDS and "SPEC-DIV-FC" in bp._DOC_IDS,
   "an R&D division still gets its EXEC- and SPEC- docs")
ok("BIZ-DIV-FC" not in bp._DOC_IDS, "...and no BIZ- doc")

# env-var name mapping is the shared one: BIZ-DIV-FIN -> BIZ_DIV_FIN_BIN
ok(bp._env_name("BIZ-DIV-FIN") == "BIZ_DIV_FIN_BIN", "a BIZ- doc maps to the <DOC>_BIN env var name")

# ---- 2. create_bins emits EXACTLY the broker's doc set for the same env ----
spec2 = importlib.util.spec_from_file_location("create_bins_dryrun", os.path.join(OUT, "create_bins.py"))
# create_bins runs its network loop at import; read + exec only the doc-set computation to avoid hitting JSONBin
src = open(os.path.join(OUT, "create_bins.py"), encoding="utf-8").read()
ns = {"os": os}
# exec the two list comprehensions + the DOC_IDS assembly (everything before create_bin's definition)
head = src[: src.index("def create_bin(")]
exec(head, ns)
ok(ns["DOC_IDS"] == bp._DOC_IDS,
   "create_bins.DOC_IDS equals the broker's _DOC_IDS for the same env (env lines match BIN_FOR keys)")
# and specifically the BIZ- docs line up
ok([d for d in ns["DOC_IDS"] if d.startswith("BIZ-")] == [d for d in bp._DOC_IDS if d.startswith("BIZ-")],
   "the BIZ- docs create_bins would make are exactly the ones the broker will read")

# ---- with no BIZ_DIVISIONS, biz is absent entirely (opt-in) ----
os.environ["BIZ_DIVISIONS"] = ""
spec3 = importlib.util.spec_from_file_location("broker_patch_nobiz", os.path.join(OUT, "broker_patch.py"))
bp2 = importlib.util.module_from_spec(spec3); spec3.loader.exec_module(bp2)
ok(not any(d.startswith("BIZ-") for d in bp2._DOC_IDS),
   "with BIZ_DIVISIONS unset, the broker builds no BIZ- docs (biz is opt-in, no empty bins)")

if fails:
    print(f"\n{fails} / {n} FAILED"); sys.exit(1)
print(f"\nPASS - {n} broker BIZ- doc-set assertions green")
