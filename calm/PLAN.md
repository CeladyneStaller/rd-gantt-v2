# Calm full-parity build: plan and status

Request (Corey): "Let's update the calm mockup to ensure absolutely all functionality is preserved from today."
Scope chosen: all four apps. External systems simulated against sample data.
Output: replace the four A boards in ../modern-canvas/project (Plan-A, Main, Sales-A, Spec-A) and update
canvas.json note nA; publish once (read canvas.json + changed files first; one publish with
root=modern-canvas, file_path canvas.json, files map). Don't render to verify; use the harness.

## Foundation (done by the lead)
- kit/kit.css (tokens light+dark, components), kit/core.js (Component, F, K, sheets, menus, dialogs,
  toasts, simulated save, lazy module VMs via Proxy), build.py (manifests, slots, includes, @if flags,
  per-module syntax stubbing, --out, --publish, source markers), test/{parse.py, dc.js, fuzz.js}.
- data/sample.js (shared dataset in real doc shapes; today 2026-10-13 = day 2477).
- Skeleton shells: apps/exec (Execution + Sales), apps/plan, apps/spec. Stub modules everywhere.

## Agents (parallel)
| # | Agent | Owns | Inventory |
|---|---|---|---|
| 1 | X-shell | apps/exec/* | exec §0–5, sales §1–6, §13 (end objective), §19–22 |
| 2 | X-kr | mods/kr | exec §6, sales §7–8 |
| 3 | X-kpi | mods/kpi | exec §7–9, §19 (Connect data), sales §9–10 |
| 4 | X-gates | mods/gates | exec §10–13, sales §11–13 |
| 5 | X-kb | mods/kb | exec §15, sales §14 |
| 6 | X-fmea | mods/fmea | exec §16, sales §15 |
| 7 | X-exp | mods/step, mods/etb | exec §18–22, sales §16–17 |
| 8 | X-tasks | mods/tasks, mods/initm | exec §17, §23, sales §18 |
| 9 | P-core | apps/plan/*, mods/pov, pst, ped | plan §1–12, §16 |
| 10 | P-gantt | mods/pgt, mods/pms | plan §13–15 |
| 11 | S-core | apps/spec/*, mods/sspec | spec §1–7, §10–11, §14–19 |
| 12 | S-comp | mods/scomp, mods/ssub | spec §8–9, §12–13 |

Cross-module interfaces: KPI.table / KPI.openTarget / KPI.openConnect (kpi); GATES.openRevise (gates);
PED.open / PED.lineage / PED.del (ped); SSPEC.metricTable / SSPEC.openLink (sspec);
slot gates-kanban (kb inside gates); MODS.x.search (shell aggregates).

## After agents
Integrate (build all, fuzz all, run every sc_*.js), parity audit against each inventory checklist
with an independent agent, fix gaps, copy to modern-canvas/project, update canvas.json note, publish,
summarize to Corey (bugs fixed vs today, anything changed).

## Status after the build wave (lead)
- All 12 agents finished. Integrated builds: Main 1.37 MB, Sales-A 1.30 MB, Plan-A 0.69 MB, Spec-A 0.57 MB.
- test/run_all.sh: 20 scenario suites pass on the integrated builds; fuzz clean on all four boards.
- Lead fixes: autoFocus="" spelling everywhere; @if blocks keep line numbers; every board runs every seed
  (build.py all_seed_files, fixed order); sample step dues are ISO strings; light theme default on all
  boards (Match system available); core sheetDirty/dismissSheet/dismissAll (Escape and the dimmed page ask
  before discarding edits) wired into Execution/Sales and Product spec (Planning had its own, same rules);
  KPI readings drawer reads samples from every doc (portfolio targets), read-only empty text.
- Next: independent parity audit (A1 shell+kr+kpi+tasks+initm, A2 gates+kb+fmea+step+etb, A3 Planning,
  A4 Product spec) writing calm/audit/<area>.md, then publish.

## Planning edit rights (done, canvas v29)
- Only roster orgRole cto/ceo may change the plan in Planning (kit: PLAN_EDITOR_ROLES, C.canEditPlan,
  APP_LOCKED/APP_LOCK_MESSAGE hooks; Planning ctx.ro includes the lock; "View only" pill + banner).
- Corey's decisions: lock the Planning app only (Execution Revise plan and Product spec stay open);
  no lead exceptions yet (target readings and milestone reports locked too).
- Every board's Settings has "Signed in as" (roster + Signed out), persisted in localStorage
  'calm_viewer' across boards; D.me, posted-by and per-person kanban prefs (D.prefsByEmail) follow it.
- Sample roster: orgRole + leadDivisions; placeholder CEO Dana Whitcomb (dana@celadyne.com).
- test/sc_roles.js (58 checks) in run_all.sh; 31 suites, 10,070 checks green; fuzz clean on all boards.

## Deployable copies (October 13)
Corey: "Present the new files for me to deploy." The live apps had nothing new since the October 9 files, so
the new work is Calm, which only ran inside the canvas. Packaged as standalone pages for the GitHub Pages site.
- `python3 standalone.py` builds with `--flag=deploy` (out/deploy) and writes deploy/calm-{planning,execution,
  sales,product-spec}.html: React 18.3.1 (the canvas runtime's exact builds, integrity-checked), standalone/
  runtime.js (the canvas's template rules: holes, sc-for/sc-if, camelCase attributes, raw tables/selects,
  sc-interp spans, synchronous DCLogic.setState), the template and the board code. Board links renamed.
- Storage: the board's `window` is a proxy whose localStorage/sessionStorage prefix every key with
  `calm-prototype:`; only `hub_session_v1` is read through, never written. Live keys stay untouched.
- Identity: kit/core.js reads hub_session_v1 via RD.hubSessionEmail (real clock); the Hub person joins the
  sample roster with the Hub's orgRole; the picker is fixed (disabled) and setViewer is a no-op. No session,
  an expired one or a damaged one: the canvas behaviour (picker, calm_viewer).
- Deploy flag: sidebar brand says "Prototype with sample data".
- Fixes found by the browser walk: Planning "Copy link" and the logic-tree "Copy JSON" claimed success and
  left an unhandled rejection when the browser refused the clipboard; now C.copyText says so only when it
  worked (Execution/Sales copy link uses it too). KR-M1 tags no longer wrap in the key-result signal.
- Tests: sc_roles +33 (Hub sessions); sc_plan/sc_shell/sc_exp refusal cases; test/browser.js (Chromium:
  loads, Hub roles, storage isolation, links and hand-off, Gantt mouse drag, kanban drag) and
  test/browser_walk.js (random real clicks/typing on every page, no Hub / Hub lead / Hub CTO).
