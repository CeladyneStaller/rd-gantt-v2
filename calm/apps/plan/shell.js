/* ============================================================================
   Planning shell (P-core). Owns the frame, the shared filter / group-by bar,
   Settings (theme, access, present mode, broker + sync simulations, URL links),
   the simulated save cycle, and the context every Planning module reads.

   ctx (read-only for modules; recomputed every render):
     today, nowMs     sample "today" (day number) and the simulated clock (ms)
     qNow             the current calendar quarter, '2026Q4' (what ?quarter=active means)
     D, P             the whole dataset and the portfolio document (C.D.portfolio)
     ro               editing is off (read-only preview, or present mode)
     present          present mode (sidebar, top bar and filter bars hidden)
     tab              'overview' | 'structure' | 'gantt' | 'milestones'
     execDocs         D.docs keyed 'EXEC-DIV-EL' / 'BIZ-DIV-BD'
     execMap          the same docs keyed by division id (what the live app hands the engine)
     em               RD.withPortfolio(P, execMap)            — scores, rollups, cascade
     specMap          D.spec keyed 'SPEC-DIV-EL'
     fullEm           RD.withPortfolio(P, execMap + spec docs) — product/model KPI currents
     pool             every KPI in em (the engine's resolution pool, like the live app's poolOf)
     docOf(divId)     that division's execution doc (EXEC- or BIZ- by the division's kind) or null
     appOf(divId)     'exec' | 'sales' — the app that executes that division
     objEnd(o)        RD.objectiveEndState for objective o (achieved / abandoned) or null
     f                shared filters { unit, div, prod, q, status } — '' = all; status is an RD.band
                      value ('on-track' | 'at-risk' | 'off-track' | 'no-band')
     group            { mode: 'hierarchy' | 'custom', dims: [...] }  (dims ⊂ unit, division, product,
                      model, quarter, owner, initiative; feed RD.groupObjectives / RD.groupMilestones)
     anyFilter        any filter is set;  workFilter: quarter or status is set
     objMatch(o)      objective passes the filters (today's rules: unit via its division, its own
                      division, effective product, quarter tag, band of its score)
     initMatch(i)     an initiative WITHOUT objectives passes: judged on its own unit, division and
                      product; always false while a quarter or status filter is set
     initHasMatch(i)  initiative shows: any of its objectives match, else initMatch(i)
     msMatch(m)       milestone passes: unit and division of its initiative, its effective product,
                      the quarter of its planned date, its band (fixes today's ignored Unit filter)
     prodShows(p)     product passes the unit / division / product filters
     divShows(d)      division passes the unit / division filters
     objBand(id)      RD.band of the objective's rollup;  msBand(id): 'on-track' when achieved, else
                      RD.band(RD.milestoneScore)
     paused(msId)     milestone is paused or deprioritized (RD.milestonePaused)
     casc()           RD.cascade once per render, with paused / deprioritized milestones left out
                      (they are "kept, and excluded from dates and scores")
     isActiveObj(o)   today's Overview "active" rule: score below 100 and (quarter = qNow or today
                      inside its planned window);  isActiveMs(m): not achieved, not paused, planned
                      in qNow

   Shell state other modules may read or set:
     C.state.f, C.state.group      the filters and grouping above (use the bar; it closes sheets)
     C.state.pg_active             Gantt "Active only" (?ganttActive)       — owned by mods/pgt
     C.state.pg_timeframe          Gantt "Timeframe" on (?ganttQuarter)    — owned by mods/pgt
     C.state.focus                 { type, id } handed over from another app, or null

   Cross-module entry points (defined in mods/ped/mod.js):
     PED.open(C, ctx, type, id, opts)   editor; id null = add; opts.parentId pre-fills the parent
                                        (division for initiative/product, initiative for
                                        objective/milestone, product for model); opts.prefill;
                                        opts.push stacks it over the current sheet
     PED.lineage(C, ctx, type, id)      lineage sheet;   PED.del(C, ctx, type, id)  delete flow
     PED.milestoneStatus(C, ctx, msId, status, note)
                                        status: 'paused' | 'deprioritized' | 'active' (resume) |
                                        'achieved' (completed today) | 'open' (clears completion)
   The milestone editor's Report button calls PMS.openReport(C, ctx, msId) when mods/pms defines it.

   Hand-off into Planning (C.handoff({ app: 'plan', ... }) from another board):
     tab: 'overview' | 'structure' | 'gantt' | 'milestones';  objective / initiative / milestone /
     division / product / model: <id> opens that item's lineage at load.

   Live builds (LIVE = true: kit/net.js loads and saves through the broker; see LIVE.md):
     APP_LIVE_PLAN     every division's execution document (EXEC-<div>, BIZ-<div> for a business division)
                       and SPEC-<div> for every R&D division are read; only the portfolio is written, as
                       today ('gantt-view' is neither read nor written: Calm keeps Gantt choices per browser)
     APP_INIT          no documents and no hand-off yet: the page's parameters (?tab, ?present, ?division…)
                       set the view from the first frame, as today's app reads them when the page starts
     APP_LIVE_READY    the first successful load opens the view the parameters ask for (exactly like opening
                       a link), or else the hand-off from another app; later loads keep the current view
     APP_LIVE_STATUS   load phases in a banner under the top bar (C.state.pl_load) and in the save indicator;
                       nothing can be edited until something is loaded
     Settings          theme, read-only preview, present mode, the link builder (its links open by going to
                       them), the broker token (NET.saveToken), "Load from the broker" (NET.reload) and the
                       connection's status (NET.info). None of the sample's simulations.
     Signed out inside a Confluence embed, the View only banner links to the full page, where the Hub
     sign-in is visible.
   ========================================================================== */
const PLAN_TABS = [['overview', 'Overview'], ['structure', 'Structure'], ['gantt', 'Gantt'], ['milestones', 'Milestones']];
const PLAN_HUB = 'https://celadynestaller.github.io/CeladyneHQ/';
const PLAN_URL = PLAN_HUB + 'planning_app.html';
const PLAN_DIMS = [['unit', 'Unit'], ['division', 'Division'], ['product', 'Product'], ['model', 'Model'], ['quarter', 'Quarter'], ['owner', 'Owner'], ['initiative', 'Initiative']];
const PLAN_STATUS = [['on-track', 'On track'], ['at-risk', 'At risk'], ['off-track', 'Off track'], ['no-band', 'No score yet']];
const PLAN_TOKEN = 'rdb_live_7Qx2mK9p';   // the sample build's simulated token (a live page uses the stored one, NET.token())
/* the parameters a link to Planning can carry (today's URLP); names are case-insensitive, values exact */
const PLAN_PARAMS = ['tab', 'present', 'readonly', 'division', 'product', 'unit', 'quarter', 'ganttActive', 'ganttQuarter'];

