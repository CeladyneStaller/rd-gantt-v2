# Coverage: Product spec components and sub-products (S-comp)

Modules: `mods/scomp` (components, component sheet) and `mods/ssub` (sub-products, component
owners, cross-product dependencies). Inventory `inv/spec.md` §8, §9, §12, §13 and the parts of
§15–17 and §20–21 that concern them. Scenario: `test/sc_specparts.js` (239 checks, data and engine
numbers included). Shared with S-core (`mods/sspec`): every metric table (`SSPEC.metricTable` +
`part-metrics.html`), the §9 editor (`SSPEC.openMetric`), Link a metric and Override
(`SSPEC.openLink`, `SSPEC.openOverride`). One editor and one table for the whole board, so
components and specifications look and behave the same. The shell provides
`ctx.refDocOfModel` (other divisions' SPEC documents, with Settings simulations for a slow load
and an unreachable bin) and `ctx.portfolioWrite` (today's `persistPortfolio`, including the
412 merge).

## Components (§8)
- [x] Collapsible panel with count — panel header button with chevron and `aria-expanded`; count; memory only (`scomp_closed`). The header also says "3 of 4 conformant" and that components don't count toward the model's conformance.
- [x] "+ add component" — "Add component" in the panel header opens the component sheet.
- [x] Empty-state hint — "None yet. Components are the parts that must meet specifications to deliver the product specifications."
- [x] Card: C‹n› and name, click to edit — tag C1…Cn in display order; the name is a button that opens "Edit component". A blank name shows "Unnamed component (‹id›)" (today shows the bare id).
- [x] Type and status pills — type as a tag, status as quiet text, each only when set.
- [x] Component score — `RD.hostScore('component', id, ctx.em)`; dot, band word from today's legend (Meets / Marginal / Off target / No data) and the number; tooltip "Conformance to component specifications…".
- [x] "+ spec", "+ link" — "Specification" and "Link" buttons on the card (and in its "…" menu) open the shared `SSPEC.openMetric` / `SSPEC.openLink` sheets for the component.
- [~] "del" → "confirm" — changed: "Delete component" in the card's "…" menu asks with `C.confirm` (audit A4: no longer says "and 0 readings"), saying what goes (specifications, readings, gates, and how many linked metrics elsewhere are unlinked). Same cascade as today (L729–743): metrics on the component and their readings are deleted; a metric elsewhere linked to one of them first gets the inherited name, direction, unit and target copied on and is unlinked. Toast "Component deleted."
- [x] Drag to reorder components — drag handle (HTML5 drag and drop), today's rule (L1583: moved before the card it is dropped on, only this model's plain components move, sub-product hosts keep their slots), toast "Reordered." Added: "Move up" / "Move down" in the "…" menu as the keyboard alternative.
- [x] Component metric table — the shared table (`SSPEC.metricTable`, host `component`): post a reading (Met / Not met for binary), edit, override, unlink, delete (blocked while it defines a linked group), reorder rows, notes row, badges (linked, imported, defines N, gates).
- [x] Notes — "Notes" / "Hide notes" toggle on the card; open state memory only. Seed: one sample note on "End plates and compression" (`mods/scomp/seed.js`).

