/* ============================================================================
   Stage-gates (X-gates). Built into Execution and Sales.
   Owns: the Stage-gates tab (workstreams, gates, the legacy "revised plan"
   banner, plan history), every gate
   and workstream sheet, Execution's versioned "Revise plan" editor and Sales'
   simple per-gate re-commit ("Build revised plan").

   Public (other modules and the shell call these):
     GATES.openRevise(C, ctx)        Execution: "Revise plan"; Sales: "Build revised plan"
     GATES.openGate(C, ctx, gateId)  go to the gate's objective, Stage-gates tab, open its sheet
     GATES.label(doc, gateId)        'SG-A1' (workstream letter + due-date position), as today
     MODS.gates.api === GATES (for scenario tests)
   Auto-pass runs after every C.mutate by any module (gxHook, installed once from state(C)).
   The Overview's stage-gate rows are drawn by mods/review (since October 15); a gate opened from there is
   expanded (gates_open) and highlighted (gates_focus) here.

   Rules and messages follow execution_app.template.html L3631–3753, L4588–4801,
   L5328–5767 and sales_app.template.html L3272–3621, L4140–4193. Fixes over today
   are marked "fixed:" below and listed in mods/gates/COVERAGE.md.
   ========================================================================== */

const GX_STATUS = [['pending', 'Pending'], ['active', 'In progress'], ['hit', 'Passed'], ['missed', 'Failed']];
const GX_STATE = { passed: ['Passed', 'ok'], 'passed-late': ['Passed late', 'warn'], overdue: ['Overdue', 'bad'], pending: ['Pending', 'none'], cancelled: ['Cancelled', 'none'] };
const GX_VAR = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', none: 'var(--none)', info: 'var(--accent)' };

