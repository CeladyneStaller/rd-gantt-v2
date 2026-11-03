/* ============================================================================
   Key results (X-kr), built into Execution and Sales.

   Today's source (read only):
     Execution  renderKRs L4538–4581, KR modal L3755–4049, sub-KR modal L4050–4135,
                delSub L3218–3236, KR toggle/edit wiring L5824–5854
     Sales      renderKRs L3223–3271, step drawer L3149–3173 (+ wiring L4250–4251),
                KR modal L2414–2709, sub-KR modal L2711–2795, delSub L1928–1946
   Engine: RD.keyResultPace / keyResultSample / keyResultScore / milestone* / subKrScore.

   Public:
     KR.openEditor(C, ctx, krId)   open the key result sheet (krId falsy = add a new one)
     KR.tag(ctx, krId)             'KR2' / 'KR-M1', the label this tab shows for a key result
   State keys: kr_open (expanded rows), kr_cell (inline step completion edit), kr_hot (step drop target),
   kr_focus (the key result the Overview's review table just opened; mods/review draws the Overview rows).
   ========================================================================== */

const KR_TYPES = [['percentage', '% completion'], ['kpi', 'KPI-based'], ['milestone', 'Milestone steps']];
const KR_LEGACY = ['subkr', 'Sub-key results (legacy)'];
const KR_STATS = [['average', 'Average'], ['median', 'Median'], ['stddev', 'Standard deviation'], ['cv', 'Coefficient of variation (CV)'], ['range', 'Range'], ['max', 'Max'], ['min', 'Min']];
const KR_BANDS = { 'on-track': ['On track', 'ok'], 'at-risk': ['At risk', 'warn'], 'off-track': ['Behind', 'bad'], 'no-band': ['No data', 'none'] };
const KR_TYPE_HINT = {
  percentage: 'Progress is set by hand, from 0 to 100%.',
  kpi: 'Scores as the mean of its KPIs. An unmeasured KPI counts as nothing achieved.',
  milestone: 'A weighted checklist of dated steps. Blank weights share whatever is left of 100%.',
  subkr: 'Legacy: the weighted mean of sub-results stored inside this key result. New key results can’t use this type.'
};

/* ------------------------------------------------------------- small helpers */
function krTypeLabel(tt) {
  tt = tt || 'kpi';
  if (tt === 'subkr') return KR_LEGACY[1];
  const t = KR_TYPES.find((x) => x[0] === tt);
  return t ? t[1] : 'KPI-based';
}
function krOfObj(doc, objId) { return ((doc && doc.keyResults) || []).filter((r) => r.objectiveId === objId); }
/* Sales numbering (today's L3264): milestone key results are KR-M1, KR-M2…; the rest keep KR<position>. */
function krTags(list) { let m = 0; return list.map((kr, i) => (kr.trackingType === 'milestone' ? 'KR-M' + (++m) : 'KR' + (i + 1))); }
function krClampPct(v) { v = Number(v); return isNaN(v) ? 0 : Math.max(0, Math.min(100, v)); }
/* strict number parse for typed fields: '' -> null (blank), not a number -> NaN */
function krParse(t) {
  if (t == null) return null;
  if (typeof t === 'number') return isFinite(t) ? t : NaN;
  const s = String(t).trim();
  if (!s) return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}
function krBad(v) { return typeof v === 'number' && isNaN(v); }
/* readings typed into a legacy statistical sub-KR: commas, spaces, semicolons or newlines.
   Today's parser turned a trailing separator into a 0 reading; empty pieces are skipped here. */
