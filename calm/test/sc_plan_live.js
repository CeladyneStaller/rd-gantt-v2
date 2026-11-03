/* Live-build scenarios for the Planning shell (apps/plan/*, LIVE.md): its APP_LIVE_* hooks driving kit/net.js
   against an in-memory broker.
     node test/sc_plan_live.js                            builds the live board into out/live, then runs on it
     node test/sc_plan_live.js out/live/Plan-A.dc.html    a board you built yourself:
                                                            python3 build.py plan --flag=live --out=out/live
   Nothing here touches the network: before any board code runs, fetch (on the global and on the board's
   window) is an in-memory broker speaking today's contract (GET/PUT /state/<id> with etags and If-Match,
   GET /state/<id>/version, GET /roster) that refuses any other address. Its documents are the shared sample
   (data/sample.js plus every seed, evaluated here), so the views the scenarios click behave as in the sample
   harness. The helpers live in this file (test/dc.js is unchanged): the board boots through
   componentDidMount (NET.boot), settle() lets the broker's promises resolve, and dc.js's fake timers run NET's
   debounce, its load retries and the toasts (with clearTimeout honoured, as a browser does).
*/
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
/* the Python that runs the build: RD_PYTHON (sweep.py and build.py --check set it), else `python` on Windows (python.org
   installs no python3 there) and `python3` elsewhere */
const PY = process.env.RD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

