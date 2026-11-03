# Pulled KPIs (X-pull): coverage

Built October 19 from the "Pulled KPIs for leaders" proposal and its canvas mockups (revised from Corey's
example), after "Build it". Corey: "I have an OKR about technical excellence. 1 KR is that the average objective
score should be above 80%: automatically grab objective scores and calculate average and median. 1 KR is to
maintain on time completion of stage-gates: ensure no objective is more than 10 days behind schedule by taking
the delays of objectives and finding the number more delayed than 10 days." Follow-up: "On pulled data KPIs,
make the readings a simple dropdown button instead of in the 3 dot menu." Then: "KPIs adding in the sales app
cannot see objectives in the execution app. I need to be able to reference any objective, regardless of division
or business unit."

Files: `mods/pull/mod.js` (words, the row, the readings drawer, the sheet, who may), `slot-sheets.html` (the
`pull.build` sheet), `mod.css`; the engine's pulled-KPI section in `rdcore.js` (`RD.pulledResult`,
`RD.pulledValue`, `RD.setPullSource`, `RD.PULL_MEASURES / PULL_STATES / PULL_STATS`); tests `test/sc_pull.js`
(both boards) and the repo's `pulled_kpis.cjs` (the engine). Built into Execution (`Main.dc.html`) and Sales
(`Sales-A.dc.html`); Planning and the Hub compute the same values through the engine.

Legend: `[x]` done, `[~]` changed from the mockup (why), `[ ]` not done (why).

