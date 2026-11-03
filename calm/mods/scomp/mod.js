/* ============================================================================
   scomp: Product spec, Components (inventory spec §8). Sub-products, component
   owners and cross-product dependencies live in mods/ssub.

   Today: product_designer.template.html L1018-1040 (component modal),
   L1661-1686 (panel), L729-743 (delete cascade), L1579-1606 (drag reorder).

   Shared with the specifications panel (mods/sspec, S-core), so every metric
   table and metric editor on the board looks and behaves the same:
     SSPEC.metricTable   the component's specification table (post a reading, edit,
                         unlink, delete, reorder rows, notes), §11
     SSPEC.openMetric    "Add / Edit component specification" (§9: target type, read
                         count, statistic, direction incl. range, target or range,
                         unit, "Gates a product specification", notes)
     SSPEC.openLink      "Link a metric" (§10); SSPEC.openOverride for linked metrics
   Every SSPEC.open* pushes onto the sheet stack when the component sheet is open,
   so closing it returns to the component sheet (today L642-643).

   Public interface (other modules: guard with typeof SCOMP !== 'undefined'):
     SCOMP.openComponent(C, ctx, id)  the component sheet; '' adds a component, a
                                      sub-product host id opens "Edit sub-product"
     SCOMP.score(ctx, id)             component conformance, RD.hostScore('component', id, ctx.em)
     SCOMP.word(tone)                 band words from today's legend: Meets, Marginal, Off target, No data
   ========================================================================== */

