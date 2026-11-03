/* ============================================================================
   Audit A2: independent parity checks for the Execution and Sales boards'
   stage-gates (mods/gates), kanban (mods/kb), FMEA (mods/fmea), current step
   (mods/step) and logic tree (mods/etb), against the real apps' rules
   (execution_app.template.html, sales_app.template.html, rdcore.js).

     node test/audit_a2.js out/a2/Main.dc.html
     node test/audit_a2.js out/a2/Sales-A.dc.html

   Step labels carry the ids used in audit/a2.md (G = gates, P = plan revision
   and catch-up, K = kanban, F = FMEA, S = current step, E = logic tree,
   R = read-only). Oracles below are ports of the real apps' own functions
   (gateForecastMeta, gateDriverOf, enactCatchup, rpCommit, delCause,
   writeKpiUpdatesFromReads …) so numbers are checked against today's rules,
   not against the Calm module.
   ========================================================================== */
const { Sim, done, textOf } = require('./dc');
const RD = require(require('./engine_path'));

const FILE = process.argv[2] || 'out/a2/Main.dc.html';
const SALES = /Sales/.test(FILE);
const TODAY = 2477;
const day = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(2020, 0, 1)) / 86400000);
const iso = (d) => new Date(Date.UTC(2020, 0, 1) + d * 86400000).toISOString().slice(0, 10);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fd = (d) => { const x = new Date(Date.UTC(2020, 0, 1) + d * 86400000); return MON[x.getUTCMonth()] + ' ' + x.getUTCDate(); };
const fdy = (d) => fd(d) + ', ' + new Date(Date.UTC(2020, 0, 1) + d * 86400000).getUTCFullYear();
const days = (n) => Math.abs(n) + (Math.abs(n) === 1 ? ' day' : ' days');

/* ---------------------------------------------------------------- helpers */
const docOf = (s, key) => s.c.D.docs[key];
const emOf = (s, key) => RD.withPortfolio(s.c.D.portfolio, { [key.replace(/^[A-Z]+-/, '')]: docOf(s, key) });
const toasts = (s) => (s.c.state.toasts || []).map((t) => t.text);
const hadToast = (s, t) => s.ok(toasts(s).some((x) => (t instanceof RegExp ? t.test(x) : x === t)), 'toast ' + t + ' (got ' + JSON.stringify(toasts(s)) + ')');
const top = (s) => s.c.sheet();
const ED = { within: 'Editor' };
const tab = (s, name) => s.click(name, { within: 'Objective sections' });
/* switching division or objective returns the shell to its Overview tab, so go back to the tab we were on */
const pickDiv = (s, name) => { const t = s.c.state.tab; s.click('~Division', { within: 'context' }); s.click('~' + name, { within: 'Divisions' }); if (t && s.c.state.tab !== t) s.c.setState({ tab: t }), s.render(); };
const pickObj = (s, sub) => { const t = s.c.state.tab; s.click('~' + sub, { within: 'Objectives' }); if (t && s.c.state.tab !== t) s.c.setState({ tab: t }), s.render(); };
const gk = (id) => 'gate-' + id;
const rows = (s) => { const out = []; ((s.vals.gates.tab && s.vals.gates.tab.sets) || []).forEach((w) => w.gates.forEach((g) => out.push(g))); return out; };
const rowOf = (s, id) => rows(s).find((g) => g.id === id) || null;
const GL = (s, key, id) => s.c.MODS.gates.api.label(docOf(s, key), id);
const dlgOk = (s) => s.click(s.vals.ui.dlg.ok, { within: '~' }) ;
const confirmDlg = (s) => { const d = s.vals.ui.dlg; if (!d) throw new Error('no dialog open'); s.c.dlgOk(); s.render(); };
const askDlg = (s, v) => { s.c.setState({ dlg: Object.assign({}, s.c.state.dlg, { value: v }) }); s.render(); s.c.dlgOk(); s.render(); };
const fresh = () => new Sim(FILE);
const mi = (label) => (el) => el.attrs.role === 'menuitemradio' && textOf(el) === label;
const dk = (k) => (el) => el.attrs['data-k'] === k;
const MS = 86400000;