/* no board given (test/run_all.js runs it this way): build the live board, then run this file on it */
if (require.main === module && !process.argv[2]) {
  try {
    execFileSync(PY, ['build.py', 'plan', '--flag=live', '--out=out/live'], { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    console.log('FAIL live build: ' + String((e.stdout || '') + (e.stderr || '') || e.message).trim().split('\n').slice(-3).join(' | '));
    console.log('0 passed, 1 failed');
    process.exitCode = 1;
    return;   // a CommonJS module may return at the top level
  }
  const r = spawnSync(process.execPath, [__filename, path.join('out', 'live', 'Plan-A.dc.html')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const lines = String((r.stderr || '') + (r.stdout || '')).trim().split('\n');
  lines.forEach((l) => console.log(l));
  if (r.status !== 0 || !/ 0 failed$/.test(lines[lines.length - 1] || '')) process.exitCode = 1;
  return;
}

/* never the network: every fetch goes to a step's in-memory broker, and before that to nothing at all */
global.fetch = () => Promise.reject(new TypeError('refused: this test never uses the network'));
const { Sim, load, done, textOf, jsWhere } = require('./dc');
const FILE = process.argv[2];
const T0 = Date.UTC(2026, 9, 13, 16, 0, 0);          // the driver's clock at every new board
const TOKEN = 'tok-live-7f3a9c';
const PAGE = 'https://celadynestaller.github.io/CeladyneHQ/planning_app.html';
const EDITORS = 'Corey Staller and Dana Whitcomb';
const clone = (x) => JSON.parse(JSON.stringify(x));
/* the kit's console warnings are kept for the scenarios to check, so the last line stays the result */
const WARN = [];
console.warn = function () { WARN.push(Array.prototype.join.call(arguments, ' ')); };

/* ------------------------------------------------------------ the sample, as broker documents */
const ENGINE = fs.existsSync(path.join(__dirname, 'engine_path.js')) ? require('./engine_path') : path.join(ROOT, 'engine', 'rdcore.js');
const SEED = (function () {
  const RD = require(ENGINE);
  const seeds = execFileSync(PY, ['-B', '-c', 'import sys; sys.path.insert(0, sys.argv[1]); import build; print("\\n".join(build.all_seed_files()))', ROOT]).toString().trim().split('\n').filter(Boolean);
  const srcs = [fs.readFileSync(path.join(ROOT, 'data', 'sample.js'), 'utf8')];
  const names = [];
  seeds.forEach((rel) => {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    srcs.push(s);
    let m;
    const re = /^function\s+(seed_\w+)\s*\(/gm;
    while ((m = re.exec(s))) names.push(m[1]);
  });
  const S = new Function('RD', srcs.join('\n') + '\nvar S = calmSample();\n' + names.map((n) => n + '(S);').join('\n') + '\nreturn S;')(RD);
  return clone({ portfolio: S.portfolio, docs: S.docs || {}, spec: S.spec || {}, roster: (S.roster && S.roster.users) || [] });
})();

/* ------------------------------------------------------------ the browser pieces the live kit uses */
let CURRENT = null, BOARD = null;
const NET = () => BOARD.ns.NET;
/* the board a step runs (the patched copy for the kit proposal). dc.js installs fresh globals when it first
   loads a board; its clearTimeout is a no-op, so cancelling is layered on its timers here, as a browser does */
function use(file) {
  if (file === CURRENT) return;
  BOARD = load(file);
  CURRENT = file;
  const dcSetTimeout = global.setTimeout;
  if (dcSetTimeout.layered) return;
  let tid = 0;
  const cancelled = new Set();
  global.setTimeout = (fn, ms) => { const id = ++tid; dcSetTimeout(() => { if (cancelled.has(id)) { cancelled.delete(id); return; } fn(); }, ms); return id; };
  global.setTimeout.layered = true;
  global.clearTimeout = (id) => { if (id) cancelled.add(id); };
}
use(FILE);
const INTERVALS = [];
global.setInterval = (fn, ms) => { INTERVALS.push({ fn: fn, ms: ms }); return INTERVALS.length; };   // the 25 s poll: run by hand (NET.poll)
global.clearInterval = () => {};
let ENV = null;
function env(o) {
  o = o || {};
  const w = global.window;
  w.fetch = global.fetch;
  const local = Object.assign({}, o.local || {});
  const sess = Object.assign({}, o.session || {});
  const store = (m) => ({ getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } });
  w.localStorage = store(local);
  w.sessionStorage = store(sess);
  const assigned = [], copied = [];
  let reloads = 0;
  w.location = {
    href: PAGE + (o.search || ''), search: o.search || '',
    assign(u) { assigned.push(String(u)); }, reload() { reloads++; }
  };
  w.history = { state: null, replaceState(st, t, url) { const u = new URL(url, w.location.href); w.location.href = u.href; w.location.search = u.search; } };
  w.addEventListener = () => {};
  w.removeEventListener = () => {};
  w.self = w;
  w.top = o.embed ? { frame: 'confluence' } : w;          // inEmbed(): window.self !== window.top
  w.navigator = { clipboard: { writeText: (t) => { copied.push(String(t)); return { then(ok) { if (ok) ok(); return this; } }; } } };
  global.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  ENV = { local: local, sess: sess, assigned: assigned, copied: copied, reloads: () => reloads };
  return ENV;
}
function hub(email, orgRole) {
  return JSON.stringify({ email: email, role: 'user', issuedAt: T0 - 60000, expiresAt: T0 + 8 * 3600000, orgRole: orgRole });
}

/* ------------------------------------------------------------ the in-memory broker */
const ALL = [];                          // every request any broker saw, for the suite-wide write check
const FOREIGN = [];                      // any request for another address (refused)
function broker(o) {
  o = o || {};
  const B = { docs: {}, log: [], token: o.token || TOKEN, roster: clone(o.roster || SEED.roster), down: false, fail: null, beforePut: null };
  let n = 0;
  B.save = (id, doc) => { const cur = B.docs[id]; B.docs[id] = { doc: clone(doc), version: (cur ? cur.version : 0) + 1, etag: 'e' + (++n) + '-' + id }; return B.docs[id]; };
  if (!o.empty) {
    B.save('portfolio', SEED.portfolio);
    Object.keys(SEED.docs).forEach((id) => { if ((o.skip || []).indexOf(id) < 0) B.save(id, SEED.docs[id]); });
    Object.keys(SEED.spec).forEach((id) => { if ((o.skip || []).indexOf(id) < 0) B.save(id, SEED.spec[id]); });
    B.save('gantt-view', { overrides: {} });          // today's pass-through document: Calm never reads or writes it
    B.save('SPEC-DIV-BD', { keyResults: [], stageGates: [], kpis: [], kpiUpdates: [], modelSpec: {} });   // a business division has no spec to read
  }
  B.gets = () => B.log.filter((r) => r.method === 'GET').map((r) => r.path);
  B.puts = () => B.log.filter((r) => r.method === 'PUT');
  return B;
}
async function serve(B, url, opts) {
  const base = NET().BROKER;
  if (String(url).indexOf(base + '/') !== 0) { FOREIGN.push(String(url)); throw new TypeError('refused: not the broker'); }
  const p = String(url).slice(base.length);
  const method = (opts && opts.method) || 'GET';
  const h = (opts && opts.headers) || {};
  const r = { method: method, path: p, ifMatch: h['If-Match'] == null ? null : String(h['If-Match']), auth: h.Authorization || '' };
  if (opts && opts.body) { const body = JSON.parse(opts.body); r.client = body.client; r.doc = body.doc; }
  B.log.push(r); ALL.push(r);
  const res = (status, data) => { r.status = status; return { status: status, ok: status >= 200 && status < 300, json: async () => clone(data) }; };
  if (B.down) { r.status = 'offline'; throw new TypeError('Failed to fetch'); }
  if (r.auth !== 'Bearer ' + B.token) return res(401, { error: 'bad token' });
  const forced = B.fail ? B.fail(r) : 0;
  if (forced) return res(forced, { error: 'forced' });
  let m;
  if (p === '/roster' && method === 'GET') return res(200, { users: B.roster });
  if ((m = /^\/state\/([^/]+)\/version$/.exec(p)) && method === 'GET') {
    const d = B.docs[decodeURIComponent(m[1])];
    return d ? res(200, { version: d.version, etag: d.etag }) : res(404, { error: 'no document' });
  }
  if ((m = /^\/state\/([^/]+)$/.exec(p))) {
    const id = decodeURIComponent(m[1]);
    if (method === 'GET') { const d = B.docs[id]; return d ? res(200, { doc: d.doc, etag: d.etag, version: d.version }) : res(404, { error: 'no document' }); }
    if (method === 'PUT') {
      if (B.beforePut) { const f = B.beforePut; B.beforePut = null; f(r); }    // another editor saves first, once
      const cur = B.docs[id];
      if (r.ifMatch !== (cur ? cur.etag : '0')) return res(412, { error: 'precondition failed' });
      const saved = B.save(id, r.doc);
      return res(200, { etag: saved.etag, version: saved.version });
    }
  }
  return res(404, { error: 'unknown' });
}

/* ------------------------------------------------------------ driving a board */
const tick = () => new Promise((r) => setImmediate(r));
/* let the kit's promises run; ms advances the driver's clock first (700 ms debounce, 2.5 s cap) */
async function settle(s, ms) {
  for (let i = 0; i < 25; i++) { await tick(); s.flush(i === 0 && ms ? ms : 0); }
  return s.render();
}
/* a board as the page starts (before componentDidMount): o = { broker, token, hub, search, embed, session, file } */
function open(o) {
  o = o || {};
  use(o.file || FILE);
  const local = {};
  if (o.token !== null) local.rd_broker_token = o.token || TOKEN;
  if (o.hub) local.hub_session_v1 = o.hub;
  const B = o.broker || null;
  global.fetch = (url, opts) => (B ? serve(B, url, opts) : Promise.reject(new TypeError('Failed to fetch')));
  env({ local: local, session: o.session, search: o.search, embed: o.embed });   // the board's window gets the same fetch
  const s = new Sim(o.file || FILE);
  s.B = B;
  s.env = ENV;
  return s;
}
async function boot(o) {
  const s = open(o);
  s.c.componentDidMount();
  await settle(s);
  return s;
}
const toasts = (s) => (s.c.state.toasts || []).map((t) => t.text);
const hasToast = (s, t) => toasts(s).some((x) => x.indexOf(t) >= 0);
const go = (s, tab) => s.click(tab, { tag: 'button', within: 'Views' });
const obj = (P, id) => (P.objectives || []).find((o) => o.id === id);
const qNow = (s) => s.ns.F.qOfDay(s.c.D.today);
const pending = [];
const R = new Sim(FILE);                 // a reporter for steps that fail before they have a board
function step(label, fn) {
  pending.push(async () => {
    try { await fn(); } catch (e) { R.ok(false, 'step "' + label + '": ' + jsWhere(BOARD.parsed, String(e && e.stack || e)).split('\n').slice(0, 6).join('\n     ')); }
  });
}
/* a random walk over everything clickable, Settings aside (its token and load buttons have their own steps);
   saving: let the kit's saves run now and then. Returns '' or the handler that threw. */
async function walk(s, steps, seed, saving) {
  let x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const VALUES = ['', '1', '2026-11-05', 'abc', '75', 'Renamed', '2027Q1', '3'];
  for (let i = 0; i < steps; i++) {
    if (s.c.sheet() && s.c.sheet().kind === 'shell.settings') { s.c.closeAllSheets(); s.render(); }
    const hs = [];
    s.els.forEach((el) => Object.keys(el.on).forEach((nm) => { if (el.attrs['aria-label'] !== 'Settings') hs.push({ el: el, n: nm }); }));
    if (!hs.length) break;
    const h = hs[Math.floor(rand() * hs.length)];
    let value = VALUES[Math.floor(rand() * VALUES.length)];
    if (h.el.tag === 'select') {
      const opts = s.els.filter((e) => e.tag === 'option' && (e.parent === h.el || (e.parent && e.parent.parent === h.el)));
      if (opts.length) value = String(opts[Math.floor(rand() * opts.length)].attrs.value);
    }
    try {
      h.el.on[h.n](s.ev(h.el, { key: rand() < 0.3 ? 'Enter' : 'a', target: { value: value, checked: rand() < 0.5, dataset: {} }, clientX: Math.floor(rand() * 900) }));
      if (saving && rand() < 0.15) await settle(s, 3000); else s.render();
    } catch (e) { return h.n + ' "' + (textOf(h.el) || h.el.attrs['aria-label'] || h.el.tag).slice(0, 40) + '": ' + e.message; }
  }
  return '';
}
/* edit an objective's statement through the UI, as a person would */
function editObjective(s, from, to) {
  go(s, 'Structure');
  s.click('More actions for ' + from);
  s.click('Edit');
  s.type('Statement', to, { within: 'Editor' });
  s.click('Save objective', { within: 'Editor' });
}
const DOCS = ['EXEC-DIV-FC', 'SPEC-DIV-FC', 'EXEC-DIV-EL', 'SPEC-DIV-EL', 'BIZ-DIV-BD', 'BIZ-DIV-PT'];

/* ===================================================================== loading */
step('the page starts empty, says it is loading, and asks the broker for nothing yet', async () => {
  const B = broker();
  const s = open({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  s.eq('nothing requested before the page mounts', B.log.length, 0);
  s.eq('loading phase', s.c.state.pl_load.phase, 'loading');
  s.expect('Loading the plan from the broker…');
  s.ok(!s.vals.sh.ready, 'the views wait for the first load');
  s.ok(!s.has('Add unit') && !s.has('Company'), 'no plan content while loading');
  s.eq('save indicator', s.vals.sh.save.text, 'Loading…');
  s.ok(!s.vals.sh.save.showBtn, 'no Save button before anything is loaded');
  s.eq('nothing loaded, so the view is read-only', s.c.ctx.ro, true);
  s.ok(!s.vals.sh.roOn, 'but the top bar shows no Read-only marker for that');
  s.clean('loading');
});

step('every division\'s documents load, and nothing is written on load', async () => {
  const B = broker({ skip: ['BIZ-DIV-PT'] });          // one document the broker doesn't have yet (404)
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  const gets = B.gets();
  s.eq('roster, then the portfolio', gets.slice(0, 2), ['/roster', '/state/portfolio']);
  s.eq('then each division\'s execution document and each R&D division\'s spec', gets.slice(2).sort(), DOCS.map((id) => '/state/' + id).sort());
  s.ok(gets.indexOf('/state/gantt-view') < 0, 'gantt-view is never read');
  s.ok(gets.indexOf('/state/SPEC-DIV-BD') < 0 && gets.indexOf('/state/SPEC-DIV-PT') < 0, 'business divisions have no spec to read');
  s.eq('the stored token on every call', B.log.every((r) => r.auth === 'Bearer ' + TOKEN), true);
  s.eq('execution documents in C.D.docs', Object.keys(s.c.D.docs).sort(), ['BIZ-DIV-BD', 'BIZ-DIV-PT', 'EXEC-DIV-EL', 'EXEC-DIV-FC']);
  s.eq('spec documents in C.D.spec', Object.keys(s.c.D.spec).sort(), ['SPEC-DIV-EL', 'SPEC-DIV-FC']);
  s.eq('a missing document is a blank one', [s.c.D.docs['BIZ-DIV-PT'].keyResults, s.c.D.docs['BIZ-DIV-PT'].stageGates], [[], []]);
  s.eq('the portfolio as the broker has it', s.c.D.portfolio.objectives.length, SEED.portfolio.objectives.length);
  s.eq('NET registry', NET().info(s.c).docs.sort(), ['portfolio'].concat(DOCS).sort());
  s.eq('loaded', [s.c.state.pl_load.phase, s.c.state.pl_load.loaded, s.vals.sh.ready], ['ok', true, true]);
  s.eq('no banner', s.vals.sh.load, null);
  s.expect('Saved just now');
  s.expect('Company').expect('Fuel Cell').expect('Electrolyzer').expect('Business Development');
  s.ok(!hasToast(s, 'Loaded portfolio'), 'the page\'s own first load is quiet (the person did not ask for it)');
  await settle(s, 3000);
  s.eq('nothing written on load', B.puts().length, 0);
  s.eq('one poll timer', INTERVALS.length > 0 && INTERVALS[INTERVALS.length - 1].ms, 25000);
  s.clean('loaded');
  /* the scores are the engine's, on the loaded documents */
  const RD = s.ns.RD;
  const m = {};
  Object.keys(s.c.D.docs).forEach((k) => { m[k.replace(/^(EXEC|BIZ)-/, '')] = s.c.D.docs[k]; });
  s.eq('company score', s.vals.pov.company.score, s.ns.F.score(RD.rollupCompany(s.c.D.portfolio, RD.withPortfolio(s.c.D.portfolio, m))));
  for (const tab of ['Structure', 'Gantt', 'Milestones', 'Overview']) { go(s, tab); s.clean('tab ' + tab); }
});

/* ===================================================================== who may write */
step('the CTO (Hub sign-in) edits an objective: only the portfolio is PUT, by client calm-1', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  s.eq('signed in from the Hub', [s.c.viewer().email, s.c.viewer().role, s.c.canEditPlan()], ['corey@celadyne.com', 'CTO', true]);
  s.eq('no View only banner', s.vals.sh.lock, null);
  const etag0 = B.docs.portfolio.etag;
  editObjective(s, 'Run full roll-to-roll membrane production', 'Run full roll-to-roll membrane production at 2 m/min');
  s.eq('changed here at once', obj(s.c.D.portfolio, 'OBJ-FC-2026Q4-01').statement, 'Run full roll-to-roll membrane production at 2 m/min');
  s.expect('Saving…');
  s.eq('not before the 700 ms debounce', B.puts().length, 0);
  await settle(s, 800);
  const puts = B.puts();
  s.eq('one PUT', puts.length, 1);
  s.eq('of the portfolio', puts.map((r) => r.path), ['/state/portfolio']);
  s.eq('client calm-1, If-Match the loaded etag', [puts[0].client, puts[0].ifMatch, puts[0].status], ['calm-1', etag0, 200]);
  s.eq('the whole document, with the change', obj(puts[0].doc, 'OBJ-FC-2026Q4-01').statement, 'Run full roll-to-roll membrane production at 2 m/min');
  s.eq('the broker has it', obj(B.docs.portfolio.doc, 'OBJ-FC-2026Q4-01').statement, 'Run full roll-to-roll membrane production at 2 m/min');
  s.expect('Saved just now');
  /* a second change goes out with the etag the first save got back */
  const etag1 = B.docs.portfolio.etag;
  editObjective(s, 'Lock Tera 25-30-R5 components', 'Lock every Tera 25-30-R5 component');
  await settle(s, 800);
  s.eq('second PUT, If-Match the first save\'s etag', [B.puts().length, B.puts()[1].ifMatch, B.puts()[1].status], [2, etag1, 200]);
  s.ok(etag1 !== etag0, 'the etag moved on');
  /* the Save button flushes; nothing else is written */
  s.click('Save');
  await settle(s);
  s.ok(hasToast(s, 'Saved.'), 'Save says Saved.');
  s.eq('still only portfolio PUTs', B.puts().every((r) => r.path === '/state/portfolio' && r.client === 'calm-1'), true);
  s.clean('after edits');
});

step('a lead (Hub sign-in) sees the plan view only and nothing is ever written', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('toru@celadyne.com', 'lead') });
  s.eq('a lead', [s.c.viewer().email, s.c.viewer().role, s.c.canEditPlan()], ['toru@celadyne.com', 'Lead', false]);
  s.expect('You can see the whole plan. Changes are made by the CTO and CEO: ' + EDITORS + '.');
  s.eq('top-bar marker', [s.vals.sh.roOn, s.vals.sh.roLabel], [true, 'View only']);
  s.ok(!s.vals.sh.save.showBtn, 'no Save button');
  go(s, 'Structure');
  s.ok(!s.has('Add unit') && !s.has('Add division'), 'no add buttons');
  const before = JSON.stringify(s.c.D.portfolio);
  s.ns.PED.open(s.c, s.c.ctx, 'objective', 'OBJ-EL-2026Q4-01'); s.render();
  s.eq('the editor is refused', s.c.sheet(), null);
  s.ok(hasToast(s, 'Planning changes are made by the CTO and CEO (' + EDITORS + ').'), 'with the reason');
  s.eq('C.mutate refuses', s.c.mutate((D) => { D.portfolio.objectives[0].statement = 'hacked'; }), false);
  const threw = await walk(s, 600, 17, false);
  await settle(s, 3000);
  s.eq('no handler failed', threw, '');
  s.eq('the portfolio is untouched', JSON.stringify(s.c.D.portfolio), before);
  s.eq('nothing was PUT', B.puts().length, 0);
  s.clean('lead');
});

step('a random walk as the CTO: every write is a portfolio PUT and the broker ends with the page\'s plan', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  const threw = await walk(s, 900, 29, true);
  await settle(s, 3000);
  await settle(s, 3000);
  s.eq('no handler failed', threw, '');
  s.ok(B.puts().length > 0, 'the walk changed the plan (' + B.puts().length + ' saves)');
  s.eq('every write a portfolio PUT by calm-1, none refused', B.puts().filter((r) => !(r.path === '/state/portfolio' && r.client === 'calm-1' && r.status === 200)).length, 0);
  s.eq('nothing left unsaved', NET().info(s.c).pending, 0);
  s.eq('the broker has exactly the page\'s plan', JSON.stringify(B.docs.portfolio.doc), JSON.stringify(s.c.D.portfolio));
  s.eq('execution and spec documents untouched on the broker', DOCS.filter((id) => B.docs[id]).every((id) => B.docs[id].version === 1), true);
  s.clean('after the walk');
});

step('an engineer (ic) cannot change the plan either', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('priya@celadyne.com', 'ic') });
  s.eq('an engineer, view only', [s.c.viewer().role, s.c.canEditPlan(), s.c.ctx.ro], ['Engineer', false, true]);
  s.eq('C.mutate refuses', s.c.mutate((D) => { D.portfolio.units[0].name = 'x'; }), false);
  await settle(s, 3000);
  s.eq('nothing was PUT', B.puts().length, 0);
});