const SCOMP = {
  WORD: { ok: 'Meets', warn: 'Marginal', bad: 'Off target', none: 'No data' },
  word(tone) { return SCOMP.WORD[tone] || SCOMP.WORD.none; },
  T(v) { return String(v == null ? '' : v).trim(); },

  /* ---------------------------------------------------------------- lookups */
  akOf(doc, P) { const ks = (doc && doc.kpis) || []; return P && P.kpis && P.kpis.length ? ks.concat(P.kpis) : ks; },
  comps(ctx) { return ((ctx.doc && ctx.doc.stageGates) || []).filter((g) => g.objectiveId === ctx.modelId && !g.refModel); },
  gate(ctx, id) { return ((ctx.doc && ctx.doc.stageGates) || []).find((g) => g.id === id) || null; },
  score(ctx, id) { return RD.hostScore('component', id, ctx.em); },
  hasSspec(fn) { return typeof SSPEC !== 'undefined' && !!SSPEC && typeof SSPEC[fn] === 'function'; },

  /* ------------------------------------------------- shared metric table and sheets */
  table(C, ctx, id, key) {
    if (!SCOMP.hasSspec('metricTable')) return null;
    try { return SSPEC.metricTable(C, ctx, { type: 'component', id: id }, { key: key }) || null; } catch (e) { console.error('[scomp] metric table', e); return null; }
  },
  addSpec(C, ctx, id) {
    if (!C.guard()) return;
    if (SCOMP.hasSspec('openMetric')) { SSPEC.openMetric(C, ctx, { type: 'component', id: id }, null); return; }
    C.toast('Adding a component specification is not available in this build.', 'info');
  },
  link(C, ctx, id) {
    if (!C.guard()) return;
    if (SCOMP.hasSspec('openLink')) { SSPEC.openLink(C, ctx, { type: 'component', id: id }); return; }
    C.toast('Linking a metric is not available in this build.', 'info');
  },

  /* --------------------------------------------------------- component sheet */
  openComponent(C, ctx, id) {
    if (!C.guard()) return;
    const g = id ? SCOMP.gate(ctx, id) : null;
    if (id && !g) return;
    const d = { name: g ? g.name || '' : '', ctype: g ? g.ctype || '' : '', status: g ? g.status || '' : '', notes: g ? g.notes || '' : '' };
    C[C.sheet() ? 'pushSheet' : 'openSheet']('scomp.comp', { id: id || '' }, d);
  },
  compSheet(C, ctx, sh) {
    const id = (sh.data && sh.data.id) || '';
    const g = id ? SCOMP.gate(ctx, id) : null;
    const d = sh.d || {};
    const isAdd = !id, gone = !!id && !g, isSub = !!(g && g.refModel), T = SCOMP.T;
    const fields = isSub ? ['name', 'notes'] : ['name', 'ctype', 'status', 'notes'];
    const dirty = isAdd ? fields.some((k) => T(d[k]) !== '') : (g ? fields.some((k) => T(d[k]) !== T(g[k])) : false);
    const set = (k) => (e) => C.setDraft({ [k]: e && e.target ? e.target.value : e });
    const save = () => SCOMP.saveComp(C, ctx);
    const mt = g && !isSub ? SCOMP.table(C, ctx, g.id, 'sheet') : null;
    const model = ctx.model ? ctx.model.name : '';
    return {
      title: isAdd ? 'Add component' : isSub ? 'Edit sub-product' : 'Edit component',
      sub: isAdd ? 'New component of ' + model : g ? (isSub ? 'Sub-product of ' : 'Component of ') + model : '',
      d: { name: d.name || '', ctype: d.ctype || '', status: d.status || '', notes: d.notes || '' },
      onName: set('name'), onType: set('ctype'), onStatus: set('status'), onNotes: set('notes'),
      onKey: (e) => { if (!e) return; if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); save(); } else if (e.key === 'Escape') C.dismissSheet(e); },
      namePh: isSub ? 'e.g. Tera stack · Tera 25-30-R5' : 'e.g. Membrane Electrode Assembly (MEA)',
      isPlain: !isSub, isSub: isSub, isAdd: isAdd, gone: gone,
      goneText: 'This component was deleted, so there is nothing to save.',
      showSpecs: !!g && !isSub,
      addSpec: () => SCOMP.addSpec(C, ctx, id),
      link: () => SCOMP.link(C, ctx, id),
      mt: mt, hasMt: !!mt,
      saveLabel: isAdd ? 'Add component' : isSub ? 'Save sub-product' : 'Save component',
      saveOff: gone,
      cancelLabel: dirty ? 'Cancel' : 'Close',
      save: save
    };
  },
  saveComp(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'scomp.comp') return;
    const id = (sh.data && sh.data.id) || '';
    const g = id ? SCOMP.gate(ctx, id) : null;
    if (id && !g) { C.sheetErr('This component was deleted, so there is nothing to save.'); return; }
    const d = sh.d || {}, T = SCOMP.T, isSub = !!(g && g.refModel);
    /* today (readSubEditor, L668) stores a blank field as null; the name is not required (the card then shows the id) */
    const vals = { name: T(d.name) || null, notes: T(d.notes) || null };
    if (!isSub) { vals.ctype = T(d.ctype) || null; vals.status = T(d.status) || null; }
    const docKey = ctx.docKey, modelId = ctx.modelId;
    if (!id) {
      let newId = '';
      const ok = C.mutate((D) => {
        const doc = D.spec[docKey];
        if (!doc || !modelId) return false;
        doc.stageGates = doc.stageGates || [];
        newId = RD.allocId('stageGate', modelId, doc.stageGates.map((x) => x.id));
        doc.stageGates.push(Object.assign({ id: newId, objectiveId: modelId }, vals));
      }, { msg: 'Component added. You can add its specifications now.' });
      /* changed: the sheet stays open on the new component so its specifications can be added straight away */
      if (ok) {
        C.setDraft({ name: vals.name || '', ctype: vals.ctype || '', status: vals.status || '', notes: vals.notes || '' });
        /* the new component is saved: its draft is the new baseline, so Escape or the dimmed page close without asking */
        C.setSheetData({ id: newId, d0: JSON.stringify(C.draft()) });
      }
      return;
    }
    const ok = C.mutate((D) => {
      const doc = D.spec[docKey];
      const rec = doc && (doc.stageGates || []).find((x) => x.id === id);
      if (!rec) return false;
      Object.assign(rec, vals);
    }, { msg: isSub ? 'Sub-product saved.' : 'Component saved.' });
    if (ok) C.closeSheet();
  },

  /* ------------------------------------------------- delete and reorder components */
  /* what today's delSub('stageGate') (L729-743) takes with it */
  delImpact(ctx, id) {
    const doc = ctx.doc || {};
    const AK = SCOMP.akOf(doc, ctx.P);
    const kid = {};
    (doc.kpis || []).forEach((k) => { if (k.hostType === 'component' && k.hostId === id) kid[k.id] = 1; });
    const specs = Object.keys(kid).length;
    const reads = (doc.kpiUpdates || []).filter((u) => kid[u.kpiId]).length;
    const linked = (doc.kpis || []).filter((m) => { const p = RD.linkOf(m, AK).parent; return !kid[m.id] && p != null && kid[p]; }).length;
    const gating = (doc.kpis || []).filter((k) => kid[k.id] && k.gates).length;
    return { specs: specs, reads: reads, linked: linked, gating: gating };
  },
  confirmDelete(C, ctx, id) {
    if (!C.guard()) return;
    const g = SCOMP.gate(ctx, id);
    if (!g) return;
    const im = SCOMP.delImpact(ctx, id);
    const name = g.name || g.id;
    const parts = [im.specs ? 'Deletes ' + name + ' with its ' + F.plural(im.specs, 'specification') + (im.reads ? ' and ' + F.plural(im.reads, 'reading') : '') + '.' : 'Deletes ' + name + '. It has no specifications.'];
    if (im.gating) parts.push(im.gating === 1 ? 'One of them gates a product specification; that gate goes too.' : im.gating + ' of them gate product specifications; those gates go too.');
    if (im.linked) parts.push(im.linked === 1 ? 'One metric elsewhere is linked to them: it keeps its current name, unit and target and is unlinked.' : im.linked + ' metrics elsewhere are linked to them: they keep their current name, unit and target and are unlinked.');
    parts.push('This cannot be undone.');
    const docKey = ctx.docKey;
    C.confirm({
      title: 'Delete ' + name + '?', body: parts.join(' '), ok: 'Delete component', danger: true,
      onOk: () => C.mutate((D) => {
        const doc = D.spec[docKey];
        if (!doc || !(doc.stageGates || []).some((x) => x.id === id)) return false;
        const AK = SCOMP.akOf(doc, D.portfolio);
        const kid = {};
        (doc.kpis || []).forEach((k) => { if (k.hostType === 'component' && k.hostId === id) kid[k.id] = 1; });
        (doc.kpis || []).forEach((m) => {
          const p = RD.linkOf(m, AK).parent;
          if (p != null && kid[p] && !kid[m.id]) {
            m.name = RD.kpiName(m, AK); m.direction = RD.kpiDirection(m, AK); m.unit = RD.kpiUnit(m, AK);
            if (m.target == null) m.target = RD.effTarget(m, AK);
            m.linkParent = null; m.linkType = null; delete m.linkPriority;
          }
        });
        doc.kpis = (doc.kpis || []).filter((k) => !kid[k.id]);
        doc.kpiUpdates = (doc.kpiUpdates || []).filter((u) => !kid[u.kpiId]);
        doc.stageGates = doc.stageGates.filter((x) => x.id !== id);
      }, { msg: 'Component deleted.' })
    });
  },
  /* today's reorderWithin (L1583): `fromId` moves to sit before `toId` (or to the end) among this model's plain components */
  reorder(C, ctx, fromId, toId, msg) {
    const docKey = ctx.docKey, modelId = ctx.modelId;
    C.mutate((D) => {
      const doc = D.spec[docKey];
      if (!doc || fromId === toId) return false;
      const isMine = (r) => r.objectiveId === modelId && !r.refModel;
      const arr = doc.stageGates || [];
      const mine = arr.filter(isMine);
      const fi = mine.findIndex((r) => r.id === fromId);
      if (fi < 0) return false;
      const m = mine.splice(fi, 1)[0];
      let ti = toId ? mine.findIndex((r) => r.id === toId) : -1;
      if (ti < 0) ti = mine.length;
      mine.splice(ti, 0, m);
      let i = 0;
      doc.stageGates = arr.map((r) => (isMine(r) ? mine[i++] : r));
    }, { msg: msg || 'Reordered.' });
  },
  /* keyboard alternative to dragging */
  step(C, ctx, id, delta) {
    const comps = SCOMP.comps(ctx);
    const i = comps.findIndex((g) => g.id === id);
    if (i < 0) return;
    if (delta < 0 && i > 0) SCOMP.reorder(C, ctx, id, comps[i - 1].id, 'Component moved up.');
    else if (delta > 0 && i < comps.length - 1) SCOMP.reorder(C, ctx, id, i + 2 < comps.length ? comps[i + 2].id : '', 'Component moved down.');
  },

  /* --------------------------------------------------------------- the card */
  card(C, ctx, g, i, n, ro) {
    const s = SCOMP.score(ctx, g.id);
    const tone = F.band(s);
    const menuId = 'scomp:c:' + g.id;
    const notes = SCOMP.T(g.notes);
    const notesOpen = !!(C.state.scomp_notes || {})[g.id];
    const label = g.name || 'Unnamed component (' + g.id + ')';
    const tag = 'C' + (i + 1);
    const mt = SCOMP.table(C, ctx, g.id, 'page');
    const drag = C._drag && C._drag.kind === 'scomp.comp' ? C._drag : null;
    return {
      id: g.id, tag: tag, name: label, aria: 'Component ' + tag + ', ' + label,
      cls: 'scomp-card dz' + (drag && C.state.scomp_over === g.id && drag.id !== g.id ? ' hot' : '') + (drag && drag.id === g.id ? ' lift' : ''),
      canEdit: !ro, edit: () => SCOMP.openComponent(C, ctx, g.id), editLabel: 'Edit ' + tag + ', ' + label,
      hasType: !!g.ctype, ctype: g.ctype || '', hasStatus: !!g.status, status: g.status || '',
      word: SCOMP.word(tone), score: s == null ? '' : F.score(s), scoreCls: 'st ' + F.tone(tone),
      scoreTitle: 'Conformance to component specifications' + (s == null ? ': no data yet' : ': ' + F.score(s) + ', ' + SCOMP.word(tone).toLowerCase()),
      addSpec: () => SCOMP.addSpec(C, ctx, g.id), addSpecLabel: 'Add a specification to ' + tag,
      link: () => SCOMP.link(C, ctx, g.id), linkLabel: 'Link a metric to ' + tag,
      menuOpen: C.isMenu(menuId), toggleMenu: () => C.toggleMenu(menuId), moreAria: 'More actions for ' + tag,
      canUp: i > 0, canDown: i < n - 1,
      up: () => { C.closeMenus(); SCOMP.step(C, ctx, g.id, -1); },
      down: () => { C.closeMenus(); SCOMP.step(C, ctx, g.id, 1); },
      del: () => SCOMP.confirmDelete(C, ctx, g.id),
      hasNotes: !!notes, notes: notes, notesOpen: notesOpen,
      notesLabel: notesOpen ? 'Hide notes' : 'Notes',
      toggleNotes: () => C.setState({ scomp_notes: Object.assign({}, C.state.scomp_notes, { [g.id]: !notesOpen }) }),
      mt: mt, hasMt: !!mt,
      canDrag: !ro && n > 1, dragLabel: 'Drag ' + tag + ' to reorder',
      dragStart: (e) => {
        C._drag = { kind: 'scomp.comp', id: g.id };
        try { if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', g.id); } } catch (x) { /* some browsers refuse */ }
        C.setState({ scomp_over: '' });
      },
      dragEnd: () => { if (C._drag && C._drag.kind === 'scomp.comp') C._drag = null; C.setState({ scomp_over: '' }); },
      dragOver: (e) => {
        const d = C._drag;
        if (!d || d.kind !== 'scomp.comp') return;
        if (e && e.preventDefault) e.preventDefault();
        try { if (e && e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch (x) { /* ignore */ }
        if (C.state.scomp_over !== g.id) C.setState({ scomp_over: g.id });
      },
      drop: (e) => {
        const d = C._drag;
        if (!d || d.kind !== 'scomp.comp') return;
        if (e && e.preventDefault) e.preventDefault();
        C._drag = null;
        C.setState({ scomp_over: '' });
        if (d.id !== g.id) SCOMP.reorder(C, ctx, d.id, g.id);
      }
    };
  }
};

MODS.scomp = {
  state: { scomp_closed: false, scomp_notes: {}, scomp_over: '' },
  vm(C, ctx) {
    const top = C.sheetOf('scomp');
    const out = { comp: top && top.kind === 'scomp.comp' ? SCOMP.compSheet(C, ctx, top) : null, show: !!ctx.model };
    if (!ctx.model) return Object.assign(out, { open: false, rows: [], empty: true, count: 0, sum: '', canEdit: false, emptyText: '' });
    const ro = C.isRo();
    const comps = SCOMP.comps(ctx);
    const open = !C.state.scomp_closed;
    const conformant = comps.filter((g) => F.band(SCOMP.score(ctx, g.id)) === 'ok').length;
    return Object.assign(out, {
      open: open, toggle: () => C.setState({ scomp_closed: open }),
      count: comps.length,
      sum: comps.length ? conformant + ' of ' + comps.length + ' conformant. Components are scored on their own specifications and don’t count toward the model’s conformance.' : '',
      canEdit: !ro, add: () => SCOMP.openComponent(C, ctx, ''),
      rows: open ? comps.map((g, i) => SCOMP.card(C, ctx, g, i, comps.length, ro)) : [],
      empty: !comps.length,
      emptyText: 'None yet. Components are the parts that must meet specifications to deliver the product specifications.'
    });
  }
};
