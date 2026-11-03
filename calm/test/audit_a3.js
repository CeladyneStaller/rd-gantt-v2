/* ============================================================================
   Audit A3: independent parity checks for the Planning board (Plan-A.dc.html).
   One s.step per checklist item of inv/plan.md "(a) Checklist" (step names start
   with the checklist section). Expected values are computed here from the engine
   and from re-implementations of today's template rules (planning_app.template.html,
   line numbers in the comments), not from the board's own helpers.

     node test/audit_a3.js out/a3/Plan-A.dc.html
   ========================================================================== */
const path = require('path');
const { Sim, done, textOf, load } = require('./dc');
const RD = require(require('./engine_path'));
const FILE = process.argv[2] || 'out/a3/Plan-A.dc.html';

let s = new Sim(FILE);
/* a recording localStorage (the driver's stub drops writes) */
const LS = {};
global.window.localStorage = { getItem: (k) => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = String(v); }, removeItem: (k) => { delete LS[k]; } };
const clearLS = () => Object.keys(LS).forEach((k) => delete LS[k]);
const fresh = () => { s = new Sim(FILE); return s; };
fresh();

const P = () => s.c.D.portfolio;
const D = () => s.c.D;
const TODAY = 2477;                       // 2026-10-13
const QNOW = '2026Q4';
const toasts = () => (s.c.state.toasts || []).map((t) => t.text);
const hasToast = (txt) => toasts().some((t) => t.indexOf(txt) >= 0);
const byId = (key, id) => (P()[key] || []).find((x) => x.id === id);
const sheets = () => s.c.state.sheets || [];
const top = () => s.c.sheet();
const go = (tab) => s.click(tab, { tag: 'button', within: 'Views' });
const menu = (name, item) => { s.click('More actions for ' + name); s.click(item, { within: 'More actions for ' + name }); };
const openSettings = () => s.click('Settings');
const closeSheets = () => { s.c.closeAllSheets(); s.render(); };
const pasteLink = (url) => {
  openSettings();
  s.type('Open a pasted link', url);
  s.click('Open', { tag: 'button', within: 'Editor' });
};

/* ---- today's helpers, re-implemented from the template ---- */
const execMap = () => { const m = {}; Object.keys(D().docs).forEach((k) => { m[k.replace(/^(EXEC|BIZ)-/, '')] = D().docs[k]; }); return m; };
const em = () => RD.withPortfolio(P(), execMap());
const poolOf = (pm) => { const out = []; Object.keys(pm).forEach((k) => ((pm[k] && pm[k].kpis) || []).forEach((x) => out.push(x))); return out; };
const kindOf = (divId) => RD.divisionKind((P().divisions || []).find((d) => d.id === divId));
const docOf = (divId) => D().docs[(kindOf(divId) === 'biz' ? 'BIZ-' : 'EXEC-') + divId] || null;
/* L1540 nodeBand */
const nodeBand = (entity, id) => {
  const e = em();
  if (entity === 'milestone') { const ms = byId('milestones', id); if (ms && RD.milestoneAchieved(ms, e)) return 'on-track'; return RD.band(RD.milestoneScore(id, e)); }
  if (entity === 'division') return RD.band(RD.rollupDivision(id, P(), e));
  if (entity === 'initiative') return RD.band(RD.rollupInitiative(id, P(), e));
  return RD.band(RD.rollupObjective(id, P(), e));
};
/* L1648 effProductOf / objMatches (with a filter object f: unit, division, product, quarter, status) */
const effProductOf = (o) => { const c = RD.effClass(o, P()); if (c.kind === 'product') return c.productId; if (c.kind === 'model') { const m = byId('models', c.modelId); return m ? m.productId : null; } return null; };
const objMatches = (o, f) => {
  if (f.unit && (RD.unitIdOfDivision(o.divisionId, P()) || '') !== f.unit) return false;
  if (f.division && o.divisionId !== f.division) return false;
  if (f.product && effProductOf(o) !== f.product) return false;
  if (f.quarter && (o.quarter || '') !== f.quarter) return false;
  if (f.status && nodeBand('objective', o.id) !== f.status) return false;
  return true;
};
/* L1722 initOwnMatches */
const initOwnMatches = (i, f) => {
  if (f.quarter || f.status) return false;
  if (f.unit && (RD.unitIdOfDivision(i.divisionId, P()) || '') !== f.unit) return false;
  if (f.division && i.divisionId !== f.division) return false;
  if (f.product) { const c = RD.effClass(i, P()); let pid = null; if (c.kind === 'product') pid = c.productId; else if (c.kind === 'model') { const m = byId('models', c.modelId); pid = m ? m.productId : null; } if (pid !== f.product) return false; }
  return true;
};
/* L992-1010 statusCounts / worstSlip (today, with the NaN guard Calm adds) */
const statusCounts = (divId) => { const c = { 'on-track': 0, 'at-risk': 0, 'off-track': 0, 'no-band': 0 }; P().objectives.filter((o) => o.divisionId === divId).forEach((o) => { c[RD.band(RD.objectiveScore(o.id, em()))]++; }); return c; };
/* the cascade with paused milestones out (Calm's documented fix of bug 8) */
const liveP = () => {
  const paused = {}; (P().milestones || []).forEach((m) => { if (RD.milestonePaused(P().milestoneState, m.id)) paused[m.id] = 1; });
  return Object.assign({}, P(), { milestones: P().milestones.filter((m) => !paused[m.id]), objectives: P().objectives.map((o) => Object.assign({}, o, { milestoneIds: (o.milestoneIds || []).filter((x) => !paused[x]) })) });
};
const casc = () => RD.cascade(liveP(), em(), TODAY);
const fmtDayY = (d) => { const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; const x = new Date(Date.UTC(2020, 0, 1) + d * 86400000); return M[x.getUTCMonth()] + ' ' + x.getUTCDate() + ', ' + x.getUTCFullYear(); };
const iso = (d) => new Date(Date.UTC(2020, 0, 1) + d * 86400000).toISOString().slice(0, 10);
const dayOf = (isoS) => Math.round((Date.parse(isoS + 'T00:00:00Z') - Date.UTC(2020, 0, 1)) / 86400000);

/* the board's own namespaces (PED, PGT, PMS, PLAN), from a second evaluation of its script: the
   functions are pure over the component they are handed, so they act on s.c like the board's do */
const NS = (function () {
  const parsed = load(FILE).parsed;
  class Stub { constructor(p) { this.props = p || {}; this.state = {}; } setState() {} }
  return new Function('DCLogic', 'StreamableLogic', 'React', parsed.script + '\n;return { PED: PED, PGT: PGT, PMS: PMS, PLAN: PLAN, pedPlainReason: pedPlainReason };')(Stub, Stub, {});
})();

/* =============================================================== SHELL */
s.step('Shell: home link to CeladyneHQ', () => {
  const a = s.all('All apps')[0];
  s.ok(!!a && a.tag === 'a', 'All apps is a link');
  s.eq('hub address', a.attrs.href, 'https://celadynestaller.github.io/CeladyneHQ/');
  s.eq('tooltip', a.attrs.title, 'Back to all apps');
});
s.step('Shell: tabs (Structure is portfolio)', () => {
  ['Overview', 'Structure', 'Gantt', 'Milestones'].forEach((t) => s.ok(s.has(t, { tag: 'button', within: 'Views' }), 'view ' + t));
  s.ok(s.has('Settings'), 'Settings opens from the gear');
  s.eq('default tab', s.c.state.tab, 'overview');
  pasteLink('https://x/planning_app.html?tab=portfolio');
  s.eq('?tab=portfolio opens Structure', s.c.state.tab, 'structure');
  pasteLink('https://x/planning_app.html?tab=settings');
  s.ok(!!top() && top().kind === 'shell.settings', '?tab=settings opens Settings');
  pasteLink('https://x/planning_app.html?tab=nonsense');
  s.eq('unknown tab stays on Overview', s.c.state.tab, 'overview');
  /* switching tabs closes any open editor and the lineage (L3451-3458) */
  closeSheets();
  go('Structure');
  menu('Fuel Cell', 'Edit');
  s.ok(!!top() && top().kind === 'ped.edit', 'editor open');
  go('Gantt');
  s.eq('tab switch closes the editor', sheets().length, 0);
});
fresh();
s.step('Shell: Gantt widens the page', () => {
  s.ok(!/wide/.test(s.vals.sh.pageCls), 'Overview capped');
  go('Gantt');
  s.ok(/\bwide\b/.test(s.vals.sh.pageCls), 'Gantt wide');
  go('Milestones');
  s.ok(!/wide/.test(s.vals.sh.pageCls), 'Milestones capped');
});
s.step('Shell: read-only badge', () => {
  s.ok(!s.has('Read-only', { tag: 'span' }), 'no badge when editing is on');
  openSettings();
  s.check('Preview the read-only view', true);
  closeSheets();
  s.ok(s.has('Read-only', { tag: 'span' }), 'badge in read-only');
  openSettings();
  s.check('Preview the read-only view', false);
  closeSheets();
});
s.step('Shell: theme saved in rd_theme', () => {
  clearLS();
  openSettings();
  s.click('Dark');
  s.eq('dark', s.vals.theme, 'dark');
  s.eq('rd_theme written', LS.rd_theme, 'dark');
  closeSheets();
  fresh();
  s.eq('a reload reads rd_theme', s.c.state.theme, 'dark');
  openSettings();
  s.click('Match system');
  s.eq('Match system follows the OS (light here)', s.vals.theme, 'light');
  s.click('Light');
  closeSheets();
  clearLS();
});
fresh();
s.step('Shell: header Save button', () => {
  s.click('Save');
  s.ok(hasToast('Saved.'), 'Save says Saved.');
  openSettings();
  s.check('Preview the read-only view', true);
  closeSheets();
  s.ok(!s.has('Save', { tag: 'button' }), 'Save hidden in read-only');
});
fresh();
s.step('Shell: messages (toasts, ok auto-hides)', () => {
  s.click('Save');
  s.ok(hasToast('Saved.'), 'ok message shown');
  s.advance(5000);
  s.ok(!hasToast('Saved.'), 'ok message hides by itself');
});
fresh();
s.step('Shell: modals become sheets; close, scrim, Escape', () => {
  go('Structure');
  /* editor: Escape closes it */
  menu('Fuel Cell', 'Edit');
  s.key('Editor', 'Escape');
  s.eq('Escape closes the editor', sheets().length, 0);
  /* editor with an edit: Escape asks first */
  menu('Fuel Cell', 'Edit');
  s.type('Name', 'Fuel Cell X');
  s.key('Editor', 'Escape');
  s.ok(!!s.c.state.dlg && s.c.state.dlg.title === 'Discard your changes?', 'asks before discarding');
  s.click('Discard changes');
  s.eq('then closes', sheets().length, 0);
  s.eq('nothing saved', byId('divisions', 'DIV-FC').name, 'Fuel Cell');
  /* target editor stacked on the initiative editor: Escape closes only the top (fix of bug 2) */
  menu('Tera component lock', 'Edit');
  s.click('Add target');
  s.eq('two sheets', sheets().length, 2);
  s.key('Editor', 'Escape');
  s.eq('Escape closed the target editor only', sheets().map((x) => x.kind), ['ped.edit']);
  /* the dimmed page closes the stack */
  s.click('Close panel');
  s.eq('scrim closes', sheets().length, 0);
  /* lineage: Escape */
  s.click('Fuel Cell', { within: 'Divisions' });
  s.eq('lineage open', top().kind, 'ped.lineage');
  s.key('Editor', 'Escape');
  s.eq('Escape closes the lineage', sheets().length, 0);
  /* delete sheet (nested): Escape */
  menu('Tera component lock', 'Delete');
  s.eq('delete sheet', top().kind, 'ped.delete');
  s.key('Editor', 'Escape');
  s.eq('Escape closes the delete sheet', sheets().length, 0);
  /* overview detail: Escape */
  go('Overview');
  s.click('Open details for Fuel Cell');
  s.eq('detail open', top().kind, 'pov.detail');
  s.key('Editor', 'Escape');
  s.eq('Escape closes the detail', sheets().length, 0);
  /* report: Escape */
  go('Milestones');
  s.click('Open report (locked)');
  s.eq('report open', top().kind, 'pms.report');
  s.key('Editor', 'Escape');
  s.eq('Escape closes the report', sheets().length, 0);
  /* ✕ closes every sheet in the stack */
  go('Structure');
  menu('Tera component lock', 'Edit');
  s.click('Add target');
  s.click('Close', { tag: 'button', within: 'Editor' });
  s.eq('Close (✕) closes the whole stack', sheets().length, 0);
  s.clean('sheets');
});
s.step('Shell: startup (loaded; load replays the messages)', () => {
  fresh();
  s.ok(s.c.state.bk && !!s.c.state.bk.token, 'opens with a token, loaded');
  openSettings();
  s.expect('Last loaded');
  s.click('Load from the broker');
  s.ok(hasToast('Loaded portfolio + 4 exec + 2 spec docs.'), 'load message with doc counts');
});

/* ======================================================== URL AND MODES */
fresh();
s.step('URL: ?token saved and stripped', () => {
  pasteLink('https://x/planning_app.html?tab=gantt&TOKEN=abc123&division=DIV-FC');
  s.eq('token saved', s.c.state.bk.token, 'abc123');
  s.ok(hasToast('Token saved and removed from the address: https://x/planning_app.html?tab=gantt&division=DIV-FC'), 'stripped address shown');
  s.ok(hasToast('Loaded portfolio + 4 exec + 2 spec docs.'), 'then loads');
});
fresh();
s.step('URL: ?readonly (presence; =0 fixed to mean off)', () => {
  pasteLink('https://x/planning_app.html?readonly');
  s.eq('?readonly turns read-only on', s.c.state.ro, true);
  pasteLink('https://x/planning_app.html?readonly=1');
  s.eq('?readonly=1 on', s.c.state.ro, true);
  pasteLink('https://x/planning_app.html?readonly=0');
  s.eq('?readonly=0 off (fixed bug 22)', s.c.state.ro, false);
  pasteLink('https://x/planning_app.html?readonly=false');
  s.eq('?readonly=false off', s.c.state.ro, false);
});
fresh();
s.step('URL: ?present implies read-only and hides chrome', () => {
  pasteLink('https://x/planning_app.html?present=1&tab=gantt');
  s.eq('present on', s.c.state.present, true);
  s.ok(s.vals.ro, 'present implies read-only');
  s.ok(!s.has('Views', {}) && !s.has('Breadcrumb'), 'sidebar and top bar hidden');
  s.ok(!s.vals.sh.fb.show, 'filter bar hidden');
  s.ok(!s.vals.pgt.toolbar, 'Gantt toolbar (levels and timeframe grid) hidden: fixed bug 4');
  s.ok(s.has('Stage-gate legend') || s.has('Legend'), 'legend stays');
  s.click('Exit present mode');
  s.eq('present off', s.c.state.present, false);
  s.eq('read-only that came only from present mode goes too', s.c.state.ro, false);
  fresh();
  pasteLink('https://x/planning_app.html?present=0');
  s.eq('?present=0 is off', s.c.state.present, false);
});
fresh();
s.step('URL: ?tab', () => {
  [['overview', 'overview'], ['portfolio', 'structure'], ['gantt', 'gantt'], ['milestones', 'milestones'], ['MILESTONES', 'milestones']].forEach((x) => {
    pasteLink('https://x/planning_app.html?tab=' + x[0]);
    s.eq('?tab=' + x[0], s.c.state.tab, x[1]);
  });
});
fresh();
s.step('URL: ?division ?product ?unit ?quarter (active)', () => {
  pasteLink('https://x/planning_app.html?division=DIV-EL&product=PRD-EL-1&unit=UNIT-TECHNI&quarter=active');
  s.eq('filters set', s.c.state.f, { unit: 'UNIT-TECHNI', div: 'DIV-EL', prod: 'PRD-EL-1', q: QNOW, status: '' });
  pasteLink('https://x/planning_app.html?quarter=2027Q1');
  s.eq('explicit quarter', s.c.state.f.q, '2027Q1');
  pasteLink('https://x/planning_app.html?division=fuelcell');
  s.expect('No divisions match the current filter (division fuelcell). The filter matches a division id such as DIV-FC, not its name.');
});
fresh();
s.step('URL: ?ganttActive ?ganttQuarter', () => {
  pasteLink('https://x/planning_app.html?tab=gantt&ganttActive=1&ganttQuarter=1');
  s.eq('active only on', s.c.state.pg_active, true);
  s.eq('timeframe on', s.c.state.pg_timeframe, true);
  s.eq('toggles read pressed', [s.vals.pgt.activeOn, s.vals.pgt.tfOn], ['true', 'true']);
  pasteLink('https://x/planning_app.html?tab=gantt&ganttActive=0');
  s.eq('=0 is off', s.c.state.pg_active, false);
});
fresh();
s.step('URL: parameter names case-insensitive, values exact', () => {
  pasteLink('https://x/planning_app.html?TAB=Gantt&Division=DIV-FC&GanttQuarter=1');
  s.eq('TAB value lower-cased like today', s.c.state.tab, 'gantt');
  s.eq('Division value kept exact', s.c.state.f.div, 'DIV-FC');
  s.eq('GanttQuarter', s.c.state.pg_timeframe, true);
  pasteLink('https://x/planning_app.html?division=div-fc');
  s.eq('value case kept (matches no id)', s.c.state.f.div, 'div-fc');
});
fresh();
s.step('URL: read-only hides and blocks', () => {
  pasteLink('https://x/planning_app.html?readonly');
  closeSheets();
  /* hidden */
  go('Structure');
  ['Add unit', 'Add division', 'Add product', 'Add initiative'].forEach((t) => s.ok(!s.has(t), 'no ' + t));
  s.click('More actions for Fuel Cell');
  s.ok(!s.has('Edit', { within: 'More actions for Fuel Cell' }) && !s.has('Delete', { within: 'More actions for Fuel Cell' }), 'row menu has no edit or delete');
  s.ok(s.has('Show lineage', { within: 'More actions for Fuel Cell' }), 'lineage still offered');
  s.c.closeMenus(); s.render();
  s.click('Fuel Cell', { within: 'Divisions' });
  s.ok(!s.has('Edit division'), 'lineage has no Edit this');
  closeSheets();
  go('Gantt');
  s.ok(!s.vals.pgt.rows.some((r) => r.hasActs), 'Gantt hover actions hidden');
  go('Milestones');
  s.ok(!s.vals.pms.rows.some((r) => r.hasMenu), 'Milestones row actions hidden');
  /* blocked in code */
  const n0 = P().units.length;
  s.c.mutate((DD) => { DD.portfolio.units.push({ id: 'UNIT-X', name: 'X' }); }, { msg: 'x' });
  s.render();
  s.eq('a write is refused', P().units.length, n0);
  s.ok(hasToast('Read-only view — editing is disabled.'), 'and says why');
  NS.PED.open(s.c, s.c.ctx, 'division', 'DIV-FC');
  s.render();
  s.eq('PED.open refuses', sheets().length, 0);
  NS.PED.del(s.c, s.c.ctx, 'division', 'DIV-FC');
  s.render();
  s.ok(!s.c.state.dlg && !sheets().length, 'PED.del refuses');
  /* still available */
  go('Structure');
  s.type('Division', 'DIV-EL', { within: 'Filters and grouping' });
  s.eq('filters work in read-only', s.c.state.f.div, 'DIV-EL');
  s.click('Custom');
  s.eq('grouping works', s.c.state.group.mode, 'custom');
  go('Overview');
  s.click('Open details for Electrolyzer');
  s.eq('overview details open', top().kind, 'pov.detail');
  s.ok(!s.has('Edit division'), 'detail has no Edit in read-only');
  closeSheets();
  go('Milestones');
  s.click('Open report (locked)');
  s.ok(s.vals.pms.sheet && s.vals.pms.sheet.readonly, 'report opens read-only (fixed bug 16)');
  closeSheets();
  openSettings();
  s.click('A teammate saves a change');
  s.ok(hasToast('Updated from another editor.'), 'polling still runs');
});
/* ================================================================ SYNC */
fresh();
s.step('Sync: fixed broker address, bearer token (simulated)', () => {
  openSettings();
  s.expect('The broker address is built in. Only the token is needed');
  s.expect('Token set. Live sync active.');
  closeSheets();
});
fresh();
s.step('Sync: roster feeds the owner picker (active people, disabled out, stored extras)', () => {
  s.c.mutate((DD) => { DD.portfolio.objectives.find((o) => o.id === 'OBJ-BD-2027Q1-01').owner = ['sam@celadyne.com', 'old.hand@celadyne.com', 'lena@celadyne.com']; }, { quiet: true });
  s.render();
  go('Structure');
  menu('Close three utility pilot agreements', 'Edit');
  const owners = s.vals.ped.edit.fields.find((f) => f.key === 'owner');
  const active = D().roster.users.filter((u) => !u.disabled).map((u) => u.email);
  s.eq('active roster people first, in roster order', owners.checks.slice(0, active.length).map((c) => c.sub), active);
  s.ok(!owners.checks.slice(0, active.length).some((c) => c.sub === 'lena@celadyne.com'), 'a disabled user is not offered as a person');
  const extra = owners.checks.slice(active.length).map((c) => c.label + ' / ' + c.sub);
  s.eq('stored owners the roster does not know (or disabled) are kept, marked', extra, ['old.hand@celadyne.com / not in the roster', 'lena@celadyne.com / not in the roster']);
  s.eq('the current owner is ticked', owners.checks.filter((c) => c.on).map((c) => c.sub), ['sam@celadyne.com']);
  closeSheets();
});
fresh();
s.step('Sync: documents (portfolio written; exec and spec docs only read)', () => {
  const docs0 = JSON.stringify(D().docs), spec0 = JSON.stringify(D().spec);
  go('Structure');
  menu('Tera component lock', 'Edit');
  s.click('Record a value for Stack voltage efficiency (HHV)');
  s.type('Record a value for Stack voltage efficiency (HHV)', '74.4');
  s.key('Record a value for Stack voltage efficiency (HHV)', 'Enter');
  s.ok((P().kpiUpdates || []).some((u) => u.kpiId === 'KPI-EL-01-1' && u.value === 74.4), 'reading written to the portfolio');
  closeSheets();
  menu('Lock Tera 25-30-R5 components', 'Edit');
  s.type('Statement', 'Lock Tera 25-30-R5 components for build 3');
  s.click('Save objective');
  s.eq('execution documents untouched', JSON.stringify(D().docs), docs0);
  s.eq('spec documents untouched', JSON.stringify(D().spec), spec0);
  openSettings();
  s.click('Load from the broker');
  s.ok(hasToast('Loaded portfolio + 4 exec + 2 spec docs.'), 'one exec or business doc per division that has one, spec docs for R&D divisions');
});
fresh();
s.step('Sync: load messages', () => {
  openSettings();
  s.click('Load from the broker');
  s.ok(hasToast('Loaded portfolio + 4 exec + 2 spec docs.'), 'success');
  s.check('The broker rejects the token (401)', true);
  s.click('Load from the broker');
  s.ok(hasToast('Load failed (401). Check the token in Settings.'), 'failure');
  s.check('The broker rejects the token (401)', false);
  s.click('Remove token');
  s.ok(hasToast('No broker token yet — add one in Settings to load live data. Showing local scratch.'), 'no token');
});
fresh();
s.step('Sync: 25 s polling brings a teammate change ("Updated from another editor.")', () => {
  go('Structure');
  menu('Technical', 'Edit');
  s.type('Name', 'Technical R&D');
  s.click('Save unit');
  const before = byId('milestones', 'MS-EL-01-02').plannedDate;
  openSettings();
  s.expect('Planning checks the broker every 25 seconds');
  s.click('A teammate saves a change');
  s.ok(hasToast('Updated from another editor.'), 'polling message');
  s.eq('their change arrived', byId('milestones', 'MS-EL-01-02').plannedDate, before + 7);
  s.eq('my saved change is still there (fixed bug 20)', byId('units', 'UNIT-TECHNI').name, 'Technical R&D');
  s.check("The broker can't be reached (offline)", true);
  s.ok(s.vals.sh.settings.noTeammate, 'nothing arrives while offline');
  s.check("The broker can't be reached (offline)", false);
});
fresh();
s.step('Sync: manual Save meets a 412 and reloads', () => {
  openSettings();
  s.click('Next save: conflict that merges');
  closeSheets();
  s.click('Save');
  s.ok(hasToast('Someone else saved first — reloading their version, then re-apply your change.'), '412 message');
  s.ok(hasToast('Loaded portfolio + 4 exec + 2 spec docs.'), 'then the reload');
  s.expect('Reloaded after a conflict');
});
fresh();
s.step('Sync: auto-save meets a 412, re-fetches and merges', () => {
  openSettings();
  s.click('Next save: conflict that merges');
  closeSheets();
  go('Structure');
  menu('Business', 'Edit');
  s.type('Name', 'Commercial');
  s.click('Save unit');
  s.ok(hasToast('Unit saved. (merged with a concurrent change)'), 'merge message');
  s.eq('my change kept', byId('units', 'UNIT-BUSINE').name, 'Commercial');
  s.eq('their change merged in', byId('milestones', 'MS-EL-01-02').plannedDate, 2522);
  openSettings();
  s.click("Next save: conflict that can't merge");
  closeSheets();
  menu('Commercial', 'Edit');
  s.type('Name', 'Sales');
  s.click('Save unit');
  s.ok(hasToast('Auto-save hit a conflict and couldn’t merge (412) — reloaded; re-apply and use Save.'), 'merge failure message');
  s.eq('my change lost to the reload', byId('units', 'UNIT-BUSINE').name, 'Commercial');
  openSettings();
  s.check("The broker can't be reached (offline)", true);
  closeSheets();
  menu('Commercial', 'Edit');
  s.type('Name', 'Commercial ops');
  s.click('Save unit');
  s.ok(hasToast('Auto-save failed (no connection). Your change is local — use Save to retry.'), 'other auto-save errors');
  s.eq('change kept locally', byId('units', 'UNIT-BUSINE').name, 'Commercial ops');
  s.click('Save');
  s.ok(hasToast('Save failed (no connection).'), 'Save offline');
});
fresh();
s.step('Sync: scratch mode without a token', () => {
  openSettings();
  s.click('Remove token');
  s.expect('No token set — running on local scratch data.');
  closeSheets();
  go('Structure');
  menu('Business', 'Edit');
  s.type('Name', 'Commercial');
  s.click('Save unit');
  s.ok(hasToast('Saved locally — add a broker token in Settings to sync.'), 'saved locally');
  s.eq('kept in memory', byId('units', 'UNIT-BUSINE').name, 'Commercial');
  s.click('Save');
  s.ok(hasToast('Add a broker token in Settings before saving.'), 'Save needs a token');
  s.expect('Local scratch, not synced');
});

