# Sales tracking — final build plan
### Milestone KRs + Kanban stage-gating

Two additive tracking types for the **Sales app**: a `milestone` KR tracking type and a **Kanban** stage-gate variant (multiple boards per objective). Approved after the mockup + preview loop; all design forks resolved.

---

## Principles
- **Engine-first.** All scoring and scheduling logic is pure in `rdcore` and headless-tested; the app layer is thin on top.
- **Sales-owned.** Definition and data live in the `BIZ-<div>` doc. Planning views and rolls up; nothing is defined top-down.
- **Additive & migration-safe.** Older `BIZ-` docs load unchanged (missing fields default to empty). No change to existing `stageGates` or existing KR types.
- **This build produces the data + the shared derivation logic. The Gantt/Waterfall *rendering* of these items is a separate, later planning-app build.** What this build guarantees: the shape is forward-compatible, and the pure gate-date scheduler lives in `rdcore` so the Gantt consumes the same function.

---

## Data model (frozen)

### Milestone KR — embedded in the key result
```
keyResult {
  ...,
  trackingType: 'milestone',
  creditMode:   'binary' | 'partial',    // KR-level; binary is STRICT (full weight only at 100%)
  steps: [ { id, name, weight (nullable), due (iso), completion (0..100) } ]
}
```
- **Display label `KR-M{n}`** — n = 1-based position among *this objective's* milestone KRs. Non-milestone KRs keep `KR{n}`. Fully separate concept from roadmap milestones (`MS-{n}`).
- **Scoring** contributes 0–100 through `keyResultScore`, with identical weight to any other KR in the objective rollup.
- **Sum-to-100:** explicit weights kept; blank weights split `(100 − explicitSum)` evenly.

### Kanban — new `boards` collection in the `BIZ-` doc, keyed by `objectiveId`
```
board {
  id, objectiveId, name,
  columns:   [ { id, name, gate_id } ],                  // ordered gates
  swimlanes: [ { id, name, maxDaysPerCol, deadline } ],   // rules -> gate due dates + health
  tiles:     [ { id, name, lane, col, startDate, enteredCol } ]   // each tile = one workstream, named by tile name
}
```
- An objective may have **multiple boards** (different gate sequences for different drivers).
- Each **tile is one workstream instance** moving through the shared column sequence. Creating a tile creates an identical workstream with a new driver name.
- **Gates are binary** — passed iff a tile's `col` index is past that column. **No within-gate score.** Gate/health only; a KPI may read `boardSummary`.
- **Per-objective gate mode** (`classic` | `kanban`), stored in the `BIZ-` doc keyed by `objectiveId`: `classic` shows existing `stageGates`; `kanban` shows the board tabs.

---

## rdcore engine (pure, tested)

### Milestone
- `milestoneEffectiveWeights(steps)` → per-step weight; explicit kept, blanks split the remainder evenly.
- `milestoneStepContribution(step, w, mode)` → binary: `completion >= 100 ? w : 0`; partial: `w * completion / 100`.
- `milestoneKrScore(kr)` → Σ contributions, 0–100.
- **Wire into `keyResultScore`**: add `if (tt === 'milestone') return milestoneKrScore(kr);` — a one-branch, minimally-invasive addition to the existing `percentage`/`subkr`/kpi dispatch.

### Kanban
- `tileHealth(tile, swimlane, todayIso)` → `on-track | at-risk | breached` from days-in-column (vs `maxDaysPerCol`) + deadline proximity. No score.
- `boardSummary(board, todayIso)` → per-column counts + `{ onTrack, atRisk, breached, closed, total }` — the metrics a KPI reads.
- `dropTile(board, tileId, toCol, toLane)` → pure transition: advancing a column resets `enteredCol` to today; changing lane re-parents rules. Returns a new board.
- **`gateDueDates(columns, swimlane, tile)`** — the shared scheduler both Sales and the future Gantt call. Semantics: `due[i]` = the date the tile should have **cleared** column *i*.
  - Let `N = columns.length`, `M = swimlane.maxDaysPerCol`, `S = tile.startDate`, `D = swimlane.deadline`.
  - **No deadline (forward):** `due[i] = S + (i+1)·M`.
  - **Deadline present (work backwards to finish on time):** `due[N-1] = D`; `due[i] = D − (N−1−i)·M`. Feasible iff `(D − S) ≥ N·M`; when not, the schedule still renders but is flagged infeasible.
  - *Interpretation note:* "work backwards" = deadline-anchored, stepping back by `M` per column (as-late-as-possible while honoring the per-column budget). This is **not** even-distribution across the span. Flag me at plan approval if you meant even-distribution.

*(Uniform `maxDaysPerCol` for v1; per-column day budgets are a later extension of the same function.)*

---

## Phases — each shippable and sweep-green

**M1 — Milestone engine.** rdcore functions above + the `keyResultScore` branch. Pure harness: binary vs partial, blank-split, over-100, empty; plus a `keyResultScore → objectiveScore` integration test proving a milestone KR rolls up like any KR. *Ships: rdcore green; both apps unaffected until the UI lands.*

