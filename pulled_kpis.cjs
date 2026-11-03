// Pulled KPIs (October 2026): a statistical KPI whose readings are PULLED from other work. Each matching
// objective, key result, stage-gate, workstream, kanban tile, experiment or logic tree gives one reading and
// the KPI's statistic runs over them; the value then scores like any statistical KPI, so key results,
// objectives, gate readiness and auto-pass take it unchanged (effectiveValueEntry).
//
// Every expectation below is worked out by hand from the fixture (percentage key results with known
// progress, gates with known dates, tiles with known columns), never by calling the pull code twice.
const C = require((process.env.RD_SRC || '.') + '/rdcore.js');
let n = 0, f = 0; const ok = (c, m) => { n++; if (!c) { f++; console.log('FAIL:', m); } };
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9;
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + (JSON.stringify(a) === JSON.stringify(b) ? '' : '\n   got  ' + JSON.stringify(a) + '\n   want ' + JSON.stringify(b)));

const day = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(2020, 0, 1)) / 86400000);
const TODAY = day('2026-10-13'), TISO = '2026-10-13';
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ---------------------------------------------------------------- the fixture */
function fixture() {
  const P = {
    divisions: [
      { id: 'D1', name: 'Fuel Cell', kind: 'rd', order: 1 }, { id: 'D2', name: 'Electrolyzer', kind: 'rd', order: 2 },
      { id: 'B1', name: 'Business Development', kind: 'biz', order: 3 }, { id: 'D9', name: 'Not loaded', kind: 'rd', order: 4 }
    ],
    objectives: [
      { id: 'H', divisionId: 'D1', quarter: '2026Q4', statement: 'Technical excellence', owner: ['cto@x'], plannedStart: day('2026-10-01'), plannedEnd: day('2026-12-31'), order: 0 },
      { id: 'O1', divisionId: 'D1', quarter: '2026Q4', statement: 'O1', owner: ['Erin@X'], initiativeId: 'I1', plannedStart: day('2026-10-01'), plannedEnd: day('2026-12-31'), order: 1 },
      { id: 'O4', divisionId: 'D1', quarter: '2026Q4', statement: 'O4 (no key results)', owner: [], order: 2 },
      { id: 'O6', divisionId: 'D1', quarter: '2026Q4', statement: 'O6', owner: ['maya@x'], initiativeId: 'I2', plannedStart: day('2026-10-01'), plannedEnd: day('2026-12-31'), order: 3 },
      { id: 'O2', divisionId: 'D2', quarter: '2026Q4', statement: 'O2', owner: ['erin@x'], initiativeId: 'I1', plannedStart: day('2026-10-01'), plannedEnd: day('2026-12-31'), order: 1 },
      { id: 'O3', divisionId: 'D2', quarter: '2027Q1', statement: 'O3', owner: [], order: 2 },
      { id: 'O5', divisionId: 'B1', quarter: '2026Q4', statement: 'O5', owner: [], order: 1 },
      { id: 'O9', divisionId: 'D9', quarter: '2026Q4', statement: 'O9 (document not loaded)', owner: [], order: 1 }
    ],
    initiatives: [{ id: 'I1', name: 'Init one' }, { id: 'I2', name: 'Init two' }],
    milestones: [], kpis: [], kpiUpdates: []
  };
  const kr = (id, objectiveId, progress, extra) => Object.assign({ id, objectiveId, statement: id, trackingType: 'percentage', progress }, extra || {});
  const docs = {
    D1: {
      keyResults: [{ id: 'KRH', objectiveId: 'H', statement: 'Host KR', trackingType: 'kpi' }, kr('KR1a', 'O1', 90), kr('KR6a', 'O6', 100)],
      kpis: [], kpiUpdates: [],
      stageGateSets: [{ id: 'WS1', objectiveId: 'O1', name: 'Workstream 1', order: 1 }, { id: 'WS2', objectiveId: 'O1', name: 'Workstream 2', order: 2 }],
      stageGates: [
        { id: 'G1', objectiveId: 'O1', setId: 'WS1', name: 'On time', plannedDate: day('2026-10-05'), actualDate: day('2026-10-04') },
        { id: 'G2', objectiveId: 'O1', setId: 'WS1', name: 'Late', plannedDate: day('2026-10-01'), actualDate: day('2026-10-08') },
        { id: 'G3', objectiveId: 'O1', setId: 'WS2', name: 'Overdue', plannedDate: day('2026-10-03'), actualDate: null },
        { id: 'G4', objectiveId: 'O1', setId: 'WS2', name: 'Not due', plannedDate: day('2026-11-20'), actualDate: null },
        { id: 'G5', objectiveId: 'O1', setId: 'WS2', name: 'No date', plannedDate: null, actualDate: null },
        { id: 'G6', objectiveId: 'O1', setId: 'WS1', name: 'Re-baselined', plannedDate: day('2026-10-12'), baselineDate: day('2026-10-02'), actualDate: day('2026-10-06') }
      ],
      boards: [{
        id: 'BRD', objectiveId: 'O1', name: 'Board',
        columns: [{ id: 'c1', name: 'Spec' }, { id: 'c2', name: 'Test' }, { id: 'c3', name: 'Done' }],
        swimlanes: [{ id: 'L1', maxDaysPerCol: 10 }, { id: 'L2', maxDaysPerCol: 0, deadline: '2026-10-01' }],
        tiles: [
          { id: 't1', name: 'Done 3 days ago', col: 'c3', lane: 'L1', enteredCol: '2026-10-10', startDate: '2026-09-20' },
          { id: 't2', name: 'Done 20 days ago', col: 'c3', lane: 'L1', enteredCol: '2026-09-23', startDate: '2026-09-01' },
          { id: 't3', name: 'Done 60 days ago', col: 'c3', lane: 'L1', enteredCol: '2026-08-14', startDate: '2026-07-01' },
          { id: 't4', name: 'Testing 12 days', col: 'c2', lane: 'L1', enteredCol: '2026-10-01' },
          { id: 't5', name: 'Spec 8 days', col: 'c1', lane: 'L1', enteredCol: '2026-10-05' },
          { id: 't6', name: 'Spec 2 days', col: 'c1', lane: 'L1', enteredCol: '2026-10-11' },
          { id: 't7', name: 'Past the lane deadline', col: 'c2', lane: 'L2', enteredCol: '2026-10-12' },
          { id: 't8', name: 'Parked', col: null, lane: null },
          { id: 't9', name: 'Done, no date', col: 'c3', lane: 'L1' },
          { id: 't10', name: 'Done, no start', col: 'c3', lane: 'L1', enteredCol: '2026-10-12' }
        ]
      }],
      etbTrees: {}
    },
    D2: {
      keyResults: [kr('KR2a', 'O2', 40), kr('KR2b', 'O2', 60), kr('KR3a', 'O3', 70)],
      kpis: [], kpiUpdates: [], stageGateSets: [], stageGates: [], boards: [],
      etbTrees: {
        O2: { trees: [
          { tid: 't_a', name: 'Tree A', terminal_types: { target_achieved: { kind: 'success', label: 'Target achieved' } },
            experiments: {
              E1: { code: 'EXP-1', name: 'First', status: 'complete', planned_date: '2026-09-01', completed_date: '2026-10-01', hypothesis_verdict: 'confirmed',
                possible_results: [{ id: 'r1', next_experiment_ids: ['E2'] }], actual_outcome: { result_id: 'r1' } },
              E2: { code: 'EXP-2', name: 'Second', status: 'complete', planned_date: '2026-10-02', completed_date: '2026-10-11', hypothesis_verdict: 'refuted',
                possible_results: [{ id: 'r2', terminal: { type: 'target_achieved' } }], actual_outcome: { result_id: 'r2' } },
              E3: { code: 'EXP-3', name: 'Third', status: 'in_progress', planned_date: '2026-10-03' },
              E4: { code: 'EXP-4', name: 'Ahead of plan', status: 'in_progress', planned_date: '2026-10-20' },
              E5: { code: 'EXP-5', name: 'Planned', status: 'planned', planned_date: '2026-11-01' },
              E6: { code: 'EXP-6', name: 'Old', status: 'complete', completed_date: '2026-06-01', actual_outcome: { result_id: 'inconclusive', next_experiment_ids: [] } }
            } },
          { tid: 't_b', name: 'Tree B', experiments: {
              F1: { code: 'F-1', status: 'complete', completed_date: '2026-10-09', possible_results: [{ id: 'x', terminal: { type: 'conduct_fmea', label: 'To an FMEA' } }], actual_outcome: { result_id: 'x' } }
            } },
          { tid: 't_c', name: 'Tree C', experiments: { G1: { code: 'G-1', status: 'in_progress', planned_date: '2026-10-10' } } }
        ], activeTid: 't_a' }
      }
    },
    B1: { keyResults: [kr('KR5a', 'O5', 55)], kpis: [], kpiUpdates: [], stageGateSets: [], stageGates: [], boards: [], etbTrees: {} }
  };
  return { P, docs };
}
/* a pulled KPI on the host key result (objective H), over objective scores this quarter in R&D unless told otherwise */
function pk(id, statistic, pull, extra) {
  return Object.assign({ id, objectiveId: 'H', hostType: 'keyResult', hostId: 'KRH', groupId: null, isDefiner: true, name: id, targetType: 'statistical',
    statistic, direction: 'up', target: 80, unit: '%',
    pull: Object.assign({ v: 1, each: 'objective', measure: 'score', states: [], window: 'd30', follow: true, exclude: [] }, pull || {},
      { scope: Object.assign({ div: 'rd', quarter: 'current', proj: '', owner: '', narrow: '' }, (pull && pull.scope) || {}) }) }, extra || {});
}
let FX = fixture();
let SRC = null;
const source = () => (SRC = { portfolio: FX.P, docs: FX.docs, today: TODAY, todayIso: TISO });
C.setPullSource(() => SRC);
source();
const R = (k, opts) => C.pulledResult(k, SRC, opts);
const val = (k) => { const r = R(k, { fresh: true }); return r ? r.value : undefined; };
const ids = (r, pred) => r.items.filter(pred || ((x) => x.counts)).map((x) => x.id);
const reset = () => { FX = fixture(); source(); };

