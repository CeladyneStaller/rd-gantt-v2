/* ============================================================================
   FMEA risk register, Execution and Sales (owner: X-fmea).

   Today's source (read only):
     Execution  execution_app.template.html L5870–6291 register, problem modal, evidence
                experiments; header card L3564–3573; adoptExec L2893 (RD.migrateProblem on load)
     Sales      sales_app.template.html L4268–4456 (same register, no evidence, no collapse);
                header card L2223–2232; adoptExec L1610
   Data: ctx.doc.risks[] in the real shape
     { rid, objectiveId, problem, gateId, status, knowns[{kid,text}],
       modes[{ mid, mode, status, experiments?, effects[{ eid, effect, status, experiments?,
         causes[{ cid, cause, severity, occurrence, detection, mitigation, status, experiments? }] }] }] }
     evidence experiment { xid, code, hypothesis, toggle, test, samples[], key_reads[{krid,name,unit}],
                           values{ sample: { krid: value } }, notes, verdict, conclusion }
   Sheets
     'fmea.edit'  problem editor; data { rid } ('' = new); draft = the problem being edited
     'fmea.exp'   evidence experiment (Execution), stacked on the problem editor; its edits go
                  straight into the problem draft, as today (Back keeps them, Save experiment
                  commits the whole draft at once)
   Public (for the shell and other modules)
     FMEA.rollup(ctx)                today's "Open high-risk" numbers plus tone and sub-line
     FMEA.gateLabel(doc, gateId)     "SG-A1" (workstream letter, then due-date order)
     FMEA.gatePassed(doc, gateId, today)
     FMEA.migrate(doc)               RD.migrateProblem over doc.risks (run it after any simulated reload)
     FMEA.open(C, ctx, rid, path)    open the editor ('' = new problem); path stacks an experiment
   ========================================================================== */

const FMEA_EXEC = APP !== 'sales';     // evidence experiments and collapse exist in Execution only (sales §22)
const FMEA_STATUS = [
  { v: 'open', label: 'Open', tone: 'bad' },
  { v: 'mitigating', label: 'Mitigating', tone: 'warn' },
  { v: 'resolved', label: 'Resolved', tone: 'ok' }
];
const FMEA_LEVEL = { p: 'Problem', m: 'Failure mode', e: 'Effect', c: 'Cause' };
const FMEA_BAND = { high: { word: 'High', tone: 'bad' }, med: { word: 'Medium', tone: 'warn' }, low: { word: 'Low', tone: 'ok' } };
const FMEA_VERDICTS = [
  { v: '', label: 'Not concluded', chip: 'Not concluded', tone: 'info' },
  { v: 'confirmed', label: 'Confirmed', chip: 'Confirmed', tone: 'ok' },
  { v: 'refuted', label: 'Refuted', chip: 'Refuted', tone: 'bad' },
  { v: 'inconclusive', label: 'Inconclusive', chip: 'Inconclusive', tone: 'warn' }
];
const FMEA_SOD = [['severity', 'Severity'], ['occurrence', 'Occurrence'], ['detection', 'Detection']];
const FMEA_OPTS = {};
FMEA_SOD.forEach((f) => {
  FMEA_OPTS[f[0]] = (RD.FMEA_SCALES[f[0]] || []).map((lbl, i) => ({ v: String(i + 1), label: (i + 1) + ' — ' + lbl }));
});
const FMEA_VERDICT_OPTS = FMEA_VERDICTS.map((v) => ({ v: v.v, label: v.label }));