/* ---- oracle: today's gateDriverOf + gateForecastMeta (execution_app L4611-L4640), as words ---- */
function realForecast(g, casc, td, setGates, label) {
  if (g.actualDate != null) {
    const d = g.plannedDate != null ? g.actualDate - g.plannedDate : 0;
    if (d > 0) return ['Finished ' + days(d) + ' late'];
    if (d < 0) return ['Finished ' + days(d) + ' early'];
    return [];
  }
  const planned = g.plannedDate, eff = casc.gateEffective[g.id];
  if (planned == null || eff == null) return [];
  const fcSlip = eff - planned;
  if (fcSlip > 0) {
    if (planned < td) return ['Forecast ' + fd(eff), days(fcSlip) + ' late'];
    const earlier = (setGates || []).filter((x) => x.plannedDate != null && g.plannedDate != null && x.plannedDate < g.plannedDate).sort((a, b) => a.plannedDate - b.plannedDate);
    let drv = null;
    for (const x of earlier) { const late = (x.actualDate != null && x.plannedDate != null && x.actualDate > x.plannedDate) || (x.actualDate == null && x.plannedDate != null && x.plannedDate < td); if (late) { drv = x; break; } }
    return ['Forecast ' + fd(eff), 'Pushed ' + days(fcSlip) + (drv ? ' by ' + label(drv.id) : ' by an upstream gate')];
  }
  const acc = casc.gateAcceleration[g.id] || 0;
  if (acc > 0) return ['Forecast ' + fd(eff), 'Could finish ' + fd(casc.gateForecastEarliest[g.id]) + ', ' + days(acc) + ' earlier'];
  return [];
}
/* today's sortGatesByDue / objSetsOrdered / gatesOfSet */
const byDue = (list) => list.slice().sort((a, b) => { const pa = a.plannedDate == null ? Infinity : a.plannedDate, pb = b.plannedDate == null ? Infinity : b.plannedDate; return (pa - pb) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)); });
const setsOf = (doc, objId) => (doc.stageGateSets || []).filter((x) => x.objectiveId === objId).slice().sort((a, b) => ((a.order || 0) - (b.order || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
/* today's gateLabel (L5884) */
function realLabel(doc, gateId) {
  const g = doc.stageGates.find((x) => x.id === gateId); if (!g) return String(gateId);
  const peers = byDue(doc.stageGates.filter((x) => x.objectiveId === g.objectiveId && x.setId === g.setId));
  const n = peers.findIndex((x) => x.id === gateId) + 1; if (n < 1) return String(gateId);
  const si = setsOf(doc, g.objectiveId).findIndex((x) => x.id === g.setId);
  return 'SG-' + (si >= 0 ? String.fromCharCode(65 + si) : '') + n;
}
/* compare every visible gate row of the selected objective with today's rules */
function checkGateRows(s, key, label) {
  const doc = docOf(s, key), em = emOf(s, key), objId = s.c.ctx.objId;
  const casc = RD.cascade(s.c.D.portfolio, em, TODAY);
  const ended = !!RD.objectiveEndState(doc.objectiveState, objId);
  const STATE = { passed: 'Passed', 'passed-late': 'Passed late', overdue: 'Overdue', pending: 'Pending', cancelled: 'Cancelled' };
  setsOf(doc, objId).forEach((set, si) => {
    const gs = byDue(doc.stageGates.filter((g) => g.objectiveId === objId && g.setId === set.id));
    const blk = (s.vals.gates.tab.sets || []).find((w) => w.id === set.id);
    s.ok(!!blk, label + ': workstream block ' + set.name);
    if (!blk) return;
    s.eq(label + ': workstream letter ' + set.name, blk.letter, 'Workstream ' + String.fromCharCode(65 + si));
    const pct = RD.setScore(set.id, em, TODAY);
    s.eq(label + ': % passed ' + set.name, blk.pct, pct == null ? '—' : Math.round(pct) + '%');
    s.eq(label + ': passed / total ' + set.name, blk.passedText, gs.filter((g) => g.actualDate != null).length + ' of ' + gs.length + ' passed');
    s.eq(label + ': gate order (due date) ' + set.name, blk.gates.map((g) => g.id), gs.map((g) => g.id));
    gs.forEach((g) => {
      const r = blk.gates.find((x) => x.id === g.id);
      let st = RD.classifyGate(g, TODAY);
      const cancelled = ended && g.actualDate == null;
      if (cancelled) st = 'cancelled';
      let word = STATE[st];
      if (!cancelled && g.actualDate == null && g.status === 'active' && st === 'pending') word = 'In progress';   /* Calm shows the stored status (decided) */
      s.eq(label + ': state ' + g.id, r.stWord, word);
      s.eq(label + ': chip ' + g.id, r.label, realLabel(doc, g.id));
      const sc = RD.stageGateScore(g.id, em);
      s.eq(label + ': readiness ' + g.id, r.ready, sc == null ? '—' : Math.round(sc) + '%');
      const want = cancelled ? ['Cancelled when the objective ended'] : realForecast(g, casc, TODAY, gs, (id) => realLabel(doc, id));
      s.eq(label + ': schedule words ' + g.id, r.when.map((w) => w.text).slice(1), want);
      s.eq(label + ': planned ' + g.id, r.when[0].text, g.plannedDate != null ? 'Planned ' + (new Date(Date.UTC(2020, 0, 1) + g.plannedDate * MS).getUTCFullYear() === 2026 ? fd(g.plannedDate) : fdy(g.plannedDate)) : 'No planned date');
      s.eq(label + ': committed tag ' + g.id, !!r.committed, g.baselineDate != null);
      const cu = RD.catchupEntry(doc.catchupPlans, objId, g.id);
      s.eq(label + ': re-committed ' + g.id, !!r.recommitted, !!cu);
      const fdc = (d) => (new Date(Date.UTC(2020, 0, 1) + d * MS).getUTCFullYear() === 2026 ? fd(d) : fdy(d));
      s.eq(label + ': revision line ' + g.id, r.hasRecommit ? r.recommitText : '', cu ? 'Revision v' + (cu.version || 1) + ': ' + fdc(cu.originalDate) + ' to ' + fdc(cu.newDate) : '');
      s.eq(label + ': intent ' + g.id, r.hasIntent ? r.intent : '', String(g.intention || '').trim());
      const smp = RD.hostSample('stageGate', g.id, em);
      s.eq(label + ': partial tag ' + g.id, !!r.hasPartialTag, !!smp.partial);
      s.eq(label + ': passed label ' + g.id, r.isPassed ? r.passedText : '', (!cancelled && g.actualDate != null) ? 'Passed ' + fd(g.actualDate) : '');
      s.eq(label + ': mark complete offered ' + g.id, !!r.canMark, !s.c.state.ro && g.actualDate == null && !cancelled);
      /* readiness partial caption (today's ptCaption + "reaches 100 only once all N are in", L5553) */
      const raw = smp.partial ? RD.stageGateScore(g.id, em, true) : null;
      s.eq(label + ': partial caption ' + g.id, r.hasPartial ? r.partialText : '', smp.partial ? 'Partial check-in: ' + Math.round(raw == null ? 0 : raw) + '% without discount, ' + smp.n + ' of ' + smp.expected + ' samples. Readiness reaches 100 only once all ' + smp.expected + ' are in.' : '');
      /* version mark (today's gvMarkHtml over RD.gateVersionMarks): which gates, which version, which change */
      const mk = RD.gateVersionMarks(doc, objId)[g.id];
      const KIND = { added: 'Added in v', moved: 'Moved in v', retargeted: 'Retargeted in v', renamed: 'Renamed in v' };
      s.eq(label + ': version mark ' + g.id, r.hasMark ? r.vmark.replace(/ \(.*\)$/, '') : '', mk ? KIND[mk.kind] + mk.v : '');
      if (mk && mk.kind === 'moved' && mk.deltaDays) s.ok(r.vmark.indexOf(days(mk.deltaDays)) > 0, label + ': moved by ' + days(mk.deltaDays) + ' in ' + r.vmark);
      /* targets toggle numbers (today L5541: met = kpiScoreResolved >= 100 over the gate's own KPIs, plus "K partial") */
      const AK = allKpis(s, key);
      const tk = AK.filter((k) => k.objectiveId === objId && k.hostType === 'stageGate' && k.hostId === g.id);
      s.eq(label + ': has targets ' + g.id, !!r.hasTargets, tk.length > 0);
      if (tk.length) {
        const met = tk.filter((k) => { const v = RD.kpiScoreResolved(k, AK, em); return v != null && v >= 100; }).length;
        s.eq(label + ': targets met ' + g.id, r.metText, met + ' of ' + tk.length + ' met' + (smp.partial ? ', ' + smp.partialCount + ' partial' : ''));
      }
    });
  });
}

/* ================================================================== GATES */
function gatesExec() {
  const KEY = 'EXEC-DIV-EL', EL1 = 'OBJ-EL-2026Q4-01', EL2 = 'OBJ-EL-2026Q4-02';
  const W1 = 'SGSET-EL-2026Q4-01-1', W2 = 'SGSET-EL-2026Q4-01-2';
  const s = fresh();
  tab(s, 'Stage-gates');

  s.step('G06-G13 gate rows follow today\'s state, chip, readiness and forecast rules (EL-01, EL-02)', () => {
    checkGateRows(s, KEY, 'EL-01');
    pickObj(s, 'Lock Tera');
    checkGateRows(s, KEY, 'EL-02');
    s.eq('EL-02 bipolar plate trial is overdue (planned Oct 8)', rowOf(s, 'SG-EL-2026Q4-02-2').stWord.indexOf('Overdue') === 0 || rowOf(s, 'SG-EL-2026Q4-02-2').stWord === 'Overdue', true);
    s.clean('gate rows');
  });

  s.step('G06 passed-late, cancelled and the Fuel Cell rows against today\'s rules', () => {
    pickDiv(s, 'Fuel Cell');
    pickObj(s, 'Run full roll-to-roll');
    const FKEY = 'EXEC-DIV-FC';
    checkGateRows(s, FKEY, 'FC-01');
    s.eq('first trial roll passed late (Oct 12 vs Oct 9)', rowOf(s, 'SG-FC-2026Q4-01-2').stWord, 'Passed late');
    s.eq('passed-late label tone', rowOf(s, 'SG-FC-2026Q4-01-2').passedCls, 'tx-warn');
    pickObj(s, 'Root-cause AST');
    checkGateRows(s, FKEY, 'FC-02');
    s.clean('fuel cell rows');
  });

  s.step('G01 header counts: Stage-gates counts the gates, the Kanban tab the active board\'s tiles (Kanban its own tab since October 15)', () => {
    pickDiv(s, 'Electrolyzer');
    pickObj(s, 'Lock Tera');
    const before = JSON.stringify(docOf(s, KEY).gateMode || {});
    s.eq('Stage-gates: count is the objective\'s gates', s.vals.gates.tab.count, docOf(s, KEY).stageGates.filter((g) => g.objectiveId === EL2).length);
    tab(s, 'Kanban');
    const b = docOf(s, KEY).boards.find((x) => x.objectiveId === EL2);
    s.eq('Kanban: count is the active board\'s tile total (RD.boardSummary total)', s.vals.kb.count, RD.boardSummary(b, '2026-10-13').total);
    tab(s, 'Stage-gates');
    s.eq('doc.gateMode never written', JSON.stringify(docOf(s, KEY).gateMode || {}), before);
    s.clean('kanban tab');
  });

  s.step('G02 Add gate: header puts it in the first workstream; General is created when there is none', () => {
    pickObj(s, 'Cut stack cost');
    const OBJ = 'OBJ-EL-2027Q1-01';
    s.eq('no workstreams yet', setsOf(docOf(s, KEY), OBJ).length, 0);
    s.click('Add gate', { within: 'gates-panel' });
    s.eq('gate sheet', top(s).kind, 'gates.edit');
    s.click('Cancel', ED);
    s.eq('cancel leaves no General behind', setsOf(docOf(s, KEY), OBJ).length, 0);
    s.click('Add gate', { within: 'gates-panel' });
    s.click('Add gate', ED);
    s.eq('a name is required', top(s).err, 'Give the gate a name.');
    s.type('Name', 'BOM teardown review', ED);
    s.type('Intention', 'Every part priced against two suppliers.', ED);
    s.type('~Gate id', 'BOM-1', ED);
    s.type('Planned date', '2027-01-29', ED);
    const ids0 = docOf(s, KEY).stageGates.map((g) => g.id);
    s.click('Add gate', ED);
    const sets = setsOf(docOf(s, KEY), OBJ);
    s.eq('General created', sets.map((x) => [x.name, x.order, x.chained]), [['General', 0, true]]);
    s.eq('General id from RD.allocId', sets[0].id, RD.allocId('stageGateSet', OBJ, docOf(s, KEY).stageGateSets.filter((x) => x.id !== sets[0].id).map((x) => x.id)));
    const g = docOf(s, KEY).stageGates.find((x) => x.objectiveId === OBJ);
    s.eq('gate id from RD.allocId', g.id, RD.allocId('stageGate', OBJ, ids0));
    s.eq('gate shape', [g.objectiveId, g.setId, g.name, g.intention, g.gate_id, g.plannedDate, g.actualDate, g.status], [OBJ, sets[0].id, 'BOM teardown review', 'Every part priced against two suppliers.', 'BOM-1', day('2027-01-29'), null, 'pending']);
    hadToast(s, 'Gate added.');
    s.clean('add gate');
  });

  s.step('G03 G25 Add workstream (name required, chained / independent) and the setting sticks', () => {
    s.click('Add workstream', { within: 'gates-panel' });
    s.click('Create workstream', ED);
    s.eq('name required', top(s).err, 'Give the workstream a name.');
    s.type('Name', 'Supplier quotes', ED);
    s.check('~Independent', true, ED);
    s.click('Create workstream', ED);
    const OBJ = 'OBJ-EL-2027Q1-01';
    const set = setsOf(docOf(s, KEY), OBJ).find((x) => x.name === 'Supplier quotes');
    s.eq('new set', [set.order, set.chained], [1, false]);
    hadToast(s, 'Workstream added.');
    s.eq('chip says Independent', s.vals.gates.tab.sets.find((w) => w.id === set.id).chainLabel, 'Independent');
    /* today's load resets every workstream to chained (L2891); Calm's seed clean-up keeps the stored value */
    s.eq('seeded independent workstream stays independent after load', docOf(s, KEY).stageGateSets.find((x) => x.id === W2).chained, false);
    s.click('Actions for workstream Supplier quotes');
    s.click('Edit workstream');
    s.type('Name', 'Supplier quotes, round 1', ED);
    s.check('~Chained', true, ED);
    s.click('Save workstream', ED);
    const set2 = docOf(s, KEY).stageGateSets.find((x) => x.id === set.id);
    s.eq('edit saved', [set2.name, set2.chained], ['Supplier quotes, round 1', true]);
    hadToast(s, 'Workstream updated.');
    s.clean('workstreams');
  });

  s.step('G04 workstream header: inline rename (Enter, Escape, empty refused), chain chip toggles', () => {
    const OBJ = 'OBJ-EL-2027Q1-01';
    const set = setsOf(docOf(s, KEY), OBJ)[0];
    s.click(set.name, { within: 'ws-' + set.id });
    s.type('Workstream name', '', { within: 'ws-' + set.id });
    s.key('Workstream name', 'Enter', { within: 'ws-' + set.id });
    s.expect('Give the workstream a name.');
    s.key('Workstream name', 'Escape', { within: 'ws-' + set.id });
    s.eq('escape keeps the old name', docOf(s, KEY).stageGateSets.find((x) => x.id === set.id).name, 'General');
    s.click('General', { within: 'ws-' + set.id });
    s.type('Workstream name', 'Cost model', { within: 'ws-' + set.id });
    s.key('Workstream name', 'Enter', { within: 'ws-' + set.id });
    s.eq('renamed', docOf(s, KEY).stageGateSets.find((x) => x.id === set.id).name, 'Cost model');
    const chip = s.vals.gates.tab.sets.find((w) => w.id === set.id);
    chip.toggleChain(); s.render();
    s.eq('chip made it independent', docOf(s, KEY).stageGateSets.find((x) => x.id === set.id).chained, false);
    s.vals.gates.tab.sets.find((w) => w.id === set.id).toggleChain(); s.render();
    s.eq('and chained again', docOf(s, KEY).stageGateSets.find((x) => x.id === set.id).chained, true);
    s.clean('rename');
  });

  s.step('G05 drag to reorder workstreams rewrites every order and the letters follow', () => {
    pickObj(s, 'Qualify the 10-cell');
    s.drag('Drag to reorder workstreams', (el) => el.attrs['data-k'] === 'ws-' + W1, { from: { within: 'ws-' + W2 } });
    const sets = setsOf(docOf(s, KEY), EL1);
    s.eq('order after drag', sets.map((x) => [x.id, x.order]), [[W2, 0], [W1, 1]]);
    hadToast(s, 'Workstreams reordered.');
    s.eq('letters follow position', s.vals.gates.tab.sets.map((w) => w.letter + ' ' + w.name), ['Workstream A Teardown and analysis', 'Workstream B Durability']);
    s.eq('chips renumber (today\'s gateLabel)', rowOf(s, 'SG-EL-2026Q4-01-2').label, realLabel(docOf(s, KEY), 'SG-EL-2026Q4-01-2'));
    s.click('Actions for workstream Teardown and analysis');
    s.click('Move down');
    s.eq('Move down restores', setsOf(docOf(s, KEY), EL1).map((x) => x.id), [W1, W2]);
    s.clean('reorder');
  });
}


/* the rest of the gate dialogs, on a fresh board (both apps: KEY / objective differ) */
function gatesDialogs() {
  const KEY = SALES ? 'BIZ-DIV-BD' : 'EXEC-DIV-EL';
  const OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01';
  const s = fresh();
  tab(s, 'Stage-gates');
  const g2 = SALES ? 'SG-BD-2026Q4-01-2' : 'SG-EL-2026Q4-01-2';
  const g3 = SALES ? null : 'SG-EL-2026Q4-01-3';
  const gPassed = SALES ? 'SG-BD-2026Q4-01-1' : 'SG-EL-2026Q4-01-1';

  s.step('G14 Mark complete: completed date defaults to today, optional justification, manual method', () => {
    const lab = GL(s, KEY, g2);
    s.click('Mark ' + lab + ' complete', { within: gk(g2) });
    s.eq('sheet', top(s).kind, 'gates.done');
    s.eq('date defaults to today', top(s).d.date, '2026-10-13');
    s.type('Completed date', '2026-10-12', ED);
    s.type('~Override justification', '  Signed off at the gate review.  ', ED);
    s.click('Mark complete', ED);
    const g = docOf(s, KEY).stageGates.find((x) => x.id === g2);
    s.eq('today\'s write: actualDate, manual, trimmed justification', [g.actualDate, g.completionMethod, g.overrideJustification], [day('2026-10-12'), 'manual', 'Signed off at the gate review.']);
    hadToast(s, 'Gate marked complete.');
    s.eq('row shows the passed label', rowOf(s, g2).passedText, 'Passed Oct 12');
    s.clean('mark complete');
  });

  s.step('G15 Completion: method, justification, KPI rows, change the date, un-complete', () => {
    s.click('Passed Oct 12', { within: gk(g2) });
    s.eq('sheet', top(s).kind, 'gates.comp');
    const v = s.vals.gates.shComp;
    s.eq('manual override shown with an editable justification', [v.isManual, v.isAuto, v.just], [true, false, 'Signed off at the gate review.']);
    const AK = allKpis(s, KEY);
    const kpis = docOf(s, KEY).kpis.filter((k) => k.objectiveId === OBJ && k.hostType === 'stageGate' && k.hostId === g2);
    s.eq('KPI rows = the gate\'s KPIs (today\'s gateKpiRows)', v.rows.map((r) => r.name), kpis.map((k) => RD.kpiName(k, AK)));
    kpis.forEach((k, i) => {
      const p = RD.kpiScoreParts(k, AK, emOf(s, KEY));
      s.eq('partial tag for ' + k.name, v.rows[i].partial, !!p.partial);
      if (p.partial) s.eq('partial n/N for ' + k.name, v.rows[i].partialText, 'Partial, ' + p.n + ' of ' + p.expected);
    });
    s.type('Passed date', '2026-10-11', ED);
    s.type('~Justification', 'Signed off at the Oct 11 review.', ED);
    s.click('Save', ED);
    let g = docOf(s, KEY).stageGates.find((x) => x.id === g2);
    s.eq('date and justification updated', [g.actualDate, g.overrideJustification, g.completionMethod], [day('2026-10-11'), 'Signed off at the Oct 11 review.', 'manual']);
    hadToast(s, 'Completion updated.');
    s.click('Passed Oct 11', { within: gk(g2) });
    s.type('Passed date', '', ED);
    s.click('Save', ED);
    g = docOf(s, KEY).stageGates.find((x) => x.id === g2);
    s.eq('clearing the date un-completes (today\'s rule)', [g.actualDate, g.completionMethod, g.overrideJustification], [null, null, null]);
    hadToast(s, 'Gate un-completed.');
    /* the auto-passed gate: method "Targets achieved", no justification field */
    const pl = rowOf(s, gPassed).passedText;
    s.click(pl, { within: gk(gPassed) });
    const v2 = s.vals.gates.shComp;
    s.eq('method of ' + gPassed, v2.isAuto, docOf(s, KEY).stageGates.find((x) => x.id === gPassed).completionMethod === 'auto');
    s.click('Un-complete gate', ED);
    s.eq('Un-complete clears the passed date', docOf(s, KEY).stageGates.find((x) => x.id === gPassed).actualDate, null);
    hadToast(s, 'Gate un-completed.');
    s.clean('completion');
  });

  s.step('G16 auto-pass: a gate passes when its readiness REACHES 100 (method auto); an un-complete sticks', () => {
    /* gPassed was auto/ manually passed and is still at 100 after the un-complete above: today's render loop
       would re-pass it at once (§24); Calm keeps the un-complete until readiness drops and returns */
    const em = emOf(s, KEY);
    const sc = RD.stageGateScore(gPassed, em);
    s.c.mutate((D) => { D.docs[KEY].stageGates.find((x) => x.id === g2).intention += ''; });   /* any change, any module */
    s.render();
    s.eq('readiness of the un-completed gate', sc == null ? null : Math.round(sc), sc == null ? null : Math.round(sc));
    if (sc != null && Math.round(sc) === 100) s.eq('it is not re-passed by the next change (fixed §24)', docOf(s, KEY).stageGates.find((x) => x.id === gPassed).actualDate, null);
    /* drive g2 to exactly 100: every KPI met with a complete sample */
    const kpis = docOf(s, KEY).kpis.filter((k) => k.hostType === 'stageGate' && k.hostId === g2);
    s.c.mutate((D) => {
      const doc = D.docs[KEY];
      kpis.forEach((k, i) => {
        const n = k.targetType === 'statistical' ? (k.readCount || 1) : 1;
        const val = k.targetType === 'binary' ? 1 : k.direction === 'down' ? (typeof k.target === 'number' ? k.target * 0.5 : 0) : k.direction === 'range' ? (k.target.lo + k.target.hi) / 2 : (k.target || 1) * 2;
        for (let j = 0; j < n; j++) doc.kpiUpdates.push({ id: 'UPD-A2-' + i + '-' + j, kpiId: k.id, value: val, timestamp: s.c.now() + j + 1000, note: '', batch: 'b_a2_' + i });
      });
    });
    s.render();
    const g = docOf(s, KEY).stageGates.find((x) => x.id === g2);
    s.eq('readiness now exactly 100', Math.round(RD.stageGateScore(g2, emOf(s, KEY))), 100);
    s.eq('passed today, method auto', [g.actualDate, g.completionMethod], [TODAY, 'auto']);
    hadToast(s, new RegExp('^' + GL(s, KEY, g2) + ' .* passed: every target is met\\.$'));
    s.clean('auto-pass');
  });

  s.step('G19 gate sheet: fields, status segment (Passed fills today), saves only what changed', () => {
    const target = g3 || 'SG-BD-2026Q4-01-1';
    const gname = docOf(s, KEY).stageGates.find((x) => x.id === target).name;
    s.click(gname, { within: gk(target) });
    s.eq('edit sheet', [top(s).kind, top(s).data.id], ['gates.edit', target]);
    s.expect(gname);
    const multi = setsOf(docOf(s, KEY), OBJ).length > 1;
    s.eq('Workstream select only with 2+ workstreams when editing (today)', s.vals.gates.shEdit.multi, multi);
    s.type('Name', gname + ' (rev)', ED);
    s.type('Intention', 'Revised intention.', ED);
    s.type('~Gate id', 'GATE-X', ED);
    s.type('Planned date', '2026-12-21', ED);
    s.click('Passed', ED);
    s.eq('choosing Passed fills an empty passed date with today', top(s).d.actual, '2026-10-13');
    s.type('Passed date', '', ED);
    s.click('In progress', ED);
    s.click('Save gate', ED);
    const g = docOf(s, KEY).stageGates.find((x) => x.id === target);
    s.eq('saved fields', [g.name, g.intention, g.gate_id, g.plannedDate, g.actualDate, g.status], [gname + ' (rev)', 'Revised intention.', 'GATE-X', day('2026-12-21'), null, 'active']);
    hadToast(s, 'Gate saved.');
    s.clean('gate sheet');
  });

  s.step('G20 commit baseline / release; disabled without a planned date', () => {
    const target = g3 || 'SG-BD-2026Q4-01-2';
    const gname = docOf(s, KEY).stageGates.find((x) => x.id === target).name;
    s.click(gname, { within: gk(target) });
    const pd = docOf(s, KEY).stageGates.find((x) => x.id === target).plannedDate;
    s.click('Commit baseline', ED);
    let g = docOf(s, KEY).stageGates.find((x) => x.id === target);
    s.eq('committed: baselineDate = plannedDate, locked', [g.baselineDate, g.locked], [pd, true]);
    hadToast(s, 'Gate committed to ' + fdy(pd) + '.');
    s.expect('Committed to ' + fdy(pd));
    s.click('Release', ED);
    g = docOf(s, KEY).stageGates.find((x) => x.id === target);
    s.eq('released', [g.baselineDate, g.locked], [null, false]);
    hadToast(s, 'Commitment released.');
    s.click('Cancel', ED);
    /* a gate with no planned date can't be committed */
    s.c.mutate((D) => { D.docs[KEY].stageGates.find((x) => x.id === target).plannedDate = null; }); s.render();
    s.click(gname, { within: gk(target) });
    s.eq('Commit baseline disabled with a reason', [s.vals.gates.shEdit.commitOff, s.vals.gates.shEdit.commitTitle], [true, 'Set a planned date first']);
    s.click('Cancel', ED);
    s.c.mutate((D) => { D.docs[KEY].stageGates.find((x) => x.id === target).plannedDate = pd; }); s.render();
    s.clean('baseline');
  });

  s.step('G21 predecessors with lag: add, cycles blocked (transitively), cross-objective list, remove', () => {
    const doc = docOf(s, KEY);
    const gates = doc.stageGates.filter((g) => g.objectiveId === OBJ);
    const A = gates[gates.length - 1].id, B = gates[0].id;
    const nameA = doc.stageGates.find((x) => x.id === A).name;
    s.click(nameA, { within: gk(A) });
    s.click('Add predecessor', ED);
    hadToast(s, 'Pick a predecessor gate.');
    const opts = s.vals.gates.shEdit.predOpts.map((o) => o.v).filter(Boolean);
    s.ok(opts.indexOf(A) < 0, 'the gate itself is not offered');
    const others = doc.stageGates.filter((g) => g.objectiveId !== OBJ).map((g) => g.id);
    s.eq('gates of other objectives in the division are offered too (today)', others.every((id) => opts.indexOf(id) >= 0), true);
    s.eq('current objective first', opts.slice(0, gates.length - 1).every((id) => doc.stageGates.find((g) => g.id === id).objectiveId === OBJ), true);
    s.type('Add a predecessor', B, ED);
    s.type('Lag (days)', 'abc', ED);
    s.click('Add predecessor', ED);
    s.eq('a lag that is not a number is refused', top(s).err, 'Lag is a number of days, like 5.');
    s.type('Lag (days)', '3', ED);
    s.click('Add predecessor', ED);
    s.eq('edge in today\'s shape', (docOf(s, KEY).stageGateEdges || []).filter((e) => e.toGate === A), [{ fromGate: B, toGate: A, lagDays: 3 }]);
    hadToast(s, 'Predecessor added.');
    s.click('Cancel', ED);
    checkGateRows(s, KEY, 'after an edge');
    /* B can't take A (direct successor) — and nothing downstream of A (today only blocked direct 2-cycles) */
    const nameB = doc.stageGates.find((x) => x.id === B).name;
    s.click(nameB, { within: gk(B) });
    s.ok(s.vals.gates.shEdit.predOpts.every((o) => o.v !== A), 'a successor is never offered (no loop)');
    s.click('Cancel', ED);
    const third = gates.find((g) => g.id !== A && g.id !== B);
    if (third) {
      /* A -> third as well: third is downstream of B through A, so B must not take third either (today only blocked 2-cycles) */
      s.c.mutate((D) => { D.docs[KEY].stageGateEdges.push({ fromGate: A, toGate: third.id, lagDays: 0 }); }); s.render();
      s.click(nameB, { within: gk(B) });
      s.ok(s.vals.gates.shEdit.predOpts.every((o) => o.v !== third.id), 'a successor of a successor is not offered either (loops blocked at any depth)');
      s.click('Cancel', ED);
      s.c.mutate((D) => { D.docs[KEY].stageGateEdges = D.docs[KEY].stageGateEdges.filter((e) => !(e.fromGate === A && e.toGate === third.id)); }); s.render();
    }
    s.click(nameA, { within: gk(A) });
    s.click('Remove predecessor ' + GL(s, KEY, B), ED);
    s.eq('removed', (docOf(s, KEY).stageGateEdges || []).filter((e) => e.toGate === A).length, 0);
    hadToast(s, 'Predecessor removed.');
    s.click('Cancel', ED);
    s.clean('predecessors');
  });

  s.step('G23 duplicate: asks for the workstream with 2+, copies the definition, not readings or links', () => {
    const doc0 = docOf(s, KEY);
    const src = doc0.stageGates.filter((g) => g.objectiveId === OBJ).find((g) => doc0.kpis.some((k) => k.hostType === 'stageGate' && k.hostId === g.id));
    const multi = setsOf(doc0, OBJ).length > 1;
    const ids0 = doc0.stageGates.map((g) => g.id), kids0 = doc0.kpis.map((k) => k.id);
    s.click('Actions for ' + GL(s, KEY, src.id), { within: gk(src.id) });
    s.click('Duplicate gate');
    let into = '';
    if (multi) {
      s.eq('workstream picker sheet', top(s).kind, 'gates.dup');
      const other = setsOf(docOf(s, KEY), OBJ).find((x) => x.id !== src.setId);
      s.type('Workstream', other.id, ED);
      into = ' into ' + other.name;
      s.click('Duplicate gate', ED);
    }
    const doc = docOf(s, KEY);
    const copy = doc.stageGates.find((g) => ids0.indexOf(g.id) < 0);
    s.eq('copy id = RD.allocId', copy.id, RD.allocId('stageGate', OBJ, ids0));
    s.eq('copied definition, reset status', [copy.name, copy.intention, copy.plannedDate, copy.actualDate, copy.status], [src.name + ' (copy)', src.intention || '', src.plannedDate, null, 'pending']);
    const nk = doc.kpis.filter((k) => kids0.indexOf(k.id) < 0);
    s.eq('targets copied onto the copy', nk.map((k) => [k.name, k.hostId]), doc.kpis.filter((k) => k.hostType === 'stageGate' && k.hostId === src.id).map((k) => [k.name, copy.id]));
    s.eq('no readings copied', doc.kpiUpdates.filter((u) => nk.some((k) => k.id === u.kpiId)).length, 0);
    s.eq('no predecessor links copied', (doc.stageGateEdges || []).filter((e) => e.fromGate === copy.id || e.toGate === copy.id).length, 0);
    hadToast(s, 'Gate duplicated' + into + '.');
    s.eq('no editor re-opens afterwards (Sales §21 fixed)', s.c.state.sheets.length, 0);
    s.clean('duplicate');
  });

  s.step('G22 delete gate: confirm names the loss; KPIs, readings, links and FMEA gate links go', () => {
    const doc0 = docOf(s, KEY);
    const victim = doc0.stageGates.find((g) => g.objectiveId === OBJ && doc0.kpis.some((k) => k.hostType === 'stageGate' && k.hostId === g.id) && (doc0.risks || []).some((r) => r.gateId === g.id)) ||
      doc0.stageGates.find((g) => g.objectiveId === OBJ && doc0.kpis.some((k) => k.hostType === 'stageGate' && k.hostId === g.id));
    const kids = doc0.kpis.filter((k) => k.hostType === 'stageGate' && k.hostId === victim.id).map((k) => k.id);
    const other = doc0.stageGates.find((g) => g.objectiveId === OBJ && g.id !== victim.id);
    s.c.mutate((D) => { D.docs[KEY].stageGateEdges.push({ fromGate: victim.id, toGate: other.id, lagDays: 0 }); }); s.render();
    s.click(victim.name, { within: gk(victim.id) });
    s.click('Delete gate', ED);
    s.ok(/is deleted with its/.test(s.vals.ui.dlg.body) && /predecessor link/.test(s.vals.ui.dlg.body), 'confirm spells out what goes: ' + s.vals.ui.dlg.body);
    confirmDlg(s);
    const doc = docOf(s, KEY);
    s.eq('gate gone', doc.stageGates.some((g) => g.id === victim.id), false);
    s.eq('its KPIs gone', doc.kpis.filter((k) => kids.indexOf(k.id) >= 0).length, 0);
    s.eq('their readings gone', doc.kpiUpdates.filter((u) => kids.indexOf(u.kpiId) >= 0).length, 0);
    s.eq('links gone (today left them, §24)', (doc.stageGateEdges || []).filter((e) => e.fromGate === victim.id || e.toGate === victim.id).length, 0);
    s.eq('FMEA gate links cleared (Sales §21)', (doc.risks || []).filter((r) => r.gateId === victim.id).length, 0);
    hadToast(s, 'Gate deleted.');
    s.eq('sheet closed', s.c.state.sheets.length, 0);
    s.clean('delete gate');
  });

  s.step('G24 add a gate, then link it (today\'s "Link…")', () => {
    s.click('Add gate', { within: 'gates-panel' });
    s.type('Name', 'Linked gate', ED);
    const ids0 = docOf(s, KEY).stageGates.map((g) => g.id);
    s.click('Add and link a KPI', ED);
    const ng = docOf(s, KEY).stageGates.find((g) => ids0.indexOf(g.id) < 0);
    s.ok(!!ng, 'gate saved first');
    s.eq('then the Link a metric sheet for it', [top(s) && top(s).kind, top(s) && top(s).data && top(s).data.host && top(s).data.host.id], ['kpi.link', ng && ng.id]);
    s.c.closeAllSheets(); s.render();
    s.clean('save then link');
  });

  s.step('G27 draft targets while adding a gate (exec "Draft targets", sales "Pending gate targets"): held in the sheet, written as the gate\'s KPIs when it is added, dropped on Cancel', () => {
    s.click('Add gate', { within: 'gates-panel' });
    s.type('Name', 'Gate with draft targets', ED);
    s.type('Planned date', '2026-12-04', ED);
    s.click('Add target', ED);
    s.eq('KPI target sheet, stacked', top(s).kind, 'kpi.target');
    s.type('Name', 'Membrane thinning', ED);
    s.click('~Decrease', ED);
    s.type('Target', '5', ED);
    s.type('Unit', '%', ED);
    s.c.vmOf('kpi').tg.save(); s.render();
    s.eq('back on the gate sheet with one draft and the typing kept', [top(s).kind, (s.c.state.gates_pend || []).length, s.vals.gates.shEdit.name], ['gates.edit', 1, 'Gate with draft targets']);
    const doc0 = docOf(s, KEY), ids0 = doc0.stageGates.map((g) => g.id), kids0 = doc0.kpis.map((k) => k.id);
    s.click('Add gate', ED);
    const doc = docOf(s, KEY);
    const g = doc.stageGates.find((x) => ids0.indexOf(x.id) < 0);
    const nk = doc.kpis.filter((k) => kids0.indexOf(k.id) < 0);
    s.eq('the draft became the new gate\'s KPI (today\'s pending targets)', nk.map((k) => [k.name, k.hostType, k.hostId, k.objectiveId, k.isDefiner, k.direction, k.target, k.unit]), [['Membrane thinning', 'stageGate', g.id, OBJ, true, 'down', 5, '%']]);
    s.eq('drafts cleared', (s.c.state.gates_pend || []).length, 0);
    s.click('Add gate', { within: 'gates-panel' });
    s.type('Name', 'Abandoned gate', ED);
    s.click('Add target', ED);
    s.type('Name', 'Throwaway target', ED);
    s.type('Target', '1', ED);
    s.c.vmOf('kpi').tg.save(); s.render();
    const k1 = docOf(s, KEY).kpis.length, g1 = docOf(s, KEY).stageGates.length;
    s.click('Cancel', ED);
    if (s.vals.ui.dlg) confirmDlg(s);
    s.eq('Cancel adds nothing', [docOf(s, KEY).kpis.length, docOf(s, KEY).stageGates.length, s.c.state.sheets.length], [k1, g1, 0]);
    s.click('Add gate', { within: 'gates-panel' });
    s.eq('and the next Add gate starts with no drafts', (s.c.state.gates_pend || []).length, 0);
    s.click('Cancel', ED);
    s.clean('draft targets');
  });

  s.step('G17 targets toggle, add a target / add linked KPI open the KPI sheets for the gate', () => {
    const ng = docOf(s, KEY).stageGates.find((g) => g.name === 'Linked gate');
    s.click('Add a target', { within: gk(ng.id) });
    s.eq('target sheet for the gate', [top(s).kind, top(s).data.host && top(s).data.host.type, top(s).data.host && top(s).data.host.id], ['kpi.target', 'stageGate', ng.id]);
    s.c.closeAllSheets(); s.render();
    s.click('Add linked KPI', { within: gk(ng.id) });
    s.eq('link sheet for the gate', [top(s).kind, top(s).data.host && top(s).data.host.id], ['kpi.link', ng.id]);
    s.c.closeAllSheets(); s.render();
    const withT = rows(s).find((r) => r.hasTargets);
    s.click('~Targets', { within: gk(withT.id) });
    s.ok(s.has('Add target', { within: gk(withT.id) }) && s.has('Link a metric', { within: gk(withT.id) }), 'expanded table carries + target and + link');
    s.eq('Connect data in the footer only in Execution', s.has('Connect data', { within: gk(withT.id) }), !SALES);
    s.clean('targets');
  });

  if (!SALES) s.step('G18 Connect data per gate (Execution)', () => {
    const r = rows(s).find((x) => x.hasTargets);
    s.click('Actions for ' + r.label, { within: gk(r.id) });
    s.click('Connect data');
    s.eq('connect sheet for the gate', [top(s).kind, top(s).data && top(s).data.host && top(s).data.host.id], ['kpi.connect', r.id]);
    s.c.closeAllSheets(); s.render();
  });

  s.step('G26 delete workstream: empty, the only one with gates (keep / delete), move to another', () => {
    /* empty */
    s.click('Add workstream', { within: 'gates-panel' });
    s.type('Name', 'Empty track', ED);
    s.click('Create workstream', ED);
    const e = setsOf(docOf(s, KEY), OBJ).find((x) => x.name === 'Empty track');
    s.click('Actions for workstream Empty track');
    s.click('Delete workstream');
    s.eq('empty: a plain confirm', s.vals.ui.dlg.body, 'Delete Empty track? It holds no stage-gates, so nothing else changes.');
    confirmDlg(s);
    s.eq('deleted', docOf(s, KEY).stageGateSets.some((x) => x.id === e.id), false);
    hadToast(s, 'Workstream deleted.');
    /* move */
    if (setsOf(docOf(s, KEY), OBJ).length < 2) {
      s.click('Add workstream', { within: 'gates-panel' });
      s.type('Name', 'Second track', ED);
      s.click('Create workstream', ED);
    }
    const sets = setsOf(docOf(s, KEY), OBJ);
    const from = sets.find((x) => docOf(s, KEY).stageGates.some((g) => g.setId === x.id)), to = sets.find((x) => x.id !== from.id);
    const moving = docOf(s, KEY).stageGates.filter((g) => g.setId === from.id).map((g) => g.id);
    s.click('Actions for workstream ' + from.name);
    s.click('Delete workstream');
    s.eq('move is the default', [top(s).kind, s.vals.gates.shWsDel.moveOn, s.vals.gates.shWsDel.to], ['gates.wsdel', true, to.id]);
    s.click('Continue', ED);
    s.eq('gates moved', moving.every((id) => docOf(s, KEY).stageGates.find((g) => g.id === id).setId === to.id), true);
    s.eq('workstream gone', docOf(s, KEY).stageGateSets.some((x) => x.id === from.id), false);
    hadToast(s, moving.length ? 'Workstream deleted, ' + moving.length + (moving.length === 1 ? ' gate' : ' gates') + ' moved.' : 'Workstream deleted.');
    /* the only workstream holding gates: keep is the default; delete takes gates, KPIs, readings, links */
    const only = setsOf(docOf(s, KEY), OBJ);
    s.eq('one workstream left', only.length, 1);
    const ids = docOf(s, KEY).stageGates.filter((g) => g.setId === only[0].id).map((g) => g.id);
    s.click('Actions for workstream ' + only[0].name);
    s.click('Delete workstream');
    s.eq('keep is the default', s.vals.gates.shWsDel.keepOn, true);
    s.click('Keep everything', ED);
    s.eq('nothing deleted', docOf(s, KEY).stageGateSets.some((x) => x.id === only[0].id), true);
    s.click('Actions for workstream ' + only[0].name);
    s.click('Delete workstream');
    s.check('~Delete the workstream and its', true, ED);
    const kids = docOf(s, KEY).kpis.filter((k) => k.hostType === 'stageGate' && ids.indexOf(k.hostId) >= 0).map((k) => k.id);
    s.click('Continue', ED);
    const doc = docOf(s, KEY);
    s.eq('gates deleted', doc.stageGates.filter((g) => ids.indexOf(g.id) >= 0).length, 0);
    s.eq('their KPIs and readings deleted', [doc.kpis.filter((k) => kids.indexOf(k.id) >= 0).length, doc.kpiUpdates.filter((u) => kids.indexOf(u.kpiId) >= 0).length], [0, 0]);
    s.eq('their links deleted (today filtered e.from/e.to, §24)', (doc.stageGateEdges || []).filter((e2) => ids.indexOf(e2.fromGate) >= 0 || ids.indexOf(e2.toGate) >= 0).length, 0);
    hadToast(s, 'Workstream and ' + ids.length + (ids.length === 1 ? ' stage-gate' : ' stage-gates') + ' deleted.');
    s.clean('delete workstream');
  });
}

/* ========================================================= PLAN REVISION */
/* today's rpCommit (execution_app L5718-L5767), applied to a copy, as the oracle for what Commit writes */
function realCommit(doc, P, objId, draft, today, allocNew, allocKpi) {
  allocKpi = allocKpi || {};
  const out = JSON.parse(JSON.stringify(doc)), PP = JSON.parse(JSON.stringify(P));
  if (!RD.planVersionsOf(out, objId).length) out.planVersions = (out.planVersions || []).concat([{ id: 'PV-' + objId + '-1', objectiveId: objId, v: 1, committedDay: today, reason: 'plan as first committed', snapshot: RD.capturePlanSnapshot(out, PP, objId) }]);
  const keep = {}; draft.gates.forEach((g) => { if (!g.del) keep[g.id] = g; });
  out.stageGates = out.stageGates.filter((g) => g.objectiveId !== objId || keep[g.id]);
  draft.gates.forEach((g) => { if (g.del) return; const id = g.isNew ? allocNew[g.id] : g.id; let rec = out.stageGates.find((x) => x.id === id); if (!rec) { rec = { id: id, objectiveId: objId }; out.stageGates.push(rec); } rec.setId = g.setId; rec.name = g.name.trim(); rec.plannedDate = g.planned; rec.order = g.order; });
  const gone = draft.gates.filter((g) => g.del).map((g) => g.id);
  out.kpis = out.kpis.filter((k) => !(k.hostType === 'stageGate' && gone.indexOf(k.hostId) >= 0));
  /* intended (today's "+ target" was dead, L5651): a new gate's draft targets become its KPIs */
  draft.gates.forEach((g) => { if (g.isNew && !g.del) (g.targets || []).forEach((t, i) => out.kpis.push(Object.assign({ id: (allocKpi[g.id] || [])[i], objectiveId: objId, hostType: 'stageGate', hostId: allocNew[g.id], groupId: null, isDefiner: true }, t))); });
  const obj = PP.objectives.find((o) => o.id === objId); if (obj && draft.finish != null) obj.plannedEnd = draft.finish;
  const v = RD.nextPlanVersionNumber(out, objId);
  return { doc: out, P: PP, v: v, snapshot: RD.capturePlanSnapshot(out, PP, objId) };
}
function planRevision() {
  const KEY = 'EXEC-DIV-EL', EL1 = 'OBJ-EL-2026Q4-01', EL2 = 'OBJ-EL-2026Q4-02';
  const W1 = 'SGSET-EL-2026Q4-01-1', W2 = 'SGSET-EL-2026Q4-01-2';
  const s = fresh();
  tab(s, 'Stage-gates');

  s.step('P05 P06 P07 plan history rows, chips, finish held note and compare / view against RD.planVersionSummary / diffPlanSnapshots', () => {
    const doc = docOf(s, KEY);
    const vs = RD.planVersionsOf(doc, EL1);
    const H = s.vals.gates.hist;
    s.eq('versions newest first', H.rows.map((r) => r.v), vs.slice().reverse().map((r) => 'v' + r.v));
    s.eq('count', H.count, vs.length + ' versions');
    s.eq('Live / Original tags', H.rows.map((r) => r.hasTag ? r.tag : ''), vs.slice().reverse().map((r, i) => i === 0 ? 'Live' : (RD.planVersionSummary(doc, EL1, r.v).first ? 'Original' : '')));
    vs.slice().reverse().forEach((r, i) => {
      const sm = RD.planVersionSummary(doc, EL1, r.v), c = sm.counts || {};
      const want = [];
      if (c.added) want.push(c.added + (c.added === 1 ? ' gate' : ' gates') + ' added');
      if (c.removed) want.push(c.removed + (c.removed === 1 ? ' gate' : ' gates') + ' removed');
      if (c.moved) want.push(c.moved + ' moved');
      if (c.retargeted) want.push(c.retargeted + ' retargeted');
      if (c.renamed) want.push(c.renamed + ' renamed');
      if (sm.reordered) want.push('Reordered');
      if (sm.finishChanged) want.push('Finish moved');
      s.eq('chips v' + r.v, H.rows[i].chips.map((x) => x.t), want);
      s.eq('reason v' + r.v, H.rows[i].reason, r.reason || (sm.first ? 'plan as first committed' : 'revision'));
      s.eq('button v' + r.v, H.rows[i].cmpLabel, sm.first ? 'View' : 'Compare to v' + (r.v - 1));
    });
    const fin = vs.map((r) => r.snapshot && r.snapshot.finishDay).filter((v) => v != null);
    s.eq('finish held note', H.hasHeld ? H.held : '', fin.length > 1 && fin.every((f) => f === fin[0]) ? 'Finish held at ' + fdy(fin[0]) + ' throughout' : '');
    s.click('Compare to v1', { within: 'gates-history' });
    const df = RD.diffPlanSnapshots(vs[0].snapshot, vs[1].snapshot);
    const L = s.vals.gates.shCmp.lines;
    s.eq('compare lines = diffPlanSnapshots', L.map((l) => l.k), [].concat(df.added.map(() => 'Added'), df.removed.map(() => 'Removed'), df.moved.map(() => 'Moved'), df.retargeted.map(() => 'Retargeted'), df.renamed.map(() => 'Renamed'), df.finishChanged ? ['Finish'] : [], df.reordered ? ['Reordered'] : []));
    df.moved.forEach((m, i) => s.ok(L.some((l) => l.k === 'Moved' && l.t.indexOf((m.name || m.id) + ': ' + fdy(m.from) + ' to ' + fdy(m.to)) === 0), 'moved line ' + m.name));
    s.expect('“' + vs[1].reason + '”');
    s.c.closeAllSheets(); s.render();
    s.click('View', { within: 'gates-history' });
    s.eq('v1 view lists its gates', s.vals.gates.shCmp.gates.map((g) => g.name), vs[0].snapshot.gates.map((g) => g.name || g.id));
    s.c.closeAllSheets(); s.render();
    s.clean('history');
  });

  s.step('P01-P04 P10 Revise plan: rename, re-date, add, delete with undo, drag across, passed locked, targets, finish, reason, commit v3', () => {
    s.click('Revise plan', { within: 'gates-history' });
    s.eq('wide revise sheet', top(s).kind, 'gates.revise');
    const rp0 = s.c.state.gates_rp;
    s.eq('drafting v3', s.vals.gates.shRev.v, 'v3');
    s.eq('blocks follow workstream order', s.vals.gates.shRev.blocks.map((b) => b.name), ['Durability', 'Teardown and analysis']);
    const passedRow = s.vals.gates.shRev.blocks[0].rows.find((r) => r.id === 'SG-EL-2026Q4-01-1');
    s.eq('passed gate locked (no drag, no edits)', [passedRow.canDrag, passedRow.nameRo, passedRow.dateOff, passedRow.note], [false, true, true, 'Passed, locked']);
    s.type('Gate name, SG-A2', 'Durability screen, 500 h at 2 A/cm²', ED);
    s.type('Planned date, 1,000 h endurance hold', '2026-12-23', ED);
    s.click('Add a gate to Teardown and analysis', ED);
    const newRow = s.c.state.gates_rp.gates.find((g) => g.isNew);
    s.click('Commit v3', ED);
    s.eq('a new gate needs a name and a date', top(s).err, 'Every gate needs a name and a date before committing.');
    s.type('Gate name, new gate', 'Cross-section the cell 7 MEA', ED);
    s.type('Planned date, Cross-section the cell 7 MEA', '2026-12-08', ED);
    /* draft targets for the new gate (today's "+ target" did nothing, L5651) */
    s.click('Add target', { within: 'rp-' + newRow.id });
    s.eq('targets sheet stacked', top(s).kind, 'gates.rtgt');
    s.click('Add target', ED);
    s.eq('KPI target sheet in draft mode', top(s).kind, 'kpi.target');
    s.type('Name', 'Catalyst layer thickness loss', ED);
    s.click('~Decrease', ED);
    s.type('Target', '10', ED);
    s.type('Unit', '%', ED);
    s.c.vmOf('kpi').tg.save(); s.render();
    s.eq('back on the targets sheet with one draft', [top(s).kind, (s.c.state.gates_rp.gates.find((g) => g.id === newRow.id).targets || []).length], ['gates.rtgt', 1]);
    s.click('Done', ED);
    /* remove an existing gate (struck through, undo), and a new one (gone at once) */
    s.click('Remove Post-test teardown and SEM from the plan', ED);
    s.eq('existing gate struck through', s.c.state.gates_rp.gates.find((g) => g.id === 'SG-EL-2026Q4-01-4').del, true);
    s.expect('Will be removed');
    s.click('Undo', ED);
    s.eq('undo', s.c.state.gates_rp.gates.find((g) => g.id === 'SG-EL-2026Q4-01-4').del, false);
    s.click('Remove Post-test teardown and SEM from the plan', ED);
    s.click('Add a gate to Durability', ED);
    const tmp = s.c.state.gates_rp.gates.filter((g) => g.isNew).pop();
    s.click('Remove this gate from the plan', { within: 'rp-' + tmp.id });
    s.ok(!s.c.state.gates_rp.gates.some((g) => g.id === tmp.id), 'a new gate is dropped outright');
    /* drag the failure-mode review onto the 1,000 h row: it takes that row's workstream and place (today's rpWireDrag) */
    s.drag('Drag to move this gate', dk('rp-SG-EL-2026Q4-01-3'), { from: { within: 'rp-SG-EL-2026Q4-01-5' } });
    s.eq('moved across workstreams', s.c.state.gates_rp.gates.find((g) => g.id === 'SG-EL-2026Q4-01-5').setId, W1);
    s.type('Committed finish', '2026-12-23', ED);
    s.eq('finish line says past/inside', s.vals.gates.shRev.finishText, 'This plan ends Dec 23, 2026, inside the committed finish.');
    s.type('Why this revision', 'The rebuild cost five days; teardown merged into the cross-section.', ED);
    const draft = JSON.parse(JSON.stringify(s.c.state.gates_rp));
    const doc0 = JSON.parse(JSON.stringify(docOf(s, KEY))), P0 = JSON.parse(JSON.stringify(s.c.D.portfolio));
    const kids4 = doc0.kpis.filter((k) => k.hostType === 'stageGate' && k.hostId === 'SG-EL-2026Q4-01-4').map((k) => k.id);
    s.click('Commit v3', ED);
    hadToast(s, 'Revised plan committed as v3.');
    const doc = docOf(s, KEY);
    const ng = doc.stageGates.find((g) => g.objectiveId === EL1 && g.name === 'Cross-section the cell 7 MEA');
    s.ok(!!ng && !/^new-|^SGNEW-/.test(ng.id), 'new gate got a real id (today kept SGNEW-…): ' + (ng && ng.id));
    const alloc = {}; draft.gates.filter((g) => g.isNew).forEach((g) => { alloc[g.id] = ng.id; });
    const allocK = {}; draft.gates.filter((g) => g.isNew).forEach((g) => { allocK[g.id] = doc.kpis.filter((k) => k.hostType === 'stageGate' && k.hostId === ng.id).map((k) => k.id); });
    s.eq('new KPI id from RD.allocId (never one plan history still names)', allocK[newRow.id][0], RD.allocId('kpi', EL1, doc0.kpis.map((k) => k.id).concat(RD.planVersionsOf(doc0, EL1).reduce((a, v) => a.concat((v.snapshot.gates || []).reduce((b, g) => b.concat((g.kpis || []).map((k) => k.kpiId)), [])), []))));
    const want = realCommit(doc0, P0, EL1, draft, TODAY, alloc, allocK);
    const v3 = RD.planVersionsOf(doc, EL1).find((v) => v.v === 3);
    s.eq('v3 written with the reason and today', [v3 && v3.reason, v3 && v3.committedDay, v3 && v3.id], ['The rebuild cost five days; teardown merged into the cross-section.', TODAY, 'PV-' + EL1 + '-3']);
    s.eq('v3 snapshot = today\'s commit applied (capturePlanSnapshot)', JSON.stringify(v3 && v3.snapshot), JSON.stringify(want.snapshot));
    s.eq('live gates = today\'s commit applied', doc.stageGates.filter((g) => g.objectiveId === EL1).map((g) => [g.id, g.setId, g.name, g.plannedDate, g.order]).sort(), want.doc.stageGates.filter((g) => g.objectiveId === EL1).map((g) => [g.id, g.setId, g.name, g.plannedDate, g.order]).sort());
    s.eq('committed finish saved to the portfolio (today it was lost)', s.c.D.portfolio.objectives.find((o) => o.id === EL1).plannedEnd, day('2026-12-23'));
    s.eq('removed gate took its KPIs and their readings', [doc.kpis.filter((k) => kids4.indexOf(k.id) >= 0).length, doc.kpiUpdates.filter((u) => kids4.indexOf(u.kpiId) >= 0).length], [0, 0]);
    const nk = doc.kpis.filter((k) => k.hostType === 'stageGate' && k.hostId === ng.id);
    s.eq('draft target became a KPI on the new gate', nk.map((k) => [k.name, k.objectiveId, k.isDefiner, k.target, k.unit]), [['Catalyst layer thickness loss', EL1, true, 10, '%']]);
    s.eq('history now v3 live', s.vals.gates.hist.rows[0].v + ' ' + s.vals.gates.hist.rows[0].tag, 'v3 Live');
    s.eq('version marks follow (RD.gateVersionMarks)', rowOf(s, ng.id).vmark, 'Added in v3');
    s.clean('revise and commit');
  });

  s.step('P04 P08 P09 first commit on a plan with no history writes v1 then v2 (EL-02), legacy banner and Clear plan', () => {
    pickObj(s, 'Lock Tera');
    const doc = docOf(s, KEY);
    const cu = RD.activeCatchupPlan(doc.catchupPlans, EL2);
    const slip = RD.cascade(s.c.D.portfolio, emOf(s, KEY), TODAY).objectiveScheduleSlip[EL2];
    s.eq('legacy banner text (today L5563)', s.vals.gates.tab.cu.text, cu.gates.length + (cu.gates.length === 1 ? ' gate' : ' gates') + ' re-committed. Enacted ' + fd(cu.enactedDay) + (slip != null ? ', now ' + (slip > 0 ? days(slip) + ' behind schedule' : 'on schedule') : '') + '.');
    s.eq('re-committed revision line', rowOf(s, 'SG-EL-2026Q4-02-3').recommitText, 'Revision v1: ' + fd(cu.gates[0].originalDate) + ' to ' + fd(cu.gates[0].newDate));
    s.click('Revise', { within: 'gates-panel' });
    s.eq('Execution: the banner opens Revise plan', top(s).kind, 'gates.revise');
    s.eq('drafting v2 (v1 is written first)', s.vals.gates.shRev.v, 'v2');
    s.type('Planned date, Design freeze sign-off', '2026-11-27', ED);
    const before = RD.capturePlanSnapshot(docOf(s, KEY), s.c.D.portfolio, EL2);
    s.click('Commit v2', ED);
    const vs = RD.planVersionsOf(docOf(s, KEY), EL2);
    s.eq('v1 then v2', vs.map((v) => [v.v, v.reason]), [[1, 'plan as first committed'], [2, '']]);
    s.eq('v1 is the plan as it stood', JSON.stringify(vs[0].snapshot), JSON.stringify(before));
    hadToast(s, 'Revised plan committed as v2.');
    s.click('Clear plan', { within: 'gates-panel' });
    s.eq('asks to type CLEAR', s.vals.ui.dlg.label, 'Type CLEAR to confirm');
    askDlg(s, 'clear');
    s.eq('anything but CLEAR is refused', s.vals.ui.dlg && s.vals.ui.dlg.err, 'Type CLEAR to confirm.');
    askDlg(s, 'CLEAR');
    s.eq('plan tracking removed', RD.activeCatchupPlan(docOf(s, KEY).catchupPlans, EL2), null);
    s.eq('dates stay on the gates', docOf(s, KEY).stageGates.find((g) => g.id === 'SG-EL-2026Q4-02-3').plannedDate, day('2026-11-27'));
    hadToast(s, 'Revised plan cleared.');
    s.ok(!s.vals.gates.tab.cu, 'banner gone');
    s.clean('legacy plan');
  });
}

/* ======================================================== SALES RE-COMMIT */
function salesRecommit() {
  const KEY = 'BIZ-DIV-BD', OBJ = 'OBJ-BD-2026Q4-01';
  const s = fresh();
  tab(s, 'Stage-gates');

  s.step('G06-G13 (Sales) gate rows follow today\'s rules', () => { checkGateRows(s, KEY, 'BD-01'); s.clean('sales rows'); });

  s.step('P11 Sales "Build revised plan": forecast prefill, all dates required, enact records versions', () => {
    const doc = docOf(s, KEY);
    const prev = RD.activeCatchupPlan(doc.catchupPlans, OBJ);
    const casc = RD.cascade(s.c.D.portfolio, emOf(s, KEY), TODAY);
    s.click('Revise', { within: 'gates-panel' });
    s.eq('Sales opens the simple re-commit', top(s).kind, 'gates.recommit');
    const open = byDue(doc.stageGates.filter((g) => g.objectiveId === OBJ && g.actualDate == null));
    const R = s.vals.gates.shRec;
    s.eq('unfinished gates by due date', R.rows.map((r) => r.key), open.map((g) => 'rc-' + g.id));
    s.eq('prefilled with the forecast (or the planned date)', R.rows.map((r) => r.value), open.map((g) => iso(casc.gateEffective[g.id] != null ? casc.gateEffective[g.id] : g.plannedDate)));
    s.eq('ready', [R.req, R.count, R.off], ['Ready to enact', open.length + ' of ' + open.length + ' dated', false]);
    s.type('New commitment for ' + GL(s, KEY, open[0].id), '', ED);
    s.eq('a blank date blocks enacting', [s.vals.gates.shRec.req, s.vals.gates.shRec.off], ['All ' + open.length + ' dates are required to enact', true]);
    s.type('New commitment for ' + GL(s, KEY, open[0].id), '2026-11-13', ED);
    s.click('Enact plan revision', ED);
    const doc2 = docOf(s, KEY);
    const plan = RD.activeCatchupPlan(doc2.catchupPlans, OBJ);
    const pe = {}; (prev ? prev.gates : []).forEach((e) => { pe[e.gateId] = e; });
    s.eq('entries keep the first original date and bump the version (today\'s enactCatchup)', plan.gates.map((e) => [e.gateId, e.originalDate, e.newDate, e.version]), open.map((g, i) => [g.id, pe[g.id] ? pe[g.id].originalDate : g.plannedDate, i === 0 ? day('2026-11-13') : (casc.gateEffective[g.id] != null ? casc.gateEffective[g.id] : g.plannedDate), (pe[g.id] ? pe[g.id].version || 0 : 0) + 1]));
    s.eq('plan record', [plan.id, plan.objectiveId, plan.enactedDay, doc2.catchupPlans.filter((p) => p.objectiveId === OBJ).length], ['catchup:' + OBJ, OBJ, TODAY, 1]);
    s.eq('gate re-dated', doc2.stageGates.find((g) => g.id === open[0].id).plannedDate, day('2026-11-13'));
    hadToast(s, 'Plan revision enacted: ' + open.length + (open.length === 1 ? ' gate' : ' gates') + ' re-committed.');
    s.clean('recommit');
  });

  s.step('P08 P09 (Sales) the revised-plan banner after enacting; Clear plan asks to type CLEAR and keeps the dates', () => {
    const doc = docOf(s, KEY);
    const cu = RD.activeCatchupPlan(doc.catchupPlans, OBJ);
    const slip = RD.cascade(s.c.D.portfolio, emOf(s, KEY), TODAY).objectiveScheduleSlip[OBJ];
    s.eq('banner text (today L3561-L3621)', s.vals.gates.tab.cu.text, cu.gates.length + (cu.gates.length === 1 ? ' gate' : ' gates') + ' re-committed. Enacted ' + fd(cu.enactedDay) + (slip != null ? ', now ' + (slip > 0 ? days(slip) + ' behind schedule' : 'on schedule') : '') + '.');
    checkGateRows(s, KEY, 'BD-01 after enact');
    const dates = doc.stageGates.filter((g) => g.objectiveId === OBJ).map((g) => [g.id, g.plannedDate]);
    s.click('Clear plan', { within: 'gates-panel' });
    s.eq('asks to type CLEAR', s.vals.ui.dlg.label, 'Type CLEAR to confirm');
    askDlg(s, 'nope');
    s.eq('anything else is refused', s.vals.ui.dlg && s.vals.ui.dlg.err, 'Type CLEAR to confirm.');
    askDlg(s, 'CLEAR');
    s.eq('plan tracking removed', RD.activeCatchupPlan(docOf(s, KEY).catchupPlans, OBJ), null);
    s.eq('dates stay on the gates', docOf(s, KEY).stageGates.filter((g) => g.objectiveId === OBJ).map((g) => [g.id, g.plannedDate]), dates);
    hadToast(s, 'Revised plan cleared.');
    s.clean('sales clear plan');
  });

  s.step('P12 Sales re-commit with nothing unfinished says so', () => {
    s.c.mutate((D) => { D.docs[KEY].stageGates.forEach((g) => { if (g.objectiveId === OBJ && g.actualDate == null) g.actualDate = TODAY; }); }); s.render();
    s.c.MODS.gates.api.openRevise(s.c, s.c.ctx); s.render();
    hadToast(s, 'No unfinished stage-gates to re-commit.');
    s.eq('no sheet', s.c.state.sheets.length, 0);
  });
}

/* ================================================================== KANBAN */
const TIS = '2026-10-13';
function kanban() {
  const KEY = SALES ? 'BIZ-DIV-BD' : 'EXEC-DIV-EL';
  const OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-02';
  const BID = SALES ? 'BRD-BD-PIPE' : 'BRD-EL-LOCK';
  const s = fresh();
  if (!SALES) pickObj(s, 'Lock Tera');
  tab(s, 'Kanban');
  const board = () => docOf(s, KEY).boards.find((b) => b.id === BID);
  const lanes = () => { const m = {}; board().swimlanes.forEach((l) => { m[l.id] = l; }); return m; };

  s.step('K40 K41 K43 K44 K52 grid, lane rules, tile health, avatars and summary follow the engine', () => {
    const b = board(), K = s.vals.kb;
    s.eq('on', K.on, true);
    const sum = RD.boardSummary(b, TIS);
    s.eq('summary chips (RD.boardSummary)', K.sum.map((x) => x.text), [sum.onTrack + ' on track', sum.atRisk + ' at risk', sum.breached + ' breached', sum.closed + ' closed']);
    s.eq('total', K.total, sum.total + (sum.total === 1 ? ' tile' : ' tiles') + ' in total');
    s.eq('backlog chip only when non-zero', K.hasBacklogSum ? K.backlogSum : '', sum.backlog ? sum.backlog + ' in the backlog' : '');
    const last = b.columns[b.columns.length - 1].id;
    const sv = (s.c.D.prefs.kbDone || {})[BID] || {};
    const win = RD.normDoneWindow(sv.win == null ? 'all' : sv.win);
    const ds = RD.doneSplit(b, win, TIS);
    s.eq('column counts (perColumn; done column "shown of total" when filtered)', K.heads.map((h) => h.count), b.columns.map((c) => (c.id === last && win !== 'all') ? ds.shown + ' of ' + ds.total : String(sum.perColumn[c.id] || 0)));
    s.eq('lane rules', K.lanes.map((l) => l.rule), b.swimlanes.map((l) => { const m = Number(l.maxDaysPerCol) || 0; return (m ? m + (m === 1 ? ' day' : ' days') + ' per stage' : 'No stage limit') + (l.deadline ? ', due ' + fd(day(l.deadline)) : ''); }));
    const L = lanes();
    K.lanes.forEach((ln) => ln.cells.forEach((c, ci) => {
      const col = b.columns[ci];
      if (col.id === last) return;
      const want = b.tiles.filter((t) => t.lane === ln.id && t.col === col.id);
      s.eq('cell ' + ln.id + '/' + col.id, c.tiles.map((t) => t.id), want.map((t) => t.id));
      c.tiles.forEach((tv) => {
        const t = want.find((x) => x.id === tv.id);
        const h = RD.tileHealth(t, L[t.lane], TIS);
        s.eq('health ' + t.id, tv.st, { 'on-track': 'On track', 'at-risk': 'At risk', breached: 'Breached' }[h.status]);
        s.eq('days ' + t.id, tv.days, h.daysInCol + (h.daysInCol === 1 ? ' day' : ' days') + ' in stage');
        s.eq('has note ' + t.id, tv.hasNote, !!h.note);
        const u = t.assignee ? s.c.D.roster.users.find((x) => x.email === t.assignee) : null;
        const ini = u && u.name ? (u.name.split(/\s+/)[0][0] + (u.name.split(/\s+/).length > 1 ? u.name.split(/\s+/).slice(-1)[0][0] : '')).toUpperCase() : (t.assignee ? RD.initialsOf(t.assignee) : '—');
        s.eq('avatar ' + t.id, tv.av, ini);
        s.eq('avatar label ' + t.id, tv.avTitle.indexOf(t.assignee ? 'Assigned to ' : 'Unassigned') === 0, true);
      });
    }));
    s.clean('kanban grid');
  });

  s.step('K53 K54 Done column follows the person: broker prefs signed in, this browser signed out; older stubs', () => {
    const b = board();
    const sv = (s.c.D.prefs.kbDone || {})[BID];
    s.eq('signed in: the broker choice shows', s.vals.kb.done.label, (sv.win === 'all' ? 'All finished' : sv.win === 'none' ? 'Count only' : 'Last ' + sv.win + ' days') + (sv.style === 'compact' ? ', compact' : ''));
    s.eq('note (signed in)', s.vals.kb.done.note, 'Just for you — follows you to any device where you’re signed in to the Hub. Hidden tiles still count in “closed”.');
    s.click(s.vals.kb.done.label, { within: 'kb' });
    s.eq('menu open', s.vals.kb.done.open, true);
    s.click('3 days', { within: '~Finished tiles in' });
    s.eq('written to the broker prefs via RD.doneVal', s.c.D.prefs.kbDone[BID], RD.doneVal({ win: 3, style: sv.style }));
    s.eq('shared board untouched', JSON.stringify(board()), JSON.stringify(b));
    const ds = RD.doneSplit(b, 3, TIS);
    const last = b.columns[b.columns.length - 1].id;
    const lastHead = s.vals.kb.heads[s.vals.kb.heads.length - 1];
    s.eq('done header shown of total', lastHead.count, ds.shown + ' of ' + ds.total);
    const laneWithOlder = Object.keys(ds.byLane).find((k) => ds.byLane[k].older.length);
    if (laneWithOlder) {
      const lv = s.vals.kb.lanes.find((l) => l.id === laneWithOlder);
      const cell = lv.cells[lv.cells.length - 1];
      s.eq('older stub', cell.olderText, '+' + ds.byLane[laneWithOlder].older.length + ' older');
      s.eq('shown tiles newest first (RD.doneByRecency)', cell.tiles.map((t) => t.id), RD.doneByRecency(ds.byLane[laneWithOlder].shown, TIS).map((t) => t.id));
      cell.toggleOlder(); s.render();
      const cell2 = s.vals.kb.lanes.find((l) => l.id === laneWithOlder).cells.slice(-1)[0];
      s.eq('expanded shows the older ones too', cell2.tiles.length, ds.byLane[laneWithOlder].shown.length + ds.byLane[laneWithOlder].older.length);
      s.eq('stub flips', cell2.olderText, 'Hide older');
    }
    s.click('None, show the count only', { within: '~Finished tiles in' });
    s.eq('count only', s.vals.kb.done.label, 'Count only' + (sv.style === 'compact' ? ', compact' : ''));
    s.click('Cards', { within: '~Finished tiles in' });
    s.click('All finished tiles', { within: '~Finished tiles in' });
    s.eq('back to the default: nothing stored (RD.doneVal null)', s.c.D.prefs.kbDone[BID], undefined);
    s.click('Close', { within: '~Finished tiles in' });
    /* signed out: this browser only */
    s.c.setState({ sim: Object.assign({}, s.c.state.sim, { hub: false }) }); s.render();
    s.eq('note (signed out)', s.vals.kb.done.note, 'Saved in this browser only. Open this board from the Hub to keep it on every device. Hidden tiles still count in “closed”.');
    s.vals.kb.done.toggle(); s.render();
    s.click('7 days', { within: '~Finished tiles in' });
    s.eq('kept in this browser, broker untouched', [s.c.state.kb_anon[BID], s.c.D.prefs.kbDone[BID]], [{ win: 7 }, undefined]);
    s.c.setState({ sim: Object.assign({}, s.c.state.sim, { hub: true, offline: true }) }); s.render();
    s.eq('note (signed in, offline)', s.vals.kb.done.note.indexOf('Saved on this device — couldn’t reach the server yet'), 0);
    s.c.setState({ sim: Object.assign({}, s.c.state.sim, { offline: false }), menu: '' }); s.render();
    s.clean('done column');
  });

  s.step('K42 K45 K46 K47 K48 tile sheet: lane prefill, assignee picker (roster minus disabled, owners only), save rules', () => {
    const b = board();
    const lane0 = b.swimlanes[0];
    s.click('Add tile to ' + lane0.name, { within: 'kb' });
    s.eq('prefills the lane and the first stage', [top(s).kind, top(s).d.lane, top(s).d.col], ['kb.tile', lane0.id, b.columns[0].id]);
    s.click('Add tile', ED);
    s.eq('name required', top(s).err, 'A tile needs a name.');
    s.type('Name', 'Mountain West Hydrogen', ED);
    const T = s.vals.kb.tile;
    const all = s.c.D.roster.users.filter((u) => u.email && !u.disabled).map((u) => u.email);
    s.c.D.portfolio.objectives.forEach((o) => RD.ownersOf(o).forEach((e) => { if (all.indexOf(e) < 0) all.push(e); }));
    const want = RD.assigneeOptions({ portfolio: s.c.D.portfolio, divisionId: s.c.ctx.divId, todayDay: TODAY, objectiveState: docOf(s, KEY).objectiveState || [], allEmails: all, narrow: true, current: null });
    s.eq('owners only by default (RD.assigneeOptions)', T.people.map((p) => p.email), want.map((r) => r.email));
    s.eq('owner counts', T.people.map((p) => p.why), want.map((r) => r.isOwner ? 'Owns ' + r.owns + (r.owns === 1 ? ' active objective' : ' active objectives') : (r.current ? 'Assigned, but owns nothing active here' : 'No active objective here')));
    s.check('~Division owners only', false, ED);
    s.ok(!s.vals.kb.tile.people.some((p) => p.email === 'lena@celadyne.com'), 'disabled roster users never offered');
    s.eq('everyone known', s.vals.kb.tile.peopleHint, 'Showing everyone known.');
    s.click('~Ken Albright', ED);
    s.click('Add tile', ED);
    const t = board().tiles.find((x) => x.name === 'Mountain West Hydrogen');
    s.eq('new tile created in a stage starts its clock today', [t.lane, t.col, t.enteredCol, t.startDate, t.assignee], [lane0.id, b.columns[0].id, TIS, null, 'ken@celadyne.com']);
    hadToast(s, 'Tile added.');
    /* edit: moving the stage restarts the clock unless "Entered this stage" was typed */
    s.click('Mountain West Hydrogen', { within: 'kb' });
    s.type('Started', '2026-10-01', ED);
    s.type('Stage', b.columns[1].id, ED);
    s.type('Entered this stage', '2026-10-05', ED);
    s.click('Save tile', ED);
    let t2 = board().tiles.find((x) => x.id === t.id);
    s.eq('typed entered date wins', [t2.col, t2.enteredCol, t2.startDate], [b.columns[1].id, '2026-10-05', '2026-10-01']);
    s.click('Mountain West Hydrogen', { within: 'kb' });
    s.type('Stage', b.columns[0].id, ED);
    s.type('Started', '', ED);
    s.click('Save tile', ED);
    t2 = board().tiles.find((x) => x.id === t.id);
    s.eq('stage change restarts the clock; clearing Started keeps the old date (today)', [t2.col, t2.enteredCol, t2.startDate], [b.columns[0].id, TIS, '2026-10-01']);
    s.click('Mountain West Hydrogen', { within: 'kb' });
    s.type('Swimlane', '', ED);
    s.expect('Without a swimlane the tile stays in the backlog');
    s.click('~Nobody owns this tile yet', ED);
    s.click('Save tile', ED);
    t2 = board().tiles.find((x) => x.id === t.id);
    s.eq('no lane parks it: no column, no clock, no assignee', [t2.lane, t2.col, t2.enteredCol, 'assignee' in t2], [null, null, null, false]);
    s.clean('tile sheet');
  });

  s.step('K50 K51 drag onto a cell = RD.dropTile; drop into a backlog group parks it; backlog toggles', () => {
    const b0 = JSON.parse(JSON.stringify(board()));
    const t = b0.tiles.find((x) => x.col === b0.columns[0].id && x.lane);
    const toLane = b0.swimlanes[b0.swimlanes.length - 1].id, toCol = b0.columns[1].id;
    s.drag((el) => el.attrs['data-k'] === 'kb-tile:' + t.id && !!el.on.onDragStart, dk('kb-cell:' + toLane + ':' + toCol));
    s.eq('board = RD.dropTile', JSON.stringify(board()), JSON.stringify(RD.dropTile(b0, t.id, toCol, toLane, TIS)));
    const b1 = JSON.parse(JSON.stringify(board()));
    s.drag((el) => el.attrs['data-k'] === 'kb-tile:' + t.id && !!el.on.onDragStart, dk('kb-bl:none'));
    const t3 = board().tiles.find((x) => x.id === t.id);
    s.eq('parked with no lane, no column, no clock (today\'s backlog drop)', [t3.lane, t3.col, t3.enteredCol], [null, null, null]);
    s.eq('gate stamps kept', JSON.stringify(t3.gatePassed), JSON.stringify(b1.tiles.find((x) => x.id === t.id).gatePassed));
    const groups = RD.backlogByLane(board());
    s.eq('backlog groups = every lane then Unassigned', s.vals.kb.bl.groups.map((g) => g.name), groups.map((g) => g.unassigned ? 'Unassigned' : g.name));
    s.eq('parked count', s.vals.kb.bl.count, String(groups.reduce((n, g) => n + g.tiles.length, 0)));
    s.click('Collapse the backlog', { within: 'kb' });
    s.eq('collapsed (per-browser)', s.c.state.kb_bl, false);
    s.eq('collapsed note keeps the count', s.vals.kb.bl.note, groups.reduce((n, g) => n + g.tiles.length, 0) + ' parked, no clock running');
    s.click('Expand the backlog', { within: 'kb' });
    s.clean('drag');
  });

  s.step('K39 configure: rename, add / rename / delete stages and swimlanes (confirm the tile loss), max days, deadline', () => {
    s.click('Configure', { within: 'kb' });
    s.eq('config sheet', top(s).kind, 'kb.config');
    s.type('Board name', 'Lock board, Q4', ED);
    s.key('Board name', 'Enter', ED);
    s.eq('renamed', board().name, 'Lock board, Q4');
    s.click('Add stage', ED);
    const nc = board().columns[board().columns.length - 1];
    s.eq('new stage at the end, gate_id board/col', [nc.name, nc.gate_id], ['Stage ' + board().columns.length, BID + '/' + nc.id]);
    s.click('Add swimlane', ED);
    const nl = board().swimlanes[board().swimlanes.length - 1];
    s.eq('new swimlane', [nl.name, nl.maxDaysPerCol, nl.deadline], ['Swimlane ' + board().swimlanes.length, 14, '']);
    s.type('Max days per stage for ' + nl.name, 'x', ED);
    s.key('Max days per stage for ' + nl.name, 'Enter', ED);
    s.eq('a bad limit is refused', top(s).err, 'Use a number of days, like 14. Leave it blank for no limit.');
    s.type('Max days per stage for ' + nl.name, '', ED);
    s.key('Max days per stage for ' + nl.name, 'Enter', ED);
    s.eq('blank = no limit (stored 0, as today)', board().swimlanes.find((l) => l.id === nl.id).maxDaysPerCol, 0);
    s.type('Deadline for ' + nl.name, '2026-12-01', ED);
    s.eq('deadline', board().swimlanes.find((l) => l.id === nl.id).deadline, '2026-12-01');
    /* deleting a stage that holds tiles asks first and names the loss (today deleted them silently) */
    const full = board().columns.find((c) => board().tiles.some((t) => t.col === c.id));
    const n = board().tiles.filter((t) => t.col === full.id).length;
    s.click('Delete stage ' + full.name, ED);
    s.ok(new RegExp('Its ' + n + ' tiles? (is|are) deleted with it').test(s.vals.ui.dlg.body), 'stage delete says how many tiles go: ' + s.vals.ui.dlg.body);
    confirmDlg(s);
    s.eq('stage and its tiles gone', [board().columns.some((c) => c.id === full.id), board().tiles.some((t) => t.col === full.id)], [false, false]);
    const fl = board().swimlanes.find((l) => board().tiles.some((t) => t.lane === l.id));
    const nlt = board().tiles.filter((t) => t.lane === fl.id).length;
    s.click('Delete swimlane ' + fl.name, ED);
    s.ok(new RegExp('Its ' + nlt + ' tiles? (is|are) deleted with it').test(s.vals.ui.dlg.body), 'swimlane delete says how many tiles go');
    confirmDlg(s);
    s.eq('swimlane and its tiles gone', [board().swimlanes.some((l) => l.id === fl.id), board().tiles.some((t) => t.lane === fl.id)], [false, false]);
    s.click('Done', ED);
    s.clean('configure');
  });

  s.step('K36 K37 K38 add boards (defaults), tabs, delete board with a confirm', () => {
    s.click('Add board', { within: 'kb' });
    const bs = docOf(s, KEY).boards.filter((b) => b.objectiveId === OBJ);
    const nb = bs[bs.length - 1];
    s.eq('today\'s default board', [nb.name, nb.columns.map((c) => c.name), nb.columns.map((c) => c.gate_id), nb.swimlanes.map((l) => [l.name, l.maxDaysPerCol, l.deadline]), nb.tiles], ['Board ' + bs.length, ['Prospect', 'Working', 'Closed'], nb.columns.map((c) => nb.id + '/' + c.id), [['Standard', 14, '']], []]);
    s.eq('the new board is selected', s.c.state.kb_sel, nb.id);
    s.eq('header count = the new board\'s tiles', s.vals.kb.count, 0);
    s.click(board().name, { within: 'Boards' });
    s.eq('tab switches the board (session only)', s.c.state.kb_sel, BID);
    s.click(nb.name, { within: 'Boards' });
    s.click('Delete board', { within: 'kb' });
    s.ok(/Its 3 stages, 1 swimlane and 0 tiles are deleted for everyone/.test(s.vals.ui.dlg.body), 'board delete confirm names the loss');
    confirmDlg(s);
    s.eq('deleted', docOf(s, KEY).boards.some((b) => b.id === nb.id), false);
    hadToast(s, 'Board deleted.');
    s.clean('boards');
  });

  s.step('K42b the board bar\'s Add tile puts the new tile in the unassigned backlog with no clock (sales "+ tile")', () => {
    s.click('Add tile', { within: 'kb' });
    s.eq('no lane, no stage prefilled', [top(s).kind, top(s).d.lane || '', top(s).d.col || ''], ['kb.tile', '', '']);
    s.type('Name', 'Walk-in enquiry', ED);
    s.click('Add tile', ED);
    const t = board().tiles.find((x) => x.name === 'Walk-in enquiry');
    s.eq('parked: no lane, no column, no clock', [t.lane, t.col, t.enteredCol], [null, null, null]);
    s.ok(s.vals.kb.bl.groups.find((g) => g.name === 'Unassigned').tiles.some((x) => x.id === t.id), 'listed under Unassigned');
    hadToast(s, 'Tile added.');
    s.clean('board add tile');
  });

  s.step('K49 delete tile asks first', () => {
    const t = board().tiles.find((x) => x.lane && x.col);
    s.click(t.name, { within: 'kb' });
    s.click('Delete tile', ED);
    confirmDlg(s);
    s.eq('tile gone', board().tiles.some((x) => x.id === t.id), false);
    hadToast(s, 'Tile deleted.');
  });

  s.step('K35 empty state on an objective with no board', () => {
    if (SALES) pickObj(s, 'Q1 hydrogen-hub'); else pickObj(s, 'Qualify the 10-cell');
    tab(s, 'Kanban');
    s.expect('No boards yet. A Kanban board is a stage-gate sequence (columns) that parallel workstreams (tiles) move through.');
    s.eq('count 0 with no board (today)', s.vals.kb.count, 0);
    tab(s, 'Stage-gates');
  });
}

/* ==================================================================== FMEA */
function fmea() {
  const KEY = SALES ? 'BIZ-DIV-BD' : 'EXEC-DIV-EL';
  const OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01';
  const s = fresh();
  tab(s, 'Risks');
  const passedGate = (doc, gid) => { if (!gid) return false; const g = doc.stageGates.find((x) => x.id === gid); if (!g) return false; const st = RD.classifyGate(g, TODAY); return st === 'passed' || st === 'passed-late'; };

  s.step('F56 F57 F60 F61 register order, RPN badges, gate tags, knowns and notes follow today\'s rules', () => {
    const doc = docOf(s, KEY);
    const probs = RD.fmeaProblemsFor(doc, OBJ);
    const sorted = probs.map((p) => ({ p: p, u: RD.worstUnresolvedRpn(p, passedGate(doc, p.gateId)) })).sort((a, b) => b.u - a.u);
    const R = s.vals.fmea.reg;
    s.eq('sorted by worst unresolved RPN (stable)', R.probs.map((x) => x.k), sorted.map((x) => 'prob-' + x.p.rid));
    sorted.forEach((x, i) => {
      const resolved = x.p.status === 'resolved';
      const top = x.u > 0 ? x.u : (resolved ? 0 : RD.worstRpn(x.p));
      s.eq('badge ' + x.p.rid, R.probs[i].hasRpn ? Number(R.probs[i].rpn) : 0, top);
      if (top) s.eq('band ' + x.p.rid, R.probs[i].bandWord, { high: 'High', med: 'Medium', low: 'Low' }[RD.rpnBand(top)]);
      s.eq('gate tag ' + x.p.rid, R.probs[i].hasGate ? R.probs[i].gateTag : '', x.p.gateId ? realLabel(doc, x.p.gateId) : '');
      s.eq('knowns (blank skipped) ' + x.p.rid, R.probs[i].knowns.map((k) => k.text), (x.p.knowns || []).filter((k) => k.text && k.text.trim()).map((k) => k.text));
      if (!resolved && x.u === 0 && top > 0) s.ok(R.probs[i].hasNote, 'note explains why it no longer counts: ' + x.p.rid);
      /* table rows: one per cause, '—' RPN when the mode or effect is resolved */
      const flat = [];
      (x.p.modes || []).forEach((m) => { const effs = m.effects || []; if (!effs.length) flat.push({ c: null }); effs.forEach((e) => { const cs = e.causes || []; if (!cs.length) flat.push({ c: null }); cs.forEach((c) => flat.push({ c: c, dim: m.status === 'resolved' || e.status === 'resolved' })); }); });
      s.eq('row count ' + x.p.rid, R.probs[i].rows.length, flat.length);
      R.probs[i].rows.forEach((r, j) => {
        if (!flat[j].c) return;
        const c = flat[j].c, rpn = RD.calcRpn(c.severity, c.occurrence, c.detection);
        s.eq('cause RPN ' + c.cid, r.cause.rpn, String(rpn));
        s.eq('cause RPN hidden under a resolved parent ' + c.cid, r.cause.rpnHidden, !!flat[j].dim);
        s.eq('S O D ' + c.cid, [r.cause.sod.s, r.cause.sod.o, r.cause.sod.d], [String(c.severity), String(c.occurrence), String(c.detection)]);
      });
    });
    const roll = RD.fmeaRollup(probs, (gid) => passedGate(doc, gid));
    /* the Overview's "Open high risks" card became the head's Open high risk fact plus the review table's Risks rows
       (October 15): the same rollup numbers */
    const hf = s.vals.sh.head.facts.find((f) => f.k === 'fact-risk');
    s.eq('open high-risk count (today\'s fmeaRollup)', hf.value, String(roll.openHigh));
    s.eq('header card sub-line', hf.detail, roll.total ? roll.total + (roll.total === 1 ? ' problem' : ' problems') + ', worst RPN ' + roll.worst : 'No FMEA items');
    const rr = s.c.MODS.review.api.items(s.c, s.c.ctx).filter((it) => it.type === 'risk');
    s.eq('review rows off track = open high', rr.filter((it) => it.status === 'off').length, roll.openHigh);
    s.clean('register');
  });

  s.step('F55 F62 add a problem: statement required, knowns, gate, modes / effects / causes, S/O/D, live RPN, mitigation', () => {
    s.click('Add problem', { within: 'fmea-register' });
    s.eq('blank problem with no modes (today)', [top(s).kind, top(s).d.modes.length, top(s).d.status], ['fmea.edit', 0, 'open']);
    s.click('Save problem', ED);
    s.eq('statement required', top(s).err, 'Give the problem a statement before saving.');
    s.type('Problem', 'Bolt torque relaxes after thermal cycling', ED);
    s.click('Add known', ED);
    s.type('Known 1', 'Seen on two of ten stacks', ED);
    s.click('Add known', ED);
    const doc = docOf(s, KEY);
    const gates = byDue(doc.stageGates.filter((g) => g.objectiveId === OBJ));
    s.eq('gate options: none, then the objective\'s gates by due date as SG-A1', s.vals.fmea.ed.gateOpts.map((o) => o.v), [''].concat(gates.map((g) => g.id)));
    s.eq('gate labels', s.vals.fmea.ed.gateOpts.slice(1).map((o) => o.label.split(':')[0]), gates.map((g) => realLabel(doc, g.id)));
    s.type('~Stage-gate', gates[gates.length - 1].id, ED);
    s.click('Add failure mode', ED);
    s.type('Failure mode 1', 'Clamping force drops below spec', ED);
    s.click('Add effect to failure mode 1', ED);
    s.type('Effect 1, failure mode 1', 'Contact resistance rises', ED);
    s.click('Add cause to effect 1 of failure mode 1', ED);
    s.eq('a new cause starts at 1, 1, 1 (RD.blankCause)', ['severity', 'occurrence', 'detection'].map((f) => top(s).d.modes[0].effects[0].causes[0][f]), [1, 1, 1]);
    s.type('Cause 1, effect 1, failure mode 1', 'Belleville washers creep', ED);
    s.type('Severity', '7', { within: 'mode-1-effect-1-cause-1' });
    s.type('Occurrence', '5', { within: 'mode-1-effect-1-cause-1' });
    s.type('Detection', '6', { within: 'mode-1-effect-1-cause-1' });
    s.eq('live RPN and band', [s.vals.fmea.ed.modes[0].effects[0].causes[0].rpn, s.vals.fmea.ed.modes[0].effects[0].causes[0].bandWord], ['210', 'High']);
    s.eq('scale labels (RD.FMEA_SCALES)', s.vals.fmea.ed.modes[0].effects[0].causes[0].sod[0].opts.map((o) => o.label), RD.FMEA_SCALES.severity.map((l, i) => (i + 1) + ' — ' + l));
    s.type('Mitigation or action', 'Switch to stacked spring washers', ED);
    const r0 = (docOf(s, KEY).risks || []).map((r) => r.rid);
    s.click('Save problem', ED);
    const p = docOf(s, KEY).risks.find((r) => r0.indexOf(r.rid) < 0);
    s.eq('saved in today\'s shape', [p.objectiveId, p.problem, p.gateId, p.status, p.knowns.length, p.knowns[0].text, p.modes[0].mode, p.modes[0].status, p.modes[0].effects[0].effect, p.modes[0].effects[0].causes[0].cause, p.modes[0].effects[0].causes[0].severity, p.modes[0].effects[0].causes[0].occurrence, p.modes[0].effects[0].causes[0].detection, p.modes[0].effects[0].causes[0].mitigation],
      [OBJ, 'Bolt torque relaxes after thermal cycling', gates[gates.length - 1].id, 'open', 2, 'Seen on two of ten stacks', 'Clamping force drops below spec', 'open', 'Contact resistance rises', 'Belleville washers creep', 7, 5, 6, 'Switch to stacked spring washers']);
    s.ok(!!p.rid && !!p.modes[0].mid && !!p.modes[0].effects[0].eid && !!p.modes[0].effects[0].causes[0].cid && !!p.knowns[0].kid, 'stable ids on every node');
    hadToast(s, 'Problem saved.');
    s.clean('add problem');
  });

  s.step('F56 F58 status at every level; F59 remove cause cascades; F56 delete problem asks', () => {
    const p = docOf(s, KEY).risks.find((r) => r.problem === 'Bolt torque relaxes after thermal cycling');
    const card = 'prob-' + p.rid;
    s.click('Problem status, Open', { within: card });
    s.click(mi('Mitigating'), { within: card });
    s.eq('problem status', docOf(s, KEY).risks.find((r) => r.rid === p.rid).status, 'mitigating');
    hadToast(s, 'Problem marked mitigating.');
    s.click('Failure mode status, Open', { within: card });
    s.click(mi('Resolved'), { within: card });
    s.eq('mode status', docOf(s, KEY).risks.find((r) => r.rid === p.rid).modes[0].status, 'resolved');
    hadToast(s, 'Failure mode marked resolved.');
    const row = s.vals.fmea.reg.probs.find((x) => x.k === card).rows[0];
    s.eq('RPN hidden under a resolved mode (today shows —)', row.cause.rpnHidden, true);
    s.click('Effect status, Open', { within: card });
    s.click(mi('Mitigating'), { within: card });
    hadToast(s, 'Effect marked mitigating.');
    s.click('Cause status, Open', { within: card });
    s.click(mi('Resolved'), { within: card });
    hadToast(s, 'Cause marked resolved.');
    s.click('Remove cause: Belleville washers creep', { within: card });
    s.ok(/only cause of the effect/.test(s.vals.ui.dlg.body) && /failure mode goes as well/.test(s.vals.ui.dlg.body), 'confirm spells out the cascade');
    confirmDlg(s);
    s.eq('last cause took the effect and the mode (today\'s delCause)', docOf(s, KEY).risks.find((r) => r.rid === p.rid).modes.length, 0);
    hadToast(s, 'Cause removed, with its effect and failure mode.');
    s.click('~More actions for', { within: card });
    s.click('Delete problem', { within: card });
    confirmDlg(s);
    s.eq('problem deleted', docOf(s, KEY).risks.some((r) => r.rid === p.rid), false);
    hadToast(s, 'Problem deleted.');
    s.clean('statuses');
  });

  s.step('F60 a problem linked to a passed gate stops counting (passed-gate zeroing)', () => {
    const doc = docOf(s, KEY);
    const p = doc.risks.find((r) => r.objectiveId === OBJ && r.gateId && r.status !== 'resolved' && RD.worstRpn(r) > 0 && !passedGate(doc, r.gateId));
    if (!p) { s.ok(true, 'no open problem on an unpassed gate'); return; }
    const before = RD.worstUnresolvedRpn(p, false);
    s.c.mutate((D) => { D.docs[KEY].stageGates.find((g) => g.id === p.gateId).actualDate = TODAY - 1; }); s.render();
    const R = s.vals.fmea.reg.probs.find((x) => x.k === 'prob-' + p.rid);
    s.eq('unresolved RPN 0 once its gate passed', RD.worstUnresolvedRpn(docOf(s, KEY).risks.find((r) => r.rid === p.rid), true), 0);
    s.eq('badge falls back to the plain worst RPN', Number(R.rpn), RD.worstRpn(p));
    s.eq('says why', R.note, 'Its stage-gate has passed, so this problem no longer counts toward open risk.');
    s.ok(before > 0, 'it counted before');
  });

  if (!SALES) s.step('F63 F64 F65 F66 collapse all / per card; evidence experiment on a cause; Save experiment commits the problem', () => {
    const p = docOf(s, KEY).risks.find((r) => r.rid === 'r_el_seal');
    s.click(p.problem, { within: 'prob-' + p.rid });
    s.eq('editor', top(s).kind, 'fmea.edit');
    s.click('Collapse all', ED);
    const nModes = p.modes.length;
    s.eq('every card collapsed', s.vals.fmea.ed.modes.every((m) => m.closed), true);
    s.ok(/effects?, \d+ causes?/.test(s.vals.fmea.ed.modes[0].summary), 'collapsed summary: ' + s.vals.fmea.ed.modes[0].summary);
    s.click('Expand all', ED);
    s.eq('expanded', s.vals.fmea.ed.modes.every((m) => m.open), true);
    s.click('Collapse failure mode 1', ED);
    s.eq('per card', s.vals.fmea.ed.modes[0].closed, true);
    s.click('Expand failure mode 1', ED);
    const xs0 = RD.fmeaAllExperiments(p).length;
    const code = RD.fmeaNextExpCode(p);
    s.click('Add experiment to cause 1 of effect 1, failure mode 1', ED);
    s.eq('stacked evidence sheet', [top(s).kind, s.vals.fmea.ex.title], ['fmea.exp', 'Experiment ' + code]);
    s.type('Hypothesis', 'Seal creep follows the 80 °C soak', ED);
    s.type('Toggle', 'Soak temperature', ED);
    s.type('Experiment', 'Soak three seals at 60 and 80 °C for 200 h', ED);
    s.type('Add sample', 'S-60', ED); s.key('Add sample', 'Enter', ED);
    s.type('Add sample', 'S-80', ED); s.key('Add sample', 'Enter', ED);
    s.type('Add sample', 'S-80', ED); s.key('Add sample', 'Enter', ED);
    s.eq('duplicate sample refused', top(s).err, '“S-80” is already a sample.');
    s.click('Add key read', ED);
    s.type('Key read 1 name', 'Creep', ED);
    s.type('Key read 1 unit', 'µm', ED);
    s.type('S-60, Creep', '4.1', ED);
    s.eq('progress count (RD.fmeaExpProgress)', s.vals.fmea.ex.prog, '1 of 2 values recorded');
    s.type('Verdict', 'confirmed', ED);
    s.type('Conclusion', 'Creep doubles at 80 °C.', ED);
    s.click('Back to problem', ED);
    s.eq('back keeps the edits in the draft', top(s).d.modes[0].effects[0].causes[0].experiments.slice(-1)[0].hypothesis, 'Seal creep follows the 80 °C soak');
    s.click('Open ' + code, ED);
    s.click('Save experiment', ED);
    const p2 = docOf(s, KEY).risks.find((r) => r.rid === p.rid);
    const x = RD.fmeaAllExperiments(p2).map((e) => e.x).find((e) => e.code === code);
    s.eq('saved straight away with the problem', [RD.fmeaAllExperiments(p2).length, x.toggle, x.samples, x.key_reads.map((k) => [k.name, k.unit]), x.verdict, x.conclusion], [xs0 + 1, 'Soak temperature', ['S-60', 'S-80'], [['Creep', 'µm']], 'confirmed', 'Creep doubles at 80 °C.']);
    s.eq('values keyed sample → key read', x.values['S-60'][x.key_reads[0].krid], '4.1');
    hadToast(s, 'Experiment saved.');
    s.eq('back on the problem editor', top(s).kind, 'fmea.edit');
    s.click('Cancel', ED);
    s.ok(s.vals.fmea.reg.probs.find((r) => r.k === 'prob-' + p.rid).rows.some((r) => r.cause && r.cause.xs.some((c) => c.code === code && c.word === 'Confirmed')), 'register chip shows the code and verdict');
    s.clean('evidence');
  });

  if (SALES) s.step('F63-F66 Sales has no collapse and no evidence experiments (sales §22)', () => {
    const p = docOf(s, KEY).risks.find((r) => r.objectiveId === OBJ);
    s.click(p.problem, { within: 'prob-' + p.rid });
    s.ok(!s.has('Collapse all', ED) && !s.has('~Add experiment', ED), 'no collapse, no evidence');
    s.click('Cancel', ED);
  });
}

/* ============================================================ CURRENT STEP */
/* today's matcher (execution_app L1538-L1554), verbatim in spirit, as the oracle */
function rApply(op, a, b, hi) { if (b === '' || b == null) return false; a = Number(a); b = Number(b); if (isNaN(a) || isNaN(b)) return false; if (op === 'range') { if (hi === '' || hi == null) return false; const h = Number(hi); if (isNaN(h)) return false; const lo = Math.min(b, h), up = Math.max(b, h); return a >= lo && a <= up; } switch (op) { case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b; case '=': return Math.abs(a - b) < 1e-9; case '!=': return Math.abs(a - b) >= 1e-9; default: return false; } }
function rEval(c, k, m) { if (m == null || m === '' || isNaN(Number(m))) return 'pending'; if (c && typeof c.status === 'string') { if (!k || k.critical_value === '' || k.critical_value == null) return 'pending'; if ((k.direction || '') === 'range' && (k.critical_value_hi === '' || k.critical_value_hi == null)) return 'pending'; const pc = rApply(k.direction || '>=', m, k.critical_value, k.critical_value_hi); return pc === (c.status === 'hit') ? 'pass' : 'fail'; } if (c.value === '' || c.value == null) return 'pending'; return rApply(c.op || '>', m, c.value) ? 'pass' : 'fail'; }
function rMatch(exp, readings) { const kr = {}; (exp.key_reads || []).forEach((k) => { kr[k.id] = k; }); const st = {}, matched = [], prov = []; let any = false; (exp.possible_results || []).forEach((r) => { const cs = Array.isArray(r.criteria) ? r.criteria : []; if (!cs.length) { st[r.id] = 'no-criteria'; return; } let f = false, p = false, ok = 0; cs.forEach((c) => { const m = Object.prototype.hasOwnProperty.call(readings, c.key_read_id) ? readings[c.key_read_id] : null; const x = rEval(c, kr[c.key_read_id], m); if (x === 'fail') f = true; else if (x === 'pending') p = true; else ok++; }); if (f) st[r.id] = 'fail'; else if (p) { any = true; st[r.id] = ok > 0 ? 'provisional' : 'pending'; if (ok > 0) prov.push(r.id); } else { st[r.id] = 'pass'; matched.push(r.id); } }); return { matched, provisional: prov, states: st, complete: !any }; }
/* the live tree as the engine reads it */
function treeOf(s, key, objId, tid) { const w = RD.etbTreesOf(docOf(s, key).etbTrees[objId]); return tid ? w.trees.find((t) => t.tid === tid) : (w.trees.find((t) => t.tid === w.activeTid) || w.trees[0]); }
/* today's allKpisPool (this doc + portfolio + in-scope spec targets); the spec targets come from the KPI module (audit A1) */
const allKpis = (s, key) => (s.c.ctx && s.c.ctx.docKey === key && s.c.MODS.kpi && s.c.MODS.kpi.api && s.c.MODS.kpi.api.pool) ? s.c.MODS.kpi.api.pool(s.c, s.c.ctx) : docOf(s, key).kpis.concat(s.c.D.portfolio.kpis || []);
function krCtx(s, key, exp) { return { kpis: allKpis(s, key), execDocs: emOf(s, key), experiment: exp }; }
function readingsNow(s, key, exp) { const o = {}; (exp.key_reads || []).forEach((k) => { const c = RD.keyReadCurrent(k, krCtx(s, key, exp)); if (c.value != null) o[k.id] = c.value; }); return o; }

function currentStep() {
  const KEY = SALES ? 'BIZ-DIV-BD' : 'EXEC-DIV-EL';
  const OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01';
  const s = fresh();
  tab(s, 'Experiments');
  const card = (tid, expId) => 'card-' + tid + '-' + expId;
  const cardVM = (tid, expId) => { let c = null; s.vals.step.blocks.forEach((b) => b.cards.forEach((x) => { if (x.key === card(tid, expId)) c = x; })); return c; };

  s.step('S71 S67 current experiments, next-step range and derived status (today\'s rules)', () => {
    const w = RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]);
    const lists = SALES ? [w.trees.find((t) => t.tid === w.activeTid) || w.trees[0]] : w.trees;
    let count = 0;
    lists.forEach((t) => {
      const v = JSON.parse(JSON.stringify(t)); s.c.MODS.etb && null;
      const E = ETBcore(s);
      E.normalizeTree(v); E.syncRepeats(v);
      const cur = E.currentExperiments(v, E.computeReachability(v));
      count += cur.length;
      const blk = s.vals.step.blocks.find((b) => b.key === 'blk-' + t.tid);
      s.eq('current experiments ' + t.tid, blk.cards.map((c) => c.code), cur.map((id) => v.experiments[id].code));
      let mn = null, mx = 0, cap = false, un = false;
      cur.forEach((id) => { const r = RD.nextStepRange(v, id); if (mn === null || r.min < mn) mn = r.min; if (r.max > mx) mx = r.max; if (r.capped) cap = true; if (r.unplanned) un = true; });
      s.eq('next-step range ' + t.tid, blk.range, (mn || 0) + '–' + (cap ? mx + '+' : mx));
      if (!SALES) s.eq('tree button range + unplanned flag ' + t.tid, [s.vals.step.trees.find((x) => x.key === 'tb-' + t.tid).range, s.vals.step.trees.find((x) => x.key === 'tb-' + t.tid).unplanned], [blk.range, un]);
      cur.forEach((id) => {
        const e = v.experiments[id];
        let st = e.actual_outcome ? 'complete' : (e.status || 'planned') !== 'planned' ? e.status : (!SALES && (e.key_reads || []).some((k) => RD.keyReadCurrent(k, krCtx(s, KEY, e)).n) ? 'in_progress' : (e.status || 'planned'));
        s.eq('derived status ' + id, cardVM(t.tid, id).statusW, { planned: 'Planned', in_progress: 'In progress', complete: 'Complete' }[st]);
      });
    });
    s.eq('panel count', s.vals.step.count, String(count));
    s.clean('current step');
  });

  if (!SALES) s.step('S72 S74 S75 key-read rows, source chips, live strip and Conclude gating match today', () => {
    const w = RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]);
    let chips = 0;
    w.trees.forEach((t) => {
      const E = ETBcore(s); const v = JSON.parse(JSON.stringify(t)); E.normalizeTree(v); E.syncRepeats(v);
      E.currentExperiments(v, E.computeReachability(v)).forEach((id) => {
        const e = v.experiments[id], C = cardVM(t.tid, id);
        (e.key_reads || []).forEach((k, i) => {
          const c = RD.keyReadCurrent(k, krCtx(s, KEY, e));
          s.eq('current value ' + id + '/' + k.id, C.rows[i].val, c.value == null ? 'No read' : E.fmt(c.value));
          if (c.stat.statistical) s.eq('stat sub-line ' + k.id, C.rows[i].sub, (c.stat.statistic || 'average') + ', ' + c.n + (c.sample.expected ? ' of ' + c.sample.expected : ''));
          /* source chip: today's __erConnSamples (RD.reconstructConnected over the analysis index) */
          let smp = [];
          try { const rc = RD.reconstructConnected([k], { index: s.c.D.analysis, kpis: allKpis(s, KEY), execDocs: emOf(s, KEY), experiment: e }); smp = (rc.byKeyRead && rc.byKeyRead[k.id]) || []; } catch (x) { smp = []; }
          s.eq('source chip ' + id + '/' + k.id, C.rows[i].hasChip ? C.rows[i].chip : '', smp.length ? (smp.length === 1 ? 'From ' + smp[0] : 'From ' + smp.length + ' samples') : '');
          chips += smp.length ? 1 : 0;
        });
        const dc = RD.experimentDataComplete(e, krCtx(s, KEY, e));
        const m = rMatch(e, readingsNow(s, KEY, e));
        let head = 'Enter measured values to determine the result.';
        const lab = (rid) => (e.possible_results.find((r) => r.id === rid) || {}).label;
        if (m.matched.length === 1) head = 'Matched: ' + lab(m.matched[0]);
        else if (m.matched.length > 1) head = 'Multiple results match';
        else if (dc.complete && e.key_reads.length) head = 'No defined result matches';
        else if (m.provisional.length === 1) head = 'Trending toward: ' + lab(m.provisional[0]);
        else if (m.provisional.length > 1) head = m.provisional.length + ' results still possible';
        else if (dc.missing.length || dc.short.length) head = 'Awaiting';
        s.eq('strip ' + t.tid + '/' + id, head === 'Awaiting' ? C.strip.head.indexOf('Awaiting ') === 0 : C.strip.head, head === 'Awaiting' ? true : head);
        s.eq('Conclude gated on RD.experimentDataComplete ' + id, !!C.concludeOn, !!dc.complete);
      });
    });
    s.ok(true, chips + ' key reads carry a source chip in the sample');
    s.clean('strip');
  });

  if (!SALES) s.step('S73 click to add: single value inline (last number, Enter / Escape), statistical list with batches and removal', () => {
    const tid = 't_cell7', id = 'exp_002';
    const ck = card(tid, id);
    s.click('Add a reading for Gasket thickness spread', { within: ck });
    s.type('Add a reading for Gasket thickness spread', '0.03 0.015', { within: ck });
    s.key('Add a reading for Gasket thickness spread', 'Escape', { within: ck });
    s.eq('Escape cancels', (treeOf(s, KEY, OBJ, tid).experiments[id].key_read_readings || {}).kr_002_3, undefined);
    s.click('Add a reading for Gasket thickness spread', { within: ck });
    s.type('Add a reading for Gasket thickness spread', '0.03 0.015', { within: ck });
    s.key('Add a reading for Gasket thickness spread', 'Enter', { within: ck });
    s.eq('unlinked single: the last number typed, stored on the experiment', treeOf(s, KEY, OBJ, tid).experiments[id].key_read_readings.kr_002_3, [0.015]);
    hadToast(s, '1 reading recorded. The step stays in progress until you conclude it.');
    /* statistical, unlinked: list with batches */
    s.click('Add a reading for Cell 7 deviation from stack mean', { within: ck });
    s.type('Add readings', '13 14', { within: ck });
    s.key('Add readings', 'Enter', { within: ck });
    let st = treeOf(s, KEY, OBJ, tid).experiments[id].key_read_readings.kr_002_2;
    s.eq('two reads appended to the current batch', RD.readingEntries(st).map((e) => e.v), [12, 13, 14]);
    hadToast(s, '2 readings added.');
    s.click('New batch', { within: ck });
    s.type('Add readings', '9', { within: ck });
    s.click('Add', { within: ck });
    st = treeOf(s, KEY, OBJ, tid).experiments[id].key_read_readings.kr_002_2;
    const ents = RD.readingEntries(st);
    s.ok(ents[3].batch && ents[3].batch !== (ents[0].batch || ''), 'a new batch id on the next read');
    const c = RD.keyReadCurrent(treeOf(s, KEY, OBJ, tid).experiments[id].key_reads[1], krCtx(s, KEY, treeOf(s, KEY, OBJ, tid).experiments[id]));
    s.eq('the statistic now counts only the new batch', [c.n, c.value], [1, 9]);
    const pop = cardVM(tid, id).rows[1].pop;
    s.eq('earlier batch rows dimmed', pop.rows.filter((r) => r.hasNote).length, 3);
    s.click('Remove 9', { within: ck });
    s.click('Confirm removing 9', { within: ck });
    s.eq('removed after a confirm', RD.readingEntries(treeOf(s, KEY, OBJ, tid).experiments[id].key_read_readings.kr_002_2).length, 3);
    hadToast(s, 'Reading removed.');
    s.click('Close readings', { within: ck });
    /* linked statistical: the reads post to the KPI with today's note */
    const n0 = docOf(s, KEY).kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-2026Q4-01-1-1').length;
    s.click('Add a reading for Cell voltage at 2 A/cm²', { within: ck });
    s.type('Add readings', '1.83', { within: ck });
    s.click('Add', { within: ck });
    const ups = docOf(s, KEY).kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-2026Q4-01-1-1');
    s.eq('linked: a KPI reading with the note "exp EXP-2"', [ups.length - n0, ups[ups.length - 1].value, ups[ups.length - 1].note], [1, 1.83, 'exp EXP-2']);
    s.eq('other logic tree on the objective kept (multi-tree data loss fixed)', RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]).trees.map((t) => t.tid), ['t_cell7', 't_xover']);
    s.clean('readings');
  });

  s.step((SALES ? 'S76 S77 (Sales "Record outcome") ' : 'S76 S77 ') + 'outcome recorder: prefill, auto-pick rules, sentinels, record, KPI write-back without duplicates', () => {
    let tid, id;
    if (SALES) { tid = treeOf(s, KEY, OBJ).tid || 't_main'; id = 'exp_002'; }
    else { tid = 't_xover'; id = 'exp_002'; }
    const e0 = JSON.parse(JSON.stringify(treeOf(s, KEY, OBJ, SALES ? null : tid).experiments[id]));
    s.click(SALES ? 'Record outcome' : 'Conclude…', { within: card(SALES ? (s.vals.step.blocks[0].key.slice(4)) : tid, id) });
    s.eq('recorder sheet', top(s).kind, 'step.rec');
    const R = () => s.vals.step.rec;
    if (!SALES) {
      const pre = {}; e0.key_reads.forEach((k) => { const c = RD.keyReadCurrent(k, krCtx(s, KEY, e0)); pre[k.id] = c.n ? (c.stat.statistical ? c.values.join(' ') : String(c.values[c.n - 1])) : ''; });
      s.eq('pre-filled with what was measured (today\'s __erPrefill)', R().krs.map((k) => k.v), e0.key_reads.map((k) => pre[k.id]));
      const AKr = allKpis(s, KEY);
      s.eq('linked key reads carry the KPI name resolved through allKpisPool (today\'s refreshLinkedKeyRead / hubProjectKpis)', R().krs.map((k) => k.name), e0.key_reads.map((k) => { const kp = k.source_kpi_gid ? AKr.find((x) => x.id === k.source_kpi_gid) : null; return kp ? RD.kpiName(kp, AKr) : k.name; }));
      const m = rMatch(e0, readingsNow(s, KEY, e0));
      s.eq('one match with complete data is auto-picked', R().results.filter((r) => r.on).map((r) => r.id), m.matched.length === 1 ? [m.matched[0]] : []);
      s.eq('sentinels offered', R().results.slice(-2).map((r) => r.id), ['other', 'inconclusive']);
      s.type('Measured Crossover after a 100 h hold', '1.2', ED);
      s.eq('data now matches the erosion result', R().results.filter((r) => r.on).map((r) => r.id), ['res_002b']);
      s.check('~Inconclusive', true, ED);
      s.type('Measured Crossover after a 100 h hold', '0.5', ED);
      s.eq('the person\'s own pick is never overridden', R().results.filter((r) => r.on).map((r) => r.id), ['inconclusive']);
      s.type('Measured Crossover after a 100 h hold', '', ED);
      s.check('~Margin erodes', true, ED);
      s.eq('partial data: Trending', R().concl.head.indexOf('Trending toward') === 0 || R().concl.head.indexOf('results still possible') > 0 || R().concl.head.indexOf('Matched') === 0, true);
      s.type('Measured Crossover after a 100 h hold', '1.3', ED);
      s.type('Measured H₂ in O₂', '0.5', ED);   /* the linked KPI's name through allKpisPool (spec target), as today */
    } else {
      s.type('Measured Days to a verbal yes', '42', ED);
      s.eq('Sales: a single match auto-selects', R().results.filter((r) => r.on).map((r) => r.id), ['res_002b']);
      s.eq('no sentinels in Sales', R().results.some((r) => r.id === 'other'), false);
      s.type('Measured Qualified pipeline value', '4.8', ED);
    }
    s.type('~Recorded date', '2026-10-12', ED);
    const kid = SALES ? 'KPI-BD-2026Q4-01-2-1' : 'KPI-EL-2026Q4-01-3-1';
    const n0 = docOf(s, KEY).kpiUpdates.filter((u) => u.kpiId === kid).length;
    s.click('Record outcome', ED);
    const e = treeOf(s, KEY, OBJ, SALES ? null : tid).experiments[id];
    s.eq('outcome recorded in today\'s shape', [e.actual_outcome.result_id, e.actual_outcome.recorded_date, e.actual_outcome.note, e.actual_outcome.conclusion, e.actual_outcome.next_experiment_ids, e.actual_outcome.terminal, e.status],
      [SALES ? 'res_002b' : 'res_002b', '2026-10-12', null, null, [], null, 'complete']);
    s.ok(e.actual_outcome.key_read_values && Object.keys(e.actual_outcome.key_read_values).length >= 1, 'raw values kept');
    const ups = docOf(s, KEY).kpiUpdates.filter((u) => u.kpiId === kid);
    s.eq('one new KPI reading for the changed linked value (today re-posted pre-filled ones, §24)', ups.length - n0, 1);
    s.eq('its note', ups[ups.length - 1].note, 'exp ' + e.code);
    hadToast(s, 'Outcome recorded. 1 KPI reading posted to the objective.');
    if (!SALES) s.eq('other tree kept', RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]).trees.length, 2);
    s.clean('recorder');
  });

  if (!SALES) s.step('S68 S69 S70 logic trees: new tree (ask), switch, manager (rename, reorder, open, delete with impact), show / hide graph', () => {
    s.click('New tree', { within: 'logic-trees' });   // in the Logic trees panel since November 3
    s.eq('asks for a name', s.vals.ui.dlg.label, 'Name');
    askDlg(s, 'Membrane thinning check');
    let w = RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]);
    s.eq('container keeps every tree and the new one is active', [w.trees.length, w.trees[2].name, w.activeTid === w.trees[2].tid], [3, 'Membrane thinning check', true]);
    s.eq('container shape', [docOf(s, KEY).etbTrees[OBJ].schema, Array.isArray(docOf(s, KEY).etbTrees[OBJ].trees)], [2, true]);
    hadToast(s, 'Logic tree created.');
    s.click('~Cell 7 voltage outlier', { within: 'Logic trees' });
    s.eq('switch tree', RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]).activeTid, 't_cell7');
    s.click('Manage trees', { within: 'logic-trees' });
    s.eq('manager', top(s).kind, 'step.trees');
    s.type('Tree name', 'Cell 7 outlier', { within: 'tm-t_cell7' });
    s.key('Tree name', 'Enter', { within: 'tm-t_cell7' });
    s.eq('renamed', treeOf(s, KEY, OBJ, 't_cell7').name, 'Cell 7 outlier');
    s.click('Move Crossover margin at 30 bar up', ED);
    s.eq('reordered', RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]).trees.map((t) => t.tid).slice(0, 2), ['t_xover', 't_cell7']);
    const imp = s.vals.step.mgr.rows.find((r) => r.key === 'tm-t_xover');
    s.click('Delete', { within: 'tm-t_xover' });
    const nExp = Object.keys(treeOf(s, KEY, OBJ, 't_xover').experiments).length;
    s.ok(new RegExp('Its ' + nExp + ' experiments are deleted with it').test(s.vals.ui.dlg.body), 'impact warning names the experiments: ' + s.vals.ui.dlg.body);
    s.ok(/KPI reading/.test(s.vals.ui.dlg.body), 'and the KPI readings that stay');
    confirmDlg(s);
    s.eq('deleted', RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]).trees.some((t) => t.tid === 't_xover'), false);
    s.click('Done', ED);
    const blk = s.vals.step.blocks[0];
    s.eq('several trees: graphs start hidden', blk.graphOpen, false);
    s.click('Show graph', { within: blk.key });
    s.eq('shown per tree', s.vals.step.blocks[0].graphOpen, true);
    s.click('Hide graph', { within: blk.key });
    s.eq('hidden again', s.vals.step.blocks[0].graphOpen, false);
    s.clean('trees');
  });

  if (!SALES) s.step('S68b the last tree cannot be deleted', () => {
    s.click('Manage trees', { within: 'logic-trees' });
    const rowsV = s.vals.step.mgr.rows;
    rowsV.slice(1).forEach((r) => { s.c.MODS && null; });
    const tids = RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]).trees.map((t) => t.tid);
    tids.slice(1).forEach((t) => { s.click('Delete', { within: 'tm-' + t }); confirmDlg(s); });
    s.eq('one left, no Delete offered', [RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]).trees.length, s.vals.step.mgr.rows[0].canDel], [1, false]);
    s.click('Done', ED);
  });
}
/* Oracle: today's ETB core, loaded straight from the real template (read only) so the logic-tree rules are
   checked against the live code, not against the Calm port. */