function krParseNums(str) { return String(str || '').split(/[\s,;]+/).filter((x) => x !== '').map(Number).filter((x) => !isNaN(x)); }
function krTrunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n).replace(/\s+$/, '') + '…' : s; }
function krStatLabel(v) { const x = KR_STATS.find((s) => s[0] === v); return x ? x[1] : 'Average'; }
/* step due dates are ISO strings in the real documents ('' when undated); accept day numbers too */
function krIso(due) {
  if (due == null || due === '') return '';
  if (typeof due === 'number') return isFinite(due) ? F.iso(due) : '';
  const s = String(due).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function krDueDay(due) {
  if (due == null || due === '') return null;
  if (typeof due === 'number') return isFinite(due) ? due : null;
  return F.fromIso(String(due).trim());
}
function krHasKpiApi(name) { return typeof KPI !== 'undefined' && KPI && typeof KPI[name] === 'function'; }
function krObjOf(C, objId) { return ((C.D.portfolio && C.D.portfolio.objectives) || []).find((o) => o.id === objId) || null; }
function krDocOf(C, ctx, docKey) { return (docKey && C.D.docs[docKey]) || ctx.doc; }

/* ---- the resolution pool (today's allKpisPool, L2847): this division's KPIs, the portfolio's
   initiative / milestone / product KPIs, and the in-scope product and model spec KPIs ---- */
function krAncestorModels(P, mid) {
  const comp = P.composition || [];
  const out = {}, stack = [mid];
  while (stack.length) {
    const ps = RD.compositionParents(stack.pop(), comp);
    for (let i = 0; i < ps.length; i++) if (!out[ps[i]]) { out[ps[i]] = 1; stack.push(ps[i]); }
  }
  return Object.keys(out);
}
function krLinkTargets(ctx) {
  const P = ctx.P;
  if (!P || !ctx.divId) return [];
  const base = RD.classifiedTargets(P, P.composition || [], ctx.divId);
  const models = new Set(base.models), products = new Set(base.products);
  base.models.forEach((mid) => krAncestorModels(P, mid).forEach((a) => {
    models.add(a);
    const m = (P.models || []).find((x) => x.id === a);
    if (m && m.productId) products.add(m.productId);
  }));
  const ref = [];
  Object.keys(ctx.spec || {}).forEach((id) => { const d = ctx.spec[id]; ((d && d.kpis) || []).forEach((k) => ref.push(k)); });
  const out = RD.targetKpisInScope({ products: Array.from(products), models: Array.from(models) }, ref);
  const seen = new Set(out.map((k) => k.id));
  ref.forEach((k) => { if (k && k.hostType === 'component' && models.has(k.objectiveId) && !seen.has(k.id)) { seen.add(k.id); out.push(k); } });
  return out;
}
function krPool(C, ctx) {
  return C.memo('kr.pool', () => {
    if (krHasKpiApi('pool')) {
      try { const p = KPI.pool(C, ctx); if (Array.isArray(p)) return p; } catch (e) { /* fall back to our own */ }
    }
    const doc = ctx.doc || {}, P = ctx.P || {};
    const pool = (P.kpis && P.kpis.length) ? (doc.kpis || []).concat(P.kpis) : (doc.kpis || []).slice();
    const have = new Set(pool.map((k) => k.id));
    krLinkTargets(ctx).forEach((k) => { if (!have.has(k.id)) { have.add(k.id); pool.push(k); } });
    return pool;
  });
}
/* the gate label today's sample picker uses (SG-<workstream letter><n by due date>, L5884) */
function krGateLabel(doc, g) {
  const byDue = (list) => list.slice().sort((a, b) => {
    const pa = a.plannedDate == null ? Infinity : a.plannedDate, pb = b.plannedDate == null ? Infinity : b.plannedDate;
    return (pa - pb) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id));
  });
  const peers = byDue((doc.stageGates || []).filter((x) => x.objectiveId === g.objectiveId && x.setId === g.setId));
  const n = peers.findIndex((x) => x.id === g.id) + 1;
  if (n < 1) return String(g.id);
  const sets = (doc.stageGateSets || []).filter((s) => s.objectiveId === g.objectiveId).slice()
    .sort((a, b) => ((a.order || 0) - (b.order || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
  const si = sets.findIndex((s) => s.id === g.setId);
  return 'SG-' + (si >= 0 ? String.fromCharCode(65 + si) : '') + n;
}
function krHostLabel(C, ctx, k) {
  if (!k) return '';
  if (krHasKpiApi('hostLabel')) { try { const s = KPI.hostLabel(C, ctx, k); if (s) return s; } catch (e) { /* use ours */ } }
  const P = ctx.P || {};
  const doc = ctx.doc || {};
  const find = (arr, id) => (arr || []).find((x) => x.id === id);
  if (k.hostType === 'initiative') { const x = find(P.initiatives, k.hostId); return 'initiative ' + (x ? x.name : k.hostId); }
  if (k.hostType === 'milestone') { const x = find(P.milestones, k.hostId); return 'milestone ' + (x ? x.name : k.hostId); }
  if (k.hostType === 'product') { const x = find(P.products, k.hostId); return 'product ' + (x ? x.name : k.hostId); }
  if (k.hostType === 'component') return 'component spec';
  if (k.hostType === 'keyResult') {
    const m = find(P.models, k.objectiveId);
    if (m) return 'model spec ' + m.name;
    const kr = find(doc.keyResults, k.hostId);
    return 'key result ' + (kr ? KR.tag(ctx, kr.id) : k.hostId);
  }
  if (k.hostType === 'stageGate') { const g = find(doc.stageGates, k.hostId); return 'stage-gate ' + (g ? g.name : k.hostId); }
  return k.hostType || '';
}

/* ---------------------------------------------- shared numbers for one KR */
function krBase(C, ctx, kr, tag) {
  const em = ctx.em;
  const pace = RD.keyResultPace(kr.id, ctx.obj, em, ctx.today);
  const att = pace.attainment, el = pace.elapsed, band = pace.band;
  /* a partial check-in shows what the discount withheld: hatched up to the raw figure (today L4547) */
  const smp = RD.keyResultSample(kr.id, em);
  const raw = smp.partial ? RD.keyResultScore(kr.id, em, true) : null;
  const bm = KR_BANDS[band] || KR_BANDS['no-band'];
  const tone = bm[1];
  const w = att == null ? 0 : K.clamp(Math.round(att), 0, 100);
  let hatch = '';
  if (att != null && raw != null && raw > att) {
    const l = K.clamp(att, 0, 100), r = K.clamp(raw, 0, 100);
    hatch = 'left: ' + l.toFixed(1) + '%; width: ' + (r - l).toFixed(1) + '%';
  }
  /* pace captions, today L4550–4554 */
  let capText = '', capTone = 'none', elText = '';
  if (att != null && att >= 100) {
    capText = 'Target met'; capTone = 'ok';
    if (el != null) elText = Math.round(el) + '% of time elapsed';
  } else if (att != null && el != null) {
    const gap = Math.round(el - att);
    if (gap <= 0) { capText = gap === 0 ? 'On pace' : 'Ahead of pace'; capTone = 'ok'; }
    else { capText = gap + (gap === 1 ? ' pt behind pace' : ' pts behind pace'); capTone = band === 'off-track' ? 'bad' : 'warn'; }
    elText = Math.round(el) + '% of time elapsed';
  } else if (att != null) {
    capText = 'No objective dates, score only'; capTone = 'none';
  }
  const statement = kr.statement || kr.id;
  const score = att == null ? '—' : String(Math.round(att));
  return {
    id: kr.id, k: kr.id, tag: tag, statement: statement,
    att: att, el: el, band: band, tone: tone, smp: smp, raw: raw,
    paceWord: bm[0], paceCls: 'st ' + F.tone(tone),
    partial: !!smp.partial,
    score: score, scoreTitle: att == null ? 'No score yet' : 'Attainment ' + score + '%',
    fillCls: 'fill ' + F.tone(tone), fillStyle: 'width: ' + w + '%',
    hasTick: el != null, tickStyle: el != null ? 'left: calc(' + Math.round(el) + '% - 1px)' : '',
    hasHatch: !!hatch, hatchCls: 'hatch ' + F.tone(tone), hatchStyle: hatch,
    hasCap: !!capText, capText: capText, capCls: 'tx-' + capTone, hasEl: !!elText, elText: elText,
    hasPt: raw != null && !!smp.partial,
    ptRaw: raw != null ? Math.round(raw) + ' without the discount' : '',
    ptSamples: smp.partial ? smp.n + ' of ' + smp.expected + ' samples in' : ''
  };
}

/* --------------------------------------------------------------- list rows */
function krRow(C, ctx, kr, b, pool) {
  const ro = !!ctx.ro;
  const tt = kr.trackingType || 'kpi';
  const isMs = tt === 'milestone', isPct = tt === 'percentage', isSub = tt === 'subkr', isKpi = tt === 'kpi';
  const kk = pool.filter((k) => k.objectiveId === ctx.objId && k.hostType === 'keyResult' && k.hostId === kr.id);
  const met = kk.filter((k) => { const s = RD.kpiScoreResolved(k, pool, ctx.em); return s != null && s >= 100; }).length;
  let detail = '';
  if (isKpi) detail = kk.length ? met + ' of ' + F.plural(kk.length, 'KPI') + ' on target' + (b.partial ? ', ' + b.smp.partialCount + ' partial' : '') : 'No KPIs yet';
  else if (isMs) {
    const st = kr.steps || [];
    const done = st.filter((x) => (Number(x.completion) || 0) >= 100).length;
    detail = st.length ? done + ' of ' + F.plural(st.length, 'step') + ' done' : 'No steps yet';
  } else if (isSub) detail = F.plural((kr.subKrs || []).length, 'sub-key result');
  else if (isPct && kr.progress == null) detail = 'No progress set';
  /* today's toggle reads "KPIs N of M on target" on any key result that hosts KPIs (exec L4558) */
  if (!isKpi && kk.length) detail = (detail ? detail + ', ' : '') + met + ' of ' + F.plural(kk.length, 'KPI') + ' on target';
  const openMap = C.state.kr_open || {};
  const open = !!openMap[kr.id];
  const menuId = 'kr.row.' + kr.id;
  const host = { type: 'keyResult', id: kr.id };
  /* opened from the Overview's review table: highlighted for a moment, and its row button takes focus */
  const focus = !!C.state.kr_focus && C.state.kr_focus === kr.id;
  const row = Object.assign({}, b, {
    itemCls: 'kr-item' + (focus ? ' is-focus' : ''), focus: focus,
    typeLabel: krTypeLabel(tt), detail: detail, hasDetail: !!detail,
    exp: open, chevCls: open ? 'kr-chev on' : 'kr-chev',
    toggle: () => C.setState({ kr_open: Object.assign({}, C.state.kr_open, { [kr.id]: !open }), kr_cell: null }),
    hasMenu: !ro, menuOpen: C.isMenu(menuId), menuLabel: 'Actions for ' + b.tag,
    aboveCls: C.isMenu(menuId) ? 'above' : 'anchor',
    toggleMenu: () => C.toggleMenu(menuId),
    edit: () => { C.closeMenus(); KR.openEditor(C, ctx, kr.id); },
    dup: () => krDuplicate(C, ctx, kr.id),
    del: () => krAskDelete(C, ctx, kr.id),
    hasConnect: !ro && APP === 'exec' && krHasKpiApi('openConnect'),
    connect: () => { C.closeMenus(); if (krHasKpiApi('openConnect')) KPI.openConnect(C, ctx, { host: host }); },
    /* today every key result offers "+ add a KPI" / "+ link" (exec L4558–4564), whatever its tracking type;
       a KPI-based one has them in its KPI table's footer, the others get them here */
    hasAddKpi: !ro && !isKpi && krHasKpiApi('openTarget') && krHasKpiApi('openLink'),
    addKpi: () => { C.closeMenus(); C.setState({ kr_open: Object.assign({}, C.state.kr_open, { [kr.id]: true }) }); KPI.openTarget(C, ctx, host, null); },
    linkKpi: () => { C.closeMenus(); C.setState({ kr_open: Object.assign({}, C.state.kr_open, { [kr.id]: true }) }); KPI.openLink(C, ctx, host); },
    isPct: isPct, isKpi: isKpi, isMs: isMs, isSub: isSub,
    canEdit: !ro
  });
  if (!open) return row;

  /* % completion: the inline progress control */
  if (isPct) {
    const p = Math.round(krClampPct(kr.progress));
    row.pct = String(p);
    row.pctLabel = kr.progress == null ? 'Not set' : p + '%';
    row.pctAria = 'Progress of ' + b.tag;
    row.onPct = (e) => {
      const v = Math.round(krClampPct(e && e.target ? e.target.value : e));
      C.mutate((D) => {
        const r = (krDocOf(C, ctx, ctx.docKey).keyResults || []).find((x) => x.id === kr.id);
        if (!r || r.progress === v) return false;
        r.progress = v;
      });
    };
    row.pctHint = ro ? 'Progress is set in the key result.' : 'The objective score follows as you drag.';
  }

  /* KPI table (also shown when a non-KPI key result still hosts KPIs, as today) */
  row.showKpis = isKpi || kk.length > 0;
  if (row.showKpis) {
    row.kt = krKpiTable(C, ctx, host);
    row.hasKpiNote = !isKpi;
    row.kpiNote = !isKpi ? 'These KPIs don’t count toward this key result’s score while it is tracked by ' + krTypeLabel(tt).toLowerCase() + '.' : '';
    /* the KPI table draws "Add KPI", "Link a metric" and (Execution) "Connect data" in its own footer */
  } else { row.kt = null; row.hasKpiNote = false; row.kpiNote = ''; }

  /* milestone steps: today's Sales status drawer (L3149–3173), now in both apps */
  if (isMs) row.ms = krDrawer(C, ctx, kr, ro);
  /* legacy sub-key results: shown and scored as today (RD.subKrScore) */
  if (isSub) { row.subs = krSubRows(kr.subKrs || []); row.noSubs = !row.subs.length; row.hasSubs = row.subs.length > 0; }
  return row;
}

/* X-kpi's table (today's kpiTable plus "+ KPI" / "+ link", and Connect data in Execution) */
function krKpiTable(C, ctx, host) {
  if (krHasKpiApi('table')) {
    try { const t = KPI.table(C, ctx, host, { connect: true }); if (t) return t; } catch (e) { console.error('[calm] kr: KPI.table failed', e); }
  }
  return {
    key: host.type + ':' + host.id, head: { name: 'KPI', target: 'Target' }, rows: [], has: false, empty: true,
    emptyText: 'KPIs can’t be shown right now.', cols: 5, showActs: false,
    canAdd: false, add: null, addLabel: '', canLink: false, link: null, linkLabel: '', canConnect: false, connect: null, hasFoot: false
  };
}

function krDrawer(C, ctx, kr, ro) {
  const steps = kr.steps || [];
  const eff = RD.milestoneEffectiveWeights(steps);
  const byId = {};
  eff.forEach((e) => { byId[e.id] = e; });
  const partial = kr.creditMode === 'partial';
  const tot = eff.reduce((a, e) => a + e.w, 0);
  const cell = C.state.kr_cell;
  const rows = steps.map((x, i) => {
    const e = byId[x.id] || { w: 0, auto: true };
    const c = krClampPct(x.completion);
    const done = c >= 100;
    const dd = krDueDay(x.due);
    const overdue = !done && dd != null && dd < ctx.today;
    const name = x.name || 'Unnamed step';
    const editing = !!(cell && cell.kr === kr.id && cell.step === x.id);
    const commit = () => krCommitCell(C, ctx);
    return {
      k: String(x.id || i), name: name, done: done, off: ro,
      binary: !partial, partial: partial,
      checkLabel: 'Done: ' + name,
      onCheck: (ev) => krSetStepCompletion(C, ctx, kr.id, x.id, ev && ev.target && ev.target.checked ? 100 : 0),
      pct: (Math.round(c * 10) / 10) + '%',
      editing: editing, notEditing: !editing, canCell: !ro,
      cellLabel: 'Completion of ' + name + ', in %',
      cellVal: editing ? String(cell.v) : '',
      startCell: () => C.setState({ kr_cell: { kr: kr.id, step: x.id, v: String(Math.round(c * 10) / 10) }, menu: '' }),
      onCell: (ev) => C.setState({ kr_cell: Object.assign({}, C.state.kr_cell, { v: ev && ev.target ? ev.target.value : '' }) }),
      onCellKey: (ev) => {
        if (ev.key === 'Enter') { if (ev.preventDefault) ev.preventDefault(); commit(); }
        else if (ev.key === 'Escape') C.setState({ kr_cell: null });
      },
      onCellBlur: commit,
      contrib: RD.milestoneStepContribution(x, e.w, 'partial').toFixed(1) + '%',
      weight: e.w.toFixed(e.auto ? 1 : 0) + '%', auto: !!e.auto,
      due: dd != null ? F.dayAuto(dd, ctx.today) : '—', overdue: overdue
    };
  });
  return {
    partial: partial, binary: !partial,
    modeWord: partial ? 'Partial credit' : 'Binary credit',
    modeHint: partial ? 'Each step adds its weight scaled by its % complete.' : 'A step adds its full weight only when it is done.',
    hint: ro ? '' : 'Update status here. Names, weights and due dates are edited in the key result.',
    hasHint: !ro,
    has: steps.length > 0, none: !steps.length,
    rows: rows,
    sum: tot.toFixed(0) + '%',
    canEdit: !ro,
    edit: () => KR.openEditor(C, ctx, kr.id)
  };
}

function krSubRows(subs) {
  return subs.map((s, i) => {
    let meta = '% completion', measured = '';
    if ((s.trackingType || 'percentage') === 'percentage') measured = (Number(s.progress) || 0) + '% complete';
    else {
      const k = (s.kpis && s.kpis[0]) || {};
      const tp = k.targetType || k.type || 'demonstration';
      if (tp === 'binary') {
        meta = 'Binary';
        measured = k.current != null ? (Number(k.current) >= 1 ? 'Met' : 'Not met') : 'Unmeasured';
      } else {
        meta = (tp === 'statistical' ? 'Statistical' : 'Demonstration') + ((k.target != null && k.target !== '') ? ', target ' + (k.direction === 'down' || k.direction === 'decrease' ? '≤ ' : '≥ ') + k.target + (k.unit ? ' ' + k.unit : '') : '');
        measured = k.current != null ? 'Now ' + (tp === 'statistical' && typeof k.current === 'number' ? Math.round(k.current * 1000) / 1000 : k.current) + (k.unit ? ' ' + k.unit : '') : 'Unmeasured';
      }
    }
    const sc = RD.subKrScore([s]);
    /* the band in words too, so colour is never the only signal */
    return { k: 'sub-' + i, name: s.name || 'Sub-key result ' + (i + 1), weight: String(s.weight || 1), meta: meta, measured: measured, score: F.score(sc), scoreCls: 'st ' + F.tone(F.band(sc)), scoreTitle: sc == null ? 'No score yet' : 'Score ' + F.score(sc) + ', ' + F.bandWord(F.band(sc)).toLowerCase() };
  });
}

/* ----------------------------------------------------------- data changes */
function krSetStepCompletion(C, ctx, krId, stepId, value) {
  C.mutate((D) => {
    const kr = (krDocOf(C, ctx, ctx.docKey).keyResults || []).find((x) => x.id === krId);
    const st = kr && (kr.steps || []).find((x) => x.id === stepId);
    if (!st) return false;
    const v = krClampPct(value);
    if (Number(st.completion) === v) return false;
    st.completion = v;
  });
}
function krCommitCell(C, ctx) {
  const cell = C.state.kr_cell;
  if (!cell) return;
  const t = String(cell.v == null ? '' : cell.v).trim();
  const n = t === '' ? 0 : krParse(t);   // today: Number(value)||0, so a cleared field means 0
  if (krBad(n)) { C.toast('Use a number from 0 to 100, like 60.', 'err'); return; }
  C.setState({ kr_cell: null });
  krSetStepCompletion(C, ctx, cell.kr, cell.step, n);
}

/* KPIs elsewhere that inherit from KPIs being removed keep what they inherit and stand alone (the same
   result as today's "unlink", L4344); KPIs that borrow a removed sample go back to their own readings. */
function krDetach(doc, pool, goneIds) {
  const gone = new Set(goneIds);
  const goneGroups = new Set((doc.kpis || []).filter((k) => gone.has(k.id) && k.groupId && k.isDefiner).map((k) => k.groupId));
  const fix = [];
  (doc.kpis || []).forEach((m) => {
    if (gone.has(m.id)) return;
    const viaParent = m.linkParent != null && gone.has(m.linkParent);
    const viaGroup = !viaParent && !!m.groupId && !m.isDefiner && goneGroups.has(m.groupId);
    if (viaParent || viaGroup) fix.push(m);
  });
  /* resolve everything first (the pool still holds the KPIs being removed), then write */
  const vals = fix.map((m) => {
    const root = RD.rootOf(m, pool);
    const shown = RD.effTarget(m, pool);
    return { m: m, root: root, shown: shown, name: RD.kpiName(m, pool), direction: RD.kpiDirection(m, pool), unit: RD.kpiUnit(m, pool) };
  });
  vals.forEach((v) => {
    const m = v.m, root = v.root;
    m.name = v.name; m.direction = v.direction; m.unit = v.unit;
    m.target = v.shown != null && typeof v.shown === 'object' ? K.clone(v.shown) : v.shown;
    if (root && root !== m) {
      if (root.targetType) m.targetType = root.targetType;
      if (root.targetType === 'statistical') { m.statistic = root.statistic || 'average'; m.readCount = root.readCount == null ? '' : root.readCount; }
      if (m.direction === 'range' && root.rangeSpec && root.target === v.shown) m.rangeSpec = K.clone(root.rangeSpec);
    }
    m.groupId = null; m.isDefiner = true;
    if (m.linkParent != null) { m.linkParent = null; delete m.linkType; delete m.linkPriority; }
  });
  let borrowers = 0;
  (doc.kpis || []).forEach((k) => { if (!gone.has(k.id) && k.readsFrom && gone.has(k.readsFrom)) { delete k.readsFrom; borrowers++; } });
  return { members: fix.length, borrowers: borrowers };
}
function krImpact(C, ctx, ids) {
  const doc = ctx.doc;
  const pool = krPool(C, ctx);
  const gone = new Set(ids);
  const goneGroups = new Set((doc.kpis || []).filter((k) => gone.has(k.id) && k.groupId && k.isDefiner).map((k) => k.groupId));
  const members = (doc.kpis || []).filter((m) => !gone.has(m.id) && ((m.linkParent != null && gone.has(m.linkParent)) || (m.groupId && !m.isDefiner && goneGroups.has(m.groupId))));
  const borrowers = (doc.kpis || []).filter((k) => !gone.has(k.id) && k.readsFrom && gone.has(k.readsFrom));
  const sources = ((ctx.P && ctx.P.kpis) || []).filter((k) => (k.sources || []).some((s) => gone.has(s)));
  const reads = (doc.kpiUpdates || []).filter((u) => gone.has(u.kpiId)).length;
  const nm = (k) => RD.kpiName(k, pool) || k.id;
  return { members: members, borrowers: borrowers, sources: sources, reads: reads, nm: nm };
}

function krAskDelete(C, ctx, krId) {
  C.closeMenus();
  if (!C.guard()) return;
  const doc = ctx.doc;
  const kr = (doc.keyResults || []).find((x) => x.id === krId);
  if (!kr) { C.toast('That key result was already deleted.', 'info'); return; }
  const tag = KR.tag(ctx, krId);
  const pool = krPool(C, ctx);
  const ks = (doc.kpis || []).filter((k) => k.hostType === 'keyResult' && k.hostId === krId);
  const ids = ks.map((k) => k.id);
  const imp = krImpact(C, ctx, ids);
  const tt = kr.trackingType || 'kpi';
  const parts = [];
  let first = '“' + (kr.statement || kr.id) + '” is deleted';
  if (ks.length) {
    first += ks.length === 1 ? ' with its KPI ' + imp.nm(ks[0]) : ' with its ' + ks.length + ' KPIs (' + F.list(ks.map(imp.nm)) + ')';
    first += imp.reads ? ' and ' + F.plural(imp.reads, 'reading') + '.' : '. They have no readings yet.';
  } else if (tt === 'milestone' && (kr.steps || []).length) first += ' with its ' + F.plural(kr.steps.length, 'step') + '.';
  else if (tt === 'subkr' && (kr.subKrs || []).length) first += ' with its ' + F.plural(kr.subKrs.length, 'sub-key result') + '.';
  else first += '.';
  parts.push(first);
  const ownLinks = ks.filter((k) => k.linkParent != null);
  if (ownLinks.length) parts.push((ownLinks.length === 1 ? 'Its link to ' : 'Its links to ') + F.list(ownLinks.map((k) => { const p = pool.find((x) => x.id === k.linkParent); return p ? (RD.kpiName(p, pool) || p.id) + ' (' + krHostLabel(C, ctx, p) + ')' : k.linkParent; })) + (ownLinks.length === 1 ? ' is removed.' : ' are removed.'));
  if (imp.members.length) parts.push(F.plural(imp.members.length, 'KPI') + ' elsewhere that ' + (imp.members.length === 1 ? 'links' : 'link') + ' to it (' + F.list(imp.members.map((m) => imp.nm(m) + ' on ' + krHostLabel(C, ctx, m))) + ') ' + (imp.members.length === 1 ? 'keeps its' : 'keep their') + ' current target and ' + (imp.members.length === 1 ? 'stands' : 'stand') + ' alone.');
  if (imp.borrowers.length) parts.push(F.plural(imp.borrowers.length, 'KPI') + ' that ' + (imp.borrowers.length === 1 ? 'borrows' : 'borrow') + ' its sample (' + F.list(imp.borrowers.map(imp.nm)) + ') ' + (imp.borrowers.length === 1 ? 'goes' : 'go') + ' back to ' + (imp.borrowers.length === 1 ? 'its' : 'their') + ' own readings.');
  if (imp.sources.length) parts.push('The milestone ' + (imp.sources.length === 1 ? 'target ' : 'targets ') + F.list(imp.sources.map((k) => k.name || k.id)) + ' will stop reading from it.');
  C.confirm({
    title: 'Delete ' + tag + '?',
    body: parts.join(' '),
    ok: 'Delete key result',
    danger: true,
    onOk: () => {
      const done = C.mutate((D) => {
        const d = krDocOf(C, ctx, ctx.docKey);
        if (!(d.keyResults || []).some((x) => x.id === krId)) return false;
        const p = krPool(C, ctx);
        const gone = (d.kpis || []).filter((k) => k.hostType === 'keyResult' && k.hostId === krId).map((k) => k.id);
        krDetach(d, p, gone);
        d.kpis = (d.kpis || []).filter((k) => gone.indexOf(k.id) < 0);
        d.kpiUpdates = (d.kpiUpdates || []).filter((u) => gone.indexOf(u.kpiId) < 0);
        d.keyResults = (d.keyResults || []).filter((x) => x.id !== krId);
      }, { msg: 'Key result deleted.' });
      if (done) {
        const open = Object.assign({}, C.state.kr_open);
        delete open[krId];
        const patch = { kr_open: open, kr_cell: null };
        const top = C.sheet();
        if (top && top.kind.indexOf('kr.') === 0) patch.sheets = [];
        C.setState(patch);
      }
    }
  });
}

/* Duplicate (today L3891–3922): the definition copies, what happened does not. Fixed here: the copy
   is opened (today the editor stayed on the original), step completion resets (today it carried over
   because the code reset a non-existent `progress` field), a key result with no tracking type stays
   KPI-based (today it became % completion), and embedded sub-KR readings are cleared with their values. */
function krDuplicate(C, ctx, krId) {
  C.closeMenus();
  if (!C.guard()) return null;
  let newId = null;
  /* pulled KPIs (mods/pull) are copied only by the people who make them: leads, the CTO and the CEO */
  const src0 = (krDocOf(C, ctx, ctx.docKey).keyResults || []).find((k) => k.id === krId);
  const leftPulled = typeof PULL === 'undefined' || !src0 || PULL.isLeaderOfObj(C, src0.objectiveId) ? 0
    : (krDocOf(C, ctx, ctx.docKey).kpis || []).filter((k) => k.hostType === 'keyResult' && k.hostId === krId && k.pull).length;
  const ok = C.mutate((D) => {
    const doc = krDocOf(C, ctx, ctx.docKey);
    const kr = (doc.keyResults || []).find((k) => k.id === krId);
    if (!kr) return false;
    const id = RD.allocId('keyResult', kr.objectiveId, doc.keyResults.map((x) => x.id));
    const tt = kr.trackingType || 'kpi';
    const copy = { id: id, objectiveId: kr.objectiveId, statement: (kr.statement || '') + ' (copy)', trackingType: tt };
    if (tt === 'percentage') copy.progress = 0;
    if (kr.creditMode) copy.creditMode = kr.creditMode;
    if (Array.isArray(kr.steps)) copy.steps = kr.steps.map((s) => { const n = K.clone(s); delete n.doneDate; delete n.done; delete n.progress; n.completion = 0; return n; });
    if (Array.isArray(kr.subKrs)) copy.subKrs = kr.subKrs.map((s) => {
      const n = K.clone(s);
      n.progress = 0;
      if (Array.isArray(n.kpis)) n.kpis = n.kpis.map((k) => { const c = Object.assign({}, k); delete c.current; if (c.readings != null) c.readings = ''; return c; });
      return n;
    });
    doc.keyResults.push(copy);
    (doc.kpis || []).filter((k) => k.hostType === 'keyResult' && k.hostId === krId && !(leftPulled && k.pull)).forEach((k) => {
      const kid = RD.allocId('kpi', kr.objectiveId, doc.kpis.map((x) => x.id));
      const nk = Object.assign(K.clone(k), { id: kid, hostId: id });
      delete nk.current;              // a measured value belongs to the key result it was measured on
      if (nk.pull) { const v = C.viewer ? C.viewer() : null; nk.pull.by = v ? v.email : ''; nk.pull.at = C.now(); }
      doc.kpis.push(nk);
    });
    newId = id;
  }, { msg: leftPulled ? 'Key result duplicated. ' + (leftPulled === 1 ? 'Its pulled KPI stays' : 'Its ' + leftPulled + ' pulled KPIs stay') + ' with the original: leads, the CTO and the CEO add those.' : 'Key result duplicated.' });
  if (!ok || !newId) return null;
  C.setState({ kr_open: Object.assign({}, C.state.kr_open, { [newId]: true }), kr_cell: null });
  KR.openEditor(C, ctx, newId);
  return newId;
}

/* ------------------------------------------------------------- the editor */
function krDraftKpi(k, pool, doc) {
  const linked = !!(k && (k.linkParent != null || (k.groupId && !k.isDefiner)));
  const range = !!(k && k.direction === 'range');
  const tgt = k ? k.target : null;
  return {
    id: (k && k.id) || null,
    name: (k && k.name) || '',
    display: k && linked ? (RD.kpiName(k, pool) || k.name || '') : '',
    linkedTo: k && linked ? (() => { const def = RD.definerOf(k, pool); return def && def.id !== k.id ? (RD.kpiName(def, pool) || def.id) : ''; })() : '',
    kpiType: (k && k.targetType) || 'demonstration',
    kpiDir: k && k.direction === 'down' ? 'decrease' : range ? 'range' : 'increase',
    kpiTarget: tgt != null && typeof tgt !== 'object' ? String(tgt) : '',
    kpiLo: range && tgt && typeof tgt === 'object' && tgt.lo != null ? String(tgt.lo) : '',
    kpiHi: range && tgt && typeof tgt === 'object' && tgt.hi != null ? String(tgt.hi) : '',
    kpiUnit: (k && k.unit) || '',
    kpiStatistic: (k && k.statistic) || 'average',
    kpiReadsFrom: (k && k.readsFrom) || '',
    kpiReadCount: k && k.readCount != null && k.readCount !== '' ? String(k.readCount) : '',
    linked: linked,
    pulled: !!(k && k.pull),          // pulled from other work (mods/pull): shown here, edited from the KPI table
    wasRange: range,
    reads: k ? ((doc && doc.kpiUpdates) || []).filter((u) => u.kpiId === k.id).length : 0
  };
}
function krInitDraft(C, ctx, kr) {
  const isNew = !kr;
  const doc = ctx.doc;
  const pool = krPool(C, ctx);
  const existing = isNew ? [] : (doc.kpis || []).filter((k) => k.hostType === 'keyResult' && k.hostId === kr.id);
  const tt = (kr && kr.trackingType) || (isNew ? 'percentage' : 'kpi');
  const d = {
    statement: isNew ? '' : (kr.statement || ''),
    trackingType: tt,
    legacy: tt === 'subkr',
    progress: kr && kr.progress != null ? String(krClampPct(kr.progress)) : '0',
    kpis: existing.length ? existing.map((k) => krDraftKpi(k, pool, doc)) : [krDraftKpi(null, pool, doc)],
    openKpi: 0,                                   // today's modal opens with the first KPI row expanded
    creditMode: (kr && kr.creditMode) || 'binary',
    steps: krDraftSteps((kr && kr.steps) || []),
    subKrs: K.clone((kr && kr.subKrs) || [])
  };
  return d;
}
/* steps as the editor holds them (strings while typing); a step without an id gets a unique one */
function krDraftSteps(steps) {
  const used = {};
  steps.forEach((x) => { if (x && x.id != null && x.id !== '') used[x.id] = 1; });
  let n = 0;
  return steps.map((x) => {
    let id = x.id;
    if (id == null || id === '' || used[id] === 2) { do { n++; id = 'ST-' + n; } while (used[id]); }
    used[id] = 2;
    return { id: id, name: x.name || '', weight: (x.weight == null || x.weight === '') ? '' : String(x.weight), due: krIso(x.due), completion: String(krClampPct(x.completion)) };
  });
}
function krDraftSig(d) { return JSON.stringify([d.statement, d.trackingType, d.progress, d.kpis, d.creditMode, d.steps, d.subKrs]); }

const KR = {
  openEditor(C, ctx, krId) {
    ctx = ctx || C.ctx;
    if (!C.guard()) return;
    if (!ctx || !ctx.objId) { C.toast('Pick an objective first.', 'info'); return; }
    const kr = krId ? (ctx.doc.keyResults || []).find((r) => r.id === krId) : null;
    if (krId && !kr) { C.toast('That key result no longer exists.', 'err'); return; }
    const d = krInitDraft(C, ctx, kr);
    C.openSheet('kr.edit', { krId: kr ? kr.id : '', objId: kr ? kr.objectiveId : ctx.objId, docKey: ctx.docKey, sig: krDraftSig(d) }, d);
  },
  tag(ctx, krId) {
    const doc = ctx && ctx.doc;
    const kr = ((doc && doc.keyResults) || []).find((r) => r.id === krId);
    if (!kr) return '';
    const list = krOfObj(doc, kr.objectiveId);
    return krTags(list)[list.indexOf(kr)] || '';
  }
};

function krSheetVM(C, ctx, top) {
  const d = top.d || {};
  const data = top.data || {};
  const doc = krDocOf(C, ctx, data.docKey);
  const isNew = !data.krId;
  const kr = isNew ? null : (doc.keyResults || []).find((r) => r.id === data.krId) || null;
  const obj = krObjOf(C, data.objId);
  const tag = kr ? KR.tag(ctx, kr.id) : '';
  const tt = d.trackingType || 'percentage';
  const set = (p) => C.setDraft(p);
  const pool = krPool(C, ctx);
  const types = KR_TYPES.slice();
  if (d.legacy || tt === 'subkr') types.push(KR_LEGACY);
  const vm = {
    title: isNew ? 'Add key result' : 'Edit key result',
    subtitle: (isNew ? 'New key result for ' : tag + ' in ') + (obj ? obj.statement || obj.id : 'this objective'),
    statement: d.statement || '',
    onStatement: C.bindDraft('statement'),
    onStatementKey: (e) => {
      if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); krSave(C, ctx, false); }
      else if (e.key === 'Escape') C.dismissSheet(e);
    },
    tt: tt,
    typeOpts: types.map((x) => ({ v: x[0], label: x[1] })),
    onType: (e) => {
      const v = e && e.target ? e.target.value : e;
      if (!types.some((x) => x[0] === v)) return;
      const p = { trackingType: v };
      const cur = C.draft();
      if (v === 'kpi' && !(cur.kpis || []).length) { p.kpis = [krDraftKpi(null, pool, doc)]; p.openKpi = 0; }
      set(p);
    },
    typeHint: KR_TYPE_HINT[tt] || '',
    isPct: tt === 'percentage', isKpi: tt === 'kpi', isMs: tt === 'milestone', isSub: tt === 'subkr',
    progress: String(Math.round(krClampPct(d.progress))),
    progressLabel: Math.round(krClampPct(d.progress)) + '%',
    onProgress: (e) => set({ progress: String(Math.round(krClampPct(e && e.target ? e.target.value : e))) }),
    save: () => krSave(C, ctx, false),
    hasLink: krHasKpiApi('openLink'),
    saveLink: () => krSave(C, ctx, true),
    hasDup: !isNew && !!kr,
    dup: () => krDupFromSheet(C, ctx),
    hasDel: !isNew && !!kr,
    del: () => krAskDelete(C, ctx, data.krId),
    close: () => C.closeSheet()
  };
  if (vm.isKpi) Object.assign(vm, krSheetKpis(C, ctx, d, doc, data.objId, pool));
  if (vm.isMs) Object.assign(vm, krSheetSteps(C, d));
  if (vm.isSub) Object.assign(vm, krSheetSubs(C, d));
  return vm;
}