/* ---------------------------------------------------------------- helpers */
const PLAN = {
  ENT: { unit: 'Unit', division: 'Division', product: 'Product', model: 'Model', initiative: 'Initiative', milestone: 'Milestone', objective: 'Objective' },
  KEY: { unit: 'units', division: 'divisions', product: 'products', model: 'models', initiative: 'initiatives', milestone: 'milestones', objective: 'objectives' },
  list(P, ent) { return (P && P[PLAN.KEY[ent]]) || []; },
  byId(P, ent, id) { if (id == null || id === '') return null; return PLAN.list(P, ent).find((x) => x.id === id) || null; },
  nameOf(r) { return r ? (r.name || r.statement || r.id) : '(missing)'; },
  ord(x) { return x && x.order != null && x.order !== '' && isFinite(x.order) ? Number(x.order) : 1e9; },
  byOrder(arr) { return (arr || []).slice().sort((a, b) => PLAN.ord(a) - PLAN.ord(b)); },
  kindOf(P, divId) { return RD.divisionKind(PLAN.byId(P, 'division', divId)); },
  docKey(P, divId) { return (PLAN.kindOf(P, divId) === 'biz' ? 'BIZ-' : 'EXEC-') + divId; },
  docOf(D, divId) { return divId ? (D.docs || {})[PLAN.docKey(D.portfolio, divId)] || null : null; },
  appOf(P, divId) { return PLAN.kindOf(P, divId) === 'biz' ? 'sales' : 'exec'; },
  objEnd(D, o) { const doc = o ? PLAN.docOf(D, o.divisionId) : null; return doc ? RD.objectiveEndState(doc.objectiveState, o.id) : null; },
  tone(b) { return { 'on-track': 'ok', 'at-risk': 'warn', 'off-track': 'bad' }[b] || 'none'; },
  word(b) { return { 'on-track': 'On track', 'at-risk': 'At risk', 'off-track': 'Off track' }[b] || 'No score yet'; },
  msPaused(P, id) { try { return !!RD.milestonePaused(P.milestoneState, id); } catch (e) { return false; } },
  msState(P, id) { try { return RD.milestoneState(P.milestoneState, id); } catch (e) { return null; } },
  msQuarter(ms) { return ms && ms.plannedDate != null && isFinite(ms.plannedDate) ? F.qOfDay(ms.plannedDate) : ''; },
  msProduct(P, ms) {
    const i = ms ? PLAN.byId(P, 'initiative', ms.initiativeId) : null;
    if (!i) return null;
    try { return RD.effProduct(i, P) || null; } catch (e) { return i.productId || null; }
  },
  divCode(divId) { const t = String(divId || ''); const i = t.indexOf('-'); return i >= 0 ? t.slice(i + 1) : t; },
  quarters(P) { const s = {}; (P.objectives || []).forEach((o) => { if (o.quarter) s[o.quarter] = 1; }); return Object.keys(s).sort(); },
  dimLabel(P, dim, key) {
    if (key === '' || key == null || key === '__all__') return 'None';
    if (dim === 'unit') { const u = PLAN.byId(P, 'unit', key); return u ? u.name : key; }
    if (dim === 'division' || dim === 'product' || dim === 'model' || dim === 'initiative') { const r = PLAN.byId(P, dim, key); return r ? PLAN.nameOf(r) : key; }
    if (dim === 'quarter') return F.q(key);
    if (dim === 'owner') return F.name(key);
    return String(key);
  },
  dimWord(dim) { const d = PLAN_DIMS.find((x) => x[0] === dim); return d ? d[1] : dim; },
  pathKey(path) { return path.map((p) => p[0] + ':' + p[1]).join('/'); },
  /* a new record created from a group lands in that group (today's groupPrefill) */
  groupPrefill(path) {
    const pre = {};
    path.forEach((p) => {
      const dim = p[0], key = p[1];
      if (key === '' || key === '__all__') return;
      if (dim === 'division') pre.divisionId = key;
      else if (dim === 'product') pre.productId = key;
      else if (dim === 'model') pre.modelId = key;
      else if (dim === 'quarter') pre.quarter = key;
      else if (dim === 'owner') pre.owner = key ? [key] : [];
      else if (dim === 'initiative') pre.initiativeId = key;
    });
    return pre;
  },
  owners(o) { return RD.ownersOf(o); },
  /* the plan with paused / deprioritized milestones left out, for the schedule cascade */
  liveP(P) {
    const ids = {};
    (P.milestones || []).forEach((m) => { if (PLAN.msPaused(P, m.id)) ids[m.id] = 1; });
    if (!Object.keys(ids).length) return P;
    return Object.assign({}, P, {
      milestones: (P.milestones || []).filter((m) => !ids[m.id]),
      objectives: (P.objectives || []).map((o) => (o.milestoneIds && o.milestoneIds.some((x) => ids[x]) ? Object.assign({}, o, { milestoneIds: o.milestoneIds.filter((x) => !ids[x]) }) : o))
    });
  },
  ago(ms, now) { return F.ago(ms, now); }
};

function planExecMap(D) {
  const m = {};
  Object.keys(D.docs || {}).forEach((k) => { m[k.replace(/^(EXEC|BIZ)-/, '')] = D.docs[k]; });
  return m;
}
function planPool(em) {
  const out = [];
  Object.keys(em).forEach((k) => { ((em[k] && em[k].kpis) || []).forEach((x) => out.push(x)); });
  return out;
}

/* ------------------------------------------------------------ state */
function APP_INIT(C, st) {
  const D = C.D;
  st.tab = 'overview';
  st.present = false;
  st.roByPresent = false;
  st.f = { unit: '', div: '', prod: '', q: '', status: '' };
  st.group = { mode: 'hierarchy', dims: ['division'] };
  st.pg_active = false;
  st.pg_timeframe = false;
  st.focus = null;
  /* live: bk.token only says WHETHER a token is stored (mods/ped words a hint by it); the token is never shown */
  st.bk = LIVE ? { token: !!NET.token() } : { token: PLAN_TOKEN, reject: false, conflict: '', loadedAt: D.nowMs, last: '' };
  st.bkDraft = '';
  st.lk = { tab: 'overview', division: '', product: '', unit: '', quarter: '', readonly: false, present: false, ganttActive: false, ganttQuarter: false, token: false };
  st.lkPaste = '';
  try { const t = window.localStorage.getItem('rd_theme'); if (t === 'light' || t === 'dark' || t === 'system') st.theme = t; } catch (e) { /* storage blocked */ }
  if (LIVE) { planLiveInit(C, st); return; }
  C._server = K.clone(D.portfolio);
  C._pending = false;
  C._teamNext = 0;
  planInstallSync(C);
  const h = C.takeHandoff(APP);
  if (h) Object.assign(st, planHandoffPatch(C, h));
}
/* the view a hand-off from another board opens: its tab, and the lineage of the item it names (when the plan has it) */
function planHandoffPatch(C, h) {
  const patch = {};
  if (h.tab && PLAN_TABS.some((x) => x[0] === h.tab)) patch.tab = h.tab;
  const types = ['objective', 'initiative', 'milestone', 'division', 'product', 'model', 'unit'];
  const ty = types.find((t) => h[t]);
  if (ty && PLAN.byId(C.D.portfolio, ty, h[ty])) {
    patch.focus = { type: ty, id: h[ty] };
    patch.sheets = [{ kind: 'ped.lineage', data: { type: ty, id: h[ty] }, d: {}, err: '' }];
  }
  return patch;
}
function APP_RESET(C) {
  const st = {};
  APP_INIT(C, st);
  st.sim = { offline: false, hub: true };
  st.ro = false;
  C.setState(st);
}