s.step('Sync: browser storage keys (theme, gantt quarters, show-paused, name width)', () => {
  clearLS();
  fresh();
  go('Gantt');
  s.click('1 paused');
  s.eq('rd_gantt_showpaused written', LS.rd_gantt_showpaused, '1');
  s.click('Q1 2027');
  s.eq('rd_gantt_quarters written', JSON.parse(LS.rd_gantt_quarters), ['2026Q4', '2027Q1']);
  s.key('Drag to resize the name column', 'ArrowRight');
  s.eq('rd_gantt_labelw written', LS.rd_gantt_labelw, '260');
  fresh();
  s.eq('a reload brings them back', [s.c.state.pg_showPaused, s.c.state.pg_quarters, s.c.state.pg_labelw], [true, ['2026Q4', '2027Q1'], 260]);
  go('Gantt');
  s.c.setState({ pg_rz: { x0: 0, w0: 260 } });
  s.render();
  s.fire(s.find('Drag to resize the name column', { handler: 'onDoubleClick' }), 'onDoubleClick');
  s.ok(!('rd_gantt_labelw' in LS), 'double-click resets and forgets the width');
  s.eq('back to 240', s.c.state.pg_labelw, 240);
  s.click('Timeframe');
  s.click('Clear');
  s.eq('clear stores an empty selection', LS.rd_gantt_quarters, '[]');
  LS.rd_gantt_quarters = '["2026Q9","2027Q2"]';
  LS.rd_gantt_labelw = '9000';
  fresh();
  s.eq('bad stored values are cleaned', [s.c.state.pg_quarters, s.c.state.pg_labelw], [['2027Q2'], 640]);
  s.ok(!('rd_broker_token' in LS), 'the simulated token is not stored (kept for the visit)');
  clearLS();
  fresh();
});

/* ================================================== FILTERS AND GROUPING */
const setFilter = (label, value) => s.type(label, value, { within: 'Filters and grouping' });
const clearFilters = () => { s.c.setState({ f: { unit: '', div: '', prod: '', q: '', status: '' } }); s.render(); };
/* what each tab shows, read from the views */
const structInits = () => s.vals.pst.h.inits.filter((r) => r.isInit).map((r) => r.id);
const structObjs = () => s.vals.pst.h.inits.filter((r) => r.isObj).map((r) => r.id);
const ganttObjs = () => s.vals.pgt.rows.filter((r) => r.ent === 'objective').map((r) => r.key.split(':')[1]).sort();
const msRows = () => s.vals.pms.rows.filter((r) => r.isMs).map((r) => r.id).sort();
/* today's rules (L2019-2027 structure tables; objective-less initiatives use initOwnMatches, the
   shared fallback, instead of disappearing under a product filter) */
const expStructInits = (f) => P().initiatives.filter((i) => {
  if (f.unit && (RD.unitIdOfDivision(i.divisionId, P()) || '') !== f.unit) return false;
  if (f.division && i.divisionId !== f.division) return false;
  if (f.product || f.quarter || f.status) {
    const os = P().objectives.filter((o) => o.initiativeId === i.id);
    return os.length ? os.some((o) => objMatches(o, f)) : initOwnMatches(i, f);
  }
  return true;
}).sort((a, b) => (a.order == null ? 1e9 : a.order) - (b.order == null ? 1e9 : b.order)).map((i) => i.id);
const anyF = (f) => !!(f.unit || f.division || f.product || f.quarter || f.status);
const expStructObjs = (f) => { const out = []; expStructInits(f).forEach((iid) => P().objectives.filter((o) => o.initiativeId === iid && (!anyF(f) || objMatches(o, f))).sort((a, b) => (a.order == null ? 1e9 : a.order) - (b.order == null ? 1e9 : b.order)).forEach((o) => out.push(o.id))); return out; };
const msProductId = (ms) => { const i = byId('initiatives', ms.initiativeId); return i ? (RD.effProduct(i, P()) || null) : null; };
const msQuarter = (ms) => ms.plannedDate == null ? '' : (() => { const x = iso(ms.plannedDate).split('-'); return x[0] + 'Q' + (Math.floor((Number(x[1]) - 1) / 3) + 1); })();
/* L2396 msMatches, plus the Unit filter (fixed bug 6) */
const expMs = (f) => P().milestones.filter((ms) => {
  const i = byId('initiatives', ms.initiativeId), div = i ? i.divisionId : null;
  if (f.unit && (RD.unitIdOfDivision(div, P()) || '') !== f.unit) return false;
  if (f.division && div !== f.division) return false;
  if (f.product && msProductId(ms) !== f.product) return false;
  if (f.quarter && msQuarter(ms) !== f.quarter) return false;
  if (f.status && nodeBand('milestone', ms.id) !== f.status) return false;
  return true;
}).map((m) => m.id).sort();
const FILTER_CASES = [
  {}, { division: 'DIV-EL' }, { unit: 'UNIT-BUSINE' }, { unit: 'UNIT-TECHNI' }, { product: 'PRD-EL-1' }, { product: 'PRD-FC-1' },
  { quarter: '2027Q1' }, { quarter: '2026Q4', division: 'DIV-FC' }, { status: 'on-track' }, { status: 'at-risk' }, { status: 'off-track' }, { status: 'no-band' },
  { unit: 'UNIT-TECHNI', product: 'PRD-EL-1', quarter: '2027Q1' }
];
const applyF = (f) => { s.c.setState({ f: { unit: f.unit || '', div: f.division || '', prod: f.product || '', q: f.quarter || '', status: f.status || '' } }); s.render(); };

fresh();
s.step('Filters: the five selects', () => {
  go('Structure');
  const fb = s.vals.sh.fb;
  s.ok(fb.hasUnits, 'Unit shows while units exist');
  s.eq('unit options', fb.unit.opts.map((o) => o.label), ['All units', 'Technical', 'Business']);
  s.eq('division options', fb.div.opts.map((o) => o.v), ['', 'DIV-FC', 'DIV-EL', 'DIV-BD', 'DIV-PT']);
  s.eq('product options', fb.prod.opts.map((o) => o.v), ['', 'PRD-FC-1', 'PRD-EL-1', 'PRD-EL-2']);
  s.eq('quarter options are the objectives\' quarters, sorted', fb.q.opts.map((o) => o.v), ['', '2026Q3', '2026Q4', '2027Q1']);
  s.eq('status options', fb.status.opts.map((o) => o.v), ['', 'on-track', 'at-risk', 'off-track', 'no-band']);
  s.eq('status labels', fb.status.opts.map((o) => o.label), ['Any status', 'On track', 'At risk', 'Off track', 'No score yet']);
  /* no units at all: the Unit select goes */
  s.c.mutate((DD) => { DD.portfolio.units = []; DD.portfolio.divisions.forEach((d) => { d.unitId = null; }); }, { quiet: true });
  s.render();
  s.ok(!s.vals.sh.fb.hasUnits, 'no Unit select without units');
});
fresh();
s.step('Filters: chips with remove and clear all', () => {
  go('Structure');
  setFilter('Unit', 'UNIT-TECHNI'); setFilter('Division', 'DIV-EL'); setFilter('Product', 'PRD-EL-1'); setFilter('Quarter', '2027Q1'); setFilter('Status', 'at-risk');
  s.eq('chips', s.vals.sh.fb.chips.map((c) => c.label), ['Unit: Technical', 'Division: Electrolyzer', 'Product: Tera stack', 'Quarter: Q1 2027', 'Status: At risk']);
  s.click('Remove the product filter');
  s.eq('one chip removed', s.c.state.f.prod, '');
  s.click('Clear all', { within: 'Active filters' });
  s.eq('all cleared', s.c.state.f, { unit: '', div: '', prod: '', q: '', status: '' });
});
fresh();
s.step('Filters: shared by Structure, Gantt, Milestones (and Overview); a change closes the editor', () => {
  go('Structure');
  setFilter('Division', 'DIV-FC');
  go('Gantt');
  s.eq('Gantt keeps the filter', s.vals.sh.fb.div.v, 'DIV-FC');
  go('Milestones');
  s.eq('Milestones keeps it', s.vals.sh.fb.div.v, 'DIV-FC');
  go('Overview');
  s.ok(s.vals.sh.ovFilters, 'Overview shows the active filters (fixed bug 5)');
  s.eq('Overview honours it', s.vals.pov.units.reduce((a, u) => a.concat(u.divs.map((d) => d.id)), []), ['DIV-FC']);
  go('Structure');
  menu('HP membrane', 'Edit');
  s.ok(sheets().length === 1, 'editor open');
  setFilter('Quarter', '2026Q4');
  s.eq('a filter change closes the editor', sheets().length, 0);
  menu('HP membrane', 'Edit');
  s.click('Custom');
  s.eq('a grouping change closes it too', sheets().length, 0);
});
fresh();
s.step('Filters: rules for objectives, initiatives and milestones (every tab)', () => {
  FILTER_CASES.forEach((f) => {
    applyF(f);
    const tag = JSON.stringify(f);
    go('Structure');
    s.eq('Structure initiatives ' + tag, structInits(), expStructInits(f));
    s.eq('Structure objective rows ' + tag, structObjs(), expStructObjs(f));
    go('Gantt');
    s.eq('Gantt objectives ' + tag, ganttObjs(), P().objectives.filter((o) => objMatches(o, f)).map((o) => o.id).sort());
    go('Milestones');
    s.eq('Milestones ' + tag, msRows(), expMs(f));
  });
  clearFilters();
});
fresh();
s.step('Filters: an initiative without objectives is judged on its own unit, division and product', () => {
  s.c.mutate((DD) => { DD.portfolio.initiatives.push({ id: 'INIT-FC-03', name: 'Membrane recycling study', divisionId: 'DIV-FC', productId: 'PRD-FC-1', modelId: null, plannedStart: 2470, plannedEnd: 2600, order: 3 }); }, { quiet: true });
  s.render();
  const shows = (f) => { applyF(f); go('Structure'); const st = structInits().indexOf('INIT-FC-03') >= 0; go('Gantt'); const gt = s.vals.pgt.rows.some((r) => r.key === 'initiative:INIT-FC-03'); return [st, gt]; };
  s.eq('no filter: shows', shows({}), [true, true]);
  s.eq('its own division', shows({ division: 'DIV-FC' }), [true, true]);
  s.eq('another division hides it', shows({ division: 'DIV-EL' }), [false, false]);
  s.eq('its unit', shows({ unit: 'UNIT-TECHNI' }), [true, true]);
  s.eq('another unit hides it', shows({ unit: 'UNIT-BUSINE' }), [false, false]);
  s.eq('its own product (Structure fixed: today hides it there)', shows({ product: 'PRD-FC-1' }), [true, true]);
  s.eq('another product hides it', shows({ product: 'PRD-EL-1' }), [false, false]);
  s.eq('a quarter filter hides it', shows({ quarter: '2026Q4' }), [false, false]);
  s.eq('a status filter hides it', shows({ status: 'on-track' }), [false, false]);
  clearFilters();
});
fresh();
s.step('Grouping: Hierarchy or Custom with a dimension chain', () => {
  go('Structure');
  s.ok(s.has('Hierarchy') && s.has('Custom'), 'two modes');
  s.click('Custom');
  s.eq('custom starts with Division', s.c.state.group, { mode: 'custom', dims: ['division'] });
  s.type('Add a grouping level', 'owner');
  s.eq('a level added', s.c.state.group.dims, ['division', 'owner']);
  const lv = s.vals.sh.fb.levels;
  s.eq('a level offers itself plus the unused dimensions', lv[0].opts.map((o) => o.v), ['unit', 'division', 'product', 'model', 'quarter', 'initiative']);
  s.eq('chevrons between levels', lv.map((l) => l.sep), [false, true]);
  s.type('Grouping level 2', 'quarter');
  s.eq('a level changed in place', s.c.state.group.dims, ['division', 'quarter']);
  s.type('Grouping level 2', 'division');
  s.eq('picking a dimension already used drops the duplicate', s.c.state.group.dims, ['division']);
  s.click('Remove the division level');
  s.eq('no levels: a flat list', s.c.state.group.dims, []);
  s.expect('No levels, so objectives show as one list.');
  s.click('Hierarchy');
  s.click('Custom');
  s.eq('Custom with no levels resets to Division', s.c.state.group.dims, ['division']);
});
s.step('Grouping: the seven dimensions', () => {
  s.eq('dimensions', s.vals.sh.fb.addOpts.map((o) => o.v).filter(Boolean).concat(['division']).sort(), ['division', 'initiative', 'model', 'owner', 'product', 'quarter', 'unit']);
  ['unit', 'product', 'model', 'quarter', 'owner', 'initiative'].forEach((d) => {
    s.c.setState({ group: { mode: 'custom', dims: [d] } }); s.render();
    go('Structure');
    const grpKeys = RD.groupObjectives(P().objectives, [d], P()).filter((n) => n.key !== '').map((n) => n.key);
    s.eq('Structure groups by ' + d, s.vals.pst.g.rows.filter((r) => r.isGroup).map((r) => r.key), grpKeys.map((k) => d + ':' + k));
  });
});
fresh();
s.step('Grouping: Owner fans out (a shared objective sits under each owner)', () => {
  s.c.setState({ group: { mode: 'custom', dims: ['owner'] } }); s.render();
  go('Structure');
  const under = (email) => { const rows = s.vals.pst.g.rows; const i = rows.findIndex((r) => r.isGroup && r.key === 'owner:' + email); const out = []; for (let j = i + 1; j < rows.length && !rows[j].isGroup; j++) out.push(rows[j].id); return out; };
  s.ok(under('maya@celadyne.com').indexOf('OBJ-FC-2026Q4-03') >= 0 && under('erin@celadyne.com').indexOf('OBJ-FC-2026Q4-03') >= 0, 'Structure: under Maya and under Erin');
  s.eq('group counts include it twice', s.vals.pst.g.rows.filter((r) => r.isGroup).map((r) => r.label + ' ' + r.count).filter((t) => /Maya|Erin/.test(t)), ['Erin Walsh 4 objectives', 'Maya Okafor 2 objectives']);
  go('Gantt');
  const gk = s.vals.pgt.rows.filter((r) => r.key === 'objective:OBJ-FC-2026Q4-03').length;
  s.eq('Gantt draws it under both owners', gk, 2);
});
fresh();
s.step('Grouping: items with no value sit above the groups, with no header', () => {
  s.c.mutate((DD) => { const o = DD.portfolio.objectives.find((x) => x.id === 'OBJ-BD-2027Q1-01'); o.quarter = null; }, { quiet: true });
  s.render();
  s.c.setState({ group: { mode: 'custom', dims: ['quarter'] } }); s.render();
  go('Structure');
  const rows = s.vals.pst.g.rows;
  s.eq('first row is the quarter-less objective, at the top level', [rows[0].isObj, rows[0].id, rows[0].pad], [true, 'OBJ-BD-2027Q1-01', 'padding-left: 16px']);
  s.ok(rows[1].isGroup, 'then the quarter groups');
  s.ok(!rows.some((r) => r.isGroup && /None/.test(r.label)), 'no "none" header');
  go('Gantt');
  const g = s.vals.pgt.rows;
  s.eq('Gantt: the quarter-less objective comes first, at depth 0', [g[0].key, g[0].pad], ['objective:OBJ-BD-2027Q1-01', 'padding-left: 6px']);
  s.c.setState({ group: { mode: 'custom', dims: ['quarter', 'division'] } }); s.render();
  go('Milestones');
  const m = s.vals.pms.rows;
  s.eq('Milestones: no quarter dimension on a milestone, so no header; rows sit under the division groups', m.filter((r) => r.isGroup).map((r) => r.label), ['Fuel Cell', 'Electrolyzer', 'Business Development']);
});

/* ============================================================== OVERVIEW */
const sc = (v) => (v == null || !isFinite(v) ? '—' : String(Math.round(v)));
const bandWord = (b) => ({ 'on-track': 'On track', 'at-risk': 'At risk', 'off-track': 'Off track' }[b] || 'No score yet');
const qLabel = (q) => 'Q' + q.slice(-1) + ' ' + q.slice(0, 4);
const plural = (n, w) => n + ' ' + (n === 1 ? w : w + 's');
/* L3137-3143 active rules, with paused milestones out (fixed bug 8) */
const isActiveObjective = (o) => { const v = RD.rollupObjective(o.id, P(), em()); if (v != null && v >= 100) return false; if ((o.quarter || '') === QNOW) return true; return o.plannedStart != null && o.plannedEnd != null && o.plannedStart <= TODAY && TODAY <= o.plannedEnd; };
const isActiveMilestone = (m) => !RD.milestoneAchieved(m, em()) && !RD.milestonePaused(P().milestoneState, m.id) && msQuarter(m) === QNOW;
/* L3239-3247 ovObjProdId / ovMsProdId */
const ovObjProdId = (o) => { const c = RD.effClass(o, P()); const ini = byId('initiatives', o.initiativeId); const mid = c.kind === 'model' ? c.modelId : (ini && ini.modelId) || null; if (mid) { const m = byId('models', mid); if (m) return m.productId; } if (c.kind === 'product') return c.productId; return (ini && ini.productId) || null; };
const ovMsProdId = (ms) => { const i = byId('initiatives', ms.initiativeId); if (i && i.modelId) { const m = byId('models', i.modelId); if (m) return m.productId; } return (i && i.productId) || null; };
const ovMsDiv = (ms) => { const i = byId('initiatives', ms.initiativeId); return (i && i.divisionId) || null; };
/* L3260-3301, with the shared filters applied to the work (fixed bug 5) */
const expActive = (f) => {
  f = f || {};
  const divs = P().divisions.filter((d) => (!f.division || d.id === f.division) && (!f.unit || (d.unitId || null) === f.unit));
  const objs = P().objectives.filter((o) => isActiveObjective(o) && objMatches(o, f));
  const mss = P().milestones.filter((m) => isActiveMilestone(m) && expMs(f).indexOf(m.id) >= 0);
  const out = [];
  divs.forEach((d) => {
    const dObjs = objs.filter((o) => o.divisionId === d.id), dMs = mss.filter((m) => ovMsDiv(m) === d.id);
    const own = P().products.filter((p) => p.divisionId === d.id && (!f.unit || (RD.unitIdOfDivision(p.divisionId, P()) || '') === f.unit) && (!f.division || p.divisionId === f.division) && (!f.product || p.id === f.product)).map((p) => p.id);
    if (!dObjs.length && !dMs.length && !own.length) return;
    const ownHere = (pid) => pid != null && own.indexOf(pid) >= 0;
    let ids = own.slice();
    dObjs.forEach((o) => { const p = ovObjProdId(o); if (p && ids.indexOf(p) < 0) ids.push(p); });
    dMs.forEach((m) => { const p = ovMsProdId(m); if (p && ids.indexOf(p) < 0) ids.push(p); });
    if (dObjs.some((o) => ovObjProdId(o) == null) || dMs.some((m) => ovMsProdId(m) == null)) ids.push(null);
    const pn = (pid) => (byId('products', pid) || {}).name || '';
    ids.sort((a, b) => { if (!a && b) return 1; if (a && !b) return -1; const fa = !ownHere(a), fb = !ownHere(b); if (fa !== fb) return fa ? 1 : -1; return String(pn(a)).localeCompare(String(pn(b))); });
    const blocks = [];
    ids.forEach((pid) => {
      const rank = (o) => { const v = RD.rollupObjective(o.id, P(), em()); return v == null ? 101 : v; };
      const bo = dObjs.filter((o) => (ovObjProdId(o) || null) === pid).sort((a, b) => rank(a) - rank(b)).map((o) => o.id);
      const bm = dMs.filter((m) => (ovMsProdId(m) || null) === pid).map((m) => m.id);
      const foreign = pid != null && !ownHere(pid);
      if (!bo.length && !bm.length && (pid == null || foreign)) return;
      const models = pid && !foreign ? P().models.filter((m) => m.productId === pid).map((m) => m.id) : [];
      const p = byId('products', pid);
      blocks.push({ label: pid ? (foreign ? String(p.divisionId).replace(/^[^-]*-/, '') + ' — ' : '') + p.name : 'Unclassified', models: models, objs: bo, mss: bm });
    });
    out.push({ id: d.id, blocks: blocks });
  });
  return out;
};
const gotActive = () => s.vals.pov.groups.map((g) => ({ id: g.id, blocks: g.blocks.map((b) => ({ label: b.label, models: b.models.map((m) => m.id), objs: b.objs.map((o) => o.id), mss: b.mss.map((m) => m.id) })) }));
const worstSlip = (divId) => { const c = casc(); let w = null; P().initiatives.filter((i) => i.divisionId === divId && i.plannedEnd != null).forEach((i) => { const v = c.longTermSlip[i.id]; if (v != null && isFinite(v)) w = w == null ? v : Math.max(w, v); }); return w; };