function krSheetKpis(C, ctx, d, doc, objId, pool) {
  const rows = d.kpis || [];
  /* a pulled KPI is listed but not edited here: its sheet is on the KPI table, for leads, the CTO and the CEO */
  const leader = typeof PULL !== 'undefined' && PULL.isLeaderOfObj(C, objId);
  const kpis = rows.map((k, i) => {
    const P = 'kpis.' + i + '.';
    const open = i === d.openKpi && !k.linked && !k.pulled;
    const isStat = k.kpiType === 'statistical', isBin = k.kpiType === 'binary';
    const isRange = k.kpiDir === 'range';
    const unit = k.kpiUnit ? ' ' + k.kpiUnit : '';
    let summary;
    if (k.linked) summary = k.linkedTo ? 'Linked to ' + k.linkedTo : 'Linked';
    else if (isBin) summary = 'Binary';
    else if (isRange) summary = (k.kpiLo !== '' && k.kpiHi !== '') ? k.kpiLo + ' to ' + k.kpiHi + unit : 'No target yet';
    else summary = k.kpiTarget !== '' ? (k.kpiDir === 'decrease' ? '≤ ' : '≥ ') + k.kpiTarget + unit : 'No target yet';
    const name = k.linked ? (k.display || k.name || 'Linked KPI') : (k.name || 'Unnamed KPI');
    const groups = open && isStat ? krSampleGroups(C, ctx, doc, objId, k.id, pool) : [];
    const known = groups.some((g) => g.opts.some((o) => o.v === k.kpiReadsFrom));
    const extra = k.kpiReadsFrom && !known ? [{ v: k.kpiReadsFrom, label: 'Current sample (' + (((pool.find((x) => x.id === k.kpiReadsFrom)) && RD.kpiName(pool.find((x) => x.id === k.kpiReadsFrom), pool)) || k.kpiReadsFrom) + ')' }] : [];
    const dirs = [['increase', 'Increase'], ['decrease', 'Decrease']];
    if (k.wasRange) dirs.push(['range', 'Range']);
    return {
      k: 'kpi-' + i, name: name, linked: !!k.linked, summary: summary, open: open,
      pulled: !!k.pulled, pulledTitle: leader ? 'Pulled from other work. Change it with Edit KPI in the key result’s KPI table.' : 'Pulled from other work. Leads, the CTO and the CEO change it.',
      canToggle: !k.linked && !k.pulled, canRemove: !k.pulled || leader,
      toggleLabel: open ? 'Done' : 'Edit',
      toggleAria: (open ? 'Done editing ' : 'Edit ') + name,
      toggle: () => C.setDraft({ openKpi: open ? -1 : i }),
      removeLabel: 'Remove KPI ' + name,
      remove: () => krRemoveDraftKpi(C, i),
      nameVal: k.name, onName: C.bindDraftPath(P + 'name'),
      unit: k.kpiUnit, onUnit: C.bindDraftPath(P + 'kpiUnit'),
      types: [['demonstration', 'Demonstration'], ['statistical', 'Statistical'], ['binary', 'Binary']].map((x) => ({ label: x[1], on: k.kpiType === x[0] ? 'true' : 'false', pick: () => C.setDraftPath(P + 'kpiType', x[0]) })),
      isStat: isStat, notBin: !isBin,
      readCount: k.kpiReadCount, onReadCount: C.bindDraftPath(P + 'kpiReadCount'),
      readCountCls: krBad(krParse(k.kpiReadCount)) ? 'in bad' : 'in',
      stat: k.kpiStatistic, statOpts: KR_STATS.map((x) => ({ v: x[0], label: x[1] })), onStat: C.bindDraftPath(P + 'kpiStatistic'),
      sample: k.kpiReadsFrom, sampleGroups: groups, sampleExtra: extra, hasSampleExtra: extra.length > 0,
      onSample: C.bindDraftPath(P + 'kpiReadsFrom'),
      dirs: dirs.map((x) => ({ label: x[1], on: k.kpiDir === x[0] ? 'true' : 'false', pick: () => C.setDraftPath(P + 'kpiDir', x[0]) })),
      isRange: isRange, notRange: !isRange,
      target: k.kpiTarget, onTarget: C.bindDraftPath(P + 'kpiTarget'), targetCls: krBad(krParse(k.kpiTarget)) ? 'in bad' : 'in',
      lo: k.kpiLo, onLo: C.bindDraftPath(P + 'kpiLo'), hi: k.kpiHi, onHi: C.bindDraftPath(P + 'kpiHi'),
      loCls: krBad(krParse(k.kpiLo)) ? 'in bad' : 'in', hiCls: krBad(krParse(k.kpiHi)) ? 'in bad' : 'in'
    };
  });
  return {
    kpis: kpis,
    kpiCount: String(rows.length),
    addKpi: () => {
      const cur = C.draft();
      const list = (cur.kpis || []).slice();
      list.push(krDraftKpi(null, pool, doc));
      C.setDraft({ kpis: list, openKpi: list.length - 1 });
    }
  };
}
/* today's sample picker (readsFromGroups, L3355): this objective's statistical KPIs that hold their own
   readings, grouped by key result and by stage-gate; never the KPI being edited */
