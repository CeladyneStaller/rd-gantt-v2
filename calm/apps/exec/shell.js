/* ============================================================================
   Execution / Sales shell (one source, APP = 'exec' | 'sales').
   Owns: selection (division, filters, objective), the context every module
   reads (ctx), the sidebar, the top bar (breadcrumb, search, save), the
   objective head (title, owners, quarter strip, score and pace, facts,
   End objective / Reopen), the tabs, the Overview's layout (the review table
   from mods/review, then Latest readings, Current step and Initiative metrics
   side by side), the Settings sheet (appearance, broker, access, links, sync,
   Hub sign-in, Sales maintenance, sample data), the "Open a link" sheet and
   the End objective sheet.

   ctx (read-only for modules; recomputed every render):
     app            'exec' | 'sales'
     kind           'rd' for Execution, 'biz' for Sales (which divisions this app lists)
     today, nowMs   fixed sample "today" (day number) and the simulated clock
     P              the portfolio document (D.portfolio)
     divs           this app's divisions, unit order then division order
     div, divId     the selected division (in All divisions, the division of the objective on screen)
     docKey, doc    'EXEC-DIV-EL' / 'BIZ-DIV-BD' and that document (always exists)
     em             RD.withPortfolio(P, { [divId]: doc }) — the exact map the live app hands the engine
     spec           D.spec (SPEC-<div> documents, link targets)
     allObjs        every objective in the division (portfolio records, plan order)
     all            Sales' All divisions is on: the sidebar lists every business division's objectives
     sideObjs       what the sidebar lists before the filters: allObjs, or in All divisions every business
                    division's objectives (the picker's order)
     objs           sideObjs after the quarter / product / owner filters: the sidebar's list
     obj, objId     the selected objective (or null / '')
     end            RD.objectiveEndState(doc.objectiveState, objId) or null
     ended          !!end
     ro             read-only preview is on
     tab            current tab id (on a view page, the view)
     view           '' in the whole app; on a view page (?view=) the one view it shows: overview | krs | gates | kanban
   Added by the shell (new fields only):
     loaded         false while a simulated load has failed (Settings > Broker); allObjs, objs and obj are then empty
     unit           the selected division's unit record, or null
     f              the effective filters { quarter, product, owner } ('' = all; owner is a lower-case email)
     casc()         RD.cascade(P, em, today) for this render (memoised; call it while building a view model,
                    not from a handler that has just changed data)
     hub            the simulated Hub sign-in is present (C.state.sim.hub): Done-column prefs follow the person
     offline        the simulated connection is down (C.state.sim.offline)

   Services the shell provides:
     MODS.<mod>.search(C, ctx, q) -> [{ label, sub, go }]   header search. Results are grouped under
         MODS.<mod>.searchLabel (or SHELL_SEARCH_LABELS[mod]) after the shell's own Objectives group;
         the query is cleared before go() runs; a module whose search throws is skipped.
     Escape inside a sheet closes the top sheet; an input that handles Escape itself calls
         e.preventDefault(). Sheets do not close on a backdrop click (today's rule: no click-off).
     GATES.openRevise(C, ctx) is called by "Build revised plan" / "Revise" when the gates module defines it.
     C.MODS         the module registry (read only; the shell's scenario test uses it to add a search provider)
   Shell UI state keys: divId, divAll (Sales' All divisions), objId, fQuarter, fProduct, fOwner, tab, view and
   sh_* (banner, load, token, tokenDraft, recover, team, vlRo: "Link to this view" set to Read-only,
   viewMissing: a view link's objective that isn't here). C.state.sim.offline / sim.hub are the simulated
   connection and Hub sign-in.

   Sales' All divisions (decided October 16): the first choice in Sales' division picker, and where Sales
   opens. The sidebar lists every business division's objectives under the division's name (unit order, then
   division order), with quarter subheadings while every quarter shows; a division with nothing listed says
   so. The filters work across them all. The objective on screen decides the division the rest of the page
   works in (its document, the breadcrumb, the hand-off to Planning). Picking a division lists that one alone;
   so does a link with ?division= or a hand-off naming only a division. Sales remembers no division
   (rd_division is Execution's and Product spec's), so it opens on All divisions every time. In All divisions,
   Settings › Maintenance scans every business division and moves each objective's stranded data to the
   division it belongs to now. A view page shows one objective, so it is never in All divisions.

   Views by direct link (decided October 15; the "views by direct link" canvas): ?objective=…&view=overview |
   krs | gates | kanban opens one objective's view on a page of its own, with no sidebar or tabs. Since October 21
   (the canvas's "Round 2, head and panels") every view opens with the top label, the objective head and the
   score and pace panel. The top label is the app's top bar for that page: app / unit / division / quarter /
   view, then the save state (or Read-only) and "Open in Execution / Sales" (the whole app on that tab, ?tab=,
   in a new browser tab). It replaced the bottom right corner. The head shows owners as plain names; End
   objective and Reopen stay on the Overview view. The panel's facts follow the view (shellHeadVM): Overview
   keeps the app's five; Key results, Stage-gates and Kanban have their own (shellKrFacts, shellGateFacts,
   shellKanbanFacts). The schedule note shows on Overview and Stage-gates. Without ?readonly the page edits and
   saves like the app; with it, view only. Links inside a view open a new browser tab (shellOpenTab): a review row its own view with
   the item highlighted (?item=), Risks rows and Current step the app's tab. A view link names its objective;
   one that isn't here shows a message, never another objective. "Link to this view" beside the tabs (the four
   tabs with a view) and Settings › Open a link (?view=) make the links. A live view page names the view and
   objective in the browser tab's title and leaves the remembered division alone.

   Live builds (LIVE, LIVE.md): the kit's NET loads and saves through the broker, so nothing here simulates
   it. APP_LIVE_PLAN lists the documents (both apps: EXEC-<div> of every R&D division, BIZ-<div> of every
   business division and SPEC-<div> of every R&D division, so a pulled KPI reaches any objective; Execution
   writes EXEC-* and the portfolio, Sales BIZ-* and the portfolio). APP_INIT picks nothing (C.D is empty until the first load);
   APP_LIVE_READY applies the page's parameters (or the hand-off, or the remembered division) once the first
   load succeeds and keeps the selection on later loads; APP_LIVE_STATUS shows the load states in sh_load /
   sh_banner (load banners carry `load: true`, so a successful load clears only those); APP_LIVE_NOTICE shows
   other editors' changes and save conflicts in the banner. Settings keeps theme, read-only preview and links
   and replaces the simulations with the real broker token, "Load from the broker" and NET.info; "Open this
   link" navigates; Sales' recovery writes the objective's division's document first, then the source.
   ========================================================================== */

const SHELL_TABS = [
  ['overview', 'Overview'],
  ['krs', 'Key results'],
  ['gates', 'Stage-gates'],
  ['kanban', 'Kanban'],            // its own tab since October 15 (it was a view of Stage-gates, doc.gateMode)
  ['risks', 'Risks']
  /* no Tasks tab since October 15: the Kanban covers that work. Stored tasks are still kept, moved with
     their objective and counted by the engine's schedule forecast, but nothing shows or edits them. */
].concat(APP === 'sales' ? [] : [['exp', 'Experiments']]);
/* no Experiments tab in Sales since November 3: its board leaves out the current step and logic tree modules
   (apps/sales/app.json), so its Overview has no Current step card and its search finds no logic trees. A link
   or hand-off naming the tab opens the Overview. Stored logic trees are kept and move with their objective,
   and a pulled KPI still reads them. */
/* Views by direct link (decided October 15): ?objective=…&view=overview|krs|gates|kanban opens one objective's
   view on its own, with no sidebar or tabs. Every view (October 21) has the top label, the objective head
   (title, owners, quarter strip, score and pace, the view's facts), then its tab's contents. ?readonly makes it
   view only; without it the view edits and saves like the app. ?item= highlights one item in the view. */
const SHELL_VIEWS = [
  ['overview', 'Overview'],
  ['krs', 'Key results'],
  ['gates', 'Stage-gates'],
  ['kanban', 'Kanban']
];
const SHELL_PAGES_HOST = 'celadynestaller.github.io/rd-gantt-v2/';
const SHELL_SEARCH_LABELS = { kr: 'Key results', kpi: 'KPIs', gates: 'Stage-gates', kb: 'Kanban boards', fmea: 'Risks', step: 'Current step', etb: 'Experiments', initm: 'Initiative metrics' };
const SHELL_SLIP_ALARM = 10;          // CATCHUP_SLIP_THRESHOLD in the live apps: slip (days) that trips the schedule alarm
const SHELL_HUB_URL = 'https://celadynestaller.github.io/CeladyneHQ/';
/* today's window.__RD_BUILD marker ("2026-09-14 batches+multitree"); a board may not set window globals,
   so Settings names the build instead */
const SHELL_BUILD = '2026-10-13 calm-parity';

/* ------------------------------------------------------------ small helpers */
function shellKind() { return APP === 'sales' ? 'biz' : 'rd'; }
function shellKindWord() { return APP === 'sales' ? 'business' : 'R&D'; }
function shellDocKey(divId) { return (APP === 'sales' ? 'BIZ-' : 'EXEC-') + divId; }
function shellBlankDoc() {
  return { keyResults: [], kpis: [], kpiUpdates: [], stageGateSets: [], stageGates: [], stageGateEdges: [], tasks: [], boards: [], risks: [], planVersions: [], catchupPlans: [], objectiveState: [], gateMode: {}, chainGatesByDate: {}, etbTrees: {} };
}
function shellNoDivsMsg() { return APP === 'sales' ? 'No business (kind=biz) divisions yet — add one in the Planning app.' : 'No R&D (kind=rd) divisions yet — add one in the Planning app.'; }
function shellViewOk(v) { return SHELL_VIEWS.some((x) => x[0] === v); }
function shellViewLabel(v) { const x = SHELL_VIEWS.find((y) => y[0] === v); return x ? x[1] : ''; }
function shellTabLabel(t) { const x = SHELL_TABS.find((y) => y[0] === t); return x ? x[1] : ''; }
function shellAppFile() { return APP === 'sales' ? 'sales_app.html' : 'execution_app.html'; }
function shellTabOk(t) { return SHELL_TABS.some((x) => x[0] === t); }
/* the page's parameters, lower-case keys (live builds; NET reads the same) */
function shellPageParams() {
  const out = {};
  try { new URLSearchParams((window.location && window.location.search) || '').forEach((v, k) => { out[String(k).toLowerCase()] = v; }); } catch (e) { /* no address */ }
  return out;
}
/* a link's whole address: live, beside this page; on the canvas, the address the apps are served from */
function shellAbsUrl(rel) {
  if (LIVE) { try { return new URL(rel, window.location.href).href; } catch (e) { return rel; } }
  return 'https://' + SHELL_PAGES_HOST + rel;
}
function shellVal(e) { return e && e.target && e.target.value != null ? String(e.target.value) : ''; }
function shellChecked(e, dflt) { return e && e.target && typeof e.target.checked === 'boolean' ? e.target.checked : !!dflt; }
/* browser storage, like today's rd_theme / rd_division keys; silently does nothing when blocked */
function shellStore(key, val) {
  try {
    const ls = window.localStorage;
    if (!ls) return null;
    if (val === undefined) return ls.getItem(key);
    if (val === null) ls.removeItem(key); else ls.setItem(key, String(val));
  } catch (e) { /* storage blocked: the choice lasts for this visit only */ }
  return null;
}
function shellDivs(D) {
  const P = D.portfolio;
  const unitOrder = {};
  (P.units || []).forEach((u, i) => { unitOrder[u.id] = u.order == null ? i : u.order; });
  return (P.divisions || []).filter((d) => RD.divisionKind(d) === shellKind()).slice().sort((a, b) => {
    const ua = a.unitId && unitOrder[a.unitId] != null ? unitOrder[a.unitId] : 1e6;
    const ub = b.unitId && unitOrder[b.unitId] != null ? unitOrder[b.unitId] : 1e6;
    return ua - ub || K.byOrder(a, b);
  });
}
/* Quarter parsing. Today's regex /Q([1-4])\D*(\d{2,4})/ only reads "Q4 2026"-style labels, so the suite's
   own stored form "2026Q4" never matched and the week strip never showed. This reads both (intended). */
function shellParseQ(q) {
  if (!q) return null;
  const s = String(q).trim();
  let yr, qn;
  let m = /^(\d{4})\s*-?\s*Q([1-4])$/i.exec(s);
  if (m) { yr = +m[1]; qn = +m[2]; } else {
    m = s.match(/Q([1-4])\D*(\d{2,4})/i);
    if (!m) return null;
    qn = +m[1]; yr = +m[2]; if (yr < 100) yr += 2000;
  }
  const EPOCH = Date.UTC(2020, 0, 1);
  const start = Math.round((Date.UTC(yr, (qn - 1) * 3, 1) - EPOCH) / 86400000);
  const end = Math.round((Date.UTC(yr, qn * 3, 1) - EPOCH) / 86400000) - 1;
  return { qn: qn, yr: yr, start: start, end: end, label: 'Q' + qn + ' ' + yr };
}
/* today's quarter-select order: by quarter start when both parse, otherwise text order */
function shellQSort(a, b) {
  const pa = shellParseQ(a), pb = shellParseQ(b);
  if (pa && pb) return pa.start - pb.start;
  return String(a).localeCompare(String(b));
}
function shellQLabel(q) { const p = shellParseQ(q); return p ? p.label : (q || 'No quarter'); }
function shellAllObjs(D, divId) {
  return (D.portfolio.objectives || []).filter((o) => o.divisionId === divId).slice().sort((a, b) => {
    const qa = a.quarter || '', qb = b.quarter || '';
    if (qa !== qb) { if (!qa) return 1; if (!qb) return -1; return shellQSort(qa, qb); }
    return K.byOrder(a, b);
  });
}
/* Sales' All divisions (decided October 16): on unless a division was picked; never on a view page */
function shellAllMode(C) {
  const S = C.state || {};
  return APP === 'sales' && !!S.divAll && !shellViewOk(S.view);
}
/* the objectives the sidebar can list for a division, or for '*' (All divisions) every division of this
   app's kind, in the picker's order */
