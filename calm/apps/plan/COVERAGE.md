# Planning (P-core) coverage: shell, Overview, Structure, Editor

Scope: inv/plan.md §1–12, §16, §17 and the matching checklist and data items. Owner files:
`apps/plan/*` (shell), `mods/pov` (Overview), `mods/pst` (Structure), `mods/ped` (editor, targets,
lineage, delete, milestone status). Gantt (§13), the Milestones tab (§14) and the milestone report
(§15) are P-gantt's (`mods/pgt`, `mods/pms`); they read this shell's `ctx` and call `PED.*`.
Tests: `test/sc_plan.js` (414 checks); independent audit `test/audit_a3.js` and `audit/a3.md`. Fuzz: `node test/fuzz.js out/pcore/Plan-A.dc.html 4000` reaches every handler site (207 of 207), no problems.
Sample data: `apps/plan/app.json` "seeds" runs the same module seeds as Execution, Sales and Product spec (kpi, kr, gates, kb, fmea, step, etb, sspec, scomp and the Execution shell seed), so Planning shows the same story (FMEA risks, HP6-12 specs, the Partnerships division, kanban boards). Legend: `[x]` done, `[~]` changed (why), `[ ]` not done (why).

## Shell
- [x] Home link "⌂" to CeladyneHQ — sidebar "All apps" link to https://celadynestaller.github.io/CeladyneHQ/ (title "Back to all apps").
- [~] Five tabs (Structure's internal id is `portfolio`) — changed: Overview, Structure, Gantt, Milestones are sidebar views; Settings is the gear-icon sheet. `?tab=portfolio` still opens Structure.
- [x] Switching tabs closes any open editor and the Lineage — every view switch clears the sheet stack.
- [x] Gantt widens the page — `.pl-page` is capped at 1360 px except on Gantt (`wide`).
- [x] Read-only badge — "Read-only" pill in the top bar (read-only preview or present mode).
- [x] Light/Dark toggle saved in `rd_theme`, follows the OS when unset — Settings › Appearance: Light / Dark / Match system, remembered in localStorage `rd_theme`. [~] The prototype defaults to Light (all four boards match); "Match system" is today's unset behaviour.
- [x] Header Save button — top-bar "Save" (hidden in read-only), runs `C.saveNow` with today's messages (see Sync).
- [~] Message banner (info/err/ok; ok auto-hides after 2.5 s) — changed: toasts (ok 4.2 s, err 9 s); same message texts.
- [~] Six modals: ✕ closes all; backdrop clicks blocked; Escape closes Lineage, Editor and Overview detail only — changed: modals are right-hand sheets. ✕ closes the whole stack; Back pops one level. Fixed (bug 1): the backdrop closes the panel, but asks "Discard your changes?" first when an editor has unsaved edits (that is why today blocks it). Fixed (bug 2): Escape closes the top sheet of any kind (target editor, delete, report) instead of the editor underneath, and asks first when that sheet has unsaved edits; audit A3: Escape also cancels a confirm dialog (the nothing-nested delete prompt), whose focus starts on Cancel. Opening another editor over unsaved edits asks too; the lineage stacks over an editor so its draft survives.
- [~] Startup: scaffold, then load, then `?tab` — changed: the prototype opens loaded; Settings › Broker shows "Last loaded …" and "Load from the broker" replays the load with today's messages. `?tab` is applied by "Open this link here".

## URL parameters and display modes (simulated: Settings › Link to a view)
- [x] `?token` saved and stripped — a link with `token=` saves the token, toasts "Token saved and removed from the address: <url without token>", then loads.
- [x] `?readonly` — fixed (bug 22): `readonly` alone or `=1` turns it on; `=0` / `=false` now turn it off.
- [x] `?present` (implies read-only, hides chrome) — hides the sidebar, top bar and filter bars; read-only on; a small "Exit present mode" button is the way back in the prototype. Also a Settings checkbox.
- [x] `?tab` — overview / portfolio / structure / gantt / milestones / settings (opens the Settings sheet); unknown values stay on Overview.
- [x] `?division`, `?product`, `?unit`, `?quarter` (`active` = current quarter) — set the shared filters (`active` → 2026Q4 from the sample "today"). A mistyped id shows today's Overview message ("…matches a division id such as DIV-FC, not its name.").
- [x] `?ganttActive`, `?ganttQuarter` — set `C.state.pg_active` / `C.state.pg_timeframe` (initialised in APP_INIT, read by mods/pgt).
- [x] Parameter names case-insensitive; values exact — `planParseLink` (tested with `TAB=Portfolio&Division=…`).
- [x] Link builder — Opens on, Division, Product, Unit, Quarter (incl. "The current quarter (active)"), Read-only, Present, Gantt active only, Gantt timeframe, include the token; shows the URL, "Copy link", "Open this link here", and "Open a pasted link".
- [x] What read-only hides and what it blocks in code — hidden: Save, every Add button, row-menu edit/add/delete/pause items, editor footer actions, target edit/remove, "click to record a value", pause controls, lineage "Edit", Overview detail "Edit". Blocked in code: `C.mutate` refuses ("Read-only view — editing is disabled."), `PED.open` / `PED.del` / `PED.milestoneStatus` guard. Still available: views, filters, grouping, lineage, Overview details, Settings, simulated polling (`allowRo`).

## Sync (simulated; no network)
- [~] Fixed broker URL, bearer token — Settings says the address is built in and only the token is needed; the token lives in shell state (not localStorage) for the prototype.
- [~] Version check, GET and PUT with If-Match — not visible as such; their outcomes are simulated (load, poll, save, 412).
- [x] `/roster` for the owner picker — `C.D.roster.users`; disabled users are left out; stored owners the roster doesn't know (or disabled) appear as "<email>, not in the roster".
- [x] Docs: portfolio and gantt-view (read/write); EXEC-/BIZ- and SPEC- (read-only) — load message counts the division docs present: "Loaded portfolio + 3 exec + 2 spec docs." Planning writes only the portfolio.
- [x] Load messages — no token: info "No broker token yet — add one in Settings to load live data. Showing local scratch."; success: ok "Loaded portfolio + N exec + M spec docs."; rejected token: err "Load failed (401). Check the token in Settings."; offline: "Load failed (no connection)…". A load replaces local scratch edits with the broker copy, as today.
- [x] 25 s polling with "Updated from another editor." — "A teammate saves a change" applies a real teammate edit (Toru moves the design freeze a week; Erin records a thickness reading in EXEC-DIV-FC; Sam records pilot capacity) and toasts the message. [~] Fixed (bug 20): the teammate edit lands on top of local data instead of replacing it. Disabled with a reason when there is no token or the broker is offline.
- [x] Manual Save with 412 reload — "Someone else saved first — reloading their version, then re-apply your change." then the load message; their change appears.
- [x] Auto-save with 412 re-fetch and merge — "Next save: conflict that merges" → "<message> (merged with a concurrent change)" with their change merged; "…can't merge" → "Auto-save hit a conflict and couldn't merge (412) — reloaded; re-apply and use Save." and the change is lost (reloaded).
- [x] Other auto-save errors — offline: err "Auto-save failed (no connection). Your change is local — use Save to retry."; Save offline: "Save failed (no connection)."; back online the indicator says "Changes not saved yet" until Save.
- [x] In-memory scratch mode without a token — every edit toasts "Saved locally — add a broker token in Settings to sync."; Save says "Add a broker token in Settings before saving."; indicator "Local scratch, not synced".
- [~] localStorage: theme `rd_theme`; Gantt quarters `rd_gantt_quarters`, show-paused `rd_gantt_showpaused`, name width `rd_gantt_labelw` (mods/pgt, added by audit A3). Changed: the simulated token stays in shell state for the visit (no board stores it).

## Filters and grouping (shared bar on Structure, Gantt, Milestones)
- [x] Unit (only when units exist) / Division / Product / Quarter / Status selects — Status options On track, At risk, Off track, No score yet ([~] "No data" renamed).
- [x] Chips with ✕ and "clear all" — "Unit: …", "Division: …", "Product: …", "Quarter: Q4 2026", "Status: …", each with a remove button; "Clear all".
- [x] Shared across Structure, Gantt and Milestones — `C.state.f` / `C.state.group`; changing any filter or the grouping closes open sheets, like today. Fixed (bug 5): the Overview honours the filters too (live), and shows the active chips at the top.
- [x] "Group by" Hierarchy / Custom… with a dimension chain — "Hierarchy | Custom" segmented control; each level is a select (change in place) with a remove button, chevrons between levels, and "Add a level…". Custom with no levels resets to [Division].
- [x] Dimensions: Unit, Division, Product, Model, Quarter, Owner, Initiative — `RD.groupObjectives` / `RD.groupMilestones` on `ctx.group.dims`.
- [x] Owner groups fan out — shared objectives appear under each owner (tested).
- [x] Items with no value sit above the groups — rows of the '' bucket render at the parent depth, first.
- [x] Filter rules for objectives; initiatives without objectives fall back to their own fields — `ctx.objMatch` (unit via division, own division, effective product, quarter tag, band of its score) and `ctx.initMatch` (own unit/division/product; false while quarter or status is set), plus `ctx.initHasMatch`, `ctx.msMatch` (fixed bug 6: honours Unit), `ctx.prodShows`, `ctx.divShows`. Tested against today's rules on the engine. mods/pgt uses them (fixes bug 7).

## Overview
- [x] Company score ("Mean of division scores") — `RD.rollupCompany`, number + band dot and word.
- [x] Unit sections with unit score; Unassigned — declared units by order, then undeclared unit ids, then Unassigned (no score); `RD.rollupUnit`.
- [x] Division cards: overall, per quarter, counts, band dots, worst slip; click opens detail — `RD.rollupDivision`, `RD.boundsOf` + `RD.score(…, q)`, "N objectives, N milestones", status mix (dot + count, labelled), "Worst initiative slip: N days" / "No initiative is slipping" / "No schedule data". Fixed (bug 13): initiatives with no planned end or a non-finite slip are ignored (no "+NaNd").
- [x] Active-work groups by product: own, borrowed ("CODE — Product"), unclassified — today's active rules (`ctx.isActiveObj`, `ctx.isActiveMs`); own products always tile; borrowed products get no model tiles; "Unclassified". Fixed (bug 8): paused/deprioritized milestones are not active. Fixed (bug 5): the product filter no longer brings a filtered-out product back as "borrowed".
- [x] Model tiles: conformance, maturity, specs, components and sub-products, rollup — colour bar, product, model, maturity tag, "N% conformance", Product specs (spec, score) or "No specs yet", "N components, N sub-products", "Objective rollup: Overall N" + per-quarter.
- [x] Objective tiles: days left/overdue/ended, slip chip, KR table, progress, gates and behind count, gate-set rows — "N days left / N days overdue / Due today / Ended <date>" from the projected end; "N days slip"; Key result / Target / Now from each KR's first KPI; progress bar; "Gates N of M passed" + "N behind"; one lane per workstream lettered A, B… (set name on hover), passed gates ✓, each dot titled "<gate>: <state>". Sorted worst score first, unscored last. [~] Fixed: range targets read "6 to 10 mΩ·cm²" instead of "[object Object]".
- [x] Milestone tiles: Done / Achieved / Est / Due, slip, KPI table — fixed (bug 9): the KPI table includes the milestone targets defined in Planning (today read only the exec doc).
- [x] Detail modals for objective (KRs, gates, FMEA, schedule), milestone, model and division (summary, most delayed, models) — `pov.detail` sheet. Objective: badges, key results, "Stage-gates, N of M passed" rows with the gate KPI ("name: current against target"), state and date, plus the weakest-workstream health (today's unused `activeKrDots` health); "FMEA, RPN summary" (N risks, highest RPN, high/medium counts, top 8 worst first); Schedule (planned end, projected end red when later, score). Milestone: band/product, KPIs or "No KPIs on this milestone.", Schedule (planned, projected, status). Model: product/maturity, specifications with conformance, components and readiness, sub-products, rollup. Division: overall, active now, in the plan, status mix, worst slip; most delayed initiatives (top 3, "Due …", "+N days", "Now …") or "No initiatives are running late."; models with rollup and conformance. Footer: Open in Execution/Sales or Product spec (hand-off), report (milestone), Edit, Lineage. Fixed (bug 21): "Active now" counts active work; the totals read "In the plan". Fixed (bug 10): business divisions read their BIZ- doc.
- [x] Empty and filter-mismatch messages — "No divisions yet. Add one in the Structure tab to begin.", "No divisions match the current filter (division …). The filter matches a division id such as DIV-FC, not its name.", "No active objectives or milestones this quarter."
- [x] (dead code §18, intended behaviour) `slicesHtml` — "Scores by product and model" table at the foot of the Overview: spec conformance (product = mean of its models), overall and per-quarter `RD.sliceScore`.

## Structure
- [x] Units, Divisions, Products (with model rows) and Initiatives (with objective and milestone rows) tables — four panels. [~] Added columns: Division has Unit, Kind and Score; Products has Code and Order (today put a model's Order in the Division column); Initiatives shows Division, When (planned window / quarter / planned date) and Status (band dot + word; initiative score).
- [x] "+ New unit / division / product / initiative" — "Add unit", "Add division", "Add product", "Add initiative".
- [x] Row actions "✎", "+ model", "+ obj", "+ ms", "✕" — each row's "…" menu: Edit, Add model / Add objective / Add milestone (and Add initiative / Add product on divisions, from today's tree), Pause / Deprioritize / Resume and Mark achieved / Reopen milestone on milestones, Open in Execution/Sales on objectives, Open in Product spec on models, Show lineage, Delete.
- [~] Id links open Lineage — names open the lineage; ids are shown next to them.
- [x] Order-based sorting — blank order last.
- [x] [new] Collapse — products (models) and initiatives (objectives, milestones) fold with a chevron; "Collapse all" / "Expand all" per table. The initiatives panel notes how many milestones are paused or deprioritized (`RD.pausedMilestoneIds`).
- [x] Ended badge and "exec: Division" badge — "Achieved"/"Abandoned" (end date on hover); "Executed in <division>" with today's explanation on hover. Fixed (bug 10): read from the BIZ- doc for business divisions.
- [x] Filtering per table — units never; divisions by unit + division; products by unit + division + product; initiatives by unit + division and, when product/quarter/status is set, only with a matching objective; objective rows by every filter; milestone rows never. Fixed by audit A3: an initiative with no objectives falls back to its own product under a product filter (today's tables hide it although the shared rule and the Gantt match it); still hidden under a quarter or status filter.
- [x] Custom grouped tree: collapse, band dot, count, group add buttons pre-filled — chevron (aria-expanded), dot from the mean objective rollup, "<Dimension> <label>", "N objectives", "Add objective" always, plus Add initiative (division), Add model (product), Add milestone (initiative), pre-filled from the group path. Fixed by audit A3: an objective added from a division group gets an initiative of that division (one that fits the group's product or model) instead of the plan's first initiative, which made it cross-division.
- [x] Objective rows with context line and always-visible actions — dot, statement (lineage), badges, quarter / initiative / owners, Open in Execution/Sales, Edit, Delete.
- [x] Flat toolbar "+ New objective" / "+ New initiative" — "Add objective" / "Add initiative" in the grouped panel header ([~] shown for every custom grouping, not only the flat list).
- [x] Empty messages — "No units yet. Units group divisions, like Business and Technical.", "No divisions match the filter." / "No divisions yet…", "No products match the filter." / "No products yet…", "No initiatives match the filter." / "No initiatives yet…", "No objectives match the current filters."

## Editor (sheet `ped.edit`)
- [x] Add/Edit title, Add/Update and Cancel — "Add objective" / "Edit objective"; primary "Add objective" / "Save objective" ([~] "Update" → "Save", matching the toast), Cancel (Back when stacked); the first field gets focus.
- [x] Fields per entity — unit (name, order); division (name, unit, kind R&D/Business, order); product (name, division, code [~ new UI for the stored `code`], order); model (name, product, order); initiative (name, division, description, planned start/end, product, model, order); milestone (name, initiative, planned date, completed date, TRL, MRL, order); objective (statement, division, initiative, quarter, owners, planned start/end, linked milestones, product, model, order). [ ] `layer`: no field — today's Planning has no UI for it (legacy value only read by older Execution builds).
- [x] Optional "— none —"; "classification" tag — "None"; product/model carry a "Classification" tag.
- [x] Owner multi-select with "not in roster" entries — checkbox list of active roster people (name + email), plus stored owners outside the roster.
- [x] Linked milestones multi-select — checkbox list of every milestone (the objective's initiative first) with initiative and date.
- [x] Quarter options; quarter fills planned dates — `RD.quarterList(used, year, 1, 2)` + own value + None; picking fills planned start/end from `RD.quarterRange` (still editable). [~] An add pre-filled with a quarter (custom group) also gets those dates.
- [x] Product/model pairing; objective inheritance; model stored alone — product narrows the model list, a model fills its product, another product drops a foreign model; an objective without its own class shows the initiative's ("Inherited from the initiative. Leave it to keep inheriting."); on save a model is stored alone and an inherited value is stored blank.
- [x] Number/text/date conversions — dates as day numbers, blank text null. Fixed (bug 11): a blank number (Order, TRL, MRL) saves as null, not 0; a non-number says "Order must be a number, like 2."
- [x] Both product and model error; classification reasons — "A node can pin a product or a model, not both."; "Classification blocked: <reason>" with each engine reason rewritten plainly (e.g. "its initiative pins both a product and a model. Fix the initiative first.").
- [x] Automatic class clearing message — "Objective saved. Its product and model were cleared to match the new initiative." [~] When the initiative did not change: "…didn't fit its initiative, so they were cleared and it inherits the initiative's again."
- [x] Division-move warning with "Save again" — today's text for objectives (key result and stage-gate counts from the right EXEC-/BIZ- doc) and initiatives; the primary button turns into "Move anyway"; picking another division re-arms it.
- [x] Save messages; return to the initiative editor — "<Entity> added." / "<Entity> saved." ([~] today said "saved" for both); a milestone opened from the initiative editor is stacked over it, so Save, Cancel and Back return to it.
- [x] Id formats — `RD.allocId` exactly like today (UNIT-<6>, DIV-<4>, PRD-<div>-N, MDL-<prd>-N, INIT-<div>-NN, MS-<init>-NN, OBJ-<div>-<quarter|UNSET>-NN, KPI-<host>-N, UPD-<kpi>-<timestamp>). Fixed (bug 12): a duplicate division/unit code says "The id DIV-HYDR is already taken…", and a missing parent says "Add an initiative first. Every milestone belongs to one." instead of failing silently.
- [x] Specifications block (read-only) with hints — "Product specifications: X" / "Model specifications: X", "Read-only, from Product spec"; rows dot, name, target summary, current or "No reading", score; hints for an unloaded spec doc (with "Add a broker token in Settings." when there is none) and "No headline KPIs on this model yet. Add them in Product spec."; "Open in Product spec" for models.
- [x] Where you can add from — table Add buttons, row menus, custom group buttons, flat toolbar, the initiative editor's "Add milestone", and `PED.open(…, { parentId })` for the Gantt's hover actions.
- [x] [new] Validation that today lacked: a name/statement is required; planned end before start is refused.

## Targets (initiative / milestone KPIs) and readings
- [x] Targets list: dot, summary, current, edit, remove/confirm — "Initiative targets" / "Milestone targets" with "Add target"; rows: band dot, name, summary ("≥ 75%", "Median ≤ 1800 $/kW, 3 readings expected", "Binary, met or not met"), current value, score, edit and remove icons. [~] Remove confirms with a dialog ("Remove target"). Empty: "No targets yet. Define a KPI at this … here, then link key results or stage-gates to it from Execution to feed its value." (Tasks dropped from the sentence on October 15, when Execution and Sales lost their Tasks tab.)
- [x] Milestone source line — "Source: manual entry" / "Source: <KR KPI> (best of N)".
- [x] Click to record a value (Enter / Escape / leave field) — the current value is a button ("Click to record a value"); Enter or leaving saves, Escape cancels, blank cancels; reading `{id, kpiId, value, timestamp, note:""}` in `kpiUpdates`, "Value recorded.". [~] A non-number on Enter says "Use a number, like 1.85." (on leave it reverts, like today).
- [x] Target editor: Name, type, readings used, statistic, direction, target, unit — stacked sheet `ped.target`: Name ("e.g. Mass activity"), Target type (Demonstration / Statistical / Binary), Statistical: Readings expected + Statistic (Average, Median, Std dev, CV %, Range, Max, Min); not binary: Direction (Increase / Decrease), Target value, Unit ("e.g. A/g, %, mV"). Fixed (bug 18): "Readings used" is "Readings expected" with the discount explained. [~] Name required; numbers validated.
- [x] Milestone value sources tree — Objective (quarter) › key result › KPI checkboxes from every exec doc, or "No key result KPIs in this initiative yet."
- [x] "Save target" — "Target saved."; fixed fields objectiveId null, isDefiner true, groupId null; id `RD.allocId('kpi', host, …)`.
- [x] Removal message — "Target removed." Fixed (bug 19): its readings go too, and other targets stop listing it as a source.

## Milestones (my part)
- [x] Status block with Report button — "Milestone status": Achieved + "Marked complete <date>" / "KPI target met", or band, or "No reading yet. Set a completed date, or link a key result or stage-gate to a milestone KPI in Execution."; score; "Create report" / "Open report" (+ "Locked") calls `PMS.openReport` (mods/pms).
- [x] Pause / Deprioritize / note / Resume, saved immediately as history — "Why (optional)", Pause, Deprioritize, today's hint; paused shows "Paused since <date>", the note and Resume; messages "Milestone paused." / "Milestone deprioritized." / "Milestone resumed."; records appended with `RD.setMilestoneState`. Also in the Structure row menu and `PED.milestoneStatus` (used by the Gantt and Milestones tab), plus [new] "Mark achieved" / "Clear the completed date" (sets/clears `completedDate`).
- [x] Milestone list in the initiative editor: add, edit, remove/confirm — "Add milestone" (stacked editor), rows with band diamond, name, date or "No date", edit, remove (confirm), "Milestone deleted." and links dropped from objectives.
- [x] Delete (from the Milestones tab) — `PED.del(C, ctx, 'milestone', id)`.
- [x] Paused milestones excluded from dates — fixed (bug 8): `ctx.casc()` runs the cascade without paused/deprioritized milestones (and drops them from objectives' links for that run), so they no longer push initiative slip; the Overview uses it and mods/pgt reads it.

## Delete
- [x] Modal variants (none nested / unit / nested items) — nothing nested: dialog "Delete <name>?" / "This can't be undone." / "Delete <entity>"; unit: "Delete unit <name>?" / "N divisions in this unit will become Unassigned. They are not deleted." / "Delete unit"; nested: sheet "Delete <entity>" with "This <entity> contains 1 product, 1 model, …. Delete those too, or keep them?", buttons "Delete <entity> and N items", "Delete <entity> only" (tooltip "Keep the nested items; they lose their <entity> link"), Cancel.
- [x] Full-delete rules — product: its models; initiative: its objectives and milestones; division: products, models, initiatives with objectives and milestones, and the division's other objectives; unit: nothing.
- [x] Unit leaves divisions unassigned.
- [x] Milestone links cleaned up.
- [x] Messages — "<Entity> deleted." / "<Entity> and N items deleted."
- [x] Fixed (bug 19): deletes also remove targets hosted on deleted initiatives/milestones/products and their readings, pause records, objective/milestone edges and composition rows that point at deleted records; "<entity> only" clears the kept children's link instead of leaving a dangling id. Sheets showing a deleted record close.

## Lineage (sheet `ped.lineage`)
- [x] Title, "← back" stack, breadcrumb — title is the name with the entity and id under it ([~] instead of "Entity · name"); navigating pushes a sheet, Back pops it; crumbs link up the chain (unit › division › initiative/product).
- [x] Structure below the item (including KRs and SG gates, model details) — collapsible rows: division → initiatives (milestones, objectives) and products (models); objectives → key results, workstream headers and gates "SG-A1…"; models with conformance, maturity, sub-products, "used in"; "No execution document is loaded for this division." / "No key results or stage-gates yet." / "Nothing is planned under this yet." Fixed (bug 10): reads BIZ- docs. [new] Units list their divisions.
- [x] Related groups with tags and counts — Classification, Linked milestones, Objectives linking this, Initiatives classified here, Objectives classified here, Composed of, Used in; each with an entity tag and counts ("2 products, 2 initiatives, 5 objectives", "3 key results, 5 gates, 2 workstreams").
- [x] "Edit this" — "Edit <entity>" (hidden in read-only); [new] Open in Execution/Sales for objectives, Open in Product spec for models.

## Settings
- [x] Broker token field, "Save token", status line — Settings › Broker: status "Token set. Live sync active." / "No token set — running on local scratch data.", today's hint, password field "Paste token", "Save token" ("Token saved." then the load), [new] "Remove token" and "Load from the broker".

## Computed values (all through the engine, as today)
- [x] Bands, KPI formulas, statistics and sample discount, best-source rule — `RD.band`, `RD.kpiScoreResolved`, `RD.effValue` / `RD.effValueSource` on `ctx.em` / `ctx.pool`.
- [x] KR/gate/milestone/objective scores — `RD.keyResultScore`, `RD.stageGateScore`, `RD.milestoneScore`, `RD.objectiveScore` / `RD.rollupObjective`.
- [x] Initiative/division/unit/company rollups (overall vs quarterly) — `RD.rollupInitiative`, `RD.rollupDivision`, `RD.rollupUnit`, `RD.rollupCompany`, `RD.score(…, q)`; tested against the engine.
- [x] Milestone achieved — `RD.milestoneAchieved`.
- [x] Gate states, set score, health — `RD.classifyGate`, `RD.objectiveGateReadiness`.
- [x] Cascade and slips — `ctx.casc()` (see the paused fix above).
- [x] Conformance, product/model rollup, RPN — `RD.objectiveScore(model, spec docs)`, product = mean of its models, `RD.sliceScore`, RPN = S×O×D with `RD.rpnBand`. (Report result: mods/pms.)

## Data (fields the UI shows or edits)
- [x] Unit id, name, order; delete clears divisions' unit.
- [x] Division id, name, unitId, kind, order.
- [x] Product id, name, divisionId, order, code ([~] now editable).
- [x] Model id, name, productId, order; maturity read-only from the spec doc.
- [x] Initiative id, name, divisionId, desc, plannedStart, plannedEnd, productId, modelId, order.
- [x] Objective id, statement, divisionId, initiativeId, quarter, owner (list; a legacy string is read), plannedStart, plannedEnd, milestoneIds, productId, modelId, order.
- [x] Milestone id, name, initiativeId, plannedDate, completedDate, trl, mrl, order (milestoneReport: mods/pms).
- [x] Pause records `milestoneState` — appended, never edited.
- [x] Targets `kpis` (initiative / milestone) and readings `kpiUpdates`.
- [x] No UI, used by the cascade: objectiveEdges, milestoneEdges, stageGateEdges, composition (shown in lineage and model details).
- [x] No UI at all: kpiDefs, gantt-view overrides.
- [x] Read-only exec docs (keyResults, stageGates, stageGateSets, kpis, kpiUpdates, objectiveState, risks) and spec docs (KRs, components, KPIs, modelSpec) — read by kind (EXEC- / BIZ-).
- [x] Roster user: email, disabled.

## For other modules
- `ctx` contract documented at the top of `apps/plan/shell.js` (filters, rules, cascade, docs by kind).
- `PED.open / lineage / del / milestoneStatus` documented at the top of `mods/ped/mod.js`.
- The editor's Report buttons call `PMS.openReport(C, ctx, msId)` (falls back to the Milestones tab when absent).
