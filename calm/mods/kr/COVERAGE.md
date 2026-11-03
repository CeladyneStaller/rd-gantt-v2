# Key results (X-kr): coverage

Files: `mods/kr/mod.js`, `mod.css`, `seed.js`, `slot-krs.html` (Key results tab), `slot-sheets.html` (key result
sheet `kr.edit`, legacy sub-key result sheet `kr.sub`); tests `test/sc_kr.js`. The Overview's key-result rows are
drawn by mods/review since October 15.
Built into Execution (`Main.dc.html`) and Sales (`Sales-A.dc.html`) from one source; `APP` and `<!--@if exec-->`
handle the differences. Every number comes from the engine exactly as today: `RD.keyResultPace(kr.id, obj, ctx.em,
today)`, `RD.keyResultSample`, `RD.keyResultScore(…, raw)`, `RD.milestoneEffectiveWeights / milestoneStepContribution /
milestoneKrScore`, `RD.subKrScore`, `RD.kpiScoreResolved` over today's pool (doc + portfolio + in-scope spec KPIs).

Legend: `[x]` done, `[~]` changed (why), `[ ]` not done (why). "fixed:" = a bug or unwired control in today's app.

## Execution checklist: Key Results (exec.md (a), lines 766–782)
- [x] Add KR — "Add key result" in the tab header (and in the Overview's review table when the objective has none) opens the key result sheet; new key results default to % completion; id from `RD.allocId('keyResult', objId, …)`; toast "Key result saved."; the new row lands expanded.
- [~] Edit KR (chip, name, ✎) — changed: a row click expands it (Calm row pattern, as on the earlier board); edit from the row's "…" menu → "Edit key result", or the quiet "Edit key result" button at the foot of the expanded row. The chip (KR1, KR-M1) is shown on the row.
- [~] Delete KR (two clicks; cascades to KPIs and readings) — changed: "…" → "Delete key result" (also in the sheet footer) asks with `C.confirm`, naming the KPIs, the reading count, the KR's own links, KPIs elsewhere that link to it, KPIs that borrow its sample and milestone targets that read from it; then deletes the KR, its KPIs and their readings as today. Toast "Key result deleted." fixed: KPIs elsewhere that linked to the deleted KPIs used to be left pointing at nothing; they now keep what they showed and stand alone (same result as "Unlink"), and borrowers go back to their own readings.
- [x] Pace band and attainment bar with elapsed marker — dot + word (On track / At risk / Behind / No data), `.track/.fill` coloured by the pace band, `.tick` at % of time elapsed, score as a plain number.
- [x] Pace captions — today's rule (L4550–4554): "Target met", "On pace", "Ahead of pace", "N pts behind pace" (amber at risk, red behind), "No objective dates, score only", with "N% of time elapsed".
- [x] Partial check-in tag and caption — "Partial check-in" tag; `.hatch` from the discounted to the raw score; caption "N without the discount" and "n of N samples in" (`RD.keyResultSample`).
- [x] Connect data per KR — "…" → "Connect data" opens X-kpi's import sheet for this key result (`KPI.openConnect(C, ctx, { host })`); the expanded KPI table's footer offers it too. Execution only (compiled out of Sales).
- [x] "+ add a KPI" / "+ link" on a key result of any tracking type (today shown on every key result, exec L4558–4564) — fixed by audit A1: a non-KPI key result (% completion, milestone steps, legacy) had no way to get a KPI; its row menu now has "Add KPI" and "Link a metric" (a KPI-based key result has them in its KPI table footer). Also: a non-KPI key result that hosts KPIs says "N of M KPIs on target" on its collapsed row, as today's toggle did; legacy sub-key result scores carry the band in words (title / aria-label).
- [x] KPI expander with "N of M on target"; + KPI; + link — the row's second line reads "N of M KPIs on target, K partial" (or "No KPIs yet"); expanding shows X-kpi's KPI table (`KPI.table`, included via `mods/kpi/part-table.html`) with "Add KPI", "Link a metric" and, in Execution, "Connect data" in its footer. A KR with no KPIs shows the table's empty state with "Add KPI" (today's "+ add a KPI").
- [x] KR modal: % completion slider — "Progress" slider with the live value in the sheet; plus an inline progress slider in the expanded row ("The objective score follows as you drag.").
- [x] KR modal: KPI list (add, edit, remove, at least one) — "Add KPI", Edit / Done per row (the first row starts open, as today), remove (×); the last KPI stays with "A KPI-based key result needs at least one KPI. To drop them all, change the tracking type." Removing a KPI that has readings asks first ("Its N readings are deleted when you save the key result."). On save, existing KPIs are updated in place (readings survive), an unnamed KPI takes the statement, removed KPIs go with their readings.
- [x] KR modal: per-KPI type / statistic / read count / sample borrowing / direction / target / unit — Name, Unit, Target type (Demonstration / Statistical / Binary), Read count, Statistic (7 options), Sample ("Own readings" or another statistical KPI of this objective, grouped by key result and by stage-gate SG-A1…, never the KPI itself), Direction (Increase / Decrease), Target; hint "The key result scores as the mean of all its KPIs; an unmeasured one counts as nothing achieved." Binary clears direction, target and unit as today. fixed: a typo in a target or read count is an error instead of silently saving no target / NaN; a KPI whose target is a range keeps it (Low end / High end) instead of being overwritten with a null target; linked KPIs are listed as "Linked to …" and are not rewritten by the save (they are edited from the KPI table's override sheet).
- [x] KR modal: milestone credit mode (steps editor unwired) — fixed: wired in both apps. Credit mode Binary / Partial with today's hints; steps table: drag handle and Move up / Move down, Step name, Weight (blank = auto, auto share shown), Due (date), Done checkbox (binary) or Completion % (partial), Remove (not on the only step); "X% of 100%" total with a warning and hint when weights don't total 100%. Saved as today's Sales shape `{id, name, weight, due (ISO), completion}` plus `creditMode` (Execution used to drop both). Step ids `ST-n`, unique per key result.
- [x] KR modal: legacy sub-KRs — "Sub-key results (legacy)" appears only for a KR that uses it; list with name (opens the sub sheet), weight, tracking/target, measured value, score; "Add sub-key result"; Remove.
- [x] KR duplicate — "…" → "Duplicate" and the sheet's "Duplicate": copy "(copy)", KPIs copied without readings or values, progress reset. fixed: lands on the copy (its sheet opens and its row expands; today the editor stayed on the original); step completion is reset (today it carried over); a KR with no tracking type stays KPI-based (today it became % completion); embedded sub-KR readings are cleared with their values; duplicating from a sheet with unsaved edits asks first ("Duplicate the saved key result?").
- [x] KR save then link (Link…) — "Save and link" saves, then opens X-kpi's "Link a metric" sheet for the key result (`KPI.openLink`).
- [x] Sub-KR modal (4 tracking types, weight, readings preview, met status) — pushed sheet with Back: % completion / Demonstration / Statistical / Binary; Name (required: "Give the sub-key result a name."), Weight (≥ 0.1), Read count and Statistic, Direction / Target / Unit, Progress, Current measurement, Readings with a live preview ("Median: 1.02 from 3 readings"), Status Unmeasured / Not met / Met; "Save sub-key result" writes into the key result draft only, as today. fixed: a trailing comma or space no longer adds a 0 reading; non-numbers are errors.

## Execution §6 details not on the checklist
- [x] Empty state — "No key results yet. A key result groups the KPIs that score this objective; without one, the objective has no score." + "Add one to start scoring." (Overview and tab).
- [~] Left rail coloured by pace band — changed: dot + word and the bar colour carry the band (Calm status language).
- [x] Tracking-type defaults — new: % completion; existing with none set: KPI-based.
- [x] Sheet titles "Add key result" / "Edit key result"; buttons "Save key result" (today "Save KR" / "Update KR"), "Cancel"; Enter in the statement saves, Escape closes.
- [x] Expanded rows are session-only (`kr_open` UI state), as today.
- [x] KPIs still hosted by a non-KPI key result are shown (as today) with a note that they don't count toward its score.

## Execution §24 (problems)
- [x] Milestone-step inputs unwired, steps / credit mode never saved — fixed (see above).

## Sales checklist: Key Results and KR editor (sales.md (a), lines 514–532)
- [x] Add KR — as Execution.
- [x] Row: chip / KR-M chip, statement, edit, two-click delete — KR-M1, KR-M2… for milestone key results (today's Sales numbering), KR<position> otherwise; edit and delete as above (delete confirms instead of two clicks).
- [x] Pace pill, attainment bar, elapsed marker — as Execution.
- [x] Pace captions — as Execution.
- [x] Partial tag and caption — as Execution.
- [x] KPI toggle and table — as Execution (no Connect data in Sales).
- [x] "+ add a KPI" — the KPI table's "Add KPI".
- [x] Milestone drawer: checkbox or %, contribution, overdue, sum of weights — expanded milestone row: "Binary credit" / "Partial credit" with hint; Status (Done checkbox, or the % shown as a button that edits inline: Enter saves, Escape cancels, blur saves, 0–100 clamped as today, non-numbers rejected with "Use a number from 0 to 100, like 60."), "adds N.N%" contribution under partial credit, Weight with "auto", Due with "Overdue", "Sum of weights". Empty: "No steps yet." with "Add steps in the key result".
- [x] Statement (required) — "Key result needs a statement."
- [x] Tracking type — as Execution.
- [x] Progress slider — as Execution.
- [x] Multi-KPI list (add, edit, done, remove ≥1; name, unit, type, read count, statistic, sample borrow, direction, target) — as Execution.
- [x] Milestone credit mode and steps table (unwired) — fixed: wired (see Execution).
- [x] Legacy sub-KR list — as Execution.
- [x] Sub-KR modal (all fields, live statistic preview) — as Execution.
- [x] Duplicate, Save/Update, Link…, Cancel — as Execution.

## Sales §21–22 (where they mention key results)
- [x] Milestone step editor is not wired — fixed in both apps.
- [x] Duplicate quirks (editor stays on the original, step completion carried over, no-type KR becomes % completion) — fixed.
- [x] Unguarded controls in read-only mode (milestone drawer) — fixed: the drawer's checkboxes are disabled and the % is plain text in read-only.
- [~] Working milestone KRs, KR-M# chips and the step-status drawer are Sales-only today — changed: both apps have them (Execution saved neither steps nor credit mode, and had no drawer). Execution's milestone key results are now tagged KR-M1… like Sales.
- [x] Connect data on KRs is Execution-only — kept: the menu item is compiled into Execution only.

## Read-only (exec §3, sales §5, as they apply to key results)
- [x] No "Add key result", no row "…" menu, no "Edit key result" button, no inline progress slider, no step editing (checkboxes disabled, % as text); rows still expand and every value stays visible; the KPI table is view-only (X-kpi). `KR.openEditor` is refused with "Read-only view — editing is disabled."

## Overview (Calm)
- [~] Compact "Key results" panel on the Overview — changed October 15: replaced by the key-result rows of the Overview's review table (mods/review, see its COVERAGE.md). A key result opened from there lands on this tab expanded and highlighted for a few seconds (`kr_focus`, row class `is-focus`), and its row button takes focus so it scrolls into view. (The KR metric card, exec §5, belongs to the shell; the head's KR signal bars were removed in favour of the review rows.)

## Search
- [x] `MODS.kr.search(C, ctx, q)` — key results by statement in this app's divisions (up to 8); the result names the tag and objective (and the division when it isn't the current one); opening it selects the division and objective, switches to Key results with the row expanded, and clears quarter / product / owner filters that would hide it.

