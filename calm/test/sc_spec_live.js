/* Product spec, LIVE build: the shell's broker hooks (apps/spec/shell.js) against an in-memory broker.
     node test/sc_spec_live.js                    builds the live board into out/live, then runs on it
                                                    (the sample board out/Spec-A.dc.html must be built: python3 build.py)
     node test/sc_spec_live.js out/live/Spec-A.dc.html [out/Spec-A.dc.html]     boards you built yourself:
                                                    python3 build.py spec && python3 build.py spec --flag=live --out=out/live
   The second board (the sample build) only supplies realistic documents for the fake broker.
   No network: `fetch` is replaced by a broker kept in memory that answers today's contract
     GET /state/<id> -> { doc, etag, version } or 404     GET /state/<id>/version -> { version, etag }
     PUT /state/<id> { doc, client } with If-Match (an etag, "0" for a new document) -> 200 or 412
     GET /roster -> { users }
   Each scenario gets fresh browser storage, a fresh address and a fresh broker, then mounts the board
   (componentDidMount -> NET.boot) and waits for the requests to settle. Helpers live in this file;
   test/dc.js is used as is. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
/* the Python that runs the build: RD_PYTHON (sweep.py and build.py --check set it), else `python` on Windows (python.org
   installs no python3 there) and `python3` elsewhere */
const PY = process.env.RD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

/* no board given (test/run_all.js runs it this way): build the live board, then run this file on it. Until
   October 15 this file expected a live board someone had built, so a fresh checkout failed here. */
