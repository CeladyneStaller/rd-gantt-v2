# Company > Unit > Division — Hierarchy Build Plan

Adds a two-tier grouping above the existing Division level so the portfolio reads
**Company → Unit → Division → Initiative → Objective**, and makes the suite able to
carry non-R&D (Business) divisions alongside the R&D ones.

```
Company: Celadyne
├─ Unit: Business          (kind: biz divisions)
│  ├─ Div: Financial
│  ├─ Div: Business Development
│  └─ Div: Human Resources
└─ Unit: Technical         (kind: rd divisions)
   ├─ Div: Electrolyzer
   ├─ Div: Fuel Cell
   └─ Div: Exploration
```

**Status:** planned, not started. This document is the sign-off baseline; engine and data-model
work begins only after it is confirmed.

---

## Scoring semantics (settled)

The three levels are three **different** computations, each matching the question it answers.

| Level | Computation | Answers |
|---|---|---|
| **Company** | nested — mean of *division scores* | "how are my divisions doing?" |
| **Unit** | flat — mean of *all objectives in the unit* | "how's the work going in general?" |
| **Division** | flat — mean of its objectives *(unchanged)* | "how's this division?" |

Consequences to keep in mind:

- **Company ≠ mean(units)** and **Company ≠ flat(all objectives).** All three are distinct numbers.
  The displayed Company figure will not equal the mean of the displayed Unit figures once the two
  units hold different numbers of divisions. This is expected, not a bug.
- A small note is rendered under the Company score reading **"Mean of division scores"** to explain it.
- **Weighting:** under the nested Company mean, each *division* is `1/N` of Company regardless of its
  objective count — a 2-objective division counts the same as a 20-objective one. Under the flat Unit
  mean, a larger division dominates its *unit's* score (but not the Company score). That split is the
  point: Company weights divisions equally; Unit weights the work as it actually is.

### Migration discontinuity (one-time)

Today every scope — division, company — flattens to objectives and takes a flat mean
(`objectivesInScope` → `mean(objectiveScore)`), with `case 'company': return objs.slice()`.
Rewriting Company to a nested mean **will move the Company number** for any existing portfolio the
moment it ships, whenever divisions have unequal objective counts. Anyone watching that figure across
the transition should expect the shift; the note under the score is what explains it.

---

## Phase 0 — Data model (additive, migration-safe)

- `portfolio.units`: first-class records `{ id, name, order }` — e.g. `UNIT-BIZ`, `UNIT-TECH`.
  First-class (like divisions) so they are nameable, orderable, and editable in Structure.
- `unitId` on each division (nullable). Absent → an "Unassigned" bucket, exactly how blank
  owner/quarter already behave in the grouping code.
- `kind` on each division: `'rd' | 'biz'`, **absent = `'rd'`**.
- `migrate.py`: seed the two units, assign the six divisions, set `kind`
  (FC / EL / EXP → `rd`; Financial / BD / HR → `biz`). Idempotent and additive —
  re-running changes nothing already set.

**Back-compat.** A portfolio with no `units` and no `unitId` still renders: one implicit company,
divisions ungrouped. No stored doc breaks. Docs stay sharded by division (no re-shard), the broker is
untouched, and existing `?division=` links keep working.

---

## Phase 1 — Core engine (`rdcore.js`, pure, tested before any UI)

- `objectivesInScope`: add `case 'unit'` → objectives whose division's `unitId` matches
  (needs a division → unit lookup from `portfolio`).
- `rollupUnit(unitId, portfolio, execDocs)` — flat mean; reuses the existing `score()` primitive.
- `rollupCompany` **rewritten** — no longer `objs.slice()`; now the mean over divisions of
  `score('division', divId, …)`. This is the real change, not a config flip.
- `_dimKey('unit')` → division → `unitId`; `_dimOrder` by `unit.order`; `divisionsInUnit`;
  `divisionKind(div)` (default `rd`).
- **Exports:** `rollupUnit`, the unit lookups, `divisionKind`.

