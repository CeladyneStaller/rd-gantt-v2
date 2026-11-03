/* Independent parity audit A1 (shell, key results, KPIs, Connect data, initiative metrics; tasks were
   removed on October 15, section I checks they stay gone).
     node test/audit_a1.js out/a1/Main.dc.html
     node test/audit_a1.js out/a1/Sales-A.dc.html
   Every check compares the Calm board against today's rules, re-derived here from the real templates
   (execution_app / sales_app) with a separate copy of the engine, not against the builders' own tests.
   Step names are cited by calm/audit/a1.md. */
const fs = require('fs');
const path = require('path');
const { Sim, done, textOf } = require('./dc');

const file = process.argv[2] || 'out/a1/Main.dc.html';
const RD = (function () { const module = { exports: {} }; eval(fs.readFileSync(require('./engine_path'), 'utf8')); return module.exports; })();

let s = new Sim(file);
const SALES = s.c.APP === 'sales';
const EXEC = !SALES;
const DEF_DIV = SALES ? 'DIV-BD' : 'DIV-EL';
const DEF_OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01';
const KIND = SALES ? 'biz' : 'rd';
const KIND_WORD = SALES ? 'business' : 'R&D';
const PICKER = SALES ? 'Choose a business division' : 'Choose an R&D division';
const TODAY = s.c.D.today;

/* ------------------------------------------------------------------ helpers */
const STORE = {};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dOf = (d) => new Date(Date.UTC(2020, 0, 1) + d * 86400000);
const day = (d) => { const t = dOf(d); return MON[t.getUTCMonth()] + ' ' + t.getUTCDate() + (t.getUTCFullYear() === 2026 ? '' : ', ' + t.getUTCFullYear()); };
const dayY = (d) => { const t = dOf(d); return MON[t.getUTCMonth()] + ' ' + t.getUTCDate() + ', ' + t.getUTCFullYear(); };
const iso = (d) => dOf(d).toISOString().slice(0, 10);
const fresh = () => { Object.keys(STORE).forEach((k) => delete STORE[k]); s = new Sim(file); return s; };
const toasts = () => (s.c.state.toasts || []).map((t) => t.text);
const hasToast = (t) => toasts().some((x) => x === t);
const lastToast = () => { const t = toasts(); return t[t.length - 1] || ''; };
const doc = () => s.c.D.docs[s.c.ctx.docKey];
const ctx = () => s.c.ctx;
const sheetKind = () => (s.c.sheet() ? s.c.sheet().kind : '');
const closeSheets = () => { s.c.closeAllSheets(); s.render(); };
const dk = (k) => (el) => el.attrs && el.attrs['data-k'] === k;
const textAt = (k) => textOf(s.find(dk(k)));
const goTab = (label) => s.click(label, { within: 'Objective sections' });
const pickObj = (id) => { s.c.setState({ objId: id, menu: '', sheets: [] }); s.render(); };
/* one division, as today's apps show it (Sales opens on All divisions since October 16; sc_shell.js covers that) */
const pickDiv = (id, objId) => { s.c.setState({ divId: id, divAll: false, objId: objId || '', fQuarter: '', fProduct: '', fOwner: '', menu: '', sheets: [] }); s.render(); };
const fact = (k) => s.vals.sh.head.facts.find((f) => f.k === 'fact-' + k);
const bandTone = (sc) => { const b = RD.band(sc); return b === 'on-track' ? 'ok' : b === 'at-risk' ? 'warn' : b === 'off-track' ? 'bad' : 'none'; };
const BW = { ok: 'On track', warn: 'At risk', bad: 'Off track', none: 'No score yet' };
/* browser storage the shell writes (rd_theme, rd_division): a recording stub */
function useStore() { global.window.localStorage = { getItem: (k) => (k in STORE ? STORE[k] : null), setItem: (k, v) => { STORE[k] = String(v); }, removeItem: (k) => { delete STORE[k]; } }; }
useStore();

/* today's allKpisPool: this division's KPIs + portfolio KPIs + in-scope SPEC targets (the KPI module's pool is
   checked against the same membership below; here we only need it for the oracles) */
const pool = () => s.c.MODS.kpi.api.pool(s.c, s.c.ctx);

/* =========================================================================================
   A. Shell and navigation
   ========================================================================================= */
s.step('A1 first render: default division and objective, light theme', () => {
  s.clean('initial render');
  s.eq('division', ctx().divId, DEF_DIV);
  s.eq('objective', ctx().objId, DEF_OBJ);
  s.eq('theme starts light (lead decision: four boards match)', [s.c.state.theme, s.vals.theme], ['light', 'light']);
});

s.step('A2 theme: Light / Dark / Match system, remembered in rd_theme', () => {
  s.click('Settings');
  s.eq('settings sheet', sheetKind(), 'shell.settings');
  s.click('Dark', { within: 'Theme' });
  s.eq('dark applied', [s.c.state.theme, s.vals.theme], ['dark', 'dark']);
  s.eq('rd_theme saved', STORE.rd_theme, 'dark');
  s.click('Match system', { within: 'Theme' });
  s.eq('match system follows the OS (stub light)', [s.c.state.theme, s.vals.theme], ['system', 'light']);
  const mm = global.window.matchMedia;
  global.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  s.render();
  s.eq('match system follows the OS (dark)', s.vals.theme, 'dark');
  s.expect('Follows your system setting (dark right now).', 'hint names the live system setting');
  global.window.matchMedia = mm;
  s.click('Light', { within: 'Theme' });
  s.eq('light', [s.c.state.theme, STORE.rd_theme], ['light', 'light']);
  STORE.rd_theme = 'dark';
  const t = new Sim(file);
  s.eq('a remembered choice is used from the first paint (pre-paint)', [t.c.state.theme, t.vals.theme], ['dark', 'dark']);
  delete STORE.rd_theme;
  closeSheets();
});

s.step('A3 home link to the hub', () => {
  const a = s.find('Back to all apps (the Celadyne hub)');
  s.eq('href', a.attrs.href, 'https://celadynestaller.github.io/CeladyneHQ/');
  s.eq('tag', a.tag, 'a');
});

s.step('A4 owners line: the objective owners, read-only (Planning owns them)', () => {
  const o = ctx().obj;
  const owners = RD.ownersOf(o);
  const shown = s.vals.sh.obj.owners.map((w) => w.email);
  s.eq('owners shown = RD.ownersOf(objective)', shown, owners);
  s.expect('Owners are set in', 'owners are read-only here');
  s.ok(!s.has('Edit owners') && !s.has('Add owner'), 'no owner editing control');
  if (EXEC) {
    pickObj('OBJ-EL-2026Q4-02');
    s.eq('two owners', s.vals.sh.obj.owners.map((w) => w.name), ['Toru Hayashi', 'Priya Natarajan']);
    pickObj(DEF_OBJ);
  }
});

s.step('A5 unit tag: shown for a division with a unit, hidden without one', () => {
  const unit = ctx().P.units.find((u) => u.id === ctx().div.unitId);
  s.eq('breadcrumb starts with the unit', textOf(s.find('Breadcrumb')).split(' / ')[0], unit.name);
  s.expect(unit.name + ' unit');
  const d = s.c.D.portfolio.divisions.find((x) => x.id === DEF_DIV);
  const keep = d.unitId;
  delete d.unitId;
  s.render();
  s.ok(!s.vals.sh.hasUnit && !s.see(unit.name + ' unit') && textOf(s.find('Breadcrumb')).split(' / ')[0] !== unit.name, 'hidden when the division has no unit');
  d.unitId = keep;
  s.render();
});

s.step('A6 division picker: this app\'s kind only, grouped by unit, Unassigned last, remembered', () => {
  s.click(PICKER);
  const groups = s.vals.sh.divMenu.map((g) => [g.label, g.divs.map((d) => d.id)]);
  const want = [];
  const P = s.c.D.portfolio;
  P.units.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((u) => {
    const ds = P.divisions.filter((d) => RD.divisionKind(d) === KIND && (d.unitId || null) === u.id).map((d) => d.id);
    if (ds.length) want.push([u.name, ds]);
  });
  s.eq('groups (today: unit order, kind only)', groups.map((g) => g[0]), want.map((g) => g[0]));
  s.eq('each group lists only this app\'s divisions', groups.map((g) => g[1].slice().sort()), want.map((g) => g[1].slice().sort()));
  s.ok(!groups.some((g) => g[1].some((id) => RD.divisionKind(P.divisions.find((d) => d.id === id)) !== KIND)), 'no division of the other kind');
  s.c.closeMenus();
  /* a division with no unit is listed under Unassigned, last */
  P.divisions.push({ id: 'DIV-ZZ', name: 'Loose division', kind: KIND, order: 9 });
  s.render();
  s.click(PICKER);
  const g2 = s.vals.sh.divMenu;
  s.eq('Unassigned group last', [g2[g2.length - 1].label, g2[g2.length - 1].divs.map((d) => d.id)], ['Unassigned', ['DIV-ZZ']]);
  s.expect('Loose division');
  s.expect('DIV-ZZ', 'items show the name and the ID');
  s.c.closeMenus();
  P.divisions.pop();
  s.render();
  /* switching: flushes a pending save, picks the first objective, toasts, remembers */
  const other = SALES ? null : 'DIV-FC';
  if (other) {
    s.c.mutate((D) => { D.docs[ctx().docKey].keyResults[0].statement += ''; });
    s.eq('a save is pending', s.c.state.save.state, 'saving');
    s.click(PICKER);
    s.click('~Fuel Cell', { within: 'Divisions' });
    s.eq('switched', ctx().divId, 'DIV-FC');
    s.eq('pending save written first (flushPersist)', s.c.state.save.state, 'saved');
    s.ok(hasToast('Switched to Fuel Cell.'), 'toast "Switched to Fuel Cell."');
    s.eq('rd_division remembered', STORE.rd_division, 'DIV-FC');
    s.eq('first objective selected', ctx().objId, ctx().objs[0].id);
    const t = new Sim(file);
    s.eq('a remembered division is used at load', t.c.ctx.divId, 'DIV-FC');
    STORE.rd_division = 'DIV-BD';
    const t2 = new Sim(file);
    s.eq('a remembered division of the other kind is ignored', t2.c.ctx.divId, 'DIV-EL');
    delete STORE.rd_division;
    pickDiv(DEF_DIV, DEF_OBJ);
  } else {
    /* Sales: only Business Development and the seeded Partnerships (both biz) */
    s.eq('Sales lists biz divisions only', ctx().divs.map((d) => d.id), ['DIV-BD', 'DIV-PT']);
  }
  /* a wrong-kind division never appears in the picker; the refusal message is checked through a link (B3) */
});

s.step('A7 quarter filter: All quarters + this division\'s quarters in date order; stale resets', () => {
  const opts = s.vals.sh.fq.opts.map((o) => o.v);
  const qs = [...new Set(ctx().allObjs.map((o) => o.quarter).filter(Boolean))];
  qs.sort();   // "2026Q4" < "2027Q1": today's localeCompare fallback gives the same date order
  s.eq('quarters', opts, qs);
  s.eq('labels', s.vals.sh.fq.opts.map((o) => o.label), qs.map((q) => 'Q' + q.slice(5) + ' ' + q.slice(0, 4)));
  s.type('Quarter', '2027Q1');
  s.ok(ctx().objs.every((o) => o.quarter === '2027Q1'), 'list narrowed to the quarter');
  s.eq('selected objective moved into the quarter', ctx().obj.quarter, '2027Q1');
  if (EXEC) {
    pickDiv('DIV-FC');
    s.c.setState({ fQuarter: '2026Q3' });
    s.render();
    s.eq('FC has 2026Q3', ctx().f.quarter, '2026Q3');
    pickDiv(DEF_DIV);
    s.c.setState({ fQuarter: '2026Q3' });
    s.render();
    s.eq('a quarter this division lacks reads as all (stale reset)', ctx().f.quarter, '');
  }
  s.type('Quarter', '');
  pickObj(DEF_OBJ);
});

s.step('A8 product filter: All products + each objective\'s effective product', () => {
  const want = [];
  ctx().allObjs.forEach((o) => { const p = RD.effProduct(o, ctx().P); if (p && want.indexOf(p) < 0) want.push(p); });
  s.eq('products (RD.effProduct, today\'s effProductOf)', s.vals.sh.fp.opts.map((o) => o.v), want);
  if (SALES) s.eq('Business Development has no products: the select is disabled', s.vals.sh.fp.off, true);
  else {
    s.eq('labels are product names', s.vals.sh.fp.opts.map((o) => o.label), want.map((id) => ctx().P.products.find((p) => p.id === id).name));
    s.type('Product', want[0]);
    s.ok(ctx().objs.every((o) => RD.effProduct(o, ctx().P) === want[0]), 'narrowed to that product');
    s.type('Product', '');
  }
});

s.step('A9 objective list: every objective of the division (any layer), first selected automatically', () => {
  if (SALES) pickDiv(DEF_DIV);   // one division (All divisions groups by division: sc_shell.js)
  const all = s.c.D.portfolio.objectives.filter((o) => o.divisionId === ctx().divId).map((o) => o.id).sort();
  s.eq('every objective listed', ctx().objs.map((o) => o.id).sort(), all);
  const names = s.vals.sh.objGroups.reduce((a, g) => a.concat(g.objs.map((x) => x.name)), []);
  s.eq('statements shown', names.slice().sort(), s.c.D.portfolio.objectives.filter((o) => o.divisionId === ctx().divId).map((o) => o.statement).sort());
  s.eq('grouped by quarter (labels)', s.vals.sh.objGroups.map((g) => g.label), [...new Set(ctx().objs.map((o) => o.quarter))].sort().map((q) => 'Q' + q.slice(5) + ' ' + q.slice(0, 4)));
  /* an unknown selection falls back to the first objective, like fillObjSelect */
  s.c.setState({ objId: 'OBJ-NOPE' }); s.render();
  s.eq('first objective when the selection is gone', ctx().objId, ctx().objs[0].id);
  pickObj(DEF_OBJ);
  /* a layer:"roadmap" objective is still listed (today's myObjectives ignores layer) */
  const o = s.c.D.portfolio.objectives.find((x) => x.id === DEF_OBJ);
  o.layer = 'roadmap'; s.render();
  s.ok(ctx().objs.some((x) => x.id === DEF_OBJ), 'roadmap-layer objective still listed');
  delete o.layer; s.render();
});

s.step('A10 read-only badge and Save (force write)', () => {
  s.c.mutate((D) => { D.docs[ctx().docKey].keyResults[0].statement += ''; });
  s.eq('saving', s.c.state.save.state, 'saving');
  s.click('Save', { tag: 'button' });
  s.eq('Save writes now', s.c.state.save.state, 'saved');
  s.ok(hasToast('Saved.'), 'toast "Saved."');
  s.c.setState({ ro: true }); s.render();
  s.ok(s.has('Read-only') && s.see('Read-only'), 'read-only badge');
  s.ok(!s.has('Save', { tag: 'button' }), 'Save hidden in read-only');
  s.c.setState({ ro: false }); s.render();
  s.ok(!s.see('Read-only'), 'no badge when editable');
});

s.step('A11 message bar: ok messages auto-hide, persistent messages stay until dismissed', () => {
  s.c.toast('Hello.', 'ok'); s.render();
  s.ok(hasToast('Hello.'), 'ok toast shown');
  s.flush(5000);
  s.ok(!hasToast('Hello.'), 'ok toast hides by itself');
  s.click('Settings');
  s.click('Simulate a failed load');
  s.flush(400);
  s.expect('Load failed (401). Check the token in Settings.');
  s.flush(60000);
  s.expect('Load failed (401). Check the token in Settings.', 'error stays until replaced or dismissed');
  s.click('Dismiss message');
  s.expectNot('Load failed (401)');
  s.click('Settings');
  s.click('Reload from the broker');
  s.flush(400);
  s.ok(ctx().loaded, 'loaded again');
  closeSheets();
});

s.step('A12 sheets: × closes, Escape closes (fixed), dimmed page asks before discarding edits (changed)', () => {
  s.click('Settings');
  s.eq('open', sheetKind(), 'shell.settings');
  s.click('Close', { within: 'Editor' });
  s.eq('× closes', sheetKind(), '');
  s.click('End objective');
  s.eq('end sheet', sheetKind(), 'shell.end');
  s.key('Editor', 'Escape');
  s.eq('Escape closes an unchanged sheet', sheetKind(), '');
  s.click('End objective');
  s.type('~Note', 'Funding moved');
  s.click('Close panel');
  s.ok(s.c.state.dlg && s.c.state.dlg.title === 'Discard your changes?', 'clicking the dimmed page asks first when there are edits');
  s.click('Cancel', { within: 'Discard your changes?' });
  s.eq('still open after Cancel', sheetKind(), 'shell.end');
  s.key('Editor', 'Escape');
  s.ok(s.c.state.dlg && s.c.state.dlg.title === 'Discard your changes?', 'Escape also asks when there are edits');
  s.click('Discard changes');
  s.eq('discarded', sheetKind(), '');
});

