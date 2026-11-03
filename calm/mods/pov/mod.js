/* ============================================================================
   pov: the Overview. Company score, units and division cards, the active work
   of this quarter grouped by product (model, objective and milestone tiles),
   and the detail sheet (pov.detail) for an objective, milestone, model or
   division. Numbers come straight from the engine, like today's Overview.
   ========================================================================== */
const POV_GATE = { passed: ['ok', 'Passed'], 'passed-late': ['warn', 'Passed late'], overdue: ['bad', 'Overdue'], pending: ['none', 'Pending'] };

function povNum(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object' && v.lo != null && v.hi != null) return povNum(v.lo) + ' to ' + povNum(v.hi);
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return (Math.abs(n) >= 100 || Number.isInteger(n)) ? String(Math.round(n)) : String(Math.round(n * 100) / 100);
}
function povUnit(u) { return u ? (/^(%|°)/.test(u) ? '' : ' ') + u : ''; }
function povTgt(k, tv, unit) {
  if (tv == null) return '—';
  if (k.direction === 'range' || (typeof tv === 'object')) return povNum(tv) + povUnit(unit);
  return (k.direction === 'down' ? '≤ ' : '≥ ') + povNum(tv) + povUnit(unit);
}
function povKpiRow(k, pool, em) {
  const sc = RD.kpiScoreResolved(k, pool, em);
  const u = RD.kpiUnit(k, pool) || k.unit || '';
  const tv = RD.effTarget(k, pool, em), cv = RD.effValue(k, pool, em);
  return { name: k.name || k.id, tgt: povTgt(k, tv, u), cur: cv != null ? povNum(cv) + povUnit(u) : '—', dotCls: 'dot ' + F.tone(PLAN.tone(RD.band(sc))), curCls: 'pov-kcur tx-' + PLAN.tone(RD.band(sc)), score: sc };
}
function povKrRows(objId, doc, pool, em) {
  return (doc.keyResults || []).filter((k) => k.objectiveId === objId).map((kr) => {
    const sc = RD.keyResultScore(kr.id, em);
    const kk = (doc.kpis || []).filter((k) => k.hostType === 'keyResult' && k.hostId === kr.id)[0];
    let tgt = '—', cur = '—';
    if (kk) { const r = povKpiRow(kk, pool, em); tgt = r.tgt; cur = r.cur; }
    const t = PLAN.tone(RD.band(sc));
    return { name: kr.statement || kr.id, tgt: tgt, cur: cur, dotCls: 'dot ' + F.tone(t), curCls: 'pov-kcur tx-' + t };
  });
}
/* milestone KPIs: the targets defined here in Planning (portfolio) plus any in the division's doc */
function povMsKpis(P, doc, msId) {
  return (P.kpis || []).concat((doc && doc.kpis) || []).filter((k) => k.hostType === 'milestone' && k.hostId === msId);
}
function povGState(g, today) { const st = RD.classifyGate(g, today); return (st === 'passed' || st === 'passed-late' || st === 'overdue') ? st : 'pending'; }
function povGateDots(gates, today) {
  return gates.map((g, i) => {
    const st = povGState(g, today), v = POV_GATE[st];
    const done = st === 'passed' || st === 'passed-late';
    return { cls: 'pov-gd ' + F.tone(v[0]), done: done, inner: done ? '' : String(i + 1), title: (g.name || g.id) + ': ' + v[1].toLowerCase() };
  });
}
function povObjProd(P, o) {
  const c = RD.effClass(o, P);
  const ini = PLAN.byId(P, 'initiative', o.initiativeId);
  const mid = c.kind === 'model' ? c.modelId : (ini && ini.modelId) || null;
  if (mid) { const m = PLAN.byId(P, 'model', mid); if (m) return m.productId || null; }
  if (c.kind === 'product') return c.productId;
  return (ini && ini.productId) || null;
}
function povMsProd(P, ms) {
  const i = PLAN.byId(P, 'initiative', ms.initiativeId);
  if (i && i.modelId) { const m = PLAN.byId(P, 'model', i.modelId); if (m) return m.productId || null; }
  return (i && i.productId) || null;
}
function povMsDiv(P, ms) { const i = PLAN.byId(P, 'initiative', ms.initiativeId); return (i && i.divisionId) || null; }
function povWorstSlip(P, divId, casc) {
  let w = null;
  (P.initiatives || []).filter((i) => i.divisionId === divId).forEach((i) => {
    if (i.plannedEnd == null) return;
    const s = casc.longTermSlip[i.id];
    if (s != null && isFinite(s)) w = w == null ? s : Math.max(w, s);
  });
  return w;
}
function povSlipText(w) {
  if (w == null) return { text: 'No schedule data', cls: 'sub' };
  if (w <= 0) return { text: 'No initiative is slipping', cls: 'sub tx-ok' };
  return { text: 'Worst initiative slip: ' + F.plural(Math.round(w), 'day'), cls: 'sub tx-bad' };
}
function povCounts(P, divId, em) {
  const c = { 'on-track': 0, 'at-risk': 0, 'off-track': 0, 'no-band': 0 };
  (P.objectives || []).filter((o) => o.divisionId === divId).forEach((o) => { c[RD.band(RD.objectiveScore(o.id, em))]++; });
  return c;
}
function povMix(c) {
  return [['on-track', 'ok', 'on track'], ['at-risk', 'warn', 'at risk'], ['off-track', 'bad', 'off track'], ['no-band', 'none', 'no score']].map((x) => ({ n: String(c[x[0]]), cls: 'st ' + F.tone(x[1]), label: c[x[0]] + ' ' + x[2] }));
}
function povModelSpecs(D, m) {
  const P = D.portfolio, p = PLAN.byId(P, 'product', m.productId);
  const sd = p ? (D.spec || {})['SPEC-' + p.divisionId] : null;
  if (!sd) return { specs: [], comps: [], subs: [] };
  const sm = D.spec || {};
  const specs = (sd.keyResults || []).filter((k) => k.objectiveId === m.id).map((sp) => { const sc = RD.keyResultScore(sp.id, sm); return { name: sp.statement || sp.id, score: F.score(sc), dotCls: 'dot ' + F.tone(PLAN.tone(RD.band(sc))), scoreCls: 'num strong tx-' + PLAN.tone(RD.band(sc)) }; });
  const comps = [], subs = [];
  (sd.stageGates || []).filter((g) => g.objectiveId === m.id).forEach((g) => {
    if (g.refModel) { const rc = pedModelConf(D, g.refModel); const rm = PLAN.byId(P, 'model', g.refModel); subs.push({ name: g.name || (rm ? rm.name : g.id), score: rc != null ? Math.round(rc) + '%' : '—', scoreCls: 'num strong tx-' + PLAN.tone(RD.band(rc)) }); }
    else { const sc = RD.stageGateScore(g.id, sm); comps.push({ name: g.name || g.id, score: F.score(sc), dotCls: 'dot ' + F.tone(PLAN.tone(RD.band(sc))), scoreCls: 'num strong tx-' + PLAN.tone(RD.band(sc)) }); }
  });
  return { specs: specs, comps: comps, subs: subs };
}
function povQuarterScores(ctx, axis, id) {
  return PLAN.quarters(ctx.P).map((q) => [q, RD.sliceScore(axis, id, ctx.P, ctx.em, q)]).filter((x) => x[1] != null)
    .map((x) => ({ q: F.q(x[0]), score: F.score(x[1]), cls: 'num strong tx-' + PLAN.tone(RD.band(x[1])) }));
}
function povOpen(C, type, id) { return () => C.openSheet('pov.detail', { type: type, id: id }, {}); }
function povKey(fn) { return (e) => { if (e && (e.key === 'Enter' || e.key === ' ')) { if (e.preventDefault) e.preventDefault(); fn(); } }; }

