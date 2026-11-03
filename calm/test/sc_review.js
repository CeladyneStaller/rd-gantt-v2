/* Scenario test for the Overview's review table (mods/review), on both boards.
     node test/sc_review.js out/Main.dc.html
     node test/sc_review.js out/Sales-A.dc.html
   1. Every status, for every objective of every division of the app, against an independent reading of the
      footnote's rules over the engine (rdcore.js, loaded separately).
   2. Clicks like a person: chips, Needs attention, the per-section bars, the filter box, grouping by type
      (stage-gates under their workstreams, kanban tiles under their swimlanes), status and due date,
      expanding rows, groups and headings, Expand all, and the links into the other tabs (which open,
      highlight and focus the item, then let the highlight go).
   3. The table follows the data: a gate passed, a tile moved, a reading posted, a cause resolved, an objective
      ended. Read-only keeps every view. */
const { Sim, done, textOf } = require('./dc');
const RD = require(require('./engine_path'));

const file = process.argv[2] || 'out/Main.dc.html';

/* ---- record which handler sites (event@template line) the scenarios fire ---- */
const fired = new Set();
const origFire = Sim.prototype.fire;
Sim.prototype.fire = function (el, name, extra) { fired.add(name.toLowerCase() + '@' + el.line); return origFire.call(this, el, name, extra); };
const origType = Sim.prototype.type;
Sim.prototype.type = function (q, v, opts) {
  const el = this.all(q, opts).filter((e) => e.on.onChange || e.on.onInput)[(opts && opts.nth) || 0];
  if (el) fired.add((el.on.onChange ? 'onchange' : 'oninput') + '@' + el.line);
  return origType.call(this, q, v, opts);
};

let s = new Sim(file);
const SALES = s.c.APP === 'sales';
const TD = s.c.D.today;
const TISO = new Date(Date.UTC(2020, 0, 1) + TD * 86400000).toISOString().slice(0, 10);
const DEF_DIV = SALES ? 'DIV-BD' : 'DIV-EL';
const DEF_OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01';
const LOCK = 'OBJ-EL-2026Q4-02';

const fresh = () => { s = new Sim(file); return s; };
const nav = (patch) => { s.c.setState(Object.assign({ menu: '', sheets: [] }, patch)); return s.render(); };
const api = () => s.ns.MODS.review.api;
const items = () => api().items(s.c, s.c.ctx);
const V = () => s.vals.review;
const group = (label) => V().groups.find((g) => g.label === label);
const shown = () => V().groups.reduce((a, g) => a.concat(g.open ? g.rows : []), []).filter((r) => r.isRow && /is-item/.test(r.cls));
const shownNames = () => shown().map((r) => (r.tid ? r.tid + ' ' : '') + r.name);
const kidsShown = () => V().groups.reduce((a, g) => a.concat(g.open ? g.rows : []), []).filter((r) => r.isRow && /is-kid/.test(r.cls));
/* the workstream / swimlane headings of a section, and the item names under each */
const heads = (label) => { const g = group(label); return g ? g.rows.filter((r) => r.isSub) : []; };
const headText = (h) => h.subLabel + (h.subName ? ': ' + h.subName : '') + ' ' + h.subCount;
const under = (label) => {
  const out = {};
  let cur = null;
  (group(label) || { rows: [] }).rows.forEach((r) => { if (r.isSub) { cur = r.subLabel; out[cur] = []; } else if (r.isRow && /is-item/.test(r.cls) && cur) out[cur].push((r.tid ? r.tid + ' ' : '') + r.name); });
  return out;
};
const link = (txt) => (el) => el.tag === 'button' && /\breview-link\b/.test(el.attrs.class || '') && textOf(el).indexOf(txt) >= 0;
const chip = (label) => (el) => el.tag === 'button' && /\breview-chip\b/.test(el.attrs.class || '') && textOf(el).indexOf(label) === 0;
const seg = (title) => (el) => el.tag === 'button' && /\breview-seg\b/.test(el.attrs.class || '') && el.attrs.title === title;
const byStatus = (list) => { const c = { off: 0, risk: 0, ok: 0, none: 0, done: 0, cancelled: 0 }; list.forEach((x) => { c[x[2]] += x[3]; }); return c; };
const toasts = () => (s.c.state.toasts || []).map((t) => t.text);

/* ---------------------------------------------------------------- the rules, read independently */
const BAND = { 'on-track': 'ok', 'at-risk': 'risk', 'off-track': 'off' };
function byDue(list) {
  return list.slice().sort((a, b) => {
    const pa = a.plannedDate == null ? Infinity : a.plannedDate, pb = b.plannedDate == null ? Infinity : b.plannedDate;
    return (pa - pb) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id));
  });
}
function oracle(D, divId, docKey, objId) {
  const doc = D.docs[docKey], P = D.portfolio;
  const em = RD.withPortfolio(P, { [divId]: doc });
  const ended = !!RD.objectiveEndState(doc.objectiveState, objId);
  const out = [];
  (doc.keyResults || []).filter((k) => k.objectiveId === objId).forEach((k) => {
    const v = RD.keyResultScore(k.id, em);
    out.push(['kr', k.id, v == null ? 'none' : BAND[RD.band(v)], 1]);
  });
  const passed = (gid) => { const g = (doc.stageGates || []).find((x) => x.id === gid); if (!g) return false; const c = RD.classifyGate(g, TD); return c === 'passed' || c === 'passed-late'; };
  const gates = byDue((doc.stageGates || []).filter((g) => g.objectiveId === objId));
  const current = {};
  (doc.stageGateSets || []).filter((x) => x.objectiveId === objId && x.chained !== false).forEach((st) => {
    const f = gates.find((g) => g.setId === st.id && g.actualDate == null);
    if (f) current[f.id] = true;
  });
  const high = {};
  RD.fmeaProblemsFor(doc, objId).forEach((p) => { if (p.gateId && RD.rpnBand(RD.worstUnresolvedRpn(p, passed(p.gateId))) === 'high' && RD.worstUnresolvedRpn(p, passed(p.gateId)) > 0) high[p.gateId] = true; });
  gates.forEach((g) => {
    let st;
    if (g.actualDate != null) st = 'done';
    else if (ended) st = 'cancelled';
    else if (g.plannedDate != null && g.plannedDate < TD) st = 'off';
    else if (g.status === 'missed') st = 'off';
    else if (high[g.id]) st = 'risk';
    else if (current[g.id] || g.status === 'active') st = 'ok';
    else st = 'none';
    out.push(['gate', g.id, st, 1]);
  });
  (doc.boards || []).filter((b) => b.objectiveId === objId).forEach((b) => {
    const cols = b.columns || [];
    if (!cols.length) return;
    const last = cols[cols.length - 1].id;
    const lanes = {};
    (b.swimlanes || []).forEach((l) => { lanes[l.id] = l; });
    const fin = {};   // swimlane id ('' for none) -> its finished tiles
    (b.tiles || []).forEach((t) => {
      if (RD.tileInBacklog(t)) { out.push(['tile', t.id, 'none', 1]); return; }
      const ci = cols.findIndex((c) => c.id === t.col);
      if (ci < 0) return;
      if (t.col === last) { const lk = lanes[t.lane] ? t.lane : ''; (fin[lk] = fin[lk] || []).push(t); return; }
      const lane = lanes[t.lane];
      const h = RD.tileHealth(t, lane, TISO);
      const due = RD.gateDueDates(cols, lane, t).due[ci];
      const gst = RD.gateTileState(b, t, ci, TISO);
      out.push(['tile', t.id, gst === 'overdue' || h.status === 'breached' ? 'off' : (due === TISO || h.status === 'at-risk') ? 'risk' : 'ok', 1]);
    });
    Object.keys(fin).forEach((lk) => {
      if (fin[lk].length >= 4) out.push(['tile', 'done:' + b.id + ':' + lk, 'done', fin[lk].length]);
      else fin[lk].forEach((t) => out.push(['tile', t.id, 'done', 1]));
    });
  });
  RD.fmeaProblemsFor(doc, objId).forEach((p) => {
    const u = RD.worstUnresolvedRpn(p, passed(p.gateId)), b = RD.rpnBand(u);
    out.push(['risk', p.rid, u > 0 ? (b === 'high' ? 'off' : b === 'med' ? 'risk' : 'ok') : 'done', 1]);
  });
  return out;
}
const mine = () => items().map((it) => [it.type, it.id, it.status, it.units]);
const sortRows = (l) => l.map((x) => x.join('|')).sort();

