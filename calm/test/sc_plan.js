/* Planning (P-core) scenarios: shell, settings, sync and links, filters and grouping,
   Overview numbers against the engine, the editor for every entity, targets and readings,
   lineage, delete, milestone status and pause, read-only and present mode.

     node test/sc_plan.js out/pcore/Plan-A.dc.html
*/
const path = require('path');
const { Sim, done } = require('./dc');
const RD = require(require('./engine_path'));
const FILE = process.argv[2] || 'out/pcore/Plan-A.dc.html';

let s = new Sim(FILE);
const P = () => s.c.D.portfolio;
const em = () => {
  const m = {};
  Object.keys(s.c.D.docs).forEach((k) => { m[k.replace(/^(EXEC|BIZ)-/, '')] = s.c.D.docs[k]; });
  return RD.withPortfolio(P(), m);
};
const toasts = () => (s.c.state.toasts || []).map((t) => t.text);
const lastToast = () => { const t = toasts(); return t[t.length - 1] || ''; };
const hasToast = (txt) => toasts().some((t) => t.indexOf(txt) >= 0);
const byId = (key, id) => (P()[key] || []).find((x) => x.id === id);
const fresh = () => { s = new Sim(FILE); return s; };
const openSettings = () => s.click('Settings');
const go = (tab) => s.click(tab, { tag: 'button', within: 'Views' });
const menu = (name, item) => { s.click('More actions for ' + name); s.click(item); };

/* ------------------------------------------------------------------ shell */
s.step('shell and tabs', () => {
  s.expect('Overview').expect('Structure').expect('Gantt').expect('Milestones');
  s.eq('starts on Overview', s.c.state.tab, 'overview');
  s.ok(!s.has('Group by'), 'no filter bar on the Overview');
  go('Structure');
  s.eq('tab structure', s.c.state.tab, 'structure');
  s.expect('Group by').expect('Units').expect('Initiatives, objectives and milestones');
  go('Gantt');
  s.ok(s.has('Group by'), 'filter bar on the Gantt');
  s.ok(s.vals.sh.pageCls.indexOf('wide') >= 0, 'Gantt widens the page');
  go('Milestones');
  s.ok(s.has('Group by'), 'filter bar on Milestones');
  go('Overview');
  s.ok(s.vals.sh.pageCls.indexOf('wide') < 0, 'other tabs are capped');
  s.expect('All apps');
  s.ok(s.all('All apps')[0].attrs.href === 'https://celadynestaller.github.io/CeladyneHQ/', 'All apps links to the hub');
  s.clean('shell');
});
s.step('tab switch closes sheets', () => {
  go('Structure');
  s.click('Fuel Cell', { within: 'Divisions' });
  s.ok(!!s.c.sheet() && s.c.sheet().kind === 'ped.lineage', 'lineage opened');
  go('Overview');
  s.eq('sheets closed on tab switch', (s.c.state.sheets || []).length, 0);
});
s.step('save button and indicator', () => {
  s.expect('Saved just now');
  s.click('Save');
  s.ok(hasToast('Saved.'), 'Save says Saved.');
});
s.step('theme', () => {
  openSettings();
  s.expect('Settings');
  s.click('Dark');
  s.eq('dark theme', s.vals.theme, 'dark');
  s.click('Match system');
  s.eq('system follows matchMedia (light here)', s.vals.theme, 'light');
  s.eq('system stored', s.c.state.theme, 'system');
  s.click('Light');
  s.eq('light', s.vals.theme, 'light');
  s.clean('settings');
  s.key('Editor', 'Escape');
  s.eq('Escape closes the sheet', (s.c.state.sheets || []).length, 0);
});

/* ------------------------------------------------------------------ broker, sync */
fresh();
s.step('token: remove, scratch, save, load', () => {
  openSettings();
  s.expect('Token set. Live sync active.');
  s.click('Remove token');
  s.ok(hasToast('Token saved.'), 'Token saved.');
  s.ok(hasToast('No broker token yet — add one in Settings to load live data. Showing local scratch.'), 'scratch load message');
  s.expect('No token set — running on local scratch data.');
  s.ok(s.vals.sh.save.text === 'Local scratch, not synced', 'indicator shows local scratch');
  s.click('Close', { tag: 'button', within: 'Editor' });
  /* an edit without a token is kept locally */
  s.c.mutate((D) => { D.portfolio.units[0].name = 'Technical R&D'; }, { msg: 'Unit saved.' });
  s.render();
  s.ok(hasToast('Saved locally — add a broker token in Settings to sync.'), 'saved locally message');
  s.click('Save');
  s.ok(hasToast('Add a broker token in Settings before saving.'), 'save needs a token');
  openSettings();
  s.type('Broker token', 'rdb_live_new');
  s.click('Save token');
  s.ok(hasToast('Loaded portfolio + 4 exec + 2 spec docs.'), 'load message counts docs (Partnerships has a BIZ- doc)');
  s.eq('token stored', s.c.state.bk.token, 'rdb_live_new');
  s.eq('scratch edit discarded by the load', P().units[0].name, 'Technical');
  s.check('The broker rejects the token (401)', true);
  s.click('Load from the broker');
  s.ok(hasToast('Load failed (401). Check the token in Settings.'), 'rejected token message');
  s.check('The broker rejects the token (401)', false);
  s.clean('broker');
});
fresh();
s.step('teammate edit (polling)', () => {
  openSettings();
  const before = byId('milestones', 'MS-EL-01-02').plannedDate;
  s.click('A teammate saves a change');
  s.ok(hasToast('Updated from another editor.'), 'polling message');
  s.eq('teammate moved the design freeze a week', byId('milestones', 'MS-EL-01-02').plannedDate, before + 7);
  s.expect('Last change from another editor: Toru Hayashi moved Tera design freeze');
  s.click('A teammate saves a change');
  const fcDoc = s.c.D.docs['EXEC-DIV-FC'];
  s.ok(fcDoc.kpiUpdates.some((u) => u.value === 1.3 && u.kpiId === 'KPI-FC-2026Q4-01-1-1' && u.id.indexOf('UPD-TH-') === 0), 'second edit lands in an exec doc');
});
s.step('412 that merges', () => {
  s.click('Next save: conflict that merges');
  s.expect('Armed: the next save meets a 412 conflict and merges.');
  s.click('Close', { tag: 'button', within: 'Editor' });
  go('Structure');
  menu('Technical', 'Edit');
  s.type('Name', 'Technical programs');
  s.click('Save unit');
  s.ok(hasToast('Unit saved. (merged with a concurrent change)'), 'merge message');
  s.eq('my change kept', byId('units', 'UNIT-TECHNI').name, 'Technical programs');
  s.ok((P().kpiUpdates || []).some((u) => u.kpiId === 'KPI-BD-01-1' && u.value === 1.5), 'their change merged in');
  s.eq('conflict disarmed', s.c.state.bk.conflict, '');
});
s.step('412 that cannot merge', () => {
  openSettings();
  s.click("Next save: conflict that can't merge");
  s.click('Close', { tag: 'button', within: 'Editor' });
  menu('Business', 'Edit');
  s.type('Name', 'Commercial');
  s.click('Save unit');
  s.ok(hasToast("Auto-save hit a conflict and couldn’t merge (412) — reloaded; re-apply and use Save."), 'merge failure message');
  s.eq('change lost by the reload', byId('units', 'UNIT-BUSINE').name, 'Business');
  s.expect('Reloaded after a conflict');
});
s.step('Save button meets a conflict', () => {
  openSettings();
  s.click('Next save: conflict that merges');
  s.click('Close', { tag: 'button', within: 'Editor' });
  s.click('Save');
  s.ok(hasToast('Someone else saved first — reloading their version, then re-apply your change.'), 'manual save conflict message');
  s.ok(hasToast('Loaded portfolio + 4 exec + 2 spec docs.'), 'then reloads');
});
fresh();
s.step('offline', () => {
  openSettings();
  s.check("The broker can't be reached (offline)", true);
  s.click('Close', { tag: 'button', within: 'Editor' });
  go('Structure');
  menu('Technical', 'Edit');
  s.type('Name', 'Tech');
  s.click('Save unit');
  s.ok(hasToast('Auto-save failed (no connection). Your change is local — use Save to retry.'), 'offline auto-save message');
  s.expect('Offline, changes kept here');
  s.eq('change kept locally', byId('units', 'UNIT-TECHNI').name, 'Tech');
  s.click('Save');
  s.ok(hasToast('Save failed (no connection).'), 'offline save message');
  openSettings();
  s.check("The broker can't be reached (offline)", false);
  s.click('Close', { tag: 'button', within: 'Editor' });
  s.expect('Changes not saved yet');
  s.click('Save');
  s.ok(hasToast('Saved.'), 'saved after reconnecting');
  s.expect('Saved just now');
});

