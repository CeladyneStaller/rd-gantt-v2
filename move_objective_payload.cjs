// moveObjectivePayload — moves an objective's ENTIRE execution payload between two exec docs.
// Used by the sales app's "recover stranded data" (objective moved divisions; its artifacts stayed in the
// old bin). Pure + immutable: returns fresh {fromDoc, toDoc}. Moves direct (by objectiveId), indirect
// (kpiUpdates by kpiId, gate edges by endpoint), and map-keyed (gateMode/etbTrees by objId) artifacts.
const C = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

// a "from" doc holding artifacts for TWO objectives (O1 = to move, O2 = must stay put)
function fromDoc() {
  return {
    keyResults: [
      { id: 'KR1', objectiveId: 'O1', statement: 'a' },
      { id: 'KR2', objectiveId: 'O1', trackingType: 'milestone', steps: [{ id: 's', due: '2026-01-01', completion: 0 }] },
      { id: 'KRX', objectiveId: 'O2', statement: 'other' },
    ],
    kpis: [
      { id: 'K1', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KR1' },
      { id: 'KX', objectiveId: 'O2', hostType: 'keyResult', hostId: 'KRX' },
    ],
    kpiUpdates: [
      { id: 'U1', kpiId: 'K1', value: 3 },
      { id: 'U2', kpiId: 'K1', value: 4 },
      { id: 'UX', kpiId: 'KX', value: 9 },   // belongs to O2's KPI -> must stay
    ],
    stageGates: [
      { id: 'G1', objectiveId: 'O1', name: 'gate1' },
      { id: 'G2', objectiveId: 'O1', name: 'gate2' },
      { id: 'GX', objectiveId: 'O2', name: 'other gate' },
    ],
    stageGateEdges: [
      { fromGate: 'G1', toGate: 'G2', lagDays: 3 },   // both moved -> move
      { fromGate: 'G2', toGate: 'GX', lagDays: 1 },   // touches a moved gate -> move
      { fromGate: 'GX', toGate: 'GX', lagDays: 0 },   // neither moved -> stay
    ],
    tasks: [{ id: 'T1', objectiveId: 'O1' }, { id: 'TX', objectiveId: 'O2' }],
    boards: [{ id: 'B1', objectiveId: 'O1', columns: [], swimlanes: [], tiles: [] }, { id: 'BX', objectiveId: 'O2' }],
    risks: [{ id: 'R1', objectiveId: 'O1' }, { id: 'RX', objectiveId: 'O2' }],
    catchupPlans: [{ id: 'catchup:O1', objectiveId: 'O1' }, { id: 'catchup:O2', objectiveId: 'O2' }],
    objectiveState: [{ objectiveId: 'O1', status: 'achieved' }, { objectiveId: 'O2', status: 'active' }],
    stageGateSets: [{ id: 'SET1', objectiveId: 'O1' }, { id: 'SETX', objectiveId: 'O2' }],
    gateMode: { O1: 'kanban', O2: 'classic' },
    etbTrees: { O1: { project_id: 'O1', experiments: {} }, O2: { project_id: 'O2' } },
    chainGatesByDate: { G1: { d: 1 }, GX: { d: 2 } },
  };
}

// ---------- the move ----------
(function () {
  const r = C.moveObjectivePayload(fromDoc(), {}, 'O1');
  const f = r.fromDoc, t = r.toDoc;

  // direct arrays: O1 artifacts left `from`, landed in `to`; O2 untouched in `from`
  ok(t.keyResults.length === 2 && f.keyResults.length === 1, 'KRs: O1 (2) moved, O2 (1) stayed');
  ok(f.keyResults[0].id === 'KRX', 'the remaining KR is O2 (KRX)');
  ok(t.kpis.length === 1 && f.kpis.length === 1, 'KPIs: O1 KPI moved, O2 KPI stayed');
  ok(t.stageGates.length === 2 && f.stageGates.length === 1, 'stage-gates: O1 (2) moved, O2 (1) stayed');
  ok(t.tasks.length === 1 && t.boards.length === 1 && t.risks.length === 1, 'tasks + boards + risks moved');
  ok(t.catchupPlans.length === 1 && t.objectiveState.length === 1 && t.stageGateSets.length === 1, 'catch-up + objectiveState + gate-sets moved');
  ok(f.risks[0].id === 'RX' && f.tasks[0].id === 'TX', 'O2 risks/tasks stayed put');

  // indirect: kpiUpdates by kpiId
  ok(t.kpiUpdates.length === 2 && t.kpiUpdates.every(u => u.kpiId === 'K1'), 'kpiUpdates for the moved KPI (2) moved');
  ok(f.kpiUpdates.length === 1 && f.kpiUpdates[0].kpiId === 'KX', 'the O2 KPI update stayed');

  // indirect: gate edges touching a moved gate
  ok(t.stageGateEdges.length === 2, 'gate edges touching a moved gate (2) moved');
  ok(f.stageGateEdges.length === 1 && f.stageGateEdges[0].fromGate === 'GX', 'the GX->GX edge (neither moved) stayed');

  // map-keyed: gateMode + etbTree + chainGatesByDate
  ok(t.gateMode.O1 === 'kanban' && !('O1' in f.gateMode), 'gateMode[O1] moved');
  ok(f.gateMode.O2 === 'classic', 'gateMode[O2] stayed');
  ok(t.etbTrees.O1 && t.etbTrees.O1.project_id === 'O1' && !('O1' in f.etbTrees), 'the O1 ETB tree moved');
  ok(f.etbTrees.O2 && !('O2' in t.etbTrees), 'the O2 ETB tree stayed');
  ok(t.chainGatesByDate.G1 && !('G1' in f.chainGatesByDate), 'chainGatesByDate for a moved gate moved');
  ok(f.chainGatesByDate.GX && !('GX' in t.chainGatesByDate), 'chainGatesByDate for an unmoved gate stayed');

  // immutability: the inputs are untouched
  const src = fromDoc();
  C.moveObjectivePayload(src, {}, 'O1');
  ok(src.keyResults.length === 3, 'the input fromDoc is NOT mutated (still has all 3 KRs)');
})();

// ---------- merging into a non-empty target ----------
(function () {
  const to = { keyResults: [{ id: 'PRE', objectiveId: 'O9' }], kpis: [] };
  const r = C.moveObjectivePayload(fromDoc(), to, 'O1');
  ok(r.toDoc.keyResults.length === 3, 'moving into a non-empty doc APPENDS (1 pre-existing + 2 moved)');
  ok(r.toDoc.keyResults.some(k => k.id === 'PRE'), 'the target\'s existing artifacts are preserved');
})();

// ---------- de-duplication: re-running is idempotent (no doubles) ----------
(function () {
  const r1 = C.moveObjectivePayload(fromDoc(), {}, 'O1');
  // simulate a partial state: the target already has KR1; the source still has it (a retry)
  const src2 = fromDoc();
  const r2 = C.moveObjectivePayload(src2, { keyResults: [{ id: 'KR1', objectiveId: 'O1' }] }, 'O1');
  const krIds = r2.toDoc.keyResults.map(k => k.id).filter(id => id === 'KR1');
  ok(krIds.length === 1, 'an id already present in the target is not added twice (safe to retry)');
})();

// ---------- nothing to move ----------
(function () {
  const r = C.moveObjectivePayload(fromDoc(), {}, 'NOPE');
  ok(r.toDoc.keyResults.length === 0 && r.fromDoc.keyResults.length === 3, 'moving a non-existent objective moves nothing');
  // counts helper
  const c = C.objectivePayloadCounts(fromDoc(), 'O1');
  ok(c.keyResults === 2 && c.kpis === 1 && c.stageGates === 2 && c.tasks === 1 && c.boards === 1 && c.risks === 1, 'objectivePayloadCounts reports the O1 payload for the preview');
  const c0 = C.objectivePayloadCounts(fromDoc(), 'NOPE');
  ok(c0.keyResults === 0 && c0.stageGates === 0, 'objectivePayloadCounts is 0 for an objective with nothing here');
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} move-objective-payload assertions green`);
process.exit(fails.length ? 1 : 0);
