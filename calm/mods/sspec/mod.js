/* ============================================================================
   sspec: Product specifications on the Product spec board (spec.md §5–7, §10–11,
   §16–17). Owner: S-core.

   PUBLIC API (other modules call these; signatures are stable):

     SSPEC.metricTable(C, ctx, host, opts) -> view model for one metric table
         host = { type: 'keyResult' | 'component' | 'product', id }
                (audit A4: a product host lists the product-level KPIs of the shared portfolio,
                 no model scope and no reordering, as today's kpiTable('product', pid, null);
                 post / edit / delete / unlink then write the portfolio through ctx.portfolioWrite)
         opts = { key?:     string, unique per placement when the same host's table is drawn
                            twice (e.g. 'sheet' inside a component sheet; default 'page'),
                  emptyText?: string,
                  onEdit?(kpi, C, ctx): what clicking an UNLINKED metric's name does
                            (default: SSPEC.openMetric). Linked metrics always open the
                            override sheet. }
         Render it with the partial:
             <\!--@include mods/sspec/part-metrics.html MT=path.to.vm-->   (drop the backslash)
         Rows: name + badges (linked / imported / defines N / gates), target (override or
         inherited), current, score, post a reading (Enter or Post; Met / Not met for
         binary), "…" menu (edit, unlink, move up / down, delete), drag to reorder within
         the table, notes row. Read-only hides every write control.

     SSPEC.openMetric(C, ctx, host, kpiId)  Add / Edit KPI (spec host) or component
                                            specification (component host; adds "Gates a
                                            product specification" and Notes), or product KPI
                                            (product host, written to the portfolio). kpiId falsy = new.
     SSPEC.openLink(C, ctx, host)           "Link a metric" sheet for a host. host may be
                                            { type, id }, a stage-gate / key-result id, or
                                            a metric id (its host is used).
     SSPEC.openOverride(C, ctx, kpiId)      "Override metric target" for a linked metric.
     SSPEC.openEdit(C, ctx, kpiId)          what clicking a metric name does (override for
                                            linked metrics, otherwise openMetric).
     SSPEC.openSpec(C, ctx, krId)           Add (krId falsy) / Edit specification.
   Every open* pushes onto the sheet stack when a sheet is already open, so closing
   returns to it (e.g. back to a component sheet after a link or override edit).

   Data writes follow the live app (product_designer.template.html line numbers in
   comments): same records, same ids (RD.allocId), same messages.
   ========================================================================== */

const SSPEC_STATS = [['average', 'Average'], ['median', 'Median'], ['stddev', 'Standard deviation'], ['cv', 'Coefficient of variation (CV)'], ['range', 'Range'], ['max', 'Max'], ['min', 'Min']];
const SSPEC_STAT_LABEL = {};
SSPEC_STATS.forEach((s) => { SSPEC_STAT_LABEL[s[0]] = s[1]; });
const SSPEC_REL = [['direct', 'Direct'], ['contribute', 'Contribute'], ['specification', 'Specification']];
const SSPEC_REL_HELP = {
  direct: 'Direct: mirrors the parent’s target and value exactly. No override.',
  contribute: 'Contribute: your reading feeds up to the parent. The target can be overridden.',
  specification: 'Specification: takes the target only. Your value stays here and does not flow up.'
};
/* default link relation by (parent host type > child host type), L1317–1323; fallback contribute */
const SSPEC_LINK_DEFAULTS = {
  'product>component': 'specification', 'product>initiative': 'direct', 'product>keyResult': 'contribute',
  'component>initiative': 'direct', 'component>keyResult': 'contribute',
  'initiative>keyResult': 'contribute', 'initiative>stageGate': 'contribute', 'initiative>task': 'contribute',
  'keyResult>stageGate': 'contribute', 'keyResult>task': 'contribute'
};
const SSPEC_TRACK = [['percentage', '% completion'], ['kpi', 'Single metric'], ['subkr', 'Sub-specifications']];
const SSPEC_TTYPES = [['demonstration', 'Demonstration'], ['statistical', 'Statistical'], ['binary', 'Binary']];
const SSPEC_SUBTYPES = [['percentage', '% completion'], ['demonstration', 'Demonstration'], ['statistical', 'Statistical'], ['binary', 'Binary']];

/* ------------------------------------------------------------ lookups */
function sspecAK(ctx) {
  if (ctx.AK) return ctx.AK;
  const pk = (ctx.P && ctx.P.kpis) || [];
  const dk = (ctx.doc && ctx.doc.kpis) || [];
  return pk.length ? dk.concat(pk) : dk;
}
/* the live app's allKpis() over a data object D (inside C.mutate) */
function sspecAllK(D, docKey) {
  const doc = D.spec[docKey];
  const pk = (D.portfolio && D.portfolio.kpis) || [];
  return pk.length ? doc.kpis.concat(pk) : doc.kpis;
}
function sspecModelById(ctx, id) { return ((ctx.P && ctx.P.models) || []).find((m) => m.id === id) || null; }
function sspecProductIdOf(ctx, modelId) { const m = sspecModelById(ctx, modelId); return m ? m.productId : null; }
function sspecProductName(ctx, id) { const p = ((ctx.P && ctx.P.products) || []).find((x) => x.id === id); return p ? (p.name || p.id) : id; }
function sspecDivOfProduct(ctx, pid) {
  const p = ((ctx.P && ctx.P.products) || []).find((x) => x.id === pid);
  if (!p) return null;
  const d = ((ctx.P && ctx.P.divisions) || []).find((x) => x.id === p.divisionId);
  return d ? (d.name || d.id) : (p.divisionId || null);
}
function sspecSpecName(ctx, id) { const r = ((ctx.doc && ctx.doc.keyResults) || []).find((x) => x.id === id); return r ? (r.statement || r.id) : id; }
function sspecCompName(ctx, id) { const g = ((ctx.doc && ctx.doc.stageGates) || []).find((x) => x.id === id); return g ? (g.name || g.id) : id; }
function sspecInitName(ctx, id) { const i = ((ctx.P && ctx.P.initiatives) || []).find((x) => x.id === id); return i ? i.name : id; }
/* where a metric lives: { kind, name } (L547 hostLabel) */
function sspecHost(ctx, k) {
  if (!k) return { kind: '', name: '' };
  if (k.hostType === 'product') return { kind: 'Product', name: sspecProductName(ctx, k.hostId) };
  if (k.hostType === 'keyResult') return { kind: 'Specification', name: sspecSpecName(ctx, k.hostId) };
  if (k.hostType === 'component') return { kind: 'Component', name: sspecCompName(ctx, k.hostId) };
  if (k.hostType === 'initiative') return { kind: 'Initiative', name: sspecInitName(ctx, k.hostId) };
  return { kind: '', name: String(k.hostId || '') };
}
function sspecHostText(ctx, k) { const h = sspecHost(ctx, k); return h.kind ? h.kind.toLowerCase() + ' ' + h.name : h.name; }
/* "Rated stack power, a product KPI of Tera stack" */
function sspecDefDesc(ctx, def, AK) {
  const h = sspecHost(ctx, def);
  const nm = RD.kpiName(def, AK) || def.id;
  if (def.hostType === 'product') return nm + ', a product KPI of ' + h.name;
  if (def.hostType === 'component') return nm + ', a specification of the component ' + h.name;
  if (def.hostType === 'keyResult') return nm + ', the metric of the specification ' + h.name;
  if (def.hostType === 'initiative') return nm + ', a KPI of the initiative ' + h.name;
  return nm;
}
function sspecIsMember(k, AK) { return RD.linkOf(k, AK).parent != null; }
function sspecChildCount(k, AK) { return RD.childrenOf(k.id, AK).length; }
function sspecDefinesLinks(k, AK) { return RD.linkOf(k, AK).parent == null && sspecChildCount(k, AK) > 0; }
/* provenance: source product name when the metric inherits from ANOTHER product's KPI (L1330) */
function sspecImportSource(ctx, k, AK) {
  const def = RD.definerOf(k, AK);
  if (!def || def.hostType !== 'product') return null;
  const myProd = k.objectiveId ? sspecProductIdOf(ctx, k.objectiveId) : (k.hostType === 'product' ? k.hostId : null);
  return def.hostId !== myProd ? sspecProductName(ctx, def.hostId) : null;
}
function sspecLinkDefaultFor(parent, hostType, thisProd) {
  if (parent && parent.hostType === 'product' && thisProd && parent.hostId !== thisProd) return 'specification';
  return SSPEC_LINK_DEFAULTS[(parent ? parent.hostType : '') + '>' + hostType] || 'contribute';
}

/* ------------------------------------------------------------ formatting */
function sspecFmtTarget(t, unit) {
  if (t == null) return '—';
  if (typeof t === 'object') return F.n(t.lo) + '–' + F.u(t.hi, unit);
  return F.u(t, unit);
}
/* target with its direction: "≥ 25 kW", "≤ 1%", "6–10 mΩ·cm²", "Pass" */
function sspecTargetText(t, dir, unit, binary) {
  if (binary) return 'Pass';
  if (t == null) return '—';
  if (typeof t === 'object') return sspecFmtTarget(t, unit);
  return (dir === 'down' ? '≤ ' : dir === 'up' ? '≥ ' : '') + F.u(t, unit);
}
function sspecDirWord(dir, binary) { return binary ? 'Pass or fail' : dir === 'down' ? 'At most' : dir === 'up' ? 'At least' : dir === 'range' ? 'In range' : '—'; }
function sspecScoreCls(s) { return 'st ' + F.tone(F.band(s)); }
function sspecBandText(s) { return F.bandWord(F.band(s)); }
function sspecClampPct(v) { v = Number(v); return isNaN(v) ? 0 : Math.max(0, Math.min(100, v)); }
/* a typed number or null for blank; undefined when the text is not a number */
function sspecNumField(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return null;
  const v = K.num(t);
  return v == null ? undefined : v;
}
/* readings textarea: commas, spaces, semicolons or newlines (L1048). Fixed: blank pieces are
   skipped (today a leading space or trailing comma adds a phantom 0 reading). */
