/* Live-build scenarios for My Projects (apps/mine, LIVE.md).
     node test/sc_mine_live.js                              builds the live board into out/live and runs it
     node test/sc_mine_live.js out/live/Mine-A.dc.html      a board you built yourself:
                                                              python3 build.py mine --flag=live --out=out/live
   Nothing here touches the network: before any board code runs, `fetch` (on the global and on the board's
   window) is replaced by an in-memory broker that speaks today's contract (GET/PUT /state/<id> with etags and
   If-Match, GET /state/<id>/version, GET /roster, GET|PATCH /prefs/<email>) and refuses any other address.
   Its documents are the shared sample (data/sample.js plus every seed, evaluated here with a separate engine
   copy). The board boots through componentDidMount (NET.boot); `settle()` lets the broker's promises resolve,
   and dc.js's fake timers (s.advance / s.flush) run NET's save debounce, its retries and the toasts.
   What My Projects adds to the other live suites: it reads every division's document of both apps and writes
   readings, progress and steps back to the objective's own EXEC-… or BIZ-… document (never the portfolio),
   names the viewer only from the Hub sign-in, opens objectives by link in a new tab, and reads ?view= and
   ?quarter=. The panel above the tree (round 5) shows once the load is done, on the view and quarter the link
   chose, and nothing it does is saved: not a dot's filter, not a project folded on the timeline. The CEO's and
   CTO's choice of divisions for Team Projects (business and R&D by default) stays in this browser, per person:
   nothing goes to the broker, not even /prefs. Group by and Sort by (October 22) stay in this browser too, and the
   panel's mark is the time elapsed in this quarter by the page's own clock. */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const PY = process.env.RD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const ROOT = path.join(__dirname, '..');

