/* ============================================================================
   Product spec shell (apps/spec). Owner: S-core. spec.md §1–4, §14–15, §18–19.
   Owns: selection (division, product, model), the sidebar product tree, the header,
   the model header with its conformance facts and signal bars, the status banner,
   the settings sheet (broker token, theme, product families, export / import JSON,
   read-only preview, URL-parameter links, sync simulations) and the "Model spec
   details" sheet.

   Live builds (LIVE, see LIVE.md): NET (kit/net.js) loads the portfolio and every R&D division's
   SPEC document (APP_LIVE_PLAN) and saves SPEC-* and the portfolio. The hooks at the end of this
   file pick the division, product and model after a load (APP_LIVE_READY) and show load states
   and other editors' changes in the banner (APP_LIVE_STATUS, APP_LIVE_NOTICE). Every simulation
   in this file (token-less local mode, slow or unreachable documents, 412s, teammate edits,
   restoring the sample) runs only in the sample build.

   ctx (read-only for modules; recomputed every render):
     today, nowMs, P (portfolio), ro
     connected      sample: a broker token is set (no token = the live app's local mode: no
                    portfolio). live: NET has loaded from the broker
     divs           divisions this app lists (kind 'rd'; biz divisions have no products here)
     div, divId     selected division
     docKey, doc    'SPEC-DIV-EL' and that document (always exists)
     products       products of the division (plan order); product, productId
     models         models of the product; model, modelId (the model being specified)
     em             RD.withPortfolio(P, { DOC: doc }) — the exact map the live app hands the engine
     AK             doc.kpis + P.kpis — the live app's allKpis()
     specs          this model's specifications (doc.keyResults, array order = display order)
     comps          this model's plain components (doc.stageGates without refModel, array order)
     subHosts       this model's sub-product hosts (doc.stageGates with refModel)
     productIdOf(modelId), productName(productId), modelById(id), productById(id),
     divOfProduct(productId) -> division name, specName(krId), componentName(sgId)
     refDivOfModel(modelId)  division id of a model's product
     refDocOfModel(modelId)  -> null while loading | { doc, failed? } (sample: other divisions are
                                simulated, Settings can make them slow or unreachable. live: NET
                                loaded every R&D division's document; one that is not there failed)
     refAllKpis(rdoc), refEm(rdoc), resolveRef(member)   sub-product resolution, as the live app
     portfolioWrite(apply, okMsg)  write the shared portfolio (composition edges) the way the
                                live app does: apply(D) changes D.portfolio; shows okMsg, or
                                "… (merged with a concurrent change)" when Settings simulates a 412.
                                live: C.mutate; NET saves the portfolio and merges on a 412 itself
   ========================================================================== */
const SPEC_HUB = 'https://celadynestaller.github.io/CeladyneHQ/';
const SPEC_MATURITY = ['Concept', 'Prototype', 'Pilot', 'Pre-production', 'Production'];

function specAllDivs(D) { return ((D.portfolio && D.portfolio.divisions) || []).slice().sort(K.byOrder); }
function specDivs(D) { return specAllDivs(D).filter((d) => RD.divisionKind(d) !== 'biz'); }
function specBlankDoc() { return { keyResults: [], stageGates: [], kpis: [], kpiUpdates: [], modelSpec: {} }; }
function specLS(key, value) {
  try {
    if (value === undefined) return window.localStorage.getItem(key);
    if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value);
  } catch (e) { return null; }
  return null;
}
function specUrlParams() {
  try {
    const s = (window.location && window.location.search) || '';
    if (!s) return {};
    const p = new URLSearchParams(s);
    return { division: p.get('division') || '', product: p.get('product') || '', token: p.get('token') || '', readonly: p.has('readonly') };
  } catch (e) { return {}; }
}

/* load-time repairs (L356–384): legacy links -> explicit, legacy host types renamed,
   colliding component / specification ids re-numbered and their metrics re-homed */
function specNormalizeDoc(doc) {
  if (!doc) return false;
  ['keyResults', 'stageGates', 'kpis', 'kpiUpdates'].forEach((k) => { if (!Array.isArray(doc[k])) doc[k] = []; });
  if (!doc.modelSpec || typeof doc.modelSpec !== 'object') doc.modelSpec = {};
  RD.migrateKpiLinks(doc.kpis);
  doc.kpis.forEach((k) => { if (k.hostType === 'initiative') k.hostType = 'product'; else if (k.hostType === 'stageGate') k.hostType = 'component'; });
  let changed = false;
  const sgs = doc.stageGates, kpis = doc.kpis;
  const groups = {};
  sgs.forEach((g) => { (groups[g.id] = groups[g.id] || []).push(g); });
  const used = sgs.map((g) => g.id);
  Object.keys(groups).forEach((oldId) => {
    const grp = groups[oldId];
    if (grp.length < 2) return;
    changed = true;
    const hosted = kpis.filter((k) => k.hostType === 'component' && k.hostId === oldId);
    grp.forEach((g) => { const fresh = RD.allocId('stageGate', g.objectiveId || 'MDL-X', used); used.push(fresh); g.__newId = fresh; });
    const firstNormal = grp.find((g) => !g.refModel) || grp[0];
    hosted.forEach((k) => {
      let host = null;
      if (k.refModel) host = grp.find((g) => g.refModel === k.refModel);
      k.hostId = (host || firstNormal).__newId;
    });
    grp.forEach((g) => { g.id = g.__newId; delete g.__newId; });
  });
  const krs = doc.keyResults, kseen = {}, kused = krs.map((k) => k.id);
  krs.forEach((kr) => {
    if (kseen[kr.id]) { const fresh = RD.allocId('keyResult', kr.objectiveId || 'MDL-X', kused); kr.id = fresh; kused.push(fresh); changed = true; }
    kseen[kr.id] = 1;
  });
  return changed;
}

/* live: a link to this page with parameters, as a full address (the relative name becomes
   product_designer.html when standalone.py packages the live pages) */
function specAbsUrl(rel) {
  try { return new URL(rel, window.location.href).href; } catch (e) { return rel; }
}

