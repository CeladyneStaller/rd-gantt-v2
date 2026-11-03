/* Stage-gates scenarios (X-gates). Run for both boards:
     node test/sc_gates.js out/xgates/Main.dc.html
     node test/sc_gates.js out/xgates/Sales-A.dc.html
   Clicks and types like a person, then checks what is on screen, the data (s.c.D) and the numbers
   against the engine (rdcore.js, loaded separately). At the end it reports which handler sites
   in mods/gates/*.html the scenarios never fired (the goal is none). */
const { Sim, done, textOf, labelOf } = require('./dc');
const RD = require(require('./engine_path'));

const FILE = process.argv[2] || 'out/xgates/Main.dc.html';
const SALES = /Sales/.test(FILE);
const KEY = SALES ? 'BIZ-DIV-BD' : 'EXEC-DIV-EL';
const TODAY = 2477;
const day = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(2020, 0, 1)) / 86400000);

/* ---- record which handler sites (event@template line) the scenarios fire ---- */
const fired = new Set();
const origFire = Sim.prototype.fire;
Sim.prototype.fire = function (el, name, extra) { fired.add(name.toLowerCase() + '@' + el.line); return origFire.call(this, el, name, extra); };
['type', 'check'].forEach((m) => {
  const orig = Sim.prototype[m];
  Sim.prototype[m] = function (q, v, opts) {
    const list = this.all(q, opts).filter((e) => e.on.onChange || e.on.onInput || (m === 'check' && e.on.onClick));
    const el = list[(opts && opts.nth) || 0];
    if (el) fired.add((el.on.onChange ? 'onchange' : el.on.onInput ? 'oninput' : 'onclick') + '@' + el.line);
    return orig.call(this, q, v, opts);
  };
});
const fireOn = (s, el, name, extra) => origFire.call(s, el, name, extra) && fired.add(name.toLowerCase() + '@' + el.line);

const doc = (s, k) => s.c.D.docs[k || KEY];
const gate = (s, id, k) => (doc(s, k).stageGates || []).find((g) => g.id === id);
const em = (s, k) => { k = k || KEY; return RD.withPortfolio(s.c.D.portfolio, { [k.replace(/^[A-Z]+-/, '')]: doc(s, k) }); };
const lastToast = (s) => { const t = s.c.state.toasts || []; return t.length ? t[t.length - 1].text : ''; };
const toasts = (s) => (s.c.state.toasts || []).map((t) => t.text);
const hadToast = (s, t) => s.ok(toasts(s).indexOf(t) >= 0, 'toast: ' + t + ' (got ' + JSON.stringify(toasts(s)) + ')');
const top = (s) => s.c.sheet();
const ED = { within: 'Editor' };
const gotoGates = (s) => s.click('Stage-gates', { within: 'Objective sections' });
const pickObj = (s, sub) => s.click('~' + sub, { within: 'Objectives' });
const wsKey = (id) => 'ws-' + id;
const gk = (id) => 'gate-' + id;
const rowOf = (s, id) => { let r = null; ((s.vals.gates.tab && s.vals.gates.tab.sets) || []).forEach((w) => w.gates.forEach((g) => { if (g.id === id) r = g; })); return r; };
const labelNow = (s, id) => RD && s.c.MODS.gates.api.label(doc(s), id);
const menuOf = (s, id) => s.click('Actions for ' + labelNow(s, id), { within: gk(id) });
const api = (s) => s.c.MODS.gates.api;
const search = (s, q) => s.c.MODS.gates.search(s.c, s.c.ctx, q);

/* ---- October 20, Corey: "If SG1 finishes 3 days late and I make a plan revision for SG2-5, how is the 3 day late
   finish for SG1 handled?", then "a plan revision should be assumed to already capture the 3d delay or mitigation
   of it. The objective may then have a plan to be back on track pending the due date for the last stage-gate.
   Build that for Execution and Sales." The drill: one chained workstream, SG1 due 6 days ago and passed 3 days
   ago (3 days late), SG2 to SG5 every 10 days from 10 days out. ---- */
const DRILL = 'OBJ-DRILL-1', DRILL_WS = 'SGSET-DRILL-1';
const dg = (i) => 'SG-DRILL-' + i;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (d) => { const t = new Date(Date.UTC(2020, 0, 1) + d * 86400000); return MON[t.getUTCMonth()] + ' ' + t.getUTCDate(); };
const isoOf = (d) => new Date(Date.UTC(2020, 0, 1) + d * 86400000).toISOString().slice(0, 10);
function drill(s) {
  const divId = KEY.replace(/^[A-Z]+-/, '');
  s.c.mutate((D) => {
    D.portfolio.objectives.push({ id: DRILL, divisionId: divId, initiativeId: null, quarter: '2026Q4', statement: 'Revision drill', owner: [],
      plannedStart: TODAY - 30, plannedEnd: TODAY + 60, milestoneIds: [], productId: null, modelId: null, order: 99 });
    const d = D.docs[KEY];
    d.stageGateSets.push({ id: DRILL_WS, objectiveId: DRILL, name: 'Pilot', order: 1, chained: true });
    [[-6, -3], [10], [20], [30], [40]].forEach(([p, a], i) => d.stageGates.push({ id: dg(i + 1), objectiveId: DRILL, setId: DRILL_WS, name: 'Drill gate ' + (i + 1),
      intention: null, gate_id: null, plannedDate: TODAY + p, actualDate: a == null ? null : TODAY + a, status: a == null ? 'pending' : 'passed', order: i }));
  }, { quiet: true });
  s.render();
  pickObj(s, 'Revision drill');
  gotoGates(s);
  return s;
}
const whenOf = (s, id) => rowOf(s, id).when.map((w) => w.text);
const pushOf = (s, id) => whenOf(s, id).filter((t) => /^Pushed /.test(t))[0] || '';
const schedOf = (s) => { const f = (s.vals.sh.head.facts || []).find((x) => x.k === 'fact-schedule'); return f ? f.detail : ''; };
const drillCasc = (s) => RD.cascade(s.c.D.portfolio, em(s), TODAY);
const LATER = [2, 3, 4, 5];
/* ten days on: the revision was committed 12 days ago (SG1 passed before it) and SG2, due 2 days ago, is still open */
function tenDaysOn(s, revise) {
  s.c.mutate((D) => {
    const d = D.docs[KEY];
    revise(d);
    const g1 = d.stageGates.find((g) => g.id === dg(1)); g1.plannedDate -= 12; g1.actualDate -= 12;
    d.stageGates.find((g) => g.id === dg(2)).plannedDate = TODAY - 2;
  }, { quiet: true });
  s.render();
  return s;
}

