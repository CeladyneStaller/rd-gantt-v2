/* ============================================================================
   ssub: Product spec, Sub-products (inventory spec §12), Component owners and
   Cross-product dependencies (§13).

   Today: product_designer.template.html L554-603 (cross-document resolution),
   L764-856 (add / remove / auto-sync / links to spec), L1455-1544 (owners and
   cross-product dependencies), L1689-1773 (panel and the add picker).

   A sub-product is a host component (stageGates row with refModel) in this model,
   plus one imported row per child-model specification (kpis with refModel/refKr,
   linkType 'specification'), plus a portfolio composition edge CMP-<host> that the
   Planning app reads.

   Auto-sync: today imports child specifications added later on every render and
   saves. A Calm view model may not write, so rows not yet imported show straight
   away as computed rows, and every sub-product change first runs today's exact
   sync (same ids, same order) inside its save. Nothing else reads those rows
   before they are linked or given a target, so what people see and save matches.

   Other divisions' SPEC bins: today fetches them from the broker ("loading…",
   "unreachable"). The sample holds every document; the shell's ctx.refDocOfModel
   serves them, and its Settings simulate a slow load and an unreachable bin.
   Composition edges are written through ctx.portfolioWrite, the shell's version of
   today's persistPortfolio (including the merge after a simulated 412).

   Public interface (guard with typeof SSUB !== 'undefined'):
     SSUB.resolveRef(C, ctx, member)  today's resolveRef: { name, dir, unit, stackTgt,
         stackVal, tgt, score, live, pending, overridden } for an imported row; the
         specifications panel uses it for "From sub-products".
     SSUB.refDoc(C, ctx, modelId)    { doc, failed } for the model's SPEC document, or null while loading
     SSUB.hosts(ctx)                 this model's sub-product hosts
   ========================================================================== */