/* ---------------------------------------------------------------- objectives: scores and statistics */
{
  // R&D, current quarter (2026Q4): O1 90, O4 no score, O6 100, O2 mean(40, 60) = 50. Not H (holds it), O3 (2027Q1), O5 (biz), O9 (not loaded)
  const xs = [90, 100, 50];
  const r = R(pk('A', 'average'), { fresh: true });
  eq(r.items.map((x) => x.id), ['H', 'O1', 'O4', 'O6', 'O2'], 'objectives in division order, then objective order; O9 (no document here) and other kinds never listed');
  eq(ids(r), ['O1', 'O6', 'O2'], 'counted: the scored ones');
  eq(r.items.filter((x) => !x.counts).map((x) => [x.id, x.why, x.host]), [['H', 'host', true], ['O4', 'noScore', false]], 'its own objective is listed as the host; O4 waits with no score');
  ok(near(r.value, 80) && r.n === 3, 'average of 90, 100, 50 = 80');
  ok(near(val(pk('A', 'median')), 90), 'median 90');
  ok(near(val(pk('A', 'min')), 50) && near(val(pk('A', 'max')), 100), 'min 50, max 100');
  ok(near(val(pk('A', 'sum')), 240), 'total 240');
  ok(near(val(pk('A', 'range')), 50), 'range 50');
  const mu = 80, sd = Math.sqrt(((90 - mu) ** 2 + (100 - mu) ** 2 + (50 - mu) ** 2) / 2);
  ok(near(val(pk('A', 'stddev')), sd), 'standard deviation (sample) ' + sd.toFixed(3));
  ok(near(val(pk('A', 'cv')), 100 * sd / mu), 'CV = sd / mean, in %');
  ok(near(C.computeStat('sum', xs), 240), 'computeStat knows sum');
  /* thresholds: strictly above / below */
  ok(val(pk('A', 'countAbove', null, { threshold: 90 })) === 1, 'count above 90: only 100 (strict)');
  ok(val(pk('A', 'countAbove', null, { threshold: 89.9 })) === 2, 'count above 89.9: 90 and 100');
  ok(val(pk('A', 'countBelow', null, { threshold: 90 })) === 1, 'count below 90: only 50');
  ok(near(val(pk('A', 'shareAbove', null, { threshold: 60 })), 200 / 3), 'share above 60: two of three');
  ok(near(val(pk('A', 'shareBelow', null, { threshold: 60 })), 100 / 3), 'share below 60: one of three');
  ok(val(pk('A', 'countAbove', null, { threshold: '' })) === 3, 'a missing threshold reads 0');
  const hits = R(pk('A', 'countBelow', null, { threshold: 95 }), { fresh: true });
  eq(hits.items.filter((x) => x.hit).map((x) => x.id), ['O1', 'O2'], 'the items past the threshold are flagged (hit)');
  ok(hits.k === 2 && hits.thr === 95, 'k and the threshold travel with the result');
  ok(val(pk('A', 'bogus')) !== undefined && near(val(pk('A', 'bogus')), 80), 'an unknown statistic reads as the kind\'s first (average)');
}

