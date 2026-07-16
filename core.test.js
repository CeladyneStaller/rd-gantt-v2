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
  eq(C.allocId('product', 'DIV-FC', [], {}), 'PRD-FC-1', 'first product under a division');
  eq(C.allocId('product', 'DIV-FC', ['PRD-FC-1','PRD-FC-2'], {}), 'PRD-FC-3', 'next product increments');
  eq(C.allocId('model', 'PRD-FC-1', [], {}), 'MDL-FC-1-1', 'first model under a product');
  eq(C.allocId('model', 'PRD-FC-1', ['MDL-FC-1-1'], {}), 'MDL-FC-1-2', 'next model increments');
  eq(C.allocId('model', 'PRD-FC-1', ['MDL-FC-11-3'], {}), 'MDL-FC-1-1', 'model numbering not confused by sibling product PRD-FC-11');
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

/* ---- milestone KPIs: hosted score + achievement (standalone gating signal) --- */
(function () {
  eq(C.KPI_LEVEL.milestone, 3, 'milestone sits at the initiative tier in the KPI level map');
  eq(C.KPI_LEVEL.milestone, C.KPI_LEVEL.initiative, 'milestone is a peer of initiative');

  var exec = { 'D': {
    kpis: [
      { id: 'Kms1', objectiveId: null, hostType: 'milestone', hostId: 'MS1', direction: 'up', target: 100 },
      { id: 'Kms2', objectiveId: null, hostType: 'milestone', hostId: 'MS1', direction: 'up', target: 100 }
    ],
    kpiUpdates: [{ kpiId: 'Kms1', value: 100, timestamp: 1 }, { kpiId: 'Kms2', value: 0, timestamp: 1 }]
  } };
  approx(C.milestoneScore('MS1', exec), 50, 'milestone score = mean of its hosted KPIs (100 & 0)');
  isNull(C.milestoneScore('MSX', exec), 'milestone with no KPIs -> null score');

  // achievement: KPI score at 100 OR manual completedDate; no-KPI milestone -> manual only
  eq(C.milestoneAchieved({ id: 'MS1' }, exec), false, 'not achieved at 50% with no completed date');
  var execFull = { 'D': {
    kpis: [{ id: 'Kf', objectiveId: null, hostType: 'milestone', hostId: 'MS2', direction: 'up', target: 100 }],
    kpiUpdates: [{ kpiId: 'Kf', value: 100, timestamp: 1 }]
  } };
  eq(C.milestoneAchieved({ id: 'MS2' }, execFull), true, 'achieved when KPI score hits 100%');
  eq(C.milestoneAchieved({ id: 'MSX', completedDate: 30 }, exec), true, 'no-KPI milestone achieved by manual completedDate');
  eq(C.milestoneAchieved({ id: 'MSX' }, exec), false, 'no-KPI milestone not achieved without a mark');

  // isolation: milestone KPIs never enter an objective's score (same stance as stage gates)
  var execObj = { 'D': {
    keyResults: [{ id: 'KRo', objectiveId: 'O1', statement: 'k' }],
    kpis: [
      { id: 'Kkr', objectiveId: 'O1', hostType: 'keyResult', hostId: 'KRo', direction: 'up', target: 100 },
      { id: 'Kmo', objectiveId: null, hostType: 'milestone', hostId: 'MS3', direction: 'up', target: 100 }
    ],
    kpiUpdates: [{ kpiId: 'Kkr', value: 100, timestamp: 1 }, { kpiId: 'Kmo', value: 0, timestamp: 1 }]
  } };
  approx(C.objectiveScore('O1', execObj), 100, 'milestone KPI is excluded from the objective/OKR score');
  approx(C.milestoneScore('MS3', execObj), 0, 'the same milestone KPI still scores the milestone');
})();

/* ---- milestone KPIs as a define-down parent (1b: target cascades down, links validate) --- */
(function () {
  // milestone-level definer with a target; a KR links up via linkParent (direct) -> KR inherits target/name/direction
  var msDef = { id:'Kmd', hostType:'milestone', hostId:'MS1', isDefiner:true, groupId:null, direction:'up', unit:'A', target:100, name:'Peak current' };
  var krDirect = { id:'Kkd', hostType:'keyResult', hostId:'KR1', objectiveId:'O1', linkParent:'Kmd', linkType:'direct', target:null };
  var kd=[msDef, krDirect];
  approx(C.effTarget(krDirect, kd), 100, '1b: milestone target cascades DOWN to a direct-linked KR');
  eq(C.kpiName(krDirect, kd), 'Peak current', 'linked KR inherits the milestone KPI name');
  eq(C.kpiDirection(krDirect, kd), 'up', 'linked KR inherits the milestone KPI direction');
  // contribute: KR may override its target, else inherits
  var krC1={ id:'Kc1', hostType:'keyResult', hostId:'KR2', objectiveId:'O1', linkParent:'Kmd', linkType:'contribute', target:80 };
  approx(C.effTarget(krC1,[msDef,krC1]), 80, 'contribute-linked KR keeps its own target override');
  var krC2={ id:'Kc2', hostType:'keyResult', hostId:'KR3', objectiveId:'O1', linkParent:'Kmd', linkType:'contribute', target:null };
  approx(C.effTarget(krC2,[msDef,krC2]), 100, 'contribute-linked KR with no target inherits the milestone target');
  // peer link: a milestone KPI contributing to an initiative KPI resolves (define-down across the tier), no cycle
  var initDef={ id:'Kin', hostType:'initiative', hostId:'I1', isDefiner:true, groupId:null, direction:'up', target:100, name:'Init metric' };
  var msPeer={ id:'Kmp', hostType:'milestone', hostId:'MS1', linkParent:'Kin', linkType:'contribute', target:null };
  eq(C.wouldCreateCycle('Kmp','Kin',[initDef,msPeer]), false, 'peer milestone<->initiative link is not a cycle');
  approx(C.effTarget(msPeer,[initDef,msPeer]), 100, 'peer link: milestone inherits the initiative target');
  eq(C.wouldCreateCycle('Kin','Kin',[initDef]), true, 'self-link is still rejected as a cycle');
})();