const SSUB = {
  blank() { return { keyResults: [], stageGates: [], kpis: [], kpiUpdates: [], modelSpec: {} }; },
  T(v) { return String(v == null ? '' : v).trim(); },

  /* ---------------------------------------------------------------- lookups */
  model(P, id) { return ((P && P.models) || []).find((m) => m.id === id) || null; },
  modelName(P, id) { const m = SSUB.model(P, id); return m ? m.name || m.id : id; },
  product(P, id) { return ((P && P.products) || []).find((p) => p.id === id) || null; },
  productName(P, id) { const p = SSUB.product(P, id); return p ? p.name || p.id : id; },
  productIdOf(P, modelId) { const m = SSUB.model(P, modelId); return m ? m.productId : null; },
  divOfModel(P, modelId) { const p = SSUB.product(P, SSUB.productIdOf(P, modelId)); return p ? p.divisionId : null; },
  divName(P, divId) { const d = ((P && P.divisions) || []).find((x) => x.id === divId); return d ? d.name || d.id : divId || ''; },
  akOf(doc, P) { const ks = (doc && doc.kpis) || []; return P && P.kpis && P.kpis.length ? ks.concat(P.kpis) : ks; },
  hosts(ctx) { return ((ctx.doc && ctx.doc.stageGates) || []).filter((g) => g.objectiveId === ctx.modelId && g.refModel); },
  specsOf(ctx) { return ((ctx.doc && ctx.doc.keyResults) || []).filter((r) => r.objectiveId === ctx.modelId); },
  childSpecs(rdoc, child) { return ((rdoc && rdoc.keyResults) || []).filter((r) => r.objectiveId === child); },
  /* a child spec's primary metric: its keyResult-hosted root KPI (today L594) */
  primary(rdoc, krId, RAK) { return ((rdoc && rdoc.kpis) || []).find((k) => k.hostType === 'keyResult' && k.hostId === krId && RD.linkOf(k, RAK).parent == null) || null; },

  /* ------------------------------------------- other documents (today refDocOfModel) */
  /* { doc, failed } for the SPEC document a model's specifications live in, or null while it loads */
  refDoc(C, ctx, modelId) {
    if (typeof ctx.refDocOfModel === 'function') return ctx.refDocOfModel(modelId);
    const div = SSUB.divOfModel(ctx.P, modelId);
    if (!div) return null;
    if (div === ctx.divId) return { doc: ctx.doc, failed: false };
    return { doc: (C.D.spec && C.D.spec['SPEC-' + div]) || SSUB.blank(), failed: false };
  },
  /* write the shared portfolio the way the live app does (persistPortfolio, L442) */
  portfolioWrite(C, ctx, apply, msg) {
    if (typeof ctx.portfolioWrite === 'function') return ctx.portfolioWrite(apply, msg);
    return C.mutate(apply, { msg: msg });
  },

  /* today's resolveRef (L586): the child spec's primary metric value and target, or for a %- or
     sub-spec-tracked child spec, target 100% and value = that spec's conformance */
  resolveRef(C, ctx, member) {
    const P = ctx.P;
    let name = member.name, dir = 'up', unit = member.unit || '', stackTgt = null, stackVal = null, live = false, pending = false, missing = false, binary = false;
    const rd = SSUB.refDoc(C, ctx, member.refModel);
    if (rd && rd.doc) {
      const kr = (rd.doc.keyResults || []).find((r) => r.id === member.refKr);
      if (kr) {
        name = kr.statement || name;
        const RAK = SSUB.akOf(rd.doc, P), REM = RD.withPortfolio(P, { REF: rd.doc });
        const pk = SSUB.primary(rd.doc, kr.id, RAK);
        if (pk) {
          dir = RD.kpiDirection(pk, RAK) || 'up'; unit = RD.kpiUnit(pk, RAK) || '';
          stackTgt = RD.effTarget(pk, RAK); stackVal = RD.effValue(pk, RAK, REM);
          binary = pk.targetType === 'binary';
        } else { dir = 'up'; unit = '%'; stackTgt = 100; stackVal = RD.keyResultScore(kr.id, REM); }
        live = true;
      } else { live = true; missing = !rd.failed; }
    } else {
      const dv = SSUB.divOfModel(P, member.refModel);
      if (dv && dv !== ctx.divId) pending = true;
    }
    const tgt = member.target != null ? member.target : stackTgt;
    const score = RD.rawScore(stackVal, tgt, dir);
    return { name: name, dir: dir, unit: unit, stackTgt: stackTgt, stackVal: stackVal, tgt: tgt, score: score, live: live, pending: pending, missing: missing, binary: binary, overridden: member.target != null };
  },

  /* ---------------------------------------------------------------- auto-sync */
  /* child specs not imported yet, as the rows today's sync would append (no ids yet) */
  missingRows(C, ctx, host, stored) {
    const rd = SSUB.refDoc(C, ctx, host.refModel);
    if (!rd || !rd.doc || rd.failed) return [];
    const RAK = SSUB.akOf(rd.doc, ctx.P);
    const have = {};
    stored.forEach((k) => { if (k.refKr) have[k.refKr] = 1; });
    return SSUB.childSpecs(rd.doc, host.refModel).filter((src) => !have[src.id]).map((src) => {
      const pk = SSUB.primary(rd.doc, src.id, RAK);
      return { id: '', vkey: host.id + '|' + src.id, objectiveId: ctx.modelId, hostType: 'component', hostId: host.id, refModel: host.refModel, refKr: src.id, linkType: 'specification', linkParent: null, name: src.statement || src.id, unit: pk ? RD.kpiUnit(pk, RAK) : '%', target: null };
    });
  },
  /* today's syncSubProductSpecs (L831), run inside C.mutate before every sub-product change */
  syncDoc(C, D, ctx) {
    const doc = D.spec[ctx.docKey];
    if (!doc) return 0;
    const P = D.portfolio, model = ctx.modelId;
    doc.kpis = doc.kpis || [];
    let n = 0;
    (doc.stageGates || []).filter((g) => g.objectiveId === model && g.refModel).forEach((hst) => {
      const child = hst.refModel, rd = SSUB.refDoc(C, ctx, child);
      if (!rd || !rd.doc || rd.failed) return;
      const RAK = SSUB.akOf(rd.doc, P);
      const have = {};
      doc.kpis.forEach((k) => { if (k.hostType === 'component' && k.hostId === hst.id && k.refKr) have[k.refKr] = 1; });
      SSUB.childSpecs(rd.doc, child).forEach((src) => {
        if (have[src.id]) return;
        const kid = RD.allocId('kpi', model, SSUB.akOf(doc, P).map((x) => x.id));
        const pk = SSUB.primary(rd.doc, src.id, RAK);
        doc.kpis.push({ id: kid, objectiveId: model, hostType: 'component', hostId: hst.id, refModel: child, refKr: src.id, linkType: 'specification', linkParent: null, name: src.statement || src.id, unit: pk ? RD.kpiUnit(pk, RAK) : '%', target: null });
        n++;
      });
    });
    return n;
  },
  findMember(doc, hostId, m) {
    const ks = (doc && doc.kpis) || [];
    if (m.id) return ks.find((k) => k.id === m.id) || null;
    return ks.find((k) => k.hostType === 'component' && k.hostId === hostId && k.refKr === m.refKr) || null;
  },

  /* ------------------------------------------------------------ formatting */
  fmtTarget(t, unit, dir, binary) {
    if (binary) return 'Pass';
    if (t == null) return 'No target';
    if (typeof t === 'object') return F.n(t.lo) + ' to ' + F.u(t.hi, unit);
    return (dir === 'down' ? '≤ ' : dir === 'up' ? '≥ ' : '') + F.u(t, unit);
  },
  fmtValue(v, unit, binary) {
    if (v == null || v === '') return 'No reading';
    if (binary) return Number(v) >= 1 ? 'Met' : 'Not met';
    return F.u(v, unit);
  },

  /* ------------------------------------------------- your target, links to spec */
  applyOverride(C, ctx, host, m, value) {
    const msg = value == null ? 'Override cleared. Using the sub-product’s target.' : 'Target override set.';
    const ok = C.mutate((D) => {
      SSUB.syncDoc(C, D, ctx);
      const rec = SSUB.findMember(D.spec[ctx.docKey], host.id, m);
      if (!rec) return false;
      rec.target = value;
    }, { msg: msg });
    if (ok) C.setState({ ssub_edit: null });
  },
  setOverride(C, ctx, host, m, isRange) {
    const E = C.state.ssub_edit || {};
    const T = SSUB.T;
    const err = (t) => C.setState({ ssub_edit: Object.assign({}, E, { err: t }) });
    let value = null;
    if (isRange) {
      const loT = T(E.lo), hiT = T(E.hi);
      if (loT || hiT) {
        if (!loT || !hiT) { err('Enter both ends of the range, or leave both blank to use the sub-product’s target.'); return; }
        const lo = K.num(loT), hi = K.num(hiT);
        if (lo == null || hi == null) { err('Use numbers for the range, like 2 and 4.'); return; }
        if (lo > hi) { err('The low end of the range must not be above the high end.'); return; }
        value = { lo: lo, hi: hi };
      }
    } else {
      const t = T(E.v);
      if (t) {
        const n = K.num(t);
        if (n == null) { err('Use a number, like 0.5. Leave it blank to use the sub-product’s target.'); return; }
        value = n;
      }
    }
    SSUB.applyOverride(C, ctx, host, m, value);
  },
  setLinkSpec(C, ctx, host, m, krId) {
    const linked = !!krId && SSUB.specsOf(ctx).some((r) => r.id === krId);
    C.mutate((D) => {
      SSUB.syncDoc(C, D, ctx);
      const doc = D.spec[ctx.docKey];
      const rec = SSUB.findMember(doc, host.id, m);
      if (!rec) return false;
      if (krId && (doc.keyResults || []).some((r) => r.id === krId && r.objectiveId === ctx.modelId)) rec.linkSpec = krId; else delete rec.linkSpec;
    }, { msg: linked ? 'Imported specification linked to a product specification.' : 'Link cleared.' });
  },

  /* ------------------------------------------------------- add and remove */
  addable(model, mid, comp, already) { return mid !== model && already.indexOf(mid) < 0 && !RD.wouldComposeCycle(model, mid, comp); },
  eligibleModels(ctx, pid) {
    const P = ctx.P, comp = P.composition || [];
    const already = RD.compositionChildren(ctx.modelId, comp);
    return (P.models || []).filter((m) => m.productId === pid && SSUB.addable(ctx.modelId, m.id, comp, already));
  },
  eligibleProducts(ctx) {
    const P = ctx.P, comp = P.composition || [];
    const already = RD.compositionChildren(ctx.modelId, comp);
    return (P.products || []).filter((p) => (P.models || []).some((m) => m.productId === p.id && SSUB.addable(ctx.modelId, m.id, comp, already)));
  },
  openAdd(C, ctx) {
    if (!C.guard()) return;
    const prods = SSUB.eligibleProducts(ctx);
    const pid = prods.length ? prods[0].id : '';
    const ms = pid ? SSUB.eligibleModels(ctx, pid) : [];
    C[C.sheet() ? 'pushSheet' : 'openSheet']('ssub.add', {}, { product: pid, model: ms.length ? ms[0].id : '' });
  },
  addSheet(C, ctx, sh) {
    const P = ctx.P, d = sh.d || {};
    const prods = SSUB.eligibleProducts(ctx);
    const pid = prods.some((p) => p.id === d.product) ? d.product : (prods.length ? prods[0].id : '');
    const models = pid ? SSUB.eligibleModels(ctx, pid) : [];
    const mid = models.some((m) => m.id === d.model) ? d.model : (models.length ? models[0].id : '');
    const groups = [], byDiv = {};
    prods.forEach((p) => {
      if (!byDiv[p.divisionId]) {
        byDiv[p.divisionId] = { key: p.divisionId || 'none', name: SSUB.divName(P, p.divisionId), here: p.divisionId === ctx.divId, prods: [] };
        groups.push(byDiv[p.divisionId]);
      }
      byDiv[p.divisionId].prods.push({ id: p.id, name: p.name || p.id, on: p.id === pid, pick: () => C.setDraft({ product: p.id, model: '' }) });
    });
    let preview = 'Select a model.', previewCls = 'sub', loading = false;
    if (mid) {
      const rd = SSUB.refDoc(C, ctx, mid);
      if (!rd || !rd.doc) { preview = 'Loading specifications…'; loading = true; }
      else if (rd.failed) { preview = 'Couldn’t reach that product’s SPEC bin. Is it configured on the broker?'; previewCls = 'note t-warn'; }
      else {
        const specs = SSUB.childSpecs(rd.doc, mid);
        const names = specs.slice(0, 6).map((s) => s.statement || s.id);
        preview = specs.length
          ? F.plural(specs.length, 'specification') + ' will import: ' + (specs.length > 6 ? names.join(', ') + ' and ' + (specs.length - 6) + ' more' : F.list(names)) + '.'
          : 'This model has no specifications yet. It will be added as an empty sub-product.';
      }
    }
    return {
      none: !prods.length, has: prods.length > 0,
      noneText: 'No other product has a model that can be added here. Every candidate would either duplicate an existing sub-product or form a composition cycle.',
      groups: groups,
      models: models.map((m) => ({ id: m.id, name: m.name || m.id, on: m.id === mid, pick: () => C.setDraft({ model: m.id }) })),
      noModels: !models.length,
      preview: preview, previewCls: previewCls, loading: loading,
      canAdd: !!mid, addOff: !mid,
      add: () => SSUB.add(C, ctx, mid)
    };
  },
  add(C, ctx, child) {
    if (!C.guard()) return;
    if (!child) { C.sheetErr('Select a model to add.'); return; }
    const P = ctx.P, model = ctx.modelId, comp = P.composition || [];
    if (RD.wouldComposeCycle(model, child, comp)) { C.sheetErr('That would create a composition cycle.'); return; }
    if (comp.some((e) => e.parent === model && e.child === child)) { C.sheetErr('That model is already a sub-product here.'); return; }
    const rd = SSUB.refDoc(C, ctx, child);
    if (!rd || !rd.doc) { C.sheetErr('Still loading that product’s specifications. Try again in a moment.'); return; }
    const n = SSUB.childSpecs(rd.doc, child).length;
    const msg = n ? 'Sub-product added, ' + F.plural(n, 'specification') + ' imported.' : rd.failed ? 'Sub-product added. Its specifications import once that product’s SPEC bin is reachable.' : 'Sub-product added.';
    /* the host, its imported rows and the composition edge are one change; the edge goes to the shared portfolio */
    const ok = SSUB.portfolioWrite(C, ctx, (D) => {
      const doc = D.spec[ctx.docKey];
      if (!doc) return false;
      SSUB.syncDoc(C, D, ctx);
      const PP = D.portfolio;
      PP.composition = PP.composition || [];
      if (PP.composition.some((e) => e.parent === model && e.child === child)) return false;
      const r2 = SSUB.refDoc(C, ctx, child) || { doc: SSUB.blank() };
      const RAK = SSUB.akOf(r2.doc, PP);
      doc.stageGates = doc.stageGates || [];
      doc.kpis = doc.kpis || [];
      const hostId = RD.allocId('stageGate', model, doc.stageGates.map((x) => x.id));
      const cpid = SSUB.productIdOf(PP, child);
      doc.stageGates.push({ id: hostId, objectiveId: model, refModel: child, refProduct: cpid, name: SSUB.productName(PP, cpid) + ' · ' + SSUB.modelName(PP, child) });
      SSUB.childSpecs(r2.doc, child).forEach((src) => {
        const kid = RD.allocId('kpi', model, SSUB.akOf(doc, PP).map((x) => x.id));
        const pk = SSUB.primary(r2.doc, src.id, RAK);
        doc.kpis.push({ id: kid, objectiveId: model, hostType: 'component', hostId: hostId, refModel: child, refKr: src.id, linkType: 'specification', linkParent: null, name: src.statement || src.id, unit: pk ? RD.kpiUnit(pk, RAK) : '%', target: null });
      });
      PP.composition.push({ id: 'CMP-' + hostId, parent: model, child: child });
    }, msg);
    if (ok) C.closeSheet();
  },
  confirmRemove(C, ctx, hostId, rowCount) {
    if (!C.guard()) return;
    const h = ((ctx.doc && ctx.doc.stageGates) || []).find((g) => g.id === hostId);
    if (!h) return;
    const P = ctx.P, model = ctx.modelId, child = h.refModel;
    const edges = (P.composition || []).filter((e) => e.id === 'CMP-' + hostId || (e.parent === model && e.child === child)).length;
    const body = 'Removes ' + (h.name || h.id) + ' from ' + SSUB.modelName(P, model) + ', with ' + (rowCount ? 'its ' + F.plural(rowCount, 'imported specification') + ' and any targets and links set on them' : 'no imported specifications') + '.' +
      (edges ? ' The composition link that Planning shows is removed too.' : '') + ' ' + SSUB.modelName(P, child) + ' itself is not changed.';
    const apply = (D) => {
      const doc = D.spec[ctx.docKey];
      if (!doc || !(doc.stageGates || []).some((g) => g.id === hostId)) return false;
      SSUB.syncDoc(C, D, ctx);
      doc.kpis = (doc.kpis || []).filter((k) => !(k.hostType === 'component' && k.hostId === hostId));
      doc.stageGates = doc.stageGates.filter((g) => g.id !== hostId);
      const PP = D.portfolio;
      PP.composition = (PP.composition || []).filter((e) => !(e.id === 'CMP-' + hostId || (e.parent === model && e.child === child)));
    };
    C.confirm({
      title: 'Remove ' + (h.name || 'this sub-product') + '?', body: body, ok: 'Remove sub-product', danger: true,
      /* today writes the portfolio only when an edge actually goes (L824) */
      onOk: () => (edges ? SSUB.portfolioWrite(C, ctx, apply, 'Sub-product removed.') : C.mutate(apply, { msg: 'Sub-product removed.' }))
    });
  },

  /* ---------------------------------------------------------- the panels */
  rowVM(C, ctx, h, m, ro, specs) {
    const r = SSUB.resolveRef(C, ctx, m);
    const key = m.id || m.vkey;
    const E = C.state.ssub_edit;
    const editing = !!(E && E.key === key);
    const tone = F.band(r.score);
    const isRange = r.dir === 'range';
    const own = m.target;
    const linkSpec = specs.find((s) => s.id === m.linkSpec) || null;
    const ph = r.stackTgt != null && typeof r.stackTgt !== 'object' ? F.n(r.stackTgt) : 'inherit';
    const setT = () => SSUB.setOverride(C, ctx, h, m, isRange);
    return {
      key: key, name: r.name || '(unnamed)', pending: r.pending, missing: r.missing,
      stackTarget: r.pending ? '…' : SSUB.fmtTarget(r.stackTgt, r.unit, r.dir, r.binary),
      stackValue: r.pending ? '…' : SSUB.fmtValue(r.stackVal, r.unit, r.binary),
      valCls: r.stackVal == null ? 'ssub-none' : '',
      overridden: r.overridden,
      /* a row whose child spec was deleted has no direction left to show */
      yours: r.overridden ? SSUB.fmtTarget(own, r.unit, r.missing ? '' : r.dir, false) : 'Inherits',
      yCls: r.overridden ? '' : 'ssub-none',
      score: F.score(r.score), scoreCls: 'st ' + F.tone(tone),
      canEdit: !ro,
      linkVal: linkSpec ? linkSpec.id : '',
      linkText: linkSpec ? linkSpec.statement || linkSpec.id : 'Not linked',
      linkAria: 'Product specification that ' + (r.name || 'this row') + ' links to',
      onLink: (e) => SSUB.setLinkSpec(C, ctx, h, m, e && e.target ? e.target.value : ''),
      editing: editing, isRange: isRange, notRange: !isRange,
      ev: editing ? E.v || '' : '', elo: editing ? E.lo || '' : '', ehi: editing ? E.hi || '' : '',
      eph: ph,
      loPh: r.stackTgt && typeof r.stackTgt === 'object' ? F.n(r.stackTgt.lo) : 'low',
      hiPh: r.stackTgt && typeof r.stackTgt === 'object' ? F.n(r.stackTgt.hi) : 'high',
      earia: 'Your target for ' + (r.name || 'this row') + (r.unit ? ', in ' + r.unit : ''),
      err: editing ? E.err || '' : '', hasErr: !!(editing && E.err),
      canClear: editing && r.overridden,
      startEdit: () => C.setState({ ssub_edit: { key: key, v: own != null && typeof own !== 'object' ? String(own) : '', lo: own && typeof own === 'object' ? String(own.lo) : '', hi: own && typeof own === 'object' ? String(own.hi) : '', err: '' } }),
      onV: (e) => C.setState({ ssub_edit: Object.assign({}, C.state.ssub_edit, { key: key, v: e && e.target ? e.target.value : '', err: '' }) }),
      onLo: (e) => C.setState({ ssub_edit: Object.assign({}, C.state.ssub_edit, { key: key, lo: e && e.target ? e.target.value : '', err: '' }) }),
      onHi: (e) => C.setState({ ssub_edit: Object.assign({}, C.state.ssub_edit, { key: key, hi: e && e.target ? e.target.value : '', err: '' }) }),
      onKey: (e) => { if (!e) return; if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); setT(); } else if (e.key === 'Escape') C.setState({ ssub_edit: null }); },
      setT: setT,
      clear: () => SSUB.applyOverride(C, ctx, h, m, null),
      cancel: () => C.setState({ ssub_edit: null })
    };
  },
  hostVM(C, ctx, h, ro, specs) {
    const P = ctx.P;
    const stored = ((ctx.doc && ctx.doc.kpis) || []).filter((k) => k.hostType === 'component' && k.hostId === h.id);
    const all = stored.concat(SSUB.missingRows(C, ctx, h, stored));
    const rd = SSUB.refDoc(C, ctx, h.refModel);
    const dv = SSUB.divOfModel(P, h.refModel);
    const menuId = 'ssub:h:' + h.id;
    const notes = SSUB.T(h.notes);
    const notesOpen = !!(C.state.ssub_notes || {})[h.id];
    const label = h.name || h.refModel;
    return {
      id: h.id, name: label, aria: 'Sub-product ' + label,
      child: h.refModel, childName: SSUB.modelName(P, h.refModel),
      loading: !rd && !!dv && dv !== ctx.divId, unreachable: !!(rd && rd.failed),
      canEdit: !ro,
      edit: () => { if (typeof SCOMP !== 'undefined' && SCOMP.openComponent) SCOMP.openComponent(C, ctx, h.id); },
      menuOpen: C.isMenu(menuId), toggleMenu: () => C.toggleMenu(menuId), moreAria: 'More actions for ' + label,
      remove: () => SSUB.confirmRemove(C, ctx, h.id, all.length),
      rows: all.map((m) => SSUB.rowVM(C, ctx, h, m, ro, specs)),
      empty: !all.length,
      hasNotes: !!notes, notes: notes, notesOpen: notesOpen,
      toggleNotes: () => C.setState({ ssub_notes: Object.assign({}, C.state.ssub_notes, { [h.id]: !notesOpen }) })
    };
  },
  /* today's ownerSpecTarget (L1492) */
  ownerTarget(kr, rdoc, P) {
    const RAK = SSUB.akOf(rdoc, P);
    const pk = SSUB.primary(rdoc, kr.id, RAK);
    if (pk) {
      if (pk.targetType === 'binary') return 'Pass';
      const dir = RD.kpiDirection(pk, RAK), unit = RD.kpiUnit(pk, RAK), tgt = RD.effTarget(pk, RAK);
      if (tgt == null) return 'No target';
      return SSUB.fmtTarget(tgt, unit, dir, false);
    }
    const tt = kr.trackingType || 'kpi';
    return tt === 'percentage' || tt === 'subkr' ? '100%' : 'No target';
  },
  ownersVM(C, ctx) {
    const P = ctx.P;
    const parents = RD.compositionParents(ctx.modelId, P.composition || []);
    const closed = C.state.ssub_ownClosed || {};
    const flip = (k) => C.setState({ ssub_ownClosed: Object.assign({}, C.state.ssub_ownClosed, { [k]: !(C.state.ssub_ownClosed || {})[k] }) });
    const groups = [], idx = {};
    parents.forEach((pm) => {
      const ppid = SSUB.productIdOf(P, pm);
      if (!idx[ppid]) { idx[ppid] = { pid: ppid, models: [] }; groups.push(idx[ppid]); }
      idx[ppid].models.push(pm);
    });
    const open = !!C.state.ssub_ownOpen;
    return {
      open: open, toggle: () => C.setState({ ssub_ownOpen: !open }),
      count: parents.length, empty: !parents.length,
      emptyText: 'This model isn’t used as a sub-product in any other model yet. When it is, the owner products and their specifications show here.',
      prods: open ? groups.map((g) => {
        const pk = 'OWNP:' + g.pid, pOpen = !closed[pk];
        const pr = SSUB.product(P, g.pid);
        return {
          key: pk, name: SSUB.productName(P, g.pid), div: pr ? SSUB.divName(P, pr.divisionId) : '', hasDiv: !!pr,
          open: pOpen, toggle: () => flip(pk),
          models: pOpen ? g.models.map((pm) => {
            const mk = 'OWNM:' + pm, mOpen = !closed[mk];
            const rd = SSUB.refDoc(C, ctx, pm);
            let rows = [], state = '';
            if (!rd || !rd.doc) state = 'loading';
            else if (rd.failed) state = 'unreachable';
            else {
              const REM = RD.withPortfolio(P, { REF: rd.doc });
              const specs = SSUB.childSpecs(rd.doc, pm);
              if (!specs.length) state = 'none';
              rows = specs.map((kr) => {
                const s = RD.keyResultScore(kr.id, REM);
                return { name: kr.statement || kr.id, target: SSUB.ownerTarget(kr, rd.doc, P), score: F.score(s), scoreCls: 'st ' + F.tone(F.band(s)) };
              });
            }
            return {
              key: mk, name: SSUB.modelName(P, pm), open: mOpen, toggle: () => flip(mk),
              loading: mOpen && state === 'loading', unreachable: mOpen && state === 'unreachable', none: mOpen && state === 'none',
              rows: mOpen ? rows : []
            };
          }) : []
        };
      }) : []
    };
  },
  /* Product KPIs: today's app carries full code for product-level KPIs (add / edit through the generic
     metric editor and saveSub L686-716, delete with its readings L722-727, post a reading L754-758, all
     written to the shared portfolio with persistPortfolio's merge on a 412) but no button reaches it: the
     panel it was written for became Component owners. Calm gives it its panel. The table, the editor and
     the writes are the shared ones (SSPEC.metricTable / SSPEC.openMetric with a product host). */
  prodVM(C, ctx) {
    const P = ctx.P;
    const pid = ctx.model ? ctx.model.productId : null;
    const prod = pid ? SSUB.product(P, pid) : null;
    const none = { show: false, open: false, rows: [], has: false, empty: false, count: 0, canEdit: false, sub: '', emptyText: '' };
    if (!prod || typeof SSPEC === 'undefined' || !SSPEC || typeof SSPEC.metricTable !== 'function') return none;
    const ro = C.isRo();
    const host = { type: 'product', id: pid };
    const mt = SSPEC.metricTable(C, ctx, host, { key: 'prod' });
    const open = !C.state.ssub_prodClosed;
    const nModels = ((P && P.models) || []).filter((m) => m.productId === pid).length;
    const pname = prod.name || prod.id;
    return {
      show: true, open: open, toggle: () => C.setState({ ssub_prodClosed: open }),
      count: mt.rows.length,
      sub: 'Shared by ' + (nModels === 1 ? 'the one model' : 'all ' + nModels + ' models') + ' of ' + pname + '. Specifications and components link to them from Link a metric.',
      canEdit: !ro,
      add: () => { if (!C.guard()) return; SSPEC.openMetric(C, ctx, host, null); },
      rows: open ? mt.rows : [],
      has: open && mt.rows.length > 0, empty: open && !mt.rows.length,
      emptyText: 'No product KPIs yet. Add one to give every model of ' + pname + ' the same target to link to.'
    };
  },
  /* today's crossProductImports + importsPanelHtml (L1457-1489): this product's linked metrics (every model in
     this division) whose source is another product's KPI */
  depsVM(C, ctx) {
    const P = ctx.P, doc = ctx.doc || {}, EM = ctx.em;
    const AK = SSUB.akOf(doc, P);
    const pid = SSUB.productIdOf(P, ctx.modelId);
    const imps = [];
    (doc.kpis || []).forEach((k) => {
      if (k.objectiveId == null || SSUB.productIdOf(P, k.objectiveId) !== pid) return;
      if (RD.linkOf(k, AK).parent == null) return;
      const def = RD.definerOf(k, AK);
      if (!def || def.hostType !== 'product' || def.hostId === pid) return;
      imps.push({ k: k, def: def });
    });
    const groups = [], idx = {};
    imps.forEach((im) => {
      const sp = im.def.hostId;
      if (!idx[sp]) {
        const pr = SSUB.product(P, sp);
        idx[sp] = { key: sp, name: SSUB.productName(P, sp), div: pr ? SSUB.divName(P, pr.divisionId) : '', hasDiv: !!pr, rows: [] };
        groups.push(idx[sp]);
      }
      const k = im.k, lk = RD.linkOf(k, AK), unit = RD.kpiUnit(k, AK), dir = RD.kpiDirection(k, AK);
      const bin = im.def.targetType === 'binary';
      const where = k.hostType === 'component'
        ? (((doc.stageGates || []).find((g) => g.id === k.hostId) || {}).name || k.hostId)
        : (((doc.keyResults || []).find((r) => r.id === k.hostId) || {}).statement || k.hostId);
      const cv = RD.effValue(k, AK, EM), s = RD.kpiScoreResolved(k, AK, EM);
      idx[sp].rows.push({
        key: 'dep:' + k.id, where: where, model: SSUB.modelName(P, k.objectiveId),
        metric: RD.kpiName(k, AK) || im.def.id, rel: F.cap(lk.type || 'contribute'),
        value: SSUB.fmtValue(cv, unit, bin), valCls: cv == null ? 'ssub-none' : '',
        target: SSUB.fmtTarget(RD.effTarget(k, AK), unit, dir, bin),
        score: F.score(s), scoreCls: 'st ' + F.tone(F.band(s))
      });
    });
    const open = !C.state.ssub_depClosed;
    return {
      show: imps.length > 0, open: open, toggle: () => C.setState({ ssub_depClosed: open }),
      count: imps.length, groups: open ? groups : [],
      sub: 'Metrics in ' + SSUB.productName(P, pid) + ' that inherit from another product’s KPI'
    };
  }
};