function sspecParseNums(str) {
  return String(str || '').split(/[\s,;]+/).filter((x) => x !== '').map((x) => Number(x)).filter((x) => !isNaN(x));
}
function sspecStatPreview(statistic, readings) {
  const nums = sspecParseNums(readings);
  if (!nums.length) return 'No readings yet.';
  const v = RD.computeStat(statistic || 'average', nums);
  return (SSPEC_STAT_LABEL[statistic || 'average'] || 'Average') + ': ' + (v == null ? '—' : String(Math.round(v * 1000) / 1000)) + ' from ' + F.plural(nums.length, 'reading');
}

/* ------------------------------------------------------------ sheets */
function sspecOpen(C, kind, data, draft) {
  if (C.sheet()) C.pushSheet(kind, data, draft); else C.openSheet(kind, data, draft);
}
/* accept { type, id } or a host / metric id */
function sspecNormHost(C, ctx, host, maybeId) {
  if (host && typeof host === 'object') return { type: host.type === 'stageGate' ? 'component' : host.type, id: host.id };
  if (typeof host === 'string' && maybeId) return { type: host === 'stageGate' ? 'component' : host, id: maybeId };
  const id = String(host || '');
  const doc = ctx.doc || {};
  if ((doc.stageGates || []).some((g) => g.id === id)) return { type: 'component', id };
  if ((doc.keyResults || []).some((r) => r.id === id)) return { type: 'keyResult', id };
  const k = (doc.kpis || []).find((x) => x.id === id);
  if (k) return { type: k.hostType, id: k.hostId };
  return { type: 'component', id };
}
function sspecKeyNav(C, save) {
  return (e) => {
    if (!e) return;
    if (e.key === 'Escape') { C.dismissSheet(e); return; }
    if (e.key === 'Enter' && save) { if (e.preventDefault) e.preventDefault(); save(); }
  };
}

/* ------------------------------------------------------------ data helpers */
/* move one of `mine` (filter) to position `toIdx` within the filtered list; other rows keep their slots (L1583) */
function sspecReorder(arr, isMine, fromId, toId, after) {
  const mine = arr.filter(isMine);
  const fi = mine.findIndex((r) => r.id === fromId);
  if (fi < 0) return null;
  const m = mine.splice(fi, 1)[0];
  let ti = mine.findIndex((r) => r.id === toId);
  if (ti < 0) ti = mine.length; else if (after) ti += 1;
  mine.splice(ti, 0, m);
  let i = 0;
  return arr.map((r) => (isMine(r) ? mine[i++] : r));
}
/* copy what a member inherits onto it and cut the link (L737 / L1394) */
function sspecMaterialize(m, AK) {
  m.name = RD.kpiName(m, AK); m.direction = RD.kpiDirection(m, AK); m.unit = RD.kpiUnit(m, AK);
  if (m.target == null) m.target = RD.effTarget(m, AK);
  m.linkParent = null; m.linkType = null; delete m.linkPriority;
}
/* product-level KPIs live in the shared portfolio, not in the SPEC document (today L686–727, L750–759) */
function sspecIsProductKpi(ctx, kpiId) { return (((ctx.P && ctx.P.kpis) || [])).some((k) => k.id === kpiId); }
/* write the portfolio the way today's persistPortfolio does (If-Match, merge on a 412), through the shell */
function sspecPortfolioWrite(C, ctx, apply, msg) {
  if (typeof ctx.portfolioWrite === 'function') return ctx.portfolioWrite(apply, msg);
  return C.mutate(apply, { msg });
}

/* ============================================================ METRIC TABLE */
function sspecMetricTable(C, ctx, host, opts) {
  opts = opts || {};
  host = sspecNormHost(C, ctx, host);
  const AK = sspecAK(ctx);
  const em = ctx.em;
  const ro = C.isRo();
  /* product KPIs are shared by every model: no model scope, and (as today) no reordering */
  const isProd = host.type === 'product';
  const objScope = isProd ? null : (ctx.modelId || null);
  const tkey = host.type + '|' + host.id + '|' + (objScope || '');
  const pkey = tkey + '|' + (opts.key || 'page');
  const rows0 = AK.filter((k) => (k.objectiveId || null) === objScope && k.hostType === host.type && k.hostId === host.id);
  const S = C.state;
  const reads = S.sspec_reads || {};
  const notesOpen = S.sspec_notes || {};
  const hot = S.sspec_hot || '';
  const drag = C._drag && C._drag.kind === 'sspec.row' ? C._drag : null;
  const doc = ctx.doc;
  const rows = rows0.map((k, i) => {
    const name = RD.kpiName(k, AK) || '';
    const dir = RD.kpiDirection(k, AK);
    const unit = RD.kpiUnit(k, AK);
    const def = RD.definerOf(k, AK);
    const binary = !!def && def.targetType === 'binary';
    const tgt = RD.effTarget(k, AK);
    const cv = RD.effValue(k, AK, em);
    const parts = RD.kpiScoreParts(k, AK, em);
    const s = parts.score;
    const member = sspecIsMember(k, AK);
    const defines = !member && sspecDefinesLinks(k, AK);
    const badges = [];
    if (member) {
      const imp = sspecImportSource(ctx, k, AK);
      const from = sspecHost(ctx, def);
      if (imp) badges.push({ text: 'Imported from ' + imp, title: 'Inherits from the product KPI ' + (def.name || def.id) + ' on ' + imp });
      else badges.push({ text: 'Linked', title: 'Inherits from ' + (from.kind ? from.kind.toLowerCase() + ' ' : '') + from.name + ' (' + RD.linkOf(k, AK).type + ')' });
    } else if (defines) {
      const n = sspecChildCount(k, AK);
      badges.push({ text: 'Defines ' + F.plural(n, 'link'), title: n === 1 ? 'Another metric links to this one' : n + ' metrics link to this one' });
    }
    if (k.gates) {
      const gk = (doc.keyResults || []).find((r) => r.id === k.gates);
      badges.push({ text: 'Gates ' + (gk ? (gk.statement || gk.id) : k.gates), title: 'A gate for a product specification: a different measure of the same requirement. It keeps its own target and readings and does not count in that specification’s score.' });
    }
    const rk = pkey + '|' + k.id;
    const readVal = reads[rk] != null ? reads[rk] : '';
    const menuId = 'sspec.m.' + pkey + '|' + k.id;
    const sample = parts.expected != null && cv != null ? parts.n + ' of ' + parts.expected + ' readings' : '';
    const canDrag = !ro && !isProd && rows0.length > 1;
    const isHot = !!drag && drag.table === tkey && hot === 'row:' + pkey + '|' + k.id && drag.id !== k.id;
    const lifted = !!drag && drag.table === tkey && drag.id === k.id;
    const nReads = ((isProd ? ctx.P && ctx.P.kpiUpdates : doc.kpiUpdates) || []).filter((u) => u.kpiId === k.id).length;
    const edit = () => {
      C.closeMenus();
      if (member) SSPEC.openOverride(C, ctx, k.id);
      else if (opts.onEdit) opts.onEdit(k, C, ctx);
      else SSPEC.openMetric(C, ctx, host, k.id);
    };
    const move = (delta) => () => {
      C.closeMenus();
      const j = i + delta;
      if (j < 0 || j >= rows0.length) return;
      sspecMoveRow(C, ctx, tkey, k.id, rows0[j].id, delta > 0);
    };
    return {
      id: k.id,
      name: name || '(unnamed)',
      canOpen: !ro,
      openTitle: member ? 'Edit link' : isProd ? 'Edit product KPI' : 'Edit metric',
      open: edit,
      badges, hasBadges: badges.length > 0,
      target: sspecTargetText(tgt, dir, unit, binary),
      targetTitle: sspecDirWord(dir, binary),
      tgtNote: member ? (k.target != null ? 'Override' : 'Inherited') : '',
      hasTgtNote: member,
      current: cv == null ? 'No reading' : binary ? (Number(cv) >= 1 ? 'Met' : 'Not met') : F.u(cv, unit),
      currentTitle: cv == null ? 'No reading yet' : String(cv) + (unit ? ' ' + unit : ''),
      currentCls: cv == null ? 'muted' : 'num',
      sample, hasSample: !!sample,
      sampleCls: parts.partial ? 'sub tx-warn' : 'sub',
      score: F.score(s),
      scoreCls: sspecScoreCls(s),
      scoreTitle: s == null ? 'No score yet' : sspecBandText(s) + (parts.partial ? '. Discounted for a short sample: ' + F.score(parts.raw) + ' on the readings so far' : ''),
      isBinary: binary, notBinary: !binary,
      read: readVal,
      readLabel: 'New reading for ' + (name || 'this metric') + (unit ? ', in ' + unit : ''),
      onRead: (e) => C.setState({ sspec_reads: Object.assign({}, C.state.sspec_reads, { [rk]: e && e.target ? e.target.value : '' }) }),
      onReadKey: (e) => {
        if (!e) return;
        if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); sspecPost(C, ctx, k.id, (C.state.sspec_reads || {})[rk], rk); }
        else if (e.key === 'Escape' && String((C.state.sspec_reads || {})[rk] || '') !== '') {
          /* the first Escape clears the typed value; inside a sheet the next one closes the sheet */
          if (e.preventDefault) e.preventDefault();
          C.setState({ sspec_reads: Object.assign({}, C.state.sspec_reads, { [rk]: '' }) });
        }
      },
      post: () => sspecPost(C, ctx, k.id, (C.state.sspec_reads || {})[rk], rk),
      postMet: () => sspecPost(C, ctx, k.id, '1', rk),
      postNotMet: () => sspecPost(C, ctx, k.id, '0', rk),
      metLabel: 'Post Met for ' + (name || 'this metric'),
      notMetLabel: 'Post Not met for ' + (name || 'this metric'),
      menuId,
      menuOpen: C.isMenu(menuId),
      menuLabel: 'More actions for ' + (name || 'this metric'),
      toggleMenu: () => C.toggleMenu(menuId),
      editLabel: member ? 'Edit link' : isProd ? 'Edit product KPI' : 'Edit metric',
      isMember: member,
      unlink: () => { C.closeMenus(); sspecUnlink(C, ctx, k.id); },
      canUp: !isProd && i > 0, canDown: !isProd && i < rows0.length - 1,
      up: move(-1), down: move(1),
      del: () => { C.closeMenus(); sspecDeleteMetric(C, ctx, k.id); },
      delLabel: isProd ? 'Delete product KPI' : 'Delete metric',
      readings: nReads,
      canDrag,
      dragLabel: 'Drag ' + (name || 'this metric') + ' to reorder',
      dragStart: (e) => {
        C._drag = { kind: 'sspec.row', table: tkey, id: k.id };
        try { if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k.id); } } catch (x) { /* ignore */ }
        if (e && e.stopPropagation) e.stopPropagation();
        C.setState({ sspec_hot: '' });
      },
      dragEnd: () => { C._drag = null; C.setState({ sspec_hot: '' }); },
      dragOver: (e) => {
        const d = C._drag;
        if (!d || d.kind !== 'sspec.row' || d.table !== tkey) return;
        if (e && e.preventDefault) e.preventDefault();
        try { if (e && e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch (x) { /* ignore */ }
        const h = 'row:' + pkey + '|' + k.id;
        if (C.state.sspec_hot !== h) C.setState({ sspec_hot: h });
      },
      drop: (e) => {
        const d = C._drag;
        if (!d || d.kind !== 'sspec.row' || d.table !== tkey) return;
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        C._drag = null;
        C.setState({ sspec_hot: '' });
        if (d.id !== k.id) sspecMoveRow(C, ctx, tkey, d.id, k.id, false);
      },
      rowCls: 'hov' + (isHot ? ' sspec-drop' : '') + (lifted ? ' lift' : ''),
      hasNotes: !!String(k.notes || '').trim(),
      notes: String(k.notes || '').trim(),
      notesOpen: !!notesOpen[k.id],
      notesLabel: notesOpen[k.id] ? 'Hide notes' : 'Notes',
      toggleNotes: () => C.setState({ sspec_notes: Object.assign({}, C.state.sspec_notes, { [k.id]: !(C.state.sspec_notes || {})[k.id] }) })
    };
  });
  return {
    key: pkey,
    rows,
    has: rows.length > 0,
    empty: !rows.length,
    emptyText: opts.emptyText || 'No metrics yet. Add or link a measurement.',
    canEdit: !ro,
    cols: ro ? 4 : 6
  };
}

