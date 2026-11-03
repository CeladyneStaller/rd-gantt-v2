/* Scenario test for the Current step (mods/step) and the logic-tree editor (mods/etb), X-exp.
     node test/sc_exp.js out/xexp/Main.dc.html
     node test/sc_exp.js out/xexp/Sales-A.dc.html
   Covers: the Overview card, current-step cards and numbers, readings (inline and the statistical
   list with batches), the provisional strip, Conclude… and the recorder, Connect data for an
   experiment, several logic trees and their manager, every editor view and sheet, the multi-tree
   container rule, Clear all data, read-only and search, in Execution. Sales has had no Experiments tab since
   November 3 (its board carries neither module): there it checks they're gone and a stored tree is kept.
   Numbers are checked against the live engine (rdcore.js, loaded separately).
   At the end it checks that every handler site in mods/step and mods/etb was fired. */
const path = require('path');
const { Sim, done, textOf } = require('./dc');
const RD = require(require('./engine_path'));

const file = process.argv[2] || 'out/xexp/Main.dc.html';
const SALES = /Sales/.test(file);

/* ------------------------------------------------ handler-site coverage for my files */
const HIT = new Set();
const baseRender = Sim.prototype.render;
Sim.prototype.render = function () {
  baseRender.call(this);
  this.els.forEach((el) => Object.keys(el.on).forEach((name) => {
    const fn = el.on[name]; if (fn.__cov) return;
    const key = name.toLowerCase() + '@' + el.line;
    const w = function () { HIT.add(key); return fn.apply(this, arguments); };
    w.__cov = true; el.on[name] = w;
  }));
  return this;
};

/* ------------------------------------------------ helpers */
let s = new Sim(file);
const fresh = () => { s = new Sim(file); return s; };
const doc = () => s.c.D.docs[s.c.ctx.docKey];
const bagOf = (obj) => doc().etbTrees[obj || s.c.ctx.objId];
const treeOf = (obj, tid) => { const w = RD.etbTreesOf(bagOf(obj)); return w.trees.find((t) => t.tid === (tid || w.activeTid)); };
const toasts = () => (s.c.state.toasts || []).map((t) => t.text);
const hasToast = (t) => toasts().some((x) => (t instanceof RegExp ? t.test(x) : x === t));
const lastToast = () => toasts()[toasts().length - 1] || '';
const sheetKind = () => (s.c.sheet() ? s.c.sheet().kind : '');
const ST = () => s.vals.step;
const EV = () => s.vals.etb;
const goTab = (label, tab) => { if (s.c.state.tab !== tab) s.click(label); };
const goExp = () => goTab('Experiments', 'exp');
const em = () => RD.withPortfolio(s.c.D.portfolio, { [s.c.ctx.divId]: doc() });
const pool = () => (doc().kpis || []).concat(s.c.D.portfolio.kpis || []);
const engCurrent = (exp, krId) => RD.keyReadCurrent(exp.key_reads.find((k) => k.id === krId), { kpis: pool(), execDocs: em(), experiment: exp });
function card(tid, expId) { for (const b of ST().blocks) for (const c of b.cards) if (c.key === 'card-' + tid + '-' + expId) return c; return null; }
function krRow(tid, expId, krId) { const c = card(tid, expId); return c && c.rows ? c.rows.find((r) => r.key === 'kr-' + expId + '-' + krId) : null; }
function setRo(on) { s.c.closeAllSheets(); s.render(); s.click('Settings'); s.check('Preview the read-only view', on); s.click('Close'); }
function openObj(divId, objId) { s.c.setState({ divId: divId, objId: objId, sheets: [], menu: '' }); s.render(); }
const OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01';
/* key and blur on a text field (never on a container that merely contains the label text) */
function fieldEl(q, handler, opts) {
  const list = s.all(q, opts).filter((e) => (e.tag === 'input' || e.tag === 'textarea') && e.on[handler]);
  const el = list[(opts && opts.nth) || 0];
  if (!el) throw new Error('no field with ' + handler + ' for ' + String(q));
  return el;
}
const keyIn = (q, key, opts) => s.fire(fieldEl(q, 'onKeyDown', opts), 'onKeyDown', { key: key });
const blurIn = (q, opts) => s.fire(fieldEl(q, 'onBlur', opts), 'onBlur');
const field = (label, value, opts) => { s.type(label, value, opts); keyIn(label, 'Enter', opts); };

s.clean('initial');

/* ====================================================================== Sales: no experiments (November 3) */
if (SALES) {
  s.step('Sales: no Experiments tab, no Current step card, no logic tree; the stored tree is kept', () => {
    const before = JSON.stringify(bagOf(OBJ));
    s.eq('the tabs', s.vals.sh.tabs.map((t) => t.label), ['Overview', 'Key results', 'Stage-gates', 'Kanban', 'Risks']);
    s.eq('neither module on the board', [!!s.ns.MODS.step, !!s.ns.MODS.etb, typeof s.ns.ETB], [false, false, 'undefined']);
    s.eq('nothing about experiments on the Overview', [s.has((el) => el.attrs['data-k'] === 'ov-step'), s.has('Open experiments'), s.has('Record outcome'), s.has('~Current step')], [false, false, false, false]);
    s.c.setState({ tab: 'exp' }); s.render();
    s.eq('a stale tab state shows no experiments', [s.has((el) => el.attrs['data-k'] === 'current-step'), s.has((el) => el.attrs['data-k'] === 'etb')], [false, false]);
    s.c.setState({ tab: 'overview' }); s.render();
    const found = (q) => { s.type('Search', q); return [].concat.apply([], (s.vals.sh.search.groups || []).map((x) => (x.items || []).map((i) => x.label + ': ' + i.label))); };
    const iron = found('Ironwood');
    s.eq('search: the pilot-offer tree\'s EXP-3 … Ironwood isn\'t found; the Ironwood kanban tile still is', [iron.filter((l) => /EXP-3|^(Current step|Experiments|Logic tree)/.test(l)), iron.some((l) => /^Kanban tiles: Ironwood/.test(l))], [[], true]);
    const pilot = found('pilot');
    s.ok(pilot.length > 0 && !pilot.some((l) => /^(Current step|Experiments|Logic tree)/.test(l)), 'search still finds the objective and its work, no logic trees or current steps (' + pilot.length + ' results)');
    s.type('Search', '');
    s.ok(!!JSON.parse(before), 'the sample keeps its pilot-offer tree');
    s.eq('and nothing changed it', JSON.stringify(bagOf(OBJ)), before);
    s.clean('sales: no experiments');
  });
  done();
  return;
}