MODS.ssub = {
  state: { ssub_closed: false, ssub_ownOpen: false, ssub_ownClosed: {}, ssub_depClosed: false, ssub_notes: {}, ssub_edit: null, ssub_prodClosed: false },
  vm(C, ctx) {
    const top = C.sheetOf('ssub');
    const out = {
      add: top && top.kind === 'ssub.add' ? SSUB.addSheet(C, ctx, top) : null,
      show: !!ctx.model
    };
    if (!ctx.model) return Object.assign(out, { open: false, hosts: [], empty: true, count: 0, canEdit: false, ow: { open: false, prods: [], empty: true, count: 0 }, dep: { show: false, groups: [] }, prod: { show: false } });
    const ro = C.isRo();
    const hosts = SSUB.hosts(ctx);
    const open = !C.state.ssub_closed;
    const specs = SSUB.specsOf(ctx);
    return Object.assign(out, {
      open: open, toggle: () => C.setState({ ssub_closed: open }),
      count: hosts.length, empty: !hosts.length,
      emptyText: 'None yet. Plug a specific model of another product in as a sub-product. Its specifications import as specification links: they show here but don’t count toward this model’s conformance.',
      sum: hosts.length ? 'Imported specifications are for reference and don’t count toward this model’s conformance.' : '',
      canEdit: !ro, openAdd: () => SSUB.openAdd(C, ctx),
      linkOpts: [{ v: '', label: 'Not linked' }].concat(specs.map((r) => ({ v: r.id, label: r.statement || r.id }))),
      hosts: open ? hosts.map((h) => SSUB.hostVM(C, ctx, h, ro, specs)) : [],
      ow: SSUB.ownersVM(C, ctx),
      dep: SSUB.depsVM(C, ctx),
      prod: SSUB.prodVM(C, ctx)
    });
  }
};