## Component modal (§8)
- [x] Name, Type, Status, Notes — right-hand sheet; placeholders as today; blank fields saved as null and the name is not required (today's rules); values trimmed.
- [x] Component specifications section (+ spec, + link, full table) when editing — same hint text, "Add specification", "Link a metric" and the full shared table (key `sheet`).
- [~] "Add the component first…" hint when adding — changed: the hint shows while adding, and after "Add component" the sheet stays open on the new component (title becomes "Edit component") so its specifications can be added straight away; today you reopen it.
- [x] Add / Update; Cancel — "Add component" (toast "Component added. You can add its specifications now."), "Save component" (toast "Component saved."), "Save sub-product" for a sub-product (toast "Sub-product saved.", today says "Component saved."); "Cancel", or "Close" when nothing changed; Enter saves, Escape closes. Fixed by audit A4: after "Add component" the saved fields are the sheet's new baseline; before, Escape or the dimmed page asked "Discard your changes?" about edits that were already saved.
- [x] Returns to this modal after link or override edits — sheets stack: Add specification, Link a metric, Edit and Override push on top and closing returns to the component sheet. Fixed: the component sheet keeps its draft while another sheet is on top (today it is rebuilt from saved data and typing is lost, §21.5).
- [x] Sub-product edit — "Edit sub-product": Name and Notes only, plus "This is a reference to another product. Its specifications live on that product; notes here describe how it is used in this one."

## Component specification / KPI modal (§9)
All in the shared editor `SSPEC.openMetric` (mods/sspec), which components open; one editor for KPIs on specifications and component specifications. Verified from the component side in the scenario.
- [x] Name (required) — "Give the specification a name." when blank.
- [x] Target type: Demonstration / Statistical / ✓ Binary — segmented control, "Binary" without the glyph.
- [x] Read count, Statistic — statistical only; read count must be a whole number.
- [x] Direction (≥ / ≤ / ↔ Range) — "At least", "At most", "Range"; hidden for binary.
- [x] Target, Range low / high, Unit — range stored only when both ends are filled (today's rule); a non-number target or a low above the high is refused with a message instead of being saved as empty.
- [x] "Gates a product specification" (components only) — select with "None (standalone)" and this model's specifications, today's hint reworded; toast "Gating spec saved — gates “‹spec›”."
- [x] Notes (components only)
- [x] Save / Update; Cancel / × — "Save specification" / "Update specification"; binary clears direction, target, unit, statistic and read count. Fixed: the hint about statistical targets now says every reading is used and read count is a completeness discount (§21.7).

## Sub-products (§12)
- [x] Collapsible panel with count — memory only (`ssub_closed`).
- [x] "+ add sub-product" modal (product grouped by division, model, imports preview) — "Add sub-product" sheet: products as radio choices under division headings, the current division tagged "This division"; models as radio choices with their ids; preview: "Loading specifications…", "Couldn’t reach that product’s SPEC bin. Is it configured on the broker?", "N specifications will import: a, b … (first six, then 'and N more')", or "This model has no specifications yet. It will be added as an empty sub-product."; "Add sub-product" disabled until a model is chosen; with no candidate: "No other product has a model that can be added here…" and "Close". Fixed: × closes it (today only Cancel or Close does, §21.1).
- [x] Eligibility filter (no self, duplicate or cycle) — `RD.compositionChildren` / `RD.wouldComposeCycle` as today (L767–778). Today's cycle and duplicate messages remain as guards; the sheet recomputes its choices on every render, so they cannot be reached from it. "Still loading that product’s specifications. Try again in a moment." shows while the shell simulates a slow load.
- [x] Add: host + imported specs + portfolio composition edge — host "‹Product› · ‹Model›" (`RD.allocId('stageGate')`), one row per child specification (linkType specification, unit from the child's root spec metric or "%", no target), edge `CMP-‹host›` written with `ctx.portfolioWrite` (412 simulation appends "(merged with a concurrent change)"). Toast "Sub-product added, N specifications imported." From an unreachable bin it adds an empty sub-product, as today, and says its specifications import once the bin is reachable.
- [x] Card: name (edit name and notes), child id, loading / unreachable state — name opens "Edit sub-product" (also in the "…" menu); child model id; "Loading specifications" with a spinner, or "Unreachable" (tooltip "Couldn’t reach that product’s SPEC bin").
- [~] "remove" → "confirm" (removes the edge too) — changed: "Remove sub-product" in the "…" menu confirms with `C.confirm`, naming how many imported specifications go and that the composition link Planning shows goes too; removes host, rows and edge (L813–827). Toast "Sub-product removed." (today shows no message when no edge was removed).
- [x] Imported table: stack target / value — columns "Imported specification", "Sub-product target", "Sub-product value", "Your target", "Score", "Links to specification"; direction shown with the target (≥, ≤, range); %- or sub-spec-tracked child specs show target 100% and the child spec's conformance (`SSUB.resolveRef`, today L586); a "Loading" tag marks rows whose document is still loading; empty row "This model has no importable specifications." Binary child specs show "Pass" and "Met / Not met".
- [x] "your target" override + "set" — click the value ("Inherits" or your target), type, Enter or "Set target"; "Clear override", or a blank value, inherits again; Escape cancels; toasts "Target override set." / "Override cleared. Using the sub-product’s target."; "Override" tag. Fixed: a child spec with a range target takes a low and a high (today a single number made the row score 0).
- [x] Imported score — `RD.rawScore(stack value, your target or stack target, direction)`, no sample discount.
- [x] "links to spec" dropdown — "Not linked" or any specification of this model; toasts "Imported specification linked to a product specification." / "Link cleared."; feeds the specification card's "From sub-products" (S-core calls `SSUB.resolveRef`).
- [~] Auto-import of child specs added later — changed mechanism, same result: a view model may not write, so child specifications not yet imported show at once as rows; the next sub-product change (target, link, add, remove) first runs today's exact sync (L831: same ids, same order) inside its save. Rows whose child spec was deleted are never removed (shown with "No longer a specification of the sub-product"); a child spec added and deleted again before anything changed here leaves no stale row.
- [x] Notes — "Notes" / "Hide notes" toggle on the card.

## Component owners (§13)
- [x] Collapsible panel, collapsed by default, with count — count = parent models (`RD.compositionParents`); header note "Products this model is a component in".
- [x] Grouped by product (division tag), then model
- [x] Owner spec target summary and live score — "≥ / ≤ target unit", "lo to hi unit", "Pass" for binary, "100%" for %- or sub-spec-tracked, "No target"; score `RD.keyResultScore` in the owner's own document.
- [x] loading / unreachable / no-specs states — "Loading specifications", "Unreachable", "No specifications yet".
- [x] Collapse toggles for product and model groups — memory only (`ssub_ownClosed`).
- [x] Empty-state text — "This model isn’t used as a sub-product in any other model yet. When it is, the owner products and their specifications show here."

## Cross-product dependencies (§13)
- [x] Appears only when such links exist — this product's linked metrics (every model in the division) whose root is another product's KPI (today L1457).
- [x] Grouped by source product — with its division tag; collapsible with a count.
- [x] Rows: where · model, metric + relationship, value / target, score — "Used in" (component or specification, model underneath), metric with its relationship (Direct / Contribute / Specification), current ("No reading"), target, score.

## Modals (§15), where they concern these sheets
- [x] 3 layers — a sheet stack: component sheet, then the shared metric / link / override sheets on top.
- [~] × closes (except the add sub-product picker) — fixed: × closes every sheet, the add sub-product sheet included.
- [~] Backdrop click disabled — changed (shell): clicking the dimmed page closes the open sheets, asking first when one has unsaved edits.
- [~] No Escape key — changed: Escape closes the component sheet from its fields and cancels the inline target editor; Enter saves.

## Delete, reorder and UI state (§16), where they concern these panels
- [~] Two-click delete, one armed item at a time — changed: `C.confirm` dialogs, so there is no armed state.
- [x] Deleting a component cascades as today; deleting a single metric that others link to is blocked (shared table).
- [x] Reordering changes array order only within this model's components (or one table); saved.
- [x] Memory only: panel collapse (owners start collapsed), owner-group collapse, open notes, drafts.

## Scoring (§17), where it concerns these panels
- [x] Component score = mean over the component's metrics with a target, unread counting 0, none read → no score (`RD.hostScore`); components don't feed model conformance.
- [x] Imported rows: `RD.rawScore`, no sample discount; bands from `F.band` (80 / 65).

## Persistence and sync, where it concerns these panels
- [x] Portfolio writes merge automatically on conflict — composition edges go through `ctx.portfolioWrite`.
- [x] Other divisions' spec documents fetched for sub-products and owners — `ctx.refDocOfModel`; Settings simulates a slow load (2.5 s) and an unreachable bin, and both states show.

## Read-only mode, where it concerns these panels
- [~] Hides add / edit / delete / Save, and the names that carry edit links — changed: add, edit, delete, menus and drag handles are hidden; names stay visible as plain text (today they disappear with their edit links).
- [~] Leaves post / unlink / remove / set / links-to-spec / drag usable in memory only — changed: "Remove sub-product", "your target", "Links to specification" and drag are not offered (your target and the link show as text); a write reached anyway is refused with "Read-only view — editing is disabled." Today they change memory only and still toast success.

## Behaviours to decide on (§21), where they concern these panels
- [x] §21.1 × on Add sub-product — fixed, see Modals.
- [x] §21.4 dangling references after a specification is deleted — S-core's delete clears `gates` and `linkSpec`; the link select shows "Not linked" for any left over, and the shared editor drops a dangling gate.
- [x] §21.5 component and sub-product sheets lose typing on re-render — fixed, drafts are kept.
- [x] §21.7 statistical hint — fixed in the shared editor.

## Data (b)
- [x] Component (`stageGates` without `refModel`): `id` (`RD.allocId('stageGate', model, doc.stageGates ids)`), `objectiveId`, `name`, `ctype`, `status`, `notes` (blank → null).
- [x] Sub-product host (`stageGates` with `refModel`): `id`, `objectiveId`, `refModel`, `refProduct`, `name`, `notes`.
- [x] Imported rows (`kpis`): `id` (`RD.allocId('kpi', model, doc.kpis + P.kpis)`), `objectiveId`, `hostType: 'component'`, `hostId`, `refModel`, `refKr`, `linkType: 'specification'`, `linkParent: null`, `name`, `unit`, `target` (your override; number or `{lo, hi}`), `linkSpec`.
- [x] Component metrics: written by the shared editor and table (`name`, `targetType`, `direction`, `target`, `unit`, `statistic`, `readCount`, `notes`, `gates`; readings `UPD-‹kpi›-‹ms›`).
- [x] Composition edge (`portfolio.composition`): `{ id: 'CMP-‹host›', parent, child }`, written on add, removed on remove.
- [x] Memory-only UI state: `scomp_closed`, `scomp_notes`, `scomp_over`, `ssub_closed`, `ssub_ownOpen`, `ssub_ownClosed`, `ssub_depClosed`, `ssub_notes`, `ssub_edit`, sheet drafts.

## Audit A4 additions (mods/ssub)
- Product KPIs panel (`SSUB.prodVM`, `mods/ssub/slot-main.html` between Sub-products and Component owners): today's dead product-KPI code given its panel; see `apps/spec/COVERAGE.md` (Absent) and `calm/audit/a4.md`.
- Sample links. The lead set `linkParent: null` on the skid's two imported rows in `data/sample.js`, the shape today's add and sync write (L802–804, L843–845). Before that, those rows were the sample's only links. Two seeds now add real links, each record exactly what today's "+ link" writes (makeLinkMember, L1389):
  - `mods/scomp/seed.js` links the membrane electrode assembly's own H₂ in O₂ (`KPI-EL-1-1-C1-3`, contribute, reading 0.48 %) to the stack's Gas purity metric. "H₂ in O₂" then shows "Defines 1 link", and its delete is blocked with today's message.
  - `mods/ssub/seed.js` links the skid's S1 "System efficiency at rated load" (`KPI-EL-2-1-1-1`, specification) to the Tera stack's product KPI "Rated stack power". This is the skid's one cross-product dependency.
  - Today's app can't link a skid metric to the stack's own H₂ in O₂: Link a metric offers this model's metrics, product KPIs and division initiative KPIs only (L1341). Such a link would not count as a cross-product dependency either, because the source must be another product's product KPI (L1330).
