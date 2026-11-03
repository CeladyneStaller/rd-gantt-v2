/* Scenario tests for P-gantt: the Planning Gantt tab (mods/pgt), the Milestones tab and the
   milestone report (mods/pms). Run: node test/sc_gantt.js out/pgantt/Plan-A.dc.html */
const path = require('path');
const { Sim, done } = require('./dc');
const RD = require(require('./engine_path'));
const FILE = process.argv[2] || 'out/pgantt/Plan-A.dc.html';
const D = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(2020, 0, 1)) / 86400000);
const TODAY = D('2026-10-13');

/* ---------------------------------------------------------------- helpers */
function fresh(tab) {
  const s = new Sim(FILE);
  if (tab) s.click(tab, { within: 'Views' });
  return s;
}
const rows = (s) => s.vals.pgt.rows;
const keys = (s) => rows(s).map((r) => r.key);
const row = (s, k) => rows(s).find((r) => r.key === k) || null;
const hasRow = (s, k) => keys(s).indexOf(k) >= 0;
const num = (style, prop) => { const m = new RegExp(prop + ':\\s*(?:max\\()?(-?[0-9.]+)%').exec(style || ''); return m ? Number(m[1]) : null; };
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= (tol == null ? 0.02 : tol);
const hitEl = (s, k) => s.find((el) => el.tag === 'button' && !!el.on.onClick && /pgt-(bar|mk|gbar|kbspan)/.test(el.attrs.class || ''), { within: k });
function emOf(s) {
  const m = {};
  Object.keys(s.c.D.docs).forEach((k) => { m[k.replace(/^(EXEC|BIZ)-/, '')] = s.c.D.docs[k]; });
  return RD.withPortfolio(s.c.D.portfolio, m);
}
function liveP(P) {
  const ids = {};
  (P.milestones || []).forEach((m) => { if (RD.milestonePaused(P.milestoneState, m.id)) ids[m.id] = 1; });
  return Object.assign({}, P, {
    milestones: P.milestones.filter((m) => !ids[m.id]),
    objectives: P.objectives.map((o) => Object.assign({}, o, { milestoneIds: (o.milestoneIds || []).filter((x) => !ids[x]) }))
  });
}
const cascOf = (s) => RD.cascade(liveP(s.c.D.portfolio), emOf(s), TODAY);
const ms = (s, id) => s.c.D.portfolio.milestones.find((m) => m.id === id);
const obj = (s, id) => s.c.D.portfolio.objectives.find((o) => o.id === id);
const popFacts = (s) => { const p = s.vals.pgt.pop; const o = {}; (p ? p.facts : []).forEach((f) => { o[f.k] = f.v; }); return o; };
const msRows = (s) => s.vals.pms.rows.filter((r) => r.isMs);
const msRow = (s, id) => msRows(s).find((r) => r.id === id) || null;
const sheetKind = (s) => { const t = s.c.sheet(); return t ? t.kind : ''; };