/* ------------------------------------------------- simulated broker + save */
function planInstallSync(C) {
  if (C._plSync) return;
  C._plSync = true;
  C.markDirty = function (msg) { planMarkDirty(this, msg); };
  C.saveNow = function () { planSaveNow(this); };
}
function planSetBk(C, patch) { C.setState({ bk: Object.assign({}, C.state.bk, patch) }); }
/* every C.mutate ends here: today's auto-save, with its messages */
function planMarkDirty(C, msg) {
  const S = C.state, bk = S.bk || {};
  const now = C.now();
  const seq = (C._saveSeq = (C._saveSeq || 0) + 1);
  const rev = (S.rev || 0) + 1;
  if (!bk.token) {
    C.setState({ rev: rev, save: { state: 'local', at: now } });
    C.toast('Saved locally — add a broker token in Settings to sync.', 'info');
    return;
  }
  if (S.sim && S.sim.offline) {
    C._pending = true;
    C.setState({ rev: rev, save: { state: 'offline', at: now, pending: true } });
    C.toast('Auto-save failed (no connection). Your change is local — use Save to retry.', 'err');
    return;
  }
  if (bk.conflict === 'fail') {
    /* re-fetch, re-apply, save again — and that retry fails: reload their version, the change is lost */
    C.D.portfolio = K.clone(C._server);
    const what = planTeamEdit(C);
    C._server = K.clone(C.D.portfolio);
    C._pending = false;
    C.setState({ rev: rev + 1, bk: Object.assign({}, bk, { conflict: '', last: what }), save: { state: 'conflict', at: now } });
    C.toast('Auto-save hit a conflict and couldn’t merge (412) — reloaded; re-apply and use Save.', 'err');
    return;
  }
  let text = msg || 'Saved.';
  const patch = { rev: rev, save: { state: 'saving', at: now } };
  if (bk.conflict === 'merge') {
    /* 412: re-fetch their version, re-apply this one change on top, save again */
    const what = planTeamEdit(C);
    patch.bk = Object.assign({}, bk, { conflict: '', last: what });
    text = text + ' (merged with a concurrent change)';
  }
  C._server = K.clone(C.D.portfolio);
  C._pending = false;
  C.later(() => { if (seq === C._saveSeq && !(C.state.sim && C.state.sim.offline)) C.setState({ save: { state: 'saved', at: C.now() } }); }, 700);
  C.setState(patch);
  C.toast(text, 'ok');
}
/* the top bar's Save button: full save of the portfolio (and the gantt-view doc) */
function planSaveNow(C) {
  if (!C.guard()) return;
  const S = C.state, bk = S.bk || {};
  if (!bk.token) { C.toast('Add a broker token in Settings before saving.', 'err'); return; }
  if (S.sim && S.sim.offline) { C.toast('Save failed (no connection).', 'err'); return; }
  C._saveSeq = (C._saveSeq || 0) + 1;
  if (bk.conflict) {
    C.toast('Someone else saved first — reloading their version, then re-apply your change.', 'err');
    C.D.portfolio = K.clone(C._server);
    const what = planTeamEdit(C);
    C._server = K.clone(C.D.portfolio);
    C._pending = false;
    C.setState({ rev: (S.rev || 0) + 1, bk: Object.assign({}, bk, { conflict: '', last: what, loadedAt: C.now() }), save: { state: 'conflict', at: C.now() } });
    C.toast(planLoadedText(C), 'ok');
    return;
  }
  C._server = K.clone(C.D.portfolio);
  C._pending = false;
  C.setState({ save: { state: 'saved', at: C.now() } });
  C.toast('Saved.', 'ok');
}
function planLoadedText(C) {
  const D = C.D, P = D.portfolio;
  const nx = (P.divisions || []).filter((d) => PLAN.docOf(D, d.id)).length;
  const ns = (P.divisions || []).filter((d) => (D.spec || {})['SPEC-' + d.id]).length;
  return 'Loaded portfolio + ' + nx + ' exec + ' + ns + ' spec docs.';
}
/* load from the broker: replaces what is in this browser with the broker's copy */
function planLoad(C) {
  const S = C.state, bk = S.bk || {};
  if (!bk.token) { C.toast('No broker token yet — add one in Settings to load live data. Showing local scratch.', 'info'); return; }
  if (bk.reject) { C.toast('Load failed (401). Check the token in Settings.', 'err'); return; }
  if (S.sim && S.sim.offline) { C.toast('Load failed (no connection). Check the token in Settings.', 'err'); return; }
  C.D.portfolio = K.clone(C._server);
  C._pending = false;
  C._saveSeq = (C._saveSeq || 0) + 1;
  C.setState({ rev: (S.rev || 0) + 1, bk: Object.assign({}, bk, { loadedAt: C.now() }), save: { state: 'saved', at: C.now() } });
  C.toast(planLoadedText(C), 'ok');
}
function planSaveToken(C, value) {
  const tok = String(value == null ? C.state.bkDraft || '' : value).trim();
  planSetBk(C, { token: tok });
  C.setState({ bkDraft: '' });
  C.toast('Token saved.', 'ok');
  planLoad(C);
}
/* what a teammate's save looks like when it arrives (25 s polling) or wins a race (412) */
const PLAN_TEAM = [
  { who: 'toru@celadyne.com', run(D) {
    const m = PLAN.byId(D.portfolio, 'milestone', 'MS-EL-01-02');
    if (!m || m.plannedDate == null) return '';
    m.plannedDate += 7;
    return 'moved ' + m.name + ' to ' + F.dayY(m.plannedDate);
  } },
  { who: 'erin@celadyne.com', run(D) {
    const doc = D.docs['EXEC-DIV-FC'];
    const k = doc && (doc.kpis || []).find((x) => x.id === 'KPI-FC-2026Q4-01-1-1');
    if (!k) return '';
    doc.kpiUpdates = doc.kpiUpdates || [];
    const ts = D.nowMs + doc.kpiUpdates.length * 60000;
    doc.kpiUpdates.push({ id: 'UPD-TH-' + ts, kpiId: k.id, value: 1.3, timestamp: ts, note: '' });
    return 'recorded a 1.3 µm thickness reading';
  } },
  { who: 'sam@celadyne.com', run(D) {
    const P = D.portfolio;
    const k = (P.kpis || []).find((x) => x.id === 'KPI-BD-01-1');
    if (!k) return '';
    P.kpiUpdates = P.kpiUpdates || [];
    const ts = D.nowMs + P.kpiUpdates.length * 60000;
    P.kpiUpdates.push({ id: 'UPD-' + k.id + '-' + ts, kpiId: k.id, value: 1.5, timestamp: ts, note: '' });
    return 'recorded 1.5 MW of signed pilot capacity';
  } }
];
/* apply the next teammate edit straight to the data; returns "Toru Hayashi moved …" */
function planTeamEdit(C) {
  const i = C._teamNext || 0;
  for (let n = 0; n < PLAN_TEAM.length; n++) {
    const e = PLAN_TEAM[(i + n) % PLAN_TEAM.length];
    let what = '';
    try { what = e.run(C.D); } catch (err) { what = ''; }
    if (what) {
      C._teamNext = (i + n + 1) % PLAN_TEAM.length;
      return F.name(e.who) + ' ' + what + '.';
    }
  }
  return 'A teammate saved the plan.';
}
function planTeammate(C) {
  const S = C.state, bk = S.bk || {};
  if (!bk.token || (S.sim && S.sim.offline)) return;
  let what = '';
  C.mutate(() => { what = planTeamEdit(C); }, { quiet: true, allowRo: true });
  /* their save is now the broker's copy; our own unsaved state (none while auto-save works) stays merged */
  C._server = K.clone(C.D.portfolio);
  planSetBk(C, { last: what });
  C.toast('Updated from another editor.', 'info');
}