/* ---- initial state: called once from the constructor (and after "Restore the sample data") */
function APP_INIT(C, st) {
  if (LIVE) { specInitLive(C, st); return; }
  const D = C.D;
  Object.keys(D.spec || {}).forEach((k) => specNormalizeDoc(D.spec[k]));
  const divs = specDivs(D);
  const url = specUrlParams();
  /* theme (L4–10): rd_theme if valid, else follow the OS; storage that throws means dark */
  let theme = 'light';   /* Calm: light until a choice is saved, so the four boards match (today follows the OS; 'Match system' does that) */
  try { const t = window.localStorage.getItem('rd_theme'); if (t === 'light' || t === 'dark' || t === 'system') theme = t; } catch (e) { /* storage blocked: stay light */ }
  st.theme = theme;
  /* division: ?division, else the last session (rd_division), else the story's Electrolyzer */
  let divId = url.division || specLS('rd_division') || 'DIV-EL';
  const dd = specAllDivs(D).find((x) => x.id === divId);
  if (!dd) divId = divs.some((x) => x.id === 'DIV-EL') ? 'DIV-EL' : (divs[0] ? divs[0].id : '');
  else if (RD.divisionKind(dd) === 'biz') divId = divs[0] ? divs[0].id : '';   /* a biz division redirects to the first product division (L478) */
  st.divId = divId;
  /* today's loadAll stores the resolved division on every load with a token (L480) */
  if (divId) specLS('rd_division', divId);
  st.productId = 'PRD-EL-1';
  st.modelId = 'MDL-EL-1-1';
  if (url.product) st.productId = url.product;
  if (divId !== 'DIV-EL') { st.productId = url.product || ''; st.modelId = ''; }
  if (url.readonly) st.ro = true;
  st.sh_token = url.token || 'sample-broker-token';
  st.sh_banner = null;
  st.sh_open = {};
  st.sh_sim = { refDown: false, refLoading: false, portConflict: false };
  st.sh_lastPoll = D.nowMs;
  st.sh_link = { division: divId, product: '', token: '', readonly: false };
  const h = C.takeHandoff(APP);
  if (h && h.model) {
    const P = D.portfolio;
    const m = (P.models || []).find((x) => x.id === h.model);
    const p = m && (P.products || []).find((x) => x.id === m.productId);
    if (m && p && divs.some((x) => x.id === p.divisionId)) { st.divId = p.divisionId; st.productId = p.id; st.modelId = m.id; }
  }
}
/* live: C.D is still empty here (NET loads it after mount), so nothing below reads data. NET repairs
   each document as it loads (REPAIR.spec, the same clean-up as specNormalizeDoc) and applies ?readonly;
   APP_LIVE_READY picks the division, product and model and takes the other apps' hand-off */
function specInitLive(C, st) {
  let theme = 'light';   /* light until a choice is saved, as on the canvas (decided October 14) */
  try { const t = window.localStorage.getItem('rd_theme'); if (t === 'light' || t === 'dark' || t === 'system') theme = t; } catch (e) { /* storage blocked: stay light */ }
  st.theme = theme;
  st.divId = '';
  st.productId = '';
  st.modelId = '';
  st.sh_token = '';
  st.sh_banner = null;
  st.sh_open = {};
  st.sh_sim = { refDown: false, refLoading: false, portConflict: false };
  st.sh_lastPoll = 0;
  st.sh_link = { division: '', product: '', token: '', readonly: false };
  st.sh_live = { phase: 'loading', status: null };   // the last load state NET reported (APP_LIVE_STATUS)
  st.sh_picked = false;                             // the page's parameters have been applied (APP_LIVE_READY)
}
function APP_RESET(C) {
  const st = {};
  APP_INIT(C, st);
  st.theme = C.state.theme;
  C.setState(st);
}

/* ---- context for modules */
function APP_CTX(C) {
  const D = C.D, S = C.state;
  /* live: the portfolio is the broker's (blank until NET loads it, and kept after a failed reload) */
  const connected = LIVE ? !!(C.net && C.net.loaded) : !!S.sh_token;
  const P = LIVE || connected ? D.portfolio : { divisions: [], products: [], models: [], kpis: [], composition: [], objectives: [], initiatives: [] };
  const divs = LIVE || connected ? specDivs(D) : [];
  /* live: when the picked division is gone (deleted in Planning since), fall back to one whose document loaded */
  const div = divs.find((d) => d.id === S.divId) || (LIVE ? divs.find((d) => D.spec['SPEC-' + d.id]) : null) || divs[0] || null;
  const divId = div ? div.id : '';
  const docKey = divId ? 'SPEC-' + divId : '';
  /* live: only a division whose document failed to load can lack one here; the blank one NET then saves
     with If-Match "0" after your first change, so it never overwrites a document the broker has (412) */
  if (docKey && !D.spec[docKey]) D.spec[docKey] = specBlankDoc();
  const doc = docKey ? D.spec[docKey] : specBlankDoc();
  const products = (P.products || []).filter((p) => p.divisionId === divId).slice().sort(K.byOrder);
  const product = products.find((p) => p.id === S.productId) || products[0] || null;
  const models = product ? (P.models || []).filter((m) => m.productId === product.id).slice().sort(K.byOrder) : [];
  const model = models.find((m) => m.id === S.modelId) || models[0] || null;
  const modelId = model ? model.id : '';
  const pk = P.kpis || [];
  const AK = pk.length ? doc.kpis.concat(pk) : doc.kpis;
  const em = RD.withPortfolio(P, { DOC: doc });
  /* remember the document before your last change: the 412 simulation reloads it (sample only) */
  if (!LIVE && C._snapVer !== D.version) {
    C._specPrev = C._specCur || null;
    C._specCur = { key: docKey, json: JSON.stringify(doc) };
    C._snapVer = D.version;
  }
  const modelById = (id) => (P.models || []).find((m) => m.id === id) || null;
  const productById = (id) => (P.products || []).find((p) => p.id === id) || null;
  const productIdOf = (mid) => { const m = modelById(mid); return m ? m.productId : null; };
  const productName = (id) => { const p = productById(id); return p ? (p.name || p.id) : id; };
  const divOfProduct = (pid) => { const p = productById(pid); if (!p) return null; const d = (P.divisions || []).find((x) => x.id === p.divisionId); return d ? (d.name || d.id) : (p.divisionId || null); };
  const refDivOfModel = (mid) => { const p = productById(productIdOf(mid)); return p ? p.divisionId : null; };
  const refDocOfModel = (mid) => {
    const dv = refDivOfModel(mid);
    if (!dv) return null;
    if (dv === divId) return { doc };
    /* live: NET loaded every R&D division's SPEC document with the portfolio (and a division added
       since, after the next portfolio change); one that is not there failed to load: unreachable */
    if (LIVE) return D.spec['SPEC-' + dv] ? { doc: D.spec['SPEC-' + dv] } : { doc: specBlankDoc(), failed: true };
    if (S.sh_sim && S.sh_sim.refLoading) return null;
    if (S.sh_sim && S.sh_sim.refDown) return { doc: specBlankDoc(), failed: true };
    const k = 'SPEC-' + dv;
    return { doc: D.spec[k] || specBlankDoc() };
  };
  const refAllKpis = (rdoc) => (pk.length ? (rdoc.kpis || []).concat(pk) : (rdoc.kpis || []));
  const refEm = (rdoc) => RD.withPortfolio(P, { REF: rdoc });
  /* one imported sub-product spec, resolved in its own document (L586) */
  const resolveRef = (member) => {
    let name = member.name, dir = 'up', unit = member.unit || '', stackTgt = null, stackVal = null, live = false, pending = false;
    const rd = refDocOfModel(member.refModel);
    if (rd && rd.doc) {
      const kr = (rd.doc.keyResults || []).find((r) => r.id === member.refKr);
      if (kr) {
        name = kr.statement || name;
        const RAK = refAllKpis(rd.doc), REM = refEm(rd.doc);
        const p0 = (rd.doc.kpis || []).find((k) => k.hostType === 'keyResult' && k.hostId === kr.id && RD.linkOf(k, RAK).parent == null);
        if (p0) { dir = RD.kpiDirection(p0, RAK) || 'up'; unit = RD.kpiUnit(p0, RAK) || ''; stackTgt = RD.effTarget(p0, RAK); stackVal = RD.effValue(p0, RAK, REM); }
        else { dir = 'up'; unit = '%'; stackTgt = 100; stackVal = RD.keyResultScore(kr.id, REM); }
      }
      live = true;
    } else if (refDivOfModel(member.refModel) && refDivOfModel(member.refModel) !== divId) pending = true;
    const tgt = member.target != null ? member.target : stackTgt;
    const score = RD.rawScore(stackVal, tgt, dir);
    return { name, dir, unit, stackTgt, stackVal, tgt, score, live, pending, overridden: member.target != null, failed: !!(rd && rd.failed) };
  };
  return {
    today: D.today, nowMs: C.now(), P, ro: !!S.ro, connected,
    divs, div, divId, docKey, doc,
    products, product, productId: product ? product.id : '',
    models, model, modelId,
    em, AK,
    specs: model ? (doc.keyResults || []).filter((r) => r.objectiveId === modelId) : [],
    comps: model ? (doc.stageGates || []).filter((g) => g.objectiveId === modelId && !g.refModel) : [],
    subHosts: model ? (doc.stageGates || []).filter((g) => g.objectiveId === modelId && g.refModel) : [],
    modelById, productById, productIdOf, productName, divOfProduct,
    specName: (id) => { const r = (doc.keyResults || []).find((x) => x.id === id); return r ? (r.statement || r.id) : id; },
    componentName: (id) => { const g = (doc.stageGates || []).find((x) => x.id === id); return g ? (g.name || g.id) : id; },
    refDivOfModel, refDocOfModel, refAllKpis, refEm, resolveRef,
    portfolioWrite: (apply, okMsg) => specPortfolioWrite(C, apply, okMsg)
  };
}

