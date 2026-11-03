/* ============================================================================
   Review (X-review): the Overview's one review table, Execution and Sales.
   Option 2b of the October 15 Overview mockups ("One review table"), built in.

   Every key result, stage-gate, kanban tile and FMEA problem of the selected objective is one row with
   the same columns: status, progress, date and a note. One status scale covers every row:
     Off track    a key result scoring under 65 (pace rule: more than 30 points behind an even pace); an
                  overdue stage-gate, or one marked failed; a kanban tile past its stage due date, over its
                  stage limit or past its swimlane deadline; a problem whose worst open cause has an RPN
                  of 200 or more (RD.rpnBand 'high').
     At risk      a key result scoring 65 to 79 (pace: 11 to 30 points behind); a stage-gate with a high
                  risk open on it; a tile that has used 80% of its stage limit, whose stage is due today or
                  whose swimlane is due within a week; a problem whose worst open RPN is 100 to 199.
     On track     key results scoring 80 and up, the stage-gate a chained workstream is working on (or one
                  marked in progress), tiles inside their limits, problems with only low risks open.
     Not started  a key result with no score yet, a stage-gate that is not current yet, a tile in the backlog.
     Done         passed stage-gates, tiles in the board's last stage, problems with nothing open.
     Cancelled    stage-gates left unfinished when the objective ended.
   When more than one rule applies the worst sets the status. The numbers come from the engine the other
   tabs use (RD.keyResultScore / band / keyResultPaceBand, classifyGate, stageGateScore, tileHealth,
   gateDueDates, gateTileState, worstUnresolvedRpn), so a row always agrees with its own tab.

   What the table does: a status bar per section (and per type when grouped by status or due date) whose
   segments filter, status chips, All / Needs attention, a filter box over names and notes (it narrows a
   group of finished tiles to the ones that match), group by type, status or due date, rows with detail
   expand (milestone steps, KPIs, gate targets, risk causes, finished tiles; off-track and at-risk rows
   start open), Expand all / Collapse all, and an item's name opens it on its own tab: the key result or
   gate expanded, the tile's board selected, the problem in the register, each highlighted for a few
   seconds and given keyboard focus (which scrolls it into view).
   Grouped by type, the stage-gates sit under their workstreams (Workstream A: name, chained or independent,
   how many have passed) and the kanban tiles under their swimlanes (stage limit and deadline; a backlog
   tile with no swimlane under "No swimlane"), each heading with its count and statuses, and each folds
   (decided October 15). A swimlane's finished tiles become one row from four on.
   A key result's KPIs and a stage-gate's targets take readings here as on their tabs (decided October 19):
   their value is the KPI table's own button, editor and readings drawer (KPI.post; postInto below).

   Public: REVIEW.items(C, ctx) (the rows' model, for tests), REVIEW.KR_RULE, REVIEW.STATUS.
   State (view only, never saved): review_sel (statuses filtered), review_q (filter text), review_gb
   ('type' | 'status' | 'due'), review_open (rows expanded or collapsed by hand, by item key), review_gc
   (groups and workstream / swimlane headings collapsed, by objective, grouping and group).
   ========================================================================== */