/* ============================================================ GANTT */
(function gantt() {
  const s = fresh('Gantt');
  s.step('the Gantt renders the hierarchy', () => {
    s.clean('gantt first render');
    s.expect('Collapse to');
    const k = keys(s);
    s.eq('unit rows lead', [k[0], k.indexOf('grp:unit:UNIT-BUSINE') > 0], ['grp:unit:UNIT-TECHNI', true]);
    s.ok(k.indexOf('division:DIV-FC') === 1 && k.indexOf('initiative:INIT-FC-01') === 2, 'Unit > Division > Initiative order');
    /* under an initiative: milestones keep their slots, objectives sort by end date */
    const ini = ['milestone:MS-FC-01-01', 'milestone:MS-FC-01-02', 'objective:OBJ-FC-2026Q3-01', 'objective:OBJ-FC-2026Q4-01', 'objective:OBJ-FC-2027Q1-01'].map((x) => k.indexOf(x));
    s.ok(ini.every((v, i) => v > 0 && (i === 0 || v > ini[i - 1])), 'milestones first, then objectives by end date');
    s.ok(k.indexOf('objective:OBJ-EL-2026Q4-02') < k.indexOf('objective:OBJ-EL-2026Q4-01'), 'Nov 20 ends before Dec 18, ignoring Order');
    s.expect('Units, divisions, initiatives and objectives');
  });
  s.step('axis, gridlines, today line and the domain', () => {
    const v = s.vals.pgt;
    s.eq('axis domain (a tile starting Jun 22 to the plan end Mar 31)', [v.lo, v.hi], [D('2026-06-22'), D('2027-03-31')]);
    ['Q3 2026', 'Q4 2026', 'Q1 2027'].forEach((q) => s.ok(v.axis.some((a) => a.text === q), 'quarter label ' + q));
    s.ok(!v.axis.some((a) => a.text === 'Q2 2026'), 'the clipped Q2 label would collide with Q3 nine days in, so it is left out');
    s.ok(v.axis.some((a) => a.text === 'Nov' && a.cls === 'pgt-ml'), 'month labels exist (shown from 1100 px by a container query)');
    s.ok(v.grid.filter((g) => g.cls === 'pgt-gq').length === 3, 'three quarter gridlines inside the domain');
    s.ok(v.todayIn && near(num(v.todayStyle, 'left'), (TODAY - v.lo) / (v.hi - v.lo) * 100), 'today line at Oct 13');
    s.expect('Today, Oct 13');
  });
  s.step('objective bars follow the planned dates', () => {
    const v = s.vals.pgt, r = row(s, 'objective:OBJ-EL-2026Q4-01');
    const L = (D('2026-10-01') - v.lo) / (v.hi - v.lo) * 100, W = (D('2026-12-18') - D('2026-10-01')) / (v.hi - v.lo) * 100;
    s.ok(near(num(r.hit.style, 'left'), L) && near(num(r.hit.style, 'width'), W, 0.05), 'bar spans Oct 1 to Dec 18');
    s.ok(/t-warn/.test(r.hit.cls), 'score 73 bands the bar at risk');
    s.eq('score from the engine', Math.round(RD.rollupObjective('OBJ-EL-2026Q4-01', s.c.D.portfolio, emOf(s))), 73);
    s.ok(/pgt-dot t-warn/.test(r.dotCls), 'band dot on the row');
    const q1 = row(s, 'objective:OBJ-FC-2027Q1-01');
    s.ok(/t-none/.test(q1.hit.cls), 'an unscored objective reads no score');
    const div = row(s, 'division:DIV-FC');
    s.ok(/derived/.test(div.hit.cls), 'a division is a dashed roll-up of its initiatives');
  });
  s.step('ended objectives get an end marker', () => {
    const r = row(s, 'objective:OBJ-FC-2026Q3-01');
    const end = r.shapes.find((x) => /pgt-end/.test(x.cls));
    s.ok(!!end && /achieved/.test(end.cls) && end.title === 'Achieved Sep 25', 'achieved marker on Sep 25');
    s.ok(!r.shapes.some((x) => /pgt-slip/.test(x.cls)), 'closed on time: no slip');
  });
  s.step('milestone diamonds: ghost at the plan, marker at the projection', () => {
    const casc = cascOf(s);
    const r = row(s, 'milestone:MS-FC-01-01');
    s.eq('cascade puts the audit milestone at Dec 18', casc.milestoneEffective['MS-FC-01-01'], D('2026-12-18'));
    s.ok(/pgt-mk pending/.test(r.hit.cls) && r.hit.title === 'Projected Dec 18', 'status marker at the projection, titled');
    s.ok(r.shapes.some((x) => /pgt-mk ghost/.test(x.cls) && x.title === 'Planned Dec 11') && r.shapes.some((x) => x.cls === 'pgt-conn'), 'ghost at Dec 11 plus a connector');
    const done1 = row(s, 'milestone:MS-EL-01-01');
    s.ok(/pgt-mk passed/.test(done1.hit.cls) && /Completed Sep 30 \(-2 days\)/.test(done1.hit.title), 'completed early: green, titled with the date and the -2 days');
    const kpiMet = row(s, 'milestone:MS-EL-01-02');
    s.ok(/pgt-mk passed/.test(kpiMet.hit.cls), 'achieved on its KPIs alone: green');
    s.ok(/pgt-dot dia t-ok/.test(kpiMet.dotCls), 'milestone rows carry a diamond dot');
  });
  s.step('stage-gates: labels, states, ghosts', () => {
    s.eq('gate labels', ['SG-EL-2026Q4-01-1', 'SG-EL-2026Q4-01-2', 'SG-EL-2026Q4-01-3', 'SG-EL-2026Q4-01-4', 'SG-EL-2026Q4-01-5'].map((g) => row(s, 'stagegate:' + g).tag), ['SG-A1', 'SG-A2', 'SG-A3', 'SG-B1', 'SG-B2']);
    s.ok(hasRow(s, 'stagegateset:SGSET-EL-2026Q4-01-1') && hasRow(s, 'stagegateset:SGSET-EL-2026Q4-01-2'), 'two workstreams show set rows');
    s.ok(!hasRow(s, 'stagegateset:SGSET-EL-2026Q4-02-1'), 'a single workstream hangs its gates off the objective');
    const od = row(s, 'stagegate:SG-EL-2026Q4-02-2');
    s.ok(/pgt-mk sq overdue/.test(od.hit.cls) && /Overdue, forecast Oct 13, planned Oct 8/.test(od.hit.title), 'overdue gate forecasts to today');
    s.ok(od.shapes.some((x) => /sq ghost/.test(x.cls) && x.title === 'Planned Oct 8'), 'ghost square at the planned date');
    s.ok(/passed-late/.test(row(s, 'stagegate:SG-FC-2026Q4-01-2').hit.cls), 'a late pass is amber');
    s.eq('a business division gets its gates and labels too (BIZ- doc)', row(s, 'stagegate:SG-BD-2026Q4-01-1').tag, 'SG-A1');
    s.ok(s.vals.pgt.hasGates, 'gate legend shows when gates are on screen');
    s.expect('Committed or planned date');
  });
  s.step('sales tracking: KR milestone steps and Kanban boards', () => {
    const kr = row(s, 'milestonekr:KR-EL-2026Q4-02-2');
    s.ok(!!kr && kr.tag === 'KR', 'milestone KR row tagged KR');
    const steps = ['ST-1', 'ST-2', 'ST-3'].map((x) => row(s, 'mstep:KR-EL-2026Q4-02-2/' + x));
    s.ok(steps.every((x) => x && x.tag === 'KR-M1'), 'its dated steps are tagged KR-M1');
    s.ok(/pgt-mk done/.test(steps[0].hit.cls) && /pgt-mk pending/.test(steps[1].hit.cls), 'done step green, upcoming step pending');
    s.ok(row(s, 'mstep:KR-BD-2026Q4-01-1/ST-1').tag === 'KR-M1', 'the business KR shows too');
    const b = row(s, 'board:BRD-EL-LOCK');
    s.ok(!!b && b.hasChev && b.open === false, 'a board starts collapsed');
    s.ok(!hasRow(s, 'boardtile:BRD-EL-LOCK/tile-ptl'), 'its tiles are hidden until opened');
    const board = s.c.D.docs['EXEC-DIV-EL'].boards.find((x) => x.id === 'BRD-EL-LOCK');
    const want = board.columns.map((c, k) => String(RD.boardGateSummary(board, k, '2026-10-13').passed));
    s.eq('one square per column, labelled with the passed count', b.shapes.filter((x) => /sq/.test(x.cls)).map((x) => x.txt), want);
    s.click(b.chevLabel);
    s.ok(hasRow(s, 'boardtile:BRD-EL-LOCK/tile-ptl') && !hasRow(s, 'boardtile:BRD-EL-LOCK/tile-rods'), 'opening shows dated tiles (an unstarted tile has no dates)');
    const tile = row(s, 'boardtile:BRD-EL-LOCK/tile-bpp');
    s.ok(tile.shapes.some((x) => /sq passed/.test(x.cls)) && tile.shapes.some((x) => /sq (pending|overdue)/.test(x.cls)), 'tile squares per gate state');
    s.ok(hasRow(s, 'board:BRD-BD-PIPE'), 'the Sales pipeline board shows under its objective');
    s.clean('boards');
  });
  s.step('Collapse to and Expand all', () => {
    s.click('Initiatives', { within: 'Collapse to' });
    s.ok(hasRow(s, 'initiative:INIT-EL-01') && !keys(s).some((k) => /^objective:/.test(k)), 'collapse to initiatives hides objectives');
    s.ok(hasRow(s, 'division:DIV-EL') && hasRow(s, 'grp:unit:UNIT-TECHNI'), '...ancestors stay open');
    s.click('Objectives', { within: 'Collapse to' });
    s.ok(hasRow(s, 'objective:OBJ-EL-2026Q4-01') && !keys(s).some((k) => /^stagegate/.test(k)), 'collapse to objectives hides gates');
    s.click('Units', { within: 'Collapse to' });
    s.eq('collapse to units', keys(s), ['grp:unit:UNIT-TECHNI', 'grp:unit:UNIT-BUSINE']);
    s.click('Divisions', { within: 'Collapse to' });
    s.eq('collapse to divisions', keys(s), ['grp:unit:UNIT-TECHNI', 'division:DIV-FC', 'division:DIV-EL', 'grp:unit:UNIT-BUSINE', 'division:DIV-BD']);
    s.click('Expand all', { within: 'Collapse to' });
    s.ok(hasRow(s, 'stagegate:SG-EL-2026Q4-01-1') && hasRow(s, 'boardtile:BRD-BD-PIPE/tile-snake'), 'expand all opens everything, boards included');
    s.click('Collapse Fuel Cell');
    s.ok(hasRow(s, 'division:DIV-FC') && !hasRow(s, 'initiative:INIT-FC-01'), 'a row chevron folds that branch');
    s.click('Expand Fuel Cell');
    s.ok(hasRow(s, 'initiative:INIT-FC-01'), '...and opens it again');
  });
  s.step('Active only', () => {
    s.click('Active only');
    s.eq('pressed', s.vals.pgt.activeOn, 'true');
    s.ok(!hasRow(s, 'objective:OBJ-FC-2026Q3-01'), 'complete (score 100) objective hidden');
    s.ok(!hasRow(s, 'objective:OBJ-EL-2027Q1-01') && !hasRow(s, 'initiative:INIT-EL-02'), 'next quarter work hidden, and its initiative with it');
    s.ok(hasRow(s, 'objective:OBJ-EL-2026Q4-01'), 'this quarter work stays');
    s.click('Active only');
    s.ok(hasRow(s, 'objective:OBJ-FC-2026Q3-01'), 'off again restores');
  });
  s.step('paused milestones', () => {
    s.ok(!hasRow(s, 'milestone:MS-EL-02-01'), 'a deprioritized milestone is hidden by default');
    s.expect('1 paused');
    s.click('1 paused');
    const r = row(s, 'milestone:MS-EL-02-01');
    s.ok(!!r && /ghost paused/.test(r.hit.cls) && r.hit.title === 'Deprioritized, was planned Feb 26, 2027', 'shown as a ghost at its planned date');
    s.ok(/paused/.test(r.cls), 'its row reads as inactive');
    s.click('1 paused');
    s.ok(!hasRow(s, 'milestone:MS-EL-02-01'), 'hidden again');
  });
  s.step('details popover and keyboard-free date moves', () => {
    s.c.toggleMenu('');
    s.fire(hitEl(s, 'objective:OBJ-EL-2026Q4-01'), 'onClick');
    const f = popFacts(s);
    s.eq('popover facts', [f.Owner, f.Quarter, f.Planned, f['Projected end'], f.Score], ['Toru', 'Q4 2026', 'Oct 1 to Dec 18', 'Dec 18', '73, at risk']);
    s.ok(/sel/.test(row(s, 'objective:OBJ-EL-2026Q4-01').cls), 'the row is highlighted');
    s.expect('Open in Execution');
    s.click('Week later', { within: 'gantt-details' });
    s.eq('a week later', [obj(s, 'OBJ-EL-2026Q4-01').plannedStart, obj(s, 'OBJ-EL-2026Q4-01').plannedEnd], [D('2026-10-08'), D('2026-12-25')]);
    s.expect('Moved a week later.');
    s.ok(!popFacts(s)['Heads-up'], 'Dec 25 is still inside Q4 2026');
    s.click('Week later', { within: 'gantt-details' });
    s.ok(/run outside Q4 2026/.test(popFacts(s)['Heads-up'] || ''), 'warns once the dates leave the quarter tag');
    s.click('Week earlier', { within: 'gantt-details' });
    s.click('Week earlier', { within: 'gantt-details' });
    s.eq('back', obj(s, 'OBJ-EL-2026Q4-01').plannedStart, D('2026-10-01'));
    s.click('Close details');
    s.ok(!s.vals.pgt.hasPop, 'closed');
    s.fire(hitEl(s, 'milestone:MS-FC-01-01'), 'onClick');
    s.eq('milestone facts', [popFacts(s).Planned, popFacts(s).Effective, popFacts(s)['TRL / MRL']], ['Dec 11', 'Dec 18 (+7 days)', '5 / 4']);
    s.click('Mark achieved', { within: 'gantt-details' });
    s.eq('mark achieved sets the completed date to today', ms(s, 'MS-FC-01-01').completedDate, TODAY);
    s.expect('Milestone marked achieved.');
    s.click('Reopen milestone', { within: 'gantt-details' });
    s.eq('reopen clears it', ms(s, 'MS-FC-01-01').completedDate, null);
    s.click('Close details');
    s.fire(hitEl(s, 'stagegate:SG-EL-2026Q4-01-2'), 'onClick');
    s.eq('gate facts', [popFacts(s).Planned, popFacts(s).Committed, popFacts(s).Status], ['Nov 13', 'Nov 13, locked', 'Pending']);
    s.click('Open in Execution', { within: 'gantt-details' });
    s.ok(/"objective":"OBJ-EL-2026Q4-01"/.test(global.window.sessionStorage.getItem('celadyne-calm-open') || ''), 'hands the objective to Execution');
    s.c.closeMenus(); s.render();
    s.fire(hitEl(s, 'objective:OBJ-BD-2026Q4-01'), 'onClick');
    s.expect('Open in Sales');
    s.c.closeMenus(); s.render();
    s.clean('popovers');
  });
  s.step('pointer drag moves planned dates', () => {
    const v = s.vals.pgt, span = v.hi - v.lo;
    const el = hitEl(s, 'objective:OBJ-FC-2026Q4-02');
    s.fire(el, 'onPointerDown', { clientX: 100 });
    s.fire(hitEl(s, 'objective:OBJ-FC-2026Q4-02'), 'onPointerMove', { clientX: 150 });
    const dd = Math.round(50 / 1000 * span);
    s.ok(/drag/.test(row(s, 'objective:OBJ-FC-2026Q4-02').hit.cls), 'the bar follows the pointer');
    s.fire(hitEl(s, 'objective:OBJ-FC-2026Q4-02'), 'onPointerUp', { clientX: 150 });
    s.eq('moved by the dragged days', [obj(s, 'OBJ-FC-2026Q4-02').plannedStart, obj(s, 'OBJ-FC-2026Q4-02').plannedEnd], [D('2026-10-05') + dd, D('2026-12-11') + dd]);
    s.expect('Moved ' + dd + ' days later.');
    s.fire(hitEl(s, 'objective:OBJ-FC-2026Q4-02'), 'onClick');
    s.ok(!s.vals.pgt.hasPop, 'the click that ends a drag does not open the details');
    const m = hitEl(s, 'milestone:MS-BD-01-01');
    s.fire(m, 'onPointerDown', { clientX: 300 });
    s.fire(hitEl(s, 'milestone:MS-BD-01-01'), 'onPointerMove', { clientX: 280 });
    s.fire(hitEl(s, 'milestone:MS-BD-01-01'), 'onPointerUp', { clientX: 280 });
    s.eq('milestone planned date moved earlier', ms(s, 'MS-BD-01-01').plannedDate, D('2027-02-19') - Math.round(20 / 1000 * span));
    s.ok(!hitEl(s, 'objective:OBJ-FC-2026Q3-01').on.onPointerDown, 'an ended objective cannot be dragged');
    s.ok(!row(s, 'milestone:MS-EL-01-01').hit.down, 'a completed milestone cannot be dragged');
  });
  s.step('name column resize', () => {
    const g = s.find('Drag to resize the name column', { handler: 'onPointerDown' });
    s.fire(g, 'onPointerDown', { clientX: 100 });
    s.fire(s.find('Drag to resize the name column', { handler: 'onPointerMove' }), 'onPointerMove', { clientX: 160 });
    s.ok(/--pg-labelw: 300px/.test(s.vals.pgt.chartStyle), 'drag widens the column');
    s.fire(s.find('Drag to resize the name column', { handler: 'onPointerMove' }), 'onPointerMove', { clientX: -900 });
    s.eq('clamped at 140', s.c.state.pg_labelw, 140);
    s.fire(s.find('Drag to resize the name column', { handler: 'onPointerMove' }), 'onPointerMove', { clientX: 2000 });
    s.eq('clamped at 640', s.c.state.pg_labelw, 640);
    s.fire(s.find('Drag to resize the name column', { handler: 'onPointerUp' }), 'onPointerUp');
    s.fire(s.find('Drag to resize the name column', { handler: 'onDoubleClick' }), 'onDoubleClick');
    s.eq('double-click resets to 240', s.c.state.pg_labelw, 240);
    s.key('Drag to resize the name column', 'ArrowRight');
    s.eq('arrow keys nudge it', s.c.state.pg_labelw, 260);
    s.key('Drag to resize the name column', 'Home');
    s.eq('Home resets', s.c.state.pg_labelw, 240);
  });
  s.step('row actions go through the Planning editor', () => {
    s.click('Edit objective', { within: 'objective:OBJ-EL-2026Q4-01' });
    s.ok(sheetKind(s) === 'ped.edit' || /not available/.test(s.text), 'edit opens the objective editor');
    s.c.closeAllSheets(); s.render();
    s.click('Add objective here', { within: 'initiative:INIT-EL-01' });
    s.ok(sheetKind(s) === 'ped.edit' ? s.c.draft().initiativeId === 'INIT-EL-01' : /not available/.test(s.text), 'add objective pre-fills the initiative');
    s.c.closeAllSheets(); s.render();
    s.click('Add milestone here', { within: 'initiative:INIT-EL-01' });
    s.ok(sheetKind(s) === 'ped.edit' ? s.c.draft().initiativeId === 'INIT-EL-01' : /not available/.test(s.text), 'add milestone pre-fills the initiative');
    s.c.closeAllSheets(); s.render();
    s.click('Add initiative here', { within: 'division:DIV-BD' });
    s.ok(sheetKind(s) === 'ped.edit' ? s.c.draft().divisionId === 'DIV-BD' : /not available/.test(s.text), 'add initiative pre-fills the division');
    s.c.closeAllSheets(); s.render();
    s.click('Tera component lock', { within: 'initiative:INIT-EL-01' });
    s.ok(sheetKind(s) === 'ped.lineage' || /not available/.test(s.text), 'a name opens lineage');
    s.c.closeAllSheets(); s.render();
    s.click('Delete milestone', { within: 'milestone:MS-BD-01-01' });
    s.ok(!!s.c.state.dlg || sheetKind(s) === 'ped.delete' || /not available/.test(s.text), 'delete asks first');
    s.c.dlgCancel(); s.c.closeAllSheets(); s.render();
    s.ok(!!ms(s, 'MS-BD-01-01'), 'nothing deleted without confirming');
  });
  s.step('legend', () => {
    ['On track', 'At risk', 'Off track', 'No score yet', 'Dates inferred', 'Slip past the planned end', 'Milestone: planned date, then effective date', 'Today'].forEach((t) => s.expect(t));
    s.expectNot('baseline', 'the unused baseline swatch is gone');
  });
})();