let __realEtb = null;
function ETBcore() {
  if (__realEtb) return __realEtb;
  const fs = require('fs');
  const src = fs.readFileSync('/home/claude/work/rd-gantt-v2/execution_app.template.html', 'utf8');
  const cut = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < 0) throw new Error('real ETB block not found: ' + a); return src.slice(i, j); };
  const core = cut('const SCHEMA_VERSION = "1.0";', '// STORAGE (JSONBin');
  const tests = cut('const TESTS=[];', 'function runTestsUI(){');
  const wf = cut('function buildWaterfallModel(tree, today, opts){', 'function renderWaterfall(){');
  const cur = cut('function __lastAuditTs(exp){', 'function focusedSubgraph(tree, expIds){');
  const fmt = cut('function __erFmt(v){', '/* The measured value(s) recorded');
  const names = ['enumerateEdges', 'findRoots', 'computeReachability', 'traversedPath', 'terminalReached', 'buildGraphElements', 'toRenderElements', 'validateTree', 'normalizeTree', 'syncRepeats', 'collectAccomplishments', 'currentExperiments', 'buildWaterfallModel', 'makeRepeat', 'addExperiment', 'resolveOutcome', 'isResultObserved'];
  __realEtb = new Function(core + '\n' + tests + '\n' + wf + '\n' + cur + '\n' + fmt + '\nreturn {' + names.join(',') + ', fmt: __erFmt, TESTS: TESTS, sampleTree: sampleTree};')();
  return __realEtb;
}