/* ------------------------------------------------------------ links */
function planBuildLink(L, withToken) {
  const ps = [];
  if (L.tab && L.tab !== 'overview') ps.push('tab=' + (L.tab === 'structure' ? 'portfolio' : L.tab));
  if (L.division) ps.push('division=' + encodeURIComponent(L.division));
  if (L.product) ps.push('product=' + encodeURIComponent(L.product));
  if (L.unit) ps.push('unit=' + encodeURIComponent(L.unit));
  if (L.quarter) ps.push('quarter=' + encodeURIComponent(L.quarter));
  if (L.readonly) ps.push('readonly=1');
  if (L.present) ps.push('present=1');
  if (L.ganttActive) ps.push('ganttActive=1');
  if (L.ganttQuarter) ps.push('ganttQuarter=1');
  if (withToken) ps.push('token=' + encodeURIComponent(withToken));
  return PLAN_URL + (ps.length ? '?' + ps.join('&') : '');
}
function planParseLink(url) {
  const raw = String(url == null ? '' : url).trim().split('#')[0];
  const qi = raw.indexOf('?');
  const query = qi >= 0 ? raw.slice(qi + 1) : '';
  const dec = (s) => { try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (e) { return String(s); } };
  const pairs = query.split('&').filter(Boolean).map((kv) => { const i = kv.indexOf('='); return { k: dec(i < 0 ? kv : kv.slice(0, i)), v: i < 0 ? '' : dec(kv.slice(i + 1)) }; });
  /* parameter NAMES are case-insensitive; values stay exact (DIV-FC is case-significant) */
  const get = (name) => { const w = name.toLowerCase(); const p = pairs.find((x) => x.k.toLowerCase() === w); return p ? p.v : null; };
  const flag = (name) => { const v = get(name); return v !== null && v !== '0' && v.toLowerCase() !== 'false'; };
  const stripped = (qi >= 0 ? raw.slice(0, qi) : raw) + (function () {
    const keep = pairs.filter((x) => x.k.toLowerCase() !== 'token').map((x) => encodeURIComponent(x.k) + (x.v === '' ? '' : '=' + encodeURIComponent(x.v)));
    return keep.length ? '?' + keep.join('&') : '';
  })();
  return { get, flag, has: (name) => get(name) !== null, hasQuery: qi >= 0, stripped };
}
/* the page's own parameters with lower-case names, read the way kit/net.js reads them (live builds) */
function planUrlParams() {
  const out = {};
  try { new URLSearchParams(window.location.search || '').forEach((v, k) => { out[String(k).toLowerCase()] = v; }); } catch (e) { /* no address */ }
  return out;
}
/* parameters with lower-case names ({ tab: 'gantt', … }) read like a link: get / flag / has, any = a view parameter is set */
function planParamsOf(u) {
  const src = u || {};
  const get = (name) => { const k = String(name).toLowerCase(); return Object.prototype.hasOwnProperty.call(src, k) && src[k] != null ? String(src[k]) : null; };
  const flag = (name) => { const v = get(name); return v !== null && v !== '0' && v.toLowerCase() !== 'false'; };
  return { get: get, flag: flag, has: (name) => get(name) !== null, any: PLAN_PARAMS.some((n) => get(n) !== null) };
}
/* the view Planning opens with these parameters on a fresh load (today's URLP). p: { get, flag, has }.
   Read-only: the sample's links turn it off with readonly=0 (fixed there); a live page follows kit/net.js,
   which, like today's app, turns it on whenever the parameter is there (roByPresence). */
function planLinkPatch(C, p, roByPresence) {
  const qNow = F.qOfDay(C.D.today);
  const present = p.flag('present');
  const asked = roByPresence ? p.has('readonly') : p.flag('readonly');
  const tabRaw = String(p.get('tab') || '').trim().toLowerCase();
  const tabMap = { overview: 'overview', portfolio: 'structure', structure: 'structure', gantt: 'gantt', milestones: 'milestones', settings: 'settings' };
  const tab = tabMap[tabRaw] || 'overview';
  const rq = p.get('quarter');
  return {
    tab: tab === 'settings' ? 'overview' : tab,
    f: { unit: p.get('unit') || '', div: p.get('division') || '', prod: p.get('product') || '', q: rq === 'active' ? qNow : (rq || ''), status: '' },
    group: { mode: 'hierarchy', dims: ['division'] },
    present: present, ro: asked || present, roByPresent: present && !asked,
    pg_active: p.flag('ganttActive'), pg_timeframe: p.flag('ganttQuarter'),
    sheets: tab === 'settings' ? [{ kind: 'shell.settings', data: {}, d: {}, err: '' }] : [],
    menu: '', dlg: null, lkPaste: ''
  };
}
/* opening a link = loading Planning fresh with those parameters (simulated in the sample; a live page goes there) */
function planOpenLink(C, url) {
  if (LIVE) { planGo(C, url); return; }
  const p = planParseLink(url);
  const patch = planLinkPatch(C, p, false);
  const tok = p.get('token');
  if (tok !== null) patch.bk = Object.assign({}, C.state.bk, { token: tok.trim() });
  C.setState(patch);
  C.toast(p.hasQuery ? 'Opened Planning with this link.' : 'Opened Planning with no parameters.', 'info');
  if (tok !== null) {
    C.toast('Token saved and removed from the address: ' + p.stripped, 'ok');
    planLoad(C);
  }
}
/* live: open a link in this tab; the page loads fresh with its parameters (unsaved changes: the browser asks first) */
function planGo(C, url) {
  const raw = String(url == null ? '' : url).trim();
  let u = null;
  try { u = raw ? new URL(raw, window.location.href) : null; } catch (e) { u = null; }
  if (!u || (u.protocol !== 'https:' && u.protocol !== 'http:')) { C.toast('That isn’t a link Planning can open. Paste the whole link, starting with https://.', 'err'); return; }
  try { window.location.assign(u.href); } catch (e) { C.toast('This page couldn’t open the link. Copy it and open it in a new tab.', 'err'); }
}