/* ---------------------------------------------------------- timeframe */
(function timeframe() {
  const s = fresh('Gantt');
  s.step('timeframe grid', () => {
    s.eq('years offered', s.vals.pgt.years.map((y) => y.label), ['2026', '2027']);
    s.expect('Turn on Timeframe to limit the chart to these quarters.');
    s.ok(/pgt-tf off/.test(s.vals.pgt.tfGridCls), 'dimmed while off');
    const q4 = s.vals.pgt.years[0].qs[3];
    s.ok(/on/.test(q4.cls) && /now/.test(q4.cls), 'current quarter selected by default and marked');
    s.click('Timeframe');
    s.eq('on', s.vals.pgt.tfOn, 'true');
    s.expect('Nothing selected, so the chart shows the current quarter.');
    s.eq('axis pinned to Q4 2026 plus a week each side', [s.vals.pgt.lo, s.vals.pgt.hi], [D('2026-10-01') - 7, D('2026-12-31') + 7]);
    s.ok(!hasRow(s, 'objective:OBJ-FC-2026Q3-01') && !hasRow(s, 'objective:OBJ-EL-2027Q1-01'), 'out-of-window objectives drop');
    s.ok(hasRow(s, 'objective:OBJ-EL-2026Q4-02') && hasRow(s, 'initiative:INIT-FC-01'), 'in-window work stays');
    s.ok(!hasRow(s, 'milestone:MS-FC-01-02') && hasRow(s, 'milestone:MS-FC-01-01'), 'points outside the window drop');
    s.ok(!hasRow(s, 'initiative:INIT-EL-02'), 'an initiative whose objectives all dropped goes too');
  });
  s.step('choosing quarters', () => {
    s.click('Q1 2027');
    s.eq('selection', s.c.state.pg_quarters, ['2026Q4', '2027Q1']);
    s.expect('Q4 2026 to Q1 2027');
    s.ok(hasRow(s, 'objective:OBJ-EL-2027Q1-01'), 'the wider window brings next quarter back');
    s.click('Q2 2026');
    const q3 = s.vals.pgt.years[0].qs[2];
    s.ok(/imp/.test(q3.cls) && q3.title === 'Spanned by your selection. Click to select it explicitly.', 'a spanned quarter is marked implied');
    s.click('Clear');
    s.eq('cleared', s.c.state.pg_quarters, []);
    s.click('Select all of 2027');
    s.eq('a year fills in', s.c.state.pg_quarters, ['2026Q4', '2027Q1', '2027Q2', '2027Q3', '2027Q4']);
    s.click('Clear 2027');
    s.eq('a full year clears', s.c.state.pg_quarters, ['2026Q4']);
    s.click('Timeframe');
    s.click('Q3 2026');
    s.eq('picking a quarter turns the timeframe on', [s.c.state.pg_timeframe, s.c.state.pg_quarters], [true, ['2026Q3', '2026Q4']]);
    s.clean('timeframe');
  });
  s.step('a quarter tag counts inside the window, whatever the dates', () => {
    s.click('Clear');
    s.c.D.portfolio.objectives.push({ id: 'OBJ-T-TAG', divisionId: 'DIV-FC', initiativeId: 'INIT-FC-02', quarter: '2026Q4', statement: 'Tagged but dated a year early', owner: [], plannedStart: D('2025-10-01'), plannedEnd: D('2025-11-01'), milestoneIds: [] });
    s.c.D.portfolio.objectives.push({ id: 'OBJ-T-GRAZE', divisionId: 'DIV-FC', initiativeId: 'INIT-FC-02', quarter: '', statement: 'Grazes the window', owner: [], plannedStart: D('2026-09-01'), plannedEnd: D('2026-10-03'), milestoneIds: [] });
    s.c.D.portfolio.objectives.push({ id: 'OBJ-T-SEVEN', divisionId: 'DIV-FC', initiativeId: 'INIT-FC-02', quarter: '', statement: 'Seven days in', owner: [], plannedStart: D('2026-09-01'), plannedEnd: D('2026-10-07'), milestoneIds: [] });
    s.render();
    s.ok(hasRow(s, 'objective:OBJ-T-TAG'), 'tagged objective shows');
    s.ok(!hasRow(s, 'objective:OBJ-T-GRAZE'), 'three days of overlap is not enough');
    s.ok(hasRow(s, 'objective:OBJ-T-SEVEN'), 'seven days is');
    s.click('Q1 2027');
    s.ok(hasRow(s, 'objective:OBJ-T-TAG'), 'the tag still counts inside a wider window');
  });
  const y = fresh('Gantt');
  y.step('years offered come from the plan, capped at three', () => {
    y.c.D.portfolio.initiatives.push({ id: 'INIT-T-LONG', divisionId: 'DIV-EL', name: 'Long programme', desc: '', plannedStart: D('2026-01-01'), plannedEnd: D('2029-12-31'), productId: null, modelId: null, order: 9 });
    y.render();
    y.eq('three years, anchored on now', y.vals.pgt.years.map((x) => x.label), ['2026', '2027', '2028']);
    y.c.D.portfolio.initiatives.pop();
    y.c.D.portfolio.milestones.push({ id: 'MS-T-FAR', initiativeId: 'INIT-EL-02', name: 'Far milestone', plannedDate: D('2028-03-01'), completedDate: null, trl: null, mrl: null, order: 9 });
    y.render();
    y.eq('a milestone date counts (today only start / end fields were read)', y.vals.pgt.years.map((x) => x.label), ['2026', '2027', '2028']);
    y.c.D.portfolio.milestoneState.push({ milestoneId: 'MS-T-FAR', status: 'paused', day: TODAY, note: '' });
    y.render();
    y.eq('a paused one does not', y.vals.pgt.years.map((x) => x.label), ['2026', '2027']);
    y.c.D.portfolio.objectives.push({ id: 'OBJ-T-OLD', divisionId: 'DIV-FC', initiativeId: 'INIT-FC-02', quarter: '2025Q4', statement: 'Old work', owner: [], plannedStart: D('2025-10-01'), plannedEnd: D('2025-11-01'), milestoneIds: [] });
    y.c.D.portfolio.initiatives.push({ id: 'INIT-T-LONG2', divisionId: 'DIV-EL', name: 'Long programme', desc: '', plannedStart: D('2026-01-01'), plannedEnd: D('2029-12-31'), productId: null, modelId: null, order: 9 });
    y.render();
    y.eq('keeps the year before now when the plan starts earlier', y.vals.pgt.years.map((x) => x.label), ['2025', '2026', '2027']);
  });
})();

