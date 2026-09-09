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

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} catch-up slip assertions green`);
process.exit(fails.length ? 1 : 0);
