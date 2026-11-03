# P-gantt coverage: Gantt tab (mods/pgt), Milestones tab and milestone report (mods/pms)

Scope: inventory plan.md §13 Gantt, §14 Milestones tab, §15 Milestone report, the Gantt and milestone
parts of §17, §19 bugs in these areas, and the matching checklist and data items.
Tests: `test/sc_gantt.js` (316 assertions, all passing); `test/fuzz.js` 4000 steps, two seeds: no problems,
every handler site in these files reached.

## Gantt: toolbar
- [x] "Collapse to" Units / Divisions / Initiatives / Objectives in Hierarchy mode, plus "Expand all" — segmented control above the chart; folds every node at that level, ancestors stay open (`PGT.collapseMap`).
- [x] Custom mode: one level per chosen dimension, plus "Objectives" — fixed: today every custom button reads "— none —" (§19.3); Calm names them Products, Models, Quarters, Owners, Units, Divisions, Initiatives.
- [x] "Active only" with today's tooltip — chip toggle (aria-pressed); applies today's active rule (score under 100, and tagged this quarter or running today) and prunes emptied initiatives and divisions.
- [x] "N paused", shown only when N > 0, with the show/hide tooltip — chip toggle; count from `RD.pausedMilestoneIds`.
- [x] "Timeframe" with today's tooltip — chip toggle.
- [x] Show-paused, quarter selection and name-column width saved per viewer (`rd_gantt_showpaused`, `rd_gantt_quarters`, `rd_gantt_labelw`) — fixed by audit A3: kept in this browser's localStorage under today's keys (read at load, written on change; double-click forgets the width); never written to the plan.
- [x] `?ganttActive` / `?ganttQuarter` — the shell's link simulation (Settings, Links) seeds `pg_active` / `pg_timeframe`; the toggles show pressed and the chart applies them (tested).
- [x] Present mode hides the toolbar — fixed: today `?present` hides the level bar but leaves the timeframe grid visible and clickable (§19.4); the legend stays.