/* ------------------------------------------------- filters and grouping */
(function filters() {
  const s = fresh('Gantt');
  s.step('shared filters apply to objectives', () => {
    s.type('Division', 'DIV-EL');
    s.ok(keys(s).every((k) => !/FC|BD/.test(k) || /^board|^boardtile|^mstep|^stagegate/.test(k)), 'only Electrolyzer remains');
    s.ok(hasRow(s, 'grp:unit:UNIT-TECHNI') && !hasRow(s, 'grp:unit:UNIT-BUSINE'), 'an emptied unit drops away');
    s.type('Division', '');
    s.type('Status', 'off-track');
    const objs = keys(s).filter((k) => /^objective:/.test(k)).map((k) => k.slice(10));
    s.ok(objs.length > 0 && objs.every((id) => RD.band(RD.rollupObjective(id, s.c.D.portfolio, emOf(s))) === 'off-track'), 'status filter keeps off-track objectives only');
    s.type('Status', '');
  });
  s.step('initiatives without objectives honour the filters (fix)', () => {
    s.c.D.portfolio.initiatives.push({ id: 'INIT-T-SOLO', divisionId: 'DIV-BD', name: 'Hydrogen hub study', desc: '', plannedStart: D('2026-09-01'), plannedEnd: D('2027-01-31'), productId: null, modelId: null, order: 9 });
    s.c.D.portfolio.initiatives.push({ id: 'INIT-T-LATER', divisionId: 'DIV-BD', name: 'Export market study', desc: '', plannedStart: D('2027-02-01'), plannedEnd: D('2027-05-31'), productId: null, modelId: null, order: 10 });
    s.render();
    s.ok(hasRow(s, 'initiative:INIT-T-SOLO'), 'shows with no filters');
    s.type('Division', 'DIV-EL');
    s.ok(!hasRow(s, 'initiative:INIT-T-SOLO'), 'the division filter hides it (today it ignores every filter)');
    s.type('Division', '');
    s.type('Quarter', '2026Q4');
    s.ok(!hasRow(s, 'initiative:INIT-T-SOLO'), 'a quarter filter hides objective-less initiatives');
    s.type('Quarter', '');
    s.click('Active only');
    s.ok(hasRow(s, 'initiative:INIT-T-SOLO') && !hasRow(s, 'initiative:INIT-T-LATER'), 'Active only keeps the one running today, hides the future one');
    s.click('Active only');
    s.type('Unit', 'UNIT-BUSINE');
    s.ok(hasRow(s, 'initiative:INIT-T-SOLO') && !hasRow(s, 'division:DIV-FC'), 'the unit filter keeps its own unit');
    s.type('Unit', '');
  });
  s.step('empty states', () => {
    s.type('Quarter', '2025Q1');
    s.expect('No matching items to chart. Clear a filter, turn off Active only, or widen the timeframe.');
    s.type('Quarter', '');
    s.c.D.portfolio.objectives = []; s.c.D.portfolio.initiatives = []; s.c.D.portfolio.milestones = [];
    s.render();
    s.expect('No scheduled, dated items to chart.');
  });
  const g = fresh('Gantt');
  g.step('custom grouping', () => {
    g.click('Custom', { within: 'Group by' });
    g.eq('levels follow the chain, named', g.vals.pgt.levels.map((l) => l.label), ['Divisions', 'Objectives']);
    g.type('Grouping level 1', 'product');
    g.type('Add a grouping level', 'quarter');
    g.eq('levels for product then quarter (today they read "— none —")', g.vals.pgt.levels.map((l) => l.label), ['Products', 'Quarters', 'Objectives']);
    const k = keys(g);
    g.ok(k.indexOf('grp:/product:PRD-FC-1') >= 0 && k.indexOf('grp:/product:PRD-FC-1/quarter:2026Q4') >= 0, 'nested groups');
    g.ok(k.indexOf('objective:OBJ-BD-2026Q4-01') >= 0 && k.indexOf('objective:OBJ-BD-2026Q4-01') < k.indexOf('grp:/product:PRD-FC-1'), 'unclassified objectives sit above the groups');
    const grp = row(g, 'grp:/product:PRD-FC-1');
    const ids = ['OBJ-FC-2026Q3-01', 'OBJ-FC-2026Q4-01', 'OBJ-FC-2026Q4-02', 'OBJ-FC-2026Q4-03'];
    const P = g.c.D.portfolio, em = emOf(g);
    const mean = ids.map((id) => RD.rollupObjective(id, P, em)).reduce((a, b) => a + b, 0) / ids.length;
    g.ok(grp.dotCls === 'pgt-dot t-' + { 'on-track': 'ok', 'at-risk': 'warn', 'off-track': 'bad' }[RD.band(mean)], 'group dot is the mean of its objectives (today always grey)');
    g.click('Products', { within: 'Collapse to' });
    g.ok(hasRow(g, 'grp:/product:PRD-FC-1') && !hasRow(g, 'grp:/product:PRD-FC-1/quarter:2026Q4'), 'collapse to products');
    g.click('Remove the quarter level');
    g.click('Remove the product level');
    g.ok(keys(g).every((k) => /^objective:/.test(k) || /^(stagegate|milestonekr|mstep|board)/.test(k)), 'no levels: a flat list of objectives');
    const flat = keys(g).filter((k) => /^objective:/.test(k)).map((k) => obj(g, k.slice(10)).plannedEnd);
    g.ok(flat.every((v, i) => i === 0 || v >= flat[i - 1]), '...sorted by end date');
    g.eq('levels in the flat list', g.vals.pgt.levels.map((l) => l.label), ['Objectives']);
    g.clean('custom grouping');
  });
})();