function povModelTile(C, ctx, m) {
  const D = C.D;
  const conf = pedModelConf(D, m.id);
  const sp = povModelSpecs(D, m);
  const roll = RD.sliceScore('model', m.id, ctx.P, ctx.em, null);
  const meta = pedSpecMeta(D, m.id);
  const open = povOpen(C, 'model', m.id);
  const t = PLAN.tone(RD.band(conf));
  return {
    id: m.id, prod: PLAN.nameOf(PLAN.byId(ctx.P, 'product', m.productId)), name: m.name || m.id,
    maturity: meta.maturity || '', hasMaturity: !!meta.maturity,
    conf: conf != null ? Math.round(conf) + '%' : '—', confCls: 'pov-conf tx-' + t, barCls: 'pov-bar ' + F.tone(t),
    specs: sp.specs, hasSpecs: sp.specs.length > 0, noSpecs: !sp.specs.length,
    parts: F.plural(sp.comps.length, 'component') + ', ' + F.plural(sp.subs.length, 'sub-product'),
    rollup: 'Overall ' + F.score(roll), rollCls: 'strong tx-' + PLAN.tone(RD.band(roll)),
    qs: povQuarterScores(ctx, 'model', m.id),
    open: open, key: povKey(open), aria: 'Open details for model ' + (m.name || m.id)
  };
}
function povObjTile(C, ctx, o, casc) {
  const P = ctx.P, em = ctx.em, today = ctx.today;
  const doc = ctx.docOf(o.divisionId) || { keyResults: [], kpis: [], stageGates: [] };
  const score = RD.rollupObjective(o.id, P, em);
  const b = RD.band(score), t = PLAN.tone(b);
  const gates = (doc.stageGates || []).filter((g) => g.objectiveId === o.id);
  const gp = gates.filter((g) => { const st = RD.classifyGate(g, today); return st === 'passed' || st === 'passed-late'; }).length;
  const behind = gates.filter((g) => RD.classifyGate(g, today) === 'overdue').length;
  const pe = casc.objectiveProjectedEnd[o.id];
  const end = o.plannedEnd != null ? (pe != null ? pe : o.plannedEnd) : pe;
  const dl = end != null && isFinite(end) ? end - today : null;
  const es = ctx.objEnd(o);
  const sub = es ? 'Ended ' + F.dayY(es.endedDay) : dl == null ? 'No planned end' : dl < 0 ? F.plural(-dl, 'day') + ' overdue' : dl === 0 ? 'Due today' : F.plural(dl, 'day') + ' left';
  const slip = !es && o.plannedEnd != null && end != null && isFinite(end) ? end - o.plannedEnd : null;
  const groups = pedGateGroups(doc, o.id).filter((g) => g.gates.length);
  const open = povOpen(C, 'objective', o.id);
  return {
    id: o.id, name: o.statement || o.id, sub: sub, subCls: dl != null && dl < 0 && !es ? 'sub tx-bad' : 'sub',
    hasSlip: slip != null && slip > 0, slip: slip != null && slip > 0 ? F.plural(slip, 'day') + ' slip' : '',
    hasEnd: !!es, endText: es ? (es.status === 'abandoned' ? 'Abandoned' : 'Achieved') : '', endCls: 'st ' + (es && es.status === 'abandoned' ? 't-bad' : 't-ok'),
    stCls: 'st ' + F.tone(t), word: PLAN.word(b), score: F.score(score), scoreCls: 'pov-score tx-' + t,
    krs: povKrRows(o.id, doc, ctx.pool, em), hasKrs: (doc.keyResults || []).some((k) => k.objectiveId === o.id),
    pct: score == null ? '0%' : Math.round(K.clamp(score, 0, 100)) + '%',
    fill: 'width: ' + (score == null ? 0 : Math.round(K.clamp(score, 0, 100))) + '%', fillCls: 'fill ' + F.tone(t),
    hasGates: gates.length > 0, gates: 'Gates ' + gp + ' of ' + gates.length + ' passed', hasBehind: behind > 0, behind: behind + ' behind',
    lanes: groups.map((g, gi) => ({ hasLabel: groups.length > 1, label: String.fromCharCode(65 + gi), title: g.set.name || 'Set', dots: povGateDots(g.gates, today) })),
    barCls: 'pov-bar ' + F.tone(t),
    open: open, key: povKey(open), aria: 'Open details for ' + (o.statement || o.id)
  };
}
function povMsTile(C, ctx, m, casc) {
  const P = ctx.P, em = ctx.em;
  const doc = ctx.docOf(povMsDiv(P, m));
  const achieved = RD.milestoneAchieved(m, em);
  const score = achieved ? 100 : RD.milestoneScore(m.id, em);
  const b = RD.band(score), t = PLAN.tone(b);
  const kpis = povMsKpis(P, doc, m.id).map((k) => povKpiRow(k, ctx.pool, em));
  const eff = casc.milestoneEffective ? casc.milestoneEffective[m.id] : null;
  const slip = !achieved && m.plannedDate != null && eff != null && isFinite(eff) ? eff - m.plannedDate : null;
  const sub = achieved ? (m.completedDate != null ? 'Done ' + F.dayY(m.completedDate) : 'Achieved') : (slip != null && slip > 0) ? 'Est ' + F.dayY(eff) : (m.plannedDate != null ? 'Due ' + F.dayY(m.plannedDate) : 'No planned date');
  const open = povOpen(C, 'milestone', m.id);
  return {
    id: m.id, name: m.name || m.id, sub: sub,
    hasSlip: slip != null && slip > 0, slip: slip != null && slip > 0 ? F.plural(slip, 'day') + ' slip' : '',
    stCls: 'st ' + F.tone(t), word: achieved ? 'Achieved' : PLAN.word(b), score: F.score(score), scoreCls: 'pov-score tx-' + t,
    kpis: kpis, hasKpis: kpis.length > 0,
    pct: score == null ? '0%' : Math.round(K.clamp(score, 0, 100)) + '%',
    fill: 'width: ' + (score == null ? 0 : Math.round(K.clamp(score, 0, 100))) + '%', fillCls: 'fill ' + F.tone(t),
    barCls: 'pov-bar ' + F.tone(t),
    open: open, key: povKey(open), aria: 'Open details for milestone ' + (m.name || m.id)
  };
}
function povDivCard(C, ctx, d, casc) {
  const P = ctx.P, em = ctx.em;
  const overall = RD.rollupDivision(d.id, P, em);
  const t = PLAN.tone(RD.band(overall));
  const qCells = RD.boundsOf('division', d.id, P).map((q) => { const s = RD.score('division', d.id, P, em, q); return { q: F.q(q), score: F.score(s), cls: 'num strong tx-' + PLAN.tone(RD.band(s)) }; });
  const nObj = (P.objectives || []).filter((o) => o.divisionId === d.id).length;
  const nMs = (P.milestones || []).filter((m) => povMsDiv(P, m) === d.id).length;
  const slip = povSlipText(povWorstSlip(P, d.id, casc));
  const open = povOpen(C, 'division', d.id);
  return {
    id: d.id, name: d.name || d.id, score: F.score(overall), scoreCls: 'pov-big tx-' + t, stCls: 'st ' + F.tone(t), word: PLAN.word(RD.band(overall)),
    qs: qCells, hasQs: qCells.length > 0, noQs: !qCells.length,
    meta: F.plural(nObj, 'objective') + ', ' + F.plural(nMs, 'milestone'),
    mix: povMix(povCounts(P, d.id, em)),
    slip: slip.text, slipCls: slip.cls,
    kind: RD.divisionKind(d) === 'biz' ? 'Business' : 'R&D',
    open: open, key: povKey(open), aria: 'Open details for ' + (d.name || d.id)
  };
}
function povActive(C, ctx, divs, casc) {
  const P = ctx.P, em = ctx.em;
  const activeObjs = (P.objectives || []).filter((o) => ctx.isActiveObj(o) && ctx.objMatch(o));
  const activeMs = (P.milestones || []).filter((m) => ctx.isActiveMs(m) && ctx.msMatch(m));
  const out = [];
  divs.forEach((d) => {
    const dObjs = activeObjs.filter((o) => o.divisionId === d.id);
    const dMs = activeMs.filter((m) => povMsDiv(P, m) === d.id);
    const dProdIds = (P.products || []).filter((p) => p.divisionId === d.id && ctx.prodShows(p)).map((p) => p.id);
    if (!dObjs.length && !dMs.length && !dProdIds.length) return;
    const own = (pid) => pid != null && dProdIds.indexOf(pid) >= 0;
    const objProd = (o) => povObjProd(P, o) || null;
    const msProd = (m) => povMsProd(P, m) || null;
    const prodIds = dProdIds.slice();
    dObjs.forEach((o) => { const p = objProd(o); if (p && prodIds.indexOf(p) < 0) prodIds.push(p); });
    dMs.forEach((m) => { const p = msProd(m); if (p && prodIds.indexOf(p) < 0) prodIds.push(p); });
    if (dObjs.some((o) => objProd(o) == null) || dMs.some((m) => msProd(m) == null)) prodIds.push(null);
    const pname = (pid) => PLAN.nameOf(PLAN.byId(P, 'product', pid));
    prodIds.sort((a, b) => {
      if (!a && b) return 1;
      if (a && !b) return -1;
      const fa = !own(a), fb = !own(b);
      if (fa !== fb) return fa ? 1 : -1;
      return String(pname(a) || '').localeCompare(String(pname(b) || ''));
    });
    const blocks = [];
    prodIds.forEach((pid) => {
      const rank = (o) => { const s = RD.rollupObjective(o.id, P, em); return s == null ? 101 : s; };
      const objs = dObjs.filter((o) => objProd(o) === pid).sort((a, b) => rank(a) - rank(b));
      const mss = dMs.filter((m) => msProd(m) === pid);
      const foreign = pid != null && !own(pid);
      if (!objs.length && !mss.length && (pid == null || foreign)) return;
      const models = pid && !foreign ? PLAN.byOrder((P.models || []).filter((m) => m.productId === pid)) : [];
      const p = pid ? PLAN.byId(P, 'product', pid) : null;
      blocks.push({
        label: pid ? (foreign ? PLAN.divCode(p ? p.divisionId : '') + ' — ' : '') + (p ? p.name : pid) : 'Unclassified',
        borrowed: foreign,
        models: models.map((m) => povModelTile(C, ctx, m)), hasModels: models.length > 0,
        objs: objs.map((o) => povObjTile(C, ctx, o, casc)), hasObjs: objs.length > 0,
        mss: mss.map((m) => povMsTile(C, ctx, m, casc)), hasMss: mss.length > 0
      });
    });
    out.push({ id: d.id, name: d.name || d.id, blocks: blocks });
  });
  return out;
}

