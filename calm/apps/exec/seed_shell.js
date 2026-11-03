/* Execution / Sales shell seed (runs after the module seeds).
   1. Sales maintenance demo: a second business division, Partnerships, whose document still holds the
      execution data of an objective that Planning has since moved to Business Development ("Build the
      Q1 hydrogen-hub pipeline"). Sales > Settings > Maintenance > "Recover stranded execution data"
      finds it and moves it into BIZ-DIV-BD. Execution lists only R&D divisions, so it never shows it.
   2. Schedule alarm demo (slip over 10 days, "Build revised plan"): one started-late task each.
      Execution: "Root-cause AST degradation" (the 30k-cycle AST started late, 10% done) runs 18 days
      past its own planned work. Sales: the Q1 hub pipeline's prep task (shortlisting applicants) is
      overdue, 18 days. Task ids are allocated across every document so nothing collides on recovery. */
function seed_shell(S) {
  var D = calmDay, TS = calmTs;
  var P = S.portfolio;
  if (!P.divisions.some(function (d) { return d.id === 'DIV-PT'; })) {
    P.divisions.push({ id: 'DIV-PT', name: 'Partnerships', kind: 'biz', unitId: 'UNIT-BUSINE', order: 4 });
  }
  if (!S.docs['BIZ-DIV-PT']) {
    S.docs['BIZ-DIV-PT'] = {
      keyResults: [
        { id: 'KR-BD-2027Q1-01-1', objectiveId: 'OBJ-BD-2027Q1-01', statement: 'Qualify ten hydrogen-hub leads', trackingType: 'kpi' }
      ],
      kpis: [
        { id: 'KPI-BD-2027Q1-01-1-1', objectiveId: 'OBJ-BD-2027Q1-01', hostType: 'keyResult', hostId: 'KR-BD-2027Q1-01-1', name: 'Qualified hub leads', targetType: 'demonstration', direction: 'up', target: 10, unit: 'leads', order: 0 }
      ],
      kpiUpdates: [
        { id: 'UPD-HL-1', kpiId: 'KPI-BD-2027Q1-01-1-1', value: 4, timestamp: TS('2026-09-22T17:00:00Z'), note: 'Logged before the objective moved to Business Development' }
      ],
      stageGateSets: [
        { id: 'SGSET-BD-2027Q1-01-1', objectiveId: 'OBJ-BD-2027Q1-01', name: 'Hub outreach', order: 0, chained: true }
      ],
      stageGates: [
        { id: 'SG-BD-2027Q1-01-1', objectiveId: 'OBJ-BD-2027Q1-01', setId: 'SGSET-BD-2027Q1-01-1', name: 'Hub partner shortlist agreed', intention: 'Five hub applicants agree to a joint pilot proposal.', gate_id: '', plannedDate: D('2027-01-29'), actualDate: null, status: 'pending', order: 0 }
      ],
      stageGateEdges: [],
      tasks: [
        { id: 'TSK-BD-2027Q1-01-1', objectiveId: 'OBJ-BD-2027Q1-01', name: 'Map the regional hydrogen-hub applicants', plannedStart: D('2027-01-04'), plannedEnd: D('2027-01-22'), percentComplete: 0, actualStart: null, actualEnd: null }
      ],
      boards: [], risks: [], planVersions: [], catchupPlans: [], objectiveState: [],
      gateMode: {}, chainGatesByDate: {}, etbTrees: {}
    };
  }

  var taskIds = [];
  Object.keys(S.docs).forEach(function (k) { ((S.docs[k] && S.docs[k].tasks) || []).forEach(function (t) { if (t && t.id) taskIds.push(t.id); }); });
  function addLateTask(key, objId, name, start, end, pct, actualStart) {
    var doc = S.docs[key];
    if (!doc || !P.objectives.some(function (o) { return o.id === objId; })) return;
    if (!Array.isArray(doc.tasks)) doc.tasks = [];
    if (doc.tasks.some(function (t) { return t && t.objectiveId === objId && t.name === name; })) return;
    var id = RD.allocId('task', objId, taskIds);
    taskIds.push(id);
    doc.tasks.push({ id: id, objectiveId: objId, name: name, plannedStart: D(start), plannedEnd: D(end), percentComplete: pct, actualStart: D(actualStart), actualEnd: null });
  }
  addLateTask('EXEC-DIV-FC', 'OBJ-FC-2026Q4-02', 'Run the 30k-cycle AST on the baseline MEA', '2026-09-14', '2026-11-06', 10, '2026-09-16');
  addLateTask('BIZ-DIV-BD', 'OBJ-BD-2027Q1-01', 'Shortlist the regional hydrogen-hub applicants', '2026-09-21', '2026-10-09', 25, '2026-09-23');
}