step('the broker\'s roster decides the role, not the Hub session', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('ken@celadyne.com', 'cto') });   // the roster says Ken is an engineer
  s.eq('roster role wins', [s.c.viewer().role, s.c.canEditPlan()], ['Engineer', false]);
  s.expect('You can see the whole plan.');
});

/* ===================================================================== the page's parameters */
step('?tab=gantt&division=DIV-FC&quarter=active applies from the first frame and after the load', async () => {
  const B = broker();
  const s = open({ broker: B, hub: hub('corey@celadyne.com', 'cto'), search: '?tab=gantt&division=DIV-FC&quarter=active' });
  const q = qNow(s);
  s.eq('before the load', [s.c.state.tab, s.c.state.f.div, s.c.state.f.q], ['gantt', 'DIV-FC', q]);
  s.c.componentDidMount();
  await settle(s);
  s.eq('after the load', [s.c.state.tab, s.c.state.f.div, s.c.state.f.q, s.c.state.f.prod, s.c.state.ro, s.c.state.present], ['gantt', 'DIV-FC', q, '', false, false]);
  s.ok(/^\d{4}Q[1-4]$/.test(q), 'active = the current calendar quarter (' + q + ')');
  s.ok(s.vals.sh.pageCls.indexOf('wide') >= 0, 'the Gantt view');
  s.expect('Division: Fuel Cell');
  s.expect('Quarter: ' + s.ns.F.q(q));
  s.eq('the hand-off store is untouched', s.env.sess['celadyne-calm-open'], undefined);
  s.clean('gantt link');
});