fresh();
s.step('Overview: company score, mean of division scores', () => {
  const c = RD.rollupCompany(P(), em());
  const divMean = (() => { const v = P().divisions.map((d) => RD.rollupDivision(d.id, P(), em())).filter((x) => x != null); return v.reduce((a, b) => a + b, 0) / v.length; })();
  s.eq('engine company = mean of division scores', Math.round(c * 1e6), Math.round(divMean * 1e6));
  s.eq('shown', s.vals.pov.company.score, sc(c));
  s.eq('band word', s.vals.pov.company.word, bandWord(RD.band(c)));
  s.expect('Mean of division scores');
});
s.step('Overview: unit sections with unit scores; undeclared units; Unassigned', () => {
  s.eq('sections', s.vals.pov.units.map((u) => [u.name, u.score]), [['Technical', sc(RD.rollupUnit('UNIT-TECHNI', P(), em()))], ['Business', sc(RD.rollupUnit('UNIT-BUSINE', P(), em()))]]);
  s.eq('unit score is the flat mean of its objectives', s.vals.pov.units[0].score, sc((() => { const v = P().objectives.filter((o) => ['DIV-FC', 'DIV-EL'].indexOf(o.divisionId) >= 0).map((o) => RD.objectiveScore(o.id, em())).filter((x) => x != null); return v.reduce((a, b) => a + b, 0) / v.length; })()));
  s.c.mutate((DD) => { DD.portfolio.divisions.find((d) => d.id === 'DIV-PT').unitId = 'UNIT-GHOST'; DD.portfolio.divisions.find((d) => d.id === 'DIV-BD').unitId = null; DD.portfolio.units.reverse(); }, { quiet: true });
  s.render();
  s.eq('declared by order, then undeclared ids, then Unassigned (empty units skipped)', s.vals.pov.units.map((u) => [u.name, u.hasScore, u.divs.map((d) => d.id)]), [['Technical', true, ['DIV-FC', 'DIV-EL']], ['UNIT-GHOST', true, ['DIV-PT']], ['Unassigned', false, ['DIV-BD']]]);
});
fresh();
s.step('Overview: division cards (overall, per quarter, counts, status mix, worst slip, click)', () => {
  const cards = s.vals.pov.units.reduce((a, u) => a.concat(u.divs), []);
  P().divisions.forEach((d) => {
    const card = cards.find((c) => c.id === d.id);
    s.eq(d.id + ' overall', card.score, sc(RD.rollupDivision(d.id, P(), em())));
    s.eq(d.id + ' per quarter', card.qs.map((q) => q.q + ' ' + q.score), RD.boundsOf('division', d.id, P()).map((q) => qLabel(q) + ' ' + sc(RD.score('division', d.id, P(), em(), q))));
    const nObj = P().objectives.filter((o) => o.divisionId === d.id).length, nMs = P().milestones.filter((m) => ovMsDiv(m) === d.id).length;
    s.eq(d.id + ' counts (all, not only active)', card.meta, plural(nObj, 'objective') + ', ' + plural(nMs, 'milestone'));
    const c = statusCounts(d.id);
    s.eq(d.id + ' status mix', card.mix.map((x) => x.n), [c['on-track'], c['at-risk'], c['off-track'], c['no-band']].map(String));
    const w = worstSlip(d.id);
    s.eq(d.id + ' worst slip', card.slip, w == null ? 'No schedule data' : w <= 0 ? 'No initiative is slipping' : 'Worst initiative slip: ' + plural(Math.round(w), 'day'));
  });
  s.ok(cards.find((c) => c.id === 'DIV-PT').noQs, 'a division with no quarters says so');
  /* a real slip, then the paused rule, then no planned end (no NaN, no 2020-based number) */
  s.c.mutate((DD) => { DD.portfolio.initiatives.find((i) => i.id === 'INIT-EL-01').plannedEnd = 2520; }, { quiet: true });
  s.render();
  const w = worstSlip('DIV-EL');
  s.ok(w > 0, 'Tera component lock now slips');
  s.ok(s.text.indexOf('Worst initiative slip: ' + plural(Math.round(w), 'day')) >= 0, 'the card says so');
  s.c.mutate((DD) => { const m = DD.portfolio.milestones.find((x) => x.id === 'MS-FC-01-02'); m.plannedDate = 2700; }, { quiet: true });
  s.render();
  s.ok(worstSlip('DIV-FC') > 0 && /Worst initiative slip: 54 days/.test(s.text), 'a late milestone makes Fuel Cell slip by 54 days');
  go('Structure');
  menu('First 300 cm² MEA shipped', 'Pause');
  go('Overview');
  s.ok(s.vals.pov.units[0].divs[0].slip === 'No initiative is slipping', 'pausing that milestone takes it out of the slip (fixed bug 8)');
  s.c.mutate((DD) => { DD.portfolio.initiatives.find((i) => i.id === 'INIT-FC-02').plannedEnd = null; }, { quiet: true });
  s.render();
  s.clean('no NaN with an initiative that has no planned end');
  s.ok(!/\d{3,} days/.test(s.vals.pov.units[0].divs[0].slip), 'no 2020-based slip (fixed bug 13)');
  s.click('Open details for Fuel Cell');
  s.eq('a card opens the division detail', [top().kind, top().data.type, top().data.id], ['pov.detail', 'division', 'DIV-FC']);
});
fresh();
s.step('Overview: active work grouped by product (own, borrowed, unclassified)', () => {
  s.eq('sample', gotActive(), expActive({}));
  /* borrowed: an Electrolyzer objective on the Fuel Cell product */
  s.c.mutate((DD) => {
    DD.portfolio.initiatives.push({ id: 'INIT-EL-03', name: 'Shared membrane trial', divisionId: 'DIV-EL', productId: 'PRD-FC-1', modelId: null, plannedStart: 2465, plannedEnd: 2560, order: 3 });
    DD.portfolio.objectives.push({ id: 'OBJ-EL-2026Q4-03', statement: 'Trial HP membrane in the Tera stack', divisionId: 'DIV-EL', initiativeId: 'INIT-EL-03', quarter: '2026Q4', owner: ['toru@celadyne.com'], plannedStart: 2465, plannedEnd: 2550, milestoneIds: [], productId: null, modelId: null, order: 3 });
    DD.portfolio.milestones.push({ id: 'MS-EL-03-01', name: 'Trial cells built', initiativeId: 'INIT-EL-03', plannedDate: 2520, completedDate: null, trl: null, mrl: null, order: 1 });
  }, { quiet: true });
  s.render();
  const got = gotActive(), exp = expActive({});
  s.eq('with a borrowed product', got, exp);
  const el = got.find((g) => g.id === 'DIV-EL');
  s.ok(el.blocks.some((b) => b.label === 'FC — HP membrane' && !b.models.length && b.objs[0] === 'OBJ-EL-2026Q4-03' && b.mss[0] === 'MS-EL-03-01'), 'borrowed block: CODE — Product, no model tiles');
  s.ok(got.find((g) => g.id === 'DIV-FC').blocks[0].models.length === 1, 'model tiles stay with the owning division');
  s.ok(got.find((g) => g.id === 'DIV-BD').blocks.some((b) => b.label === 'Unclassified'), 'unclassified work in its own block');
  /* a product with nothing active still tiles under its owner */
  s.ok(el.blocks.some((b) => b.label === 'Tera system' && b.models.length === 1 && !b.objs.length), 'an idle own product still tiles');
  /* filters */
  [{ product: 'PRD-EL-1' }, { product: 'PRD-FC-1' }, { division: 'DIV-EL' }, { unit: 'UNIT-BUSINE' }, { status: 'off-track' }].forEach((f) => {
    applyF(f);
    s.eq('Overview with ' + JSON.stringify(f), gotActive(), expActive(f));
  });
  applyF({ product: 'PRD-EL-1' });
  s.ok(!gotActive().some((g) => g.blocks.some((b) => /HP membrane|Tera system/.test(b.label))), 'a filtered-out product does not come back as borrowed (fixed bug 5)');
  clearFilters();
  /* paused milestones are not active work (fixed bug 8) */
  go('Structure');
  menu('Trial cells built', 'Pause');
  go('Overview');
  s.ok(!gotActive().some((g) => g.blocks.some((b) => b.mss.indexOf('MS-EL-03-01') >= 0)), 'a paused milestone leaves the active work');
});
fresh();
s.step('Overview: model tiles', () => {
  const tiles = s.vals.pov.groups.reduce((a, g) => a.concat(g.blocks.reduce((b, x) => b.concat(x.models), [])), []);
  s.eq('model tiles', tiles.map((t) => t.id), ['MDL-FC-1-1', 'MDL-EL-1-1', 'MDL-EL-2-1']);
  tiles.forEach((t) => {
    const m = byId('models', t.id), p = byId('products', m.productId);
    const sd = D().spec['SPEC-' + p.divisionId];
    const conf = RD.objectiveScore(m.id, D().spec);
    s.eq(t.id + ' conformance', t.conf, conf == null ? '—' : Math.round(conf) + '%');
    s.eq(t.id + ' maturity', t.maturity, ((sd.modelSpec || {})[m.id] || {}).maturity || '');
    s.eq(t.id + ' specs', t.specs.map((x) => x.name + ' ' + x.score), (sd.keyResults || []).filter((k) => k.objectiveId === m.id).map((k) => (k.statement || k.id) + ' ' + sc(RD.keyResultScore(k.id, D().spec))));
    const gs = (sd.stageGates || []).filter((g) => g.objectiveId === m.id);
    s.eq(t.id + ' components and sub-products', t.parts, plural(gs.filter((g) => !g.refModel).length, 'component') + ', ' + plural(gs.filter((g) => g.refModel).length, 'sub-product'));
    s.eq(t.id + ' rollup', t.rollup, 'Overall ' + sc(RD.sliceScore('model', m.id, P(), em(), null)));
    s.eq(t.id + ' rollup per quarter', t.qs.map((q) => q.q + ' ' + q.score), ['2026Q3', '2026Q4', '2027Q1'].map((q) => [q, RD.sliceScore('model', m.id, P(), em(), q)]).filter((x) => x[1] != null).map((x) => qLabel(x[0]) + ' ' + sc(x[1])));
  });
  s.ok(tiles.find((t) => t.id === 'MDL-EL-2-1').parts === '0 components, 1 sub-product', 'a sub-product (refModel) counts as one');
  s.click('Open details for model HP6-12');
  s.eq('a tile opens the model detail', [top().data.type, top().data.id], ['model', 'MDL-FC-1-1']);
});
fresh();
s.step('Overview: objective tiles', () => {
  const c = RD.cascade(P(), em(), TODAY);
  const tiles = s.vals.pov.groups.reduce((a, g) => a.concat(g.blocks.reduce((b, x) => b.concat(x.objs), [])), []);
  s.ok(tiles.length >= 5, 'active objectives tile');
  tiles.forEach((t) => {
    const o = byId('objectives', t.id), doc = docOf(o.divisionId);
    const score = RD.rollupObjective(o.id, P(), em());
    const end = o.plannedEnd != null ? (c.objectiveProjectedEnd[o.id] != null ? c.objectiveProjectedEnd[o.id] : o.plannedEnd) : c.objectiveProjectedEnd[o.id];
    const dl = end != null ? end - TODAY : null;
    const es = RD.objectiveEndState(doc.objectiveState, o.id);
    const sub = es ? 'Ended ' + fmtDayY(es.endedDay) : dl == null ? 'No planned end' : dl < 0 ? plural(-dl, 'day') + ' overdue' : dl === 0 ? 'Due today' : plural(dl, 'day') + ' left';
    s.eq(t.id + ' status line', t.sub, sub);
    const slip = !es && o.plannedEnd != null && end != null ? end - o.plannedEnd : null;
    s.eq(t.id + ' slip chip', t.slip, slip != null && slip > 0 ? plural(slip, 'day') + ' slip' : '');
    s.eq(t.id + ' score and band', [t.score, t.word], [sc(score), bandWord(RD.band(score))]);
    s.eq(t.id + ' progress', t.pct, (score == null ? 0 : Math.round(Math.max(0, Math.min(100, score)))) + '%');
    const krs = (doc.keyResults || []).filter((k) => k.objectiveId === o.id);
    s.eq(t.id + ' key result rows', t.krs.map((k) => k.name), krs.map((k) => k.statement || k.id));
    const gates = (doc.stageGates || []).filter((g) => g.objectiveId === o.id);
    const passed = gates.filter((g) => { const st = RD.classifyGate(g, TODAY); return st === 'passed' || st === 'passed-late'; }).length;
    const behind = gates.filter((g) => RD.classifyGate(g, TODAY) === 'overdue').length;
    s.eq(t.id + ' gates', [t.hasGates, t.gates, t.hasBehind, t.behind], [gates.length > 0, 'Gates ' + passed + ' of ' + gates.length + ' passed', behind > 0, behind + ' behind']);
    const sets = (doc.stageGateSets || []).filter((x) => x.objectiveId === o.id && gates.some((g) => g.setId === x.id));
    s.eq(t.id + ' one lane per workstream, lettered only when there are several', t.lanes.map((l) => l.hasLabel ? l.label : ''), sets.length > 1 ? sets.map((x, i) => String.fromCharCode(65 + i)) : (gates.length ? [''] : []));
  });
  const t = tiles.find((x) => x.id === 'OBJ-FC-2026Q4-01');
  s.eq('KR table: target and now from the first KPI of each KR', t.krs.map((k) => k.tgt + ' / ' + k.cur), ['≤ 1.5 µm / 1.47 µm', '≥ 95 mS/cm / 92.75 mS/cm']);
  s.eq('gate dots: passed read as done, each titled with its state', t.lanes[0].dots.map((d) => d.title), ['Commission the coating line: passed', 'First 10 m trial roll: passed late', '50 m continuous run: pending']);
  s.eq('lane title is the workstream name', t.lanes.map((l) => l.title), (D().docs['EXEC-DIV-FC'].stageGateSets || []).filter((x) => x.objectiveId === 'OBJ-FC-2026Q4-01').sort((a, b) => (a.order || 0) - (b.order || 0)).map((x) => x.name));
  s.ok(tiles.findIndex((x) => x.id === 'OBJ-FC-2026Q4-03') < tiles.findIndex((x) => x.id === 'OBJ-FC-2026Q4-01'), 'worst score first');
  s.click('Open details for ' + byId('objectives', 'OBJ-FC-2026Q4-01').statement);
  s.eq('a tile opens the objective detail', [top().data.type, top().data.id], ['objective', 'OBJ-FC-2026Q4-01']);
  closeSheets();
  /* an ended objective that is still active work: "Ended DATE", its end badge, no slip chip */
  s.c.mutate((DD) => { DD.docs['EXEC-DIV-FC'].objectiveState.push({ objectiveId: 'OBJ-FC-2026Q4-02', status: 'abandoned', endedDay: 2470, note: '' }); DD.portfolio.objectives.find((x) => x.id === 'OBJ-FC-2026Q4-02').plannedEnd = 2460; }, { quiet: true });
  s.render();
  const t2 = s.vals.pov.groups[0].blocks[0].objs.find((x) => x.id === 'OBJ-FC-2026Q4-02');
  s.eq('ended objective tile', [t2.sub, t2.hasEnd, t2.endText, t2.hasSlip], ['Ended ' + fmtDayY(2470), true, 'Abandoned', false]);
});
fresh();
s.step('Overview: milestone tiles (Done, Achieved, Est, Due; slip; KPI table)', () => {
  const c = casc();
  const ms = () => s.vals.pov.groups.reduce((a, g) => a.concat(g.blocks.reduce((b, x) => b.concat(x.mss), [])), []);
  const t = ms().find((x) => x.id === 'MS-FC-01-01');
  const eff = c.milestoneEffective['MS-FC-01-01'];
  s.eq('slipping: Est date', t.sub, 'Est ' + fmtDayY(eff));
  s.eq('slip chip', t.slip, plural(eff - 2536, 'day') + ' slip');
  s.eq('score', t.score, sc(RD.milestoneScore('MS-FC-01-01', em())));
  s.eq('KPI table includes the milestone targets set in Planning (fixed bug 9)', t.kpis.map((k) => k.name + ' | ' + k.tgt + ' | ' + k.cur), ['Continuous run length | ≥ 50 m | 32 m']);
  /* due, done, achieved */
  s.c.mutate((DD) => { DD.portfolio.milestones.push({ id: 'MS-FC-02-01', name: 'AST protocol frozen', initiativeId: 'INIT-FC-02', plannedDate: 2500, completedDate: null, order: 1 }, { id: 'MS-FC-02-02', name: 'Low-RH cell built', initiativeId: 'INIT-FC-02', plannedDate: 2490, completedDate: 2475, order: 2 }); }, { quiet: true });
  s.render();
  s.eq('due', ms().find((x) => x.id === 'MS-FC-02-01').sub, 'Due ' + fmtDayY(2500));
  s.ok(!ms().some((x) => x.id === 'MS-FC-02-02'), 'a completed milestone is not active');
  s.click('Open details for milestone Pilot line ready for customer audit');
  s.eq('a tile opens the milestone detail', [top().data.type, top().data.id], ['milestone', 'MS-FC-01-01']);
  closeSheets();
  /* the tile wording for achieved milestones, through the detail sheet's status (an achieved one is never active) */
  const mt = (id) => { s.c.openSheet('pov.detail', { type: 'milestone', id: id }, {}); s.render(); const v = s.vals.pov.detail; closeSheets(); return v; };
  s.eq('done shows Achieved', mt('MS-FC-02-02').sched[2].v, 'Achieved');
  s.eq('KPI-achieved milestone (no completed date)', mt('MS-EL-01-02').sched[2].v, 'Achieved');
});
fresh();
s.step('Overview: detail sheets (objective, milestone, model, division)', () => {
  const c = casc(), e = em(), pool = poolOf(e);
  /* objective */
  s.c.openSheet('pov.detail', { type: 'objective', id: 'OBJ-EL-2026Q4-01' }, {}); s.render();
  let d = s.vals.pov.detail;
  const o = byId('objectives', 'OBJ-EL-2026Q4-01'), doc = docOf('DIV-EL');
  const score = RD.rollupObjective(o.id, P(), e);
  s.eq('objective badges: band and score, product', d.badges.map((b) => b.text), [bandWord(RD.band(score)) + ', ' + sc(score), 'Tera stack']);
  s.eq('key results', d.krs.map((k) => k.name), doc.keyResults.filter((k) => k.objectiveId === o.id).map((k) => k.statement));
  const gates = doc.stageGates.filter((g) => g.objectiveId === o.id);
  const gp = gates.filter((g) => /passed/.test(RD.classifyGate(g, TODAY))).length;
  s.eq('stage-gate header', d.gateHead, 'Stage-gates, ' + gp + ' of ' + gates.length + ' passed');
  s.eq('every gate listed with its state', d.gateRows.filter((r) => r.isGate).map((r) => r.label + ': ' + r.state).sort(), gates.map((g) => (g.name || g.id) + ': ' + ({ passed: 'Passed', 'passed-late': 'Passed late', overdue: 'Overdue' }[RD.classifyGate(g, TODAY)] || 'Pending')).sort());
  const gk = gates.map((g) => (doc.kpis || []).find((k) => k.hostType === 'stageGate' && k.hostId === g.id)).filter(Boolean)[0];
  if (gk) s.ok(d.gateRows.some((r) => r.kpi && r.kpi.indexOf(gk.name + ': ') === 0 && / against /.test(r.kpi)), 'gate KPI as "name: current against target"');
  /* FMEA (L3218-3219 ovObjRisks) */
  const rows = [];
  (doc.risks || []).filter((r) => r.objectiveId === o.id).forEach((r) => (r.modes || []).forEach((m) => (m.effects || []).forEach((ef) => (ef.causes || []).forEach((cz) => { const sv = Number(cz.severity) || 0, oc = Number(cz.occurrence) || 0, dt = Number(cz.detection) || 0; rows.push({ mode: m.mode || r.problem || '—', rpn: sv * oc * dt, s: sv, o: oc, d: dt }); }))));
  rows.sort((a, b) => b.rpn - a.rpn);
  s.ok(rows.length > 0, 'sample objective has FMEA rows');
  const nHigh = rows.filter((x) => x.rpn >= 200).length, nMed = rows.filter((x) => x.rpn >= 100 && x.rpn < 200).length;
  s.eq('RPN summary', d.riskSum, plural(rows.length, 'risk') + ', highest RPN ' + rows[0].rpn + (nHigh ? ', ' + nHigh + ' high' : '') + (nMed ? ', ' + nMed + ' medium' : ''));
  s.eq('top 8, worst first (S x O x D)', d.risks.map((r) => r.mode + ' ' + r.s + 'x' + r.o + 'x' + r.d + '=' + r.rpn), rows.slice(0, 8).map((r) => r.mode + ' ' + r.s + 'x' + r.o + 'x' + r.d + '=' + r.rpn));
  const pe = o.plannedEnd != null ? (c.objectiveProjectedEnd[o.id] != null ? c.objectiveProjectedEnd[o.id] : o.plannedEnd) : c.objectiveProjectedEnd[o.id];
  s.eq('schedule', d.sched.map((x) => x.k + ' ' + x.v), ['Planned end ' + fmtDayY(o.plannedEnd), 'Projected end ' + fmtDayY(pe), 'Score ' + sc(score)]);
  s.eq('projected end red when later', /tx-bad/.test(d.sched[1].cls), pe > o.plannedEnd);
  s.eq('open in Execution', d.appLabel, 'Open in Execution');
  /* business division objective reads its BIZ- doc (fixed bug 10) */
  s.c.openSheet('pov.detail', { type: 'objective', id: 'OBJ-BD-2026Q4-01' }, {}); s.render();
  d = s.vals.pov.detail;
  s.eq('business objective key results from BIZ-DIV-BD', d.krs.map((k) => k.name), D().docs['BIZ-DIV-BD'].keyResults.filter((k) => k.objectiveId === 'OBJ-BD-2026Q4-01').map((k) => k.statement));
  s.ok(d.hasGates && d.hasRisks, 'and its gates and FMEA');
  s.eq('opens in Sales', d.appLabel, 'Open in Sales');
  /* milestone */
  s.c.openSheet('pov.detail', { type: 'milestone', id: 'MS-FC-01-01' }, {}); s.render();
  d = s.vals.pov.detail;
  const mscore = RD.milestoneScore('MS-FC-01-01', e);
  s.eq('milestone badges', d.badges.map((b) => b.text), [bandWord(RD.band(mscore)), 'HP membrane']);
  s.eq('milestone KPIs (Planning targets)', d.kpis.map((k) => k.name), ['Continuous run length']);
  s.eq('milestone schedule', d.sched.map((x) => x.k + ' ' + x.v), ['Planned ' + fmtDayY(2536), 'Projected ' + fmtDayY(c.milestoneEffective['MS-FC-01-01']), 'Status ' + bandWord(RD.band(mscore))]);
  s.c.openSheet('pov.detail', { type: 'milestone', id: 'MS-BD-01-01' }, {}); s.render();
  s.ok(s.vals.pov.detail.noKpis && s.see('No KPIs on this milestone.'), 'no KPIs message');
  /* model */
  s.c.openSheet('pov.detail', { type: 'model', id: 'MDL-EL-2-1' }, {}); s.render();
  d = s.vals.pov.detail;
  const conf = RD.objectiveScore('MDL-EL-2-1', D().spec);
  s.eq('model badges: product, maturity', d.badges.map((b) => b.text), ['Tera system', D().spec['SPEC-DIV-EL'].modelSpec['MDL-EL-2-1'].maturity]);
  s.eq('specifications header with conformance', d.specHead, 'Product specifications, ' + Math.round(conf) + '% conformance');
  s.eq('sub-products with their conformance', d.subs.map((x) => x.name + ' ' + x.score), D().spec['SPEC-DIV-EL'].stageGates.filter((g) => g.objectiveId === 'MDL-EL-2-1' && g.refModel).map((g) => g.name + ' ' + Math.round(RD.objectiveScore(g.refModel, D().spec)) + '%'));
  s.c.openSheet('pov.detail', { type: 'model', id: 'MDL-EL-1-1' }, {}); s.render();
  d = s.vals.pov.detail;
  s.eq('components and readiness', d.comps.map((x) => x.name + ' ' + x.score), D().spec['SPEC-DIV-EL'].stageGates.filter((g) => g.objectiveId === 'MDL-EL-1-1' && !g.refModel).map((g) => g.name + ' ' + sc(RD.stageGateScore(g.id, D().spec))));
  s.eq('objective rollup', d.rollup, 'Overall ' + sc(RD.sliceScore('model', 'MDL-EL-1-1', P(), e, null)));
  /* division */
  s.c.mutate((DD) => { DD.portfolio.initiatives.find((i) => i.id === 'INIT-EL-01').plannedEnd = 2520; DD.portfolio.initiatives.find((i) => i.id === 'INIT-EL-02').plannedEnd = 2600; }, { quiet: true });
  s.c.openSheet('pov.detail', { type: 'division', id: 'DIV-EL' }, {}); s.render();
  d = s.vals.pov.detail;
  const c2 = casc();
  const delayed = P().initiatives.filter((i) => i.divisionId === 'DIV-EL').map((i) => ({ i: i, slip: c2.longTermSlip[i.id], pe: c2.initiativeProjectedEnd[i.id] })).filter((r) => r.slip != null && !isNaN(r.slip) && r.slip > 0).sort((a, b) => b.slip - a.slip).slice(0, 3);
  s.ok(delayed.length === 2, 'two late initiatives');
  s.eq('most delayed, worst first', d.delayed.map((x) => x.name + ' | ' + x.due + ' | ' + x.slip + ' | ' + x.to), delayed.map((r) => r.i.name + ' | Due ' + fmtDayY(r.i.plannedEnd) + ' | +' + plural(Math.round(r.slip), 'day') + ' | Now ' + fmtDayY(r.pe)));
  const ov = RD.rollupDivision('DIV-EL', P(), e);
  const cnt = statusCounts('DIV-EL');
  const aObj = P().objectives.filter((x) => x.divisionId === 'DIV-EL' && isActiveObjective(x)).length, aMs = P().milestones.filter((m) => ovMsDiv(m) === 'DIV-EL' && isActiveMilestone(m)).length;
  s.eq('summary', d.sum.map((x) => x.k + ': ' + x.v), ['Overall: ' + sc(ov) + ', ' + bandWord(RD.band(ov)).toLowerCase(), 'Active now: ' + plural(aObj, 'objective') + ', ' + plural(aMs, 'milestone'), 'In the plan: 3 objectives, 3 milestones', 'Status mix: ' + cnt['on-track'] + ' on track, ' + cnt['at-risk'] + ' at risk, ' + cnt['off-track'] + ' off track, ' + cnt['no-band'] + ' no score', 'Worst slip: +' + plural(Math.round(delayed[0].slip), 'day')]);
  s.eq('models with rollup and conformance', d.models.map((x) => x.name + ' | ' + x.rollup + ' | ' + x.conf), ['Tera stack, Tera 25-30-R5 | Rollup ' + sc(RD.sliceScore('model', 'MDL-EL-1-1', P(), e, null)) + ' | Conformance ' + Math.round(RD.objectiveScore('MDL-EL-1-1', D().spec)) + '%', 'Tera system, Tera 250 kW skid | Rollup ' + sc(RD.sliceScore('model', 'MDL-EL-2-1', P(), e, null)) + ' | Conformance ' + Math.round(RD.objectiveScore('MDL-EL-2-1', D().spec)) + '%']);
  s.c.openSheet('pov.detail', { type: 'division', id: 'DIV-BD' }, {}); s.render();
  s.ok(s.vals.pov.detail.noDelayed && s.see('No initiatives are running late.'), 'nothing late message');
  closeSheets();
  s.clean('details');
});
fresh();
s.step('Overview: empty and filter-mismatch messages', () => {
  applyF({ division: 'DIV-NOPE' });
  s.ok(s.see('No divisions match the current filter (division DIV-NOPE). The filter matches a division id such as DIV-FC, not its name.'), 'filter mismatch says the filter hid them');
  s.ok(!s.see('No divisions yet'), 'and does not claim there are none');
  clearFilters();
  applyF({ quarter: '2026Q3' });
  s.ok(s.see('No active objectives or milestones this quarter.') || gotActive().every((g) => !g.blocks.some((b) => b.objs.length || b.mss.length)), 'nothing active under a past quarter filter');
  clearFilters();
  s.c.mutate((DD) => { DD.portfolio.divisions = []; DD.portfolio.initiatives = []; DD.portfolio.objectives = []; DD.portfolio.milestones = []; DD.portfolio.products = []; DD.portfolio.models = []; }, { quiet: true });
  s.render();
  s.ok(s.see('No divisions yet. Add one in the Structure tab to begin.'), 'no divisions');
  s.clean('empty overview');
});
fresh();
s.step('Overview: the unreachable Slices table, built (dead code §18)', () => {
  const rows = s.vals.pov.slices.rows;
  s.eq('products then their models', rows.map((r) => r.id), ['PRD-FC-1', 'MDL-FC-1-1', 'PRD-EL-1', 'MDL-EL-1-1', 'PRD-EL-2', 'MDL-EL-2-1']);
  const pc = (pid) => { const v = P().models.filter((m) => m.productId === pid).map((m) => RD.objectiveScore(m.id, D().spec)).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  s.eq('product conformance = mean of its models', rows.filter((r) => r.isProd).map((r) => r.conf.v), ['PRD-FC-1', 'PRD-EL-1', 'PRD-EL-2'].map((p) => pc(p) == null ? '—' : Math.round(pc(p)) + '%'));
  s.eq('per quarter slice scores', rows[0].qs.map((c) => c.v), ['2026Q3', '2026Q4', '2027Q1'].map((q) => sc(RD.sliceScore('product', 'PRD-FC-1', P(), em(), q))));
});

/* ============================================================= STRUCTURE */
const ordOf = (x) => (x && x.order != null ? x.order : 1e9);
const byOrd = (arr) => arr.slice().sort((a, b) => ordOf(a) - ordOf(b));
const draft = () => s.c.draft();
const fieldLabels = () => s.vals.ped.edit.fields.map((f) => f.label);
fresh();
s.step('Structure: the four tables and their rows', () => {
  go('Structure');
  const h = s.vals.pst.h;
  s.eq('units (not filtered)', h.units.map((u) => [u.id, u.order, u.nDivs]), byOrd(P().units).map((u) => [u.id, String(u.order), String(P().divisions.filter((d) => d.unitId === u.id).length)]));
  s.eq('divisions', h.divs.map((d) => [d.id, d.unit, d.kind]), byOrd(P().divisions).map((d) => [d.id, (byId('units', d.unitId) || {}).name, d.kind === 'biz' ? 'Business' : 'R&D']));
  const prows = [];
  byOrd(P().products).forEach((p) => { prows.push('P:' + p.id); byOrd(P().models.filter((m) => m.productId === p.id)).forEach((m) => prows.push('M:' + m.id)); });
  s.eq('products with their model rows', h.prods.map((r) => (r.isProd ? 'P:' : 'M:') + r.id), prows);
  s.eq('a model row shows its own order', h.prods.find((r) => r.id === 'MDL-FC-1-1').order, '1');
  const irows = [];
  byOrd(P().initiatives).forEach((i) => { irows.push('I:' + i.id); byOrd(P().objectives.filter((o) => o.initiativeId === i.id)).forEach((o) => irows.push('O:' + o.id)); byOrd(P().milestones.filter((m) => m.initiativeId === i.id)).forEach((m) => irows.push('M:' + m.id)); });
  s.eq('initiatives with objective rows then milestone rows', h.inits.map((r) => (r.isInit ? 'I:' : r.isObj ? 'O:' : 'M:') + r.id), irows);
  const orow = h.inits.find((r) => r.id === 'OBJ-EL-2026Q4-02');
  s.eq('objective row: quarter and band', [orow.when, orow.stWord], ['Q4 2026', bandWord(nodeBand('objective', 'OBJ-EL-2026Q4-02'))]);
  const mrow = h.inits.find((r) => r.id === 'MS-FC-01-01');
  s.eq('milestone row: band-coloured diamond, planned date', [mrow.dmdCls, mrow.when], ['ped-dmd t-' + ({ 'on-track': 'ok', 'at-risk': 'warn', 'off-track': 'bad' }[nodeBand('milestone', 'MS-FC-01-01')] || 'none'), 'Dec 11']);
});
s.step('Structure: add buttons open the right editor', () => {
  [['Add unit', 'unit'], ['Add division', 'division'], ['Add product', 'product'], ['Add initiative', 'initiative']].forEach((x) => {
    s.click(x[0]);
    s.eq(x[0], [top().kind, top().data.type, top().data.id], ['ped.edit', x[1], null]);
    closeSheets();
  });
});
s.step('Structure: row actions (edit, add model / objective / milestone, delete)', () => {
  menu('Tera stack', 'Add model');
  s.eq('+ model pre-fills the product', [top().data.type, draft().productId], ['model', 'PRD-EL-1']);
  closeSheets();
  menu('Stack cost-down', 'Add objective');
  s.eq('+ obj pre-fills initiative and its division', [top().data.type, draft().initiativeId, draft().divisionId], ['objective', 'INIT-EL-02', 'DIV-EL']);
  closeSheets();
  menu('Stack cost-down', 'Add milestone');
  s.eq('+ ms pre-fills the initiative', [top().data.type, draft().initiativeId], ['milestone', 'INIT-EL-02']);
  closeSheets();
  menu('Electrolyzer', 'Add initiative');
  s.eq('division: add initiative', [top().data.type, draft().divisionId], ['initiative', 'DIV-EL']);
  closeSheets();
  menu('Electrolyzer', 'Add product');
  s.eq('division: add product', [top().data.type, draft().divisionId], ['product', 'DIV-EL']);
  closeSheets();
  menu('Tera 25-30-R5', 'Edit');
  s.eq('edit a model', [top().data.type, top().data.id], ['model', 'MDL-EL-1-1']);
  closeSheets();
  menu('Business', 'Delete');
  s.ok(!!s.c.state.dlg, 'delete asks');
  s.click('Cancel', { within: s.c.state.dlg.title });
});
s.step('Structure: names open the lineage (ids shown beside them)', () => {
  s.click('Tera stack', { within: 'Products' });
  s.eq('lineage', [top().kind, top().data.type, top().data.id], ['ped.lineage', 'product', 'PRD-EL-1']);
  closeSheets();
  s.ok(s.has('PRD-EL-1', { within: 'Products' }), 'the id is shown');
});
fresh();
s.step('Structure: order-based sorting, blank order last', () => {
  s.c.mutate((DD) => { const ii = DD.portfolio.initiatives; ii.find((i) => i.id === 'INIT-FC-01').order = null; ii.find((i) => i.id === 'INIT-BD-01').order = 0; ii.find((i) => i.id === 'INIT-EL-02').order = 1.5; }, { quiet: true });
  s.render();
  go('Structure');
  s.eq('initiatives by order, blank last', s.vals.pst.h.inits.filter((r) => r.isInit).map((r) => r.id), ['INIT-BD-01', 'INIT-FC-02', 'INIT-EL-01', 'INIT-EL-02', 'INIT-FC-01'].filter((id) => true).sort((a, b) => ordOf(byId('initiatives', a)) - ordOf(byId('initiatives', b))));
  s.eq('blank order reads as a dash', s.vals.pst.h.units.map((u) => u.order).length, 2);
});
fresh();
s.step('Structure: ended badge and the cross-division badge', () => {
  go('Structure');
  const r = s.vals.pst.h.inits.find((x) => x.id === 'OBJ-FC-2026Q3-01');
  const es = RD.objectiveEndState(D().docs['EXEC-DIV-FC'].objectiveState, 'OBJ-FC-2026Q3-01');
  s.eq('ended badge with the end date on hover', [r.hasEnd, r.endText, r.endTitle], [true, 'Achieved', 'Achieved ' + fmtDayY(es.endedDay)]);
  s.c.mutate((DD) => { DD.portfolio.objectives.push({ id: 'OBJ-EL-2026Q4-09', statement: 'Model the membrane for the Tera stack', divisionId: 'DIV-EL', initiativeId: 'INIT-FC-02', quarter: '2026Q4', owner: [], plannedStart: 2470, plannedEnd: 2540, milestoneIds: [], productId: null, modelId: null }); }, { quiet: true });
  s.render();
  const x = s.vals.pst.h.inits.find((y) => y.id === 'OBJ-EL-2026Q4-09');
  s.eq('executed elsewhere', [x.hasX, x.xText], [true, 'Executed in Electrolyzer']);
  s.eq('hover explains', x.xTitle, 'Executed in Electrolyzer. This objective’s key results and stage-gates live in that division’s execution bin, while its initiative sits in Fuel Cell.');
  s.ok(!s.vals.pst.h.inits.find((y) => y.id === 'OBJ-FC-2026Q4-02').hasX, 'an aligned objective gets none');
  s.ok(!/warn|error|mismatch/i.test(x.xText), 'neutral wording');
});
fresh();
s.step('Structure: custom grouped tree (collapse, dot, count, pre-filled add buttons)', () => {
  go('Structure');
  s.c.setState({ group: { mode: 'custom', dims: ['division', 'product', 'initiative'] } }); s.render();
  const rows = () => s.vals.pst.g.rows;
  const g = rows().find((r) => r.isGroup && r.key === 'division:DIV-EL');
  const under = P().objectives.filter((o) => o.divisionId === 'DIV-EL');
  const vs = under.map((o) => RD.rollupObjective(o.id, P(), em())).filter((v) => v != null);
  s.eq('group dot = mean of the objectives under it', g.dotCls, 'dot t-' + ({ 'on-track': 'ok', 'at-risk': 'warn', 'off-track': 'bad' }[RD.band(vs.reduce((a, b) => a + b, 0) / vs.length)] || 'none'));
  s.eq('count', g.count, plural(under.length, 'objective'));
  s.eq('division group adds', g.adds.map((a) => a.label), ['Add objective', 'Add initiative']);
  const gp = rows().find((r) => r.isGroup && r.key === 'division:DIV-EL/product:PRD-EL-1');
  s.eq('product group adds', gp.adds.map((a) => a.label), ['Add objective', 'Add model']);
  const gi = rows().find((r) => r.isGroup && r.key === 'division:DIV-EL/product:PRD-EL-1/initiative:INIT-EL-02');
  s.eq('initiative group adds', gi.adds.map((a) => a.label), ['Add objective', 'Add milestone']);
  s.click('Add an objective to Stack cost-down');
  s.eq('pre-filled from the whole group path', [draft().divisionId, draft().initiativeId, draft().productId], ['DIV-EL', 'INIT-EL-02', 'PRD-EL-1']);
  closeSheets();
  s.click('Add a milestone to Stack cost-down');
  s.eq('milestone lands in the initiative', draft().initiativeId, 'INIT-EL-02');
  closeSheets();
  s.click('Add a model to Tera stack');
  s.eq('model lands in the product', draft().productId, 'PRD-EL-1');
  closeSheets();
  s.click('Add an initiative to Electrolyzer');
  s.eq('initiative lands in the division', draft().divisionId, 'DIV-EL');
  closeSheets();
  s.click('Add an objective to Electrolyzer');
  s.eq('an objective added from a division group gets an initiative of that division', [draft().divisionId, (byId('initiatives', draft().initiativeId) || {}).divisionId], ['DIV-EL', 'DIV-EL']);
  closeSheets();
  s.click('Collapse Electrolyzer');
  s.ok(!rows().some((r) => r.isObj && byId('objectives', r.id).divisionId === 'DIV-EL'), 'collapsing hides its subtree');
  s.click('Expand Electrolyzer');
  s.ok(rows().some((r) => r.isObj && byId('objectives', r.id).divisionId === 'DIV-EL'), 'and reopens');
  s.c.setState({ group: { mode: 'custom', dims: ['owner', 'quarter'] } }); s.render();
  s.click('Add an objective to Q4 2026', { nth: 0 });
  s.eq('owner and quarter groups pre-fill the owner and quarter (and its dates)', [draft().owner, draft().quarter, draft().plannedStart, draft().plannedEnd], [['erin@celadyne.com'], '2026Q4', '2026-10-01', '2026-12-31']);
  closeSheets();
  /* collapse state is per tab */
  s.click('Collapse Q4 2026', { nth: 0 });
  go('Gantt');
  s.ok(Object.keys(s.c.state.pg_col || {}).length === 0, 'the Gantt keeps its own collapse state');
});
fresh();
s.step('Structure: objective rows in the grouped tree (context line, always-visible actions)', () => {
  go('Structure');
  s.click('Custom');
  const r = s.vals.pst.g.rows.find((x) => x.isObj && x.id === 'OBJ-EL-2026Q4-02');
  s.eq('context: quarter, initiative, owners', [r.quarter, r.initiative, r.owners], ['Q4 2026', 'Tera component lock', 'Toru and Priya']);
  s.ok(s.has('Edit Lock Tera 25-30-R5 components') && s.has('Delete Lock Tera 25-30-R5 components'), 'edit and delete are on every row');
  s.click('Delete Lock Tera 25-30-R5 components');
  s.ok(!!s.c.state.dlg, 'delete from the grouped tree confirms first');
  s.eq('nothing deleted yet', !!byId('objectives', 'OBJ-EL-2026Q4-02'), true);
  s.click('Delete objective');
  s.eq('then deletes', !!byId('objectives', 'OBJ-EL-2026Q4-02'), false);
  s.click('Edit Lock Tera 25-30-R5 components'.replace('Lock Tera 25-30-R5 components', byId('objectives', 'OBJ-EL-2026Q4-01').statement));
  s.eq('edit opens the editor', top().data.id, 'OBJ-EL-2026Q4-01');
  closeSheets();
});
fresh();
s.step('Structure: the flat toolbar (Add objective, Add initiative)', () => {
  go('Structure');
  s.click('Custom');
  s.click('Remove the division level');
  s.ok(s.vals.pst.g.flat, 'flat list');
  s.eq('every objective listed, no headers', s.vals.pst.g.rows.filter((r) => r.isGroup).length, 0);
  s.click('Add objective', { within: 'Grouped objectives' });
  s.eq('add objective', top().data.type, 'objective');
  closeSheets();
  s.click('Add initiative', { within: 'Grouped objectives' });
  s.eq('add initiative', top().data.type, 'initiative');
  closeSheets();
});
fresh();
s.step('Structure: empty messages', () => {
  go('Structure');
  applyF({ division: 'DIV-NOPE' });
  s.ok(s.see('No divisions match the filter.') && s.see('No products match the filter.') && s.see('No initiatives match the filter.'), 'filter empties');
  s.c.setState({ group: { mode: 'custom', dims: ['division'] } }); s.render();
  s.ok(s.see('No objectives match the current filters.'), 'grouped empty');
  clearFilters();
  s.c.setState({ group: { mode: 'hierarchy', dims: ['division'] } });
  s.c.mutate((DD) => { DD.portfolio.units = []; DD.portfolio.divisions = []; DD.portfolio.products = []; DD.portfolio.models = []; DD.portfolio.initiatives = []; DD.portfolio.objectives = []; DD.portfolio.milestones = []; }, { quiet: true });
  s.render();
  s.ok(s.see('No units yet. Units group divisions, like Business and Technical.'), 'no units');
  s.ok(s.see('No divisions yet.') && s.see('No products yet.') && s.see('No initiatives yet.'), 'nothing yet');
  s.clean('empty structure');
});

/* ================================================================ EDITOR */
const field = (key) => s.vals.ped.edit.fields.find((f) => f.key === key);
const typeIn = (label, v) => s.type(label, v, { within: 'Editor' });
fresh();
s.step('Editor: titles, Add / Save and Cancel, first field focused', () => {
  go('Structure');
  s.click('Add initiative');
  const e = s.vals.ped.edit;
  s.eq('add title and button', [e.title, e.okLabel, e.cancelLabel], ['Add initiative', 'Add initiative', 'Cancel']);
  s.ok(field('name').first, 'the first field takes focus (autoFocus)');
  s.click('Cancel', { within: 'Editor' });
  s.eq('Cancel closes', sheets().length, 0);
  menu('Stack cost-down', 'Edit');
  s.eq('edit title and button', [s.vals.ped.edit.title, s.vals.ped.edit.okLabel], ['Edit initiative', 'Save initiative']);
  s.click('Add milestone', { within: 'Milestones' });
  s.eq('a stacked editor offers Back', s.vals.ped.edit.cancelLabel, 'Back');
  closeSheets();
});
s.step('Editor: fields per entity', () => {
  const want = {
    unit: ['Name', 'Order'],
    division: ['Name', 'Unit', 'Kind', 'Order'],
    product: ['Name', 'Division', 'Code', 'Order'],
    model: ['Name', 'Product', 'Order'],
    initiative: ['Name', 'Division', 'Description', 'Planned start', 'Planned end', 'Product', 'Model', 'Order'],
    milestone: ['Name', 'Initiative', 'Planned date', 'Completed date', 'TRL achieved', 'MRL achieved', 'Order'],
    objective: ['Statement', 'Division', 'Initiative', 'Quarter', 'Owners', 'Planned start', 'Planned end', 'Linked milestones', 'Product', 'Model', 'Order']
  };
  Object.keys(want).forEach((t) => { NS.PED.open(s.c, s.c.ctx, t, null); s.render(); s.eq(t + ' fields', fieldLabels(), want[t]); closeSheets(); });
  NS.PED.open(s.c, s.c.ctx, 'division', null); s.render();
  s.eq('kind R&D / Business, R&D by default', field('kind').segs.map((x) => x.label + ':' + x.on), ['R&D:true', 'Business:false']);
  closeSheets();
});
s.step('Editor: optional pickers offer None; product and model carry a Classification tag', () => {
  NS.PED.open(s.c, s.c.ctx, 'initiative', null); s.render();
  s.eq('optional product: None first', field('productId').opts[0], { v: '', label: 'None' });
  s.eq('required division: no blank option', field('divisionId').opts.some((o) => o.v === ''), false);
  s.ok(field('productId').hasTag && field('modelId').hasTag && !field('divisionId').hasTag, 'classification tags');
  closeSheets();
  NS.PED.open(s.c, s.c.ctx, 'division', null); s.render();
  s.eq('optional unit: None', field('unitId').opts[0].label, 'None');
  closeSheets();
});
s.step('Editor: linked milestones multi-select (every milestone)', () => {
  menu('Lock Tera 25-30-R5 components', 'Edit');
  const ms = field('milestoneIds');
  s.eq('every milestone is offered', ms.checks.map((c) => c.label).sort(), P().milestones.map((m) => m.name).sort());
  s.eq('the linked one is ticked', ms.checks.filter((c) => c.on).map((c) => c.label), ['Tera design freeze']);
  s.check('~Second-source PTL qualified', true, { within: 'Editor' });
  s.eq('a tick adds it', draft().milestoneIds, ['MS-EL-01-02', 'MS-EL-02-01']);
  s.check('~Tera design freeze', false, { within: 'Editor' });
  s.click('Save objective');
  s.eq('saved as a list of ids', byId('objectives', 'OBJ-EL-2026Q4-02').milestoneIds, ['MS-EL-02-01']);
});
fresh();
s.step('Editor: quarter options; a quarter fills the planned dates', () => {
  go('Structure');
  menu('Stack cost-down', 'Add objective');
  const opts = field('quarter').opts.map((o) => o.v);
  s.eq('None, then last year to two years ahead plus quarters in use', opts, [''].concat(RD.quarterList(['2026Q3', '2026Q4', '2027Q1'], 2026, 1, 2)));
  typeIn('Quarter', '2027Q2');
  s.eq('dates follow the quarter', [draft().plannedStart, draft().plannedEnd], ['2027-04-01', '2027-06-30']);
  typeIn('Planned end', '2027-06-15');
  s.eq('and stay editable', draft().plannedEnd, '2027-06-15');
  typeIn('Statement', 'Second-source PTL cost model');
  s.click('Add objective', { within: 'Editor' });
  const o = P().objectives[P().objectives.length - 1];
  s.eq('stored as day numbers', [o.quarter, o.plannedStart, o.plannedEnd], ['2027Q2', dayOf('2027-04-01'), dayOf('2027-06-15')]);
  /* an old quarter outside the window is kept as an option */
  s.c.mutate((DD) => { DD.portfolio.objectives.find((x) => x.id === 'OBJ-EL-2027Q1-01').quarter = '2023Q1'; }, { quiet: true });
  s.render();
  menu('Cut stack cost 18%', 'Edit');
  s.ok(field('quarter').opts.some((x) => x.v === '2023Q1'), 'the record\'s own quarter is offered');
  closeSheets();
});
fresh();
s.step('Editor: product and model pairing, inheritance, model stored alone', () => {
  go('Structure');
  menu('Cut stack cost 18%', 'Edit');
  s.eq('an objective with no class of its own shows its initiative\'s', [draft().productId, draft().modelId], ['PRD-EL-1', '']);
  s.ok(/Inherited from the initiative/.test(field('productId').hint), 'and says it is inherited');
  s.eq('the product narrows the models', field('modelId').opts.map((o) => o.v), ['', 'MDL-EL-1-1']);
  typeIn('Model', 'MDL-EL-1-1');
  s.eq('a model fills its product', [draft().productId, draft().modelId], ['PRD-EL-1', 'MDL-EL-1-1']);
  s.click('Save objective');
  s.eq('a model is stored alone', [byId('objectives', 'OBJ-EL-2027Q1-01').productId, byId('objectives', 'OBJ-EL-2027Q1-01').modelId], [null, 'MDL-EL-1-1']);
  menu('Cut stack cost 18%', 'Edit');
  typeIn('Model', '');
  s.click('Save objective');
  s.eq('back to the inherited product: stored blank so it keeps inheriting', [byId('objectives', 'OBJ-EL-2027Q1-01').productId, byId('objectives', 'OBJ-EL-2027Q1-01').modelId], [null, null]);
  menu('Stack cost-down', 'Edit');
  typeIn('Model', 'MDL-EL-1-1');
  typeIn('Product', 'PRD-EL-2');
  s.eq('another product drops a model that is not under it', [draft().productId, draft().modelId], ['PRD-EL-2', '']);
  typeIn('Product', 'PRD-EL-1');
  typeIn('Model', 'MDL-EL-1-1');
  typeIn('Product', 'PRD-EL-1');
  s.eq('the same product keeps the model', draft().modelId, 'MDL-EL-1-1');
  s.click('Save initiative');
  s.eq('initiative: model stored alone', [byId('initiatives', 'INIT-EL-02').productId, byId('initiatives', 'INIT-EL-02').modelId], [null, 'MDL-EL-1-1']);
});
fresh();
s.step('Editor: conversions (dates, blank text, blank and bad numbers)', () => {
  go('Structure');
  menu('Pilot line ready for customer audit', 'Edit');
  typeIn('TRL achieved', '');
  typeIn('Order', '');
  s.click('Save milestone');
  const m = byId('milestones', 'MS-FC-01-01');
  s.eq('blank numbers are stored blank, not 0 (fixed bug 11)', [m.trl, m.order], [null, null]);
  menu('Pilot line ready for customer audit', 'Edit');
  typeIn('MRL achieved', 'four');
  s.click('Save milestone');
  s.eq('a non-number is refused with how to fix it', s.vals.ped.edit.err, 'MRL achieved must be a number, like 2.');
  typeIn('MRL achieved', '5');
  typeIn('Completed date', '2026-12-01');
  s.click('Save milestone');
  s.eq('saved', [byId('milestones', 'MS-FC-01-01').mrl, byId('milestones', 'MS-FC-01-01').completedDate], [5, dayOf('2026-12-01')]);
  menu('Low-humidity durability', 'Edit');
  typeIn('Description', '   ');
  s.click('Save initiative');
  s.eq('blank text stored as null', byId('initiatives', 'INIT-FC-02').desc, null);
});
fresh();
s.step('Editor: classification guard and reasons', () => {
  go('Structure');
  /* the only reachable reason through the editor: the initiative itself pins both (legacy data) */
  s.c.mutate((DD) => { const i = DD.portfolio.initiatives.find((x) => x.id === 'INIT-EL-02'); i.productId = 'PRD-EL-1'; i.modelId = 'MDL-EL-1-1'; }, { quiet: true });
  s.render();
  menu('Cut stack cost 18%', 'Edit');
  s.click('Save objective');
  s.eq('blocked with the reason, in plain words', s.vals.ped.edit.err, 'Classification blocked: its initiative pins both a product and a model. Fix the initiative first.');
  s.eq('nothing saved', byId('objectives', 'OBJ-EL-2027Q1-01').modelId, null);
  closeSheets();
  /* every engine reason (core L1525-1564) has a plain rewrite; the editor clears a class that a
     move made invalid (as today), so these show only for records the clearing cannot fix */
  const reasons = ['objective sets both productId and modelId', 'objective has no initiative', 'initiative sets both productId and modelId', 'objective pins a different product than its initiative', 'objective model belongs to a different product than its initiative', 'objective model is neither the initiative model nor one of its sub-products', 'initiative is model-specific; objective must match that model or one of its sub-products'];
  reasons.forEach((r) => {
    const t = NS.pedPlainReason(r, { initiativeId: 'INIT-EL-01' }, P());
    s.ok(t !== r && !/productId|modelId/.test(t), 'plain rewrite: ' + r + ' -> ' + t);
  });
});
fresh();
s.step('Editor: both product and model on one record is refused', () => {
  /* the editor stores a model alone, so this needs a record that already carries both */
  s.c.mutate((DD) => { const o = DD.portfolio.objectives.find((x) => x.id === 'OBJ-BD-2026Q4-01'); o.productId = 'PRD-EL-1'; o.modelId = 'MDL-EL-1-1'; }, { quiet: true });
  s.render();
  go('Structure');
  menu('Close three utility pilot agreements', 'Edit');
  s.eq('the draft shows the model and its product', [draft().productId, draft().modelId], ['PRD-EL-1', 'MDL-EL-1-1']);
  s.click('Save objective');
  s.eq('saving keeps only the model (the invariant), with no error', [byId('objectives', 'OBJ-BD-2026Q4-01').productId, byId('objectives', 'OBJ-BD-2026Q4-01').modelId], [null, 'MDL-EL-1-1']);
});
fresh();
s.step('Editor: a class that no longer fits is cleared, with a message', () => {
  go('Structure');
  menu('Cut stack cost 18%', 'Edit');
  typeIn('Model', 'MDL-EL-1-1');
  s.click('Save objective');
  s.eq('own model under a product-pinned initiative', byId('objectives', 'OBJ-EL-2027Q1-01').modelId, 'MDL-EL-1-1');
  menu('Cut stack cost 18%', 'Edit');
  typeIn('Initiative', 'INIT-FC-02');
  s.click('Save objective');
  s.ok(hasToast('Objective saved. Its product and model were cleared to match the new initiative.'), 'message (today: "…was cleared to match the new initiative.")');
  s.eq('cleared, so it inherits the new initiative', [byId('objectives', 'OBJ-EL-2027Q1-01').initiativeId, byId('objectives', 'OBJ-EL-2027Q1-01').productId, byId('objectives', 'OBJ-EL-2027Q1-01').modelId], ['INIT-FC-02', null, null]);
});
fresh();
s.step('Editor: moving to another division warns, then "Move anyway"', () => {
  go('Structure');
  const doc = D().docs['EXEC-DIV-EL'];
  const nKr = doc.keyResults.filter((k) => k.objectiveId === 'OBJ-EL-2026Q4-01').length, nG = doc.stageGates.filter((g) => g.objectiveId === 'OBJ-EL-2026Q4-01').length;
  menu(byId('objectives', 'OBJ-EL-2026Q4-01').statement, 'Edit');
  typeIn('Division', 'DIV-FC');
  s.click('Save objective');
  s.eq('first save does not move it', byId('objectives', 'OBJ-EL-2026Q4-01').divisionId, 'DIV-EL');
  s.eq('warning names what stays behind', s.vals.ped.edit.warn, 'Moving this objective from Electrolyzer to Fuel Cell. Its ' + plural(nKr, 'key result') + ' and ' + plural(nG, 'stage-gate') + ' live in Electrolyzer’s execution bin and will not move. They’ll disappear from view until the division is set back. Select Move anyway to go ahead.');
  s.eq('the button turns into Move anyway', s.vals.ped.edit.okLabel, 'Move anyway');
  typeIn('Division', 'DIV-BD');
  s.ok(!s.vals.ped.edit.hasWarn && s.vals.ped.edit.okLabel === 'Save objective', 'another division re-arms the warning');
  s.click('Save objective');
  s.ok(/to Business Development/.test(s.vals.ped.edit.warn), 'warns again for the new move');
  s.click('Move anyway');
  s.eq('then moves', byId('objectives', 'OBJ-EL-2026Q4-01').divisionId, 'DIV-BD');
  menu('Tera component lock', 'Edit');
  typeIn('Division', 'DIV-FC');
  s.click('Save initiative');
  s.eq('initiative warning', s.vals.ped.edit.warn, 'Moving this initiative from Electrolyzer to Fuel Cell. Its 1 objective stay in Electrolyzer. They’ll show under Fuel Cell here but remain in Electrolyzer in the execution app. Select Move anyway to go ahead.'.replace('Its 1 objective stay', 'Its 1 objective stay'));
  s.click('Move anyway');
  s.eq('initiative moved, its objectives stay', [byId('initiatives', 'INIT-EL-01').divisionId, byId('objectives', 'OBJ-EL-2026Q4-02').divisionId], ['DIV-FC', 'DIV-EL']);
  /* nothing stranded: no warning */
  menu('Close three utility pilot agreements', 'Edit');
  s.c.mutate((DD) => { DD.docs['BIZ-DIV-BD'].keyResults = DD.docs['BIZ-DIV-BD'].keyResults.filter((k) => k.objectiveId !== 'OBJ-BD-2026Q4-01'); DD.docs['BIZ-DIV-BD'].stageGates = DD.docs['BIZ-DIV-BD'].stageGates.filter((g) => g.objectiveId !== 'OBJ-BD-2026Q4-01'); }, { quiet: true });
  s.render();
  typeIn('Division', 'DIV-PT');
  s.click('Save objective');
  s.eq('an objective with nothing in its bin moves at once', byId('objectives', 'OBJ-BD-2026Q4-01').divisionId, 'DIV-PT');
});
fresh();
s.step('Editor: save messages; a milestone editor returns to its initiative', () => {
  go('Structure');
  s.click('Add unit');
  typeIn('Name', 'Operations');
  s.click('Add unit', { within: 'Editor' });
  s.ok(hasToast('Unit added.'), 'add message');
  menu('Operations', 'Edit');
  typeIn('Order', '3');
  s.click('Save unit');
  s.ok(hasToast('Unit saved.'), 'save message');
  menu('Stack cost-down', 'Edit');
  s.click('Add milestone', { within: 'Milestones' });
  typeIn('Name', 'Cost model reviewed');
  s.click('Add milestone', { within: 'Editor' });
  s.eq('back in the initiative editor', [top().data.type, top().data.id], ['initiative', 'INIT-EL-02']);
  s.click('Edit milestone Cost model reviewed');
  s.click('Back', { within: 'Editor', tag: 'button' });
  s.eq('Back / Cancel returns too', [top().data.type, top().data.id], ['initiative', 'INIT-EL-02']);
  closeSheets();
});
fresh();
s.step('Editor: id formats (RD.allocId like today)', () => {
  go('Structure');
  const add = (btn, fill, ok) => { s.click(btn); Object.keys(fill).forEach((k) => typeIn(k, fill[k])); s.click(ok || btn, { within: 'Editor' }); };
  const ids = (k) => P()[k].map((x) => x.id);
  let exp = RD.allocId('unit', null, ids('units'), { code: 'OPERAT' });
  add('Add unit', { Name: 'Operations' });
  s.eq('unit id', ids('units').slice(-1)[0], exp);
  exp = RD.allocId('division', null, ids('divisions'), { code: 'HYDR' });
  add('Add division', { Name: 'Hydrogen storage' });
  s.eq('division id', ids('divisions').slice(-1)[0], 'DIV-HYDR');
  add('Add product', { Name: 'Tera cell', Division: 'DIV-EL' });
  s.eq('product id', ids('products').slice(-1)[0], RD.allocId('product', 'DIV-EL', ['PRD-FC-1', 'PRD-EL-1', 'PRD-EL-2']));
  menu('Tera cell', 'Add model');
  typeIn('Name', 'Tera cell 30');
  s.click('Add model', { within: 'Editor' });
  s.eq('model id', ids('models').slice(-1)[0], 'MDL-EL-3-1');
  add('Add initiative', { Name: 'Cell redesign', Division: 'DIV-EL' });
  s.eq('initiative id', ids('initiatives').slice(-1)[0], 'INIT-EL-03');
  menu('Cell redesign', 'Add milestone');
  typeIn('Name', 'Redesign review');
  s.click('Add milestone', { within: 'Editor' });
  s.eq('milestone id', ids('milestones').slice(-1)[0], 'MS-EL-03-01');
  menu('Cell redesign', 'Add objective');
  typeIn('Statement', 'Redesign the cell frame');
  typeIn('Quarter', '2027Q1');
  s.click('Add objective', { within: 'Editor' });
  s.eq('objective id with its quarter', ids('objectives').slice(-1)[0], 'OBJ-EL-2027Q1-02');
  menu('Cell redesign', 'Add objective');
  typeIn('Statement', 'Scope the redesign');
  s.click('Add objective', { within: 'Editor' });
  s.eq('objective id without a quarter', ids('objectives').slice(-1)[0], 'OBJ-EL-UNSET-01');
  /* duplicate codes and missing parents no longer fail silently (fixed bug 12) */
  add('Add division', { Name: 'Hydrogen safety' });
  s.eq('duplicate division code', s.vals.ped.edit.err, 'The id DIV-HYDR is already taken. A division’s id comes from the first four letters of its name, so start the name differently.');
  closeSheets();
  add('Add unit', { Name: 'Operations team' });
  s.eq('duplicate unit code', s.vals.ped.edit.err, 'The id UNIT-OPERAT is already taken. A unit’s id comes from the first six letters of its name, so start the name differently.');
  closeSheets();
  s.c.mutate((DD) => { DD.portfolio.initiatives = []; }, { quiet: true }); s.render();
  NS.PED.open(s.c, s.c.ctx, 'milestone', null); s.render();
  typeIn('Name', 'Orphan');
  s.click('Add milestone', { within: 'Editor' });
  s.eq('no parent', s.vals.ped.edit.err, 'Add an initiative first. Every milestone belongs to one.');
  closeSheets();
});
fresh();
s.step('Editor: specifications block (read-only) and its hints', () => {
  go('Structure');
  menu('Tera component lock', 'Edit');
  const sp = s.vals.ped.edit.specs;
  s.eq('model specifications header', sp.head, 'Model specifications: Tera 25-30-R5');
  const all = [];
  Object.keys(D().spec).forEach((k) => (D().spec[k].kpis || []).forEach((x) => all.push(x)));
  const kp = RD.targetKpisInScope({ products: [], models: ['MDL-EL-1-1'] }, all);
  const full = RD.withPortfolio(P(), Object.assign({}, execMap(), D().spec)), fpool = poolOf(full);
  s.eq('rows: name, current, score', sp.rows.map((r) => r.name + ' | ' + r.score), kp.map((k) => (RD.kpiName(k, fpool) || k.id) + ' | ' + sc(RD.kpiScoreResolved(k, fpool, full))));
  s.expect('Read-only, from Product spec');
  closeSheets();
  /* an initiative classified to a product whose spec doc is not loaded */
  s.c.mutate((DD) => { DD.portfolio.products.push({ id: 'PRD-BD-1', divisionId: 'DIV-BD', name: 'Pilot package', order: 1 }); DD.portfolio.initiatives.find((i) => i.id === 'INIT-BD-01').productId = 'PRD-BD-1'; }, { quiet: true });
  s.render();
  menu('Utility pilot program', 'Edit');
  s.eq('not loaded', s.vals.ped.edit.specs.hint, 'The spec document for this product isn’t loaded.');
  closeSheets();
  openSettings(); s.click('Remove token'); closeSheets();
  menu('Utility pilot program', 'Edit');
  s.eq('not loaded, no token', s.vals.ped.edit.specs.hint, 'The spec document for this product isn’t loaded. Add a broker token in Settings.');
  closeSheets();
  s.c.mutate((DD) => { DD.portfolio.models.push({ id: 'MDL-EL-1-2', productId: 'PRD-EL-1', name: 'Tera 40', order: 2 }); DD.portfolio.initiatives.find((i) => i.id === 'INIT-EL-02').productId = null; DD.portfolio.initiatives.find((i) => i.id === 'INIT-EL-02').modelId = 'MDL-EL-1-2'; }, { quiet: true });
  s.render();
  menu('Stack cost-down', 'Edit');
  s.eq('no headline KPIs yet', s.vals.ped.edit.specs.hint, 'No headline KPIs on this model yet. Add them in Product spec.');
  closeSheets();
  menu(byId('objectives', 'OBJ-FC-2026Q4-01').statement, 'Edit');
  s.ok(s.vals.ped.edit.hasSpecs && /HP6-12/.test(s.vals.ped.edit.specs.head), 'objectives show the block too (inherited class)');
  closeSheets();
});

/* =============================================================== TARGETS */
const trow = (name) => s.vals.ped.edit.targets.rows.find((r) => r.name === name);
fresh();
s.step('Targets: list with dot, summary, current, edit and remove', () => {
  go('Structure');
  menu('Roll-to-roll membrane scale-up', 'Edit');
  const t = s.vals.ped.edit.targets;
  s.eq('header', t.head, 'Initiative targets');
  const k = byId('kpis', 'KPI-FC-01-1'), e = em(), pool = poolOf(e);
  const r = trow('Line yield');
  const val = RD.effValue(k, pool, e), scr = RD.kpiScoreResolved(k, pool, e);
  s.eq('summary (statistical: readings expected, not "last N": fixed bug 18)', r.summary, 'Average ≥ 85%, 5 readings expected');
  s.eq('current value', r.cur, String(Math.round(val * 100) / 100) + '%');
  s.eq('score and band dot', [r.score, r.dotCls], [sc(scr), 'dot t-' + ({ 'on-track': 'ok', 'at-risk': 'warn', 'off-track': 'bad' }[RD.band(scr)] || 'none')]);
  s.ok(s.has('Edit target Line yield') && s.has('Remove target Line yield'), 'edit and remove');
  closeSheets();
  menu('Tera component lock', 'Edit');
  s.eq('demonstration summary', trow('Stack voltage efficiency (HHV)').summary, '≥ 75%');
  closeSheets();
  s.c.mutate((DD) => { DD.portfolio.kpis.push({ id: 'KPI-EL-01-2', objectiveId: null, hostType: 'initiative', hostId: 'INIT-EL-01', name: 'Pressure test passed', targetType: 'binary', isDefiner: true, groupId: null }); }, { quiet: true });
  s.render();
  menu('Tera component lock', 'Edit');
  s.eq('binary summary', trow('Pressure test passed').summary, 'Binary, met or not met');
  s.eq('unread target', trow('Pressure test passed').cur, 'No reading');
  closeSheets();
  menu('Stack cost-down', 'Edit');
  s.ok(s.see('No targets yet. Define a KPI at this initiative here, then link key results or stage-gates to it from Execution to feed its value.'), 'empty message');
  closeSheets();
});
fresh();
s.step('Targets: milestone source line', () => {
  go('Structure');
  menu('Tera design freeze', 'Edit');
  const k = byId('kpis', 'KPI-EL-01-02-1'), e = em(), pool = poolOf(e);
  const es = RD.effValueSource(k, pool, e);
  const src = pool.find((x) => x.id === es.src);
  s.eq('a value from a linked key result KPI', trow('Cell voltage at 2 A/cm²').src, 'Source: ' + (src.name || src.id));
  closeSheets();
  menu('Pilot line ready for customer audit', 'Edit');
  s.eq('a value typed here', trow('Continuous run length').src, 'Source: manual entry');
  closeSheets();
  s.c.mutate((DD) => { DD.portfolio.kpis.find((x) => x.id === 'KPI-EL-01-02-1').sources.push('KPI-EL-2026Q4-01-3-1'); }, { quiet: true });
  s.render();
  menu('Tera design freeze', 'Edit');
  s.ok(/\(best of 2\)$/.test(trow('Cell voltage at 2 A/cm²').src), 'best of N with several sources');
  closeSheets();
});
fresh();
s.step('Targets: click to record a value (Enter, Escape, leaving the field)', () => {
  go('Structure');
  menu('Tera component lock', 'Edit');
  const lab = 'Record a value for Stack voltage efficiency (HHV)';
  const n0 = (P().kpiUpdates || []).length;
  s.ok(s.all(lab)[0].attrs.title === 'Click to record a value', 'tooltip');
  s.click(lab); s.type(lab, '74.2'); s.key(lab, 'Enter');
  const u = P().kpiUpdates[P().kpiUpdates.length - 1];
  s.eq('Enter records a reading', [u.kpiId, u.value, u.note, typeof u.timestamp, u.id === 'UPD-KPI-EL-01-1-' + u.timestamp], ['KPI-EL-01-1', 74.2, '', 'number', true]);
  s.ok(hasToast('Value recorded.'), 'Value recorded.');
  s.click(lab); s.type(lab, '99'); s.key(lab, 'Escape');
  s.eq('Escape cancels', P().kpiUpdates.length, n0 + 1);
  s.click(lab); s.type(lab, '75.5'); s.fire(s.find(lab, { handler: 'onBlur' }), 'onBlur');
  s.eq('leaving the field records', P().kpiUpdates[P().kpiUpdates.length - 1].value, 75.5);
  s.click(lab); s.type(lab, ''); s.fire(s.find(lab, { handler: 'onBlur' }), 'onBlur');
  s.eq('blank reverts', P().kpiUpdates.length, n0 + 2);
  s.click(lab); s.type(lab, 'abc'); s.fire(s.find(lab, { handler: 'onBlur' }), 'onBlur');
  s.eq('a non-number reverts on leaving', P().kpiUpdates.length, n0 + 2);
  s.click(lab); s.type(lab, 'abc'); s.key(lab, 'Enter');
  s.eq('a non-number on Enter says how to fix it', trow('Stack voltage efficiency (HHV)').rvErr, 'Use a number, like 1.85.');
  s.key(lab, 'Escape');
  /* read-only arriving while the editor is open (a teammate flips the link): the value is plain text and the code refuses */
  s.c.setState({ ro: true }); s.render();
  s.ok(!trow('Stack voltage efficiency (HHV)').canRecord && !s.has(lab, { tag: 'button' }), 'read-only: no click to record');
  const n1 = P().kpiUpdates.length;
  trow('Stack voltage efficiency (HHV)').start(); s.render();
  s.ok(!s.c.state.ped_rec && P().kpiUpdates.length === n1, 'and the handler refuses');
  s.c.setState({ ro: false });
  closeSheets();
});
fresh();
s.step('Targets: target editor fields', () => {
  go('Structure');
  menu('Tera component lock', 'Edit');
  s.click('Add target');
  const t = () => s.vals.ped.target;
  s.eq('title', t().title, 'Add target');
  s.ok(s.has('e.g. Mass activity'), 'name placeholder');
  s.eq('three target types', t().types.map((x) => x.label), ['Demonstration', 'Statistical', 'Binary']);
  s.ok(!t().isStat && t().notBinary, 'demonstration: direction, target value, unit');
  s.click('Statistical');
  s.ok(t().isStat, 'statistical adds readings and statistic');
  s.eq('statistics', t().stats.map((x) => x.label), ['Average', 'Median', 'Std dev', 'CV %', 'Range', 'Max', 'Min']);
  s.ok(s.has('Readings expected') && s.has('All'), 'readings expected, blank means all');
  s.click('Binary');
  s.ok(!t().isStat && !t().notBinary, 'binary hides direction, target and unit');
  s.click('Demonstration');
  s.eq('directions', t().dirs.map((x) => x.label), ['Increase', 'Decrease']);
  s.ok(s.has('e.g. A/g, %, mV'), 'unit placeholder');
  closeSheets();
});
fresh();
s.step('Targets: milestone value sources tree', () => {
  go('Structure');
  menu('Tera design freeze', 'Edit');
  s.click('Edit target Cell voltage at 2 A/cm²');
  const rows = s.vals.ped.target.srcRows;
  const ms = byId('milestones', 'MS-EL-01-02');
  const exp = [];
  P().objectives.filter((o) => o.initiativeId === ms.initiativeId).forEach((o) => {
    const krs = [];
    Object.keys(D().docs).forEach((k) => { const doc = D().docs[k]; (doc.keyResults || []).filter((r) => r.objectiveId === o.id).forEach((kr) => { const kp = (doc.kpis || []).filter((x) => x.hostType === 'keyResult' && x.hostId === kr.id); if (kp.length) krs.push({ kr: kr, kp: kp }); }); });
    if (krs.length) { exp.push('O:' + o.statement); krs.forEach((x) => { exp.push('K:' + x.kr.statement); x.kp.forEach((k) => exp.push('P:' + (k.name || k.id))); }); }
  });
  s.eq('Objective > key result > KPI, for objectives of this initiative', rows.map((r) => (r.isObj ? 'O:' : r.isKr ? 'K:' : 'P:') + r.label), exp);
  s.eq('the current source is ticked', rows.filter((r) => r.on).length, 1);
  const kpiRow = rows.find((r) => r.isKpi && !r.on);
  s.check(kpiRow.label, true, { within: 'Editor' });
  s.click('Save target');
  s.eq('sources saved on the milestone target', byId('kpis', 'KPI-EL-01-02-1').sources.length, 2);
  closeSheets();
  menu('First pilot energized', 'Edit');
  s.click('Add target');
  s.ok(s.vals.ped.target.noSrc || s.vals.ped.target.srcRows.length > 0, 'tree or empty message');
  closeSheets();
  s.c.mutate((DD) => { DD.portfolio.milestones.push({ id: 'MS-EL-02-02', name: 'Cost model signed off', initiativeId: 'INIT-EL-02', plannedDate: 2600, completedDate: null, order: 2 }); DD.docs['EXEC-DIV-EL'].keyResults = DD.docs['EXEC-DIV-EL'].keyResults.filter((k) => k.objectiveId !== 'OBJ-EL-2027Q1-01'); }, { quiet: true });
  s.render();
  menu('Cost model signed off', 'Edit');
  s.click('Add target');
  s.ok(s.vals.ped.target.noSrc && s.see('No key result KPIs in this initiative yet.'), 'empty tree message');
  closeSheets();
});
fresh();
s.step('Targets: Save target (id, fixed fields, message)', () => {
  go('Structure');
  menu('Tera component lock', 'Edit');
  s.click('Add target');
  s.type('Name', 'Specific energy', { within: 'Editor' });
  s.click('Statistical');
  s.type('Readings expected', '3', { within: 'Editor' });
  s.type('Statistic', 'median', { within: 'Editor' });
  s.click('Decrease');
  s.type('Target value', '4.4', { within: 'Editor' });
  s.type('Unit', 'kWh/kg', { within: 'Editor' });
  const expId = RD.allocId('kpi', 'INIT-EL-01', P().kpis.map((k) => k.id));
  s.click('Save target');
  const k = byId('kpis', expId);
  const sorted = (o) => { const r = {}; Object.keys(o).sort().forEach((x) => { r[x] = o[x]; }); return r; };
  s.eq('saved like today', sorted(k), sorted({ hostType: 'initiative', hostId: 'INIT-EL-01', objectiveId: null, isDefiner: true, groupId: null, name: 'Specific energy', targetType: 'statistical', direction: 'down', target: 4.4, unit: 'kWh/kg', statistic: 'median', readCount: 3, id: expId }));
  s.ok(hasToast('Target saved.'), 'Target saved.');
  s.eq('back in the initiative editor', top().data.type, 'initiative');
  s.click('Edit target Specific energy');
  s.eq('edit title', s.vals.ped.target.title, 'Edit target');
  s.type('Readings expected', '0', { within: 'Editor' });
  s.click('Save target');
  s.ok(/whole number of 1 or more/.test(s.vals.ui.sheetErr), 'readings expected must be 1 or more');
  s.type('Readings expected', '', { within: 'Editor' });
  s.click('Save target');
  s.eq('blank readings expected = every reading', byId('kpis', expId).readCount, null);
  closeSheets();
});
fresh();
s.step('Targets: remove (message; readings and source links go too)', () => {
  go('Structure');
  menu('Roll-to-roll membrane scale-up', 'Edit');
  s.click('Remove target Line yield');
  s.eq('confirm says what is lost', s.c.state.dlg.body, 'The target and its 3 readings are removed. This can’t be undone.');
  s.click('Remove target', { within: s.c.state.dlg.title });
  s.ok(hasToast('Target removed.'), 'Target removed.');
  s.ok(!byId('kpis', 'KPI-FC-01-1'), 'target gone');
  s.ok(!P().kpiUpdates.some((u) => u.kpiId === 'KPI-FC-01-1'), 'its readings gone (fixed bug 19)');
  closeSheets();
});

/* ============================================================ MILESTONES */
const msr = (id) => s.vals.pms.rows.find((r) => r.isMs && r.id === id);
/* L2368-2393 prodAbbrev, and the numbering with every milestone resolving its product the same way (fixed bug 14) */
const prodAbbrev = (prodId) => { const p = byId('products', prodId); if (!p) return 'MS'; if (p.code) return p.code; const nm = (p.name || '').trim(); if (!nm) return 'MS'; if (!/\s/.test(nm) && nm.length <= 10) return nm; const words = nm.split(/\s+/).filter(Boolean); const tn = nm.match(/(\d+)\s*$/); let base = words[0]; if (base.length <= 3 && words.length > 1) base = words[0] + words[1].charAt(0).toUpperCase() + words[1].slice(1); if (base.length > 6) base = base.slice(0, 6); if (tn && base.indexOf(tn[1]) < 0) base += tn[1]; return base; };
const msNumber = (ms) => { const pid = msProductId(ms); const sibs = P().milestones.filter((m) => byId('initiatives', m.initiativeId) && (msProductId(m) || null) === (pid || null)).sort((a, b) => ((a.plannedDate == null ? 1e15 : a.plannedDate) - (b.plannedDate == null ? 1e15 : b.plannedDate)) || String(a.id).localeCompare(String(b.id))); const i = sibs.findIndex((m) => m.id === ms.id); return prodAbbrev(pid) + '-' + String((i >= 0 ? i : 0) + 1).padStart(2, '0'); };
fresh();
s.step('Milestones: status block with the Report button', () => {
  go('Structure');
  menu('10-cell stack built and leak-tested', 'Edit');
  let st = s.vals.ped.edit.status;
  s.eq('achieved by date', [st.achieved, st.achText], [true, 'Marked complete ' + fmtDayY(2464)]);
  s.eq('report button', [st.reportLabel, st.locked], ['Open report', true]);
  closeSheets();
  menu('Tera design freeze', 'Edit');
  st = s.vals.ped.edit.status;
  s.eq('achieved on its KPI', [st.achieved, st.achText], [true, 'KPI target met']);
  closeSheets();
  menu('Pilot line ready for customer audit', 'Edit');
  st = s.vals.ped.edit.status;
  const v = RD.milestoneScore('MS-FC-01-01', em());
  s.eq('band and score', [st.achieved, st.word, st.score], [false, bandWord(RD.band(v)), sc(v)]);
  s.eq('create report', st.reportLabel, 'Create report');
  s.click('Create report');
  s.eq('the report stacks over the editor', sheets().map((x) => x.kind), ['ped.edit', 'pms.report']);
  closeSheets();
  menu('First pilot energized', 'Edit');
  s.ok(s.vals.ped.edit.status.noRead && s.see('No reading yet. Set a completed date, or link a key result or stage-gate to a milestone KPI in Execution.'), 'no reading message');
  closeSheets();
});
fresh();
s.step('Milestones: pause, deprioritize, note, resume, saved at once as history', () => {
  go('Structure');
  menu('Pilot line ready for customer audit', 'Edit');
  s.ok(s.see('Keeps the milestone and its dates, but stops it counting toward any rollup and takes it off the Gantt.'), 'hint');
  s.type('Why (optional)', 'Waiting on the coating head', { within: 'Editor' });
  const n0 = P().milestoneState.length;
  s.click('Pause', { within: 'Editor' });
  s.ok(hasToast('Milestone paused.'), 'Milestone paused.');
  s.eq('a record appended at once (no Save needed)', P().milestoneState.slice(n0), [{ milestoneId: 'MS-FC-01-01', status: 'paused', day: TODAY, note: 'Waiting on the coating head' }]);
  s.ok(s.vals.ped.edit.pause.paused, 'the editor shows it paused');
  s.eq('state and note', [s.vals.ped.edit.pause.stateText, s.vals.ped.edit.pause.note], ['Paused since ' + fmtDayY(TODAY), 'Waiting on the coating head']);
  s.click('Resume', { within: 'Editor' });
  s.ok(hasToast('Milestone resumed.'), 'Milestone resumed.');
  s.eq('resume appends, keeping the pause in the history', P().milestoneState.slice(n0).map((r) => r.status), ['paused', 'active']);
  s.click('Deprioritize', { within: 'Editor' });
  s.ok(hasToast('Milestone deprioritized.'), 'Milestone deprioritized.');
  s.eq('the last record wins', RD.milestoneState(P().milestoneState, 'MS-FC-01-01').status, 'deprioritized');
  s.click('Cancel', { within: 'Editor' });
  s.eq('cancelling the editor does not undo it', RD.milestonePaused(P().milestoneState, 'MS-FC-01-01'), true);
  /* from the Milestones tab and the Structure menu */
  go('Milestones');
  s.click('Milestone actions', { within: 'MS-FC-01-02' });
  s.click('Pause milestone');
  s.type('Why (optional)', 'Moved to next year', { within: s.c.state.dlg.title });
  s.click('Pause milestone', { within: s.c.state.dlg.title });
  s.eq('the tab asks why, then appends', RD.milestoneState(P().milestoneState, 'MS-FC-01-02'), { milestoneId: 'MS-FC-01-02', status: 'paused', day: TODAY, note: 'Moved to next year' });
});
fresh();
s.step('Milestones: the list inside the initiative editor (add, edit, remove with confirm)', () => {
  go('Structure');
  menu('Roll-to-roll membrane scale-up', 'Edit');
  const rows = () => s.vals.ped.edit.msList.rows;
  s.eq('rows: name and date', rows().map((r) => r.name + ' | ' + r.date), P().milestones.filter((m) => m.initiativeId === 'INIT-FC-01').sort((a, b) => (a.order || 0) - (b.order || 0)).map((m) => m.name + ' | ' + fmtDayY(m.plannedDate)));
  s.click('Add milestone', { within: 'Milestones' });
  typeIn('Name', 'Line handover');
  s.click('Add milestone', { within: 'Editor' });
  s.eq('added and back', [top().data.id, rows().some((r) => r.name === 'Line handover' && r.date === 'No date')], ['INIT-FC-01', true]);
  s.click('Edit milestone Line handover');
  s.eq('edit stacks the milestone editor', [top().data.type, sheets().length], ['milestone', 2]);
  s.click('Back', { within: 'Editor', tag: 'button' });
  s.c.mutate((DD) => { DD.portfolio.objectives.find((o) => o.id === 'OBJ-FC-2026Q4-01').milestoneIds.push('MS-FC-01-03'); }, { quiet: true }); s.render();
  s.click('Remove milestone Line handover');
  s.ok(!!s.c.state.dlg, 'remove asks first');
  s.click('Delete milestone', { within: s.c.state.dlg.title });
  s.ok(hasToast('Milestone deleted.'), 'Milestone deleted.');
  s.eq('gone, and dropped from objectives\' links', [!!byId('milestones', 'MS-FC-01-03'), byId('objectives', 'OBJ-FC-2026Q4-01').milestoneIds], [false, ['MS-FC-01-01']]);
  closeSheets();
});
fresh();
s.step('Milestones: the tab\'s columns', () => {
  go('Milestones');
  const r = msr('MS-FC-01-01'), ms = byId('milestones', 'MS-FC-01-01');
  const c = casc();
  s.eq('#, name, initiative, product, planned', [r.num, r.name, r.init, r.prod, r.planned], [msNumber(ms), ms.name, 'Roll-to-roll membrane scale-up', 'HP membrane', 'Dec 11']);
  s.eq('effective with +N days in red', [r.eff, r.slip, r.hasSlip], ['Dec 18', '+' + plural(c.milestoneEffective['MS-FC-01-01'] - 2536, 'day'), true]);
  s.eq('status, score, KPIs', [r.status, r.score, r.kpis], [bandWord(nodeBand('milestone', 'MS-FC-01-01')), sc(RD.milestoneScore('MS-FC-01-01', em())), '1']);
  s.ok(s.has('#') && s.has('Effective') && s.has('KPIs'), 'headers');
  const done = msr('MS-EL-01-01');
  s.eq('a completed one shows its date with a check', [done.eff, done.effDone, done.effLabel], ['Sep 30', true, 'Completed ' + fmtDayY(2464)]);
  s.eq('no targets reads as a dash', msr('MS-BD-01-01').kpis, '—');
});
s.step('Milestones: numbering (<ABBR>-NN by planned date within the product)', () => {
  P().milestones.forEach((m) => s.eq('number of ' + m.id, msr(m.id).num, msNumber(m)));
  s.eq('model-pinned initiatives number in sequence (fixed bug 14)', ['MS-FC-01-01', 'MS-FC-01-02'].map((id) => msr(id).num), ['HP-01', 'HP-02']);
  s.eq('no product: MS', msr('MS-BD-01-01').num, 'MS-01');
  ['HP membrane', 'Tera 25 stack', 'FCS-100', 'Membrane electrode assembly 3', 'Ox'].forEach((nm) => {
    s.c.mutate((DD) => { DD.portfolio.products.find((p) => p.id === 'PRD-FC-1').code = null; DD.portfolio.products.find((p) => p.id === 'PRD-FC-1').name = nm; }, { quiet: true });
    s.render();
    s.eq('abbreviation from the name "' + nm + '"', msr('MS-FC-01-01').num, prodAbbrev('PRD-FC-1') + '-01');
  });
});
fresh();
s.step('Milestones: paused status and dimmed row', () => {
  go('Milestones');
  const r = msr('MS-EL-02-01'), st = RD.milestoneState(P().milestoneState, 'MS-EL-02-01');
  s.eq('deprioritized reads as a state, not a band', [r.status, r.stDotCls], ['Deprioritized', 'dot pms-hollow']);
  s.eq('hover: when, why, and the rule', r.stTitle, 'Deprioritized on ' + fmtDayY(st.day) + '. ' + st.note + ' Kept, and excluded from dates and scores.');
  s.ok(/paused/.test(r.cls), 'the row is dimmed');
  s.ok(!/paused/.test(msr('MS-FC-01-01').cls), 'a live row is not');
  s.eq('a paused milestone shows its planned date as effective', r.eff, fmtDayY(2613));
  go('Structure');
  menu('10-cell stack built and leak-tested', 'Pause');
  go('Milestones');
  s.eq('achieved outranks paused', msr('MS-EL-01-01').status, 'Achieved');
});
fresh();
s.step('Milestones: report and lock icons', () => {
  go('Milestones');
  s.eq('report button labels', [msr('MS-EL-01-01').repLabel, msr('MS-FC-01-01').repLabel], ['Open report (locked)', 'Create report']);
  s.ok(msr('MS-EL-01-01').locked && !msr('MS-FC-01-01').locked, 'lock icon only on a locked report');
});
fresh();
s.step('Milestones: delete from the tab', () => {
  go('Milestones');
  s.click('Milestone actions', { within: 'MS-BD-01-01' });
  s.click('Delete milestone');
  s.eq('confirm', [s.c.state.dlg.title, s.c.state.dlg.body, s.c.state.dlg.ok], ['Delete First pilot energized?', 'This can’t be undone.', 'Delete milestone']);
  s.click('Delete milestone', { within: s.c.state.dlg.title });
  s.ok(!byId('milestones', 'MS-BD-01-01') && hasToast('Milestone deleted.'), 'deleted');
  s.ok(!byId('objectives', 'OBJ-BD-2026Q4-01').milestoneIds.length, 'links cleaned');
});
fresh();
s.step('Milestones: a row click opens the editor', () => {
  go('Milestones');
  s.fire(s.find((el) => el.tag === 'tr' && el.attrs['data-k'] === 'MS-FC-01-02', { handler: 'onClick' }), 'onClick');
  s.eq('editor', [top().kind, top().data.id], ['ped.edit', 'MS-FC-01-02']);
  closeSheets();
  s.c.setState({ ro: true }); s.render();
  s.ok(!msr('MS-FC-01-02').rowClick, 'read-only: no editor');
  s.click('Show lineage', { within: 'MS-FC-01-02' });
  s.eq('the name opens the lineage instead', top().kind, 'ped.lineage');
  closeSheets();
});
fresh();
s.step('Milestones: grouping and collapse', () => {
  go('Milestones');
  s.eq('Hierarchy groups by division', s.vals.pms.rows.filter((r) => r.isGroup).map((r) => r.label), ['Fuel Cell', 'Electrolyzer', 'Business Development']);
  s.click('Collapse Fuel Cell');
  s.ok(!msr('MS-FC-01-01'), 'collapsed');
  s.click('Expand Fuel Cell');
  s.ok(!!msr('MS-FC-01-01'), 'open again');
  s.c.setState({ group: { mode: 'custom', dims: ['product', 'initiative'] } }); s.render();
  const exp = RD.groupMilestones(P().milestones, ['product', 'initiative'], P());
  const labels = [];
  exp.forEach((n) => { if (n.key !== '') labels.push((byId('products', n.key) || {}).name); (n.children || []).forEach((c) => { if (c.key !== '') labels.push((byId('initiatives', c.key) || {}).name); }); });
  s.eq('custom chain', s.vals.pms.rows.filter((r) => r.isGroup).map((r) => r.label), labels);
  s.c.setState({ group: { mode: 'custom', dims: ['owner'] } }); s.render();
  s.eq('a dimension milestones lack: no headers, every row', [s.vals.pms.rows.filter((r) => r.isGroup).length, s.vals.pms.rows.filter((r) => r.isMs).length], [0, P().milestones.length]);
  s.c.setState({ group: { mode: 'hierarchy', dims: ['owner'] } }); s.render();
  s.eq('back in Hierarchy the stale chain is ignored (fixed bug 6)', s.vals.pms.rows.filter((r) => r.isGroup).length, 3);
});
fresh();
s.step('Milestones: empty messages', () => {
  go('Milestones');
  applyF({ quarter: '2030Q1' });
  s.ok(s.see('No milestones match the current filters.'), 'filtered empty');
  clearFilters();
  s.c.mutate((DD) => { DD.portfolio.milestones = []; }, { quiet: true }); s.render();
  s.ok(s.see('No milestones yet. Add one from an initiative in the Structure tab.'), 'none yet');
});

/* ================================================================ REPORT */
const rep = () => s.vals.pms.sheet;
fresh();
s.step('Report: opens from the tab, the editor and the Overview detail', () => {
  go('Milestones');
  s.click('Create report', { within: 'MS-FC-01-01' });
  s.eq('from the tab', [top().kind, top().data.msId], ['pms.report', 'MS-FC-01-01']);
  closeSheets();
  go('Overview');
  s.click('Open details for milestone Pilot line ready for customer audit');
  s.click('Create report');
  s.eq('from the Overview detail, stacked', sheets().map((x) => x.kind), ['pov.detail', 'pms.report']);
  closeSheets();
});
fresh();
s.step('Report: editable fields', () => {
  go('Milestones');
  s.click('Create report', { within: 'MS-FC-01-01' });
  s.eq('project placeholder: the product', rep().project.ph, 'HP membrane');
  s.type('Project', 'HP membrane pilot line'); s.type('Author', 'Erin Walsh'); s.type('Version', 'v1.1');
  s.type('What was demonstrated', 'Ran the line for 32 m.');
  s.type('Measured, Continuous run length', '35 m');
  [1, 2, 3, 4].forEach((i) => s.type('Finding ' + i, 'Finding ' + i + ' text'));
  [1, 2, 3].forEach((i) => { s.type('Action ' + i, 'Act ' + i); s.type('Owner of action ' + i, 'Erin'); s.type('Due date of action ' + i, '2026-12-0' + i); });
  s.click('Save report');
  const r = byId('milestones', 'MS-FC-01-01').milestoneReport;
  s.eq('saved', [r.project, r.author, r.version, r.demonstrated, r.kpiOverrides['KPI-FC-01-01-1'].measured, r.findings, r.actions[2], r.locked, typeof r.savedAt], ['HP membrane pilot line', 'Erin Walsh', 'v1.1', 'Ran the line for 32 m.', '35 m', ['Finding 1 text', 'Finding 2 text', 'Finding 3 text', 'Finding 4 text'], { item: 'Act 3', owner: 'Erin', due: '2026-12-03' }, false, 'number']);
  s.eq('context kept with no UI', r.context, { budget: '', buildNo: '', linkedOkr: '' });
  s.ok(hasToast('Report saved.') && !sheets().length, 'Report saved. and closes');
  /* the project placeholder falls back to the initiative when there is no product */
  s.click('Create report', { within: 'MS-BD-01-01' });
  s.eq('placeholder: initiative', rep().project.ph, 'Utility pilot program');
  s.click('Save report');
  const r2 = byId('milestones', 'MS-BD-01-01').milestoneReport;
  s.eq('an untouched placeholder saves empty', [r2.project, r2.author, r2.findings], ['', '', ['', '', '', '']]);
});
fresh();
s.step('Report: filled in automatically', () => {
  go('Milestones');
  s.click('Create report', { within: 'MS-FC-01-01' });
  const ms = byId('milestones', 'MS-FC-01-01'), e = em(), pool = poolOf(e);
  s.eq('number, name, achieved, date, TRL / MRL', [rep().tag, rep().msName, rep().achText, rep().dateAchieved, rep().trlmrl], [msNumber(ms), ms.name, 'Not achieved', '—', '5 / 4']);
  const k = byId('kpis', 'KPI-FC-01-01-1'), v = RD.kpiScoreResolved(k, pool, e);
  const m = rep().metrics[0];
  s.eq('target, measured (live), result, source', [m.target, m.measuredPh, m.result, m.src], ['≥ 50 m', '32 m', v >= 100 ? 'Met' : v >= 70 ? 'Partial' : v == null ? 'N/A' : 'Missed', 'Source: manual entry']);
  s.eq('context', [rep().planned, rep().actual, rep().trl, rep().mrl], [fmtDayY(2536), '—', 'TRL 5', 'MRL 4']);
  closeSheets();
  s.click('Open report (locked)', { within: 'MS-EL-01-01' });
  s.eq('achieved, with its date', [rep().achText, rep().dateAchieved], ['Achieved', fmtDayY(2464)]);
  closeSheets();
  /* linked objectives through value sources (L1212-1227) */
  s.click('Create report', { within: 'MS-EL-01-02' });
  const src = byId('kpis', 'KPI-EL-01-02-1').sources, objs = [];
  Object.keys(D().docs).forEach((key) => (D().docs[key].kpis || []).forEach((x) => { if (src.indexOf(x.id) >= 0 && x.hostType === 'keyResult') { const kr = D().docs[key].keyResults.find((r) => r.id === x.hostId); if (kr && objs.indexOf(kr.objectiveId) < 0) objs.push(kr.objectiveId); } }));
  s.eq('linked objectives', rep().linked.map((o) => o.text), objs.map((id) => byId('objectives', id).statement));
  s.eq('results: Met at 100', rep().metrics[0].result, 'Met');
  closeSheets();
  s.click('Create report', { within: 'MS-BD-01-01' });
  s.ok(rep().noMetrics && s.see('No targets on this milestone yet.'), 'no targets message');
  closeSheets();
});
s.step('Report: signature lines', () => {
  go('Milestones');
  s.click('Create report', { within: 'MS-FC-01-01' });
  ['Technical lead', 'CTO / R&D director', 'Reviewer / sponsor'].forEach((t) => s.expect(t));
  closeSheets();
});
fresh();
s.step('Report: lock, unlock, save, close, print', () => {
  go('Milestones');
  s.click('Create report', { within: 'MS-FC-01-01' });
  s.type('Author', 'Erin');
  s.click('Lock the report');
  s.ok(hasToast('Report locked.'), 'Lock saves at once');
  const r = byId('milestones', 'MS-FC-01-01').milestoneReport;
  s.eq('locked with the form content', [r.locked, r.author], [true, 'Erin']);
  s.ok(rep().readonly && !s.has('Save report') && s.see('Locked. Unlock to edit.'), 'locked: read as text, no Save');
  s.click('Unlock the report');
  s.ok(hasToast('Report unlocked.') && !byId('milestones', 'MS-FC-01-01').milestoneReport.locked, 'Unlock saves too');
  s.type('Version', 'v2');
  s.click('Close', { within: 'milestone-report', tag: 'button', nth: 1 });
  s.ok(!!s.c.state.dlg && s.c.state.dlg.title === 'Discard your changes?', 'Close asks before discarding');
  s.click('Discard changes');
  s.eq('discarded', [sheets().length, byId('milestones', 'MS-FC-01-01').milestoneReport.version], [0, '']);
  let printed = 0;
  const p0 = global.window.print;
  global.window.print = () => { printed++; };
  s.click('Create report'.replace('Create', 'Open'), { within: 'MS-FC-01-01' });
  s.click('Print or save as PDF');
  s.eq('print', printed, 1);
  global.window.print = () => { throw new Error('blocked'); };
  s.click('Print or save as PDF');
  s.ok(hasToast('Printing isn’t available here. Use your browser’s Print command.'), 'blocked print explains');
  global.window.print = p0;
  closeSheets();
  const css = require('fs').readFileSync(path.join(__dirname, '..', 'mods', 'pms', 'mod.css'), 'utf8');
  s.ok(/@media print/.test(css), 'print CSS prints only the report, on light paper (read)');
});

/* ================================================================ DELETE */
fresh();
s.step('Delete: the three variants', () => {
  go('Structure');
  menu('Technical', 'Delete');
  s.eq('unit with divisions', [s.c.state.dlg.title, s.c.state.dlg.body, s.c.state.dlg.ok], ['Delete unit Technical?', '2 divisions in this unit will become Unassigned. They are not deleted.', 'Delete unit']);
  s.click('Cancel', { within: s.c.state.dlg.title });
  menu('Tera 25-30-R5', 'Delete');
  s.eq('nothing nested', [s.c.state.dlg.title, s.c.state.dlg.body, s.c.state.dlg.ok], ['Delete Tera 25-30-R5?', 'This can’t be undone.', 'Delete model']);
  s.click('Cancel', { within: s.c.state.dlg.title });
  menu('Electrolyzer', 'Delete');
  const d = s.vals.ped.del;
  s.eq('nested', [d.title, d.lead, d.body, d.allLabel, d.onlyLabel, d.onlyTitle], ['Delete division', 'Delete Electrolyzer?', 'This division contains 2 products, 2 models, 2 initiatives, 3 objectives and 3 milestones. Delete those too, or keep them?', 'Delete division and 12 items', 'Delete division only', 'Keep the nested items; they lose their division link']);
  s.click('Cancel', { within: 'Editor' });
  s.eq('cancel', !!byId('divisions', 'DIV-EL'), true);
});
fresh();
s.step('Delete: full-delete rules and counts', () => {
  go('Structure');
  menu('Tera stack', 'Delete');
  s.click('Delete product and 1 item');
  s.ok(!byId('products', 'PRD-EL-1') && !byId('models', 'MDL-EL-1-1') && hasToast('Product and 1 item deleted.'), 'product takes its models');
  fresh(); go('Structure');
  menu('Tera component lock', 'Delete');
  s.click('Delete initiative and 4 items');
  s.ok(!byId('initiatives', 'INIT-EL-01') && !P().objectives.some((o) => o.initiativeId === 'INIT-EL-01') && !P().milestones.some((m) => m.initiativeId === 'INIT-EL-01'), 'initiative takes its objectives and milestones');
  s.ok(hasToast('Initiative and 4 items deleted.'), 'message with the count');
  fresh(); go('Structure');
  s.c.mutate((DD) => { DD.portfolio.objectives.push({ id: 'OBJ-EL-2026Q4-08', statement: 'Stray objective', divisionId: 'DIV-EL', initiativeId: 'INIT-FC-02', quarter: '2026Q4', owner: [], milestoneIds: [] }); }, { quiet: true }); s.render();
  menu('Electrolyzer', 'Delete');
  s.click('Delete division and 13 items');
  s.ok(!P().products.some((p) => p.divisionId === 'DIV-EL') && !P().initiatives.some((i) => i.divisionId === 'DIV-EL') && !P().objectives.some((o) => o.divisionId === 'DIV-EL'), 'division takes products, models, initiatives and every objective in it');
  s.ok(!byId('objectives', 'OBJ-EL-2026Q4-08'), 'including one whose initiative sits elsewhere');
  s.ok(hasToast('Division and 13 items deleted.'), 'count');
});
fresh();
s.step('Delete: a unit leaves its divisions unassigned', () => {
  go('Structure');
  menu('Technical', 'Delete');
  s.click('Delete unit');
  s.eq('divisions kept, now Unassigned', ['DIV-FC', 'DIV-EL'].map((id) => [!!byId('divisions', id), byId('divisions', id).unitId]), [[true, null], [true, null]]);
  s.ok(hasToast('Unit deleted.'), 'Unit deleted.');
  go('Overview');
  s.ok(s.vals.pov.units.some((u) => u.name === 'Unassigned' && u.divs.length === 2), 'they read under Unassigned');
});
fresh();
s.step('Delete: milestone links cleaned up (and the rest: targets, readings, pause records, edges)', () => {
  go('Structure');
  menu('Tera component lock', 'Delete');
  s.click('Delete initiative and 4 items');
  s.ok(!P().objectives.some((o) => (o.milestoneIds || []).some((id) => /^MS-EL-01-/.test(id))), 'no objective links a deleted milestone');
  s.ok(!P().kpis.some((k) => k.hostId === 'INIT-EL-01' || k.hostId === 'MS-EL-01-02'), 'targets on deleted records go (fixed bug 19)');
  s.ok(!P().kpiUpdates.some((u) => u.kpiId === 'KPI-EL-01-1'), 'with their readings');
  s.ok(!P().objectiveEdges.some((x) => x.fromObj === 'OBJ-EL-2026Q4-02'), 'edges from deleted objectives go');
  fresh(); go('Structure');
  menu('Tera system', 'Delete');
  s.click('Delete product only');
  s.eq('"only" clears the kept child\'s link (no dangling id)', byId('models', 'MDL-EL-2-1').productId, null);
  s.ok(hasToast('Product deleted.'), 'message for "only"');
  fresh(); go('Structure');
  menu('Second-source PTL qualified', 'Delete');
  s.click('Delete milestone', { within: s.c.state.dlg.title });
  s.ok(!P().milestoneState.some((x) => x.milestoneId === 'MS-EL-02-01'), 'its pause records go');
  s.eq('and its link', byId('objectives', 'OBJ-EL-2027Q1-01').milestoneIds, []);
});
fresh();
s.step('Delete: sheets showing a deleted record close', () => {
  go('Structure');
  menu('Stack cost-down', 'Edit');
  s.click('Delete initiative', { within: 'Editor' });
  s.click('Delete initiative and 2 items');
  s.eq('editor of the deleted initiative closed', sheets().length, 0);
});

/* =============================================================== LINEAGE */
const L = () => s.vals.ped.lineage;
fresh();
s.step('Lineage: title, back stack, breadcrumb', () => {
  go('Structure');
  s.click('Tera design freeze', { within: 'Initiatives' });
  s.eq('title, entity, id', [L().title, L().sub, L().tid], ['Tera design freeze', 'Milestone', 'MS-EL-01-02']);
  s.eq('breadcrumb up the chain', L().crumbs.map((c) => c.label), ['Electrolyzer', 'Tera component lock']);
  s.click('Tera component lock', { within: 'Where this sits' });
  s.eq('a crumb navigates (stacked)', [L().title, sheets().length], ['Tera component lock', 2]);
  s.click('Back', { within: 'Editor', tag: 'button' });
  s.eq('Back returns', L().title, 'Tera design freeze');
  closeSheets();
  menu('HP6-12', 'Show lineage');
  s.eq('model crumbs', L().crumbs.map((c) => c.label), ['Fuel Cell', 'HP membrane']);
  closeSheets();
});
fresh();
s.step('Lineage: the structure below (KRs, workstreams and SG gates, model details)', () => {
  go('Structure');
  s.click(byId('objectives', 'OBJ-EL-2026Q4-01').statement, { within: 'Initiatives' });
  const doc = D().docs['EXEC-DIV-EL'];
  const krs = doc.keyResults.filter((k) => k.objectiveId === 'OBJ-EL-2026Q4-01').map((k) => 'Key result ' + k.statement);
  const sets = (doc.stageGateSets || []).filter((x) => x.objectiveId === 'OBJ-EL-2026Q4-01').sort((a, b) => ((a.order || 0) - (b.order || 0)) || String(a.name).localeCompare(String(b.name)));
  const exp = krs.slice();
  sets.forEach((st, gi) => { const gs = doc.stageGates.filter((g) => g.setId === st.id).sort((a, b) => (a.plannedDate - b.plannedDate) || String(a.name).localeCompare(String(b.name))); if (!gs.length) return; exp.push('Workstream ' + st.name); gs.forEach((g, i) => exp.push('SG-' + String.fromCharCode(65 + gi) + (i + 1) + ' ' + g.name)); });
  s.eq('KR rows, then each workstream with SG-A1… gates', L().rows.map((r) => r.tag + ' ' + r.label), exp);
  closeSheets();
  menu('Tera stack', 'Show lineage');
  const mrow = L().rows.find((r) => r.tag === 'Model');
  const meta = D().spec['SPEC-DIV-EL'].modelSpec['MDL-EL-1-1'].maturity;
  s.eq('model details: maturity, conformance, sub-products, used in', mrow.sub, meta + ', ' + Math.round(RD.objectiveScore('MDL-EL-1-1', D().spec)) + '% conformance, used in 1 model');
  closeSheets();
  menu('Electrolyzer', 'Show lineage');
  s.eq('division: its initiatives and products', L().rows.filter((r) => r.pad === 'padding-left: 12px').map((r) => r.tag + ' ' + r.label), ['Initiative Tera component lock', 'Initiative Stack cost-down', 'Product Tera stack', 'Product Tera system']);
  s.click('Collapse Tera component lock', { within: 'Editor' });
  s.ok(!L().rows.some((r) => r.label === 'Tera design freeze'), 'collapsible');
  closeSheets();
  s.c.mutate((DD) => { delete DD.docs['BIZ-DIV-PT']; DD.portfolio.initiatives.push({ id: 'INIT-PT-01', name: 'Partner program', divisionId: 'DIV-PT' }); DD.portfolio.objectives.push({ id: 'OBJ-PT-2026Q4-01', statement: 'Sign two partners', divisionId: 'DIV-PT', initiativeId: 'INIT-PT-01', quarter: '2026Q4', owner: [], milestoneIds: [] }); }, { quiet: true }); s.render();
  menu('Sign two partners', 'Show lineage');
  s.ok(s.see('No execution document is loaded for this division.'), 'no exec doc message');
  closeSheets();
  menu('Electrolyzer', 'Show lineage');
  closeSheets();
  s.c.mutate((DD) => { DD.portfolio.objectives.push({ id: 'OBJ-EL-2026Q4-07', statement: 'Scope a 20-cell stack', divisionId: 'DIV-EL', initiativeId: 'INIT-EL-02', quarter: '2026Q4', owner: [], milestoneIds: [] }); }, { quiet: true }); s.render();
  menu('Scope a 20-cell stack', 'Show lineage');
  s.ok(s.see('No key results or stage-gates yet.'), 'no KRs or gates message when its doc has none');
  closeSheets();
  menu('First pilot energized', 'Show lineage');
  s.ok(L().empty && s.see('Nothing is planned under this yet.'), 'nothing below');
  closeSheets();
});
fresh();
s.step('Lineage: related groups with tags and counts', () => {
  go('Structure');
  menu('Tera design freeze', 'Show lineage');
  s.eq('objectives linking a milestone', L().groups.map((g) => g.title + ': ' + g.items.map((i) => i.tag + ' ' + i.name).join(', ')), ['Objectives linking this: ' + P().objectives.filter((o) => (o.milestoneIds || []).indexOf('MS-EL-01-02') >= 0).map((o) => 'Objective ' + o.statement).join(', ')]);
  closeSheets();
  menu('Tera 25-30-R5', 'Show lineage');
  s.eq('model groups', L().groups.map((g) => g.title), ['Initiatives classified here', 'Used in']);
  s.eq('used in: product, model and division', L().groups[1].items.map((i) => i.name + ' | ' + i.sub), ['Tera system, Tera 250 kW skid | Electrolyzer']);
  closeSheets();
  menu('Tera 250 kW skid', 'Show lineage');
  s.eq('composed of', L().groups.map((g) => g.title), ['Composed of']);
  closeSheets();
  menu('Tera component lock', 'Show lineage');
  s.eq('initiative classification', L().groups.map((g) => g.title + ': ' + g.items.map((i) => i.tag + ' ' + i.name).join(', ')), ['Classification: Model Tera 25-30-R5']);
  closeSheets();
  menu('Electrolyzer', 'Show lineage');
  s.eq('counts on rows: products, initiatives, objectives', L().rows.find((r) => r.label === 'Stack cost-down').sub, '1 milestone, 1 objective');
  closeSheets();
  menu(byId('objectives', 'OBJ-EL-2026Q4-02').statement, 'Show lineage');
  s.eq('objective groups', L().groups.map((g) => g.title), ['Linked milestones']);
  closeSheets();
});
fresh();
s.step('Lineage: Edit this (hidden in read-only)', () => {
  go('Structure');
  menu('Tera stack', 'Show lineage');
  s.click('Edit product');
  s.eq('opens the editor', [top().kind, top().data.id], ['ped.edit', 'PRD-EL-1']);
  closeSheets();
  s.c.setState({ ro: true }); s.render();
  menu('Tera stack', 'Show lineage');
  s.ok(!s.has('Edit product'), 'hidden in read-only');
  NS.PED.open(s.c, s.c.ctx, 'product', 'PRD-EL-1'); s.render();
  s.eq('and refused in code', top().kind, 'ped.lineage');
  closeSheets();
});

/* ================================================================= GANTT */
/* today's renderGantt (L2612-2891) ported: geometry and the tree. Deliberate Calm changes applied:
   the cascade without paused milestones (bug 8), objective-less initiatives judged by the filters and
   Active only (bug 7), a quarter tag counts anywhere in a multi-quarter window, units and divisions by
   Order, an initiative with no planned end shows no slip (bug 13). */
function refGantt(o) {
  o = o || {};
  const PP = P(), e = em(), td = TODAY, c = casc();
  const f = o.f || {}, anyFilter = anyF(f), activeOnly = !!o.activeOnly, showPaused = !!o.showPaused, qWin = o.qWin || null;
  const objById = {}; PP.objectives.forEach((x) => { objById[x.id] = x; });
  const objEnd = (x) => (x ? RD.objectiveEndState((docOf(x.divisionId) || {}).objectiveState, x.id) : null);
  const gatesOf = (x) => ((docOf(x.divisionId) || {}).stageGates || []).filter((g) => g.objectiveId === x.id);
  const pfGate = (g) => (g.actualDate != null ? g.actualDate : Math.max(g.plannedDate, td));
  const paused = (m) => RD.milestonePaused(PP.milestoneState, m.id);
  const gateDisplayEff = (g) => { const st = RD.classifyGate(g, td), dn = st === 'passed' || st === 'passed-late'; if (!dn) { const oe = objEnd(objById[g.objectiveId]); if (oe) return g.plannedDate; } const ge = c.gateEffective[g.id]; return ge != null ? ge : (g.plannedDate == null ? null : pfGate(g)); };
  const groupGates = (doc, objId) => { const byDue = (a, b) => { const pa = a.plannedDate == null ? Infinity : a.plannedDate, pb = b.plannedDate == null ? Infinity : b.plannedDate; return (pa - pb) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)); }; const gates = ((doc && doc.stageGates) || []).filter((g) => g.objectiveId === objId); const sets = ((doc && doc.stageGateSets) || []).filter((x) => x.objectiveId === objId).slice().sort((a, b) => ((a.order || 0) - (b.order || 0)) || String(a.name || '').localeCompare(String(b.name || ''))); const groups = sets.map((st) => ({ set: st, gates: gates.filter((g) => g.setId === st.id).slice().sort(byDue) })); const valid = {}; sets.forEach((st) => { valid[st.id] = 1; }); const orph = gates.filter((g) => !valid[g.setId]).slice().sort(byDue); if (orph.length) groups.push({ set: { id: '__ung__:' + objId, name: 'Ungrouped' }, gates: orph }); return groups; };
  const fin = (v) => typeof v === 'number' && isFinite(v);
  function geom(entity, r) {
    if (entity === 'stagegate') return { kind: 'diamond', gate: true, planned: r.plannedDate, eff: gateDisplayEff(r), baseline: r.baselineDate != null ? r.baselineDate : null, slipped: !!(c.gateSlipped && c.gateSlipped[r.id]), state: RD.classifyGate(r, td) };
    if (entity === 'stagegateset') { const gts = r.__gates || []; const pl = gts.map((g) => g.plannedDate).filter((v) => v != null); const ef = gts.map(gateDisplayEff).filter((v) => v != null); const ob = objById[r.objectiveId]; const ods = ob ? geom('objective', ob).ds : null; const ds = ods != null ? ods : (pl.length ? Math.min.apply(null, pl) : null); const de = ef.length ? Math.max.apply(null, ef) : ds; return { kind: 'bar', set: true, ds: ds, de: de, pe: null, slip: 0, derived: false }; }
    if (entity === 'milestone') return { kind: 'diamond', planned: r.plannedDate, eff: c.milestoneEffective[r.id], actual: r.completedDate };
    if (entity === 'mstep') { const d = r.day; return { kind: 'diamond', planned: d, eff: d, actual: r.status === 'done' ? d : null }; }
    if (entity === 'milestonekr') { const ds = r.__steps.map((st) => st.day).filter((v) => v != null); const hi = ds.length ? Math.max.apply(null, ds) : null; return { kind: 'bar', ds: ds.length ? Math.min.apply(null, ds) : null, de: hi, pe: hi, slip: 0, derived: true }; }
    if (entity === 'board') { let lo = null, hi = null; (r.tiles || []).forEach((t) => { RD.gateDueDates(r.columns, (r.swimlanes || []).find((l) => l.id === t.lane), t).due.forEach((is) => { const d = is ? dayOf(is) : null; if (d != null) { lo = lo == null || d < lo ? d : lo; hi = hi == null || d > hi ? d : hi; } }); const sd = t.startDate ? dayOf(t.startDate) : null; if (sd != null) lo = lo == null || sd < lo ? sd : lo; }); return { kind: 'bar', ds: lo, de: hi, pe: hi, slip: 0, derived: true }; }
    if (entity === 'boardtile') { const b = r.__board; const dd = RD.gateDueDates(b.columns, (b.swimlanes || []).find((l) => l.id === r.lane), r).due.map((is) => (is ? dayOf(is) : null)); const sd = r.startDate ? dayOf(r.startDate) : null; const lo = sd != null ? sd : (dd.filter((v) => v != null)[0] || null); const hi = dd.filter((v) => v != null).slice(-1)[0] || null; return { kind: 'bar', ds: lo, de: hi, pe: hi, slip: 0, derived: true }; }
    if (entity === 'objective') {
      const starts = gatesOf(r).map((g) => g.plannedDate).filter((v) => v != null);
      const peRaw = c.objectiveProjectedEnd[r.id], pe = (peRaw != null && peRaw > 0) ? peRaw : null;
      const ds = r.plannedStart != null ? r.plannedStart : (starts.length ? Math.min.apply(null, starts) : null);
      const de = r.plannedEnd != null ? r.plannedEnd : pe;
      const oe = objEnd(r);
      if (oe && oe.endedDay != null) { const over = r.plannedEnd != null ? oe.endedDay - r.plannedEnd : 0; return { kind: 'bar', ds: ds, de: r.plannedEnd != null ? Math.min(r.plannedEnd, oe.endedDay) : oe.endedDay, pe: oe.endedDay, slip: over > 7 ? over : 0, derived: r.plannedStart == null || r.plannedEnd == null }; }
      return { kind: 'bar', ds: ds, de: de, pe: pe, slip: r.plannedEnd != null ? Math.max(0, (pe != null ? pe : r.plannedEnd) - r.plannedEnd) : 0, derived: r.plannedStart == null || r.plannedEnd == null };
    }
    if (entity === 'initiative') {
      const objs = PP.objectives.filter((x) => x.initiativeId === r.id), mils = PP.milestones.filter((m) => m.initiativeId === r.id && !paused(m));
      const starts = []; objs.forEach((x) => { const g = geom('objective', x); if (g.ds != null) starts.push(g.ds); }); mils.forEach((m) => { if (m.plannedDate != null) starts.push(m.plannedDate); });
      const peRaw = c.initiativeProjectedEnd[r.id], pe = (fin(peRaw) && peRaw > 0) ? peRaw : null;
      const hasKpis = (PP.kpis || []).some((k) => k.hostType === 'initiative' && k.hostId === r.id);
      let kidEnd = null;
      if (!hasKpis && objs.length) { const cands = []; const eds = objs.map((x) => { const es = objEnd(x); return es && es.endedDay != null ? es.endedDay : null; }); if (eds.every((v) => v != null)) cands.push(Math.max.apply(null, eds)); const gE = []; objs.forEach((x) => { const gs = gatesOf(x); if (gs.length) gs.forEach((g) => { const v = gateDisplayEff(g); if (v != null) gE.push(v); }); else { const og = geom('objective', x); if (og.de != null) gE.push(og.de); } }); if (gE.length) cands.push(Math.max.apply(null, gE)); if (cands.length) kidEnd = Math.min.apply(null, cands); }
      const ds = r.plannedStart != null ? r.plannedStart : (starts.length ? Math.min.apply(null, starts) : null);
      const base = r.plannedEnd != null ? r.plannedEnd : pe;
      const de = kidEnd != null ? (base != null ? Math.min(base, kidEnd) : kidEnd) : base;
      const cs = c.longTermSlip[r.id];
      const slip = (kidEnd != null && base != null) ? Math.max(0, kidEnd - base) : (r.plannedEnd != null && fin(cs) ? Math.max(0, cs) : 0);
      return { kind: 'bar', ds: ds, de: de, pe: kidEnd != null ? kidEnd : pe, slip: slip, derived: r.plannedStart == null || r.plannedEnd == null };
    }
    const gs = PP.initiatives.filter((i) => i.divisionId === r.id).map((i) => geom('initiative', i));
    const st = gs.map((g) => g.ds).filter((v) => v != null), en = gs.map((g) => (g.pe != null ? g.pe : g.de)).filter((v) => v != null);
    const ds = st.length ? Math.min.apply(null, st) : null, de = en.length ? Math.max.apply(null, en) : null;
    return { kind: 'bar', ds: ds, de: de, pe: de, slip: 0, derived: true };
  }
  const steps = (kr) => { const isoK = Object.assign({}, kr, { steps: (kr.steps || []).map((x) => Object.assign({}, x, { due: typeof x.due === 'number' ? iso(x.due) : (x.due || '') })) }); return RD.milestoneGanttSteps(isoK, iso(td)).map((st) => Object.assign({}, st, { day: st.due ? dayOf(st.due) : null })); };
  const childRefs = (entity, r) => {
    if (entity === 'division') return PP.initiatives.filter((i) => i.divisionId === r.id).map((i) => ({ entity: 'initiative', rec: i }));
    if (entity === 'initiative') return PP.milestones.filter((m) => m.initiativeId === r.id).map((m) => ({ entity: 'milestone', rec: m })).concat(PP.objectives.filter((x) => x.initiativeId === r.id).map((x) => ({ entity: 'objective', rec: x })));
    if (entity === 'objective') {
      const doc = docOf(r.divisionId) || {};
      const grps = groupGates(doc, r.id).filter((g) => g.gates.length);
      let out = grps.length === 1 ? grps[0].gates.map((g) => ({ entity: 'stagegate', rec: g })) : grps.map((g) => ({ entity: 'stagegateset', rec: { id: g.set.id, name: g.set.name, objectiveId: r.id, __gates: g.gates } }));
      (doc.keyResults || []).filter((k) => k.objectiveId === r.id).forEach((k) => { if (k.trackingType === 'milestone') { const stp = steps(k); if (stp.length) out.push({ entity: 'milestonekr', rec: Object.assign({ __steps: stp }, k) }); } });
      (doc.boards || []).filter((b) => b.objectiveId === r.id).forEach((b) => out.push({ entity: 'board', rec: b }));
      return out;
    }
    if (entity === 'stagegateset') return r.__gates.map((g) => ({ entity: 'stagegate', rec: g }));
    if (entity === 'milestonekr') return r.__steps.map((st) => ({ entity: 'mstep', rec: Object.assign({ __krId: r.id }, st) }));
    if (entity === 'board') return (r.tiles || []).map((t) => ({ entity: 'boardtile', rec: Object.assign({ __board: r }, t) }));
    return [];
  };
  const visible = (g) => (g.kind === 'bar' ? g.ds != null && g.de != null : g.planned != null);
  const objInWin = (r, g) => { if (!qWin) return true; if (r.quarter && qWin.span.indexOf(r.quarter) >= 0) return true; if (g.kind !== 'bar') return true; if (g.ds == null || g.de == null) return false; return Math.min(g.de, qWin.qhi) - Math.max(g.ds, qWin.qlo) + 1 >= 7; };
  const barInWin = (g) => { if (!qWin) return true; if (g.ds == null || g.de == null) return false; return Math.min(g.de, qWin.qhi) - Math.max(g.ds, qWin.qlo) + 1 >= 7; };
  const ptInWin = (g) => { if (!qWin) return true; return [g.planned, g.eff, g.actual].filter((v) => v != null).some((v) => v >= qWin.lo && v <= qWin.hi); };
  const nm = (r) => r.name || r.statement || r.id;
  const objEndCmp = (a, b) => { const ae = a.g.de == null ? Infinity : a.g.de, be = b.g.de == null ? Infinity : b.g.de; if (ae !== be) return ae - be; return String(nm(a.rec)).localeCompare(String(nm(b.rec))); };
  const sortObjKids = (kids) => { const os = kids.filter((k) => k.entity === 'objective'); if (os.length < 2) return; os.sort(objEndCmp); let i = 0; for (let j = 0; j < kids.length; j++) if (kids[j].entity === 'objective') kids[j] = os[i++]; };
  const keyOf = (entity, r) => (entity === 'mstep' ? 'mstep:' + r.__krId + '/' + r.id : entity === 'boardtile' ? 'boardtile:' + r.__board.id + '/' + r.id : entity + ':' + r.id);
  function build(entity, r) {
    if (entity === 'objective' && anyFilter && !objMatches(r, f)) return null;
    if (entity === 'objective' && activeOnly && !isActiveObjective(r)) return null;
    const g = geom(entity, r); if (!visible(g)) return null;
    if (entity === 'objective' && !objInWin(r, g)) return null;
    if (entity === 'milestone' && paused(r) && !showPaused) return null;
    if ((entity === 'milestone' || entity === 'stagegate') && !ptInWin(g)) return null;
    const kids = []; childRefs(entity, r).forEach((x) => { const n = build(x.entity, x.rec); if (n) kids.push(n); });
    sortObjKids(kids);
    if ((anyFilter || activeOnly || qWin) && (entity === 'division' || entity === 'initiative') && !kids.some((k) => k.entity === 'objective' || k.entity === 'initiative')) {
      const standalone = entity === 'initiative' && !PP.objectives.some((x) => x.initiativeId === r.id) && barInWin(g) && (!anyFilter || initOwnMatches(r, f)) && (!activeOnly || (r.plannedStart != null && r.plannedEnd != null && r.plannedStart <= td && td <= r.plannedEnd));
      if (!standalone) return null;
    }
    return { entity: entity, rec: r, g: g, kids: kids, key: keyOf(entity, r) };
  }
  const grp = o.grp || { mode: 'hierarchy', dims: [] };
  let roots = [];
  if (grp.mode === 'custom' && grp.dims.length) {
    const gobjs = PP.objectives.filter((x) => !anyFilter || objMatches(x, f));
    const groupRoots = (nodes, keyPrefix) => { const out = []; nodes.forEach((n) => { const key = keyPrefix + '/' + n.dim + ':' + n.key; if (n.key === '') { (n.children ? groupRoots(n.children, keyPrefix) : n.objs.map((x) => build('objective', x)).filter(Boolean).sort(objEndCmp)).forEach((k) => out.push(k)); return; } const kids = n.children ? groupRoots(n.children, key) : n.objs.map((x) => build('objective', x)).filter(Boolean).sort(objEndCmp); if (!kids.length) return; out.push({ synthetic: true, key: 'grp:' + key, kids: kids }); }); return out; };
    roots = groupRoots(RD.groupObjectives(gobjs, grp.dims, PP), '');
  } else if (grp.mode === 'custom') {
    roots = PP.objectives.filter((x) => !anyFilter || objMatches(x, f)).map((x) => build('objective', x)).filter(Boolean).sort(objEndCmp);
  } else {
    const units = byOrd(PP.units || []), byUnit = {}, buckets = [];
    units.forEach((u) => { const b = { unit: u, divs: [] }; byUnit[u.id] = b; buckets.push(b); });
    const un = { unit: null, divs: [] };
    byOrd(PP.divisions).forEach((d) => { (d.unitId && byUnit[d.unitId] ? byUnit[d.unitId] : un).divs.push(d); });
    buckets.push(un);
    buckets.forEach((b) => { const kids = b.divs.map((d) => build('division', d)).filter(Boolean); if (kids.length) roots.push({ synthetic: true, key: 'grp:unit:' + (b.unit ? b.unit.id : '__none__'), kids: kids }); });
  }
  return roots;
}
/* compare Calm's tree (the model of the last render) with the reference, node by node */
const calmModel = () => s.c._memo && s.c._memo['pgt.model'];
function sameGantt(label, opts) {
  const ref = refGantt(opts), M = calmModel();
  const flat = (list, out) => { list.forEach((n) => { out.push(n); flat(n.kids, out); }); return out; };
  const a = flat(M.roots, []), b = flat(ref, []);
  s.eq(label + ': same rows in the same order', a.map((n) => n.key), b.map((n) => n.key));
  /* a Kanban tile's projected end equals its end and draws nothing, so tiles compare on their span */
  const geo = (n) => (n.synthetic ? null : n.entity === 'boardtile' ? [n.g.ds, n.g.de] : n.g.kind === 'bar' ? [n.g.ds, n.g.de, n.g.pe, n.g.slip, !!n.g.derived] : [n.g.planned, n.g.eff, n.g.actual == null ? null : n.g.actual, n.g.gate ? n.g.state : '', n.g.gate ? !!n.g.slipped : '']);
  const bad = [];
  b.forEach((n, i) => { if (a[i] && a[i].key === n.key && JSON.stringify(geo(a[i])) !== JSON.stringify(geo(n))) bad.push(n.key + ' calm ' + JSON.stringify(geo(a[i])) + ' today ' + JSON.stringify(geo(n))); });
  s.eq(label + ': same geometry (start, end, projected, slip, inferred; markers)', bad, []);
}
const ganttState = (patch) => { s.c.setState(patch); s.render(); };
const qWinOf = (qs) => { const r = RD.quarterSpanRange(qs); const a = dayOf(r.start), b = dayOf(r.end); return { qlo: a, qhi: b, lo: a - 7, hi: b + 7, span: RD.quarterSpan(qs) }; };

