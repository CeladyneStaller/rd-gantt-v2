/* ============================================================================
   pst: the Structure view. Hierarchy (Units, Divisions, Products with their
   models, Initiatives with their objectives and milestones) or the custom
   grouping chosen in the shared bar (objectives nested under the dimensions).
   Every add / edit / delete goes through PED; names open the lineage.
   ========================================================================== */
function pstEndBadge(ctx, o) {
  const es = ctx.objEnd(o);
  if (!es) return { hasEnd: false, endText: '', endCls: '', endTitle: '' };
  const ab = es.status === 'abandoned';
  return { hasEnd: true, endText: ab ? 'Abandoned' : 'Achieved', endCls: 'st ' + (ab ? 't-bad' : 't-ok'), endTitle: (ab ? 'Abandoned' : 'Achieved') + (es.endedDay != null ? ' ' + F.dayY(es.endedDay) : '') };
}
function pstXDiv(ctx, o) {
  const P = ctx.P;
  if (!o || !o.initiativeId || !o.divisionId) return { hasX: false, xText: '', xTitle: '' };
  const i = PLAN.byId(P, 'initiative', o.initiativeId);
  if (!i || !i.divisionId || i.divisionId === o.divisionId) return { hasX: false, xText: '', xTitle: '' };
  const dn = PLAN.nameOf(PLAN.byId(P, 'division', o.divisionId));
  const idn = PLAN.nameOf(PLAN.byId(P, 'division', i.divisionId));
  return { hasX: true, xText: 'Executed in ' + dn, xTitle: 'Executed in ' + dn + '. This objective’s key results and stage-gates live in that division’s execution bin, while its initiative sits in ' + idn + '.' };
}
/* the "…" menu of one row */
function pstMenu(C, ctx, ent, rec) {
  const id = rec.id;
  const mid = 'pst:' + ent + ':' + id;
  const open = C.isMenu(mid);
  const items = [];
  const btn = (label, fn, bad) => items.push({ label: label, isLink: false, cls: bad ? 'mi bad' : 'mi', fn: () => { C.closeMenus(); fn(); }, href: '', go: null });
  const link = (label, href, go) => items.push({ label: label, isLink: true, cls: 'mi', fn: null, href: href, go: () => { C.closeMenus(); go(); } });
  if (!ctx.ro) btn('Edit', () => PED.open(C, ctx, ent, id));
  if (!ctx.ro) {
    if (ent === 'division') { btn('Add initiative', () => PED.open(C, ctx, 'initiative', null, { parentId: id })); btn('Add product', () => PED.open(C, ctx, 'product', null, { parentId: id })); }
    if (ent === 'product') btn('Add model', () => PED.open(C, ctx, 'model', null, { parentId: id }));
    if (ent === 'initiative') { btn('Add objective', () => PED.open(C, ctx, 'objective', null, { parentId: id })); btn('Add milestone', () => PED.open(C, ctx, 'milestone', null, { parentId: id })); }
    if (ent === 'milestone') {
      const st = PLAN.msState(ctx.P, id);
      const paused = !!(st && (st.status === 'paused' || st.status === 'deprioritized'));
      if (paused) btn('Resume', () => PED.milestoneStatus(C, ctx, id, 'active'));
      else { btn('Pause', () => PED.milestoneStatus(C, ctx, id, 'paused')); btn('Deprioritize', () => PED.milestoneStatus(C, ctx, id, 'deprioritized')); }
      if (rec.completedDate == null) btn('Mark achieved', () => PED.milestoneStatus(C, ctx, id, 'achieved'));
      else btn('Reopen milestone', () => PED.milestoneStatus(C, ctx, id, 'open'));
    }
  }
  if (ent === 'objective') {
    const app = ctx.appOf(rec.divisionId);
    link(app === 'sales' ? 'Open in Sales' : 'Open in Execution', app === 'sales' ? 'Sales-A.dc.html' : 'Main.dc.html', () => C.handoff({ app: app, objective: id }));
  }
  if (ent === 'model') link('Open in Product spec', 'Spec-A.dc.html', () => C.handoff({ app: 'spec', model: id }));
  btn('Show lineage', () => PED.lineage(C, ctx, ent, id));
  if (!ctx.ro) btn('Delete', () => PED.del(C, ctx, ent, id), true);
  return {
    menuOpen: open, menuExp: open ? 'true' : 'false', menuWrap: open ? 'anchor above' : 'anchor',
    menuLabel: 'More actions for ' + PLAN.nameOf(rec), toggleMenu: () => C.toggleMenu(mid), items: items
  };
}
function pstBandCell(b) { return { stCls: 'st ' + F.tone(PLAN.tone(b)), stWord: PLAN.word(b) }; }