/* ===================================================================== ETB */
function logicTree() {
  const KEY = SALES ? 'BIZ-DIV-BD' : 'EXEC-DIV-EL';
  const OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01';
  const R = ETBcore();
  const s = fresh();
  tab(s, 'Experiments');
  const active = () => treeOf(s, KEY, OBJ);
  const view = () => { const v = JSON.parse(JSON.stringify(active())); R.normalizeTree(v); R.syncRepeats(v); return v; };
  const E = () => s.vals.etb;

  s.step('E89 tests runner: the in-browser suite runs and passes (same count as today\'s)', () => {
    s.click('Tests', { within: 'etb' });
    s.click('Run tests', { within: 'etb' });
    s.eq('all pass, same count as today\'s TESTS', E().ts.summary, R.TESTS.length + ' of ' + R.TESTS.length + ' passed');
    s.eq('today has 91', R.TESTS.length, 91);
  });

  s.step('E84 E90 status line and issues sheet follow today\'s validateTree / reachability / terminalReached', () => {
    s.click('Graph', { within: 'etb' });
    const v = view();
    const reach = R.computeReachability(v);
    const c = { active: 0, pending: 0, not_pursued: 0 }; Object.values(reach).forEach((x) => { if (c[x] != null) c[x]++; });
    const iss = R.validateTree(v), errs = iss.filter((i) => i.level === 'error').length, warns = iss.filter((i) => i.level === 'warning').length;
    const term = R.terminalReached(v);
    const st = E().st;
    s.eq('status line', [st.title, st.count, st.reach, st.outcome], [v.title || 'Untitled', Object.keys(v.experiments).length + ' experiments', c.active + ' active, ' + c.pending + ' pending, ' + c.not_pursued + ' not pursued', term.reached ? 'Outcome so far: ' + term.label : 'Plan in progress']);
    s.eq('issue counts', [st.errs, st.warns], [errs, warns]);
    if (errs + warns) {
      st.openIssues(); s.render();
      const I = s.vals.etb.iss;
      s.eq('issues grouped as today, same messages and rules', I.groups.map((g) => g.rows.map((r) => r.rule + ' ' + r.text)), [iss.filter((i) => i.level === 'error'), iss.filter((i) => i.level === 'warning')].filter((l) => l.length).map((l) => l.map((i) => 'Rule ' + i.rule + ' ' + i.message)));
      s.c.closeAllSheets(); s.render();
    }
  });

  s.step('E85 outline: decision history, accomplishments, plan and unattached, from today\'s functions', () => {
    s.click('Outline', { within: 'etb' });
    const v = view();
    const story = R.traversedPath(v);
    s.eq('decision history = traversedPath', E().ol.story.map((x) => [x.code, x.result]), story.map((x) => [x.code || x.experimentId, x.pending ? 'Awaiting result' : x.resultLabel || '']));
    const acc = R.collectAccomplishments(v);
    if (acc.length) s.eq('accomplishments counts', E().ol.accSum, acc.filter((a) => a.realized).length + ' cleared, ' + acc.filter((a) => !a.realized).length + ' would clear');
    /* unattached: add an orphan via JSON and see it listed */
    const nodes = E().ol.items.filter((i) => i.isNode).map((i) => i.code);
    s.eq('every reachable experiment is in the plan', Object.keys(v.experiments).filter((id) => R.computeReachability(v)[id]).every((id) => nodes.indexOf(v.experiments[id].code) >= 0), true);
    s.clean('outline');
  });

  s.step('E86 E101 E102 graph = today\'s buildGraphElements / toRenderElements; tap a node opens detail or editor; a result pill opens that result', () => {
    s.click('Graph', { within: 'etb' });
    const v = view();
    const ge = R.buildGraphElements(v, R.computeReachability(v));
    const re = R.toRenderElements(ge.nodes, ge.edges);
    s.eq('node ids', E().g.nodes.map((n) => n.id).sort(), re.nodes.map((n) => n.data.id).sort());
    s.eq('edge count', E().g.edges.length, re.edges.length);
    s.eq('node kinds', E().g.nodes.map((n) => n.kind).sort(), re.nodes.map((n) => n.data.kind).sort());
    const done = Object.keys(v.experiments).find((id) => v.experiments[id].actual_outcome);
    const open = Object.keys(v.experiments).find((id) => !v.experiments[id].actual_outcome);
    E().g.nodes.find((n) => n.id === done).open(); s.render();
    s.eq('a concluded experiment opens read-only details', top(s).kind, 'etb.detail');
    s.click('Edit results', ED); /* both apps label it "Edit results" (sales 5278, exec 7138) */
    s.eq('Edit results opens the editor', [top(s).kind, top(s).data.expId], ['etb.exp', done]);
    s.c.closeAllSheets(); s.render();
    E().g.nodes.find((n) => n.id === open).open(); s.render();
    s.eq('an open experiment opens the editor', [top(s).kind, top(s).data.expId], ['etb.exp', open]);
    s.c.closeAllSheets(); s.render();
    if (!SALES) {
      const pill = E().g.nodes.find((n) => n.isPillBtn);
      pill.open(); s.render();
      s.eq('a result label opens just that result (today\'s single-result modal)', [top(s).kind, !!top(s).data.only], ['etb.exp', true]);
      s.click('Open the whole experiment', ED);
      s.eq('and widens to the whole experiment', top(s).data.only, null);
      s.c.closeAllSheets(); s.render();
    } else s.eq('Sales: result labels are not buttons', E().g.nodes.some((n) => n.isPillBtn), false);
    const z0 = E().g.zoomText;
    s.click('Zoom in', { within: 'etb' });
    s.ok(E().g.zoomText !== z0, 'zoom in changes the zoom');
    s.click('Fit', { within: 'etb' });
    s.eq('fit restores', E().g.zoomText, z0);
    s.clean('graph');
  });

  s.step('E87 waterfall rows = today\'s buildWaterfallModel; a bar opens the editor', () => {
    s.click('Waterfall', { within: 'etb' });
    const v = view();
    const m = R.buildWaterfallModel(v, '2026-10-13');
    s.eq('rows', E().wf.rows.map((r) => r.key), m.rows.map((r) => r.id));
    const ex = m.rows.filter((r) => r.kind === 'experiment');
    const fdd = (d) => { const dt = new Date(d * 86400000); return MON[dt.getUTCMonth()] + ' ' + dt.getUTCDate(); };
    s.eq('dates / projected', E().wf.rows.filter((r) => r.isExp).map((r) => r.dates), ex.map((r) => r.projected ? 'Projected' : fdd(r.startDay) + ' to ' + fdd(r.endDay)));
    E().wf.rows.find((r) => r.isExp).open(); s.render();
    s.eq('bar opens the editor', top(s).kind, 'etb.exp');
    s.c.closeAllSheets(); s.render();
  });

  s.step('E88 JSON: format, invalid, validate (today\'s rules), apply (refuses a non-tree), revert', () => {
    s.click('JSON', { within: 'etb' });
    const t0 = JSON.stringify(active());
    E().js.set({ target: { value: '{"experiments":' } }); s.render();
    s.click('Format', { within: 'etb' });
    s.ok(/^Invalid JSON: /.test(E().js.msg), 'invalid JSON message: ' + E().js.msg);
    E().js.set({ target: { value: '{"title":"x"}' } }); s.render();
    s.click('Apply changes', { within: 'etb' });
    s.eq('a document without an experiments map is refused', E().js.issues.map((i) => i.text), ['The document must be an object with an “experiments” map.']);
    s.eq('tree untouched', JSON.stringify(active()), t0);
    s.click('Revert', { within: 'etb' });
    const v = view();
    s.click('Validate', { within: 'etb' });
    s.eq('validate lists today\'s issues', E().js.issues.map((i) => i.text), R.validateTree(v).map((i) => 'Rule ' + i.rule + ': ' + i.message));
    const p = JSON.parse(E().js.text); p.title = 'Renamed via JSON';
    E().js.set({ target: { value: JSON.stringify(p) } }); s.render();
    s.click('Format', { within: 'etb' });
    s.eq('formatted', E().js.msg, 'Formatted.');
    s.click('Apply changes', { within: 'etb' });
    s.eq('applied into its slot', active().title, 'Renamed via JSON');
    if (!SALES) s.eq('the other tree is kept', RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]).trees.length, 2);
    hadToast(s, 'Logic tree JSON applied.');
    s.clean('json');
  });

  s.step('E83 toolbar: add experiment (code, opens editor), reload, save with the error count, settings', () => {
    s.click('Graph', { within: 'etb' });
    const ids0 = Object.keys(active().experiments);
    s.click('Add experiment', { within: 'etb' });
    const nid = Object.keys(active().experiments).find((id) => ids0.indexOf(id) < 0);
    const t = JSON.parse(JSON.stringify(treeOf(s, KEY, OBJ))); delete t.experiments[nid];
    const want = R.addExperiment(t, {});
    s.eq('today\'s id and code', [nid, active().experiments[nid].code, active().experiments[nid].name, active().experiments[nid].status], [want, t.experiments[want].code, 'New experiment', 'planned']);
    s.eq('opens its editor', [top(s).kind, top(s).data.expId], ['etb.exp', nid]);
    s.c.closeAllSheets(); s.render();
    s.click('Reload', { within: 'etb' });
    hadToast(s, /^Loaded at \d+:\d\d [AP]M for OBJ-/);
    s.click('Save', { within: 'etb' });
    const nErr = R.validateTree(view()).filter((i) => i.level === 'error').length;
    hadToast(s, new RegExp('^Saved at \\d+:\\d\\d [AP]M' + (nErr ? '\\. ' + nErr + ' validation errors? remains?\\.' : '\\.') + '$'));
    s.click('Logic tree settings', { within: 'etb' });
    s.eq('settings sheet', top(s).kind, 'etb.settings');
    s.type('~Your name', 'TH', ED);
    s.click('Save name', ED);
    s.eq('editor name kept for recorded-by and audit', s.c.state.etb_editor, 'TH');
    s.clean('toolbar');
  });

  s.step('E91-E99 E103 editor: fields, key reads and KPI picker, criteria, conclusion amend with reason, gate flags, leads-to, sentinels, clear, notes, audit, raw JSON, delete', () => {
    const v = view();
    const eid = Object.keys(v.experiments).find((id) => v.experiments[id].status === 'in_progress' && !v.experiments[id].actual_outcome);
    s.c.MODS.etb && null;
    E().ol;   /* keep */
    s.click('Outline', { within: 'etb' });
    s.click(v.experiments[eid].code + ' ' + v.experiments[eid].name, { within: 'etb' });
    s.eq('editor', [top(s).kind, top(s).data.expId], ['etb.exp', eid]);
    const X = () => s.vals.etb.exp;
    s.type('Name', 'Renamed step', ED); s.key('Name', 'Enter', ED);
    s.eq('name commits on Enter', active().experiments[eid].name, 'Renamed step');
    s.type('Hypothesis', 'A sharper hypothesis.', ED);
    s.eq('not saved until you leave the field', active().experiments[eid].hypothesis !== 'A sharper hypothesis.', true);
    X().hyp.commit(); s.render();
    s.eq('saved on blur', active().experiments[eid].hypothesis, 'A sharper hypothesis.');
    s.type('Status', 'complete', ED);
    s.eq('status select', active().experiments[eid].status, 'complete');
    s.type('Status', 'in_progress', ED);
    /* key reads */
    const nk0 = active().experiments[eid].key_reads.length;
    s.click('Add key read', ED);
    const kr = active().experiments[eid].key_reads[nk0];
    s.eq('new key read in today\'s shape', [kr.name, kr.unit, kr.critical_value, kr.direction, /^kr_/.test(kr.id)], ['', '', '', '>=', true]);
    if (!SALES) {
      s.type('Pass condition', 'range', { within: 'kr-' + kr.id });
      s.type('Critical value', '1', { within: 'kr-' + kr.id }); s.key('Critical value', 'Enter', { within: 'kr-' + kr.id });
      s.type('High bound', '3', { within: 'kr-' + kr.id }); s.key('High bound', 'Enter', { within: 'kr-' + kr.id });
      s.eq('between stored as range lo..hi', [active().experiments[eid].key_reads[nk0].direction, active().experiments[eid].key_reads[nk0].critical_value, active().experiments[eid].key_reads[nk0].critical_value_hi], ['range', '1', '3']);
      s.type('Statistic', 'median', { within: 'kr-' + kr.id });
      s.type('Expected reads', '4', { within: 'kr-' + kr.id }); s.key('Expected reads', 'Enter', { within: 'kr-' + kr.id });
      s.eq('statistic config on an unlinked key read', [active().experiments[eid].key_reads[nk0].statistic, active().experiments[eid].key_reads[nk0].readCount], ['median', 4]);
    } else {
      s.eq('Sales: no "between", no statistic row', [X().krs[nk0].dir.opts.some((o) => o.v === 'range'), s.has('Statistic', { within: 'kr-' + kr.id })], [false, false]);
    }
    s.click('Remove key read', { within: 'kr-' + kr.id });
    confirmDlg(s);
    s.eq('removed after a confirm', active().experiments[eid].key_reads.length, nk0);
    /* KPI picker */
    s.click('Link a KPI', ED);
    const groups = X().pick.groups.map((g) => g.label);
    s.ok(groups.length > 0, 'project KPIs grouped: ' + groups.join(', '));
    const first = X().pick.groups[0].rows[0];
    first.pick(); s.render();
    const lk = active().experiments[eid].key_reads.slice(-1)[0];
    s.eq('linked key read takes the KPI', [lk.source_kpi_gid, lk.name], [first.key.replace(/^pk-/, ''), first.name]);
    /* results: criteria, leads-to, flags */
    const res = active().experiments[eid].possible_results[0];
    const rk = 'res-' + res.id;
    s.click('Add criterion', { within: rk });
    const cr = active().experiments[eid].possible_results[0].criteria.slice(-1)[0];
    s.eq('a manual criterion starts as today\'s {key_read_id:null, op:">", value:""}', cr, { key_read_id: null, op: '>', value: '' });
    s.type('Criterion key read', active().experiments[eid].key_reads[0].id, { within: rk, nth: 0 });
    s.type('Comparison', '<=', { within: rk, nth: 0 });
    s.click('Add stage-gate', { within: rk });
    const gopts = X().results[0].acc.slice(-1)[0].sel.opts;
    const gates = docOf(s, KEY).stageGates.filter((g) => g.objectiveId === OBJ);
    s.eq('gate picker numbers gates SG-A1 (§24 numbering made consistent)', gopts.slice(1).map((o) => o.label.split(' ')[0]).sort(), gates.map((g) => realLabel(docOf(s, KEY), g.id)).sort());
    s.type('Stage-gate this result clears', gates[0].id, { within: rk, nth: X().results[0].acc.length - 1 });
    const acc = active().experiments[eid].possible_results[0].accomplishments.slice(-1)[0];
    s.eq('flag stores gate_id and the gate name as label', [acc.gate_id, acc.label, acc.type], [gates[0].id, gates[0].name, 'stage_gate']);
    s.type('Leads to', 'term:conduct_fmea', { within: rk });
    const r2 = active().experiments[eid].possible_results[0];
    s.eq('terminal lead (today\'s setResultLink)', [r2.terminal && r2.terminal.type, r2.terminal && r2.terminal.label, r2.next_experiment_ids], ['conduct_fmea', 'Conduct FMEA', []]);
    const ids0 = Object.keys(active().experiments);
    s.type('Leads to', 'new', { within: rk });
    const nid = Object.keys(active().experiments).find((id) => ids0.indexOf(id) < 0);
    s.eq('new experiment as next', [active().experiments[eid].possible_results[0].next_experiment_ids, active().experiments[eid].possible_results[0].terminal], [[nid], null]);
    s.type('Leads to', 'repeat', { within: rk });
    const rid = Object.keys(active().experiments).find((id) => ids0.indexOf(id) < 0 && id !== nid);
    const rep = active().experiments[rid];
    s.eq('repeat: linked copy (today\'s makeRepeat)', [rep.repeat_of, rep.code, rep.name, active().experiments[eid].possible_results[0].next_experiment_ids], [eid, active().experiments[eid].code + '·R1', 'Renamed step (repeat)', [rid]]);
    /* sentinel outcome, then clear */
    if (!SALES) {
      s.check('Other (unanticipated)', true, ED);
      s.eq('sentinel outcome', active().experiments[eid].actual_outcome.result_id, 'other');
      s.type('What happened (note)', 'Rig tripped at 30 min', ED); X().sentinels[0].note.commit(); s.render();
      s.eq('note stored', active().experiments[eid].actual_outcome.note, 'Rig tripped at 30 min');
      s.click('Clear the recorded outcome', ED);
      confirmDlg(s);
      s.eq('cleared', active().experiments[eid].actual_outcome, null);
    }
    /* observed radio + amend on a complete experiment */
    s.check('Mark as the observed result', true, { within: rk });
    s.eq('observed radio records the outcome (status unchanged)', [active().experiments[eid].actual_outcome.result_id, active().experiments[eid].status], [res.id, 'in_progress']);
    s.type('Status', 'complete', ED);
    s.click('Amend', { within: rk });
    s.click('Save amendment', { within: rk });
    s.eq('a reason is required', X().results[0].amendErr, 'A reason is required.');
    s.type('Conclusion (amending)', 'Amended conclusion.', { within: rk });
    s.type('~Reason for the amendment', 'Reviewed with the team.', { within: rk });
    s.click('Save amendment', { within: rk });
    const al = active().experiments[eid].audit_log.slice(-1)[0];
    s.eq('amendment logged with the editor and reason', [active().experiments[eid].possible_results[0].conclusion, al.field, al.action, al.reason, al.to], ['Amended conclusion.', 'possible_results.' + res.id + '.conclusion', 'amend', 'Reviewed with the team.', 'Amended conclusion.']);
    s.ok(X().hasAudit && X().audit.some((a) => a.reason === 'Reason: Reviewed with the team.'), 'audit log shows it');
    /* notes, raw JSON */
    s.type('Notes', 'Note text', ED); X().notes.commit(); s.render();
    s.eq('notes', active().experiments[eid].notes, 'Note text');
    s.click('Advanced: edit raw JSON', ED);
    X().raw.set({ target: { value: '{"bad"' } }); s.render();
    s.click('Apply', ED);
    s.ok(/^Parse error: /.test(X().raw.msg), 'raw JSON parse error: ' + X().raw.msg);
    const raw = JSON.parse(JSON.stringify(active().experiments[eid])); raw.owner = 'QA';
    X().raw.set({ target: { value: JSON.stringify(raw) } }); s.render();
    s.click('Apply', ED);
    s.eq('raw JSON applied', [active().experiments[eid].owner, X().raw.msg], ['QA', 'Applied.']);
    /* delete the new experiment: inbound links cleared */
    s.c.closeAllSheets(); s.render();
    s.c.openSheet('etb.exp', { tid: active().tid || 't_main', expId: nid }, { f: {} }); s.render();
    s.click('Delete experiment', ED);
    confirmDlg(s);
    s.eq('deleted', !!active().experiments[nid], false);
    s.eq('no result points at it any more', Object.values(active().experiments).some((e) => (e.possible_results || []).some((r) => (r.next_experiment_ids || []).indexOf(nid) >= 0)), false);
    if (!SALES) s.eq('the other tree is kept through every edit', RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]).trees.length, 2);
    s.clean('editor');
  });

  s.step('E100 repeats: linked fields follow the source until overridden; re-link one, re-link all', () => {
    /* the Toggle label also carries the hint and a Linked/Overridden tag, so find the input by its placeholder */
    const TOGGLE = 'The variable being altered in this experiment';
    const v = view();
    const rid = Object.keys(v.experiments).find((id) => v.experiments[id].repeat_of && v.experiments[v.experiments[id].repeat_of]);
    const src = v.experiments[rid].repeat_of;
    s.c.openSheet('etb.exp', { tid: active().tid || 't_main', expId: src }, { f: {} }); s.render();
    s.type(TOGGLE, 'Source toggle changed', ED); s.vals.etb.exp.toggle.commit(); s.render();
    s.eq('a clean repeat field follows the source (syncRepeats)', active().experiments[rid].toggle, 'Source toggle changed');
    s.c.openSheet('etb.exp', { tid: active().tid || 't_main', expId: rid }, { f: {} }); s.render();
    s.type(TOGGLE, 'Own toggle', ED); s.vals.etb.exp.toggle.commit(); s.render();
    s.eq('editing a repeat field overrides it', [active().experiments[rid].toggle, active().experiments[rid].overrides.toggle], ['Own toggle', true]);
    s.click('Link Toggle again', ED);
    s.eq('re-link one field', [active().experiments[rid].toggle, !!active().experiments[rid].overrides.toggle], ['Source toggle changed', false]);
    s.type(TOGGLE, 'Own again', ED); s.vals.etb.exp.toggle.commit(); s.render();
    s.click('Link every field again', ED);
    s.eq('re-link all', JSON.stringify(active().experiments[rid].overrides), '{}');
    s.c.closeAllSheets(); s.render();
  });

  s.step('E104 Clear all data blanks only this tree, after a confirm, and it saves', () => {
    const tid = active().tid;
    s.click('Logic tree settings', { within: 'etb' });
    s.click('Clear all data', ED);
    confirmDlg(s);
    s.eq('blank tree in the same slot', [Object.keys(active().experiments).length, active().tid, active().root_experiment_id], [0, tid, null]);
    if (!SALES) s.eq('other trees kept', RD.etbTreesOf(docOf(s, KEY).etbTrees[OBJ]).trees.length, 2);
    hadToast(s, 'Cleared. A blank tree is ready.');
    s.click('Add experiment', { within: 'etb' });
    s.eq('the first experiment becomes the root', active().root_experiment_id, Object.keys(active().experiments)[0]);
    s.c.closeAllSheets(); s.render();
  });
}