/* ======================================================================== Execution */
function execScenarios() {
  const s = new Sim(FILE);
  const EL1 = 'OBJ-EL-2026Q4-01', EL2 = 'OBJ-EL-2026Q4-02';
  const W1 = 'SGSET-EL-2026Q4-01-1', W2 = 'SGSET-EL-2026Q4-01-2';

  s.step('seed: load clean-up keeps Independent, plan versions and the legacy plan exist', () => {
    s.eq('Teardown workstream stays independent (today it would be forced to chained)', doc(s).stageGateSets.find((x) => x.id === W2).chained, false);
    s.eq('EL-01 has v1 and v2', RD.planVersionsOf(doc(s), EL1).map((v) => v.v), [1, 2]);
    s.eq('v2 snapshot is the live plan', JSON.stringify(RD.latestPlanVersion(doc(s), EL1).snapshot), JSON.stringify(RD.capturePlanSnapshot(doc(s), s.c.D.portfolio, EL1)));
    s.eq('FC-01 has v1', RD.planVersionsOf(doc(s, 'EXEC-DIV-FC'), 'OBJ-FC-2026Q4-01').length, 1);
    s.ok(!!RD.activeCatchupPlan(doc(s).catchupPlans, EL2), 'legacy catch-up plan on Lock Tera components');
    s.clean('initial render');
  });

  /* since October 15 the Overview's gate rows are drawn by mods/review (one review table); a gate's name lands here */
  s.step('overview: the review table lists every gate with the engine\'s numbers; a name opens the gate here', () => {
    const items = s.c.MODS.review.api.items(s.c, s.c.ctx).filter((it) => it.type === 'gate');
    s.eq('one row per gate (by due date), status by the review rules', items.map((it) => it.row.tid + ' ' + it.status),
      ['SG-A1 done', 'SG-A2 risk', 'SG-B1 none', 'SG-B2 none', 'SG-A3 none']);
    s.eq('readiness = RD.stageGateScore for the open gates with targets', items.filter((it) => it.row.pgBar).map((it) => it.row.barVal),
      ['SG-EL-2026Q4-01-2', 'SG-EL-2026Q4-01-4', 'SG-EL-2026Q4-01-3'].map((id) => { const sc = RD.stageGateScore(id, em(s)); return sc == null ? '—' : Math.round(sc) + '%'; }));
    const a2 = items.find((it) => it.id === 'SG-EL-2026Q4-01-2');
    s.eq('SG-A2: at risk for its high risk, targets met and partial, due date', [a2.row.stSub, a2.row.pgSub, a2.row.date, a2.row.dateSub], ['High risk open on it', 'Ready, 1 of 2 targets met, 1 partial', 'Nov 13', 'In 31 days']);
    s.eq('SG-A1 passed early, automatically', [items[0].row.stSub, items[0].row.pgTxt], ['Passed 2 days early', 'Passed, every target met']);
    const grp = s.c.vmOf('review').groups.find((g) => g.label === 'Stage-gates');
    s.eq('section: workstreams and gate health (RD.objectiveGateReadiness)', [grp.sub, grp.extra], ['2 workstreams', 'Gate health ' + Math.round(RD.objectiveGateReadiness(EL1, em(s), TODAY)) + '%']);
    s.ok(!s.has('Stage-gates summary') && !s.has('~Open stage-gates'), 'the old summary card is gone');
    s.click((el) => el.tag === 'button' && /\breview-link\b/.test(el.attrs.class || '') && textOf(el).indexOf('Durability screen, 500 h') >= 0);
    s.eq('tab is gates', s.c.state.tab, 'gates');
    s.eq('the gate is expanded', !!s.c.state.gates_open['SG-EL-2026Q4-01-2'], true);
    s.ok(s.has('Voltage decay rate', { within: gk('SG-EL-2026Q4-01-2') }), 'its KPI table shows');
    s.eq('highlighted, and its name takes focus', [/\bis-focus\b/.test(rowOf(s, 'SG-EL-2026Q4-01-2').cls), rowOf(s, 'SG-EL-2026Q4-01-2').focus, rowOf(s, 'SG-EL-2026Q4-01-1').focus], [true, true, false]);
    s.flush(9000);
    s.eq('the highlight clears after a few seconds', [s.c.state.gates_focus, /\bis-focus\b/.test(rowOf(s, 'SG-EL-2026Q4-01-2').cls)], ['', false]);
    s.clean('overview to gates');
  });

  s.step('gates list: states, readiness, schedule badges, marks against the engine', () => {
    const T = s.vals.gates.tab;
    s.eq('count', T.count, 5);
    s.eq('workstream letters', T.sets.map((w) => w.letter + ': ' + w.name), ['Workstream A: Durability', 'Workstream B: Teardown and analysis']);
    s.eq('chain labels', T.sets.map((w) => w.chainLabel), ['Chained', 'Independent']);
    s.eq('workstream % = RD.setScore', T.sets.map((w) => w.pct), [W1, W2].map((id) => { const p = RD.setScore(id, em(s), TODAY); return p == null ? '—' : Math.round(p) + '%'; }));
    const casc = RD.cascade(s.c.D.portfolio, em(s), TODAY);
    const ids = ['SG-EL-2026Q4-01-1', 'SG-EL-2026Q4-01-2', 'SG-EL-2026Q4-01-3', 'SG-EL-2026Q4-01-4', 'SG-EL-2026Q4-01-5'];
    ids.forEach((id) => { const sc = RD.stageGateScore(id, em(s)); s.eq('readiness ' + id, rowOf(s, id).ready, sc == null ? '—' : Math.round(sc) + '%'); });
    s.eq('labels by due date', ids.map((id) => rowOf(s, id).label), ['SG-A1', 'SG-A2', 'SG-A3', 'SG-B1', 'SG-B2']);
    s.eq('SG-A1 passed early', [rowOf(s, ids[0]).stWord, rowOf(s, ids[0]).passedText], ['Passed', 'Passed Sep 30']);
    s.expect('Finished 2 days early');
    s.eq('SG-A2 shows the stored In progress status honestly', rowOf(s, ids[1]).stWord, 'In progress');
    s.eq('SG-A2 partial caption', rowOf(s, ids[1]).partialText, 'Partial check-in: 100% without discount, 3 of 6 samples. Readiness reaches 100 only once all 6 are in.');
    s.eq('SG-A2 targets', rowOf(s, ids[1]).metText, '1 of 2 met, 1 partial');
    s.eq('SG-A2 version mark', rowOf(s, ids[1]).vmark, 'Moved in v2 (+7 days)');
    s.eq('SG-B2 added in v2', rowOf(s, ids[4]).vmark, 'Added in v2');
    s.eq('SG-A2 committed tag', rowOf(s, ids[1]).committed, true);
    s.eq('SG-B1 could finish earlier (engine acceleration)', rowOf(s, ids[3]).when.map((w) => w.text), ['Planned Dec 4', 'Forecast Dec 4', 'Could finish Nov 18, ' + casc.gateAcceleration[ids[3]] + ' days earlier']);
    s.expect('Prove the stack holds 30 bar before any durability hours are spent on it.');
    s.clean('gates list');
  });

  s.step('targets toggle shows the KPI module table; collapse again', () => {
    s.click('~Targets', { within: gk('SG-EL-2026Q4-01-2') });
    s.eq('closed (was opened from the overview)', s.c.state.gates_open['SG-EL-2026Q4-01-2'], false);
    s.ok(!s.has('Voltage decay rate', { within: gk('SG-EL-2026Q4-01-2') }), 'table hidden');
    s.click('~Targets', { within: gk('SG-EL-2026Q4-01-2') });
    s.ok(s.has('Voltage decay rate', { within: gk('SG-EL-2026Q4-01-2') }), 'KPI table row visible');
    s.ok(s.has('Add target', { within: gk('SG-EL-2026Q4-01-2') }) && s.has('Link a metric', { within: gk('SG-EL-2026Q4-01-2') }) && s.has('Connect data', { within: gk('SG-EL-2026Q4-01-2') }), 'table footer: add, link, connect');
    s.clean('targets toggle');
  });

  s.step('add gate: name required, draft targets via the KPI target sheet, saved with the gate', () => {
    s.click('Add gate', { within: 'gates-panel', nth: 0 });
    s.eq('sheet', top(s).kind, 'gates.edit');
    s.expect('Add stage-gate');
    s.click('Add gate', ED);
    s.eq('name error', s.c.sheet().err, 'Give the gate a name.');
    s.type('Name', 'Gasket thickness audit', ED);
    s.type('Intention', 'Every gasket inside 0.02 mm before the rebuild.', ED);
    s.type('~Gate id', 'GASKET', ED);
    s.type('Planned date', '2026-10-30', ED);
    s.click('Add target', ED);
    s.eq('KPI target sheet stacked', top(s).kind, 'kpi.target');
    s.type('Name', 'Gasket thickness spread', ED);
    s.click('Decrease', ED);
    s.type('Target', '0.02', ED);
    s.type('Unit', 'mm', ED);
    s.click('Save target', ED);
    s.eq('back on the gate sheet', top(s).kind, 'gates.edit');
    s.eq('draft held in state', s.c.state.gates_pend.length, 1);
    s.expect('Gasket thickness spread');
    s.eq('typing kept', top(s).d.name, 'Gasket thickness audit');
    const before = doc(s).stageGates.length;
    s.click('Add gate', ED);
    s.eq('one more gate', doc(s).stageGates.length, before + 1);
    const g = doc(s).stageGates[doc(s).stageGates.length - 1];
    s.eq('new gate fields', [g.id, g.objectiveId, g.setId, g.name, g.intention, g.gate_id, g.plannedDate, g.actualDate, g.status],
      ['SG-EL-2026Q4-01-6', EL1, W1, 'Gasket thickness audit', 'Every gasket inside 0.02 mm before the rebuild.', 'GASKET', day('2026-10-30'), null, 'pending']);
    const k = doc(s).kpis.find((x) => x.hostType === 'stageGate' && x.hostId === g.id);
    s.eq('draft target became a KPI on the gate', k && [k.name, k.direction, k.target, k.unit, k.objectiveId, k.isDefiner], ['Gasket thickness spread', 'down', 0.02, 'mm', EL1, true]);
    s.eq('sheet closed', s.c.sheet(), null);
    hadToast(s, 'Gate added.');
    s.ok(s.has('Gasket thickness audit', { within: wsKey(W1) }), 'shows in Workstream A');
    s.clean('after add gate');
  });

  s.step('cancel an add leaves nothing (General is only created when a gate is added)', () => {
    pickObj(s, 'Cut stack cost 18%');
    gotoGates(s);
    s.expect('No workstreams yet. Add a gate to start one, or add a workstream for a parallel track.');
    s.click('Add gate', { within: 'gates-panel' });
    s.expect('Goes into a new workstream, General');
    s.click('Cancel', ED);
    s.eq('no workstream created on cancel', doc(s).stageGateSets.filter((x) => x.objectiveId === 'OBJ-EL-2027Q1-01').length, 0);
    s.click('Add gate', { within: 'gates-panel' });
    s.type('Name', 'Second-source PTL quotes in', ED);
    s.click('Add gate', ED);
    const sets = doc(s).stageGateSets.filter((x) => x.objectiveId === 'OBJ-EL-2027Q1-01');
    s.eq('General created', sets.map((x) => [x.name, x.chained, x.order]), [['General', true, 0]]);
    s.eq('gate in General', gate(s, 'SG-EL-2027Q1-01-1').setId, sets[0].id);
    s.clean('general');
    pickObj(s, 'Qualify the 10-cell short stack');
    gotoGates(s);
  });

  s.step('add and link: the gate is saved, then the KPI link sheet opens', () => {
    s.click('Add gate', { within: wsKey(W2) });
    s.eq('goes into workstream B', top(s).d.setId, W2);
    s.type('Name', 'Catalyst migration check', ED);
    s.click('Add and link a KPI', ED);
    const g = doc(s).stageGates.find((x) => x.name === 'Catalyst migration check');
    s.ok(!!g && g.setId === W2, 'gate saved in workstream B');
    s.eq('link sheet open', top(s) && top(s).kind, 'kpi.link');
    s.c.closeAllSheets(); s.render();
  });

  s.step('gates without targets offer "Add a target" and "Add linked KPI"', () => {
    const id = doc(s).stageGates.find((x) => x.name === 'Catalyst migration check').id;
    s.click('Add a target', { within: gk(id) });
    s.eq('KPI target sheet for the gate', [top(s).kind, top(s).data.host.id], ['kpi.target', id]);
    s.click('Cancel', ED);
    s.click('Add linked KPI', { within: gk(id) });
    s.eq('link sheet', top(s).kind, 'kpi.link');
    s.c.closeAllSheets(); s.render();
  });

  s.step('edit gate: status shown honestly, only changed fields saved, live values for untouched fields', () => {
    s.click('1,000 h endurance hold', { within: wsKey(W1) });
    s.eq('edit sheet', top(s).kind, 'gates.edit');
    s.type('Name', '1,000 h endurance hold at 2 A/cm²', ED);
    s.click('Failed', { within: 'Status' });
    s.click('Save gate', ED);
    const g = gate(s, 'SG-EL-2026Q4-01-3');
    s.eq('saved', [g.name, g.status, g.plannedDate], ['1,000 h endurance hold at 2 A/cm²', 'missed', day('2026-12-18')]);
    hadToast(s, 'Gate saved.');
    s.expect('Marked failed');
    s.click('1,000 h endurance hold at 2 A/cm²', { within: wsKey(W1) });
    s.click('Passed', { within: 'Status' });
    s.eq('Passed fills an empty passed date with today', top(s).d.actual, '2026-10-13');
    s.click('Pending', { within: 'Status' });
    s.click('In progress', { within: 'Status' });
    s.type('Passed date', '', ED);
    s.type('Planned date', 'not a date', ED);
    s.click('Save gate', ED);
    s.eq('date error', top(s).err, 'Planned date needs a date like 2026-11-13.');
    s.type('Planned date', '2026-12-20', ED);
    gate(s, 'SG-EL-2026Q4-01-3').intention = 'Changed by a teammate.'; s.render();
    s.eq('untouched field is live', s.vals.gates.shEdit.intention, 'Changed by a teammate.');
    s.click('Save gate', ED);
    const g2 = gate(s, 'SG-EL-2026Q4-01-3');
    s.eq('only changed fields written', [g2.plannedDate, g2.status, g2.intention, g2.actualDate], [day('2026-12-20'), 'active', 'Changed by a teammate.', null]);
    s.eq('in progress shown beside the date state', rowOf(s, g2.id).stWord, 'In progress');
    s.clean('after edit');
  });

  s.step('workstream select in the gate sheet moves the gate', () => {
    s.click('Post-test teardown and SEM', { within: wsKey(W2) });
    s.type('Workstream', W1, ED);
    s.click('Save gate', ED);
    s.eq('moved to A', gate(s, 'SG-EL-2026Q4-01-4').setId, W1);
    s.click('Post-test teardown and SEM', { within: wsKey(W1) });
    s.type('Workstream', W2, ED);
    s.click('Save gate', ED);
    s.eq('moved back to B', gate(s, 'SG-EL-2026Q4-01-4').setId, W2);
  });

  s.step('commit baseline and release', () => {
    s.click('1,000 h endurance hold at 2 A/cm²', { within: wsKey(W1) });
    s.click('Commit baseline', ED);
    const g = gate(s, 'SG-EL-2026Q4-01-3');
    s.eq('committed', [g.baselineDate, g.locked], [day('2026-12-20'), true]);
    hadToast(s, 'Gate committed to Dec 20, 2026.');
    s.expect('Committed to Dec 20, 2026');
    s.click('Release', ED);
    s.eq('released', [g.baselineDate, g.locked], [null, false]);
    hadToast(s, 'Commitment released.');
    s.type('Planned date', '2026-12-22', ED);
    s.eq('commit is off while the planned date is unsaved', s.vals.gates.shEdit.commitOff, true);
    s.type('Planned date', '2026-12-20', ED);
    s.eq('commit back on', s.vals.gates.shEdit.commitOff, false);
    s.clean('baseline');
  });

  s.step('predecessors with lag: add, cycle prevention, remove', () => {
    const opts = s.vals.gates.shEdit.predOpts.map((o) => o.v);
    s.ok(opts.indexOf('SG-EL-2026Q4-01-3') < 0, 'self excluded');
    s.ok(opts.indexOf('SG-EL-2026Q4-02-2') > 0, 'gates of other objectives offered');
    s.click('Add predecessor', ED);
    hadToast(s, 'Pick a predecessor gate.');
    s.type('Add a predecessor', 'SG-EL-2026Q4-01-1', ED);
    s.type('Lag (days)', 'x', ED);
    s.click('Add predecessor', ED);
    s.eq('lag error', top(s).err, 'Lag is a number of days, like 5.');
    s.type('Lag (days)', '3', ED);
    s.click('Add predecessor', ED);
    s.ok(doc(s).stageGateEdges.some((e) => e.fromGate === 'SG-EL-2026Q4-01-1' && e.toGate === 'SG-EL-2026Q4-01-3' && e.lagDays === 3), 'edge stored');
    hadToast(s, 'Predecessor added.');
    s.expect('then 3 days');
    s.click('Close', ED);
    s.click('Build and leak-test the stack', { within: wsKey(W1) });
    const o2 = s.vals.gates.shEdit.predOpts.map((o) => o.v);
    s.ok(o2.indexOf('SG-EL-2026Q4-01-3') < 0, 'a successor is never offered (no loop)');
    s.expect('Waiting on this gate:');
    s.click('Close', ED);
    s.click('1,000 h endurance hold at 2 A/cm²', { within: wsKey(W1) });
    s.click('Remove predecessor SG-A1', ED);
    s.ok(!doc(s).stageGateEdges.some((e) => e.fromGate === 'SG-EL-2026Q4-01-1' && e.toGate === 'SG-EL-2026Q4-01-3'), 'edge removed');
    hadToast(s, 'Predecessor removed.');
    s.click('Cancel', ED);
    s.clean('preds');
  });

  s.step('mark complete (manual) and the completion sheet: edit, un-complete', () => {
    s.click('Mark complete', { within: gk('SG-EL-2026Q4-01-5') });
    s.eq('sheet', top(s).kind, 'gates.done');
    s.click('Close', ED);
    s.click('Mark complete', { within: gk('SG-EL-2026Q4-01-5') });
    s.click('Cancel', ED);
    s.eq('cancelled', [s.c.sheet(), gate(s, 'SG-EL-2026Q4-01-5').actualDate], [null, null]);
    s.click('Mark complete', { within: gk('SG-EL-2026Q4-01-5') });
    s.type('Completed date', 'soon', ED);
    s.click('Mark complete', ED);
    s.eq('bad date', top(s).err, 'Completed date needs a date like 2026-10-13.');
    s.type('Completed date', '2026-10-12', ED);
    s.type('~Override justification', '  Reviewed in the Oct 12 design review.  ', ED);
    s.click('Mark complete', ED);
    const g = gate(s, 'SG-EL-2026Q4-01-5');
    s.eq('manual completion', [g.actualDate, g.completionMethod, g.overrideJustification], [day('2026-10-12'), 'manual', 'Reviewed in the Oct 12 design review.']);
    hadToast(s, 'Gate marked complete.');
    s.eq('state', RD.classifyGate(g, TODAY), 'passed');
    s.click('Passed Oct 12', { within: gk(g.id) });
    s.eq('completion sheet', top(s).kind, 'gates.comp');
    s.expect('Manual override');
    s.expect('No KPIs on this gate.');
    s.click('Close', ED);
    s.click('Passed Oct 12', { within: gk(g.id) });
    s.click('Cancel', ED);
    s.click('Passed Oct 12', { within: gk(g.id) });
    s.type('~Justification', 'Signed off by Toru.', ED);
    s.type('Passed date', 'x', ED);
    s.click('Save', ED);
    s.eq('bad date', top(s).err, 'Passed date needs a date like 2026-10-13.');
    s.type('Passed date', '2026-10-11', ED);
    s.click('Save', ED);
    s.eq('updated', [g.actualDate, g.overrideJustification], [day('2026-10-11'), 'Signed off by Toru.']);
    hadToast(s, 'Completion updated.');
    s.click('Passed Oct 11', { within: gk(g.id) });
    s.click('Un-complete gate', ED);
    s.eq('un-completed', [g.actualDate, g.completionMethod, g.overrideJustification], [null, null, null]);
    hadToast(s, 'Gate un-completed.');
    s.clean('completion');
  });

  s.step('completion opened from the gate sheet stacks; the editor follows the change', () => {
    s.click('Build and leak-test the stack', { within: wsKey(W1) });
    s.click('View completion', ED);
    s.eq('stacked', [top(s).kind, s.c.state.sheets.length], ['gates.comp', 2]);
    s.expect('Targets achieved');
    s.expect('Leak test at 30 bar');
    s.click('Back', ED);
    s.eq('back on the editor', top(s).kind, 'gates.edit');
    s.click('View completion', ED);
    s.type('Passed date', '', ED);
    s.click('Save', ED);
    const g = gate(s, 'SG-EL-2026Q4-01-1');
    s.eq('cleared date un-completes', [g.actualDate, g.completionMethod], [null, null]);
    hadToast(s, 'Gate un-completed.');
    s.eq('editor shows the cleared date', [top(s).kind, s.vals.gates.shEdit.actual], ['gates.edit', '']);
    s.click('Save gate', ED);
    s.eq('saving the editor does not write a stale date back', gate(s, 'SG-EL-2026Q4-01-1').actualDate, null);
    s.eq('still at 100', RD.gateAtTarget(g.id, em(s)), true);
    s.c.mutate((D) => { D.docs[KEY].keyResults[0].statement += ''; }); s.flush(0);
    s.eq('an unrelated change does not re-pass it (fixed: today auto-pass undid the un-complete)', gate(s, 'SG-EL-2026Q4-01-1').actualDate, null);
    s.click('Mark complete', { within: gk('SG-EL-2026Q4-01-1') });
    s.type('Completed date', '2026-09-30', ED);
    s.click('Mark complete', ED);
    s.eq('re-passed by hand', gate(s, 'SG-EL-2026Q4-01-1').actualDate, day('2026-09-30'));
  });

  s.step('auto-pass when readiness reaches 100 (any module posting readings)', () => {
    const k = 'KPI-EL-2026Q4-01-5-1';
    s.c.mutate((D) => {
      [8.4, 8.7, 8.3].forEach((v, i) => D.docs[KEY].kpiUpdates.push({ id: 'UPD-test-' + i, kpiId: k, value: v, timestamp: Date.UTC(2026, 9, 13, 10 + i), note: '', batch: 'b_dec1' }));
    }, { msg: 'Reading posted.' });
    s.flush(0);
    const g = gate(s, 'SG-EL-2026Q4-01-2');
    s.eq('readiness now 100', RD.stageGateScore(g.id, em(s)), 100);
    s.eq('passed today, Targets achieved', [g.actualDate, g.completionMethod], [TODAY, 'auto']);
    hadToast(s, labelNow(s, g.id) + ' Durability screen, 500 h passed: every target is met.');
    s.clean('auto-pass');
  });

  s.step('duplicate gate: choose a workstream, definition copies, the sheet closes (fixed quirk)', () => {
    const nK = doc(s).kpis.length;
    s.click('Durability screen, 500 h', { within: wsKey(W1) });
    s.click('Duplicate', ED);
    s.eq('duplicate sheet replaces the editor', [top(s).kind, s.c.state.sheets.length], ['gates.dup', 1]);
    s.click('Close', ED);
    menuOf(s, 'SG-EL-2026Q4-01-2');
    s.click('Duplicate gate', { within: gk('SG-EL-2026Q4-01-2') });
    s.click('Cancel', ED);
    s.click('Durability screen, 500 h', { within: wsKey(W1) });
    s.click('Duplicate', ED);
    s.type('Workstream', W2, ED);
    s.click('Duplicate gate', ED);
    const copy = doc(s).stageGates.find((x) => x.name === 'Durability screen, 500 h (copy)');
    s.ok(!!copy, 'copy exists');
    s.eq('copy fields', [copy.setId, copy.intention, copy.plannedDate, copy.actualDate, copy.status], [W2, gate(s, 'SG-EL-2026Q4-01-2').intention, day('2026-11-13'), null, 'pending']);
    const ks = doc(s).kpis.filter((x) => x.hostType === 'stageGate' && x.hostId === copy.id);
    s.eq('targets copied', ks.map((x) => x.name), ['Voltage decay rate', 'H₂ in O₂ after 500 h']);
    s.eq('no readings copied', doc(s).kpiUpdates.filter((u) => ks.some((x) => x.id === u.kpiId)).length, 0);
    s.eq('no predecessor links copied', doc(s).stageGateEdges.filter((e) => e.toGate === copy.id || e.fromGate === copy.id).length, 0);
    s.eq('kpi count', doc(s).kpis.length, nK + 2);
    s.eq('no sheet re-opens on the original', s.c.sheet(), null);
    hadToast(s, 'Gate duplicated into Teardown and analysis.');
    s.clean('duplicate');
  });

  s.step('delete gate: confirm says what goes; KPIs, readings, links and FMEA links go (fixed)', () => {
    doc(s).risks = doc(s).risks || [];
    doc(s).risks.push({ rid: 'r-test', objectiveId: EL1, problem: 'Membrane thinning', gateId: 'SG-EL-2026Q4-01-4', status: 'open', knowns: [], modes: [] });
    doc(s).stageGateEdges.push({ fromGate: 'SG-EL-2026Q4-01-4', toGate: 'SG-EL-2026Q4-01-5', lagDays: 2 });
    s.render();
    menuOf(s, 'SG-EL-2026Q4-01-4');
    s.click('Delete gate', { within: gk('SG-EL-2026Q4-01-4') });
    s.ok(s.c.state.dlg && /1 target, 2 predecessor links and 1 FMEA gate link/.test(s.c.state.dlg.body), 'confirm lists the loss: ' + (s.c.state.dlg && s.c.state.dlg.body));
    s.click('Cancel', { within: 'Delete this gate?' });
    s.ok(!!gate(s, 'SG-EL-2026Q4-01-4'), 'cancel keeps it');
    s.click('Post-test teardown and SEM', { within: wsKey(W2) });
    s.click('Delete gate', ED);
    s.click('Delete gate', { within: 'Delete this gate?' });
    s.ok(!gate(s, 'SG-EL-2026Q4-01-4'), 'gate gone');
    s.eq('editor closed', s.c.sheet(), null);
    s.eq('its KPI gone', doc(s).kpis.filter((k) => k.hostId === 'SG-EL-2026Q4-01-4').length, 0);
    s.eq('links gone', doc(s).stageGateEdges.filter((e) => e.fromGate === 'SG-EL-2026Q4-01-4' || e.toGate === 'SG-EL-2026Q4-01-4').length, 0);
    s.eq('FMEA link cleared', doc(s).risks.find((r) => r.rid === 'r-test').gateId, null);
    hadToast(s, 'Gate deleted.');
    s.clean('delete gate');
  });

  s.step('gate menu: Connect data', () => {
    menuOf(s, 'SG-EL-2026Q4-01-2');
    s.click('Connect data', { within: 'Actions for ' + labelNow(s, 'SG-EL-2026Q4-01-2') });
    s.eq('connect sheet', top(s) && top(s).kind, 'kpi.connect');
    s.c.closeAllSheets(); s.render();
  });

  s.step('workstreams: add (name required), inline rename, chained / independent sticks', () => {
    s.click('Add workstream', { within: 'gates-panel' });
    s.eq('sheet', top(s).kind, 'gates.ws');
    s.click('Close', ED);
    s.click('Add workstream', { within: 'gates-panel' });
    s.click('Cancel', ED);
    s.click('Add workstream', { within: 'gates-panel' });
    s.click('Create workstream', ED);
    s.eq('error', top(s).err, 'Give the workstream a name.');
    s.type('Name', 'Balance of plant', ED);
    s.check('~Independent', true, ED);
    s.key('Name', 'Enter', ED);
    const w = doc(s).stageGateSets.find((x) => x.name === 'Balance of plant');
    s.eq('created with Enter', w && [w.objectiveId, w.chained, w.order], [EL1, false, 2]);
    hadToast(s, 'Workstream added.');
    s.expect('Workstream C');
    s.expect('No gates in this workstream yet. Use Add gate to give it its first checkpoint.');
    s.click('Add gate', { within: wsKey(w.id) });
    s.eq('add sheet into C', top(s).d.setId, w.id);
    s.click('Cancel', ED);
    s.click('Rename workstream', { within: wsKey(w.id) });
    s.type('Workstream name', 'BOP', { within: wsKey(w.id) });
    s.key('Workstream name', 'Escape', { within: wsKey(w.id) });
    s.eq('escape cancels', w.name, 'Balance of plant');
    s.click('Rename workstream', { within: wsKey(w.id) });
    s.type('Workstream name', '', { within: wsKey(w.id) });
    s.key('Workstream name', 'Enter', { within: wsKey(w.id) });
    s.expect('Give the workstream a name.');
    s.type('Workstream name', 'Balance of plant (BOP)', { within: wsKey(w.id) });
    s.key('Workstream name', 'Enter', { within: wsKey(w.id) });
    s.eq('renamed', w.name, 'Balance of plant (BOP)');
    hadToast(s, 'Workstream renamed.');
    s.click('Rename workstream', { within: wsKey(w.id) });
    s.type('Workstream name', 'BOP', { within: wsKey(w.id) });
    fireOn(s, s.find('Workstream name', { within: wsKey(w.id), handler: 'onBlur' }), 'onBlur');
    s.eq('blur saves', w.name, 'BOP');
    s.click('~Independent', { within: wsKey(w.id) });
    s.eq('chained now', w.chained, true);
    s.click('~Chained', { within: wsKey(w.id) });
    s.eq('independent again', w.chained, false);
    hadToast(s, 'Workstream set to independent: its gates keep their own dates.');
    s.click('Actions for workstream BOP', { within: wsKey(w.id) });
    s.click('Edit workstream', { within: wsKey(w.id) });
    s.eq('edit sheet', [top(s).kind, top(s).d.chained], ['gates.ws', false]);
    s.check('~Chained', true, ED);
    s.type('Name', 'Balance of plant', ED);
    s.click('Save workstream', ED);
    s.eq('edited', [w.name, w.chained], ['Balance of plant', true]);
    hadToast(s, 'Workstream updated.');
    s.clean('workstreams');
  });

  s.step('reorder workstreams: drag the handle, and Move up / Move down', () => {
    const order = () => doc(s).stageGateSets.filter((x) => x.objectiveId === EL1).sort((a, b) => a.order - b.order).map((x) => x.name);
    s.eq('start', order(), ['Durability', 'Teardown and analysis', 'Balance of plant']);
    const bop = doc(s).stageGateSets.find((x) => x.name === 'Balance of plant');
    s.drag('Drag to reorder workstreams', (el) => el.attrs['data-k'] === wsKey(W1), { from: { within: wsKey(bop.id) } });
    s.flush(0);
    s.eq('dragged to the top', order(), ['Balance of plant', 'Durability', 'Teardown and analysis']);
    hadToast(s, 'Workstreams reordered.');
    s.eq('letters follow position', s.vals.gates.tab.sets.map((x) => x.letter + ' ' + x.name), ['Workstream A Balance of plant', 'Workstream B Durability', 'Workstream C Teardown and analysis']);
    s.click('Actions for workstream Balance of plant', { within: wsKey(bop.id) });
    s.click('Move down', { within: wsKey(bop.id) });
    s.eq('moved down', order(), ['Durability', 'Balance of plant', 'Teardown and analysis']);
    s.eq('menu closed', s.c.state.menu, '');
    s.click('Actions for workstream Balance of plant', { within: wsKey(bop.id) });
    s.click('Move up', { within: wsKey(bop.id) });
    s.eq('moved up', order(), ['Balance of plant', 'Durability', 'Teardown and analysis']);
    const el = s.find((e) => e.attrs['data-k'] === wsKey(W2) && e.on.onDragLeave);
    fireOn(s, el, 'onDragLeave');
    s.click('Actions for workstream Balance of plant', { within: wsKey(bop.id) });
    s.click('Move down', { within: wsKey(bop.id) });
    s.click('Actions for workstream Balance of plant', { within: wsKey(bop.id) });
    s.click('Move down', { within: wsKey(bop.id) });
    s.eq('back at the end', order(), ['Durability', 'Teardown and analysis', 'Balance of plant']);
    s.clean('reorder');
  });

  s.step('delete workstream: empty (confirm), move gates, delete with gates', () => {
    const bop = doc(s).stageGateSets.find((x) => x.name === 'Balance of plant');
    s.click('Actions for workstream Balance of plant', { within: wsKey(bop.id) });
    s.click('Delete workstream', { within: wsKey(bop.id) });
    s.eq('confirm dialog', s.c.state.dlg && s.c.state.dlg.title, 'Delete workstream?');
    s.click('Delete workstream', { within: 'Delete workstream?' });
    s.ok(!doc(s).stageGateSets.some((x) => x.id === bop.id), 'deleted');
    hadToast(s, 'Workstream deleted.');
    const n2 = doc(s).stageGates.filter((g) => g.objectiveId === EL1 && g.setId === W2).length;
    s.click('Actions for workstream Teardown and analysis', { within: wsKey(W2) });
    s.click('Edit workstream', { within: wsKey(W2) });
    s.click('Delete workstream', ED);
    s.eq('choice sheet stacked on the editor', [top(s).kind, s.c.state.sheets.length, top(s).d.choice], ['gates.wsdel', 2, 'move']);
    s.expect('Teardown and analysis holds ' + n2 + ' stage-gates. What should happen to them?');
    s.click('Back', ED);
    s.eq('back to the workstream editor', top(s).kind, 'gates.ws');
    s.click('Delete workstream', ED);
    s.check('~Delete them with the workstream', true, ED);
    s.eq('delete picked', [top(s).d.choice, s.vals.gates.shWsDel.goLabel], ['delete', 'Continue']);
    s.check('Move them to', true, ED);
    s.type('Workstream to move the gates to', W1, ED);
    s.click('Close', ED);
    s.eq('closing the choice returns to the editor', top(s).kind, 'gates.ws');
    s.click('Delete workstream', ED);
    s.click('Cancel', ED);
    s.click('Delete workstream', ED);
    s.type('Workstream to move the gates to', W1, ED);
    const n1 = doc(s).stageGates.filter((g) => g.objectiveId === EL1 && g.setId === W1).length;
    s.click('Continue', ED);
    s.ok(!doc(s).stageGateSets.some((x) => x.id === W2), 'workstream gone');
    s.eq('gates moved', doc(s).stageGates.filter((g) => g.objectiveId === EL1 && g.setId === W1).length, n1 + n2);
    hadToast(s, 'Workstream deleted, ' + n2 + ' gates moved.');
    s.eq('sheets closed', s.c.sheet(), null);
    s.clean('ws move');
  });

  s.step('only workstream with gates: keep everything, or delete it with its gates (links, readings, FMEA)', () => {
    pickObj(s, 'Lock Tera 25-30-R5 components');
    gotoGates(s);
    const W = 'SGSET-EL-2026Q4-02-1';
    doc(s).risks.push({ rid: 'r-test2', objectiveId: EL2, problem: 'ICR drift', gateId: 'SG-EL-2026Q4-02-2', status: 'open', knowns: [], modes: [] });
    s.render();
    s.click('Actions for workstream Component lock', { within: wsKey(W) });
    s.click('Delete workstream', { within: wsKey(W) });
    s.eq('choice sheet, keep is the default', [top(s).kind, top(s).d.choice], ['gates.wsdel', 'keep']);
    s.expect('Component lock is the only workstream and holds 3 stage-gates.');
    s.check('~Delete the workstream and its 3 stage-gates', true, ED);
    s.check('~Keep everything', true, ED);
    s.click('Keep everything', ED);
    s.ok(doc(s).stageGateSets.some((x) => x.id === W), 'kept');
    s.click('Actions for workstream Component lock', { within: wsKey(W) });
    s.click('Delete workstream', { within: wsKey(W) });
    s.check('~Delete the workstream and its 3 stage-gates', true, ED);
    const ids = ['SG-EL-2026Q4-02-1', 'SG-EL-2026Q4-02-2', 'SG-EL-2026Q4-02-3'];
    const kpiIds = doc(s).kpis.filter((k) => k.hostType === 'stageGate' && ids.indexOf(k.hostId) >= 0).map((k) => k.id);
    s.ok(doc(s).kpiUpdates.some((u) => kpiIds.indexOf(u.kpiId) >= 0), 'there are readings to lose');
    s.click('Continue', ED);
    s.eq('gates gone', doc(s).stageGates.filter((g) => g.objectiveId === EL2).length, 0);
    s.eq('their KPIs gone', doc(s).kpis.filter((k) => kpiIds.indexOf(k.id) >= 0).length, 0);
    s.eq('their readings gone (fixed)', doc(s).kpiUpdates.filter((u) => kpiIds.indexOf(u.kpiId) >= 0).length, 0);
    s.eq('FMEA link cleared (fixed)', doc(s).risks.find((r) => r.rid === 'r-test2').gateId, null);
    hadToast(s, 'Workstream and 3 stage-gates deleted.');
    s.clean('ws delete all');
  });

  s.step('Kanban is its own tab: Stage-gates always lists the gates; doc.gateMode is never written', () => {
    const before = JSON.stringify(doc(s).gateMode || {});
    s.ok(!s.has('Show stage-gates as'), 'no Gates / Kanban switch');
    s.eq('gates listed with their actions', [s.vals.gates.tab.canAdd, s.has('Add gate', { within: 'gates-panel' })], [true, true]);
    s.ok(!!s.vals.gates.hist && s.vals.gates.hist.none, 'plan history under the gates, empty for this objective');
    s.click('Kanban', { within: 'Objective sections' });
    s.eq('the Kanban tab: boards, no gate list', [s.c.state.tab, s.has((el) => el.attrs && el.attrs['data-k'] === 'kb'), s.has('Add gate', { within: 'gates-panel' })], ['kanban', true, false]);
    s.click('Stage-gates', { within: 'Objective sections' });
    s.eq('back to the gates', s.c.state.tab, 'gates');
    s.eq('doc.gateMode untouched', JSON.stringify(doc(s).gateMode || {}), before);
  });

  s.step('legacy revised plan banner: Revise and Clear plan (type CLEAR)', () => {
    const s2 = new Sim(FILE);
    pickObj(s2, 'Lock Tera 25-30-R5 components');
    gotoGates(s2);
    s2.expect('Revised plan active');
    s2.expect('1 gate re-committed. Enacted Sep 22, now on schedule.');
    s2.ok(s2.has('Re-committed', { within: gk('SG-EL-2026Q4-02-3') }), 're-committed tag');
    s2.expect('Revision v1: Nov 13 to Nov 20');
    s2.click('Clear plan');
    s2.type('Type CLEAR to confirm', 'clear');
    s2.click('Clear plan', { within: 'Clear the revised plan?' });
    s2.eq('error keeps the dialog', s2.c.state.dlg && s2.c.state.dlg.err, 'Type CLEAR to confirm.');
    s2.type('Type CLEAR to confirm', 'CLEAR');
    s2.click('Clear plan', { within: 'Clear the revised plan?' });
    s2.eq('plan cleared, dates stay', [RD.activeCatchupPlan(doc(s2).catchupPlans, EL2), gate(s2, 'SG-EL-2026Q4-02-3').plannedDate], [null, day('2026-11-20')]);
    hadToast(s2, 'Revised plan cleared.');
    s2.expectNot('Revised plan active');
    s2.clean('clear plan');
    const s3 = new Sim(FILE);
    pickObj(s3, 'Lock Tera 25-30-R5 components');
    gotoGates(s3);
    s3.click('Revise', { within: 'gates-panel' });
    s3.eq('revise sheet', s3.c.sheet().kind, 'gates.revise');
    s3.expect('Drafting v2');
    s3.click('Cancel', ED);
    s3.eq('cancel leaves nothing', [s3.c.sheet(), s3.c.state.gates_rp, (doc(s3).planVersions || []).filter((v) => v.objectiveId === EL2).length], [null, null, 0]);
    s3.click('Revise', { within: 'plan-active' });
    s3.eq('the shell entry point (GATES.openRevise) opens the same editor', s3.c.sheet().kind, 'gates.revise');
    s3.click('Close', ED);
    s3.eq('closed', s3.c.sheet(), null);
  });

  s.step('revise plan: rename, re-date, add, delete with undo, move, targets, finish, reason, commit v3', () => {
    const r = new Sim(FILE);
    gotoGates(r);
    r.click('Revise plan', { within: 'gates-history' });
    r.eq('sheet', r.c.sheet().kind, 'gates.revise');
    r.expect('Drafting v3 for Qualify the 10-cell short stack for durability testing');
    r.ok(r.has('Passed, locked', { within: 'rp-SG-EL-2026Q4-01-1' }), 'passed gate locked');
    r.type('Gate name, SG-A3', '1,000 h hold', ED);
    r.type('Planned date, Post-test teardown and SEM', '2026-12-11', ED);
    r.click('Add a gate to Teardown and analysis', ED);
    r.click('Commit v3', ED);
    r.eq('needs names and dates', r.c.sheet().err, 'Every gate needs a name and a date before committing.');
    r.type('Gate name, new gate', 'SEM cross-section review', ED);
    r.type('Planned date, SEM cross-section review', '2026-12-16', ED);
    r.click('Remove Failure-mode review from the plan', ED);
    r.expect('Will be removed');
    r.click('Undo', ED);
    r.expectNot('Will be removed');
    r.click('Remove Failure-mode review from the plan', ED);
    r.drag('Drag to move this gate', (el) => el.attrs['data-k'] === 'rp-SG-EL-2026Q4-01-4', { from: { within: 'rp-SG-EL-2026Q4-01-3' } });
    r.flush(0);
    const setOf = (id) => r.c.state.gates_rp.gates.find((g) => g.id === id).setId;
    r.eq('dragged into Teardown', setOf('SG-EL-2026Q4-01-3'), W2);
    r.click('Move 1,000 h hold up', ED);
    r.eq('up from the top of Teardown crosses into Durability', setOf('SG-EL-2026Q4-01-3'), W1);
    r.click('Move 1,000 h hold down', ED);
    r.eq('down crosses into Teardown again', setOf('SG-EL-2026Q4-01-3'), W2);
    r.drag('Drag to move this gate', (el) => el.attrs['data-k'] === 'rpws-' + W2, { from: { within: 'rp-SG-EL-2026Q4-01-3' } });
    r.flush(0);
    r.eq('dropped on the workstream: last in it', r.c.state.gates_rp.gates.filter((g) => g.setId === W2).map((g) => g.id).slice(-1), ['SG-EL-2026Q4-01-3']);
    for (let i = 0; i < 6 && setOf('SG-EL-2026Q4-01-3') !== W1; i++) r.click('Move 1,000 h hold up', ED);
    r.eq('back in Durability', setOf('SG-EL-2026Q4-01-3'), W1);
    r.click('Targets for SEM cross-section review', ED);
    r.eq('targets sheet stacked', [r.c.sheet().kind, r.c.state.sheets.length], ['gates.rtgt', 2]);
    r.click('Add target', ED);
    r.eq('KPI target sheet in draft mode', r.c.sheet().kind, 'kpi.target');
    r.type('Name', 'Thinning seen on SEM', ED);
    r.click('Binary (pass or fail)', ED);
    r.click('Save target', ED);
    r.eq('draft on the new row', r.c.state.gates_rp.gates.find((g) => g.name === 'SEM cross-section review').targets.map((t) => [t.name, t.targetType]), [['Thinning seen on SEM', 'binary']]);
    r.click('Done', ED);
    r.click('Targets for 1,000 h hold', ED);
    r.ok(r.has('Voltage decay rate, 1,000 h', ED), 'live KPI table for an existing gate');
    r.click('Back', ED);
    r.click('Targets for 1,000 h hold', ED);
    r.click('Close', ED);
    r.type('Committed finish', '2027-01-08', ED);
    r.expect('This plan ends Dec 18, 2026, inside the committed finish.');
    r.type('Committed finish', '2026-12-01', ED);
    r.expect('This plan ends Dec 18, 2026, past the committed finish.');
    r.type('Committed finish', '2027-01-08', ED);
    r.type('Why this revision', 'SEM review split out of the teardown.', ED);
    r.expect('1 gate added, 1 gate removed');
    r.click('Commit v3', ED);
    const vs = RD.planVersionsOf(doc(r), EL1);
    r.eq('v3 committed', vs.map((v) => v.v), [1, 2, 3]);
    r.eq('v3 reason', vs[2].reason, 'SEM review split out of the teardown.');
    r.eq('v3 snapshot = live plan', JSON.stringify(vs[2].snapshot), JSON.stringify(RD.capturePlanSnapshot(doc(r), r.c.D.portfolio, EL1)));
    r.eq('finish saved (fixed: today never saved)', r.c.D.portfolio.objectives.find((o) => o.id === EL1).plannedEnd, day('2027-01-08'));
    r.ok(!gate(r, 'SG-EL-2026Q4-01-5'), 'removed gate gone');
    r.eq('removed gate KPIs and readings', doc(r).kpis.filter((k) => k.hostId === 'SG-EL-2026Q4-01-5').length, 0);
    const ng = doc(r).stageGates.find((g) => g.name === 'SEM cross-section review');
    r.eq('new gate: a real id that history has never used (fixed: today kept SGNEW-…)', [ng.id, ng.setId, ng.plannedDate, ng.status], ['SG-EL-2026Q4-01-6', W2, day('2026-12-16'), 'pending']);
    r.eq('its draft target became a KPI', doc(r).kpis.filter((k) => k.hostId === ng.id).map((k) => k.name), ['Thinning seen on SEM']);
    r.eq('renamed and re-dated', [gate(r, 'SG-EL-2026Q4-01-3').name, gate(r, 'SG-EL-2026Q4-01-4').plannedDate], ['1,000 h hold', day('2026-12-11')]);
    hadToast(r, 'Revised plan committed as v3.');
    r.eq('sheet closed', r.c.sheet(), null);
    const H = r.vals.gates.hist;
    r.eq('history rows', H.rows.map((x) => x.v + ' ' + x.tag), ['v3 Live', 'v2 ', 'v1 Original']);
    r.eq('v3 chips (the drags reassigned the gate order, so the engine also reports a reorder)', H.rows[0].chips.map((c) => c.t), ['1 gate added', '1 gate removed', '1 moved', '1 renamed', 'Reordered', 'Finish moved']);
    r.eq('finish no longer held', H.hasHeld, false);
    r.click('Compare to v2', { within: 'pv-3' });
    r.eq('compare sheet', r.c.sheet().kind, 'gates.cmp');
    r.expect('Compare v2 and v3');
    r.expect('“SEM review split out of the teardown.”');
    r.expect('SEM cross-section review, Dec 16, 2026');
    r.expect('Failure-mode review');
    r.expect('Post-test teardown and SEM: Dec 4, 2026 to Dec 11, 2026 (+7 days)');
    r.expect('1,000 h endurance hold to 1,000 h hold');
    r.expect('Dec 18, 2026 to Jan 8, 2027');
    r.click('Close', ED);
    r.click('View', { within: 'pv-1' });
    r.expect('Plan v1, as first committed');
    r.expect('Nov 6, 2026');
    r.expect('Committed finish Dec 18, 2026');
    r.click('Close', { within: 'Editor', nth: 1 });
    r.eq('closed', r.c.sheet(), null);
    r.eq('gate marks follow v3', ['SG-EL-2026Q4-01-4', ng.id, 'SG-EL-2026Q4-01-3'].map((id) => rowOf(r, id).vmark), ['Moved in v3 (+7 days)', 'Added in v3', 'Renamed in v3']);
    r.clean('after revise');
  });

  s.step('October 20: SG1 passed 3 days late, then Revise plan moves SG2 to SG5 out 3 days: v2 takes the 3 days in', () => {
    const r = drill(new Sim(FILE));
    const L = (i) => labelNow(r, dg(i));
    r.eq('before: every later gate is pushed 3 days by SG1', LATER.map((i) => pushOf(r, dg(i))), LATER.map(() => 'Pushed 3 days by ' + L(1)));
    r.eq('before: 3 days behind, the engine and the card', [drillCasc(r).objectiveScheduleSlip[DRILL], schedOf(r)], [3, 'Planned ' + md(TODAY + 60) + ', 3 days behind schedule']);
    r.click('Revise plan', { within: 'gates-history' });
    r.expect('The revised plan accounts for every delay so far, whether you move dates or keep them to make up the time; after it, only new slips count. Nothing changes until you commit v2.');
    LATER.forEach((i) => r.type('Planned date, Drill gate ' + i, isoOf(TODAY + 10 * (i - 1) + 3), ED));
    r.type('Why this revision', 'Gate 1 ran 3 days over.', ED);
    r.click('Commit v2', ED);
    hadToast(r, 'Revised plan committed as v2.');
    const c = drillCasc(r);
    r.eq('engine: SG2 to SG5 hold their new dates (until October 20: 3 days past each)', LATER.map((i) => c.gateEffective[dg(i)]), LATER.map((i) => TODAY + 10 * (i - 1) + 3));
    r.eq('engine: back on schedule, finishing on SG5\'s new date, revised today', [c.objectiveScheduleSlip[DRILL], c.objectiveWorkForecast[DRILL], c.objectiveRevisionDay[DRILL]], [0, TODAY + 43, TODAY]);
    r.eq('no gate is pushed any more', LATER.map((i) => pushOf(r, dg(i))), ['', '', '', '']);
    r.eq('SG1 keeps its 3 days, and says the plan took them in', whenOf(r, dg(1)).slice(1), ['Finished 3 days late', 'Plan v2 takes this into account']);
    r.eq('SG1 still passed late', rowOf(r, dg(1)).stWord, 'Passed late');
    r.eq('the card: on schedule', schedOf(r), 'Planned ' + md(TODAY + 60) + ', on schedule');
    r.expect('Revised plan v2 active since ' + md(TODAY) + '. Delays before it are part of the plan; only new slips count.');
    r.click('Overview', { within: 'Objective sections' });
    r.expect('Plan v2 takes this delay into account.');
    r.clean('v2 takes the delay in');
  });

  s.step('Revise plan keeping SG2 to SG5 on their dates (a plan to make up the time); a slip after it pushes again', () => {
    const r = drill(new Sim(FILE));
    r.click('Revise plan', { within: 'gates-history' });
    r.type('Why this revision', 'We make the 3 days up in testing.', ED);
    r.click('Commit v2', ED);
    let c = drillCasc(r);
    r.eq('kept dates hold: on schedule', [LATER.map((i) => c.gateEffective[dg(i)]), c.objectiveScheduleSlip[DRILL], schedOf(r)],
      [[TODAY + 10, TODAY + 20, TODAY + 30, TODAY + 40], 0, 'Planned ' + md(TODAY + 60) + ', on schedule']);
    tenDaysOn(r, (d) => d.planVersions.filter((v) => v.objectiveId === DRILL).forEach((v) => { v.committedDay -= 12; }));
    c = drillCasc(r);
    r.eq('SG2 two days past its date pushes SG3 to SG5 two days', [3, 4, 5].map((i) => c.gateEffective[dg(i)]), [TODAY + 22, TODAY + 32, TODAY + 42]);
    r.eq('…and is named as the cause, not SG1 (whose delay is in the plan)', pushOf(r, dg(3)), 'Pushed 2 days by ' + labelNow(r, dg(2)));
    r.eq('the card: 2 days behind', schedOf(r), 'Planned ' + md(TODAY + 60) + ', 2 days behind schedule');
    r.clean('a new slip after the revision');
  });

  s.step('first revision of an objective writes v1 (as first committed) and v2', () => {
    const r = new Sim(FILE);
    pickObj(r, 'Cut stack cost 18%');
    gotoGates(r);
    r.expect('No plan versions yet.');
    r.click('Add gate', { within: 'gates-panel' });
    r.type('Name', 'Supplier audit', ED);
    r.type('Planned date', '2027-02-05', ED);
    r.click('Add gate', ED);
    r.click('Revise plan', { within: 'gates-history' });
    r.expect('Drafting v2');
    r.type('Planned date, Supplier audit', '2027-02-12', ED);
    r.click('Commit v2', ED);
    const vs = RD.planVersionsOf(doc(r), 'OBJ-EL-2027Q1-01');
    r.eq('v1 and v2', vs.map((v) => [v.v, v.reason]), [[1, 'plan as first committed'], [2, '']]);
    r.eq('v1 holds the original date', vs[0].snapshot.gates[0].plannedDate, day('2027-02-05'));
    r.expect('revision');
    r.clean('first commit');
  });

  s.step('search finds gates by name or gate id and opens the gate', () => {
    const r = new Sim(FILE);
    const hits = search(r, 'dur-500');
    r.eq('one hit for the gate id', hits.map((h) => h.label), ['SG-A2 Durability screen, 500 h']);
    r.eq('hit sub', hits[0].sub, 'Stage-gate, gate id DUR-500, Qualify the 10-cell short stack for durability testing');
    r.type('Search', 'DUR-500');
    r.click('~SG-A2 Durability screen, 500 h', { within: 'Search results' });
    r.eq('opened', [r.c.state.tab, r.c.sheet().kind, r.c.sheet().data.id], ['gates', 'gates.edit', 'SG-EL-2026Q4-01-2']);
    r.c.closeAllSheets(); r.render();
    const h2 = search(r, 'design freeze');
    r.eq('a gate in another objective', h2.map((h) => h.label), ['SG-A3 Design freeze sign-off']);
    h2[0].go(); r.flush(0);
    r.eq('switched objective', [r.c.state.objId, r.c.sheet().data.id], [EL2, 'SG-EL-2026Q4-02-3']);
    r.eq('nothing for blank', search(r, '  ').length, 0);
    r.clean('search');
  });

  s.step('read-only: no editing controls, views still open, the Kanban tab saves nothing', () => {
    const r = new Sim(FILE);
    gotoGates(r);
    r.click('Settings');
    r.check('Preview the read-only view', true);
    r.c.closeAllSheets(); r.render();
    r.eq('ro on', r.c.state.ro, true);
    r.ok(!r.has('Add workstream') && !r.has('Mark complete') && !r.has('Actions for SG-A2') && !r.has('Revise plan') && !r.has('Rename workstream'), 'no editing controls');
    r.ok(r.has('Chained', { within: wsKey(W1) }), 'chain shown as text');
    r.click('Durability screen, 500 h', { within: wsKey(W1) });
    r.eq('gate sheet opens read-only', r.vals.gates.shEdit.ro, true);
    r.ok(!r.has('Save gate') && !r.has('Delete gate'), 'no save or delete');
    r.click('Close', { within: 'Editor', nth: 1 });
    r.click('Passed Sep 30', { within: gk('SG-EL-2026Q4-01-1') });
    r.eq('completion read-only', r.vals.gates.shComp.ro, true);
    r.ok(!r.has('Un-complete gate'), 'no un-complete');
    r.click('Close', { within: 'Editor', nth: 1 });
    r.click('Kanban', { within: 'Objective sections' });
    r.eq('the Kanban tab, read-only', [r.c.state.tab, r.vals.kb.ro], ['kanban', true]);
    r.eq('not saved', doc(r).gateMode[EL1], undefined);
    r.click('Stage-gates', { within: 'Objective sections' });
    r.click('Compare to v1', { within: 'pv-2' });
    r.eq('history still viewable', r.c.sheet().kind, 'gates.cmp');
    r.c.closeAllSheets(); r.render();
    api(r).openRevise(r.c, r.c.ctx); r.flush(0);
    r.eq('revise refused', [r.c.sheet(), lastToast(r)], [null, 'Read-only view — editing is disabled.']);
    r.clean('read-only');
  });

  s.step('ended objective: unfinished gates show as cancelled with no completion control', () => {
    const r = new Sim(FILE);
    r.c.mutate((D) => { D.docs[KEY].objectiveState.push({ objectiveId: EL1, status: 'abandoned', endedDay: TODAY, note: '' }); });
    r.flush(0);
    gotoGates(r);
    const g = rowOf(r, 'SG-EL-2026Q4-01-2');
    r.eq('cancelled', [g.stWord, g.canMark, g.cls.indexOf('cnl') >= 0], ['Cancelled', false, true]);
    r.ok(r.has('Cancelled when the objective ended'), 'schedule line');
    r.click('Overview', { within: 'Objective sections' });
    const items = r.c.MODS.review.api.items(r.c, r.c.ctx).filter((it) => it.type === 'gate');
    r.eq('the review shows the unfinished gates as cancelled', items.map((it) => it.status), ['done', 'cancelled', 'cancelled', 'cancelled', 'cancelled']);
    r.ok(r.has('~Cancelled', { within: 'review', tag: 'button' }), 'a Cancelled chip appears (only when something is cancelled)');
    r.expect('Cancelled when the objective ended.');
    r.clean('ended');
  });
  return s;
}

