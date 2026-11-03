# calm/ — the source of the five apps

The pages at the repo root are built from this folder. Edit here, never the built pages.

| Page (repo root) | Built from | Board |
|---|---|---|
| `planning_app.html` | `apps/plan` | `Plan-A` |
| `execution_app.html` | `apps/exec` | `Main` |
| `sales_app.html` | `apps/exec` with the `sales` flag | `Sales-A` |
| `product_designer.html` | `apps/spec` | `Spec-A` |
| `my_projects.html` | `apps/mine` | `Mine-A` |

## Build

From the repo root:

```
python build.py            # writes the five pages beside build.py
python build.py --check    # runs core.test.js and every Calm suite first
```

`build.py` runs `calm/standalone.py --live`, which builds each board with the `live` flag (no sample data;
`kit/net.js` loads and saves through the broker) and packages it as one self-contained page: React 18.3.1
from `standalone/vendor` (checked against pinned integrity hashes), `standalone/runtime.js`, the board's
template and its code. The engine is the repo's `rdcore.js`, inlined between `RDCORE_START` / `RDCORE_END`
markers so `build_rdcore.py` can check every copy.

## Layout

- `kit/` — shared by every app: `core.js` (component, formatting, dialogs, save state, Hub sign-in),
  `net.js` (the broker: load, autosave, conflicts, polling), `merge.js` (field-by-field merge for the
  portfolio), `repair.js` (load-time clean-up of stored documents), `kit.css`.
- `mods/<name>/` — feature modules (key results, KPIs, pulled KPIs, stage gates, kanban, FMEA, experiments,
  initiative metrics, the Overview's review table, Gantt, specifications …): `mod.js`, its templates and
  CSS, and `seed.js` for the sample data.
- `apps/<app>/` — the shells: `app.json` (which modules, which flags), `shell.html`, `shell.css`, `shell.js`.
- `data/sample.js` — the sample dataset the suites run against (and the prototype pages show).
- `standalone/` — `runtime.js`, which boots a board as an ordinary page, and the vendored React builds.
- `test/` — the suites (Node, no browser) and `test/live/` (browser tests against a local broker).
- `CONTRACT.md` — module conventions. `LIVE.md` — how live builds talk to the broker.

## Test

```
cd calm
python build.py              # sample boards into out/ (with the sample data)
node test/run_all.js         # every suite: "<N> calm assertions green"
```

The repo's `sweep.py` runs both through `calm_suites.test.js` (in its slow half). The browser tests against
a real broker on this machine are described in `test/live/README.md`.

## Live behaviour in brief

- The broker token comes from the Hub's links (`?token=`, then removed from the address bar) or Settings, and
  is kept in this browser as `rd_broker_token`. Every call sends it.
- Saves are whole-document PUTs with `If-Match`, 0.7 s after the last change (2.5 s at most while typing),
  and carry `"client": "calm-1"`. The broker refuses saves from pages that don't (an old tab after an
  update) with 426, and the page asks to be reloaded.
- Someone else saved first (412): the portfolio merges field by field and saves again; any other document
  reloads and the unsaved change has to be re-applied, as before.
- Every page polls for other editors' changes every 25 s, keeps unsaved changes through a dropped connection
  and retries, and asks before closing with unsaved changes.
- Who you are comes only from the Hub sign-in. Planning edits are limited to the CTO and CEO; `?readonly`
  and present mode never write.
- Execution and Sales open one objective's view on a page of its own with `?objective=…&view=overview|krs|gates|kanban`
  (no sidebar, top bar or tabs; add `&readonly` for view only). "Link to this view" beside the tabs makes the
  link; `?item=` highlights an item and `?tab=` opens the whole app on a tab.
- Sales opens on All divisions: the left panel lists every business division's objectives, grouped by
  division. Picking a division, or a link with `?division=`, lists that one alone. Sales doesn't remember a
  division between visits (`rd_division` is Execution's and Product spec's).
- On the Overview's review table, a key result's KPIs and a stage-gate's targets take readings the way the
  KPI tables on the Key results and Stage-gates tabs do: click the value to post one; a statistical KPI opens
  its readings.
- Pulled KPIs (`mods/pull`): leads (in the divisions the Hub roster says they lead: `leadDivisions`,
  `leadUnits`, or a `leadOf` naming the division), the CTO and the CEO can add a key result KPI or a gate
  target whose readings are pulled from other work (every matching objective's score or days behind schedule,
  a key result's score, a gate's days late, a tile finished…) with a statistic over them, from any division of
  either app: every division (the CTO's and CEO's default), every R&D or business division, a business unit, or
  one division. The engine works the value out (`RD.pulledResult`) from every document the page loaded (Execution
  and Sales load each other's, read-only), so Execution, Sales, Planning and the Hub agree, and nothing is written
  when it changes. A pulled gate target at 100 passes its gate like any other.
- My Projects (`apps/mine`, decided October 20) is one person's objectives across every division of both apps,
  as one tree: project, objective, then its key results (each % key result, milestone step and KPI counted in the
  Key results diagram), stage-gates, kanban tiles, risks and experiments. "Yours" is an objective you own (in
  full) or one where you run an experiment or hold a tile (just those). Leads, the CTO and the CEO also get Team
  Projects: every objective in the divisions they lead (the CTO and CEO: every division), by the same lead rule as
  pulled KPIs. Values update the way Execution's do (click the value); each saves to the objective's own EXEC-… or
  BIZ-… document. An objective's title opens it in Execution or Sales in a new tab (`?objective=`). `?view=owned|team`
  and `?quarter=all|2026Q4` pick the view and the quarters (default: this quarter and later). The Hub tile for
  `my_projects.html` is added in the Hub.

Bumping `CLIENT` in `kit/net.js` (say to `calm-2`) together with the broker's `RD_ALLOWED_CLIENTS` is how a
future release turns away tabs left open on this one.