/* ---------------------------------------------------------------- which work */
{
  ok(near(val(pk('A', 'average', { scope: { div: 'D2' } })), 50), 'one division: Electrolyzer, this quarter: O2 only');
  ok(near(val(pk('A', 'average', { scope: { div: 'D2', quarter: '' } })), 60), 'any quarter: O2 50 and O3 70');
  ok(near(val(pk('A', 'average', { scope: { div: 'D2', quarter: 'next' } })), 70), 'next quarter: O3 (2027Q1)');
  ok(near(val(pk('A', 'average', { scope: { quarter: '2027Q1' } })), 70), 'a fixed quarter');
  ok(near(val(pk('A', 'average', { scope: { proj: 'I1' } })), 70), 'one project (I1): O1 90 and O2 50');
  ok(near(val(pk('A', 'average', { scope: { owner: 'erin@x' } })), 70), 'one owner, any case: O1 and O2');
  /* older records hold the owner as one email, not a list (the live portfolio does) */
  FX.P.objectives.find((o) => o.id === 'O2').owner = ' ERIN@x ';
  FX.P.objectives.find((o) => o.id === 'O1').owner = 'Erin@X';
  source();
  ok(near(val(pk('A', 'average', { scope: { owner: 'erin@x' } })), 70), 'an owner held as one email still matches, in any case, spaces trimmed: O1 and O2');
  ok(near(val(pk('A', 'average', { scope: { owner: ' ERIN@X ' } })), 70), 'the scope\'s owner is trimmed and read in any case too');
  ok(near(val(pk('A', 'average', { scope: { owner: 'maya@x' } })), 100), 'a list beside them still works: O6');
  reset();
  ok(near(val(pk('A', 'average', { scope: { div: 'biz' } })), 55), 'every business division: O5');
  const all = R(pk('A', 'average', { scope: { div: 'all' } }), { fresh: true });
  eq(all.items.map((x) => x.id), ['H', 'O1', 'O4', 'O6', 'O2', 'O5'], '"all": every division, R&D and business, in division order');
  ok(near(all.value, 73.75), '"all": 90, 100, 50 and the business division\'s O5 55 = 73.75');
  ok(near(val(pk('A', 'average', { scope: { div: '' } })), 73.75), 'no division given: every division');
  ok(near(val(pk('A', 'average', { scope: { div: 'B1' } })), 55), 'one business division from an R&D host');
  ok(val(pk('A', 'average', { scope: { div: 'D9' } })) === null, 'a division whose document isn\'t loaded: nothing to pull, no value');
  /* left out by hand, or only the picked ones */
  const ex = R(pk('A', 'average', { exclude: ['O1'] }), { fresh: true });
  ok(near(ex.value, 75) && ex.items.find((x) => x.id === 'O1').why === 'hand' && ex.items.find((x) => x.id === 'O1').hand === true, 'left out by hand: O1 listed, not counted (75)');
  const only = R(pk('A', 'average', { follow: false, items: ['O2', 'O6'] }), { fresh: true });
  ok(near(only.value, 75), 'a picked list: O2 and O6 only (75)');
  eq(only.items.filter((x) => x.why === 'notPicked').map((x) => x.id), ['O1', 'O4'], 'the rest listed as not picked (the host stays the host)');
  ok(near(val(pk('A', 'average', { follow: false, items: ['O2'], exclude: ['O2'] })), 50), 'with a picked list, exclude is ignored');
  ok(near(val(pk('A', 'average', { follow: false })), 80), 'follow false without a list: every match (an older record)');
}