**Tests (proven non-vacuous).** The decisive fixture is *unbalanced* — a 2-objective division and a
20-objective division in different units, where flat-mean and mean-of-divisions give different Company
numbers:

- Company = mean of division scores (revert to flat → the assertion fails, naming the difference).
- Unit = flat mean of its objectives (the large division dominates its *unit* but not the *company*).
- Back-compat: no units → Company still computes, divisions ungrouped.

---

## Phase 2 — Cross-namespace rollup (decision C — where `kind` first acts)

Today the planning app fetches one exec doc per division through a single hardcoded prefix
(`execIdFor(divId)` → `"EXEC-"+divId`), and feeds them to `RD.rollupCompany`. `objectiveScore` pulls
KR/KPI readings from those `execDocs`, so a full Company rollup genuinely needs every division's
execution data.

- `execIdFor(divId)` becomes **kind-aware**: `rd → "EXEC-"+div`, `biz → "BIZ-"+div`.
  The fetch loop pulls the right prefix per division. This is the first non-cosmetic use of `kind`.
- A Company rollup with a Business division correctly pulls that division's KR/KPI scores from its
  `BIZ-` doc — the namespace the **Sales app** already writes.

**Test.** A company fixture with one `biz` division proves its `BIZ-` readings feed the Company number.

---

## Phase 3 — Planning renderers (the bulk of the work)

- **Overview.** Insert a Unit tier: unit sections carrying the unit score, division cards nested
  beneath; the Company hero gains the *"Mean of division scores"* note. Both existing division walks
  learn the grouping. Units don't overlap, so this is simpler than the owner fan-out.
- **Gantt.** Add Unit as a tree level — Company → Unit → Division → Initiative → Objective.
  The existing collapse / level machinery extends by one tier.
- **Structure.** Group division tables by unit; add unit management — create / rename / reorder units,
  assign a division to a unit, set a division's `kind`. This is the editing surface for the new fields.
- **`?unit=<id>`** URL param, parallel to `?division=`, case-insensitive through the existing `URLP`.

---

## Phase 4 — Exec / Sales app (light)

Already namespace-scoped via the Sales copy (`EXEC-` vs `BIZ-`). Optionally surface the unit in the
header context. Minimal — nothing gated yet.

---

## Explicitly deferred (per "analogs eventually")

`kind` is **recorded and drives namespace selection** (Phase 2), but it does **not** yet gate which
views render. Business divisions will show empty R&D machinery (Gantt stage-gate lanes, spec / gate
columns) for now. Hiding those — and building the Business *analogs* that replace them — is a separate
effort once those analogs are designed. This keeps the current build to hierarchy + scoring + the one
honest use of `kind`.

---

## Migration & back-compat (throughout)

- All new fields are additive; absent values resolve to safe defaults (`kind` → `rd`, no `unitId` →
  Unassigned, no `units` → ungrouped).
- No re-shard: documents remain sharded by division.
- No broker change; no change to doc identity.
- Existing `?division=` links, `EXEC-` docs, and `SPEC-` references are unaffected.

---

## Test surface

- Core: unit / company assertions on an unbalanced fixture (Phase 1), proven non-vacuous by reverting
  to the flat Company mean.
- Cross-namespace: a `biz` division's `BIZ-` doc feeding the Company score (Phase 2).
- Planning DOM: the unit tier, unit CRUD, and `?unit=` (Phase 3).
- Migration idempotency.
- The full headless sweep stays green throughout; the assertion baseline grows deliberately per phase.

---

## Suggested turn boundaries

Three coherent, independently shippable turns, each green through a full sweep:

1. **Data model + `migrate.py` + core engine + core tests** — pure logic, the foundation.
2. **Cross-namespace fetch + Overview unit tier + tests** — the rollup becomes real and visible.
3. **Gantt tier + Structure unit CRUD + `?unit=` + tests** — the management surface.

The hierarchy and scoring are the high-confidence part; Phase 3's renderers are where the time goes.

---

## Change log by phase (files touched)

Rollups are tested in `rdcore.js` and inlined into all apps by `build.py`; a green headless sweep gates every phase.

