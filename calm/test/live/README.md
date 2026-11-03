# Live tests: the real broker on a fake JSONBin

Browser tests for the live Calm pages run against the **real** broker (`rd-gantt-v2/broker`, FastAPI),
started locally by `broker_up.py`. The broker is not stubbed: only JSONBin is replaced, by `fakebin.py`,
an in-memory JSONBin v3 the broker reaches over real HTTP on 127.0.0.1. Nothing contacts the network:
the broker process refuses every non-loopback host, and pages opened with `lib.js` have every
non-loopback request answered locally or blocked.

```
cd calm
node test/live/smoke.js                     # proves it all works (LIVE_VERBOSE=1 lists every check)
python3 test/live/broker_up.py --seed sample          # run a broker by hand
python3 test/live/fakebin.py --selftest               # fakebin on its own
```

| File | What it is |
|---|---|
| `fakebin.py` | the fake JSONBin: store, HTTP server, fault injection, admin API, client redirect |
| `broker_up.py` | starts the real broker with uvicorn against fakebin, seeded from a seed set |
| `lib.js` | Node helpers: start/stop the broker, static server with broker-URL rewriting, `open()` a page, `api()`, admin helpers |
| `smoke.js` | the infrastructure's own test |
| `export_sample.js` | regenerates `seeds/sample` from a built sample board |
| `export_mapped.py` | regenerates `seeds/mapped` from `rd-gantt-v2/mapped` |
| `seeds/sample`, `seeds/mapped` | seed sets |

## broker_up.py

```
python3 test/live/broker_up.py [--seed sample|mapped|<dir>] [--port 0] [--admin-port 0]
    [--broker-dir DIR] [--app broker:app] [--token test-token] [--origins '*'] [--client calm-1]
    [--env NAME=VALUE]... [--unset NAME]... [--import-timeout 90] [--exit-with-parent]
    [--ready-file PATH] [--no-ua-check] [--verbose]
```

When the broker answers it prints, flushed, with `BROKER_URL` always last:

```
FAKEBIN_URL=http://127.0.0.1:<p2>
ADMIN_URL=http://127.0.0.1:<p2>/__admin
BROKER_URL=http://127.0.0.1:<p1>
```