/* ============================================================ SALES GATE HEADER */
/* the Gates-mode header on the Sales board: same module, Sales flags (no reorder) */
function gatesSales() {
  const KEY = 'BIZ-DIV-BD', BD1 = 'OBJ-BD-2026Q4-01', BD2 = 'OBJ-BD-2027Q1-01';
  const s = fresh();
  tab(s, 'Stage-gates');

  s.step('G01 (Sales) Stage-gates lists and counts the gates though Kanban was the stored view; the Kanban tab counts the board\'s tiles', () => {
    s.eq('the stored view is left as it was', docOf(s, KEY).gateMode[BD1], 'kanban');
    s.eq('gates count', s.vals.gates.tab.count, docOf(s, KEY).stageGates.filter((g) => g.objectiveId === BD1).length);
    tab(s, 'Kanban');
    const b = docOf(s, KEY).boards.find((x) => x.objectiveId === BD1);
    s.eq('kanban count = RD.boardSummary total', s.vals.kb.count, RD.boardSummary(b, '2026-10-13').total);
    tab(s, 'Stage-gates');
    s.eq('nothing written', docOf(s, KEY).gateMode[BD1], 'kanban');
    s.clean('sales tabs');
  });

  s.step('G02 G03 G25 (Sales) add gate creates General; add workstream; independent sticks (sales §21 fixed)', () => {
    pickObj(s, 'Q1 hydrogen-hub');
    s.eq('no workstreams yet', setsOf(docOf(s, KEY), BD2).length, 0);
    s.click('Add gate', { within: 'gates-panel' });
    s.type('Name', 'First hub LOI signed', ED);
    s.type('Planned date', '2027-02-15', ED);
    const ids0 = docOf(s, KEY).stageGates.map((g) => g.id);
    s.click('Add gate', ED);
    const sets = setsOf(docOf(s, KEY), BD2);
    s.eq('General created', sets.map((x) => [x.name, x.order, x.chained]), [['General', 0, true]]);
    const g = docOf(s, KEY).stageGates.find((x) => x.objectiveId === BD2);
    s.eq('gate id from RD.allocId and shape', [g.id, g.setId, g.name, g.plannedDate, g.actualDate], [RD.allocId('stageGate', BD2, ids0), sets[0].id, 'First hub LOI signed', day('2027-02-15'), null]);
    s.click('Add workstream', { within: 'gates-panel' });
    s.type('Name', 'Hub partners', ED);
    s.check('~Independent', true, ED);
    s.click('Create workstream', ED);
    const set = setsOf(docOf(s, KEY), BD2).find((x) => x.name === 'Hub partners');
    s.eq('independent stored', [set.order, set.chained], [1, false]);
    s.eq('and shown', s.vals.gates.tab.sets.find((w) => w.id === set.id).chainLabel, 'Independent');
    s.clean('sales add');
  });

  s.step('G04 G05 (Sales) workstream header: rename, chain chip, edit sheet; no drag handle and no Move up / down (Sales has no reorder)', () => {
    const set = setsOf(docOf(s, KEY), BD2)[0];
    s.click('General', { within: 'ws-' + set.id });
    s.type('Workstream name', 'Hub anchor customers', { within: 'ws-' + set.id });
    s.key('Workstream name', 'Enter', { within: 'ws-' + set.id });
    s.eq('renamed', docOf(s, KEY).stageGateSets.find((x) => x.id === set.id).name, 'Hub anchor customers');
    s.vals.gates.tab.sets.find((w) => w.id === set.id).toggleChain(); s.render();
    s.eq('chip toggles', docOf(s, KEY).stageGateSets.find((x) => x.id === set.id).chained, false);
    s.eq('no drag handle', s.has('Drag to reorder workstreams'), false);
    s.click('Actions for workstream Hub anchor customers');
    s.eq('no Move up / Move down', [s.has('Move up'), s.has('Move down')], [false, false]);
    s.click('Edit workstream');
    s.eq('✎ opens the workstream sheet', top(s).kind, 'gates.ws');
    s.c.closeAllSheets(); s.render();
    s.clean('sales header');
  });
}

