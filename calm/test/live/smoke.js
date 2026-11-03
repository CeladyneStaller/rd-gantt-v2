#!/usr/bin/env node
/* ============================================================================
   smoke.js: proves the live-test infrastructure works, without the new Calm pages.

     node test/live/smoke.js          (from calm/; LIVE_VERBOSE=1 prints every passing check)

   (a) the real broker on the `sample` seed: every /state document, /roster, /analysis and /prefs read with
       the token match the seed; a PUT with If-Match and client "calm-1" bumps the version and reaches the
       fake JSONBin; a stale If-Match gets 412; another editor's save (saveAs and the admin route) lands.
   (b) today's live app (rd-gantt-v2/execution_app.html) through the static server, token and Hub session
       in localStorage: it loads from the local broker (the edit from (a) and a seed statement are on the
       page), with no page errors and nothing but blocked external resources in the console.
   (a2) fault injection and reset: a failing users bin, a timing-out read, a cold read after a restart,
       a failed write, then reset back to the seed.
   (c) (a)'s reads against the `mapped` seed, then an in-place reset to another seed.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const live = require('./lib');
const { T } = live;

/* (b) runs an app from BEFORE the Calm patch against the broker, which is what an old tab does after the
   update. In the repo the pages are Calm now, so point RD_OLD_EXEC_APP at an old copy to run it, e.g.
     git show cfcbc3f:execution_app.html > old_execution_app.html   (any commit before the patch)  */
const EXEC_APP = process.env.RD_OLD_EXEC_APP || '';
const MARKER = 'Smoke marker: polarization gain at 20% RH, edited through the local broker';
const SEED_STATEMENT = 'Run full roll-to-roll membrane production';
const CRED = /pinHash|"salt"|iterations|FAKE-TEST-PINHASH|FAKE-TEST-SALT/;

function loadSeed(name) {
  const dir = path.join(live.SEEDS, name);
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const m = read('manifest.json');
  const state = {};
  fs.readdirSync(path.join(dir, 'state')).filter((f) => f.endsWith('.json')).forEach((f) => { state[f.slice(0, -5)] = read('state/' + f); });
  const bins = {};
  Object.keys(m.bins || {}).forEach((a) => { bins[a] = read(m.bins[a].file); });
  const implied = ['portfolio', 'gantt-view'].concat((m.unifiedDivisions || []).map((d) => 'EXEC-' + d), (m.unifiedDivisions || []).map((d) => 'SPEC-' + d), (m.bizDivisions || []).map((d) => 'BIZ-' + d));
  return { name: name, m: m, state: state, bins: bins, implied: implied };
}

/* every read the apps make, against a seed */
async function checkReads(broker, seed) {
  const L = seed.name;
  for (const id of seed.implied) {
    const r = await broker.api('/state/' + id);
    if (seed.state[id]) {
      T.eq(L + ': GET /state/' + id + ' -> 200', r.status, 200);
      T.eq(L + ': ' + id + ' doc is the seed', r.body && r.body.doc, seed.state[id]);
      T.eq(L + ': ' + id + ' version', r.body && r.body.version, seed.m.stateVersion || 1);
      T.ok(r.body && r.body.etag && r.headers.etag === r.body.etag, L + ': ' + id + ' ETag header = body etag');
    } else {
      /* no file in the seed: a fresh version-0 bin, like create_bins.py leaves it */
      T.eq(L + ': ' + id + ' (not in the snapshot) reads as a fresh version-0 document', r.body && { v: r.body.version, doc: r.body.doc }, { v: 0, doc: {} });
    }
    const v = await broker.api('/state/' + id + '/version');
    T.eq(L + ': GET /state/' + id + '/version agrees', v.body && v.body.etag, r.body && r.body.etag);
  }
  const ro = await broker.api('/roster');
  T.eq(L + ': GET /roster -> 200', ro.status, 200);
  const want = seed.bins.users.users.filter((u) => u.email);
  const got = (ro.body && ro.body.users) || [];
  T.eq(L + ': roster has every user in the users bin', got.map((u) => u.email), want.map((u) => u.email));
  const fields = (u) => ({ email: u.email, orgRole: u.orgRole, leadOf: u.leadOf || [], leadUnits: u.leadUnits || [], leadDivisions: u.leadDivisions || [], disabled: !!u.disabled });
  T.eq(L + ': roster fields match the users bin', got.map(fields), want.map(fields));
  const named = got.filter((u) => 'name' in u);
  if (named.length) T.eq(L + ': roster names match (the broker projects name)', named.map((u) => u.name), want.filter((u) => named.some((n) => n.email === u.email)).map((u) => u.name));
  T.ok(!CRED.test(ro.text), L + ': roster never carries pinHash / salt / iterations');
  const an = await broker.api('/analysis');
  T.eq(L + ': GET /analysis -> the seed index', { s: an.status, b: an.body }, { s: 200, b: seed.bins.analysis });
  const who = (seed.m.signIn && seed.m.signIn.cto) || want[0].email;
  const pr = await broker.api('/prefs/' + encodeURIComponent(who));
  T.eq(L + ': GET /prefs/<cto> -> empty prefs, version 0', { s: pr.status, b: pr.body }, { s: 200, b: { email: who, prefs: {}, version: 0 } });
}

