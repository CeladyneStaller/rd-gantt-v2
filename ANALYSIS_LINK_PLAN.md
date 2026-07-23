# Analysis-portal → Execution app data link

**Status:** proposal. Revised twice: against the shipped portal (`record.py`, `jsonbin.py`), then to the **v1 one-shot import** model. No app/broker code written.
**Goal:** a KPI in the execution app takes its readings from a metric produced by the analysis portal, instead of being typed in by hand.

> **Revision note.** The portal has moved past the single-`runs`-log design this doc first assumed. It now manages a JSONBin **collection**: one **index bin** plus one **detail bin per run**, built by pure functions in `record.py`. §1–§3 below are rewritten to the shipped shape; several earlier forks are now settled by it and marked so in §4.

---

## 1. What exists today (read from the uploaded source)

**Portal — `record.py` (pure) + `jsonbin.py` (transport).** Per completed job the portal writes two artefacts:

- **Detail bin** (`build_detail_record`, schema 2), one per run, created into a collection (`X-Collection-Id`) and named for the dashboard. Body:
  ```jsonc
  { "schema": 2, "job_id", "sample_name", "script", "timestamp", "input_files",
    "metrics": { "<bucket>": { "<plot_name>": { "conditions": {...}, "values": {...} } } },
    "conditions": {…} | null,          // top-level ONLY when every plot's conditions are identical
    "summary": {…},                    // optional tier-1 scalars from the results dict
    "sidecars": { "encoding":"gzip+base64", "data":"…" },   // tier-3 full plot data, compressed
    "sidecar_bytes_by_bucket": {…} }
  ```
- **Index entry** (`build_index_entry`), one per run, appended to the index bin (`{ "schema": 2, "runs": [ …entries… ] }`):
  ```jsonc
  { "job_id", "sample_name", "script", "timestamp", "bin_id",
    "Data": [ { "Analysis": "polcurve", "step": "", "Conditions": {T_C:80, RH_pct:100},
                "key_values": { "OCV": 0.953, "V @ 1 A/cm": 0.68 } }, … ] }
  ```

Three properties of the shipped design matter for us, and each closes a problem the first draft had to solve itself:

1. **Stable, allowlisted series identity.** `build_key_values` promotes values through a per-bucket allowlist `KEY_VALUES` (`bucket → [(canonical, [candidate spellings])]`), **summary-first** so the results-dict name beats the display-form annotation. So a metric is addressed by `(Analysis bucket, canonical key)` — e.g. `("polcurve","OCV")` — *not* by plot-name or parsed annotation. `plot_name` never appears in the index. (Shipped canonical keys: polcurve `OCV`, `V @ 1 A/cm`; eis `HFR`; crossover `|j_xover|`; ecsa `Average ECSA`. Units per key in `KEY_VALUE_UNITS`.)
2. **Conditions are per analysis unit.** `_analysis_units` groups plots into `(Analysis, step, Conditions)` units and merges their values; `build_detail_record`'s top-level `conditions` is populated **only** when every plot agrees, else `null`. A mixed-setpoint run is represented as several units — no first-parsed-wins blending.
3. **Comparison output is refused at the source** (`is_comparison_script` → `ValueError` in `build_detail_record`), so derived overlays never enter the store.

**Broker — `broker_patch.py` (Railway).** Resolves `doc_id → bin id` via `<DOC>_BIN` env vars, master key server-side. `GET /state/{doc_id}` is cached **and the cache is authoritative** ("this broker is the only writer"); `GET /roster` is **read-through, uncached**, precisely because something else writes that bin.

**Execution app.** KPIs already have `readsFrom` (internal borrowing: a `targetType:"statistical"` holder owns readings, others borrow). Readings are rows in `exec.kpiUpdates` — `{id, kpiId, value, timestamp, note}` — and the ETB already writes them with provenance in `note`.

---

## 2. What the shipped portal already solved (vs. the original problem list)

- **(a) Reading the whole archive** → solved by the split. The app reads **one small index bin** to resolve a value, and touches a detail bin only for drill-down.
- **(b) Unstable metric identity** → solved by `KEY_VALUES`. Binding to `(bucket, canonical)` is immune to filename and annotation churn; the candidate list is the alias mechanism.
- **(c) Condition granularity** → solved by per-unit `Conditions` + the guarded top-level.

**What is left for us:** everything on the *consumption* side — the read transport, the KPI binding shape, the unit→reading match, and the failure-state UX.

---

## 3. v1 design — manual per-sample import (no lasting connection)

**The model changed.** v1 does not bind a KPI to a series. It is a **one-shot read**: the user opens a picker, chooses **one sample**, multi-selects **some of its measured values**, and those land as readings. Nothing is stored that would re-pull later. This removes `analysisRef`, aggregation (`agg`/`n`), staleness states, and re-sync entirely.