/* ---- simulated broker */
function specBanner(C, text, tone) { C.setState({ sh_banner: text ? { text: String(text), tone: tone || 'info' } : null }); }
/* the live app's persistPortfolio (L442): If-Match PUT, auto-merge on 412.
   live: a plain change; NET saves the portfolio and, on a 412, merges and saves again by itself */
function specPortfolioWrite(C, apply, okMsg) {
  if (LIVE) return C.mutate(apply, { msg: okMsg || 'Saved.' });
  const sim = C.state.sh_sim || {};
  if (!C.state.sh_token) {
    const ok0 = C.mutate(apply, {});
    if (ok0) specBanner(C, (okMsg || 'Saved') + ' (local only — add a broker token in Settings to sync).', 'info');
    return ok0;
  }
  if (sim.portConflict) {
    const ok1 = C.mutate(apply, {});
    if (ok1) {
      C.setState({ sh_sim: Object.assign({}, C.state.sh_sim, { portConflict: false }) });
      C.toast((okMsg || 'Saved.') + ' (merged with a concurrent change)', 'ok');
    }
    return ok1;
  }
  return C.mutate(apply, { msg: okMsg || 'Saved.' });
}
function specSwitchDivision(C, ctx, divId, after) {
  if (!divId) return false;
  if (divId === ctx.divId) { if (after) C.setState(after); return true; }
  const d = ctx.divs.find((x) => x.id === divId);
  if (!d) return false;
  if (LIVE) {
    /* NET loaded this division's document with the others; not there means its load failed (today L503) */
    if (!(C.D.spec || {})['SPEC-' + divId]) {
      specBanner(C, 'Couldn’t load SPEC-' + divId + ' — is its SPEC bin configured on the broker? Load from the broker in Settings to try again.', 'err');
      return false;
    }
    /* today flushes before repointing (flushPersist); NET saves per document, so nothing has to wait */
    if (NET.dirty(C).length) NET.flush(C);
    specLS('rd_division', divId);
    C.setState(Object.assign({ divId, productId: '', modelId: '', sheets: [], menu: '', dlg: null, sspec_reads: {} }, after || {}));
    C.toast('Switched to ' + d.name + '.', 'ok');
    return true;
  }
  if (C.state.sh_sim && C.state.sh_sim.refDown) {
    specBanner(C, 'Couldn’t load SPEC-' + divId + ' (503) — is its SPEC bin configured on the broker?', 'err');
    return false;
  }
  /* save pending edits for this division first (flushPersist), then repoint */
  const save = C.state.save && C.state.save.state === 'saving' ? { save: { state: 'saved', at: C.now() } } : {};
  specLS('rd_division', divId);
  C.setState(Object.assign({ divId, productId: '', modelId: '', sheets: [], menu: '', dlg: null, sspec_reads: {} }, save, after || {}));
  C.toast('Switched to ' + d.name + '.', 'ok');
  return true;
}
/* a teammate's change arriving (polling / conflict): Toru re-measures a metric on this model */
function specTeammateEdit(C, ctx, D) {
  const doc = D.spec[ctx.docKey];
  if (!doc || !ctx.modelId) return '';
  const AK = (D.portfolio.kpis || []).length ? doc.kpis.concat(D.portfolio.kpis) : doc.kpis;
  const em = RD.withPortfolio(D.portfolio, { DOC: doc });
  const cands = doc.kpis.filter((k) => k.objectiveId === ctx.modelId && !k.refModel && RD.effValue(k, AK, em) != null && (doc.kpiUpdates || []).some((u) => u.kpiId === k.id));
  const k = cands[0];
  if (!k) return '';
  const def = RD.definerOf(k, AK);
  const ups = (doc.kpiUpdates || []).filter((u) => u.kpiId === k.id).sort((a, b) => b.timestamp - a.timestamp);
  const last = Number(ups[0].value);
  const tgt = RD.effTarget(k, AK);
  let v = last;
  if (def.targetType === 'binary') v = 1;
  else if (typeof tgt === 'number') v = last + (tgt - last) * 0.25;
  else if (tgt && typeof tgt === 'object') v = last + ((tgt.lo + tgt.hi) / 2 - last) * 0.25;
  v = Number(v.toPrecision(3));
  const ts = Math.max(C.now(), ups[0].timestamp + 1);
  doc.kpiUpdates.push({ id: 'UPD-' + k.id + '-' + ts, kpiId: k.id, value: v, timestamp: ts, note: '' });
  return 'Toru Hayashi posted ' + F.u(v, RD.kpiUnit(k, AK)) + ' on ' + (RD.kpiName(k, AK) || k.id) + '.';
}
function specPoll(C, ctx) {
  if (LIVE) return;   // live: NET polls every 25 s
  /* offline, today's poll fails quietly (L519): nothing arrives until the connection returns */
  if (C.state.sim && C.state.sim.offline) { C.toast('You are offline, so other editors’ changes can’t arrive. The app checks again when the connection returns.', 'info'); return; }
  /* polling (every 25 s): save pending edits, compare versions, adopt the newer document */
  const sv = C.state.save && C.state.save.state === 'saving' ? { save: { state: 'saved', at: C.now() } } : {};
  let what = '';
  C.mutate((D) => { what = specTeammateEdit(C, ctx, D); if (!what) return false; }, { quiet: true, allowRo: true });
  C.setState(Object.assign({ sh_lastPoll: C.now() }, sv));
  if (what) specBanner(C, 'Updated from another editor. ' + what, 'info');
  else C.toast('Checked for changes. Nothing new from other editors.', 'info');
}
function specConflict(C, ctx) {
  if (LIVE) return;   // live: the broker's own 412s, resolved by NET
  const prev = C._specPrev;
  if (C.state.sim && C.state.sim.offline) { C.toast('You are offline, so no save reaches the broker and none can conflict. Restore the connection first.', 'info'); return; }
  if (!prev || prev.key !== ctx.docKey) { C.toast('Make a change first. A conflict happens when your save meets a teammate’s newer save.', 'info'); return; }
  let what = '';
  C.mutate((D) => {
    D.spec[ctx.docKey] = JSON.parse(prev.json);
    specNormalizeDoc(D.spec[ctx.docKey]);
    what = specTeammateEdit(C, ctx, D);
  }, { quiet: true, allowRo: true });
  C._specPrev = null;
  C.setState({ save: { state: 'conflict', at: C.now() }, sheets: [], menu: '', sspec_reads: {} });
  specBanner(C, 'Another editor saved first — reloaded; re-apply your change.' + (what ? ' Their change: ' + what : ''), 'err');
}