/* ======================================================================== 1. every objective */
s.step('every status follows the footnote\'s rules, for every objective of every division', () => {
  let n = 0, total = 0;
  s.c.ctx.divs.forEach((dv) => {
    nav({ divId: dv.id, tab: 'overview', fQuarter: '', fProduct: '', fOwner: '' });
    s.c.ctx.allObjs.forEach((o) => {
      nav({ objId: o.id, tab: 'overview' });
      const want = oracle(s.c.D, dv.id, s.c.ctx.docKey, o.id);
      s.eq(o.id + ': rows and statuses', sortRows(mine()), sortRows(want));
      const c = byStatus(want), tot = want.reduce((a, x) => a + x[3], 0);
      const ch = {};
      V().chips.forEach((x) => { ch[x.k] = Number(x.count); });
      s.eq(o.id + ': chips count units by status', ['off', 'risk', 'ok', 'none', 'done'].map((k) => ch[k]), ['off', 'risk', 'ok', 'none', 'done'].map((k) => c[k]));
      s.eq(o.id + ': Cancelled chip only when something is cancelled', ch.cancelled === undefined, !c.cancelled);
      s.eq(o.id + ': All and Needs attention', [V().allLabel, V().needLabel], ['All ' + tot, 'Needs attention ' + (c.off + c.risk)]);
      s.clean(o.id);
      n++; total += tot;
    });
  });
  s.ok(n >= (SALES ? 2 : 8), 'checked ' + n + ' objectives, ' + total + ' rows');
});

/* ======================================================================== 2. the sample story */
s.step('the table as it opens: four sections, their bars, the summary and the footnote', () => {
  fresh();
  s.eq('starts on the Overview of ' + DEF_OBJ, [s.c.state.tab, s.c.ctx.objId], ['overview', DEF_OBJ]);
  s.expect('Review');
  if (!SALES) {
    s.eq('summary', V().summary, '12 items: 3 key results, 5 stage-gates, no kanban tiles and 4 risks');
    s.eq('sections', V().groups.map((g) => g.label + ' ' + g.count), ['Key results 3', 'Stage-gates 5', 'Kanban 0', 'Risks 4']);
    s.expect('No kanban board yet. Add one on the Kanban tab to track work through stages.');
    s.eq('stage-gate section: workstreams and gate health', [group('Stage-gates').sub, group('Stage-gates').extra], ['2 workstreams', 'Gate health 0%']);
    s.eq('a heading per workstream', heads('Stage-gates').map((h) => [headText(h), h.subMeta, h.subCountsAria]),
      [['Workstream A: Durability 3', 'Chained, 1 of 3 gates passed', '1 at risk, 1 not started, 1 done'], ['Workstream B: Teardown and analysis 2', 'Independent, 0 of 2 gates passed', '2 not started']]);
    s.eq('each gate under its own workstream', under('Stage-gates'), { 'Workstream A': ['SG-A2 Durability screen, 500 h', 'SG-A3 1,000 h endurance hold', 'SG-A1 Build and leak-test the stack'], 'Workstream B': ['SG-B1 Post-test teardown and SEM', 'SG-B2 Failure-mode review'] });
  } else {
    s.eq('summary', V().summary, '22 items: 2 key results, 2 stage-gates, 17 kanban tiles and 1 risk');
    s.eq('sections', V().groups.map((g) => g.label + ' ' + g.count), ['Key results 2', 'Stage-gates 2', 'Kanban 17', 'Risks 1']);
    s.eq('kanban section names the board; its swimlanes head the rows', group('Kanban').sub, 'Pilot pipeline board, 3 swimlanes');
    s.eq('a heading per swimlane, with its stage limit and deadline', heads('Kanban').map((h) => [headText(h), h.subMeta, h.subCountsAria]),
      [['Utilities 8', '14 days per stage, due Dec 18', '1 at risk, 2 on track, 1 not started, 4 done'], ['Industrial gas 4', '21 days per stage', '1 off track, 1 on track, 2 done'], ['Mobility 5', '14 days per stage', '1 off track, 1 at risk, 1 on track, 2 done']]);
    s.eq('each tile under its swimlane, a parked one too', under('Kanban'), {
      Utilities: ['High Desert Co-op', 'Snake River Electric', 'Cascade Public Power', 'Bonneville Rural Electric', '4 tiles in Closed'],
      'Industrial gas': ['Ironwood Industrial', 'Northgate Gases', 'Pacific Industrial Gases', 'Summit Specialty Gas'],
      Mobility: ['Clearwater Port Authority', 'Boise Airport ground fleet', 'Treasure Valley Transit', 'Magic Valley Fleet', 'Boise Freight Depot']
    });
    s.eq('stage-gates: one workstream, its heading and gate health', [group('Stage-gates').sub, heads('Stage-gates').map(headText), group('Stage-gates').extra], ['1 workstream', ['Workstream A: Pilot readiness 2'], 'Gate health 50%']);
  }
  s.eq('a bar per section with items, its segments by status', V().groups.map((g) => g.bar.map((b) => b.k + ' ' + b.count).join(', ')),
    SALES ? ['off 1, ok 1', 'risk 1, done 1', 'off 2, risk 2, ok 4, none 1, done 8', 'off 1'] : ['off 1, ok 2', 'risk 1, none 3, done 1', '', 'off 1, risk 1, done 2']);
  s.eq('the key-result section names its rule', group('Key results').sub, 'Status follows the score: 80 and up on track, 65 to 79 at risk, under 65 off track');
  s.eq('KR rule is the score (REVIEW.KR_RULE)', api().KR_RULE, 'score');
  s.ok(/^One status scale for every row\. Off track: a key result scoring under 65, an overdue or failed stage-gate/.test(V().footnote) && /When more than one rule applies, the worst sets the status\./.test(V().footnote), 'footnote states the rules');
  s.expect('When more than one rule applies, the worst sets the status.');
  s.ok(!s.has('Key-result signal'), 'no KR signal bars in the head');
  s.clean('first view');
});