/* ======================================================================== Sales */
function salesScenarios() {
  const s = new Sim(FILE);
  const BD1 = 'OBJ-BD-2026Q4-01';
  const W = 'SGSET-BD-2026Q4-01-1';
  s.step('Sales overview: the review table\'s gate rows, readiness from the seeded pass criterion; a name opens the gate', () => {
    const items = s.c.MODS.review.api.items(s.c, s.c.ctx).filter((it) => it.type === 'gate');
    s.eq('rows', items.map((it) => [it.row.tid, it.row.name, it.status, it.row.stSub]), [['SG-A1', 'Standard pilot term sheet approved', 'done', 'Passed 1 day early'], ['SG-A2', 'Interconnection study scoped', 'risk', 'High risk open on it']]);
    const a2 = items[1];
    s.eq('readiness = engine (1 of 3 sites)', [a2.row.barVal, a2.row.date, a2.row.dateSub], [Math.round(RD.stageGateScore('SG-BD-2026Q4-01-2', em(s))) + '%', 'Nov 6', 'In 24 days']);
    s.eq('33% = 1 of 3 sites', a2.row.barVal, '33%');
    s.ok(/Moved from Oct 30 by the revised plan of Oct 2\./.test(a2.row.note), 'the re-commit shows in the note: ' + a2.row.note);
    s.click((el) => el.tag === 'button' && /\breview-link\b/.test(el.attrs.class || '') && textOf(el).indexOf('Interconnection study scoped') >= 0);
    s.eq('to the tab, the gate open and highlighted', [s.c.state.tab, !!s.c.state.gates_open['SG-BD-2026Q4-01-2'], s.c.state.gates_focus], ['gates', true, 'SG-BD-2026Q4-01-2']);
    s.click('Overview', { within: 'Objective sections' });
    s.clean('sales overview');
  });
  s.step('the gates even where Kanban was the stored view; legacy banner; no plan history, drag or Connect data in Sales', () => {
    gotoGates(s);
    s.eq('gates listed; the old stored view left as it was', [s.has('Add gate', { within: 'gates-panel' }), doc(s).gateMode[BD1]], [true, 'kanban']);
    s.expect('Revised plan active');
    s.expect('1 gate re-committed. Enacted Oct 2, now on schedule.');
    s.ok(!s.has('Plan history'), 'no plan history in Sales');
    s.ok(!s.has('Drag to reorder workstreams'), 'no workstream drag in Sales');
    s.ok(!s.has('Connect data'), 'no Connect data in Sales');
    s.eq('state words', ['SG-BD-2026Q4-01-1', 'SG-BD-2026Q4-01-2'].map((id) => rowOf(s, id).stWord), ['Passed', 'Pending']);
    s.eq('re-committed line', rowOf(s, 'SG-BD-2026Q4-01-2').recommitText, 'Revision v1: Oct 30 to Nov 6');
    s.clean('sales gates');
  });
  s.step('Sales Revise = the simple re-commit dialog: all dates required, enact', () => {
    s.click('Revise', { within: 'gates-panel' });
    s.eq('re-commit sheet', s.c.sheet().kind, 'gates.recommit');
    s.expect('Build revised plan');
    s.expect('This objective is off schedule.');
    s.expect('Ready to enact');
    s.expect('1 of 1 dated');
    s.type('New commitment for SG-A2', '');
    s.expect('All 1 dates are required to enact');
    s.eq('enact off', s.vals.gates.shRec.off, true);
    s.click('Enact plan revision', ED);
    s.eq('refused without a date', s.c.sheet().err, 'Every gate needs a date.');
    s.click('Close', ED);
    s.click('Revise', { within: 'gates-panel' });
    s.click('Cancel', ED);
    s.eq('cancel changes nothing', gate(s, 'SG-BD-2026Q4-01-2').plannedDate, day('2026-11-06'));
    s.click('Revise', { within: 'gates-panel' });
    s.type('New commitment for SG-A2', '2026-11-13');
    s.click('Enact plan revision', ED);
    const g = gate(s, 'SG-BD-2026Q4-01-2');
    s.eq('re-dated', g.plannedDate, day('2026-11-13'));
    const p = RD.activeCatchupPlan(doc(s).catchupPlans, BD1);
    s.eq('plan entry keeps the first original date, version 2', [p.enactedDay, p.gates], [TODAY, [{ gateId: 'SG-BD-2026Q4-01-2', originalDate: day('2026-10-30'), newDate: day('2026-11-13'), version: 2 }]]);
    hadToast(s, 'Plan revision enacted: 1 gate re-committed.');
    s.expect('Revision v2: Oct 30 to Nov 13');
    s.clean('enact');
  });
  s.step('the shell entry point opens the same dialog; nothing unfinished is refused', () => {
    s.click('Revise', { within: 'plan-active' });
    s.eq('opens the re-commit', s.c.sheet().kind, 'gates.recommit');
    s.click('Cancel', ED);
    s.c.mutate((D) => { D.docs[KEY].stageGates.forEach((g) => { if (g.objectiveId === BD1 && g.actualDate == null) g.actualDate = TODAY; }); });
    s.flush(0);
    s.click('Revise', { within: 'plan-active' });
    s.eq('refused', [s.c.sheet(), lastToast(s)], [null, 'No unfinished stage-gates to re-commit.']);
  });
  s.step('October 20, Sales: SG1 passed 3 days late, then Build revised plan from the Stage-gates panel: the plan takes the 3 days in', () => {
    const r = drill(new Sim(FILE));
    const L = (i) => labelNow(r, dg(i));
    r.eq('before: pushed 3 days by SG1, 3 days behind', [LATER.map((i) => pushOf(r, dg(i))), drillCasc(r).objectiveScheduleSlip[DRILL], schedOf(r)],
      [LATER.map(() => 'Pushed 3 days by ' + L(1)), 3, 'Planned ' + md(TODAY + 60) + ', 3 days behind schedule']);
    r.ok(!r.has('Build revised plan', { within: 'plan-active' }) && !r.has('~past the 10-day alarm'), 'no alarm at 3 days, so the head offers nothing');
    r.c.setState({ ro: true }); r.render();
    r.ok(!r.has('Build revised plan', { within: 'gates-panel' }), 'read-only: no Build revised plan');
    r.c.setState({ ro: false }); r.render();
    r.click('Build revised plan', { within: 'gates-panel' });
    r.eq('the re-commit sheet', r.c.sheet().kind, 'gates.recommit');
    r.expect('This objective is 3 days behind. Re-commit every unfinished stage-gate to a new date; keeping its current date is a plan to make up the time. Passed gates are not listed: the revised plan accounts for their delays, and after it only new slips count.');
    LATER.forEach((i) => r.type('New commitment for ' + L(i), isoOf(TODAY + 10 * (i - 1) + 3)));
    r.click('Enact plan revision', ED);
    hadToast(r, 'Plan revision enacted: 4 gates re-committed.');
    let c = drillCasc(r);
    r.eq('engine: SG2 to SG5 hold their new dates, on schedule', [LATER.map((i) => c.gateEffective[dg(i)]), c.objectiveScheduleSlip[DRILL]], [LATER.map((i) => TODAY + 10 * (i - 1) + 3), 0]);
    r.eq('no gate is pushed', LATER.map((i) => pushOf(r, dg(i))), ['', '', '', '']);
    r.eq('SG1 keeps its 3 days, and says the plan took them in', whenOf(r, dg(1)).slice(1), ['Finished 3 days late', 'The revised plan takes this into account']);
    r.expect('Revised plan active since ' + md(TODAY) + '. Delays before it are part of the plan; only new slips count.');
    r.expect('4 gates re-committed. Enacted ' + md(TODAY) + ', now on schedule.');
    r.ok(!r.has('Build revised plan', { within: 'gates-panel' }), 'with a plan active, its banner revises it instead');
    tenDaysOn(r, (d) => { d.catchupPlans.find((p) => p.objectiveId === DRILL).enactedDay -= 12; });
    c = drillCasc(r);
    r.eq('SG2 two days past its re-committed date pushes SG3 to SG5 (until October 20 they ignored it)', [3, 4, 5].map((i) => c.gateEffective[dg(i)]), [TODAY + 25, TODAY + 35, TODAY + 45]);
    r.eq('…and is named as the cause', pushOf(r, dg(3)), 'Pushed 2 days by ' + L(2));
    r.eq('the card: 2 days behind', schedOf(r), 'Planned ' + md(TODAY + 60) + ', 2 days behind schedule');
    r.click('Overview', { within: 'Objective sections' });
    r.expect('The revised plan of ' + md(TODAY - 12) + ' takes this delay into account.');
    r.clean('Sales revision takes the delay in');
  });

  s.step('Sales gate basics: add, duplicate without a picker, mark complete, only workstream', () => {
    const r = new Sim(FILE);
    gotoGates(r);
    r.click('Add gate', { within: wsKey(W) });
    r.type('Name', 'Site walk-down complete', ED);
    r.type('Planned date', '2026-11-20', ED);
    r.click('Add gate', ED);
    const g = doc(r).stageGates.find((x) => x.name === 'Site walk-down complete');
    r.eq('added', [g.id, g.setId], ['SG-BD-2026Q4-01-3', W]);
    menuOf(r, g.id);
    r.click('Duplicate gate', { within: gk(g.id) });
    r.ok(doc(r).stageGates.some((x) => x.name === 'Site walk-down complete (copy)'), 'duplicated directly (one workstream)');
    hadToast(r, 'Gate duplicated.');
    r.click('Mark complete', { within: gk(g.id) });
    r.click('Mark complete', ED);
    r.eq('manual pass today', [g.actualDate, g.completionMethod], [TODAY, 'manual']);
    r.click('Actions for workstream Pilot readiness', { within: wsKey(W) });
    r.click('Delete workstream', { within: wsKey(W) });
    r.expect('Pilot readiness is the only workstream and holds 4 stage-gates.');
    r.click('Cancel', ED);
    r.ok(r.has('Pilot readiness'), 'kept');
    r.clean('sales basics');
  });
  s.step('Sales: Clear plan (type CLEAR) removes the tracking, the dates stay', () => {
    const r = new Sim(FILE);
    gotoGates(r);
    r.click('Clear plan', { within: 'gates-panel' });
    r.type('Type CLEAR to confirm', 'CLEAR');
    r.click('Clear plan', { within: 'Clear the revised plan?' });
    r.eq('cleared', [RD.activeCatchupPlan(doc(r).catchupPlans, BD1), gate(r, 'SG-BD-2026Q4-01-2').plannedDate], [null, day('2026-11-06')]);
    hadToast(r, 'Revised plan cleared.');
    r.ok(!r.has('Re-committed'), 'tags gone');
  });
  s.step('Sales search', () => {
    const r = new Sim(FILE);
    r.eq('hit', search(r, 'term sheet').map((h) => h.label), ['SG-A1 Standard pilot term sheet approved']);
  });
  return s;
}