/* ---- shell view model */
function APP_SHELL(C, ctx) {
  const S = C.state, D = C.D;
  const set = (p) => C.setState(p);
  const ro = !!S.ro;

  /* sidebar product tree: division -> product -> model (replaces today's three dropdowns) */
  const P0 = D.portfolio;
  const tree = ctx.divs.map((dv, gi) => {
    const prods = (P0.products || []).filter((p) => p.divisionId === dv.id).slice().sort(K.byOrder);
    const sdoc = D.spec['SPEC-' + dv.id] || specBlankDoc();
    const em2 = dv.id === ctx.divId ? ctx.em : RD.withPortfolio(P0, { DOC: sdoc });
    return {
      name: dv.name, cls: gi ? 'grp gap' : 'grp',
      noProducts: !prods.length,
      products: prods.map((p) => {
        const ms = (P0.models || []).filter((m) => m.productId === p.id).slice().sort(K.byOrder);
        const isSel = ctx.product && ctx.product.id === p.id;
        const open = S.sh_open[p.id] != null ? !!S.sh_open[p.id] : true;
        return {
          name: p.name, id: p.id,
          cls: 'nav spc-prod' + (isSel && !ctx.model ? ' on' : ''),
          open,
          chev: 'transform: rotate(' + (open ? 0 : -90) + 'deg)',
          toggleLabel: (open ? 'Collapse ' : 'Expand ') + p.name,
          toggle: () => set({ sh_open: Object.assign({}, C.state.sh_open, { [p.id]: !open }) }),
          pick: () => {
            const first = ms[0];
            specSwitchDivision(C, ctx, dv.id, { productId: p.id, modelId: first ? first.id : '', sheets: [], menu: '', sh_open: Object.assign({}, C.state.sh_open, { [p.id]: true }) });
          },
          noModels: !ms.length,
          models: ms.map((m) => {
            const specsN = (sdoc.keyResults || []).filter((r) => r.objectiveId === m.id).length;
            const sc = RD.objectiveScore(m.id, em2);
            const on = ctx.model && ctx.model.id === m.id;
            return {
              name: m.name,
              cls: 'obj spc-model' + (on ? ' on' : ''),
              cur: on ? 'page' : undefined,
              dotCls: 'dot ' + F.tone(F.band(sc)),
              meta: sc != null ? F.score(sc) : specsN ? 'No score' : 'No specs',
              title: m.name + ': ' + (sc != null ? 'conformance ' + F.score(sc) : specsN ? 'no score yet' : 'no specifications yet'),
              pick: () => specSwitchDivision(C, ctx, dv.id, { productId: p.id, modelId: m.id, sheets: [], menu: '' })
            };
          })
        };
      })
    };
  });

  /* model header, metric strip, signal bars (L898–939) */
  const m = ctx.model;
  let head = null;
  if (m) {
    const em = ctx.em, AK = ctx.AK, doc = ctx.doc;
    const ms = (doc.modelSpec && doc.modelSpec[m.id]) || {};
    const sc = RD.objectiveScore(m.id, em);
    const tone = F.band(sc);
    const specs = ctx.specs;
    const specOn = specs.filter((k) => RD.band(RD.keyResultScore(k.id, em)) === 'on-track').length;
    const comps = ctx.comps;
    const compOn = comps.filter((g) => RD.band(RD.hostScore('component', g.id, em)) === 'on-track').length;
    const modelKpis = (doc.kpis || []).filter((k) => k.objectiveId === m.id && !k.refModel);
    const measured = modelKpis.filter((k) => RD.effValue(k, AK, em) != null).length;
    const pid = m.productId;
    const prodKpis = pid ? AK.filter((k) => k.hostType === 'product' && k.hostId === pid).length : 0;
    const unscored = specs.filter((k) => RD.keyResultScore(k.id, em) == null).length;
    head = {
      name: m.name || m.id, id: m.id,
      productText: 'Product: ' + (pid ? ctx.productName(pid) : 'unassigned'),
      hasApp: !!ms.application, appText: 'Application: ' + (ms.application || ''),
      hasMaturity: !!ms.maturity, maturity: ms.maturity || '',
      hasNotes: !!ms.notes, notes: ms.notes || '',
      canEdit: !ro,
      editDetails: () => C.openSheet('shell.model', {}, { application: ms.application || '', maturity: ms.maturity || '', notes: ms.notes || '' }),
      score: F.score(sc),
      tone: 'st ' + F.tone(tone),
      band: F.bandWord(tone),
      scoreSub: sc == null ? (specs.length ? 'No specification has a score yet' : 'Add a specification to start the conformance score') : 'Spec conformance, the mean of ' + F.plural(specs.length, 'specification') + (unscored ? ' (' + unscored + ' unscored, counted as 0)' : ''),
      barStyle: 'width: ' + (sc == null ? 0 : Math.round(sc)) + '%',
      barCls: 'fill ' + F.tone(tone),
      facts: [
        { label: 'Specifications', value: String(specs.length), sub: specOn + ' on target' },
        { label: 'Components', value: String(comps.length), sub: compOn + ' conformant' },
        { label: 'Metrics measured', value: measured + ' of ' + modelKpis.length, sub: 'have a reading' },
        { label: 'Product family', value: pid ? ctx.productName(pid) : '—', sub: F.plural(prodKpis, 'product KPI') }
      ],
      hasSignals: specs.length > 0,
      signals: specs.map((kr, i) => {
        const s = RD.keyResultScore(kr.id, em);
        const t = F.band(s);
        return {
          label: 'S' + (i + 1), name: kr.statement || kr.id,
          title: 'S' + (i + 1) + ': ' + (kr.statement || kr.id),
          fillStyle: 'width: ' + (s == null ? 0 : Math.round(s)) + '%',
          fillCls: 'fill ' + F.tone(t),
          score: F.score(s), cls: 'st ' + F.tone(t)
        };
      })
    };
  }

  /* main-area empty states (L860–874) */
  let emptyText = '', emptyAct = null, emptyActLabel = '';
  /* Settings opens with an empty token field in live builds: the saved token is never shown */
  const openSettings = () => C.openSheet('shell.settings', {}, { token: LIVE ? '' : S.sh_token || '' });
  /* live: nothing loaded yet (or a failed first load) says what the broker answered */
  const liveEmpty = LIVE && !ctx.connected && !ctx.divs.length ? specLiveEmpty(C) : null;
  if (!m) {
    if (liveEmpty) { emptyText = liveEmpty.text; if (liveEmpty.settings) { emptyAct = openSettings; emptyActLabel = 'Open settings'; } }
    else if (!LIVE && !ctx.connected) { emptyText = 'Add a broker token in Settings to load products and models from the portfolio.'; emptyAct = () => C.openSheet('shell.settings', {}, { token: S.sh_token || '' }); emptyActLabel = 'Open settings'; }
    else if (!ctx.divs.length) emptyText = 'No divisions exist yet — add one in Planning.';
    else if (!ctx.products.length) emptyText = 'No products in this division yet — add products and models in the Planning app, then reload.';
    else emptyText = 'No models in this product yet — add them in the Planning app.';
  }

  const top = C.sheet();
  const kind = top ? top.kind : '';
  const b = S.sh_banner;
  return {
    me: C.meVM(),
    hub: SPEC_HUB,
    tree,
    treeEmpty: !tree.length,
    treeEmptyText: liveEmpty ? liveEmpty.tree : LIVE || ctx.connected ? 'No product divisions yet. Add one in Planning.' : 'Add a broker token in Settings to load products.',
    /* live: the save state and the Save button once something is loaded (before that there is nothing to save) */
    loaded: !LIVE || !!(C.net && C.net.loaded),
    divName: ctx.div ? ctx.div.name : 'Product specification',
    hasProduct: !!ctx.product,
    productName: ctx.product ? ctx.product.name : '',
    hasModelCrumb: !!m,
    modelName: m ? m.name : '',
    hasModel: !!m, noModel: !m,
    head,
    emptyText, hasEmptyAct: !!emptyAct, emptyAct: emptyAct || (() => {}), emptyActLabel,
    roOn: ro,
    canSave: !ro,
    banner: b ? { text: b.text, cls: 'banner spc-banner ' + (b.tone === 'err' ? 't-bad' : 't-info'), dismiss: () => set({ sh_banner: null }) } : null,
    openSettings,
    settings: kind === 'shell.settings' ? specSettingsVM(C, ctx, top) : null,
    modelSheet: kind === 'shell.model' ? specModelSheetVM(C, ctx, top) : null,
    exportSheet: kind === 'shell.export' ? specExportVM(C, ctx) : null,
    importSheet: kind === 'shell.import' ? specImportVM(C, ctx, top) : null
  };
}

