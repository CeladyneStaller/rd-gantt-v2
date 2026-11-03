/* ============================================================================
   KPI module (X-kpi). KPI tables, readings and batches, provenance, KPI
   targets, linking across levels, Connect data (analysis-portal import),
   the Overview's "Latest readings", and KPI search.

   PUBLIC API (other modules call these; names and signatures are stable)
   -----------------------------------------------------------------------
   KPI.table(C, ctx, host, opts) -> view model for one KPI table. Render it with the include directive
       "@include mods/kpi/part-table.html KT=path.to.vm" (in an HTML comment; see CONTRACT.md).
       Loop names used inside the partial: kpi_r, kpi_b, kpi_m, kpi_d, kpi_p (avoid them around the include).
     host = { type: 'keyResult' | 'stageGate' | 'task' | 'initiative' | 'milestone', id }
     opts = {
       key?        string   unique key when the same host's table shows twice at once (default type:id)
       canAdd?     bool     show "Add KPI / Add target" and "Link a metric" (default: editable host and not read-only)
       readOnly?   bool     values only: no posting, no row menu, no add (initiative / milestone tables default to this)
       connect?    bool     also show "Connect data" in the footer (Execution only; default false)
       addLabel?, linkLabel?, emptyText?   wording overrides
       objScope?   string|null  objective the rows belong to (default ctx.objId; null for initiative / milestone hosts)
       pending?    [target]  draft gate targets while a gate is being added: host.id must be '__pending__'
       onPending?  fn(list)  called with the new draft list after add / edit / remove (e.g. (l) => C.setDraft({ targets: l }))
     }
     returns { key, rows, has, empty, emptyText, canAdd, add, addLabel, canLink, link, linkLabel, hasFoot,
               count, met, partialCount, summary ("2 of 3 on target, 1 partial" / "1 of 2 met"), hasHl, ... }
   KPI.post(C, ctx, kpi, key) -> one KPI's reading controls for rows another module draws (the Overview's
       review table): { btn, text, aria, title, expanded, cls, click, canPost, editing, ed, drawer, cur }, the
       table row's own value button, inline editor and readings drawer on the same state, keyed by `key` + the
       KPI. Draw the editor with "@include mods/kpi/part-post.html KE=path.to.ed" and the drawer with
       "@include mods/kpi/part-drawer.html KD=path.to.drawer" (the KPI table draws both the same way).
   KPI.openTarget(C, ctx, host, kpiId, opts?)   target sheet ('kpi.target'); new KPI when kpiId is falsy.
       Pushes onto the sheet stack when another sheet is open (so a gate or KR editor keeps its typing).
       opts.onSave(target)  draft mode (host.id '__pending__'): the sheet closes, then onSave gets the target
                            { name, targetType, direction, target, rangeSpec?, unit, statistic?, readCount?, readsFrom? }
       opts.value           the draft target being edited (draft mode)
   KPI.openEdit(C, ctx, kpiId)      the right editor for a KPI: target sheet, or the override sheet for a linked KPI
   KPI.openLink(C, ctx, host)       "Link a metric" sheet ('kpi.link'); use after "save, then link" flows
   KPI.openOverride(C, ctx, kpiId)  override sheet for a linked KPI ('kpi.override')
   KPI.openConnect(C, ctx, opts)    Connect data sheet ('kpi.connect', Execution only). opts:
       host        { type: 'keyResult' | 'stageGate' | 'task', id }   import into that host's KPIs, or
       keyReads    [{ id, name, unit, source_kpi_gid? }]             an experiment's key reads ("record" mode)
       getExperiment(D) -> the experiment object (its key_read_readings hold unlinked imports)
       title?, label?   sheet title ("Connect data: fill key reads") and context pill ("key reads")
       applyLocal(D, { removals, imports, batch, linkedAdded }) -> { added, removed, skipped }
                   runs inside the same C.mutate for UNLINKED key reads: removals = connected rows to drop
                   ({ krId, src, value, _localIdx }), imports = { keyReadId: [pick] } (value already scaled; pick has
                   sample, key, analysis, step, cond, job_id, bin_id, script, timestamp, scale?, value_raw?)
       afterApply(C, result)  after saving (result = { added, removed, skipped })
       Linked key reads are written here as kpiUpdates on their KPI (one batch per import), exactly as today.
   KPI.openAll(C, ctx, kpiId?)      "Readings" sheet: every KPI table of the objective (kpiId is highlighted)
   KPI.del(C, ctx, kpiId)           confirm, then delete a KPI and its readings (refused for a definer with members)
   KPI.unlink(C, ctx, kpiId)        detach a linked KPI, keeping what it showed
   KPI.commitPending(doc, objId, gateId, list)   inside a C.mutate: turn draft gate targets into KPIs on a new gate
   KPI.removeHost(doc, hostType, hostId)         inside a C.mutate: delete a host's KPIs and their readings
   KPI.pool(C, ctx)                 resolution pool: this doc's KPIs + portfolio KPIs + in-scope spec targets (as today)
   KPI.parts(C, ctx, k)             RD.kpiScoreParts(k, pool, ctx.em)
   KPI.describe(C, ctx, k)          { name, crit, current, unit, score, partial } for compact views
   KPI.summary(C, ctx, host)        { count, met, partialCount, text }
   KPI.hostLabel(C, ctx, k)         "key result “…”", "gate “…”", "initiative …", "model … spec", …
   MODS.kpi.search(C, ctx, q)       KPIs by name
   Pulled KPIs (k.pull, October 19; mods/pull): rowVM hands their rows to PULL.row (the value is a dropdown of what
   was pulled, a leader's menu edits or deletes); openEdit / openTarget open PULL's sheet; the target sheet offers
   "Pulled from other work" to leaders (tg.pulledSeg). They take no readings, lend no sample and are no link target.
   ========================================================================== */