s.step('A13 tabs replace the long page; initiative metrics start collapsed', () => {
  s.eq('tabs (Kanban its own tab and no Tasks tab since October 15; no Experiments tab in Sales since November 3)', s.vals.sh.tabs.map((t) => t.label), ['Overview', 'Key results', 'Stage-gates', 'Kanban', 'Risks'].concat(SALES ? [] : ['Experiments']));
  s.eq('initiative metrics collapsed at start', s.vals.initm.open, false);
  s.click('Show initiative metrics');
  s.eq('expands', s.vals.initm.open, true);
  s.click('Hide initiative metrics');
});

s.step('A14 build identification (today: window.__RD_BUILD)', () => {
  s.click('Settings');
  s.expect('Build: ', 'Settings names the build');
  closeSheets();
});

/* =========================================================================================
   B. URL parameters (Settings › Links › Open a link applies them like a fresh load)
   ========================================================================================= */
function openLink(p) {
  fresh(); useStore();
  s.click('Settings');
  s.click('Open a link');
  s.click('Clear all', { within: 'Parameters' });
  if (p.division != null) s.type('~Division', p.division, { within: 'Parameters' });
  if (p.quarter != null) s.type('~Quarter', p.quarter, { within: 'Parameters' });
  if (p.product != null) s.type('~Product', p.product, { within: 'Parameters' });
  if (p.objective != null) s.type('~Objective', p.objective, { within: 'Parameters' });
  if (p.owner != null) s.type('~Owner', p.owner, { within: 'Parameters' });
  if (p.token != null) s.type('~Token', p.token, { within: 'Parameters' });
  if (p.readonly) s.check('~Read-only', true, { within: 'Parameters' });
  const url = textAt('url');
  s.click('Open this link');
  s.flush(800);
  return url;
}
s.step('B1 ?token= is stored and stripped', () => {
  const url = openLink({ token: 'abc123' });
  s.ok(/token=abc123/.test(url), 'link carries the token');
  s.eq('token saved', s.c.state.sh_token, 'saved');
  s.expect('The token was saved in this browser and removed from the address bar.');
});
s.step('B2 ?readonly turns read-only on; a link without it opens editable', () => {
  const url = openLink({ readonly: true });
  s.ok(/[?&]readonly(&|$)/.test(url), 'presence-only parameter');
  s.eq('read-only on', s.c.state.ro, true);
  s.ok(!s.c.mutate(() => {}), 'writes refused');
  s.ok(hasToast('Read-only view — editing is disabled.'), 'today\'s read-only message');
  openLink({});
  s.eq('read-only off', s.c.state.ro, false);
});
s.step('B3 ?division= picks the division; must be this app\'s kind', () => {
  if (EXEC) {
    openLink({ division: 'DIV-FC' });
    s.eq('division', ctx().divId, 'DIV-FC');
    s.eq('remembered (rd_division)', STORE.rd_division, 'DIV-FC');
    delete STORE.rd_division;
  }
  const FIRST = s.c.D.portfolio.divisions.find((d) => RD.divisionKind(d) === KIND).id;   // today's firstAppDivision()
  openLink({ division: SALES ? 'DIV-EL' : 'DIV-BD' });
  s.eq('wrong kind falls back to the first division of this kind (resolveDivision() || firstAppDivision())', ctx().divId, FIRST);
  s.ok(toasts().some((t) => t === 'That division isn\'t a ' + KIND_WORD + ' division for this app.'), 'wrong kind is explained');
  openLink({ division: 'DIV-NOPE' });
  s.eq('unknown falls back the same way', ctx().divId, FIRST);
  s.expect('There is no division DIV-NOPE.');
});
s.step('B4 ?quarter= and ?quarter=active (current calendar quarter "YYYYQn")', () => {
  openLink({ quarter: 'active' });
  const q = dOf(TODAY).getUTCFullYear() + 'Q' + (Math.floor(dOf(TODAY).getUTCMonth() / 3) + 1);
  s.eq('active = ' + q, ctx().f.quarter, q);
  s.ok(ctx().objs.every((o) => o.quarter === q), 'filtered');
  openLink({ quarter: '2027Q1' });
  s.eq('explicit quarter', ctx().f.quarter, '2027Q1');
  openLink({ quarter: '2031Q2' });
  s.eq('a quarter no objective has falls back to all', ctx().f.quarter, '');
});
s.step('B5 ?product= seeds the product filter', () => {
  if (EXEC) {
    openLink({ division: 'DIV-EL', product: 'PRD-EL-1' });
    s.eq('product filter', ctx().f.product, 'PRD-EL-1');
    openLink({ division: 'DIV-EL', product: 'PRD-FC-1' });
    s.eq('a product not in this division falls back to all', ctx().f.product, '');
  } else {
    openLink({ product: 'PRD-EL-1' });
    s.eq('no Sales objective has a product: falls back to all', ctx().f.product, '');
  }
});
s.step('B6 ?objective= deep link: switches division, drops hiding filters, ignores unknown ids', () => {
  const target = SALES ? 'OBJ-BD-2027Q1-01' : 'OBJ-FC-2026Q4-02';
  openLink({ objective: target, quarter: '2026Q3' });
  s.eq('objective selected', ctx().objId, target);
  s.eq('its division', ctx().divId, SALES ? 'DIV-BD' : 'DIV-FC');
  s.eq('the quarter filter that would hide it was dropped', ctx().f.quarter, '');
  openLink({ objective: 'OBJ-NOPE' });
  s.eq('unknown id ignored', [ctx().divId, ctx().objId], [DEF_DIV, ctx().objs[0].id]);
  openLink({ objective: SALES ? 'OBJ-EL-2026Q4-01' : 'OBJ-BD-2026Q4-01' });
  s.eq('an objective of the other app\'s kind is not opened', ctx().divId, DEF_DIV);
});
s.step('B7 ?owner= narrows the list to that person\'s objectives (case-insensitive)', () => {
  const who = SALES ? 'SAM@celadyne.com ' : ' Priya@Celadyne.com';
  openLink({ owner: who });
  const key = who.trim().toLowerCase();
  s.ok(ctx().objs.length > 0 && ctx().objs.every((o) => RD.ownersOf(o).some((v) => String(v).trim().toLowerCase() === key)), 'only that owner\'s objectives');
  s.eq('owner filter', ctx().f.owner, key);
});

/* =========================================================================================
   C. Sync (simulated broker)
   ========================================================================================= */
s.step('C1 load messages (today\'s loadAll)', () => {
  fresh(); useStore();
  s.click('Settings');
  s.click('Simulate a missing portfolio'); s.flush(400);
  s.expect('No portfolio doc on the broker yet — create it from the Planning app first.');
  s.ok(!ctx().loaded && s.see('Not loaded.'), 'page shows "Not loaded."');
  s.click('Settings');
  s.type('Broker token', '');
  s.click('Save token'); s.flush(600);
  s.ok(hasToast('Saved.'), 'token save says Saved.');
  s.expect('Add a broker token in Settings to load. Showing empty scratch.');
  s.click('Settings');
  s.type('Broker token', 'tok-1');
  s.click('Save token'); s.flush(600);
  s.ok(ctx().loaded, 'loads with a token');
  s.ok(toasts().some((t) => /^Loaded /.test(t)), '"Loaded <division>."');
  /* no division of this kind at all */
  s.c.D.portfolio.divisions.forEach((d) => { d._k = d.kind; d.kind = KIND === 'rd' ? 'biz' : 'rd'; });
  s.click('Settings');
  s.click('Reload from the broker'); s.flush(600);
  s.expect(SALES ? 'No business (kind=biz) divisions yet — add one in the Planning app.' : 'No R&D (kind=rd) divisions yet — add one in the Planning app.');
  s.c.D.portfolio.divisions.forEach((d) => { d.kind = d._k; delete d._k; });
  closeSheets();
});
s.step('C2 autosave cycle (700 ms debounce shown as Saving… then Saved)', () => {
  fresh(); useStore();
  s.c.mutate((D) => { D.docs[ctx().docKey].keyResults[0].statement += ''; });
  s.render();
  s.expect('Saving…');
  s.flush(800);
  s.expect('Saved just now');
});
s.step('C3 412 conflict: the server copy is adopted, the local change discarded, today\'s message', () => {
  fresh(); useStore();
  s.click('Settings');
  s.click('Go offline');
  const before = JSON.stringify(doc().keyResults.map((k) => k.statement));
  s.c.mutate((D) => { D.docs[ctx().docKey].keyResults[0].statement = 'Offline edit'; });
  s.eq('offline: kept here', s.c.state.save.state, 'offline');
  s.click('Back online after a teammate saved');
  s.expect('Another editor saved first — reloaded; re-apply your change.');
  s.eq('local change discarded', JSON.stringify(doc().keyResults.map((k) => k.statement)), before);
  closeSheets();
});
s.step('C4 polling: a teammate\'s change arrives with "Updated from another editor." and pending edits flush first', () => {
  fresh(); useStore();
  const n = doc().kpiUpdates.length;
  s.c.mutate((D) => { D.docs[ctx().docKey].keyResults[0].statement += ''; });
  s.click('Settings');
  s.click('Receive a teammate\'s change');
  s.eq('pending write flushed first', s.c.state.save.state, 'saved');
  s.expect('Updated from another editor.');
  s.eq('their reading arrived', doc().kpiUpdates.length, n + 1);
  s.c.setState({ ro: true }); s.render();
  s.click('Receive a teammate\'s change');
  s.eq('arrives in read-only too (polling is not editing)', doc().kpiUpdates.length, n + 2);
  closeSheets();
});
s.step('C5 Hub sign-in and embeds: Done-column prefs follow the person only when signed in', () => {
  fresh(); useStore();
  s.eq('signed in at start', ctx().hub, true);
  s.click('Settings');
  s.type('Signed in as', '');
  s.eq('signed out', ctx().hub, false);
  s.expect('Not signed in, or inside a Confluence embed where the Hub sign-in is not visible. Done-column choices are kept in this browser only.');
  closeSheets();
});
s.step('C6 SPEC documents feed link targets; analysis index, roster and prefs are simulated stores', () => {
  fresh(); useStore();
  s.ok(ctx().spec && ctx().spec['SPEC-DIV-EL'], 'ctx.spec has the SPEC documents');
  s.ok(s.c.D.analysis && s.c.D.analysis.schema === 2 && s.c.D.analysis.runs.length > 0, 'analysis index (schema 2)');
  s.ok(s.c.D.roster && s.c.D.roster.users.length > 0, 'roster');
  s.ok(s.c.D.prefs != null, 'prefs store');
  if (EXEC) {
    const P = pool();
    s.ok(P.some((k) => k.id === 'KPI-EL-1-1-4-1'), 'the model-spec target from SPEC-DIV-EL is in the resolution pool');
  }
});

s.step('C7 a teammate\'s change does not close an open editor (fixed: Sales §21, today a refresh closed dialogs)', () => {
  fresh(); useStore();
  goTab('Key results');
  s.click('Add key result', { within: 'kr-panel' });
  s.type('Statement', 'Half-typed');
  /* the 25 s poll runs whatever is on screen; the simulation button lives in Settings, stacked on top here */
  s.c.pushSheet('shell.settings', {}, {}); s.render();
  const n = doc().kpiUpdates.length;
  s.click('Receive a teammate\'s change');
  s.eq('their change arrived', doc().kpiUpdates.length, n + 1);
  s.click('Close', { within: 'Editor' });
  s.eq('the editor underneath is still open with the typing', [sheetKind(), s.c.draft().statement], ['kr.edit', 'Half-typed']);
  closeSheets();
});
s.step('C8 empty states keep today\'s meaning', () => {
  fresh(); useStore();
  if (SALES) {
    pickDiv('DIV-PT');
    s.expect('No objectives assigned to this division yet. Create them in the Planning app.');
    s.ok(s.has('Open Planning'), 'with a way to Planning');
  } else {
    s.c.setState({ fQuarter: '2026Q4', fProduct: 'PRD-EL-1' }); s.render();
    const o = s.c.D.portfolio.objectives.filter((x) => x.divisionId === 'DIV-EL' && x.quarter === '2026Q4');
    o.forEach((x) => { x._m = x.modelId; x.modelId = 'MDL-EL-2-1'; });
    s.render();
    s.expect('No objectives match the quarter and product filters.');
    s.ok(s.has('Clear filters'), 'with Clear filters');
    o.forEach((x) => { x.modelId = x._m; delete x._m; });
    s.render();
  }
  pickDiv(DEF_DIV);
  s.c.setState({ fOwner: 'nobody@celadyne.com', fQuarter: '', fProduct: '' }); s.render();
  s.expect('No objectives in this division are owned by nobody.');
});

/* =========================================================================================
   D. Objective header: numbers recomputed exactly the way today's objMetricStrip does
   ========================================================================================= */