/* no board given (test/run_all.js runs it this way): build the live board, then run this file on it */
if (require.main === module && !process.argv[2]) {
  let pass = 0, fail = 0;
  try {
    execFileSync(PY, ['build.py', 'mine', '--flag=live', '--out=out/live'], { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    console.log('FAIL live build: ' + String((e.stdout || '') + (e.stderr || '') || e.message).trim().split('\n').slice(-3).join(' | '));
    fail++;
  }
  if (!fail) {
    const r = spawnSync(process.execPath, [__filename, path.join('out', 'live', 'Mine-A.dc.html')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
    /* the count is the child's last line on stdout; its console warnings (stderr) are shown before ours */
    const lines = String(r.stdout || '').trim().split('\n');
    const m = /(\d+) passed, (\d+) failed/.exec(lines[lines.length - 1] || '');
    lines.slice(0, -1).concat(String(r.stderr || '').trim().split('\n').filter(Boolean)).forEach((l) => console.log(l));
    if (m) { pass += Number(m[1]); fail += Number(m[2]); } else { fail++; console.log('FAIL Mine-A.dc.html: no result (exit ' + r.status + ')'); }
  }
  console.log(pass + ' passed, ' + fail + ' failed');
  if (fail) process.exitCode = 1;
  return;   // a CommonJS module may return at the top level: the scenarios below run in the child
}

const { Sim, load, done } = require('./dc');
const FILE = process.argv[2] || 'out/live/Mine-A.dc.html';
const BROKER = 'https://web-production-b17a2.up.railway.app';   // never reached: the fake fetch answers it
const TOKEN = 'tok-live-1';
const EL = 'EXEC-DIV-EL', BD = 'BIZ-DIV-BD';
const LOCK = 'OBJ-EL-2026Q4-02', QUAL = 'OBJ-EL-2026Q4-01', CUT = 'OBJ-EL-2027Q1-01', PILOT = 'OBJ-BD-2026Q4-01', HUB = 'OBJ-BD-2027Q1-01', HP6 = 'OBJ-FC-2026Q3-01';
const ICR = 'KPI-EL-2026Q4-02-3-1', XOVER = 'KPI-EL-2026Q4-01-3-1', PIPE = 'KPI-BD-2026Q4-01-2-1';
const KR1 = 'KR-EL-2026Q4-02-1', KRM1 = 'KR-EL-2026Q4-02-2';
const PRIYA = { hub: 'priya@celadyne.com', role: 'ic' }, TORU = { hub: 'toru@celadyne.com', role: 'lead' };
const SAM = { hub: 'sam@celadyne.com', role: 'lead' }, ERIN = { hub: 'erin@celadyne.com', role: 'lead' };
const COREY = { hub: 'corey@celadyne.com', role: 'cto' }, DANA = { hub: 'dana@celadyne.com', role: 'ceo' };

/* ------------------------------------------------------------------ the in-memory broker */
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
function reply(status, data) {
  return { status: status, ok: status >= 200 && status < 300, json: () => (data === undefined ? Promise.reject(new SyntaxError('no body')) : Promise.resolve(clone(data))) };
}
const B = {
  token: TOKEN, seq: 0, state: {}, users: [], prefs: {}, log: [], rules: [], foreign: [],
  reset(docs, users) {
    this.seq = 0; this.state = {}; this.prefs = {}; this.log = []; this.rules = []; this.token = TOKEN;
    this.users = clone(users || []);
    Object.keys(docs).forEach((id) => this.put(id, docs[id]));
  },
  /* another editor (or the test) saves a document: new version, new etag */
  put(id, doc) {
    const cur = this.state[id];
    const version = (cur ? cur.version : 0) + 1;
    this.state[id] = { doc: clone(doc), version: version, etag: 'E' + (++this.seq) };
    return this.state[id];
  },
  doc(id) { return this.state[id] ? clone(this.state[id].doc) : null; },
  puts(id) { return this.log.filter((x) => x.method === 'PUT' && (!id || x.id === id)); },
  /* a one-off answer for the next matching call: { method, path, status | offline } */
  once(rule) { this.rules.push(Object.assign({ once: true }, rule)); },
  handle(url, opts) {
    opts = opts || {};
    let u;
    try { u = new URL(String(url)); } catch (e) { this.foreign.push(String(url)); return Promise.reject(new TypeError('bad url')); }
    if (u.origin !== BROKER) { this.foreign.push(String(url)); return Promise.reject(new TypeError('refused: not the broker')); }
    const method = String(opts.method || 'GET').toUpperCase();
    const h = opts.headers || {};
    const p = decodeURIComponent(u.pathname);
    let body;
    try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch (e) { body = undefined; }
    const m = /^\/state\/([^/]+)(\/version)?$/.exec(p);
    this.log.push({ method: method, path: p, id: m ? m[1] : '', version: !!(m && m[2]), ifMatch: h['If-Match'], auth: h.Authorization, body: body });
    for (let i = 0; i < this.rules.length; i++) {
      const r = this.rules[i];
      if (r.method !== method || r.path !== p) continue;
      if (r.once) this.rules.splice(i, 1);
      if (r.offline) return Promise.reject(new TypeError('Failed to fetch'));
      if (r.status) return Promise.resolve(reply(r.status, { error: 'injected ' + r.status }));
      break;
    }
    if (h.Authorization !== 'Bearer ' + this.token) return Promise.resolve(reply(401, { error: 'unauthorized' }));
    if (m) {
      const cur = this.state[m[1]];
      if (method === 'GET' && m[2]) return Promise.resolve(cur ? reply(200, { version: cur.version, etag: cur.etag }) : reply(404, { error: 'not found' }));
      if (method === 'GET') return Promise.resolve(cur ? reply(200, { doc: cur.doc, etag: cur.etag, version: cur.version }) : reply(404, { error: 'not found' }));
      if (method === 'PUT') {
        if (String(h['If-Match']) !== (cur ? cur.etag : '0')) return Promise.resolve(reply(412, { error: 'precondition failed' }));
        const nv = this.put(m[1], body && body.doc);
        return Promise.resolve(reply(200, { etag: nv.etag, version: nv.version }));
      }
    }
    if (p === '/roster' && method === 'GET') return Promise.resolve(reply(200, { users: this.users }));
    const pm = /^\/prefs\/(.+)$/.exec(p);
    if (pm && method === 'GET') return Promise.resolve(reply(200, { prefs: this.prefs[pm[1]] || { kbDone: {} } }));
    return Promise.resolve(reply(404, { error: 'no route' }));
  }
};
/* no real request can leave this process */
const fakeFetch = (url, opts) => B.handle(url, opts);
global.fetch = fakeFetch;

/* ------------------------------------------------------------------ the sample, as broker documents */
function sampleDocs() {
  const RD = require(require('./engine_path'));
  const seeds = execFileSync(PY, ['-B', '-c', 'import sys; sys.path.insert(0, sys.argv[1]); import build; print("\\n".join(build.all_seed_files()))', ROOT]).toString().trim().split('\n').filter(Boolean);
  const srcs = [fs.readFileSync(path.join(ROOT, 'data', 'sample.js'), 'utf8')];
  const names = [];
  seeds.forEach((rel) => {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    srcs.push(s);
    let mm;
    const re = /^function\s+(seed_\w+)\s*\(/gm;
    while ((mm = re.exec(s))) names.push(mm[1]);
  });
  const S = new Function('RD', srcs.join('\n') + '\nvar S = calmSample();\n' + names.map((n) => n + '(S);').join('\n') + '\nreturn S;')(RD);
  const docs = { portfolio: S.portfolio };
  Object.keys(S.docs || {}).forEach((k) => { docs[k] = S.docs[k]; });
  Object.keys(S.spec || {}).forEach((k) => { docs[k] = S.spec[k]; });
  return { docs: docs, users: S.roster.users };
}
const SAMPLE = sampleDocs();

/* ------------------------------------------------------------------ the page around the board */
let W = null;
const intervals = [];
function makeStore(init) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}
function prepWindow() {
  load(FILE);                       // parses and evaluates the board once (dc.js installs its globals here)
  W = global.window;
  W.fetch = fakeFetch;
  W.addEventListener = () => {};
  W.removeEventListener = () => {};
  W.history = { state: null, replaceState(st, t, url) { const u = new URL(url, W.location.href); W.location.href = u.href; W.location.search = u.search; } };
  global.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  global.setInterval = (fn, ms) => { intervals.push({ fn: fn, ms: ms, on: true }); return intervals.length; };
  global.clearInterval = (id) => { if (intervals[id - 1]) intervals[id - 1].on = false; };
  global.fetch = fakeFetch;
  /* dc.js's fake clock has no clearTimeout; NET's save cap needs one (as in sc_exec_live.js) */
  const dcSetTimeout = global.setTimeout;
  let tid = 0;
  const cancelled = new Set();
  global.setTimeout = (fn, ms) => { const id = ++tid; dcSetTimeout(() => { if (cancelled.has(id)) { cancelled.delete(id); return; } fn(); }, ms); return id; };
  global.clearTimeout = (id) => { if (id) cancelled.add(id); };
}
prepWindow();
const LIVE_SIM = new Sim(FILE);

/* a fresh page: storage, address and broker as given; the board is constructed and NOT yet mounted */
function page(o) {
  o = o || {};
  const u = new URL('https://celadynestaller.github.io/CeladyneHQ/my_projects.html' + (o.search || ''));
  W.location = { href: u.href, search: u.search, assign() {} };
  const ls = Object.assign({}, o.token === null ? {} : { rd_broker_token: o.token || TOKEN }, o.storage || {});
  if (o.hub) ls.hub_session_v1 = JSON.stringify({ email: o.hub, role: 'user', orgRole: o.role || 'ic', issuedAt: Date.now() - 1000, expiresAt: Date.now() + 8 * 3600000 });
  W.localStorage = makeStore(ls);
  W.sessionStorage = makeStore(o.session || {});
  if (!o.keepBroker) B.reset(o.docs || SAMPLE.docs, o.users || SAMPLE.users);
  intervals.length = 0;
  return new Sim(FILE);
}
async function settle(s, n) {
  for (let i = 0; i < (n || 20); i++) await new Promise((r) => setImmediate(r));
  if (s) s.render();
  return s;
}
async function boot(o) {
  const s = page(o);
  s.c.componentDidMount();
  await settle(s);
  return s;
}
/* run NET's debounced save (and anything else due), then let the broker answer */
async function saveNow(s) { s.flush(3000); await settle(s); s.flush(0); await settle(s); return s; }

const rows = (s) => s.vals.sh.rows.filter((r) => r.isRow);
const row = (s, k) => rows(s).find((r) => r.k === k) || null;
const objIds = (s) => rows(s).filter((r) => /k-obj/.test(r.cls)).map((r) => r.k.slice(2));
const views = (s) => s.vals.sh.views.opts.map((o) => o.on);
const banner = (s) => (s.vals.sh.banner ? s.vals.sh.banner.text : '');
const toasts = (s) => (s.c.state.toasts || []).map((t) => t.text);
const closeSheets = (s) => { s.c.closeAllSheets(); s.render(); return s; };
/* today as the live page counts it: the real date (kit/core.js liveToday) */
function liveToday() { const n = new Date(); return Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(2020, 0, 1)) / 86400000); }
const NOWQ = (() => { const d = new Date(); return d.getFullYear() + 'Q' + (Math.floor(d.getMonth() / 3) + 1); })();
function shiftQ(q, n) { const m = /^(\d{4})Q([1-4])$/.exec(q); const k = Number(m[1]) * 4 + Number(m[2]) - 1 + n; return Math.floor(k / 4) + 'Q' + (k % 4 + 1); }

const STEPS = [];
function step(label, fn) { STEPS.push([label, fn]); }

/* ------------------------------------------------------------------------ 1. construction, the plan, sign-in */
step('constructed with no data: "Loading…", and nothing asked of the broker', async () => {
  const s = page(PRIYA);
  s.eq('loading', [s.c.state.mine_load, s.c.ctx.loaded, s.vals.sh.hasTree], ['loading', false, false]);
  s.eq('the panel says so', s.vals.sh.empty.text, 'Loading…');
  s.ok(!s.has('Save', { tag: 'button' }), 'no Save before the load');
  s.eq('no request before componentDidMount', B.log.length, 0);
  s.clean('before the first load');
});

step('plan: every division’s documents; writes only to EXEC- and BIZ-; no prefs', async () => {
  const s = await boot(PRIYA);
  const got = B.log.filter((x) => x.method === 'GET' && x.id && !x.version).map((x) => x.id);
  const want = ['portfolio', 'EXEC-DIV-FC', 'EXEC-DIV-EL', 'BIZ-DIV-BD', 'BIZ-DIV-PT', 'SPEC-DIV-FC', 'SPEC-DIV-EL'];
  s.eq('roster first', B.log[0].path, '/roster');
  s.eq('documents loaded', got, want);
  s.ok(!B.log.some((x) => /^\/prefs\//.test(x.path)), 'no /prefs: My Projects shows no kanban board');
  const plan = s.c.net.plan;
  s.eq('roster, prefs, autoPass', [plan.roster, plan.prefs, plan.autoPass], [true, false, true]);
  s.eq('docs(P)', plan.docs(s.c.D.portfolio), want.slice(1));
  const ids = ['portfolio', 'EXEC-DIV-EL', 'EXEC-DIV-FC', 'BIZ-DIV-BD', 'BIZ-DIV-PT', 'SPEC-DIV-EL', 'SPEC-DIV-FC'];
  s.eq('writable: the division documents of both apps', ids.map((id) => plan.writable(id)), [false, true, true, true, true, false, false]);
  s.eq('quiet: the specifications', ids.map((id) => !!plan.quiet(id)), [false, false, false, false, false, true, true]);
  s.eq('registered read-only', ['portfolio', 'SPEC-DIV-EL'].map((id) => s.c.net.reg[id] && s.c.net.reg[id].writable), [false, false]);
  s.eq('nothing written on load', B.puts().length, 0);
  s.eq('every request went to the broker with the token', [B.foreign.length, B.log.every((x) => x.auth === 'Bearer ' + TOKEN)], [0, true]);
  s.eq('loaded', [s.c.state.mine_load, s.c.ctx.loaded, s.vals.sh.hasTree, banner(s)], ['ok', true, true, '']);
  s.clean('loaded');
});

step('the Hub sign-in decides whose projects these are', async () => {
  const s = await boot(Object.assign({ search: '?quarter=all' }, PRIYA));
  s.eq('Priya', s.vals.sh.me.name, 'Priya');
  s.eq('her objective in full, Toru’s for her experiments', objIds(s).sort(), [QUAL, LOCK].sort());
  s.eq('just her experiments there', row(s, 'o:' + QUAL).sub, 'Toru’s, Q4 2026. Just your 3 experiments');
  s.eq('no view switch for an IC', s.vals.sh.views.show, false);
  s.click('Settings');
  s.eq('the picker is fixed to the Hub person', [s.vals.sh.settings.hub.fixed, s.vals.sh.settings.hub.value], [true, 'priya@celadyne.com']);
  s.ok(!s.has('Restore the sample data'), 'no sample data to restore');
  s.expect('Build: calm-1 (My Projects).');
  closeSheets(s);
  s.clean('Priya');
});

step('a lead signed in to the Hub gets Owned Projects and Team Projects', async () => {
  const s = await boot(Object.assign({ search: '?quarter=all' }, TORU));
  s.eq('Owned Projects first', views(s), ['true', 'false']);
  s.click('Team Projects');
  s.eq('Team Projects', views(s), ['false', 'true']);
  s.eq('remembered in this browser', W.localStorage.getItem('rd_mine_view'), 'team');
  s.eq('every objective in Electrolyzer', objIds(s).sort(), [QUAL, LOCK, CUT].sort());
  s.eq('switching views writes nothing', B.puts().length, 0);
  s.clean('lead');
});

step('signed out of the Hub: says how to see what is yours, and writes nothing', async () => {
  const s = await boot({});
  s.eq('no tree', s.vals.sh.hasTree, false);
  s.eq('the message', s.vals.sh.empty.text, 'Sign in to the Hub, then reload this page: what is yours comes from your Hub sign-in.');
  s.eq('loaded all the same', s.c.net.loaded, true);
  s.eq('nothing written', B.puts().length, 0);
  s.clean('signed out');
});

/* ------------------------------------------------------------------------ 2. load states */
step('no token: says so and asks for nothing; a token saved in Settings loads', async () => {
  const s = await boot(Object.assign({ token: null }, PRIYA));
  s.eq('no request without a token', B.log.length, 0);
  s.eq('state', s.c.state.mine_load, 'notoken');
  s.eq('the panel', s.vals.sh.empty.text, 'Not loaded. No broker token in this browser yet. Open this page from the Hub or another app, or add the token in Settings.');
  s.eq('the banner', banner(s), 'No broker token in this browser yet. Open this page from the Hub or another app, or add the token in Settings.');
  s.click('Open settings');
  s.expect('No token saved. Nothing loads or saves until you add one.');
  s.click('Save token');
  s.ok(toasts(s).indexOf('Paste the broker token first.') >= 0, 'an empty token is not saved');
  s.type('Broker token', '  ' + TOKEN + '  ');
  s.click('Save token');
  await settle(s);
  s.eq('kept in this browser, trimmed', W.localStorage.getItem('rd_broker_token'), TOKEN);
  s.eq('loaded', [s.c.net.loaded, s.c.state.mine_load, banner(s)], [true, 'ok', '']);
  s.expect('A token is saved in this browser.');
  s.ok(!s.see(TOKEN), 'the token is never shown');
  closeSheets(s);
  s.ok(s.vals.sh.hasTree, 'her projects');
  s.clean('token saved');
});

step('the broker refuses the token (401)', async () => {
  const s = await boot(Object.assign({ token: 'stale' }, PRIYA));
  s.eq('state', s.c.state.mine_load, 'badtoken');
  s.eq('the banner', banner(s), 'The broker didn’t accept the token (401). Check it in Settings.');
  s.eq('the panel', s.vals.sh.empty.text, 'Not loaded. The broker didn’t accept the token; check it in Settings.');
  s.ok(s.has('Open settings'), 'a way to Settings');
  s.clean('401');
});

step('a failed load says so with the status', async () => {
  const s = page(PRIYA);
  B.once({ method: 'GET', path: '/state/portfolio', status: 500 });
  s.c.componentDidMount();
  await settle(s);
  s.eq('the banner', banner(s), 'Load failed (500). Check the token in Settings.');
  s.eq('the panel', s.vals.sh.empty.text, 'Not loaded. The last load failed; check the token in Settings.');
  s.click('Try again');
  await settle(s);
  s.eq('loaded on the second try', [s.c.net.loaded, s.vals.sh.hasTree, banner(s)], [true, true, '']);
  s.clean('failed then loaded');
});

step('offline at load: says so, and Try again loads once the broker answers', async () => {
  let s = page(PRIYA);
  B.once({ method: 'GET', path: '/state/portfolio', offline: true });
  s.c.componentDidMount();
  await settle(s);
  s.eq('the banner', banner(s), 'Couldn’t reach the broker. Check your connection; this page keeps trying.');
  s.eq('the panel', s.vals.sh.empty.text, 'Not loaded. Couldn’t reach the broker; this page keeps trying.');
  s.ok(!s.vals.sh.offline, 'no second offline banner while nothing is loaded');
  s.click('Try again');
  await settle(s, 40);
  s.eq('loaded', [s.c.net.loaded, s.vals.sh.hasTree, banner(s)], [true, true, '']);
  s.clean('offline then loaded');
  /* the kit also tries again by itself */
  s = page(PRIYA);
  B.once({ method: 'GET', path: '/state/portfolio', offline: true });
  s.c.componentDidMount();
  await settle(s);
  s.advance(6000);
  await settle(s, 40);
  s.eq('loaded on its own', [s.c.net.loaded, s.vals.sh.hasTree], [true, true]);
});

step('offline while saving: kept here, said so, and saved when the broker answers', async () => {
  const s = await boot(Object.assign({ search: '?quarter=all' }, PRIYA));
  B.once({ method: 'PUT', path: '/state/' + EL, offline: true });
  s.click('Update KR1, % complete');
  s.type('New value for KR1, in %', '75');
  s.key('New value for KR1, in %', 'Enter');
  await saveNow(s);
  s.eq('offline', [s.c.state.sim.offline, s.c.state.save.state], [true, 'offline']);
  s.expect('You are offline. Changes are kept here and save when you are back online.');
  s.eq('kept on screen', row(s, 'i:' + LOCK + ':kr:' + KR1).btnText, '75%');
  s.click('Settings');
  s.expect('Unsaved changes in 1 document.');
  s.click('Load from the broker');
  s.expect('You are offline with unsaved changes in 1 document. They save when the connection returns; load again after that.');
  closeSheets(s);
  s.click('Try again');
  await settle(s, 40);
  await saveNow(s);
  s.eq('saved once the broker answers', B.doc(EL).keyResults.find((k) => k.id === KR1).progress, 75);
  s.eq('online again', [s.c.state.sim.offline, s.c.state.save.state], [false, 'saved']);
  s.clean('offline save');
});

/* ------------------------------------------------------------------------ 3. check-ins write the objective's own document */
step('a reading posted here saves to the objective’s own document and passes its gate there', async () => {
  const s = await boot(Object.assign({ search: '?quarter=all' }, PRIYA));
  s.click('Expand all');
  const Wk = { within: 'k:' + LOCK + ':' + ICR };
  const etag0 = B.state[EL].etag;
  s.click('Post a reading for Interfacial contact resistance', Wk);
  s.type('New value for Interfacial contact resistance', '9', Wk);
  s.key('New value for Interfacial contact resistance', 'Enter', Wk);
  await saveNow(s);
  const ps = B.puts();
  s.eq('one save, to Electrolyzer’s document', ps.map((x) => x.id), [EL]);
  s.eq('by this client, on the version it loaded', [ps[0] && ps[0].body.client, ps[0] && ps[0].ifMatch], ['calm-1', etag0]);
  const doc = B.doc(EL);
  const u = doc.kpiUpdates[doc.kpiUpdates.length - 1];
  s.eq('the reading, by her', [u.kpiId, u.value, u.by], [ICR, 9, 'priya@celadyne.com']);
  const g = doc.stageGates.find((x) => x.id === 'SG-EL-2026Q4-02-2');
  s.eq('SG-A1 passed on its own, in the same save', [g.actualDate, g.completionMethod], [s.c.D.today, 'auto']);
  s.eq('the portfolio is never written', B.puts('portfolio').length, 0);
  s.eq('saved', s.c.state.save.state, 'saved');
  s.clean('reading saved');
});

step('a business objective’s reading saves to its BIZ- document', async () => {
  const s = await boot(Object.assign({ search: '?quarter=all' }, SAM));
  s.eq('his objectives', objIds(s), [PILOT, HUB]);
  s.click('Expand all');
  const Wk = { within: 'k:' + PILOT + ':' + PIPE };
  s.click('Post a reading for Qualified pipeline value', Wk);
  s.type('New value for Qualified pipeline value', '4', Wk);
  s.key('New value for Qualified pipeline value', 'Enter', Wk);
  await saveNow(s);
  s.eq('one save, to Business Development’s document', B.puts().map((x) => x.id), [BD]);
  const ups = B.doc(BD).kpiUpdates.filter((x) => x.kpiId === PIPE);
  s.eq('the reading, by him', [ups[ups.length - 1].value, ups[ups.length - 1].by], [4, 'sam@celadyne.com']);
  s.clean('business reading');
});

step('a percent key result and a milestone step save together', async () => {
  const s = await boot(Object.assign({ search: '?quarter=all' }, PRIYA));
  s.click('Update KR1, % complete');
  s.type('New value for KR1, in %', '75');
  s.key('New value for KR1, in %', 'Enter');
  s.click('Update Contact resistance screening, % complete');
  s.type('New value for Contact resistance screening, in %', '80');
  s.key('New value for Contact resistance screening, in %', 'Enter');
  await saveNow(s);
  s.eq('one save for both', B.puts().map((x) => x.id), [EL]);
  const doc = B.doc(EL);
  s.eq('both on the broker', [doc.keyResults.find((k) => k.id === KR1).progress, doc.keyResults.find((k) => k.id === KRM1).steps[1].completion], [75, 80]);
  s.clean('progress saved');
});

step('an experiment’s linked key read posts to its KPI, in that document', async () => {
  const s = await boot(Object.assign({ search: '?quarter=all' }, PRIYA));
  const k = rows(s).find((r) => /^r:OBJ-EL-2026Q4-01:t_xover:exp_002:kr_002_1$/.test(r.k));
  s.ok(!!k, 'the linked key read is in view');
  if (!k) return;
  s.click('~Add a reading for', { within: k.k });
  s.type('~Add a reading for', '0.55', { within: k.k });
  s.key('~Add a reading for', 'Enter', { within: k.k });
  await saveNow(s);
  s.eq('saved to Electrolyzer’s document', B.puts().map((x) => x.id), [EL]);
  const ups = B.doc(EL).kpiUpdates.filter((u) => u.kpiId === XOVER);
  s.eq('on the KPI, noted with the experiment', [ups[ups.length - 1].value, ups[ups.length - 1].note], [0.55, 'exp EXP-2']);
  s.clean('key read');
});

step('another editor saved first (412): their version loads and the change has to be made again', async () => {
  const s = await boot(Object.assign({ search: '?quarter=all' }, PRIYA));
  const theirs = B.doc(EL);
  theirs.keyResults.find((k) => k.id === KR1).progress = 64;
  B.put(EL, theirs);                     // saved by someone else; this page hasn't polled yet
  s.click('Update KR1, % complete');
  s.type('New value for KR1, in %', '75');
  s.key('New value for KR1, in %', 'Enter');
  await saveNow(s);
  await settle(s, 40);
  s.eq('one refused save, nothing written over theirs', B.puts().length, 1);
  s.eq('theirs on the broker', B.doc(EL).keyResults.find((k) => k.id === KR1).progress, 64);
  s.eq('theirs on screen', [s.c.D.docs[EL].keyResults.find((k) => k.id === KR1).progress, row(s, 'i:' + LOCK + ':kr:' + KR1).btnText], [64, '64%']);
  s.eq('it says so', banner(s), 'Another editor saved first — reloaded; re-apply your change.');
  s.click('Update KR1, % complete');
  s.type('New value for KR1, in %', '75');
  s.key('New value for KR1, in %', 'Enter');
  await saveNow(s);
  s.eq('made again, it saves', [B.puts().length, B.doc(EL).keyResults.find((k) => k.id === KR1).progress], [2, 75]);
  s.clean('412');
});

step('?readonly: values are text, nothing saves, and Settings can’t turn it off', async () => {
  const s = await boot(Object.assign({ search: '?readonly&quarter=all' }, PRIYA));
  s.eq('read-only', [s.c.isRo(), s.vals.sh.roOn, s.vals.sh.showSave], [true, true, false]);
  s.ok(!s.has('Update KR1, % complete') && !s.has('Post a reading for Interfacial contact resistance'), 'no value buttons');
  s.eq('values as text', row(s, 'i:' + LOCK + ':kr:' + KR1).lineVal, '60%');
  s.ok(/Read-only: values only\.$/.test(s.vals.sh.lede), 'the lede says so');
  s.c.mutate((D) => { D.docs[EL].keyResults[0].progress = 1; });
  await saveNow(s);
  s.eq('nothing written, not even an automatic gate pass', B.puts().length, 0);
  s.click('Settings');
  s.eq('locked by the link', s.vals.sh.settings.roLocked, true);
  s.expect('This page was opened with ?readonly, so it stays read-only. Open it without ?readonly to edit.');
  closeSheets(s);
  s.clean('read-only');
});

/* ------------------------------------------------------------------------ 4. links and parameters */
step('an objective’s title opens it in Execution or Sales, in a new tab, by its id', async () => {
  let s = await boot(Object.assign({ search: '?quarter=all' }, PRIYA));
  const r = row(s, 'o:' + LOCK);
  /* the packaged page names the apps by their files: Main.dc.html becomes execution_app.html (standalone.py) */
  s.eq('to Execution, by the objective', [r.href, r.target, r.rel, r.linkTitle], ['Main.dc.html?objective=' + LOCK, '_blank', 'noopener', 'Open in Execution, in a new tab']);
  const a = s.all('~Lock Tera 25-30-R5 components', { tag: 'a' })[0];
  s.ok(!!a && !a.on.onClick, 'a plain link: nothing is handed over in this tab');
  s.eq('no hand-off left behind', W.sessionStorage.getItem('celadyne-calm-open'), null);
  s = await boot(Object.assign({ search: '?quarter=all' }, SAM));
  s.eq('to Sales', row(s, 'o:' + PILOT).href, 'Sales-A.dc.html?objective=' + PILOT);
  const hub = row(s, 'o:' + HUB);
  s.eq('nothing planned yet: plan it in Sales, in a new tab', [hub.actText, hub.actHref, hub.actTarget, !!hub.actGo], ['Plan it in Sales', 'Sales-A.dc.html?objective=' + HUB, '_blank', false]);
  s.clean('links');
});

step('a header opens its view of the objective in a new tab (risks and experiments: the app on that tab)', async () => {
  let s = await boot(Object.assign({ search: '?quarter=all' }, TORU));
  const L = (k) => { const r = row(s, k); return r ? [r.gHref, r.gTarget, r.gRel, r.gTitle, !!r.gGo] : null; };
  const E = 'Main.dc.html?objective=';
  s.eq('Key results: its view', L('g:' + LOCK + ':kr'), [E + LOCK + '&view=krs', '_blank', 'noopener', 'Open the Key results view in Execution, in a new tab', false]);
  s.eq('Stage-gates', L('g:' + LOCK + ':gate'), [E + LOCK + '&view=gates', '_blank', 'noopener', 'Open the Stage-gates view in Execution, in a new tab', false]);
  s.eq('a workstream: its stage-gates', L('g:' + LOCK + ':gate:ws:SGSET-EL-2026Q4-02-1')[0], E + LOCK + '&view=gates');
  s.eq('Kanban', L('g:' + LOCK + ':tile')[0], E + LOCK + '&view=kanban');
  s.eq('Risks: no view, so the app on its tab', L('g:' + QUAL + ':risk'), [E + QUAL + '&tab=risks', '_blank', 'noopener', 'Open the Risks tab in Execution, in a new tab', false]);
  s.eq('Experiments', L('g:' + QUAL + ':exp')[0], E + QUAL + '&tab=exp');
  const a = s.all('Key results', { tag: 'a', within: 'g:' + LOCK + ':kr' })[0];
  s.ok(!!a && !a.on.onClick, 'a plain link: nothing is handed over in this tab');
  s = await boot(Object.assign({ search: '?quarter=all' }, SAM));
  s.click('Expand Kanban', { within: 'g:' + PILOT + ':tile' });
  s.eq('Sales: a swimlane opens the kanban view', row(s, 'g:' + PILOT + ':tile:lane:BRD-BD-PIPE:lane-ut').gHref, 'Sales-A.dc.html?objective=' + PILOT + '&view=kanban');
  /* a read-only page's links open read-only, as a view page's do */
  s = await boot(Object.assign({ search: '?readonly&quarter=all' }, PRIYA));
  s.eq('read-only links', [row(s, 'o:' + LOCK).href, row(s, 'g:' + LOCK + ':kr').gHref], [E + LOCK + '&readonly', E + LOCK + '&view=krs&readonly']);
  s.eq('no hand-off left behind', W.sessionStorage.getItem('celadyne-calm-open'), null);
  s.clean('header links');
});

step('?view= and ?quarter= apply on the first load', async () => {
  let s = await boot(Object.assign({ search: '?view=team&quarter=all' }, TORU));
  s.eq('Team Projects', views(s), ['false', 'true']);
  s.eq('All quarters', s.vals.sh.qsel.v, '*');
  s.eq('every objective in Electrolyzer', objIds(s).sort(), [QUAL, LOCK, CUT].sort());
  s.eq('a link is not a choice: nothing remembered', W.localStorage.getItem('rd_mine_view'), null);
  s = await boot(Object.assign({ search: '?VIEW=owned', storage: { rd_mine_view: 'team' } }, TORU));
  s.eq('a link wins over the remembered view, in any case', views(s), ['true', 'false']);
  s = await boot(Object.assign({ search: '?quarter=2026Q3' }, ERIN));
  s.eq('one quarter', objIds(s), [HP6]);
  s = await boot(Object.assign({ search: '?view=team&quarter=all' }, PRIYA));
  s.eq('an IC has no team view', [s.vals.sh.views.show, objIds(s).sort()], [false, [QUAL, LOCK].sort()]);
  s = await boot(Object.assign({ search: '?quarter=1999Q1' }, TORU));
  s.eq('a quarter with nothing in it: this quarter and later', s.vals.sh.qsel.v, '');
  s.clean('parameters');
});

step('this quarter and later counts from today’s date', async () => {
  const docs = clone(SAMPLE.docs);
  const today = liveToday();
  Object.assign(docs.portfolio.objectives.find((o) => o.id === LOCK), { quarter: NOWQ, plannedStart: today - 10, plannedEnd: today + 30 });
  Object.assign(docs.portfolio.objectives.find((o) => o.id === QUAL), { quarter: shiftQ(NOWQ, -1), plannedStart: today - 120, plannedEnd: today - 5 });
  const s = await boot(Object.assign({ docs: docs }, PRIYA));
  s.eq('this quarter’s objective; last quarter’s, past its end, is one pick away', objIds(s), [LOCK]);
  s.type('Quarter', '*');
  s.eq('All quarters', objIds(s).sort(), [QUAL, LOCK].sort());
  s.clean('today');
});

step('another editor’s change comes in on the poll', async () => {
  const s = await boot(Object.assign({ search: '?quarter=all' }, PRIYA));
  const theirs = B.doc(EL);
  theirs.keyResults.find((k) => k.id === KR1).progress = 66;
  B.put(EL, theirs);
  const poll = intervals.find((x) => x.on);
  s.ok(!!poll, 'the page polls');
  if (!poll) return;
  poll.fn();
  await settle(s, 40);
  s.eq('their change on screen', row(s, 'i:' + LOCK + ':kr:' + KR1).btnText, '66%');
  s.eq('it says so', banner(s), 'Updated from another editor.');
  s.eq('nothing written', B.puts().length, 0);
  s.clean('poll');
});

/* ------------------------------------------------------------------------ 5. the panel above the tree */
step('the panel: after the load, on the view and quarter of the link; what it does writes nothing', async () => {
  let s = page(TORU);
  s.eq('before the load: no panel, no view or quarter', [s.vals.sh.roll, s.vals.sh.scope, s.has('Quarter', { tag: 'select' })], [null, false, false]);
  s = await boot(Object.assign({ search: '?view=team&quarter=all' }, TORU));
  const R = s.vals.sh.roll;
  s.ok(!!R && s.has((el) => el.attrs['data-k'] === 'roll'), 'the panel shows once loaded');
  if (!R) return;
  s.eq('it counts Team Projects in every quarter', [views(s), R.score.facts[0].value], [['false', 'true'], String(s.c.ctx.entries.filter((e) => e.full).length)]);
  s.eq('the quarter it opens on is this one', R.score.strip.label, NOWQ.replace(/^(\d{4})Q(\d)$/, 'Q$2 $1'));
  s.eq('a row per project and objective on the timeline', R.tl.rows.length, s.c.ctx.groups.length + s.c.ctx.entries.length);
  const stored = JSON.stringify(W.localStorage._m);
  const d = R.score.dots[0];
  s.click(d.title, { tag: 'button' });
  s.ok(objIds(s).length === 1, 'a dot filters the tree');
  s.click('Fold Tera component lock');
  s.eq('a project folds on the timeline', s.vals.sh.roll.tl.rows.find((r) => r.k === 'tlp:INIT-EL-01').caretExp, 'false');
  await saveNow(s);
  s.eq('nothing saved to the broker', B.puts().length, 0);
  s.eq('nothing kept in this browser', JSON.stringify(W.localStorage._m), stored);
  s.clean('live panel');
});

step('the CTO and the CEO: Team Projects over the divisions each chooses, kept in this browser', async () => {
  let s = await boot(Object.assign({ search: '?view=team&quarter=all' }, COREY));
  s.ok(/^R&D divisions: /.test(s.vals.sh.lede), 'the CTO: the R&D divisions by default (' + s.vals.sh.lede.split(':')[0] + ')');
  const R = s.c.D.portfolio.divisions.filter((d) => d.kind !== 'biz').map((d) => d.id);
  s.ok(objIds(s).every((id) => R.indexOf(s.c.D.portfolio.objectives.find((o) => o.id === id).divisionId) >= 0), 'R&D objectives only');
  s.click('Change divisions');
  s.ok(!!(s.vals.sh.settings && s.vals.sh.settings.team), 'his choice, in Settings');
  s.check('~Every division', true, { within: 'team-scope' });
  closeSheets(s);
  s.ok(/^Every division: /.test(s.vals.sh.lede), 'every division, once chosen');
  await saveNow(s);
  s.eq('kept in this browser, for him', JSON.parse(W.localStorage.getItem('rd_mine_team') || '{}'), { 'corey@celadyne.com': { mode: 'all' } });
  s.eq('nothing sent to the broker', [B.puts().length, B.log.filter((x) => /^\/prefs\//.test(x.path)).length], [0, 0]);
  s = await boot(Object.assign({ search: '?view=team&quarter=all', storage: { rd_mine_team: W.localStorage.getItem('rd_mine_team') } }, DANA));
  s.ok(/^Business divisions: /.test(s.vals.sh.lede), 'the CEO in the same browser: her own default, the business divisions');
  s.clean('CEO and CTO choice');
});

/* ------------------------------------------------------------------------ 6. Group by, Sort by and pace (October 22) */
step('Group by and Sort by: kept in this browser, nothing to the broker; the panel on today’s clock', async () => {
  let s = await boot(Object.assign({ search: '?view=team&quarter=all' }, TORU));
  const gsBtn = () => s.find((el) => el.attrs['data-k'] === 'group-sort');
  s.eq('Group and sort beside the quarter, untinted', [gsBtn().attrs.class, gsBtn().attrs['aria-expanded']], ['btn mine-gsbtn', 'false']);
  s.click('Group and sort');
  s.type('Group by', 'quarter', { within: 'group-sort-pop' });
  s.type('Add a grouping level', 'project', { within: 'group-sort-pop' });
  s.type('Sort by', 'score', { within: 'group-sort-pop' });
  s.eq('still open after three changes; the button tinted and named', [s.c.state.menu, gsBtn().attrs.class, gsBtn().attrs['aria-label']], ['mine.gs', 'btn mine-gsbtn on', 'Group and sort: Grouped by quarter, then project, lowest score first.']);
  s.key((el) => el.attrs['data-k'] === 'group-sort-pop', 'Escape');
  const seq = () => s.vals.sh.rows.filter((r) => r.isRow && /k-(set|proj|obj)/.test(r.cls)).map((r) => r.k);
  const tl = () => s.vals.sh.roll.tl.rows.map((r) => r.k.replace(/^tlp:/, 'p:').replace(/^tlo:/, 'o:'));
  s.eq('quarters, then projects, in the timeline and the tree alike', [seq()[0].slice(0, 12), tl()], ['p:quarter:20', seq()]);
  await saveNow(s);
  s.eq('kept in this browser', JSON.parse(W.localStorage.getItem('rd_mine_arrange') || 'null'), { gb: ['quarter', 'project'], sort: 'score' });
  s.eq('nothing sent to the broker', [B.puts().length, B.log.filter((x) => /^\/prefs\//.test(x.path)).length], [0, 0]);
  s = await boot(Object.assign({ search: '?view=team&quarter=all', storage: { rd_mine_arrange: W.localStorage.getItem('rd_mine_arrange') } }, TORU));
  s.eq('a new page in this browser keeps it, tinted, closed', [s.c.state.mine_gb, s.c.state.mine_sort, gsBtn().attrs.class, s.c.state.menu || ''], [['quarter', 'project'], 'score', 'btn mine-gsbtn on', '']);
  /* the mark: the time elapsed in this quarter on the page's own clock (the real date) */
  const m = /^(\d{4})Q([1-4])$/.exec(NOWQ), y = +m[1], n = +m[2];
  const q0 = Math.round((Date.UTC(y, (n - 1) * 3, 1) - Date.UTC(2020, 0, 1)) / 86400000), q1 = Math.round((Date.UTC(y, n * 3, 1) - Date.UTC(2020, 0, 1)) / 86400000) - 1;
  const e = Math.max(0, Math.min(1, (liveToday() - q0) / (q1 - q0))) * 100;
  const R = s.vals.sh.roll.score;
  s.eq('the mark at the time elapsed today', [R.mark.label, R.mark.style], [Math.round(e) + '% elapsed', 'left: ' + e.toFixed(1) + '%']);
  s.clean('live arrange');
});

if (require.main === module) {
  (async function run() {
    for (const [label, fn] of STEPS) {
      try { await fn(); } catch (e) { LIVE_SIM.ok(false, 'step "' + label + '": ' + String((e && e.stack) || e).split('\n').slice(0, 6).join('\n     ')); }
    }
    LIVE_SIM.eq('no request ever left for another address', B.foreign, []);
    done();
  })();
}