function shellSideObjs(D, divId) {
  if (divId !== '*') return shellAllObjs(D, divId);
  const out = [];
  shellDivs(D).forEach((d) => { shellAllObjs(D, d.id).forEach((o) => out.push(o)); });
  return out;
}
/* "Loaded Business Development." as today; All divisions: "Loaded all business divisions." */
function shellLoadedText(C, d) {
  return shellAllMode(C) ? 'Loaded all ' + shellKindWord() + ' divisions.' : 'Loaded ' + (d ? d.name || d.id : '') + '.';
}
function shellOwnerKey(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
/* today's myObjectives(): ?owner= narrows the list to that person's objectives, case-insensitive */
function shellMine(objs, owner) {
  if (!owner) return objs;
  return objs.filter((o) => RD.ownersOf(o).some((v) => shellOwnerKey(v) === owner));
}
function shellQuarters(objs) { const qs = K.uniq(objs.map((o) => o.quarter).filter(Boolean)); qs.sort(shellQSort); return qs; }
function shellProducts(P, objs) { const out = []; objs.forEach((o) => { const p = RD.effProduct(o, P); if (p && out.indexOf(p) < 0) out.push(p); }); return out; }
function shellApply(P, mine, f) {
  return mine.filter((o) => (!f.quarter || (o.quarter || '') === f.quarter) && (!f.product || RD.effProduct(o, P) === f.product));
}
function shellProductName(P, id) { const p = (P.products || []).find((x) => x.id === id); return p ? (p.name || p.id) : id; }
function shellObjName(D, id) { const o = (D.portfolio.objectives || []).find((x) => x.id === id); return o ? (o.statement || o.id) : id; }
/* today's execGatePassed: an FMEA problem tied to a passed gate stops counting */
function shellGatePassed(doc, gateId, today) {
  if (!gateId) return false;
  const g = (doc.stageGates || []).find((x) => x.id === gateId);
  if (!g) return false;
  const s = RD.classifyGate(g, today);
  return s === 'passed' || s === 'passed-late';
}
/* today's flushPersist(): a pending autosave is written now (the simulated save completes).
   Live: NET saves every changed document on its own schedule, whichever division is on screen. */
function shellFlushPatch(C) {
  if (LIVE) return {};
  const sv = C.state.save || {};
  return sv.state === 'saving' && !(C.state.sim && C.state.sim.offline) ? { save: { state: 'saved', at: C.now() } } : {};
}

/* The selection a fresh fill of the selectors gives for one division (today's fillQtrSelect /
   fillProductSelect / fillObjSelect): stale filters reset to all; a wanted objective that the
   quarter/product filters would hide drops both filters; otherwise the first objective. divId '*' is Sales'
   All divisions: every business division's objectives, and divId comes back as the picked objective's. */
function shellSelectionFor(C, divId, f, want, notes) {
  const D = C.D, P = D.portfolio;
  const owner = shellOwnerKey(f.owner);
  const mine = shellMine(shellSideObjs(D, divId), owner);
  let quarter = f.quarter && shellQuarters(mine).indexOf(f.quarter) >= 0 ? f.quarter : '';
  let product = f.product && shellProducts(P, mine).indexOf(f.product) >= 0 ? f.product : '';
  if (notes && f.quarter && !quarter) notes.push('No objectives here are in ' + shellQLabel(f.quarter) + ', so all quarters are shown.');
  if (notes && f.product && !product) notes.push('No objectives here are for ' + shellProductName(P, f.product) + ', so all products are shown.');
  let list = shellApply(P, mine, { quarter, product });
  if (want && mine.some((o) => o.id === want) && !list.some((o) => o.id === want)) {
    if (notes) notes.push('The quarter and product filters were dropped because they would hide ' + want + '.');
    quarter = ''; product = ''; list = mine;
  }
  const objId = want && list.some((o) => o.id === want) ? want : (list[0] ? list[0].id : '');
  const out = { divId: divId, objId: objId, fQuarter: quarter, fProduct: product, fOwner: owner };
  if (APP === 'sales') out.divAll = divId === '*';
  if (divId === '*') {
    const o = list.find((x) => x.id === objId);
    const divs = shellDivs(D);
    const cur = C.state && C.state.divId;
    out.divId = o ? o.divisionId : divs.some((d) => d.id === cur) ? cur : divs[0] ? divs[0].id : '';
  }
  return out;
}
/* Live: the quarter the left panel shows until the person picks one (sh_qAuto; decided October 15): the
   current quarter when the division (or, '*', any division) has objectives in it, else all quarters. An
   objective being opened (a link, the hand-off, a search result) brings its own quarter instead, so the list
   never hides what is open. */
function shellAutoQuarter(C, divId, owner, want) {
  const mine = shellMine(shellSideObjs(C.D, divId), shellOwnerKey(owner));
  if (want) { const o = mine.find((x) => x.id === want); if (o) return o.quarter || ''; }
  const now = shellParseQ(F.qOfDay(C.today()));
  const q = now ? shellQuarters(mine).find((x) => { const p = shellParseQ(x); return !!p && p.yr === now.yr && p.qn === now.qn; }) : null;
  return q || '';
}
function shellQuarterAuto(C) { return LIVE && !!C.state.sh_qAuto; }

/* ------------------------------------------------------------- navigation */
function shellSwitchDivision(C, id) {
  const S = C.state, P = C.D.portfolio;
  const d = (P.divisions || []).find((x) => x.id === id) || null;
  if (!d || RD.divisionKind(d) !== shellKind()) {
    C.closeMenus();
    C.toast('That division isn\'t a ' + shellKindWord() + ' division for this app.', 'err');
    return;
  }
  const all = shellAllMode(C);
  if (id === S.divId && !all) { C.closeMenus(); return; }
  /* from All divisions, the objective on screen stays (with its tab) when it is in that division */
  const keep = all && C.ctx && C.ctx.obj && C.ctx.obj.divisionId === id ? C.ctx.obj.id : '';
  const st = shellSelectionFor(C, id, { quarter: shellQuarterAuto(C) ? shellAutoQuarter(C, id, S.fOwner, keep) : S.fQuarter, product: S.fProduct, owner: S.fOwner }, keep);
  C.setState(Object.assign(shellFlushPatch(C), st, { menu: '', sheets: [], q: '', tab: keep && st.objId === keep ? S.tab : 'overview', sh_recover: null }));
  if (APP !== 'sales') shellStore('rd_division', id);   // Sales opens on All divisions, so it remembers none
  C.toast('Switched to ' + (d.name || d.id) + '.', 'ok');
}
/* Sales' All divisions: every business division's objectives in the sidebar; the objective on screen stays */
function shellSwitchAll(C) {
  const S = C.state;
  if (APP !== 'sales') return;
  if (shellAllMode(C)) { C.closeMenus(); return; }
  const keep = C.ctx && C.ctx.objId ? C.ctx.objId : '';
  const st = shellSelectionFor(C, '*', { quarter: shellQuarterAuto(C) ? shellAutoQuarter(C, '*', S.fOwner, keep) : S.fQuarter, product: S.fProduct, owner: S.fOwner }, keep);
  C.setState(Object.assign(shellFlushPatch(C), st, { menu: '', sheets: [], q: '', tab: keep && st.objId === keep ? S.tab : 'overview', sh_recover: null }));
  C.toast('Switched to all divisions.', 'ok');
}
/* search result / deep link inside this app: switch to its division and drop filters that would hide it
   (All divisions stays on: the objective brings its division with it) */
function shellOpenObjective(C, objId) {
  const D = C.D, S = C.state;
  const o = (D.portfolio.objectives || []).find((x) => x.id === objId);
  if (!o || !shellDivs(D).some((d) => d.id === o.divisionId)) return;
  const owner = shellOwnerKey(S.fOwner);
  const keepOwner = !owner || RD.ownersOf(o).some((v) => shellOwnerKey(v) === owner);
  const all = shellAllMode(C);
  const scope = all ? '*' : o.divisionId;
  const quarter = shellQuarterAuto(C) ? shellAutoQuarter(C, scope, keepOwner ? owner : '', objId) : S.fQuarter;
  const st = shellSelectionFor(C, scope, { quarter: quarter, product: S.fProduct, owner: keepOwner ? owner : '' }, objId);
  const switched = o.divisionId !== ((C.ctx && C.ctx.divId) || S.divId);
  C.setState(Object.assign(switched ? shellFlushPatch(C) : {}, st, { menu: '', sheets: [], q: '' }, switched && !all ? { sh_recover: null } : {}));
  if (switched && !all) {
    if (APP !== 'sales') shellStore('rd_division', o.divisionId);
    const d = (D.portfolio.divisions || []).find((x) => x.id === o.divisionId);
    C.toast('Switched to ' + (d ? d.name : o.divisionId) + '.', 'ok');
  }
}
/* a sidebar row: its objective (in All divisions, its division comes with it) */
function shellPickObjective(C, ctx, o) {
  C.setState(Object.assign(shellFollow(C, ctx, o), { objId: o.id, menu: '', sheets: [] }));
}
/* All divisions: the division follows the objective now on screen (a pending save is written first when that
   changes the division, as a switch does) */
function shellFollow(C, ctx, o) {
  if (!ctx.all || !o) return {};
  return Object.assign(o.divisionId !== ctx.divId ? shellFlushPatch(C) : {}, { divId: o.divisionId });
}
function shellSetFilter(C, ctx, patch) {
  const f = Object.assign({ quarter: ctx.f.quarter, product: ctx.f.product, owner: ctx.f.owner }, patch);
  const list = shellApply(ctx.P, shellMine(ctx.sideObjs, shellOwnerKey(f.owner)), f);
  const pick = list.find((o) => o.id === ctx.objId) || list[0] || null;
  C.setState(Object.assign(shellFollow(C, ctx, pick), { fQuarter: f.quarter, fProduct: f.product, fOwner: shellOwnerKey(f.owner), objId: pick ? pick.id : '', menu: '' }, 'quarter' in patch ? { sh_qAuto: false } : {}));
}
function shellOpenRevise(C, ctx) {
  if (!C.guard()) return;
  if (typeof GATES !== 'undefined' && GATES && typeof GATES.openRevise === 'function') { GATES.openRevise(C, C.ctx || ctx); return; }
  C.toast('The revise-plan editor is not in this build yet.', 'info');
}
function shellHandoffPlanning(C, ctx) {
  const p = { app: 'plan' };
  if (ctx && ctx.objId) { p.objective = ctx.objId; p.focus = ctx.objId; }
  if (ctx && ctx.divId) p.division = ctx.divId;
  C.handoff(p);
}

/* ----------------------------------------------------- simulated broker load */
/* What today's loadAll() shows: "Loaded X." on success; the persistent messages otherwise.
   The sample boards only: live builds load through NET (APP_LIVE_STATUS / APP_LIVE_READY). */
function shellLoad(C, outcome, delay) {
  if (LIVE) return;
  C.later(() => {
    const S = C.state;
    if (outcome === 'notoken') { C.setState(Object.assign(shellFlushPatch(C), { sh_load: 'notoken', sh_banner: { tone: 'info', text: 'Add a broker token in Settings to load. Showing empty scratch.' } })); return; }
    if (outcome === 'fail') { C.setState({ sh_load: 'fail', sh_banner: { tone: 'bad', text: 'Load failed (401). Check the token in Settings.' } }); return; }
    if (outcome === 'noportfolio') { C.setState({ sh_load: 'noportfolio', sh_banner: { tone: 'bad', text: 'No portfolio doc on the broker yet — create it from the Planning app first.' } }); return; }
    const divs = shellDivs(C.D);
    if (!divs.length) { C.setState({ sh_load: 'ok', sh_banner: { tone: 'bad', text: shellNoDivsMsg() } }); return; }
    const div = divs.find((d) => d.id === S.divId) || divs[0];
    C.setState({ sh_load: 'ok', sh_banner: null, divId: div.id });
    C.toast(shellLoadedText(C, div), 'ok');
  }, delay == null ? 450 : delay);
}
function shellSaveToken(C) {
  const t = String(C.state.sh_tokenDraft || '').trim();
  if (LIVE) {
    /* the real token: kept in this browser (rd_broker_token), never shown, then everything reloads */
    C.setState({ sh_tokenDraft: '' });
    C.toast(t ? 'Token saved.' : 'Token removed.', 'ok');
    NET.saveToken(C, t);
    return;
  }
  C.setState({ sh_token: t ? 'saved' : '', sh_tokenDraft: '' });
  C.toast('Saved.', 'ok');
  shellLoad(C, t ? 'ok' : 'notoken', 450);
}

/* ------------------------------------------------------------- simulated sync */
/* The sample boards only: in live builds NET polls, saves and resolves conflicts for real. */
function shellTeammateOf(D, o) {
  const me = shellOwnerKey(D.me && D.me.email);
  const own = RD.ownersOf(o).filter((v) => shellOwnerKey(v) !== me);
  return own.length ? F.name(own[0]) : 'A teammate';
}
/* A teammate's saved change, applied to document `key` (called inside C.mutate). Returns what changed. */
function shellTeammateChange(C, D, key) {
  const doc = D.docs[key];
  if (!doc) return '';
  const divId = key.replace(/^(EXEC|BIZ)-/, '');
  const objs = shellAllObjs(D, divId);
  const cur = C.ctx && C.ctx.obj && C.ctx.obj.divisionId === divId ? C.ctx.obj : null;
  const order = cur ? [cur].concat(objs.filter((o) => o.id !== cur.id)) : objs;
  if (!doc.kpiUpdates) doc.kpiUpdates = [];
  const reads = doc.kpiUpdates;
  for (let i = 0; i < order.length; i++) {
    const o = order[i];
    const who = shellTeammateOf(D, o);
    const k = (doc.kpis || []).find((x) => x.objectiveId === o.id && reads.some((u) => u.kpiId === x.id && typeof u.value === 'number'));
    if (k) {
      const mine = reads.filter((u) => u.kpiId === k.id && typeof u.value === 'number').slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const last = mine[mine.length - 1];
      const ts = C.now();
      const row = { id: 'UPD-' + k.id + '-' + ts, kpiId: k.id, value: last.value, timestamp: ts, note: '' };
      const b = RD.latestBatchId(mine);
      if (b) row.batch = b;
      reads.push(row);
      return who + ' added a reading of ' + F.u(last.value, k.unit) + ' to ' + (k.name || k.id) + '.';
    }
    const kr = (doc.keyResults || []).find((r) => r.objectiveId === o.id && r.trackingType === 'percentage' && (Number(r.progress) || 0) < 100);
    if (kr) {
      const v = Math.min(100, (Number(kr.progress) || 0) + 5);
      kr.progress = v;
      return who + ' moved “' + (kr.statement || kr.id) + '” to ' + v + '%.';
    }
  }
  return '';
}
function shellTeammate(C) {
  if (LIVE) return;
  const S = C.state;
  if (S.sim && S.sim.offline) { C.toast('You are offline, so teammates\' changes cannot arrive. Go back online first.', 'info'); return; }
  if ((S.sh_load || 'ok') !== 'ok') { C.toast('Nothing is loaded, so there is nothing to update.', 'info'); return; }
  const key = C.ctx && C.ctx.docKey;
  if (!key) return;
  const flush = shellFlushPatch(C);                 // the poll writes pending edits before comparing versions
  let desc = '';
  C.mutate((D) => { desc = shellTeammateChange(C, D, key); }, { quiet: true, allowRo: true });
  C.setState(Object.assign(flush, { sh_team: desc || 'No visible change.', sh_banner: { tone: 'info', text: 'Updated from another editor.', detail: desc } }));
}
function shellGoOffline(C) {
  if (LIVE) return;
  if (C.state.sim && C.state.sim.offline) return;
  C._shSrv = K.clone(C.D.docs);                    // what the broker holds now (pending writes flushed first)
  C.setState(Object.assign(shellFlushPatch(C), { sim: Object.assign({}, C.state.sim, { offline: true }) }));
}
function shellGoOnline(C, conflict) {
  if (LIVE) return;
  const S = C.state;
  if (!S.sim || !S.sim.offline) return;
  const pending = !!(S.save && S.save.pending);
  const sim = Object.assign({}, S.sim, { offline: false });
  if (conflict) {
    if (!pending) { C.toast('Make a change while offline first. A conflict needs an unsaved change of yours.', 'info'); return; }
    /* today's HTTP 412 path: re-read the server copy and adopt it; the local edit is discarded */
    const key = C.ctx && C.ctx.docKey ? C.ctx.docKey : shellDocKey(S.divId);
    const srv = C._shSrv || {};
    let desc = '';
    C.mutate((D) => { if (srv[key]) D.docs[key] = K.clone(srv[key]); desc = shellTeammateChange(C, D, key); }, { quiet: true, allowRo: true });
    C._shSrv = null;
    C.setState({ sim: sim, save: { state: 'conflict', at: C.now() }, sh_team: desc || 'No visible change.', sh_banner: { tone: 'bad', text: 'Another editor saved first — reloaded; re-apply your change.', detail: desc } });
    return;
  }
  C._shSrv = null;
  if (pending) {
    C.setState({ sim: sim, save: { state: 'saving', at: C.now() } });
    C.later(() => {
      if (C.state.sim && C.state.sim.offline) return;
      C.setState({ save: { state: 'saved', at: C.now() } });
      C.toast('Saved.', 'ok');
    }, 700);
  } else C.setState({ sim: sim });
}

/* ------------------------------------------------- Sales: recover stranded data */
/* The stranded data of one division's objectives in the other business divisions' documents, a row per
   objective and source; divId '*' (All divisions): every business division's, each row moving to the division
   its objective belongs to now (dstKey) */
function shellScanStranded(C, divId) {
  const D = C.D, P = D.portfolio;
  if (divId === '*') {
    const all = [];
    shellDivs(D).forEach((d) => { shellScanStranded(C, d.id).forEach((r) => all.push(r)); });
    return all;
  }
  const dst = (P.divisions || []).find((d) => d.id === divId);
  const mine = (P.objectives || []).filter((o) => o.divisionId === divId).map((o) => o.id);
  const rows = [];
  (P.divisions || []).filter((d) => RD.divisionKind(d) === 'biz' && d.id !== divId).forEach((d) => {
    const key = 'BIZ-' + d.id;
    const doc = D.docs[key];
    if (!doc || typeof doc !== 'object') return;
    mine.forEach((objId) => {
      const c = RD.objectivePayloadCounts(doc, objId);
      const total = c.keyResults + c.kpis + c.stageGates + c.tasks + c.boards + c.risks;
      if (total > 0) rows.push({ srcDiv: d.id, srcName: d.name || d.id, srcKey: key, objId: objId, counts: c, dstKey: 'BIZ-' + divId, dstName: dst ? dst.name || dst.id : divId });
    });
  });
  return rows;
}
function shellStrandedText(p) {
  const c = p.counts;
  const bits = [];
  if (c.keyResults) bits.push(F.plural(c.keyResults, 'key result'));
  if (c.kpis) bits.push(F.plural(c.kpis, 'KPI'));
  if (c.stageGates) bits.push(F.plural(c.stageGates, 'stage-gate'));
  if (c.tasks) bits.push(F.plural(c.tasks, 'task'));
  if (c.boards) bits.push(F.plural(c.boards, 'board'));
  if (c.risks) bits.push(F.plural(c.risks, 'risk'));
  return F.list(bits) + ' stranded in ' + p.srcName;
}
function shellRecoverScan(C) {
  const R = C.state.sh_recover;
  if (R && (R.phase === 'scanning' || R.phase === 'moving')) return;
  const all = shellAllMode(C);
  const divId = all ? '*' : C.ctx && C.ctx.divId ? C.ctx.divId : C.state.divId;
  const none = all ? 'No stranded execution data found for any business division’s objectives.' : 'No stranded execution data found for this division’s objectives.';
  if (LIVE) {
    /* live: every business division's document is loaded (and kept fresh by the 25 s poll), so the scan reads them */
    if (!(C.net && C.net.loaded)) { C.toast('Nothing is loaded from the broker yet, so there is nothing to scan.', 'info'); return; }
    const found = shellScanStranded(C, divId);
    C.setState({ sh_recover: { phase: 'report', rows: found, divId: divId, msg: found.length ? '' : none, tone: found.length ? '' : 'ok' } });
    return;
  }
  C.setState({ sh_recover: { phase: 'scanning', rows: [], msg: '', tone: '', divId: divId } });
  C.later(() => {
    const cur = C.state.sh_recover;
    if (!cur || cur.phase !== 'scanning' || cur.divId !== divId) return;
    const rows = shellScanStranded(C, divId);
    C.setState({ sh_recover: { phase: 'report', rows: rows, divId: divId, msg: rows.length ? '' : none, tone: rows.length ? '' : 'ok' } });
  }, 600);
}
/* Moves every reported objective's whole payload (RD.moveObjectivePayload) into its division's document
   (this division's; in All divisions, each objective's own). Both documents change in one save, so the source
   can never lose data that did not land (today writes the source even when the write here failed). Blocked in
   read-only.
   Live: one objective at a time, in today's order but with today's bug fixed: the objective's division's
   document is written first and the source only after that write succeeded (shellRecoverMoveLive). */
function shellRecoverMove(C) {
  if (!C.guard()) return;
  const R = C.state.sh_recover;
  if (!R || R.phase !== 'report' || !R.rows.length) return;
  C.setState({ sh_recover: Object.assign({}, R, { phase: 'moving' }) });
  if (LIVE) { shellRecoverMoveLive(C, R); return; }
  C.later(() => {
    const cur = C.state.sh_recover;
    if (!cur || cur.phase !== 'moving') return;
    const n = cur.rows.length;
    const msg = n + ' objective' + (n > 1 ? 's' : '') + ' recovered.';
    const ok = C.mutate((D) => {
      cur.rows.forEach((p) => {
        const to = p.dstKey || shellDocKey(cur.divId);
        if (!D.docs[to]) D.docs[to] = shellBlankDoc();
        const r = RD.moveObjectivePayload(D.docs[p.srcKey] || {}, D.docs[to], p.objId);
        D.docs[to] = r.toDoc;
        D.docs[p.srcKey] = r.fromDoc;
      });
    }, { msg: msg });
    C.setState({ sh_recover: ok ? { phase: 'done', rows: [], divId: cur.divId, msg: msg, tone: 'ok' } : Object.assign({}, cur, { phase: 'report' }) });
  }, 600);
}
/* why a broker call failed, in words (live) */
function shellNetWhy(e) {
  if (e && e.offline) return 'couldn’t reach the broker';
  if (e && e.status === 412) return 'another editor saved first';
  if (e && e.status === 401) return 'the broker didn’t accept the token';
  if (e && e.status === 426) return 'this page is out of date';
  return e && e.status ? 'error ' + e.status : 'error';
}
/* Live recovery, per reported objective: save pending edits, read the source fresh, move the payload into a
   copy of its division's document, write that document (NET.put: its registered etag; a 412 or a lost
   connection throws and nothing else is written), and only after that write the source against the copy just
   read (NET.putAs) and adopt it. If the source write fails, the data is in both documents, which is safe:
   moving again is de-duplicating, so a second scan tidies the source up. */
async function shellRecoverMoveLive(C, R) {
  const done = [];
  for (let i = 0; i < R.rows.length; i++) {
    const p = R.rows[i];
    const myKey = p.dstKey || shellDocKey(R.divId);
    const out = { objId: p.objId, srcName: p.srcName, dstName: p.dstName || '', state: 'failed', why: '' };
    done.push(out);
    try {
      await NET.flush(C);
      const fresh = await NET.get(C, p.srcKey);
      const src = fresh && fresh.doc && typeof fresh.doc === 'object' && !Array.isArray(fresh.doc) ? K.clone(fresh.doc) : null;
      if (src) REPAIR.exec(src);   // the shapes this page works with, as every load repairs them
      const c = src ? RD.objectivePayloadCounts(src, p.objId) : null;
      if (!c || !(c.keyResults + c.kpis + c.stageGates + c.tasks + c.boards + c.risks)) { out.state = 'none'; continue; }
      const r = RD.moveObjectivePayload(src, K.clone(C.D.docs[myKey] || REPAIR.blank('exec')), p.objId);
      await NET.put(C, myKey, r.toDoc);                                   // 1) the objective's division's document
      try {
        const res = await NET.putAs(C, p.srcKey, r.fromDoc, fresh.etag);  // 2) then the source
        NET.adopt(C, p.srcKey, { doc: K.clone(r.fromDoc), etag: res.etag, version: res.version });
        out.state = 'ok';
      } catch (e2) { out.state = 'both'; out.why = shellNetWhy(e2); }
    } catch (e) { out.why = shellNetWhy(e); }
  }
  const count = (st) => done.filter((x) => x.state === st).length;
  const failed = count('failed'), both = count('both'), rec = count('ok') + both;
  let msg = failed ? rec + ' recovered, ' + failed + ' failed — reopen to retry.'
    : rec ? rec + ' objective' + (rec > 1 ? 's' : '') + ' recovered.' : 'Nothing left to move: the stranded data is gone already.';
  if (both) msg += (R.divId === '*' ? ' Moved, but still in ' : ' Moved here, but still in ') + F.list(K.uniq(done.filter((x) => x.state === 'both').map((x) => x.srcName))) + ': scan again to tidy up.';
  const cur = C.state.sh_recover;
  if (cur && cur.phase === 'moving' && cur.divId === R.divId) {
    C.setState({ sh_recover: { phase: 'done', rows: [], results: done, divId: R.divId, msg: msg, tone: failed ? 'bad' : both ? 'warn' : 'ok' } });
  }
  C.toast(msg, failed ? 'err' : both ? 'info' : 'ok');
  C.bump();
}

/* ---------------------------------------------------- "Open a link" (URL parameters) */
function shellLinkUrl(d) {
  const parts = [];
  const add = (k, v) => { const s = String(v == null ? '' : v).trim(); if (s) parts.push(k + '=' + encodeURIComponent(s)); };
  add('division', d.division); add('quarter', d.quarter); add('product', d.product); add('objective', d.objective); add('owner', d.owner);
  if (shellViewOk(d.view)) parts.push('view=' + d.view);
  if (d.readonly) parts.push('readonly');
  add('token', d.token);
  return shellAppFile() + (parts.length ? '?' + parts.join('&') : '');
}

/* ------------------------------------------- views by direct link: links and new tabs */
/* L = { objective, view, tab, item, ro }: a view page (view) or the app on a tab (tab); item highlights one item */
function shellPageUrl(L) {
  const parts = [];
  if (L.objective) parts.push('objective=' + encodeURIComponent(L.objective));
  else if (L.division) parts.push('division=' + encodeURIComponent(L.division));
  if (shellViewOk(L.view)) parts.push('view=' + L.view);
  else if (L.tab && L.tab !== 'overview') parts.push('tab=' + L.tab);
  if (L.item) parts.push('item=' + encodeURIComponent(L.item));
  if (L.ro) parts.push('readonly');
  return shellAppFile() + (parts.length ? '?' + parts.join('&') : '');
}
/* A view's links open in a new browser tab, so an embedded view stays where it is. Live pages open the whole
   address; a module that stands in for browser tabs (the canvas mockup's frame) may provide openTab; the other
   sample boards have one tab, so they show the link here, the way "Open this link" does. L.go: the review
   row's target, applied once the page shows (a live page finds it from ?item=). */
function shellOpenTab(C, L) {
  const host = MOD_ORDER.map((n) => MODS[n]).find((m) => m && typeof m.openTab === 'function');
  if (host) { host.openTab(C, L); return; }
  if (LIVE) {
    try { window.open(shellAbsUrl(shellPageUrl(L)), '_blank', 'noopener'); } catch (e) { C.toast('This page couldn’t open the link. Copy it and open it yourself.', 'err'); }
    return;
  }
  shellShowLink(C, L);
}
/* a module's "go to that tab": on a view page the tab isn't there, so it opens in a new tab (its view, or the app) */
function shellGoTab(C, tab) {
  const ctx = C.ctx || {};
  if (ctx.view) { shellOpenTab(C, { objective: ctx.objId, view: shellViewOk(tab) ? tab : '', tab: tab, ro: !!C.state.ro }); return; }
  C.setState({ tab: tab, menu: '' });
}
/* the sample's fresh load of L in this tab: its objective (filters that would hide it dropped), the view or
   tab, read-only, then the highlighted item. Sales' whole app opens on All divisions, as a fresh load does. */
function shellShowLink(C, L) {
  const P = C.D.portfolio;
  const view = shellViewOk(L.view) ? L.view : '';
  const patch = { view: view, ro: !!L.ro, tab: view || L.tab || 'overview', menu: '', sheets: [], q: '', dlg: null };
  const o = (P.objectives || []).find((x) => x.id === L.objective);
  const all = APP === 'sales' && !view;
  if (o && shellDivs(C.D).some((d) => d.id === o.divisionId)) Object.assign(patch, shellSelectionFor(C, all ? '*' : o.divisionId, { quarter: '', product: '', owner: '' }, o.id));
  else if (all && !L.objective) Object.assign(patch, shellSelectionFor(C, '*', { quarter: '', product: '', owner: '' }, ''));
  C.setState(Object.assign(shellFlushPatch(C), patch));
  if (L.go) shellApplyGo(C, L.go);
  else if (L.item) shellFocusItem(C, view || L.tab || 'overview', L.item);
}
/* ?item=: the review row whose target is that item on that tab (a key result, gate, tile or problem of the
   objective on screen), applied like a click on its name; an item that isn't there is ignored */
function shellFocusItem(C, tab, item) {
  if (typeof REVIEW === 'undefined' || !item) return;
  C._memo = {};   // the selection just changed: nothing cached from the last render
  let list = [];
  try { list = REVIEW.items(C, APP_CTX(C)); } catch (e) { list = []; }
  C._memo = {};
  const it = list.find((x) => x.go && x.go.tab === tab && x.go.focus === item);
  if (it) shellApplyGo(C, it.go);
}
/* a review row's target: its tab's own state (row open, board picked) and the highlight, cleared after a while */
function shellApplyGo(C, g) {
  if (!g || typeof g.patch !== 'function') return;
  C.setState(g.patch(C.state));
  if (g.focusKey && g.focus) {
    const key = g.focusKey, id = g.focus;
    C.later(() => { if (C.state[key] === id) C.setState({ [key]: '' }); }, typeof REVIEW !== 'undefined' && REVIEW.FOCUS_MS ? REVIEW.FOCUS_MS : 8000);
  }
}
function shellCopy(C, text) {
  C.copyText(text, 'Link copied.', 'Copy didn’t work here. Select the link and copy it instead.');
}
/* The selection a fresh load of today's app gives for the link parameters p (URLP, loadAll,
   resolveDivision, fillObjSelect): ?objective= opens in its own division (an unknown one is dropped),
   otherwise ?division= when it is this app's kind, otherwise `remembered` (rd_division), otherwise the first
   division; ?quarter= ('active' is the current quarter), ?product= and ?owner= seed the filters
   (shellSelectionFor). Sales (remembers no division): All divisions unless ?division= names a business
   division, with ?objective= selected in it; a link naming a division of the wrong kind, or none that exists,
   says so and opens on All divisions. What it says about it goes into `notes` (the banner) and `after` (error
   toasts). Returns the selection state, or null when this app has no division. Shared by the sample's "Open
   this link" and the live first load (APP_LIVE_READY); it touches no state. */
function shellLinkSelection(C, p, remembered, notes, after) {
  const D = C.D, P = D.portfolio;
  const kind = shellKind(), word = shellKindWord();
  const sales = APP === 'sales';
  const rq = String(p.quarter || '').trim();
  const quarter = rq === 'active' ? F.qOfDay(C.today()) : rq;
  const product = String(p.product || '').trim();
  let pending = String(p.objective || '').trim();
  const owner = shellOwnerKey(p.owner);
  let divId = null;
  if (pending) {
    const to = (P.objectives || []).find((o) => o.id === pending);
    if (to) divId = to.divisionId;
    else { notes.push('There is no objective ' + pending + ', so the link opened without one.'); pending = ''; }
  }
  const divs = shellDivs(D);
  const listed = (id) => divs.some((d) => d.id === id);
  if (pending && divId && !listed(divId)) {
    const od = (P.divisions || []).find((d) => d.id === divId);
    notes.push(pending + ' belongs to ' + (od ? od.name : divId) + ', which isn\'t a ' + word + ' division for this app.');
  }
  const asked = String(p.division || '').trim();
  let all = false;
  if (!divId || !listed(divId)) {
    const want = asked || (sales ? '' : remembered);   // ?division=, otherwise the remembered division (rd_division)
    const wd = (P.divisions || []).find((d) => d.id === want);
    const resolved = wd && RD.divisionKind(wd) === kind ? want : null;
    if (asked && !resolved) {
      if (wd) after.push('That division isn\'t a ' + word + ' division for this app.');
      else notes.push('There is no division ' + asked + '.');
    }
    divId = resolved || (divs[0] ? divs[0].id : null);
    all = sales && !resolved;
  } else if (sales) all = !listed(asked);          // Sales: ?objective= without a business ?division= opens on All divisions
  if (!divId) return null;
  const scope = all ? '*' : divId;
  const auto = LIVE && !rq;   // live: a link without ?quarter= opens on the automatic quarter
  const st = shellSelectionFor(C, scope, { quarter: auto ? shellAutoQuarter(C, scope, owner, pending) : quarter, product: product, owner: owner }, pending, notes);
  if (LIVE) st.sh_qAuto = auto;
  if (pending && st.objId !== pending && (P.objectives || []).some((o) => o.id === pending && (all ? listed(o.divisionId) : o.divisionId === divId))) notes.push('The owner filter hides ' + pending + ', so the first of that person’s objectives is shown.');
  if (owner) notes.push('Only objectives owned by ' + F.name(owner) + ' are listed.');
  return st;
}
/* Applies the parameters exactly the way a fresh load of today's app does (URLP, loadAll,
   resolveDivision, fillObjSelect), then says what happened. The sample boards only: a live board
   navigates to the link instead (shellOpenLink), and the fresh page applies it (APP_LIVE_READY). */
function shellApplyLink(C, p) {
  if (LIVE) return;
  const S = C.state;
  const notes = [];
  const after = [];
  const tokenParam = String(p.token || '').trim();
  const token = tokenParam ? 'saved' : S.sh_token;
  if (tokenParam) notes.push('The token was saved in this browser and removed from the address bar.');
  const ro = !!p.readonly;
  /* ?view= needs the objective it shows; without one the link opens the whole app */
  const view = shellViewOk(p.view) && String(p.objective || '').trim() ? p.view : '';
  const base = { sheets: [], menu: '', q: '', ro: ro, sh_token: token, sh_tokenDraft: '', sh_recover: null, tab: view || 'overview', view: view };
  if (!token) {
    const rq = String(p.quarter || '').trim();
    C.setState(Object.assign(shellFlushPatch(C), base, { sh_load: 'notoken', fQuarter: rq === 'active' ? F.qOfDay(C.today()) : rq, fProduct: String(p.product || '').trim(), fOwner: shellOwnerKey(p.owner), sh_banner: { tone: 'info', text: 'Add a broker token in Settings to load. Showing empty scratch.' } }));
    return;
  }
  const st = shellLinkSelection(C, p, S.divId, notes, after);
  if (!st) { C.setState(Object.assign(base, { sh_load: 'ok', sh_banner: { tone: 'bad', text: shellNoDivsMsg() } })); return; }
  if (ro) notes.push('Read-only view: nothing saves and editing controls are hidden.');
  const divId = st.divId;
  const d = shellDivs(C.D).find((x) => x.id === divId);
  C.setState(Object.assign(shellFlushPatch(C), base, st, { sh_load: 'ok', sh_banner: notes.length ? { tone: 'info', text: 'Opened the link.', detail: notes.join(' ') } : null }));
  if (APP !== 'sales') shellStore('rd_division', divId);
  after.forEach((t) => C.toast(t, 'err'));
  const loaded = shellLoadedText(C, d);
  C.later(() => C.toast(loaded, 'ok'), after.length ? 350 : 0);
}
/* live "Open this link": a real fresh load of the page at that address (NET takes ?token and ?readonly,
   APP_LIVE_READY applies the rest) */
function shellOpenLink(C, url) {
  try { window.location.assign(url); } catch (e) { C.toast('This page couldn’t open the link. Copy it and open it yourself.', 'err'); }
}

/* ----------------------------------------------------------------- init */
function APP_INIT(C, st) {
  const D = C.D;
  C.MODS = MODS;
  C._shSrv = null;
  if (LIVE) {
    /* live: C.D is empty until NET's first load, so nothing is picked here and the hand-off waits for
       APP_LIVE_READY; the page says "Loading…" until APP_LIVE_STATUS reports the outcome */
    st.divId = '';
    st.divAll = APP === 'sales';   // Sales opens on All divisions (decided October 16)
    st.objId = '';
    st.fQuarter = '';
    st.sh_qAuto = true;   // the current quarter once loaded (shellAutoQuarter), until the person picks one
    st.fProduct = '';
    st.fOwner = '';
    /* a view page (?view= with ?objective=) is one from the first frame, "Loading…" included */
    const pp = shellPageParams();
    st.view = shellViewOk(pp.view) && String(pp.objective || '').trim() ? pp.view : '';
    st.tab = st.view || 'overview';
    st.sh_viewMissing = '';
    const lt = shellStore('rd_theme');
    st.theme = lt === 'light' || lt === 'dark' || lt === 'system' ? lt : 'light';   // light until a choice is saved, as on the canvas (decided October 14)
    st.sh_banner = null;
    st.sh_load = 'loading';
    st.sh_token = '';
    st.sh_tokenDraft = '';
    st.sh_recover = null;
    st.sh_team = '';
    return;
  }
  const divs = shellDivs(D);
  const sales = APP === 'sales';
  const def = sales ? 'DIV-BD' : 'DIV-EL';
  let divId = divs.some((d) => d.id === def) ? def : (divs[0] ? divs[0].id : '');
  /* Sales opens on All divisions every time (decided October 16), so only Execution reads rd_division */
  const remembered = sales ? null : shellStore('rd_division');
  if (remembered && divs.some((d) => d.id === remembered)) divId = remembered;
  const defObj = sales ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01';
  st.divAll = sales;
  st.divId = divId;
  st.objId = shellAllObjs(D, divId).some((o) => o.id === defObj) ? defObj : '';
  st.fQuarter = '';
  st.fProduct = '';
  st.fOwner = '';
  st.tab = 'overview';
  const h = C.takeHandoff(APP);
  if (h && h.objective) {
    const o = (D.portfolio.objectives || []).find((x) => x.id === h.objective);
    if (o && divs.some((d) => d.id === o.divisionId)) { st.divId = o.divisionId; st.objId = o.id; }
  } else if (h && h.division && divs.some((d) => d.id === h.division)) { st.divId = h.division; st.objId = ''; st.divAll = false; }
  if (h && h.tab && SHELL_TABS.some((t) => t[0] === h.tab)) st.tab = h.tab;
  const th = shellStore('rd_theme');
  st.theme = th === 'light' || th === 'dark' || th === 'system' ? th : 'light';   // Calm: light until a choice is saved, so the four boards match on the canvas (today follows the OS; 'Match system' does that)
  st.sh_banner = null;
  st.sh_load = 'ok';
  st.sh_token = 'saved';
  st.sh_tokenDraft = '';
  st.sh_recover = null;
  st.sh_team = '';
}
function APP_RESET(C) {
  const st = {};
  APP_INIT(C, st);
  C.setState(st);
}

/* ------------------------------------------------------------- live builds (LIVE.md) */
/* what this app loads from the broker and may save (today's apps: Execution writes EXEC-<div>, Sales
   BIZ-<div>; both write the portfolio for Revise plan's new planned finish) */
function APP_LIVE_PLAN(C) {
  const sales = APP === 'sales';
  const pre = sales ? 'BIZ-' : 'EXEC-';
  return {
    roster: true,
    prefs: true,
    autoPass: true,
    /* every division's document, R&D and business: this app edits its own kind; the other kind's are read only,
       so a KPI pulled from other work (mods/pull) can reach any objective (October 19) */
    docs(P) {
      const ds = ((P && P.divisions) || []).filter((d) => d && d.id);
      const exec = ds.filter((d) => RD.divisionKind(d) !== 'biz').map((d) => 'EXEC-' + d.id);
      const biz = ds.filter((d) => RD.divisionKind(d) === 'biz').map((d) => 'BIZ-' + d.id);
      const spec = ds.filter((d) => RD.divisionKind(d) !== 'biz').map((d) => 'SPEC-' + d.id);
      return (sales ? biz.concat(exec) : exec.concat(biz)).concat(spec);
    },
    writable(id) { return id === 'portfolio' || String(id).indexOf(pre) === 0; },
    /* the other app's documents update with the poll without "Updated from another editor." */
    quiet(id) { return /^(EXEC|BIZ)-/.test(String(id)) && String(id).indexOf(pre) !== 0; }
  };
}
/* the first load that succeeds applies the page's parameters (?division= ?objective= ?quarter= ?product=
   ?owner=; NET has already applied ?readonly and taken ?token) exactly like the sample's "Open this link";
   without them, the hand-off from another app, else the remembered division (rd_division) or the first, at
   its first objective. Sales remembers no division: it opens on All divisions unless a link or the hand-off
   names one. Later loads (url null) keep the selection while it still exists. */
const SHELL_LINK_KEYS = ['division', 'objective', 'quarter', 'product', 'owner'];
function APP_LIVE_READY(C, url) {
  const D = C.D, S = C.state;
  const sales = APP === 'sales';
  const divs = shellDivs(D);
  const listed = (id) => !!id && divs.some((d) => d.id === id);
  const remembered = sales ? null : shellStore('rd_division');
  const remember = (id) => { if (!sales && id) shellStore('rd_division', id); };
  const fallback = () => (listed(remembered) ? remembered : divs[0] ? divs[0].id : '');
  const first = !C._shLiveReady;   // a first load that failed (no token yet, offline) leaves this for the next one
  C._shLiveReady = true;
  if (!first) {
    if (listed(S.divId)) return;
    /* the division on screen is gone: the remembered or first one; Sales goes back to All divisions, keeping
       the objective when it is still listed somewhere */
    const scope = sales ? '*' : fallback();
    C.setState(Object.assign(scope ? shellSelectionFor(C, scope, { quarter: shellQuarterAuto(C) ? shellAutoQuarter(C, scope, S.fOwner, sales ? S.objId : '') : S.fQuarter, product: S.fProduct, owner: S.fOwner }, sales ? S.objId : '') : { divId: '', objId: '' }, { sh_recover: null }));
    remember(scope);
    return;
  }
  const p = url || (C.net && C.net.url) || {};
  const h = C.takeHandoff(APP);   // taken once either way, so a stale hand-off never opens a later page
  /* NET calls this once the documents are in (its 'ok' status comes right after): the page counts as loaded
     now, so a highlighted ?item= can find its row */
  const base = { q: '', sh_recover: null, tab: 'overview', sh_load: 'ok' };
  const item = String(p.item || '').trim();
  /* a view link: its objective, or a message when it isn't here (never another objective); a view page leaves
     the remembered division alone */
  const want = String(p.objective || '').trim();
  const view = shellViewOk(p.view) && want ? p.view : '';
  if (view) {
    const o = (D.portfolio.objectives || []).find((x) => x.id === want);
    if (!o || !listed(o.divisionId)) { C.setState(Object.assign(base, { view: view, tab: view, divId: fallback(), objId: '', sh_viewMissing: want })); return; }
    C.setState(Object.assign(base, shellSelectionFor(C, o.divisionId, { quarter: '', product: '', owner: '' }, o.id), { view: view, tab: view, sh_viewMissing: '' }));
    if (item) shellFocusItem(C, view, item);
    return;
  }
  /* ?tab= opens the app on that tab ("Open in Execution" from a view page) */
  if (shellTabOk(p.tab)) base.tab = p.tab;
  if (SHELL_LINK_KEYS.some((k) => p[k] != null && String(p[k]).trim() !== '')) {
    const notes = [], after = [];
    const st = shellLinkSelection(C, p, remembered, notes, after);
    if (!st) { C.setState(Object.assign(base, { divId: '', objId: '' })); return; }
    C.setState(Object.assign(base, st, { sh_banner: notes.length ? { tone: 'info', text: 'Opened the link.', detail: notes.join(' ') } : null }));
    remember(st.divId);
    after.forEach((t) => C.toast(t, 'err'));
    if (item && st.objId === want) shellFocusItem(C, base.tab, item);
    return;
  }
  let divId = fallback(), objId = '', all = sales;
  if (h && h.objective) {
    const o = (D.portfolio.objectives || []).find((x) => x.id === h.objective);
    if (o && listed(o.divisionId)) { divId = o.divisionId; objId = o.id; }
  } else if (h && listed(h.division)) { divId = h.division; all = false; }
  if (h && h.tab && SHELL_TABS.some((t) => t[0] === h.tab) && !shellTabOk(p.tab)) base.tab = h.tab;
  if (!divId) { C.setState(Object.assign(base, { divId: '', objId: '' })); return; }
  const scope = all ? '*' : divId;
  C.setState(Object.assign(base, shellSelectionFor(C, scope, { quarter: shellAutoQuarter(C, scope, '', objId), product: '', owner: '' }, objId), { sh_qAuto: true }));
  remember(divId);
}
/* load states in today's words; a load banner carries `load: true` so the next good load clears only those */
const SHELL_LIVE_LOAD = {
  notoken: ['info', 'No broker token in this browser yet. Open this app from the Hub, or add the token in Settings.'],
  badtoken: ['bad', 'The broker didn’t accept the token (401). Check it in Settings.'],
  noportfolio: ['bad', 'No portfolio doc on the broker yet — create it from the Planning app first.'],
  fail: ['bad', ''],
  offline: ['warn', 'Couldn’t reach the broker. Check your connection; this page keeps trying.'],
  outdated: ['bad', 'This page is out of date. Reload it to keep working.']
};
/* on a view page there is no Settings: the token comes from the Hub (the same browser) or the link (?token=) */
const SHELL_VIEW_LOAD = {
  notoken: ['info', 'No broker token in this browser yet. Open ' + (APP === 'sales' ? 'Sales' : 'Execution') + ' from the Hub once, then reload this page.'],
  badtoken: ['bad', 'The broker didn’t accept this browser’s token (401). Open ' + (APP === 'sales' ? 'Sales' : 'Execution') + ' to check it in Settings, then reload this page.']
};
/* (NET tries a load that failed for a passing reason again by itself, so "this page keeps trying" holds) */
function APP_LIVE_STATUS(C, s) {
  const phase = (s && s.phase) || '';
  const loaded = !!(C.net && C.net.loaded);
  const cur = C.state.sh_banner;
  const keep = cur && !cur.load ? cur : null;   // link notes, other editors' changes: not the load's to clear
  if (phase === 'loading') {
    if (!loaded) C.setState({ sh_load: 'loading', sh_banner: keep });   // a reload keeps the page as it is meanwhile
    return;
  }
  if (phase === 'ok') {
    const divs = shellDivs(C.D);
    if (!divs.length) { C.setState({ sh_load: 'ok', sh_banner: { tone: 'bad', text: shellNoDivsMsg(), load: true } }); return; }
    C.setState({ sh_load: 'ok', sh_banner: keep });
    const d = divs.find((x) => x.id === C.state.divId) || divs[0];
    C.toast(shellLoadedText(C, d), 'ok');
    return;
  }
  const vw = !!C.state.view;
  const m = (vw && SHELL_VIEW_LOAD[phase]) || SHELL_LIVE_LOAD[phase];
  if (!m) return;
  const text = phase === 'fail' ? 'Load failed (' + (s.status || 'error') + ').' + (vw ? ' Reload the page to try again.' : ' Check the token in Settings.') : m[1];
  /* a refused save or poll (401, 426) leaves the loaded page on screen; a failed load empties it */
  C.setState({ sh_load: loaded ? 'ok' : phase, sh_banner: { tone: m[0], text: text, load: true } });
}
/* other editors' changes and save conflicts: the banner, like the sample's poll and 412 messages; good news
   (a merged save) is a toast */
function APP_LIVE_NOTICE(C, tone, text) {
  if (tone === 'ok') { C.toast(text, 'ok'); return; }
  C.setState({ sh_banner: { tone: tone === 'bad' ? 'bad' : 'info', text: String(text || '') } });
}

/* ---------------------------------------------------------- context for modules */
function APP_CTX(C) {
  const D = C.D;
  const S = C.state;
  const P = D.portfolio;
  const divs = shellDivs(D);
  const view = shellViewOk(S.view) ? S.view : '';
  const loaded = (S.sh_load || 'ok') === 'ok';
  const owner = shellOwnerKey(S.fOwner);
  /* the filters that still mean something for what the sidebar can list (stale ones read as all) */
  const filtersFor = (mine) => ({
    quarter: S.fQuarter && shellQuarters(mine).indexOf(S.fQuarter) >= 0 ? S.fQuarter : '',
    product: S.fProduct && shellProducts(P, mine).indexOf(S.fProduct) >= 0 ? S.fProduct : '',
    owner: owner
  });
  /* Sales' All divisions: the sidebar lists every business division's objectives, and the objective on screen
     decides the division (its document, engine map, unit and breadcrumb) */
  const all = shellAllMode(C);
  let sideObjs = [], f = null, objs = [], pick = null;
  if (all) {
    sideObjs = loaded ? shellSideObjs(D, '*') : [];
    const mine = shellMine(sideObjs, owner);
    f = filtersFor(mine);
    objs = shellApply(P, mine, f);
    pick = objs.find((o) => o.id === S.objId) || objs[0] || null;
  }
  const div = (pick && divs.find((d) => d.id === pick.divisionId)) || divs.find((d) => d.id === S.divId) || divs[0] || null;
  const divId = div ? div.id : '';
  const docKey = divId ? shellDocKey(divId) : '';
  if (docKey && !D.docs[docKey]) D.docs[docKey] = shellBlankDoc();
  const doc = docKey ? D.docs[docKey] : shellBlankDoc();
  const em = RD.withPortfolio(P, divId ? { [divId]: doc } : {});
  const allObjs = loaded && divId ? shellAllObjs(D, divId) : [];
  if (!all) {
    sideObjs = allObjs;
    const mine = shellMine(allObjs, owner);
    f = filtersFor(mine);
    objs = shellApply(P, mine, f);
  }
  let obj;
  if (view) obj = S.sh_viewMissing ? null : (allObjs.find((o) => o.id === S.objId) || null);   // a view page: its objective, never another
  else if (all) obj = pick;
  else {
    obj = objs.find((o) => o.id === S.objId) || null;
    if (!obj && objs.length) obj = objs[0];
  }
  const objId = obj ? obj.id : '';
  const end = objId ? RD.objectiveEndState(doc.objectiveState, objId) : null;
  const unit = div && div.unitId ? (P.units || []).find((u) => u.id === div.unitId) || null : null;
  const today = D.today;
  const sim = S.sim || {};
  return {
    app: APP, kind: shellKind(), today: today, nowMs: C.now(),
    P, divs, div, divId, docKey, doc, em, spec: D.spec,
    allObjs, all, sideObjs, objs, obj, objId, end, ended: !!end,
    /* a view page (?view=) shows that one tab */
    ro: !!S.ro, tab: view || S.tab, view: view,
    loaded, unit, f,
    casc: () => C.memo('shell.casc', () => { try { return RD.cascade(P, em, today); } catch (e) { return null; } }),
    hub: !!sim.hub, offline: !!sim.offline
  };
}

/* ---------------------------------------------------------------- shell view model */
function APP_SHELL(C, ctx) {
  const S = C.state;
  const D = C.D;
  const P = ctx.P;
  const set = (p) => C.setState(p);
  const loaded = ctx.loaded;
  const loadingNow = LIVE && !loaded && S.sh_load === 'loading';
  const o = ctx.obj;
  const kindWord = shellKindWord();

  /* sidebar: division picker grouped by unit (today's fillDivSelect: unit order, then "Unassigned") */
  const units = (P.units || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const groups = [];
  if (units.length) {
    units.forEach((u) => {
      const ds = ctx.divs.filter((d) => (d.unitId || null) === u.id);
      if (ds.length) groups.push({ label: u.name || u.id, divs: ds });
    });
    const loose = ctx.divs.filter((d) => !units.some((u) => u.id === (d.unitId || null)));
    if (loose.length) groups.push({ label: 'Unassigned', divs: loose });
  } else if (ctx.divs.length) groups.push({ label: '', divs: ctx.divs });
  const divMenu = groups.map((g) => ({
    label: g.label,
    hasLabel: !!g.label,
    divs: g.divs.map((d) => {
      const on = !ctx.all && !!(ctx.div && d.id === ctx.div.id);
      return { name: d.name || d.id, id: d.id, on: on, cls: on ? 'mi on' : 'mi', pick: () => shellSwitchDivision(C, d.id) };
    })
  }));
  /* Sales: "All divisions" heads the menu (decided October 16) */
  const allItem = APP === 'sales' && ctx.divs.length ? { on: ctx.all, cls: ctx.all ? 'mi on' : 'mi', pick: () => shellSwitchAll(C) } : null;

  /* sidebar: filters (owner-narrowed objectives feed the quarter and product lists, like today) */
  const mine = shellMine(ctx.sideObjs, ctx.f.owner);
  const qOpts = shellQuarters(mine).map((q) => ({ v: q, label: shellQLabel(q) }));
  const pOpts = shellProducts(P, mine).map((id) => ({ v: id, label: shellProductName(P, id) }));
  const fq = { v: ctx.f.quarter, opts: qOpts, on: (e) => shellSetFilter(C, ctx, { quarter: shellVal(e) }) };
  const fp = { v: ctx.f.product, opts: pOpts, off: !pOpts.length, title: pOpts.length ? 'Product' : 'No objective here is classified to a product', on: (e) => shellSetFilter(C, ctx, { product: shellVal(e) }) };
  const fo = { on: !!ctx.f.owner, name: ctx.f.owner ? F.name(ctx.f.owner) : '', clear: () => shellSetFilter(C, ctx, { owner: '' }) };
  const anyFilter = !!(ctx.f.quarter || ctx.f.product || ctx.f.owner);

  /* sidebar: objective list grouped by quarter (dot + score or status); in All divisions, grouped by division
     in the picker's order (scores from each division's own document), with quarter subheadings while every
     quarter shows, and a short note under a division with nothing listed */
  const objGroups = !loaded ? [] : ctx.all ? shellAllGroups(C, ctx) : shellQuarterGroups(ctx.objs).map((g, gi) => ({
    div: '', hasDiv: false, divCls: '',
    label: g.label, hasLabel: true, cls: gi ? 'grp gap' : 'grp',
    objs: g.objs.map((x) => shellObjRow(C, ctx, x, ctx.doc, ctx.em)),
    isEmpty: false, emptyText: ''
  }));

  /* empty states (today's meaning, Calm wording; a view page has its own) */
  const empty = ctx.view ? shellViewEmptyVM(C, ctx) : shellEmptyVM(C, ctx, mine, anyFilter);

  /* tabs */
  const tabs = SHELL_TABS.map((t) => ({
    id: t[0],
    label: t[1],
    cls: ctx.tab === t[0] ? 'tab on' : 'tab',
    cur: ctx.tab === t[0] ? 'page' : undefined,
    pick: () => set({ tab: t[0], menu: '' })
  }));
  const t = {};
  SHELL_TABS.forEach((x) => { t[x[0]] = ctx.tab === x[0]; });

  /* views by direct link: a view page has no sidebar or tabs; its top label stands in for the top bar, and the
     head and panel follow the view (shellHeadVM). The whole app offers "Link to this view" on the four tabs
     that have one */
  const view = ctx.view;
  const full = !view;
  const appName = APP === 'sales' ? 'Sales' : 'Execution';
  const vlRo = !!S.sh_vlRo;
  const canLink = full && loaded && !!o && shellViewOk(ctx.tab);
  const vLink = canLink ? { objective: o.id, view: ctx.tab, ro: vlRo } : null;
  const vlink = {
    show: canLink,
    open: canLink && C.isMenu('shell.vlink'),
    toggle: () => C.toggleMenu('shell.vlink'),
    title: canLink ? 'Link to the ' + shellViewLabel(ctx.tab) + ' view' : '',
    desc: !canLink ? '' : ctx.tab === 'overview'
      ? 'Opens this objective’s Overview on a page of its own: the top label, the objective’s head with its score and pace, then the Overview. No sidebar or tabs.'
      : 'Opens this objective’s ' + shellViewLabel(ctx.tab) + ' on a page of its own: the top label, the objective’s head and a ' + shellViewLabel(ctx.tab) + ' panel, then the tab’s contents. No sidebar or tabs.',
    editOn: vlRo ? 'false' : 'true',
    roOn: vlRo ? 'true' : 'false',
    pickEdit: () => set({ sh_vlRo: false }),
    pickRo: () => set({ sh_vlRo: true }),
    modeHint: vlRo ? 'Nothing on the page can be changed or saved. Filters and expanding rows still work.' : 'Changes made on the page save, the same as here.',
    url: vLink ? shellPageUrl(vLink) : '',
    /* the link in pieces that wrap between parameters, never inside one */
    urlParts: vLink ? shellPageUrl(vLink).split(/(?=&)/).map((t, i) => ({ k: 'u' + i, t: t })) : [],
    copy: () => shellCopy(C, shellAbsUrl(shellPageUrl(vLink))),
    openIt: () => { C.closeMenus(); shellOpenTab(C, vLink); }
  };
  /* a live view page names the view and its objective in the browser tab */
  if (LIVE && view) {
    const title = shellViewLabel(view) + ' – ' + (o ? (o.statement || o.id) : appName);
    if (C._shTitle !== title) { C._shTitle = title; try { document.title = title; } catch (e) { /* no document */ } }
  }
  /* the view page's top label: where the page sits (the view's name last), Read-only or the save state once
     there is something to save, and always the way into the app */
  const vw = view ? {
    label: shellViewLabel(view),
    place: !S.sh_viewMissing,   // a link to an objective that isn't here names no unit or division
    ro: !!S.ro,
    edit: !S.ro && loaded && !!o,
    roTitle: 'Opened with a read-only link: nothing here can be changed or saved',
    openApp: () => shellOpenTab(C, { objective: ctx.objId, tab: ctx.tab, ro: !!S.ro }),
    openTitle: 'Open this objective in ' + appName + ', in a new tab'
  } : null;

  const owners = o ? RD.ownersOf(o) : [];
  const ini = o && o.initiativeId ? (P.initiatives || []).find((i) => i.id === o.initiativeId) : null;
  const top = C.sheet();
  const kindTop = top ? top.kind : '';
  const sv = S.save || {};
  const banner = S.sh_banner ? {
    cls: 'banner ' + F.tone(S.sh_banner.tone === 'bad' ? 'bad' : S.sh_banner.tone === 'warn' ? 'warn' : 'info'),
    text: S.sh_banner.text || '',
    detail: S.sh_banner.detail || '',
    hasDetail: !!S.sh_banner.detail,
    dismiss: () => set({ sh_banner: null })
  } : null;

  return {
    appName: appName,
    isSales: APP === 'sales',
    full: full,
    vw: vw,
    vlink: vlink,
    showHead: full || !!view,   /* every view page has the head and its panel (October 21) */
    kindWord: kindWord,
    pickTitle: APP === 'sales' ? 'Choose a business division' : 'Choose an R&D division',
    me: C.meVM(),
    planLocked: !C.canEditPlan(),
    loaded: loaded,
    notLoaded: !loaded,
    notLoadedText: loadingNow ? 'Loading…' : 'Not loaded.',
    /* the breadcrumb's division: in All divisions, the one the objective on screen is in */
    divName: !loaded ? (loadingNow ? 'Loading…' : 'Not loaded') : ctx.all && !o ? 'All divisions' : ctx.div ? (ctx.div.name || ctx.div.id) : 'No division',
    /* the picker's */
    pickName: loaded && ctx.all ? 'All divisions' : !loaded ? (loadingNow ? 'Loading…' : 'Not loaded') : ctx.div ? (ctx.div.name || ctx.div.id) : 'No division',
    unitName: ctx.unit ? (ctx.unit.name || ctx.unit.id) : '',
    hasUnit: loaded && !!ctx.unit && !(ctx.all && !o),
    allItem: allItem,
    divOpen: C.isMenu('shell.div'),
    toggleDiv: () => C.toggleMenu('shell.div'),
    divMenu: divMenu,
    noDivs: !ctx.divs.length,
    noDivsMenu: APP === 'sales' ? 'No business divisions.' : 'No R&D divisions.',
    fq: fq, fp: fp, fo: fo,
    objGroups: objGroups,
    noObjs: loaded && !ctx.objs.length && !(ctx.all && ctx.divs.length),   // All divisions: each division's note says it
    noObjsText: empty.short,
    empty: empty,
    hasObj: !!o,
    obj: o ? {
      id: o.id,
      name: o.statement || o.id,
      quarter: shellQLabel(o.quarter),
      /* clicking an owner applies the same filter as ?owner= (toggle) */
      owners: owners.map((e) => {
        const on = shellOwnerKey(e) === ctx.f.owner;
        return { initials: F.initials(e), name: F.name(e), email: e, on: on,
          title: on ? 'Show everyone\u2019s objectives' : 'Show only ' + F.name(e) + '\u2019s objectives (' + e + ')',
          filter: () => shellSetFilter(C, ctx, { owner: on ? '' : shellOwnerKey(e) }) };
      }),
      noOwners: !owners.length,
      ownersText: owners.length ? F.people(owners) : 'No owner',
      initiative: ini ? (ini.name || ini.id) : '',
      hasInitiative: !!ini,
      window: o.plannedStart != null && o.plannedEnd != null ? F.dayAuto(o.plannedStart, ctx.today) + ' to ' + F.dayAuto(o.plannedEnd, ctx.today) : '',
      hasWindow: o.plannedStart != null && o.plannedEnd != null
    } : null,
    head: o ? shellHeadVM(C, ctx) : null,
    tabs: tabs,
    t: t,
    crumbQ: o ? shellQLabel(o.quarter) : '',
    roOn: !!S.ro,
    showSave: loaded && !S.ro,
    saving: sv.state === 'saving',
    search: loaded ? shellSearchVM(C, ctx) : null,
    banner: banner,
    /* live: NET's real connection state while something is loaded (a failed load has its own banner);
       "Try again" saves what is pending and checks for changes now instead of at the next 25 s poll */
    offline: !!(S.sim && S.sim.offline) && (!LIVE || loaded),
    goOnline: () => { if (LIVE) NET.poll(C); else shellGoOnline(C, false); },
    hubUrl: SHELL_HUB_URL,
    toPlanning: () => shellHandoffPlanning(C, ctx),
    openSettings: () => C.openSheet('shell.settings', {}, {}),
    sheetKey: (e) => {
      if (!e || e.key !== 'Escape') return;
      if (e.defaultPrevented || (typeof e.isDefaultPrevented === 'function' && e.isDefaultPrevented())) return;
      C.dismissSheet(e);
    },
    settings: kindTop === 'shell.settings' ? shellSettingsVM(C, ctx) : null,
    linkSheet: kindTop === 'shell.link' ? shellLinkVM(C, ctx) : null,
    endSheet: kindTop === 'shell.end' ? shellEndVM(C, ctx) : null
  };
}

/* objectives by quarter, in quarter order ("No quarter" last) */
function shellQuarterGroups(list) {
  const qs = K.uniq(list.map((x) => x.quarter || ''));
  qs.sort((a, b) => (!a ? 1 : !b ? -1 : shellQSort(a, b)));
  return qs.map((q) => ({ label: q ? shellQLabel(q) : 'No quarter', objs: list.filter((x) => (x.quarter || '') === q) }));
}
/* one sidebar row: dot, name, and the score or status (doc and em: the objective's own division's) */
function shellObjRow(C, ctx, x, doc, em) {
  const sc = RD.objectiveScore(x.id, em);
  const end = RD.objectiveEndState(doc.objectiveState, x.id);
  const notStarted = x.plannedStart != null && ctx.today < x.plannedStart;
  let tone = F.band(sc);
  let right = F.score(sc);
  let word = F.bandWord(tone);
  if (end) { tone = end.status === 'achieved' ? 'ok' : 'none'; right = end.status === 'achieved' ? 'Achieved' : 'Abandoned'; word = right; }
  else if (sc == null) { tone = 'none'; right = notStarted ? 'Not started' : 'No score'; word = right; }
  return {
    name: x.statement || x.id,
    right: right,
    title: (x.statement || x.id) + ' (' + (sc != null && !end ? right + ', ' + word.toLowerCase() : word) + ')',
    dotCls: 'dot ' + F.tone(tone),
    cls: x.id === ctx.objId ? 'obj on' : 'obj',
    cur: x.id === ctx.objId ? 'true' : undefined,
    pick: () => shellPickObjective(C, ctx, x)
  };
}
/* Sales' All divisions: a group per division (its name over its first rows), split by quarter while every
   quarter shows; a division with nothing listed gets one short note instead of rows */
function shellAllGroups(C, ctx) {
  const D = C.D;
  const subs = !ctx.f.quarter;
  const out = [];
  ctx.divs.forEach((d, di) => {
    const list = ctx.objs.filter((x) => x.divisionId === d.id);
    const here = d.id === ctx.divId;
    const doc = here ? ctx.doc : (D.docs[shellDocKey(d.id)] || shellBlankDoc());
    const em = here ? ctx.em : RD.withPortfolio(ctx.P, { [d.id]: doc });
    const head = { div: d.name || d.id, hasDiv: true, divCls: di ? 'shl-dgrp gap' : 'shl-dgrp' };
    const none = { div: '', hasDiv: false, divCls: '' };
    if (!list.length) {
      out.push(Object.assign({}, head, { label: '', hasLabel: false, cls: '', objs: [], isEmpty: true, emptyText: shellDivNone(ctx, d.id) }));
      return;
    }
    const parts = subs ? shellQuarterGroups(list) : [{ label: '', objs: list }];
    parts.forEach((g, gi) => out.push(Object.assign({}, gi ? none : head, {
      label: g.label, hasLabel: subs, cls: gi ? 'grp shl-qsub gap' : 'grp shl-qsub',
      objs: g.objs.map((x) => shellObjRow(C, ctx, x, doc, em)),
      isEmpty: false, emptyText: ''
    })));
  });
  return out;
}
/* why a division lists nothing in All divisions */
function shellDivNone(ctx, divId) {
  const own = ctx.sideObjs.filter((x) => x.divisionId === divId);
  if (!own.length) return 'No objectives yet.';
  if (ctx.f.owner && !shellMine(own, ctx.f.owner).length) return 'None owned by ' + F.name(ctx.f.owner) + '.';
  if (ctx.f.quarter && !ctx.f.product) return 'None in ' + shellQLabel(ctx.f.quarter) + '.';
  return 'None match the filters.';
}

function shellEmptyVM(C, ctx, mine, anyFilter) {
  const S = C.state;
  const out = { text: '', short: '', hasAct: false, actLabel: '', act: null, hasPlan: false };
  if (!ctx.loaded && LIVE) return shellLiveEmptyVM(C, S.sh_load, out);
  if (!ctx.loaded) {
    const st = S.sh_load;
    out.short = 'Not loaded.';
    if (st === 'notoken') { out.text = 'Not loaded. Add a broker token in Settings to load.'; out.hasAct = true; out.actLabel = 'Open settings'; out.act = () => C.openSheet('shell.settings', {}, {}); }
    else if (st === 'noportfolio') { out.text = 'Not loaded. There is no portfolio on the broker yet; create it from the Planning app first.'; out.hasAct = true; out.actLabel = 'Try again'; out.act = () => shellLoad(C, C.state.sh_token ? 'ok' : 'notoken', 300); out.hasPlan = true; }
    else { out.text = 'Not loaded. The last load failed; check the token in Settings.'; out.hasAct = true; out.actLabel = 'Try again'; out.act = () => shellLoad(C, C.state.sh_token ? 'ok' : 'notoken', 300); }
    return out;
  }
  if (!ctx.divs.length) { out.text = APP === 'sales' ? 'No business divisions yet. Add one in the Planning app.' : 'No R&D divisions yet. Add one in the Planning app.'; out.short = APP === 'sales' ? 'No business divisions.' : 'No R&D divisions.'; out.hasPlan = true; return out; }
  const all = ctx.all;   // Sales' All divisions: the same states, said of every business division
  if (!ctx.sideObjs.length) {
    out.text = all ? 'No objectives assigned to any business division yet. Create them in the Planning app.' : 'No objectives assigned to this division yet. Create them in the Planning app.';
    out.short = all ? 'No objectives yet.' : 'No objectives in this division yet.'; out.hasPlan = true; return out;
  }
  if (!mine.length) {
    const who = F.name(ctx.f.owner);
    out.text = (all ? 'No objectives in any business division are owned by ' : 'No objectives in this division are owned by ') + who + '.'; out.short = 'None owned by ' + who + '.';
    out.hasAct = true; out.actLabel = 'Clear the owner filter'; out.act = () => shellSetFilter(C, ctx, { owner: '' });
    return out;
  }
  if (!ctx.objs.length) {
    out.text = ctx.f.quarter && !ctx.f.product ? 'No objectives in ' + shellQLabel(ctx.f.quarter) + (all ? ' for any business division' : ' for this division') + '. Pick another quarter in the sidebar.' : 'No objectives match the quarter and product filters.';
    out.short = 'No objectives match these filters.';
    out.hasAct = anyFilter; out.actLabel = 'Clear filters'; out.act = () => shellSetFilter(C, ctx, { quarter: '', product: '' });
  }
  return out;
}
/* a view page: loading, a load that failed (no Settings here: the token comes from the Hub or the link), or a
   link whose objective isn't here; the one thing to do about it */
function shellViewEmptyVM(C, ctx) {
  const S = C.state;
  const app = APP === 'sales' ? 'Sales' : 'Execution';
  const out = { text: '', short: '', hasAct: false, actLabel: '', act: null, hasPlan: false };
  const act = (label, fn) => { out.hasAct = true; out.actLabel = label; out.act = fn; };
  const openApp = () => shellOpenTab(C, { objective: '', tab: 'overview', ro: !!S.ro });
  const retry = () => { if (LIVE) NET.reload(C); else shellLoad(C, 'ok', 300); };
  if (!ctx.loaded) {
    const st = S.sh_load;
    if (st === 'loading') out.text = 'Loading…';
    else if (st === 'notoken' || st === 'badtoken') { out.text = 'Not loaded. ' + SHELL_VIEW_LOAD[st][1]; act('Open ' + app, openApp); }
    else if (st === 'noportfolio') out.text = 'Not loaded. There is no portfolio on the broker yet.';
    else if (st === 'offline') { out.text = 'Not loaded. Couldn’t reach the broker; this page keeps trying.'; act('Try again', retry); }
    else { out.text = 'Not loaded. The last load failed.'; act('Try again', retry); }
    return out;
  }
  const id = S.sh_viewMissing || S.objId || '';
  out.text = id ? 'There is no objective ' + id + ' in ' + app + ', so this view has nothing to show. The link may be out of date.' : 'This view has no objective to show.';
  act('Open ' + app, openApp);
  return out;
}
/* live: what the page says while nothing is loaded from the broker, and the one thing to do about it */
function shellLiveEmptyVM(C, st, out) {
  const settings = () => C.openSheet('shell.settings', {}, {});
  const retry = () => NET.reload(C);
  const act = (label, fn) => { out.hasAct = true; out.actLabel = label; out.act = fn; };
  out.short = 'Not loaded.';
  if (st === 'loading') { out.text = 'Loading…'; out.short = 'Loading…'; }
  else if (st === 'notoken') { out.text = 'Not loaded. No broker token in this browser yet. Open this app from the Hub, or add the token in Settings.'; act('Open settings', settings); }
  else if (st === 'badtoken') { out.text = 'Not loaded. The broker didn’t accept the token; check it in Settings.'; act('Open settings', settings); }
  else if (st === 'noportfolio') { out.text = 'Not loaded. There is no portfolio on the broker yet; create it from the Planning app first.'; act('Try again', retry); out.hasPlan = true; }
  else if (st === 'offline') { out.text = 'Not loaded. Couldn’t reach the broker; this page keeps trying.'; act('Try again', retry); }
  else { out.text = 'Not loaded. The last load failed; check the token in Settings.'; act('Try again', retry); }
  return out;
}

/* ----------------------------------------------------------------- search */
function shellSearchGroups(C, ctx, q) {
  const ql = String(q || '').trim().toLowerCase();
  if (!ql) return [];
  const D = C.D;
  const groups = [];
  const objItems = [];
  shellDivs(D).forEach((d) => {
    shellAllObjs(D, d.id).forEach((o) => {
      const name = o.statement || o.id;
      if (name.toLowerCase().indexOf(ql) < 0 && String(o.id).toLowerCase().indexOf(ql) < 0) return;
      objItems.push({ label: name, sub: (d.name || d.id) + ', ' + shellQLabel(o.quarter) + ', ' + o.id, hasSub: true, go: () => shellOpenObjective(C, o.id) });
    });
  });
  if (objItems.length) groups.push({ label: 'Objectives', items: objItems.slice(0, 6) });
  MOD_ORDER.forEach((n) => {
    const m = MODS[n];
    if (!m || typeof m.search !== 'function') return;
    let res = null;
    try { res = m.search(C, ctx, q); } catch (e) { res = null; }
    if (!Array.isArray(res)) return;
    const items = res.filter((r) => r && typeof r.go === 'function' && r.label != null && r.label !== '').slice(0, 6).map((r) => ({
      label: String(r.label),
      sub: r.sub == null ? '' : String(r.sub),
      hasSub: r.sub != null && r.sub !== '',
      go: () => { C.setState({ q: '', menu: '' }); r.go(); }
    }));
    if (items.length) groups.push({ label: m.searchLabel || SHELL_SEARCH_LABELS[n] || F.cap(n), items: items });
  });
  return groups;
}
/* "Search objectives, key results, KPIs…" naming only the sources that really answer */
const SHELL_SEARCH_WORDS = { kr: 'key results', kpi: 'KPIs', gates: 'stage-gates', kb: 'tiles', fmea: 'risks', step: 'experiments', etb: 'experiments', initm: 'initiative metrics' };
function shellSearchPlaceholder() {
  const words = K.uniq(MOD_ORDER.filter((n) => MODS[n] && typeof MODS[n].search === 'function').map((n) => (n === 'kb' && APP === 'sales' ? 'deals' : SHELL_SEARCH_WORDS[n] || n)));
  return 'Search objectives' + (words.length ? ', ' + words.slice(0, 3).join(', ') + (words.length > 3 ? '\u2026' : '') : '');
}
function shellSearchVM(C, ctx) {
  const raw = C.state.q || '';
  const q = raw.trim();
  const open = !!q && C.isMenu('shell.search');
  const groups = open ? shellSearchGroups(C, ctx, q) : [];
  return {
    q: raw,
    open: open,
    groups: groups,
    none: open && !groups.length,
    noneText: 'Nothing matches “' + q + '”. Try an objective, key result, gate or KPI name.',
    ph: shellSearchPlaceholder(),
    onQ: (e) => { const v = shellVal(e); C.setState({ q: v, menu: v.trim() ? 'shell.search' : '' }); },
    onKey: (e) => {
      if (!e) return;
      if (e.key === 'Escape') { C.setState({ q: '', menu: '' }); return; }
      if (e.key === 'Enter') {
        if (e.preventDefault) e.preventDefault();
        const g = shellSearchGroups(C, C.ctx || ctx, C.state.q || '');
        const first = g.length ? g[0].items[0] : null;
        if (first) first.go();
      }
    },
    clear: () => C.setState({ q: '', menu: '' })
  };
}

/* ------------------------------------------------------------- objective head */
/* ---- views by direct link: the panel's facts by section (October 21; the Overview view keeps the app's five) ---- */
/* a due day in the Kanban board's words: today, tomorrow, yesterday, else the date */
function shellDueWord(day, td) { const n = day - td; return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : F.dayAuto(day, td); }
/* Key results: across the key results, what the table below shows one by one */
function shellKrFacts(C, ctx, fact, krs, krScores, krOn, opc) {
  const o = ctx.obj, em = ctx.em, td = ctx.today;
  const paces = krs.map((k) => RD.keyResultPace(k.id, o, em, td)).filter((p) => p.attainment != null);
  /* ahead as the Key results tab captions it (Ahead of pace, or Target met early): the rounded gap below zero */
  const ahead = paces.filter((p) => p.gap != null && Math.round(p.gap) < 0).length;
  const onPace = paces.filter((p) => p.band === 'on-track').length;
  const behind = paces.filter((p) => p.band !== 'on-track').length;
  const used = paces.length && paces[0].elapsed != null ? Math.round(paces[0].elapsed) : null;
  /* KPIs on the key results, in the KPI table's words (the review table's too): met, on track, near, below,
     no reading. A partial check-in reads by its raw value, as the table does. */
  let P = [];
  try { P = KPI.pool(C, ctx); } catch (e) { P = (ctx.doc.kpis || []); }
  const ks = P.filter((k) => k && k.objectiveId === o.id && k.hostType === 'keyResult');
  const words = {};
  ks.forEach((k) => {
    const pp = RD.kpiScoreParts(k, P, em);
    const rb = F.band(pp.raw);
    const raw = pp.raw == null ? 'no reading' : pp.raw >= 100 || rb === 'ok' ? 'on track' : rb === 'warn' ? 'near' : 'below';
    const complete = !pp.expected || (pp.n || 0) >= pp.expected;
    const w = pp.score == null ? 'no reading' : pp.partial ? raw : (pp.score >= 100 && complete) ? 'met' : raw;
    words[w] = (words[w] || 0) + 1;
  });
  const kpiDetail = ks.length ? ['met', 'on track', 'near', 'below', 'no reading'].filter((w) => words[w]).map((w) => words[w] + ' ' + w).join(', ') : 'None on its key results';
  const kpiTone = !ks.length ? '' : words.below ? 'bad' : words.near ? 'warn' : words.met || words['on track'] ? 'ok' : 'none';
  /* milestone steps: done, and the next one due */
  const steps = [];
  krs.filter((k) => k.trackingType === 'milestone').forEach((k) => (k.steps || []).forEach((x) => steps.push(x)));
  const done = steps.filter((x) => Number(x.completion) >= 100).length;
  const dueOf = (x) => { const d = typeof x.due === 'number' ? x.due : (x.due ? F.fromIso(String(x.due).slice(0, 10)) : null); return d == null || !isFinite(d) ? null : d; };
  const next = steps.filter((x) => Number(x.completion) < 100 && dueOf(x) != null).sort((a, b) => dueOf(a) - dueOf(b))[0] || null;
  const stepDetail = !steps.length ? 'No milestone key results' : next ? 'Next: ' + (next.name || 'unnamed step') + ', due ' + shellDueWord(dueOf(next), td) : 'All done';
  return [
    fact('krs', 'Key results', String(krs.length), '', krs.length ? krOn + ' on track by score' + (opc ? ', ' + opc + ' partial' : '') : 'No key results yet'),
    fact('pace', 'On pace', paces.length ? onPace + ' of ' + paces.length : '—', paces.length ? (behind ? 'warn' : 'ok') : 'none',
      paces.length ? (ahead ? ahead + ' ahead' : 'None ahead') + (used != null ? ', ' + used + '% of the time used' : '') : 'No scores yet'),
    fact('kpis', 'KPIs', String(ks.length), kpiTone, kpiDetail),
    fact('steps', 'Milestone steps', steps.length ? done + ' of ' + steps.length : '—', '', stepDetail)
  ];
}
/* Stage-gates: the gate facts of the five, and the next gate in place of the key results */
function shellGateFacts(C, ctx, fact, gates, gPass, gOver, gh, ghDetail, schedFact, riskFact) {
  const doc = ctx.doc, em = ctx.em, td = ctx.today;
  const open = gates.filter((g) => g.actualDate == null && g.plannedDate != null).sort((a, b) => a.plannedDate - b.plannedDate);
  const next = open[0] || null;
  let nextFact;
  if (!next) nextFact = fact('next', 'Next gate', gates.length ? 'None' : '—', gates.length ? 'ok' : 'none', gates.length ? 'Every gate is passed' : 'No stage-gates yet');
  else {
    const lab = typeof GATES !== 'undefined' && GATES ? GATES.label(doc, next.id) : next.id;
    const late = next.plannedDate < td;
    const rdy = RD.stageGateScore(next.id, em);
    nextFact = fact('next', 'Next gate', lab, late ? 'bad' : '', (next.name || 'Unnamed gate') + ', ' + (late ? F.plural(td - next.plannedDate, 'day') + ' late' : 'due ' + shellDueWord(next.plannedDate, td)) + (rdy != null ? ', ' + Math.round(rdy) + '% ready' : ''));
  }
  return [
    fact('gates', 'Stage-gates', String(gates.length), '', gPass + ' passed, ' + gOver + ' overdue'),
    fact('health', 'Gate health', gh == null ? '—' : Math.round(gh) + '%', gh == null ? 'none' : F.band(gh), ghDetail),
    nextFact,
    schedFact,
    riskFact
  ];
}
/* Kanban: when the work is due, which the board's own line (tiles by status) doesn't say */
function shellKanbanFacts(C, ctx, fact) {
  const doc = ctx.doc, td = ctx.today, tIso = F.iso(td), o = ctx.obj;
  const boards = (doc.boards || []).filter((b) => b && b.objectiveId === o.id);
  let total = 0, finished = 0, backlog = 0, overdue = 0;
  let worst = null, next = null;
  const deadlines = {};
  boards.forEach((b) => {
    const cols = b.columns || [];
    const laneById = {};
    (b.swimlanes || []).forEach((l) => { laneById[l.id] = l; });
    (b.tiles || []).forEach((t) => {
      if (!t) return;
      total++;
      if (RD.tileInBacklog(t)) { backlog++; return; }
      const ci = cols.findIndex((c) => c.id === t.col);
      if (ci < 0) return;
      if (ci === cols.length - 1) { finished++; return; }
      const lane = laneById[t.lane];
      const dts = RD.gateDueDates(cols, lane, t);
      const due = dts && dts.due && dts.due[ci] ? F.fromIso(String(dts.due[ci]).slice(0, 10)) : null;
      const stage = cols[ci].name || 'its stage';
      if (RD.gateTileState(b, t, ci, tIso) === 'overdue') {
        overdue++;
        if (due != null && (!worst || due < worst.due)) worst = { t: t, due: due, stage: stage };
      } else if (due != null && due >= td && (!next || due < next.due)) next = { t: t, due: due, stage: stage };
      if (lane && lane.deadline) { const dl = F.fromIso(String(lane.deadline).slice(0, 10)); if (dl != null) (deadlines[dl] = deadlines[dl] || []).push(lane.name || lane.id); }
    });
  });
  const dl = Object.keys(deadlines).map(Number).sort((a, b) => a - b).find((d) => d >= td);
  const lanes = dl != null ? K.uniq(deadlines[dl]) : [];
  return [
    fact('tiles', 'Tiles', String(total), '', total ? finished + ' finished' + (backlog ? ', ' + backlog + ' in the backlog' : '') : boards.length ? 'No tiles yet' : 'No kanban board yet'),
    fact('overdue', 'Stages overdue', String(overdue), overdue ? 'bad' : total ? 'ok' : 'none', worst ? (overdue > 1 ? 'Worst: ' : '') + (worst.t.name || 'Unnamed tile') + ', ' + F.plural(td - worst.due, 'day') + ' late in ' + worst.stage : total ? 'Every tile within its stage dates' : 'No tiles yet'),
    fact('nextdue', 'Next stage due', next ? F.cap(shellDueWord(next.due, td)) : '—', '', next ? (next.t.name || 'Unnamed tile') + ', ' + next.stage : 'Nothing due'),
    fact('deadline', 'Swimlane deadline', dl != null ? F.cap(shellDueWord(dl, td)) : '—', '', dl != null ? F.list(lanes) + (dl - td > 1 ? ', ' + F.rel(dl, td) : '') : 'No swimlane deadlines')
  ];
}

function shellHeadVM(C, ctx) {
  const o = ctx.obj, doc = ctx.doc, em = ctx.em, td = ctx.today, ro = ctx.ro;
  const id = o.id;
  const set = (p) => C.setState(p);

  /* numbers: exactly today's objMetricStrip() */
  const sc = RD.objectiveScore(id, em);
  const tone = F.band(sc);
  const opc = RD.objectivePartialCount(id, em);
  const raw = opc ? RD.objectiveScore(id, em, true) : null;
  const krs = (doc.keyResults || []).filter((r) => r.objectiveId === id);
  const krScores = krs.map((k) => RD.keyResultScore(k.id, em));
  const krOn = krScores.filter((s) => RD.band(s) === 'on-track').length;
  const gates = (doc.stageGates || []).filter((g) => g.objectiveId === id);
  const gSt = gates.map((g) => RD.classifyGate(g, td));
  const gPass = gSt.filter((s) => s === 'passed' || s === 'passed-late').length;
  const gOver = gSt.filter((s) => s === 'overdue').length;
  const gh = RD.objectiveGateReadiness(id, em, td);
  const nSets = (doc.stageGateSets || []).filter((x) => x.objectiveId === id).length;
  let workEnd = null, slip = null, accel = 0;
  const casc = ctx.casc();
  if (casc) {
    workEnd = casc.objectiveWorkForecast[id];
    slip = casc.objectiveScheduleSlip[id];
    accel = casc.objectiveAcceleration[id] || 0;
  }
  if (workEnd === undefined) workEnd = null;
  if (slip === undefined) slip = null;
  const es = ctx.end;
  /* a plan revision (Execution's plan v2 and up, Sales' revised plan) takes in the delays known that day: the
     schedule counts only what slips after it (RD.cascade) */
  const rev = es ? null : RD.planRevision(doc, id);
  const alarm = !es && slip != null && slip > SHELL_SLIP_ALARM;
  const over = es && es.endedDay != null && o.plannedEnd != null ? es.endedDay - o.plannedEnd : null;
  const roll = RD.fmeaRollup(RD.fmeaProblemsFor(doc, id), (gid) => shellGatePassed(doc, gid, td));

  /* quarter strip: 13 weeks of the quarter, otherwise the planned window, otherwise the label */
  const q = shellParseQ(o.quarter);
  let strip;
  const hasWin = o.plannedStart != null && o.plannedEnd != null;
  if (q) {
    const wk = Math.max(1, Math.min(13, Math.floor((td - q.start) / 7) + 1));
    const inQ = td >= q.start && td <= q.end;
    const done = td > q.end;
    const cells = [];
    for (let i = 1; i <= 13; i++) cells.push({ cls: 'shl-qc' + (done || i < wk ? ' done' : '') + (inQ && i === wk ? ' now' : '') });
    const status = inQ ? 'Week ' + wk + ' of 13' : (td < q.start ? 'Upcoming' : 'Complete');
    strip = { label: q.label, range: F.dayAuto(q.start, td) + ' to ' + F.dayAuto(q.end, td), hasRange: true, weeks: true, cells: cells, window: false, fill: '', status: status, aria: q.label + ': ' + status };
  } else if (hasWin) {
    const span = Math.max(1, o.plannedEnd - o.plannedStart);
    const el = Math.max(0, Math.min(span, td - o.plannedStart));
    const pct = Math.round(el / span * 100);
    strip = { label: o.quarter || 'Planned window', range: F.dayAuto(o.plannedStart, td) + ' to ' + F.dayAuto(o.plannedEnd, td), hasRange: true, weeks: false, cells: [], window: true, fill: 'width: ' + pct + '%', status: pct + '% elapsed', aria: '' };
  } else {
    strip = { label: o.quarter || 'No quarter', range: '', hasRange: false, weeks: false, cells: [], window: false, fill: '', status: '', aria: '' };
  }

  /* score and pace against time elapsed (planned window) */
  const scoreW = sc == null ? 0 : Math.max(0, Math.min(100, Math.round(sc)));
  const hatch = sc != null && raw != null && raw > sc;
  const hl = hatch ? Math.max(0, Math.min(100, sc)) : 0;
  const hr = hatch ? Math.max(0, Math.min(100, raw)) : 0;
  let pace = null;
  if (hasWin) {
    const span = Math.max(1, o.plannedEnd - o.plannedStart);
    const at = es && es.endedDay != null ? es.endedDay : td;
    const pct = Math.max(0, Math.min(span, at - o.plannedStart)) / span * 100;
    let label;
    if (es) label = 'Ended ' + F.dayAuto(es.endedDay, td);
    else if (td < o.plannedStart) label = 'Starts in ' + F.plural(o.plannedStart - td, 'day');
    else if (pct >= 100) label = 'Time is up';
    else label = 'Today, ' + Math.round(pct) + '% of the time used';
    /* near the right end the label hangs left from the tick: anchored by `right`, because at left: 100% an
       absolutely placed label has no room and shrinks to nothing, so translateX(-100%) would not move it */
    const place = pct < 18 ? 'left: ' + pct.toFixed(1) + '%; transform: translateX(-6px)' : pct > 82 ? 'right: ' + (100 - pct).toFixed(1) + '%; transform: translateX(6px)' : 'left: ' + pct.toFixed(1) + '%; transform: translateX(-50%)';
    pace = { label: label, labelStyle: place, tickStyle: 'left: ' + pct.toFixed(1) + '%', start: F.dayAuto(o.plannedStart, td), end: F.dayAuto(o.plannedEnd, td), pct: Math.round(pct) };
  }
  const score = {
    big: F.score(sc),
    word: sc == null ? 'No score yet' : F.bandWord(tone),
    cls: 'st ' + F.tone(tone),
    sub: sc == null ? (krs.length ? 'None of its ' + F.plural(krs.length, 'key result') + ' has a score yet' : 'No key results yet, so no score') : 'Mean of ' + F.plural(krs.length, 'key result'),
    partial: !!opc && raw != null,
    partialText: raw != null ? 'Partial check-in, ' + Math.round(raw) + ' without discount' : '',
    fillCls: 'fill ' + F.tone(tone),
    fillStyle: 'width: ' + scoreW + '%',
    hasHatch: hatch,
    hatchCls: 'hatch ' + F.tone(tone),
    hatchStyle: hatch ? 'left: ' + hl + '%; width: ' + (hr - hl) + '%' : '',
    hasPace: !!pace,
    todayLabel: pace ? pace.label : '',
    todayStyle: pace ? pace.labelStyle : '',
    tickStyle: pace ? pace.tickStyle : '',
    start: pace ? pace.start : '',
    end: pace ? pace.end : '',
    aria: 'Score ' + F.score(sc) + ' of 100' + (pace ? ', ' + (es ? pace.label.toLowerCase() : pace.pct + '% of the planned time used') : '')
  };

  /* facts strip (today's five other metric cards) */
  const fact = (k, label, value, tn, detail, extra) => ({
    k: 'fact-' + k, label: label, value: value,
    vcls: 'shl-fv' + (tn ? ' ' + F.tone(tn) + ' tx-' + tn : ''), dot: !!tn,
    detail: detail || '', extra: extra || '', hasExtra: !!extra, extraCls: 'sub tx-ok'
  });
  let ghDetail;
  if (gh == null) ghDetail = nSets ? F.plural(nSets, 'workstream') + ', no stage-gates yet' : 'No workstreams yet';
  else ghDetail = F.bandWord(F.band(gh)) + ', ' + (nSets === 1 ? '1 workstream' : 'weakest of ' + nSets + ' workstreams');
  let schedFact;
  if (es) {
    schedFact = fact('schedule', 'Schedule', es.status === 'abandoned' ? 'Abandoned' : 'Achieved', es.status === 'abandoned' ? 'none' : 'ok',
      'Ended ' + F.dayY(es.endedDay) + (over != null && over > 0 ? ', was ' + F.plural(over, 'day') + ' over at close' : ''));
  } else {
    const stn = slip != null && slip > 0 ? 'bad' : slip === 0 ? 'ok' : 'none';
    const sub = slip == null ? (o.plannedEnd == null ? 'no planned end' : '') : slip > 0 ? F.plural(slip, 'day') + ' behind schedule' : 'on schedule';
    const det = (o.plannedEnd != null ? 'Planned ' + F.dayAuto(o.plannedEnd, td) + (sub ? ', ' + sub : '') : F.cap(sub));
    schedFact = fact('schedule', 'Schedule', workEnd != null ? F.dayAuto(workEnd, td) : '—', stn, det,
      accel > 0 ? F.plural(accel, 'day') + ' of acceleration possible' : '');
  }
  const riskTone = roll.openHigh > 0 ? 'bad' : roll.openMed > 0 ? 'warn' : roll.total ? 'ok' : 'none';
  const facts = [
    fact('krs', 'Key results', String(krs.length), '', krOn + ' on track' + (opc ? ', ' + opc + ' partial' : '')),
    fact('gates', 'Stage-gates', String(gates.length), '', gPass + ' passed, ' + gOver + ' overdue'),
    fact('health', 'Gate health', gh == null ? '—' : Math.round(gh) + '%', gh == null ? 'none' : F.band(gh), ghDetail),
    schedFact,
    fact('risk', 'Open high risk', String(roll.openHigh), riskTone, roll.total ? F.plural(roll.total, 'problem') + ', worst RPN ' + roll.worst : 'No FMEA items')
  ];

  /* No "Key-result signal" bars since October 15: the Overview's review table (mods/review) shows each key
     result's score, band and bar, so the head stopped repeating them. */

  /* views by direct link (October 21): a view page's panel gives its section's facts; the Overview view (and the
     app itself) keep the five above. The schedule note shows on Overview and Stage-gates; End objective and
     Reopen on Overview. */
  const view = ctx.view || '';
  const onOverview = !view || view === 'overview';
  let viewFacts = facts;
  if (view === 'krs') viewFacts = shellKrFacts(C, ctx, fact, krs, krScores, krOn, opc);
  else if (view === 'gates') viewFacts = shellGateFacts(C, ctx, fact, gates, gPass, gOver, gh, ghDetail, schedFact, facts[4]);
  else if (view === 'kanban') viewFacts = shellKanbanFacts(C, ctx, fact);
  const noteHere = onOverview || view === 'gates';

  /* ended state */
  const endWord = es ? (es.status === 'abandoned' ? 'Abandoned' : 'Achieved') + ' ' + F.dayY(es.endedDay) : '';
  const key = ctx.docKey;
  return {
    canEnd: !es && !ro && onOverview,
    openEnd: () => { if (!C.guard()) return; C.openSheet('shell.end', { objId: id }, { status: 'abandoned', date: F.iso(C.today()), note: '' }); },
    ended: !!es,
    endCls: 'note shl-ended ' + (es && es.status === 'achieved' ? 't-ok' : ''),
    endSt: 'st ' + F.tone(es && es.status === 'achieved' ? 'ok' : 'none'),
    endWord: endWord,
    endNote: es && es.note ? es.note : '',
    hasEndNote: !!(es && es.note),
    endHint: 'The schedule is frozen and unfinished stage-gates show as cancelled.',
    canReopen: !!es && !ro && onOverview,
    reopen: () => C.mutate((D) => { const d = D.docs[key]; d.objectiveState = (d.objectiveState || []).filter((r) => r.objectiveId !== id); }, { msg: 'Objective reopened.' }),
    strip: strip,
    score: score,
    facts: viewFacts,
    alarm: alarm,
    planActive: !!rev && !alarm,
    /* today's cuBtn: the alarm (slip over 10 days) wins; otherwise the plan revision in force */
    sched: !noteHere ? null : alarm ? {
      k: 'alarm', cls: 'note t-bad shl-notes', warn: true,
      text: F.plural(slip || 0, 'day') + ' behind schedule, past the ' + SHELL_SLIP_ALARM + '-day alarm.',
      btn: 'Build revised plan', btnCls: 'btn sm danger'
    } : rev ? {
      k: 'plan-active', cls: 'note shl-notes', warn: false,
      text: (rev.v ? 'Revised plan v' + rev.v : 'Revised plan') + ' active since ' + F.dayAuto(rev.day, td) + '. Delays before it are part of the plan; only new slips count.',
      btn: 'Revise', btnCls: 'btn sm'
    } : null,
    canRevise: !ro,
    revise: () => shellOpenRevise(C, ctx)
  };
}

/* ------------------------------------------------------------- End objective */
function shellEndVM(C, ctx) {
  const top = C.sheet();
  if (!top || top.kind !== 'shell.end') return null;
  const d = top.d || {};
  const objId = top.data && top.data.objId;
  const o = (ctx.P.objectives || []).find((x) => x.id === objId) || null;
  const open = (ctx.doc.stageGates || []).filter((g) => g.objectiveId === objId && g.actualDate == null).length;
  const key = ctx.docKey;
  const opts = [
    ['abandoned', 'Abandoned', 'Work stopped. The remaining gates are cancelled.'],
    ['achieved', 'Achieved', 'Goals met. The remaining gates are moot.']
  ].map((x) => {
    const on = (d.status || 'abandoned') === x[0];
    return { label: x[1], desc: x[2], on: on, cls: 'shl-opt' + (on ? ' on' : ''), pick: () => C.setDraft({ status: x[0] }) };
  });
  return {
    name: o ? (o.statement || o.id) : objId || '',
    openText: open > 0 ? F.plural(open, 'unfinished stage-gate') + ' will show as cancelled.' : '',
    hasOpen: open > 0,
    opts: opts,
    date: d.date || '',
    onDate: C.bindDraft('date'),
    note: d.note || '',
    onNote: C.bindDraft('note'),
    save: () => {
      const cur = C.draft() || {};
      const status = cur.status === 'achieved' ? 'achieved' : 'abandoned';
      const rawDate = String(cur.date || '').trim();
      let day = C.today();
      if (rawDate) {
        const v = F.fromIso(rawDate);
        if (v == null) { C.sheetErr('Use a date like ' + F.iso(C.today()) + ', or leave it empty for today.'); return; }
        day = v;
      }
      const note = String(cur.note || '').trim();
      const ok = C.mutate((D) => {
        const doc = D.docs[key];
        doc.objectiveState = (doc.objectiveState || []).filter((r) => r.objectiveId !== objId);
        doc.objectiveState.push({ objectiveId: objId, status: status, endedDay: day, note: note });
      }, { msg: 'Objective ended — ' + status + '.' });
      if (ok) C.closeSheet();
    }
  };
}

/* ------------------------------------------------------------- Settings sheet */
function shellSettingsVM(C, ctx) {
  const S = C.state;
  const D = C.D;
  const set = (p) => C.setState(p);
  const sim = S.sim || {};
  const pending = !!(S.save && S.save.pending);
  const net = LIVE ? NET.info(C) : null;
  const roByLink = LIVE && !!(C.net && C.net.url && Object.prototype.hasOwnProperty.call(C.net.url, 'readonly'));
  let sysDark = false;
  try { sysDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { sysDark = false; }
  const theme = S.theme || 'system';
  return {
    themes: [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']].map((x) => ({
      label: x[1],
      on: theme === x[0] ? 'true' : 'false',
      pick: () => { set({ theme: x[0] }); shellStore('rd_theme', x[0]); }
    })),
    themeHint: theme === 'system' ? 'Follows your system setting (' + (sysDark ? 'dark' : 'light') + ' right now). Saved in this browser and shared across the R&D suite.' : 'Saved in this browser and shared across the R&D suite. Choose Match system to follow your system setting.',
    tokenDraft: S.sh_tokenDraft || '',
    onToken: (e) => set({ sh_tokenDraft: shellVal(e) }),
    tokenKey: (e) => { if (e && e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); shellSaveToken(C); } },
    saveToken: () => shellSaveToken(C),
    tokenState: LIVE ? (net.hasToken ? 'A token is saved in this browser.' : 'No token saved. Nothing loads or saves until you add one.') : S.sh_token ? 'A token is saved in this browser.' : 'No token saved. The app shows empty scratch and saves nothing.',
    tokenCls: (LIVE ? net.hasToken : S.sh_token) ? 'sub' : 'sub tx-warn',
    net: LIVE ? shellNetVM(C, net) : null,
    reload: () => { if (LIVE) shellReloadLive(C); else shellLoad(C, C.state.sh_token ? 'ok' : 'notoken', 300); },
    /* the sample's simulations (load failures, sync, sample data); live builds have none of them */
    simFail: LIVE ? null : () => shellLoad(C, 'fail', 300),
    simNoPortfolio: LIVE ? null : () => shellLoad(C, 'noportfolio', 300),
    roOn: !!S.ro,
    /* live: a page opened with ?readonly stays read-only, as today (its RO is fixed for the page) */
    roLocked: roByLink,
    roHint: roByLink ? 'This page was opened with ?readonly, so it stays read-only. Open it without ?readonly to edit.' : 'The view a link with ?readonly opens: nothing saves and editing controls are hidden.',
    toggleRo: (e) => { if (!roByLink) set({ ro: shellChecked(e, !C.state.ro) }); },
    /* starts as the link to what is on screen now (division, objective, filters, read-only); a quarter the
       page picked by itself (the current one) stays out, so the link opens on the reader's current quarter,
       and so does the division in All divisions, which a link without ?division= opens on */
    openLink: () => C.pushSheet('shell.link', {}, { division: ctx.all ? '' : ctx.divId || '', quarter: shellQuarterAuto(C) ? '' : (ctx.f.quarter || ''), product: ctx.f.product || '', objective: ctx.objId || '', owner: ctx.f.owner || '', view: ctx.view || '', readonly: !!C.state.ro, token: '' }),
    sync: LIVE ? null : {
      offline: !!sim.offline,
      cls: 'st ' + (sim.offline ? 't-warn' : 't-ok'),
      word: sim.offline ? 'Offline' : 'Connected',
      text: sim.offline ? (pending ? 'Your changes are kept here and save when you are back online.' : 'Changes you make are kept here until you are back online.') : 'Changes save 0.7 seconds after your last edit, or within 2.5 seconds while you keep editing.',
      goOffline: () => shellGoOffline(C),
      goOnline: () => shellGoOnline(C, false),
      conflict: () => shellGoOnline(C, true),
      noPending: !pending,
      conflictHint: sim.offline ? (pending ? 'Coming back after a teammate saved the same document is a save conflict: their version wins and your offline changes are discarded.' : 'Make a change while offline to see what a save conflict does to it.') : 'A save conflict happens when a teammate saves the same document while you have an unsaved change. Go offline and make a change to try it.',
      teammate: () => shellTeammate(C),
      last: S.sh_team || '',
      hasLast: !!S.sh_team
    },
    hub: Object.assign(C.viewerVM(), {
      hint: LIVE
        ? C.viewerVM().hint + ' ' + (sim.hub ? 'Kanban Done-column choices follow you to any device.' : 'Done-column choices are kept in this browser only.')
        : (C._hub ? C.viewerVM().hint + ' ' : '') + (sim.hub ? 'Kanban Done-column choices follow you to any device.' : 'Not signed in, or inside a Confluence embed where the Hub sign-in is not visible. Done-column choices are kept in this browser only.'),
      planNote: C.canEditPlan() ? 'You can change the plan in Planning.' : 'Planning is view only for you: the plan is changed by the CTO and CEO' + (C.planEditorsText() ? ' (' + C.planEditorsText() + ')' : '') + '.'
    }),
    recover: APP === 'sales' ? shellRecoverVM(C, ctx) : null,
    build: LIVE ? 'Build: ' + NET.CLIENT + ' (' + (APP === 'sales' ? 'Sales' : 'Execution') + ').' : 'Build: ' + SHELL_BUILD + ' (' + (APP === 'sales' ? 'Sales' : 'Execution') + ' board, sample data of ' + F.dayY(D.today) + ').',
    reset: LIVE ? null : () => C.confirm({ title: 'Restore the sample data?', body: 'Every change you made in this prototype is discarded.', ok: 'Restore', danger: true, onOk: () => { C._shSrv = null; C.resetData(); } })
  };
}
/* live: the broker connection in Settings, from NET.info (never the token itself) */
const SHELL_NET_WHY = {
  loading: 'Loading from the broker…',
  notoken: 'No token in this browser yet: open this app from the Hub, or paste the token here.',
  badtoken: 'The broker didn’t accept the token.',
  noportfolio: 'There is no portfolio on the broker yet.',
  offline: 'Couldn’t reach the broker; this page keeps trying.',
  fail: 'The last load failed.'
};
/* "Load from the broker": NET saves what is pending first and never reloads over unsaved changes; offline
   they can't be saved yet, so say so instead of trying */