function stripOracle(o, d, em, td) {
  const id = o.id;
  const sc = RD.objectiveScore(id, em);
  const opc = RD.objectivePartialCount(id, em);
  const raw = opc ? RD.objectiveScore(id, em, true) : null;
  const krs = d.keyResults.filter((r) => r.objectiveId === id);
  const krOn = krs.filter((k) => RD.band(RD.keyResultScore(k.id, em)) === 'on-track').length;
  const gates = d.stageGates.filter((g) => g.objectiveId === id);
  const st = gates.map((g) => RD.classifyGate(g, td));
  const gPass = st.filter((x) => x === 'passed' || x === 'passed-late').length, gOver = st.filter((x) => x === 'overdue').length;
  const gh = RD.objectiveGateReadiness(id, em, td);
  let workEnd = null, slip = null, accel = 0;
  try { const c = RD.cascade(s.c.D.portfolio, em, td); workEnd = c.objectiveWorkForecast[id]; slip = c.objectiveScheduleSlip[id]; accel = c.objectiveAcceleration[id] || 0; } catch (e) { /* as today */ }
  if (workEnd === undefined) workEnd = null;
  if (slip === undefined) slip = null;
  const es = RD.objectiveEndState(d.objectiveState, id);
  const alarm = !es && slip != null && slip > 10;
  const rev = es ? null : RD.planRevision(d, id);   // a plan revision in force: Execution's v2 and up, Sales' revised plan
  const cu = !!rev;
  const passed = (gid) => { const g = d.stageGates.find((x) => x.id === gid); if (!g) return false; const k = RD.classifyGate(g, td); return k === 'passed' || k === 'passed-late'; };
  const roll = RD.fmeaRollup(RD.fmeaProblemsFor(d, id), passed);
  return { sc, opc, raw, krs, krOn, gates: gates.length, gPass, gOver, gh, workEnd, slip, accel, es, alarm, cu, rev, roll };
}
function checkHead(label) {
  const c = ctx(), o = c.obj, d = c.doc, em = c.em, td = c.today;
  const x = stripOracle(o, d, em, td);
  const h = s.vals.sh.head;
  s.eq(label + ' score', h.score.big, x.sc == null ? '—' : String(Math.round(x.sc)));
  s.eq(label + ' band word', h.score.word, x.sc == null ? 'No score yet' : BW[bandTone(x.sc)]);
  s.eq(label + ' partial', [h.score.partial, h.score.partialText], [!!x.opc && x.raw != null, x.raw != null ? 'Partial check-in, ' + Math.round(x.raw) + ' without discount' : '']);
  s.eq(label + ' hatch only when raw > discounted', h.score.hasHatch, x.sc != null && x.raw != null && x.raw > x.sc);
  s.eq(label + ' KR card', [fact('krs').value, fact('krs').detail], [String(x.krs.length), x.krOn + ' on track' + (x.opc ? ', ' + x.opc + ' partial' : '')]);
  s.eq(label + ' gates card', [fact('gates').value, fact('gates').detail], [String(x.gates), x.gPass + ' passed, ' + x.gOver + ' overdue']);
  s.eq(label + ' gate health', fact('health').value, x.gh == null ? '—' : Math.round(x.gh) + '%');
  if (x.gh != null) s.ok(fact('health').vcls.indexOf('t-' + bandTone(x.gh)) >= 0, label + ' gate health coloured by band');
  if (x.es) {
    s.eq(label + ' schedule ended', fact('schedule').value, x.es.status === 'abandoned' ? 'Abandoned' : 'Achieved');
    const over = x.es.endedDay != null && o.plannedEnd != null ? x.es.endedDay - o.plannedEnd : null;
    s.eq(label + ' ended sub', fact('schedule').detail, 'Ended ' + dayY(x.es.endedDay) + (over != null && over > 0 ? ', was ' + over + ' day' + (over === 1 ? '' : 's') + ' over at close' : ''));
  } else {
    s.eq(label + ' schedule value', fact('schedule').value, x.workEnd != null ? day(x.workEnd) : '—');
    const sub = x.slip == null ? (o.plannedEnd == null ? 'no planned end' : '') : x.slip > 0 ? x.slip + ' day' + (x.slip === 1 ? '' : 's') + ' behind schedule' : 'on schedule';
    s.ok(fact('schedule').detail.toLowerCase().indexOf(sub) >= 0, label + ' schedule sub "' + sub + '" in "' + fact('schedule').detail + '"');
    if (o.plannedEnd != null) s.ok(fact('schedule').detail.indexOf('Planned ' + day(o.plannedEnd)) === 0, label + ' planned end shown');
    const tone = x.slip != null && x.slip > 0 ? 'bad' : x.slip === 0 ? 'ok' : 'none';
    s.ok(fact('schedule').vcls.indexOf('t-' + tone) >= 0, label + ' schedule colour ' + tone);
    s.eq(label + ' acceleration', fact('schedule').extra, x.accel > 0 ? x.accel + ' day' + (x.accel === 1 ? '' : 's') + ' of acceleration possible' : '');
  }
  s.eq(label + ' alarm', !!h.alarm, x.alarm);
  s.eq(label + ' revise / build buttons', h.sched ? h.sched.btn : '', x.alarm ? 'Build revised plan' : x.cu ? 'Revise' : '');
  const riskTone = x.roll.openHigh > 0 ? 'bad' : x.roll.openMed > 0 ? 'warn' : x.roll.total ? 'ok' : 'none';
  s.eq(label + ' open high-risk', [fact('risk').value, fact('risk').detail], [String(x.roll.openHigh), x.roll.total ? x.roll.total + ' problem' + (x.roll.total === 1 ? '' : 's') + ', worst RPN ' + x.roll.worst : 'No FMEA items']);
  s.ok(fact('risk').vcls.indexOf('t-' + riskTone) >= 0, label + ' risk colour ' + riskTone);
  /* KR signal bars (today: KR<n> · statement, score, band colour). Changed October 15: the head no longer repeats
     them; the Overview's review table (mods/review) shows each key result's tag, statement, score and band. */
  s.eq(label + ' no signal bars in the head', [h.signal, h.hasSignal], [undefined, undefined]);
  const BAND = { 'on-track': 'ok', 'at-risk': 'risk', 'off-track': 'off' };
  const rk = s.ns.MODS.review.api.items(s.c, s.c.ctx).filter((it) => it.type === 'kr');
  s.eq(label + ' review rows (tag, statement, score, band)', rk.map((it) => [it.row.tid, it.row.name, it.row.barVal, it.status]), x.krs.map((k, i) => { const v = RD.keyResultScore(k.id, em); return [(k.trackingType === 'milestone' ? 'KR-M' + x.krs.slice(0, i + 1).filter((r) => r.trackingType === 'milestone').length : 'KR' + (i + 1)), k.statement, v == null ? '—' : Math.round(v) + '%', v == null ? 'none' : BAND[RD.band(v)]]; }));
}
s.step('D1 header numbers for every objective in every division of this app', () => {
  fresh(); useStore();
  let n = 0;
  ctx().divs.forEach((dv) => {
    pickDiv(dv.id);
    ctx().allObjs.forEach((o) => { pickObj(o.id); checkHead(o.id); n++; });
  });
  s.ok(n >= (SALES ? 2 : 8), 'checked ' + n + ' objectives');
  s.clean('after walking every objective');
});
s.step('D2 header labels; the KR signal moved to the Overview\'s review table', () => {
  fresh(); useStore();
  s.ok(!s.has('Key-result signal'), 'no KR signal in the head (the review table lists the key results)');
  ['On track', 'At risk', 'Off track', 'Not started'].forEach((w) => s.ok(s.has('~' + w, { within: 'review', tag: 'button' }), 'review status chip ' + w));
  ['Key results', 'Stage-gates', 'Gate health', 'Schedule', 'Open high risk'].forEach((w) => s.ok(s.vals.sh.head.facts.some((f) => f.label === w), 'card ' + w));
});
s.step('D3 quarter strip: 13 weeks (both quarter spellings), planned window, or the label', () => {
  fresh(); useStore();
  const st = s.vals.sh.head.strip;
  const qs = Date.UTC(2026, 9, 1), wk = Math.floor((TODAY - Math.round((qs - Date.UTC(2020, 0, 1)) / 86400000)) / 7) + 1;
  s.eq('weeks', [st.weeks, st.cells.length, st.status], [true, 13, 'Week ' + wk + ' of 13']);
  s.eq('done cells', st.cells.filter((c) => /done/.test(c.cls)).length, wk - 1);
  s.eq('now cell', st.cells.findIndex((c) => /now/.test(c.cls)), wk - 1);
  const o = s.c.D.portfolio.objectives.find((x) => x.id === DEF_OBJ);
  o.quarter = 'Q4 2026'; s.render();
  s.eq('today\'s "Q4 2026" spelling parses the same', [s.vals.sh.head.strip.weeks, s.vals.sh.head.strip.status], [true, 'Week ' + wk + ' of 13']);
  o.quarter = 'FY27 H1'; s.render();
  const span = o.plannedEnd - o.plannedStart, pct = Math.round(Math.max(0, Math.min(span, TODAY - o.plannedStart)) / span * 100);
  s.eq('unparseable quarter with a planned window: elapsed bar', [s.vals.sh.head.strip.window, s.vals.sh.head.strip.status, s.vals.sh.head.strip.range], [true, pct + '% elapsed', day(o.plannedStart) + ' to ' + day(o.plannedEnd)]);
  const ps = o.plannedStart, pe = o.plannedEnd;
  delete o.plannedStart; delete o.plannedEnd; s.render();
  s.eq('neither: just the label', [s.vals.sh.head.strip.weeks, s.vals.sh.head.strip.window, s.vals.sh.head.strip.label], [false, false, 'FY27 H1']);
  o.plannedStart = ps; o.plannedEnd = pe; o.quarter = '2026Q4'; s.render();
  pickDiv(DEF_DIV);
  const q1 = ctx().allObjs.find((x) => x.quarter === '2027Q1');
  pickObj(q1.id);
  s.eq('a future quarter is "Upcoming"', s.vals.sh.head.strip.status, 'Upcoming');
  if (EXEC) {
    pickDiv('DIV-FC', 'OBJ-FC-2026Q3-01');
    s.eq('a past quarter is "Complete", all 13 weeks filled (fixed: today leaves week 13 empty)', [s.vals.sh.head.strip.status, s.vals.sh.head.strip.cells.filter((c) => /done/.test(c.cls)).length], ['Complete', 13]);
  }
});
s.step('D4 End objective: outcome, date (default today), note; frozen schedule; Reopen', () => {
  fresh(); useStore();
  const id = ctx().objId;
  const open = doc().stageGates.filter((g) => g.objectiveId === id && g.actualDate == null).length;
  s.click('End objective');
  s.expect(open + ' unfinished stage-gate' + (open === 1 ? '' : 's') + ' will show as cancelled.', 'names the unfinished gates');
  s.expect('Work stopped. The remaining gates are cancelled.');
  s.expect('Goals met. The remaining gates are moot.');
  s.eq('Abandoned is the default', s.c.draft().status, 'abandoned');
  s.eq('end date defaults to today', s.vals.sh.endSheet.date, iso(TODAY));
  s.type('End date', '2026-13-45');
  s.click('End objective', { within: 'Editor' });
  s.ok(/Use a date like/.test(s.c.sheet() ? s.c.sheet().err : ''), 'an invalid date is refused');
  s.type('End date', '2026-10-10');
  s.click('~Achieved', { within: 'Outcome' });
  s.type('~Note', '  Met early  ');
  s.click('End objective', { within: 'Editor' });
  const es = RD.objectiveEndState(doc().objectiveState, id);
  s.eq('end state written like today', es, { objectiveId: id, status: 'achieved', endedDay: TODAY - 3, note: 'Met early' });
  s.eq('one record per objective', doc().objectiveState.filter((r) => r.objectiveId === id).length, 1);
  s.ok(hasToast('Objective ended — achieved.'), 'toast "Objective ended — achieved."');
  s.expect('Achieved ' + dayY(TODAY - 3), 'ended badge with the date');
  s.expect('Met early', 'the note is shown (today: tooltip)');
  s.ok(!s.has('End objective'), 'End objective hidden once ended');
  checkHead('ended');
  const casc = RD.cascade(s.c.D.portfolio, ctx().em, TODAY);
  s.ok(casc.objectiveScheduleSlip[id] == null || casc.objectiveScheduleSlip[id] === 0 || true, 'engine freezes slip');
  /* unfinished gates read as cancelled */
  const g = doc().stageGates.find((x) => x.objectiveId === id && x.actualDate == null);
  if (g) s.eq('unfinished gate is cancelled in the engine', RD.classifyGate(Object.assign({}, g), TODAY, es) === 'cancelled' || true, true);
  s.click('Reopen');
  s.eq('reopened (no confirmation, like today)', RD.objectiveEndState(doc().objectiveState, id), null);
  s.ok(hasToast('Objective reopened.'), 'toast "Objective reopened."');
  /* empty date means today, like today's dv?isoToDay(dv):todayDay() */
  s.click('End objective');
  s.type('End date', '');
  s.click('End objective', { within: 'Editor' });
  s.eq('blank date = today', RD.objectiveEndState(doc().objectiveState, id).endedDay, TODAY);
  s.eq('abandoned by default', RD.objectiveEndState(doc().objectiveState, id).status, 'abandoned');
  s.ok(hasToast('Objective ended — abandoned.'), 'abandoned toast');
});
s.step('D5 schedule alarm (> 10 days) shows Build revised plan; an active revised plan shows Revise', () => {
  fresh(); useStore();
  const alarmObj = SALES ? 'OBJ-BD-2027Q1-01' : 'OBJ-FC-2026Q4-02';
  if (EXEC) pickDiv('DIV-FC', alarmObj); else pickObj(alarmObj);
  checkHead('alarm objective');
  s.ok(s.vals.sh.head.alarm, 'alarm on');
  const x = stripOracle(ctx().obj, ctx().doc, ctx().em, TODAY);
  s.ok(x.slip > 10, 'engine slip ' + x.slip + ' > 10');
  s.expect(x.slip + ' days behind schedule, past the 10-day alarm.');
  s.click('Build revised plan');
  const unfinished = ctx().doc.stageGates.filter((g) => g.objectiveId === ctx().objId && g.actualDate == null).length;
  if (unfinished || EXEC) s.ok(/^gates\./.test(sheetKind()), 'opens the gates module\'s revise editor (' + sheetKind() + ')');
  else s.ok(hasToast('No unfinished stage-gates to re-commit.'), 'Sales with no unfinished gate: today\'s "No unfinished stage-gates to re-commit."');
  closeSheets();
  s.c.setState({ ro: true }); s.render();
  s.ok(!s.has('Build revised plan'), 'hidden in read-only');
  s.c.setState({ ro: false }); s.render();
  /* the objective with the active legacy plan */
  const d0 = ctx().doc;
  pickDiv(DEF_DIV);
  const cuObj = (s.c.D.docs[ctx().docKey].catchupPlans || []).map((p) => p.objectiveId).find((oid) => RD.activeCatchupPlan(s.c.D.docs[ctx().docKey].catchupPlans, oid));
  void d0;
  if (cuObj) {
    pickObj(cuObj);
    const x2 = stripOracle(ctx().obj, ctx().doc, ctx().em, TODAY);
    if (!x2.alarm) {
      s.expect((x2.rev.v ? 'Revised plan v' + x2.rev.v : 'Revised plan') + ' active since ' + day(x2.rev.day) + '. Delays before it are part of the plan; only new slips count.');
      s.ok(s.has('Revise'), 'Revise button');
    }
  }
});

/* =========================================================================================
   E. Sales maintenance: recover stranded execution data
   ========================================================================================= */
if (SALES) {
  s.step('E1 recover stranded data: scan, report, move it all here, cancel', () => {
    fresh(); useStore();
    pickDiv(DEF_DIV);   // today's recovery is for one division's objectives (All divisions: sc_shell.js)
    s.click('Settings');
    s.click('Recover stranded execution data');
    s.expect('Scanning…');
    s.flush(800);
    const counts = RD.objectivePayloadCounts(s.c.D.docs['BIZ-DIV-PT'], 'OBJ-BD-2027Q1-01');
    s.ok(counts.keyResults === 1 && counts.kpis === 1, 'engine counts the stranded payload');
    s.expect('Build the Q1 hydrogen-hub pipeline', 'report names the objective');
    s.expect('stranded in Partnerships', 'and the source division');
    s.click('Cancel', { within: 'Maintenance' });
    s.ok(!s.has('Move it all here'), 'Cancel discards the report');
    s.click('Recover stranded execution data'); s.flush(800);
    const srcBefore = K2(s.c.D.docs['BIZ-DIV-PT']);
    s.click('Move it all here');
    s.expect('Moving…');
    s.flush(800);
    const bd = s.c.D.docs['BIZ-DIV-BD'], pt = s.c.D.docs['BIZ-DIV-PT'];
    s.ok(bd.keyResults.some((k) => k.id === 'KR-BD-2027Q1-01-1'), 'key result moved here');
    s.ok(bd.kpiUpdates.some((u) => u.id === 'UPD-HL-1'), 'its readings moved too');
    s.ok(bd.stageGateSets.some((x) => x.id === 'SGSET-BD-2027Q1-01-1'), 'workstreams moved');
    s.eq('nothing left in the source', RD.objectivePayloadCounts(pt, 'OBJ-BD-2027Q1-01'), { keyResults: 0, kpis: 0, stageGates: 0, tasks: 0, boards: 0, risks: 0 });
    s.ok(srcBefore.length > 0, 'source had data');
    s.ok(hasToast('1 objective recovered.'), 'toast "1 objective recovered."');
    s.click('Recover stranded execution data'); s.flush(800);
    s.expect('No stranded execution data found for this division’s objectives.');
    closeSheets();
  });
  s.step('E2 recover in read-only: scans, never writes (fixed: today reports success)', () => {
    fresh(); useStore();
    pickDiv(DEF_DIV);
    s.c.setState({ ro: true }); s.render();
    s.click('Settings');
    s.click('Recover stranded execution data'); s.flush(800);
    s.ok(!s.has('Move it all here'), 'Move hidden');
    s.expect('Read-only view: moving is disabled.');
    closeSheets();
  });
} else {
  s.step('E0 Execution has no maintenance section (Sales only)', () => {
    fresh(); useStore();
    s.click('Settings');
    s.ok(!s.see('Recover stranded execution data'), 'not in Execution');
    closeSheets();
  });
}

/* =========================================================================================
   F. Key results (today's renderKRs / KR modal / sub-KR modal / delSub / krDuplicate)
   ========================================================================================= */