if (!SALES) s.step('Lock Tera components: each row as the mockup showed it, from the engine', () => {
  nav({ objId: LOCK, tab: 'overview' });
  const it = (id) => items().find((x) => x.id === id);
  const kr = it('KR-EL-2026Q4-02-2');
  s.eq('KR-M1 row', [kr.row.tid, kr.status, kr.row.stSub, kr.row.barVal, kr.row.pgSub, kr.row.date, kr.row.dateSub, kr.row.note],
    ['KR-M1', 'off', 'Score 44', '44%', '20 pts ahead of pace', 'Oct 30', 'In 17 days', 'Next: step 2, Contact resistance screening, 60% done.']);
  s.eq('time-used tick', kr.row.tickStyle, 'left: 24%');
  s.eq('steps under it', kr.kids.map((k) => [k.mkText, k.name, k.stWord, k.barVal, k.sub]), [['1', 'Samples received and inspected', 'Done', '100%', 'Weight 20%'], ['2', 'Contact resistance screening', 'In progress', '60%', 'Weight 40%'], ['3', '500 h corrosion soak', 'Not started', '0%', 'Weight 40.0%, shared']]);
  const a1 = it('SG-EL-2026Q4-02-2');
  s.eq('SG-A1 overdue', [a1.row.tid, a1.status, a1.row.stSub, a1.row.barVal, a1.row.pgSub, a1.row.date, a1.row.dateSub], ['SG-A1', 'off', '5 days overdue', '38%', 'Ready, 0 of 1 target met', 'Oct 8', '5 days ago']);
  s.eq('its note: today\'s forecast rule', a1.row.note, 'Forecast today, a day later for each day it stays open.');
  const tg = a1.kids[0];
  s.eq('its range target as a gauge (its reading a button under it, to post another)', [tg.name, tg.sub, tg.stWord, tg.pgGauge, tg.vText, tg.valLine, tg.gmkCls, tg.gLabels.map((l) => l.text)], ['Interfacial contact resistance', 'Target 6 to 10 mΩ·cm²', 'Below', true, '12.5 mΩ·cm²', true, 'review-gmk out', ['6', '10']]);
  s.eq('SG-A2 passed by hand, with its justification', [it('SG-EL-2026Q4-02-1').status, it('SG-EL-2026Q4-02-1').row.pgTxt, it('SG-EL-2026Q4-02-1').row.stSub], ['done', 'Passed by hand', 'Passed 1 day early']);
  s.eq('SG-A3 waits, moved by the revised plan', [it('SG-EL-2026Q4-02-3').status, it('SG-EL-2026Q4-02-3').row.stSub, it('SG-EL-2026Q4-02-3').row.note], ['none', 'Not yet due', 'Moved from Nov 13 by the revised plan of Sep 22.']);
  const t = (id) => { const x = it(id); return [x.status, x.row.stSub, x.row.stage, x.row.pips.map((p) => p.cls || '-').join(''), x.row.pgSub, x.row.date, x.row.dateSub]; };
  s.eq('End plates: its first stage is long overdue', t('tile-endp'), ['off', 'Stage 25 days late', 'Spec drafted', 'o---', '8 of 21 days in this stage', 'Sep 18', '25 days ago']);
  s.eq('Bipolar plate: cleared late, now late again', t('tile-bpp'), ['off', 'Stage 4 days late', 'Samples in test', 'lo--', '19 of 21 days in this stage', 'Oct 9', '4 days ago']);
  s.eq('Gaskets: at the stage limit', t('tile-gasket'), ['risk', 'At the stage limit', 'Samples in test', 'ch--', '14 of 14 days in this stage', 'Oct 23', 'In 10 days']);
  s.eq('MEA: inside its limit', t('tile-mea'), ['ok', '8 days left', 'Qualified', 'cch-', '6 of 14 days in this stage', 'Nov 6', 'In 24 days']);
  s.eq('a parked tile', [it('tile-rods').status, it('tile-rods').row.stSub, it('tile-rods').row.pgTxt, it('tile-rods').row.dateSub], ['none', 'No swimlane yet', 'In the backlog', 'No date']);
  s.eq('two released tiles stay rows of their own', ['tile-ptl', 'tile-cc'].map((id) => [it(id).status, it(id).row.stage, it(id).row.dateSub]), [['done', 'Released', '4 days ago'], ['done', 'Released', '13 days ago']]);
  s.ok(/At 21 days a stage it reaches Released after the swimlane deadline, Nov 20\./.test(it('tile-endp').row.note), 'a lane that cannot be met says so: ' + it('tile-endp').row.note);
  s.eq('rows inside a section: worst first, then by date', shownNames().slice(0, 2), ['KR-M1 Qualify the second-source bipolar plate', 'KR1 Freeze the porous transport layer spec']);
  s.eq('needs attention', V().needLabel, 'Needs attention 6');
  s.clean('lock tera');
});

if (SALES) s.step('Sales: a swimlane\'s closed deals become one row from four on, their days in Proposal underneath', () => {
  const g = items().find((x) => x.id === 'done:BRD-BD-PIPE:lane-ut');
  s.eq('Utilities: one row for four tiles, counted as four', [g.row.name, g.units, g.status, g.row.sub, g.row.date, g.row.dateSub], ['4 tiles in Closed', 4, 'done', 'Utilities', 'Oct 9', 'Most recent']);
  s.eq('note: every one ran over its Proposal limit', g.row.note, 'All 4 ran over the Proposal limit.');
  s.eq('under its heading the row needn\'t name the swimlane', shown().find((r) => r.name === '4 tiles in Closed').sub, '');
  s.eq('the other swimlanes\' two each stay rows of their own', ['tile-summit', 'tile-pacific', 'tile-freight', 'tile-magic'].map((id) => items().find((x) => x.id === id).status), ['done', 'done', 'done', 'done']);
  s.eq('collapsed by default (done rows start closed)', kidsShown().filter((k) => /^done:/.test(k.k)).length, 0);
  s.click('Show 4 tiles under 4 tiles in Closed');
  const kids = kidsShown().filter((k) => /^done:/.test(k.k));
  s.eq('four tiles, newest first', kids.map((k) => k.name), ['Teton Valley Utility', 'Sawtooth Energy', 'Owyhee Rural Electric', 'Gem State Power']);
  s.eq('Teton Valley: 42 days in Proposal, 28 over its 14-day limit', [kids[0].pgTxt, kids[0].pgSub, kids[0].stWord, kids[0].date, kids[0].sub], ['42 days in Proposal', '28 days over the 14-day limit', 'Closed', 'Oct 9', 'Sam']);
  s.type('Filter rows by name', 'teton');
  const row = shown().find((r) => /tiles in Closed/.test(r.name));
  s.eq('the filter narrows the group to its matching tiles', [row && row.name, kidsShown().filter((k) => /^done:/.test(k.k)).map((k) => k.name)], ['1 of 4 tiles in Closed', ['Teton Valley Utility']]);
  s.eq('only the heading with a match stays, counting what shows', heads('Kanban').map(headText), ['Utilities 1']);
  s.ok(/^Showing \d+ of 22$/.test(V().showing), 'showing ' + V().showing);
  s.click('Clear filters');
  s.click('Hide 4 tiles under 4 tiles in Closed');
  s.eq('KR2: one KPI, its latest reading and the change', items().find((x) => x.id === 'KR-BD-2026Q4-01-2').row.note, 'Latest reading 3.6 $M on Oct 10. Up 0.5 since Oct 2.');
  const r = items().find((x) => x.id === 'RISK-BD-2026Q4-01-1');
  s.eq('the risk: off track at RPN 224, its causes by RPN', [r.status, r.row.rpnVal, r.row.pgSub, r.kids.map((k) => k.rpnVal + ' ' + k.stWord + ' ' + k.stSub)], ['off', '224', '1 of 3 causes being mitigated', ['224 Open High', '120 Mitigating Medium', '72 Open Low']]);
  s.eq('the gate it sits on is at risk for it', items().find((x) => x.id === 'SG-BD-2026Q4-01-2').row.note.indexOf('High risk open: Utility interconnection studies run long, RPN 224.'), 0);
  const t = (id) => items().find((x) => x.id === id);
  s.eq('a stage due today is at risk', [t('tile-airport').status, t('tile-airport').row.stSub], ['risk', 'Stage due today']);
  s.eq('High Desert: 12 of 14 days used', [t('tile-desert').status, t('tile-desert').row.stSub], ['risk', '12 of 14 days used']);
  s.eq('Ironwood: over its limit though its stage is not due', [t('tile-ironwood').status, t('tile-ironwood').row.stSub, t('tile-ironwood').row.dateSub], ['off', 'Over the stage limit', 'In 14 days']);
  s.clean('sales story');
});