/* post a reading (L750): UPD-<kpi>-<ms>, value, timestamp, empty note */
function sspecPost(C, ctx, kpiId, raw, rk) {
  if (!C.guard()) return;
  const t = String(raw == null ? '' : raw).trim();
  if (!t) { C.toast('Enter a value to post.', 'err'); return; }
  const v = K.num(t);
  if (v == null) { C.toast('Use a number for the reading, like 1.85.', 'err'); return; }
  const docKey = ctx.docKey;
  const add = (store) => {
    let ts = C.now();
    /* keep the newest reading unambiguous when two posts land in the same millisecond */
    (store.kpiUpdates || []).forEach((u) => { if (u.kpiId === kpiId && u.timestamp >= ts) ts = u.timestamp + 1; });
    store.kpiUpdates = store.kpiUpdates || [];
    store.kpiUpdates.push({ id: 'UPD-' + kpiId + '-' + ts, kpiId, value: v, timestamp: ts, note: '' });
  };
  let ok;
  if (sspecIsProductKpi(ctx, kpiId)) {
    /* a product KPI's reading goes to the shared portfolio (today L754–758) */
    ok = sspecPortfolioWrite(C, ctx, (D) => {
      if (!((D.portfolio && D.portfolio.kpis) || []).some((k) => k.id === kpiId)) return false;
      add(D.portfolio);
    }, 'Reading posted.');
  } else {
    ok = C.mutate((D) => {
      const doc = D.spec[docKey];
      if (!doc.kpis.some((k) => k.id === kpiId)) return false;
      add(doc);
    }, { msg: 'Reading posted.' });
  }
  if (ok && rk) C.setState({ sspec_reads: Object.assign({}, C.state.sspec_reads, { [rk]: '' }) });
}

/* unlink (L1394): copy the inherited identity and target onto the metric, then cut the link */
function sspecUnlink(C, ctx, kpiId) {
  const docKey = ctx.docKey;
  const apply = (D) => {
    const AK = sspecAllK(D, docKey);
    const m = D.spec[docKey].kpis.find((k) => k.id === kpiId) || ((D.portfolio && D.portfolio.kpis) || []).find((k) => k.id === kpiId);
    if (!m) return false;
    sspecMaterialize(m, AK);
    m.groupId = null; m.isDefiner = true;
  };
  if (sspecIsProductKpi(ctx, kpiId)) sspecPortfolioWrite(C, ctx, apply, 'Unlinked.');
  else C.mutate(apply, { msg: 'Unlinked.' });
}

/* delete one metric (L718): blocked while other metrics link to it */
function sspecDeleteMetric(C, ctx, kpiId) {
  if (!C.guard()) return;
  const AK = sspecAK(ctx);
  const isProd = sspecIsProductKpi(ctx, kpiId);
  const k = AK.find((x) => x.id === kpiId);
  if (!k) return;
  if (sspecDefinesLinks(k, AK)) { C.toast('This metric defines a linked group — unlink its members first.', 'err'); return; }
  const name = RD.kpiName(k, AK) || '(unnamed)';
  const n = ((isProd ? ctx.P.kpiUpdates : ctx.doc.kpiUpdates) || []).filter((u) => u.kpiId === kpiId).length;
  const kids = RD.childrenOf(kpiId, AK).length;
  const docKey = ctx.docKey;
  const apply = (D) => {
    const doc = D.spec[docKey];
    const P = D.portfolio || {};
    const AK2 = sspecAllK(D, docKey);
    const home = isProd ? (P.kpis || []) : doc.kpis;
    if (!home.some((x) => x.id === kpiId)) return false;
    /* fixed: a linked metric under this one would be left pointing at a deleted id */
    (isProd ? AK2 : doc.kpis).forEach((m) => { if (m.id !== kpiId && m.linkParent === kpiId) sspecMaterialize(m, AK2); });
    if (isProd) {
      /* today's product-KPI delete (L722–727): the KPI and its readings leave the portfolio */
      P.kpis = (P.kpis || []).filter((x) => x.id !== kpiId);
      P.kpiUpdates = (P.kpiUpdates || []).filter((u) => u.kpiId !== kpiId);
    } else {
      doc.kpis = doc.kpis.filter((x) => x.id !== kpiId);
      doc.kpiUpdates = doc.kpiUpdates.filter((u) => u.kpiId !== kpiId);
    }
  };
  C.confirm({
    title: 'Delete “' + name + '”?',
    body: (n ? 'Its ' + F.plural(n, 'reading') + ' ' + (n === 1 ? 'is' : 'are') + ' deleted too.' : 'It has no readings.') +
      (kids ? ' ' + F.plural(kids, 'metric') + ' linked to it ' + (kids === 1 ? 'keeps its' : 'keep their') + ' current target and ' + (kids === 1 ? 'is' : 'are') + ' unlinked.' : '') +
      (isProd ? ' Every model of this product loses it.' : '') +
      ' This cannot be undone.',
    ok: isProd ? 'Delete product KPI' : 'Delete metric', danger: true,
    onOk: () => (isProd ? sspecPortfolioWrite(C, ctx, apply, 'Product KPI deleted.') : C.mutate(apply, { msg: 'Metric deleted.' }))
  });
}

/* reorder a metric within its own table (L1608) */
function sspecMoveRow(C, ctx, tkey, fromId, toId, after) {
  const p = tkey.split('|');
  const hostType = p[0], hostId = p[1], objScope = p[2] === '' ? null : p[2];
  const docKey = ctx.docKey;
  C.mutate((D) => {
    const doc = D.spec[docKey];
    const isMine = (k) => (k.objectiveId || null) === objScope && k.hostType === hostType && k.hostId === hostId;
    const next = sspecReorder(doc.kpis, isMine, fromId, toId, after);
    if (!next) return false;
    doc.kpis = next;
  }, { msg: 'Reordered.' });
}

/* ============================================================ METRIC EDITOR (Add / Edit KPI, component specification) */
function sspecOpenMetric(C, ctx, host, kpiId) {
  host = sspecNormHost(C, ctx, host);
  /* a product KPI lives in the portfolio; everything else in this division's SPEC document */
  const pk = kpiId ? (sspecAK(ctx).find((k) => k.id === kpiId) || null) : null;
  /* fixed: a range metric saved with one end missing (direction range, no target) reopens as a range;
     today it reopens as "At least" and the next save quietly turns it into an up metric */
  const isRange = !!(pk && pk.direction === 'range');
  const hasRange = !!(isRange && pk.target && typeof pk.target === 'object');
  const d = {
    name: pk ? (pk.name || '') : '',
    type: pk ? (pk.targetType || 'demonstration') : 'demonstration',
    dir: isRange ? 'range' : (pk && pk.direction === 'down' ? 'decrease' : 'increase'),
    target: pk && pk.target != null && typeof pk.target !== 'object' ? String(pk.target) : '',
    lo: hasRange ? String(pk.target.lo) : '',
    hi: hasRange ? String(pk.target.hi) : '',
    unit: pk && pk.unit ? pk.unit : '',
    statistic: pk && pk.statistic ? pk.statistic : 'average',
    readCount: pk && pk.readCount != null && pk.readCount !== '' ? String(pk.readCount) : '',
    gates: pk && pk.gates ? pk.gates : '',
    notes: pk && pk.notes ? pk.notes : ''
  };
  sspecOpen(C, 'sspec.metric', { hostType: host.type, hostId: host.id, kpiId: pk ? pk.id : '' }, d);
}