/* ---- "Model spec details" sheet (L1796–1818) */
function specModelSheetVM(C, ctx, top) {
  const m = ctx.model;
  if (!m) return null;
  const d = top.d;
  const save = () => {
    const app = String(d.application || '').trim(), mat = String(d.maturity || '').trim(), notes = String(d.notes || '').trim();
    const ok = C.mutate((D) => {
      const doc = D.spec[ctx.docKey];
      if (!doc.modelSpec) doc.modelSpec = {};
      doc.modelSpec[m.id] = { application: app, maturity: mat, notes: notes };
    }, { msg: 'Spec details saved.' });
    if (ok) C.closeSheet();
  };
  const onKey = (e) => { if (!e) return; if (e.key === 'Escape') C.dismissSheet(e); else if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); save(); } };
  return {
    name: m.name || m.id, id: m.id,
    product: m.productId ? ctx.productName(m.productId) : 'unassigned',
    application: d.application, onApplication: C.bindDraft('application'),
    maturity: d.maturity, onMaturity: C.bindDraft('maturity'),
    suggestions: SPEC_MATURITY.map((x) => ({ label: x, on: String(d.maturity || '').trim().toLowerCase() === x.toLowerCase() ? 'true' : 'false', pick: () => C.setDraft({ maturity: x }) })),
    notes: d.notes, onNotes: C.bindDraft('notes'),
    save, onKey,
    cancel: () => C.closeSheet()
  };
}

/* ---- export / import JSON (L521–532) */
/* what is wrong with a parsed import, or '' when it is a usable specification document.
   Today any parsable JSON is taken and a malformed one breaks the page; Calm refuses it first. */
function specImportProblem(obj) {
  const isRec = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  if (!isRec(obj)) return 'Import failed — not a valid document.';
  const lists = ['keyResults', 'stageGates', 'kpis', 'kpiUpdates'];
  for (let i = 0; i < lists.length; i++) {
    const k = lists[i];
    if (obj[k] == null) continue;
    if (!Array.isArray(obj[k]) || !obj[k].every(isRec)) return 'Import failed — not a valid document. “' + k + '” must be a list of records.';
  }
  if (obj.modelSpec != null && (!isRec(obj.modelSpec) || !Object.keys(obj.modelSpec).every((m) => isRec(obj.modelSpec[m])))) return 'Import failed — not a valid document. “modelSpec” must map model ids to their spec details.';
  return '';
}
function specExportVM(C, ctx) {
  const json = JSON.stringify(ctx.doc, null, 2);
  const n = (k) => (ctx.doc[k] || []).length;
  return {
    title: 'Export JSON',
    sub: 'product-spec.json, the ' + (ctx.div ? ctx.div.name : '') + ' specification document',
    counts: F.plural(n('keyResults'), 'specification') + ', ' + F.plural(n('stageGates'), 'component or sub-product', 'components or sub-products') + ', ' + F.plural(n('kpis'), 'metric') + ', ' + F.plural(n('kpiUpdates'), 'reading') + ', across every model in the division.',
    json,
    copy: () => {
      try {
        const p = window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText ? window.navigator.clipboard.writeText(json) : null;
        if (p && p.then) p.then(() => C.toast('Copied product-spec.json to the clipboard.', 'ok'), () => C.toast('Copy didn’t work here. Select the text and copy it instead.', 'err'));
        else C.toast('Copy didn’t work here. Select the text and copy it instead.', 'err');
      } catch (e) { C.toast('Copy didn’t work here. Select the text and copy it instead.', 'err'); }
    },
    close: () => C.closeSheet()
  };
}
function specImportVM(C, ctx, top) {
  const d = top.d;
  const run = () => {
    if (!C.guard()) return;
    let obj;
    try { obj = JSON.parse(String(d.text || '')); } catch (e) { C.sheetErr('Import failed — not a valid document.'); return; }
    const problem = specImportProblem(obj);
    if (problem) { C.sheetErr(problem); return; }
    const doc = ctx.doc;
    const n = (k) => (doc[k] || []).length;
    const inN = (k) => (Array.isArray(obj[k]) ? obj[k].length : 0);
    C.confirm({
      title: 'Replace the ' + (ctx.div ? ctx.div.name : '') + ' specification document?',
      body: 'Importing replaces every model’s specifications, components, metrics and readings in ' + (ctx.div ? ctx.div.name : 'this division') + ' (now ' +
        F.plural(n('keyResults'), 'specification') + ', ' + F.plural(n('kpis'), 'metric') + ' and ' + F.plural(n('kpiUpdates'), 'reading') + '; the file has ' +
        F.plural(inN('keyResults'), 'specification') + ', ' + F.plural(inN('kpis'), 'metric') + ' and ' + F.plural(inN('kpiUpdates'), 'reading') + '). The broker copy is overwritten when it saves.',
      ok: 'Import and replace', danger: true,
      onOk: () => {
        /* live: the repairs NET runs on load (REPAIR.spec, the same clean-up); NET then saves the document */
        const ok = C.mutate((D) => {
          const next = Object.assign(specBlankDoc(), K.clone(obj));
          if (LIVE) REPAIR.spec(next); else specNormalizeDoc(next);
          D.spec[ctx.docKey] = next;
        }, { msg: 'Imported.' });
        if (ok) C.closeAllSheets();
      }
    });
  };
  return {
    title: 'Import JSON',
    sub: 'Replaces the ' + (ctx.div ? ctx.div.name : '') + ' specification document (every model)',
    text: d.text || '', onText: C.bindDraft('text'),
    loadCurrent: () => C.setDraft({ text: JSON.stringify(ctx.doc, null, 2) }),
    run,
    close: () => C.closeSheet()
  };
}