/* ======================================================================== 3. filters */
s.step('chips, Needs attention and the bars filter by status', () => {
  fresh();
  const all = items();
  const need = all.filter((x) => x.status === 'off' || x.status === 'risk');
  s.click('~Needs attention');
  s.eq('Needs attention keeps off track and at risk', [s.c.state.review_sel, V().needPressed, V().allPressed], [['off', 'risk'], true, false]);
  s.eq('rows', shown().length, need.length);
  s.ok(shown().every((r) => r.stWord === 'Off track' || r.stWord === 'At risk'), 'every shown row needs attention');
  s.eq('the other bar segments dim', V().groups[0].bar.filter((b) => /\bdim\b/.test(b.cls)).map((b) => b.k), V().groups[0].bar.filter((b) => b.k !== 'off' && b.k !== 'risk').map((b) => b.k));
  s.ok(/^Showing \d+ of \d+$/.test(V().showing), 'says what it shows: ' + V().showing);
  s.click('~All ', { within: 'Show' });   // scoped: Sales' division picker reads "All divisions" too
  s.eq('All clears it', s.c.state.review_sel, []);
  s.click(chip('Done'));
  s.eq('a chip filters to its status', [s.c.state.review_sel, shown().every((r) => r.stWord === 'Done')], [['done'], true]);
  s.ok(s.find(chip('Done')).attrs['aria-pressed'] === true, 'and reads as pressed');
  s.click(chip('Not started'));
  s.eq('a second chip adds to it', s.c.state.review_sel, ['done', 'none']);
  s.click(chip('Done'));
  s.eq('clicking again removes it', s.c.state.review_sel, ['none']);
  s.click('Clear filters');
  s.eq('Clear filters', [s.c.state.review_sel, s.c.state.review_q], [[], '']);
  const krOff = items().filter((x) => x.type === 'kr' && x.status === 'off').length;
  s.click(seg('Off track: ' + krOff + '. Select to show only these.'));
  s.eq('a bar segment filters too', s.c.state.review_sel, ['off']);
  s.ok(s.has((el) => /\breview-seg\b/.test(el.attrs.class || '') && el.attrs.title === 'Off track: ' + krOff + '. Select to stop filtering by it.'), 'and offers to stop');
  s.click(seg('Off track: ' + krOff + '. Select to stop filtering by it.'));
  s.eq('again: no filter', s.c.state.review_sel, []);
  s.type('Filter rows by name', SALES ? 'Clearwater' : 'Durability screen');
  s.eq('the filter box matches names, notes and the rows under them', shownNames(), SALES ? ['Clearwater Port Authority'] : ['SG-A2 Durability screen, 500 h']);
  s.key('Filter rows by name', 'Escape');
  s.eq('Escape clears it', s.c.state.review_q, '');
  s.type('Filter rows by name', 'zzqq');
  s.eq('nothing matches', [V().noRows, V().groups.length], [true, 0]);
  s.expect('Nothing matches these filters.');
  s.click('Clear filters', { nth: 1 });
  s.eq('and back', V().noRows, false);
  s.clean('filters');
});

/* ======================================================================== 4. grouping, expanding */
s.step('group by status and by due date; the type bars come along', () => {
  fresh();
  s.click('Status', { within: 'Group rows by' });
  s.eq('grouped by status, worst first', V().groups.map((g) => g.label), ['Off track', 'At risk', 'On track', 'Not started', 'Done'].filter((l) => items().some((x) => api().STATUS[x.status].label === l)));
  s.eq('each row says its type', shown().every((r) => ['Key result', 'Stage-gate', 'Kanban', 'Risk'].indexOf(r.tag) >= 0), true);
  s.eq('a bar per type above the table', V().typeBars.map((t) => t.label), SALES ? ['Key results', 'Stage-gates', 'Kanban', 'Risks'] : ['Key results', 'Stage-gates', 'Risks']);
  s.ok(s.has((el) => el.attrs['data-k'] === 'review-types'), 'type bars drawn');
  const krOff = items().filter((x) => x.type === 'kr' && x.status === 'off').length;
  s.click(seg('Off track: ' + krOff + '. Select to show only these.'), { within: 'review-types' });
  s.eq('a type bar\'s segment filters by its status', [s.c.state.review_sel, V().groups.map((g) => g.label)], [['off'], ['Off track']]);
  s.click(seg('Off track: ' + krOff + '. Select to stop filtering by it.'), { within: 'review-types' });
  s.eq('and lets go', s.c.state.review_sel, []);
  s.click('Due date', { within: 'Group rows by' });
  const keys = items().map((x) => api().dueKey(x, TD));
  const labels = { late: 'Late', today: 'Due today', week: 'In the next 7 days', month: 'In 8 to 30 days', later: 'Later', nodate: 'No date', done: 'Done', cancelled: 'Cancelled' };
  s.eq('grouped by due date', V().groups.map((g) => g.label), ['late', 'today', 'week', 'month', 'later', 'nodate', 'done', 'cancelled'].filter((k) => keys.indexOf(k) >= 0).map((k) => labels[k]));
  s.click('Type', { within: 'Group rows by' });
  s.eq('back to type, no type bars', [V().gbType, V().showTypeBars], [true, false]);
  s.clean('grouping');
});