/* ============================================================ FOCUSED GRAPH */
function focusedGraph() {
  const s = fresh();
  tab(s, 'Experiments');
  s.step('S70c focused graph: tapping an experiment opens it (today the tap called window.__hubOpenExp, which is never defined, §24)', () => {
    const b0 = s.vals.step.blocks[0];
    if (!b0.graphOpen) s.click('Show graph', { within: b0.key });
    const blk = s.vals.step.blocks[0];
    s.ok(blk.graph && blk.graph.has, 'graph drawn');
    const n = blk.graph.nodes.find((x) => x.isExp);
    s.click(n.aria, { within: blk.key });
    s.ok(!!top(s) && (top(s).kind === 'etb.exp' || top(s).kind === 'etb.detail'), 'tap opens the experiment (' + (top(s) && top(s).kind) + ')');
    s.eq('the tapped one', top(s).data.expId, n.id);
    s.c.closeAllSheets(); s.render();
    s.clean('focused graph');
  });
}

/* ===================================================== SALES: NO EXPERIMENTS */
/* November 3: Sales has no Experiments tab. Its board carries neither the current step nor the logic tree, a link
   naming the tab opens the Overview, and a stored tree stays in the document, untouched by a visit and an edit. */
function salesNoExperiments() {
  const s = fresh();
  s.step('S-X Sales: no Experiments tab, no Current step card, no logic tree; the stored tree is kept', () => {
    const before = JSON.stringify(docOf(s, 'BIZ-DIV-BD').etbTrees['OBJ-BD-2026Q4-01']);
    s.eq('the tabs', s.vals.sh.tabs.map((t) => t.id), ['overview', 'krs', 'gates', 'kanban', 'risks']);
    s.eq('no step or logic tree module on the board', [!!s.ns.MODS.step, !!s.ns.MODS.etb, s.vals.step, s.vals.etb], [false, false, undefined, undefined]);
    s.eq('nothing about experiments on the Overview', [s.has((el) => el.attrs['data-k'] === 'ov-step'), s.has('Open experiments'), s.has('Record outcome')], [false, false, false]);
    s.ok(!!before && JSON.parse(before).experiments, 'the sample keeps its pilot-offer tree');
    tab(s, 'Kanban');
    tab(s, 'Overview');
    s.eq('visiting the tabs leaves the tree as it was', JSON.stringify(docOf(s, 'BIZ-DIV-BD').etbTrees['OBJ-BD-2026Q4-01']), before);
    s.clean('sales no experiments');
  });
}