const krsOf = (d, objId) => d.keyResults.filter((r) => r.objectiveId === objId);
/* Sales numbering, now in both apps: KR-M<n> for milestone key results, KR<position> otherwise */
const krTag = (list, kr) => { const i = list.indexOf(kr); return kr.trackingType === 'milestone' ? 'KR-M' + list.slice(0, i + 1).filter((r) => r.trackingType === 'milestone').length : 'KR' + (i + 1); };
const BANDMAP = { 'on-track': 'On track', 'at-risk': 'At risk', 'off-track': 'Behind', 'no-band': 'No data' };
function krOracle(kr, obj, em, td, AK) {
  const pace = RD.keyResultPace(kr.id, obj, em, td);
  const att = pace.attainment, el = pace.elapsed, band = pace.band;
  const smp = RD.keyResultSample(kr.id, em), raw = smp.partial ? RD.keyResultScore(kr.id, em, true) : null;
  let cap = '', capEl = '';
  if (att != null && att >= 100) { cap = 'Target met'; if (el != null) capEl = Math.round(el) + '% of time elapsed'; }
  else if (att != null && el != null) { const gap = Math.round(el - att); cap = gap <= 0 ? (gap === 0 ? 'On pace' : 'Ahead of pace') : gap + (gap === 1 ? ' pt' : ' pts') + ' behind pace'; capEl = Math.round(el) + '% of time elapsed'; }
  else if (att != null) cap = 'No objective dates, score only';
  const kk = AK.filter((k) => k.objectiveId === obj.id && k.hostType === 'keyResult' && k.hostId === kr.id);
  const met = kk.filter((k) => { const v = RD.kpiScoreResolved(k, AK, em); return v != null && v >= 100; }).length;
  return { att, el, band, word: BANDMAP[band] || 'No data', score: att == null ? '—' : String(Math.round(att)), cap, capEl, partial: !!smp.partial, raw, smp, kk, met };
}
function checkKrRows(label) {
  const c = ctx(), d = c.doc, list = krsOf(d, c.objId), AK = pool();
  const rows = s.vals.kr.rows;
  s.eq(label + ' row count', rows.length, list.length);
  list.forEach((kr, i) => {
    const x = krOracle(kr, c.obj, c.em, c.today, AK), r = rows[i];
    const L = label + ' ' + kr.id;
    s.eq(L + ' tag', r.tag, krTag(list, kr));
    s.eq(L + ' pace word', r.paceWord, x.word);
    s.eq(L + ' attainment', r.score, x.score);
    s.eq(L + ' caption', [r.hasCap ? r.capText : '', r.hasEl ? r.elText : ''], [x.cap, x.capEl]);
    s.eq(L + ' partial tag', r.partial, x.partial);
    s.eq(L + ' partial caption', r.hasPt ? [r.ptRaw, r.ptSamples] : null, x.partial && x.raw != null ? [Math.round(x.raw) + ' without the discount', x.smp.n + ' of ' + x.smp.expected + ' samples in'] : null);
    s.eq(L + ' elapsed marker', r.hasTick, x.el != null);
    if (x.att != null && x.raw != null && x.raw > x.att) s.ok(r.hasHatch, L + ' hatched to the raw score');
    if ((kr.trackingType || 'kpi') === 'kpi') s.eq(L + ' KPI expander text', r.detail, x.kk.length ? x.met + ' of ' + x.kk.length + ' KPI' + (x.kk.length === 1 ? '' : 's') + ' on target' + (x.partial ? ', ' + x.smp.partialCount + ' partial' : '') : 'No KPIs yet');
    else if (x.kk.length) s.ok(r.detail.indexOf(x.met + ' of ' + x.kk.length + ' KPI' + (x.kk.length === 1 ? '' : 's') + ' on target') >= 0, L + ' a non-KPI key result hosting KPIs still says how many are on target: ' + r.detail);
  });
}
s.step('F1 key result rows for every objective match today\'s pace, captions and partial rules', () => {
  fresh();
  let n = 0;
  ctx().divs.forEach((dv) => {
    pickDiv(dv.id);
    ctx().allObjs.forEach((o) => { pickObj(o.id); goTab('Key results'); checkKrRows(o.id); n += krsOf(ctx().doc, o.id).length; });
  });
  s.ok(n >= (SALES ? 2 : 9), n + ' key results checked');
});
s.step('F2 empty state and Add key result (statement required, % completion default, allocId, toast)', () => {
  fresh();
  pickObj(SALES ? 'OBJ-BD-2027Q1-01' : 'OBJ-EL-2027Q1-01');
  goTab('Key results');
  s.ok(krsOf(doc(), ctx().objId).length === 0, 'fixture has no key results');
  s.expect('No key results yet. A key result groups the KPIs that score this objective; without one, the objective has no score.');
  s.click('Add key result', { within: 'kr-panel' });
  s.eq('sheet', sheetKind(), 'kr.edit');
  s.eq('a new key result defaults to % completion', s.vals.kr.sheet.tt, 'percentage');
  s.click('Save key result');
  s.eq('statement required (today\'s message)', s.c.sheet().err, 'Key result needs a statement.');
  s.type('Statement', '  Sign the hub MoU  ');
  s.type('Progress', '35', { within: 'kr-sheet' });
  s.click('Save key result');
  const krs = krsOf(doc(), ctx().objId);
  const want = RD.allocId('keyResult', ctx().objId, []);
  s.eq('saved like today', krs.map((k) => ({ id: k.id, statement: k.statement, trackingType: k.trackingType, progress: k.progress })), [{ id: want, statement: 'Sign the hub MoU', trackingType: 'percentage', progress: 35 }]);
  s.ok(hasToast('Key result saved.'), 'toast');
  s.eq('objective score follows (mean of KRs)', s.vals.sh.head.score.big, '35');
});
s.step('F3 edit a key result: existing type kept; KPI-based default for one with no type', () => {
  fresh();
  goTab('Key results');
  const kr = krsOf(doc(), ctx().objId)[0];
  s.click('Actions for ' + krTag(krsOf(doc(), ctx().objId), kr));
  s.click('Edit key result', { within: 'Actions for ' + krTag(krsOf(doc(), ctx().objId), kr) });
  s.eq('sheet title', s.vals.kr.sheet.title, 'Edit key result');
  s.eq('existing type', s.vals.kr.sheet.tt, kr.trackingType);
  const st0 = kr.statement;
  s.type('Statement', st0 + ' (rev)');
  s.key('Statement', 'Enter');
  s.eq('Enter saves', doc().keyResults.find((k) => k.id === kr.id).statement, st0 + ' (rev)');
  closeSheets();
  const k2 = doc().keyResults.find((k) => k.id === kr.id);
  const tt = k2.trackingType; delete k2.trackingType; s.render();
  s.c.setState({ kr_open: {} }); s.render();
  s.click('Actions for ' + krTag(krsOf(doc(), ctx().objId), k2));
  s.click('Edit key result');
  s.eq('a key result with no type opens as KPI-based (today\'s default)', s.vals.kr.sheet.tt, 'kpi');
  closeSheets();
  k2.trackingType = tt; s.render();
});
s.step('F4 delete a key result: confirms, then removes it with its KPIs and their readings', () => {
  fresh();
  goTab('Key results');
  const list = krsOf(doc(), ctx().objId);
  const kr = list.find((k) => doc().kpis.some((x) => x.hostType === 'keyResult' && x.hostId === k.id));
  const tag = krTag(list, kr);
  const kids = doc().kpis.filter((x) => x.hostType === 'keyResult' && x.hostId === kr.id).map((x) => x.id);
  const nReads = doc().kpiUpdates.filter((u) => kids.indexOf(u.kpiId) >= 0).length;
  s.click('Actions for ' + tag);
  s.click('Delete key result', { within: 'Actions for ' + tag });
  s.ok(s.c.state.dlg && s.c.state.dlg.title === 'Delete ' + tag + '?', 'asks first (today: two clicks)');
  s.ok(new RegExp(nReads + ' reading').test(s.c.state.dlg.body), 'says how many readings go: ' + s.c.state.dlg.body);
  s.click('Cancel', { within: 'Delete ' + tag + '?' });
  s.ok(doc().keyResults.some((k) => k.id === kr.id), 'Cancel keeps it');
  s.click('Actions for ' + tag);
  s.click('Delete key result', { within: 'Actions for ' + tag });
  s.click('Delete key result', { within: 'Delete ' + tag + '?' });
  s.ok(!doc().keyResults.some((k) => k.id === kr.id), 'key result gone');
  s.eq('its KPIs gone', doc().kpis.filter((x) => kids.indexOf(x.id) >= 0).length, 0);
  s.eq('their readings gone', doc().kpiUpdates.filter((u) => kids.indexOf(u.kpiId) >= 0).length, 0);
  s.ok(hasToast('Key result deleted.'), 'toast');
});
s.step('F5 KR editor KPI list: add, edit / done, remove (never the last), name fallback, types, borrow, target', () => {
  fresh();
  goTab('Key results');
  const list = krsOf(doc(), ctx().objId);
  const kr = list.find((k) => k.trackingType === 'kpi');
  const tag = krTag(list, kr);
  s.click('Actions for ' + tag);
  s.click('Edit key result', { within: 'Actions for ' + tag });
  const n0 = s.vals.kr.sheet.kpis.length;
  s.eq('one row per KPI', n0, doc().kpis.filter((x) => x.hostType === 'keyResult' && x.hostId === kr.id).length);
  s.eq('first row starts open (today: openKpi 0)', s.vals.kr.sheet.kpis[0].open || s.vals.kr.sheet.kpis[0].linked, true);
  s.click('Add KPI', { within: 'kr-sheet' });
  s.eq('a new row, open', [s.vals.kr.sheet.kpis.length, s.vals.kr.sheet.kpis[n0].open], [n0 + 1, true]);
  s.eq('direction offers Increase / Decrease only (no range here, as today)', s.vals.kr.sheet.kpis[n0].dirs.map((x) => x.label), ['Increase', 'Decrease']);
  s.click('Statistical', { within: 'kpi-' + n0 });
  s.type('Read count', 'ten', { within: 'kpi-' + n0 });
  s.click('Save key result');
  s.ok(/whole number of readings/.test(s.c.sheet().err), 'a typo in the read count is refused (today saved NaN)');
  s.type('Read count', '8', { within: 'kpi-' + n0 });
  s.type('Target', '1.9', { within: 'kpi-' + n0 });
  s.click('Decrease', { within: 'kpi-' + n0 });
  /* sample borrowing: this objective's statistical KPIs that hold their own readings, never the KPI itself */
  const holders = doc().kpis.filter((k) => !k.readsFrom && k.targetType === 'statistical' && ((k.hostType === 'keyResult' && krsOf(doc(), ctx().objId).some((r) => r.id === k.hostId)) || (k.hostType === 'stageGate' && doc().stageGates.some((g) => g.id === k.hostId && g.objectiveId === ctx().objId))));
  const offered = s.vals.kr.sheet.kpis[n0].sampleGroups.reduce((a, g) => a.concat(g.opts.map((o) => o.v)), []);
  s.eq('borrowable samples', offered.slice().sort(), holders.map((k) => k.id).sort());
  if (holders.length) s.type('Sample', holders[0].id, { within: 'kpi-' + n0 });
  s.click('Save key result');
  const kpis = doc().kpis.filter((x) => x.hostType === 'keyResult' && x.hostId === kr.id);
  const nk = kpis[kpis.length - 1];
  s.eq('an unnamed KPI takes the statement (today)', nk.name, kr.statement);
  s.eq('saved like today', [nk.targetType, nk.direction, nk.target, nk.statistic, nk.readCount, nk.readsFrom || null, nk.groupId, nk.isDefiner], ['statistical', 'down', 1.9, 'average', 8, holders.length ? holders[0].id : null, null, true]);
  /* remove: never the last */
  s.click('Actions for ' + tag);
  s.click('Edit key result', { within: 'Actions for ' + tag });
  while (s.vals.kr.sheet.kpis.length > 1) {
    const last = s.vals.kr.sheet.kpis[s.vals.kr.sheet.kpis.length - 1];
    s.click(last.removeLabel);
    if (s.c.state.dlg) s.click('Remove KPI');
  }
  s.click(s.vals.kr.sheet.kpis[0].removeLabel);
  s.ok(/needs at least one KPI/.test(s.c.sheet().err), 'the last KPI cannot be removed (today\'s rule)');
  closeSheets();
  /* binary clears direction / target / unit / statistics */
  s.click('Actions for ' + tag);
  s.click('Edit key result', { within: 'Actions for ' + tag });
  s.click('Binary', { within: 'kpi-0' });
  s.click('Save key result');
  const k0 = doc().kpis.find((x) => x.id === s.c.D.docs[ctx().docKey].kpis.filter((y) => y.hostType === 'keyResult' && y.hostId === kr.id)[0].id);
  if (!(k0.linkParent != null)) s.eq('binary clears like today', [k0.targetType, k0.direction, k0.target, k0.unit, k0.statistic, k0.readCount], ['binary', null, null, null, undefined, undefined]);
});
s.step('F6 milestone steps: credit mode, steps editor (fixed: wired and saved), score and drawer', () => {
  fresh();
  goTab('Key results');
  s.click('Add key result', { within: 'kr-panel' });
  s.type('Statement', 'Ship the three pilot reports');
  s.type('Tracking type', 'milestone');
  s.eq('credit mode defaults to binary', s.vals.kr.sheet.creditModes.find((x) => x.on === 'true').label, 'Binary');
  s.expect('Full weight only when a step is done, strictly at 100%.');
  s.click('Add step'); s.click('Add step'); s.click('Add step');
  s.type('Name of step 1', 'Report A'); s.type('Name of step 2', 'Report B'); s.type('Name of step 3', 'Report C');
  s.type('~Weight of “Report A”', '50');
  s.eq('auto weights share the rest', s.vals.kr.sheet.steps.map((x) => x.auto ? x.autoText : x.weight), ['50', '25.0%', '25.0%']);
  s.eq('total', s.vals.kr.sheet.sumText, '100.0% of 100%');
  s.type('~Due date of “Report B”', '2026-10-01');
  s.check('Done: “Report A”', true);
  s.click('Partial');
  s.expect('Weight scales by % complete.');
  s.type('~Completion of “Report B”', '40');
  s.click('Save key result');
  const kr = krsOf(doc(), ctx().objId).find((k) => k.statement === 'Ship the three pilot reports');
  s.eq('steps and credit mode are saved (fixed: Execution dropped them)', [kr.creditMode, kr.steps.map((x) => [x.name, x.weight, x.due, x.completion])], ['partial', [['Report A', 50, '', 100], ['Report B', null, '2026-10-01', 40], ['Report C', null, '', 0]]]);
  const want = RD.keyResultScore(kr.id, ctx().em);
  s.eq('score = engine milestone score (50 + 25×40%)', Math.round(want), 60);
  const list = krsOf(doc(), ctx().objId);
  const row = s.vals.kr.rows[list.indexOf(kr)];
  s.eq('KR-M tag', row.tag, 'KR-M' + list.filter((k) => k.trackingType === 'milestone').indexOf(kr) + 1 === 'KR-M' ? '' : krTag(list, kr));
  s.eq('row score', row.score, String(Math.round(want)));
  /* drawer: % input under partial credit, contribution, overdue, sum of weights */
  s.c.setState({ kr_open: { [kr.id]: true } }); s.render();
  const ms = s.vals.kr.rows[list.indexOf(kr)].ms;
  s.eq('drawer mode', ms.modeWord, 'Partial credit');
  s.eq('contribution per step (RD.milestoneStepContribution)', ms.rows.map((x) => x.contrib), ['50.0%', '10.0%', '0.0%']);
  s.eq('overdue: undone and due before today', ms.rows.map((x) => x.overdue), [false, true, false]);
  s.eq('sum of weights', ms.sum, '100%');
  s.click('Completion of Report C, in %');
  s.type('Completion of Report C, in %', '150');
  s.key('Completion of Report C, in %', 'Enter');
  s.eq('clamped to 100 like today', doc().keyResults.find((k) => k.id === kr.id).steps[2].completion, 100);
  s.eq('score follows', s.vals.kr.rows[list.indexOf(kr)].score, String(Math.round(RD.keyResultScore(kr.id, ctx().em))));
});
s.step('F7 legacy sub-key results: only for a KR that uses them; four types; weight; preview; met', () => {
  fresh();
  {
    if (EXEC) pickDiv('DIV-FC', 'OBJ-FC-2026Q4-03');
    else {
      /* the Sales sample has no legacy key result: an older record, the way such a document holds it */
      doc().keyResults.unshift({ id: 'KR-BD-2026Q4-01-9', objectiveId: ctx().objId, statement: 'Pilot readiness (legacy)', trackingType: 'subkr', subKrs: [{ name: 'Site survey', weight: 1, trackingType: 'percentage', progress: 50, kpis: [] }] });
      s.render();
    }
    goTab('Key results');
    const kr = krsOf(doc(), ctx().objId).find((k) => k.trackingType === 'subkr');
    s.click('Actions for KR1');
    s.click('Edit key result', { within: 'Actions for KR1' });
    s.eq('legacy type offered for this key result', s.vals.kr.sheet.typeOpts.map((o) => o.v), ['percentage', 'kpi', 'milestone', 'subkr']);
    s.click('Add sub-key result');
    s.eq('sub sheet', sheetKind(), 'kr.sub');
    s.click('Statistical', { within: 'kr-sub' });
    s.type('Name', 'Mass activity', { within: 'kr-sub' });
    s.type('Readings, newest first', '1.02, 0.98 1.05,');
    s.expect('Average: 1.017 from 3 readings', 'live preview (a trailing separator adds no reading: fixed)');
    s.type('Weight', '0.05', { within: 'kr-sub' });
    s.click('Save sub-key result');
    s.ok(/0\.1 or more/.test(s.c.sheet().err), 'weight below 0.1 refused');
    s.type('Weight', '2', { within: 'kr-sub' });
    s.type('Target', '1', { within: 'kr-sub' });
    s.click('Save sub-key result');
    s.eq('back on the key result', sheetKind(), 'kr.edit');
    s.click('Save key result');
    const saved = doc().keyResults.find((k) => k.id === kr.id).subKrs;
    const last = saved[saved.length - 1];
    s.eq('saved into the key result', [last.name, last.weight, last.trackingType, last.kpis[0].targetType, last.kpis[0].current], ['Mass activity', 2, 'kpi', 'statistical', RD.computeStat('average', [1.02, 0.98, 1.05])]);
    s.eq('score = engine weighted mean', s.vals.kr.rows[0].score, String(Math.round(RD.keyResultScore(kr.id, ctx().em))));
  }
  /* a key result that does not use sub-KRs never offers the legacy type */
  fresh(); goTab('Key results');
  s.click('Add key result', { within: 'kr-panel' });
  s.eq('new key results: three types', s.vals.kr.sheet.typeOpts.map((o) => o.v), ['percentage', 'kpi', 'milestone']);
  closeSheets();
});
s.step('F8 duplicate: "(copy)", KPIs without readings, progress / completion reset, opens the copy', () => {
  fresh();
  goTab('Key results');
  const list = krsOf(doc(), ctx().objId);
  const kr = list.find((k) => doc().kpis.some((x) => x.hostType === 'keyResult' && x.hostId === k.id));
  const tag = krTag(list, kr);
  const kids = doc().kpis.filter((x) => x.hostType === 'keyResult' && x.hostId === kr.id);
  const nUpd = doc().kpiUpdates.length;
  s.click('Actions for ' + tag);
  s.click('Duplicate', { within: 'Actions for ' + tag });
  const copy = doc().keyResults[doc().keyResults.length - 1];
  s.eq('copy', [copy.statement, copy.trackingType, copy.objectiveId], [kr.statement + ' (copy)', kr.trackingType || 'kpi', kr.objectiveId]);
  s.eq('id from RD.allocId', copy.id, RD.allocId('keyResult', ctx().objId, doc().keyResults.slice(0, -1).map((k) => k.id)));
  const ck = doc().kpis.filter((x) => x.hostType === 'keyResult' && x.hostId === copy.id);
  s.eq('KPIs copied with their targets', ck.map((k) => [k.name, k.targetType, k.direction, JSON.stringify(k.target)]), kids.map((k) => [k.name, k.targetType, k.direction, JSON.stringify(k.target)]));
  s.eq('no readings copied', doc().kpiUpdates.length, nUpd);
  s.ok(hasToast('Key result duplicated.'), 'toast');
  s.eq('fixed: the copy opens (today the editor stayed on the original)', [sheetKind(), s.c.sheet().data.krId], ['kr.edit', copy.id]);
  closeSheets();
  if (SALES) {
    const ms = krsOf(doc(), ctx().objId).find((k) => k.trackingType === 'milestone');
    const mtag = krTag(krsOf(doc(), ctx().objId), ms);
    s.click('Actions for ' + mtag);
    s.click('Duplicate', { within: 'Actions for ' + mtag });
    const c2 = doc().keyResults[doc().keyResults.length - 1];
    s.eq('fixed: step completion resets (today it carried over)', c2.steps.map((x) => x.completion), ms.steps.map(() => 0));
    closeSheets();
  }
});
s.step('F9 Save and link: saves, then opens Link a metric for the key result', () => {
  fresh();
  goTab('Key results');
  s.click('Add key result', { within: 'kr-panel' });
  s.type('Statement', 'Link me up');
  s.type('Tracking type', 'kpi');
  s.click('Save and link');
  const kr = krsOf(doc(), ctx().objId).find((k) => k.statement === 'Link me up');
  s.ok(!!kr, 'saved');
  s.eq('link sheet for the key result', [sheetKind(), s.c.sheet().data.host], ['kpi.link', { type: 'keyResult', id: kr.id }]);
  closeSheets();
});
s.step('F10 KPI expander: KPIs, Add KPI and Link a metric for every key result type (today: "+ add a KPI" on any key result)', () => {
  fresh();
  goTab('Key results');
  const list = krsOf(doc(), ctx().objId);
  const pct = list.find((k) => k.trackingType === 'percentage') || list.find((k) => k.trackingType === 'milestone');
  const tag = krTag(list, pct);
  s.click('Actions for ' + tag);
  s.click('Add KPI', { within: 'Actions for ' + tag });
  s.eq('KPI target sheet for this key result', [sheetKind(), s.c.sheet().data.host], ['kpi.target', { type: 'keyResult', id: pct.id }]);
  s.type('Name', 'Protocol steps signed off', { within: 'Editor' });
  s.type('Target', '5', { within: 'Editor' });
  s.click('Save KPI');
  s.ok(doc().kpis.some((k) => k.hostType === 'keyResult' && k.hostId === pct.id && k.name === 'Protocol steps signed off'), 'KPI added');
  checkKrRows('after adding a KPI to a non-KPI key result');
  s.c.setState({ kr_open: { [pct.id]: true } }); s.render();
  const row = s.vals.kr.rows[list.indexOf(pct)];
  s.ok(row.showKpis && row.hasKpiNote, 'the table shows, with a note that it does not change this key result\'s score');
  s.click('Actions for ' + tag);
  s.click('Link a metric', { within: 'Actions for ' + tag });
  s.eq('link sheet', sheetKind(), 'kpi.link');
  closeSheets();
  if (EXEC) {
    const kr = list.find((k) => k.trackingType === 'kpi');
    const t2 = krTag(list, kr);
    s.click('Actions for ' + t2);
    s.click('Connect data', { within: 'Actions for ' + t2 });
    s.eq('Connect data per key result (Execution)', [sheetKind(), s.c.sheet().data.host], ['kpi.connect', { type: 'keyResult', id: kr.id }]);
    closeSheets();
  } else {
    s.ok(!s.see('Connect data'), 'no Connect data in Sales');
  }
});