/* ---------------------------------------------------------------- detail sheet */
function povRisks(doc, objId) {
  const rows = [];
  ((doc && doc.risks) || []).filter((r) => r.objectiveId === objId).forEach((r) => {
    (r.modes || []).forEach((m) => (m.effects || []).forEach((e) => (e.causes || []).forEach((c) => {
      const s = Number(c.severity) || 0, o = Number(c.occurrence) || 0, d = Number(c.detection) || 0;
      rows.push({ mode: m.mode || r.problem || '—', s: s, o: o, d: d, rpn: s * o * d });
    })));
  });
  return rows.sort((a, b) => b.rpn - a.rpn);
}
function povRpnTone(r) { const b = RD.rpnBand(r); return b === 'high' ? 'bad' : b === 'med' ? 'warn' : 'ok'; }
function povDetailVM(C, ctx, s) {
  const P = ctx.P, D = C.D, em = ctx.em, pool = ctx.pool, today = ctx.today;
  const type = s.data.type, id = s.data.id;
  const casc = ctx.casc();
  const blank = { type: type, title: '', sub: '', badges: [], isObj: false, isMs: false, isModel: false, isDiv: false, missing: false,
    canEdit: !ctx.ro, edit: () => PED.open(C, ctx, type, id), editLabel: 'Edit ' + type, lineage: () => PED.lineage(C, ctx, type, id),
    hasApp: false, appHref: 'Main.dc.html', appLabel: '', openApp: null, hasSpec: false, openSpec: null, hasReport: false, report: null, reportLabel: '' };
  const rec = PLAN.byId(P, type, id);
  if (!rec) return Object.assign(blank, { missing: true, title: 'Not found', canEdit: false });
  const badge = (text, tone) => ({ text: text, cls: tone ? 'st ' + F.tone(tone) : 'tag', isSt: !!tone, isTag: !tone });
  if (type === 'objective') {
    const doc = ctx.docOf(rec.divisionId) || { keyResults: [], kpis: [], stageGates: [], risks: [] };
    const score = RD.rollupObjective(rec.id, P, em);
    const es = ctx.objEnd(rec);
    const badges = [];
    if (es) badges.push(badge(es.status === 'abandoned' ? 'Abandoned' : 'Achieved', es.status === 'abandoned' ? 'bad' : 'ok'));
    badges.push(badge(PLAN.word(RD.band(score)) + (score != null ? ', ' + F.score(score) : ''), PLAN.tone(RD.band(score))));
    badges.push(badge(PLAN.nameOf(PLAN.byId(P, 'product', povObjProd(P, rec))) === '(missing)' ? 'No product' : PLAN.nameOf(PLAN.byId(P, 'product', povObjProd(P, rec)))));
    const gates = (doc.stageGates || []).filter((g) => g.objectiveId === rec.id);
    const gp = gates.filter((g) => { const st = RD.classifyGate(g, today); return st === 'passed' || st === 'passed-late'; }).length;
    const groups = pedGateGroups(doc, rec.id).filter((g) => g.gates.length);
    const gateRows = [];
    groups.forEach((g, gi) => {
      if (groups.length > 1) gateRows.push({ isSet: true, isGate: false, label: String.fromCharCode(65 + gi) + '. ' + (g.set.name || 'Set') });
      g.gates.forEach((gt, i) => {
        const st = povGState(gt, today), v = POV_GATE[st];
        const kk = (doc.kpis || []).filter((x) => x.hostType === 'stageGate' && x.hostId === gt.id)[0];
        let kpi = '';
        if (kk) { const r = povKpiRow(kk, pool, em); kpi = (kk.name || '') + ': ' + r.cur + ' against ' + r.tgt; }
        gateRows.push({ isSet: false, isGate: true, label: gt.name || gt.id, dot: 'pov-gd ' + F.tone(v[0]), done: st === 'passed' || st === 'passed-late', inner: (st === 'passed' || st === 'passed-late') ? '' : String(i + 1), stCls: 'st ' + F.tone(v[0]), state: v[1], kpi: kpi, hasKpi: !!kpi, date: gt.plannedDate != null ? F.dayAuto(gt.plannedDate, today) : '' });
      });
    });
    const risks = povRisks(doc, rec.id);
    const nHigh = risks.filter((x) => x.rpn >= 200).length, nMed = risks.filter((x) => x.rpn >= 100 && x.rpn < 200).length;
    const maxR = risks.length ? risks[0].rpn : 0;
    const pe = rec.plannedEnd != null ? (casc.objectiveProjectedEnd[rec.id] != null ? casc.objectiveProjectedEnd[rec.id] : rec.plannedEnd) : casc.objectiveProjectedEnd[rec.id];
    const late = pe != null && rec.plannedEnd != null && pe > rec.plannedEnd;
    const app = ctx.appOf(rec.divisionId);
    return Object.assign(blank, {
      isObj: true, title: rec.statement || rec.id, sub: 'Objective, ' + (rec.quarter ? F.q(rec.quarter) : 'no quarter'), badges: badges,
      krs: povKrRows(rec.id, doc, pool, em), hasKrs: (doc.keyResults || []).some((k) => k.objectiveId === rec.id),
      gateHead: 'Stage-gates, ' + gp + ' of ' + gates.length + ' passed', hasGates: gates.length > 0, gateRows: gateRows,
      health: (function () { const h = RD.objectiveGateReadiness(rec.id, em, today); return h == null ? '' : 'Weakest workstream: ' + Math.round(h) + '% of its gates passed'; })(),
      hasRisks: risks.length > 0,
      riskSum: F.plural(risks.length, 'risk') + ', highest RPN ' + maxR + (nHigh ? ', ' + nHigh + ' high' : '') + (nMed ? ', ' + nMed + ' medium' : ''),
      risks: risks.slice(0, 8).map((x) => ({ mode: x.mode, s: String(x.s), o: String(x.o), d: String(x.d), rpn: String(x.rpn), cls: 'pov-rpn ' + F.tone(povRpnTone(x.rpn)) })),
      sched: [
        { k: 'Planned end', v: rec.plannedEnd != null ? F.dayY(rec.plannedEnd) : '—', cls: '' },
        { k: 'Projected end', v: pe != null && isFinite(pe) ? F.dayY(pe) : '—', cls: late ? 'tx-bad strong' : '' },
        { k: 'Score', v: F.score(score), cls: 'strong tx-' + PLAN.tone(RD.band(score)) }
      ],
      hasApp: true, appHref: app === 'sales' ? 'Sales-A.dc.html' : 'Main.dc.html', appLabel: app === 'sales' ? 'Open in Sales' : 'Open in Execution',
      openApp: () => C.handoff({ app: app, objective: rec.id })
    });
  }
  if (type === 'milestone') {
    const doc = ctx.docOf(povMsDiv(P, rec));
    const achieved = RD.milestoneAchieved(rec, em);
    const score = achieved ? 100 : RD.milestoneScore(rec.id, em);
    const st = PLAN.msState(P, rec.id);
    const paused = !achieved && !!(st && (st.status === 'paused' || st.status === 'deprioritized'));
    const kpis = povMsKpis(P, doc, rec.id).map((k) => povKpiRow(k, pool, em));
    const eff = casc.milestoneEffective[rec.id];
    const pn = PLAN.byId(P, 'product', povMsProd(P, rec));
    const hasPms = typeof PMS !== 'undefined' && PMS && typeof PMS.openReport === 'function';
    return Object.assign(blank, {
      isMs: true, title: rec.name || rec.id, sub: 'Milestone, ' + PLAN.nameOf(PLAN.byId(P, 'initiative', rec.initiativeId)),
      badges: [badge(achieved ? 'Achieved' : paused ? (st.status === 'paused' ? 'Paused' : 'Deprioritized') : PLAN.word(RD.band(score)), achieved ? 'ok' : paused ? 'none' : PLAN.tone(RD.band(score))), badge(pn ? pn.name : 'No product')],
      kpis: kpis, hasKpis: kpis.length > 0, noKpis: !kpis.length,
      sched: [
        { k: 'Planned', v: rec.plannedDate != null ? F.dayY(rec.plannedDate) : '—', cls: '' },
        { k: 'Projected', v: eff != null && isFinite(eff) ? F.dayY(eff) : (paused ? 'Not projected while paused' : '—'), cls: eff != null && rec.plannedDate != null && eff > rec.plannedDate && !achieved ? 'tx-bad strong' : '' },
        { k: 'Status', v: achieved ? 'Achieved' : paused ? (st.status === 'paused' ? 'Paused' : 'Deprioritized') : PLAN.word(RD.band(score)), cls: '' }
      ],
      hasReport: true, reportLabel: rec.milestoneReport ? 'Open report' : 'Create report',
      report: () => { if (hasPms) PMS.openReport(C, ctx, rec.id); else { C.setState({ tab: 'milestones', sheets: [] }); C.toast('Reports open from the Milestones tab.', 'info'); } }
    });
  }
  if (type === 'model') {
    const conf = pedModelConf(D, rec.id);
    const meta = pedSpecMeta(D, rec.id);
    const sp = povModelSpecs(D, rec);
    const roll = RD.sliceScore('model', rec.id, P, em, null);
    const badges = [badge(PLAN.nameOf(PLAN.byId(P, 'product', rec.productId)))];
    if (meta.maturity) badges.push(badge(meta.maturity));
    return Object.assign(blank, {
      isModel: true, title: rec.name || rec.id, sub: 'Model', badges: badges,
      specHead: 'Product specifications' + (conf != null ? ', ' + Math.round(conf) + '% conformance' : ''),
      specs: sp.specs, hasSpecs: sp.specs.length > 0, noSpecs: !sp.specs.length,
      comps: sp.comps, hasComps: sp.comps.length > 0, subs: sp.subs, hasSubs: sp.subs.length > 0,
      rollup: 'Overall ' + F.score(roll), rollCls: 'strong tx-' + PLAN.tone(RD.band(roll)), qs: povQuarterScores(ctx, 'model', rec.id),
      hasSpec: true, openSpec: () => C.handoff({ app: 'spec', model: rec.id })
    });
  }
  if (type === 'division') {
    const overall = RD.rollupDivision(rec.id, P, em);
    const c = povCounts(P, rec.id, em);
    const worst = povWorstSlip(P, rec.id, casc);
    const nObj = (P.objectives || []).filter((o) => o.divisionId === rec.id).length;
    const nMs = (P.milestones || []).filter((m) => povMsDiv(P, m) === rec.id).length;
    const aObj = (P.objectives || []).filter((o) => o.divisionId === rec.id && ctx.isActiveObj(o)).length;
    const aMs = (P.milestones || []).filter((m) => povMsDiv(P, m) === rec.id && ctx.isActiveMs(m)).length;
    const delayed = (P.initiatives || []).filter((i) => i.divisionId === rec.id && i.plannedEnd != null)
      .map((i) => ({ i: i, slip: casc.longTermSlip[i.id], pe: casc.initiativeProjectedEnd[i.id] }))
      .filter((r) => r.slip != null && isFinite(r.slip) && r.slip > 0)
      .sort((a, b) => b.slip - a.slip).slice(0, 3)
      .map((r) => ({ name: r.i.name || r.i.id, due: 'Due ' + F.dayY(r.i.plannedEnd), slip: '+' + F.plural(Math.round(r.slip), 'day'), to: r.pe != null && isFinite(r.pe) ? 'Now ' + F.dayY(r.pe) : '' }));
    const models = PLAN.byOrder((P.models || []).filter((m) => { const p = PLAN.byId(P, 'product', m.productId); return p && p.divisionId === rec.id; })).map((m) => {
      const r = RD.sliceScore('model', m.id, P, em, null), cf = pedModelConf(D, m.id);
      return { name: PLAN.nameOf(PLAN.byId(P, 'product', m.productId)) + ', ' + m.name, rollup: 'Rollup ' + F.score(r), rollCls: 'strong tx-' + PLAN.tone(RD.band(r)), conf: 'Conformance ' + (cf != null ? Math.round(cf) + '%' : '—') };
    });
    return Object.assign(blank, {
      isDiv: true, title: rec.name || rec.id, sub: 'Division, ' + rec.id, badges: [badge(PLAN.word(RD.band(overall)), PLAN.tone(RD.band(overall)))],
      sum: [
        { k: 'Overall', v: F.score(overall) + ', ' + PLAN.word(RD.band(overall)).toLowerCase(), cls: 'strong tx-' + PLAN.tone(RD.band(overall)) },
        { k: 'Active now', v: F.plural(aObj, 'objective') + ', ' + F.plural(aMs, 'milestone'), cls: '' },
        { k: 'In the plan', v: F.plural(nObj, 'objective') + ', ' + F.plural(nMs, 'milestone'), cls: '' },
        { k: 'Status mix', v: c['on-track'] + ' on track, ' + c['at-risk'] + ' at risk, ' + c['off-track'] + ' off track, ' + c['no-band'] + ' no score', cls: '' },
        { k: 'Worst slip', v: worst == null ? '—' : worst <= 0 ? 'None' : '+' + F.plural(Math.round(worst), 'day'), cls: worst != null && worst > 0 ? 'tx-bad strong' : '' }
      ],
      delayed: delayed, hasDelayed: delayed.length > 0, noDelayed: !delayed.length,
      models: models, hasModels: models.length > 0
    });
  }
  return Object.assign(blank, { missing: true, title: 'Not found', canEdit: false });
}

