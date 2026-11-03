/* Scenario tests for the Execution / Sales shell (apps/exec/*).
     node test/sc_shell.js out/xshell/Main.dc.html
     node test/sc_shell.js out/xshell/Sales-A.dc.html
   Clicks and types like a person, then checks what is on screen, the data (s.c.D) and the numbers
   against the engine (a separate copy of the engine loaded here, see engine_path.js). */
const fs = require('fs');
const path = require('path');
const { Sim, done, textOf } = require('./dc');

const file = process.argv[2] || 'out/xshell/Main.dc.html';
const RD = (function () { const module = { exports: {} }; eval(fs.readFileSync(require('./engine_path'), 'utf8')); return module.exports; })();

let s = new Sim(file);
const SALES = s.c.APP === 'sales';
const KIND_WORD = SALES ? 'business' : 'R&D';
const DEF_DIV = SALES ? 'DIV-BD' : 'DIV-EL';
const DEF_DIV_NAME = SALES ? 'Business Development' : 'Electrolyzer';
const DEF_OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01';
const UNIT = SALES ? 'Business' : 'Technical';
const PICKER = SALES ? 'Choose a business division' : 'Choose an R&D division';
/* the load toast: Sales opens on All divisions (decided October 16), Execution on its division */
const LOADED = SALES ? 'Loaded all business divisions.' : 'Loaded ' + DEF_DIV_NAME + '.';
const today = s.c.D.today;

const BAND_WORD = { 'on-track': 'On track', 'at-risk': 'At risk', 'off-track': 'Off track', 'no-band': 'No score yet' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d) => { const t = new Date(Date.UTC(2020, 0, 1) + d * 86400000); const sameYear = t.getUTCFullYear() === 2026; return MON[t.getUTCMonth()] + ' ' + t.getUTCDate() + (sameYear ? '' : ', ' + t.getUTCFullYear()); };
const toasts = () => (s.c.state.toasts || []).map((t) => t.text);
const hasToast = (t) => toasts().some((x) => x === t);
const doc = () => s.c.D.docs[s.c.ctx.docKey];
const text = (q, opts) => textOf(s.find(q, opts));
const fresh = () => { s = new Sim(file); return s; };
const openSettings = () => { s.click('Settings'); return s; };
const closeSheets = () => { s.c.closeAllSheets(); s.render(); return s; };
const fact = (k) => s.vals.sh.head.facts.find((f) => f.k === 'fact-' + k);
const pickDivision = (name) => { s.click(PICKER); s.click('~' + name, { within: 'Divisions' }); return s; };
const pickObjective = (statement) => { s.click('~' + statement, { within: 'Objectives' }); return s; };
const sheetKind = () => (s.c.sheet() ? s.c.sheet().kind : '');
function openLink() { openSettings(); s.click('Open a link'); return s; }
function link(p) {
  openLink();
  s.click('Clear all', { within: 'Parameters' });
  if (p.division != null) s.type('~Division', p.division, { within: 'Parameters' });
  if (p.quarter != null) s.type('~Quarter', p.quarter, { within: 'Parameters' });
  if (p.product != null) s.type('~Product', p.product, { within: 'Parameters' });
  if (p.objective != null) s.type('~Objective', p.objective, { within: 'Parameters' });
  if (p.owner != null) s.type('~Owner', p.owner, { within: 'Parameters' });
  if (p.token != null) s.type('~Token', p.token, { within: 'Parameters' });
  if (p.readonly) s.check('~Read-only', true, { within: 'Parameters' });
  return s;
}
function openLinkNow(p) { link(p); s.click('Open this link'); s.flush(400); return s; }

/* ------------------------------------------------------------------------ 1. first render */
s.step('first render', () => {
  s.clean('initial render');
  s.eq('division', s.c.ctx.divId, DEF_DIV);
  s.eq('objective', s.c.ctx.objId, DEF_OBJ);
  s.eq('breadcrumb', text('Breadcrumb'), UNIT + ' / ' + DEF_DIV_NAME + ' / Q4 2026');
  s.eq('Calm starts light until a theme is chosen (so the four boards match)', s.c.state.theme, 'light');
  s.eq('system theme resolves (stub: light)', s.vals.theme, 'light');
  s.eq('tab', s.c.state.tab, 'overview');
  s.expect('Saved just now');
  s.ok(s.has('Save', { tag: 'button' }), 'Save button shown');
  s.ok(!s.has('Read-only'), 'no read-only pill');
  s.eq('home link goes to the hub', s.find('Back to all apps (the Celadyne hub)').attrs.href, 'https://celadynestaller.github.io/CeladyneHQ/');
  s.eq('ctx additions', [typeof s.c.ctx.casc, s.c.ctx.loaded, s.c.ctx.hub, s.c.ctx.offline, s.c.ctx.unit && s.c.ctx.unit.name], ['function', true, true, false, UNIT]);
  s.eq('ctx.f', s.c.ctx.f, { quarter: '', product: '', owner: '' });
  s.eq('Sales opens on All divisions; Execution on one division', [s.c.state.divAll, s.c.ctx.all, s.vals.sh.pickName], SALES ? [true, true, 'All divisions'] : [false, false, DEF_DIV_NAME]);
});

/* ------------------------------------------------------------------------ 2. head numbers vs engine */
function headNumbers(label) {
  const ctx = s.c.ctx, o = ctx.obj, em = ctx.em, td = ctx.today, d = ctx.doc, P = ctx.P;
  const sc = RD.objectiveScore(o.id, em);
  const opc = RD.objectivePartialCount(o.id, em);
  const raw = opc ? RD.objectiveScore(o.id, em, true) : null;
  const krs = d.keyResults.filter((r) => r.objectiveId === o.id);
  const krOn = krs.filter((k) => RD.band(RD.keyResultScore(k.id, em)) === 'on-track').length;
  const gates = d.stageGates.filter((g) => g.objectiveId === o.id);
  const st = gates.map((g) => RD.classifyGate(g, td));
  const pass = st.filter((x) => x === 'passed' || x === 'passed-late').length, over = st.filter((x) => x === 'overdue').length;
  const gh = RD.objectiveGateReadiness(o.id, em, td);
  const casc = RD.cascade(P, em, td);
  const roll = RD.fmeaRollup(RD.fmeaProblemsFor(d, o.id), (gid) => { const g = d.stageGates.find((x) => x.id === gid); const c = g ? RD.classifyGate(g, td) : ''; return c === 'passed' || c === 'passed-late'; });
  const h = s.vals.sh.head;
  s.eq(label + ': score', h.score.big, sc == null ? '—' : String(Math.round(sc)));
  s.eq(label + ': partial without discount', h.score.partial ? h.score.partialText : '', opc && raw != null ? 'Partial check-in, ' + Math.round(raw) + ' without discount' : '');
  s.eq(label + ': KR fact', [fact('krs').value, fact('krs').detail], [String(krs.length), krOn + ' on track' + (opc ? ', ' + opc + ' partial' : '')]);
  s.eq(label + ': gates fact', [fact('gates').value, fact('gates').detail], [String(gates.length), pass + ' passed, ' + over + ' overdue']);
  s.eq(label + ': gate health', fact('health').value, gh == null ? '—' : Math.round(gh) + '%');
  s.eq(label + ': open high risk', [fact('risk').value, fact('risk').detail], [String(roll.openHigh), roll.total ? roll.total + ' problem' + (roll.total === 1 ? '' : 's') + ', worst RPN ' + roll.worst : 'No FMEA items']);
  const slip = casc.objectiveScheduleSlip[o.id];
  const end = RD.objectiveEndState(d.objectiveState, o.id);
  if (!end && slip != null) s.ok(slip > 0 ? fact('schedule').detail.indexOf(slip + ' day') >= 0 : /on schedule/.test(fact('schedule').detail), label + ': schedule slip ' + slip + ' shown: ' + fact('schedule').detail);
  s.eq(label + ': alarm when slip > 10', !!h.alarm, !end && slip != null && slip > 10);
  const accel = casc.objectiveAcceleration[o.id] || 0;
  s.eq(label + ': acceleration', fact('schedule').extra, !end && accel > 0 ? accel + ' day' + (accel === 1 ? '' : 's') + ' of acceleration possible' : '');
  /* no "Key-result signal" bars in the head since October 15: the Overview's review table lists each key result
     with its tag and score instead (mods/review; sc_review.js checks the rest of that table) */
  s.eq(label + ': no KR signal in the head', [h.signal, h.hasSignal], [undefined, undefined]);
  const rk = s.ns.MODS.review.api.items(s.c, s.c.ctx).filter((it) => it.type === 'kr');
  s.eq(label + ': review rows, one per KR (tag and score)', rk.map((it) => it.row.tid + ' ' + it.row.barVal), krs.map((k, i) => { const v = RD.keyResultScore(k.id, em); return (k.trackingType === 'milestone' ? 'KR-M' + krs.slice(0, i + 1).filter((r) => r.trackingType === 'milestone').length : 'KR' + (i + 1)) + ' ' + (v == null ? '—' : Math.round(v) + '%'); }));
  return { sc, slip, accel };
}
s.step('head numbers (default objective)', () => {
  fresh();
  headNumbers('default');
  s.expect('Week 2 of 13');
  s.expect('Oct 1 to Dec 31');
  s.expect('Today, 15% of the time used');
  s.expect('Oct 1 to Dec 18');
  s.expect(SALES ? 'Sam Rivera' : 'Toru Hayashi');
  s.expect(UNIT + ' unit');
  s.expect(SALES ? 'Utility pilot program' : 'Tera component lock');
  s.expectNot('Key-result signal');
  /* the Overview: the review table, then Latest readings, Current step and Initiative metrics side by side
     (Sales: no Current step since November 3, when its Experiments tab went) */
  s.expect('Review');
  const three = s.all((el) => el.attrs && el.attrs.class === 'ov-three')[0];
  s.eq('the panels under the review', three ? three.kids.filter((k) => k.attrs && k.attrs['data-k']).map((k) => k.attrs['data-k']) : null, SALES ? ['kpi-latest', 'initm'] : ['kpi-latest', 'ov-step', 'initm']);
  if (SALES) s.eq('Sales: no Current step card, nothing about experiments', [s.has('Current step'), s.has('Open experiments'), s.has('~Experiments tab')], [false, false, false]);
  ['Open key results', 'Open stage-gates', 'Open high risks', 'Review risks'].forEach((t) => s.ok(!s.has(t), 'the old Overview cards are gone: ' + t));
  const cells = s.all((el) => el.attrs.class && /^shl-qc/.test(el.attrs.class));
  s.eq('13 week cells', cells.length, 13);
  s.eq('week 1 done, week 2 now', cells.slice(0, 3).map((c) => c.attrs.class), ['shl-qc done', 'shl-qc now', 'shl-qc']);
  {
    const ctx = s.c.ctx, em = ctx.em, o = ctx.obj;
    const sc = RD.objectiveScore(o.id, em);
    s.eq('band word', s.vals.sh.head.score.word, BAND_WORD[RD.band(sc)]);
    const gh = RD.objectiveGateReadiness(o.id, em, today);
    const sets = ctx.doc.stageGateSets.filter((x) => x.objectiveId === o.id).length;
    if (gh != null) s.eq('gate health detail', fact('health').detail, BAND_WORD[RD.band(gh)] + ', ' + (sets === 1 ? '1 workstream' : 'weakest of ' + sets + ' workstreams'));
    const casc = RD.cascade(ctx.P, em, today);
    const slip = casc.objectiveScheduleSlip[o.id];
    s.eq('schedule value', fact('schedule').value, day(casc.objectiveWorkForecast[o.id]));
    s.eq('schedule detail', fact('schedule').detail, 'Planned ' + day(o.plannedEnd) + ', ' + (slip > 0 ? slip + ' day' + (slip === 1 ? '' : 's') + ' behind schedule' : 'on schedule'));
  }
  s.clean('head');
});
s.step('head numbers across every objective', () => {
  fresh();
  s.c.ctx.divs.forEach((d) => {
    s.c.setState({ divId: d.id, divAll: false, objId: '' }); s.render();
    s.c.ctx.allObjs.forEach((o) => { s.c.setState({ objId: o.id }); s.render(); headNumbers(o.id); s.clean(o.id); });
  });
});