if (!SALES) {
/* ====================================================================== Execution */
const C7 = 't_cell7', XO = 't_xover';
const CV = 'KPI-EL-2026Q4-01-1-1', XKPI = 'KPI-EL-2026Q4-01-3-1';

s.step('Overview: Current step card lists every current step and opens the Experiments tab', () => {
  goTab('Overview', 'overview');
  const ov = ST().ov;
  s.eq('two current steps, one per tree', ov.items.map((o) => [o.code, o.tree]), [['EXP-2', 'Cell 7 voltage outlier'], ['EXP-2', 'Crossover margin at 30 bar']]);
  s.eq('strip and reads on the card', [ov.items[0].strip, ov.items[0].reads], ['Trending toward: Compression was the cause', '2 of 3 key reads measured']);
  s.eq('second card matched', ov.items[1].strip, 'Matched: Margin holds');
  s.click('~Gasket compression check', { within: 'Current step summary' });
  s.eq('row opens the Experiments tab', s.c.state.tab, 'exp');
  goTab('Overview', 'overview');
  s.click('Open experiments');
  s.eq('link opens the Experiments tab', s.c.state.tab, 'exp');
  s.clean('overview card');
});

s.step('Current step: trees header, ranges, cards and engine numbers', () => {
  goExp();
  s.eq('count', ST().count, '2');
  s.eq('tree buttons', ST().trees.map((t) => [t.name, t.range, t.unplanned, t.on]), [['Cell 7 voltage outlier', '0–2', true, 'true'], ['Crossover margin at 30 bar', '0–1', false, 'false']]);
  s.expect('Unplanned branch');
  const w = RD.etbTreesOf(bagOf(OBJ));
  const t1 = w.trees.find((t) => t.tid === C7);
  s.eq('engine range tree 1', RD.nextStepRange(t1, 'exp_002'), { min: 0, max: 2, unplanned: true, capped: false });
  const exp = t1.experiments.exp_002;
  const cv = engCurrent(exp, 'kr_002_1'), dev = engCurrent(exp, 'kr_002_2');
  const r1 = krRow(C7, 'exp_002', 'kr_002_1'), r2 = krRow(C7, 'exp_002', 'kr_002_2'), r3 = krRow(C7, 'exp_002', 'kr_002_3');
  s.eq('cell voltage = engine', [r1.val, r1.sub, r1.chip, r1.crit, r1.unit], [String(parseFloat(cv.value.toFixed(4))), 'average, ' + cv.n + ' of 10', 'From 4 samples', '≤ 1.85 V', 'V']);
  s.eq('engine cell voltage', [cv.value, cv.n], [1.825, 4]);
  s.eq('deviation = engine', [r2.val, r2.sub], [String(dev.value), 'average, 1 of 3']);
  s.eq('no read yet', [r3.noRead, r3.val], [true, 'No read']);
  s.eq('statistical rows open the list, single rows edit inline', [r1.clickStat, r1.clickOne, r3.clickStat, r3.clickOne], [true, false, false, true]);
  const c = card(C7, 'exp_002');
  s.eq('status follows the data', [c.statusW, c.code, c.hasHyp], ['In progress', 'EXP-2', true]);
  s.eq('strip', [c.strip.head, c.strip.sub], ['Trending toward: Compression was the cause', 'Provisional, awaiting Gasket thickness spread, Cell voltage at 2 A/cm² (4 of 10 reads), Cell 7 deviation from stack mean (1 of 3 reads).']);
  s.eq('Conclude… disabled with its reason', [c.concludeOn, c.concludeOff, c.concludeWhy], [false, true, 'Conclude opens once every key read has its data: no data yet for Gasket thickness spread; Cell voltage at 2 A/cm² has 4 of 10 reads; Cell 7 deviation from stack mean has 1 of 3 reads.']);
  s.ok(!s.all('Conclude…', { within: 'card-' + C7 + '-exp_002' }).some((el) => el.on.onClick), 'a disabled Conclude… has no handler');
  const c2 = card(XO, 'exp_002');
  s.eq('tree 2 matched and ready', [c2.strip.head, c2.strip.sub, c2.concludeOn], ['Matched: Margin holds', 'Crossover is not a risk for the durability campaign.', true]);
  s.clean('cards');
});

s.step('Mini graphs: show and hide per tree, nodes open the experiment', () => {
  goExp();
  s.ok(ST().blocks.every((b) => b.graphLazy), 'graphs start hidden with several trees');
  s.click('Show graph', { nth: 0 });
  const b = ST().blocks[0];
  s.ok(b.graphOpen && b.graph.has, 'graph drawn once shown');
  s.eq('remembered per objective and tree', Object.keys(s.c.state.step_graph), [OBJ + '|' + C7]);
  s.ok(b.graph.nodes.some((n) => n.isExp && n.code === 'EXP-2'), 'current experiment in the graph');
  s.ok(b.graph.nodes.some((n) => n.isStatic && n.text === 'Compression was the cause'), 'result labels in the graph');
  s.click('~EXP-2 Gasket compression check on cells 6 to 8, In progress', { within: 'Graph of the current step and its next steps' });
  s.eq('node opens the editor', [sheetKind(), s.c.sheet().data.expId], ['etb.exp', 'exp_002']);
  s.c.closeAllSheets(); s.render();
  s.click('Hide graph');
  s.ok(ST().blocks[0].graphLazy, 'hidden again');
  s.click('~Gasket compression check on cells 6 to 8', { within: 'card-' + C7 + '-exp_002', tag: 'button' });
  s.eq('card title opens the experiment', sheetKind(), 'etb.exp');
  s.c.closeAllSheets(); s.render();
  s.clean('mini graph');
});

s.step('Inline reading for a single-value key read (Enter, Escape, blur)', () => {
  goExp();
  const lbl = 'Add a reading for Gasket thickness spread';
  s.click(lbl);
  s.ok(krRow(C7, 'exp_002', 'kr_002_3').editing, 'field open');
  s.type(lbl, '9');
  keyIn(lbl, 'Escape');
  s.ok(!krRow(C7, 'exp_002', 'kr_002_3').editing && !treeOf(OBJ, C7).experiments.exp_002.key_read_readings.kr_002_3, 'Escape cancels');
  s.click(lbl);
  s.type(lbl, '0.03 0.015');
  keyIn(lbl, 'Enter');
  s.eq('the last number typed is stored on the experiment', treeOf(OBJ, C7).experiments.exp_002.key_read_readings.kr_002_3, [0.015]);
  s.ok(hasToast('1 reading recorded. The step stays in progress until you conclude it.'), 'toast');
  s.eq('cell shows it', krRow(C7, 'exp_002', 'kr_002_3').val, '0.015');
  s.click(lbl);
  s.type(lbl, '0.016');
  blurIn(lbl);
  s.eq('blur commits', treeOf(OBJ, C7).experiments.exp_002.key_read_readings.kr_002_3, [0.015, 0.016]);
  s.eq('container kept', [bagOf(OBJ).schema, bagOf(OBJ).trees.length], [2, 2]);
  s.clean('inline');
});

s.step('Statistical list: add, remove (two clicks), new batch, Escape and outside click close it', () => {
  goExp();
  const name = 'Cell 7 deviation from stack mean';
  const lbl = 'Add a reading for ' + name;
  s.click(lbl, { within: 'card-' + C7 + '-exp_002' });
  let r = krRow(C7, 'exp_002', 'kr_002_2');
  s.ok(r.popOpen, 'list open');
  s.eq('rows', r.pop.rows.map((p) => [p.v, p.tag]), [['12', 'Entered']]);
  s.eq('header', [r.pop.statLbl, r.pop.computed, r.pop.cnt, r.pop.crit], ['average', '12', '1 of 3 reads', '≤ 15 mV']);
  const pop = 'Readings for ' + name;
  s.type('Add readings', '14 13', { within: pop });
  s.click('Add', { within: pop });
  r = krRow(C7, 'exp_002', 'kr_002_2');
  s.eq('three readings', treeOf(OBJ, C7).experiments.exp_002.key_read_readings.kr_002_2, [12, 14, 13]);
  s.eq('complete', [r.pop.cnt, r.sub, r.val], ['3 of 3 reads', 'average, 3 of 3', '13']);
  s.ok(hasToast('2 readings added.'), 'toast');
  s.click('Remove 14', { within: pop });
  s.ok(krRow(C7, 'exp_002', 'kr_002_2').pop.rows[1].rmText === 'Confirm remove', 'armed');
  s.click('Confirm removing 14', { within: pop });
  s.eq('removed', treeOf(OBJ, C7).experiments.exp_002.key_read_readings.kr_002_2, [12, 13]);
  s.ok(hasToast('Reading removed.'), 'remove toast');
  s.click('New batch', { within: pop });
  s.ok(krRow(C7, 'exp_002', 'kr_002_2').pop.batchPending, 'batch pending');
  s.type('Add readings', '11', { within: pop });
  keyIn('Add readings', 'Enter', { within: pop });
  const store = treeOf(OBJ, C7).experiments.exp_002.key_read_readings.kr_002_2;
  s.ok(store.length === 3 && typeof store[2] === 'object' && store[2].v === 11 && /^b/.test(store[2].batch), 'new batch entry stored with its batch id');
  r = krRow(C7, 'exp_002', 'kr_002_2');
  s.eq('only the latest batch counts', [r.val, r.sub, r.pop.rows.filter((p) => p.hasNote).length], ['11', 'average, 1 of 3', 2]);
  s.expect('Earlier batch, not counted');
  keyIn('Add readings', 'Escape', { within: pop });
  s.ok(!krRow(C7, 'exp_002', 'kr_002_2').popOpen, 'Escape closes');
  s.click(lbl, { within: 'card-' + C7 + '-exp_002' });
  s.fire(s.find(pop, { handler: 'onKeyDown' }), 'onKeyDown', { key: 'Escape' });
  s.ok(!krRow(C7, 'exp_002', 'kr_002_2').popOpen, 'Escape on the list closes');
  s.click(lbl, { within: 'card-' + C7 + '-exp_002' });
  s.click('Close menu');
  s.ok(!krRow(C7, 'exp_002', 'kr_002_2').popOpen, 'an outside click closes');
  s.click(lbl, { within: 'card-' + C7 + '-exp_002' });
  s.click('Close readings');
  s.ok(!krRow(C7, 'exp_002', 'kr_002_2').popOpen, 'close button closes');
  s.clean('stat list');
});

s.step('Statistical list on a linked key read posts KPI readings in the current batch', () => {
  goExp();
  const name = 'Cell voltage at 2 A/cm²';
  const lbl = 'Add a reading for ' + name;
  const before = doc().kpiUpdates.filter((u) => u.kpiId === CV).length;
  const curBatch = RD.latestBatchId(RD.readingsFor(CV, em()));
  s.click(lbl, { within: 'card-' + C7 + '-exp_002' });
  const r = krRow(C7, 'exp_002', 'kr_002_1');
  s.eq('imported rows tagged by sample', r.pop.rows.map((p) => p.tag).sort(), ['TS10-B2-C01', 'TS10-B2-C02', 'TS10-B2-C03', 'TS10-B2-C04']);
  s.type('Add readings', '1.84', { within: 'Readings for ' + name });
  s.click('Add', { within: 'Readings for ' + name });
  const ups = doc().kpiUpdates.filter((u) => u.kpiId === CV);
  s.eq('one KPI reading added', ups.length, before + 1);
  const u = ups[ups.length - 1];
  s.eq('reading shape', [u.value, u.note, u.batch || null], [1.84, 'exp EXP-2', curBatch || null]);
  s.eq('now 5 of 10', krRow(C7, 'exp_002', 'kr_002_1').sub, 'average, 5 of 10');
  s.click('Remove 1.84', { within: 'Readings for ' + name });
  s.click('Confirm removing 1.84', { within: 'Readings for ' + name });
  s.eq('KPI reading removed', doc().kpiUpdates.filter((x) => x.kpiId === CV).length, before);
  s.click('Close readings');
  s.clean('linked list');
});

s.step('Conclude… opens the recorder; auto-pick, user choice wins, no duplicate readings', () => {
  goExp();
  const before = doc().kpiUpdates.length;
  s.click('Conclude…', { within: 'card-' + XO + '-exp_002' });
  s.eq('recorder', sheetKind(), 'step.rec');
  let R = ST().rec;
  s.eq('title', [R.title, R.sub], ['Record the outcome', 'EXP-2 Crossover at 30 bar after recalibrating the GC']);
  /* audit A2: a linked key read takes its KPI's name through today's allKpisPool, which includes the spec target this
     KPI is linked to, so it reads "H₂ in O₂" (as in the KPI tables), not the stored "H₂ in O₂ crossover" */
  s.eq('pre-filled', R.krs.map((k) => [k.name, k.v, k.crit]), [['H₂ in O₂', '0.62', 'Target ≤ 1 %'], ['Crossover after a 100 h hold', '0.74', 'Target ≤ 1 %']]);
  s.eq('verdict', R.concl.head, 'Matched: Margin holds');
  s.eq('auto-picked the match', R.results.filter((x) => x.on).map((x) => x.id), ['res_002a']);
  s.eq('choices', R.results.map((x) => [x.label, x.mark]), [['Margin holds', 'Matches'], ['Margin erodes over the hold', 'Ruled out'], ['Over the limit when fresh', 'Ruled out'], ['Unanticipated: no defined result fits', ''], ['Inconclusive: the data could not decide', '']]);
  s.eq('date defaults to today', R.date, '2026-10-13');
  s.check('~Margin erodes over the hold', true, { within: 'rp-res_002b' });
  s.type('Measured Crossover after a 100 h hold', '0.7');
  R = ST().rec;
  s.eq('the user’s choice is kept', R.results.filter((x) => x.on).map((x) => x.id), ['res_002b']);
  s.check('~Margin holds', true, { within: 'rp-res_002a' });
  s.type('Measured Crossover after a 100 h hold', '');
  R = ST().rec;
  s.eq('incomplete: verdict trends, Record still needs a choice', [R.concl.head.indexOf('Trending toward') === 0 || R.concl.head.indexOf('results still possible') > 0 || R.concl.head.indexOf('Enter measured') === 0, R.recordOff], [true, false]);
  s.type('Measured Crossover after a 100 h hold', '0.74');
  s.type('Recorded date', '2026-10-12');
  s.click('Record outcome');
  const t = treeOf(OBJ, XO), e = t.experiments.exp_002;
  s.eq('outcome stored', [e.status, e.actual_outcome.result_id, e.actual_outcome.recorded_date], ['complete', 'res_002a', '2026-10-12']);
  s.eq('raw values stored', e.actual_outcome.key_read_values, { kr_002_1: 0.62, kr_002_2: 0.74 });
  s.eq('recorded by the signed-in person until a name is set', e.actual_outcome.recorded_by, s.c.D.me.name);
  s.eq('nothing re-posted (values unchanged)', doc().kpiUpdates.length, before);
  s.ok(hasToast('Outcome recorded.'), 'toast');
  s.eq('container kept, both trees', bagOf(OBJ).trees.map((x) => x.tid), [C7, XO]);
  s.eq('tree 2 has no current step left', card(XO, 'exp_003'), null);
  s.clean('recorder');
});

s.step('Recorder posts only new linked values; Unanticipated when nothing matches; recorded by', () => {
  fresh(); goExp();
  s.click('Logic tree settings');
  s.type('~Your name (for the audit log)', 'Toru Hayashi');
  s.click('Save name');
  s.ok(hasToast('Name saved. It is used for “recorded by” and the audit log.'), 'name saved');
  const before = doc().kpiUpdates.filter((u) => u.kpiId === XKPI).length;
  s.click('Conclude…', { within: 'card-' + XO + '-exp_002' });
  s.type('Measured H₂ in O₂', '1.4');   /* the KPI's resolved name (audit A2) */
  let R = ST().rec;
  s.eq('nothing matches: Unanticipated is picked', [R.concl.head, R.results.filter((x) => x.on).map((x) => x.id)], ['Matched: Over the limit when fresh', ['res_002c']]);
  s.type('Measured Crossover after a 100 h hold', '0.74');
  s.check('~Unanticipated', true, { within: 'rp-other' });
  s.click('Record outcome');
  const e = treeOf(OBJ, XO).experiments.exp_002;
  s.eq('sentinel outcome recorded by the editor', [e.actual_outcome.result_id, e.actual_outcome.recorded_by], ['other', 'Toru Hayashi']);
  const ups = doc().kpiUpdates.filter((u) => u.kpiId === XKPI);
  s.eq('one new KPI reading', [ups.length, ups[ups.length - 1].value, ups[ups.length - 1].note], [before + 1, 1.4, 'exp EXP-2']);
  s.ok(hasToast('Outcome recorded. 1 KPI reading posted to the objective.'), 'toast with count');
  s.clean('recorder posts');
});

s.step('Recorder: Cancel and Close keep everything; no key reads and no results', () => {
  fresh(); goExp();
  s.click('Conclude…', { within: 'card-' + XO + '-exp_002' });
  s.click('Cancel');
  s.eq('cancelled', [sheetKind(), treeOf(OBJ, XO).experiments.exp_002.actual_outcome], ['', null]);
  s.click('Conclude…', { within: 'card-' + XO + '-exp_002' });
  s.click('Close');
  s.eq('closed', sheetKind(), '');
  s.c.openSheet('step.rec', { tid: XO, expId: 'nope' }, {}); s.render();
  s.expect('This experiment no longer exists.');
  s.c.closeAllSheets(); s.render();
  s.clean('recorder cancel');
});

s.step('Connect data from the recorder: the recorder stays open and takes the imported value', () => {
  fresh(); goExp();
  s.click('Conclude…', { within: 'card-' + XO + '-exp_002' });
  s.click('Connect data', { within: 'Editor' });
  s.flush(1000);
  s.eq('pushed over the recorder', s.c.state.sheets.map((x) => x.kind), ['step.rec', 'kpi.connect']);
  const cd = s.vals.kpi.cd;
  const smp = cd.samples[0]; smp.toggle(); s.flush(0);
  const row = s.vals.kpi.cd.samples[0].unitList[0].rows[0];
  row.toggle({ target: { checked: true } }); s.flush(0);
  const row2 = s.vals.kpi.cd.samples[0].unitList[0].rows[0];
  row2.onTarget({ target: { value: 'kr_002_2' } }); s.flush(0);
  s.click(s.vals.kpi.cd.applyLabel);
  const ex = treeOf(OBJ, XO).experiments.exp_002;
  const v = ex.key_read_readings.kr_002_2;
  s.eq('a single-valued key read keeps one reading', v.length, 1);
  s.eq('back on the recorder', sheetKind(), 'step.rec');
  s.eq('the recorder shows the imported value', ST().rec.krs[1].v, String(v[0].v));
  s.click('Cancel');
  s.clean('recorder connect');
});

s.step('Connect data for an experiment (KPI sheet in record mode): remove and re-target', () => {
  fresh(); goExp();
  const before = doc().kpiUpdates.filter((u) => u.kpiId === CV && u.src).length;
  s.click('Connect data', { within: 'card-' + C7 + '-exp_002' });
  s.flush(1000);
  s.eq('KPI connect sheet', [sheetKind(), s.c.sheet().data.title, s.c.sheet().data.label], ['kpi.connect', 'Connect data: fill key reads', 'EXP-2 Gasket compression check on cells 6 to 8']);
  s.expect('Currently connected');
  s.check('~TS10-B2-C04', false, { within: 'Currently connected' });
  s.click('Apply changes');
  s.eq('reading removed from the KPI', doc().kpiUpdates.filter((u) => u.kpiId === CV && u.src).length, before - 1);
  s.eq('cell now from 3 samples', krRow(C7, 'exp_002', 'kr_002_1').chip, 'From 3 samples');
  s.eq('container kept', bagOf(OBJ).trees.length, 2);
  s.clean('connect linked');
});

s.step('Connect data from the recorder refreshes its values; unlinked imports are stored on the experiment', () => {
  fresh();
  openObj('DIV-FC', 'OBJ-FC-2026Q4-02');
  goExp();
  const T = 't_main';
  s.eq('a legacy single tree is read as one tree', [ST().trees.map((t) => t.name), ST().hasTrees], [['Main'], true]);
  const c = card(T, 'exp_002');
  s.eq('imported unlinked readings', [krRow(T, 'exp_002', 'kr_002_1').val, krRow(T, 'exp_002', 'kr_002_1').sub, krRow(T, 'exp_002', 'kr_002_1').chip], ['30.5', 'average, 2 of 3', 'From 2 samples']);
  s.ok(c.concludeOff, 'not ready');
  s.click('Connect data', { within: 'card-' + T + '-exp_002' });
  s.flush(1000);
  s.expect('Currently connected');
  s.check('~HP6-AST-02', false, { within: 'Currently connected' });
  s.click('Apply changes');
  const ex = treeOf('OBJ-FC-2026Q4-02', 't_main').experiments.exp_002;
  s.eq('removed from the experiment', ex.key_read_readings.kr_002_1.map((x) => x.v), [31.2]);
  s.eq('a legacy tree is written back as a container', [bagOf('OBJ-FC-2026Q4-02').schema, bagOf('OBJ-FC-2026Q4-02').trees.length, bagOf('OBJ-FC-2026Q4-02').trees[0].tid], [2, 1, 't_main']);
  s.ok(hasToast('1 removed.'), 'toast');
  /* import the third cell's 30k ECSA into the unlinked statistical key read (the KPI sheet, driven by its view model) */
  s.click('Connect data', { within: 'card-' + T + '-exp_002' });
  s.flush(1000);
  s.vals.kpi.cd.onName({ target: { value: 'HP6-AST-03' } }); s.flush(0);
  const smp = s.vals.kpi.cd.samples.find((x) => x.name === 'HP6-AST-03');
  s.ok(!!smp, 'HP6-AST-03 offered');
  smp.toggle(); s.flush(0);
  const u30 = s.vals.kpi.cd.samples.find((x) => x.name === 'HP6-AST-03').unitList.find((u) => /30k/.test(u.run + ' ' + u.cond) && /ecsa/i.test(u.analysis));
  const rowv = u30 && u30.rows.find((r) => r.key === 'Average ECSA');
  s.ok(!!rowv, 'its 30k ECSA value');
  rowv.toggle({ target: { checked: true } }); s.flush(0);
  s.click(s.vals.kpi.cd.applyLabel);
  const ex2 = treeOf('OBJ-FC-2026Q4-02', 't_main').experiments.exp_002;
  const last = ex2.key_read_readings.kr_002_1[ex2.key_read_readings.kr_002_1.length - 1];
  s.ok(last && last.v === 33.9 && last.src && last.src.sample === 'HP6-AST-03' && last.src.portal === 'analysis' && /^b/.test(last.batch || ''), 'stored on the experiment with its source and batch');
  s.ok(hasToast('1 reading added.'), 'import toast');
  s.eq('cell value follows the latest batch', krRow(T, 'exp_002', 'kr_002_1').sub, 'average, 1 of 3');
  s.clean('connect unlinked');
});

s.step('Logic-tree manager: rename, reorder, open, delete with impact; New tree', () => {
  fresh(); goExp();
  s.click('Manage trees');
  s.eq('manager', sheetKind(), 'step.trees');
  let M = ST().mgr;
  s.eq('rows', M.rows.map((r) => [r.name, r.meta, r.isActive, r.canDel]), [['Cell 7 voltage outlier', '4 experiments, 0–2 next steps', true, true], ['Crossover margin at 30 bar', '3 experiments, 0–1 next steps', false, true]]);
  s.eq('footer', M.count, '2 trees, 7 experiments');
  s.type('Tree name', 'Crossover margin', { nth: 1 });
  keyIn('Tree name', 'Enter', { nth: 1 });
  s.eq('renamed in its slot', bagOf(OBJ).trees.map((t) => t.name), ['Cell 7 voltage outlier', 'Crossover margin']);
  s.ok(hasToast('Logic tree renamed.'), 'rename toast');
  s.type('Tree name', '  ', { nth: 0 });
  blurIn('Tree name', { nth: 0 });
  s.eq('blank name kept the old one', bagOf(OBJ).trees[0].name, 'Cell 7 voltage outlier');
  s.type('Tree name', 'zz', { nth: 0 });
  keyIn('Tree name', 'Escape', { nth: 0 });
  s.eq('Escape drops the typing, manager stays', [bagOf(OBJ).trees[0].name, sheetKind()], ['Cell 7 voltage outlier', 'step.trees']);
  s.click('Move Crossover margin up');
  s.eq('reordered', bagOf(OBJ).trees.map((t) => t.tid), [XO, C7]);
  s.click('Move Crossover margin down');
  s.eq('back', bagOf(OBJ).trees.map((t) => t.tid), [C7, XO]);
  s.click('Open');
  s.eq('made active', bagOf(OBJ).activeTid, XO);
  s.click('Delete', { nth: 1 });
  s.expect('Its 3 experiments are deleted with it.');
  s.expect('1 KPI reading on the KPIs it links to stay where they are');
  s.click('Delete tree');
  s.eq('deleted, active falls back', [bagOf(OBJ).trees.map((t) => t.tid), bagOf(OBJ).activeTid], [[C7], C7]);
  M = ST().mgr;
  s.eq('the last tree cannot be deleted', M.rows[0].canDel, false);
  s.click('Done');
  s.eq('closed', sheetKind(), '');
  s.click('Manage trees'); s.click('Close');
  s.eq('close button', sheetKind(), '');
  s.click('New tree');
  s.type('Name', 'Membrane crossover');
  s.click('Create tree');
  s.eq('created and active', [bagOf(OBJ).trees.map((t) => t.name), bagOf(OBJ).activeTid === bagOf(OBJ).trees[1].tid], [['Cell 7 voltage outlier', 'Membrane crossover'], true]);
  s.ok(hasToast('Logic tree created.'), 'create toast');
  s.eq('a new tree is empty', Object.keys(bagOf(OBJ).trees[1].experiments), []);
  s.eq('its block says so', ST().blocks[1].emptyText, 'No current experiment on this tree. Conclude the prior step, or add experiments below.');
  s.click('~Cell 7 voltage outlier', { within: 'Logic trees', tag: 'button' });
  s.eq('header switches the active tree', bagOf(OBJ).activeTid, C7);
  s.clean('manager');
});

s.step('New tree is offered with no tree at all; the first edit creates the container', () => {
  fresh();
  openObj('DIV-EL', 'OBJ-EL-2026Q4-02');
  goExp();
  s.ok(!bagOf('OBJ-EL-2026Q4-02'), 'no tree stored');
  s.ok(s.has('New tree'), 'New tree visible');
  s.eq('empty states', [ST().blocks[0].emptyText, EV().ol.empty, EV().g.empty], ['No current experiment on the active branch. Conclude the prior step, or add experiments below.', true, true]);
  s.click('Add experiment');
  const b = bagOf('OBJ-EL-2026Q4-02');
  s.eq('container with Main', [b.schema, b.trees.length, b.trees[0].tid, b.trees[0].name], [2, 1, 't_main', 'Main']);
  const t = b.trees[0];
  s.eq('first experiment is the root', [t.root_experiment_id, t.experiments.exp_001.code, t.experiments.exp_001.name], ['exp_001', 'EXP-1', 'New experiment']);
  s.eq('editor opened', [sheetKind(), s.c.sheet().data.expId], ['etb.exp', 'exp_001']);
  s.clean('first tree');
});

s.step('Editor views: status line, Outline, Graph, Waterfall, JSON, Tests', () => {
  fresh(); goExp();
  const st = EV().st;
  s.eq('status line', [st.title, st.count, st.reach, st.outcome, st.issues], ['Cell 7 voltage outlier', '4 experiments', '2 active, 2 pending, 0 not pursued', 'Plan in progress', 'No errors, 3 warnings']);
  s.click('~3 warnings: view');
  s.eq('issues sheet', sheetKind(), 'etb.issues');
  s.ok(EV().iss.groups.length === 1 && EV().iss.groups[0].rows.every((r) => r.rule === 'Rule 6'), 'three rule-6 warnings');
  s.click('Open EXP-1·R1', { nth: 0 });
  s.eq('issue opens the editor', [sheetKind(), s.c.sheet().data.expId], ['etb.exp', 'exp_004']);
  s.c.closeAllSheets(); s.render();
  s.click('~3 warnings: view');
  s.click('Close');
  /* Outline */
  s.click('Outline');
  const ol = EV().ol;
  s.eq('decision history', ol.story.map((x) => [x.code, x.result]), [['EXP-1', 'Outlier confirmed'], ['EXP-2', 'Awaiting result']]);
  s.eq('accomplishments', ol.accSum, '0 cleared, 2 would clear');
  s.click('~Stage-gate accomplishments');
  s.ok(EV().ol.accOpen, 'accomplishments open');
  s.expect('Would be cleared by EXP-2, Compression was the cause');
  s.ok(ol.items.some((i) => i.isNode && i.code === 'EXP-1·R1' && i.repeatOf === 'Repeat of EXP-1'), 'repeat tag');
  s.ok(ol.items.some((i) => i.isResult && i.label === 'Voltage tap fault' && i.crit[0].text === 'Cell 7 deviation from stack mean > 80 mV'), 'manual criterion text');
  s.click('~EXP-1 Outlier confirmed', { within: 'Decision history' });
  s.eq('a concluded step opens read-only', sheetKind(), 'etb.detail');
  s.c.closeAllSheets(); s.render();
  s.click('~EXP-3', { within: 'ol-exp_003' });
  s.eq('a planned step opens the editor', sheetKind(), 'etb.exp');
  s.c.closeAllSheets(); s.render();
  /* Graph */
  s.click('Graph');
  const z0 = EV().g.zoomText;
  s.click('Zoom in');
  s.ok(EV().g.zoomText !== z0, 'zoomed in');
  s.click('Zoom out'); s.click('Zoom out');
  s.click('Fit');
  s.eq('fit restores', EV().g.zoomText, z0);
  const nodeLbl = '~EXP-3 Swap the cell 7 MEA and retest';
  const n = s.find(nodeLbl, { handler: 'onPointerDown', tag: 'button' });
  s.fire(n, 'onPointerDown', { clientX: 100, clientY: 100 });
  s.fire(s.find(nodeLbl, { handler: 'onPointerMove', tag: 'button' }), 'onPointerMove', { clientX: 160, clientY: 130 });
  s.fire(s.find(nodeLbl, { handler: 'onPointerUp', tag: 'button' }), 'onPointerUp', { clientX: 160, clientY: 130 });
  s.ok(Object.keys(s.c.state.etb_off[OBJ + '|' + C7] || {}).includes('exp_003'), 'dragged node keeps its offset');
  s.click(nodeLbl);
  s.eq('the click that ends a drag does not open', sheetKind(), '');
  s.click('Re-layout');
  s.ok(!s.c.state.etb_off[OBJ + '|' + C7], 're-layout clears the offsets');
  s.click(nodeLbl);
  s.eq('a click opens it', [sheetKind(), s.c.sheet().data.expId], ['etb.exp', 'exp_003']);
  s.c.closeAllSheets(); s.render();
  s.click('Result Compression was the cause, clears a stage-gate');
  const ex = EV().exp;
  s.eq('a result label opens that one result', [ex.only, ex.title, ex.results.length], [true, 'Result: Compression was the cause', 1]);
  s.click('Open the whole experiment');
  s.eq('whole experiment', [EV().exp.only, EV().exp.results.length], [false, 3]);
  s.c.setSheetData({ only: 'res_002a' }); s.render();
  s.click('Done');
  s.eq('done closes', sheetKind(), '');
  /* Waterfall */
  s.click('Waterfall');
  const wf = EV().wf;
  s.ok(wf.rows.filter((r) => r.isExp).length === 4 && wf.rows.some((r) => r.isTerm), 'bars and terminal pills');
  s.ok(wf.rows.some((r) => r.isExp && r.dates === 'Projected'), 'projected bars');
  s.click('~Open EXP-2 Gasket');
  s.eq('a bar opens the editor', [sheetKind(), s.c.sheet().data.expId], ['etb.exp', 'exp_002']);
  s.c.closeAllSheets(); s.render();
  s.fire(s.find('~Open EXP-3', { handler: 'onKeyDown' }), 'onKeyDown', { key: 'Enter' });
  s.eq('Enter on a bar opens it', s.c.sheet().data.expId, 'exp_003');
  s.c.closeAllSheets(); s.render();
  /* JSON */
  s.click('JSON');
  s.ok(EV().js.text.indexOf('"tree_id": "tree_el_cell7_2026"') > 0, 'raw model shown');
  s.type('Raw model', '{ bad');
  s.click('Format');
  s.ok(/^Invalid JSON: /.test(EV().js.msg), 'format reports invalid JSON');
  s.click('Validate');
  s.ok(/^JSON parse error: /.test(EV().js.issues[0].text), 'validate reports the parse error');
  s.click('Apply changes');
  s.ok(/^JSON parse error: /.test(EV().js.issues[0].text), 'apply refuses');
  s.type('Raw model', '{"title":"x"}');
  s.click('Apply changes');
  s.eq('apply needs an experiments map', EV().js.issues[0].text, 'The document must be an object with an “experiments” map.');
  s.click('Revert');
  s.click('Format');
  s.eq('formatted', EV().js.msg, 'Formatted.');
  s.click('Validate');
  s.eq('validate lists the rule numbers', EV().js.issues.map((i) => i.text.slice(0, 7)), ['Rule 6:', 'Rule 6:', 'Rule 6:']);
  const v = JSON.parse(EV().js.text); v.title = 'Cell 7 outlier hunt'; v.tid = 'hijack'; v.name = 'Cell 7 outlier hunt';
  s.type('Raw model', JSON.stringify(v));
  s.click('Apply changes');
  const b = bagOf(OBJ);
  s.eq('applied in its own slot, tid kept', [b.trees.length, b.trees[0].tid, b.trees[0].title, b.trees[1].tid], [2, C7, 'Cell 7 outlier hunt', XO]);
  s.ok(hasToast('Logic tree JSON applied.'), 'apply toast');
  s.click('Copy JSON');
  s.ok(hasToast('Logic tree JSON copied to the clipboard.'), 'copy toast');
  { const real = global.window.navigator.clipboard.writeText; global.window.navigator.clipboard.writeText = () => ({ then(ok, no) { if (no) no(new Error('Write permission denied.')); return this; } });
    s.click('Copy JSON');
    s.ok(hasToast('Copy didn’t work here. Select the text and copy it instead.'), 'a refused copy says so');
    global.window.navigator.clipboard.writeText = real; }
  /* Tests */
  s.click('Tests');
  s.click('Run tests');
  s.eq('all 91 tests pass', EV().ts.summary, '91 of 91 passed');
  s.clean('views');
});

s.step('Toolbar: Add experiment, Reload, Save keep every tree (today’s Save dropped the others)', () => {
  fresh(); goExp();
  s.click('Add experiment');
  const t = treeOf(OBJ, C7);
  s.eq('new experiment', [t.experiments.exp_005.code, t.experiments.exp_005.name, sheetKind()], ['EXP-5', 'New experiment', 'etb.exp']);
  s.ok(hasToast('Experiment added.'), 'toast');
  s.c.closeAllSheets(); s.render();
  s.click('Save', { within: 'Experiment logic tree' });
  s.ok(toasts().some((x) => /^Saved at \d/.test(x)), 'saved');
  s.eq('both trees still there', bagOf(OBJ).trees.map((x) => x.tid), [C7, XO]);
  s.ok(/Stored in EXEC-DIV-EL, saved /.test(EV().st.stored), 'status line says where and when');
  s.click('Reload');
  s.ok(hasToast(/^Loaded at .* for OBJ-EL-2026Q4-01\.$/), 'reload toast');
  s.ok(/, loaded /.test(EV().st.stored), 'loaded time');
  s.c.setState({ sim: Object.assign({}, s.c.state.sim, { offline: true }) }); s.render();
  s.click('Save', { within: 'Experiment logic tree' });
  s.ok(hasToast('You are offline. Changes stay here and save when the connection returns.'), 'offline save');
  s.c.setState({ sim: Object.assign({}, s.c.state.sim, { offline: false }) }); s.render();
  s.clean('toolbar');
});

s.step('Editor: fields, key reads, KPI picker, pass conditions incl. between, statistic', () => {
  fresh(); goExp();
  s.click('~EXP-3 Swap the cell 7 MEA and retest');
  const live = () => treeOf(OBJ, C7).experiments.exp_003;
  field('Code', 'EXP-3c');
  s.type('Code', 'EXP-3b'); blurIn('Code');
  s.eq('code (Enter, then blur)', live().code, 'EXP-3b');
  s.type('Name', 'Swap the MEA'); blurIn('Name');
  s.eq('name on blur', live().name, 'Swap the MEA');
  s.type('Name', 'zzz'); keyIn('Name', 'Escape');
  s.eq('Escape drops the typing', [live().name, sheetKind()], ['Swap the MEA', '']);
  s.click('~EXP-3b Swap the MEA', { within: 'Logic tree graph' });
  s.type('~Hypothesis', 'New hypothesis'); keyIn('~Hypothesis', 'Enter');
  s.eq('Enter does not commit a multi-line field', live().hypothesis, 'A replacement MEA from a different lot brings cell 7 within 15 mV of the mean.');
  blurIn('~Hypothesis');
  s.type('~Toggle', 'MEA lot 2611'); keyIn('~Toggle', 'Enter');
  s.type('~Toggle', 'MEA lot 2611'); blurIn('~Toggle');
  s.type('~Experiment', 'Swap and rerun'); keyIn('~Experiment', 'Enter'); blurIn('~Experiment');
  s.eq('text fields', [live().hypothesis, live().toggle, live().test], ['New hypothesis', 'MEA lot 2611', 'Swap and rerun']);
  s.type('Status', 'in_progress');
  s.eq('status', live().status, 'in_progress');
  /* key reads */
  s.click('Add key read');
  const kid = live().key_reads[2].id;
  s.type('Key read', 'Cell 7 HFR', { nth: 2 }); keyIn('Key read', 'Enter', { nth: 2 });
  s.type('Key read', 'Cell 7 HFR', { nth: 2 }); blurIn('Key read', { nth: 2 });
  s.type('Unit', 'mΩ', { nth: 2 }); blurIn('Unit', { nth: 2 });
  s.type('Unit', 'mΩ', { nth: 2 }); keyIn('Unit', 'Enter', { nth: 2 });
  s.eq('custom key read', [live().key_reads[2].name, live().key_reads[2].unit], ['Cell 7 HFR', 'mΩ']);
  s.type('Pass condition', 'range', { nth: 2 });
  s.type('Critical value', '41', { nth: 2 }); blurIn('Critical value', { nth: 2 });
  s.type('Critical value', '40', { nth: 2 }); keyIn('Critical value', 'Enter', { nth: 2 });
  s.type('High bound', '55', { nth: 1 }); keyIn('High bound', 'Enter', { nth: 1 });
  s.eq('between', [live().key_reads[2].direction, live().key_reads[2].critical_value, live().key_reads[2].critical_value_hi], ['range', '40', '55']);
  s.type('High bound', '56', { nth: 1 }); blurIn('High bound', { nth: 1 });
  s.eq('high bound on blur', live().key_reads[2].critical_value_hi, '56');
  s.type('Statistic', 'median', { nth: 2 });
  s.type('Expected reads', '4'); keyIn('Expected reads', 'Enter');
  s.eq('statistic', [live().key_reads[2].statistic, live().key_reads[2].readCount], ['median', 4]);
  s.type('Expected reads', 'x'); blurIn('Expected reads');
  s.eq('a bad count clears it', live().key_reads[2].readCount, null);
  s.click('Remove key read', { nth: 2 });
  s.click('Remove key read', { within: 'Remove the key read “Cell 7 HFR”?' });
  s.ok(!live().key_reads.some((k) => k.id === kid), 'removed after confirming');
  s.click('Link a KPI');
  const P = EV().exp.pick;
  s.eq('picker opens inside the editor', [EV().exp.pickOpen, sheetKind(), P.groups.map((g) => g.label)], [true, 'etb.exp', ['Key results', 'Stage-gates']]);
  s.eq('rows follow the KPI', [P.groups[0].rows[0].name, P.groups[0].rows[0].unit, P.groups[0].rows[0].label.slice(0, 14)], ['Cell voltage at 2 A/cm²', '(V)', 'Key result 1: ']);
  s.click('Cancel', { within: 'Link a key read to a KPI' });
  s.ok(!EV().exp.pickOpen, 'Cancel closes it');
  s.click('Link a KPI');
  s.click('~Cell voltage at 2 A/cm²', { tag: 'button', within: 'Link a key read to a KPI' });
  const lk = live().key_reads[live().key_reads.length - 1];
  s.eq('linked key read', [lk.source_kpi_gid, lk.name, lk.unit, sheetKind(), EV().exp.pickOpen], [CV, 'Cell voltage at 2 A/cm²', 'V', 'etb.exp', false]);
  s.ok(hasToast('Key read linked to Cell voltage at 2 A/cm².'), 'toast');
  s.ok(EV().exp.krs.some((k) => k.linked && k.tag === 'Linked to KR1' && k.statRo), 'linked tag, statistic inherited');
  s.clean('editor fields');
});

s.step('Editor: results, criteria, conclusion amend with reason, gate flags, leads to', () => {
  fresh(); goExp();
  s.click('~EXP-2 Gasket compression check on cells 6 to 8', { within: 'Logic tree graph' });
  const live = () => treeOf(OBJ, C7).experiments.exp_002;
  const R = (id) => live().possible_results.find((r) => r.id === id);
  s.type('Result', 'Compression fixed it', { nth: 0 }); blurIn('Result', { nth: 0 });
  s.type('Result', 'Compression caused it', { nth: 0 }); keyIn('Result', 'Enter', { nth: 0 });
  s.eq('label', R('res_002a').label, 'Compression caused it');
  s.type('Hit or miss', 'miss', { nth: 0 });
  s.eq('hit/miss set', R('res_002a').criteria.find((c) => c.key_read_id === 'kr_002_1').status, 'miss');
  s.type('Hit or miss', '', { nth: 0 });
  s.ok(!R('res_002a').criteria.some((c) => c.key_read_id === 'kr_002_1'), 'not used clears it');
  s.click('Add criterion', { nth: 0 });
  s.type('Criterion key read', 'kr_002_1', { nth: 0 });
  s.type('Comparison', '<=', { nth: 0 });
  s.type('Criterion value', '1.8', { nth: 0 }); keyIn('Criterion value', 'Enter', { nth: 0 });
  const mc = R('res_002a').criteria.find((c) => c.op);
  s.eq('manual criterion', [mc.key_read_id, mc.op, mc.value], ['kr_002_1', '<=', '1.8']);
  s.type('Criterion value', '1.81', { nth: 0 }); blurIn('Criterion value', { nth: 0 });
  s.click('Remove criterion', { nth: 0 });
  s.ok(!R('res_002a').criteria.some((c) => c.op), 'manual criterion removed');
  s.type('Conclusion', 'Lock the gasket tolerance.', { nth: 0 }); keyIn('Conclusion', 'Enter', { nth: 0 }); blurIn('Conclusion', { nth: 0 });
  s.eq('conclusion (not complete yet)', R('res_002a').conclusion, 'Lock the gasket tolerance.');
  s.type('Stage-gate this result clears', 'SG-EL-2026Q4-01-1', { nth: 0 });
  s.eq('gate flag picked', [R('res_002a').accomplishments[0].gate_id, R('res_002a').accomplishments[0].label.length > 0], ['SG-EL-2026Q4-01-1', true]);
  const gopts = EV().exp.results[0].acc[0].sel.opts;
  s.ok(gopts.length > 2 && gopts.slice(1).every((o) => /^SG-[A-Z]\d+ /.test(o.label)), 'gates numbered SG-A1 like the Stage-gates tab');
  s.expect('Was “SG-2: uniformity proven”. Pick the matching stage-gate to link it.');
  s.click('Add stage-gate', { nth: 0 });
  s.eq('gate flag added', R('res_002a').accomplishments.length, 2);
  s.click('Remove stage-gate flag', { nth: 1 });
  s.eq('gate flag removed', R('res_002a').accomplishments.length, 1);
  s.type('Leads to', 'term:halt', { nth: 0 });
  s.eq('terminal', R('res_002a').terminal.type, 'halt');
  s.type('Leads to', 'exp:exp_003', { nth: 0 });
  s.eq('go to', [R('res_002a').next_experiment_ids, R('res_002a').terminal], [['exp_003'], null]);
  s.click('Open EXP-3', { nth: 0 });
  s.eq('open the next one', s.c.sheet().data.expId, 'exp_003');
  s.c.closeAllSheets(); s.render();
  s.click('~EXP-2 Gasket compression check on cells 6 to 8', { within: 'Logic tree graph' });
  s.type('Leads to', 'new', { nth: 2 });
  s.ok(R('res_002c').next_experiment_ids[0] === 'exp_005' && hasToast('Created EXP-5 and linked it.'), 'create a new next experiment');
  s.type('Leads to', 'repeat', { nth: 2 });
  const rep = treeOf(OBJ, C7).experiments[R('res_002c').next_experiment_ids[0]];
  s.eq('repeat as next', [rep.repeat_of, rep.code], ['exp_002', 'EXP-2·R1']);
  s.type('Leads to', 'none', { nth: 2 });
  s.eq('no next step', [R('res_002c').next_experiment_ids, R('res_002c').terminal], [[], null]);
  s.click('Add result');
  s.eq('result added', live().possible_results.length, 4);
  s.click('Remove result', { nth: 3 });
  s.click('Remove result', { within: 'Remove the result “New result”?' });
  s.eq('result removed', live().possible_results.length, 3);
  /* observed radio, then amend once complete */
  s.check('Mark as the observed result', true, { nth: 1 });
  s.eq('observed', live().actual_outcome.result_id, 'res_002b');
  s.type('Status', 'complete');
  s.click('Amend', { nth: 1 });
  s.type('Conclusion (amending)', 'The MEA is off; compression is fine.');
  s.click('Save amendment');
  s.expect('A reason is required.');
  s.type('Reason for the amendment', 'Gasket survey showed matched sets.');
  s.click('Save amendment');
  const au = live().audit_log[live().audit_log.length - 1];
  s.eq('amended with reason', [R('res_002b').conclusion, au.reason, au.field], ['The MEA is off; compression is fine.', 'Gasket survey showed matched sets.', 'possible_results.res_002b.conclusion']);
  s.click('Amend', { nth: 1 });
  s.type('Reason for the amendment', 'x');
  s.click('Cancel', { within: 'res-res_002b' });
  s.eq('cancel keeps it', R('res_002b').conclusion, 'The MEA is off; compression is fine.');
  s.ok(EV().exp.hasAudit && EV().exp.audit.some((a) => a.reason === 'Reason: Gasket survey showed matched sets.'), 'audit log listed');
  s.clean('results');
});

s.step('Editor: unanticipated outcomes, clear observed, notes, raw JSON, delete', () => {
  fresh(); goExp();
  s.click('~EXP-3 Swap the cell 7 MEA and retest', { within: 'Logic tree graph' });
  const live = () => treeOf(OBJ, C7).experiments.exp_003;
  s.check('Inconclusive', true);
  s.eq('sentinel', live().actual_outcome.result_id, 'inconclusive');
  s.type('What happened (note)', 'Rig tripped'); blurIn('What happened (note)');
  s.type('Conclusion', 'Rerun after the rig check', { within: 'sent-inconclusive' }); blurIn('Conclusion', { within: 'sent-inconclusive' });
  s.type('Leads to', 'term:conduct_fmea', { within: 'sent-inconclusive' });
  s.eq('sentinel fields', [live().actual_outcome.note, live().actual_outcome.conclusion, live().actual_outcome.terminal.type], ['Rig tripped', 'Rerun after the rig check', 'conduct_fmea']);
  s.type('Leads to', 'exp:exp_004', { within: 'sent-inconclusive' });
  s.type('Leads to', 'none', { within: 'sent-inconclusive' });
  s.eq('sentinel leads to none', [live().actual_outcome.next_experiment_ids, live().actual_outcome.terminal], [[], null]);
  s.type('What happened (note)', 'x'); keyIn('What happened (note)', 'Enter');
  s.type('Conclusion', 'y', { within: 'sent-inconclusive' }); keyIn('Conclusion', 'Escape', { within: 'sent-inconclusive' });
  s.click('~EXP-3 Swap the cell 7 MEA and retest', { within: 'Logic tree graph' });
  s.eq('with an outcome it opens read-only', sheetKind(), 'etb.detail');
  s.click('Edit results');
  s.check('Other (unanticipated)', true);
  s.eq('other', live().actual_outcome.result_id, 'other');
  s.click('Clear the recorded outcome');
  s.click('Clear outcome');
  s.eq('cleared', live().actual_outcome, null);
  s.type('Notes', 'Lot 2611 arrives Oct 20.'); blurIn('Notes');
  s.type('Notes', 'Lot 2611 arrives Oct 21.'); keyIn('Notes', 'Enter');
  s.eq('notes', live().notes, 'Lot 2611 arrives Oct 20.');
  s.click('Advanced: edit raw JSON');
  s.type('This experiment as JSON', '{ nope');
  s.click('Apply', { within: 'Editor' });
  s.ok(/^Parse error: /.test(EV().exp.raw.msg), 'parse error');
  s.type('This experiment as JSON', '[1]');
  s.click('Apply', { within: 'Editor' });
  s.eq('array refused', EV().exp.raw.msg, 'Parse error: the experiment must be a JSON object.');
  const j = JSON.parse(JSON.stringify(live())); j.owner = 'MO'; j.planned_date = '2026-11-02'; j.id = 'other';
  s.type('This experiment as JSON', JSON.stringify(j));
  s.click('Apply', { within: 'Editor' });
  s.eq('raw JSON applied, id kept', [live().owner, live().planned_date, live().id, EV().exp.raw.msg], ['MO', '2026-11-02', 'exp_003', 'Applied.']);
  s.click('Hide raw JSON');
  s.click('Delete experiment');
  s.click('Delete experiment', { within: 'Delete EXP-3?' });
  s.ok(!treeOf(OBJ, C7).experiments.exp_003 && !treeOf(OBJ, C7).experiments.exp_002.possible_results.find((r) => r.id === 'res_002b').next_experiment_ids.length, 'deleted and inbound links cleared');
  s.eq('editor closed', sheetKind(), '');
  s.clean('outcomes');
});

s.step('Repeats: linked fields, overridden marks, re-link one, re-link all, open the source', () => {
  fresh(); goExp();
  s.click('~EXP-1·R1', { within: 'Logic tree graph' });
  const ex = EV().exp;
  s.eq('repeat banner', [ex.isRepeat, ex.repeatText, ex.overrides.map((o) => o.label)], [true, 'Repeat of EXP-1. Linked fields follow the source until you change them here.', ['Experiment']]);
  s.eq('marks', [ex.mk.hypothesis.text, ex.mk.test.text], ['Linked', 'Overridden']);
  s.click('Link Experiment again');
  const live = () => treeOf(OBJ, C7).experiments.exp_004;
  s.eq('re-linked: follows the source', [live().overrides.test, live().test], [undefined, treeOf(OBJ, C7).experiments.exp_001.test]);
  s.type('~Toggle', 'Taps re-seated'); keyIn('~Toggle', 'Enter');
  s.type('~Hypothesis', 'Still an outlier'); blurIn('~Hypothesis');
  s.eq('overridden by editing', [live().overrides.toggle, live().overrides.hypothesis], [true, true]);
  s.click('Link every field again');
  s.eq('all linked again', [live().overrides, live().toggle], [{}, treeOf(OBJ, C7).experiments.exp_001.toggle]);
  s.click('Open the source');
  s.eq('source opened', s.c.sheet().data.expId, 'exp_001');
  s.click('Close');
  s.eq('editor closed', sheetKind(), '');
  s.clean('repeats');
});

s.step('Read-only detail for a concluded step; observed evidence and verdict', () => {
  fresh(); goExp();
  s.click('~EXP-1 Map cell voltages at first light', { within: 'Logic tree graph' });
  s.eq('detail', sheetKind(), 'etb.detail');
  const d = EV().det;
  s.eq('lines', d.lines.map((l) => [l.k, l.v]), [['Observed', 'Outlier confirmed'], ['Recorded', '2026-10-02 by Toru Hayashi'], ['Conclusion', 'Cell 7 is a real outlier. Check compression on cells 6 to 8 first.']]);
  s.eq('next', [d.next.isExp, d.next.code], [true, 'EXP-2']);
  s.expect('Read-only view');
  s.click('Close');
  s.click('~EXP-1 Map cell voltages at first light', { within: 'Logic tree graph' });
  s.click('Edit results');
  const k = EV().exp.krs[0];
  s.eq('observed evidence uses the key read rule', [k.obsText, k.verdict], ['Measured 41 mV', 'Misses target']);
  s.c.closeAllSheets(); s.render();
  s.click('~Crossover margin at 30 bar', { within: 'Logic trees', tag: 'button' });
  s.click('~EXP-1 Crossover at 30 bar, first build', { within: 'Logic tree graph' });
  s.eq('sentinel detail', EV().det.lines.map((l) => l.k + ': ' + l.v), ['Outcome: Inconclusive', 'Note: The gas chromatograph drifted 0.3% during the run.', 'Conclusion: Recalibrate the GC and repeat before deciding.']);
  s.click('Edit results');
  s.ok(EV().exp.sentinels[1].on, 'sentinel on in the editor');
  s.clean('detail');
});

s.step('Settings: Clear all data clears only the open tree and says it saves', () => {
  fresh(); goExp();
  s.click('Logic tree settings');
  s.type('~Your name (for the audit log)', 'TH');
  keyIn('~Your name (for the audit log)', 'Enter');
  s.eq('name kept', s.c.state.etb_editor, 'TH');
  s.click('Logic tree settings');
  s.click('Clear all data');
  s.expect('This is saved right away and cannot be undone. Other logic trees on this objective are kept');
  s.click('Clear all data', { within: 'Clear “Cell 7 voltage outlier”?' });
  const b = bagOf(OBJ);
  s.eq('cleared in place', [b.trees.length, b.trees[0].tid, b.trees[0].name, Object.keys(b.trees[0].experiments).length, Object.keys(b.trees[1].experiments).length], [2, C7, 'Cell 7 voltage outlier', 0, 3]);
  s.ok(hasToast('Cleared. A blank tree is ready.'), 'honest toast');
  s.clean('clear');
});

s.step('Read-only: no Conclude, Connect data, Manage, New tree, Add experiment or Save; cells are plain', () => {
  fresh(); goExp();
  setRo(true);
  goExp();
  ['Conclude…', 'Connect data', 'Manage trees', 'New tree', 'Add experiment', 'Save', 'Apply changes'].forEach((t) => s.ok(!s.has(t, { handler: 'onClick' }), 'hidden: ' + t));
  const r = krRow(C7, 'exp_002', 'kr_002_1');
  s.eq('plain cells', [r.plain, r.clickStat, r.clickOne], [true, false, false]);
  s.click('~Crossover margin at 30 bar', { within: 'Logic trees', tag: 'button' });
  s.eq('switching trees is a view change', bagOf(OBJ).activeTid, XO);
  s.click('~EXP-2 Crossover at 30 bar after', { within: 'Logic tree graph' });
  s.ok(EV().exp.ro && !EV().exp.canEdit, 'editor read-only');
  s.expect('Read-only view. Nothing here can be changed.');
  s.c.closeAllSheets(); s.render();
  s.click('Logic tree settings');
  s.ok(!s.has('Clear all data'), 'no Clear all data');
  s.click('Close');
  const before = JSON.stringify(bagOf(OBJ).trees);
  s.eq('nothing changed', JSON.stringify(bagOf(OBJ).trees), before);
  setRo(false);
  s.clean('read-only');
});

s.step('Search: logic trees, current steps and experiments', () => {
  fresh();
  s.type('Search', 'Gasket');
  const g = s.vals.sh.search.groups;
  const all = [].concat.apply([], g.map((x) => x.items.map((i) => i.label)));
  s.ok(all.some((l) => /EXP-2 Gasket compression check/.test(l)), 'experiment found');
  s.click('~EXP-2 Gasket compression check', { within: 'Search results', nth: 0 });
  s.eq('opened on the Experiments tab', s.c.state.tab, 'exp');
  s.ok(/^etb\./.test(sheetKind()) || sheetKind() === '', 'opened the experiment or the tab');
  s.c.closeAllSheets(); s.render();
  s.type('Search', 'Crossover margin');
  s.ok([].concat.apply([], s.vals.sh.search.groups.map((x) => x.items.map((i) => i.label))).includes('Crossover margin at 30 bar'), 'tree found');
  s.click('~Crossover margin at 30 bar', { within: 'Search results' });
  s.eq('tree opened', bagOf(OBJ).activeTid, XO);
  s.clean('search');
});

}