function sspecSaveMetric(C, ctx) {
  const sh = C.sheet();
  if (!sh || sh.kind !== 'sspec.metric') return;
  const d = sh.d, data = sh.data;
  const isKr = data.hostType === 'keyResult', isProd = data.hostType === 'product';
  const name = String(d.name || '').trim();
  if (!name) { C.sheetErr(isKr || isProd ? 'Give the KPI a name.' : 'Give the specification a name.'); return; }
  let target = null, lo = null, hi = null, rc = '';
  if (d.type !== 'binary') {
    if (d.dir === 'range') {
      lo = sspecNumField(d.lo); hi = sspecNumField(d.hi);
      if (lo === undefined || hi === undefined) { C.sheetErr('Use numbers for the range, like 6 and 10.'); return; }
      if (lo != null && hi != null && lo > hi) { C.sheetErr('The range low must not be above the range high.'); return; }
    } else {
      target = sspecNumField(d.target);
      if (target === undefined) { C.sheetErr('Use a number for the target, like 0.25.'); return; }
    }
    if (d.type === 'statistical') {
      const r = sspecNumField(d.readCount);
      if (r === undefined || (r != null && (r < 1 || Math.round(r) !== r))) { C.sheetErr('Read count is a whole number of readings, like 10.'); return; }
      rc = r == null ? '' : r;
    }
  }
  const docKey = ctx.docKey, modelId = ctx.modelId;
  const o = {};
  const write = (D) => {
    const doc = D.spec[docKey];
    let pk;
    if (isProd) {
      /* today's saveSub for a product KPI (L699–714): it lives in the shared portfolio, no model scope */
      const P = D.portfolio;
      P.kpis = P.kpis || [];
      pk = data.kpiId ? P.kpis.find((k) => k.id === data.kpiId) : null;
      if (data.kpiId && !pk) return false;
      if (!pk) {
        const id = RD.allocId('kpi', data.hostId, sspecAllK(D, docKey).map((x) => x.id));
        pk = { id, objectiveId: null, hostType: 'product', hostId: data.hostId, linkParent: null };
        P.kpis.push(pk);
      }
    } else {
      pk = data.kpiId ? doc.kpis.find((k) => k.id === data.kpiId) : null;
      if (!pk) {
        const id = RD.allocId('kpi', modelId, sspecAllK(D, docKey).map((x) => x.id));
        pk = { id, objectiveId: modelId, hostType: data.hostType, hostId: data.hostId, linkParent: null };
        doc.kpis.push(pk);
      }
    }
    pk.name = name;
    pk.targetType = d.type;
    const n = String(d.notes == null ? '' : d.notes).trim();
    if (n) pk.notes = n; else delete pk.notes;
    if (d.type === 'binary') { pk.direction = null; pk.target = null; pk.unit = null; delete pk.statistic; delete pk.readCount; }
    else {
      if (d.dir === 'range') { pk.direction = 'range'; pk.target = lo != null && hi != null ? { lo, hi } : null; }
      else { pk.direction = d.dir === 'decrease' ? 'down' : 'up'; pk.target = target; }
      pk.unit = String(d.unit || '').trim() || null;
      if (d.type === 'statistical') { pk.statistic = d.statistic || 'average'; pk.readCount = rc; } else { delete pk.statistic; delete pk.readCount; }
    }
    if (!isKr && !isProd && d.gates && doc.keyResults.some((r) => r.id === d.gates)) pk.gates = d.gates; else delete pk.gates;
    const gk = pk.gates ? doc.keyResults.find((r) => r.id === pk.gates) : null;
    o.msg = gk ? 'Gating spec saved — gates “' + (gk.statement || gk.id) + '”.' : (isProd ? 'Product KPI saved.' : isKr ? 'KPI saved.' : 'Component specification saved.');
  };
  /* a product KPI is a portfolio write (If-Match, merged on a 412), like today's persistPortfolio */
  const ok = isProd ? sspecPortfolioWrite(C, ctx, write, 'Product KPI saved.') : C.mutate(write, o);
  if (ok) C.closeSheet();
}

function sspecMetricSheetVM(C, ctx, sh) {
  const d = sh.d, data = sh.data;
  const isKr = data.hostType === 'keyResult', isProd = data.hostType === 'product';
  const noun = isProd ? 'product KPI' : isKr ? 'KPI' : 'component specification';
  const isStat = d.type === 'statistical', isBin = d.type === 'binary', isRange = d.dir === 'range';
  const specs = (ctx.specs || (ctx.doc.keyResults || []).filter((r) => r.objectiveId === ctx.modelId));
  const save = () => sspecSaveMetric(C, ctx);
  const hostName = isProd ? sspecProductName(ctx, data.hostId) : isKr ? sspecSpecName(ctx, data.hostId) : sspecCompName(ctx, data.hostId);
  return {
    title: (data.kpiId ? 'Edit ' : 'Add ') + noun,
    sub: isProd ? 'On product ' + hostName + ', shared by all its models' : (isKr ? 'On specification ' : 'On component ') + hostName,
    name: d.name, onName: C.bindDraft('name'),
    namePh: isProd ? 'e.g. Rated stack power' : 'e.g. Cathode Pt loading',
    types: SSPEC_TTYPES.map((t) => ({ label: t[1], on: d.type === t[0] ? 'true' : 'false', pick: () => C.setDraft({ type: t[0] }) })),
    isStat, notBin: !isBin, isBin,
    readCount: d.readCount, onReadCount: C.bindDraft('readCount'),
    stats: SSPEC_STATS.map((s) => ({ v: s[0], label: s[1] })),
    statistic: d.statistic, onStatistic: C.bindDraft('statistic'),
    dirs: [['increase', 'At least'], ['decrease', 'At most'], ['range', 'Range']].map((x) => ({ label: x[1], on: d.dir === x[0] ? 'true' : 'false', pick: () => C.setDraft({ dir: x[0] }) })),
    showTarget: !isBin && !isRange, showRange: !isBin && isRange,
    target: d.target, onTarget: C.bindDraft('target'),
    lo: d.lo, onLo: C.bindDraft('lo'), hi: d.hi, onHi: C.bindDraft('hi'),
    unit: d.unit, onUnit: C.bindDraft('unit'),
    isComp: !isKr && !isProd,
    gateOpts: [{ v: '', label: 'None (standalone)' }].concat(specs.map((r) => ({ v: r.id, label: r.statement || r.id }))),
    gates: d.gates || '', onGates: C.bindDraft('gates'),
    notes: d.notes, onNotes: C.bindDraft('notes'),
    readHint: (isProd
      ? 'Readings are posted from the Product KPIs table. Specifications and components of any model can link to this KPI; their readings feed it unless the link is a specification link.'
      : 'Readings are posted from the ' + (isKr ? 'specification’s metric table' : 'component’s specification table') + '.') +
      (isStat ? ' A statistical target uses every reading posted. Read count is the expected sample size: the score is discounted until that many readings are in.' : ''),
    saveLabel: (data.kpiId ? 'Update ' : 'Save ') + (isProd ? 'product KPI' : isKr ? 'KPI' : 'specification'),
    save,
    onKey: sspecKeyNav(C, save),
    cancel: () => C.closeSheet()
  };
}