/* ------------------------------------------------------------------ links */
fresh();
s.step('link builder', () => {
  openSettings();
  s.type('Opens on', 'gantt');
  s.type('Division', 'DIV-FC', { within: 'Editor', nth: 0 });
  s.type('Quarter', 'active', { within: 'Editor' });
  s.check('Gantt: active work only', true);
  s.check('Gantt: limit to the timeframe', true);
  const url = s.vals.sh.settings.link.url;
  s.eq('url', url, 'https://celadynestaller.github.io/CeladyneHQ/planning_app.html?tab=gantt&division=DIV-FC&quarter=active&ganttActive=1&ganttQuarter=1');
  s.expect(url);
  s.check('Include the broker token (for an SSO-gated Confluence embed)', true);
  s.ok(/&token=rdb_live_7Qx2mK9p$/.test(s.vals.sh.settings.link.url), 'token included on request');
  s.check('Include the broker token (for an SSO-gated Confluence embed)', false);
  s.click('Copy link');
  s.ok(hasToast('Link copied.'), 'copy');
  { const real = global.window.navigator.clipboard.writeText; global.window.navigator.clipboard.writeText = () => ({ then(ok, no) { if (no) no(new Error('Write permission denied.')); return this; } });
    s.click('Copy link');
    s.ok(hasToast('Copy didn’t work here. Select the link and copy it instead.'), 'a refused copy says so');
    global.window.navigator.clipboard.writeText = real; }
  s.click('Open this link here');
  s.eq('tab', s.c.state.tab, 'gantt');
  s.eq('division filter', s.c.state.f.div, 'DIV-FC');
  s.eq('quarter active = current quarter', s.c.state.f.q, '2026Q4');
  s.eq('pg_active', s.c.state.pg_active, true);
  s.eq('pg_timeframe', s.c.state.pg_timeframe, true);
  s.eq('settings closed (fresh load)', (s.c.state.sheets || []).length, 0);
  s.ok(hasToast('Opened Planning with this link.'), 'opened message');
});
s.step('pasted links: case, readonly, present, token, tab', () => {
  openSettings();
  s.type('Open a pasted link', 'https://x/planning_app.html?TAB=Portfolio&Division=DIV-EL&readonly&Unit=UNIT-TECHNI&product=PRD-EL-1&quarter=2026Q4');
  s.click('Open');
  s.eq('portfolio = Structure', s.c.state.tab, 'structure');
  s.eq('names are case-insensitive', s.c.state.f.div, 'DIV-EL');
  s.eq('unit', s.c.state.f.unit, 'UNIT-TECHNI');
  s.eq('product', s.c.state.f.prod, 'PRD-EL-1');
  s.eq('quarter exact', s.c.state.f.q, '2026Q4');
  s.eq('readonly by presence', s.c.state.ro, true);
  s.eq('pg_active off', s.c.state.pg_active, false);
  openSettings();
  s.type('Open a pasted link', '?readonly=0&tab=nonsense');
  s.click('Open');
  s.eq('readonly=0 is off (fixed)', s.c.state.ro, false);
  s.eq('unknown tab stays on Overview', s.c.state.tab, 'overview');
  s.eq('filters reset by a fresh load', s.c.state.f.div, '');
  openSettings();
  s.type('Open a pasted link', '?present=1&tab=milestones');
  s.click('Open');
  s.eq('present', s.c.state.present, true);
  s.eq('present implies read-only', s.c.state.ro, true);
  s.ok(!s.has('Views'), 'present hides the sidebar');
  s.ok(!s.has('Group by'), 'present hides the filter bar');
  s.click('Exit present mode');
  s.eq('present off', s.c.state.present, false);
  s.eq('read-only from present is lifted', s.c.state.ro, false);
  openSettings();
  s.type('Open a pasted link', 'https://x/planning_app.html?tab=settings&token=SSO-123&ganttQuarter=1');
  s.click('Open');
  s.eq('token saved', s.c.state.bk.token, 'SSO-123');
  s.ok(hasToast('Token saved and removed from the address: https://x/planning_app.html?tab=settings&ganttQuarter=1'), 'token stripped from the address');
  s.ok(!!s.vals.sh.settings, 'tab=settings opens Settings');
  s.eq('ganttQuarter', s.c.state.pg_timeframe, true);
  s.clean('links');
});

/* ------------------------------------------------------------------ read-only and present */
fresh();
s.step('read-only preview', () => {
  openSettings();
  s.check('Preview the read-only view', true);
  s.click('Close', { tag: 'button', within: 'Editor' });
  s.expect('Read-only');
  s.ok(!s.has('Save', { tag: 'button' }), 'Save hidden in read-only');
  go('Structure');
  s.ok(!s.has('Add unit'), 'no add buttons');
  s.click('More actions for Fuel Cell');
  s.ok(!s.has('Edit', { tag: 'button', within: 'More actions for Fuel Cell' }), 'no Edit in the row menu');
  s.ok(s.has('Show lineage'), 'lineage still available');
  s.click('Show lineage');
  s.ok(!s.has('Edit division'), 'lineage has no Edit in read-only');
  s.click('Close', { tag: 'button', within: 'Editor', nth: 0 });
  /* blocked in code too */
  s.c.closeAllSheets();
  s.render();
  const before = JSON.stringify(P());
  s.ok(s.c.mutate((D) => { D.portfolio.units = []; }) === false, 'mutate refuses');
  s.eq('nothing changed', JSON.stringify(P()), before);
  s.ok(hasToast('Read-only view — editing is disabled.'), 'read-only message');
  s.clean('read-only');
});
fresh();
s.step('present mode from settings', () => {
  openSettings();
  s.check('Present mode', true);
  s.eq('present on', s.c.state.present, true);
  s.ok(!s.has('Settings', { tag: 'button' }), 'top bar hidden');
  s.expect('Present mode, read-only');
  s.ok(!s.has('Views'), 'no sidebar');
  s.click('Exit present mode');
  s.ok(s.has('Views'), 'sidebar back');
});