s.step('grouped by type: workstream and swimlane headings, each folds; filters keep the headings with rows', () => {
  fresh();
  if (!SALES) {
    nav({ objId: LOCK, tab: 'overview' });
    s.eq('Lock Tera: its workstream', heads('Stage-gates').map((h) => [headText(h), h.subMeta]), [['Workstream A: Component lock 3', 'Chained, 1 of 3 gates passed']]);
    s.eq('its swimlanes in board order, then the tiles with none', heads('Kanban').map((h) => [headText(h), h.subMeta, h.subCountsAria]),
      [['Stack hardware 4', '21 days per stage, due Nov 20', '2 off track, 2 done'], ['Soft goods 2', '14 days per stage, due Nov 20', '1 at risk, 1 on track'], ['No swimlane 1', 'Swimlane chosen at start', '1 not started']]);
    s.eq('tiles under their swimlanes, worst first', under('Kanban'), { 'Stack hardware': ['End plates and compression', 'Bipolar plate, second source', 'Current collectors', 'Porous transport layer'], 'Soft goods': ['Gaskets', 'Membrane electrode assembly'], 'No swimlane': ['Stack tie rods'] });
    s.eq('a heading\'s rows say only the owner', shown().filter((r) => /in-sub/.test(r.cls) && !r.tid).map((r) => r.sub), ['Toru', 'Toru', 'Toru', 'Priya', 'Toru', 'Priya', 'Unassigned']);
    s.eq('the section line names the board', group('Kanban').sub, 'Component lock board, 2 swimlanes');
    s.ok(s.has((el) => el.attrs['data-k'] === 'review-sub:lane:BRD-EL-LOCK:lane-hw'), 'headings are drawn rows');
    s.click('Collapse Stack hardware');
    s.eq('a swimlane folds', [under('Kanban')['Stack hardware'], heads('Kanban')[0].subToggleLabel, heads('Kanban')[0].subOpen], [[], 'Expand Stack hardware', false]);
    s.eq('remembered for this objective, grouping and swimlane', s.c.state.review_gc[LOCK + ':type:tile:lane:BRD-EL-LOCK:lane-hw'], true);
    s.eq('the section still counts its tiles', group('Kanban').count, '7');
    s.click('Expand Stack hardware');
    s.eq('and unfolds', under('Kanban')['Stack hardware'].length, 4);
    s.click('Collapse Workstream A: Component lock');
    s.eq('a workstream folds too', under('Stage-gates')['Workstream A'], []);
    s.click('Expand Workstream A: Component lock');
    s.click(chip('At risk'));
    s.eq('a status filter keeps only headings with rows', [V().groups.map((g) => g.label), heads('Kanban').map(headText)], [['Kanban'], ['Soft goods 1']]);
    s.click('Clear filters');
    s.type('Filter rows by name', 'Component lock');
    s.eq('the filter finds gates by their workstream', shownNames(), ['SG-A1 Second-source bipolar plate trial', 'SG-A3 Design freeze sign-off', 'SG-A2 PTL spec review']);
    s.type('Filter rows by name', 'Soft goods');
    s.eq('and tiles by their swimlane', shownNames(), ['Gaskets', 'Membrane electrode assembly']);
    s.key('Filter rows by name', 'Escape');
    s.click('Status', { within: 'Group rows by' });
    s.ok(V().groups.every((g) => g.rows.every((r) => !r.isSub)), 'grouped by status: no headings');
    s.eq('a row names its swimlane again', shown().find((r) => r.name === 'End plates and compression').sub, 'Stack hardware, Toru');
    s.click('Due date', { within: 'Group rows by' });
    s.ok(V().groups.every((g) => g.rows.every((r) => !r.isSub)), 'grouped by due date: no headings');
    s.click('Type', { within: 'Group rows by' });
    s.eq('back to type: the headings return', heads('Kanban').length, 3);
  } else {
    s.click('Collapse Mobility');
    s.eq('a swimlane folds', [under('Kanban').Mobility, s.c.state.review_gc[DEF_OBJ + ':type:tile:lane:BRD-BD-PIPE:lane-mo']], [[], true]);
    s.click('Expand Mobility');
    s.click('Collapse Workstream A: Pilot readiness');
    s.eq('the workstream folds', under('Stage-gates')['Workstream A'], []);
    s.click('Expand Workstream A: Pilot readiness');
    s.click(chip('Off track'));
    s.eq('a status filter keeps only headings with rows', heads('Kanban').map(headText), ['Industrial gas 1', 'Mobility 1']);
    s.click('Clear filters');
  }
  s.clean('headings');
});

s.step('rows with detail expand; off track and at risk start open; Expand all and Collapse all; groups fold', () => {
  fresh();
  const withKids = items().filter((x) => x.kids.length);
  const openNow = withKids.filter((x) => x.status === 'off' || x.status === 'risk');
  s.eq('off track and at risk rows with detail start open', kidsShown().length, openNow.reduce((a, x) => a + x.kids.length, 0));
  const first = withKids.find((x) => x.status === 'off' || x.status === 'risk');
  const r1 = shown().find((r) => r.k === first.row.k);
  s.eq('its toggle says what it hides', [r1.expanded, /^Hide /.test(r1.expLabel)], [true, true]);
  s.click(r1.expLabel);
  s.eq('collapsed by hand', s.c.state.review_open[first.key], false);
  s.eq('its rows are gone', kidsShown().length, openNow.reduce((a, x) => a + x.kids.length, 0) - first.kids.length);
  s.click('Expand all');
  s.eq('Expand all opens every row with detail', kidsShown().length, withKids.reduce((a, x) => a + x.kids.length, 0));
  s.eq('then offers Collapse all', V().expandLabel, 'Collapse all');
  s.click('Collapse all');
  s.eq('Collapse all closes them', kidsShown().length, 0);
  s.click('Collapse Key results');
  s.eq('a section folds', [group('Key results').open, shown().filter((r) => /^KR/.test(r.tid)).length], [false, 0]);
  s.eq('remembered for this objective and grouping', s.c.state.review_gc[DEF_OBJ + ':type:kr'], true);
  s.click('Expand Key results');
  s.eq('and unfolds', group('Key results').open, true);
  s.clean('expanding');
});

/* ======================================================================== 5. links */
s.step('an item\'s name opens it on its own tab, highlighted, then the highlight goes', () => {
  fresh();
  if (!SALES) nav({ objId: LOCK, tab: 'overview' });
  /* key result */
  const kr = items().find((x) => x.type === 'kr');
  s.click(link(kr.row.name));
  s.eq('key result: the tab, expanded, highlighted', [s.c.state.tab, !!s.c.state.kr_open[kr.id], s.c.state.kr_focus], ['krs', true, kr.id]);
  s.eq('the Key results tab marks it and gives it focus', s.vals.kr.rows.filter((r) => r.focus).map((r) => [r.id, r.itemCls]), [[kr.id, 'kr-item is-focus']]);
  s.flush(9000);
  s.eq('after a few seconds the highlight goes', [s.c.state.kr_focus, s.vals.kr.rows.filter((r) => r.focus).length], ['', 0]);
  s.click('Overview', { within: 'Objective sections' });
  /* stage-gate */
  const g = items().find((x) => x.type === 'gate' && x.kids.length);
  s.click(link(g.row.name));
  s.eq('stage-gate: the tab, its targets open, highlighted', [s.c.state.tab, !!s.c.state.gates_open[g.id], s.c.state.gates_focus], ['gates', true, g.id]);
  s.flush(9000);
  s.eq('highlight gone', s.c.state.gates_focus, '');
  s.click('Overview', { within: 'Objective sections' });
  /* kanban tile, finished tile, parked tile */
  const tile = items().find((x) => x.type === 'tile' && (x.status === 'off' || x.status === 'risk'));
  const board = (s.c.ctx.doc.boards || []).find((b) => (b.tiles || []).some((t) => t.id === tile.id));
  s.click(link(tile.row.name));
  s.eq('tile: the Kanban tab, its board, highlighted', [s.c.state.tab, s.c.state.kb_sel, s.c.state.kb_focus], ['kanban', board.id, tile.id]);
  const allTiles = [];
  (s.vals.kb.lanes || []).forEach((l) => l.cells.forEach((c) => c.tiles.forEach((t) => allTiles.push(t))));
  s.eq('the board marks it and gives its name focus', allTiles.filter((t) => t.focus).map((t) => [t.id, /\bis-focus\b/.test(t.cls)]), [[tile.id, true]]);
  s.flush(9000);
  s.eq('highlight gone', s.c.state.kb_focus, '');
  s.click('Overview', { within: 'Objective sections' });
  const parked = items().find((x) => x.type === 'tile' && x.status === 'none');
  s.c.setState({ kb_bl: false }); s.render();
  s.click(link(parked.row.name));
  s.eq('a parked tile opens the backlog to show it', [s.c.state.tab, s.c.state.kb_bl, s.c.state.kb_focus], ['kanban', true, parked.id]);
  s.click('Overview', { within: 'Objective sections' });
  if (SALES) {
    s.click(link('4 tiles in Closed'));
    s.eq('the finished group opens its board with that swimlane\'s older tiles', [s.c.state.tab, s.c.state.kb_sel, s.c.state.kb_focus, !!(s.c.state.kb_older || {})['BRD-BD-PIPE:lane-ut']], ['kanban', 'BRD-BD-PIPE', '', true]);
  } else {
    const fin = items().find((x) => x.type === 'tile' && x.status === 'done');
    const t = (board.tiles || []).find((x) => x.id === fin.id);
    s.click(link(fin.row.name));
    s.eq('a finished tile shows its lane\'s older tiles too', [s.c.state.tab, s.c.state.kb_focus, !!(s.c.state.kb_older || {})[board.id + ':' + t.lane]], ['kanban', fin.id, true]);
  }
  s.click('Overview', { within: 'Objective sections' });
  /* risk */
  nav({ objId: DEF_OBJ, tab: 'overview' });
  const r = items().find((x) => x.type === 'risk');
  s.click(link(r.row.name));
  s.eq('risk: the register, the problem highlighted', [s.c.state.tab, s.c.state.fmea_focus], ['risks', r.id]);
  s.eq('its name takes focus', s.vals.fmea.reg.probs.filter((p) => p.focus).map((p) => p.k), ['prob-' + r.id]);
  s.flush(9000);
  s.eq('highlight gone', s.c.state.fmea_focus, '');
  s.clean('links');
});