/* ------------------------------------------------ full screen (October 22) */
s.step('Full screen: the logic tree takes the window and comes back; the graph fits the screen; Escape', () => {
  fresh(); goExp();
  const panel = () => s.find((el) => el.attrs['data-k'] === 'etb');
  const btn = () => s.find((el) => el.attrs['data-k'] === 'etb-full');
  s.eq('in the header, after Settings: an icon', [btn().attrs.class, btn().attrs['aria-label'], btn().attrs.title, textOf(btn()), panel().attrs.class],
    ['btn sm q ic', 'Full screen', 'Full screen', '', 'panel etb']);
  const bar = btn().parent;
  s.eq('the last of the header’s buttons', bar.kids.filter((k) => k.tag === 'button').map((k) => k.attrs['aria-label'] || textOf(k)).slice(-2), ['Logic tree settings', 'Full screen']);
  const g0 = EV().g, z0 = g0.zoomText;
  /* the screen the graph fits to (the Sim has no window size until a test gives it one) */
  global.window.innerWidth = 1600; global.window.innerHeight = 1000;
  try {
    s.render();
    s.eq('not in full screen, the fit is the panel’s', EV().g.zoomText, z0);
    s.click('Full screen');
    s.eq('full screen: the panel covers the window; the button says how to leave', [s.c.state.etb_full, panel().attrs.class, btn().attrs.class, btn().attrs['aria-label'], textOf(btn())],
      [true, 'panel etb etb-full', 'btn sm', 'Exit full screen', 'Exit full screen']);
    const want = Math.round(Math.min(1.25, Math.max(0.2, Math.min((1600 - 64) / g0.W, (1000 - 250) / g0.H))) * 100) + '%';
    s.eq('the graph fits the screen, less the panel’s bars', EV().g.zoomText, want);
    s.ok(want !== z0, 'bigger than in the panel');
    s.eq('nothing saved for it', s.c.state.etb_full && !JSON.stringify(doc()).includes('etb_full'), true);
    /* the views and the experiments work in full screen */
    s.click('Outline');
    s.eq('views switch and the panel stays full screen', [EV().isOutline, panel().attrs.class], [true, 'panel etb etb-full']);
    s.click('Graph');
    const node = s.all((el) => el.tag === 'button' && /\betb-gn\b/.test(el.attrs.class || '') && el.on.onClick)[0];
    s.fire(node, 'onClick');
    s.ok(/^etb\./.test(sheetKind()) && s.c.state.etb_full, 'an experiment opens over it, and full screen stays');
    s.c.closeAllSheets(); s.render();
    /* keys: other keys and an Escape something else took leave it; Escape ends it */
    s.key((el) => el.attrs['data-k'] === 'etb', 'Enter');
    s.fire(panel(), 'onKeyDown', { key: 'Escape', defaultPrevented: true });
    s.eq('other keys, or an Escape already handled, leave it', s.c.state.etb_full, true);
    let taken = 0;
    s.fire(panel(), 'onKeyDown', { key: 'Escape', preventDefault() { taken++; } });
    s.eq('Escape: back in the page; it takes the key', [s.c.state.etb_full, panel().attrs.class, btn().attrs['aria-label'], taken], [false, 'panel etb', 'Full screen', 1]);
    s.eq('the fit is the panel’s again', EV().g.zoomText, z0);
    s.fire(panel(), 'onKeyDown', { key: 'Escape', preventDefault() { taken++; } });
    s.eq('Escape in the page does nothing, and leaves the key to others', [s.c.state.etb_full, taken], [false, 1]);
    /* a zoom you chose is kept */
    s.click('Zoom in');
    const zin = EV().g.zoomText;
    s.click('Full screen');
    s.eq('your zoom stays in full screen', EV().g.zoomText, zin);
    s.click('Exit full screen');
    s.eq('the button ends it', [s.c.state.etb_full, panel().attrs.class], [false, 'panel etb']);
    s.click('Fit');
    /* a small window: never less room than the panel's own */
    global.window.innerWidth = 700; global.window.innerHeight = 600;
    s.click('Full screen');
    s.eq('a small window fits as the panel does', EV().g.zoomText, z0);
    s.click('Exit full screen');
    /* a big screen: no bigger than 125%, as in the panel */
    global.window.innerWidth = 2560; global.window.innerHeight = 1600;
    s.click('Full screen');
    s.eq('a big screen stops at 125%', EV().g.zoomText, '125%');
    s.click('Exit full screen');
  } finally { delete global.window.innerWidth; delete global.window.innerHeight; s.render(); }
  /* read-only: still there (it only changes how the tree is shown) */
  setRo(true); goExp();
  s.click('Full screen');
  s.eq('read-only: full screen too', s.c.state.etb_full, true);
  s.click('Exit full screen');
  setRo(false);
  s.clean('full screen');
});