/* ======================================================================== both apps
   The same sheets and rules on the default objective of either app (Execution: Qualify the 10-cell
   short stack; Sales: Close three utility pilot agreements), so every path runs in both builds. */
function commonScenarios() {
  const s = new Sim(FILE);
  const objId = s.c.ctx.objId;
  gotoGates(s);
  const setsOf = () => doc(s).stageGateSets.filter((x) => x.objectiveId === objId).sort((a, b) => a.order - b.order);
  const byName = (n) => doc(s).stageGates.find((x) => x.objectiveId === objId && x.name === n);
  const nSets0 = setsOf().length;
  let w = null, g = null;
  s.step('[both] workstream sheet: close, cancel, create with Enter; independent sticks', () => {
    s.click('Add workstream', { within: 'gates-panel' });
    s.click('Close', ED);
    s.click('Add workstream', { within: 'gates-panel' });
    s.click('Cancel', ED);
    s.eq('nothing created', setsOf().length, nSets0);
    s.click('Add workstream', { within: 'gates-panel' });
    s.type('Name', 'Permitting', ED);
    s.check('~Independent', true, ED);
    s.check('~Chained', true, ED);
    s.check('~Independent', true, ED);
    s.key('Name', 'Enter', ED);
    w = setsOf().find((x) => x.name === 'Permitting');
    s.eq('created, independent, last', w && [w.chained, w.order, w.id.indexOf('SGSET-') === 0], [false, nSets0, true]);
    hadToast(s, 'Workstream added.');
  });
  s.step('[both] an empty workstream invites a gate; targets via the KPI module; the toggle', () => {
    s.expect('No gates in this workstream yet.');
    s.click('Add gate', { within: wsKey(w.id) });
    s.type('Name', 'Permit filed', ED);
    s.type('Planned date', '2026-11-02', ED);
    s.click('Add gate', ED);
    g = byName('Permit filed');
    s.eq('gate in Permitting', g && g.setId, w.id);
    s.click('Add a target', { within: gk(g.id) });
    s.type('Name', 'Permits filed', ED);
    s.type('Target', '1', ED);
    s.click('Save target', ED);
    s.eq('KPI on the gate', doc(s).kpis.filter((k) => k.hostType === 'stageGate' && k.hostId === g.id).map((k) => [k.name, k.target, k.direction]), [['Permits filed', 1, 'up']]);
    s.eq('toggle text', rowOf(s, g.id).metText, '0 of 1 met');
    s.click('~Targets', { within: gk(g.id) });
    s.ok(s.has('Permits filed', { within: gk(g.id) }), 'table open');
    s.click('~Targets', { within: gk(g.id) });
    s.clean('[both] targets');
  });
  s.step('[both] gate sheet: status, Save; the sheet close button', () => {
    s.click('Permit filed', { within: wsKey(w.id) });
    s.eq('editor', top(s).kind, 'gates.edit');
    s.click('In progress', { within: 'Status' });
    s.click('Save gate', ED);
    s.eq('status stored', g.status, 'active');
    s.eq('shown honestly', rowOf(s, g.id).stWord, 'In progress');
    s.click('Permit filed', { within: wsKey(w.id) });
    s.click('Close', ED);
    s.eq('closed', s.c.sheet(), null);
  });
  s.step('[both] mark complete and completion: close, cancel, save, stacked view, un-complete', () => {
    s.click('Mark complete', { within: gk(g.id) });
    s.click('Close', ED);
    s.click('Mark complete', { within: gk(g.id) });
    s.click('Cancel', ED);
    s.eq('not passed', g.actualDate, null);
    s.click('Mark complete', { within: gk(g.id) });
    s.type('Completed date', '2026-10-12', ED);
    s.click('Mark complete', ED);
    s.eq('passed by hand', [g.actualDate, g.completionMethod], [day('2026-10-12'), 'manual']);
    s.click('Passed Oct 12', { within: gk(g.id) });
    s.click('Close', ED);
    s.click('Passed Oct 12', { within: gk(g.id) });
    s.click('Cancel', ED);
    s.click('Passed Oct 12', { within: gk(g.id) });
    s.type('~Justification', 'Filed with the county on Oct 12.', ED);
    s.click('Save', ED);
    s.eq('justification', g.overrideJustification, 'Filed with the county on Oct 12.');
    s.click('Permit filed', { within: wsKey(w.id) });
    s.click('View completion', ED);
    s.click('Back', ED);
    s.click('View completion', ED);
    s.click('Un-complete gate', ED);
    s.eq('un-completed, back on the editor', [g.actualDate, top(s).kind], [null, 'gates.edit']);
    s.click('Cancel', ED);
    s.clean('[both] completion');
  });
  s.step('[both] predecessors and baseline from the gate sheet', () => {
    s.click('Permit filed', { within: wsKey(w.id) });
    const first = s.vals.gates.shEdit.predOpts[1];
    s.type('Add a predecessor', first.v, ED);
    s.type('Lag (days)', '2', ED);
    s.click('Add predecessor', ED);
    s.ok(doc(s).stageGateEdges.some((e) => e.fromGate === first.v && e.toGate === g.id && e.lagDays === 2), 'edge');
    s.click('Remove predecessor ' + labelNow(s, first.v), ED);
    s.ok(!doc(s).stageGateEdges.some((e) => e.toGate === g.id), 'removed');
    s.click('Commit baseline', ED);
    s.eq('committed', [g.baselineDate, g.locked], [day('2026-11-02'), true]);
    s.click('Release', ED);
    s.eq('released', [g.baselineDate, g.locked], [null, false]);
    s.click('Cancel', ED);
  });
  s.step('[both] duplicate: close, cancel, then into another workstream', () => {
    menuOf(s, g.id);
    s.click('Duplicate gate', { within: 'Actions for ' + labelNow(s, g.id) });
    s.eq('dup sheet (two or more workstreams)', top(s).kind, 'gates.dup');
    s.click('Close', ED);
    menuOf(s, g.id);
    s.click('Duplicate gate', { within: 'Actions for ' + labelNow(s, g.id) });
    s.click('Cancel', ED);
    s.click('Permit filed', { within: wsKey(w.id) });
    s.click('Duplicate', ED);
    s.type('Workstream', setsOf()[0].id, ED);
    s.click('Duplicate gate', ED);
    const c = byName('Permit filed (copy)');
    s.eq('copy in the first workstream', c && c.setId, setsOf()[0].id);
    hadToast(s, 'Gate duplicated into ' + setsOf()[0].name + '.');
  });
  s.step('[both] inline rename and the chain toggle', () => {
    s.click('Rename workstream', { within: wsKey(w.id) });
    s.type('Workstream name', 'Permits', { within: wsKey(w.id) });
    s.key('Workstream name', 'Enter', { within: wsKey(w.id) });
    s.eq('renamed', w.name, 'Permits');
    s.click('~Independent', { within: wsKey(w.id) });
    s.eq('chained', w.chained, true);
    hadToast(s, 'Workstream chained: a gate finishing late pushes the next one.');
    s.click('~Chained', { within: wsKey(w.id) });
    s.eq('independent', w.chained, false);
  });
  s.step('[both] delete workstream with gates and another to move to: every choice path', () => {
    s.click('Actions for workstream Permits', { within: wsKey(w.id) });
    s.click('Delete workstream', { within: wsKey(w.id) });
    s.eq('move is the default', top(s).d.choice, 'move');
    s.check('~Delete it with the workstream', true, ED);
    s.eq('delete picked', top(s).d.choice, 'delete');
    s.check('Move it to', true, ED);
    s.type('Workstream to move the gates to', setsOf()[0].id, ED);
    s.click('Close', ED);
    s.click('Actions for workstream Permits', { within: wsKey(w.id) });
    s.click('Delete workstream', { within: wsKey(w.id) });
    s.click('Cancel', ED);
    s.click('Actions for workstream Permits', { within: wsKey(w.id) });
    s.click('Edit workstream', { within: wsKey(w.id) });
    s.click('Delete workstream', ED);
    s.click('Back', ED);
    s.click('Delete workstream', ED);
    s.click('Continue', ED);
    s.ok(!setsOf().some((x) => x.id === w.id), 'gone');
    s.eq('its gate moved to the first workstream', g.setId, setsOf()[0].id);
    hadToast(s, 'Workstream deleted, 1 gate moved.');
  });
  s.step('[both] delete a gate from its sheet', () => {
    s.click('Permit filed', { within: wsKey(setsOf()[0].id) });
    s.click('Delete gate', ED);
    s.click('Delete gate', { within: 'Delete this gate?' });
    s.ok(!byName('Permit filed'), 'gone');
    s.eq('its KPI gone', doc(s).kpis.filter((k) => k.hostId === g.id).length, 0);
    hadToast(s, 'Gate deleted.');
    s.clean('[both] delete gate');
  });
  s.step('[both] every gate-sheet field, add-and-link, menu rename with blur, row-menu delete', () => {
    if (setsOf().length < 2) {
      s.click('Add workstream', { within: 'gates-panel' });
      s.type('Name', 'Interconnection', ED);
      s.click('Create workstream', ED);
    }
    s.click('Add gate', { within: 'gates-panel', nth: 0 });
    s.type('Name', 'Utility walk-through', ED);
    s.type('Intention', 'Walk the site with the utility engineer.', ED);
    s.type('~Gate id', 'WALK', ED);
    s.type('Workstream', setsOf()[0].id, ED);
    s.type('Planned date', '2026-11-10', ED);
    s.type('Passed date', '2026-10-10', ED);
    s.click('Add and link a KPI', ED);
    const n = byName('Utility walk-through');
    s.eq('saved with every field', n && [n.intention, n.gate_id, n.setId, n.plannedDate, n.actualDate], ['Walk the site with the utility engineer.', 'WALK', setsOf()[0].id, day('2026-11-10'), day('2026-10-10')]);
    s.eq('link sheet next', top(s) && top(s).kind, 'kpi.link');
    s.c.closeAllSheets(); s.render();
    s.click('Mark complete', { within: gk(setsOf().length ? doc(s).stageGates.find((x) => x.objectiveId === objId && x.actualDate == null).id : '') });
    s.type('~Override justification', 'Agreed on the phone.', ED);
    s.click('Cancel', ED);
    s.click('Passed Oct 10', { within: gk(n.id) });
    s.type('Passed date', '2026-10-09', ED);
    s.click('Save', ED);
    s.eq('date edited in the completion sheet', n.actualDate, day('2026-10-09'));
    const first = setsOf()[0];
    s.click('Rename workstream', { within: wsKey(first.id) });
    s.type('Workstream name', first.name + ' track', { within: wsKey(first.id) });
    fireOn(s, s.find('Workstream name', { within: wsKey(first.id), handler: 'onBlur' }), 'onBlur');
    s.eq('blur saved the rename', first.name.slice(-6), ' track');
    s.click('Actions for workstream ' + first.name, { within: wsKey(first.id) });
    s.click('Edit workstream', { within: wsKey(first.id) });
    s.type('Name', first.name.replace(/ track$/, ''), ED);
    s.click('Save workstream', ED);
    s.eq('saved from the sheet', / track$/.test(first.name), false);
    menuOf(s, n.id);
    s.click('Delete gate', { within: 'Actions for ' + labelNow(s, n.id) });
    s.click('Delete gate', { within: 'Delete this gate?' });
    s.ok(!byName('Utility walk-through'), 'deleted from the row menu');
    s.clean('[both] fields');
  });
  s.step('[both] the only workstream holding gates: keep or delete', () => {
    while (setsOf().length > 1) {
      const last = setsOf()[setsOf().length - 1];
      s.click('Actions for workstream ' + last.name, { within: wsKey(last.id) });
      s.click('Delete workstream', { within: wsKey(last.id) });
      if (s.c.state.dlg) s.click('Delete workstream', { within: 'Delete workstream?' });
      else s.click('Continue', ED);
    }
    const only = setsOf()[0];
    const n = doc(s).stageGates.filter((x) => x.objectiveId === objId).length;
    s.click('Actions for workstream ' + only.name, { within: wsKey(only.id) });
    s.click('Delete workstream', { within: wsKey(only.id) });
    s.eq('keep is the default', top(s).d.choice, 'keep');
    s.expect(only.name + ' is the only workstream and holds ' + n + ' stage-gates.');
    s.check('~Delete the workstream and its ' + n + ' stage-gates', true, ED);
    s.eq('delete picked', s.vals.gates.shWsDel.goLabel, 'Continue');
    s.check('~Keep everything', true, ED);
    s.click('Keep everything', ED);
    s.eq('all kept', [setsOf().length, doc(s).stageGates.filter((x) => x.objectiveId === objId).length], [1, n]);
  });
  s.step('[both] read-only completion view and close', () => {
    s.c.setState({ ro: true }); s.render();
    const passed = (s.vals.gates.tab.sets[0].gates.find((x) => x.isPassed) || {});
    s.click(passed.passedText, { within: gk(passed.id) });
    s.eq('read-only', s.vals.gates.shComp.ro, true);
    s.click('Close', { within: 'Editor', nth: 1 });
    s.click(passed.name, { within: gk(passed.id) });
    s.click('Close', { within: 'Editor', nth: 1 });
    s.eq('closed', s.c.sheet(), null);
    s.c.setState({ ro: false }); s.render();
  });
  return s;
}

const S = SALES ? salesScenarios() : execScenarios();
const S2 = commonScenarios();

/* ---- handler sites in mods/gates/*.html never fired by these scenarios ---- */
(function coverage() {
  const parsed = S.parsed;
  const sites = [];
  (function walk(n) {
    if (n.attrs) Object.keys(n.attrs).forEach((k) => {
      if (!k.startsWith('on')) return;
      const hit = parsed.srcmap && parsed.srcmap[n.line];
      if (hit && /^mods\/gates\//.test(hit[0])) {
        const txt = (n.kids || []).filter((x) => x.tag === '#text').map((x) => x.text.trim()).join(' ').slice(0, 40);
        sites.push({ key: k.toLowerCase() + '@' + n.line, what: k + ' <' + n.tag + '> ' + (n.attrs['aria-label'] || n.attrs.title || txt || n.attrs[k]) });
      }
    });
    (n.kids || []).forEach(walk);
  })(parsed.tree);
  const missed = sites.filter((x) => !fired.has(x.key));
  console.log('gates handler sites fired by the scenarios: ' + (sites.length - missed.length) + ' of ' + sites.length + (missed.length ? '\n  not fired: ' + missed.map((x) => x.what).join('\n  not fired: ') : ''));
})();
done();
