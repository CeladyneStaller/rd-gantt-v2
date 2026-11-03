# Calm live builds: contract for the shells

Corey's decision (October 14): one patch replaces today's four apps with Calm, on live data, keeping the
file names (planning_app.html, execution_app.html, sales_app.html, product_designer.html). Read CONTRACT.md
first; this file adds what changes when Calm talks to the real broker.

## Build flavours
- `python3 build.py` — sample boards for the canvas and every harness test (LIVE = false). Must keep working
  exactly as today: every existing suite in test/run_all.sh stays green.
- `python3 build.py --flag=live --out=out/live` — live boards (LIVE = true): no sample data (calmSample throws,
  SEEDS = []), kit/net.js loads and saves through the broker. `python3 standalone.py --live` packages them
  into live/planning_app.html etc.
- Templates: `<!--@if live-->…<!--@else-->…<!--@endif-->`. JS: `if (LIVE) …`.

## What the kit now does (kit/core.js, kit/net.js, kit/repair.js, kit/merge.js)
- Live data starts empty (C.D.portfolio = blank, C.D.docs = {}, C.D.spec = {}, C.D.roster.users = []), then
  NET.boot (componentDidMount) loads: the roster (GET /roster), the portfolio, then the documents the shell's
  APP_LIVE_PLAN lists. Each document is repaired on load (REPAIR.*) the way today's apps adopt it.