/* ------------------------------------------------------------------ filters */
fresh();
const ctx = () => s.c.ctx;
const objIdsShown = () => (s.vals.pst.h ? s.vals.pst.h.inits.filter((r) => r.isObj).map((r) => r.id) : []);
const initIdsShown = () => (s.vals.pst.h ? s.vals.pst.h.inits.filter((r) => r.isInit).map((r) => r.id) : []);
s.step('filter selects and chips', () => {
  go('Structure');
  s.type('Division', 'DIV-EL', { within: 'Filters and grouping' });
  s.eq('state', s.c.state.f.div, 'DIV-EL');
  s.expect('Division: Electrolyzer');
  s.eq('divisions table filtered', s.vals.pst.h.divs.map((d) => d.id), ['DIV-EL']);
  s.eq('products filtered', s.vals.pst.h.prods.filter((r) => r.isProd).map((r) => r.id), ['PRD-EL-1', 'PRD-EL-2']);
  s.eq('initiatives filtered', initIdsShown(), ['INIT-EL-01', 'INIT-EL-02']);
  s.eq('units are not filtered', s.vals.pst.h.units.length, 2);
  s.type('Status', 'off-track', { within: 'Filters and grouping' });
  s.expect('Status: Off track');
  s.eq('only off-track objectives', objIdsShown(), ['OBJ-EL-2026Q4-02']);
  s.eq('initiatives need a matching objective', initIdsShown(), ['INIT-EL-01']);
  s.click('Remove the status filter');
  s.ok(!s.see('Status: Off track'), 'chip removed');
  s.type('Quarter', '2027Q1', { within: 'Filters and grouping' });
  s.eq('quarter filter', objIdsShown(), ['OBJ-EL-2027Q1-01']);
  s.type('Product', 'PRD-EL-1', { within: 'Filters and grouping' });
  s.eq('product via the initiative', objIdsShown(), ['OBJ-EL-2027Q1-01']);
  s.click('Clear all');
  s.eq('cleared', s.c.state.f, { unit: '', div: '', prod: '', q: '', status: '' });
  s.type('Unit', 'UNIT-BUSINE', { within: 'Filters and grouping' });
  s.eq('unit filter', s.vals.pst.h.divs.map((d) => d.id), ['DIV-BD', 'DIV-PT']);
  s.eq('unit filter on initiatives', initIdsShown(), ['INIT-BD-01']);
  s.click('Clear all');
  s.clean('filters');
});
s.step('filter rules match today (objMatch / initMatch / msMatch)', () => {
  const c = s.c;
  const check = (f) => {
    c.setState({ f: Object.assign({ unit: '', div: '', prod: '', q: '', status: '' }, f) });
    s.render();
    const x = ctx();
    const E = em();
    const today = (o) => {
      if (f.unit && (RD.unitIdOfDivision(o.divisionId, P()) || '') !== f.unit) return false;
      if (f.div && o.divisionId !== f.div) return false;
      if (f.prod) { const cl = RD.effClass(o, P()); let pid = null; if (cl.kind === 'product') pid = cl.productId; else if (cl.kind === 'model') { const m = byId('models', cl.modelId); pid = m ? m.productId : null; } if (pid !== f.prod) return false; }
      if (f.q && (o.quarter || '') !== f.q) return false;
      if (f.status && RD.band(RD.rollupObjective(o.id, P(), E)) !== f.status) return false;
      return true;
    };
    s.eq('objMatch ' + JSON.stringify(f), P().objectives.filter(x.objMatch).map((o) => o.id), P().objectives.filter(today).map((o) => o.id));
  };
  check({ div: 'DIV-FC' });
  check({ unit: 'UNIT-TECHNI' });
  check({ prod: 'PRD-FC-1' });
  check({ q: '2026Q4' });
  check({ status: 'at-risk' });
  check({ status: 'no-band', div: 'DIV-EL' });
  c.setState({ f: { unit: '', div: 'DIV-EL', prod: '', q: '', status: '' } }); s.render();
  s.ok(ctx().initMatch({ id: 'X', divisionId: 'DIV-EL' }), 'objective-less initiative judged on its own division');
  s.ok(!ctx().initMatch({ id: 'X', divisionId: 'DIV-FC' }), 'and filtered out elsewhere');
  c.setState({ f: { unit: '', div: '', prod: '', q: '2026Q4', status: '' } }); s.render();
  s.ok(!ctx().initMatch({ id: 'X', divisionId: 'DIV-EL' }), 'hidden when a quarter filter is set');
  c.setState({ f: { unit: 'UNIT-BUSINE', div: '', prod: '', q: '', status: '' } }); s.render();
  s.eq('msMatch honours the unit filter (fixed)', P().milestones.filter(ctx().msMatch).map((m) => m.id), ['MS-BD-01-01']);
  c.setState({ f: { unit: '', div: '', prod: '', q: '2026Q4', status: '' } }); s.render();
  s.eq('msMatch quarter from the planned date', P().milestones.filter(ctx().msMatch).map((m) => m.id), ['MS-FC-01-01', 'MS-EL-01-01', 'MS-EL-01-02']);
  c.setState({ f: { unit: '', div: '', prod: '', q: '', status: '' } }); s.render();
});
s.step('hierarchy collapse and paused count', () => {
  s.expect('1 milestone paused or deprioritized, kept out of dates and scores');
  s.click('Collapse Tera component lock');
  s.ok(!s.vals.pst.h.inits.some((r) => r.id === 'OBJ-EL-2026Q4-01'), 'children hidden');
  s.click('Expand Tera component lock');
  s.ok(s.vals.pst.h.inits.some((r) => r.id === 'OBJ-EL-2026Q4-01'), 'children back');
  s.click('Collapse all', { within: 'Initiatives' });
  s.eq('only initiatives left', s.vals.pst.h.inits.every((r) => r.isInit), true);
  s.click('Expand all', { within: 'Initiatives' });
  s.click('Collapse Tera stack');
  s.ok(!s.vals.pst.h.prods.some((r) => r.id === 'MDL-EL-1-1'), 'models hidden');
  s.eq('one collapsed: the button still collapses all', s.vals.pst.h.prodFold, 'Collapse all');
  s.click('Expand Tera stack');
  s.ok(s.vals.pst.h.prods.some((r) => r.id === 'MDL-EL-1-1'), 'models back');
});
s.step('objective-less initiative in Structure', () => {
  s.c.mutate((D) => { D.portfolio.initiatives.push({ id: 'INIT-EL-03', divisionId: 'DIV-EL', name: 'Next-gen PTL', desc: '', plannedStart: null, plannedEnd: null, productId: 'PRD-EL-1', modelId: null, order: 3 }); }, { quiet: true });
  s.type('Division', 'DIV-EL', { within: 'Filters and grouping' });
  s.ok(initIdsShown().indexOf('INIT-EL-03') >= 0, 'shows under its division');
  s.type('Product', 'PRD-EL-1', { within: 'Filters and grouping' });
  /* audit A3: today's tables hide it here although the shared rule (initOwnMatches) matches it on its
     own product, which the Gantt honours; the Structure tables now apply the same fallback */
  s.ok(initIdsShown().indexOf('INIT-EL-03') >= 0, 'Structure shows it under its own product too (audit fix; today hides it)');
  s.ok(ctx().initMatch(byId('initiatives', 'INIT-EL-03')), 'initMatch passes its own product (for the Gantt)');
  s.type('Quarter', '2026Q4', { within: 'Filters and grouping' });
  s.ok(!ctx().initMatch(byId('initiatives', 'INIT-EL-03')), 'quarter set: hidden');
  s.click('Clear all');
});
s.step('filters close the editor', () => {
  menu('Fuel Cell', 'Edit');
  s.ok(!!s.c.sheet(), 'editor open');
  s.c.setState({ sheets: s.c.state.sheets }); s.render();
  s.vals.sh.fb.div.on({ target: { value: 'DIV-FC' } }); s.render();
  s.eq('editor closed by a filter change', (s.c.state.sheets || []).length, 0);
  s.click('Clear all');
});

/* ------------------------------------------------------------------ grouping */
s.step('custom grouping', () => {
  s.click('Custom', { within: 'Group by' });
  s.eq('mode custom', s.c.state.group.mode, 'custom');
  s.eq('starts with division', s.c.state.group.dims, ['division']);
  s.expect('Objectives by division');
  const groups = () => s.vals.pst.g.rows.filter((r) => r.isGroup).map((r) => r.label);
  s.eq('division groups in stored order', groups(), ['Fuel Cell', 'Electrolyzer', 'Business Development']);
  s.type('Add a grouping level', 'owner');
  s.eq('chain', s.c.state.group.dims, ['division', 'owner']);
  const shared = s.vals.pst.g.rows.filter((r) => r.isObj && r.id === 'OBJ-FC-2026Q4-03').length;
  s.eq('owner fans out a shared objective', shared, 2);
  s.type('Grouping level 1', 'quarter');
  s.eq('level changed in place', s.c.state.group.dims, ['quarter', 'owner']);
  s.click('Remove the owner level');
  s.eq('removed', s.c.state.group.dims, ['quarter']);
  s.eq('quarter groups sorted', groups(), ['Q3 2026', 'Q4 2026', 'Q1 2027']);
  s.click('Collapse Q4 2026');
  s.ok(!s.vals.pst.g.rows.some((r) => r.id === 'OBJ-EL-2026Q4-01'), 'collapsed hides its objectives');
  s.click('Expand Q4 2026');
  s.ok(s.vals.pst.g.rows.some((r) => r.id === 'OBJ-EL-2026Q4-01'), 'expanded again');
  s.eq('group score averages its objectives', s.vals.pst.g.rows.find((r) => r.isGroup && r.label === 'Q4 2026').score,
    String(Math.round((() => { const v = P().objectives.filter((o) => o.quarter === '2026Q4').map((o) => RD.rollupObjective(o.id, P(), em())).filter((x) => x != null); return v.reduce((a, b) => a + b, 0) / v.length; })())));
  s.click('Add an objective to Q1 2027');
  s.eq('prefilled quarter', s.c.draft().quarter, '2027Q1');
  s.eq('dates from the quarter', [s.c.draft().plannedStart, s.c.draft().plannedEnd], ['2027-01-01', '2027-03-31']);
  s.c.closeAllSheets(); s.render();
  s.click('Remove the quarter level');
  s.ok(s.vals.pst.g.flat, 'no levels: flat list');
  s.expect('No levels, so objectives show as one list.');
  s.ok(s.has('Add objective') && s.has('Add initiative'), 'flat toolbar');
  s.type('Add a grouping level', 'initiative');
  s.click('Add a milestone to Tera component lock');
  s.eq('milestone prefilled with the initiative', s.c.draft().initiativeId, 'INIT-EL-01');
  s.c.closeAllSheets(); s.render();
  s.type('Grouping level 1', 'division');
  s.click('Add an initiative to Electrolyzer');
  s.eq('initiative prefilled with the division', s.c.draft().divisionId, 'DIV-EL');
  s.c.closeAllSheets(); s.render();
  s.type('Grouping level 1', 'product');
  s.click('Add a model to Tera stack');
  s.eq('model prefilled with the product', s.c.draft().productId, 'PRD-EL-1');
  s.c.closeAllSheets(); s.render();
  s.click('Hierarchy', { within: 'Group by' });
  s.click('Custom', { within: 'Group by' });
  s.eq('custom keeps its chain', s.c.state.group.dims, ['product']);
  s.click('Remove the product level');
  s.click('Hierarchy', { within: 'Group by' });
  s.click('Custom', { within: 'Group by' });
  s.eq('custom with no levels resets to division', s.c.state.group.dims, ['division']);
  s.click('Hierarchy', { within: 'Group by' });
  s.clean('grouping');
});

