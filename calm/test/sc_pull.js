/* Scenario test for pulled KPIs (mods/pull, and the engine's RD.pulledResult behind them), on both boards.
     node test/sc_pull.js out/Main.dc.html
     node test/sc_pull.js out/Sales-A.dc.html
   Clicks and types like a person: Add KPI / Add target, "Pulled from other work", the sheet (what to pull, the
   statistics, which work, the targets), the value's dropdown, the row menu, the key result sheet, the Overview.
   Every number is checked against the plain engine read independently here (objective scores, schedule slips,
   tiles, gates), never through the pull code. Execution replays Corey's example (October 19): an OKR on
   technical excellence whose KR1 averages every R&D objective score (and takes the median) and whose KR2
   counts the objectives more than 10 days behind schedule. */
const { Sim, done, textOf } = require('./dc');
const RD = require(require('./engine_path'));

const file = process.argv[2] || 'out/Main.dc.html';
let s = new Sim(file);
const SALES = s.c.APP === 'sales' || (s.ns && s.ns.APP === 'sales');
const TD = s.c.D.today;
const ED = { within: 'Editor' };
const COREY = 'corey@celadyne.com', DANA = 'dana@celadyne.com', TORU = 'toru@celadyne.com', ERIN = 'erin@celadyne.com';
const SAM = 'sam@celadyne.com', PRIYA = 'priya@celadyne.com';
const DAY0 = Date.UTC(2020, 0, 1);
const dayOf = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - DAY0) / 86400000);
const r1 = (x) => Math.round(x * 10) / 10;
const pc = (x) => r1(x) + '%';
/* a statistical KPI's score against a plain target, as the engine scores it (progressLinear) */
const sc = (v, t, dir) => Math.max(0, Math.min(100, dir === 'down' ? (v <= t ? 100 : (t === 0 ? 0 : 100 * t / v)) : 100 * v / t));
const scT = (v, t, dir) => String(Math.round(sc(v, t, dir)));
const toasts = () => (s.c.state.toasts || []).map((t) => t.text);
const fresh = () => { s = new Sim(file); return s; };
const nav = (patch) => { s.c.setState(Object.assign({ menu: '', sheets: [] }, patch)); return s.render(); };
const b = () => s.vals.pull.build;
/* a measure's radio button, by its label (its description, shown beside it, is unique) */
const measure = (label) => { const m = b().measures.find((x) => x.label === label); return s.click('~' + m.desc, { tag: 'button', within: 'Read its' }); };
const signIn = (email) => { s.click('Settings'); s.type('Signed in as', email); s.c.closeAllSheets(); return s.render(); };
const pickDiv = (name) => { s.click(SALES ? 'Choose a business division' : 'Choose an R&D division'); return s.click('~' + name, { within: 'Divisions' }); };
const pickObj = (txt) => s.click('~' + txt, { within: 'Objectives' });
const tab = (name) => { if (!s.has(name, { tag: 'button' })) return s; return s.click(name, { tag: 'button' }); };
const docKeyOf = (divId) => (s.c.D.docs['EXEC-' + divId] ? 'EXEC-' + divId : 'BIZ-' + divId);
const kpisOn = (hostType, hostId) => {
  const out = [];
  Object.keys(s.c.D.docs).forEach((k) => (s.c.D.docs[k].kpis || []).forEach((x) => { if (x.hostType === hostType && x.hostId === hostId) out.push(x); }));
  return out;
};
/* a key result's KPI table (open once the key result is), or a stage-gate's target table (open, with targets) */
const ktOf = (key) => {
  const m = /^(keyResult|stageGate):(.+)$/.exec(key);
  if (m[1] === 'keyResult') { const w = (s.vals.kr.rows || []).find((x) => x.kt && x.kt.key === key); return w ? w.kt : null; }
  let r = null;
  ((s.vals.gates.tab && s.vals.gates.tab.sets) || []).forEach((w) => w.gates.forEach((g) => { if (g.id === m[2] && g.kt) r = g.kt; }));
  return r;
};
const rowsOf = (hostType, hostId) => { const t = ktOf(hostType + ':' + hostId); return t ? t.rows : []; };
const rowOf = (hostType, hostId, name) => rowsOf(hostType, hostId).find((r) => r.name === name);
const openKR = (krId, label) => { if (!ktOf('keyResult:' + krId)) s.click('~' + label); return s; };
const openGate = (gid) => nav({ gates_open: Object.assign({}, s.c.state.gates_open || {}, { [gid]: true }) });
/* the documents of a scope's divisions, read plainly (no pull code): 'all', 'rd' (Execution's kind), 'biz' (Sales'),
   'unit:<id>' or one division */
function docsOfKind(D, kind) {
  const m = {};
  D.portfolio.divisions.forEach((d) => {
    const k = (d.kind || 'rd') === 'biz' ? 'BIZ-' + d.id : 'EXEC-' + d.id;
    const ok = kind === 'all' || (kind === 'rd' || kind === 'biz' ? (d.kind || 'rd') === kind : String(kind).indexOf('unit:') === 0 ? d.unitId === kind.slice(5) : d.id === kind);
    if (ok && D.docs[k]) m[d.id] = D.docs[k];
  });
  return m;
}
/* objective scores and schedule slips with the plain engine over every document, for the objectives in a scope */
function objOracle(D, kind, o) {
  o = o || {};
  const docs = docsOfKind(D, kind);
  const em = RD.withPortfolio(D.portfolio, docsOfKind(D, 'all'));
  const casc = RD.cascade(D.portfolio, em, D.today);
  const objs = D.portfolio.objectives.filter((x) => docs[x.divisionId] && (o.q == null || x.quarter === o.q) && (!o.div || x.divisionId === o.div) &&
    (o.out || []).indexOf(x.id) < 0);
  const scores = objs.map((x) => RD.objectiveScore(x.id, em)).filter((x) => x != null);
  const slips = objs.map((x) => casc.objectiveScheduleSlip[x.id]).filter((x) => x != null);
  const srt = scores.slice().sort((a, b2) => a - b2), n = srt.length;
  return {
    objs, scores, slips,
    avg: n ? scores.reduce((a, x) => a + x, 0) / n : null,
    median: !n ? null : n % 2 ? srt[(n - 1) / 2] : (srt[n / 2 - 1] + srt[n / 2]) / 2,
    max: slips.length ? Math.max.apply(null, slips) : null,
    over: (t) => slips.filter((x) => x > t).length
  };
}
/* a board's tiles, read plainly: placed (not parked), finished (in the last column), finished in a window */
function tileOracle(D, docKey, boardId) {
  const brd = D.docs[docKey].boards.find((x) => x.id === boardId);
  const last = brd.columns[brd.columns.length - 1].id;
  const placed = brd.tiles.filter((t) => !RD.tileInBacklog(t));
  const fin = placed.filter((t) => t.col === last);
  const finIn = (days) => fin.filter((t) => { const d = t.enteredCol ? dayOf(t.enteredCol) : null; return d != null && d > D.today - days && d <= D.today; });
  return { brd, last, placed, fin, finIn };
}
/* the sheet's line under the preview, for an objective oracle ("6 objectives pulled from every division, all quarters, 2 waiting or left out.") */
const pulledLine = (o, words) => o.scores.length + (o.scores.length === 1 ? ' objective' : ' objectives') + ' pulled from ' + words +
  ((o.objs.length - o.scores.length) ? ', ' + (o.objs.length - o.scores.length) + ' waiting or left out' : '') + '.';
/* older records hold an objective's owner as one email, not a list (the live portfolio does, October 20): make
   every owner one string, one of them in capitals with stray spaces; give back what to restore */
const ownersAsStrings = (odd) => {
  const saved = s.c.D.portfolio.objectives.map((o) => o.owner);
  s.c.mutate((D) => D.portfolio.objectives.forEach((o) => { const v = RD.ownersOf(o); o.owner = !v.length ? '' : o.id === odd ? ' ' + String(v[0]).toUpperCase() + ' ' : String(v[0]); }), { quiet: true });
  s.render();
  return () => { s.c.mutate((D) => D.portfolio.objectives.forEach((o, i) => { o.owner = saved[i]; }), { quiet: true }); s.render(); };
};
/* the objectives one owner has, in every division and quarter (but `out`), and their mean score, read plainly */
function ownerOracle(D, email, out) {
  const docs = docsOfKind(D, 'all');
  const em = RD.withPortfolio(D.portfolio, docs);
  const objs = D.portfolio.objectives.filter((o) => docs[o.divisionId] && (out || []).indexOf(o.id) < 0 && RD.ownersOf(o).some((e) => String(e).trim().toLowerCase() === email));
  const scores = objs.map((o) => RD.objectiveScore(o.id, em)).filter((x) => x != null);
  return { objs, scores, avg: scores.length ? scores.reduce((a, x) => a + x, 0) / scores.length : null };
}
const engineScore = (fn, id) => {
  const D = s.c.D, m = {};
  D.portfolio.divisions.forEach((d) => { const k = docKeyOf(d.id); if (D.docs[k]) m[d.id] = D.docs[k]; });
  s.render();          // the board's engine reads this page's documents (its pull source)
  return s.ns.RD[fn](id, s.ns.RD.withPortfolio(D.portfolio, m));
};