- `C.mutate` works as before; in LIVE, markDirty hands over to NET, which saves every writable document whose
  JSON changed (whole-document PUT with If-Match, 700 ms debounce, 2.5 s cap, queued), shows the real save
  state in C.state.save ('saving' | 'saved' | 'offline' | 'error' with .why), polls every 25 s
  ("Updated from another editor."), and resolves 412s: the portfolio merges (MERGE.three) and re-saves; every
  other document reloads and drops the unsaved change ("Another editor saved first — reloaded; re-apply your
  change."). C.state.sim.offline is now the REAL connection state (modules already read it).
- `C.guard()` refuses edits until something is loaded. `C.saveNow()` flushes. `C.resetData()` reloads.
- Identity: only the Hub sign-in (hub_session_v1). No session: signed out (C.viewer() null). The roster from
  the broker gives names (`name`, else the email's local part) and roles; roles come from the roster when it
  has one (else the Hub session's). `C.viewerVM()` is already fixed (disabled select) in live builds.
  `inEmbed()` (kit) is true inside an iframe (a Confluence embed hides the Hub sign-in).
- Prefs (kanban Done column) and Connect data's analysis index are wired in mods/kb and mods/kpi.
- Pulled KPIs (mods/pull) are computed, never stored: the engine reads every document the page loaded through
  `RD.setPullSource(() => C.pullSource())` (registered on every render and change), one source object per
  `D.version`, which C.mutate, every document NET installs and a gate passing on its own bump.

## Hooks a shell defines (all in apps/<app>/shell.js; only called when LIVE)
```
APP_LIVE_PLAN(C) -> {
  roster: true,                 // load GET /roster before the documents
  prefs: true|false,            // Execution and Sales: per-person Done-column choices (/prefs)
  autoPass: true|false,         // Execution and Sales: pass gates at target on load (today's first render), once
                                //   every document of the load is in: a pulled target (mods/pull) reads the others
  createPortfolio: true|false,  // Planning: no portfolio on the broker yet -> load a blank one; its first save
                                //   creates it (If-Match "0"). Status phase 'noportfolio' still reports it.
  docs(P) -> [ids],             // documents to load after the portfolio, from P.divisions (Execution and Sales:
                                //   every division's EXEC-… or BIZ-… since October 19, so pulled KPIs reach any objective)
  writable(id) -> bool,         // documents this app may save ('portfolio', 'EXEC-…', 'BIZ-…', 'SPEC-…')
  quiet(id) -> bool             // optional: a change the poll brings in shows no "Updated from another editor."
                                //   (Execution and Sales: the other app's documents)
}
APP_LIVE_READY(C, url)          // after every successful load. `url` = the page's parameters with lower-case
                                // keys on the FIRST successful load only (null after that). Apply them exactly like
                                // the shell's existing "open a link here" simulation applies a fresh load
                                // (division, objective, quarter, product, owner, tab, present…); remember
                                // the division in rd_division as today. Without parameters, keep the
                                // shell's normal defaults (remembered division, hand-off from another app).
                                // Execution / Sales also read view (with objective: a view page, its objective
                                // or a message, the remembered division untouched), item (highlight) and tab;
                                // APP_INIT reads ?view= itself so a view page is one from its first frame.
                                // Sales remembers no division (October 16): without a business ?division= or a
                                // hand-off naming only a division, it opens on All divisions.
APP_LIVE_STATUS(C, s)           // s.phase: 'loading' | 'ok' | 'notoken' | 'badtoken' | 'noportfolio' | 'fail' |
                                // 'offline' | 'outdated'; s.status = HTTP code when there is one. Show it the
                                // way the shell already shows load states (sh_load / sh_banner), with today's
                                // wording where it is plain.
APP_LIVE_NOTICE(C, tone, text)  // optional; tone 'ok' | 'info' | 'bad'. Default: a toast.
```
Which documents (mirror today's apps; never write a document today's app doesn't write):
- Planning: loads every division's EXEC-<div> (R&D) or BIZ-<div> (business) and SPEC-<div> (R&D); writes only
  `portfolio`. No autoPass, no prefs.
- Execution: loads EXEC-<div> for every R&D division, then BIZ-<div> for every business division (read-only, quiet:
  pulled KPIs reach any objective, October 19), and SPEC-<div> for every R&D division; writes EXEC-* and
  `portfolio` (Revise plan's new planned finish). autoPass (its own documents only) and prefs on.
- Sales: loads BIZ-<div> for every business division, then EXEC-<div> for every R&D division (read-only, quiet),
  and SPEC-<div> for every R&D division; writes BIZ-* and `portfolio`. autoPass (its own documents only) and
  prefs on.
- Product spec: loads SPEC-<div> for every R&D division; writes SPEC-* and `portfolio` (product KPIs, their
  readings, composition edges). No autoPass, no prefs.
- My Projects: loads EXEC-<div> for every R&D division and BIZ-<div> for every business division (both written:
  a reading, a % key result or a milestone step posted here saves to the objective's own document), and SPEC-<div>
  for every R&D division (read-only, quiet). Never writes `portfolio`. autoPass on for both kinds (a reading posted
  here can pass a gate in either), prefs off. APP_LIVE_READY reads `view=owned|team` and `quarter=all|<quarter>`.
NET warns in the console when a module changes a document the app may not write; the change is not saved.

## Settings in live builds
- Hide every simulation (offline / teammate / conflict / slow or failed loads / "Restore the sample data" /
  sample build text). Keep real things: theme, read-only preview, present mode, link builders, export/import.
- Broker section: the token field saves with `NET.saveToken(C, token)` (stored in rd_broker_token, then a
  reload); "Load from the broker" calls `NET.reload(C)`; show `NET.info(C)` (loaded?, last loaded time,
  offline, unsaved changes count). Never display the token itself.
- Hub sign-in section: the fixed picker plus its hint (already from C.viewerVM()).

## Rules
- Do not change module files unless the live flavour needs it, and keep sample behaviour identical.
- Never write a document the live app does not write; never write on load except NET's own auto-pass.
- Sales "Recover stranded data" (live): write this division's document FIRST and the source only after that
  succeeded (today's bug: the source was emptied even when the target write failed). Use NET.flush, NET.get,
  NET.putAs, NET.adopt (kit/net.js) so the order is explicit; report per objective.
- Run every existing suite (bash test/run_all.sh after python3 build.py) and the fuzz test; add tests for
  your live behaviour where the sample harness can reach it (LIVE is false there, so pure helpers only).
