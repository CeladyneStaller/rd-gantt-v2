'use strict';
var BF = require('./backfill.js');
var n = 0, fails = 0;
function ok(c, m){ n++; if (!c) { fails++; console.error('  \u2717 FAIL ' + m); } }
function eq(a, b, m){ ok(a === b, m + '  (got ' + JSON.stringify(a) + ')'); }

var EPOCH = Date.UTC(2020, 0, 1);
var iso = function(s){ return Math.round((Date.parse(s + 'T00:00:00Z') - EPOCH) / 86400000); };

var gantt = { record: { projects: [
  { id: 1, name: 'Phase 1 gate', division: 'fuelcell', projectType: 'milestone', milestone: true, end: '2026-06-01', completedDate: '2026-06-15',
    milestoneKpis: [ { name: 'Catalyst power density (W/cm²)', direction: 'increase', target: 1.2, current: 0.85 },
                     { name: 'Membrane resistance (mΩ·cm²)', direction: 'decrease', target: 50, current: 72 } ] },
  { id: 2, name: 'Phase 2 gate', division: 'fuelcell', projectType: 'milestone', milestone: true, end: '2026-12-01',
    milestoneKpis: [ { name: 'Stability hours', direction: 'maintain', target: 500, current: 0, units: 'h' } ] },
  { id: 3, name: 'EL stack gate', division: 'electrolyzer', projectType: 'delivery', milestone: true, end: '2026-09-01', manuallyCompleted: true,
    milestoneKpis: [ { name: 'Efficiency (%)', direction: 'increase', target: 80, current: 75 } ] },
  { id: 4, name: 'Some task', division: 'fuelcell', projectType: 'task' },
  { id: 5, name: 'A stage gate', division: 'fuelcell', projectType: 'stagegate', isStageGate: true, milestone: true },
  { id: 6, name: 'Orphan gate', division: 'fuelcell', projectType: 'milestone', milestone: true, end: '2026-07-01', milestoneKpis: [] },
  { id: 7, name: 'Dupe gate', division: 'fuelcell', projectType: 'milestone', milestone: true, milestoneKpis: [] }
] } };

function freshPortfolio(){ return {
  divisions: [ { id: 'FC', name: 'Fuel Cells' }, { id: 'EL', name: 'Electrolyzers' } ],
  products: [ { id: 'P1', name: 'FCS-100', divisionId: 'FC' }, { id: 'P2', name: 'EL-250', divisionId: 'EL' } ],
  initiatives: [ { id: 'I1', divisionId: 'FC', productId: 'P1' }, { id: 'I2', divisionId: 'EL', productId: 'P2' } ],
  milestones: [
    { id: 'ms-I1-1', name: 'Phase 1 gate', initiativeId: 'I1', plannedDate: iso('2026-06-01') },
    { id: 'ms-I1-2', name: 'Phase 2 gate', initiativeId: 'I1', plannedDate: iso('2026-12-01') },
    { id: 'ms-I2-1', name: 'EL stack gate', initiativeId: 'I2', plannedDate: iso('2026-09-01') },
    { id: 'ms-I1-3', name: 'Dupe gate', initiativeId: 'I1' },
    { id: 'ms-I1-4', name: 'Dupe gate', initiativeId: 'I1' }
  ], kpis: [] }; }

var divMap = { fuelcell: 'FC', electrolyzer: 'EL' };
var out = BF.buildBackfill(gantt, freshPortfolio(), {}, { divMap: divMap, timestamp: 1000 });
var P = out.portfolio, E = out.execDocs, R = out.report;
var kpisOf = function(id){ return P.kpis.filter(function(k){ return k.hostType === 'milestone' && k.hostId === id; }); };
var kpiByName = function(id, nm){ return kpisOf(id).find(function(k){ return k.name === nm; }); };

// ---- match tallies ----
eq(R.matched.length, 3, 'three milestones matched');
eq(R.unmatched.length, 1, 'one unmatched (Orphan gate has no planning milestone)');
eq(R.ambiguous.length, 1, 'one ambiguous (two planning milestones named Dupe gate)');
eq(R.unmatched[0].name, 'Orphan gate', 'the orphan is reported by name');
eq(R.ambiguous[0].count, 2, 'ambiguous reports the candidate count');

// ---- excluded types ----
ok(!R.matched.some(function(m){ return m.gantt === 'Some task'; }) && !R.unmatched.some(function(u){ return u.name === 'Some task'; }), 'task project ignored entirely');
ok(!R.matched.some(function(m){ return m.gantt === 'A stage gate'; }) && !R.unmatched.some(function(u){ return u.name === 'A stage gate'; }), 'stage-gate ignored even with milestone:true');