/* ======================================================================================== Execution */
if (!SALES) {
  const OBJ = 'OBJ-CTO-2026Q4-01', KR1 = 'KR-CTO-2026Q4-01-1', KR2 = 'KR-CTO-2026Q4-01-2';
  const AVG = 'Average objective score', MED = 'Median objective score', LATE = 'Objectives more than 10 days behind schedule';
  /* Corey's OKR sits in a small CTO office division (the sample has none): two key results, no KPIs yet */
  const ctoOffice = () => {
    s.c.mutate((D) => {
      D.portfolio.divisions.push({ id: 'DIV-CTO', name: 'CTO office', kind: 'rd', unitId: 'UNIT-TECHNI', order: 4 });
      D.portfolio.objectives.push({ id: OBJ, divisionId: 'DIV-CTO', initiativeId: null, quarter: '2026Q4', statement: 'Technical excellence', owner: [COREY],
        plannedStart: dayOf('2026-10-01'), plannedEnd: dayOf('2026-12-18'), milestoneIds: [], productId: null, modelId: null, order: 1 });
      D.docs['EXEC-DIV-CTO'] = {
        keyResults: [
          { id: KR1, objectiveId: OBJ, statement: 'Average objective score above 80%', trackingType: 'kpi' },
          { id: KR2, objectiveId: OBJ, statement: 'Maintain on-time completion of stage-gates', trackingType: 'kpi' }
        ],
        kpis: [], kpiUpdates: [], stageGateSets: [], stageGates: [], stageGateEdges: [], tasks: [], boards: [], risks: [], planVersions: [],
        catchupPlans: [], objectiveState: [], gateMode: {}, chainGatesByDate: {}, etbTrees: {}
      };
    }, { quiet: true });
    pickDiv('CTO office'); pickObj('Technical excellence'); tab('Key results');
    openKR(KR1, 'KR1 Average objective score above 80%'); openKR(KR2, 'KR2 Maintain on-time completion');
    return s;
  };
  const O = () => objOracle(s.c.D, 'rd', { q: '2026Q4', out: [OBJ] });

  s.step('Corey (CTO) adds the average and the median of every R&D objective score on KR1', () => {
    ctoOffice();
    const o = O();
    s.eq('oracle: five R&D objectives this quarter, their own never', [o.objs.length, o.scores.length, o.slips.length], [5, 5, 5]);
    s.eq('as on the proposal: average 54.9%, median 52%, one objective 18 days behind', [pc(o.avg), pc(o.median), o.slips.filter((x) => x > 10)], ['54.9%', '52%', [18]]);
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR1 });
    s.eq('the KPI sheet', s.c.sheet().kind, 'kpi.target');
    s.ok(s.has('Posted here', ED) && s.has('Pulled from other work', ED), 'Readings: Posted here | Pulled from other work');
    s.click('Pulled from other work', ED);
    s.eq('switched in place', [s.c.state.sheets.length, s.c.sheet().kind], [1, 'pull.build']);
    s.eq('defaults: the CTO starts on every division', [b().title, b().sub, b().eachSel.v, b().div.v, b().quarter.v, b().follow, b().canPosted], ['Add KPI', 'KR1, Average objective score above 80%', 'objective', 'all', 'current', true, true]);
    s.eq('measures', b().measures.map((m) => m.label), ['Score', 'Days behind schedule', 'Gate health', 'Status']);
    s.eq('the division choice: every division, a kind, a unit, or one division, R&D and business alike', [b().div.opts.map((x) => x.label), b().div.groups.map((g) => [g.label, g.opts.map((x) => x.label)])],
      [['Every division', 'Every R&D division', 'Every business division'],
        [['Units', ['Technical unit', 'Business unit']], ['Divisions', ['Fuel Cell', 'Electrolyzer', 'CTO office', 'Business Development', 'Partnerships']]]]);
    const oa = objOracle(s.c.D, 'all', { q: '2026Q4', out: [OBJ] });
    s.eq('every division: R&D and business objectives alike (oracle ' + oa.objs.length + ')', [b().tiles[0].value, b().pulledLine], [pc(oa.avg), oa.objs.length + ' objectives pulled from every division, the current quarter (Q4 2026).']);
    s.ok(b().groups.some((g) => g.name === 'Business Development'), 'Sales\' objectives are listed');
    s.type('Division', 'rd', ED);   // Corey's technical-excellence OKR reads R&D's objectives
    s.click('Median', ED);
    s.eq('two tiles, as the rows will read', b().tiles.map((t) => [t.label, t.value, t.score, t.stWord, t.target]),
      [['Average', pc(o.avg), scT(o.avg, 80), 'Near', '≥ 80%'], ['Median', pc(o.median), scT(o.median, 80), 'Near', '≥ 80%']]);
    s.eq('pulled line', b().pulledLine, '5 objectives pulled from every R&D division, the current quarter (Q4 2026).');
    s.eq('targets: a suggested name each, at least 80%', b().tgRows.map((r) => [r.label, r.name, r.dir, r.target, r.unit]),
      [['Average', AVG, 'up', '80', '%'], ['Median', MED, 'up', '80', '%']]);
    const own = b().groups.find((g) => g.name === 'CTO office').items[0];
    s.eq('its own objective is listed, never pulled', [own.name, own.on, own.canToggle, own.text], ['Technical excellence', false, false, 'Holds this KPI, so it isn’t pulled']);
    s.eq('save label', b().saveLabel, 'Add 2 KPIs');
    s.clean('builder');
    s.click('Add 2 KPIs', ED);
    s.ok(!s.c.sheet(), 'the sheet closes');
    s.ok(toasts().includes('2 KPIs added.'), '2 KPIs added.');
    const ks = kpisOn('keyResult', KR1);
    s.eq('saved', ks.map((k) => [k.name, k.targetType, k.statistic, k.direction, k.target, k.unit, k.threshold, k.objectiveId, k.groupId, k.isDefiner]),
      [[AVG, 'statistical', 'average', 'up', 80, '%', undefined, OBJ, null, true], [MED, 'statistical', 'median', 'up', 80, '%', undefined, OBJ, null, true]]);
    s.eq('what it pulls', ks.map((k) => [k.pull.v, k.pull.each, k.pull.measure, k.pull.scope.div, k.pull.scope.quarter, k.pull.follow, k.pull.exclude, k.pull.by, typeof k.pull.at]),
      [[1, 'objective', 'score', 'rd', 'current', true, [], COREY, 'number'], [1, 'objective', 'score', 'rd', 'current', true, [], COREY, 'number']]);
    s.ok(/^KPI-CTO-2026Q4-01-/.test(ks[0].id) && ks[0].id !== ks[1].id, 'ids from the objective, as every KPI: ' + ks.map((k) => k.id).join(', '));
    const a = rowOf('keyResult', KR1, AVG), m = rowOf('keyResult', KR1, MED);
    s.eq('average row', [a.cur, a.sub, a.crit, a.score, a.stWord, a.badges.map((x) => x.label)], [pc(o.avg), 'Average of 5 objective scores', '≥ 80%', scT(o.avg, 80), 'Near', ['Pulled']]);
    s.eq('median row', [m.cur, m.sub, m.crit, m.score, m.stWord], [pc(o.median), 'Median of 5 objective scores', '≥ 80%', scT(o.median, 80), 'Near']);
    s.clean('after adding');
  });

  s.step('KR2 counts the objectives more than 10 days behind schedule', () => {
    const o = O();
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR2 });
    s.click('Pulled from other work', ED);
    measure('Days behind schedule');
    s.type('Division', 'rd', ED);
    s.eq('a count above 10 days, aiming at none', [b().statChips.filter((c) => c.on).map((c) => c.label), b().threshold, b().thresholdUnit, b().tgRows[0].dir, b().tgRows[0].target, b().tgRows[0].unit],
      [['Count above'], '10', 'days', 'down', '0', 'objectives']);
    s.eq('the hint says what counts', b().thrHint, 'Counts each objective more than 10 days behind schedule.');
    s.eq('tile', [b().tiles[0].label, b().tiles[0].value, b().tiles[0].score, b().tiles[0].stWord, b().tiles[0].target], ['Count above 10 days', o.over(10) + ' objective', '0', 'Below', '≤ 0 objectives']);
    s.eq('list head', b().listHead, '5 objectives pulled, 1 over 10 days');
    const late = [].concat(...b().groups.map((g) => g.items)).find((x) => x.name === 'Root-cause AST degradation');
    s.eq('the late one, flagged', [late.val, late.text, late.cls], ['18 days', 'over 10 days', 'pull-it hit bad']);
    s.click('Add KPI', ED);
    const k = kpisOn('keyResult', KR2)[0];
    s.eq('saved', [k.name, k.statistic, k.threshold, k.direction, k.target, k.unit, k.pull.measure], [LATE, 'countAbove', 10, 'down', 0, 'objectives', 'slip']);
    const l = rowOf('keyResult', KR2, LATE);
    s.eq('row', [l.cur, l.sub, l.crit, l.score, l.stWord], ['1 objective', '1 of 5 objectives more than 10 days behind schedule', '≤ 0 objectives', '0', 'Below']);
  });

  s.step('the key results and the objective score from them (the engine, as every app reads it)', () => {
    const o = O();
    const k1 = (sc(o.avg, 80) + sc(o.median, 80)) / 2;
    s.ok(Math.abs(engineScore('keyResultScore', KR1) - k1) < 1e-6, 'KR1 = the mean of its two KPI scores, ' + r1(k1));
    s.eq('KR2 = 0', engineScore('keyResultScore', KR2), 0);
    s.eq('objective = the mean of KR1 and KR2, 33 on the proposal', [r1(engineScore('objectiveScore', OBJ)), Math.round(engineScore('objectiveScore', OBJ))], [r1(k1 / 2), 33]);
  });

  s.step('the value is a dropdown that shows what was pulled; the menu only edits and deletes', () => {
    const r = () => rowOf('keyResult', KR2, LATE);
    s.eq('closed', [/\bpull-dd\b/.test(r().curCls), / open\b/.test(r().curCls), r().valTitle, r().valExpanded, !!r().drawer], [true, false, 'Show readings', 'false', false]);
    s.click('Readings for ' + LATE);
    s.eq('open', [/ open\b/.test(r().curCls), r().valTitle, r().valExpanded, !!r().drawer], [true, 'Hide readings', 'true', true]);
    const d = r().drawer;
    s.eq('summary', [d.title, d.statLine, d.cnt, d.tgt], ['Readings for ' + LATE, 'Count above 10 days = 1 objective', '5 objectives pulled', 'Target ≤ 0 objectives']);
    s.eq('largest delay first, counted', [d.rows[0].v, d.rows[0].when, d.rows[0].by, d.rows[0].note, d.rows[0].cls], ['18 days', 'Root-cause AST degradation', 'Fuel Cell', 'Behind schedule, over 10 days, counted', 'kpi-ditem pull-di pull-hit bad']);
    s.eq('the other four on schedule', d.rows.slice(1, 5).map((x) => x.v), ['0 days', '0 days', '0 days', '0 days']);
    s.eq('its own objective last, not pulled', [d.rows[5].when, d.rows[5].note, d.rows[5].v, /\bout\b/.test(d.rows[5].cls)], ['Technical excellence', 'Holds this KPI, so it isn’t pulled', '—', true]);
    s.ok(!d.canEdit && !s.has('Add reading') && !s.has('New reading for ' + LATE), 'nobody posts readings to a pulled KPI');
    s.eq('what it pulls, in words', d.borrowText, 'Pulls each objective’s days behind schedule: every R&D division, the current quarter (Q4 2026). New matches join on their own.');
    s.eq('the leader’s note', d.roNote, 'Nobody posts readings here. To change what it pulls, use Edit KPI in the row’s menu.');
    s.clean('drawer');
    s.click('Readings for ' + LATE);
    s.eq('closed again', [r().valExpanded, !!r().drawer], ['false', false]);
    s.click('Readings for ' + LATE);
    s.click('Close readings');
    s.ok(!r().drawer, 'Close readings closes it');
    s.click('Actions for ' + LATE);
    s.eq('menu', r().menu.map((x) => x.label), ['Edit KPI', 'Delete KPI']);
    s.click('Actions for ' + LATE);
    s.ok(r().nameBtn, 'the name opens its sheet for a leader');
    /* the median's drawer marks the middle value */
    s.click('Readings for ' + MED);
    const md = rowOf('keyResult', KR1, MED).drawer;
    s.eq('the median marked, highest first', md.rows.filter((x) => /middle value/.test(x.note)).map((x) => x.v), ['52%']);
    s.eq('scores in order', md.rows.slice(0, 5).map((x) => x.v), O().scores.slice().sort((a, b2) => b2 - a).map(pc));
    s.ok(!rowOf('keyResult', KR2, LATE).drawer, 'one drawer at a time');
    s.click('Readings for ' + MED);
  });

  s.step('a pulled KPI takes no readings by any route, and is nobody’s sample or link', () => {
    const k = kpisOn('keyResult', KR1)[0];
    const api = s.ns.MODS.kpi.api, ctx = s.c.ctx;
    const n0 = s.c.D.docs['EXEC-DIV-CTO'].kpiUpdates.length;
    const p = api.post(s.c, ctx, k, 'probe');
    s.eq('KPI.post gives the dropdown, not an editor', [p.btn, p.canPost, p.editing, p.title], [true, false, false, 'Show readings']);
    p.click(); s.render();
    s.eq('its click opens what was pulled', [s.c.state.kpi_rd && s.c.state.kpi_rd.id, s.c.state.kpi_ed], [k.id, null]);
    s.c.setState({ kpi_rd: null }); s.render();
    s.eq('no reading written', s.c.D.docs['EXEC-DIV-CTO'].kpiUpdates.length, n0);
    /* another KPI on the objective: its sample choices and the link sheet never offer a pulled KPI */
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR2 });
    s.click('Statistical', ED);
    s.ok(!s.vals.kpi.tg.readsFromOpts.some((o) => o.v === k.id), 'not a sample to borrow');
    s.c.closeAllSheets(); s.render();
    s.click('Link a metric', { within: 'kpi-t:keyResult:' + KR2 });
    s.ok(!JSON.stringify(s.vals.kpi.lk || {}).includes(k.id), 'not a metric to link to');
    s.c.closeAllSheets(); s.render();
    s.ok(!s.ns.ETB || !s.ns.ETB.projectKpis || !s.ns.ETB.projectKpis(s.c, ctx).some((x) => x.gid === k.id), 'not a key read’s KPI');
  });

  s.step('the value follows the work: a reading posted on an Electrolyzer KPI moves the average and the median', () => {
    const o1 = O();
    pickDiv('Electrolyzer'); pickObj('Qualify the 10-cell'); tab('Key results');
    openKR('KR-EL-2026Q4-01-3', 'KR3 Hold H₂-in-O₂ crossover');
    s.click('~Post a reading for H₂ in O₂');
    s.type('~New value for H₂ in O₂', '2');   // above its 1% target: the key result, then the objective, drop
    s.key('~New value for H₂ in O₂', 'Enter');
    pickDiv('CTO office'); pickObj('Technical excellence'); tab('Key results');
    openKR(KR1, 'KR1 Average objective score above 80%'); openKR(KR2, 'KR2 Maintain on-time completion');
    const o2 = O();
    s.ok(o2.avg !== o1.avg, 'the oracle moved (' + r1(o1.avg) + ' → ' + r1(o2.avg) + ')');
    s.eq('average follows', rowOf('keyResult', KR1, AVG).cur, pc(o2.avg));
    s.eq('median follows', rowOf('keyResult', KR1, MED).cur, pc(o2.median));
    s.clean('after a reading elsewhere');
  });

  s.step('edit the 10-day KPI: a 20-day threshold, the suggested name follows; a typed name stays', () => {
    s.click('Actions for ' + LATE); s.click('Edit KPI');
    s.eq('sheet', s.c.sheet().kind, 'pull.build');
    s.eq('edit mode', [b().title, b().statHead, b().canPosted, b().saveLabel], ['Edit KPI', 'Statistic', false, 'Save']);
    s.eq('one statistic picked', b().statChips.filter((c) => c.on).map((c) => c.label), ['Count above']);
    s.type('~Threshold', '20', ED);
    s.eq('preview', [b().tiles[0].label, b().tiles[0].value, b().tiles[0].score, b().tiles[0].stWord], ['Count above 20 days', '0 objectives', '100', 'Met']);
    s.eq('the name follows', b().tgRows[0].name, 'Objectives more than 20 days behind schedule');
    s.click('Save', ED);
    let k = kpisOn('keyResult', KR2)[0];
    s.eq('saved', [k.name, k.statistic, k.threshold, k.direction, k.target, k.unit, k.pull.measure, k.pull.by], ['Objectives more than 20 days behind schedule', 'countAbove', 20, 'down', 0, 'objectives', 'slip', COREY]);
    s.eq('row', [rowOf('keyResult', KR2, k.name).cur, rowOf('keyResult', KR2, k.name).score], ['0 objectives', '100']);
    s.eq('KR2 now 100', engineScore('keyResultScore', KR2), 100);
    s.ok(toasts().includes('KPI saved.'), 'KPI saved.');
    s.click('Actions for ' + k.name); s.click('Edit KPI');
    s.type('Count above 20 days, name', 'Objectives badly behind', ED);
    s.type('~Threshold', '10', ED);
    s.eq('a typed name stays', b().tgRows[0].name, 'Objectives badly behind');
    s.click('Save', ED);
    k = kpisOn('keyResult', KR2)[0];
    s.eq('saved name and threshold', [k.name, k.threshold], ['Objectives badly behind', 10]);
    /* editing picks one statistic: another chip replaces it */
    s.click('Readings for Objectives badly behind'); s.click('Readings for Objectives badly behind');
    s.click('Objectives badly behind');   // the name opens its sheet too
    s.eq('the name opens the sheet', [s.c.sheet().kind, b().title], ['pull.build', 'Edit KPI']);
    s.click('Max', ED);
    s.eq('one statistic still', b().statChips.filter((c) => c.on).map((c) => c.label), ['Max']);
    s.eq('the typed name moves with it', b().tgRows[0].name, 'Objectives badly behind');
    s.click('Cancel', ED);
    s.eq('cancel keeps the KPI', kpisOn('keyResult', KR2)[0].statistic, 'countAbove');
  });

  s.step('add two KPIs at once; Posted here and back keeps the typed name', () => {
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR2 });
    s.type('Name', 'Slowest objective', ED);
    s.click('Pulled from other work', ED);
    s.click('Posted here', ED);
    s.eq('back, the typed name kept', [s.c.sheet().kind, s.c.sheet().d.name, s.c.state.sheets.length], ['kpi.target', 'Slowest objective', 1]);
    s.click('Pulled from other work', ED);
    s.eq('the name carried over', b().tgRows[0].name, 'Slowest objective');
    measure('Days behind schedule');
    s.eq('a new measure resets the statistic and the name', [b().statChips.filter((c) => c.on).map((c) => c.label), b().tgRows[0].name], [['Count above'], LATE]);
    s.click('Max', ED);
    const o = objOracle(s.c.D, 'all', { q: '2026Q4', out: [OBJ] });   // the default scope: every division
    s.eq('two statistics', b().tiles.map((t) => t.label + ' ' + t.value), ['Max ' + o.max + ' days', 'Count above 10 days ' + o.over(10) + ' objective']);
    s.eq('max defaults: at most 0 days', [b().tgRows[0].label, b().tgRows[0].dir, b().tgRows[0].target, b().tgRows[0].unit], ['Max', 'down', '0', 'days']);
    s.eq('save label', [b().title, b().saveLabel], ['Add KPIs', 'Add 2 KPIs']);
    s.click('Add 2 KPIs', ED);
    s.ok(toasts().includes('2 KPIs added.'), '2 KPIs added.');
    const ks = kpisOn('keyResult', KR2);
    s.eq('three KPIs on KR2', ks.map((k) => k.name), ['Objectives badly behind', 'Highest days behind schedule', LATE]);
    s.eq('rows', ['Highest days behind schedule', LATE].map((n) => rowOf('keyResult', KR2, n).cur), [o.max + ' days', o.over(10) + ' objective']);
    s.clean('after adding two');
  });

  s.step('delete a pulled KPI', () => {
    s.click('Actions for Highest days behind schedule'); s.click('Delete KPI');
    s.click('Delete KPI', { within: 'Delete “Highest days behind schedule”?' });
    s.eq('gone', kpisOn('keyResult', KR2).map((k) => k.name), ['Objectives badly behind', LATE]);
    s.ok(toasts().includes('KPI deleted.'), 'KPI deleted.');
  });

  s.step('which work: leave one out by hand, all quarters, one division, a project, an owner', () => {
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR1 });
    s.click('Pulled from other work', ED);
    s.check('Leave out Root-cause AST degradation', false, ED);
    let o = objOracle(s.c.D, 'all', { q: '2026Q4', out: [OBJ, 'OBJ-FC-2026Q4-02'] });
    s.eq('recomputed without it', [b().tiles[0].value, b().handOut, b().listHead], [pc(o.avg), '1 item left out by hand', o.scores.length + ' objectives pulled']);
    s.check('Pull Root-cause AST degradation', true, ED);
    s.eq('back in', b().listHead, (o.scores.length + 1) + ' objectives pulled');
    s.type('Quarter', '', ED);
    o = objOracle(s.c.D, 'all', { out: [OBJ] });
    s.eq('all quarters: ' + o.scores.length + ' of ' + o.objs.length + ' objectives have a score', [b().tiles[0].value, b().listHead], [pc(o.avg), o.scores.length + ' objectives pulled']);
    s.eq('the unscored ones wait, with the reason', [].concat(...b().groups.map((g) => g.items)).filter((x) => x.text === 'No score yet').length, o.objs.length - o.scores.length);
    s.type('Quarter', '2026Q3', ED);
    o = objOracle(s.c.D, 'all', { q: '2026Q3', out: [OBJ] });
    s.eq('Q3 2026 only', [b().tiles[0].value, b().pulledLine], [pc(o.avg), '1 objective pulled from every division, Q3 2026.']);
    s.type('Quarter', 'current', ED);
    s.type('Division', 'DIV-FC', ED);
    o = objOracle(s.c.D, 'rd', { q: '2026Q4', div: 'DIV-FC' });
    s.eq('Fuel Cell this quarter', [b().tiles[0].value, b().listHead], [pc(o.avg), '3 objectives pulled']);
    s.eq('projects among those objectives', b().proj.opts.map((x) => x.v), ['', 'INIT-FC-01', 'INIT-FC-02']);
    s.type('Project', 'INIT-FC-02', ED);
    o = objOracle(s.c.D, 'rd', { q: '2026Q4', div: 'DIV-FC' });
    const fc2 = ['OBJ-FC-2026Q4-02', 'OBJ-FC-2026Q4-03'].map((id) => RD.objectiveScore(id, RD.withPortfolio(s.c.D.portfolio, docsOfKind(s.c.D, 'rd'))));
    s.eq('one project', b().tiles[0].value, pc((fc2[0] + fc2[1]) / 2));
    s.type('Project', '', ED);
    s.type('Owner', 'maya@celadyne.com', ED);
    s.type('Average, name', 'Average of Maya’s objectives', ED);
    s.eq('an owner’s objectives', [b().listHead, b().pulledLine], ['2 objectives pulled', '2 objectives pulled from Fuel Cell, the current quarter (Q4 2026), Maya Okafor’s objectives.']);
    s.click('Add KPI', ED);
    const k = kpisOn('keyResult', KR1).find((x) => x.pull.scope.owner);
    s.eq('its own name', k.name, 'Average of Maya’s objectives');
    s.eq('saved scope', [k.pull.scope.div, k.pull.scope.quarter, k.pull.scope.proj, k.pull.scope.owner], ['DIV-FC', 'current', '', 'maya@celadyne.com']);
    s.eq('what it pulls, in words', rowOf('keyResult', KR1, k.name).curTitle, 'Pulls each objective’s score: Fuel Cell, the current quarter (Q4 2026), Maya Okafor’s objectives. New matches join on their own.');
    s.click('Actions for ' + k.name); s.click('Delete KPI'); s.click('Delete KPI', { within: 'Delete “' + k.name + '”?' });
  });

  s.step('from Execution, any objective: Sales\' divisions, a unit, one division, every division', () => {
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR1 });
    s.click('Pulled from other work', ED);
    s.type('Quarter', '', ED);
    [['biz', 'every business division'], ['unit:UNIT-BUSINE', 'every division in the Business unit'], ['DIV-BD', 'Business Development'],
      ['unit:UNIT-TECHNI', 'every division in the Technical unit'], ['rd', 'every R&D division'], ['all', 'every division']].forEach(([v, words]) => {
      s.type('Division', v, ED);
      const o = objOracle(s.c.D, v, { out: [OBJ] });
      s.eq(words + ' (' + o.objs.map((x) => x.id).join(', ') + ')', [b().tiles[0].value, b().pulledLine], [pc(o.avg), pulledLine(o, words + ', all quarters')]);
    });
    s.type('Division', 'biz', ED);
    s.eq('Sales\' objectives, grouped by their division', b().groups.map((g) => [g.name, g.items.map((x) => x.name)]), [['Business Development', ['Close three utility pilot agreements', 'Build the Q1 hydrogen-hub pipeline']]]);
    s.type('Average, name', 'Average business objective score', ED);
    s.click('Add KPI', ED);
    const k = kpisOn('keyResult', KR1).find((x) => x.name === 'Average business objective score');
    const o = objOracle(s.c.D, 'biz', {});
    s.eq('saved, and read from Sales\' document', [k.pull.scope.div, rowOf('keyResult', KR1, k.name).cur], ['biz', pc(o.avg)]);
    s.eq('what it pulls, in words', rowOf('keyResult', KR1, k.name).curTitle, 'Pulls each objective’s score: every business division, all quarters. New matches join on their own.');
    s.click('Actions for ' + k.name); s.click('Delete KPI'); s.click('Delete KPI', { within: 'Delete “' + k.name + '”?' });
    s.clean('Sales\' objectives from Execution');
  });

  /* October 20, Corey: "clicking pull from other work yields a white window. No content shown". The live portfolio
     holds each objective's owner as one email; the sheet's Owner choice read every owner as a list and threw. */
  s.step('older records: an owner held as one email opens the sheet, is listed once and pulls by owner', () => {
    const restore = ownersAsStrings('OBJ-FC-2026Q4-03');
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR1 });
    s.click('Pulled from other work', ED);
    s.ok(!!b() && s.has('Which work', ED), 'the sheet opens');
    s.type('Quarter', '', ED);
    const vs = b().owner.opts.map((x) => x.v);
    s.eq('Maya listed once, whatever the case and spaces', [vs.filter((v) => v === 'maya@celadyne.com').length, b().owner.opts.find((x) => x.v === 'maya@celadyne.com').label], [1, 'Maya Okafor']);
    s.type('Owner', 'maya@celadyne.com', ED);
    const o = ownerOracle(s.c.D, 'maya@celadyne.com', [OBJ]);
    s.eq('her objectives (' + o.objs.map((x) => x.id).join(', ') + ')', [o.objs.length, b().tiles[0].value], [2, pc(o.avg)]);
    s.c.closeAllSheets(); s.render();
    restore();
    s.clean('owners held as one email');
  });

  s.step('a sheet that can\'t be built says why, with a way out (never a blank window)', () => {
    const api = s.ns.MODS.pull.api, keep = api._vm.buildVM, err0 = console.error;
    api._vm.buildVM = () => { throw new TypeError('probe failure'); };
    console.error = () => {};   // the module logs the failure; keep the probe's stack out of the run's output
    try {
      s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR1 });
      s.click('Pulled from other work', ED);
      s.ok(s.has('~This sheet couldn’t read the work to pull from (probe failure). Nothing was changed.', ED), 'it says what stopped it');
      s.eq('a title and a way out', [s.has('Add KPI', { within: 'Editor', tag: 'h2' }), s.has('Close', { within: 'Editor', tag: 'button' })], [true, true]);
      s.click('Close', { within: 'Editor', tag: 'button' });
      s.eq('closed', s.c.sheet(), null);
    } finally { api._vm.buildVM = keep; console.error = err0; s.c._vmErrors = []; s.render(); }
    s.clean('after a sheet that failed');
  });

  s.step('only the picked objectives: new work waits until it is ticked', () => {
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR1 });
    s.click('Pulled from other work', ED);
    s.type('Average, name', 'Average of the picked five', ED);
    s.type('Division', 'rd', ED);
    s.check('New work that matches joins on its own', false, ED);
    s.eq('picked list', [b().follow, b().handOut], [false, '5 picked; new matches wait until they are ticked']);
    s.click('Add KPI', ED);
    const k = kpisOn('keyResult', KR1).find((x) => x.name === 'Average of the picked five');
    s.eq('saved as a list', [k.pull.follow, k.pull.items.length, k.pull.exclude], [false, 5, []]);
    const v0 = rowOf('keyResult', KR1, k.name).cur;
    /* a new Q4 objective in Fuel Cell, with a scored key result */
    s.c.mutate((D) => {
      D.portfolio.objectives.push({ id: 'OBJ-FC-2026Q4-09', divisionId: 'DIV-FC', initiativeId: null, quarter: '2026Q4', statement: 'Late addition', owner: [ERIN], plannedStart: dayOf('2026-10-01'), plannedEnd: dayOf('2026-12-18'), order: 9 });
      D.docs['EXEC-DIV-FC'].keyResults.push({ id: 'KR-FC-2026Q4-09-1', objectiveId: 'OBJ-FC-2026Q4-09', statement: 'Half done', trackingType: 'percentage', progress: 50 });
    }, { quiet: true });
    s.render();
    s.eq('the picked KPI keeps its value', rowOf('keyResult', KR1, k.name).cur, v0);
    s.ok(pc(O().avg) !== v0, 'the newcomer moves the oracle (' + v0 + ' → ' + pc(O().avg) + ')');
    s.eq('the following one takes the new objective', rowOf('keyResult', KR1, AVG).cur, pc(O().avg));
    s.click('Readings for ' + k.name);
    s.ok(rowOf('keyResult', KR1, k.name).drawer.rows.some((x) => x.when === 'Late addition' && x.note === 'Not in the picked list'), 'the newcomer is listed, not pulled');
    s.click('Readings for ' + k.name);
    s.click('Actions for ' + k.name); s.click('Edit KPI');
    s.check('Pull Late addition', true, ED);
    s.click('Save', ED);
    s.eq('ticked, it counts', rowOf('keyResult', KR1, k.name).cur, pc(O().avg));
    s.click('Actions for ' + k.name); s.click('Delete KPI'); s.click('Delete KPI', { within: 'Delete “' + k.name + '”?' });
    s.c.mutate((D) => {
      D.portfolio.objectives = D.portfolio.objectives.filter((x) => x.id !== 'OBJ-FC-2026Q4-09');
      D.docs['EXEC-DIV-FC'].keyResults = D.docs['EXEC-DIV-FC'].keyResults.filter((x) => x.id !== 'KR-FC-2026Q4-09-1');
    }, { quiet: true });
    s.render();
  });

  s.step('validation: a target, a threshold, a picked list', () => {
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR2 });
    s.click('Pulled from other work', ED);
    measure('Days behind schedule');
    s.type('Count above 10 days, target', 'none', ED);
    s.click('Add KPI', ED);
    s.eq('target', s.c.sheet().err, 'Use a number for the count above 10 days target, like 80.');
    s.type('Count above 10 days, target', '0', ED);
    s.type('~Threshold', 'ten', ED);
    s.click('Add KPI', ED);
    s.eq('threshold', s.c.sheet().err, 'Use a number for the threshold, like 10.');
    s.type('~Threshold', '10', ED);
    s.check('New work that matches joins on its own', false, ED);
    [].concat(...b().groups.map((g) => g.items)).filter((x) => x.on).forEach((x) => s.check('Leave out ' + x.name, false, ED));
    s.click('Add KPI', ED);
    s.eq('a picked list needs one', s.c.sheet().err, 'Tick at least one item, or let new work join on its own.');
    s.click('Cancel', ED);
    s.eq('nothing added', kpisOn('keyResult', KR2).length, 2);
  });

  s.step('thresholds recount, share above, every statistic of a number', () => {
    const o = O();
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR2 });
    s.click('Pulled from other work', ED);
    measure('Days behind schedule');
    s.type('Division', 'rd', ED);
    [[17, 1], [18, 0], [0, 1], [-1, 5]].forEach(([t, n]) => {
      s.type('~Threshold', String(t), ED);
      s.eq('count above ' + t, [b().tiles[0].value, o.over(t)], [o.over(t) + (o.over(t) === 1 ? ' objective' : ' objectives'), n]);
    });
    s.type('~Threshold', '10', ED);
    s.click('Share above', ED);
    s.eq('share above too', b().tiles.map((t) => t.label + ' ' + t.value), ['Count above 10 days 1 objective', 'Share above 10 days ' + pc(100 * o.over(10) / 5)]);
    s.eq('no target by default', [b().tgRows[1].dir, b().tgRows[1].target, b().tiles[1].stWord], ['down', '', 'No target yet']);
    s.click('Share above', ED);
    s.click('Count above', ED);
    s.eq('the last statistic stays', b().tiles.length, 1);
    measure('Score');
    ['Min', 'Max', 'Total', 'Std deviation', 'CV', 'Range', 'Count below', 'Share below'].forEach((c) => s.click(c, ED));
    const xs = o.scores, n = xs.length, mean = xs.reduce((a, x) => a + x, 0) / n;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) * (x - mean), 0) / (n - 1));
    const want = { Average: pc(mean), Min: pc(Math.min.apply(null, xs)), Max: pc(Math.max.apply(null, xs)), Total: pc(xs.reduce((a, x) => a + x, 0)), 'Standard deviation': pc(sd), CV: pc(100 * sd / mean),
      Range: pc(Math.max.apply(null, xs) - Math.min.apply(null, xs)), 'Count below 80%': xs.filter((x) => x < 80).length + ' objectives', 'Share below 80%': pc(100 * xs.filter((x) => x < 80).length / n) };
    s.eq('every statistic of the scores', b().tiles.map((t) => [t.label, t.value]), Object.keys(want).map((k) => [k, want[k]]));
    s.eq('the engine’s own stddev agrees (sample)', r1(RD.computeStat('stddev', xs)), r1(sd));
    s.click('Cancel', ED);
  });

  s.step('the key result sheet lists pulled KPIs without rewriting them', () => {
    const before = JSON.stringify(kpisOn('keyResult', KR1));
    s.click('Actions for KR1'); s.click('Edit key result', { within: 'Actions for KR1' });
    const kk = s.vals.kr.sheet.kpis;
    s.eq('rows', kk.map((x) => [x.name, x.pulled, x.canToggle, x.canRemove, x.summary]), [[AVG, true, false, true, '≥ 80 %'], [MED, true, false, true, '≥ 80 %']]);
    s.ok(s.has('Pulled', { tag: 'span', within: 'Editor' }), 'tagged Pulled');
    s.ok(!s.has('Edit ' + AVG, ED), 'no Edit for a pulled row');
    s.click('Save key result', ED);
    s.eq('saved untouched', JSON.stringify(kpisOn('keyResult', KR1)), before);
  });

  s.step('duplicating a key result: the CTO copies its pulled KPIs, an engineer does not', () => {
    s.click('Actions for KR2'); s.click('Duplicate');
    const copy = s.c.D.docs['EXEC-DIV-CTO'].keyResults[2];
    const ks = kpisOn('keyResult', copy.id);
    s.eq('copied, pulled', ks.map((k) => [k.name, !!k.pull, k.pull.by]), [['Objectives badly behind', true, COREY], [LATE, true, COREY]]);
    s.c.closeAllSheets(); s.render();
    signIn(PRIYA);
    pickDiv('CTO office'); pickObj('Technical excellence'); tab('Key results');
    s.click('Actions for KR2'); s.click('Duplicate');
    const copy2 = s.c.D.docs['EXEC-DIV-CTO'].keyResults[3];
    s.eq('Priya’s copy has no pulled KPIs', kpisOn('keyResult', copy2.id).length, 0);
    s.ok(toasts().includes('Key result duplicated. Its 2 pulled KPIs stay with the original: leads, the CTO and the CEO add those.'), 'and says why');
    s.c.closeAllSheets(); s.render();
  });

  s.step('an engineer sees the values and what they pulled, and changes nothing', () => {
    tab('Key results');
    openKR(KR1, 'KR1 Average objective score above 80%'); openKR(KR2, 'KR2 Maintain on-time completion');
    const m = () => rowOf('keyResult', KR1, MED);
    s.eq('no menus, names are not buttons', [m().hasMenu, m().nameBtn, s.has('Actions for ' + MED)], [false, false, false]);
    s.click('Readings for ' + MED);
    s.eq('who sets it', m().drawer.roNote, 'Nobody posts readings here. Corey Staller (CTO) and Dana Whitcomb (CEO) set what it pulls.');
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR1 });
    s.ok(s.c.sheet().kind === 'kpi.target' && !s.has('Pulled from other work', ED), 'Add KPI has no pulled option');
    s.c.closeAllSheets(); s.render();
    s.ns.MODS.kpi.api.openEdit(s.c, s.c.ctx, kpisOn('keyResult', KR1)[0].id);   // what other modules call to edit a KPI
    s.render();
    s.ok(!s.c.sheet() && toasts().includes('Only Corey Staller (CTO) and Dana Whitcomb (CEO) change a pulled KPI.'), 'Edit KPI by any route says who changes it');
    s.click('Actions for KR1'); s.click('Edit key result', { within: 'Actions for KR1' });
    s.eq('the key result sheet: no remove for a pulled KPI', s.vals.kr.sheet.kpis.map((x) => x.canRemove), [false, false]);
    s.c.closeAllSheets(); s.render();
    s.clean('engineer');
  });

  s.step('leads: in the divisions they lead (by division, unit or the Hub’s name), the CTO and the CEO anywhere', () => {
    const hasPulled = (krKey) => { s.click('Add KPI', { within: 'kpi-t:keyResult:' + krKey }); const v = s.has('Pulled from other work', ED); s.c.closeAllSheets(); s.render(); return v; };
    const at = (div, obj, kr, label) => { pickDiv(div); pickObj(obj); tab('Key results'); openKR(kr, label); return hasPulled(kr); };
    signIn(TORU);
    s.eq('Toru (lead, Electrolyzer)', [at('Electrolyzer', 'Qualify the 10-cell', 'KR-EL-2026Q4-01-1', 'KR1 Demonstrate'), at('Fuel Cell', 'Run full roll-to-roll', 'KR-FC-2026Q4-01-1', 'KR1 '), at('CTO office', 'Technical excellence', KR1, 'KR1 Average')], [true, false, false]);
    s.eq('no menu on the CTO’s pulled KPI', rowOf('keyResult', KR1, MED).hasMenu, false);
    signIn(ERIN);
    s.eq('Erin (lead, Fuel Cell)', [at('Electrolyzer', 'Qualify the 10-cell', 'KR-EL-2026Q4-01-1', 'KR1 Demonstrate'), at('Fuel Cell', 'Run full roll-to-roll', 'KR-FC-2026Q4-01-1', 'KR1 ')], [false, true]);
    s.c.mutate((D) => { const u = D.roster.users.find((x) => x.email === ERIN); u.leadDivisions = []; u.leadOf = ['electrolyzer']; }, { quiet: true, allowRo: true });
    s.eq('Erin with the Hub’s legacy name for Electrolyzer', [at('Electrolyzer', 'Qualify the 10-cell', 'KR-EL-2026Q4-01-1', 'KR1 Demonstrate'), at('Fuel Cell', 'Run full roll-to-roll', 'KR-FC-2026Q4-01-1', 'KR1 ')], [true, false]);
    s.c.mutate((D) => { const u = D.roster.users.find((x) => x.email === ERIN); u.leadOf = []; u.leadUnits = ['UNIT-TECHNI']; }, { quiet: true, allowRo: true });
    s.eq('Erin leading the Technical unit', [at('Electrolyzer', 'Qualify the 10-cell', 'KR-EL-2026Q4-01-1', 'KR1 Demonstrate'), at('Fuel Cell', 'Run full roll-to-roll', 'KR-FC-2026Q4-01-1', 'KR1 ')], [true, true]);
    signIn(DANA);
    s.eq('Dana (CEO)', [at('Fuel Cell', 'Run full roll-to-roll', 'KR-FC-2026Q4-01-1', 'KR1 '), at('CTO office', 'Technical excellence', KR1, 'KR1 Average')], [true, true]);
    s.eq('Dana gets the menu', rowOf('keyResult', KR1, MED).menu.map((x) => x.label), ['Edit KPI', 'Delete KPI']);
    signIn(COREY);
  });

  s.step('a lead’s gate target pulled from the kanban; at 100 the gate passes', () => {
    signIn(TORU);
    pickDiv('Electrolyzer'); pickObj('Lock Tera'); tab('Stage-gates');
    const G = 'SG-EL-2026Q4-02-3';
    openGate(G);
    const t = tileOracle(s.c.D, 'EXEC-DIV-EL', 'BRD-EL-LOCK');
    s.eq('oracle: six tiles placed, two released, one parked', [t.placed.length, t.fin.length, t.brd.tiles.length - t.placed.length], [6, 2, 1]);
    s.click('Add a target', { within: 'gate-' + G });
    s.click('Pulled from other work', ED);
    s.eq('a gate starts on its kanban tiles, finished', [b().title, b().sub, b().eachSel.v, b().measures.filter((m) => m.on).map((m) => m.label), b().div.v, b().hasNarrow, b().narrowLabel],
      ['Add target', 'Stage-gate “Design freeze sign-off”', 'tile', ['Finished'], 'DIV-EL', true, 'Board']);
    s.eq('boards to narrow to', b().narrow.opts.map((x) => x.v), ['', 'BRD-EL-LOCK']);
    s.type('Board', 'BRD-EL-LOCK', ED);
    s.type('Share finished, name', 'Component lock tiles released', ED);
    s.eq('preview', [b().tiles[0].label, b().tiles[0].value, b().tiles[0].target, b().listHead], ['Share finished', pc(100 * t.fin.length / t.placed.length), '≥ 100%', '6 tiles pulled, 2 counted']);
    s.ok([].concat(...b().groups.map((g) => g.items)).some((x) => x.name === 'Stack tie rods' && x.text === 'Parked, no stage clock'), 'the parked tile waits');
    s.click('Add target', ED);
    s.ok(toasts().includes('Target added.'), 'Target added.');
    const k = kpisOn('stageGate', G)[0];
    s.eq('saved', [k.name, k.statistic, k.target, k.direction, k.unit, k.pull.each, k.pull.measure, k.pull.states, k.pull.scope.div, k.pull.scope.narrow, k.pull.by],
      ['Component lock tiles released', 'share', 100, 'up', '%', 'tile', 'finished', ['finished'], 'DIV-EL', 'BRD-EL-LOCK', TORU]);
    const r = rowOf('stageGate', G, k.name);
    s.eq('row', [r.cur, r.sub, r.crit, r.badges.map((x) => x.label)], [pc(100 * t.fin.length / t.placed.length), '2 of 6 tiles finished', '≥ 100%', ['Pulled']]);
    s.click('Actions for ' + k.name);
    s.eq('gate menu', r.menu.map((x) => x.label), ['Edit target', 'Delete target']);
    s.click('Actions for ' + k.name);
    s.eq('readiness from it', Math.round(engineScore('stageGateScore', G)), Math.round(100 * t.fin.length / t.placed.length));
    /* the components release one by one; the last one takes the gate to 100, and it passes */
    const order = t.placed.filter((x) => x.col !== t.last).map((x) => x.id);
    order.forEach((id, i) => {
      s.c.mutate((D) => { const tl = D.docs['EXEC-DIV-EL'].boards.find((x) => x.id === 'BRD-EL-LOCK').tiles.find((x) => x.id === id); tl.col = t.last; tl.enteredCol = '2026-10-13'; });
      s.render();
      const g = s.c.D.docs['EXEC-DIV-EL'].stageGates.find((x) => x.id === G);
      if (i < order.length - 1) s.ok(g.actualDate == null, 'not passed at ' + (3 + i) + ' of 6');
    });
    const g = s.c.D.docs['EXEC-DIV-EL'].stageGates.find((x) => x.id === G);
    s.eq('passed today, on its own', [g.actualDate, g.completionMethod], [TD, 'auto']);
    s.ok(toasts().some((x) => /Design freeze sign-off passed: every target is met\./.test(x)), 'the gate says so');
    s.eq('the row reads 100%', rowOf('stageGate', G, k.name).cur, '100%');
    signIn(COREY);
  });

  s.step('the Overview: notes say what each KPI pulled, the same dropdown', () => {
    pickDiv('CTO office'); pickObj('Technical excellence'); tab('Overview');
    if (s.has('Expand all', { within: 'review' })) s.click('Expand all', { within: 'review' });
    const items = s.ns.MODS.review.api.items(s.c, s.c.ctx);
    const kr1 = items.find((x) => x.id === KR1), kr2 = items.find((x) => x.id === KR2);
    s.eq('KR1 note', kr1.row.note, '0 of 2 KPIs on target. Each is pulled from other work.');
    s.eq('KR2 note (both its KPIs still count the 18-day objective)', kr2.row.note, '0 of 2 KPIs on target. Each is pulled from other work.');
    const rows = () => [].concat(...s.vals.review.groups.map((g) => g.rows || []));
    const med = () => rows().find((r) => r.name === MED);
    s.eq('median row', [med().note, med().vTitle, /\bpull-dd\b/.test(med().vCls)], ['Pulled: median of 5 objective scores.', 'Show readings', true]);
    s.click('Readings for ' + MED, { within: 'review' });
    s.ok(!!med().drawer && med().drawer.rows.some((x) => /middle value/.test(x.note)), 'its drawer there, the median marked');
    s.click('Readings for ' + AVG, { within: 'review' });
    s.ok(!!rows().find((r) => r.name === AVG).drawer && !med().drawer, 'one drawer at a time');
    s.clean('overview');
  });

  s.step('read-only: values and what they pulled, no menus, no pulled option', () => {
    s.c.setState({ ro: true }); s.render();
    tab('Key results');
    openKR(KR1, 'KR1 Average objective score above 80%');
    const m = rowOf('keyResult', KR1, MED);
    s.eq('no menu, no name button, still a dropdown', [m.hasMenu, m.nameBtn, m.valBtn], [false, false, true]);
    s.click('Readings for ' + MED);
    s.ok(!!rowOf('keyResult', KR1, MED).drawer, 'opens');
    s.c.setState({ ro: false }); s.render();
  });

  s.step('objectives built from objectives (P-6): an Electrolyzer KPI pulls the CTO office back; nothing loops', () => {
    pickDiv('Electrolyzer'); pickObj('Qualify the 10-cell'); tab('Key results');
    openKR('KR-EL-2026Q4-01-1', 'KR1 Demonstrate');
    s.click('Add KPI', { within: 'kpi-t:keyResult:KR-EL-2026Q4-01-1' });
    s.click('Pulled from other work', ED);
    s.click('Add KPI', ED);
    const k = kpisOn('keyResult', 'KR-EL-2026Q4-01-1').find((x) => x.pull);
    const v1 = rowOf('keyResult', 'KR-EL-2026Q4-01-1', k.name).cur;
    s.ok(/%$/.test(v1), 'a value: ' + v1);
    s.render();
    s.eq('stable across renders', rowOf('keyResult', 'KR-EL-2026Q4-01-1', k.name).cur, v1);
    const sObj = engineScore('objectiveScore', OBJ), eObj = engineScore('objectiveScore', 'OBJ-EL-2026Q4-01');
    s.ok(isFinite(sObj) && isFinite(eObj), 'both objectives score: ' + r1(sObj) + ', ' + r1(eObj));
    pickDiv('CTO office'); pickObj('Technical excellence'); tab('Key results'); openKR(KR1, 'KR1 Average');
    s.ok(/%$/.test(rowOf('keyResult', KR1, AVG).cur), 'the CTO average still reads');
    s.clean('loop');
  });

  s.step('every measure of every kind of work, every statistic: the sheet and the engine stay clean', () => {
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KR1 });
    s.click('Pulled from other work', ED);
    s.type('Quarter', '', ED);
    const kinds = b().eachSel.opts.map((x) => x.v);
    s.eq('every kind of work', kinds, ['objective', 'keyResult', 'gate', 'workstream', 'tile', 'experiment', 'tree']);
    let n = 0;
    kinds.forEach((each) => {
      s.type('Pull each', each, ED);
      b().measures.map((m) => m.label).forEach((label, mi) => {
        s.click('~' + b().measures[mi].desc, { tag: 'button', within: 'Read its' });
        b().statChips.filter((c) => !c.on).forEach((c) => s.click(c.label, ED));
        s.ok(b().tiles.length === b().statChips.length, each + ' / ' + label + ': a tile per statistic');
        s.ok(b().tiles.every((t) => t.value === '—' || /\d/.test(t.value)), each + ' / ' + label + ': values ' + b().tiles.map((t) => t.value).join(' '));
        if (b().showWindow) ['d7', 'd90', 'quarter', 'd30'].forEach((w) => s.type('Window', w, ED));
        n++;
      });
    });
    s.ok(n >= 20, n + ' measures walked');
    s.clean('every measure');
    s.click('Cancel', ED);
  });
}