/* ---- settings sheet (L268–287) plus the prototype's simulations (sample) or the broker (live) */
function specSettingsVM(C, ctx, top) {
  const S = C.state, D = C.D;
  const set = (p) => C.setState(p);
  const sim = S.sh_sim || {};
  const allDivs = specAllDivs(D);
  /* product families: read-only (L1821) */
  const fams = ctx.products.map((p) => {
    const mc = (ctx.P.models || []).filter((m) => m.productId === p.id).length;
    const kc = ctx.AK.filter((k) => k.hostType === 'product' && k.hostId === p.id).length;
    return { name: p.name, id: p.id, meta: F.plural(mc, 'model') + ', ' + F.plural(kc, 'metric') };
  });
  const L = S.sh_link || {};
  const lp = [];
  if (L.division) lp.push('division=' + encodeURIComponent(L.division));
  if (L.product) lp.push('product=' + encodeURIComponent(L.product));
  if (L.token) lp.push('token=' + encodeURIComponent(L.token));
  if (L.readonly) lp.push('readonly');
  const rel = 'Spec-A.dc.html' + (lp.length ? '?' + lp.join('&') : '');
  /* live: the full address of this page with these parameters, to copy or to open */
  const url = LIVE ? specAbsUrl(rel) : rel;
  const linkProducts = (D.portfolio.products || []).filter((p) => !L.division || p.divisionId === L.division);
  const setLink = (k) => (e) => set({ sh_link: Object.assign({}, C.state.sh_link, { [k]: e && e.target ? (k === 'readonly' ? !!e.target.checked : e.target.value) : '' }) });
  /* both builds: appearance, product families, the document, the sign-in, read-only, links with parameters */
  const vm = {
    themes: [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']].map((x) => ({
      label: x[1], on: S.theme === x[0] ? 'true' : 'false',
      pick: () => { set({ theme: x[0] }); specLS('rd_theme', x[0]); }
    })),
    connected: ctx.connected,
    hasFams: fams.length > 0, fams,
    /* live: a reload that failed keeps the last loaded portfolio on screen */
    famEmpty: (LIVE ? ctx.divs.length > 0 : ctx.connected) ? 'No products in this division yet — add them in the Planning app.' : LIVE ? 'Nothing is loaded from the broker yet.' : 'Connect a broker token to load products.',
    divName: ctx.div ? ctx.div.name : '',
    hasDoc: !!ctx.docKey,
    exportJson: () => C.pushSheet('shell.export', {}, {}),
    importJson: () => { if (!C.guard()) return; C.pushSheet('shell.import', {}, { text: '' }); },
    hub: C.viewerVM(),
    roOn: !!S.ro,
    toggleRo: (e) => set({ ro: !!(e && e.target ? e.target.checked : !S.ro) }),
    /* URL parameters */
    linkDivs: [{ v: '', label: 'Not set (last session)' }].concat(allDivs.map((x) => ({ v: x.id, label: x.name + (RD.divisionKind(x) === 'biz' ? ' (business)' : '') }))),
    linkDiv: L.division || '', onLinkDiv: (e) => set({ sh_link: Object.assign({}, C.state.sh_link, { division: e && e.target ? e.target.value : '', product: '' }) }),
    linkProds: [{ v: '', label: 'Not set (first product)' }].concat(linkProducts.map((p) => ({ v: p.id, label: p.name }))),
    linkProd: L.product || '', onLinkProd: setLink('product'),
    linkToken: L.token || '', onLinkToken: setLink('token'),
    linkRo: !!L.readonly, onLinkRo: setLink('readonly'),
    url,
    copyUrl: () => {
      try {
        const p = window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText ? window.navigator.clipboard.writeText(url) : null;
        if (p && p.then) p.then(() => C.toast('Link copied.', 'ok'), () => C.toast('Copy didn’t work here. Select the link and copy it instead.', 'err'));
        else C.toast('Copy didn’t work here. Select the link and copy it instead.', 'err');
      } catch (e) { C.toast('Copy didn’t work here. Select the link and copy it instead.', 'err'); }
    }
  };
  if (LIVE) return Object.assign(vm, specSettingsLiveVM(C, ctx, top, url));
  const openLink = () => {
    /* a fresh load with these parameters (L330–334, L476–480, L619–623) */
    const L2 = C.state.sh_link || {};
    const token = L2.token ? String(L2.token).trim() : C.state.sh_token;
    const divsRd = specDivs(D);
    let dv = L2.division || specLS('rd_division') || (divsRd[0] && divsRd[0].id) || '';
    const row = allDivs.find((x) => x.id === dv);
    let note = '';
    if (row && RD.divisionKind(row) === 'biz') { dv = divsRd[0] ? divsRd[0].id : ''; note = row.name + ' is a business division with no products, so ' + (divsRd[0] ? divsRd[0].name : 'the first product division') + ' opened instead.'; }
    if (!allDivs.some((x) => x.id === dv)) dv = divsRd[0] ? divsRd[0].id : '';
    const prod = (D.portfolio.products || []).find((p) => p.id === L2.product && p.divisionId === dv);
    /* a load with a token stores the resolved division (L480); without one the app works locally and stores nothing */
    if (token && dv) specLS('rd_division', dv);
    C.setState({
      sh_token: token, divId: dv, productId: prod ? prod.id : '', modelId: '', ro: !!L2.readonly,
      sheets: [], menu: '', dlg: null, sh_banner: null,
      sh_link: Object.assign({}, L2, { token: '' })
    });
    if (note) C.toast(note, 'info');
    C.toast(token ? 'Loaded SPEC-' + dv + '.' : 'No broker token — working locally. Add one in Settings to sync.', token ? 'ok' : 'info');
    if (!token) specBanner(C, 'No broker token — working locally. Add one in Settings to sync.', 'info');
  };
  const saveToken = () => {
    /* the live app trims the value and stores it; an empty value means working locally (L1835) */
    const t = String((C.draft() || {}).token || '').trim();
    C.setDraft({ token: t });
    /* the token is saved: closing Settings now must not ask to discard it */
    C.setSheetData({ d0: JSON.stringify(C.draft()) });
    C.setState({ sh_token: t });
    C.toast('Saved.', 'ok');
    /* the live app reloads everything (loadAll) */
    if (t) {
      const dvs = specDivs(D);
      const dv = dvs.find((x) => x.id === C.state.divId) || dvs[0];
      specBanner(C, null);
      C.toast(dv ? 'Loaded SPEC-' + dv.id + '.' : 'No divisions exist yet — add one in Planning.', dv ? 'ok' : 'err');
    }
    else specBanner(C, 'No broker token — working locally. Add one in Settings to sync.', 'info');
  };
  return Object.assign(vm, {
    tokenState: ctx.connected ? 'Connected to the broker with a token (simulated). The division document saves to SPEC-' + (ctx.divId || '…') + '.' : 'No token: this document is kept locally in this browser, and no products load.',
    tokenTone: ctx.connected ? 'st t-ok' : 'st t-warn',
    tokenDraft: (top && top.d && top.d.token) || '',
    onToken: C.bindDraft('token'),
    onTokenKey: (e) => { if (e && e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); saveToken(); } },
    saveToken,
    openLink,
    /* sync simulations */
    lastPoll: 'Last checked ' + F.ago(S.sh_lastPoll, C.now()) + '.',
    poll: () => specPoll(C, ctx),
    conflict: () => specConflict(C, ctx),
    canConflict: !S.ro && ctx.connected && !!ctx.model,
    offline: !!(S.sim && S.sim.offline),
    toggleOffline: (e) => {
      const on = !!(e && e.target ? e.target.checked : !(S.sim && S.sim.offline));
      const was = C.state.save || {};
      C.setState({ sim: Object.assign({}, C.state.sim, { offline: on }) });
      if (on) specBanner(C, 'Save failed (network unreachable). Your changes stay in this browser and save when the connection returns.', 'err');
      else { specBanner(C, null); if (was.pending || was.state === 'offline') C.markDirty('Saved.'); }
    },
    refDown: !!sim.refDown,
    toggleRefDown: (e) => set({ sh_sim: Object.assign({}, C.state.sh_sim, { refDown: !!(e && e.target ? e.target.checked : !sim.refDown) }) }),
    slowLoad: () => {
      set({ sh_sim: Object.assign({}, C.state.sh_sim, { refLoading: true }) });
      C.later(() => C.setState({ sh_sim: Object.assign({}, C.state.sh_sim, { refLoading: false }) }), 2500);
    },
    loading: !!sim.refLoading,
    portConflict: !!sim.portConflict,
    togglePortConflict: (e) => set({ sh_sim: Object.assign({}, C.state.sh_sim, { portConflict: !!(e && e.target ? e.target.checked : !sim.portConflict) }) }),
    reset: () => C.confirm({ title: 'Restore the sample data?', body: 'Every change you made in this prototype is discarded.', ok: 'Restore', danger: true, onOk: () => C.resetData() })
  });
}

