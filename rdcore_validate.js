const RD = require('./rdcore.js');
let pass=0, fail=0;
const t=(n,c)=>{ if(c){console.log('  PASS',n);pass++} else {console.log('  FAIL',n);fail++} };

// Minimal fixture mirroring the real doc shapes
const portfolio = {
  divisions:  [{id:'DIV-FC', name:'Fuel Cell'}, {id:'DIV-EL', name:'Electrolyzer'}],
  products:   [{id:'PRD-RES', name:'Residential FC', divisionId:'DIV-FC'}],
  models:     [{id:'MDL-G2', name:'Gen 2', productId:'PRD-RES'}],
  initiatives:[{id:'INI-1', name:'Stack Cost Down', divisionId:'DIV-FC', productId:'PRD-RES'}],
  objectives: [
    {id:'OBJ-1', statement:'Cut MEA cost 30%', divisionId:'DIV-FC', initiativeId:'INI-1',
     quarter:'2026-Q3', owner:['corey@celadynetech.com','erin@celadynetech.com'], modelId:'MDL-G2'},   // SHARED: two owners
    {id:'OBJ-2', statement:'Raise stack durability', divisionId:'DIV-FC', initiativeId:'INI-1',
     quarter:'2026-Q3', owner:'someone.else@celadynetech.com'},   // LEGACY free-text owner, still supported
  ],
  milestones:[], milestoneEdges:[], objectiveEdges:[], kpis:[], kpiDefs:[], composition:[]
};
const execDocs = {
  'DIV-FC': {
    objectiveState: [{objectiveId:'OBJ-2', status:'achieved'}],
    keyResults: [
      {id:'KR-1', objectiveId:'OBJ-1', statement:'Cost per kW', trackingType:'percentage', progress:95},
      {id:'KR-2', objectiveId:'OBJ-1', statement:'Yield',       trackingType:'percentage', progress:85},
      {id:'KR-3', objectiveId:'OBJ-2', statement:'Hours',       trackingType:'percentage', progress:60},
    ],
    kpis:[], stageGates:[], stageGateSets:[], tasks:[], kpiUpdates:[],
    stageGateEdges:[], chainGatesByDate:{}, risks:[], catchupPlans:[], etbTrees:{}
  },
  'DIV-EL': { objectiveState:[], keyResults:[], kpis:[], stageGates:[], stageGateSets:[] }
};
// The apps pass withPortfolio(portfolio, execMap) so cross-doc KPI resolution works
const pfMap = RD.withPortfolio(portfolio, execDocs);

console.log('\n1. Tile badge path (objectiveScore -> band):');
const s1 = RD.objectiveScore('OBJ-1', pfMap);
t(`OBJ-1 score = mean(95,85) = 90 (got ${s1})`, s1 === 90);
t(`band(90) = on-track (got ${RD.band(s1)})`, RD.band(s1) === 'on-track');
const s2 = RD.objectiveScore('OBJ-2', pfMap);
t(`OBJ-2 score = 60 -> off-track (got ${RD.band(s2)})`, s2 === 60 && RD.band(s2) === 'off-track');

console.log('\n2. OKR view path (krsForObjective + keyResultScore):');
const krs = RD.krsForObjective('OBJ-1', pfMap);
t(`OBJ-1 has 2 KRs (got ${krs.length})`, krs.length === 2);
t('KR label comes from .statement', krs[0].statement === 'Cost per kW');
t(`keyResultScore(KR-1) = 95 (got ${RD.keyResultScore('KR-1', pfMap)})`, RD.keyResultScore('KR-1', pfMap) === 95);

console.log('\n3. Active filter path (objectiveEndState):');
const end1 = RD.objectiveEndState(execDocs['DIV-FC'].objectiveState, 'OBJ-1');
const end2 = RD.objectiveEndState(execDocs['DIV-FC'].objectiveState, 'OBJ-2');
t('OBJ-1 not ended -> active', end1 === null);
t(`OBJ-2 ended, status=achieved (got ${end2 && end2.status})`, end2 && end2.status === 'achieved');

console.log('\n4. Grouping path (effProduct / effModel with initiative cascade):');
t(`OBJ-1 effModel = MDL-G2 (own)`, RD.effModel(portfolio.objectives[0], portfolio) === 'MDL-G2');
t(`OBJ-1 effProduct = PRD-RES (via model->product)`, RD.effProduct(portfolio.objectives[0], portfolio) === 'PRD-RES');
t(`OBJ-2 effProduct = PRD-RES (agnostic -> inherits initiative)`, RD.effProduct(portfolio.objectives[1], portfolio) === 'PRD-RES');

console.log('\n5. Rollups (division / company):');
const dv = RD.rollupDivision('DIV-FC', portfolio, pfMap);
t(`rollupDivision(DIV-FC) = mean(90,60) = 75 (got ${dv})`, dv === 75);
t(`rollupCompany = 75 (got ${RD.rollupCompany(portfolio, pfMap)})`, RD.rollupCompany(portfolio, pfMap) === 75);
t(`rollupDivision(DIV-EL) = null -> no-band`, RD.rollupDivision('DIV-EL', portfolio, pfMap) === null
   && RD.band(RD.rollupDivision('DIV-EL', portfolio, pfMap)) === 'no-band');

console.log('\n6. Projects routing (owner contains session email):');
// NEVER compare o.owner directly: it is a LIST now, and legacy rows still hold a bare string.
// RD.ownersOf() reads both shapes — that is what it is for.
const mine = portfolio.objectives.filter(o => RD.ownersOf(o).includes('corey@celadynetech.com'));
const hers = portfolio.objectives.filter(o => RD.ownersOf(o).includes('erin@celadynetech.com'));
const legacy = portfolio.objectives.filter(o => RD.ownersOf(o).includes('someone.else@celadynetech.com'));
console.log('   shared objective is visible to BOTH owners:', mine.length===1 && hers.length===1);
console.log('   a legacy string owner still routes:', legacy.length===1);
t('owner match yields OBJ-1 only', mine.length === 1 && mine[0].id === 'OBJ-1');

console.log(`\n${pass}/${pass+fail} passed`);
process.exit(fail?1:0);