function pstHier(C, ctx) {
  const P = ctx.P, f = ctx.f, D = C.D;
  const lineage = (ent, id) => () => PED.lineage(C, ctx, ent, id);
  const col = C.state.pst_col || {};
  const tog = (key, name, kids) => {
    const open = !col[key];
    return {
      hasToggle: kids, noToggle: !kids, open: open ? 'true' : 'false',
      toggleLabel: (open ? 'Collapse ' : 'Expand ') + name,
      toggle: () => C.setState({ pst_col: Object.assign({}, C.state.pst_col, { [key]: !(C.state.pst_col || {})[key] }) }),
      isOpen: open
    };
  };
  const all = (prefix, ids, closed) => () => {
    const next = Object.assign({}, C.state.pst_col);
    ids.forEach((id) => { next[prefix + id] = closed; });
    C.setState({ pst_col: next });
  };
  /* units: not filtered */
  const units = PLAN.byOrder(P.units || []).map((u) => Object.assign({
    id: u.id, name: u.name || u.id, order: PLAN.ord(u) === 1e9 ? '—' : String(u.order),
    nDivs: String((P.divisions || []).filter((d) => (d.unitId || null) === u.id).length),
    lineage: lineage('unit', u.id)
  }, pstMenu(C, ctx, 'unit', u)));
  /* divisions: unit + division filters */
  const divs = PLAN.byOrder((P.divisions || []).filter(ctx.divShows)).map((d) => {
    const u = PLAN.byId(P, 'unit', d.unitId);
    const sc = RD.rollupDivision(d.id, P, ctx.em);
    return Object.assign({
      id: d.id, name: d.name || d.id, unit: u ? u.name : (d.unitId ? d.unitId : 'Unassigned'),
      kind: RD.divisionKind(d) === 'biz' ? 'Business' : 'R&D', order: PLAN.ord(d) === 1e9 ? '—' : String(d.order),
      score: F.score(sc), scoreCls: 'num strong tx-' + PLAN.tone(RD.band(sc)),
      lineage: lineage('division', d.id)
    }, pstMenu(C, ctx, 'division', d));
  });
  /* products and their models: unit, division and product filters */
  const prows = [];
  const prodList = PLAN.byOrder((P.products || []).filter(ctx.prodShows));
  prodList.forEach((p) => {
    const dv = PLAN.byId(P, 'division', p.divisionId);
    const models = PLAN.byOrder((P.models || []).filter((m) => m.productId === p.id));
    const t = tog('p:' + p.id, p.name || p.id, models.length > 0);
    prows.push(Object.assign({
      isProd: true, isModel: false, id: p.id, name: p.name || p.id, cls: 'pst-prow',
      div: dv ? dv.name : 'No division', code: p.code || '—', order: PLAN.ord(p) === 1e9 ? '—' : String(p.order),
      lineage: lineage('product', p.id), conf: '', hasConf: false, confCls: ''
    }, t, pstMenu(C, ctx, 'product', p)));
    if (!t.isOpen) return;
    models.forEach((m) => {
      const conf = pedModelConf(D, m.id);
      prows.push(Object.assign({
        isProd: false, isModel: true, id: m.id, name: m.name || m.id, cls: 'pst-crow',
        div: '', code: '', order: PLAN.ord(m) === 1e9 ? '—' : String(m.order),
        lineage: lineage('model', m.id),
        hasConf: conf != null, conf: conf != null ? Math.round(conf) + '% conformance' : '', confCls: 'sub tx-' + PLAN.tone(RD.band(conf))
      }, pstMenu(C, ctx, 'model', m)));
    });
  });
  /* initiatives with objectives (filtered) and milestones (never filtered) */
  const objsOf = (i) => {
    let os = (P.objectives || []).filter((o) => o.initiativeId === i.id);
    if (ctx.anyFilter) os = os.filter(ctx.objMatch);
    return PLAN.byOrder(os);
  };
  /* today's table rule (structInitShows), except that an initiative with no objectives falls back to
     its own classification under a product filter (initOwnMatches) instead of disappearing */
  const initShows = (i) => {
    if (f.unit && (RD.unitIdOfDivision(i.divisionId, P) || '') !== f.unit) return false;
    if (f.div && i.divisionId !== f.div) return false;
    if (f.prod || f.q || f.status) {
      const hasObjs = (P.objectives || []).some((o) => o.initiativeId === i.id);
      return hasObjs ? objsOf(i).length > 0 : ctx.initMatch(i);
    }
    return true;
  };
  const irows = [];
  const initList = PLAN.byOrder((P.initiatives || []).filter(initShows));
  initList.forEach((i) => {
    const dv = PLAN.byId(P, 'division', i.divisionId);
    const sc = RD.rollupInitiative(i.id, P, ctx.em);
    const b = RD.band(sc);
    const kids = objsOf(i).length + (P.milestones || []).filter((m) => m.initiativeId === i.id).length;
    const t = tog('i:' + i.id, i.name || i.id, kids > 0);
    irows.push(Object.assign({
      isInit: true, isObj: false, isMs: false, id: i.id, name: i.name || i.id, cls: 'pst-prow',
      div: dv ? dv.name : 'No division',
      when: i.plannedStart != null || i.plannedEnd != null ? F.dayAuto(i.plannedStart, ctx.today) + ' to ' + F.dayAuto(i.plannedEnd, ctx.today) : '—',
      hasScore: sc != null, score: F.score(sc), scoreCls: 'num strong tx-' + PLAN.tone(b),
      lineage: lineage('initiative', i.id),
      dmdCls: '', hasEnd: false, endText: '', endCls: '', endTitle: '', hasX: false, xText: '', xTitle: ''
    }, pstBandCell(b), t, pstMenu(C, ctx, 'initiative', i)));
    if (!t.isOpen) return;
    objsOf(i).forEach((o) => {
      const ob = ctx.objBand(o.id);
      irows.push(Object.assign({
        isInit: false, isObj: true, isMs: false, id: o.id, name: o.statement || o.id, cls: 'pst-crow',
        div: '', when: o.quarter ? F.q(o.quarter) : 'No quarter', hasScore: false, score: '', scoreCls: '',
        lineage: lineage('objective', o.id), dmdCls: ''
      }, pstBandCell(ob), pstEndBadge(ctx, o), pstXDiv(ctx, o), pstMenu(C, ctx, 'objective', o)));
    });
    PLAN.byOrder((P.milestones || []).filter((m) => m.initiativeId === i.id)).forEach((m) => {
      const st = PLAN.msState(P, m.id);
      const done = RD.milestoneAchieved(m, ctx.em);
      const paused = !done && !!(st && (st.status === 'paused' || st.status === 'deprioritized'));
      const mb = ctx.msBand(m.id);
      const cell = done ? { stCls: 'st t-ok', stWord: 'Achieved' } : paused ? { stCls: 'st t-none', stWord: st.status === 'paused' ? 'Paused' : 'Deprioritized' } : pstBandCell(mb);
      irows.push(Object.assign({
        isInit: false, isObj: false, isMs: true, id: m.id, name: m.name || m.id, cls: 'pst-crow' + (paused ? ' pst-dim' : ''),
        div: '', when: m.plannedDate != null ? F.dayAuto(m.plannedDate, ctx.today) : 'No date', hasScore: false, score: '', scoreCls: '',
        lineage: lineage('milestone', m.id), dmdCls: 'ped-dmd ' + F.tone(paused ? 'none' : PLAN.tone(mb)),
        hasEnd: false, endText: '', endCls: '', endTitle: '', hasX: false, xText: '', xTitle: ''
      }, cell, pstMenu(C, ctx, 'milestone', m)));
    });
  });
  const canEdit = !ctx.ro;
  const nPaused = RD.pausedMilestoneIds(P.milestoneState, P.milestones || []).length;
  const prodIds = prodList.filter((p) => (P.models || []).some((m) => m.productId === p.id)).map((p) => p.id);
  const initIds = initList.map((i) => i.id);
  const prodAllClosed = prodIds.length > 0 && prodIds.every((id) => col['p:' + id]);
  const initAllClosed = initIds.length > 0 && initIds.every((id) => col['i:' + id]);
  return {
    canEdit: canEdit,
    hasPaused: nPaused > 0,
    pausedText: F.plural(nPaused, 'milestone') + ' paused or deprioritized, kept out of dates and scores',
    prodFold: prodAllClosed ? 'Expand all' : 'Collapse all',
    prodFoldGo: all('p:', prodIds, !prodAllClosed),
    canFoldProds: prodIds.length > 0,
    initFold: initAllClosed ? 'Expand all' : 'Collapse all',
    initFoldGo: all('i:', initIds, !initAllClosed),
    canFoldInits: initIds.length > 0,
    units: units, hasUnits: units.length > 0, noUnits: !units.length,
    addUnit: () => PED.open(C, ctx, 'unit', null),
    divs: divs, hasDivs: divs.length > 0, noDivs: !divs.length,
    divEmpty: (P.divisions || []).length ? 'No divisions match the filter.' : 'No divisions yet. Add one to start the plan.',
    addDiv: () => PED.open(C, ctx, 'division', null),
    prods: prows, hasProds: prows.length > 0, noProds: !prows.length,
    prodEmpty: ctx.anyFilter ? 'No products match the filter.' : 'No products yet. Products sit in a division and hold its models.',
    addProd: () => PED.open(C, ctx, 'product', null),
    inits: irows, hasInits: irows.length > 0, noInits: !irows.length,
    initEmpty: ctx.anyFilter ? 'No initiatives match the filter.' : 'No initiatives yet. An initiative holds a division’s objectives and milestones.',
    addInit: () => PED.open(C, ctx, 'initiative', null)
  };
}