/* ------------------------------------------------ moving around the graph (October 22) */
s.step('Graph: the wheel zooms around the pointer, dragging the background moves it, as the old graph did', () => {
  fresh(); goExp();
  if (!EV().isGraph) s.click('Graph');
  const wrap = () => s.find((el) => el.attrs['aria-label'] === 'Logic tree graph' && el.on.onPointerDown);
  s.expect('Select an experiment to open its details. Drag one to move it, drag the background to move around, scroll to zoom.');
  /* a stand-in for the graph area: 1000 x 560 at (100, 200), a 1 px border, and the wheel listener it is given */
  const area = () => {
    const el = { clientLeft: 1, clientTop: 1, clientWidth: 998, clientHeight: 558, listeners: [], cls: new Set() };
    el.getBoundingClientRect = () => ({ left: 100, top: 200, right: 1100, bottom: 760, width: 1000, height: 560 });
    el.addEventListener = (type, fn, opts) => el.listeners.push({ type: type, fn: fn, opts: opts });
    el.classList = { add: (c) => el.cls.add(c), remove: (c) => el.cls.delete(c) };
    el.setPointerCapture = () => { el.captured = true; };
    el.releasePointerCapture = () => { el.captured = false; };
    return el;
  };
  const key = s.c._etbG.key;
  const fitZ = s.c._etbG.fitZ;
  const zoom = () => { const z = (s.c.state.etb_zoom || {})[key]; return z == null ? fitZ : z; };
  const shift = () => (s.c.state.etb_pan || {})[key] || { x: 0, y: 0 };
  const under = (cx, cy) => [(cx - shift().x) / zoom(), (cy - shift().y) / zoom()];   // the graph point at (cx, cy) in the area
  const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
  /* the area: as tall as the graph at its fit, so zooming never moves the page */
  const W = EV().g.W, H = EV().g.H;
  s.eq('the area is as tall as the graph at its fit (240 to 560 px)', EV().g.area, 'height:' + Math.round(Math.min(560, Math.max(240, H * fitZ + 2))) + 'px');
  s.eq('the graph drawn at the top left, at its fit', EV().g.canvas, 'width:' + W + 'px;height:' + H + 'px;transform:translate(0.0px,0.0px) scale(' + fitZ.toFixed(3) + ')');
  const canvasEl = () => s.find((el) => /\betb-gcanvas\b/.test(el.attrs.class || ''), { within: 'Logic tree graph' });
  s.eq('drawn so: the area, and the graph in it', [wrap().attrs.style, canvasEl().attrs.style], [EV().g.area, EV().g.canvas]);
  const el = area();
  s.fire(wrap(), 'onMouseEnter', { currentTarget: el });
  s.fire(wrap(), 'onMouseEnter', { currentTarget: el });
  s.eq('the pointer over the graph gives it one wheel listener, one that may stop the page scrolling', el.listeners.map((l) => [l.type, l.opts && l.opts.passive]), [['wheel', false]]);
  const wheel = (ev) => { let stopped = 0; el.listeners[0].fn(Object.assign({ deltaX: 0, deltaY: 0, deltaMode: 0, clientX: 600, clientY: 400, ctrlKey: false, preventDefault() { stopped++; } }, ev)); s.render(); return stopped; };
  /* zoom in at (600, 400): the point under the pointer stays under it */
  const cx = 600 - 100 - 1, cy = 400 - 200 - 1;
  const at0 = under(cx, cy);
  s.eq('a wheel turn in: taken from the page', wheel({ deltaY: -25 }), 1);
  s.ok(Math.abs(zoom() - fitZ * Math.pow(10, 0.1)) < 1e-9, 'zoomed in at the old graph’s rate, ten times for 250 px (' + Math.round(fitZ * 100) + '% to ' + EV().g.zoomText + ')');
  s.ok(near(under(cx, cy), at0), 'the point under the pointer stays under it');
  s.eq('drawn there', [EV().g.canvas, canvasEl().attrs.style], Array(2).fill('width:' + W + 'px;height:' + H + 'px;transform:translate(' + shift().x.toFixed(1) + 'px,' + shift().y.toFixed(1) + 'px) scale(' + zoom().toFixed(3) + ')'));
  /* a run of turns at moving points: each keeps its own point */
  const at1 = under(cx + 50, cy + 20);
  wheel({ deltaY: -25, clientX: 650, clientY: 420 });
  s.ok(near(under(cx + 50, cy + 20), at1), 'a second turn elsewhere keeps that point');
  const at2 = under(cx + 50, cy + 20);
  wheel({ deltaY: 25, clientX: 650, clientY: 420 });
  s.ok(near(under(cx + 50, cy + 20), at2), 'and zooming out too');
  /* lines (Firefox) as pixels; the limits; sideways swipes; a pinch */
  s.click('Fit');
  wheel({ deltaY: 1, deltaMode: 1 });
  s.ok(Math.abs(zoom() - fitZ * Math.pow(10, -33 / 250)) < 1e-9, 'a line out, 33 px a line as the old graph counted');
  s.click('Fit');
  wheel({ deltaY: -1, deltaMode: 2 });
  s.ok(Math.abs(zoom() - fitZ * Math.pow(10, 100 / 250)) < 1e-9, 'a page in, as one notch');
  s.click('Fit');
  wheel({ deltaY: -100000 });
  s.eq('as far in as the buttons go', [EV().g.zoomText, zoom()], ['250%', 2.5]);
  const sh = shift();
  s.eq('at the limit the wheel is still the graph’s, and nothing moves', [wheel({ deltaY: -100 }), zoom(), shift()], [1, 2.5, sh]);
  wheel({ deltaY: 100000 });
  s.eq('as far out as the buttons go', EV().g.zoomText, '20%');
  s.click('Fit');
  s.eq('Fit: back to the fit, at the top left', [(s.c.state.etb_zoom || {})[key], (s.c.state.etb_pan || {})[key]], [undefined, undefined]);
  s.eq('a sideways swipe moves it sideways', [wheel({ deltaX: 80, deltaY: 10 }), zoom(), shift()], [1, fitZ, { x: -80, y: -10 }]);
  s.eq('in lines too', [wheel({ deltaX: -2, deltaY: 0, deltaMode: 1 }), shift()], [1, { x: -14, y: -10 }]);
  s.eq('no movement: nothing', [wheel({ deltaY: 0 }), shift()], [0, { x: -14, y: -10 }]);
  const pin = under(cx, cy);
  wheel({ deltaX: 30, deltaY: -10, ctrlKey: true });
  s.ok(zoom() > fitZ && near(under(cx, cy), pin), 'a pinch (ctrl + wheel) zooms in, around the pointer');
  /* the buttons zoom around the middle of the area (as measured) */
  s.click('Fit');
  const mid = under(998 / 2, 558 / 2);
  s.click('Zoom in');
  s.ok(Math.abs(zoom() - fitZ * 1.2) < 1e-9 && near(under(499, 279), mid), 'Zoom in: 20% more, around the middle');
  s.click('Zoom out');
  s.ok(Math.abs(zoom() - fitZ) < 1e-9 && near(under(499, 279), mid), 'Zoom out: back, around the middle');
  /* dragging the background: the graph moves with the pointer */
  const bg = { closest: () => null }, node = { closest: (q) => (q === 'button' ? {} : null) };
  const ptr = (name, x, y, extra) => s.fire(wrap(), name, Object.assign({ currentTarget: el, target: bg, button: 0, pointerType: 'mouse', pointerId: 7, clientX: x, clientY: y }, extra || {}));
  s.click('Fit');
  ptr('onPointerDown', 500, 300);
  ptr('onPointerMove', 499, 299);
  s.eq('a 2 px wobble doesn’t move it', [shift(), el.cls.has('etb-panning')], [{ x: 0, y: 0 }, false]);
  ptr('onPointerMove', 450, 260);
  s.eq('dragged 50 left and 40 up: it moves with the pointer', [shift(), el.cls.has('etb-panning'), el.captured, zoom()], [{ x: -50, y: -40 }, true, true, fitZ]);
  ptr('onPointerMove', 470, 330, { pointerId: 8 });
  s.eq('another pointer doesn’t move it', shift(), { x: -50, y: -40 });
  ptr('onPointerUp', 450, 260);
  s.eq('let go: done', [s.c._etbPan, el.cls.has('etb-panning'), el.captured], [null, false, false]);
  ptr('onPointerMove', 400, 200);
  s.eq('moving after that does nothing', shift(), { x: -50, y: -40 });
  ptr('onPointerDown', 500, 300);
  ptr('onPointerMove', 560, 330);
  ptr('onPointerUp', 560, 330);
  s.eq('a second drag starts where the first left it', shift(), { x: 10, y: -10 });
  ptr('onPointerDown', 500, 300, { target: node });
  ptr('onPointerMove', 400, 200);
  s.eq('on an experiment: its own drag, not the view’s', [shift(), s.c._etbPan], [{ x: 10, y: -10 }, null]);
  ptr('onPointerDown', 500, 300, { button: 2 });
  s.eq('other buttons do nothing', s.c._etbPan, null);
  ptr('onPointerDown', 500, 300, { pointerType: 'touch', pointerId: 9 });
  ptr('onPointerMove', 520, 300, { pointerType: 'touch', pointerId: 9 });
  ptr('onPointerCancel', 520, 300, { pointerType: 'touch', pointerId: 9 });
  s.eq('a finger moves it too; a cancelled drag ends', [shift(), s.c._etbPan, el.cls.has('etb-panning')], [{ x: 30, y: -10 }, null, false]);
  /* two fingers pinch: zoomed by how far apart they go, around the point between them, moving with it */
  s.click('Fit');
  const f = (name, id, x, y, extra) => ptr(name, x, y, Object.assign({ pointerType: 'touch', pointerId: id }, extra || {}));
  f('onPointerDown', 21, 400, 300);
  f('onPointerDown', 22, 600, 300);
  const pm = under(500 - 101, 300 - 201);
  s.eq('two fingers down: a pinch under way, nothing moved yet', [zoom(), shift(), el.cls.has('etb-panning')], [fitZ, { x: 0, y: 0 }, true]);
  f('onPointerMove', 22, 700, 300);
  s.ok(Math.abs(zoom() - fitZ * 1.5) < 1e-9, 'from 200 to 300 px apart: 1.5 times the zoom');
  s.ok(near(under(550 - 101, 300 - 201), pm), 'what was between them stays between them');
  f('onPointerMove', 21, 450, 350);
  s.ok(Math.abs(zoom() - fitZ * Math.hypot(250, 50) / 200) < 1e-9 && near(under(575 - 101, 325 - 201), pm), 'both moving: it zooms and moves with them');
  const zp = zoom(), sp = shift();
  f('onPointerDown', 23, 520, 420);
  f('onPointerMove', 23, 300, 100);
  s.eq('a third finger has no part in it', [zoom(), shift()], [zp, sp]);
  f('onPointerUp', 22, 700, 300);
  f('onPointerMove', 21, 460, 360);
  s.eq('one lifted: the other goes on moving it', [zoom(), shift()], [zp, { x: sp.x + 10, y: sp.y + 10 }]);
  f('onPointerUp', 23, 300, 100);
  s.ok(!!s.c._etbPan, 'lifting the finger that had no part changes nothing');
  f('onPointerUp', 21, 460, 360);
  s.eq('the last lifted: done', [s.c._etbPan, el.cls.has('etb-panning')], [null, false]);
  f('onPointerDown', 24, 400, 300);
  f('onPointerDown', 25, 600, 300);
  f('onPointerMove', 25, 100000, 300);
  s.eq('pinched apart: no further in than the buttons go', zoom(), 2.5);
  f('onPointerMove', 25, 401, 300);
  s.eq('and together: no further out', zoom(), 0.2);
  f('onPointerCancel', 24, 400, 300);
  f('onPointerCancel', 25, 401, 300);
  s.eq('cancelled: done', s.c._etbPan, null);
  s.click('Re-layout');
  s.eq('Re-layout: the fit at the top left again', [(s.c.state.etb_zoom || {})[key], (s.c.state.etb_pan || {})[key]], [undefined, undefined]);
  /* a wheel or a press arms an area the pointer hasn't come over */
  const el2 = area();
  s.fire(wrap(), 'onWheel', { currentTarget: el2, deltaY: -100 });
  s.eq('a wheel arms the graph area too', el2.listeners.length, 1);
  const el3 = area();
  ptr('onPointerDown', 500, 300, { currentTarget: el3 });
  ptr('onPointerUp', 500, 300, { currentTarget: el3 });
  s.eq('so does pressing on it', el3.listeners.length, 1);
  /* full screen: the area takes the room left; the wheel works there the same */
  s.click('Full screen');
  s.eq('full screen: no fixed height', [EV().g.area, wrap().attrs.style || ''], ['', '']);
  const fz = zoom(), f0 = under(cx, cy);
  wheel({ deltaY: -100 });
  s.ok(zoom() > fz && near(under(cx, cy), f0), 'the wheel zooms around the pointer in full screen');
  s.click('Exit full screen');
  s.click('Fit');
  s.eq('nothing saved', [JSON.stringify(doc()).includes('etb_zoom'), JSON.stringify(doc()).includes('etb_pan')], [false, false]);
  /* a short graph (the first experiment of an objective that had none): the area is never less than 240 px tall */
  openObj('DIV-EL', 'OBJ-EL-2026Q4-02');
  goExp();
  s.ok(!bagOf(s.c.ctx.objId), 'an objective with no logic tree yet');
  s.click('Add experiment'); s.c.closeAllSheets(); s.render();
  if (!EV().isGraph) s.click('Graph');
  s.ok(EV().g.H * s.c._etbG.fitZ + 2 < 240, 'one experiment: shorter than 240 px at its fit (' + Math.round(EV().g.H * s.c._etbG.fitZ) + ' px)');
  s.eq('the area is 240 px tall all the same', [EV().g.area, wrap().attrs.style], ['height:240px', 'height:240px']);
  s.clean('pan and zoom');
});