/* ------------------------------------------------------------------ helpers */
function gxErr(C, where, e) {
  try { console.error('[calm] gates ' + where, e); } catch (x) { /* no console */ }
  (C._vmErrors || (C._vmErrors = [])).push('gates.' + where + ': ' + (e && e.message ? e.message : e));
}
/* a getter on the view model that is computed once per render, only when the template reads it */
function gxLazy(C, o, key, fn, fb) {
  Object.defineProperty(o, key, {
    enumerable: true, configurable: true,
    get() { return C.memo('gates.' + key, () => { try { return fn(); } catch (e) { gxErr(C, key, e); return fb; } }); }
  });
}
function gxTxt(v) { return String(v == null ? '' : v).trim(); }
function gxSetsOf(doc, objId) {
  return ((doc && doc.stageGateSets) || []).filter((s) => s && s.objectiveId === objId).slice()
    .sort((a, b) => ((a.order || 0) - (b.order || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
}
function gxSortDue(list) {
  return list.slice().sort((a, b) => {
    const pa = a.plannedDate == null ? Infinity : a.plannedDate, pb = b.plannedDate == null ? Infinity : b.plannedDate;
    return (pa - pb) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id));
  });
}
function gxGatesOf(doc, objId) { return ((doc && doc.stageGates) || []).filter((g) => g && g.objectiveId === objId); }
function gxGate(doc, id) { return ((doc && doc.stageGates) || []).find((g) => g && g.id === id) || null; }
/* 'SG-A1': workstream letter by position, number by due date inside the workstream (today's gateLabel) */
function gxLabel(doc, gateId) {
  const gs = (doc && doc.stageGates) || [];
  const g = gs.find((x) => x && x.id === gateId);
  if (!g) return String(gateId);
  const peers = gxSortDue(gs.filter((x) => x.objectiveId === g.objectiveId && x.setId === g.setId));
  const n = peers.findIndex((x) => x.id === gateId) + 1;
  if (n < 1) return String(gateId);
  const si = gxSetsOf(doc, g.objectiveId).findIndex((s) => s.id === g.setId);
  return 'SG-' + (si >= 0 ? String.fromCharCode(65 + si) : '') + n;
}
function gxD(ctx, d) { return F.dayAuto(d, ctx.today); }
function gxDays(n) { return F.plural(Math.abs(n), 'day'); }
function gxObjName(ctx, objId) {
  const o = ((ctx.P && ctx.P.objectives) || []).find((x) => x.id === objId);
  return o ? (o.statement || o.id) : (objId || 'No objective');
}
/* every KPI the gate tables can resolve through: this doc, the portfolio, the spec docs (today's allKpisPool) */
function gxPool(C, ctx) {
  return C.memo('gates.pool', () => {
    try { if (typeof KPI !== 'undefined' && KPI && typeof KPI.pool === 'function') { const p = KPI.pool(C, ctx); if (Array.isArray(p)) return p; } } catch (e) { /* fall back below */ }
    const out = [], seen = {};
    const add = (k) => { if (k && k.id && !seen[k.id]) { seen[k.id] = 1; out.push(k); } };
    Object.keys(ctx.em || {}).forEach((key) => (((ctx.em[key] || {}).kpis) || []).forEach(add));
    const sp = ctx.spec || {};
    Object.keys(sp).forEach((key) => (((sp[key] || {}).kpis) || []).forEach(add));
    return out;
  });
}
function gxCasc(C, ctx) {
  return C.memo('gates.casc', () => {
    try { return RD.cascade(ctx.P, ctx.em, ctx.today); } catch (e) { return { gateEffective: {}, gateForecastEarliest: {}, gateAcceleration: {}, objectiveScheduleSlip: {} }; }
  });
}
function gxMarks(C, ctx) {
  if (APP === 'sales') return {};
  return C.memo('gates.marks', () => { try { return RD.gateVersionMarks(ctx.doc, ctx.objId) || {}; } catch (e) { return {}; } });
}
/* a plan revision by name: Execution's plan versions ("Plan v2"), Sales' re-commit ("The revised plan") */
function gxRevName(rev) { return rev && rev.v ? 'Plan v' + rev.v : 'The revised plan'; }
function gxMarkText(m) {
  if (!m) return null;
  if (m.kind === 'added') return { text: 'Added in v' + m.v, title: 'Added in plan version ' + m.v };
  if (m.kind === 'moved') {
    const d = m.deltaDays;
    return { text: 'Moved in v' + m.v + (d != null ? ' (' + (d > 0 ? '+' : d < 0 ? '−' : '') + gxDays(d) + ')' : ''), title: 'Date moved in plan version ' + m.v };
  }
  if (m.kind === 'retargeted') return { text: 'Retargeted in v' + m.v, title: 'Targets changed in plan version ' + m.v };
  return { text: 'Renamed in v' + m.v, title: 'Changed in plan version ' + m.v };
}
/* the KPI module's table for a gate (its footer carries Add target, Link a metric and, in Execution, Connect data) */
function gxKT(C, ctx, gid, opts) {
  opts = Object.assign({ connect: APP !== 'sales' }, opts || {});
  try {
    if (typeof KPI !== 'undefined' && KPI && typeof KPI.table === 'function') return KPI.table(C, ctx, { type: 'stageGate', id: gid }, opts);
  } catch (e) { gxErr(C, 'KPI.table threw', e); }
  return { key: 'stageGate:' + gid, head: { name: 'Target', target: 'Pass criterion' }, rows: [], has: false, empty: true, emptyText: 'The KPI table is not available in this build.',
    cols: 5, showActs: false, canAdd: false, add: null, addLabel: '', canLink: false, link: null, linkLabel: '', canConnect: false, connect: null, hasFoot: false };
}
function gxKpiTarget(C, ctx, gid, kpiId) {
  if (typeof KPI !== 'undefined' && KPI && typeof KPI.openTarget === 'function') { KPI.openTarget(C, ctx, { type: 'stageGate', id: gid }, kpiId || null); return; }
  C.toast('The target editor is not available in this build.', 'info');
}
function gxLink(C, ctx, gid) {
  if (typeof KPI !== 'undefined' && KPI && typeof KPI.openLink === 'function') { KPI.openLink(C, ctx, { type: 'stageGate', id: gid }); return; }
  C.toast('Linking a KPI is not available in this build.', 'info');
}
function gxConnect(C, ctx, gid) {
  if (typeof KPI !== 'undefined' && KPI && typeof KPI.openConnect === 'function') { KPI.openConnect(C, ctx, { host: { type: 'stageGate', id: gid } }); return; }
  C.toast('Connect data is not available in this build.', 'info');
}
/* the gate's KPIs as today's tables list them: own objective, hosted on this gate */
function gxGateKpis(C, ctx, g) {
  return gxPool(C, ctx).filter((k) => k.objectiveId === g.objectiveId && k.hostType === 'stageGate' && k.hostId === g.id);
}
function gxTargetText(dir, t, unit, isBin) {
  if (isBin) return 'Pass';
  if (t == null) return 'No target yet';
  if (typeof t === 'object') return F.n(t.lo) + ' to ' + F.u(t.hi, unit);
  return (dir === 'down' ? 'At most ' : dir === 'up' ? 'At least ' : '') + F.u(t, unit);
}
/* KPI rows of the completion sheet (today's gateKpiRows): name, Partial n/N, target, current coloured by the raw score */
function gxKpiRows(C, ctx, g) {
  const AK = gxPool(C, ctx), EM = ctx.em;
  return gxGateKpis(C, ctx, g).map((k) => {
    const defn = RD.definerOf(k, AK) || k;
    const unit = RD.kpiUnit(k, AK) || '';
    const p = RD.kpiScoreParts(k, AK, EM);
    const cv = RD.effValue(k, AK, EM);
    const isBin = defn.targetType === 'binary', isStat = defn.targetType === 'statistical';
    const tone = F.band(p.raw);
    let cur = 'No reading';
    if (cv != null) cur = isBin ? (Number(cv) >= 1 ? 'Met' : 'Not met') : F.u(isStat ? Math.round(Number(cv) * 1000) / 1000 : cv, unit);
    return {
      name: RD.kpiName(k, AK) || 'Unnamed KPI',
      partial: !!p.partial, partialText: p.partial ? 'Partial, ' + p.n + ' of ' + p.expected : '',
      target: gxTargetText(RD.kpiDirection(k, AK), RD.effTarget(k, AK), unit, isBin),
      cur: cur, curCls: 'st ' + F.tone(cv == null ? 'none' : tone)
    };
  });
}
/* transitive successors through explicit predecessor links (fixed: today only blocks 2-cycles) */
function gxSuccessors(doc, gid) {
  const out = {}, stack = [gid];
  const edges = (doc && doc.stageGateEdges) || [];
  while (stack.length) {
    const x = stack.pop();
    edges.forEach((e) => { if (e && e.fromGate === x && !out[e.toGate]) { out[e.toGate] = 1; stack.push(e.toGate); } });
  }
  return out;
}
/* delete gates and everything that hangs off them. Today's workstream delete left predecessor links (it
   filtered e.from/e.to, but links are fromGate/toGate) and readings; plan commit left readings; gate
   delete left links and FMEA gate associations. fixed: all four go. Returns the counts. */
function gxRemoveGates(doc, ids) {
  const out = { gates: 0, kpis: 0, reads: 0, links: 0, risks: 0 };
  if (!ids || !ids.length) return out;
  const idset = {}; ids.forEach((i) => { idset[i] = 1; });
  const kids = {};
  doc.kpis = (doc.kpis || []).filter((k) => { if (k && k.hostType === 'stageGate' && idset[k.hostId]) { kids[k.id] = 1; out.kpis++; return false; } return true; });
  const r0 = (doc.kpiUpdates || []).length;
  doc.kpiUpdates = (doc.kpiUpdates || []).filter((u) => !(u && kids[u.kpiId]));
  out.reads = r0 - doc.kpiUpdates.length;
  const e0 = (doc.stageGateEdges || []).length;
  doc.stageGateEdges = (doc.stageGateEdges || []).filter((e) => !(e && (idset[e.fromGate] || idset[e.toGate])));
  out.links = e0 - doc.stageGateEdges.length;
  (doc.risks || []).forEach((r) => { if (r && r.gateId && idset[r.gateId]) { r.gateId = null; out.risks++; } });
  const g0 = (doc.stageGates || []).length;
  doc.stageGates = (doc.stageGates || []).filter((g) => !(g && idset[g.id]));
  out.gates = g0 - doc.stageGates.length;
  return out;
}
/* New ids: RD.allocId over every id the objective's history still refers to (live gates, plan-version
   snapshots, legacy catch-up entries), so a gate deleted in a revision never hands its id to a new one and
   plan history keeps reading "removed" and "added" rather than "renamed". */
function gxNewGateId(doc, objId, extra) {
  const ids = ((doc && doc.stageGates) || []).map((g) => g.id);
  ((doc && doc.planVersions) || []).forEach((v) => (((v && v.snapshot && v.snapshot.gates) || [])).forEach((g) => { if (g && g.id) ids.push(g.id); }));
  ((doc && doc.catchupPlans) || []).forEach((p) => (((p && p.gates) || [])).forEach((e) => { if (e && e.gateId) ids.push(e.gateId); }));
  return RD.allocId('stageGate', objId, ids.concat(extra || []));
}
function gxNewKpiId(doc, objId) {
  const ids = ((doc && doc.kpis) || []).map((k) => k.id);
  ((doc && doc.planVersions) || []).forEach((v) => (((v && v.snapshot && v.snapshot.gates) || [])).forEach((g) => (((g && g.kpis) || [])).forEach((k) => { if (k && k.kpiId) ids.push(k.kpiId); })));
  return RD.allocId('kpi', objId, ids);
}
/* what deleting these gates takes with it, for the confirm text */
function gxLossText(doc, ids) {
  const idset = {}; ids.forEach((i) => { idset[i] = 1; });
  const ks = (doc.kpis || []).filter((k) => k && k.hostType === 'stageGate' && idset[k.hostId]);
  const kid = {}; ks.forEach((k) => { kid[k.id] = 1; });
  const nr = (doc.kpiUpdates || []).filter((u) => u && kid[u.kpiId]).length;
  const nl = (doc.stageGateEdges || []).filter((e) => e && (idset[e.fromGate] || idset[e.toGate])).length;
  const nf = (doc.risks || []).filter((r) => r && r.gateId && idset[r.gateId]).length;
  const parts = [F.plural(ks.length, 'target')];
  if (nr) parts.push(F.plural(nr, 'reading'));
  if (nl) parts.push(F.plural(nl, 'predecessor link'));
  if (nf) parts.push(F.plural(nf, 'FMEA gate link'));
  return F.list(parts);
}

/* ---------------------------------------------------------------- auto-pass
   Today a gate with no passed date whose discounted readiness is exactly 100 is passed on every render
   (L3507). That also re-passed a gate the moment someone un-completed it (§24). Calm passes a gate when its
   readiness REACHES 100: after every data change (any module's C.mutate) the module compares each gate
   before and after, and on load every gate at 100 passes (seed_gates). fixed: un-complete now sticks. */
function gxDocKeys(D) {
  /* the documents this app edits: Execution's, Sales', or both for My Projects (apps/mine) */
  const pre = APP === 'sales' ? ['BIZ-'] : APP === 'mine' ? ['EXEC-', 'BIZ-'] : ['EXEC-'];
  return Object.keys((D && D.docs) || {}).filter((k) => pre.some((p) => k.indexOf(p) === 0));
}
function gxEmOf(D, key) { const m = {}; m[String(key).replace(/^[A-Z]+-/, '')] = D.docs[key]; return RD.withPortfolio(D.portfolio, m); }
function gxAtTargetMap(D, keys) {
  const m = {};
  keys.forEach((key) => {
    const doc = D.docs[key];
    if (!doc || !(doc.stageGates || []).length) return;
    const em = gxEmOf(D, key);
    doc.stageGates.forEach((g) => { if (g && g.id) { let at = false; try { at = RD.gateAtTarget(g.id, em); } catch (e) { at = false; } m[key + '|' + g.id] = at; } });
  });
  return m;
}
function gxAutoPass(D, keys, before) {
  const after = gxAtTargetMap(D, keys), passed = [];
  keys.forEach((key) => {
    const doc = D.docs[key];
    if (!doc) return;
    (doc.stageGates || []).forEach((g) => {
      const k = key + '|' + g.id;
      if (g && g.actualDate == null && after[k] && !(before && before[k])) {
        g.actualDate = D.today; g.completionMethod = 'auto';
        passed.push({ key: key, g: g });
      }
    });
  });
  return passed;
}
function gxHook(C) {
  if (!C || C.__gxHook || typeof C.mutate !== 'function') return;
  C.__gxHook = true;
  const orig = C.mutate;
  C.mutate = function (fn, opts) {
    let before = null, keys = null;
    try { keys = gxDocKeys(C.D); before = gxAtTargetMap(C.D, keys); } catch (e) { before = null; }
    const ok = orig.call(C, fn, opts);
    if (ok && before) {
      try {
        const passed = gxAutoPass(C.D, keys, before);
        if (passed.length) {
          C.D.version = (C.D.version || 0) + 1;   // a passed gate changes what pulled KPIs read (mods/pull)
          const one = passed[0];
          C.toast(passed.length === 1
            ? gxLabel(C.D.docs[one.key], one.g.id) + ' ' + (one.g.name || '') + ' passed: every target is met.'
            : F.plural(passed.length, 'gate') + ' passed: every target is met.', 'ok');
        }
      } catch (e) { try { console.error('[calm] gates auto-pass failed', e); } catch (x) { /* ignore */ } }
    }
    return ok;
  };
}

/* ------------------------------------------------------------------ actions */
function gxMutDoc(C, ctx, fn, msg) {
  const key = ctx.docKey;
  return C.mutate((D) => { const doc = D.docs[key]; if (!doc) return false; return fn(doc, D); }, msg ? { msg: msg } : {});
}
/* the edit sheet's fields as stored now; the sheet shows these live until the person edits a field, and
   saving writes only the fields they changed (so a gate that auto-passes, or is un-completed from the
   stacked completion sheet, while the editor is open is not overwritten by stale values) */
const GX_FIELDS = ['name', 'intention', 'gid', 'setId', 'planned', 'actual', 'status'];
function gxLive(g) {
  return {
    name: g.name || '', intention: g.intention || '', gid: g.gate_id || '', setId: g.setId || '',
    planned: F.iso(g.plannedDate), actual: F.iso(g.actualDate),
    status: g.status || (g.actualDate != null ? 'hit' : 'pending')
  };
}
function gxShown(sh, g) {
  const d = sh.d || {}, o = (sh.data && sh.data.orig) || {}, live = g ? gxLive(g) : {};
  const out = {};
  GX_FIELDS.forEach((f) => { out[f] = (g && d[f] === o[f]) ? live[f] : (d[f] == null ? '' : d[f]); });
  return out;
}
function gxDirty(sh, f) { const d = sh.d || {}, o = (sh.data && sh.data.orig) || {}; return d[f] !== o[f]; }
function gxOpenEdit(C, ctx, gid) {
  const g = gxGate(ctx.doc, gid);
  if (!g) { C.toast('That gate no longer exists.', 'err'); return; }
  const live = gxLive(g);
  C.openSheet('gates.edit', { id: gid, orig: live }, Object.assign({ predFrom: '', predLag: '' }, live));
}
function gxOpenAdd(C, ctx, setId) {
  if (!C.guard() || !ctx.objId) return;
  const sets = gxSetsOf(ctx.doc, ctx.objId);
  C.setState({ gates_pend: [] });
  C.openSheet('gates.edit', { add: true, objId: ctx.objId }, {
    name: '', intention: '', gid: '', setId: setId || (sets[0] ? sets[0].id : ''),
    planned: '', actual: '', status: 'pending'
  });
}
function gxDateOrErr(C, iso, label) {
  const s = gxTxt(iso);
  if (!s) return { ok: true, v: null };
  const v = F.fromIso(s);
  if (v == null) { C.sheetErr(label + ' needs a date like 2026-11-13.'); return { ok: false }; }
  return { ok: true, v: v };
}
/* Add / save the gate sheet. Add: today's saveSub for a new stage-gate (plus a name check, an order, and the
   "General" workstream created only when the gate is actually added, not when the editor opens). */
function gxSaveGate(C, ctx, thenLink) {
  const sh = C.sheetOf('gates');
  if (!sh || sh.kind !== 'gates.edit') return;
  const g0 = sh.data.add ? null : gxGate(ctx.doc, sh.data.id);
  if (!sh.data.add && !g0) { C.sheetErr('This gate was deleted in the meantime. Close this panel.'); return; }
  const d = sh.data.add ? (sh.d || {}) : Object.assign({}, sh.d, gxShown(sh, g0));
  const name = gxTxt(d.name);
  if (!name) { C.sheetErr('Give the gate a name.'); return; }
  const pd = gxDateOrErr(C, d.planned, 'Planned date'); if (!pd.ok) return;
  const ad = gxDateOrErr(C, d.actual, 'Passed date'); if (!ad.ok) return;
  const status = GX_STATUS.some((s) => s[0] === d.status) ? d.status : 'pending';
  if (sh.data.add) {
    const objId = sh.data.objId || ctx.objId;
    const pend = (C.state.gates_pend || []).slice();
    let newId = '';
    const ok = gxMutDoc(C, ctx, (doc) => {
      let sets = gxSetsOf(doc, objId);
      let setId = sets.some((s) => s.id === d.setId) ? d.setId : (sets[0] ? sets[0].id : '');
      if (!setId) {
        const set = { id: RD.allocId('stageGateSet', objId, (doc.stageGateSets || []).map((s) => s.id)), objectiveId: objId, name: 'General', order: 0, chained: true };
        (doc.stageGateSets = doc.stageGateSets || []).push(set);
        setId = set.id;
      }
      newId = gxNewGateId(doc, objId);
      (doc.stageGates = doc.stageGates || []).push({
        id: newId, objectiveId: objId, setId: setId, name: name,
        intention: gxTxt(d.intention) || null, gate_id: gxTxt(d.gid) || null,
        plannedDate: pd.v, actualDate: ad.v, status: status,
        order: gxGatesOf(doc, objId).length
      });
      doc.kpis = doc.kpis || [];
      pend.forEach((t) => {
        const kid = gxNewKpiId(doc, objId);
        doc.kpis.push(Object.assign({ id: kid, objectiveId: objId, hostType: 'stageGate', hostId: newId, groupId: null, isDefiner: true }, K.clone(t)));
      });
    }, 'Gate added.');
    if (!ok) return;
    C.setState({ gates_pend: [] });
    C.closeAllSheets();
    if (thenLink === true && newId) gxLink(C, ctx, newId);
    return;
  }
  const id = sh.data.id;
  const dirty = (f) => gxDirty(sh, f);
  const ok = gxMutDoc(C, ctx, (doc) => {
    const g = gxGate(doc, id);
    if (!g) return false;
    const multi = gxSetsOf(doc, g.objectiveId).length > 1;
    if (dirty('name')) g.name = name;
    if (dirty('intention')) g.intention = gxTxt(d.intention) || null;
    if (dirty('gid')) g.gate_id = gxTxt(d.gid) || null;
    if (dirty('setId') && multi && gxSetsOf(doc, g.objectiveId).some((s) => s.id === d.setId)) g.setId = d.setId;
    if (dirty('planned')) g.plannedDate = pd.v;
    if (dirty('actual')) {
      if (ad.v == null && g.actualDate != null) { g.completionMethod = null; g.overrideJustification = null; }
      g.actualDate = ad.v;
    }
    if (dirty('status')) g.status = status;
  }, 'Gate saved.');
  if (ok) C.closeSheet();
  else if (!gxGate(ctx.doc, id)) C.closeSheet();
}
function gxDeleteGate(C, ctx, gid) {
  if (!C.guard()) return;
  const g = gxGate(ctx.doc, gid);
  if (!g) return;
  C.confirm({
    title: 'Delete this gate?',
    body: gxLabel(ctx.doc, gid) + ' ' + (g.name || '') + ' is deleted with its ' + gxLossText(ctx.doc, [gid]) + '. This cannot be undone.',
    ok: 'Delete gate', danger: true,
    onOk: () => {
      const ok = gxMutDoc(C, ctx, (doc) => { if (!gxGate(doc, gid)) return false; gxRemoveGates(doc, [gid]); }, 'Gate deleted.');
      if (ok) {
        const top = C.sheet();
        if (top && top.kind.indexOf('gates.') === 0 && top.data && top.data.id === gid) C.closeAllSheets();
      }
    }
  });
}
/* Duplicate (today's sgDuplicate): the definition copies (name + " (copy)", intention, planned date, targets
   without readings); status, dates passed, readings and predecessor links do not.
   fixed: the original gate's editor no longer re-opens afterwards; the sheet closes. */
function gxDuplicate(C, ctx, gid, setId) {
  const g0 = gxGate(ctx.doc, gid);
  if (!g0) return;
  const sets = gxSetsOf(ctx.doc, g0.objectiveId);
  const target = sets.find((s) => s.id === setId);
  const into = setId && setId !== g0.setId && target ? ' into ' + (target.name || 'the other workstream') : '';
  const ok = gxMutDoc(C, ctx, (doc) => {
    const g = gxGate(doc, gid);
    if (!g) return false;
    const objId = g.objectiveId;
    const ss = gxSetsOf(doc, objId);
    const id = gxNewGateId(doc, objId);
    const copy = {
      id: id, objectiveId: objId, setId: (ss.some((s) => s.id === setId) ? setId : g.setId) || (ss[0] ? ss[0].id : null),
      name: (g.name || '') + ' (copy)', intention: g.intention || '',
      plannedDate: g.plannedDate == null ? null : g.plannedDate,
      actualDate: null, status: 'pending',
      order: gxGatesOf(doc, objId).length
    };
    doc.stageGates.push(copy);
    doc.kpis = doc.kpis || [];
    doc.kpis.filter((k) => k.hostType === 'stageGate' && k.hostId === gid).forEach((k) => {
      const kid = gxNewKpiId(doc, objId);
      const nk = Object.assign({}, K.clone(k), { id: kid, hostId: id });
      delete nk.current;
      doc.kpis.push(nk);
    });
  }, 'Gate duplicated' + into + '.');
  if (ok) C.closeAllSheets();
}
function gxStartDuplicate(C, ctx, gid) {
  if (!C.guard()) return;
  const g = gxGate(ctx.doc, gid);
  if (!g) return;
  if (gxSetsOf(ctx.doc, g.objectiveId).length < 2) { gxDuplicate(C, ctx, gid, g.setId); return; }
  C.openSheet('gates.dup', { id: gid }, { to: g.setId || '' });
}
function gxOpenMark(C, ctx, gid) {
  if (!C.guard()) return;
  if (!gxGate(ctx.doc, gid)) return;
  C.openSheet('gates.done', { id: gid }, { date: F.iso(ctx.today), just: '' });
}
function gxOpenCompletion(C, ctx, gid, stacked) {
  const g = gxGate(ctx.doc, gid);
  if (!g) return;
  C[stacked ? 'pushSheet' : 'openSheet']('gates.comp', { id: gid }, { date: F.iso(g.actualDate), just: g.overrideJustification || '' });
}
function gxOpenWs(C, ctx, setId) {
  if (!C.guard() || !ctx.objId) return;
  const s = setId ? (ctx.doc.stageGateSets || []).find((x) => x.id === setId) : null;
  C.openSheet('gates.ws', { id: s ? s.id : '' }, { name: s ? (s.name || '') : '', chained: s ? s.chained !== false : true });
}
function gxDelWs(C, ctx, setId, stacked) {
  if (!C.guard()) return;
  const doc = ctx.doc;
  const set = (doc.stageGateSets || []).find((s) => s.id === setId);
  if (!set) return;
  const gates = gxGatesOf(doc, set.objectiveId).filter((g) => g.setId === setId);
  const others = gxSetsOf(doc, set.objectiveId).filter((s) => s.id !== setId);
  if (!gates.length) {
    C.confirm({
      title: 'Delete workstream?',
      body: 'Delete ' + (set.name || 'this workstream') + '? It holds no stage-gates, so nothing else changes.',
      ok: 'Delete workstream', danger: true,
      onOk: () => {
        const ok = gxMutDoc(C, ctx, (d) => { d.stageGateSets = (d.stageGateSets || []).filter((s) => s.id !== setId); }, 'Workstream deleted.');
        if (ok) C.closeAllSheets();
      }
    });
    return;
  }
  C[stacked ? 'pushSheet' : 'openSheet']('gates.wsdel', { id: setId }, { choice: others.length ? 'move' : 'keep', to: others.length ? others[0].id : '' });
}
function gxApplyWsDel(C, ctx) {
  const sh = C.sheetOf('gates');
  if (!sh || sh.kind !== 'gates.wsdel') return;
  const setId = sh.data.id, d = sh.d || {};
  const doc = ctx.doc;
  const set = (doc.stageGateSets || []).find((s) => s.id === setId);
  if (!set) { C.closeAllSheets(); return; }
  const ids = gxGatesOf(doc, set.objectiveId).filter((g) => g.setId === setId).map((g) => g.id);
  const others = gxSetsOf(doc, set.objectiveId).filter((s) => s.id !== setId);
  const choice = d.choice || (others.length ? 'move' : 'keep');
  if (choice === 'keep') { C.closeAllSheets(); return; }
  if (choice === 'move') {
    const to = others.some((s) => s.id === d.to) ? d.to : (others[0] ? others[0].id : '');
    if (!to) { C.sheetErr('Nowhere to move the gates to.'); return; }
    const ok = gxMutDoc(C, ctx, (dd) => {
      gxGatesOf(dd, set.objectiveId).forEach((g) => { if (g.setId === setId) g.setId = to; });
      dd.stageGateSets = (dd.stageGateSets || []).filter((s) => s.id !== setId);
    }, ids.length ? 'Workstream deleted, ' + F.plural(ids.length, 'gate') + ' moved.' : 'Workstream deleted.');
    if (ok) C.closeAllSheets();
    return;
  }
  const ok = gxMutDoc(C, ctx, (dd) => {
    gxRemoveGates(dd, ids);
    dd.stageGateSets = (dd.stageGateSets || []).filter((s) => s.id !== setId);
  }, 'Workstream and ' + F.plural(ids.length, 'stage-gate') + ' deleted.');
  if (ok) C.closeAllSheets();
}
function gxMoveWs(C, ctx, setId, toId, delta) {
  const objId = ctx.objId;
  return gxMutDoc(C, ctx, (doc) => {
    const list = gxSetsOf(doc, objId);
    const from = list.findIndex((s) => s.id === setId);
    let to = toId ? list.findIndex((s) => s.id === toId) : from + (delta || 0);
    if (from < 0 || to < 0 || to >= list.length || from === to) return false;
    const moved = list.splice(from, 1)[0];
    list.splice(to, 0, moved);
    list.forEach((s, i) => { s.order = i; });
  }, 'Workstreams reordered.');
}
function gxRename(C, ctx) {
  const r = C.state.gates_ren;
  if (!r) return;
  const name = gxTxt(r.v);
  if (!name) { C.setState({ gates_ren: Object.assign({}, r, { err: 'Give the workstream a name.' }) }); return; }
  const set = (ctx.doc.stageGateSets || []).find((s) => s.id === r.setId);
  C.setState({ gates_ren: null });
  if (!set || set.name === name) return;
  gxMutDoc(C, ctx, (doc) => { const s = (doc.stageGateSets || []).find((x) => x.id === r.setId); if (!s) return false; s.name = name; }, 'Workstream renamed.');
}
function gxToggleChain(C, ctx, setId) {
  const set = (ctx.doc.stageGateSets || []).find((s) => s.id === setId);
  if (!set) return;
  const next = set.chained === false;
  gxMutDoc(C, ctx, (doc) => { const s = (doc.stageGateSets || []).find((x) => x.id === setId); if (!s) return false; s.chained = next; },
    next ? 'Workstream chained: a gate finishing late pushes the next one.' : 'Workstream set to independent: its gates keep their own dates.');
}

/* ---- plan revision (Execution): today's rpOpen / rpRender / rpCommit, held in gates_rp until Commit ---- */
function gxOpenRevise(C, ctx) {
  if (!C.guard()) return;
  if (!ctx || !ctx.objId) return;
  if (APP === 'sales') { gxOpenRecommit(C, ctx); return; }
  const doc = ctx.doc, objId = ctx.objId;
  const sets = gxSetsOf(doc, objId).map((s) => ({ id: s.id, name: s.name || '' }));
  const gates = gxGatesOf(doc, objId).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((g, i) => ({
    id: g.id, setId: g.setId || null, name: g.name || '', planned: g.plannedDate == null ? null : g.plannedDate,
    passed: g.actualDate != null, order: g.order == null ? i : g.order, del: false, isNew: false, targets: []
  }));
  const obj = ((ctx.P && ctx.P.objectives) || []).find((o) => o.id === objId);
  const v = RD.nextPlanVersionNumber(doc, objId) + (RD.planVersionsOf(doc, objId).length ? 0 : 1);
  C.setState({ gates_rp: { objId: objId, docKey: ctx.docKey, sets: sets, gates: gates, finish: obj && obj.plannedEnd != null ? obj.plannedEnd : null, reason: '', v: v, seq: 0 } });
  C.openSheet('gates.revise', { objId: objId }, {});
}
function gxRp(C) { return C.state.gates_rp; }
function gxRpSet(C, patch) { const rp = gxRp(C); if (rp) C.setState({ gates_rp: Object.assign({}, rp, patch) }); }
function gxRpRow(C, rowId, patch) {
  const rp = gxRp(C);
  if (!rp) return;
  gxRpSet(C, { gates: rp.gates.map((g) => (g.id === rowId ? Object.assign({}, g, patch) : g)) });
}
/* today's rpWireDrag: the dragged row takes the target row's workstream and lands at its index */
function gxRpMove(C, fromId, toId) {
  const rp = gxRp(C);
  if (!rp || !fromId || !toId || fromId === toId) return;
  const gs = rp.gates.map((g) => Object.assign({}, g));
  const from = gs.findIndex((g) => g.id === fromId), to = gs.findIndex((g) => g.id === toId);
  if (from < 0 || to < 0) return;
  const moved = gs.splice(from, 1)[0];
  moved.setId = gs[to > from ? to - 1 : to].setId;
  gs.splice(to, 0, moved);
  gs.forEach((g, i) => { g.order = i; });
  gxRpSet(C, { gates: gs });
}
/* dropping on a workstream (also an empty one) puts the row last in it */
function gxRpMoveToSet(C, fromId, setId) {
  const rp = gxRp(C);
  if (!rp || !fromId) return;
  const gs = rp.gates.map((g) => Object.assign({}, g));
  const from = gs.findIndex((g) => g.id === fromId);
  if (from < 0) return;
  const moved = gs.splice(from, 1)[0];
  moved.setId = setId;
  let at = -1;
  gs.forEach((g, i) => { if (g.setId === setId) at = i; });
  gs.splice(at < 0 ? gs.length : at + 1, 0, moved);
  gs.forEach((g, i) => { g.order = i; });
  gxRpSet(C, { gates: gs });
}
/* keyboard alternative to dragging: move one place up or down in the plan, crossing into the next
   workstream at the edges */
function gxRpStep(C, rowId, dir) {
  const rp = gxRp(C);
  if (!rp) return;
  const order = [];
  rp.sets.forEach((s) => rp.gates.forEach((g) => { if (g.setId === s.id) order.push(g); }));
  rp.gates.forEach((g) => { if (!rp.sets.some((s) => s.id === g.setId)) order.push(g); });
  const i = order.findIndex((g) => g.id === rowId);
  if (i < 0) return;
  const me = order[i];
  const setIdx = rp.sets.findIndex((s) => s.id === me.setId);
  const nb = order[i + dir];
  const gs = rp.gates.map((g) => Object.assign({}, g));
  const mine = gs.find((g) => g.id === rowId);
  if (nb && nb.setId === me.setId) {
    const a = gs.findIndex((g) => g.id === rowId), b = gs.findIndex((g) => g.id === nb.id);
    const tmp = gs[a]; gs[a] = gs[b]; gs[b] = tmp;
  } else {
    const ns = rp.sets[setIdx + dir];
    if (!ns) return;
    mine.setId = ns.id;
    const a = gs.findIndex((g) => g.id === rowId);
    gs.splice(a, 1);
    if (dir > 0) { const first = gs.findIndex((g) => g.setId === ns.id); gs.splice(first < 0 ? gs.length : first, 0, mine); }
    else { let last = -1; gs.forEach((g, j) => { if (g.setId === ns.id) last = j; }); gs.splice(last < 0 ? gs.length : last + 1, 0, mine); }
  }
  gs.forEach((g, j) => { g.order = j; });
  gxRpSet(C, { gates: gs });
}
function gxRpAdd(C, setId) {
  const rp = gxRp(C);
  if (!rp) return;
  const seq = (rp.seq || 0) + 1;
  const mx = rp.gates.length ? Math.max.apply(null, rp.gates.map((g) => g.order || 0)) : 0;
  gxRpSet(C, { seq: seq, gates: rp.gates.concat([{ id: 'new-' + seq, setId: setId, name: '', planned: null, passed: false, order: mx + 1, del: false, isNew: true, targets: [] }]) });
}
function gxRpDel(C, rowId) {
  const rp = gxRp(C);
  if (!rp) return;
  const g = rp.gates.find((x) => x.id === rowId);
  if (!g || g.passed) return;
  if (g.isNew) gxRpSet(C, { gates: rp.gates.filter((x) => x.id !== rowId) });
  else gxRpRow(C, rowId, { del: true });
}
function gxCommitRevise(C, ctx) {
  const rp = gxRp(C);
  if (!rp) return;
  const bad = rp.gates.filter((g) => !g.del && (!gxTxt(g.name) || g.planned == null));
  if (bad.length) { C.sheetErr('Every gate needs a name and a date before committing.'); return; }
  const doc0 = C.D.docs[rp.docKey];
  if (!doc0) return;
  const vNext = RD.planVersionsOf(doc0, rp.objId).length ? RD.nextPlanVersionNumber(doc0, rp.objId) : 2;
  const ok = C.mutate((D) => {
    const doc = D.docs[rp.docKey], P = D.portfolio, objId = rp.objId;
    if (!doc) return false;
    doc.planVersions = doc.planVersions || [];
    if (!RD.planVersionsOf(doc, objId).length) {
      doc.planVersions.push({ id: 'PV-' + objId + '-1', objectiveId: objId, v: 1, committedDay: D.today,
        reason: 'plan as first committed', snapshot: RD.capturePlanSnapshot(doc, P, objId) });
    }
    const goneIds = rp.gates.filter((g) => g.del && !g.isNew).map((g) => g.id);
    gxRemoveGates(doc, goneIds);
    const taken = goneIds.slice();
    doc.kpis = doc.kpis || [];
    rp.gates.forEach((g) => {
      if (g.del) return;
      let rec = null;
      if (g.isNew) {
        const id = gxNewGateId(doc, objId, taken);                 /* fixed: today kept the temporary SGNEW-… id */
        taken.push(id);
        rec = { id: id, objectiveId: objId, setId: g.setId, name: '', intention: null, gate_id: null, plannedDate: null, actualDate: null, status: 'pending' };
        doc.stageGates.push(rec);
        (g.targets || []).forEach((t) => {
          const kid = gxNewKpiId(doc, objId);
          doc.kpis.push(Object.assign({ id: kid, objectiveId: objId, hostType: 'stageGate', hostId: id, groupId: null, isDefiner: true }, K.clone(t)));
        });
      } else rec = gxGate(doc, g.id);
      if (!rec) return;
      rec.setId = g.setId; rec.name = gxTxt(g.name); rec.plannedDate = g.planned; rec.order = g.order;
    });
    /* fixed: today the new committed finish only changed the in-memory portfolio and was never saved */
    const obj = ((P && P.objectives) || []).find((o) => o.id === objId);
    if (obj && rp.finish != null) obj.plannedEnd = rp.finish;
    const v = RD.nextPlanVersionNumber(doc, objId);
    doc.planVersions.push({ id: 'PV-' + objId + '-' + v, objectiveId: objId, v: v, committedDay: D.today,
      reason: gxTxt(rp.reason), snapshot: RD.capturePlanSnapshot(doc, P, objId) });
  }, { msg: 'Revised plan committed as v' + vNext + '.' });   /* fixed: today the commit ended in a ReferenceError before this message */
  if (!ok) return;
  C.setState({ gates_rp: null });
  C.closeAllSheets();
}

/* ---- Sales: today's openCatchupModal / enactCatchup (the simple per-gate re-commit) ---- */
function gxOpenRecommit(C, ctx) {
  if (!C.guard() || !ctx.objId) return;
  const casc = gxCasc(C, ctx);
  const gates = gxSortDue(gxGatesOf(ctx.doc, ctx.objId).filter((g) => g.actualDate == null));
  if (!gates.length) { C.toast('No unfinished stage-gates to re-commit.', 'err'); return; }
  const dates = {};
  gates.forEach((g) => { const fc = casc.gateEffective[g.id]; dates[g.id] = F.iso(fc != null ? fc : g.plannedDate); });
  C.openSheet('gates.recommit', { objId: ctx.objId }, { dates: dates });
}
function gxEnact(C, ctx) {
  const sh = C.sheetOf('gates');
  if (!sh || sh.kind !== 'gates.recommit') return;
  const objId = sh.data.objId;
  const ds = (sh.d && sh.d.dates) || {};
  const gates = gxGatesOf(ctx.doc, objId).filter((g) => g.actualDate == null);
  const map = {};
  let all = true;
  gates.forEach((g) => { const v = F.fromIso(ds[g.id] || ''); if (v == null) all = false; else map[g.id] = v; });
  if (!all) { C.sheetErr('Every gate needs a date.'); return; }
  const n = gates.length;
  const ok = gxMutDoc(C, ctx, (doc, D) => {
    const prev = RD.activeCatchupPlan(doc.catchupPlans, objId);
    const prevOrig = {}, prevVer = {};
    if (prev) (prev.gates || []).forEach((e) => { prevOrig[e.gateId] = e.originalDate; prevVer[e.gateId] = e.version || 0; });
    const entries = [];
    gxGatesOf(doc, objId).filter((g) => g.actualDate == null).forEach((g) => {
      const nd = map[g.id];
      if (nd == null) return;
      const orig = (g.id in prevOrig) ? prevOrig[g.id] : g.plannedDate;
      entries.push({ gateId: g.id, originalDate: orig, newDate: nd, version: (prevVer[g.id] || 0) + 1 });
      g.plannedDate = nd;
    });
    doc.catchupPlans = (doc.catchupPlans || []).filter((p) => p.objectiveId !== objId);
    doc.catchupPlans.push({ id: 'catchup:' + objId, objectiveId: objId, enactedDay: D.today, gates: entries });
  }, 'Plan revision enacted: ' + F.plural(n, 'gate') + ' re-committed.');
  if (ok) C.closeAllSheets();
}
function gxClearPlan(C, ctx) {
  if (!C.guard()) return;
  const objId = ctx.objId;
  C.ask({
    title: 'Clear the revised plan?',
    body: 'This discards the revised plan and its tracking for this objective. The re-committed dates stay on the gates, but the original-to-new tracking and the re-committed tags go. This cannot be undone.',
    label: 'Type CLEAR to confirm', placeholder: 'CLEAR', ok: 'Clear plan',
    onOk: (v) => {
      if (gxTxt(v) !== 'CLEAR') return 'Type CLEAR to confirm.';
      gxMutDoc(C, ctx, (doc) => { doc.catchupPlans = (doc.catchupPlans || []).filter((p) => p.objectiveId !== objId); }, 'Revised plan cleared.');
      return '';
    }
  });
}

/* ------------------------------------------------------- view: the tab */
/* Kanban is its own tab (mods/kb) since October 15. Today's per-objective Gates / Kanban switch
   (doc.gateMode) is no longer read or written; stored values stay in the documents untouched. */
function gxHasBoards(ctx) { return ((ctx.doc && ctx.doc.boards) || []).some((b) => b && b.objectiveId === ctx.objId); }
function gxGateRow(C, ctx, g, setGates, info) {
  const doc = ctx.doc, td = ctx.today, em = ctx.em, canEdit = !ctx.ro;
  const casc = info.casc, marks = info.marks, rev = info.rev;
  let st = RD.classifyGate(g, td);
  const cancelled = ctx.ended && g.actualDate == null;
  if (cancelled) st = 'cancelled';
  const passed = st === 'passed' || st === 'passed-late';
  const sc = RD.stageGateScore(g.id, em);
  const smp = RD.hostSample('stageGate', g.id, em);
  const raw = smp.partial ? RD.stageGateScore(g.id, em, true) : null;
  const label = gxLabel(doc, g.id);
  const tone = F.band(sc);
  /* ring: green check when passed, readiness as a filled arc otherwise, red edge when overdue */
  let ring = '';
  if (passed) ring = 'background: ' + (st === 'passed-late' ? GX_VAR.warn : GX_VAR.ok) + '; border-color: ' + (st === 'passed-late' ? GX_VAR.warn : GX_VAR.ok);
  else if (sc != null && !cancelled) {
    const c = GX_VAR[tone] || GX_VAR.none, r = Math.round(sc);
    ring = 'border-color: ' + c + '; background: conic-gradient(' + c + ' 0 ' + r + '%, var(--surface) ' + r + '% 100%)';
  } else if (st === 'overdue') ring = 'border-color: ' + GX_VAR.bad;
  /* state word: the dates decide (core classifyGate). The stored Status is shown, not ignored:
     In progress replaces Pending on a gate still on time, Failed shows as a note. */
  let word = GX_STATE[st][0], stTone = GX_STATE[st][1], note = '', noteCls = 'small';
  if (!passed && !cancelled) {
    if (g.status === 'active') { if (st === 'pending') { word = 'In progress'; stTone = 'info'; } else { note = 'In progress'; noteCls = 'small tx-info'; } }
    if (g.status === 'missed') { note = 'Marked failed'; noteCls = 'small tx-bad'; }
  }
  /* schedule line: planned, forecast, and today's delta badges in words (gateForecastMeta) */
  const when = [];
  when.push({ text: g.plannedDate != null ? 'Planned ' + gxD(ctx, g.plannedDate) : 'No planned date', cls: '' });
  if (cancelled) {
    when.push({ text: 'Cancelled when the objective ended', cls: '' });
  } else if (g.actualDate != null) {
    const dd = g.plannedDate != null ? g.actualDate - g.plannedDate : 0;
    if (dd > 0) when.push({ text: 'Finished ' + gxDays(dd) + ' late', cls: 'tx-warn' });
    if (dd < 0) when.push({ text: 'Finished ' + gxDays(dd) + ' early', cls: 'tx-ok' });
    /* a revision committed after it took the delay in: it no longer pushes the gates after it (RD.cascade) */
    if (dd > 0 && rev && g.actualDate <= rev.day) when.push({ text: gxRevName(rev) + ' takes this into account', cls: '' });
  } else if (g.plannedDate != null && casc.gateEffective[g.id] != null) {
    const eff = casc.gateEffective[g.id], slip = eff - g.plannedDate;
    if (slip > 0) {
      when.push({ text: 'Forecast ' + gxD(ctx, eff), cls: 'tx-bad' });
      if (g.plannedDate < td) when.push({ text: gxDays(slip) + ' late', cls: 'tx-bad' });
      else {
        const earlier = (setGates || []).filter((x) => x.plannedDate != null && x.plannedDate < g.plannedDate).sort((a, b) => a.plannedDate - b.plannedDate);
        /* the gate pushing it: late, or overdue and open; one that passed late before a revision is in the plan */
        const drv = earlier.find((x) => (x.actualDate != null && x.plannedDate != null && x.actualDate > x.plannedDate && !(rev && x.actualDate <= rev.day)) || (x.actualDate == null && x.plannedDate != null && x.plannedDate < td));
        when.push({ text: 'Pushed ' + gxDays(slip) + (drv ? ' by ' + gxLabel(doc, drv.id) : ' by an upstream gate'), cls: 'tx-warn' });
      }
    } else {
      const acc = casc.gateAcceleration[g.id] || 0;
      if (acc > 0) {
        when.push({ text: 'Forecast ' + gxD(ctx, eff), cls: '' });
        when.push({ text: 'Could finish ' + gxD(ctx, casc.gateForecastEarliest[g.id]) + ', ' + gxDays(acc) + ' earlier', cls: 'tx-ok' });
      }
    }
  }
  const mk = gxMarkText(marks[g.id]);
  const cu = RD.catchupEntry(doc.catchupPlans, ctx.objId, g.id);
  const tks = gxGateKpis(C, ctx, g);
  const AK = gxPool(C, ctx);
  const met = tks.filter((k) => { const s2 = RD.kpiScoreResolved(k, AK, em); return s2 != null && s2 >= 100; }).length;
  const metText = met + ' of ' + tks.length + ' met' + (smp.partial ? ', ' + smp.partialCount + ' partial' : '');
  const open = !!(C.state.gates_open || {})[g.id];
  const menuId = 'gates.g.' + g.id;
  return {
    id: g.id, key: 'gate-' + g.id,
    cls: 'gates-step' + (passed ? ' done' : '') + (cancelled ? ' cnl' : '') + (C.state.gates_focus === g.id ? ' is-focus' : ''),
    /* opened from the Overview's review table: highlighted for a moment, and its name takes focus */
    focus: !!C.state.gates_focus && C.state.gates_focus === g.id,
    ring: ring, passed: passed,
    label: label, name: g.name || g.id,
    open: () => gxOpenEdit(C, ctx, g.id),
    hasMark: !!mk, vmark: mk ? mk.text : '', vmarkTitle: mk ? mk.title : '',
    committed: g.baselineDate != null, committedTitle: g.baselineDate != null ? 'Committed to ' + F.dayY(g.baselineDate) + '; not pushed by late upstream gates' : '',
    recommitted: !!cu,
    hasRecommit: !!cu, recommitText: cu ? 'Revision v' + (cu.version || 1) + ': ' + gxD(ctx, cu.originalDate) + ' to ' + gxD(ctx, cu.newDate) : '',
    hasIntent: !!gxTxt(g.intention), intent: gxTxt(g.intention),
    when: when,
    stCls: 'st ' + F.tone(stTone), stWord: word,
    hasPartialTag: !!smp.partial,
    hasNote: !!note, note: note, noteCls: noteCls,
    ready: sc == null ? '—' : Math.round(sc) + '%',
    fillCls: 'fill ' + F.tone(tone), fillStyle: 'width: ' + (sc == null ? 0 : Math.round(K.clamp(sc, 0, 100))) + '%',
    hasHatch: raw != null && sc != null && raw > sc,
    hatchStyle: raw != null && sc != null ? 'left: ' + K.clamp(sc, 0, 100) + '%; width: ' + (K.clamp(raw, 0, 100) - K.clamp(sc, 0, 100)) + '%' : '',
    hasPartial: !!smp.partial,
    partialText: smp.partial ? 'Partial check-in: ' + Math.round(raw == null ? 0 : raw) + '% without discount, ' + smp.n + ' of ' + smp.expected + ' samples. Readiness reaches 100 only once all ' + smp.expected + ' are in.' : '',
    canMark: canEdit && !passed && !cancelled,
    markLabel: 'Mark ' + label + ' complete',
    markComplete: () => gxOpenMark(C, ctx, g.id),
    isPassed: passed && !cancelled,
    passedText: g.actualDate != null ? 'Passed ' + gxD(ctx, g.actualDate) : '',
    passedCls: st === 'passed-late' ? 'tx-warn' : 'tx-ok',
    completion: () => gxOpenCompletion(C, ctx, g.id),
    hasTargets: tks.length > 0, noTargets: !tks.length,
    metText: metText,
    isOpen: open && tks.length > 0, openStr: open ? 'true' : 'false',
    chevCls: open ? 'gates-chev on' : 'gates-chev',
    toggle: () => C.setState({ gates_open: Object.assign({}, C.state.gates_open, { [g.id]: !open }) }),
    kt: open && tks.length ? gxKT(C, ctx, g.id, { key: 'gate:' + g.id }) : null,
    canEdit: canEdit,
    addTarget: () => gxKpiTarget(C, ctx, g.id, null),
    addLink: () => gxLink(C, ctx, g.id),
    connect: () => gxConnect(C, ctx, g.id),
    menuOpen: C.isMenu(menuId) ? 'true' : 'false', showMenu: C.isMenu(menuId),
    toggleMenu: () => C.toggleMenu(menuId),
    menuLabel: 'Actions for ' + label,
    dup: () => gxStartDuplicate(C, ctx, g.id),
    del: () => gxDeleteGate(C, ctx, g.id)
  };
}
function gxTabVM(C, ctx) {
  const doc = ctx.doc, objId = ctx.objId, canEdit = !ctx.ro;
  const all = gxGatesOf(doc, objId);
  const info = { casc: gxCasc(C, ctx), marks: gxMarks(C, ctx), rev: RD.planRevision(doc, objId) };
  const sets = gxSetsOf(doc, objId);
  const multi = sets.length > 1;
  const ren = C.state.gates_ren;
  const blocks = sets.map((s, si) => {
    const gs = gxSortDue(all.filter((g) => g.setId === s.id));
    const pct = RD.setScore(s.id, ctx.em, ctx.today);
    const passedN = gs.filter((g) => g.actualDate != null).length;
    const chained = s.chained !== false;
    const menuId = 'gates.ws.' + s.id;
    const renaming = !!(ren && ren.setId === s.id);
    const lift = C.state.gates_drag === s.id;
    const hot = C.state.gates_over === s.id && C.state.gates_drag && C.state.gates_drag !== s.id;
    return {
      id: s.id, key: 'ws-' + s.id,
      cls: 'gates-ws dz' + (hot ? ' hot' : '') + (lift ? ' lift' : ''),
      letter: 'Workstream ' + String.fromCharCode(65 + si),
      name: s.name || 'Unnamed workstream',
      canEdit: canEdit,
      chainLabel: chained ? 'Chained' : 'Independent',
      chained: chained,
      chainTitle: chained ? 'Chained: a gate finishing late pushes the next gate. Click to make the gates independent.' : 'Independent: gates keep their own planned dates. Click to chain them.',
      chainTitleRo: chained ? 'Chained: a gate finishing late pushes the next gate.' : 'Independent: gates keep their own planned dates.',
      toggleChain: () => gxToggleChain(C, ctx, s.id),
      pct: pct == null ? '—' : Math.round(pct) + '%',
      fillCls: 'fill ' + F.tone(F.band(pct)), fillStyle: 'width: ' + (pct == null ? 0 : Math.round(pct)) + '%',
      passedText: passedN + ' of ' + gs.length + ' passed',
      gates: gs.map((g) => gxGateRow(C, ctx, g, gs, info)),
      empty: !gs.length,
      emptyText: canEdit ? 'No gates in this workstream yet. Use Add gate to give it its first checkpoint.' : 'No gates in this workstream yet.',
      addGate: () => gxOpenAdd(C, ctx, s.id),
      addLabel: 'Add a gate to ' + (s.name || 'this workstream'),
      renaming: renaming, notRenaming: !renaming,
      renVal: renaming ? ren.v : '', renErr: renaming ? (ren.err || '') : '',
      startRen: () => { if (C.guard()) C.setState({ gates_ren: { setId: s.id, v: s.name || '', err: '' }, menu: '' }); },
      onRen: (e) => C.setState({ gates_ren: Object.assign({}, C.state.gates_ren || { setId: s.id }, { v: e && e.target ? e.target.value : '', err: '' }) }),
      onRenKey: (e) => { if (!e) return; if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); gxRename(C, ctx); } else if (e.key === 'Escape') C.setState({ gates_ren: null }); },
      onRenBlur: () => { const r = C.state.gates_ren; if (r && r.setId === s.id) { if (gxTxt(r.v)) gxRename(C, ctx); else C.setState({ gates_ren: null }); } },
      menuOpen: C.isMenu(menuId) ? 'true' : 'false', showMenu: C.isMenu(menuId),
      toggleMenu: () => C.toggleMenu(menuId),
      menuLabel: 'Actions for workstream ' + (s.name || String.fromCharCode(65 + si)),
      edit: () => gxOpenWs(C, ctx, s.id),
      del: () => gxDelWs(C, ctx, s.id, false),
      canUp: si > 0, canDown: si < sets.length - 1,
      up: () => { C.closeMenus(); gxMoveWs(C, ctx, s.id, null, -1); },
      down: () => { C.closeMenus(); gxMoveWs(C, ctx, s.id, null, 1); },
      canDrag: canEdit && multi,
      onDragStart: (e) => {
        C._gxDrag = s.id;
        try { if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); } } catch (x) { /* some browsers refuse */ }
        C.setState({ gates_drag: s.id });
      },
      onDragEnd: () => { C._gxDrag = null; C.setState({ gates_drag: '', gates_over: '' }); },
      onOver: (e) => {
        if (!C._gxDrag || C._gxDrag === s.id) return;
        if (e && e.preventDefault) e.preventDefault();
        if (C.state.gates_over !== s.id) C.setState({ gates_over: s.id });
      },
      onLeave: () => { if (C.state.gates_over === s.id) C.setState({ gates_over: '' }); },
      onDrop: (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const src = C._gxDrag;
        C._gxDrag = null;
        C.setState({ gates_over: '', gates_drag: '' });
        if (!src || src === s.id || !canEdit) return;
        gxMoveWs(C, ctx, src, s.id, 0);
      }
    };
  });
  const cu = RD.activeCatchupPlan(doc.catchupPlans, objId);
  let cuVM = null;
  if (cu) {
    const slip = info.casc.objectiveScheduleSlip ? info.casc.objectiveScheduleSlip[objId] : null;
    const n = (cu.gates || []).length;
    cuVM = {
      text: F.plural(n, 'gate') + ' re-committed. Enacted ' + gxD(ctx, cu.enactedDay) + (slip != null ? ', now ' + (slip > 0 ? gxDays(slip) + ' behind schedule' : 'on schedule') : '') + '.',
      canEdit: canEdit,
      revise: () => gxOpenRevise(C, ctx),
      clear: () => gxClearPlan(C, ctx)
    };
  }
  /* the panel head counts this objective's gates (the Kanban tab counts its board's tiles) */
  return {
    has: !!objId,
    count: all.length,
    canAdd: canEdit,
    /* Sales: a revised plan can be built whenever work is unfinished, not only past the 10-day alarm (October 20;
       Execution revises from Plan history); with a plan active, its banner's Revise does it */
    canRecommit: APP === 'sales' && canEdit && !cu && !ctx.ended && all.some((g) => g.actualDate == null),
    recommit: () => gxOpenRevise(C, ctx),
    addGate: () => gxOpenAdd(C, ctx, ''),
    addWs: () => gxOpenWs(C, ctx, ''),
    cu: cuVM,
    sets: blocks,
    noSets: !sets.length
  };
}