function fmeaSt(v) {
  const s = FMEA_STATUS.find((x) => x.v === (v || 'open'));
  return s || { v: v, label: F.cap(String(v)), tone: 'none' };
}
function fmeaBand(r) { return FMEA_BAND[RD.rpnBand(r)] || FMEA_BAND.low; }
function fmeaVerdict(v) {
  const x = FMEA_VERDICTS.find((y) => y.v === (v || ''));
  return x || { v: v, label: F.cap(String(v)), chip: F.cap(String(v)), tone: 'info' };
}
function fmeaTrunc(t, n) { t = String(t == null ? '' : t).trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function fmeaQ(t) { return '“' + t + '”'; }
function fmeaNum(v) { const n = parseInt(v, 10); return n >= 1 && n <= 10 ? n : 1; }

const FMEA = {
  /* today's sortGatesByDue: planned date, then name, then id */
  byDue(list) {
    return list.slice().sort((a, b) => {
      const pa = a.plannedDate == null ? Infinity : a.plannedDate, pb = b.plannedDate == null ? Infinity : b.plannedDate;
      return (pa - pb) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id));
    });
  },
  gatesOf(doc, objId) { return FMEA.byDue(((doc && doc.stageGates) || []).filter((g) => g.objectiveId === objId)); },
  /* today's gateLabel: "SG-" + workstream letter (sets by order, then name) + position by due date */
  gateLabel(doc, gateId) {
    const gates = (doc && doc.stageGates) || [];
    const g = gates.find((x) => x.id === gateId);
    if (!g) return String(gateId);
    const peers = FMEA.byDue(gates.filter((x) => x.objectiveId === g.objectiveId && x.setId === g.setId));
    const n = peers.findIndex((x) => x.id === gateId) + 1;
    if (n < 1) return String(gateId);
    const sets = ((doc && doc.stageGateSets) || []).filter((s) => s.objectiveId === g.objectiveId).slice()
      .sort((a, b) => ((a.order || 0) - (b.order || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
    const si = sets.findIndex((s) => s.id === g.setId);
    return 'SG-' + (si >= 0 ? String.fromCharCode(65 + si) : '') + n;
  },
  /* today's execGatePassed */
  gatePassed(doc, gateId, today) {
    if (!gateId) return false;
    const g = ((doc && doc.stageGates) || []).find((x) => x.id === gateId);
    if (!g) return false;
    const s = RD.classifyGate(g, today);
    return s === 'passed' || s === 'passed-late';
  },
  /* the header card's numbers (today: RD.fmeaRollup(RD.fmeaProblemsFor(exec, obj), execGatePassed)) */
  rollup(ctx) {
    const doc = ctx.doc;
    const r = RD.fmeaRollup(RD.fmeaProblemsFor(doc, ctx.objId), (gid) => FMEA.gatePassed(doc, gid, ctx.today));
    r.tone = r.openHigh > 0 ? 'bad' : r.openMed > 0 ? 'warn' : r.total ? 'ok' : 'none';
    r.sub = r.total ? F.plural(r.total, 'problem') + ', worst open RPN ' + r.worst : 'No FMEA items';
    return r;
  },
  migrate(doc) { if (doc) doc.risks = (doc.risks || []).map(RD.migrateProblem); return doc; },
  counts(p) {
    let m = 0, e = 0, c = 0;
    ((p && p.modes) || []).forEach((mo) => { m++; (mo.effects || []).forEach((ef) => { e++; c += (ef.causes || []).length; }); });
    return { modes: m, effects: e, causes: c, xs: RD.fmeaAllExperiments(p).length, knowns: ((p && p.knowns) || []).filter((k) => k && String(k.text || '').trim()).length };
  },
  /* a new problem starts with no failure modes (today: blankProblem, then modes = []) */
  blank(objId) { const p = RD.blankProblem(objId); p.modes = []; return p; },
  open(C, ctx, rid, path) {
    const p = rid ? (ctx.doc.risks || []).find((x) => x.rid === rid) : null;
    if (rid && !p) return;
    C.setState({ fmea_af: '' });
    C.openSheet('fmea.edit', { rid: p ? p.rid : '' }, p ? K.clone(p) : FMEA.blank(ctx.objId));
    if (p && path && FMEA_EXEC) C.pushSheet('fmea.exp', { path: path }, { sample: '' });
  }
};

/* ---------------------------------------------------------------- data paths */
function fmeaFind(doc, ids) {
  const p = ((doc && doc.risks) || []).find((x) => x.rid === ids.rid);
  if (!p || !ids.mid) return p || null;
  const m = (p.modes || []).find((x) => x.mid === ids.mid);
  if (!m || !ids.eid) return m || null;
  const e = (m.effects || []).find((x) => x.eid === ids.eid);
  if (!e || !ids.cid) return e || null;
  return (e.causes || []).find((x) => x.cid === ids.cid) || null;
}
/* draft addressing (the draft is a self-contained copy, so positions are safe, as today) */
function fmeaNodePath(path) {
  let s = 'modes.' + path.mi;
  if (path.ei != null) { s += '.effects.' + path.ei; if (path.ci != null) s += '.causes.' + path.ci; }
  return s;
}
function fmeaNodeAt(prob, path) {
  const m = prob && prob.modes ? prob.modes[path.mi] : null;
  if (!m || path.ei == null) return m || null;
  const e = m.effects ? m.effects[path.ei] : null;
  if (!e || path.ci == null) return e || null;
  return (e.causes && e.causes[path.ci]) || null;
}
/* the problem editor somewhere in the sheet stack (the experiment sheet sits on top of it) */
function fmeaParentIdx(C) {
  const s = C.state.sheets || [];
  for (let i = s.length - 1; i >= 0; i--) if (s[i].kind === 'fmea.edit') return i;
  return -1;
}
function fmeaSetPD(C, path, value) {
  const i = fmeaParentIdx(C);
  if (i < 0) return;
  const s = (C.state.sheets || []).slice();
  s[i] = Object.assign({}, s[i], { d: K.setPath(s[i].d || {}, path, value) });
  C.setState({ sheets: s });
}

/* ------------------------------------------------------- register mutations */
function fmeaSetStatus(C, docKey, ids, lvl, v) {
  C.closeMenus();
  C.mutate((D) => {
    const n = fmeaFind(D.docs[docKey], ids);
    if (!n) return false;
    n.status = v;
  }, { msg: FMEA_LEVEL[lvl] + ' marked ' + fmeaSt(v).label.toLowerCase() + '.' });
}
function fmeaSetSod(C, docKey, ids, field, v) {
  C.mutate((D) => {
    const c = fmeaFind(D.docs[docKey], ids);
    if (!c) return false;
    c[field] = fmeaNum(v);
  });
}
/* today's delCause: removing the last cause removes its effect, and the last effect removes the mode */
function fmeaAskRemoveCause(C, docKey, ids) {
  const doc = C.D.docs[docKey];
  const p = fmeaFind(doc, { rid: ids.rid });
  const m = fmeaFind(doc, { rid: ids.rid, mid: ids.mid });
  const e = fmeaFind(doc, { rid: ids.rid, mid: ids.mid, eid: ids.eid });
  const c = fmeaFind(doc, ids);
  if (!p || !m || !e || !c) return;
  const effGoes = (e.causes || []).length === 1;
  const modeGoes = effGoes && (m.effects || []).length === 1;
  const xs = RD.fmeaNodeExperiments(c).length + (effGoes ? RD.fmeaNodeExperiments(e).length : 0) + (modeGoes ? RD.fmeaNodeExperiments(m).length : 0);
  const bits = [(c.cause ? fmeaQ(fmeaTrunc(c.cause, 70)) : 'This unnamed cause') + ' is removed from ' + fmeaQ(fmeaTrunc(p.problem || 'Unnamed problem', 70)) + '.'];
  if (effGoes) bits.push('It is the only cause of the effect ' + fmeaQ(fmeaTrunc(e.effect || 'Unnamed effect', 60)) + ', so that effect is removed too.');
  if (modeGoes) bits.push('That was the only effect of the failure mode ' + fmeaQ(fmeaTrunc(m.mode || 'Unnamed failure mode', 60)) + ', so the failure mode goes as well.');
  if (xs) bits.push(xs === 1 ? 'One evidence experiment is removed with it.' : xs + ' evidence experiments are removed with it.');
  C.confirm({
    title: 'Remove this cause?', body: bits.join(' '), ok: 'Remove cause', danger: true,
    onOk: () => C.mutate((D) => {
      const pp = fmeaFind(D.docs[docKey], { rid: ids.rid });
      const mm = fmeaFind(D.docs[docKey], { rid: ids.rid, mid: ids.mid });
      const ee = fmeaFind(D.docs[docKey], { rid: ids.rid, mid: ids.mid, eid: ids.eid });
      if (!pp || !mm || !ee) return false;
      ee.causes = (ee.causes || []).filter((x) => x.cid !== ids.cid);
      if (!ee.causes.length) mm.effects = (mm.effects || []).filter((x) => x.eid !== ids.eid);
      if (!mm.effects.length) pp.modes = (pp.modes || []).filter((x) => x.mid !== ids.mid);
    }, { msg: modeGoes ? 'Cause removed, with its effect and failure mode.' : effGoes ? 'Cause removed, with its effect.' : 'Cause removed.' })
  });
}
function fmeaAskDelete(C, docKey, rid) {
  const p = fmeaFind(C.D.docs[docKey], { rid: rid });
  if (!p) return;
  const n = FMEA.counts(p);
  const parts = [];
  if (n.modes) parts.push(F.plural(n.modes, 'failure mode'));
  if (n.effects) parts.push(F.plural(n.effects, 'effect'));
  if (n.causes) parts.push(F.plural(n.causes, 'cause'));
  if (n.knowns) parts.push(F.plural(n.knowns, 'known'));
  if (n.xs) parts.push(F.plural(n.xs, 'evidence experiment'));
  const name = fmeaQ(fmeaTrunc(p.problem || 'Unnamed problem', 80));
  C.confirm({
    title: 'Delete this problem?',
    body: parts.length ? name + ' is deleted with its ' + F.list(parts) + '. This cannot be undone.' : name + ' is deleted. This cannot be undone.',
    ok: 'Delete problem', danger: true,
    onOk: () => C.mutate((D) => {
      const doc = D.docs[docKey];
      const i = ((doc && doc.risks) || []).findIndex((x) => x.rid === rid);
      if (i < 0) return false;
      doc.risks.splice(i, 1);
    }, { msg: 'Problem deleted.' })
  });
}

/* ------------------------------------------------------------ view helpers */
/* Escape closes an open status menu or the rescore popover (the kit has no global key listener) */
function fmeaEscKey(C) { return (e) => { if (e && e.key === 'Escape' && C.state.menu) C.closeMenus(); }; }
function fmeaStatusVM(C, menuId, lvl, cur, apply, canEdit) {
  const s = fmeaSt(cur);
  const open = !!canEdit && C.isMenu(menuId);
  return {
    edit: !!canEdit, word: s.label, cls: 'st ' + F.tone(s.tone), btnCls: 'fmea-stb ' + F.tone(s.tone),
    open: open, wrapCls: 'above fmea-stw' + (open ? ' fmea-hot' : ''),
    toggle: () => C.toggleMenu(menuId), onKey: fmeaEscKey(C),
    aria: FMEA_LEVEL[lvl] + ' status, ' + s.label,
    menuAria: FMEA_LEVEL[lvl] + ' status',
    opts: FMEA_STATUS.map((o) => ({ label: o.label, on: o.v === (cur || 'open'), dotCls: 'dot ' + F.tone(o.tone), pick: () => apply(o.v) }))
  };
}
/* register chips: "EXP-n" and its verdict, coloured by verdict (today's fxChip) */
function fmeaChips(C, ctx, p, node, path, canEdit) {
  if (!FMEA_EXEC) return { xs: [], hasXs: false };
  const xs = RD.fmeaNodeExperiments(node).map((x, xi) => {
    const v = fmeaVerdict(x.verdict);
    const pr = RD.fmeaExpProgress(x);
    return {
      code: x.code || 'EXP', word: v.chip, cls: 'fmea-x ' + F.tone(v.tone), canOpen: !!canEdit,
      title: (x.code || 'EXP') + ', ' + v.label.toLowerCase() + (pr.total ? ', ' + pr.filled + ' of ' + pr.total + ' values recorded' : ''),
      open: () => FMEA.open(C, ctx, p.rid, Object.assign({}, path, { xi: xi }))
    };
  });
  return { xs: xs, hasXs: xs.length > 0 };
}

/* ------------------------------------------------------------ the register */
function fmeaRegister(C, ctx) {
  const doc = ctx.doc, today = ctx.today;
  const canEdit = !C.isRo();
  const focus = C.state.fmea_focus || '';
  const gp = (gid) => FMEA.gatePassed(doc, gid, today);
  const probs = RD.fmeaProblemsFor(doc, ctx.objId);
  /* today: sorted by worst unresolved RPN, highest first (stable for ties) */
  const sorted = probs.map((p) => ({ p: p, u: RD.worstUnresolvedRpn(p, gp(p.gateId)) })).sort((a, b) => b.u - a.u);
  const roll = FMEA.rollup(ctx);
  const open = [];
  if (roll.openHigh) open.push(roll.openHigh + ' high');
  if (roll.openMed) open.push(roll.openMed + ' medium');
  if (roll.openLow) open.push(roll.openLow + ' low');
  let summary = '';
  if (probs.length) {
    summary = open.length ? F.list(open) + ' open, worst open RPN ' + roll.worst + '.' : 'Nothing counts as open.';
    if (roll.clear && open.length) summary += ' ' + (roll.clear === 1 ? '1 no longer counts as open.' : roll.clear + ' no longer count as open.');
  } else summary = 'Failure modes, effects and causes for this objective.';
  return {
    canEdit: canEdit,
    add: () => FMEA.open(C, ctx, ''),
    count: F.plural(probs.length, 'problem'),
    summary: summary,
    empty: !probs.length,
    emptyText: canEdit ? 'No problems yet. Add a problem to start an FMEA for this objective.' : 'No problems recorded for this objective.',
    probs: sorted.map((en) => fmeaCard(C, ctx, en, gp, focus, canEdit))
  };
}

function fmeaCard(C, ctx, en, gp, focus, canEdit) {
  const r = en.p, rid = r.rid, doc = ctx.doc, docKey = ctx.docKey;
  const resolved = r.status === 'resolved';
  /* today: the badge shows the worst open RPN, or the plain worst RPN when nothing counts as open */
  const top = en.u > 0 ? en.u : (resolved ? 0 : RD.worstRpn(r));
  const passed = gp(r.gateId);
  const g = r.gateId ? (doc.stageGates || []).find((x) => x.id === r.gateId) : null;
  const tag = r.gateId ? FMEA.gateLabel(doc, r.gateId) : '';
  let gateLine = '';
  if (r.gateId) {
    if (!g) gateLine = 'Linked stage-gate no longer exists';
    else if (passed) gateLine = (g.name || g.id) + ', passed ' + F.day(g.actualDate);
    else gateLine = (g.name || g.id) + (g.plannedDate != null ? ', due ' + F.day(g.plannedDate) : '');
  }
  const n = FMEA.counts(r);
  const meta = [F.plural(n.modes, 'failure mode'), F.plural(n.effects, 'effect'), F.plural(n.causes, 'cause')].join(', ');
  let ev = '';
  if (FMEA_EXEC && n.xs) {
    const t = RD.fmeaEvidenceRollup(r);
    const bits = [];
    if (t.confirmed) bits.push(t.confirmed + ' confirmed');
    if (t.refuted) bits.push(t.refuted + ' refuted');
    if (t.inconclusive) bits.push(t.inconclusive + ' inconclusive');
    if (t.open) bits.push(t.open + ' not concluded');
    ev = F.plural(t.total, 'evidence experiment') + ': ' + bits.join(', ');
  }
  let note = '';
  if (!resolved && en.u === 0 && top > 0) {
    note = passed ? 'Its stage-gate has passed, so this problem no longer counts toward open risk.'
      : 'Everything under it is resolved, so it no longer counts toward open risk.';
  }
  const band = fmeaBand(top);
  const moreId = 'fmea.more:' + rid;
  const moreOpen = canEdit && C.isMenu(moreId);
  const knowns = (r.knowns || []).filter((k) => k && String(k.text || '').trim()).map((k) => ({ text: k.text }));
  const text = r.problem || 'Unnamed problem';
  const edit = () => FMEA.open(C, ctx, rid);
  return {
    k: 'prob-' + rid, aria: text,
    cls: 'fmea-prob' + (resolved ? ' is-res' : '') + (focus === rid ? ' is-focus' : ''),
    /* opened from the Overview's review table or the header search: its name takes focus (and scrolls into view) */
    focus: !!focus && focus === rid,
    text: text, canEdit: canEdit, edit: edit,
    hasGate: !!r.gateId, gateTag: tag, gateTitle: 'Linked to stage-gate ' + tag, gateLine: gateLine,
    meta: meta, hasEv: !!ev, ev: ev,
    hasNote: !!note, note: note,
    hasRpn: top > 0, rpn: String(top), bandCls: 'st ' + F.tone(band.tone), bandWord: band.word,
    rpnTitle: en.u > 0 ? 'Worst open RPN' : 'Worst RPN; not counted as open',
    st: fmeaStatusVM(C, 'fmea.st:' + rid, 'p', r.status, (v) => fmeaSetStatus(C, docKey, { rid: rid }, 'p', v), canEdit),
    moreOpen: moreOpen, moreCls: 'above fmea-stw' + (moreOpen ? ' fmea-hot' : ''),
    moreToggle: () => C.toggleMenu(moreId), moreKey: fmeaEscKey(C), moreAria: 'More actions for ' + fmeaTrunc(text, 60),
    menuEdit: () => { C.closeMenus(); edit(); },
    menuDel: () => fmeaAskDelete(C, docKey, rid),
    hasKnowns: knowns.length > 0, knowns: knowns,
    hasTable: (r.modes || []).length > 0, noModes: !(r.modes || []).length,
    rows: fmeaRows(C, ctx, r, canEdit)
  };
}

/* today's row layout: a mode cell on its first row, an effect cell on its first row, one row per cause */
function fmeaRows(C, ctx, r, canEdit) {
  const docKey = ctx.docKey, rid = r.rid;
  const flat = [];
  (r.modes || []).forEach((mode, mi) => {
    const mRes = mode.status === 'resolved';
    const effs = mode.effects || [];
    if (!effs.length) { flat.push({ mode: mode, mi: mi, e: null, ei: -1, c: null, ci: -1, showMode: true, showEff: true, newMode: true, mRes: mRes, eRes: false }); return; }
    let used = false;
    effs.forEach((e, ei) => {
      const eRes = e.status === 'resolved';
      const cs = e.causes || [];
      if (!cs.length) { flat.push({ mode: mode, mi: mi, e: e, ei: ei, c: null, ci: -1, showMode: !used, showEff: true, newMode: !used, mRes: mRes, eRes: eRes }); used = true; return; }
      cs.forEach((c, ci) => {
        const showMode = !used && ci === 0;
        flat.push({ mode: mode, mi: mi, e: e, ei: ei, c: c, ci: ci, showMode: showMode, showEff: ci === 0, newMode: showMode, mRes: mRes, eRes: eRes });
        if (ci === 0) used = true;
      });
    });
  });
  return flat.map((row, idx) => {
    const m = row.mode, e = row.e, c = row.c;
    const dim = row.mRes || row.eRes;
    const out = {
      cls: 'fmea-tr' + (row.newMode && idx > 0 ? ' fmea-msep' : '') + (dim ? ' fmea-dimrow' : ''),
      mCls: row.showMode ? 'fmea-mc' : 'fmea-mc fmea-cont',
      eCls: row.showEff ? 'fmea-ec' : 'fmea-ec fmea-cont',
      showMode: row.showMode, showEff: row.showEff,
      hasCause: !!c, noCause: !!e && !c, canDel: !!c && canEdit,
      mode: null, eff: null, cause: null
    };
    if (row.showMode) {
      const ch = fmeaChips(C, ctx, r, m, { mi: row.mi, ei: null, ci: null }, canEdit);
      out.mode = {
        text: m.mode || 'Unnamed failure mode', tCls: m.mode ? 'fmea-mt' : 'fmea-mt faint', xs: ch.xs, hasXs: ch.hasXs,
        st: fmeaStatusVM(C, 'fmea.st:' + rid + ':' + m.mid, 'm', m.status, (v) => fmeaSetStatus(C, docKey, { rid: rid, mid: m.mid }, 'm', v), canEdit)
      };
    }
    if (row.showEff) {
      if (e) {
        const ch = fmeaChips(C, ctx, r, e, { mi: row.mi, ei: row.ei, ci: null }, canEdit);
        out.eff = {
          text: e.effect || 'Unnamed effect', tCls: e.effect ? '' : 'faint', xs: ch.xs, hasXs: ch.hasXs, hasSt: true,
          st: fmeaStatusVM(C, 'fmea.st:' + rid + ':' + m.mid + ':' + e.eid, 'e', e.status, (v) => fmeaSetStatus(C, docKey, { rid: rid, mid: m.mid, eid: e.eid }, 'e', v), canEdit)
        };
      } else out.eff = { text: 'No effects yet', tCls: 'faint', xs: [], hasXs: false, hasSt: false, st: null };
    }
    if (c) {
      const ids = { rid: rid, mid: m.mid, eid: e.eid, cid: c.cid };
      const s = fmeaNum(c.severity), o = fmeaNum(c.occurrence), d = fmeaNum(c.detection);
      const rpn = RD.calcRpn(c.severity, c.occurrence, c.detection);
      const band = fmeaBand(rpn);
      const sodId = 'fmea.sod:' + rid + ':' + c.cid;
      const sodOpen = canEdit && C.isMenu(sodId);
      const ch = fmeaChips(C, ctx, r, c, { mi: row.mi, ei: row.ei, ci: row.ci }, canEdit);
      const sv = { severity: s, occurrence: o, detection: d };
      out.cause = {
        text: c.cause || 'Unnamed cause', tCls: (c.cause ? 'fmea-ctx' : 'fmea-ctx faint') + (c.status === 'resolved' ? ' fmea-cres' : ''),
        hasMit: !!c.mitigation, mit: c.mitigation || '', xs: ch.xs, hasXs: ch.hasXs,
        sod: {
          edit: canEdit, s: String(s), o: String(o), d: String(d), open: sodOpen,
          wrapCls: 'above fmea-stw' + (sodOpen ? ' fmea-hot' : ''),
          toggle: () => C.toggleMenu(sodId), done: () => C.closeMenus(), onKey: fmeaEscKey(C),
          aria: 'Rescore: severity ' + s + ', occurrence ' + o + ', detection ' + d,
          title: 'Severity ' + s + ' (' + RD.fmeaScaleLabel('severity', s) + '), occurrence ' + o + ' (' + RD.fmeaScaleLabel('occurrence', o) + '), detection ' + d + ' (' + RD.fmeaScaleLabel('detection', d) + ')',
          fields: FMEA_SOD.map((f) => ({ label: f[1], v: String(sv[f[0]]), opts: FMEA_OPTS[f[0]], on: (ev) => fmeaSetSod(C, docKey, ids, f[0], ev && ev.target ? ev.target.value : ev) }))
        },
        rpnHidden: dim, rpn: String(rpn), bandCls: 'st ' + F.tone(band.tone), bandWord: band.word,
        rpnTitle: dim ? (row.mRes ? 'Not counted: its failure mode is resolved' : 'Not counted: its effect is resolved') : 'RPN ' + rpn + ' = ' + s + ' × ' + o + ' × ' + d,
        st: fmeaStatusVM(C, 'fmea.st:' + rid + ':' + m.mid + ':' + e.eid + ':' + c.cid, 'c', c.status, (v) => fmeaSetStatus(C, docKey, ids, 'c', v), canEdit),
        del: () => fmeaAskRemoveCause(C, docKey, ids),
        delAria: 'Remove cause: ' + fmeaTrunc(c.cause || 'unnamed cause', 60)
      };
    }
    return out;
  });
}

/* ------------------------------------------------------- the problem editor */
function fmeaToggleCol(C, key) {
  const col = Object.assign({}, C.state.fmea_col || {});
  if (col[key]) delete col[key]; else col[key] = true;
  C.setState({ fmea_col: col });
}
/* collapse state is keyed on stable ids (today: fmCollapsed, page-scoped, survives reopening) */
function fmeaCollapseAll(C, on) {
  const d = C.draft() || {};
  const col = Object.assign({}, C.state.fmea_col || {});
  const put = (k) => { if (on) col[k] = true; else delete col[k]; };
  (d.modes || []).forEach((m) => {
    const mk = 'm:' + m.mid; put(mk);
    (m.effects || []).forEach((e) => {
      const ek = mk + '|e:' + e.eid; put(ek);
      (e.causes || []).forEach((c) => put(ek + '|c:' + c.cid));
    });
  });
  C.setState({ fmea_col: col });
}
function fmeaDraftRemove(C, arrPath, idx) {
  const cur = K.getPath(C.draft() || {}, arrPath) || [];
  C.setDraftPath(arrPath, cur.filter((_, i) => i !== idx));
}
function fmeaDraftAppend(C, arrPath, item, afId) {
  const cur = K.getPath(C.draft() || {}, arrPath) || [];
  C.setDraftPath(arrPath, cur.concat([item]));
  if (afId) C.setState({ fmea_af: afId });
}
function fmeaAddExp(C, path) {
  const cur = C.draft() || {};
  const node = fmeaNodeAt(cur, path);
  if (!node) return;
  const xs = Array.isArray(node.experiments) ? node.experiments : [];
  const x = { xid: 'fx_' + Math.random().toString(36).slice(2, 9), code: RD.fmeaNextExpCode(cur),
    hypothesis: '', toggle: '', test: '', samples: [], key_reads: [], values: {}, notes: '', verdict: '', conclusion: '' };
  C.setDraftPath(fmeaNodePath(path) + '.experiments', xs.concat([x]));
  C.pushSheet('fmea.exp', { path: Object.assign({}, path, { xi: xs.length }) }, { sample: '' });
}
/* the compact evidence rows under a node in the editor (today's fxRowsHtml) */
function fmeaEdXs(C, node, path, label) {
  if (!FMEA_EXEC) return { xs: [], hasXs: false, addX: null, addXAria: '' };
  const xs = RD.fmeaNodeExperiments(node).map((x, xi) => {
    const v = fmeaVerdict(x.verdict);
    const pr = RD.fmeaExpProgress(x);
    const code = x.code || 'EXP';
    return {
      code: code, cls: 'st ' + F.tone(v.tone), word: v.chip,
      sub: x.toggle || x.hypothesis || 'No details yet',
      prog: pr.filled + ' of ' + pr.total + ' values',
      open: () => C.pushSheet('fmea.exp', { path: Object.assign({}, path, { xi: xi }) }, { sample: '' }),
      openAria: 'Open ' + code,
      del: () => fmeaDraftRemove(C, fmeaNodePath(path) + '.experiments', xi),
      delAria: 'Remove ' + code
    };
  });
  return { xs: xs, hasXs: xs.length > 0, addX: () => fmeaAddExp(C, path), addXAria: 'Add experiment to ' + label };
}

function fmeaEditVM(C, ctx, sh) {
  const d = sh.d || {};
  const isNew = !(sh.data && sh.data.rid);
  const doc = ctx.doc;
  const objId = d.objectiveId || ctx.objId;
  const obj = (ctx.allObjs || []).find((o) => o.id === objId) || ctx.obj;
  const gates = FMEA.gatesOf(doc, objId);
  const gateV = d.gateId || '';
  const gateOpts = [{ v: '', label: 'No stage-gate' }].concat(gates.map((g) => ({ v: g.id, label: FMEA.gateLabel(doc, g.id) + ': ' + (g.name || g.id) })));
  if (gateV && !gates.some((g) => g.id === gateV)) gateOpts.push({ v: gateV, label: gateV + ' (this gate no longer exists)' });
  const gateHint = !gateV ? 'Optional. Once a linked stage-gate passes, the problem stops counting toward open risk.'
    : FMEA.gatePassed(doc, gateV, ctx.today) ? 'This gate has passed, so the problem does not count toward open risk.'
      : 'Counts toward open risk until this gate passes.';
  const col = C.state.fmea_col || {};
  const af = C.state.fmea_af || '';
  const modes = (d.modes || []).map((m, mi) => fmeaEdMode(C, m, mi, col, af));
  return {
    title: isNew ? 'Add problem' : 'Edit problem',
    sub: obj ? 'For ' + fmeaQ(obj.statement || obj.id) : '',
    problem: d.problem || '', onProblem: C.bindDraft('problem'),
    knowns: (d.knowns || []).map((k, ki) => ({
      text: (k && k.text) || '', aria: 'Known ' + (ki + 1), af: !!k && k.kid === af,
      on: C.bindDraftPath('knowns.' + ki + '.text'),
      del: () => fmeaDraftRemove(C, 'knowns', ki), delAria: 'Remove known ' + (ki + 1)
    })),
    noKnowns: !(d.knowns || []).length,
    addKnown: () => { const k = { kid: RD.fmeaId('k'), text: '' }; fmeaDraftAppend(C, 'knowns', k, k.kid); },
    gateV: gateV, gateOpts: gateOpts, gateHint: gateHint,
    onGate: (e) => C.setDraft({ gateId: (e && e.target ? e.target.value : e) || null }),
    modes: modes, noModes: !modes.length,
    addMode: () => { const m = { mid: RD.fmeaId('m'), mode: '', status: 'open', effects: [] }; fmeaDraftAppend(C, 'modes', m, m.mid); },
    collapseAll: () => fmeaCollapseAll(C, true),
    expandAll: () => fmeaCollapseAll(C, false),
    saveLabel: isNew ? 'Save problem' : 'Save changes',
    save: () => fmeaSave(C, ctx),
    cancel: () => C.closeSheet()
  };
}
function fmeaCaret(C, key, open, label) {
  return {
    open: open, closed: !open, toggle: () => fmeaToggleCol(C, key),
    caretAria: (open ? 'Collapse ' : 'Expand ') + label, caretTitle: open ? 'Collapse' : 'Expand'
  };
}
function fmeaEdMode(C, m, mi, col, af) {
  const key = 'm:' + m.mid;
  const base = 'modes.' + mi;
  const n = 'Failure mode ' + (mi + 1);
  const lc = 'failure mode ' + (mi + 1);
  const open = !FMEA_EXEC || !col[key];
  const effs = m.effects || [];
  let nc = 0;
  effs.forEach((e) => { nc += (e.causes || []).length; });
  const nx = RD.fmeaAllExperiments({ modes: [m] }).length;
  const sum = [F.plural(effs.length, 'effect'), F.plural(nc, 'cause')];
  if (nx) sum.push(nx + ' evidence');
  const ev = fmeaEdXs(C, m, { mi: mi, ei: null, ci: null }, lc);
  return Object.assign(fmeaCaret(C, key, open, lc), {
    k: 'mode-' + (mi + 1), n: n, af: m.mid === af,
    ctext: fmeaTrunc(m.mode, 44) || 'Unnamed failure mode', summary: sum.join(', '),
    text: m.mode || '', onText: C.bindDraftPath(base + '.mode'),
    del: () => fmeaDraftRemove(C, 'modes', mi), delAria: 'Remove ' + lc,
    xs: ev.xs, hasXs: ev.hasXs, addX: ev.addX, addXAria: ev.addXAria,
    effects: effs.map((e, ei) => fmeaEdEffect(C, m, mi, e, ei, col, af)), noEffects: !effs.length,
    addEffect: () => { const e = { eid: RD.fmeaId('e'), effect: '', status: 'open', causes: [] }; fmeaDraftAppend(C, base + '.effects', e, e.eid); },
    addEffectAria: 'Add effect to ' + lc
  });
}
function fmeaEdEffect(C, m, mi, e, ei, col, af) {
  const key = 'm:' + m.mid + '|e:' + e.eid;
  const base = 'modes.' + mi + '.effects.' + ei;
  const n = 'Effect ' + (ei + 1);
  const lc = 'effect ' + (ei + 1) + ' of failure mode ' + (mi + 1);
  const open = !FMEA_EXEC || !col[key];
  const cs = e.causes || [];
  const nx = RD.fmeaNodeExperiments(e).length;
  const sum = [F.plural(cs.length, 'cause')];
  if (nx) sum.push(nx + ' evidence');
  const ev = fmeaEdXs(C, e, { mi: mi, ei: ei, ci: null }, lc);
  return Object.assign(fmeaCaret(C, key, open, lc), {
    k: 'mode-' + (mi + 1) + '-effect-' + (ei + 1), n: n, aria: 'Effect ' + (ei + 1) + ', failure mode ' + (mi + 1), af: e.eid === af,
    ctext: fmeaTrunc(e.effect, 44) || 'Unnamed effect', summary: sum.join(', '),
    text: e.effect || '', onText: C.bindDraftPath(base + '.effect'),
    del: () => fmeaDraftRemove(C, 'modes.' + mi + '.effects', ei), delAria: 'Remove ' + lc,
    xs: ev.xs, hasXs: ev.hasXs, addX: ev.addX, addXAria: ev.addXAria,
    causes: cs.map((c, ci) => fmeaEdCause(C, m, mi, e, ei, c, ci, col, af)), noCauses: !cs.length,
    addCause: () => { const c = RD.blankCause(); fmeaDraftAppend(C, base + '.causes', c, c.cid); },
    addCauseAria: 'Add cause to ' + lc
  });
}
function fmeaEdCause(C, m, mi, e, ei, c, ci, col, af) {
  const key = 'm:' + m.mid + '|e:' + e.eid + '|c:' + c.cid;
  const base = 'modes.' + mi + '.effects.' + ei + '.causes.' + ci;
  const n = 'Cause ' + (ci + 1);
  const lc = 'cause ' + (ci + 1) + ' of effect ' + (ei + 1) + ', failure mode ' + (mi + 1);
  const open = !FMEA_EXEC || !col[key];
  const rpn = RD.calcRpn(c.severity, c.occurrence, c.detection);
  const band = fmeaBand(rpn);
  const ev = fmeaEdXs(C, c, { mi: mi, ei: ei, ci: ci }, lc);
  return Object.assign(fmeaCaret(C, key, open, lc), {
    k: 'mode-' + (mi + 1) + '-effect-' + (ei + 1) + '-cause-' + (ci + 1), n: n, aria: 'Cause ' + (ci + 1) + ', effect ' + (ei + 1) + ', failure mode ' + (mi + 1), af: c.cid === af,
    ctext: fmeaTrunc(c.cause, 44) || 'Unnamed cause', summary: 'RPN ' + rpn,
    text: c.cause || '', onText: C.bindDraftPath(base + '.cause'),
    del: () => fmeaDraftRemove(C, 'modes.' + mi + '.effects.' + ei + '.causes', ci), delAria: 'Remove ' + lc,
    sod: FMEA_SOD.map((f) => ({
      label: f[1], v: String(fmeaNum(c[f[0]])), opts: FMEA_OPTS[f[0]],
      on: (ev2) => C.setDraftPath(base + '.' + f[0], fmeaNum(ev2 && ev2.target ? ev2.target.value : ev2))
    })),
    rpn: String(rpn), bandCls: 'st ' + F.tone(band.tone), bandWord: band.word,
    mit: c.mitigation || '', onMit: C.bindDraftPath(base + '.mitigation'),
    xs: ev.xs, hasXs: ev.hasXs, addX: ev.addX, addXAria: ev.addXAria
  });
}
/* today's saveFmea: the statement is required; the whole draft replaces the stored problem */
function fmeaSave(C, ctx) {
  const sh = C.sheet();
  if (!sh || sh.kind !== 'fmea.edit') return;
  const d = sh.d || {};
  const text = String(d.problem || '').trim();
  if (!text) { C.sheetErr('Give the problem a statement before saving.'); return; }
  const docKey = ctx.docKey, objId = ctx.objId, rid = sh.data && sh.data.rid;
  const ok = C.mutate((D) => {
    const doc = D.docs[docKey];
    if (!doc) return false;
    if (!Array.isArray(doc.risks)) doc.risks = [];
    const p = K.clone(d);
    p.problem = text;
    p.gateId = d.gateId || null;
    p.objectiveId = objId;
    const i = rid ? doc.risks.findIndex((x) => x.rid === rid) : -1;
    if (i >= 0) doc.risks[i] = p; else doc.risks.push(p);
  }, { msg: 'Problem saved.' });
  if (ok) C.closeSheet();
}

/* --------------------------------------------------- the evidence experiment */
function fmeaExpVM(C, ctx, sh) {
  const pi = fmeaParentIdx(C);
  const parent = pi >= 0 ? C.state.sheets[pi] : null;
  const path = (sh.data && sh.data.path) || { mi: -1 };
  const node = parent ? fmeaNodeAt(parent.d || {}, path) : null;
  const x = node && Array.isArray(node.experiments) ? node.experiments[path.xi] : null;
  const back = () => C.closeSheet();
  if (!x) return { ok: false, missing: true, title: 'Experiment', sub: '', back: back };
  const base = fmeaNodePath(path) + '.experiments.' + path.xi;
  const now = () => {
    const i = fmeaParentIdx(C);
    const n2 = i >= 0 ? fmeaNodeAt(C.state.sheets[i].d || {}, path) : null;
    return (n2 && Array.isArray(n2.experiments) && n2.experiments[path.xi]) || null;
  };
  const upd = (patch) => { const cur = now(); if (cur) fmeaSetPD(C, base, Object.assign({}, cur, patch)); };
  const field = (f) => (e) => upd({ [f]: e && e.target ? e.target.value : e });
  const lvl = path.ci != null ? 'Cause ' + (path.ci + 1) : path.ei != null ? 'Effect ' + (path.ei + 1) : 'Failure mode ' + (path.mi + 1);
  const txt = node.cause || node.effect || node.mode || '';
  const samples = Array.isArray(x.samples) ? x.samples : [];
  const krs = Array.isArray(x.key_reads) ? x.key_reads : [];
  const vals = x.values || {};
  const pr = RD.fmeaExpProgress(x);
  const v = fmeaVerdict(x.verdict);
  const addSample = () => {
    const cur = now();
    if (!cur) return;
    const name = String((C.draft() || {}).sample || '').trim();
    if (!name) return;
    const ss = Array.isArray(cur.samples) ? cur.samples : [];
    C.setDraft({ sample: '' });
    if (ss.indexOf(name) >= 0) { C.sheetErr(fmeaQ(name) + ' is already a sample.'); return; }
    upd({ samples: ss.concat([name]) });
  };
  return {
    ok: true, missing: false,
    title: 'Experiment ' + (x.code || 'EXP'),
    sub: lvl + (txt ? ': ' + fmeaTrunc(txt, 42) : ''),
    vCls: 'st ' + F.tone(v.tone), vWord: v.label,
    back: back,
    hypothesis: x.hypothesis || '', onHypothesis: field('hypothesis'),
    toggle: x.toggle || '', onToggle: field('toggle'),
    test: x.test || '', onTest: field('test'),
    notes: x.notes || '', onNotes: field('notes'),
    conclusion: x.conclusion || '', onConclusion: field('conclusion'),
    verdict: x.verdict || '', verdictOpts: FMEA_VERDICT_OPTS, onVerdict: field('verdict'),
    sample: (sh.d && sh.d.sample) || '', onSample: C.bindDraft('sample'),
    onSampleKey: (e) => { if (e && e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); addSample(); } },
    addSample: addSample,
    samples: samples.map((s, si) => ({
      name: s, delAria: 'Remove sample ' + s,
      del: () => {
        const cur = now(); if (!cur) return;
        const ss = (cur.samples || []).filter((_, i) => i !== si);
        const vv = Object.assign({}, cur.values || {});
        delete vv[s];
        upd({ samples: ss, values: vv });
      }
    })),
    noSamples: !samples.length,
    addKr: () => { const cur = now(); if (!cur) return; upd({ key_reads: (cur.key_reads || []).concat([{ krid: 'k_' + Math.random().toString(36).slice(2, 8), name: '', unit: '' }]) }); },
    cols: krs.map((k, i) => ({
      name: k.name || '', unit: k.unit || '',
      nameAria: 'Key read ' + (i + 1) + ' name', unitAria: 'Key read ' + (i + 1) + ' unit', delAria: 'Remove key read ' + (i + 1),
      onName: (e) => { const cur = now(); if (!cur) return; upd({ key_reads: (cur.key_reads || []).map((y, j) => (j === i ? Object.assign({}, y, { name: e.target.value }) : y)) }); },
      onUnit: (e) => { const cur = now(); if (!cur) return; upd({ key_reads: (cur.key_reads || []).map((y, j) => (j === i ? Object.assign({}, y, { unit: e.target.value }) : y)) }); },
      del: () => {
        const cur = now(); if (!cur) return;
        const gone = (cur.key_reads || [])[i];
        const vv = {};
        Object.keys(cur.values || {}).forEach((s) => { const row = Object.assign({}, cur.values[s]); if (gone) delete row[gone.krid]; vv[s] = row; });
        upd({ key_reads: (cur.key_reads || []).filter((_, j) => j !== i), values: vv });
      }
    })),
    hasGrid: samples.length > 0 && krs.length > 0,
    gridHint: !krs.length && !samples.length ? 'Add samples and key reads to record values.'
      : !krs.length ? 'Add a key read to record values for each sample.' : !samples.length ? 'Add a sample above to record values.' : '',
    rows: samples.map((s) => ({
      name: s,
      cells: krs.map((k, j) => {
        const raw = (vals[s] || {})[k.krid];
        const str = raw == null ? '' : String(raw);
        const bad = str !== '' && !isFinite(Number(str));
        return {
          v: str, cls: 'in sm fmea-val' + (bad ? ' bad' : ''),
          title: bad ? 'Use a number, like 4.2. This value is not counted.' : '',
          aria: s + ', ' + (k.name || 'key read ' + (j + 1)),
          on: (e) => {
            const cur = now(); if (!cur) return;
            const vv = Object.assign({}, cur.values || {});
            vv[s] = Object.assign({}, vv[s] || {}, { [k.krid]: e.target.value });
            upd({ values: vv });
          }
        };
      })
    })),
    prog: pr.total ? pr.filled + ' of ' + pr.total + ' values recorded' : !krs.length ? 'No key reads yet' : 'No samples yet',
    save: () => fmeaSaveExp(C, ctx)
  };
}
/* today's saveFmeaExp: commit the WHOLE problem draft now, creating the problem if it is new;
   later "Save changes" then updates that problem instead of adding a second one */
function fmeaSaveExp(C, ctx) {
  const pi = fmeaParentIdx(C);
  if (pi < 0) { C.closeSheet(); return; }
  const ps = C.state.sheets[pi];
  const d = ps.d || {};
  const rid = ps.data && ps.data.rid;
  const docKey = ctx.docKey, objId = ctx.objId;
  let saved = rid || '';
  const ok = C.mutate((D) => {
    const doc = D.docs[docKey];
    if (!doc) return false;
    if (!Array.isArray(doc.risks)) doc.risks = [];
    const p = K.clone(d);
    const i = rid ? doc.risks.findIndex((x) => x.rid === rid) : -1;
    p.problem = String(d.problem || '').trim() || (i >= 0 ? doc.risks[i].problem || '' : '');
    p.gateId = d.gateId || null;
    if (i >= 0) doc.risks[i] = p;
    else { p.objectiveId = objId; doc.risks.push(p); }
    saved = p.rid;
  }, { msg: 'Experiment saved.' });
  if (!ok) return;
  const s = (C.state.sheets || []).slice();
  const j = fmeaParentIdx(C);
  if (j >= 0) s[j] = Object.assign({}, s[j], { data: Object.assign({}, s[j].data, { rid: saved }) });
  C.setState({ sheets: s.slice(0, -1), menu: '' });
}

/* ------------------------------------------------------------------ search */
function fmeaGo(C, ctx, p) {
  const patch = { objId: p.objectiveId, tab: 'risks', menu: '', sheets: [], fmea_focus: p.rid };
  if (!(ctx.objs || []).some((o) => o.id === p.objectiveId)) Object.assign(patch, { fQuarter: '', fProduct: '', fOwner: '' });
  C.setState(patch);
}

MODS.fmea = {
  state: { fmea_col: {}, fmea_focus: '', fmea_af: '' },
  wide: ['fmea.edit', 'fmea.exp'],
  vm(C, ctx) {
    const top = C.sheet();
    return {
      reg: fmeaRegister(C, ctx),
      ed: top && top.kind === 'fmea.edit' ? fmeaEditVM(C, ctx, top) : null,
      ex: top && top.kind === 'fmea.exp' ? fmeaExpVM(C, ctx, top) : null
    };
  },
  /* header search: problems and failure modes in this division, by text */
  search(C, ctx, q) {
    const t = String(q || '').trim().toLowerCase();
    if (!t) return [];
    const objs = {};
    (ctx.allObjs || []).forEach((o) => { objs[o.id] = o; });
    const out = [];
    ((ctx.doc && ctx.doc.risks) || []).forEach((p) => {
      const o = objs[p.objectiveId];
      if (!o) return;
      const go = () => fmeaGo(C, ctx, p);
      const pt = p.problem || '';
      if (pt.toLowerCase().indexOf(t) >= 0) out.push({ label: pt, sub: 'Risk in ' + (o.statement || o.id), go: go });
      (p.modes || []).forEach((m) => {
        if (String(m.mode || '').toLowerCase().indexOf(t) >= 0) out.push({ label: m.mode, sub: 'Failure mode of ' + fmeaQ(fmeaTrunc(pt || 'Unnamed problem', 60)), go: go });
      });
    });
    return out.slice(0, 8);
  }
};