async function probe(broker, label, p, opts) {
  const r = await broker.api(p, opts);
  return { label: label, status: r.status, detail: r.body && r.body.detail ? JSON.stringify(r.body.detail).slice(0, 90) : '' };
}

async function main() {
  const t0 = Date.now();
  const sample = loadSeed('sample');
  const mapped = loadSeed('mapped');

  /* ------------------------------------------------------------ (a) */
  T.section('(a) the real broker on the sample seed');
  const broker = await live.startBroker({ seed: 'sample' });
  console.log('   broker ' + broker.url + '  admin ' + broker.adminUrl);
  const cfg = await broker.config();
  T.eq('broker env: UNIFIED_DIVISIONS / BIZ_DIVISIONS from the portfolio', [cfg.env.UNIFIED_DIVISIONS, cfg.env.BIZ_DIVISIONS], [sample.m.unifiedDivisions.join(','), sample.m.bizDivisions.join(',')]);
  T.eq('broker env: token, origins', [cfg.env.BROKER_TOKEN, cfg.env.ALLOWED_ORIGINS], ['test-token', '*']);
  T.ok(cfg.env.EXEC_DIV_FC_BIN && cfg.env.SPEC_DIV_EL_BIN && cfg.env.BIZ_DIV_BD_BIN && cfg.env.USERS_BIN && cfg.env.PREFS_BIN && cfg.env.ANALYSIS_INDEX_BIN, 'broker env: a fake bin for every document, users, analysis and prefs');
  await checkReads(broker, sample);

  const v0 = await broker.version('portfolio');
  const pf = (await broker.get('portfolio')).doc;
  const target = pf.objectives.find((o) => o.id === 'OBJ-FC-2026Q4-03');
  T.ok(!!target, 'the sample has OBJ-FC-2026Q4-03 to edit');
  target.statement = MARKER;
  await broker.clearLog();
  const put = await broker.put('portfolio', pf, { ifMatch: v0.etag });
  T.eq('PUT /state/portfolio (If-Match, client calm-1) -> 200, version + 1', { s: put.status, v: put.body && put.body.version }, { s: 200, v: v0.version + 1 });
  T.ok(put.headers.etag && put.headers.etag === put.body.etag && put.body.etag !== v0.etag, 'PUT returns the new etag (header and body)');
  const after = await broker.get('portfolio');
  T.eq('GET after the PUT: the new version and the edit', { v: after.version, s: after.doc.objectives.find((o) => o.id === 'OBJ-FC-2026Q4-03').statement }, { v: v0.version + 1, s: MARKER });
  const raw = await broker.readDoc('portfolio');
  T.eq('the write reached the fake JSONBin (raw bin: version wrapper + doc)', { v: raw.version, s: raw.doc.objectives.find((o) => o.id === 'OBJ-FC-2026Q4-03').statement, keys: Object.keys(raw.record).sort() }, { v: v0.version + 1, s: MARKER, keys: ['doc', 'updatedAt', 'version'] });
  const puts = (await broker.jsonbinLog({ name: 'portfolio' })).filter((e) => e.method === 'PUT');
  T.eq('exactly one JSONBin PUT, with the broker\'s headers', puts.map((e) => ({ s: e.status, ua: /CeladyneRD/.test(e.ua || ''), priv: e.headers.indexOf('x-bin-private') >= 0 })), [{ s: 200, ua: true, priv: false }]);
  const stale = await broker.put('portfolio', pf, { ifMatch: v0.etag });
  T.eq('a stale If-Match (old etag) -> 412', stale.status, 412);
  const staleN = await broker.put('portfolio', pf, { ifMatch: String(v0.version) });
  T.eq('a stale If-Match (old bare version) -> 412', staleN.status, 412);
  T.eq('412 names the current version', stale.body && stale.body.detail && stale.body.detail.currentVersion, v0.version + 1);
  T.eq('the refused writes did not reach JSONBin', (await broker.readDoc('portfolio')).version, v0.version + 1);

  const gv = await broker.saveAs('gantt-view', (doc) => { doc.overrides = { 'OBJ-FC-2026Q4-01': { hidden: true } }; });
  T.eq('saveAs (another editor through the broker PUT path) -> version 2', [gv.status, gv.body.version], [200, 2]);
  T.eq('saveAs landed in the bin', (await broker.readDoc('gantt-view')).doc, { overrides: { 'OBJ-FC-2026Q4-01': { hidden: true } } });
  const ad = await broker.editViaAdmin('gantt-view', { overrides: {} });
  T.eq('admin edit route (POST /__admin/docs/gantt-view/edit) -> version 3', [ad.status, ad.body && ad.body.version], [200, 3]);
  const ad412 = await broker.editViaAdmin('gantt-view', { overrides: { x: 1 } }, { ifMatch: '2' });
  T.eq('admin edit with a stale ifMatch -> 412', ad412.status, 412);

  /* what this broker does with requests that break its rules: reported, not asserted (it changes by deploy) */
  const probes = [
    await probe(broker, 'GET /state/portfolio, no token', '/state/portfolio', { token: null }),
    await probe(broker, 'GET /state/portfolio/version, no token', '/state/portfolio/version', { token: null }),
    await probe(broker, 'GET /roster, no token', '/roster', { token: null }),
    await probe(broker, 'GET /analysis, no token', '/analysis', { token: null }),
    await probe(broker, 'GET /prefs/<email>, no token', '/prefs/corey%40celadyne.com', { token: null }),
    await probe(broker, 'GET /state/portfolio, wrong token', '/state/portfolio', { token: 'wrong-token' }),
    await probe(broker, 'GET /rdcore/version, no token', '/rdcore/version', { token: null }),
    await probe(broker, 'GET /health, no token', '/health', { token: null })
  ];
  const cur = await broker.version('gantt-view');
  const noClient = await broker.put('gantt-view', { overrides: {} }, { ifMatch: cur.etag, client: null });
  probes.push({ label: 'PUT /state/gantt-view with token + If-Match, no client', status: noClient.status, detail: noClient.body && noClient.body.detail ? JSON.stringify(noClient.body.detail).slice(0, 90) : '' });
  const oldClient = await broker.put('gantt-view', { overrides: {} }, { ifMatch: cur.etag, client: 'planning-2025' });
  probes.push({ label: 'PUT /state/gantt-view, client "planning-2025"', status: oldClient.status, detail: '' });
  const noMatch = await broker.api('/state/gantt-view', { method: 'PUT', body: { doc: {}, client: 'calm-1' } });
  probes.push({ label: 'PUT /state/gantt-view, client calm-1, no If-Match', status: noMatch.status, detail: '' });
  console.log('   broker behaviour observed:');
  probes.forEach((p) => console.log('     ' + String(p.status).padEnd(4) + p.label + (p.detail ? '  ' + p.detail : '')));

  /* ------------------------------------------------------------ (b) */
  T.section('(b) an execution_app.html from before the patch against the local broker');
  if (!EXEC_APP || !fs.existsSync(EXEC_APP)) console.log('   skipped: set RD_OLD_EXEC_APP to an execution_app.html from before the Calm patch');
  else {
  const site = await live.serve({ files: { 'execution_app.html': EXEC_APP } });
  const html = await live.httpJson('GET', site.url('execution_app.html'));
  T.ok(html.status === 200 && html.text.indexOf(broker.url) >= 0 && html.text.indexOf(live.PROD_BROKER) < 0, 'served page: the Railway URL is rewritten to ' + broker.url);
  T.ok(site.served.some((s) => s.rewrites > 0), 'the static server counted the rewrites');
  const browser = await live.chromium.launch();
  try {
    const r = await live.open(browser, site.url('execution_app.html'), { hubSession: { email: 'corey@celadyne.com', orgRole: 'cto' } });
    let loaded = '';
    try {
      await r.page.waitForFunction(() => { const m = document.getElementById('msg'); return m && /Loaded|failed|No portfolio/i.test(m.textContent || ''); }, null, { timeout: 30000 });
      loaded = await r.page.evaluate(() => document.getElementById('msg').textContent);
    } catch (e) { loaded = 'timed out: ' + e.message; }
    T.eq('the app says it loaded the first R&D division', loaded, 'Loaded Fuel Cell.');
    await r.page.waitForTimeout(1500);       // let late requests (roster, prefs, autosave) settle
    const content = await r.page.content();
    T.ok(content.indexOf(MARKER) >= 0, 'the page shows the statement edited through the broker in (a)');
    T.ok(content.indexOf(SEED_STATEMENT) >= 0, 'the page shows a seed objective statement ("' + SEED_STATEMENT + '")');
    const visible = await r.text();
    T.ok(visible.indexOf('Fuel Cell') >= 0, 'visible text names the division');
    const calls = r.log.broker.map((c) => c.method + ' ' + c.path + ' ' + c.status);
    T.ok(calls.indexOf('GET /state/portfolio 200') >= 0 && calls.indexOf('GET /state/EXEC-DIV-FC 200') >= 0, 'the page read portfolio and EXEC-DIV-FC from the local broker');
    T.eq('no request went to the production broker', r.log.prodBroker, []);
    T.eq('no page errors', r.log.pageErrors, []);
    const writes = r.log.broker.filter((c) => c.method !== 'GET');
    const unexpected = r.unexpected().filter((e) => !(writes.length && /status of 426/.test(e)));
    T.eq('no console errors besides blocked external resources', unexpected, []);
    console.log('   broker calls from the page: ' + (calls.join(', ') || 'none'));
    if (writes.length) console.log('   note: the page wrote ' + writes.map((w) => w.method + ' ' + w.path + ' -> ' + w.status).join(', ') + ' (today\'s app sends no "client"; a 426 here is the broker turning it away)');
    console.log('   blocked external requests: ' + (r.log.blocked.map((b) => b.replace(/^GET /, '')).join(', ') || 'none'));
    if (r.log.stubbed.length) console.log('   stubbed: ' + r.log.stubbed.join(', '));

    /* the writes Calm pages make, from the page's origin: CORS preflight with Authorization + If-Match */
    const fromPage = await r.page.evaluate(async (a) => {
      const auth = { Authorization: 'Bearer ' + localStorage.getItem('rd_broker_token') };
      const v = await (await fetch(a.broker + '/state/gantt-view/version', { headers: auth, cache: 'no-store' })).json();
      const put = await fetch(a.broker + '/state/gantt-view', { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json', 'If-Match': v.etag }, auth), body: JSON.stringify({ doc: { overrides: { fromPage: { hidden: true } } }, client: 'calm-1' }) });
      const stale = await fetch(a.broker + '/state/gantt-view', { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json', 'If-Match': v.etag }, auth), body: JSON.stringify({ doc: { overrides: {} }, client: 'calm-1' }) });
      const patch = await fetch(a.broker + '/prefs/corey%40celadyne.com', { method: 'PATCH', keepalive: true, headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body: JSON.stringify({ kbDone: { 'BRD-SMOKE': { win: 7, style: 'compact' } } }) });
      return { before: v.version, put: put.status, version: (await put.json()).version, stale: stale.status, patch: patch.status };
    }, { broker: broker.url });
    T.eq('from the page: PUT (If-Match, client calm-1) 200, stale PUT 412, PATCH /prefs 200', fromPage, { before: fromPage.before, put: 200, version: fromPage.before + 1, stale: 412, patch: 200 });
    T.eq('...and they reached the bins', [(await broker.readDoc('gantt-view')).doc, (await broker.readDoc('prefs')).doc.users['corey@celadyne.com']],
      [{ overrides: { fromPage: { hidden: true } } }, { kbDone: { 'BRD-SMOKE': { win: 7, style: 'compact' } } }]);
    await r.close();
  } finally {
    await browser.close();
    await site.close();
  }
  }

  /* ------------------------------------------------------------ (a2) */
  T.section('(a2) fault injection, restart and reset');
  const seen = [];          // what the broker answered under each fault: reported (it differs by broker version)
  await broker.fail('users', { mode: 500 });
  const r500 = await broker.api('/roster');
  T.ok(r500.status >= 500, 'users bin answers 500 -> GET /roster refused (' + r500.status + ')');
  seen.push([r500.status, 'GET /roster while the users bin answers 500']);
  const log500 = (await broker.jsonbinLog({ name: 'users' })).slice(-1)[0] || {};
  T.eq('the JSONBin log records the injected fault', [log500.fault, log500.status], [500, 500]);
  await broker.recover('users');
  T.eq('recovered -> GET /roster 200', (await broker.api('/roster')).status, 200);

  await broker.fail('users', { mode: 'timeout', after: 0.5 });
  const t = Date.now();
  const rto = await broker.api('/roster');
  const took = Date.now() - t;
  T.ok(rto.status >= 500 && took < 8000, 'users bin times out -> GET /roster refused (' + rto.status + ') after ' + took + ' ms (client timeout lowered to 0.5 s)');
  seen.push([rto.status, 'GET /roster while the users bin times out (' + took + ' ms)']);
  await broker.recover('users');

  await broker.restart();
  T.eq('restart keeps the bins (portfolio still at version 2 with the edit)', (await broker.get('portfolio')).version, 2);
  await broker.restart();
  await broker.fail('portfolio', { mode: 500, ops: 'read' });
  const cold = await broker.api('/state/portfolio');
  T.ok(cold.status !== 200, 'cold read of a failing bin is refused (got ' + cold.status + ')');
  const coldV = await broker.api('/state/portfolio/version');
  seen.push([cold.status, 'GET /state/portfolio while its bin answers 500 (cold cache)']);
  seen.push([coldV.status, 'GET /state/portfolio/version while its bin answers 500' + (coldV.status === 200 ? ' (reads as version ' + (coldV.body && coldV.body.version) + ')' : '')]);
  await broker.recover();
  T.eq('recovered -> the stored version comes back', (await broker.get('portfolio')).version, 2);

  await broker.fail('EXEC-DIV-FC', { mode: 503, ops: 'write' });
  const wf = await broker.saveAs('EXEC-DIV-FC', (doc) => { doc.tasks = doc.tasks || []; }, { allowFail: true });
  T.ok(!wf.ok, 'a write JSONBin refuses is not acknowledged (got ' + wf.status + ')');
  seen.push([wf.status, 'PUT /state/EXEC-DIV-FC while its bin refuses writes (503)']);
  T.eq('...and the bin is unchanged', (await broker.readDoc('EXEC-DIV-FC')).version, 1);
  await broker.recover();
  const wok = await broker.saveAs('EXEC-DIV-FC', (doc) => { doc.tasks = doc.tasks || []; });
  T.eq('after recover the same save lands', [wok.status, (await broker.readDoc('EXEC-DIV-FC')).version], [200, 2]);

  await broker.fail('prefs', { mode: 'drop', times: 1 });
  await broker.restart();
  const pdrop = await broker.api('/prefs/corey%40celadyne.com');
  T.ok(pdrop.status >= 500, 'prefs bin drops the connection once -> GET /prefs refused (' + pdrop.status + ')');
  seen.push([pdrop.status, 'GET /prefs/<email> while the prefs bin drops the connection']);
  T.eq('...and the next read (times: 1) works', (await broker.api('/prefs/corey%40celadyne.com')).status, 200);
  console.log('   broker behaviour observed under faults:');
  seen.forEach((s) => console.log('     ' + String(s[0]).padEnd(4) + s[1]));

  await broker.reset();
  const back = await broker.get('portfolio');
  T.eq('reset: portfolio is the seed again, version 1', { v: back.version, same: JSON.stringify(back.doc) === JSON.stringify(sample.state.portfolio) }, { v: 1, same: true });
  T.eq('reset: gantt-view and EXEC-DIV-FC back to version 1', [(await broker.version('gantt-view')).version, (await broker.readDoc('EXEC-DIV-FC')).version], [1, 1]);
  T.eq('reset: faults cleared', (await broker.admin('GET', '/faults')).faults, []);
  await broker.stop();

  /* ------------------------------------------------------------ (c) */
  T.section('(c) the real broker on the mapped seed');
  const mb = await live.startBroker({ seed: 'mapped' });
  const mcfg = await mb.config();
  T.eq('mapped: UNIFIED_DIVISIONS from the snapshot', mcfg.env.UNIFIED_DIVISIONS, mapped.m.unifiedDivisions.join(','));
  await checkReads(mb, mapped);
  await mb.reset({ seed: 'sample' });
  T.eq('reset to another seed in place: the sample portfolio is served', JSON.stringify((await mb.get('portfolio')).doc) === JSON.stringify(sample.state.portfolio), true);
  await mb.stop();

  console.log('\n   ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}

main().catch((e) => { console.log('FAIL smoke crashed: ' + (e && e.stack || e)); T.ok(false, 'smoke ran to the end'); })
  .finally(() => { T.done(); setTimeout(() => process.exit(process.exitCode || 0), 200); });