/* ------------------------------------------------------------------ overview numbers */
fresh();
s.step('overview numbers match the engine', () => {
  const E = em();
  const comp = RD.rollupCompany(P(), E);
  s.eq('company', s.vals.pov.company.score, String(Math.round(comp)));
  s.expect('Mean of division scores');
  const tech = s.vals.pov.units.find((u) => u.id === 'UNIT-TECHNI');
  s.eq('unit score', tech.score, String(Math.round(RD.rollupUnit('UNIT-TECHNI', P(), E))));
  const fc = tech.divs.find((d) => d.id === 'DIV-FC');
  s.eq('division overall', fc.score, String(Math.round(RD.rollupDivision('DIV-FC', P(), E))));
  s.eq('per quarter', fc.qs.map((q) => q.q + ' ' + q.score), RD.boundsOf('division', 'DIV-FC', P()).map((q) => { const v = RD.score('division', 'DIV-FC', P(), E, q); return q.replace(/^(\d{4})Q(\d)$/, 'Q$2 $1') + ' ' + (v == null ? '—' : String(Math.round(v))); }));
  const c = { 'on-track': 0, 'at-risk': 0, 'off-track': 0, 'no-band': 0 };
  P().objectives.filter((o) => o.divisionId === 'DIV-FC').forEach((o) => { c[RD.band(RD.objectiveScore(o.id, E))]++; });
  s.eq('status mix', fc.mix.map((x) => x.n), [c['on-track'], c['at-risk'], c['off-track'], c['no-band']].map(String));
  s.eq('counts', fc.meta, '5 objectives, 2 milestones');
  const casc = RD.cascade(P(), E, 2477);
  let w = null; P().initiatives.filter((i) => i.divisionId === 'DIV-FC').forEach((i) => { const sl = casc.longTermSlip[i.id]; if (sl != null && isFinite(sl)) w = w == null ? sl : Math.max(w, sl); });
  s.eq('worst slip text', fc.slip, w > 0 ? 'Worst initiative slip: ' + w + ' days' : 'No initiative is slipping');
  const biz = s.vals.pov.units.find((u) => u.id === 'UNIT-BUSINE');
  s.eq('business unit', biz.divs.map((d) => d.id), ['DIV-BD', 'DIV-PT']);
});
s.step('overview active work', () => {
  const g = s.vals.pov.groups;
  s.eq('division groups', g.map((x) => x.id), ['DIV-FC', 'DIV-EL', 'DIV-BD']);
  const fc = g[0];
  s.eq('FC blocks', fc.blocks.map((b) => b.label), ['HP membrane']);
  s.eq('worst score first, unscored last', fc.blocks[0].objs.map((o) => o.id), ['OBJ-FC-2026Q4-03', 'OBJ-FC-2026Q4-02', 'OBJ-FC-2026Q4-01']);
  const o1 = fc.blocks[0].objs[2];
  s.eq('days left', o1.sub, '66 days left');
  s.eq('gates passed', o1.gates, 'Gates 2 of 5 passed');
  s.eq('two workstreams', o1.lanes.map((l) => l.label), ['A', 'B']);
  s.eq('KR target and now', o1.krs[0].tgt + ' / ' + o1.krs[0].cur, '≤ 1.5 µm / 1.47 µm');
  const ms = fc.blocks[0].mss[0];
  s.eq('milestone tile', [ms.id, ms.sub, ms.slip], ['MS-FC-01-01', 'Est Dec 18, 2026', '7 days slip']);
  s.eq('milestone targets defined in Planning show (fixed)', ms.kpis.map((k) => k.name + ' ' + k.cur), ['Continuous run length 32 m']);
  const el = g[1];
  s.eq('EL blocks: own products', el.blocks.map((b) => b.label), ['Tera stack', 'Tera system']);
  s.eq('model tile conformance', el.blocks[0].models[0].conf, Math.round(RD.objectiveScore('MDL-EL-1-1', s.c.D.spec)) + '%');
  const lock = el.blocks[0].objs.find((o) => o.id === 'OBJ-EL-2026Q4-02');
  s.eq('behind count', lock.behind, '1 behind');
  s.eq('BD unclassified', g[2].blocks.map((b) => b.label), ['Unclassified']);
  /* paused milestones are not active (fixed) */
  s.c.mutate((D) => { D.portfolio.milestoneState.push({ milestoneId: 'MS-FC-01-01', status: 'paused', day: 2477, note: '' }); }, { quiet: true });
  s.render();
  s.ok(!s.vals.pov.groups[0].blocks[0].mss.length, 'paused milestone leaves the active list');
  s.c.mutate((D) => { D.portfolio.milestoneState.push({ milestoneId: 'MS-FC-01-01', status: 'active', day: 2477, note: '' }); }, { quiet: true });
  s.render();
  s.clean('overview');
});
s.step('overview filters (fixed: they apply, and show as chips)', () => {
  s.c.setState({ f: { unit: '', div: '', prod: 'PRD-EL-2', q: '', status: '' } }); s.render();
  s.expect('Filtered by');
  s.expect('Product: Tera system');
  s.eq('only the filtered product', s.vals.pov.groups.map((g) => g.id + ':' + g.blocks.map((b) => b.label).join('|')), ['DIV-EL:Tera system']);
  s.click('Clear all');
  s.c.setState({ f: { unit: '', div: 'fuelcell', prod: '', q: '', status: '' } }); s.render();
  s.expect('No divisions match the current filter (division fuelcell). The filter matches a division id such as DIV-FC, not its name.');
  s.click('Clear all');
});
s.step('overview detail sheets', () => {
  s.click('Open details for Qualify the 10-cell short stack for durability testing');
  const d = s.vals.pov.detail;
  s.eq('objective detail', d.title, 'Qualify the 10-cell short stack for durability testing');
  s.eq('gates head', d.gateHead, 'Stage-gates, 1 of 5 passed');
  s.ok(d.gateRows.some((g) => g.isGate && g.kpi.indexOf('Leak test at 30 bar') === 0), 'gate KPI text');
  s.eq('schedule planned end', d.sched[0].v, 'Dec 18, 2026');
  s.expect('Open in Execution');
  s.ok(s.all('Open in Execution')[0].attrs.href === 'Main.dc.html', 'links to Execution');
  s.click('Open in Execution');
  s.ok(s.c.takeHandoff('exec').objective === 'OBJ-EL-2026Q4-01', 'hands off the objective');
  s.c.closeAllSheets(); s.render();
  /* FMEA block with risks */
  s.c.D.docs['EXEC-DIV-EL'].risks = [{ id: 'R1', objectiveId: 'OBJ-EL-2026Q4-01', problem: 'Membrane', modes: [{ mode: 'Seal creep', effects: [{ causes: [{ severity: 8, occurrence: 5, detection: 6 }, { severity: 4, occurrence: 3, detection: 3 }] }] }, { mode: 'Pinhole', effects: [{ causes: [{ severity: 9, occurrence: 3, detection: 5 }] }] }] }];
  s.render();
  s.click('Open details for Qualify the 10-cell short stack for durability testing');
  s.expect('FMEA, RPN summary');
  s.eq('risk summary', s.vals.pov.detail.riskSum, '3 risks, highest RPN 240, 1 high, 1 medium');
  s.eq('worst first', s.vals.pov.detail.risks.map((r) => r.rpn), ['240', '135', '36']);
  s.c.closeAllSheets(); s.render();
  s.click('Open details for Electrolyzer');
  const dv = s.vals.pov.detail;
  s.eq('division summary counts active work only (fixed)', dv.sum[1].v, '2 objectives, 0 milestones');
  s.eq('in the plan', dv.sum[2].v, '3 objectives, 3 milestones');
  s.expect('No initiatives are running late.');
  s.c.closeAllSheets(); s.render();
  s.click('Open details for model Tera 25-30-R5');
  s.eq('model detail', s.vals.pov.detail.specHead, 'Product specifications, ' + Math.round(RD.objectiveScore('MDL-EL-1-1', s.c.D.spec)) + '% conformance');
  s.ok(s.vals.pov.detail.comps.length === 4, 'components');
  s.click('Open in Product spec');
  s.ok(s.c.takeHandoff('spec').model === 'MDL-EL-1-1', 'hands off the model');
  s.c.closeAllSheets(); s.render();
  s.click('Open details for milestone Pilot line ready for customer audit');
  s.eq('milestone detail kpis', s.vals.pov.detail.kpis.length, 1);
  s.eq('projected', s.vals.pov.detail.sched[1].v, 'Dec 18, 2026');
  s.click('Edit milestone');
  s.eq('editor from the detail', s.c.sheet().kind, 'ped.edit');
  s.c.closeAllSheets(); s.render();
  s.clean('details');
});