/* ============================================================ LINK A METRIC (L1341–1430) */
function sspecLinkCandidates(ctx, host) {
  const O = host.type === 'product' ? null : ctx.modelId;
  const AK = sspecAK(ctx);
  const divInits = {};
  ((ctx.P && ctx.P.objectives) || []).forEach((o) => { if (o.divisionId === ctx.divId && o.initiativeId) divInits[o.initiativeId] = 1; });
  const seen = {}, out = [];
  AK.forEach((k) => {
    const inScope = (k.objectiveId === O) || k.hostType === 'product' || (k.hostType === 'initiative' && divInits[k.hostId]);
    if (!inScope) return;
    const root = RD.rootOf(k, AK);
    if (seen[root.id] || root.hostId === host.id) return;
    seen[root.id] = 1;
    out.push(root);
  });
  /* specifications with no measurement metric yet: offered; the anchor metric is made on link */
  if (host.type !== 'product' && O) {
    ((ctx.doc && ctx.doc.keyResults) || []).filter((r) => r.objectiveId === O && !(host.type === 'keyResult' && r.id === host.id)).forEach((kr) => {
      /* fixed: today a specification is also offered as a link target for itself */
      const hasKpi = AK.some((k) => k.hostType === 'keyResult' && k.hostId === kr.id && RD.linkOf(k, AK).parent == null);
      if (!hasKpi) out.push({ id: 'SPECREF-' + kr.id, hostType: 'keyResult', hostId: kr.id, name: kr.statement || kr.id, direction: 'up', target: null, unit: null, specRef: true });
    });
  }
  return out;
}
function sspecLinkGroups(ctx, host, cands) {
  const thisProd = host.type === 'product' ? host.id : sspecProductIdOf(ctx, ctx.modelId);
  const mine = [], specs = [], inits = [], others = {}, order = [];
  cands.forEach((d) => {
    if (d.hostType === 'product' && d.hostId !== thisProd) { if (!others[d.hostId]) { others[d.hostId] = []; order.push(d.hostId); } others[d.hostId].push(d); }
    else if (d.hostType === 'initiative') inits.push(d);
    else if (d.hostType === 'keyResult') specs.push(d);
    else mine.push(d);
  });
  const groups = [];
  if (specs.length) groups.push({ label: 'Product specifications', items: specs });
  if (mine.length) groups.push({ label: 'This product’s metrics', items: mine });
  if (inits.length) groups.push({ label: 'Division initiatives', items: inits });
  order.forEach((pid) => { const dv = sspecDivOfProduct(ctx, pid); groups.push({ label: 'Import from ' + sspecProductName(ctx, pid) + (dv ? ' (' + dv + ')' : ''), items: others[pid] }); });
  const first = specs[0] || mine[0] || inits[0] || (order.length ? others[order[0]][0] : null) || cands[0] || null;
  return { groups, first, thisProd };
}
function sspecOpenLink(C, ctx, host, maybeId) {
  host = sspecNormHost(C, ctx, host, maybeId);
  const g = sspecLinkGroups(ctx, host, sspecLinkCandidates(ctx, host));
  const rel = g.first ? sspecLinkDefaultFor(g.first, host.type, g.thisProd) : 'contribute';
  sspecOpen(C, 'sspec.link', { hostType: host.type, hostId: host.id }, { pick: g.first ? g.first.id : '', rel });
}
/* make the anchor metric on a specification that has none (L1368) */
function sspecMaterializeSpecKpi(D, docKey, modelId, krId, derive) {
  const doc = D.spec[docKey];
  const kr = doc.keyResults.find((r) => r.id === krId);
  if (!kr) return null;
  const AK = sspecAllK(D, docKey);
  let pk = doc.kpis.find((k) => k.hostType === 'keyResult' && k.hostId === krId && RD.linkOf(k, AK).parent == null);
  if (!pk) {
    const id = RD.allocId('kpi', modelId, AK.map((x) => x.id));
    pk = { id, objectiveId: modelId, hostType: 'keyResult', hostId: krId, linkParent: null, name: kr.statement || krId, direction: 'up', target: null, unit: null };
    doc.kpis.push(pk);
  }
  if (derive && kr.trackingType !== 'kpi') { kr.trackingType = 'kpi'; delete kr.progress; delete kr.subKrs; }
  return pk.id;
}
function sspecMakeLink(C, ctx) {
  const sh = C.sheet();
  if (!sh || sh.kind !== 'sspec.link') return;
  const hostType = sh.data.hostType, hostId = sh.data.hostId;
  const parentId = sh.d.pick, linkType = sh.d.rel;
  if (!parentId) { C.sheetErr('Choose the metric to link to.'); return; }
  const docKey = ctx.docKey, modelId = ctx.modelId;
  const o = {};
  let refused = false;
  const ok = C.mutate((D) => {
    const doc = D.spec[docKey];
    const parent0 = sspecAllK(D, docKey).find((k) => k.id === parentId);
    let synthKr = null, realParentId = parentId;
    if (!parent0 && String(parentId).indexOf('SPECREF-') === 0) synthKr = String(parentId).slice('SPECREF-'.length);
    if (!parent0 && !synthKr) return false;
    const thisProd = hostType === 'product' ? hostId : sspecProductIdOf(ctx, modelId);
    const type = linkType || (synthKr ? 'contribute' : sspecLinkDefaultFor(parent0, hostType, thisProd));
    if (synthKr) { realParentId = sspecMaterializeSpecKpi(D, docKey, modelId, synthKr, type !== 'specification'); if (!realParentId) return false; }
    const AK = sspecAllK(D, docKey);
    if (!AK.some((k) => k.id === realParentId)) return false;
    const objScope = hostType === 'product' ? null : modelId;
    const id = RD.allocId('kpi', objScope || hostId, AK.map((x) => x.id));
    if (RD.wouldCreateCycle(id, realParentId, AK)) { refused = true; return false; }
    doc.kpis.push({ id, objectiveId: objScope, hostType, hostId, linkParent: realParentId, linkType: type, linkPriority: 0, name: null, direction: null, unit: null, target: null, order: 0 });
    o.msg = synthKr ? ('Linked to specification (' + type + ')' + (type !== 'specification' ? ' — its conformance now derives from linked metrics.' : '.')) : ('Linked (' + type + ').');
  }, o);
  if (refused) { C.sheetErr('That link would create a cycle — choose a different target.'); return; }
  if (ok) C.closeSheet();
}
function sspecLinkSheetVM(C, ctx, sh) {
  const host = { type: sh.data.hostType, id: sh.data.hostId };
  const AK = sspecAK(ctx);
  const cands = sspecLinkCandidates(ctx, host);
  const g = sspecLinkGroups(ctx, host, cands);
  const d = sh.d;
  const picked = cands.find((x) => x.id === d.pick) || null;
  const groups = g.groups.map((gr, gi) => ({
    label: gr.label,
    gid: 'sspec-lg-' + gi,
    items: gr.items.map((x) => {
      const h = sspecHost(ctx, x);
      const def = sspecLinkDefaultFor(x, host.type, g.thisProd);
      const nm = (x.name != null ? x.name : RD.kpiName(x, AK)) || x.id;
      return {
        id: x.id,
        name: nm,
        sub: x.specRef ? 'No metric of its own yet: linking creates one on this specification' : (x.hostType === 'keyResult' ? '' : h.kind + ': ' + h.name),
        hasSub: !!(x.specRef || x.hostType !== 'keyResult'),
        defText: def === 'contribute' ? '' : 'Default: ' + def,
        on: d.pick === x.id,
        cls: 'sspec-cand' + (d.pick === x.id ? ' on' : ''),
        pick: () => C.setDraft({ pick: x.id, rel: def })
      };
    })
  }));
  let warn = '';
  if (picked && picked.specRef && d.rel !== 'specification') {
    const kr = (ctx.doc.keyResults || []).find((r) => r.id === picked.hostId);
    if (kr && (kr.trackingType || 'kpi') !== 'kpi') {
      const lost = kr.trackingType === 'percentage' ? 'its ' + sspecClampPct(kr.progress) + '% progress is removed' : kr.trackingType === 'subkr' ? 'its ' + F.plural((kr.subKrs || []).length, 'sub-specification') + ' ' + ((kr.subKrs || []).length === 1 ? 'is' : 'are') + ' removed' : 'its tracking changes';
      warn = 'Linking with ' + d.rel + ' switches “' + (kr.statement || kr.id) + '” to single-metric tracking: ' + lost + ', and its score comes from the linked metric. Choose Specification to keep its tracking.';
    }
  }
  const hostName = host.type === 'keyResult' ? sspecSpecName(ctx, host.id) : sspecCompName(ctx, host.id);
  return {
    title: 'Link a metric',
    sub: (host.type === 'keyResult' ? 'To specification ' : 'To component ') + hostName,
    hasCands: cands.length > 0,
    noCands: !cands.length,
    emptyText: 'No linkable metric in scope — define a specification metric here, or a product KPI, first.',
    groups,
    rels: SSPEC_REL.map((r) => ({ label: r[1], on: d.rel === r[0] ? 'true' : 'false', pick: () => C.setDraft({ rel: r[0] }) })),
    relHelp: SSPEC_REL_HELP[d.rel] || '',
    warn, hasWarn: !!warn,
    save: () => sspecMakeLink(C, ctx),
    cancel: () => C.closeSheet()
  };
}

/* ============================================================ OVERRIDE METRIC TARGET (L1431) */
function sspecOpenOverride(C, ctx, kpiId) {
  const AK = sspecAK(ctx);
  const k = AK.find((x) => x.id === kpiId);
  if (!k) return;
  const lk = RD.linkOf(k, AK);
  const own = k.target;
  sspecOpen(C, 'sspec.override', { kpiId }, {
    linkType: lk.type,
    priority: String(lk.priority || 0),
    target: own != null && typeof own !== 'object' ? String(own) : '',
    lo: own && typeof own === 'object' ? String(own.lo) : '',
    hi: own && typeof own === 'object' ? String(own.hi) : ''
  });
}
function sspecSaveOverride(C, ctx) {
  const sh = C.sheet();
  if (!sh || sh.kind !== 'sspec.override') return;
  const d = sh.d, kpiId = sh.data.kpiId;
  const AK = sspecAK(ctx);
  const rec0 = AK.find((x) => x.id === kpiId);
  if (!rec0) { C.closeSheet(); return; }
  const dir = RD.kpiDirection(rec0, AK);
  const pr = sspecNumField(d.priority);
  if (pr === undefined) { C.sheetErr('Priority is a number, like 0 or 1.'); return; }
  let target = null;
  if (d.linkType !== 'direct') {
    if (dir === 'range') {
      const lo = sspecNumField(d.lo), hi = sspecNumField(d.hi);
      if (lo === undefined || hi === undefined) { C.sheetErr('Use numbers for the override range, like 6 and 10.'); return; }
      if (lo != null && hi != null && lo > hi) { C.sheetErr('The override low must not be above the override high.'); return; }
      target = lo != null && hi != null ? { lo, hi } : null;
    } else {
      const t = sspecNumField(d.target);
      if (t === undefined) { C.sheetErr('Use a number for the override target, or leave it blank to inherit.'); return; }
      target = t;
    }
  }
  const docKey = ctx.docKey;
  const apply = (D) => {
    const rec = sspecAllK(D, docKey).find((x) => x.id === kpiId);
    if (!rec) return false;
    if (d.linkType) rec.linkType = d.linkType;
    if (pr != null) rec.linkPriority = pr;
    rec.target = rec.linkType === 'direct' ? null : target;
  };
  const ok = sspecIsProductKpi(ctx, kpiId) ? sspecPortfolioWrite(C, ctx, apply, 'Link saved.') : C.mutate(apply, { msg: 'Link saved.' });
  if (ok) C.closeSheet();
}
function sspecOverrideSheetVM(C, ctx, sh) {
  const d = sh.d;
  const AK = sspecAK(ctx);
  const rec = AK.find((x) => x.id === sh.data.kpiId);
  if (!rec) return null;
  const dir = RD.kpiDirection(rec, AK), unit = RD.kpiUnit(rec, AK);
  const def = RD.definerOf(rec, AK);
  const from = sspecHost(ctx, def);
  const inh = RD.effTarget(Object.assign({}, rec, { target: null }), AK);
  const binary = !!def && def.targetType === 'binary';
  const save = () => sspecSaveOverride(C, ctx);
  return {
    title: 'Override metric target',
    sub: 'On ' + sspecHostText(ctx, rec),
    inhName: RD.kpiName(rec, AK) || '(unnamed)',
    inhDir: sspecDirWord(dir, binary),
    inhUnit: unit || '—',
    inhFrom: (from.kind ? from.kind + ': ' : '') + from.name,
    inhTarget: sspecTargetText(inh, dir, unit, binary),
    rels: SSPEC_REL.map((r) => ({ label: r[1], on: d.linkType === r[0] ? 'true' : 'false', pick: () => C.setDraft({ linkType: r[0] }) })),
    relHelp: SSPEC_REL_HELP[d.linkType] || '',
    priority: d.priority, onPriority: C.bindDraft('priority'),
    isDirect: d.linkType === 'direct',
    isRange: d.linkType !== 'direct' && dir === 'range',
    isPlain: d.linkType !== 'direct' && dir !== 'range',
    target: d.target, onTarget: C.bindDraft('target'),
    targetPh: 'Inherited: ' + sspecFmtTarget(inh, unit),
    lo: d.lo, onLo: C.bindDraft('lo'), hi: d.hi, onHi: C.bindDraft('hi'),
    save, onKey: sspecKeyNav(C, save),
    cancel: () => C.closeSheet()
  };
}