/* ------------------------------------------------------ fixes and modes */
(function fixes() {
  const s = fresh('Gantt');
  s.step('a paused milestone no longer pushes its initiative', () => {
    s.c.D.portfolio.milestones.push({ id: 'MS-T-LATE', initiativeId: 'INIT-FC-01', name: 'Late extra demo', plannedDate: D('2027-05-14'), completedDate: null, trl: null, mrl: null, order: 9 });
    s.render();
    const r1 = row(s, 'initiative:INIT-FC-01');
    s.ok(r1.shapes.some((x) => /pgt-slip/.test(x.cls)), 'live: the late milestone slips the initiative');
    s.c.D.portfolio.milestoneState.push({ milestoneId: 'MS-T-LATE', status: 'paused', day: TODAY, note: '' });
    s.render();
    const raw = RD.cascade(s.c.D.portfolio, emOf(s), TODAY);
    s.ok(raw.longTermSlip['INIT-FC-01'] > 0, 'the raw engine cascade still counts it (today)');
    s.ok(!row(s, 'initiative:INIT-FC-01').shapes.some((x) => /pgt-slip/.test(x.cls)), 'paused: no slip in Calm');
    s.clean('paused slip');
  });
  s.step('an initiative with no planned end shows no NaN or 2020-based slip', () => {
    s.c.D.portfolio.initiatives.push({ id: 'INIT-T-OPEN', divisionId: 'DIV-EL', name: 'Open-ended programme', desc: '', plannedStart: D('2026-08-01'), plannedEnd: null, productId: null, modelId: null, order: 9 });
    s.c.D.portfolio.objectives.push({ id: 'OBJ-T-OPEN', divisionId: 'DIV-EL', initiativeId: 'INIT-T-OPEN', quarter: '2026Q4', statement: 'Open-ended work', owner: [], plannedStart: D('2026-10-01'), plannedEnd: D('2026-12-01'), milestoneIds: [] });
    s.c.D.portfolio.kpis.push({ id: 'KPI-T-OPEN', objectiveId: null, hostType: 'initiative', hostId: 'INIT-T-OPEN', name: 'x', targetType: 'demonstration', direction: 'up', target: 1, unit: '', isDefiner: true, groupId: null });
    s.render();
    const r = row(s, 'initiative:INIT-T-OPEN');
    s.ok(!!r && !r.shapes.some((x) => /pgt-slip/.test(x.cls)), 'no slip drawn');
    s.ok(/derived/.test(r.hit.cls), 'drawn dashed, its end inferred');
    s.fire(hitEl(s, 'initiative:INIT-T-OPEN'), 'onClick');
    s.ok(!/NaN/.test(JSON.stringify(s.vals.pgt.pop.facts)), 'details carry no NaN');
    s.c.closeMenus(); s.render();
    s.clean('open-ended initiative');
  });
  s.step('ended objectives: cancelled and missed gates', () => {
    s.c.D.docs['EXEC-DIV-EL'].objectiveState.push({ objectiveId: 'OBJ-EL-2026Q4-01', status: 'abandoned', endedDay: TODAY, note: '' });
    s.render();
    const sets = ['SGSET-EL-2026Q4-01-1', 'SGSET-EL-2026Q4-01-2'].map((x) => row(s, 'stagegateset:' + x));
    s.ok(sets.every((x) => /cancelled/.test(x.hit.cls)), 'its workstream bars read cancelled');
    s.ok(/cancelled missed/.test(row(s, 'stagegate:SG-EL-2026Q4-01-2').hit.cls), 'an unpassed gate of an abandoned objective is missed');
    s.ok(!/cancelled/.test(row(s, 'stagegate:SG-EL-2026Q4-01-1').hit.cls), 'a gate passed before is untouched');
    const o = row(s, 'objective:OBJ-EL-2026Q4-01');
    s.ok(o.shapes.some((x) => /pgt-end abandoned/.test(x.cls)), 'abandon marker');
    s.ok(near(num(o.hit.style, 'left') + num(o.hit.style, 'width'), (TODAY - s.vals.pgt.lo) / (s.vals.pgt.hi - s.vals.pgt.lo) * 100, 0.05), 'closed early: the bar ends where the work stopped');
    s.c.D.docs['EXEC-DIV-EL'].objectiveState[0].status = 'achieved';
    s.render();
    s.ok(/cancelled/.test(row(s, 'stagegate:SG-EL-2026Q4-01-2').hit.cls) && !/missed/.test(row(s, 'stagegate:SG-EL-2026Q4-01-2').hit.cls), 'achieved: cancelled, not missed');
    s.c.D.docs['EXEC-DIV-EL'].objectiveState = [];
    s.render();
  });
  s.step('a slipped committed date shows red', () => {
    const g = s.c.D.docs['EXEC-DIV-EL'].stageGates.find((x) => x.id === 'SG-EL-2026Q4-01-2');
    g.baselineDate = D('2026-11-06');
    s.render();
    const r = row(s, 'stagegate:SG-EL-2026Q4-01-2');
    s.ok(r.shapes.some((x) => x.cls === 'pgt-conn committed') && r.shapes.some((x) => /ghost/.test(x.cls) && x.title === 'Committed Nov 6'), 'committed connector and ghost');
    g.baselineDate = D('2026-11-13');
  });
  s.step('objective slip from a late gate', () => {
    const g = s.c.D.docs['EXEC-DIV-EL'].stageGates.find((x) => x.id === 'SG-EL-2026Q4-02-3');
    g.plannedDate = D('2026-12-04');
    s.render();
    const casc = cascOf(s);
    const slip = casc.objectiveProjectedEnd['OBJ-EL-2026Q4-02'] - D('2026-11-20');
    s.eq('engine slip', slip, 14);
    const r = row(s, 'objective:OBJ-EL-2026Q4-02');
    const sl = r.shapes.find((x) => /pgt-slip/.test(x.cls));
    s.ok(!!sl && sl.title === 'Slip: projected Dec 4, 14 days past the planned end', 'red extension to the projected end');
    g.plannedDate = D('2026-11-20');
    s.render();
  });
  const p = fresh('Gantt');
  p.step('present mode hides the controls (fix: the grid used to stay)', () => {
    p.click('Settings');
    p.check('Present mode', true);
    p.ok(!p.vals.pgt.toolbar, 'no toolbar');
    p.expectNot('Collapse to'); p.expectNot('Turn on Timeframe');
    p.expect('On track');
    p.ok(rows(p).every((r) => !r.hasActs) && rows(p).every((r) => !r.hit.down), 'no row actions, no drag');
  });
  const r = fresh('Gantt');
  r.step('read-only keeps viewing controls and hides edits', () => {
    r.click('Settings');
    r.check('Preview the read-only view', true);
    r.c.closeAllSheets(); r.render();
    r.ok(rows(r).every((x) => !x.hasActs), 'no row actions');
    r.ok(!row(r, 'objective:OBJ-EL-2026Q4-01').hit.down, 'no drag');
    r.click('Active only');
    r.ok(!hasRow(r, 'objective:OBJ-FC-2026Q3-01'), 'Active only still works');
    r.click('Active only');
    r.fire(hitEl(r, 'objective:OBJ-EL-2026Q4-01'), 'onClick');
    r.expectNot('Week later'); r.expectNot('Edit objective');
    r.expect('Show lineage');   /* audit A3: plain verb, like the row menus */
    r.clean('read-only gantt');
  });
})();

