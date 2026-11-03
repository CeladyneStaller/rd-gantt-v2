// Plan revisions and schedule slip.
//
// A plan revision (Sales' "Build revised plan", a catch-up plan; Execution's "Revise plan", plan versions
// v2 and up) re-dates an objective's remaining work. It never touches a gate that has already passed: you
// cannot reschedule something already done. But the slip was measured over every gate, so a gate that went
// 31 days late kept reporting +31d forever, and a late gate kept pushing the revised dates of the gates
// after it, on top of the delay those dates already allowed for.
//
// October 20, Corey: "a plan revision should be assumed to already capture the 3d delay or mitigation of
// it. The objective may then have a plan to be back on track pending the due date for the last
// stage-gate." So a revision takes in every delay known the day it was committed: a gate passed by then is
// history (no slip, no push), the revised dates hold against what was known, and anything that slips
// after the revision counts and pushes as usual. The same for Execution and Sales; objectives never
// revised are unchanged.
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

  // every gate passed late before the plan: the plan clears the objective entirely
  const allDone = [gate('G1', 2250, 2281), gate('G2', 2255, 2280)];
  ok(slip(allDone, []) > 0, "several late-but-passed gates report slip with no plan (" + slip(allDone, []) + ")");
  ok(slip(allDone, plan()) === 0, "…and none once a plan is enacted after them");
  // a gate the plan re-dated, passing late AFTER the plan: that delay is new, so it counts
  const after = [gate('G1', 2250, 2281), gate('G2', 2284, 2287)];
  ok(slip(after, plan()) === 3, "a gate passing 3 days past its revised date after the plan reports 3d (" + slip(after, plan()) + ")");
  ok(slip([gate('G1', 2250, 2281), gate('G2', 2284, 2284)], plan()) === 0, "…and none when it passes on its revised date");

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

  // a revision covers the whole objective: a gate whose date it left as it was holds too (the plan is to
  // make the time up), as Execution's Revise plan does with every gate it lists
  const partial = run(chained, recommit([{ gateId: 'G3', originalDate: 2556, newDate: 2556, version: 1 }]));
  ok(partial.gateEffective['G2'] === 2480, "a gate the revision kept at its date holds too (" + partial.gateEffective['G2'] + ")");
  ok(partial.gateEffective['G3'] === 2556, "…and so does the re-committed one");

  // a re-commitment to a date already in the past must NOT read as on time
  const stale = [chained[0], { id: 'G2', objectiveId: 'O1', setId: 'S1', plannedDate: 2400, actualDate: null }];
  const past = run(stale, recommit([{ gateId: 'G2', originalDate: 2480, newDate: 2400, version: 1 }]));
  ok(past.gateEffective['G2'] === TD, "a gate re-committed into the PAST still floors at today (" + past.gateEffective['G2'] + ")");
  ok(past.objectiveScheduleSlip['O1'] > 0, "…and still reports slip, so an unrealistic plan is not silently green");

  // no plan: nothing is exempt
  ok(run(chained, []).gateEffective['G2'] === 2511, "with no plan every gate inherits the push as before");

  // after the plan, a NEW delay pushes again (until October 20 a re-committed gate ignored it)
  const later = (td, g2actual) => RD.cascade(P, dd([chained[0], Object.assign({}, chained[1], { actualDate: g2actual }), chained[2]], plan), td);
  const open10 = later(2490, null);
  ok(open10.gateEffective['G2'] === 2490 && open10.gateEffective['G3'] === 2566, "G2 open 10 days past its date pushes G3 10 days (" + open10.gateEffective['G3'] + ")");
  ok(open10.objectiveScheduleSlip['O1'] === 10, "…and the objective is 10 days behind (" + open10.objectiveScheduleSlip['O1'] + ")");
  const passed10 = later(2495, 2490);
  ok(passed10.gateEffective['G3'] === 2566 && passed10.objectiveScheduleSlip['O1'] === 10, "G2 passing 10 days late after the plan pushes G3 the same (" + passed10.gateEffective['G3'] + ", " + passed10.objectiveScheduleSlip['O1'] + "d)");
  const onTime2 = later(2495, 2480);
  ok(onTime2.gateEffective['G3'] === 2556 && onTime2.objectiveScheduleSlip['O1'] === 0, "G2 on its date after the plan: G3 holds, on schedule");
})();