/* today's unreachable slicesHtml: product / model conformance and objective rollups, overall and per quarter */
function povSlices(C, ctx) {
  const P = ctx.P, D = C.D, em = ctx.em;
  const qs = PLAN.quarters(P);
  const cell = (v, pct) => ({ v: v == null ? '—' : Math.round(v) + (pct ? '%' : ''), cls: 'num strong tx-' + PLAN.tone(RD.band(v)) });
  const rows = [];
  PLAN.byOrder((P.products || []).filter(ctx.prodShows)).forEach((p) => {
    const ms = (P.models || []).filter((m) => m.productId === p.id);
    const confs = ms.map((m) => pedModelConf(D, m.id)).filter((v) => v != null);
    const pc = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
    rows.push({ isProd: true, name: p.name || p.id, id: p.id, maturity: '', hasMaturity: false, conf: cell(pc, true), overall: cell(RD.sliceScore('product', p.id, P, em, null)), qs: qs.map((q) => cell(RD.sliceScore('product', p.id, P, em, q))) });
    PLAN.byOrder(ms).forEach((m) => {
      const meta = pedSpecMeta(D, m.id);
      rows.push({ isProd: false, name: m.name || m.id, id: m.id, maturity: meta.maturity || '', hasMaturity: !!meta.maturity, conf: cell(pedModelConf(D, m.id), true), overall: cell(RD.sliceScore('model', m.id, P, em, null)), qs: qs.map((q) => cell(RD.sliceScore('model', m.id, P, em, q))) });
    });
  });
  return { heads: qs.map((q) => ({ q: F.q(q) })), rows: rows, has: rows.length > 0, none: !rows.length };
}