/* ========================================================== MILESTONES */
(function milestones() {
  const s = fresh('Milestones');
  s.step('the table', () => {
    s.clean('milestones first render');
    ['#', 'Milestone', 'Initiative', 'Product', 'Planned', 'Effective', 'Status', 'Score', 'KPIs'].forEach((h) => s.expect(h));
    s.eq('groups by division in Hierarchy mode', s.vals.pms.rows.filter((r) => r.isGroup).map((r) => r.label), ['Fuel Cell', 'Electrolyzer', 'Business Development']);
    s.eq('numbering per product by planned date (fix: model-pinned initiatives)', msRows(s).map((r) => r.num), ['HP-01', 'HP-02', 'TS-01', 'TS-02', 'TS-03', 'MS-01']);
    const a = msRow(s, 'MS-FC-01-01');
    const casc = cascOf(s);
    s.eq('effective date and slip', [a.eff, a.slip], ['Dec 18', '+' + (casc.milestoneEffective['MS-FC-01-01'] - D('2026-12-11')) + ' days']);
    s.eq('status, score, KPIs', [a.status, a.score, a.kpis], ['Off track', String(Math.round(RD.milestoneScore('MS-FC-01-01', emOf(s)))), '1']);
    const b = msRow(s, 'MS-EL-01-01');
    s.ok(b.effDone && b.eff === 'Sep 30' && b.status === 'Achieved', 'completed: its date and a check');
    s.eq('locked report', b.repLabel, 'Open report (locked)');
    const c = msRow(s, 'MS-EL-02-01');
    s.ok(c.status === 'Deprioritized' && /paused/.test(c.cls), 'deprioritized: a state, not a band, and dimmed');
    s.eq('its hover text', c.stTitle, 'Deprioritized on Oct 6, 2026. Supplier slipped to Q2; kept for reference. Kept, and excluded from dates and scores.');
    s.eq('effective of a paused milestone is its plan', c.eff, 'Feb 26, 2027');
    s.ok(msRow(s, 'MS-EL-01-02').status === 'Achieved' && msRow(s, 'MS-EL-01-02').score === '100', 'achieved on its KPIs');
    s.expect('6 milestones');
  });
  s.step('collapse a group', () => {
    s.click('Collapse Fuel Cell');
    s.ok(!msRow(s, 'MS-FC-01-01') && s.vals.pms.rows.some((r) => r.isGroup && r.label === 'Fuel Cell'), 'rows hidden, header stays');
    s.click('Expand Fuel Cell');
    s.ok(!!msRow(s, 'MS-FC-01-01'), 'back');
  });
  s.step('filters, including Unit (fix)', () => {
    s.type('Unit', 'UNIT-BUSINE');
    s.eq('unit filter', msRows(s).map((r) => r.id), ['MS-BD-01-01']);
    s.type('Unit', '');
    s.type('Quarter', '2026Q4');
    s.eq('quarter from the planned date', msRows(s).map((r) => r.id), ['MS-FC-01-01', 'MS-EL-01-01', 'MS-EL-01-02']);
    s.expect('3 of 6 milestones');
    s.type('Quarter', '');
    s.type('Product', 'PRD-EL-1');
    s.eq('product through the initiative, model resolves to product', msRows(s).map((r) => r.id), ['MS-EL-01-01', 'MS-EL-01-02', 'MS-EL-02-01']);
    s.type('Product', '');
    s.type('Status', 'on-track');
    s.eq('status: achieved counts as on track', msRows(s).map((r) => r.id), ['MS-EL-01-01', 'MS-EL-01-02']);
    s.type('Status', '');
    s.type('Quarter', '2025Q1');
    s.expect('No milestones match the current filters.');
    s.type('Quarter', '');
  });
  s.step('custom grouping, then back to Hierarchy (fix: stale chain ignored)', () => {
    s.click('Custom', { within: 'Group by' });
    s.type('Grouping level 1', 'product');
    s.eq('product groups', s.vals.pms.rows.filter((r) => r.isGroup).map((r) => r.label), ['HP membrane', 'Tera stack']);
    s.ok(s.vals.pms.rows[0].isMs && s.vals.pms.rows[0].id === 'MS-BD-01-01', 'a milestone with no product sits above the groups');
    s.click('Hierarchy', { within: 'Group by' });
    s.eq('hierarchy groups by division again', s.vals.pms.rows.filter((r) => r.isGroup).map((r) => r.label), ['Fuel Cell', 'Electrolyzer', 'Business Development']);
  });
  s.step('pause, deprioritize, resume: appended history', () => {
    s.click('Milestone actions', { within: 'MS-FC-01-02' });
    s.click('Pause milestone');
    s.type('Why (optional)', 'Waiting on the coating line');
    s.click('Pause milestone');
    const st = s.c.D.portfolio.milestoneState;
    s.eq('a paused record with the reason', [st[st.length - 1].milestoneId, st[st.length - 1].status, st[st.length - 1].note, st[st.length - 1].day], ['MS-FC-01-02', 'paused', 'Waiting on the coating line', TODAY]);
    s.expect('Milestone paused.');
    s.eq('row reads paused', msRow(s, 'MS-FC-01-02').status, 'Paused');
    s.click('Milestone actions', { within: 'MS-FC-01-02' });
    s.click('Resume milestone');
    s.eq('resume appends, history kept', s.c.D.portfolio.milestoneState.filter((r) => r.milestoneId === 'MS-FC-01-02').map((r) => r.status), ['paused', 'active']);
    s.expect('Milestone resumed.');
    s.click('Milestone actions', { within: 'MS-BD-01-01' });
    s.click('Deprioritize milestone');
    s.click('Deprioritize milestone');
    s.eq('deprioritized', msRow(s, 'MS-BD-01-01').status, 'Deprioritized');
    s.expect('Milestone deprioritized.');
  });
  s.step('mark achieved and reopen', () => {
    s.click('Milestone actions', { within: 'MS-FC-01-01' });
    s.click('Mark achieved');
    s.eq('completed today', ms(s, 'MS-FC-01-01').completedDate, TODAY);
    s.eq('achieved', msRow(s, 'MS-FC-01-01').status, 'Achieved');
    s.click('Milestone actions', { within: 'MS-FC-01-01' });
    s.click('Reopen milestone');
    s.eq('reopened', ms(s, 'MS-FC-01-01').completedDate, null);
  });
  s.step('edit, row click and delete go through the editor', () => {
    s.click('Pilot line ready for customer audit');
    s.ok(sheetKind(s) === 'ped.edit' || /not available/.test(s.text), 'name opens the editor');
    s.c.closeAllSheets(); s.render();
    const tr = s.find((el) => el.tag === 'tr' && !!el.on.onClick && el.attrs['data-k'] === 'MS-FC-01-02');
    s.fire(tr, 'onClick');
    s.ok(sheetKind(s) === 'ped.edit' || /not available/.test(s.text), 'row click opens the editor');
    s.c.closeAllSheets(); s.render();
    s.click('Milestone actions', { within: 'MS-BD-01-01' });
    s.click('Delete milestone');
    if (s.c.state.dlg) { s.click(s.c.state.dlg.ok); }
    s.ok(!ms(s, 'MS-BD-01-01') || /not available/.test(s.text), 'deleted after confirming');
    s.clean('milestone actions');
  });
  s.step('empty plan', () => {
    s.c.D.portfolio.milestones = []; s.render();
    s.expect('No milestones yet. Add one from an initiative in the Structure tab.');
  });
})();