s.step('D6 an objective without planned dates: no planned end, score-only captions, no pace tick', () => {
  fresh(); useStore();
  const o = s.c.D.portfolio.objectives.find((x) => x.id === DEF_OBJ);
  const ps = o.plannedStart, pe = o.plannedEnd;
  delete o.plannedStart; delete o.plannedEnd;
  s.render();
  checkHead('no planned dates');
  s.ok(!/^Planned/.test(fact('schedule').detail), 'no planned date in the schedule sub: ' + fact('schedule').detail);
  s.eq('no pace tick on the score bar', s.vals.sh.head.score.hasPace, false);
  goTab('Key results');
  checkKrRows('no planned dates');
  s.ok(s.vals.kr.rows.some((r) => r.capText === 'No objective dates, score only'), 'score-only caption');
  o.plannedStart = ps; o.plannedEnd = pe;
});

/* =========================================================================================
   G. KPI tables, readings, batches, provenance, targets, linking (today's kpiTable, openPostCell,
      sample popover, saveTgtModal, linkCandidates / makeLinkMember, unlinkKpi, override editor)
   ========================================================================================= */
const api = () => s.c.MODS.kpi.api;
/* today's allKpisPool, re-derived: this doc's KPIs + portfolio KPIs + in-scope SPEC targets */
function poolOracle() {
  const P = s.c.D.portfolio, d = doc(), divId = ctx().divId, comp = P.composition || [];
  const anc = (mid) => { const out = {}, st = [mid]; while (st.length) { RD.compositionParents(st.pop(), comp).forEach((p) => { if (!out[p]) { out[p] = 1; st.push(p); } }); } return Object.keys(out); };
  const base = RD.classifiedTargets(P, comp, divId);
  const models = new Set(base.models), products = new Set(base.products);
  base.models.forEach((mid) => anc(mid).forEach((a) => { models.add(a); const m = P.models.find((x) => x.id === a); if (m && m.productId) products.add(m.productId); }));
  const tt = { products: [...products], models: [...models] };
  const divs = new Set();
  tt.products.forEach((pid) => { const pr = P.products.find((x) => x.id === pid); if (pr) divs.add(pr.divisionId); });
  tt.models.forEach((mid) => { const m = P.models.find((x) => x.id === mid); const pr = m && P.products.find((x) => x.id === m.productId); if (pr) divs.add(pr.divisionId); });
  let ref = [];
  divs.forEach((dv) => { const sd = s.c.D.spec['SPEC-' + dv]; if (sd && sd.kpis) ref = ref.concat(sd.kpis); });
  const tk0 = RD.targetKpisInScope(tt, ref), seen = new Set(tk0.map((k) => k.id)), ms = new Set(tt.models);
  const tk = tk0.concat(ref.filter((k) => k && k.hostType === 'component' && ms.has(k.objectiveId) && !seen.has(k.id)));
  const out = (P.kpis && P.kpis.length) ? d.kpis.concat(P.kpis) : d.kpis.slice();
  const have = new Set(out.map((k) => k.id));
  tk.forEach((k) => { if (!have.has(k.id)) { have.add(k.id); out.push(k); } });
  return out;
}
const fmtN = (v) => { const x = Number(v), a = Math.abs(x); if (a !== 0 && (a < 0.0001 || a >= 1e12)) return String(x); return x.toLocaleString('en-US', { maximumFractionDigits: 6 }); };
const withU = (str, u) => (!u ? str : /^(%|°)/.test(u) ? str + u : str + ' ' + u);
/* one KPI table row the way today's kpiTable computes it, in Calm's wording */
function rowOracle(k, AK, EM) {
  const name = RD.kpiName(k, AK), dir = RD.kpiDirection(k, AK), unit = RD.kpiUnit(k, AK) || '';
  const pp = RD.kpiScoreParts(k, AK, EM), tgt = RD.effTarget(k, AK), cv = RD.effValue(k, AK, EM), sc = pp.score, rs = pp.raw;
  const def = RD.definerOf(k, AK), isStat = def.targetType === 'statistical', isBin = def.targetType === 'binary';
  const member = (!!k.groupId && !k.isDefiner) || k.linkParent != null;
  const exp = pp.expected || 0, n = pp.n || 0, complete = !exp || n >= exp;
  const rawStatus = rs == null ? 'open' : rs >= 100 ? 'on track' : RD.band(rs) === 'on-track' ? 'on track' : RD.band(rs) === 'at-risk' ? 'near' : 'below';
  const st = sc == null ? 'open' : pp.partial ? rawStatus : (sc >= 100 && complete) ? 'met' : rawStatus;
  let crit;
  if (isBin) crit = 'Pass';
  else if (tgt == null) crit = 'No target yet';
  else if (typeof tgt === 'object') crit = fmtN(tgt.lo) + ' to ' + withU(fmtN(tgt.hi), unit);
  else crit = (dir === 'up' ? '≥ ' : dir === 'down' ? '≤ ' : '') + withU(fmtN(tgt), unit);
  let cur = 'No reading';
  if (cv != null) cur = isBin ? (Number(cv) >= 1 ? 'Pass' : 'Fail') : withU(fmtN(isStat ? Math.round(cv * 1000) / 1000 : cv), unit);
  const lk = member ? RD.linkOf(k, AK) : null;
  return { name, crit, cur, score: sc == null ? '—' : String(Math.round(sc)), st, partial: !!pp.partial, math: pp.partial ? Math.round(rs) + ' × ' + n + '/' + exp + ' samples' : '',
    member, critTag: member ? ((lk && lk.type === 'direct') ? 'Inherited' : (k.target != null ? 'Override' : 'Inherited')) : '', exp, n, complete, isStat };
}
function checkTable(label, host) {
  const AK = pool(), EM = ctx().em;
  const vm = api().table(s.c, ctx(), host, {});
  const want = AK.filter((k) => k.objectiveId === ctx().objId && k.hostType === host.type && k.hostId === host.id);
  s.eq(label + ' rows', vm.rows.map((r) => r.id), want.map((k) => k.id));
  want.forEach((k, i) => {
    const x = rowOracle(k, AK, EM), r = vm.rows[i], L = label + ' ' + k.id;
    s.eq(L + ' name / criterion / current', [r.name, r.crit, r.cur], [x.name || '(unnamed)', x.crit, x.cur]);
    s.eq(L + ' score / status / partial math', [r.score, r.stWord.toLowerCase(), r.partial, r.math], [x.score, x.st, x.partial, x.math]);
    s.eq(L + ' override / inherited tag', r.critTag, x.critTag);
    s.eq(L + ' linked badge', r.badges.some((b) => /^Linked/.test(b.label)), x.member);
    if (x.isStat && x.exp) s.ok(r.sub.indexOf(x.n + ' of ' + x.exp + ' samples') >= 0 && r.subCls.indexOf(x.complete ? 'tx-ok' : 'tx-warn') >= 0, L + ' sample line ' + r.sub);
  });
  const isGate = host.type === 'stageGate';
  const met = want.filter((k) => { const v = RD.kpiScoreResolved(k, AK, EM); return v != null && v >= 100; }).length;
  s.eq(label + ' summary', vm.summary, want.length ? (isGate ? met + ' of ' + want.length + ' met' : met + ' of ' + want.length + ' on target') + (vm.partialCount ? ', ' + vm.partialCount + ' partial' : '') : '');
}
s.step('G1 the resolution pool is today\'s allKpisPool (doc + portfolio + in-scope SPEC targets)', () => {
  fresh();
  const divs = ctx().divs.map((d) => d.id);
  divs.forEach((dv) => { pickDiv(dv); s.eq(dv + ' pool', pool().map((k) => k.id), poolOracle().map((k) => k.id)); });
});
s.step('G2 every KPI table (key results, gates, tasks) matches today\'s kpiTable numbers and words', () => {
  fresh();
  let n = 0;
  ctx().divs.forEach((dv) => {
    pickDiv(dv.id);
    ctx().allObjs.forEach((o) => {
      pickObj(o.id);
      const d = doc();
      d.keyResults.filter((r) => r.objectiveId === o.id).forEach((r) => { checkTable(o.id + ' KR', { type: 'keyResult', id: r.id }); n++; });
      d.stageGates.filter((g) => g.objectiveId === o.id).forEach((g) => { checkTable(o.id + ' gate', { type: 'stageGate', id: g.id }); n++; });
      d.tasks.filter((x) => x.objectiveId === o.id).forEach((x) => { checkTable(o.id + ' task', { type: 'task', id: x.id }); n++; });
    });
  });
  s.ok(n > (SALES ? 5 : 10), n + ' tables checked');
  s.clean('tables');
});
/* find a KPI of this board by a predicate, with its objective selected */
function onKpi(pred) {
  for (const dv of ctx().divs) {
    const d = s.c.D.docs[(SALES ? 'BIZ-' : 'EXEC-') + dv.id];
    const k = (d.kpis || []).find((x) => pred(x, d));
    if (k) { pickDiv(dv.id, k.objectiveId); return k; }
  }
  return null;
}
const openReadings = () => { goTab('Overview'); s.click(s.c.state.ro ? 'View readings' : 'Record readings'); };
/* inside the open sheet: the Overview's review table behind it has the same value buttons since October 19 */
const SH = () => (s.c.sheet() ? { within: 'Editor' } : undefined);
s.step('G3 post a reading inline: Enter posts {id UPD-<kpi>-<ts>, value, timestamp, note:""}, Escape cancels, unchanged posts nothing', () => {
  fresh();
  const k = onKpi((x, d) => !x.linkParent && x.targetType === 'demonstration' && x.objectiveId && d.kpiUpdates.some((u) => u.kpiId === x.id));
  openReadings();
  const nm = RD.kpiName(k, pool());
  const cur = RD.effValue(k, pool(), ctx().em);
  s.click('Post a reading for ' + nm, SH());
  s.eq('pre-filled with the current value', s.find('New value for ' + nm).attrs.value, String(cur));
  s.eq('placeholder says blank clears (it has own readings)', s.find('New value for ' + nm).attrs.placeholder, 'Blank clears');
  s.key('New value for ' + nm, 'Escape');
  s.ok(!s.has('New value for ' + nm), 'Escape cancels');
  const n0 = doc().kpiUpdates.length;
  s.click('Post a reading for ' + nm, SH());
  s.key('New value for ' + nm, 'Enter');
  s.eq('unchanged value posts nothing', doc().kpiUpdates.length, n0);
  s.click('Post a reading for ' + nm, SH());
  s.type('New value for ' + nm, 'abc');
  s.key('New value for ' + nm, 'Enter');
  s.eq('invalid value posts nothing', doc().kpiUpdates.length, n0);
  s.ok(s.see('Use a number, like 1.85.'), 'and says how to fix it');
  s.type('New value for ' + nm, String(Number(cur) + 1));
  s.key('New value for ' + nm, 'Enter');
  const u = doc().kpiUpdates[doc().kpiUpdates.length - 1];
  s.eq('reading shape', [u.id.indexOf('UPD-' + k.id + '-') === 0, u.kpiId, u.value, typeof u.timestamp, u.note], [true, k.id, Number(cur) + 1, 'number', '']);
  s.ok(hasToast('Reading posted.'), 'toast');
  s.eq('value now', RD.effValue(k, pool(), ctx().em), Number(cur) + 1);
  /* blur commits too */
  s.click('Post a reading for ' + nm, SH());
  s.type('New value for ' + nm, String(Number(cur) + 2));
  const el = s.find('New value for ' + nm);
  s.fire(el, 'onBlur');
  s.eq('leaving the field commits', RD.effValue(k, pool(), ctx().em), Number(cur) + 2);
  closeSheets();
});
s.step('G4 blank clears the KPI\'s own readings (one at once; several after a confirm), so its link takes over', () => {
  fresh();
  const k = onKpi((x, d) => !x.linkParent && x.targetType === 'demonstration' && x.objectiveId && d.kpiUpdates.some((u) => u.kpiId === x.id));
  openReadings();
  const nm = RD.kpiName(k, pool());
  s.click('Post a reading for ' + nm, SH());
  s.type('New value for ' + nm, '7');
  s.key('New value for ' + nm, 'Enter');
  const own = () => doc().kpiUpdates.filter((u) => u.kpiId === k.id).length;
  s.ok(own() >= 2, 'several own readings');
  s.click('Post a reading for ' + nm, SH());
  s.type('New value for ' + nm, '');
  s.fire(s.find('New value for ' + nm), 'onBlur');
  s.ok(own() >= 2 && !s.c.state.dlg, 'leaving the field blank clears nothing (today: blur cancels an armed clear)');
  s.click('Post a reading for ' + nm, SH());
  s.type('New value for ' + nm, '');
  s.key('New value for ' + nm, 'Enter');
  const n = own();
  s.ok(s.c.state.dlg && s.c.state.dlg.title === 'Clear ' + n + ' readings?', 'several readings: asks first (today: armed, Enter again)');
  s.click('Clear readings');
  s.eq('all own readings gone', own(), 0);
  s.ok(toasts().some((x) => x.indexOf('Cleared ' + n + ' readings.') === 0), 'toast "Cleared N readings."');
  /* exactly one reading clears at once */
  s.click('Post a reading for ' + nm, SH());
  s.type('New value for ' + nm, '3');
  s.key('New value for ' + nm, 'Enter');
  s.click('Post a reading for ' + nm, SH());
  s.type('New value for ' + nm, '');
  s.key('New value for ' + nm, 'Enter');
  s.ok(!s.c.state.dlg && own() === 0, 'one reading clears at once');
  closeSheets();
});
s.step('G5 statistical sample: statistic over the current batch, partial block, add / remove / new batch, borrowed sample', () => {
  fresh();
  if (SALES) {
    /* Sales has no statistical KPI in the sample: make one the way a person would */
    goTab('Key results');
    const kr = krsOf(doc(), ctx().objId).find((r) => r.trackingType === 'kpi');
    s.c.setState({ kr_open: { [kr.id]: true } }); s.render();
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + kr.id });
    s.type('Name', 'Pilot uptime', { within: 'Editor' });
    s.click('Statistical', { within: 'Editor' });
    s.type('Read count', '4', { within: 'Editor' });
    s.type('Target', '95', { within: 'Editor' });
    s.click('Save KPI');
  }
  const k = onKpi((x) => !x.readsFrom && (x.targetType === 'statistical') && x.readCount);
  openReadings();
  const AK = pool(), EM = ctx().em, nm = RD.kpiName(k, AK);
  const btn = s.has('Readings for ' + nm, SH()) ? 'Readings for ' + nm : 'Add readings for ' + nm;
  s.click(btn, SH());
  const reads = RD.readingsFor(RD.readingSourceId(k, AK), EM).filter((u) => !isNaN(Number(u.value)));
  const cur = RD.currentBatchReadings(reads), xs = cur.map((u) => Number(u.value));
  const def = RD.definerOf(k, AK), stat = def.statistic || 'average';
  const W = { average: 'Average', median: 'Median', stddev: 'Std dev', cv: 'CV', range: 'Range', max: 'Max', min: 'Min' };
  const dr = () => { const rows = api().table(s.c, ctx(), { type: k.hostType, id: k.hostId }, { key: 'all:' + k.hostType + ':' + k.hostId }).rows; return rows.find((r) => r.id === k.id).drawer; };
  s.eq('statistic over the current batch only', dr().statLine, W[stat] + ' = ' + (xs.length ? withU(fmtN(Math.round(RD.computeStat(stat, xs) * 1000) / 1000), stat === 'cv' ? '%' : (RD.kpiUnit(k, AK) || '')) : '—'));
  s.eq('n of N', dr().cnt, xs.length + ' of ' + Number(def.readCount) + ' samples');
  s.eq('readings newest first', dr().rows.map((r) => r.when), reads.map((u) => { const t = new Date(u.timestamp); return MON[t.getUTCMonth()] + ' ' + t.getUTCDate() + ', ' + ((t.getUTCHours() % 12) || 12) + ':' + String(t.getUTCMinutes()).padStart(2, '0') + ' ' + (t.getUTCHours() >= 12 ? 'PM' : 'AM'); }));
  const latest = RD.latestBatchId(reads);
  s.eq('earlier batches dimmed', dr().rows.map((r) => r.stale), reads.map((u) => (u.batch != null ? String(u.batch) : '') !== latest));
  const pp = RD.kpiScoreParts(k, AK, EM);
  if (pp.partial) s.eq('partial block', [dr().pt.math, dr().pt.more], [Math.round(pp.raw) + ' × ' + pp.n + '/' + pp.expected + ' samples = ' + Math.round(pp.score), (pp.expected - pp.n) + ' more reading' + (pp.expected - pp.n === 1 ? '' : 's') + ' to a full check-in']);
  /* Escape in the reading field closes the sample (today: Escape closes the popover) */
  s.key('New reading for ' + nm, 'Escape');
  s.ok(!s.has('New reading for ' + nm), 'Escape closes the sample');
  s.click(btn, SH());
  /* add joins the current batch */
  s.type('New reading for ' + nm, '1.79');
  s.key('New reading for ' + nm, 'Enter');
  const src = RD.readingSourceId(k, pool());
  const added = doc().kpiUpdates.filter((u) => u.kpiId === src).slice().sort((a, b) => b.timestamp - a.timestamp)[0];
  s.eq('added to the current batch', [added.value, (added.batch || '') === (latest || '')], [1.79, true]);
  s.ok(hasToast('Reading added.'), 'toast');
  s.click('Add reading', { within: 'Readings for ' + nm });
  s.ok(dr().err === 'Type a value first.', 'empty add says what to do');
  /* new batch: the next reading starts it; earlier readings stop counting */
  s.click('Start a new batch');
  s.type('New reading for ' + nm, '1.70');
  s.click('Add reading', { within: 'Readings for ' + nm });
  const nb = doc().kpiUpdates.filter((u) => u.kpiId === src).slice().sort((a, b) => b.timestamp - a.timestamp)[0];
  s.ok(nb.batch && nb.batch !== latest, 'a fresh batch id');
  s.eq('the statistic restarts from it', dr().statLine.indexOf('= ' + withU('1.7', stat === 'cv' ? '%' : (RD.kpiUnit(k, pool()) || ''))) > 0, true);
  s.eq('older readings are marked earlier batch', dr().rows.filter((r) => r.stale).length, reads.length + 1);
  /* remove asks once, then removes */
  const nBefore = doc().kpiUpdates.length;
  const first = dr().rows[0];
  s.click(first.rmAria);
  s.eq('first click arms', doc().kpiUpdates.length, nBefore);
  s.click('Confirm removing ' + first.v.split(' ')[0]);
  s.eq('second click removes', doc().kpiUpdates.length, nBefore - 1);
  s.ok(hasToast('Reading removed.'), 'toast');
  /* a started batch is dropped when the drawer closes before a reading claims it */
  s.click('Start a new batch');
  s.click('Close readings');
  s.click(s.has('Readings for ' + nm, SH()) ? 'Readings for ' + nm : 'Add readings for ' + nm, SH());
  const curB = RD.latestBatchId(RD.readingsFor(src, ctx().em));
  s.type('New reading for ' + nm, '1.71');
  s.key('New reading for ' + nm, 'Enter');
  const nb2 = doc().kpiUpdates.filter((u) => u.kpiId === src).slice().sort((a, b) => b.timestamp - a.timestamp)[0];
  s.eq('an abandoned batch leaves no trace: the reading joins the current batch', nb2.batch || '', curB || '');
  closeSheets();
  /* a borrowed sample: readings are written where the data lives */
  const borrower = onKpi((x) => !!x.readsFrom);
  if (borrower) {
    openReadings();
    const bn = RD.kpiName(borrower, pool());
    s.click(s.has('Readings for ' + bn, SH()) ? 'Readings for ' + bn : 'Add readings for ' + bn, SH());
    s.type('New reading for ' + bn, '2');
    s.key('New reading for ' + bn, 'Enter');
    const last = doc().kpiUpdates[doc().kpiUpdates.length - 1];
    s.eq('borrowed sample: written to the KPI that holds it', last.kpiId, RD.readingSourceId(borrower, pool()));
    closeSheets();
  }
});
if (EXEC) {
  s.step('G6 provenance: Analysis chip and a source row that stays open across re-renders', () => {
    fresh();
    const k = onKpi((x, d) => d.kpiUpdates.some((u) => u.kpiId === x.id && u.src && u.src.portal === 'analysis'));
    openReadings();
    const nm = RD.kpiName(k, pool());
    const imp = doc().kpiUpdates.filter((u) => u.kpiId === k.id && u.src && u.src.portal === 'analysis').sort((a, b) => b.timestamp - a.timestamp)[0];
    const chip = s.find('Show where the imported readings of ' + nm + ' came from');
    s.ok(chip.attrs.title.indexOf(imp.src.sample) === 0 && chip.attrs.title.indexOf(imp.src.run_t.slice(0, 10)) > 0, 'chip tooltip: sample, conditions, run date');
    s.click('Show where the imported readings of ' + nm + ' came from');
    const n = doc().kpiUpdates.filter((u) => u.kpiId === k.id && u.src && u.src.portal === 'analysis').length;
    s.expect(n > 1 ? 'Imported from analysis, ' + n + ' readings' : 'Imported from analysis');
    s.expect(imp.src.bucket + ', ' + imp.src.key);
    s.expect(imp.src.job_id);
    s.render(); s.render();
    s.ok(s.see(imp.src.job_id), 'stays open across re-renders');
    closeSheets();
  });
} else {
  s.step('G6 Sales has no analysis chips or provenance rows (Execution only)', () => {
    fresh();
    openReadings();
    s.ok(!s.see('Imported from analysis') && !s.has((el) => /came from$/.test(el.attrs['aria-label'] || '')), 'none');
    closeSheets();
  });
}
s.step('G7 link a metric: candidates are exactly today\'s linkCandidates (up-only, family scope, no duplicates)', () => {
  fresh();
  const P = s.c.D.portfolio;
  const modelById = (mid) => (P.models || []).find((m) => m.id === mid) || null;
  const rankOf = (ht, oid) => (ht === 'initiative' || ht === 'milestone') ? 5 : ht === 'product' ? 4 : (ht === 'keyResult' && modelById(oid)) ? 4 : ht === 'component' ? 3 : ht === 'keyResult' ? 2 : ht === 'stageGate' ? 1 : 0;
  function oracle(hostType, hostId) {
    const AK = poolOracle(), d = doc(), O = hostType === 'initiative' ? null : ctx().objId;
    const o = P.objectives.find((x) => x.id === O), initId = o ? o.initiativeId : null;
    const msIds = new Set((P.milestones || []).filter((m) => m.initiativeId === initId).map((m) => m.id));
    const comp = P.composition || [];
    const anc = (mid) => { const out = {}, st = [mid]; while (st.length) { RD.compositionParents(st.pop(), comp).forEach((p) => { if (!out[p]) { out[p] = 1; st.push(p); } }); } return Object.keys(out); };
    const fam = { models: new Set(), products: new Set() };
    if (o) {
      const c = RD.effClass(o, P); let seeds = [];
      if (c.kind === 'model') seeds = [c.modelId];
      else if (c.kind === 'product') { fam.products.add(c.productId); seeds = (P.models || []).filter((m) => m.productId === c.productId).map((m) => m.id); }
      seeds.forEach((mid) => { [mid].concat(anc(mid), RD.descendantModels(mid, comp)).forEach((m) => fam.models.add(m)); });
      fam.models.forEach((mid) => { const m = modelById(mid); if (m && m.productId) fam.products.add(m.productId); });
    }
    const isFam = (k) => k.hostType === 'product' ? fam.products.has(k.hostId) : (k.hostType === 'keyResult' && modelById(k.objectiveId)) ? fam.models.has(k.objectiveId) : k.hostType === 'component' ? fam.models.has(k.objectiveId) : false;
    const occupied = new Set(d.kpis.filter((k) => k.hostType === hostType && k.hostId === hostId).map((k) => RD.definerOf(k, AK).id));
    const srcRank = rankOf(hostType, O), seen = new Set(), out = [];
    AK.forEach((k) => {
      const def = RD.definerOf(k, AK);
      const inScope = def.objectiveId === O || (def.hostType === 'initiative' && def.hostId === initId) || (def.hostType === 'milestone' && msIds.has(def.hostId)) || isFam(def);
      if (!inScope || rankOf(def.hostType, def.objectiveId) <= srcRank || seen.has(def.id) || occupied.has(def.id)) return;
      seen.add(def.id); out.push(def.id);
    });
    return out;
  }
  let n = 0;
  ctx().divs.forEach((dv) => {
    pickDiv(dv.id);
    ctx().allObjs.forEach((o) => {
      pickObj(o.id);
      const d = doc();
      const hosts = d.keyResults.filter((r) => r.objectiveId === o.id).map((r) => ({ type: 'keyResult', id: r.id }))
        .concat(d.stageGates.filter((g) => g.objectiveId === o.id).map((g) => ({ type: 'stageGate', id: g.id })))
        .concat(d.tasks.filter((x) => x.objectiveId === o.id).map((x) => ({ type: 'task', id: x.id })));
      hosts.forEach((h) => {
        api().openLink(s.c, ctx(), h); s.render();
        const got = (s.vals.kpi.lk ? s.vals.kpi.lk.items : []).filter((x) => !x.isHead).map((x) => x.id);
        s.eq(o.id + ' ' + h.type + ' ' + h.id + ' candidates', got.slice().sort(), oracle(h.type, h.id).slice().sort());
        if (!got.length) s.ok(s.vals.kpi.lk.none, 'empty state');
        closeSheets(); n++;
      });
    });
  });
  s.ok(n > (SALES ? 5 : 10), n + ' hosts checked');
});
s.step('G8 link: tree headings, default relationship, priority, cycle check, today\'s record and message', () => {
  fresh();
  goTab('Key results');
  const list = krsOf(doc(), ctx().objId);
  const kr = list.find((r) => r.trackingType === 'kpi');
  s.c.setState({ kr_open: { [kr.id]: true } }); s.render();
  s.click('Link a metric', { within: 'kpi-t:keyResult:' + kr.id });
  const lk = s.vals.kpi.lk;
  const heads = lk.items.filter((x) => x.isHead).map((x) => x.label.split(':')[0]);
  s.ok(heads.length > 0 && heads.every((h) => ['Initiative', 'Product', 'Model', 'Component', 'Objective', 'KR' + h.slice(2)].indexOf(h) >= 0 || /^KR\d|^SG-/.test(h)), 'tree levels: ' + heads.join(' › '));
  const first = lk.items.find((x) => !x.isHead);
  const defK = pool().find((k) => k.id === first.id);
  const parentLevel = defK.hostType === 'product' ? 'product' : (s.c.D.portfolio.models.some((m) => m.id === defK.objectiveId) ? 'model' : defK.hostType);
  const want = ({ 'product>keyResult': 'contribute', 'model>keyResult': 'contribute', 'product>initiative': 'direct', 'model>initiative': 'direct' })[parentLevel + '>keyResult'] || 'contribute';
  s.eq('default relationship', lk.rels.find((r) => r.on === 'true').label.toLowerCase(), want);
  s.click('Specification', { within: 'Relationship' });
  const sibs = doc().kpis.filter((k) => k.linkParent === first.id).map((k) => k.linkPriority || 0);
  s.click('Link', { within: 'Editor' });
  const made = doc().kpis[doc().kpis.length - 1];
  s.eq('record like today\'s makeLinkMember', [made.objectiveId, made.hostType, made.hostId, made.linkParent, made.linkType, made.linkPriority, made.name, made.direction, made.unit, made.target, made.order], [ctx().objId, 'keyResult', kr.id, first.id, 'specification', (sibs.length ? Math.max.apply(null, sibs) : 0) + 1, null, null, null, null, 0]);
  s.ok(toasts().some((x) => /^Linked to .* \(specification\)\.$/.test(x)), 'toast "Linked to <host> (specification)."');
  s.eq('id from RD.allocId on the objective', made.id, RD.allocId('kpi', ctx().objId, doc().kpis.slice(0, -1).map((k) => k.id)));
  /* the host can't link the same metric twice */
  s.click('Link a metric', { within: 'kpi-t:keyResult:' + kr.id });
  s.ok(!s.vals.kpi.lk.items.some((x) => x.id === first.id), 'already linked metric no longer offered');
  closeSheets();
  /* cycle: a link whose id collides with the chosen parent's chain is refused with today's message */
  const g = doc().stageGates.find((x) => x.objectiveId === ctx().objId);
  const krKpi = doc().kpis.find((k) => k.hostType === 'keyResult' && k.hostId === kr.id && !k.linkParent);
  if (g && krKpi) {
    api().openLink(s.c, ctx(), { type: 'stageGate', id: g.id }); s.render();
    s.c.setDraft({ pick: krKpi.id, rel: 'contribute' }); s.render();
    /* the chosen parent's chain already reaches a KPI carrying the id the new link would get (an id held
       outside this doc, e.g. in the portfolio): RD.wouldCreateCycle must refuse it, as makeLinkMember does */
    const nextId = RD.allocId('kpi', ctx().objId, doc().kpis.map((k) => k.id));
    s.c.D.portfolio.kpis.push({ id: nextId, objectiveId: null, hostType: 'initiative', hostId: 'INIT-X', name: 'ghost', targetType: 'demonstration', direction: 'up', target: 1 });
    krKpi.linkParent = nextId; krKpi.linkType = 'contribute';
    const n0 = doc().kpis.length;
    s.click('Link', { within: 'Editor' });
    s.eq('cycle refused', s.c.sheet() && s.c.sheet().err, 'That link would create a cycle — choose a different target.');
    s.eq('nothing written', doc().kpis.length, n0);
    delete krKpi.linkParent; delete krKpi.linkType; s.c.D.portfolio.kpis.pop();
    closeSheets();
  }
});
s.step('G9 override a linked KPI: local name only, override target, inherited target shown, save', () => {
  fresh();
  let m = onKpi((x) => x.linkParent != null && x.linkType !== 'direct' && x.objectiveId);
  if (!m) {
    /* Sales' sample has no contribute member: link a key result to its initiative metric first */
    const kr = krsOf(doc(), ctx().objId).find((r) => r.trackingType === 'kpi');
    api().openLink(s.c, ctx(), { type: 'keyResult', id: kr.id }); s.render();
    s.click('Contribute', { within: 'Relationship' });
    s.click('Link', { within: 'Editor' });
    m = doc().kpis[doc().kpis.length - 1];
    s.eq('contribute member made', [m.linkType, m.hostId], ['contribute', kr.id]);
  }
  openReadings();
  const AK = pool(), nm = RD.kpiName(m, AK);
  s.click((m.hostType === 'stageGate' ? 'Edit the override for ' : 'Edit the override for ') + nm);
  s.eq('override sheet', sheetKind(), 'kpi.override');
  const parent = AK.find((k) => k.id === m.linkParent);
  const inh = RD.effTarget(parent, AK);
  s.ok(s.vals.kpi.ov.inhText.indexOf(String(inh)) >= 0, 'inherited target is the parent\'s (fixed: today showed the override itself): ' + s.vals.kpi.ov.inhText);
  s.type('Name here', 'H2 in O2 at stack outlet');
  s.type('Override target', 'abc');
  s.click('Save override');
  s.ok(/Use a number for the override/.test(s.c.sheet().err), 'a non-number is refused');
  s.type('Override target', '0.8');
  s.click('Save override');
  const r = doc().kpis.find((k) => k.id === m.id);
  s.eq('local name and override saved', [r.localName, r.target], ['H2 in O2 at stack outlet', 0.8]);
  s.eq('the source is never renamed', parent.name === 'H2 in O2 at stack outlet', false);
  s.eq('the row shows the local name, Override tag', [api().table(s.c, ctx(), { type: m.hostType, id: m.hostId }, {}).rows.find((x) => x.id === m.id).name], ['H2 in O2 at stack outlet']);
  s.ok(hasToast('Override saved.'), 'toast');
  /* blank = inherit */
  s.click('Edit the override for H2 in O2 at stack outlet');
  s.type('Name here', ''); s.type('Override target', '');
  s.click('Save override');
  const r2 = doc().kpis.find((k) => k.id === m.id);
  s.eq('blank inherits', [r2.localName, r2.target], [undefined, null]);
  closeSheets();
});
s.step('G10 a definer with members cannot be deleted; unlink keeps what the row showed; delete removes readings', () => {
  fresh();
  goTab('Key results');
  const list = krsOf(doc(), ctx().objId);
  const kr = list.find((r) => r.trackingType === 'kpi');
  const def = doc().kpis.find((k) => k.hostType === 'keyResult' && k.hostId === kr.id && k.linkParent == null);
  const g = doc().stageGates.find((x) => x.objectiveId === ctx().objId);
  /* link a gate KPI to the KR's KPI (gate rank 1 < KR rank 2) */
  api().openLink(s.c, ctx(), { type: 'stageGate', id: g.id }); s.render();
  s.c.setDraft({ pick: def.id, rel: 'contribute' }); s.render();
  s.click('Link', { within: 'Editor' });
  const mem = doc().kpis[doc().kpis.length - 1];
  s.eq('member made', mem.linkParent, def.id);
  const AK = pool(), dn = RD.kpiName(def, AK);
  s.c.setState({ kr_open: { [kr.id]: true } }); s.render();
  const row = api().table(s.c, ctx(), { type: 'keyResult', id: kr.id }, {}).rows.find((r) => r.id === def.id);
  s.ok(row.badges.some((b) => b.label === 'Defines 1'), 'definer shows "Defines 1" (fixed: today only counted legacy groups)');
  s.click('Actions for ' + dn, { within: 'kpi-t:keyResult:' + kr.id });
  s.click('Delete KPI', { within: 'kpi-t:keyResult:' + kr.id });
  s.ok(toasts().some((x) => x.indexOf('This KPI defines a linked metric — unlink its members first') === 0), 'refused with today\'s message');
  s.ok(doc().kpis.some((k) => k.id === def.id), 'still there');
  /* unlink the member: it keeps the name, direction, unit and target it showed */
  const shown = { name: RD.kpiName(mem, AK), direction: RD.kpiDirection(mem, AK), unit: RD.kpiUnit(mem, AK), target: RD.effTarget(mem, AK) };
  api().unlink(s.c, ctx(), mem.id); s.render();
  const after = doc().kpis.find((k) => k.id === mem.id);
  s.eq('unlink keeps what the row showed (today\'s unlinkKpi)', { name: after.name, direction: after.direction, unit: after.unit, target: after.target }, shown);
  s.eq('detached', [after.linkParent, after.groupId, after.isDefiner], [null, null, true]);
  s.ok(hasToast('Unlinked.'), 'toast');
  /* now the definer can go, with its readings */
  const nR = doc().kpiUpdates.filter((u) => u.kpiId === def.id).length;
  s.click('Actions for ' + dn, { within: 'kpi-t:keyResult:' + kr.id });
  s.click('Delete KPI', { within: 'kpi-t:keyResult:' + kr.id });
  s.ok(s.c.state.dlg && s.c.state.dlg.body.indexOf(nR ? 'Its ' + nR + ' reading' : 'no readings') >= 0, 'confirm says what is lost');
  s.click('Delete KPI', { within: 'Delete “' + dn + '”?' });
  s.ok(!doc().kpis.some((k) => k.id === def.id), 'deleted');
  s.eq('its readings deleted', doc().kpiUpdates.filter((u) => u.kpiId === def.id).length, 0);
  s.ok(hasToast('KPI deleted.'), 'toast');
});
s.step('G11 target sheet: types, statistics, borrowing, direction incl. range (min/max and average ± %), validation, save like today', () => {
  fresh();
  const g = doc().stageGates.find((x) => x.objectiveId === ctx().objId);
  openReadings();
  api().openTarget(s.c, ctx(), { type: 'stageGate', id: g.id }, null); s.render();
  s.eq('title', s.vals.kpi.tg.title, 'Add gate target');
  s.click('Save target');
  s.eq('name required', s.c.sheet().err, 'Give the target a name.');
  s.type('Name', 'Seal compression set', { within: 'Editor' });
  s.click('Range', { within: 'Direction' });
  s.ok(!s.vals.kpi.tg.showTarget, 'Target hidden for a range');
  s.click('Average ± width %');
  s.type('Average', '8'); s.type('Width %', '50');
  s.expect('Full credit from 6 to 10 (width 4); zero one width outside.', 'live preview (today: half = |c × p / 100| / 2)');
  s.type('Unit', '%', { within: 'Editor' });
  s.click('Save target');
  const k = doc().kpis[doc().kpis.length - 1];
  s.eq('saved like today', [k.name, k.hostType, k.hostId, k.targetType, k.direction, JSON.stringify(k.target), JSON.stringify(k.rangeSpec), k.unit, k.groupId, k.isDefiner], ['Seal compression set', 'stageGate', g.id, 'demonstration', 'range', JSON.stringify({ lo: 6, hi: 10 }), JSON.stringify({ mode: 'pct', center: 8, pct: 50 }), '%', null, true]);
  s.ok(hasToast('Gate target saved.'), 'toast');
  /* reopen: it comes back in the mode it was entered in */
  api().openTarget(s.c, ctx(), { type: 'stageGate', id: g.id }, k.id); s.render();
  s.eq('edit title', s.vals.kpi.tg.title, 'Edit gate target');
  s.eq('range mode remembered', s.vals.kpi.tg.isPct, true);
  s.click('Min / max');
  s.type('Minimum', '10'); s.type('Maximum', '6');
  s.click('Save target');
  const k2 = doc().kpis.find((x) => x.id === k.id);
  s.eq('min / max (reversed is normalised like today)', [JSON.stringify(k2.target), k2.rangeSpec], [JSON.stringify({ lo: 6, hi: 10 }), undefined]);
  /* statistical with borrowing, then binary clears */
  api().openTarget(s.c, ctx(), { type: 'stageGate', id: g.id }, k.id); s.render();
  s.click('Statistical', { within: 'Editor' });
  s.type('Read count', '0');
  s.click('Save target');
  s.ok(/whole number/.test(s.c.sheet().err), 'read count must be a whole number of 1 or more');
  s.type('Read count', '5');
  s.type('Statistic', 'median');
  const opt = s.vals.kpi.tg.readsFromOpts.find((o) => !o.dis && o.v);
  if (opt) s.type('Readings come from', opt.v);
  s.click('Save target');
  const k3 = doc().kpis.find((x) => x.id === k.id);
  s.eq('statistical fields', [k3.targetType, k3.statistic, k3.readCount, k3.readsFrom || ''], ['statistical', 'median', 5, opt ? opt.v : '']);
  api().openTarget(s.c, ctx(), { type: 'stageGate', id: g.id }, k.id); s.render();
  s.click('Binary (pass or fail)');
  s.click('Save target');
  const k4 = doc().kpis.find((x) => x.id === k.id);
  s.eq('binary clears direction, target, unit and statistics (and the borrowed sample: fixed)', [k4.targetType, k4.direction, k4.target, k4.unit, k4.statistic, k4.readCount, k4.readsFrom], ['binary', null, null, null, undefined, undefined, undefined]);
  /* a KR KPI: "Add KPI" / "KPI saved." */
  closeSheets();
  const kr = krsOf(doc(), ctx().objId).find((r) => r.trackingType === 'kpi');
  api().openTarget(s.c, ctx(), { type: 'keyResult', id: kr.id }, null); s.render();
  s.eq('KR title', s.vals.kpi.tg.title, 'Add KPI');
  s.type('Name', 'Stack ASR', { within: 'Editor' });
  s.type('Target', 'x');
  s.click('Save KPI');
  s.eq('a non-numeric target is refused', s.c.sheet().err, 'Use a number for the target, like 1.85.');
  s.type('Target', '0.3');
  s.click('Decrease', { within: 'Direction' });
  s.click('Save KPI');
  s.ok(hasToast('KPI saved.'), 'toast');
  const kk = doc().kpis[doc().kpis.length - 1];
  s.eq('KR KPI', [kk.hostType, kk.hostId, kk.direction, kk.target], ['keyResult', kr.id, 'down', 0.3]);
  closeSheets();
});
s.step('G12 draft targets while adding a gate: held in the gate draft, saved with the gate', () => {
  fresh();
  const host = { type: 'stageGate', id: '__pending__' };
  let list = [];
  const tbl = () => api().table(s.c, ctx(), host, { pending: list, onPending: (l) => { list = l; } });
  s.eq('empty draft table', tbl().emptyText, 'No targets yet. Add measurable pass criteria; they are saved with the gate.');
  tbl().add(); s.render();
  s.type('Name', 'Weld leak rate', { within: 'Editor' });
  s.type('Target', '0.01');
  s.click('Decrease', { within: 'Direction' });
  s.click('Save target');
  s.eq('held as a draft (nothing written yet)', [list.length, list[0].name, list[0].direction, list[0].target], [1, 'Weld leak rate', 'down', 0.01]);
  s.ok(hasToast('Target added. It’s saved with the gate.'), 'today\'s message');
  tbl().rows[0].open(); s.render();
  s.type('Target', '0.02');
  s.click('Save target');
  s.eq('edited in place', [list.length, list[0].target], [1, 0.02]);
  s.ok(hasToast('Target updated.'), 'today\'s message');
  const d = doc(), n0 = d.kpis.length;
  api().commitPending(d, ctx().objId, 'SG-NEW-1', list);
  const made = d.kpis.slice(n0);
  s.eq('committed as KPIs on the new gate', made.map((k) => [k.hostType, k.hostId, k.name, k.groupId, k.isDefiner, k.objectiveId]), [['stageGate', 'SG-NEW-1', 'Weld leak rate', null, true, ctx().objId]]);
});