/* ============================================================================
   Live builds (LIVE.md). NET calls these; the sample build never does.
   ========================================================================== */

/* live Settings, Broker section: what NET reports (NET.info), the token (saved with NET.saveToken; the field
   starts empty and the saved token is never shown) and "Load from the broker" (NET.reload) */
function specSettingsLiveVM(C, ctx, top, url) {
  const I = NET.info(C);
  const st = C.state.sh_live || {};
  const nDocs = (I.docs || []).filter((id) => id !== 'portfolio').length;
  let state = '', tone = 't-info';
  if (!I.hasToken) { state = 'No broker token in this browser, so nothing is loaded.'; tone = 't-warn'; }
  else if (I.phase === 'badtoken') { state = 'The broker didn’t accept the saved token. Paste the right one.'; tone = 't-bad'; }
  else if (I.phase === 'outdated') { state = 'This page is out of date, so the broker turns its saves away. Reload the page.'; tone = 't-bad'; }
  else if (!I.phase || I.phase === 'loading') { state = 'Loading from the broker…'; tone = 't-info'; }
  else if (I.loaded) {
    state = 'Loaded ' + F.ago(I.lastLoad, C.now()) + ': the portfolio and ' + F.plural(nDocs, 'specification document') + '.';
    if (I.offline) {
      state += ' Offline: ' + (I.pending ? (I.pending === 1 ? '1 document has' : I.pending + ' documents have') + ' unsaved changes, kept here until the connection returns.' : 'changes stay here and save when the connection returns.');
      tone = 't-warn';
    } else if (I.pending) { state += ' ' + (I.pending === 1 ? '1 document has' : I.pending + ' documents have') + ' changes still saving.'; tone = 't-info'; }
    else { state += ' Everything is saved.'; tone = 't-ok'; }
  }
  else if (I.phase === 'noportfolio') { state = 'The broker has no portfolio yet. Create it in the Planning app first.'; tone = 't-warn'; }
  else if (I.phase === 'offline') { state = 'Couldn’t reach the broker. This page keeps trying; Load from the broker tries now.'; tone = 't-bad'; }
  else { state = 'The last load failed (' + (st.status || 'error') + ').' + (st.status >= 500 ? ' This page keeps trying.' : ' Check the token.'); tone = 't-bad'; }
  /* offline with unsaved changes, a reload would fail and leave them behind: they save first, when the connection returns */
  const heldBack = () => {
    const J = NET.info(C);
    if (!(J.offline && J.pending)) return false;
    C.toast('You are offline with unsaved changes. They save when the connection returns; load again after that.', 'info');
    return true;
  };
  const saveToken = () => {
    const t = String((C.draft() || {}).token || '').trim();
    /* the field never shows the saved token, so an empty one must not wipe it */
    if (!t) { C.toast('Paste the broker token first. The token saved in this browser stays as it is.', 'info'); return; }
    if (heldBack()) return;
    C.setDraft({ token: '' });
    /* the token is saved: closing Settings now must not ask to discard it */
    C.setSheetData({ d0: JSON.stringify(C.draft()) });
    C.toast('Token saved.', 'ok');
    /* stored in rd_broker_token, then everything reloads (today: loadAll) */
    NET.saveToken(C, t);
  };
  return {
    brokerState: state, brokerTone: 'st ' + tone,
    tokenDraft: (top && top.d && top.d.token) || '',
    tokenPh: I.hasToken ? 'Paste a new token to replace the saved one' : 'Paste the token',
    tokenHint: I.hasToken
      ? 'A token is saved in this browser and is never shown here. Saving a new one reloads everything.'
      : 'Saving the token loads the portfolio and every product division’s specification document.',
    onToken: C.bindDraft('token'),
    onTokenKey: (e) => { if (e && e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); saveToken(); } },
    saveToken,
    reload: () => { if (!heldBack()) NET.reload(C); },
    /* a fresh load of this page with these parameters */
    openLink: () => {
      try { window.location.assign(url); } catch (e) { C.toast('This page couldn’t open the link. Copy it instead.', 'err'); }
    }
  };
}

