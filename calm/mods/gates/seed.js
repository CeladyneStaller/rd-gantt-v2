/* ============================================================================
   Stage-gates seed (X-gates). Runs on every fresh load (and "Restore the sample
   data"), after the KPI and KR seeds. Self-contained on purpose: it must never
   depend on mods/gates/mod.js, so a stubbed module can't break the board.

   1. Load clean-up exactly like today's migrateStageGateSets: an objective that
      has gates but no workstream gets "General", and a gate with a missing or
      unknown setId joins its objective's first workstream. Today's load ALSO
      forces every workstream back to chained; Calm does not (the setting sticks).
   2. Plan history (Execution): "Qualify the 10-cell short stack" has v1 (as first
      committed) and v2 (500 h screen and 1,000 h hold moved a week, failure-mode
      review added), so history, compare and gate change marks are visible at
      once. "Run full roll-to-roll membrane production" has a v1 only, so the next
      commit there is v2.
   3. Legacy catch-up plans (the old date-only re-commit): one in Execution
      ("Lock Tera 25-30-R5 components") and one in Sales ("Close three utility
      pilot agreements"). Each re-committed date equals the gate's current planned
      date, so no shared gate data changes.
   4. Auto-pass on load, as today's first render does: a gate with no passed date
      whose readiness is exactly 100 is passed today ("Targets achieved"). The
      sample has none, so this changes nothing unless the data does.
   ========================================================================== */