step('parameter names in any case; ganttActive and ganttQuarter; tab=portfolio is Structure', async () => {
  const s = await boot({ broker: broker(), hub: hub('corey@celadyne.com', 'cto'), search: '?TAB=Portfolio&Division=DIV-EL&Unit=UNIT-TECHNI&product=PRD-EL-1&quarter=2026Q4&GanttActive=1&ganttquarter=true' });
  s.eq('applied', [s.c.state.tab, s.c.state.f.div, s.c.state.f.unit, s.c.state.f.prod, s.c.state.f.q, s.c.state.pg_active, s.c.state.pg_timeframe], ['structure', 'DIV-EL', 'UNIT-TECHNI', 'PRD-EL-1', '2026Q4', true, true]);
  s.eq('still editable', [s.c.state.ro, s.c.ctx.ro], [false, false]);
});

step('?present: read-only from the first frame, chrome hidden, and Exit present mode lifts it', async () => {
  const B = broker();
  const s = open({ broker: B, hub: hub('corey@celadyne.com', 'cto'), search: '?present=1&tab=milestones' });
  s.eq('present and read-only before the load', [s.c.state.present, s.c.state.ro, s.c.state.tab], [true, true, 'milestones']);
  s.ok(!s.has('Views'), 'no sidebar, even while loading');
  s.c.componentDidMount();
  await settle(s);
  s.eq('after the load', [s.c.state.present, s.c.state.ro, s.c.ctx.ro], [true, true, true]);
  s.expect('Present mode, read-only');
  s.ok(!s.has('Settings', { tag: 'button' }), 'no top bar');
  s.click('Exit present mode');
  s.eq('present off lifts the read-only it implied', [s.c.state.present, s.c.state.ro], [false, false]);
  await settle(s, 3000);
  s.eq('nothing written', B.puts().length, 0);
});

