/* ============================================================================
   Core test harness (pure Node, headless). Run: node core.test.js
   Exits non-zero on any failure. Assertion count must never regress.
   ============================================================================ */
var C = require('./core.js');

var count = 0, fails = 0;
function eq(a, b, msg) {
  count++;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fails++; console.error('FAIL: ' + msg + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
  }
}
function approx(a, b, msg, eps) {
  count++; eps = eps || 1e-9;
  if (a == null || Math.abs(a - b) > eps) {
    fails++; console.error('FAIL: ' + msg + ' — got ' + a + ' expected ' + b);
  }
}
function ok(x, msg) { count++; if (!x) { fails++; console.error('FAIL: ' + msg); } }
function isNull(x, msg) { count++; if (x !== null) { fails++; console.error('FAIL: ' + msg + ' — got ' + JSON.stringify(x)); } }

/* ---- IDs: monotonic, position-independent, unique, padded ---------------- */
(function () {
  eq(C.allocId('division', null, [], { code: 'FC' }), 'DIV-FC', 'division id');
  eq(C.allocId('initiative', 'DIV-FC', [], {}), 'INIT-FC-01', 'first initiative');
  eq(C.allocId('initiative', 'DIV-FC', ['INIT-FC-01', 'INIT-FC-02'], {}), 'INIT-FC-03', 'next initiative');
  // position independence: reordering existing ids gives the same next id
  eq(C.allocId('initiative', 'DIV-FC', ['INIT-FC-02', 'INIT-FC-01'], {}), 'INIT-FC-03', 'order-independent');
  // a gap (deleted #2) does NOT reuse the gap — counter is allocation, not position
  eq(C.allocId('initiative', 'DIV-FC', ['INIT-FC-01', 'INIT-FC-03'], {}), 'INIT-FC-04', 'no reuse of gaps');
  eq(C.allocId('milestone', 'INIT-FC-01', ['MS-FC-01-02'], {}), 'MS-FC-01-03', 'milestone id');
  eq(C.allocId('objective', 'DIV-FC', [], { quarter: '2026Q3' }), 'OBJ-FC-2026Q3-01', 'quarter-stamped objective');
  eq(C.allocId('keyResult', 'OBJ-FC-2026Q3-02', [], {}), 'KR-FC-2026Q3-02-1', 'leaf KR unpadded');
  eq(C.allocId('stageGate', 'OBJ-FC-2026Q3-02', ['SG-FC-2026Q3-02-1'], {}), 'SG-FC-2026Q3-02-2', 'leaf SG increments');
  var threw = false; try { C.allocId('division', null, ['DIV-FC'], { code: 'FC' }); } catch (e) { threw = true; }
  ok(threw, 'duplicate division code throws');
})();

/* ---- KPI scoring: directions, clamp, null cases ------------------------- */
(function () {
  approx(C.kpiScore({ direction: 'up', target: 100 }, 80), 80, 'up partial');
  approx(C.kpiScore({ direction: 'up', target: 100 }, 150), 100, 'up clamps at 100');
  approx(C.kpiScore({ direction: 'down', target: 10 }, 10), 100, 'down at target');
  approx(C.kpiScore({ direction: 'down', target: 10 }, 20), 50, 'down worse');
  approx(C.kpiScore({ direction: 'range', target: { lo: 5, hi: 7 } }, 6), 100, 'range inside');
  approx(C.kpiScore({ direction: 'range', target: { lo: 5, hi: 7 } }, 8), 50, 'range one half-width out');
  approx(C.kpiScore({ direction: 'range', target: { lo: 5, hi: 7 } }, 9), 0, 'range full-width out');
  isNull(C.kpiScore({ direction: 'up', target: null }, 50), 'null target -> unscored');
  isNull(C.kpiScore({ direction: 'up', target: 100 }, null), 'no read -> unscored');
})();