Provenance is still written onto each reading (`src`), because knowing where a number came from is cheap and valuable — but it is a *record of an import*, not a live link.

### 3.1 Entry points ("Connect data")

Three, all manual:

| Where | Behaviour |
|---|---|
| **Key result** row | opens the picker; selected values become readings on KPIs hosted by that KR (`hostType:"keyResult"`) |
| **Stage-gate** row | same, for KPIs hosted by that gate (`hostType:"stageGate"` — already a supported host) |
| **Record Outcome** modal (ETB) | opens the picker; selected values **populate the key-read inputs** in the modal. The existing save path (`__erReadings` → `writeKpiUpdatesFromReads`) posts them, so nothing is written behind the user's back |

### 3.2 The picker modal

1. **Default view — last 5 samples.**
2. **Filtered search** over the index (see 3.4), any combination of fields.
3. **Result list** — one row per sample: name, most recent run date, which analyses it has.
4. **Click a sample** → expands to its **analysis units**, each showing its `Conditions` and `key_values`, with a **checkbox per value**. Multi-select across units, so one import can take polcurve OCV *and* H₂ crossover from the same sample.
5. **Confirm** → values are handed to the host context (3.5).

### 3.3 A "sample" spans several runs — this is structural

The index is **one entry per job**, not per sample. A polcurve run and an H₂-crossover run on the same MEA are *separate entries sharing `sample_name`*. Corey's own example ("pol curve current and hydrogen crossover") therefore requires gathering across runs.

So the modal groups index entries by `sample_name`, and "last 5 samples" means **5 distinct sample names**, ordered by their most recent run — not the last 5 runs. Clicking a sample unions the `Data[]` units from *all* of its runs; each unit keeps its own `script`/`timestamp` so the user can tell which run a value came from.

### 3.4 Search fields → index fields

Conditions live **per analysis unit** (`Data[].Conditions`), so a condition filter selects *units*; a sample matches if any of its units match, and the result row shows which did.

| Requested filter | Index field | Notes |
|---|---|---|
| Analysis type | `Data[].Analysis` | `polcurve`, `eis`, `crossover`, `ecsa`, … |
| Sample name | `sample_name` | contains / exact / starts-with |
| Temperature | `Data[].Conditions.T_C` | |
| RH | `Data[].Conditions.RH_pct` | |
| Pressure | `Data[].Conditions.P_value` + `P_unit` | **unit varies** (`kPa`/`barg`/`psi`/`bar`) — compare only within a unit, or normalise before comparing |
| *(bonus)* step | `Data[].Conditions.step` | already part of unit identity; cheap to expose |
| **Cathode flow** | — **not stored as such** | see F-A |
| **Anode flow** | — **not stored as such** | see F-A |

`parse_conditions` records flows **by gas species** — `H2_slpm`, `Air_slpm`, `O2_slpm`, `N2_slpm` — never by electrode. Mapping electrode→species is an inference that **inverts between product lines** (PEM fuel cell: anode = H₂, cathode = air/O₂; PEM electrolyser: cathode = H₂, anode = O₂), and `N2_slpm` is ambiguous either way. Resolving this is fork **F-A**; everything else in the table is a direct read.

### 3.5 What an import writes

Each selected value becomes one `kpiUpdate`:

```jsonc
{ id, kpiId, value, timestamp, note: "analysis: polcurve/OCV",
  src: { portal:"analysis", job_id, bin_id, sample:"MEA-17",
         bucket:"polcurve", key:"OCV", step:"", cond:{T_C:80, RH_pct:100},
         run_t:"2026-07-19T14:02:00Z", imported_t:"…" } }
```

- **Target KPI** per selected value — fork **F-B**.
- **Idempotency:** re-importing the same `(job_id, bucket, key, step, cond)` onto the same KPI is offered as a duplicate warning rather than silently appended; the user is doing this deliberately, so it warns, it doesn't block.
- **Units:** `KEY_VALUE_UNITS[key]` is shown next to each value. If the target KPI declares a different unit, the modal warns and **does not convert**.
- On **Record Outcome**, nothing is written at import time — the values populate the modal's key-read inputs and follow the existing record path.

### 3.6 Condition matching is the user's call (F-MATCH, settled)

No automatic matcher. The modal shows each unit's conditions plainly and the user picks the unit they want; the conditions come along in `src` as a record of what was taken. There is no stored predicate to drift.

### 3.7 Edge states