## Gantt: timeframe grid
- [x] One group per year, at most three, the years the plan touches, filled, anchored on the current year (`PGT.gridYears`) — fixed: milestones now count by their planned and completed dates (today's scan read plannedStart/plannedEnd, which milestones never have); paused milestones do not count.
- [x] Year button fills or clears all four quarters ("Select the whole year" / "Clear this year") — `RD.toggleYear`.
- [x] Quarter buttons Q1–Q4 add or remove (`RD.toggleQuarter`); spanned quarters dashed and lighter with "Spanned by your selection. Click to select it explicitly."; current quarter underlined.
- [x] Clicking any cell turns Timeframe on.
- [x] Range label ("Q4 2026 to Q1 2027"), hints "Turn on Timeframe to limit the chart to these quarters." / "Nothing selected, so the chart shows the current quarter.", otherwise a "Clear" button; empty selection falls back to the current quarter.
- [x] The axis is pinned to the span plus 7 days each side (`RD.quarterSpanRange`), applied after the today clamp.

## Gantt: chart
- [x] Quarter axis labels ("Q4 2026"); month labels only when the chart is at least 1100 px wide (container query on the axis row, viewport fallback). Small change: a quarter label clamped to the left edge is dropped when the next quarter starts within 9% of the axis, so the two labels do not overlap.
- [x] Quarter gridlines, faint dotted month lines, today line with a "Today, Oct 13" tag.
- [x] Fluid track, positions in percent, minimum bar width 2 px.
- [x] Name column resize: drag the divider (pointer events with capture), 140–640 px, double-click resets to 240; also ArrowLeft/ArrowRight nudge and Home resets (keyboard, added).
- [x] Gantt uses the full page width — the shell drops the page cap on this tab (`pl-page wide`).
- [x] Hierarchy rows: Unit → Division → Initiative → Milestones and Objectives → gates; divisions with no or an unknown unit under "Unassigned". Units and divisions follow their Order (today: stored order, which the sample matches).
- [x] Custom mode: the grouped tree from `RD.groupObjectives`; objectives with no value at a level sit above the groups; no dimensions gives a flat list.
- [x] Each row has a collapse chevron (aria-expanded); Kanban boards start collapsed; "Collapse to" / "Expand all" open them like today.
- [x] Objectives sort by end date (ties by name) inside every parent and group, ignoring Order; milestones keep their slots.
- [x] Row labels: band dot (diamond for milestones, set band for workstreams), "SG-A1" style gate tags, "KR" and "KR-M1" tags (today "(KR)" and "(KR-M#)").
- [x] Names of divisions, initiatives, objectives and milestones open Lineage (`PED.lineage`).
- [x] Hover actions: edit on divisions, initiatives, objectives and milestones; add initiative on divisions; add objective and add milestone on initiatives (`PED.open` with the parent pre-filled) — quiet icon buttons that appear on hover or keyboard focus; hidden in read-only and present mode. Added: "Delete <entity>" (through `PED.del`, which confirms first).

## Gantt: bars and markers
- [x] Group and unit rows: dashed span bar. Fixed: their band dot is the mean of the objectives shown under them (today the group roll-up is called with the wrong arguments and the dot is always grey).
- [x] Division: dashed roll-up across all of its initiatives, banded by the division score.
- [x] Initiative: planned start to planned end, falling back to child dates; without KPIs of its own it ends at the earlier of "every objective ended" and "last gate forecast", overrun drawn as slip; with KPIs its own dates stand and slip comes from the cascade.
- [x] Objective: banded by score; dashed when a date is inferred (start from its first gate); red slip from planned end to projected end.
- [x] Ended objectives: closed early, the bar stops at the close date; closed late, slip only beyond 7 days; end marker red for abandoned, green for achieved.
- [x] Gate sets (two or more workstreams): dashed bars from the objective start to the last gate; hatched "cancelled" when the objective ended. A single workstream hangs its gates straight off the objective.
- [x] Gates: squares passed (green) / passed late (amber) / overdue (red) / pending (hollow); committed date slipped: red connector and ghost "Committed DATE"; otherwise a ghost at the planned date; "Cancelled" or "Missed" when the objective ended (missed for abandoned).
- [x] Milestones: ghost at the planned date, connector, status marker at the completion or projected date (passed / passed late / overdue / pending; achieved on KPIs reads passed).
- [x] Paused or deprioritized milestones hidden unless "N paused" is on, then a ghost at the planned date titled "Paused, was planned DATE" / "Deprioritized, was planned DATE"; the row reads dimmed.
- [x] KR milestone steps: diamonds at their due dates (done / overdue / pending), undated steps left out (`RD.milestoneGanttSteps`; accepts ISO or day-number due dates).
- [x] Kanban: board row with one square per column at the latest due date, labelled with the passed count and coloured by the worst tile state (`RD.boardGateSummary`); tile rows with per-column squares (`RD.gateTileState`).
- [x] Tooltips: every bar, marker, ghost, connector, slip and end marker carries today's information as a title ("Overdue, forecast Oct 13, planned Oct 8", "Completed Sep 30 (-2 days)", "Projected Dec 18", "Slip: projected Dec 4, 14 days past the planned end"…). Added: clicking a bar or marker opens a details popover (facts plus actions) placed below or above the row at the bar.
- [x] Legend fixed (band colours, dates inferred, slip, milestone planned then effective, today) — fixed: today's "baseline" swatch matches no bar (§19.17); gate legend (passed, passed late, overdue, pending, committed or planned, cancelled, missed) only when gates are on screen.
- [x] Empty states: "No matching items to chart." (now also when Active only or Timeframe empties the chart, with how to widen it) / "No scheduled, dated items to chart."

## Gantt: what gets drawn
- [x] The shared filters (unit, division, product, quarter, status) apply to objectives (`ctx.objMatch`); emptied parents drop.
- [x] Active only applies today's active rule.
- [~] Timeframe: an objective must carry a quarter tag inside the window or spend at least 7 days inside it; points must fall within the window ±7 days — changed: today a tag counts only for single-quarter selections (it compares the tag with the range label), so adding a quarter could hide rows; Calm counts a tag anywhere in the selected span.
- [x] Paused milestones hidden unless shown.
- [x] Initiatives with no objectives — fixed: today they ignore every filter and Active only (§19.7); Calm judges them on their own unit, division and product (hidden under a quarter or status filter, `ctx.initMatch`) and, under Active only, keeps them only while today falls inside their planned window.
- [x] Schedule numbers from `RD.cascade` on the plan with paused milestones taken out (`ctx.casc`) — fixed: paused milestones no longer push an initiative's projected end or slip (§19.8); an initiative with no planned end shows no slip and no NaN (§19.13).
- [x] Business divisions: gates, ended state and gate labels come from the division's own document (BIZ- for Business) — fixed: several of today's lookups hard-code EXEC- (§19.10).

## Gantt: additions (not in today's app)
- [~] Drag to reschedule — added, as the earlier Calm board showed it: dragging an objective or initiative bar shifts plannedStart and plannedEnd, dragging a milestone shifts plannedDate (only with real planned dates; never for ended objectives, completed or paused milestones, read-only or present mode); writes through `C.mutate` with "Moved N days later." The details popover offers "Week earlier" / "Week later" as the pointer-free alternative.
- [~] Details popover actions: Mark achieved / Reopen milestone / Resume milestone / Open or Create report / Edit / Add objective / Add milestone / Add initiative / Lineage, and "Open in Execution" / "Open in Sales" (hand-off to the objective, gates or key results tab).

## Milestones tab
- [x] Columns "#", "Milestone", "Initiative", "Product", "Planned", "Effective", "Status", "Score", "KPIs", plus the report button and a row "…" menu.
- [x] "#" is `<ABBR>-NN` ranked by planned date within the product (code, else derived from the name, else "MS") — fixed: siblings resolve their product through the initiative the same way (§19.14); today milestones under a model-pinned initiative all read "-01".
- [x] "Effective": the completion date with a check when completed, else the projected date, with "+N days" in red when later than planned.
- [x] "Status": Achieved, else Paused / Deprioritized (dashed hollow dot, hover "Paused on DATE. note. Kept, and excluded from dates and scores."), else the band word; paused rows dimmed; achieved outranks paused.
- [x] "Score" (the milestone's target score) and "KPIs" (number of targets).
- [x] Report button "Open report" / "Create report" with a lock icon when locked.
- [x] Delete ("Delete milestone" in the row menu, through `PED.del`, which confirms first); hidden in read-only.
- [x] Row click opens the milestone editor (the name too); in read-only the name opens Lineage instead.
- [x] Grouping by the shared dimension chain, collapsible groups with counts — fixed: Hierarchy mode groups by division instead of reusing a stale custom chain (§19.6).
- [x] Filters: unit (fixed, §19.6), division, product, quarter of the planned date, status (`ctx.msMatch`).
- [x] Empty states: "No milestones match the current filters." / "No milestones yet. Add one from an initiative in the Structure tab."
- [x] Pause / Deprioritize (asks why, optional) / Resume, saved at once as appended history (`PED.milestoneStatus`, "Milestone paused." / "Milestone deprioritized." / "Milestone resumed.").
- [~] Added to the row menu: "Mark achieved" (completed date = today) and "Reopen milestone" (clears it) — the same field the editor edits.

## Milestone report (sheet `pms.report`, wide)
- [x] Opens from the Milestones tab and from the milestone editor's Report button (`PMS.openReport`; over the editor it stacks with Back).
- [x] Header "Milestone report" with Lock / Unlock (lock icon); Lock and Unlock save at once: "Report locked." / "Report unlocked."
- [x] Editable: Project (placeholder: product, else initiative), Author, Version, What was demonstrated, Measured override per target, four numbered findings, three action rows (Action item, Owner, Due).
- [x] Filled in automatically: milestone number and name, Achieved / Not achieved, Date achieved, TRL / MRL; Performance vs. targets with Target, Measured and Result (Met at 100, Partial from 70, Missed, N/A; not editable) and each target's source ("manual entry" or the source KPI, "(best of N)"); Milestone context (planned date, actual date, TRL achieved, MRL achieved, linked objectives through value sources).
- [x] Three blank signature lines: Technical lead, CTO / R&D director, Reviewer / sponsor.
- [x] "Save report" ("Report saved.") closes; an untouched Measured cell is recorded as the value it showed, as today; placeholders are never saved as content; context fields (budget, build number, linked OKR) are kept with no UI, as today.
- [x] Locked: everything reads as text, "Locked. Unlock to edit." and Close.
- [x] "Print or save as PDF" calls `window.print()` (in try/catch, with a message when printing is blocked); print CSS prints only the report, always on light paper. Note: the print block restates the kit's light token values as hex inside `@media print` only, so a dark screen still prints light.
- [~] Close — changed: asks "Discard your changes?" when there are unsaved edits (today it discards silently); Escape does the same (fixed §19.2: today Escape does not close the report).
- [x] Read-only — fixed (§19.16): today the report opens editable in read-only and silently drops Save and Lock; Calm opens it read-only with "Read-only view. You can read and print this report, but editing is off.", no inputs, no Save or Lock, Print still available.
- [x] TRL / MRL of 0 (today's blank-saves-as-0, §19.11) reads as "—".
- [x] A milestone deleted while its report is open shows "This milestone no longer exists, so its report can't be shown."
- [ ] Planned-vs-actual variance and the context fields budget / buildNo / linkedOkr — not done: today's report deliberately dropped these rows (its own tests assert they are gone); the data is kept on save.

## Computed values (Gantt and milestone parts of §17)
- [x] Bands (80 / 65), objective, initiative, division and set scores — `RD.rollup*`, `RD.setScore`, `ctx.objBand` / `ctx.msBand`.
- [x] Milestone achieved: completed date, or score ≥ 100 (`RD.milestoneAchieved`).
- [x] Gate states, measured against the committed date when set (`RD.classifyGate`); set band from the share of gates passed.
- [x] Cascade: gate forecasts with edges, locks and catch-up plans, objective projected ends with objective edges, milestone effective dates, initiative projected ends and slip (`RD.cascade`, paused milestones left out).
- [x] Report result from the resolved KPI score (`RD.kpiScoreResolved`), value and source from `RD.effValue` / `RD.effValueSource`.

## Data written
- [x] Milestone report: kpiOverrides {kpiId: {measured}}, findings, project, author, version, demonstrated, context, actions, locked, savedAt.
- [x] Pause records appended to `milestoneState` (never edited).
- [x] Milestone `completedDate` (mark achieved / reopen) and `plannedDate` (drag, week moves); objective and initiative `plannedStart` / `plannedEnd` (drag, week moves).

## Sample data
- `mods/pgt/seed.js` mirrors the two Kanban boards that `mods/kb/seed.js` seeds for Execution and Sales (BRD-BD-PIPE on OBJ-BD-2026Q4-01, BRD-EL-LOCK on OBJ-EL-2026Q4-02), because the kb seed is not in the Planning build. It steps aside when `seed_kb` is present.