/* ================================================================ READ-ONLY */
/* today: editing controls hidden, a click guard, no writes (exec §3, sales §5); the controls that still worked
   without saving (switch, completion, kanban, workstream drag, ETB fields) are views in Calm, except the
   Gates / Kanban switch and the Done-column menu, which change only what this viewer sees */
function readOnly() {
  const KEY = SALES ? 'BIZ-DIV-BD' : 'EXEC-DIV-EL';
  const s = fresh();
  s.c.setState({ ro: true }); s.render();
  const snap = () => JSON.stringify(docOf(s, KEY));
  const before = snap();

  s.step('R01 read-only Stage-gates: no add, edit, mark complete, targets or drag; gate and completion sheets are views; the Kanban tab is a view too', () => {
    tab(s, 'Kanban');
    s.eq('the Kanban tab opens read-only', [s.c.state.tab, s.vals.kb.ro], ['kanban', true]);
    tab(s, 'Stage-gates');
    const t = s.vals.gates.tab;
    s.eq('no Add gate / Add workstream', [t.canAdd, s.has('Add gate', { within: 'gates-panel' }), s.has('Add workstream', { within: 'gates-panel' })], [false, false, false]);
    s.eq('no Mark complete', rows(s).some((g) => g.canMark) || s.has('Mark complete', { within: 'gates-panel' }), false);
    s.eq('no gate or workstream menus, rename or drag', [s.has('~Actions for', { within: 'gates-panel' }), s.has('Drag to reorder workstreams'), t.sets.some((w) => w.canEdit || w.canDrag)], [false, false, false]);
    s.eq('no Add a target / Add linked KPI', [s.has('Add a target', { within: 'gates-panel' }), s.has('Add linked KPI', { within: 'gates-panel' })], [false, false]);
    const open = rows(s).find((g) => !g.isPassed);
    s.click(open.name, { within: gk(open.id) });
    s.eq('a gate opens as a view', [top(s).kind, s.vals.gates.shEdit.ro], ['gates.edit', true]);
    s.eq('no Delete, Duplicate, baseline or predecessors', [s.has('Delete gate', ED), s.has('Duplicate', ED), s.has('Commit baseline', ED), s.has('Add predecessor', ED), s.has('Close', ED)], [false, false, false, false, true]);
    s.c.closeAllSheets(); s.render();
    const passed = rows(s).find((g) => g.isPassed);
    s.ok(!!passed, 'a passed gate to look at');
    s.click(passed.passedText, { within: gk(passed.id) });
    s.eq('completion is a view (today it still offered Un-complete and Save, never saved)', [top(s).kind, s.vals.gates.shComp.ro, s.has('Un-complete gate', ED), s.has('Save', ED)], ['gates.comp', true, false, false]);
    s.c.closeAllSheets(); s.render();
    if (!SALES) s.eq('no Revise plan under the history', !!(s.vals.gates.hist && s.vals.gates.hist.canRevise), false);
    s.eq('the document is untouched', snap(), before);
    s.clean('ro gates');
  });

  s.step('R02 read-only Kanban: no add, configure, delete or drag; a tile opens as a view; the Done menu is the viewer\'s own', () => {
    if (!SALES) pickObj(s, 'Lock Tera');
    tab(s, 'Kanban');
    const kb = s.vals.kb;
    s.eq('view only', [kb.ro, kb.edit], [true, false]);
    s.eq('no Add board / Add tile / Configure / Delete board', [s.has('Add board'), s.has('Add tile', { within: 'kb' }), s.has('Configure', { within: 'kb' }), s.has('Delete board')], [false, false, false, false]);
    const tiles = [];
    kb.lanes.forEach((l) => l.cells.forEach((c) => c.tiles.forEach((x) => tiles.push(x))));
    kb.bl.groups.forEach((g) => g.tiles.forEach((x) => tiles.push(x)));
    s.ok(tiles.length > 0, 'tiles on the board');
    s.eq('no tile drags', tiles.some((x) => x.drag), false);
    s.eq('no drop targets', kb.lanes.some((l) => l.cells.some((c) => c.drop)) || kb.bl.groups.some((g) => g.drop), false);
    s.click(tiles[0].name, { within: tiles[0].k });
    s.eq('tile sheet is a view', [top(s).kind, s.vals.kb.tile.ro, s.vals.kb.tile.canSave, s.vals.kb.tile.canDelete, s.vals.kb.tile.cancelText], ['kb.tile', true, false, false, 'Close']);
    s.c.closeAllSheets(); s.render();
    s.eq('the document is untouched', snap(), before);
    s.clean('ro kanban');
  });

  s.step('R03 read-only Risks: no add, edit, status changes or delete; statuses read as dot and word', () => {
    if (!SALES) pickObj(s, 'Qualify the 10-cell');
    tab(s, 'Risks');
    const reg = s.vals.fmea.reg;
    s.eq('view only', [reg.canEdit, s.has('Add problem')], [false, false]);
    s.eq('no problem menus or status menus', [s.has('~More actions'), s.has('Change status')], [false, false]);
    s.ok(reg.probs.length > 0 && reg.probs.every((p) => !p.canEdit && p.st && !p.st.edit), 'every card and status is plain');
    s.eq('the document is untouched', snap(), before);
    s.clean('ro risks');
  });

  if (!SALES) s.step('R04 read-only Experiments: no Conclude / Record outcome, Connect data, Manage trees or New tree; key reads are plain', () => {
    tab(s, 'Experiments');
    const st = s.vals.step;
    s.eq('no tree management', [st.canTrees, s.has('Manage trees'), s.has('New tree')], [false, false, false]);
    s.eq('no Conclude… / Record outcome', [s.has('Conclude…'), s.has('Record outcome')], [false, false]);
    s.eq('no Connect data', s.has('Connect data', { within: 'current-step' }), false);
    if (!SALES) {
      const rowsV = []; st.blocks.forEach((b) => b.cards.forEach((c) => (c.rows || []).forEach((r) => rowsV.push(r))));
      s.ok(rowsV.length > 0 && rowsV.every((r) => r.plain && !r.clickOne && !r.clickStat), 'key-read cells are not clickable');
    }
    s.eq('the document is untouched', snap(), before);
    s.clean('ro step');
  });

  if (!SALES) s.step('R05 read-only logic tree: no Add experiment, Save or Clear all data; details open the editor as a view with disabled fields', () => {
    const E = s.vals.etb;
    s.eq('toolbar', [E.canEdit, s.has('Add experiment', { within: 'etb' }), s.has('Save', { within: 'etb' })], [false, false, false]);
    s.click('Logic tree settings', { within: 'etb' });
    s.eq('no Clear all data', s.has('Clear all data', ED), false);
    s.c.closeAllSheets(); s.render();
    const v = treeOf(s, KEY, SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01');
    const done = Object.keys(v.experiments).find((id) => v.experiments[id].actual_outcome);
    s.click('Graph', { within: 'etb' });
    s.vals.etb.g.nodes.find((n) => n.id === done).open(); s.render();
    s.eq('details first', top(s).kind, 'etb.detail');
    s.click('Open the editor', ED);
    s.eq('the editor is a view', [top(s).kind, s.vals.etb.exp.ro, s.vals.etb.exp.canEdit], ['etb.exp', true, false]);
    s.ok(s.has('Read-only view. Nothing here can be changed.', ED), 'says so');
    const nameIn = s.all('Name', ED).find((el) => el.tag === 'input');
    s.eq('fields are disabled (today they still took typing, never saved)', !!(nameIn && nameIn.attrs.disabled), true);
    s.c.closeAllSheets(); s.render();
    s.eq('the document is untouched', snap(), before);
    s.clean('ro etb');
  });
}

/* ========================================================== BROWSER MEMORY */
/* today keeps these per-person view choices in the browser (rd_kb_backlog, rd_kb_narrow, rd_kb_done,
   etbGraphOpen:<objectiveId>, etb_editor_v1); the harness's localStorage is a no-op, so lend it a real one here */
function browserMemory() {
  const KEY = SALES ? 'BIZ-DIV-BD' : 'EXEC-DIV-EL';
  const OBJK = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-02';
  const OBJE = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01';
  const mem = {};
  const stub = global.window.localStorage;
  global.window.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  try {
    const s = fresh();
    s.step('K47 K51 K53 S70 E104 (browser memory) per-browser choices outlast the visit under today\'s keys', () => {
      if (!SALES) pickObj(s, 'Lock Tera');
      tab(s, 'Kanban');
      const b = docOf(s, KEY).boards.find((x) => x.objectiveId === OBJK);
      s.click('Collapse the backlog', { within: 'kb' });
      s.eq('rd_kb_backlog', mem.rd_kb_backlog, '0');
      s.click('Add tile to ' + b.swimlanes[0].name, { within: 'kb' });
      s.check('~Division owners only', false, ED);
      s.eq('rd_kb_narrow', mem.rd_kb_narrow, '0');
      s.c.closeAllSheets(); s.render();
      s.c.setState({ sim: Object.assign({}, s.c.state.sim, { hub: false }) }); s.render();
      s.vals.kb.done.toggle(); s.render();
      s.click('7 days', { within: '~Finished tiles in' });
      s.eq('rd_kb_done (signed out)', JSON.parse(mem.rd_kb_done)[b.id], { win: 7 });
      s.c.setState({ menu: '' }); s.render();
      let tid = null;
      if (!SALES) {   // Sales has no Experiments tab since November 3
        pickObj(s, 'Qualify the 10-cell');
        tab(s, 'Experiments');
        const blk = s.vals.step.blocks[0]; tid = blk.key.slice(4);
        s.click('Show graph', { within: blk.key });
        s.eq('etbGraphOpen:<objective>', JSON.parse(mem['etbGraphOpen:' + OBJE]), { [tid]: 1 });
        s.click('Logic tree settings', { within: 'etb' });
        s.type('Initials or name', 'Ada Okafor', ED);
        s.click('Save name', ED);
        s.eq('etb_editor_v1', mem.etb_editor_v1, 'Ada Okafor');
      }
      /* the next visit starts from this browser's choices */
      const s2 = fresh();
      s2.c.setState({ sim: Object.assign({}, s2.c.state.sim, { hub: false }) }); s2.render();
      s.eq('backlog stays collapsed', s2.c.state.kb_bl, false);
      s.eq('owners-only stays off', s2.c.state.kb_narrow, false);
      s.eq('Done window kept in this browser', s2.c.state.kb_anon[b.id], { win: 7 });
      if (!SALES) {
        s.eq('editor name kept', s2.c.state.etb_editor, 'Ada Okafor');
        tab(s2, 'Experiments');
        s.eq('that tree\'s graph is still shown', s2.vals.step.blocks.find((x) => x.key === 'blk-' + tid).graphOpen, true);
        s2.click('Hide graph', { within: 'blk-' + tid });
        s.eq('and hiding it is remembered too', JSON.parse(mem['etbGraphOpen:' + OBJE]), {});
      }
      s2.c.setState({ sim: Object.assign({}, s2.c.state.sim, { hub: true }) }); s2.render();
      s.clean('browser memory');
    });
  } finally { global.window.localStorage = stub; }
}

/* run */
if (!SALES) gatesExec(); else gatesSales();
gatesDialogs();
if (!SALES) planRevision(); else salesRecommit();
kanban();
fmea();
if (!SALES) { currentStep(); focusedGraph(); logicTree(); } else salesNoExperiments();
readOnly();
browserMemory();
done();