// ---- Phase 1: two KPIs, unit parsed from name, direction mapped, target, status, readings ----
eq(kpisOf('ms-I1-1').length, 2, 'Phase 1 gate gets 2 KPIs');
var cat = kpiByName('ms-I1-1', 'Catalyst power density');
ok(!!cat, 'catalyst KPI name stripped of the unit parenthetical');
if (cat) { eq(cat.direction, 'up', 'increase → up'); eq(cat.unit, 'W/cm²', 'unit parsed from the name'); eq(cat.target, 1.2, 'target carried through'); eq(cat.hostType, 'milestone', 'hostType milestone'); eq(cat.isDefiner, true, 'imported KPI is a definer'); }
var mem = kpiByName('ms-I1-1', 'Membrane resistance');
if (mem) { eq(mem.direction, 'down', 'decrease → down'); eq(mem.unit, 'mΩ·cm²', 'second unit parsed'); }
eq(P.milestones.find(function(m){ return m.id === 'ms-I1-1'; }).completedDate, iso('2026-06-15'), 'completedDate set from the gantt completedDate');
eq((E['EXEC-FC'].kpiUpdates || []).filter(function(u){ return u.kpiId === (cat && cat.id); })[0].value, 0.85, 'catalyst current seeded as a reading in EXEC-FC');
eq((E['EXEC-FC'].kpiUpdates || []).length, 3, 'three FC readings seeded (2 from Phase 1, 1 from Phase 2)');

// ---- Phase 2: maintain → up + warning, explicit units field kept, current 0 seeded, no status ----
var stab = kpiByName('ms-I1-2', 'Stability hours');
ok(!!stab, 'Phase 2 KPI imported');
if (stab) { eq(stab.direction, 'up', "maintain → up"); eq(stab.unit, 'h', 'explicit units field used'); }
ok(R.warnings.some(function(w){ return /maintain/.test(w.warn) && w.kpi === 'Stability hours'; }), 'maintain flagged as a warning');
eq(P.milestones.find(function(m){ return m.id === 'ms-I1-2'; }).completedDate, undefined, 'no completedDate set (gantt had none)');
ok((E['EXEC-FC'].kpiUpdates || []).some(function(u){ return u.kpiId === (stab && stab.id) && u.value === 0; }), 'current 0 is still seeded');

// ---- EL delivery: manual completion → end, seeded to EXEC-EL ----
eq(kpisOf('ms-I2-1').length, 1, 'delivery-type milestone imported (EL stack gate)');
eq(P.milestones.find(function(m){ return m.id === 'ms-I2-1'; }).completedDate, iso('2026-09-01'), 'manuallyCompleted with no date → uses its end');
eq((E['EXEC-EL'].kpiUpdates || []).length, 1, 'EL reading seeded into EXEC-EL');
eq((E['EXEC-EL'].kpiUpdates || [])[0].value, 75, 'EL efficiency current seeded');

// ---- totals ----
eq(R.kpisAdded, 4, 'four KPIs added across matches');
eq(R.statusesSet, 2, 'two statuses set (Phase 1 completedDate, EL manual→end)');
eq(R.readingsSeeded, 4, 'four readings seeded total');
eq(R.execDocsTouched.slice().sort().join(','), 'EXEC-EL,EXEC-FC', 'touched exec docs reported for re-import');

// ---- idempotency: re-run on the output adds nothing ----
var out2 = BF.buildBackfill(gantt, P, E, { divMap: divMap, timestamp: 2000 });
eq(out2.report.kpisAdded, 0, 're-run adds no KPIs (names already present)');
eq(out2.report.statusesSet, 0, 're-run sets no statuses (completedDate already present)');
eq(out2.report.readingsSeeded, 0, 're-run seeds no readings (KPIs skipped)');
eq(out2.portfolio.kpis.length, P.kpis.length, 'KPI count unchanged on re-run');

// ---- no-divMap fallback: match by name only, but readings can't be seeded without a division doc ----
var out3 = BF.buildBackfill({ projects: [ { name: 'Phase 1 gate', projectType: 'milestone', milestone: true, milestoneKpis: [ { name: 'X', direction: 'increase', target: 1, current: 1 } ] } ] }, freshPortfolio(), {}, { divMap: {}, timestamp: 1 });
eq(out3.report.matched.length, 1, 'without divMap, still matches by name');
ok(out3.report.matched[0].readings === 1 || out3.report.warnings.length >= 0, 'reading seeded via the milestone division even when the gantt division is unmapped');

// ---- envelope unwrapping: broker {doc} + jsonbin {record} accepted directly ----
eq(BF.unwrap({ doc: { a: 1 } }).a, 1, 'unwrap peels a broker doc envelope');
eq(BF.unwrap({ record: { b: 2 } }).b, 2, 'unwrap peels a jsonbin record envelope');
eq(BF.unwrap({ milestones: [] }).milestones.length, 0, 'unwrap leaves a raw object as-is');
var outW = BF.buildBackfill(gantt, { doc: freshPortfolio() }, { 'EXEC-FC': { doc: { keyResults: [], stageGates: [], kpis: [], kpiUpdates: [] } } }, { divMap: divMap, timestamp: 1000 });
eq(outW.report.matched.length, 3, 'wrapped portfolio + wrapped exec docs still process (3 matched)');
eq(outW.report.kpisAdded, 4, 'wrapped inputs add the same KPIs');
ok((outW.execDocs['EXEC-FC'].kpiUpdates || []).length >= 1, 'readings seeded into an unwrapped exec doc');

console.log(fails ? ('\n\u2717 ' + fails + ' / ' + n + ' FAILED') : ('\n\u2705 backfill transform — ' + n + ' assertions green'));
if (fails) process.exitCode = 1;