function shellReloadLive(C) {
  const i = NET.info(C);
  if (i.loaded && i.offline && i.pending) {
    C.toast('You are offline with unsaved changes in ' + F.plural(i.pending, 'document') + '. They save when the connection returns; load again after that.', 'info');
    return;
  }
  NET.reload(C);
}
function shellNetVM(C, i) {
  const pend = i.pending ? 'Unsaved changes in ' + F.plural(i.pending, 'document') + '.' : 'No unsaved changes.';
  const last = 'Last loaded ' + F.ago(i.lastLoad, C.now()) + '.';
  if (!i.loaded) {
    return { cls: 'st ' + (i.phase === 'loading' ? 't-info' : 't-warn'), word: i.phase === 'loading' ? 'Loading' : 'Not loaded', text: SHELL_NET_WHY[i.phase] || SHELL_NET_WHY.fail };
  }
  if (i.offline) return { cls: 'st t-warn', word: 'Offline', text: last + ' ' + pend + ' Changes are kept here and save when the connection returns.' };
  return { cls: 'st t-ok', word: 'Connected', text: last + ' ' + pend + ' Changes save 0.7 seconds after your last edit, or within 2.5 seconds while you keep editing.' };
}
function shellRecoverVM(C, ctx) {
  const R = C.state.sh_recover || null;
  const phase = R ? R.phase : '';
  const rows = R && R.rows ? R.rows : [];
  /* All divisions: every business division is scanned, and each objective's data goes to its own division */
  const all = R ? R.divId === '*' : !!ctx.all;
  /* live: what happened to each objective (the sample moves them all in one save) */
  const results = phase === 'done' && R.results ? R.results.map((x) => ({
    name: shellObjName(C.D, x.objId),
    text: x.state === 'ok' ? 'Recovered from ' + x.srcName + '.'
      : x.state === 'both' ? 'Moved ' + (all && x.dstName ? 'to ' + x.dstName : 'here') + ', but still in ' + x.srcName + ' (' + x.why + '): scan again to tidy up.'
        : x.state === 'none' ? 'Nothing left to move in ' + x.srcName + '.'
          : 'Not moved (' + x.why + '). Reopen to retry.',
    cls: x.state === 'ok' ? 'okn' : x.state === 'failed' ? 'err' : 'sub tx-warn'
  })) : [];
  return {
    intro: all
      ? 'If an objective was moved from one business division to another, its key results, KPIs, stage-gates, tasks, boards and logic tree may still live in the old division\'s document. This scans every business division and moves any stranded execution data to the division its objective belongs to now.'
      : 'If an objective was moved to this division from another, its key results, KPIs, stage-gates, tasks, boards and logic tree may still live in the old division\'s document. This scans the other business divisions and moves any stranded execution data for this division\'s objectives here.',
    hasResults: results.length > 0,
    results: results,
    busy: phase === 'scanning' || phase === 'moving',
    scanLabel: phase === 'scanning' ? 'Scanning…' : 'Recover stranded execution data',
    scan: () => shellRecoverScan(C),
    hasMsg: !!(R && R.msg),
    msg: R ? R.msg || '' : '',
    msgCls: R && R.tone === 'ok' ? 'okn' : R && R.tone === 'bad' ? 'err' : R && R.tone === 'warn' ? 'sub tx-warn' : 'sub',
    hasRows: rows.length > 0 && (phase === 'report' || phase === 'moving'),
    rows: rows.map((p) => ({ name: shellObjName(C.D, p.objId), text: shellStrandedText(p) + (all && p.dstName ? '; it moves to ' + p.dstName : '') })),
    canMove: !ctx.ro,
    roBlocked: !!ctx.ro,
    moving: phase === 'moving',
    moveLabel: phase === 'moving' ? 'Moving…' : all ? 'Move it all' : 'Move it all here',
    move: () => shellRecoverMove(C),
    cancel: () => C.setState({ sh_recover: null })
  };
}

