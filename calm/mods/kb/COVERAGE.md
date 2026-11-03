# Kanban (mods/kb): parity coverage

Scope: exec.md §15 (L379–437) and the kanban items of §24; sales.md §14 (L271–309) and the kanban caveats of §21;
the Kanban items in both checklists, plus the kanban parts of sync, read-only, storage and embed items.
Today's kanban code is identical in both apps (exec L4802–5326, sales L3492–4117; diffed), so one module serves
Execution and Sales with no app branches. Engine calls are the live ones: RD.tileHealth, boardSummary,
tileInBacklog, backlogByLane, normDoneWindow, doneTileAge, doneSplit, doneByRecency, hubSessionEmail, doneVal,
reconcileDone, dropTile, gateDueDates, gateTileState, boardGateSummary, assigneeOptions, initialsOf, ownersOf
(divisionOwnerEmails / objectivesOwnedIn through assigneeOptions).

Where: the Kanban tab, next to Stage-gates (its own tab since October 15; before, a view of Stage-gates
switched by doc.gateMode, which is no longer read or written). The shell renders the `kanban` slot. Sheets: `kb.tile` (add / edit / view a tile), `kb.config`
(configure a board). Tests: `test/sc_kb.js` (Sales 322 checks, Execution 319), which also asserts that every kb
handler site is exercised.

## Execution checklist: Kanban
- [x] + board (default columns and lane) — "Add board" in the board bar and in the empty state: "Board N", stages Prospect / Working / Closed (gate_id `board/col`), swimlane "Standard" at 14 days per stage; the new board is selected; toast "Board added."
- [x] Board tabs — segmented "Boards" control above the grid; the choice is session-only like today (kb_sel).
- [x] Delete board — fixed: was a native confirm "Delete this board?" (blocked in Confluence); now C.confirm "Delete the board “X”?" naming what goes ("Its 4 stages, 3 swimlanes and 17 tiles are deleted for everyone. Scores are not affected."). From the bar (trash icon) and the Configure sheet.
- [x] Configure: board name, columns add / rename / delete, lanes add / rename / max d / deadline / delete — "Configure" opens the kb.config sheet. Each field saves on Enter or leaving it; Escape puts it back. Add stage ("Stage N"), add swimlane ("Swimlane N", 14 days). Max days blank = no limit (stored 0, as today). Delete only while 2 or more remain (as today).
- [x] Grid with column counts — lanes × stages, each stage header with its count (boardSummary.perColumn); the done column shows "shown of total" when a window filters it.
- [x] Lane rule text — "14 days per stage, due Dec 18" / "No stage limit" (today "max 14d/col · due 2026-12-18" / "no col limit").
- [x] Lane "+ tile" (hover) — quiet "Add tile" on each swimlane header (always reachable by keyboard, brighter on hover); pre-fills that swimlane and the first stage, as today.
- [x] Tile health colours and notes — dot + word (On track / At risk / Breached / Done …) with a matching left edge; days in stage; the engine's note in plain words ("Over the 21-day stage limit", "12 of 14 days used", "Past the swimlane deadline", "5 days to the swimlane deadline").
- [x] Avatar / unassigned disc — initials disc (role img, "Assigned to Sam Rivera"); dashed "—" disc labelled "Unassigned".
- [~] Tile edit ✎ — changed: the tile's name is the button that opens the editor (no separate pencil). Done-column rows open the same way.
- [x] Tile modal (name, lane, stage, started, entered, assignee) — kb.tile sheet: Name, Swimlane ("Unassigned (backlog)" or a lane), Stage ("Backlog (not started)" or a stage), Started, Entered this stage, Assigned to. "Add tile" / "Save tile"; Enter in Name saves, Escape closes.
- [x] Assignee picker with "division owners only" (rd_kb_narrow) — RD.assigneeOptions with narrow on by default; rows show initials, name, email and "Owns N active objectives" / "Assigned, but owns nothing active here" / "No active objective here"; "Unassigned" row ("Nobody owns this tile yet"); hint "Showing N of M people, those owning an active objective in this division." / "Showing everyone known."; the switch is a per-browser view preference (kb_narrow). Fixed a quirk: picking Unassigned then flipping the switch no longer re-selects the stored assignee.
- [x] Roster-based people list — C.D.roster users minus disabled ones (Lena never appears), plus every objective owner, as today's kbAllEmails; the current assignee is always listed.
- [x] Delete tile — fixed: today deletes at once; now C.confirm "Delete the tile “X”?" ("It is removed from Pilot pipeline for everyone, with its stage dates."), toast "Tile deleted."
- [x] Drag tile between cells (clock restart, gate-passed marks) — HTML5 drag onto any cell runs RD.dropTile (stage change: enteredCol = today and gate stamps added / removed; lane change: new rules, clock kept). Toasts say what happened ("Moved to Discovery. Its stage clock restarts today."). Dropping on the same cell changes nothing. Keyboard path: open the tile and pick its stage or swimlane.
- [x] Backlog (collapsible rd_kb_backlog, per-lane groups, drop to park) — bottom section of the board: "Backlog N", note "Not started, no clock running" / "N parked, no clock running" / "Empty", "Add tile"; RD.backlogByLane groups (every swimlane, then Unassigned) with "Will use 14 days per stage" / "Swimlane chosen at start", their own "Add tile" and a drop zone ("Drag a tile here to put it in this swimlane." / "…to leave its swimlane open."). Dropping parks: column and clock cleared, lane set to the group (none for Unassigned). Parked tiles read "Awaiting start" / "No swimlane yet". Open/closed is a per-browser view preference (kb_bl).
- [x] Summary chips — RD.boardSummary above the board: "N on track", "N at risk", "N breached", "N closed" (dots + words), "N tiles in total", and "N in the backlog" when non-zero.
- [x] Done-column window and style per person (synced via /prefs or local) — "Last 14 days, compact ▾" button in the done column header opens the menu: Show finished tiles from the last 3 / 7 / 14 / 30 days / All finished tiles / None, show the count only; Show them as Cards / Compact rows. Signed in to the Hub (C.state.sim.hub): stored on the broker in C.D.prefs.kbDone via RD.doneVal (the default is never stored), squared with this device's copy by RD.reconcileDone, viewer from RD.hubSessionEmail; note "Just for you — follows you to any device where you’re signed in to the Hub." Signed out: this browser only (component state), note "Saved in this browser only. Open this board from the Hub to keep it on every device." Offline while signed in: kept on this device with "Saved on this device — couldn’t reach the server yet, so it will retry.", delivered at the next exchange. First sign-in carries this browser's choices up for boards the broker has nothing for. Every note ends "Hidden tiles still count in “closed”." Closes with its ✕, a click outside (scrim) or Escape. Picks never save the shared document.
- [x] Older finished tiles expander — per swimlane "+N older" / "Hide older" ("N done" / "Hide" for the count-only setting), session-only (kb_older). Filtered or compact views sort newest-finished first (RD.doneByRecency); undated tiles last.