/* ======================================================================== 6. the data moves, the table follows */
s.step('the table follows the data: a gate passes, a tile moves, a reading posts, a cause resolves', () => {
  fresh();
  const doc = () => s.c.D.docs[s.c.ctx.docKey];
  if (!SALES) {
    nav({ objId: LOCK, tab: 'overview' });
    s.c.mutate((D) => { const g = D.docs['EXEC-DIV-EL'].stageGates.find((x) => x.id === 'SG-EL-2026Q4-02-2'); g.actualDate = TD; g.completionMethod = 'manual'; g.overrideJustification = 'Accepted at 12.5 on the supplier\'s retest'; });
    s.flush(0);
    const g = items().find((x) => x.id === 'SG-EL-2026Q4-02-2');
    s.eq('marked complete: done, 5 days late, by hand, with its reason', [g.status, g.row.stSub, g.row.pgTxt, g.row.note], ['done', 'Passed 5 days late', 'Passed by hand', 'Accepted at 12.5 on the supplier\'s retest.']);
    s.eq('the next gate in the chain is now in progress', items().find((x) => x.id === 'SG-EL-2026Q4-02-3').status, 'ok');
    s.c.mutate((D) => { const d = D.docs['EXEC-DIV-EL']; const i = d.boards.findIndex((b) => b.id === 'BRD-EL-LOCK'); d.boards[i] = RD.dropTile(d.boards[i], 'tile-gasket', 'col-ql', null, TISO); });
    s.flush(0);
    const t = items().find((x) => x.id === 'tile-gasket');
    s.eq('Gaskets moved on to Qualified: its clock restarts', [t.status, t.row.stage, t.row.pgSub], ['ok', 'Qualified', '0 of 14 days in this stage']);
  } else {
    const k = doc().kpis.find((x) => x.id === 'KPI-BD-2026Q4-01-2-1');
    s.c.mutate((D) => { D.docs['BIZ-DIV-BD'].kpiUpdates.push({ id: 'UPD-review-1', kpiId: k.id, value: 4.6, timestamp: s.c.now(), by: 'sam@celadyne.com', note: '' }); });
    s.flush(0);
    const kr = items().find((x) => x.id === 'KR-BD-2026Q4-01-2');
    s.eq('a reading past the target: score 100, target met', [kr.status, kr.row.barVal, kr.row.pgSub], ['ok', '100%', 'Target met']);
    s.eq('its note follows', kr.row.note, 'Latest reading 4.6 $M on Oct 13. Up 1 since Oct 10.');
  }
  nav({ objId: DEF_OBJ, tab: 'overview' });
  const p = items().find((x) => x.type === 'risk' && x.status === 'off');
  const rid = p.id;
  s.c.mutate((D) => { const pr = D.docs[s.c.ctx.docKey].risks.find((x) => x.rid === rid); pr.modes.forEach((m) => m.effects.forEach((e) => e.causes.forEach((c) => { c.status = 'resolved'; }))); });
  s.flush(0);
  const p2 = items().find((x) => x.id === rid);
  s.eq('every cause resolved: nothing open', [p2.status, p2.row.stSub, p2.row.rpnPre], ['done', 'Nothing open', 'Worst RPN']);
  const gid = (doc().risks.find((x) => x.rid === rid) || {}).gateId;
  if (gid) s.ok(items().find((x) => x.id === gid).status !== 'risk' || items().find((x) => x.id === gid).row.stSub !== 'High risk open on it', 'its gate no longer carries the risk');
  s.clean('data follows');
});

/* ======================================================================== 6b. readings from the Overview */
/* Decided October 19: a KPI or target row takes readings the way its tab's KPI table does (KPI.post): its value
   is the same button, the same inline editor posts it, a statistical KPI opens the same readings under the row */
const R = { within: 'review' };
const reads = (id) => s.c.D.docs[s.c.ctx.docKey].kpiUpdates.filter((u) => u.kpiId === id);
const kid = (id) => kidsShown().find((r) => r.k === 'kpi:' + id);
const expandAll = () => { if (s.has('Expand all', R)) s.click('Expand all', R); return s; };
const blur = (q) => s.fire(s.find(q, Object.assign({ handler: 'onBlur' }, R)), 'onBlur');
s.step('a KPI row posts a reading the way the Key results tab does', () => {
  fresh();
  expandAll();
  const K = SALES ? 'KPI-BD-2026Q4-01-2-1' : 'KPI-EL-2026Q4-01-3-1';
  const NAME = SALES ? 'Qualified pipeline value' : 'H₂ in O₂';
  const KRID = SALES ? 'KR-BD-2026Q4-01-2' : 'KR-EL-2026Q4-01-3';
  const [NOW, NEXT, UNIT] = SALES ? ['3.6 $M', '4.1', ' $M'] : ['0.62%', '0.48', '%'];
  s.eq('its value is the KPI table\'s button', [kid(K).valInBar, kid(K).barValStatic, kid(K).vText, kid(K).vTitle], [true, false, NOW, 'Click to post a reading']);
  const n0 = reads(K).length;
  s.click('Post a reading for ' + NAME, R);
  s.eq('the editor takes the progress cell, with today\'s value in it', [kid(K).kpiEd, kid(K).pgBar, s.find('New value for ' + NAME, R).attrs.value], [true, false, NOW.replace(UNIT, '')]);
  if (!SALES) s.ok(s.has((el) => el.tag === 'span' && /\bsub\b/.test(el.attrs.class || '') && textOf(el) === '%', R), 'its unit beside it');
  s.type('New value for ' + NAME, 'abc', R);
  s.key('New value for ' + NAME, 'Enter', R);
  s.expect('Use a number, like 1.85.');
  s.eq('nothing posted', reads(K).length, n0);
  s.type('New value for ' + NAME, NEXT, R);
  s.key('New value for ' + NAME, 'Enter', R);
  s.ok(toasts().includes('Reading posted.'), 'Reading posted.');
  const u = reads(K)[reads(K).length - 1];
  s.eq('one reading, stamped and signed like the tab\'s', [reads(K).length, u.value, u.by, typeof u.timestamp], [n0 + 1, Number(NEXT), 'corey@celadyne.com', 'number']);
  s.eq('the row shows it', [kid(K).kpiEd, kid(K).vText], [false, NEXT + UNIT]);
  const kr = items().find((x) => x.id === KRID);
  s.ok(kr.row.note.indexOf('Latest reading ' + NEXT + UNIT + ' on Oct 13.') === 0, 'its key result\'s note follows: ' + kr.row.note);
  s.eq('and its score, from the engine', kr.row.barVal, Math.round(RD.keyResultScore(KRID, s.c.ctx.em)) + '%');
  /* Escape leaves it; leaving the field posts what was typed (the table's blur rule); the same value posts nothing */
  s.click('Post a reading for ' + NAME, R);
  s.type('New value for ' + NAME, '9', R);
  s.key('New value for ' + NAME, 'Escape', R);
  s.eq('Escape: nothing posted', [kid(K).kpiEd, reads(K).length], [false, n0 + 1]);
  s.click('Post a reading for ' + NAME, R);
  s.type('New value for ' + NAME, SALES ? '4.3' : '0.45', R);
  blur('New value for ' + NAME);
  s.eq('leaving the field posts it', [kid(K).kpiEd, reads(K).length, reads(K)[reads(K).length - 1].value], [false, n0 + 2, SALES ? 4.3 : 0.45]);
  s.click('Post a reading for ' + NAME, R);
  s.key('New value for ' + NAME, 'Enter', R);
  s.eq('the same value again posts nothing', reads(K).length, n0 + 2);
  /* a blank clears this KPI's own readings, after asking when there are several */
  s.click('Post a reading for ' + NAME, R);
  s.type('New value for ' + NAME, '', R);
  s.key('New value for ' + NAME, 'Enter', R);
  s.expect('Clear ' + (n0 + 2) + ' readings?');
  s.click('Cancel', { within: 'Clear ' + (n0 + 2) + ' readings?' });
  s.eq('cancelled: every reading kept', reads(K).length, n0 + 2);
  s.clean('kpi row');
});

