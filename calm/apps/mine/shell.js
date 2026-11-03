/* ============================================================================
   My Projects (APP = 'mine'). One page for everything that is yours, as one tree: project, objective, its key
   results, stage-gates, kanban, risks and experiments, down to the KPIs, targets, milestone steps and key reads,
   with check-ins the way Execution takes them (click the current value, type, Enter posts). Round 4 of the
   "My Projects" canvas (boards J, K1 and K2), decided October 20, 2026.

   Who sees what
     Yours: in an objective you own or co-own, all of it; in someone else's, only what is assigned to you (the
       experiments you run, the kanban tiles you hold). Owners and assignees are matched to the roster by email,
       or on older records by name, first name or initials when that names one person (MP-1).
     An IC has one view, just theirs. A lead (orgRole 'lead' and divisions they lead: roster leadDivisions,
       leadUnits or a legacy leadOf, the rule pulled KPIs use, PULL.isLeader), the CTO and the CEO choose Owned
       Projects (the same rule applied to them) or Team Projects (every objective in the divisions they lead). The
       choice is remembered in this browser (rd_mine_view); until then the page opens on Owned Projects, or on Team
       Projects when nothing from this quarter on is theirs.
     The CEO's and CTO's Team Projects covers the divisions each of them chooses in Settings (October 22): the R&D
       divisions (the CTO's default), the business divisions (the CEO's default), every division, or divisions picked
       one by one. Only Team Projects follows it; it is remembered for each person in this browser (rd_mine_team).
     R&D and business objectives both. An objective's title opens Execution (R&D) or Sales (business) at that
       objective, in a new tab: execution_app.html?objective=… / sales_app.html?objective=… (the sample boards
       open the other board in the same frame, with the hand-off).
     When: this quarter and later, objectives not ended (the default); the quarter menu offers All quarters and
       each quarter, where ended objectives show with how they ended. The view switch and the quarter menu sit
       beside the title, since they set both the panel and the tree.

   The panel above the tree (round 5, proposal E, October 21): a scorecard of everything in view (the quarter's
   weeks, the mean score and median with each scored objective as a dot, objectives by status, key results on
   track, stage-gates passed and overdue, behind schedule, open high risk, readings due, the schedule alarm) and a
   timeline under it (each objective's planned window, forecast, stage-gates and its project's milestones; past
   12 objectives the last level starts folded). A dot, a timeline row, "Show them below" and "Show it" filter the
   tree. Since October 22 the panel judges scores by pace on the quarter's clock (the engine's rule for a key
   result, RD.keyResultPaceBand): the diagram's mark is the time elapsed, not the mean. The tree keeps the score
   bands. Details at "the roll-up panel" and "pace on the quarter's clock" below.

   Group by and Sort by (October 22), above the panel, arrange the timeline and the tree alike: levels one under
   another (project, division, unit, product, model, quarter, owner; Project alone by default, the tree as it was),
   and a sort for the objectives in each group and the groups themselves. See "grouping and sorting".

   The rows (columns: a flag when a reading is due, Name, Date, Owner, Score, Status, Progress)
     Project       its score is Planning's rollup (RD.rollupInitiative over every division's document: the mean of
                   its objectives' scores); the next milestone and its date.
     Objective     score bar with the share of time used as a tick; forecast, schedule and plan revision.
     Key results   no score, so the objective's isn't repeated; a diagram counting every measure under its key
                   results by status, each like a KPI: a KPI by its status (Met, On track, Near, Below, No reading),
                   a percent key result by its score band, each milestone step by its state (Done, In progress,
                   Not started; a late step still counts by its state, R4-7). In progress has its own segment.
     Stage-gates   no score; a status bar, gate health in the caption.
     Kanban, Risks, Experiments: status bars; collapsed, unless they are what is yours in someone else's objective.
     Key result, stage-gate, tile, risk: the Overview's review table items (REVIEW.items), so the words, statuses
                   and numbers agree with Execution and Sales.
     KPI, target   the review table's own controls (KPI.post): click the value to post a reading; a statistical
                   KPI opens its readings under the row.
     Percent key result, milestone step: the value is a button too, with an inline editor (0 to 100; a step's
                   blank is 0, as on the Key results tab; a percent key result's blank changes nothing).
     Experiment    its status (Planned, In progress, Complete), the current step's match or the outcome; the key
                   reads of an Execution objective's experiment in progress are the Current step's own controls
                   (STEP.keyReadRow). Sales records outcomes on its own page, so its experiments show status only.
   A reading is due (the flag, and "Needs a check-in") when a stage-gate is overdue with that target unmet, or a
   statistical KPI still has samples to come (R4-2). A collapsed row shows the flag when one is due inside it.
   Rows open where something needs you: off track or at risk, a reading due inside, an experiment in progress.
   Expand all and Collapse to objectives reset that; a row opened or closed by hand stays so for the visit.

   Live (LIVE.md): loads the roster, the portfolio and every EXEC-, BIZ- and SPEC- document; writes EXEC-* and
   BIZ-* (readings, progress, steps, key reads, and the gates NET passes on load, as Execution and Sales do),
   never the portfolio or SPEC-*. Who you are comes from the Hub sign-in only.

   State (view only, never saved): mine_view ('' | 'owned' | 'team'), mine_q ('' this quarter and later | '*' |
   a quarter), mine_due (the "Needs a check-in" filter), mine_text (filter by name), mine_open (rows opened or
   closed by hand), mine_depth ('' | 'all' | 'objectives'), mine_edit (the percent / step editor), mine_tl (the
   timeline's groups opened or folded by hand, by path), mine_team (the CEO's and CTO's Team Projects choices, by
   email, as stored in this browser), mine_gb and mine_sort (Group by's levels and Sort by, as stored in this
   browser: rd_mine_arrange), mine_banner, mine_load, mine_tokenDraft.
   ========================================================================== */

const MINE_RD_PAGE = 'Main.dc.html';        // execution_app.html in the live build (standalone.py renames board links)
const MINE_BIZ_PAGE = 'Sales-A.dc.html';    // sales_app.html
const MINE_VIEW_KEY = 'rd_mine_view';        // a leader's last view in this browser
const MINE_BUILD = '2026-10-22 my-projects';
/* diagram segments, worst first; in progress has its own (blue) segment */
const MINE_SEG = ['bad', 'warn', 'ok', 'info', 'none', 'done', 'cnl'];
const MINE_SEG_CLS = { bad: 'review-seg review-b-bad', warn: 'review-seg review-b-warn', ok: 'review-seg review-b-ok', info: 'review-seg mine-b-info', none: 'review-seg review-b-none', done: 'review-seg review-b-done', cnl: 'review-seg review-b-cnl' };
const MINE_PILL = { bad: 'pill t-bad', warn: 'pill t-warn', ok: 'pill t-ok', info: 'pill t-info', none: 'pill', done: 'pill mine-done', cnl: 'pill mine-cnl' };
/* the review table's statuses as tones */
const MINE_REVIEW_TONE = { off: 'bad', risk: 'warn', ok: 'ok', none: 'none', done: 'done', cancelled: 'cnl' };
const MINE_GROUPS = { kr: 'Key results', gate: 'Stage-gates', tile: 'Kanban', risk: 'Risks', exp: 'Experiments' };