/* ------------------------------------------------ the Experiments tab's order (November 3) */
s.step('Experiments tab: Current step, then Logic trees (with Manage trees and New tree), then the logic tree', () => {
  fresh(); goExp();
  const at = (k) => s.els.findIndex((el) => el.attrs['data-k'] === k);
  s.ok(at('current-step') >= 0 && at('current-step') < at('logic-trees') && at('logic-trees') < at('etb'), 'Current step, Logic trees, the logic tree, in that order');
  const panel = s.find((el) => el.attrs['data-k'] === 'logic-trees');
  s.eq('the panel, its trees counted', [panel.attrs['aria-label'], textOf(s.find((el) => el.tag === 'h2' && textOf(el) === 'Logic trees', { within: 'logic-trees' })), textOf(s.find((el) => /\bcnt\b/.test(el.attrs.class || ''), { within: 'logic-trees' }))], ['Logic trees', 'Logic trees', '2']);
  s.eq('Manage trees and New tree are in it, not in Current step', [s.has('Manage trees', { within: 'logic-trees', handler: 'onClick' }), s.has('New tree', { within: 'logic-trees', handler: 'onClick' }), s.has('Manage trees', { within: 'current-step' }), s.has('New tree', { within: 'current-step' })], [true, true, false, false]);
  s.eq('so are the trees, the open one pressed', s.all((el) => el.tag === 'button' && el.on.onClick && /\bstep-tree\b/.test(el.attrs.class || ''), { within: 'logic-trees' }).map((el) => [textOf(el).split(' ')[0], String(el.attrs['aria-pressed'])]), [['Cell', 'true'], ['Crossover', 'false']]);
  s.click('~Crossover margin at 30 bar', { within: 'logic-trees', tag: 'button' });
  s.eq('picking one opens it below', [bagOf(OBJ).activeTid, EV().st.title], ['t_xover', 'Crossover margin at 30 bar']);
  s.click('New tree', { within: 'logic-trees' });
  s.type('Name', 'Membrane crossover');
  s.click('Create tree');
  s.eq('New tree adds one, counted, and opens it', [textOf(s.find((el) => /\bcnt\b/.test(el.attrs.class || ''), { within: 'logic-trees' })), bagOf(OBJ).trees[2].name, bagOf(OBJ).activeTid === bagOf(OBJ).trees[2].tid], ['3', 'Membrane crossover', true]);
  s.click('Manage trees', { within: 'logic-trees' });
  s.eq('Manage trees opens the manager', sheetKind(), 'step.trees');
  s.click('Done');
  /* read-only: the trees still switch; nothing to manage or add */
  setRo(true);
  s.eq('read-only: the trees, no Manage trees or New tree', [at('logic-trees') > at('current-step'), s.has('Manage trees'), s.has('New tree'), s.all((el) => /\bstep-tree\b/.test(el.attrs.class || ''), { within: 'logic-trees' }).length], [true, false, false, 3]);
  setRo(false);
  /* an objective with no tree yet: New tree and a word on how to start; read-only, no panel at all */
  openObj('DIV-EL', 'OBJ-EL-2026Q4-02');
  goExp();
  s.eq('no tree yet: the panel offers New tree and says how to start', [at('logic-trees') > at('current-step'), ST().treeCount, s.has('New tree', { within: 'logic-trees', handler: 'onClick' }), s.has('Manage trees'), s.has('No logic trees yet. Create one with New tree, or add an experiment below to start the first.')], [true, '0', true, false, true]);
  setRo(true);
  s.eq('read-only with no tree: no panel', at('logic-trees'), -1);
  setRo(false);
  s.clean('order');
});