## Data
- [x] Writes only today's fields: KeyResult `{id, objectiveId, statement, trackingType, progress | steps + creditMode | subKrs}` (Sales' save logic, now in both apps); KR KPIs in `doc.kpis` (`hostType: 'keyResult'`, ids from `RD.allocId('kpi', objId, …)`); readings removed from `doc.kpiUpdates` with their KPIs.
- [~] `seed_kr` changes the sample's milestone step `due` values from day numbers to ISO strings, the shape the real apps store (Sales L2673, `rdcore.milestoneGanttSteps`). No records are added.

## Owned by other modules (listed so the review knows where to look)
- KPI table internals (badges, posting readings, sample popover, provenance, KPI target / override / link sheets, the Connect data import): X-kpi. This module includes their table and opens their sheets.
- Objective header "Key-result signal" bars and the "Key results" metric card (exec §5, sales §6): X-shell.
- Collapsible panels (▼): replaced by tabs in the shell.

Audit A1 (calm/audit/a1.md) found one gap, now fixed: "Add KPI" / "Link a metric" for non-KPI key results.

## Pulled KPIs (added October 19; mods/pull)
- [x] The key result sheet lists a pulled KPI with a "Pulled" tag and doesn't edit it (no Edit; saving leaves it untouched); only leads, the CTO and the CEO can remove one there. It is never offered as a sample to borrow.
- [x] Duplicate copies pulled KPIs for leads, the CTO and the CEO; anyone else's copy leaves them with the original and the toast says so.
