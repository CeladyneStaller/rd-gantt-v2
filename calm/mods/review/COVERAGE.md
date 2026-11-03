# Review table on the Overview (X-review): coverage

Built October 15 from option 2b of the Overview mockups ("One review table"), after its working mockup.
Corey: "Let's build 2b for the execution and sales apps".

Files: `mods/review/mod.js` (rules, rows, filters, grouping, links), `mod.css`, `slot-ov-main.html` (the
Overview's first panel); tests `test/sc_review.js` (both boards). Built into Execution (`Main.dc.html`) and
Sales (`Sales-A.dc.html`) from one source. The shell lays the Overview out: this table, then Latest
readings (mods/kpi), Current step (mods/step) and Initiative metrics (mods/initm) side by side.

Legend: `[x]` done, `[~]` changed (why), `[ ]` not done (why).

## What it replaces (October 15)
- [~] Overview "Key results" summary (mods/kr `slot-ov-main.html`, removed) — changed: each key result is a row of the review table: tag, statement, kind, status, score bar with the time-used tick, pace in the Key results tab's words ("20 pts ahead of pace", "Target met"), the next step's date (else the planned end) and a note; milestone steps, KPIs and legacy sub-key results open underneath. The name opens the Key results tab with that key result expanded. The empty state keeps "Add key result" (not in read-only).
- [~] Overview "Stage-gates" summary (mods/gates `slot-ov-main.html`, removed) — changed: every gate is a row, not only the next one: label (SG-A1), name, intention, status, readiness with "Ready, N of M targets met" (and partial), the due date (passed: the date passed and the date due), and a note (today's forecast rule for an overdue gate, a later forecast and what pushed it, the revised plan or plan version that moved it, a high risk on it, the passing justification). Its targets open underneath, a range target drawn as a band with the reading marked. The section names the workstream (or how many) and the gate health (`RD.objectiveGateReadiness`). The name opens the Stage-gates tab with that gate's targets open.
- [~] Overview "Open high risks" card (mods/fmea `slot-ov-side.html`, removed) — changed: every FMEA problem is a row: status by its worst open RPN, "Worst open RPN 224" (or the plain worst RPN when nothing counts as open), "N of M causes being mitigated", the linked gate's date, and its first known fact (or its worst open cause); its causes open underneath, worst first, with S × O × D, status, band and mitigation. The count of open high risks stays in the head's "Open high risk" fact (the shell, unchanged). The name opens the Risks tab with the problem highlighted.
- [~] The head's "Key-result signal" bars and legend (shell) — changed: removed from the head; the key-result rows above carry the same score, band and bar (with a time-used tick the signal never had).
- [x] Kanban on the Overview (new: today's Overview has none) — every tile of the objective's boards is a row: lane, owner, status, stage pips (cleared on time, cleared late, current, overdue), "N of L days in this stage", the stage's due date (`RD.gateDueDates`) and a note (since when, stages cleared late, a swimlane deadline the stage limits can't meet). Parked tiles say so; a swimlane with four or more finished tiles shows them as one row ("4 tiles in Closed", counted as 4; per board until October 15) with each tile underneath and the days it spent in the last working stage against that lane's limit. The name opens the Kanban tab on that board with the tile highlighted (a finished tile's lane shows its older tiles, a parked tile opens the backlog).

## One status scale (the footnote under the table)
- [x] Off track — a key result scoring under 65; a stage-gate overdue (`RD.classifyGate`) or marked failed; a tile past its stage due date (`RD.gateTileState` overdue), over its stage limit or past its swimlane deadline (`RD.tileHealth` breached); a problem whose worst open cause has an RPN of 200 or more (`RD.worstUnresolvedRpn`, `RD.rpnBand`).
- [x] At risk — a key result scoring 65 to 79; a stage-gate with a high risk open on it; a tile that has used 80% of its stage limit or whose swimlane is due within a week (`RD.tileHealth` at risk), or whose stage is due today; a problem whose worst open RPN is 100 to 199.
- [x] On track — a key result scoring 80 or more; the gate a chained workstream is working on (its first unpassed gate) or a gate marked in progress; a tile inside its limits; a problem with only low risks open.
- [x] Not started — a key result with no score yet, a stage-gate not yet in progress, a parked tile.
- [x] Done and Cancelled — passed gates, tiles in the last stage, problems with nothing open; gates left unfinished when the objective ended show Cancelled (a sixth chip that appears only then).
- [x] The worst rule wins; rows under an item are not counted on their own (a finished-tile group counts its tiles).
- [~] Key results by score, not pace — changed: the review bands key results by score (80 / 65), like the objective score, the sidebar and the head's "N on track"; the Key results tab keeps today's pace band (`RD.keyResultPaceBand`), so a key result can read "Off track" here and "On track" there. `REVIEW.KR_RULE = 'pace'` in `mod.js` switches the review (and its footnote) to pace.

## Using it
- [x] Summary line ("22 items: 2 key results, 2 stage-gates, 17 kanban tiles and 1 risk").
- [x] Status chips with counts (Off track, At risk, On track, Not started, Done; Cancelled when there is one) toggle a status filter; several combine.
- [x] All N / Needs attention N (off track and at risk).
- [x] A status bar per section (per type when grouped by status or due date): each segment's width is its count, a segment filters to its status, the others dim; titles and labels say the status and count.
- [x] Filter box over names, sub-lines, notes and the rows underneath (a finished-tile group narrows to its matching tiles, "1 of 4 tiles in Closed"); "Showing N of M"; Escape clears it; "Clear filters"; "Nothing matches these filters." with Clear filters.
- [x] Group by Type (worst first, then by date), Status (worst first) or Due date (late, today, the next 7 days, 8 to 30 days, later, no date, done, cancelled); each row says its type when not grouped by type.
- [x] Workstream and swimlane headings (October 15; Corey: "group stage-gates by workstream and kanban items by swimlane") — grouped by type, the stage-gates sit under a heading per workstream ("Workstream A" and its name, "Chained, 1 of 3 gates passed"; gates with no workstream under "No workstream") and the kanban tiles under one per swimlane (its stage limit and deadline, "14 days per stage, due Dec 18"; backlog tiles with no swimlane under "No swimlane", last; with several boards the board is named). Headings follow the Stage-gates tab's workstream order and the board's swimlane order; each counts its rows (finished tiles as tiles), shows their statuses as dots with counts, and folds (`review_gc`, by objective, grouping and heading). Rows under a heading sit one step in, and a tile's row names only its owner (the swimlane is the heading). Filters keep only the headings with rows; the filter box also finds an item by its workstream or swimlane name. Grouped by status or due date there are no headings, and a tile's row names its swimlane again.
- [~] Finished tiles — changed October 15: a swimlane's finished tiles become one row from four on (it was a board's), named "4 tiles in Closed" with the swimlane in its line; its link opens the board with that swimlane's older tiles showing.
- [x] Rows with detail expand; off-track and at-risk rows start open; Expand all / Collapse all; a section folds (remembered per objective and grouping while the page is open).
- [x] Links: the name opens the item on its tab; it stays highlighted for eight seconds and its main button takes focus, which scrolls it into view (mods/kr `kr_focus`, mods/gates `gates_focus`, mods/kb `kb_focus`, mods/fmea `fmea_focus`).
- [x] On a view page (`?view=`, the shell) a name opens a new browser tab: its own view with the item highlighted (`?item=`), keeping read-only; a risk opens the app's Risks tab. The link's title says so, and the empty rows name the app's tab.
- [x] Read-only: everything here is a view, so it all works; only "Add key result" in the empty state is hidden.
- [x] Dark mode: tokens only (the bar text on a filled segment uses `--pri-ink`, and the amber segment switches to it in dark mode).