| Case | Behaviour |
|---|---|
| Index unreachable / malformed | modal shows a clear error; no partial import |
| Sample has runs but no promoted `key_values` | sample listed, expands to "no published values" (its metrics weren't in `KEY_VALUES`) |
| A unit has conditions but no values (aggregate plots) | omitted from selection — `_analysis_units` already drops pure-noise units |
| Selected value is non-numeric / null | not selectable |

---

## 4. Decision forks

**Settled:** F1 (portal compiles the index), F2 (separate index bin), F5 (allowlisted via `KEY_VALUES`), F3 (manual — the three "Connect data" entry points in 3.1), F4 (execution app only), F-DETAIL (index only for v1; detail-bin drill-down later), F-MATCH (user picks the unit; no matcher).

**Open — needed before building:**

**F-A — how to expose anode/cathode flow filters.** The index stores species, not electrodes.
- *Default: filter by species* (`H₂`, `Air`, `O₂`, `N₂`). Unambiguous, no inference, correct for both product lines.
- *Alt 1:* electrode labels with a fuel-cell/electrolyser mode toggle in the modal, mapping to species per mode.
- *Alt 2:* infer mode from the division or script name and label accordingly — most ergonomic, most silent-failure-prone.
- *Alt 3:* label with both, e.g. "H₂ (anode in FC)".

**F-B — what an imported value attaches to** on a KR / stage-gate.
- *Default: explicit target per value.* In the selection list each checked value gets a target dropdown listing the KPIs hosted by that KR/gate, **pre-selected** when a KPI's name matches the canonical key, plus a "create new KPI" option (named from the canonical key, unit from `KEY_VALUE_UNITS`). No silent guessing, and multi-value imports still work in one pass.
- *Alt:* always create new KPIs (simpler, but duplicates on repeat imports).

**F-C — "last 5 samples" granularity.** *Default: 5 distinct `sample_name`s* by most recent run (per 3.3), not 5 runs. Confirm.

---

## 5. Build phases

1. **Engine (`rdcore`, pure + headless-tested).** No network, no DOM:
   - `analysisIndexSamples(index)` → samples grouped from runs: `[{sample, lastRun, scripts, units:[{job_id, bin_id, script, timestamp, Analysis, step, Conditions, key_values}]}]`
   - `analysisSearch(index, filters)` → filtered samples + which units matched (contains/exact name modes, numeric condition matches, pressure compared within `P_unit`)
   - `analysisRecentSamples(index, n=5)`
   - `validateAnalysisIndex(raw)` → guards `schema:2` + `runs` shape so a bad index degrades visibly
   - `buildImportUpdates(selection, targets, now)` → the `kpiUpdate` rows incl. `src`, with duplicate detection
2. **Broker.** `GET /analysis` read-through (uncached, ~60 s TTL) + `ANALYSIS_INDEX_BIN`; mirrors `/roster`. Master key stays server-side.
3. **Execution app UI.** "Connect data" on KR rows, stage-gate rows, and the Record Outcome modal; the picker modal (recent + search + sample expansion + multi-select + targets); write path per 3.5.

Testing per the usual rules: engine gets a pure Node harness against fixtures shaped exactly like `build_index_entry` output; the app gets a jsdom harness with a mocked broker serving a fixture index, **driving the real controls** — clicking the actual "Connect data" button, asserting the modal is visible in the container the trigger opens, checking a checkbox, confirming, and verifying the `kpiUpdate` landed — rather than calling handlers directly.

---

## 6. Portal-side notes (re-checked against the uploaded `record.py` / `jsonbin.py`)

Most of the original list is now moot — the split architecture fixed reading-the-archive, identity, and condition granularity. What remains:

1. **`fetch_index` still discards siblings** (narrowed, low-risk). If `runs` isn't a list it rebuilds the record as `{schema:2, runs:[]}`, dropping any other top-level keys before the next PUT. The index bin has no meaningful siblings today, so this is benign — worth a one-line guard only if the index ever grows sibling fields.
2. **Single-instance locking.** `_index_lock` serialises append-index within one process; a second Railway instance would still race the index's read-modify-write and lose runs. Now that there are two writers per job (create detail bin, then append index), this is marginally more exposed. `X-Bin-Versioning` on the index is the fix if multi-instance ever happens.
3. **Unbounded index growth.** The index is one entry per run and rewritten whole on each append — smaller than the old full archive, but still linear. A retention window on the index (last N runs / N months) with the detail bins keeping everything is worth planning before the index approaches the ~1 MB proxy cap. (Detail bins already dodge that cap via gzip+base64 sidecars.)
4. **413 on large sidecars is handled but silent-ish.** `record.py` compresses sidecars specifically because JSONBin's proxy rejects >~1 MB bodies; a pathological run could still exceed the cap after compression. Confirm the transport surfaces that as a visible push failure (it should, via the existing return-dict pattern) rather than dropping the detail bin quietly.