/* ----------------------------------------------------------- Open a link sheet */
function shellLinkVM(C, ctx) {
  const top = C.sheet();
  if (!top || top.kind !== 'shell.link') return null;
  const d = top.d || {};
  const P = ctx.P;
  const kind = shellKind();
  const unitOrder = {};
  (P.units || []).forEach((u, i) => { unitOrder[u.id] = u.order == null ? i : u.order; });
  const allDivs = (P.divisions || []).slice().sort((a, b) => ((unitOrder[a.unitId] != null ? unitOrder[a.unitId] : 1e6) - (unitOrder[b.unitId] != null ? unitOrder[b.unitId] : 1e6)) || K.byOrder(a, b));
  const divOpts = [{ v: '', label: APP === 'sales' ? 'All divisions (not in the link)' : 'Not in the link' }].concat(allDivs.map((x) => {
    const k = RD.divisionKind(x);
    return { v: x.id, label: (x.name || x.id) + ' (' + x.id + ')' + (k === kind ? '' : ', a ' + (k === 'biz' ? 'business' : 'R&D') + ' division') };
  }));
  const qs = K.uniq((P.objectives || []).map((o) => o.quarter).filter(Boolean)).sort(shellQSort);
  const quarterOpts = [{ v: '', label: 'Not in the link' }, { v: 'active', label: 'active (the current quarter, ' + shellQLabel(F.qOfDay(ctx.today)) + ')' }].concat(qs.map((q) => ({ v: q, label: shellQLabel(q) })));
  const prodOpts = [{ v: '', label: 'Not in the link' }].concat((P.products || []).map((p) => ({ v: p.id, label: (p.name || p.id) + ' (' + p.id + ')' })));
  const other = (P.objectives || []).find((o) => o.divisionId !== ctx.divId && ctx.divs.some((x) => x.id === o.divisionId)) || (P.objectives || [])[0];
  const draft = { division: d.division || '', quarter: d.quarter || '', product: d.product || '', objective: d.objective || '', owner: d.owner || '', view: shellViewOk(d.view) ? d.view : '', readonly: !!d.readonly, token: d.token || '' };
  const url = shellLinkUrl(draft);
  const viewOpts = [{ v: '', label: 'The whole app' }].concat(SHELL_VIEWS.map((x) => ({ v: x[0], label: x[1] + ' view, on its own' })));
  return {
    d: draft,
    viewOpts: viewOpts,
    onView: C.bindDraft('view'),
    viewHint: !draft.view ? 'A view shows one objective on a page of its own, without the sidebar or tabs.' : draft.objective ? (draft.view === 'overview' ? 'The top label, the objective’s head with its score and pace, then its Overview.' : 'The top label, the objective’s head and a ' + shellViewLabel(draft.view) + ' panel, then the tab’s contents.') : 'A view needs an objective. Without one the link opens the whole app.',
    viewHintCls: draft.view && !draft.objective ? 'hint tx-warn' : 'hint',
    divOpts: divOpts,
    quarterOpts: quarterOpts,
    prodOpts: prodOpts,
    objPh: other ? other.id : 'OBJ-…',
    onDivision: C.bindDraft('division'),
    onQuarter: C.bindDraft('quarter'),
    onProduct: C.bindDraft('product'),
    onObjective: C.bindDraft('objective'),
    onOwner: C.bindDraft('owner'),
    onToken: C.bindDraft('token'),
    onReadonly: C.bindDraftCheck('readonly'),
    clear: () => C.setDraft({ division: '', quarter: '', product: '', objective: '', owner: '', view: '', readonly: false, token: '' }),
    url: url,
    activeQ: shellQLabel(F.qOfDay(ctx.today)),
    copy: () => shellCopy(C, shellLinkUrl(Object.assign({}, C.draft()))),
    open: () => { if (LIVE) shellOpenLink(C, shellLinkUrl(Object.assign({}, C.draft()))); else shellApplyLink(C, Object.assign({}, C.draft())); }
  };
}