- **The broker** is imported the way the Procfile runs it (`broker:app` from `--broker-dir`, default
  the repo's `broker/`, or `$BROKER_DIR`) and served by uvicorn, one worker, on
  127.0.0.1. No `__pycache__` is written into the broker folder. If the import fails (a file mid-edit),
  it is retried every second until `--import-timeout`.
- **Its environment**: `BROKER_TOKEN=test-token`, `ALLOWED_ORIGINS=*`, a fake `JSONBIN_MASTER_KEY`
  (fakebin checks it), `UNIFIED_DIVISIONS` / `BIZ_DIVISIONS` from the seed manifest, `<DOC>_BIN` for
  every `/state` document (`PORTFOLIO_BIN`, `GANTT_VIEW_BIN`, `EXEC_<DIV>_BIN`, `SPEC_<DIV>_BIN`,
  `BIZ_<DIV>_BIN`) and the manifest's raw bins (`USERS_BIN`, `ANALYSIS_INDEX_BIN`, `PREFS_BIN`). Bin ids
  are readable: `fakebin-portfolio`, `fakebin-exec-div-fc`, `fakebin-users`. `--env` adds or overrides
  a variable (e.g. `RD_ALLOWED_CLIENTS=calm-1`), `--unset` removes one (e.g. `USERS_BIN`, to see the 503).
  Proxy variables are removed. The legacy tracker routes (`JSONBIN_BIN_HUB`, ...) are left unconfigured.
- **Reset and restart** re-import the broker modules in the same process and swap the served app, so the
  port stays open and pages already pointed at `BROKER_URL` keep working. The new broker starts with cold
  caches, exactly like a redeploy, and picks up any edit made to the broker files since.
- `--exit-with-parent` stops the broker when the process that started it goes away (`lib.js` passes it).

### The broker's caches matter for tests

The broker treats itself as the only writer of the `/state` documents and of the prefs bin, so it
serves them **from memory after the first read**:

- A raw bin overwrite (`PUT /__admin/docs/<name>`) of a `/state` document or prefs is **not seen** by a
  broker that has already read that document; it keeps serving its copy until a restart (a broker that
  never read it picks the new content up on its first read). To make a change another editor would make,
  save through the broker (`saveAs` / `POST .../edit`): that bumps the version, and pages polling
  `/version` pick it up.
- A read fault on a `/state` document or prefs only shows on a **cold** read: `restart()` first, then
  `fail(...)`. Write faults show on the next save.
- `/roster` reads through on every call; `/analysis` caches for 60 s (after that it serves the stale copy
  with `X-Analysis-Stale: 1`), so restart before failing it.

## Admin API

On `ADMIN_URL` (no auth; loopback only). `<name>` is a `/state` document id (`portfolio`, `gantt-view`,
`EXEC-DIV-FC`, `SPEC-…`, `BIZ-…`), `users`, `analysis`, `prefs`, or a raw bin id.

| Method and path | Body | Does |
|---|---|---|
| `GET /__admin` | | every bin, the active faults, the config |
| `GET /__admin/config` | | URLs, seed, divisions, name to bin id, the broker's env (all fake values) |
| `GET /__admin/docs` | | every bin: name, bin id, version, bytes, writes |
| `GET /__admin/docs/<name>` | | the stored record as JSONBin holds it (`record`); for wrapper bins also `version`, `updatedAt`, `doc` |
| `POST /__admin/docs/<name>/edit` | `{doc, ifMatch?, extra?}` | **another editor saves**: `GET /state/<name>/version`, then `PUT /state/<name>` with the token, `If-Match` (the current etag unless `ifMatch` is given) and `client: "calm-1"`. Answers with the broker's own status and body (200, 412, 426, 502...) |
| `PUT /__admin/docs/<name>` | `{record, create?}` | overwrite the bin out of band, exactly as given (see the cache note) |
| `DELETE /__admin/docs/<name>` | | delete the bin; JSONBin then answers 404 for it |
| `POST /__admin/fail` | `{target, mode, status?, ops?, times?, delay?, after?, hang?, body?}` | inject a fault (below); `target: "*"` is every bin |
| `POST /__admin/recover` | `{target?}` | clear one fault, or all; requests held by a timeout are released |
| `GET /__admin/faults` | | the active faults |
| `GET /__admin/log?since=<seq>&name=<name>` | | every JSONBin request: `seq, method, path, bin, name, op, status, fault, ms, ua, headers` |
| `DELETE /__admin/log` | | clear the log |
| `POST /__admin/reset` | `{seed?, reload?: true, importTimeout?}` | back to the seed set (or switch to another), faults and log cleared, broker re-imported (cold caches). The new broker is imported first: if that fails (500), nothing changed |
| `POST /__admin/restart` | `{importTimeout?}` | re-import the broker only: cold caches, same bins and faults (a redeploy) |

### Faults

| `mode` | Effect |
|---|---|
| an HTTP status (`500`, `502`, `503`, `429`, `404`, `401`...) or `"status"` + `status` | JSONBin answers that status with a `{"message"}` body |
| `"timeout"` | the request is held unanswered; the broker's client gives up after its own timeout (10 s), or after `after` seconds when given (the redirect lowers the client timeout for that bin only). Held up to `hang` s (default 60), or until recovered |
| `"drop"` | the connection is closed without a response |
| `"slow"` | the normal answer, after `delay` seconds |

`ops`: `"all"` (default), `"read"` or `"write"`. `times: N` limits the fault to the next N matching
requests. Examples:

```
curl --noproxy '*' -X POST $ADMIN_URL/fail -d '{"target":"users","mode":500}'
curl --noproxy '*' -X POST $ADMIN_URL/fail -d '{"target":"EXEC-DIV-FC","mode":"timeout","after":0.5,"ops":"write"}'
curl --noproxy '*' -X POST $ADMIN_URL/recover -d '{}'
curl --noproxy '*' -X POST $ADMIN_URL/docs/portfolio/edit -d "{\"doc\": $(cat new-portfolio.json)}"
curl --noproxy '*' -X POST $ADMIN_URL/reset -d '{"seed":"mapped"}'
```

What fakebin emulates of JSONBin: `GET /v3/b/<id>[/latest]` (`{record, metadata}`; with
`X-Bin-Meta: false` the bare record), `PUT /v3/b/<id>`, `POST /v3/b` (create), `DELETE /v3/b/<id>`;
401 without the right `X-Master-Key`, 404 for an unknown bin, 400 for a PUT that is not
`application/json`, is empty, or is not strict JSON (NaN/Infinity), and Cloudflare's 403 `error code: 1010`
for urllib's default User-Agent (`--no-ua-check` turns that off). Records are stored as JSON text.

## Seed sets

```
seeds/<name>/manifest.json      {"unifiedDivisions": [...], "bizDivisions": [...], "bins": {...}, ...}
seeds/<name>/state/<docId>.json bare document payloads
seeds/<name>/bins/*.json        raw bin records, stored exactly as written
```

- Each `state/<docId>.json` is stored as the broker's wrapper `{"version": 1, "updatedAt": <now>, "doc": ...}`
  (`stateVersion` and `versions: {docId: n}` change the version; `updatedAt` fixes the time).
- A document the divisions imply (`portfolio`, `gantt-view`, `EXEC-`/`SPEC-` per R&D division, `BIZ-`
  per business division) with no file is stored as `{"version": 0, "updatedAt": null, "doc": {}}`, what
  `create_bins.py` leaves in a new bin (`"missingState": "absent"` configures no bin for it instead).
- `bins`: `{alias: {"env": "USERS_BIN", "file": "bins/users.json"}}`; the alias is the admin name.
- `signIn`: one enabled email per org role, for tests that sign someone in. `env`: extra broker env.

**sample**: the Calm sample dataset, from `node test/live/export_sample.js [board] [outDir] [--prefs]`
(default board `out/Main.dc.html`; every board gives the same data; `Math.random` is seeded, so the
export is reproducible). Portfolio, `EXEC-DIV-FC`, `EXEC-DIV-EL`, `BIZ-DIV-BD`, `BIZ-DIV-PT`,
`SPEC-DIV-FC`, `SPEC-DIV-EL`, `gantt-view`; `UNIFIED_DIVISIONS=DIV-FC,DIV-EL`,
`BIZ_DIVISIONS=DIV-BD,DIV-PT` (from each division's `kind`). The users bin is the sample roster as the
Hub stores it (`email, name, role` (`admin` for cto/ceo), `orgRole, leadOf, leadUnits, leadDivisions,
disabled`) with obviously fake `pinHash`/`salt`/`iterations: 1`; the analysis index is `D.analysis`
(32 runs); prefs is empty (`--prefs` stores the sample's own Done-column choices instead).
Sign in as `corey@celadyne.com` (cto), `toru@celadyne.com` (lead), `maya@celadyne.com` (ic).

**mapped**: the real (older) snapshot from `rd-gantt-v2/mapped`: portfolio, `EXEC-DIV-EL`,
`EXEC-DIV-EXP`, `EXEC-DIV-FC`, `gantt-view`; no SPEC documents (fresh version-0 bins);
`UNIFIED_DIVISIONS=DIV-EL,DIV-EXP,DIV-FC`. Four fake users: `cto.test@celadyne.test` (cto),
`lead.test@celadyne.test` (lead of DIV-EL), `ic.test@celadyne.test` (ic), `former.test@celadyne.test`
(disabled); an empty analysis index and empty prefs. **These are real company documents**, so the seed
is not committed: generate it from the repo's `mapped/` with `python3 test/live/export_mapped.py` before
using it.

## lib.js

```js
const live = require('./test/live/lib');            // from calm/
const { T } = live;
const broker = await live.startBroker({ seed: 'sample' });           // spawns broker_up.py
const site = await live.serve({ root: 'live' });     // python3 standalone.py --live; or files: {'x.html': '/abs/path'}
const browser = await live.chromium.launch();
const r = await live.open(browser, site.url('execution_app.html'), {
  hubSession: { email: 'corey@celadyne.com', orgRole: 'cto' }        // token defaults to the broker's
});
await r.page.waitForSelector('text=Loaded');

await broker.saveAs('EXEC-DIV-FC', (doc) => { doc.risks.push(/* ... */); });   // another editor saves
const raw = await broker.readDoc('EXEC-DIV-FC');                     // {version, doc, record, binId}
const res = await live.api('/state/EXEC-DIV-FC/version');            // {status, body, headers, text}
await broker.restart(); await broker.fail('portfolio', { mode: 500, ops: 'read' });
await broker.recover(); await broker.reset();

T.eq('no unexpected errors', r.unexpected(), []);
await r.close(); await browser.close(); await site.close(); await broker.stop();
T.done();                                                            // "N passed, M failed"
```

- `startBroker({seed, port, adminPort, token, origins, env: {NAME: value | null}, brokerDir, verbose, timeoutMs})`
  resolves when `BROKER_URL` is printed, with a `Broker`. Its stderr is kept (`broker.stderr()`;
  `echoStderr: true` streams it).
- `Broker`: `api(path, {method, body, headers, token, ifMatch})` always sends the token unless
  `token: null`; `get(id)` / `version(id)`; `put(id, doc, {ifMatch, client, extra})` sends
  `{doc, client: "calm-1"}` (`client: null` omits it; `ifMatch` defaults to `"0"`, the new-document
  etag); `saveAs(id, docOrFn)`; `readDoc`, `writeRaw`, `editViaAdmin`, `fail`, `recover`, `reset`,
  `restart`, `jsonbinLog`, `clearLog`, `config`, `stop`. The same names exist as plain functions on the
  module (`live.api`, `live.saveAs`, ...) for the most recently started broker.
- `serve({root, files, broker, prodUrl, rewrite, index})`: a static server on 127.0.0.1 that replaces
  `https://web-production-b17a2.up.railway.app` with the local broker URL in every HTML and JS response
  (looked up per request; `site.served` lists each response and its rewrite count). Dotfiles and `*.env`
  are never served.
- `open(browser, url, {token, hubSession, storage, reseed, viewport, colorScheme, waitFor, cdn, onDialog})`:
  a fresh context; before any page script, localStorage gets `rd_broker_token`, `hub_session_v1` as the
  Hub writes it (`{email, role: 'user', orgRole, issuedAt, expiresAt}`, 12 h) and `storage`, on the
  tab's first load only (a reload keeps what the page saved; `reseed: true` seeds every load). Every
  non-loopback request is handled: Google Fonts get an empty 200, `cdn: {regex: localFile}` serves a
  CDN script from disk, everything else is aborted and listed in `log.blocked` (calls to the production
  broker also in `log.prodBroker`). Returns `{page, ctx, errors, log, unexpected(), text(), close()}`:
  `errors` holds every page error and console error; `unexpected()` drops the console noise from requests
  the harness blocked on purpose; `log.broker` lists the page's broker calls with their statuses.
- `T.ok / T.eq / T.section / T.done`, `waitFor(fn, {timeout})`, `httpJson`, `hubSession(email, orgRole, ttlMs)`.

## smoke.js

(a) The broker on `sample`: every document, `/roster` (fields match the users bin; no credentials),
`/analysis` and `/prefs` match the seed; a PUT with `If-Match` and `client: "calm-1"` bumps the version and
reaches the bin; a stale `If-Match` (etag or bare version) gets 412; `saveAs` and the admin edit route
land. It prints what the broker does with requests that break its rules (no token, no client, no
If-Match). (b) An `execution_app.html` from before the Calm patch (`RD_OLD_EXEC_APP=<file>`; skipped
without it), served with the rewrite, token and Hub session in localStorage: it loads Fuel Cell from the local broker (the edit from (a) and a seed statement are on the
page), with no page errors and no console errors other than the blocked CDN scripts; PUT, stale PUT and
PATCH /prefs from the page's origin pass CORS. (a2) Faults: users bin 500 and timeout, a cold read of a
failing bin after a restart, a refused write, a dropped connection once, then reset. (c) The reads of (a)
on `mapped`, then an in-place reset to `sample`. Ends with `N passed, M failed`.
