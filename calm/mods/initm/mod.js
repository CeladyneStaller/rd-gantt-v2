/* ============================================================================
   Initiative metrics (X-tasks), built into Execution and Sales.
   Today's "Initiative-level metrics · <division>" panel (exec §23, sales §18;
   renderInitPanel / initKpiTableRO): collapsed at start, read-only, one table
   per initiative of the division, in portfolio order. Rows are the portfolio's
   initiative KPIs plus any older ones still defined in this exec doc ("local").

   Each table is the shared KPI table in read-only mode:
     KPI.table(C, ctx, { type: 'initiative', id }, { readOnly: true, canAdd: false })
   rendered with mods/kpi/part-table.html. It computes the values the way
   today's panel does (RD.kpiName / kpiDirection / kpiUnit / effTarget /
   effValue / kpiScoreParts over the exec doc and the portfolio; statistical
   values to 3 decimals; partial math raw x n/N), tags local KPIs "Local" and
   shows today's link count as "Defines N" (counting links made with the link
   editor too; today's count only saw legacy groupId members).
   If the KPI module is missing, a plain read-only table built from the same
   engine calls is used instead.
   ========================================================================== */
(function () {
  /* fallback formatting: today's fmtCur and fmtTarget */
  function fmtCur(cv, isStat) {
    if (cv == null) return '';
    return (isStat && typeof cv === 'number' && isFinite(cv)) ? String(Math.round(cv * 1000) / 1000) : String(cv);
  }
  function withUnit(s, unit) { if (!unit) return s; return /^(%|°)/.test(unit) ? s + unit : s + ' ' + unit; }
  function targetText(def, tgt, dir, unit) {
    if (def && def.targetType === 'binary') return 'Pass';
    if (tgt == null) return '—';
    if (typeof tgt === 'object') return withUnit(String(tgt.lo) + ' to ' + String(tgt.hi), unit);
    return (dir === 'down' ? '≤ ' : dir === 'up' ? '≥ ' : '') + withUnit(String(tgt), unit);
  }
  function kpiApi() { return (typeof KPI !== 'undefined' && KPI && typeof KPI.table === 'function') ? KPI : null; }

  /* plain read-only rows (used only when the KPI module is not in the build) */
  function fallbackRows(ctx, list) {
    const pool = [];
    Object.keys(ctx.em || {}).forEach((key) => { ((ctx.em[key] && ctx.em[key].kpis) || []).forEach((x) => pool.push(x)); });
    const docKpis = (ctx.doc && ctx.doc.kpis) || [];
    return list.map((k) => {
      const def = RD.definerOf(k, pool);
      const unit = RD.kpiUnit(k, pool);
      const p = RD.kpiScoreParts(k, pool, ctx.em);
      const cv = RD.effValue(k, pool, ctx.em);
      const links = docKpis.filter((m) => m.id !== k.id && RD.linkOf(m, pool).parent === k.id).length;
      return {
        id: k.id,
        name: RD.kpiName(k, pool) || 'Unnamed KPI',
        local: docKpis.indexOf(k) >= 0,
        target: targetText(def, RD.effTarget(k, pool), RD.kpiDirection(k, pool), unit),
        current: cv == null ? 'No reading' : withUnit(fmtCur(cv, def && def.targetType === 'statistical'), unit),
        score: F.score(p.score),
        scoreCls: 'st ' + F.tone(F.band(p.score)),
        partial: !!p.partial,
        math: p.partial ? Math.round(p.raw) + ' × ' + p.n + '/' + p.expected + ' samples' : '',
        links: links ? F.plural(links, 'link') : '—'
      };
    });
  }

  MODS.initm = {
    state: { initm_open: false },   // starts collapsed, like today's INIT panel (session only)
    vm(C, ctx) {
      const open = !!C.state.initm_open;
      const P = ctx.P || {};
      const inits = ctx.divId ? (P.initiatives || []).filter((i) => i.divisionId === ctx.divId) : [];
      const mine = ctx.obj ? ctx.obj.initiativeId : null;
      const docKpis = (ctx.doc && ctx.doc.kpis) || [];
      const api = kpiApi();
      let nTargets = 0;
      const blocks = inits.map((I) => {
        const pf = (P.kpis || []).filter((k) => k.hostType === 'initiative' && k.hostId === I.id);
        const legacy = docKpis.filter((k) => k.hostType === 'initiative' && k.hostId === I.id);
        const n = pf.length + legacy.length;
        nTargets += n;
        const show = open && n > 0;
        let kt = null;
        if (show && api) {
          kt = api.table(C, ctx, { type: 'initiative', id: I.id }, { readOnly: true, canAdd: false, key: 'initm:' + I.id, emptyText: 'No targets yet.' });
          /* values only, like today's panel: the shared table's sample view reads this division's
             readings only, so it would show none for these portfolio KPIs (reported to the KPI module) */
          (kt && Array.isArray(kt.rows) ? kt.rows : []).forEach((r) => { if (r && r.viewReads) { r.viewReads = false; r.showStatic = true; } });
        }
        return {
          id: I.id,
          name: I.name || I.id,
          mine: !!mine && I.id === mine,
          countText: F.plural(n, 'target'),
          has: n > 0,
          empty: n === 0,
          useKpi: show && !!api,
          useFallback: show && !api,
          kt: kt,
          rows: show && !api ? fallbackRows(ctx, pf.concat(legacy)) : []
        };
      });
      return {
        ready: true,
        open: open,
        /* on the Overview it shares a row with Latest readings and Current step; opened, it takes a row of its own */
        panelCls: 'panel initm-panel' + (open ? ' open' : ''),
        toggle: () => C.setState({ initm_open: !C.state.initm_open }),
        toggleAria: (open ? 'Hide' : 'Show') + ' initiative metrics',
        chevCls: 'initm-chev' + (open ? ' on' : ''),
        divName: ctx.div ? ctx.div.name : '',
        count: inits.length ? String(inits.length) : '',
        summary: inits.length ? F.plural(inits.length, 'initiative') + ', ' + F.plural(nTargets, 'target') : '',
        none: !inits.length,
        blocks: blocks
      };
    }
  };
})();