/* ============================================================ SPECIFICATIONS (L1630, L1043–1158) */
function sspecPrimaryKpi(doc, krId) { return (doc.kpis || []).find((k) => k.hostType === 'keyResult' && k.hostId === krId) || null; }
function sspecOpenSpec(C, ctx, krId) {
  const doc = ctx.doc;
  const kr = krId ? ((doc.keyResults || []).find((x) => x.id === krId) || null) : null;
  const pk = kr ? sspecPrimaryKpi(doc, kr.id) : null;
  const isRange = !!(pk && pk.direction === 'range');
  const hasRange = !!(isRange && pk.target && typeof pk.target === 'object');
  sspecOpen(C, 'sspec.spec', { krId: kr ? kr.id : '' }, {
    statement: kr ? (kr.statement || '') : '',
    notes: kr ? (kr.notes || '') : '',
    trackingType: (kr && kr.trackingType) || (kr ? 'kpi' : 'percentage'),
    progress: kr && kr.progress != null ? sspecClampPct(kr.progress) : 0,
    kpiType: pk ? (pk.targetType || 'demonstration') : 'demonstration',
    kpiDir: isRange ? 'range' : (pk && pk.direction === 'down' ? 'decrease' : 'increase'),
    kpiTarget: pk && pk.target != null && typeof pk.target !== 'object' ? String(pk.target) : '',
    kpiLo: hasRange ? String(pk.target.lo) : '',
    kpiHi: hasRange ? String(pk.target.hi) : '',
    kpiUnit: pk && pk.unit ? pk.unit : '',
    kpiStatistic: pk && pk.statistic ? pk.statistic : 'average',
    kpiReadCount: pk && pk.readCount != null && pk.readCount !== '' ? String(pk.readCount) : '',
    subKrs: K.clone(kr && kr.subKrs ? kr.subKrs : []) || []
  });
}
function sspecSaveSpec(C, ctx) {
  const sh = C.sheet();
  if (!sh || sh.kind !== 'sspec.spec') return;
  const d = sh.d;
  const statement = String(d.statement || '').trim();
  if (!statement) { C.sheetErr('Specification needs a statement.'); return; }
  let target = null, lo = null, hi = null, rc = '';
  if (d.trackingType === 'kpi' && d.kpiType !== 'binary') {
    if (d.kpiDir === 'range') {
      lo = sspecNumField(d.kpiLo); hi = sspecNumField(d.kpiHi);
      if (lo === undefined || hi === undefined) { C.sheetErr('Use numbers for the range, like 6 and 10.'); return; }
      if (lo != null && hi != null && lo > hi) { C.sheetErr('The range low must not be above the range high.'); return; }
    } else {
      target = sspecNumField(d.kpiTarget);
      if (target === undefined) { C.sheetErr('Use a number for the target, like 1.2.'); return; }
    }
    if (d.kpiType === 'statistical') {
      const r = sspecNumField(d.kpiReadCount);
      if (r === undefined || (r != null && (r < 1 || Math.round(r) !== r))) { C.sheetErr('Read count is a whole number of readings, like 10.'); return; }
      rc = r == null ? '' : r;
    }
  }
  const docKey = ctx.docKey, modelId = ctx.modelId, krId = sh.data.krId;
  const ok = C.mutate((D) => {
    const doc = D.spec[docKey];
    let kr = krId ? doc.keyResults.find((x) => x.id === krId) : null;
    if (!kr) {
      const id = RD.allocId('keyResult', modelId, doc.keyResults.map((x) => x.id));
      kr = { id, objectiveId: modelId };
      doc.keyResults.push(kr);
    }
    kr.statement = statement;
    const n = String(d.notes == null ? '' : d.notes).trim();
    if (n) kr.notes = n; else delete kr.notes;
    kr.trackingType = d.trackingType;
    if (d.trackingType === 'percentage') { kr.progress = sspecClampPct(d.progress); delete kr.subKrs; }
    else if (d.trackingType === 'subkr') { kr.subKrs = K.clone(d.subKrs || []); delete kr.progress; }
    else { delete kr.progress; delete kr.subKrs; }
    if (d.trackingType === 'kpi') {
      let pk = sspecPrimaryKpi(doc, kr.id);
      if (!pk) {
        const id = RD.allocId('kpi', modelId, sspecAllK(D, docKey).map((x) => x.id));
        pk = { id, objectiveId: modelId, hostType: 'keyResult', hostId: kr.id, linkParent: null };
        doc.kpis.push(pk);
      }
      pk.name = kr.statement;
      pk.targetType = d.kpiType;
      if (d.kpiType === 'binary') { pk.direction = null; pk.target = null; pk.unit = null; delete pk.statistic; delete pk.readCount; }
      else {
        /* fixed: a range target survives (today the spec editor turns it into "[object Object]", then empty, and the direction into up) */
        if (d.kpiDir === 'range') { pk.direction = 'range'; pk.target = lo != null && hi != null ? { lo, hi } : null; }
        else { pk.direction = d.kpiDir === 'decrease' ? 'down' : 'up'; pk.target = target; }
        pk.unit = String(d.kpiUnit || '').trim() || null;
        if (d.kpiType === 'statistical') { pk.statistic = d.kpiStatistic || 'average'; pk.readCount = rc; }
        else { delete pk.statistic; delete pk.readCount; }
      }
    }
  }, { msg: 'Specification saved.' });
  if (ok) C.closeSheet();
}
function sspecSubMeta(s) {
  const parts = ['Weight ' + F.n(Number(s.weight) || 1)];
  if ((s.trackingType || 'percentage') === 'percentage') parts.push(F.n(Number(s.progress) || 0) + '% complete');
  else {
    const k = (s.kpis && s.kpis[0]) || {};
    const tp = k.targetType || k.type || 'demonstration';
    if (tp === 'binary') parts.push('binary, ' + (k.current != null ? (Number(k.current) >= 1 ? 'met' : 'not met') : 'unmeasured'));
    else {
      parts.push(tp + (k.target != null && k.target !== '' ? ' ' + (k.direction === 'down' ? '≤' : '≥') + ' ' + F.u(k.target, k.unit) : ''));
      if (k.current != null) { const sc = RD.scoreEmbeddedKpi(k); parts.push('now ' + F.u(k.current, k.unit) + (sc != null ? ' (' + Math.round(sc) + '%)' : '')); }
      else parts.push('unmeasured');
    }
  }
  return parts.join(', ');
}
function sspecSpecSheetVM(C, ctx, sh) {
  const d = sh.d;
  const tt = d.trackingType;
  const isStat = d.kpiType === 'statistical', isBin = d.kpiType === 'binary', isRange = d.kpiDir === 'range';
  const save = () => sspecSaveSpec(C, ctx);
  const kr = sh.data.krId ? (ctx.doc.keyResults || []).find((x) => x.id === sh.data.krId) : null;
  const pk = kr ? sspecPrimaryKpi(ctx.doc, kr.id) : null;
  const AK = sspecAK(ctx);
  let linkedNote = '';
  if (pk && sspecIsMember(pk, AK)) {
    const def = RD.definerOf(pk, AK);
    linkedNote = 'This specification’s metric inherits from ' + sspecDefDesc(ctx, def, AK) + ' (' + RD.linkOf(pk, AK).type + ' link). Its name, direction and unit come from there; the target here is an override.';
  }
  const subs = (d.subKrs || []).map((s, i) => ({
    name: s.name || 'Sub-spec ' + (i + 1),
    meta: sspecSubMeta(s),
    edit: () => sspecOpenSub(C, i),
    editLabel: 'Edit ' + (s.name || 'sub-spec ' + (i + 1)),
    remove: () => C.setDraft({ subKrs: (C.draft().subKrs || []).filter((x, j) => j !== i) }),
    removeLabel: 'Remove ' + (s.name || 'sub-spec ' + (i + 1))
  }));
  const ws = (d.subKrs || []).length ? RD.subKrScore(d.subKrs) : null;
  return {
    title: sh.data.krId ? 'Edit specification' : 'Add specification',
    sub: (ctx.model ? ctx.model.name : '') + (kr ? ', ' + kr.id : ''),
    statement: d.statement, onStatement: C.bindDraft('statement'),
    tracks: SSPEC_TRACK.map((t) => ({ label: t[1], on: tt === t[0] ? 'true' : 'false', pick: () => C.setDraft({ trackingType: t[0] }) })),
    isPct: tt === 'percentage', isKpi: tt === 'kpi', isSub: tt === 'subkr',
    progress: String(d.progress == null ? 0 : d.progress),
    progressText: sspecClampPct(d.progress) + '%',
    onProgress: (e) => C.setDraft({ progress: e && e.target ? e.target.value : 0 }),
    types: SSPEC_TTYPES.map((t) => ({ label: t[1], on: d.kpiType === t[0] ? 'true' : 'false', pick: () => C.setDraft({ kpiType: t[0] }) })),
    isStat, notBin: !isBin, isBin,
    readCount: d.kpiReadCount, onReadCount: C.bindDraft('kpiReadCount'),
    stats: SSPEC_STATS.map((s) => ({ v: s[0], label: s[1] })),
    statistic: d.kpiStatistic, onStatistic: C.bindDraft('kpiStatistic'),
    dirs: [['increase', 'At least'], ['decrease', 'At most'], ['range', 'Range']].map((x) => ({ label: x[1], on: d.kpiDir === x[0] ? 'true' : 'false', pick: () => C.setDraft({ kpiDir: x[0] }) })),
    showTarget: !isBin && !isRange, showRange: !isBin && isRange,
    target: d.kpiTarget, onTarget: C.bindDraft('kpiTarget'),
    lo: d.kpiLo, onLo: C.bindDraft('kpiLo'), hi: d.kpiHi, onHi: C.bindDraft('kpiHi'),
    unit: d.kpiUnit, onUnit: C.bindDraft('kpiUnit'),
    linkedNote, hasLinkedNote: !!linkedNote,
    kpiHint: 'These fields set the specification’s primary metric, named after the statement. Readings are posted from the specification’s metric table.',
    subs, hasSubs: subs.length > 0, noSubs: !subs.length,
    subScore: ws == null ? 'No score yet' : 'Weighted score ' + F.score(ws),
    addSub: () => sspecOpenSub(C, null),
    notes: d.notes, onNotes: C.bindDraft('notes'),
    saveLabel: sh.data.krId ? 'Update specification' : 'Save specification',
    save, onKey: sspecKeyNav(C, save),
    cancel: () => C.closeSheet()
  };
}