step('?readonly (any value, as today and as the kit reads it) turns editing off for the CTO too', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto'), search: '?readonly=0' });
  s.eq('read-only', [s.c.state.ro, s.c.ctx.ro, s.vals.sh.roLabel], [true, true, 'Read-only']);
  s.eq('C.mutate refuses', s.c.mutate((D) => { D.portfolio.units[0].name = 'x'; }), false);
  s.ok(hasToast(s, 'Read-only view — editing is disabled.'), 'with the read-only message');
  await settle(s, 3000);
  s.eq('nothing written', B.puts().length, 0);
});

step('?tab=settings opens Settings over the Overview once loaded', async () => {
  const s = await boot({ broker: broker(), hub: hub('corey@celadyne.com', 'cto'), search: '?tab=settings' });
  s.eq('Overview with Settings open', [s.c.state.tab, s.c.sheet() && s.c.sheet().kind], ['overview', 'shell.settings']);
});

/* ===================================================================== hand-off from another app */
step('a hand-off waits for the documents, then opens the objective\'s lineage', async () => {
  const B = broker();
  const handoff = JSON.stringify({ app: 'plan', tab: 'structure', objective: 'OBJ-EL-2026Q4-01' });
  const s = open({ broker: B, hub: hub('corey@celadyne.com', 'cto'), session: { 'celadyne-calm-open': handoff } });
  s.eq('not read while nothing is loaded', [s.env.sess['celadyne-calm-open'], s.c.state.tab, (s.c.state.sheets || []).length], [handoff, 'overview', 0]);
  s.c.componentDidMount();
  await settle(s);
  s.eq('read once loaded', s.env.sess['celadyne-calm-open'], undefined);
  s.eq('tab and lineage', [s.c.state.tab, s.c.sheet() && s.c.sheet().kind, s.c.state.focus], ['structure', 'ped.lineage', { type: 'objective', id: 'OBJ-EL-2026Q4-01' }]);
  s.expect('Qualify the 10-cell short stack for durability testing');
  s.clean('hand-off');
  /* a reload keeps the view, and does not take a later hand-off */
  s.c.closeAllSheets(); go(s, 'Milestones');
  s.env.sess['celadyne-calm-open'] = JSON.stringify({ app: 'plan', objective: 'OBJ-FC-2026Q4-01' });
  await NET().reload(s.c); await settle(s);
  s.eq('reload keeps the view', [s.c.state.tab, (s.c.state.sheets || []).length], ['milestones', 0]);
  s.ok(!!s.env.sess['celadyne-calm-open'], 'a reload leaves a hand-off for the next page load');
});

step('parameters win over a hand-off (which is still used up)', async () => {
  const s = await boot({ broker: broker(), hub: hub('corey@celadyne.com', 'cto'), search: '?tab=gantt', session: { 'celadyne-calm-open': JSON.stringify({ app: 'plan', objective: 'OBJ-EL-2026Q4-01' }) } });
  s.eq('the link\'s view, no lineage', [s.c.state.tab, (s.c.state.sheets || []).length], ['gantt', 0]);
  s.eq('hand-off used up', s.env.sess['celadyne-calm-open'], undefined);
});