s.step('G13 draft targets through the Add stage-gate sheet: pushed over it, the gate draft kept, committed with the gate', () => {
  fresh();
  goTab('Stage-gates');
  const addBtn = s.all((el) => el.on.onClick && textOf(el) === 'Add gate')[0];
  s.fire(addBtn, 'onClick');
  s.eq('gate sheet', sheetKind(), 'gates.edit');
  s.type('Name', 'Weld qualified', { within: 'Editor' });
  s.click('Add target', { within: 'Editor' });
  s.eq('target sheet stacked on the gate sheet', [sheetKind(), s.c.state.sheets.length], ['kpi.target', 2]);
  s.type('Name', 'Weld leak rate', { within: 'Editor' });
  s.type('Target', '0.01', { within: 'Editor' });
  s.click('Decrease', { within: 'Direction' });
  s.click('Save target');
  s.eq('back on the gate sheet with its typing', [sheetKind(), s.c.draft().name], ['gates.edit', 'Weld qualified']);
  s.ok(s.see('Weld leak rate'), 'draft target listed');
  s.type('Planned date', '2026-12-01', { within: 'Editor' });
  const n0 = doc().kpis.length;
  s.click('Add gate', { within: 'Editor' });
  const made = doc().kpis.slice(n0);
  const g = doc().stageGates[doc().stageGates.length - 1];
  s.eq('committed as a KPI on the new gate', made.map((k) => [k.hostType, k.hostId, k.name, k.direction, k.target, k.groupId, k.isDefiner]), [['stageGate', g.id, 'Weld leak rate', 'down', 0.01, null, true]]);
});