function krSampleGroups(C, ctx, doc, objId, selfId, pool) {
  const holders = (doc.kpis || []).filter((k) => k.id !== selfId && !k.readsFrom && !k.pull &&   // a pulled KPI has no sample
    (k.targetType === 'statistical' || ((RD.definerOf(k, pool) || {}).targetType === 'statistical')));
  const nm = (k) => ({ v: k.id, label: RD.kpiName(k, pool) || k.id });
  const out = [];
  const krs = krOfObj(doc, objId);
  const tags = krTags(krs);
  krs.forEach((kr, i) => {
    const ks = holders.filter((k) => k.hostType === 'keyResult' && k.hostId === kr.id);
    if (ks.length) out.push({ label: 'Key result ' + tags[i] + ': ' + krTrunc(kr.statement || kr.id, 40), opts: ks.map(nm) });
  });
  (doc.stageGates || []).filter((g) => g.objectiveId === objId).forEach((g) => {
    const ks = holders.filter((k) => k.hostType === 'stageGate' && k.hostId === g.id);
    if (ks.length) out.push({ label: 'Stage-gate ' + krGateLabel(doc, g) + ': ' + krTrunc(g.name || g.id, 40), opts: ks.map(nm) });
  });
  return out;
}
function krRemoveDraftKpi(C, i) {
  const d = C.draft();
  const rows = d.kpis || [];
  if (rows.length <= 1) { C.sheetErr('A KPI-based key result needs at least one KPI. To drop them all, change the tracking type.'); return; }
  const k = rows[i];
  if (!k) return;
  const drop = () => {
    const cur = C.draft();
    const list = (cur.kpis || []).slice();
    const at = list.indexOf(k) >= 0 ? list.indexOf(k) : i;
    list.splice(at, 1);
    let open = cur.openKpi;
    if (open === at) open = -1; else if (open > at) open -= 1;
    if (open >= list.length) open = list.length - 1;
    C.setDraft({ kpis: list, openKpi: open });
  };
  if (k.id && k.reads > 0) {
    C.confirm({
      title: 'Remove ' + (k.linked ? (k.display || k.name) : (k.name || 'this KPI')) + '?',
      body: 'Its ' + F.plural(k.reads, 'reading') + (k.reads === 1 ? ' is' : ' are') + ' deleted when you save the key result.',
      ok: 'Remove KPI', danger: true, onOk: drop
    });
    return;
  }
  drop();
}