/* ------------------------------------------------------------------------ 3. division picker */
s.step('division picker', () => {
  fresh();
  s.click(PICKER);
  s.ok(s.vals.sh.divOpen, 'menu open');
  s.ok(s.has(UNIT, { within: 'Divisions' }), 'unit group heading');
  s.ok(s.has(DEF_DIV_NAME + ' ' + DEF_DIV, { within: 'Divisions' }), 'name and ID in the menu');
  if (SALES) {
    s.ok(s.has('Partnerships DIV-PT', { within: 'Divisions' }), 'second business division listed');
    s.ok(!s.has('~Electrolyzer', { within: 'Divisions' }), 'R&D divisions not listed in Sales');
    const items = s.all((el) => el.attrs.role === 'menuitemradio');
    s.eq('All divisions heads the menu, checked', [textOf(items[0]).trim(), items[0].attrs['aria-checked']], ['All divisions', true]);
    s.eq('no single division checked', items.slice(1).map((el) => el.attrs['aria-checked']), [false, false]);
  } else {
    s.ok(!s.has('All divisions', { within: 'Divisions' }), 'Execution has no All divisions');
    s.ok(s.has('Fuel Cell DIV-FC', { within: 'Divisions' }), 'Fuel Cell listed');
    s.ok(!s.has('~Business Development', { within: 'Divisions' }), 'business divisions not listed in Execution');
    s.ok(!s.has('~Partnerships', { within: 'Divisions' }), 'Partnerships not listed in Execution');
  }
  s.click('Close menu');
  s.ok(!s.vals.sh.divOpen, 'scrim closes the menu');
  const other = SALES ? 'Partnerships' : 'Fuel Cell';
  const otherId = SALES ? 'DIV-PT' : 'DIV-FC';
  s.c.setState({ tab: 'krs' }); s.render();
  pickDivision(other);
  s.eq('switched', s.c.ctx.divId, otherId);
  s.ok(hasToast('Switched to ' + other + '.'), 'toast Switched to');
  s.eq('tab back to overview', s.c.state.tab, 'overview');
  s.eq('first objective selected', s.c.ctx.objId, s.c.ctx.objs[0] ? s.c.ctx.objs[0].id : '');
  if (SALES) {
    s.expect('No objectives assigned to this division yet. Create them in the Planning app.');
    s.ok(s.has('Open Planning'), 'planning link in the empty state');
    s.ok(s.has('No objectives in this division yet.', { within: 'Objectives' }), 'sidebar empty state');
  }
  pickDivision(DEF_DIV_NAME);
  s.eq('back', s.c.ctx.divId, DEF_DIV);
  if (SALES) {
    s.eq('one division: checked in the menu, named on the picker', [s.vals.sh.divMenu[0].divs[0].on, s.vals.sh.allItem.on, s.vals.sh.pickName, s.c.state.divAll], [true, false, DEF_DIV_NAME, false]);
  }
  // choosing the current division again is a no-op
  s.click(PICKER); s.click('~' + DEF_DIV_NAME, { within: 'Divisions' });
  s.ok(!s.vals.sh.divOpen, 'menu closed after picking the same division');
  // an "Unassigned" group for divisions without a unit
  s.c.D.portfolio.divisions.push({ id: 'DIV-HS', name: 'Hydrogen Storage', kind: SALES ? 'biz' : 'rd', unitId: null, order: 9 });
  s.render();
  s.click(PICKER);
  s.ok(s.has('Unassigned', { within: 'Divisions' }), 'Unassigned group');
  s.click('~Hydrogen Storage', { within: 'Divisions' });
  s.eq('switched to the unassigned division', s.c.ctx.divId, 'DIV-HS');
  s.eq('breadcrumb without a unit', text('Breadcrumb'), 'Hydrogen Storage');
  s.expect('No objectives assigned to this division yet. Create them in the Planning app.');
  s.clean('unassigned division');
});
s.step('wrong-kind division refused', () => {
  fresh();
  openLinkNow({ division: SALES ? 'DIV-EL' : 'DIV-BD' });
  s.ok(hasToast('That division isn\'t a ' + KIND_WORD + ' division for this app.'), 'refused with today\'s message');
  s.eq('fell back to the first ' + KIND_WORD + ' division (Sales: All divisions)', [s.c.ctx.divId, s.c.state.divAll], [s.c.ctx.divs[0].id, SALES]);
  s.ok(hasToast(SALES ? 'Loaded all business divisions.' : 'Loaded ' + s.c.ctx.div.name + '.'), 'Loaded toast');
});

/* ------------------------------------------------------------------------ 4. objective list */
s.step('objective list grouped by quarter', () => {
  fresh();
  if (!SALES) {
    pickDivision('Fuel Cell');
    s.eq('groups', s.vals.sh.objGroups.map((g) => g.label), ['Q3 2026', 'Q4 2026', 'Q1 2027']);
    s.eq('right column', s.vals.sh.objGroups.map((g) => g.objs.map((o) => o.right)), [['Achieved'], ['79', '45', '26'], ['Not started']]);
    s.eq('dots', s.vals.sh.objGroups[1].objs.map((o) => o.dotCls), ['dot t-warn', 'dot t-bad', 'dot t-bad']);
    pickObjective('Root-cause AST degradation');
    s.eq('picked', s.c.ctx.objId, 'OBJ-FC-2026Q4-02');
    s.eq('crumb', text('Breadcrumb'), 'Technical / Fuel Cell / Q4 2026');
    s.expect('Maya Okafor');
  } else {
    pickDivision(DEF_DIV_NAME);   // one division (All divisions: its own step below)
    s.eq('groups', s.vals.sh.objGroups.map((g) => g.label), ['Q4 2026', 'Q1 2027']);
    s.eq('right column', s.vals.sh.objGroups.map((g) => g.objs.map((o) => o.right)), [['57'], ['Not started']]);
    pickObjective('Build the Q1 hydrogen-hub pipeline');
    s.eq('picked', s.c.ctx.objId, 'OBJ-BD-2027Q1-01');
    s.expect('Upcoming');
    s.ok(!s.has('Key-result signal'), 'no signal bars in the head');
    s.expect('No key results yet. Without one the objective has no score.');
  }
  s.clean('objective list');
});