/* ----------------------------------------------- view: plan history (Execution) */
function gxHistVM(C, ctx) {
  if (APP === 'sales' || !ctx.objId) return null;   /* under the gates, Execution only */
  const doc = ctx.doc, objId = ctx.objId;
  const vs = RD.planVersionsOf(doc, objId);
  const finishes = vs.map((r) => r.snapshot && r.snapshot.finishDay).filter((v) => v != null);
  const held = finishes.length > 1 && finishes.every((f) => f === finishes[0]);
  const rows = vs.slice().reverse().map((r, i) => {
    const sm = RD.planVersionSummary(doc, objId, r.v) || { counts: {} };
    const c = sm.counts || {};
    const chips = [];
    if (c.added) chips.push({ t: F.plural(c.added, 'gate') + ' added', cls: 'tag gates-add' });
    if (c.removed) chips.push({ t: F.plural(c.removed, 'gate') + ' removed', cls: 'tag gates-rem' });
    if (c.moved) chips.push({ t: c.moved + ' moved', cls: 'tag' });
    if (c.retargeted) chips.push({ t: c.retargeted + ' retargeted', cls: 'tag' });
    if (c.renamed) chips.push({ t: c.renamed + ' renamed', cls: 'tag' });
    if (sm.reordered) chips.push({ t: 'Reordered', cls: 'tag' });
    if (sm.finishChanged) chips.push({ t: 'Finish moved', cls: 'tag gates-rem' });
    return {
      key: 'pv-' + r.v, v: 'v' + r.v,
      tag: i === 0 ? 'Live' : (sm.first ? 'Original' : ''), hasTag: i === 0 || !!sm.first,
      tagCls: i === 0 ? 'st t-ok' : 'st t-none',
      reason: gxTxt(r.reason) || (sm.first ? 'plan as first committed' : 'revision'),
      date: r.committedDay != null ? 'Committed ' + F.dayY(r.committedDay) : '',
      chips: chips, hasChips: chips.length > 0,
      cmpLabel: sm.first ? 'View' : 'Compare to v' + (r.v - 1),
      cmp: () => C.openSheet('gates.cmp', { objId: objId, v: r.v }, {})
    };
  });
  return {
    has: vs.length > 0, none: !vs.length,
    count: F.plural(vs.length, 'version'),
    held: held ? 'Finish held at ' + F.dayY(finishes[0]) + ' throughout' : '', hasHeld: held,
    rows: rows,
    canRevise: !ctx.ro,
    revise: () => gxOpenRevise(C, ctx)
  };
}