/* ============================================================== REPORT */
(function report() {
  const s = fresh('Milestones');
  s.step('open and read', () => {
    s.click('Create report', { within: 'MS-FC-01-01' });
    s.eq('sheet', sheetKind(s), 'pms.report');
    s.ok(/wide/.test(s.vals.ui.sheetCls), 'wide sheet');
    s.expect('HP-01, Pilot line ready for customer audit');
    s.eq('project placeholder is the product', s.vals.pms.sheet.project.ph, 'HP membrane');
    s.eq('header facts', [s.vals.pms.sheet.achText, s.vals.pms.sheet.dateAchieved, s.vals.pms.sheet.trlmrl], ['Not achieved', '—', '5 / 4']);
    const m = s.vals.pms.sheet.metrics[0];
    const P = s.c.D.portfolio, em = emOf(s);
    const pool = []; Object.keys(em).forEach((k) => (em[k].kpis || []).forEach((x) => pool.push(x)));
    const k = P.kpis.find((x) => x.id === 'KPI-FC-01-01-1');
    const sc = RD.kpiScoreResolved(k, pool, em);
    s.eq('target, measured, result, source', [m.target, m.measuredPh, m.result, m.src], ['≥ 50 m', '32 m', sc >= 100 ? 'Met' : sc >= 70 ? 'Partial' : 'Missed', 'Source: manual entry']);
    ['What was demonstrated', 'Performance vs. targets', 'Key findings and learnings', 'Milestone context', 'Actions required before the next milestone', 'Technical lead', 'CTO / R&D director', 'Reviewer / sponsor'].forEach((t) => s.expect(t));
    s.eq('four findings, three actions', [s.vals.pms.sheet.findings.length, s.vals.pms.sheet.actions.length], [4, 3]);
    s.clean('report open');
  });
  s.step('edit and save', () => {
    s.type('Project', 'HP6-12 pilot line');
    s.type('Author', 'Erin Walsh');
    s.type('Version', '1.0');
    s.type('What was demonstrated', 'Ran 41 m of membrane without a web break.');
    s.type('Finding 1', 'Tension control held within 2%.');
    s.type('Action 1', 'Fit the second shim set');
    s.type('Owner of action 1', 'Erin');
    s.type('Due date of action 1', '2026-11-02');
    s.click('Save report');
    const rep = ms(s, 'MS-FC-01-01').milestoneReport;
    s.eq('saved fields', [rep.project, rep.author, rep.version, rep.demonstrated, rep.findings[0], rep.actions[0].item, rep.actions[0].owner, rep.actions[0].due, rep.locked], ['HP6-12 pilot line', 'Erin Walsh', '1.0', 'Ran 41 m of membrane without a web break.', 'Tension control held within 2%.', 'Fit the second shim set', 'Erin', '2026-11-02', false]);
    s.eq('an untouched Measured cell records the value it showed', rep.kpiOverrides['KPI-FC-01-01-1'].measured, '32 m');
    s.eq('blank findings stay blank, not placeholder text', rep.findings[1], '');
    s.eq('context kept for later', rep.context, { budget: '', buildNo: '', linkedOkr: '' });
    s.expect('Report saved.');
    s.eq('sheet closed', sheetKind(s), '');
    s.eq('row now opens the report', msRow(s, 'MS-FC-01-01').repLabel, 'Open report');
  });
  s.step('measured override, lock and unlock', () => {
    s.click('Open report', { within: 'MS-FC-01-01' });
    s.eq('reopens with the saved text', s.vals.pms.sheet.project.value, 'HP6-12 pilot line');
    s.type('Measured, Continuous run length', '41 m');
    s.click('Lock the report');
    s.expect('Report locked.');
    const rep = ms(s, 'MS-FC-01-01').milestoneReport;
    s.ok(rep.locked && rep.kpiOverrides['KPI-FC-01-01-1'].measured === '41 m', 'lock saves at once, with the edits');
    s.ok(!s.has('Project', { tag: 'input' }) && !s.has('Save report'), 'locked: nothing editable');
    s.expect('Locked. Unlock to edit.');
    s.expect('41 m');
    s.click('Unlock the report');
    s.expect('Report unlocked.');
    s.ok(!ms(s, 'MS-FC-01-01').milestoneReport.locked && s.has('Project', { tag: 'input' }), 'editable again');
  });
  s.step('close asks before discarding edits', () => {
    s.type('Version', '1.1');
    s.click('Close');
    s.expect('Discard your changes?');
    s.click('Discard changes');
    s.eq('closed, nothing saved', [sheetKind(s), ms(s, 'MS-FC-01-01').milestoneReport.version], ['', '1.0']);
    s.click('Open report', { within: 'MS-FC-01-01' });
    s.click('Close');
    s.eq('no edits: closes at once', sheetKind(s), '');
  });
  s.step('print', () => {
    let printed = 0;
    global.window.print = () => { printed++; };
    s.click('Open report', { within: 'MS-FC-01-01' });
    s.click('Print or save as PDF');
    s.eq('print called', printed, 1);
    global.window.print = () => { throw new Error('blocked'); };
    s.click('Print or save as PDF');
    s.expect('Printing isn’t available here. Use your browser’s Print command.');
    global.window.print = () => {};
    s.click('Close');
  });
  s.step('linked objectives and value sources', () => {
    s.click('Create report', { within: 'MS-EL-01-02' });
    s.expect('Qualify the 10-cell short stack for durability testing');
    s.expect('(Q4 2026)');
    const m = s.vals.pms.sheet.metrics[0];
    s.eq('source is the key-result KPI', m.src, 'Source: Cell voltage at 2 A/cm²');
    s.eq('result', m.result, 'Met');
    s.click('Close');
  });
  s.step('a locked report from the sample, and TRL 0 reads as blank', () => {
    s.click('Open report (locked)', { within: 'MS-EL-01-01' });
    s.expect('Measure every gasket before the rebuild');
    s.eq('trl / mrl', s.vals.pms.sheet.trlmrl, '4 / 3');
    s.c.closeAllSheets(); s.render();
    ms(s, 'MS-EL-01-02').trl = 0;
    s.click('Create report', { within: 'MS-EL-01-02' });
    s.eq('a stored 0 is not a TRL', s.vals.pms.sheet.trl, '—');
    s.c.closeAllSheets(); s.render();
  });
  s.step('a deleted milestone', () => {
    s.click('Create report', { within: 'MS-FC-01-02' });
    s.c.D.portfolio.milestones = s.c.D.portfolio.milestones.filter((m) => m.id !== 'MS-FC-01-02');
    s.render();
    s.expect('This milestone no longer exists, so its report can’t be shown.');
    s.clean('missing report');
    s.c.closeAllSheets(); s.render();
  });
  const r = fresh('Milestones');
  r.step('read-only: the report can be read and printed, not edited (fix)', () => {
    r.click('Settings');
    r.check('Preview the read-only view', true);
    r.c.closeAllSheets(); r.render();
    r.ok(msRows(r).every((x) => !x.hasMenu), 'no row menus');
    r.ok(!r.has('Create report', { within: 'MS-FC-01-01' }), 'no "Create report" where there is no report to read');
    r.click('Open report (locked)', { within: 'MS-EL-01-01' });
    r.expect('Read-only view. You can read and print this report, but editing is off.');
    r.ok(!r.has('Project', { tag: 'input' }) && !r.has('Save report') && !r.has('Lock the report'), 'no inputs, no Save, no Lock');
    r.expect('Print or save as PDF');
    r.c.closeAllSheets(); r.render();
    r.click('Pilot line ready for customer audit');
    r.ok(sheetKind(r) === 'ped.lineage' || /not available/.test(r.text), 'name opens lineage in read-only');
    r.clean('read-only milestones');
  });
  const e = fresh('Milestones');
  e.step('the editor’s Report button stacks the report on the editor', () => {
    e.click('Pilot line ready for customer audit');
    e.eq('editor open', sheetKind(e), 'ped.edit');
    e.click('Create report', { within: 'Editor' });
    e.eq('report on top of the editor', e.c.state.sheets.map((x) => x.kind), ['ped.edit', 'pms.report']);
    e.ok(e.vals.ui.sheetBack, 'a Back button returns to the editor');
    e.click('Back');
    e.eq('back to the editor', sheetKind(e), 'ped.edit');
    e.clean('report over editor');
  });
})();

