/* ============================================================================
   P-gantt: the Planning Milestones tab and the milestone report (mods/pms).
   Ported from planning_app.template.html renderMilestones (L2366-2463) and the
   milestone report modal (L2464-2608). Shares PGT (mods/pgt) for the schedule
   cascade, pause state and the editor hand-offs.

   Public namespace PMS:
     PMS.openReport(C, ctx, msId)   open the report sheet ('pms.report', wide); stacks over an open
                                    sheet (the milestone editor's Report button)
     PMS.number(P, ms)              '<ABBR>-NN', ranked by planned date within the product
     PMS.productOf(P, ms)           the milestone's product (through its initiative, a model resolves
                                    to its product)
   UI state: pm_col (group collapse map).
   ========================================================================== */
const PMS = {
  /* today's prodAbbrev: the product code, else a short form of its name, else "MS" */
  abbrev(P, prodId) {
    const p = (P.products || []).find((x) => x.id === prodId);
    if (!p) return 'MS';
    if (p.code) return p.code;
    const nm = String(p.name || '').trim();
    if (!nm) return 'MS';
    if (!/\s/.test(nm) && nm.length <= 10) return nm;
    const words = nm.split(/\s+/).filter(Boolean);
    const trailingNum = nm.match(/(\d+)\s*$/);
    let base = words[0];
    if (base.length <= 3 && words.length > 1) base = words[0] + words[1].charAt(0).toUpperCase() + words[1].slice(1);
    if (base.length > 6) base = base.slice(0, 6);
    if (trailingNum && base.indexOf(trailingNum[1]) < 0) base += trailingNum[1];
    return base;
  },
  initOf(P, ms) { return ms ? (P.initiatives || []).find((i) => i.id === ms.initiativeId) || null : null; },
  productOf(P, ms) {
    const i = PMS.initOf(P, ms);
    if (!i) return null;
    try { return RD.effProduct(i, P) || null; } catch (e) { return i.productId || null; }
  },
  /* Ranked by planned date among the milestones of the same product. Today the siblings are found
     through the initiative's own productId, so milestones under a model-pinned initiative all read
     "-01" (inventory §19.14); here every milestone resolves its product the same way. */
  number(P, ms) {
    const prodId = PMS.productOf(P, ms);
    const sibs = (P.milestones || []).filter((m) => PMS.initOf(P, m) && (PMS.productOf(P, m) || null) === (prodId || null))
      .sort((a, b) => ((a.plannedDate == null ? 1e15 : a.plannedDate) - (b.plannedDate == null ? 1e15 : b.plannedDate)) || String(a.id).localeCompare(String(b.id)));
    const idx = sibs.findIndex((m) => m.id === ms.id);
    return PMS.abbrev(P, prodId) + '-' + String((idx >= 0 ? idx : 0) + 1).padStart(2, '0');
  },
  quarter(ms) { return ms && PGT.fin(ms.plannedDate) ? F.qOfDay(ms.plannedDate) : ''; },
  /* the shared filters: unit and division of its initiative, its product, the quarter of its
     planned date, its band (today's tab ignores the Unit filter: inventory §19.6) */
  matches(ctx, ms) {
    if (typeof ctx.msMatch === 'function') return ctx.msMatch(ms);
    const P = ctx.P, f = ctx.f || {};
    const ini = PMS.initOf(P, ms), div = ini ? ini.divisionId : null;
    if (f.unit && (RD.unitIdOfDivision(div, P) || '') !== f.unit) return false;
    if (f.div && div !== f.div) return false;
    if (f.prod && PMS.productOf(P, ms) !== f.prod) return false;
    if (f.q && PMS.quarter(ms) !== f.q) return false;
    if (f.status && PGT.band({ memo: (k, fn) => fn() }, ctx, 'milestone', ms.id) !== f.status) return false;
    return true;
  },
  pool(ctx) {
    if (ctx.pool) return ctx.pool;
    const out = [];
    Object.keys(ctx.em || {}).forEach((k) => { ((ctx.em[k] && ctx.em[k].kpis) || []).forEach((x) => out.push(x)); });
    return out;
  },
  kpisOf(P, msId) { return (P.kpis || []).filter((k) => k.hostType === 'milestone' && k.hostId === msId); },
  /* the objectives whose key-result KPIs feed this milestone's targets (through value sources) */
  linkedObjectives(ctx, msId) {
    const P = ctx.P, srcIds = [];
    PMS.kpisOf(P, msId).forEach((k) => (k.sources || []).forEach((id) => { if (srcIds.indexOf(id) < 0) srcIds.push(id); }));
    if (!srcIds.length) return [];
    const objIds = [];
    const docs = ctx.execDocs || {};
    Object.keys(docs).forEach((key) => {
      const doc = docs[key] || {};
      (doc.kpis || []).forEach((k) => {
        if (srcIds.indexOf(k.id) < 0 || k.hostType !== 'keyResult') return;
        const kr = (doc.keyResults || []).find((r) => r.id === k.hostId);
        if (kr && kr.objectiveId && objIds.indexOf(kr.objectiveId) < 0) objIds.push(kr.objectiveId);
      });
    });
    return objIds.map((id) => (P.objectives || []).find((o) => o.id === id)).filter(Boolean);
  },
  result(score) { if (score == null) return 'N/A'; if (score >= 100) return 'Met'; if (score >= 70) return 'Partial'; return 'Missed'; },
  resultTone(r) { return r === 'Met' ? 't-ok' : r === 'Partial' ? 't-warn' : r === 'Missed' ? 't-bad' : 't-none'; },
  /* one row of "Performance vs. targets": target, measured (live), result, source */
  metric(ctx, k) {
    const pool = PMS.pool(ctx), em = ctx.em;
    const s = RD.kpiScoreResolved(k, pool, em), val = RD.effValue(k, pool, em), tgt = RD.effTarget(k, pool);
    const unit = RD.kpiUnit(k, pool) || k.unit || '';
    const dir = k.direction;
    const sym = (dir === 'down' || dir === 'decrease') ? '≤' : dir === 'maintain' ? '~' : '≥';
    let target = '—';
    if (k.targetType === 'binary') target = 'Pass';
    else if (tgt != null && typeof tgt === 'object') target = F.n(tgt.lo) + ' to ' + F.u(tgt.hi, unit);
    else if (tgt != null) target = sym + ' ' + F.u(tgt, unit);
    let src = '';
    const e = RD.effValueSource(k, pool, em);
    if (e) {
      if (e.src === k.id) src = 'manual entry';
      else {
        const sk = pool.find((x) => x.id === e.src), n = (k.sources || []).length;
        src = (sk ? (sk.name || sk.id) : e.src) + (n > 1 ? ' (best of ' + n + ')' : '');
      }
    }
    const res = PMS.result(s);
    return { id: k.id, name: RD.kpiName(k, pool) || k.name || k.id, target: target, live: val == null ? '' : F.u(val, unit), result: res, tone: PMS.resultTone(res), src: src };
  },
  blank() {
    return { kpiOverrides: {}, findings: ['', '', '', ''], project: '', author: '', version: '', demonstrated: '',
      context: { budget: '', buildNo: '', linkedOkr: '' },
      actions: [{ item: '', owner: '', due: '' }, { item: '', owner: '', due: '' }, { item: '', owner: '', due: '' }], locked: false };
  },
  /* the draft a report opens with: additive, so a report saved before a field existed comes back
     with that field blank */
  draftOf(ms) {
    const rep = (ms && ms.milestoneReport) || {}, bl = PMS.blank();
    const d = {
      kpiOverrides: K.clone(rep.kpiOverrides || {}),
      findings: (rep.findings && rep.findings.length ? rep.findings.slice() : bl.findings).map((x) => (x == null ? '' : String(x))),
      project: rep.project || '', author: rep.author || '', version: rep.version || '', demonstrated: rep.demonstrated || '',
      context: Object.assign({}, bl.context, rep.context || {}),
      actions: (rep.actions && rep.actions.length ? K.clone(rep.actions) : bl.actions).slice(0, 3).map((a) => ({ item: (a && a.item) || '', owner: (a && a.owner) || '', due: (a && a.due) || '' })),
      locked: !!rep.locked
    };
    while (d.findings.length < 4) d.findings.push('');
    while (d.actions.length < 3) d.actions.push({ item: '', owner: '', due: '' });
    return d;
  },
  openReport(C, ctx, msId) {
    const ms = (ctx.P.milestones || []).find((m) => m.id === msId);
    if (!ms) { C.toast('That milestone no longer exists.', 'err'); return; }
    const d = PMS.draftOf(ms);
    const data = { msId: msId, d0: JSON.stringify(d) };
    if (C.sheet()) C.pushSheet('pms.report', data, d); else C.openSheet('pms.report', data, d);
  },
  /* Saving records what the report says now: a Measured cell left untouched is written as the live
     value it showed, as today (a saved report is a record, not a live view). */
  record(C, ctx, ms, d, locked) {
    const t = (v) => String(v == null ? '' : v).trim();
    const ov = {};
    Object.keys(d.kpiOverrides || {}).forEach((id) => { ov[id] = { measured: t((d.kpiOverrides[id] || {}).measured) }; });
    PMS.kpisOf(ctx.P, ms.id).forEach((k) => {
      const typed = t((d.kpiOverrides[k.id] || {}).measured);
      ov[k.id] = { measured: typed || PMS.metric(ctx, k).live };
    });
    return {
      kpiOverrides: ov,
      findings: (d.findings || []).map(t),
      project: t(d.project), author: t(d.author), version: t(d.version), demonstrated: t(d.demonstrated),
      context: Object.assign({}, d.context || {}),
      actions: (d.actions || []).map((a) => ({ item: t(a.item), owner: t(a.owner), due: t(a.due) })),
      locked: !!locked, savedAt: C.now()
    };
  },
  save(C, ctx, msId, close) {
    const ms = (ctx.P.milestones || []).find((m) => m.id === msId);
    if (!ms) return;
    const d = C.draft();
    const rec = PMS.record(C, ctx, ms, d, !!d.locked);
    const ok = C.mutate((D) => {
      const m = (D.portfolio.milestones || []).find((x) => x.id === msId);
      if (!m) return false;
      m.milestoneReport = rec;
    }, { msg: 'Report saved.' });
    if (ok && close) C.closeSheet();
  },
  /* Lock and Unlock save at once, with whatever is in the form */
  toggleLock(C, ctx, msId) {
    const ms = (ctx.P.milestones || []).find((m) => m.id === msId);
    if (!ms) return;
    const d = C.draft();
    const locked = !d.locked;
    const rec = PMS.record(C, ctx, ms, d, locked);
    const ok = C.mutate((D) => {
      const m = (D.portfolio.milestones || []).find((x) => x.id === msId);
      if (!m) return false;
      m.milestoneReport = rec;
    }, { msg: locked ? 'Report locked.' : 'Report unlocked.' });
    if (ok) {
      const nd = PMS.draftOf(Object.assign({}, ms, { milestoneReport: rec }));
      C.setDraft(nd);
      C.setSheetData({ d0: JSON.stringify(nd) });
    }
  },
  close(C) {
    const s = C.sheet();
    if (s && s.data && typeof s.data.d0 === 'string' && JSON.stringify(s.d || {}) !== s.data.d0) {
      C.confirm({ title: 'Discard your changes?', body: 'Your edits to this report are not saved yet.', ok: 'Discard changes', danger: true, onOk: () => C.closeSheet() });
      return;
    }
    C.closeSheet();
  },
  print(C) {
    try { window.print(); } catch (e) { C.toast('Printing isn’t available here. Use your browser’s Print command.', 'info'); }
  }
};