MODS.pov = {
  state: {},
  vm(C, ctx) {
    const s = C.sheet();
    const detail = s && s.kind === 'pov.detail' ? povDetailVM(C, ctx, s) : null;
    if (ctx.tab !== 'overview') return { detail: detail };
    const P = ctx.P, em = ctx.em;
    const casc = ctx.casc();
    const comp = RD.rollupCompany(P, em);
    const ct = PLAN.tone(RD.band(comp));
    const divs = (P.divisions || []).filter(ctx.divShows);
    const unitOrder = (P.units || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const seen = unitOrder.map((u) => u.id);
    divs.forEach((d) => { const u = d.unitId || null; if (u && seen.indexOf(u) < 0) seen.push(u); });
    const units = [];
    const section = (uid, label) => {
      const dvs = divs.filter((d) => (d.unitId || null) === uid);
      if (!dvs.length) return;
      const us = uid == null ? null : RD.rollupUnit(uid, P, em);
      units.push({
        id: uid || 'unassigned', name: label, hasScore: uid != null, score: F.score(us), scoreCls: 'pov-uscore tx-' + PLAN.tone(RD.band(us)),
        stCls: 'st ' + F.tone(PLAN.tone(RD.band(us))), word: PLAN.word(RD.band(us)),
        divs: dvs.map((d) => povDivCard(C, ctx, d, casc))
      });
    };
    seen.forEach((uid) => { const u = PLAN.byId(P, 'unit', uid); section(uid, u ? u.name : uid); });
    section(null, 'Unassigned');
    const noDivs = !(P.divisions || []).length;
    const noMatch = !noDivs && !divs.length;
    const groups = noDivs ? [] : povActive(C, ctx, divs, casc);
    return {
      detail: detail,
      company: { score: F.score(comp), scoreCls: 'pov-hero-score tx-' + ct, stCls: 'st ' + F.tone(ct), word: PLAN.word(RD.band(comp)) },
      units: units, hasDivs: !noDivs && !noMatch, noDivs: noDivs, noMatch: noMatch,
      noMatchText: 'No divisions match the current filter (division ' + (ctx.f.div || 'any') + (ctx.f.unit ? ', unit ' + ctx.f.unit : '') + (ctx.f.prod ? ', product ' + ctx.f.prod : '') + '). The filter matches a division id such as DIV-FC, not its name.',
      qNow: F.q(ctx.qNow),
      groups: groups, hasGroups: groups.length > 0, noActive: !noDivs && !groups.some((g) => g.blocks.length),
      canAdd: !ctx.ro,
      addDiv: () => PED.open(C, ctx, 'division', null),
      goStructure: () => C.setState({ tab: 'structure', sheets: [], menu: '' }),
      slices: povSlices(C, ctx)
    };
  }
};