/* ------------------------------------------------------------------ editor: every entity */
fresh();
go('Structure');
s.step('add a unit', () => {
  s.click('Add unit');
  s.expect('Add unit');
  s.click('Add unit', { within: 'Editor' });
  s.expect('Give the unit a name.');
  s.type('Name', 'Research', { within: 'Editor' });
  s.type('Order', 'abc', { within: 'Editor' });
  s.click('Add unit', { within: 'Editor' });
  s.expect('Order must be a number, like 2.');
  s.type('Order', '3', { within: 'Editor' });
  s.click('Add unit', { within: 'Editor' });
  const u = byId('units', 'UNIT-RESEAR');
  s.ok(!!u, 'UNIT-RESEAR allocated like today');
  s.eq('unit fields', u && [u.name, u.order], ['Research', 3]);
  s.ok(hasToast('Unit added.'), 'Unit added.');
  s.eq('sheet closed', (s.c.state.sheets || []).length, 0);
});
s.step('add a division (kind, unit, duplicate code)', () => {
  s.click('Add division');
  s.type('Name', 'Hydrogen Ops', { within: 'Editor' });
  s.type('Unit', 'UNIT-RESEAR', { within: 'Editor' });
  s.click('Business', { within: 'Kind' });
  s.click('Add division', { within: 'Editor' });
  const d = byId('divisions', 'DIV-HYDR');
  s.eq('division', d && [d.name, d.unitId, d.kind, d.order], ['Hydrogen Ops', 'UNIT-RESEAR', 'biz', null]);
  s.click('Add division');
  s.type('Name', 'Hydro storage', { within: 'Editor' });
  s.click('Add division', { within: 'Editor' });
  s.expect('The id DIV-HYDR is already taken. A division’s id comes from the first four letters of its name, so start the name differently.');
  s.c.closeAllSheets(); s.render();
});
s.step('add a product with a code, then a model', () => {
  s.click('Add product');
  s.type('Name', 'Tera membrane', { within: 'Editor' });
  s.type('Division', 'DIV-EL', { within: 'Editor' });
  s.type('Code', 'TM', { within: 'Editor' });
  s.click('Add product', { within: 'Editor' });
  const p = byId('products', 'PRD-EL-3');
  s.eq('product', p && [p.name, p.divisionId, p.code], ['Tera membrane', 'DIV-EL', 'TM']);
  menu('Tera membrane', 'Add model');
  s.eq('model prefilled with its product', s.c.draft().productId, 'PRD-EL-3');
  s.type('Name', 'TM-50', { within: 'Editor' });
  s.click('Add model', { within: 'Editor' });
  const m = byId('models', 'MDL-EL-3-1');
  s.eq('model', m && [m.name, m.productId], ['TM-50', 'PRD-EL-3']);
  s.ok(hasToast('Model added.'), 'Model added.');
});
s.step('add an initiative with product/model pairing', () => {
  s.click('Add initiative');
  s.type('Name', 'Membrane cost-down', { within: 'Editor' });
  s.type('Division', 'DIV-EL', { within: 'Editor' });
  s.type('Description', 'Cheaper membranes.', { within: 'Editor' });
  s.type('Planned start', '2026-11-01', { within: 'Editor' });
  s.type('Planned end', '2026-10-01', { within: 'Editor' });
  s.type('Model', 'MDL-EL-3-1', { within: 'Editor' });
  s.eq('picking a model fills its product', s.c.draft().productId, 'PRD-EL-3');
  s.type('Product', 'PRD-EL-1', { within: 'Editor' });
  s.eq('another product clears a model that does not belong', s.c.draft().modelId, '');
  s.type('Product', 'PRD-EL-3', { within: 'Editor' });
  s.type('Model', 'MDL-EL-3-1', { within: 'Editor' });
  s.click('Add initiative', { within: 'Editor' });
  s.expect('The planned end is before the planned start.');
  s.type('Planned end', '2027-06-30', { within: 'Editor' });
  s.click('Add initiative', { within: 'Editor' });
  const i = byId('initiatives', 'INIT-EL-03');
  s.eq('initiative stores the model alone', i && [i.name, i.divisionId, i.productId, i.modelId, i.plannedStart, i.plannedEnd, i.desc], ['Membrane cost-down', 'DIV-EL', null, 'MDL-EL-3-1', 2496, 2737, 'Cheaper membranes.']);
});
s.step('add a milestone from the row menu', () => {
  menu('Membrane cost-down', 'Add milestone');
  s.eq('prefilled initiative', s.c.draft().initiativeId, 'INIT-EL-03');
  s.type('Name', 'Pilot roll coated', { within: 'Editor' });
  s.type('Planned date', '2027-02-15', { within: 'Editor' });
  s.type('TRL achieved', '4', { within: 'Editor' });
  s.type('MRL achieved', '', { within: 'Editor' });
  s.click('Add milestone', { within: 'Editor' });
  const m = byId('milestones', 'MS-EL-03-01');
  s.eq('milestone', m && [m.name, m.plannedDate, m.trl, m.mrl, m.completedDate], ['Pilot roll coated', 2602, 4, null, null]);
});
s.step('add an objective: quarter, owners, links, inheritance', () => {
  menu('Membrane cost-down', 'Add objective');
  const d0 = s.c.draft();
  s.eq('prefilled initiative and division', [d0.initiativeId, d0.divisionId], ['INIT-EL-03', 'DIV-EL']);
  s.eq('inherits the initiative model', [d0.productId, d0.modelId, !!d0._inh], ['PRD-EL-3', 'MDL-EL-3-1', true]);
  s.expect('Inherited from the initiative. Leave it to keep inheriting.');
  s.type('Statement', 'Coat 50 m of TM-50 at spec', { within: 'Editor' });
  s.type('Quarter', '2027Q2', { within: 'Editor' });
  s.eq('quarter fills planned dates', [s.c.draft().plannedStart, s.c.draft().plannedEnd], ['2027-04-01', '2027-06-30']);
  s.ok(!s.has('Lena Fischer'), 'disabled users are not offered');
  s.check('~Toru Hayashi', true, { within: 'Editor' });
  s.check('~Priya Natarajan', true, { within: 'Editor' });
  s.check('~Pilot roll coated', true, { within: 'Editor' });
  s.click('Add objective', { within: 'Editor' });
  const o = byId('objectives', 'OBJ-EL-2027Q2-01');
  s.ok(!!o, 'OBJ-EL-2027Q2-01 allocated');
  s.eq('objective', o && [o.statement, o.quarter, o.owner, o.milestoneIds, o.plannedStart, o.plannedEnd], ['Coat 50 m of TM-50 at spec', '2027Q2', ['toru@celadyne.com', 'priya@celadyne.com'], ['MS-EL-03-01'], 2647, 2737]);
  s.eq('inherited class stored blank', o && [o.productId, o.modelId], [null, null]);
});
s.step('objective: classification rules and messages', () => {
  menu('Coat 50 m of TM-50 at spec', 'Edit');
  s.type('Product', 'PRD-EL-1', { within: 'Editor' });
  s.click('Save objective', { within: 'Editor' });
  s.ok(hasToast('Objective saved. Its product and model didn’t fit its initiative, so they were cleared and it inherits the initiative’s again.'), 'a class the initiative forbids is cleared, like today');
  s.eq('cleared', [byId('objectives', 'OBJ-EL-2027Q2-01').productId, byId('objectives', 'OBJ-EL-2027Q2-01').modelId], [null, null]);
  /* an initiative that pins both is a hard block */
  s.c.mutate((D) => { D.portfolio.initiatives.find((y) => y.id === 'INIT-EL-03').productId = 'PRD-EL-3'; }, { quiet: true });
  s.render();
  menu('Coat 50 m of TM-50 at spec', 'Edit');
  s.click('Save objective', { within: 'Editor' });
  s.expect('Classification blocked: its initiative pins both a product and a model. Fix the initiative first.');
  s.c.mutate((D) => { D.portfolio.initiatives.find((y) => y.id === 'INIT-EL-03').productId = null; }, { quiet: true });
  s.render();
  s.type('Initiative', 'INIT-EL-01', { within: 'Editor' });
  s.click('Save objective', { within: 'Editor' });
  s.ok(hasToast('Objective saved.'), 'saved');
  s.eq('moved to the other initiative', byId('objectives', 'OBJ-EL-2027Q2-01').initiativeId, 'INIT-EL-01');
  /* own class that the new initiative forbids is cleared */
  s.c.mutate((D) => { const x = D.portfolio.objectives.find((y) => y.id === 'OBJ-EL-2027Q2-01'); x.initiativeId = 'INIT-EL-03'; x.modelId = 'MDL-EL-3-1'; x.productId = null; }, { quiet: true });
  s.c.mutate((D) => { const x = D.portfolio.initiatives.find((y) => y.id === 'INIT-EL-02'); x.productId = 'PRD-EL-1'; }, { quiet: true });
  s.render();
  s.c.state.sheets = []; s.render();
  menu('Coat 50 m of TM-50 at spec', 'Edit');
  s.type('Initiative', 'INIT-EL-02', { within: 'Editor' });
  s.click('Save objective', { within: 'Editor' });
  s.ok(hasToast('Objective saved. Its product and model were cleared to match the new initiative.'), 'cleared message');
  const o = byId('objectives', 'OBJ-EL-2027Q2-01');
  s.eq('class cleared', [o.productId, o.modelId], [null, null]);
});
s.step('objective: moving division warns, then moves', () => {
  menu('Lock Tera 25-30-R5 components', 'Edit');
  s.type('Division', 'DIV-FC', { within: 'Editor' });
  s.click('Save objective', { within: 'Editor' });
  s.expect('Moving this objective from Electrolyzer to Fuel Cell. Its 2 key results and 3 stage-gates live in Electrolyzer’s execution bin and will not move.');
  s.expect('Move anyway');
  s.eq('not moved yet', byId('objectives', 'OBJ-EL-2026Q4-02').divisionId, 'DIV-EL');
  s.type('Division', 'DIV-BD', { within: 'Editor' });
  s.ok(!s.see('Move anyway'), 'picking another division re-arms the warning');
  s.type('Division', 'DIV-FC', { within: 'Editor' });
  s.expect('Move anyway');
  s.click('Move anyway');
  s.eq('moved', byId('objectives', 'OBJ-EL-2026Q4-02').divisionId, 'DIV-FC');
  s.ok(hasToast('Objective saved.'), 'saved after the second click');
});
s.step('initiative move warning', () => {
  menu('Utility pilot program', 'Edit');
  s.type('Division', 'DIV-EL', { within: 'Editor' });
  s.click('Save initiative', { within: 'Editor' });
  s.expect('Moving this initiative from Business Development to Electrolyzer. Its 2 objectives stay in Business Development.');
  s.click('Cancel');
  s.eq('cancel leaves it', byId('initiatives', 'INIT-BD-01').divisionId, 'DIV-BD');
});
s.step('edit unit and division and model', () => {
  menu('Research', 'Edit');
  s.type('Name', 'Research and development', { within: 'Editor' });
  s.click('Save unit');
  s.eq('unit renamed', byId('units', 'UNIT-RESEAR').name, 'Research and development');
  menu('Hydrogen Ops', 'Edit');
  s.click('R&D', { within: 'Kind' });
  s.click('Save division');
  s.eq('kind', byId('divisions', 'DIV-HYDR').kind, 'rd');
  menu('TM-50', 'Edit');
  s.type('Order', '2', { within: 'Editor' });
  s.click('Save model');
  s.eq('model order', byId('models', 'MDL-EL-3-1').order, 2);
  s.clean('editor');
});
s.step('blank required parent', () => {
  const keep = P().initiatives; s.c.D.portfolio.initiatives = []; s.render();
  s.click('Add initiative');
  s.c.closeAllSheets(); s.render();
  s.c.state.sheets = []; s.render();
  s.c.openSheet('ped.edit', { type: 'milestone', id: null, d0: '{}' }, { name: 'X', initiativeId: '', plannedDate: '', completedDate: '', trl: '', mrl: '', order: '', _why: '' }); s.render();
  s.expect('Add an initiative first.');
  s.click('Add milestone', { within: 'Editor' });
  s.expect('Add an initiative first. Every milestone belongs to one.');
  s.c.closeAllSheets(); s.c.D.portfolio.initiatives = keep; s.render();
});