/* ---- sub-specification sheet (L1160–1239): edits the spec sheet's draft only */
function sspecOpenSub(C, idx) {
  const parent = C.sheet();
  if (!parent || parent.kind !== 'sspec.spec') return;
  const ex = idx != null ? (parent.d.subKrs || [])[idx] : null;
  const k = (ex && ex.kpis && ex.kpis[0]) || null;
  C.pushSheet('sspec.sub', { idx: idx == null ? -1 : idx }, {
    name: ex ? (ex.name || '') : '',
    weight: ex && ex.weight != null ? String(ex.weight) : '1',
    trackingType: ex ? (ex.trackingType === 'kpi' ? (k ? (k.targetType || k.type || 'demonstration') : 'demonstration') : 'percentage') : 'percentage',
    progress: ex && ex.progress != null ? sspecClampPct(ex.progress) : 0,
    dir: k && k.direction === 'down' ? 'decrease' : 'increase',
    target: k && k.target != null ? String(k.target) : '',
    unit: k && k.unit ? k.unit : '',
    statistic: k && k.statistic ? k.statistic : 'average',
    readCount: k && k.readCount != null && k.readCount !== '' ? String(k.readCount) : '',
    current: k && k.current != null ? String(k.current) : '',
    readings: k && k.readings != null ? String(k.readings) : '',
    metFlag: k && k.current != null ? (Number(k.current) >= 1 ? '1' : '0') : ''
  });
}
function sspecSaveSub(C) {
  const sh = C.sheet();
  if (!sh || sh.kind !== 'sspec.sub') return;
  const sheets = (C.state.sheets || []).slice();
  const below = sheets[sheets.length - 2];
  if (!below || below.kind !== 'sspec.spec') { C.closeSheet(); return; }
  const d = sh.d, tt = d.trackingType;
  const nm = String(d.name || '').trim();
  if (!nm) { C.sheetErr('Name the sub-specification.'); return; }
  const wv = sspecNumField(d.weight);
  if (wv === undefined || (wv != null && wv < 0.1 && wv !== 0)) { C.sheetErr('Weight is a number of 0.1 or more, like 1.'); return; }
  const w = wv || 1;
  let skr;
  if (tt === 'percentage') skr = { name: nm, weight: w, trackingType: 'percentage', progress: sspecClampPct(d.progress), kpis: [] };
  else {
    const k = { type: tt, targetType: tt, name: nm, current: null };
    if (tt === 'binary') k.current = d.metFlag === '' || d.metFlag == null ? null : Number(d.metFlag);
    else {
      const t = sspecNumField(d.target);
      if (t === undefined) { C.sheetErr('Use a number for the target, like 1.2.'); return; }
      k.direction = d.dir === 'decrease' ? 'down' : 'up';
      k.target = t;
      k.unit = String(d.unit || '').trim() || null;
      if (tt === 'statistical') {
        const r = sspecNumField(d.readCount);
        if (r === undefined || (r != null && (r < 1 || Math.round(r) !== r))) { C.sheetErr('Read count is a whole number of readings, like 10.'); return; }
        k.statistic = d.statistic || 'average';
        k.readCount = r == null ? '' : r;
        k.readings = String(d.readings || '').trim();
        const nums = sspecParseNums(d.readings);
        k.current = nums.length ? RD.computeStat(k.statistic, nums) : null;
      } else {
        const cur = sspecNumField(d.current);
        if (cur === undefined) { C.sheetErr('Use a number for the current measurement, like 1.18.'); return; }
        k.current = cur;
      }
    }
    skr = { name: nm, weight: w, trackingType: 'kpi', progress: 0, kpis: [k] };
  }
  const subs = (below.d.subKrs || []).slice();
  const idx = sh.data.idx;
  if (idx != null && idx >= 0 && idx < subs.length) subs[idx] = skr; else subs.push(skr);
  sheets[sheets.length - 2] = Object.assign({}, below, { d: Object.assign({}, below.d, { subKrs: subs }), err: '' });
  sheets.pop();
  C.setState({ sheets, menu: '' });
}
function sspecSubSheetVM(C, ctx, sh) {
  const d = sh.d, t = d.trackingType;
  const isPct = t === 'percentage', isDemo = t === 'demonstration', isStat = t === 'statistical', isBin = t === 'binary';
  const save = () => sspecSaveSub(C);
  return {
    title: sh.data.idx >= 0 ? 'Edit sub-specification' : 'Add sub-specification',
    sub: 'Part of the specification you are editing',
    types: SSPEC_SUBTYPES.map((x) => ({ label: x[1], on: t === x[0] ? 'true' : 'false', pick: () => C.setDraft({ trackingType: x[0] }) })),
    name: d.name, onName: C.bindDraft('name'),
    weight: d.weight, onWeight: C.bindDraft('weight'),
    isPct, isDemo, isStat, isBin, showKpi: !isPct && !isBin,
    readCount: d.readCount, onReadCount: C.bindDraft('readCount'),
    stats: SSPEC_STATS.map((s) => ({ v: s[0], label: s[1] })),
    statistic: d.statistic, onStatistic: C.bindDraft('statistic'),
    dirs: [['increase', 'At least'], ['decrease', 'At most']].map((x) => ({ label: x[1], on: d.dir === x[0] ? 'true' : 'false', pick: () => C.setDraft({ dir: x[0] }) })),
    target: d.target, onTarget: C.bindDraft('target'),
    unit: d.unit, onUnit: C.bindDraft('unit'),
    progress: String(d.progress == null ? 0 : d.progress),
    progressText: sspecClampPct(d.progress) + '%',
    onProgress: (e) => C.setDraft({ progress: e && e.target ? e.target.value : 0 }),
    current: d.current, onCurrent: C.bindDraft('current'),
    readings: d.readings, onReadings: C.bindDraft('readings'),
    preview: sspecStatPreview(d.statistic, d.readings),
    mets: [['', 'Unmeasured'], ['0', 'Not met'], ['1', 'Met']].map((x) => ({ label: x[1], on: String(d.metFlag || '') === x[0] ? 'true' : 'false', pick: () => C.setDraft({ metFlag: x[0] }) })),
    save, onKey: sspecKeyNav(C, save),
    cancel: () => C.closeSheet()
  };
}

/* ---- delete a specification (L729): cascades to its metrics and readings */
function sspecDeleteSpec(C, ctx, krId) {
  if (!C.guard()) return;
  const doc = ctx.doc;
  const kr = (doc.keyResults || []).find((r) => r.id === krId);
  if (!kr) return;
  const AK = sspecAK(ctx);
  const kids = (doc.kpis || []).filter((k) => k.hostType === 'keyResult' && k.hostId === krId);
  const kidSet = {};
  kids.forEach((k) => { kidSet[k.id] = 1; });
  const nReads = (doc.kpiUpdates || []).filter((u) => kidSet[u.kpiId]).length;
  const nLinked = (doc.kpis || []).filter((m) => m.linkParent != null && kidSet[m.linkParent] && !kidSet[m.id]).length;
  const nGates = (doc.kpis || []).filter((k) => k.gates === krId).length;
  const nImp = (doc.kpis || []).filter((k) => k.linkSpec === krId).length;
  const idx = (ctx.specs || []).findIndex((r) => r.id === krId);
  const lines = [];
  lines.push(kids.length ? 'Its ' + F.plural(kids.length, 'metric') + (nReads ? ' and ' + F.plural(nReads, 'reading') : '') + (kids.length === 1 && !nReads ? ' is' : ' are') + ' deleted.' : 'It has no metrics.');
  if (nLinked) lines.push(F.plural(nLinked, 'metric') + ' linked to it ' + (nLinked === 1 ? 'keeps its' : 'keep their') + ' current target and ' + (nLinked === 1 ? 'is' : 'are') + ' unlinked.');
  if (nGates) lines.push(F.plural(nGates, 'component specification') + ' stop' + (nGates === 1 ? 's' : '') + ' gating it.');
  if (nImp) lines.push(F.plural(nImp, 'imported sub-product spec') + ' stop' + (nImp === 1 ? 's' : '') + ' linking to it.');
  lines.push('This cannot be undone.');
  const docKey = ctx.docKey;
  C.confirm({
    title: 'Delete ' + (idx >= 0 ? 'S' + (idx + 1) + ', ' : '') + '“' + (kr.statement || kr.id) + '”?',
    body: lines.join(' '),
    ok: 'Delete specification', danger: true,
    onOk: () => C.mutate((D) => {
      const d2 = D.spec[docKey];
      if (!d2.keyResults.some((r) => r.id === krId)) return false;
      const AK2 = sspecAllK(D, docKey);
      const ks = {};
      d2.kpis.filter((k) => k.hostType === 'keyResult' && k.hostId === krId).forEach((k) => { ks[k.id] = 1; });
      d2.kpis.forEach((m) => { if (m.linkParent != null && ks[m.linkParent] && !ks[m.id]) sspecMaterialize(m, AK2); });
      d2.kpis = d2.kpis.filter((k) => !ks[k.id]);
      d2.kpiUpdates = d2.kpiUpdates.filter((u) => !ks[u.kpiId]);
      /* fixed: no dangling references to the deleted specification */
      d2.kpis.forEach((k) => { if (k.gates === krId) delete k.gates; if (k.linkSpec === krId) delete k.linkSpec; });
      d2.keyResults = d2.keyResults.filter((r) => r.id !== krId);
    }, { msg: 'Specification deleted.' })
  });
}
/* reorder specifications within this model (L1589) */
function sspecMoveSpec(C, ctx, fromId, toId, after) {
  const docKey = ctx.docKey, modelId = ctx.modelId;
  C.mutate((D) => {
    const doc = D.spec[docKey];
    const next = sspecReorder(doc.keyResults, (r) => r.objectiveId === modelId, fromId, toId, after);
    if (!next) return false;
    doc.keyResults = next;
  }, { msg: 'Reordered.' });
}

