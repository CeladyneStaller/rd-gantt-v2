// Catch-up plan and schedule slip.
//
// A catch-up plan re-commits an objective's REMAINING work while holding the original finish date. It
// deliberately does not touch a gate that has already passed — you cannot reschedule something already
// done. But the slip was measured over every gate, passed ones included, so a gate that went 31 days
// late kept reporting +31d forever: the schedule card showed the same overrun no matter what the team
// re-committed to, and nothing could ever clear it.
//
// Once a plan is enacted, slip is measured over OUTSTANDING work only. This is scoped to objectives
// with an active plan; everywhere else every gate still counts.
const RD = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const TODAY = 2290, PLANNED_END = 2300;
const portfolio = {
  units: [], divisions: [{ id: 'D', name: 'D', kind: 'rd' }], products: [], models: [],
  initiatives: [{ id: 'I', name: 'I', divisionId: 'D' }],
  objectives: [{ id: 'O1', statement: 'O', divisionId: 'D', initiativeId: 'I', quarter: '2026 Q1',
    plannedStart: 2200, plannedEnd: PLANNED_END }],
  kpis: [], kpiDefs: [], kpiUpdates: [], catchupPlans: []
};
const docs = (gates, plans, tasks) => ({ D: {
  objectiveState: [], keyResults: [], kpis: [], kpiUpdates: [], tasks: tasks || [], boards: [],
  risks: [], catchupPlans: plans || [], stageGateSets: [], stageGateEdges: [], chainGatesByDate: {},
  etbTrees: {}, stageGates: gates } });
const gate = (id, planned, actual) => ({ id: id, objectiveId: 'O1', name: id, plannedDate: planned, actualDate: actual == null ? null : actual });
const plan = (gates) => [{ id: 'catchup:O1', objectiveId: 'O1', enactedDay: 2282, gates: gates || [] }];
const slip = (gates, plans, tasks) => RD.cascade(portfolio, docs(gates, plans, tasks), TODAY).objectiveScheduleSlip['O1'];
const fcast = (gates, plans, tasks) => RD.cascade(portfolio, docs(gates, plans, tasks), TODAY).objectiveWorkForecast['O1'];

// ---------- the reported bug ----------
(function () {
  const late = [gate('G1', 2250, 2281)];            // passed 31 days after its planned date
  ok(slip(late, []) === 31, "a gate passed 31d late reports 31d of slip with no plan (" + slip(late, []) + ")");
  ok(slip(late, plan()) === 0, "…and 0 once a catch-up plan is enacted (" + slip(late, plan()) + ")");
  ok(slip(late, []) === 31, "…while an objective WITHOUT a plan is unaffected");
})();

// ---------- outstanding work still counts ----------
(function () {
  const mixed = [gate('G1', 2250, 2281), gate('G2', 2260, null)];   // one passed late, one still open and overdue
  const s = slip(mixed, plan());
  ok(s > 0, "an OUTSTANDING overdue gate still reports slip under a plan (" + s + ")");
  ok(s === 30, "…measured from its own planned date, not the passed gate's (" + s + ")");

  const onTime = [gate('G1', 2250, 2281), gate('G2', 2295, null)];  // open gate not yet due
  ok(slip(onTime, plan()) === 0, "…and an open gate that is not yet late adds none");

  const tasks = [{ id: 'T1', objectiveId: 'O1', plannedEnd: 2260, percentComplete: 0 }];
  ok(slip([gate('G1', 2250, 2281)], plan(), tasks) > 0, "an outstanding TASK still counts under a plan");
})();

// ---------- the forecast follows the same rule ----------
(function () {
  const late = [gate('G1', 2250, 2281)];
  ok(fcast(late, []) === 2281, "with no plan the forecast sits at the late pass date (" + fcast(late, []) + ")");
  ok(fcast(late, plan()) === PLANNED_END,
    "under a plan the forecast returns to the objective's planned end rather than being pushed by history (" + fcast(late, plan()) + ")");
})();

// ---------- shape and edge cases ----------
(function () {
  ok(slip([], plan()) === 0, "an objective with no gates has no slip");
  ok(slip([gate('G1', 2250, 2240)], plan()) === 0, "a gate passed EARLY adds no slip");
  ok(slip([gate('G1', 2250, 2240)], []) === 0, "…with or without a plan");

  // every gate passed, all late: the plan clears the objective entirely
  const allDone = [gate('G1', 2250, 2281), gate('G2', 2255, 2285)];
  ok(slip(allDone, []) > 0, "several late-but-passed gates report slip with no plan (" + slip(allDone, []) + ")");
  ok(slip(allDone, plan()) === 0, "…and none once a plan is enacted");

  // a plan for a DIFFERENT objective must not silence this one
  const other = [{ id: 'catchup:OTHER', objectiveId: 'O-OTHER', enactedDay: 2282, gates: [] }];
  ok(slip([gate('G1', 2250, 2281)], other) === 31, "a plan on another objective does not clear this one's slip");
})();