/* ===================================================================== conflicts and other editors */
step('412: another editor changed a different objective; the merge keeps both and saves', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  const etag0 = B.docs.portfolio.etag;
  B.beforePut = () => {                     // Dana saves first, on another objective
    const theirs = clone(B.docs.portfolio.doc);
    obj(theirs, 'OBJ-EL-2026Q4-02').statement = 'Lock Tera components (Dana)';
    B.save('portfolio', theirs);
  };
  editObjective(s, 'Run full roll-to-roll membrane production', 'Run roll-to-roll production at 2 m/min');
  await settle(s, 800);
  const puts = B.puts();
  s.eq('a refused PUT, then the merged one', puts.map((r) => [r.path, r.status]), [['/state/portfolio', 412], ['/state/portfolio', 200]]);
  s.eq('first If-Match was the loaded etag', puts[0].ifMatch, etag0);
  s.ok(puts[1].ifMatch !== etag0, 'the merged PUT matches their etag');
  const last = puts[1].doc;
  s.eq('both changes in the final PUT', [obj(last, 'OBJ-FC-2026Q4-01').statement, obj(last, 'OBJ-EL-2026Q4-02').statement], ['Run roll-to-roll production at 2 m/min', 'Lock Tera components (Dana)']);
  s.eq('and on the page', [obj(s.c.D.portfolio, 'OBJ-FC-2026Q4-01').statement, obj(s.c.D.portfolio, 'OBJ-EL-2026Q4-02').statement], ['Run roll-to-roll production at 2 m/min', 'Lock Tera components (Dana)']);
  s.ok(hasToast(s, 'Saved, merged with a change another editor saved first.'), 'says it merged');
  s.eq('client calm-1 on both', puts.map((r) => r.client), ['calm-1', 'calm-1']);
  s.expect('Saved just now');
  s.clean('merged');
});

step('412 that clashes (they deleted what I changed): their plan loads, nothing more is written', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  B.beforePut = () => {
    const theirs = clone(B.docs.portfolio.doc);
    theirs.objectives = theirs.objectives.filter((o) => o.id !== 'OBJ-FC-2026Q4-01');
    B.save('portfolio', theirs);
  };
  editObjective(s, 'Run full roll-to-roll membrane production', 'Changed here');
  await settle(s, 800);
  s.eq('one refused PUT only', B.puts().map((r) => r.status), [412]);
  s.eq('their version is loaded', obj(s.c.D.portfolio, 'OBJ-FC-2026Q4-01'), undefined);
  s.ok(hasToast(s, 'Another editor changed the same part of the plan first. Their version is loaded; re-apply your change.'), 're-apply message');
  s.ok(WARN.some((w) => /merge gave up: objectives\[OBJ-FC-2026Q4-01\]/.test(w)), 'the kit logs the clash');
  await settle(s, 3000);
  s.eq('still nothing more written', B.puts().length, 1);
});

step('polling brings another editor\'s change in without writing anything', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  const theirs = clone(B.docs.portfolio.doc);
  obj(theirs, 'OBJ-EL-2027Q1-01').statement = 'Cut stack cost 20%';
  B.save('portfolio', theirs);
  await NET().poll(s.c); await settle(s);
  s.eq('their change is here', obj(s.c.D.portfolio, 'OBJ-EL-2027Q1-01').statement, 'Cut stack cost 20%');
  s.ok(hasToast(s, 'Updated from another editor.'), 'Updated from another editor.');
  s.eq('nothing written', B.puts().length, 0);
});

/* ===================================================================== load phases */
step('no token: today\'s message, a way to Settings, and no request at all', async () => {
  const B = broker();
  const s = await boot({ broker: B, token: null, hub: hub('corey@celadyne.com', 'cto'), search: '?tab=gantt' });
  s.eq('phase', s.c.state.pl_load.phase, 'notoken');
  s.expect('No broker token in this browser yet. Open this app from the Hub, or add the token in Settings.');
  s.eq('no request', B.log.length, 0);
  s.ok(!s.vals.sh.ready, 'nothing to show');
  s.eq('indicator', s.vals.sh.save.text, 'Not loaded');
  s.click('Open Settings', { within: 'load' });
  s.eq('Settings opens', s.c.sheet() && s.c.sheet().kind, 'shell.settings');
  s.expect('No token set — add one to load live data.');
  s.click('Save token');
  s.ok(hasToast(s, 'Paste the token first.'), 'an empty token is not saved');
  s.type('Broker token', TOKEN);
  s.click('Save token');
  s.ok(hasToast(s, 'Token saved.'), 'Token saved.');
  await settle(s);
  s.eq('stored in this browser', s.env.local.rd_broker_token, TOKEN);
  s.eq('loaded', [s.c.state.pl_load.phase, s.vals.sh.ready], ['ok', true]);
  s.ok(hasToast(s, 'Loaded portfolio + 4 exec + 2 spec docs.'), 'the load message (the person asked for it)');
  s.eq('the link\'s view, set when the page started, holds after its first successful load', [s.c.state.tab, s.c.state.f.div], ['gantt', '']);
  s.eq('draft cleared', s.c.state.bkDraft, '');
  /* the kit hands the page's parameters to the first successful load, which opens the link's view afresh
     (closing Settings); a kit that hands them only to the page's first attempt leaves Settings open */
  if (!(s.c.sheet() && s.c.sheet().kind === 'shell.settings')) s.click('Settings');
  s.expect('Token set. Live sync active.');
  s.ok(s.text.indexOf(TOKEN) < 0, 'the token itself is never on screen');
  s.clean('token saved');
});

step('the broker refuses the token (401)', async () => {
  const B = broker({ token: 'the-right-one' });
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  s.eq('phase', [s.c.state.pl_load.phase, s.c.state.pl_load.status], ['badtoken', 401]);
  s.expect('The broker didn’t accept the token (401). Check it in Settings.');
  s.ok(s.has('Open Settings'), 'a way to fix it');
  s.ok(!s.vals.sh.ready, 'nothing shown');
});

step('a failed load says so with the status', async () => {
  const B = broker();
  B.fail = (r) => (r.path === '/state/portfolio' && r.method === 'GET' ? 500 : 0);
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  s.eq('phase', [s.c.state.pl_load.phase, s.c.state.pl_load.status], ['fail', 500]);
  s.expect('Load failed (500). Check the token in Settings.');
  s.clean('fail');
});

step('offline at load: Try again once the connection is back', async () => {
  const B = broker();
  B.down = true;
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  s.eq('phase', s.c.state.pl_load.phase, 'offline');
  s.expect('Couldn’t reach the broker. Check your connection; this page keeps trying.');
  s.eq('indicator', s.vals.sh.save.text, 'Offline');
  B.down = false;
  s.click('Try again');
  await settle(s);
  s.eq('loaded', [s.c.state.pl_load.phase, s.vals.sh.ready, s.vals.sh.load], ['ok', true, null]);
  s.ok(hasToast(s, 'Loaded portfolio + 4 exec + 2 spec docs.'), 'load message');
});