/* ------------------------------------------------------------ view models */
function planSetPresent(C, on) {
  const S = C.state;
  if (on) C.setState({ present: true, ro: true, roByPresent: !S.ro, sheets: [], menu: '' });
  else C.setState({ present: false, ro: S.roByPresent ? false : !!S.ro, roByPresent: false });
}
function planSetTheme(C, t) {
  C.setState({ theme: t });
  try { window.localStorage.setItem('rd_theme', t); } catch (e) { /* storage blocked */ }
}
/* any open sheet whose draft differs from what it opened with */
function planDirtySheets(C) {
  return (C.state.sheets || []).some((s) => s && s.data && typeof s.data.d0 === 'string' && JSON.stringify(s.d || {}) !== s.data.d0);
}
/* Escape closes the top sheet (asks first when its draft changed) */
function planEscape(C) {
  const top = C.sheet();
  if (!top) return;
  const dirty = top.data && typeof top.data.d0 === 'string' && JSON.stringify(top.d || {}) !== top.data.d0;
  if (dirty) { C.confirm({ title: 'Discard your changes?', body: 'Your edits in this panel are not saved yet.', ok: 'Discard changes', danger: true, onOk: () => C.closeSheet() }); return; }
  C.closeSheet();
}
function planScrim(C) {
  if (planDirtySheets(C)) {
    C.confirm({ title: 'Discard your changes?', body: 'Your edits in this panel are not saved yet.', ok: 'Discard changes', danger: true, onOk: () => C.closeAllSheets() });
    return;
  }
  C.closeAllSheets();
}
function planSaveVM(C, ctx) {
  if (LIVE) return planLiveSaveVM(C, ctx);
  const S = C.state, bk = S.bk || {}, sv = S.save || {};
  let text, tone = 't-ok', spin = false;
  if (sv.state === 'saving') { text = 'Saving…'; tone = 't-info'; spin = true; }
  else if (!bk.token) { text = 'Local scratch, not synced'; tone = 't-warn'; }
  else if (S.sim && S.sim.offline) { text = C._pending ? 'Offline, changes kept here' : 'Offline'; tone = 't-warn'; }
  else if (C._pending) { text = 'Changes not saved yet'; tone = 't-warn'; }
  else if (sv.state === 'conflict') { text = 'Reloaded after a conflict'; tone = 't-warn'; }
  else text = 'Saved ' + F.ago(sv.at || C.now(), C.now());
  return { text: text, cls: 'saveind ' + tone, spin: spin, noSpin: !spin, showBtn: !ctx.ro, click: () => C.saveNow() };
}
function planFilterVM(C, ctx) {
  const S = C.state, P = ctx.P, f = ctx.f, g = ctx.group;
  const setF = (k, v) => C.setState({ f: Object.assign({}, C.state.f, { [k]: v }), sheets: [], menu: '' });
  const setG = (gp) => C.setState({ group: Object.assign({}, C.state.group, gp), sheets: [], menu: '' });
  const sel = (key, label, all, opts) => ({
    label: label, v: f[key] || '',
    opts: [{ v: '', label: all }].concat(opts.map((o) => ({ v: o[0], label: o[1] }))),
    on: (e) => setF(key, e && e.target ? e.target.value : '')
  });
  const units = PLAN.byOrder(P.units || []);
  const qs = PLAN.quarters(P);
  if (f.q && qs.indexOf(f.q) < 0) qs.push(f.q);
  const chips = [];
  const chip = (key, label, val) => chips.push({ label: label + ': ' + val, aria: 'Remove the ' + label.toLowerCase() + ' filter', clear: () => setF(key, '') });
  if (f.unit) { const u = PLAN.byId(P, 'unit', f.unit); chip('unit', 'Unit', u ? u.name : f.unit); }
  if (f.div) { const d = PLAN.byId(P, 'division', f.div); chip('div', 'Division', d ? d.name : f.div); }
  if (f.prod) { const p = PLAN.byId(P, 'product', f.prod); chip('prod', 'Product', p ? p.name : f.prod); }
  if (f.q) chip('q', 'Quarter', F.q(f.q));
  if (f.status) { const st = PLAN_STATUS.find((x) => x[0] === f.status); chip('status', 'Status', st ? st[1] : f.status); }
  const dims = (g.dims || []).slice();
  const custom = g.mode === 'custom';
  const levels = dims.map((d, i) => {
    const used = dims.filter((x, j) => j !== i);
    return {
      sep: i > 0,
      v: d,
      aria: 'Grouping level ' + (i + 1),
      opts: PLAN_DIMS.filter((x) => x[0] === d || used.indexOf(x[0]) < 0).map((x) => ({ v: x[0], label: x[1] })),
      on: (e) => {
        const nd = e && e.target ? e.target.value : d;
        const arr = (C.state.group.dims || []).slice();
        arr[i] = nd;
        setG({ dims: arr.filter((x, j) => j === i || x !== nd) });
      },
      rmLabel: 'Remove the ' + PLAN.dimWord(d).toLowerCase() + ' level',
      rm: () => { const arr = (C.state.group.dims || []).slice(); arr.splice(i, 1); setG({ dims: arr }); }
    };
  });
  const unused = PLAN_DIMS.filter((x) => dims.indexOf(x[0]) < 0);
  return {
    show: !ctx.present && (ctx.tab === 'structure' || ctx.tab === 'gantt' || ctx.tab === 'milestones'),
    hasUnits: units.length > 0,
    unit: sel('unit', 'Unit', 'All units', units.map((u) => [u.id, u.name])),
    div: sel('div', 'Division', 'All divisions', PLAN.byOrder(P.divisions || []).map((d) => [d.id, d.name])),
    prod: sel('prod', 'Product', 'All products', PLAN.byOrder(P.products || []).map((p) => [p.id, p.name])),
    q: sel('q', 'Quarter', 'All quarters', qs.map((q) => [q, F.q(q)])),
    status: sel('status', 'Status', 'Any status', PLAN_STATUS),
    chips: chips,
    hasChips: chips.length > 0,
    clearAll: () => C.setState({ f: { unit: '', div: '', prod: '', q: '', status: '' }, sheets: [], menu: '' }),
    hier: custom ? 'false' : 'true',
    custom: custom,
    customPressed: custom ? 'true' : 'false',
    pickHier: () => setG({ mode: 'hierarchy' }),
    pickCustom: () => setG({ mode: 'custom', dims: (C.state.group.dims || []).length ? C.state.group.dims : ['division'] }),
    levels: levels,
    flat: custom && !dims.length,
    canAdd: unused.length > 0,
    addOpts: [{ v: '', label: dims.length ? 'Add a level…' : 'Group by…' }].concat(unused.map((x) => ({ v: x[0], label: x[1] }))),
    add: (e) => { const v = e && e.target ? e.target.value : ''; if (v) setG({ dims: (C.state.group.dims || []).concat([v]) }); }
  };
}
function planLinkVM(C, ctx) {
  const S = C.state, P = ctx.P, L = S.lk || {};
  const setL = (p) => C.setState({ lk: Object.assign({}, C.state.lk, p) });
  const sel = (key, label, all, opts) => ({
    label: label, v: L[key] || '',
    opts: (all == null ? [] : [{ v: '', label: all }]).concat(opts.map((o) => ({ v: o[0], label: o[1] }))),
    on: (e) => setL({ [key]: e && e.target ? e.target.value : '' })
  });
  const chk = (key, label) => ({ label: label, on: !!L[key], toggle: (e) => setL({ [key]: !!(e && e.target ? e.target.checked : !C.state.lk[key]) }) });
  const stored = LIVE ? NET.token() : '';
  const tok = LIVE ? (L.token ? stored : '') : (L.token && S.bk && S.bk.token ? S.bk.token : '');
  const url = planBuildLink(L, tok);
  return {
    tab: sel('tab', 'Opens on', null, [['overview', 'Overview'], ['structure', 'Structure'], ['gantt', 'Gantt'], ['milestones', 'Milestones'], ['settings', 'Settings']]),
    division: sel('division', 'Division', 'Any division', PLAN.byOrder(P.divisions || []).map((d) => [d.id, d.name + ' (' + d.id + ')'])),
    product: sel('product', 'Product', 'Any product', PLAN.byOrder(P.products || []).map((p) => [p.id, p.name + ' (' + p.id + ')'])),
    unit: sel('unit', 'Unit', 'Any unit', PLAN.byOrder(P.units || []).map((u) => [u.id, u.name + ' (' + u.id + ')'])),
    quarter: sel('quarter', 'Quarter', 'Any quarter', [['active', 'The current quarter (active)']].concat(PLAN.quarters(P).map((q) => [q, F.q(q)]))),
    checks: [chk('readonly', 'Read-only'), chk('present', 'Present mode (also read-only)'), chk('ganttActive', 'Gantt: active work only'), chk('ganttQuarter', 'Gantt: limit to the timeframe')],
    tokenChk: chk('token', 'Include the broker token (for an SSO-gated Confluence embed)'),
    tokenOff: LIVE ? !stored : !(S.bk && S.bk.token),
    /* live: the token never shows on screen; Copy link and Open carry it */
    url: LIVE && tok ? url.replace(/([?&]token=)[^&]*$/, '$1…') : url,
    copy: () => C.copyText(url, 'Link copied.', 'Copy didn’t work here. Select the link and copy it instead.'),
    open: () => planOpenLink(C, url),
    paste: S.lkPaste || '',
    onPaste: (e) => C.setState({ lkPaste: e && e.target ? e.target.value : '' }),
    pasteKey: (e) => { if (e && e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); planOpenLink(C, C.state.lkPaste); } },
    openPaste: () => planOpenLink(C, C.state.lkPaste),
    canOpenPaste: !!String(S.lkPaste || '').trim(),
    noPaste: !String(S.lkPaste || '').trim()
  };
}
/* who may change the plan, for the Settings note: "You can change the plan." or why not, and who can */
function planEditNote(C) {
  if (C.canEditPlan()) return 'You can change the plan.';
  const v = C.viewer();
  return (v ? (LIVE ? F.name(v.email) : v.name) + ' can view the plan but not change it.' : 'Signed out: the plan is view only.') + ' Planning changes are made by the CTO and CEO' + planEditorsClause(C, ' (', ')') + '.';
}
/* " (Corey Staller and Dana Whitcomb)": the plan's editors between pre and post; a live roster that names
   nobody yet (still loading) leaves the clause out instead of printing empty brackets */