/* ============================================================================================ Sales */
if (SALES) {
  const OBJ = 'OBJ-BD-2026Q4-01', KRP = 'KR-BD-2026Q4-01-2', G = 'SG-BD-2026Q4-01-2';
  const BIZ = 'BIZ-DIV-BD';
  s.step('Sam (lead, Business Development) adds a count of pipeline tiles closed in the last 30 days', () => {
    signIn(SAM);
    pickDiv('Business Development'); pickObj('Close three utility pilot'); tab('Key results');
    openKR(KRP, 'KR2 Grow qualified pipeline');
    const t = tileOracle(s.c.D, BIZ, 'BRD-BD-PIPE');
    s.eq('oracle: 16 placed, 8 closed, 6 of them in the last 30 days', [t.placed.length, t.fin.length, t.finIn(30).length], [16, 8, 6]);
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KRP });
    s.click('Pulled from other work', ED);
    s.eq('a lead starts on his own division, and may pick any', [b().div.v, b().div.opts.map((x) => x.label), b().div.groups.map((g) => [g.label, g.opts.map((x) => x.v)])],
      ['DIV-BD', ['Every division', 'Every R&D division', 'Every business division'], [['Units', ['unit:UNIT-TECHNI', 'unit:UNIT-BUSINE']], ['Divisions', ['DIV-FC', 'DIV-EL', 'DIV-BD', 'DIV-PT']]]]);
    s.type('Pull each', 'tile', ED);
    measure('Finished in a window');
    s.eq('a count in the last 30 days', [b().showWindow, b().win.v, b().quarter.v, b().tiles[0].label, b().tiles[0].value], [true, 'd30', '', 'Count', '6 tiles']);
    s.eq('the sentence', b().tiles[0].sentence, '6 tiles finished in the last 30 days');
    s.click('Per week', ED);
    s.eq('per week too', b().tiles[1].value, r1(6 / (30 / 7)) + ' a week');
    s.click('Per week', ED);
    s.type('Count, target', '5', ED);
    s.type('Window', 'd7', ED);
    s.eq('last 7 days', b().tiles[0].value, t.finIn(7).length + ' tile' + (t.finIn(7).length === 1 ? '' : 's'));
    s.type('Window', 'd30', ED);
    s.click('Add KPI', ED);
    const k = kpisOn('keyResult', KRP).find((x) => x.pull);
    s.eq('saved', [k.name, k.statistic, k.target, k.direction, k.unit, k.pull.each, k.pull.measure, k.pull.window, k.pull.scope.div, k.pull.scope.quarter, k.pull.by],
      ['Tiles finished in the last 30 days', 'count', 5, 'up', 'tiles', 'tile', 'finishedIn', 'd30', 'DIV-BD', '', SAM]);
    const r = rowOf('keyResult', KRP, k.name);
    s.eq('row', [r.cur, r.sub, r.crit, r.score, r.stWord], ['6 tiles', '6 tiles finished in the last 30 days', '≥ 5 tiles', '100', 'Met']);
    s.click('Readings for ' + k.name);
    const d = rowOf('keyResult', KRP, k.name).drawer;
    s.eq('the drawer lists them, older ones waiting', [d.cnt, d.rows.filter((x) => !/\bout\b/.test(x.cls)).length, d.rows.some((x) => /before the window/.test(x.note))], ['6 tiles pulled, ' + (t.brd.tiles.length - 6) + ' waiting or left out', 6, true]);
    s.eq('the six, in board order', d.rows.slice(0, 6).map((x) => x.when), t.finIn(30).map((x) => x.name));
    s.eq('each reading is the day it finished', d.rows.slice(0, 6).map((x) => x.v).every((v) => /^[A-Z][a-z]{2} \d{1,2}$/.test(v)), true);
    s.clean('sales KPI');
  });

  s.step('the dropdown, the lead’s menu, an edit, the key result sheet', () => {
    const k = () => kpisOn('keyResult', KRP).find((x) => x.pull);
    const r = () => rowOf('keyResult', KRP, k().name);
    s.click('Readings for ' + k().name);
    s.eq('closed', [r().valExpanded, !!r().drawer, r().valTitle, /\bpull-dd\b/.test(r().curCls)], ['false', false, 'Show readings', true]);
    s.click('Actions for ' + k().name);
    s.eq('menu', r().menu.map((x) => x.label), ['Edit KPI', 'Delete KPI']);
    s.click('Edit KPI');
    s.eq('its sheet, as saved', [b().title, b().eachSel.v, b().measures.filter((m) => m.on).map((m) => m.label), b().win.v, b().tgRows[0].name, b().tgRows[0].target], ['Edit KPI', 'tile', ['Finished in a window'], 'd30', 'Tiles finished in the last 30 days', '5']);
    s.type('Window', 'd7', ED);
    const t = tileOracle(s.c.D, BIZ, 'BRD-BD-PIPE');
    s.eq('the suggested name follows the window', [b().tgRows[0].name, b().tiles[0].value], ['Tiles finished in the last 7 days', t.finIn(7).length + (t.finIn(7).length === 1 ? ' tile' : ' tiles')]);
    s.click('Save', ED);
    s.eq('saved', [k().name, k().pull.window, r().cur], ['Tiles finished in the last 7 days', 'd7', t.finIn(7).length + (t.finIn(7).length === 1 ? ' tile' : ' tiles')]);
    s.click('Actions for KR2'); s.click('Edit key result', { within: 'Actions for KR2' });
    const kk = s.vals.kr.sheet.kpis.find((x) => x.pulled);
    s.eq('the key result sheet lists it, tagged and not editable', [kk.name, kk.canToggle, kk.canRemove], ['Tiles finished in the last 7 days', false, true]);
    const before = JSON.stringify(k());
    s.click('Save key result', ED);
    s.eq('saving the key result leaves it as it was', JSON.stringify(k()), before);
  });

  s.step('an engineer and another division’s reader: values and what they pulled', () => {
    signIn(PRIYA);
    pickDiv('Business Development'); pickObj('Close three utility pilot'); tab('Key results');
    openKR(KRP, 'KR2 Grow qualified pipeline');
    const k = kpisOn('keyResult', KRP).find((x) => x.pull);
    const r = () => rowOf('keyResult', KRP, k.name);
    s.eq('no menu, the name is not a button', [r().hasMenu, r().nameBtn], [false, false]);
    s.click('Readings for ' + k.name);
    s.eq('who sets it', r().drawer.roNote, 'Nobody posts readings here. Sam Rivera (lead), Corey Staller (CTO) and Dana Whitcomb (CEO) set what it pulls.');
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KRP });
    s.ok(!s.has('Pulled from other work', ED), 'no pulled option');
    s.c.closeAllSheets(); s.render();
    signIn(SAM);
    pickDiv('Business Development'); pickObj('Close three utility pilot'); tab('Key results');
    openKR(KRP, 'KR2 Grow qualified pipeline');
    s.clean('engineer');
  });

  s.step('a pulled gate target beside a posted one: readiness is their mean', () => {
    tab('Stage-gates'); openGate(G);
    const t = tileOracle(s.c.D, BIZ, 'BRD-BD-PIPE');
    const docs = docsOfKind(s.c.D, 'biz');
    const so = RD.stageGateScore(G, RD.withPortfolio(s.c.D.portfolio, docs));   // its one posted target, read plainly
    s.ok(so != null && so < 100, 'the posted target alone: ' + r1(so));
    s.click('Add target', { within: 'kpi-t:gate:' + G });
    s.click('Pulled from other work', ED);
    s.type('Board', 'BRD-BD-PIPE', ED);
    s.click('Add target', ED);
    const k = kpisOn('stageGate', G).find((x) => x.pull);
    s.eq('row', rowOf('stageGate', G, k.name).cur, pc(100 * t.fin.length / t.placed.length));
    s.ok(Math.abs(engineScore('stageGateScore', G) - (so + 100 * t.fin.length / t.placed.length) / 2) < 1e-6, 'readiness = the mean of the posted target (' + r1(so) + ') and the pulled one');
    s.eq('not passed: the posted target is short', s.c.D.docs[BIZ].stageGates.find((x) => x.id === G).actualDate, null);
  });

  s.step('Sales reaches Execution\'s objectives: every division by default, or every R&D division', () => {
    /* October 19, Corey: "KPIs adding in the sales app cannot see objectives in the execution app. I need to be
       able to reference any objective, regardless of division or business unit." */
    signIn(COREY);
    pickDiv('Business Development'); pickObj('Close three utility pilot'); tab('Key results');
    openKR(KRP, 'KR2 Grow qualified pipeline');
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KRP });
    s.click('Pulled from other work', ED);
    s.eq('the CTO starts on every division', b().div.v, 'all');
    s.type('Quarter', '', ED);
    let o = objOracle(s.c.D, 'all', { out: [OBJ] });
    s.ok(o.objs.some((x) => x.divisionId === 'DIV-FC') && o.objs.some((x) => x.divisionId === 'DIV-EL'), 'oracle: R&D objectives among them');
    s.eq('every division\'s objectives', [b().tiles[0].value, b().pulledLine], [pc(o.avg), pulledLine(o, 'every division, all quarters')]);
    s.eq('listed by division, R&D first (the units\' order)', b().groups.map((g) => g.name), ['Fuel Cell', 'Electrolyzer', 'Business Development']);
    s.type('Division', 'rd', ED);
    s.type('Quarter', 'current', ED);
    o = objOracle(s.c.D, 'rd', { q: '2026Q4' });
    s.eq('every R&D division this quarter', [b().tiles[0].value, b().listHead], [pc(o.avg), o.scores.length + ' objectives pulled']);
    s.type('Average, name', 'Average R&D objective score', ED);
    s.click('Add KPI', ED);
    const k = kpisOn('keyResult', KRP).find((x) => x.name === 'Average R&D objective score');
    s.eq('saved on Sales\' document', [k.pull.scope.div, k.pull.scope.quarter, !!s.c.D.docs[BIZ].kpis.find((x) => x.id === k.id)], ['rd', 'current', true]);
    const r = rowOf('keyResult', KRP, k.name);
    s.eq('the row reads Execution\'s objectives', [r.cur, r.sub], [pc(o.avg), 'Average of ' + o.scores.length + ' objective scores']);
    s.click('Readings for ' + k.name);
    s.eq('its readings name R&D\'s objectives', rowOf('keyResult', KRP, k.name).drawer.rows.filter((x) => !/\bout\b/.test(x.cls)).map((x) => x.by).filter((v, i, a) => a.indexOf(v) === i), ['Fuel Cell', 'Electrolyzer']);
    const rs = rowsOf('keyResult', KRP).map((x) => (x._s == null ? 0 : x._s));
    s.ok(rs.length === 3 && Math.abs(engineScore('keyResultScore', KRP) - rs.reduce((a, x) => a + x, 0) / rs.length) < 1e-9, 'the key result\'s score takes it: the mean of its ' + rs.length + ' KPIs');
    s.clean('Execution\'s objectives from Sales');
  });

  s.step('older records: owners held as one email, from Sales: the sheet opens on every division', () => {
    signIn(COREY);
    const restore = ownersAsStrings('OBJ-FC-2026Q4-02');
    pickDiv('Business Development'); pickObj('Close three utility pilot'); tab('Key results');
    openKR(KRP, 'KR2 Grow qualified pipeline');
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KRP });
    s.click('Pulled from other work', ED);
    s.ok(!!b() && s.has('Which work', ED) && b().div.v === 'all', 'the sheet opens, on every division');
    s.type('Quarter', '', ED);
    s.ok(b().owner.opts.some((x) => x.v === 'maya@celadyne.com'), 'Execution\'s owners are listed');
    s.type('Owner', 'maya@celadyne.com', ED);
    const o = ownerOracle(s.c.D, 'maya@celadyne.com', [OBJ]);
    s.eq('Maya\'s objectives in Execution (' + o.objs.map((x) => x.id).join(', ') + ')', [o.objs.length, b().tiles[0].value], [2, pc(o.avg)]);
    s.c.closeAllSheets(); s.render();
    restore();
    s.clean('owners held as one email, from Sales');
  });

  s.step('Sam in All divisions: still a lead of his division’s work', () => {
    signIn(SAM);
    s.click('Choose a business division'); s.click('All divisions', { within: 'Divisions' });
    pickObj('Close three utility pilot'); tab('Key results');
    openKR(KRP, 'KR2 Grow qualified pipeline');
    const k = kpisOn('keyResult', KRP).find((x) => x.pull && x.pull.each === 'tile');
    s.eq('his menu', rowOf('keyResult', KRP, k.name).menu.map((x) => x.label), ['Edit KPI', 'Delete KPI']);
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KRP });
    s.ok(s.has('Pulled from other work', ED), 'and the pulled option');
    s.c.closeAllSheets(); s.render();
    signIn(PRIYA);
    s.eq('an engineer: no menu', rowOf('keyResult', KRP, k.name).hasMenu, false);
    s.clean('all divisions');
  });

  s.step('the Overview note', () => {
    signIn(COREY);
    pickDiv('Business Development'); pickObj('Close three utility pilot'); tab('Overview');
    const items = s.ns.MODS.review.api.items(s.c, s.c.ctx);
    const kr = items.find((x) => x.id === KRP);
    s.ok(/^\d of 3 KPIs on target\./.test(kr.row.note), 'note: ' + kr.row.note);
    s.clean('overview');
  });

  s.step('every measure of every kind of work: the sheet and the engine stay clean', () => {
    tab('Key results'); openKR(KRP, 'KR2 Grow qualified pipeline');
    s.click('Add KPI', { within: 'kpi-t:keyResult:' + KRP });
    s.click('Pulled from other work', ED);
    s.type('Quarter', '', ED);
    let n = 0;
    b().eachSel.opts.map((x) => x.v).forEach((each) => {
      s.type('Pull each', each, ED);
      b().measures.forEach((m, mi) => {
        s.click('~' + b().measures[mi].desc, { tag: 'button', within: 'Read its' });
        b().statChips.filter((c) => !c.on).forEach((c) => s.click(c.label, ED));
        s.ok(b().tiles.length === b().statChips.length && b().tiles.every((t) => t.value === '—' || /\d/.test(t.value)), each + ' / ' + m.label + ': ' + b().tiles.map((t) => t.value).join(' '));
        n++;
      });
    });
    s.ok(n >= 20, n + ' measures walked');
    s.clean('every measure');
    s.click('Cancel', ED);
  });
}

done();