**M2 — Milestone UI (sales).** KR label `KR-M{n}` + collapsed summary `{done}/{total} steps · {score}%`; **status-only drawer** (checkbox in binary / % in partial, nothing else editable); **KR edit modal** (name, KR-level binary/partial toggle, editable step plan, live sum-to-100; draft-on-open, commit-on-save). Persist `steps` + `creditMode` in the KR in the `BIZ-` doc, migration-safe. **Retire the `sales_app.cjs` byte-identical assertion** → replace with "both apps build + each passes its own harness." jsdom harness: label, drawer-has-no-structural-editors, modal edit+save, score rollup. *Ships: milestone KRs usable in sales.*

**K1 — Kanban engine.** `tileHealth`, `boardSummary`, `dropTile`, `gateDueDates` + pure harness: health thresholds, summary counts, drop transitions, forward date math, backward date math, and the feasibility flag. *Ships: rdcore green.*

**K2 — Kanban UI (sales).** Per-objective classic-vs-kanban mode; **board tabs**; columns / swimlanes / tiles config; **drag-drop delegating to `dropTile`**; health coloring via `tileHealth`; surface `boardSummary` for KPI reads; mint `gate_id`s on columns. Persist boards in the `BIZ-` doc. jsdom harness: board/grid structure, and a simulated drop calls `dropTile` and persists. The **visual drag is eyeballed** (jsdom has no layout). *Ships: Kanban usable in sales.*

---

## Deferred to the planning-app build (separate, later — NOT this effort)
- Gantt / Waterfall rendering: milestone KRs as dated step-markers under a `KR-M` row; Kanban tiles as workstream rows with columns as gates placed at `gateDueDates`.
- This build only guarantees the shape and the shared `gateDueDates` function exist for that work to consume.

---

## Test & mechanics
- Pure harnesses for every rdcore function (must never regress); jsdom harnesses for each UI surface; visual drag + Gantt eyeballed.
- Sweep baseline updated per phase; `harnesses.zip` repacked.
- Single-pass phases, surgical `str_replace` on unique anchors, full sweep after each phase.


---

## Build log
- **M1 — milestone engine (rdcore): DONE.** `milestoneEffectiveWeights`/`milestoneStepContribution`/`milestoneKrScore` + `keyResultScore` dispatch branch, exported. Empty milestone KR → null (drops out of the objective mean). Tested in `milestone_engine.cjs` (26). Sweep 82/1913.
- **M2 — milestone UI (sales): DONE.** KR-M{n} chip, `{done}/{total} steps · {score}%` toggle, status-only drawer (`msStatusPanel`), and the KR edit modal (credit-mode toggle + editable step plan). Persisted in the `BIZ-` doc, migration-safe. **Sales app has now diverged from execution** — `sales_app.cjs` byte-identical assertion retired, replaced with a divergence check. Tested in `milestone_ui.cjs` (17). Sweep 83/1934.
- **K1 — kanban engine (rdcore): DONE.** `tileHealth`, `boardSummary`, `dropTile`, `gateDueDates` (the shared forward/backward scheduler) + iso↔day helpers, exported. Tested in `kanban_engine.cjs` (30). Sweep 84/1964.
- **K2 — kanban UI (sales): DONE.** Per-objective classic|kanban mode (persisted), board tabs (multiple boards), columns×swimlanes grid with tiles, drag-drop via `RD.dropTile`, health via `RD.tileHealth`, `RD.boardSummary` surfaced, `gate_id` minted per column (`<boardId>/<columnId>`). Persisted in the `BIZ-` doc. Tested in `kanban_ui.cjs` (19). Sweep 85/1983. **All four phases (M1, M2, K1, K2) complete.**

- **G1 — Gantt engine (rdcore): DONE.** `dropTile` now records `gatePassed` crossing dates; `gateTileState`, `boardGateSummary`, `milestoneGanttSteps` added. Tested in `kanban_engine.cjs` (47). **Kanban gate identity (`Kanban gate identity (`gate_id` = `<boardId>/<columnId>`) is internal — a gate is "passed" by a tile from its position on the board; there is no external resolver (Q_tracker was removed from the ecosystem).
- **G2 — planning Gantt UI: DONE.** Milestone-KR rows with dated steps as status diamonds (done/overdue/pending); Kanban boards as collapsible rows drawing a gate SQUARE per column at the latest-due-across-tiles point, labelled with the passed-count and coloured by worst tile status (red>orange>green>pending); expanding shows per-tile workstream rows with per-tile gate colours. Tested in `gantt_sales_tracking.cjs` (15). Sweep 85/1998. **Milestone + Kanban Gantt rendering complete.**


- **Planning-app Gantt integration — DONE.** Q_tracker deleted (ecosystem is 4 apps). `rdcore`: `dropTile` records gate-crossing dates (`tile.gatePassed`), plus `gateTileState`, `boardGateSummary`, `milestoneGanttSteps`. Planning Gantt: milestone-KR steps render as dated status diamonds (done/overdue/pending; undated omitted), Kanban boards render as collapsible rows — a collapsed board draws one **square per gate** at the **latest due across tiles**, with a **passed-count badge** and **worst-status color** (red=any overdue / orange=any late / green=all passed); expanded shows per-tile workstream rows with per-tile gate squares. Tested: `kanban_engine.cjs` (47) + `gantt_sales_tracking.cjs` (15). Sweep 85/1998.