/* ------------------------------------------------- more geometry rules */
(function more() {
  const s = fresh('Gantt');
  s.step('a KPI-less initiative ends with its work', () => {
    const v = s.vals.pgt, r = row(s, 'initiative:INIT-FC-02');
    const right = num(r.hit.style, 'left') + num(r.hit.style, 'width');
    s.ok(near(right, (D('2026-12-18') - v.lo) / (v.hi - v.lo) * 100, 0.05), 'ends Dec 18 with its last objective, not its planned Jun 30');
    s.ok(!r.shapes.some((x) => /pgt-slip/.test(x.cls)), 'finishing early is not slip');
    const k = row(s, 'initiative:INIT-FC-01');
    s.ok(near(num(k.hit.style, 'left') + num(k.hit.style, 'width'), (D('2027-03-31') - v.lo) / (v.hi - v.lo) * 100, 0.05), 'an initiative with its own targets keeps its planned end');
  });
  s.step('dates inferred from the gates', () => {
    const o = obj(s, 'OBJ-FC-2026Q4-02');
    o.plannedStart = null;
    s.render();
    const r = row(s, 'objective:OBJ-FC-2026Q4-02');
    s.ok(/derived/.test(r.hit.cls), 'dashed when a date is inferred');
    s.ok(near(num(r.hit.style, 'left'), (D('2026-10-29') - s.vals.pgt.lo) / (s.vals.pgt.hi - s.vals.pgt.lo) * 100), 'starts at its first gate');
    s.ok(!r.hit.down, 'no drag without both planned dates');
    o.plannedStart = D('2026-10-05');
    s.render();
  });
  s.step('an ended objective paints slip only past a week', () => {
    const st = s.c.D.docs['EXEC-DIV-FC'].objectiveState;
    st.push({ objectiveId: 'OBJ-FC-2026Q4-02', status: 'achieved', endedDay: D('2026-12-11') + 7, note: '' });
    s.render();
    s.ok(!row(s, 'objective:OBJ-FC-2026Q4-02').shapes.some((x) => /pgt-slip/.test(x.cls)), 'exactly 7 days late: no red');
    st[st.length - 1].endedDay = D('2026-12-11') + 8;
    s.render();
    const sl = row(s, 'objective:OBJ-FC-2026Q4-02').shapes.find((x) => /pgt-slip/.test(x.cls));
    s.ok(!!sl && /8 days past the planned end/.test(sl.title), '8 days late: red to the close date');
    st.pop();
    s.render();
  });
  s.step('divisions without a unit sit under Unassigned', () => {
    s.c.D.portfolio.divisions.find((d) => d.id === 'DIV-BD').unitId = null;
    s.render();
    s.ok(hasRow(s, 'grp:unit:__none__') && row(s, 'grp:unit:__none__').name === 'Unassigned', 'Unassigned group');
    s.ok(!hasRow(s, 'grp:unit:UNIT-BUSINE'), 'the emptied unit drops away');
    s.click('Units', { within: 'Collapse to' });
    s.eq('collapse to units includes Unassigned', keys(s), ['grp:unit:UNIT-TECHNI', 'grp:unit:__none__']);
  });
  s.step('initiative and milestone date moves', () => {
    s.click('Expand all', { within: 'Collapse to' });
    s.fire(hitEl(s, 'initiative:INIT-EL-02'), 'onClick');
    s.eq('initiative facts', [popFacts(s).Planned, popFacts(s)['Bar ends']], ['Oct 1 to Jun 30, 2027', 'With its work: no targets of its own']);
    s.click('Week later', { within: 'gantt-details' });
    const i = s.c.D.portfolio.initiatives.find((x) => x.id === 'INIT-EL-02');
    s.eq('initiative moved', [i.plannedStart, i.plannedEnd], [D('2026-10-08'), D('2027-07-07')]);
    s.c.closeMenus();
    s.render();
    s.fire(hitEl(s, 'milestone:MS-FC-01-02'), 'onClick');
    s.click('Week earlier', { within: 'gantt-details' });
    s.eq('milestone moved', ms(s, 'MS-FC-01-02').plannedDate, D('2027-03-05'));
    s.c.closeMenus();
    s.render();
    s.clean('date moves');
  });
  const u = fresh('Gantt');
  u.step('?ganttActive and ?ganttQuarter links switch the toggles on', () => {
    u.click('Settings');
    u.check('Gantt: active work only', true);
    u.check('Gantt: limit to the timeframe', true);
    u.type('Opens on', 'gantt');
    u.click('Open this link here');
    u.eq('both toggles on', [u.c.state.pg_active, u.c.state.pg_timeframe], [true, true]);
    u.eq('both pressed', [u.vals.pgt.activeOn, u.vals.pgt.tfOn], ['true', 'true']);
    u.ok(!hasRow(u, 'objective:OBJ-FC-2026Q3-01') && !hasRow(u, 'objective:OBJ-EL-2027Q1-01'), 'the chart applies them');
    u.clean('link toggles');
  });
  const r = fresh('Milestones');
  r.step('Escape closes the report, asking first when it has edits', () => {
    r.click('Create report', { within: 'MS-FC-01-01' });
    r.type('Author', 'Erin Walsh');
    r.key((el) => el.attrs['data-k'] === 'milestone-report', 'Escape');
    r.expect('Discard your changes?');
    r.click('Cancel');
    r.eq('still open', sheetKind(r), 'pms.report');
    r.click('Save report');
    r.click('Open report', { within: 'MS-FC-01-01' });
    r.key((el) => el.attrs['data-k'] === 'milestone-report', 'Escape');
    r.eq('no edits: closes', sheetKind(r), '');
  });
})();

done();