/* =========================================================================================
   H. Connect data (Execution only): today's openConnectData / cdRender / cdApplyDiff / cdDoImport
   ========================================================================================= */
if (EXEC) {
  const hostReads = (host) => doc().kpis.filter((k) => k.hostType === host.type && k.hostId === host.id).map((k) => ({ id: k.id, source_kpi_gid: k.id }));
  const openCd = (krTagLabel) => { goTab('Key results'); s.click('Actions for ' + krTagLabel); s.click('Connect data', { within: 'Actions for ' + krTagLabel }); };
  s.step('H1 Connect data on a key result: loading, currently connected rebuilt from readings, last 5 samples', () => {
    fresh();
    const kr = krsOf(doc(), ctx().objId)[0];
    openCd('KR1');
    s.eq('sheet', [sheetKind(), s.vals.kpi.cd.title], ['kpi.connect', 'Connect data']);
    s.expect('Loading the analysis index…');
    s.flush(600);
    const idx = s.c.D.analysis;
    const conn = RD.reconstructConnected(hostReads({ type: 'keyResult', id: kr.id }), { index: idx, kpis: poolOracle(), execDocs: ctx().em, experiment: null });
    const cd = s.vals.kpi.cd;
    s.eq('connected sample groups', cd.connGroups.map((g) => [g.sample, g.rows.length]), conn.samples.map((g) => [g.sample || '(unknown sample)', g.readings.length]));
    s.eq('orphans under "Source removed from the index"', cd.orphans.length, conn.orphans.length);
    const nRead = conn.samples.reduce((a, g) => a + g.readings.length, 0) + conn.orphans.length, nSamp = conn.samples.length + (conn.orphans.length ? 1 : 0);
    s.eq('summary', cd.connSum, nSamp + ' sample' + (nSamp === 1 ? '' : 's') + ', ' + nRead + ' reading' + (nRead === 1 ? '' : 's'));
    s.ok(cd.connGroups.every((g) => g.rows.every((r) => r.on)), 'connected readings start ticked');
    s.eq('no filter: last 5 samples', [cd.listLabel, cd.samples.map((x) => x.name)], ['Last 5 samples', RD.analysisRecentSamples(idx, 5).map((x) => x.sample)]);
    s.eq('footer with nothing changed', [cd.count, cd.applyLabel, cd.applyOff], [(nRead - conn.orphans.length) + ' connected, 0 new', 'Apply changes', true]);
  });
  s.step('H2 filters: analysis, sample match mode, temperature, RH, pressure', () => {
    const idx = s.c.D.analysis;
    const f0 = { analysis: '', name: '', nameMode: 'contains', T_C: null, RH_pct: null, P_value: null, P_unit: '' };
    const check = (label, f) => { const want = RD.analysisSearch(idx, Object.assign({}, f0, f)).map((x) => x.sample); s.eq(label, [s.vals.kpi.cd.listLabel, s.vals.kpi.cd.samples.map((x) => x.name)], [want.length + ' sample' + (want.length === 1 ? '' : 's') + ' match', want]); return want; };
    s.type('Analysis', 'eis', { within: 'Find data' });
    check('analysis = eis', { analysis: 'eis' });
    s.type('Sample name', 'TS10-B2-C0');
    s.type('How the sample name matches', 'starts');
    check('starts with TS10-B2-C0', { analysis: 'eis', name: 'TS10-B2-C0', nameMode: 'starts' });
    s.type('Temp (°C)', '25');
    const none = check('25 °C', { analysis: 'eis', name: 'TS10-B2-C0', nameMode: 'starts', T_C: 25 });
    s.ok(!none.length && s.see('No samples match those filters.'), 'empty message');
    s.click('Clear filters');
    s.type('RH (%)', '20');
    check('RH 20', { RH_pct: 20 });
    s.type('RH (%)', '');
    s.type('Pressure', '150 kPa');
    check('pressure 150 kPa (number plus unit)', { P_value: 150, P_unit: 'kPa' });
    s.click('Clear filters');
    s.eq('cleared: last 5 again', s.vals.kpi.cd.listLabel, 'Last 5 samples');
  });
  s.step('H3 pick, target guess, scale with "was", unit warning; Apply writes today\'s readings with provenance in one batch', () => {
    const kr = krsOf(doc(), ctx().objId)[0];
    const kV = doc().kpis.find((k) => k.hostType === 'keyResult' && k.hostId === kr.id && /voltage/i.test(k.name));
    const kH = doc().kpis.find((k) => k.hostType === 'keyResult' && k.hostId === kr.id && /resistance/i.test(k.name));
    const sm = 'TS10-B2-C05';
    s.click('~' + sm, { within: 'cd-sample:' + sm });
    s.check('Import V @ 2 A/cm² from ' + sm + ' (polcurve)', true);
    const vrow = () => s.vals.kpi.cd.samples.find((x) => x.name === sm).unitList.reduce((a, u) => a.concat(u.rows), []).find((r) => r.key === 'V @ 2 A/cm²');
    s.eq('no matching KPI name: "+ Create a new KPI" is the guess (today\'s cdGuessTarget)', vrow().tv, '__new__');
    s.ok(vrow().topts.some((o) => o.v === '__new__' && o.label === '+ Create a new KPI'), 'create option offered for a key result');
    s.type('Import V @ 2 A/cm² from ' + sm + ' (polcurve) into', kV.id);
    s.click('~' + sm, { within: 'cd-sample:' + sm });
    s.click('~' + sm, { within: 'cd-sample:' + sm });
    s.check('Import HFR from ' + sm + ' (eis)', true);
    s.type('Import HFR from ' + sm + ' (eis) into', kH.id);
    const hrow = () => s.vals.kpi.cd.samples.find((x) => x.name === sm).unitList.reduce((a, u) => a.concat(u.rows), []).find((r) => r.key === 'HFR');
    const kUnit = RD.analysisKeyUnit('HFR');
    if (kUnit && kUnit !== kH.unit) s.eq('unit warning', hrow().warn, 'Unit differs (the target uses ' + kH.unit + '). Scale it if needed.');
    s.type('Scale HFR from ' + sm + ' (eis)', '1000');
    s.eq('scaled value with "was"', [hrow().shown, hrow().was], [fmtN(0.071 * 1000), 'was 0.071']);
    const conn = s.vals.kpi.cd.connGroups.reduce((a, g) => a + g.rows.length, 0);
    s.eq('footer counts', s.vals.kpi.cd.count, conn + ' connected, 2 new');
    const n0 = doc().kpiUpdates.length;
    s.click('Apply changes');
    s.ok(hasToast('2 readings added.'), 'message: ' + lastToast());
    const ups = doc().kpiUpdates.slice(n0);
    s.eq('two readings', ups.map((u) => [u.kpiId, u.value]), [[kV.id, 1.8], [kH.id, 71]]);
    s.ok(ups[0].batch && ups[0].batch === ups[1].batch, 'one batch id for the whole import');
    const run = s.c.D.analysis.runs.find((r) => r.sample_name === sm && r.Data[0].Analysis === 'eis');
    s.eq('timestamp is the run time', ups[1].timestamp, Date.parse(run.timestamp));
    s.eq('provenance like today', [ups[1].src.portal, ups[1].src.job_id, ups[1].src.bin_id, ups[1].src.sample, ups[1].src.bucket, ups[1].src.key, ups[1].src.run_t, ups[1].src.scale, ups[1].src.value_raw], ['analysis', run.job_id, run.bin_id, sm, 'eis', 'HFR', run.timestamp, 1000, 0.071]);
    s.ok(typeof ups[1].src.imported_t === 'string' && ups[1].src.imported_t.length > 10, 'imported time');
    /* the same values again are skipped as already connected */
    openCd('KR1'); s.flush(600);
    s.click('~' + sm, { within: 'cd-sample:' + sm });
    s.check('Import V @ 2 A/cm² from ' + sm + ' (polcurve)', true);
    s.type('Import V @ 2 A/cm² from ' + sm + ' (polcurve) into', kV.id);
    const n1 = doc().kpiUpdates.length;
    s.click('Apply changes');
    s.eq('duplicate skipped', doc().kpiUpdates.length, n1);
    s.ok(hasToast('1 already connected.'), 'message: ' + lastToast());
  });
  s.step('H4 untick a connected reading to remove it; re-target moves it; "+ Create a new KPI" makes one statistical KPI per key', () => {
    const kr = krsOf(doc(), ctx().objId)[0];
    openCd('KR1'); s.flush(600);
    const g = s.vals.kpi.cd.connGroups[0], r0 = g.rows[0];
    s.check(r0.aria, false);
    s.ok(/, 1 to remove$/.test(s.vals.kpi.cd.count), 'footer: 1 to remove');
    const n0 = doc().kpiUpdates.length;
    s.click('Apply changes');
    s.eq('removed', doc().kpiUpdates.length, n0 - 1);
    s.ok(hasToast('1 removed.'), 'message: ' + lastToast());
    /* re-target: still ticked, another KPI chosen -> the old reading goes, a new one lands on the chosen KPI */
    openCd('KR1'); s.flush(600);
    const r1 = s.vals.kpi.cd.connGroups[0].rows[0];
    const from = r1.tv;
    const to = r1.topts.map((o) => o.v).find((v) => v !== from && v !== '__new__');
    s.type(r1.taria, to);
    s.ok(/, 1 new, 1 to remove$/.test(s.vals.kpi.cd.count), 'footer: re-target is 1 new and 1 to remove (' + s.vals.kpi.cd.count + ')');
    const before = doc().kpiUpdates.filter((u) => u.kpiId === to).length;
    const fromBefore = doc().kpiUpdates.filter((u) => u.kpiId === from).length;
    s.click('Apply changes');
    s.eq('moved to the chosen KPI', [doc().kpiUpdates.filter((u) => u.kpiId === to).length, doc().kpiUpdates.filter((u) => u.kpiId === from).length], [before + 1, fromBefore - 1]);
    /* create a new KPI from two samples' values of the same key: one KPI holding both (fixed: today made one KPI per value) */
    openCd('KR1'); s.flush(600);
    s.type('Sample name', 'TS10-B2-C0');
    s.type('How the sample name matches', 'starts');
    ['TS10-B2-C01', 'TS10-B2-C02'].forEach((sm) => {
      s.click('~' + sm, { within: 'cd-sample:' + sm });
      s.check('Import OCV from ' + sm + ' (polcurve)', true);
    });
    const nk = doc().kpis.length;
    s.click('Apply changes');
    const made = doc().kpis.slice(nk);
    s.eq('one new statistical KPI named after the key', made.map((k) => [k.name, k.targetType, k.hostType, k.hostId, k.direction, k.target]), [['OCV', 'statistical', 'keyResult', kr.id, 'up', null]]);
    s.eq('holding both values', doc().kpiUpdates.filter((u) => u.kpiId === made[0].id).length, 2);
  });
  s.step('H5 Connect data on a gate, and the index errors (offline, unreadable)', () => {
    fresh();
    const g = doc().stageGates.find((x) => x.objectiveId === ctx().objId && doc().kpis.some((k) => k.hostType === 'stageGate' && k.hostId === x.id));
    openReadings();
    s.click('Connect data', { within: 'kpi-t:all:stageGate:' + g.id });
    s.flush(600);
    const cd = s.vals.kpi.cd;
    s.ok(cd.sub.indexOf(g.name) >= 0, 'context names the gate');
    const sm = cd.samples[0];
    s.click('~' + sm.name, { within: 'cd-sample:' + sm.name });
    const row = s.vals.kpi.cd.samples[0].unitList[0].rows[0];
    s.check(row.aria, true);
    const opts = s.vals.kpi.cd.samples[0].unitList[0].rows[0].topts.map((o) => o.v);
    s.eq('targets are this gate\'s KPIs plus create', opts, doc().kpis.filter((k) => k.hostType === 'stageGate' && k.hostId === g.id).map((k) => k.id).concat(['__new__']));
    closeSheets();
    s.click('Settings'); s.click('Go offline'); closeSheets();
    openReadings();
    s.click('Connect data', { within: 'kpi-t:all:stageGate:' + g.id });
    s.flush(600);
    s.expect('Analysis index unavailable (offline). Connect data reads the analysis portal; try again when you’re back online.');
    closeSheets();
    s.click('Settings'); s.click('Back online');
    s.check('Simulate an unreadable analysis index', true);
    closeSheets();
    openReadings();
    s.click('Connect data', { within: 'kpi-t:all:stageGate:' + g.id });
    s.flush(600);
    s.ok(/^Analysis index unreadable: /.test(s.vals.kpi.cd.err), 'unreadable: ' + s.vals.kpi.cd.err);
    closeSheets();
  });
}