## The engine (every app scores it the same way)
- [x] `kpi.pull` on an ordinary statistical KPI: `{ v: 1, each, measure, states, window, scope: { div, quarter, proj, owner, narrow }, follow, items?, exclude, by, at }`; `kpi.threshold` for the four threshold statistics. Additive: nothing else in a document changes, and an app without the module still shows the value.
- [x] `effectiveValueEntry` takes a pulled KPI's value from what it pulls, so key result and objective scores, gate readiness, `gateAtTarget` and auto-pass, the Overview, Planning and the Hub read it unchanged. Never discounted as a partial check-in; readings posted to it (an old page, an import) are ignored.
- [x] Twenty readings over seven kinds of work: objective score, days behind schedule (the Schedule card's slip, `cascade().objectiveScheduleSlip`), gate health, status; key result score, pace; stage-gate days late (against the baseline when re-committed), passed on time, readiness; workstream share of gates passed; tile finished, stage health, days in stage, finished in a window, days to finish; experiment concluded in a window, hypothesis, status, days running; logic tree outcome (the recorded path from the root to a terminal).
- [x] Statistics: numbers take average, median, min, max, total (`sum`, new in `computeStat`), standard deviation, CV, range, and count or share above or below a threshold (strict); statuses take share or count in the picked states; dated happenings take count or per week in the last 7, 30 or 90 days or this quarter so far.
- [x] Which work: any division, R&D or business, from either app: every division (`all`), every R&D or every business division, every division in a business unit (`unit:<id>`), or one division; the current, next or one quarter, or any; a project; an owner (any case); narrowed to a workstream, board or logic tree. Pulled items are listed in unit order, then division order, as the apps list divisions. Only divisions whose documents the page has; every app now has them all (Execution and Sales load each other's, read-only).
- [x] Never pulled: the KPI's own host (a key result's KPI never reads its own objective or key result; a gate's target never reads its gate). A longer loop (two objectives pulling each other, P-6) reads no value inside the loop: each side reads the other without itself, results across a loop are not kept, nothing throws.
- [x] Waiting, not zero (P-5): an item without a reading is listed with why and left out (no score yet, schedule ended, no planned dates, no workstreams, not due yet, no date, no targets read, parked, finished, not finished, finished before the window, finish date not recorded, no start date, not concluded or not running, planned to start, no completion date). A statistic over nothing has no value, except a count of dated happenings (0).
- [x] The page's documents: each page registers `RD.setPullSource` (`C.pullSource()`, kit/core.js): every document it has and today, one object per version of the data, so a value is worked out once per change (C.mutate, every document NET installs, a gate passing on its own bump `D.version`). Without one (the Hub, the broker) the map handed in and today's date are used.
- [x] Live: NET passes gates at 100 once every document of a load is in (a pulled target reads other documents), still the only write on load.
- [ ] P-8 history (each Monday's value kept as a reading, with the items behind it) — not built: it would write on load, which live pages never do except to pass gates. Values are live; a decision is open (see the delivery notes).

## In the KPI tables (Key results, Stage-gates, the Readings sheet)
- [x] A "Pulled" tag (its title says what it pulls), the target ("≤ 0 objectives"), the value, and a sentence ("1 of 5 objectives more than 10 days behind schedule", "Average of 5 objective scores").
- [x] The value is a dropdown button (bordered pill with a chevron; "Show readings" / "Hide readings"; chevron up and the accent tint while open) that shows or hides the KPI module's readings drawer, now listing what was pulled: each item's reading, its name, where it sits (division or objective), what it means; counted items first, largest first; threshold hits flagged (red when they count against the target); the median's middle value, the max's highest and the min's lowest marked; waiting and left-out items last with why; the host listed and never pulled. Nobody posts a reading there.
- [x] Leaders get a row menu with only Edit KPI / Delete KPI (Edit target / Delete target on gates) and the name opens the sheet; everyone else gets no menu, and the drawer says who sets it ("Corey Staller (CTO) and Dana Whitcomb (CEO) set what it pulls").
- [x] Every other route is closed: posting (`KPI.post`, the inline editor, `addReading`), Connect data targets, a sample to borrow, a metric to link to, a key read's KPI on the Experiments tab.

## Making and changing one (`pull.build`)
- [x] Add KPI / Add target: leaders get "Readings: Posted here | Pulled from other work" at the top of the KPI sheet (new KPIs and targets only); picking it turns the sheet into the pulled one in place (a typed name carries over), and "Posted here" turns it back.
- [x] A live preview on top: a tile per statistic as its row will read (value, status word, score, target) and what was pulled ("5 objectives pulled from every R&D division, the current quarter (Q4 2026).").
- [x] What to pull: Pull each (seven kinds), Read its (the measures, each with what it means), Counting (the states) for a status, Window for dated readings.
- [x] Statistics as chips; adding, several at once (one KPI each: Corey's average and median in one go); editing, one (another chip replaces it). Threshold with its unit and a hint ("Counts each objective more than 10 days behind schedule.").
- [~] Which work: Division (a lead's own by default; the CTO's and CEO's every division, of both apps, since October 19; P-4 offered one app's kind only), listed as Every division, Every R&D division, Every business division, then Units ("Technical unit": every division in it) and Divisions (one by one, in unit order), short enough for the closed select; Quarter (current by default), Owner and Project (among the objectives the division reaches), Board / Workstream / Logic tree to narrow. Division and Project take a full row, Quarter and Owner share one: side by side as on the mockup, a closed select clipped real names ("Business Development", "Roll-to-roll membrane scale-up"). A gate starts on its kanban tiles, finished.
- [x] The items, grouped by division or objective, ticked to pull; hits flagged; "New work that matches joins on its own" (default), or untick it to keep only the items picked (new matches wait, listed as not picked).
- [x] Targets per statistic: a name that follows the settings until typed, At least / At most, target, unit (from the statistic); a count of items on the wrong side of a threshold aims at 0. Scored as today's statistical KPI.
- [x] Checks: a number for each target and the threshold; at least one item in a picked list. Saved with `RD.allocId('kpi', objective)`, who and when; toasts "KPI added." / "2 KPIs added." / "KPI saved." / "Target added."
- [x] A new scope (division, quarter, project, owner, narrowing) starts with nothing left out by hand, as on the mockup; a picked list keeps what it picked.
- [~] The drawer's hint no longer promises a weekly history (P-8 is not built): "Pulled again whenever the work changes."

## Elsewhere
- [x] Key result sheet: pulled KPIs are listed with a "Pulled" tag, not edited there and kept untouched on save; only leaders can remove one there.
- [x] Duplicating a key result copies its pulled KPIs for leaders; anyone else's copy leaves them with the original and says so.
- [x] The Overview's review table: the same dropdown (the chevron alone in the progress cell); notes say what was pulled ("Pulled: median of 5 objective scores.", "0 of 2 KPIs on target. Each is pulled from other work.").
- [x] Older records (October 20, Corey: "clicking pull from other work yields a white window. No content shown"): the live portfolio holds each objective's owner as one email, not a list. The sheet's Owner choice and the engine's owner scope read owners through `RD.ownersOf` (any case, spaces trimmed); a lead's `leadDivisions` / `leadUnits` / `leadOf` may be one value too. A sheet that still can't be built says why, with Close, instead of a blank panel. Walked on the mapped real-data seed: every kind of work, measure, division, quarter, owner and project, a KPI of each kind saved and its readings opened, no errors.
- [x] Live: Execution and Sales load every division's document, R&D and business, and write only their own kind (`APP_LIVE_PLAN.writable`); a change the poll brings in to the other app's documents is taken in without "Updated from another editor." (`quiet`). Auto-pass on load touches only this app's documents.
- [x] Who: the CTO and the CEO anywhere; a lead in the divisions they lead, by the roster's `leadDivisions`, `leadUnits` (a unit's divisions) or a legacy `leadOf` naming the division (P-3). Read-only and view pages: values and drawers only.