fresh();
s.step('Gantt: bars, markers and rows match today\'s rules (hierarchy, custom, flat; filters, active, timeframe, paused)', () => {
  go('Gantt');
  sameGantt('sample', {});
  ganttState({ pg_showPaused: true });
  sameGantt('paused shown', { showPaused: true });
  ganttState({ pg_showPaused: false, pg_active: true });
  sameGantt('active only', { activeOnly: true });
  ganttState({ pg_active: false, pg_timeframe: true, pg_quarters: [] });
  sameGantt('timeframe: current quarter', { qWin: qWinOf([QNOW]) });
  ganttState({ pg_quarters: ['2026Q3', '2027Q1'] });
  sameGantt('timeframe: Q3 2026 to Q1 2027', { qWin: qWinOf(['2026Q3', '2027Q1']) });
  ganttState({ pg_quarters: ['2027Q1'] });
  sameGantt('timeframe: Q1 2027', { qWin: qWinOf(['2027Q1']) });
  ganttState({ pg_timeframe: false });
  [{ division: 'DIV-EL' }, { product: 'PRD-FC-1' }, { quarter: '2027Q1' }, { status: 'off-track' }, { unit: 'UNIT-BUSINE' }].forEach((f) => { applyF(f); sameGantt('filter ' + JSON.stringify(f), { f: f }); });
  clearFilters();
  [['division'], ['owner'], ['product', 'model'], ['quarter', 'initiative'], ['unit', 'division']].forEach((dims) => { ganttState({ group: { mode: 'custom', dims: dims } }); sameGantt('custom ' + dims.join(' > '), { grp: { mode: 'custom', dims: dims } }); });
  ganttState({ group: { mode: 'custom', dims: [] } });
  sameGantt('flat list', { grp: { mode: 'custom', dims: [] } });
  ganttState({ group: { mode: 'hierarchy', dims: ['division'] }, pg_active: true, pg_timeframe: true, pg_quarters: ['2026Q4'] });
  applyF({ unit: 'UNIT-TECHNI' });
  sameGantt('active + timeframe + unit filter', { activeOnly: true, qWin: qWinOf(['2026Q4']), f: { unit: 'UNIT-TECHNI' } });
  clearFilters();
});
fresh();
s.step('Gantt: harder data (slips, ended objectives, inferred dates, cancelled gates, a paused milestone that pushed its initiative, no planned end)', () => {
  s.c.mutate((DD) => {
    const PP = DD.portfolio;
    PP.initiatives.find((i) => i.id === 'INIT-EL-01').plannedEnd = 2520;                 // slips
    PP.objectives.find((x) => x.id === 'OBJ-FC-2026Q4-03').plannedStart = null;          // dates inferred
    PP.milestones.find((m) => m.id === 'MS-FC-01-02').plannedDate = 2700;                // pushes INIT-FC-01 ...
    PP.milestoneState.push({ milestoneId: 'MS-FC-01-02', status: 'paused', day: 2470, note: '' }); // ... until paused
    PP.initiatives.find((i) => i.id === 'INIT-FC-02').plannedEnd = null;                 // no planned end
    DD.docs['EXEC-DIV-EL'].objectiveState.push({ objectiveId: 'OBJ-EL-2026Q4-02', status: 'abandoned', endedDay: 2530, note: '' }); // ended late: missed gates
    DD.docs['EXEC-DIV-FC'].objectiveState.push({ objectiveId: 'OBJ-FC-2026Q4-02', status: 'achieved', endedDay: 2500, note: '' });  // ended early: cancelled gates
    PP.initiatives.push({ id: 'INIT-FC-03', name: 'Membrane recycling study', divisionId: 'DIV-FC', productId: 'PRD-FC-1', plannedStart: 2470, plannedEnd: 2600, order: 3 });
  }, { quiet: true });
  s.render();
  go('Gantt');
  sameGantt('harder data', {});
  ganttState({ pg_showPaused: true });
  sameGantt('harder data, paused shown', { showPaused: true });
  s.ok(!calmModel().roots.some(function w(n) { return (n.g && n.g.slip > 400) || n.kids.some(w); }), 'no 2020-based slip anywhere (fixed bug 13)');
  s.clean('harder gantt');
});
fresh();
s.step('Gantt: Collapse to levels and Expand all', () => {
  go('Gantt');
  s.eq('hierarchy levels', s.vals.pgt.levels.map((l) => l.label), ['Units', 'Divisions', 'Initiatives', 'Objectives']);
  s.click('Divisions', { within: 'Collapse to' });
  const vis = () => s.vals.pgt.rows.map((r) => r.key);
  s.eq('folds to the division level (ancestors open)', vis().filter((k) => !/^grp:/.test(k)).every((k) => /^division:/.test(k)), true);
  s.click('Initiatives', { within: 'Collapse to' });
  s.ok(vis().some((k) => /^initiative:/.test(k)) && !vis().some((k) => /^objective:/.test(k)), 'initiatives, nothing below');
  s.click('Objectives', { within: 'Collapse to' });
  s.ok(vis().some((k) => /^objective:/.test(k)) && !vis().some((k) => /^stagegate/.test(k)), 'objectives, gates hidden');
  s.click('Units', { within: 'Collapse to' });
  s.eq('units only', vis(), ['grp:unit:UNIT-TECHNI', 'grp:unit:UNIT-BUSINE']);
  s.click('Expand all');
  s.ok(vis().some((k) => /^boardtile:/.test(k)), 'Expand all opens everything, boards too');
  s.c.setState({ group: { mode: 'custom', dims: ['product', 'quarter'] } }); s.render();
  s.eq('custom levels are named (fixed bug 3)', s.vals.pgt.levels.map((l) => l.label), ['Products', 'Quarters', 'Objectives']);
  s.click('Products', { within: 'Collapse to' });
  s.ok(vis().some((k) => /^grp:\/product:/.test(k)) && !vis().some((k) => /^grp:\/product:[^/]+\/quarter:/.test(k)), 'folds the product groups; their quarter groups are hidden (objectives with no product sit above, open)');
});
fresh();
s.step('Gantt: Active only, N paused (saved), Timeframe', () => {
  go('Gantt');
  s.eq('Active only tooltip', s.all('Active only')[0].attrs.title, 'Hide completed work and anything outside its planned window. An initiative disappears once none of its objectives are active.');
  s.eq('paused count', s.vals.pgt.pausedLabel, RD.pausedMilestoneIds(P().milestoneState, P().milestones).length + ' paused');
  s.ok(/^Limit the chart to the quarters selected below/.test(s.all('Timeframe')[0].attrs.title), 'Timeframe tooltip');
  s.c.mutate((DD) => { DD.portfolio.milestoneState.push({ milestoneId: 'MS-EL-02-01', status: 'active', day: 2477, note: '' }); }, { quiet: true }); s.render();
  s.ok(!s.vals.pgt.hasPaused, 'no paused milestones: no button');
});
fresh();
s.step('Gantt: the timeframe grid', () => {
  go('Gantt');
  const yrs = () => s.vals.pgt.years;
  s.eq('years the plan touches, with the current year', yrs().map((y) => y.label), ['2026', '2027']);
  s.eq('current quarter underlined and selected by default', yrs()[0].qs.map((q) => q.cls), ['pgt-q', 'pgt-q', 'pgt-q', 'pgt-q on now']);
  s.ok(s.vals.pgt.tfHintOff && s.see('Turn on Timeframe to limit the chart to these quarters.'), 'hint while off');
  s.click('Q2 2027');
  s.eq('a click turns Timeframe on and adds the quarter', [s.c.state.pg_timeframe, s.c.state.pg_quarters], [true, ['2026Q4', '2027Q2']]);
  s.eq('the quarter in between is spanned', yrs()[1].qs[0].cls, 'pgt-q imp');
  s.eq('spanned tooltip', yrs()[1].qs[0].title, 'Spanned by your selection. Click to select it explicitly.');
  s.eq('range label', s.vals.pgt.rangeLabel, 'Q4 2026 to Q2 2027');
  s.click('Select all of 2027');
  s.eq('a year fills its four quarters', s.c.state.pg_quarters, ['2026Q4', '2027Q1', '2027Q2', '2027Q3', '2027Q4']);
  s.click('Clear 2027');
  s.eq('a full year clears', s.c.state.pg_quarters, ['2026Q4']);
  s.click('Clear');
  s.ok(s.vals.pgt.tfHintNone && s.see('Nothing selected, so the chart shows the current quarter.'), 'empty selection falls back to the current quarter');
  s.eq('axis pinned to the window plus a week', [s.vals.pgt.lo, s.vals.pgt.hi], [qWinOf([QNOW]).lo, qWinOf([QNOW]).hi]);
  s.c.mutate((DD) => { DD.portfolio.initiatives.find((i) => i.id === 'INIT-FC-02').plannedEnd = dayOf('2029-03-31'); DD.portfolio.milestones.find((m) => m.id === 'MS-FC-01-02').plannedDate = dayOf('2028-06-01'); }, { quiet: true }); s.render();
  s.eq('at most three years, anchored on this year (milestone dates count: fixed)', yrs().map((y) => y.label), ['2026', '2027', '2028']);
});
fresh();
s.step('Gantt: axis, gridlines, today line', () => {
  go('Gantt');
  const v = s.vals.pgt;
  s.ok(v.axis.some((a) => a.cls === 'pgt-ql' && a.text === 'Q4 2026'), 'quarter labels');
  s.ok(v.axis.some((a) => a.cls === 'pgt-ml'), 'month labels (shown from 1100 px by CSS)');
  s.ok(v.grid.some((g) => g.cls === 'pgt-gq') && v.grid.some((g) => g.cls === 'pgt-gm'), 'quarter and month gridlines');
  s.eq('today line', [v.todayIn, v.todayLabel], [true, 'Today, Oct 13']);
  const lo = v.lo, hi = v.hi;
  s.eq('today at its place on the track', v.todayStyle, 'left: ' + Math.round((TODAY - lo) / (hi - lo) * 100 * 1000) / 1000 + '%');
  const css = require('fs').readFileSync(path.join(__dirname, '..', 'mods', 'pgt', 'mod.css'), 'utf8');
  s.ok(/1100px/.test(css), 'month labels hide below 1100 px (read)');
});
fresh();
s.step('Gantt: resizable name column (140 to 640, double-click resets)', () => {
  go('Gantt');
  const grip = () => s.find('Drag to resize the name column', { handler: 'onPointerDown' });
  s.fire(grip(), 'onPointerDown', { clientX: 100 });
  s.fire(grip(), 'onPointerMove', { clientX: 1000 });
  s.eq('clamped at 640', s.c.state.pg_labelw, 640);
  s.fire(grip(), 'onPointerMove', { clientX: -1000 });
  s.eq('clamped at 140', s.c.state.pg_labelw, 140);
  s.fire(grip(), 'onPointerUp');
  s.eq('saved', LS.rd_gantt_labelw, '140');
  s.fire(s.find('Drag to resize the name column', { handler: 'onDoubleClick' }), 'onDoubleClick');
  s.eq('double-click: 240', s.c.state.pg_labelw, 240);
  s.ok(/--pg-labelw: 240px/.test(s.vals.pgt.chartStyle), 'one variable moves the column, axis and grid');
  clearLS();
});
fresh();
s.step('Gantt: Unassigned, collapse arrows, boards folded by default', () => {
  s.c.mutate((DD) => { DD.portfolio.divisions.find((d) => d.id === 'DIV-BD').unitId = null; }, { quiet: true }); s.render();
  go('Gantt');
  s.ok(s.vals.pgt.rows.some((r) => r.key === 'grp:unit:__none__' && r.name === 'Unassigned'), 'divisions with no unit under Unassigned');
  s.ok(!s.vals.pgt.rows.some((r) => /^boardtile:/.test(r.key)), 'boards start folded');
  s.click('Expand Component lock');
  s.ok(s.vals.pgt.rows.some((r) => /^boardtile:BRD-EL-LOCK/.test(r.key)), 'a board opens');
  s.click('Collapse Tera component lock');
  s.ok(!s.vals.pgt.rows.some((r) => r.key === 'milestone:MS-EL-01-02'), 'a row folds');
});
fresh();
s.step('Gantt: objectives sorted by end date (milestones keep their slots)', () => {
  s.c.mutate((DD) => { DD.portfolio.objectives.find((x) => x.id === 'OBJ-FC-2026Q3-01').order = 9; DD.portfolio.objectives.find((x) => x.id === 'OBJ-FC-2027Q1-01').order = 0; }, { quiet: true }); s.render();
  go('Gantt');
  const kids = s.vals.pgt.rows.filter((r) => /^(objective|milestone):/.test(r.key) && /padding-left: 54px/.test(r.pad)).map((r) => r.key);
  const fc01 = kids.slice(0, 5);
  s.eq('under Roll-to-roll: milestones first, then objectives by end date (Order ignored)', fc01, ['milestone:MS-FC-01-01', 'milestone:MS-FC-01-02', 'objective:OBJ-FC-2026Q3-01', 'objective:OBJ-FC-2026Q4-01', 'objective:OBJ-FC-2027Q1-01']);
});
fresh();
s.step('Gantt: bars and markers read right (tooltips, ended markers, ghosts, sets)', () => {
  go('Gantt');
  const row = (k) => s.vals.pgt.rows.find((r) => r.key === k);
  s.eq('ended objective: green end marker', row('objective:OBJ-FC-2026Q3-01').shapes.map((x) => x.cls + ' ' + x.title), ['pgt-end achieved Achieved Sep 25']);
  s.eq('gate: passed late with its planned ghost', [row('stagegate:SG-FC-2026Q4-01-2').hit.cls, row('stagegate:SG-FC-2026Q4-01-2').hit.title], ['pgt-mk sq passed-late', 'Passed late, forecast Oct 12, planned Oct 9']);
  s.eq('gate label', row('stagegate:SG-FC-2026Q4-01-2').tag, 'SG-A2');
  s.eq('workstream bar', row('stagegateset:SGSET-FC-2026Q4-01-1').hit.title, 'Workstream, Oct 1 to Nov 9');
  s.eq('milestone: ghost at the plan, marker at the projection', [row('milestone:MS-FC-01-01').hit.title, row('milestone:MS-FC-01-01').shapes.map((x) => x.cls)], ['Projected Dec 18', ['pgt-conn', 'pgt-mk ghost']]);
  s.eq('completed milestone tooltip with its offset', row('milestone:MS-EL-01-01').hit.title, 'Completed Sep 30 (-2 days)');
  s.eq('KR tags', [row('milestonekr:KR-EL-2026Q4-02-2').tag, row('mstep:KR-EL-2026Q4-02-2/ST-1').tag], ['KR', 'KR-M1']);
  s.ok(/^Spec drafted: \d+ of \d+ passed$/.test(row('board:BRD-EL-LOCK').shapes[0].title), 'Kanban: per-column square with a passed count');
  s.ok(row('board:BRD-EL-LOCK').shapes[0].hasTxt, 'the count is drawn on the square');
  s.c.mutate((DD) => { DD.docs['EXEC-DIV-EL'].objectiveState.push({ objectiveId: 'OBJ-EL-2026Q4-01', status: 'abandoned', endedDay: 2480, note: '' }); }, { quiet: true }); s.render();
  s.ok(/cancelled/.test(row('stagegateset:SGSET-EL-2026Q4-01-1').hit.cls), 'a set of an ended objective is hatched cancelled');
  s.eq('an abandoned objective\'s open gates read missed', row('stagegate:SG-EL-2026Q4-01-2').hit.title.split(',')[0], 'Missed');
  s.eq('and its end marker is red', row('objective:OBJ-EL-2026Q4-01').shapes.map((x) => x.cls)[0], 'pgt-end abandoned');
  /* committed date slipped (gate baseline) */
  s.c.mutate((DD) => { const g = DD.docs['EXEC-DIV-FC'].stageGates.find((x) => x.id === 'SG-FC-2026Q4-01-3'); g.baselineDate = 2500; g.plannedDate = 2515; }, { quiet: true }); s.render();
  const c = casc();
  if (c.gateSlipped['SG-FC-2026Q4-01-3']) s.eq('a slipped commitment: red connector and committed ghost', row('stagegate:SG-FC-2026Q4-01-3').shapes.map((x) => x.cls + ' ' + x.title), ['pgt-conn committed Committed Nov 5', 'pgt-mk sq ghost Committed Nov 5']);
  else s.ok(true, 'no slipped commitment in this data');
  /* paused milestone ghost */
  s.c.setState({ pg_showPaused: true }); s.render();
  s.eq('a paused milestone is a ghost at the planned date', [row('milestone:MS-EL-02-01').hit.cls, row('milestone:MS-EL-02-01').hit.title], ['pgt-mk ghost paused', 'Deprioritized, was planned Feb 26, 2027']);
  s.ok(/paused/.test(row('milestone:MS-EL-02-01').cls), 'its row reads dimmed');
});
fresh();
s.step('Gantt: hover actions (edit, add initiative, add objective, add milestone)', () => {
  go('Gantt');
  const acts = (k) => s.vals.pgt.rows.find((r) => r.key === k).acts.map((a) => a.label);
  s.eq('division', acts('division:DIV-EL'), ['Edit division', 'Add initiative here', 'Delete division']);
  s.eq('initiative', acts('initiative:INIT-EL-02'), ['Edit initiative', 'Add objective here', 'Add milestone here', 'Delete initiative']);
  s.eq('objective', acts('objective:OBJ-EL-2027Q1-01'), ['Edit objective', 'Delete objective']);
  s.eq('gates get none (Execution owns them)', acts('stagegate:SG-EL-2026Q4-01-1'), []);
  s.click('Add objective here', { within: 'initiative:INIT-EL-02' });
  s.eq('+obj pre-fills', [top().data.type, draft().initiativeId, draft().divisionId], ['objective', 'INIT-EL-02', 'DIV-EL']);
  closeSheets();
  s.click('Add milestone here', { within: 'initiative:INIT-EL-02' });
  s.eq('+ms pre-fills', [top().data.type, draft().initiativeId], ['milestone', 'INIT-EL-02']);
  closeSheets();
  s.click('Add initiative here', { within: 'division:DIV-EL' });
  s.eq('+init pre-fills', [top().data.type, draft().divisionId], ['initiative', 'DIV-EL']);
  closeSheets();
  s.click('Edit objective', { within: 'objective:OBJ-EL-2027Q1-01' });
  s.eq('edit', [top().data.type, top().data.id], ['objective', 'OBJ-EL-2027Q1-01']);
  closeSheets();
});
s.step('Gantt: names open the lineage', () => {
  s.click('Stack cost-down', { within: 'initiative:INIT-EL-02', tag: 'button' });
  s.eq('lineage', [top().kind, top().data.id], ['ped.lineage', 'INIT-EL-02']);
  closeSheets();
});
fresh();
s.step('Gantt: legend (fixed) and gate legend only with gates on screen', () => {
  go('Gantt');
  ['Planned dates', 'Dates inferred', 'Slip past the planned end', 'Milestone: planned date, then effective date', 'Today'].forEach((t) => s.expect(t));
  s.ok(!s.see('Baseline'), 'no legend entry that matches no bar (fixed bug 17)');
  s.ok(s.vals.pgt.hasGates, 'gate legend shown with gates');
  s.click('Initiatives', { within: 'Collapse to' });
  s.ok(!s.vals.pgt.hasGates, 'and hidden when no gate is on screen');
});
fresh();
s.step('Gantt: empty messages', () => {
  go('Gantt');
  applyF({ division: 'DIV-NOPE' });
  s.ok(s.see('No matching items to chart.'), 'filtered empty');
  clearFilters();
  s.c.mutate((DD) => { DD.portfolio.initiatives = []; DD.portfolio.objectives = []; DD.portfolio.milestones = []; }, { quiet: true }); s.render();
  s.ok(s.see('No scheduled, dated items to chart.'), 'nothing dated');
});