/* ------------------------------------------------ the Waterfall (October 22) */
s.step('Waterfall: drawn at its area’s width; a name that fits neither in nor along its bar goes beside it, clear of it', () => {
  fresh(); goExp();
  s.click('Waterfall');
  const wf = () => EV().wf;
  const svgEl = () => s.find((el) => el.attrs['aria-label'] === 'Waterfall timeline of the experiments');
  /* nothing measured yet (no page here): 920 wide, as before */
  s.eq('unmeasured: 920 wide', [wf().W, wf().vb, String(svgEl().attrs.width)], [920, '0 0 920 ' + wf().H, '920']);
  /* measured: the area's width, never under 680 (the area then scrolls); the height doesn't depend on it */
  const H0 = wf().H;
  s.c._etbWfW = 1398; s.render();
  s.eq('drawn at the width measured', [wf().W, wf().vb, String(svgEl().attrs.width), wf().H], [1398, '0 0 1398 ' + H0, '1398', H0]);
  s.c._etbWfW = 500; s.render();
  s.eq('never under 680', wf().W, 680);
  /* where each name goes, at every width: in its bar, along it (the bar drawn longer), after it as drawn, or before
     it clear of the arrow; with room on neither side, on the roomier one, cut short with an ellipsis */
  const placed = (widths) => { const seen = {}, bad = [];
  widths.forEach((w) => {
    s.c._etbWfW = w; s.render();
    const plotL = 156, plotR = wf().W - 26;
    wf().rows.filter((r) => r.isExp).forEach((r) => {
      if (r.inside === r.outside) bad.push(w + ' ' + r.text + ': in and out');
      if (r.inside) { if (r.cut) bad.push(w + ' ' + r.text + ': cut inside'); seen[r.ext ? 'along' : 'in'] = 1; return; }
      const est = r.text.length * 6.6, xe = r.bx + r.bw, T = 0.25;
      const ra = plotR - (xe + 8), rb = (r.bx - 14) - (plotL + 4), after = r.oanchor === 'start', room = after ? ra : rb;
      if (after ? Math.abs(r.ox - (xe + 8)) > 0.11 : Math.abs(r.ox - (r.bx - 14)) > 0.11) bad.push(w + ' ' + r.text + ': not beside its bar');
      if (!r.cut) {
        if (r.otext !== r.text || est > room + T) bad.push(w + ' ' + r.text + ': whole without room');
        if (!after && est <= ra - T) bad.push(w + ' ' + r.text + ': before though it fit after');
      } else {
        if (est <= ra - T || est <= rb - T) bad.push(w + ' ' + r.text + ': cut though it fit');
        if (room < Math.max(ra, rb) - T) bad.push(w + ' ' + r.text + ': cut on the smaller side');
        if (!/…$/.test(r.otext) || r.otext.length * 6.6 > room + T || r.otext.length < 8 || r.text.indexOf(r.otext.slice(0, -1)) !== 0) bad.push(w + ' ' + r.text + ': cut wrong (' + r.otext + ')');
      }
      seen[(after ? 'after' : 'before') + (r.cut ? ' cut' : '')] = 1;
    });
  });
  return { seen: Object.keys(seen).sort(), bad: bad }; };
  const sample = placed([680, 800, 920, 1080, 1398, 2200]);
  s.eq('every name placed by the rule', sample.bad, []);
  s.eq('the sample trees use each placement', sample.seen, ['along', 'before', 'in']);
  s.c._etbWfW = 680; s.render();
  const outs = () => s.all((el) => el.tag === 'text' && /\betb-wf-out\b/.test(el.attrs.class || '')).map((el) => textOf(el));
  const shown = () => wf().rows.filter((r) => r.isExp && r.outside).map((r) => r.otext + (r.cut ? ' ' + r.text : ''));
  s.eq('a name beside its bar shows as placed', outs(), shown());
  /* a bar too short to draw (planned and completed the same day) is drawn 18 wide; a name beside it starts after that */
  s.c._etbWfW = 920; s.render();
  s.click('JSON');
  const t = JSON.parse(EV().js.text);
  const rid = Object.keys(t.experiments).find((k) => t.experiments[k].code === 'EXP-1');
  t.experiments[rid].completed_date = t.experiments[rid].planned_date;
  t.experiments[rid].name = 'A name far too long to go in or along a bar this short, by design';
  s.type('Raw model', JSON.stringify(t));
  s.click('Apply changes');
  s.click('Waterfall');
  const r1 = wf().rows.find((r) => r.isExp && r.text.indexOf('EXP-1 A name far too long') === 0);
  s.eq('a day-long bar: drawn 18 wide, its name after it', [r1.bw, r1.outside, r1.oanchor], [18, true, 'start']);
  s.ok(Math.abs(r1.ox - (r1.bx + 18 + 8)) <= 0.11, 'the name starts 8 past the bar as drawn, not inside it (' + r1.ox + ' vs ' + r1.bx + ')');
  /* names with room on neither side: cut short on the roomier one, the whole name kept as the hover title */
  s.click('JSON');
  const t2 = JSON.parse(EV().js.text);
  const longName = (k) => 'Map cell voltages again under every load step and hold, with the full stack instrumented end to end ' + k;
  Object.keys(t2.experiments).forEach((k) => { const e = t2.experiments[k]; if (e.code === 'EXP-1' || e.code === 'EXP-1·R1') e.name = longName(e.code); });
  s.type('Raw model', JSON.stringify(t2));
  s.click('Apply changes');
  s.click('Waterfall');
  const cuts = placed([680, 800]);
  s.eq('long names: placed by the rule, cut on either side', [cuts.bad, cuts.seen.filter((x) => / cut$/.test(x))], [[], ['after cut', 'before cut']]);
  s.c._etbWfW = 680; s.render();
  s.eq('a cut name shows cut, its whole name after it', outs(), shown());
  s.ok(wf().rows.filter((r) => r.isExp && r.cut).every((r) => s.has((el) => el.tag === 'title' && textOf(el) === r.text)), 'each cut name keeps the whole of it as its hover title');
  /* the measuring: once drawn, the chart's area is measured and the chart drawn again at that width; a resize of the
     window measures again; one listener however often it is drawn */
  const area = { clientWidth: 1203.4 }, listeners = {};
  global.document = { querySelector: (q) => (q === '[data-k="etb"] .etb-wfwrap' ? area : null) };
  global.window.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  try {
    s.c._etbWfW = undefined; s.render();
    s.eq('drawn first at 920', wf().W, 920);
    const rev0 = s.c.state.rev || 0;
    s.advance(20);
    s.eq('then at its area’s width (the page told to draw again)', [wf().W, (s.c.state.rev || 0) > rev0], [1203, true]);
    s.eq('one resize listener', (listeners.resize || []).length, 1);
    area.clientWidth = 1000;
    listeners.resize[0]();
    s.advance(20);
    s.eq('a resize draws it again at the new width', wf().W, 1000);
    s.render(); s.render(); s.advance(20); s.render(); s.advance(20);
    s.eq('drawing again adds no listener and changes nothing', [listeners.resize.length, wf().W], [1, 1000]);
    const rev1 = s.c.state.rev || 0;
    s.render(); s.advance(20);
    s.eq('the same width measured: the page isn’t drawn again', s.c.state.rev || 0, rev1);
    area.clientWidth = 0;
    listeners.resize[0](); s.advance(20);
    s.eq('an area not on screen (0 wide) keeps the last width', wf().W, 1000);
  } finally { delete global.document; delete global.window.addEventListener; }
  s.clean('waterfall');
});

/* ------------------------------------------------ every handler site in my files was fired */
(function coverage() {
  const parsed = s.parsed; const mine = [];
  (function collect(n) { if (n.attrs) for (const k of Object.keys(n.attrs)) if (k.startsWith('on')) { const hit = parsed.srcmap[n.line]; if (hit && /mods\/(step|etb)\//.test(hit[0])) mine.push({ key: k + '@' + n.line, at: hit[0] + ':' + hit[1] + ' ' + k }); } (n.kids || []).forEach(collect); })(parsed.tree);
  const missed = mine.filter((m) => !HIT.has(m.key));
  s.eq('handler sites in mods/step and mods/etb fired (' + mine.length + ')', missed.map((m) => m.at), []);
})();
done();