/* ------------------------------------------------------------------------ 4b. Sales: All divisions */
if (SALES) {
  const groups = () => s.vals.sh.objGroups.map((x) => [x.div, x.label, x.objs.map((o) => o.name + ' ' + o.right), x.emptyText]);
  const PT_OBJ = 'OBJ-PT-2026Q4-01';
  /* a Partnerships objective of its own, scored from Partnerships' document (which also holds the hub
     pipeline's stranded data, so a wrong engine map would show) */
  const addPartnerObjective = () => {
    s.c.D.portfolio.objectives.push({ id: PT_OBJ, divisionId: 'DIV-PT', initiativeId: null, quarter: '2026Q4', statement: 'Sign two channel partners', owner: ['ken@celadyne.com'], plannedStart: today - 12, plannedEnd: today + 66, milestoneIds: [], productId: null, modelId: null, order: 1 });
    s.c.D.docs['BIZ-DIV-PT'].keyResults.push({ id: 'KR-PT-2026Q4-01-1', objectiveId: PT_OBJ, statement: 'Sign the first channel partner', trackingType: 'percentage', progress: 40 });
    s.render();
  };
  s.step('All divisions: every business division\'s objectives, grouped by division', () => {
    fresh();
    s.eq('by division in the picker\'s order, quarter subheadings while every quarter shows, a note for a division with none', groups(), [
      ['Business Development', 'Q4 2026', ['Close three utility pilot agreements 57'], ''],
      ['', 'Q1 2027', ['Build the Q1 hydrogen-hub pipeline Not started'], ''],
      ['Partnerships', '', [], 'No objectives yet.']
    ]);
    s.ok(s.has('Business Development', { within: 'Objectives' }) && s.has('Partnerships', { within: 'Objectives' }), 'division names head the list');
    s.ok(s.has('No objectives yet.', { within: 'Objectives' }), 'Partnerships says it has none');
    s.eq('heading styles', s.vals.sh.objGroups.map((x) => [x.divCls, x.cls]), [['shl-dgrp', 'grp shl-qsub'], ['', 'grp shl-qsub gap'], ['shl-dgrp gap', '']]);
    s.eq('the picker says All divisions; the breadcrumb, the objective\'s division', [s.vals.sh.pickName, text('Breadcrumb')], ['All divisions', UNIT + ' / ' + DEF_DIV_NAME + ' / Q4 2026']);
    s.clean('all divisions');

    addPartnerObjective();
    const P = s.c.D.portfolio;
    const ptScore = RD.objectiveScore(PT_OBJ, RD.withPortfolio(P, { 'DIV-PT': s.c.D.docs['BIZ-DIV-PT'] }));
    const ptRight = String(Math.round(ptScore));
    s.eq('each row scored from its own division\'s document', groups(), [
      ['Business Development', 'Q4 2026', ['Close three utility pilot agreements 57'], ''],
      ['', 'Q1 2027', ['Build the Q1 hydrogen-hub pipeline Not started'], ''],
      ['Partnerships', 'Q4 2026', ['Sign two channel partners ' + ptRight], '']
    ]);
    const n0 = toasts().length;
    pickObjective('Sign two channel partners');
    s.eq('its division comes with it', [s.c.ctx.objId, s.c.ctx.divId, s.c.ctx.docKey, s.c.state.divId, s.c.state.divAll], [PT_OBJ, 'DIV-PT', 'BIZ-DIV-PT', 'DIV-PT', true]);
    s.eq('breadcrumb', text('Breadcrumb'), UNIT + ' / Partnerships / Q4 2026');
    s.eq('no division switch to announce', toasts().slice(n0).filter((t) => /^Switched/.test(t)), []);
    s.expect('Sign the first channel partner');
    headNumbers('Partnerships objective');
    s.eq('the other rows keep their own division\'s numbers', groups()[0][2], ['Close three utility pilot agreements 57']);
    s.ok(s.vals.sh.objGroups[2].objs[0].cls === 'obj on', 'the row on screen is marked');
    s.clean('partnerships objective');

    /* the filters work across every division */
    s.eq('quarter options from every division', s.vals.sh.fq.opts.map((o) => o.label), ['Q4 2026', 'Q1 2027']);
    s.type('Quarter', '2026Q4');
    s.eq('one quarter: no subheadings', groups(), [
      ['Business Development', '', ['Close three utility pilot agreements 57'], ''],
      ['Partnerships', '', ['Sign two channel partners ' + ptRight], '']
    ]);
    s.type('Quarter', '2027Q1');
    s.eq('Partnerships has nothing in Q1 2027', groups(), [
      ['Business Development', '', ['Build the Q1 hydrogen-hub pipeline Not started'], ''],
      ['Partnerships', '', [], 'None in Q1 2027.']
    ]);
    s.eq('the hidden objective gives way to the first listed, with its division', [s.c.ctx.objId, s.c.ctx.divId, s.c.state.divId], ['OBJ-BD-2027Q1-01', 'DIV-BD', 'DIV-BD']);
    s.type('Quarter', '');
    pickObjective('Close three utility pilot agreements');
    s.click('Show only Sam Rivera’s objectives (sam@celadyne.com)');
    s.eq('one owner across every division', s.vals.sh.objGroups.map((x) => [x.div, x.objs.length, x.emptyText]), [['Business Development', 1, ''], ['', 1, ''], ['Partnerships', 0, 'None owned by Sam Rivera.']]);
    s.click('Clear the owner filter');
    /* nothing listed anywhere: the empty state speaks of every division */
    s.c.setState({ fOwner: 'nobody@celadyne.com' }); s.render();
    const who = s.ns.F.name('nobody@celadyne.com');
    s.expect('No objectives in any business division are owned by ' + who + '.');
    s.eq('each division says so; no list-wide note', [groups().map((x) => x[3]), s.vals.sh.noObjs], [['None owned by ' + who + '.', 'None owned by ' + who + '.'], false]);
    s.eq('breadcrumb without an objective', text('Breadcrumb'), 'All divisions');
    s.c.setState({ fOwner: '' }); s.render();
    s.c.D.portfolio.objectives = s.c.D.portfolio.objectives.filter((o) => !/^OBJ-(BD|PT)-/.test(o.id));
    s.render();
    s.expect('No objectives assigned to any business division yet. Create them in the Planning app.');
    s.eq('every division: no objectives yet', groups().map((x) => x[3]), ['No objectives yet.', 'No objectives yet.']);
    s.clean('nothing listed');
  });

  s.step('All divisions: picking a division, and back', () => {
    fresh();
    addPartnerObjective();
    pickObjective('Build the Q1 hydrogen-hub pipeline');
    s.click('Key results', { within: 'Objective sections' });
    pickDivision(DEF_DIV_NAME);
    s.eq('that division alone, with the same objective and tab', [s.c.state.divAll, s.c.ctx.objId, s.c.state.tab, s.vals.sh.pickName], [false, 'OBJ-BD-2027Q1-01', 'krs', DEF_DIV_NAME]);
    s.ok(hasToast('Switched to ' + DEF_DIV_NAME + '.'), 'says so');
    s.eq('one division: quarter groups only', s.vals.sh.objGroups.map((x) => [x.hasDiv, x.label]), [[false, 'Q4 2026'], [false, 'Q1 2027']]);
    s.click(PICKER);
    s.click('All divisions', { within: 'Divisions' });
    s.eq('All divisions again, same objective and tab', [s.c.state.divAll, s.c.ctx.objId, s.c.state.tab, s.vals.sh.pickName], [true, 'OBJ-BD-2027Q1-01', 'krs', 'All divisions']);
    s.ok(hasToast('Switched to all divisions.'), 'says so');
    s.click(PICKER);
    s.click('All divisions', { within: 'Divisions' });
    s.ok(!s.vals.sh.divOpen, 'choosing it again just closes the menu');
    pickDivision('Partnerships');
    s.eq('a division without the objective on screen: its first, on the Overview', [s.c.ctx.objId, s.c.state.tab], [PT_OBJ, 'overview']);
    s.click(PICKER);
    s.click('All divisions', { within: 'Divisions' });
    s.eq('back on All divisions with it', [s.c.state.divAll, s.c.ctx.objId, s.c.ctx.divId], [true, PT_OBJ, 'DIV-PT']);
    /* a search result opens in place */
    const n0 = toasts().length;
    s.type('Search', 'hub');
    s.click('~Build the Q1 hydrogen-hub pipeline', { within: 'Search results' });
    s.eq('All divisions stays; the division follows the objective', [s.c.state.divAll, s.c.ctx.objId, s.c.ctx.divId], [true, 'OBJ-BD-2027Q1-01', 'DIV-BD']);
    s.eq('no switch to announce', toasts().slice(n0).filter((t) => /^Switched/.test(t)), []);
    /* an ended objective in another division reads from its own document */
    s.c.D.docs['BIZ-DIV-PT'].objectiveState.push({ objectiveId: PT_OBJ, status: 'achieved', endedDay: today, note: '' });
    s.render();
    s.eq('Achieved, from Partnerships\' document', groups()[2][2], ['Sign two channel partners Achieved']);
    /* Planning's hand-off names the division on screen */
    s.click('Planning', { within: 'owners' });
    const h = JSON.parse(global.window.sessionStorage.getItem('celadyne-calm-open') || '{}');
    s.eq('hand-off to Planning', [h.objective, h.division], ['OBJ-BD-2027Q1-01', 'DIV-BD']);
    global.window.sessionStorage.removeItem('celadyne-calm-open');
    s.clean('pick and back');
  });

  s.step('All divisions: links', () => {
    fresh();
    addPartnerObjective();
    pickObjective('Sign two channel partners');
    openLink();
    s.eq('the link names no division', s.vals.sh.linkSheet.url, 'sales_app.html?objective=' + PT_OBJ);
    s.click('Open this link');
    s.flush(400);
    s.eq('opens on All divisions at the objective', [s.c.state.divAll, s.c.ctx.objId, s.c.ctx.divId], [true, PT_OBJ, 'DIV-PT']);
    s.ok(hasToast('Loaded all business divisions.'), 'Loaded toast');
    openLinkNow({ division: 'DIV-PT' });
    s.eq('?division= lists that division alone', [s.c.state.divAll, s.c.ctx.divId, s.vals.sh.pickName], [false, 'DIV-PT', 'Partnerships']);
    s.ok(hasToast('Loaded Partnerships.'), 'Loaded toast names it');
    openLinkNow({ objective: PT_OBJ, division: 'DIV-BD' });
    s.eq('?objective= still wins: its division, alone', [s.c.state.divAll, s.c.ctx.divId, s.c.ctx.objId], [false, 'DIV-PT', PT_OBJ]);
    openLinkNow({});
    s.eq('no parameters: All divisions', [s.c.state.divAll, s.c.ctx.objId], [true, DEF_OBJ]);
    openLinkNow({ quarter: '2027Q1' });
    s.eq('?quarter= across every division', [s.c.state.divAll, s.c.ctx.objs.map((o) => o.id)], [true, ['OBJ-BD-2027Q1-01']]);
    openLinkNow({ owner: 'ken@celadyne.com' });
    s.eq('?owner= across every division', [s.c.state.divAll, s.c.ctx.objs.map((o) => o.id), s.c.ctx.divId], [true, [PT_OBJ], 'DIV-PT']);
    s.clean('links');
  });

  s.step('All divisions: Maintenance scans every business division', () => {
    fresh();
    addPartnerObjective();
    /* a key result of the Partnerships objective left in Business Development's document */
    s.c.D.docs['BIZ-DIV-BD'].keyResults.push({ id: 'KR-PT-2026Q4-01-9', objectiveId: PT_OBJ, statement: 'Stranded partner key result', trackingType: 'percentage', progress: 10 });
    s.render();
    openSettings();
    s.expect('If an objective was moved from one business division to another, its key results, KPIs, stage-gates, tasks, boards and logic tree may still live in the old division\'s document. This scans every business division and moves any stranded execution data to the division its objective belongs to now.');
    s.click('Recover stranded execution data');
    s.flush(700);
    s.eq('a row per objective, each naming where it goes', s.vals.sh.settings.recover.rows, [
      { name: 'Build the Q1 hydrogen-hub pipeline', text: '1 key result, 1 KPI, 1 stage-gate and 1 task stranded in Partnerships; it moves to Business Development' },
      { name: 'Sign two channel partners', text: '1 key result stranded in Business Development; it moves to Partnerships' }
    ]);
    const bd = () => s.c.D.docs['BIZ-DIV-BD'], pt = () => s.c.D.docs['BIZ-DIV-PT'];
    const hub0 = RD.objectivePayloadCounts(bd(), 'OBJ-BD-2027Q1-01').keyResults + RD.objectivePayloadCounts(pt(), 'OBJ-BD-2027Q1-01').keyResults;
    s.click('Move it all');
    s.flush(700);
    s.ok(hasToast('2 objectives recovered.'), 'recovered toast');
    s.eq('the hub pipeline\'s data in Business Development only', [RD.objectivePayloadCounts(bd(), 'OBJ-BD-2027Q1-01').keyResults, RD.objectivePayloadCounts(pt(), 'OBJ-BD-2027Q1-01').keyResults], [hub0, 0]);
    s.eq('the partner key result in Partnerships only', [bd().keyResults.some((k) => k.id === 'KR-PT-2026Q4-01-9'), pt().keyResults.some((k) => k.id === 'KR-PT-2026Q4-01-9')], [false, true]);
    s.click('Recover stranded execution data');
    s.flush(700);
    s.expect('No stranded execution data found for any business division’s objectives.');
    /* switching to one division drops a report */
    s.click('Recover stranded execution data');
    s.flush(700);
    closeSheets();
    pickDivision('Partnerships');
    s.eq('report dropped on switch', s.c.state.sh_recover, null);
    openSettings();
    s.expect('This scans the other business divisions and moves any stranded execution data for this division\'s objectives here.');
    s.clean('recover all');
  });
}