## Execution: other kanban items
- [x] Its own Kanban tab (October 15) — replaces today's Gates / Kanban switch (doc.gateMode, no longer read or written). The kanban never feeds a score (nothing here calls a scoring function).
- [x] Health rule (core L789–805) — RD.tileHealth as is.
- [x] Lane / stage rules in the tile editor — clearing the swimlane parks the tile (a warning note says so before saving); changing the stage restarts the clock unless "Entered this stage" was typed; a parked tile has no clock; a new tile created in a stage starts today. Same as today: clearing "Started" keeps the earlier date. New: malformed dates are refused ("Use a real date, like 2026-10-13.").
- [x] Legend — "Drag a tile between columns to advance its stage, or between swimlanes to change its rules. You can also open a tile and pick its stage."
- [x] Empty state — "No boards yet. A Kanban board is a stage-gate sequence (columns) that parallel workstreams (tiles) move through." with "Add board".
- [x] /roster, /prefs endpoints; Hub sign-in detection (§4, §2) — simulated: roster = C.D.roster; prefs bin = C.D.prefs.kbDone; Hub sign-in = the shell's Settings toggle (C.state.sim.hub), checked with RD.hubSessionEmail on every render.
- [x] Embed: Done choices stay in the browser inside Confluence — covered by the Hub toggle off (the shell's hint says so).
- [x] Storage keys rd_kb_backlog, rd_kb_narrow, rd_kb_done, rd_kb_done_acct — component state (kb_bl, kb_narrow, kb_anon, kb_acct), written to this browser's localStorage under today's keys and read back on the next visit (audit A2; blocked storage keeps them for the visit).
- [x] Session-only state: expanded older tiles, selected board, open config panel (now a sheet), open Done menu.
- [~] Read-only: today all kanban controls and dragging stay live but never save — changed to the intended behaviour: view only. No Add board / Add tile / Configure / Delete, tiles are not draggable, cells take no drops, a tile opens read-only (fields disabled, no Save or Delete), handlers are guarded too ("Read-only view — editing is disabled."). Still allowed: the personal Done-column view (saved to the person's prefs even in read-only), board tabs, backlog open/closed, older-tile stubs. Since October 15 the drag instructions under the board are hidden in read-only too, and an empty backlog row says "Nothing parked here." instead of "Drag a tile here…".
- [x] §24 Kanban deletions — fixed: deleting a stage or swimlane asks first and says how many tiles go with it ("Its 3 tiles are deleted with it, for everyone." / "…, including 1 waiting in the backlog."), and when the done column changes ("“Proposal” becomes the done column."). Toasts say what went ("Stage deleted with 3 tiles.").
- [x] Ended objectives — the board stays editable, as today (the kanban never feeds a score).

## Sales checklist: Kanban (identical code; differences: none)
- [x] Empty state — as above.
- [x] + board (Prospect/Working/Closed, Standard 14 d) — as above.
- [x] Board tabs — as above.
- [x] + tile — bar "Add tile" opens the editor for a backlog tile with no swimlane (today's "into the unassigned backlog").
- [x] configure (board name, columns, swimlanes, max d/col, deadline, add/delete) — as above.
- [x] Delete board — fixed (confirm with counts), as above.
- [x] Grid, lane rules, lane + tile — as above.
- [x] Tile card (health colour, avatar, days, note, ✎) — as above (name opens the editor).
- [x] Done menu (window, style, sync note) — as above.
- [x] Compact rows — check icon, name, "4 days ago"; still draggable and openable.
- [x] Older stubs — as above.
- [x] Summary chips — as above.
- [x] Backlog (collapse persisted, lane groups, Unassigned, + tile, drop zones) — as above.
- [x] Drag to cell or backlog — as above.
- [x] Tile modal (name, lane, stage, started, entered, assignee picker with owners-only switch, delete) — as above; delete now confirms.
- [x] No WIP limit — same as today: no tile-count limit; the Configure sheet says so.
- [x] Prefs GET/PATCH; roster fetch; prefs stay local inside iframes — as above.
- [x] §21 Unconfirmed deletes in Kanban — fixed (stage, swimlane, tile and board all confirm with what is lost).
- [~] §21 Unguarded kanban controls in read-only — changed to view-only, as above.
- [~] §21 Background refreshes close dialogs — not reproduced: Calm re-renders from data, so a simulated teammate edit or 412 reload leaves an open tile or configure sheet in place; if its tile or board is gone it says so ("This tile is no longer on the board." / "This board was deleted.").
- [x] Pilot pipeline (sample) — BD objective OBJ-BD-2026Q4-01 (already Kanban): stages Prospect / Discovery / Proposal / Closed, swimlanes Utilities (14 d, due Dec 18), Industrial gas (21 d), Mobility (14 d), 8 open deals across health states, 8 closed of different ages, 1 parked.

## Added in Calm (beyond today's kanban, same engine numbers)
- [~] Linked gate state on tiles — each column is a stage-gate (gate_id board/col). A tile shows its current stage's due date from RD.gateDueDates and RD.gateTileState ("Stage due Nov 6" / "Stage overdue, was due yesterday") and "N gates passed late"; the tile sheet lists every stage-gate with due date and state (Passed / Passed late / Overdue / Not yet) and the date it was crossed. Same rule the Planning Gantt uses for kanban gate squares (a lane with no limit and no deadline dates every gate at the tile's start, as there).
- [~] Gate summary above the board — RD.boardGateSummary per stage before the done column: worst state as dot + word (Overdue / Passed late / All passed / Open), "N of M passed", overdue and late counts, and the latest due date (the Gantt's board-row point). The done column is left out: no tile can clear it.
- [~] Reorder stages and swimlanes — new (arrows in Configure). Stages keep each tile's stage and recorded gate dates; RD.dropTile reconciles a tile's stamps the next time it moves.
- [~] Names cannot be blank — new: board, stage and swimlane names are required ("A board needs a name." etc.); today a blank name was saved.
- [~] Toasts for moves and edits — today's moves only showed "Saved."; Calm says what changed.
- [~] Header search — tiles of the division's boards appear under "Kanban tiles"; picking one opens its objective's Stage-gates tab and the tile.
- [~] Initials — from the roster name where known (Corey Staller → CS), otherwise RD.initialsOf(email) as today.
- [~] IDs — today's newId format (prefix + time + counter, e.g. tile…, col…, lane…, BRD…), deterministic in the prototype.

## For other modules
- The Kanban tab's header count is the active board's tile total (RD.boardSummary total, `KB.count`), today's Stage-gates header in Kanban mode (audit A2).
