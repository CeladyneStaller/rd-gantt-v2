# Product spec board: S-core coverage (shell + mods/sspec)

Scope: inv/spec.md §1–7, §10–11, §14–19 (+ §20–21 where they touch these). Files: `apps/spec/shell.{html,js,css}`,
`mods/sspec/{mod.js,mod.css,seed.js,slot-main.html,slot-sheets.html,part-metrics.html}`, `test/sc_spec.js`.
Components, sub-products, component owners and cross-product dependencies (§8, §12–13) are S-comp's (mods/scomp, mods/ssub).
The §9 metric editor is implemented here as `SSPEC.openMetric` and used by S-comp's component cards and sheet (listed below).

Legend: `[x]` done as today · `[~]` changed (reason) · `[ ]` not done (reason) · "fixed:" a bug or gap in today's app.

## Header (§1)
- [~] Theme applied before first paint (`rd_theme`, else OS setting, else dark) — changed (lead decision for all four boards, corrected by audit A4): a stored light / dark / system choice is applied at load; with no choice, an invalid one or blocked storage the board starts light so the four boards match (today: follows the OS, and dark when storage throws). Match system follows the OS.
- [~] "⌂" link to the CeladyneHQ hub — changed: the sidebar brand block is the link (same URL, same tab, title "Back to all apps"); no glyph.
- [~] "▤ Product Specification" heading; static page title — changed: the app switcher marks "Product spec" as current and the board title is "Product spec, calm workspace"; no glyph.
- [x] Context pill "Division · Product" — breadcrumb Division / Product / Model in the top bar ("Product specification" when no division).
- [x] Division dropdown (non-biz divisions; saves, then switches the spec document) — sidebar product tree grouped by division (kind biz excluded). Switching saves pending edits first, stores `rd_division`, resets product/model and closes editors, toasts "Switched to ‹name›.". A 404 gives a blank document. "Couldn't load SPEC-‹div› (‹status›) — is its SPEC bin configured on the broker?" shows when Settings simulates unreachable bins. Fixed: today the division id changes even when that load fails, leaving the old document under the new division; Calm stays on the current division.
- [x] Biz-division redirect to the first product division — at load (`?division` / `rd_division`) and in the URL-parameter link (with a toast explaining it).
- [x] Product dropdown (seeded from `?product=`; resets the model) — product rows in the tree select that product and its first model; `?product` applies only inside the division.
- [x] Model dropdown (first model auto-selected) — model rows in the tree (dot + conformance score, or "No specs" / "No score"); the first model is selected by default; "No models yet" / "No products yet" under empty products and divisions.
- [x] "● read-only" badge — "Read-only" status (dot + word) in the top bar.
- [x] "Save" (forces the debounced save) — quiet "Save" button in the top bar (hidden in read-only); flushes the save and toasts "Saved.".
- [x] "⚙" settings toggle — Settings icon button opens the settings sheet; the token field is pre-filled and the product list is current.