s.step('a target row posts the way the Stage-gates tab does: pass or fail, and a range', () => {
  fresh();
  if (SALES) {
    expandAll();
    const K = 'KPI-BD-2026Q4-01-3-1', NAME = 'Pilot sites with a study plan';
    const k = s.c.D.docs['BIZ-DIV-BD'].kpis.find((x) => x.name === NAME);
    s.ok(!!k, 'the sample\'s gate target');
    s.click('Post a reading for ' + NAME, R);
    s.type('New value for ' + NAME, '2', R);
    s.key('New value for ' + NAME, 'Enter', R);
    s.ok(toasts().includes('Reading posted.'), 'Reading posted.');
    s.eq('the target row and its gate follow', [kid(k.id).vText, reads(k.id).pop().value], ['2 sites', 2]);
    const g = items().find((x) => x.id === k.hostId);
    s.ok(/^Ready, \d of 1 target met/.test(g.row.pgSub), 'gate readiness: ' + g.row.pgSub);
    /* a pass or fail target on the same gate, with no reading yet */
    s.c.mutate((D) => { D.docs['BIZ-DIV-BD'].kpis.push({ id: 'KPI-BD-TEST-BIN', objectiveId: DEF_OBJ, hostType: 'stageGate', hostId: k.hostId, name: 'Utility board sign-off', targetType: 'binary', direction: null, target: null, unit: '', order: 1 }); }, { quiet: true });
    s.render();
    s.eq('a pass or fail target with no reading: Post a reading, on a line of its own', [kid('KPI-BD-TEST-BIN').valLine, kid('KPI-BD-TEST-BIN').pgText, kid('KPI-BD-TEST-BIN').vText], [true, false, 'Post a reading']);
    s.click('Post a reading for Utility board sign-off', R);
    s.type('New value for Utility board sign-off', '1', R);
    s.key('New value for Utility board sign-off', 'Enter', R);
    s.eq('it passes', [kid('KPI-BD-TEST-BIN').vText, kid('KPI-BD-TEST-BIN').stWord, reads('KPI-BD-TEST-BIN').length], ['Pass', 'Met', 1]);
    s.clean('sales target');
    return;
  }
  expandAll();
  const LEAK = 'KPI-EL-2026Q4-01-4-1';
  s.eq('a pass or fail target: its value on a line of its own, as a button', [kid(LEAK).pgText, kid(LEAK).valLine, kid(LEAK).vText], [false, true, 'Pass']);
  s.click('Post a reading for Leak test at 30 bar', R);
  s.eq('1 = pass, 0 = fail', s.find('New value for Leak test at 30 bar', R).attrs.placeholder, '1 = pass, 0 = fail');
  s.type('New value for Leak test at 30 bar', '2x', R);
  s.key('New value for Leak test at 30 bar', 'Enter', R);
  s.expect('Use 1 for pass or 0 for fail.');
  s.type('New value for Leak test at 30 bar', '0', R);
  s.key('New value for Leak test at 30 bar', 'Enter', R);
  s.eq('posted: it reads Fail now', [kid(LEAK).vText, kid(LEAK).stWord, reads(LEAK).pop().value], ['Fail', 'Below', 0]);
  /* a range target's gauge: the reading lands inside the band */
  nav({ objId: LOCK, tab: 'overview' });
  expandAll();
  const ICR = 'KPI-EL-2026Q4-02-3-1';
  s.eq('a range: the value under the gauge, as a button', [kid(ICR).pgGauge, kid(ICR).valLine, kid(ICR).hasPgSub, kid(ICR).vText], [true, true, false, '12.5 mΩ·cm²']);
  s.click('Post a reading for Interfacial contact resistance', R);
  s.eq('the editor takes the gauge\'s place', [kid(ICR).pgGauge, kid(ICR).kpiEd], [false, true]);
  s.type('New value for Interfacial contact resistance', '8', R);
  s.key('New value for Interfacial contact resistance', 'Enter', R);
  s.ok(toasts().includes('SG-A1 Second-source bipolar plate trial passed: every target is met.'), 'the gate passes on its own, as on its tab');
  const a1 = items().find((x) => x.id === 'SG-EL-2026Q4-02-2');
  s.eq('done, every target met', [a1.status, a1.row.pgTxt], ['done', 'Passed, every target met']);
  s.ok(!!kid(ICR), 'its row stays open though done rows start closed');
  s.eq('inside the range: met', [kid(ICR).gmkCls, kid(ICR).stWord, kid(ICR).vText], ['review-gmk in', 'Met', '8 mΩ·cm²']);
  s.clean('targets');
});

if (!SALES) s.step('a statistical KPI opens its readings under the row: add one, a new batch, remove one', () => {
  fresh();
  expandAll();
  const CV = 'KPI-EL-2026Q4-01-1-1', NAME = 'Cell voltage at 2 A/cm²';
  s.eq('its value says what it opens', [kid(CV).vText, kid(CV).vAria, kid(CV).vExp], ['1.825 V', 'Readings for ' + NAME, 'false']);
  s.click('Readings for ' + NAME, Object.assign({ tag: 'button' }, R));
  const dr = () => s.all((el) => el.attrs['data-k'] === 'review-readings:' + CV)[0];
  s.ok(!!dr(), 'the readings open under the row');
  const at = dr().parent.kids.filter((k) => k.attrs);
  const i = at.indexOf(dr());
  s.eq('right under its KPI row', at[i - 1] && at[i - 1].attrs['data-k'], 'kpi:' + CV);
  s.eq('the same drawer as on the tab', [kid(CV).drawer.title, kid(CV).drawer.statLine, kid(CV).drawer.cnt], ['Readings for ' + NAME, 'Average = 1.825 V', '4 of 10 samples']);
  const n0 = reads(CV).length;
  s.type('New reading for ' + NAME, '1.79', R);
  s.click('Add reading', R);
  s.ok(toasts().includes('Reading added.'), 'Reading added.');
  s.eq('it joins the current batch', [reads(CV).length, reads(CV).pop().batch, kid(CV).drawer.cnt], [n0 + 1, 'b_build2', '5 of 10 samples']);
  s.click('Start a new batch', R);
  s.ok(toasts().includes('New batch started. The next reading begins a fresh sample.'), 'new batch');
  s.type('New reading for ' + NAME, '1.80', R);
  s.key('New reading for ' + NAME, 'Enter', R);
  const nb = reads(CV).pop();
  s.ok(nb.batch && nb.batch !== 'b_build2', 'a fresh sample: ' + nb.batch);
  s.eq('the earlier batch stops counting', kid(CV).drawer.cnt, '1 of 10 samples');
  s.click('Remove reading 1.8', R);
  s.click('Confirm removing 1.8', R);
  s.ok(toasts().includes('Reading removed.'), 'Reading removed.');
  s.eq('removed', reads(CV).length, n0 + 1);
  s.click('Close readings', R);
  s.ok(!dr(), 'closed');
  /* a gate's statistical target: the readings sit one step in, under its workstream */
  s.click('Readings for Voltage decay rate', Object.assign({ tag: 'button' }, R));
  s.eq('under a workstream heading', (s.all((el) => el.attrs['data-k'] === 'review-readings:KPI-EL-2026Q4-01-5-1')[0] || { attrs: {} }).attrs.class, 'review-drow in-sub');
  s.clean('statistical');
});