/* ---------------------------------------------------------------- business units: any division, of any kind */
{
  // Ops (order 0): Electrolyzer (R&D) and Business Development (business); Tech (order 1): Fuel Cell
  FX.P.units = [{ id: 'U2', name: 'Tech', order: 1 }, { id: 'U1', name: 'Ops', order: 0 }];
  FX.P.divisions[0].unitId = 'U2'; FX.P.divisions[1].unitId = 'U1'; FX.P.divisions[2].unitId = 'U1';
  source();
  const u1 = R(pk('A', 'average', { scope: { div: 'unit:U1' } }), { fresh: true });
  eq(u1.items.map((x) => x.id), ['O2', 'O5'], 'a unit: every division in it, R&D and business alike');
  ok(near(u1.value, 52.5), 'Ops: O2 50 and O5 55');
  ok(near(val(pk('A', 'average', { scope: { div: 'unit:U2' } })), 95), 'Tech: O1 90 and O6 100 (the host never counts)');
  ok(val(pk('A', 'average', { scope: { div: 'unit:NOPE' } })) === null, 'a unit nobody is in: nothing to pull');
  eq(R(pk('A', 'average', { scope: { div: 'all' } }), { fresh: true }).items.map((x) => x.id), ['O2', 'O5', 'H', 'O1', 'O4', 'O6'], 'unit order first (Ops 0, Tech 1), then division order');
  eq(R(pk('A', 'average'), { fresh: true }).items.map((x) => x.id), ['O2', 'H', 'O1', 'O4', 'O6'], 'every R&D division: in unit order too');
  FX.P.divisions[1].unitId = ''; source();
  eq(R(pk('A', 'average', { scope: { div: 'all' } }), { fresh: true }).items.map((x) => x.id), ['O5', 'H', 'O1', 'O4', 'O6', 'O2'], 'a division in no unit comes after every unit');
  FX.P.units = [{ id: 'U2', name: 'Tech' }, { id: 'U1', name: 'Ops' }]; FX.P.divisions[1].unitId = 'U1'; source();
  eq(R(pk('A', 'average', { scope: { div: 'all' } }), { fresh: true }).items.map((x) => x.id), ['H', 'O1', 'O4', 'O6', 'O2', 'O5'], 'units without an order: their place in the list (Tech, then Ops)');
  reset();
}

/* ---------------------------------------------------------------- statuses */
{
  const st = R(pk('S', 'share', { measure: 'status' }), { fresh: true });
  eq(st.items.filter((x) => x.counts).map((x) => [x.id, x.state]), [['O1', 'on-track'], ['O6', 'on-track'], ['O2', 'off-track']], 'objective status bands (80 / 65)');
  ok(near(st.value, 200 / 3) && st.k === 2 && st.n === 3, 'share on track (the default pick): two of three');
  ok(val(pk('S', 'count', { measure: 'status' })) === 2, 'count on track: 2');
  ok(val(pk('S', 'count', { measure: 'status', states: ['off-track', 'at-risk'] })) === 1, 'count off track or at risk: 1');
  ok(val(pk('S', 'share', { measure: 'status', scope: { div: 'D9' } })) === null, 'a share of nothing: no value');
  ok(val(pk('S', 'count', { measure: 'status', scope: { div: 'D9' } })) === null, 'a count of statuses over nothing: no value either (only dated happenings count to 0)');
  ok(near(val(pk('S', 'average', { measure: 'status' })), 200 / 3), 'a number statistic on a status reads as the status\'s first (share)');
}

