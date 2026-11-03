# FMEA risk register: coverage (X-fmea)

Scope: inv/exec.md §16 (L438–482), the FMEA lines of §0, §1, §3, §4, §5 ("Open high-risk") and §24,
the FMEA items of checklist (a) and data (b); inv/sales.md §15 (L310–326), §5, §6 card 6, §21–22.
Source checked line by line: execution_app.template.html L5870–6318, L3564–3573, L2893, L60–69,
L1433–1461; sales_app.template.html L4268–4456, L2223–2232, L1610, L60–69.

Files: `mods/fmea/mod.js`, `mod.css`, `seed.js`, `slot-risks.html` (Risks tab), `slot-sheets.html`
(problem editor `fmea.edit`, evidence experiment `fmea.exp`, both wide), `part-status.html`,
`part-chips.html`, `part-xrows.html`. Tests: `test/sc_fmea.js` (both boards). The Overview's risk rows are
drawn by mods/review since October 15.

## Execution: checklist (a) "FMEA"

- [x] + Add problem — "Add problem" button in the register header opens the `fmea.edit` sheet with a blank problem (`RD.blankProblem` then `modes = []`, exactly as today).
- [x] Problem card: gate tag — "SG-A2" tag computed with today's `gateLabel` (workstream letter by set order then name, position by due date), title "Linked to stage-gate SG-A2"; a line under the title adds the gate name and "due Nov 13" or "passed Sep 30".
- [x] Problem card: edit — the problem statement is a button that opens the editor (today: click the text); also "Edit problem" in the card's "…" menu.
- [~] Problem card: status segment — changed: the Open / Mitigating / Resolved segment is a dot-and-word button that opens a three-item menu (Calm status pattern); same values, same write, Escape closes it.
- [x] Problem card: RPN badge — "RPN 216" plus a band dot and word (High / Medium / Low). Same number as today: worst open RPN, or the plain worst RPN when nothing counts as open, nothing when the problem is resolved.
- [~] Problem card: delete (two clicks) — changed: "Delete problem" in the "…" menu asks `C.confirm` naming what goes with it ("…deleted with its 1 failure mode, 1 effect, 2 causes, 2 knowns and 2 evidence experiments"); toast "Problem deleted." (today "Problem removed").
- [x] Knowns display — "Knowns" list under the title; blank knowns are skipped, as today.
- [x] Mode / effect / cause table with status segments — same tree and row layout as today (mode cell on its first row, effect cell on its first row, one row per cause; continuation cells drawn borderless instead of rowspans). Columns: Failure mode, Effect, Cause and mitigation, S O D, RPN, Status, actions. Every mode, effect and cause has its own status menu; toasts "Problem / Failure mode / Effect / Cause marked <status>."
- [~] Remove cause (cascading) — changed: the trash button asks first and spells out the cascade ("It is the only cause of the effect …, so that effect is removed too. That was the only effect of the failure mode …, so the failure mode goes as well." plus evidence counts). The data rule is today's `delCause` exactly. Toasts "Cause removed." / "Cause removed, with its effect." / "Cause removed, with its effect and failure mode."
- [x] RPN bands — `RD.rpnBand`: below 100 Low, 100–199 Medium, 200+ High, shown as dot and word everywhere (register rows, problem badge, editor live RPN, rescore popover, the Overview's review rows).
- [x] Resolved dimming — rows under a resolved mode or effect are greyed and their RPN shows "—" (title says why); a resolved problem's title is struck through and greyed; a resolved cause's text is muted.
- [x] Passed-gate zeroing — `RD.worstUnresolvedRpn(p, gatePassed)` with today's `execGatePassed` (`RD.classifyGate` passed or passed-late). The card says "Its stage-gate has passed, so this problem no longer counts toward open risk." (sample: the 30 bar leak problem on the Sep 30 gate).
- [x] Sort by worst unresolved RPN — highest first, stable for ties, same as today.
- [x] Problem modal: problem — "Problem" textarea; required: "Give the problem a statement before saving." shown in the sheet footer; trimmed on save.
- [x] Problem modal: knowns — "Add known", one input per known, remove button per row; new known gets focus.
- [~] Problem modal: gate link — changed wording: "Stage-gate (optional)" with "No stage-gate" plus the objective's gates by due date as "SG-A1: name"; a hint explains the passed-gate rule. A link to a gate that no longer exists is shown as "<id> (this gate no longer exists)" instead of being silently dropped on save.
- [x] Problem modal: modes / effects / causes — "Add failure mode", "Add effect", "Add cause", remove per card; placeholders "What could go wrong?", "What happens if this failure mode occurs?", "Why might this failure occur?"; new mode and effect start empty, a new cause starts at S, O, D = 1 (`RD.blankCause`).
- [x] Problem modal: S/O/D with labels — three selects, "1 — None" … "10 — Critical" from `RD.FMEA_SCALES`.
- [x] Problem modal: live RPN — number plus band beside the selects, recomputed as you pick.
- [x] Problem modal: mitigation — "Mitigation or action" field (placeholder "Mitigation / action").
- [x] Save problem / Save changes — writes the whole draft into `exec.risks` (replace by rid, else push), pins `objectiveId` to the selected objective; toast "Problem saved."
- [x] Collapse / expand all — "Collapse all" and "Expand all" in the editor's Failure modes header (Execution only).
- [x] Collapse per card — chevron on every mode, effect and cause card; a collapsed card shows its text and "2 effects, 3 causes, 3 evidence" / "1 cause, 1 evidence" / "RPN 216". State is keyed on stable ids (`fmea_col`), survives closing and reopening the editor, resets on reload, as today.
- [x] Evidence experiments on modes, effects and causes — "Add experiment" on every node; rows show code with verdict dot, toggle or hypothesis ("No details yet"), "N of M values", "Open" and remove.
- [x] Evidence modal: hypothesis, toggle, test — "Hypothesis", "Toggle", "Experiment" fields in the stacked `fmea.exp` sheet, titled "Experiment EXP-n" with the context "Cause 1: …".
- [x] Evidence modal: samples — chips with remove (removes the sample's values too); type and press Enter (or "Add"). Duplicates are ignored as today, now with "“A1” is already a sample."
- [x] Evidence modal: key-read grid — "Add key read" adds a column with name, unit and remove (removing a key read drops its values); a samples × key reads value grid. Values are stored as typed, like today; a non-number is flagged in the cell and not counted (`RD.fmeaExpProgress` rule).
- [x] Evidence modal: notes, verdict, conclusion — "Notes"; "Verdict" (Not concluded / Confirmed / Refuted / Inconclusive) and the conclusion text.
- [x] Evidence modal: progress count — footer "N of M values recorded" (or "No key reads yet" / "No samples yet").
- [x] Save experiment (saves the problem immediately) — commits the whole problem draft at once, creating the problem if it is new and pinning its rid so a later "Save changes" updates instead of duplicating; toast "Experiment saved." The editor then reads "Edit problem" / "Save changes".
- [~] Evidence modal Cancel — changed label: "Back to problem" (header chevron and footer). It keeps the edits in the problem draft, which is what today's Cancel does; the problem editor's Cancel still discards everything unsaved.
- [x] Codes "EXP-n" unique within the problem — `RD.fmeaNextExpCode` over the whole draft; never renumbered.
- [~] Register evidence chips "EXP-n · verdict", coloured by verdict — changed: "EXP-2 Not concluded" instead of "EXP-2 · open" (avoids clashing with the Open status); confirmed green, refuted red, inconclusive amber, not concluded blue. Chips are also buttons that open that experiment over its problem (Calm addition).

## Execution: other sections

- [~] §5 / checklist "Open high-risk card" — changed October 15: the head's "Open high risk" fact (the shell) keeps the card's number, tone and sub-line (`RD.fmeaRollup(...).openHigh`; red when any high, amber when any medium, green when there are problems but none high or medium, muted with none; "4 problems, worst RPN 216" / "No FMEA items"), and the Overview's review table (mods/review) lists every problem by its worst open RPN instead of the separate "Open high risks" card. A problem's name there opens the Risks tab with it highlighted (`fmea_focus`) and its name focused, so it scrolls into view; the highlight clears after a few seconds. `FMEA.rollup(ctx)` returns the same numbers.
- [~] §0 FMEA panel on the long page — changed: it is the "Risks" tab ("FMEA risk register", "4 problems" count, summary of what is open).
- [~] §1 Panel collapse ("RISK") — changed: tabs replace collapsible panels.
- [x] §1 FMEA and FMEA-experiment overlays, × close — right-hand sheets with a close (problem) or back (experiment) button; no Escape-to-close on the editor, as today.
- [~] §1 Backdrop clicks disabled — changed by the kit: clicking the shared sheet scrim closes all sheets (and discards the FMEA draft). Request filed with the kit/shell owner.
- [x] §3 Read-only: FMEA editing buttons hidden, editor blocked — in read-only the register stays fully visible; "Add problem", the "…" menu, remove-cause and rescore are not rendered, statuses are plain dot and word, the problem title and evidence chips are text, so the editor cannot open; any save path goes through `C.mutate` and is refused.
- [x] §4 Clean-up on load: risks reshaped by `RD.migrateProblem` — `seed_fmea` runs it over every document's risks after seeding (the Business Development problem is stored in an older shape on purpose: `id` instead of `rid`, string knowns, no node ids, missing statuses and mitigation). `FMEA.migrate(doc)` is exported for the shell's simulated reloads.
- [x] §4 Session-only FMEA collapse state — `fmea_col` UI state.
- [x] §16 Empty state — "No problems yet. Add a problem to start an FMEA for this objective." (read-only: "No problems recorded for this objective.")
- [x] §16 Status-change messages — see the table row above.
- [x] §16 Rows inside the problem modal (chip, summary, n/m, Open, ×) — evidence rows in the editor.
- [x] §(b) Data — `exec.risks[]` and evidence experiments keep today's exact shape (rid, objectiveId, problem, gateId, status, knowns[{kid,text}], modes[{mid, mode, status, experiments?, effects[{eid, effect, status, experiments?, causes[{cid, cause, severity, occurrence, detection, mitigation, status, experiments?}]}]}]; experiment {xid, code, hypothesis, toggle, test, samples[], key_reads[{krid,name,unit}], values{sample:{krid:value}}, notes, verdict, conclusion}). Ids from `RD.fmeaId`, "fx_" xids and "k_" krids as today.
- [x] Editing after the objective ends — still allowed, as today.
- [~] §24 "Escape and native dialogs" — the FMEA editor never used native dialogs; the new confirms use `C.confirm`. Escape now closes the status menus and the rescore popover; sheets keep today's no-Escape behaviour.

## Sales (§15, §5, §6, §21–22)

- [x] Add problem — same as Execution.
- [x] Sorted cards — same rule.
- [x] Status buttons at every level — same status menus and toasts.
- [x] RPN badge — same.
- [~] Two-click delete — changed: confirm dialog naming what goes, as in Execution.
- [x] Knowns — same.
- [~] Cause table with per-cause remove — changed: confirm first, as in Execution; empty effects and modes are pruned exactly as today.
- [x] Problem modal (problem, knowns, gate, modes, effects, causes, S/O/D, live RPN, mitigation) — same sheet without the Execution-only parts.
- [~] §6 card 6 Open high-risk — changed: the head fact and the review table's risk rows, as in Execution (sample: interconnection delays, worst open RPN 224).
- [x] §22 No "Collapse all" / per-node collapse and no evidence experiments in Sales — built with `<!--@if exec-->`, absent from the Sales board; any experiments already stored on a node are carried through edits untouched.
- [x] §15 "A resolved problem is struck through"; toasts for each status change, removal and save — same as Execution.
- [x] §5 Read-only — same as Execution.
- [x] Load-time `RD.migrateProblem` (Sales adoptExec L1610) — same seed path.
- [x] fixed: Sales "Save problem" with an empty statement refused silently (L4389 only refocused the field); Calm says "Give the problem a statement before saving." like Execution.
- [~] §21 "Gate deletion leaves FMEA gate links" — the register shows "Linked stage-gate no longer exists" with today's fallback tag (the stored id), and the editor lets you clear the link. Cleaning the link when a gate is deleted belongs to the gates module (request filed).

## Calm additions (not in today's app)

- [x] Inline rescore: click "S 9 O 6 D 4" on a cause row to change severity, occurrence and detection in a popover with the live RPN (writes `severity/occurrence/detection` as numbers; read-only hides it).
- [x] Per-problem evidence line from `RD.fmeaEvidenceRollup` ("3 evidence experiments: 1 confirmed, 2 not concluded"), Execution only.
- [x] "Why it doesn't count" notes: gate passed, or everything under it resolved.
- [x] Header search: `MODS.fmea.search(C, ctx, q)` finds problems ("Risk in <objective>") and failure modes ("Failure mode of “…”") across the division; choosing one opens its objective on the Risks tab with the problem highlighted, clearing filters that would hide it.

## Not done

- None in scope.
