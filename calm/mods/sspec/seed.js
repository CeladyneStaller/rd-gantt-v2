/* sspec seed (Product spec board only): HP6-12 product specifications for Fuel Cell, so every
   tracking type and target type shows up somewhere: a statistical KPI with a short sample, a range,
   weighted sub-specifications, % completion with notes, and a binary pass/fail. Erin's roll-to-roll
   work and Maya's low-humidity durability are the story behind them. Additive only. */
function seed_sspec(S) {
  var TS = calmTs;
  var doc = S.spec['SPEC-DIV-FC'];
  if (!doc || (doc.keyResults || []).some(function (r) { return r.objectiveId === 'MDL-FC-1-1'; })) return;
  doc.keyResults.push(
    { id: 'KR-FC-1-1-1', objectiveId: 'MDL-FC-1-1', statement: 'Proton conductivity at 80 °C, 95% RH', trackingType: 'kpi' },
    { id: 'KR-FC-1-1-2', objectiveId: 'MDL-FC-1-1', statement: 'Membrane thickness on the coated roll', trackingType: 'kpi' },
    { id: 'KR-FC-1-1-3', objectiveId: 'MDL-FC-1-1', statement: 'Low-humidity performance', trackingType: 'subkr',
      subKrs: [
        { name: 'Current density at 0.6 V, 20% RH', weight: 2, trackingType: 'kpi', progress: 0,
          kpis: [{ type: 'statistical', targetType: 'statistical', name: 'Current density at 0.6 V, 20% RH', current: 0.22, direction: 'up', target: 1.2, unit: 'A/cm²', statistic: 'average', readCount: 3, readings: '0.21, 0.23, 0.22' }] },
        { name: 'Swap to the short-side-chain ionomer', weight: 1, trackingType: 'percentage', progress: 40, kpis: [] },
        { name: 'High-frequency resistance at 20% RH', weight: 1, trackingType: 'kpi', progress: 0,
          kpis: [{ type: 'demonstration', targetType: 'demonstration', name: 'High-frequency resistance at 20% RH', current: 96, direction: 'down', target: 80, unit: 'mΩ·cm²' }] },
        { name: 'Passes 500 h of RH cycling', weight: 1, trackingType: 'kpi', progress: 0,
          kpis: [{ type: 'binary', targetType: 'binary', name: 'Passes 500 h of RH cycling', current: null }] }
      ] },
    { id: 'KR-FC-1-1-4', objectiveId: 'MDL-FC-1-1', statement: 'Roll-to-roll line ready for the customer audit', trackingType: 'percentage', progress: 55,
      notes: 'Tension control is commissioned; the inspection procedure is still being written. Audit is planned for December.' },
    { id: 'KR-FC-1-1-5', objectiveId: 'MDL-FC-1-1', statement: 'Passes the 80 °C hydrogen crossover screen', trackingType: 'kpi' }
  );
  doc.kpis.push(
    { id: 'KPI-FC-1-1-1-1', objectiveId: 'MDL-FC-1-1', hostType: 'keyResult', hostId: 'KR-FC-1-1-1', name: 'Proton conductivity at 80 °C, 95% RH', targetType: 'statistical', statistic: 'median', readCount: 6, direction: 'up', target: 95, unit: 'mS/cm', linkParent: null },
    { id: 'KPI-FC-1-1-1-2', objectiveId: 'MDL-FC-1-1', hostType: 'keyResult', hostId: 'KR-FC-1-1-1', name: 'Conductivity at 80 °C, 50% RH', targetType: 'demonstration', direction: 'up', target: 40, unit: 'mS/cm', linkParent: null },
    { id: 'KPI-FC-1-1-2-1', objectiveId: 'MDL-FC-1-1', hostType: 'keyResult', hostId: 'KR-FC-1-1-2', name: 'Membrane thickness on the coated roll', targetType: 'demonstration', direction: 'range', target: { lo: 11.5, hi: 12.5 }, unit: 'µm', linkParent: null,
      notes: 'Measured by the inline beta gauge at the roll centre line.' },
    { id: 'KPI-FC-1-1-5-1', objectiveId: 'MDL-FC-1-1', hostType: 'keyResult', hostId: 'KR-FC-1-1-5', name: 'Passes the 80 °C hydrogen crossover screen', targetType: 'binary', direction: null, target: null, unit: null, linkParent: null }
  );
  doc.kpiUpdates.push(
    { id: 'UPD-FC-S1-a', kpiId: 'KPI-FC-1-1-1-1', value: 92.8, timestamp: TS('2026-10-05T15:00:00Z'), note: '' },
    { id: 'UPD-FC-S1-b', kpiId: 'KPI-FC-1-1-1-1', value: 93.4, timestamp: TS('2026-10-07T15:00:00Z'), note: '' },
    { id: 'UPD-FC-S1-c', kpiId: 'KPI-FC-1-1-1-1', value: 94.0, timestamp: TS('2026-10-09T15:00:00Z'), note: '' },
    { id: 'UPD-FC-S1-d', kpiId: 'KPI-FC-1-1-1-1', value: 93.1, timestamp: TS('2026-10-12T15:00:00Z'), note: '' },
    { id: 'UPD-FC-S1-e', kpiId: 'KPI-FC-1-1-1-2', value: 36.5, timestamp: TS('2026-10-10T15:00:00Z'), note: '' },
    { id: 'UPD-FC-S2-a', kpiId: 'KPI-FC-1-1-2-1', value: 12.3, timestamp: TS('2026-10-12T17:00:00Z'), note: '' },
    { id: 'UPD-FC-S5-a', kpiId: 'KPI-FC-1-1-5-1', value: 1, timestamp: TS('2026-09-29T15:00:00Z'), note: '' }
  );
}