const REVIEW = (function () {
  /* the key results' rule: 'score' bands the score like the objective score and the sidebar (80 / 65);
     'pace' uses RD.keyResultPaceBand, as the Key results tab's own status does */
  const KR_RULE = 'score';
  const GROUP_FINISHED_AT = 4;    // a swimlane's finished tiles become one row (its tiles inside) from this many on
  const SUBBED = { gate: 1, tile: 1 };   // grouped by type, these sections head their rows by workstream / swimlane
  const FOCUS_MS = 8000;          // how long a target stays highlighted after its name is clicked here

  const STATUS = {
    off: { label: 'Off track', st: 'st t-bad', dot: 'dot', chipDot: 'dot t-bad', bar: 'review-seg review-b-bad', rank: 0 },
    risk: { label: 'At risk', st: 'st t-warn', dot: 'dot', chipDot: 'dot t-warn', bar: 'review-seg review-b-warn', rank: 1 },
    ok: { label: 'On track', st: 'st t-ok', dot: 'dot', chipDot: 'dot t-ok', bar: 'review-seg review-b-ok', rank: 2 },
    none: { label: 'Not started', st: 'st t-none', dot: 'dot', chipDot: 'dot t-none', bar: 'review-seg review-b-none', rank: 3 },
    done: { label: 'Done', st: 'st', dot: 'dot review-d-done', chipDot: 'dot review-d-done', bar: 'review-seg review-b-done', rank: 4 },
    cancelled: { label: 'Cancelled', st: 'st', dot: 'dot review-d-cnl', chipDot: 'dot review-d-cnl', bar: 'review-seg review-b-cnl', rank: 5 }
  };
  const ORDER = ['off', 'risk', 'ok', 'none', 'done', 'cancelled'];
  const ALWAYS = { off: 1, risk: 1, ok: 1, none: 1, done: 1 };   // chips shown even at 0 (Cancelled only when there is one)
  const TYPES = [
    { key: 'kr', label: 'Key results', tag: 'Key result', tab: 'krs' },
    { key: 'gate', label: 'Stage-gates', tag: 'Stage-gate', tab: 'gates' },
    { key: 'tile', label: 'Kanban', tag: 'Kanban', tab: 'kanban' },
    { key: 'risk', label: 'Risks', tag: 'Risk', tab: 'risks' }
  ];
  const TYPE_RANK = { kr: 0, gate: 1, tile: 2, risk: 3 };
  const DUE = [['late', 'Late'], ['today', 'Due today'], ['week', 'In the next 7 days'], ['month', 'In 8 to 30 days'], ['later', 'Later'],
    ['nodate', 'No date'], ['done', 'Done'], ['cancelled', 'Cancelled']];
  const KR_BAND = { 'on-track': 'ok', 'at-risk': 'risk', 'off-track': 'off' };

  /* ------------------------------------------------------------ small helpers */
  function txt(v) { return String(v == null ? '' : v).trim(); }
  function days(n) { return F.plural(Math.abs(n), 'day'); }
  function dayText(d, td) { return d == null ? '' : F.dayAuto(d, td); }
  function relCap(d, td) { return d == null ? '' : F.cap(F.rel(d, td)); }
  function isoDay(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    return F.fromIso(String(v).trim().slice(0, 10));
  }
  function pct(v) { return Math.round(K.clamp(Number(v) || 0, 0, 100)); }
  function fmtNum(v) {
    if (typeof KPI !== 'undefined' && KPI && KPI._util && typeof KPI._util.fmtNum === 'function') return KPI._util.fmtNum(v);
    return F.n(v);
  }
  function withUnit(s, unit) { return unit ? (/^(%|°)/.test(unit) ? s + unit : s + ' ' + unit) : s; }
  function sortDue(list) {
    return list.slice().sort((a, b) => {
      const pa = a.plannedDate == null ? Infinity : a.plannedDate, pb = b.plannedDate == null ? Infinity : b.plannedDate;
      return (pa - pb) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id));
    });
  }
  function setsOf(doc, objId) {
    return ((doc && doc.stageGateSets) || []).filter((s) => s && s.objectiveId === objId).slice()
      .sort((a, b) => ((a.order || 0) - (b.order || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
  }
  function gateLabel(doc, gateId) {
    if (typeof GATES !== 'undefined' && GATES && typeof GATES.label === 'function') return GATES.label(doc, gateId);
    if (typeof FMEA !== 'undefined' && FMEA && typeof FMEA.gateLabel === 'function') return FMEA.gateLabel(doc, gateId);
    return String(gateId);
  }
  function gatePassed(doc, gateId, td) {
    if (!gateId) return false;
    const g = ((doc && doc.stageGates) || []).find((x) => x && x.id === gateId);
    if (!g) return false;
    const s = RD.classifyGate(g, td);
    return s === 'passed' || s === 'passed-late';
  }
  function krTag(ctx, list, kr, i) {
    if (typeof KR !== 'undefined' && KR && typeof KR.tag === 'function') { const t = KR.tag(ctx, kr.id); if (t) return t; }
    let m = 0;
    const tags = list.map((x, j) => (x.trackingType === 'milestone' ? 'KR-M' + (++m) : 'KR' + (j + 1)));
    return tags[i] || 'KR' + (i + 1);
  }
  function boardsOf(doc, objId) {
    if (typeof KB !== 'undefined' && KB && typeof KB.boardsFor === 'function') return KB.boardsFor(doc, objId);
    return ((doc && doc.boards) || []).filter((b) => b && b.objectiveId === objId);
  }
  /* per-render caches are keyed by document and objective: My Projects (apps/mine) draws the items of many
     objectives, in several divisions, in one render */
  function pool(C, ctx) {
    return C.memo('review.pool:' + (ctx.docKey || ''), () => {
      try { if (typeof KPI !== 'undefined' && KPI && typeof KPI.pool === 'function') { const p = KPI.pool(C, ctx); if (Array.isArray(p)) return p; } } catch (e) { /* fall back below */ }
      const out = [], seen = {};
      Object.keys(ctx.em || {}).forEach((key) => (((ctx.em[key] || {}).kpis) || []).forEach((k) => { if (k && k.id && !seen[k.id]) { seen[k.id] = 1; out.push(k); } }));
      return out;
    });
  }

  /* -------------------------------------------------------------- rows */
  function row(o) {
    const r = Object.assign({
      isRow: true, isEmpty: false, isSub: false, emptyText: '', hasAct: false, actLabel: '', act: null,
      cls: 'review-tr review-row', k: '',
      hasExp: false, noExp: false, expanded: false, expCls: 'review-exp', expLabel: '', toggle: null,
      mkCheck: false, mkNum: false, mkTarget: false, mkCls: 'review-mk', mkText: '',
      tag: '', tid: '', name: '', sub: '', hasLink: false, noLink: true, go: null, linkTitle: '',
      stCls: 'st', stDot: 'dot', stWord: '', stSub: '',
      pgBar: false, barStyle: 'width: 0%', barCls: 'fill', barAria: '', barVal: '', hasTick: false, tickStyle: '',
      pgStage: false, pips: [], stage: '',
      pgGauge: false, gAria: '', bandStyle: '', hasMk: false, mkStyle: '', gmkCls: 'review-gmk', gLabels: [],
      pgRpn: false, rpnPre: '', rpnVal: '',
      pgText: false, pgTxt: '', pgTxtCls: 'sub',
      pgSub: '', pgSubCls: 'sub',
      /* a KPI or target row's reading controls (postInto): the value as a button, beside the bar (valInBar) or
         on a line of its own (valLine); the inline editor while posting (kpiEd); a statistical KPI's readings */
      barValStatic: true, valInBar: false, valLine: false, vCls: '', vAria: '', vTitle: '', vExp: null, vClick: null, vText: '',
      kpiEd: false, ed: null, drawer: null, drawerK: '', drawerCls: 'review-drow',
      date: '', dateSub: '', note: ''
    }, o);
    r.hasTag = !!r.tag; r.hasTid = !!r.tid; r.hasSub = !!r.sub; r.hasStSub = !!r.stSub;
    r.hasPgSub = !!r.pgSub; r.hasDateSub = !!r.dateSub;
    return r;
  }
  function kidRow(o) { return row(Object.assign({ cls: 'review-tr review-row is-kid' }, o)); }
  function emptyRow(text, actLabel, act) {
    return Object.assign(row({}), { isRow: false, isEmpty: true, emptyText: text, hasAct: !!act, actLabel: actLabel || '', act: act || null });
  }
  /* an item: one row of its own plus the rows under it (kids) */
  function item(o) {
    const S = STATUS[o.status];
    o.row = row(Object.assign({ cls: 'review-tr review-row is-item', stCls: S.st, stDot: S.dot, stWord: S.label, stSub: F.cap(o.reason || '') }, o.row));
    o.rank = S.rank;
    o.sortDay = o.day == null ? Infinity : o.day;
    o.units = o.units || 1;
    o.kids = o.kids || [];
    o.defaultOpen = o.kids.length > 0 && (o.status === 'off' || o.status === 'risk');
    o.kidTexts = o.kids.map((k) => [k.tid, k.name, k.sub, k.note].join(' ').toLowerCase());
    o.kidText = o.kidTexts.join(' ');
    /* the filter also finds an item by its workstream or swimlane */
    o.ownText = [o.row.tid, o.row.name, o.row.sub, o.row.note, o.grp ? o.grp.label + ' ' + (o.grp.name || '') : ''].join(' ').toLowerCase();
    return o;
  }
  function dueKey(it, td) {
    if (it.status === 'done' || it.status === 'cancelled') return it.status;
    if (it.day == null) return 'nodate';
    const n = it.day - td;
    return n < 0 ? 'late' : n === 0 ? 'today' : n <= 7 ? 'week' : n <= 30 ? 'month' : 'later';
  }

  /* the KPI table's words for one KPI (kpi statusOf): Met, On track, Near, Below; "No reading" for none */
  function kpiWord(pp) {
    const s = pp.score, rs = pp.raw, rb = F.band(rs);
    const complete = !pp.expected || (pp.n || 0) >= pp.expected;
    const rawWord = rs == null ? 'No reading' : rs >= 100 ? 'On track' : rb === 'ok' ? 'On track' : rb === 'warn' ? 'Near' : 'Below';
    const word = s == null ? 'No reading' : pp.partial ? rawWord : (s >= 100 && complete) ? 'Met' : rawWord;
    return { word: word, tone: rs == null ? 'none' : rb };
  }
  /* a range target drawn as a band on an axis with the reading as a mark */
  function gaugeOf(lo, hi, v) {
    const a = Math.min(lo, v == null ? lo : v), b = Math.max(hi, v == null ? hi : v);
    const pad = (b - a) * 0.2 || Math.abs(b) * 0.2 || 1;
    const min = a - pad, max = b + pad;
    const pos = (x) => Math.round((x - min) / (max - min) * 1000) / 10;
    return { l: pos(lo), w: Math.round((pos(hi) - pos(lo)) * 10) / 10, m: v == null ? null : pos(v) };
  }
  /* what one KPI says now: its criterion, current value, latest reading and the change since the one before */
  function kpiFacts(ctx, k, P, td) {
    const em = ctx.em;
    const def = RD.definerOf(k, P) || k;
    const isBin = def.targetType === 'binary', isStat = def.targetType === 'statistical';
    const unit = RD.kpiUnit(k, P) || '';
    const dir = RD.kpiDirection(k, P), tgt = RD.effTarget(k, P), cv = RD.effValue(k, P, em);
    const pp = RD.kpiScoreParts(k, P, em);
    let crit;
    if (isBin) crit = 'Pass or fail';
    else if (tgt == null) crit = 'No target yet';
    else if (typeof tgt === 'object') crit = 'Target ' + fmtNum(tgt.lo) + ' to ' + withUnit(fmtNum(tgt.hi), unit);
    else crit = (dir === 'down' ? 'At most ' : dir === 'up' ? 'At least ' : 'Target ') + withUnit(fmtNum(tgt), unit);
    let cur = 'No reading';
    if (cv != null) cur = isBin ? (Number(cv) >= 1 ? 'Pass' : 'Fail') : withUnit(fmtNum(isStat && typeof cv === 'number' ? Math.round(cv * 1000) / 1000 : cv), unit);
    const ups = RD.readingsFor(RD.readingSourceId(k, P), em).filter((u) => u && u.value != null && !isNaN(Number(u.value)));
    const last = ups[0] || null, prev = ups[1] || null;
    const lastDay = last && last.timestamp ? F.dayOfMs(last.timestamp) : null;
    let change = '';
    if (isStat) change = pp.expected ? Math.min(pp.n || 0, pp.expected) + ' of ' + pp.expected + ' samples in.' : (ups.length ? F.plural(ups.length, 'reading') + '.' : '');
    else if (!last) change = cv != null ? 'The value comes from a linked KPI.' : '';
    else if (prev && !isBin) {
      const dlt = Number(last.value) - Number(prev.value);
      const pd = prev.timestamp ? dayText(F.dayOfMs(prev.timestamp), td) : '';
      change = (dlt > 0 ? 'Up ' + fmtNum(Math.round(dlt * 1000) / 1000) : dlt < 0 ? 'Down ' + fmtNum(Math.round(-dlt * 1000) / 1000) : 'No change') + (pd ? ' since ' + pd : '') + '.';
    }
    if (pp.partial) change = (change ? change + ' ' : '') + 'Partial check-in: scores ' + Math.round(pp.raw) + ' on the samples so far.';
    return {
      name: RD.kpiName(k, P) || 'Unnamed KPI', unit: unit, isBin: isBin, isStat: isStat, tgt: tgt, cv: cv, pp: pp,
      crit: crit, cur: cur, last: last, lastDay: lastDay, ups: ups.length,
      change: change || (ups.length || cv != null ? '' : 'No readings yet.')
    };
  }
  /* one KPI under a key result, or one target under a stage-gate (itemKey: the item it sits under) */
  function kpiRow(C, ctx, k, P, td, itemKey) {
    const f = kpiFacts(ctx, k, P, td);
    const w = kpiWord(f.pp);
    const tgt = f.tgt, cur = f.cur, last = f.last;
    const o = {
      k: 'kpi:' + k.id, mkTarget: true, name: f.name, sub: f.crit,
      stCls: 'st ' + F.tone(w.tone), stWord: w.word,
      date: f.lastDay != null ? dayText(f.lastDay, td) : '', dateSub: last && last.by ? F.first(last.by) : (last && last.src && last.src.portal === 'analysis' ? 'Analysis import' : ''),
      note: f.change
    };
    if (k.pull && typeof PULL !== 'undefined') o.note = PULL.reviewNote(C, k);   // a pulled KPI says what it pulled (mods/pull)
    if (!f.isBin && tgt != null && typeof tgt === 'object' && isFinite(Number(tgt.lo)) && isFinite(Number(tgt.hi))) {
      const v = f.cv == null ? null : Number(f.cv);
      const lo = Number(tgt.lo), hi = Number(tgt.hi);
      const g = gaugeOf(lo, hi, v);
      const inside = v != null && v >= lo && v <= hi;
      o.pgGauge = true;
      o.bandStyle = 'left: ' + g.l + '%; width: ' + g.w + '%';
      o.hasMk = g.m != null; o.mkStyle = g.m != null ? 'left: ' + g.m + '%' : '';
      o.gmkCls = 'review-gmk' + (v == null ? '' : inside ? ' in' : ' out');
      o.gLabels = [{ k: 'lo', style: 'left: ' + g.l + '%', text: fmtNum(lo) }, { k: 'hi', style: 'left: ' + (Math.round((g.l + g.w) * 10) / 10) + '%', text: fmtNum(hi) }];
      o.gAria = 'Range ' + fmtNum(lo) + ' to ' + withUnit(fmtNum(hi), f.unit) + (v == null ? ', no reading yet' : ', reads ' + cur + (inside ? ', inside the range' : ', outside the range'));
      o.pgSub = v == null ? 'No reading' : 'Reads ' + cur;
    } else if (f.isBin) {
      o.pgText = true; o.pgTxt = cur; o.pgTxtCls = f.cv == null ? 'sub' : '';
    } else {
      const sc = f.pp.score;
      o.pgBar = true; o.barStyle = 'width: ' + (sc == null ? 0 : pct(sc)) + '%'; o.barCls = 'fill ' + F.tone(F.band(sc));
      o.barVal = cur; o.barAria = f.name + ': ' + cur + ', ' + f.crit.toLowerCase() + (sc == null ? '' : ', scores ' + Math.round(sc));
    }
    postInto(o, C, ctx, k, itemKey);
    return kidRow(o);
  }
  /* A KPI or target row takes readings the way its tab's KPI table does (decided October 19): KPI.post gives the
     table row's own controls, so clicking the value posts a reading inline (Enter posts, Escape cancels, a blank
     clears this KPI's own readings), and a statistical KPI opens its readings (Add reading, Start a new batch)
     under the row. The review keeps its own key ('review:<host type>:<host>'), so the tab's table never opens
     with it. The item stays open once its value is clicked, so a reading that changes the item's status (a gate
     that passes, a key result back on track) never folds the row away. Read-only: values only, and a statistical
     KPI's readings to look at. */
  function postInto(o, C, ctx, k, itemKey) {
    if (typeof KPI === 'undefined' || !KPI || typeof KPI.post !== 'function') return;
    let p = null;
    try { p = KPI.post(C, ctx, k, 'review:' + k.hostType + ':' + k.hostId); } catch (e) { p = null; }
    if (!p) return;
    if (p.editing) {
      /* the editor takes the progress cell while a reading is typed */
      Object.assign(o, { pgBar: false, pgGauge: false, pgText: false, pgSub: '', kpiEd: true, ed: p.ed });
    } else if (p.btn) {
      const click = () => {
        const m = C.state.review_open || {};
        if (itemKey && m[itemKey] !== true) C.setState({ review_open: Object.assign({}, m, { [itemKey]: true }) });
        p.click();
      };
      Object.assign(o, { vCls: p.cls + ' review-val', vAria: p.aria, vTitle: p.title, vExp: p.expanded, vClick: click, vText: p.text });
      if (o.pgBar) Object.assign(o, { valInBar: true, barValStatic: false });
      else Object.assign(o, { valLine: true, pgText: false, pgSub: '' });   // a range's gauge or a pass / fail value
    }
    if (p.drawer) Object.assign(o, { drawer: p.drawer, drawerK: 'review-readings:' + k.id });
  }

  /* --------------------------------------------------------- key results */
  function krItems(C, ctx, P) {
    const doc = ctx.doc, em = ctx.em, td = ctx.today, obj = ctx.obj;
    const list = ((doc && doc.keyResults) || []).filter((r) => r && r.objectiveId === ctx.objId);
    const ps = obj.plannedStart, pe = obj.plannedEnd;
    const timed = ps != null && pe != null && pe > ps;
    const used = timed ? K.clamp((td - ps) / (pe - ps), 0, 1) * 100 : null;
    return list.map((kr, i) => {
      const tag = krTag(ctx, list, kr, i);
      const tt = kr.trackingType || 'kpi';
      const att = RD.keyResultScore(kr.id, em);
      const smp = RD.keyResultSample(kr.id, em);
      const status = KR_RULE === 'pace' ? (KR_BAND[RD.keyResultPaceBand(att, ps, pe, td)] || 'none') : (att == null ? 'none' : (KR_BAND[RD.band(att)] || 'none'));
      const kk = P.filter((k) => k.objectiveId === ctx.objId && k.hostType === 'keyResult' && k.hostId === kr.id);
      /* what kind of key result, in a few words */
      let sub;
      const steps = kr.steps || [];
      const eff = tt === 'milestone' ? RD.milestoneEffectiveWeights(steps) : [];
      if (tt === 'percentage') sub = '% completion, set by hand';
      else if (tt === 'milestone') sub = steps.length ? F.plural(steps.length, 'step') + (eff.every((e) => e.auto) ? ', equal weight' : ', weighted') + (kr.creditMode === 'partial' ? ', partial credit' : '') : 'Milestone steps, none yet';
      else if (tt === 'subkr') sub = F.plural((kr.subKrs || []).length, 'sub-key result') + ' (legacy)';
      else sub = kk.length ? F.plural(kk.length, 'KPI') : 'KPI-based, no KPIs yet';
      /* the date: the next unfinished milestone step, else the objective's planned end */
      let next = null;
      steps.some((x, j) => { if ((Number(x.completion) || 0) < 100) { next = { n: j + 1, x: x, due: isoDay(x.due) }; return true; } return false; });
      const day = next && next.due != null ? next.due : (pe != null ? pe : null);
      /* the note: where the work stands */
      let note = '';
      if (tt === 'milestone') {
        if (!steps.length) note = 'No steps yet.';
        else if (!next) note = 'Every step is done.';
        else {
          const c = pct(next.x.completion), nm = txt(next.x.name) || 'Unnamed step';
          if (next.due != null && next.due < td) note = 'Step ' + next.n + ' is late: ' + nm + ', due ' + dayText(next.due, td) + (c ? ', ' + c + '% done' : '') + '.';
          else if (c) note = 'Next: step ' + next.n + ', ' + nm + ', ' + c + '% done.';
          else note = 'Next: step ' + next.n + ', ' + nm + (next.due != null ? ', due ' + dayText(next.due, td) : '') + '.';
        }
      } else if (tt === 'kpi' || kk.length) {
        if (!kk.length) note = 'No KPIs yet.';
        else {
          const met = kk.filter((k) => { const s = RD.kpiScoreResolved(k, P, em); return s != null && s >= 100; }).length;
          if (kk.length === 1) {
            /* one KPI: its latest reading and the change, as the KPI's own row says */
            const f = kpiFacts(ctx, kk[0], P, td);
            note = (f.lastDay != null ? 'Latest reading ' + f.cur + ' on ' + dayText(f.lastDay, td) + '.' : f.cv != null ? 'Reads ' + f.cur + '.' : 'No readings yet.') + (f.change && f.lastDay != null ? ' ' + f.change : '');
            if (kk[0].pull && typeof PULL !== 'undefined') note = PULL.reviewNote(C, kk[0]);
          } else {
            let lastTs = 0, lastK = null;
            kk.forEach((k) => { const u = RD.readingsFor(RD.readingSourceId(k, P), em)[0]; if (u && (u.timestamp || 0) > lastTs) { lastTs = u.timestamp || 0; lastK = k; } });
            note = met + ' of ' + kk.length + ' KPIs on target.' + (lastK ? ' Last reading ' + dayText(F.dayOfMs(lastTs), td) + ', ' + (RD.kpiName(lastK, P) || 'a KPI') + '.' : ' No readings yet.');
            if (!lastK && kk.some((x) => x.pull)) note = met + ' of ' + kk.length + ' KPIs on target. ' + (kk.every((x) => x.pull) ? 'Each is pulled from other work.' : 'Some are pulled from other work.');
          }
        }
      }
      if (smp.partial) note = (note ? note + ' ' : '') + F.plural(smp.partialCount, 'KPI') + ' partial.';
      /* the pace line under the bar (the Key results tab's words) */
      let paceText = '';
      if (att != null && att >= 100) paceText = 'Target met';
      else if (att != null && used != null) {
        const gap = Math.round(used - att);
        paceText = gap === 0 ? 'On pace' : gap < 0 ? -gap + (gap === -1 ? ' pt' : ' pts') + ' ahead of pace' : gap + (gap === 1 ? ' pt' : ' pts') + ' behind pace';
      } else if (att != null) paceText = 'No objective dates';
      /* the rows under it */
      const kids = [];
      if (tt === 'milestone') {
        const byId = {};
        eff.forEach((e) => { byId[e.id] = e; });
        steps.forEach((x, j) => {
          const c = pct(x.completion), done = c >= 100, due = isoDay(x.due), late = !done && due != null && due < td;
          const e = byId[x.id];
          kids.push(kidRow({
            k: 'step:' + kr.id + ':' + (x.id || j),
            mkCheck: done, mkNum: !done, mkCls: 'review-mk' + (c > 0 && !done ? ' part' : ''), mkText: String(j + 1),
            name: txt(x.name) || 'Unnamed step', sub: e ? 'Weight ' + e.w.toFixed(e.auto ? 1 : 0) + '%' + (e.auto ? ', shared' : '') : '',
            stCls: 'st ' + (done ? '' : late ? 't-bad' : c > 0 ? 't-info' : 't-none'), stDot: 'dot' + (done ? ' review-d-done' : ''),
            stWord: done ? 'Done' : late ? 'Late' : c > 0 ? 'In progress' : 'Not started',
            pgBar: true, barStyle: 'width: ' + c + '%', barCls: 'fill' + (done ? ' t-ok' : ''), barVal: c + '%', barAria: (txt(x.name) || 'Step ' + (j + 1)) + ': ' + c + '% done',
            date: due != null ? dayText(due, td) : '', dateSub: due == null ? 'No due date' : done ? '' : relCap(due, td)
          }));
        });
      }
      kk.forEach((k) => kids.push(kpiRow(C, ctx, k, P, td, 'kr:' + kr.id)));
      if (tt === 'subkr') {
        (kr.subKrs || []).forEach((s, j) => {
          const sc = RD.subKrScore([s]);
          kids.push(kidRow({
            k: 'sub:' + kr.id + ':' + j, mkNum: true, mkText: String(j + 1),
            name: txt(s.name) || 'Sub-key result ' + (j + 1), sub: 'Weight ' + (s.weight || 1),
            stCls: 'st ' + F.tone(F.band(sc)), stWord: sc == null ? 'No score yet' : F.bandWord(F.band(sc)),
            pgBar: true, barStyle: 'width: ' + (sc == null ? 0 : pct(sc)) + '%', barCls: 'fill ' + F.tone(F.band(sc)), barVal: F.score(sc), barAria: 'Score ' + F.score(sc)
          }));
        });
      }
      const nounOne = tt === 'milestone' && !kk.length ? 'step' : tt === 'subkr' ? 'sub-key result' : kk.length && !steps.length ? 'KPI' : 'row';
      return item({
        key: 'kr:' + kr.id, id: kr.id, type: 'kr', status: status,
        reason: att == null ? 'no score yet' : 'score ' + Math.round(att) + (smp.partial ? ', partial' : ''),
        day: day, kids: kids, nounOne: nounOne,
        row: {
          k: 'review:' + kr.id, tid: tag, name: txt(kr.statement) || kr.id, sub: sub,
          pgBar: true, barStyle: 'width: ' + (att == null ? 0 : pct(att)) + '%', barCls: 'fill ' + F.tone(F.band(att)),
          barVal: att == null ? '—' : Math.round(att) + '%',
          hasTick: used != null, tickStyle: used != null ? 'left: ' + (Math.round(used * 10) / 10) + '%' : '',
          barAria: (att == null ? 'No score yet' : 'Score ' + Math.round(att)) + (used != null ? ', ' + Math.round(used) + '% of the time used' : ''),
          pgSub: paceText,
          date: dayText(day, td), dateSub: day == null ? 'No date' : relCap(day, td),
          note: note
        },
        go: { tab: 'krs', patch: (S) => ({ kr_open: Object.assign({}, S.kr_open, { [kr.id]: true }), kr_focus: kr.id }), focusKey: 'kr_focus', focus: kr.id }
      });
    });
  }

  /* ---------------------------------------------------------- stage-gates */
  function gateItems(C, ctx, P) {
    const doc = ctx.doc, em = ctx.em, td = ctx.today, objId = ctx.objId;
    const all = sortDue(((doc && doc.stageGates) || []).filter((g) => g && g.objectiveId === objId));
    const sets = setsOf(doc, objId);
    const setName = {};
    sets.forEach((s) => { setName[s.id] = txt(s.name) || 'Unnamed workstream'; });
    /* the gate a chained workstream is working on: its first unpassed gate by due date (an independent
       workstream's gates are only "in progress" when marked so, as on the Stage-gates tab) */
    const chained = {};
    sets.forEach((s) => { chained[s.id] = s.chained !== false; });
    /* the workstream heading each gate sits under (grouped by type): its letter as the Stage-gates tab gives
       it, its name, chained or independent, and how many of its gates have passed */
    const wsGroup = {};
    sets.forEach((s, si) => {
      const gs = all.filter((g) => g.setId === s.id);
      const passedN = gs.filter((g) => g.actualDate != null).length;
      wsGroup[s.id] = {
        key: 'ws:' + s.id, order: si, label: 'Workstream ' + String.fromCharCode(65 + si), name: setName[s.id],
        meta: (chained[s.id] ? 'Chained' : 'Independent') + ', ' + passedN + ' of ' + F.plural(gs.length, 'gate') + ' passed'
      };
    });
    const looseGroup = { key: 'ws:', order: sets.length, label: 'No workstream', name: '', meta: 'Not in a workstream yet' };
    const current = {}, seen = {};
    all.forEach((g) => { const key = g.setId || ''; if (!seen[key] && g.actualDate == null) { seen[key] = 1; if (chained[key]) current[g.id] = 1; } });
    /* the worst open problem on each gate */
    const onGate = {};
    RD.fmeaProblemsFor(doc, objId).forEach((p) => {
      if (!p || !p.gateId) return;
      const u = RD.worstUnresolvedRpn(p, gatePassed(doc, p.gateId, td));
      if (u > 0 && (!onGate[p.gateId] || u > onGate[p.gateId].u)) onGate[p.gateId] = { p: p, u: u };
    });
    let casc = null;
    try { casc = ctx.casc ? ctx.casc() : null; } catch (e) { casc = null; }
    const eff = (casc && casc.gateEffective) || {};
    const plan = RD.activeCatchupPlan(doc.catchupPlans, objId);
    const rev = RD.planRevision(doc, objId);   // the delays known that day are in the plan (RD.cascade)
    let marks = {};
    if (APP !== 'sales') marks = C.memo('review.marks:' + (ctx.docKey || '') + ':' + objId, () => { try { return RD.gateVersionMarks(doc, objId) || {}; } catch (e) { return {}; } });
    return all.map((g) => {
      const label = gateLabel(doc, g.id);
      const tks = P.filter((k) => k.objectiveId === g.objectiveId && k.hostType === 'stageGate' && k.hostId === g.id);
      const ref = g.baselineDate != null ? g.baselineDate : g.plannedDate;
      const high = onGate[g.id] && RD.rpnBand(onGate[g.id].u) === 'high' ? onGate[g.id] : null;
      let status, reason;
      const r = { k: 'review:' + g.id, tid: label, name: txt(g.name) || g.id, sub: txt(g.intention) || setName[g.setId] || '', subGrp: txt(g.intention) };
      const notes = [];
      if (g.actualDate != null) {
        const dd = ref == null ? 0 : g.actualDate - ref;
        status = 'done';
        reason = ref == null ? 'passed' : dd < 0 ? 'passed ' + days(dd) + ' early' : dd > 0 ? 'passed ' + days(dd) + ' late' : 'passed on time';
        r.pgText = true; r.pgTxtCls = 'sub';
        r.pgTxt = g.completionMethod === 'auto' ? 'Passed, every target met' : g.completionMethod === 'manual' ? 'Passed by hand' : 'Passed';
        r.date = dayText(g.actualDate, td); r.dateSub = g.plannedDate != null ? 'Due ' + dayText(g.plannedDate, td) : '';
        if (txt(g.overrideJustification)) notes.push(txt(g.overrideJustification).replace(/([^.!?])$/, '$1.'));
        if (dd > 0 && rev && g.actualDate <= rev.day) notes.push((rev.v ? 'Plan v' + rev.v : 'The revised plan of ' + dayText(rev.day, td)) + ' takes this delay into account.');
      } else {
        if (ctx.ended) { status = 'cancelled'; reason = 'the objective ended'; }
        else if (g.plannedDate != null && g.plannedDate < td) { status = 'off'; reason = days(td - g.plannedDate) + ' overdue'; }
        else if (g.status === 'missed') { status = 'off'; reason = 'marked failed'; }
        else if (high) { status = 'risk'; reason = 'high risk open on it'; }
        else if (current[g.id] || g.status === 'active') { status = 'ok'; reason = 'in progress'; }
        else { status = 'none'; reason = g.plannedDate == null ? 'no planned date' : 'not yet due'; }
        if (tks.length) {
          const sc = RD.stageGateScore(g.id, em);
          const smp = RD.hostSample('stageGate', g.id, em);
          const met = tks.filter((k) => { const s = RD.kpiScoreResolved(k, P, em); return s != null && s >= 100; }).length;
          r.pgBar = true; r.barStyle = 'width: ' + (sc == null ? 0 : pct(sc)) + '%'; r.barCls = 'fill ' + F.tone(F.band(sc));
          r.barVal = sc == null ? '—' : Math.round(sc) + '%'; r.barAria = 'Readiness ' + (sc == null ? 'not measured yet' : Math.round(sc) + '%');
          r.pgSub = 'Ready, ' + met + ' of ' + F.plural(tks.length, 'target') + ' met' + (smp.partial ? ', ' + smp.partialCount + ' partial' : '');
        } else { r.pgText = true; r.pgTxt = 'No targets yet'; r.pgTxtCls = 'sub'; }
        r.date = dayText(g.plannedDate, td); r.dateSub = g.plannedDate == null ? 'No date' : relCap(g.plannedDate, td);
        if (status === 'cancelled') notes.push('Cancelled when the objective ended.');
        else {
          const e = eff[g.id];
          if (status === 'off' && g.plannedDate != null && g.plannedDate < td) notes.push('Forecast ' + (e == null || e <= td ? 'today' : dayText(e, td)) + ', a day later for each day it stays open.');
          else if (e != null && g.plannedDate != null && e > g.plannedDate) notes.push('Forecast ' + dayText(e, td) + ', pushed ' + days(e - g.plannedDate) + ' by an earlier gate.');
          if (g.status === 'missed') notes.push('Marked failed.');
          if (high) notes.push('High risk open: ' + (txt(high.p.problem) || 'unnamed problem') + ', RPN ' + high.u + '.');
        }
      }
      const cu = plan && status !== 'cancelled' ? RD.catchupEntry(doc.catchupPlans, objId, g.id) : null;
      if (cu && cu.originalDate != null) notes.push('Moved from ' + dayText(cu.originalDate, td) + ' by the revised plan of ' + dayText(plan.enactedDay, td) + '.');
      const m = status === 'cancelled' ? null : marks[g.id];
      if (m && !cu) {
        if (m.kind === 'moved') notes.push('Moved in plan v' + m.v + (m.deltaDays ? ', ' + (m.deltaDays > 0 ? 'later' : 'earlier') + ' by ' + days(m.deltaDays) : '') + '.');
        else if (m.kind === 'added') notes.push('Added in plan v' + m.v + '.');
        else if (m.kind === 'retargeted') notes.push('Targets changed in plan v' + m.v + '.');
      }
      r.note = notes.join(' ');
      return item({
        key: 'gate:' + g.id, id: g.id, type: 'gate', status: status, reason: reason, grp: wsGroup[g.setId] || looseGroup,
        day: g.actualDate != null ? g.actualDate : g.plannedDate, kids: tks.map((k) => kpiRow(C, ctx, k, P, td, 'gate:' + g.id)), nounOne: 'target',
        row: r,
        go: { tab: 'gates', patch: (S) => ({ gates_open: Object.assign({}, S.gates_open, { [g.id]: true }), gates_focus: g.id }), focusKey: 'gates_focus', focus: g.id }
      });
    });
  }

  /* --------------------------------------------------------------- kanban */
  function tileItems(C, ctx) {
    const doc = ctx.doc, td = ctx.today, tIso = F.iso(td);
    const boards = boardsOf(doc, ctx.objId);
    const multi = boards.length > 1;
    const out = [];
    boards.forEach((b, bi) => {
      const cols = b.columns || [], lanes = b.swimlanes || [], tiles = b.tiles || [];
      if (!cols.length) return;
      const bName = txt(b.name) || 'Untitled board';
      const last = cols[cols.length - 1];
      const lastName = txt(last.name) || 'Untitled stage';
      const colIdx = {}, laneById = {};
      cols.forEach((c, i) => { colIdx[c.id] = i; });
      lanes.forEach((l) => { laneById[l.id] = l; });
      const laneName = (l) => (l && (txt(l.name) || l.id)) || '';
      const subOf = (t) => [multi ? bName : '', laneName(laneById[t.lane]) || 'No swimlane yet', t.assignee ? F.first(t.assignee) : 'unassigned'].filter(Boolean).join(', ');
      /* under its swimlane heading the row needn't name the swimlane again */
      const subIn = (t) => (t.assignee ? F.first(t.assignee) : 'Unassigned');
      /* the swimlane heading a tile sits under (grouped by type): board order, then "No swimlane" */
      const laneKey = (t) => (laneById[t.lane] ? t.lane : '');
      const groups = {};
      const laneGroup = (lk) => {
        if (groups[lk]) return groups[lk];
        const l = lk ? laneById[lk] : null;
        const max = l ? Number(l.maxDaysPerCol) || 0 : 0;
        const dl = l && l.deadline ? isoDay(l.deadline) : null;
        const meta = l ? (max ? F.plural(max, 'day') + ' per stage' : 'No stage limit') + (dl != null ? ', due ' + dayText(dl, td) : '') : 'Swimlane chosen at start';
        groups[lk] = {
          key: 'lane:' + b.id + ':' + lk, order: bi * 1000 + (l ? lanes.indexOf(l) : 999),
          label: l ? laneName(l) : 'No swimlane', name: '', meta: (multi ? bName + ' board, ' : '') + (multi ? meta.charAt(0).toLowerCase() + meta.slice(1) : meta)
        };
        return groups[lk];
      };
      const pipsOf = (t, ci, curCls) => cols.map((c, k) => ({ k: c.id, cls: k < ci ? (RD.gateTileState(b, t, k, tIso) === 'passed-late' ? 'l' : 'c') : k === ci ? curCls : '' }));
      const lateOf = (t, upTo) => { let n = 0; for (let k = 0; k < upTo; k++) if (RD.gateTileState(b, t, k, tIso) === 'passed-late') n++; return n; };
      /* the board selected and the tile highlighted; a finished tile's lane shows its older tiles, a parked
         tile's backlog opens (both for this visit only) */
      const go = (t, where) => ({
        tab: 'kanban',
        patch: (S) => {
          const p = { kb_sel: b.id, kb_focus: t ? t.id : '' };
          if (where === 'done' && t) p.kb_older = Object.assign({}, S.kb_older, { [b.id + ':' + t.lane]: true });
          if (where === 'backlog') p.kb_bl = true;
          return p;
        },
        focusKey: 'kb_focus', focus: t ? t.id : ''
      });
      const finByLane = {};
      tiles.forEach((t) => {
        if (!t) return;
        if (RD.tileInBacklog(t)) {
          out.push(item({
            key: 'tile:' + t.id, id: t.id, type: 'tile', status: 'none', reason: (t.lane == null || t.lane === '') ? 'no swimlane yet' : 'in the backlog', day: null,
            grp: laneGroup(laneKey(t)),
            row: { k: 'review:' + t.id, name: txt(t.name) || '(tile)', sub: subOf(t), subGrp: subIn(t), pgText: true, pgTxt: 'In the backlog', pgTxtCls: 'sub', dateSub: 'No date' },
            go: go(t, 'backlog')
          }));
          return;
        }
        const ci = colIdx[t.col];
        if (ci == null) return;   // a column that no longer exists: the Kanban tab doesn't draw it either
        if (ci === cols.length - 1) { (finByLane[laneKey(t)] = finByLane[laneKey(t)] || []).push(t); return; }
        const lane = laneById[t.lane];
        const max = lane ? Number(lane.maxDaysPerCol) || 0 : 0;
        const h = RD.tileHealth(t, lane, tIso);
        const dts = RD.gateDueDates(cols, lane, t);
        const due = isoDay(dts.due[ci]);
        const gst = RD.gateTileState(b, t, ci, tIso);
        const dl = lane && lane.deadline ? isoDay(lane.deadline) : null;
        const n = h.daysInCol;
        let status, reason;
        if (gst === 'overdue') { status = 'off'; reason = 'stage ' + (due != null ? days(td - due) + ' late' : 'overdue'); }
        else if (h.status === 'breached') { status = 'off'; reason = max && n > max ? 'over the stage limit' : 'past the swimlane deadline'; }
        else if (due != null && due === td) { status = 'risk'; reason = 'stage due today'; }
        else if (h.status === 'at-risk') { status = 'risk'; reason = max && n >= Math.ceil(max * 0.8) ? (n === max ? 'at the stage limit' : n + ' of ' + max + ' days used') : 'swimlane due ' + F.rel(dl, td); }
        else { status = 'ok'; reason = max ? days(max - n) + ' left' : 'no stage limit'; }
        const stage = txt(cols[ci].name) || 'Untitled stage';
        const notes = ['In ' + stage + ' since ' + dayText(isoDay(t.enteredCol), td) + '.'];
        const late = lateOf(t, ci);
        if (late) notes.push(F.plural(late, 'earlier stage') + ' cleared late.');
        if (lane && lane.deadline && max && dts.feasible === false) notes.push('At ' + days(max) + ' a stage it reaches ' + lastName + ' after the swimlane deadline, ' + dayText(dl, td) + '.');
        out.push(item({
          key: 'tile:' + t.id, id: t.id, type: 'tile', status: status, reason: reason, day: due, grp: laneGroup(laneKey(t)),
          row: {
            k: 'review:' + t.id, name: txt(t.name) || '(tile)', sub: subOf(t), subGrp: subIn(t),
            pgStage: true, pips: pipsOf(t, ci, gst === 'overdue' ? 'o' : 'h'), stage: stage,
            pgSub: max ? n + ' of ' + max + ' days in this stage' : F.plural(n, 'day') + ' in this stage',
            date: dayText(due, td), dateSub: due == null ? 'No date' : relCap(due, td),
            note: notes.join(' ')
          },
          go: go(t)
        }));
      });
      /* finished tiles, per swimlane: rows of their own, or one row from GROUP_FINISHED_AT on */
      const finDay = (t) => isoDay(t.enteredCol);
      const allPips = (t) => cols.map((c, k) => ({ k: c.id, cls: k < cols.length - 1 ? (RD.gateTileState(b, t, k, tIso) === 'passed-late' ? 'l' : 'c') : 'c' }));
      const prevCol = cols.length >= 2 ? cols[cols.length - 2] : null;
      const prevName = prevCol ? (txt(prevCol.name) || 'Untitled stage') : '';
      lanes.map((l) => l.id).concat(['']).forEach((lk) => {
        const finished = finByLane[lk];
        if (!finished || !finished.length) return;
        const grp = laneGroup(lk);
        const byRecent = finished.slice().sort((x, y) => (finDay(y) == null ? -Infinity : finDay(y)) - (finDay(x) == null ? -Infinity : finDay(x)));
        if (finished.length < GROUP_FINISHED_AT) {
          byRecent.forEach((t) => {
            const fd = finDay(t), late = lateOf(t, cols.length - 1);
            out.push(item({
              key: 'tile:' + t.id, id: t.id, type: 'tile', status: 'done', reason: lastName, day: fd, grp: grp,
              row: {
                k: 'review:' + t.id, name: txt(t.name) || '(tile)', sub: subOf(t), subGrp: subIn(t),
                pgStage: true, pips: allPips(t), stage: lastName,
                date: dayText(fd, td), dateSub: relCap(fd, td),
                note: late ? F.plural(late, 'stage') + ' cleared late.' : ''
              },
              go: go(t, 'done')
            }));
          });
          return;
        }
        /* many finished tiles: one row, the tiles under it; the time each spent in the last working stage */
        const lane = laneById[lk];
        const max = lane ? Number(lane.maxDaysPerCol) || 0 : 0;
        let over = 0, timed = 0;
        const kids = byRecent.map((t) => {
          const gp = t.gatePassed || {};
          const left = isoDay(gp[prevCol ? prevCol.id : ''] || t.enteredCol);
          const entered = cols.length >= 3 ? isoDay(gp[cols[cols.length - 3].id]) : isoDay(t.startDate);
          const spent = left != null && entered != null ? Math.max(0, left - entered) : null;
          if (spent != null && max) { timed++; if (spent > max) over++; }
          const fd = finDay(t);
          return kidRow({
            k: 'done:' + t.id, mkCheck: true, name: txt(t.name) || '(tile)', sub: subOf(t), subGrp: subIn(t),
            stDot: 'dot review-d-done', stWord: lastName,
            pgText: spent != null && !!prevName, pgTxt: spent != null && prevName ? F.plural(spent, 'day') + ' in ' + prevName : '', pgTxtCls: '',
            pgSub: spent != null && max ? (spent > max ? days(spent - max) + ' over the ' + max + '-day limit' : 'Within the ' + max + '-day limit') : '',
            pgSubCls: spent != null && max && spent > max ? 'sub tx-bad' : 'sub',
            date: dayText(fd, td), dateSub: relCap(fd, td)
          });
        });
        const gid = 'done:' + b.id + ':' + lk;
        out.push(item({
          key: gid, id: gid, type: 'tile', status: 'done', reason: lastName, day: finDay(byRecent[0]), grp: grp,
          units: finished.length, kids: kids, nounOne: 'tile', filterKids: true, groupName: (n, of) => n + ' of ' + of + ' tiles in ' + lastName,
          row: {
            k: 'review:' + gid, name: F.plural(finished.length, 'tile') + ' in ' + lastName,
            sub: (multi ? bName + ', ' : '') + (lane ? laneName(lane) : 'No swimlane'), subGrp: '',
            pgStage: true, pips: cols.map((c) => ({ k: c.id, cls: 'c' })), stage: lastName,
            date: dayText(finDay(byRecent[0]), td), dateSub: 'Most recent',
            note: prevName && timed ? (over === 0 ? 'None ran over the ' + prevName + ' limit.' : (over === timed ? (timed === 1 ? 'It' : 'All ' + timed) : over + ' of ' + timed) + ' ran over the ' + prevName + ' limit.') : ''
          },
          /* the board, with this swimlane's older finished tiles showing */
          go: { tab: 'kanban', patch: (S) => Object.assign({ kb_sel: b.id, kb_focus: '' }, lk ? { kb_older: Object.assign({}, S.kb_older, { [b.id + ':' + lk]: true }) } : {}), focusKey: 'kb_focus', focus: '' }
        }));
      });
    });
    return out;
  }
  /* the Kanban section's line: the board (its swimlanes head the rows, with their limits) */
  function boardSub(ctx) {
    const boards = boardsOf(ctx.doc, ctx.objId);
    if (!boards.length) return '';
    if (boards.length > 1) return F.plural(boards.length, 'board') + ': ' + F.list(boards.map((b) => txt(b.name) || 'Untitled board'));
    const b = boards[0], n = (b.swimlanes || []).length;
    return (txt(b.name) || 'Untitled board') + ' board' + (n ? ', ' + F.plural(n, 'swimlane') : '');
  }

  /* ---------------------------------------------------------------- risks */
  function riskItems(C, ctx) {
    const doc = ctx.doc, td = ctx.today;
    return RD.fmeaProblemsFor(doc, ctx.objId).map((p) => {
      const passed = gatePassed(doc, p.gateId, td);
      const u = RD.worstUnresolvedRpn(p, passed);
      const band = RD.rpnBand(u);
      const causes = [];
      (p.modes || []).forEach((m) => (m.effects || []).forEach((e) => (e.causes || []).forEach((c) => {
        causes.push({ c: c, effect: txt(e.effect), res: c.status === 'resolved' || e.status === 'resolved' || m.status === 'resolved', rpn: RD.calcRpn(c.severity, c.occurrence, c.detection) });
      })));
      causes.sort((a, b) => b.rpn - a.rpn);
      let status, reason;
      if (u > 0) { status = band === 'high' ? 'off' : band === 'med' ? 'risk' : 'ok'; reason = band === 'high' ? 'high risk open' : band === 'med' ? 'medium risk open' : 'low risk open'; }
      else { status = 'done'; reason = p.status === 'resolved' ? 'resolved' : passed ? 'its stage-gate passed' : 'nothing open'; }
      const g = p.gateId ? ((doc.stageGates || []).find((x) => x.id === p.gateId) || null) : null;
      const label = g ? gateLabel(doc, g.id) : '';
      const mit = causes.filter((x) => !x.res && x.c.status === 'mitigating').length;
      const open = causes.filter((x) => !x.res);
      const known = ((p.knowns || []).map((k) => txt(k && k.text)).filter(Boolean))[0] || '';
      let note = '';
      if (u > 0) note = known || (open[0] ? 'Worst open cause: ' + (txt(open[0].c.cause) || 'unnamed cause') + '.' : '');
      else if (passed && p.status !== 'resolved') note = 'Its stage-gate has passed, so it no longer counts as open.';
      const kids = causes.map((x, j) => {
        const c = x.c, b = RD.rpnBand(x.rpn);
        const word = x.res ? 'Resolved' : c.status === 'mitigating' ? 'Mitigating' : 'Open';
        return kidRow({
          k: 'cause:' + p.rid + ':' + (c.cid || j), name: txt(c.cause) || 'Unnamed cause', sub: x.effect ? 'Effect: ' + x.effect : '',
          stCls: x.res ? 'st' : 'st ' + F.tone(b === 'high' ? 'bad' : b === 'med' ? 'warn' : 'ok'), stDot: 'dot' + (x.res ? ' review-d-done' : ''), stWord: word,
          stSub: x.res ? '' : (b === 'high' ? 'High' : b === 'med' ? 'Medium' : 'Low'),
          pgRpn: true, rpnPre: (Number(c.severity) || 1) + ' × ' + (Number(c.occurrence) || 1) + ' × ' + (Number(c.detection) || 1) + ' =', rpnVal: String(x.rpn),
          note: txt(c.mitigation) ? 'Plan: ' + txt(c.mitigation) : (x.res ? '' : 'No mitigation yet.')
        });
      });
      const worst = u > 0 ? u : (causes[0] ? causes[0].rpn : 0);
      return item({
        key: 'risk:' + p.rid, id: p.rid, type: 'risk', status: status, reason: reason,
        day: g && g.actualDate == null ? g.plannedDate : null, kids: kids, nounOne: 'cause',
        row: {
          k: 'review:' + p.rid, name: txt(p.problem) || 'Unnamed problem',
          sub: (label ? 'On ' + label + ', ' : '') + F.plural(causes.length, 'cause'),
          pgRpn: true, rpnPre: u > 0 ? 'Worst open RPN' : 'Worst RPN', rpnVal: String(worst),
          pgSub: u > 0 ? mit + ' of ' + F.plural(causes.length, 'cause') + ' being mitigated' : causes.length ? '' : 'No causes yet',
          date: g ? dayText(g.actualDate != null ? g.actualDate : g.plannedDate, td) : '',
          dateSub: g ? (g.actualDate != null ? label + ' passed' : g.plannedDate != null ? label + ' is due' : 'No date') : 'No stage-gate',
          note: note
        },
        go: { tab: 'risks', patch: () => ({ fmea_focus: p.rid }), focusKey: 'fmea_focus', focus: p.rid }
      });
    });
  }

  /* ----------------------------------------------------------- all items */
  function items(C, ctx) {
    return C.memo('review.items:' + (ctx.docKey || '') + ':' + (ctx.objId || ''), () => {
      if (!ctx.obj) return [];
      const P = pool(C, ctx);
      return krItems(C, ctx, P).concat(gateItems(C, ctx, P), tileItems(C, ctx), riskItems(C, ctx));
    });
  }
  function footnote() {
    const kr = KR_RULE === 'pace'
      ? ['a key result more than 30 points behind an even pace', 'a key result 11 to 30 points behind an even pace']
      : ['a key result scoring under 65', 'a key result scoring 65 to 79'];
    return 'One status scale for every row. Off track: ' + kr[0] + ', an overdue or failed stage-gate, a kanban tile past its stage due date, over its stage limit or past its swimlane deadline, and a problem whose worst open cause has an RPN of 200 or more. ' +
      'At risk: ' + kr[1] + ', a stage-gate with a high risk open on it, a tile that has used 80% of its stage limit or whose stage is due today or swimlane within a week, and a problem whose worst open RPN is 100 to 199. ' +
      'Not started: a key result with no score yet, a stage-gate not yet in progress and a tile in the backlog. Done: passed stage-gates, tiles in the last stage and problems with nothing open. ' +
      'When more than one rule applies, the worst sets the status. Rows under an item (steps, KPIs, targets, causes, finished tiles) are not counted on their own.';
  }

  /* ---------------------------------------------------------- view model */
  function follow(C, it) {
    const g = it.go;
    if (!g) return;
    const S = C.state;
    /* a view page (?view=) has no tabs: the item opens on its own view (Risks: the app's tab) in a new
       browser tab, read-only when this page is (the shell's shellOpenTab) */
    if (C.ctx && C.ctx.view && typeof shellOpenTab === 'function') {
      shellOpenTab(C, { objective: C.ctx.objId, tab: g.tab, view: shellViewOk(g.tab) ? g.tab : '', item: g.focus || '', ro: !!S.ro, go: g });
      return;
    }
    const patch = Object.assign({ tab: g.tab, menu: '' }, g.patch(S));
    C.setState(patch);
    if (g.focusKey && g.focus) {
      const key = g.focusKey, id = g.focus;
      C.later(() => { if (C.state[key] === id) C.setState({ [key]: '' }); }, FOCUS_MS);
    }
  }
  function vm(C, ctx) {
    const S = C.state;
    const td = ctx.today;
    const objId = ctx.objId;
    if (!ctx.obj) return { has: false };
    const all = items(C, ctx);
    const sel = Array.isArray(S.review_sel) ? S.review_sel.filter((k) => STATUS[k]) : [];
    const gb = S.review_gb === 'status' || S.review_gb === 'due' ? S.review_gb : 'type';
    const q = String(S.review_q || '');
    const qq = q.trim().toLowerCase();
    const openMap = S.review_open || {};
    const gc = S.review_gc || {};
    const set = (p) => C.setState(p);
    const toggleSel = (k) => {
      const cur = Array.isArray(C.state.review_sel) ? C.state.review_sel : [];
      set({ review_sel: cur.indexOf(k) >= 0 ? cur.filter((x) => x !== k) : cur.concat([k]) });
    };
    const counts = {};
    ORDER.forEach((k) => { counts[k] = 0; });
    all.forEach((it) => { counts[it.status] += it.units; });
    const unitsOf = (list) => list.reduce((n, it) => n + it.units, 0);
    const total = unitsOf(all), need = counts.off + counts.risk;
    /* what a row shows under the filter text: a group of finished tiles narrows to the tiles that match */
    const viewOf = (it) => {
      if (qq && it.filterKids && it.ownText.indexOf(qq) < 0) {
        const ks = it.kids.filter((k, i) => it.kidTexts[i].indexOf(qq) >= 0);
        return { kids: ks, units: ks.length, name: it.groupName(ks.length, it.kids.length) };
      }
      return { kids: it.kids, units: it.units, name: null };
    };
    const viewUnits = (list) => list.reduce((n, it) => n + viewOf(it).units, 0);
    const matches = (it) => !qq || it.ownText.indexOf(qq) >= 0 || it.kidText.indexOf(qq) >= 0;
    const visible = all.filter((it) => (!sel.length || sel.indexOf(it.status) >= 0) && matches(it));
    const isOpen = (it) => {
      if (!it.kids.length) return false;
      if (qq && it.ownText.indexOf(qq) < 0 && it.kidText.indexOf(qq) >= 0) return true;
      return openMap[it.key] === undefined ? it.defaultOpen : !!openMap[it.key];
    };
    const barFor = (list) => {
      const c = {};
      ORDER.forEach((k) => { c[k] = 0; });
      list.forEach((it) => { c[it.status] += it.units; });
      return ORDER.filter((k) => c[k] > 0).map((k) => {
        const on = sel.indexOf(k) >= 0;
        return {
          k: k, cls: STATUS[k].bar + (sel.length && !on ? ' dim' : ''), style: 'flex-grow: ' + c[k], count: String(c[k]), pressed: on,
          title: STATUS[k].label + ': ' + c[k] + (on ? '. Select to stop filtering by it.' : '. Select to show only these.'),
          pick: () => toggleSel(k)
        };
      });
    };
    const barAria = (label, bar) => label + ' by status: ' + bar.map((b) => b.title.split('.')[0]).join(', ');

    let specs;
    if (gb === 'status') {
      specs = ORDER.map((k) => ({
        key: k, label: STATUS[k].label, dot: STATUS[k].chipDot, hasDot: true,
        items: visible.filter((it) => it.status === k).sort((a, b) => a.sortDay - b.sortDay || TYPE_RANK[a.type] - TYPE_RANK[b.type])
      }));
    } else if (gb === 'due') {
      specs = DUE.map((d) => ({
        key: d[0], label: d[1],
        items: visible.filter((it) => dueKey(it, td) === d[0]).sort((a, b) => a.sortDay - b.sortDay || a.rank - b.rank || TYPE_RANK[a.type] - TYPE_RANK[b.type])
      }));
    } else {
      const ro = C.isRo();
      specs = TYPES.map((t) => {
        const mine = all.filter((it) => it.type === t.key);
        const s = {
          key: t.key, label: t.label, bar: barFor(mine),
          items: visible.filter((it) => it.type === t.key).map((it, i) => ({ it: it, i: i })).sort((a, b) => a.it.rank - b.it.rank || a.it.sortDay - b.it.sortDay || a.i - b.i).map((x) => x.it)
        };
        const quiet = !sel.length && !qq;
        /* a view page has no tabs: the empty rows name the app's tab */
        const onTab = (w) => 'on the ' + w + ' tab' + (ctx.view ? ' of ' + (APP === 'sales' ? 'Sales' : 'Execution') : '');
        if (t.key === 'kr') {
          s.sub = mine.length ? (KR_RULE === 'pace' ? 'Status follows pace: within 10 points of an even pace on track, within 30 at risk' : 'Status follows the score: 80 and up on track, 65 to 79 at risk, under 65 off track') : '';
          if (!mine.length && quiet) {
            s.empty = 'No key results yet. Without one the objective has no score.';
            if (!ro && typeof KR !== 'undefined' && KR && typeof KR.openEditor === 'function') { s.actLabel = 'Add key result'; s.act = () => KR.openEditor(C, ctx, null); }
          }
        }
        if (t.key === 'gate') {
          const sets = setsOf(ctx.doc, objId);
          if (mine.length && sets.length) s.sub = F.plural(sets.length, 'workstream');
          const gh = RD.objectiveGateReadiness(objId, ctx.em, td);
          if (mine.length && gh != null) { s.extra = 'Gate health ' + Math.round(gh) + '%'; s.extraCls = 'st ' + F.tone(F.band(gh)) + ' review-health'; }
          if (!mine.length && quiet) s.empty = 'No stage-gates yet. Add the checkpoints this objective has to clear ' + onTab('Stage-gates') + '.';
        }
        if (t.key === 'tile') {
          s.sub = boardSub(ctx);
          if (!mine.length && quiet) s.empty = boardsOf(ctx.doc, objId).length ? 'The board has no tiles yet. Add them ' + onTab('Kanban') + '.' : 'No kanban board yet. Add one ' + onTab('Kanban') + ' to track work through stages.';
        }
        if (t.key === 'risk') {
          s.sub = mine.length ? 'RPN is severity × occurrence × detection: 200 and up is high, 100 to 199 medium' : '';
          if (!mine.length && quiet) s.empty = 'No FMEA problems yet. Add one ' + onTab('Risks') + ' and its worst open cause shows here.';
        }
        return s;
      });
    }

    /* a workstream or swimlane heading: its name, what describes it, its count and statuses; it folds */
    const subRow = (sg, sk, open) => {
      const c = {};
      ORDER.forEach((k) => { c[k] = 0; });
      sg.items.forEach((it) => { c[it.status] += viewOf(it).units; });
      const counts = ORDER.filter((k) => c[k] > 0).map((k) => ({ k: k, n: String(c[k]), cls: STATUS[k].st + ' review-sst', dot: STATUS[k].dot, title: STATUS[k].label + ': ' + c[k] }));
      const name = sg.s.label + (sg.s.name ? ': ' + sg.s.name : '');
      return Object.assign(row({}), {
        isRow: false, isSub: true, k: 'review-sub:' + sg.s.key,
        subLabel: sg.s.label, subName: sg.s.name || '', hasSubName: !!sg.s.name, subMeta: sg.s.meta || '', hasSubMeta: !!sg.s.meta,
        subCount: String(viewUnits(sg.items)), subOpen: open, subBtnCls: 'review-sbtn' + (open ? ' open' : ''),
        subToggleLabel: (open ? 'Collapse ' : 'Expand ') + name,
        subCounts: counts, subCountsAria: counts.map((x) => x.n + ' ' + STATUS[x.k].label.toLowerCase()).join(', '),
        subToggle: () => set({ review_gc: Object.assign({}, C.state.review_gc, { [sk]: open }) })
      });
    };
    const groups = specs.filter((g) => g.items.length || g.empty).map((g) => {
      const gk = objId + ':' + gb + ':' + g.key;
      const gOpen = !gc[gk];
      const rows = [];
      const addItem = (it, inSub) => {
        const o = isOpen(it), v = viewOf(it), tt = TYPES[TYPE_RANK[it.type]];
        const r = Object.assign({}, it.row);
        if (v.name) r.name = v.name;
        if (inSub) { r.cls += ' in-sub'; if (it.row.subGrp !== undefined) { r.sub = it.row.subGrp; r.hasSub = !!r.sub; } }
        r.tag = gb === 'type' ? '' : tt.tag; r.hasTag = !!r.tag;
        r.hasLink = !!it.go; r.noLink = !it.go;
        const tabWord = tt.key === 'tile' ? 'Kanban' : tt.label;
        r.linkTitle = !ctx.view ? 'Open on the ' + tabWord + ' tab'
          : it.go && shellViewOk(it.go.tab) ? 'Open the ' + tabWord + ' view in a new tab' : 'Open on the ' + tabWord + ' tab of ' + (APP === 'sales' ? 'Sales' : 'Execution') + ', in a new tab';
        r.go = () => follow(C, it);
        if (it.kids.length) {
          const n = v.kids.length;
          r.hasExp = true; r.noExp = false; r.expanded = o; r.expCls = 'review-exp' + (o ? ' open' : '');
          r.expLabel = (o ? 'Hide ' : 'Show ') + F.plural(n, it.nounOne || 'row') + ' under ' + (it.row.tid ? it.row.tid + ' ' : '') + it.row.name;
          r.toggle = () => set({ review_open: Object.assign({}, C.state.review_open, { [it.key]: !o }) });
        } else { r.hasExp = false; r.noExp = true; }
        rows.push(r);
        if (o) v.kids.forEach((k) => rows.push(!inSub ? k : Object.assign({}, k, { cls: k.cls + ' in-sub', drawerCls: k.drawerCls + ' in-sub' }, k.subGrp !== undefined ? { sub: k.subGrp, hasSub: !!k.subGrp } : {})));
      };
      if (gb === 'type' && SUBBED[g.key] && g.items.length) {
        /* the section's order inside each heading; headings in workstream / board and swimlane order */
        const subs = [], byKey = {};
        g.items.forEach((it) => {
          const sgr = it.grp || { key: '', order: 0, label: '', name: '', meta: '' };
          if (!byKey[sgr.key]) { byKey[sgr.key] = { s: sgr, items: [] }; subs.push(byKey[sgr.key]); }
          byKey[sgr.key].items.push(it);
        });
        subs.sort((a, b) => a.s.order - b.s.order);
        subs.forEach((sg) => {
          const sk = gk + ':' + sg.s.key;
          const sOpen = !gc[sk];
          rows.push(subRow(sg, sk, sOpen));
          if (sOpen) sg.items.forEach((it) => addItem(it, true));
        });
      } else g.items.forEach((it) => addItem(it, false));
      if (!g.items.length && g.empty) rows.push(emptyRow(g.empty, g.actLabel, g.act));
      const bar = g.bar || [];
      return {
        k: 'review-group:' + g.key, label: g.label, count: String(viewUnits(g.items)),
        sub: g.sub || '', hasSub: !!g.sub, extra: g.extra || '', hasExtra: !!g.extra, extraCls: g.extraCls || 'st',
        dot: g.dot || 'dot', hasDot: !!g.hasDot,
        open: gOpen, btnCls: 'review-gbtn' + (gOpen ? ' open' : ''), toggleLabel: (gOpen ? 'Collapse ' : 'Expand ') + g.label,
        cls: 'review-grp' + (bar.length ? '' : ' nobar'),
        rows: rows,
        hasBar: bar.length > 0, bar: bar, barAria: barAria(g.label, bar),
        toggle: () => set({ review_gc: Object.assign({}, C.state.review_gc, { [gk]: gOpen }) })
      };
    });

    const typeBars = TYPES.map((t) => {
      const mine = all.filter((it) => it.type === t.key), bar = barFor(mine);
      return { k: t.key, label: t.label, count: String(unitsOf(mine)), bar: bar, aria: barAria(t.label, bar) };
    }).filter((tb) => tb.bar.length > 0);

    const expandable = all.filter((it) => it.kids.length);
    const shownExpandable = visible.filter((it) => it.kids.length);
    const anyClosed = shownExpandable.some((it) => !isOpen(it));
    const filtered = sel.length > 0 || !!qq;
    const needOnly = sel.length === 2 && sel.indexOf('off') >= 0 && sel.indexOf('risk') >= 0;
    const nOf = (type) => unitsOf(all.filter((it) => it.type === type));
    const krN = nOf('kr'), gN = nOf('gate'), tN = nOf('tile'), rN = nOf('risk');
    const parts = [krN ? F.plural(krN, 'key result') : 'no key results', gN ? F.plural(gN, 'stage-gate') : 'no stage-gates',
      tN ? F.plural(tN, 'kanban tile') : 'no kanban tiles', rN ? F.plural(rN, 'risk') : 'no risks'];
    return {
      has: true,
      summary: F.plural(total, 'item') + ': ' + F.list(parts),
      chips: ORDER.filter((k) => ALWAYS[k] || counts[k] > 0).map((k) => {
        const on = sel.indexOf(k) >= 0;
        return {
          k: k, label: STATUS[k].label, count: String(counts[k]), dot: STATUS[k].chipDot, cls: 'chip review-chip' + (on ? ' on' : ''), pressed: on,
          title: on ? 'Stop filtering by ' + STATUS[k].label.toLowerCase() : 'Show ' + STATUS[k].label.toLowerCase() + (sel.length ? ' too' : ' only'),
          pick: () => toggleSel(k)
        };
      }),
      allLabel: 'All ' + total, needLabel: 'Needs attention ' + need,
      allPressed: sel.length === 0, needPressed: needOnly,
      showAll: () => set({ review_sel: [] }),
      showNeed: () => set({ review_sel: ['off', 'risk'] }),
      q: q,
      onQ: (e) => set({ review_q: e && e.target ? String(e.target.value) : '' }),
      onQKey: (e) => { if (e && e.key === 'Escape' && C.state.review_q) { if (e.preventDefault) e.preventDefault(); set({ review_q: '' }); } },
      filtered: filtered,
      showing: filtered ? 'Showing ' + viewUnits(visible) + ' of ' + total : '',
      clear: () => set({ review_sel: [], review_q: '' }),
      gbType: gb === 'type', gbStatus: gb === 'status', gbDue: gb === 'due',
      byType: () => set({ review_gb: 'type' }),
      byStatus: () => set({ review_gb: 'status' }),
      byDue: () => set({ review_gb: 'due' }),
      showTypeBars: gb !== 'type' && typeBars.length > 0, typeBars: typeBars,
      canToggleAll: expandable.length > 0,
      expandLabel: anyClosed || !shownExpandable.length ? 'Expand all' : 'Collapse all',
      toggleAll: () => {
        const m = Object.assign({}, C.state.review_open);
        expandable.forEach((it) => { m[it.key] = anyClosed; });
        set({ review_open: m });
      },
      groups: groups,
      noRows: groups.length === 0,
      footnote: footnote()
    };
  }

  return { items: items, vm: vm, KR_RULE: KR_RULE, STATUS: STATUS, ORDER: ORDER, dueKey: dueKey, FOCUS_MS: FOCUS_MS };
})();

MODS.review = {
  state: { review_sel: [], review_q: '', review_gb: 'type', review_open: {}, review_gc: {} },
  vm(C, ctx) { return REVIEW.vm(C, ctx); },
  api: REVIEW
};