/* ---- milestone KPIs: readings on linked KRs roll UP to the milestone score (1c) --- */
(function () {
  var msDef={ id:'Kmd', hostType:'milestone', hostId:'MS1', isDefiner:true, groupId:null, direction:'up', target:100, name:'Peak current' };
  var kr={ id:'Kkr', hostType:'keyResult', hostId:'KR1', objectiveId:'O1', linkParent:'Kmd', linkType:'contribute', target:null };
  var exec={ 'D':{ keyResults:[{id:'KR1',objectiveId:'O1'}], kpis:[msDef,kr], kpiUpdates:[{kpiId:'Kkr',value:80,timestamp:1}] } };
  approx(C.effValue(msDef, exec['D'].kpis, exec), 80, '1c: a linked KR reading rolls UP to the milestone definer value');
  approx(C.milestoneScore('MS1', exec), 80, 'milestoneScore reflects the rolled-up KR reading (80/100 up)');
  eq(C.milestoneAchieved({id:'MS1'}, exec), false, 'milestone not achieved at 80%');
  exec['D'].kpiUpdates=[{kpiId:'Kkr',value:100,timestamp:1}];
  approx(C.milestoneScore('MS1', exec), 100, 'milestoneScore hits 100 when the KR reading meets the target');
  eq(C.milestoneAchieved({id:'MS1'}, exec), true, 'milestone achieved when the rolled-up KPI reaches 100');
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
    models: [{ id: 'M1', productId: 'P1' }, { id: 'M1b', productId: 'P1' }, { id: 'M2', productId: 'P2' },
             { id: 'MS', productId: 'P2' }, { id: 'MSS', productId: 'P2' }],
    // System model M1 CONTAINS sub-product MS, which itself contains MSS (both live under a different product line)
    composition: [{ id: 'c1', parent: 'M1', child: 'MS' }, { id: 'c2', parent: 'MS', child: 'MSS' }],
    initiatives: [
      { id: 'Iag', divisionId: 'D' },                       // agnostic
      { id: 'Iprod', divisionId: 'D', productId: 'P1' },    // product-specific
      { id: 'Imod', divisionId: 'D', modelId: 'M1' },       // model-specific
      { id: 'Isub', divisionId: 'D', modelId: 'MS' }        // pinned to a sub-product
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
  // a model-pinned initiative may narrow into a SUB-PRODUCT of its model (System init -> Stack objective)
  ok(C.validateClassification({ initiativeId: 'Imod', modelId: 'MS' }, portfolio).ok, 'model init: objective may pin a sub-product of that model');
  ok(C.validateClassification({ initiativeId: 'Imod', modelId: 'MSS' }, portfolio).ok, 'model init: sub-products resolve transitively');
  ok(C.validateClassification({ initiativeId: 'Imod', modelId: 'M1' }, portfolio).ok, 'model init: the model itself still matches');
  ok(!C.validateClassification({ initiativeId: 'Imod', modelId: 'M1b' }, portfolio).ok, 'model init: a sibling model is NOT a sub-product — still blocked');
  ok(!C.validateClassification({ initiativeId: 'Imod', productId: 'P1' }, portfolio).ok, 'model init: broadening to a product is still blocked');
  // the reach is one-directional: a sub-product initiative cannot host its PARENT's objective
  ok(!C.validateClassification({ initiativeId: 'Isub', modelId: 'M1' }, portfolio).ok, 'sub-product init: cannot broaden up to the containing model');
  // product-pinned initiatives deliberately keep the narrow window (Corey: initiatives stay focused)
  ok(!C.validateClassification({ initiativeId: 'Iprod', modelId: 'MS' }, portfolio).ok, 'product init: composition does NOT widen its reach');
  // with no composition edges the rule is exact-match, as before
  var noComp = { products: portfolio.products, models: portfolio.models, objectives: [], initiatives: portfolio.initiatives };
  ok(!C.validateClassification({ initiativeId: 'Imod', modelId: 'MS' }, noComp).ok, 'no composition -> exact match only (unchanged)');
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

/* ---- cascade: gate chaining, locks, committed baselines ------------------ */
(function () {
  var today = 50;
  // O with three gates; G1 finished LATE at 70, G2/G3 undone (pfGate floors to today=50).
  function build(chain) {
    return {
      initiatives: [{ id: 'I', divisionId: 'D', plannedStart: 0, plannedEnd: 40 }],
      milestones: [], milestoneEdges: [],
      objectives: [{ id: 'O', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 40, milestoneIds: [], chainGatesByDate: chain }],
      objectiveEdges: [], stageGateEdges: []
    };
  }
  var execChain = { 'D': { stageGates: [
    { id: 'G1', objectiveId: 'O', plannedDate: 30, actualDate: 70 },
    { id: 'G2', objectiveId: 'O', plannedDate: 40 },
    { id: 'G3', objectiveId: 'O', plannedDate: 45 }
  ] } };

  // no chain: each gate stands alone (gateEff == pfGate)
  var rNo = C.cascade(build(false), execChain, today);
  approx(rNo.gateEffective['G1'], 70, 'solo G1 = its late actual (70)');
  approx(rNo.gateEffective['G2'], 50, 'solo G2 = max(plannedDate 40, today 50) = 50');
  ok(rNo.gateEffective['G3'] === 50, 'solo G3 floors to today, not pushed by G1');

  // chainGatesByDate: G1(30)->G2(40)->G3(45); late G1 pushes both to 70
  var rCh = C.cascade(build(true), execChain, today);
  approx(rCh.gateEffective['G2'], 80, 'chained G2 = late G1 actual (70) + its 10-day gap = 80 (delay propagates)');
  approx(rCh.gateEffective['G3'], 85, 'chained G3 = G2 (80) + its 5-day gap = 85 (delay propagates through the chain)');
  approx(rCh.objectiveProjectedEnd['O'], 85, 'chained gate end (85) flows into objective projEnd');

  // lock exempts the locked gate from inherited push, and shields downstream
  var execLock = JSON.parse(JSON.stringify(execChain));
  execLock['D'].stageGates[1].locked = true;       // lock G2
  execLock['D'].stageGates[1].baselineDate = 40;   // committed to 40
  var rLk = C.cascade(build(true), execLock, today);
  approx(rLk.gateEffective['G2'], 50, 'locked G2 holds at its own pfGate (50), not pushed to 70');
  approx(rLk.gateEffective['G3'], 55, 'locked G2 shields G3 from G1 lateness; G3 = G2 committed (50) + its 5-day gap = 55');

  // lock NEVER fakes on-time: a locked, overdue, undone gate still floors to today AND slips
  var pSolo = {
    initiatives: [{ id: 'I', divisionId: 'D', plannedStart: 0, plannedEnd: 40 }],
    milestones: [], milestoneEdges: [],
    objectives: [{ id: 'O', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 40, milestoneIds: [] }],
    objectiveEdges: [], stageGateEdges: []
  };
  var execOv = { 'D': { stageGates: [{ id: 'GL', objectiveId: 'O', plannedDate: 30, baselineDate: 30, locked: true }] } };
  var rOv = C.cascade(pSolo, execOv, today);
  approx(rOv.gateEffective['GL'], 50, 'locked overdue gate still forecasts to today (50), not frozen at 30');
  ok(rOv.gateSlipped['GL'] === true, 'locked overdue gate is flagged slipped vs its committed baseline');

  // baseline-aware slip thresholds (all finished at 70)
  var execBl = { 'D': { stageGates: [
    { id: 'B60', objectiveId: 'O', plannedDate: 40, actualDate: 70, baselineDate: 60 },
    { id: 'B80', objectiveId: 'O', plannedDate: 40, actualDate: 70, baselineDate: 80 },
    { id: 'BNo', objectiveId: 'O', plannedDate: 40, actualDate: 70 }
  ] } };
  var rBl = C.cascade(pSolo, execBl, today);
  ok(rBl.gateSlipped['B60'] === true, 'committed 60, finished 70 -> slipped');
  ok(rBl.gateSlipped['B80'] === false, 'committed 80, finished 70 -> not slipped');
  ok(rBl.gateSlipped['BNo'] === false, 'no committed baseline -> never slipped');

  // explicit stageGateEdges across objectives, with lag
  var pEdge = {
    initiatives: [{ id: 'I', divisionId: 'D', plannedStart: 0, plannedEnd: 40 }],
    milestones: [], milestoneEdges: [],
    objectives: [
      { id: 'Oa', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 40, milestoneIds: [] },
      { id: 'Ob', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 40, milestoneIds: [] }
    ],
    objectiveEdges: [], stageGateEdges: [{ fromGate: 'Ga', toGate: 'Gb', lagDays: 5 }]
  };
  var execEdge = { 'D': { stageGates: [
    { id: 'Ga', objectiveId: 'Oa', plannedDate: 30, actualDate: 70 },
    { id: 'Gb', objectiveId: 'Ob', plannedDate: 40 }
  ] } };
  var rEd = C.cascade(pEdge, execEdge, today);
  approx(rEd.gateEffective['Gb'], 75, 'cross-objective edge: Gb = Ga end (70) + lag 5');

  // gate cycle guard: Gx<->Gy terminates and is reported
  var pCyc = {
    initiatives: [{ id: 'I', divisionId: 'D', plannedStart: 0, plannedEnd: 40 }],
    milestones: [], milestoneEdges: [],
    objectives: [{ id: 'O', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 40, milestoneIds: [] }],
    objectiveEdges: [], stageGateEdges: [{ fromGate: 'Gx', toGate: 'Gy', lagDays: 0 }, { fromGate: 'Gy', toGate: 'Gx', lagDays: 0 }]
  };
  var execCyc = { 'D': { stageGates: [
    { id: 'Gx', objectiveId: 'O', plannedDate: 40 },
    { id: 'Gy', objectiveId: 'O', plannedDate: 45 }
  ] } };
  var rCy = C.cascade(pCyc, execCyc, today);
  ok(rCy.gateEffective['Gx'] != null && rCy.gateEffective['Gy'] != null, 'gate cycle terminates with values');
  ok(rCy.cycles.some(function (c) { return c.indexOf('GATE:') === 0; }), 'gate cycle reported');

  // backward compat: with no new fields, gateEffective == pfGate, no slip flags
  var execPlain = { 'D': { stageGates: [
    { id: 'P1', objectiveId: 'O', plannedDate: 90 },                 // future, undone -> max(90,50)=90
    { id: 'P2', objectiveId: 'O', plannedDate: 30, actualDate: 35 }  // done -> 35
  ] } };
  var rPl = C.cascade(pSolo, execPlain, today);
  ok(rPl.gateEffective['P1'] === 90 && rPl.gateEffective['P2'] === 35, 'no new fields -> gateEffective == pfGate (forecast unchanged)');
  ok(rPl.gateSlipped['P1'] === false && rPl.gateSlipped['P2'] === false, 'no baselines -> no slip flags');
})();

/* ---- cascade: gate edges + chain flag sourced from execDocs -------------- */
(function () {
  var today = 50;
  var portfolio = {
    initiatives: [{ id: 'I', divisionId: 'D', plannedStart: 0, plannedEnd: 40 }],
    milestones: [], milestoneEdges: [],
    objectives: [
      { id: 'Oa', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 40, milestoneIds: [] },
      { id: 'Ob', divisionId: 'D', initiativeId: 'I', plannedStart: 0, plannedEnd: 40, milestoneIds: [] }
    ],
    objectiveEdges: []   // NO portfolio.stageGateEdges, NO objective.chainGatesByDate
  };
  // edge + chain flag live in the execDoc, as the execution app writes them
  var exec = { 'D': {
    stageGates: [
      { id: 'Ga', objectiveId: 'Oa', plannedDate: 30, actualDate: 70 },
      { id: 'Gb', objectiveId: 'Ob', plannedDate: 40 },
      { id: 'Gc1', objectiveId: 'Oa', plannedDate: 32 },
      { id: 'Gc2', objectiveId: 'Oa', plannedDate: 38 }
    ],
    stageGateEdges: [{ fromGate: 'Ga', toGate: 'Gb', lagDays: 5 }],
    chainGatesByDate: { 'Oa': true }
  } };
  var r = C.cascade(portfolio, exec, today);
  approx(r.gateEffective['Gb'], 75, 'execDoc edge: Gb = Ga end (70) + lag 5');
  approx(r.gateEffective['Gc1'], 72, 'execDoc chain flag: Gc1 = late Ga (70) + its 2-day gap = 72');
  approx(r.gateEffective['Gc2'], 78, 'execDoc chain flag: Gc2 = Gc1 (72) + its 6-day gap = 78');
})();

/* ---- classifyGate: pure state machine ------------------------------------ */
(function () {
  var T = 50;
  ok(C.classifyGate({ actualDate: 40, plannedDate: 50 }, T) === 'passed', 'done on/before plan -> passed');
  ok(C.classifyGate({ actualDate: 70, plannedDate: 50 }, T) === 'passed-late', 'done after plan (no baseline) -> passed-late');
  ok(C.classifyGate({ actualDate: 70, plannedDate: 50, baselineDate: 55 }, T) === 'passed-late', 'done after committed baseline -> passed-late');
  ok(C.classifyGate({ actualDate: 58, plannedDate: 60, baselineDate: 55 }, T) === 'passed-late', 'baseline precedence: 58 > committed 55 -> passed-late even though < plan 60');
  ok(C.classifyGate({ actualDate: 52, plannedDate: 60, baselineDate: 55 }, T) === 'passed', 'done before committed baseline -> passed');
  ok(C.classifyGate({ plannedDate: 30 }, T) === 'overdue', 'undone & plan past due -> overdue');
  ok(C.classifyGate({ plannedDate: 90 }, T) === 'pending', 'undone & plan in future -> pending');
  ok(C.classifyGate(null, T) === 'pending', 'null gate -> pending');
})();

/* ---- KR tracking modes: statistics, statistical/binary KPIs, %, sub-KRs --- */
(function(){
  // computeStat
  approx(C.computeStat('average', [10,20,30,40]), 25, 'stat average');
  approx(C.computeStat('median', [10,20,30,40]), 25, 'stat median (even)');
  approx(C.computeStat('median', [10,20,30]), 20, 'stat median (odd)');
  approx(C.computeStat('max', [10,20,30,40]), 40, 'stat max');
  approx(C.computeStat('min', [10,20,30,40]), 10, 'stat min');
  approx(C.computeStat('range', [10,20,30,40]), 30, 'stat range');
  approx(C.computeStat('stddev', [10,20,30,40]), 12.909944, 'stat stddev (sample n-1)', 1e-4);
  approx(C.computeStat('cv', [10,20,30,40]), 51.639778, 'stat cv (%)', 1e-4);

  // statistical KPI: aggregate ALL posted readings (readCount no longer windows), then grade vs target
  var exStat = { D: {
    keyResults: [{ id:'KRs', objectiveId:'O', trackingType:'kpi' }],
    kpis: [{ id:'Ks', hostType:'keyResult', hostId:'KRs', objectiveId:'O', direction:'up', target:30, targetType:'statistical', statistic:'average', readCount:3, groupId:null }],
    kpiUpdates: [{kpiId:'Ks',value:10,timestamp:1},{kpiId:'Ks',value:20,timestamp:2},{kpiId:'Ks',value:30,timestamp:3},{kpiId:'Ks',value:40,timestamp:4}]
  }};
  approx(C.keyResultScore('KRs', exStat), 100*25/30, 'statistical KPI: avg of ALL (10,20,30,40)=25 vs target 30 -> 83.3 (readCount does not window)', 1e-3);
  exStat.D.kpis[0].readCount = '';
  exStat.D.kpis[0].target = 25;
  approx(C.keyResultScore('KRs', exStat), 100, 'statistical readCount blank -> avg all (25) vs target 25 -> 100');
  eq(C.readingCount('Ks', exStat), 4, 'readingCount: counts all numeric readings posted to the kpi');

  // binary KPI: met (>=1) -> 100, else 0
  var exBin = { D: {
    keyResults: [{ id:'KRb', objectiveId:'O', trackingType:'kpi' }],
    kpis: [{ id:'Kb', hostType:'keyResult', hostId:'KRb', objectiveId:'O', targetType:'binary', groupId:null }],
    kpiUpdates: [{ kpiId:'Kb', value:1, timestamp:1 }]
  }};
  approx(C.keyResultScore('KRb', exBin), 100, 'binary KPI met (1) -> 100');
  exBin.D.kpiUpdates = [{ kpiId:'Kb', value:0, timestamp:1 }];
  approx(C.keyResultScore('KRb', exBin), 0, 'binary KPI not met (0) -> 0');
  ok(C.kpiScore({ targetType:'binary' }, 1) === 100 && C.kpiScore({ targetType:'binary' }, 0) === 0 && C.kpiScore({ targetType:'binary' }, null) === null, 'kpiScore binary 1/0/null');

  // percentage KR -> manual progress
  var exPct = { D: { keyResults:[{ id:'KRp', objectiveId:'O', trackingType:'percentage', progress:70 }], kpis:[], kpiUpdates:[] }};
  approx(C.keyResultScore('KRp', exPct), 70, 'percentage KR -> manual progress 70');
  exPct.D.keyResults[0] = { id:'KRp', objectiveId:'O', trackingType:'percentage' };
  ok(C.keyResultScore('KRp', exPct) === null, 'percentage KR with no progress -> null');

  // sub-KR weighted rollup
  var exSub = { D: { keyResults:[{ id:'KRx', objectiveId:'O', trackingType:'subkr', subKrs:[
    { name:'a', weight:1, trackingType:'percentage', progress:80 },
    { name:'b', weight:3, trackingType:'kpi', kpis:[{ type:'demonstration', direction:'up', target:50, current:50 }] }
  ]}], kpis:[], kpiUpdates:[] }};
  approx(C.keyResultScore('KRx', exSub), 95, 'subkr KR: weighted (1*80 + 3*100)/4 = 95');

  // embedded-KPI scoring units
  approx(C.scoreEmbeddedKpi({ type:'demonstration', direction:'up', target:100, current:80 }), 80, 'embedded up: 80/100 -> 80');
  approx(C.scoreEmbeddedKpi({ direction:'decrease', target:50, current:50 }), 100, 'embedded decrease at target -> 100');
  approx(C.scoreEmbeddedKpi({ direction:'decrease', target:50, current:100 }), 50, 'embedded decrease over target -> 50');
  ok(C.scoreEmbeddedKpi({ type:'binary', current:1 }) === 100, 'embedded binary met -> 100');
  ok(C.scoreEmbeddedKpi({ type:'binary', current:0 }) === 0, 'embedded binary unmet -> 0');
  ok(C.scoreEmbeddedKpi({ type:'demonstration', direction:'up', target:100, current:null }) === null, 'embedded unmeasured -> null');

  // subKrScore null handling
  approx(C.subKrScore([
    { weight:1, trackingType:'percentage', progress:80 },
    { weight:3, trackingType:'kpi', kpis:[{ type:'demonstration', direction:'up', target:50, current:null }] }
  ]), 80, 'subKrScore skips unmeasured sub-KR (only the 80 counts)');
  ok(C.subKrScore([]) === null, 'empty subKrs -> null');

  // back-compat: KR with no trackingType behaves as KPI-mean (unchanged)
  var exCompat = { D: {
    keyResults: [{ id:'KRc', objectiveId:'O' }],
    kpis: [{ id:'Kc', hostType:'keyResult', hostId:'KRc', objectiveId:'O', direction:'up', target:100, groupId:null }],
    kpiUpdates: [{ kpiId:'Kc', value:80, timestamp:1 }]
  }};
  approx(C.keyResultScore('KRc', exCompat), 80, 'back-compat: KR with no trackingType -> KPI mean (80)');
})();

/* ---- cross-document KPI resolution (portfolio target ↓ / exec readings ↑) -- */
(function(){
  var pf = {
    objectives: [{ id:'O1', initiativeId:'INIT1', divisionId:'D', quarter:'Q1' }],
    kpis: [{ id:'PK1', hostType:'initiative', hostId:'INIT1', objectiveId:null, isDefiner:true, groupId:'G1', direction:'up', target:80, unit:'A/g' }],
    keyResults: [{ id:'KR1', objectiveId:'O1' }]   // duplicate structure that must NOT be double-counted
  };
  var ex = {
    keyResults: [{ id:'KR1', objectiveId:'O1' }],
    kpis: [{ id:'EK1', hostType:'keyResult', hostId:'KR1', objectiveId:'O1', isDefiner:false, groupId:'G1' }],
    kpiUpdates: [{ kpiId:'EK1', value:60, timestamp:1 }]
  };
  var combined = C.withPortfolio(pf, { D: ex });
  ok(combined['__portfolio__'] === pf && combined.D === ex, 'withPortfolio builds reserved-key map');
  ok(C.PORTFOLIO_KEY === '__portfolio__', 'PORTFOLIO_KEY exported');
  ok(C.krsForObjective('O1', combined).length === 1, 'structural iterators skip portfolio keyResults (no double-count)');

  var pool = ex.kpis.concat(pf.kpis); // mimics allKpis(combined)
  approx(C.effTarget(ex.kpis[0], pool), 80, 'exec member effTarget climbs into portfolio definer -> 80');
  approx(C.effValue(ex.kpis[0], pool, combined), 60, 'exec member effValue resolves its own reading -> 60');
  approx(C.effValue(pf.kpis[0], pool, combined), 60, 'initiative definer value descends across objective scope to exec reading -> 60');
  approx(C.kpiScoreResolved(pf.kpis[0], pool, combined), 75, 'initiative KPI scored from exec reading -> 75');
  approx(C.keyResultScore('KR1', combined), 75, 'cross-doc KR: target 80 (portfolio) vs value 60 (exec) -> 75');

  approx(C.rollupObjective('O1', pf, combined), 75, 'rollupObjective reads cross-doc cascade -> 75');
  approx(C.rollupInitiative('INIT1', pf, combined), 75, 'rollupInitiative cross-doc -> 75');
  approx(C.rollupDivision('D', pf, combined), 75, 'rollupDivision cross-doc -> 75');
  approx(C.rollupCompany(pf, combined), 75, 'rollupCompany cross-doc -> 75');

  // statistical portfolio target aggregating exec readings
  var pf2 = { objectives:[{id:'O1',initiativeId:'INIT1',divisionId:'D',quarter:'Q1'}],
    kpis:[{ id:'PK2', hostType:'initiative', hostId:'INIT1', objectiveId:null, isDefiner:true, groupId:'G2', direction:'up', target:30, targetType:'statistical', statistic:'average', readCount:3 }] };
  var ex2 = { keyResults:[{id:'KR1',objectiveId:'O1'}],
    kpis:[{ id:'EK2', hostType:'keyResult', hostId:'KR1', objectiveId:'O1', isDefiner:false, groupId:'G2' }],
    kpiUpdates:[{kpiId:'EK2',value:10,timestamp:1},{kpiId:'EK2',value:20,timestamp:2},{kpiId:'EK2',value:30,timestamp:3},{kpiId:'EK2',value:40,timestamp:4}] };
  approx(C.keyResultScore('KR1', C.withPortfolio(pf2,{D:ex2})), 100*25/30, 'cross-doc statistical: avg ALL (10,20,30,40)=25 vs portfolio target 30 -> 83.3', 1e-3);

  // binary portfolio target met by exec reading
  var pf3 = { objectives:[{id:'O1',initiativeId:'INIT1',divisionId:'D',quarter:'Q1'}],
    kpis:[{ id:'PK3', hostType:'initiative', hostId:'INIT1', objectiveId:null, isDefiner:true, groupId:'G3', targetType:'binary' }] };
  var ex3 = { keyResults:[{id:'KR1',objectiveId:'O1'}],
    kpis:[{ id:'EK3', hostType:'keyResult', hostId:'KR1', objectiveId:'O1', isDefiner:false, groupId:'G3' }],
    kpiUpdates:[{kpiId:'EK3',value:1,timestamp:1}] };
  approx(C.keyResultScore('KR1', C.withPortfolio(pf3,{D:ex3})), 100, 'cross-doc binary: exec reading 1 vs portfolio binary target -> 100');
})();

/* ---- Unified KPI Model: typed links (Phase B) ---------------------------- */
(function(){
  function docOf(kpis, ups){ return { D: { kpis:kpis, kpiUpdates:ups||[] } }; }

  eq(C.KPI_LEVEL.product, 5, 'level: product = 5');
  eq(C.KPI_LEVEL.component, 4, 'level: component = 4');

  // direct: child shows parent target exactly (own ignored); value flows up
  (function(){
    var kpis=[
      { id:'R', hostType:'product', hostId:'P', direction:'up', target:100, linkParent:null },
      { id:'C', hostType:'initiative', hostId:'I', target:55, linkParent:'R', linkType:'direct' }
    ];
    var ex=docOf(kpis,[{kpiId:'C',value:80,timestamp:1}]);
    approx(C.effectiveTarget(kpis[1], kpis), 100, 'direct: child target = parent (own 55 ignored)');
    approx(C.effectiveValue(kpis[0], kpis, ex), 80, 'direct: child value flows up to root');
  })();

  // contribute: child overrides target (else inherits); value flows up
  (function(){
    var kpis=[
      { id:'R', hostType:'product', hostId:'P', direction:'up', target:100, linkParent:null },
      { id:'Ca', hostType:'keyResult', hostId:'K1', target:90, linkParent:'R', linkType:'contribute' },
      { id:'Cb', hostType:'keyResult', hostId:'K2', linkParent:'R', linkType:'contribute' }
    ];
    approx(C.effectiveTarget(kpis[1], kpis), 90, 'contribute: own target override wins');
    approx(C.effectiveTarget(kpis[2], kpis), 100, 'contribute: no own target -> inherit parent');
    approx(C.effectiveValue(kpis[0], kpis, docOf(kpis,[{kpiId:'Ca',value:45,timestamp:1}])), 45, 'contribute: value flows up');
  })();

  // specification: target inherits/overrides; value does NOT flow up (firewall)
  (function(){
    var kpis=[
      { id:'R', hostType:'product', hostId:'P', direction:'up', target:100, linkParent:null },
      { id:'C', hostType:'component', hostId:'CMP', linkParent:'R', linkType:'specification' }
    ];
    var ex=docOf(kpis,[{kpiId:'C',value:70,timestamp:1}]);
    approx(C.effectiveTarget(kpis[1], kpis), 100, 'specification: target cascades down');
    ok(C.effectiveValue(kpis[0], kpis, ex)==null, 'specification firewall: component value hidden from product');
    approx(C.effectiveValue(kpis[1], kpis, ex), 70, 'specification child still reads its own value');
  })();

  // precedence: direct outranks contribute among children (no linkPriority)
  (function(){
    var kpis=[
      { id:'R', hostType:'initiative', hostId:'I', direction:'up', target:100, linkParent:null },
      { id:'Cd', hostType:'keyResult', hostId:'K1', linkParent:'R', linkType:'direct' },
      { id:'Cc', hostType:'keyResult', hostId:'K2', linkParent:'R', linkType:'contribute' }
    ];
    approx(C.effectiveValue(kpis[0], kpis, docOf(kpis,[{kpiId:'Cd',value:70,timestamp:1},{kpiId:'Cc',value:40,timestamp:5}])), 70,
      'precedence: direct child (70) beats contribute child (40) despite older reading');
  })();

  // precedence: a node's own reading outranks its children
  (function(){
    var kpis=[
      { id:'R', hostType:'keyResult', hostId:'K', direction:'up', target:100, linkParent:null },
      { id:'C', hostType:'stageGate', hostId:'G', linkParent:'R', linkType:'contribute' }
    ];
    approx(C.effectiveValue(kpis[0], kpis, docOf(kpis,[{kpiId:'C',value:40,timestamp:5},{kpiId:'R',value:90,timestamp:1}])), 90,
      'precedence: parent own reading (90) outranks contribute child (40)');
  })();

  // precedence: quarter descending among same-type children
  (function(){
    var pf={ objectives:[{id:'Oq1',quarter:'Q1'},{id:'Oq2',quarter:'Q2'}] };
    var kpis=[
      { id:'R', hostType:'initiative', hostId:'I', objectiveId:null, direction:'up', target:100, linkParent:null },
      { id:'Cq1', hostType:'keyResult', hostId:'K1', objectiveId:'Oq1', linkParent:'R', linkType:'contribute' },
      { id:'Cq2', hostType:'keyResult', hostId:'K2', objectiveId:'Oq2', linkParent:'R', linkType:'contribute' }
    ];
    var ex=C.withPortfolio(pf, { D:{ kpis:kpis, kpiUpdates:[{kpiId:'Cq1',value:30,timestamp:9},{kpiId:'Cq2',value:60,timestamp:1}] } });
    approx(C.effectiveValue(kpis[0], kpis, ex), 60, 'precedence: Q2 contributor (60) beats Q1 (30) despite older reading');
  })();

  // precedence: explicit linkPriority overrides relationRank
  (function(){
    var kpis=[
      { id:'R', hostType:'initiative', hostId:'I', direction:'up', target:100, linkParent:null },
      { id:'Cd', hostType:'keyResult', hostId:'K1', linkParent:'R', linkType:'direct' },
      { id:'Cc', hostType:'keyResult', hostId:'K2', linkParent:'R', linkType:'contribute', linkPriority:5 }
    ];
    approx(C.effectiveValue(kpis[0], kpis, docOf(kpis,[{kpiId:'Cd',value:70,timestamp:1},{kpiId:'Cc',value:40,timestamp:1}])), 40,
      'precedence: linkPriority 5 lifts contribute (40) above direct (70)');
  })();

  // fall-through: unmeasured top-ranked contributor skipped -> next with a value
  (function(){
    var kpis=[
      { id:'R', hostType:'initiative', hostId:'I', direction:'up', target:100, linkParent:null },
      { id:'Cd', hostType:'keyResult', hostId:'K1', linkParent:'R', linkType:'direct' },
      { id:'Cc', hostType:'keyResult', hostId:'K2', linkParent:'R', linkType:'contribute' }
    ];
    approx(C.effectiveValue(kpis[0], kpis, docOf(kpis,[{kpiId:'Cc',value:55,timestamp:1}])), 55,
      'fall-through: unmeasured direct child skipped, contribute value (55) used');
  })();

  // multi-hop chain: product -> component -> initiative -> KR
  (function(){
    var kpis=[
      { id:'RP', hostType:'product', hostId:'P', direction:'up', target:100, linkParent:null },
      { id:'CMP', hostType:'component', hostId:'C', linkParent:'RP', linkType:'specification' },
      { id:'INI', hostType:'initiative', hostId:'I', linkParent:'CMP', linkType:'contribute' },
      { id:'KR', hostType:'keyResult', hostId:'K', linkParent:'INI', linkType:'contribute' }
    ];
    var ex=docOf(kpis,[{kpiId:'KR',value:80,timestamp:1}]);
    approx(C.effectiveTarget(kpis[3], kpis), 100, 'chain: target cascades product -> KR');
    approx(C.effectiveValue(kpis[1], kpis, ex), 80, 'chain: KR value flows up through initiative to component');
    ok(C.effectiveValue(kpis[0], kpis, ex)==null, 'chain: specification edge firewalls component value from product');
  })();

  // cycle safety: a linkParent cycle must terminate, not hang
  (function(){
    var kpis=[
      { id:'A', hostType:'initiative', hostId:'I', direction:'up', linkParent:'B', linkType:'contribute' },
      { id:'B', hostType:'keyResult', hostId:'K', linkParent:'A', linkType:'contribute' }
    ];
    var ex=docOf(kpis,[{kpiId:'A',value:25,timestamp:1}]);
    ok(C.effectiveTarget(kpis[0], kpis)!==undefined, 'cycle: effectiveTarget terminates');
    ok(C.effectiveValue(kpis[0], kpis, ex)!==undefined, 'cycle: effectiveValue terminates');
  })();

  // migrateKpiLinks: legacy groupId/isDefiner -> link fields, identical scores
  (function(){
    var legacy=[
      { id:'D', hostType:'keyResult', hostId:'K', objectiveId:'O', groupId:'G', isDefiner:true, direction:'up', target:100 },
      { id:'M', hostType:'stageGate', hostId:'G1', objectiveId:'O', groupId:'G', isDefiner:false }
    ];
    var ex=docOf(legacy,[{kpiId:'M',value:80,timestamp:1}]);
    var before=C.effectiveValue(legacy[0], legacy, ex);
    ok(C.migrateKpiLinks(legacy)===true, 'migrate: reports a change');
    eq(legacy[0].linkParent, null, 'migrate: definer becomes root');
    eq(legacy[1].linkParent, 'D', 'migrate: member links to its definer');
    eq(legacy[1].linkType, 'contribute', 'migrate: member link is contribute');
    approx(C.effectiveValue(legacy[0], legacy, ex), before, 'migrate: value identical before/after');
    approx(C.effectiveValue(legacy[0], legacy, ex), 80, 'migrate: value is the member reading');
    ok(C.migrateKpiLinks(legacy)===false, 'migrate: idempotent second time');
  })();
})();

/* ---- hostScore: generic host-level scoring (product/component) ------------ */
(function(){
  var kpis=[
    { id:'P', hostType:'product', hostId:'PRD', direction:'down', target:50, linkParent:null },
    { id:'C', hostType:'component', hostId:'CMP', direction:'up', target:100, linkParent:null }
  ];
  var em={ D:{ kpis:kpis, kpiUpdates:[{kpiId:'P',value:62,timestamp:1},{kpiId:'C',value:80,timestamp:1}] } };
  approx(C.hostScore('product','PRD',em), C.kpiScore({targetType:'demonstration',direction:'down',target:50},62), 'hostScore(product) = product KPI score');
  approx(C.hostScore('component','CMP',em), 80, 'hostScore(component) up 100 vs 80 = 80');
  ok(C.hostScore('product','NONE',em)==null, 'hostScore with no KPIs on host = null');
})();

/* ---- wouldCreateCycle: reject linking that would loop the parent chain ---- */
(function(){
  // chain: C -> B -> A(root)
  var kpis=[ {id:'A',linkParent:null}, {id:'B',linkParent:'A',linkType:'contribute'}, {id:'C',linkParent:'B',linkType:'contribute'} ];
  ok(C.wouldCreateCycle('A','C',kpis)===true, 'pointing root A at its descendant C = cycle');
  ok(C.wouldCreateCycle('B','C',kpis)===true, 'pointing B at its descendant C = cycle');
  ok(C.wouldCreateCycle('X','A',kpis)===false, 'a fresh node X under root A = no cycle');
  ok(C.wouldCreateCycle('A','A',kpis)===true, 'self-link = cycle');
  ok(C.wouldCreateCycle('C','A',kpis)===false, 'C under A (already its ancestor, no new loop) = no cycle');
})();

/* ---- product composition (model-to-model): children / parents / descendants / cycle ---- */
(function(){
  // sys-M contains stack-N; stack-N contains cell-P.  (edge.parent CONTAINS edge.child)
  var comp=[ {id:'e1',parent:'M',child:'N'}, {id:'e2',parent:'M',child:'K'}, {id:'e3',parent:'N',child:'P'} ];
  ok(JSON.stringify(C.compositionChildren('M',comp))==='["N","K"]', 'direct sub-products of M = [N,K]');
  ok(JSON.stringify(C.compositionParents('N',comp))==='["M"]', 'N is used in M');
  ok(C.descendantModels('M',comp).sort().join(',')==='K,N,P', 'transitive descendants of M = K,N,P');
  ok(C.descendantModels('P',comp).length===0, 'leaf P has no descendants');
  ok(C.wouldComposeCycle('M','M',comp)===true, 'self-compose = cycle');
  ok(C.wouldComposeCycle('N','M',comp)===true, 'N containing M when M already contains N = cycle');
  ok(C.wouldComposeCycle('P','M',comp)===true, 'P containing M (M is a transitive ancestor) = cycle');
  ok(C.wouldComposeCycle('M','Q',comp)===false, 'M containing a fresh model Q = no cycle');
  ok(C.compositionChildren('M',undefined).length===0, 'null-safe on empty composition');
})();

/* ---- importableModelKpis: a model's keyResult-hosted definer specs only ---- */
(function(){
  var kpis=[
    {id:'k1',objectiveId:'N',hostType:'keyResult',linkParent:null,name:'Power'},
    {id:'k2',objectiveId:'N',hostType:'keyResult',linkParent:null,name:'Efficiency'},
    {id:'k3',objectiveId:'N',hostType:'keyResult',linkParent:'k1',linkType:'contribute'}, // a member, not a definer
    {id:'k4',objectiveId:'N',hostType:'component',linkParent:null,name:'Seal torque'},     // component-level, excluded
    {id:'k5',objectiveId:'OTHER',hostType:'keyResult',linkParent:null,name:'Other model'}  // different model
  ];
  var imp=C.importableModelKpis('N',kpis).map(k=>k.id);
  ok(imp.length===2 && imp.indexOf('k1')>=0 && imp.indexOf('k2')>=0, 'only N\'s keyResult definers (k1,k2)');
  ok(imp.indexOf('k3')<0, 'member specs excluded');
  ok(imp.indexOf('k4')<0, 'component-level metrics excluded');
  ok(imp.indexOf('k5')<0, 'other models excluded');
})();

/* ---- rawScore: bare value vs bare target ---- */
(function(){
  ok(C.rawScore(100,100,'up')===100, 'meets an up target = 100');
  ok(C.rawScore(null,100,'up')===null, 'no value = null');
  ok(C.rawScore(100,null,'up')===null, 'no target = null');
  ok(C.rawScore(50,{lo:40,hi:60},'range')===100, 'inside a range = 100');
  ok(C.rawScore(50,50,'up')===C.rawScore(50,50,'down'), 'exact hit scores equal either direction');
})();

/* ---- cross-doc linkage scope (execution → product/model KPIs) ---- */
(function(){
  // products P1-P4; models M1,M2 in P1, M3 in P2, M4 in P3, M5 in P4; composition M1⊃M3, M3⊃M4
  var P = {
    products:[{id:'P1'},{id:'P2'},{id:'P3'},{id:'P4'}],
    models:[{id:'M1',productId:'P1'},{id:'M2',productId:'P1'},{id:'M3',productId:'P2'},{id:'M4',productId:'P3'},{id:'M5',productId:'P4'}],
    initiatives:[{id:'I1'},{id:'I2',productId:'P4'}],
    objectives:[
      {id:'O1',divisionId:'D',modelId:'M1',initiativeId:'I1'},    // classified to model M1
      {id:'O2',divisionId:'D',productId:'P2',initiativeId:'I1'},  // classified to product P2
      {id:'O3',divisionId:'D',initiativeId:'I2'},                 // agnostic → inherits I2 (product P4)
      {id:'OX',divisionId:'OTHER',modelId:'M5',initiativeId:'I1'} // another division, ignored
    ]
  };
  var comp = [{id:'e1',parent:'M1',child:'M3'},{id:'e2',parent:'M3',child:'M4'}];
  var t = C.classifiedTargets(P, comp, 'D');
  ok(t.models.slice().sort().join(',')==='M1,M3,M4,M5', 'in-scope models: classified M1, P2\'s M3, sub-products M3→M4, inherited P4\'s M5');
  ok(t.models.indexOf('M2')<0, 'a sibling model of a model-classified product (M2 in P1) is NOT in scope');
  ok(t.products.slice().sort().join(',')==='P1,P2,P3,P4', 'in-scope products: P2 classified, P1 (M1), P3 (M4 sub-product), P4 (inherited + M5)');

  var specK = [
    {id:'PK1',hostType:'product',hostId:'P1',name:'P1 power'},          // product definer, in scope
    {id:'MK1',hostType:'keyResult',objectiveId:'M1',name:'M1 spec'},    // model headline definer, in scope
    {id:'MK1b',hostType:'keyResult',objectiveId:'M1',linkParent:'MK1',linkType:'contribute'}, // linked member, not a headline
    {id:'MK2',hostType:'keyResult',objectiveId:'M2',name:'M2 spec'},    // M2 out of scope → excluded
    {id:'PK4',hostType:'product',hostId:'P4',name:'P4 power'}           // product definer, in scope
  ];
  ok(C.targetKpisInScope({products:['P1','P4'],models:['M1']}, specK).map(function(k){return k.id;}).sort().join(',')==='MK1,PK1,PK4',
     'linkable targets = model headline specs + product definers; excludes members + out-of-scope models');
})();

/* ---- execution KPI linked UP to a product KPI (the issue-2 mechanism) ---- */
(function(){
  var PK = {id:'PK',hostType:'product',hostId:'P1',name:'Power density',direction:'up',unit:'W/cm2',target:1.5};
  var MC = {id:'MC',hostType:'keyResult',objectiveId:'O1',linkParent:'PK',linkType:'contribute',target:null};
  var MD = {id:'MD',hostType:'keyResult',objectiveId:'O1',linkParent:'PK',linkType:'direct',target:0.9};       // own target ignored by direct
  var MS = {id:'MS',hostType:'keyResult',objectiveId:'O1',linkParent:'PK',linkType:'specification',target:2.0}; // firewall + own target
  var exec = { keyResults:[], stageGates:[], kpis:[MC,MD,MS], kpiUpdates:[
    {kpiId:'MC',value:1.2,timestamp:10}, {kpiId:'MS',value:9.9,timestamp:10}
  ]};
  var pool = exec.kpis.concat([PK]);   // allKpisPool = execution kpis + product KPIs pulled from spec docs
  var em = C.withPortfolio({objectives:[{id:'O1',quarter:'Q1 2026'}]}, {'D':exec});

  ok(C.kpiName(MC,pool)==='Power density', 'member name resolves to the product KPI (rootOf)');
  ok(C.kpiDirection(MC,pool)==='up' && C.kpiUnit(MC,pool)==='W/cm2', 'member direction/unit resolve to the product KPI');
  approx(C.effTarget(MC,pool), 1.5, 'contribute member with no own target inherits the product target');
  approx(C.effTarget(MD,pool), 1.5, 'direct member takes the product target (ignores its own)');
  approx(C.effTarget(MS,pool), 2.0, 'specification member keeps its own target');
  approx(C.effValue(MC,pool,em), 1.2, 'member value comes from the execution doc reading');
  approx(C.kpiScoreResolved(MC,pool,em), 80, 'score = 1.2 vs 1.5 (up) = 80');
  approx(C.effValue(PK,pool,em), 1.2, 'product rollup takes the contribute member (1.2), NOT the spec-firewalled MS (9.9)');
})();

/* ---- FMEA / risk register ---- */
(function(){
  // RPN + band
  ok(C.calcRpn(10,8,5)===400, 'rpn = s*o*d');
  ok(C.calcRpn(0,0,0)===1, 'blank sod floors each factor at 1');
  ok(C.calcRpn('7','3','4')===84, 'rpn parses string sod');
  ok(C.rpnBand(200)==='high' && C.rpnBand(199)==='med' && C.rpnBand(100)==='med' && C.rpnBand(99)==='low', 'band thresholds 200/100');
  ok(C.fmeaScaleLabel('severity',1)==='None' && C.fmeaScaleLabel('severity',10)==='Critical', 'severity scale label ends');
  ok(C.fmeaScaleLabel('detection',10)==='Undetectable', 'detection 10 = undetectable');

  // a problem: two modes, worst raw cause 9*9*8=648, a lower cause 5*5*4=100
  var prob = { rid:'r1', objectiveId:'O', gateId:null, status:'open', modes:[
    { mid:'m1', status:'open', effects:[ { eid:'e1', status:'open', causes:[
      { cid:'c1', severity:9, occurrence:9, detection:8, status:'open' },   // 648
      { cid:'c2', severity:5, occurrence:5, detection:4, status:'open' } ]} ]},   // 100
    { mid:'m2', status:'open', effects:[ { eid:'e2', status:'open', causes:[
      { cid:'c3', severity:6, occurrence:2, detection:2, status:'open' } ]} ]} ]};   // 24
  ok(C.worstRpn(prob)===648, 'worstRpn spans the whole tree');
  ok(C.worstUnresolvedRpn(prob,false)===648, 'unresolved worst = 648 when nothing resolved / gate open');

  // resolving the worst cause drops unresolved to the next (100), but raw worst still 648
  var p2 = JSON.parse(JSON.stringify(prob)); p2.modes[0].effects[0].causes[0].status='resolved';
  ok(C.worstUnresolvedRpn(p2,false)===100, 'resolving a cause is skipped by unresolved worst');
  ok(C.worstRpn(p2)===648, 'raw worst ignores resolution');
  // resolving the whole effect skips its causes
  var p3 = JSON.parse(JSON.stringify(prob)); p3.modes[0].effects[0].status='resolved';
  ok(C.worstUnresolvedRpn(p3,false)===24, 'resolved effect skips all its causes → next mode 24');
  // problem resolved OR gate passed → 0
  var p4 = JSON.parse(JSON.stringify(prob)); p4.status='resolved';
  ok(C.worstUnresolvedRpn(p4,false)===0, 'resolved problem → 0');
  ok(C.worstUnresolvedRpn(prob,true)===0, 'passed gate → 0 regardless of open causes');

  // scoping: only this objective's problems
  var exec = { risks:[ prob, {rid:'r2',objectiveId:'OTHER',modes:[]}, {rid:'r3',objectiveId:'O',status:'open',modes:[
    { mid:'m',status:'open',effects:[{eid:'e',status:'open',causes:[{cid:'c',severity:5,occurrence:3,detection:1,status:'open'}]}]} ]} ] };   // 15
  var mine = C.fmeaProblemsFor(exec,'O');
  ok(mine.length===2 && mine[0].rid==='r1' && mine[1].rid==='r3', 'fmeaProblemsFor filters by objectiveId');
  ok(C.fmeaProblemsFor(exec,'MISSING').length===0, 'no problems for an unknown objective');

  // rollup with a gate-passed predicate
  var roll = C.fmeaRollup(mine, function(gid){ return false; });
  ok(roll.total===2 && roll.openHigh===1 && roll.openLow===1 && roll.openMed===0 && roll.clear===0, 'rollup bands: one high (648), one low (15)');
  ok(roll.worst===648, 'rollup worst = 648');
  // give r1 a passed gate → it clears, leaving only the low
  var g1 = JSON.parse(JSON.stringify(prob)); g1.gateId='G1';
  var roll2 = C.fmeaRollup([g1, mine[1]], function(gid){ return gid==='G1'; });
  ok(roll2.openHigh===0 && roll2.clear===1 && roll2.openLow===1, 'a passed gate clears its problem from the rollup');

  // constructors: correct shape + unique ids
  var bp = C.blankProblem('O');
  ok(bp.objectiveId==='O' && bp.status==='open' && bp.gateId===null, 'blankProblem tagged to objective, open, no gate');
  ok(bp.modes.length===1 && bp.modes[0].effects.length===1 && bp.modes[0].effects[0].causes.length===1, 'blankProblem seeds one mode/effect/cause');
  var c = bp.modes[0].effects[0].causes[0];
  ok(c.severity===1 && c.occurrence===1 && c.detection===1 && c.status==='open', 'seeded cause defaults to 1/1/1 open');
  ok(C.blankCause().cid !== C.blankCause().cid, 'fmea ids are unique');

  // migration: fills missing arrays/fields, maps legacy id, preserves given ids, keeps objectiveId
  var mig = C.migrateProblem({ id:'legacy', problem:'p', objectiveId:'O', modes:[ { mode:'m', effects:[ { effect:'e', causes:[ { cause:'c', severity:7 } ] } ] } ] });
  ok(mig.rid==='legacy', 'migrate maps legacy id → rid');
  ok(mig.objectiveId==='O' && mig.status==='open' && mig.gateId===null, 'migrate keeps objectiveId, defaults status/gate');
  ok(mig.modes[0].status==='open' && mig.modes[0].effects[0].causes[0].occurrence===1 && mig.modes[0].effects[0].causes[0].detection===1, 'migrate fills missing sod + statuses');
  ok(mig.modes[0].effects[0].causes[0].severity===7, 'migrate preserves provided sod');
  ok(C.migrateProblem(null).modes.length===0 && C.migrateProblem({}).status==='open', 'migrate is null/empty safe');

  // knowns: constructor seeds empty; migrate accepts string or {text} form, keeps ids, is null-safe
  ok(Array.isArray(bp.knowns) && bp.knowns.length===0, 'blankProblem seeds an empty knowns list');
  var kmig = C.migrateProblem({ problem:'p', knowns:['legacy string', {kid:'k9', text:'kept'}, {}] });
  ok(kmig.knowns.length===3, 'migrate keeps all knowns');
  ok(kmig.knowns[0].text==='legacy string' && !!kmig.knowns[0].kid, 'migrate wraps a string known into {kid,text}');
  ok(kmig.knowns[1].kid==='k9' && kmig.knowns[1].text==='kept', 'migrate preserves an object known + its id');
  ok(kmig.knowns[2].text==='' && !!kmig.knowns[2].kid, 'migrate fills a blank known');
  ok(C.migrateProblem({}).knowns.length===0, 'migrate: no knowns → empty list');

  // ---- quarter helpers + layered grouping ----
  (function(){
    var qr=C.quarterRange;
    ok(qr('2026Q1').start==='2026-01-01' && qr('2026Q1').end==='2026-03-31', 'Q1 → Jan1–Mar31');
    ok(qr('2026Q2').start==='2026-04-01' && qr('2026Q2').end==='2026-06-30', 'Q2 → Apr1–Jun30');
    ok(qr('2026Q3').start==='2026-07-01' && qr('2026Q3').end==='2026-09-30', 'Q3 → Jul1–Sep30');
    ok(qr('2026Q4').start==='2026-10-01' && qr('2026Q4').end==='2026-12-31', 'Q4 → Oct1–Dec31 (year end)');
    ok(qr('bad')===null && qr('')===null && qr('2026Q5')===null, 'invalid quarter → null');
    var ql=C.quarterList(['2099Q4','junk'],2026,1,2);
    ok(ql.indexOf('2025Q1')>=0 && ql.indexOf('2028Q4')>=0, 'quarterList spans [ref-1 … ref+2]');
    ok(ql.indexOf('2099Q4')>=0 && ql.indexOf('junk')<0, 'quarterList unions valid used, drops malformed');
    ok(ql[0]==='2025Q1' && ql[ql.length-1]==='2099Q4', 'quarterList sorted');

    var P={ divisions:[{id:'D1'},{id:'D2'}], products:[{id:'P1',divisionId:'D1'}], models:[{id:'M1',productId:'P1'}],
      initiatives:[{id:'I1',divisionId:'D1',modelId:'M1'},{id:'I2',divisionId:'D2'}], objectives:[] };
    var oA={id:'oA',divisionId:'D1',initiativeId:'I1'};                // inherits M1(→P1) from I1
    var oB={id:'oB',divisionId:'D1',initiativeId:'I1',productId:'P1'}; // own product P1, no model
    var oC={id:'oC',divisionId:'D2',initiativeId:'I2'};               // fully agnostic
    var objs=[oA,oB,oC];
    var g1=C.groupObjectives(objs,['division'],P);
    ok(g1.length===2 && g1[0].key==='D1' && g1[0].objs.length===2 && g1[1].key==='D2', 'group by division, portfolio order');
    var g0=C.groupObjectives(objs,[],P);
    ok(g0.length===1 && g0[0].objs.length===3 && g0[0].dim===null, 'no dims → single flat bucket');
    var g2=C.groupObjectives(objs,['division','product','model'],P);
    var d1=g2[0]; ok(d1.key==='D1' && d1.children.length===1 && d1.children[0].key==='P1', 'nested D1 › P1');
    var p1=d1.children[0], mk=p1.children.map(function(n){return n.key;});
    ok(mk.indexOf('M1')>=0 && mk.indexOf('')>=0, 'P1 splits into {M1, none}');
    ok(p1.children[0].key==='', 'none bucket ordered FIRST (renderers skip the level, so its items read on top)');
    var d2=g2[1]; ok(d2.key==='D2' && d2.children[0].key==='' && d2.children[0].children[0].key==='' && d2.children[0].children[0].objs[0].id==='oC', 'agnostic path D2 › none › none → oC');
  })();
})();

/* ---- stage-gate SETS: setScore (% passed), objectiveGateReadiness (min), per-set chaining --- */
(function () {
  var today = 100;
  var execS = { 'D': {
    stageGates: [
      { id: 'g1', objectiveId: 'O1', setId: 'setP', actualDate: 50, plannedDate: 60 },
      { id: 'g2', objectiveId: 'O1', setId: 'setP', actualDate: 55, plannedDate: 60 },
      { id: 'g3', objectiveId: 'O1', setId: 'setP', plannedDate: 200 },
      { id: 'g4', objectiveId: 'O1', setId: 'setP', plannedDate: 200 },
      { id: 'g5', objectiveId: 'O1', setId: 'setQ', actualDate: 40, plannedDate: 50 },
      { id: 'g6', objectiveId: 'O1', setId: 'setQ', actualDate: 45, plannedDate: 50 }
    ],
    stageGateSets: [
      { id: 'setP', objectiveId: 'O1', name: 'P', chained: true },
      { id: 'setQ', objectiveId: 'O1', name: 'Q', chained: true }
    ]
  } };
  approx(C.setScore('setP', execS, today), 50, 'setScore = % passed (2 of 4 -> 50)');
  approx(C.setScore('setQ', execS, today), 100, 'setScore all passed -> 100');
  ok(C.setScore('nope', execS, today) === null, 'setScore of an empty/unknown set -> null');
  approx(C.objectiveGateReadiness('O1', execS, today), 50, 'objective gate readiness = MIN set score (min(50,100)=50)');
  ok(C.objectiveGateReadiness('OX', execS, today) === null, 'objective with no sets -> null');
  ok(C.gatesForSet('setQ', execS).length === 2 && C.setsForObjective('O1', execS).length === 2, 'set helpers list gates + sets');

  // per-set date-chain: a slipped gate pushes its OWN set's successor, not a parallel set's gate
  var portfolio = { divisions: [{ id: 'D' }], objectives: [{ id: 'O1', divisionId: 'D', plannedStart: 0, plannedEnd: 300 }], initiatives: [], models: [], products: [], composition: [], milestones: [], stageGateEdges: [] };
  var execC = { 'D': {
    stageGates: [
      { id: 'A1', objectiveId: 'O1', setId: 'setA', plannedDate: 5, actualDate: 200 },   // done late (day 200)
      { id: 'A2', objectiveId: 'O1', setId: 'setA', plannedDate: 100 },                   // same set, later
      { id: 'B1', objectiveId: 'O1', setId: 'setB', plannedDate: 50 }                     // parallel set
    ],
    stageGateSets: [ { id: 'setA', objectiveId: 'O1', chained: true }, { id: 'setB', objectiveId: 'O1', chained: true } ]
  } };
  var r = C.cascade(portfolio, execC, 10);
  approx(r.gateEffective['A2'], 295, 'per-set chain: A2 = same-set A1 actual (200) + its 95-day gap = 295 (delay propagates)');
  approx(r.gateEffective['B1'], 50, 'per-set chain: parallel B1 is NOT pushed by A1 (stays 50)');

  // a set with chained:false does NOT date-chain its own gates
  var execN = { 'D': {
    stageGates: [ { id: 'A1', objectiveId: 'O1', setId: 'setA', plannedDate: 5, actualDate: 200 }, { id: 'A2', objectiveId: 'O1', setId: 'setA', plannedDate: 100 } ],
    stageGateSets: [ { id: 'setA', objectiveId: 'O1', chained: false } ]
  } };
  approx(C.cascade(portfolio, execN, 10).gateEffective['A2'], 100, 'chained:false set does not push A2 (stays 100)');

  // legacy fallback: no sets + chainGatesByDate -> per-objective chain (B1 IS pushed) -- back-compat
  var execL = { 'D': {
    stageGates: [ { id: 'A1', objectiveId: 'O1', plannedDate: 5, actualDate: 200 }, { id: 'A2', objectiveId: 'O1', plannedDate: 100 }, { id: 'B1', objectiveId: 'O1', plannedDate: 50 } ],
    chainGatesByDate: { O1: true }
  } };
  approx(C.cascade(portfolio, execL, 10).gateEffective['B1'], 245, 'legacy per-objective chain: B1 = A1 (200) + its 45-day gap = 245 (back-compat preserved)');
})();

/* ---- cascade Phase 0: delay PROPAGATION + done-anchor + acceleration opportunity ---------- */
(function () {
  function pkg() {
    return { divisions: [{ id: 'D' }], initiatives: [{ id: 'I', divisionId: 'D', plannedStart: 90, plannedEnd: 200 }],
      objectives: [{ id: 'O', divisionId: 'D', initiativeId: 'I', plannedStart: 90, plannedEnd: 200, milestoneIds: [] }],
      milestones: [], stageGateEdges: [], objectiveEdges: [], milestoneEdges: [] };
  }
  // chained set, generous 50-day slack: G1@100 -> G2@150 -> G3@200
  function ex(g1) {
    return { D: { stageGates: [
      Object.assign({ id: 'G1', objectiveId: 'O', setId: 'S', plannedDate: 100 }, g1),
      { id: 'G2', objectiveId: 'O', setId: 'S', plannedDate: 150 },
      { id: 'G3', objectiveId: 'O', setId: 'S', plannedDate: 200 } ],
      stageGateSets: [{ id: 'S', objectiveId: 'O', chained: true }], tasks: [] } };
  }

  // (1) PROPAGATION: G1 finishes 30 late -> every downstream gate shifts +30 DESPITE 50-day slack
  //     (the old constraint model absorbed the delay and moved nothing)
  var late = C.cascade(pkg(), ex({ actualDate: 130 }), 80);
  approx(late.gateEffective['G1'], 130, 'propagation: G1 = its late actual (130)');
  approx(late.gateEffective['G2'], 180, 'propagation: late G1 shifts G2 +30 (150->180) through its slack');
  approx(late.gateEffective['G3'], 230, 'propagation: shift ripples to G3 (200->230)');
  approx(late.objectiveProjectedEnd['O'], 230, 'propagation: objective estimated completion shifts to 230');
  ok(late.objectiveAcceleration['O'] === 0, 'no acceleration opportunity while running late');

  // (2) undone + overdue predecessor floors at today and still propagates the forecast delay
  var od = C.cascade(pkg(), ex({}), 130);
  approx(od.gateEffective['G2'], 180, 'overdue undone G1 (forecast 130) propagates +30 to G2');
  approx(od.gateEffective['G3'], 230, 'overdue undone G1 propagates +30 to G3');

  // (3) DONE-ANCHOR: G1 late (130) but G2 RECORDED on time (150) -> G2 holds its actual, G3 re-anchors to G2
  var rec = C.cascade(pkg(), { D: { stageGates: [
    { id: 'G1', objectiveId: 'O', setId: 'S', plannedDate: 100, actualDate: 130 },
    { id: 'G2', objectiveId: 'O', setId: 'S', plannedDate: 150, actualDate: 150 },
    { id: 'G3', objectiveId: 'O', setId: 'S', plannedDate: 200 } ],
    stageGateSets: [{ id: 'S', objectiveId: 'O', chained: true }], tasks: [] } }, 80);
  approx(rec.gateEffective['G2'], 150, 'done-anchor: recovered G2 holds its on-time actual (150), not inflated to 180');
  approx(rec.gateEffective['G3'], 200, 'done-anchor: G3 re-anchors to recovered G2 (150+50), back on plan at 200');

  // (4) ACCELERATION (fork B): G1 done 30 EARLY -> committed forecast does NOT pull in (delays-only),
  //     but the earliest forecast does, and the opportunity is surfaced per gate + per objective
  var early = C.cascade(pkg(), ex({ actualDate: 70 }), 80);
  approx(early.gateEffective['G2'], 150, 'delays-only: early G1 does NOT pull committed G2 in (stays 150)');
  approx(early.gateEffective['G3'], 200, 'delays-only: committed G3 stays 200');
  approx(early.objectiveProjectedEnd['O'], 200, 'delays-only: committed objective completion stays 200');
  approx(early.gateForecastEarliest['G2'], 120, 'earliest: G2 could finish 30 early (70+50=120)');
  approx(early.gateForecastEarliest['G3'], 170, 'earliest: G3 could finish 30 early (120+50=170)');
  approx(early.gateAcceleration['G2'], 30, 'acceleration flag: G2 could move up 30 days');
  approx(early.gateAcceleration['G3'], 30, 'acceleration flag: G3 could move up 30 days');
  approx(early.objectiveEarliestEnd['O'], 200, 'earliest objective end floors at the planned span (cs+dur=200): gates INSIDE the span cannot move the objective end');
  approx(early.objectiveAcceleration['O'], 0, 'no OBJECTIVE acceleration when gates sit inside the span — only the per-GATE acceleration above applies');

  // (4b) LEGIT objective acceleration appears ONLY when a gate binds BEYOND the objective span and an early
  //      upstream pulls it in, so it necessarily coexists with slip (it recovers part of that slip).
  var oacc = C.cascade(
    { divisions:[{id:'D'}], initiatives:[], objectives:[{id:'O',divisionId:'D',plannedStart:100,plannedEnd:200}], milestones:[],stageGateEdges:[],objectiveEdges:[],milestoneEdges:[] },
    { D:{ stageGates:[{id:'a',objectiveId:'O',setId:'S',plannedDate:150,actualDate:120},{id:'b',objectiveId:'O',setId:'S',plannedDate:280}], stageGateSets:[{id:'S',objectiveId:'O',chained:true}], tasks:[] } }, 80);
  approx(oacc.objectiveProjectedEnd['O'], 280, 'legit accel: a gate past the span (280) binds the objective end');
  approx(oacc.objectiveEarliestEnd['O'], 250, 'legit accel: the early upstream (120) pulls the binding gate in to 250');
  approx(oacc.objectiveAcceleration['O'], 30, 'legit objective acceleration = 30d recoverable (coexists with slip)');

  // (7) WORK-BASIS SCHEDULE SLIP (execution Schedule card): surfaces gate/task delays that the objective's
  //     plannedEnd buffer hides from objectiveProjectedEnd (which is left unchanged).
  function ss(obj, gates, today){
    return C.cascade(
      { divisions:[{id:'D'}], initiatives:[], objectives:[{id:'O',divisionId:'D',plannedStart:obj[0],plannedEnd:obj[1]}], milestones:[],stageGateEdges:[],objectiveEdges:[],milestoneEdges:[] },
      { D:{ stageGates:gates.map((g,i)=>({id:'g'+i,objectiveId:'O',setId:'S',plannedDate:g.p,actualDate:g.a==null?null:g.a})), stageGateSets:[{id:'S',objectiveId:'O',chained:true}], tasks:[] } }, today);
  }
  var s1=ss([0,200],[{p:100,a:150}],160);
  approx(s1.objectiveProjectedEnd['O'], 200, 'buffer case: projEnd still floors at plannedEnd (UNCHANGED by option A)');
  approx(s1.objectiveScheduleSlip['O'], 50, 'work-slip surfaces the 50d-late gate that projEnd hid (150 vs planned 100)');
  approx(s1.objectiveWorkForecast['O'], 150, 'work forecast = the late gate actual (150), not the buffered projEnd');
  var s2=ss([0,200],[{p:100}],130);
  approx(s2.objectiveScheduleSlip['O'], 30, 'overdue gate within buffer: 30d behind (today 130 vs planned 100)');
  var s3=ss([0,200],[{p:100,a:100}],120);
  approx(s3.objectiveScheduleSlip['O'], 0, 'on-time gate: 0d behind');
  var s4=ss([0,100],[{p:30},{p:100}],50);
  approx(s4.objectiveScheduleSlip['O'], 20, 'chained: a 20d-overdue upstream gate propagates to a 20d work-slip');
  var s5=C.cascade(
    { divisions:[{id:'D'}], initiatives:[], milestones:[],stageGateEdges:[],milestoneEdges:[],
      objectives:[{id:'A',divisionId:'D',plannedStart:0,plannedEnd:100},{id:'B',divisionId:'D',plannedStart:100,plannedEnd:200}],
      objectiveEdges:[{fromObj:'A',toObj:'B',lagDays:0}] },
    { D:{ stageGates:[{id:'ga',objectiveId:'A',setId:'S',plannedDate:80,actualDate:null}], stageGateSets:[{id:'S',objectiveId:'A',chained:true}], tasks:[] } }, 150);
  approx(s5.objectiveScheduleSlip['B'], 50, 'childless objective: a late-predecessor push (50d) still surfaces');

  // (5) LOCKED gate as a hard external date: it holds AND firewalls downstream from the propagated delay
  var lk = C.cascade(pkg(), { D: { stageGates: [
    { id: 'G1', objectiveId: 'O', setId: 'S', plannedDate: 100, actualDate: 160 },
    { id: 'G2', objectiveId: 'O', setId: 'S', plannedDate: 150, locked: true, baselineDate: 150 },
    { id: 'G3', objectiveId: 'O', setId: 'S', plannedDate: 200 } ],
    stageGateSets: [{ id: 'S', objectiveId: 'O', chained: true }], tasks: [] } }, 80);
  approx(lk.gateEffective['G2'], 150, 'locked G2 holds its committed 150 despite G1 +60');
  approx(lk.gateEffective['G3'], 200, 'locked G2 firewalls G3: G3 = 150 + 50 gap = 200, not 210+');

  // (6) NO PHANTOM ACCELERATION: only a genuinely EARLY upstream actual creates an opportunity. An undone gate
  //     merely planned in the future, the first gate, or a delayed chain must all report ZERO acceleration.
  var onplan = C.cascade(pkg(), ex({}), 60);
  ok(onplan.gateAcceleration['G1']===0 && onplan.gateAcceleration['G2']===0 && onplan.gateAcceleration['G3']===0, 'on-plan undone gates (incl. the first) report no acceleration');
  ok(onplan.objectiveAcceleration['O']===0, 'on-plan objective reports no acceleration');
  var odue = C.cascade(pkg(), ex({}), 130);
  ok(odue.gateAcceleration['G1']===0 && odue.gateAcceleration['G2']===0, 'overdue-undone first gate + downstream report no acceleration');
  var lateChain = C.cascade(pkg(), ex({actualDate:130}), 80);
  ok(lateChain.gateAcceleration['G2']===0 && lateChain.gateAcceleration['G3']===0 && lateChain.objectiveAcceleration['O']===0, 'a delayed chain reports no acceleration');
})();

/* ---- summary ------------------------------------------------------------- */
if (fails) {
  console.error('\n' + fails + ' / ' + count + ' assertions FAILED');
  process.exit(1);
} else {
  console.log('PASS — ' + count + ' assertions green');
}
