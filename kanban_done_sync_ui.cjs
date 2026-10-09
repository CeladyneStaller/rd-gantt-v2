// The Done-column choice follows the PERSON across devices — execution AND sales apps, driven through the real
// menu. Each "device" is its own jsdom window with its own localStorage; who is signed in comes from the Hub's
// sign-in (hub_session_v1) exactly as the Hub writes it. fetch is faked at the network layer with the broker's
// /prefs contract (GET -> the person's settings; PATCH -> merge, null deletes); prefs_broker.test.py holds the
// real broker to that contract, so between them the round trip is covered end to end.
//
// What a passing run means: a choice made on one device is what another device opens with; a reset is not
// revived by a device holding an older copy; a change made while the server is unreachable is kept on the
// device and delivered later; signed out (or signed in only in an expired session) nothing leaves the browser;
// and the shared board document never carries any of it.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const OUT = process.env.RD_OUT || '/home/claude/work';
const BROKER = 'https://web-production-b17a2.up.railway.app';
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const J = x => JSON.stringify(x);

/* The broker's /prefs contract, in memory. One per app run, shared by every device in it. */
function makeBroker() {
  const users = {}; const state = { down: false }; let version = 0;
  function handle(method, path, body) {
    const m = path.match(/^\/prefs\/([^/?#]+)$/); if (!m) return null;
    if (state.down) return { status: 503, body: { detail: 'unavailable' } };
    const email = decodeURIComponent(m[1]).trim().toLowerCase();
    if (method === 'GET') return { status: 200, body: { email, prefs: users[email] || {}, version } };
    if (method === 'PATCH') {
      const cur = JSON.parse(J(users[email] || {}));
      for (const area in body) {
        const b = cur[area] || {};
        for (const k in body[area]) { if (body[area][k] === null) delete b[k]; else b[k] = body[area][k]; }
        if (Object.keys(b).length) cur[area] = b; else delete cur[area];
      }
      if (Object.keys(cur).length) users[email] = cur; else delete users[email];
      version++;
      return { status: 200, body: { email, prefs: cur, version } };
    }
    return { status: 405, body: {} };
  }
  return { users, state, handle };
}

const SESSION = (email, ttl) => JSON.stringify({ email, role: 'user', orgRole: 'ic', issuedAt: Date.now() - 1000,
  expiresAt: Date.now() + (ttl == null ? 30 * 86400000 : ttl), tokenId: 't-1' });

/* The same seed as kanban_done_ui.cjs: board B1 has 12 finished tiles (4 in the last 14 days); B2 is a second board. */
const SEED = (kind) => `persist=function(){};
var base=Date.parse(todayIso()+'T00:00:00Z'), iso=function(n){ return new Date(base-n*86400000).toISOString().slice(0,10); };
portfolio={units:[],divisions:[{id:'D',name:'D',kind:'${kind}'}],initiatives:[{id:'I',name:'I',divisionId:'D'}],
  objectives:[{id:'O',statement:'O',divisionId:'D',initiativeId:'I',quarter:'2026Q4',plannedStart:1,plannedEnd:99999}],
  milestones:[],products:[],models:[],kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
divisionId='D'; selectedObj='O'; exec=blankExec();
var T=function(id,lane,col,age){ return {id:id,name:id,lane:lane,col:col,startDate:iso(age+20),enteredCol:iso(age)}; };
exec.boards=[{id:'B1',objectiveId:'O',name:'Pipeline',columns:[{id:'c1',name:'Prospect'},{id:'c2',name:'Working'},{id:'c3',name:'Proposal'},{id:'c4',name:'Closed'}],
  swimlanes:[{id:'L1',name:'Utilities',maxDaysPerCol:14},{id:'L2',name:'Industrial gas',maxDaysPerCol:21},{id:'L3',name:'Mobility',maxDaysPerCol:14}],
  tiles:[T('Idaho','L1','c1',3),T('PacifiCorp','L1','c2',9),T('Avista','L1','c3',4),T('AirLiquide','L2','c2',12),T('Linde','L2','c3',19),
    T('Nikola','L3','c1',2),T('Seattle','L3','c2',15),
    T('RockyMtn','L1','c4',2),T('NV','L1','c4',11),T('Xcel','L1','c4',26),T('APS','L1','c4',47),T('SMUD','L1','c4',83),
    T('Matheson','L2','c4',38),T('Praxair','L2','c4',5),T('AirProducts','L2','c4',19),T('Messer','L2','c4',64),
    T('Hyzon','L3','c4',8),T('Plug','L3','c4',33),T('Daimler','L3','c4',71)]},
 {id:'B2',objectiveId:'O',name:'Second board',columns:[{id:'x1',name:'Open'},{id:'x2',name:'Done'}],swimlanes:[{id:'M1',name:'Lane',maxDaysPerCol:14}],
  tiles:[T('OldOne','M1','x2',90),T('NewOne','M1','x2',1)]}];
exec.gateMode={O:'kanban'};
renderAll();`;

function device(file, kind, broker, o) {
  const vc = new VirtualConsole(); const errs = []; const log = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(fs.readFileSync(OUT + '/' + file, 'utf8'), {
    runScripts: 'dangerously', virtualConsole: vc, pretendToBeVisual: true,
    url: 'https://celadynestaller.github.io/rd-gantt-v2/' + file + '?division=D&token=t' + (o.readonly ? '&readonly=1' : ''),
    beforeParse(w) {
      for (const [k, v] of Object.entries(o.storage || {})) w.localStorage.setItem(k, v);
      w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
      w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {};
      w.cytoscape = function () { return { on(){}, ready(cb){ try{ cb && cb(); }catch(e){} }, fit(){}, resize(){},
        destroy(){}, getElementById(){ return { length: 0, select(){} }; }, zoom(){ return 1; }, width(){ return 800; },
        height(){ return 560; }, layout(){ return { run(){} }; }, elements(){ return { length: 0 }; }, $(){ return { unselect(){} }; } }; };
      // the app's debounces run 10x faster (behaviour unchanged, the run just takes less wall time)
      const st = w.setTimeout.bind(w);
      w.setTimeout = (fn, ms, ...a) => st(fn, (typeof ms === 'number' && ms >= 300) ? Math.max(1, Math.round(ms / 10)) : ms, ...a);
      // a clock the test can move forward, for "coming back to the tab later"
      const realNow = w.Date.now.bind(w.Date); let skew = 0;
      w.Date.now = () => realNow() + skew; w.__advance = ms => { skew += ms; };
      w.fetch = (url, opts) => {
        opts = opts || {};
        const u = new URL(String(url)), method = String(opts.method || 'GET').toUpperCase();
        let body = null; try { body = opts.body ? JSON.parse(opts.body) : null; } catch (e) { body = '(unparseable)'; }
        log.push({ method, path: u.pathname, body, headers: Object.assign({}, opts.headers || {}) });
        const res = (u.origin === BROKER) ? broker.handle(method, u.pathname, body) : null;
        if (!res) return Promise.reject(new Error('no net'));
        return Promise.resolve({ ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => JSON.parse(J(res.body)) });
      };
    } });
  const w = dom.window, d = w.document;
  w.eval(SEED(kind));
  const host = () => d.getElementById('subSG');
  const doneTh = () => [...host().querySelectorAll('th.kb-colh')].pop();
  const menu = () => host().querySelector('.kb-donemenu');
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
  const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  return {
    w, d, errs, log,
    label: () => txt(doneTh().querySelector('.kb-donebtn')),
    count: () => txt(doneTh().querySelector('.kb-colcnt')),
    rows: () => host().querySelectorAll('.kb-drow').length,
    cards: () => host().querySelectorAll('[data-kbcell$=":c4"] .kb-tile.closed:not(.kb-drow)').length,
    menu,
    open() { if (!menu()) click(doneTh().querySelector('.kb-donebtn')); return menu(); },
    close() { if (menu()) click(d.body); },
    pick(attr, v) { this.open(); const r = menu().querySelector(`[${attr}="${v}"]`); r.checked = true; fire(r, 'change'); },
    note() { const n = menu() && menu().querySelector('[data-kbdonenote]'); return n ? n.getAttribute('data-kbdonenote') + ': ' + txt(n) : '(menu closed)'; },
    prefsReqs: () => log.filter(r => r.path.startsWith('/prefs/')),
    patches: () => log.filter(r => r.method === 'PATCH' && r.path.startsWith('/prefs/')),
    store: k => { try { return JSON.parse(w.localStorage.getItem(k) || 'null'); } catch (e) { return '(unparseable)'; } },
    storage() { const s = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); s[k] = w.localStorage.getItem(k); } return s; },
    boards: () => w.eval('JSON.stringify(exec.boards)'),
    focus() { w.__advance(6000); w.dispatchEvent(new w.Event('focus')); },
  };
}

const SYNCED = 'synced: Just for you — follows you to any device where you’re signed in to the Hub. Hidden tiles still count in “closed”.';
const LOCAL = 'local: Saved in this browser only. Open this board from the Hub to keep it on every device. Hidden tiles still count in “closed”.';
const FAILED = 'failed: Saved on this device — couldn’t reach the server yet, so it will retry. Hidden tiles still count in “closed”.';
const ME = 'corey@celadyne.com';

async function runApp(file, kind, L) {
  const T_ = s => L + ': ' + s;
  const broker = makeBroker();
  const kb = () => (broker.users[ME] && broker.users[ME].kbDone) || {};
  try {
    // ---------- the laptop: signed in (the Hub stored the email with capitals); one choice from before sync ----------
    const lap = device(file, kind, broker, { storage: { hub_session_v1: SESSION('Corey@Celadyne.com'),
      rd_kb_done: J({ B2: { win: 30, style: 'cards' } }) } });
    const docBefore = lap.boards();
    await sleep(150);
    const g = lap.prefsReqs()[0];
    ok(g && g.method === 'GET' && g.path === '/prefs/corey%40celadyne.com', T_('on load the app asks the broker for the signed-in person\'s settings, by lower-cased, encoded email (' + (g && g.method + ' ' + g.path) + ')'));
    ok(lap.patches().length === 1 && J(lap.patches()[0].body) === J({ kbDone: { B2: { win: 30, style: 'cards' } } }),
      T_('first signed-in load: the choice this browser already had is carried up (' + J(lap.patches().map(p => p.body)) + ')'));
    ok(J(kb()) === J({ B2: { win: 30, style: 'cards' } }), T_('...and the broker now holds it for the person'));
    ok(lap.label() === 'all ▾' && lap.cards() === 12, T_('a board the person never set still shows everything, as cards'));
    lap.open();
    ok(lap.note() === SYNCED, T_('signed in, the menu says the choice follows the person: "' + lap.note() + '"'));

    // ---------- change it on the laptop ----------
    lap.pick('data-kbdonewin', '14'); lap.pick('data-kbdonestyle', 'compact');
    ok(lap.label() === 'last 14 days · compact ▾' && lap.rows() === 4 && lap.count() === '4 of 12', T_('the laptop redraws at once: last 14 days, compact, "4 of 12"'));
    await sleep(150);
    const sent = lap.patches().slice(1);
    ok(sent.length === 1 && J(sent[0].body) === J({ kbDone: { B1: { win: 14, style: 'compact' } } }),
      T_('the two clicks go to the broker as ONE request carrying only this board (' + J(sent.map(p => p.body)) + ')'));
    ok((sent[0] && /application\/json/.test(sent[0].headers['Content-Type'] || '')), T_('...sent as JSON'));
    ok(J(kb().B1) === J({ win: 14, style: 'compact' }) && J(kb().B2) === J({ win: 30, style: 'cards' }), T_('the broker has both boards for the person'));
    const acct = (lap.store('rd_kb_done_acct') || {})[ME] || {};
    ok(J(acct.prefs && acct.prefs.B1) === J({ win: 14, style: 'compact' }) && J(acct.pending) === '[]', T_('the laptop keeps its copy, with nothing left owed'));
    ok(!('B1' in (lap.store('rd_kb_done') || {})), T_("the signed-out, browser-only setting is not touched by the person's choice"));
    ok(lap.boards() === docBefore, T_('the board document itself never changed'));

    // ---------- the desktop: same person, a browser that has never seen this board ----------
    const desk = device(file, kind, broker, { storage: { hub_session_v1: SESSION(ME) } });
    await sleep(150);
    ok(desk.label() === 'last 14 days · compact ▾' && desk.rows() === 4,
      T_('the desktop opens the board the way the laptop left it (' + desk.label() + ', ' + desk.rows() + ' rows)'));
    ok(desk.patches().length === 0, T_('...and sends nothing back: it owed nothing'));
    desk.pick('data-kbdonewin', 'all'); desk.pick('data-kbdonestyle', 'cards');
    await sleep(150);
    ok(desk.label() === 'all ▾' && desk.cards() === 12, T_('the desktop puts the board back to the default'));
    ok(!('B1' in kb()) && J(desk.patches().pop().body) === J({ kbDone: { B1: null } }), T_('...which DELETES it on the broker (sent as null), rather than storing a default'));

    // ---------- back on the laptop tab, still holding the old copy ----------
    const before = lap.patches().length;
    lap.focus(); await sleep(150);
    ok(lap.label() === 'all ▾' && lap.cards() === 12, T_('returning to the laptop tab picks up the reset made on the desktop'));
    ok(!('B1' in kb()) && lap.patches().length === before, T_("...and the laptop's older copy does not bring the 14-day setting back"));

    // ---------- the server is unreachable ----------
    broker.state.down = true;
    lap.pick('data-kbdonewin', '7');
    await sleep(150);
    ok(lap.label() === 'last 7 days ▾' && lap.count() === '2 of 12', T_('with the server down a change still applies on this device at once'));
    ok(lap.note() === FAILED, T_('...and the menu says it could not sync yet: "' + lap.note() + '"'));
    ok(J(((lap.store('rd_kb_done_acct') || {})[ME] || {}).pending) === J(['B1']), T_('...and the change is kept as owed'));
    ok(!('B1' in kb()), T_('...the broker has not got it'));
    // the laptop reloads while the server is still down
    const lap2 = device(file, kind, broker, { storage: lap.storage() });
    await sleep(150);
    ok(lap2.label() === 'last 7 days ▾', T_('reloaded while the server is down, the laptop still shows its own change'));
    lap2.open();
    ok(lap2.note() === FAILED, T_('...and still says it is not synced'));
    // the server comes back; the laptop tab is used again
    broker.state.down = false;
    lap2.focus(); await sleep(150);
    ok(J(kb().B1) === J({ win: 7, style: 'cards' }), T_('when the server is back, the owed change is delivered (' + J(kb().B1) + ')'));
    ok(J(((lap2.store('rd_kb_done_acct') || {})[ME] || {}).pending) === '[]' && lap2.note() === SYNCED, T_('...nothing is owed any more, and the menu says so'));

    // ---------- signed out ----------
    const shared = device(file, kind, broker, { storage: {} });
    await sleep(150);
    ok(shared.prefsReqs().length === 0, T_('nobody signed in: the broker is never asked'));
    shared.open();
    ok(shared.note() === LOCAL, T_('...and the menu says the choice stays in this browser: "' + shared.note() + '"'));
    shared.pick('data-kbdonewin', 'none');
    await sleep(150);
    ok(shared.count() === '0 of 12' && J((shared.store('rd_kb_done') || {}).B1) === J({ win: 'none' }) && shared.prefsReqs().length === 0,
      T_('...a change is kept in this browser only, and nothing is sent'));
    ok(J(kb().B1) === J({ win: 7, style: 'cards' }), T_("...and the person's own setting on the broker is untouched"));
    // someone signs in to the Hub in another tab of this browser
    shared.w.localStorage.setItem('hub_session_v1', SESSION(ME));
    let ev; try { ev = new shared.w.StorageEvent('storage', { key: 'hub_session_v1' }); } catch (e) { ev = new shared.w.Event('storage'); Object.defineProperty(ev, 'key', { value: 'hub_session_v1' }); }
    shared.w.dispatchEvent(ev); await sleep(150);
    ok(shared.prefsReqs().length === 1 && shared.label() === 'last 7 days ▾',
      T_('signing in to the Hub in another tab switches this tab to the person\'s settings (' + shared.label() + ')'));
    ok(J(kb().B1) === J({ win: 7, style: 'cards' }), T_("...without this browser's signed-out choice overriding the person's"));

    // ---------- an expired sign-in is nobody ----------
    const stale = device(file, kind, broker, { storage: { hub_session_v1: SESSION(ME, -60000) } });
    await sleep(150);
    stale.open();
    ok(stale.prefsReqs().length === 0 && stale.note() === LOCAL && stale.label() === 'all ▾', T_('an expired Hub sign-in counts as signed out'));

    // ---------- a read-only link still keeps the viewer's own view ----------
    const ro = device(file, kind, broker, { storage: { hub_session_v1: SESSION(ME) }, readonly: true });
    await sleep(150);
    ro.pick('data-kbdonewin', '3');
    await sleep(150);
    ok(ro.label() === 'last 3 days ▾' && J(kb().B1) === J({ win: 3, style: 'cards' }),
      T_('on a read-only link the Done-column choice still syncs — it is the viewer\'s view, not the document'));
    ok(ro.boards() === docBefore, T_('...and the board document is unchanged'));

    for (const [n, dv] of [['laptop', lap], ['desktop', desk], ['laptop reload', lap2], ['shared', shared], ['expired', stale], ['read-only', ro]])
      ok(dv.errs.length === 0, T_('no errors on the ' + n + (dv.errs[0] ? ': ' + dv.errs[0].slice(0, 120) : '')));
  } catch (e) { ok(false, L + ' threw: ' + (e && e.stack || e)); }
}

(async () => {
  await runApp('execution_app.html', 'rd', 'exec');
  await runApp('sales_app.html', 'sales', 'sales');
  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} done-column sync UI assertions green`);
  process.exit(fails.length ? 1 : 0);
})();