// ---------- Execution's Revise plan: plan versions take delays in the same way ----------
(function () {
  const sets = [{ id: 'S1', objectiveId: 'O1', chained: true }];
  const P = { units: [], divisions: [{ id: 'D', name: 'D', kind: 'rd' }], products: [], models: [], initiatives: [],
    objectives: [{ id: 'O1', statement: 'O', divisionId: 'D', quarter: '2026Q4', plannedStart: 60, plannedEnd: 160 }],
    kpis: [], kpiDefs: [], kpiUpdates: [], catchupPlans: [] };
  // SG1 planned day 95, passed day 98 (3 days late); SG2 to SG5 every 10 days from 110; today 100
  const base = () => [['SG1', 95, 98], ['SG2', 110], ['SG3', 120], ['SG4', 130], ['SG5', 140]]
    .map(([id, d, a], i) => ({ id: id, objectiveId: 'O1', setId: 'S1', name: id, plannedDate: d, actualDate: a == null ? null : a, order: i }));
  const doc = (gates, versions, plans) => ({ D: { objectiveState: [], keyResults: [], kpis: [], kpiUpdates: [], tasks: [], boards: [], risks: [],
    catchupPlans: plans || [], stageGateSets: sets, stageGateEdges: [], chainGatesByDate: {}, etbTrees: {}, stageGates: gates, planVersions: versions || [] } });
  const pv = (v, day) => ({ id: 'PV-O1-' + v, objectiveId: 'O1', v: v, committedDay: day, reason: v === 1 ? 'plan as first committed' : 'revision', snapshot: { sets: [], gates: [], finishDay: 160 } });
  const run = (gates, versions, td, plans) => RD.cascade(P, doc(gates, versions, plans), td == null ? 100 : td);
  const fc = (c) => ['SG2', 'SG3', 'SG4', 'SG5'].map((id) => c.gateEffective[id]);

  const none = run(base(), []);
  ok(JSON.stringify(fc(none)) === JSON.stringify([113, 123, 133, 143]) && none.objectiveScheduleSlip['O1'] === 3, "no revision: SG1's 3 days push SG2 to SG5 and the objective is 3d behind");
  ok(JSON.stringify(fc(run(base(), [pv(1, 100)]))) === JSON.stringify([113, 123, 133, 143]), "v1 alone (the plan as first committed) is not a revision");

  // Corey's question: SG2 to SG5 moved out 3 days in v2. Until October 20 they forecast 3 days past the new
  // dates (6 past the original) and the objective stayed 3 days behind.
  const shifted = base(); shifted.slice(1).forEach((g) => { g.plannedDate += 3; });
  const v2 = run(shifted, [pv(1, 100), pv(2, 100)]);
  ok(JSON.stringify(fc(v2)) === JSON.stringify([113, 123, 133, 143]), "v2 moved SG2 to SG5 out 3 days: they hold their new dates (" + fc(v2).join(', ') + ")");
  ok(v2.objectiveScheduleSlip['O1'] === 0 && v2.objectiveWorkForecast['O1'] === 143, "…and the objective is back on schedule, finishing on SG5's date");
  ok(v2.objectiveRevisionDay['O1'] === 100, "the cascade reports the revision day");

  // or v2 keeps the dates: the plan is to make the 3 days up
  const kept = run(base(), [pv(1, 100), pv(2, 100)]);
  ok(JSON.stringify(fc(kept)) === JSON.stringify([110, 120, 130, 140]) && kept.objectiveScheduleSlip['O1'] === 0, "v2 keeping the dates: they hold, on schedule (" + fc(kept).join(', ') + ")");

  // SG1 itself is history either way: still 3 days late
  ok(v2.gateEffective['SG1'] === 98 && RD.classifyGate(shifted[0], 100) === 'passed-late', "SG1 still passed late on day 98");

  // after v2, SG2 passing 2 days past its revised date pushes SG3 to SG5 again
  const late2 = shifted.map((g) => Object.assign({}, g)); late2[1].actualDate = 115;
  const after = run(late2, [pv(1, 100), pv(2, 100)], 116);
  ok(JSON.stringify(fc(after).slice(1)) === JSON.stringify([125, 135, 145]) && after.objectiveScheduleSlip['O1'] === 2, "after v2, SG2 passing 2 days late pushes the rest 2 days (" + fc(after).slice(1).join(', ') + "; " + after.objectiveScheduleSlip['O1'] + "d)");

  // a delay before the revision but after SG1: v2 on day 100 knew SG1, not the overrun of a revision on day 96
  const early = run(shifted, [pv(1, 96), pv(2, 96)]);
  ok(JSON.stringify(fc(early)) === JSON.stringify([115, 125, 135, 145]), "a revision committed before SG1 passed late: SG1's 2 days past day 96 still push (" + fc(early).join(', ') + ")");

  // an open gate overdue at the revision, left at its date: only what it slips after the revision pushes.
  // SG2 was due day 97 and still open when v2 (day 100) moved SG3 from 120 to 123, the usual 23 days after
  // day 100; on day 104 SG2 is still open: SG3 is 4 days late (104 + 23), not 7 (104 - 97)
  const od = base().map((g) => Object.assign({}, g)); od[1].plannedDate = 97; od[1].actualDate = null; od[0].actualDate = 95;
  od[2].plannedDate = 123;
  const odRun = run(od, [pv(1, 100), pv(2, 100)], 104);
  ok(odRun.gateEffective['SG2'] === 104 && odRun.gateEffective['SG3'] === 127, "SG2 overdue at v2 and still open 4 days later pushes SG3 4 days, not 7 (" + odRun.gateEffective['SG3'] + ")");
  ok(RD.classifyGate(od[1], 104) === 'overdue', "…while SG2 itself is overdue against the date it kept");

  // the latest revision counts, of either kind
  const cu = [{ id: 'catchup:O1', objectiveId: 'O1', enactedDay: 99, gates: [] }];
  ok(RD.planRevisionDay(doc(base(), [pv(1, 90), pv(2, 90)], cu).D, 'O1') === 99, "a re-commit after v2 is the latest revision");
  ok(JSON.stringify(RD.planRevision(doc(base(), [pv(1, 90), pv(2, 100)], cu).D, 'O1')) === JSON.stringify({ day: 100, v: 2, kind: 'version' }), "…and v2 after a re-commit is: {day, v, kind}");
  ok(RD.planRevision(doc(base(), [pv(1, 90)], []).D, 'O1') === null && RD.planRevision(doc(base(), [], []).D, 'O1') === null, "no revision: null");

  // a committed (locked) gate still holds against every push, as before
  const lk = base(); lk[1].locked = true; lk[1].baselineDate = 110;
  ok(run(lk, []).gateEffective['SG2'] === 110, "a locked gate is not pushed, with or without a revision");
})();