### Phase 0 — data model *(done)*
- **`migrate.py`** — added `UNITS` table, `DIVISION_UNIT` / `DIVISION_KIND` maps, `SEED_BIZ_DIVISIONS`; extended `DIVISION_DISPLAY` with the business names. `build()` now emits `portfolio["units"]`, and every division row carries `unitId` (None → Unassigned) and `kind` (`'rd'|'biz'`, absent → rd). The three business divisions are seeded even when the source has none.
- **`planning_app.template.html`** — `blankPortfolio()` gains `units:[]`. *(rebuilds `planning_app.html`)*
- **`hierarchy_phase0.test.py`** — new, 40 assertions (units first-class, division `unitId`/`kind`, biz seed, additive + idempotent, absent-means-rd).

### Phase 1 — core engine *(done)*
- **`rdcore.js`** — new helpers `_divRow`, `unitIdOfDivision`, `divisionKind`, `divisionsInUnit`; `objectivesInScope` gains `case 'unit'`; new `rollupUnit` (flat mean of a unit's objectives); `rollupCompany` **rewritten** to the nested mean of division scores (keeps optional `quarter`); `_dimKey('unit')` and `_dimOrder` for units; four new exports. *(rebuilds all four apps)*
- **`core.test.js`** — Phase 1 assertions on an unbalanced fixture (371 → 390); fixed one pre-existing fixture to declare `divisions` (the nested company now means over them).

### Phase 2 — cross-namespace rollup *(done)*
- **`planning_app.template.html`** — `execIdFor(divId)` becomes kind-aware (`rd → EXEC-`, `biz → BIZ-`) via new `divisionKindOf`; `execMap()`'s reverse-strip replaced by `stripDocPrefix` that strips the known workspace prefixes (`EXEC-` / `BIZ-`) instead of the old hardcoded `slice(5)` — which corrupted `BIZ-` keys and, in the too-clever first fix, legacy non-`DIV-` division ids. *(rebuilds `planning_app.html`)*
- **`hierarchy_phase2.cjs`** — new, 13 assertions (kind picks the prefix, `watchedDocs` lists both, `stripDocPrefix` round-trips both namespaces, rollup math given a loaded biz doc).
- **`broker_patch.py`** — the planning app now *requests* `BIZ-<div>` docs, so the broker must be able to *serve* them. Added a `BIZ_DIVISIONS` env var (separate from `UNIFIED_DIVISIONS`, disjoint namespaces) and `BIZ-<div>` docs in `_DOC_IDS`/`BIN_FOR`. A business division gets only a `BIZ-` doc (no `EXEC-`/`SPEC-`); default empty → biz is opt-in.
- **`create_bins.py`** — `DOC_IDS` now matches the broker exactly: `EXEC-` + `SPEC-` per R&D division, `BIZ-` per business division, driven by the same env vars (it previously emitted only `EXEC-`). So the env lines it prints match the `<DOC>_BIN` names `BIN_FOR` reads.
- **`hierarchy_broker.test.py`** — new, 9 assertions (broker builds `BIZ-` docs for each `BIZ_DIVISIONS` entry and only those; a biz division gets no `EXEC-`/`SPEC-`; `create_bins.DOC_IDS` equals the broker's `_DOC_IDS`; biz absent when `BIZ_DIVISIONS` unset).

**Deploy step (when ready for real business data):** run `create_bins.py` with `UNIFIED_DIVISIONS` + `BIZ_DIVISIONS` set → creates the bins and prints the `<DOC>_BIN` env lines; paste those plus `BIZ_DIVISIONS` into the Railway broker service and redeploy the single worker. Do this **before the first save from the Sales app for a business division** — reads of a missing bin degrade gracefully (division renders empty), but a write to an unregistered bin fails.

### Phase 3 — planning renderers *(done)*
- **`planning_app.template.html`** — Overview restructured: a **Company hero** with the *"Mean of division scores"* note, and division cards grouped under **Unit sections** each showing a per-unit score (Unassigned section for divisions with no `unitId`). `?unit=<id>` added to `URLP` and threaded through `pfFilters` → `structDivShows`, so it scopes the whole app to one unit's divisions (case-insensitive param name). `unit` added to `GROUP_DIMS` (first) + `dimLabel`, so the **Gantt and group-by** can group by unit — reusing the Phase 1 `_dimKey('unit')`/`_dimOrder`. Structure editing: `SEL.unit`, a new `enum:` field type, and the division schema gains a **Unit** (`ref:unit?`) and **Kind** (`enum:rd,biz`) field — the lightweight management surface. New CSS for the hero and unit sections. *(rebuilds `planning_app.html`)*
- **`hierarchy_phase3.cjs`** — new, 25 assertions (company hero + note + score, unit sections + per-unit scores + order, Unassigned bucket, `?unit=` scoping, `unit` group dimension, division `unitId`/`kind` schema).

### Phase 3 (remainder) — unit-record CRUD *(done)*
- **`rdcore.js`** — `allocId` learns the `unit` type (`UNIT-<code>` from an explicit short code, dedupe-guarded), mirroring `division`.
- **`planning_app.template.html`** — a **Units** section in the Structure tab (new / edit / delete, with name, order, and a member-division count); `SCHEMAS.unit` (name + order); `allocFor("unit")` mints `UNIT-<code>` from the name; `SEL.unit` lazily creates `portfolio.units` on a pre-Phase-0 bin; `cascadeSet("unit")` returns `[]` (a unit owns nothing); and deleting a unit **clears the `unitId` on its member divisions** (they become Unassigned, not deleted) with a delete-modal message that says so. *(rebuilds `planning_app.html`)*
- **`hierarchy_unit_crud.cjs`** — new, 22 assertions (Units table + controls, `UNIT-<code>` allocation + dedupe, create/rename/reorder via the model, `SEL.unit` lazy-init, and the delete path clearing referencing divisions without deleting them).

### Phase 4 — exec/Sales unit context *(done)*
- **`execution_app.template.html`** and **`sales_app.template.html`** (identical edits, so the two stay byte-identical but for namespace + branding) — the division picker now groups divisions by **unit** via `<optgroup>` (ordered; an Unassigned group last; flat list when there are no units), and a small header **unit tag** shows which unit the current division sits in. Orientation only — nothing is gated. *(rebuilds `execution_app.html` + `sales_app.html`)*
- **`hierarchy_phase4.cjs`** — new, 24 assertions run against BOTH builds (grouped picker + order + Unassigned-last + correct membership, the unit tag reflecting/hiding, and flat-list back-compat with no units).

### Deferred (not in this plan's scope)
- `kind`-gated hiding of R&D views for business divisions, and the business analogs.

---

**All four phases complete.** The hierarchy is live end to end: data model + migration (Phase 0), engine (Phase 1), cross-namespace fetch + broker (Phase 2), planning renderers + unit CRUD (Phase 3), and exec/Sales unit context (Phase 4).

### Division-visibility gating *(done, added after Phase 4)*
- **`execution_app.template.html`** and **`sales_app.template.html`** (identical edits) — each app now shows/selects only its own kind of division: the **Sales app only `kind=biz`**, the **Execution app only `kind=rd`**. Each derives its kind from `execId()`'s prefix (`BIZ-`/`EXEC-`) via `appKind()`, so no new template divergence. The gating covers the picker (`fillDivSelect` filters), the default division (`firstAppDivision`), a wrong-kind `?division=`/remembered value (`resolveDivision` re-validates once the portfolio is loaded), and programmatic `switchDivision`. *(rebuilds both apps)*
- **`kind_gating_divisions.cjs`** — new, 16 assertions across both builds. **`hierarchy_phase4.cjs`** rescoped to the Execution app (its unit-grouping assertions no longer hold identically for both, since each app shows a different kind).
- *Note:* this is the "which divisions are visible" gating. Hiding the R&D machinery (stage-gates/FMEA/specs) inside the Sales app for business divisions is separate and will be handled by editing the Sales app directly.
