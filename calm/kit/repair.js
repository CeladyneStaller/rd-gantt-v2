/* ============================================================================
   Calm kit: load-time repairs for documents read from the broker (live builds).
   The same clean-up today's apps run when they adopt a document, so stored data that predates a field
   or a rule reads the way the modules expect. The sample (data/sample.js plus the seeds) already
   carries these repairs; test/sc_repair.js checks that running them on the sample changes nothing.

     REPAIR.blank(kind)                 an empty document: 'portfolio' | 'exec' | 'spec'
     REPAIR.portfolio(P)                missing lists filled (today's blankPortfolio merge)
     REPAIR.exec(doc)                   missing lists filled (blankExec), workstream clean-up
                                        (migrateStageGateSets without today's forced chaining: the
                                        Independent setting sticks), FMEA problems reshaped
                                        (RD.migrateProblem), milestone step due dates as ISO strings
     REPAIR.spec(doc)                   missing lists, legacy KPI links and host types, colliding
                                        ids renumbered (today's L356–384); returns true if ids moved
     REPAIR.autoPass(doc, divId, P, today)
                                        a gate with no passed date whose targets are all met is passed
                                        today ("auto"), as today's first render does. Returns the
                                        number of gates passed. This one is a real change and is saved.
   Structural repairs are not saved on their own: they go out with the next real change, as today.
   ========================================================================== */
const REPAIR = (function () {
  function arr(o, keys) { keys.forEach((k) => { if (!Array.isArray(o[k])) o[k] = []; }); }
  function obj(o, keys) { keys.forEach((k) => { if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {}; }); }
  const PORTFOLIO_LISTS = ['units', 'divisions', 'products', 'models', 'initiatives', 'milestones', 'milestoneEdges', 'objectives', 'objectiveEdges', 'kpis', 'kpiDefs', 'kpiUpdates', 'composition'];
  const EXEC_LISTS = ['objectiveState', 'keyResults', 'kpis', 'stageGates', 'tasks', 'boards', 'planVersions', 'kpiUpdates', 'stageGateEdges', 'risks', 'stageGateSets', 'catchupPlans'];
  const EXEC_MAPS = ['gateMode', 'chainGatesByDate', 'etbTrees'];
  const SPEC_LISTS = ['keyResults', 'stageGates', 'kpis', 'kpiUpdates'];

  function blank(kind) {
    const o = {};
    if (kind === 'portfolio') arr(o, PORTFOLIO_LISTS);
    else if (kind === 'spec') { arr(o, SPEC_LISTS); o.modelSpec = {}; }
    else { arr(o, EXEC_LISTS); obj(o, EXEC_MAPS); }
    return o;
  }
  function portfolio(P) {
    if (!P || typeof P !== 'object') return;
    arr(P, PORTFOLIO_LISTS);
  }
  function exec(x) {
    if (!x || typeof x !== 'object') return;
    arr(x, EXEC_LISTS);
    obj(x, EXEC_MAPS);
    /* migrateStageGateSets, without forcing every workstream back to chained */
    const objIds = [];
    x.stageGates.forEach((g) => { if (g && objIds.indexOf(g.objectiveId) < 0) objIds.push(g.objectiveId); });
    objIds.forEach((objId) => {
      let sets = x.stageGateSets.filter((s) => s && s.objectiveId === objId);
      if (!sets.length) {
        const set = { id: RD.allocId('stageGateSet', objId, x.stageGateSets.map((s) => s.id)), objectiveId: objId, name: 'General', order: 0, chained: true };
        x.stageGateSets.push(set);
        sets = [set];
      }
      const ids = sets.map((s) => s.id);
      x.stageGates.forEach((g) => { if (g && g.objectiveId === objId && (!g.setId || ids.indexOf(g.setId) < 0)) g.setId = sets[0].id; });
    });
    x.risks = x.risks.map(RD.migrateProblem);
    /* milestone steps keep their due date as an ISO string ('' when undated), as the live apps store it */
    const EPOCH = Date.UTC(2020, 0, 1);
    x.keyResults.forEach((kr) => {
      ((kr && kr.steps) || []).forEach((st) => {
        if (!st) return;
        if (typeof st.due === 'number' && isFinite(st.due)) st.due = new Date(EPOCH + st.due * 86400000).toISOString().slice(0, 10);
        else if (st.due == null) st.due = '';
      });
    });
  }
  function spec(doc) {
    if (!doc || typeof doc !== 'object') return false;
    arr(doc, SPEC_LISTS);
    if (!doc.modelSpec || typeof doc.modelSpec !== 'object' || Array.isArray(doc.modelSpec)) doc.modelSpec = {};
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
  function autoPass(doc, divId, P, today) {
    if (!doc || !(doc.stageGates || []).length) return 0;
    const m = {};
    m[divId] = doc;
    const em = RD.withPortfolio(P, m);
    let n = 0;
    doc.stageGates.forEach((g) => {
      if (g && g.actualDate == null && RD.gateAtTarget(g.id, em)) { g.actualDate = today; g.completionMethod = 'auto'; n++; }
    });
    return n;
  }
  return { blank: blank, portfolio: portfolio, exec: exec, spec: spec, autoPass: autoPass, PORTFOLIO_LISTS: PORTFOLIO_LISTS, EXEC_LISTS: EXEC_LISTS };
})();