const KPI = (function () {
  const STAT_OPTS = [['average', 'Average'], ['median', 'Median'], ['stddev', 'Standard deviation'], ['cv', 'Coefficient of variation (CV)'], ['range', 'Range'], ['max', 'Max'], ['min', 'Min']];
  const STAT_WORD = { average: 'Average', median: 'Median', stddev: 'Std dev', cv: 'CV', range: 'Range', max: 'Max', min: 'Min' };
  const LINK_DEFAULTS = {
    'product>keyResult': 'contribute', 'product>stageGate': 'contribute', 'product>task': 'contribute', 'product>initiative': 'direct',
    'model>keyResult': 'contribute', 'model>stageGate': 'contribute', 'model>task': 'contribute', 'model>initiative': 'direct'
  };
  const REL_HINT = {
    contribute: 'Contribute rolls this reading up into the target metric.',
    direct: 'Direct mirrors the target metric: the target is always inherited and the reading rolls up.',
    specification: 'Specification measures against the target metric without rolling the reading up.'
  };
  const CD_SCALES = [['0.001', '÷1000'], ['0.01', '÷100'], ['0.1', '÷10'], ['1', '×1'], ['10', '×10'], ['100', '×100'], ['1000', '×1000']];
  const CD_BUCKETS = ['polcurve', 'eis', 'crossover', 'ecsa'];

  /* ------------------------------------------------------------ formatting */
  function fmtNum(v) {
    if (v == null || v === '') return '—';
    const x = Number(v);
    if (!isFinite(x)) return String(v);
    const a = Math.abs(x);
    if (a !== 0 && (a < 0.0001 || a >= 1e12)) return String(x);        // keep tiny / huge values exact
    return x.toLocaleString('en-US', { maximumFractionDigits: 6 });
  }
  /* statistical values are shown to 3 decimals, as today; a single reading is shown as entered */
  function fmtVal(v, isStat) {
    if (v == null || v === '') return '—';
    const x = Number(v);
    if (!isFinite(x)) return String(v);
    return fmtNum(isStat ? Math.round(x * 1000) / 1000 : x);
  }
  function withUnit(s, unit) {
    if (!unit || s === '—' || s === '') return s;
    return /^(%|°)/.test(unit) ? s + unit : s + ' ' + unit;
  }
  function critText(dir, tgt, unit, isBin) {
    if (isBin) return 'Pass';
    if (tgt == null) return 'No target yet';
    if (typeof tgt === 'object') return fmtNum(tgt.lo) + ' to ' + withUnit(fmtNum(tgt.hi), unit);
    const v = withUnit(fmtNum(tgt), unit);
    return dir === 'up' ? '≥ ' + v : dir === 'down' ? '≤ ' + v : v;
  }
  function dirWord(dir) { return dir === 'up' ? 'increase' : dir === 'down' ? 'decrease' : dir === 'range' ? 'range' : 'no direction'; }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function isoDay(iso) { const t = Date.parse(iso || ''); return isFinite(t) ? F.dayY(F.dayOfMs(t)) : '—'; }
  function isoStamp(iso) { const t = Date.parse(iso || ''); return isFinite(t) ? F.dayY(F.dayOfMs(t)) + ', ' + F.time(t) : '—'; }
  /* compact value for imported readings (exponent for very small / large), as today's __erFmt */
  function compact(v) {
    if (v == null) return '—';
    const n = Number(v);
    if (!isFinite(n)) return '—';
    const a = Math.abs(n);
    const s = (a !== 0 && (a < 0.001 || a >= 100000)) ? n.toExponential(2) : n.toFixed(a < 1 ? 4 : 3);
    return String(parseFloat(s));
  }
  function condText(c) {
    const p = [];
    c = c || {};
    if (c.T_C != null) p.push(c.T_C + ' °C');
    if (c.RH_pct != null) p.push(c.RH_pct + '% RH');
    if (c.P_value != null) p.push(c.P_value + ' ' + (c.P_unit || ''));
    if (c.step) p.push('step ' + c.step);
    return p.join(', ');
  }

  /* ------------------------------------------------------ data and scope */
  function docOf(C, ctx) { return (ctx && ctx.docKey && C.D.docs[ctx.docKey]) || (ctx && ctx.doc) || { kpis: [], kpiUpdates: [] }; }
  function pf(C) { return C.D.portfolio || {}; }
  function modelById(P, id) { return id ? (P.models || []).find((m) => m.id === id) || null : null; }
  function productById(P, id) { return id ? (P.products || []).find((p) => p.id === id) || null : null; }
  function objById(P, id) { return id ? (P.objectives || []).find((o) => o.id === id) || null : null; }
  function ancestorModels(P, mid) {
    const comp = P.composition || [], out = {}, stack = [mid];
    while (stack.length) {
      const ps = RD.compositionParents(stack.pop(), comp);
      for (let i = 0; i < ps.length; i++) if (!out[ps[i]]) { out[ps[i]] = 1; stack.push(ps[i]); }
    }
    return Object.keys(out);
  }
  /* the products / models this division's objectives are classified to, plus their sub- and super-products (as today) */
  function targetsInScope(C, ctx) {
    const P = pf(C);
    const base = RD.classifiedTargets(P, P.composition || [], ctx.divId);
    const models = new Set(base.models), products = new Set(base.products);
    base.models.forEach((mid) => ancestorModels(P, mid).forEach((a) => {
      models.add(a);
      const m = modelById(P, a);
      if (m && m.productId) products.add(m.productId);
    }));
    return { products: Array.from(products), models: Array.from(models) };
  }
  function divOfProduct(P, pid) { const p = productById(P, pid); return p ? p.divisionId : null; }
  function divOfModel(P, mid) { const m = modelById(P, mid); return m ? divOfProduct(P, m.productId) : null; }
  /* SPEC-<div> documents that hold this division's link targets (today they are fetched from the broker) */
  function refKpis(C, ctx, t) {
    const P = pf(C), divs = new Set();
    t.products.forEach((p) => { const d = divOfProduct(P, p); if (d) divs.add(d); });
    t.models.forEach((m) => { const d = divOfModel(P, m); if (d) divs.add(d); });
    let out = [];
    divs.forEach((d) => { const doc = (C.D.spec || {})['SPEC-' + d]; if (doc && doc.kpis) out = out.concat(doc.kpis); });
    return out;
  }
  function linkTargetKpis(C, ctx) {
    const t = targetsInScope(C, ctx);
    const ref = refKpis(C, ctx, t);
    const base = RD.targetKpisInScope(t, ref);
    const seen = new Set(base.map((k) => k.id));
    const ms = new Set(t.models);
    return base.concat(ref.filter((k) => k && k.hostType === 'component' && ms.has(k.objectiveId) && !seen.has(k.id)));
  }
  /* resolution pool: this division's KPIs + the portfolio's KPIs + in-scope product / model targets (allKpisPool) */
  function buildPool(C, ctx) {
    const doc = docOf(C, ctx), P = pf(C);
    const pool = (P.kpis && P.kpis.length) ? (doc.kpis || []).concat(P.kpis) : (doc.kpis || []).slice();
    const have = new Set(pool.map((k) => k.id));
    linkTargetKpis(C, ctx).forEach((k) => { if (!have.has(k.id)) { have.add(k.id); pool.push(k); } });
    return pool;
  }
  /* render-time pool (memoised for this render, per document: My Projects draws objectives of several divisions in
     one render). Handlers always call buildPool: the memo is stale after a change. */
  function pool(C, ctx) { return C.memo('kpi.pool:' + ((ctx && ctx.docKey) || ''), () => buildPool(C, ctx)); }

  function isMember(k) { return (!!k.groupId && !k.isDefiner) || (k.linkParent != null); }
  function ownReadings(doc, kpiId) { return (doc.kpiUpdates || []).filter((u) => u.kpiId === kpiId); }
  function krsOf(doc, objId) { return (doc.keyResults || []).filter((r) => r.objectiveId === objId); }
  function sortByDue(list) {
    return list.slice().sort((a, b) => {
      const pa = a.plannedDate == null ? Infinity : a.plannedDate, pb = b.plannedDate == null ? Infinity : b.plannedDate;
      return (pa - pb) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id));
    });
  }
  function setsOf(doc, objId) {
    return (doc.stageGateSets || []).filter((s) => s.objectiveId === objId).slice()
      .sort((a, b) => ((a.order || 0) - (b.order || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
  }
  /* "SG-A1": workstream letter + position by due date (the gate tab's numbering, used everywhere here) */
  function gateLabel(doc, g) {
    if (!g) return '';
    const peers = sortByDue((doc.stageGates || []).filter((x) => x.objectiveId === g.objectiveId && x.setId === g.setId));
    const n = peers.findIndex((x) => x.id === g.id) + 1;
    if (n < 1) return String(g.id);
    const si = setsOf(doc, g.objectiveId).findIndex((s) => s.id === g.setId);
    return 'SG-' + (si >= 0 ? String.fromCharCode(65 + si) : '') + n;
  }
  /* the same label the Key results tab shows: KR<position>, or KR-M<n> for milestone key results */
  function krLabel(doc, kr) {
    const list = krsOf(doc, kr.objectiveId);
    const i = list.findIndex((x) => x.id === kr.id);
    if (i >= 0 && kr.trackingType === 'milestone') return 'KR-M' + list.slice(0, i + 1).filter((x) => x.trackingType === 'milestone').length;
    return 'KR' + (i >= 0 ? i + 1 : '');
  }
  function componentLabel(C, k) {
    const P = pf(C);
    let nm = null;
    Object.keys(C.D.spec || {}).forEach((id) => {
      const sgs = (C.D.spec[id] || {}).stageGates || [];
      const c = sgs.find((g) => g.id === k.hostId);
      if (c && nm == null) nm = c.name || c.id;
    });
    const m = modelById(P, k.objectiveId);
    if (nm != null) return nm + (m ? ', ' + m.name : '');
    return m ? m.name : (k.objectiveId || k.hostId || '');
  }
  function hostLabel(C, ctx, k) {
    if (!k) return '';
    const P = pf(C), doc = docOf(C, ctx);
    const nm = (arr, id, f) => { const x = (arr || []).find((r) => r.id === id); return x ? (x[f] || x.id) : id; };
    if (k.hostType === 'product') { const p = productById(P, k.hostId); return 'product ' + (p ? p.name : k.hostId); }
    if (k.hostType === 'model') { const m = modelById(P, k.hostId); return 'model ' + (m ? m.name : k.hostId); }
    if (k.hostType === 'keyResult' && modelById(P, k.objectiveId)) return 'model ' + modelById(P, k.objectiveId).name + ' spec';
    if (k.hostType === 'initiative') return 'initiative ' + nm(P.initiatives, k.hostId, 'name');
    if (k.hostType === 'milestone') return 'milestone ' + nm(P.milestones, k.hostId, 'name');
    if (k.hostType === 'keyResult') return 'key result “' + clip(nm(doc.keyResults, k.hostId, 'statement'), 60) + '”';
    if (k.hostType === 'stageGate') return 'gate “' + nm(doc.stageGates, k.hostId, 'name') + '”';
    if (k.hostType === 'component') return 'component ' + componentLabel(C, k);
    return 'task “' + nm(doc.tasks, k.hostId, 'name') + '”';
  }
  /* the host a table belongs to, for sheet subtitles */
  function hostTitle(C, ctx, host) {
    const doc = docOf(C, ctx), P = pf(C);
    if (!host) return '';
    if (host.id === '__pending__') return 'New stage-gate';
    if (host.type === 'keyResult') { const kr = (doc.keyResults || []).find((x) => x.id === host.id); return kr ? krLabel(doc, kr) + ', ' + clip(kr.statement || kr.id, 80) : host.id; }
    if (host.type === 'stageGate') { const g = (doc.stageGates || []).find((x) => x.id === host.id); return g ? gateLabel(doc, g) + ', ' + (g.name || g.id) : host.id; }
    if (host.type === 'task') { const t = (doc.tasks || []).find((x) => x.id === host.id); return t ? 'Task, ' + (t.name || t.id) : host.id; }
    if (host.type === 'initiative') { const i = (P.initiatives || []).find((x) => x.id === host.id); return i ? 'Initiative, ' + i.name : host.id; }
    if (host.type === 'milestone') { const m = (P.milestones || []).find((x) => x.id === host.id); return m ? 'Milestone, ' + m.name : host.id; }
    return host.id;
  }
  function rankOf(P, hostType, objectiveId) {
    if (hostType === 'initiative' || hostType === 'milestone') return 5;
    if (hostType === 'product') return 4;
    if (hostType === 'keyResult' && modelById(P, objectiveId)) return 4;
    if (hostType === 'component') return 3;
    if (hostType === 'keyResult') return 2;
    if (hostType === 'stageGate') return 1;
    return 0;
  }
  function parentLevelOf(P, k) { return k.hostType === 'product' ? 'product' : (modelById(P, k.objectiveId) ? 'model' : k.hostType); }
  function defaultLinkType(parentType, childType) { return LINK_DEFAULTS[parentType + '>' + childType] || 'contribute'; }
  function nextLinkPriority(doc, P, parentId) {
    const parent = P.find((k) => k.id === parentId);
    let mx = 0;
    (doc.kpis || []).forEach((k) => {
      if (k.id === parentId) return;
      const isChild = (k.linkParent === parentId) || (parent && parent.groupId && k.groupId === parent.groupId && !k.isDefiner);
      if (isChild) mx = Math.max(mx, k.linkPriority || 0);
    });
    return mx + 1;
  }
  function familyOf(C, objId) {
    const P = pf(C), models = new Set(), products = new Set();
    const o = objById(P, objId);
    if (!o) return { models, products };
    const c = RD.effClass(o, P);
    let seeds = [];
    if (c.kind === 'model') seeds = [c.modelId];
    else if (c.kind === 'product') { products.add(c.productId); seeds = (P.models || []).filter((m) => m.productId === c.productId).map((m) => m.id); }
    seeds.forEach((mid) => {
      models.add(mid);
      ancestorModels(P, mid).forEach((m) => models.add(m));
      RD.descendantModels(mid, P.composition || []).forEach((m) => models.add(m));
    });
    models.forEach((mid) => { const m = modelById(P, mid); if (m && m.productId) products.add(m.productId); });
    return { models, products };
  }
  function isFamilial(C, k, fam) {
    if (k.hostType === 'product') return fam.products.has(k.hostId);
    if (k.hostType === 'keyResult' && modelById(pf(C), k.objectiveId)) return fam.models.has(k.objectiveId);
    if (k.hostType === 'component') return fam.models.has(k.objectiveId);
    return false;
  }
  /* metrics this host may link to: higher levels only, this objective's family, never one the host already links */
  function linkCandidates(C, ctx, host, objId, P) {
    const Pf = pf(C), doc = docOf(C, ctx);
    const O = host.type === 'initiative' ? null : objId;
    const o = objById(Pf, O);
    const initId = o ? o.initiativeId : null;
    const msIds = new Set((Pf.milestones || []).filter((m) => m.initiativeId === initId).map((m) => m.id));
    const srcRank = rankOf(Pf, host.type, O);
    const fam = familyOf(C, O);
    const occupied = new Set((doc.kpis || []).filter((k) => k.hostType === host.type && k.hostId === host.id).map((k) => RD.definerOf(k, P).id));
    const seen = new Set(), out = [];
    P.forEach((k) => {
      const def = RD.definerOf(k, P);
      if (def.pull) return;                                           // a pulled KPI is not a metric to link to
      const inScope =(def.objectiveId === O) || (def.hostType === 'initiative' && def.hostId === initId) ||
        (def.hostType === 'milestone' && msIds.has(def.hostId)) || isFamilial(C, def, fam);
      if (!inScope) return;
      if (rankOf(Pf, def.hostType, def.objectiveId) <= srcRank) return;
      if (seen.has(def.id) || occupied.has(def.id)) return;
      seen.add(def.id);
      out.push(def);
    });
    return out;
  }
  /* newest provenance-carrying reading of a KPI (Execution only) */
  function latestImported(doc, kpiId) {
    let best = null;
    ownReadings(doc, kpiId).forEach((u) => {
      if (!u || !u.src || u.src.portal !== 'analysis') return;
      if (!best || (u.timestamp || 0) > (best.timestamp || 0)) best = u;
    });
    return best;
  }
  function uniqueReadingId(doc, base) {
    const ids = new Set((doc.kpiUpdates || []).map((u) => u.id));
    if (!ids.has(base)) return base;
    let i = 2;
    while (ids.has(base + '-' + i)) i++;
    return base + '-' + i;
  }
  /* readings posted here are strictly newer than the KPI's newest, so "latest" never ties */
  function nextStamp(C, doc, kpiId) {
    let ts = C.now();
    ownReadings(doc, kpiId).forEach((u) => { if ((u.timestamp || 0) >= ts) ts = (u.timestamp || 0) + 1; });
    return ts;
  }
  function me(C) { const v = C.viewer ? C.viewer() : null; return v ? v.email : ''; }

  /* ========================================================= KPI table */
  function table(C, ctx, host, opts) {
    opts = opts || {};
    host = host || {};
    try {
      return host.id === '__pending__' ? pendingTable(C, ctx, host, opts) : tableVM(C, ctx, host, opts);
    } catch (e) {
      console.error('[kpi] table failed', e);
      (C._vmErrors || (C._vmErrors = [])).push('kpi.table: ' + (e && e.message ? e.message : e));
      return emptyTable(host, opts, 'This table could not be drawn.');
    }
  }
  function emptyTable(host, opts, text) {
    return {
      key: (opts && opts.key) || ((host.type || '') + ':' + (host.id || '')), head: { name: 'KPI', target: 'Target' },
      rows: [], has: false, empty: true, emptyText: text || 'No KPIs yet.', cols: 6, showActs: false,
      canAdd: false, add: null, addLabel: '', canLink: false, link: null, linkLabel: '', canConnect: false, connect: null, hasFoot: false,
      count: 0, met: 0, partialCount: 0, summary: '', hasHl: false, isGate: false
    };
  }
  function tableVM(C, ctx, host, opts) {
    const isGate = host.type === 'stageGate';
    const portfolioHost = host.type === 'initiative' || host.type === 'milestone';
    const key = opts.key || (host.type + ':' + host.id);
    const ro = C.isRo();
    const editable = !ro && !opts.readOnly && !portfolioHost;
    const objScope = opts.objScope !== undefined ? opts.objScope : (portfolioHost ? null : ctx.objId);
    const P = pool(C, ctx), em = ctx.em, doc = docOf(C, ctx);
    const T = { C, ctx, host, key, isGate, editable, ro, P, em, doc, portfolioHost, readOnly: !!opts.readOnly || portfolioHost };
    const list = P.filter((k) => k.objectiveId === objScope && k.hostType === host.type && k.hostId === host.id);
    const rows = list.map((k) => rowVM(T, k));
    const met = rows.filter((r) => r._s != null && r._s >= 100).length;
    let partialCount = 0;
    try { partialCount = RD.hostSample(host.type, host.id, em).partialCount; } catch (e) { partialCount = 0; }
    const canAdd = editable && (opts.canAdd == null || !!opts.canAdd);
    const summary = rows.length ? (isGate ? met + ' of ' + rows.length + ' met' : met + ' of ' + rows.length + ' on target') + (partialCount ? ', ' + partialCount + ' partial' : '') : '';
    const showActs = editable;
    const canConnect = !!opts.connect && APP !== 'sales' && editable && (host.type === 'keyResult' || host.type === 'stageGate' || host.type === 'task');
    return {
      key, isGate, head: { name: isGate ? 'Target' : 'KPI', target: isGate ? 'Pass criterion' : 'Target' },
      rows, has: rows.length > 0, empty: !rows.length,
      emptyText: opts.emptyText || (T.readOnly || !editable ? (isGate ? 'No targets.' : 'No KPIs.') : (isGate ? 'No targets yet. Add one, or link a measurement from another level.' : 'No KPIs yet. Add one, or link a measurement from another level.')),
      cols: showActs ? 6 : 5, showActs,
      canAdd, addLabel: opts.addLabel || (isGate ? 'Add target' : 'Add KPI'),
      add: () => openTarget(C, ctx, host, null),
      canLink: canAdd, linkLabel: opts.linkLabel || 'Link a metric',
      link: () => openLink(C, ctx, host),
      canConnect, connect: () => openConnect(C, ctx, { host }),
      hasFoot: canAdd || canConnect,
      count: rows.length, met, partialCount, summary,
      hasHl: rows.some((r) => r.hl)
    };
  }
  function rowVM(T, k) {
    const { C, ctx, P, em, doc, key, editable, isGate } = T;
    const name = RD.kpiName(k, P) || '(unnamed)';
    const dir = RD.kpiDirection(k, P), unit = RD.kpiUnit(k, P) || '';
    const def = RD.definerOf(k, P) || k;
    const isStat = def.targetType === 'statistical', isBin = def.targetType === 'binary';
    const pp = RD.kpiScoreParts(k, P, em);
    const tgt = RD.effTarget(k, P), cv = RD.effValue(k, P, em);
    const member = isMember(k);
    const kids = RD.childrenOf(k.id, P).length;
    const lk = member ? RD.linkOf(k, P) : null;
    const srcNm = member ? RD.kpiSourceName(k, P) : '';
    const renamed = member && k.localName != null && String(k.localName).trim() !== '' && k.localName !== srcNm;
    const badges = [];
    if (member) badges.push({ label: renamed ? 'Linked: ' + clip(srcNm, 28) : 'Linked', title: 'Inherits from ' + hostLabel(C, ctx, def) + (lk ? ' (' + lk.type + ')' : '') + (renamed ? ', ' + srcNm : '') });
    if (kids) badges.push({ label: 'Defines ' + kids, title: kids === 1 ? 'Another KPI links to this one' : kids + ' other KPIs link to this one' });
    if (T.portfolioHost && doc.kpis && doc.kpis.indexOf(k) >= 0) badges.push({ label: 'Local', title: 'Defined locally in this division; move it to the portfolio from the Planning app' });
    const crit = critText(dir, tgt, unit, isBin);
    let critTag = '';
    if (member) critTag = (lk && lk.type === 'direct') ? 'Inherited' : (k.target != null ? 'Override' : 'Inherited');
    const exp = pp.expected || 0, n = pp.n || 0, complete = !exp || n >= exp;
    const rawTone = F.band(pp.raw);
    let cur = 'No reading', curTitle = '';
    if (cv != null) {
      if (isBin) { cur = Number(cv) >= 1 ? 'Pass' : 'Fail'; curTitle = 'Reading ' + fmtNum(cv) + ' (1 or more passes)'; }
      else cur = withUnit(fmtVal(cv, isStat), unit);
    }
    let sub = '', subCls = 'kpi-sub';
    if (isStat) {
      const sw = STAT_WORD[def.statistic || 'average'] || 'Average';
      if (exp) { sub = sw + ', ' + n + ' of ' + exp + ' samples'; subCls += complete ? ' tx-ok' : ' tx-warn'; }
      else if (cv != null) { const cnt = RD.readingCount(RD.readingSourceId(k, P), em); sub = sw + ' of ' + plural(cnt, 'reading'); }
    }
    const st = statusOf(pp, complete);
    const s = pp.score;
    const scoreTone = F.band(s);
    const hatchW = (pp.partial && pp.raw != null && s != null) ? Math.max(0, Math.min(100, pp.raw) - Math.max(0, Math.min(100, s))) : 0;
    /* editing state */
    const edKey = key + '|' + k.id;
    const ed = C.state.kpi_ed && C.state.kpi_ed.k === edKey ? C.state.kpi_ed : null;
    const rdOpen = C.state.kpi_rd && C.state.kpi_rd.k === edKey;
    const canPost = editable;
    const viewOnly = isStat && T.ro && !T.readOnly;
    const menuId = 'kpi.m:' + edKey;
    const menuOpen = C.isMenu(menuId);
    const imp = APP !== 'sales' ? latestImported(doc, k.id) : null;
    const provOpen = !!(imp && C.state.kpi_prov && C.state.kpi_prov[edKey]);
    const hasOwn = ownReadings(doc, k.id).length > 0;
    const menuItems = [];
    if (editable) {
      if (member) {
        menuItems.push({ label: 'Edit override', cls: 'mi', fn: () => { C.closeMenus(); openOverride(C, ctx, k.id); } });
        menuItems.push({ label: 'Unlink', cls: 'mi', fn: () => { C.closeMenus(); unlink(C, ctx, k.id); } });
      } else {
        menuItems.push({ label: isGate ? 'Edit target' : 'Edit KPI', cls: 'mi', fn: () => { C.closeMenus(); openTarget(C, ctx, { type: k.hostType, id: k.hostId }, k.id); } });
      }
      if (isStat) menuItems.push({ label: 'Readings', cls: 'mi', fn: () => { C.closeMenus(); toggleDrawer(C, edKey, k.id, true); } });
      menuItems.push({ label: isGate ? 'Delete target' : 'Delete KPI', cls: 'mi bad', fn: () => { C.closeMenus(); del(C, ctx, k.id); } });
    }
    const row = {
      id: k.id, _s: s,
      dk: 'kpi:' + k.id,
      hl: !!(C.state.kpi_hl && C.state.kpi_hl === k.id),
      rowCls: 'kpi-row' + ((C.state.kpi_hl && C.state.kpi_hl === k.id) ? ' hl' : '') + (rdOpen ? ' open' : ''),
      name, nameBtn: editable, openTitle: member ? 'Edit the override for ' + name : (isGate ? 'Edit target ' : 'Edit KPI ') + name,
      open: () => openEdit(C, ctx, k.id),
      badges, hasBadges: badges.length > 0,
      crit, critTag, hasCritTag: !!critTag,
      cur, curTitle, noRead: cv == null, curCls: 'kpi-val' + (cv == null ? ' none' : rawTone === 'ok' ? ' tx-ok' : rawTone === 'warn' ? ' tx-warn' : rawTone === 'bad' ? ' tx-bad' : ''),
      canPost: canPost && !ed, showStatic: !ed && !(canPost || viewOnly),
      /* one value button: post / readings when editable; in the read-only preview a statistical KPI still shows its
         sample (view only). Tables a host marks readOnly (initiative metrics) stay values only, as today. */
      valBtn: (canPost || viewOnly) && !ed,
      valClick: canPost ? () => openPost(C, ctx, key, k.id) : () => toggleDrawer(C, edKey, k.id, !rdOpen),
      /* "Post a reading for NAME" / "Readings for NAME" are the names other modules' tests click; a statistical KPI with no value yet says "Add readings" */
      valAria: isStat ? ((canPost && cv == null) ? 'Add readings for ' : 'Readings for ') + name : 'Post a reading for ' + name,
      valTitle: canPost ? (isStat ? 'Show the sample and add readings' : 'Click to post a reading') : 'Show the sample',
      valExpanded: isStat ? (rdOpen ? 'true' : 'false') : null,
      valText: canPost && cv == null ? (isStat ? 'Add readings' : 'Post a reading') : cur,
      editing: !!ed,
      ed: ed ? {
        v: ed.v == null ? '' : String(ed.v),
        aria: 'New value for ' + name,
        ph: isBin ? '1 = pass, 0 = fail' : (hasOwn ? 'Blank clears' : 'Value'),
        unit: isBin ? '' : unit, hasUnit: !isBin && !!unit,
        err: ed.err || '', hasErr: !!ed.err,
        onChange: (e) => { const cur2 = C.state.kpi_ed; if (cur2 && cur2.k === edKey) C.setState({ kpi_ed: Object.assign({}, cur2, { v: e.target.value, err: '' }) }); },
        onKey: (e) => {
          if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); commitPost(C, ctx, edKey, k.id, 'enter'); }
          else if (e.key === 'Escape') { if (e.preventDefault) e.preventDefault(); C.setState({ kpi_ed: null }); }
        },
        onBlur: () => commitPost(C, ctx, edKey, k.id, 'blur'),
        save: () => commitPost(C, ctx, edKey, k.id, 'enter'),
        cancel: () => C.setState({ kpi_ed: null })
      } : null,
      sub, subCls, hasSub: !!sub,
      chip: !!imp, chipTitle: imp ? [imp.src.sample || '', condText(imp.src.cond), (imp.src.run_t || '').slice(0, 10)].filter(Boolean).join(', ') : '',
      chipOpen: provOpen ? 'true' : 'false',
      chipAria: 'Show where the imported readings of ' + name + ' came from',
      toggleProv: () => { const o = Object.assign({}, C.state.kpi_prov || {}); if (o[edKey]) delete o[edKey]; else o[edKey] = true; C.setState({ kpi_prov: o }); },
      score: F.score(s), hasScore: s != null, scoreCls: 'kpi-score-v ' + 'tx-' + scoreTone,
      barFill: 'width: ' + (s == null ? 0 : Math.max(0, Math.min(100, s))) + '%', barCls: 'fill ' + F.tone(scoreTone),
      hasHatch: hatchW > 0, hatchStyle: 'left: ' + Math.max(0, Math.min(100, s || 0)) + '%; width: ' + hatchW + '%',
      partial: !!pp.partial,
      math: pp.partial ? Math.round(pp.raw) + ' × ' + n + '/' + exp + ' samples' : '',
      mathTitle: pp.partial ? Math.round(pp.raw) + ' on the samples so far, discounted to ' + n + ' of ' + exp : '',
      stWord: st.word, stCls: 'st ' + F.tone(st.tone),
      hasMenu: menuItems.length > 0, menuId, menuOpen, menuAria: 'Actions for ' + name,
      toggleMenu: () => C.toggleMenu(menuId),
      menu: menuItems,
      drawer: rdOpen ? drawerVM(T, k, edKey, { name, unit, isStat, def, pp }) : null,
      provOpen,
      prov: provOpen ? provVM(doc, k.id, imp) : null
    };
    if (k.pull) pulledRow(T, k, row, name, edKey);
    return row;
  }
  /* a pulled KPI (mods/pull): its value is pulled from other work, so it takes no readings. The pull module
     draws the row; without it the row shows its value only. */
  function pulledRow(T, k, row, name, edKey) {
    if (typeof PULL !== 'undefined') { PULL.row(T.C, T.ctx, T, k, row, { name: name, edKey: edKey }); return; }
    Object.assign(row, { canPost: false, valBtn: false, showStatic: true, editing: false, ed: null, drawer: null, nameBtn: false,
      sub: 'Pulled from other work', subCls: 'kpi-sub', hasSub: true, menu: [], hasMenu: false });
  }
  function statusOf(pp, complete) {
    const s = pp.score, rs = pp.raw;
    const rb = F.band(rs);
    const rawWord = rs == null ? 'Open' : rs >= 100 ? 'On track' : rb === 'ok' ? 'On track' : rb === 'warn' ? 'Near' : 'Below';
    const metOk = s != null && s >= 100 && complete;
    const word = s == null ? 'Open' : pp.partial ? rawWord : metOk ? 'Met' : rawWord;
    return { word, tone: rs == null ? 'none' : rb };
  }
  function provVM(doc, kpiId, u) {
    const s = u.src || {};
    const n = ownReadings(doc, kpiId).filter((x) => x && x.src && x.src.portal === 'analysis').length;
    const rows = [
      { k: 'Sample', v: s.sample || '—' },
      { k: 'Analysis', v: (s.bucket || '—') + ', ' + (s.key || '—') },
      { k: 'Condition', v: condText(s.cond) || 'None recorded' },
      { k: 'Run', v: (s.run_t ? isoStamp(s.run_t) : '—') + (s.script ? ', ' + s.script : '') },
      { k: 'Job', v: (s.job_id || '—') + (s.bin_id ? ', bin ' + s.bin_id : '') },
      { k: 'Imported', v: s.imported_t ? isoStamp(s.imported_t) : '—' }
    ];
    if (s.scale && Number(s.scale) !== 1) rows.push({ k: 'Scaled', v: '×' + fmtNum(s.scale) + ' on import (was ' + fmtNum(s.value_raw) + ')' });
    return { title: n > 1 ? 'Imported from analysis, ' + n + ' readings' : 'Imported from analysis', rows };
  }

  /* ---- readings drawer (statistical KPIs): the sample, its batches, add / remove / new batch ---- */
  /* every reading posted to the sample, from every document in the map (a portfolio target's readings live in the portfolio) */
  function sampleReads(em, src) {
    return RD.readingsFor(src, em).filter((u) => !isNaN(Number(u.value)));
  }
  function readSig(u) { return (u.id || '') + '@' + (u.timestamp || 0) + '#' + u.value; }
  function drawerVM(T, k, edKey, info) {
    const { C, ctx, P, em, doc, editable } = T;
    const def = info.def;
    const src = RD.readingSourceId(k, P);
    const stat = def.statistic || 'average';
    const statLbl = STAT_WORD[stat] || stat;
    const unit = stat === 'cv' ? '%' : info.unit;
    const dir = RD.kpiDirection(k, P), tgt = RD.effTarget(k, P);
    const reads = sampleReads(em, src);
    const curReads = RD.currentBatchReadings(reads), xs = curReads.map((u) => Number(u.value));
    const computed = xs.length ? RD.computeStat(stat, xs) : null;
    const exp = Number(def.readCount) > 0 ? Number(def.readCount) : 0, n = xs.length, complete = !exp || n >= exp;
    const batches = [];
    reads.forEach((u) => { const b = u.batch != null ? String(u.batch) : ''; if (batches.indexOf(b) < 0) batches.push(b); });
    const curBatch = RD.latestBatchId(reads);
    const pp = info.pp;
    const owed = pp.partial ? (pp.expected - pp.n) : 0;
    const armed = C.state.kpi_rdArm || '';
    const pend = C.state.kpi_rdBatch && C.state.kpi_rdFor === edKey ? C.state.kpi_rdBatch : '';
    const borrowed = src !== k.id;
    const srcK = borrowed ? P.find((x) => x.id === src) : null;
    const s = pp.score;
    const hatchW = pp.partial && pp.raw != null && s != null ? Math.max(0, Math.min(100, pp.raw) - Math.max(0, Math.min(100, s))) : 0;
    return {
      title: 'Readings for ' + info.name,
      close: () => closeDrawer(C),
      statLine: statLbl + ' = ' + (computed == null ? '—' : withUnit(fmtNum(Math.round(computed * 1000) / 1000), unit)),
      cnt: exp ? n + ' of ' + exp + ' samples' : plural(n, 'reading'),
      cntCls: 'st ' + (complete ? 't-ok' : 't-warn'),
      tgt: 'Target ' + critText(dir, tgt, unit, false),
      borrowed, borrowText: borrowed ? 'This KPI borrows the sample of “' + (srcK ? RD.kpiName(srcK, P) : src) + '”. Readings added here go to that sample.' : '',
      partial: !!pp.partial,
      pt: pp.partial ? {
        score: String(Math.round(s)), scoreCls: 'strong tx-' + F.band(s),
        raw: Math.round(pp.raw) + ' without discount',
        fill: 'width: ' + Math.max(0, Math.min(100, s)) + '%', fillCls: 'fill ' + F.tone(F.band(s)),
        hatch: 'left: ' + Math.max(0, Math.min(100, s)) + '%; width: ' + hatchW + '%',
        math: Math.round(pp.raw) + ' × ' + pp.n + '/' + pp.expected + ' samples = ' + Math.round(s),
        more: plural(owed, 'more reading') + ' to a full check-in'
      } : null,
      rows: reads.map((u) => {
        const sig = readSig(u);
        const isArmed = armed === sig;
        const stale = (u.batch != null ? String(u.batch) : '') !== curBatch;
        const v = fmtNum(u.value);
        return {
          v: withUnit(v, info.unit), when: F.stamp(u.timestamp), note: u.note || '', hasNote: !!u.note,
          by: u.by ? F.first(u.by) : '', hasBy: !!u.by,
          stale, cls: 'kpi-ditem' + (stale ? ' stale' : ''),
          imported: !!(u.src && u.src.portal === 'analysis' && APP !== 'sales'),
          canRm: editable,
          rmLabel: isArmed ? 'Confirm' : 'Remove', rmCls: isArmed ? 'btn xs danger solid' : 'btn xs q',
          rmAria: isArmed ? 'Confirm removing ' + v : 'Remove reading ' + v,
          rm: () => removeReading(C, ctx, edKey, sig)
        };
      }),
      none: !reads.length,
      noneText: editable ? 'No readings yet. Add the first measurement below.' : 'No readings yet.',
      canEdit: editable,
      roNote: T.ro ? 'Read-only view — editing is disabled.' : (T.portfolioHost ? 'Readings for this target are posted in the Planning app.' : 'Readings can’t be added here.'),
      hasRoNote: !editable,
      v: C.state.kpi_rdFor === edKey ? (C.state.kpi_rdv || '') : '',
      vAria: 'New reading for ' + info.name,
      onV: (e) => C.setState({ kpi_rdv: e.target.value, kpi_rdFor: edKey, kpi_rdErr: '' }),
      onKey: (e) => {
        if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); addReading(C, ctx, edKey, k.id); }
        else if (e.key === 'Escape') { if (e.preventDefault) e.preventDefault(); closeDrawer(C); }
      },
      add: () => addReading(C, ctx, edKey, k.id),
      err: C.state.kpi_rdFor === edKey ? (C.state.kpi_rdErr || '') : '',
      hasErr: !!(C.state.kpi_rdFor === edKey && C.state.kpi_rdErr),
      newBatch: () => {
        C.setState({ kpi_rdBatch: RD.newBatchId(), kpi_rdFor: edKey, kpi_rdArm: '' });
        C.toast('New batch started. The next reading begins a fresh sample.', 'ok');
      },
      pending: !!pend,
      hint: (pend ? 'New batch started: the next reading begins it. ' : '') + 'Each entry is one measurement; the ' + statLbl.toLowerCase() + ' above uses the current batch' + (batches.length > 1 ? ' (' + batches.length + ' batches recorded).' : '.')
    };
  }
  function toggleDrawer(C, edKey, kpiId, open) {
    C.setState({ kpi_rd: open ? { k: edKey, id: kpiId } : null, kpi_rdv: '', kpi_rdArm: '', kpi_rdBatch: '', kpi_rdErr: '', kpi_rdFor: open ? edKey : '', kpi_ed: null, menu: '' });
  }
  function closeDrawer(C) { C.setState({ kpi_rd: null, kpi_rdv: '', kpi_rdArm: '', kpi_rdBatch: '', kpi_rdErr: '', kpi_rdFor: '' }); }
  function addReading(C, ctx, edKey, kpiId) {
    if (!C.guard()) return;
    const v = String(C.state.kpi_rdFor === edKey ? (C.state.kpi_rdv || '') : '').trim();
    const num = K.num(v);
    if (num == null) { C.setState({ kpi_rdErr: v ? 'Use a number, like 1.85.' : 'Type a value first.', kpi_rdFor: edKey }); return; }
    const P = buildPool(C, ctx);
    const k = P.find((x) => x.id === kpiId);
    if (!k || k.pull) return;                                         // a pulled KPI takes no readings
    const src = RD.readingSourceId(k, P);
    const pend = C.state.kpi_rdFor === edKey ? (C.state.kpi_rdBatch || '') : '';
    C.mutate((D) => {
      const doc = D.docs[ctx.docKey] || docOf(C, ctx);
      if (!Array.isArray(doc.kpiUpdates)) doc.kpiUpdates = [];
      /* a new reading joins the CURRENT batch, so adding one never silently starts a new sample */
      const b = pend || RD.latestBatchId(sampleReads(ctx.em, src));
      const ts = nextStamp(C, doc, src);
      const row = { id: uniqueReadingId(doc, 'UPD-' + src + '-' + ts), kpiId: src, value: num, timestamp: ts, note: '' };
      if (b) row.batch = b;
      if (me(C)) row.by = me(C);
      doc.kpiUpdates.push(row);
    }, { msg: 'Reading added.' });
    C.setState({ kpi_rdv: '', kpi_rdBatch: '', kpi_rdArm: '', kpi_rdErr: '', kpi_rdFor: edKey });
  }
  function removeReading(C, ctx, edKey, sig) {
    if (!C.guard()) return;
    if (C.state.kpi_rdArm !== sig) { C.setState({ kpi_rdArm: sig, kpi_rdFor: edKey }); return; }
    C.mutate((D) => {
      const doc = D.docs[ctx.docKey] || docOf(C, ctx);
      const i = (doc.kpiUpdates || []).findIndex((u) => readSig(u) === sig);
      if (i < 0) return false;
      doc.kpiUpdates.splice(i, 1);
    }, { msg: 'Reading removed.' });
    C.setState({ kpi_rdArm: '' });
  }

  /* ---- posting a single reading inline (non-statistical KPIs) ---- */
  function openPost(C, ctx, key, kpiId) {
    const edKey = key + '|' + kpiId;
    const P = buildPool(C, ctx);
    const k = P.find((x) => x.id === kpiId);
    if (!k) return;
    const def = RD.definerOf(k, P) || k;
    if (def.targetType === 'statistical' || k.pull) {                 // a pulled KPI's value shows what it pulled
      const open = !(C.state.kpi_rd && C.state.kpi_rd.k === edKey);
      toggleDrawer(C, edKey, kpiId, open);
      return;
    }
    if (!C.guard()) return;
    const cur = RD.effValue(k, P, ctx.em);
    C.setState({ kpi_ed: { k: edKey, id: kpiId, v: cur == null ? '' : String(cur), err: '' }, kpi_rd: null, menu: '' });
  }
  /* BLANK = CLEAR: a KPI's own readings outrank its links, so all of them go for the link to take over again */
  function clearOwn(C, ctx, kpiId) {
    let n = 0;
    C.mutate((D) => {
      const doc = D.docs[ctx.docKey] || docOf(C, ctx);
      const before = (doc.kpiUpdates || []).length;
      doc.kpiUpdates = (doc.kpiUpdates || []).filter((u) => u.kpiId !== kpiId);
      n = before - doc.kpiUpdates.length;
      if (!n) return false;
    }, { msg: null });
    if (!n) return;
    let after = null;
    try { const P = buildPool(C, ctx); const k = P.find((x) => x.id === kpiId); after = k ? RD.effValue(k, P, ctx.em) : null; } catch (e) { after = null; }
    C.toast('Cleared ' + plural(n, 'reading') + '.' + (after != null ? ' It reads its linked KPIs again.' : ''), 'ok');
  }
  function commitPost(C, ctx, edKey, kpiId, how) {
    const ed = C.state.kpi_ed;
    if (!ed || ed.k !== edKey) return;
    const v = String(ed.v == null ? '' : ed.v).trim();
    const P = buildPool(C, ctx);
    const k = P.find((x) => x.id === kpiId);
    if (!k || k.pull) { C.setState({ kpi_ed: null }); return; }
    const doc = docOf(C, ctx);
    if (v === '') {
      /* BLANK = CLEAR this KPI's own readings, so a linked KPI reads its link again (explicit Enter only) */
      const own = ownReadings(doc, kpiId);
      C.setState({ kpi_ed: null });
      if (!own.length || how === 'blur') return;
      if (own.length === 1) { clearOwn(C, ctx, kpiId); return; }
      const linksIn = RD.childrenOf(kpiId, P).length + RD.sourcesOf(k, P).length;
      C.confirm({
        title: 'Clear ' + own.length + ' readings?',
        body: 'This removes all ' + own.length + ' of this KPI’s own readings' + (linksIn ? ', so it reads its linked KPIs again' : '') + '. This can’t be undone.',
        ok: 'Clear readings', danger: true,
        onOk: () => clearOwn(C, ctx, kpiId)
      });
      return;
    }
    const num = K.num(v);
    const isBin = (RD.definerOf(k, P) || k).targetType === 'binary';
    if (num == null) {
      if (how === 'blur') { C.setState({ kpi_ed: null }); return; }
      C.setState({ kpi_ed: Object.assign({}, ed, { err: isBin ? 'Use 1 for pass or 0 for fail.' : 'Use a number, like 1.85.' }) });
      return;
    }
    const cur = RD.effValue(k, P, ctx.em);
    C.setState({ kpi_ed: null });
    if (cur != null && num === Number(cur)) return;                 // unchanged: nothing to post
    C.mutate((D) => {
      const d2 = D.docs[ctx.docKey] || doc;
      if (!Array.isArray(d2.kpiUpdates)) d2.kpiUpdates = [];
      const ts = nextStamp(C, d2, kpiId);
      const row = { id: uniqueReadingId(d2, 'UPD-' + kpiId + '-' + ts), kpiId, value: num, timestamp: ts, note: '' };
      if (me(C)) row.by = me(C);
      d2.kpiUpdates.push(row);
    }, { msg: 'Reading posted.' });
  }

  /* ---- the same controls for rows another module draws (the Overview's review table, October 19) ---- */
  /* One KPI's reading controls exactly as its row in the KPI table has them (rowVM): the value button (post a
     reading; a statistical KPI's readings), the inline editor while posting, and the readings drawer, on the
     same state (kpi_ed / kpi_rd, keyed by `key` and the KPI), so a reading posted there is posted, checked and
     saved as on its tab. `key` names the caller's own copy of the controls (the review: 'review:keyResult:KR-…'),
     so the tab's table and the caller never open each other's editor. */
  function post(C, ctx, k, key) {
    if (!k || !k.id) return null;
    const host = { type: k.hostType, id: k.hostId };
    const portfolioHost = host.type === 'initiative' || host.type === 'milestone';
    const ro = C.isRo();
    const T = {
      C, ctx, host, key: key || ('post:' + host.type + ':' + host.id), isGate: host.type === 'stageGate',
      editable: !ro && !portfolioHost, ro, P: pool(C, ctx), em: ctx.em, doc: docOf(C, ctx), portfolioHost, readOnly: portfolioHost
    };
    const r = rowVM(T, k);
    return {
      btn: !!r.valBtn, text: r.valText, aria: r.valAria, title: r.valTitle, expanded: r.valExpanded, cls: r.curCls,
      click: r.valClick, canPost: !!r.canPost || !!r.editing, editing: !!r.editing, ed: r.ed, drawer: r.drawer, cur: r.cur
    };
  }

  /* ---- draft gate targets (a gate that is still being added) ---- */
  function pendingTable(C, ctx, host, opts) {
    const list = Array.isArray(opts.pending) ? opts.pending : [];
    const ro = C.isRo();
    const editable = !ro && !opts.readOnly;
    const key = opts.key || 'stageGate:__pending__';
    const set = (l) => { if (typeof opts.onPending === 'function') opts.onPending(l); };
    const rows = list.map((t, i) => {
      const isBin = t.targetType === 'binary', isStat = t.targetType === 'statistical';
      const menuId = 'kpi.m:' + key + '|' + i;
      const nm = t.name || '(unnamed)';
      return {
        id: 'draft-' + i, _s: null, dk: 'kpi-draft:' + i, hl: false, rowCls: 'kpi-row draft',
        name: nm, nameBtn: editable, openTitle: 'Edit target ' + nm,
        open: () => openTarget(C, ctx, host, null, { value: t, onSave: (nt) => { const l = list.slice(); l[i] = nt; set(l); } }),
        badges: [], hasBadges: false,
        crit: critText(t.direction, t.target, t.unit || '', isBin), critTag: '', hasCritTag: false,
        cur: 'Not measured yet', curTitle: '', noRead: true, curCls: 'kpi-val none',
        canPost: false, showStatic: true,
        valBtn: false, valClick: null, valAria: '', valTitle: '', valExpanded: null, valText: '',
        editing: false, ed: null,
        sub: isStat ? (STAT_WORD[t.statistic || 'average'] || 'Average') + (t.readCount ? ', ' + t.readCount + ' samples expected' : '') : '', subCls: 'kpi-sub', hasSub: isStat,
        chip: false, chipTitle: '', chipOpen: 'false', chipAria: '', toggleProv: null,
        score: '—', hasScore: false, scoreCls: 'kpi-score-v', barFill: 'width: 0%', barCls: 'fill', hasHatch: false, hatchStyle: '',
        partial: false, math: '', mathTitle: '', stWord: 'Draft', stCls: 'st t-none',
        hasMenu: editable, menuId, menuOpen: C.isMenu(menuId), menuAria: 'Actions for ' + nm,
        toggleMenu: () => C.toggleMenu(menuId),
        menu: editable ? [
          { label: 'Edit target', cls: 'mi', fn: () => { C.closeMenus(); openTarget(C, ctx, host, null, { value: t, onSave: (nt) => { const l = list.slice(); l[i] = nt; set(l); } }); } },
          { label: 'Remove target', cls: 'mi bad', fn: () => { C.closeMenus(); const l = list.slice(); l.splice(i, 1); set(l); C.toast('Target removed.', 'ok'); } }
        ] : [],
        drawer: null, provOpen: false, prov: null
      };
    });
    return {
      key, isGate: true, head: { name: 'Target', target: 'Pass criterion' },
      rows, has: rows.length > 0, empty: !rows.length,
      emptyText: opts.emptyText || 'No targets yet. Add measurable pass criteria; they are saved with the gate.',
      cols: editable ? 6 : 5, showActs: editable,
      canAdd: editable, addLabel: opts.addLabel || 'Add target',
      add: () => openTarget(C, ctx, host, null, { onSave: (t) => set(list.concat([t])) }),
      canLink: false, link: null, linkLabel: '',
      canConnect: false, connect: null, hasFoot: editable,
      count: rows.length, met: 0, partialCount: 0, summary: rows.length ? plural(rows.length, 'draft target') : '', hasHl: false
    };
  }
  function commitPending(doc, objId, gateId, list) {
    if (!Array.isArray(doc.kpis)) doc.kpis = [];
    (list || []).forEach((t) => {
      const kid = RD.allocId('kpi', objId, (doc.kpis || []).map((x) => x.id));
      doc.kpis.push(Object.assign({ id: kid, objectiveId: objId, hostType: 'stageGate', hostId: gateId, groupId: null, isDefiner: true }, K.clone(t)));
    });
  }
  function removeHost(doc, hostType, hostId) {
    const kids = (doc.kpis || []).filter((k) => k.hostType === hostType && k.hostId === hostId).map((k) => k.id);
    doc.kpis = (doc.kpis || []).filter((k) => !(k.hostType === hostType && k.hostId === hostId));
    doc.kpiUpdates = (doc.kpiUpdates || []).filter((u) => kids.indexOf(u.kpiId) === -1);
    return kids.length;
  }

  /* ======================================================= row actions */
  function openEdit(C, ctx, kpiId) {
    const doc = docOf(C, ctx);
    const k = (doc.kpis || []).find((x) => x.id === kpiId);
    if (!k) return;
    if (k.pull && typeof PULL !== 'undefined') { PULL.openEdit(C, ctx, k); return; }
    if (isMember(k)) openOverride(C, ctx, kpiId);
    else openTarget(C, ctx, { type: k.hostType, id: k.hostId }, kpiId);
  }
  function del(C, ctx, kpiId) {
    if (!C.guard()) return;
    const doc = docOf(C, ctx), P = buildPool(C, ctx);
    const k = (doc.kpis || []).find((x) => x.id === kpiId);
    if (!k) return;
    const kids = RD.childrenOf(kpiId, P).length;
    if (kids) { C.toast('This KPI defines a linked metric — unlink its members first (' + plural(kids, 'KPI links', 'KPIs link') + ' to it).', 'err'); return; }
    const nm = RD.kpiName(k, P) || 'this KPI';
    const isGate = k.hostType === 'stageGate';
    const nRead = ownReadings(doc, kpiId).length;
    const borrowers = (doc.kpis || []).filter((x) => x.readsFrom === kpiId).length;
    const feeds = P.filter((x) => (x.sources || []).indexOf(kpiId) >= 0).map((x) => '“' + (RD.kpiName(x, P) || x.id) + '”');
    const docKey = ctx.docKey;
    C.confirm({
      title: 'Delete “' + nm + '”?',
      body: (nRead ? 'Its ' + plural(nRead, 'reading') + ' will be deleted too. ' : 'It has no readings. ') +
        (borrowers ? plural(borrowers, 'other KPI borrows', 'other KPIs borrow') + ' its sample and will have no readings. ' : '') +
        (feeds.length ? 'The milestone target ' + F.list(feeds) + ' reads its value from this KPI. ' : '') + 'This can’t be undone.',
      ok: isGate ? 'Delete target' : 'Delete KPI', danger: true,
      onOk: () => {
        const ok = C.mutate((D) => {
          const d2 = D.docs[docKey] || doc;
          const i = (d2.kpis || []).findIndex((x) => x.id === kpiId);
          if (i < 0) return false;
          d2.kpis.splice(i, 1);
          d2.kpiUpdates = (d2.kpiUpdates || []).filter((u) => u.kpiId !== kpiId);
        }, { msg: isGate ? 'Target deleted.' : 'KPI deleted.' });
        if (ok) {
          const top = C.sheet();
          if (top && (top.kind === 'kpi.target' || top.kind === 'kpi.override') && top.data && top.data.kpiId === kpiId) C.closeSheet();
          if (C.state.kpi_rd && C.state.kpi_rd.id === kpiId) closeDrawer(C);
        }
      }
    });
  }
  function unlink(C, ctx, kpiId) {
    if (!C.guard()) return;
    const ok = C.mutate((D) => {
      const doc = D.docs[ctx.docKey] || docOf(C, ctx);
      const m = (doc.kpis || []).find((k) => k.id === kpiId);
      if (!m || !isMember(m)) return false;
      const P = buildPool(C, ctx);
      const root = RD.rootOf(m, P);
      /* keep what the row showed: name, direction, unit, the target it scored against, and the metric's type */
      const shown = RD.effTarget(m, P);
      m.name = RD.kpiName(m, P);
      m.direction = RD.kpiDirection(m, P);
      m.unit = RD.kpiUnit(m, P);
      m.target = shown != null && typeof shown === 'object' ? K.clone(shown) : shown;
      if (root && root !== m) {
        if (root.targetType) m.targetType = root.targetType;
        if (root.targetType === 'statistical') { m.statistic = root.statistic || 'average'; m.readCount = root.readCount == null ? '' : root.readCount; }
        if (m.direction === 'range' && root.rangeSpec && root.target === shown) m.rangeSpec = K.clone(root.rangeSpec);
      }
      m.groupId = null;
      m.isDefiner = true;
      if (m.linkParent != null) { m.linkParent = null; delete m.linkType; delete m.linkPriority; }
    }, { msg: 'Unlinked.' });
    if (ok) {
      const top = C.sheet();
      if (top && top.kind === 'kpi.override' && top.data && top.data.kpiId === kpiId) C.closeSheet();
    }
  }

  /* ========================================================= target sheet */
  function draftFrom(pk) {
    const obj = pk && pk.target != null && typeof pk.target === 'object' ? pk.target : null;
    return {
      name: pk ? (pk.name || '') : '',
      type: pk ? (pk.targetType || 'demonstration') : 'demonstration',
      dir: (pk && pk.direction === 'range') ? 'range' : (pk && pk.direction === 'down') ? 'decrease' : 'increase',
      target: (pk && pk.target != null && typeof pk.target !== 'object') ? String(pk.target) : '',
      rangeLo: obj && obj.lo != null ? String(obj.lo) : '',
      rangeHi: obj && obj.hi != null ? String(obj.hi) : '',
      rangeMode: (pk && pk.rangeSpec && pk.rangeSpec.mode === 'pct') ? 'pct' : 'minmax',
      rangeCenter: (pk && pk.rangeSpec && pk.rangeSpec.center != null) ? String(pk.rangeSpec.center) : '',
      rangePct: (pk && pk.rangeSpec && pk.rangeSpec.pct != null) ? String(pk.rangeSpec.pct) : '',
      unit: (pk && pk.unit) ? pk.unit : '',
      statistic: (pk && pk.statistic) ? pk.statistic : 'average',
      readCount: (pk && pk.readCount != null && pk.readCount !== '') ? String(pk.readCount) : '',
      readsFrom: (pk && pk.readsFrom) ? pk.readsFrom : ''
    };
  }
  function openTarget(C, ctx, host, kpiId, opts) {
    opts = opts || {};
    host = host || {};
    const doc = docOf(C, ctx);
    const pending = host.id === '__pending__' || typeof opts.onSave === 'function';
    if (!pending && !C.guard()) return;
    const pk = kpiId ? (doc.kpis || []).find((k) => k.id === kpiId) : null;
    if (pk && pk.pull && typeof PULL !== 'undefined') { PULL.openEdit(C, ctx, pk); return; }   // a pulled KPI has its own sheet
    if (pk && isMember(pk)) { openOverride(C, ctx, pk.id); return; }   // a linked KPI's target is edited as an override
    const d = draftFrom(pk || opts.value || null);
    const fn = C.sheet() ? 'pushSheet' : 'openSheet';
    C[fn]('kpi.target', {
      host: { type: host.type, id: host.id }, kpiId: pk ? pk.id : '', objId: ctx.objId, docKey: ctx.docKey,
      pending, onSave: typeof opts.onSave === 'function' ? opts.onSave : null, editing: !!(pk || opts.value)
    }, d);
  }
  function parseCount(v) { const s = String(v == null ? '' : v).trim(); if (s === '') return ''; return K.num(s); }
  function validateTarget(d) {
    if (!String(d.name || '').trim()) return 'Give the target a name.';
    if (d.type === 'statistical') {
      const rc = parseCount(d.readCount);
      if (rc !== '' && (rc == null || rc < 1 || Math.floor(rc) !== rc)) return 'Read count must be a whole number, 1 or more (or blank).';
    }
    if (d.type !== 'binary') {
      const t = (x) => String(x == null ? '' : x).trim();
      if (d.dir === 'range') {
        if (d.rangeMode === 'pct') {
          const c = t(d.rangeCenter), p = t(d.rangePct);
          if ((c === '') !== (p === '')) return 'Enter both the average and the width %, or leave both blank.';
          if (c !== '' && (K.num(c) == null || K.num(p) == null)) return 'Use numbers for the average and the width %, like 8 and 50.';
        } else {
          const lo = t(d.rangeLo), hi = t(d.rangeHi);
          if ((lo === '') !== (hi === '')) return 'Enter both the minimum and the maximum, or leave both blank.';
          if (lo !== '' && (K.num(lo) == null || K.num(hi) == null)) return 'Use numbers for the minimum and the maximum, like 6 and 10.';
        }
      } else if (t(d.target) !== '' && K.num(d.target) == null) return 'Use a number for the target, like 1.85.';
    }
    return '';
  }
  function rangeFromDraft(d) {
    if (d.rangeMode === 'pct') {
      const c = K.num(d.rangeCenter), p = K.num(d.rangePct);
      if (c == null || p == null) return null;
      const half = Math.abs(c * p / 100) / 2;                       // width = pct% OF the average; the band straddles it
      return { lo: c - half, hi: c + half, spec: { mode: 'pct', center: c, pct: p } };
    }
    const lo = K.num(d.rangeLo), hi = K.num(d.rangeHi);
    if (lo == null || hi == null) return null;
    return { lo: Math.min(lo, hi), hi: Math.max(lo, hi), spec: null };
  }
  function rangePreview(d) {
    const r = rangeFromDraft(d);
    if (!r) return 'Enter both values.';
    const w = r.hi - r.lo;
    return 'Full credit from ' + fmtNum(r.lo) + ' to ' + fmtNum(r.hi) + (w ? ' (width ' + fmtNum(w) + ')' : '') + '; zero one width outside.';
  }
  /* direction / target / rangeSpec onto a KPI or draft target, as today's applyDirTarget */
  function applyDirTarget(k, d) {
    if (d.dir === 'range') {
      const r = rangeFromDraft(d);
      k.direction = 'range';
      k.target = r ? { lo: r.lo, hi: r.hi } : null;
      if (r && r.spec) k.rangeSpec = r.spec; else delete k.rangeSpec;
      return;
    }
    k.direction = d.dir === 'decrease' ? 'down' : 'up';
    const t = String(d.target == null ? '' : d.target).trim();
    k.target = t === '' ? null : K.num(t);
    delete k.rangeSpec;
  }
  function applyTarget(pk, d) {
    pk.name = String(d.name).trim();
    pk.targetType = d.type;
    if (d.type === 'binary') {
      pk.direction = null; pk.target = null; pk.unit = null;
      delete pk.statistic; delete pk.readCount; delete pk.readsFrom; delete pk.rangeSpec;
      return pk;
    }
    applyDirTarget(pk, d);
    pk.unit = String(d.unit || '').trim() || null;
    if (d.type === 'statistical') {
      pk.statistic = d.statistic || 'average';
      pk.readCount = parseCount(d.readCount);
      if (d.readsFrom) pk.readsFrom = d.readsFrom; else delete pk.readsFrom;
    } else { delete pk.statistic; delete pk.readCount; delete pk.readsFrom; }
    return pk;
  }
  function saveTarget(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'kpi.target') return;
    const d = sh.d || {}, data = sh.data || {}, host = data.host || {};
    const err = validateTarget(d);
    if (err) { C.sheetErr(err); return; }
    const isGate = host.type === 'stageGate';
    if (data.pending) {
      const t = applyTarget({}, d);
      const cb = data.onSave;
      C.closeSheet();
      if (cb) cb(t);
      C.toast(data.editing ? 'Target updated.' : 'Target added. It’s saved with the gate.', 'ok');
      return;
    }
    let gone = false;
    const ok = C.mutate((D) => {
      const doc = D.docs[data.docKey] || docOf(C, ctx);
      if (!Array.isArray(doc.kpis)) doc.kpis = [];
      let pk = data.kpiId ? doc.kpis.find((k) => k.id === data.kpiId) : null;
      if (data.kpiId && !pk) { gone = true; return false; }
      if (!pk) {
        const id = RD.allocId('kpi', data.objId, doc.kpis.map((x) => x.id));
        pk = { id, objectiveId: data.objId, hostType: host.type, hostId: host.id, groupId: null, isDefiner: true };
        doc.kpis.push(pk);
      }
      applyTarget(pk, d);
    }, { msg: isGate ? 'Gate target saved.' : 'KPI saved.' });
    if (gone) { C.sheetErr('This KPI was deleted in the meantime. Close this panel.'); return; }
    if (ok) C.closeSheet();
  }
  function readsFromOptions(C, ctx, objId, selfId, cur) {
    const doc = docOf(C, ctx), P = pool(C, ctx);
    const holders = (doc.kpis || []).filter((k) => k.id !== selfId && !k.readsFrom && !k.pull &&   // a pulled KPI has no sample to borrow
      (k.targetType === 'statistical' || ((RD.definerOf(k, P) || {}).targetType === 'statistical')));
    const nm = (k) => RD.kpiName(k, P) || k.id;
    const out = [{ v: '', label: 'Own readings', dis: false }];
    const IND = '    ';
    const krG = [];
    krsOf(doc, objId).forEach((kr) => {
      const ks = holders.filter((k) => k.hostType === 'keyResult' && k.hostId === kr.id);
      if (ks.length) krG.push({ label: krLabel(doc, kr) + ' — ' + clip(kr.statement || kr.id, 40), kpis: ks });
    });
    if (krG.length) {
      out.push({ v: '__sec_kr', label: 'Key results', dis: true });
      krG.forEach((g, i) => { out.push({ v: '__kr_' + i, label: IND + g.label, dis: true }); g.kpis.forEach((k) => out.push({ v: k.id, label: IND + IND + nm(k), dis: false })); });
    }
    const sgG = [];
    sortByDue((doc.stageGates || []).filter((g) => g.objectiveId === objId)).forEach((g) => {
      const ks = holders.filter((k) => k.hostType === 'stageGate' && k.hostId === g.id);
      if (ks.length) sgG.push({ label: gateLabel(doc, g) + ' — ' + (g.name || g.id), kpis: ks });
    });
    if (sgG.length) {
      out.push({ v: '__sec_sg', label: 'Stage-gates', dis: true });
      sgG.forEach((g, i) => { out.push({ v: '__sg_' + i, label: IND + g.label, dis: true }); g.kpis.forEach((k) => out.push({ v: k.id, label: IND + IND + nm(k), dis: false })); });
    }
    if (cur && !out.some((o) => o.v === cur)) out.push({ v: cur, label: 'Another sample (' + cur + ')', dis: false });
    return out;
  }
  function targetVM(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'kpi.target') return null;
    const d = sh.d || {}, data = sh.data || {}, host = data.host || {};
    const isGate = host.type === 'stageGate';
    const isStat = d.type === 'statistical', isBin = d.type === 'binary', isRange = d.dir === 'range';
    const isPct = d.rangeMode === 'pct';
    const set = (f) => (e) => C.setDraft({ [f]: e && e.target ? e.target.value : e });
    const seg = (opts, cur, field) => opts.map((o) => ({ label: o[1], on: cur === o[0] ? 'true' : 'false', pick: () => C.setDraft({ [field]: o[0] }) }));
    const ro = C.isRo() && !data.pending;
    const editingExisting = !!data.kpiId;
    const noun = isGate ? 'target' : 'KPI';
    return {
      title: data.editing ? (isGate ? 'Edit gate target' : 'Edit KPI') : (isGate ? 'Add gate target' : 'Add KPI'),
      sub: hostTitle(C, ctx, host),
      /* leads, the CTO and the CEO: "Readings: Posted here | Pulled from other work" on a new KPI or target (mods/pull) */
      pulledSeg: typeof PULL !== 'undefined' ? PULL.tgSeg(C, ctx, sh) : null,
      ro,
      name: d.name || '', onName: set('name'),
      types: seg([['demonstration', 'Demonstration'], ['statistical', 'Statistical'], ['binary', 'Binary (pass or fail)']], d.type, 'type'),
      typeHint: isBin ? 'A reading of 1 or more passes; 0 fails.' : isStat ? 'Scores a statistic over a sample of readings.' : 'Scores the latest reading against the target.',
      isStat, isBin, notBin: !isBin, isRange, showTarget: !isBin && !isRange, isPct, isMinMax: !isPct,
      readCount: d.readCount == null ? '' : String(d.readCount), onReadCount: set('readCount'),
      statistic: d.statistic || 'average', onStatistic: set('statistic'),
      statOpts: STAT_OPTS.map((o) => ({ v: o[0], label: o[1] })),
      readsFrom: d.readsFrom || '', onReadsFrom: (e) => { const v = e && e.target ? e.target.value : ''; if (String(v).indexOf('__') === 0) return; C.setDraft({ readsFrom: v }); },
      readsFromOpts: readsFromOptions(C, ctx, data.objId, data.kpiId, d.readsFrom),
      dirs: seg([['increase', 'Increase'], ['decrease', 'Decrease'], ['range', 'Range']], d.dir, 'dir'),
      dirHint: isRange ? 'Full credit inside the band, falling to zero one band-width outside.' : d.dir === 'decrease' ? 'Lower is better: at or below the target scores 100.' : 'Higher is better: the score is the reading as a share of the target.',
      target: d.target == null ? '' : String(d.target), onTarget: set('target'),
      rangeModes: seg([['minmax', 'Min / max'], ['pct', 'Average ± width %']], d.rangeMode || 'minmax', 'rangeMode'),
      rangeLo: d.rangeLo || '', onRangeLo: set('rangeLo'), rangeHi: d.rangeHi || '', onRangeHi: set('rangeHi'),
      rangeCenter: d.rangeCenter || '', onRangeCenter: set('rangeCenter'), rangePct: d.rangePct || '', onRangePct: set('rangePct'),
      preview: rangePreview(d),
      unit: d.unit || '', onUnit: set('unit'),
      hint: data.pending ? 'This target is saved when you add the gate.' : 'Readings are posted from ' + (isGate ? 'the gate’s target table' : host.type === 'task' ? 'Record readings on the Overview' : 'this key result’s KPI table') + '; statistical targets aggregate the current batch.',
      saveLabel: 'Save ' + noun,
      save: () => saveTarget(C, ctx),
      canDelete: editingExisting && !ro,
      delLabel: 'Delete ' + noun,
      del: () => del(C, ctx, data.kpiId),
      onKey: (e) => { if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); saveTarget(C, ctx); } }
    };
  }

  /* ========================================================= link sheet */
  function openLink(C, ctx, host) {
    if (!C.guard()) return;
    host = host || {};
    const P = buildPool(C, ctx);
    const cands = linkCandidates(C, ctx, host, ctx.objId, P);
    const ordered = linkTree(C, ctx, host, ctx.objId, cands, P).filter((x) => !x.isHead);
    const first = ordered.length ? P.find((k) => k.id === ordered[0].id) : null;
    const rel = first ? defaultLinkType(parentLevelOf(pf(C), first), host.type) : 'contribute';
    const fn = C.sheet() ? 'pushSheet' : 'openSheet';
    C[fn]('kpi.link', { host: { type: host.type, id: host.id }, objId: ctx.objId, docKey: ctx.docKey }, { pick: first ? first.id : '', rel });
  }
  function linkTree(C, ctx, host, objId, cands, P) {
    const Pf = pf(C), doc = docOf(C, ctx);
    const items = [];
    const pad = (n) => 'padding-left: ' + (10 + n * 18) + 'px';
    const hdr = (depth, label) => items.push({ isHead: true, label, pad: pad(depth), id: '', sub: '', on: false, pick: null, cls: 'kpi-th' });
    const opt = (k, depth) => {
      const u = RD.kpiUnit(k, P);
      const def = RD.definerOf(k, P) || k;
      const isBin = def.targetType === 'binary';
      const ms = k.hostType === 'milestone' ? (Pf.milestones || []).find((m) => m.id === k.hostId) : null;
      const sub = critText(RD.kpiDirection(k, P), RD.effTarget(k, P), u, isBin) + (k.hostType === 'milestone' ? ', milestone ' + (ms ? ms.name : k.hostId) : '');
      items.push({ isHead: false, id: k.id, label: (RD.kpiName(k, P) || k.id) + (u ? ' (' + u + ')' : ''), sub, pad: pad(depth), on: false, pick: null, cls: 'kpi-opt' });
    };
    const byInit = [], byProd = {}, byModel = {}, byComp = {}, byKr = {}, bySg = {};
    cands.forEach((d) => {
      if (d.hostType === 'initiative' || d.hostType === 'milestone') byInit.push(d);
      else if (d.hostType === 'product') (byProd[d.hostId] = byProd[d.hostId] || []).push(d);
      else if (d.hostType === 'keyResult' && modelById(Pf, d.objectiveId)) (byModel[d.objectiveId] = byModel[d.objectiveId] || []).push(d);
      else if (d.hostType === 'component') { const m = d.objectiveId; byComp[m] = byComp[m] || {}; (byComp[m][d.hostId] = byComp[m][d.hostId] || []).push(d); }
      else if (d.hostType === 'keyResult') (byKr[d.hostId] = byKr[d.hostId] || []).push(d);
      else if (d.hostType === 'stageGate') (bySg[d.hostId] = bySg[d.hostId] || []).push(d);
    });
    const modelIds = Array.from(new Set(Object.keys(byModel).concat(Object.keys(byComp))));
    const prodModels = {}, looseModels = [];
    modelIds.forEach((mid) => { const m = modelById(Pf, mid), p = m && m.productId; if (p) (prodModels[p] = prodModels[p] || []).push(mid); else looseModels.push(mid); });
    const productIds = Array.from(new Set(Object.keys(byProd).concat(Object.keys(prodModels))));
    const compName = (cid) => { let nm = cid; Object.keys(C.D.spec || {}).forEach((id) => { const c = ((C.D.spec[id] || {}).stageGates || []).find((g) => g.id === cid); if (c) nm = c.name || c.id; }); return nm; };
    const renderModel = (mid, depth) => {
      const m = modelById(Pf, mid);
      hdr(depth, 'Model: ' + (m ? m.name : mid));
      (byModel[mid] || []).forEach((d) => opt(d, depth + 1));
      const comps = byComp[mid] || {};
      Object.keys(comps).forEach((cid) => { hdr(depth + 1, 'Component: ' + compName(cid)); comps[cid].forEach((d) => opt(d, depth + 2)); });
    };
    const O = host.type === 'initiative' ? null : objId;
    const o = objById(Pf, O);
    const initId = o ? o.initiativeId : null;
    const ini = initId ? (Pf.initiatives || []).find((i) => i.id === initId) : null;
    const hasAny = byInit.length || productIds.length || looseModels.length || Object.keys(byKr).length || Object.keys(bySg).length;
    let base = 0;
    if (initId && hasAny) { hdr(0, 'Initiative: ' + (ini ? ini.name : initId)); base = 1; }
    byInit.forEach((d) => opt(d, base));
    productIds.forEach((pid) => {
      const p = productById(Pf, pid);
      hdr(base, 'Product: ' + (p ? p.name : pid));
      (byProd[pid] || []).forEach((d) => opt(d, base + 1));
      (prodModels[pid] || []).forEach((mid) => renderModel(mid, base + 1));
    });
    looseModels.forEach((mid) => renderModel(mid, base));
    if (Object.keys(byKr).length || Object.keys(bySg).length) {
      hdr(base, 'Objective: ' + (o ? clip(o.statement || O, 90) : (O || '—')));
      Object.keys(byKr).forEach((krId) => {
        const kr = (doc.keyResults || []).find((x) => x.id === krId);
        hdr(base + 1, kr ? krLabel(doc, kr) + ' — ' + clip(kr.statement || kr.id, 90) : krId);
        byKr[krId].forEach((d) => opt(d, base + 2));
      });
      Object.keys(bySg).forEach((gid) => {
        const g = (doc.stageGates || []).find((x) => x.id === gid);
        hdr(base + 1, g ? gateLabel(doc, g) + ' — ' + clip(g.name || g.id, 90) : gid);
        bySg[gid].forEach((d) => opt(d, base + 2));
      });
    }
    return items;
  }
  function linkVM(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'kpi.link') return null;
    const data = sh.data || {}, d = sh.d || {}, host = data.host || {};
    const P = pool(C, ctx), Pf = pf(C), doc = docOf(C, ctx);
    const cands = linkCandidates(C, ctx, host, data.objId, P);
    const items = linkTree(C, ctx, host, data.objId, cands, P).map((it) => {
      if (it.isHead) return it;
      const on = d.pick === it.id;
      return Object.assign({}, it, {
        on, cls: 'kpi-opt' + (on ? ' on' : ''),
        pick: () => {
          const def = P.find((k) => k.id === it.id);
          C.setDraft({ pick: it.id, rel: def ? defaultLinkType(parentLevelOf(Pf, def), host.type) : 'contribute' });
        }
      });
    });
    const picked = d.pick ? P.find((k) => k.id === d.pick) : null;
    const rel = d.rel || 'contribute';
    const prio = picked ? nextLinkPriority(doc, P, picked.id) : 0;
    return {
      title: 'Link a metric',
      sub: hostTitle(C, ctx, host),
      items, none: !cands.length, has: cands.length > 0,
      rels: ['contribute', 'direct', 'specification'].map((t) => ({ label: F.cap(t), on: rel === t ? 'true' : 'false', pick: () => C.setDraft({ rel: t }) })),
      relHint: REL_HINT[rel] || '',
      prio: picked ? 'This link gets priority ' + prio + ': when several linked KPIs report into the same metric, the newest link wins ties.' : '',
      hasPrio: !!picked,
      pickedText: picked ? 'Links to ' + hostLabel(C, ctx, picked) + '.' : '',
      canLink: !!picked && !C.isRo(),
      link: () => doLink(C, ctx)
    };
  }
  function doLink(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'kpi.link') return;
    if (!C.guard()) return;
    const data = sh.data || {}, d = sh.d || {}, host = data.host || {};
    const P = buildPool(C, ctx);
    const def = d.pick ? P.find((k) => k.id === d.pick) : null;
    if (!def) { C.sheetErr('Pick a metric to link to.'); return; }
    const type = d.rel || defaultLinkType(parentLevelOf(pf(C), def), host.type);
    const doc = C.D.docs[data.docKey] || docOf(C, ctx);
    const objScope = host.type === 'initiative' ? null : data.objId;
    const id = RD.allocId('kpi', objScope || host.id, (doc.kpis || []).map((x) => x.id));
    if (RD.wouldCreateCycle(id, def.id, P)) { C.sheetErr('That link would create a cycle — choose a different target.'); return; }
    const prio = nextLinkPriority(doc, P, def.id);
    const label = hostLabel(C, ctx, def);
    const ok = C.mutate((D) => {
      const d2 = D.docs[data.docKey] || doc;
      if (!Array.isArray(d2.kpis)) d2.kpis = [];
      d2.kpis.push({ id, objectiveId: objScope, hostType: host.type, hostId: host.id, linkParent: def.id, linkType: type, linkPriority: prio, name: null, direction: null, unit: null, target: null, order: 0 });
    }, { msg: 'Linked to ' + label + ' (' + type + ').' });
    if (ok) C.closeSheet();
  }

  /* ======================================================= override sheet */
  function openOverride(C, ctx, kpiId) {
    if (!C.guard()) return;
    const doc = docOf(C, ctx);
    const rec = (doc.kpis || []).find((k) => k.id === kpiId);
    if (!rec) return;
    const own = rec.target;
    const fn = C.sheet() ? 'pushSheet' : 'openSheet';
    C[fn]('kpi.override', { kpiId, docKey: ctx.docKey }, {
      name: rec.localName != null ? String(rec.localName) : '',
      target: (own != null && typeof own !== 'object') ? String(own) : '',
      lo: (own && typeof own === 'object' && own.lo != null) ? String(own.lo) : '',
      hi: (own && typeof own === 'object' && own.hi != null) ? String(own.hi) : ''
    });
  }
  function overrideVM(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'kpi.override') return null;
    const data = sh.data || {}, d = sh.d || {};
    const doc = docOf(C, ctx), P = pool(C, ctx);
    const rec = (doc.kpis || []).find((k) => k.id === data.kpiId);
    if (!rec) return { title: 'Linked KPI', sub: 'This KPI no longer exists.', gone: true, live: false, info: '', name: '', onName: null, ph: '', isRange: false, notRange: false, target: '', onTarget: null, lo: '', hi: '', onLo: null, onHi: null, isDirect: false, directNote: '', save: null, unlink: null, del: null, delLabel: 'Delete KPI', inhText: '', ro: true, showTarget: false, showRange: false, canEdit: false };
    const dir = RD.kpiDirection(rec, P), unit = RD.kpiUnit(rec, P) || '';
    const lk = RD.linkOf(rec, P);
    const parent = lk.parent ? P.find((k) => k.id === lk.parent) : null;
    const def = RD.definerOf(rec, P);
    const inhT = parent ? RD.effTarget(parent, P) : null;
    const isBin = (def || {}).targetType === 'binary';
    const srcName = RD.kpiSourceName(rec, P) || '';
    const isDirect = lk.type === 'direct';
    const set = (f) => (e) => C.setDraft({ [f]: e && e.target ? e.target.value : e });
    return {
      title: 'Linked KPI', sub: RD.kpiName(rec, P) || srcName, gone: false, live: true,
      info: 'Inherits “' + srcName + '” (' + dirWord(dir) + (unit ? ', ' + unit : '') + ') from ' + hostLabel(C, ctx, def) + '. Link: ' + lk.type + ', priority ' + (lk.priority || 0) + '.',
      inhText: 'Inherited target: ' + critText(dir, inhT, unit, isBin) + '.',
      name: d.name || '', onName: set('name'), ph: srcName,
      isRange: dir === 'range', notRange: dir !== 'range',
      target: d.target || '', onTarget: set('target'), lo: d.lo || '', hi: d.hi || '', onLo: set('lo'), onHi: set('hi'),
      isDirect, directNote: 'A direct link always shows the parent’s target, so an override has no effect here.',
      ro: C.isRo(),
      noTarget: isBin,
      showTarget: !isDirect && !isBin && dir !== 'range',
      showRange: !isDirect && !isBin && dir === 'range',
      canEdit: !C.isRo(),
      save: () => saveOverride(C, ctx),
      unlink: () => unlink(C, ctx, rec.id),
      del: () => del(C, ctx, rec.id),
      delLabel: rec.hostType === 'stageGate' ? 'Delete target' : 'Delete KPI'
    };
  }
  function saveOverride(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'kpi.override') return;
    if (!C.guard()) return;
    const data = sh.data || {}, d = sh.d || {};
    const P = buildPool(C, ctx);
    const doc = C.D.docs[data.docKey] || docOf(C, ctx);
    const rec = (doc.kpis || []).find((k) => k.id === data.kpiId);
    if (!rec) { C.sheetErr('This KPI was deleted in the meantime. Close this panel.'); return; }
    const dir = RD.kpiDirection(rec, P);
    const t = (x) => String(x == null ? '' : x).trim();
    let target = null;
    if (dir === 'range') {
      const lo = t(d.lo), hi = t(d.hi);
      if ((lo === '') !== (hi === '')) { C.sheetErr('Enter both the minimum and the maximum, or leave both blank to inherit.'); return; }
      if (lo !== '') {
        const a = K.num(lo), b = K.num(hi);
        if (a == null || b == null) { C.sheetErr('Use numbers for the minimum and the maximum, like 6 and 10.'); return; }
        target = { lo: Math.min(a, b), hi: Math.max(a, b) };
      }
    } else if (t(d.target) !== '') {
      target = K.num(d.target);
      if (target == null) { C.sheetErr('Use a number for the override, like 1.85, or leave it blank to inherit.'); return; }
    }
    const nm = t(d.name);
    const inherited = RD.kpiSourceName(rec, P);
    const ok = C.mutate((D) => {
      const d2 = D.docs[data.docKey] || doc;
      const r2 = (d2.kpis || []).find((k) => k.id === data.kpiId);
      if (!r2) return false;
      r2.target = target;
      if (!nm || nm === inherited) delete r2.localName; else r2.localName = nm;
    }, { msg: 'Override saved.' });
    if (ok) C.closeSheet();
  }

  /* ===================================================== Connect data */
  function analysisIndex(C) {
    const raw = C.D.analysis || {};
    if (C.state.kpi_badIdx) return { schema: 1, runs: raw.runs || [] };
    return raw;
  }
  function openConnect(C, ctx, opts) {
    opts = opts || {};
    if (APP === 'sales') { C.toast('Connect data is part of the Execution app.', 'info'); return; }
    if (!C.guard()) return;
    const record = !opts.host && Array.isArray(opts.keyReads);
    const host = record ? null : (opts.host || {});
    const tok = 'cd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const fn = C.sheet() ? 'pushSheet' : 'openSheet';
    const data = {
      tok, record, host, objId: ctx.objId, docKey: ctx.docKey,
      keyReads: record ? opts.keyReads : null,
      getExperiment: typeof opts.getExperiment === 'function' ? opts.getExperiment : null,
      applyLocal: typeof opts.applyLocal === 'function' ? opts.applyLocal : null,
      afterApply: typeof opts.afterApply === 'function' ? opts.afterApply : null,
      title: opts.title || (record ? 'Connect data: fill key reads' : 'Connect data'),
      label: opts.label || '',
      ready: false, err: '', conn: { samples: [], orphans: [], byKeyRead: {} }
    };
    C[fn]('kpi.connect', data, { sel: {}, open: '', f: { an: '', mode: 'contains', name: '', T: '', RH: '', P: '' } });
    const finish = () => cdFinishLoad(C, ctx, tok);
    if (LIVE) {   /* the broker's GET /analysis, read once per page like today */
      if (C.D.analysis) finish();
      else NET.analysis(C).then(() => { C.setState({ kpi_idxErr: '' }); finish(); }, (e) => {
        C.setState({ kpi_idxErr: e && e.offline ? 'Analysis index unavailable (offline). Connect data reads the analysis portal; try again when you’re back online.' : 'Analysis index unavailable (' + ((e && e.status) || 'error') + '). Try again in a minute.' });
        finish();
      });
    } else if (C.state.kpi_idxReady) finish();
    else C.later(finish, 450);
  }
  function patchSheet(C, tok, fn) {
    const s = (C.state.sheets || []).slice();
    const i = s.findIndex((x) => x && x.data && x.data.tok === tok);
    if (i < 0) return false;
    s[i] = fn(s[i]);
    C.setState({ sheets: s });
    return true;
  }
  function cdHostKeyReads(C, ctx, data) {
    if (data.record) return data.keyReads || [];
    const doc = C.D.docs[data.docKey] || docOf(C, ctx);
    return (doc.kpis || []).filter((k) => k.hostType === data.host.type && k.hostId === data.host.id).map((k) => ({ id: k.id, source_kpi_gid: k.id }));
  }
  function cdExperiment(C, data) { try { return data.getExperiment ? data.getExperiment(C.D) : null; } catch (e) { return null; } }
  function cdReconstruct(C, ctx, data) {
    try {
      return RD.reconstructConnected(cdHostKeyReads(C, ctx, data), { index: analysisIndex(C), kpis: buildPool(C, ctx), execDocs: ctx.em, experiment: cdExperiment(C, data) });
    } catch (e) { return { samples: [], orphans: [], byKeyRead: {} }; }
  }
  function connKey(r) { return (r.target || r.krId || '') + '#' + RD.connSrcKey(r.src || {}); }
  function selFromConn(r) {
    const s = r.src || {};
    return {
      sample: s.sample || r.sample || '', key: s.key || r.key || '', value: r.value, unit: r.unit || '',
      analysis: s.bucket || r.analysis || '', step: s.step || '', cond: s.cond || {}, job_id: s.job_id || '',
      bin_id: s.bin_id || '', script: s.script || '', timestamp: s.run_t || '', target: r.target || r.krId,
      __connected: true, __upId: r._upId, __localIdx: r._localIdx, __krId: r.krId, __orphan: !r.matched
    };
  }
  function cdFinishLoad(C, ctx, tok) {
    const s0 = (C.state.sheets || []).find((x) => x && x.data && x.data.tok === tok);
    if (!s0) return;
    let err = '';
    if (LIVE && C.state.kpi_idxErr) err = C.state.kpi_idxErr;
    else if (C.state.sim && C.state.sim.offline) err = 'Analysis index unavailable (offline). Connect data reads the analysis portal; try again when you’re back online.';
    else {
      const v = RD.validateAnalysisIndex(analysisIndex(C));
      if (!v.ok) err = 'Analysis index unreadable: ' + v.reason + '. Ask whoever runs the analysis portal to republish it.';
    }
    if (!err) C.setState({ kpi_idxReady: true });
    const conn = err ? { samples: [], orphans: [], byKeyRead: {} } : cdReconstruct(C, ctx, s0.data);
    const sel = {};
    (conn.samples || []).forEach((g) => g.readings.forEach((r) => { sel[connKey(r)] = selFromConn(r); }));
    (conn.orphans || []).forEach((r) => { sel[connKey(r)] = selFromConn(r); });
    patchSheet(C, tok, (sh) => Object.assign({}, sh, { data: Object.assign({}, sh.data, { ready: !err, err, conn }), d: Object.assign({}, sh.d, { sel }) }));
  }
  function cdTargets(C, ctx, data) {
    if (data.record) return (data.keyReads || []).map((k) => ({ id: k.id, name: k.name || k.id, unit: k.unit || '' }));
    const doc = C.D.docs[data.docKey] || docOf(C, ctx);
    const P = pool(C, ctx);
    return (doc.kpis || []).filter((k) => k.hostType === data.host.type && k.hostId === data.host.id && !k.pull)   // a pulled KPI takes no readings
      .map((k) => ({ id: k.id, name: RD.kpiName(k, P) || k.name || k.id, unit: RD.kpiUnit(k, P) || '' }));
  }
  function cdGuess(targets, record, key) {
    const t = targets.find((x) => String(x.name).toLowerCase() === String(key).toLowerCase());
    if (t) return t.id;
    if (record) return targets.length ? targets[0].id : '';
    return '__new__';
  }
  function cdFilters(f) {
    f = f || {};
    const p = String(f.P || '').trim();
    let P_value = null, P_unit = '';
    if (p) { const m = /^\s*([\d.]+)\s*(\w+)?/.exec(p); if (m) { P_value = Number(m[1]); P_unit = m[2] || ''; } }
    const num = (x) => { const s = String(x == null ? '' : x).trim(); return s === '' ? null : K.num(s); };
    return { analysis: f.an || '', name: String(f.name || '').trim(), nameMode: f.mode || 'contains', T_C: num(f.T), RH_pct: num(f.RH), P_value, P_unit };
  }
  function cdScaleOf(sel) { const s = sel && Number(sel.scale); return (isFinite(s) && s > 0) ? s : 1; }
  function cdScaled(v, scale) {
    const n = Number(v);
    if (!isFinite(n)) return v;
    const out = n * scale;
    return Math.abs(out) >= 1e-9 ? Number(out.toPrecision(12)) : out;   // 0.671*1000 = 670.9999…; keep a sane precision
  }
  function cdImportPick(sel) {
    const sc = cdScaleOf(sel);
    if (sc === 1) return sel;
    const c = Object.assign({}, sel);
    c.value = cdScaled(sel.value, sc); c.scale = sc; c.value_raw = sel.value;
    return c;
  }
  /* what Apply commits: new imports, unticked connected readings (removals), kept ones, re-targets */
  function cdApplyDiff(conn, sel) {
    const connKeys = {}, connByKey = {};
    (conn.samples || []).forEach((s) => s.readings.forEach((r) => { const k = connKey(r); connKeys[k] = 1; connByKey[k] = r; }));
    (conn.orphans || []).forEach((r) => { const k = connKey(r); connKeys[k] = 1; connByKey[k] = r; });
    const imports = [];
    let newCount = 0, keepConnected = 0;
    Object.keys(sel).forEach((k) => {
      const s = sel[k];
      if (connKeys[k]) { keepConnected++; if (s.__orphan) keepConnected--; }
      else { imports.push(cdImportPick(s)); newCount++; }
    });
    let removeCount = 0;
    const removals = [];
    Object.keys(connKeys).forEach((k) => { if (!sel[k]) { removeCount++; removals.push(connByKey[k]); } });
    Object.keys(sel).forEach((k) => {
      if (connKeys[k]) {
        const r = connByKey[k], s = sel[k];
        if (s.target && r && s.target !== (r.target || r.krId)) { imports.push(cdImportPick(s)); newCount++; removals.push(r); removeCount++; keepConnected--; }
      }
    });
    return { imports, newCount, removeCount, removals, keepConnected };
  }
  function connectVM(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'kpi.connect') return null;
    const data = sh.data || {}, d = sh.d || {};
    const sel = d.sel || {};
    const targets = data.ready ? cdTargets(C, ctx, data) : [];
    const setD = (patch) => C.setDraft(patch);
    const setSel = (fn) => { const cur = (C.sheet() && C.sheet().d && C.sheet().d.sel) || {}; const nx = Object.assign({}, cur); fn(nx); C.setDraft({ sel: nx }); };
    const conn = data.conn || { samples: [], orphans: [] };
    const hasConn = !!((conn.samples || []).length || (conn.orphans || []).length);
    const index = analysisIndex(C);
    const f = cdFilters(d.f);
    const active = data.ready ? RD.analysisFiltersActive(f) : false;
    const list = data.ready ? (active ? RD.analysisSearch(index, f) : RD.analysisRecentSamples(index, 5)) : [];
    const targetOpts = (cur) => targets.map((x) => ({ v: x.id, label: x.name + (x.unit ? ' (' + x.unit + ')' : '') }))
      .concat(data.record ? [] : [{ v: '__new__', label: '+ Create a new KPI' }]);
    const setF = (field) => (e) => { const v = e && e.target ? e.target.value : ''; const ff = Object.assign({}, (C.sheet() && C.sheet().d && C.sheet().d.f) || {}); ff[field] = v; setD({ f: ff }); };
    /* currently connected */
    const nRead = (conn.samples || []).reduce((a, s) => a + s.readings.length, 0) + (conn.orphans || []).length;
    const nSamp = (conn.samples || []).length + ((conn.orphans || []).length ? 1 : 0);
    const P = pool(C, ctx);
    const doc = docOf(C, ctx);
    const unitOfTarget = (id) => { const t = targets.find((x) => x.id === id); return t ? t.unit : ''; };
    const connRow = (r, orphan) => {
      const k = connKey(r);
      const on = !!sel[k];
      const c = (r.src && r.src.cond) || {};
      const meta = [r.analysis || '', c.T_C != null ? c.T_C + ' °C' : '', r.src && r.src.job_id ? 'job ' + r.src.job_id : ''].filter(Boolean).join(', ');
      const scaled = r.src && r.src.scale && Number(r.src.scale) !== 1;
      const tu = unitOfTarget(r.target || r.krId);
      const cur = (sel[k] && sel[k].target) || r.target || r.krId;
      return {
        key: k, on, orphan, matched: !orphan,
        label: (r.key || '') + (r.sample ? ', ' + r.sample : ''), keyName: r.key || '', meta,
        val: withUnit(compact(r.value), scaled ? tu : (r.unit || '')),
        scaledNote: scaled ? 'Scaled ×' + fmtNum(r.src.scale) + ' on import (was ' + fmtNum(r.src.value_raw) + (r.unit ? ' ' + r.unit : '') + ')' : '',
        hasScaled: !!scaled,
        aria: 'Keep ' + (r.key || 'reading') + ' from ' + (r.sample || 'this sample'),
        toggle: (e) => {
          const want = !!(e && e.target ? e.target.checked : !on);
          setSel((nx) => { if (want) { if (!nx[k]) nx[k] = selFromConn(r); } else delete nx[k]; });
        },
        tv: cur, topts: targetOpts(cur), taria: 'Target for ' + (r.key || 'reading') + ' from ' + (r.sample || 'this sample'),
        retarget: (e) => { const v = e && e.target ? e.target.value : ''; setSel((nx) => { if (nx[k]) nx[k] = Object.assign({}, nx[k], { target: v }); }); }
      };
    };
    const connGroups = (conn.samples || []).map((s) => ({ sample: s.sample || '(unknown sample)', count: plural(s.readings.length, 'reading'), rows: s.readings.map((r) => connRow(r, false)) }));
    const orphans = (conn.orphans || []).map((r) => connRow(r, true));
    /* sample list */
    const samples = list.map((sm) => {
      const open = d.open === sm.sample;
      const ans = K.uniq(sm.units.map((u) => u.Analysis)).join(', ');
      return {
        name: sm.sample, analyses: ans, when: isoDay(sm.last), units: plural(sm.units.length, 'unit'),
        open, openAttr: open ? 'true' : 'false', dk: 'cd-sample:' + sm.sample,
        toggle: () => setD({ open: open ? '' : sm.sample }),
        unitList: open ? sm.units.map((u) => ({
          analysis: u.Analysis || '—', cond: condText(u.Conditions) || 'No conditions recorded',
          run: (u.script || '') + (u.script ? ', ' : '') + isoDay(u.timestamp),
          rows: Object.keys(u.key_values).map((key) => {
            const selId = u.uid + '|' + key;
            const on = !!sel[selId];
            const unit = RD.analysisKeyUnit(key);
            const cur = on ? sel[selId].target : cdGuess(targets, data.record, key);
            const matched = targets.some((x) => String(x.name).toLowerCase() === key.toLowerCase());
            const chosen = targets.find((x) => x.id === cur);
            const scale = on ? cdScaleOf(sel[selId]) : 1;
            const raw = u.key_values[key];
            const shown = scale !== 1 ? cdScaled(raw, scale) : raw;
            const warn = (chosen && unit && chosen.unit && chosen.unit !== unit) ? 'Unit differs (the target uses ' + chosen.unit + '). Scale it if needed.' : '';
            const desc = key + ' from ' + sm.sample + ' (' + (u.Analysis || 'analysis') + (u.step ? ', ' + u.step : '') + ')';
            return {
              key, selId, on, matched, unit: unit || '—',
              aria: 'Import ' + desc,
              toggle: (e) => {
                const want = !!(e && e.target ? e.target.checked : !on);
                setSel((nx) => {
                  if (want) nx[selId] = { sample: sm.sample, key, value: raw, unit, analysis: u.Analysis, step: u.step, cond: u.Conditions, job_id: u.job_id, bin_id: u.bin_id, script: u.script, timestamp: u.timestamp, target: cdGuess(targets, data.record, key), scale: 1 };
                  else delete nx[selId];
                });
              },
              shown: fmtNum(shown), scaled: scale !== 1, was: 'was ' + fmtNum(raw),
              scaleV: String(scale), scaleOpts: CD_SCALES.map((x) => ({ v: x[0], label: x[1] })), scaleAria: 'Scale ' + desc,
              onScale: (e) => { const v = Number(e && e.target ? e.target.value : 1) || 1; setSel((nx) => { if (nx[selId]) nx[selId] = Object.assign({}, nx[selId], { scale: v }); }); },
              tv: cur, topts: targetOpts(cur), taria: 'Import ' + desc + ' into',
              onTarget: (e) => { const v = e && e.target ? e.target.value : ''; setSel((nx) => { if (nx[selId]) nx[selId] = Object.assign({}, nx[selId], { target: v }); }); },
              warn, hasWarn: !!warn
            };
          })
        })) : []
      };
    });
    const diff = cdApplyDiff(conn, sel);
    let count;
    if (hasConn) {
      const kept = diff.imports.filter((p) => p.__connected).length + diff.keepConnected;
      count = kept + ' connected, ' + diff.newCount + ' new' + (diff.removeCount ? ', ' + diff.removeCount + ' to remove' : '');
    } else {
      const names = K.uniq(diff.imports.map((x) => x.sample).filter(Boolean));
      count = diff.newCount ? plural(diff.newCount, 'value') + ' selected from ' + F.list(names) : 'Nothing selected';
    }
    const canApply = data.ready && !C.isRo() && (hasConn ? (diff.newCount > 0 || diff.removeCount > 0) : diff.newCount > 0);
    const host = data.host;
    let ctxLabel = data.label || '';
    if (!ctxLabel) {
      if (data.record) ctxLabel = 'Key reads';
      else if (host && host.type === 'keyResult') { const kr = (doc.keyResults || []).find((x) => x.id === host.id); ctxLabel = kr ? krLabel(doc, kr) + ', ' + clip(kr.statement || kr.id, 60) : host.id; }
      else if (host) { const g = (doc.stageGates || []).find((x) => x.id === host.id); const t = (doc.tasks || []).find((x) => x.id === host.id); ctxLabel = g ? gateLabel(doc, g) + ', ' + (g.name || g.id) : t ? 'Task, ' + t.name : String(host.id || ''); }
    }
    return {
      title: data.title, sub: ctxLabel,
      loading: !data.ready && !data.err, failed: !!data.err, err: data.err || '', ready: !!data.ready,
      hasConn, connSum: plural(nSamp, 'sample') + ', ' + plural(nRead, 'reading'), connGroups, orphans, hasOrphans: orphans.length > 0, orphanCount: String(orphans.length),
      fAn: (d.f && d.f.an) || '', anOpts: [{ v: '', label: 'Any' }].concat(CD_BUCKETS.map((b) => ({ v: b, label: b }))), onAn: setF('an'),
      fMode: (d.f && d.f.mode) || 'contains', modeOpts: [{ v: 'contains', label: 'contains' }, { v: 'exact', label: 'is exactly' }, { v: 'starts', label: 'starts with' }], onMode: setF('mode'),
      fName: (d.f && d.f.name) || '', onName: setF('name'),
      fT: (d.f && d.f.T) || '', onT: setF('T'), fRH: (d.f && d.f.RH) || '', onRH: setF('RH'), fP: (d.f && d.f.P) || '', onP: setF('P'),
      clear: () => setD({ f: { an: '', mode: 'contains', name: '', T: '', RH: '', P: '' } }), canClear: active,
      listLabel: active ? plural(list.length, 'sample') + ' match' : 'Last 5 samples',
      samples, noSamples: data.ready && !list.length,
      count, applyLabel: hasConn ? 'Apply changes' : 'Import', canApply, applyOff: !canApply,
      apply: () => cdDoImport(C, ctx),
      retry: () => { const tok = data.tok; patchSheet(C, tok, (s) => Object.assign({}, s, { data: Object.assign({}, s.data, { err: '', ready: false }) })); C.later(() => cdFinishLoad(C, ctx, tok), 450); }
    };
  }
  function cdDoImport(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'kpi.connect') return;
    if (!C.guard()) return;
    const data = sh.data || {}, d = sh.d || {};
    if (!data.ready) return;
    const diff = cdApplyDiff(data.conn || {}, d.sel || {});
    const iso = new Date(C.now()).toISOString();
    const batch = diff.imports.length ? RD.newBatchId() : null;   // one import = one batch (replaces the statistic)
    const who = me(C);
    let added = 0, removed = 0, skipped = 0;
    const P = buildPool(C, ctx);
    const buildFor = (doc, picks) => {
      /* per pick, so each update carries its own scale and script; duplicates are checked across the whole import */
      const out = [];
      picks.forEach((p) => {
        const res = RD.buildImportUpdates([p], (doc.kpiUpdates || []).concat(out), iso);
        skipped += res.duplicates.length;
        res.updates.forEach((u) => {
          if (batch) u.batch = batch;
          if (p.scale && p.scale !== 1) { u.src.scale = p.scale; u.src.value_raw = p.value_raw; }
          if (p.script) u.src.script = p.script;
          if (who) u.by = who;
          u.id = uniqueReadingId({ kpiUpdates: (doc.kpiUpdates || []).concat(out) }, u.id);
          out.push(u);
        });
      });
      return out;
    };
    let result = null;
    const ok = C.mutate((D) => {
      const doc = D.docs[data.docKey] || docOf(C, ctx);
      if (!Array.isArray(doc.kpiUpdates)) doc.kpiUpdates = [];
      if (data.record) {
        const krs = data.keyReads || [];
        const krOf = (id) => krs.find((k) => k.id === id) || null;
        const localRemovals = [], localImports = {};
        (diff.removals || []).forEach((r) => {
          const kr = krOf(r.target || r.krId);
          if (!kr) return;
          const wantKey = RD.connSrcKey(r.src || {});
          if (kr.source_kpi_gid) {
            const k = P.find((x) => x.id === kr.source_kpi_gid);
            const srcId = k ? RD.readingSourceId(k, P) : kr.source_kpi_gid;
            const before = doc.kpiUpdates.length;
            doc.kpiUpdates = doc.kpiUpdates.filter((u) => !((u.kpiId === kr.source_kpi_gid || u.kpiId === srcId) && u.src && RD.connSrcKey(u.src) === wantKey));
            removed += before - doc.kpiUpdates.length;
          } else localRemovals.push(r);
        });
        const byTarget = {};
        (diff.imports || []).forEach((p) => { if (p.target) (byTarget[p.target] = byTarget[p.target] || []).push(p); });
        let linkedAdded = 0;
        Object.keys(byTarget).forEach((tid) => {
          const kr = krOf(tid);
          if (!kr) return;
          if (kr.source_kpi_gid) {
            const ups = buildFor(doc, byTarget[tid].map((g) => Object.assign({}, g, { kpiId: kr.source_kpi_gid })));
            doc.kpiUpdates = doc.kpiUpdates.concat(ups);
            added += ups.length; linkedAdded += ups.length;
          } else localImports[tid] = byTarget[tid];
        });
        if (data.applyLocal && (localRemovals.length || Object.keys(localImports).length || linkedAdded)) {
          const r = data.applyLocal(D, { removals: localRemovals, imports: localImports, batch, linkedAdded }) || {};
          added += Number(r.added) || 0; removed += Number(r.removed) || 0; skipped += Number(r.skipped) || 0;
        }
      } else {
        (diff.removals || []).forEach((r) => {
          const kpiId = r.target || r.krId, wantKey = RD.connSrcKey(r.src || {});
          const before = doc.kpiUpdates.length;
          doc.kpiUpdates = doc.kpiUpdates.filter((u) => !(u.kpiId === kpiId && u.src && RD.connSrcKey(u.src) === wantKey));
          removed += before - doc.kpiUpdates.length;
        });
        /* "+ Create a new KPI": one statistical KPI per key in this import, holding all its picks as the sample */
        const created = {};
        const resolved = (diff.imports || []).map((p) => {
          let kpiId = p.target;
          if (kpiId === '__new__') {
            if (!created[p.key]) {
              const id = RD.allocId('kpi', data.objId, (doc.kpis || []).map((x) => x.id));
              doc.kpis.push({ id, objectiveId: data.objId, hostType: data.host.type, hostId: data.host.id, groupId: null, isDefiner: false, name: p.key, unit: p.unit || null, targetType: 'statistical', direction: 'up', target: null });
              created[p.key] = id;
            }
            kpiId = created[p.key];
          }
          return Object.assign({}, p, { kpiId });
        });
        const ups = buildFor(doc, resolved);
        doc.kpiUpdates = doc.kpiUpdates.concat(ups);
        added += ups.length;
        /* a new KPI that ended up with no reading (every value unusable) is not kept */
        Object.keys(created).forEach((key) => { const id = created[key]; if (!ups.some((u) => u.kpiId === id)) doc.kpis = doc.kpis.filter((k) => k.id !== id); });
      }
      result = { added, removed, skipped };
      if (!added && !removed) return false;
    }, { msg: null });
    const parts = [];
    if (added) parts.push(plural(added, 'reading') + ' added');
    if (removed) parts.push(removed + ' removed');
    if (skipped) parts.push(skipped + ' already connected');
    const msg = parts.length ? F.cap(parts.join(', ')) + '.' : 'No changes.';
    C.closeSheet();
    C.toast(msg, ok ? 'ok' : 'info');
    if (data.afterApply) { try { data.afterApply(C, result || { added, removed, skipped }); } catch (e) { console.error(e); } }
  }

  /* ===================================================== readings sheet */
  function openAll(C, ctx, kpiId) {
    const fn = C.sheet() ? 'pushSheet' : 'openSheet';
    C[fn]('kpi.all', { objId: ctx.objId }, {});
    if (kpiId) {
      C.setState({ kpi_hl: kpiId });
      C.later(() => { if (C.state.kpi_hl === kpiId) C.setState({ kpi_hl: '' }); }, 6000);
    }
  }
  function allVM(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'kpi.all') return null;
    const doc = docOf(C, ctx), objId = ctx.objId;
    const o = objById(pf(C), objId);
    const krs = krsOf(doc, objId);
    const hasK = (type, id) => (doc.kpis || []).some((k) => k.hostType === type && k.hostId === id && k.objectiveId === objId);
    const mk = (type, id, label, name, extra) => ({ dk: 'kpi-host:' + type + ':' + id, label, name, kt: table(C, ctx, { type, id }, Object.assign({ key: 'all:' + type + ':' + id, connect: true }, extra || {})) });
    const groups = [];
    const kh = krs.filter((kr) => (kr.trackingType || 'kpi') === 'kpi' || hasK('keyResult', kr.id)).map((kr) => mk('keyResult', kr.id, krLabel(doc, kr), kr.statement || kr.id));
    if (kh.length) groups.push({ label: 'Key results', hosts: kh });
    const gh = [];
    setsOf(doc, objId).forEach((s) => sortByDue((doc.stageGates || []).filter((g) => g.objectiveId === objId && g.setId === s.id)).forEach((g) => { if (hasK('stageGate', g.id)) gh.push(mk('stageGate', g.id, gateLabel(doc, g), g.name || g.id)); }));
    (doc.stageGates || []).filter((g) => g.objectiveId === objId && !setsOf(doc, objId).some((s) => s.id === g.setId)).forEach((g) => { if (hasK('stageGate', g.id)) gh.push(mk('stageGate', g.id, gateLabel(doc, g), g.name || g.id)); });
    if (gh.length) groups.push({ label: 'Stage-gates', hosts: gh });
    const th = (doc.tasks || []).filter((t) => t.objectiveId === objId && hasK('task', t.id)).map((t) => mk('task', t.id, 'Task', t.name || t.id));
    if (th.length) groups.push({ label: 'Tasks', hosts: th });
    return {
      title: 'Readings',
      sub: o ? o.statement : '',
      groups, none: !groups.length,
      roNote: C.isRo() ? 'Read-only view — editing is disabled.' : '', hasRoNote: C.isRo()
    };
  }

  /* ===================================================== latest readings */
  function latestVM(C, ctx) {
    const doc = docOf(C, ctx), objId = ctx.objId;
    if (!objId) return { has: false, none: true, rows: [], count: '', open: () => {}, openLabel: 'Record readings', canOpen: false, emptyText: '' };
    const P = pool(C, ctx), em = ctx.em;
    const mine = new Set((doc.kpis || []).filter((k) => k.objectiveId === objId).map((k) => k.id));
    const all = (doc.kpiUpdates || []).filter((u) => mine.has(u.kpiId) && u.value != null && !isNaN(Number(u.value)))
      .slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const rows = all.slice(0, 5).map((u) => {
      const k = (doc.kpis || []).find((x) => x.id === u.kpiId) || P.find((x) => x.id === u.kpiId);
      const def = k ? (RD.definerOf(k, P) || k) : {};
      const isBin = def.targetType === 'binary', isStat = def.targetType === 'statistical';
      const unit = k ? (RD.kpiUnit(k, P) || '') : '';
      let progress = '';
      if (k && isStat) {
        const pp = RD.kpiScoreParts(k, P, em);
        if (pp.expected) progress = Math.min(pp.n || 0, pp.expected) + ' of ' + pp.expected + ' samples in';
      }
      const who = u.by ? F.first(u.by) : (u.src && u.src.portal === 'analysis' ? 'Analysis import' : '');
      return {
        val: isBin ? (Number(u.value) >= 1 ? 'Pass' : 'Fail') : withUnit(fmtNum(u.value), unit),
        name: k ? (RD.kpiName(k, P) || k.id) : u.kpiId,
        meta: [who, F.ago(u.timestamp, C.now())].filter(Boolean).join(', '),
        progress, hasProgress: !!progress,
        imported: !!(u.src && u.src.portal === 'analysis' && APP !== 'sales'),
        aria: 'Show ' + (k ? (RD.kpiName(k, P) || '') : '') + ' in the readings panel',
        go: () => openAll(C, ctx, u.kpiId)
      };
    });
    const nK = mine.size;
    return {
      has: rows.length > 0, none: !rows.length, rows,
      count: all.length > rows.length ? rows.length + ' of ' + all.length : '',
      canOpen: nK > 0,
      openLabel: C.isRo() ? 'View readings' : 'Record readings',
      open: () => openAll(C, ctx, null),
      emptyText: nK ? 'No readings on this objective yet. Post the first one from a KPI table.' : 'No KPIs on this objective yet. Add one to a key result or a stage-gate, and its readings show here.'
    };
  }

  /* ===================================================== small exports */
  function parts(C, ctx, k) { return RD.kpiScoreParts(k, pool(C, ctx), ctx.em); }
  function describe(C, ctx, k) {
    const P = pool(C, ctx);
    const def = RD.definerOf(k, P) || k;
    const isBin = def.targetType === 'binary', isStat = def.targetType === 'statistical';
    const unit = RD.kpiUnit(k, P) || '';
    const pp = RD.kpiScoreParts(k, P, ctx.em);
    const cv = RD.effValue(k, P, ctx.em);
    return {
      id: k.id, name: RD.kpiName(k, P) || '(unnamed)', unit,
      crit: critText(RD.kpiDirection(k, P), RD.effTarget(k, P), unit, isBin),
      current: cv == null ? 'No reading' : isBin ? (Number(cv) >= 1 ? 'Pass' : 'Fail') : withUnit(fmtVal(cv, isStat), unit),
      score: F.score(pp.score), partial: !!pp.partial, n: pp.n, expected: pp.expected,
      partialText: pp.partial ? 'Partial ' + pp.n + '/' + pp.expected : ''
    };
  }
  function summary(C, ctx, host) {
    const P = pool(C, ctx);
    const ks = P.filter((k) => k.objectiveId === ctx.objId && k.hostType === host.type && k.hostId === host.id);
    const met = ks.filter((k) => { const s = RD.kpiScoreResolved(k, P, ctx.em); return s != null && s >= 100; }).length;
    let partialCount = 0;
    try { partialCount = RD.hostSample(host.type, host.id, ctx.em).partialCount; } catch (e) { partialCount = 0; }
    const isGate = host.type === 'stageGate';
    return { count: ks.length, met, partialCount, text: ks.length ? (isGate ? met + ' of ' + ks.length + ' met' : met + ' of ' + ks.length + ' on target') + (partialCount ? ', ' + partialCount + ' partial' : '') : '' };
  }

  return {
    table, post, openTarget, openEdit, openLink, openOverride, openConnect, openAll, del, unlink,
    commitPending, removeHost,
    pool: (C, ctx) => pool(C, ctx), parts, describe, summary,
    hostLabel: (C, ctx, k) => hostLabel(C, ctx, k),
    /* module-internal (used by MODS.kpi) */
    _vm: { targetVM, linkVM, overrideVM, connectVM, allVM, latestVM },
    _util: { fmtNum, withUnit, clip, hostTitle, docOf, gateLabel, krLabel }
  };
})();