/* ------------------------------------------------------------------------ 5. filters */
s.step('quarter and product filters', () => {
  fresh();
  if (!SALES) {
    pickDivision('Fuel Cell');
    s.eq('quarter options', s.vals.sh.fq.opts.map((o) => o.label), ['Q3 2026', 'Q4 2026', 'Q1 2027']);
    s.eq('product options', s.vals.sh.fp.opts.map((o) => o.label), ['HP membrane']);
    s.type('Quarter', '2026Q4');
    s.eq('only Q4', s.c.ctx.objs.map((o) => o.id), ['OBJ-FC-2026Q4-01', 'OBJ-FC-2026Q4-02', 'OBJ-FC-2026Q4-03']);
    s.eq('selection moved off the hidden objective', s.c.ctx.objId, 'OBJ-FC-2026Q4-01');
    pickDivision('Electrolyzer');
    s.eq('quarter kept when the new division has it', s.c.state.fQuarter, '2026Q4');
    pickDivision('Fuel Cell');
    s.type('Quarter', '2026Q3');
    s.eq('Q3 selected', s.c.ctx.objId, 'OBJ-FC-2026Q3-01');
    pickDivision('Electrolyzer');
    s.eq('stale quarter reset to all', s.c.state.fQuarter, '');
    s.type('Product', 'PRD-EL-1');
    s.eq('product filter', s.c.ctx.f.product, 'PRD-EL-1');
    s.eq('Tera stack objectives', s.c.ctx.objs.length, 3);
    pickDivision('Fuel Cell');
    s.eq('stale product reset to all', s.c.state.fProduct, '');
    // a quarter + product combination that hides everything
    s.c.D.portfolio.objectives.find((o) => o.id === 'OBJ-FC-2026Q4-03').productId = 'PRD-EL-1';
    s.render();
    s.eq('two products now', s.vals.sh.fp.opts.map((o) => o.label), ['HP membrane', 'Tera stack']);
    s.type('Quarter', '2027Q1');
    s.type('Product', 'PRD-EL-1');
    s.expect('No objectives match the quarter and product filters.');
    s.ok(s.has('No objectives match these filters.', { within: 'Objectives' }), 'sidebar empty text');
    s.click('Clear filters');
    s.eq('cleared', [s.c.state.fQuarter, s.c.state.fProduct], ['', '']);
    s.type('Quarter', '2026Q3');
    s.eq('a quarter on its own still lists its objective', s.c.ctx.objs.length, 1);
  } else {
    s.eq('product filter kept but disabled when no objective has a product', [s.find('Product').attrs.disabled, s.find('Product').attrs.title], [true, 'No objective here is classified to a product']);
    s.type('Quarter', '2027Q1');
    s.eq('Q1 only', s.c.ctx.objs.map((o) => o.id), ['OBJ-BD-2027Q1-01']);
    s.type('Quarter', '');
    s.eq('all quarters', s.c.ctx.objs.length, 2);
  }
  s.clean('filters');
});

s.step('owner filter from the owners line', () => {
  fresh();
  if (!SALES) pickObjective('Lock Tera 25-30-R5 components');
  const who = SALES ? 'Sam Rivera' : 'Priya Natarajan';
  const email = SALES ? 'sam@celadyne.com' : 'priya@celadyne.com';
  s.click('Show only ' + who + '\u2019s objectives (' + email + ')');
  s.eq('owner filter set', s.c.state.fOwner, email);
  s.eq('their objectives', s.c.ctx.objs.map((o) => o.id), SALES ? ['OBJ-BD-2026Q4-01', 'OBJ-BD-2027Q1-01'] : ['OBJ-EL-2026Q4-02']);
  s.expect('Owner: ' + who);
  s.eq('pressed', s.find('Show everyone\u2019s objectives').attrs['aria-pressed'], true);
  s.click('Show everyone\u2019s objectives');
  s.eq('toggled off', s.c.state.fOwner, '');
  s.click('Show only ' + who + '\u2019s objectives (' + email + ')');
  s.click('Clear the owner filter');
  s.eq('chip clears it', s.c.state.fOwner, '');
  s.clean('owner filter');
});

