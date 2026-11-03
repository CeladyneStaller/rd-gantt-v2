/* ============================================================================
   P-gantt: the Planning Gantt tab (mods/pgt).
   Ported from planning_app.template.html renderGantt and friends
   (L2177-2365 toolbar and timeframe grid, L2611-3107 geometry, tree and chart).

   Public namespace PGT (also used by mods/pms):
     PGT.cascade(C, ctx)          RD.cascade with paused milestones taken out (memoised per render)
     PGT.paused(P, ms)            is this milestone paused or deprioritized
     PGT.docOf(ctx, divId)        the division's execution document (EXEC- or BIZ-)
     PGT.objEnd(ctx, obj)         RD.objectiveEndState for the objective (or null)
     PGT.band(C, ctx, entity, id) the row band: 'on-track' | 'at-risk' | 'off-track' | 'no-band'
     PGT.ped                      guarded calls into the Planning editor (mods/ped)
     PGT.msStatus(C, ctx, id, status, note)   pause / deprioritize / resume (append-only history)
     PGT.setAchieved(C, ctx, id, on)  mark a milestone achieved (completedDate = today) or reopen it
                                  (PED.milestoneStatus when the editor module provides it)
     PGT.shift(C, entity, id, days)           move planned dates (bar drag and "Week earlier / later")

   UI state (pg_ prefix; pg_active and pg_timeframe are seeded by the shell from the
   URL simulation): pg_quarters (the viewer's timeframe selection, kept in localStorage
   rd_gantt_quarters like today), pg_showPaused (rd_gantt_showpaused), pg_labelw (rd_gantt_labelw),
   pg_col (collapse map), pg_level, pg_sel (row with the details popover),
   pg_drag (bar drag in progress), pg_rz (name-column resize in progress).
   ========================================================================== */