step('offline at load: the kit tries again by itself (when it retries), quietly', async () => {
  if (BOARD.parsed.script.indexOf('function retryLoad') < 0) { console.log('skip: this kit does not retry a failed load by itself'); return; }
  const B = broker();
  B.down = true;
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto'), search: '?tab=milestones' });
  s.eq('offline first', s.c.state.pl_load.phase, 'offline');
  B.down = false;
  await settle(s, 6000);
  s.eq('loaded by the retry', [s.c.state.pl_load.phase, s.vals.sh.ready, s.c.state.tab], ['ok', true, 'milestones']);
  s.ok(!hasToast(s, 'Loaded portfolio'), 'nobody asked, so no load message');
});

step('a reload that fails after a good load keeps the plan on screen and says why', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  go(s, 'Structure');
  B.fail = (r) => (r.path === '/state/portfolio' && r.method === 'GET' ? 503 : 0);
  s.click('Settings');
  s.click('Load from the broker');
  await settle(s);
  s.eq('phase', [s.c.state.pl_load.phase, s.c.state.pl_load.status], ['fail', 503]);
  s.ok(hasToast(s, 'Load failed (503). Check the token in Settings.'), 'the person asked: told how it went');
  s.c.closeAllSheets(); s.render();
  s.expect('Load failed (503). Check the token in Settings.');
  s.eq('the plan stays on screen, on the same view', [s.vals.sh.ready, s.c.state.tab], [true, 'structure']);
  s.expect('Run full roll-to-roll membrane production');
  s.eq('nothing written', B.puts().length, 0);
});

step('a lost connection while editing keeps the change and saves it when the broker answers again', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  B.down = true;
  editObjective(s, 'Cut stack cost 18%', 'Cut stack cost 19%');
  await settle(s, 800);
  s.eq('offline, change kept', [s.vals.sh.save.text, obj(s.c.D.portfolio, 'OBJ-EL-2027Q1-01').statement], ['Offline, changes kept here', 'Cut stack cost 19%']);
  B.down = false;
  await NET().poll(s.c); await settle(s);
  const ok = B.puts().filter((r) => r.status === 200);
  s.eq('saved when back', [ok.length, ok.length && obj(ok[0].doc, 'OBJ-EL-2027Q1-01').statement], [1, 'Cut stack cost 19%']);
  s.expect('Saved just now');
});

step('an out-of-date page (426) is told to reload', async () => {
  const B = broker();
  B.fail = (r) => (r.method === 'PUT' ? 426 : 0);
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  editObjective(s, 'Cut stack cost 18%', 'Cut stack cost 17%');
  await settle(s, 800);
  s.eq('phase', s.c.state.pl_load.phase, 'outdated');
  s.expect('This page is out of date. Reload it to keep working.');
  s.expect('Not saved: reload this page.');
  s.eq('no more editing on an out-of-date page', s.c.ctx.ro, true);
  go(s, 'Structure');
  s.ok(!s.has('Add unit'), 'editing controls hidden');
  s.click('Reload the page');
  s.eq('reloads the page', s.env.reloads(), 1);
});

/* ===================================================================== Settings */
step('Settings: no simulations; the broker section works on the real connection', async () => {
  const B = broker();
  const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto') });
  s.click('Settings');
  for (const t of ['Simulate sync', 'A teammate saves a change', 'Next save: conflict that merges', 'The broker can\'t be reached (offline)', 'The broker rejects the token (401)', 'Restore the sample data', 'Sample data', 'These settings apply to this prototype only.']) s.expectNot(t);
  for (const t of ['Hub sign-in', 'Appearance', 'Preview the read-only view', 'Present mode', 'Broker', 'Link to a view']) s.expect(t);
  s.expect('Token set. Live sync active.');
  s.expect('Last loaded just now.');
  s.expect('You can change the plan.');
  const sel = s.find('Signed in as', { tag: 'select' });
  s.eq('the Hub picker is fixed', [sel.attrs.disabled, s.vals.sh.settings.hub.value], [true, 'corey@celadyne.com']);
  s.expect('From your Hub sign-in (corey@celadyne.com). To see someone else’s view, sign in as them in the Hub.');
  const n0 = B.gets().length;
  s.click('Load from the broker');
  await settle(s);
  s.eq('loads again: portfolio and the six documents', B.gets().length - n0, 8);
  s.ok(hasToast(s, 'Loaded portfolio + 4 exec + 2 spec docs.'), 'load message');
  s.check('Preview the read-only view', true);
  s.eq('read-only preview', [s.c.state.ro, s.c.ctx.ro], [true, true]);
  s.check('Preview the read-only view', false);
  s.click('Dark');
  s.eq('theme remembered', [s.vals.theme, s.env.local.rd_theme], ['dark', 'dark']);
  s.ok(s.text.indexOf(TOKEN) < 0, 'the token is never on screen');
  s.clean('settings');
  s.click('Remove token');
  s.ok(hasToast(s, 'Token removed.'), 'Token removed.');
  await settle(s);
  s.eq('removed from this browser', s.env.local.rd_broker_token, undefined);
  s.eq('phase', s.c.state.pl_load.phase, 'notoken');
  s.expect('No token set — add one to load live data.');
  s.eq('stale plan stays to read, not to change', [s.vals.sh.ready, s.c.ctx.ro], [true, true]);
  s.eq('nothing written', B.puts().length, 0);
});

step('the link builder: Copy link carries the token, the screen never shows it, Open goes to the link', async () => {
  const s = await boot({ broker: broker(), hub: hub('corey@celadyne.com', 'cto') });
  s.click('Settings');
  s.type('Opens on', 'gantt');
  s.type('Division', 'DIV-FC', { within: 'Editor', nth: 0 });
  s.type('Quarter', 'active', { within: 'Editor' });
  s.check('Gantt: active work only', true);
  const plain = PAGE + '?tab=gantt&division=DIV-FC&quarter=active&ganttActive=1';
  s.eq('the link', s.vals.sh.settings.link.url, plain);
  s.check('Include the broker token (for an SSO-gated Confluence embed)', true);
  s.eq('shown with the token hidden', s.vals.sh.settings.link.url, plain + '&token=…');
  s.ok(s.text.indexOf(TOKEN) < 0, 'not on screen');
  s.click('Copy link');
  s.eq('copied with the token', s.env.copied, [plain + '&token=' + TOKEN]);
  s.ok(hasToast(s, 'Link copied.'), 'Link copied.');
  const before = JSON.stringify([s.c.state.tab, s.c.state.f]);
  s.click('Open this link here');
  s.eq('goes to the link (the page loads it fresh)', s.env.assigned, [plain + '&token=' + TOKEN]);
  s.eq('no simulated load here', JSON.stringify([s.c.state.tab, s.c.state.f]), before);
  s.type('Open a pasted link', 'javascript:alert(1)');
  s.click('Open');
  s.ok(hasToast(s, 'That isn’t a link Planning can open.'), 'only web links');
  s.eq('not followed', s.env.assigned.length, 1);
  s.type('Open a pasted link', '?tab=milestones&present=1');
  s.key('Open a pasted link', 'Enter');
  s.eq('a pasted query opens on this page', s.env.assigned[1], PAGE + '?tab=milestones&present=1');
});