/* ============================================================== SETTINGS */
fresh();
s.step('Settings: broker token field, Save token, status line', () => {
  openSettings();
  s.expect('Broker');
  s.ok(s.all('Paste token')[0].attrs.type === 'password', 'password field');
  s.type('Broker token', '  tok-2  ');
  s.click('Save token');
  s.eq('saved trimmed', s.c.state.bk.token, 'tok-2');
  s.ok(hasToast('Token saved.') && hasToast('Loaded portfolio + 4 exec + 2 spec docs.'), 'Token saved., then the load');
  s.expect('Token set. Live sync active.');
  s.type('Broker token', '');
  s.click('Save token');
  s.expect('No token set — running on local scratch data.');
});

/* ======================================================= COMPUTED VALUES */
fresh();
s.step('Computed: bands (80 / 65), KPI formulas, statistics and the sample discount, best source', () => {
  s.eq('bands', [RD.band(80), RD.band(79.9), RD.band(65), RD.band(64.9), RD.band(null)], ['on-track', 'at-risk', 'at-risk', 'off-track', 'no-band']);
  go('Structure');
  s.eq('every objective row reads the engine\'s band', s.vals.pst.h.inits.filter((r) => r.isObj).map((r) => r.stWord), s.vals.pst.h.inits.filter((r) => r.isObj).map((r) => bandWord(nodeBand('objective', r.id))));
  go('Overview');
  /* the statistical target on INIT-FC-01: average of the readings, discounted by readings / expected */
  const k = byId('kpis', 'KPI-FC-01-1'), e = em(), pool = poolOf(e);
  const reads = P().kpiUpdates.filter((u) => u.kpiId === k.id).map((u) => u.value);
  const avg = reads.reduce((a, b) => a + b, 0) / reads.length;
  const exp = Math.min(100, 100 * avg / k.target) * Math.min(reads.length, k.readCount) / k.readCount;
  s.eq('average of the batch, x min(n, expected) / expected', Math.round(RD.kpiScoreResolved(k, pool, e) * 1000), Math.round(exp * 1000));
  go('Structure');
  menu('Roll-to-roll membrane scale-up', 'Edit');
  s.eq('shown score', s.vals.ped.edit.targets.rows.find((r) => r.name === 'Line yield').score, sc(exp));
  closeSheets();
  /* decrease: met when value <= target */
  const kd = byId('kpis', 'KPI-EL-01-02-1');
  s.eq('decrease target met at or under', RD.kpiScoreResolved(kd, pool, e), 100);
});
s.step('Computed: KR, gate, milestone and objective scores', () => {
  const e = em();
  go('Overview');
  const t = s.vals.pov.groups[1].blocks[0].objs.find((x) => x.id === 'OBJ-EL-2026Q4-01');
  const krs = D().docs['EXEC-DIV-EL'].keyResults.filter((k) => k.objectiveId === 'OBJ-EL-2026Q4-01');
  const ks = krs.map((k) => RD.keyResultScore(k.id, e));
  const objScore = ks.some((v) => v != null) ? ks.map((v) => (v == null ? 0 : v)).reduce((a, b) => a + b, 0) / ks.length : null;
  s.eq('objective = mean of its KR scores (unscored KRs count 0)', t.score, sc(objScore));
  s.eq('milestone score = mean of its targets', sc(RD.milestoneScore('MS-FC-01-01', e)), sc(RD.kpiScoreResolved(byId('kpis', 'KPI-FC-01-01-1'), poolOf(e), e)));
});
s.step('Computed: initiative, division, unit and company rollups (overall and quarterly)', () => {
  const e = em();
  const flat = (objs) => { const v = objs.map((o) => RD.objectiveScore(o.id, e)).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  s.eq('division overall = flat mean of its objectives', sc(RD.rollupDivision('DIV-FC', P(), e)), sc(flat(P().objectives.filter((o) => o.divisionId === 'DIV-FC'))));
  s.eq('quarterly = only that quarter\'s objectives', sc(RD.score('division', 'DIV-FC', P(), e, '2026Q4')), sc(flat(P().objectives.filter((o) => o.divisionId === 'DIV-FC' && o.quarter === '2026Q4'))));
  const live = P().objectives.filter((o) => o.divisionId === 'DIV-FC' && !RD.objectiveEndState(D().docs['EXEC-DIV-FC'].objectiveState, o.id));
  s.ok(live.length < P().objectives.filter((o) => o.divisionId === 'DIV-FC').length, 'Fuel Cell has an ended objective');
  go('Overview');
  s.eq('ended objectives still count in the shown division score', s.vals.pov.units[0].divs[0].score, sc(flat(P().objectives.filter((o) => o.divisionId === 'DIV-FC'))));
  go('Structure');
  s.eq('initiative score in Structure', s.vals.pst.h.inits.find((r) => r.id === 'INIT-FC-01').score, sc(flat(P().objectives.filter((o) => o.initiativeId === 'INIT-FC-01'))));
});
s.step('Computed: milestone achieved (completed date, or a score of 100)', () => {
  const e = em();
  s.eq('by date', RD.milestoneAchieved(byId('milestones', 'MS-EL-01-01'), e), true);
  s.eq('by score', [RD.milestoneScore('MS-EL-01-02', e), RD.milestoneAchieved(byId('milestones', 'MS-EL-01-02'), e)], [100, true]);
  go('Milestones');
  s.eq('both read Achieved', [msr('MS-EL-01-01').status, msr('MS-EL-01-02').status], ['Achieved', 'Achieved']);
});
s.step('Computed: gate states, set score, health', () => {
  const doc = D().docs['EXEC-DIV-FC'], e = em();
  const gs = doc.stageGates.filter((g) => g.objectiveId === 'OBJ-FC-2026Q4-01');
  s.eq('gate states', gs.map((g) => RD.classifyGate(g, TODAY)), gs.map((g) => (g.actualDate != null ? (g.actualDate > (g.baselineDate != null ? g.baselineDate : g.plannedDate) ? 'passed-late' : 'passed') : g.plannedDate < TODAY ? 'overdue' : 'pending')));
  const sets = doc.stageGateSets.filter((x) => x.objectiveId === 'OBJ-FC-2026Q4-01');
  const setScore = (sid) => { const g = gs.filter((x) => x.setId === sid); return 100 * g.filter((x) => /passed/.test(RD.classifyGate(x, TODAY))).length / g.length; };
  s.eq('set score = share of gates passed', sets.map((x) => Math.round(RD.setScore(x.id, e, TODAY))), sets.map((x) => Math.round(setScore(x.id))));
  s.c.openSheet('pov.detail', { type: 'objective', id: 'OBJ-FC-2026Q4-01' }, {}); s.render();
  s.eq('health = the weakest workstream', s.vals.pov.detail.health, 'Weakest workstream: ' + Math.round(Math.min.apply(null, sets.map((x) => setScore(x.id)))) + '% of its gates passed');
  closeSheets();
});
s.step('Computed: cascade (edges, locks, catch-up) and slips', () => {
  const c = casc();
  go('Gantt');
  const M = calmModel();
  const find = (k) => { let hit = null; (function w(l) { l.forEach((n) => { if (n.key === k) hit = n; w(n.kids); }); })(M.roots); return hit; };
  s.eq('objective projected end from the cascade', find('objective:OBJ-EL-2027Q1-01').g.pe, c.objectiveProjectedEnd['OBJ-EL-2027Q1-01'] > 0 ? c.objectiveProjectedEnd['OBJ-EL-2027Q1-01'] : null);
  s.ok(P().objectiveEdges.length > 0, 'objective edges in the sample feed it');
  s.eq('gate forecasts from the cascade', find('stagegate:SG-EL-2026Q4-01-3').g.eff, c.gateEffective['SG-EL-2026Q4-01-3']);
  s.eq('milestone effective from the cascade', find('milestone:MS-FC-01-01').g.eff, c.milestoneEffective['MS-FC-01-01']);
});
s.step('Computed: conformance, product and model rollups, RPN, report result', () => {
  s.eq('model conformance = the model\'s spec score', RD.objectiveScore('MDL-FC-1-1', D().spec) != null, true);
  s.eq('RPN bands', [RD.rpnBand(200), RD.rpnBand(199), RD.rpnBand(100), RD.rpnBand(99)], ['high', 'med', 'med', 'low']);
  s.eq('report result thresholds', [NS.PMS.result(100), NS.PMS.result(99), NS.PMS.result(70), NS.PMS.result(69), NS.PMS.result(null)], ['Met', 'Partial', 'Partial', 'Missed', 'N/A']);
  s.eq('model rollup = mean of objectives classified to it', sc(RD.sliceScore('model', 'MDL-FC-1-1', P(), em(), null)), (function () { const e = em(); const os = P().objectives.filter((o) => RD.effModel(o, P()) === 'MDL-FC-1-1'); const v = os.map((o) => RD.objectiveScore(o.id, e)).filter((x) => x != null); return sc(v.reduce((a, b) => a + b, 0) / v.length); })());
});

/* ================================================== BUGS FLAGGED (§19) */
fresh();
s.step('Bug 10: business divisions read their BIZ- document everywhere', () => {
  s.c.mutate((DD) => { DD.docs['BIZ-DIV-BD'].objectiveState.push({ objectiveId: 'OBJ-BD-2026Q4-01', status: 'achieved', endedDay: 2470, note: '' }); }, { quiet: true }); s.render();
  go('Structure');
  s.eq('Structure ended badge', s.vals.pst.h.inits.find((r) => r.id === 'OBJ-BD-2026Q4-01').endText, 'Achieved');
  menu('Close three utility pilot agreements', 'Show lineage');
  s.ok(L().rows.some((r) => /^SG-A/.test(r.tag)), 'lineage gates from BIZ-DIV-BD');
  closeSheets();
  go('Gantt');
  s.ok(s.vals.pgt.rows.some((r) => r.key === 'stagegate:SG-BD-2026Q4-01-1'), 'Gantt gates from BIZ-DIV-BD');
  s.ok(s.vals.pgt.rows.find((r) => r.key === 'objective:OBJ-BD-2026Q4-01').shapes.some((x) => /pgt-end achieved/.test(x.cls)), 'Gantt end marker for a business objective');
});
fresh();
s.step('Bug 11: a stored TRL or MRL of 0 reads as blank in the report', () => {
  s.c.mutate((DD) => { const m = DD.portfolio.milestones.find((x) => x.id === 'MS-FC-01-02'); m.trl = 0; m.mrl = 0; }, { quiet: true }); s.render();
  go('Milestones');
  s.click('Create report', { within: 'MS-FC-01-02' });
  s.eq('header and context', [rep().trlmrl, rep().trl, rep().mrl], ['— / —', '—', '—']);
  closeSheets();
});
s.step('Bug 15: the report keeps the context fields with no UI (today\'s tests require them hidden)', () => {
  s.c.mutate((DD) => { DD.portfolio.milestones.find((x) => x.id === 'MS-FC-01-01').milestoneReport = { context: { budget: '40k', buildNo: 'B7', linkedOkr: 'OBJ-FC-2026Q4-01' }, findings: ['a'], actions: [] }; }, { quiet: true }); s.render();
  go('Milestones');
  s.click('Open report', { within: 'MS-FC-01-01' });
  s.ok(!s.see('Budget') && !s.see('Variance') && !s.see('Linked OKR'), 'not shown');
  s.eq('a legacy report gains blank fields and keeps its own', [rep().findings.length, rep().actions.length, rep().findings[0].value], [4, 3, 'a']);
  s.click('Save report');
  s.eq('context kept on save', byId('milestones', 'MS-FC-01-01').milestoneReport.context, { budget: '40k', buildNo: 'B7', linkedOkr: 'OBJ-FC-2026Q4-01' });
});

/* ======================================================= DESIGN LANGUAGE */
s.step('Design: no glyph icons, no caps, no dotted meta strings; icon buttons labelled; tokens only', () => {
  const fs = require('fs');
  const root = path.join(__dirname, '..');
  const files = ['apps/plan/shell.html', 'apps/plan/shell.js', 'apps/plan/shell.css'];
  ['pov', 'pst', 'ped', 'pgt', 'pms'].forEach((m) => fs.readdirSync(path.join(root, 'mods', m)).filter((f) => /\.(js|html|css)$/.test(f) && f !== 'seed.js').forEach((f) => files.push('mods/' + m + '/' + f)));
  const glyph = /[✓✕✎◆●⌂▸▾›→↳📄🔒⚑★☆✔✗✖⚠▲▼◀▶•·]/;
  const bad = [];
  files.forEach((f) => fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((line, i) => { const t = line.trim(); if (/^(\/\*|\*|\/\/)/.test(t)) return; if (glyph.test(line)) bad.push(f + ':' + (i + 1)); }));
  s.eq('no glyph icons or middle dots in Planning code and templates', bad, []);
  const css = files.filter((f) => /\.css$/.test(f)).map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]);
  s.eq('no uppercase labels', css.filter((x) => /text-transform:\s*uppercase/.test(x[1])).map((x) => x[0]), []);
  const rawColour = css.map((x) => [x[0], x[1].replace(/@media print\s*\{[\s\S]*?\n\}/g, '')]).filter((x) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(x[1])).map((x) => x[0]);
  s.eq('tokens, not raw colours (the report\'s print block excepted)', rawColour, []);
  const tpl = files.filter((f) => /\.html$/.test(f));
  const unlabelled = [];
  tpl.forEach((f) => { const src = fs.readFileSync(path.join(root, f), 'utf8'); const re = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g; let m; while ((m = re.exec(src))) { const inner = m[3].replace(/<[^>]+>/g, '').replace(/\{\{[^}]+\}\}/g, 'X').trim(); if (!inner && (!/aria-label=/.test(m[2]) || (!/title=/.test(m[2]) && !/scrim/.test(m[2])))) unlabelled.push(f + ': ' + m[2].trim().slice(0, 60)); } });
  s.eq('every icon-only button has an aria-label and a title', unlabelled, []);
  fresh();
  const t = s.vals.pov.groups[0].blocks[0].objs.find((x) => x.id === 'OBJ-FC-2026Q4-01');
  s.eq('a passed gate shows an SVG check, not a glyph', t.lanes[0].dots.slice(0, 2).map((d) => [d.done, d.inner]), [[true, ''], [true, '']]);
  s.eq('a pending gate shows its number', [t.lanes[0].dots[2].done, t.lanes[0].dots[2].inner], [false, '3']);
  s.click('Save');
  const x = s.find('Dismiss', { handler: 'onClick' });
  s.ok(x.attrs.title === 'Dismiss' && textOf(x) === '', 'a toast\'s dismiss is an icon button labelled Dismiss');
  s.click('Dismiss');
  s.ok(!hasToast('Saved.'), 'and it dismisses');
});