// ---------- a re-committed gate is exempt from INHERITED chain push ----------
// Chained gates take their lag from the ORIGINAL planned spacing, so one late predecessor pushes every
// downstream gate by the same number of days — permanently. Re-committing those gates changed nothing:
// the chain recomputed their forecast from the predecessor and the card kept reporting the original
// overrun while demanding a plan that already existed. A re-commitment is a deliberate new commitment,
// so it gets the same exemption `locked` already has.
(function () {
  const chained = [
    { id: 'G1', objectiveId: 'O1', setId: 'S1', plannedDate: 2400, actualDate: 2431 },   // 31d late
    { id: 'G2', objectiveId: 'O1', setId: 'S1', plannedDate: 2480, actualDate: null },
    { id: 'G3', objectiveId: 'O1', setId: 'S1', plannedDate: 2556, actualDate: null }
  ];
  const sets = [{ id: 'S1', objectiveId: 'O1', chained: true }];
  const TD = 2443;
  const P = { units: [], divisions: [{ id: 'D', name: 'D', kind: 'rd' }], products: [], models: [],
    initiatives: [{ id: 'I', name: 'I', divisionId: 'D' }],
    objectives: [{ id: 'O1', statement: 'O', divisionId: 'D', initiativeId: 'I', quarter: '2026 Q1', plannedStart: 2300, plannedEnd: 2556 }],
    kpis: [], kpiDefs: [], kpiUpdates: [], catchupPlans: [] };
  const dd = (gates, plans) => ({ D: { objectiveState: [], keyResults: [], kpis: [], kpiUpdates: [], tasks: [],
    boards: [], risks: [], catchupPlans: plans, stageGateSets: sets, stageGateEdges: [], chainGatesByDate: {},
    etbTrees: {}, stageGates: gates } });
  const recommit = (entries) => [{ id: 'catchup:O1', objectiveId: 'O1', enactedDay: 2432, gates: entries }];
  const run = (gates, plans) => RD.cascade(P, dd(gates, plans), TD);

  const before = run(chained, []);
  ok(before.objectiveScheduleSlip['O1'] === 31, "a 31d-late gate pushes the whole chain 31d (" + before.objectiveScheduleSlip['O1'] + ")");
  ok(before.objectiveWorkForecast['O1'] === 2587, "…moving the objective finish past its planned end (" + before.objectiveWorkForecast['O1'] + ")");
  ok(before.gateEffective['G3'] === 2587, "…the last gate carrying the full delay (" + before.gateEffective['G3'] + ")");

  const plan = recommit([{ gateId: 'G2', originalDate: 2480, newDate: 2480, version: 1 },
                         { gateId: 'G3', originalDate: 2556, newDate: 2556, version: 1 }]);
  const after = run(chained, plan);
  ok(after.gateEffective['G2'] === 2480, "a re-committed gate holds its committed date (" + after.gateEffective['G2'] + ")");
  ok(after.gateEffective['G3'] === 2556, "…all the way down the chain (" + after.gateEffective['G3'] + ")");
  ok(after.objectiveWorkForecast['O1'] === 2556, "the finish returns to the planned end (" + after.objectiveWorkForecast['O1'] + ")");
  ok(after.objectiveScheduleSlip['O1'] === 0, "…and the slip clears (" + after.objectiveScheduleSlip['O1'] + ")");
  ok(before.gateEffective['G1'] === after.gateEffective['G1'], "the passed gate itself is untouched — history is not rewritten");

  // a gate the plan did NOT cover still inherits the push
  const partial = run(chained, recommit([{ gateId: 'G3', originalDate: 2556, newDate: 2556, version: 1 }]));
  ok(partial.gateEffective['G2'] === 2511, "a gate the plan did not re-commit still inherits the delay (" + partial.gateEffective['G2'] + ")");
  ok(partial.gateEffective['G3'] === 2556, "…while the re-committed one still holds");

  // a re-commitment to a date already in the past must NOT read as on time
  const stale = [chained[0], { id: 'G2', objectiveId: 'O1', setId: 'S1', plannedDate: 2400, actualDate: null }];
  const past = run(stale, recommit([{ gateId: 'G2', originalDate: 2480, newDate: 2400, version: 1 }]));
  ok(past.gateEffective['G2'] === TD, "a gate re-committed into the PAST still floors at today (" + past.gateEffective['G2'] + ")");
  ok(past.objectiveScheduleSlip['O1'] > 0, "…and still reports slip, so an unrealistic plan is not silently green");

  // no plan: nothing is exempt
  ok(run(chained, []).gateEffective['G2'] === 2511, "with no plan every gate inherits the push as before");
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} catch-up slip assertions green`);
process.exit(fails.length ? 1 : 0);