const PGT = {
  LMIN: 140, LMAX: 640, LDEF: 240,
  QBUF: 7,         // today's GANTT_QBUF: axis slack each side of the timeframe
  MINOV: 7,        // GANTT_MIN_OVERLAP: days a bar must spend inside the timeframe itself
  GRACE: 7,        // OBJ_END_GRACE_DAYS: an ended objective's overrun must exceed this to paint as slip
  H: { axis: 54, grp: 36, div: 34, row: 30 },
  TONE: { 'on-track': 'ok', 'at-risk': 'warn', 'off-track': 'bad', 'no-band': 'none' },
  LEVEL_WORD: { unit: 'Units', division: 'Divisions', product: 'Products', model: 'Models', quarter: 'Quarters', owner: 'Owners', initiative: 'Initiatives', objective: 'Objectives' },
  ENT_WORD: { division: 'division', initiative: 'initiative', objective: 'objective', milestone: 'milestone', unit: 'unit' },

  fin(v) { return typeof v === 'number' && isFinite(v); },
  r3(v) { return Math.round(v * 1000) / 1000; },
  docOf(ctx, divId) {
    if (ctx && typeof ctx.docOf === 'function') return ctx.docOf(divId);
    const m = (ctx && ctx.execMap) || {};
    return m[divId] || null;
  },
  paused(P, m) { try { return !!(m && RD.milestonePaused(P.milestoneState, m.id)); } catch (e) { return false; } },
  objEnd(ctx, o) {
    if (!o) return null;
    if (ctx && typeof ctx.objEnd === 'function') return ctx.objEnd(o);
    const d = PGT.docOf(ctx, o.divisionId);
    return RD.objectiveEndState(d ? d.objectiveState : null, o.id);
  },
  curQ(ctx) { return ctx.qNow || F.qOfDay(ctx.today); },
  date(d, ctx) { return PGT.fin(d) ? F.dayAuto(d, ctx.today) : '—'; },
  span(a, b, ctx) { return PGT.date(a, ctx) + ' to ' + PGT.date(b, ctx); },
  divKind(ctx, divId) { const d = (ctx.P.divisions || []).find((x) => x.id === divId); return RD.divisionKind(d); },

  /* The schedule cascade with paused and deprioritized milestones taken out. Today they are hidden
     on the chart but still push their initiative's projected end and slip (inventory §19.8); here
     they are removed from the milestone list and from objectives' links, so an objective that only
     fed a paused milestone counts toward its initiative directly. */
  cascade(C, ctx) {
    if (ctx && typeof ctx.casc === 'function') return ctx.casc();     // the shell's shared cascade (same rule)
    return C.memo('pgt.casc', () => {
      const P = ctx.P;
      const pausedIds = {};
      (P.milestones || []).forEach((m) => { if (PGT.paused(P, m)) pausedIds[m.id] = 1; });
      let PP = P;
      if (Object.keys(pausedIds).length) {
        PP = Object.assign({}, P, {
          milestones: (P.milestones || []).filter((m) => !pausedIds[m.id]),
          objectives: (P.objectives || []).map((o) => (o.milestoneIds || []).some((id) => pausedIds[id])
            ? Object.assign({}, o, { milestoneIds: o.milestoneIds.filter((id) => !pausedIds[id]) }) : o)
        });
      }
      try { return RD.cascade(PP, ctx.em, ctx.today); } catch (e) {
        return { objectiveProjectedEnd: {}, milestoneEffective: {}, initiativeProjectedEnd: {}, longTermSlip: {}, gateEffective: {}, gateSlipped: {}, cycles: [] };
      }
    });
  },
  /* the band a row shows (today's nodeBand) */
  band(C, ctx, entity, id) {
    return C.memo('pgt.band:' + entity + ':' + id, () => {
      const P = ctx.P, em = ctx.em;
      if (entity === 'stagegateset') return RD.band(RD.setScore(id, em, ctx.today));
      if (entity === 'milestone') {
        if (typeof ctx.msBand === 'function') return ctx.msBand(id);
        const ms = (P.milestones || []).find((m) => m.id === id);
        if (ms && RD.milestoneAchieved(ms, em)) return 'on-track';
        return RD.band(RD.milestoneScore(id, em));
      }
      if (entity === 'objective' && typeof ctx.objBand === 'function') return ctx.objBand(id);
      let s = null;
      if (entity === 'division') s = RD.rollupDivision(id, P, em);
      else if (entity === 'initiative') s = RD.rollupInitiative(id, P, em);
      else if (entity === 'objective') s = RD.rollupObjective(id, P, em);
      return RD.band(s);
    });
  },
  /* today's isActiveObjective: not complete, and tagged this quarter or running today */
  isActiveObj(C, ctx, o) {
    if (typeof ctx.isActiveObj === 'function') return ctx.isActiveObj(o);
    const sc = RD.rollupObjective(o.id, ctx.P, ctx.em);
    if (sc != null && sc >= 100) return false;
    if ((o.quarter || '') === PGT.curQ(ctx)) return true;
    const t = ctx.today;
    return o.plannedStart != null && o.plannedEnd != null && o.plannedStart <= t && t <= o.plannedEnd;
  },
  /* today's msDiaClass: mirrors classifyGate; a milestone can also be achieved on its KPIs */
  msDia(ctx, ms) {
    if (ms.completedDate != null) return (ms.plannedDate != null && ms.completedDate > ms.plannedDate) ? 'passed-late' : 'passed';
    if (RD.milestoneAchieved(ms, ctx.em)) return 'passed';
    if (ms.plannedDate != null && ms.plannedDate < ctx.today) return 'overdue';
    return 'pending';
  },
  /* the timeframe: the viewer's quarters, or the current quarter when none are chosen */
  effQuarters(C, ctx) {
    const q = (C.state.pg_quarters || []).filter((x) => RD.quarterRange(x));
    if (q.length) return q;
    const cq = PGT.curQ(ctx);
    return RD.quarterRange(cq) ? [cq] : [];
  },
  window(C, ctx) {
    if (!C.state.pg_timeframe) return null;
    const sel = PGT.effQuarters(C, ctx);
    const r = RD.quarterSpanRange(sel);
    if (!r) return null;
    const a = F.fromIso(r.start), b = F.fromIso(r.end);
    if (a == null || b == null || b <= a) return null;
    return { from: r.from, to: r.to, span: RD.quarterSpan(sel), qlo: a, qhi: b, lo: a - PGT.QBUF, hi: b + PGT.QBUF };
  },
  /* which years the grid offers (today's ganttGridYears): what the plan touches, filled, at most
     three, anchored so the current year is always reachable */
  gridYears(C, ctx) {
    const P = ctx.P, ys = {};
    const addIso = (iso) => { const d = String(iso || '').slice(0, 4); if (/^\d{4}$/.test(d)) ys[+d] = 1; };
    const addDay = (v) => { if (PGT.fin(v)) addIso(F.iso(v)); };
    const addQ = (q) => { const p = RD.quarterRange(q); if (p) { addIso(p.start); addIso(p.end); } };
    const live = (P.milestones || []).filter((m) => !PGT.paused(P, m));
    (P.objectives || []).forEach((o) => { if (o.quarter) addQ(o.quarter); addDay(o.plannedStart); addDay(o.plannedEnd); });
    /* milestones carry plannedDate (and completedDate); today's scan read plannedStart / plannedEnd,
       which milestones never have, so they never counted */
    live.forEach((m) => { addDay(m.plannedDate); addDay(m.completedDate); addDay(m.plannedStart); addDay(m.plannedEnd); });
    (P.initiatives || []).forEach((i) => { addDay(i.plannedStart); addDay(i.plannedEnd); });
    PGT.effQuarters(C, ctx).forEach((q) => { const p = RD.quarterRange(q); if (p) addIso(p.start); });
    const nowY = F.dateOf(ctx.today).getUTCFullYear();
    ys[nowY] = 1;
    let list = Object.keys(ys).map(Number).sort((a, b) => a - b);
    if (list.length) { const filled = []; for (let y = list[0]; y <= list[list.length - 1]; y++) filled.push(y); list = filled; }
    if (list.length > 3) {
      const iNow = list.indexOf(nowY);
      const i = Math.max(0, Math.min(iNow - 1, list.length - 3));
      list = list.slice(i, i + 3);
    }
    return list;
  },

  /* ---------------------------------------------------------------- edits */
  ped: {
    has(fn) { return typeof PED !== 'undefined' && !!PED && typeof PED[fn] === 'function'; },
    edit(C, ctx, entity, id) {
      if (PGT.ped.has('open')) return PED.open(C, ctx, entity, id);
      C.toast('The ' + entity + ' editor is not available in this build yet.', 'info');
    },
    add(C, ctx, entity, parentId, prefill) {
      if (PGT.ped.has('open')) return PED.open(C, ctx, entity, null, { parentId: parentId, prefill: prefill || {} });
      C.toast('The ' + entity + ' editor is not available in this build yet.', 'info');
    },
    lineage(C, ctx, entity, id) {
      if (PGT.ped.has('lineage')) return PED.lineage(C, ctx, entity, id);
      C.toast('Lineage is not available in this build yet.', 'info');
    },
    del(C, ctx, entity, id) {
      if (!C.guard()) return;
      if (PGT.ped.has('del')) return PED.del(C, ctx, entity, id);
      C.toast('Deleting is not available in this build yet.', 'info');
    }
  },
  /* prefill for "Add <child> here" (today's openTreeAdd) */
  addHere(C, ctx, child, parentId) {
    let prefill = {};
    if (child === 'initiative') prefill = { divisionId: parentId };
    else if (child === 'objective') { const i = (ctx.P.initiatives || []).find((x) => x.id === parentId); prefill = { initiativeId: parentId, divisionId: i ? i.divisionId : '' }; }
    else if (child === 'milestone') prefill = { initiativeId: parentId };
    PGT.ped.add(C, ctx, child, parentId, prefill);
  },
  /* Pause / deprioritize / resume: appends a record (the last one wins), saved at once. */
  msStatus(C, ctx, msId, status, note) {
    if (typeof PED !== 'undefined' && PED && typeof PED.milestoneStatus === 'function') return PED.milestoneStatus(C, ctx, msId, status, note);
    const msg = status === 'paused' ? 'Milestone paused.' : status === 'deprioritized' ? 'Milestone deprioritized.' : 'Milestone resumed.';
    return C.mutate((D) => {
      const P = D.portfolio;
      if (!(P.milestones || []).some((m) => m.id === msId)) return false;
      P.milestoneState = RD.setMilestoneState(P.milestoneState, msId, status, C.today(), note == null ? '' : String(note).trim());
    }, { msg: msg });
  },
  /* "Pause" and "Deprioritize" ask why (optional), like the editor's note field */
  askStatus(C, ctx, ms, status) {
    if (!C.guard()) return;
    const isP = status === 'paused';
    C.ask({
      title: (isP ? 'Pause ' : 'Deprioritize ') + '“' + (ms.name || ms.id) + '”?',
      body: 'Keeps the milestone and its dates, but stops it counting toward any rollup and takes it off the Gantt.',
      label: 'Why (optional)', placeholder: isP ? 'e.g. Waiting on the supplier' : 'e.g. Superseded by the new design',
      ok: isP ? 'Pause milestone' : 'Deprioritize milestone',
      onOk: (v) => { PGT.msStatus(C, ctx, ms.id, status, v); }
    });
  },
  setAchieved(C, ctx, msId, on) {
    if (PGT.ped.has('milestoneStatus')) return PED.milestoneStatus(C, ctx, msId, on ? 'achieved' : 'open', '');
    return C.mutate((D) => {
      const m = (D.portfolio.milestones || []).find((x) => x.id === msId);
      if (!m) return false;
      if (on) m.completedDate = C.today(); else m.completedDate = null;
    }, { msg: on ? 'Milestone marked achieved.' : 'Milestone reopened.' });
  },
  shift(C, entity, id, dd) {
    dd = Math.round(dd || 0);
    if (!dd) return false;
    const n = Math.abs(dd);
    const word = n === 7 ? 'a week' : F.plural(n, 'day');
    return C.mutate((D) => {
      const P = D.portfolio;
      const list = entity === 'milestone' ? P.milestones : entity === 'initiative' ? P.initiatives : P.objectives;
      const r = (list || []).find((x) => x.id === id);
      if (!r) return false;
      if (entity === 'milestone') {
        if (!PGT.fin(r.plannedDate)) return false;
        r.plannedDate += dd;
      } else {
        if (!PGT.fin(r.plannedStart) || !PGT.fin(r.plannedEnd)) return false;
        r.plannedStart += dd; r.plannedEnd += dd;
      }
    }, { msg: 'Moved ' + word + (dd < 0 ? ' earlier.' : ' later.') });
  },
  openIn(C, ctx, objId, tab) {
    const o = (ctx.P.objectives || []).find((x) => x.id === objId);
    const app = o && PGT.divKind(ctx, o.divisionId) === 'biz' ? 'sales' : 'exec';
    C.handoff(tab ? { app: app, objective: objId, tab: tab } : { app: app, objective: objId });
  },

  /* ============================================================ the model
     Builds the full tree exactly like today's renderGantt: every dated node (so the axis is
     stable under collapse), filtered objectives, the Active-only and Timeframe rules, paused
     milestones, emptied parents dropped. Memoised per render. */
  model(C, ctx) {
    return C.memo('pgt.model', () => PGT.buildModel(C, ctx));
  },
  buildModel(C, ctx) {
    const P = ctx.P, em = ctx.em, td = ctx.today, S = C.state, fin = PGT.fin;
    const casc = PGT.cascade(C, ctx);
    const f = ctx.f || {};
    const anyFilter = !!(f.unit || f.div || f.prod || f.q || f.status);
    const objMatch = ctx.objMatch || (() => true);
    const initMatch = ctx.initMatch || (() => true);
    const activeOnly = !!S.pg_active;
    const showPaused = !!S.pg_showPaused;
    const qWin = PGT.window(C, ctx);
    const todayIso = F.iso(td);
    const objById = {};
    (P.objectives || []).forEach((o) => { objById[o.id] = o; });
    const docOf = (divId) => PGT.docOf(ctx, divId) || {};
    /* the division's own document, EXEC- or BIZ- (today several lookups hard-code EXEC-, so a
       business division's gates and ended state go missing: inventory §19.10) */
    const gatesOf = (o) => (docOf(o.divisionId).stageGates || []).filter((g) => g.objectiveId === o.id);
    const objEnd = (o) => PGT.objEnd(ctx, o);
    const pfGate = (g) => g.actualDate != null ? g.actualDate : Math.max(g.plannedDate, td);
    const max = (a) => Math.max.apply(null, a), min = (a) => Math.min.apply(null, a);
    function gateDisplayEff(g) {
      const st = RD.classifyGate(g, td), done = st === 'passed' || st === 'passed-late';
      if (!done) { const oe = objEnd(objById[g.objectiveId]); if (oe) return g.plannedDate; }   // ended objective: no forecast extension
      const ge = casc.gateEffective[g.id];
      return fin(ge) ? ge : (g.plannedDate == null ? null : pfGate(g));
    }
    /* milestone-KR steps: the sample stores step due dates as day numbers, the live app as ISO */
    function krSteps(kr) {
      const iso = Object.assign({}, kr, { steps: (kr.steps || []).map((s) => Object.assign({}, s, { due: fin(s.due) ? F.iso(s.due) : (s.due || '') })) });
      return RD.milestoneGanttSteps(iso, todayIso).map((st) => Object.assign({}, st, { day: F.fromIso(st.due) }));
    }
    function planSets(doc, objId) {
      return ((doc && doc.stageGateSets) || []).filter((s) => s.objectiveId === objId).slice()
        .sort((a, b) => ((a.order || 0) - (b.order || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
    }
    function groupGates(doc, objId) {
      const byDue = (a, b) => { const pa = a.plannedDate == null ? Infinity : a.plannedDate, pb = b.plannedDate == null ? Infinity : b.plannedDate; return (pa - pb) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)); };
      const gates = ((doc && doc.stageGates) || []).filter((g) => g.objectiveId === objId);
      const sets = planSets(doc, objId);
      const groups = sets.map((st) => ({ set: st, gates: gates.filter((g) => g.setId === st.id).slice().sort(byDue) }));
      const valid = {};
      sets.forEach((st) => { valid[st.id] = 1; });
      const orphans = gates.filter((g) => !valid[g.setId]).slice().sort(byDue);
      if (orphans.length) groups.push({ set: { id: '__ung__:' + objId, name: 'Ungrouped' }, gates: orphans });
      return groups;
    }
    const gateLabels = {};
    function gateLabel(g) {
      if (gateLabels[g.id]) return gateLabels[g.id];
      const o = objById[g.objectiveId];
      const groups = o ? groupGates(docOf(o.divisionId), o.id) : [];
      for (let gi = 0; gi < groups.length; gi++) {
        const i = groups[gi].gates.findIndex((x) => x.id === g.id);
        if (i >= 0) return (gateLabels[g.id] = 'SG-' + String.fromCharCode(65 + gi) + (i + 1));
      }
      return (gateLabels[g.id] = g.name || g.id);
    }

    /* ---- geometry per node: bars for spans, markers for points ---- */
    const gcache = {};
    function geom(entity, r) {
      const ck = (entity === 'objective' || entity === 'initiative' || entity === 'division') ? entity + ':' + r.id : null;
      if (ck && gcache[ck]) return gcache[ck];
      const g = geomRaw(entity, r);
      if (ck) gcache[ck] = g;
      return g;
    }
    function geomRaw(entity, r) {
      if (entity === 'stagegate') return { kind: 'diamond', gate: true, planned: r.plannedDate, eff: gateDisplayEff(r), baseline: r.baselineDate != null ? r.baselineDate : null, slipped: !!(casc.gateSlipped && casc.gateSlipped[r.id]), state: RD.classifyGate(r, td) };
      if (entity === 'stagegateset') {
        const gts = r.__gates || [];
        const planned = gts.map((g) => g.plannedDate).filter(fin);
        const effs = gts.map(gateDisplayEff).filter(fin);
        const o = objById[r.objectiveId];
        const objDs = o ? geom('objective', o).ds : null;
        const ds = fin(objDs) ? objDs : (planned.length ? min(planned) : null);
        const de = effs.length ? max(effs) : ds;
        return { kind: 'bar', set: true, ds: ds, de: de, pe: null, slip: 0, derived: false };
      }
      if (entity === 'milestone') return { kind: 'diamond', planned: r.plannedDate, eff: casc.milestoneEffective[r.id], actual: r.completedDate };
      if (entity === 'mstep') { const d = r.day; return { kind: 'diamond', planned: d, eff: d, actual: r.status === 'done' ? d : null, msStatus: r.status }; }
      if (entity === 'milestonekr') {
        const ds = krSteps(r).map((st) => st.day).filter(fin);
        const lo = ds.length ? min(ds) : null, hi = ds.length ? max(ds) : null;
        return { kind: 'bar', ds: lo, de: hi, pe: hi, slip: 0, derived: true, krm: true };
      }
      if (entity === 'board') {
        let lo = null, hi = null;
        (r.tiles || []).forEach((t) => {
          const lane = (r.swimlanes || []).find((l) => l.id === t.lane);
          RD.gateDueDates(r.columns, lane, t).due.forEach((iso) => { const d = F.fromIso(iso); if (d != null) { lo = lo == null || d < lo ? d : lo; hi = hi == null || d > hi ? d : hi; } });
          const sd = F.fromIso(t.startDate); if (sd != null) lo = lo == null || sd < lo ? sd : lo;
        });
        return { kind: 'bar', ds: lo, de: hi, pe: hi, slip: 0, derived: true, board: true };
      }
      if (entity === 'boardtile') {
        const b = r.__board, lane = (b.swimlanes || []).find((l) => l.id === r.lane);
        const dd = RD.gateDueDates(b.columns, lane, r).due.map((iso) => F.fromIso(iso)).filter((v) => v != null);
        const sd = F.fromIso(r.startDate);
        return { kind: 'bar', ds: sd != null ? sd : (dd.length ? dd[0] : null), de: dd.length ? dd[dd.length - 1] : null, pe: null, slip: 0, derived: true, tile: true };
      }
      if (entity === 'objective') {
        const starts = gatesOf(r).map((g) => g.plannedDate).filter(fin);
        const peRaw = casc.objectiveProjectedEnd[r.id], pe = (fin(peRaw) && peRaw > 0) ? peRaw : null;
        const ds = fin(r.plannedStart) ? r.plannedStart : (starts.length ? min(starts) : null);
        const de = fin(r.plannedEnd) ? r.plannedEnd : pe;
        const derived = !fin(r.plannedStart) || !fin(r.plannedEnd);
        const oe = objEnd(r);
        if (oe && fin(oe.endedDay)) {
          /* closed late: the bar holds at the planned end and only a real overrun paints red;
             closed early: the bar ends where the work stopped */
          const over = fin(r.plannedEnd) ? oe.endedDay - r.plannedEnd : 0;
          const endedDe = fin(r.plannedEnd) ? Math.min(r.plannedEnd, oe.endedDay) : oe.endedDay;
          return { kind: 'bar', ds: ds, de: endedDe, pe: oe.endedDay, slip: over > PGT.GRACE ? over : 0, slipFrom: r.plannedEnd, derived: derived, ended: oe };
        }
        const slip = fin(r.plannedEnd) ? Math.max(0, (pe != null ? pe : r.plannedEnd) - r.plannedEnd) : 0;
        return { kind: 'bar', ds: ds, de: de, pe: pe, slip: slip, slipFrom: r.plannedEnd, derived: derived };
      }
      if (entity === 'initiative') {
        const objs = (P.objectives || []).filter((o) => o.initiativeId === r.id);
        const mils = (P.milestones || []).filter((m) => m.initiativeId === r.id && !PGT.paused(P, m));
        const starts = [];
        objs.forEach((o) => { const g = geom('objective', o); if (fin(g.ds)) starts.push(g.ds); });
        mils.forEach((m) => { if (fin(m.plannedDate)) starts.push(m.plannedDate); });
        const peRaw = casc.initiativeProjectedEnd[r.id], pe = (fin(peRaw) && peRaw > 0) ? peRaw : null;
        /* An initiative with no KPIs of its own is a container: it ends with its work, the EARLIER of
           (i) the day its last objective closed (once every objective has ended) and (ii) its last
           stage-gate. One with KPIs is measured in its own right, so its own dates stand. */
        const hasKpis = (P.kpis || []).some((k) => k.hostType === 'initiative' && k.hostId === r.id);
        let kidEnd = null;
        if (!hasKpis && objs.length) {
          const cands = [];
          const endDays = objs.map((o) => { const es = objEnd(o); return es && fin(es.endedDay) ? es.endedDay : null; });
          if (endDays.every((v) => v != null)) cands.push(max(endDays));
          const gEnds = [];
          objs.forEach((o) => {
            const gs = gatesOf(o);
            if (gs.length) gs.forEach((g) => { const v = gateDisplayEff(g); if (fin(v)) gEnds.push(v); });
            else { const og = geom('objective', o); if (fin(og.de)) gEnds.push(og.de); }
          });
          if (gEnds.length) cands.push(max(gEnds));
          if (cands.length) kidEnd = min(cands);
        }
        const ds = fin(r.plannedStart) ? r.plannedStart : (starts.length ? min(starts) : null);
        const base = fin(r.plannedEnd) ? r.plannedEnd : pe;
        const de = kidEnd != null ? (base != null ? Math.min(base, kidEnd) : kidEnd) : base;
        const pEnd = kidEnd != null ? kidEnd : pe;
        /* Slip only when both ends are real dates (today an initiative with no planned end can
           show "+NaNd" or a slip counted from 2020: inventory §19.13) */
        const cslip = casc.longTermSlip[r.id];
        const slip = (kidEnd != null && base != null) ? Math.max(0, kidEnd - base)
          : (fin(r.plannedEnd) && fin(cslip) ? Math.max(0, cslip) : 0);
        return { kind: 'bar', ds: ds, de: de, pe: pEnd, slip: slip, slipFrom: base, derived: !fin(r.plannedStart) || !fin(r.plannedEnd), container: !hasKpis && objs.length > 0 };
      }
      /* division: a pure roll-up over its initiatives */
      const gs = (P.initiatives || []).filter((i) => i.divisionId === r.id).map((i) => geom('initiative', i));
      const starts = gs.map((g) => g.ds).filter(fin), ends = gs.map((g) => fin(g.pe) ? g.pe : g.de).filter(fin);
      const ds = starts.length ? min(starts) : null, de = ends.length ? max(ends) : null;
      return { kind: 'bar', ds: ds, de: de, pe: de, slip: 0, derived: true };
    }
    function childRefs(entity, r) {
      if (entity === 'division') return (P.initiatives || []).filter((i) => i.divisionId === r.id).map((i) => ({ entity: 'initiative', rec: i }));
      if (entity === 'initiative') return (P.milestones || []).filter((m) => m.initiativeId === r.id).map((m) => ({ entity: 'milestone', rec: m }))
        .concat((P.objectives || []).filter((o) => o.initiativeId === r.id).map((o) => ({ entity: 'objective', rec: o })));
      if (entity === 'objective') {
        const doc = docOf(r.divisionId);
        const grps = groupGates(doc, r.id).filter((grp) => grp.gates.length);
        let out = [];
        if (grps.length === 1) out = grps[0].gates.map((g) => ({ entity: 'stagegate', rec: g }));
        else out = grps.map((grp) => ({ entity: 'stagegateset', rec: { id: grp.set.id, name: grp.set.name, objectiveId: r.id, __gates: grp.gates } }));
        let mi = 0;
        (doc.keyResults || []).filter((k) => k.objectiveId === r.id).forEach((k) => {
          if (k.trackingType === 'milestone') {
            mi++;
            if (krSteps(k).length) out.push({ entity: 'milestonekr', rec: Object.assign({ __krm: mi }, k) });
          }
        });
        (doc.boards || []).filter((b) => b.objectiveId === r.id).forEach((b) => { out.push({ entity: 'board', rec: b }); });
        return out;
      }
      if (entity === 'stagegateset') return (r.__gates || []).map((g) => ({ entity: 'stagegate', rec: g }));
      if (entity === 'milestonekr') return krSteps(r).map((st) => ({ entity: 'mstep', rec: Object.assign({ __krId: r.id, __krm: r.__krm, __objId: r.objectiveId }, st) }));
      if (entity === 'board') return (r.tiles || []).map((t) => ({ entity: 'boardtile', rec: Object.assign({ __board: r }, t) }));
      return [];
    }
    const visible = (g) => g.kind === 'bar' ? (fin(g.ds) && fin(g.de)) : fin(g.planned);
    /* An objective tagged with a quarter inside the timeframe is in it, whatever its dates say.
       Otherwise it must spend at least a week inside the window, not graze its edge. */
    const objInWin = (r, g) => {
      if (!qWin) return true;
      if (r.quarter && qWin.span.indexOf(r.quarter) >= 0) return true;
      if (g.kind !== 'bar') return true;
      if (!fin(g.ds) || !fin(g.de)) return false;
      return Math.min(g.de, qWin.qhi) - Math.max(g.ds, qWin.qlo) + 1 >= PGT.MINOV;
    };
    const barInWin = (g) => {
      if (!qWin) return true;
      if (!g || g.kind !== 'bar') return true;
      if (!fin(g.ds) || !fin(g.de)) return false;
      return Math.min(g.de, qWin.qhi) - Math.max(g.ds, qWin.qlo) + 1 >= PGT.MINOV;
    };
    /* points (gates, milestones) use the buffered window */
    const ptInWin = (g) => {
      if (!qWin) return true;
      return [g.planned, g.eff, g.actual].filter(fin).some((v) => v >= qWin.lo && v <= qWin.hi);
    };
    /* An initiative with no objectives is judged on its own: the shared filters (its unit,
       division and product; hidden under a quarter or status filter) and Active only (running
       today). Today such initiatives ignore every filter and Active only: inventory §19.7. */
    const initActive = (r) => fin(r.plannedStart) && fin(r.plannedEnd) && r.plannedStart <= td && td <= r.plannedEnd;
    const nameOf = (r) => (r ? (r.name || r.statement || r.id) : '');
    const objEndCmp = (a, b) => {
      const ae = fin(a.g.de) ? a.g.de : Infinity, be = fin(b.g.de) ? b.g.de : Infinity;
      if (ae !== be) return ae - be;
      return String(nameOf(a.rec)).localeCompare(String(nameOf(b.rec)));
    };
    const sortObjKids = (kids) => {
      const objs = kids.filter((k) => k.entity === 'objective');
      if (objs.length < 2) return;
      objs.sort(objEndCmp);
      let i = 0;
      for (let j = 0; j < kids.length; j++) if (kids[j].entity === 'objective') kids[j] = objs[i++];
    };
    const keyOf = (entity, r) => {
      if (entity === 'mstep') return 'mstep:' + r.__krId + '/' + r.id;
      if (entity === 'boardtile') return 'boardtile:' + r.__board.id + '/' + r.id;
      return entity + ':' + r.id;
    };
    function build(entity, r, depth) {
      if (entity === 'objective' && anyFilter && !objMatch(r)) return null;
      if (entity === 'objective' && activeOnly && !PGT.isActiveObj(C, ctx, r)) return null;
      const g = geom(entity, r);
      if (!visible(g)) return null;
      if (entity === 'objective' && !objInWin(r, g)) return null;
      if (entity === 'milestone' && PGT.paused(P, r) && !showPaused) return null;
      if ((entity === 'milestone' || entity === 'stagegate') && !ptInWin(g)) return null;
      const kids = [];
      childRefs(entity, r).forEach((c) => { const n = build(c.entity, c.rec, depth + 1); if (n) kids.push(n); });
      sortObjKids(kids);
      if ((anyFilter || activeOnly || qWin) && (entity === 'division' || entity === 'initiative')
        && !kids.some((k) => k.entity === 'objective' || k.entity === 'initiative')) {
        const standalone = entity === 'initiative'
          && !(P.objectives || []).some((o) => o.initiativeId === r.id)
          && barInWin(g)
          && (!anyFilter || initMatch(r))
          && (!activeOnly || initActive(r));
        if (!standalone) return null;
      }
      return { entity: entity, rec: r, depth: depth, g: g, kids: kids, key: keyOf(entity, r) };
    }
    /* the scores of the objectives shown under a group (today the group dot calls the roll-up
       with the wrong arguments and is always grey) */
    function groupTone(kids) {
      const vs = [];
      (function walk(list) { list.forEach((n) => { if (n.entity === 'objective') { const s = RD.rollupObjective(n.rec.id, P, em); if (s != null) vs.push(s); } walk(n.kids); }); })(kids);
      return F.band(vs.length ? K.sum(vs) / vs.length : null);
    }
    function groupSpan(kids) {
      const dss = [], des = [];
      (function span(list) {
        list.forEach((n) => {
          if (n.synthetic) { span(n.kids); return; }
          const gg = n.g;
          if (gg && fin(gg.ds)) dss.push(gg.ds);
          const e = gg ? (fin(gg.de) ? gg.de : fin(gg.pe) ? gg.pe : gg.ds) : null;
          if (fin(e)) des.push(e);
        });
      })(kids);
      return { kind: 'bar', ds: dss.length ? min(dss) : null, de: des.length ? max(des) : null, pe: null, slip: 0, derived: false };
    }
    function countObjs(kids) { let n = 0; (function walk(list) { list.forEach((k) => { if (k.entity === 'objective') n++; walk(k.kids); }); })(kids); return n; }
    /* Hierarchy: Unit -> Division -> Initiative -> Milestones and Objectives -> gates.
       Divisions with no (known) unit sit under "Unassigned". */
    function unitRoots() {
      const units = (P.units || []).slice().sort(K.byOrder);
      const buckets = [], byUnit = {};
      units.forEach((u) => { const b = { unit: u, divs: [] }; byUnit[u.id] = b; buckets.push(b); });
      const unassigned = { unit: null, divs: [] };
      (P.divisions || []).slice().sort(K.byOrder).forEach((d) => { const b = (d.unitId && byUnit[d.unitId]) ? byUnit[d.unitId] : unassigned; b.divs.push(d); });
      buckets.push(unassigned);
      const out = [];
      buckets.forEach((b) => {
        const kids = [];
        b.divs.forEach((d) => { const n = build('division', d, 1); if (n) kids.push(n); });
        if (!kids.length) return;
        const uid = b.unit ? b.unit.id : '__none__';
        out.push({ synthetic: true, dim: 'unit', dimKey: b.unit ? b.unit.id : '', label: b.unit ? (b.unit.name || b.unit.id) : 'Unassigned', tone: groupTone(kids), depth: 0, key: 'grp:unit:' + uid, kids: kids, g: groupSpan(kids), nObj: countObjs(kids) });
      });
      return out;
    }
    function dimLabel(dim, key) {
      if (dim === 'unit') { const u = (P.units || []).find((x) => x.id === key); return u ? u.name : key; }
      if (dim === 'division') { const d = (P.divisions || []).find((x) => x.id === key); return d ? d.name : key; }
      if (dim === 'product') { const p = (P.products || []).find((x) => x.id === key); return p ? p.name : key; }
      if (dim === 'model') { const m = (P.models || []).find((x) => x.id === key); return m ? m.name : key; }
      if (dim === 'initiative') { const i = (P.initiatives || []).find((x) => x.id === key); return i ? nameOf(i) : key; }
      if (dim === 'quarter') return F.q(key);
      if (dim === 'owner') return F.name(key);
      return key;
    }
    function groupRoots(nodes, depth, keyPrefix) {
      const out = [];
      nodes.forEach((n) => {
        const key = keyPrefix + '/' + n.dim + ':' + n.key;
        if (n.key === '' || n.key === '__all__') {
          (n.children ? groupRoots(n.children, depth, keyPrefix) : (n.objs || []).map((o) => build('objective', o, depth)).filter(Boolean).sort(objEndCmp)).forEach((k) => out.push(k));
          return;
        }
        const kids = n.children ? groupRoots(n.children, depth + 1, key) : (n.objs || []).map((o) => build('objective', o, depth + 1)).filter(Boolean).sort(objEndCmp);
        if (!kids.length) return;
        out.push({ synthetic: true, dim: n.dim, dimKey: n.key, label: dimLabel(n.dim, n.key), tone: groupTone(kids), depth: depth, key: 'grp:' + key, kids: kids, g: groupSpan(kids), nObj: countObjs(kids) });
      });
      return out;
    }
    const grp = ctx.group || { mode: 'hierarchy', dims: ['division'] };
    const custom = grp.mode !== 'hierarchy';
    const dims = custom ? (grp.dims || []).slice() : [];
    let roots = [];
    if (custom && dims.length) {
      const gobjs = (P.objectives || []).filter((o) => !anyFilter || objMatch(o));
      roots = groupRoots(RD.groupObjectives(gobjs, dims, P), 0, '');
    } else if (custom) {
      const gobjs = (P.objectives || []).filter((o) => !anyFilter || objMatch(o));
      roots = gobjs.map((o) => build('objective', o, 0)).filter(Boolean).sort(objEndCmp);
    } else {
      roots = unitRoots();
    }
    /* collapse levels (today's pfLevels), labelled by the dimension's own name (today the custom
       buttons all read "— none —": inventory §19.3) */
    const levels = custom
      ? dims.map((d) => ({ id: d, label: PGT.LEVEL_WORD[d] || d })).concat([{ id: 'objective', label: 'Objectives' }])
      : [{ id: 'unit', label: 'Units' }, { id: 'division', label: 'Divisions' }, { id: 'initiative', label: 'Initiatives' }, { id: 'objective', label: 'Objectives' }];
    /* ---- domain over the full tree, plus today ---- */
    let lo = Infinity, hi = -Infinity;
    (function scan(list) {
      list.forEach((n) => {
        const g = n.g;
        if (g.kind === 'bar') { if (fin(g.ds)) lo = Math.min(lo, g.ds); if (fin(g.de)) hi = Math.max(hi, g.de); if (fin(g.pe)) hi = Math.max(hi, g.pe); }
        else { if (fin(g.planned)) { lo = Math.min(lo, g.planned); hi = Math.max(hi, g.planned); } if (fin(g.eff)) hi = Math.max(hi, g.eff); if (fin(g.baseline)) { lo = Math.min(lo, g.baseline); hi = Math.max(hi, g.baseline); } }
        scan(n.kids);
      });
    })(roots);
    if (isFinite(lo)) lo = Math.min(lo, td);
    if (isFinite(hi)) hi = Math.max(hi, td);
    if (!isFinite(lo)) lo = td;
    if (!isFinite(hi) || hi <= lo) hi = lo + 1;
    if (qWin) { lo = qWin.lo; hi = qWin.hi; }   // the timeframe pins the axis, applied last
    let nGatesAll = 0;
    (function walk(list) { list.forEach((n) => { if (n.entity === 'stagegate') nGatesAll++; walk(n.kids); }); })(roots);
    return {
      roots: roots, levels: levels, custom: custom, dims: dims, lo: lo, hi: hi, qWin: qWin, anyFilter: anyFilter, activeOnly: activeOnly,
      casc: casc, gateLabel: gateLabel, krSteps: krSteps, nameOf: nameOf, objById: objById, nGatesAll: nGatesAll
    };
  },

  /* collapse map for "Collapse to <level>" (null = expand all). Boards start folded; once the
     viewer has used these buttons they open like everything else, as today. */
  collapseMap(M, level) {
    const map = {};
    const lvl = (n) => (n.synthetic ? n.dim : n.entity);
    (function boards(list) { list.forEach((n) => { if (n.entity === 'board') map[n.key] = false; boards(n.kids); }); })(M.roots);
    if (level == null) return map;
    (function walk(list) {
      list.forEach((n) => {
        if (lvl(n) === level) { if (n.kids.length) map[n.key] = true; }
        else walk(n.kids);
      });
    })(M.roots);
    return map;
  },
  isCollapsed(C, n) {
    const m = C.state.pg_col || {};
    return Object.prototype.hasOwnProperty.call(m, n.key) ? !!m[n.key] : n.entity === 'board';
  },
  flatRows(C, M) {
    const rows = [];
    (function go(list) { list.forEach((n) => { rows.push(n); if (!PGT.isCollapsed(C, n)) go(n.kids); }); })(M.roots);
    return rows;
  },
  /* quarter and month ticks between lo and hi */
  quarterTicks(lo, hi) {
    const s = F.dateOf(lo);
    let ty = s.getUTCFullYear(), tm = Math.floor(s.getUTCMonth() / 3) * 3;
    const out = [];
    for (let i = 0; i < 80; i++) {
      const day = Math.round((Date.UTC(ty, tm, 1) - Date.UTC(2020, 0, 1)) / 86400000);
      if (day > hi) break;
      out.push({ day: day, label: 'Q' + (tm / 3 + 1) + ' ' + ty });
      tm += 3; if (tm >= 12) { tm -= 12; ty++; }
    }
    return out;
  },
  monthTicks(lo, hi) {
    const s = F.dateOf(lo);
    let ty = s.getUTCFullYear(), tm = s.getUTCMonth();
    const out = [];
    for (let i = 0; i < 400; i++) {
      const day = Math.round((Date.UTC(ty, tm, 1) - Date.UTC(2020, 0, 1)) / 86400000);
      if (day > hi) break;
      if (day >= lo) out.push({ day: day, label: F.MON[tm], q: tm % 3 === 0 });
      tm++; if (tm >= 12) { tm -= 12; ty++; }
    }
    return out;
  }
};

/* ============================================================== the view */
function pgtGateWord(st) { return { passed: 'Passed', 'passed-late': 'Passed late', overdue: 'Overdue', pending: 'Pending', done: 'Done', 'passed-ontime': 'Passed' }[st] || F.cap(st || ''); }

function pgtRowVM(C, ctx, M, n, x, pw, sel, y) {
  const fin = PGT.fin, ro = !!ctx.ro, present = !!ctx.present;
  const g = n.g, S = C.state;
  const hasKids = n.kids.length > 0;
  const collapsed = PGT.isCollapsed(C, n);
  const dk = n.key;
  const ent = n.synthetic ? 'group' : n.entity;
  const drag = S.pg_drag && S.pg_drag.key === n.key && S.pg_drag.moved ? S.pg_drag : null;
  const dd = drag ? drag.dd : 0;
  const lvCls = n.synthetic ? 'lv-grp' : n.entity === 'division' ? 'lv-div' : 'lv-row';
  const r = {
    key: n.key, dk: dk, ent: ent,
    cls: 'pgt-row ' + lvCls + ' e-' + ent + (sel ? ' sel' : '') + (n.entity === 'milestone' && PGT.paused(ctx.P, n.rec) ? ' paused' : ''),
    pad: 'padding-left: ' + (n.depth * 16 + 6) + 'px',
    hasChev: hasKids, open: hasKids ? !collapsed : false, chevLabel: '', toggle: null, chevCls: 'pgt-chev' + (collapsed ? ' shut' : ''),
    noChev: !hasKids,
    dotCls: 'pgt-dot none', hasDot: false,
    hasTag: false, tag: '',
    link: false, plain: false, name: '', nameCls: 'pgt-nm', pick: null,
    acts: [], hasActs: false,
    shapes: [], hit: null, hasHit: false, sub: '', hasSub: false,
    y: y, h: n.synthetic ? PGT.H.grp : n.entity === 'division' ? PGT.H.div : PGT.H.row
  };
  const nameText = n.synthetic ? n.label : M.nameOf(n.rec);
  r.name = nameText;
  if (hasKids) {
    r.chevLabel = (collapsed ? 'Expand ' : 'Collapse ') + nameText;
    r.toggle = () => {
      const m = Object.assign({}, C.state.pg_col || {});
      m[n.key] = !PGT.isCollapsed(C, n);
      C.setState({ pg_col: m, pg_level: null, menu: '' });
    };
  }
  /* ---- label column ---- */
  if (n.synthetic) {
    r.hasDot = true; r.dotCls = 'pgt-dot ' + F.tone(n.tone);
    r.plain = true; r.nameCls = 'pgt-nm grp';
    r.hasSub = true; r.sub = F.plural(n.nObj, 'objective');
  } else {
    const e = n.entity;
    if (e === 'division' || e === 'initiative' || e === 'objective' || e === 'milestone' || e === 'stagegateset') {
      const tone = PGT.TONE[PGT.band(C, ctx, e === 'stagegateset' ? 'stagegateset' : e, n.rec.id)] || 'none';
      r.hasDot = true;
      r.dotCls = 'pgt-dot ' + (e === 'milestone' ? 'dia ' : '') + 't-' + tone;
    }
    if (e === 'division' || e === 'initiative' || e === 'objective' || e === 'milestone') {
      r.link = true;
      r.nameCls = 'pgt-nm lnk ink e-' + e + (e === 'milestone' ? ' dim' : '');
      r.pick = () => PGT.ped.lineage(C, ctx, e, n.rec.id);
    } else {
      r.plain = true; r.nameCls = 'pgt-nm static e-' + e;
      if (e === 'stagegate') { r.hasTag = true; r.tag = M.gateLabel(n.rec); }
      else if (e === 'milestonekr') { r.hasTag = true; r.tag = 'KR'; }
      else if (e === 'mstep') { r.hasTag = true; r.tag = 'KR-M' + n.rec.__krm; }
    }
    /* hover actions: edit, add a child here, delete (all through the Planning editor) */
    if (!ro && !present) {
      const word = PGT.ENT_WORD[e];
      if (e === 'division' || e === 'initiative' || e === 'objective' || e === 'milestone') {
        r.acts.push({ label: 'Edit ' + word, icon: 'edit', isEdit: true, isAdd: false, isDel: false, fn: () => PGT.ped.edit(C, ctx, e, n.rec.id) });
      }
      if (e === 'division') r.acts.push({ label: 'Add initiative here', icon: 'add', isEdit: false, isAdd: true, isDel: false, fn: () => PGT.addHere(C, ctx, 'initiative', n.rec.id) });
      if (e === 'initiative') {
        r.acts.push({ label: 'Add objective here', icon: 'add', isEdit: false, isAdd: true, isDel: false, fn: () => PGT.addHere(C, ctx, 'objective', n.rec.id) });
        r.acts.push({ label: 'Add milestone here', icon: 'addms', isEdit: false, isAdd: true, isDel: false, fn: () => PGT.addHere(C, ctx, 'milestone', n.rec.id) });
      }
      if (e === 'division' || e === 'initiative' || e === 'objective' || e === 'milestone') {
        r.acts.push({ label: 'Delete ' + word, icon: 'del', isEdit: false, isAdd: false, isDel: true, fn: () => PGT.ped.del(C, ctx, e, n.rec.id) });
      }
    }
  }
  r.acts.forEach((a) => { a.isAddMs = a.icon === 'addms'; a.isAdd = a.icon === 'add'; });
  r.hasActs = r.acts.length > 0;

  /* ---- track ---- */
  const shapes = [];
  const sh = (cls, style, title, txt) => shapes.push({ cls: cls, style: style, title: title || '', txt: txt == null ? '' : String(txt), hasTxt: txt != null && txt !== '' });
  const X = (d) => PGT.r3(x(d));
  const pick = () => {
    if (C._pgNoClick && Date.now() - C._pgNoClick < 600) { C._pgNoClick = 0; return; }
    const open = C.state.pg_sel === n.key && C.isMenu('pgt.pop');
    C.setState({ pg_sel: open ? '' : n.key, menu: open ? '' : 'pgt.pop' });
  };
  let hit = null;
  const dateFacts = (a, b) => PGT.span(a, b, ctx);
  if (n.synthetic) {
    if (fin(g.ds) && fin(g.de)) hit = { cls: 'pgt-gbar', style: 'left: ' + X(g.ds) + '%; width: ' + pw(X(g.de) - X(g.ds)), label: nameText + ', ' + dateFacts(g.ds, g.de), title: dateFacts(g.ds, g.de) };
  } else if (n.entity === 'board' || n.entity === 'boardtile') {
    const rec = n.rec;
    if (fin(g.ds) && fin(g.de)) hit = { cls: 'pgt-kbspan', style: 'left: ' + X(g.ds) + '%; width: ' + pw(X(g.de) - X(g.ds)), label: nameText + ', ' + dateFacts(g.ds, g.de), title: dateFacts(g.ds, g.de) };
    const todayIso = F.iso(ctx.today);
    if (n.entity === 'board') {
      const WORST = { red: 'overdue', orange: 'passed-late', green: 'passed', none: 'pending' };
      (rec.columns || []).forEach((c, k) => {
        let latest = null;
        (rec.tiles || []).forEach((t) => {
          const lane = (rec.swimlanes || []).find((l) => l.id === t.lane);
          const d = F.fromIso(RD.gateDueDates(rec.columns, lane, t).due[k]);
          if (d != null) latest = latest == null || d > latest ? d : latest;
        });
        if (latest == null) return;
        const sm = RD.boardGateSummary(rec, k, todayIso);
        sh('pgt-mk sq ' + (WORST[sm.worst] || 'pending'), 'left: ' + X(latest) + '%', c.name + ': ' + sm.passed + ' of ' + sm.total + ' passed', sm.passed);
      });
    } else {
      const b = rec.__board, lane = (b.swimlanes || []).find((l) => l.id === rec.lane);
      const due = RD.gateDueDates(b.columns, lane, rec).due;
      (b.columns || []).forEach((c, k) => {
        const d = F.fromIso(due[k]);
        if (d == null) return;
        const st = RD.gateTileState(b, rec, k, todayIso);
        sh('pgt-mk sq ' + (st === 'passed-ontime' ? 'passed' : st), 'left: ' + X(d) + '%', c.name + ': ' + pgtGateWord(st).toLowerCase() + ', due ' + PGT.date(d, ctx));
      });
    }
  } else if (g.kind === 'bar') {
    const ds = g.ds + dd, de = g.de + dd;
    const tone = PGT.TONE[n.entity === 'milestonekr' ? 'no-band' : PGT.band(C, ctx, n.entity, n.rec.id)] || 'none';
    const oEnd = n.entity === 'objective' ? g.ended : (n.entity === 'stagegateset' ? PGT.objEnd(ctx, M.objById[n.rec.objectiveId]) : null);
    const cancelled = !!(g.set && oEnd);
    const bits = [];
    if (g.set) bits.push(cancelled ? 'Cancelled' : 'Workstream');
    bits.push(dateFacts(ds, de));
    if (g.slip > 0 && fin(g.pe)) bits.push('projected ' + PGT.date(g.pe, ctx) + ' (+' + F.plural(g.slip, 'day') + ')');
    if (g.derived && (n.entity === 'objective' || n.entity === 'initiative')) bits.push('dates inferred');
    hit = {
      cls: 'pgt-bar t-' + tone + (g.derived ? ' derived' : '') + (g.set ? ' set' : '') + (cancelled ? ' cancelled' : '') + (drag ? ' drag' : '') + (sel ? ' sel' : ''),
      style: 'left: ' + X(ds) + '%; width: ' + pw(X(de) - X(ds)),
      label: nameText + ', ' + bits.join(', '), title: F.cap(bits.join(', '))
    };
    if (g.slip > 0 && fin(g.pe) && !drag) {
      const sx = X(fin(g.slipFrom) ? g.slipFrom : g.de);
      sh('pgt-slip', 'left: ' + sx + '%; width: ' + pw(PGT.r3(X(g.pe) - sx)), 'Slip: projected ' + PGT.date(g.pe, ctx) + ', ' + F.plural(g.slip, 'day') + ' past the planned end');
    }
    if (n.entity === 'objective' && oEnd && fin(oEnd.endedDay)) {
      sh('pgt-end ' + (oEnd.status === 'abandoned' ? 'abandoned' : 'achieved'), 'left: ' + X(oEnd.endedDay) + '%', (oEnd.status === 'abandoned' ? 'Abandoned ' : 'Achieved ') + PGT.date(oEnd.endedDay, ctx));
    }
  } else if (g.gate) {
    const st = g.state || 'pending';
    const oEnd = PGT.objEnd(ctx, M.objById[n.rec.objectiveId]);
    const cnl = !!oEnd && st !== 'passed' && st !== 'passed-late';
    const missed = cnl && oEnd.status === 'abandoned';
    const ex = X(fin(g.eff) ? g.eff : g.planned);
    if (!cnl && g.slipped && fin(g.baseline)) {
      const bx = X(g.baseline);
      sh('pgt-conn committed', 'left: ' + Math.min(bx, ex) + '%; width: ' + pw(PGT.r3(Math.abs(ex - bx))), 'Committed ' + PGT.date(g.baseline, ctx));
      sh('pgt-mk sq ghost', 'left: ' + bx + '%', 'Committed ' + PGT.date(g.baseline, ctx));
    } else if (!cnl && fin(g.eff) && fin(g.planned) && g.eff !== g.planned) {
      const px = X(g.planned);
      sh('pgt-conn', 'left: ' + Math.min(px, ex) + '%; width: ' + pw(PGT.r3(Math.abs(ex - px))), 'Planned ' + PGT.date(g.planned, ctx));
      sh('pgt-mk sq ghost', 'left: ' + px + '%', 'Planned ' + PGT.date(g.planned, ctx));
    }
    const word = missed ? 'Missed' : cnl ? 'Cancelled' : pgtGateWord(st);
    const t = word + (!cnl && fin(g.eff) ? ', forecast ' + PGT.date(g.eff, ctx) : '') + (fin(g.planned) ? ', planned ' + PGT.date(g.planned, ctx) : '');
    hit = { cls: 'pgt-mk sq ' + st + (cnl ? ' cancelled' : '') + (missed ? ' missed' : '') + (sel ? ' sel' : ''), style: 'left: ' + ex + '%', label: nameText + ': ' + t, title: t };
  } else if (n.entity === 'mstep') {
    const st = g.msStatus === 'done' ? 'done' : g.msStatus === 'overdue' ? 'overdue' : 'pending';
    const t = nameText + ', due ' + PGT.date(g.planned, ctx) + ', ' + pgtGateWord(g.msStatus).toLowerCase();
    hit = { cls: 'pgt-mk ' + st + (sel ? ' sel' : ''), style: 'left: ' + X(g.planned) + '%', label: t, title: t };
  } else {
    /* milestones read like stage-gates: a ghost at the planned date, a connector, and a status
       marker at the completion date (or the projection) */
    const ms = n.rec;
    const pausedMs = PGT.paused(ctx.P, ms);
    const st = PGT.msDia(ctx, ms);
    const planned = fin(g.planned) ? g.planned + dd : null;
    let mark = fin(g.actual) ? g.actual : fin(g.eff) ? g.eff : null;
    if (pausedMs) mark = planned;                       // paused: the intended date as a ghost
    else if (drag && !fin(g.actual)) mark = planned;    // dragging: preview the new planned date
    const px = X(planned), ex = fin(mark) ? X(mark) : px;
    if (!pausedMs && fin(mark) && fin(planned) && mark !== planned) {
      sh('pgt-conn', 'left: ' + Math.min(px, ex) + '%; width: ' + pw(PGT.r3(Math.abs(ex - px))), 'Planned ' + PGT.date(planned, ctx));
      sh('pgt-mk ghost', 'left: ' + px + '%', 'Planned ' + PGT.date(planned, ctx));
    }
    const slip = fin(g.actual) && fin(g.planned) ? g.actual - g.planned : null;
    let t = fin(g.actual) ? 'Completed ' + PGT.date(g.actual, ctx) : (fin(mark) ? 'Projected ' + PGT.date(mark, ctx) : 'Planned');
    if (slip != null && slip !== 0) t += ' (' + (slip > 0 ? '+' : '') + F.plural(slip, 'day') + ')';
    if (pausedMs) {
      const stt = RD.milestoneState(ctx.P.milestoneState, ms.id) || {};
      t = (stt.status === 'deprioritized' ? 'Deprioritized' : 'Paused') + ', was planned ' + PGT.date(g.planned, ctx);
    }
    hit = { cls: 'pgt-mk ' + (pausedMs ? 'ghost paused' : st) + (drag ? ' drag' : '') + (sel ? ' sel' : ''), style: 'left: ' + ex + '%', label: nameText + ': ' + t, title: t };
  }
  if (hit) {
    hit.click = pick;
    /* pointer drag: objectives and initiatives with their own planned dates, milestones with a
       planned date, never in read-only and never for ended work. Writes plannedStart / plannedEnd
       (plannedDate for a milestone) through C.mutate; "Week earlier / later" in the details do the
       same without a pointer. */
    const canDrag = PGT.canShift(C, ctx, n);
    hit.drag = canDrag;
    hit.down = canDrag ? (e) => {
      if (e && e.button != null && e.button !== 0) return;
      let w = 0;
      try {
        const el = e.currentTarget;
        const par = el && el.parentElement;
        w = (par && par.getBoundingClientRect ? par.getBoundingClientRect().width : 0) || (el.getBoundingClientRect ? el.getBoundingClientRect().width : 0);
        if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      } catch (err) { w = 0; }
      C.setState({ pg_drag: { key: n.key, x0: (e && e.clientX) || 0, w: w || 800, span: M.hi - M.lo, dd: 0, moved: false } });
    } : null;
    hit.move = canDrag ? (e) => {
      const d0 = C.state.pg_drag;
      if (!d0 || d0.key !== n.key) return;
      const dx = ((e && e.clientX) || 0) - d0.x0;
      const ddn = Math.round((dx / d0.w) * d0.span);
      const moved = d0.moved || Math.abs(dx) > 4;
      if (ddn !== d0.dd || moved !== d0.moved) C.setState({ pg_drag: Object.assign({}, d0, { dd: ddn, moved: moved }) });
    } : null;
    hit.up = canDrag ? () => {
      const d0 = C.state.pg_drag;
      if (!d0 || d0.key !== n.key) return;
      C.setState({ pg_drag: null });
      if (d0.moved) {
        C._pgNoClick = Date.now();                   // the click that follows a drag is not a selection
        if (d0.dd) PGT.shift(C, n.entity, n.rec.id, d0.dd);
      }
    } : null;
    hit.cancel = canDrag ? () => C.setState({ pg_drag: null }) : null;
    hit.bar = /pgt-(bar|gbar|kbspan)/.test(hit.cls);
    hit.mk = !hit.bar;
  }
  r.shapes = shapes;
  r.hit = hit || { cls: '', style: '', label: '', title: '', click: null, down: null, move: null, up: null, cancel: null, bar: false, mk: false, drag: false };
  r.hasHit = !!hit;
  r.hitBar = !!hit && hit.bar;
  r.hitMk = !!hit && !hit.bar;
  return r;
}

PGT.canShift = function (C, ctx, n) {
  if (ctx.ro || ctx.present || n.synthetic) return false;
  const r = n.rec;
  if (n.entity === 'objective') return PGT.fin(r.plannedStart) && PGT.fin(r.plannedEnd) && !PGT.objEnd(ctx, r);
  if (n.entity === 'initiative') return PGT.fin(r.plannedStart) && PGT.fin(r.plannedEnd);
  if (n.entity === 'milestone') return PGT.fin(r.plannedDate) && r.completedDate == null && !PGT.paused(ctx.P, r);
  return false;
};

/* details popover for the selected row (the Calm replacement for today's hover titles) */
function pgtPopVM(C, ctx, M, n, row, rowsH) {
  const fin = PGT.fin, P = ctx.P, em = ctx.em, ro = !!ctx.ro || !!ctx.present;
  const facts = [];
  const fact = (k, v, cls) => facts.push({ k: k, v: v == null || v === '' ? '—' : String(v), cls: cls || '' });
  const acts = [];
  const act = (label, fn, cls) => acts.push({ label: label, fn: fn, cls: 'btn sm' + (cls ? ' ' + cls : '') });
  let name = n.synthetic ? n.label : M.nameOf(n.rec), where = '';
  let handoff = null, handoffApp = '';
  const g = n.g;
  const scoreFact = (s) => { const t = F.band(s); return s == null ? 'No score yet' : F.score(s) + ', ' + F.bandWord(t).toLowerCase(); };
  const divName = (id) => { const d = (P.divisions || []).find((x) => x.id === id); return d ? d.name : id; };
  const initOf = (id) => (P.initiatives || []).find((x) => x.id === id) || null;
  const shiftActs = () => {
    if (!PGT.canShift(C, ctx, n)) return;
    act('Week earlier', () => PGT.shift(C, n.entity, n.rec.id, -7));
    act('Week later', () => PGT.shift(C, n.entity, n.rec.id, 7));
  };
  if (n.synthetic) {
    where = F.cap(PGT.LEVEL_WORD[n.dim] ? PGT.LEVEL_WORD[n.dim].replace(/s$/, '') : 'Group');
    fact('Objectives', String(n.nObj));
    const vs = [];
    (function walk(list) { list.forEach((k) => { if (k.entity === 'objective') { const s = RD.rollupObjective(k.rec.id, P, em); if (s != null) vs.push(s); } walk(k.kids); }); })(n.kids);
    fact('Score', vs.length ? scoreFact(K.sum(vs) / vs.length) : 'No score yet');
    fact('Spans', PGT.span(g.ds, g.de, ctx));
  } else if (n.entity === 'division') {
    const d = n.rec;
    const u = (P.units || []).find((x) => x.id === d.unitId);
    where = 'Division' + (u ? ', ' + u.name : '');
    fact('Score', scoreFact(RD.rollupDivision(d.id, P, em)));
    fact('Initiatives', String((P.initiatives || []).filter((i) => i.divisionId === d.id).length));
    fact('Spans', PGT.span(g.ds, g.de, ctx));
    if (!ro) { act('Edit division', () => PGT.ped.edit(C, ctx, 'division', d.id)); act('Add initiative', () => PGT.addHere(C, ctx, 'initiative', d.id)); }
    act('Show lineage', () => PGT.ped.lineage(C, ctx, 'division', d.id), 'q');
  } else if (n.entity === 'initiative') {
    const i = n.rec;
    where = 'Initiative, ' + divName(i.divisionId);
    fact('Planned', fin(i.plannedStart) || fin(i.plannedEnd) ? PGT.span(i.plannedStart, i.plannedEnd, ctx) : 'No dates yet');
    if (fin(g.pe) && g.slip > 0) fact('Projected end', PGT.date(g.pe, ctx) + ' (+' + F.plural(g.slip, 'day') + ')', 'tx-bad');
    else if (fin(g.pe)) fact('Projected end', PGT.date(g.pe, ctx));
    if (g.container) fact('Bar ends', 'With its work: no targets of its own');
    fact('Score', scoreFact(RD.rollupInitiative(i.id, P, em)));
    const nObj = (P.objectives || []).filter((o) => o.initiativeId === i.id).length;
    const mils = (P.milestones || []).filter((m) => m.initiativeId === i.id);
    const nP = mils.filter((m) => PGT.paused(P, m)).length;
    fact('Contains', F.plural(nObj, 'objective') + ', ' + F.plural(mils.length, 'milestone') + (nP ? ' (' + nP + ' paused)' : ''));
    shiftActs();
    if (!ro) {
      act('Edit initiative', () => PGT.ped.edit(C, ctx, 'initiative', i.id));
      act('Add objective', () => PGT.addHere(C, ctx, 'objective', i.id));
      act('Add milestone', () => PGT.addHere(C, ctx, 'milestone', i.id));
    }
    act('Show lineage', () => PGT.ped.lineage(C, ctx, 'initiative', i.id), 'q');
  } else if (n.entity === 'objective') {
    const o = n.rec, ini = initOf(o.initiativeId);
    where = 'Objective, ' + (ini ? M.nameOf(ini) : divName(o.divisionId));
    const own = Array.isArray(o.owner) ? o.owner : (o.owner ? [o.owner] : []);
    fact('Owner', own.length ? F.people(own) : 'No owner yet');
    fact('Quarter', o.quarter ? F.q(o.quarter) : 'No quarter');
    fact('Planned', fin(o.plannedStart) && fin(o.plannedEnd) ? PGT.span(o.plannedStart, o.plannedEnd, ctx) : 'Inferred: ' + PGT.span(g.ds, g.de, ctx));
    if (g.ended) {
      fact(g.ended.status === 'abandoned' ? 'Abandoned' : 'Achieved', PGT.date(g.ended.endedDay, ctx) + (g.slip > 0 ? ' (+' + F.plural(g.slip, 'day') + ' past the planned end)' : ''), g.ended.status === 'abandoned' ? 'tx-bad' : 'tx-ok');
    } else if (fin(g.pe)) {
      fact('Projected end', PGT.date(g.pe, ctx) + (g.slip > 0 ? ' (+' + F.plural(g.slip, 'day') + ')' : ''), g.slip > 0 ? 'tx-bad' : '');
    }
    fact('Score', scoreFact(RD.rollupObjective(o.id, P, em)));
    const qr = o.quarter ? F.qRange(o.quarter) : null;
    if (qr && fin(o.plannedStart) && fin(o.plannedEnd) && (o.plannedEnd > qr.end || o.plannedStart < qr.start)) {
      fact('Heads-up', 'Its dates run outside ' + F.q(o.quarter) + ', its quarter tag', 'tx-warn');
    }
    shiftActs();
    if (!ro) act('Edit objective', () => PGT.ped.edit(C, ctx, 'objective', o.id));
    act('Show lineage', () => PGT.ped.lineage(C, ctx, 'objective', o.id), 'q');
    handoffApp = PGT.divKind(ctx, o.divisionId) === 'biz' ? 'sales' : 'exec';
    handoff = () => PGT.openIn(C, ctx, o.id);
  } else if (n.entity === 'milestone') {
    const ms = n.rec, ini = initOf(ms.initiativeId);
    where = 'Milestone, ' + (ini ? M.nameOf(ini) : 'no initiative');
    const pausedMs = PGT.paused(P, ms);
    const stt = pausedMs ? (RD.milestoneState(P.milestoneState, ms.id) || {}) : null;
    const achieved = RD.milestoneAchieved(ms, em);
    fact('Planned', PGT.date(ms.plannedDate, ctx));
    if (fin(ms.completedDate)) fact('Completed', PGT.date(ms.completedDate, ctx) + (fin(ms.plannedDate) && ms.completedDate !== ms.plannedDate ? ' (' + (ms.completedDate > ms.plannedDate ? '+' : '') + F.plural(ms.completedDate - ms.plannedDate, 'day') + ')' : ''));
    else if (!pausedMs && fin(g.eff) && fin(ms.plannedDate) && g.eff > ms.plannedDate && !achieved) fact('Effective', PGT.date(g.eff, ctx) + ' (+' + F.plural(g.eff - ms.plannedDate, 'day') + ')', 'tx-bad');
    let status = '', cls = '';
    if (achieved) { status = fin(ms.completedDate) ? 'Achieved' : 'Achieved on its targets'; cls = 'tx-ok'; }
    else if (pausedMs) { status = (stt.status === 'deprioritized' ? 'Deprioritized' : 'Paused') + (fin(stt.day) ? ' on ' + PGT.date(stt.day, ctx) : '') + (stt.note ? '. ' + stt.note : ''); cls = 'tx-warn'; }
    else { const st = PGT.msDia(ctx, ms); status = st === 'overdue' ? 'Overdue' : 'Pending, ' + F.rel(ms.plannedDate, ctx.today); cls = st === 'overdue' ? 'tx-bad' : ''; }
    fact('Status', status, cls);
    const s = RD.milestoneScore(ms.id, em);
    fact('Score', s == null ? 'No reading yet' : scoreFact(s));
    fact('TRL / MRL', (ms.trl ? ms.trl : '—') + ' / ' + (ms.mrl ? ms.mrl : '—'));
    shiftActs();
    if (!ro) {
      if (!achieved) act('Mark achieved', () => PGT.setAchieved(C, ctx, ms.id, true));
      else if (fin(ms.completedDate)) act('Reopen milestone', () => PGT.setAchieved(C, ctx, ms.id, false));
      if (pausedMs) act('Resume milestone', () => PGT.msStatus(C, ctx, ms.id, 'active', ''));
    }
    if (ms.milestoneReport || !ro) act(ms.milestoneReport ? 'Open report' : 'Create report', () => { if (typeof PMS !== 'undefined') PMS.openReport(C, ctx, ms.id); });
    if (!ro) act('Edit milestone', () => PGT.ped.edit(C, ctx, 'milestone', ms.id));
    act('Show lineage', () => PGT.ped.lineage(C, ctx, 'milestone', ms.id), 'q');
  } else if (n.entity === 'stagegate' || n.entity === 'stagegateset') {
    const objId = n.rec.objectiveId, o = M.objById[objId];
    where = (n.entity === 'stagegate' ? 'Stage-gate ' + M.gateLabel(n.rec) : 'Workstream') + ', ' + (o ? M.nameOf(o) : objId);
    if (n.entity === 'stagegate') {
      const gt = n.rec, st = g.state;
      const oEnd = PGT.objEnd(ctx, o);
      const cnl = !!oEnd && st !== 'passed' && st !== 'passed-late';
      fact('Planned', PGT.date(gt.plannedDate, ctx));
      if (fin(gt.baselineDate)) fact('Committed', PGT.date(gt.baselineDate, ctx) + (gt.locked ? ', locked' : ''), g.slipped ? 'tx-bad' : '');
      if (fin(gt.actualDate)) fact('Passed', PGT.date(gt.actualDate, ctx));
      else if (!cnl && fin(g.eff)) fact('Forecast', PGT.date(g.eff, ctx), g.eff > gt.plannedDate ? 'tx-warn' : '');
      fact('Status', cnl ? (oEnd.status === 'abandoned' ? 'Missed: the objective was abandoned' : 'Cancelled: the objective ended') : pgtGateWord(st), st === 'overdue' || (cnl && oEnd.status === 'abandoned') ? 'tx-bad' : st === 'passed' ? 'tx-ok' : st === 'passed-late' ? 'tx-warn' : '');
    } else {
      const gts = n.rec.__gates || [];
      const passed = gts.filter((x) => { const st = RD.classifyGate(x, ctx.today); return st === 'passed' || st === 'passed-late'; }).length;
      fact('Stage-gates', passed + ' of ' + gts.length + ' passed');
      fact('Spans', PGT.span(g.ds, g.de, ctx));
    }
    handoffApp = o && PGT.divKind(ctx, o.divisionId) === 'biz' ? 'sales' : 'exec';
    handoff = () => PGT.openIn(C, ctx, objId, 'gates');
  } else if (n.entity === 'milestonekr' || n.entity === 'mstep') {
    const objId = n.entity === 'mstep' ? n.rec.__objId : n.rec.objectiveId, o = M.objById[objId];
    where = (n.entity === 'mstep' ? 'Milestone step, KR-M' + n.rec.__krm : 'Milestone key result') + ', ' + (o ? M.nameOf(o) : objId);
    if (n.entity === 'mstep') {
      fact('Due', PGT.date(g.planned, ctx));
      fact('Completion', F.pct(n.rec.completion));
      fact('Status', pgtGateWord(n.rec.status), n.rec.status === 'overdue' ? 'tx-bad' : n.rec.status === 'done' ? 'tx-ok' : '');
    } else {
      const steps = M.krSteps(n.rec);
      fact('Dated steps', steps.filter((s) => s.status === 'done').length + ' of ' + steps.length + ' done');
      fact('Spans', PGT.span(g.ds, g.de, ctx));
    }
    handoffApp = o && PGT.divKind(ctx, o.divisionId) === 'biz' ? 'sales' : 'exec';
    handoff = () => PGT.openIn(C, ctx, objId, 'krs');
  } else if (n.entity === 'board' || n.entity === 'boardtile') {
    const b = n.entity === 'board' ? n.rec : n.rec.__board, o = M.objById[b.objectiveId];
    where = (n.entity === 'board' ? 'Kanban board' : 'Workstream on ' + (b.name || 'a board')) + ', ' + (o ? M.nameOf(o) : b.objectiveId);
    const todayIso = F.iso(ctx.today);
    if (n.entity === 'board') {
      (b.columns || []).forEach((c, k) => { const sm = RD.boardGateSummary(b, k, todayIso); fact(c.name, sm.passed + ' of ' + sm.total + ' passed'); });
    } else {
      const t = n.rec, lane = (b.swimlanes || []).find((l) => l.id === t.lane);
      const due = RD.gateDueDates(b.columns, lane, t).due;
      (b.columns || []).forEach((c, k) => { const st = RD.gateTileState(b, t, k, todayIso); fact(c.name, pgtGateWord(st) + (due[k] ? ', due ' + PGT.date(F.fromIso(due[k]), ctx) : '')); });
    }
    handoffApp = o && PGT.divKind(ctx, o.divisionId) === 'biz' ? 'sales' : 'exec';
    handoff = () => PGT.openIn(C, ctx, b.objectiveId, 'gates');
  }
  /* placement: below the row when there is room, else above; horizontally at the bar */
  const actRows = Math.ceil((acts.length + (handoff ? 1 : 0)) / 3);
  const popH = 66 + facts.length * 22 + actRows * 38;
  const below = row.y + row.h + 4 + popH <= rowsH + 8 || row.y - 4 < popH;
  const lx = (d) => (PGT.fin(d) ? Math.max(0, Math.min(1, (d - M.lo) / (M.hi - M.lo))) : 0);
  let f0 = 0, f1 = 0;
  if (g.kind === 'bar') { f0 = lx(g.ds); f1 = lx(g.de); } else { f0 = lx(fin(g.actual) ? g.actual : fin(g.eff) ? g.eff : g.planned); f1 = f0; }
  const horiz = f0 < 0.5
    ? 'left: calc(var(--pg-labelw) + (100% - var(--pg-labelw) - 20px) * ' + f0.toFixed(4) + ')'
    : 'right: calc(20px + (100% - var(--pg-labelw) - 20px) * ' + (1 - f1).toFixed(4) + ')';
  const vert = below ? 'top: ' + (row.y + row.h + 4) + 'px' : 'bottom: calc(100% - ' + (row.y - 4) + 'px)';
  return {
    name: name, where: where, facts: facts, acts: acts, hasActs: acts.length > 0 || !!handoff,
    style: horiz + '; ' + vert, below: below, popH: popH,
    hasHandoff: !!handoff, handoff: handoff || (() => {}), handoffLabel: handoffApp === 'sales' ? 'Open in Sales' : 'Open in Execution',
    handoffHref: handoffApp === 'sales' ? 'Sales-A.dc.html' : 'Main.dc.html',
    close: () => C.setState({ pg_sel: '', menu: '' }),
    minH: below ? row.y + row.h + 12 + popH : 0
  };
}

/* Per-viewer Gantt preferences live in this browser under today's keys (rd_gantt_quarters,
   rd_gantt_showpaused, rd_gantt_labelw), never in the plan. Blocked storage leaves them for the visit. */
function pgtLS(key, val) {
  try {
    const ls = window.localStorage;
    if (!ls) return null;
    if (val === undefined) return ls.getItem(key);
    if (val === null) ls.removeItem(key); else ls.setItem(key, String(val));
  } catch (e) { /* storage blocked: the choice lasts for this visit only */ }
  return null;
}
function pgtSetQuarters(C, list) {
  pgtLS('rd_gantt_quarters', JSON.stringify(list || []));
  C.setState({ pg_quarters: list || [], pg_timeframe: true, pg_sel: '', menu: '' });
}

MODS.pgt = {
  state() {
    let qs = [];
    try { const raw = pgtLS('rd_gantt_quarters'); const a = raw ? JSON.parse(raw) : null; qs = Array.isArray(a) ? a.filter((q) => RD.quarterRange(q)) : []; } catch (e) { qs = []; }
    const lw = parseInt(pgtLS('rd_gantt_labelw') || '', 10);
    return {
      pg_active: false, pg_timeframe: false,          // the shell seeds these from the URL simulation
      pg_quarters: qs, pg_showPaused: pgtLS('rd_gantt_showpaused') === '1',
      pg_labelw: isFinite(lw) ? K.clamp(lw, PGT.LMIN, PGT.LMAX) : PGT.LDEF,
      pg_col: {}, pg_level: null, pg_sel: '', pg_drag: null, pg_rz: null
    };
  },
  vm(C, ctx) {
    const S = C.state, fin = PGT.fin;
    const M = PGT.model(C, ctx);
    const ro = !!ctx.ro, present = !!ctx.present;
    const P = ctx.P;
    /* ---- toolbar ---- */
    const levels = M.levels.map((l) => ({
      label: l.label, on: S.pg_level === l.id ? 'true' : 'false',
      pick: () => C.setState({ pg_col: PGT.collapseMap(M, l.id), pg_level: l.id, pg_sel: '', menu: '' })
    }));
    const nPaused = (function () { try { return RD.pausedMilestoneIds(P.milestoneState, P.milestones).length; } catch (e) { return 0; } })();
    const tfOn = !!S.pg_timeframe;
    /* ---- timeframe grid ---- */
    const eff = PGT.effQuarters(C, ctx);
    const effSet = {}; eff.forEach((q) => { effSet[q] = 1; });
    const impSet = {}; RD.quarterSpanImplied(eff).forEach((q) => { impSet[q] = 1; });
    const chosen = {}; (S.pg_quarters || []).forEach((q) => { chosen[q] = 1; });
    const nowQ = PGT.curQ(ctx);
    const years = PGT.gridYears(C, ctx).map((y) => {
      const qs = RD.yearQuarters(y);
      const full = qs.every((q) => chosen[q]);
      return {
        label: String(y), on: full ? 'true' : 'false', cls: 'pgt-yr' + (full ? ' on' : ''),
        title: full ? 'Clear this year' : 'Select the whole year', aria: (full ? 'Clear ' : 'Select all of ') + y,
        pick: () => pgtSetQuarters(C, RD.toggleYear(PGT.effQuarters(C, C.ctx || ctx), y)),
        qs: qs.map((q) => {
          const on = !!effSet[q], imp = !!impSet[q];
          return {
            label: 'Q' + q.slice(-1), aria: F.q(q), on: on ? 'true' : 'false',
            cls: 'pgt-q' + (on ? ' on' : '') + (imp ? ' imp' : '') + (q === nowQ ? ' now' : ''),
            title: imp ? 'Spanned by your selection. Click to select it explicitly.' : on ? 'Click to remove' : 'Click to add',
            pick: () => pgtSetQuarters(C, RD.toggleQuarter(PGT.effQuarters(C, C.ctx || ctx), q))
          };
        })
      };
    });
    const rr = RD.quarterSpanRange(eff);
    const rangeLabel = rr ? (rr.from === rr.to ? F.q(rr.from) : F.q(rr.from) + ' to ' + F.q(rr.to)) : '';
    const none = !(S.pg_quarters || []).length;
    /* ---- chart ---- */
    const rowsN = PGT.flatRows(C, M);
    const lo = M.lo, hi = M.hi;
    const x = (d) => (d - lo) / (hi - lo) * 100;
    const pw = (v) => 'max(' + PGT.r3(v) + '%, 2px)';
    const ticks = PGT.quarterTicks(lo, hi);
    const months = PGT.monthTicks(lo, hi);
    const grid = ticks.filter((t) => t.day >= lo && t.day <= hi).map((t) => ({ cls: 'pgt-gq', style: 'left: ' + PGT.r3(x(t.day)) + '%' }))
      .concat(months.filter((t) => !t.q).map((t) => ({ cls: 'pgt-gm', style: 'left: ' + PGT.r3(x(t.day)) + '%' })));
    /* the quarter that starts before the axis is labelled at its left edge, unless the next
       quarter starts so close that the two labels would collide */
    const axis = ticks.filter((t, i) => t.day >= lo || !ticks[i + 1] || x(ticks[i + 1].day) >= 9)
      .map((t) => ({ cls: 'pgt-ql', style: 'left: ' + PGT.r3(Math.max(0, x(t.day))) + '%', text: t.label }))
      .concat(months.filter((t) => !t.q).map((t) => ({ cls: 'pgt-ml', style: 'left: ' + PGT.r3(Math.max(0, x(t.day))) + '%', text: t.label })));
    const td = ctx.today;
    const todayIn = td >= lo && td <= hi;
    const sel = S.pg_sel && C.isMenu('pgt.pop') ? S.pg_sel : '';
    let y = PGT.H.axis;
    const rows = rowsN.map((n) => {
      const rv = pgtRowVM(C, ctx, M, n, x, pw, sel === n.key, y);
      y += rv.h;
      return rv;
    });
    const rowsH = y;
    const hasGates = rowsN.some((n) => n.entity === 'stagegate');
    const hasMs = rowsN.some((n) => n.entity === 'milestone' || n.entity === 'mstep');
    const hasKb = rowsN.some((n) => n.entity === 'board' || n.entity === 'boardtile');
    let pop = null, minH = 0;
    if (sel) {
      const i = rowsN.findIndex((n) => n.key === sel);
      if (i >= 0) { pop = pgtPopVM(C, ctx, M, rowsN[i], rows[i], rowsH); minH = pop.minH; }
    }
    const lw = K.clamp(Math.round(fin(S.pg_labelw) ? S.pg_labelw : PGT.LDEF), PGT.LMIN, PGT.LMAX);
    const filtered = M.anyFilter || M.activeOnly || !!M.qWin;
    return {
      toolbar: !present,
      levels: levels,
      expandOn: S.pg_level === '' ? 'true' : 'false',
      expandAll: () => C.setState({ pg_col: PGT.collapseMap(M, null), pg_level: '', pg_sel: '', menu: '' }),
      activeOn: S.pg_active ? 'true' : 'false', activeCls: 'chip' + (S.pg_active ? ' on' : ''),
      toggleActive: () => C.setState({ pg_active: !C.state.pg_active, pg_sel: '', menu: '' }),
      hasPaused: nPaused > 0, pausedLabel: nPaused + ' paused',
      pausedOn: S.pg_showPaused ? 'true' : 'false', pausedCls: 'chip' + (S.pg_showPaused ? ' on' : ''),
      pausedTitle: (S.pg_showPaused ? 'Hide' : 'Show') + ' paused and deprioritized milestones. They are kept, and never affect dates or scores.',
      togglePaused: () => { const on = !C.state.pg_showPaused; pgtLS('rd_gantt_showpaused', on ? '1' : '0'); C.setState({ pg_showPaused: on, pg_sel: '', menu: '' }); },
      tfOn: tfOn ? 'true' : 'false', tfCls: 'chip' + (tfOn ? ' on' : ''),
      toggleTf: () => C.setState({ pg_timeframe: !C.state.pg_timeframe, pg_sel: '', menu: '' }),
      tfGridCls: 'pgt-tf' + (tfOn ? '' : ' off'),
      years: years, rangeLabel: rangeLabel,
      tfHintOff: !tfOn, tfHintNone: tfOn && none, tfCanClear: tfOn && !none,
      clearTf: () => { pgtLS('rd_gantt_quarters', '[]'); C.setState({ pg_quarters: [], pg_sel: '', menu: '' }); },
      /* chart */
      empty: !rows.length,
      emptyText: filtered ? 'No matching items to chart. Clear a filter, turn off Active only, or widen the timeframe.' : 'No scheduled, dated items to chart.',
      chartStyle: '--pg-labelw: ' + lw + 'px' + (minH ? '; min-height: ' + minH + 'px' : ''),
      labelw: lw,
      grid: grid, axis: axis, todayIn: todayIn,
      todayStyle: 'left: ' + PGT.r3(x(td)) + '%',
      todayLabel: 'Today, ' + F.day(td),
      rows: rows,
      pop: pop, hasPop: !!pop,
      /* name-column resize: pointer drag on the divider, double-click resets, arrows nudge */
      gripCls: 'pgt-grip' + (S.pg_rz ? ' drag' : ''),
      gripDown: (e) => {
        if (e && e.button != null && e.button !== 0) return;
        try { if (e.preventDefault) e.preventDefault(); if (e.currentTarget && e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
        C.setState({ pg_rz: { x0: (e && e.clientX) || 0, w0: lw } });
      },
      gripMove: (e) => {
        const z = C.state.pg_rz;
        if (!z) return;
        const w = K.clamp(Math.round(z.w0 + (((e && e.clientX) || 0) - z.x0)), PGT.LMIN, PGT.LMAX);
        if (w !== C.state.pg_labelw) C.setState({ pg_labelw: w });
      },
      gripUp: () => { if (C.state.pg_rz) { pgtLS('rd_gantt_labelw', K.clamp(Math.round(C.state.pg_labelw || PGT.LDEF), PGT.LMIN, PGT.LMAX)); C.setState({ pg_rz: null }); } },
      gripReset: () => { pgtLS('rd_gantt_labelw', null); C.setState({ pg_labelw: PGT.LDEF, pg_rz: null }); },
      gripKey: (e) => {
        const k = e && e.key;
        const cur = K.clamp(C.state.pg_labelw || PGT.LDEF, PGT.LMIN, PGT.LMAX);
        if (k === 'ArrowLeft' || k === 'ArrowRight') {
          if (e.preventDefault) e.preventDefault();
          const w = K.clamp(cur + (k === 'ArrowLeft' ? -20 : 20), PGT.LMIN, PGT.LMAX);
          pgtLS('rd_gantt_labelw', w);
          C.setState({ pg_labelw: w });
        } else if (k === 'Home' || k === 'Enter') { pgtLS('rd_gantt_labelw', null); C.setState({ pg_labelw: PGT.LDEF }); }
      },
      /* legend */
      hasGates: hasGates, hasMsLegend: hasMs, hasKb: hasKb,
      canDrag: !ro && !present,
      lo: lo, hi: hi,
      axisTitle: M.custom ? (M.dims.length ? M.dims.map((d) => (PGT.LEVEL_WORD[d] || d).toLowerCase()).join(', ') + ' and objectives' : 'Objectives') : 'Units, divisions, initiatives and objectives'
    };
  }
};