function krSheetSteps(C, d) {
  const steps = d.steps || [];
  const parsed = steps.map((s) => ({ id: s.id, weight: krParse(s.weight), completion: krParse(s.completion) }));
  const eff = RD.milestoneEffectiveWeights(parsed.map((p) => ({ id: p.id, weight: (p.weight == null || krBad(p.weight)) ? null : p.weight })));
  const byId = {};
  eff.forEach((e) => { byId[e.id] = e; });
  const tot = eff.reduce((a, e) => a + e.w, 0);
  const exp = parsed.filter((p) => p.weight != null && !krBad(p.weight)).reduce((a, p) => a + p.weight, 0);
  const ok = Math.abs(tot - 100) < 0.05 && exp <= 100;
  const partial = d.creditMode === 'partial';
  const hot = C.state.kr_hot;
  const n = steps.length;
  const rows = steps.map((s, i) => {
    const P = 'steps.' + i + '.';
    const e = byId[s.id] || { w: 0, auto: true };
    const label = s.name ? '“' + krTrunc(s.name, 30) + '”' : 'step ' + (i + 1);
    const c = parsed[i].completion;
    return {
      k: 'step-' + i, num: String(i + 1),
      rowCls: hot === i ? 'dz hot' : 'dz',
      name: s.name, onName: C.bindDraftPath(P + 'name'), ph: 'Step ' + (i + 1), nameAria: 'Name of step ' + (i + 1),
      weight: s.weight, onWeight: C.bindDraftPath(P + 'weight'), weightAria: 'Weight of ' + label + ', in %',
      weightCls: krBad(parsed[i].weight) || (parsed[i].weight != null && parsed[i].weight < 0) ? 'in sm num kr-w bad' : 'in sm num kr-w',
      auto: !!e.auto, autoText: e.w.toFixed(1) + '%',
      due: s.due || '', onDue: C.bindDraftPath(P + 'due'), dueAria: 'Due date of ' + label,
      binary: !partial, partial: partial,
      done: c != null && !krBad(c) && c >= 100,
      onDone: (ev) => C.setDraftPath(P + 'completion', ev && ev.target && ev.target.checked ? '100' : '0'),
      doneAria: 'Done: ' + label,
      completion: s.completion, onCompletion: C.bindDraftPath(P + 'completion'), completionAria: 'Completion of ' + label + ', in %',
      completionCls: krBad(c) ? 'in sm num kr-c bad' : 'in sm num kr-c',
      upOff: i === 0, downOff: i === n - 1,
      upAria: 'Move ' + label + ' up', downAria: 'Move ' + label + ' down',
      up: () => krMoveStep(C, i, i - 1), down: () => krMoveStep(C, i, i + 1),
      canRemove: n > 1, removeAria: 'Remove ' + label,
      remove: () => { const list = (C.draft().steps || []).slice(); if (list.length <= 1) return; list.splice(i, 1); C.setDraft({ steps: list }); },
      dragStart: (ev) => { C._krDrag = { i: i }; try { if (ev && ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', 'step-' + i); } } catch (x) { /* ignore */ } },
      dragOver: (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); if (C._krDrag && C.state.kr_hot !== i) C.setState({ kr_hot: i }); },
      drop: (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); const from = C._krDrag ? C._krDrag.i : -1; C._krDrag = null; C.setState({ kr_hot: -1 }); if (from >= 0 && from !== i) krMoveStep(C, from, i); },
      dragEnd: () => { C._krDrag = null; if (C.state.kr_hot !== -1) C.setState({ kr_hot: -1 }); }
    };
  });
  return {
    creditModes: [['binary', 'Binary'], ['partial', 'Partial']].map((x) => ({ label: x[1], on: (d.creditMode || 'binary') === x[0] ? 'true' : 'false', pick: () => C.setDraft({ creditMode: x[0] }) })),
    creditHint: partial ? 'Weight scales by % complete.' : 'Full weight only when a step is done, strictly at 100%.',
    compHead: partial ? 'Completion' : 'Done',
    steps: rows, hasSteps: n > 0, noSteps: n === 0,
    sumText: tot.toFixed(1) + '% of 100%',
    sumCls: ok ? 'st t-ok' : 'st t-warn',
    sumWarn: n > 0 && !ok,
    sumHint: exp > 100 ? 'The weights you set add up to more than 100%. Lower them so the steps total 100%.' : 'Weights should total 100%. Blank weights share whatever is left.',
    addStep: () => {
      const list = (C.draft().steps || []).slice();
      let max = 0;
      list.forEach((s) => { const m = /(\d+)$/.exec(String(s.id || '')); if (m) max = Math.max(max, Number(m[1])); });
      list.push({ id: 'ST-' + (Math.max(max, list.length) + 1), name: '', weight: '', due: '', completion: '0' });
      C.setDraft({ steps: list });
    }
  };
}
function krMoveStep(C, from, to) {
  const list = (C.draft().steps || []).slice();
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return;
  C.setDraft({ steps: K.move(list, from, to) });
}

function krSheetSubs(C, d) {
  const subs = d.subKrs || [];
  const rows = krSubRows(subs).map((r, i) => Object.assign(r, {
    edit: () => krOpenSub(C, i),
    editAria: 'Edit sub-key result ' + r.name,
    removeAria: 'Remove sub-key result ' + r.name,
    remove: () => { const list = (C.draft().subKrs || []).slice(); list.splice(i, 1); C.setDraft({ subKrs: list }); }
  }));
  return { subs: rows, hasSubs: rows.length > 0, noSubs: !rows.length, addSub: () => krOpenSub(C, null) };
}

/* save, today's saveKrModal (Sales L2662–2708, which also writes milestone steps and credit mode) */
function krSave(C, ctx, thenLink) {
  const top = C.sheet();
  if (!top || top.kind !== 'kr.edit') return;
  const d = top.d || {};
  const data = top.data || {};
  const statement = String(d.statement || '').trim();
  if (!statement) { C.sheetErr('Key result needs a statement.'); return; }
  const tt = d.trackingType || 'percentage';
  /* checks the old modals skipped: a typo used to save as "no target" (or NaN) without a word */
  if (tt === 'kpi') {
    for (let i = 0; i < (d.kpis || []).length; i++) {
      const r = d.kpis[i];
      if (r.linked || r.pulled || r.kpiType === 'binary') continue;
      const nm = r.name ? '“' + r.name + '”' : 'KPI ' + (i + 1);
      if (r.kpiDir === 'range') {
        const lo = krParse(r.kpiLo), hi = krParse(r.kpiHi);
        if (krBad(lo) || krBad(hi)) { C.setDraft({ openKpi: i }); C.sheetErr('Use numbers for the range of ' + nm + ', like 6 and 10.'); return; }
        if ((lo == null) !== (hi == null)) { C.setDraft({ openKpi: i }); C.sheetErr('Enter both ends of the range for ' + nm + ', or clear both.'); return; }
        if (lo != null && hi != null && lo > hi) { C.setDraft({ openKpi: i }); C.sheetErr('The low end of the range for ' + nm + ' is above the high end. Swap them.'); return; }
      } else if (krBad(krParse(r.kpiTarget))) { C.setDraft({ openKpi: i }); C.sheetErr('Use a number for the target of ' + nm + ', like 1.85.'); return; }
      if (r.kpiType === 'statistical') {
        const rc = krParse(r.kpiReadCount);
        if (krBad(rc) || (rc != null && (rc < 1 || Math.round(rc) !== rc))) { C.setDraft({ openKpi: i }); C.sheetErr('Use a whole number of readings for ' + nm + ', like 10, or leave it blank.'); return; }
      }
    }
  }
  if (tt === 'milestone') {
    for (let i = 0; i < (d.steps || []).length; i++) {
      const s = d.steps[i];
      const w = krParse(s.weight), c = krParse(s.completion);
      const nm = s.name ? '“' + krTrunc(s.name, 30) + '”' : 'step ' + (i + 1);
      if (krBad(w) || (w != null && w < 0)) { C.sheetErr('Use a number for the weight of ' + nm + ', like 25, or leave it blank to share what is left.'); return; }
      if (krBad(c)) { C.sheetErr('Use a completion from 0 to 100 for ' + nm + ', like 60.'); return; }
      if (s.due && !/^\d{4}-\d{2}-\d{2}$/.test(String(s.due))) { C.sheetErr('Use a date like 2026-11-20 for ' + nm + ', or leave it blank.'); return; }
    }
  }
  let savedId = data.krId || null;
  let created = false;
  const ok = C.mutate((D) => {
    const doc = krDocOf(C, ctx, data.docKey);
    const objId = data.objId || ctx.objId;
    let kr = data.krId ? (doc.keyResults || []).find((x) => x.id === data.krId) : null;
    if (!kr) {
      const id = RD.allocId('keyResult', objId, (doc.keyResults || []).map((x) => x.id));
      kr = { id: id, objectiveId: objId };
      (doc.keyResults = doc.keyResults || []).push(kr);
      created = true;
    }
    savedId = kr.id;
    kr.statement = statement;
    kr.trackingType = tt;
    if (tt === 'percentage') { kr.progress = krClampPct(d.progress); delete kr.subKrs; delete kr.steps; delete kr.creditMode; }
    else if (tt === 'subkr') { kr.subKrs = K.clone(d.subKrs || []); delete kr.progress; delete kr.steps; delete kr.creditMode; }
    else if (tt === 'milestone') {
      kr.creditMode = d.creditMode || 'binary';
      kr.steps = (d.steps || []).map((x) => {
        const w = krParse(x.weight), c = krParse(x.completion);
        return { id: x.id, name: String(x.name || '').trim(), weight: w == null ? null : w, due: krIso(x.due), completion: c == null ? 0 : krClampPct(c) };
      });
      delete kr.progress; delete kr.subKrs;
    } else { delete kr.progress; delete kr.subKrs; delete kr.steps; delete kr.creditMode; }
    if (tt === 'kpi') {
      /* existing KPIs are updated in place so their readings survive; an unnamed KPI takes the
         statement; KPIs removed here go with their readings. Linked KPIs keep what they inherit. */
      const keep = {};
      const kpis = (doc.kpis = doc.kpis || []);
      (d.kpis || []).forEach((row) => {
        let pk = row.id ? kpis.find((x) => x.id === row.id) : null;
        if (row.linked || row.pulled) { if (pk) keep[pk.id] = 1; return; }   // linked and pulled KPIs are not rewritten here
        if (!pk) {
          const id = RD.allocId('kpi', objId, kpis.map((x) => x.id));
          pk = { id: id, objectiveId: objId, hostType: 'keyResult', hostId: kr.id, groupId: null, isDefiner: true };
          kpis.push(pk);
        }
        keep[pk.id] = 1;
        pk.name = String(row.name || '').trim() || kr.statement;
        pk.targetType = row.kpiType;
        if (row.kpiType === 'binary') {
          pk.direction = null; pk.target = null; pk.unit = null;
          delete pk.statistic; delete pk.readCount; delete pk.readsFrom; delete pk.rangeSpec;
        } else {
          if (row.kpiDir === 'range') {
            const lo = krParse(row.kpiLo), hi = krParse(row.kpiHi);
            const prev = pk.target && typeof pk.target === 'object' ? pk.target : null;
            pk.direction = 'range';
            pk.target = lo == null || hi == null ? null : { lo: lo, hi: hi };
            if (!pk.target) delete pk.rangeSpec;
            else if (!(prev && prev.lo === lo && prev.hi === hi)) pk.rangeSpec = { mode: 'minmax' };
          } else {
            pk.direction = row.kpiDir === 'decrease' ? 'down' : 'up';
            pk.target = krParse(row.kpiTarget);
            delete pk.rangeSpec;
          }
          pk.unit = row.kpiUnit || null;
          if (row.kpiType === 'statistical') {
            pk.statistic = row.kpiStatistic || 'average';
            const rc = krParse(row.kpiReadCount);
            pk.readCount = rc == null ? '' : rc;
            if (row.kpiReadsFrom) pk.readsFrom = row.kpiReadsFrom; else delete pk.readsFrom;
          } else { delete pk.statistic; delete pk.readCount; delete pk.readsFrom; }
        }
      });
      const dropped = kpis.filter((k) => k.hostType === 'keyResult' && k.hostId === kr.id && !keep[k.id]).map((k) => k.id);
      if (dropped.length) {
        krDetach(doc, krPool(C, ctx), dropped);
        doc.kpis = doc.kpis.filter((k) => dropped.indexOf(k.id) < 0);
        doc.kpiUpdates = (doc.kpiUpdates || []).filter((u) => dropped.indexOf(u.kpiId) < 0);
      }
    }
  }, { msg: 'Key result saved.' });
  if (!ok) return;
  const patch = { sheets: [], menu: '' };
  if (created && savedId) patch.kr_open = Object.assign({}, C.state.kr_open, { [savedId]: true });
  C.setState(patch);
  if (thenLink === true && savedId && krHasKpiApi('openLink')) KPI.openLink(C, C.ctx || ctx, { type: 'keyResult', id: savedId });
}

function krDupFromSheet(C, ctx) {
  const top = C.sheet();
  if (!top || top.kind !== 'kr.edit' || !top.data.krId) return;
  const id = top.data.krId;
  const dirty = krDraftSig(top.d || {}) !== top.data.sig;
  if (dirty) {
    C.confirm({
      title: 'Duplicate the saved key result?',
      body: 'The copy is made from the saved version, so the changes you haven’t saved here are discarded.',
      ok: 'Duplicate', onOk: () => krDuplicate(C, ctx, id)
    });
    return;
  }
  krDuplicate(C, ctx, id);
}

/* --------------------------------------------- legacy sub-KR (today L4050–4135) */
function krOpenSub(C, idx) {
  const d = C.draft();
  const ex = idx != null ? (d.subKrs || [])[idx] : null;
  const k = (ex && ex.kpis && ex.kpis[0]) || null;
  const draft = {
    name: ex ? ex.name || '' : '',
    weight: ex && ex.weight != null ? String(ex.weight) : '1',
    trackingType: ex ? (ex.trackingType === 'kpi' ? (k && ['demonstration', 'statistical', 'binary'].indexOf(k.targetType || k.type) >= 0 ? (k.targetType || k.type) : 'demonstration') : 'percentage') : 'percentage',
    progress: ex && ex.progress != null ? String(krClampPct(ex.progress)) : '0',
    dir: k && (k.direction === 'down' || k.direction === 'decrease') ? 'decrease' : 'increase',
    target: k && k.target != null ? String(k.target) : '',
    unit: k && k.unit ? k.unit : '',
    statistic: k && k.statistic ? k.statistic : 'average',
    readCount: k && k.readCount != null && k.readCount !== '' ? String(k.readCount) : '',
    current: k && k.current != null ? String(k.current) : '',
    readings: k && k.readings != null ? String(k.readings) : '',
    metFlag: k && k.current != null ? (Number(k.current) >= 1 ? '1' : '0') : ''
  };
  C.pushSheet('kr.sub', { idx: idx }, draft);
}
function krSubVM(C, ctx, top) {
  const d = top.d || {};
  const t = d.trackingType || 'percentage';
  const isPct = t === 'percentage', isDemo = t === 'demonstration', isStat = t === 'statistical', isBin = t === 'binary';
  const nums = krParseNums(d.readings);
  let preview = 'No readings yet';
  if (nums.length) {
    const v = RD.computeStat(d.statistic || 'average', nums);
    preview = krStatLabel(d.statistic) + ': ' + (v == null ? '—' : Math.round(v * 1000) / 1000) + ' from ' + F.plural(nums.length, 'reading');
  }
  return {
    title: top.data && top.data.idx != null ? 'Edit sub-key result' : 'Add sub-key result',
    types: [['percentage', '% completion'], ['demonstration', 'Demonstration'], ['statistical', 'Statistical'], ['binary', 'Binary']].map((x) => ({ label: x[1], on: t === x[0] ? 'true' : 'false', pick: () => C.setDraft({ trackingType: x[0] }) })),
    isPct: isPct, isDemo: isDemo, isStat: isStat, isBin: isBin, showKpi: !(isPct || isBin),
    name: d.name || '', onName: C.bindDraft('name'),
    onNameKey: (e) => { if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); krSubSave(C); } else if (e.key === 'Escape') C.dismissSheet(e); },
    weight: d.weight, onWeight: C.bindDraft('weight'),
    readCount: d.readCount, onReadCount: C.bindDraft('readCount'),
    stat: d.statistic || 'average', statOpts: KR_STATS.map((x) => ({ v: x[0], label: x[1] })), onStat: C.bindDraft('statistic'),
    dirs: [['increase', 'Increase'], ['decrease', 'Decrease']].map((x) => ({ label: x[1], on: (d.dir || 'increase') === x[0] ? 'true' : 'false', pick: () => C.setDraft({ dir: x[0] }) })),
    target: d.target, onTarget: C.bindDraft('target'),
    unit: d.unit, onUnit: C.bindDraft('unit'),
    progress: String(Math.round(krClampPct(d.progress))), progressLabel: Math.round(krClampPct(d.progress)) + '%',
    onProgress: (e) => C.setDraft({ progress: String(Math.round(krClampPct(e && e.target ? e.target.value : e))) }),
    current: d.current, onCurrent: C.bindDraft('current'),
    readings: d.readings, onReadings: C.bindDraft('readings'),
    preview: preview,
    mets: [['', 'Unmeasured'], ['0', 'Not met'], ['1', 'Met']].map((x) => ({ label: x[1], on: String(d.metFlag || '') === x[0] ? 'true' : 'false', pick: () => C.setDraft({ metFlag: x[0] }) })),
    save: () => krSubSave(C),
    cancel: () => C.closeSheet()
  };
}
function krSubSave(C) {
  const sheets = C.state.sheets || [];
  const top = sheets[sheets.length - 1];
  const under = sheets[sheets.length - 2];
  if (!top || top.kind !== 'kr.sub') return;
  if (!under || under.kind !== 'kr.edit') { C.closeSheet(); return; }
  const d = top.d || {};
  const nm = String(d.name || '').trim();
  if (!nm) { C.sheetErr('Give the sub-key result a name.'); return; }
  const wt = krParse(d.weight);
  if (krBad(wt) || (wt != null && wt < 0.1)) { C.sheetErr('Use a weight of 0.1 or more, like 1.'); return; }
  const w = wt == null ? 1 : wt;
  const t = d.trackingType || 'percentage';
  let skr;
  if (t === 'percentage') skr = { name: nm, weight: w, trackingType: 'percentage', progress: krClampPct(d.progress), kpis: [] };
  else {
    const k = { type: t, targetType: t, name: nm, current: null };
    if (t === 'binary') k.current = d.metFlag === '' || d.metFlag == null ? null : Number(d.metFlag);
    else {
      const tg = krParse(d.target);
      if (krBad(tg)) { C.sheetErr('Use a number for the target, like 1.2.'); return; }
      k.direction = d.dir === 'decrease' ? 'down' : 'up';
      k.target = tg;
      k.unit = d.unit || null;
      if (t === 'statistical') {
        const rc = krParse(d.readCount);
        if (krBad(rc) || (rc != null && (rc < 1 || Math.round(rc) !== rc))) { C.sheetErr('Use a whole number of readings, like 10, or leave it blank.'); return; }
        k.statistic = d.statistic || 'average';
        k.readCount = rc == null ? '' : rc;
        k.readings = String(d.readings || '').trim();
        const nums = krParseNums(d.readings);
        k.current = nums.length ? RD.computeStat(k.statistic, nums) : null;
      } else {
        const cur = krParse(d.current);
        if (krBad(cur)) { C.sheetErr('Use a number for the current measurement, like 0.22, or leave it blank.'); return; }
        k.current = cur;
      }
    }
    skr = { name: nm, weight: w, trackingType: 'kpi', progress: 0, kpis: [k] };
  }
  const subs = ((under.d && under.d.subKrs) || []).slice();
  const idx = top.data ? top.data.idx : null;
  if (idx != null && idx >= 0 && idx < subs.length) subs[idx] = skr; else subs.push(skr);
  const next = sheets.slice(0, -1);
  next[next.length - 1] = Object.assign({}, under, { d: Object.assign({}, under.d, { subKrs: subs }), err: '' });
  C.setState({ sheets: next, menu: '' });
}