function pstCustom(C, ctx) {
  const P = ctx.P, em = ctx.em;
  const col = C.state.pst_col || {};
  const dims = (ctx.group.dims || []).slice();
  const objs = (P.objectives || []).filter(ctx.objMatch);
  const rows = [];
  const pad = (depth) => 'padding-left: ' + (16 + depth * 22) + 'px';
  const objRow = (o, depth) => {
    const ini = PLAN.byId(P, 'initiative', o.initiativeId);
    const b = ctx.objBand(o.id);
    const owners = RD.ownersOf(o);
    const app = ctx.appOf(o.divisionId);
    rows.push(Object.assign({
      isGroup: false, isObj: true, key: o.id, pad: pad(depth), id: o.id, name: o.statement || o.id,
      dotCls: 'dot ' + F.tone(PLAN.tone(b)), word: PLAN.word(b),
      quarter: o.quarter ? F.q(o.quarter) : 'No quarter', initiative: ini ? ini.name : 'No initiative',
      owners: owners.length ? F.people(owners) : 'No owner',
      lineage: () => PED.lineage(C, ctx, 'objective', o.id),
      edit: () => PED.open(C, ctx, 'objective', o.id), editLabel: 'Edit ' + (o.statement || o.id),
      del: () => PED.del(C, ctx, 'objective', o.id), delLabel: 'Delete ' + (o.statement || o.id),
      openHref: app === 'sales' ? 'Sales-A.dc.html' : 'Main.dc.html', openLabel: app === 'sales' ? 'Open in Sales' : 'Open in Execution',
      openApp: () => C.handoff({ app: app, objective: o.id }),
      label: '', count: '', open: 'true', toggle: null, toggleLabel: '', adds: [], hasAdds: false
    }, pstEndBadge(ctx, o), pstXDiv(ctx, o)));
  };
  const collect = (n) => (n.objs ? n.objs : (n.children || []).reduce((a, c) => a.concat(collect(c)), []));
  const walk = (nodes, depth, path) => {
    if (nodes.length === 1 && nodes[0].dim == null) { nodes[0].objs.forEach((o) => objRow(o, depth)); return; }
    nodes.forEach((n) => {
      if (n.key === '') {
        if (n.children) walk(n.children, depth, path); else n.objs.forEach((o) => objRow(o, depth));
        return;
      }
      const np = path.concat([[n.dim, n.key]]);
      const pre = PLAN.groupPrefill(np);
      const under = collect(n);
      const gk = PLAN.pathKey(np);
      const open = !col[gk];
      const vs = under.map((o) => RD.rollupObjective(o.id, P, em)).filter((v) => v != null);
      const gs = vs.length ? vs.reduce((a, c) => a + c, 0) / vs.length : null;
      const label = PLAN.dimLabel(P, n.dim, n.key);
      const adds = [];
      if (!ctx.ro) {
        adds.push({ label: 'Add objective', aria: 'Add an objective to ' + label, go: () => PED.open(C, ctx, 'objective', null, { prefill: pre }) });
        if (n.dim === 'division') adds.push({ label: 'Add initiative', aria: 'Add an initiative to ' + label, go: () => PED.open(C, ctx, 'initiative', null, { prefill: pre }) });
        else if (n.dim === 'product') adds.push({ label: 'Add model', aria: 'Add a model to ' + label, go: () => PED.open(C, ctx, 'model', null, { prefill: pre }) });
        else if (n.dim === 'initiative') adds.push({ label: 'Add milestone', aria: 'Add a milestone to ' + label, go: () => PED.open(C, ctx, 'milestone', null, { prefill: pre }) });
      }
      rows.push({
        isGroup: true, isObj: false, key: gk, pad: pad(depth), id: '', name: '',
        label: label, dimWord: PLAN.dimWord(n.dim), count: F.plural(under.length, 'objective'),
        dotCls: 'dot ' + F.tone(PLAN.tone(RD.band(gs))), word: PLAN.word(RD.band(gs)), score: F.score(gs),
        open: open ? 'true' : 'false', toggleLabel: (open ? 'Collapse ' : 'Expand ') + label,
        toggle: () => C.setState({ pst_col: Object.assign({}, C.state.pst_col, { [gk]: !(C.state.pst_col || {})[gk] }) }),
        adds: adds, hasAdds: adds.length > 0
      });
      if (!open) return;
      if (n.children) walk(n.children, depth + 1, np); else n.objs.forEach((o) => objRow(o, depth + 1));
    });
  };
  if (objs.length) walk(RD.groupObjectives(objs, dims, P), 0, []);
  return {
    flat: !dims.length,
    showTools: !ctx.ro,
    addObj: () => PED.open(C, ctx, 'objective', null),
    addInit: () => PED.open(C, ctx, 'initiative', null),
    rows: rows, has: rows.length > 0, none: !objs.length,
    canEdit: !ctx.ro,
    title: dims.length ? 'Objectives by ' + F.list(dims.map((d) => PLAN.dimWord(d).toLowerCase())) : 'All objectives',
    count: F.plural(objs.length, 'objective')
  };
}

MODS.pst = {
  state: { pst_col: {} },
  vm(C, ctx) {
    const custom = ctx.group && ctx.group.mode === 'custom';
    return {
      hier: !custom, custom: custom,
      h: custom ? null : pstHier(C, ctx),
      g: custom ? pstCustom(C, ctx) : null
    };
  }
};