/* ===================================================================== signed out, and Confluence embeds */
step('signed out inside a Confluence embed: View only, with a link to the full page', async () => {
  const B = broker();
  const s = await boot({ broker: B, embed: true, search: '?tab=gantt&present=0' });
  s.eq('signed out', [s.c.viewer(), s.c.canEditPlan()], [null, false]);
  s.expect('Inside a Confluence page your Hub sign-in isn’t visible, so the plan is view only here.');
  const a = s.find('Open the full page to edit', { tag: 'a' });
  s.eq('opens this same page in a new tab', [a.attrs.href, a.attrs.target, a.attrs.rel], [PAGE + '?tab=gantt&present=0', '_blank', 'noopener']);
  s.click('Settings');
  s.expect('Inside a Confluence page the browser hides your Hub sign-in. Open the full page to sign in and edit.');
  s.c.closeAllSheets(); s.render();
  s.eq('nothing written', B.puts().length, 0);
  s.clean('embed');
});

step('signed out on the full page: today\'s signed-out text, no link', async () => {
  const s = await boot({ broker: broker() });
  s.expect('You’re not signed in to the Hub, so the plan is view only. Changes are made by the CTO and CEO: ' + EDITORS + '.');
  s.ok(!s.has('Open the full page to edit'), 'no full-page link outside an embed');
  s.click('Settings');
  s.expect('Signed out: the plan is view only. Planning changes are made by the CTO and CEO (' + EDITORS + ').');
  s.expect('Sign in to the Hub, then reload this page.');
});

step('signed in inside an embed (the browser allowed it): the usual banners, no link', async () => {
  const s = await boot({ broker: broker(), embed: true, hub: hub('toru@celadyne.com', 'lead') });
  s.expect('You can see the whole plan. Changes are made by the CTO and CEO: ' + EDITORS + '.');
  s.ok(!s.has('Open the full page to edit'), 'no link for a signed-in viewer');
});

step('while the roster is still loading, the lock texts leave out the empty list of editors', async () => {
  const s = open({ broker: broker() });
  s.expect('You’re not signed in to the Hub, so the plan is view only. Changes are made by the CTO and CEO.');
  s.ok(s.text.indexOf('()') < 0 && s.text.indexOf('CEO: .') < 0, 'no empty brackets');
});

/* ===================================================================== no portfolio yet */
/* Today's Planning starts from a blank portfolio when the broker has none and saves it with If-Match "0" on the
   first change (APP_LIVE_PLAN's createPortfolio; the other apps stop at 'noportfolio'). */
step('no portfolio yet: the CTO starts the plan; it is PUT with If-Match "0"', async () => {
  const file = FILE;
  try {
    const B = broker({ empty: true });
    const s = await boot({ broker: B, hub: hub('corey@celadyne.com', 'cto'), file: file });
    s.eq('an empty plan, loaded', [s.c.state.pl_load.loaded, s.vals.sh.ready, s.c.ctx.ro], [true, true, false]);
    if (s.c.state.pl_load.phase === 'noportfolio') s.expect('There is no plan on the broker yet. Your first change creates it.');
    s.expect('No divisions yet. Add one in the Structure tab to begin.');
    s.eq('no documents to read', B.gets(), ['/roster', '/state/portfolio']);
    await settle(s, 3000);
    s.eq('nothing written until a change', B.puts().length, 0);
    go(s, 'Structure');
    s.click('Add unit');
    s.type('Name', 'Technical', { within: 'Editor' });
    s.click('Add unit', { within: 'Editor' });
    await settle(s, 800);
    const puts = B.puts();
    s.eq('created with If-Match "0"', puts.map((r) => [r.path, r.ifMatch, r.status, r.client]), [['/state/portfolio', '0', 200, 'calm-1']]);
    s.eq('the broker has the new plan', B.docs.portfolio.doc.units.map((u) => u.name), ['Technical']);
    s.eq('the banner is gone', s.vals.sh.load, null);
    const etagA = B.docs.portfolio.etag;
    s.click('Add unit');
    s.type('Name', 'Business', { within: 'Editor' });
    s.click('Add unit', { within: 'Editor' });
    await settle(s, 800);
    s.eq('then with the etag it got back', [B.puts().length, B.puts()[1].ifMatch, B.puts()[1].status], [2, etagA, 200]);
    const v = await boot({ broker: broker({ empty: true }), hub: hub('toru@celadyne.com', 'lead'), file: file });
    v.expect('There is no plan on the broker yet.');
    v.expectNot('Your first change creates it.');
    go(v, 'Structure');
    v.ok(!v.has('Add unit'), 'a lead cannot start the plan');
  } finally { /* nothing to clean up */ }
});

/* ===================================================================== run */
(async () => {
  for (const f of pending) await f();
  /* the suite-wide rule: Planning writes the portfolio and nothing else, always as client calm-1 */
  const writes = ALL.filter((r) => r.method !== 'GET');
  R.ok(writes.length > 0, 'the suite made writes to check');
  R.eq('every write is a PUT of the portfolio by calm-1', writes.filter((r) => !(r.method === 'PUT' && r.path === '/state/portfolio' && r.client === 'calm-1')).map((r) => r.method + ' ' + r.path), []);
  R.eq('never a gantt-view read or write', ALL.filter((r) => /gantt-view/.test(r.path)).length, 0);
  R.eq('no request ever left for another address', FOREIGN, []);
  done();
})();