/* ------------------------------------------------------------------------ 6. search */
s.step('header search', () => {
  fresh();
  const q = SALES ? 'hub' : 'AST';
  const hit = SALES ? 'Build the Q1 hydrogen-hub pipeline' : 'Root-cause AST degradation';
  const hitId = SALES ? 'OBJ-BD-2027Q1-01' : 'OBJ-FC-2026Q4-02';
  s.type('Search', q);
  s.ok(s.vals.sh.search.open, 'results open');
  s.eq('Objectives group first', s.vals.sh.search.groups[0].label, 'Objectives');
  s.ok(s.has('~' + hit, { within: 'Search results' }), 'objective found');
  s.click('~' + hit, { within: 'Search results' });
  s.eq('opened', s.c.ctx.objId, hitId);
  s.eq('query cleared', s.c.state.q, '');
  if (!SALES) s.ok(hasToast('Switched to Fuel Cell.'), 'switched division');
  s.type('Search', 'zzzz');
  s.expect('Nothing matches “zzzz”. Try an objective, key result, gate or KPI name.');
  s.key('Search', 'Escape');
  s.eq('Escape clears', [s.c.state.q, s.vals.sh.search.open], ['', false]);
  s.type('Search', SALES ? 'utility pilot' : 'cost 18');
  s.key('Search', 'Enter');
  s.eq('Enter opens the first result', s.c.ctx.objId, SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2027Q1-01');
  s.type('Search', 'obj-');
  s.ok(s.vals.sh.search.groups[0].items.length <= 6, 'at most six per group');
  s.click('Close menu');
  s.ok(!s.vals.sh.search.open, 'scrim closes the results');
  // a hidden objective is reachable: search clears the filters that hide it
  s.c.setState({ fQuarter: '2027Q1' }); s.render();
  s.type('Search', SALES ? 'three utility' : 'Lock Tera');
  s.click('~' + (SALES ? 'Close three utility' : 'Lock Tera 25-30-R5'), { within: 'Search results' });
  s.eq('filter dropped to show it', s.c.state.fQuarter, '');
  s.eq('selected', s.c.ctx.objId, SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-02');
  // module search providers, grouped by source; one that throws is skipped
  const M = s.c.MODS;
  const keep = { krS: M.kr.search, krL: M.kr.searchLabel, fmS: M.fmea.search };
  M.kr.search = (C, ctx, qq) => (/uniform/i.test(qq) ? [{ label: 'Demonstrate cell-to-cell uniformity', sub: 'Key result in ' + ctx.div.name, go: () => C.setState({ tab: 'krs' }) }, { label: '', go: () => {} }, null] : []);
  delete M.kr.searchLabel;
  M.fmea.search = () => { throw new Error('boom'); };
  s.type('Search', 'uniform');
  const g = s.vals.sh.search.groups.find((x) => x.label === 'Key results');
  s.ok(!!g && g.items.length === 1, 'module results grouped under Key results (bad rows dropped)');
  s.click('~Demonstrate cell-to-cell uniformity', { within: 'Search results' });
  s.eq('module go() ran', s.c.state.tab, 'krs');
  s.eq('query cleared before go()', s.c.state.q, '');
  s.clean('search with providers');
  if (keep.krS) M.kr.search = keep.krS; else delete M.kr.search;
  if (keep.krL) M.kr.searchLabel = keep.krL;
  if (keep.fmS) M.fmea.search = keep.fmS; else delete M.fmea.search;
});

/* ------------------------------------------------------------------------ 7. save, read-only */
s.step('save button and read-only', () => {
  fresh();
  s.click('Save');
  s.ok(hasToast('Saved.'), 'Save toast');
  openSettings();
  s.check('Preview the read-only view', true);
  s.eq('ro on', s.c.state.ro, true);
  closeSheets();
  s.ok(s.has('Read-only'), 'read-only pill');
  s.ok(!s.has('Save', { tag: 'button' }), 'Save hidden');
  s.ok(!s.has((el) => /saveind/.test(el.attrs.class || '')), 'save state hidden');
  s.ok(!s.has('End objective'), 'End objective hidden');
  s.eq('ctx.ro', s.c.ctx.ro, true);
  const before = JSON.stringify(s.c.D.docs);
  s.eq('mutate refused', s.c.mutate((D) => { D.docs[s.c.ctx.docKey].keyResults = []; }), false);
  s.ok(hasToast('Read-only view — editing is disabled.'), 'read-only toast');
  s.eq('nothing changed', JSON.stringify(s.c.D.docs), before);
  s.vals.sh.head.openEnd();
  s.render();
  s.eq('End objective sheet refused in read-only', sheetKind(), '');
  // an ended objective: Reopen hidden in read-only
  if (!SALES) {
    pickDivision('Fuel Cell');
    s.expect('Achieved Sep 25, 2026');
    s.ok(!s.has('Reopen'), 'Reopen hidden in read-only');
  }
  openSettings();
  s.check('Preview the read-only view', false);
  closeSheets();
  s.ok(s.has('Save', { tag: 'button' }), 'Save back');
  s.clean('read-only');
});

/* ------------------------------------------------------------------------ 8. theme and remembered choices */
s.step('appearance and remembered choices', () => {
  const store = {};
  const realLS = global.window.localStorage;
  global.window.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  try {
    fresh();
    openSettings();
    s.expect('Saved in this browser and shared across the R&D suite. Choose Match system to follow your system setting.');
    s.click('Dark', { within: 'Theme' });
    s.eq('dark', [s.c.state.theme, s.vals.theme], ['dark', 'dark']);
    s.eq('root data-theme', s.find((el) => el.attrs.class === 'cw').attrs['data-theme'], 'dark');
    s.eq('saved like rd_theme', store.rd_theme, 'dark');
    s.expect('Saved in this browser and shared across the R&D suite. Choose Match system to follow your system setting.');
    closeSheets();
    if (SALES) {
      /* Sales opens on All divisions every time, so it remembers no division and leaves rd_division (Execution's
         and Product spec's) alone */
      store.rd_division = 'DIV-FC';
      pickDivision('Partnerships');
      s.eq('Sales leaves rd_division alone', store.rd_division, 'DIV-FC');
      fresh();
      s.eq('theme restored on load', s.c.state.theme, 'dark');
      s.eq('All divisions again on load', [s.c.state.divAll, s.c.ctx.divId, s.c.ctx.objId], [true, DEF_DIV, DEF_OBJ]);
      store.rd_division = 'DIV-PT';
      fresh();
      s.eq('a remembered business division is not used either', [s.c.state.divAll, s.c.ctx.divId], [true, DEF_DIV]);
      delete store.rd_division;
    } else {
      pickDivision('Fuel Cell');
      s.eq('division remembered like rd_division', store.rd_division, 'DIV-FC');
      fresh();
      s.eq('theme restored on load', s.c.state.theme, 'dark');
      s.eq('division restored on load', s.c.ctx.divId, 'DIV-FC');
    }
    openSettings();
    s.click('Light', { within: 'Theme' });
    s.eq('light saved', store.rd_theme, 'light');
    s.click('Match system', { within: 'Theme' });
    s.eq('Match system is saved as the choice', store.rd_theme, 'system');
    s.eq('system', s.c.state.theme, 'system');
    store.rd_division = SALES ? 'DIV-EL' : 'DIV-BD';
    fresh();
    s.eq('a remembered division of the wrong kind is ignored', s.c.ctx.divId, DEF_DIV);
  } finally { global.window.localStorage = realLS; }
  s.clean('theme');
});

/* ------------------------------------------------------------------------ 9. hand-off from another board */
s.step('hand-off', () => {
  const objId = SALES ? 'OBJ-BD-2027Q1-01' : 'OBJ-FC-2026Q4-02';
  global.window.sessionStorage.setItem('celadyne-calm-open', JSON.stringify({ app: SALES ? 'sales' : 'exec', objective: objId, tab: 'risks' }));
  fresh();
  s.eq('opened at the objective', [s.c.ctx.objId, s.c.state.tab], [objId, 'risks']);
  s.eq('Sales: still All divisions', s.c.state.divAll, SALES);
  global.window.sessionStorage.setItem('celadyne-calm-open', JSON.stringify({ app: SALES ? 'sales' : 'exec', division: SALES ? 'DIV-PT' : 'DIV-FC' }));
  fresh();
  s.eq('a hand-off naming only a division opens that division alone', [s.c.ctx.divId, s.c.state.divAll], [SALES ? 'DIV-PT' : 'DIV-FC', false]);
  global.window.sessionStorage.setItem('celadyne-calm-open', JSON.stringify({ app: SALES ? 'sales' : 'exec', objective: objId, tab: 'exp' }));
  fresh();
  s.eq(SALES ? 'Sales: a hand-off naming the Experiments tab opens the Overview (no such tab since November 3)' : 'a hand-off naming the Experiments tab opens it', [s.c.ctx.objId, s.c.state.tab], [objId, SALES ? 'overview' : 'exp']);
  s.clean('hand-off to Experiments');
  global.window.sessionStorage.setItem('celadyne-calm-open', JSON.stringify({ app: 'plan', objective: objId }));
  fresh();
  s.eq('another app\'s hand-off is ignored', s.c.ctx.objId, DEF_OBJ);
  global.window.sessionStorage.removeItem('celadyne-calm-open');
  // owners are read-only here; the link hands the objective to Planning
  fresh();
  s.expect('Owners are set in Planning');
  const a = s.find('Planning', { within: 'owners' });
  s.eq('link target', a.attrs.href, 'Plan-A.dc.html');
  s.click('Planning', { within: 'owners' });
  const h = JSON.parse(global.window.sessionStorage.getItem('celadyne-calm-open') || '{}');
  s.eq('hand-off to Planning', [h.app, h.objective, h.division], ['plan', DEF_OBJ, DEF_DIV]);
  global.window.sessionStorage.removeItem('celadyne-calm-open');
});

/* ------------------------------------------------------------------------ 10. broker / load messages */
s.step('broker token and load messages', () => {
  fresh();
  openSettings();
  s.expect('A token is saved in this browser.');
  s.type('Broker token', 'tok-123');
  s.click('Save token');
  s.ok(hasToast('Saved.'), 'Saved.');
  s.flush(500);
  s.ok(hasToast(LOADED), 'Loaded toast');
  s.eq('draft cleared', s.c.state.sh_tokenDraft, '');
  // empty token: scratch
  s.type('Broker token', '   ');
  s.key('Broker token', 'Enter');
  s.flush(500);
  s.eq('no token', [s.c.state.sh_token, s.c.state.sh_load], ['', 'notoken']);
  closeSheets();
  s.expect('Add a broker token in Settings to load. Showing empty scratch.');
  s.expect('Not loaded. Add a broker token in Settings to load.');
  s.ok(s.has('Not loaded.', { within: 'Objectives' }), 'sidebar says not loaded');
  s.eq('ctx when not loaded', [s.c.ctx.loaded, s.c.ctx.obj, s.c.ctx.objs.length], [false, null, 0]);
  s.ok(!s.has('Search'), 'no search while not loaded');
  s.ok(!s.has('Save', { tag: 'button' }), 'no Save while not loaded');
  s.ok(!s.has(PICKER), 'no division picker while not loaded');
  s.clean('not loaded');
  s.click('Open settings');
  s.eq('settings opened from the empty state', sheetKind(), 'shell.settings');
  s.expect('No token saved. The app shows empty scratch and saves nothing.');
  s.click('Reload from the broker');
  s.flush(400);
  s.eq('still scratch without a token', s.c.state.sh_load, 'notoken');
  s.type('Broker token', 'tok-456');
  s.click('Save token');
  s.flush(500);
  s.eq('loaded again', [s.c.state.sh_load, s.c.ctx.objId, s.c.state.sh_banner], ['ok', DEF_OBJ, null]);
  s.click('Simulate a failed load');
  s.flush(400);
  closeSheets();
  s.expect('Load failed (401). Check the token in Settings.');
  s.expect('Not loaded. The last load failed; check the token in Settings.');
  s.click('Try again');
  s.flush(400);
  s.eq('recovered', s.c.state.sh_load, 'ok');
  s.ok(hasToast(LOADED), 'loaded after retry');
  openSettings();
  s.click('Simulate a missing portfolio');
  s.flush(400);
  closeSheets();
  s.expect('No portfolio doc on the broker yet — create it from the Planning app first.');
  s.ok(s.has('Open Planning'), 'Planning link when there is no portfolio');
  s.click('Dismiss message');
  s.eq('message dismissed', s.c.state.sh_banner, null);
  s.click('Try again');
  s.flush(400);
  s.eq('loaded', s.c.state.sh_load, 'ok');
  s.clean('broker');
});

/* ------------------------------------------------------------------------ 11. URL-parameter links */
s.step('link builder and fresh-load rules', () => {
  fresh();
  openLink();
  s.eq('pushed over Settings', [sheetKind(), s.c.state.sheets.length], ['shell.link', 2]);
  s.click('Back');
  s.eq('back to Settings', sheetKind(), 'shell.settings');
  s.click('Open a link');
  const app = SALES ? 'sales_app.html' : 'execution_app.html';
  const otherDiv = SALES ? 'DIV-PT' : 'DIV-FC';
  const objInOther = SALES ? 'OBJ-BD-2027Q1-01' : 'OBJ-FC-2026Q4-02';
  /* Sales starts on All divisions, which a link without ?division= opens on */
  s.eq('starts as the link to this view', s.vals.sh.linkSheet.url, app + '?' + (SALES ? '' : 'division=' + DEF_DIV + '&') + 'objective=' + DEF_OBJ);
  if (SALES) s.eq('the Division list: All divisions when it is not in the link', s.vals.sh.linkSheet.divOpts[0].label, 'All divisions (not in the link)');
  s.expect('It starts as the link to what is on screen now.');
  s.click('Clear all', { within: 'Parameters' });
  s.eq('cleared', s.vals.sh.linkSheet.url, app);
  s.type('~Quarter', 'active', { within: 'Parameters' });
  s.type('~Objective', objInOther, { within: 'Parameters' });
  s.eq('URL', s.vals.sh.linkSheet.url, app + '?quarter=active&objective=' + objInOther);
  s.expect(app + '?quarter=active&objective=' + objInOther);
  s.click('Copy link');
  s.ok(hasToast('Link copied.'), 'copied');
  { const real = global.window.navigator.clipboard.writeText; global.window.navigator.clipboard.writeText = () => ({ then(ok, no) { if (no) no(new Error('Write permission denied.')); return this; } });
    s.click('Copy link');
    s.ok(hasToast('Copy didn’t work here. Select the link and copy it instead.'), 'a refused copy says so');
    global.window.navigator.clipboard.writeText = real; }
  s.click('Open this link');
  s.flush(400);
  s.eq('sheets closed', s.c.state.sheets.length, 0);
  s.eq('objective opened in its division', [s.c.ctx.divId, s.c.ctx.objId], [SALES ? 'DIV-BD' : 'DIV-FC', objInOther]);
  s.eq('active quarter', s.c.state.fQuarter, SALES ? '' : '2026Q4');
  if (SALES) s.ok(/No objectives here are in Q4 2026|dropped/.test(s.vals.sh.banner ? s.vals.sh.banner.detail : '') || s.c.state.fQuarter === '', 'quarter handled');
  s.ok(hasToast(SALES ? 'Loaded all business divisions.' : 'Loaded ' + s.c.ctx.div.name + '.'), 'Loaded toast');
  s.eq('Sales: a link without ?division= opens on All divisions', s.c.state.divAll, SALES);
  s.clean('after link');

  // a quarter filter that would hide the objective is dropped
  openLinkNow({ quarter: SALES ? '2026Q4' : '2026Q3', objective: objInOther });
  s.eq('objective still opened', s.c.ctx.objId, objInOther);
  s.eq('quarter dropped', s.c.state.fQuarter, '');
  s.ok(/dropped because they would hide/.test(s.vals.sh.banner.detail), 'says the filters were dropped');
  s.expect('Opened the link.');

  // unknown objective: ignored; the remembered division is used (Sales: All divisions)
  const before = s.c.ctx.divId;
  openLinkNow({ objective: 'OBJ-NOPE-1' });
  s.eq('remembered division', [s.c.ctx.divId, s.c.state.divAll], [before, SALES]);
  s.ok(/There is no objective OBJ-NOPE-1/.test(s.vals.sh.banner.detail), 'unknown objective explained');

  // an objective that belongs to the other app
  const foreign = SALES ? 'OBJ-EL-2026Q4-01' : 'OBJ-BD-2026Q4-01';
  openLinkNow({ objective: foreign, division: otherDiv });
  s.eq('division from ?division=, on its own', [s.c.ctx.divId, s.c.state.divAll], [otherDiv, false]);
  s.ok(new RegExp(foreign + ' belongs to').test(s.vals.sh.banner.detail), 'foreign objective explained');

  // unknown division id
  openLinkNow({ division: 'DIV-ZZ' });
  s.eq('first division (Sales: All divisions)', [s.c.ctx.divId, s.c.state.divAll], [s.c.ctx.divs[0].id, SALES]);
  s.ok(/There is no division DIV-ZZ/.test(s.vals.sh.banner.detail), 'unknown division explained');

  // read-only
  openLinkNow({ readonly: true });
  s.eq('read-only from the link', s.c.state.ro, true);
  s.ok(s.has('Read-only'), 'pill');
  openLinkNow({});
  s.eq('a link without ?readonly is editable', s.c.state.ro, false);
  s.eq('a plain link has no message', s.c.state.sh_banner, null);

  // product parameter
  if (!SALES) {
    openLinkNow({ division: 'DIV-FC', product: 'PRD-FC-1' });
    s.eq('product filter from the link', s.c.state.fProduct, 'PRD-FC-1');
    openLinkNow({ division: 'DIV-FC', product: 'PRD-EL-1' });
    s.eq('stale product reset', s.c.state.fProduct, '');
    s.ok(/No objectives here are for Tera stack/.test(s.vals.sh.banner.detail), 'stale product explained');
  } else {
    openLinkNow({ product: 'PRD-EL-1' });
    s.eq('no Sales objective has that product', s.c.state.fProduct, '');
  }

  // owner parameter (case-insensitive) and the owner chip
  const ownerDiv = SALES ? 'DIV-BD' : 'DIV-FC';
  const owner = SALES ? 'SAM@celadyne.com ' : 'MAYA@celadyne.com ';
  openLinkNow({ division: ownerDiv, owner: owner });
  s.eq('owner filter', s.c.state.fOwner, owner.trim().toLowerCase());
  s.eq('their objectives only', s.c.ctx.objs.map((o) => o.id), SALES ? ['OBJ-BD-2026Q4-01', 'OBJ-BD-2027Q1-01'] : ['OBJ-FC-2026Q4-02', 'OBJ-FC-2026Q4-03']);
  s.expect('Owner: ' + (SALES ? 'Sam Rivera' : 'Maya Okafor'));
  s.click('Clear the owner filter');
  s.eq('owner filter cleared', s.c.state.fOwner, '');
  if (!SALES) {
    openLinkNow({ division: 'DIV-FC', owner: 'maya@celadyne.com', objective: 'OBJ-FC-2026Q4-01' });
    s.eq('owner filter hides the objective: first of theirs', s.c.ctx.objId, 'OBJ-FC-2026Q4-02');
    s.ok(/The owner filter hides OBJ-FC-2026Q4-01/.test(s.vals.sh.banner.detail), 'explained');
    openLinkNow({ division: 'DIV-FC', owner: 'sam@celadyne.com' });
    s.expect('No objectives in this division are owned by Sam Rivera.');
    s.click('Clear the owner filter');
    s.eq('cleared from the empty state', s.c.state.fOwner, '');
  }

  // token parameter: saved and removed
  openSettings();
  s.type('Broker token', '');
  s.click('Save token');
  s.flush(500);
  s.eq('no token', s.c.state.sh_load, 'notoken');
  openLinkNow({});
  s.eq('a link without a token stays scratch', s.c.state.sh_load, 'notoken');
  openLinkNow({ token: 'sso-token-1' });
  s.eq('token from the link loads', [s.c.state.sh_load, s.c.state.sh_token], ['ok', 'saved']);
  s.ok(/token was saved in this browser and removed/.test(s.vals.sh.banner.detail), 'token explained');
  link({ token: 'sso', readonly: true, owner: 'erin@celadyne.com', division: otherDiv, product: SALES ? '' : 'PRD-FC-1', quarter: '2026Q4', objective: objInOther });
  s.eq('full URL', s.vals.sh.linkSheet.url, app + '?division=' + otherDiv + '&quarter=2026Q4' + (SALES ? '' : '&product=PRD-FC-1') + '&objective=' + objInOther + '&owner=erin%40celadyne.com&readonly&token=sso');
  closeSheets();
  s.clean('links');
});

/* ------------------------------------------------------------------------ 12. sync simulations */
function endCurrent(status, date, note) {
  s.click('End objective', { within: 'objective-head' });
  if (status === 'achieved') s.click('~Achieved', { within: 'Outcome' });
  if (date != null) s.type('End date', date);
  if (note != null) s.type('~Note', note);
  s.click('End objective', { within: 'Editor' });
}
s.step('offline, back online, conflict, teammate', () => {
  fresh();
  openSettings();
  s.expect('Changes save 0.7 seconds after your last edit, or within 2.5 seconds while you keep editing.');
  s.click('Go offline');
  s.eq('offline', s.c.state.sim.offline, true);
  s.expect('You are offline. Changes are kept here and save when you are back online.');
  s.click('Receive a teammate\'s change');
  s.ok(hasToast('You are offline, so teammates\' changes cannot arrive. Go back online first.'), 'no teammate changes while offline');
  s.click('Back online after a teammate saved');
  s.ok(hasToast('Make a change while offline first. A conflict needs an unsaved change of yours.'), 'conflict needs a pending change');
  closeSheets();
  endCurrent('abandoned');
  s.eq('saved offline', [s.c.state.save.state, !!s.c.state.save.pending], ['offline', true]);
  s.expect('Offline, changes kept here');
  s.ok(!!RD.objectiveEndState(doc().objectiveState, DEF_OBJ), 'ended locally');
  s.click('Back online', { within: 'offline' });
  s.eq('saving after reconnect', s.c.state.save.state, 'saving');
  s.flush(800);
  s.eq('saved', s.c.state.save.state, 'saved');
  s.ok(hasToast('Saved.'), 'Saved. after reconnect');
  s.ok(!!RD.objectiveEndState(doc().objectiveState, DEF_OBJ), 'the change survived');
  s.click('Reopen');
  s.flush(800);
  // conflict: the server copy wins
  openSettings();
  s.click('Go offline');
  closeSheets();
  endCurrent('achieved', null, 'Offline note');
  const readsBefore = doc().kpiUpdates.length;
  const progBefore = JSON.stringify(doc().keyResults.map((k) => k.progress));
  openSettings();
  s.click('Back online after a teammate saved');
  s.eq('local change discarded', RD.objectiveEndState(doc().objectiveState, DEF_OBJ), null);
  s.eq('conflict state', [s.c.state.save.state, s.c.state.sim.offline], ['conflict', false]);
  closeSheets();
  s.expect('Another editor saved first — reloaded; re-apply your change.');
  s.expect('Reloaded after a conflict');
  s.ok(doc().kpiUpdates.length === readsBefore + 1 || JSON.stringify(doc().keyResults.map((k) => k.progress)) !== progBefore, 'the teammate\'s change is in the reloaded copy');
  s.click('Dismiss message');
  // a teammate's change while online (the 25 s poll)
  const n0 = doc().kpiUpdates.length;
  const sc0 = RD.objectiveScore(DEF_OBJ, s.c.ctx.em);
  const kpi0 = doc().kpis.find((k) => k.objectiveId === DEF_OBJ && doc().kpiUpdates.some((u) => u.kpiId === k.id && typeof u.value === 'number'));
  const last0 = kpi0 ? doc().kpiUpdates.filter((u) => u.kpiId === kpi0.id && typeof u.value === 'number').sort((a, b) => a.timestamp - b.timestamp).pop() : null;
  openSettings();
  s.click('Receive a teammate\'s change');
  closeSheets();
  s.expect('Updated from another editor.');
  const detail = s.vals.sh.banner.detail;
  s.ok(doc().kpiUpdates.length === n0 + 1 || /moved/.test(detail), 'teammate change applied: ' + detail);
  if (kpi0) {
    const added = doc().kpiUpdates[doc().kpiUpdates.length - 1];
    s.eq('teammate reading', [added.kpiId, added.value, added.batch || ''], [kpi0.id, last0.value, RD.latestBatchId(doc().kpiUpdates.filter((u) => u.kpiId === kpi0.id && u !== added)) || '']);
    s.ok(detail.indexOf((SALES ? 'Sam Rivera' : 'Toru Hayashi') + ' added a reading of ') === 0 && detail.indexOf(kpi0.name) > 0, 'says who and what: ' + detail);
  }
  headNumbers('after teammate');
  s.ok(typeof sc0 === 'number' || sc0 == null, 'score before: ' + sc0 + ', after: ' + RD.objectiveScore(DEF_OBJ, s.c.ctx.em));
  openSettings();
  s.ok(s.has('~Last change from a teammate:'), 'last change listed in Settings');
  // read-only still receives teammates' changes
  s.check('Preview the read-only view', true);
  const n1 = doc().kpiUpdates.length;
  s.click('Receive a teammate\'s change');
  s.eq('received in read-only', doc().kpiUpdates.length, n1 + 1);
  s.check('Preview the read-only view', false);
  // switching division flushes a pending save
  closeSheets();
  endCurrent('abandoned');
  s.eq('saving', s.c.state.save.state, 'saving');
  pickDivision(SALES ? 'Partnerships' : 'Fuel Cell');
  s.eq('flushed on switch', s.c.state.save.state, 'saved');
  s.clean('sync');
});

/* ------------------------------------------------------------------------ 13. Hub sign-in */
s.step('Hub sign-in', () => {
  fresh();
  openSettings();
  s.eq('signed in as Corey at start', s.vals.sh.settings.hub.value, 'corey@celadyne.com');
  s.expect('Kanban Done-column choices follow you to any device.');
  s.type('Signed in as', '');
  s.eq('signed out', [s.c.state.sim.hub, s.c.ctx.hub], [false, false]);
  s.expect('Not signed in, or inside a Confluence embed where the Hub sign-in is not visible. Done-column choices are kept in this browser only.');
  s.type('Signed in as', 'corey@celadyne.com');
  s.eq('signed in', s.c.state.sim.hub, true);
});

/* ------------------------------------------------------------------------ 14. End objective / Reopen */
s.step('end objective and reopen', () => {
  fresh();
  const open = doc().stageGates.filter((g) => g.objectiveId === DEF_OBJ && g.actualDate == null).length;
  s.click('End objective', { within: 'objective-head' });
  s.eq('sheet', sheetKind(), 'shell.end');
  s.expect('Ending an objective freezes its schedule so its delays stop extending into the next quarter.');
  s.expect(open + ' unfinished stage-gate' + (open === 1 ? '' : 's') + ' will show as cancelled.');
  s.expect('Work stopped. The remaining gates are cancelled.');
  s.expect('Goals met. The remaining gates are moot.');
  s.eq('Abandoned is the default', s.find('~Abandoned', { within: 'Outcome', tag: 'button' }).attrs['aria-checked'], true);
  s.eq('end date defaults to today', s.vals.sh.endSheet.date, '2026-10-13');
  s.type('End date', 'not a date');
  s.click('End objective', { within: 'Editor' });
  s.expect('Use a date like 2026-10-13, or leave it empty for today.');
  s.eq('nothing written', RD.objectiveEndState(doc().objectiveState, DEF_OBJ), null);
  s.type('End date', '');
  s.click('~Achieved', { within: 'Outcome' });
  s.eq('Achieved picked', s.find('~Achieved', { within: 'Outcome', tag: 'button' }).attrs['aria-checked'], true);
  s.type('~Note', '  Hit every target early.  ');
  s.click('End objective', { within: 'Editor' });
  const es = doc().objectiveState.find((r) => r.objectiveId === DEF_OBJ);
  s.eq('end state written like today', es, { objectiveId: DEF_OBJ, status: 'achieved', endedDay: today, note: 'Hit every target early.' });
  s.ok(hasToast('Objective ended — achieved.'), 'toast');
  s.eq('sheet closed', sheetKind(), '');
  s.expect('Achieved Oct 13, 2026');
  s.expect('Hit every target early.');
  s.expect('The schedule is frozen and unfinished stage-gates show as cancelled.');
  s.eq('schedule fact ended', [fact('schedule').value, fact('schedule').detail], ['Achieved', 'Ended Oct 13, 2026']);
  s.ok(!s.has('End objective', { within: 'objective-head' }), 'no End objective once ended');
  s.ok(s.vals.sh.objGroups.some((g) => g.objs.some((o) => o.right === 'Achieved')), 'sidebar shows Achieved');
  s.eq('ctx.ended', s.c.ctx.ended, true);
  headNumbers('ended');
  s.click('Reopen');
  s.ok(hasToast('Objective reopened.'), 'reopened');
  s.eq('end state removed', RD.objectiveEndState(doc().objectiveState, DEF_OBJ), null);
  // abandoned after the planned end: "was N days over at close"
  endCurrent('abandoned', '2026-12-28', '');
  s.eq('abandoned', doc().objectiveState.find((r) => r.objectiveId === DEF_OBJ).status, 'abandoned');
  s.eq('over at close', fact('schedule').detail, 'Ended Dec 28, 2026, was 10 days over at close');
  s.expect('Abandoned Dec 28, 2026');
  s.ok(hasToast('Objective ended — abandoned.'), 'toast abandoned');
  s.eq('pace label when ended', s.vals.sh.head.score.todayLabel, 'Ended Dec 28');
  // ending again replaces the record (today filters then pushes)
  s.c.mutate((D) => { D.docs[s.c.ctx.docKey].objectiveState.push({ objectiveId: DEF_OBJ, status: 'achieved', endedDay: today, note: '' }); }, { quiet: true });
  s.render();
  s.click('Reopen');
  s.eq('reopen removes every record for it', doc().objectiveState.filter((r) => r.objectiveId === DEF_OBJ).length, 0);
  // Escape closes the sheet; the backdrop does not
  s.click('End objective', { within: 'objective-head' });
  s.ok(s.has('Close panel'), 'clicking the dimmed page closes the panel (asks first when there are unsaved edits)');
  s.key('Editor', 'Escape');
  s.eq('Escape closes', sheetKind(), '');
  s.click('End objective', { within: 'objective-head' });
  s.vals.sh.sheetKey({ key: 'Escape', defaultPrevented: true });
  s.render();
  s.eq('an input that handled Escape keeps the sheet', sheetKind(), 'shell.end');
  s.vals.sh.sheetKey({ key: 'a' });
  s.click('Cancel', { within: 'Editor' });
  s.eq('Cancel closes', sheetKind(), '');
  s.clean('end objective');
});

/* ------------------------------------------------------------------------ 15. schedule alarm, revised plan, acceleration */
s.step('schedule alarm and revised plan', () => {
  fresh();
  const objId = s.c.ctx.objId;
  s.c.D.docs[s.c.ctx.docKey].tasks.push({ id: 'TSK-TEST-SLIP', objectiveId: objId, name: 'Long soak test', plannedStart: today - 100, plannedEnd: today + 50, percentComplete: 5, actualStart: today - 100, actualEnd: null });
  s.render();
  const r = headNumbers('slipping');
  s.ok(r.slip > 10, 'slip over the alarm: ' + r.slip);
  s.expect(r.slip + ' days behind schedule, past the 10-day alarm.');
  s.eq('schedule fact', fact('schedule').detail, 'Planned Dec 18, ' + r.slip + ' days behind schedule');
  s.eq('schedule tone', fact('schedule').vcls, 'shl-fv t-bad tx-bad');
  s.click('Build revised plan');
  s.ok(/^gates\./.test(sheetKind()) || hasToast('The revise-plan editor is not in this build yet.'), 'Build revised plan opens Revise plan (or says it is not built yet): ' + sheetKind());
  closeSheets();
  s.ok(!s.has('~Delays before it are part of the plan'), 'alarm wins over an active plan');
  // read-only hides the button, keeps the alarm
  s.c.setState({ ro: true }); s.render();
  s.ok(!s.has('Build revised plan'), 'button hidden in read-only');
  s.expect('past the 10-day alarm');
  s.c.setState({ ro: false }); s.render();
  // ended: no alarm
  s.c.mutate((D) => { D.docs[s.c.ctx.docKey].objectiveState.push({ objectiveId: objId, status: 'abandoned', endedDay: today, note: '' }); }, { quiet: true });
  s.render();
  s.ok(!s.has('Build revised plan'), 'no alarm once ended');
  s.c.mutate((D) => { const d = D.docs[s.c.ctx.docKey]; d.objectiveState = []; d.tasks = d.tasks.filter((t) => t.id !== 'TSK-TEST-SLIP'); }, { quiet: true });
  s.render();
  // a legacy revised plan that is active
  s.c.mutate((D) => { const d = D.docs[s.c.ctx.docKey]; d.catchupPlans = (d.catchupPlans || []).filter((p) => p.objectiveId !== objId).concat([{ id: 'CU-TEST', objectiveId: objId, enactedDay: today - 2, gates: [] }]); }, { quiet: true });
  s.render();
  const rev = RD.planRevision(doc(), objId);
  s.eq('the latest revision is the re-commit two days ago', [rev.day, rev.kind], [today - 2, 'recommit']);
  s.expect('Revised plan active since ' + day(today - 2) + '. Delays before it are part of the plan; only new slips count.');
  s.click('Revise');
  s.ok(/^gates\./.test(sheetKind()) || hasToast('The revise-plan editor is not in this build yet.'), 'Revise opens Revise plan');
  closeSheets();
  headNumbers('revised plan active');
  // acceleration: an early finish upstream of a gate that runs past the planned end
  fresh();
  const d = doc();
  const o = s.c.ctx.obj;
  const set = d.stageGateSets.find((x) => x.objectiveId === o.id);
  const sg = d.stageGates.filter((g) => g.objectiveId === o.id && g.setId === set.id && g.actualDate == null && !g.locked).sort((a, b) => b.plannedDate - a.plannedDate)[0];
  if (sg) {
    sg.actualDate = today + 0;
    d.stageGates.push({ id: 'SG-TEST-ACC', objectiveId: o.id, setId: set.id, name: 'Late follow-up', plannedDate: o.plannedEnd + 20, actualDate: null, status: 'pending', order: 9 });
    sg.plannedDate = Math.max(sg.plannedDate, today + 10);
    s.render();
    const r2 = headNumbers('acceleration');
    s.ok(r2.accel > 0, 'acceleration found: ' + r2.accel);
    s.expect(r2.accel + ' days of acceleration possible');
  } else s.ok(true, 'no open gate to accelerate in this sample');
  s.clean('alarm');
});

s.step('sample data shows the alarm and an active revised plan', () => {
  fresh();
  if (!SALES) { pickDivision('Fuel Cell'); pickObjective('Root-cause AST degradation'); } else pickObjective('Build the Q1 hydrogen-hub pipeline');
  const r = headNumbers('sample alarm');
  s.eq('seeded slip', r.slip, 18);
  s.expect('18 days behind schedule, past the 10-day alarm.');
  s.ok(s.has('Build revised plan'), 'Build revised plan offered');
  s.eq('alarm note', s.vals.sh.head.sched.k, 'alarm');
  fresh();
  if (!SALES) pickObjective('Lock Tera 25-30-R5 components');
  const p = s.c.ctx.doc.catchupPlans.some((x) => x.objectiveId === s.c.ctx.objId);
  s.eq('plan note when a legacy plan is active', !!(s.vals.sh.head.sched && s.vals.sh.head.sched.k === 'plan-active'), p);
  if (p) s.ok(s.has('Revise', { within: 'plan-active' }), 'Revise offered');
  s.clean('sample alarm');
});

/* ------------------------------------------------------------------------ 16. quarter strip variants */
s.step('quarter strip variants', () => {
  fresh();
  const P = s.c.D.portfolio;
  const o = s.c.ctx.obj;
  const cells = () => s.all((el) => el.attrs.class && /^shl-qc/.test(el.attrs.class)).map((c) => c.attrs.class);
  o.quarter = 'Q4 2026';
  s.render();
  s.expect('Week 2 of 13');
  s.eq('a "Q4 2026" label parses too', s.vals.sh.head.strip.label, 'Q4 2026');
  o.quarter = '2026Q3';
  s.render();
  s.expect('Complete');
  s.eq('all 13 weeks done', cells().filter((c) => c === 'shl-qc done').length, 13);
  o.quarter = '2027Q1';
  s.render();
  s.expect('Upcoming');
  s.eq('no week done', cells().filter((c) => /done|now/.test(c)).length, 0);
  o.quarter = 'H2 plan';
  s.render();
  const span = o.plannedEnd - o.plannedStart, pct = Math.round(Math.max(0, Math.min(span, today - o.plannedStart)) / span * 100);
  s.eq('planned window instead', [s.vals.sh.head.strip.label, s.vals.sh.head.strip.status], ['H2 plan', pct + '% elapsed']);
  s.expect('Oct 1 to Dec 18');   // audit A1: the planned window reads like the quarter range (no arrow glyph)
  o.plannedStart = null;
  s.render();
  s.eq('just the label', [s.vals.sh.head.strip.label, s.vals.sh.head.strip.status, s.vals.sh.head.score.hasPace], ['H2 plan', '', false]);
  o.quarter = '';
  s.render();
  s.eq('no quarter', s.vals.sh.head.strip.label, 'No quarter');
  s.ok(s.vals.sh.objGroups.some((g) => g.label === 'No quarter'), 'sidebar group for objectives without a quarter');
  s.clean('strip');
  P.objectives.find((x) => x.id === o.id).plannedStart = today + 5;
  o.quarter = '2026Q4';
  s.render();
  s.eq('not started yet', s.vals.sh.head.score.todayLabel, 'Starts in 5 days');
});

/* ------------------------------------------------------------------------ 17. tabs */
s.step('tabs', () => {
  fresh();
  /* no Tasks tab (removed October 15: the Kanban covers that work); Sales has no Experiments tab (November 3) */
  s.eq('the tabs', s.vals.sh.tabs.map((x) => x.label), ['Overview', 'Key results', 'Stage-gates', 'Kanban', 'Risks'].concat(SALES ? [] : ['Experiments']));
  ['Key results', 'Stage-gates', 'Kanban', 'Risks'].concat(SALES ? [] : ['Experiments'], ['Overview']).forEach((t) => {
    s.click(t, { within: 'Objective sections' });
    s.eq('tab ' + t, s.vals.sh.tabs.find((x) => x.label === t).cur, 'page');
    s.clean('tab ' + t);
  });
});

/* ------------------------------------------------------------------------ 18. Sales maintenance */
if (SALES) {
  s.step('recover stranded execution data', () => {
    fresh();
    pickDivision(DEF_DIV_NAME);   // one division: this division's objectives (All divisions: its own step)
    const pt = () => s.c.D.docs['BIZ-DIV-PT'];
    const bd = () => s.c.D.docs['BIZ-DIV-BD'];
    openSettings();
    s.expect('Maintenance');
    s.click('Recover stranded execution data');
    s.expect('Scanning…');
    s.flush(700);
    s.expect('Build the Q1 hydrogen-hub pipeline');
    s.expect('1 key result, 1 KPI, 1 stage-gate and 1 task stranded in Partnerships');
    s.click('Cancel', { within: 'Maintenance' });
    s.ok(!s.has('Move it all here'), 'report discarded');
    // read-only: scanning is allowed, moving is not
    s.check('Preview the read-only view', true);
    s.click('Recover stranded execution data');
    s.flush(700);
    s.expect('Read-only view: moving is disabled.');
    s.ok(!s.has('Move it all here'), 'no move button in read-only');
    s.vals.sh.settings.recover.move();
    s.flush(700);
    s.ok(hasToast('Read-only view — editing is disabled.'), 'move refused in read-only');
    s.eq('nothing moved', RD.objectivePayloadCounts(pt(), 'OBJ-BD-2027Q1-01').keyResults, 1);
    s.check('Preview the read-only view', false);
    const here0 = RD.objectivePayloadCounts(bd(), 'OBJ-BD-2027Q1-01');
    const there0 = RD.objectivePayloadCounts(pt(), 'OBJ-BD-2027Q1-01');
    s.click('Move it all here');
    s.expect('Moving…');
    s.flush(700);
    s.ok(hasToast('1 objective recovered.'), 'recovered toast');
    s.expect('1 objective recovered.');
    s.eq('source emptied', RD.objectivePayloadCounts(pt(), 'OBJ-BD-2027Q1-01'), { keyResults: 0, kpis: 0, stageGates: 0, tasks: 0, boards: 0, risks: 0 });
    const sum = {}; Object.keys(here0).forEach((k) => { sum[k] = here0[k] + there0[k]; });
    s.eq('moved here (nothing lost, nothing doubled)', RD.objectivePayloadCounts(bd(), 'OBJ-BD-2027Q1-01'), sum);
    s.ok(bd().kpiUpdates.some((u) => u.id === 'UPD-HL-1'), 'readings moved with their KPI');
    s.ok(bd().stageGateSets.some((x) => x.id === 'SGSET-BD-2027Q1-01-1'), 'workstream moved');
    s.ok(!pt().kpiUpdates.some((u) => u.id === 'UPD-HL-1'), 'reading gone from the source');
    s.click('Recover stranded execution data');
    s.flush(700);
    s.expect('No stranded execution data found for this division’s objectives.');
    closeSheets();
    pickObjective('Build the Q1 hydrogen-hub pipeline');
    s.expect('Qualify ten hydrogen-hub leads');
    headNumbers('recovered objective');
    // switching division drops a report in progress
    openSettings();
    s.click('Recover stranded execution data');
    closeSheets();
    pickDivision('Partnerships');
    s.eq('report dropped on switch', s.c.state.sh_recover, null);
    s.clean('recover');
  });
} else {
  s.step('no maintenance in Execution', () => {
    fresh();
    openSettings();
    s.ok(!s.has('Recover stranded execution data'), 'Execution has no recovery');
    s.ok(!s.has('Maintenance'), 'no Maintenance section');
  });
}

s.step('dialogs and toasts hosted by the shell', () => {
  fresh();
  let got = null;
  s.c.ask({ title: 'Name the tree', label: 'Tree name', value: 'Main', ok: 'Create', onOk: (v) => { if (!String(v).trim()) return 'Type a name.'; got = v; } });
  s.render();
  s.type('Tree name', '  ');
  s.click('Create');
  s.expect('Type a name.');
  s.type('Tree name', 'Second tree');
  s.key('Tree name', 'Enter');
  s.eq('ask returned the value', got, 'Second tree');
  s.c.ask({ title: 'Rename', label: 'New name', value: 'x', onOk: () => { got = 'renamed'; } });
  s.render();
  s.key('New name', 'Escape');
  s.eq('Escape cancels', [s.c.state.dlg, got], [null, 'Second tree']);
  s.c.confirm({ title: 'Delete it?', body: 'It is gone for good.', ok: 'Delete', danger: true, onOk: () => { got = 'deleted'; } });
  s.render();
  s.expect('It is gone for good.');
  s.click('Cancel', { within: 'Delete it?' });
  s.eq('cancel keeps it', got, 'Second tree');
  s.c.confirm({ title: 'Delete it?', ok: 'Delete', danger: true, onOk: () => { got = 'deleted'; } });
  s.render();
  s.click('Delete');
  s.eq('confirmed', got, 'deleted');
  s.c.toast('A message', 'info');
  s.render();
  s.click('Dismiss', { within: undefined });
  s.ok(!toasts().includes('A message'), 'toast dismissed');
  s.clean('dialogs');
});

/* ------------------------------------------------------------------------ 19. restore sample data */
s.step('restore sample data', () => {
  fresh();
  endCurrent('abandoned');
  pickDivision(SALES ? 'Partnerships' : 'Fuel Cell');
  openSettings();
  s.click('Restore the sample data');
  s.expect('Every change you made in this prototype is discarded.');
  s.click('Restore');
  s.ok(hasToast('Sample data restored.'), 'restored');
  s.eq('data fresh', RD.objectiveEndState(s.c.D.docs[(SALES ? 'BIZ-' : 'EXEC-') + DEF_DIV].objectiveState, DEF_OBJ), null);
  s.eq('selection reset', [s.c.ctx.divId, s.c.ctx.objId, s.c.state.divAll], [DEF_DIV, DEF_OBJ, SALES]);
  s.eq('sheets closed', s.c.state.sheets.length, 0);
  s.clean('restored');
});

done();