/* ---------------------------------------------------------- the table rows */
function pmsRows(C, ctx) {
  const P = ctx.P, em = ctx.em, S = C.state, ro = !!ctx.ro;
  const casc = PGT.cascade(C, ctx);
  const all = P.milestones || [];
  const list = all.filter((m) => PMS.matches(ctx, m));
  /* Hierarchy groups by division; Custom follows the shared dimension chain. Today the tab always
     follows the custom chain, even in Hierarchy mode (inventory §19.6). */
  const grp = ctx.group || { mode: 'hierarchy', dims: ['division'] };
  const custom = grp.mode !== 'hierarchy';
  const dims = custom ? (grp.dims || []) : ['division'];
  const tree = RD.groupMilestones(list, dims, P);
  const col = S.pm_col || {};
  const out = [];
  const msSort = (l) => l.slice().sort((a, b) => ((a.plannedDate == null ? 1e15 : a.plannedDate) - (b.plannedDate == null ? 1e15 : b.plannedDate)) || String(a.id).localeCompare(String(b.id)));
  const collect = (n) => (n.children ? n.children.reduce((acc, c) => acc.concat(collect(c)), []) : (n.objs || []));
  const label = (dim, key) => {
    if (dim === 'unit') { const u = (P.units || []).find((x) => x.id === key); return u ? u.name : key; }
    if (dim === 'quarter') return F.q(key);
    if (dim === 'owner') return F.name(key);
    const arr = { division: P.divisions, product: P.products, model: P.models, initiative: P.initiatives }[dim] || [];
    const r = arr.find((x) => x.id === key);
    return r ? (r.name || r.statement || r.id) : key;
  };
  const pathKey = (path) => path.map((p) => p[0] + ':' + p[1]).join('/');
  const date = (d) => PGT.date(d, ctx);
  function msRow(ms) {
    const ini = PMS.initOf(P, ms), prodId = PMS.productOf(P, ms);
    const prod = prodId ? (P.products || []).find((p) => p.id === prodId) : null;
    const eff = casc.milestoneEffective ? casc.milestoneEffective[ms.id] : null;
    const done = RD.milestoneAchieved(ms, em);
    const s = RD.milestoneScore(ms.id, em);
    const band = PGT.band(C, ctx, 'milestone', ms.id);
    const nk = PMS.kpisOf(P, ms.id).length;
    const fin = PGT.fin;
    const completed = fin(ms.completedDate);
    const effDay = completed ? ms.completedDate : (fin(eff) ? eff : (fin(ms.plannedDate) ? ms.plannedDate : null));
    const slip = (!done && fin(eff) && fin(ms.plannedDate)) ? eff - ms.plannedDate : null;
    const st = RD.milestoneState(P.milestoneState, ms.id);
    const pausedMs = !done && !!(st && (st.status === 'paused' || st.status === 'deprioritized'));
    let status, stCls, stTitle = '';
    if (done) { status = 'Achieved'; stCls = 'st t-ok'; stTitle = completed ? 'Marked complete ' + F.dayY(ms.completedDate) : 'Every target met'; }
    else if (pausedMs) {
      status = st.status === 'paused' ? 'Paused' : 'Deprioritized';
      stCls = 'st pms-paused';
      stTitle = status + (fin(st.day) ? ' on ' + F.dayY(st.day) : '') + '.' + (st.note ? ' ' + st.note + (/[.!?]$/.test(st.note) ? '' : '.') : '') + ' Kept, and excluded from dates and scores.';
    } else { const tone = PGT.TONE[band] || 'none'; status = F.bandWord(tone); stCls = 'st ' + F.tone(tone); }
    const rep = ms.milestoneReport;
    const locked = !!(rep && rep.locked);
    const repLabel = (rep ? 'Open report' : 'Create report') + (locked ? ' (locked)' : '');
    const menuId = 'pms.m:' + ms.id;
    const stop = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
    const items = [];
    if (!ro) {
      items.push({ label: 'Edit milestone', cls: 'mi', fn: (e) => { stop(e); PGT.ped.edit(C, ctx, 'milestone', ms.id); } });
      if (!done) items.push({ label: 'Mark achieved', cls: 'mi', fn: (e) => { stop(e); C.closeMenus(); PGT.setAchieved(C, ctx, ms.id, true); } });
      else if (completed) items.push({ label: 'Reopen milestone', cls: 'mi', fn: (e) => { stop(e); C.closeMenus(); PGT.setAchieved(C, ctx, ms.id, false); } });
      if (PGT.paused(P, ms)) items.push({ label: 'Resume milestone', cls: 'mi', fn: (e) => { stop(e); C.closeMenus(); PGT.msStatus(C, ctx, ms.id, 'active', ''); } });
      else {
        items.push({ label: 'Pause milestone', cls: 'mi', fn: (e) => { stop(e); PGT.askStatus(C, ctx, ms, 'paused'); } });
        items.push({ label: 'Deprioritize milestone', cls: 'mi', fn: (e) => { stop(e); PGT.askStatus(C, ctx, ms, 'deprioritized'); } });
      }
      items.push({ label: 'Delete milestone', cls: 'mi bad', fn: (e) => { stop(e); C.closeMenus(); PGT.ped.del(C, ctx, 'milestone', ms.id); } });
    }
    return {
      isGroup: false, isMs: true, id: ms.id,
      cls: 'pms-row hov' + (pausedMs ? ' paused' : ''),
      num: PMS.number(P, ms),
      name: ms.name || ms.id,
      dotCls: 'pms-dia t-' + (PGT.TONE[band] || 'none'),
      nameTitle: ro ? 'Show lineage' : 'Edit milestone',
      edit: (e) => { stop(e); if (ro) PGT.ped.lineage(C, ctx, 'milestone', ms.id); else PGT.ped.edit(C, ctx, 'milestone', ms.id); },
      rowClick: ro ? null : () => PGT.ped.edit(C, ctx, 'milestone', ms.id),
      init: ini ? (ini.name || ini.id) : '—',
      prod: prod ? (prod.name || prod.id) : '—',
      planned: fin(ms.plannedDate) ? date(ms.plannedDate) : '—',
      eff: effDay == null ? '—' : date(effDay),
      effDone: completed, effLabel: completed ? 'Completed ' + F.dayY(ms.completedDate) : '',
      hasSlip: slip != null && slip > 0, slip: slip != null && slip > 0 ? '+' + F.plural(slip, 'day') : '',
      slipTitle: slip != null && slip > 0 ? F.plural(slip, 'day') + ' later than planned' : '',
      status: status, stCls: stCls, stTitle: stTitle, stDotCls: pausedMs ? 'dot pms-hollow' : 'dot',
      score: F.score(s), kpis: nk ? String(nk) : '—',
      repLabel: repLabel, locked: locked,
      repBtn: !!rep || !ro,
      openReport: (e) => { stop(e); PMS.openReport(C, ctx, ms.id); },
      hasMenu: items.length > 0, menuOpen: C.isMenu(menuId), menuExp: C.isMenu(menuId) ? 'true' : 'false',
      /* only the open menu's wrapper sits above the scrim, so the next rows cannot paint over it */
      wrapCls: C.isMenu(menuId) ? 'above' : 'anchor',
      toggleMenu: (e) => { stop(e); C.toggleMenu(menuId); },
      items: items,
      /* unused on a milestone row */
      label: '', count: '', pad: '', open: 'true', toggle: null, chevCls: ''
    };
  }
  function walk(nodes, depth, path) {
    nodes.forEach((n) => {
      const under = collect(n);
      if (!under.length) return;
      const bare = n.key === '' || n.key === '__all__';
      const np = bare ? path : path.concat([[n.dim, n.key]]);
      const gk = bare ? '' : pathKey(np);
      const shut = !bare && !!col[gk];
      if (!bare) {
        const lab = label(n.dim, n.key);
        out.push({
          isGroup: true, isMs: false, id: 'grp:' + gk,
          label: lab, count: F.plural(under.length, 'milestone'),
          pad: 'padding-left: ' + (12 + depth * 18) + 'px',
          open: shut ? 'false' : 'true', chevCls: 'pms-chev' + (shut ? ' shut' : ''),
          toggleLabel: (shut ? 'Expand ' : 'Collapse ') + lab,
          toggle: () => { const m = Object.assign({}, C.state.pm_col || {}); m[gk] = !m[gk]; C.setState({ pm_col: m, menu: '' }); }
        });
      }
      if (shut) return;
      if (n.children) { walk(n.children, bare ? depth : depth + 1, np); return; }
      msSort(n.objs || []).forEach((ms) => out.push(msRow(ms)));
    });
  }
  walk(tree, 0, []);
  const word = custom ? (dims.length ? 'Grouped by ' + dims.map((d) => PGT.LEVEL_WORD[d] ? PGT.LEVEL_WORD[d].replace(/s$/, '').toLowerCase() : d).join(', then ') : 'Not grouped') : 'Grouped by division';
  return {
    rows: out, n: list.length, total: all.length,
    groupNote: word
  };
}