s.step('the Overview and the tab keep their own editors; read-only shows values only', () => {
  fresh();
  expandAll();
  const NAME = SALES ? 'Qualified pipeline value' : 'H₂ in O₂';
  const KRTXT = SALES ? '~KR2 Grow qualified pipeline' : '~KR3 Hold H₂-in-O₂ crossover';
  s.click('Post a reading for ' + NAME, R);
  s.click('Key results', { within: 'Objective sections' });
  if (!s.has('Post a reading for ' + NAME) && !s.has('New value for ' + NAME)) s.click(KRTXT);
  s.ok(s.has('Post a reading for ' + NAME) && !s.has('New value for ' + NAME), 'the Key results tab\'s table doesn\'t open with the Overview\'s editor');
  s.click('Overview', { within: 'Objective sections' });
  s.ok(s.has('New value for ' + NAME, R), 'back on the Overview it is still open');
  s.key('New value for ' + NAME, 'Escape', R);
  s.click('Key results', { within: 'Objective sections' });
  s.click('Post a reading for ' + NAME);
  s.click('Overview', { within: 'Objective sections' });
  s.ok(!s.has('New value for ' + NAME, R) && s.has('Post a reading for ' + NAME, R), 'nor the Overview with the tab\'s');
  s.c.setState({ kpi_ed: null }); s.render();
  /* read-only: the values are plain text; a statistical KPI's readings can still be read */
  s.c.setState({ ro: true }); s.render();
  s.ok(!s.has('Post a reading for ' + NAME, R), 'no posting in read-only');
  s.eq('the value stays', kid(SALES ? 'KPI-BD-2026Q4-01-2-1' : 'KPI-EL-2026Q4-01-3-1').barValStatic, true);
  if (!SALES) {
    s.click('Readings for Cell voltage at 2 A/cm²', Object.assign({ tag: 'button' }, R));
    s.ok(!s.has('Add reading', R) && s.has('Read-only view — editing is disabled.', R), 'readings to look at, nothing to add');
  }
  s.clean('apart');
});

s.step('an ended objective: unfinished gates are cancelled and get their own chip', () => {
  fresh();
  s.c.mutate((D) => { D.docs[s.c.ctx.docKey].objectiveState.push({ objectiveId: DEF_OBJ, status: 'abandoned', endedDay: TD, note: '' }); });
  s.flush(0);
  const gs = items().filter((x) => x.type === 'gate');
  s.ok(gs.filter((x) => x.status !== 'done').every((x) => x.status === 'cancelled' && x.row.note === 'Cancelled when the objective ended.'), 'unfinished gates cancelled');
  const n = gs.filter((x) => x.status === 'cancelled').length;
  s.eq('a Cancelled chip with their count', V().chips.map((c) => c.label + ' ' + c.count).pop(), 'Cancelled ' + n);
  s.click(chip('Cancelled'));
  s.eq('it filters like the others', shown().map((r) => r.stWord).filter((w, i, a) => a.indexOf(w) === i), ['Cancelled']);
  s.clean('ended');
});

/* ======================================================================== 7. empty, read-only */
s.step('an objective with nothing yet: each section says what to add; Add key result opens the sheet', () => {
  fresh();
  const o = SALES ? 'OBJ-BD-2027Q1-01' : 'OBJ-EL-2027Q1-01';
  nav({ objId: o, tab: 'overview' });
  s.eq('nothing to count', [V().summary, V().allLabel], ['0 items: no key results, no stage-gates, no kanban tiles and no risks', 'All 0']);
  s.expect('No key results yet. Without one the objective has no score.');
  s.expect('No stage-gates yet. Add the checkpoints this objective has to clear on the Stage-gates tab.');
  s.expect('No kanban board yet. Add one on the Kanban tab to track work through stages.');
  s.expect('No FMEA problems yet. Add one on the Risks tab and its worst open cause shows here.');
  s.eq('no bars without items', V().groups.map((g) => g.hasBar), [false, false, false, false]);
  s.click('Add key result', { within: 'review' });
  s.eq('the key result sheet opens for this objective', [s.c.sheet() && s.c.sheet().kind, s.c.sheet() && s.c.sheet().data.objId], ['kr.edit', o]);
  s.c.closeAllSheets(); s.render();
  s.clean('empty');
});

s.step('read-only: every view and link still works, nothing to add', () => {
  fresh();
  s.c.setState({ ro: true }); s.render();
  s.click('~Needs attention');
  s.click('Status', { within: 'Group rows by' });
  s.eq('filters and grouping are views', [s.c.state.review_sel, s.c.state.review_gb], [['off', 'risk'], 'status']);
  const it = items().find((x) => x.type === 'gate');
  s.c.setState({ review_sel: [] }); s.render();
  s.click(link(it.row.name));
  s.eq('links open the tab', s.c.state.tab, 'gates');
  s.eq('nothing was saved', toasts().filter((t) => /Read-only/.test(t)).length, 0);
  const o = SALES ? 'OBJ-BD-2027Q1-01' : 'OBJ-EL-2027Q1-01';
  nav({ objId: o, tab: 'overview' });
  s.ok(!s.has('Add key result', { within: 'review' }), 'no Add key result in read-only');
  s.clean('read-only');
});

/* ======================================================================== 8. the Overview around it */
s.step('the Overview: review, then Latest readings, Current step and Initiative metrics; no old cards', () => {
  fresh();
  const three = s.all((el) => el.attrs && el.attrs.class === 'ov-three')[0];
  s.eq('the cards side by side (Sales: no Current step since November 3)', three.kids.filter((k) => k.attrs && k.attrs['data-k']).map((k) => k.attrs['data-k']), SALES ? ['kpi-latest', 'initm'] : ['kpi-latest', 'ov-step', 'initm']);
  ['Key results summary', 'Stage-gates summary', 'Open high risks', 'Open key results', 'Review risks'].forEach((t) => s.ok(!s.has(t), 'gone: ' + t));
  s.eq('state keys start clean', [s.c.state.review_sel, s.c.state.review_q, s.c.state.review_gb], [[], '', 'type']);
  s.clean('overview');
});

/* ---- every handler in mods/review/*.html was used by the steps above ---- */
s.step('every handler site in mods/review fired', () => {
  const sites = [];
  (function walk(n) {
    if (n.attrs) Object.keys(n.attrs).forEach((k) => {
      if (!k.startsWith('on')) return;
      const hit = s.parsed.srcmap && s.parsed.srcmap[n.line];
      if (hit && /^mods\/review\//.test(hit[0])) sites.push({ key: k.toLowerCase() + '@' + n.line, what: k + ' <' + n.tag + '> ' + hit[0] + ':' + hit[1] });
    });
    (n.kids || []).forEach(walk);
  })(s.parsed.tree);
  s.ok(sites.length >= 15, 'found the review handlers: ' + sites.length);
  s.eq('not fired', sites.filter((x) => !fired.has(x.key)).map((x) => x.what), []);
});

done();