/* ---------------------------------------------------------------- key results */
{
  // KRs of R&D Q4 objectives: KRH (the host: never), KR1a 90, KR6a 100, KR2a 40, KR2b 60
  const r = R(pk('K', 'average', { each: 'keyResult', measure: 'krScore' }), { fresh: true });
  eq(r.items.map((x) => [x.id, x.counts, x.why]), [['KRH', false, 'host'], ['KR1a', true, null], ['KR6a', true, null], ['KR2a', true, null], ['KR2b', true, null]], 'key results of the objectives in scope; its own key result never');
  ok(near(r.value, 72.5), 'average key result score 72.5');
  // pace: objectives Oct 1 to Dec 31, today Oct 13: elapsed = 12/91 = 13.2%; 90 and 100 are on track; 40 and 60 too (behind by < 10? no: ahead)
  const p = R(pk('K', 'count', { each: 'keyResult', measure: 'krPace' }), { fresh: true });
  eq(p.items.filter((x) => x.counts).map((x) => x.state), ['on-track', 'on-track', 'on-track', 'on-track'], 'every key result ahead of its objective\'s pace');
  FX.docs.D2.keyResults[0].progress = 0; source();
  const p2 = R(pk('K', 'count', { each: 'keyResult', measure: 'krPace', states: ['at-risk'] }), { fresh: true });
  ok(p2.value === 1 && p2.items.find((x) => x.id === 'KR2a').state === 'at-risk', 'a key result 13 points behind the line is at risk');
  reset();
}

/* ---------------------------------------------------------------- stage-gates and workstreams */
{
  // O1's gates: G1 on time; G2 7 days late; G3 overdue 10 days (Oct 3 to Oct 13); G4 not due; G5 no date; G6 4 days past its baseline
  const g = R(pk('G', 'average', { each: 'gate', measure: 'daysLate', scope: { div: 'D1' } }), { fresh: true });
  eq(g.items.map((x) => [x.id, x.counts ? x.num : x.why]), [['G2', 7], ['G3', 10], ['G1', 0], ['G6', 4], ['G4', 'notDue'], ['G5', 'noDate']], 'gates in planned order, undated last; waiting ones say why');
  ok(near(g.value, 21 / 4), 'average days late over the gates due so far: (0 + 7 + 10 + 4) / 4');
  ok(val(pk('G', 'countAbove', { each: 'gate', measure: 'daysLate', scope: { div: 'D1' } }, { threshold: 5 })) === 2, 'gates more than 5 days late: G2 and G3');
  const ot = R(pk('G', 'share', { each: 'gate', measure: 'onTime', scope: { div: 'D1' } }), { fresh: true });
  eq(ot.items.filter((x) => x.counts).map((x) => [x.id, x.state]), [['G2', 'late'], ['G3', 'overdue'], ['G1', 'ontime'], ['G6', 'late']], 'passed on time, passed late (against the baseline when there is one), overdue');
  ok(near(ot.value, 25), 'share passed on time: 1 of 4');
  ok(val(pk('G', 'count', { each: 'gate', measure: 'onTime', states: ['overdue'], scope: { div: 'D1' } })) === 1, 'count overdue: 1');
  ok(val(pk('G', 'count', { each: 'gate', measure: 'onTime', scope: { div: 'D1', narrow: 'WS2' } })) === 0, 'narrowed to Workstream 2: G3 overdue only, none on time');
  eq(R(pk('G', 'count', { each: 'gate', measure: 'onTime', scope: { div: 'D1', narrow: 'WS2' } }), { fresh: true }).items.map((x) => x.id), ['G3', 'G4', 'G5'], 'only that workstream\'s gates');
  /* workstreams: WS1 3 of 3 passed (G1, G2, G6) = 100; WS2 0 of 3 = 0 */
  const w = R(pk('W', 'min', { each: 'workstream', measure: 'wsShare', scope: { div: 'D1' } }), { fresh: true });
  eq(w.items.map((x) => [x.id, x.num]), [['WS1', 100], ['WS2', 0]], 'each workstream\'s share of gates passed');
  ok(w.value === 0, 'the weakest workstream: 0');
  /* objective gate health: the weakest workstream, per objective */
  ok(val(pk('H', 'average', { measure: 'health', scope: { div: 'D1' } })) === 0, 'O1\'s gate health is its weakest workstream (0); the others have none');
  eq(R(pk('H', 'average', { measure: 'health', scope: { div: 'D1' } }), { fresh: true }).items.filter((x) => !x.counts && !x.host).map((x) => x.why), ['noWorkstreams', 'noWorkstreams'], 'no workstreams: waiting');
  /* gate readiness from its targets */
  FX.docs.D1.kpis.push({ id: 'T1', objectiveId: 'O1', hostType: 'stageGate', hostId: 'G4', name: 'Thing', targetType: 'demonstration', direction: 'up', target: 10, unit: '' });
  FX.docs.D1.kpiUpdates.push({ id: 'u1', kpiId: 'T1', value: 5, timestamp: 1 });
  source();
  const rd = R(pk('R', 'average', { each: 'gate', measure: 'gateScore', scope: { div: 'D1' } }), { fresh: true });
  eq(rd.items.filter((x) => x.counts).map((x) => [x.id, x.num]), [['G4', 50]], 'readiness: G4 at 50 (5 of 10); gates without targets wait');
  reset();
}