function planEditorsClause(C, pre, post) {
  const who = C.planEditorsText();
  return LIVE && !who ? '' : pre + who + post;
}
function planSettingsVM(C, ctx) {
  if (LIVE) return planLiveSettingsVM(C, ctx);
  const S = C.state, bk = S.bk || {};
  const offline = !!(S.sim && S.sim.offline);
  const conflictText = bk.conflict === 'merge' ? 'Armed: the next save meets a 412 conflict and merges.' : bk.conflict === 'fail' ? 'Armed: the next save meets a 412 conflict and can’t merge.' : '';
  let teamHint = 'Planning checks the broker every 25 seconds and pulls a document only when its version changed.';
  if (!bk.token) teamHint = 'Polling runs only with a broker token.';
  else if (offline) teamHint = 'Offline: the 25-second check can’t reach the broker, so nothing arrives.';
  return {
    themes: [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']].map((x) => ({ label: x[1], on: S.theme === x[0] ? 'true' : 'false', pick: () => planSetTheme(C, x[0]) })),
    hub: C.viewerVM(),
    canEdit: C.canEditPlan(),
    editNote: planEditNote(C),
    roOn: !!S.ro,
    roLocked: !!S.present,
    toggleRo: (e) => { if (C.state.present) return; C.setState({ ro: !!(e && e.target ? e.target.checked : !C.state.ro), roByPresent: false }); },
    presentOn: !!S.present,
    togglePresent: (e) => planSetPresent(C, !!(e && e.target ? e.target.checked : !C.state.present)),
    tokenSet: !!bk.token,
    tokenStatus: bk.token ? 'Token set. Live sync active.' : 'No token set — running on local scratch data.',
    tokenCls: 'st ' + (bk.token ? 't-ok' : 't-warn'),
    tokenDraft: S.bkDraft || '',
    onToken: (e) => C.setState({ bkDraft: e && e.target ? e.target.value : '' }),
    tokenKey: (e) => { if (e && e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); planSaveToken(C); } },
    saveToken: () => planSaveToken(C),
    removeToken: () => planSaveToken(C, ''),
    reload: () => planLoad(C),
    loaded: bk.token ? 'Last loaded ' + F.stamp(bk.loadedAt) + '.' : 'Edits stay in this browser and are lost on reload.',
    canTeammate: !!bk.token && !offline,
    noTeammate: !bk.token || offline,
    teammate: () => planTeammate(C),
    teamHint: teamHint,
    hasLast: !!bk.last,
    last: bk.last ? 'Last change from another editor: ' + bk.last : '',
    armMerge: () => planSetBk(C, { conflict: 'merge' }),
    armFail: () => planSetBk(C, { conflict: 'fail' }),
    disarm: () => planSetBk(C, { conflict: '' }),
    armed: !!bk.conflict,
    notArmed: !bk.conflict,
    armedText: conflictText,
    offline: offline,
    toggleOffline: (e) => {
      const on = !!(e && e.target ? e.target.checked : !offline);
      const patch = { sim: Object.assign({}, C.state.sim, { offline: on }) };
      if (!on && C._pending) patch.save = { state: 'pending', at: C.now() };
      C.setState(patch);
    },
    reject: !!bk.reject,
    toggleReject: (e) => planSetBk(C, { reject: !!(e && e.target ? e.target.checked : !bk.reject) }),
    link: planLinkVM(C, ctx),
    reset: () => C.confirm({ title: 'Restore the sample data?', body: 'Every change you made in this prototype is discarded.', ok: 'Restore', danger: true, onOk: () => C.resetData() })
  };
}

function APP_CTX(C) {
  const D = C.D, S = C.state, P = D.portfolio;
  const today = D.today;
  const execMap = planExecMap(D);
  const em = RD.withPortfolio(P, execMap);
  const fullEm = RD.withPortfolio(P, Object.assign({}, execMap, D.spec || {}));
  const pool = planPool(em);
  const qNow = F.qOfDay(today);
  const f = Object.assign({ unit: '', div: '', prod: '', q: '', status: '' }, S.f || {});
  const group = S.group || { mode: 'hierarchy', dims: ['division'] };
  const objBand = (id) => C.memo('pl.ob:' + id, () => RD.band(RD.rollupObjective(id, P, em)));
  const msBand = (id) => C.memo('pl.mb:' + id, () => {
    const m = PLAN.byId(P, 'milestone', id);
    if (m && RD.milestoneAchieved(m, em)) return 'on-track';
    return RD.band(RD.milestoneScore(id, em));
  });
  const unitOf = (divId) => RD.unitIdOfDivision(divId, P) || '';
  const objMatch = (o) => {
    if (!o) return false;
    if (f.unit && unitOf(o.divisionId) !== f.unit) return false;
    if (f.div && o.divisionId !== f.div) return false;
    if (f.prod && (RD.effProduct(o, P) || null) !== f.prod) return false;
    if (f.q && (o.quarter || '') !== f.q) return false;
    if (f.status && objBand(o.id) !== f.status) return false;
    return true;
  };
  const initMatch = (i) => {
    if (!i) return false;
    if (f.q || f.status) return false;
    if (f.unit && unitOf(i.divisionId) !== f.unit) return false;
    if (f.div && i.divisionId !== f.div) return false;
    if (f.prod && (RD.effProduct(i, P) || null) !== f.prod) return false;
    return true;
  };
  const initHasMatch = (i) => {
    const os = (P.objectives || []).filter((o) => o.initiativeId === i.id);
    return os.length ? os.some(objMatch) : initMatch(i);
  };
  const msMatch = (m) => {
    if (!m) return false;
    const ini = PLAN.byId(P, 'initiative', m.initiativeId);
    const div = ini ? ini.divisionId : null;
    if (f.unit && unitOf(div) !== f.unit) return false;
    if (f.div && div !== f.div) return false;
    if (f.prod && PLAN.msProduct(P, m) !== f.prod) return false;
    if (f.q && PLAN.msQuarter(m) !== f.q) return false;
    if (f.status && msBand(m.id) !== f.status) return false;
    return true;
  };
  const prodShows = (p) => {
    if (f.unit && unitOf(p.divisionId) !== f.unit) return false;
    if (f.div && p.divisionId !== f.div) return false;
    if (f.prod && p.id !== f.prod) return false;
    return true;
  };
  const divShows = (d) => {
    if (f.div && d.id !== f.div) return false;
    if (f.unit && (d.unitId || null) !== f.unit) return false;
    return true;
  };
  const isActiveObj = (o) => {
    const sc = RD.rollupObjective(o.id, P, em);
    if (sc != null && sc >= 100) return false;
    if ((o.quarter || '') === qNow) return true;
    return o.plannedStart != null && o.plannedEnd != null && o.plannedStart <= today && today <= o.plannedEnd;
  };
  const isActiveMs = (m) => {
    if (RD.milestoneAchieved(m, em)) return false;
    if (PLAN.msPaused(P, m.id)) return false;
    return PLAN.msQuarter(m) === qNow;
  };
  return {
    today: today, nowMs: C.now(), qNow: qNow, D: D, P: P,
    /* live: nothing is editable until the broker's plan is loaded (the kit's guard refuses the writes too),
       nor on a page the broker calls out of date (nothing it changes could be saved) */
    ro: !!S.ro || !!S.present || !C.canEditPlan() || (LIVE && !planLiveEditable(S)), locked: !C.canEditPlan(), present: !!S.present, tab: S.tab,
    execDocs: D.docs, execMap: execMap, em: em, specMap: D.spec || {}, fullEm: fullEm, pool: pool,
    docOf: (divId) => PLAN.docOf(D, divId),
    appOf: (divId) => PLAN.appOf(P, divId),
    objEnd: (o) => PLAN.objEnd(D, o),
    f: f, group: group,
    anyFilter: !!(f.unit || f.div || f.prod || f.q || f.status),
    workFilter: !!(f.q || f.status),
    objMatch: objMatch, initMatch: initMatch, initHasMatch: initHasMatch, msMatch: msMatch,
    prodShows: prodShows, divShows: divShows,
    objBand: objBand, msBand: msBand,
    paused: (id) => PLAN.msPaused(P, id),
    casc: () => C.memo('pl.casc', () => RD.cascade(PLAN.liveP(P), em, today)),
    isActiveObj: isActiveObj, isActiveMs: isActiveMs
  };
}