/* ------------------------------------------------------------ small helpers */
function mineStore(key, val) {
  try {
    const ls = window.localStorage;
    if (!ls) return null;
    if (val === undefined) return ls.getItem(key);
    if (val === null) ls.removeItem(key); else ls.setItem(key, String(val));
  } catch (e) { /* storage blocked: the choice lasts for this visit */ }
  return null;
}
function mineVal(e) { return e && e.target && e.target.value != null ? String(e.target.value) : ''; }
function mineChecked(e, dflt) { return e && e.target && typeof e.target.checked === 'boolean' ? e.target.checked : !!dflt; }
function mineArr(x) { return Array.isArray(x) ? x : x == null || x === '' ? [] : [x]; }
function mineSlug(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function mineTxt(v) { return String(v == null ? '' : v).trim(); }
function mineNoStop(s) { return mineTxt(s).replace(/[.]+$/, ''); }
function mineLow1(s) { s = String(s || ''); return s ? s[0].toLowerCase() + s.slice(1) : s; }
function minePct(v) { return Math.max(0, Math.min(100, Number(v) || 0)); }
function mineNum1(v) { return String(Math.round(Number(v) * 10) / 10); }
function mineDayOf(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  return F.fromIso(String(v).trim().slice(0, 10));
}
function mineBlankDoc() {
  return { keyResults: [], kpis: [], kpiUpdates: [], stageGateSets: [], stageGates: [], stageGateEdges: [], tasks: [], boards: [], risks: [], planVersions: [], catchupPlans: [], objectiveState: [], gateMode: {}, chainGatesByDate: {}, etbTrees: {} };
}
/* quarters: "2026Q4" (the suite's own) and "Q4 2026"-style labels */
function mineParseQ(q) {
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
  return { start: Math.round((Date.UTC(yr, (qn - 1) * 3, 1) - EPOCH) / 86400000), end: Math.round((Date.UTC(yr, qn * 3, 1) - EPOCH) / 86400000) - 1, label: 'Q' + qn + ' ' + yr };
}
function mineQSort(a, b) {
  const pa = mineParseQ(a), pb = mineParseQ(b);
  if (pa && pb) return pa.start - pb.start;
  if (pa) return -1;
  if (pb) return 1;
  return String(a).localeCompare(String(b));
}
function mineQLabel(q) { const p = mineParseQ(q); return p ? p.label : (q || 'No quarter'); }

/* ============================================================== the model
   Pure: everything here reads the data and returns plain values, so the suites test it without the page. */
const MINE = (function () {
  const key = (v) => String(v == null ? '' : v).trim().toLowerCase();
  function users(D) { return ((D.roster && D.roster.users) || []).filter((u) => u && u.email && !u.disabled); }
  function initialsOf(u) {
    const n = mineTxt(u.name) || String(u.email).split('@')[0];
    const p = n.split(/[\s._-]+/).filter(Boolean);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toLowerCase();
  }
  /* an owner or assignee as stored -> the roster person's email: an email as is, otherwise the one person whose
     name, email name, first name or initials it is (MP-1); '' when it names nobody, or more than one person */
  function person(D, v) {
    const s = key(v);
    if (!s) return '';
    if (s.indexOf('@') >= 0) return s;
    const us = users(D);
    const one = (fn) => { const hit = us.filter(fn); return hit.length === 1 ? key(hit[0].email) : ''; };
    return one((u) => key(u.name) === s) || one((u) => key(u.email).split('@')[0] === s) ||
      one((u) => key(String(u.name || '').split(/\s+/)[0]) === s) || (s.length <= 3 ? one((u) => initialsOf(u) === s) : '');
  }
  function ownersOf(D, o) { return K.uniq(RD.ownersOf(o).map((v) => person(D, v)).filter(Boolean)); }
  function owns(D, o, email) { return !!key(email) && ownersOf(D, o).indexOf(key(email)) >= 0; }
  function divOf(P, id) { return ((P && P.divisions) || []).find((d) => d && d.id === id) || null; }
  function kindOf(P, divId) { const d = divOf(P, divId); return d && RD.divisionKind(d) === 'biz' ? 'biz' : 'rd'; }
  function docKey(P, divId) { return (kindOf(P, divId) === 'biz' ? 'BIZ-' : 'EXEC-') + divId; }
  /* the divisions a person leads: every division for the CTO and the CEO; a lead's by roster leadDivisions,
     leadUnits (the division's unit) or a legacy leadOf naming it (the same rule as PULL.isLeader) */
  function leads(D, email) {
    const u = ((D.roster && D.roster.users) || []).find((x) => x && key(x.email) === key(email));
    if (!u || u.disabled) return [];
    const role = key(u.orgRole);
    const divs = ((D.portfolio && D.portfolio.divisions) || []).filter((d) => d && d.id);
    if (role === 'cto' || role === 'ceo') return divs.map((d) => d.id);
    if (role !== 'lead') return [];
    return divs.filter((d) => mineArr(u.leadDivisions).indexOf(d.id) >= 0 || (d.unitId && mineArr(u.leadUnits).indexOf(d.unitId) >= 0) ||
      mineArr(u.leadOf).some((x) => x === d.id || mineSlug(x) === mineSlug(d.name))).map((d) => d.id);
  }
  /* what in one objective is assigned to a person: experiments they run ('tid|expId') and kanban tiles they hold */
  function assigned(D, doc, objId, email) {
    const me = key(email);
    const exps = [], tiles = [];
    if (!me || !doc) return { exps: exps, tiles: tiles };
    const bag = doc.etbTrees ? doc.etbTrees[objId] : null;
    if (bag) RD.etbTreesOf(bag).trees.forEach((t) => Object.keys(t.experiments || {}).forEach((id) => {
      const e = t.experiments[id];
      if (e && typeof e === 'object' && person(D, e.owner) === me) exps.push((t.tid || 't_main') + '|' + id);
    }));
    ((doc.boards || [])).forEach((b) => {
      if (b && b.objectiveId === objId) (b.tiles || []).forEach((t) => { if (t && t.id && person(D, t.assignee) === me) tiles.push(t.id); });
    });
    return { exps: exps, tiles: tiles };
  }
  /* this quarter and later ('': not ended, and its quarter or its planned end not behind today), every quarter
     ('*'), or one quarter */
  function inWhen(D, o, doc, when) {
    if (when === '*') return true;
    if (when) return (o.quarter || '') === when;
    if (doc && RD.objectiveEndState(doc.objectiveState, o.id)) return false;
    const q = mineParseQ(o.quarter);
    if (q && q.end >= D.today) return true;
    if (o.plannedEnd != null && isFinite(o.plannedEnd)) return o.plannedEnd >= D.today;
    return !q;
  }
  /* the objectives a view shows: [{ o, docKey, own, full, exps, tiles }]. full: every row of the objective
     (an objective you own, or Team Projects); otherwise only exps and tiles, what is assigned to you. Team
     Projects covers teamDivs when given (the CEO's and CTO's choice), else the divisions the person leads */
  function scope(D, email, view, when, teamDivs) {
    const P = D.portfolio || {};
    const me = key(email);
    if (!me) return [];
    const team = view === 'team' ? (Array.isArray(teamDivs) ? teamDivs : leads(D, me)) : null;
    const out = [];
    (P.objectives || []).forEach((o) => {
      if (!o || !o.id || !divOf(P, o.divisionId)) return;
      const dk = docKey(P, o.divisionId);
      const doc = (D.docs || {})[dk] || null;
      if (!inWhen(D, o, doc, when)) return;
      const own = owns(D, o, me);
      const a = assigned(D, doc, o.id, me);
      if (/^BIZ-/.test(dk)) a.exps = [];   // Sales has no experiments since November 3: a business objective's logic tree stays out
      if (team) { if (team.indexOf(o.divisionId) >= 0) out.push({ o: o, docKey: dk, own: own, full: true, exps: a.exps, tiles: a.tiles }); return; }
      if (own) { out.push({ o: o, docKey: dk, own: true, full: true, exps: a.exps, tiles: a.tiles }); return; }
      if (a.exps.length || a.tiles.length) out.push({ o: o, docKey: dk, own: false, full: false, exps: a.exps, tiles: a.tiles });
    });
    return out;
  }
  function quarters(entries) { const qs = K.uniq(entries.map((e) => e.o.quarter).filter(Boolean)); qs.sort(mineQSort); return qs; }
  /* divisions in Planning's order: unit order, then division order */
  function divRank(P) {
    const unitOrder = {};
    (P.units || []).forEach((u, i) => { unitOrder[u.id] = u.order == null ? i : u.order; });
    const ds = (P.divisions || []).filter((d) => d && d.id).slice().sort((a, b) => {
      const ua = a.unitId && unitOrder[a.unitId] != null ? unitOrder[a.unitId] : 1e6;
      const ub = b.unitId && unitOrder[b.unitId] != null ? unitOrder[b.unitId] : 1e6;
      return ua - ub || K.byOrder(a, b);
    });
    const r = {};
    ds.forEach((d, i) => { r[d.id] = i; });
    return r;
  }
  function objSort(a, b) {
    const qa = a.o.quarter || '', qb = b.o.quarter || '';
    if (qa !== qb) { if (!qa) return 1; if (!qb) return -1; const c = mineQSort(qa, qb); if (c) return c; }
    return K.byOrder(a.o, b.o) || String(a.o.statement || '').localeCompare(String(b.o.statement || ''));
  }
  /* entries by project (initiative), projects in division then initiative order; objectives in no project last
     in their division, under "No project" */
  function group(D, entries) { return arrange(D, entries, ['project']).groups; }

  /* ---- grouping in layers (October 22): the tree and the timeline group by these, one level each ---- */
  const DIMS = ['project', 'division', 'unit', 'product', 'model', 'quarter', 'owner'];
  /* an objective's owners together, as one value: their roster emails (MP-1), then names that match nobody. Each
     objective sits in one group, so a co-owned one is its owners' group, not each owner's (Planning lists it under
     each); the tree never shows an objective twice */
  function ownerKey(D, o) {
    const emails = [], names = [];
    RD.ownersOf(o).forEach((v) => {
      const p = person(D, v);
      if (p) { if (emails.indexOf(p) < 0) emails.push(p); return; }
      const t = mineTxt(v);
      if (t && names.indexOf(t) < 0) names.push(t);
    });
    return emails.sort().concat(names.sort()).join('+');
  }
  /* an objective's value on one dimension, '' when it has none: its project as the tree has always grouped it (a
     project, or "No project" in its division), its division, the division's unit, its product and model as
     Planning reads them (RD.effProduct, RD.effModel: its own, else its project's), its quarter, its owners */
  function dimKey(D, o, dim) {
    const P = D.portfolio || {};
    if (dim === 'project') {
      const init = o.initiativeId ? (P.initiatives || []).find((i) => i && i.id === o.initiativeId) : null;
      return init ? init.id : '~' + o.divisionId;
    }
    if (dim === 'division') return o.divisionId || '';
    if (dim === 'unit') { const d = divOf(P, o.divisionId); return (d && d.unitId) || ''; }
    if (dim === 'product') return RD.effProduct(o, P) || '';
    if (dim === 'model') return RD.effModel(o, P) || '';
    if (dim === 'quarter') return o.quarter || '';
    if (dim === 'owner') return ownerKey(D, o);
    return '';
  }
  /* a level's groups in their own order: Planning's for projects (by division, "No project" last in it),
     divisions, units, products and models; quarters by date; owners by name with yours first; "No …" last */
  function grpOrder(D, dim, me) {
    const P = D.portfolio || {};
    const rank = divRank(P);
    const dr = (id) => (rank[id] == null ? 1e6 : rank[id]);
    const none = (a, b) => (a.val === '' ? 1 : 0) - (b.val === '' ? 1 : 0);
    const byVal = (a, b) => String(a.val).localeCompare(String(b.val));
    const idx = (list) => { const m = {}; (list || []).forEach((x, i) => { if (x && x.id && !(x.id in m)) m[x.id] = { x: x, i: i }; }); return m; };
    if (dim === 'project') return (a, b) => dr(a.divId) - dr(b.divId) || (a.init ? 0 : 1) - (b.init ? 0 : 1) || K.byOrder(a.init || {}, b.init || {}) || byVal(a, b);
    if (dim === 'division') return (a, b) => none(a, b) || dr(a.val) - dr(b.val) || byVal(a, b);
    if (dim === 'unit') {
      const u = idx(P.units);
      const at = (v) => (u[v] ? (u[v].x.order == null ? u[v].i : u[v].x.order) : 1e6);
      return (a, b) => none(a, b) || at(a.val) - at(b.val) || byVal(a, b);
    }
    const pr = idx(P.products);
    const prod = (id) => (pr[id] ? [dr(pr[id].x.divisionId), pr[id].x.order == null ? 1e9 : pr[id].x.order, pr[id].i] : [1e6, 1e9, 1e9]);
    const tup = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
    if (dim === 'product') return (a, b) => none(a, b) || tup(prod(a.val), prod(b.val)) || byVal(a, b);
    if (dim === 'model') {
      const md = idx(P.models);
      const mod = (id) => (md[id] ? prod(md[id].x.productId).concat([md[id].x.order == null ? 1e9 : md[id].x.order, md[id].i]) : [1e6, 1e9, 1e9, 1e9, 1e9]);
      return (a, b) => none(a, b) || tup(mod(a.val), mod(b.val)) || byVal(a, b);
    }
    if (dim === 'quarter') return (a, b) => none(a, b) || mineQSort(a.val, b.val);
    if (dim === 'owner') {
      const nameOf = (x) => { if (x.indexOf('@') < 0) return x.toLowerCase(); const u = ((D.roster && D.roster.users) || []).find((y) => y && key(y.email) === x); return String((u && u.name) || x).toLowerCase(); };
      const yours = (v) => v !== '' && v.split('+').indexOf(me) >= 0;
      const rest = (v) => v.split('+').filter((x) => x !== me).map(nameOf).join(' ');
      return (a, b) => none(a, b) || (yours(b.val) ? 1 : 0) - (yours(a.val) ? 1 : 0) || (a.val === me ? 0 : 1) - (b.val === me ? 0 : 1) || rest(a.val).localeCompare(rest(b.val)) || byVal(a, b);
    }
    return byVal;
  }
  /* the entries in layers, one per dimension: [{ dim, val, key, entries, kids, init, divId }]. A level's groups
     keep their own order (grpOrder) unless opt.cmpGrp orders them; the last level's entries follow opt.cmpObj
     (default: quarter, then Planning's order). A group's key is its path ("division:DIV-FC/INIT-FC-01"); a
     project at the top keeps its own key, as the tree has always keyed it. No dimensions: { flat } in order */
  function arrange(D, entries, dims, opt) {
    opt = opt || {};
    const P = D.portfolio || {};
    const me = key(opt.me);
    const cmpObj = opt.cmpObj || objSort;
    const level = (list, i, path) => {
      const dim = dims[i];
      const by = {}, out = [];
      list.forEach((e) => {
        const v = dimKey(D, e.o, dim);
        let g = by[v];
        if (!g) {
          const init = dim === 'project' && v[0] !== '~' ? (P.initiatives || []).find((x) => x && x.id === v) || null : null;
          const seg = dim === 'project' ? v : dim + ':' + v;
          g = by[v] = { dim: dim, val: v, path: path.concat([seg]), key: path.concat([seg]).join('/'), entries: [], kids: null, init: init, divId: init ? init.divisionId || e.o.divisionId : e.o.divisionId };
          out.push(g);
        }
        g.entries.push(e);
      });
      out.forEach((g) => { if (i + 1 < dims.length) g.kids = level(g.entries, i + 1, g.path); else g.entries.sort(cmpObj); });
      const nat = grpOrder(D, dim, me);
      out.sort((a, b) => (opt.cmpGrp ? opt.cmpGrp(a, b) : 0) || nat(a, b));
      return out;
    };
    if (!dims.length) return { groups: [], flat: entries.slice().sort(cmpObj) };
    return { groups: level(entries, 0, []), flat: [] };
  }

  /* ---- the Key results diagram: every measure under the key results, each counted like a KPI ---- */
  const KPI_TONE = { 'Met': 'done', 'On track': 'ok', 'Near': 'warn', 'Below': 'bad', 'No reading': 'none' };
  /* the KPI table's words for one KPI (its statusOf, as the review table says them) */
  function kpiWord(pp) {
    const s = pp.score, rs = pp.raw, rb = F.band(rs);
    const complete = !pp.expected || (pp.n || 0) >= pp.expected;
    const rawWord = rs == null ? 'No reading' : rs >= 100 ? 'On track' : rb === 'ok' ? 'On track' : rb === 'warn' ? 'Near' : 'Below';
    return s == null ? 'No reading' : pp.partial ? rawWord : (s >= 100 && complete) ? 'Met' : rawWord;
  }
  function bandOf(s) {
    if (s == null) return { tone: 'none', word: 'Not started' };
    const b = RD.band(s);
    return b === 'on-track' ? { tone: 'ok', word: 'On track' } : b === 'at-risk' ? { tone: 'warn', word: 'At risk' } : { tone: 'bad', word: 'Off track' };
  }
  function stepOf(st) {
    const c = minePct(st && st.completion);
    return c >= 100 ? { tone: 'done', word: 'Done' } : c > 0 ? { tone: 'info', word: 'In progress' } : { tone: 'none', word: 'Not started' };
  }
  /* -> { parts: [{ tone, word }], terms: ['KR1', 'KR-M1’s 3 steps', '3 KPIs'], sampling } in key result order; a
     key result's KPIs count when it is KPI-based (the ones it is scored on); its KPIs are one term */
  function measures(doc, objId, P, em, tagOf) {
    const krs = ((doc && doc.keyResults) || []).filter((r) => r && r.objectiveId === objId);
    const parts = [], terms = [];
    let kpiN = 0, kpiAt = -1, sampling = 0;
    krs.forEach((kr, i) => {
      const tt = kr.trackingType || 'kpi';
      const tag = tagOf(kr, i, krs);
      if (tt === 'percentage' || tt === 'subkr') { parts.push(bandOf(RD.keyResultScore(kr.id, em))); terms.push(tag); return; }
      if (tt === 'milestone') {
        const st = kr.steps || [];
        st.forEach((x) => parts.push(stepOf(x)));
        if (st.length) terms.push(tag + '’s ' + F.plural(st.length, 'step'));
        return;
      }
      const kk = (P || []).filter((k) => k && k.objectiveId === objId && k.hostType === 'keyResult' && k.hostId === kr.id);
      kk.forEach((k) => {
        const pp = RD.kpiScoreParts(k, P, em);
        const w = kpiWord(pp);
        parts.push({ tone: KPI_TONE[w] || 'none', word: w });
        if (pp.partial) sampling++;
      });
      if (kk.length) { if (kpiAt < 0) { kpiAt = terms.length; terms.push(''); } kpiN += kk.length; }
    });
    if (kpiAt >= 0) terms[kpiAt] = F.plural(kpiN, 'KPI');
    return { parts: parts, terms: terms, sampling: sampling };
  }
  /* counts by tone (diagram segments, worst first) and in words ("1 near, 2 on track, 1 met") */
  function tally(parts) {
    const byTone = {}, words = [];
    parts.forEach((p) => {
      byTone[p.tone] = (byTone[p.tone] || 0) + (p.n || 1);
      let w = words.find((x) => x.tone === p.tone && x.word === p.word);
      if (!w) { w = { tone: p.tone, word: p.word, n: 0 }; words.push(w); }
      w.n += (p.n || 1);
    });
    const rank = (t) => { const i = MINE_SEG.indexOf(t); return i < 0 ? 99 : i; };
    const ordered = words.slice().sort((a, b) => rank(a.tone) - rank(b.tone));
    return {
      segs: MINE_SEG.filter((t) => byTone[t]).map((t) => ({ tone: t, n: byTone[t], words: ordered.filter((w) => w.tone === t) })),
      text: ordered.map((w) => w.n + ' ' + w.word.toLowerCase()).join(', '),
      total: parts.reduce((a, p) => a + (p.n || 1), 0)
    };
  }
  /* is a reading due on this KPI? (R4-2) A stage-gate's target when the gate is overdue and the target unmet, or a
     statistical KPI with samples still to come once its sampling has started (a partial check-in; one with no
     readings yet waits for its work to start); a pulled KPI takes no readings. -> { tone, text } or null */
  function due(k, P, em, doc, today, gateLabel) {
    if (!k || k.pull) return null;
    const pp = RD.kpiScoreParts(k, P, em);
    if (k.hostType === 'stageGate') {
      const g = ((doc && doc.stageGates) || []).find((x) => x && x.id === k.hostId);
      if (g && g.actualDate == null && g.plannedDate != null && g.plannedDate < today && !(pp.score != null && pp.score >= 100)) {
        return { tone: 'bad', text: 'Reading due: ' + (gateLabel ? gateLabel(g) : g.name || g.id) + ' is ' + F.plural(today - g.plannedDate, 'day') + ' overdue and its target isn’t met' };
      }
    }
    const def = RD.definerOf(k, P) || k;
    if (def.targetType === 'statistical' && pp.expected && (pp.n || 0) > 0 && (pp.n || 0) < pp.expected) {
      return { tone: 'warn', text: F.plural(pp.expected - (pp.n || 0), 'more sample') + ' due' };
    }
    return null;
  }
  return { person: person, ownersOf: ownersOf, owns: owns, leads: leads, assigned: assigned, inWhen: inWhen, scope: scope, quarters: quarters,
    group: group, kindOf: kindOf, docKey: docKey, measures: measures, tally: tally, kpiWord: kpiWord, bandOf: bandOf, stepOf: stepOf, due: due,
    DIMS: DIMS, dimKey: dimKey, ownerKey: ownerKey, arrange: arrange, objSort: objSort };
})();

/* ------------------------------------------------------------- who and which view */
function mineWho(C) {
  const v = C.viewer();
  if (!v) return { me: null, lead: false, top: false, choice: null, teamDivs: [] };
  /* the CEO and the CTO: Team Projects always, over the divisions they chose */
  if (mineTop(v.orgRole)) {
    const choice = mineTeamChoice(C, v.email, v.orgRole);
    return { me: v, lead: true, top: true, choice: choice, teamDivs: mineTeamDivs(C.D.portfolio, choice) };
  }
  /* a lead: the divisions the roster says they lead (MINE.leads finds none for any other role) */
  const teamDivs = MINE.leads(C.D, v.email);
  return { me: v, lead: teamDivs.length > 0, top: false, choice: null, teamDivs: teamDivs };
}
/* an IC: just theirs; a leader: the view picked (remembered), else Owned Projects, else Team Projects when nothing
   from this quarter on is theirs */
function mineViewOf(C, W) {
  if (!W.me || !W.lead) return 'mine';
  const s = C.state.mine_view;
  if (s === 'owned' || s === 'team') return s;
  return MINE.scope(C.D, W.me.email, 'owned', '').length ? 'owned' : 'team';
}
function minePickView(C, v) {
  mineStore(MINE_VIEW_KEY, v);
  C.setState({ mine_view: v, mine_open: {}, mine_edit: null, mine_tl: {}, menu: '' });
}

/* ------------------------------------------------------------- the CEO's and CTO's Team Projects */
/* A lead's Team Projects is the divisions the roster says they lead. The CEO and the CTO lead every division, so
   each chooses what their own Team Projects covers, in Settings (October 22): the R&D divisions (the CTO's
   default), the business divisions (the CEO's default), every division, or divisions picked one by one. Only Team
   Projects follows it: Owned Projects, and who may change what elsewhere (PULL.isLeader, Planning), don't. It is
   remembered for each person in this browser (rd_mine_team: { email: { mode, divs } }), like the view; choosing
   your default clears it, so a default never sticks. */
const MINE_TEAM_KEY = 'rd_mine_team';
const MINE_TEAM_MODES = ['rd', 'biz', 'all', 'pick'];
const MINE_TEAM_WORDS = { rd: 'R&D divisions', biz: 'Business divisions', all: 'Every division', pick: 'Choose divisions' };
function mineTop(role) { return role === 'cto' || role === 'ceo'; }
function mineTeamDefault(role) { return role === 'ceo' ? 'biz' : 'rd'; }
function mineDivKind(d) { return RD.divisionKind(d) === 'biz' ? 'biz' : 'rd'; }
function mineTeamRead() {
  try {
    const m = JSON.parse(mineStore(MINE_TEAM_KEY) || '{}');
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch (e) { return {}; }
}
/* one person's choice: { mode, divs (when picked), dflt (their role's default) } */
function mineTeamChoice(C, email, role) {
  const dflt = mineTeamDefault(role);
  const c = (C.state.mine_team || {})[String(email || '').toLowerCase()];
  const mode = c && typeof c === 'object' && MINE_TEAM_MODES.indexOf(c.mode) >= 0 ? c.mode : dflt;
  return { mode: mode, divs: mode === 'pick' ? mineArr(c.divs).filter((x) => typeof x === 'string') : [], dflt: dflt };
}
/* the divisions a choice covers, in the portfolio's order (a picked division since deleted drops out) */
function mineTeamDivs(P, choice) {
  const ds = ((P && P.divisions) || []).filter((d) => d && d.id);
  if (choice.mode === 'all') return ds.map((d) => d.id);
  if (choice.mode === 'pick') return ds.filter((d) => choice.divs.indexOf(d.id) >= 0).map((d) => d.id);
  return ds.filter((d) => mineDivKind(d) === choice.mode).map((d) => d.id);
}
/* the lede's words for it ("R&D divisions: 4 projects and 7 objectives") */
function mineTeamWords(choice, names) {
  if (choice.mode !== 'pick') return MINE_TEAM_WORDS[choice.mode];
  return !names.length ? 'No divisions' : names.length <= 3 ? F.list(names) : names.length + ' divisions you chose';
}
/* save the signed-in person's choice; their default is saved as nothing */
function mineTeamSave(C, choice) {
  const v = C.viewer();
  if (!v || !mineTop(v.orgRole)) return;
  const m = Object.assign({}, C.state.mine_team || {});
  const k = String(v.email).toLowerCase();
  if (choice.mode === mineTeamDefault(v.orgRole)) delete m[k];
  else m[k] = choice.mode === 'pick' ? { mode: 'pick', divs: choice.divs.slice() } : { mode: choice.mode };
  mineStore(MINE_TEAM_KEY, Object.keys(m).length ? JSON.stringify(m) : null);
  C.setState({ mine_team: m, mine_open: {}, mine_edit: null, mine_tl: {} });
}

/* ------------------------------------------------------------- grouping and sorting (October 22) */
/* The timeline and the tree group the same way and sort the same way, set in the Group and sort popover beside
   the quarter menu (round 6's A): Group by takes levels one under another (Project, the tree's own grouping, by
   default), Planning's way (Add a level…, each level's menu, its remove button; no levels lists the objectives
   as one); Sort by orders the objectives inside each group and the groups by what their rows show. Remembered
   in this browser (rd_mine_arrange), like the view; the default is stored as nothing. */
const MINE_ARRANGE_KEY = 'rd_mine_arrange';
const MINE_DIMS = [['project', 'Project'], ['division', 'Division'], ['unit', 'Unit'], ['product', 'Product'], ['model', 'Model'], ['quarter', 'Quarter'], ['owner', 'Owner']];
const MINE_GB_DEFAULT = ['project'];
const MINE_SORTS = [['', 'Planning order'], ['score', 'Score, lowest first'], ['score-desc', 'Score, highest first'], ['slip', 'Most behind schedule first'],
  ['end', 'End date, soonest first'], ['end-desc', 'End date, latest first'], ['name', 'Name, A to Z']];
function mineDimWord(d) { const x = MINE_DIMS.find((y) => y[0] === d); return x ? x[1] : String(d || ''); }
/* the levels as stored: known dimensions, each once; an unreadable or empty-of-known list is the default */
function mineGbOf(v) {
  if (!Array.isArray(v)) return MINE_GB_DEFAULT.slice();
  const ok = K.uniq(v.filter((d) => MINE_DIMS.some((x) => x[0] === d)));
  return ok.length || !v.length ? ok : MINE_GB_DEFAULT.slice();
}
function mineSortOf(v) { return MINE_SORTS.some((x) => x[0] === v) ? v : ''; }
/* the default: Project alone, in Planning order */
function mineIsDefault(gb, sort) { return !sort && gb.length === 1 && gb[0] === MINE_GB_DEFAULT[0]; }
/* the arrangement in a sentence: "Grouped by division, then project, lowest score first." */
const MINE_SORT_WORDS = { '': 'in Planning order', score: 'lowest score first', 'score-desc': 'highest score first', slip: 'most behind schedule first',
  end: 'soonest end first', 'end-desc': 'latest end first', name: 'by name, A to Z' };
function mineArrangeWords(gb, sort) {
  return (gb.length ? 'Grouped by ' + gb.map((d) => mineDimWord(d).toLowerCase()).join(', then ') : 'One list, not grouped') + ', ' + MINE_SORT_WORDS[mineSortOf(sort)] + '.';
}
function mineArrangeRead() {
  let v = null;
  try { v = JSON.parse(mineStore(MINE_ARRANGE_KEY) || 'null'); } catch (e) { v = null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { gb: MINE_GB_DEFAULT.slice(), sort: '' };
  return { gb: mineGbOf(v.gb), sort: mineSortOf(v.sort) };
}
function mineArrangeSave(C, patch) {
  const gb = mineGbOf(patch.gb !== undefined ? patch.gb : C.state.mine_gb);
  const sort = mineSortOf(patch.sort !== undefined ? patch.sort : C.state.mine_sort);
  mineStore(MINE_ARRANGE_KEY, mineIsDefault(gb, sort) ? null : JSON.stringify({ gb: gb, sort: sort }));
  /* the popover stays open, so several changes can be made in a row */
  C.setState({ mine_gb: gb, mine_sort: sort });
}
/* what each objective in view is (score, schedule, status), by entry: the panel's own figures */
function mineFx(C, ctx) {
  return C.memo('mine.fx', () => { const m = new Map(); mineRollFacts(C, ctx).forEach((f) => m.set(f.ent, f)); return m; });
}
/* the arrangement both the timeline and the tree draw: { dims, sort, groups, flat } (MINE.arrange) */
function mineArranged(C, ctx) {
  return C.memo('mine.arr', () => {
    const dims = mineGbOf(C.state.mine_gb), sort = mineSortOf(C.state.mine_sort);
    const fx = mineFx(C, ctx);
    const A = MINE.arrange(C.D, ctx.entries, dims, { me: ctx.me ? ctx.me.email : '', cmpObj: mineObjCmp(sort, fx), cmpGrp: mineGrpCmp(C, ctx, sort, fx) });
    return { dims: dims, sort: sort, groups: A.groups, flat: A.flat };
  });
}
/* The sorts. An objective: by its score (an ended one shows none), its days behind schedule, its planned end or
   its name. A group: by what its row shows (mineGrpScore; its worst slip and the end of its last objective, as its
   folded bar on the timeline; its name, quarters by date and owners yours first). What has no score or no end
   date goes last either way; ties keep Planning order (objectives) or the level's own order (groups). */
const mineLive = (f) => !!f && !f.ended && f.sc != null;
const mineSlipOf = (f) => (f && !f.ended && f.slip != null && f.slip > 0 ? f.slip : 0);
function mineCollate(a, b) { return String(a).localeCompare(String(b), 'en', { sensitivity: 'base', numeric: true }); }
function mineEndOf(o) { return o && o.plannedEnd != null && isFinite(o.plannedEnd) ? o.plannedEnd : null; }
function mineObjCmp(sort, fx) {
  const plan = MINE.objSort;
  const f = (e) => fx.get(e);
  if (sort === 'score' || sort === 'score-desc') {
    const dir = sort === 'score' ? 1 : -1;
    return (a, b) => { const fa = f(a), fb = f(b), la = mineLive(fa), lb = mineLive(fb); return (la === lb ? 0 : la ? -1 : 1) || (la && lb ? (fa.sc - fb.sc) * dir : 0) || plan(a, b); };
  }
  if (sort === 'slip') return (a, b) => mineSlipOf(f(b)) - mineSlipOf(f(a)) || plan(a, b);
  if (sort === 'end' || sort === 'end-desc') {
    const dir = sort === 'end' ? 1 : -1;
    return (a, b) => { const ea = mineEndOf(a.o), eb = mineEndOf(b.o); return (ea == null ? 1 : 0) - (eb == null ? 1 : 0) || (ea != null && eb != null ? (ea - eb) * dir : 0) || plan(a, b); };
  }
  if (sort === 'name') return (a, b) => mineCollate(mineTxt(a.o.statement) || a.o.id, mineTxt(b.o.statement) || b.o.id) || plan(a, b);
  return plan;
}
function mineGrpCmp(C, ctx, sort, fx) {
  if (sort === 'score' || sort === 'score-desc') {
    const dir = sort === 'score' ? 1 : -1;
    return (a, b) => { const sa = mineGrpScore(C, ctx, a, fx), sb = mineGrpScore(C, ctx, b, fx); return (sa == null ? 1 : 0) - (sb == null ? 1 : 0) || (sa != null && sb != null ? (sa - sb) * dir : 0); };
  }
  const worst = (g) => g.entries.reduce((m, e) => Math.max(m, mineSlipOf(fx.get(e))), 0);
  if (sort === 'slip') return (a, b) => worst(b) - worst(a);
  const last = (g) => g.entries.reduce((m, e) => { const pe = mineEndOf(e.o); return pe != null && (m == null || pe > m) ? pe : m; }, null);
  if (sort === 'end' || sort === 'end-desc') {
    const dir = sort === 'end' ? 1 : -1;
    return (a, b) => { const ea = last(a), eb = last(b); return (ea == null ? 1 : 0) - (eb == null ? 1 : 0) || (ea != null && eb != null ? (ea - eb) * dir : 0); };
  }
  const none = (g) => g.val === '' || (g.dim === 'project' && !g.init);
  if (sort === 'name') return (a, b) => (a.dim === 'quarter' || a.dim === 'owner' ? 0 : (none(a) ? 1 : 0) - (none(b) ? 1 : 0) || mineCollate(mineGrpLabel(C, ctx, a).name, mineGrpLabel(C, ctx, b).name));
  return null;
}
/* a group's score as its row shows it: a project's is Planning's (RD.rollupInitiative; "No project" has none),
   another group's the mean of its objectives' scores (those that show one: not ended) */
function mineGrpScore(C, ctx, g, fx) {
  return C.memo('mine.gsc:' + g.key, () => {
    if (g.dim === 'project') {
      if (!g.init) return null;
      try { return RD.rollupInitiative(g.init.id, ctx.P, mineEmAll(C)); } catch (e) { return null; }
    }
    return mineMean(g.entries.map((e) => fx.get(e)).filter(mineLive).map((f) => f.sc));
  });
}
/* a group's tag, name and subtitle (and its people, by owner) */
function mineGrpLabel(C, ctx, g) {
  return C.memo('mine.glab:' + g.key, () => {
    const P = ctx.P, v = g.val, td = ctx.today;
    const find = (list, id) => (list || []).find((x) => x && x.id === id) || null;
    const nm = (x, id) => (x ? x.name || x.id : id);
    const tag = mineDimWord(g.dim);
    if (g.dim === 'project') return { tag: tag, name: g.init ? g.init.name || g.init.id : 'No project', sub: '' };
    if (g.dim === 'division') {
      const d = find(P.divisions, v);
      return { tag: tag, name: nm(d, v), sub: d ? (RD.divisionKind(d) === 'biz' ? 'Business division' : 'R&D division') : '' };
    }
    if (g.dim === 'unit') {
      /* its divisions here, in Planning's order */
      const ids = K.uniq(g.entries.map((e) => e.o.divisionId));
      const divs = (P.divisions || []).filter((d) => d && ids.indexOf(d.id) >= 0).slice().sort(K.byOrder).map((d) => nm(d, d.id));
      return { tag: tag, name: v ? nm(find(P.units, v), v) : 'No unit', sub: F.list(divs) };
    }
    if (g.dim === 'product') {
      const p = find(P.products, v), d = p ? find(P.divisions, p.divisionId) : null;
      return { tag: tag, name: v ? nm(p, v) : 'No product', sub: v ? (d ? nm(d, '') : '') : 'Objectives not tied to a product' };
    }
    if (g.dim === 'model') {
      const m = find(P.models, v), p = m ? find(P.products, m.productId) : null;
      return { tag: tag, name: v ? nm(m, v) : 'No model', sub: v ? (p ? nm(p, '') : '') : 'Objectives not tied to a model' };
    }
    if (g.dim === 'quarter') {
      const q = mineParseQ(v);
      return { tag: tag, name: v ? mineQLabel(v) : 'No quarter', sub: q ? F.dayAuto(q.start, td) + ' to ' + F.dayAuto(q.end, td) : '' };
    }
    if (g.dim === 'owner') {
      const me = String(ctx.me ? ctx.me.email : '').toLowerCase();
      const ids = v ? v.split('+') : [];
      ids.sort((a, b) => (a === me ? 0 : 1) - (b === me ? 0 : 1));
      const names = ids.map((x) => (x === me ? 'You' : x.indexOf('@') >= 0 ? F.name(x) : x));
      const sub = !ids.length ? 'Objectives with no owner yet' : ids.length > 1 ? 'Owned together' : ids[0].indexOf('@') < 0 ? 'Not on the roster' : F.roleLabel(F.roleOf(ids[0]));
      return { tag: tag, name: names.length ? F.list(names) : 'No owner', sub: sub, emails: ids.filter((x) => x.indexOf('@') >= 0) };
    }
    return { tag: tag, name: String(v), sub: '' };
  });
}
/* Group and sort (round 6's A, October 22): a button after the quarter menu opens Group by and Sort by in a
   popover. A change applies at once and the popover stays open; Close, Escape or a click outside shuts it, and
   Back to the default sets Project, Planning order. The button is tinted while the arrangement isn't the
   default, and its name says the arrangement. */
const MINE_GS_MENU = 'mine.gs';
/* where the focus goes once the page has redrawn: into the popover as it opens (so Escape and Tab work from the
   start, whatever the browser did with the click), back to the button as it closes, and to a control in the
   popover when the one in use goes away (a level removed, Back to the default). The first of `sels` on the page */
function mineRefocus(e, sels) {
  try {
    const doc = e && e.currentTarget && e.currentTarget.ownerDocument;
    if (!doc) return;
    const go = (tries) => {
      for (const q of sels) { const t = doc.querySelector(q); if (t && typeof t.focus === 'function') { t.focus(); return; } }
      if (tries > 0) setTimeout(() => go(tries - 1), 40);
    };
    setTimeout(() => go(3), 0);
  } catch (err) { /* nothing to focus */ }
}
const MINE_GS_FIRST = '[data-k="group-sort-pop"] select';
function mineArrangeVM(C) {
  const dims = mineGbOf(C.state.mine_gb);
  const levels = dims.map((d, i) => {
    const used = dims.filter((x, j) => j !== i);
    return {
      k: 'gb-' + i, n: String(i + 1), v: d,
      aria: dims.length > 1 ? 'Group by, level ' + (i + 1) : 'Group by',
      opts: MINE_DIMS.filter((x) => x[0] === d || used.indexOf(x[0]) < 0).map((x) => ({ v: x[0], label: x[1] })),
      on: (e) => {
        const nd = mineVal(e) || d;
        const arr = mineGbOf(C.state.mine_gb).slice();
        arr[i] = nd;
        mineArrangeSave(C, { gb: arr.filter((x, j) => j === i || x !== nd) });
      },
      rmLabel: 'Remove the ' + mineDimWord(d).toLowerCase() + ' level',
      rm: (e) => {
        const arr = mineGbOf(C.state.mine_gb).slice();
        arr.splice(i, 1);
        mineArrangeSave(C, { gb: arr });
        mineRefocus(e, ['[data-k="gb-' + i + '"] button', '[data-k="gb-add"] select', MINE_GS_FIRST]);
      }
    };
  });
  const unused = MINE_DIMS.filter((x) => dims.indexOf(x[0]) < 0);
  const sort = mineSortOf(C.state.mine_sort);
  const open = C.isMenu(MINE_GS_MENU);
  const changed = !mineIsDefault(dims, sort);
  const words = mineArrangeWords(dims, sort);
  const close = (e) => { C.closeMenus(); mineRefocus(e, ['[data-k="group-sort"]']); };
  return {
    /* the button: open or not, tinted and named with the arrangement while it isn't the default */
    open: open, exp: open ? 'true' : 'false',
    btnCls: 'btn mine-gsbtn' + (changed ? ' on' : ''),
    name: changed ? 'Group and sort: ' + words : 'Group and sort',
    title: changed ? words : '',
    toggle: (e) => { const opening = !C.isMenu(MINE_GS_MENU); C.toggleMenu(MINE_GS_MENU); if (opening) mineRefocus(e, ['[data-k="group-sort-pop"]']); },
    /* Escape closes it from the button too (focus back on the button after Tab and Shift+Tab, say) */
    btnKey: (e) => { if (e && e.key === 'Escape' && C.isMenu(MINE_GS_MENU)) { if (e.preventDefault) e.preventDefault(); C.closeMenus(); } },
    close: close,
    key: (e) => { if (e && e.key === 'Escape') { if (e.preventDefault) e.preventDefault(); close(e); } },
    /* the popover: the levels, numbered outer first, Add a level, the sort, the arrangement in words */
    levels: levels, flat: !dims.length, canAdd: unused.length > 0,
    addOpts: [{ v: '', label: dims.length ? 'Add a level…' : 'Group by…' }].concat(unused.map((x) => ({ v: x[0], label: x[1] }))),
    add: (e) => { const v = mineVal(e); if (v) { mineArrangeSave(C, { gb: mineGbOf(C.state.mine_gb).concat([v]) }); mineRefocus(e, ['[data-k="gb-add"] select', MINE_GS_FIRST]); } },
    sort: { v: sort, opts: MINE_SORTS.map((x) => ({ v: x[0], label: x[1] })), on: (e) => mineArrangeSave(C, { sort: mineVal(e) }) },
    words: words, changed: changed,
    reset: (e) => { mineArrangeSave(C, { gb: MINE_GB_DEFAULT.slice(), sort: '' }); mineRefocus(e, [MINE_GS_FIRST]); }
  };
}

/* ------------------------------------------------------------- app hooks */
function APP_INIT(C, st) {
  C.MODS = MODS;
  const sv = mineStore(MINE_VIEW_KEY);
  st.mine_view = sv === 'owned' || sv === 'team' ? sv : '';
  st.mine_q = '';
  st.mine_due = false;
  st.mine_text = '';
  st.mine_open = {};
  st.mine_depth = '';
  st.mine_edit = null;
  st.mine_tl = {};
  st.mine_team = mineTeamRead();
  const ar = mineArrangeRead();
  st.mine_gb = ar.gb;
  st.mine_sort = ar.sort;
  st.mine_banner = null;
  st.mine_load = LIVE ? 'loading' : 'ok';
  st.mine_tokenDraft = '';
  const th = mineStore('rd_theme');
  st.theme = th === 'light' || th === 'dark' || th === 'system' ? th : 'light';   // light until a choice is saved, as across the suite
}
function APP_RESET(C) {
  const st = {};
  APP_INIT(C, st);
  C.setState(st);
}
/* the sample's Hub sign-in changed person: rows opened by hand belonged to the other person's tree */
function APP_VIEWER_CHANGED(C) { C.setState({ mine_open: {}, mine_edit: null, mine_due: false, mine_tl: {} }); }

/* ------------------------------------------------------------- live builds (LIVE.md) */
function APP_LIVE_PLAN(C) {
  return {
    roster: true,
    prefs: false,
    autoPass: true,
    /* every division's document: the objectives here come from any division; SPEC- for the KPI link targets */
    docs(P) {
      const ds = ((P && P.divisions) || []).filter((d) => d && d.id);
      const exec = ds.filter((d) => RD.divisionKind(d) !== 'biz').map((d) => 'EXEC-' + d.id);
      const biz = ds.filter((d) => RD.divisionKind(d) === 'biz').map((d) => 'BIZ-' + d.id);
      const spec = ds.filter((d) => RD.divisionKind(d) !== 'biz').map((d) => 'SPEC-' + d.id);
      return exec.concat(biz, spec);
    },
    /* readings, progress, steps and key reads live in the division documents; never the portfolio or SPEC- */
    writable(id) { return /^(EXEC|BIZ)-/.test(String(id)); },
    quiet(id) { return /^SPEC-/.test(String(id)); }
  };
}
/* the first load that succeeds applies ?view=owned|team and ?quarter= (a quarter, all, or active for this one) */
function APP_LIVE_READY(C, url) {
  if (!url) return;
  const patch = { mine_load: 'ok' };
  if (url.view === 'owned' || url.view === 'team') patch.mine_view = url.view;
  const q = String(url.quarter || '').trim();
  if (q === 'all') patch.mine_q = '*';
  else if (q && q !== 'active') patch.mine_q = q;
  C.setState(patch);
}
const MINE_LIVE_LOAD = {
  notoken: ['info', 'No broker token in this browser yet. Open this page from the Hub or another app, or add the token in Settings.'],
  badtoken: ['bad', 'The broker didn’t accept the token (401). Check it in Settings.'],
  noportfolio: ['bad', 'No portfolio doc on the broker yet — create it from the Planning app first.'],
  fail: ['bad', ''],
  offline: ['warn', 'Couldn’t reach the broker. Check your connection; this page keeps trying.'],
  outdated: ['bad', 'This page is out of date. Reload it to keep working.']
};
function APP_LIVE_STATUS(C, s) {
  const phase = (s && s.phase) || '';
  const loaded = !!(C.net && C.net.loaded);
  const cur = C.state.mine_banner;
  const keep = cur && !cur.load ? cur : null;
  if (phase === 'loading') { if (!loaded) C.setState({ mine_load: 'loading', mine_banner: keep }); return; }
  if (phase === 'ok') { C.setState({ mine_load: 'ok', mine_banner: keep }); return; }
  const m = MINE_LIVE_LOAD[phase];
  if (!m) return;
  const text = phase === 'fail' ? 'Load failed (' + (s.status || 'error') + '). Check the token in Settings.' : m[1];
  C.setState({ mine_load: loaded ? 'ok' : phase, mine_banner: { tone: m[0], text: text, load: true } });
}
function APP_LIVE_NOTICE(C, tone, text) {
  if (tone === 'ok') { C.toast(text, 'ok'); return; }
  C.setState({ mine_banner: { tone: tone === 'bad' ? 'bad' : 'info', text: String(text || '') } });
}

/* ------------------------------------------------------------- context */
function APP_CTX(C) {
  const D = C.D, S = C.state;
  const P = D.portfolio || {};
  const loaded = !LIVE || !!(C.net && C.net.loaded);
  const W = loaded ? mineWho(C) : { me: null, lead: false, top: false, choice: null, teamDivs: [] };
  const view = mineViewOf(C, W);
  const all = W.me ? MINE.scope(D, W.me.email, view, '*', W.teamDivs) : [];
  const qs = MINE.quarters(all);
  const when = S.mine_q === '*' || (S.mine_q && qs.indexOf(S.mine_q) >= 0) ? S.mine_q : '';
  const entries = when === '*' ? all : all.filter((e) => MINE.inWhen(D, e.o, (D.docs || {})[e.docKey] || null, when));
  const sim = S.sim || {};
  return {
    app: APP, today: D.today, nowMs: C.now(), P: P, divs: P.divisions || [], loaded: loaded,
    me: W.me, lead: W.lead, top: W.top, choice: W.choice, teamDivs: W.teamDivs, view: view, when: when, quarters: qs,
    allEntries: all, entries: entries, groups: MINE.group(D, entries),
    ro: C.isRo(), hub: !!sim.hub, offline: !!sim.offline
  };
}
/* the context the modules read for one objective: the fields Execution's shell gives them (apps/exec/shell.js),
   for that objective's division and document */
function mineOctx(C, ctx, ent) {
  return C.memo('mine.octx:' + ent.o.id, () => {
    const D = C.D, P = ctx.P, o = ent.o, divId = o.divisionId;
    const div = (P.divisions || []).find((d) => d && d.id === divId) || null;
    const doc = (D.docs || {})[ent.docKey] || mineBlankDoc();
    const em = RD.withPortfolio(P, { [divId]: doc });
    const end = RD.objectiveEndState(doc.objectiveState, o.id);
    const today = D.today;
    return {
      app: APP, kind: MINE.kindOf(P, divId), today: today, nowMs: C.now(), P: P, divs: ctx.divs, div: div, divId: divId,
      docKey: ent.docKey, doc: doc, em: em, spec: D.spec,
      allObjs: (P.objectives || []).filter((x) => x && x.divisionId === divId), all: false, sideObjs: [], objs: [],
      obj: o, objId: o.id, end: end, ended: !!end, ro: ctx.ro, tab: 'overview', view: '', loaded: true,
      unit: div && div.unitId ? (P.units || []).find((u) => u.id === div.unitId) || null : null,
      f: { quarter: '', product: '', owner: '' },
      casc: () => C.memo('mine.casc:' + divId, () => { try { return RD.cascade(P, em, today); } catch (e) { return null; } }),
      hub: ctx.hub, offline: ctx.offline
    };
  });
}
/* every division's document, for Planning's rollups (a project's score) */
function mineEmAll(C) {
  return C.memo('mine.emAll', () => {
    const D = C.D, P = D.portfolio || {}, docs = {};
    (P.divisions || []).forEach((d) => { if (!d || !d.id) return; const doc = (D.docs || {})[MINE.docKey(P, d.id)]; if (doc) docs[d.id] = doc; });
    return RD.withPortfolio(P, docs);
  });
}
function mineGateLabel(doc, g) {
  if (typeof GATES !== 'undefined' && GATES && typeof GATES.label === 'function') { try { const t = GATES.label(doc, g.id); if (t) return t; } catch (e) { /* plain name */ } }
  return g.name || g.id;
}
function mineKrTag(octx, kr, i, list) {
  if (typeof KR !== 'undefined' && KR && typeof KR.tag === 'function') { const t = KR.tag(octx, kr.id); if (t) return t; }
  let m = 0;
  const tags = list.map((x, j) => (x.trackingType === 'milestone' ? 'KR-M' + (++m) : 'KR' + (j + 1)));
  return tags[i] || 'KR' + (i + 1);
}
function minePool(C, octx) {
  try { if (typeof KPI !== 'undefined' && KPI && typeof KPI.pool === 'function') return KPI.pool(C, octx) || []; } catch (e) { /* the document's own */ }
  return (octx.doc.kpis || []).concat((octx.P && octx.P.kpis) || []);
}

/* ------------------------------------------------------------- words */
/* an objective's status: its score band; how it ended; not started; no score yet */
function mineObjWord(C, o, doc, em) {
  const end = RD.objectiveEndState(doc.objectiveState, o.id);
  if (end) return end.status === 'achieved' ? { tone: 'done', word: 'Achieved' } : { tone: 'cnl', word: 'Abandoned' };
  const sc = RD.objectiveScore(o.id, em);
  if (sc != null) { const b = MINE.bandOf(sc); return b; }
  return o.plannedStart != null && C.D.today < o.plannedStart ? { tone: 'none', word: 'Not started' } : { tone: 'none', word: 'No score yet' };
}
/* "Toru’s", "You and Toru", "Yours", "Maya and Erin’s" */
function mineWhose(C, o, me) {
  const owners = MINE.ownersOf(C.D, o);
  const raw = RD.ownersOf(o);
  const mine = !!me && owners.indexOf(String(me).toLowerCase()) >= 0;
  const others = owners.filter((e) => e !== String(me || '').toLowerCase()).map((e) => F.first(e));
  raw.forEach((v) => { if (!MINE.person(C.D, v)) others.push(String(v)); });
  if (mine) return others.length ? F.list(['You'].concat(others)) : 'Yours';
  return others.length ? F.list(others) + '’s' : 'No owner';
}
function mineAvatars(C, list) {
  const out = [];
  list.forEach((v) => {
    const e = MINE.person(C.D, v);
    const name = e ? F.name(e) : String(v || '');
    if (!name) return;
    const ini = e ? F.initials(e) : String(v).split(/[\s._-]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    if (!out.some((x) => x.name === name)) out.push({ ini: ini || '?', name: name });
  });
  /* two fit the Owner column; past that, the first and a "+N" that names the rest */
  if (out.length > 2) return [out[0], { ini: '+' + (out.length - 1), name: F.list(out.slice(1).map((x) => x.name)) }];
  return out;
}

/* ------------------------------------------------------------- tree nodes */
/* one row's fields, every key the template reads present (the runtime reports an unresolved hole otherwise) */
function mineRowBase(o) {
  return Object.assign({
    isRow: true, isDrawer: false, k: '', cls: '', padStyle: '',
    hasCaret: false, noCaret: true, caretCls: 'mine-car', caretExp: 'false', caretLabel: '', toggle: null,
    hasFlag: false, flagCls: '', flagTitle: '',
    hasTag: false, tagCls: 'tag', tagText: '', hasTid: false, tid: '',
    iconGauge: false, iconTarget: false, iconStep: false, iconCause: false, iconTile: false,
    isGroup: false, gname: '', gcount: '', gLink: false, gHref: '', gTarget: '', gRel: '', gTitle: '', gGo: null,
    isLink: false, isPlain: true, href: '', target: '', rel: '', go: null, linkTitle: '',
    name: '', hasSub: false, sub: '',
    hasDate: false, date: '', hasDateSub: false, dateSub: '',
    hasOwners: false, owners: [],
    hasScore: false, score: '',
    hasStatus: false, stCls: 'pill', stWord: '', stDone: false,
    pBar: false, barCls: 'fill', barStyle: 'width: 0%', hasTick: false, tickStyle: '', barAria: '',
    pSeg: false, segs: [], segAria: '',
    pLine: false, lineCls: 'fill', lineStyle: 'width: 0%', lineTick: false, lineTickStyle: '', lineAria: '', lineStatic: false, lineVal: '', lineBtn: false,
    btnCls: '', btnAria: '', btnTitle: '', btnExp: null, btnClick: null, btnText: '',
    pStage: false, pips: [], stage: '',
    pGauge: false, gAria: '', bandStyle: '', hasMk: false, mkStyle: '', gmkCls: 'review-gmk', gLabels: [],
    pRpn: false, rpnPre: '', rpnVal: '',
    pText: false, pTxt: '', pTxtCls: '',
    pValLine: false,
    pKpiEd: false, ed: null,
    pMyEd: false, my: null,
    pRead: false, reads: [],
    hasCap: false, cap: '', capCls: 'mine-cap',
    hasAct: false, actHref: '', actTarget: '', actRel: '', actGo: null, actText: '',
    drawer: null
  }, o || {});
}
function mineNode(k, kind, row, extra) {
  return Object.assign({ k: k, kind: kind, row: mineRowBase(row), kids: [], text: String((row && (row.name + ' ' + (row.sub || '') + ' ' + (row.tid || ''))) || '').toLowerCase(), due: null, dflt: false, drawer: null }, extra || {});
}
function mineStatus(row, tone, word) {
  row.hasStatus = !!word;
  row.stCls = MINE_PILL[tone] || 'pill';
  row.stWord = word || '';
  row.stDone = tone === 'done';
  return row;
}
function mineSegs(t) {
  return t.segs.map((s) => ({ cls: MINE_SEG_CLS[s.tone] || 'review-seg', style: 'flex-grow: ' + s.n + ';', title: s.words.map((w) => w.word + ' ' + w.n).join(', '), n: String(s.n) }));
}
function mineCap(row, text) { row.hasCap = !!text; row.cap = text || ''; return row; }
function mineTone(stCls) { const m = /t-(ok|warn|bad|info|none)/.exec(String(stCls || '')); return m ? m[1] : (/review-d-done/.test(String(stCls || '')) ? 'done' : 'none'); }
/* the objective's title opens Execution or Sales at it: a new tab with ?objective= live, the other board (and
   the hand-off) on the canvas */
function mineObjLink(C, o, kind, ro) {
  const page = kind === 'biz' ? MINE_BIZ_PAGE : MINE_RD_PAGE;
  const app = kind === 'biz' ? 'Sales' : 'Execution';
  return {
    href: LIVE ? page + '?objective=' + encodeURIComponent(o.id) + (ro ? '&readonly' : '') : page,
    target: LIVE ? '_blank' : '',
    rel: LIVE ? 'noopener' : '',
    title: LIVE ? 'Open in ' + app + ', in a new tab' : 'Open in ' + app,
    app: app,
    /* the canvas opens the board in place and hands the objective over; a live page's link names the objective
       itself, in a new tab, so nothing is left in this tab for the next app opened here to pick up */
    go: LIVE ? null : () => C.handoff({ app: kind === 'biz' ? 'sales' : 'exec', objective: o.id })
  };
}

/* ---- a project ---- */
function mineProjNode(C, ctx, g) {
  const D = C.D, P = ctx.P, td = ctx.today;
  const div = (P.divisions || []).find((d) => d && d.id === g.divId) || null;
  const divName = div ? (div.name || div.id) : g.divId;
  const row = { hasTag: true, tagCls: 'tag mine-ptag', tagText: 'Project' };
  if (g.init) {
    const init = g.init;
    const em = mineEmAll(C);
    let sc = null;
    try { sc = RD.rollupInitiative(init.id, P, em); } catch (e) { sc = null; }
    const b = MINE.bandOf(sc);
    const objs = (P.objectives || []).filter((o) => o && o.initiativeId === init.id);
    const order = ['Off track', 'At risk', 'On track', 'Not started', 'No score yet', 'Achieved', 'Abandoned'];
    const cnt = {};
    objs.forEach((o) => { const doc = (D.docs || {})[MINE.docKey(P, o.divisionId)] || mineBlankDoc(); const w = mineObjWord(C, o, doc, em).word; cnt[w] = (cnt[w] || 0) + 1; });
    const words = order.filter((w) => cnt[w]).map((w) => cnt[w] + ' ' + w.toLowerCase());
    const me = ctx.me ? ctx.me.email : '';
    const own = objs.filter((o) => MINE.owns(D, o, me)).length;
    let cap = F.plural(objs.length, 'objective') + (words.length ? ': ' + words.join(', ') : '');
    if (ctx.view !== 'team' && own < objs.length) cap += '. ' + (own === 1 ? '1 is yours' : own ? own + ' are yours' : 'None is yours');
    const win = init.plannedStart != null && init.plannedEnd != null ? F.dayAuto(init.plannedStart, td) + ' to ' + F.dayAuto(init.plannedEnd, td) : '';
    /* the next milestone: the first by date not achieved and not paused */
    const ms = (P.milestones || []).filter((m) => m && m.initiativeId === init.id && m.plannedDate != null && !RD.milestoneAchieved(m, em) && !RD.milestonePaused(P.milestoneState, m.id))
      .sort((a, b2) => a.plannedDate - b2.plannedDate)[0] || null;
    Object.assign(row, {
      name: init.name || init.id, sub: [divName, win].filter(Boolean).join(', '),
      date: ms ? F.dayAuto(ms.plannedDate, td) : '', dateSub: ms ? 'Next milestone: ' + (ms.name || ms.id) : '',
      score: F.score(sc), hasScore: sc != null,
      pBar: true, barCls: 'fill ' + F.tone(b.tone === 'none' ? 'none' : b.tone), barStyle: 'width: ' + (sc == null ? 0 : Math.round(minePct(sc))) + '%',
      barAria: sc == null ? 'No score yet' : 'Score ' + Math.round(sc) + ', ' + b.word.toLowerCase()
    });
    mineStatus(row, sc == null ? 'none' : b.tone, sc == null ? 'No score yet' : b.word);
    mineCap(row, cap);
  } else {
    Object.assign(row, { name: 'No project', sub: divName + ', objectives not in a project yet' });
  }
  row.hasSub = !!row.sub; row.hasDate = !!row.date; row.hasDateSub = !!row.dateSub;
  return mineNode('p:' + g.key, 'proj', row, { dflt: true });   // its rows: mineArrNodes
}

/* ---- a group of another level (division, unit, product, model, quarter, owner): what its objectives add up to,
   in the tree's own words (the mean of their scores in the score bands, their statuses) ---- */
function mineSetNode(C, ctx, g, fx) {
  const lab = mineGrpLabel(C, ctx, g);
  const sc = mineGrpScore(C, ctx, g, fx);
  const b = MINE.bandOf(sc);
  const cnt = {};
  g.entries.forEach((e) => { const f = fx.get(e); if (f) cnt[f.w.word] = (cnt[f.w.word] || 0) + 1; });
  const words = MINE_OBJ_ORDER.filter((w) => cnt[w]).map((w) => cnt[w] + ' ' + w.toLowerCase());
  const row = {
    hasTag: true, tagCls: 'tag', tagText: lab.tag,
    name: lab.name, sub: lab.sub, hasSub: !!lab.sub,
    owners: lab.emails ? mineAvatars(C, lab.emails) : [],
    score: F.score(sc), hasScore: sc != null,
    pBar: true, barCls: 'fill ' + F.tone(sc == null ? 'none' : b.tone), barStyle: 'width: ' + (sc == null ? 0 : Math.round(minePct(sc))) + '%',
    barAria: sc == null ? 'No score yet' : 'Mean score ' + Math.round(sc) + ', ' + b.word.toLowerCase()
  };
  row.hasOwners = row.owners.length > 0;
  mineStatus(row, sc == null ? 'none' : b.tone, sc == null ? 'No score yet' : b.word);
  mineCap(row, F.plural(g.entries.length, 'objective') + (words.length ? ': ' + words.join(', ') : ''));
  return mineNode('p:' + g.key, 'set', row, { dflt: true });
}
/* the tree's top rows, as the arrangement lays them out: groups with their groups or objectives, or objectives */
function mineArrNodes(C, ctx, A, fx) {
  const walk = (g) => {
    const n = g.dim === 'project' ? mineProjNode(C, ctx, g) : mineSetNode(C, ctx, g, fx);
    n.kids = g.kids ? g.kids.map(walk) : g.entries.map((e) => mineObjNode(C, ctx, e));
    return n;
  };
  return A.dims.length ? A.groups.map(walk) : A.flat.map((e) => mineObjNode(C, ctx, e));
}

/* ---- an objective ---- */
function mineObjNode(C, ctx, ent) {
  const o = ent.o;
  const octx = mineOctx(C, ctx, ent);
  const doc = octx.doc, em = octx.em, td = ctx.today;
  const me = ctx.me ? ctx.me.email : '';
  const sc = RD.objectiveScore(o.id, em);
  const w = mineObjWord(C, o, doc, em);
  const es = octx.end;
  const ps = o.plannedStart, pe = o.plannedEnd;
  const timed = ps != null && pe != null && pe > ps;
  const used = timed && td >= ps && !es ? Math.round(minePct((td - ps) / (pe - ps) * 100) * 10) / 10 : null;
  let sub = mineWhose(C, o, me) + ', ' + mineQLabel(o.quarter);
  if (!ent.full) {
    const bits = [];
    if (ent.exps.length) bits.push(F.plural(ent.exps.length, 'experiment'));
    if (ent.tiles.length) bits.push(F.plural(ent.tiles.length, 'tile'));
    sub += '. Just your ' + bits.join(' and ');
  }
  let dateSub;
  if (es) dateSub = (es.status === 'achieved' ? 'Achieved ' : 'Abandoned ') + F.dayAuto(es.endedDay, td);
  else if (ps != null && td < ps) dateSub = 'Starts in ' + F.plural(ps - td, 'day');
  else if (pe != null && pe >= td) dateSub = pe === td ? 'Ends today' : 'Ends in ' + F.plural(pe - td, 'day');
  else if (pe != null) dateSub = F.plural(td - pe, 'day') + ' past its end';
  else dateSub = 'No end date';
  /* the caption: time used, forecast and schedule, the plan revision; or how it ended; or when it can start */
  const krs = (doc.keyResults || []).filter((r) => r && r.objectiveId === o.id);
  const gates = (doc.stageGates || []).filter((g) => g && g.objectiveId === o.id);
  const bits = [];
  if (es) bits.push((es.status === 'achieved' ? 'Achieved ' : 'Abandoned ') + F.dayY(es.endedDay) + (es.note ? ': ' + mineNoStop(es.note) : ''));
  else {
    if (!krs.length && !gates.length) bits.push('Nothing planned yet');
    if (ps != null && td < ps) {
      const edge = ((ctx.P.objectiveEdges) || []).find((e) => e && e.toObj === o.id);
      const pred = edge ? (ctx.P.objectives || []).find((x) => x.id === edge.fromObj) : null;
      if (pred) {
        const casc = octx.casc();
        const pend = casc && casc.objectiveProjectedEnd && casc.objectiveProjectedEnd[pred.id] != null ? casc.objectiveProjectedEnd[pred.id] : pred.plannedEnd;
        const lag = Number(edge.lagDays) || 0;
        if (pend != null) bits.push('It can start ' + F.dayAuto(pend + lag, td) + ', after ' + (pred.statement || pred.id) + (lag ? ' plus ' + F.plural(lag, 'day') : ''));
      }
    } else {
      if (used != null) bits.push(Math.round(used) + '% of the time used');
      const casc = octx.casc();
      if (casc) {
        const wf = casc.objectiveWorkForecast ? casc.objectiveWorkForecast[o.id] : null;
        const slip = casc.objectiveScheduleSlip ? casc.objectiveScheduleSlip[o.id] : null;
        const sched = slip == null ? '' : slip > 0 ? F.plural(slip, 'day') + ' behind schedule' : 'on schedule';
        if (wf != null) bits.push('Forecast ' + F.dayAuto(wf, td) + (sched ? ', ' + sched : ''));
        else if (sched) bits.push(F.cap(sched));
      }
      const rev = RD.planRevision(doc, o.id);
      if (rev) bits.push((rev.v ? 'Plan v' + rev.v : 'Revised plan') + ' since ' + F.dayAuto(rev.day, td));
    }
  }
  const link = mineObjLink(C, o, octx.kind, octx.ro);
  const row = {
    hasTag: true, tagText: 'Objective',
    isLink: true, isPlain: false, href: link.href, target: link.target, rel: link.rel, go: link.go, linkTitle: link.title,
    name: o.statement || o.id, sub: sub, hasSub: true,
    /* the end date; before it starts, the start date */
    date: !es && ps != null && td < ps ? F.dayAuto(ps, td) : pe != null ? F.dayAuto(pe, td) : '—', hasDate: true, dateSub: dateSub, hasDateSub: !!dateSub,
    owners: mineAvatars(C, RD.ownersOf(o)),
    score: F.score(sc), hasScore: sc != null && !es,
    pBar: true, barCls: 'fill ' + F.tone(sc == null ? 'none' : w.tone), barStyle: 'width: ' + (sc == null ? 0 : Math.round(minePct(sc))) + '%',
    hasTick: used != null, tickStyle: used != null ? 'left: ' + used + '%' : '',
    barAria: (sc == null ? 'No score yet' : 'Score ' + Math.round(sc)) + (used != null ? ', ' + Math.round(used) + '% of the time used' : '')
  };
  row.hasOwners = row.owners.length > 0;
  mineStatus(row, w.tone, w.word);
  mineCap(row, bits.length ? bits.join('. ') : '');
  if (!krs.length && !gates.length && !es) Object.assign(row, { hasAct: true, actHref: link.href, actTarget: link.target, actRel: link.rel, actGo: link.go, actText: 'Plan it in ' + link.app });
  const n = mineNode('o:' + o.id, 'obj', row, { dflt: !es });   // an ended objective starts closed
  try { n.kids = mineGroups(C, ctx, ent, octx); } catch (e) {
    console.error('[mine] objective ' + o.id + ' could not be drawn', e);
    (C._vmErrors || (C._vmErrors = [])).push('mine: ' + o.id + ': ' + (e && e.message ? e.message : e));
    n.kids = [];
  }
  return n;
}

/* A header opens its part of the objective: the view by direct link for key results, stage-gates and the kanban
   (Execution's and Sales' ?objective=…&view=, a page of its own), the app on its tab for risks and experiments,
   which have no view (?tab=). A workstream or swimlane opens its group's view. Live: a new tab, read-only when
   this page is; the canvas: the other board, handed the objective and the tab. */
const MINE_GROUP_VIEW = { kr: ['view', 'krs'], gate: ['view', 'gates'], tile: ['view', 'kanban'], risk: ['tab', 'risks'], exp: ['tab', 'exp'] };
function mineGroupLink(C, octx, type) {
  const v = MINE_GROUP_VIEW[type];
  if (!v) return null;
  const biz = octx.kind === 'biz';
  const page = biz ? MINE_BIZ_PAGE : MINE_RD_PAGE;
  const app = biz ? 'Sales' : 'Execution';
  const what = 'the ' + MINE_GROUPS[type] + (LIVE && v[0] === 'view' ? ' view' : ' tab');
  return {
    href: LIVE ? page + '?objective=' + encodeURIComponent(octx.objId) + '&' + v[0] + '=' + v[1] + (octx.ro ? '&readonly' : '') : page,
    target: LIVE ? '_blank' : '', rel: LIVE ? 'noopener' : '',
    title: 'Open ' + what + ' in ' + app + (LIVE ? ', in a new tab' : ''),
    go: LIVE ? null : () => C.handoff({ app: biz ? 'sales' : 'exec', objective: octx.objId, tab: v[1] })
  };
}
function mineLinkHeader(n, L) {
  if (L) Object.assign(n.row, { gLink: true, gHref: L.href, gTarget: L.target, gRel: L.rel, gTitle: L.title, gGo: L.go });
}

/* ---- the groups under an objective ---- */
function mineGroups(C, ctx, ent, octx) {
  let items = [];
  try { items = typeof REVIEW !== 'undefined' && REVIEW ? REVIEW.items(C, octx) : []; } catch (e) { items = []; }
  const P = minePool(C, octx);
  const out = [];
  const oid = ent.o.id;
  if (ent.full) {
    const krIt = items.filter((it) => it.type === 'kr');
    if (krIt.length) out.push(mineKrGroup(C, ctx, ent, octx, krIt, P));
    const gIt = items.filter((it) => it.type === 'gate');
    if (gIt.length) out.push(mineGateGroup(C, ctx, ent, octx, gIt, P));
    const tIt = items.filter((it) => it.type === 'tile');
    if (tIt.length) out.push(mineTileGroup(C, ctx, ent, octx, tIt));
    const rIt = items.filter((it) => it.type === 'risk');
    if (rIt.length) out.push(mineRiskGroup(C, ctx, ent, octx, rIt));
  } else if (ent.tiles.length) {
    const tIt = items.filter((it) => it.type === 'tile');
    const g = mineTileGroup(C, ctx, ent, octx, tIt);
    if (g.kids.length) out.push(g);
  }
  const exps = mineExps(C, ctx, ent, octx);
  if (exps.length) out.push(mineExpGroup(C, ctx, ent, octx, exps));
  out.forEach((g) => {
    const L = mineGroupLink(C, octx, String(g.k).split(':')[2]);
    mineLinkHeader(g, L);
    g.kids.forEach((k) => { if (k.kind === 'grp') mineLinkHeader(k, L); });   // workstreams, swimlanes
  });
  void oid;
  return out;
}
function mineGroupNode(ent, type, count, extraRow, dflt) {
  const row = Object.assign({ isGroup: true, isPlain: false, gname: MINE_GROUPS[type], gcount: String(count), name: MINE_GROUPS[type] }, extraRow || {});
  return mineNode('g:' + ent.o.id + ':' + type, 'grp', row, { dflt: dflt, text: '' });
}

/* Key results: no score; the diagram counts every measure under them, each like a KPI */
function mineKrGroup(C, ctx, ent, octx, krIt, P) {
  const m = MINE.measures(octx.doc, ent.o.id, P, octx.em, (kr, i, list) => mineKrTag(octx, kr, i, list));
  const t = MINE.tally(m.parts);
  const what = F.list(m.terms.filter(Boolean));
  let cap = t.total ? (what ? what + ': ' : '') + t.text : 'Nothing measured yet';
  if (m.sampling) cap += '. ' + F.plural(m.sampling, 'KPI') + ' still sampling';
  const g = mineGroupNode(ent, 'kr', krIt.length, { pSeg: t.total > 0, segs: mineSegs(t), segAria: 'Key result measures by status: ' + (t.text || 'none') }, true);
  mineCap(g.row, cap);
  g.kids = krIt.map((it) => mineKrNode(C, ctx, ent, octx, it, P));
  return g;
}
function mineKrNode(C, ctx, ent, octx, it, P) {
  const doc = octx.doc, em = octx.em, td = ctx.today;
  const kr = (doc.keyResults || []).find((r) => r && r.id === it.id) || { id: it.id, trackingType: 'kpi' };
  const tt = kr.trackingType || 'kpi';
  const att = RD.keyResultScore(kr.id, em);
  const smp = RD.keyResultSample(kr.id, em);
  const r = it.row;
  const k = 'i:' + ent.o.id + ':kr:' + kr.id;
  const row = {
    hasTid: !!r.tid, tid: r.tid || '', name: r.name, sub: r.sub, hasSub: !!r.sub,
    date: r.date, hasDate: !!r.date, dateSub: r.dateSub, hasDateSub: !!r.dateSub,
    score: att == null ? '' : String(Math.round(att)), hasScore: att != null,
    pLine: true, lineCls: r.barCls, lineStyle: r.barStyle, lineTick: !!r.hasTick, lineTickStyle: r.tickStyle || '', lineAria: r.barAria || ''
  };
  mineStatus(row, MINE_REVIEW_TONE[it.status] || 'none', REVIEW.STATUS[it.status] ? REVIEW.STATUS[it.status].label : '');
  /* a percent key result's value is a button: set the progress here */
  const up = ['o:' + ent.o.id, 'g:' + ent.o.id + ':kr'];
  if (tt === 'percentage') mineValueBtn(C, ctx, row, k, { kind: 'pct', docKey: octx.docKey, krId: kr.id, label: r.tid || 'the key result', cur: kr.progress == null ? null : minePct(kr.progress), text: kr.progress == null ? 'Set progress' : mineNum1(minePct(kr.progress)) + '%', keep: up });
  else Object.assign(row, { lineStatic: true, lineVal: r.barVal });
  const cap = [r.pgSub];
  if (tt === 'milestone') { const st = kr.steps || []; cap.push(st.filter((x) => minePct(x.completion) >= 100).length + ' of ' + F.plural(st.length, 'step') + ' done'); }
  if (smp.partial) cap.push('Scored on the samples so far');
  mineCap(row, cap.filter(Boolean).join('. '));
  const n = mineNode(k, 'item', row);
  if (tt === 'milestone') {
    const steps = kr.steps || [];
    const eff = RD.milestoneEffectiveWeights(steps);
    steps.forEach((x, j) => n.kids.push(mineStepNode(C, ctx, ent, octx, kr, x, j, eff, up.concat([k]))));
  }
  (it.kids || []).forEach((rv) => { if (/^kpi:/.test(rv.k)) n.kids.push(mineKpiNode(C, ctx, ent, octx, rv, P, up.concat([k]))); });
  n.dflt = it.status === 'off' || it.status === 'risk';
  return n;
}
function mineStepNode(C, ctx, ent, octx, kr, x, j, eff, keep) {
  const td = ctx.today;
  const c = minePct(x.completion), done = c >= 100;
  const due = mineDayOf(x.due);
  const late = !done && due != null && due < td;
  const e = (eff || []).find((y) => y.id === x.id);
  const name = mineTxt(x.name) || 'Unnamed step';
  const k = 's:' + ent.o.id + ':' + kr.id + ':' + (x.id || j);
  const row = {
    iconStep: true, name: name, hasSub: true,
    sub: 'Step ' + (j + 1) + (e ? ', weight ' + e.w.toFixed(e.auto ? 1 : 0) + '%' + (e.auto ? ', shared' : '') : ''),
    date: due != null ? F.dayAuto(due, td) : '', hasDate: due != null, dateSub: due == null ? 'No due date' : done ? '' : F.cap(F.rel(due, td)),
    pLine: true, lineCls: 'fill' + (done ? ' t-ok' : c > 0 ? ' t-info' : ''), lineStyle: 'width: ' + Math.round(c) + '%', lineAria: name + ': ' + mineNum1(c) + '% done'
  };
  row.hasDateSub = !!row.dateSub;
  mineStatus(row, done ? 'done' : late ? 'bad' : c > 0 ? 'info' : 'none', done ? 'Done' : late ? 'Late' : c > 0 ? 'In progress' : 'Not started');
  mineValueBtn(C, ctx, row, k, { kind: 'step', docKey: octx.docKey, krId: kr.id, stepId: x.id, label: name, cur: c, text: mineNum1(c) + '%', keep: keep });
  return mineNode(k, 'kid', row);
}
/* the rows above a value someone clicks stay open, so a reading that changes their status (a gate that passes,
   a key result back on track) never folds the value away (the review table does the same) */
function mineKeep(C, keys) {
  const m = C.state.mine_open || {};
  if (!(keys || []).some((k) => m[k] !== true)) return;
  const n = Object.assign({}, m);
  keys.forEach((k) => { n[k] = true; });
  C.setState({ mine_open: n });
}
/* one KPI or target: the review table's row, its reading controls (KPI.post) and readings drawer */
function mineKpiNode(C, ctx, ent, octx, rv, P, keep) {
  const kpiId = rv.k.slice(4);
  const kp = P.find((x) => x && x.id === kpiId) || null;
  const pp = kp ? RD.kpiScoreParts(kp, P, octx.em) : null;
  const isGate = !!kp && kp.hostType === 'stageGate';
  const def = kp ? (RD.definerOf(kp, P) || kp) : null;
  let crit = mineTxt(rv.sub);
  if (/^target /i.test(crit)) crit = crit.slice(7);
  let sub = (isGate ? 'Target' : 'KPI') + (crit ? ', ' + mineLow1(crit) : '');
  if (def && def.targetType === 'statistical' && Number(def.readCount) > 0) sub += ', ' + String(def.statistic || 'average').replace('stddev', 'standard deviation') + ' of ' + F.plural(Number(def.readCount), 'sample');
  const k = 'k:' + ent.o.id + ':' + kpiId;
  const click = rv.vClick ? () => { mineKeep(C, keep); rv.vClick(); } : null;
  const row = {
    iconGauge: !isGate, iconTarget: isGate, name: rv.name, sub: sub, hasSub: true,
    date: rv.date, hasDate: !!rv.date, dateSub: rv.dateSub, hasDateSub: !!rv.dateSub,
    score: pp && pp.score != null ? String(Math.round(pp.score)) : '', hasScore: !!(pp && pp.score != null),
    pLine: !!rv.pgBar, lineCls: rv.barCls, lineStyle: rv.barStyle, lineAria: rv.barAria || '',
    lineStatic: !!rv.pgBar && !!rv.barValStatic, lineVal: rv.barVal || '',
    lineBtn: !!rv.valInBar, btnCls: rv.vCls, btnAria: rv.vAria, btnTitle: rv.vTitle, btnExp: rv.vExp, btnClick: click, btnText: rv.vText,
    pGauge: !!rv.pgGauge, gAria: rv.gAria, bandStyle: rv.bandStyle, hasMk: !!rv.hasMk, mkStyle: rv.mkStyle, gmkCls: rv.gmkCls, gLabels: rv.gLabels || [],
    pText: !!rv.pgText, pTxt: rv.pgTxt || '', pTxtCls: rv.pgTxtCls || '',
    pValLine: !!rv.valLine,
    pKpiEd: !!rv.kpiEd, ed: rv.ed || null
  };
  if (row.pValLine) Object.assign(row, { btnCls: rv.vCls, btnAria: rv.vAria, btnTitle: rv.vTitle, btnExp: rv.vExp, btnClick: click, btnText: rv.vText });
  mineStatus(row, (function () { const t = mineTone(rv.stCls); return rv.stWord === 'Met' ? 'ok' : t; })(), rv.stWord);
  mineCap(row, [rv.pgSub && !rv.pgGauge ? rv.pgSub : '', mineNoStop(rv.note)].filter(Boolean).join('. '));
  const n = mineNode(k, 'kid', row);
  n.due = kp && !octx.ended ? MINE.due(kp, P, octx.em, octx.doc, ctx.today, (g) => mineGateLabel(octx.doc, g)) : null;
  if (rv.drawer) n.drawer = rv.drawer;
  return n;
}
/* the inline editor for a percent key result's progress and a milestone step's completion */
function mineValueBtn(C, ctx, row, k, spec) {
  const ed = C.state.mine_edit;
  if (ed && ed.k === k) {
    row.pMyEd = true;
    row.my = {
      v: ed.v == null ? '' : String(ed.v),
      aria: 'New value for ' + spec.label + ', in %',
      ph: spec.kind === 'pct' ? '0 to 100' : '0 to 100, blank is 0',
      err: ed.err || '', hasErr: !!ed.err,
      onChange: (e) => { const cur = C.state.mine_edit; if (cur && cur.k === k) C.setState({ mine_edit: Object.assign({}, cur, { v: mineVal(e), err: '' }) }); },
      onKey: (e) => {
        if (!e) return;
        if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); mineCommitEdit(C, 'enter'); }
        else if (e.key === 'Escape') { if (e.preventDefault) e.preventDefault(); C.setState({ mine_edit: null }); }
      },
      onBlur: () => mineCommitEdit(C, 'blur')
    };
    return;
  }
  if (ctx.ro) { Object.assign(row, { lineStatic: true, lineVal: spec.text }); return; }
  Object.assign(row, {
    lineBtn: true, btnCls: 'kpi-val review-val', btnAria: 'Update ' + spec.label + ', % complete', btnTitle: 'Click to update', btnExp: null, btnText: spec.text,
    btnClick: () => {
      if (!C.guard()) return;
      mineKeep(C, spec.keep);
      C.setState({ mine_edit: { k: k, kind: spec.kind, docKey: spec.docKey, krId: spec.krId, stepId: spec.stepId || '', label: spec.label, v: spec.cur == null ? '' : mineNum1(spec.cur), err: '' }, kpi_ed: null, menu: '' });
    }
  });
}
function mineCommitEdit(C, how) {
  const ed = C.state.mine_edit;
  if (!ed) return;
  const t = String(ed.v == null ? '' : ed.v).trim();
  if (t === '' && ed.kind === 'pct') { C.setState({ mine_edit: null }); return; }   // a percent key result's blank changes nothing
  const n = t === '' ? 0 : K.num(t);                                                  // a step's blank is 0, as on the Key results tab
  if (n == null) {
    if (how === 'blur') { C.setState({ mine_edit: null }); return; }
    C.setState({ mine_edit: Object.assign({}, ed, { err: 'Use a number from 0 to 100, like 60.' }) });
    return;
  }
  const v = minePct(n);
  C.setState({ mine_edit: null });
  C.mutate((D) => {
    const doc = (D.docs || {})[ed.docKey];
    const kr = doc && (doc.keyResults || []).find((x) => x && x.id === ed.krId);
    if (!kr) return false;
    if (ed.kind === 'pct') { if (kr.progress != null && Number(kr.progress) === v) return false; kr.progress = v; return true; }
    const st = (kr.steps || []).find((x) => x && x.id === ed.stepId);
    if (!st || Number(st.completion) === v) return false;
    st.completion = v;
    return true;
  }, { msg: ed.label + ' set to ' + mineNum1(v) + '%.' });
}

/* Stage-gates: no score; a status bar and gate health. Under it the workstreams, as the Stage-gates tab and the
   review table head them (Workstream A: name), each with its gates by due date, so SG-A1, A2, A3 run in order */
function mineGateGroup(C, ctx, ent, octx, gIt, P) {
  const doc = octx.doc, td = ctx.today, oid = ent.o.id;
  const t = MINE.tally(gIt.map((it) => minePart(it)));
  const gh = RD.objectiveGateReadiness(oid, octx.em, td);
  const nSets = (doc.stageGateSets || []).filter((x) => x && x.objectiveId === oid).length;
  const gates = (doc.stageGates || []).filter((g) => g && g.objectiveId === oid);
  const passed = gates.filter((g) => g.actualDate != null).length;
  const over = gates.filter((g) => g.actualDate == null && g.plannedDate != null && g.plannedDate < td).length;
  const counts = passed + ' of ' + F.plural(gates.length, 'gate') + ' passed' + (over ? ', ' + over + ' overdue' : '');
  let cap = counts;
  if (gh != null && nSets > 1) cap = 'Gate health ' + Math.round(gh) + '%, the ' + (nSets === 2 ? 'weaker' : 'weakest') + ' of ' + nSets + ' workstreams. ' + counts;
  else if (gh != null) cap = 'Gate health ' + Math.round(gh) + '%: ' + counts;
  const g = mineGroupNode(ent, 'gate', gIt.length, { pSeg: true, segs: mineSegs(t), segAria: 'Stage-gates by status: ' + t.text }, true);
  mineCap(g.row, cap);
  const byId = {};
  gates.forEach((x) => { byId[x.id] = x; });
  g.kids = mineSubGroups(gIt, 'No workstream').map((sg) => mineWsNode(C, ctx, ent, octx, sg, P, byId));
  return g;
}
/* one workstream: its gates by due date (the Stage-gates tab's order), how many have passed, the next one */
function mineWsNode(C, ctx, ent, octx, sg, P, byId) {
  const oid = ent.o.id, td = ctx.today, s = sg.grp;
  const gOf = (it) => byId[it.id] || null;
  const dueOf = (it) => { const g = gOf(it); return g && g.plannedDate != null ? g.plannedDate : Infinity; };
  const items = sg.items.slice().sort((a, b) => (dueOf(a) - dueOf(b)) || String((gOf(a) || {}).name || '').localeCompare(String((gOf(b) || {}).name || '')) || String(a.id).localeCompare(String(b.id)));
  const name = (s.label || 'No workstream') + (s.name ? ': ' + s.name : '');
  const k = 'g:' + oid + ':gate:' + s.key;
  const t = MINE.tally(items.map((it) => minePart(it)));
  const gs = items.map(gOf).filter(Boolean);
  const over = gs.filter((g) => RD.classifyGate(g, td) === 'overdue').length;
  const next = gs.find((g) => g.actualDate == null && g.plannedDate != null) || null;
  const bits = [mineNoStop(s.meta) + (over ? ', ' + over + ' overdue' : '')];
  if (next) {
    const sc = RD.stageGateScore(next.id, octx.em);
    bits.push('Next: ' + (mineTxt(next.name) || next.id) + (sc != null ? ', ' + Math.round(sc) + '% ready' : '') + ', ' + F.dayAuto(next.plannedDate, td));
  }
  const row = { isGroup: true, isPlain: false, gname: name, gcount: String(items.length), name: name, pSeg: t.total > 0, segs: mineSegs(t), segAria: name + ', gates by status: ' + t.text };
  mineCap(row, bits.filter(Boolean).join('. '));
  const n = mineNode(k, 'grp', row, { dflt: true, text: name.toLowerCase() });
  n.kids = items.map((it) => mineGateNode(C, ctx, ent, octx, it, P, k));
  return n;
}
function mineGateNode(C, ctx, ent, octx, it, P, wsKey) {
  const oid = ent.o.id;
  const r = it.row;
  const row = {
    hasTid: !!r.tid, tid: r.tid || '', name: r.name, sub: mineNoStop(r.sub), hasSub: !!mineTxt(r.sub),
    date: r.date, hasDate: !!r.date, dateSub: r.dateSub, hasDateSub: !!r.dateSub
  };
  if (r.pgBar) Object.assign(row, { pLine: true, lineCls: r.barCls, lineStyle: r.barStyle, lineAria: r.barAria || '', lineStatic: true, lineVal: r.barVal });
  else if (r.pgText) Object.assign(row, { pText: true, pTxt: r.pgTxt, pTxtCls: r.pgTxtCls === 'sub' ? 'mine-ptxt' : '' });
  mineStatus(row, MINE_REVIEW_TONE[it.status] || 'none', REVIEW.STATUS[it.status] ? REVIEW.STATUS[it.status].label : '');
  const cap = [];
  if (r.pgBar && r.pgSub) cap.push(r.pgSub);
  if (it.status === 'done' && it.reason) cap.push(F.cap(it.reason));
  if (r.note) cap.push(mineNoStop(r.note));
  mineCap(row, cap.join('. '));
  const n = mineNode('i:' + oid + ':gate:' + it.id, 'item', row);
  const keep = ['o:' + oid, 'g:' + oid + ':gate', wsKey, n.k];
  (it.kids || []).forEach((rv) => { if (/^kpi:/.test(rv.k)) n.kids.push(mineKpiNode(C, ctx, ent, octx, rv, P, keep)); });
  n.dflt = it.status === 'off' || it.status === 'risk';
  return n;
}
/* the review table's workstream and swimlane headings (each item's grp), in their order; the items keep theirs */
function mineSubGroups(items, fallback) {
  const out = [], by = {};
  items.forEach((it) => {
    const s = it.grp || { key: '', order: 1e9, label: fallback, name: '', meta: '' };
    if (!by[s.key]) { by[s.key] = { grp: s, items: [] }; out.push(by[s.key]); }
    by[s.key].items.push(it);
  });
  return out.sort((a, b) => (a.grp.order || 0) - (b.grp.order || 0));
}
/* an item's status as a part of a status bar */
function minePart(it, n) {
  return { tone: MINE_REVIEW_TONE[it.status] || 'none', word: REVIEW.STATUS[it.status] ? REVIEW.STATUS[it.status].label : '', n: n || 1 };
}

/* Kanban: a status bar. Under it the board's swimlanes, as the Kanban tab orders them and the review table heads
   them (then "No swimlane"), each with its tiles; in someone else's objective, only your tiles */
function mineTileGroup(C, ctx, ent, octx, tIt) {
  const oid = ent.o.id;
  const mineOnly = !ent.full;
  const want = {};
  ent.tiles.forEach((id) => { want[id] = 1; });
  const lanes = [], all = [];
  let total = 0;
  mineSubGroups(tIt, 'No swimlane').forEach((sg) => {
    const rows = [], parts = [];
    let units = 0, yours = 0;
    sg.items.forEach((it) => {
      if (/^done:/.test(it.key)) {
        /* a swimlane's finished tiles, one row with the tiles under it */
        const kidsAll = it.kids || [];
        kidsAll.forEach((kv) => { if (want[String(kv.k).slice(5)]) yours++; });
        const kids = kidsAll.filter((kv) => !mineOnly || want[String(kv.k).slice(5)]);
        if (mineOnly) { kids.forEach((kv) => { parts.push(minePart(it)); units++; rows.push(mineDoneTile(C, ctx, ent, octx, kv)); }); return; }
        parts.push(minePart(it, it.units || 1));
        units += it.units || 1;
        const n = mineTileNode(C, ctx, ent, octx, it);
        n.kids = kids.map((kv) => mineDoneTile(C, ctx, ent, octx, kv));
        rows.push(n);
        return;
      }
      if (want[it.id]) yours++;
      if (mineOnly && !want[it.id]) return;
      parts.push(minePart(it));
      units++;
      rows.push(mineTileNode(C, ctx, ent, octx, it));
    });
    if (!rows.length) return;
    parts.forEach((p) => all.push(p));
    total += units;
    lanes.push(mineLaneNode(ent, sg.grp, rows, parts, units, mineOnly ? 0 : yours));
  });
  const t = MINE.tally(all);
  const boards = (octx.doc.boards || []).filter((b) => b && b.objectiveId === oid);
  const yours = ent.tiles.length;
  const what = boards.length > 1 ? F.plural(boards.length, 'board') : boards.length ? (mineTxt(boards[0].name) || 'Untitled') + ' board' : 'Board';
  const cap = mineOnly ? 'Your ' + F.plural(yours, 'tile') + ' on the ' + what : what + (yours ? '. ' + (yours === 1 ? '1 tile is yours' : yours + ' tiles are yours') : '');
  const g = mineGroupNode(ent, 'tile', total, { pSeg: t.total > 0, segs: mineSegs(t), segAria: 'Kanban tiles by status: ' + t.text }, mineOnly);
  mineCap(g.row, cap);
  g.kids = lanes;
  return g;
}
/* one swimlane: its stage limit and deadline (the review table's words), its tiles, how many are yours */
function mineLaneNode(ent, s, rows, parts, units, yours) {
  const t = MINE.tally(parts);
  const name = s.label || 'No swimlane';
  const row = { isGroup: true, isPlain: false, gname: name, gcount: String(units), name: name, pSeg: t.total > 0, segs: mineSegs(t), segAria: name + ', tiles by status: ' + t.text };
  mineCap(row, [mineNoStop(s.meta), yours ? (yours === 1 ? '1 tile is yours' : yours + ' tiles are yours') : ''].filter(Boolean).join('. '));
  const n = mineNode('g:' + ent.o.id + ':tile:' + s.key, 'grp', row, { dflt: true, text: name.toLowerCase() });
  n.kids = rows;
  return n;
}
function mineTileNode(C, ctx, ent, octx, it) {
  const r = it.row;
  const tile = mineFindTile(octx.doc, ent.o.id, it.id);
  /* under its swimlane heading the row needn't name the swimlane, and the Owner column names the person */
  const sub = tile && tile.assignee ? '' : r.subGrp !== undefined ? r.subGrp : r.sub;
  const row = {
    iconTile: true, name: r.name, sub: sub, hasSub: !!sub,
    date: r.date, hasDate: !!r.date, dateSub: r.dateSub, hasDateSub: !!r.dateSub,
    owners: tile && tile.assignee ? mineAvatars(C, [tile.assignee]) : [],
    pStage: !!r.pgStage, pips: r.pips || [], stage: r.stage || '',
    pText: !!r.pgText, pTxt: r.pgTxt || '', pTxtCls: r.pgTxtCls === 'sub' ? 'mine-ptxt' : ''
  };
  row.hasOwners = row.owners.length > 0;
  mineStatus(row, MINE_REVIEW_TONE[it.status] || 'none', REVIEW.STATUS[it.status] ? REVIEW.STATUS[it.status].label : '');
  mineCap(row, r.pgSub || '');
  return mineNode('i:' + ent.o.id + ':tile:' + it.id, 'item', row);
}
function mineDoneTile(C, ctx, ent, octx, kv) {
  const id = String(kv.k).slice(5);
  const tile = mineFindTile(octx.doc, ent.o.id, id);
  const sub = tile && tile.assignee ? '' : kv.subGrp !== undefined ? kv.subGrp : kv.sub;
  const row = {
    iconTile: true, name: kv.name, sub: sub, hasSub: !!sub,
    date: kv.date, hasDate: !!kv.date, dateSub: kv.dateSub, hasDateSub: !!kv.dateSub,
    owners: tile && tile.assignee ? mineAvatars(C, [tile.assignee]) : [],
    pText: !!kv.pgText, pTxt: kv.pgTxt || '', pTxtCls: ''
  };
  row.hasOwners = row.owners.length > 0;
  mineStatus(row, 'done', 'Done');
  mineCap(row, kv.pgSub || '');
  return mineNode('i:' + ent.o.id + ':tile:' + id, 'kid', row);
}
function mineFindTile(doc, objId, id) {
  let hit = null;
  (doc.boards || []).forEach((b) => { if (!hit && b && b.objectiveId === objId) hit = (b.tiles || []).find((t) => t && t.id === id) || null; });
  return hit;
}

/* Risks: a status bar, the worst open problem */
function mineRiskGroup(C, ctx, ent, octx, rIt) {
  const oid = ent.o.id;
  const t = MINE.tally(rIt.map((it) => ({ tone: MINE_REVIEW_TONE[it.status] || 'none', word: REVIEW.STATUS[it.status] ? REVIEW.STATUS[it.status].label : '' })));
  let worst = null;
  rIt.forEach((it) => { if (it.status !== 'done' && it.row && Number(it.row.rpnVal) > 0 && (!worst || Number(it.row.rpnVal) > Number(worst.row.rpnVal))) worst = it; });
  const cap = worst ? 'Worst open RPN ' + worst.row.rpnVal + ': ' + mineLow1(worst.row.name) : 'Nothing open';
  const g = mineGroupNode(ent, 'risk', rIt.length, { pSeg: true, segs: mineSegs(t), segAria: 'Risks by status: ' + t.text }, false);
  mineCap(g.row, cap);
  g.kids = rIt.map((it) => {
    const r = it.row;
    const row = {
      name: r.name, sub: r.sub, hasSub: !!r.sub,
      date: r.date, hasDate: !!r.date, dateSub: r.dateSub, hasDateSub: !!r.dateSub,
      pRpn: true, rpnPre: r.rpnPre, rpnVal: r.rpnVal
    };
    mineStatus(row, MINE_REVIEW_TONE[it.status] || 'none', REVIEW.STATUS[it.status] ? REVIEW.STATUS[it.status].label : '');
    mineCap(row, [r.pgSub, mineNoStop(r.note)].filter(Boolean).join('. '));
    const n = mineNode('i:' + oid + ':risk:' + it.id, 'item', row);
    n.kids = (it.kids || []).map((kv, j) => {
      const kr = {
        iconCause: true, name: kv.name, sub: kv.sub, hasSub: !!kv.sub,
        pRpn: true, rpnPre: kv.rpnPre, rpnVal: kv.rpnVal
      };
      mineStatus(kr, /review-d-done/.test(kv.stDot || '') ? 'done' : mineTone(kv.stCls), kv.stWord + (kv.stSub ? ', ' + mineLow1(kv.stSub) : ''));
      mineCap(kr, mineNoStop(kv.note));
      return mineNode('c:' + oid + ':' + it.id + ':' + (kv.k || j), 'kid', kr);
    });
    n.dflt = false;
    return n;
  });
  return g;
}

/* Experiments: every experiment of an objective you see in full; in someone else's, the ones you run. Execution
   objectives only: Sales has no Experiments tab since November 3, so a business objective shows none */
function mineExps(C, ctx, ent, octx) {
  if (typeof ETB === 'undefined' || !ETB || octx.kind === 'biz') return [];
  let T;
  try { T = ETB.trees(C, octx); } catch (e) { return []; }
  const want = {};
  ent.exps.forEach((x) => { want[x] = 1; });
  const out = [];
  (T.list || []).forEach((entry) => {
    const ex = (entry.view && entry.view.experiments) || {};
    Object.keys(ex).forEach((id) => {
      const e = ex[id];
      if (!e || typeof e !== 'object') return;
      if (!ent.full && !want[entry.tid + '|' + id]) return;
      out.push({ entry: entry, exp: e });
    });
  });
  return out;
}
/* an experiment's status as its own app says it: Execution counts a planned one with key-read data as in
   progress (ETB.derivedStatus); Sales goes by the stored status */
function mineExpStatus(C, octx, exp) {
  if (octx.kind === 'biz') return exp && exp.actual_outcome ? 'complete' : (exp && exp.status) || 'planned';
  return ETB.derivedStatus(C, octx, exp);
}
function mineExpGroup(C, ctx, ent, octx, exps) {
  const parts = exps.map((x) => {
    const st = mineExpStatus(C, octx, x.exp);
    return { tone: st === 'complete' ? 'done' : st === 'in_progress' ? 'info' : 'none', word: ETB.statusWord(st) };
  });
  const t = MINE.tally(parts);
  const me = String(ctx.me ? ctx.me.email : '').toLowerCase();
  const ownerOf = (x) => MINE.person(C.D, x.exp.owner);
  let cap;
  if (!ent.full) {
    const total = exps.length;
    const rest = [];
    try { ETB.trees(C, octx).list.forEach((en) => Object.keys((en.view && en.view.experiments) || {}).forEach((id) => { const e = en.view.experiments[id]; if (e && typeof e === 'object' && MINE.person(C.D, e.owner) !== me) rest.push(MINE.person(C.D, e.owner)); })); } catch (e) { /* no others */ }
    const names = K.uniq(exps.map((x) => x.entry.name || 'the logic tree'));
    const who = K.uniq(rest.filter(Boolean));
    cap = 'Your ' + F.plural(total, 'experiment') + ', in ' + F.list(names);
    if (rest.length) cap += '. ' + (who.length === 1 && rest.every(Boolean) ? F.first(who[0]) + ' runs ' + rest.length + ' more' : rest.length + ' more are run by others');
  } else {
    /* the trees, and whose they are when one other person runs every experiment in it */
    const trees = K.uniq(exps.map((x) => x.entry.tid));
    const byPerson = {};
    trees.forEach((tid) => {
      const own = K.uniq(exps.filter((x) => x.entry.tid === tid).map(ownerOf));
      if (own.length === 1 && own[0] && own[0] !== me) byPerson[own[0]] = (byPerson[own[0]] || 0) + 1;
    });
    cap = F.plural(trees.length, 'logic tree') + Object.keys(byPerson).map((e) => ', ' + (byPerson[e] === 1 ? '1 is ' : byPerson[e] + ' are ') + F.first(e) + '’s').join('');
    const yours = exps.filter((x) => ownerOf(x) === me);
    const cur = (yours.length ? yours : exps).find((x) => mineExpStatus(C, octx, x.exp) === 'in_progress');
    if (cur && octx.kind !== 'biz') {
      const phrase = mineStripPhrase(STEP.strip(C, octx, cur.exp));
      if (phrase) cap += '. ' + (yours.length ? 'Your ' : '') + (cur.exp.code || cur.exp.id) + ' ' + phrase;
    }
  }
  const g = mineGroupNode(ent, 'exp', exps.length, { pSeg: true, segs: mineSegs(t), segAria: 'Experiments by status: ' + t.text }, !ent.full);
  mineCap(g.row, cap);
  g.kids = exps.map((x) => mineExpNode(C, ctx, ent, octx, x.entry, x.exp));
  return g;
}
/* the current step's match in a few words: "matched Margin holds", "is trending toward Compression was the cause" */
function mineStripPhrase(s) {
  const h = String((s && s.head) || '');
  let m = /^Matched: (.+)$/.exec(h);
  if (m) return 'matched ' + m[1];
  m = /^Trending toward: (.+)$/.exec(h);
  if (m) return 'is trending toward ' + m[1];
  if (/^Multiple results match/.test(h)) return 'matches more than one result';
  if (/^No defined result matches/.test(h)) return 'matches no defined result';
  return '';
}
function mineExpNode(C, ctx, ent, octx, entry, exp) {
  const td = ctx.today;
  const st = mineExpStatus(C, octx, exp);
  const tone = st === 'complete' ? 'done' : st === 'in_progress' ? 'info' : 'none';
  const exec = octx.kind !== 'biz';
  const k = 'x:' + ent.o.id + ':' + entry.tid + ':' + exp.id;
  const row = {
    hasTid: true, tid: exp.code || exp.id, name: exp.name || 'Untitled experiment',
    sub: mineNoStop(exp.hypothesis), hasSub: !!mineTxt(exp.hypothesis),
    owners: exp.owner ? mineAvatars(C, [exp.owner]) : []
  };
  row.hasOwners = row.owners.length > 0;
  mineStatus(row, tone, ETB.statusWord(st));
  const ao = exp.actual_outcome || null;
  const done = mineDayOf(exp.completed_date || (ao && ao.recorded_date));
  const planned = mineDayOf(exp.planned_date);
  if (st === 'complete') Object.assign(row, { date: done != null ? F.dayAuto(done, td) : '—', dateSub: 'Completed' });
  else if (planned != null) Object.assign(row, { date: F.dayAuto(planned, td), dateSub: st === 'in_progress' ? 'Planned start' : 'Planned' });
  else Object.assign(row, { date: '—', dateSub: 'Not scheduled' });
  row.hasDate = !!row.date; row.hasDateSub = !!row.dateSub;
  const codeOf = (id) => { const x = entry.view.experiments[id]; return x ? (x.code || x.id) : id; };
  if (st === 'complete' && ao) {
    const rid = ao.result_id;
    const res = (exp.possible_results || []).find((r) => r && r.id === rid) || null;
    const label = rid === 'inconclusive' ? 'Inconclusive' : rid === 'other' ? 'Unanticipated result' : res ? (res.label || 'Recorded') : 'Recorded';
    const next = K.uniq(mineArr(ao.next_experiment_ids).concat(res ? mineArr(res.next_experiment_ids) : [])).map(codeOf);
    Object.assign(row, { pText: true, pTxt: label, pTxtCls: 'mine-strong' });
    mineCap(row, [mineNoStop(ao.note || ao.conclusion || (res && res.conclusion)), next.length ? 'Next: ' + F.list(next) : ''].filter(Boolean).join('. '));
  } else if (st === 'in_progress' && exec) {
    const s = STEP.strip(C, octx, exp);
    const krs = exp.key_reads || [];
    const measured = krs.filter((kk) => ETB.krCurrent(C, octx, exp, kk).n > 0).length;
    const ready = s.complete && (s.m && s.m.matched && s.m.matched.length === 1);
    Object.assign(row, { pText: true, pTxt: s.head, pTxtCls: 'mine-strong ' + (s.tone === 'ok' ? 'tx-ok' : s.tone === 'warn' ? 'tx-warn' : '') });
    mineCap(row, [krs.length ? measured + ' of ' + F.plural(krs.length, 'key read') + ' measured' : 'No key reads', ready ? 'Ready to conclude' : ''].filter(Boolean).join('. '));
  } else if (st === 'in_progress') {
    Object.assign(row, { pText: true, pTxt: 'Under way', pTxtCls: 'mine-strong' });
    mineCap(row, 'Its outcome is recorded in Sales');
  } else {
    /* planned: what has to happen first */
    let why = '';
    if (exp.repeat_of) why = 'Repeat of ' + codeOf(exp.repeat_of);
    Object.keys(entry.view.experiments || {}).some((pid) => {
      const p = entry.view.experiments[pid];
      if (!p || pid === exp.id) return false;
      const res = (p.possible_results || []).find((r) => r && mineArr(r.next_experiment_ids).indexOf(exp.id) >= 0);
      if (!res) return false;
      const pao = p.actual_outcome;
      if (!pao) why = 'Runs only if ' + (p.code || p.id) + ' concludes ' + (res.label || 'that result');
      else if (pao.result_id === res.id) why = 'Next up: ' + (p.code || p.id) + ' concluded ' + (res.label || 'that result');
      else why = 'Not pursued: ' + (p.code || p.id) + ' concluded otherwise';
      return true;
    });
    mineCap(row, why);
  }
  const n = mineNode(k, 'item', row);
  /* the key reads of an experiment in progress (Execution): the Current step's own controls */
  if (st === 'in_progress' && exec && typeof STEP !== 'undefined' && typeof STEP.keyReadRow === 'function') {
    const keep = ['o:' + ent.o.id, 'g:' + ent.o.id + ':exp', k];
    (exp.key_reads || []).forEach((kk) => n.kids.push(mineReadNode(C, ctx, ent, octx, entry, exp, kk, keep)));
  }
  n.dflt = st === 'in_progress' && n.kids.length > 0;
  return n;
}
function mineReadNode(C, ctx, ent, octx, entry, exp, kk, keep) {
  const td = ctx.today;
  const r0 = STEP.keyReadRow(C, octx, entry, exp, kk);
  const r = Object.assign({}, r0, { click: () => { mineKeep(C, keep); r0.click(); } });
  let sub = 'Key read, ' + (r.crit || 'no pass criterion');
  let date = '', dateSub = '';
  if (kk.source_kpi_gid) {
    const P = minePool(C, octx);
    const kp = P.find((x) => x && x.id === kk.source_kpi_gid) || null;
    if (kp) {
      const host = kp.hostType === 'keyResult' ? (function () { const list = (octx.doc.keyResults || []).filter((x) => x.objectiveId === kp.objectiveId); const kr = list.find((x) => x.id === kp.hostId); return kr ? mineKrTag(octx, kr, list.indexOf(kr), list) + '’s KPI' : 'a KPI'; })()
        : kp.hostType === 'stageGate' ? (function () { const g = (octx.doc.stageGates || []).find((x) => x.id === kp.hostId); return g ? mineGateLabel(octx.doc, g) + '’s target' : 'a target'; })() : 'a KPI';
      sub += '. Linked to ' + host;
      const u = RD.readingsFor(RD.readingSourceId(kp, P), octx.em)[0];
      if (u && u.timestamp) { date = F.dayAuto(F.dayOfMs(u.timestamp), td); dateSub = u.by ? F.first(u.by) : ''; }
    }
  }
  const row = {
    iconGauge: true, name: r.name, sub: sub, hasSub: true,
    date: date, hasDate: !!date, dateSub: dateSub, hasDateSub: !!dateSub,
    pRead: true, reads: [r]
  };
  return mineNode('r:' + ent.o.id + ':' + entry.tid + ':' + exp.id + ':' + kk.id, 'kid', row);
}

/* ------------------------------------------------------------- the roll-up panel */
/* Above the tree, one panel rolls up everything in view: the scorecard, then the timeline under it (round 5 of
   the "My Projects" canvas, proposal E, decided October 21).
     Scorecard  the quarter's weeks; the objectives' mean score and median; each scored objective as a dot on a
                0 to 100 line shaded by pace, with the time elapsed as its mark (October 22: it was the mean's, on
                the engine's three bands); facts (objectives by status, key results on track by pace, stage-gates
                passed and overdue, behind schedule, open high risk, readings due); a note for anything past the
                schedule alarm.
     Timeline   every objective on one time axis: its planned window in its status by pace, the forecast finish,
                its stage-gates (passed, overdue, ahead), its project's milestones, today, and how far behind, in
                Group by's layers and Sort by's order. Past MINE_TL_FOLD objectives the last level starts folded to
                one bar per group (R5-3: each project, by default); its caret opens it.
   It follows the view and the quarter, and counts what the tree shows: objectives seen in full count for the
   score, statuses, key results, stage-gates, schedule and risks; in someone else's objective only your tiles and
   experiments are in view, so it shows on the timeline alone, faint. Ended objectives (All quarters) count as
   Achieved or Abandoned and stay out of the score and the schedule. An objective not started yet that the engine
   already puts behind schedule counts as behind, as Execution and Sales say it (R5-5). A dot, a timeline row,
   "Show them below" and the alarm's "Show it" filter the tree and bring it into view (R5-4). */
const MINE_ALARM = 10;        // the schedule alarm: Execution's and Sales' SHELL_SLIP_ALARM (CATCHUP_SLIP_THRESHOLD)
const MINE_TL_FOLD = 12;      // past this many objectives the timeline starts with every project folded
const MINE_OBJ_ORDER = ['Off track', 'At risk', 'On track', 'Not started', 'No score yet', 'Achieved', 'Abandoned'];

function mineMean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function mineMedian(xs) {
  if (!xs.length) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/* a name cut at a word for a narrow fact ("Worst: Root-cause the…"); the fact's title keeps all of it */
function mineClip(s, n) {
  s = mineTxt(s);
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '') + '…';
}
/* the engine's bands as edges on 0 to 100 (RD.band: at risk from 65, on track from 80) */
let MINE_EDGES = null;
function mineEdges() {
  if (MINE_EDGES) return MINE_EDGES;
  let risk = 65, ok = 80;
  for (let v = 0; v <= 100; v++) if (RD.band(v) !== 'off-track') { risk = v; break; }
  for (let v = 0; v <= 100; v++) if (RD.band(v) === 'on-track') { ok = v; break; }
  MINE_EDGES = { risk: risk, ok: ok };
  return MINE_EDGES;
}

/* ---- pace on the quarter's clock (October 22) ----
   The panel judges a score by how much of the quarter has passed, not by the fixed bands: two weeks in, an
   objective at 40 isn't off track. The rule is the engine's own, the one the Key results tab applies to a key
   result against its objective's dates (RD.keyResultPaceBand): within 10 points of the time elapsed is on track,
   within 30 at risk; 100 is on track; once the quarter is over, anything short of 100 is off track. The clock is
   the strip's quarter (the menu's quarter, or this one for "This quarter and later" and "All quarters"), and every
   objective in view is judged against it. The scorecard's status, dots, shading, Objectives and Key results, and
   the timeline's colors follow it; the tree keeps the score bands (R4-3). */
let MINE_PACE_RULE = null;
/* the rule's two thresholds, read from the engine at half time on a 0 to 100 window: points behind the time
   elapsed that are still on track, and still at risk */
function minePaceRule() {
  if (MINE_PACE_RULE) return MINE_PACE_RULE;
  let ok = 10, risk = 30;
  for (let v = 0; v <= 50; v++) if (RD.keyResultPaceBand(v, 0, 100, 50) === 'on-track') { ok = 50 - v; break; }
  for (let v = 0; v <= 50; v++) if (RD.keyResultPaceBand(v, 0, 100, 50) !== 'off-track') { risk = 50 - v; break; }
  MINE_PACE_RULE = { ok: ok, risk: risk };
  return MINE_PACE_RULE;
}
/* the strip's quarter: the one the menu picked, else this one */
function mineStripQ(ctx) { return mineParseQ(ctx.when && ctx.when !== '*' ? ctx.when : F.qOfDay(ctx.today)); }
/* the clock: the quarter's first and last day (a window ends on its last day, as Planning's do) and how much of it
   has passed, 0 to 100 */
function minePaceClock(ctx) {
  const q = mineStripQ(ctx);
  if (!q || !(q.end > q.start)) return null;
  const td = ctx.today;
  return { start: q.start, end: q.end, td: td, label: q.label, e: Math.max(0, Math.min(1, (td - q.start) / (q.end - q.start))) * 100 };
}
/* a score's tone by pace ('none' without a score; the score bands without a clock) */
function minePace(clock, s) {
  if (s == null || !isFinite(s)) return 'none';
  const b = clock ? RD.keyResultPaceBand(s, clock.start, clock.end, clock.td) : RD.band(s);
  return b === 'on-track' ? 'ok' : b === 'at-risk' ? 'warn' : b === 'off-track' ? 'bad' : 'none';
}
/* where the shading changes: the lowest score at risk and the lowest on track, at this point in the quarter */
function minePaceEdges(clock) {
  if (!clock) return mineEdges();
  if (clock.e >= 100) return { risk: 100, ok: 100 };
  const r = minePaceRule();
  return { risk: Math.max(0, clock.e - r.risk), ok: Math.max(0, clock.e - r.ok) };
}
/* a panel click filters the tree by a name and brings the tree into view */
function mineFilterTo(C, text, e) {
  C.setState({ mine_text: String(text || ''), mine_due: false, mine_depth: '', menu: '' });
  mineShowTree(e);
}
function mineShowTree(e) {
  try {
    const doc = e && e.currentTarget && e.currentTarget.ownerDocument;
    if (!doc) return;
    const win = doc.defaultView;
    const still = !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setTimeout(() => {
      const t = doc.querySelector('[data-k="tree"]');
      if (t && typeof t.scrollIntoView === 'function') t.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    }, 0);
  } catch (err) { /* nothing to scroll */ }
}

/* every objective in view with what the panel needs: scores, schedule, key results, gates and risks from the
   engine, per document; w is its status in the tree's words (the score bands), pw by pace on the clock */
function mineRollFacts(C, ctx) {
  return C.memo('mine.roll', () => {
    const td = ctx.today;
    const clock = minePaceClock(ctx);
    return ctx.entries.map((ent) => {
      const o = ent.o;
      const octx = mineOctx(C, ctx, ent);
      const doc = octx.doc, em = octx.em;
      const sc = RD.objectiveScore(o.id, em);
      const casc = octx.casc();
      let slip = casc && casc.objectiveScheduleSlip ? casc.objectiveScheduleSlip[o.id] : null;
      let wf = casc && casc.objectiveWorkForecast ? casc.objectiveWorkForecast[o.id] : null;
      if (slip == null || !isFinite(slip)) slip = null;
      if (wf == null || !isFinite(wf)) wf = null;
      const krs = (doc.keyResults || []).filter((r) => r && r.objectiveId === o.id);
      const krOn = krs.filter((k) => minePace(clock, RD.keyResultScore(k.id, em)) === 'ok').length;
      const gates = (doc.stageGates || []).filter((g) => g && g.objectiveId === o.id);
      const passed = (gid) => { const g = gates.find((x) => x.id === gid); if (!g) return false; const c = RD.classifyGate(g, td); return c === 'passed' || c === 'passed-late'; };
      const roll = RD.fmeaRollup(RD.fmeaProblemsFor(doc, o.id), passed);
      const w = mineObjWord(C, o, doc, em);
      const pt = !octx.end && sc != null ? minePace(clock, sc) : '';
      return { ent: ent, o: o, doc: doc, ended: !!octx.end, sc: sc, w: w, pw: pt ? { tone: pt, word: F.bandWord(pt) } : w, slip: slip, wf: wf, krs: krs, krOn: krOn, gates: gates, roll: roll, name: mineTxt(o.statement) || o.id };
    });
  });
}

/* the quarter the panel opens on: the one the menu picked, else this one */
function mineQuarterStrip(ctx) {
  const q = mineStripQ(ctx);
  if (!q) return null;
  const td = ctx.today;
  const wk = Math.max(1, Math.min(13, Math.floor((td - q.start) / 7) + 1));
  const inQ = td >= q.start && td <= q.end, done = td > q.end;
  const cells = [];
  for (let i = 1; i <= 13; i++) cells.push({ cls: 'mine-qc' + (done || (inQ && i < wk) ? ' done' : '') + (inQ && i === wk ? ' now' : '') });
  const status = inQ ? 'Week ' + wk + ' of 13' : td < q.start ? 'Upcoming' : 'Complete';
  return { label: q.label, range: F.dayAuto(q.start, td) + ' to ' + F.dayAuto(q.end, td), cells: cells, status: status, aria: q.label + ': ' + status };
}

/* the scorecard: the mean score (the average, as before) with its status by pace; the spread on 0 to 100, shaded
   by pace at this point in the quarter, with the time elapsed as the mark (October 22: it was the mean's) */
function mineScoreVM(C, ctx, R, dueCount, clock) {
  const td = ctx.today;
  const full = R.filter((e) => e.ent.full);
  const live = full.filter((e) => !e.ended);
  const scored = live.filter((e) => e.sc != null);
  const xs = scored.map((e) => e.sc);
  const mu = mineMean(xs), md = mineMedian(xs);
  const tone = minePace(clock, mu);
  const unscored = live.length - scored.length;
  const edges = minePaceEdges(clock);
  const el = clock ? Math.round(clock.e) : null;
  /* the spread: a dot per scored objective; a label that would sit on its neighbour's goes up a lane */
  const lanes = [[], [], []];
  const dots = scored.slice().sort((a, b) => a.sc - b.sc).map((e) => {
    const x = minePct(e.sc);
    let lane = 0;
    while (lane < 2 && lanes[lane].some((y) => Math.abs(y - x) < 4.5)) lane++;
    lanes[lane].push(x);
    const t = minePace(clock, e.sc);
    const title = e.name + ': ' + Math.round(e.sc) + ', ' + F.bandWord(t).toLowerCase() + (clock ? ' (' + el + '% of the quarter elapsed)' : '') + '. Show it below';
    return { k: e.o.id, cls: 'mine-dot ' + F.tone(t) + ' lane' + lane, style: 'left: ' + x.toFixed(1) + '%', title: title, label: String(Math.round(e.sc)), go: (ev) => mineFilterTo(C, e.name, ev) };
  });
  /* the shading: off track, at risk, on track from 0 to 100, each where it is wide enough to see (half a point);
     what is dropped goes to its neighbour, so the zones always cover the line */
  const spans = [['bad', 0, edges.risk], ['warn', edges.risk, edges.ok], ['ok', edges.ok, 100]].filter((z) => z[2] - z[1] >= 0.5);
  const hasZ = (k) => spans.some((z) => z[0] === k);
  let at0 = 0;
  const zones = spans.map((z, i) => {
    const w = z[2] - at0;
    at0 = z[2];
    const lastZ = i === spans.length - 1;
    return { k: z[0], cls: 'mine-z ' + z[0] + (i === 0 ? ' first' : '') + (lastZ ? ' last' : ''), style: lastZ ? 'flex: 1 1 auto' : 'flex: 0 0 calc(' + w.toFixed(2) + '% - ' + (i === 0 ? 1 : 2) + 'px)' };
  });
  const zoneKey = spans.map((z) => ({
    k: z[0], cls: 'mine-zsw ' + z[0],
    text: z[0] === 'bad' ? 'Off track, below ' + Math.round(z[2]) : z[0] === 'warn' ? (hasZ('bad') ? 'At risk' : 'At risk, below ' + Math.round(z[2]))
      : z[1] >= 0.5 ? 'On track, ' + Math.round(z[1]) + ' and up' : 'On track, any score'
  }));
  if (!hasZ('ok')) zoneKey.push({ k: 'ok', cls: 'mine-zsw ok', text: 'On track only at 100' });
  const rule = minePaceRule();
  const clockAria = clock ? '; ' + el + '% of ' + clock.label + ' elapsed' : '';
  const behind = live.filter((e) => e.slip != null && e.slip > 0).sort((a, b) => b.slip - a.slip);
  const alarm = behind.filter((e) => e.slip > MINE_ALARM);
  const krN = full.reduce((n, e) => n + e.krs.length, 0);
  const krOn = full.reduce((n, e) => n + e.krOn, 0);
  let gN = 0, gPass = 0, gOver = 0;
  full.forEach((e) => e.gates.forEach((g) => { gN++; const c = RD.classifyGate(g, td); if (c === 'passed' || c === 'passed-late') gPass++; else if (c === 'overdue') gOver++; }));
  let high = 0, med = 0, probs = 0, worst = 0;
  full.forEach((e) => { high += e.roll.openHigh || 0; med += e.roll.openMed || 0; probs += e.roll.total || 0; worst = Math.max(worst, e.roll.worst || 0); });
  const cnt = {};
  full.forEach((e) => { cnt[e.pw.word] = (cnt[e.pw.word] || 0) + 1; });
  const objWords = MINE_OBJ_ORDER.filter((w) => cnt[w]).map((w) => cnt[w] + ' ' + w.toLowerCase()).join(', ');
  const fact = (k, label, value, tn, detail, title) => ({ k: 'roll-' + k, label: label, value: String(value), vcls: 'mine-fv' + (tn ? ' ' + F.tone(tn) + ' tx-' + tn : ''), dot: !!tn, detail: detail || '', title: title || '' });
  const worstLine = behind.length ? behind[0].name + ', ' + F.plural(behind[0].slip, 'day') : '';
  const strip = mineQuarterStrip(ctx);
  const dueOn = !!C.state.mine_due;
  /* nothing seen in full (only your tiles or experiments in objectives that aren't yours): nothing to score */
  let tN = 0, eN = 0;
  R.forEach((e) => { if (!e.ent.full) { tN += e.ent.tiles.length; eN += e.ent.exps.length; } });
  return {
    strip: strip, hasStrip: !!strip,
    hasFull: full.length > 0, noFull: !full.length,
    noFullText: 'No score to roll up: only your ' + (F.list([tN ? 'tiles' : '', eN ? 'experiments' : '']) || 'work') + ' are in view, in objectives that aren’t yours. The timeline shows when those objectives run.',
    hasBig: mu != null,
    big: mu == null ? '' : String(Math.round(mu)),
    /* the mean's status by pace, the same rule as the dots */
    word: mu != null ? F.bandWord(tone) : live.length ? 'No score yet' : 'Nothing under way',
    cls: 'st ' + F.tone(tone),
    sub: scored.length > 1 ? 'Mean of ' + scored.length + ' scored objectives, median ' + Math.round(md)
      : scored.length ? 'The only objective here with a score'
      : live.length > 1 ? 'None of these ' + live.length + ' objectives has a score yet'
      : live.length ? 'This objective has no score yet' : 'Every objective here has ended: ' + objWords,
    sub2: scored.length && unscored ? F.plural(unscored, 'objective') + ' not started or not scored yet' : '',
    hasSub2: scored.length > 0 && unscored > 0,
    zones: zones,
    zoneKey: zoneKey,
    dots: dots,
    /* the time elapsed, its mark and its label under the line (kept inside it at the ends) */
    mark: clock ? { style: 'left: ' + clock.e.toFixed(1) + '%', lcls: 'mine-mlbl' + (clock.e < 8 ? ' at-l' : clock.e > 92 ? ' at-r' : ''), label: el + '% elapsed', title: el + '% of ' + clock.label + ' elapsed' } : null,
    caption: !scored.length ? '' : clock
      ? 'One dot per scored objective; the mark is how much of ' + clock.label + ' has passed. Status follows pace: within ' + rule.ok + ' points of it is on track, within ' + rule.risk + ' at risk. The rows below keep the score bands.'
      : 'One dot per scored objective.',
    hasCaption: scored.length > 0,
    aria: (scored.length ? 'Objective scores ' + scored.map((e) => Math.round(e.sc)).join(', ') + '; mean ' + Math.round(mu) + ', median ' + Math.round(md) : 'No scores yet') + clockAria,
    facts: [
      fact('objs', 'Objectives', full.length, '', objWords || 'None yet'),
      fact('krs', 'Key results', krN, '', krN ? krOn + (clock ? ' on track by pace' : ' on track by score') : 'None yet'),
      fact('gates', 'Stage-gates', gN, '', gN ? gPass + ' passed, ' + gOver + ' overdue' : 'None yet'),
      fact('sched', 'Behind schedule', behind.length, alarm.length ? 'bad' : behind.length ? 'warn' : live.length ? 'ok' : '',
        behind.length ? 'Worst: ' + mineClip(behind[0].name, 34) + ', ' + F.plural(behind[0].slip, 'day') : live.length ? 'Every objective on schedule' : 'Nothing under way',
        worstLine ? 'Worst: ' + worstLine + ' behind schedule' : ''),
      fact('risk', 'Open high risk', high, high ? 'bad' : med ? 'warn' : probs ? 'ok' : 'none', probs ? F.plural(probs, 'problem') + ', worst RPN ' + worst : 'No FMEA items')
    ],
    due: {
      n: String(dueCount), some: dueCount > 0, none: !dueCount, on: dueOn ? 'true' : 'false',
      cls: 'mine-due-go' + (dueOn ? ' on' : ''), text: dueOn ? 'Showing them below' : 'Show them below',
      /* every reading due, whatever the name filter was: the count above says how many */
      toggle: (ev) => { if (C.state.mine_due) { C.setState({ mine_due: false, menu: '' }); return; } C.setState({ mine_due: true, mine_text: '', menu: '' }); mineShowTree(ev); }
    },
    alarm: alarm.length ? {
      text: alarm.length === 1 ? alarm[0].name + ' is ' + F.plural(alarm[0].slip, 'day') + ' behind schedule, past the ' + MINE_ALARM + '-day alarm.'
        : F.plural(alarm.length, 'objective') + ' are past the ' + MINE_ALARM + '-day schedule alarm: ' + F.list(alarm.map((e) => e.name + ' (' + F.plural(e.slip, 'day') + ')')) + '.',
      one: alarm.length === 1,
      go: (ev) => mineFilterTo(C, alarm[0].name, ev)
    } : null
  };
}

/* the timeline: whole months from the first window, gate or forecast to the last, a label every 1, 2, 3 or 6
   months so they fit (the year on the first and when it changes); a row per group, as Group by lays them out (a
   project's with its milestones), and per objective, in Sort by's order */
function mineTimelineVM(C, ctx, R, A, clock, fx) {
  const P = ctx.P, td = ctx.today;
  const em = mineEmAll(C);
  let lo = td, hi = td;
  const see = (d) => { if (d != null && isFinite(d)) { lo = Math.min(lo, d); hi = Math.max(hi, d); } };
  R.forEach((e) => {
    see(e.o.plannedStart); see(e.o.plannedEnd);
    if (!e.ent.full) return;
    if (!e.ended) see(e.wf);
    e.gates.forEach((g) => see(g.actualDate != null ? g.actualDate : g.plannedDate));
  });
  const first = (y, m) => Math.round((Date.UTC(y, m, 1) - Date.UTC(2020, 0, 1)) / 86400000);
  const d0 = F.dateOf(lo), d1 = F.dateOf(hi);
  const start = first(d0.getUTCFullYear(), d0.getUTCMonth());
  const end = first(d1.getUTCFullYear(), d1.getUTCMonth() + 1);
  const span = Math.max(1, end - start);
  const x = (d) => (d - start) / span * 100;
  const at = (d) => x(d).toFixed(2) + '%';
  const firsts = [];
  for (let i = 0; ; i++) {
    const y = d0.getUTCFullYear() + Math.floor((d0.getUTCMonth() + i) / 12), m = (d0.getUTCMonth() + i) % 12;
    const day = first(y, m);
    if (day >= end) break;
    firsts.push({ y: y, m: m, day: day });
  }
  const step = firsts.length <= 9 ? 1 : firsts.length <= 18 ? 2 : firsts.length <= 30 ? 3 : 6;
  let lastY = null;
  const months = firsts.map((f, i) => {
    const next = i + 1 < firsts.length ? firsts[i + 1].day : end;
    const shown = i % step === 0;
    const label = shown ? F.MON[f.m] + (f.y !== lastY ? ' ' + f.y : '') : '';
    if (shown) lastY = f.y;
    return { k: f.y + '-' + f.m, style: 'left: ' + at(f.day) + '; width: ' + (x(next) - x(f.day)).toFixed(2) + '%', label: label };
  });
  const fold = C.state.mine_tl || {};
  const foldFirst = R.length > MINE_TL_FOLD;
  /* "N days behind" beside a bar: after it where there's room, else before it, else on its end */
  const slipAt = (s0, e0) => {
    const a = x(s0), b = x(e0);
    if (b <= 84) return { style: 'left: ' + (b + 1).toFixed(2) + '%', on: false };
    if (a >= 16) return { style: 'right: ' + (100 - a + 1).toFixed(2) + '%', on: false };
    return { style: 'right: ' + (100 - b + 1).toFixed(2) + '%', on: true };
  };
  const slipCls = (days, at) => 'mine-slip ' + (days > MINE_ALARM ? 'tx-bad' : 'tx-warn') + (at && at.on ? ' on-bar' : '');
  const rows = [];
  const L = A.dims.length;
  /* an objective's row: its window in its status by pace, gates, forecast and slip; indented under its groups
     (--lv levels, CSS; with no levels, no room for a caret either) */
  const objPad = L ? '--lv: ' + (L - 1) : '--lv: 0; --ob: 0px';
  const objRow = (e) => {
    const o = e.o;
    const ps = o.plannedStart, pe = o.plannedEnd;
    const hasBar = ps != null && pe != null && pe > ps;
    const tone = e.ent.full ? e.pw.tone : 'none';
    const gates = !e.ent.full ? [] : e.gates.filter((gt) => (gt.actualDate != null ? gt.actualDate : gt.plannedDate) != null).map((gt) => {
      const c = RD.classifyGate(gt, td);
      const day = gt.actualDate != null ? gt.actualDate : gt.plannedDate;
      const st = c === 'passed' || c === 'passed-late' ? 'passed' : c === 'overdue' ? 'overdue' : 'open';
      const what = st === 'passed' ? 'passed' : st === 'overdue' ? F.plural(td - gt.plannedDate, 'day') + ' overdue' : 'ahead';
      return { k: gt.id, cls: 'mine-gt ' + st, style: 'left: ' + at(day), title: (mineGateLabel(e.doc, gt) + ' ' + mineTxt(gt.name)).trim() + ', ' + F.dayAuto(day, td) + ', ' + what };
    });
    const slip = e.ent.full && !e.ended && e.slip != null && e.slip > 0 ? e.slip : 0;
    const yours = e.ent.full ? '' : 'Yours: ' + F.list([e.ent.tiles.length ? F.plural(e.ent.tiles.length, 'tile') : '', e.ent.exps.length ? F.plural(e.ent.exps.length, 'experiment') : '']);
    const fc = e.ent.full && !e.ended && e.wf != null;
    /* "N days behind" goes after the forecast when the forecast runs past the window, clear of its mark */
    const endAt = hasBar && fc && e.wf > pe ? e.wf : pe;
    const n = e.ent.tiles.length + e.ent.exps.length;
    const state = e.ent.full ? e.pw.word.toLowerCase() + (e.sc != null && !e.ended ? ', ' + Math.round(e.sc) : '')
      : 'only your ' + F.list([e.ent.tiles.length ? F.plural(e.ent.tiles.length, 'tile') : '', e.ent.exps.length ? F.plural(e.ent.exps.length, 'experiment') : '']) + (n === 1 ? ' is' : ' are') + ' in view';
    rows.push({
      k: 'tlo:' + o.id, cls: 'mine-tlrow is-obj', isGrp: false, isProj: false, isObj: true, name: e.name, padStyle: objPad, tagCls: '', tagText: '',
      caretCls: '', caretExp: 'false', caretLabel: '', toggle: null, count: '', hasCount: false, flags: [],
      title: '', go: (ev) => mineFilterTo(C, e.name, ev),
      nameTitle: e.name + ': ' + state + '. Show only it below',
      dotCls: 'dot ' + F.tone(tone),
      val: e.ent.full ? (e.ended ? e.w.word : e.sc != null ? String(Math.round(e.sc)) : '—') : yours,
      valCls: 'mine-tlval' + (e.ent.full && !e.ended && e.sc != null ? '' : ' sub'),
      hasBar: hasBar, barCls: 'mine-tbar ' + F.tone(tone) + (e.ent.full ? '' : ' faint'),
      barStyle: hasBar ? 'left: ' + at(ps) + '; width: ' + (x(pe) - x(ps)).toFixed(2) + '%' : '',
      barTitle: hasBar ? 'Planned ' + F.dayAuto(ps, td) + ' to ' + F.dayAuto(pe, td) : '',
      gates: gates,
      hasFc: fc, fcStyle: fc ? 'left: ' + at(e.wf) : '', fcTitle: fc ? 'Forecast finish ' + F.dayAuto(e.wf, td) : '',
      hasSlip: !!slip, slip: slip ? F.plural(slip, 'day') + ' behind' : '',
      slipCls: slipCls(slip, slip && hasBar ? slipAt(ps, endAt) : null),
      slipStyle: !slip ? '' : hasBar ? slipAt(ps, endAt).style : 'left: ' + ((fc ? x(e.wf) : x(td)) + 1).toFixed(2) + '%'
    });
  };
  /* a group's row, then (open) its groups or its objectives. Past MINE_TL_FOLD objectives the last level starts
     folded, the levels above it open; folded, one bar over its objectives' windows in its score's status by pace
     (a project's is Planning's), its worst slip; a project's milestones, open or folded */
  const grpRow = (g, depth) => {
    const isP = g.dim === 'project';
    const lab = mineGrpLabel(C, ctx, g);
    const name = lab.name;
    const gents = g.entries.map((ent) => fx.get(ent)).filter(Boolean);
    const open = Object.prototype.hasOwnProperty.call(fold, g.key) ? !!fold[g.key] : !(foldFirst && !g.kids);
    const ms = isP && g.init ? (P.milestones || []).filter((m) => m && m.initiativeId === g.init.id && m.plannedDate != null && m.plannedDate >= start && m.plannedDate < end) : [];
    let win = null, slip = 0;
    gents.forEach((e) => {
      if (e.o.plannedStart != null && e.o.plannedEnd != null && e.o.plannedEnd > e.o.plannedStart) win = win ? [Math.min(win[0], e.o.plannedStart), Math.max(win[1], e.o.plannedEnd)] : [e.o.plannedStart, e.o.plannedEnd];
      if (e.ent.full && !e.ended && e.slip != null && e.slip > slip) slip = e.slip;
    });
    const gsc = mineGrpScore(C, ctx, g, fx);
    const bar = !open && !!win;
    rows.push({
      k: 'tlp:' + g.key, cls: 'mine-tlrow is-grp ' + (isP ? 'is-proj' : 'is-set') + (depth ? '' : ' is-top'), isGrp: true, isProj: isP, isObj: false, name: name,
      padStyle: '--lv: ' + depth, tagCls: isP ? 'tag mine-ptag' : 'tag', tagText: lab.tag,
      caretCls: 'mine-car' + (open ? ' open' : ''), caretExp: open ? 'true' : 'false', caretLabel: (open ? 'Fold ' : 'Open ') + name,
      toggle: () => C.setState({ mine_tl: Object.assign({}, C.state.mine_tl || {}, { [g.key]: !open }) }),
      count: open ? '' : F.plural(gents.length, 'objective'), hasCount: !open,
      title: 'Show only ' + name + ' below', go: (ev) => mineFilterTo(C, name, ev),
      nameTitle: '', dotCls: '', val: '', valCls: '',
      flags: ms.map((m) => {
        const got = RD.milestoneAchieved(m, em);
        return { k: m.id, cls: 'mine-ms' + (got ? ' got' : m.plannedDate < td ? ' late' : ''), style: 'left: ' + at(m.plannedDate), title: (m.name || m.id) + ', ' + F.dayAuto(m.plannedDate, td) + (got ? ', achieved' : m.plannedDate < td ? ', missed' : ', ahead') };
      }),
      hasBar: bar, barCls: 'mine-tbar ' + F.tone(minePace(clock, gsc)),
      barStyle: bar ? 'left: ' + at(win[0]) + '; width: ' + (x(win[1]) - x(win[0])).toFixed(2) + '%' : '',
      barTitle: bar ? name + ': its objectives here run ' + F.dayAuto(win[0], td) + ' to ' + F.dayAuto(win[1], td) : '',
      gates: [], hasFc: false, fcStyle: '', fcTitle: '',
      hasSlip: bar && slip > 0, slip: slip ? F.plural(slip, 'day') + ' behind' : '',
      slipCls: slipCls(slip, bar && slip ? slipAt(win[0], win[1]) : null),
      slipStyle: bar && slip ? slipAt(win[0], win[1]).style : ''
    });
    if (!open) return;
    if (g.kids) g.kids.forEach((k) => grpRow(k, depth + 1));
    else gents.forEach(objRow);
  };
  if (L) A.groups.forEach((g) => grpRow(g, 0));
  else A.flat.forEach((ent) => { const f = fx.get(ent); if (f) objRow(f); });
  return { months: months, todayStyle: 'left: ' + at(td), rows: rows };
}
/* the panel (APP_SHELL asks for it only while the tree has objectives to show) */
function mineRollVM(C, ctx, dueCount) {
  const R = mineRollFacts(C, ctx);
  const clock = minePaceClock(ctx);
  return { score: mineScoreVM(C, ctx, R, dueCount, clock), tl: mineTimelineVM(C, ctx, R, mineArranged(C, ctx), clock, mineFx(C, ctx)) };
}

/* ------------------------------------------------------------- the rows on screen */
/* annotate (reading due inside, what the filter finds) and flatten: open rows show their children */
function mineFlatten(C, ctx, nodes) {
  const S = C.state;
  const q = String(S.mine_text || '').trim().toLowerCase();
  const dueOnly = !!S.mine_due;
  const openMap = S.mine_open || {};
  const mode = S.mine_depth || '';
  let dueCount = 0;
  const annotate = (n) => {
    let tone = n.due ? n.due.tone : '';
    let names = n.due ? [n.row.name] : [];
    if (n.due) dueCount++;
    n.match = !!q && n.text.indexOf(q) >= 0;
    n.descMatch = false;
    n.kids.forEach((c) => {
      annotate(c);
      if (c.dueTone) { tone = tone === 'bad' || c.dueTone === 'bad' ? 'bad' : 'warn'; names = names.concat(c.dueNames); }
      if (c.match || c.descMatch) n.descMatch = true;
    });
    n.dueTone = tone;
    n.dueNames = K.uniq(names);
  };
  nodes.forEach(annotate);
  const out = [];
  const walk = (n, depth, forced) => {
    const textOk = !q || forced || n.match || n.descMatch;
    if (!textOk || (dueOnly && !n.dueTone)) return;
    const hasKids = n.kids.length > 0;
    const manual = Object.prototype.hasOwnProperty.call(openMap, n.k) ? !!openMap[n.k] : null;
    let open = manual != null ? manual : mode === 'all' ? true : mode === 'objectives' ? n.kind === 'proj' || n.kind === 'set' : !!n.dflt;
    if (!open && n.dueTone && manual == null && mode !== 'objectives' && (n.kind === 'item' || n.kind === 'grp')) open = true;   // where a reading is due, the way down is open
    /* a filter opens the way to what it found */
    if (hasKids && ((q && !forced && !n.match && n.descMatch) || dueOnly)) open = true;
    out.push(mineRowVM(C, n, depth, open && hasKids, hasKids));
    if (n.drawer) out.push(mineRowBase({ isRow: false, isDrawer: true, k: 'd:' + n.k, drawer: n.drawer }));
    if (open) n.kids.forEach((c) => walk(c, depth + 1, forced || (!!q && n.match)));
  };
  nodes.forEach((n) => walk(n, 0, false));
  return { rows: out, dueCount: dueCount };
}
function mineRowVM(C, n, depth, open, hasKids) {
  const r = Object.assign({}, n.row);
  r.k = n.k;
  r.cls = 'mine-row k-' + n.kind + (r.pMyEd || r.pKpiEd ? ' on' : '');
  r.padStyle = 'padding-left: ' + (10 + depth * 22) + 'px';
  r.hasCaret = hasKids; r.noCaret = !hasKids;
  r.caretCls = 'mine-car' + (open ? ' open' : '');
  r.caretExp = open ? 'true' : 'false';
  r.caretLabel = (open ? 'Collapse ' : 'Expand ') + (r.name || r.gname || 'row');
  r.toggle = () => { const m = Object.assign({}, C.state.mine_open || {}); m[n.k] = !open; C.setState({ mine_open: m }); };
  if (n.due) { r.hasFlag = true; r.flagCls = 'mine-flag tx-' + n.due.tone; r.flagTitle = n.due.text; }
  else if (hasKids && !open && n.dueTone) {
    const names = n.dueNames;
    r.hasFlag = true; r.flagCls = 'mine-flag tx-' + n.dueTone;
    r.flagTitle = 'A reading is due inside: ' + (names.length > 2 ? names.slice(0, 2).join(', ') + ' and ' + (names.length - 2) + ' more' : F.list(names));
  }
  return r;
}

/* ------------------------------------------------------------- shell view model */
function mineLede(C, ctx) {
  const n = ctx.entries.length, groups = ctx.groups.length;
  const tail = ctx.ro ? ' Read-only: values only.' : ' Click a value to update it.';
  if (ctx.view === 'team') {
    const P = ctx.P;
    const names = ctx.teamDivs.map((id) => { const d = (P.divisions || []).find((x) => x.id === id); return d ? d.name || d.id : id; });
    const who = ctx.top ? mineTeamWords(ctx.choice, names) : F.list(names) + ', the ' + (names.length > 1 ? 'divisions' : 'team') + ' you lead';
    return who + ': ' + F.plural(groups, 'project') + ' and ' + F.plural(n, 'objective') + '.' + tail;
  }
  const own = ctx.entries.filter((e) => e.own).length;
  const others = ctx.entries.filter((e) => !e.full);
  const bits = [];
  if (own) bits.push(own === 1 ? 'the objective you own' : 'the ' + own + ' objectives you own');
  if (others.length) {
    let exps = 0, tiles = 0;
    others.forEach((e) => { exps += e.exps.length; tiles += e.tiles.length; });
    const what = [exps ? F.plural(exps, 'experiment') + ' you run' : '', tiles ? F.plural(tiles, 'tile') + ' you hold' : ''].filter(Boolean).join(' and ');
    const where = others.length === 1 ? (function () { const w = mineWhose(C, others[0].o, ctx.me ? ctx.me.email : ''); return w === 'No owner' ? 'an objective with no owner' : w + ' objective'; })() : F.plural(others.length, 'other objective');
    bits.push(what + ' in ' + where);
  }
  return F.plural(groups, 'project') + ': ' + (bits.length ? bits.join(', and ') : 'nothing yours yet') + '.' + tail;
}
function mineEmptyVM(C, ctx) {
  const S = C.state;
  const out = { text: '', hasAct: false, actLabel: '', act: null };
  const act = (label, fn) => { out.hasAct = true; out.actLabel = label; out.act = fn; };
  const settings = () => C.openSheet('mine.settings', {}, {});
  if (!ctx.loaded) {
    const st = S.mine_load;
    if (st === 'loading') out.text = 'Loading…';
    else if (st === 'notoken') { out.text = 'Not loaded. No broker token in this browser yet. Open this page from the Hub or another app, or add the token in Settings.'; act('Open settings', settings); }
    else if (st === 'badtoken') { out.text = 'Not loaded. The broker didn’t accept the token; check it in Settings.'; act('Open settings', settings); }
    else if (st === 'noportfolio') { out.text = 'Not loaded. There is no portfolio on the broker yet; create it from the Planning app first.'; act('Try again', () => NET.reload(C)); }
    else if (st === 'offline') { out.text = 'Not loaded. Couldn’t reach the broker; this page keeps trying.'; act('Try again', () => NET.reload(C)); }
    else { out.text = 'Not loaded. The last load failed; check the token in Settings.'; act('Try again', () => (LIVE ? NET.reload(C) : null)); }
    return out;
  }
  if (!ctx.me) {
    if (LIVE) out.text = inEmbed() ? 'Inside a Confluence page the browser hides your Hub sign-in, so this page can’t tell what is yours. Open the full page.' : 'Sign in to the Hub, then reload this page: what is yours comes from your Hub sign-in.';
    else { out.text = 'Signed out of the Hub, so nothing here is yours. Choose who you are in Settings.'; act('Open settings', settings); }
    return out;
  }
  const allQ = ctx.allEntries.length > 0 && ctx.when !== '*';
  /* the CEO's or CTO's choice covers no division (no business division yet, say): say so, and where to choose */
  if (ctx.view === 'team' && ctx.top && !ctx.teamDivs.length) {
    out.text = (ctx.choice.mode === 'pick' ? 'No divisions are chosen for Team Projects.' : 'There are no ' + (ctx.choice.mode === 'biz' ? 'business' : 'R&D') + ' divisions yet.') + ' Choose which divisions Team Projects covers in Settings.';
    act('Open settings', settings);
    return out;
  }
  const where = !ctx.top ? 'the divisions you lead' : { rd: 'the R&D divisions', biz: 'the business divisions', all: 'any division', pick: 'the divisions you chose' }[ctx.choice.mode];
  if (ctx.view === 'team') out.text = ctx.when ? 'No objectives in ' + (ctx.when === '*' ? where : mineQLabel(ctx.when) + ' in ' + where) + '.' : 'No objectives from this quarter on in ' + where + '.';
  else out.text = ctx.when === '*' ? 'Nothing is yours yet: no objective you own, and no experiment or tile assigned to you.' : ctx.when ? 'Nothing is yours in ' + mineQLabel(ctx.when) + '.' : 'Nothing is yours from this quarter on.';
  if (allQ) act('Show all quarters', () => C.setState({ mine_q: '*' }));
  else if (ctx.view === 'team' && ctx.top) act('Choose divisions', settings);
  return out;
}
function APP_SHELL(C, ctx) {
  const S = C.state;
  const set = (p) => C.setState(p);
  if (typeof ETB !== 'undefined' && ETB && typeof ETB.setClock === 'function') ETB.setClock(C);
  const loaded = ctx.loaded;
  const has = loaded && !!ctx.me && ctx.entries.length > 0;
  let rows = [], dueCount = 0;
  if (has) {
    const nodes = mineArrNodes(C, ctx, mineArranged(C, ctx), mineFx(C, ctx));
    const f = mineFlatten(C, ctx, nodes);
    rows = f.rows;
    dueCount = f.dueCount;
  }
  const filtering = !!String(S.mine_text || '').trim() || !!S.mine_due;
  const noRows = has && !rows.length;
  const views = ctx.lead ? [['owned', 'Owned Projects'], ['team', 'Team Projects']].map((v) => ({ label: v[1], on: ctx.view === v[0] ? 'true' : 'false', pick: () => minePickView(C, v[0]) })) : [];
  const qOpts = [{ v: '', label: 'This quarter and later' }, { v: '*', label: 'All quarters' }].concat(ctx.quarters.map((q) => ({ v: q, label: mineQLabel(q) })));
  const banner = S.mine_banner ? {
    cls: 'banner ' + F.tone(S.mine_banner.tone === 'bad' ? 'bad' : S.mine_banner.tone === 'warn' ? 'warn' : 'info'),
    text: S.mine_banner.text || '', dismiss: () => set({ mine_banner: null })
  } : null;
  const top = C.sheet();
  return {
    me: C.meVM(),
    lede: loaded && ctx.me ? mineLede(C, ctx) : 'Everything that is yours, in one tree. Click a value to update it.',
    hasCrumbView: ctx.lead, crumbView: ctx.view === 'team' ? 'Team Projects' : 'Owned Projects',
    /* the CEO and the CTO, in Team Projects: the lede links to the setting that chooses its divisions */
    scopeLink: loaded && ctx.me && ctx.top && ctx.view === 'team' ? { open: () => C.openSheet('mine.settings', {}, {}) } : null,
    hasTree: has,
    roll: has ? mineRollVM(C, ctx, dueCount) : null,
    /* Group and sort, after the quarter menu: they arrange the timeline and the tree alike (October 22) */
    arrange: has ? mineArrangeVM(C) : null,
    /* the view and the quarter sit beside the title (October 21): they set the panel and the tree */
    scope: loaded && !!ctx.me,
    views: { show: ctx.lead && loaded, opts: views },
    due: {
      n: String(dueCount), on: S.mine_due ? 'true' : 'false', cls: 'chip mine-due' + (S.mine_due ? ' on' : ''),
      title: S.mine_due ? 'Show every row again' : 'Show only the readings that are due',
      toggle: () => set({ mine_due: !C.state.mine_due })
    },
    qsel: { v: ctx.when, opts: qOpts, on: (e) => set({ mine_q: mineVal(e), mine_edit: null }) },
    text: {
      v: S.mine_text || '',
      on: (e) => set({ mine_text: mineVal(e) }),
      key: (e) => { if (e && e.key === 'Escape') set({ mine_text: '' }); }
    },
    expandAll: () => set({ mine_depth: 'all', mine_open: {} }),
    collapse: () => set({ mine_depth: 'objectives', mine_open: {} }),
    rows: rows,
    noRows: noRows,
    noRowsText: S.mine_due && !String(S.mine_text || '').trim() ? 'No readings are due here.' : 'Nothing matches “' + String(S.mine_text || '').trim() + '”' + (S.mine_due ? ' among the readings due.' : '.'),
    clearFilters: () => set({ mine_text: '', mine_due: false }),
    filtering: filtering,
    tableLabel: ctx.view === 'team' ? 'Team Projects: every objective in the divisions you lead' : ctx.view === 'owned' ? 'Owned Projects: what is yours, by project and objective' : 'My projects: what is yours, by project and objective',
    empty: has ? null : mineEmptyVM(C, ctx),
    banner: banner,
    offline: !!(S.sim && S.sim.offline) && (!LIVE || loaded),
    goOnline: () => { if (LIVE) NET.poll(C); else C.setState({ sim: Object.assign({}, C.state.sim, { offline: false }), save: { state: 'saved', at: C.now() } }); },
    roOn: !!S.ro,
    showSave: loaded && !S.ro,
    openSettings: () => C.openSheet('mine.settings', {}, {}),
    sheetKey: (e) => {
      if (!e || e.key !== 'Escape') return;
      if (e.defaultPrevented || (typeof e.isDefaultPrevented === 'function' && e.isDefaultPrevented())) return;
      C.dismissSheet(e);
    },
    settings: top && top.kind === 'mine.settings' ? mineSettingsVM(C, ctx) : null
  };
}

/* ------------------------------------------------------------- Settings */
/* the CEO's and CTO's choice of divisions for Team Projects (null for everyone else) */
function mineTeamVM(C) {
  const v = C.viewer();
  if (!v || !mineTop(v.orgRole)) return null;
  const P = C.D.portfolio || {};
  const choice = mineTeamChoice(C, v.email, v.orgRole);
  const ds = (P.divisions || []).filter((d) => d && d.id);
  const name = (d) => d.name || d.id;
  const words = (list) => !list.length ? 'None yet' : list.length <= 3 ? F.list(list.map(name)) : F.list(list.slice(0, 2).map(name).concat([(list.length - 2) + ' more']));
  const covered = mineTeamDivs(P, choice);
  const opts = MINE_TEAM_MODES.map((k) => ({
    k: k, label: MINE_TEAM_WORDS[k], on: choice.mode === k, isDefault: choice.dflt === k,
    desc: k === 'pick' ? 'Any divisions you pick, R&D or business.' : words(ds.filter((d) => k === 'all' || mineDivKind(d) === k)),
    /* picking starts from what Team Projects covers now */
    pick: () => mineTeamSave(C, k === 'pick' ? { mode: 'pick', divs: choice.mode === 'pick' ? choice.divs : covered } : { mode: k })
  }));
  const groups = [['rd', 'R&D'], ['biz', 'Business']].map(([kind, label]) => ({
    k: kind, label: label,
    divs: ds.filter((d) => mineDivKind(d) === kind).map((d) => {
      const on = covered.indexOf(d.id) >= 0;
      const last = on && covered.length === 1;
      return {
        k: d.id, name: name(d), on: on, locked: last, title: last ? 'Team Projects keeps at least one division' : '',
        toggle: (e) => {
          const want = mineChecked(e, !on);
          if (want === on || (last && !want)) return;
          mineTeamSave(C, { mode: 'pick', divs: want ? covered.concat([d.id]) : covered.filter((x) => x !== d.id) });
        }
      };
    })
  })).filter((g) => g.divs.length);
  return {
    opts: opts, picking: choice.mode === 'pick', groups: groups,
    lede: 'Which divisions your Team Projects view covers. The ' + F.roleLabel(v.orgRole) + '’s default is ' + (choice.dflt === 'biz' ? 'the business divisions' : 'the R&D divisions') + '.',
    hint: 'Only Team Projects, here in My Projects, follows this choice; the other apps don’t. It’s remembered for you in this browser.'
  };
}

const MINE_NET_WHY = {
  loading: 'Loading from the broker…',
  notoken: 'No token in this browser yet: open this page from the Hub or another app, or paste the token here.',
  badtoken: 'The broker didn’t accept the token.',
  noportfolio: 'There is no portfolio on the broker yet.',
  offline: 'Couldn’t reach the broker; this page keeps trying.',
  fail: 'The last load failed.'
};
function mineSettingsVM(C, ctx) {
  const S = C.state;
  const set = (p) => C.setState(p);
  const net = LIVE ? NET.info(C) : null;
  const roByLink = LIVE && !!(C.net && C.net.url && Object.prototype.hasOwnProperty.call(C.net.url, 'readonly'));
  const theme = S.theme || 'system';
  let netVM = null;
  if (net) {
    const pend = net.pending ? 'Unsaved changes in ' + F.plural(net.pending, 'document') + '.' : 'No unsaved changes.';
    const last = 'Last loaded ' + F.ago(net.lastLoad, C.now()) + '.';
    if (!net.loaded) netVM = { cls: 'st ' + (net.phase === 'loading' ? 't-info' : 't-warn'), word: net.phase === 'loading' ? 'Loading' : 'Not loaded', text: MINE_NET_WHY[net.phase] || MINE_NET_WHY.fail };
    else if (net.offline) netVM = { cls: 'st t-warn', word: 'Offline', text: last + ' ' + pend + ' Changes are kept here and save when the connection returns.' };
    else netVM = { cls: 'st t-ok', word: 'Connected', text: last + ' ' + pend + ' Changes save 0.7 seconds after your last edit, or within 2.5 seconds while you keep editing.' };
  }
  const saveToken = () => {
    const t = String(C.state.mine_tokenDraft || '').trim();
    if (!t) { C.toast('Paste the broker token first.', 'info'); return; }
    set({ mine_tokenDraft: '' });
    if (LIVE) { NET.saveToken(C, t); C.toast('Token saved in this browser. Loading…', 'ok'); }
    else C.toast('Token saved in this browser.', 'ok');
  };
  return {
    team: mineTeamVM(C),
    themes: [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']].map((x) => ({ label: x[1], on: theme === x[0] ? 'true' : 'false', pick: () => { set({ theme: x[0] }); mineStore('rd_theme', x[0]); } })),
    themeHint: 'Saved in this browser and shared across the R&D suite.',
    tokenDraft: S.mine_tokenDraft || '',
    onToken: (e) => set({ mine_tokenDraft: mineVal(e) }),
    tokenKey: (e) => { if (e && e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); saveToken(); } },
    saveToken: saveToken,
    tokenState: LIVE ? (net.hasToken ? 'A token is saved in this browser.' : 'No token saved. Nothing loads or saves until you add one.') : 'The sample saves nothing to a broker.',
    tokenCls: !LIVE || net.hasToken ? 'sub' : 'sub tx-warn',
    net: netVM,
    hasNet: !!netVM,
    reload: () => {
      if (!LIVE) { C.toast('The sample has nothing to load.', 'info'); return; }
      const i = NET.info(C);
      if (i.loaded && i.offline && i.pending) { C.toast('You are offline with unsaved changes in ' + F.plural(i.pending, 'document') + '. They save when the connection returns; load again after that.', 'info'); return; }
      NET.reload(C);
    },
    roOn: !!S.ro,
    roLocked: roByLink,
    roHint: roByLink ? 'This page was opened with ?readonly, so it stays read-only. Open it without ?readonly to edit.' : 'The view a link with ?readonly opens: nothing saves and values are not buttons.',
    toggleRo: (e) => { if (!roByLink) set({ ro: mineChecked(e, !C.state.ro), mine_edit: null, kpi_ed: null }); },
    hub: C.viewerVM(),
    build: LIVE ? 'Build: ' + NET.CLIENT + ' (My Projects).' : 'Build: ' + MINE_BUILD + ' (My Projects board, sample data of ' + F.dayY(C.D.today) + ').',
    reset: LIVE ? null : () => C.confirm({ title: 'Restore the sample data?', body: 'Every change you made in this prototype is discarded.', ok: 'Restore', danger: true, onOk: () => C.resetData() })
  };
}