/* ---------------------------------------------------------------- kanban tiles */
{
  const T = (measure, statistic, extra) => pk('T', statistic, Object.assign({ each: 'tile', measure, scope: { div: 'D1' } }, extra || {}));
  const fin = R(T('finished', 'share'), { fresh: true });
  eq(fin.items.map((x) => x.id), ['BRD/t1', 'BRD/t2', 'BRD/t3', 'BRD/t4', 'BRD/t5', 'BRD/t6', 'BRD/t7', 'BRD/t8', 'BRD/t9', 'BRD/t10'], 'every tile of the objectives\' boards, board/tile ids');
  ok(fin.items.find((x) => x.id === 'BRD/t8').why === 'parked', 'a parked tile waits');
  ok(near(fin.value, 500 / 9) && fin.n === 9 && fin.k === 5, 'share finished: 5 of the 9 placed (t1, t2, t3, t9, t10)');
  ok(val(T('finished', 'count', { states: ['open'] })) === 4, 'count not finished: 4');
  // tileHealth: L1 limit 10 days: t4 12 days breached; t5 8 days at risk (>= 80%); t6 2 days on track. L2: past its deadline, breached
  const sh = R(T('stageHealth', 'count', { states: ['breached'] }), { fresh: true });
  eq(sh.items.filter((x) => x.counts).map((x) => [x.id, x.state]), [['BRD/t4', 'breached'], ['BRD/t5', 'at-risk'], ['BRD/t6', 'on-track'], ['BRD/t7', 'breached']], 'stage health of the tiles still in a stage');
  ok(sh.value === 2, 'breached: 2');
  ok(sh.items.find((x) => x.id === 'BRD/t1').why === 'finished', 'finished tiles have no stage clock: waiting (finished)');
  eq(R(T('daysInStage', 'max'), { fresh: true }).items.filter((x) => x.counts).map((x) => x.num), [12, 8, 2, 1], 'days in the current stage');
  ok(val(pk('T', 'countAbove', { each: 'tile', measure: 'daysInStage', scope: { div: 'D1' } }, { threshold: 7 })) === 2, 'more than 7 days in a stage: 2');
  // finished within a window: t1 Oct 10 (3 days), t10 Oct 12 (1 day), t2 Sep 23 (20 days), t3 Aug 14 (60 days), t9 undated
  const w30 = R(T('finishedIn', 'count'), { fresh: true });
  ok(w30.value === 3, 'finished in the last 30 days: t1, t2, t10');
  eq(w30.items.filter((x) => !x.counts).map((x) => [x.id, x.why]), [['BRD/t3', 'beforeWindow'], ['BRD/t4', 'notFinished'], ['BRD/t5', 'notFinished'], ['BRD/t6', 'notFinished'], ['BRD/t7', 'notFinished'], ['BRD/t8', 'parked'], ['BRD/t9', 'noFinishDate']], 'the rest wait, with why');
  ok(val(T('finishedIn', 'count', { window: 'd7' })) === 2, 'last 7 days: t1 and t10');
  ok(val(T('finishedIn', 'count', { window: 'd90' })) === 4, 'last 90 days: t3 too');
  ok(val(T('finishedIn', 'count', { window: 'quarter' })) === 2, 'this quarter so far (from Oct 1): t1 and t10');
  ok(near(val(T('finishedIn', 'perWeek')), 3 / (30 / 7)), 'per week: 3 in 30 days');
  ok(near(val(T('finishedIn', 'perWeek', { window: 'quarter' })), 2 / (13 / 7)), 'per week this quarter: 2 in 13 days (Oct 1 to 13)');
  ok(val(T('finishedIn', 'count', { scope: { div: 'D2' } })) === 0, 'a count of dated happenings over nothing is 0, not empty');
  const dtf = R(T('daysToFinish', 'average'), { fresh: true });
  eq(dtf.items.filter((x) => x.counts).map((x) => [x.id, x.num]), [['BRD/t1', 20], ['BRD/t2', 22]], 'days to finish, for tiles finished in the window with a start date');
  ok(dtf.items.find((x) => x.id === 'BRD/t10').why === 'noStart', 'no start date: waiting');
  ok(near(dtf.value, 21), 'average 21 days');
  ok(val(T('finished', 'share', { scope: { div: 'D1', narrow: 'NOPE' } })) === null, 'narrowed to a board that isn\'t there: nothing');
}