/* ------------------------------------------------- who may change the plan (the CTO and the CEO) */
/* Everyone else sees the whole plan, view only. The kit's guard refuses every write while this is true,
   and ctx.ro hides every editing control, so no module needs its own check. */
function APP_LOCKED(C) { return !C.canEditPlan(); }
function APP_LOCK_MESSAGE(C) { return 'Planning changes are made by the CTO and CEO' + planEditorsClause(C, ' (', ')') + '.'; }
/* signing in as someone who can't change the plan drops any half-done edit */
function APP_VIEWER_CHANGED(C) {
  if (C.canEditPlan()) return;
  const patch = {};
  ['ped_rec', 'pg_drag', 'pg_pop'].forEach((k) => { if (C.state[k]) patch[k] = null; });
  if (Object.keys(patch).length) C.setState(patch);
}
function planLockVM(C, ctx) {
  if (!ctx.locked || ctx.present) return null;
  const v = C.viewer();
  const who = planEditorsClause(C, ': ', '');
  /* live, signed out inside a Confluence embed (the browser hides the Hub sign-in there): link to the full page */
  if (LIVE && !v && inEmbed()) {
    let href = '';
    try { href = String(window.location.href || ''); } catch (e) { href = ''; }
    return { title: 'View only', text: 'Inside a Confluence page your Hub sign-in isn’t visible, so the plan is view only here.', full: !!href, fullHref: href };
  }
  const out = {
    title: 'View only',
    text: v
      ? 'You can see the whole plan. Changes are made by the CTO and CEO' + who + '.'
      : 'You’re not signed in to the Hub, so the plan is view only. Changes are made by the CTO and CEO' + who + '.'
  };
  if (LIVE) { out.full = false; out.fullHref = ''; }
  return out;
}

function APP_SHELL(C, ctx) {
  const S = C.state;
  const t = {};
  PLAN_TABS.forEach((x) => { t[x[0]] = ctx.tab === x[0]; });
  const cur = PLAN_TABS.find((x) => x[0] === ctx.tab) || PLAN_TABS[0];
  const fb = planFilterVM(C, ctx);
  const top = C.sheet();
  const out = {
    me: C.meVM(),
    tabs: PLAN_TABS.map((x) => ({ label: x[1], cls: ctx.tab === x[0] ? 'tab on' : 'tab', navCls: ctx.tab === x[0] ? 'nav on' : 'nav', cur: ctx.tab === x[0] ? 'page' : undefined, pick: () => C.setState({ tab: x[0], menu: '', sheets: [] }) })),
    t: t,
    tabName: cur[1],
    pageCls: 'page pl-page' + (ctx.tab === 'gantt' ? ' wide' : ''),
    /* the marker names a person's choice or rule; a live page that has nothing loaded yet says so in its banner instead */
    roOn: LIVE ? ctx.ro && !!(S.ro || S.present || ctx.locked) : ctx.ro,
    roLabel: ctx.locked && !S.ro && !S.present ? 'View only' : 'Read-only',
    roTitle: ctx.locked && !S.ro && !S.present ? APP_LOCK_MESSAGE(C) : 'Read-only view: nothing can be changed or saved.',
    lock: planLockVM(C, ctx),
    present: !!S.present,
    exitPresent: () => planSetPresent(C, false),
    save: planSaveVM(C, ctx),
    openSettings: () => C.openSheet('shell.settings', {}, {}),
    fb: fb,
    ovFilters: !ctx.present && ctx.tab === 'overview' && fb.hasChips,
    sheetKey: (e) => { if (e && e.key === 'Escape') planEscape(C); },
    /* a confirm or ask dialog: Escape cancels it (focus starts on Cancel for a confirm) */
    dlgKey: (e) => { if (e && e.key === 'Escape') { if (e.stopPropagation) e.stopPropagation(); C.dlgCancel(); } },
    scrim: () => planScrim(C),
    settings: (top && top.kind === 'shell.settings') ? planSettingsVM(C, ctx) : null
  };
  if (LIVE) {
    const L = S.pl_load || {};
    out.load = planLoadVM(C);
    out.ready = !!(L.ever || L.loaded);   // the plan's views appear once something has been loaded
  }
  return out;
}

/* ============================================================== live builds (kit/net.js; LIVE.md) */
/* the documents Planning reads after the portfolio: each division's execution document (BIZ- for a business
   division) and each R&D division's spec document. 'gantt-view' is not among them. */
function planLiveDocs(P) {
  const ids = [];
  ((P && P.divisions) || []).forEach((d) => {
    if (!d || !d.id) return;
    const biz = RD.divisionKind(d) === 'biz';
    ids.push((biz ? 'BIZ-' : 'EXEC-') + d.id);
    if (!biz) ids.push('SPEC-' + d.id);
  });
  return ids;
}
function APP_LIVE_PLAN(C) {
  return {
    roster: true,              // names and roles: only the CTO and the CEO change the plan
    prefs: false,              // no kanban here
    autoPass: false,           // Planning never writes execution documents, so it passes no gates
    /* no portfolio on the broker yet: today's Planning starts from a blank one and saves it with If-Match "0"
       on the first change. Read by the kit only once kit/net.js supports it (see the report / LIVE.md);
       until then 'noportfolio' leaves the page empty, with a banner. */
    createPortfolio: true,
    docs: planLiveDocs,
    writable: (id) => id === 'portfolio'
  };
}
/* when the page starts: no documents and no hand-off yet, but the page's parameters already set the view
   (present mode, read-only, the tab and the filters hold from the first frame, and through a failed load) */
