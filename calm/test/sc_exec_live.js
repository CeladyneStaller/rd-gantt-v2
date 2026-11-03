/* Live-build scenarios for the Execution / Sales shell (apps/exec/*, LIVE.md).
     node test/sc_exec_live.js                              builds both live boards into out/live, runs both
     node test/sc_exec_live.js out/live/Main.dc.html        one board you built yourself:
     node test/sc_exec_live.js out/live/Sales-A.dc.html       python3 build.py exec sales --flag=live --out=out/live
   Nothing here touches the network: before any board code runs, `fetch` (on the global and on the board's
   window) is replaced by an in-memory broker that speaks today's contract (GET/PUT /state/<id> with etags and
   If-Match, GET /state/<id>/version, GET /roster, GET|PATCH /prefs/<email>, GET /analysis) and refuses any
   other address. Its documents are the shared sample (data/sample.js plus every seed, evaluated here with a
   separate engine copy), so the module UIs the scenarios click behave as in the sample harness.
   The board boots through componentDidMount (NET.boot); `settle()` lets the broker's promises resolve, and
   dc.js's fake timers (s.advance / s.flush) run NET's save debounce, its load retries and the toasts. */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
/* the Python that runs the build: RD_PYTHON (sweep.py and build.py --check set it), else `python` on Windows (python.org
   installs no python3 there) and `python3` elsewhere */
const PY = process.env.RD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

const ROOT = path.join(__dirname, '..');