/* resolve an imported sub-product spec for the "From sub-products" line (L586 resolveRef) */
function sspecResolveRef(C, ctx, member) {
  if (typeof SSUB !== 'undefined' && SSUB && typeof SSUB.resolveRef === 'function') return SSUB.resolveRef(C, ctx, member);
  if (typeof ctx.resolveRef === 'function') return ctx.resolveRef(member);
  return { name: member.name, score: null };
}

/* ============================================================ the list */
function sspecSpecList(C, ctx) {
  const ro = C.isRo();
  const AK = sspecAK(ctx);
  const em = ctx.em;
  const specs = ctx.specs || (ctx.doc.keyResults || []).filter((r) => r.objectiveId === ctx.modelId);
  const S = C.state;
  const drag = C._drag && C._drag.kind === 'sspec.spec' ? C._drag : null;
  return specs.map((kr, i) => {
    const s = RD.keyResultScore(kr.id, em);
    const tt = kr.trackingType || 'kpi';
    const menuId = 'sspec.s.' + kr.id;
    const gates = AK.filter((k) => k.gates === kr.id);
    const subIn = AK.filter((k) => k.hostType === 'component' && k.refKr && k.linkSpec === kr.id);
    const subs = tt === 'subkr' ? (kr.subKrs || []) : [];
    const isHot = !!drag && S.sspec_hot === 'spec:' + kr.id && drag.id !== kr.id;
    const tag = 'S' + (i + 1);
    let trackText = 'Single metric';
    if (tt === 'percentage') trackText = '% completion';
    else if (tt === 'subkr') trackText = F.plural(subs.length, 'sub-specification') + ', weighted';
    const pct = sspecClampPct(kr.progress);
    return {
      id: kr.id, tag,
      aria: 'Specification ' + tag + ': ' + (kr.statement || kr.id),
      statement: kr.statement || kr.id,
      canEdit: !ro,
      edit: () => { C.closeMenus(); sspecOpenSpec(C, ctx, kr.id); },
      editLabel: 'Edit ' + tag,
      trackText,
      score: F.score(s), scoreCls: sspecScoreCls(s) + ' sspec-score',
      scoreTitle: 'Specification score: ' + (s == null ? 'no score yet' : F.score(s) + ', ' + sspecBandText(s).toLowerCase()),
      hasProgress: tt === 'percentage',
      progressText: pct + '% complete',
      progressStyle: 'width: ' + pct + '%',
      progressCls: 'fill ' + F.tone(F.band(s)),
      hasSubs: subs.length > 0,
      subs: subs.map((x, j) => {
        let sc = null;
        if ((x.trackingType || 'percentage') === 'kpi') { const v = (x.kpis || []).map((k) => RD.scoreEmbeddedKpi(k)).filter((v2) => v2 != null); sc = v.length ? K.mean(v) : null; }
        else sc = x.progress == null ? null : sspecClampPct(x.progress);
        const nm = x.name || 'Sub-spec ' + (j + 1);
        return {
          name: nm, meta: sspecSubMeta(x), score: F.score(sc), scoreCls: sspecScoreCls(sc),
          canEdit: !ro,
          editLabel: 'Edit sub-spec “' + nm + '” of ' + tag,
          /* opens the specification editor with this sub-spec on top (Back returns to the specification) */
          edit: () => { C.closeMenus(); sspecOpenSpec(C, ctx, kr.id); sspecOpenSub(C, j); }
        };
      }),
      metricsNote: tt === 'kpi' ? '' : 'Metrics here do not count toward this score while it is tracked by ' + (tt === 'percentage' ? '% completion' : 'sub-specifications') + '.',
      hasMetricsNote: tt !== 'kpi' && AK.some((k) => k.hostType === 'keyResult' && k.hostId === kr.id && k.objectiveId === ctx.modelId),
      mt: sspecMetricTable(C, ctx, { type: 'keyResult', id: kr.id }, { key: 'page' }),
      addKpi: () => sspecOpenMetric(C, ctx, { type: 'keyResult', id: kr.id }, null),
      addKpiLabel: 'Add KPI to ' + tag,
      addLink: () => sspecOpenLink(C, ctx, { type: 'keyResult', id: kr.id }),
      addLinkLabel: 'Link a metric to ' + tag,
      menuId, menuOpen: C.isMenu(menuId), toggleMenu: () => C.toggleMenu(menuId),
      menuLabel: 'More actions for ' + tag,
      canUp: i > 0, canDown: i < specs.length - 1,
      up: () => { C.closeMenus(); if (i > 0) sspecMoveSpec(C, ctx, kr.id, specs[i - 1].id, false); },
      down: () => { C.closeMenus(); if (i < specs.length - 1) sspecMoveSpec(C, ctx, kr.id, specs[i + 1].id, true); },
      del: () => { C.closeMenus(); sspecDeleteSpec(C, ctx, kr.id); },
      gated: gates.map((g) => {
        const gs = RD.kpiScoreResolved(g, AK, em);
        return {
          name: RD.kpiName(g, AK) || g.id,
          score: F.score(gs), scoreCls: sspecScoreCls(gs),
          title: 'On ' + sspecCompName(ctx, g.hostId) + ': a different measure of this requirement',
          canOpen: !ro,
          open: () => SSPEC.openEdit(C, ctx, g.id)
        };
      }),
      hasGated: gates.length > 0,
      fromSubs: subIn.map((k) => {
        const r = sspecResolveRef(C, ctx, k);
        return { name: (r && r.name) || k.name || k.id, score: F.score(r ? r.score : null), scoreCls: sspecScoreCls(r ? r.score : null) };
      }),
      hasFromSubs: subIn.length > 0,
      hasNotes: !!String(kr.notes || '').trim(),
      notes: String(kr.notes || '').trim(),
      notesOpen: !!(S.sspec_notes || {})[kr.id],
      notesLabel: (S.sspec_notes || {})[kr.id] ? 'Hide notes' : 'Notes',
      toggleNotes: () => C.setState({ sspec_notes: Object.assign({}, C.state.sspec_notes, { [kr.id]: !(C.state.sspec_notes || {})[kr.id] }) }),
      canDrag: !ro && specs.length > 1,
      dragLabel: 'Drag ' + tag + ' to reorder',
      dragStart: (e) => {
        C._drag = { kind: 'sspec.spec', id: kr.id };
        try { if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', kr.id); } } catch (x) { /* ignore */ }
        C.setState({ sspec_hot: '' });
      },
      dragEnd: () => { C._drag = null; C.setState({ sspec_hot: '' }); },
      dragOver: (e) => {
        const d = C._drag;
        if (!d || d.kind !== 'sspec.spec') return;
        if (e && e.preventDefault) e.preventDefault();
        try { if (e && e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch (x) { /* ignore */ }
        if (C.state.sspec_hot !== 'spec:' + kr.id) C.setState({ sspec_hot: 'spec:' + kr.id });
      },
      drop: (e) => {
        const d = C._drag;
        if (!d || d.kind !== 'sspec.spec') return;
        if (e && e.preventDefault) e.preventDefault();
        C._drag = null;
        C.setState({ sspec_hot: '' });
        if (d.id !== kr.id) sspecMoveSpec(C, ctx, d.id, kr.id, false);
      },
      cardCls: 'sspec-card dz' + (isHot ? ' hot' : '') + (drag && drag.id === kr.id ? ' lift' : '')
    };
  });
}

/* ============================================================ public namespace */
const SSPEC = {
  metricTable: sspecMetricTable,
  openMetric: sspecOpenMetric,
  openLink: sspecOpenLink,
  openOverride: sspecOpenOverride,
  openEdit(C, ctx, kpiId) {
    const k = (ctx.doc.kpis || []).find((x) => x.id === kpiId);
    if (!k) return;
    if (sspecIsMember(k, sspecAK(ctx))) sspecOpenOverride(C, ctx, kpiId);
    else sspecOpenMetric(C, ctx, { type: k.hostType, id: k.hostId }, kpiId);
  },
  openSpec: sspecOpenSpec,
  post: sspecPost,
  unlink: sspecUnlink,
  deleteMetric: sspecDeleteMetric,
  targetText: sspecTargetText,
  fmtTarget: sspecFmtTarget,
  hostOf: sspecHost,
  importSource: sspecImportSource,
  linkDefaultFor: sspecLinkDefaultFor,
  linkCandidates: sspecLinkCandidates
};

MODS.sspec = {
  state: { sspec_open: true, sspec_reads: {}, sspec_notes: {}, sspec_hot: '' },
  vm(C, ctx) {
    const ro = C.isRo();
    const top = C.sheetOf('sspec');
    const out = {
      specSheet: top && top.kind === 'sspec.spec' ? sspecSpecSheetVM(C, ctx, top) : null,
      subSheet: top && top.kind === 'sspec.sub' ? sspecSubSheetVM(C, ctx, top) : null,
      metricSheet: top && top.kind === 'sspec.metric' ? sspecMetricSheetVM(C, ctx, top) : null,
      linkSheet: top && top.kind === 'sspec.link' ? sspecLinkSheetVM(C, ctx, top) : null,
      overrideSheet: top && top.kind === 'sspec.override' ? sspecOverrideSheetVM(C, ctx, top) : null
    };
    if (!ctx.model) return Object.assign(out, { specs: [], count: '0', empty: true, has: false, open: true, canEdit: false });
    const specs = sspecSpecList(C, ctx);
    const open = C.state.sspec_open !== false;
    return Object.assign(out, {
      specs,
      count: String(specs.length),
      empty: !specs.length,
      has: specs.length > 0,
      open,
      chevStyle: 'transform: rotate(' + (open ? 0 : -90) + 'deg)',
      toggleOpen: () => C.setState({ sspec_open: !open }),
      canEdit: !ro,
      add: () => sspecOpenSpec(C, ctx, null)
    });
  }
};