/* ---------------------------------------------------------------- experiments and logic trees */
{
  const E = (measure, statistic, extra) => pk('E', statistic, Object.assign({ each: 'experiment', measure, scope: { div: 'D2' } }, extra || {}));
  const all = R(E('expStatus', 'count'), { fresh: true });
  eq(all.items.map((x) => x.id), ['O2:t_a:E1', 'O2:t_a:E2', 'O2:t_a:E3', 'O2:t_a:E4', 'O2:t_a:E5', 'O2:t_a:E6', 'O2:t_b:F1', 'O2:t_c:G1'], 'every experiment of every tree, objective:tree:experiment');
  ok(all.value === 3, 'in progress (the default pick): E3, E4, G1');
  ok(val(E('expStatus', 'count', { states: ['complete'] })) === 4, 'complete: E1, E2, E6, F1');
  ok(val(E('concluded', 'count')) === 3, 'concluded in the last 30 days: E1 (Oct 1), E2 (Oct 11), F1 (Oct 9)');
  ok(val(E('concluded', 'count', { window: 'd7' })) === 2, 'last 7 days: E2 and F1');
  const hy = R(E('hypothesis', 'share'), { fresh: true });
  eq(hy.items.filter((x) => x.counts).map((x) => [x.id, x.state, x.det.inconclusive]), [['O2:t_a:E1', 'confirmed', false], ['O2:t_a:E2', 'refuted', false], ['O2:t_a:E6', 'none', true], ['O2:t_b:F1', 'none', false]], 'hypothesis verdicts of the concluded ones');
  ok(near(hy.value, 25), 'share confirmed: 1 of 4');
  const dr = R(E('daysRunning', 'max'), { fresh: true });
  eq(dr.items.filter((x) => x.counts).map((x) => [x.id, x.num]), [['O2:t_a:E3', 10], ['O2:t_c:G1', 3]], 'days running since the planned start');
  ok(dr.items.find((x) => x.id === 'O2:t_a:E4').why === 'notStarted', 'in progress ahead of its planned start: waiting (notStarted)');
  ok(dr.items.find((x) => x.id === 'O2:t_a:E5').why === 'notRunning', 'planned: not running');
  ok(val(E('expStatus', 'count', { scope: { div: 'D2', narrow: 'O2:t_b' } })) === 0 && R(E('expStatus', 'count', { scope: { div: 'D2', narrow: 'O2:t_b' } }), { fresh: true }).items.length === 1, 'narrowed to one tree');
  const tr = R(pk('Z', 'count', { each: 'tree', measure: 'treeOutcome', scope: { div: 'D2' } }), { fresh: true });
  eq(tr.items.map((x) => [x.id, x.state, x.det.end && x.det.end.label]), [['O2:t_a', 'success', 'Target achieved'], ['O2:t_b', 'pause', 'To an FMEA'], ['O2:t_c', 'open', null]], 'where each tree ended: followed from its root through the recorded outcomes');
  ok(tr.value === 1, 'ended at the target: 1');
  eq(C.pullTreeEnd({ experiments: { A: { actual_outcome: { result_id: 'other', next_experiment_ids: ['B'] } }, B: { possible_results: [{ id: 'q', terminal: { type: 'halt' } }], actual_outcome: { result_id: 'q' }, code: 'B-1' } } }),
    { kind: 'stop', type: 'halt', label: 'halt', at: 'B-1' }, 'an "other" outcome follows its own next experiment; an unknown terminal halts');
  ok(C.pullTreeEnd({ experiments: { A: { possible_results: [{ id: 'r', next_experiment_ids: ['B'] }], actual_outcome: { result_id: 'r' } }, B: {} } }) === null, 'still open: the path stops at an experiment with no outcome');
}

/* ---------------------------------------------------------------- the KPI in the scores */
{
  const k = pk('KA', 'average', null, { target: 100 });
  FX.docs.D1.kpis.push(k); source();
  const em = C.withPortfolio(FX.P, FX.docs);
  const pp = C.kpiScoreParts(k, FX.docs.D1.kpis, em);
  ok(near(pp.score, 80) && near(pp.raw, 80) && pp.partial === false, 'scored like a statistical KPI: 80 against 100');
  ok(near(C.keyResultScore('KRH', em), 80), 'its key result takes it');
  ok(near(C.objectiveScore('H', em), 80), 'and its objective');
  k.readCount = 20;
  FX.docs.D1.kpiUpdates.push({ id: 'x1', kpiId: 'KA', value: 1, timestamp: 5 }); source();
  const pp2 = C.kpiScoreParts(k, FX.docs.D1.kpis, C.withPortfolio(FX.P, FX.docs));
  ok(near(pp2.score, 80) && pp2.partial === false, 'never discounted, never read from posted readings (a stray readCount and reading change nothing)');
  /* a gate target at 100 passes the gate */
  const gk = { id: 'GT', objectiveId: 'O1', hostType: 'stageGate', hostId: 'G4', name: 'Tiles finished', targetType: 'statistical', statistic: 'share', direction: 'up', target: 100, unit: '%',
    pull: { v: 1, each: 'tile', measure: 'finished', states: ['finished'], window: 'd30', scope: { div: 'D1', quarter: '', proj: '', owner: '', narrow: 'BRD' }, follow: true, exclude: [] } };
  FX.docs.D1.kpis.push(gk); source();
  ok(near(C.stageGateScore('G4', C.withPortfolio(FX.P, FX.docs)), 500 / 9) && !C.gateAtTarget('G4', C.withPortfolio(FX.P, FX.docs)), 'a gate target pulled from the board: 5 of 9, not at target');
  FX.docs.D1.boards[0].tiles.forEach((t) => { if (t.col) { t.col = 'c3'; t.enteredCol = t.enteredCol || '2026-10-13'; } }); source();
  ok(C.gateAtTarget('G4', C.withPortfolio(FX.P, FX.docs)), 'every tile finished: the gate is at target (and auto-passes where the apps pass gates)');
  reset();
}