/* no board given (test/run_all.js runs it this way): build both live boards, then run this file on each */
if (require.main === module && !process.argv[2]) {
  let pass = 0, fail = 0;
  try {
    execFileSync(PY, ['build.py', 'exec', 'sales', '--flag=live', '--out=out/live'], { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    console.log('FAIL live build: ' + String((e.stdout || '') + (e.stderr || '') || e.message).trim().split('\n').slice(-3).join(' | '));
    fail++;
  }
  if (!fail) {
    ['Main.dc.html', 'Sales-A.dc.html'].forEach((b) => {
      const r = spawnSync(process.execPath, [__filename, path.join('out', 'live', b)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
      const lines = String((r.stdout || '') + (r.stderr || '')).trim().split('\n');
      const m = /(\d+) passed, (\d+) failed/.exec(lines[lines.length - 1] || '');
      lines.slice(0, -1).forEach((l) => console.log(l));
      if (m) { pass += Number(m[1]); fail += Number(m[2]); console.log('ok   ' + b + ': ' + m[0]); } else { fail++; console.log('FAIL ' + b + ': no result (exit ' + r.status + ')'); }
    });
  }
  console.log(pass + ' passed, ' + fail + ' failed');
  if (fail) process.exitCode = 1;
  return;   // a CommonJS module may return at the top level: the single-board scenarios below are not run here
}

const { Sim, load, done, textOf } = require('./dc');
const FILE = process.argv[2] || 'out/live/Main.dc.html';
const BROKER = 'https://web-production-b17a2.up.railway.app';
const TOKEN = 'tok-live-1';

/* ------------------------------------------------------------------ the in-memory broker */
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
function reply(status, data) {
  return { status: status, ok: status >= 200 && status < 300, json: () => (data === undefined ? Promise.reject(new SyntaxError('no body')) : Promise.resolve(clone(data))) };
}
const B = {
  token: TOKEN, seq: 0, state: {}, users: [], prefs: {}, analysis: { schema: 2, runs: [] }, log: [], rules: [], foreign: [],
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
  gets(id) { return this.log.filter((x) => x.method === 'GET' && x.id === id); },
  /* a one-off answer for the next matching call: { method, path, status | offline, before() } */
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
    const entry = { method: method, path: p, id: m ? m[1] : '', version: !!(m && m[2]), ifMatch: h['If-Match'], auth: h.Authorization, body: body, n: this.log.length };
    this.log.push(entry);
    for (let i = 0; i < this.rules.length; i++) {
      const r = this.rules[i];
      if (r.method !== method || r.path !== p) continue;
      if (r.once) this.rules.splice(i, 1);
      if (r.before) r.before();
      if (r.offline) return Promise.reject(new TypeError('Failed to fetch'));
      if (r.status) return Promise.resolve(reply(r.status, { error: 'injected ' + r.status }));
      break;
    }
    if (h.Authorization !== 'Bearer ' + this.token) return Promise.resolve(reply(401, { error: 'unauthorized' }));
    if (m) {
      const id = m[1];
      const cur = this.state[id];
      if (method === 'GET' && m[2]) return Promise.resolve(cur ? reply(200, { version: cur.version, etag: cur.etag }) : reply(404, { error: 'not found' }));
      if (method === 'GET') return Promise.resolve(cur ? reply(200, { doc: cur.doc, etag: cur.etag, version: cur.version }) : reply(404, { error: 'not found' }));
      if (method === 'PUT') {
        const want = cur ? cur.etag : '0';
        if (String(h['If-Match']) !== want) return Promise.resolve(reply(412, { error: 'precondition failed' }));
        const nv = this.put(id, body && body.doc);
        return Promise.resolve(reply(200, { etag: nv.etag, version: nv.version }));
      }
    }
    if (p === '/roster' && method === 'GET') return Promise.resolve(reply(200, { users: this.users }));
    if (p === '/analysis' && method === 'GET') return Promise.resolve(reply(200, this.analysis));
    const pm = /^\/prefs\/(.+)$/.exec(p);
    if (pm && method === 'GET') return Promise.resolve(reply(200, { prefs: this.prefs[pm[1]] || { kbDone: {} } }));
    if (pm && method === 'PATCH') {
      const cur = this.prefs[pm[1]] || { kbDone: {} };
      Object.keys((body && body.kbDone) || {}).forEach((k) => { if (body.kbDone[k] == null) delete cur.kbDone[k]; else cur.kbDone[k] = body.kbDone[k]; });
      this.prefs[pm[1]] = cur;
      return Promise.resolve(reply(200, { prefs: cur }));
    }
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
  return { docs: docs, users: S.roster.users, RD: RD };
}
const SAMPLE = sampleDocs();
const RD = SAMPLE.RD;

/* ------------------------------------------------------------------ the page around the board */
let W = null;          // the board's window (dc.js makes a new one per board file)
const listeners = {};
const intervals = [];
const navigated = [];
function makeStore(init) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}
function prepWindow() {
  load(FILE);                       // parses and evaluates the board once (dc.js installs its globals here)
  W = global.window;
  W.fetch = fakeFetch;
  W.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
  W.removeEventListener = (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); };
  W.history = { state: null, replaceState(st, t, url) { const u = new URL(url, W.location.href); W.location.href = u.href; W.location.search = u.search; } };
  global.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  global.setInterval = (fn, ms) => { intervals.push({ fn: fn, ms: ms, on: true }); return intervals.length; };
  global.clearInterval = (id) => { if (intervals[id - 1]) intervals[id - 1].on = false; };
  global.fetch = fakeFetch;
  /* dc.js's fake clock has no clearTimeout (a no-op), so NET's 2.5 s save cap would re-send a save that a
     browser cancels; ids and cancelling are layered on top of dc.js's timers here */
  const dcSetTimeout = global.setTimeout;
  let tid = 0;
  const cancelled = new Set();
  global.setTimeout = (fn, ms) => { const id = ++tid; dcSetTimeout(() => { if (cancelled.has(id)) { cancelled.delete(id); return; } fn(); }, ms); return id; };
  global.clearTimeout = (id) => { if (id) cancelled.add(id); };
}
prepWindow();
const LIVE_SIM = new Sim(FILE);
const APPNAME = LIVE_SIM.c.APP;
const SALES = APPNAME === 'sales';

/* a fresh page: storage, address and broker as given; the board is constructed and NOT yet mounted */
function page(o) {
  o = o || {};
  const href = 'https://celadynestaller.github.io/CeladyneHQ/' + (SALES ? 'sales_app.html' : 'execution_app.html') + (o.search || '');
  const u = new URL(href);
  W.location = { href: u.href, search: u.search, assign(url) { navigated.push(String(url)); } };
  const ls = Object.assign({}, o.token === null ? {} : { rd_broker_token: o.token || TOKEN }, o.storage || {});
  if (o.hub) ls.hub_session_v1 = JSON.stringify({ email: o.hub, role: 'user', orgRole: o.role || 'cto', issuedAt: Date.now() - 1000, expiresAt: Date.now() + 8 * 3600000 });
  W.localStorage = makeStore(ls);
  W.sessionStorage = makeStore(o.session || {});
  if (!o.keepBroker) B.reset(o.docs || SAMPLE.docs, o.users || SAMPLE.users);
  intervals.length = 0;
  navigated.length = 0;
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

const toasts = (s) => (s.c.state.toasts || []).map((t) => t.text);
const hasToast = (s, t) => s.ok(toasts(s).indexOf(t) >= 0, 'toast: ' + t + ' (got ' + JSON.stringify(toasts(s)) + ')');
const banner = (s) => (s.vals.sh.banner ? s.vals.sh.banner.text : '');
const detail = (s) => (s.vals.sh.banner ? s.vals.sh.banner.detail : '');
const settings = (s) => { s.click('Settings'); return s; };
const closeSheets = (s) => { s.c.closeAllSheets(); s.render(); return s; };
const day = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(2020, 0, 1)) / 86400000);
const sel = (s) => [s.c.ctx.divId, s.c.ctx.objId];
const PICKER = SALES ? 'Choose a business division' : 'Choose an R&D division';
const pickDivision = (s, name) => { s.click(PICKER); s.click('~' + name, { within: 'Divisions' }); return s; };
const quarterOf = (id) => ((SAMPLE.docs.portfolio.objectives || []).find((o) => o.id === id) || {}).quarter || '';
/* the quarter the left panel opens on when nothing asks for one (shellAutoQuarter): the current quarter when
   the division's list (narrowed to an owner, if any) has objectives in it, else every quarter */
function autoQuarter(s, divId, owner) {
  const now = s.ns.F.qOfDay(s.c.D.today);
  const key = String(owner || '').trim().toLowerCase();
  return s.c.D.portfolio.objectives.some((o) => o.divisionId === divId && o.quarter === now && (!key || RD.ownersOf(o).some((v) => String(v).trim().toLowerCase() === key))) ? now : '';
}
/* the sample with its quarters moved so that its Q4 2026 is the quarter the clock is in now (the page's today is
   the real date), so these scenarios mean the same on any day; `move` puts a division's objectives elsewhere */
const NOWQ = (() => { const d = new Date(); return d.getFullYear() + 'Q' + (Math.floor(d.getMonth() / 3) + 1); })();
function shiftQ(q, n) { const m = /^(\d{4})Q([1-4])$/.exec(q); const k = Number(m[1]) * 4 + Number(m[2]) - 1 + n; return Math.floor(k / 4) + 'Q' + (k % 4 + 1); }
function docsNow(move) {
  const docs = clone(SAMPLE.docs);
  const map = { '2026Q3': shiftQ(NOWQ, -1), '2026Q4': NOWQ, '2027Q1': shiftQ(NOWQ, 1) };
  docs.portfolio.objectives.forEach((o) => { if (map[o.quarter]) o.quarter = map[o.quarter]; if (move && move[o.divisionId]) o.quarter = move[o.divisionId]; });
  return docs;
}
const NEXT_OBJ = SALES ? 'OBJ-BD-2027Q1-01' : 'OBJ-FC-2027Q1-01';   // the sample's Q1 2027: next quarter in docsNow()
const ED = { within: 'Editor' };
const rx = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const POST = (name) => new RegExp('post a reading for ' + rx(name) + '$', 'i');

/* the two apps' sample facts */
const K_ = SALES ? {
  key: 'BIZ-DIV-BD', other: 'BIZ-DIV-PT', first: 'DIV-BD', firstName: 'Business Development', second: 'DIV-PT', secondName: 'Partnerships',
  objA: 'OBJ-BD-2026Q4-01', objADiv: 'DIV-BD', objB: 'OBJ-BD-2027Q1-01', objBDiv: 'DIV-BD', wrongDiv: 'DIV-EL', wrongObj: 'OBJ-EL-2026Q4-01',
  owner: 'SAM@celadyne.com ', ownerDiv: 'DIV-BD', ownerObjs: ['OBJ-BD-2026Q4-01', 'OBJ-BD-2027Q1-01'], word: 'business',
  kpiName: 'Qualified pipeline value', kpiValue: '4', kpiId: 'KPI-BD-2026Q4-01-2-1'
} : {
  key: 'EXEC-DIV-EL', other: 'EXEC-DIV-FC', first: 'DIV-FC', firstName: 'Fuel Cell', second: 'DIV-EL', secondName: 'Electrolyzer',
  objA: 'OBJ-EL-2026Q4-01', objADiv: 'DIV-EL', objB: 'OBJ-FC-2026Q4-02', objBDiv: 'DIV-FC', wrongDiv: 'DIV-BD', wrongObj: 'OBJ-BD-2026Q4-01',
  owner: 'MAYA@celadyne.com ', ownerDiv: 'DIV-FC', ownerObjs: ['OBJ-FC-2026Q4-02', 'OBJ-FC-2026Q4-03'], word: 'R&D',
  kpiName: 'H₂ in O₂', kpiValue: '1.25', kpiId: 'KPI-EL-2026Q4-01-3-1'
};
const OWN_DOCS = SALES ? ['BIZ-DIV-BD', 'BIZ-DIV-PT'] : ['EXEC-DIV-FC', 'EXEC-DIV-EL'];
/* the other app's documents: loaded read-only since October 19, so a pulled KPI can reach any objective */
const OTHER_DOCS = SALES ? ['EXEC-DIV-FC', 'EXEC-DIV-EL'] : ['BIZ-DIV-BD', 'BIZ-DIV-PT'];
/* Sales opens on All divisions (decided October 16) and remembers no division: rd_division is Execution's
   (and Product spec's), so Sales neither reads nor writes it */
const LOADED_FIRST = SALES ? 'Loaded all business divisions.' : 'Loaded ' + K_.firstName + '.';
const remembered = () => W.localStorage.getItem('rd_division');
const REMEMBER = (id) => (SALES ? null : id);

/* async steps, reported like dc.js's s.step */
const STEPS = [];
function step(label, fn) { STEPS.push([label, fn]); }

/* ------------------------------------------------------------------------ 1. construction and the plan */
step('constructed with no data: nothing picked, no hand-off taken, "Loading…"', async () => {
  const s = page({ session: { 'celadyne-calm-open': JSON.stringify({ app: APPNAME, objective: K_.objB }) } });
  s.eq('state before the load', [s.c.state.sh_load, s.c.state.divId, s.c.state.objId, s.c.ctx.loaded], ['loading', '', '', false]);
  s.ok(!!W.sessionStorage.getItem('celadyne-calm-open'), 'the hand-off waits for the load');
  s.expect('Loading…');
  s.ok(s.has('Loading…', { within: 'Objectives' }), 'sidebar says Loading…');
  s.ok(!s.has('Save', { tag: 'button' }) && !s.has(SALES ? 'Choose a business division' : 'Choose an R&D division'), 'no Save, no picker');
  s.clean('before the first load');
  s.eq('no request before componentDidMount', B.log.length, 0);
});

step('plan: what each app loads and may write', async () => {
  const s = await boot({});
  const got = B.log.filter((x) => x.method === 'GET' && x.id && !x.version).map((x) => x.id);
  const want = ['portfolio'].concat(OWN_DOCS, OTHER_DOCS, ['SPEC-DIV-FC', 'SPEC-DIV-EL']);
  s.eq('roster first', B.log[0].path, '/roster');
  s.eq('documents loaded', got, want);
  const plan = s.c.net.plan;
  s.eq('roster, prefs, autoPass', [plan.roster, plan.prefs, plan.autoPass], [true, true, true]);
  s.eq('docs(P)', plan.docs(s.c.D.portfolio), want.slice(1));
  const ids = ['portfolio', 'EXEC-DIV-EL', 'EXEC-DIV-FC', 'BIZ-DIV-BD', 'BIZ-DIV-PT', 'SPEC-DIV-EL', 'SPEC-DIV-FC'];
  s.eq('writable', ids.map((id) => plan.writable(id)), SALES ? [true, false, false, true, true, false, false] : [true, true, true, false, false, false, false]);
  s.eq('quiet: the other app\'s documents', ids.map((id) => !!(plan.quiet && plan.quiet(id))), SALES ? [false, true, true, false, false, false, false] : [false, false, false, true, true, false, false]);
  s.eq('registered read-only', OTHER_DOCS.map((id) => s.c.net.reg[id] && s.c.net.reg[id].writable), [false, false]);
  s.eq('nothing written on load', B.puts().length, 0);
  const info = s.ns.NET.info(s.c);
  s.eq('NET.info', [info.loaded, info.offline, info.pending, info.hasToken, info.docs.slice().sort()], [true, false, 0, true, want.slice().sort()]);
  s.eq('every request went to the broker with the token', [B.foreign.length, B.log.every((x) => x.auth === 'Bearer ' + TOKEN)], [0, true]);
  s.eq('first division, first objective', s.c.ctx.divId, K_.first);
  s.ok(!!s.c.ctx.objId || !s.c.ctx.allObjs.length, 'an objective is selected when there is one');
  s.eq('Sales: All divisions', [s.c.state.divAll, s.c.ctx.all], [SALES, SALES]);
  s.eq('remembered', remembered(), REMEMBER(K_.first));
  hasToast(s, LOADED_FIRST);
  s.eq('no banner', banner(s), '');
  s.eq('loaded state', [s.c.state.sh_load, s.c.ctx.loaded], ['ok', true]);
  s.clean('loaded');
});

step('signed in through the Hub: roster names, prefs pulled', async () => {
  const s = await boot({ hub: 'corey@celadyne.com', role: 'cto' });
  s.ok(B.log.some((x) => x.method === 'GET' && x.path === '/prefs/corey@celadyne.com'), 'GET /prefs/<email>');
  s.eq('me', s.vals.sh.me.name, 'Corey');
  s.clean('signed in');
});

/* ------------------------------------------------------------------------ 2. load states */
step('no token: says so; saving one in Settings loads', async () => {
  const s = await boot({ token: null });
  s.eq('no request without a token', B.log.length, 0);
  s.eq('state', s.c.state.sh_load, 'notoken');
  s.eq('banner', banner(s), 'No broker token in this browser yet. Open this app from the Hub, or add the token in Settings.');
  s.expect('Not loaded. No broker token in this browser yet. Open this app from the Hub, or add the token in Settings.');
  s.ok(s.has('Not loaded.', { within: 'Objectives' }), 'sidebar says Not loaded.');
  s.clean('no token');
  s.click('Open settings');
  s.expect('No token saved. Nothing loads or saves until you add one.');
  s.expect('Not loaded');
  s.type('Broker token', '  ' + TOKEN + '  ');
  s.click('Save token');
  hasToast(s, 'Token saved.');
  await settle(s);
  s.eq('kept in this browser, trimmed', W.localStorage.getItem('rd_broker_token'), TOKEN);
  s.eq('loaded', [s.c.net.loaded, s.c.state.sh_load, banner(s)], [true, 'ok', '']);
  hasToast(s, LOADED_FIRST);
  s.eq('the field is empty again', s.vals.sh.settings.tokenDraft, '');
  s.ok(!s.text.includes(TOKEN), 'the token is never on screen');
  s.expect('A token is saved in this browser.');
  s.expect('Connected');
  s.clean('after saving the token');
});

step('a refused token, a missing portfolio, a server error', async () => {
  let s = await boot({ token: 'not-the-token' });
  s.eq('401', [s.c.state.sh_load, banner(s), s.vals.sh.banner.cls], ['badtoken', 'The broker didn’t accept the token (401). Check it in Settings.', 'banner t-bad']);
  s.expect('Not loaded. The broker didn’t accept the token; check it in Settings.');
  s.click('Open settings');
  s.eq('settings from the empty state', s.c.sheet().kind, 'shell.settings');
  s.clean('401');

  const noP = Object.assign({}, SAMPLE.docs);
  delete noP.portfolio;
  s = await boot({ docs: noP });
  s.eq('no portfolio', [s.c.state.sh_load, banner(s)], ['noportfolio', 'No portfolio doc on the broker yet — create it from the Planning app first.']);
  s.expect('Not loaded. There is no portfolio on the broker yet; create it from the Planning app first.');
  s.ok(s.has('Open Planning'), 'Open Planning');
  B.put('portfolio', SAMPLE.docs.portfolio);
  s.click('Try again');
  await settle(s);
  s.eq('loaded after Try again', [s.c.state.sh_load, banner(s)], ['ok', '']);
  hasToast(s, LOADED_FIRST);

  s = page({});
  B.once({ method: 'GET', path: '/state/portfolio', status: 500 });
  s.c.componentDidMount();
  await settle(s);
  s.eq('500', [s.c.state.sh_load, banner(s)], ['fail', 'Load failed (500). Check the token in Settings.']);
  s.expect('Not loaded. The last load failed; check the token in Settings.');
  s.click('Dismiss message');
  s.eq('dismissed', s.c.state.sh_banner, null);
  s.click('Try again');
  await settle(s);
  s.eq('loaded', s.c.state.sh_load, 'ok');
  s.clean('after a failed load');
});

step('no division of this app\'s kind yet', async () => {
  const docs = Object.assign({}, SAMPLE.docs);
  const P = clone(docs.portfolio);
  P.divisions = P.divisions.filter((d) => (SALES ? RD.divisionKind(d) !== 'biz' : RD.divisionKind(d) === 'biz'));
  docs.portfolio = P;
  const s = await boot({ docs: docs });
  s.eq('loaded, nothing to show', [s.c.net.loaded, s.c.state.sh_load, s.c.ctx.divId], [true, 'ok', '']);
  s.eq('banner', banner(s), SALES ? 'No business (kind=biz) divisions yet — add one in the Planning app.' : 'No R&D (kind=rd) divisions yet — add one in the Planning app.');
  s.expect(SALES ? 'No business divisions yet. Add one in the Planning app.' : 'No R&D divisions yet. Add one in the Planning app.');
  s.ok(!toasts(s).some((t) => /^Loaded /.test(t)), 'no Loaded toast');
  s.eq('own documents not asked for', B.log.filter((x) => OWN_DOCS.indexOf(x.id) >= 0).length, 0);
  s.clean('no divisions');
});

step('the broker unreachable: says so and keeps trying', async () => {
  const s = page({});
  B.once({ method: 'GET', path: '/state/portfolio', offline: true });
  s.c.componentDidMount();
  await settle(s);
  s.eq('offline', [s.c.state.sh_load, banner(s), s.vals.sh.banner.cls], ['offline', 'Couldn’t reach the broker. Check your connection; this page keeps trying.', 'banner t-warn']);
  s.expect('Not loaded. Couldn’t reach the broker; this page keeps trying.');
  s.ok(!s.vals.sh.offline, 'no second offline banner while nothing is loaded');
  s.clean('offline load');
  /* NET tries again by itself (5 s, then longer); the shell only shows the states */
  const n = B.gets('portfolio').length;
  s.advance(4000);
  await settle(s);
  s.eq('not yet', B.gets('portfolio').length, n);
  s.advance(2000);
  await settle(s);
  s.eq('tried again', B.gets('portfolio').length, n + 1);
  s.eq('loaded', [s.c.net.loaded, s.c.state.sh_load, banner(s)], [true, 'ok', '']);
  hasToast(s, LOADED_FIRST);
});

/* ------------------------------------------------------------------------ 3. page parameters (first load) */
step('?objective= opens in its own division, over ?division=', async () => {
  const s = await boot({ search: '?division=' + K_.second + '&objective=' + K_.objA });
  s.eq('selection', sel(s), [K_.objADiv, K_.objA]);
  s.eq('a link naming a division lists one division (Sales too)', s.c.state.divAll, false);
  s.eq('remembered', remembered(), REMEMBER(K_.objADiv));
  s.eq('a plain link has no message', banner(s), '');
  s.eq('filters: the objective\'s own quarter, chosen by the page', [s.c.state.fQuarter, s.c.state.sh_qAuto, s.c.state.fProduct, s.c.state.fOwner], [quarterOf(K_.objA), true, '', '']);
  s.clean('objective link');
});

step('filters that would hide the objective are dropped, and said so', async () => {
  const s = await boot({ search: '?quarter=2026Q3&objective=' + K_.objB });
  s.eq('objective opened', sel(s), [K_.objBDiv, K_.objB]);
  s.eq('quarter dropped', s.c.state.fQuarter, '');
  s.eq('banner', banner(s), 'Opened the link.');
  s.ok(/dropped because they would hide|No objectives here are in Q3 2026/.test(detail(s)), 'explained: ' + detail(s));
});

step('?quarter=active is the current quarter', async () => {
  const s = await boot({ search: '?division=' + K_.first + '&quarter=active' });
  const q = s.ns.F.qOfDay(s.c.D.today);
  const has = s.c.D.portfolio.objectives.some((o) => o.divisionId === K_.first && o.quarter === q);
  s.eq('quarter', s.c.state.fQuarter, has ? q : '');
  if (!has) s.ok(/No objectives here are in/.test(detail(s)), 'explained');
});

step('unknown objective, wrong-kind division, unknown division', async () => {
  let s = await boot({ search: '?objective=OBJ-NOPE-1', storage: { rd_division: K_.second } });
  s.eq('remembered division (Sales: All divisions)', [s.c.ctx.divId, s.c.state.divAll], SALES ? [K_.first, true] : [K_.second, false]);
  s.ok(/There is no objective OBJ-NOPE-1, so the link opened without one\./.test(detail(s)), 'explained');
  s = await boot({ search: '?objective=' + K_.wrongObj + '&division=' + K_.objADiv });
  s.eq('division from ?division=', s.c.ctx.divId, K_.objADiv);
  s.ok(new RegExp(K_.wrongObj + ' belongs to .*, which isn\'t a ' + rx(K_.word) + ' division for this app\\.').test(detail(s)), 'foreign objective explained: ' + detail(s));
  s = await boot({ search: '?division=' + K_.wrongDiv, storage: { rd_division: K_.second } });
  s.eq('wrong kind: the first division (not the remembered one, like today; Sales: All divisions)', [s.c.ctx.divId, s.c.state.divAll], [K_.first, SALES]);
  hasToast(s, 'That division isn\'t a ' + K_.word + ' division for this app.');
  s = await boot({ search: '?division=DIV-ZZ' });
  s.eq('unknown: the first division (Sales: All divisions)', [s.c.ctx.divId, s.c.state.divAll], [K_.first, SALES]);
  s.ok(/There is no division DIV-ZZ\./.test(detail(s)), 'explained');
  s.clean('odd links');
});

step('?owner= and ?product=', async () => {
  let s = await boot({ search: '?division=' + K_.ownerDiv + '&owner=' + encodeURIComponent(K_.owner) });
  s.eq('owner filter, case-insensitive', s.c.state.fOwner, K_.owner.trim().toLowerCase());
  const oq = autoQuarter(s, K_.ownerDiv, K_.owner);
  s.eq('their objectives only, in the quarter the page opens on', s.c.ctx.objs.map((o) => o.id), K_.ownerObjs.filter((id) => !oq || quarterOf(id) === oq));
  s.ok(/Only objectives owned by /.test(detail(s)), 'said so');
  s.click('Clear the owner filter');
  s.eq('cleared', s.c.state.fOwner, '');
  if (!SALES) {
    s = await boot({ search: '?division=DIV-FC&product=PRD-FC-1' });
    s.eq('product filter', s.c.state.fProduct, 'PRD-FC-1');
  }
});

step('?readonly (NET) and ?token= (NET) with a link', async () => {
  let s = await boot({ search: '?readonly&objective=' + K_.objA });
  s.eq('read-only, at the objective', [s.c.state.ro, s.c.ctx.objId], [true, K_.objA]);
  s.ok(s.has('Read-only'), 'pill');
  s.vals.sh.head.openEnd();
  s.render();
  hasToast(s, 'Read-only view — editing is disabled.');
  settings(s);
  const cb = s.find('Preview the read-only view', { tag: 'input' });
  s.eq('the preview is locked on, as today\'s ?readonly is fixed', [cb.attrs.checked, cb.attrs.disabled], [true, true]);
  s.expect('This page was opened with ?readonly, so it stays read-only. Open it without ?readonly to edit.');
  s.check('Preview the read-only view', false);
  s.eq('still read-only', s.c.state.ro, true);
  closeSheets(s);
  await saveNow(s);
  s.eq('nothing written in read-only', B.puts().length, 0);
  s = await boot({ token: null, search: '?token=' + TOKEN + '&objective=' + K_.objA });
  s.eq('token taken', W.localStorage.getItem('rd_broker_token'), TOKEN);
  s.ok(W.location.href.indexOf('token') < 0, 'removed from the address bar: ' + W.location.href);
  s.eq('loaded at the objective', [s.c.net.loaded, s.c.ctx.objId], [true, K_.objA]);
});

step('the parameters wait for the first load that succeeds', async () => {
  const s = await boot({ token: null, search: '?objective=' + K_.objB });
  s.eq('nothing yet', s.c.state.sh_load, 'notoken');
  settings(s);
  s.type('Broker token', TOKEN);
  s.click('Save token');
  await settle(s);
  s.eq('the link applied on the first good load', sel(s), [K_.objBDiv, K_.objB]);
  s.eq('remembered', remembered(), REMEMBER(K_.objBDiv));
});

/* ------------------------------------------------------------------------ 4. without parameters */
step('the hand-off from another app, else the remembered division', async () => {
  let s = await boot({ session: { 'celadyne-calm-open': JSON.stringify({ app: APPNAME, objective: K_.objB, tab: 'risks' }) } });
  s.eq('opened at the hand-off', [s.c.ctx.divId, s.c.ctx.objId, s.c.state.tab], [K_.objBDiv, K_.objB, 'risks']);
  s.eq('taken once', W.sessionStorage.getItem('celadyne-calm-open'), null);
  s.eq('remembered', remembered(), REMEMBER(K_.objBDiv));
  s.eq('Sales: still All divisions', s.c.state.divAll, SALES);
  s = await boot({ session: { 'celadyne-calm-open': JSON.stringify({ app: APPNAME, division: K_.second }) } });
  s.eq('a hand-off naming only a division opens it alone', [s.c.ctx.divId, s.c.state.divAll], [K_.second, false]);
  s = await boot({ session: { 'celadyne-calm-open': JSON.stringify({ app: APPNAME, objective: K_.objB, tab: 'tasks' }) } });
  s.eq('a hand-off to the Tasks tab (removed October 15) opens the Overview', [s.c.ctx.objId, s.c.state.tab], [K_.objB, 'overview']);
  s = await boot({ session: { 'celadyne-calm-open': JSON.stringify({ app: 'plan', objective: K_.objB }) }, storage: { rd_division: K_.second } });
  s.eq('another app\'s hand-off is left alone (Sales: All divisions, whatever is remembered)', [s.c.ctx.divId, !!W.sessionStorage.getItem('celadyne-calm-open'), s.c.state.divAll], [SALES ? K_.first : K_.second, true, SALES]);
  s = await boot({ search: '?objective=' + K_.objA, session: { 'celadyne-calm-open': JSON.stringify({ app: APPNAME, objective: K_.objB }) } });
  s.eq('the link wins over a hand-off, which is used up', [s.c.ctx.objId, W.sessionStorage.getItem('celadyne-calm-open')], [K_.objA, null]);
  s = await boot({ storage: { rd_division: 'DIV-GONE' } });
  s.eq('a remembered division that is gone: the first', s.c.ctx.divId, K_.first);
});

step('a reload keeps the selection while it exists', async () => {
  const s = await boot({ hub: 'corey@celadyne.com' });
  s.click(SALES ? 'Choose a business division' : 'Choose an R&D division');
  s.click('~' + K_.secondName, { within: 'Divisions' });
  const objs = s.c.ctx.objs;   // the objectives the left panel lists (its quarter)
  if (objs.length > 1) s.click('~' + (objs[1].statement || objs[1].id), { within: 'Objectives' });
  const before = sel(s);
  const tab = 'krs';
  s.c.setState({ tab: tab });
  const n = B.gets('portfolio').length;
  settings(s);
  s.click('Load from the broker');
  await settle(s);
  s.eq('loaded again', B.gets('portfolio').length, n + 1);
  s.eq('same selection and tab', sel(s).concat([s.c.state.tab]), before.concat([tab]));
  hasToast(s, 'Loaded ' + K_.secondName + '.');
  /* the division disappears from the portfolio on the broker */
  const P = B.doc('portfolio');
  P.divisions = P.divisions.filter((d) => d.id !== K_.second);
  B.put('portfolio', P);
  s.click('Load from the broker');
  await settle(s);
  s.eq('back to the first division (Sales: All divisions)', [s.c.ctx.divId, s.c.state.divAll], [K_.first, SALES]);
  s.eq('remembered', remembered(), REMEMBER(K_.first));
  s.clean('after reloads');
});

/* ------------------------------------------------------------------------ 4b. the quarter the left panel opens on */
step('the left panel opens on the current quarter, with its first objective', async () => {
  const s = await boot({ docs: docsNow() });
  s.eq('this quarter, picked by the page', [s.c.state.fQuarter, s.c.state.sh_qAuto], [NOWQ, true]);
  s.eq('the quarter picker shows it', s.vals.sh.fq.v, NOWQ);
  s.ok(s.c.ctx.objs.length > 0 && s.c.ctx.objs.every((o) => o.quarter === NOWQ), 'only this quarter\'s objectives are listed');
  s.ok(s.c.ctx.allObjs.length > s.c.ctx.objs.length, 'the division has objectives in other quarters too');
  s.eq('its first objective is open', s.c.ctx.objId, s.c.ctx.objs[0].id);
  s.eq('nothing to explain', banner(s), '');
  s.clean('current quarter');
});

step('a division with nothing this quarter lists every quarter; back again, this quarter', async () => {
  const s = await boot({ docs: docsNow({ [K_.second]: shiftQ(NOWQ, 2) }) });
  s.eq('first division: this quarter', [s.c.ctx.divId, s.c.state.fQuarter], [K_.first, NOWQ]);
  pickDivision(s, K_.secondName);
  s.eq('nothing this quarter there: every quarter', [s.c.ctx.divId, s.c.state.fQuarter, s.c.state.sh_qAuto], [K_.second, '', true]);
  s.eq('every objective listed', s.c.ctx.objs.length, s.c.ctx.allObjs.length);
  pickDivision(s, K_.firstName);
  s.eq('back: this quarter again', s.c.state.fQuarter, NOWQ);
});

step('an objective from another quarter opens in its own quarter (a link or the hand-off)', async () => {
  let s = await boot({ docs: docsNow(), search: '?objective=' + NEXT_OBJ });
  s.eq('open, its quarter listed', [s.c.ctx.objId, s.c.state.fQuarter, s.c.state.sh_qAuto], [NEXT_OBJ, shiftQ(NOWQ, 1), true]);
  s.eq('no filters to explain', banner(s), '');
  s = await boot({ docs: docsNow(), session: { 'celadyne-calm-open': JSON.stringify({ app: APPNAME, objective: NEXT_OBJ }) } });
  s.eq('the hand-off too', [s.c.ctx.objId, s.c.state.fQuarter], [NEXT_OBJ, shiftQ(NOWQ, 1)]);
  pickDivision(s, K_.secondName);
  s.eq('still the page\'s pick: the next division opens on its current quarter', s.c.state.fQuarter, autoQuarter(s, K_.second, ''));
});

step('a quarter the person picks is kept, across divisions; so is a link\'s ?quarter=', async () => {
  let s = await boot({ docs: docsNow() });
  s.type('Quarter', '');
  s.eq('All quarters, picked by the person', [s.c.state.fQuarter, s.c.state.sh_qAuto], ['', false]);
  s.eq('every objective listed', s.c.ctx.objs.length, s.c.ctx.sideObjs.length);
  pickDivision(s, K_.secondName);
  s.eq('kept in the next division', s.c.state.fQuarter, '');
  s = await boot({ docs: docsNow() });
  s.type('Quarter', shiftQ(NOWQ, 1));
  s.eq('next quarter, picked by the person', [s.c.state.fQuarter, s.c.state.sh_qAuto], [shiftQ(NOWQ, 1), false]);
  s = await boot({ docs: docsNow(), search: '?division=' + K_.first + '&quarter=' + shiftQ(NOWQ, 1) });
  s.eq('the link\'s quarter, not the page\'s', [s.c.state.fQuarter, s.c.state.sh_qAuto], [shiftQ(NOWQ, 1), false]);
});

step('Open a link leaves out a quarter the page picked by itself', async () => {
  const s = await boot({ docs: docsNow() });
  settings(s);
  s.click('Open a link');
  s.ok(!/quarter=/.test(s.vals.sh.linkSheet.url), 'no quarter in ' + s.vals.sh.linkSheet.url);
  closeSheets(s);
  s.type('Quarter', shiftQ(NOWQ, 1));
  settings(s);
  s.click('Open a link');
  s.ok(s.vals.sh.linkSheet.url.indexOf('quarter=' + shiftQ(NOWQ, 1)) >= 0, 'a quarter the person picked is in ' + s.vals.sh.linkSheet.url);
});

/* ------------------------------------------------------------------------ 5. saving through the UI */
step('a reading posted in the UI is saved: PUT of this division\'s document, client calm-1', async () => {
  const s = await boot({ search: '?objective=' + K_.objA, hub: 'corey@celadyne.com' });
  const etag0 = B.state[K_.key].etag, v0 = B.state[K_.key].version;
  s.click('Record readings');
  s.click(POST(K_.kpiName), { within: 'Editor' });   // in the sheet: the review table behind it has the same button
  s.type('New value for ' + K_.kpiName, K_.kpiValue);
  s.key('New value for ' + K_.kpiName, 'Enter');
  s.expect('Reading posted.');
  s.eq('saving', s.c.state.save.state, 'saving');
  s.expect('Saving…');
  await saveNow(s);
  const puts = B.puts();
  s.eq('one write, to ' + K_.key, puts.map((x) => x.id), [K_.key]);
  const put = puts[0] || {};
  s.eq('If-Match the loaded etag, client calm-1', [put.ifMatch, put.body && put.body.client], [etag0, 'calm-1']);
  const r = ((put.body && put.body.doc && put.body.doc.kpiUpdates) || []).filter((u) => u.kpiId === K_.kpiId).slice(-1)[0] || {};
  s.eq('the reading is in the written document', [r.value, r.by], [Number(K_.kpiValue), 'corey@celadyne.com']);
  s.eq('the broker has it', B.state[K_.key].version, v0 + 1);
  s.eq('saved', [s.c.state.save.state, s.ns.NET.info(s.c).pending], ['saved', 0]);
  s.expect('Saved just now');
  await saveNow(s);
  s.eq('no second write', B.puts().length, 1);
  s.clean('after saving');
});

/* October 19: the Overview's review table posts readings with the KPI table's own controls */
step('a reading posted on the Overview\'s review table is saved the same way', async () => {
  const s = await boot({ search: '?objective=' + K_.objA, hub: 'corey@celadyne.com' });
  const etag0 = B.state[K_.key].etag;
  const RV = { within: 'review' };
  if (s.has('Expand all', RV)) s.click('Expand all', RV);
  s.click('Post a reading for ' + K_.kpiName, RV);
  s.type('New value for ' + K_.kpiName, K_.kpiValue, RV);
  s.key('New value for ' + K_.kpiName, 'Enter', RV);
  s.expect('Reading posted.');
  await saveNow(s);
  const puts = B.puts();
  s.eq('one write, to ' + K_.key, puts.map((x) => x.id), [K_.key]);
  const put = puts[0] || {};
  s.eq('If-Match the loaded etag, client calm-1', [put.ifMatch, put.body && put.body.client], [etag0, 'calm-1']);
  const r = ((put.body && put.body.doc && put.body.doc.kpiUpdates) || []).filter((u) => u.kpiId === K_.kpiId).slice(-1)[0] || {};
  s.eq('the reading is in the written document, signed', [r.value, r.by], [Number(K_.kpiValue), 'corey@celadyne.com']);
  s.eq('saved', [s.c.state.save.state, s.ns.NET.info(s.c).pending], ['saved', 0]);
  s.clean('posted from the Overview');
});
step('a ?readonly page\'s review table has values only, and writes nothing', async () => {
  const s = await boot({ search: '?readonly&objective=' + K_.objA });
  const RV = { within: 'review' };
  if (s.has('Expand all', RV)) s.click('Expand all', RV);
  s.ok(!s.has('Post a reading for ' + K_.kpiName, RV), 'no posting');
  await saveNow(s);
  s.eq('nothing written', B.puts().length, 0);
});

if (!SALES) {
  step('Revise plan\'s new committed finish is saved to the portfolio', async () => {
    const s = await boot({ search: '?objective=OBJ-EL-2026Q4-01', hub: 'corey@celadyne.com' });
    const pe0 = B.state.portfolio.etag;
    s.click('Stage-gates', { within: 'Objective sections' });
    s.click('Revise plan', { within: 'gates-history' });
    s.eq('revise sheet', s.c.sheet().kind, 'gates.revise');
    s.type('Committed finish', '2027-01-08', ED);
    s.type('Why this revision', 'Live save check.', ED);
    s.click('Commit v3', ED);
    hasToast(s, 'Revised plan committed as v3.');
    await saveNow(s);
    const pp = B.puts('portfolio');
    s.eq('portfolio written once', pp.length, 1);
    s.eq('If-Match and client', pp[0] ? [pp[0].ifMatch, pp[0].body.client] : [], [pe0, 'calm-1']);
    s.eq('new planned finish on the broker', B.doc('portfolio').objectives.find((o) => o.id === 'OBJ-EL-2026Q4-01').plannedEnd, day('2027-01-08'));
    s.eq('the plan version went to EXEC-DIV-EL', B.puts().map((x) => x.id).sort(), ['EXEC-DIV-EL', 'portfolio']);
    s.eq('v3 on the broker', ((B.doc('EXEC-DIV-EL').planVersions || []).filter((v) => v.objectiveId === 'OBJ-EL-2026Q4-01').map((v) => v.v)), [1, 2, 3]);
  });
} else {
  step('End objective is saved to BIZ-DIV-BD only', async () => {
    const s = await boot({ search: '?objective=' + K_.objA });
    s.click('End objective', { within: 'objective-head' });
    s.click('End objective', { within: 'Editor' });
    await saveNow(s);
    s.eq('written', B.puts().map((x) => x.id), ['BIZ-DIV-BD']);
    s.ok(!!RD.objectiveEndState(B.doc('BIZ-DIV-BD').objectiveState, K_.objA), 'ended on the broker');
  });
}

step('412: another editor saved first, the document reloads with today\'s message', async () => {
  const s = await boot({ search: '?objective=' + K_.objA, hub: 'corey@celadyne.com' });
  const theirs = B.doc(K_.key);
  const kr = theirs.keyResults.find((k) => k.objectiveId === K_.objA);
  kr.statement = 'Edited by another editor';
  B.put(K_.key, theirs);
  const n0 = (s.c.D.docs[K_.key].kpiUpdates || []).length;
  s.click('Record readings');
  s.click(POST(K_.kpiName), { within: 'Editor' });   // in the sheet: the review table behind it has the same button
  s.type('New value for ' + K_.kpiName, K_.kpiValue);
  s.key('New value for ' + K_.kpiName, 'Enter');
  closeSheets(s);
  await saveNow(s);
  const puts = B.puts(K_.key);
  s.eq('one refused write', puts.length, 1);
  s.eq('the broker keeps their version', B.doc(K_.key).keyResults.find((k) => k.id === kr.id).statement, 'Edited by another editor');
  s.eq('their version is loaded here', s.c.D.docs[K_.key].keyResults.find((k) => k.id === kr.id).statement, 'Edited by another editor');
  s.eq('my unsaved reading is dropped', (s.c.D.docs[K_.key].kpiUpdates || []).length, n0);
  s.eq('today\'s message', [banner(s), s.vals.sh.banner.cls], ['Another editor saved first — reloaded; re-apply your change.', 'banner t-bad']);
  s.eq('registered at their etag', s.c.net.reg[K_.key].etag, B.state[K_.key].etag);
  s.eq('nothing left to save', s.ns.NET.info(s.c).pending, 0);
  s.expect('Edited by another editor');
  s.clean('after the conflict');
});

step('another editor\'s change arrives with the poll', async () => {
  const s = await boot({ search: '?objective=' + K_.objA });
  const theirs = B.doc(K_.key);
  theirs.keyResults.find((k) => k.objectiveId === K_.objA).statement = 'Renamed elsewhere';
  B.put(K_.key, theirs);
  await s.ns.NET.poll(s.c);
  await settle(s);
  s.eq('banner', [banner(s), s.vals.sh.banner.cls], ['Updated from another editor.', 'banner t-info']);
  s.expect('Renamed elsewhere');
  s.eq('nothing written', B.puts().length, 0);
});

step('the other app\'s documents: their changes come in with the poll, without a word', async () => {
  const s = await boot({ search: '?objective=' + K_.objA });
  const other = OTHER_DOCS[0];
  const theirs = B.doc(other);
  theirs.keyResults[0].statement = 'Renamed in the other app';
  B.put(other, theirs);
  await s.ns.NET.poll(s.c);
  await settle(s);
  s.eq('taken in', s.c.D.docs[other].keyResults[0].statement, 'Renamed in the other app');
  s.eq('no banner, no toast', [banner(s), toasts(s).filter((t) => /another editor/i.test(t))], ['', []]);
  s.eq('nothing written', B.puts().length, 0);
  const mine = B.doc(K_.key), again = B.doc(other);
  mine.keyResults.find((k) => k.objectiveId === K_.objA).statement = 'Renamed here, elsewhere';
  again.keyResults[0].statement = 'Renamed again';
  B.put(K_.key, mine); B.put(other, again);
  await s.ns.NET.poll(s.c);
  await settle(s);
  s.eq('with one of this app\'s own: the usual message', banner(s), 'Updated from another editor.');
  s.eq('both taken in', [s.c.D.docs[K_.key].keyResults.find((k) => k.objectiveId === K_.objA).statement, s.c.D.docs[other].keyResults[0].statement], ['Renamed here, elsewhere', 'Renamed again']);
  s.eq('still nothing written', B.puts().length, 0);
});

/* October 19, Corey: "KPIs adding in the sales app cannot see objectives in the execution app. I need to be able
   to reference any objective, regardless of division or business unit." */
step('a pulled KPI here reaches the other app\'s objectives, and is saved to this app\'s document only', async () => {
  const s = await boot({ search: '?objective=' + K_.objA, hub: 'corey@celadyne.com' });
  const kr = s.c.D.docs[K_.key].keyResults.find((k) => k.objectiveId === K_.objA && k.trackingType === 'kpi');
  if (s.has('Key results', { tag: 'button' })) s.click('Key results', { tag: 'button' });
  s.click('~' + kr.statement);
  s.click('Add KPI', { within: 'kpi-t:keyResult:' + kr.id });
  s.click('Pulled from other work', ED);
  const b = () => s.vals.pull.build;
  s.eq('the CTO starts on every division', b().div.v, 'all');
  const listed = [].concat(...b().div.groups.map((g) => g.opts.map((o) => o.v)));
  s.ok(OTHER_DOCS.every((id) => listed.indexOf(id.replace(/^(EXEC|BIZ)-/, '')) >= 0), 'the other app\'s divisions are listed (' + listed.join(', ') + ')');
  const kind = SALES ? 'rd' : 'biz';
  s.type('Division', kind, ED);
  s.type('Quarter', '', ED);
  /* the other app's objective scores, read plainly from the page's documents */
  const D = s.c.D, m = {};
  D.portfolio.divisions.forEach((d) => { const k = (D.docs['EXEC-' + d.id] ? 'EXEC-' : 'BIZ-') + d.id; if (D.docs[k]) m[d.id] = D.docs[k]; });
  const em = s.ns.RD.withPortfolio(D.portfolio, m);
  const kindOf = (id) => RD.divisionKind(D.portfolio.divisions.find((d) => d.id === id) || {});
  const scores = D.portfolio.objectives.filter((o) => m[o.divisionId] && kindOf(o.divisionId) === kind).map((o) => s.ns.RD.objectiveScore(o.id, em)).filter((x) => x != null);
  s.ok(scores.length > 1, 'the other app has scored objectives (' + scores.length + ')');
  s.eq('their average', b().tiles[0].value, Math.round(10 * scores.reduce((a, x) => a + x, 0) / scores.length) / 10 + '%');
  s.type('Average, name', 'Cross-app objective score', ED);
  s.click('Add KPI', ED);
  await saveNow(s);
  s.eq('written: this app\'s document only', B.puts().map((x) => x.id), [K_.key]);
  const k = (B.doc(K_.key).kpis || []).find((x) => x.name === 'Cross-app objective score');
  s.eq('on the broker, pulling the other app\'s objectives', k ? [k.pull.each, k.pull.scope.div] : null, ['objective', kind]);
  s.eq('the other app\'s documents untouched', OTHER_DOCS.map((id) => B.state[id].version), [1, 1]);
  s.clean('a pulled KPI across the apps');
});

/* October 20, Corey: "clicking pull from other work yields a white window. No content shown". The live portfolio holds
   each objective's owner as one email, not a list; the sheet's Owner choice threw on it and the sheet came up empty. */
step('the live portfolio\'s owners, one email each: the pulled sheet opens, lists them and saves', async () => {
  const docs = clone(SAMPLE.docs);
  docs.portfolio.objectives.forEach((o) => { const v = RD.ownersOf(o); o.owner = v.length ? String(v[0]) : ''; });
  const s = await boot({ docs: docs, search: '?objective=' + K_.objA, hub: 'corey@celadyne.com' });
  s.eq('owners are one email here', typeof s.c.D.portfolio.objectives.find((o) => o.id === K_.objA).owner, 'string');
  const kr = s.c.D.docs[K_.key].keyResults.find((k) => k.objectiveId === K_.objA && k.trackingType === 'kpi');
  if (s.has('Key results', { tag: 'button' })) s.click('Key results', { tag: 'button' });
  s.click('~' + kr.statement);
  s.click('Add KPI', { within: 'kpi-t:keyResult:' + kr.id });
  s.click('Pulled from other work', ED);
  const b = () => s.vals.pull.build;
  s.ok(!!b() && s.has('Which work', ED), 'the sheet opens');
  s.eq('no view errors', (s.c._vmErrors || []).length, 0);
  const owners = b().owner.opts.map((x) => x.v).filter(Boolean);
  s.ok(owners.indexOf('maya@celadyne.com') >= 0 && owners.indexOf('sam@celadyne.com') >= 0, 'owners from both apps are listed (' + owners.length + ')');
  s.type('Owner', 'maya@celadyne.com', ED);
  s.type('Average, name', 'Average of Maya\'s objectives', ED);
  s.click('Add KPI', ED);
  await saveNow(s);
  s.eq('written: this app\'s document only', B.puts().map((x) => x.id), [K_.key]);
  const k = (B.doc(K_.key).kpis || []).find((x) => x.name === 'Average of Maya\'s objectives');
  s.eq('saved with her as the owner', k ? k.pull.scope.owner : null, 'maya@celadyne.com');
  s.clean('owners held as one email');
});

step('offline while saving: kept here, Try again saves', async () => {
  const s = await boot({ search: '?objective=' + K_.objA });
  B.once({ method: 'PUT', path: '/state/' + K_.key, offline: true });
  s.click('End objective', { within: 'objective-head' });
  s.click('End objective', { within: 'Editor' });
  await saveNow(s);
  s.eq('offline', [s.c.state.sim.offline, s.c.state.save.state], [true, 'offline']);
  s.ok(s.has('You are offline. Changes are kept here and save when you are back online.'), 'offline banner');
  s.expect('Offline, changes kept here');
  settings(s);
  s.expect('Offline');
  s.expect('Unsaved changes in 1 document.');
  const n = B.gets('portfolio').length;
  s.click('Load from the broker');
  s.expect('You are offline with unsaved changes in 1 document. They save when the connection returns; load again after that.');
  await settle(s);
  s.eq('offline: no reload, the change is kept', [B.gets('portfolio').length, s.ns.NET.info(s.c).pending, s.c.ctx.loaded], [n, 1, true]);
  closeSheets(s);
  s.click('Try again', { within: 'offline' });
  await settle(s);
  s.eq('back online and saved', [s.c.state.sim.offline, s.c.state.save.state], [false, 'saved']);
  s.ok(!!RD.objectiveEndState(B.doc(K_.key).objectiveState, K_.objA), 'the change reached the broker');
  s.ok(!s.vals.sh.offline, 'banner gone');
});

step('a refused save (426, 401) keeps the page and says why', async () => {
  let s = await boot({ search: '?objective=' + K_.objA });
  B.once({ method: 'PUT', path: '/state/' + K_.key, status: 426 });
  s.click('End objective', { within: 'objective-head' });
  s.click('End objective', { within: 'Editor' });
  await saveNow(s);
  s.eq('outdated', [banner(s), s.c.state.sh_load, s.c.ctx.loaded], ['This page is out of date. Reload it to keep working.', 'ok', true]);
  s.expect('Not saved: reload this page.');
  s = await boot({ search: '?objective=' + K_.objA });
  B.once({ method: 'PUT', path: '/state/' + K_.key, status: 401 });
  s.click('End objective', { within: 'objective-head' });
  s.click('End objective', { within: 'Editor' });
  await saveNow(s);
  s.eq('401 on save', [banner(s), s.c.state.sh_load], ['The broker didn’t accept the token (401). Check it in Settings.', 'ok']);
  s.ok(s.has('End objective', { within: 'objective-head' }) || s.has('Reopen'), 'the page is still there');
  settings(s);
  s.click('Load from the broker');
  await settle(s);
  s.eq('a good load clears the load message', banner(s), '');
});

/* ------------------------------------------------------------------------ 6. Settings and links */
step('Settings: no simulations; the real broker, read-only preview, links and Hub sign-in', async () => {
  let s = await boot({ hub: 'corey@celadyne.com' });
  settings(s);
  ['Go offline', 'Back online', 'Back online after a teammate saved', 'Receive a teammate\'s change', 'Simulate a failed load', 'Simulate a missing portfolio', 'Restore the sample data', 'Reload from the broker']
    .forEach((t) => s.ok(!s.has(t), 'no "' + t + '"'));
  ['Sample data', 'Sync'].forEach((t) => s.ok(!s.has(t, { tag: 'h3' }), 'no ' + t + ' section'));
  const vm = s.vals.sh.settings;
  s.eq('no simulation in the view model either', [vm.sync, vm.reset, vm.simFail, vm.simNoPortfolio], [null, null, null, null]);
  s.ok(!/sample data|prototype|simulat/i.test(textOf(s.find('Editor'))), 'no sample or simulation wording');
  s.expect('Your theme and broker token stay in this browser.');
  s.ok(s.has('Load from the broker') && s.has('Open a link') && s.has('Preview the read-only view'), 'real controls');
  const tok = s.find('Broker token', { tag: 'input' });
  s.eq('password field, empty', [tok.attrs.type, tok.attrs.value], ['password', '']);
  s.expect('A token is saved in this browser.');
  s.expect('Connected');
  s.expect('Last loaded just now.');
  s.expect('No unsaved changes.');
  s.expect('Build: ');
  const hub = s.vals.sh.settings.hub;
  s.eq('fixed picker', [hub.fixed, hub.value], [true, 'corey@celadyne.com']);
  s.ok(/^From your Hub sign-in \(corey@celadyne\.com\)\..* Kanban Done-column choices follow you to any device\.$/.test(hub.hint), hub.hint);
  s.eq('plan note', hub.planNote, 'You can change the plan in Planning.');
  s.click('Dark');
  s.eq('theme kept', W.localStorage.getItem('rd_theme'), 'dark');
  s.eq('the preview can be switched here', s.find('Preview the read-only view', { tag: 'input' }).attrs.disabled, false);
  s.expect('The view a link with ?readonly opens: nothing saves and editing controls are hidden.');
  s.check('Preview the read-only view', true);
  s.eq('read-only preview', s.c.state.ro, true);
  s.check('Preview the read-only view', false);
  s.clean('settings');
  s = await boot({});
  settings(s);
  const h2 = s.vals.sh.settings.hub;
  s.eq('signed out', [h2.fixed, h2.value, h2.hint], [true, '', 'Sign in to the Hub, then reload this page. Done-column choices are kept in this browser only.']);
  s.ok(/^Planning is view only for you: the plan is changed by the CTO and CEO \(.+\)\.$/.test(h2.planNote), h2.planNote);
  s.clean('settings, signed out');
});

step('Open a link: a real fresh load at that address; Copy link unchanged', async () => {
  const s = await boot({ search: '?objective=' + K_.objA });
  settings(s);
  s.click('Open a link');
  const app = SALES ? 'sales_app.html' : 'execution_app.html';
  s.eq('starts as this view (Sales: All divisions, so no division)', s.vals.sh.linkSheet.url, app + '?' + (SALES ? '' : 'division=' + K_.objADiv + '&') + 'objective=' + K_.objA);
  s.click('Copy link');
  hasToast(s, 'Link copied.');
  s.click('Clear all', { within: 'Parameters' });
  s.type('~Objective', K_.objB, { within: 'Parameters' });
  s.check('~Read-only', true, { within: 'Parameters' });
  const before = JSON.stringify([sel(s), s.c.state.ro, s.c.state.sh_banner]);
  const n = B.log.length;
  s.click('Open this link');
  s.eq('navigated', navigated, [app + '?objective=' + K_.objB + '&readonly']);
  s.eq('nothing simulated here', JSON.stringify([sel(s), s.c.state.ro, s.c.state.sh_banner]), before);
  s.eq('no request', B.log.length, n);
});

/* ------------------------------------------------------------------------ 6b. views by direct link */
const VIEW_OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-02';
const VIEW_NAME = SALES ? 'Close three utility pilot agreements' : 'Lock Tera 25-30-R5 components';
const APPWORD = SALES ? 'Sales' : 'Execution';
const APPFILE = SALES ? 'sales_app.html' : 'execution_app.html';
const PAGEBASE = 'https://celadynestaller.github.io/CeladyneHQ/';
const VIEW_KR = (SAMPLE.docs[K_.key].keyResults || []).filter((k) => k.objectiveId === VIEW_OBJ).map((k) => k.id);
const viewSide = (s) => s.has((el) => el.tag === 'aside' && el.attrs['aria-label'] === 'Navigation');
const viewTabs = (s) => s.has((el) => el.attrs['aria-label'] === 'Objective sections');
const pill = (s) => { const p = s.all((el) => el.attrs['data-k'] === 'view-status')[0]; return p ? textOf(p) : ''; };
/* a view page's top label (round 2, October 21): its breadcrumb, app / unit / division / quarter / view */
const vcrumb = (s) => { const n = s.all((el) => el.tag === 'nav', { within: 'view-top' })[0]; return n ? textOf(n) : ''; };
const vhead = (s) => s.has((el) => el.attrs['data-k'] === 'objective-head');
const reviewLink = (name) => (el) => el.tag === 'button' && /\breview-link\b/.test(el.attrs.class || '') && textOf(el).indexOf(name) >= 0;
function catchOpens() { const opened = []; W.open = (u, t, f) => { opened.push([String(u), t, f]); return null; }; return opened; }
function catchCopies() { const copied = []; W.navigator.clipboard.writeText = (t) => { copied.push(String(t)); return { then(ok) { if (ok) ok(); return this; } }; }; return copied; }

step('?view= opens a view page from its first frame; its tab title names it; the remembered division stays', async () => {
  const s = page({ search: '?objective=' + VIEW_OBJ + '&view=krs', storage: { rd_division: K_.first } });
  s.eq('a view page before anything loads', [s.c.state.view, s.c.state.tab, viewSide(s), viewTabs(s)], ['krs', 'krs', false, false]);
  s.ok(s.has((el) => el.attrs['data-k'] === 'empty') && s.see('Loading…'), 'Loading…');
  s.eq('the top label from the first frame', vcrumb(s), APPWORD + ' / Loading… / Key results');
  s.ok(!vhead(s), 'no head until the objective loads');
  s.ok(!/Saved/.test(pill(s)) && pill(s).includes('Open in ' + APPWORD), 'no save state before a load: ' + pill(s));
  s.c.componentDidMount();
  await settle(s);
  s.eq('loaded at its objective', [s.c.net.loaded, s.c.ctx.objId, s.c.ctx.view], [true, VIEW_OBJ, 'krs']);
  s.ok(!viewSide(s) && !viewTabs(s), 'no sidebar or tabs');
  s.ok(vhead(s) && s.see(VIEW_NAME), 'the objective head');
  const o = s.c.ctx.obj;
  s.ok(/ \/ Key results$/.test(vcrumb(s)) && vcrumb(s).indexOf(s.c.ctx.div.name + ' / ') > 0, 'the top label: ' + vcrumb(s));
  s.eq('the Key results panel\'s facts', s.vals.sh.head.facts.map((f) => f.label), ['Key results', 'On pace', 'KPIs', 'Milestone steps']);
  s.eq('as many key results as the broker\'s document', s.vals.sh.head.facts[0].value, String((B.doc(K_.key).keyResults || []).filter((k) => k.objectiveId === o.id).length));
  s.ok(!s.has('End objective'), 'End objective stays on the Overview view');
  s.ok(s.has((el) => el.attrs['data-k'] === 'kr-panel'), 'the Key results panel');
  s.eq('the tab title', global.document.title, 'Key results – ' + VIEW_NAME);
  s.eq('the remembered division is left alone', W.localStorage.getItem('rd_division'), K_.first);
  s.ok(/Saved/.test(pill(s)), 'the top label\'s save state: ' + pill(s));
  s.eq('no message', banner(s), '');
  s.clean('live view');
});

step('?readonly view: nothing to edit, nothing saved; ?item= highlights its item, then lets go', async () => {
  const kr = VIEW_KR[0];
  const s = await boot({ search: '?objective=' + VIEW_OBJ + '&view=krs&readonly&item=' + kr });
  s.eq('read-only', [s.c.state.ro, s.c.ctx.view], [true, 'krs']);
  s.ok(!s.has('Add key result'), 'no Add key result');
  s.ok(pill(s).includes('Read-only') && !/Saved/.test(pill(s)), 'the top label says Read-only: ' + pill(s));
  s.eq('the key result highlighted and open', [s.c.state.kr_focus, !!(s.c.state.kr_open || {})[kr]], [kr, true]);
  s.flush(9000);
  s.eq('then the highlight goes', s.c.state.kr_focus, '');
  await saveNow(s);
  s.eq('nothing written', B.puts().length, 0);
  const s2 = await boot({ search: '?objective=' + VIEW_OBJ + '&view=overview&item=NOT-AN-ITEM' });
  s2.eq('an item that isn\'t there is ignored', [s2.c.ctx.view, s2.c.ctx.objId, s2.c.state.kr_focus || '', s2.c.state.gates_focus || ''], ['overview', VIEW_OBJ, '', '']);
  s2.ok(s2.has((el) => el.attrs['data-k'] === 'objective-head') && s2.has((el) => el.attrs['data-k'] === 'review'), 'the Overview view: head and review');
  s2.eq('its title', global.document.title, 'Overview – ' + VIEW_NAME);
});

step('an editable view saves through the broker', async () => {
  const s = await boot({ search: '?objective=' + VIEW_OBJ + '&view=gates', hub: 'corey@celadyne.com' });
  s.click((el) => el.on.onClick && /^Chained: /.test(el.attrs['aria-label'] || ''));
  await saveNow(s);
  const puts = B.puts(K_.key);
  s.eq('one PUT of this division\'s document, from this page', [puts.length, puts[0] && puts[0].body && puts[0].body.client], [1, 'calm-1']);
  s.eq('the workstream is independent on the broker', B.doc(K_.key).stageGateSets.find((x) => x.objectiveId === VIEW_OBJ).chained, false);
  s.ok(/Saved/.test(pill(s)), 'the top label: ' + pill(s));
  s.eq('the Stage-gates panel', s.vals.sh.head.facts.map((f) => f.label), ['Stage-gates', 'Gate health', 'Next gate', 'Schedule', 'Open high risk']);
});

step('links from a live view open new browser tabs at whole addresses', async () => {
  const s = await boot({ search: '?objective=' + VIEW_OBJ + '&view=overview&readonly' });
  const opened = catchOpens();
  const kr = s.vals.review.groups.find((g) => g.label === 'Key results').rows.find((r) => r.isRow && r.hasLink);
  const krId = kr.k.replace(/^review:/, '');
  s.click(reviewLink(kr.name));
  s.eq('a review row: its own view, the item, read-only, in a new tab', opened[0], [PAGEBASE + APPFILE + '?objective=' + VIEW_OBJ + '&view=krs&item=' + krId + '&readonly', '_blank', 'noopener']);
  s.eq('this page stays as it is', [s.c.state.view, s.c.state.kr_focus || ''], ['overview', '']);
  s.click((el) => el.on.onClick && /\bshl-vopen\b/.test(el.attrs.class || ''));
  s.eq('"Open in ' + APPWORD + '": the whole app at this objective', opened[1][0], PAGEBASE + APPFILE + '?objective=' + VIEW_OBJ + '&readonly');
  if (SALES) s.eq('Sales: no Current step, so no link to Experiments (gone November 3)', s.has('Open experiments'), false);
  else {
    s.click('Open experiments');
    s.eq('Current step: the app\'s Experiments tab', opened[2][0], PAGEBASE + APPFILE + '?objective=' + VIEW_OBJ + '&tab=exp&readonly');
  }
  W.open = () => null;
});

step('Sales: a live link naming the Experiments tab opens the Overview; Execution opens the tab', async () => {
  const s = await boot({ search: '?objective=' + VIEW_OBJ + '&tab=exp' });
  s.eq(SALES ? 'Sales: the Overview (no Experiments tab since November 3)' : 'Execution: the Experiments tab', [s.c.state.view, s.c.state.tab, s.c.ctx.objId], ['', SALES ? 'overview' : 'exp', VIEW_OBJ]);
  s.eq('the tabs', s.vals.sh.tabs.map((t) => t.id), ['overview', 'krs', 'gates', 'kanban', 'risks'].concat(SALES ? [] : ['exp']));
});

step('the whole app: ?tab= opens a tab; "Link to this view" copies the whole address and opens a new tab', async () => {
  const s = await boot({ search: '?objective=' + VIEW_OBJ + '&tab=kanban' });
  s.eq('?tab= opens the app on that tab', [s.c.state.view, s.c.state.tab, s.c.ctx.objId], ['', 'kanban', VIEW_OBJ]);
  const opened = catchOpens(), copied = catchCopies();
  s.click('~Link to this view');
  s.click('Read-only', { within: 'What the link allows' });
  s.click('Copy link');
  s.eq('copied', copied, [PAGEBASE + APPFILE + '?objective=' + VIEW_OBJ + '&view=kanban&readonly']);
  hasToast(s, 'Link copied.');
  s.click('Open in a new tab');
  s.eq('opened', opened, [[PAGEBASE + APPFILE + '?objective=' + VIEW_OBJ + '&view=kanban&readonly', '_blank', 'noopener']]);
  s.eq('this page stays the whole app', [s.c.state.view, s.c.state.tab, viewSide(s)], ['', 'kanban', true]);
  const s2 = await boot({ search: '?tab=risks', session: { 'celadyne-calm-open': JSON.stringify({ app: APPNAME, objective: K_.objB, tab: 'krs' }) } });
  s2.eq('a link\'s ?tab= wins over a hand-off\'s', [s2.c.ctx.objId, s2.c.state.tab], [K_.objB, 'risks']);
  W.open = () => null;
});

step('a view link whose objective isn\'t here: a message, never another objective', async () => {
  let s = await boot({ search: '?objective=OBJ-NOPE-1&view=overview' });
  const opened = catchOpens();
  s.eq('nothing shown in its place', [s.c.ctx.obj, s.c.state.sh_viewMissing, s.c.ctx.view], [null, 'OBJ-NOPE-1', 'overview']);
  s.expect('There is no objective OBJ-NOPE-1 in ' + APPWORD + ', so this view has nothing to show. The link may be out of date.');
  s.ok(!s.has((el) => el.attrs['data-k'] === 'objective-head') && !viewSide(s), 'no head, no sidebar');
  s.eq('the top label names no division for it', vcrumb(s), APPWORD + ' / Overview');
  s.eq('its title', global.document.title, 'Overview – ' + APPWORD);
  s.click('Open ' + APPWORD);
  s.eq('the way into the app', opened.map((x) => x[0]), [PAGEBASE + APPFILE]);
  s = await boot({ search: '?objective=' + K_.wrongObj + '&view=krs' });
  s.eq('an objective of the other app: the same', [s.c.ctx.obj, s.c.state.sh_viewMissing], [null, K_.wrongObj]);
  s.clean('missing objective');
  W.open = () => null;
});

step('a view page with no token or a refused one: what to do, without Settings to point at', async () => {
  let s = await boot({ token: null, search: '?objective=' + VIEW_OBJ + '&view=kanban' });
  const msg = 'No broker token in this browser yet. Open ' + APPWORD + ' from the Hub once, then reload this page.';
  s.eq('not loaded', s.c.state.sh_load, 'notoken');
  s.eq('the banner', banner(s), msg);
  s.expect('Not loaded. ' + msg);
  s.ok(s.has('Open ' + APPWORD), 'and the way into the app');
  s = await boot({ search: '?objective=' + VIEW_OBJ + '&view=kanban', storage: { rd_broker_token: 'not-the-token' } });
  s.eq('a refused token', banner(s), 'The broker didn’t accept this browser’s token (401). Open ' + APPWORD + ' to check it in Settings, then reload this page.');
  s = page({ search: '?objective=' + VIEW_OBJ + '&view=kanban' });
  B.once({ method: 'GET', path: '/state/portfolio', status: 500 });
  s.c.componentDidMount();
  await settle(s);
  s.eq('a server error', banner(s), 'Load failed (500). Reload the page to try again.');
  s = await boot({ token: null, search: '?token=' + TOKEN + '&objective=' + VIEW_OBJ + '&view=kanban' });
  s.eq('an embed\'s ?token= is taken as usual, and the view loads', [W.localStorage.getItem('rd_broker_token'), s.c.net.loaded, s.c.ctx.view, s.c.ctx.objId], [TOKEN, true, 'kanban', VIEW_OBJ]);
  s.ok(W.location.href.indexOf('token') < 0, 'removed from the address bar');
});

/* ------------------------------------------------------------------------ 7. Sales: recover stranded data */
if (SALES) {
  const SRC = 'BIZ-DIV-PT', MINE = 'BIZ-DIV-BD', OBJ = 'OBJ-BD-2027Q1-01';
  const cnt = (d) => RD.objectivePayloadCounts(d || {}, OBJ);
  const ZERO = { keyResults: 0, kpis: 0, stageGates: 0, tasks: 0, boards: 0, risks: 0 };
  const plus = (a, b) => { const o = {}; Object.keys(a).forEach((k) => { o[k] = a[k] + b[k]; }); return o; };
  async function openRecover(o) {
    const s = await boot(Object.assign({ search: '?division=DIV-BD' }, o || {}));
    settings(s);
    s.click('Recover stranded execution data');
    return s;
  }
  step('Sales recover: this division first, then the source', async () => {
    const s = await openRecover();
    s.expect('1 key result, 1 KPI, 1 stage-gate and 1 task stranded in Partnerships');
    const here0 = cnt(B.doc(MINE)), there0 = cnt(B.doc(SRC));
    const srcEtag = B.state[SRC].etag, mineEtag = B.state[MINE].etag;
    const n0 = B.log.length;
    s.click('Move it all here');
    s.expect('Moving…');
    await settle(s);
    const calls = B.log.slice(n0).filter((x) => !x.version);
    const at = (m, id) => calls.findIndex((x) => x.method === m && x.id === id);
    s.ok(at('GET', SRC) >= 0 && at('GET', SRC) < at('PUT', MINE) && at('PUT', MINE) < at('PUT', SRC), 'fresh read, then this division, then the source: ' + calls.map((x) => x.method + ' ' + x.id).join(', '));
    const pm = calls[at('PUT', MINE)], ps = calls[at('PUT', SRC)];
    s.eq('If-Match: registered etag here, the fresh read\'s etag there', [pm.ifMatch, ps.ifMatch], [mineEtag, srcEtag]);
    s.eq('client', [pm.body.client, ps.body.client], ['calm-1', 'calm-1']);
    s.eq('moved here on the broker (nothing lost or doubled)', cnt(B.doc(MINE)), plus(here0, there0));
    s.eq('gone from the source on the broker', cnt(B.doc(SRC)), ZERO);
    s.ok(B.doc(MINE).kpiUpdates.some((u) => u.id === 'UPD-HL-1') && !B.doc(SRC).kpiUpdates.some((u) => u.id === 'UPD-HL-1'), 'the reading moved with its KPI');
    s.eq('the page has both documents as the broker has them', [cnt(s.c.D.docs[MINE]), cnt(s.c.D.docs[SRC])], [plus(here0, there0), ZERO]);
    s.eq('registered etags', [s.c.net.reg[MINE].etag, s.c.net.reg[SRC].etag], [B.state[MINE].etag, B.state[SRC].etag]);
    s.expect('1 objective recovered.');
    s.expect('Recovered from Partnerships.');
    hasToast(s, '1 objective recovered.');
    await saveNow(s);
    s.eq('two writes in all', B.puts().length, 2);
    s.click('Recover stranded execution data');
    s.expect('No stranded execution data found for this division’s objectives.');
    s.clean('recovered');
  });
  step('Sales recover: a refused write here never touches the source', async () => {
    const s = await openRecover();
    const there0 = cnt(B.doc(SRC)), srcEtag = B.state[SRC].etag;
    /* another editor saves Business Development while the move reads the source */
    B.once({ method: 'GET', path: '/state/' + SRC, before: () => { const d = B.doc(MINE); d.tasks = (d.tasks || []).concat([{ id: 'TSK-ELSEWHERE-1', objectiveId: K_.objA, name: 'Added elsewhere', plannedStart: null, plannedEnd: null, percentComplete: 0, actualStart: null, actualEnd: null }]); B.put(MINE, d); } });
    const n0 = B.log.length;
    s.click('Move it all here');
    await settle(s);
    const puts = B.log.slice(n0).filter((x) => x.method === 'PUT');
    s.eq('one refused write here, none to the source', puts.map((x) => x.id), [MINE]);
    s.eq('the source is untouched', [cnt(B.doc(SRC)), B.state[SRC].etag], [there0, srcEtag]);
    s.eq('the page\'s copy too', cnt(s.c.D.docs[SRC]), there0);
    s.expect('0 recovered, 1 failed — reopen to retry.');
    s.expect('Not moved (another editor saved first). Reopen to retry.');
    hasToast(s, '0 recovered, 1 failed — reopen to retry.');
    /* the poll brings their change in; then the retry works */
    await s.ns.NET.poll(s.c);
    await settle(s);
    s.ok(s.c.D.docs[MINE].tasks.some((t) => t.id === 'TSK-ELSEWHERE-1'), 'their change arrived');
    s.click('Recover stranded execution data');
    s.click('Move it all here');
    await settle(s);
    s.expect('1 objective recovered.');
    s.ok(B.doc(MINE).tasks.some((t) => t.id === 'TSK-ELSEWHERE-1'), 'their change kept');
    s.eq('moved', cnt(B.doc(SRC)), ZERO);
  });
  step('Sales recover: offline here, nothing written anywhere', async () => {
    const s = await openRecover();
    const there0 = cnt(B.doc(SRC));
    B.once({ method: 'PUT', path: '/state/' + MINE, offline: true });
    const n0 = B.log.length;
    s.click('Move it all here');
    await settle(s);
    s.eq('no write reached the broker', B.log.slice(n0).filter((x) => x.method === 'PUT').map((x) => x.id), [MINE]);
    s.eq('the source is untouched', cnt(B.doc(SRC)), there0);
    s.expect('Not moved (couldn’t reach the broker). Reopen to retry.');
  });
  step('Sales recover: the source write fails, so the data is in both and a second scan tidies up', async () => {
    const s = await openRecover();
    const here0 = cnt(B.doc(MINE)), there0 = cnt(B.doc(SRC));
    B.once({ method: 'PUT', path: '/state/' + SRC, status: 412 });
    s.click('Move it all here');
    await settle(s);
    s.eq('here on the broker', cnt(B.doc(MINE)), plus(here0, there0));
    s.eq('still in the source', cnt(B.doc(SRC)), there0);
    s.expect('1 objective recovered. Moved here, but still in Partnerships: scan again to tidy up.');
    s.expect('Moved here, but still in Partnerships (another editor saved first): scan again to tidy up.');
    s.click('Recover stranded execution data');
    s.expect('1 key result, 1 KPI, 1 stage-gate and 1 task stranded in Partnerships');
    s.click('Move it all here');
    await settle(s);
    s.eq('not doubled here', cnt(B.doc(MINE)), plus(here0, there0));
    s.eq('the source is tidy', cnt(B.doc(SRC)), ZERO);
    s.expect('1 objective recovered.');
  });
  step('Sales recover: scanning works in read-only, moving is blocked', async () => {
    const s = await openRecover({ search: '?division=DIV-BD&readonly' });
    s.expect('Read-only view: moving is disabled.');
    s.ok(!s.has('Move it all here'), 'no move button');
    s.vals.sh.settings.recover.move();
    s.render();
    hasToast(s, 'Read-only view — editing is disabled.');
    await settle(s);
    s.eq('nothing written', B.puts().length, 0);
  });
  /* All divisions (decided October 16): every business division is scanned and each objective's data goes to
     the division it belongs to now, its document written before the source's, one objective at a time */
  const PT_OBJ = 'OBJ-PT-2026Q4-01';
  function docsTwoWays() {
    const docs = clone(SAMPLE.docs);
    docs.portfolio.objectives.push({ id: PT_OBJ, divisionId: 'DIV-PT', initiativeId: null, quarter: '2026Q4', statement: 'Sign two channel partners', owner: ['ken@celadyne.com'], plannedStart: day('2026-10-01'), plannedEnd: day('2026-12-18'), milestoneIds: [], productId: null, modelId: null, order: 1 });
    docs[MINE].keyResults.push({ id: 'KR-PT-2026Q4-01-9', objectiveId: PT_OBJ, statement: 'Stranded partner key result', trackingType: 'percentage', progress: 10 });
    return docs;
  }
  step('Sales recover in All divisions: every division scanned, each objective to its own division', async () => {
    const s = await boot({ docs: docsTwoWays() });
    s.eq('All divisions', s.c.state.divAll, true);
    settings(s);
    s.expect('This scans every business division and moves any stranded execution data to the division its objective belongs to now.');
    s.click('Recover stranded execution data');
    s.eq('a row per objective, naming where it goes', s.vals.sh.settings.recover.rows.map((r) => r.name + ': ' + r.text), [
      'Build the Q1 hydrogen-hub pipeline: 1 key result, 1 KPI, 1 stage-gate and 1 task stranded in Partnerships; it moves to Business Development',
      'Sign two channel partners: 1 key result stranded in Business Development; it moves to Partnerships'
    ]);
    const hub0 = plus(cnt(B.doc(MINE)), cnt(B.doc(SRC)));
    const n0 = B.log.length;
    s.click('Move it all');
    await settle(s, 40);
    const calls = B.log.slice(n0).filter((x) => !x.version && /^BIZ-/.test(x.id || '')).map((x) => x.method + ' ' + x.id);
    s.eq('each objective: a fresh read of its source, its own division, then the source', calls, ['GET ' + SRC, 'PUT ' + MINE, 'PUT ' + SRC, 'GET ' + MINE, 'PUT ' + SRC, 'PUT ' + MINE]);
    s.eq('the hub pipeline\'s data in Business Development only', [cnt(B.doc(MINE)), cnt(B.doc(SRC))], [hub0, ZERO]);
    s.eq('the partner key result in Partnerships only', [B.doc(MINE).keyResults.some((k) => k.id === 'KR-PT-2026Q4-01-9'), B.doc(SRC).keyResults.some((k) => k.id === 'KR-PT-2026Q4-01-9')], [false, true]);
    s.expect('2 objectives recovered.');
    s.expect('Recovered from Partnerships.');
    s.expect('Recovered from Business Development.');
    s.click('Recover stranded execution data');
    s.expect('No stranded execution data found for any business division’s objectives.');
    s.clean('recovered both ways');
  });
  step('Sales recover in All divisions: a source write that fails says where the data went', async () => {
    const s = await boot({ docs: docsTwoWays() });
    settings(s);
    s.click('Recover stranded execution data');
    B.once({ method: 'PUT', path: '/state/' + SRC, status: 412 });
    s.click('Move it all');
    await settle(s, 40);
    s.expect('2 objectives recovered. Moved, but still in Partnerships: scan again to tidy up.');
    s.expect('Moved to Business Development, but still in Partnerships (another editor saved first): scan again to tidy up.');
    s.ok(B.doc(SRC).keyResults.some((k) => k.id === 'KR-PT-2026Q4-01-9'), 'the second objective still moved');
  });
} else {
  step('Execution has no recovery', async () => {
    const s = await boot({});
    settings(s);
    s.ok(!s.has('Recover stranded execution data') && !s.has('Maintenance'), 'no Maintenance');
  });
}

module.exports = { B: B, SAMPLE: SAMPLE, page: page, boot: boot, settle: settle, saveNow: saveNow };
if (require.main === module) {
  (async function run() {
    for (const [label, fn] of STEPS) {
      try { await fn(); } catch (e) { LIVE_SIM.ok(false, 'step "' + label + '": ' + String((e && e.stack) || e).split('\n').slice(0, 6).join('\n     ')); }
    }
    LIVE_SIM.eq('no request ever left for another address', B.foreign, []);
    done();
  })();
}