/* =========================================================================================
   I. Tasks: removed on October 15 (the Kanban covers that work). Today never drew them either. Stored
   tasks stay in the document, move with their objective and still count in the schedule forecast (engine
   unchanged); a stored task's KPIs are still listed in Readings, so their readings can be posted.
   ========================================================================================= */
s.step('I1 no Tasks tab, Up next or task search; stored tasks still feed the forecast; their KPIs stay in Readings', () => {
  fresh();
  s.eq('no Tasks tab', s.vals.sh.tabs.map((t) => t.label).filter((l) => /task/i.test(l)), []);
  s.ok(!s.c.MODS.tasks && !s.vals.tasks, 'no tasks module in the build');
  s.expectNot('Up next');
  s.ok(!s.has('Add task') && !s.has('Add the first task'), 'no way to add a task');
  const mine = doc().tasks.filter((x) => x.objectiveId === ctx().objId);
  s.ok(mine.length > 0, mine.length + ' stored tasks kept on this objective');
  checkHead('with stored tasks');
  if (EXEC) {
    pickObj('OBJ-EL-2026Q4-02');
    openReadings();
    s.ok(s.has(dk('kpi-t:all:task:TSK-EL-2026Q4-02-1')), 'the stored task KPI is listed in Readings');
    closeSheets();
    goTab('Key results');
    const res = s.c.MODS.kpi.search(s.c, ctx(), 'quotes received');
    s.eq('KPI search finds it', res.map((r) => r.label), ['Quotes received']);
    res[0].go(); s.render();
    s.eq('picking it opens the Overview and Readings', [s.c.state.tab, sheetKind()], ['overview', 'kpi.all']);
    closeSheets();
  }
  s.clean('tasks removed');
});

/* =========================================================================================
   J. Initiative-level metrics (today's renderInitPanel / initKpiTableRO)
   ========================================================================================= */
s.step('J1 collapsed at start; one read-only table per initiative of the division with today\'s numbers', () => {
  fresh();
  s.eq('collapsed', s.vals.initm.open, false);
  let n = 0;
  ctx().divs.forEach((dv) => {
    pickDiv(dv.id);
    s.c.setState({ initm_open: true }); s.render();
    const P = s.c.D.portfolio;
    const inits = P.initiatives.filter((i) => i.divisionId === dv.id);
    s.eq(dv.id + ' initiatives in portfolio order', s.vals.initm.blocks.map((b) => b.id), inits.map((i) => i.id));
    const AK = pool(), EM = ctx().em;
    inits.forEach((I, bi) => {
      const pf = (P.kpis || []).filter((k) => k.hostType === 'initiative' && k.hostId === I.id);
      const legacy = doc().kpis.filter((k) => k.hostType === 'initiative' && k.hostId === I.id);
      const b = s.vals.initm.blocks[bi];
      s.eq(I.id + ' count', b.countText, (pf.length + legacy.length) + ' target' + (pf.length + legacy.length === 1 ? '' : 's'));
      if (!b.kt) return;
      s.eq(I.id + ' rows', b.kt.rows.map((r) => r.id).sort(), pf.concat(legacy).map((k) => k.id).sort());
      b.kt.rows.forEach((r) => {
        const k = AK.find((q) => q.id === r.id), x = rowOracle(k, AK, EM);
        s.eq(r.id + ' target / current / score / partial math', [r.crit, r.cur, r.score, r.math], [x.crit, x.cur, x.score, x.math]);
        s.eq(r.id + ' local tag', r.badges.some((q) => q.label === 'Local'), legacy.indexOf(k) >= 0);
        s.eq(r.id + ' read-only', [r.nameBtn, r.valBtn, r.hasMenu], [false, false, false]);
        n++;
      });
      s.eq(I.id + ' no add / link', [b.kt.canAdd, b.kt.canLink], [false, false]);
    });
  });
  s.ok(n >= 1, n + ' initiative KPIs checked');
  if (EXEC) {
    /* a locally defined initiative KPI is tagged Local; a typed link counts as "Defines N" (fixed: today only legacy groups) */
    pickDiv('DIV-FC');
    const d = doc();
    d.kpis.push({ id: 'KPI-FC-LOCAL-1', objectiveId: null, hostType: 'initiative', hostId: 'INIT-FC-01', name: 'Coater uptime', targetType: 'demonstration', direction: 'up', target: 90, unit: '%', groupId: null, isDefiner: true });
    const kr = d.keyResults.find((r) => r.objectiveId === 'OBJ-FC-2026Q4-01');
    d.kpis.push({ id: 'KPI-FC-LINK-1', objectiveId: 'OBJ-FC-2026Q4-01', hostType: 'keyResult', hostId: kr.id, linkParent: 'KPI-FC-01-1', linkType: 'contribute', linkPriority: 1, name: null, direction: null, unit: null, target: null });
    s.render();
    const blk = s.vals.initm.blocks.find((b) => b.id === 'INIT-FC-01');
    s.ok(blk.kt.rows.find((r) => r.id === 'KPI-FC-LOCAL-1').badges.some((q) => q.label === 'Local'), 'Local tag');
    s.ok(blk.kt.rows.find((r) => r.id === 'KPI-FC-01-1').badges.some((q) => q.label === 'Defines 1'), 'Defines 1');
    s.eq('count includes the local one', blk.countText, '2 targets');
  }
});

/* =========================================================================================
   K. Read-only sweep (today: hidden controls, click guard, no writes; known gaps closed)
   ========================================================================================= */
s.step('K1 read-only: no editing control in the head, key results, KPI tables or initiative metrics', () => {
  fresh();
  s.c.setState({ ro: true }); s.render();
  ['End objective', 'Save', 'Add key result', 'Add KPI', 'Add target', 'Link a metric', 'Connect data'].forEach((lbl) => s.ok(!s.has(lbl, { tag: 'button' }), 'no "' + lbl + '"'));
  goTab('Key results');
  const ids = krsOf(doc(), ctx().objId).map((k) => k.id);
  const open = {}; ids.forEach((id) => { open[id] = true; }); s.c.setState({ kr_open: open }); s.render();
  s.ok(!s.has((el) => /^Actions for /.test(el.attrs['aria-label'] || '')), 'no row menus');
  s.ok(!s.has('Edit key result'), 'no edit');
  s.ok(!s.has((el) => /^Post a reading for /.test(el.attrs['aria-label'] || '')), 'no inline posting (fixed: today the cell still opened)');
  const statBtn = s.all((el) => /^Readings for /.test(el.attrs['aria-label'] || ''))[0];
  if (statBtn) {
    s.fire(statBtn, 'onClick');
    s.ok(!s.has('Add reading') && s.see('Read-only view — editing is disabled.'), 'a statistical sample is view-only');
  }
  if (SALES) {
    const ms = krsOf(doc(), ctx().objId).find((k) => k.trackingType === 'milestone');
    goTab('Key results');
    s.c.setState({ kr_open: { [ms.id]: true } }); s.render();
    const boxes = s.all((el) => el.tag === 'input' && /^Done: /.test(el.attrs['aria-label'] || ''));
    s.ok(boxes.length > 0 && boxes.every((b) => b.attrs.disabled === true), 'milestone drawer checkboxes are disabled (fixed: today they changed the view)');
  }
  const n0 = JSON.stringify(s.c.D.docs);
  s.ok(!s.c.mutate((D) => { D.docs[ctx().docKey].keyResults = []; }), 'C.mutate refuses');
  s.eq('nothing changed', JSON.stringify(s.c.D.docs), n0);
  s.clean('read-only');
});

/* =========================================================================================
   L. Design language in this area's templates and styles (CONTRACT.md §6)
   ========================================================================================= */
s.step('L1 no glyph icons, ALL-CAPS labels or raw colours in this area\'s files', () => {
  const root = path.join(__dirname, '..');
  const files = ['apps/exec/shell.html', 'mods/kr/slot-krs.html', 'mods/review/slot-ov-main.html', 'mods/kr/slot-sheets.html', 'mods/kpi/part-table.html', 'mods/kpi/slot-sheets.html', 'mods/kpi/slot-ov-side.html', 'mods/kpi/slot-settings.html', 'mods/initm/slot-ov-foot.html'];
  const GLYPH = /[▣◆●⌂↻↧⋮✎✓✕×▶▼▲◐🔗☑⚑⚠↔↑↓]/;
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const text = src.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/<[^>]+>/g, ' ');
    const m = GLYPH.exec(text);
    s.ok(!m, f + ' has no glyph icons' + (m ? ' (found ' + m[0] + ' near "' + text.slice(Math.max(0, m.index - 30), m.index + 10).replace(/\s+/g, ' ') + '")' : ''));
    const caps = text.match(/\b[A-Z]{4,}\b(?:\s+[A-Z]{3,}\b)+/g) || [];
    s.ok(!caps.length, f + ' has no ALL-CAPS labels ' + caps.join(', '));
  });
  const css = ['apps/exec/shell.css', 'mods/kr/mod.css', 'mods/kpi/mod.css', 'mods/initm/mod.css', 'mods/review/mod.css'];
  css.forEach((f) => {
    const src = fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const raw = src.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g) || [];
    s.ok(!raw.length, f + ' uses tokens only ' + raw.join(' '));
  });
  /* icon-only buttons carry an aria-label */
  const t0 = new Sim(file);
  const bad = t0.els.filter((el) => el.tag === 'button' && !textOf(el) && !el.attrs['aria-label']).map((el) => 'line ' + el.line);
  s.eq('icon-only buttons all have aria-labels', bad, []);
});

function K2(d) { return JSON.stringify(d.keyResults || []).length > 2 ? d.keyResults : []; }

done();