/* ============================================================ EXTRA RULES */
fresh();
s.step('Filters: units never filtered; divisions by unit and division; products by unit, division and product', () => {
  go('Structure');
  FILTER_CASES.forEach((f) => {
    applyF(f);
    const tag = JSON.stringify(f);
    s.eq('units ' + tag, s.vals.pst.h.units.map((u) => u.id), byOrd(P().units).map((u) => u.id));
    s.eq('divisions ' + tag, s.vals.pst.h.divs.map((d) => d.id), byOrd(P().divisions.filter((d) => (!f.division || d.id === f.division) && (!f.unit || (d.unitId || null) === f.unit))).map((d) => d.id));
    s.eq('products ' + tag, s.vals.pst.h.prods.filter((r) => r.isProd).map((r) => r.id), byOrd(P().products.filter((p) => (!f.unit || (RD.unitIdOfDivision(p.divisionId, P()) || '') === f.unit) && (!f.division || p.divisionId === f.division) && (!f.product || p.id === f.product))).map((p) => p.id));
  });
  clearFilters();
});
fresh();
s.step('Data: a legacy single-string owner is read and saved as a list', () => {
  s.c.mutate((DD) => { DD.portfolio.objectives.find((o) => o.id === 'OBJ-BD-2027Q1-01').owner = 'sam@celadyne.com'; }, { quiet: true }); s.render();
  go('Structure');
  menu('Build the Q1 hydrogen-hub pipeline', 'Edit');
  s.eq('ticked from the string', field('owner').checks.filter((c) => c.on).map((c) => c.sub), ['sam@celadyne.com']);
  s.check('~ken@celadyne.com', true, { within: 'Editor' });
  s.click('Save objective');
  s.eq('saved as a list', byId('objectives', 'OBJ-BD-2027Q1-01').owner, ['sam@celadyne.com', 'ken@celadyne.com']);
  s.c.setState({ group: { mode: 'custom', dims: ['owner'] } }); s.render();
  s.ok(s.vals.pst.g.rows.some((r) => r.isGroup && r.key === 'owner:ken@celadyne.com'), 'and groups by each owner');
});
fresh();
s.step('Report: an untouched Measured cell is recorded as the value it showed', () => {
  go('Milestones');
  s.click('Create report', { within: 'MS-FC-01-01' });
  s.click('Save report');
  s.eq('recorded live value', byId('milestones', 'MS-FC-01-01').milestoneReport.kpiOverrides, { 'KPI-FC-01-01-1': { measured: '32 m' } });
});
fresh();
s.step('Delete: "only" keeps the nested items and clears their link', () => {
  go('Structure');
  menu('Stack cost-down', 'Delete');
  s.click('Delete initiative only');
  s.ok(hasToast('Initiative deleted.'), 'message');
  s.eq('objective and milestone kept, unlinked', [byId('objectives', 'OBJ-EL-2027Q1-01').initiativeId, byId('milestones', 'MS-EL-02-01').initiativeId], [null, null]);
  s.clean('after an only-delete');
  go('Overview'); s.clean('overview after an only-delete');
  go('Gantt'); s.clean('gantt after an only-delete');
  go('Milestones'); s.clean('milestones after an only-delete');
});

fresh();
s.step('Shell: Escape cancels a confirm dialog (the delete prompt; bug 2 intent), focus starts on Cancel', () => {
  go('Structure');
  menu('Tera 25-30-R5', 'Delete');
  s.ok(!!s.c.state.dlg, 'delete prompt');
  const cancel = s.find('Cancel', { within: s.c.state.dlg.title, handler: 'onClick' });
  s.ok('autofocus' in cancel.attrs || 'autoFocus' in cancel.attrs, 'focus starts on Cancel');
  s.key(s.c.state.dlg.title, 'Escape');
  s.ok(!s.c.state.dlg && !!byId('models', 'MDL-EL-1-1'), 'Escape cancels, nothing deleted');
  menu('Tera 25-30-R5', 'Delete');
  s.key(s.c.state.dlg.title, 'Enter');
  s.ok(!!s.c.state.dlg, 'other keys do nothing');
  s.click('Cancel', { within: s.c.state.dlg.title });
});

done();