/* -------------------------------------------------------- view: sheets */
function gxSheetEdit(C, ctx, sh) {
  const doc = ctx.doc, d = sh.d || {}, ro = !!ctx.ro;
  const isAdd = !!sh.data.add;
  const g = isAdd ? null : gxGate(doc, sh.data.id);
  if (!isAdd && !g) return { gone: true, ro: ro, canDelete: false, title: 'Gate deleted', sub: '', isAdd: false, isEditMode: false, statuses: [], sets: [], preds: [], predOpts: [], hist: [] };
  const objId = isAdd ? (sh.data.objId || ctx.objId) : g.objectiveId;
  const sets = gxSetsOf(doc, objId);
  const v = isAdd ? d : gxShown(sh, g);
  const set = sets.find((s) => s.id === (isAdd ? d.setId : g.setId));
  const si = set ? sets.indexOf(set) : -1;
  const base = {
    gone: false, ro: ro, canEdit: !ro, isAdd: isAdd, isEditMode: !isAdd, canDelete: false,
    title: isAdd ? 'Add stage-gate' : (g.name || g.id),
    sub: isAdd ? (sets.length ? gxObjName(ctx, objId) : 'Goes into a new workstream, General') : gxLabel(doc, g.id) + (set ? ', Workstream ' + String.fromCharCode(65 + si) + ': ' + (set.name || 'unnamed') : ''),
    name: v.name || '', onName: C.bindDraft('name'),
    intention: v.intention || '', onIntention: C.bindDraft('intention'),
    gid: v.gid || '', onGid: C.bindDraft('gid'),
    multi: isAdd ? sets.length > 0 : sets.length > 1,     /* adding: always say where the gate goes; editing: today's 2+ rule */
    setId: v.setId || '', onSet: C.bindDraft('setId'),
    sets: sets.map((s, i) => ({ v: s.id, label: 'Workstream ' + String.fromCharCode(65 + i) + ': ' + (s.name || 'unnamed') })),
    planned: v.planned || '', onPlanned: C.bindDraft('planned'),
    actual: v.actual || '', onActual: C.bindDraft('actual'),
    statuses: GX_STATUS.map((s) => ({
      label: s[1], on: v.status === s[0] ? 'true' : 'false',
      pick: () => {
        if (ro) return;
        const patch = { status: s[0] };
        const top = C.sheetOf('gates');
        const gNow = isAdd ? null : gxGate(ctx.doc, sh.data.id);
        const shownActual = top ? (isAdd ? (top.d || {}).actual : gxShown(top, gNow).actual) : '';
        if (s[0] === 'hit' && !gxTxt(shownActual)) patch.actual = F.iso(ctx.today);    /* today: Passed fills an empty passed date */
        C.setDraft(patch);
      }
    })),
    statusHint: 'The state shown on the gate (passed, passed late, overdue) always comes from its dates. In progress and Failed are shown beside it.',
    save: () => gxSaveGate(C, ctx, false),
    saveLabel: isAdd ? 'Add gate' : 'Save gate',
    addLink: () => gxSaveGate(C, ctx, true)
  };
  if (isAdd) {
    /* today's pending gate targets: drafts held until the gate is added (KPI module's draft mode) */
    base.kt = gxKT(C, ctx, '__pending__', { key: 'gate:new', pending: (C.state.gates_pend || []).slice(), onPending: (l) => C.setState({ gates_pend: Array.isArray(l) ? l : [] }) });
    base.preds = []; base.predOpts = []; base.hist = [];
    return base;
  }
  /* edit: targets, readiness, scheduling */
  const em = ctx.em;
  const sc = RD.stageGateScore(g.id, em);
  const smp = RD.hostSample('stageGate', g.id, em);
  base.kt = gxKT(C, ctx, g.id, { key: 'gsheet:' + g.id });
  base.readyText = sc == null ? 'Readiness: no readings yet' : 'Readiness ' + Math.round(sc) + '%' + (smp.partial ? ', partial: ' + smp.n + ' of ' + smp.expected + ' samples' : '');
  /* commit baseline / release (today's gateSchedRow) */
  const committed = g.baselineDate != null;
  const draftPlanned = gxTxt(v.planned) ? F.fromIso(v.planned) : null;
  const changed = draftPlanned !== (g.plannedDate == null ? null : g.plannedDate);
  base.committed = committed; base.notCommitted = !committed;
  base.committedText = committed ? 'Committed to ' + F.dayY(g.baselineDate) : '';
  base.commitOff = g.plannedDate == null || changed;
  base.commitTitle = g.plannedDate == null ? 'Set a planned date first' : changed ? 'Save the new planned date first' : 'Fix the planned date as the committed baseline';
  base.commitHint = committed
    ? 'A committed gate is not pushed by late upstream gates, and it counts as passed late if it passes after this date.'
    : (g.plannedDate == null ? 'Set and save a planned date first; committing fixes it as the baseline.' : changed ? 'Save the new planned date first; committing fixes the saved date as the baseline.' : 'Committing fixes the planned date as the baseline, so upstream slips no longer push this gate.');
  base.commit = () => {
    gxMutDoc(C, ctx, (dd) => { const x = gxGate(dd, g.id); if (!x || x.plannedDate == null) return false; x.baselineDate = x.plannedDate; x.locked = true; },
      'Gate committed to ' + F.dayY(g.plannedDate) + '.');
  };
  base.release = () => { gxMutDoc(C, ctx, (dd) => { const x = gxGate(dd, g.id); if (!x) return false; x.baselineDate = null; x.locked = false; }, 'Commitment released.'); };
  /* predecessors with lag */
  const edges = (doc.stageGateEdges || []).filter((e) => e && e.toGate === g.id);
  base.preds = edges.map((e) => {
    const pg = gxGate(doc, e.fromGate);
    return {
      key: 'pr-' + e.fromGate, label: pg ? gxLabel(doc, pg.id) : e.fromGate,
      name: pg ? (pg.name || pg.id) + (pg.objectiveId !== g.objectiveId ? ' (' + gxObjName(ctx, pg.objectiveId) + ')' : '') : 'A gate that no longer exists',
      lag: e.lagDays ? 'then ' + gxDays(e.lagDays) : 'no lag',
      rmLabel: 'Remove predecessor ' + (pg ? gxLabel(doc, pg.id) : e.fromGate),
      remove: () => gxMutDoc(C, ctx, (dd) => {
        const n0 = (dd.stageGateEdges || []).length;
        dd.stageGateEdges = (dd.stageGateEdges || []).filter((x) => !(x.fromGate === e.fromGate && x.toGate === g.id));
        if (dd.stageGateEdges.length === n0) return false;
      }, 'Predecessor removed.')
    };
  });
  base.noPreds = !edges.length;
  const taken = {}; edges.forEach((e) => { taken[e.fromGate] = 1; });
  const succ = gxSuccessors(doc, g.id);
  const objOrder = {}; (ctx.allObjs || []).forEach((o, i) => { objOrder[o.id] = i; });
  const cand = gxSortDue((doc.stageGates || []).filter((x) => x && x.id !== g.id && !taken[x.id] && !succ[x.id]))
    .sort((a, b) => (a.objectiveId === g.objectiveId ? -1 : 0) - (b.objectiveId === g.objectiveId ? -1 : 0) || ((objOrder[a.objectiveId] == null ? 1e6 : objOrder[a.objectiveId]) - (objOrder[b.objectiveId] == null ? 1e6 : objOrder[b.objectiveId])));
  base.predOpts = [{ v: '', label: 'Pick a gate' }].concat(cand.map((x) => ({ v: x.id, label: gxLabel(doc, x.id) + ' ' + (x.name || x.id) + (x.objectiveId !== g.objectiveId ? ' (' + gxObjName(ctx, x.objectiveId) + ')' : '') })));
  base.canAddPred = !ro && cand.length > 0;
  base.predFrom = d.predFrom || ''; base.onPredFrom = C.bindDraft('predFrom');
  base.predLag = d.predLag == null ? '' : String(d.predLag); base.onPredLag = C.bindDraft('predLag');
  base.addPred = () => {
    const dd0 = C.draft() || {};
    const from = dd0.predFrom;
    if (!from || !gxGate(ctx.doc, from)) { C.toast('Pick a predecessor gate.', 'err'); return; }
    const lagS = gxTxt(dd0.predLag);
    const lagN = lagS === '' ? 0 : K.num(lagS);
    if (lagN == null) { C.sheetErr('Lag is a number of days, like 5.'); return; }
    if (gxSuccessors(ctx.doc, g.id)[from]) { C.sheetErr('That gate already waits for this one; linking both ways would make a loop.'); return; }
    const ok = gxMutDoc(C, ctx, (dd) => {
      dd.stageGateEdges = dd.stageGateEdges || [];
      if (dd.stageGateEdges.some((e) => e.fromGate === from && e.toGate === g.id)) return false;
      dd.stageGateEdges.push({ fromGate: from, toGate: g.id, lagDays: Math.max(0, lagN) });
    }, 'Predecessor added.');
    if (ok) C.setDraft({ predFrom: '', predLag: '' });
  };
  const after = (doc.stageGateEdges || []).filter((e) => e && e.fromGate === g.id).map((e) => gxGate(doc, e.toGate)).filter(Boolean);
  base.hasSucc = after.length > 0;
  base.succText = after.length ? 'Waiting on this gate: ' + F.list(after.map((x) => gxLabel(doc, x.id) + ' ' + (x.name || ''))) + '.' : '';
  base.chainNote = set && set.chained !== false ? 'This workstream is chained, so the gate also follows the gate before it in the workstream.' : (set ? 'This workstream is independent: only the predecessors above can push this gate.' : '');
  const mk = gxMarkText(gxMarks(C, ctx)[g.id]);
  const cu = RD.catchupEntry(doc.catchupPlans, g.objectiveId, g.id);
  const hist = [];
  if (mk) hist.push(mk.text + '.');
  if (cu) hist.push('Re-committed by the revised plan: revision v' + (cu.version || 1) + ', ' + gxD(ctx, cu.originalDate) + ' to ' + gxD(ctx, cu.newDate) + '.');
  if (g.actualDate != null) hist.push('Passed ' + F.dayY(g.actualDate) + ((g.completionMethod || 'manual') === 'auto' ? ', every target met.' : ', marked complete by hand.'));
  base.hasHist = hist.length > 0;
  base.hist = hist.map((t, i) => ({ key: 'h' + i, t: t }));
  base.canDelete = !ro;
  base.del = () => gxDeleteGate(C, ctx, g.id);
  base.dup = () => gxStartDuplicate(C, ctx, g.id);
  base.isPassed = g.actualDate != null;
  base.completion = () => gxOpenCompletion(C, ctx, g.id, true);
  return base;
}
function gxSheetDone(C, ctx, sh) {
  const g = gxGate(ctx.doc, sh.data.id);
  const d = sh.d || {};
  return {
    gone: !g,
    title: 'Mark complete',
    sub: g ? gxLabel(ctx.doc, g.id) + ' ' + (g.name || '') : 'This gate no longer exists',
    date: d.date || '', onDate: C.bindDraft('date'),
    just: d.just || '', onJust: C.bindDraft('just'),
    save: () => {
      const s = C.sheetOf('gates');
      if (!s || !g) return;
      const dd = s.d || {};
      const v = gxTxt(dd.date) ? F.fromIso(dd.date) : null;
      if (gxTxt(dd.date) && v == null) { C.sheetErr('Completed date needs a date like 2026-10-13.'); return; }
      const ok = gxMutDoc(C, ctx, (doc) => {
        const x = gxGate(doc, g.id);
        if (!x) return false;
        x.actualDate = v != null ? v : ctx.today;
        x.completionMethod = 'manual';
        x.overrideJustification = gxTxt(dd.just);
      }, 'Gate marked complete.');
      if (ok) C.closeSheet();
    }
  };
}
function gxAfterComp(C, ctx, gid) {
  const top = C.sheet();
  if (top && top.kind === 'gates.edit' && top.data && top.data.id === gid) {
    const g = gxGate(ctx.doc, gid);
    if (g) { const a = F.iso(g.actualDate); C.setSheetData({ orig: Object.assign({}, top.data.orig, { actual: a }) }); C.setDraft({ actual: a }); }
  }
}
function gxSheetComp(C, ctx, sh) {
  const g = gxGate(ctx.doc, sh.data.id);
  const d = sh.d || {};
  if (!g) return { gone: true, ro: true, title: 'Completion', sub: 'This gate no longer exists', isAuto: false, isManual: false, rows: [], noRows: true };
  const method = g.completionMethod || 'manual';
  const ro = !!ctx.ro;
  const rows = gxKpiRows(C, ctx, g);
  return {
    gone: false, ro: ro, canEdit: !ro,
    title: 'Completion',
    sub: gxLabel(ctx.doc, g.id) + ' ' + (g.name || ''),
    date: d.date || '', onDate: C.bindDraft('date'),
    dateText: g.actualDate != null ? F.dayY(g.actualDate) : 'Not passed',
    isAuto: method === 'auto', isManual: method !== 'auto',
    savedJust: gxTxt(g.overrideJustification), hasSavedJust: !!gxTxt(g.overrideJustification),
    just: d.just || '', onJust: C.bindDraft('just'),
    rows: rows.map((r, i) => Object.assign({ key: 'ck-' + i }, r)), noRows: !rows.length,
    save: () => {
      const s = C.sheetOf('gates');
      if (!s) return;
      const dd = s.d || {};
      const v = gxTxt(dd.date) ? F.fromIso(dd.date) : null;
      if (gxTxt(dd.date) && v == null) { C.sheetErr('Passed date needs a date like 2026-10-13.'); return; }
      const ok = gxMutDoc(C, ctx, (doc) => {
        const x = gxGate(doc, g.id);
        if (!x) return false;
        if (v == null) { x.actualDate = null; x.completionMethod = null; x.overrideJustification = null; }
        else { x.actualDate = v; if ((x.completionMethod || 'manual') === 'manual') x.overrideJustification = gxTxt(dd.just); }
      }, v == null ? 'Gate un-completed.' : 'Completion updated.');
      if (ok) { C.closeSheet(); gxAfterComp(C, ctx, g.id); }
    },
    uncomplete: () => {
      const ok = gxMutDoc(C, ctx, (doc) => {
        const x = gxGate(doc, g.id);
        if (!x) return false;
        x.actualDate = null; x.completionMethod = null; x.overrideJustification = null;
      }, 'Gate un-completed.');
      if (ok) { C.closeSheet(); gxAfterComp(C, ctx, g.id); }
    }
  };
}
function gxSheetWs(C, ctx, sh) {
  const d = sh.d || {};
  const set = sh.data.id ? (ctx.doc.stageGateSets || []).find((s) => s.id === sh.data.id) : null;
  const isNew = !sh.data.id;
  return {
    gone: !isNew && !set,
    title: isNew ? 'New workstream' : 'Edit workstream',
    sub: isNew ? 'A parallel track of gates in this objective' : (set ? set.name || 'Unnamed workstream' : ''),
    name: d.name || '', onName: C.bindDraft('name'),
    onKey: (e) => { if (e && e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); gxSaveWs(C, ctx); } },
    chained: d.chained !== false, independent: d.chained === false,
    pickChained: () => C.setDraft({ chained: true }),
    pickIndependent: () => C.setDraft({ chained: false }),
    isNew: isNew, canDelete: !isNew && !!set,
    del: () => gxDelWs(C, ctx, sh.data.id, true),
    saveLabel: isNew ? 'Create workstream' : 'Save workstream',
    save: () => gxSaveWs(C, ctx)
  };
}
function gxSaveWs(C, ctx) {
  const sh = C.sheetOf('gates');
  if (!sh || sh.kind !== 'gates.ws') return;
  const d = sh.d || {};
  const name = gxTxt(d.name);
  if (!name) { C.sheetErr('Give the workstream a name.'); return; }
  const chained = d.chained !== false;
  const objId = ctx.objId;
  let ok;
  if (sh.data.id) {
    ok = gxMutDoc(C, ctx, (doc) => { const s = (doc.stageGateSets || []).find((x) => x.id === sh.data.id); if (!s) return false; s.name = name; s.chained = chained; }, 'Workstream updated.');
  } else {
    ok = gxMutDoc(C, ctx, (doc) => {
      doc.stageGateSets = doc.stageGateSets || [];
      doc.stageGateSets.push({ id: RD.allocId('stageGateSet', objId, doc.stageGateSets.map((x) => x.id)), objectiveId: objId, name: name, order: gxSetsOf(doc, objId).length, chained: chained });
    }, 'Workstream added.');
  }
  if (ok) C.closeSheet();
}
function gxSheetWsDel(C, ctx, sh) {
  const doc = ctx.doc, d = sh.d || {};
  const set = (doc.stageGateSets || []).find((s) => s.id === sh.data.id);
  if (!set) return { gone: true, title: 'Delete workstream', sub: '', only: false, move: false, opts: [] };
  const n = gxGatesOf(doc, set.objectiveId).filter((g) => g.setId === set.id).length;
  const others = gxSetsOf(doc, set.objectiveId).filter((s) => s.id !== set.id);
  const choice = d.choice || (others.length ? 'move' : 'keep');
  const ids = gxGatesOf(doc, set.objectiveId).filter((g) => g.setId === set.id).map((g) => g.id);
  return {
    gone: false,
    title: 'Delete workstream',
    sub: set.name || 'Unnamed workstream',
    only: !others.length, move: others.length > 0,
    intro: !others.length
      ? (set.name || 'This workstream') + ' is the only workstream and holds ' + F.plural(n, 'stage-gate') + '.'
      : (set.name || 'This workstream') + ' holds ' + F.plural(n, 'stage-gate') + '. What should happen to ' + (n === 1 ? 'it' : 'them') + '?',
    keepOn: choice === 'keep', delOn: choice === 'delete', moveOn: choice === 'move',
    pickKeep: () => C.setDraft({ choice: 'keep' }),
    pickDel: () => C.setDraft({ choice: 'delete' }),
    pickMove: () => C.setDraft({ choice: 'move' }),
    delAllLabel: 'Delete the workstream and its ' + F.plural(n, 'stage-gate'),
    moveLabel: 'Move ' + (n === 1 ? 'it' : 'them') + ' to',
    delLabel: 'Delete ' + (n === 1 ? 'it' : 'them') + ' with the workstream',
    lossText: 'Their ' + gxLossText(doc, ids) + ' go too. This cannot be undone.',
    to: d.to || (others[0] ? others[0].id : ''), onTo: (e) => C.setDraft({ to: e && e.target ? e.target.value : '', choice: 'move' }),
    opts: others.map((s) => ({ v: s.id, label: s.name || 'Unnamed workstream' })),
    goCls: choice === 'keep' ? 'btn pri' : 'btn danger solid',
    goLabel: choice === 'keep' ? 'Keep everything' : 'Continue',
    go: () => gxApplyWsDel(C, ctx)
  };
}
function gxSheetDup(C, ctx, sh) {
  const g = gxGate(ctx.doc, sh.data.id);
  const d = sh.d || {};
  if (!g) return { gone: true, title: 'Duplicate gate', sub: '', opts: [] };
  const sets = gxSetsOf(ctx.doc, g.objectiveId);
  return {
    gone: false,
    title: 'Duplicate gate',
    sub: gxLabel(ctx.doc, g.id) + ' ' + (g.name || ''),
    to: d.to || g.setId || '', onTo: C.bindDraft('to'),
    opts: sets.map((s, i) => ({ v: s.id, label: 'Workstream ' + String.fromCharCode(65 + i) + ': ' + (s.name || 'unnamed') })),
    go: () => { const s = C.sheetOf('gates'); gxDuplicate(C, ctx, g.id, s && s.d ? s.d.to || g.setId : g.setId); }
  };
}
function gxSheetRevise(C, ctx, sh) {
  const rp = gxRp(C);
  if (!rp || rp.objId !== sh.data.objId) return { gone: true, title: 'Revise plan', sub: '', blocks: [] };
  const doc = C.D.docs[rp.docKey] || ctx.doc;
  const live = rp.gates.filter((g) => !g.del && g.planned != null).map((g) => g.planned);
  const planEnd = live.length ? Math.max.apply(null, live) : null;
  const over = rp.finish != null && planEnd != null && planEnd > rp.finish;
  const nAdd = rp.gates.filter((g) => g.isNew && !g.del).length, nDel = rp.gates.filter((g) => g.del && !g.isNew).length;
  const flat = [];
  rp.sets.forEach((s) => rp.gates.forEach((g) => { if (g.setId === s.id) flat.push(g.id); }));
  const rowVM = (g) => {
    const locked = g.passed || g.del;
    const kn = g.isNew ? (g.targets || []).length : (doc.kpis || []).filter((k) => k.hostType === 'stageGate' && k.hostId === g.id).length;
    const pos = flat.indexOf(g.id);
    return {
      key: 'rp-' + g.id, id: g.id,
      cls: 'gates-rp-row' + (g.del ? ' del' : '') + (g.isNew ? ' new' : '') + (C.state.gates_rpOver === g.id ? ' hot' : ''),
      idText: g.isNew ? 'New' : gxLabel(doc, g.id),
      idCls: g.passed ? 'tid tx-ok' : 'tid',
      name: g.name, nameRo: locked,
      onName: (e) => gxRpRow(C, g.id, { name: e && e.target ? e.target.value : '' }),
      date: g.planned == null ? '' : F.iso(g.planned), dateOff: locked,
      onDate: (e) => gxRpRow(C, g.id, { planned: F.fromIso(e && e.target ? e.target.value : '') }),
      nameLabel: 'Gate name, ' + (g.isNew ? 'new gate' : gxLabel(doc, g.id)),
      dateLabel: 'Planned date, ' + (gxTxt(g.name) || (g.isNew ? 'new gate' : gxLabel(doc, g.id))),
      canDrag: !locked,
      onDragStart: (e) => { C._gxRpDrag = g.id; try { if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', g.id); } } catch (x) { /* ignore */ } },
      onDragEnd: () => { C._gxRpDrag = null; if (C.state.gates_rpOver) C.setState({ gates_rpOver: '' }); },
      onOver: (e) => {
        if (!C._gxRpDrag) return;
        if (e && e.stopPropagation) e.stopPropagation();          /* the row, not its workstream, is the drop target */
        if (C._gxRpDrag === g.id) return;
        if (e && e.preventDefault) e.preventDefault();
        if (C.state.gates_rpOver !== g.id) C.setState({ gates_rpOver: g.id });
      },
      onDrop: (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        const src = C._gxRpDrag; C._gxRpDrag = null;
        if (C.state.gates_rpOver) C.setState({ gates_rpOver: '' });
        if (src && src !== g.id) gxRpMove(C, src, g.id);
      },
      isDel: !!g.del, isPassed: !!g.passed, canEditRow: !locked,
      note: g.del ? 'Will be removed' : g.passed ? 'Passed, locked' : '',
      noteCls: g.del ? 'small tx-bad' : 'small tx-ok',
      tgtLabel: kn ? F.plural(kn, 'target') : 'Add target',
      tgtTitle: 'Targets for ' + (gxTxt(g.name) || 'this gate'),
      openTargets: () => C.pushSheet('gates.rtgt', { row: g.id }, {}),
      canUp: !locked && pos > 0, canDown: !locked && pos >= 0 && pos < flat.length - 1,
      up: () => gxRpStep(C, g.id, -1), down: () => gxRpStep(C, g.id, 1),
      upLabel: 'Move ' + (gxTxt(g.name) || 'gate') + ' up', downLabel: 'Move ' + (gxTxt(g.name) || 'gate') + ' down',
      delLabel: 'Remove ' + (gxTxt(g.name) || 'this gate') + ' from the plan',
      del: () => gxRpDel(C, g.id),
      undo: () => gxRpRow(C, g.id, { del: false })
    };
  };
  const blocks = rp.sets.map((s, si) => {
    const rows = rp.gates.filter((g) => g.setId === s.id).map(rowVM);
    return {
      key: 'rpws-' + s.id, id: s.id,
      cls: 'gates-rp-ws dz' + (C.state.gates_rpOver === 'ws:' + s.id ? ' hot' : ''),
      label: 'Workstream ' + String.fromCharCode(65 + si), name: s.name || 'Unnamed workstream',
      addLabel: 'Add a gate to ' + (s.name || 'this workstream'),
      add: () => gxRpAdd(C, s.id),
      rows: rows, empty: !rows.length,
      onOver: (e) => { if (!C._gxRpDrag) return; if (e && e.preventDefault) e.preventDefault(); if (C.state.gates_rpOver !== 'ws:' + s.id) C.setState({ gates_rpOver: 'ws:' + s.id }); },
      onDrop: (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const src = C._gxRpDrag; C._gxRpDrag = null;
        if (C.state.gates_rpOver) C.setState({ gates_rpOver: '' });
        if (src) gxRpMoveToSet(C, src, s.id);
      }
    };
  });
  const counts = [];
  if (nAdd) counts.push(F.plural(nAdd, 'gate') + ' added');
  if (nDel) counts.push(F.plural(nDel, 'gate') + ' removed');
  return {
    gone: false,
    title: 'Revise plan',
    sub: 'Drafting v' + rp.v + ' for ' + gxObjName(ctx, rp.objId),
    v: 'v' + rp.v,
    blocks: blocks, noSets: !rp.sets.length,
    hasFinish: rp.finish != null, noFinish: rp.finish == null,
    finish: rp.finish == null ? '' : F.iso(rp.finish),
    onFinish: (e) => { const v = F.fromIso(e && e.target ? e.target.value : ''); if (v != null) gxRpSet(C, { finish: v }); },
    finishText: rp.finish != null
      ? 'This plan ends ' + (planEnd != null ? F.dayY(planEnd) : 'with no dated gate') + (planEnd == null ? '.' : over ? ', past the committed finish.' : ', inside the committed finish.')
      : 'This objective has no committed finish date. Set one here to record it with the revision.',
    finishCls: over ? 'small tx-bad' : 'small',
    counts: counts.join(', '), hasCounts: counts.length > 0,
    reason: rp.reason || '', onReason: (e) => gxRpSet(C, { reason: e && e.target ? e.target.value : '' }),
    reasonPh: 'Recorded with v' + rp.v,
    commitLabel: 'Commit v' + rp.v,
    commit: () => gxCommitRevise(C, ctx),
    cancel: () => { C.setState({ gates_rp: null }); C.closeAllSheets(); }
  };
}
function gxSheetRtgt(C, ctx, sh) {
  const rp = gxRp(C);
  const row = rp && rp.gates.find((g) => g.id === sh.data.row);
  if (!row) return { gone: true, title: 'Targets', sub: '', note: '' };
  const doc = C.D.docs[rp.docKey] || ctx.doc;
  return {
    gone: false,
    title: 'Targets',
    sub: (row.isNew ? 'New gate' : gxLabel(doc, row.id)) + (gxTxt(row.name) ? ', ' + gxTxt(row.name) : ''),
    kt: row.isNew
      ? gxKT(C, ctx, '__pending__', { key: 'rp:' + row.id, connect: false, pending: (row.targets || []).slice(), onPending: (l) => gxRpRow(C, row.id, { targets: Array.isArray(l) ? l : [] }) })
      : gxKT(C, ctx, row.id, { key: 'rp:' + row.id, connect: false }),
    note: row.isNew
      ? 'These targets are added with the gate when you commit v' + rp.v + '.'
      : 'Target changes save right away, and the next commit records them in the plan history.'
  };
}
function gxSheetCmp(C, ctx, sh) {
  const doc = ctx.doc, objId = sh.data.objId, v = sh.data.v;
  const vs = RD.planVersionsOf(doc, objId);
  const to = vs.find((r) => r.v === v), from = vs.find((r) => r.v === v - 1);
  if (!to) return { gone: true, title: 'Plan history', sub: '', lines: [], gates: [], isFirst: false, isDiff: false };
  if (!from) {
    const gs = ((to.snapshot && to.snapshot.gates) || []);
    return {
      gone: false, isFirst: true, isDiff: false,
      title: 'Plan v' + v + ', as first committed',
      sub: to.committedDay != null ? 'Committed ' + F.dayY(to.committedDay) : '',
      reason: '', hasReason: false,
      gates: gs.map((g, i) => ({ key: 'cg-' + i, name: g.name || g.id, date: g.plannedDate != null ? F.dayY(g.plannedDate) : 'No date' })),
      noGates: !gs.length,
      finish: to.snapshot && to.snapshot.finishDay != null ? 'Committed finish ' + F.dayY(to.snapshot.finishDay) : 'No committed finish',
      lines: [], none: false
    };
  }
  const df = RD.diffPlanSnapshots(from.snapshot, to.snapshot);
  const lines = [];
  const dt = (x) => (x != null ? F.dayY(x) : 'no date');
  df.added.forEach((g) => lines.push({ k: 'Added', cls: 'tag gates-add', t: (g.name || g.id) + ', ' + dt(g.plannedDate) }));
  df.removed.forEach((g) => lines.push({ k: 'Removed', cls: 'tag gates-rem', t: g.name || g.id }));
  df.moved.forEach((m) => lines.push({ k: 'Moved', cls: 'tag', t: (m.name || m.id) + ': ' + dt(m.from) + ' to ' + dt(m.to) + (m.deltaDays != null ? ' (' + (m.deltaDays > 0 ? '+' : m.deltaDays < 0 ? '−' : '') + gxDays(m.deltaDays) + ')' : '') }));
  df.retargeted.forEach((m) => lines.push({ k: 'Retargeted', cls: 'tag', t: m.name || m.id }));
  df.renamed.forEach((m) => lines.push({ k: 'Renamed', cls: 'tag', t: (m.from || '') + ' to ' + (m.to || '') }));
  if (df.finishChanged) lines.push({ k: 'Finish', cls: 'tag gates-rem', t: dt(df.fromFinish) + ' to ' + dt(df.toFinish) });
  if (df.reordered) lines.push({ k: 'Reordered', cls: 'tag', t: 'The gate order changed.' });
  return {
    gone: false, isFirst: false, isDiff: true,
    title: 'Compare v' + (v - 1) + ' and v' + v,
    sub: to.committedDay != null ? 'v' + v + ' committed ' + F.dayY(to.committedDay) : '',
    reason: gxTxt(to.reason) ? '“' + gxTxt(to.reason) + '”' : '', hasReason: !!gxTxt(to.reason),
    lines: lines.map((l, i) => Object.assign({ key: 'cl-' + i }, l)), none: !lines.length,
    gates: [], noGates: false, finish: ''
  };
}
function gxSheetRecommit(C, ctx, sh) {
  const objId = sh.data.objId;
  const casc = gxCasc(C, ctx);
  const ds = (sh.d && sh.d.dates) || {};
  const gates = gxSortDue(gxGatesOf(ctx.doc, objId).filter((g) => g.actualDate == null));
  const slip = casc.objectiveScheduleSlip ? casc.objectiveScheduleSlip[objId] : null;
  const rows = gates.map((g) => {
    const fc = casc.gateEffective[g.id];
    const v = ds[g.id] || '';
    return {
      key: 'rc-' + g.id, label: gxLabel(ctx.doc, g.id), name: g.name || g.id,
      cur: g.plannedDate != null ? gxD(ctx, g.plannedDate) : '—',
      fc: fc != null ? gxD(ctx, fc) : '—',
      value: v, filled: F.fromIso(v) != null,
      dateLabel: 'New commitment for ' + gxLabel(ctx.doc, g.id),
      onDate: (e) => C.setDraftPath('dates.' + g.id, e && e.target ? e.target.value : '')
    };
  });
  const dated = rows.filter((r) => r.filled).length;
  const all = rows.length > 0 && dated === rows.length;
  return {
    gone: !rows.length,
    title: 'Build revised plan',
    sub: gxObjName(ctx, objId),
    intro: 'This objective is ' + (slip != null && slip > 0 ? gxDays(slip) + ' behind' : 'off schedule') + '. Re-commit every unfinished stage-gate to a new date; keeping its current date is a plan to make up the time. Passed gates are not listed: the revised plan accounts for their delays, and after it only new slips count.',
    req: all ? 'Ready to enact' : 'All ' + rows.length + ' dates are required to enact', reqCls: all ? 'note t-ok' : 'note t-warn',
    rows: rows,
    count: dated + ' of ' + rows.length + ' dated',
    off: !all,
    enact: () => gxEnact(C, ctx)
  };
}

/* ------------------------------------------------------------------ public */
const GATES = {
  openRevise(C, ctx) { gxOpenRevise(C, ctx || C.ctx); },
  openGate(C, ctx, gateId) {
    ctx = ctx || C.ctx;
    const g = gxGate(ctx.doc, gateId);
    if (!g) { C.toast('That gate no longer exists.', 'err'); return; }
    const patch = { tab: 'gates', menu: '' };
    if (g.objectiveId !== ctx.objId) {
      patch.objId = g.objectiveId;
      if (!(ctx.objs || []).some((o) => o.id === g.objectiveId)) { patch.fQuarter = ''; patch.fProduct = ''; patch.fOwner = ''; }
    }
    C.setState(patch);
    gxOpenEdit(C, ctx, gateId);
  },
  label(doc, gateId) { return gxLabel(doc, gateId); }
};

MODS.gates = {
  state(C) {
    gxHook(C);
    return { gates_open: {}, gates_ren: null, gates_drag: '', gates_over: '', gates_pend: [], gates_rp: null, gates_rpOver: '', gates_focus: '' };
  },
  wide: ['gates.revise'],
  api: GATES,
  vm(C, ctx) {
    const o = {};
    gxLazy(C, o, 'tab', () => gxTabVM(C, ctx), null);
    gxLazy(C, o, 'hist', () => gxHistVM(C, ctx), null);
    const sh = C.sheetOf('gates');
    const kinds = { shEdit: ['gates.edit', gxSheetEdit], shDone: ['gates.done', gxSheetDone], shComp: ['gates.comp', gxSheetComp],
      shWs: ['gates.ws', gxSheetWs], shWsDel: ['gates.wsdel', gxSheetWsDel], shDup: ['gates.dup', gxSheetDup], shRev: ['gates.revise', gxSheetRevise],
      shRtgt: ['gates.rtgt', gxSheetRtgt], shCmp: ['gates.cmp', gxSheetCmp], shRec: ['gates.recommit', gxSheetRecommit] };
    Object.keys(kinds).forEach((k) => {
      const kind = kinds[k][0], fn = kinds[k][1];
      gxLazy(C, o, k, () => (sh && sh.kind === kind ? fn(C, ctx, sh) : null), null);
    });
    return o;
  },
  /* header search: gates in this division by name or gate id */
  search(C, ctx, q) {
    const s = gxTxt(q).toLowerCase();
    if (!s || !ctx || !ctx.doc) return [];
    return (ctx.doc.stageGates || []).filter((g) => g && ((g.name || '').toLowerCase().indexOf(s) >= 0 || (g.gate_id || '').toLowerCase().indexOf(s) >= 0))
      .slice(0, 8).map((g) => ({
        label: gxLabel(ctx.doc, g.id) + ' ' + (g.name || g.id),
        sub: 'Stage-gate' + (g.gate_id ? ', gate id ' + g.gate_id : '') + ', ' + gxObjName(ctx, g.objectiveId),
        go: () => GATES.openGate(C, ctx, g.id)
      }));
  }
};