MODS.kpi = {
  state: {
    kpi_ed: null,          // inline value editor { k: tableKey|kpiId, id, v, err }
    kpi_rd: null,          // open readings drawer { k, id }
    kpi_rdv: '', kpi_rdFor: '', kpi_rdArm: '', kpi_rdBatch: '', kpi_rdErr: '',
    kpi_prov: {},          // provenance rows open, by tableKey|kpiId
    kpi_hl: '',            // KPI highlighted after a search or a "Latest readings" click
    kpi_idxReady: false,   // the analysis index has been loaded once this session
    kpi_badIdx: false      // Settings simulation: the portal publishes an unreadable index
  },
  wide: ['kpi.connect', 'kpi.all'],
  vm(C, ctx) {
    const V = KPI._vm;
    /* parts are computed lazily (only what the template reads) and never throw into the render */
    const safe = (name, fn) => C.memo('kpi.vm.' + name, () => {
      try { return fn(); } catch (e) {
        console.error('[kpi] ' + name + ' failed', e);
        (C._vmErrors || (C._vmErrors = [])).push('kpi.' + name + ': ' + (e && e.message ? e.message : e));
        return null;
      }
    });
    return {
      get tg() { return safe('tg', () => V.targetVM(C, ctx)); },
      get lk() { return safe('lk', () => V.linkVM(C, ctx)); },
      get ov() { return safe('ov', () => V.overrideVM(C, ctx)); },
      get cd() { return safe('cd', () => V.connectVM(C, ctx)); },
      get all() { return safe('all', () => V.allVM(C, ctx)); },
      get latest() { return safe('latest', () => V.latestVM(C, ctx)); },
      get settings() {
        return safe('set', () => ({
          badIdx: !!C.state.kpi_badIdx,
          toggleBadIdx: (e) => C.setState({ kpi_badIdx: !!(e && e.target ? e.target.checked : !C.state.kpi_badIdx), kpi_idxReady: false })
        }));
      }
    };
  },
  searchLabel: 'KPIs',
  /* KPIs of this division by name; picking one opens its objective on the right tab and shows it in "Readings" */
  search(C, ctx, q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return [];
    const doc = KPI._util.docOf(C, ctx);
    const P = KPI.pool(C, ctx);
    const out = [];
    (doc.kpis || []).forEach((k) => {
      const nm = RD.kpiName(k, P) || '';
      if (!nm || nm.toLowerCase().indexOf(q) < 0 || !k.objectiveId) return;
      const o = (C.D.portfolio.objectives || []).find((x) => x.id === k.objectiveId);
      if (!o) return;
      out.push({
        label: nm,
        sub: 'On ' + KPI.hostLabel(C, ctx, k) + ', ' + o.statement,
        go: () => {
          const tab = k.hostType === 'stageGate' ? 'gates' : k.hostType === 'task' ? 'overview' : 'krs';   // no Tasks tab: a stored task KPI is shown in Readings only
          if (typeof shellOpenObjective === 'function') shellOpenObjective(C, o.id);
          else C.setState({ objId: o.id, menu: '', sheets: [] });
          C.setState({ tab, menu: '' });
          const ctx2 = typeof APP_CTX === 'function' ? APP_CTX(C) : ctx;
          KPI.openAll(C, ctx2, k.id);
        }
      });
    });
    return out.slice(0, 8);
  },
  /* the module's public namespace, for scenario tests (C.MODS.kpi.api) */
  api: KPI
};
