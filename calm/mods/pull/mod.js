/* ============================================================================
   Pulled KPIs (October 2026). A pulled KPI is a statistical KPI whose readings are pulled from other work
   instead of posted: each matching objective, key result, stage-gate, workstream, kanban tile, experiment or
   logic tree gives one reading (its score, its days behind schedule, its state, a dated happening), and the
   KPI's statistic runs over them: an average, a median, a count of the ones past a threshold. It sits on a
   key result or a stage-gate like any KPI, takes a target and feeds the score. The engine works the value out
   (RD.pulledResult, against every document the page has), so every app scores it the same way; this module
   draws it and lets leaders make and change it.

   Leaders: a division's lead (roster leadDivisions, leadUnits, or a legacy leadOf naming the division), the
   CTO and the CEO. They get "Readings: Posted here | Pulled from other work" at the top of a new KPI's or
   target's sheet, and Edit / Delete on a pulled row. Everyone sees the value and what it pulled.

   PUBLIC API (the KPI, key result and review modules call these when PULL is in the build)
   -----------------------------------------------------------------------------------------
   PULL.row(C, ctx, T, k, row, { name, edKey })  a pulled KPI's KPI-table row: the value as a dropdown button that
                                    shows what it pulled, a sentence, the readings drawer, Edit / Delete for leaders
   PULL.tgSeg(C, ctx, sheet)        the Readings choice for a new KPI or target ('kpi.target' sheet), or null
   PULL.openEdit(C, ctx, k)         Edit KPI on a pulled KPI: its sheet for a leader, a note for anyone else
   PULL.reviewNote(C, k)            the Overview's note ("Pulled: 1 of 5 objectives more than 10 days behind schedule.")
   PULL.isLeader(C, divId)          may this person make and change pulled KPIs in that division?
   PULL.isLeaderOfObj(C, objId)     the same, for the division an objective belongs to
   PULL.result(C, k)                RD.pulledResult(k) against this page's documents
   ========================================================================== */