function seed_gates(S) {
  try {
    var day = function (iso) { return calmDay(iso); };
    var docs = S.docs || {};
    var P = S.portfolio || {};

    /* 1. clean-up on load (without today's reset to chained) */
    Object.keys(docs).forEach(function (key) {
      var x = docs[key];
      if (!x) return;
      ['stageGateSets', 'stageGates', 'stageGateEdges', 'planVersions', 'catchupPlans', 'kpis', 'kpiUpdates'].forEach(function (f) {
        if (!Array.isArray(x[f])) x[f] = [];
      });
      if (!x.gateMode || typeof x.gateMode !== 'object') x.gateMode = {};
      var objIds = [];
      x.stageGates.forEach(function (g) { if (g && objIds.indexOf(g.objectiveId) < 0) objIds.push(g.objectiveId); });
      objIds.forEach(function (objId) {
        var sets = x.stageGateSets.filter(function (s) { return s && s.objectiveId === objId; });
        if (!sets.length) {
          var set = { id: RD.allocId('stageGateSet', objId, x.stageGateSets.map(function (s) { return s.id; })), objectiveId: objId, name: 'General', order: 0, chained: true };
          x.stageGateSets.push(set);
          sets = [set];
        }
        var ids = sets.map(function (s) { return s.id; });
        x.stageGates.forEach(function (g) {
          if (g && g.objectiveId === objId && (!g.setId || ids.indexOf(g.setId) < 0)) g.setId = sets[0].id;
        });
      });
    });

    var EL = docs['EXEC-DIV-EL'], FC = docs['EXEC-DIV-FC'], BD = docs['BIZ-DIV-BD'];

    /* 2. plan versions */
    var EL1 = 'OBJ-EL-2026Q4-01';
    if (EL && !RD.planVersionsOf(EL, EL1).length && (EL.stageGates || []).some(function (g) { return g.objectiveId === EL1; })) {
      var v2 = RD.capturePlanSnapshot(EL, P, EL1);
      var v1 = JSON.parse(JSON.stringify(v2));
      v1.gates = v1.gates.filter(function (g) { return g.id !== 'SG-EL-2026Q4-01-5'; });
      v1.gates.forEach(function (g) {
        if (g.id === 'SG-EL-2026Q4-01-2') g.plannedDate = day('2026-11-06');
        if (g.id === 'SG-EL-2026Q4-01-3') g.plannedDate = day('2026-12-11');
        g.actualDate = null;                      // committed before the stack was built
      });
      EL.planVersions.push({ id: 'PV-' + EL1 + '-1', objectiveId: EL1, v: 1, committedDay: day('2026-09-28'), reason: 'plan as first committed', snapshot: v1 });
      EL.planVersions.push({ id: 'PV-' + EL1 + '-2', objectiveId: EL1, v: 2, committedDay: day('2026-10-06'),
        reason: 'The leak-test rebuild pushed the 500 h screen a week; added a failure-mode review before close-out.', snapshot: v2 });
    }
    var FC1 = 'OBJ-FC-2026Q4-01';
    if (FC && !RD.planVersionsOf(FC, FC1).length && (FC.stageGates || []).some(function (g) { return g.objectiveId === FC1; })) {
      var snap = RD.capturePlanSnapshot(FC, P, FC1);
      snap.gates.forEach(function (g) { if (g.actualDate != null && g.actualDate > day('2026-09-30')) g.actualDate = null; });
      FC.planVersions.push({ id: 'PV-' + FC1 + '-1', objectiveId: FC1, v: 1, committedDay: day('2026-09-30'), reason: 'plan as first committed', snapshot: snap });
    }

    /* 3. legacy catch-up plans (re-committed date = the gate's current planned date) */
    var addPlan = function (doc, objId, enacted, gateId, origIso, newIso) {
      if (!doc || doc.catchupPlans.some(function (p) { return p && p.objectiveId === objId; })) return;
      var g = (doc.stageGates || []).find(function (x) { return x.id === gateId; });
      if (!g || g.plannedDate !== day(newIso)) return;
      doc.catchupPlans.push({ id: 'catchup:' + objId, objectiveId: objId, enactedDay: day(enacted),
        gates: [{ gateId: gateId, originalDate: day(origIso), newDate: day(newIso), version: 1 }] });
    };
    addPlan(EL, 'OBJ-EL-2026Q4-02', '2026-09-22', 'SG-EL-2026Q4-02-3', '2026-11-13', '2026-11-20');
    addPlan(BD, 'OBJ-BD-2026Q4-01', '2026-10-02', 'SG-BD-2026Q4-01-2', '2026-10-30', '2026-11-06');

    /* a pass criterion on a Sales gate (the sample's Sales gates had none, so Sales readiness was blank):
       every pilot site needs an interconnection study plan; Teton Valley has one so far */
    var SGB = 'SG-BD-2026Q4-01-2';
    if (BD && (BD.stageGates || []).some(function (g) { return g.id === SGB; }) &&
        !(BD.kpis || []).some(function (k) { return k.hostType === 'stageGate' && k.hostId === SGB; })) {
      BD.kpis.push({ id: 'KPI-BD-2026Q4-01-3-1', objectiveId: 'OBJ-BD-2026Q4-01', hostType: 'stageGate', hostId: SGB, name: 'Pilot sites with a study plan',
        targetType: 'demonstration', direction: 'up', target: 3, unit: 'sites', groupId: null, isDefiner: true, order: 0 });
      BD.kpiUpdates.push({ id: 'UPD-BD-SITE-1', kpiId: 'KPI-BD-2026Q4-01-3-1', value: 1, timestamp: calmTs('2026-10-09T17:00:00Z'), note: 'Teton Valley Utility study plan agreed' });
    }

    /* 4. auto-pass on load */
    Object.keys(docs).forEach(function (key) {
      var doc = docs[key];
      if (!doc || !(doc.stageGates || []).length) return;
      var m = {};
      m[String(key).replace(/^[A-Z]+-/, '')] = doc;
      var em = RD.withPortfolio(P, m);
      doc.stageGates.forEach(function (g) {
        if (g && g.actualDate == null && RD.gateAtTarget(g.id, em)) { g.actualDate = S.today; g.completionMethod = 'auto'; }
      });
    });
  } catch (e) {
    if (typeof console !== 'undefined') console.error('[calm] seed_gates failed', e);
  }
}