// ---------- a gate in another objective (an explicit edge) ----------
(function () {
  const P = { units: [], divisions: [{ id: 'D', name: 'D', kind: 'rd' }], products: [], models: [], initiatives: [],
    objectives: [{ id: 'A', statement: 'A', divisionId: 'D', quarter: '2026Q4', plannedStart: 60, plannedEnd: 160 },
                 { id: 'B', statement: 'B', divisionId: 'D', quarter: '2026Q4', plannedStart: 60, plannedEnd: 160 }],
    kpis: [], kpiDefs: [], kpiUpdates: [], catchupPlans: [] };
  const gates = [{ id: 'A1', objectiveId: 'A', plannedDate: 90, actualDate: 96 },          // 6 days late
                 { id: 'B1', objectiveId: 'B', plannedDate: 100, actualDate: null }];
  const edges = [{ fromGate: 'A1', toGate: 'B1', lagDays: 10 }];                           // B1 at least 10 days after A1
  const doc = (versions) => ({ D: { objectiveState: [], keyResults: [], kpis: [], kpiUpdates: [], tasks: [], boards: [], risks: [], catchupPlans: [],
    stageGateSets: [], stageGateEdges: edges, chainGatesByDate: {}, etbTrees: {}, stageGates: gates, planVersions: versions } });
  const pv = (v, day) => ({ id: 'PV-B-' + v, objectiveId: 'B', v: v, committedDay: day, snapshot: { sets: [], gates: [], finishDay: 160 } });
  ok(RD.cascade(P, doc([]), 98).gateEffective['B1'] === 106, "B never revised: A1's 6 days push B1 (106)");
  ok(RD.cascade(P, doc([pv(1, 97), pv(2, 97)]), 98).gateEffective['B1'] === 100, "B revised after A1 passed: B1 holds its date (the revision took A1 in)");
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} plan revision and slip assertions green`);
process.exit(fails.length ? 1 : 0);