const PULL = (function () {
  /* ------------------------------------------------------------------ words */
  const NOUN = {
    objective: ['objective', 'objectives'], keyResult: ['key result', 'key results'], gate: ['stage-gate', 'stage-gates'],
    workstream: ['workstream', 'workstreams'], tile: ['tile', 'tiles'], experiment: ['experiment', 'experiments'], tree: ['logic tree', 'logic trees']
  };
  const noun = (each, n) => { const w = NOUN[each] || ['item', 'items']; return n === 1 ? w[0] : w[1]; };
  const EACH = [['objective', 'Objective'], ['keyResult', 'Key result'], ['gate', 'Stage-gate'], ['workstream', 'Workstream'], ['tile', 'Kanban tile'], ['experiment', 'Experiment'], ['tree', 'Logic tree']];
  const BAND3 = [['on-track', 'on track'], ['at-risk', 'at risk'], ['off-track', 'off track']];
  /* what can be read from each item. kind: number | state | event (the engine's RD.PULL_MEASURES agrees);
     of: what a statistic is "of"; thr: the words for above / below a threshold ({t} is the threshold) */
  const MEASURES = {
    objective: [
      { id: 'score', kind: 'number', label: 'Score', desc: 'Each objective’s score, the mean of its key results.', unit: '%', of: 'objective scores', what: 'objective score', thr: ['scoring above {t}%', 'scoring below {t}%'], dir: 'up', stat: 'average', target: '80', threshold: '80' },
      { id: 'slip', kind: 'number', label: 'Days behind schedule', desc: 'How far its stage-gates and tasks forecast past their planned dates, as on the objective’s Schedule card. More than 10 trips its alarm.', unit: 'days', of: 'objective delays', what: 'days behind schedule', thr: ['more than {t} days behind schedule', 'less than {t} days behind schedule'], dir: 'down', stat: 'countAbove', target: '0', threshold: '10' },
      { id: 'health', kind: 'number', label: 'Gate health', desc: 'Share of gates passed in each objective’s weakest workstream.', unit: '%', of: 'objectives’ gate health', what: 'gate health', thr: ['with gate health above {t}%', 'with gate health below {t}%'], dir: 'up', stat: 'average', target: '80', threshold: '50' },
      { id: 'status', kind: 'state', label: 'Status', desc: 'On track (80 and up), at risk (65 to 79) or off track, by score.', base: ['objective', 'objectives'], states: BAND3, pick: ['on-track'], dir: 'up', stat: 'share', target: '80' }
    ],
    keyResult: [
      { id: 'krScore', kind: 'number', label: 'Score', desc: 'Each key result’s score.', unit: '%', of: 'key result scores', what: 'key result score', thr: ['scoring above {t}%', 'scoring below {t}%'], dir: 'up', stat: 'average', target: '80', threshold: '80' },
      { id: 'krPace', kind: 'state', label: 'Pace', desc: 'On track, at risk or off track against the time its objective has used.', base: ['key result', 'key results'], states: BAND3, pick: ['on-track'], dir: 'up', stat: 'share', target: '80' }
    ],
    gate: [
      { id: 'daysLate', kind: 'number', label: 'Days late', desc: 'Gates due so far: days past the committed date, 0 when passed on time. Gates not due yet wait.', unit: 'days', of: 'gate delays', what: 'days late', thr: ['more than {t} days late', 'less than {t} days late'], dir: 'down', stat: 'countAbove', target: '0', threshold: '5' },
      { id: 'onTime', kind: 'state', label: 'Passed on time', desc: 'Gates due so far: passed on time, passed late, or overdue.', base: ['stage-gate due so far', 'stage-gates due so far'], states: [['ontime', 'passed on time'], ['late', 'passed late'], ['overdue', 'overdue']], pick: ['ontime'], dir: 'up', stat: 'share', target: '90' },
      { id: 'gateScore', kind: 'number', label: 'Readiness', desc: 'Each gate’s score, the mean of its targets.', unit: '%', of: 'gate readiness scores', what: 'gate readiness', thr: ['more than {t}% ready', 'less than {t}% ready'], dir: 'up', stat: 'average', target: '80', threshold: '50' }
    ],
    workstream: [
      { id: 'wsShare', kind: 'number', label: 'Gates passed', desc: 'Each workstream’s share of its gates passed.', unit: '%', of: 'workstreams’ shares passed', what: 'share of gates passed', thr: ['with more than {t}% passed', 'with less than {t}% passed'], dir: 'up', stat: 'min', target: '50', threshold: '50' }
    ],
    tile: [
      { id: 'finished', kind: 'state', label: 'Finished', desc: 'Tiles that reached the board’s last stage. Parked tiles wait.', base: ['tile', 'tiles'], states: [['finished', 'finished'], ['open', 'not finished']], pick: ['finished'], dir: 'up', stat: 'share', target: '100' },
      { id: 'stageHealth', kind: 'state', label: 'Stage health', desc: 'Tiles in a stage: on track, at risk or breached against their swimlane’s limits.', base: ['tile in a stage', 'tiles in a stage'], states: [['on-track', 'on track'], ['at-risk', 'at risk'], ['breached', 'breached']], pick: ['on-track'], dir: 'up', stat: 'share', target: '80' },
      { id: 'daysInStage', kind: 'number', label: 'Days in stage', desc: 'Days each tile has spent in its current stage.', unit: 'days', of: 'tiles’ days in stage', what: 'days in stage', thr: ['more than {t} days in their stage', 'less than {t} days in their stage'], dir: 'down', stat: 'countAbove', target: '0', threshold: '14' },
      { id: 'finishedIn', kind: 'event', label: 'Finished in a window', desc: 'Tiles that reached the last stage within the window.', verb: 'finished', dir: 'up', stat: 'count', target: '' },
      { id: 'daysToFinish', kind: 'number', label: 'Days to finish', desc: 'Start to last stage, for tiles finished within the window.', unit: 'days', of: 'tiles’ days to finish', what: 'days to finish', thr: ['taking more than {t} days', 'taking less than {t} days'], dir: 'down', stat: 'median', target: '', threshold: '60', windowed: true, verb: 'finished' }
    ],
    experiment: [
      { id: 'concluded', kind: 'event', label: 'Concluded in a window', desc: 'Experiments completed within the window.', verb: 'concluded', dir: 'up', stat: 'count', target: '' },
      { id: 'hypothesis', kind: 'state', label: 'Hypothesis', desc: 'Concluded experiments: hypothesis confirmed, refuted or not called.', base: ['concluded experiment', 'concluded experiments'], states: [['confirmed', 'confirmed'], ['refuted', 'refuted'], ['none', 'not called']], pick: ['confirmed'], dir: 'up', stat: 'share', target: '50' },
      { id: 'expStatus', kind: 'state', label: 'Status', desc: 'Planned, in progress or complete.', base: ['experiment', 'experiments'], states: [['planned', 'planned'], ['in_progress', 'in progress'], ['complete', 'complete']], pick: ['in_progress'], dir: 'up', stat: 'count', target: '' },
      { id: 'daysRunning', kind: 'number', label: 'Days running', desc: 'Days since each in-progress experiment’s planned start.', unit: 'days', of: 'experiments’ days running', what: 'days running', thr: ['running more than {t} days', 'running less than {t} days'], dir: 'down', stat: 'countAbove', target: '0', threshold: '30' }
    ],
    tree: [
      { id: 'treeOutcome', kind: 'state', label: 'Outcome', desc: 'Where each logic tree ended: at its target, in an FMEA, halted, or still open.', base: ['logic tree', 'logic trees'], states: [['success', 'ended at the target'], ['pause', 'went to an FMEA'], ['stop', 'halted'], ['open', 'still open']], pick: ['success'], dir: 'up', stat: 'count', target: '' }
    ]
  };
  /* the statistics: today's statistical KPI list, plus total and the threshold counts */
  const STATS = {
    number: [['average', 'Average'], ['median', 'Median'], ['min', 'Min'], ['max', 'Max'], ['sum', 'Total'], ['stddev', 'Standard deviation'], ['cv', 'Coefficient of variation (CV)'], ['range', 'Range'],
      ['countAbove', 'Count above a threshold'], ['countBelow', 'Count below a threshold'], ['shareAbove', 'Share above a threshold'], ['shareBelow', 'Share below a threshold']],
    state: [['share', 'Share in the picked states'], ['count', 'Count in the picked states']],
    event: [['count', 'Count in the window'], ['perWeek', 'Per week in the window']]
  };
  const STAT_WORD = { average: 'Average', median: 'Median', min: 'Min', max: 'Max', sum: 'Total', stddev: 'Standard deviation', cv: 'CV', range: 'Range', share: 'Share', count: 'Count', perWeek: 'Per week' };
  const CHIP = { stddev: 'Std deviation', cv: 'CV', countAbove: 'Count above', countBelow: 'Count below', shareAbove: 'Share above', shareBelow: 'Share below', share: 'Share', count: 'Count', perWeek: 'Per week' };
  const CHIP_GAP = ['stddev', 'countAbove'];
  const WINDOWS = [['d7', 'Last 7 days'], ['d30', 'Last 30 days'], ['d90', 'Last 90 days'], ['quarter', 'This quarter so far']];
  const NARROW = { gate: ['Workstream', 'Every workstream'], workstream: ['Workstream', 'Every workstream'], tile: ['Board', 'Every board'], experiment: ['Logic tree', 'Every logic tree'], tree: ['Logic tree', 'Every logic tree'] };
  const LEAD_W = { objective: 'Objectives', keyResult: 'Key results', gate: 'Stage-gates', workstream: 'Workstreams', tile: 'Tiles', experiment: 'Experiments', tree: 'Logic trees' };
  const STAT_PRE = { average: 'Average', median: 'Median', min: 'Lowest', max: 'Highest', sum: 'Total' };
  const STAT_POST = { stddev: 'standard deviation', cv: 'coefficient of variation', range: 'range' };
  const SPREAD = ['stddev', 'cv', 'range'];
  /* what each item gives, in words ("Pulls each objective’s days behind schedule: …") */
  const READS = {
    score: 'each objective’s score', slip: 'each objective’s days behind schedule', health: 'each objective’s gate health', status: 'each objective’s status',
    krScore: 'each key result’s score', krPace: 'each key result’s pace', daysLate: 'how late each stage-gate is', onTime: 'whether each stage-gate passed on time',
    gateScore: 'each stage-gate’s readiness', wsShare: 'each workstream’s share of gates passed', finished: 'whether each tile is finished', stageHealth: 'each tile’s stage health',
    daysInStage: 'each tile’s days in its stage', finishedIn: 'when each tile finished', daysToFinish: 'each finished tile’s days to finish', concluded: 'when each experiment concluded',
    hypothesis: 'each concluded experiment’s hypothesis', expStatus: 'each experiment’s status', daysRunning: 'how long each experiment has run', treeOutcome: 'where each logic tree ended'
  };
  const isThr = (s) => /^(count|share)(Above|Below)$/.test(s || '');
  const isAbove = (s) => /Above$/.test(s || '');
  const measureOf = (each, id) => (MEASURES[each] || []).find((m) => m.id === id) || null;
  const noop = () => {};
  /* a list field that older records may hold as one value (an owner as a string, a lead's leadOf as a name) */
  const arr = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]);

  /* -------------------------------------------------------------- formatting */
  function fmt1(x) { const r = Math.round(Number(x) * 10) / 10; return String(r).replace(/\.0$/, ''); }
  function orList(a) { if (a.length < 2) return a.join(''); return a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1]; }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function cap(s) { s = String(s || ''); return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function stateWords(m, picks) { return orList((m.states || []).filter((s) => picks.indexOf(s[0]) >= 0).map((s) => s[1])); }
  function stateWord(m, st) { const x = (m.states || []).find((s) => s[0] === st); return cap(x ? x[1] : st); }
  function baseWord(m, n) { return n === 1 ? m.base[0] : m.base[1]; }
  function withU(v, unit) {
    if (unit === '%') return v + '%';
    if (!unit) return String(v);
    const u = (v === '1' && /s$/.test(unit) && unit !== 'a week') ? unit.slice(0, -1) : unit;
    return v + ' ' + u;
  }
  /* the unit a statistic's value is in */
  function unitFor(m, stat, each) {
    if (m.kind === 'state') return stat === 'count' ? noun(each, 2) : '%';
    if (m.kind === 'event') return stat === 'perWeek' ? 'a week' : noun(each, 2);
    if (/^count/.test(stat)) return noun(each, 2);
    if (/^share/.test(stat) || stat === 'cv') return '%';
    return m.unit;
  }
  function valText(kpi, v) {
    if (v == null) return '—';
    const unit = kpi.unit != null && kpi.unit !== '' ? kpi.unit : '';
    return unit === '%' ? fmt1(v) + '%' : withU(fmt1(v), unit);
  }
  function itemVal(m, x) { return x == null ? '—' : m.unit === 'days' ? F.plural(Math.round(x * 10) / 10, 'day') : withU(fmt1(x), m.unit); }
  function targetText(kpi) {
    const t = kpi.target, unit = kpi.unit || '';
    if (t == null || t === '') return 'No target yet';
    if (typeof t === 'object') return fmt1(t.lo) + ' to ' + withU(fmt1(t.hi), unit);
    return (kpi.direction === 'down' ? '≤ ' : '≥ ') + withU(fmt1(Number(t)), unit);
  }
  function thrOf(kpi) { const n = Number(kpi.threshold); return kpi.threshold != null && kpi.threshold !== '' && isFinite(n) ? n : 0; }
  function thrWords(m, stat, t) { return (m.thr ? m.thr[isAbove(stat) ? 0 : 1] : (isAbove(stat) ? 'above {t}' : 'below {t}')).replace('{t}', fmt1(Number(t))); }
  function statLabel(kpi, m) {
    const s = kpi.statistic;
    if (m.kind === 'number' && isThr(s)) return (/^count/.test(s) ? 'Count' : 'Share') + ' ' + (isAbove(s) ? 'above ' : 'below ') + withU(fmt1(thrOf(kpi)), m.unit === '%' ? '%' : m.unit);
    if (m.kind === 'state') return (s === 'count' ? 'Count ' : 'Share ') + stateWords(m, (kpi.pull && kpi.pull.states && kpi.pull.states.length) ? kpi.pull.states : m.pick);
    return STAT_WORD[s] || s || 'Average';
  }
  function winWords(win) { return win && win.key === 'quarter' ? 'this quarter so far' : 'in the last ' + (win ? win.days : 30) + ' days'; }

  /* ------------------------------------------------------------ the engine */
  function src(C) { return typeof C.pullSource === 'function' ? C.pullSource() : null; }
  function result(C, k, fresh) {
    try { return RD.pulledResult(k, src(C), fresh ? { fresh: true } : null); } catch (e) { return null; }
  }
  function measureFor(k) { const p = (k && k.pull) || {}; return measureOf(p.each, p.measure); }

  /* --------------------------------------------------------- divisions and people */
  function divRec(D, id) { return ((D.portfolio && D.portfolio.divisions) || []).find((d) => d.id === id) || null; }
  function divName(D, id) { const d = divRec(D, id); return d ? d.name : id; }
  function unitName(D, id) { const u = ((D.portfolio && D.portfolio.units) || []).find((x) => x.id === id); return u ? u.name || id : id; }
  function docKeyOf(D, divId) { if ((D.docs || {})['EXEC-' + divId]) return 'EXEC-' + divId; if ((D.docs || {})['BIZ-' + divId]) return 'BIZ-' + divId; return ''; }
  /* every division whose document the page has (Execution and Sales load every division's, R&D and business,
     and edit only their own kind), in unit order, then division order, as the apps list them */
  function loadedDivs(D) {
    const uo = {};
    ((D.portfolio && D.portfolio.units) || []).forEach((u, i) => { uo[u.id] = u.order == null ? i : u.order; });
    const ur = (d) => (d.unitId && uo[d.unitId] != null ? uo[d.unitId] : 1e6);
    return ((D.portfolio && D.portfolio.divisions) || []).filter((d) => docKeyOf(D, d.id)).slice().sort((a, b) => (ur(a) - ur(b)) || K.byOrder(a, b));
  }
  /* "Division": every division, every R&D or business division; then Units (every division in one) and Divisions
     (one by one, in unit order). Short labels: the closed select shows only the choice, beside Quarter. */
  function divChoice(D, cur) {
    const divs = loadedDivs(D);
    const top = [{ v: 'all', label: 'Every division' }];
    if (divs.some((x) => RD.divisionKind(x) === 'rd')) top.push({ v: 'rd', label: 'Every R&D division' });
    if (divs.some((x) => RD.divisionKind(x) === 'biz')) top.push({ v: 'biz', label: 'Every business division' });
    const units = (D.portfolio && D.portfolio.units) || [], uids = [];
    divs.forEach((x) => { if (x.unitId && uids.indexOf(x.unitId) < 0 && units.some((u) => u.id === x.unitId)) uids.push(x.unitId); });   // unit order (a unit that's gone: none)
    const groups = [];
    if (uids.length) groups.push({ k: 'units', label: 'Units', opts: uids.map((id) => ({ v: 'unit:' + id, label: unitName(D, id) + ' unit' })) });
    if (divs.length) groups.push({ k: 'divs', label: 'Divisions', opts: divs.map((x) => ({ v: x.id, label: x.name || x.id })) });
    if (cur && !top.concat(...groups.map((g) => g.opts)).some((o) => o.v === cur)) top.push({ v: cur, label: scopeWords(D, cur) });   // a scope no longer listed (a division without a document here)
    return { top: top, groups: groups };
  }
  function scopeWords(D, dv) {
    dv = String(dv || 'all');
    if (dv === 'all') return 'every division';
    if (dv === 'rd') return 'every R&D division';
    if (dv === 'biz') return 'every business division';
    if (dv.indexOf('unit:') === 0) return 'every division in the ' + unitName(D, dv.slice(5)) + ' unit';
    return divName(D, dv);
  }
  function slug(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  /* the CTO and the CEO anywhere; a lead in the divisions they lead (by division, by unit, or a legacy leadOf name) */
  function isLeader(C, divId) {
    const v = C.viewer ? C.viewer() : null;
    if (!v) return false;
    if (v.orgRole === 'cto' || v.orgRole === 'ceo') return true;
    if (v.orgRole !== 'lead' || !divId) return false;
    const u = F.person(v.email) || {};
    if (arr(u.leadDivisions).indexOf(divId) >= 0) return true;
    const d = divRec(C.D, divId);
    if (d && d.unitId && arr(u.leadUnits).indexOf(d.unitId) >= 0) return true;
    return !!(d && arr(u.leadOf).some((x) => x === divId || slug(x) === slug(d.name)));
  }
  function keepers(C, divId) {
    const us = ((C.D.roster && C.D.roster.users) || []).filter((u) => !u.disabled);
    const d = divRec(C.D, divId);
    const leads = divId ? us.filter((u) => String(u.orgRole || '').toLowerCase() === 'lead' &&
      (arr(u.leadDivisions).indexOf(divId) >= 0 || (d && d.unitId && arr(u.leadUnits).indexOf(d.unitId) >= 0) || (d && arr(u.leadOf).some((x) => x === divId || slug(x) === slug(d.name)))))
      .map((u) => (u.name || F.name(u.email)) + ' (lead)') : [];
    const top = us.filter((u) => ['cto', 'ceo'].indexOf(String(u.orgRole || '').toLowerCase()) >= 0).map((u) => (u.name || F.name(u.email)) + ' (' + F.roleLabel(u.orgRole) + ')');
    return F.list(leads.concat(top)) || 'Leads, the CTO and the CEO';
  }
  function divOfKpi(C, k) {
    const o = ((C.D.portfolio && C.D.portfolio.objectives) || []).find((x) => x.id === k.objectiveId);
    return o ? o.divisionId : '';
  }

  /* ------------------------------------------------------------- what it pulled, in words */
  function scopeText(D, p) {
    const sc = p.scope || {}, today = D.today;
    const parts = [scopeWords(D, sc.div)];
    const q = qOf(today);
    parts.push(sc.quarter === 'current' ? 'the current quarter (' + F.q(q) + ')' : sc.quarter === 'next' ? 'next quarter (' + F.q(qNext(q)) + ')' : sc.quarter ? F.q(sc.quarter) : 'all quarters');
    if (sc.proj) { const i = ((D.portfolio && D.portfolio.initiatives) || []).find((x) => x.id === sc.proj); parts.push(i ? i.name : sc.proj); }
    if (sc.owner) parts.push(F.name(sc.owner) + '’s objectives');
    if (sc.narrow) parts.push(narrowName(D, p.each, sc.narrow));
    return parts.join(', ');
  }
  function narrowName(D, each, v) {
    for (const key of Object.keys(D.docs || {})) {
      const doc = D.docs[key] || {};
      if (each === 'gate' || each === 'workstream') { const s = (doc.stageGateSets || []).find((x) => x.id === v); if (s) return s.name || v; }
      if (each === 'tile') { const b = (doc.boards || []).find((x) => x.id === v); if (b) return b.name || v; }
      if (each === 'experiment' || each === 'tree') {
        const i = v.indexOf(':'), oid = v.slice(0, i), tid = v.slice(i + 1), bag = (doc.etbTrees || {})[oid];
        if (bag) { const t = RD.etbTreeById(bag, tid); if (t) return t.name || t.title || 'Logic tree'; }
      }
    }
    return v;
  }
  function pullText(D, kpi, m) {
    const p = kpi.pull || {};
    const head = 'Pulls ' + (READS[p.measure] || 'each ' + noun(p.each, 1)) + ': ' + scopeText(D, p) + '.';
    if (p.follow === false) return head + ' Only the ' + noun(p.each, 2) + ' picked when it was saved.';
    return head + ' New matches join on their own.';
  }
  function sentence(res, m, each) {
    if (!res || !m) return '';
    const stat = res.stat;
    if (m.kind === 'state') {
      if (!res.n) return 'No ' + m.base[1] + ' yet';
      const words = stateWords(m, res.states);
      if (stat === 'count') return res.k + ' ' + baseWord(m, res.k) + ' ' + words;
      return res.k + ' of ' + res.n + ' ' + baseWord(m, res.n) + ' ' + words;
    }
    if (m.kind === 'event') {
      const nn = noun(each, res.k);
      if (stat === 'perWeek') return res.k + ' ' + nn + ' ' + m.verb + ' in ' + fmt1(res.win.weeks) + ' weeks';
      return res.k + ' ' + nn + ' ' + m.verb + ' ' + winWords(res.win);
    }
    if (!res.n) return 'Nothing to pull yet';
    if (isThr(stat)) return res.k + ' of ' + res.n + ' ' + noun(each, res.n) + ' ' + thrWords(m, stat, res.thr);
    const tail = m.windowed ? ', ' + m.verb + ' ' + winWords(res.win) : '';
    return (STAT_WORD[stat] || stat) + ' of ' + res.n + ' ' + m.of + tail;
  }
  /* one item's reading, and what it means */
  function readingText(m, it) {
    const d = it.det || {};
    if (!it.counts) return '—';
    if (m.kind === 'number') return itemVal(m, it.num);
    if (m.kind === 'event') return m.id === 'finishedIn' ? F.day(d.finDay) : F.day(d.completedDay);
    switch (m.id) {
      case 'onTime': return d.cls === 'passed' ? 'On time' : d.cls === 'passed-late' ? F.plural(d.late, 'day') + ' late' : 'Overdue ' + F.plural(d.late, 'day');
      case 'finished': return d.fin ? 'Finished' : 'Not finished';
      case 'treeOutcome': return d.end ? d.end.label : 'Still open';
      default: return stateWord(m, it.state);
    }
  }
  function meaningText(m, it) {
    const d = it.det || {};
    switch (m.id) {
      case 'score': case 'krScore': return F.bandWord(F.band(d.score));
      case 'status': case 'krPace': return d.score == null ? '' : 'Score ' + F.score(d.score);
      case 'slip': return d.slip ? 'Behind schedule' : 'On schedule';
      case 'health': return 'Weakest workstream';
      case 'gateScore': return d.score >= 100 ? 'At target' : 'Below target';
      case 'wsShare': return 'Of its gates passed';
      case 'daysLate': case 'onTime': return d.cls === 'passed' ? 'Passed on time, ' + F.day(d.actual) : d.cls === 'passed-late' ? 'Passed late, ' + F.day(d.actual) : 'Overdue, due ' + F.day(d.planned);
      case 'finished': return d.fin ? 'Finished ' + F.day(d.finDay) : 'In ' + (d.col || 'a stage');
      case 'stageHealth': return F.plural(d.daysInCol || 0, 'day') + ' in ' + (d.col || 'a stage');
      case 'daysInStage': return 'In ' + (d.col || 'a stage');
      case 'finishedIn': return 'Finished';
      case 'daysToFinish': return F.day(d.startDay) + ' to ' + F.day(d.finDay);
      case 'expStatus': return d.status === 'complete' ? (d.completedDay != null ? 'Concluded ' + F.day(d.completedDay) : '') : d.plannedDay != null ? (d.status === 'in_progress' ? 'Since ' : 'Starts ') + F.day(d.plannedDay) : '';
      case 'concluded': return 'Concluded';
      case 'hypothesis': return d.inconclusive ? 'Inconclusive' : '';
      case 'daysRunning': return 'Since ' + F.day(d.plannedDay);
      case 'treeOutcome': return d.end ? 'At ' + d.end.at : '';
    }
    return '';
  }
  function whyText(it) {
    const d = it.det || {};
    switch (it.why) {
      case 'host': return 'Holds this KPI, so it isn’t pulled';
      case 'hand': return 'Left out by hand';
      case 'notPicked': return 'Not in the picked list';
      case 'noScore': return 'No score yet';
      case 'ended': return 'Ended, schedule frozen';
      case 'noDates': return 'No planned dates';
      case 'noWorkstreams': return 'No workstreams';
      case 'notDue': return 'Not due yet, ' + F.day(d.planned);
      case 'noDate': return 'No planned date';
      case 'noTargets': return 'No targets read yet';
      case 'noGates': return 'No gates';
      case 'parked': return 'Parked, no stage clock';
      case 'finished': return 'Finished';
      case 'notFinished': return 'Not finished, in ' + (d.col || 'a stage');
      case 'beforeWindow': return d.finDay != null ? 'Finished ' + F.day(d.finDay) + ', before the window' : 'Concluded ' + F.day(d.completedDay) + ', before the window';
      case 'noStart': return 'No start date';
      case 'notConcluded': case 'notRunning': return d.status === 'in_progress' ? 'In progress' : d.status === 'complete' ? 'Complete' : 'Planned';
      case 'noCompletion': return 'No completion date';
      case 'noPlannedStart': return 'No planned start';
      case 'notStarted': return 'Planned to start ' + F.day(d.plannedDay);
      case 'noFinishDate': return 'Finished, date not recorded';
      case 'missing': return 'Not found';
    }
    return '';
  }

  /* ---------------------------------------------------------------- quarters */
  function qOf(day) { const s = F.iso(day); const y = +s.slice(0, 4), m = +s.slice(5, 7); return y + 'Q' + (Math.floor((m - 1) / 3) + 1); }
  function qNext(q) { const y = +q.slice(0, 4), n = +q.slice(5); return n === 4 ? (y + 1) + 'Q1' : y + 'Q' + (n + 1); }

  /* ---------------------------------------------- the KPI table row and its drawer */
  function toggleDrawer(C, edKey, kpiId, open) {
    C.setState({ kpi_rd: open ? { k: edKey, id: kpiId } : null, kpi_rdv: '', kpi_rdArm: '', kpi_rdBatch: '', kpi_rdErr: '', kpi_rdFor: open ? edKey : '', kpi_ed: null, menu: '' });
  }
  /* the KPI module's readings drawer, filled with what was pulled: one line per item (its reading, its name,
     where it sits, what it means), counted items first, largest first, so a median or a threshold reads off the list */
  function drawerVM(C, ctx, k, res, m, edKey, lead) {
    const stat = res.stat;
    const counted = res.items.filter((x) => x.counts), waiting = res.items.filter((x) => !x.counts);
    const nOut = waiting.filter((x) => !x.host).length;
    if (m.kind === 'number') counted.sort((a, b) => b.num - a.num);
    else if (m.kind === 'state') counted.sort((a, b) => (b.hit ? 1 : 0) - (a.hit ? 1 : 0));
    const mark = {};
    if (m.kind === 'number' && counted.length) {
      const n = counted.length;
      if (stat === 'median') (n % 2 ? [(n - 1) / 2] : [n / 2 - 1, n / 2]).forEach((i) => { mark[counted[i].id] = n % 2 ? 'the middle value' : 'one of the middle two'; });
      if (stat === 'max') mark[counted[0].id] = 'the highest';
      if (stat === 'min') mark[counted[n - 1].id] = 'the lowest';
    }
    const many = res.items.some((x) => x.divId !== (res.items[0] || {}).divId);
    const manyObj = res.items.some((x) => x.objId !== (res.items[0] || {}).objId);
    const against = k.direction === 'down';
    const rowOf = (it) => {
      const where = it.kind === 'objective' ? (many ? divName(C.D, it.divId) : '') : (manyObj ? clip(it.objName, 34) : '');
      let note = whyText(it);
      if (it.counts) {
        const hitWord = !it.hit ? '' : isThr(stat) && m.kind === 'number' ? (isAbove(stat) ? 'over ' : 'under ') + itemVal(m, res.thr) + ', counted' : m.kind === 'state' ? 'counted' : '';
        note = cap([meaningText(m, it), hitWord, mark[it.id] || ''].filter(Boolean).join(', '));
      }
      return {
        v: readingText(m, it), when: it.name, by: where, hasBy: true, note: note, hasNote: true,
        stale: false, cls: 'kpi-ditem pull-di' + (it.counts ? '' : ' out') + (it.hit ? (against ? ' pull-hit bad' : ' pull-hit good') : '') + (mark[it.id] ? ' pull-mark' : ''),
        imported: false, canRm: false, rmLabel: '', rmCls: 'btn xs q', rmAria: '', rm: noop
      };
    };
    const word = k.hostType === 'stageGate' ? 'Edit target' : 'Edit KPI';
    return {
      title: 'Readings for ' + (k.name || 'this KPI'), close: () => toggleDrawer(C, edKey, k.id, false),
      statLine: statLabel(k, m) + ' = ' + valText(k, res.value),
      cnt: F.plural(res.n, noun(k.pull.each, 1), noun(k.pull.each, 2)) + ' pulled' + (nOut ? ', ' + nOut + ' waiting or left out' : ''), cntCls: 'st t-none',
      tgt: 'Target ' + targetText(k),
      borrowed: true, borrowText: pullText(C.D, k, m),
      partial: false, pt: null,
      rows: counted.map(rowOf).concat(waiting.map(rowOf)),
      none: res.items.length === 0, noneText: 'Nothing matches what this KPI pulls yet.',
      canEdit: false, hasRoNote: true,
      roNote: lead ? 'Nobody posts readings here. To change what it pulls, use ' + word + ' in the row’s menu.' : 'Nobody posts readings here. ' + keepers(C, divOfKpi(C, k) || ctx.divId) + ' set what it pulls.',
      v: '', vAria: '', onV: noop, onKey: noop, add: noop, newBatch: noop, err: '', hasErr: false, pending: false,
      hint: 'Pulled again whenever the work changes.'
    };
  }
  /* a pulled KPI's row in any KPI table (and the Overview's review rows, which reuse it): its value is a dropdown
     button that shows or hides what it pulled (it takes no reading); leaders edit or delete it from the row's menu,
     and with nothing else to do there, everyone else gets no menu */
  function row(C, ctx, T, k, r, x) {
    if (!k || !k.pull) return;
    const m = measureFor(k);
    const res = result(C, k);
    const name = x.name, edKey = x.edKey;
    const lead = isLeader(C, divOfKpi(C, k) || ctx.divId) && !C.isRo() && !T.readOnly;
    const open = !!(C.state.kpi_rd && C.state.kpi_rd.k === edKey);
    r.badges = r.badges.filter((b) => b.label !== 'Local').concat([{ label: 'Pulled', title: m ? pullText(C.D, k, m) : 'Pulled from other work' }]);
    r.hasBadges = true;
    r.crit = targetText(k); r.critTag = ''; r.hasCritTag = false;
    const v = res ? res.value : null;
    r.cur = valText(k, v); r.curTitle = m ? pullText(C.D, k, m) : ''; r.noRead = v == null;
    r.sub = m && res ? sentence(res, m, k.pull.each) : 'This app can’t read what it pulls.'; r.hasSub = !!r.sub; r.subCls = 'kpi-sub';
    r.canPost = false; r.showStatic = false; r.valBtn = true; r.editing = false; r.ed = null;
    r.curCls = r.curCls + ' pull-dd' + (open ? ' open' : '');
    r.valClick = () => toggleDrawer(C, edKey, k.id, !open);
    r.valAria = 'Readings for ' + name; r.valTitle = open ? 'Hide readings' : 'Show readings'; r.valExpanded = open ? 'true' : 'false'; r.valText = r.cur;
    r.chip = false; r.partial = false; r.math = ''; r.mathTitle = ''; r.hasHatch = false;
    r.nameBtn = lead; r.open = lead ? () => openEdit(C, ctx, k) : noop; r.openTitle = (T.isGate ? 'Edit target ' : 'Edit KPI ') + name;
    const items = !lead ? [] : [
      { label: T.isGate ? 'Edit target' : 'Edit KPI', cls: 'mi', fn: () => openEdit(C, ctx, k) },
      { label: T.isGate ? 'Delete target' : 'Delete KPI', cls: 'mi bad', fn: () => { C.closeMenus(); KPI.del(C, ctx, k.id); } }
    ];
    r.menu = items; r.hasMenu = items.length > 0;
    r.drawer = open && m && res ? drawerVM(C, ctx, k, res, m, edKey, lead) : null;
    r.rowCls = r.rowCls.replace(' open', '') + (open ? ' open' : '');
  }
  /* the Overview's review rows: what a pulled KPI's note says */
  function reviewNote(C, k) {
    const m = measureFor(k), res = m ? result(C, k) : null;
    const t = res ? sentence(res, m, k.pull.each) : '';
    return t ? 'Pulled: ' + t.charAt(0).toLowerCase() + t.slice(1) + '.' : 'Pulled from other work.';
  }

  /* ---------------------------------------------------------------- the sheet */
  /* One sheet adds a pulled KPI, or edits one: what to pull, the statistics, which work, a target per statistic.
     Adding, each statistic picked becomes its own KPI (an average and a median at once); editing, there is one. */
  /* a new statistic's direction and target: a count of items on the wrong side of a threshold aims at 0 */
  function statDefaults(m, stat) {
    if (m.kind === 'number') {
      if (isThr(stat)) { const bad = (m.dir === 'down') === isAbove(stat); return { dir: bad ? 'down' : 'up', target: bad && /^count/.test(stat) ? '0' : '' }; }
      if (SPREAD.indexOf(stat) >= 0) return { dir: 'down', target: '' };
      return { dir: m.dir, target: m.target || '' };
    }
    if (m.kind === 'state' && stat === 'share') return { dir: m.dir, target: m.target || '' };
    return { dir: 'up', target: '' };
  }
  /* a statistic's target row; its name follows the settings (auto) until someone types one */
  function tgRow(m, stat, over) { return Object.assign({ name: '', auto: true, unit: null }, statDefaults(m, stat), over || {}); }
  function applyMeasure(d, m) {
    const tg = {}; tg[m.stat] = tgRow(m, m.stat);
    return Object.assign(d, { measure: m.id, stats: [m.stat], tg: tg, threshold: m.threshold || '', states: (m.pick || []).slice(), exclude: [], items: null,
      quarter: (m.kind === 'event' || m.windowed) ? '' : (d.quarter === '' || d.quarter == null ? 'current' : d.quarter) });
  }
  function newDraft(C, divId, seed) {
    seed = seed || {};
    const each = MEASURES[seed.each] ? seed.each : 'objective';
    const m = measureOf(each, seed.measure) || MEASURES[each][0];
    const v = C.viewer ? C.viewer() : null;
    const ownDiv = v && v.orgRole === 'lead' && divId ? divId : 'all';   // a lead starts on their own division, the CTO and the CEO on every division
    const d = applyMeasure({ each: each, window: 'd30', div: ownDiv, quarter: 'current', proj: '', owner: '', narrow: '', follow: true }, m);
    const over = seed.tg || {};
    Object.assign(d, seed);
    d.tg = {};
    (d.stats || []).forEach((s) => { d.tg[s] = tgRow(m, s, over[s]); });
    return d;
  }
  function draftFromKpi(k) {
    const p = k.pull || {}, sc = p.scope || {};
    const tg = {};
    tg[k.statistic] = { name: k.name || '', auto: false, dir: k.direction === 'down' ? 'down' : 'up', target: k.target == null || typeof k.target === 'object' ? '' : String(k.target), unit: k.unit == null ? null : k.unit };
    return {
      each: p.each, measure: p.measure, stats: [k.statistic], tg: tg, threshold: k.threshold == null ? '' : String(k.threshold), states: (p.states || []).slice(), window: p.window || 'd30',
      div: sc.div || 'all', quarter: sc.quarter == null ? 'current' : sc.quarter, proj: sc.proj || '', owner: sc.owner || '', narrow: sc.narrow || '',
      follow: p.follow !== false, exclude: (p.exclude || []).slice(), items: p.follow === false && Array.isArray(p.items) ? p.items.slice() : null
    };
  }
  function pullOf(d, prev) {
    const p = { v: 1, each: d.each, measure: d.measure, states: (d.states || []).slice(), window: d.window,
      scope: { div: d.div, quarter: d.quarter, proj: d.proj, owner: d.owner, narrow: d.narrow }, follow: d.follow !== false,
      exclude: d.follow !== false ? (d.exclude || []).slice() : [],
      by: prev && prev.by ? prev.by : '', at: prev && prev.at ? prev.at : 0 };
    if (d.follow === false) p.items = (d.items || []).slice();
    return p;
  }
  function targetOf(r) { const t = K.num(r.target); return t == null ? null : t; }
  function suggestName(m, d, stat, res) {
    const lead = LEAD_W[d.each] || 'Items';
    if (m.kind === 'state') return (stat === 'count' ? lead : 'Share of ' + lead.toLowerCase()) + ' ' + stateWords(m, d.states || []);
    if (m.kind === 'event') return lead + ' ' + m.verb + (stat === 'perWeek' ? ' per week' : ' ' + winWords(res ? res.win : null));
    if (isThr(stat)) return (/^share/.test(stat) ? 'Share of ' + lead.toLowerCase() : lead) + ' ' + thrWords(m, stat, K.num(d.threshold) == null ? 0 : K.num(d.threshold));
    const what = m.what || m.label.toLowerCase();
    return STAT_PRE[stat] ? STAT_PRE[stat] + ' ' + what : cap(what) + ', ' + (STAT_POST[stat] || stat);
  }
  function hostLabel(D, host) {
    for (const key of Object.keys(D.docs || {})) {
      const doc = D.docs[key] || {};
      if (host.type === 'keyResult') {
        const kr = (doc.keyResults || []).find((x) => x.id === host.id);
        if (kr) { const sib = (doc.keyResults || []).filter((x) => x.objectiveId === kr.objectiveId); return 'KR' + (sib.indexOf(kr) + 1) + ', ' + kr.statement; }
      }
      if (host.type === 'stageGate') { const g = (doc.stageGates || []).find((x) => x.id === host.id); if (g) return 'Stage-gate “' + (g.name || g.id) + '”'; }
    }
    return '';
  }
  /* the status words the KPI table uses, so the preview says what the row will say */
  function stWordOf(s, v) {
    if (s == null) return v == null ? 'Nothing to pull yet' : 'No target yet';
    const b = F.band(s);
    return s >= 100 ? 'Met' : b === 'ok' ? 'On track' : b === 'warn' ? 'Near' : 'Below';
  }
  function scoreOf(kpi, v) {
    if (v == null || kpi.target == null || kpi.target === '') return null;
    return RD.kpiScore({ targetType: 'demonstration', direction: kpi.direction || 'up', target: kpi.target }, v);
  }
  function openEdit(C, ctx, k) {
    C.closeMenus();
    if (!k || !k.pull) return;
    if (!isLeader(C, divOfKpi(C, k) || ctx.divId)) { C.toast('Only ' + keepers(C, divOfKpi(C, k) || ctx.divId) + ' change a pulled KPI.', 'info'); return; }
    if (!C.guard()) return;
    const d = draftFromKpi(k), m = measureOf(d.each, d.measure), r = d.tg[k.statistic];
    if (m && r && r.name === suggestName(m, d, k.statistic, result(C, k))) r.auto = true;   // a suggested name keeps following the settings
    const docKey = docKeyOf(C.D, divOfKpi(C, k)) || ctx.docKey;
    C[C.sheet() ? 'pushSheet' : 'openSheet']('pull.build', { host: { type: k.hostType, id: k.hostId }, kpiId: k.id, divId: divOfKpi(C, k) || ctx.divId, docKey: docKey, objId: k.objectiveId }, d);
  }
  /* the KPI target sheet as the KPI module opens a new one */
  function postedSheet(C, ctx, sh) {
    if (sh.data.back) return sh.data.back;
    return null;
  }
  function buildVM(C, ctx, sh) {
    const D = C.D, d = sh.d, today = D.today;
    const host = sh.data.host || { type: 'keyResult', id: '' };
    const isGate = host.type === 'stageGate';
    const editing = !!sh.data.kpiId;
    const m = measureOf(d.each, d.measure) || MEASURES[d.each || 'objective'][0];
    const set = (patch) => C.setDraft(patch);
    const opts = STATS[m.kind];
    const stats = opts.map((x) => x[0]).filter((s) => (d.stats || []).indexOf(s) >= 0);
    const thrStats = m.kind === 'number' ? stats.filter(isThr) : [];
    const thrNum = K.num(d.threshold);
    const pl = pullOf(d);
    const rowOf = (stat) => (d.tg || {})[stat] || tgRow(m, stat);
    const kpiFor = (stat) => {
      const r = rowOf(stat);
      return { id: '__draft__', hostType: host.type, hostId: host.id, objectiveId: sh.data.objId || null, targetType: 'statistical', statistic: stat,
        threshold: thrNum == null ? 0 : thrNum, direction: r.dir === 'down' ? 'down' : 'up', target: targetOf(r), unit: r.unit == null ? unitFor(m, stat, d.each) : r.unit, pull: pl };
    };
    const results = stats.map((stat) => { const k = kpiFor(stat); return { stat: stat, k: k, res: result(C, k, true) }; });
    const base = results.find((x) => isThr(x.stat)) || results[0] || (() => { const k = kpiFor(m.stat); return { stat: m.stat, k: k, res: result(C, k, true) }; })();
    const res = base.res, bstat = base.stat;
    /* the preview: one tile per statistic, as its KPI row will read */
    const tiles = results.map((x) => {
      const v = x.res ? x.res.value : null, s = scoreOf(x.k, v), tone = F.band(s);
      return { k: 'pv:' + x.stat, label: statLabel(x.k, m), value: valText(x.k, v), valCls: 'pull-tv tx-' + (v == null ? 'none' : tone),
        hasScore: s != null, score: F.score(s), scoreCls: 'strong tx-' + tone, stCls: 'st ' + F.tone(s == null ? 'none' : tone), stWord: stWordOf(s, v),
        target: targetText(x.k), sentence: x.res ? sentence(x.res, m, d.each) : '' };
    });
    const nOut = res ? res.items.filter((x) => !x.counts && !x.host).length : 0;
    const pulledLine = !res || !res.items.length ? 'Nothing matches yet: ' + scopeText(D, pl) + '.'
      : F.plural(res.n, noun(d.each, 1), noun(d.each, 2)) + ' pulled from ' + scopeText(D, pl) + (nOut ? ', ' + nOut + ' waiting or left out' : '') + '.';
    /* what to pull */
    const eachSel = { v: d.each, opts: EACH.map((x) => ({ v: x[0], label: x[1] })),
      on: (e) => { const ea = e.target.value; if (ea === d.each || !MEASURES[ea]) return; set(applyMeasure(Object.assign({}, d, { each: ea, narrow: '' }), MEASURES[ea][0])); } };
    const measures = (MEASURES[d.each] || []).map((x) => ({ label: x.label, desc: x.desc, on: x.id === d.measure, cls: 'pull-ms' + (x.id === d.measure ? ' on' : ''),
      pick: () => { if (x.id === d.measure) return; set(applyMeasure(Object.assign({}, d), x)); } }));
    const states = m.kind === 'state' ? m.states.map((x) => {
      const on = (d.states || []).indexOf(x[0]) >= 0;
      return { label: cap(x[1]), on: on, cls: 'chip' + (on ? ' on' : ''),
        toggle: () => { const cur = (d.states || []).slice(); const i = cur.indexOf(x[0]); if (i >= 0) { if (cur.length > 1) cur.splice(i, 1); } else cur.push(x[0]); set({ states: cur }); } };
    }) : [];
    /* the statistics: adding, pick any number (one KPI each); editing, pick one */
    const toggleStat = (st) => {
      let cur = stats.slice();
      const tg = Object.assign({}, d.tg || {});
      if (editing) {
        if (cur[0] === st) return;
        const old = rowOf(cur[0]);
        tg[st] = tgRow(m, st, old.auto === false ? { name: old.name, auto: false } : {});
        cur = [st];
      } else {
        const i = cur.indexOf(st);
        if (i >= 0) { if (cur.length === 1) return; cur.splice(i, 1); } else { cur.push(st); if (!tg[st]) tg[st] = tgRow(m, st); }
      }
      const p = { stats: opts.map((x) => x[0]).filter((s) => cur.indexOf(s) >= 0), tg: tg };
      if (m.kind === 'number' && isThr(st) && (d.threshold == null || d.threshold === '')) p.threshold = m.threshold || '';
      set(p);
    };
    const statChips = opts.map((x) => {
      const on = stats.indexOf(x[0]) >= 0;
      return { label: CHIP[x[0]] || x[1], title: x[1], on: on, cls: 'chip' + (on ? ' on' : '') + (CHIP_GAP.indexOf(x[0]) >= 0 ? ' pull-gap' : ''), toggle: () => toggleStat(x[0]) };
    });
    const tNum = thrNum == null ? 0 : thrNum;
    const thrHint = !thrStats.length ? '' : thrStats.some(isAbove) && thrStats.some((s) => !isAbove(s))
      ? 'Above counts each ' + noun(d.each, 1) + ' ' + thrWords(m, 'countAbove', tNum) + '; below, ' + thrWords(m, 'countBelow', tNum) + '.'
      : 'Counts each ' + noun(d.each, 1) + ' ' + thrWords(m, thrStats[0], tNum) + '.';
    /* a target per statistic */
    const tgRows = results.map((x) => {
      const r = rowOf(x.stat);
      const upd = (patch) => { const tg = Object.assign({}, d.tg || {}); tg[x.stat] = Object.assign({}, rowOf(x.stat), patch); set({ tg: tg }); };
      const lab = statLabel(x.k, m), auto = unitFor(m, x.stat, d.each), sug = suggestName(m, d, x.stat, x.res);
      return {
        k: 'tg:' + x.stat, label: lab,
        name: r.auto !== false ? sug : (r.name || ''), namePh: sug, nameAria: lab + ', name', onName: (e) => upd({ name: e.target.value, auto: false }),
        dir: r.dir === 'down' ? 'down' : 'up', dirAria: lab + ', direction', onDir: (e) => upd({ dir: e.target.value }),
        target: r.target == null ? '' : String(r.target), tgtAria: lab + ', target', onTarget: (e) => upd({ target: e.target.value }),
        unit: r.unit == null ? auto : r.unit, unitPh: auto || 'none', unitAria: lab + ', unit', onUnit: (e) => upd({ unit: e.target.value })
      };
    });
    /* which work */
    const dc = divChoice(D, d.div);
    const qs = []; ((D.portfolio && D.portfolio.objectives) || []).forEach((o) => { if (o.quarter && qs.indexOf(o.quarter) < 0) qs.push(o.quarter); }); qs.sort();
    const qOpts = [{ v: 'current', label: 'Current (' + F.q(qOf(today)) + ')' }, { v: 'next', label: 'Next (' + F.q(qNext(qOf(today))) + ')' }, { v: '', label: 'All quarters' }]
      .concat(qs.map((q) => ({ v: q, label: F.q(q) + ' only' })));
    /* projects and owners among the objectives this division choice reaches, in any quarter */
    const scopeKpi = { id: '__scope__', objectiveId: sh.data.objId || null, hostType: host.type, hostId: host.id, statistic: 'count',
      pull: Object.assign({}, pl, { each: 'objective', measure: 'score', follow: true, exclude: [], scope: Object.assign({}, pl.scope, { quarter: '', proj: '', owner: '', narrow: '' }) }) };
    const scopeObjs = (() => { const r = result(C, scopeKpi, true); const ids = r ? r.items.map((x) => x.id) : []; return ((D.portfolio && D.portfolio.objectives) || []).filter((o) => ids.indexOf(o.id) >= 0); })();
    const inits = []; scopeObjs.forEach((o) => { if (o.initiativeId && !inits.some((x) => x.v === o.initiativeId)) { const i = ((D.portfolio && D.portfolio.initiatives) || []).find((x) => x.id === o.initiativeId); if (i) inits.push({ v: i.id, label: i.name }); } });
    /* an owner may be one email (older records) or a list: RD.ownersOf reads both */
    const owners = []; scopeObjs.forEach((o) => RD.ownersOf(o).forEach((e) => { const kk = String(e).trim().toLowerCase(); if (kk && !owners.some((x) => x.v === kk)) owners.push({ v: kk, label: F.name(kk) }); }));
    const nar = NARROW[d.each];
    const narOpts = nar ? [{ v: '', label: nar[1] }].concat(narrowOpts(C, d, pl, host, sh.data.objId)) : [];
    /* a new scope starts with nothing left out by hand (a picked list keeps what it picked) */
    const sel = (val, list, key) => ({ v: val, opts: list, on: (e) => { const p = {}; p[key] = e.target.value; if (key === 'div') p.narrow = ''; if (d.follow !== false) p.exclude = []; set(p); } });
    /* the pulled items: one line each, ticked to pull it */
    const follow = d.follow !== false;
    const picked = follow ? null : (d.items || []);
    const toggleItem = (id) => {
      if (follow) { const ex = (d.exclude || []).slice(); const i = ex.indexOf(id); if (i >= 0) ex.splice(i, 1); else ex.push(id); set({ exclude: ex }); }
      else { const it = (d.items || []).slice(); const i = it.indexOf(id); if (i >= 0) it.splice(i, 1); else it.push(id); set({ items: it }); }
    };
    const setFollow = (on) => {
      const all = res ? res.items.filter((x) => !x.host).map((x) => x.id) : [];
      if (on) set({ follow: true, exclude: all.filter((id) => (d.items || []).indexOf(id) < 0), items: null });
      else set({ follow: false, items: all.filter((id) => (d.exclude || []).indexOf(id) < 0), exclude: [] });
    };
    const marks = (m.kind === 'number' && isThr(bstat)) || m.kind === 'state';
    const many = res ? res.items.some((x) => x.divId !== (res.items[0] || {}).divId) : false;
    const groups = [], byG = {};
    (res ? res.items : []).forEach((it) => {
      const gk = it.kind === 'objective' ? 'div:' + it.divId : it.objId;
      let g = byG[gk];
      if (!g) { g = byG[gk] = it.kind === 'objective' ? { name: divName(D, it.divId), sub: '', items: [] } : { name: it.objName, sub: (many ? divName(D, it.divId) + ', ' : '') + F.q(it.quarter || ''), items: [] }; groups.push(g); }
      const hitText = it.counts && marks && it.hit ? (isThr(bstat) && m.kind === 'number' ? (isAbove(bstat) ? 'over ' : 'under ') + itemVal(m, tNum) : 'counted') : '';
      const on = !it.host && (follow ? !it.hand : picked.indexOf(it.id) >= 0);
      g.items.push({
        id: it.id, name: it.name, k: 'pull-it:' + it.id,
        val: it.counts ? readingText(m, it) : '—', text: it.counts ? hitText : whyText(it), hasText: it.counts ? !!hitText : true,
        cls: 'pull-it' + (it.counts ? '' : ' out') + (it.hit && marks ? (rowOf(bstat).dir === 'down' ? ' hit bad' : ' hit good') : ''),
        on: on, toggle: () => toggleItem(it.id), cbAria: (on ? 'Leave out ' : 'Pull ') + it.name, canToggle: !it.host
      });
    });
    const nItems = res ? res.items.length : 0;
    const listHead = !nItems ? 'Nothing matches' : F.plural(res.n, noun(d.each, 1), noun(d.each, 2)) + ' pulled' + (marks && res ? ', ' + res.k + (isThr(bstat) && m.kind === 'number' ? (isAbove(bstat) ? ' over ' : ' under ') + itemVal(m, tNum) : ' counted') : '');
    const nHand = follow ? (d.exclude || []).length : 0;
    const word = isGate ? 'target' : 'KPI';
    return {
      title: editing ? 'Edit ' + word : 'Add ' + (stats.length > 1 ? word + 's' : word), sub: hostLabel(D, host),
      canPosted: !editing && !!sh.data.back,
      posted: () => { const back = postedSheet(C, ctx, sh); if (!back) return; const rest = (C.state.sheets || []).slice(0, -1); C.setState({ sheets: rest.concat([back]), menu: '' }); },
      tiles: tiles, pulledLine: pulledLine,
      eachSel: eachSel, measures: measures, isState: m.kind === 'state', states: states, showWindow: m.kind === 'event' || !!m.windowed,
      win: { v: d.window, opts: WINDOWS.map((x) => ({ v: x[0], label: x[1] })), on: (e) => set({ window: e.target.value }) },
      statHead: editing ? 'Statistic' : 'Statistics', statChips: statChips,
      statHint: editing ? 'Pick another to change what this ' + word + ' computes.' : 'Each statistic you pick becomes its own ' + word + (isGate ? ' on this gate.' : ' on this key result.'),
      hasThreshold: thrStats.length > 0, threshold: d.threshold == null ? '' : String(d.threshold), onThreshold: (e) => set({ threshold: e.target.value }),
      thresholdUnit: m.unit || '', hasThresholdUnit: !!m.unit, thrHint: thrHint,
      tgHead: stats.length > 1 ? 'Targets' : 'Target', tgRows: tgRows,
      scoreHint: 'At least: the score is the value as a share of the target. At most: at or below the target scores 100; against a target of 0, anything above it scores 0.',
      div: Object.assign(sel(d.div, dc.top, 'div'), { groups: dc.groups }), quarter: sel(d.quarter, qOpts, 'quarter'),
      proj: sel(d.proj, [{ v: '', label: 'Any project' }].concat(inits), 'proj'), owner: sel(d.owner, [{ v: '', label: 'Anyone' }].concat(owners), 'owner'),
      hasNarrow: !!nar, narrowLabel: nar ? nar[0] : '', narrow: sel(d.narrow, narOpts, 'narrow'),
      follow: follow, onFollow: (e) => setFollow(!!e.target.checked),
      groups: groups, listHead: listHead, noItems: nItems === 0, noItemsText: 'Nothing matches. Widen the division, quarter or project.',
      handOut: follow ? F.plural(nHand, 'item') + ' left out by hand' : (picked.length + ' picked; new matches wait until they are ticked'), hasHandOut: follow ? nHand > 0 : true,
      save: () => saveBuild(C, ctx, sh, results, m), saveLabel: editing ? 'Save' : 'Add ' + (stats.length > 1 ? stats.length + ' ' + word + 's' : word)
    };
  }
  /* the workstreams, boards or logic trees the objectives in scope have */
  function narrowOpts(C, d, pl, host, objId) {
    const each = d.each === 'workstream' ? 'workstream' : d.each === 'gate' ? 'workstream' : d.each === 'tile' ? 'tile' : 'tree';
    const scopeKpi = { id: '__narrow__', objectiveId: objId || null, hostType: host.type, hostId: host.id, statistic: 'count',
      pull: Object.assign({}, pl, { each: 'objective', measure: 'score', follow: true, exclude: [], scope: Object.assign({}, pl.scope, { narrow: '' }) }) };
    const r = result(C, scopeKpi, true);
    const ids = r ? r.items.map((x) => x.id) : [];
    const out = [];
    ((C.D.portfolio && C.D.portfolio.objectives) || []).filter((o) => ids.indexOf(o.id) >= 0).forEach((o) => {
      const doc = (C.D.docs || {})[docKeyOf(C.D, o.divisionId)] || {};
      const tail = ', ' + clip(o.statement, 30);
      if (each === 'workstream') (doc.stageGateSets || []).filter((s) => s.objectiveId === o.id).sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((s) => out.push({ v: s.id, label: (s.name || s.id) + tail }));
      else if (each === 'tile') (doc.boards || []).filter((b) => b.objectiveId === o.id).forEach((b) => out.push({ v: b.id, label: (b.name || b.id) + tail }));
      else { const bag = (doc.etbTrees || {})[o.id]; if (bag) RD.etbTreesOf(bag).trees.forEach((t) => out.push({ v: o.id + ':' + (t.tid || 't_main'), label: (t.name || t.title || 'Logic tree') + tail })); }
    });
    if (d.narrow && !out.some((x) => x.v === d.narrow)) out.push({ v: d.narrow, label: narrowName(C.D, d.each, d.narrow) });
    return out;
  }
  function saveBuild(C, ctx, sh, results, m) {
    const d = sh.d;
    if (!results.length) { C.sheetErr('Pick a statistic.'); return; }
    for (const x of results) {
      const r = (d.tg || {})[x.stat] || {};
      if (String(r.target == null ? '' : r.target).trim() !== '' && K.num(r.target) == null) { C.sheetErr('Use a number for the ' + statLabel(x.k, m).toLowerCase() + ' target, like 80.'); return; }
    }
    if (m.kind === 'number' && results.some((x) => isThr(x.stat)) && K.num(d.threshold) == null) { C.sheetErr('Use a number for the threshold, like 10.'); return; }
    if (d.follow === false && !(d.items || []).length) { C.sheetErr('Tick at least one item, or let new work join on its own.'); return; }
    const host = sh.data.host, editing = sh.data.kpiId;
    const v = C.viewer ? C.viewer() : null;
    const fieldsOf = (x) => {
      const r = (d.tg || {})[x.stat] || {};
      const name = (r.auto !== false ? '' : String(r.name || '').trim()) || suggestName(m, d, x.stat, x.res);
      return { name: name, targetType: 'statistical', statistic: x.stat, direction: r.dir === 'down' ? 'down' : 'up', target: targetOf(r), unit: x.k.unit || null };
    };
    const word = host.type === 'stageGate' ? 'Target' : 'KPI';
    let gone = false;
    const ok = C.mutate((D) => {
      const doc = D.docs[sh.data.docKey];
      if (!doc) { gone = true; return false; }
      if (!Array.isArray(doc.kpis)) doc.kpis = [];
      const thr = (k, x) => { if (m.kind === 'number' && isThr(x.stat)) k.threshold = K.num(d.threshold); else delete k.threshold; };
      if (editing) {
        const k = doc.kpis.find((x) => x.id === editing);
        if (!k) { gone = true; return false; }
        Object.assign(k, fieldsOf(results[0]), { pull: pullOf(d, k.pull) });
        thr(k, results[0]);
        delete k.readCount; delete k.readsFrom; delete k.rangeSpec;
        return;
      }
      results.forEach((x) => {
        const id = RD.allocId('kpi', sh.data.objId, doc.kpis.map((y) => y.id));
        const pl = pullOf(d);
        pl.by = v ? v.email : ''; pl.at = C.now();
        const k = Object.assign({ id: id, objectiveId: sh.data.objId, hostType: host.type, hostId: host.id, groupId: null, isDefiner: true }, fieldsOf(x), { pull: pl });
        thr(k, x);
        doc.kpis.push(k);
      });
    }, { msg: editing ? (host.type === 'stageGate' ? 'Target saved.' : 'KPI saved.') : (results.length > 1 ? results.length + ' ' + word + 's added.' : word + ' added.') });
    if (gone) { C.sheetErr('This ' + word.toLowerCase() + ' was deleted in the meantime. Close this panel.'); return; }
    if (ok === false) return;
    C.closeSheet();
  }

  /* ----------------------------------------------- the KPI target sheet's "Readings" choice */
  function tgSeg(C, ctx, s) {
    if (!s || s.kind !== 'kpi.target' || s.data.editing || s.data.pending || s.data.kpiId) return null;
    const host = s.data.host || {};
    if (host.type !== 'keyResult' && host.type !== 'stageGate') return null;
    const divId = divOfObj(C, s.data.objId) || ctx.divId;
    if (!isLeader(C, divId) || C.isRo()) return null;
    return {
      hint: 'Pulled readings come from other work: each matching objective, gate, tile or experiment gives one, and the statistic runs over them. Leads, the CTO and the CEO add them.',
      pick: () => {
        const sheets = (C.state.sheets || []).slice(0, -1);
        const d = newDraft(C, divId, host.type === 'stageGate' ? { each: 'tile', measure: 'finished' } : null);
        if (s.d && String(s.d.name || '').trim()) Object.assign(d.tg[d.stats[0]], { name: s.d.name, auto: false });
        const docKey = s.data.docKey || docKeyOf(C.D, divId);
        C.setState({ sheets: sheets.concat([{ kind: 'pull.build', data: { host: host, docKey: docKey, objId: s.data.objId, divId: divId, back: s }, d: d, d0: JSON.stringify(d), err: '' }]), menu: '' });
      }
    };
  }
  function divOfObj(C, objId) {
    const o = ((C.D.portfolio && C.D.portfolio.objectives) || []).find((x) => x.id === objId);
    return o ? o.divisionId : '';
  }

  return {
    row: row, tgSeg: tgSeg, openEdit: openEdit, reviewNote: reviewNote, isLeader: isLeader,
    isLeaderOfObj: (C, objId) => isLeader(C, divOfObj(C, objId)),
    result: (C, k) => result(C, k), MEASURES: MEASURES,
    _vm: { buildVM: buildVM }
  };
})();

MODS.pull = {
  state: {},
  wide: ['pull.build'],
  vm(C, ctx) {
    const top = C.sheet();
    let build = null, failed = null;
    if (top && top.kind === 'pull.build') {
      try { build = PULL._vm.buildVM(C, ctx, top); } catch (e) {
        console.error('[pull] build failed', e);
        (C._vmErrors || (C._vmErrors = [])).push('pull.build: ' + (e && e.message ? e.message : e));
        build = null;
        /* never a blank sheet: say what stopped it, with a way out */
        failed = { title: top.data && top.data.kpiId ? 'Edit KPI' : 'Add KPI',
          text: 'This sheet couldn’t read the work to pull from (' + String(e && e.message ? e.message : e).slice(0, 160) + '). Nothing was changed. Close it and try again; if it happens again, send this message to whoever looks after the apps.' };
      }
    }
    return { build: build, failed: failed };
  },
  /* the module's public namespace, for scenario tests (C.MODS.pull.api) */
  api: PULL
};