/* live: the main area and the tree while nothing is loaded: what the broker answered, and whether Settings helps */
function specLiveEmpty(C) {
  const st = C.state.sh_live || {};
  const ph = st.phase || 'loading';
  const none = 'Nothing is loaded from the broker.';
  if (ph === 'notoken') return { text: 'No broker token in this browser yet. Open this app from the Hub, or add the token in Settings.', tree: 'Open this app from the Hub to load products.', settings: true };
  if (ph === 'badtoken') return { text: 'The broker didn’t accept the token. Check the token in Settings.', tree: none, settings: true };
  if (ph === 'noportfolio') return { text: 'No portfolio on the broker yet — create it in the Planning app first.', tree: none, settings: false };
  if (ph === 'fail') return { text: st.status >= 500 ? 'Load failed (' + st.status + '). This page keeps trying.' : 'Load failed (' + (st.status || 'error') + '). Check the token in Settings.', tree: none, settings: true };
  if (ph === 'offline') return { text: 'Couldn’t reach the broker. Check your connection; this page keeps trying.', tree: none, settings: true };
  if (ph === 'outdated') return { text: 'This page is out of date. Reload it to keep working.', tree: none, settings: false };
  return { text: 'Loading products and models from the broker…', tree: 'Loading products…', settings: false };
}

/* what NET loads and may save: every R&D division's SPEC document after the portfolio (the tree scores every
   division's models; sub-products and component owners resolve in other divisions' documents, which today
   fetched on demand). Today's app writes its SPEC document (persist) and the portfolio (persistPortfolio:
   product KPIs, their readings, composition edges), never an EXEC or BIZ document. */
function APP_LIVE_PLAN(C) {
  return {
    roster: true, prefs: false, autoPass: false,
    docs: (P) => specDivs({ portfolio: P }).map((d) => 'SPEC-' + d.id),
    writable: (id) => id === 'portfolio' || /^SPEC-/.test(String(id || ''))
  };
}

/* after every successful load; url = the page's parameters (lower-case keys) on the first successful load,
   null after that.
   Today's rules (L330–352, L470–486, L617–631): ?division, where a business division (no products) or one
   that does not exist opens the first product division; ?product only inside that division; no model
   parameter (the product's first model). Without parameters: the other apps' hand-off (a model), else the
   division of the last session (rd_division), else the first division, product and model. ?readonly and
   ?token are NET's. Every load stores the resolved division in rd_division, as today's loadAll did.
   After a reload the selection stays while it still exists. */
function APP_LIVE_READY(C, url) {
  const D = C.D, S = C.state, P = D.portfolio || {};
  const all = specAllDivs(D), divs = specDivs(D);
  const first = !S.sh_picked;
  /* the page's parameters apply once, on the first load that works (a try without a token or with a wrong one
     doesn't count); sh_picked keeps that true even with a NET that passed them only to its very first try */
  const q = url || (first ? (C.net && C.net.url) || {} : null);
  const firstDiv = divs[0] || null;
  const prodsOf = (dv) => (P.products || []).filter((p) => p.divisionId === dv);
  const modelsOf = (pid) => (P.models || []).filter((m) => m.productId === pid);
  let note = '';
  const resolve = (id, fromUrl) => {
    const row = all.find((x) => x.id === id);
    if (row && RD.divisionKind(row) !== 'biz') return row.id;
    if (row && fromUrl) note = row.name + ' is a business division with no products, so ' + (firstDiv ? firstDiv.name : 'the first product division') + ' opened instead.';
    return firstDiv ? firstDiv.id : '';
  };
  let divId = '', productId = '', modelId = '';
  if (q) {
    const h = C.takeHandoff(APP);   // single use: taken on the first load even when the address decides
    const hm = h && h.model ? (P.models || []).find((m) => m.id === h.model) : null;
    const hp = hm ? (P.products || []).find((p) => p.id === hm.productId) : null;
    if (q.division || q.product) {
      divId = q.division ? resolve(q.division, true) : resolve(specLS('rd_division') || '', false);
      const p = prodsOf(divId).find((x) => x.id === q.product);   // a product outside the division is ignored
      productId = p ? p.id : '';
    } else if (hp && divs.some((x) => x.id === hp.divisionId)) {
      divId = hp.divisionId; productId = hp.id; modelId = hm.id;
    } else divId = resolve(specLS('rd_division') || '', false);
  } else {
    divId = divs.some((x) => x.id === S.divId) ? S.divId : resolve('', false);
    if (divId === S.divId && prodsOf(divId).some((p) => p.id === S.productId)) {
      productId = S.productId;
      if (modelsOf(productId).some((m) => m.id === S.modelId)) modelId = S.modelId;
    }
  }
  const patch = { divId: divId, productId: productId, modelId: modelId };
  if (first) {
    patch.sh_picked = true;
    patch.sh_link = Object.assign({}, S.sh_link, { division: (S.sh_link && S.sh_link.division) || divId });
  } else if (divId !== S.divId) Object.assign(patch, { sheets: [], menu: '', dlg: null, sspec_reads: {} });   // the division went away
  C.setState(patch);
  if (divId) specLS('rd_division', divId);
  if (note) C.toast(note, 'info');
}

/* the load states NET reports, in the banner (today's message bar), with today's wording where it is plain */
function APP_LIVE_STATUS(C, s) {
  const ph = s && s.phase, code = s && s.status;
  C.setState({ sh_live: { phase: ph, status: code || null } });
  /* a reload says so above the page it is about to replace; a first load says it in the page itself */
  if (ph === 'loading') { specBanner(C, specDivs(C.D).length ? 'Loading from the broker…' : null, 'info'); return; }
  if (ph === 'ok') {
    specBanner(C, null);
    /* today: "Loaded SPEC-DIV-EL." after every load, or "No divisions exist yet — add one in Planning." */
    const dv = specDivs(C.D).find((d) => d.id === C.state.divId);
    C.toast(dv ? 'Loaded SPEC-' + dv.id + '.' : 'No divisions exist yet — add one in Planning.', dv ? 'ok' : 'err');
    return;
  }
  const M = {
    notoken: ['No broker token in this browser yet. Open this app from the Hub, or add the token in Settings.', 'info'],
    badtoken: ['The broker didn’t accept the token. Check the token in Settings.', 'err'],
    noportfolio: ['No portfolio on the broker yet — create it in the Planning app first.', 'err'],
    /* NET tries a load again by itself after a broker error (5xx) or a dropped connection */
    fail: [code >= 500 ? 'Load failed (' + code + '). This page keeps trying.' : 'Load failed (' + (code || 'error') + '). Check the token in Settings.', 'err'],
    offline: ['Load failed (network unreachable). Check your connection; this page keeps trying.', 'err'],
    outdated: ['This page is out of date, so the broker turned its save away. Reload the page to keep working.', 'err']
  }[ph];
  if (M) specBanner(C, M[0], M[1]);
}

/* other editors (NET): a merged save is a toast; a reload that dropped your change (412) and an update that
   arrived stay in the banner until dismissed, as today's message bar kept them */
function APP_LIVE_NOTICE(C, tone, text) {
  if (tone === 'ok') { C.toast(text, 'ok'); return; }
  specBanner(C, text, tone === 'bad' ? 'err' : 'info');
}