/* ---- KPI -> KR -> objective rollup --------------------------------------- */
(function () {
  // 4 Key Results, each hosting one KPI; 3 at 100, 1 at 0 -> objective 75.
  var exec = {
    'DIV-FC': {
      keyResults: [
        { id: 'KR-a', objectiveId: 'O1', statement: 'a' }, { id: 'KR-b', objectiveId: 'O1', statement: 'b' },
        { id: 'KR-c', objectiveId: 'O1', statement: 'c' }, { id: 'KR-d', objectiveId: 'O1', statement: 'd' }
      ],
      kpis: [
        { id: 'K-a', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KR-a', direction: 'up', target: 100 },
        { id: 'K-b', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KR-b', direction: 'up', target: 100 },
        { id: 'K-c', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KR-c', direction: 'up', target: 100 },
        { id: 'K-d', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KR-d', direction: 'up', target: 100 }
      ],
      kpiUpdates: [
        { kpiId: 'K-a', value: 100, timestamp: 1 }, { kpiId: 'K-b', value: 100, timestamp: 1 },
        { kpiId: 'K-c', value: 100, timestamp: 1 }, { kpiId: 'K-d', value: 0, timestamp: 1 }
      ]
    }
  };
  approx(C.kpiCurrentValue('K-a', exec), 100, 'kpi current value');
  approx(C.keyResultScore('KR-a', exec), 100, 'KR score = its single KPI');
  approx(C.objectiveScore('O1', exec), 75, '3x100 + 1x0 = 75');
  exec['DIV-FC'].kpiUpdates.push({ kpiId: 'K-d', value: 100, timestamp: 2 });
  approx(C.objectiveScore('O1', exec), 100, 'latest-wins update on the KPI');

  // a KR with MULTIPLE KPIs averages them
  var exec2 = { 'D': {
    keyResults: [{ id: 'KRm', objectiveId: 'O1', statement: 'multi' }],
    kpis: [{ id: 'Km1', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KRm', direction: 'up', target: 100 },
           { id: 'Km2', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KRm', direction: 'up', target: 100 }],
    kpiUpdates: [{ kpiId: 'Km1', value: 100, timestamp: 1 }, { kpiId: 'Km2', value: 0, timestamp: 1 }]
  } };
  approx(C.keyResultScore('KRm', exec2), 50, 'KR = mean of its two KPIs (100,0)');
  approx(C.objectiveScore('O1', exec2), 50, 'objective = its single KR (50)');

  // stage-gate KPIs are gating only -> excluded from objective score
  var exec3 = { 'D': {
    keyResults: [{ id: 'KRk', objectiveId: 'O1', statement: 'k' }],
    stageGates: [{ id: 'SGk', objectiveId: 'O1', plannedDate: 10 }],
    kpis: [{ id: 'Kkr', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KRk', direction: 'up', target: 100 },
           { id: 'Ksg', objectiveId: 'O1', hostType: 'stageGate', hostId: 'SGk', direction: 'up', target: 100 }],
    kpiUpdates: [{ kpiId: 'Kkr', value: 100, timestamp: 1 }, { kpiId: 'Ksg', value: 0, timestamp: 1 }]
  } };
  approx(C.objectiveScore('O1', exec3), 100, 'stage-gate KPI excluded from objective score');
  approx(C.stageGateScore('SGk', exec3), 0, 'stage-gate score = its gating KPI (0)');

  // decision #3: no KR -> null (no synthesized KR); KR with only an unscored KPI -> null
  isNull(C.objectiveScore('O1', { 'D': { keyResults: [], kpis: [], kpiUpdates: [] } }), 'no KR -> null (no band)');
  var exec5 = { 'D': {
    keyResults: [{ id: 'KRn', objectiveId: 'O1', statement: 'n' }],
    kpis: [{ id: 'Kn', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KRn', direction: 'up', target: null }],
    kpiUpdates: []
  } };
  isNull(C.objectiveScore('O1', exec5), 'KR with only an unscored KPI -> objective null');
})();

/* ---- KPI link groups: define-down targets, status-up values ------------- */
(function () {
  // define on a Key Result, link a stage-gate member, measure AT the gate.
  var exec = { 'D': {
    keyResults: [{ id: 'KR1', objectiveId: 'O1', statement: 'kr' }],
    stageGates: [{ id: 'SG1', objectiveId: 'O1', plannedDate: 10 }],
    kpis: [
      { id: 'Kkr', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KR1', groupId: 'G1', isDefiner: true,
        name: 'Limiting current', direction: 'up', unit: 'A/cm2', target: 100 },
      { id: 'Kg', objectiveId: 'O1', hostType: 'stageGate', hostId: 'SG1', groupId: 'G1', isDefiner: false, target: null }
    ],
    kpiUpdates: [{ id: 'u1', kpiId: 'Kg', value: 80, timestamp: 1 }]   // reading entered at the GATE
  } };
  var kpis = exec['D'].kpis;
  approx(C.effTarget(kpis[1], kpis), 100, 'target cascades DOWN to the gate member');
  approx(C.effValue(kpis[0], kpis, exec), 80, 'value cascades UP to the KR member');
  eq(C.kpiDirection(kpis[1], kpis), 'up', 'gate member inherits direction from definer');
  eq(C.kpiName(kpis[1], kpis), 'Limiting current', 'gate member inherits name from definer');
  approx(C.keyResultScore('KR1', exec), 80, 'gate reading scores the linked KR (value up)');
  approx(C.objectiveScore('O1', exec), 80, 'objective scores from the linked gate reading');
  approx(C.stageGateScore('SG1', exec), 80, 'gate readiness = cascaded-down target + own reading');
})();

/* ---- KPI link groups: initiative-level definition + lower override ------ */
(function () {
  var exec = { 'D': {
    keyResults: [{ id: 'KR2', objectiveId: 'O1', statement: 'kr' }],
    stageGates: [],
    kpis: [
      { id: 'Ki', objectiveId: null, hostType: 'initiative', hostId: 'INIT1', groupId: 'G2', isDefiner: true,
        name: 'X', direction: 'up', unit: 'u', target: 200 },
      { id: 'Kk', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KR2', groupId: 'G2', isDefiner: false, target: null }
    ],
    kpiUpdates: [{ id: 'u1', kpiId: 'Kk', value: 100, timestamp: 1 }]
  } };
  approx(C.keyResultScore('KR2', exec), 50, 'initiative target (200) cascades down to KR -> 100/200');
  exec['D'].kpis[1].target = 100;   // KR overrides locally
  approx(C.keyResultScore('KR2', exec), 100, 'KR-level target override beats the initiative target');
})();

/* ---- KPI link groups: higher value overpowers, lower never reads up ----- */
(function () {
  var exec = { 'D': {
    keyResults: [{ id: 'KR3', objectiveId: 'O1', statement: 'kr' }],
    stageGates: [{ id: 'SG3', objectiveId: 'O1', plannedDate: 10 }],
    kpis: [
      { id: 'Kk3', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KR3', groupId: 'G3', isDefiner: true,
        name: 'X', direction: 'up', unit: 'u', target: 100 },
      { id: 'Kg3', objectiveId: 'O1', hostType: 'stageGate', hostId: 'SG3', groupId: 'G3', isDefiner: false, target: null }
    ],
    kpiUpdates: [
      { id: 'u1', kpiId: 'Kg3', value: 50, timestamp: 1 },   // gate reading
      { id: 'u2', kpiId: 'Kk3', value: 90, timestamp: 2 }    // KR reading (higher level)
    ]
  } };
  approx(C.keyResultScore('KR3', exec), 90, 'higher-level reading overpowers the lower one for the KR');
  approx(C.stageGateScore('SG3', exec), 50, 'lower level keeps its own reading, never reads up');
})();

/* ---- KPI link groups: standalone KPI is its own definer (v1.3 parity) --- */
(function () {
  var exec = { 'D': {
    keyResults: [{ id: 'KR4', objectiveId: 'O1', statement: 'kr' }],
    kpis: [{ id: 'Ks', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KR4', groupId: null, isDefiner: true,
             name: 'S', direction: 'down', unit: 'ms', target: 10 }],
    kpiUpdates: [{ id: 'u1', kpiId: 'Ks', value: 20, timestamp: 1 }]
  } };
  approx(C.keyResultScore('KR4', exec), 50, 'standalone KPI scores from its own target/value (down 10 vs 20)');
  eq(C.kpiDirection(exec['D'].kpis[0], exec['D'].kpis), 'down', 'standalone resolves identity to itself');
})();

/* ---- tiers: quarterly vs overall, collapse, company grand-mean ----------- */
(function () {
  // Division D with two initiatives across two quarters.
  // Q1: O1 (score 70), O2 (score 90) -> Q1 div = 80
  // Q2: O3 (score 100)               -> Q2 div = 100
  // overall div = mean(70,90,100) = 86.667  (grand mean, NOT mean of quarter means 90)
  var portfolio = {
    initiatives: [{ id: 'I1', divisionId: 'D' }, { id: 'I2', divisionId: 'D' }],
    objectives: [
      { id: 'O1', divisionId: 'D', initiativeId: 'I1', quarter: 'Q1' },
      { id: 'O2', divisionId: 'D', initiativeId: 'I1', quarter: 'Q1' },
      { id: 'O3', divisionId: 'D', initiativeId: 'I2', quarter: 'Q2' }
    ]
  };
  function okr(o, v) {
    return { kr: { id: 'KR-' + o, objectiveId: o, statement: o },
             kpi: { id: 'K-' + o, objectiveId: o, hostType: 'keyResult', hostId: 'KR-' + o, direction: 'up', target: 100 },
             up: { id: 'U-' + o, kpiId: 'K-' + o, value: v, timestamp: 1 } };
  }
  var a = okr('O1', 70), b = okr('O2', 90), c = okr('O3', 100);
  var exec = { 'D': { keyResults: [a.kr, b.kr, c.kr], kpis: [a.kpi, b.kpi, c.kpi], kpiUpdates: [a.up, b.up, c.up] } };
  approx(C.score('division', 'D', portfolio, exec, 'Q1'), 80, 'division quarterly Q1');
  approx(C.score('division', 'D', portfolio, exec, 'Q2'), 100, 'division quarterly Q2');
  approx(C.score('division', 'D', portfolio, exec), (70 + 90 + 100) / 3, 'division overall = grand mean');
  // collapse: I2 spans exactly one quarter
  eq(C.boundsOf('initiative', 'I2', portfolio), ['Q2'], 'I2 single bound');
  approx(C.score('initiative', 'I2', portfolio, exec),
         C.score('initiative', 'I2', portfolio, exec, 'Q2'), 'single-quarter collapse equal');
  eq(C.boundsOf('initiative', 'I1', portfolio), ['Q1'], 'I1 single bound (both objs Q1)');
  // company grand-mean differs from mean of division scores when sizes differ.
  // Add division E with one objective at 0 in Q1.
  portfolio.initiatives.push({ id: 'I3', divisionId: 'E' });
  portfolio.objectives.push({ id: 'O4', divisionId: 'E', initiativeId: 'I3', quarter: 'Q1' });
  var d4 = okr('O4', 0);
  exec['E'] = { keyResults: [d4.kr], kpis: [d4.kpi], kpiUpdates: [d4.up] };
  // company overall grand mean = mean(70,90,100,0) = 65
  approx(C.score('company', null, portfolio, exec), (70 + 90 + 100 + 0) / 4, 'company overall = grand mean of all objectives');
  // mean of division scores would be mean(86.667, 0) = 43.33 -> assert NOT equal
  var dMean = (C.rollupDivision('D', portfolio, exec) + C.rollupDivision('E', portfolio, exec)) / 2;
  ok(Math.abs(C.rollupCompany(portfolio, exec) - dMean) > 1, 'company != mean of division scores (d2 property)');
  // empty bound -> null
  isNull(C.score('division', 'D', portfolio, exec, 'Q9'), 'empty quarter -> null');
  // bands
  eq(C.band(95), 'on-track', 'band on-track'); eq(C.band(75), 'at-risk', 'band at-risk');
  eq(C.band(40), 'off-track', 'band off-track'); eq(C.band(null), 'no-band', 'band none');
})();

/* ---- classification: lattice, resolution, validation --------------------- */
(function () {
  var portfolio = {
    products: [{ id: 'P1' }, { id: 'P2' }],
    models: [{ id: 'M1', productId: 'P1' }, { id: 'M1b', productId: 'P1' }, { id: 'M2', productId: 'P2' }],
    initiatives: [
      { id: 'Iag', divisionId: 'D' },                       // agnostic
      { id: 'Iprod', divisionId: 'D', productId: 'P1' },    // product-specific
      { id: 'Imod', divisionId: 'D', modelId: 'M1' }        // model-specific
    ],
    objectives: []
  };
  // resolution / inheritance
  eq(C.effProduct({ initiativeId: 'Iprod' }, portfolio), 'P1', 'objective inherits product');
  eq(C.effModel({ initiativeId: 'Iprod' }, portfolio), null, 'product-only -> no model');
  eq(C.effProduct({ initiativeId: 'Imod' }, portfolio), 'P1', 'model resolves to parent product');
  eq(C.effModel({ initiativeId: 'Imod' }, portfolio), 'M1', 'model resolves to model');
  eq(C.effProduct({ initiativeId: 'Iag', modelId: 'M2' }, portfolio), 'P2', 'own model wins over agnostic init');

  // validation rows of §5.3
  ok(C.validateClassification({ initiativeId: 'Iag', modelId: 'M2' }, portfolio).ok, 'agnostic init allows any model');
  ok(C.validateClassification({ initiativeId: 'Iag', productId: 'P2' }, portfolio).ok, 'agnostic init allows any product');
  ok(C.validateClassification({ initiativeId: 'Iprod' }, portfolio).ok, 'product init: objective inherits');
  ok(C.validateClassification({ initiativeId: 'Iprod', modelId: 'M1' }, portfolio).ok, 'product init: model under it ok');
  ok(C.validateClassification({ initiativeId: 'Iprod', modelId: 'M1b' }, portfolio).ok, 'product init: sibling model under it ok');
  ok(!C.validateClassification({ initiativeId: 'Iprod', productId: 'P2' }, portfolio).ok, 'product init: different product blocked');
  ok(!C.validateClassification({ initiativeId: 'Iprod', modelId: 'M2' }, portfolio).ok, 'product init: model under other product blocked');
  ok(C.validateClassification({ initiativeId: 'Imod', modelId: 'M1' }, portfolio).ok, 'model init: same model ok');
  ok(!C.validateClassification({ initiativeId: 'Imod', modelId: 'M1b' }, portfolio).ok, 'model init: other model blocked');
  ok(!C.validateClassification({ initiativeId: 'Imod', productId: 'P1' }, portfolio).ok, 'model init: broaden to product blocked');
  ok(C.validateClassification({ initiativeId: 'Imod' }, portfolio).ok, 'model init: agnostic objective inherits (ok)');
  ok(!C.validateClassification({ initiativeId: 'Iag', productId: 'P1', modelId: 'M1' }, portfolio).ok, 'node both set blocked');
})();

/* ---- sliced rollups: product aggregates across models, sub-aggregate ------ */
(function () {
  var portfolio = {
    products: [{ id: 'P1' }],
    models: [{ id: 'M1', productId: 'P1' }, { id: 'M2', productId: 'P1' }],
    initiatives: [{ id: 'I1', divisionId: 'D' }],
    objectives: [
      { id: 'O1', divisionId: 'D', initiativeId: 'I1', quarter: 'Q1', modelId: 'M1' },
      { id: 'O2', divisionId: 'D', initiativeId: 'I1', quarter: 'Q1', modelId: 'M2' }
    ]
  };
  var exec = { 'D': {
    keyResults: [{ id: 'KR1', objectiveId: 'O1', statement: 'a' }, { id: 'KR2', objectiveId: 'O2', statement: 'b' }],
    kpis: [{ id: 'K1', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KR1', direction: 'up', target: 100 },
           { id: 'K2', objectiveId: 'O2', hostType: 'keyResult', hostId: 'KR2', direction: 'up', target: 100 }],
    kpiUpdates: [{ kpiId: 'K1', value: 60, timestamp: 1 }, { kpiId: 'K2', value: 100, timestamp: 1 }]
  } };
  approx(C.sliceScore('product', 'P1', portfolio, exec), 80, 'product P1 = mean across its models (60,100)');
  approx(C.sliceScore('model', 'M1', portfolio, exec), 60, 'model M1 sub-aggregate');
  approx(C.sliceScore('model', 'M2', portfolio, exec), 100, 'model M2 sub-aggregate');
  approx(C.sliceScore('product', 'P1', portfolio, exec, 'Q1'), 80, 'product quarterly filter');
  isNull(C.sliceScore('product', 'P1', portfolio, exec, 'Q9'), 'product empty quarter -> null');
})();

/* ---- cascade: the §6.1 worked example, exactly --------------------------- */
(function () {
  var today = 50;
  var portfolio = {
    initiatives: [{ id: 'I', divisionId: 'D', plannedStart: 0, plannedEnd: 150 }],
    milestones: [
      { id: 'M1', initiativeId: 'I', plannedDate: 100 },
      { id: 'M2', initiativeId: 'I', plannedDate: 150 }
    ],
    milestoneEdges: [{ fromMs: 'M1', toMs: 'M2', lagDays: 0 }],
    objectives: [
      { id: 'O1', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 90, milestoneIds: ['M1'] },
      { id: 'O2', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 140, milestoneIds: [] }
    ],
    objectiveEdges: []
  };
  // Drive O1 -> projEnd 110 via a stage-gate actualDate; O2 -> 155 via a task.
  var exec = { 'D': {
    stageGates: [{ id: 'SG1', objectiveId: 'O1', plannedDate: 90, actualDate: 110 }],
    tasks: [{ id: 'T1', objectiveId: 'O2', plannedStart: 0, plannedEnd: 140, percentComplete: 0, actualEnd: 155 }]
  } };
  var r = C.cascade(portfolio, exec, today);
  approx(r.objectiveProjectedEnd['O1'], 110, 'O1 projEnd = 110');
  approx(r.objectiveProjectedEnd['O2'], 155, 'O2 projEnd = 155');
  approx(r.milestoneEffective['M1'], 110, 'M1 effective = 110');
  approx(r.milestoneEffective['M2'], 150, 'M2 effective = 150');
  approx(r.initiativeProjectedEnd['I'], 155, 'I projEnd = 155');
  approx(r.longTermSlip['I'], 5, 'long-term slip = 5 days');

  // Variant: O1 slips to 160 -> drives through milestone chain, slip 10
  exec['D'].stageGates[0].actualDate = 160;
  var r2 = C.cascade(portfolio, exec, today);
  approx(r2.milestoneEffective['M1'], 160, 'variant M1 = 160');
  approx(r2.milestoneEffective['M2'], 160, 'variant M2 = 160 via chain');
  approx(r2.longTermSlip['I'], 10, 'variant slip = 10');
})();

/* ---- cascade: in-progress task extension, no-children, cycle guard -------- */
(function () {
  var today = 100;
  // task 40% done, behind: planned [0,80], remaining 60% of 80 = 48 from today -> 148
  var portfolio = {
    initiatives: [{ id: 'I', divisionId: 'D', plannedStart: 0, plannedEnd: 80 }],
    milestones: [], milestoneEdges: [],
    objectives: [{ id: 'O', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 80, milestoneIds: [] }],
    objectiveEdges: []
  };
  var exec = { 'D': { tasks: [{ id: 'T', objectiveId: 'O', plannedStart: 0, plannedEnd: 80, percentComplete: 40 }] } };
  var r = C.cascade(portfolio, exec, today);
  approx(r.objectiveProjectedEnd['O'], 148, 'in-progress extension 100 + ceil(0.6*80)=148');

  // no children -> objective intrinsic = its planned end; initiative slip 0
  var p2 = {
    initiatives: [{ id: 'I', divisionId: 'D', plannedStart: 0, plannedEnd: 80 }],
    milestones: [], milestoneEdges: [],
    objectives: [{ id: 'O', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 80, milestoneIds: [] }],
    objectiveEdges: []
  };
  var r2 = C.cascade(p2, { 'D': {} }, 10);
  approx(r2.objectiveProjectedEnd['O'], 80, 'no children -> planned end');
  approx(r2.longTermSlip['I'], 0, 'no slip when on plan');

  // cycle guard: A<->B must terminate
  var p3 = {
    initiatives: [{ id: 'I', divisionId: 'D', plannedStart: 0, plannedEnd: 100 }],
    milestones: [], milestoneEdges: [],
    objectives: [
      { id: 'A', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 50, milestoneIds: [] },
      { id: 'B', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 50, milestoneIds: [] }
    ],
    objectiveEdges: [{ fromObj: 'A', toObj: 'B', lagDays: 0 }, { fromObj: 'B', toObj: 'A', lagDays: 0 }]
  };
  var r3 = C.cascade(p3, { 'D': {} }, 10);
  ok(r3.objectiveProjectedEnd['A'] != null && r3.objectiveProjectedEnd['B'] != null, 'cycle terminates with values');
  ok(r3.cycles.length > 0, 'cycle reported');
})();

/* ---- summary ------------------------------------------------------------- */
if (fails) {
  console.error('\n' + fails + ' / ' + count + ' assertions FAILED');
  process.exit(1);
} else {
  console.log('PASS — ' + count + ' assertions green');
}