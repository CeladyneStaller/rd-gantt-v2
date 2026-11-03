# Stage-gates (X-gates): coverage

Scope: inv/exec.md §10 (stage-gates panel and gate dialogs), §13 (plan revisions, history, legacy
catch-up), the gate items of §24; inv/sales.md §11–13 (End objective is X-shell's); every gate,
workstream and plan-revision item in both checklists. Files: `mods/gates/mod.js`, `mod.css`, `seed.js`,
`slot-gates.html` (Stage-gates tab), `slot-sheets.html` (all gate sheets), `test/sc_gates.js`. The
Overview's gate rows are drawn by mods/review since October 15.

Where things are in Calm: the **Stage-gates tab** shows each workstream as a block of vertical "steps"
(a ring per gate: green check when passed, readiness as a filled arc, red edge when overdue). The gate
name opens the **gate sheet**; "…" on a row or a workstream holds the row actions. Execution adds a
**Plan history** panel under the gates.

## Execution checklist: Stage-gates (Gates view)
- [x] Kanban has its own tab (October 15, Corey: "Split the stage-gate and kanban into 2 different tabs"). Today a segmented "Gates | Kanban" switch in this panel wrote `doc.gateMode[objectiveId]` and swapped the gate list for the boards. Calm: the Stage-gates tab always lists the gates (header count = the objective's gates), the boards are on the Kanban tab next to it (mods/kb, header count = the active board's tiles), and `doc.gateMode` is no longer read or written (stored values stay untouched). Since October 15 the Overview's review table lists the gates and the kanban tiles side by side.
- [x] Add gate (default workstream) — header "Add gate" opens the gate sheet into the first workstream (a workstream's own "Add gate" targets that one).
  - [~] changed: when the objective has no workstream, "General" is created when the gate is added, not when the editor opens (today a cancelled add still left an empty General behind).
  - [~] changed: a name is required ("Give the gate a name."); today an unnamed gate showed its id.
- [x] + workstream — header "Add workstream" opens the workstream sheet.
- [x] Workstream block: letter, name, chain icon, % passed meter — "Workstream A/B/C" (letters follow position), the name (click to rename inline: Enter saves, Escape cancels, leaving the field saves; empty name is refused), a "Chained" / "Independent" chip with the today's tooltips, meter = `RD.setScore` with "N of M passed", "Add gate", and "…" (Edit workstream, Move up, Move down, Delete workstream). Empty: "No gates in this workstream yet. Use Add gate to give it its first checkpoint."
  - [x] chained / independent — the chip toggles it in one click (toast says what it means), and the workstream sheet has both options. fixed: today every load and every poll reset all workstreams to chained (L2891); in Calm the setting sticks (seed clean-up no longer forces it; the sample's "Teardown and analysis" stays independent).
- [x] Drag to reorder workstreams — drag handle on the workstream header (only with 2+ workstreams); drop on another workstream; every workstream's `order` is rewritten; "Workstreams reordered." Also "Move up" / "Move down" in the "…" menu as a keyboard alternative.
- [x] Gate block: state rail and pill (passed / late / overdue / pending / cancelled) — ring plus a dot and a word from `RD.classifyGate`: Passed, Passed late, Overdue, Pending, Cancelled (unfinished gates once the objective has ended: dashed ring, struck-through name, "Cancelled when the objective ended").
- [x] SG-A1 chip — the `SG-<workstream letter><n>` label (n by due date in the workstream), same rule as today's `gateLabel`; also exported as `GATES.label(doc, gateId)`.
- [x] Version mark — "Added in v2", "Moved in v2 (+7 days)", "Retargeted in v2", "Renamed in v2" from `RD.gateVersionMarks` (title explains). Execution only, as today.
- [x] Committed badge — "Committed" tag, title "Committed to Nov 13, 2026; not pushed by late upstream gates".
- [x] Re-committed tag (legacy) — "Re-committed" tag plus the line "Revision v1: Nov 13 to Nov 20" (`RD.catchupEntry`).
- [x] Intent line — under the name.
- [x] Readiness % with partial caption — "Readiness 75%" with a bar (`RD.stageGateScore`, discounted) and a hatched band to the undiscounted score; "Partial" tag; caption "Partial check-in: 100% without discount, 3 of 6 samples. Readiness reaches 100 only once all 6 are in." (`RD.hostSample`).
- [x] Planned / est / delta badges — schedule line from `RD.cascade`: "Planned Nov 13", "Forecast Nov 20", "Finished 3 days late" / "Finished 2 days early", "5 days late" (overdue), "Pushed 7 days by SG-A1" / "by an upstream gate", "Could finish Nov 18, 16 days earlier"; same rules as today's `gateForecastMeta` / `gateDriverOf`.
- [x] Mark complete modal (date, justification) — "Mark complete" on the row opens the Mark complete sheet: Completed date (defaults to today), Override justification (optional); records a manual completion; "Gate marked complete." A bad date is refused with a message.
- [x] Completion detail modal — the "Passed Oct 9" link opens the Completion sheet: Passed date (clearing it and saving un-completes), method "Targets achieved" or "Manual override" with the justification (editable for manual), the Stage-gate KPIs table (KPI, target, current coloured by the undiscounted score, "Partial, n of N"), "Un-complete gate", Cancel, Save; "Completion updated." / "Gate un-completed." Also reachable from the gate sheet's History ("View completion", stacked with Back).
  - [~] changed (read-only): opens as a view with no Save or Un-complete (today the modal still edited in read-only and silently didn't save).
- [x] Auto-pass at 100% readiness — a gate with no passed date whose discounted readiness is exactly 100 is passed today with method "auto" (`RD.gateAtTarget`), on load (seed) and after any data change by any module (the module wraps `C.mutate` once and compares readiness before and after); toast "SG-A2 Durability screen, 500 h passed: every target is met." A gate with no scorable targets never auto-passes.
  - fixed: today auto-pass ran on every render, so un-completing a gate still at 100% re-passed it at once (§24). Calm passes a gate when its readiness reaches 100, so an un-complete sticks.
- [x] Targets expander; + target; + link; + add linked KPI — "Targets: 1 of 2 met, 1 partial" toggles the KPI module's table (`KPI.table` through `mods/kpi/part-table.html`) with its footer "Add target", "Link a metric", "Connect data". A gate without targets shows "Add a target" and "Add linked KPI".
- [x] Connect data per gate — in the gate's "…" menu and the targets table footer (`KPI.openConnect`), Execution only.
- [x] Gate modal: name, intention, gate id, workstream, planned date, actual date, status segment — the gate sheet ("Add stage-gate" / the gate's name with "SG-A2, Workstream A: Durability"): Name, Intention, Gate id (optional), Workstream (2+ workstreams), Planned date, Passed date, Status. Edit adds Targets (KPI table), Scheduling and History; add holds draft targets.
  - [~] changed: the Workstream select is also shown when adding, whenever a workstream exists, so the sheet says where the gate goes (today: edit only, with 2+ workstreams).
  - [~] changed (Status, decided "show honestly"): Pending / In progress / Passed / Failed is stored as today and choosing Passed still fills an empty passed date with today. The state still comes from the dates (core `classifyGate`), but the stored status is no longer ignored: "In progress" replaces "Pending" on a gate that is still on time and appears beside "Overdue"; "Failed" shows as "Marked failed". The sheet says so under the buttons.
  - [~] changed: the sheet shows live values for fields you haven't touched and saves only the fields you changed, so a gate that auto-passes (or is un-completed from the stacked completion sheet) while its editor is open is not overwritten.
- [x] Commit baseline / release — gate sheet › Scheduling: "Commit baseline" (fixes the saved planned date as `baselineDate`, `locked: true`; "Gate committed to Dec 20, 2026.") or "Committed to …" with "Release" ("Commitment released."). Disabled with a reason when there is no planned date or the new planned date is not saved yet.
- [x] Predecessors with lag (add / remove; prevents simple cycles) — gate sheet › Scheduling: predecessor rows ("SG-A1 Build and leak-test the stack, then 3 days") with a remove button; "Add a predecessor" (gates of every objective in the division, this objective first, other objectives named), "Lag (days)", "Add predecessor"; "Pick a predecessor gate." / "Predecessor added." / "Predecessor removed."; also shows which gates wait on this one and whether the workstream chain applies.
  - fixed: today only direct 2-gate loops were blocked; Calm never offers any gate downstream of this one, so no loop can be made. A non-number lag is refused ("Lag is a number of days, like 5.").
- [x] Delete gate (two clicks) — "Delete gate" in the gate sheet footer and the row "…" menu.
  - [~] changed: a confirm that names what goes ("…is deleted with its 1 target, 4 readings, 2 predecessor links and 1 FMEA gate link. This cannot be undone.") instead of the armed second click; "Gate deleted."
  - fixed: today gate delete left predecessor links and FMEA gate associations pointing at the deleted gate; Calm removes the links and clears `risk.gateId`. Its KPIs and their readings go, as today.
- [x] Duplicate gate (choose workstream) — "Duplicate" in the gate sheet, "Duplicate gate" in the row menu; with 2+ workstreams the Duplicate gate sheet asks for the Workstream (hint as today). Copies name + " (copy)", intention, planned date and targets without readings; status pending; no passed date, readings or predecessor links. "Gate duplicated[ into X]."
  - fixed: today the original gate's editor re-opened after duplicating (Sales §21); Calm closes the sheets.
- [x] Save then link a new gate — "Add and link a KPI" in the add sheet saves the gate, then opens the KPI module's Link a metric sheet for it.
- [x] Workstream modal (name, chained / independent) — Workstream sheet "New workstream" / "Edit workstream": Name (required, Enter saves), Scheduling Chained / Independent (today's descriptions), "Delete workstream" when editing, "Create workstream" / "Save workstream"; "Workstream added." / "Workstream updated."
  - fixed: Independent now persists (see above).
- [x] Delete workstream (move or delete gates) — empty: a confirm ("…holds no stage-gates, so nothing else changes."); the only workstream holding gates: sheet with "Keep everything" (default) or "Delete the workstream and its N stage-gates"; otherwise "Move them to [workstream]" (default) or "Delete them with the workstream"; the choice is the confirmation, the loss is spelled out; toasts state the counts.
  - fixed: today deleting with gates left their predecessor links (it filtered `e.from`/`e.to`, the links are `fromGate`/`toGate`, L4793) and their readings; Calm removes links, KPIs, readings and FMEA gate links.

## Execution checklist: Plan revision and history
- [x] Revise plan editor (rename, re-date, add, delete with undo, drag across workstreams; passed gates locked) — wide sheet "Revise plan", "Drafting vN for <objective>"; one block per workstream with "Add gate"; each row: drag handle (not on passed or removed gates), id (SG-A1 / New), name and date fields (locked on passed gates: "Passed, locked"), targets button, Move up / Move down (keyboard alternative; crosses into the next workstream at the edges), remove (a new gate goes at once; an existing one is struck through "Will be removed" with "Undo"). Dragging a row onto another row takes that row's workstream and place (today's rule); dropping on a workstream block (also an empty one) puts it last there. The draft lives in `gates_rp` until Commit; Cancel leaves nothing.
  - [x] targets per row — fixed: today's "+ target" buttons were dead (L5651). An existing gate opens its live KPI table (changes save at once; the next commit records them); a new gate collects draft targets through the KPI module's draft mode and they become KPIs on commit.
  - [~] changed: Revise plan is also reachable any time from Plan history ("Revise plan"), not only from the schedule alarm (over 10 days late) or the legacy banner; the shell's "Build revised plan" / "Revise" call `GATES.openRevise`.
- [x] Change finish — "Committed finish" date field with "This plan ends Dec 18, 2026, inside the committed finish." / "…past the committed finish." (red).
  - fixed: today a native prompt and the new finish was never saved (only the in-memory portfolio); Calm writes `portfolio.objectives[].plannedEnd` with the commit and records it in the snapshot.
- [x] Revision reason — "Why this revision" field (placeholder "Recorded with vN"), saved as the version's reason.
- [x] Commit vN (writes v1 baseline first) — "Commit vN": "Every gate needs a name and a date before committing." when not; with no history it first writes v1 "plan as first committed" (`RD.capturePlanSnapshot`), applies the draft, then writes vN (`RD.nextPlanVersionNumber`); removed gates take their KPIs; "Revised plan committed as vN."
  - fixed: today the commit ended in a ReferenceError (`persistPortfolio` doesn't exist in Execution) before its message; readings of removed gates' KPIs were kept (now removed with them, plus links and FMEA links); new gates kept their temporary `SGNEW-…` ids (now `RD.allocId`, and never an id that plan history still refers to, so history reads "removed" and "added", not "renamed").
- [x] Plan history list with change chips — "Plan history" panel under the gates: "N versions", rows newest first "v3 Live" / "v1 Original", reason (or "plan as first committed" / "revision"), "Committed Oct 6, 2026", chips "1 gate added", "1 gate removed", "2 moved", "1 retargeted", "1 renamed", "Reordered", "Finish moved" (`RD.planVersionSummary`).
  - [~] changed: with no versions yet the panel shows "No plan versions yet…" with "Revise plan" (today the section was hidden).
- [x] "finish held" note — "Finish held at Dec 18, 2026 throughout" when every version kept the same finish.
- [x] View / compare versions modal — "View" (v1: "Plan v1, as first committed", its gates and dates and committed finish) or "Compare to vN−1" (the reason quoted; Added, Removed, Moved with ±days, Retargeted, Renamed, Finish, Reordered, or "Nothing changed.") from `RD.diffPlanSnapshots`. No restore, as today (the sheet says why).
- [x] Legacy revised-plan banner — in the Stage-gates tab: "Revised plan active. N gates re-committed. Enacted Sep 22, now on schedule / N days behind schedule." with "Revise" and "Clear plan" (`RD.activeCatchupPlan`). Seeded on "Lock Tera 25-30-R5 components".
- [~] A revision takes in the delays so far (October 20, Corey: "a plan revision should be assumed to already capture the 3d delay or mitigation of it. The objective may then have a plan to be back on track pending the due date for the last stage-gate."). `RD.planRevision` is the objective's latest revision, Execution's plan v2 and up or Sales' revised plan; from its day on (`RD.cascade`): a gate that had passed by then no longer pushes the gates after it and no longer counts in the schedule; a revised date holds against what was known (moved, or kept as a plan to make up the time); a gate that slips after the revision pushes and counts as usual. Before, Execution's versions took nothing in (a passed gate's overrun pushed the revised dates again, on top of themselves) and Sales' re-committed gates ignored every upstream push, later ones too. Gate rows say "Finished 3 days late" then "Plan v2 takes this into account" (Sales: "The revised plan …"), and "Pushed … by" never names such a gate. The Revise plan note and the re-commit sheet say so before committing.
- [x] Clear plan (type CLEAR) — "Clear plan" asks "Clear the revised plan?" with the consequences and "Type CLEAR to confirm"; removes the plan's tracking, the dates stay; "Revised plan cleared."
  - [~] changed: the button stays enabled and refuses anything but CLEAR with "Type CLEAR to confirm." (the kit's ask dialog), instead of being disabled until CLEAR is typed.

## Other Execution items in scope
- [x] Build revised plan / revise button (objective header) — the shell's schedule note buttons call `GATES.openRevise(C, ctx)`: Execution opens Revise plan, Sales the re-commit sheet. The old date-only "Build revised plan" modal stays unreachable in Execution, as today.
- [x] Draft targets while adding a gate — the add sheet's Targets section is the KPI module's draft table (`KPI.table` with host `__pending__`, `pending` / `onPending`); "Add target" opens the KPI target sheet in draft mode (same fields, checks and messages: "Target added. It's saved with the gate."), typing in the gate sheet is kept underneath; drafts become KPIs (`hostType: 'stageGate'`, `isDefiner: true`) when the gate is added; Cancel drops them.
- [x] Load clean-up (§4, gate part) — `seed_gates`: an objective with gates and no workstream gets "General"; a gate with a missing or unknown workstream joins its objective's first one; (not) forcing chained, see above.
- [x] Auto-pass on load — `seed_gates` passes gates already at 100 when the data loads (none in the sample).

## Sales checklist (where it differs or is Sales-only)
- [x] Gates and Kanban on separate tabs — as Execution. "Close three utility pilot agreements" (stored view: Kanban) opens its Stage-gates tab on the gates; its board is on the Kanban tab.
- [x] Add gate, add workstream — as Execution.
- [x] Revised-plan banner (Revise, Clear plan) — as Execution; "Revise" opens the Sales re-commit sheet. Seeded on "Close three utility pilot agreements" (one gate, Oct 30 to Nov 6).
- [x] Workstream header (letter, name, chain icon, meter, + gate, ✎) — as Execution, without the drag handle and Move up / down (Sales has no reorder, as today).
- [x] Gate row (chip, name, committed, re-committed, intent, state pill, readiness, partial captions, planned, est, Mark complete or passed label, delta badges, revision line, targets toggle, add target / add linked KPI) — as Execution, without version marks and Connect data (Execution only, as today).
- [x] Auto-complete at 100 — as Execution (same fix).
- [x] Add/Edit gate, Commit baseline / release, Predecessors with lag, Delete gate, Duplicate (+ workstream picker), Link…, Mark complete, Completion, Workstream new/edit, Delete workstream (3 variants) — same sheets and rules as Execution (same changes and fixes).
- [x] Pending gate targets — as Execution.
- [x] Build revised plan (all dates required, enact, versions) — "Build revised plan" sheet (Sales only; `GATES.openRevise` and the banner's Revise): "This objective is N days behind / off schedule…", every unfinished gate by due date with Committed, Forecast (`RD.cascade`) and a New commitment date prefilled with the forecast; "All N dates are required to enact" / "Ready to enact"; "x of N dated"; "Enact plan revision" (disabled until all are dated) re-dates the gates and records original date, new date and version per gate (an earlier plan's original date and version carry over); "Plan revision enacted: N gates re-committed."; with nothing unfinished: "No unfinished stage-gates to re-commit."
- [x] Clear revised plan (type CLEAR) — as Execution.
- [~] Build revised plan from the Stage-gates panel (October 20) — a "Build revised plan" button in the panel head whenever the objective has unfinished gates, no plan is active (its banner's Revise does that) and the page can edit. Until then Sales reached the re-commit only past the 10-day alarm, so a 3-day slip could not be revised. The sheet now says: "…keeping its current date is a plan to make up the time. Passed gates are not listed: the revised plan accounts for their delays, and after it only new slips count."
- [x] Sample: one pass criterion on "Interconnection study scoped" ("Pilot sites with a study plan", at least 3 sites, 1 read) so Sales readiness and targets have something to show (seed).

## Problems from §24 / Sales §21 in scope
- fixed: Revise-plan "+ target" unwired; commit ReferenceError; committed finish never saved; temporary new-gate ids.
- fixed: workstream delete left predecessor links (wrong field names) and readings; gate delete left links and FMEA links; plan commit left readings.
- fixed: auto-pass undid un-complete.
- fixed: Independent reset to chained on every load.
- fixed: duplicating a gate re-opened the original's editor.
- fixed (dead code made live): the old inline workstream editor (rename, chain toggle) is now the workstream header's inline rename and chain chip.
- decided: gate Status buttons are shown honestly (see Gate modal).
- [~] Inconsistent gate numbering (SG-A1 vs SG<n> in the link editor and the ETB gate picker) — Calm's gates UI uses SG-A1 everywhere; the link editor and ETB picker belong to X-kpi / X-exp, which can use `GATES.label(doc, gateId)`.
- [~] Read-only: today the completion modal, the Gates/Kanban switch and workstream dragging still worked without saving. Calm: moving between the Stage-gates and Kanban tabs is plain navigation; the completion sheet is a view; dragging and every other edit is off.

## Added in Calm (not in today's app)
- Overview: until October 15 a "Stage-gates" summary card (workstream lines, the next gate); now every gate is a row of the Overview's review table (mods/review). A gate opened from there lands on this tab with its targets open, highlighted for a few seconds (`gates_focus`, `is-focus`), its name focused so it scrolls into view.
- Header search: gates by name or gate id ("SG-A2 Durability screen, 500 h", "Stage-gate, gate id DUR-500, <objective>"); opening a result switches objective if needed (clearing filters that would hide it) and opens the gate sheet. `GATES.openGate(C, ctx, gateId)` does the same for other modules.

## Not done
- (none in scope)

## Pulled targets (added October 19; mods/pull)
- [x] A gate target pulled from other work passes the gate at 100 like any target (auto-pass after every change, and on load once every document is in); a gate passing on its own bumps the data version, so pulled KPIs that read gates are worked out again.