if (require.main === module && !process.argv[2]) {
  try {
    execFileSync(PY, ['build.py', 'spec', '--flag=live', '--out=out/live'], { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    console.log('FAIL live build: ' + String((e.stdout || '') + (e.stderr || '') || e.message).trim().split('\n').slice(-3).join(' | '));
    console.log('0 passed, 1 failed');
    process.exitCode = 1;
    return;   // a CommonJS module may return at the top level
  }
  const r = spawnSync(process.execPath, [__filename, path.join('out', 'live', 'Spec-A.dc.html')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  const lines = String((r.stderr || '') + (r.stdout || '')).trim().split('\n');
  lines.forEach((l) => console.log(l));
  if (r.status !== 0 || !/ 0 failed$/.test(lines[lines.length - 1] || '')) process.exitCode = 1;
  return;
}

global.fetch = () => Promise.reject(new Error('this test never uses the network'));
const { Sim, load, done, textOf } = require('./dc');

const FILE = process.argv[2] || 'out/live/Spec-A.dc.html';
const SAMPLE = process.argv[3] || path.join(path.dirname(FILE), '..', 'Spec-A.dc.html');
if (!fs.existsSync(FILE)) { console.log('missing ' + FILE + ' (python3 build.py spec --flag=live --out=out/live)'); process.exit(1); }
if (!fs.existsSync(SAMPLE)) { console.log('missing ' + SAMPLE + ' (python3 build.py: the sample board lends the data)'); process.exit(1); }
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const tick = () => new Promise((r) => setImmediate(r));
const FOREIGN = [];   // any address but the broker's: refused, and the last check says none was asked for
/* the kit's console warnings and errors are collected (and checked at the end), so the summary stays the last line */
const WARN = [], ERR = [];
console.warn = (...a) => { WARN.push(a.map(String).join(' ')); };
console.error = (...a) => { ERR.push(a.map((x) => (x && x.stack ? x.stack : String(x))).join(' ')); };

/* ---- the documents the broker starts with: the sample build's own data (both builds read the same shapes) */
const SEED = (() => {
  const s0 = new Sim(SAMPLE);
  return clone({ portfolio: s0.c.D.portfolio, spec: { 'SPEC-DIV-FC': s0.c.D.spec['SPEC-DIV-FC'], 'SPEC-DIV-EL': s0.c.D.spec['SPEC-DIV-EL'] }, roster: s0.c.D.roster });
})();
const L = load(FILE);   // installs the driver's browser stubs; each scenario completes them below
const NET = L.ns.NET;
const W = global.window;
if (!NET) throw new Error(FILE + ' has no NET: build it with --flag=live');

/* ---- an in-memory broker with today's contract */
function makeBroker(docs, token) {
  let seq = 1;
  const B = {
    docs: {}, log: [], token: token, down: false, fail: {},
    hold: false, held: [],   // hold: answers wait until release()
    release() { B.held.splice(0).forEach((f) => f()); },
    roster: clone(SEED.roster.users),
    puts(id) { return B.log.filter((r) => r.method === 'PUT' && (!id || r.id === id)); },
    gets(id) { return B.log.filter((r) => r.method === 'GET' && r.id === id && !r.version); },
    /* another editor saves: change the stored document, new version and etag */
    edit(id, fn) { const d = B.docs[id]; fn(d.doc); d.version += 1; d.etag = 'e' + (++seq) + '-' + id; },
    fetch(url, o) {
      o = o || {};
      let u;
      try { u = new URL(String(url)); } catch (e) { u = null; }
      if (!u || u.origin !== NET.BROKER) { FOREIGN.push(String(url)); return Promise.reject(new TypeError('refused: not the broker')); }
      const method = o.method || 'GET';
      const h = o.headers || {};
      const m = /^\/state\/([^/]+)(\/version)?$/.exec(u.pathname);
      const rec = { method: method, host: u.origin, path: u.pathname, id: m ? decodeURIComponent(m[1]) : '', version: !!(m && m[2]), ifMatch: h['If-Match'], auth: h.Authorization, body: o.body ? JSON.parse(o.body) : undefined };
      B.log.push(rec);
      if (B.down) return Promise.reject(new TypeError('Failed to fetch'));
      if (B.hold) return new Promise((r) => B.held.push(() => r(B.answer(rec, u, method, h, m))));
      return B.answer(rec, u, method, h, m);
    },
    answer(rec, u, method, h, m) {
      const res = (status, data) => Promise.resolve({ status: status, ok: status >= 200 && status < 300, json: () => Promise.resolve(data) });
      if (h.Authorization !== 'Bearer ' + B.token) return res(401, { error: 'unauthorized' });
      const f = B.fail[u.pathname];
      if (f && (typeof f === 'number' || f.method === method)) return res(typeof f === 'number' ? f : f.status, { error: 'refused' });
      if (u.pathname === '/roster' && method === 'GET') return res(200, { users: B.roster });
      if (!m) return res(404, { error: 'no route' });
      const d = B.docs[rec.id];
      if (rec.version) return d ? res(200, { version: d.version, etag: d.etag }) : res(404, { error: 'not found' });
      if (method === 'GET') return d ? res(200, { doc: clone(d.doc), etag: d.etag, version: d.version }) : res(404, { error: 'not found' });
      if (method === 'PUT') {
        if (d ? rec.ifMatch !== d.etag : rec.ifMatch !== '0') return res(412, { error: 'precondition failed' });
        const nd = { doc: clone(rec.body.doc), version: d ? d.version + 1 : 1, etag: 'e' + (++seq) + '-' + rec.id };
        B.docs[rec.id] = nd;
        return res(200, { etag: nd.etag, version: nd.version });
      }
      return res(405, { error: 'method' });
    }
  };
  Object.keys(docs).forEach((id) => { B.docs[id] = { doc: clone(docs[id]), version: 3, etag: 'e1-' + id }; });
  return B;
}

/* ---- one scenario's browser: storage, address, history, listeners, timers NET uses, the broker */
function world(opts) {
  opts = opts || {};
  const ls = Object.assign({}, opts.local || {});
  if (opts.token !== null) ls.rd_broker_token = opts.token || 'tok-live';
  const ss = Object.assign({}, opts.session || {});
  const store = (o) => ({ getItem: (k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null), setItem: (k, v) => { o[k] = String(v); }, removeItem: (k) => { delete o[k]; } });
  const search = opts.search || '';
  const assigned = [];
  W.localStorage = store(ls);
  W.sessionStorage = store(ss);
  W.location = { href: 'https://hub.test/rd/product_designer.html' + search, search: search, hash: '', assign: (u) => assigned.push(u) };
  W.history = { state: null, replaceState(st, t, u) { const a = new URL(u, W.location.href); W.location.href = a.href; W.location.search = a.search; } };
  W.addEventListener = () => {};
  W.removeEventListener = () => {};
  global.document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };
  global.setInterval = () => 1;   // NET's 25 s poll: the scenarios call NET.poll themselves
  global.clearInterval = () => {};
  const docs = Object.assign({ portfolio: SEED.portfolio }, SEED.spec);
  (opts.drop || []).forEach((id) => { delete docs[id]; });
  const B = makeBroker(docs, opts.brokerToken || 'tok-live');
  global.fetch = (u, o) => B.fetch(u, o);
  const s = new Sim(FILE);
  /* every toast, also the ones a timer has already hidden */
  const toasts = [];
  const t0 = s.c.toast.bind(s.c);
  s.c.toast = (text, kind) => { toasts.push(String(text)); return t0(text, kind); };
  return { s: s, B: B, ls: ls, ss: ss, toasts: toasts, assigned: assigned, C: s.c };
}
async function settle(w, n) { for (let i = 0; i < (n || 40); i++) await tick(); w.s.render(); return w; }
async function boot(w) { w.C.componentDidMount(); return settle(w); }
/* let the autosave timers run (700 ms debounce, 2.5 s cap), then the writes */
async function saveCycle(w) { w.s.flush(3000); return settle(w); }
const banner = (w) => (w.C.state.sh_banner ? w.C.state.sh_banner.text : '');
const bannerTone = (w) => (w.C.state.sh_banner ? w.C.state.sh_banner.tone : '');
const saw = (w, t) => w.toasts.some((x) => x.indexOf(t) >= 0);
const sheetKind = (w) => { const sh = w.C.state.sheets || []; return sh.length ? sh[sh.length - 1].kind : ''; };
const crumb = (w) => textOf(w.s.all((el) => el.tag === 'nav' && el.attrs['aria-label'] === 'Breadcrumb')[0]);
const treeText = (w) => textOf(w.s.all((el) => el.tag === 'nav' && el.attrs['aria-label'] === 'Products')[0]);

async function step(s, label, fn) {
  try { await fn(); } catch (e) { s.ok(false, 'step "' + label + '" threw: ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 6).join('\n     ')); }
}
const BLANK = { keyResults: [], stageGates: [], kpis: [], kpiUpdates: [], modelSpec: {} };

async function main() {
  /* ================================================================ load: plan, defaults, nothing written */
  {
    const w = world({ session: { 'celadyne-calm-open': JSON.stringify({ app: 'plan', objective: 'OBJ-X' }) } });
    const s = w.s;
    await step(s, 'before the load: nothing read, empty states, no simulation', async () => {
      s.eq('nothing requested at construction', w.B.log.length, 0);
      s.eq('APP_INIT picked nothing (no data yet)', [w.C.state.divId, w.C.state.productId, w.C.state.modelId], ['', '', '']);
      s.expect('Loading products and models from the broker…');
      s.expect('Loading products…');
      s.ok(!s.has('Save now'), 'no Save button before anything is loaded');
      s.clean('live board before the load');
    });
    await boot(w);
    await step(s, 'APP_LIVE_PLAN: roster, portfolio, every R&D division\'s SPEC document', async () => {
      s.eq('requests in order', w.B.log.map((r) => r.method + ' ' + r.path), ['GET /roster', 'GET /state/portfolio', 'GET /state/SPEC-DIV-FC', 'GET /state/SPEC-DIV-EL']);
      s.ok(w.B.log.every((r) => r.host === NET.BROKER && r.auth === 'Bearer tok-live'), 'every request goes to the broker with the token');
      s.eq('plan', (() => { const p = planOf(w.C); return [p.roster, p.prefs, p.autoPass, p.docs(w.C.D.portfolio), ['portfolio', 'SPEC-DIV-EL', 'SPEC-DIV-BD', 'EXEC-DIV-EL', 'BIZ-DIV-BD'].map(p.writable)]; })(),
        [true, false, false, ['SPEC-DIV-FC', 'SPEC-DIV-EL'], [true, true, true, false, false]]);
      s.eq('documents installed as the broker has them', [w.C.D.spec['SPEC-DIV-FC'], w.C.D.spec['SPEC-DIV-EL'], w.C.D.portfolio], [w.B.docs['SPEC-DIV-FC'].doc, w.B.docs['SPEC-DIV-EL'].doc, w.B.docs.portfolio.doc]);
      s.eq('no business-division document', Object.keys(w.C.D.spec).sort(), ['SPEC-DIV-EL', 'SPEC-DIV-FC']);
      s.eq('loaded', [w.C.net.loaded, w.C.net.phase], [true, 'ok']);
    });
    await step(s, 'defaults: first division, product and model; rd_division stored; banner cleared', async () => {
      s.eq('first product division by order', w.C.state.divId, 'DIV-FC');
      s.eq('ctx resolves the first product and model', [s.c.ctx.productId, s.c.ctx.modelId], ['PRD-FC-1', 'MDL-FC-1-1']);
      s.ok(/Fuel Cell \/ HP membrane \/ HP6-12/.test(crumb(w)), 'breadcrumb');
      s.eq('rd_division stored (today L480)', w.ls.rd_division, 'DIV-FC');
      s.ok(saw(w, 'Loaded SPEC-DIV-FC.'), 'toast: Loaded SPEC-DIV-FC.');
      s.eq('loading banner cleared', w.C.state.sh_banner, null);
      s.eq('another app\'s hand-off left alone', w.ss['celadyne-calm-open'] != null, true);
      const t = treeText(w);
      s.ok(t.indexOf('Fuel Cell') >= 0 && t.indexOf('Electrolyzer') >= 0 && t.indexOf('Business Development') < 0, 'tree: product divisions only');
      s.ok(s.has('Save now'), 'Save button once loaded');
      s.expect('Saved just now');
      s.clean('after the load');
    });
    await step(s, 'nothing is written on load, after the autosave timers or a poll', async () => {
      await saveCycle(w);
      await NET.poll(w.C);
      await settle(w);
      s.eq('no PUT', w.B.puts().length, 0);
      s.eq('nothing pending', NET.dirty(w.C).length, 0);
      s.eq('poll asked for versions only', w.B.log.filter((r) => r.version).map((r) => r.id), ['portfolio', 'SPEC-DIV-FC', 'SPEC-DIV-EL']);
    });
    await step(s, 'switch division: no simulated failure, rd_division follows, nothing written', async () => {
      s.click('~Tera 25-30-R5');
      s.ok(saw(w, 'Switched to Electrolyzer.'), 'toast');
      s.eq('selection', [w.C.state.divId, s.c.ctx.modelId], ['DIV-EL', 'MDL-EL-1-1']);
      s.eq('rd_division', w.ls.rd_division, 'DIV-EL');
      await settle(w);
      s.eq('still no PUT', w.B.puts().length, 0);
    });
    await step(s, 'edit a specification: PUT SPEC-DIV-EL with its etag and client calm-1, nothing else', async () => {
      s.click('Edit S1');
      s.type('Specification', 'Rated stack power, 26 kW');
      s.click('Update specification');
      s.eq('saving', w.C.state.save.state, 'saving');
      await saveCycle(w);
      const p = w.B.puts();
      s.eq('one PUT', p.map((r) => [r.path, r.ifMatch, r.body.client]), [['/state/SPEC-DIV-EL', 'e1-SPEC-DIV-EL', 'calm-1']]);
      s.eq('the whole document, with the change', p[0].body.doc.keyResults.find((k) => k.id === 'KR-EL-1-1-1').statement, 'Rated stack power, 26 kW');
      s.eq('the broker has it', w.B.docs['SPEC-DIV-EL'].doc, w.C.D.spec['SPEC-DIV-EL']);
      s.eq('saved', [w.C.state.save.state, NET.dirty(w.C).length], ['saved', 0]);
      s.expect('Saved just now');
    });
    await step(s, 'add a product KPI: PUT the portfolio (not the SPEC document)', async () => {
      const before = w.B.puts().length;
      s.click('Add product KPI');
      s.type('Name', 'Stack cost');
      s.click('At most');
      s.type('Target', '1800');
      s.type('Unit', '$/kW');
      s.click('Save product KPI');
      s.ok(saw(w, 'Product KPI saved.'), 'toast');
      await saveCycle(w);
      const p = w.B.puts().slice(before);
      s.eq('one portfolio PUT', p.map((r) => [r.path, r.ifMatch, r.body.client]), [['/state/portfolio', 'e1-portfolio', 'calm-1']]);
      const k = p[0].body.doc.kpis.find((x) => x.name === 'Stack cost');
      s.eq('the product KPI in the portfolio', k && [k.hostType, k.hostId, k.direction, k.target, k.unit], ['product', 'PRD-EL-1', 'down', 1800, '$/kW']);
      s.eq('the broker has it', w.B.docs.portfolio.doc, w.C.D.portfolio);
    });
    await step(s, 'a 412 on the portfolio with a change elsewhere merges and saves', async () => {
      w.B.edit('portfolio', (P) => { P.initiatives.find((i) => i.id === 'INIT-EL-02').desc = 'Take 20% out of the stack bill of materials.'; });
      const before = w.B.puts().length;
      s.type('~New reading for Stack cost', '2100', { within: 'product-kpis' });
      s.key('~New reading for Stack cost', 'Enter');
      await saveCycle(w);
      const p = w.B.puts('portfolio').slice(-2);
      s.eq('refused, then saved with the fresh etag', [w.B.puts().length - before, p[0].ifMatch === p[1].ifMatch], [2, false]);
      const P = w.B.docs.portfolio.doc;
      s.eq('both changes kept', [P.initiatives.find((i) => i.id === 'INIT-EL-02').desc, P.kpiUpdates.filter((u) => u.value === 2100).length], ['Take 20% out of the stack bill of materials.', 1]);
      s.eq('this page has the merged portfolio', w.C.D.portfolio, P);
      s.ok(saw(w, 'Saved, merged with a change another editor saved first.'), 'merge toast');
      s.eq('no error banner', bannerTone(w), '');
      s.eq('saved', [w.C.state.save.state, NET.dirty(w.C).length], ['saved', 0]);
    });
    await step(s, 'a 412 on the SPEC document reloads it with today\'s message', async () => {
      w.B.edit('SPEC-DIV-EL', (d) => { d.keyResults.find((k) => k.id === 'KR-EL-1-1-2').statement = 'Their statement'; });
      const before = w.B.puts('SPEC-DIV-EL').length;
      s.click('Edit S1');
      s.type('Specification', 'My statement');
      s.click('Update specification');
      await saveCycle(w);
      s.eq('one refused PUT', w.B.puts('SPEC-DIV-EL').length - before, 1);
      s.eq('banner (today\'s message)', [banner(w), bannerTone(w)], ['Another editor saved first — reloaded; re-apply your change.', 'err']);
      s.expect('Another editor saved first — reloaded; re-apply your change.');
      const d = w.C.D.spec['SPEC-DIV-EL'];
      s.eq('their version is loaded, my change dropped', [d.keyResults.find((k) => k.id === 'KR-EL-1-1-2').statement, d.keyResults.find((k) => k.id === 'KR-EL-1-1-1').statement], ['Their statement', 'Rated stack power, 26 kW']);
      s.eq('equal to the broker\'s', d, w.B.docs['SPEC-DIV-EL'].doc);
      await saveCycle(w);
      s.eq('nothing re-sent', w.B.puts('SPEC-DIV-EL').length - before, 1);
      s.click('Dismiss message');
      s.eq('dismissed', w.C.state.sh_banner, null);
      s.clean('after the conflicts');
    });
    await step(s, 'switching with an unsaved change saves it at once (today flushPersist)', async () => {
      const before = w.B.puts('SPEC-DIV-EL').length;
      s.click('Edit spec details');
      s.type('Target application', 'Grid PEM electrolysis, 30 bar');
      s.click('Save spec details');
      s.click('~HP6-12');
      await settle(w);   // no timers run: the switch flushed
      s.eq('saved on the switch', w.B.puts('SPEC-DIV-EL').length - before, 1);
      s.eq('the broker has it', w.B.docs['SPEC-DIV-EL'].doc.modelSpec['MDL-EL-1-1'].application, 'Grid PEM electrolysis, 30 bar');
      s.eq('switched', w.C.state.divId, 'DIV-FC');
    });
    await step(s, 'another editor\'s change arrives on the poll (banner, as today\'s message bar)', async () => {
      w.B.edit('SPEC-DIV-FC', (d) => { d.modelSpec['MDL-FC-1-1'].notes = 'Hold for the RH sweep.'; });
      await NET.poll(w.C);
      await settle(w);
      s.eq('adopted', w.C.D.spec['SPEC-DIV-FC'].modelSpec['MDL-FC-1-1'].notes, 'Hold for the RH sweep.');
      s.eq('banner', [banner(w), bannerTone(w)], ['Updated from another editor.', 'info']);
      s.expect('Hold for the RH sweep.');
    });
  }

  /* ================================================================ a document the broker does not have */
  {
    const w = world({ drop: ['SPEC-DIV-FC'] });
    const s = w.s;
    await boot(w);
    await step(s, 'a missing SPEC document becomes blank and is not written on load', async () => {
      s.eq('loaded anyway', w.C.net.phase, 'ok');
      s.eq('blank document', w.C.D.spec['SPEC-DIV-FC'], BLANK);
      await saveCycle(w);
      await NET.poll(w.C);
      await settle(w);
      s.eq('no PUT', w.B.puts().length, 0);
      s.ok(!('SPEC-DIV-FC' in w.B.docs), 'still not on the broker');
      s.expect('Fuel Cell / HP membrane / HP6-12');
      s.expect('Add a specification to start the conformance score');
      s.clean('blank division');
    });
    await step(s, '...and is written after the first change, with If-Match "0"', async () => {
      s.click('Edit spec details');
      s.type('Target application', 'Heavy-duty truck fuel cell');
      s.click('Save spec details');
      await saveCycle(w);
      const p = w.B.puts();
      s.eq('PUT with If-Match 0', p.map((r) => [r.path, r.ifMatch, r.body.client]), [['/state/SPEC-DIV-FC', '0', 'calm-1']]);
      s.eq('created', [w.B.docs['SPEC-DIV-FC'].version, w.B.docs['SPEC-DIV-FC'].doc.modelSpec['MDL-FC-1-1'].application], [1, 'Heavy-duty truck fuel cell']);
      const etag1 = w.B.docs['SPEC-DIV-FC'].etag;
      s.click('Edit spec details');
      s.type('Notes', 'Second save');
      s.click('Save spec details');
      await saveCycle(w);
      s.eq('the next save sends the etag the first one got', w.B.puts().map((r) => r.ifMatch), ['0', etag1]);
      s.eq('version 2 on the broker', w.B.docs['SPEC-DIV-FC'].version, 2);
    });
  }

  /* ================================================================ the page's parameters and the hand-off */
  {
    const w = world({ search: '?division=DIV-EL&product=PRD-EL-2', session: { 'celadyne-calm-open': JSON.stringify({ app: 'spec', model: 'MDL-EL-1-1' }) } });
    const s = w.s;
    s.eq('the hand-off waits for the load (APP_INIT leaves it)', w.ss['celadyne-calm-open'] != null, true);
    await boot(w);
    await step(s, '?division=…&product=… applies; the address wins over a hand-off, which is used up', async () => {
      s.eq('selection', [w.C.state.divId, w.C.state.productId, s.c.ctx.modelId], ['DIV-EL', 'PRD-EL-2', 'MDL-EL-2-1']);
      s.ok(/Electrolyzer \/ Tera system \/ Tera 250 kW skid/.test(crumb(w)), 'breadcrumb');
      s.eq('rd_division', w.ls.rd_division, 'DIV-EL');
      s.eq('hand-off taken', w.ss['celadyne-calm-open'], undefined);
      s.eq('the link builder starts at this division', w.C.state.sh_link.division, 'DIV-EL');
      s.ok(saw(w, 'Loaded SPEC-DIV-EL.'), 'toast');
      s.eq('nothing written', w.B.puts().length, 0);
    });
    await step(s, 'a reload keeps the selection; a model that went away falls back', async () => {
      s.click('Settings');
      s.click('Load from the broker');
      await settle(w);
      s.eq('reloaded', w.B.gets('portfolio').length, 2);
      s.eq('kept', [w.C.state.divId, w.C.state.productId, s.c.ctx.modelId], ['DIV-EL', 'PRD-EL-2', 'MDL-EL-2-1']);
      s.eq('settings stay open', sheetKind(w), 'shell.settings');
      s.click('Close', { within: 'Editor' });
      s.click('~Tera 25-30-R5');
      s.eq('picked', [w.C.state.productId, w.C.state.modelId], ['PRD-EL-1', 'MDL-EL-1-1']);
      w.B.edit('portfolio', (P) => { P.models.push({ id: 'MDL-EL-1-9', productId: 'PRD-EL-1', name: 'Tera 0', order: 0 }); P.models = P.models.filter((m) => m.id !== 'MDL-EL-1-1'); });
      await NET.reload(w.C);
      await settle(w);
      s.eq('model gone: the product\'s first model', [w.C.state.divId, w.C.state.productId, w.C.state.modelId, s.c.ctx.modelId], ['DIV-EL', 'PRD-EL-1', '', 'MDL-EL-1-9']);
      s.eq('still nothing written', w.B.puts().length, 0);
    });
  }
  {
    const w = world({ search: '?division=DIV-BD&product=PRD-EL-1' });
    const s = w.s;
    await boot(w);
    await step(s, 'a business division opens the first product division; a product outside it is ignored', async () => {
      s.eq('selection', [w.C.state.divId, w.C.state.productId, s.c.ctx.productId], ['DIV-FC', '', 'PRD-FC-1']);
      s.ok(saw(w, 'Business Development is a business division with no products, so Fuel Cell opened instead.'), 'note');
      s.eq('rd_division', w.ls.rd_division, 'DIV-FC');
    });
  }
  {
    const w = world({ search: '?division=DIV-GONE' });
    await boot(w);
    await step(w.s, 'an unknown division', async () => {
      w.s.eq('an unknown division opens the first product division, without a note', [w.C.state.divId, w.toasts.some((t) => /business division/.test(t))], ['DIV-FC', false]);
    });
  }
  {
    const w = world({ session: { 'celadyne-calm-open': JSON.stringify({ app: 'spec', model: 'MDL-EL-2-1' }) }, local: { rd_division: 'DIV-FC' } });
    await boot(w);
    await step(w.s, 'hand-off without parameters opens its model (over rd_division)', async () => {
      w.s.eq('selection', [w.C.state.divId, w.C.state.productId, w.C.state.modelId], ['DIV-EL', 'PRD-EL-2', 'MDL-EL-2-1']);
      w.s.eq('used up', w.ss['celadyne-calm-open'], undefined);
      w.s.eq('rd_division', w.ls.rd_division, 'DIV-EL');
    });
  }
  {
    const w = world({ local: { rd_division: 'DIV-EL' } });
    await boot(w);
    await step(w.s, 'rd_division', async () => {
      w.s.eq('rd_division from the last session', [w.C.state.divId, w.s.c.ctx.modelId], ['DIV-EL', 'MDL-EL-1-1']);
      const w2 = world({ local: { rd_division: 'DIV-BD' } });
      await boot(w2);
      w2.s.eq('a stored business division opens the first product division', w2.C.state.divId, 'DIV-FC');
    });
  }
  {
    const w = world({ search: '?readonly&division=DIV-EL' });
    const s = w.s;
    await boot(w);
    await step(s, '?readonly: NET applies it; nothing can change or be written', async () => {
      s.eq('read-only', w.C.state.ro, true);
      s.expect('Read-only');
      s.ok(!s.has('Edit spec details'), 'no editing controls');
      s.eq('a change is refused', w.C.mutate((D) => { D.spec['SPEC-DIV-EL'].modelSpec.X = {}; }), false);
      await saveCycle(w);
      s.eq('no PUT', w.B.puts().length, 0);
    });
  }

  /* ================================================================ load states in the banner */
  {
    const w = world({ token: null, search: '?division=DIV-EL' });
    const s = w.s;
    await boot(w);
    await step(s, 'no token: nothing requested; banner and empty state say what to do', async () => {
      s.eq('no request', w.B.log.length, 0);
      s.eq('banner', [banner(w), bannerTone(w)], ['No broker token in this browser yet. Open this app from the Hub, or add the token in Settings.', 'info']);
      s.expect('No broker token in this browser yet. Open this app from the Hub, or add the token in Settings.');
      s.expect('Open this app from the Hub to load products.');
      s.ok(!s.has('Save now'), 'no Save button');
      s.clean('no token');
    });
    await step(s, 'Settings: no simulations, an empty token is refused, the saved token is never shown', async () => {
      s.click('Open settings');
      s.eq('settings', sheetKind(w), 'shell.settings');
      ['Simulate the broker', 'Restore the sample data', 'Simulate a save conflict', 'Lose the connection', 'Load other divisions slowly', 'simulated'].forEach((t) => s.ok(s.text.indexOf(t) < 0, 'no "' + t + '"'));
      s.expect('No broker token in this browser, so nothing is loaded.');
      s.click('Save token');
      s.ok(saw(w, 'Paste the broker token first.'), 'empty token refused');
      s.eq('no request', w.B.log.length, 0);
      s.type('Broker token', '  tok-live  ');
      s.click('Save token');
      s.ok(saw(w, 'Token saved.'), 'toast');
      s.eq('stored trimmed', w.ls.rd_broker_token, 'tok-live');
      await settle(w);
      s.eq('loaded', w.C.net.phase, 'ok');
      s.eq('the address applies on the first load that works', [w.C.state.divId, s.c.ctx.modelId], ['DIV-EL', 'MDL-EL-1-1']);
      s.eq('banner cleared', w.C.state.sh_banner, null);
      s.eq('field emptied', w.C.sheet().d.token, '');
      s.ok(s.text.indexOf('tok-live') < 0 && !s.els.some((el) => Object.keys(el.attrs).some((k) => String(el.attrs[k]).indexOf('tok-live') >= 0)), 'the token is shown nowhere');
      s.expect('Loaded just now: the portfolio and 2 specification documents. Everything is saved.');
      s.ok(s.has('Paste a new token to replace the saved one'), 'placeholder says a token is saved');
      s.clean('settings, live');
    });
    await step(s, 'Settings: hub sign-in fixed, links open for real, export and import save through NET', async () => {
      const hub = s.vals.sh.settings.hub;
      s.eq('hub picker fixed to "not signed in"', [hub.fixed, hub.opts.map((o) => o.label)], [true, ['Not signed in to the Hub']]);
      s.expect('Sign in to the Hub, then reload this page.');
      s.type('Division', 'DIV-EL', { tag: 'select' });
      s.type('Product', 'PRD-EL-2', { tag: 'select' });
      s.check('Read-only', true);
      const want = 'https://hub.test/rd/Spec-A.dc.html?division=DIV-EL&product=PRD-EL-2&readonly';
      s.eq('a full address', s.vals.sh.settings.url, want);
      let copied = null;
      W.navigator.clipboard.writeText = (t) => { copied = t; return { then(ok) { if (ok) ok(); return this; } }; };
      s.click('Copy link');
      s.eq('copied', copied, want);
      const sel = [w.C.state.divId, w.C.state.ro];
      s.click('Open with these parameters');
      s.eq('navigates (a fresh load)', w.assigned, [want]);
      s.eq('nothing simulated', [w.C.state.divId, w.C.state.ro], sel);
      s.click('Export JSON');
      s.eq('export', s.vals.sh.exportSheet.json, JSON.stringify(w.C.D.spec['SPEC-DIV-EL'], null, 2));
      s.click('Done');
      s.click('Import JSON');
      const legacy = {
        keyResults: [{ id: 'KR-EL-1-1-1', objectiveId: 'MDL-EL-1-1', statement: 'Imported spec', trackingType: 'kpi' }],
        stageGates: [{ id: 'SG-EL-1-1-1', objectiveId: 'MDL-EL-1-1', name: 'A' }, { id: 'SG-EL-1-1-1', objectiveId: 'MDL-EL-1-1', name: 'B' }],
        kpis: [
          { id: 'K1', objectiveId: 'MDL-EL-1-1', hostType: 'keyResult', hostId: 'KR-EL-1-1-1', name: 'Imp', direction: 'up', target: 5, unit: 'x', groupId: 'G1', isDefiner: true },
          { id: 'K2', objectiveId: 'MDL-EL-1-1', hostType: 'stageGate', hostId: 'SG-EL-1-1-1', name: 'Comp', groupId: 'G1' }
        ],
        kpiUpdates: [{ id: 'U1', kpiId: 'K1', value: 4, timestamp: 1, note: '' }]
      };
      s.type('Document JSON', '{"kpis": 3}');
      s.click('Import');
      s.eq('same validation', s.vals.ui.sheetErr, 'Import failed — not a valid document. “kpis” must be a list of records.');
      s.type('Document JSON', JSON.stringify(legacy));
      s.click('Import');
      s.click('Import and replace');
      s.ok(saw(w, 'Imported.'), 'toast');
      await saveCycle(w);
      const p = w.B.puts();
      s.eq('PUT replaces this division\'s document', p.map((r) => [r.path, r.ifMatch, r.body.client]), [['/state/SPEC-DIV-EL', 'e1-SPEC-DIV-EL', 'calm-1']]);
      const d = p[0].body.doc;
      s.eq('repaired as on load', [d.kpis[1].hostType, d.kpis[1].linkParent, d.stageGates.map((g) => g.id), d.modelSpec], ['component', 'K1', ['SG-EL-1-1-2', 'SG-EL-1-1-3'], {}]);
      s.eq('nothing else written', w.B.puts('portfolio').length, 0);
    });
  }
  {
    const w = world({ brokerToken: 'the-right-one' });
    await boot(w);
    await step(w.s, 'a token the broker refuses', async () => {
      w.s.eq('wrong token', [banner(w), bannerTone(w), w.C.net.loaded], ['The broker didn’t accept the token. Check the token in Settings.', 'err', false]);
      w.s.expect('The broker didn’t accept the token. Check the token in Settings.');
      w.s.ok(w.s.has('Open settings'), 'empty state offers Settings');
      w.s.click('Open settings');
      w.s.expect('The broker didn’t accept the saved token. Paste the right one.');
      w.s.clean('bad token');
      w.s.type('Broker token', 'the-right-one');
      w.s.key('Broker token', 'Enter');
      w.s.ok(saw(w, 'Token saved.'), 'Enter saves the token');
      await settle(w);
      w.s.eq('loads with the right token', [w.ls.rd_broker_token, w.C.net.phase, w.C.state.sh_banner, w.C.state.divId], ['the-right-one', 'ok', null, 'DIV-FC']);
      w.s.ok(w.B.log.slice(-1)[0].auth === 'Bearer the-right-one', 'requests carry the new token');
    });
  }
  {
    const w = world();
    w.B.fail['/state/portfolio'] = 503;
    await boot(w);
    await step(w.s, 'a broker error (5xx): said so, and the page tries again by itself', async () => {
      w.s.eq('load failed', [banner(w), bannerTone(w)], ['Load failed (503). This page keeps trying.', 'err']);
      w.s.expect('Load failed (503). This page keeps trying.');
      w.s.click('Settings');
      w.s.expect('The last load failed (503). This page keeps trying.');
      w.s.clean('load failed');
      delete w.B.fail['/state/portfolio'];
      w.s.flush(6000);   // NET's first retry comes 5 s later
      await settle(w);
      w.s.eq('loaded on the retry', [w.C.net.phase, w.C.state.sh_banner, w.C.state.divId], ['ok', null, 'DIV-FC']);
      w.s.ok(saw(w, 'Loaded SPEC-DIV-FC.'), 'toast');
    });
  }
  {
    const w = world();
    w.B.fail['/state/portfolio'] = 403;
    await boot(w);
    await step(w.s, 'a load the broker refuses (4xx): check the token; no retry', async () => {
      w.s.eq('load failed', [banner(w), bannerTone(w)], ['Load failed (403). Check the token in Settings.', 'err']);
      w.s.expect('Load failed (403). Check the token in Settings.');
      w.s.ok(w.s.has('Open settings'), 'Settings offered');
      const n = w.B.gets('portfolio').length;
      w.s.flush(70000);
      await settle(w);
      w.s.eq('not tried again', [w.B.gets('portfolio').length, w.C.net.phase], [n, 'fail']);
      w.s.click('Open settings');
      w.s.expect('The last load failed (403). Check the token.');
    });
  }
  {
    const w = world({ drop: ['portfolio'] });
    await boot(w);
    await step(w.s, 'no portfolio', async () => {
      w.s.eq('no portfolio', [banner(w), bannerTone(w)], ['No portfolio on the broker yet — create it in the Planning app first.', 'err']);
      w.s.ok(!w.s.has('Open settings'), 'Settings would not help');
      w.s.clean('no portfolio');
    });
  }
  {
    const w = world();
    w.B.down = true;
    await boot(w);
    await step(w.s, 'the broker cannot be reached', async () => {
      w.s.eq('offline', [banner(w), bannerTone(w), w.C.net.phase], ['Load failed (network unreachable). Check your connection; this page keeps trying.', 'err', 'offline']);
      w.s.expect('Couldn’t reach the broker. Check your connection; this page keeps trying.');
      w.B.down = false;
      w.s.click('Open settings');
      w.s.expect('Couldn’t reach the broker. This page keeps trying; Load from the broker tries now.');
      w.s.click('Load from the broker');
      await settle(w);
      w.s.eq('loads again from Settings', [w.C.net.phase, w.C.state.sh_banner, w.C.state.divId], ['ok', null, 'DIV-FC']);
    });
  }
  {
    const w = world();
    await boot(w);
    await step(w.s, 'a page the broker calls out of date', async () => {
      w.B.fail['/state/SPEC-DIV-FC'] = { method: 'PUT', status: 426 };
      w.s.click('Edit spec details');
      w.s.type('Target application', 'x');
      w.s.click('Save spec details');
      await saveCycle(w);
      w.s.eq('outdated page', [banner(w), w.C.state.save.state], ['This page is out of date, so the broker turned its save away. Reload the page to keep working.', 'error']);
      w.s.expect('Not saved: reload this page.');
    });
  }

  {
    const w = world({ local: { hub_session_v1: JSON.stringify({ email: 'Toru@celadyne.com', expiresAt: Date.UTC(2026, 9, 20), orgRole: 'lead' }) } });
    const s = w.s;
    await boot(w);
    await step(s, 'signed in to the Hub: the picker is fixed to that person, named from the broker\'s roster', async () => {
      s.click('Settings');
      const hub = s.vals.sh.settings.hub;
      s.eq('fixed picker', [hub.fixed, hub.value, hub.opts.map((o) => o.label)], [true, 'toru@celadyne.com', ['Toru Hayashi, Lead']]);
      s.expect('From your Hub sign-in (toru@celadyne.com).');
      s.expect('Product spec doesn’t check the sign-in: anyone with the broker token can edit, as today.');
      s.eq('sidebar', [s.vals.sh.me.name, s.vals.sh.me.role], ['Toru', 'Lead']);
      s.clean('hub sign-in');
    });
  }

  /* ================================================================ loading, and a connection that drops */
  {
    const w = world();
    const s = w.s;
    w.B.hold = true;
    await boot(w);
    await step(s, 'loading: a first load says so in the page, a reload in the banner above the page', async () => {
      s.eq('loading', w.C.net.phase, 'loading');
      s.eq('no banner on a first load', w.C.state.sh_banner, null);
      s.expect('Loading products and models from the broker…');
      w.B.hold = false;
      w.B.release();
      await settle(w);
      s.eq('loaded', w.C.net.phase, 'ok');
      w.B.hold = true;
      s.click('Settings');
      s.expect('Loaded just now: the portfolio and 2 specification documents. Everything is saved.');
      s.click('Load from the broker');
      await settle(w);
      s.eq('reload banner', [banner(w), bannerTone(w)], ['Loading from the broker…', 'info']);
      s.expect('Loading from the broker…');
      s.ok(s.has('~HP6-12'), 'the page stays while it reloads');
      w.B.hold = false;
      w.B.release();
      await settle(w);
      s.eq('banner cleared', w.C.state.sh_banner, null);
      s.ok(saw(w, 'Loaded SPEC-DIV-FC.'), 'toast');
      s.clean('after a reload');
    });
  }
  {
    const w = world();
    const s = w.s;
    await boot(w);
    await step(s, 'offline with unsaved changes: they wait for the connection, and a reload waits for them', async () => {
      w.B.down = true;
      s.click('Edit spec details');
      s.type('Target application', 'Offline edit');
      s.click('Save spec details');
      await saveCycle(w);
      s.eq('offline, change kept', [w.C.state.save.state, w.C.state.sim.offline, NET.info(w.C).pending], ['offline', true, 1]);
      s.expect('Offline, changes kept here');
      s.click('Settings');
      s.expect('Offline: 1 document has unsaved changes, kept here until the connection returns.');
      const n = w.B.log.length;
      s.click('Load from the broker');
      s.type('Broker token', 'tok-other');
      s.click('Save token');
      await settle(w);
      s.ok(saw(w, 'You are offline with unsaved changes. They save when the connection returns; load again after that.'), 'held back');
      s.eq('no request, token kept', [w.B.log.length, w.ls.rd_broker_token], [n, 'tok-live']);
      w.B.down = false;
      await NET.poll(w.C);
      await settle(w);
      s.eq('saved when the connection returns', [w.B.docs['SPEC-DIV-FC'].doc.modelSpec['MDL-FC-1-1'].application, w.C.state.sim.offline, w.C.state.save.state], ['Offline edit', false, 'saved']);
      s.click('Load from the broker');
      await settle(w);
      s.eq('a reload goes ahead now', [w.B.gets('portfolio').length, w.C.net.phase], [2, 'ok']);
    });
  }

  /* ================================================================ a division whose document did not load */
  {
    const w = world();
    const s = w.s;
    await boot(w);
    await step(s, 'a division added since, whose document fails: unreachable, and switching is refused', async () => {
      w.B.edit('portfolio', (P) => {
        P.divisions.push({ id: 'DIV-H2', name: 'Hydrogen storage', kind: 'rd', unitId: 'UNIT-TECHNI', order: 4 });
        P.products.push({ id: 'PRD-H2-1', divisionId: 'DIV-H2', name: 'Tank', order: 1, code: 'TK' });
        P.models.push({ id: 'MDL-H2-1-1', productId: 'PRD-H2-1', name: 'Tank 700 bar', order: 1 });
      });
      w.B.fail['/state/SPEC-DIV-H2'] = 503;
      await NET.poll(w.C);
      await settle(w);
      s.eq('banner', banner(w), 'Updated from another editor.');
      s.ok(treeText(w).indexOf('Hydrogen storage') >= 0, 'the new division is listed');
      s.eq('its document did not load', 'SPEC-DIV-H2' in w.C.D.spec, false);
      const r = s.c.ctx.refDocOfModel('MDL-H2-1-1');
      s.eq('refDocOfModel: failed (today: unreachable)', [!!r.failed, r.doc], [true, BLANK]);
      const r2 = s.c.ctx.refDocOfModel('MDL-EL-1-1');
      s.ok(r2 && !r2.failed && r2.doc === w.C.D.spec['SPEC-DIV-EL'], 'another loaded division resolves to its document');
      s.click('~Tank 700 bar');
      s.eq('refused', w.C.state.divId, 'DIV-FC');
      s.eq('today\'s message', [banner(w), bannerTone(w)], ['Couldn’t load SPEC-DIV-H2 — is its SPEC bin configured on the broker? Load from the broker in Settings to try again.', 'err']);
      delete w.B.fail['/state/SPEC-DIV-H2'];
      s.click('Settings');
      s.click('Load from the broker');
      await settle(w);
      s.eq('loaded now (blank: the broker has none)', w.C.D.spec['SPEC-DIV-H2'], BLANK);
      s.click('Close', { within: 'Editor' });
      s.click('~Tank 700 bar');
      s.eq('switch works', [w.C.state.divId, s.c.ctx.modelId], ['DIV-H2', 'MDL-H2-1-1']);
      s.eq('nothing written', w.B.puts().length, 0);
      s.clean('new division');
    });
  }
  {
    const w = world();
    await step(w.s, 'nothing but the broker was ever asked for; the kit warned only about the unreachable roster', async () => {
      w.s.eq('foreign addresses', FOREIGN, []);
      /* NET warns when a change touches a document this app may not write, or a save finds a change made without C.mutate */
      w.s.eq('kit warnings', WARN.filter((x) => !/the roster could not be read \(offline\)/.test(x)), []);
      w.s.ok(WARN.some((x) => /the roster could not be read \(offline\)/.test(x)), 'the offline load warned about the roster, as NET does');
      w.s.eq('console errors', ERR, []);
    });
  }
  done();
}

/* what APP_LIVE_PLAN returned, as NET keeps it (the hook itself lives inside the board's script) */
function planOf(C) { return C.net.plan; }

main().catch((e) => { console.log('FAIL (crash)', e && e.stack ? e.stack : e); process.exitCode = 1; });