## Readings on KPI and target rows (added October 19)
Corey: "Allow KR and SG KPI updates to happen on the overview tab like they do on their respective tabs".
Checked by `test/sc_review.js` (both boards), `test/sc_views.js` (the Overview view), `test/sc_exec_live.js`
(saved through the broker) and the browser e2e checks in `test/live/e2e.js`.
- [x] A KPI under a key result, or a target under a stage-gate, takes readings with the KPI table's own controls (`KPI.post`, mods/kpi): its value is the table's button ("Post a reading for H₂ in O₂"; "Post a reading" when it has none), beside the bar, or on a line of its own under a range's gauge or for a pass / fail target. Clicking it opens the table's inline editor in the progress cell (the value in it, the unit beside it): Enter posts ("Reading posted.", stamped and signed by the person signed in), Escape leaves it, leaving the field posts what was typed, the same value posts nothing, a value that isn't a number says so ("Use a number, like 1.85." / "Use 1 for pass or 0 for fail."), and a blank clears the KPI's own readings, asking first when there are several. The row, its item, the counts and the head follow at once.
- [x] A statistical KPI's value ("Readings for …", "Add readings for …" when it has none) opens the table's readings drawer under its row: the statistic, samples and target, the partial check-in, the readings newest first (Remove → Confirm), Add reading (Enter adds; it joins the current batch), Start a new batch, Close.
- [x] What follows from a reading follows here too, as on the tabs: a gate whose targets are all met passes on its own ("SG-A1 … passed: every target is met."). The item stays open once its value is clicked, so a reading that changes its status (a gate passing, a key result back on track) doesn't fold the row away.
- [x] The review keeps its own editor key (`review:<host type>:<host>`), so the Key results and Stage-gates tabs never open with the Overview's editor, nor the Overview with theirs.
- [x] Read-only (the preview, `?readonly`, a read-only view): values only; a statistical KPI's readings open to be read ("Read-only view — editing is disabled.").
- [x] On a view page (`?view=overview`, editable) readings post and save like the app.
- [~] Editing a KPI or target, adding or linking one, and Connect data stay on the Key results and Stage-gates tabs (the KPI names here are not buttons).

## State (view only, never saved)
`review_sel`, `review_q`, `review_gb`, `review_open`, `review_gc`. Posting uses the KPI module's own `kpi_ed` / `kpi_rd`.

## Not done
- (none)

## Pulled KPIs (added October 19; mods/pull)
- [x] A pulled KPI's row takes the KPI table's dropdown (the chevron alone in the progress cell) and its note says what was pulled ("Pulled: median of 5 objective scores."); a key result's note says "Each is pulled from other work." (or "Some are…") instead of "No readings yet."
