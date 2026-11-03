# Coverage: initiative metrics (X-tasks)

Module: `mods/initm` (Initiative metrics, on the Overview). Sources: exec.md §23 and checklist; sales.md §18
and checklist. Execution and Sales run the same code (Sales reads `BIZ-<div>`, Execution `EXEC-<div>`,
through `ctx.doc`). Tests: `test/sc_initm.js` (both boards). Rules copied from today's `renderInitPanel` /
`initKpiTableRO`.

Until October 15 this file was `mods/tasks/COVERAGE.md` and also covered the Tasks tab. That tab, the
Overview's "Up next" card, the task sheet and task search were removed then: the Kanban covers that work.
See "Tasks (removed)" at the end.

## Initiative-level metrics (exec §23, sales §18)

- [x] Panel title "Initiative-level metrics · <division>" with the initiative count — "Initiative metrics", count, division name (`slot-ov-foot.html`, Overview). Since October 15 it is a card beside Latest readings and Current step under the review table; opened, it takes a row of its own (`panelCls` adds `open`).
- [x] Note "defined in Planning · link from a KR / gate / task" — "Defined in Planning. Link to them from a key result or stage-gate." (tasks dropped on October 15).
- [x] Collapsed at start, session only ("INIT" in `panelCollapsed`) — `initm_open` starts false; the title toggles it (`aria-expanded`).
- [x] One block per initiative of the division, in portfolio order, with name and "N targets" — same; the selected objective's initiative is tagged "This objective's initiative".
- [~] Rows: portfolio initiative KPIs plus KPIs still defined locally in this exec doc, tagged — each initiative's table is the shared KPI table in read-only mode (`KPI.table(C, ctx, {type:'initiative', id}, { readOnly: true, canAdd: false })`), which lists both and tags local ones "Local". Changed: local KPIs come first (the KPI module's pool order) instead of last.
- [~] Columns KPI | dir | target | current | score | links — KPI | Target | Current | Score | Status. The direction joins the target ("≥ 75%", "≤ 1.85 V", "6 to 10 mΩ·cm²", binary "Pass"); the unit sits with the current value; "Status" (on track / near / below / met) is extra. Same numbers: the KPI module resolves over this exec doc plus the portfolio (`ctx.em`) with `RD.kpiName / kpiDirection / kpiUnit / effTarget / effValue / kpiScoreParts`; statistical values to 3 decimals (82.333%), "No reading" for no value. The scenario checks score, current and target against the engine in both apps.
- [x] Score in band colour with partial math — banded score with its bar, "Partial" and "97 × 3/5 samples" (raw × n/N) on a partial check-in.
- [x] Links "🔗 N" — shown as a "Defines N" tag on the KPI (no emoji). Fixed: today counts only legacy `groupId` members, so a link made with the current link editor (`linkParent`) always showed "—"; the KPI module counts every KPI that links to it (`RD.childrenOf`).
- [x] Empty states "no initiatives in this division" / "none yet — add initiative targets in the Planning app" — "This division has no initiatives yet. Initiatives are planned in the Planning app." / "No targets yet. Add initiative targets in the Planning app." (both link to Planning).
- [x] Read-only — names are plain text, no reading entry, no row menus, no add or link; the only control is the expand toggle. Current values are plain text too: the shared table's sample view for statistical KPIs reads only this division's readings, so it showed no readings for portfolio KPIs (reported to the KPI module); today's panel had no sample view either. If the KPI module is missing from a build, the panel falls back to its own read-only table built from the same engine calls.
- [x] Milestone targets — as today, not part of this panel: Execution never listed milestone KPIs (Planning shows them).

## Checklist lines (exec (a), sales (a))

- [x] Exec "Collapsible panels (INIT starts collapsed)" — the INIT part: Initiative metrics start collapsed. Other panels are tabs (shell).
- [x] Exec "Initiative metrics: Read-only initiative KPI tables (local tag, score, partial math, link counts)" — see above.
- [x] Sales "Initiatives: Collapsed panel with read-only KPI tables per initiative" — same module.
- [x] Sales "View and keyboard: Panel collapse and row expansion (session)" — the INIT collapse is session state (`initm_open`); the rest belongs to other modules.
- [x] Exec (b) "Portfolio KPIs (initiative level)" — shown read-only.

## Tasks (removed October 15)

Today neither app draws tasks (`renderTasks()` is never called), so nobody could add one and the real
documents hold none. Calm built a Tasks tab for them (exec §17, §24; sales §21, §22); on October 15 it was
removed again, with the Overview's "Up next" card, the task sheet and task search, because the Kanban
covers that work.

- [x] Exec (b) "Task (not shown)" and sales (b) "tasks (hidden)" — not shown again, as today. Stored tasks
  are kept: load-time repair keeps the list, moving an objective's data to another division moves them
  (Sales › Settings › Maintenance reports them), and the engine still counts them in the schedule forecast
  (`RD.cascade` pfTask, unchanged).
- [x] A stored task's KPIs — still listed in Readings ("Tasks" group, `KPI.openAll`), so readings can be posted
  and the KPI edited or deleted; the KPI search opens the Overview and Readings for them (there is no task
  tab to open).
- [x] A link or hand-off naming the Tasks tab opens the Overview (the shell only accepts its own tabs).