/* ------------------------------------------------------- the report sheet */
function pmsSheet(C, ctx) {
  const sh = C.sheetOf('pms');
  if (!sh || sh.kind !== 'pms.report') return null;
  const P = ctx.P, em = ctx.em, ro = !!ctx.ro;
  const msId = sh.data.msId;
  const ms = (P.milestones || []).find((m) => m.id === msId);
  if (!ms) {
    return {
      missing: true, ok: false, title: 'Milestone report', sub: '', canLock: false, lockAria: '', lockLabel: '', toggleLock: null,
      roNote: false, lockedNote: false, editable: false, readonly: true, savedText: '', print: null, save: null,
      close: () => C.closeSheet(),
      key: (e) => { if (e && e.key === 'Escape') { if (e.stopPropagation) e.stopPropagation(); C.closeSheet(); } }
    };
  }
  const d = sh.d || PMS.draftOf(ms);
  const locked = !!d.locked;
  const editable = !locked && !ro;
  const ini = PMS.initOf(P, ms), prodId = PMS.productOf(P, ms);
  const prod = prodId ? (P.products || []).find((p) => p.id === prodId) : null;
  const done = RD.milestoneAchieved(ms, em);
  const num = PMS.number(P, ms);
  const fin = PGT.fin;
  const txt = (v, empty) => { const t = String(v == null ? '' : v).trim(); return t || (empty == null ? '—' : empty); };
  const field = (key, ph, label) => ({
    value: d[key] || '', ph: ph, label: label, text: txt(d[key]),
    set: (e) => C.setDraft({ [key]: e && e.target ? e.target.value : '' })
  });
  const metrics = PMS.kpisOf(P, ms.id).map((k) => {
    const m = PMS.metric(ctx, k);
    const typed = ((d.kpiOverrides || {})[k.id] || {}).measured;
    const shown = typed != null && String(typed).trim() !== '' ? String(typed) : (m.live || '—');
    return {
      id: k.id, name: m.name, src: m.src ? 'Source: ' + m.src : '', hasSrc: !!m.src,
      target: m.target, measured: typed == null ? '' : String(typed), measuredPh: m.live || 'No reading yet',
      measuredText: shown, measuredLabel: 'Measured, ' + m.name,
      result: m.result, resultCls: 'st ' + m.tone,
      set: (e) => {
        const v = e && e.target ? e.target.value : '';
        const cur = C.draft().kpiOverrides || {};
        C.setDraft({ kpiOverrides: Object.assign({}, cur, { [k.id]: Object.assign({}, cur[k.id] || {}, { measured: v }) }) });
      }
    };
  });
  const findings = (d.findings || []).map((f, i) => ({
    n: String(i + 1).padStart(2, '0'), value: f || '', text: txt(f, ''), label: 'Finding ' + (i + 1),
    set: (e) => C.setDraftPath('findings.' + i, e && e.target ? e.target.value : '')
  }));
  const actions = (d.actions || []).map((a, i) => ({
    item: a.item || '', owner: a.owner || '', due: a.due || '',
    itemText: txt(a.item, ''), ownerText: txt(a.owner, ''), dueText: txt(a.due, ''),
    itemLabel: 'Action ' + (i + 1), ownerLabel: 'Owner of action ' + (i + 1), dueLabel: 'Due date of action ' + (i + 1),
    setItem: (e) => C.setDraftPath('actions.' + i + '.item', e && e.target ? e.target.value : ''),
    setOwner: (e) => C.setDraftPath('actions.' + i + '.owner', e && e.target ? e.target.value : ''),
    setDue: (e) => C.setDraftPath('actions.' + i + '.due', e && e.target ? e.target.value : '')
  }));
  /* TRL and MRL are 1 to 9; a stored 0 is today's "blank saves as 0" bug (inventory §19.11) */
  const lvl = (v) => (v != null && v !== '' && Number(v) !== 0 ? String(v) : '');
  const linked = PMS.linkedObjectives(ctx, ms.id).map((o) => ({ text: o.statement || o.id, q: o.quarter ? F.q(o.quarter) : '', hasQ: !!o.quarter }));
  const rep = ms.milestoneReport;
  const s0 = sh.data && typeof sh.data.d0 === 'string' ? sh.data.d0 : '';
  const dirty = !!s0 && JSON.stringify(d) !== s0;
  return {
    ok: true, missing: false,
    title: 'Milestone report', sub: num + ', ' + (ms.name || ms.id),
    ro: ro, locked: locked, editable: editable, readonly: !editable,
    canLock: !ro, lockLabel: locked ? 'Unlock' : 'Lock', lockAria: locked ? 'Unlock the report' : 'Lock the report',
    toggleLock: () => PMS.toggleLock(C, ctx, ms.id),
    roNote: ro, lockedNote: locked && !ro,
    project: field('project', prod ? (prod.name || prod.id) : (ini ? (ini.name || ini.id) : 'Project or product name'), 'Project'),
    author: field('author', 'Name', 'Author'),
    version: field('version', 'v1.0', 'Version'),
    demonstrated: field('demonstrated', 'Describe what was physically demonstrated, tested, or shown: setup conditions, operating envelope, duration, and any observers present.', 'What was demonstrated'),
    tag: num, msName: ms.name || ms.id,
    achText: done ? 'Achieved' : 'Not achieved', achCls: 'st ' + (done ? 't-ok' : 't-none'),
    dateAchieved: fin(ms.completedDate) ? F.dayY(ms.completedDate) : '—',
    trlmrl: (lvl(ms.trl) || '—') + ' / ' + (lvl(ms.mrl) || '—'),
    metrics: metrics, hasMetrics: metrics.length > 0, noMetrics: !metrics.length,
    findings: findings,
    planned: fin(ms.plannedDate) ? F.dayY(ms.plannedDate) : '—',
    actual: fin(ms.completedDate) ? F.dayY(ms.completedDate) : '—',
    trl: lvl(ms.trl) ? 'TRL ' + lvl(ms.trl) : '—',
    mrl: lvl(ms.mrl) ? 'MRL ' + lvl(ms.mrl) : '—',
    linked: linked, hasLinked: linked.length > 0, noLinked: !linked.length,
    actions: actions,
    savedText: rep && rep.savedAt ? 'Last saved ' + F.stamp(rep.savedAt) : 'Not saved yet',
    dirty: dirty,
    print: () => PMS.print(C),
    save: () => PMS.save(C, ctx, ms.id, true),
    close: () => PMS.close(C),
    /* Escape closes the report, asking first when there are unsaved edits */
    key: (e) => { if (e && e.key === 'Escape') { if (e.stopPropagation) e.stopPropagation(); PMS.close(C); } }
  };
}

MODS.pms = {
  state: { pm_col: {} },
  wide: ['pms.report'],
  vm(C, ctx) {
    const sheet = pmsSheet(C, ctx);
    if (ctx.tab !== 'milestones') return { sheet: sheet, rows: [], empty: true, emptyText: '', countText: '', groupNote: '' };
    const T = pmsRows(C, ctx);
    const total = T.total;
    return {
      sheet: sheet,
      rows: T.rows,
      empty: !T.rows.length,
      emptyText: total ? 'No milestones match the current filters.' : 'No milestones yet. Add one from an initiative in the Structure tab.',
      countText: T.n === total ? F.plural(total, 'milestone') : T.n + ' of ' + F.plural(total, 'milestone'),
      groupNote: T.groupNote
    };
  }
};