/* ------------------------------------------------------------------ targets and readings */
fresh();
go('Structure');
s.step('initiative targets: add, record, edit, remove', () => {
  menu('Tera component lock', 'Edit');
  s.expect('Initiative targets');
  s.expect('Stack voltage efficiency (HHV)');
  const row = () => s.vals.ped.edit.targets.rows.find((r) => r.id === 'KPI-EL-01-1');
  s.eq('current value', row().cur, '73.1%');
  s.eq('summary', row().summary, '≥ 75%');
  s.eq('score from the engine', row().score, String(Math.round(RD.kpiScoreResolved(byId('kpis', 'KPI-EL-01-1'), Object.keys(em()).reduce((a, k) => a.concat(em()[k].kpis || []), []), em()))));
  s.click('Add target');
  s.eq('target sheet stacked', s.c.sheet().kind, 'ped.target');
  s.click('Save target');
  s.expect('Give the target a name, like Mass activity.');
  s.type('Name', 'Stack cost', { within: 'Editor' });
  s.click('Statistical', { within: 'Target type' });
  s.type('Readings expected', '0', { within: 'Editor' });
  s.click('Decrease', { within: 'Direction' });
  s.type('Target value', 'cheap', { within: 'Editor' });
  s.click('Save target');
  s.expect('Use a number for the target value, like 1.85.');
  s.type('Target value', '1800', { within: 'Editor' });
  s.click('Save target');
  s.expect('Readings expected must be a whole number of 1 or more, or blank for every reading.');
  s.type('Readings expected', '3', { within: 'Editor' });
  s.type('Statistic', 'median', { within: 'Editor' });
  s.type('Unit', '$/kW', { within: 'Editor' });
  s.click('Save target');
  s.ok(hasToast('Target saved.'), 'Target saved.');
  /* today's allocator counts the milestone target KPI-EL-01-02-1 under the same stem, so the next is 3 */
  s.eq('id allocated exactly like today', RD.allocId('kpi', 'INIT-EL-01', ['KPI-EL-01-1', 'KPI-EL-01-02-1']), 'KPI-EL-01-3');
  const k = byId('kpis', 'KPI-EL-01-3');
  s.eq('new target, id like today', k && [k.hostType, k.hostId, k.name, k.targetType, k.direction, k.target, k.unit, k.statistic, k.readCount, k.objectiveId, k.isDefiner, k.groupId], ['initiative', 'INIT-EL-01', 'Stack cost', 'statistical', 'down', 1800, '$/kW', 'median', 3, null, true, null]);
  s.eq('back in the initiative editor', s.c.sheet().kind, 'ped.edit');
  s.eq('summary', s.vals.ped.edit.targets.rows.find((r) => r.id === 'KPI-EL-01-3').summary, 'Median ≤ 1800 $/kW, 3 readings expected');
  s.click('Record a value for Stack cost');
  s.type('Record a value for Stack cost', 'lots', { within: 'Editor' });
  s.key('Record a value for Stack cost', 'Enter');
  s.expect('Use a number, like 1.85.');
  s.type('Record a value for Stack cost', '1950', { within: 'Editor' });
  s.key('Record a value for Stack cost', 'Enter');
  s.ok(hasToast('Value recorded.'), 'Value recorded.');
  const reads = P().kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-01-3');
  s.eq('reading', reads.map((u) => [u.value, u.note, u.id.indexOf('UPD-KPI-EL-01-3-') === 0, typeof u.timestamp]), [[1950, '', true, 'number']]);
  s.click('Record a value for Stack cost');
  s.type('Record a value for Stack cost', '1700', { within: 'Editor' });
  s.key('Record a value for Stack cost', 'Escape');
  s.eq('Escape cancels', P().kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-01-3').length, 1);
  s.click('Record a value for Stack cost');
  s.type('Record a value for Stack cost', '1750', { within: 'Editor' });
  s.fire(s.find('Record a value for Stack cost', { handler: 'onBlur' }), 'onBlur');
  s.eq('leaving the field saves', P().kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-01-3').length, 2);
  s.click('Edit target Stack cost');
  s.eq('editor loads the target', [s.c.draft().name, s.c.draft().target, s.c.draft().readCount], ['Stack cost', '1800', '3']);
  s.click('Binary', { within: 'Target type' });
  s.ok(!s.has('Target value'), 'binary hides direction and value');
  s.click('Save target');
  s.eq('binary saved', byId('kpis', 'KPI-EL-01-3').targetType, 'binary');
  s.eq('binary summary', s.vals.ped.edit.targets.rows.find((r) => r.id === 'KPI-EL-01-3').summary, 'Binary, met or not met');
  s.click('Remove target Stack cost');
  s.expect('The target and its 2 readings are removed. This can’t be undone.');
  s.click('Remove target');
  s.ok(hasToast('Target removed.'), 'Target removed.');
  s.ok(!byId('kpis', 'KPI-EL-01-3'), 'gone');
  s.eq('its readings removed too (fixed)', P().kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-01-3').length, 0);
  s.clean('targets');
});
s.step('specifications block (read-only)', () => {
  s.expect('Model specifications: Tera 25-30-R5');
  s.expect('Read-only, from Product spec');
  let all = []; Object.keys(s.c.D.spec).forEach((k) => { all = all.concat(s.c.D.spec[k].kpis || []); });
  const want = RD.targetKpisInScope({ products: [], models: ['MDL-EL-1-1'] }, all).map((k) => k.name);
  s.eq('headline KPIs as the engine scopes them', s.vals.ped.edit.specs.rows.map((r) => r.name), want);
  s.eq('specific energy current', s.vals.ped.edit.specs.rows[0].cur, '53.4 kWh/kg');
  s.c.closeAllSheets(); s.render();
  menu('Roll-to-roll membrane scale-up', 'Edit');
  s.expect('Model specifications: HP6-12');
  s.c.closeAllSheets(); s.render();
  s.c.mutate((D) => { const i = D.portfolio.initiatives.find((x) => x.id === 'INIT-EL-02'); i.productId = null; i.modelId = 'MDL-EL-2-1'; }, { quiet: true });
  s.render();
  menu('Stack cost-down', 'Edit');
  s.expect('No headline KPIs on this model yet. Add them in Product spec.');
  s.c.closeAllSheets(); s.render();
  s.c.mutate((D) => { const i = D.portfolio.initiatives.find((x) => x.id === 'INIT-EL-02'); i.productId = 'PRD-EL-1'; i.modelId = null; }, { quiet: true });
  s.render();
  menu('Stack cost-down', 'Edit');
  s.expect('Product specifications: Tera stack');
  s.c.closeAllSheets(); s.render();
});
s.step('milestone targets with value sources', () => {
  menu('Tera design freeze', 'Edit');
  s.expect('Milestone targets');
  const r = s.vals.ped.edit.targets.rows.find((x) => x.id === 'KPI-EL-01-02-1');
  s.eq('source line', r.src, 'Source: Cell voltage at 2 A/cm²');
  s.click('Edit target Cell voltage at 2 A/cm²');
  s.expect('Value sources');
  s.expect('Qualify the 10-cell short stack for durability testing');
  s.ok(s.vals.ped.target.srcRows.filter((x) => x.isKpi && x.on).map((x) => x.label).join() === 'Cell voltage at 2 A/cm²', 'current source ticked');
  s.check('High-frequency resistance', true, { within: 'Editor' });
  s.click('Save target');
  s.eq('two sources', byId('kpis', 'KPI-EL-01-02-1').sources, ['KPI-EL-2026Q4-01-1-1', 'KPI-EL-2026Q4-01-1-2']);
  s.ok(/\(best of 2\)$/.test(s.vals.ped.edit.targets.rows.find((x) => x.id === 'KPI-EL-01-02-1').src), 'best of 2');
  s.click('Add target');
  s.type('Name', 'Manual check', { within: 'Editor' });
  s.click('Save target');
  const k = byId('kpis', 'KPI-EL-01-02-2');
  s.eq('milestone target keeps an empty source list', k && [k.hostType, k.sources], ['milestone', []]);
  s.click('Record a value for Manual check');
  s.type('Record a value for Manual check', '3', { within: 'Editor' });
  s.key('Record a value for Manual check', 'Enter');
  s.eq('manual source line', s.vals.ped.edit.targets.rows.find((x) => x.id === 'KPI-EL-01-02-2').src, 'Source: manual entry');
  s.clean('milestone targets');
});

/* ------------------------------------------------------------------ milestone status and pause */
s.step('milestone status block', () => {
  s.expect('Milestone status');
  s.expect('Achieved');
  s.expect('KPI target met');
  s.click('Create report');
  s.ok(hasToast('Reports open from the Milestones tab.') || (s.c.sheet() && s.c.sheet().kind.indexOf('pms.') === 0), 'report opens (or points to the Milestones tab)');
  s.c.setState({ tab: 'structure', sheets: [] }); s.render();
  menu('First 300 cm² MEA shipped', 'Edit');
  s.expect('No reading yet. Set a completed date, or link a key result or stage-gate to a milestone KPI in Execution.');
  s.type('Completed date', '2026-10-10', { within: 'Editor' });
  s.click('Save milestone');
  s.eq('completed', byId('milestones', 'MS-FC-01-02').completedDate, 2474);
  menu('First 300 cm² MEA shipped', 'Edit');
  s.expect('Marked complete Oct 10, 2026');
  s.c.closeAllSheets(); s.render();
});
s.step('pause, deprioritize, resume', () => {
  menu('Pilot line ready for customer audit', 'Edit');
  s.type('Why (optional)', 'Line down for the shim swap', { within: 'Editor' });
  s.click('Pause');
  s.ok(hasToast('Milestone paused.'), 'Milestone paused.');
  const recs = () => P().milestoneState.filter((x) => x.milestoneId === 'MS-FC-01-01');
  s.eq('record', recs().map((x) => [x.status, x.day, x.note]), [['paused', 2477, 'Line down for the shim swap']]);
  s.expect('Paused since Oct 13, 2026');
  s.expect('Line down for the shim swap');
  s.eq('still open, applied at once', s.c.sheet().kind, 'ped.edit');
  s.click('Resume');
  s.ok(hasToast('Milestone resumed.'), 'Milestone resumed.');
  s.click('Deprioritize');
  s.ok(hasToast('Milestone deprioritized.'), 'Milestone deprioritized.');
  s.eq('history kept', recs().map((x) => x.status), ['paused', 'active', 'deprioritized']);
  s.ok(RD.milestonePaused(P().milestoneState, 'MS-FC-01-01'), 'engine sees it paused');
  s.c.closeAllSheets(); s.render();
  const row = s.vals.pst.h.inits.find((r) => r.id === 'MS-FC-01-01');
  s.eq('structure shows the state', row.stWord, 'Deprioritized');
  menu('Pilot line ready for customer audit', 'Resume');
  s.eq('resumed from the row menu', RD.milestonePaused(P().milestoneState, 'MS-FC-01-01'), false);
  menu('Pilot line ready for customer audit', 'Mark achieved');
  s.eq('achieved today', byId('milestones', 'MS-FC-01-01').completedDate, 2477);
  s.ok(hasToast('Milestone marked achieved.'), 'message');
  menu('Pilot line ready for customer audit', 'Reopen milestone');   /* audit A3: the label now matches its toast and the other tabs */
  s.eq('reopened', byId('milestones', 'MS-FC-01-01').completedDate, null);
});
s.step('PED API for the Gantt and Milestones tab', () => {
  const C = s.c;
  global.PEDT = true;
  C.setState({ sheets: [] }); s.render();
  s.ok(typeof s.vals.ped === 'object', 'ped vm');
});
s.step('milestone list in the initiative editor', () => {
  menu('Roll-to-roll membrane scale-up', 'Edit');
  s.expect('Pilot line ready for customer audit');
  s.click('Add milestone', { within: 'Milestones' });
  s.eq('stacked milestone editor', [s.c.sheet().kind, s.c.sheet().data.type, s.c.draft().initiativeId], ['ped.edit', 'milestone', 'INIT-FC-01']);
  s.type('Name', 'Roll-to-roll line handover', { within: 'Editor' });
  s.click('Add milestone', { within: 'Editor' });
  s.eq('returns to the initiative editor', [s.c.sheet().data.type, s.c.sheet().data.id], ['initiative', 'INIT-FC-01']);
  s.ok(!!byId('milestones', 'MS-FC-01-03'), 'MS-FC-01-03 added');
  s.click('Edit milestone Roll-to-roll line handover');
  s.click('Back');
  s.eq('cancel returns too', s.c.sheet().data.type, 'initiative');
  s.c.mutate((D) => { D.portfolio.objectives.find((o) => o.id === 'OBJ-FC-2026Q4-01').milestoneIds.push('MS-FC-01-03'); }, { quiet: true }); s.render();
  s.click('Remove milestone Roll-to-roll line handover');
  s.click('Delete milestone');
  s.ok(hasToast('Milestone deleted.'), 'Milestone deleted.');
  s.ok(!byId('milestones', 'MS-FC-01-03'), 'gone');
  s.eq('dropped from linked objectives', byId('objectives', 'OBJ-FC-2026Q4-01').milestoneIds, ['MS-FC-01-01']);
  s.c.closeAllSheets(); s.render();
  s.clean('milestone list');
});

/* ------------------------------------------------------------------ lineage */
s.step('lineage', () => {
  s.click('Tera component lock', { within: 'Initiatives' });
  const L = () => s.vals.ped.lineage;
  s.eq('title', L().title, 'Tera component lock');
  s.eq('crumbs', L().crumbs.map((c) => c.label), ['Electrolyzer']);
  s.ok(L().rows.some((r) => r.tag === 'Milestone' && r.label === 'Tera design freeze'), 'milestones under it');
  s.ok(L().rows.some((r) => r.tag === 'SG-A1' && r.label === 'Build and leak-test the stack'), 'gate labels SG-A1');
  s.ok(L().rows.some((r) => r.tag === 'Workstream' && r.label === 'Teardown and analysis'), 'workstream headers');
  s.ok(L().rows.some((r) => r.tag === 'Key result'), 'key results');
  s.click('Collapse Qualify the 10-cell short stack for durability testing');
  s.ok(!L().rows.some((r) => r.tag === 'SG-A1' && r.label === 'Build and leak-test the stack'), 'collapsed');
  s.click('Expand Qualify the 10-cell short stack for durability testing');
  s.click('Electrolyzer', { within: 'Where this sits' });
  s.eq('navigated to the division', L().title, 'Electrolyzer');
  s.ok(L().rows.some((r) => r.tag === 'Product' && r.label === 'Tera stack'), 'products under the division');
  s.click('Tera 25-30-R5', { within: 'Structure below' });
  s.eq('model', L().title, 'Tera 25-30-R5');
  s.eq('related groups', L().groups.map((g) => g.title), ['Initiatives classified here', 'Used in']);
  s.expect('Open in Product spec');
  s.click('Back');
  s.eq('back to the division', L().title, 'Electrolyzer');
  s.click('Back');
  s.eq('back to the initiative', L().title, 'Tera component lock');
  s.click('Edit initiative');
  s.eq('edit this', [s.c.sheet().kind, s.c.sheet().data.id], ['ped.edit', 'INIT-EL-01']);
  s.c.closeAllSheets(); s.render();
  s.click('Lock Tera 25-30-R5 components', { within: 'Initiatives' });
  s.eq('objective related', L().groups.map((g) => g.title), ['Linked milestones']);
  s.ok(s.all('Open in Execution').length > 0, 'objective opens Execution');
  s.c.closeAllSheets(); s.render();
  s.click('Utility pilot program', { within: 'Initiatives' });
  s.click('Close three utility pilot agreements', { within: 'Structure below' });
  s.eq('biz objective', L().title, 'Close three utility pilot agreements');
  s.ok(L().rows.some((r) => r.tag === 'Key result' && r.label === 'Sign three pilot agreements'), 'reads the BIZ- doc (fixed)');
  s.ok(s.all('Open in Sales').length > 0, 'biz objective opens Sales');
  s.eq('sales link', s.all('Open in Sales')[0].attrs.href, 'Sales-A.dc.html');
  s.click('Open in Sales');
  s.eq('hands off to sales', s.c.takeHandoff('sales').objective, 'OBJ-BD-2026Q4-01');
  s.c.closeAllSheets(); s.render();
  s.clean('lineage');
});

/* ------------------------------------------------------------------ delete */
fresh();
go('Structure');
s.step('delete a milestone (nothing nested)', () => {
  menu('Tera design freeze', 'Delete');
  s.expect('Delete Tera design freeze?');
  s.expect('This can’t be undone.');
  s.click('Delete milestone');
  s.ok(hasToast('Milestone deleted.'), 'Milestone deleted.');
  s.ok(!byId('milestones', 'MS-EL-01-02'), 'gone');
  s.eq('links cleaned', [byId('objectives', 'OBJ-EL-2026Q4-01').milestoneIds, byId('objectives', 'OBJ-EL-2026Q4-02').milestoneIds], [[], []]);
  s.ok(!byId('kpis', 'KPI-EL-01-02-1'), 'its targets removed (fixed)');
});
s.step('delete a unit: divisions become Unassigned', () => {
  menu('Technical', 'Delete');
  s.expect('Delete unit Technical?');
  s.expect('2 divisions in this unit will become Unassigned. They are not deleted.');
  s.click('Delete unit');
  s.ok(hasToast('Unit deleted.'), 'Unit deleted.');
  s.eq('divisions kept, unit cleared', ['DIV-FC', 'DIV-EL'].map((id) => byId('divisions', id).unitId), [null, null]);
  go('Overview');
  s.ok(s.vals.pov.units.some((u) => u.name === 'Unassigned' && u.divs.length === 2), 'Overview shows them under Unassigned');
  s.ok(!s.vals.pov.units.find((u) => u.name === 'Unassigned').hasScore, 'Unassigned has no score');
  go('Structure');
});
s.step('delete an initiative and its items', () => {
  menu('Tera component lock', 'Delete');
  s.eq('delete sheet', s.c.sheet().kind, 'ped.delete');
  s.expect('This initiative contains 2 objectives and 1 milestone. Delete those too, or keep them?');
  s.click('Delete initiative and 3 items');
  s.ok(hasToast('Initiative and 3 items deleted.'), 'message with count');
  s.ok(!byId('initiatives', 'INIT-EL-01') && !byId('objectives', 'OBJ-EL-2026Q4-01') && !byId('milestones', 'MS-EL-01-01'), 'all gone');
  s.ok(!byId('kpis', 'KPI-EL-01-1'), 'initiative target removed (fixed)');
  s.ok(!P().kpiUpdates.some((u) => u.kpiId === 'KPI-EL-01-1'), 'its readings removed (fixed)');
  s.eq('objective edges cleaned (fixed)', P().objectiveEdges, []);
  s.eq('sheet closed', (s.c.state.sheets || []).length, 0);
});
s.step('delete a product only: models lose the link', () => {
  menu('Tera system', 'Delete');
  s.expect('This product contains 1 model. Delete those too, or keep them?');
  s.ok(s.all('Delete product only')[0].attrs.title === 'Keep the nested items; they lose their product link', 'tooltip');
  s.click('Delete product only');
  s.ok(hasToast('Product deleted.'), 'Product deleted.');
  s.eq('model kept, link cleared (fixed)', byId('models', 'MDL-EL-2-1').productId, null);
});
s.step('delete a division and everything in it', () => {
  menu('Fuel Cell', 'Delete');
  s.expect('This division contains 1 product, 1 model, 2 initiatives, 5 objectives and 2 milestones. Delete those too, or keep them?');
  s.click('Delete division and 11 items');
  s.ok(hasToast('Division and 11 items deleted.'), 'cascade message');
  s.ok(!P().objectives.some((o) => o.divisionId === 'DIV-FC'), 'objectives gone');
  s.ok(!P().products.some((p) => p.divisionId === 'DIV-FC'), 'products gone');
  s.clean('delete');
});
s.step('cancel a delete', () => {
  menu('Utility pilot program', 'Delete');
  s.click('Cancel', { within: 'Editor' });
  s.ok(!!byId('initiatives', 'INIT-BD-01'), 'kept');
  menu('Business Development', 'Delete');
  s.click('Cancel', { within: 'Editor' });
  s.ok(!!byId('divisions', 'DIV-BD'), 'kept');
});
s.step('delete from the editor footer', () => {
  menu('Build the Q1 hydrogen-hub pipeline', 'Edit');
  s.click('Delete objective');
  s.click('Delete objective', { within: '~Delete Build' });
  s.ok(!byId('objectives', 'OBJ-BD-2027Q1-01'), 'deleted');
  s.eq('editor of a deleted record closes', (s.c.state.sheets || []).length, 0);
});

/* ------------------------------------------------------------------ dirty sheets and escape */
fresh();
go('Structure');
s.step('closing a changed editor asks first', () => {
  menu('Technical', 'Edit');
  s.type('Name', 'Changed', { within: 'Editor' });
  s.click('Close panel');
  s.expect('Discard your changes?');
  s.click('Cancel', { within: 'Discard your changes?' });
  s.ok(!!s.c.sheet(), 'still open');
  s.click('Close panel');
  s.click('Discard changes');
  s.eq('closed', (s.c.state.sheets || []).length, 0);
  s.eq('nothing saved', byId('units', 'UNIT-TECHNI').name, 'Technical');
  menu('Technical', 'Edit');
  s.click('Close panel');
  s.eq('unchanged editor closes straight away', (s.c.state.sheets || []).length, 0);
  menu('Technical', 'Edit');
  s.type('Name', 'Changed again', { within: 'Editor' });
  s.key('Editor', 'Escape');
  s.expect('Discard your changes?');
  s.click('Discard changes');
  s.eq('Escape with changes asks, then closes', (s.c.state.sheets || []).length, 0);
  menu('Technical', 'Edit');
  s.key('Editor', 'Escape');
  s.eq('Escape closes an unchanged editor', (s.c.state.sheets || []).length, 0);
  menu('Technical', 'Edit');
  s.type('Name', 'Draft name', { within: 'Editor' });
  s.click('Show lineage', { within: 'Editor' });   /* audit A3: plain verb, like the row menus */
  s.eq('lineage stacks over the editor', s.c.state.sheets.map((x) => x.kind), ['ped.edit', 'ped.lineage']);
  s.click('Edit unit');
  s.expect('Discard your changes?');
  s.click('Cancel', { within: 'Discard your changes?' });
  s.click('Back');
  s.eq('draft kept', s.c.draft().name, 'Draft name');
  s.c.closeAllSheets(); s.render();
});

/* ------------------------------------------------------------------ hand-off into Planning */
s.step('hand-off opens lineage', () => {
  s.c.handoff({ app: 'plan', tab: 'structure', objective: 'OBJ-EL-2026Q4-01' });
  const t = new Sim(FILE);
  t.eq('tab from the hand-off', t.c.state.tab, 'structure');
  t.eq('lineage open', t.c.sheet() && t.c.sheet().kind, 'ped.lineage');
  t.eq('focus', t.c.state.focus, { type: 'objective', id: 'OBJ-EL-2026Q4-01' });
});

done();