## Settings (§2)
- [x] Broker token field + Save (stores, reloads) — password field pre-filled with the current token, "Save token" (or Enter) trims and stores it, toasts "Saved." and reloads ("Loaded SPEC-‹div›."); an empty value means working locally: banner "No broker token — working locally. Add one in Settings to sync.", no portfolio, so no products (as today). Simulated; the token is kept for the session only. Fixed by audit A4: after "Save token" the saved value is the sheet's new baseline, so closing Settings by the dimmed page no longer asks to discard it.
- [x] Sync help text — kept, without the ⚙ glyph.
- [~] Light/Dark toggle (suite-wide, follows the OS when unset) — changed: Light / Dark / Match system, stored in `rd_theme` (Match system stores `system`, which today's apps treat as no choice and so follow the OS), with today's hint. (Corrected by audit A4: the earlier claim that Match system removes the key was wrong; all four boards store `system`.)
- [x] Product families read-only list (models and metrics counts) — one row per product: name, id, "‹n› models, ‹k› metrics" (product-hosted KPIs); empty states "No products in this division yet — add them in the Planning app." / "Connect a broker token to load products."; today's help text.
- [~] Export JSON (`product-spec.json`) — changed: opens a sheet with the pretty-printed division document (exactly what the file holds, no portfolio data) and "Copy JSON", instead of a download.
- [x] Import JSON (replaces the division document, then autosaves to the broker) — sheet with a textarea (and "Start from the current document"); invalid JSON or a non-object shows "Import failed — not a valid document."; success toasts "Imported." and autosaves. Fixed: asks first ("Replace the ‹division› specification document?", with counts) and runs the load-time repairs (today import has no confirmation and skips them). Fixed by audit A4: a document whose lists hold non-records (`{"kpis":[null]}`, `{"keyResults":[1,2]}`) or whose `modelSpec` is not a map is refused before the confirm, saying which part is wrong; before, it passed validation, the confirm promised a replacement and the import then failed with a raw TypeError toast (today it breaks the page).

## Banner (§3)
- [~] info / err / ok messages; ok auto-hides after 2.5 s — changed: ok messages are toasts (kit timing, ~4 s); persistent info / err messages (local mode, teammate update, conflict, failed load, connection lost) use a banner under the top bar that stays until replaced, with a Dismiss button. Validation errors in sheets show inline in the sheet footer.

## Model header (§4)
- [x] Empty states — no token: "Add a broker token in Settings to load products and models from the portfolio." (with Open settings); no divisions: "No divisions exist yet — add one in Planning."; no products: "No products in this division yet — add products and models in the Planning app, then reload."; no models: "No models in this product yet — add them in the Planning app." Each links to Planning. "Not loaded." and "Select a model." cannot occur (the board loads at once and always selects the first model).
- [x] Model name, id and maturity pills — h1 name, id, maturity as a tag.
- [x] Product / Application subtitle and notes line — "Product: ‹name | unassigned›", "Application: ‹text›", notes below.
- [x] "edit spec details" — "Edit spec details" opens the Model spec details sheet (§14).

## Metric strip (§4)
- [x] Spec conformance (score, bar, band pill) — big number (rounded, or —), band word with dot, bar; a sentence says what it is the mean of and how many specs are unscored (counted as 0).
- [x] Specifications count + "on target" — "Specifications 4, 4 on target" (band on-track, ≥ 80).
- [x] Components count + "conformant" — plain components only, conformant = component score ≥ 80.
- [x] "Metrics measured" X / Y — "9 of 9, have a reading" (this model's metrics on specs and components incl. linked ones, excluding imported sub-product rows).
- [x] Product family + product KPI count — "Tera stack, 1 product KPI".

## Signal bars (§4)
- [x] Per-spec conformance bars "S‹n› · statement" — S‹n›, statement (full text on hover), bar width = score coloured by band, number with dot; hidden when the model has no specs.
- [x] Legend: meets / marginal / off target / no data — "Meets", "Marginal", "Off target", "No data" with dots.

## Product specifications panel (§5)
- [x] Collapsible panel with count — heading button with chevron and count; open state is memory only.
- [x] "+ add specification" — "Add specification".
- [x] Empty-state hint — today's text, plain.
- [x] Card: S‹n› and statement, click to edit — S‹n› tag + statement button ("Edit specification"), plus the tracking type under it.
- [x] Spec score — number with band dot (RD.keyResultScore); band word on hover.
- [x] "+ KPI" — "Add KPI" (also in the card's "…" menu) opens "Add KPI" (§9 editor, spec host).
- [x] "+ link" — "Link metric" (also in the menu) opens Link a metric for this spec.
- [~] "del" → "confirm" (cascades) — changed: "Delete specification" in the card menu asks with counts (metrics, readings, metrics that will be unlinked, gates and imported links that will drop) and toasts "Specification deleted.". Fixed: no dangling references remain (component specs that gated it and imported sub-product rows linked to it are cleared; today they show a raw id or "—").
- [x] Drag "⠿" to reorder specs — drag handle onto another card (moves before it), toast "Reordered."; other models' records keep their places. Calm adds Move up / Move down in the menu (keyboard reachable).
- [x] Spec metric table — §11 table on every card.
- [x] "⛒ gated by:" with scores, click to edit — "Gated by" line: each gating component spec with its own score; click opens its editor; hover says which component and why.
- [x] "↳ from sub-products:" with scores — "From sub-products" line (display only, hover explains it does not count); scored with the sub-product resolution (SSUB.resolveRef / shell resolveRef).
- [x] "✎ Notes" expandable — "Notes" toggle, collapsed by default, open state memory only.
- Calm additions: a % completion spec shows its progress bar; a sub-spec spec lists its sub-specs with weights and scores (click one to edit it, stacked over its specification); a note says metrics don't count while a spec is tracked by % or sub-specs.

## Specification modal (§6) → "Add / Edit specification" sheet
- [x] Statement (required) — "Specification needs a statement." in the sheet; placeholder kept.
- [x] Tracking type: % completion / Single metric / Sub-specifications — segmented control; new specs default to % completion, existing ones without a type to Single metric.
- [x] Progress slider — 0–100 with live percent; saved clamped.
- [x] Single metric: Target type, Read count, Statistic, Direction (≥ / ≤), Target, Unit — all fields; Binary clears direction, target, unit, statistic and read count; creates or updates the primary metric named after the statement. Fixed: a range target survives (today the editor shows "[object Object]", saves it empty and flips the direction to up); Range is offered with low / high. Typed values are checked ("Use a number for the target, like 1.2.", read count is a whole number) instead of being silently dropped. A note explains when the primary metric is linked (name / direction / unit come from the parent; the target is an override).
- [x] Sub-spec list: add, edit by clicking the name, del — "Add sub-spec", click a name to edit, "Remove" (draft only, no confirmation, as today); empty state; the weighted score of the draft is shown.
- [x] Notes — trimmed; blank removes them.
- [x] Save / Update specification; Cancel / × — toast "Specification saved."; switching to % drops sub-specs, to sub-specs drops progress, the primary metric is kept.
- [x] Draft survives background re-renders — drafts live in the sheet stack (a teammate update or a re-render keeps typing).

## Sub-specification modal (§7) → "Add / Edit sub-specification" sheet (stacked over the spec sheet)
- [x] 4 tracking types — % completion / Demonstration / Statistical / Binary.
- [~] Name (required), Weight — changed: a blank name says "Name the sub-specification." (today it only refocuses). Weight blank or 0 becomes 1; fixed: a negative or non-numeric weight is refused ("Weight is a number of 0.1 or more, like 1.") instead of being saved.
- [x] Read count, Statistic — statistical only.
- [x] Direction, Target, Unit — demonstration and statistical.
- [x] Initial progress slider — % completion only.
- [x] Current measurement — demonstration only; checked as a number.
- [x] Readings textarea with live statistic preview — "No readings yet." / "Average: 46.333 from 3 readings"; on save the current value is computed with the chosen statistic. Fixed: blank pieces are skipped (today a leading space or trailing comma adds a phantom 0 reading).
- [x] Binary status (Unmeasured / Not met / ✓ Met) — Unmeasured / Not met / Met.
- [x] Save sub-spec (into the spec draft); Cancel / × — back to the spec sheet; nothing is stored until the specification is saved (said in the sheet).

## Component specification / KPI editor (§9) — implemented here as SSPEC.openMetric; S-comp's cards and sheet call it
- [x] Name (required) — "Give the KPI a name." / "Give the specification a name."
- [x] Target type: Demonstration / Statistical / ✓ Binary
- [x] Read count, Statistic (statistical)
- [x] Direction (≥ / ≤ / ↔ Range); Target, Range low / high, Unit — a range is stored only when both ends are filled; low above high is refused. Fixed by audit A4: a range saved with one end missing reopens as Range (today's openTgtModal reopens it as "At least", and the next save quietly turns it into an up metric); the specification editor does the same for its primary metric.
- [x] "Gates a product specification" (components only) — select with "None (standalone)" and the model's specs, with today's explanation.
- [x] Notes (components only)
- [x] Save / Update; Cancel / × — toasts "Gating spec saved — gates “‹spec›”." / "Component specification saved." / "KPI saved."; binary clears direction, target, unit, statistic, read count. Fixed: the hint no longer says statistical targets "aggregate the latest reads" (they use every reading; Read count is the expected sample size and discounts the score until met).

## Metric tables (§11) — `mods/sspec/part-metrics.html` + `SSPEC.metricTable` (spec cards here; component cards and sheet in S-comp)
- [~] Columns: Metric / dir / target / current / score / post reading — changed: direction is folded into the target ("≥ 25 kW", "≤ 1%", "11.5–12.5 µm", "Pass"; the direction word on hover). Current shows the value with its unit, formatted (full value on hover); statistical metrics with a read count also show "4 of 6 readings" (the discount that today is invisible).
- [x] Click a name to edit or override — unlinked metrics open the §9 editor, linked ones the override sheet; "(unnamed)" for empty names.
- [x] override / inherited target pills — "Override" / "Inherited" under the target of linked metrics.
- [x] Link, imported, defines-N and gates badges — "Linked", "Imported from ‹Product›", "Defines N links", "Gates ‹spec›" (tags with explanations on hover).
- [x] "no read" — "No reading".
- [x] Post reading (value + "post") — value field + "Post" (or Enter); `UPD-‹kpi›-‹ms›`, timestamp, value, empty note; "Enter a value to post." / "Reading posted."; a non-number says "Use a number for the reading, like 1.85.". Changed: binary metrics get "Met" / "Not met" buttons that post 1 / 0 (today you type 1 or 0). Readings still can't be edited or deleted (as today).
- [x] "unlink" — "Unlink" in the row menu for linked metrics.
- [~] "del" → "confirm" (blocked for metrics other metrics link to) — changed: "Delete metric" in the row menu asks with the reading count; a definer is blocked with today's "This metric defines a linked group — unlink its members first.". Fixed: deleting a linked metric that others link to unlinks them with their inherited values first (today they are left pointing at a deleted id).
- [x] Drag rows within a table — drag handle, only within the same table, toast "Reordered."; Move up / Move down in the row menu.
- [x] Notes row — "Notes" toggle under the name opens a full-width row; memory only.
- [x] Empty-table row — "No metrics yet. Add or link a measurement."

## Linking (§10)
- [x] Link-a-metric modal with grouped candidates — "Link a metric" sheet: radio list grouped "Product specifications", "This product’s metrics", "Division initiatives", "Import from ‹Product› (‹Division›)"; each group root shown once; metrics already hosted here excluded; component / product / initiative names under each.
- [x] Specs with no metric offered as targets — labelled "No metric of its own yet: linking creates one on this specification". Fixed: a specification is no longer offered as a target for itself.
- [x] Default relationship per candidate — picking a candidate switches the relationship to its default (today's table); non-contribute defaults are shown on the row.
- [x] Relationship choice + help text — Direct / Contribute / Specification with a sentence for the chosen one.
- [x] Cycle check — RD.wouldCreateCycle runs before every link with today's message "That link would create a cycle — choose a different target." (as today it cannot trigger: the new member is always fresh).
- [x] Default to specification for another product's KPI
- [x] Anchor metric created for a spec with no metric (switches its tracking) — toast "Linked to specification (‹type›) — its conformance now derives from linked metrics." Fixed: the sheet warns before you link ("…switches ‹spec› to single-metric tracking: its 55% progress is removed…"); today the progress / sub-specs disappear silently.
- [x] Override modal: inherited summary, relationship, priority, override target or lo/hi — "Override metric target" sheet: inherited metric, direction, unit, source and target; relationship; priority ("When several linked readings compete, the higher priority wins."); override target (blank inherits) or low / high for ranges; numbers checked.
- [x] Direct links: no override — the override field is replaced by today's note as soon as Direct is chosen; saving clears the override.
- [x] Unlink copies inherited values onto the metric — name, direction, unit and target copied, link removed, `groupId` null, `isDefiner` true; toast "Unlinked.".
- [~] Link-related toasts — "Linked (‹type›).", the anchor message, "Unlinked."; changed: saving the override says "Link saved." (button "Save link"; today "Metric saved.").
- Stacking: Link and Override push onto a component sheet and return to it on save / cancel (today's return-to-component behaviour).

## Model spec details (§14) → sheet
- [x] Read-only model and product family — with "Models and product families are authored in the Planning app."
- [x] Target application — placeholder kept.
- [x] Maturity (with suggestions) — free text plus suggestion chips Concept, Prototype, Pilot, Pre-production, Production.
- [x] Notes
- [x] Save spec details / Cancel — toast "Spec details saved."; values trimmed; Enter saves, Escape cancels.

## Modals (§15) → sheets
- [x] 3 layers — a stack of right-hand sheets (spec → sub-spec; component → metric editor / link / override) with Back.
- [x] × closes (except the add sub-product picker) — × closes the top sheet (the picker is S-comp's).
- [~] Backdrop click disabled — changed (lead decision, corrected by audit A4: the earlier claim that the sheet backdrop is inert was wrong): clicking the dimmed page closes the sheets, asking "Discard your changes?" first when a sheet has unsaved edits, so nothing typed is lost by a stray click (the reason today disables it). The confirm dialog's backdrop is inert.
- [~] No Escape key — changed: Escape closes the top sheet, asking first when it has unsaved edits; Enter in a single-line field saves. Fixed by audit A4: Escape is handled on the sheet itself (`ui.sheetKey`, as on the Execution and Planning boards), so it also works where there is no text field (Link a metric, Add sub-product, Export, Settings); before, only text fields handled it. An Escape in a reading field first clears the typed value.

## Persistence and sync (§18) — simulated against the sample data
- [~] Debounced autosave (700 ms / 2.5 s) — changed: the kit's save cycle ("Saving…" then "Saved just now" after 0.7 s) on every change; the 2.5 s cap is stated in Settings but not modelled separately. Today's per-save "Saved." message is replaced by the save indicator.
- [x] One write at a time, change-checked — the simulated save cycle; no write for view-only changes.
- [x] `If-Match` saves of the spec document — modelled by the 412 simulation.
- [x] 412 reload with "re-apply" message — Settings › "Simulate a save conflict": reloads the document as it was before your last change plus a teammate's change; banner "Another editor saved first — reloaded; re-apply your change." and save state "Reloaded after a conflict".
- [x] Portfolio writes merge automatically on conflict — `ctx.portfolioWrite` (used by S-comp's sub-products): okMsg, "… (merged with a concurrent change)" when Settings simulates a 412, "(local only …)" without a token.
- [~] Poll every 25 s (portfolio, spec document, other divisions' documents) — changed: on demand ("Check for changes now", with the last-checked time); a teammate's reading arrives with "Updated from another editor. ‹what changed›". No background timer in the prototype. Fixed: the tree, product families and everything else refresh after a portfolio change (today the dropdowns don't). Fixed by audit A4: while the connection is lost nothing arrives and no 412 can be simulated (today's poll fails quietly offline and no save reaches the broker); before, a teammate's change still arrived offline.
- [~] Save on division switch, tab hidden and unload — division switch flushes the save; tab-hidden / unload: not applicable (the board keeps everything in memory; DC boards may not add window listeners).
- [ ] Browser copy written on unload — not done: no browser storage of documents in the prototype (`psd_doc_v1`); data resets on reload by design.
- [x] Offline local mode — no token: local mode as today (no portfolio, banner); plus "Lose the connection": saves wait ("Offline, changes kept here", banner "Save failed (network unreachable)…") and flush when it returns.
- [x] Other divisions' spec documents fetched for sub-products and owners — `ctx.refDocOfModel` (null while loading, `failed` when unreachable); Settings simulates "unreachable" and "load slowly".
- [x] Load-time link conversion and id repair — `specNormalizeDoc` at load and on import (legacy links → explicit, initiative→product / stageGate→component host types, colliding component / spec ids renumbered with their metrics re-homed).

## URL parameters (§19)
- [x] `?division`, `?product`, `?token` (removed from the URL), `?readonly` — read from the board's address at load (fixed by audit A4: the resolved division is stored in `rd_division` at load, as today's loadAll does at L480, not only on a switch); Settings › "Link with parameters" builds the link (Copy link) and "Open with these parameters" simulates a fresh load: biz division redirected, product only inside its division, token stored and dropped from the link, read-only on. No `?model` (as today).

## Read-only mode (§19)
- [x] Hides add / edit / delete / Save, and the names that carry edit links — add, edit, delete, menus, drag handles, reading inputs, Edit spec details, Save and Import JSON are hidden. Fixed: spec statements and metric names stay visible as plain text (today they disappear).
- [~] Leaves post / unlink / remove / set / links-to-spec / drag / import usable in memory only — changed: hidden too; today they change the page without saving and still toast success, which is misleading. Export stays available.
- [x] No sign-in, roles or permissions — access depends only on the token (said in Settings).

## Absent (§20)
- [~] Sign-in, roles, undo, print, shortcuts, duplicate, move, product / model / product-KPI editing — not added, except product-KPI editing (audit A4, see the next line). Changed: Export uses a Copy button, and sheets accept Enter / Escape.
- [~] Code paths no button reaches (product-KPI add / edit / delete / post, the generic Add metric editor) — changed by audit A4 (the contract's rule for dead code: build the intended behaviour): today's app carries complete code for product-level KPIs (saveSub L699–716, delSub L722–727, postRead L754–758, all written to the shared portfolio with persistPortfolio's merge on a 412) but no button reaches it, and no other app in the suite can create product KPIs. Calm gives it a "Product KPIs" panel (between Sub-products and Component owners; table and editor are the shared ones, `SSUB.prodVM` + `SSPEC.metricTable` / `SSPEC.openMetric` with a product host): add, edit, post readings (Met / Not met for binary), delete with its readings ("This metric defines a linked group — unlink its members first." while anything links to it), unlink a linked one; no reordering (as today's kpiTable for products). Toasts "Product KPI saved." / "Reading posted." / "Product KPI deleted.", with "(merged with a concurrent change)" after a simulated 412. Decision for Corey: keep this panel, or return product KPIs to read-only.

## §21 decisions (mine)
- 2 range target erased by the spec editor — fixed. 3 silent loss of progress / sub-specs when linking — warned. 4 dangling references after deleting a spec — fixed. 5 unsaved typing lost on re-render — fixed (all sheets keep drafts). 6 polling doesn't refresh the pickers — fixed. 7 wrong "latest reads" hint — fixed. 8 import without confirmation or repairs — fixed. (1 is S-comp's sub-product picker.)

## Data (b)
- [x] Spec document `SPEC-‹div›`: `keyResults[]`, `stageGates[]`, `kpis[]`, `kpiUpdates[]`, `modelSpec{}` — in `C.D.spec`; blank document on first use; export / import.
- [x] Product specification (`keyResults`): id (RD.allocId keyResult, e.g. KR-EL-1-1-5), objectiveId, statement, notes, trackingType, progress, subKrs.
- [x] Sub-specification (`subKrs[i]`): name, weight, trackingType, progress, `kpis[0]` {type, targetType, name, current, direction, target, unit, statistic, readCount, readings}.
- [x] Metric / KPI (`kpis`): id (RD.allocId kpi), objectiveId, hostType (keyResult | component), hostId, name, targetType, direction, target (number | {lo,hi} | null), unit, statistic, readCount, notes, gates, linkParent, linkType, linkPriority, order; groupId / isDefiner set on unlink. Imported sub-product rows and composition are written by S-comp. localName / readsFrom are read by the engine, not editable (as today).
- [x] Reading (`kpiUpdates`): `UPD-‹kpi›-‹ms›`, kpiId, value, timestamp, note "" (a reading posted in the same millisecond as an earlier one is stamped 1 ms later so "newest" stays unambiguous).
- [x] Model spec details (`modelSpec[modelId]`): application, maturity, notes.
- [x] Portfolio read-only: divisions, products, models, product and initiative KPIs, objectives (for the division's initiatives).
- [~] Browser storage: `rd_theme` and `rd_division` used as today; `rd_broker_token` kept in memory for the session; `psd_doc_v1` not used (see above).
- [x] Memory-only UI state: selection, panel collapse, open notes, sheet drafts.

## Sample data added (seeds; every board runs every seed)
- `mods/sspec/seed.js`: HP6-12 (Fuel Cell) gets five specifications so every tracking and target type exists: a statistical median KPI with 4 of 6 readings plus a second metric, a range target with notes, weighted sub-specs (statistical, %, demonstration, unmeasured binary), % completion with notes, and a binary pass.
- `mods/scomp/seed.js` and `mods/ssub/seed.js` (audit A4): two real links, written as today's "+ link" writes them. The MEA's own H₂ in O₂ is linked (contribute) to the stack's Gas purity metric, so H₂ in O₂ defines 1 link and its delete is blocked. The skid's S1 is linked (specification) to the Tera stack's product KPI, which gives the skid one cross-product dependency. See `mods/scomp/COVERAGE.md`.

## Tests
Audit A4 (independent): `node test/audit_a4.js out/a4/Spec-A.dc.html` — 400 checks, see `calm/audit/a4.md`.
`node test/sc_spec.js out/score/Spec-A.dc.html` — 416 checks (audit A4 scoped the collapse check to the specifications panel, added the sheet-level Escape, and moved the link checks onto the seeded links in `mods/scomp/seed.js` and `mods/ssub/seed.js`): every item above that is interactive, data written, numbers against `engine/rdcore.js`, read-only, and a final check that every handler site in `apps/spec` + `mods/sspec` (including the partial inside S-comp's cards and sheet) is fired.
`node test/fuzz.js out/score/Spec-A.dc.html 4000` (seeds 1, 2, 3, 7): no problems. The random walk never reaches a few deep paths in my files — the range-override fields (needs a link to a range metric first), the ask-dialog input (no module on this board calls C.ask), and binary Met / Not met inside S-comp's component tables (no binary component metric in the sample); sc_spec.js fires and asserts each of them.