function planLiveInit(C, st) {
  st.pl_load = { phase: 'loading', status: null, loaded: false, ever: false };
  C._plUrl = planUrlParams();
  const p = planParamsOf(C._plUrl);
  if (p.any) Object.assign(st, planLinkPatch(C, p, true));
}
/* after every successful load; url = the page's parameters on the first successful load (null after that) */
function APP_LIVE_READY(C, url) {
  if (C._plReady) return;                 // a reload keeps the view the person is on
  C._plReady = true;
  const h = C.takeHandoff(APP);           // read once, now that the documents it points at are here
  const p = planParamsOf(url || C._plUrl);
  if (p.any) {
    /* the first load opens exactly the view the link asks for, like a fresh load (parameters win over a hand-off) */
    if (url) C.setState(planLinkPatch(C, p, true));
    return;
  }
  if (h) C.setState(Object.assign({ menu: '' }, planHandoffPatch(C, h)));
}
/* s = { phase, status }: remembered in C.state.pl_load for the banner, the save indicator and Settings */
function APP_LIVE_STATUS(C, s) {
  const info = NET.info(C);
  const prev = C.state.pl_load || {};
  const L = { phase: s.phase, status: s.status || null, loaded: !!info.loaded, ever: !!prev.ever || !!info.loaded };
  C.setState({ pl_load: L, bk: Object.assign({}, C.state.bk, { token: !!info.hasToken }) });
  if (s.phase === 'loading' || !C._plAsked) return;
  /* the person asked for this load (Save token, Load from the broker): say how it went, as today */
  C._plAsked = false;
  if (s.phase === 'ok') { C.toast(planLoadedText(C), 'ok'); return; }
  const n = planLoadNote(C, L);
  if (n) C.toast(n.text, n.tone === 'bad' ? 'err' : 'info');
}
/* the loaded plan can be changed here: something is loaded, and the broker has not called the page out of date */
function planLiveEditable(S) {
  const L = S.pl_load || {};
  return !!L.loaded && L.phase !== 'outdated';
}
/* a portfolio with nothing in it (no plan on the broker yet) */
function planEmptyPlan(P) {
  return !['units', 'divisions', 'products', 'models', 'initiatives', 'milestones', 'objectives', 'kpis'].some((k) => P && Array.isArray(P[k]) && P[k].length);
}
/* what the banner says about the connection: { tone: 'info' | 'warn' | 'bad', text, spin, act: { label, fn } }, or null */
function planLoadNote(C, L) {
  if (!L) return null;
  const settings = { label: 'Open Settings', fn: () => C.openSheet('shell.settings', {}, {}) };
  switch (L.phase) {
    case 'loading': return L.ever ? null : { tone: 'info', spin: true, text: 'Loading the plan from the broker…' };
    case 'notoken': return { tone: 'warn', text: 'No broker token in this browser yet. Open this app from the Hub, or add the token in Settings.', act: settings };
    case 'badtoken': return { tone: 'bad', text: 'The broker didn’t accept the token (401). Check it in Settings.', act: settings };
    case 'fail': return { tone: 'bad', text: 'Load failed' + (L.status ? ' (' + L.status + ')' : '') + '. Check the token in Settings.', act: settings };
    case 'offline': return { tone: 'warn', text: 'Couldn’t reach the broker. Check your connection; this page keeps trying.', act: { label: 'Try again', fn: () => planReload(C) } };
    case 'outdated': return { tone: 'bad', text: 'This page is out of date. Reload it to keep working.', act: { label: 'Reload the page', fn: () => planReloadPage(C) } };
    case 'noportfolio':
      /* a page that could start the plan (kit support) says so until the first change saves it */
      if (L.loaded) return planEmptyPlan(C.D.portfolio) ? { tone: 'info', text: C.canEditPlan() && !C.state.ro && !C.state.present ? 'There is no plan on the broker yet. Your first change creates it.' : 'There is no plan on the broker yet.' } : null;
      return { tone: 'warn', text: 'There is no plan on the broker yet.', act: { label: 'Load from the broker', fn: () => planReload(C) } };
    default: return null;
  }
}
function planLoadVM(C) {
  const n = planLoadNote(C, C.state.pl_load);
  if (!n) return null;
  return {
    cls: 'banner pl-load ' + (n.tone === 'bad' ? 't-bad' : n.tone === 'warn' ? 't-warn' : 't-info'),
    text: n.text, spin: !!n.spin, warn: n.tone !== 'info',
    act: n.act ? { label: n.act.label, fn: n.act.fn } : null
  };
}
/* a load the person asked for (Load from the broker, Try again, Save token): its outcome is also toasted.
   The kit may decline to reload (unsaved changes it can't save yet): then there is no outcome to report. */
function planAsk(C, start) {
  C._plAsked = true;
  const p = start();
  if (p && typeof p.then === 'function') p.then((r) => { if (r === false) C._plAsked = false; }, () => { C._plAsked = false; });
}
function planReload(C) { planAsk(C, () => NET.reload(C)); }
function planReloadPage(C) {
  try { window.location.reload(); } catch (e) { C.toast('This page couldn’t reload itself. Use your browser’s Reload.', 'err'); }
}
/* the top bar's save indicator, from the kit's real save state */
function planLiveSaveVM(C, ctx) {
  const S = C.state, L = S.pl_load || {}, sv = S.save || {};
  let text, tone = 't-ok', spin = false;
  if (L.phase === 'loading') { text = 'Loading…'; tone = 't-info'; spin = true; }
  else if (!L.loaded) {
    text = L.phase === 'offline' ? 'Offline' : L.phase === 'outdated' ? 'Out of date' : 'Not loaded';
    tone = L.phase === 'notoken' || L.phase === 'offline' || L.phase === 'noportfolio' ? 't-warn' : 't-bad';
  }
  else if (sv.state === 'saving') { text = 'Saving…'; tone = 't-info'; spin = true; }
  else if (sv.state === 'offline') { text = sv.pending ? 'Offline, changes kept here' : 'Offline'; tone = 't-warn'; }
  else if (sv.state === 'error') { text = sv.why || 'Not saved'; tone = 't-bad'; }
  else text = 'Saved ' + F.ago(sv.at || C.now(), C.now());
  return { text: text, cls: 'saveind ' + tone, spin: spin, noSpin: !spin, showBtn: !ctx.ro && !!L.loaded, click: () => C.saveNow() };
}
/* Settings › Broker: the token is saved in this browser (rd_broker_token) and the page loads again */
function planLiveSaveToken(C, value) {
  const remove = value === '';
  const tok = String(value == null ? C.state.bkDraft || '' : value).trim();
  if (!tok && !remove) { C.toast('Paste the token first.', 'err'); return; }
  C.setState({ bkDraft: '', bk: Object.assign({}, C.state.bk, { token: !!tok }) });
  C.toast(tok ? 'Token saved.' : 'Token removed.', 'ok');
  planAsk(C, () => NET.saveToken(C, tok));
}
function planLiveSettingsVM(C, ctx) {
  const S = C.state, L = S.pl_load || {};
  const info = NET.info(C);
  const noPlan = L.phase === 'noportfolio' && (!info.loaded || planEmptyPlan(C.D.portfolio));
  let status, tone;
  if (!info.hasToken) { status = 'No token set — add one to load live data.'; tone = 't-warn'; }
  else if (L.phase === 'loading') { status = 'Token set. Loading from the broker…'; tone = 't-info'; }
  else if (L.phase === 'badtoken') { status = 'The broker didn’t accept this token (401).'; tone = 't-bad'; }
  else if (L.phase === 'fail') { status = 'Token set. The last load failed' + (L.status ? ' (' + L.status + ')' : '') + '.'; tone = 't-bad'; }
  else if (L.phase === 'outdated') { status = 'This page is out of date. Reload it to keep working.'; tone = 't-bad'; }
  else if (info.offline || L.phase === 'offline') { status = 'Token set. The broker can’t be reached right now.'; tone = 't-warn'; }
  else if (noPlan) { status = 'Token set. The broker has no plan yet.'; tone = 't-warn'; }
  else if (info.loaded) { status = 'Token set. Live sync active.'; tone = 't-ok'; }
  else { status = 'Token set.'; tone = 't-warn'; }
  return {
    themes: [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']].map((x) => ({ label: x[1], on: S.theme === x[0] ? 'true' : 'false', pick: () => planSetTheme(C, x[0]) })),
    hub: C.viewerVM(),
    canEdit: C.canEditPlan(),
    editNote: planEditNote(C),
    roOn: !!S.ro,
    roLocked: !!S.present,
    toggleRo: (e) => { if (C.state.present) return; C.setState({ ro: !!(e && e.target ? e.target.checked : !C.state.ro), roByPresent: false }); },
    presentOn: !!S.present,
    togglePresent: (e) => planSetPresent(C, !!(e && e.target ? e.target.checked : !C.state.present)),
    tokenSet: info.hasToken,
    tokenStatus: status,
    tokenCls: 'st ' + tone,
    tokenDraft: S.bkDraft || '',
    onToken: (e) => C.setState({ bkDraft: e && e.target ? e.target.value : '' }),
    tokenKey: (e) => { if (e && e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); planLiveSaveToken(C); } },
    saveToken: () => planLiveSaveToken(C),
    removeToken: () => planLiveSaveToken(C, ''),
    reload: () => planReload(C),
    loaded: info.loaded
      ? 'Last loaded ' + F.ago(info.lastLoad, C.now()) + '.' + (info.pending ? ' Some changes are not saved yet.' : '')
      : 'Nothing is loaded yet.',
    link: planLinkVM(C, ctx)
  };
}
