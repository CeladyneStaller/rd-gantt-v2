/* ============================================================================
   Calm prototypes: ONE shared sample dataset, in the real apps' document shapes.
   Every app (Planning, Execution, Sales, Product spec) starts from this, so the
   four prototypes agree. Dates are day numbers since 2020-01-01 (UTC), exactly
   like the real apps; kanban tiles use ISO strings, like the real apps.
   "Today" is fixed at 2026-10-13 so the story is stable.

   Module seed files (data/seed_*.js) add their feature data on top of this via
   functions named seed_<name>(S); build.py inlines every seed file into every app.
   ========================================================================== */
function calmDay(iso) { return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(2020, 0, 1)) / 86400000); }
function calmTs(iso) { return Date.parse(iso.length > 10 ? iso : iso + 'T12:00:00Z'); }

function calmSample() {
  var D = calmDay, TS = calmTs;
  var S = {};
  S.today = D('2026-10-13');               // 2477
  S.todayIso = '2026-10-13';
  S.nowMs = Date.parse('2026-10-13T16:00:00Z');
  S.me = { email: 'corey@celadyne.com', name: 'Corey', role: 'CTO' };
  S.hubSignedIn = true;                    // Hub sign-in present: Done-column choices follow the person

  /* ---------------------------------------------------------------- roster */
  /* orgRole and leadDivisions follow the live roster (GET /roster: email, orgRole, leadOf, disabled).
     Dana Whitcomb is a placeholder CEO for the prototype. */
  S.roster = { users: [
    { email: 'corey@celadyne.com', disabled: false, name: 'Corey Staller', orgRole: 'cto', leadDivisions: [] },
    { email: 'toru@celadyne.com', disabled: false, name: 'Toru Hayashi', orgRole: 'lead', leadDivisions: ['DIV-EL'] },
    { email: 'erin@celadyne.com', disabled: false, name: 'Erin Walsh', orgRole: 'lead', leadDivisions: ['DIV-FC'] },
    { email: 'maya@celadyne.com', disabled: false, name: 'Maya Okafor', orgRole: 'ic', leadDivisions: [] },
    { email: 'sam@celadyne.com', disabled: false, name: 'Sam Rivera', orgRole: 'lead', leadDivisions: ['DIV-BD'] },
    { email: 'priya@celadyne.com', disabled: false, name: 'Priya Natarajan', orgRole: 'ic', leadDivisions: [] },
    { email: 'ken@celadyne.com', disabled: false, name: 'Ken Albright', orgRole: 'ic', leadDivisions: [] },
    { email: 'dana@celadyne.com', disabled: false, name: 'Dana Whitcomb', orgRole: 'ceo', leadDivisions: [] },
    { email: 'lena@celadyne.com', disabled: true, name: 'Lena Fischer', orgRole: 'ic', leadDivisions: [] }
  ] };

  /* ------------------------------------------------------------- portfolio */
  var P = S.portfolio = {
    units: [
      { id: 'UNIT-TECHNI', name: 'Technical', order: 1 },
      { id: 'UNIT-BUSINE', name: 'Business', order: 2 }
    ],
    divisions: [
      { id: 'DIV-FC', name: 'Fuel Cell', kind: 'rd', unitId: 'UNIT-TECHNI', order: 1 },
      { id: 'DIV-EL', name: 'Electrolyzer', kind: 'rd', unitId: 'UNIT-TECHNI', order: 2 },
      { id: 'DIV-BD', name: 'Business Development', kind: 'biz', unitId: 'UNIT-BUSINE', order: 3 }
    ],
    products: [
      { id: 'PRD-FC-1', divisionId: 'DIV-FC', name: 'HP membrane', order: 1, code: 'HP' },
      { id: 'PRD-EL-1', divisionId: 'DIV-EL', name: 'Tera stack', order: 1, code: 'TS' },
      { id: 'PRD-EL-2', divisionId: 'DIV-EL', name: 'Tera system', order: 2, code: 'TY' }
    ],
    models: [
      { id: 'MDL-FC-1-1', productId: 'PRD-FC-1', name: 'HP6-12', order: 1 },
      { id: 'MDL-EL-1-1', productId: 'PRD-EL-1', name: 'Tera 25-30-R5', order: 1 },
      { id: 'MDL-EL-2-1', productId: 'PRD-EL-2', name: 'Tera 250 kW skid', order: 1 }
    ],
    /* the skid model contains the stack model as a sub-product (host component SG-EL-2-1-5 in SPEC-DIV-EL) */
    composition: [{ id: 'CMP-SG-EL-2-1-5', parent: 'MDL-EL-2-1', child: 'MDL-EL-1-1' }],
    initiatives: [
      { id: 'INIT-FC-01', divisionId: 'DIV-FC', name: 'Roll-to-roll membrane scale-up', desc: 'Move HP membranes from batch casting to a continuous coating line.', plannedStart: D('2026-07-01'), plannedEnd: D('2027-03-31'), productId: null, modelId: 'MDL-FC-1-1', order: 1 },
      { id: 'INIT-FC-02', divisionId: 'DIV-FC', name: 'Low-humidity durability', desc: 'Keep HP6-12 performance at 20 to 30% RH.', plannedStart: D('2026-10-01'), plannedEnd: D('2027-06-30'), productId: null, modelId: 'MDL-FC-1-1', order: 2 },
      { id: 'INIT-EL-01', divisionId: 'DIV-EL', name: 'Tera component lock', desc: 'Freeze every Tera 25-30-R5 component before the durability campaign.', plannedStart: D('2026-07-01'), plannedEnd: D('2026-12-31'), productId: null, modelId: 'MDL-EL-1-1', order: 1 },
      { id: 'INIT-EL-02', divisionId: 'DIV-EL', name: 'Stack cost-down', desc: 'Take 18% out of the stack bill of materials.', plannedStart: D('2026-10-01'), plannedEnd: D('2027-06-30'), productId: 'PRD-EL-1', modelId: null, order: 2 },
      { id: 'INIT-BD-01', divisionId: 'DIV-BD', name: 'Utility pilot program', desc: 'Land paid pilots with regional utilities.', plannedStart: D('2026-10-01'), plannedEnd: D('2027-03-31'), productId: null, modelId: null, order: 1 }
    ],
    milestones: [
      { id: 'MS-FC-01-01', initiativeId: 'INIT-FC-01', name: 'Pilot line ready for customer audit', plannedDate: D('2026-12-11'), completedDate: null, trl: 5, mrl: 4, order: 1 },
      { id: 'MS-FC-01-02', initiativeId: 'INIT-FC-01', name: 'First 300 cm² MEA shipped', plannedDate: D('2027-03-12'), completedDate: null, trl: null, mrl: null, order: 2 },
      { id: 'MS-EL-01-01', initiativeId: 'INIT-EL-01', name: '10-cell stack built and leak-tested', plannedDate: D('2026-10-02'), completedDate: D('2026-09-30'), trl: 4, mrl: 3, order: 1,
        milestoneReport: {
          project: 'Tera stack', author: 'Toru Hayashi', version: '1.0',
          demonstrated: 'A 10-cell short stack was assembled, torqued to 30 N·m and held 30 bar for 2 hours with no measurable leak.',
          kpiOverrides: {}, findings: ['All ten cells passed the pressure hold.', 'Cell 7 sat 40 mV above the stack average at first light.', 'Gasket thickness varied by up to 0.06 mm across the stack.', ''],
          actions: [{ item: 'Measure every gasket before the rebuild', owner: 'Toru', due: '2026-10-16' }, { item: 'Order spare titanium PTLs', owner: 'Priya', due: '2026-10-16' }, { item: '', owner: '', due: '' }],
          context: {}, locked: true, savedAt: TS('2026-10-01T15:00:00Z') } },
      { id: 'MS-EL-01-02', initiativeId: 'INIT-EL-01', name: 'Tera design freeze', plannedDate: D('2026-11-20'), completedDate: null, trl: null, mrl: null, order: 2 },
      { id: 'MS-EL-02-01', initiativeId: 'INIT-EL-02', name: 'Second-source PTL qualified', plannedDate: D('2027-02-26'), completedDate: null, trl: null, mrl: null, order: 1 },
      { id: 'MS-BD-01-01', initiativeId: 'INIT-BD-01', name: 'First pilot energized', plannedDate: D('2027-02-19'), completedDate: null, trl: null, mrl: null, order: 1 }
    ],
    milestoneState: [
      { milestoneId: 'MS-EL-02-01', status: 'deprioritized', day: D('2026-10-06'), note: 'Supplier slipped to Q2; kept for reference.' }
    ],
    objectives: [
      { id: 'OBJ-FC-2026Q3-01', divisionId: 'DIV-FC', initiativeId: 'INIT-FC-01', quarter: '2026Q3', statement: 'Qualify HP6-12 at 80 °C', owner: ['erin@celadyne.com'], plannedStart: D('2026-07-06'), plannedEnd: D('2026-09-25'), milestoneIds: [], productId: null, modelId: null, order: 1 },
      { id: 'OBJ-FC-2026Q4-01', divisionId: 'DIV-FC', initiativeId: 'INIT-FC-01', quarter: '2026Q4', statement: 'Run full roll-to-roll membrane production', owner: ['erin@celadyne.com'], plannedStart: D('2026-10-01'), plannedEnd: D('2026-12-18'), milestoneIds: ['MS-FC-01-01'], productId: null, modelId: null, order: 2 },
      { id: 'OBJ-FC-2026Q4-02', divisionId: 'DIV-FC', initiativeId: 'INIT-FC-02', quarter: '2026Q4', statement: 'Root-cause AST degradation', owner: ['maya@celadyne.com'], plannedStart: D('2026-10-05'), plannedEnd: D('2026-12-11'), milestoneIds: [], productId: null, modelId: null, order: 3 },
      { id: 'OBJ-FC-2026Q4-03', divisionId: 'DIV-FC', initiativeId: 'INIT-FC-02', quarter: '2026Q4', statement: 'Show a 20% RH polarization-curve gain', owner: ['maya@celadyne.com', 'erin@celadyne.com'], plannedStart: D('2026-10-12'), plannedEnd: D('2026-12-18'), milestoneIds: [], productId: null, modelId: null, order: 4 },
      { id: 'OBJ-FC-2027Q1-01', divisionId: 'DIV-FC', initiativeId: 'INIT-FC-01', quarter: '2027Q1', statement: 'Scale coated MEA to 300 cm²', owner: ['erin@celadyne.com'], plannedStart: D('2027-01-04'), plannedEnd: D('2027-03-26'), milestoneIds: ['MS-FC-01-02'], productId: null, modelId: null, order: 5 },
      { id: 'OBJ-EL-2026Q4-01', divisionId: 'DIV-EL', initiativeId: 'INIT-EL-01', quarter: '2026Q4', statement: 'Qualify the 10-cell short stack for durability testing', owner: ['toru@celadyne.com'], plannedStart: D('2026-10-01'), plannedEnd: D('2026-12-18'), milestoneIds: ['MS-EL-01-02'], productId: null, modelId: null, order: 1 },
      { id: 'OBJ-EL-2026Q4-02', divisionId: 'DIV-EL', initiativeId: 'INIT-EL-01', quarter: '2026Q4', statement: 'Lock Tera 25-30-R5 components', owner: ['toru@celadyne.com', 'priya@celadyne.com'], plannedStart: D('2026-10-01'), plannedEnd: D('2026-11-20'), milestoneIds: ['MS-EL-01-02'], productId: null, modelId: null, order: 2 },
      { id: 'OBJ-EL-2027Q1-01', divisionId: 'DIV-EL', initiativeId: 'INIT-EL-02', quarter: '2027Q1', statement: 'Cut stack cost 18%', owner: ['toru@celadyne.com'], plannedStart: D('2027-01-04'), plannedEnd: D('2027-03-26'), milestoneIds: ['MS-EL-02-01'], productId: null, modelId: null, order: 3 },
      { id: 'OBJ-BD-2026Q4-01', divisionId: 'DIV-BD', initiativeId: 'INIT-BD-01', quarter: '2026Q4', statement: 'Close three utility pilot agreements', owner: ['sam@celadyne.com'], plannedStart: D('2026-10-01'), plannedEnd: D('2026-12-18'), milestoneIds: ['MS-BD-01-01'], productId: null, modelId: null, order: 1 },
      { id: 'OBJ-BD-2027Q1-01', divisionId: 'DIV-BD', initiativeId: 'INIT-BD-01', quarter: '2027Q1', statement: 'Build the Q1 hydrogen-hub pipeline', owner: ['sam@celadyne.com'], plannedStart: D('2027-01-04'), plannedEnd: D('2027-03-26'), milestoneIds: [], productId: null, modelId: null, order: 2 }
    ],
    objectiveEdges: [{ fromObj: 'OBJ-EL-2026Q4-02', toObj: 'OBJ-EL-2027Q1-01', lagDays: 14 }],
    milestoneEdges: [],
    stageGateEdges: [],
    /* portfolio-level KPIs: initiative targets, milestone targets (with value sources), product KPIs */
    kpis: [
      { id: 'KPI-EL-01-1', objectiveId: null, hostType: 'initiative', hostId: 'INIT-EL-01', name: 'Stack voltage efficiency (HHV)', targetType: 'demonstration', direction: 'up', target: 75, unit: '%', isDefiner: true, groupId: null },
      { id: 'KPI-FC-01-1', objectiveId: null, hostType: 'initiative', hostId: 'INIT-FC-01', name: 'Line yield', targetType: 'statistical', statistic: 'average', readCount: 5, direction: 'up', target: 85, unit: '%', isDefiner: true, groupId: null },
      { id: 'KPI-BD-01-1', objectiveId: null, hostType: 'initiative', hostId: 'INIT-BD-01', name: 'Signed pilot capacity', targetType: 'demonstration', direction: 'up', target: 3, unit: 'MW', isDefiner: true, groupId: null },
      { id: 'KPI-EL-01-02-1', objectiveId: null, hostType: 'milestone', hostId: 'MS-EL-01-02', name: 'Cell voltage at 2 A/cm²', targetType: 'demonstration', direction: 'down', target: 1.85, unit: 'V', isDefiner: true, groupId: null, sources: ['KPI-EL-2026Q4-01-1-1'] },
      { id: 'KPI-FC-01-01-1', objectiveId: null, hostType: 'milestone', hostId: 'MS-FC-01-01', name: 'Continuous run length', targetType: 'demonstration', direction: 'up', target: 50, unit: 'm', isDefiner: true, groupId: null, sources: [] },
      { id: 'KPI-PRD-EL-1-1', objectiveId: null, hostType: 'product', hostId: 'PRD-EL-1', name: 'Rated stack power', targetType: 'demonstration', direction: 'up', target: 25, unit: 'kW', isDefiner: true, groupId: null }
    ],
    kpiUpdates: [
      { id: 'UPD-KPI-EL-01-1-a', kpiId: 'KPI-EL-01-1', value: 73.1, timestamp: TS('2026-10-09T15:00:00Z'), note: '' },
      { id: 'UPD-KPI-FC-01-1-a', kpiId: 'KPI-FC-01-1', value: 78, timestamp: TS('2026-10-02T15:00:00Z'), note: '' },
      { id: 'UPD-KPI-FC-01-1-b', kpiId: 'KPI-FC-01-1', value: 83, timestamp: TS('2026-10-08T15:00:00Z'), note: '' },
      { id: 'UPD-KPI-FC-01-1-c', kpiId: 'KPI-FC-01-1', value: 86, timestamp: TS('2026-10-12T15:00:00Z'), note: '' },
      { id: 'UPD-KPI-FC-01-01-1-a', kpiId: 'KPI-FC-01-01-1', value: 32, timestamp: TS('2026-10-08T17:00:00Z'), note: '' },
      { id: 'UPD-KPI-BD-01-1-a', kpiId: 'KPI-BD-01-1', value: 1, timestamp: TS('2026-10-11T17:00:00Z'), note: '' }
    ],
    kpiDefs: []
  };

  /* ------------------------------------------------------------ exec docs */
  var EL = {
    keyResults: [
      { id: 'KR-EL-2026Q4-01-1', objectiveId: 'OBJ-EL-2026Q4-01', statement: 'Demonstrate cell-to-cell uniformity across the 10-cell build', trackingType: 'kpi' },
      { id: 'KR-EL-2026Q4-01-2', objectiveId: 'OBJ-EL-2026Q4-01', statement: 'Validate the accelerated stress-test protocol v2', trackingType: 'percentage', progress: 84 },
      { id: 'KR-EL-2026Q4-01-3', objectiveId: 'OBJ-EL-2026Q4-01', statement: 'Hold H₂-in-O₂ crossover under 1% at 30 bar', trackingType: 'kpi' },
      { id: 'KR-EL-2026Q4-02-1', objectiveId: 'OBJ-EL-2026Q4-02', statement: 'Freeze the porous transport layer spec', trackingType: 'percentage', progress: 60 },
      { id: 'KR-EL-2026Q4-02-2', objectiveId: 'OBJ-EL-2026Q4-02', statement: 'Qualify the second-source bipolar plate', trackingType: 'milestone', creditMode: 'partial',
        steps: [
          { id: 'ST-1', name: 'Samples received and inspected', weight: 20, due: '2026-10-09', completion: 100 },
          { id: 'ST-2', name: 'Contact resistance screening', weight: 40, due: '2026-10-30', completion: 60 },
          { id: 'ST-3', name: '500 h corrosion soak', weight: null, due: '2026-11-13', completion: 0 }
        ] }
    ],
    kpis: [
      { id: 'KPI-EL-2026Q4-01-1-1', objectiveId: 'OBJ-EL-2026Q4-01', hostType: 'keyResult', hostId: 'KR-EL-2026Q4-01-1', name: 'Cell voltage at 2 A/cm²', targetType: 'statistical', statistic: 'average', readCount: 10, direction: 'down', target: 1.85, unit: 'V', order: 0 },
      { id: 'KPI-EL-2026Q4-01-1-2', objectiveId: 'OBJ-EL-2026Q4-01', hostType: 'keyResult', hostId: 'KR-EL-2026Q4-01-1', name: 'High-frequency resistance', targetType: 'statistical', statistic: 'median', readCount: 10, direction: 'down', target: 60, unit: 'mΩ·cm²', order: 1 },
      { id: 'KPI-EL-2026Q4-01-3-1', objectiveId: 'OBJ-EL-2026Q4-01', hostType: 'keyResult', hostId: 'KR-EL-2026Q4-01-3', name: 'H₂ in O₂ crossover', targetType: 'demonstration', direction: 'down', target: 1, unit: '%', order: 0,
        linkParent: 'KPI-EL-1-1-4-1', linkType: 'contribute', linkPriority: 0 },
      { id: 'KPI-EL-2026Q4-01-4-1', objectiveId: 'OBJ-EL-2026Q4-01', hostType: 'stageGate', hostId: 'SG-EL-2026Q4-01-1', name: 'Leak test at 30 bar', targetType: 'binary', direction: null, target: null, unit: '', order: 0 },
      { id: 'KPI-EL-2026Q4-01-5-1', objectiveId: 'OBJ-EL-2026Q4-01', hostType: 'stageGate', hostId: 'SG-EL-2026Q4-01-2', name: 'Voltage decay rate', targetType: 'statistical', statistic: 'average', readCount: 6, direction: 'down', target: 10, unit: 'µV/h', order: 0 },
      { id: 'KPI-EL-2026Q4-01-5-2', objectiveId: 'OBJ-EL-2026Q4-01', hostType: 'stageGate', hostId: 'SG-EL-2026Q4-01-2', name: 'H₂ in O₂ after 500 h', targetType: 'demonstration', direction: 'down', target: 1, unit: '%', order: 1 },
      { id: 'KPI-EL-2026Q4-01-6-1', objectiveId: 'OBJ-EL-2026Q4-01', hostType: 'stageGate', hostId: 'SG-EL-2026Q4-01-3', name: 'Voltage decay rate, 1,000 h', targetType: 'statistical', statistic: 'average', readCount: 6, direction: 'down', target: 10, unit: 'µV/h', order: 0 },
      { id: 'KPI-EL-2026Q4-01-7-1', objectiveId: 'OBJ-EL-2026Q4-01', hostType: 'stageGate', hostId: 'SG-EL-2026Q4-01-4', name: 'Membrane thinning', targetType: 'demonstration', direction: 'down', target: 8, unit: '%', order: 0 },
      { id: 'KPI-EL-2026Q4-02-3-1', objectiveId: 'OBJ-EL-2026Q4-02', hostType: 'stageGate', hostId: 'SG-EL-2026Q4-02-2', name: 'Interfacial contact resistance', targetType: 'demonstration', direction: 'range', target: { lo: 6, hi: 10 }, rangeSpec: { mode: 'minmax' }, unit: 'mΩ·cm²', order: 0 },
      { id: 'KPI-EL-2026Q4-02-T-1', objectiveId: 'OBJ-EL-2026Q4-02', hostType: 'task', hostId: 'TSK-EL-2026Q4-02-1', name: 'Quotes received', targetType: 'demonstration', direction: 'up', target: 3, unit: 'quotes', order: 0 }
    ],
    kpiUpdates: [
      { id: 'UPD-V-1', kpiId: 'KPI-EL-2026Q4-01-1-1', value: 1.81, timestamp: TS('2026-10-09T15:00:00Z'), note: '', batch: 'b_build2' },
      { id: 'UPD-V-2', kpiId: 'KPI-EL-2026Q4-01-1-1', value: 1.83, timestamp: TS('2026-10-10T15:00:00Z'), note: '', batch: 'b_build2' },
      { id: 'UPD-V-3', kpiId: 'KPI-EL-2026Q4-01-1-1', value: 1.82, timestamp: TS('2026-10-11T15:00:00Z'), note: '', batch: 'b_build2' },
      { id: 'UPD-V-4', kpiId: 'KPI-EL-2026Q4-01-1-1', value: 1.84, timestamp: TS('2026-10-13T14:00:00Z'), note: '', batch: 'b_build2' },
      { id: 'UPD-H-0a', kpiId: 'KPI-EL-2026Q4-01-1-2', value: 92, timestamp: TS('2026-09-24T15:00:00Z'), note: 'build 1', batch: 'b_build1' },
      { id: 'UPD-H-0b', kpiId: 'KPI-EL-2026Q4-01-1-2', value: 95, timestamp: TS('2026-09-25T15:00:00Z'), note: 'build 1', batch: 'b_build1' },
      { id: 'UPD-H-1', kpiId: 'KPI-EL-2026Q4-01-1-2', value: 74, timestamp: TS('2026-10-09T15:05:00Z'), note: '', batch: 'b_build2' },
      { id: 'UPD-H-2', kpiId: 'KPI-EL-2026Q4-01-1-2', value: 81, timestamp: TS('2026-10-10T15:05:00Z'), note: '', batch: 'b_build2' },
      { id: 'UPD-H-3', kpiId: 'KPI-EL-2026Q4-01-1-2', value: 79, timestamp: TS('2026-10-11T15:05:00Z'), note: '', batch: 'b_build2' },
      { id: 'UPD-H-4', kpiId: 'KPI-EL-2026Q4-01-1-2', value: 86, timestamp: TS('2026-10-12T15:05:00Z'), note: '', batch: 'b_build2' },
      { id: 'UPD-X-1', kpiId: 'KPI-EL-2026Q4-01-3-1', value: 0.62, timestamp: TS('2026-10-08T18:00:00Z'), note: '' },
      { id: 'UPD-LK-1', kpiId: 'KPI-EL-2026Q4-01-4-1', value: 1, timestamp: TS('2026-09-30T20:00:00Z'), note: '' },
      { id: 'UPD-DEC-1', kpiId: 'KPI-EL-2026Q4-01-5-1', value: 8.1, timestamp: TS('2026-10-06T15:00:00Z'), note: '', batch: 'b_dec1' },
      { id: 'UPD-DEC-2', kpiId: 'KPI-EL-2026Q4-01-5-1', value: 9.0, timestamp: TS('2026-10-08T15:00:00Z'), note: '', batch: 'b_dec1' },
      { id: 'UPD-DEC-3', kpiId: 'KPI-EL-2026Q4-01-5-1', value: 8.2, timestamp: TS('2026-10-10T15:00:00Z'), note: '', batch: 'b_dec1' },
      { id: 'UPD-XO-1', kpiId: 'KPI-EL-2026Q4-01-5-2', value: 0.71, timestamp: TS('2026-10-10T19:00:00Z'), note: '' },
      { id: 'UPD-ICR-1', kpiId: 'KPI-EL-2026Q4-02-3-1', value: 12.5, timestamp: TS('2026-10-06T19:00:00Z'), note: '' },
      { id: 'UPD-Q-1', kpiId: 'KPI-EL-2026Q4-02-T-1', value: 2, timestamp: TS('2026-10-07T19:00:00Z'), note: '' }
    ],
    stageGateSets: [
      { id: 'SGSET-EL-2026Q4-01-1', objectiveId: 'OBJ-EL-2026Q4-01', name: 'Durability', order: 0, chained: true },
      { id: 'SGSET-EL-2026Q4-01-2', objectiveId: 'OBJ-EL-2026Q4-01', name: 'Teardown and analysis', order: 1, chained: false },
      { id: 'SGSET-EL-2026Q4-02-1', objectiveId: 'OBJ-EL-2026Q4-02', name: 'Component lock', order: 0, chained: true }
    ],
    stageGates: [
      { id: 'SG-EL-2026Q4-01-1', objectiveId: 'OBJ-EL-2026Q4-01', setId: 'SGSET-EL-2026Q4-01-1', name: 'Build and leak-test the stack', intention: 'Prove the stack holds 30 bar before any durability hours are spent on it.', gate_id: '', plannedDate: D('2026-10-02'), actualDate: D('2026-09-30'), status: 'hit', completionMethod: 'auto', order: 0 },
      { id: 'SG-EL-2026Q4-01-2', objectiveId: 'OBJ-EL-2026Q4-01', setId: 'SGSET-EL-2026Q4-01-1', name: 'Durability screen, 500 h', intention: 'Show the decay rate stays under 10 µV/h with crossover in spec.', gate_id: 'DUR-500', plannedDate: D('2026-11-13'), actualDate: null, status: 'active', baselineDate: D('2026-11-13'), locked: true, order: 1 },
      { id: 'SG-EL-2026Q4-01-3', objectiveId: 'OBJ-EL-2026Q4-01', setId: 'SGSET-EL-2026Q4-01-1', name: '1,000 h endurance hold', intention: 'Hold the decay rate for a full 1,000 hours.', gate_id: '', plannedDate: D('2026-12-18'), actualDate: null, status: 'pending', order: 2 },
      { id: 'SG-EL-2026Q4-01-4', objectiveId: 'OBJ-EL-2026Q4-01', setId: 'SGSET-EL-2026Q4-01-2', name: 'Post-test teardown and SEM', intention: 'Look for membrane thinning and catalyst migration.', gate_id: '', plannedDate: D('2026-12-04'), actualDate: null, status: 'pending', order: 0 },
      { id: 'SG-EL-2026Q4-01-5', objectiveId: 'OBJ-EL-2026Q4-01', setId: 'SGSET-EL-2026Q4-01-2', name: 'Failure-mode review', intention: 'Close out the FMEA with teardown evidence.', gate_id: '', plannedDate: D('2026-12-15'), actualDate: null, status: 'pending', order: 1 },
      { id: 'SG-EL-2026Q4-02-1', objectiveId: 'OBJ-EL-2026Q4-02', setId: 'SGSET-EL-2026Q4-02-1', name: 'PTL spec review', intention: 'Agree the PTL porosity and thickness window with the supplier.', gate_id: '', plannedDate: D('2026-10-10'), actualDate: D('2026-10-09'), status: 'hit', completionMethod: 'manual', overrideJustification: 'Signed off in the Oct 9 design review; supplier data accepted in lieu of our own porosity scan.', order: 0 },
      { id: 'SG-EL-2026Q4-02-2', objectiveId: 'OBJ-EL-2026Q4-02', setId: 'SGSET-EL-2026Q4-02-1', name: 'Second-source bipolar plate trial', intention: 'Contact resistance inside the 6 to 10 mΩ·cm² window.', gate_id: '', plannedDate: D('2026-10-08'), actualDate: null, status: 'active', order: 1 },
      { id: 'SG-EL-2026Q4-02-3', objectiveId: 'OBJ-EL-2026Q4-02', setId: 'SGSET-EL-2026Q4-02-1', name: 'Design freeze sign-off', intention: 'Every component locked and released to purchasing.', gate_id: 'FREEZE', plannedDate: D('2026-11-20'), actualDate: null, status: 'pending', order: 2 }
    ],
    stageGateEdges: [{ fromGate: 'SG-EL-2026Q4-01-2', toGate: 'SG-EL-2026Q4-01-4', lagDays: 5 }],
    tasks: [
      { id: 'TSK-EL-2026Q4-01-1', objectiveId: 'OBJ-EL-2026Q4-01', name: 'Order spare titanium PTLs', plannedStart: D('2026-10-05'), plannedEnd: D('2026-10-16'), percentComplete: 100, actualStart: D('2026-10-05'), actualEnd: D('2026-10-12') },
      { id: 'TSK-EL-2026Q4-01-2', objectiveId: 'OBJ-EL-2026Q4-01', name: 'Calibrate the H₂-in-O₂ sensor', plannedStart: D('2026-10-12'), plannedEnd: D('2026-11-06'), percentComplete: 40, actualStart: D('2026-10-12'), actualEnd: null },
      { id: 'TSK-EL-2026Q4-01-3', objectiveId: 'OBJ-EL-2026Q4-01', name: 'Book SEM time for teardown', plannedStart: D('2026-11-16'), plannedEnd: D('2026-11-27'), percentComplete: 0, actualStart: null, actualEnd: null },
      { id: 'TSK-EL-2026Q4-02-1', objectiveId: 'OBJ-EL-2026Q4-02', name: 'Collect second-source bipolar plate quotes', plannedStart: D('2026-10-01'), plannedEnd: D('2026-10-23'), percentComplete: 50, actualStart: D('2026-10-02'), actualEnd: null }
    ],
    boards: [], risks: [], planVersions: [], catchupPlans: [], objectiveState: [],
    gateMode: {}, chainGatesByDate: {}, etbTrees: {}
  };

  var FC = {
    keyResults: [
      { id: 'KR-FC-2026Q3-01-1', objectiveId: 'OBJ-FC-2026Q3-01', statement: 'Pass 80 °C qualification', trackingType: 'percentage', progress: 100 },
      { id: 'KR-FC-2026Q4-01-1', objectiveId: 'OBJ-FC-2026Q4-01', statement: 'Hold thickness variation under 1.5 µm (2σ) across a 50 m run', trackingType: 'kpi' },
      { id: 'KR-FC-2026Q4-01-2', objectiveId: 'OBJ-FC-2026Q4-01', statement: 'Reach 95 mS/cm proton conductivity at 80 °C, 95% RH', trackingType: 'kpi' },
      { id: 'KR-FC-2026Q4-02-1', objectiveId: 'OBJ-FC-2026Q4-02', statement: 'Identify the dominant degradation mechanism', trackingType: 'percentage', progress: 45 },
      { id: 'KR-FC-2026Q4-03-1', objectiveId: 'OBJ-FC-2026Q4-03', statement: 'Lift 20% RH current density at 0.6 V by 20%', trackingType: 'subkr',
        subKrs: [
          { name: 'Swap to the short-side-chain ionomer', weight: 1, trackingType: 'percentage', progress: 40 },
          { name: 'Current density at 0.6 V, 20% RH', weight: 2, trackingType: 'kpi', kpis: [{ type: 'kpi', targetType: 'demonstration', name: 'Current density at 0.6 V', current: 0.22, direction: 'up', target: 1.2, unit: 'A/cm²' }] }
        ] }
    ],
    kpis: [
      { id: 'KPI-FC-2026Q4-01-1-1', objectiveId: 'OBJ-FC-2026Q4-01', hostType: 'keyResult', hostId: 'KR-FC-2026Q4-01-1', name: 'Thickness variation (2σ)', targetType: 'statistical', statistic: 'average', readCount: 5, direction: 'down', target: 1.5, unit: 'µm', order: 0 },
      { id: 'KPI-FC-2026Q4-01-2-1', objectiveId: 'OBJ-FC-2026Q4-01', hostType: 'keyResult', hostId: 'KR-FC-2026Q4-01-2', name: 'Proton conductivity', targetType: 'statistical', statistic: 'median', readCount: 6, direction: 'up', target: 95, unit: 'mS/cm', order: 0 },
      { id: 'KPI-FC-2026Q4-01-3-1', objectiveId: 'OBJ-FC-2026Q4-01', hostType: 'stageGate', hostId: 'SG-FC-2026Q4-01-3', name: 'Continuous run length', targetType: 'demonstration', direction: 'up', target: 50, unit: 'm', order: 0, linkParent: 'KPI-FC-01-01-1', linkType: 'direct', linkPriority: 0 }
    ],
    kpiUpdates: [
      { id: 'UPD-TH-1', kpiId: 'KPI-FC-2026Q4-01-1-1', value: 1.3, timestamp: TS('2026-10-07T15:00:00Z'), note: '' },
      { id: 'UPD-TH-2', kpiId: 'KPI-FC-2026Q4-01-1-1', value: 1.7, timestamp: TS('2026-10-09T15:00:00Z'), note: '' },
      { id: 'UPD-TH-3', kpiId: 'KPI-FC-2026Q4-01-1-1', value: 1.4, timestamp: TS('2026-10-12T15:00:00Z'), note: '' },
      { id: 'UPD-CO-1', kpiId: 'KPI-FC-2026Q4-01-2-1', value: 91, timestamp: TS('2026-10-03T15:00:00Z'), note: '' },
      { id: 'UPD-CO-2', kpiId: 'KPI-FC-2026Q4-01-2-1', value: 92.5, timestamp: TS('2026-10-05T15:00:00Z'), note: '' },
      { id: 'UPD-CO-3', kpiId: 'KPI-FC-2026Q4-01-2-1', value: 93, timestamp: TS('2026-10-07T15:00:00Z'), note: '' },
      { id: 'UPD-CO-4', kpiId: 'KPI-FC-2026Q4-01-2-1', value: 94.1, timestamp: TS('2026-10-09T15:00:00Z'), note: '' },
      { id: 'UPD-CO-5', kpiId: 'KPI-FC-2026Q4-01-2-1', value: 92, timestamp: TS('2026-10-11T15:00:00Z'), note: '' },
      { id: 'UPD-CO-6', kpiId: 'KPI-FC-2026Q4-01-2-1', value: 93.6, timestamp: TS('2026-10-12T15:00:00Z'), note: '' }
    ],
    stageGateSets: [
      { id: 'SGSET-FC-2026Q4-01-1', objectiveId: 'OBJ-FC-2026Q4-01', name: 'Line setup', order: 0, chained: true },
      { id: 'SGSET-FC-2026Q4-01-2', objectiveId: 'OBJ-FC-2026Q4-01', name: 'Qualification', order: 1, chained: true },
      { id: 'SGSET-FC-2026Q4-02-1', objectiveId: 'OBJ-FC-2026Q4-02', name: 'Analysis', order: 0, chained: true }
    ],
    stageGates: [
      { id: 'SG-FC-2026Q4-01-1', objectiveId: 'OBJ-FC-2026Q4-01', setId: 'SGSET-FC-2026Q4-01-1', name: 'Commission the coating line', intention: 'Line runs at speed with tension control on.', plannedDate: D('2026-09-29'), actualDate: D('2026-09-26'), status: 'hit', completionMethod: 'manual', overrideJustification: 'Commissioning checklist signed by the line vendor.', order: 0 },
      { id: 'SG-FC-2026Q4-01-2', objectiveId: 'OBJ-FC-2026Q4-01', setId: 'SGSET-FC-2026Q4-01-1', name: 'First 10 m trial roll', intention: 'A 10 m roll within thickness spec.', plannedDate: D('2026-10-09'), actualDate: D('2026-10-12'), status: 'hit', completionMethod: 'manual', overrideJustification: 'Visual and thickness map reviewed by Erin.', order: 1 },
      { id: 'SG-FC-2026Q4-01-3', objectiveId: 'OBJ-FC-2026Q4-01', setId: 'SGSET-FC-2026Q4-01-1', name: '50 m continuous run', intention: 'A single uninterrupted 50 m run.', plannedDate: D('2026-11-06'), actualDate: null, status: 'pending', order: 2 },
      { id: 'SG-FC-2026Q4-01-4', objectiveId: 'OBJ-FC-2026Q4-01', setId: 'SGSET-FC-2026Q4-01-2', name: 'Thickness map across the full roll', intention: '2σ under 1.5 µm across the full width.', plannedDate: D('2026-11-25'), actualDate: null, status: 'pending', order: 0 },
      { id: 'SG-FC-2026Q4-01-5', objectiveId: 'OBJ-FC-2026Q4-01', setId: 'SGSET-FC-2026Q4-01-2', name: 'Customer audit readiness review', intention: 'Ready for the customer line audit.', plannedDate: D('2026-12-11'), actualDate: null, status: 'pending', order: 1 },
      { id: 'SG-FC-2026Q4-02-1', objectiveId: 'OBJ-FC-2026Q4-02', setId: 'SGSET-FC-2026Q4-02-1', name: 'Post-AST cross-section imaging', intention: 'Image the cathode after 30k cycles.', plannedDate: D('2026-10-29'), actualDate: null, status: 'pending', order: 0 },
      { id: 'SG-FC-2026Q4-02-2', objectiveId: 'OBJ-FC-2026Q4-02', setId: 'SGSET-FC-2026Q4-02-1', name: 'Degradation mechanism report', intention: 'A written mechanism with supporting data.', plannedDate: D('2026-11-12'), actualDate: null, status: 'pending', order: 1 }
    ],
    stageGateEdges: [],
    tasks: [
      { id: 'TSK-FC-2026Q4-01-1', objectiveId: 'OBJ-FC-2026Q4-01', name: 'Order a second slot-die shim set', plannedStart: D('2026-10-01'), plannedEnd: D('2026-10-08'), percentComplete: 100, actualStart: D('2026-10-01'), actualEnd: D('2026-10-07') },
      { id: 'TSK-FC-2026Q4-01-2', objectiveId: 'OBJ-FC-2026Q4-01', name: 'Write the roll inspection procedure', plannedStart: D('2026-10-08'), plannedEnd: D('2026-10-29'), percentComplete: 30, actualStart: D('2026-10-09'), actualEnd: null }
    ],
    boards: [], risks: [], planVersions: [], catchupPlans: [],
    objectiveState: [{ objectiveId: 'OBJ-FC-2026Q3-01', status: 'achieved', endedDay: D('2026-09-25'), note: 'Passed 80 °C qualification on schedule.' }],
    gateMode: {}, chainGatesByDate: {}, etbTrees: {}
  };

  var BD = {
    keyResults: [
      { id: 'KR-BD-2026Q4-01-1', objectiveId: 'OBJ-BD-2026Q4-01', statement: 'Sign three pilot agreements', trackingType: 'milestone', creditMode: 'binary',
        steps: [
          { id: 'ST-1', name: 'Teton Valley Utility signed', weight: null, due: '2026-10-15', completion: 100 },
          { id: 'ST-2', name: 'Second utility signed', weight: null, due: '2026-11-20', completion: 0 },
          { id: 'ST-3', name: 'Third utility signed', weight: null, due: '2026-12-18', completion: 0 }
        ] },
      { id: 'KR-BD-2026Q4-01-2', objectiveId: 'OBJ-BD-2026Q4-01', statement: 'Grow qualified pipeline to $4.5 M', trackingType: 'kpi' }
    ],
    kpis: [
      { id: 'KPI-BD-2026Q4-01-2-1', objectiveId: 'OBJ-BD-2026Q4-01', hostType: 'keyResult', hostId: 'KR-BD-2026Q4-01-2', name: 'Qualified pipeline value', targetType: 'demonstration', direction: 'up', target: 4.5, unit: '$M', order: 0 }
    ],
    kpiUpdates: [
      { id: 'UPD-PV-1', kpiId: 'KPI-BD-2026Q4-01-2-1', value: 3.1, timestamp: TS('2026-10-02T17:00:00Z'), note: '' },
      { id: 'UPD-PV-2', kpiId: 'KPI-BD-2026Q4-01-2-1', value: 3.6, timestamp: TS('2026-10-10T17:00:00Z'), note: '' }
    ],
    stageGateSets: [{ id: 'SGSET-BD-2026Q4-01-1', objectiveId: 'OBJ-BD-2026Q4-01', name: 'Pilot readiness', order: 0, chained: true }],
    stageGates: [
      { id: 'SG-BD-2026Q4-01-1', objectiveId: 'OBJ-BD-2026Q4-01', setId: 'SGSET-BD-2026Q4-01-1', name: 'Standard pilot term sheet approved', intention: 'Legal and finance sign the template.', plannedDate: D('2026-10-09'), actualDate: D('2026-10-08'), status: 'hit', completionMethod: 'manual', overrideJustification: 'Approved by legal on Oct 8.', order: 0 },
      { id: 'SG-BD-2026Q4-01-2', objectiveId: 'OBJ-BD-2026Q4-01', setId: 'SGSET-BD-2026Q4-01-1', name: 'Interconnection study scoped', intention: 'Each pilot site has a study plan with the utility.', plannedDate: D('2026-11-06'), actualDate: null, status: 'pending', order: 1 }
    ],
    stageGateEdges: [],
    tasks: [
      { id: 'TSK-BD-2026Q4-01-1', objectiveId: 'OBJ-BD-2026Q4-01', name: 'Send the Cascade Public Power proposal draft', plannedStart: D('2026-10-10'), plannedEnd: D('2026-10-18'), percentComplete: 50, actualStart: D('2026-10-10'), actualEnd: null },
      { id: 'TSK-BD-2026Q4-01-2', objectiveId: 'OBJ-BD-2026Q4-01', name: 'Book the Ironwood Industrial site visit', plannedStart: D('2026-10-12'), plannedEnd: D('2026-10-15'), percentComplete: 0, actualStart: null, actualEnd: null }
    ],
    boards: [], risks: [], planVersions: [], catchupPlans: [], objectiveState: [],
    gateMode: { 'OBJ-BD-2026Q4-01': 'kanban' }, chainGatesByDate: {}, etbTrees: {}
  };

  S.docs = { 'EXEC-DIV-FC': FC, 'EXEC-DIV-EL': EL, 'BIZ-DIV-BD': BD };

  /* --------------------------------------------------------- spec docs */
  S.spec = {
    'SPEC-DIV-FC': { keyResults: [], stageGates: [], kpis: [], kpiUpdates: [], modelSpec: { 'MDL-FC-1-1': { application: 'Heavy-duty truck fuel cell', maturity: 'Prototype', notes: '' } } },
    'SPEC-DIV-EL': {
      keyResults: [
        { id: 'KR-EL-1-1-1', objectiveId: 'MDL-EL-1-1', statement: 'Rated stack power', trackingType: 'kpi' },
        { id: 'KR-EL-1-1-2', objectiveId: 'MDL-EL-1-1', statement: 'Specific energy at rated load', trackingType: 'kpi' },
        { id: 'KR-EL-1-1-3', objectiveId: 'MDL-EL-1-1', statement: 'Voltage degradation', trackingType: 'kpi' },
        { id: 'KR-EL-1-1-4', objectiveId: 'MDL-EL-1-1', statement: 'Gas purity', trackingType: 'kpi' },
        { id: 'KR-EL-2-1-1', objectiveId: 'MDL-EL-2-1', statement: 'System efficiency at rated load', trackingType: 'percentage', progress: 70, notes: 'Waiting on the balance-of-plant model.' }
      ],
      stageGates: [
        { id: 'SG-EL-1-1-1', objectiveId: 'MDL-EL-1-1', name: 'Membrane electrode assembly', ctype: 'MEA', status: 'Prototype', notes: '' },
        { id: 'SG-EL-1-1-2', objectiveId: 'MDL-EL-1-1', name: 'Porous transport layer', ctype: 'PTL', status: 'Qualified', notes: '' },
        { id: 'SG-EL-1-1-3', objectiveId: 'MDL-EL-1-1', name: 'Bipolar plate', ctype: 'BPP', status: 'Second source in trial', notes: '' },
        { id: 'SG-EL-1-1-4', objectiveId: 'MDL-EL-1-1', name: 'End plates and compression', ctype: '', status: '', notes: '' },
        { id: 'SG-EL-2-1-5', objectiveId: 'MDL-EL-2-1', refModel: 'MDL-EL-1-1', refProduct: 'PRD-EL-1', name: 'Tera stack · Tera 25-30-R5', notes: 'Four stacks per skid.' }
      ],
      kpis: [
        { id: 'KPI-EL-1-1-1-1', objectiveId: 'MDL-EL-1-1', hostType: 'keyResult', hostId: 'KR-EL-1-1-1', name: 'Stack power', targetType: 'demonstration', direction: 'up', target: 25, unit: 'kW', linkParent: 'KPI-PRD-EL-1-1', linkType: 'contribute', linkPriority: 0 },
        { id: 'KPI-EL-1-1-2-1', objectiveId: 'MDL-EL-1-1', hostType: 'keyResult', hostId: 'KR-EL-1-1-2', name: 'Specific energy', targetType: 'demonstration', direction: 'down', target: 52, unit: 'kWh/kg' },
        { id: 'KPI-EL-1-1-3-1', objectiveId: 'MDL-EL-1-1', hostType: 'keyResult', hostId: 'KR-EL-1-1-3', name: 'Decay at 2 A/cm²', targetType: 'demonstration', direction: 'down', target: 5, unit: 'µV/h' },
        { id: 'KPI-EL-1-1-4-1', objectiveId: 'MDL-EL-1-1', hostType: 'keyResult', hostId: 'KR-EL-1-1-4', name: 'H₂ in O₂', targetType: 'demonstration', direction: 'down', target: 1, unit: '%' },
        { id: 'KPI-EL-1-1-C1-1', objectiveId: 'MDL-EL-1-1', hostType: 'component', hostId: 'SG-EL-1-1-1', name: 'Membrane thickness', targetType: 'demonstration', direction: 'down', target: 90, unit: 'µm' },
        { id: 'KPI-EL-1-1-C1-2', objectiveId: 'MDL-EL-1-1', hostType: 'component', hostId: 'SG-EL-1-1-1', name: 'Iridium loading', targetType: 'demonstration', direction: 'down', target: 0.4, unit: 'mg/cm²', gates: 'KR-EL-1-1-1', notes: 'Lower loading is the main cost lever.' },
        { id: 'KPI-EL-1-1-C2-1', objectiveId: 'MDL-EL-1-1', hostType: 'component', hostId: 'SG-EL-1-1-2', name: 'Porosity', targetType: 'demonstration', direction: 'up', target: 35, unit: '%' },
        { id: 'KPI-EL-1-1-C3-1', objectiveId: 'MDL-EL-1-1', hostType: 'component', hostId: 'SG-EL-1-1-3', name: 'Interfacial contact resistance', targetType: 'demonstration', direction: 'down', target: 10, unit: 'mΩ·cm²' },
        { id: 'KPI-EL-1-1-C4-1', objectiveId: 'MDL-EL-1-1', hostType: 'component', hostId: 'SG-EL-1-1-4', name: 'Compression uniformity', targetType: 'statistical', statistic: 'average', readCount: 4, direction: 'up', target: 90, unit: '%' },
        { id: 'KPI-EL-2-1-5-1', objectiveId: 'MDL-EL-2-1', hostType: 'component', hostId: 'SG-EL-2-1-5', name: 'Rated stack power', refModel: 'MDL-EL-1-1', refKr: 'KR-EL-1-1-1', linkType: 'specification', linkParent: null, target: null, unit: 'kW', linkSpec: 'KR-EL-2-1-1' },
        { id: 'KPI-EL-2-1-5-2', objectiveId: 'MDL-EL-2-1', hostType: 'component', hostId: 'SG-EL-2-1-5', name: 'Gas purity', refModel: 'MDL-EL-1-1', refKr: 'KR-EL-1-1-4', linkType: 'specification', linkParent: null, target: 0.5, unit: '%' }
      ],
      kpiUpdates: [
        { id: 'UPD-S1-a', kpiId: 'KPI-EL-1-1-1-1', value: 23.6, timestamp: TS('2026-09-24T15:00:00Z'), note: '' },
        { id: 'UPD-S1-b', kpiId: 'KPI-EL-1-1-1-1', value: 24.1, timestamp: TS('2026-10-09T15:00:00Z'), note: '' },
        { id: 'UPD-S2-a', kpiId: 'KPI-EL-1-1-2-1', value: 53.4, timestamp: TS('2026-10-09T15:00:00Z'), note: '' },
        { id: 'UPD-S3-a', kpiId: 'KPI-EL-1-1-3-1', value: 6.8, timestamp: TS('2026-09-30T15:00:00Z'), note: '' },
        { id: 'UPD-S3-b', kpiId: 'KPI-EL-1-1-3-1', value: 6.2, timestamp: TS('2026-10-10T15:00:00Z'), note: '' },
        { id: 'UPD-S4-a', kpiId: 'KPI-EL-1-1-4-1', value: 0.62, timestamp: TS('2026-10-08T15:00:00Z'), note: '' },
        { id: 'UPD-C1-a', kpiId: 'KPI-EL-1-1-C1-1', value: 89, timestamp: TS('2026-10-02T15:00:00Z'), note: '' },
        { id: 'UPD-C1-b', kpiId: 'KPI-EL-1-1-C1-2', value: 0.45, timestamp: TS('2026-10-02T15:00:00Z'), note: '' },
        { id: 'UPD-C2-a', kpiId: 'KPI-EL-1-1-C2-1', value: 37, timestamp: TS('2026-09-28T15:00:00Z'), note: '' },
        { id: 'UPD-C3-a', kpiId: 'KPI-EL-1-1-C3-1', value: 12.5, timestamp: TS('2026-10-06T15:00:00Z'), note: '' },
        { id: 'UPD-C4-a', kpiId: 'KPI-EL-1-1-C4-1', value: 86, timestamp: TS('2026-10-07T15:00:00Z'), note: '' },
        { id: 'UPD-C4-b', kpiId: 'KPI-EL-1-1-C4-1', value: 88, timestamp: TS('2026-10-08T15:00:00Z'), note: '' }
      ],
      modelSpec: {
        'MDL-EL-1-1': { application: 'Grid-scale PEM electrolysis, 30 bar output', maturity: 'Pilot', notes: 'Component lock targets the November design freeze.' },
        'MDL-EL-2-1': { application: 'Containerised 250 kW electrolysis skid', maturity: 'Concept', notes: '' }
      }
    }
  };

  /* ------------------------------------------------- other shared stores */
  S.ganttView = { overrides: {} };
  S.analysis = { schema: 2, runs: [] };          // seeded by the KPI module (seed_kpi)
  S.prefs = { kbDone: {} };                      // this person's Done-column choices on the broker
  S.version = 1;
  return S;
}