/* ---------------------------------------------------------------- loops, sources and caching */
{
  /* two objectives each pulling the other's score: never itself, and a loop reads no value inside it */
  FX.P.objectives.push({ id: 'X', divisionId: 'D2', quarter: '2026Q4', statement: 'X', order: 9 });
  FX.docs.D2.keyResults.push({ id: 'KRX', objectiveId: 'X', statement: 'X KR', trackingType: 'kpi' });
  const a = pk('LA', 'average', { scope: { div: 'rd' } }, { target: 50 });
  const b = Object.assign(pk('LB', 'average', { scope: { div: 'rd' } }, { target: 100 }), { objectiveId: 'X', hostId: 'KRX' });
  FX.docs.D1.kpis.push(a); FX.docs.D2.kpis.push(b); source();
  let threw = false, va = null, vb = null;
  try { va = C.pulledValue(a, SRC); vb = C.pulledValue(b, SRC); } catch (e) { threw = true; }
  ok(!threw && va != null && vb != null && isFinite(va) && isFinite(vb), 'a loop between two objectives settles: ' + (va && va.toFixed(2)) + ', ' + (vb && vb.toFixed(2)));
  // a (target 50) reads O1 90, O6 100, O2 50 and X, whose KR holds b; inside that read b meets a again, which has no value
  // there, so H waits and b = mean(90, 100, 50) = 80, X = 80, a = 80. Read from b's side: a = 80 without X, scores 100,
  // so H = 100 and b = mean(100, 90, 100, 50) = 85.
  ok(near(va, 80) && near(vb, 85), 'the inner read of a loop has no value, so each side reads the other without itself');
  ok(near(C.pulledValue(a, SRC), va) && near(C.pulledValue(b, SRC), vb), 'and reads the same again (results across a loop are worked out afresh, not kept half-done)');
  reset();
}
{
  /* the page's source wins over the map a caller hands in; results are kept per source object */
  const k = pk('C1', 'average');
  const em = C.withPortfolio(FX.P, { D2: FX.docs.D2 });               // a narrower map, as Execution's selected division
  ok(near(C.effValue(k, [k], em), 80), 'the page\'s documents, not the map handed in (the KPI\'s value as every score reads it)');
  const before = C.pulledValue(k, SRC);
  FX.docs.D2.keyResults[0].progress = 100;                              // change without a new source: kept
  ok(near(C.pulledValue(k, SRC), before), 'kept while the source is the same object');
  ok(near(C.pulledResult(k, SRC, { fresh: true }).value, (90 + 100 + 80) / 3), 'fresh: worked out again');
  source();
  ok(near(C.pulledValue(k, SRC), (90 + 100 + 80) / 3), 'a new source (the next change): worked out again');
  C.setPullSource(null);
  const m = C.withPortfolio(FX.P, FX.docs);
  Object.defineProperty(m, '__pullSrc', { value: { portfolio: FX.P, docs: FX.docs, today: TODAY, todayIso: TISO }, enumerable: false });
  ok(near(C.effValue(k, [k], m), (90 + 100 + 80) / 3), 'no page source: the map handed in (with its own source when it carries one)');
  const m2 = C.withPortfolio(FX.P, FX.docs);
  const v2 = C.effValue(k, [k], m2);
  ok(v2 === null || isFinite(v2), 'no source at all: the map and today\'s date (the Hub, the broker): ' + v2);
  ok(Object.keys(m2).indexOf('__pullSrc') < 0, 'what it keeps on the map is not enumerable (documents never carry it)');
  C.setPullSource(() => SRC);
  reset();
}
{
  /* odd records never throw */
  const odd = [pk('Q1', 'average', { each: 'nope', measure: 'nope' }), pk('Q2', 'average', { each: 'tile', measure: 'score' }), { id: 'Q3', pull: 'x' }, { id: 'Q4' }, null];
  let threw = false; const vs = [];
  try { odd.forEach((k) => vs.push(C.pulledValue(k, SRC))); } catch (e) { threw = true; }
  ok(!threw && vs.every((v) => v === null), 'unknown measures, a measure on the wrong kind of work, no pull: no value, no throw');
  eq([C.pullDayOfIso('2026-10-13'), C.pullIsoOfDay(TODAY), C.pullDayOfIso(''), C.pullIsoOfDay(null)], [TODAY, TISO, null, ''], 'day counts and ISO dates');
  /* the catalogue agrees with itself */
  const kinds = { number: 1, state: 1, event: 1 };
  ok(Object.keys(C.PULL_MEASURES).every((m) => kinds[C.PULL_MEASURES[m][1]] && C.PULL_STATS[C.PULL_MEASURES[m][1]].length), 'every measure has a kind with statistics');
  ok(Object.keys(C.PULL_MEASURES).filter((m) => C.PULL_MEASURES[m][1] === 'state').every((m) => C.PULL_STATES[m] && C.PULL_STATES[m][1].every((x) => C.PULL_STATES[m][0].indexOf(x) >= 0)), 'every status reading lists its states and a default pick among them');
  eq(Object.keys(C.PULL_MEASURES).length, 20, 'twenty readings over seven kinds of work');
}

console.log(f ? `\n${f}/${n} FAILED` : `\nPASS — ${n} pulled KPI assertions green`); process.exit(f ? 1 : 0);