/* ------------------------------------------------------------ overview */
/* ------------------------------------------------------------------ vm */
function krVM(C, ctx) {
  const ro = !!ctx.ro;
  const doc = ctx.doc || {};
  const obj = ctx.obj;
  const list = obj ? krOfObj(doc, obj.id) : [];
  const tags = krTags(list);
  const vm = {
    ready: true, ro: ro, canEdit: !ro && !!obj,
    count: String(list.length),
    has: list.length > 0, none: !list.length,
    emptyText: 'No key results yet. A key result groups the KPIs that score this objective; without one, the objective has no score.',
    emptyHint: ro ? '' : 'Add one to start scoring.',
    add: () => KR.openEditor(C, ctx, null),
    rows: [], sheet: null, sub: null
  };
  if (obj && list.length) {
    const pool = krPool(C, ctx);
    list.forEach((kr, i) => {
      const b = krBase(C, ctx, kr, tags[i]);
      vm.rows.push(krRow(C, ctx, kr, b, pool));
    });
  }
  const top = C.sheet();
  if (top && top.kind === 'kr.edit') vm.sheet = krSheetVM(C, ctx, top);
  if (top && top.kind === 'kr.sub') vm.sub = krSubVM(C, ctx, top);
  return vm;
}

/* -------------------------------------------------------------- search */
function krSearch(C, ctx, q) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return [];
  const prefix = APP === 'sales' ? 'BIZ-' : 'EXEC-';
  const objs = (C.D.portfolio && C.D.portfolio.objectives) || [];
  const out = [];
  (ctx.divs || []).forEach((div) => {
    const doc = C.D.docs[prefix + div.id];
    if (!doc) return;
    (doc.keyResults || []).forEach((kr) => {
      if (String(kr.statement || '').toLowerCase().indexOf(t) < 0) return;
      const o = objs.find((x) => x.id === kr.objectiveId);
      if (!o) return;
      const list = krOfObj(doc, o.id);
      const tag = krTags(list)[list.indexOf(kr)];
      out.push({
        label: kr.statement || kr.id,
        sub: 'Key result ' + tag + ' in ' + (o.statement || o.id) + (div.id !== ctx.divId ? ', ' + div.name : ''),
        go: () => {
          const patch = { divId: div.id, objId: o.id, tab: 'krs', kr_open: Object.assign({}, C.state.kr_open, { [kr.id]: true }), kr_cell: null, menu: '', sheets: [], q: '', searchOpen: false };
          if (!(ctx.objs || []).some((x) => x.id === o.id)) { patch.fQuarter = ''; patch.fProduct = ''; patch.fOwner = ''; }
          C.setState(patch);
        }
      });
    });
  });
  return out.slice(0, 8);
}

MODS.kr = {
  state: { kr_open: {}, kr_cell: null, kr_hot: -1, kr_focus: '' },
  wide: ['kr.edit'],
  vm(C, ctx) { return krVM(C, ctx); },
  search(C, ctx, q) { return krSearch(C, ctx, q); }
};
