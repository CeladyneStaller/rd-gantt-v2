/* KPI module seed: the analysis-portal index (schema 2) that Connect data reads, provenance on the
   readings that were imported from it, who posted each sample reading, and the spec-link migration
   the live app applies when it fetches SPEC-<div> documents (RD.migrateKpiLinks). */
function seed_kpi(S) {
  var EL_COND = { T_C: 80, P_value: 30, P_unit: 'barg' };
  var runs = [];
  var n = 0;
  function bin(i) { var h = (0x6703e2a1 + i * 7919).toString(16); return (h + 'c4b0d93b7e1f20a5' + h).slice(0, 24); }
  function job(iso, kind, tag) { return 'job-' + iso.slice(5, 10).replace('-', '') + '-' + iso.slice(11, 16).replace(':', '') + '-' + kind + '-' + tag; }
  function run(sample, iso, script, units, tag) {
    n++;
    runs.push({ job_id: job(iso, script.split('_')[0].split('.')[0], tag), sample_name: sample, script: script, timestamp: iso, bin_id: bin(n), Data: units });
    return runs[runs.length - 1];
  }
  function unit(an, step, cond, kv) { return { Analysis: an, step: step || '', Conditions: cond || {}, key_values: kv }; }

  /* ---- Electrolyzer: Tera 10-cell short stack, build 2 (cells C01-C06 measured so far) ---- */
  var V2 = [1.81, 1.83, 1.82, 1.84, 1.80, 1.85];
  var V1 = [1.66, 1.67, 1.66, 1.68, 1.65, 1.69];
  var HFR = [0.074, 0.081, 0.079, 0.086, 0.071, 0.077];
  var PC_T = ['2026-10-09T15:00:00Z', '2026-10-10T15:00:00Z', '2026-10-11T15:00:00Z', '2026-10-13T14:00:00Z', '2026-10-13T14:40:00Z', '2026-10-13T15:20:00Z'];
  var EIS_T = ['2026-10-09T15:05:00Z', '2026-10-10T15:05:00Z', '2026-10-11T15:05:00Z', '2026-10-12T15:05:00Z', '2026-10-13T14:45:00Z', '2026-10-13T15:25:00Z'];
  var pcRuns = [], eisRuns = [];
  for (var c = 0; c < 6; c++) {
    var cell = 'TS10-B2-C0' + (c + 1);
    pcRuns.push(run(cell, PC_T[c], 'polcurve.py', [unit('polcurve', '', EL_COND, { 'OCV': 1.43, 'V @ 1 A/cm²': V1[c], 'V @ 2 A/cm²': V2[c] })], 'c0' + (c + 1)));
    eisRuns.push(run(cell, EIS_T[c], 'eis_fit.py', [unit('eis', '', EL_COND, { 'HFR': HFR[c] })], 'c0' + (c + 1)));
  }
  /* stack durability hold (decay rate per 100 h segment) and gas crossover */
  var DEC = [['2026-10-06T15:00:00Z', 8.1, '100 h'], ['2026-10-08T15:00:00Z', 9.0, '200 h'], ['2026-10-10T15:00:00Z', 8.2, '300 h'],
             ['2026-10-11T15:00:00Z', 8.6, '400 h'], ['2026-10-12T15:00:00Z', 8.9, '450 h'], ['2026-10-13T12:00:00Z', 9.3, '500 h']];
  DEC.forEach(function (d, i) { run('TS10-B2-STACK', d[0], 'durability.py', [unit('polcurve', d[2], EL_COND, { 'Voltage decay rate': d[1], 'V @ 2 A/cm²': 1.84 + i * 0.002 })], 'h' + (i + 1)); });
  run('TS10-B2-STACK', '2026-10-08T18:00:00Z', 'crossover.py', [unit('crossover', '', EL_COND, { '|j_xover|': 1.6, 'H₂ in O₂': 0.62 })], 'x1');
  run('TS10-B2-STACK', '2026-10-10T19:00:00Z', 'crossover.py', [unit('crossover', '500 h', EL_COND, { '|j_xover|': 1.9, 'H₂ in O₂': 0.71 })], 'x2');

  /* ---- Fuel cell: HP6-12 roll 7, low-RH MEA, AST MEA ---- */
  var FC_COND = { T_C: 80, RH_pct: 95 };
  run('HP6-12-R07-A', '2026-10-13T09:30:00Z', 'conductivity.py', [unit('eis', '', FC_COND, { 'Proton conductivity': 95.2, 'HFR': 0.042 })], 'r7a');
  run('HP6-12-R07-B', '2026-10-13T10:10:00Z', 'conductivity.py', [unit('eis', '', FC_COND, { 'Proton conductivity': 94.8, 'HFR': 0.043 })], 'r7b');
  run('HP6-12-R07', '2026-10-12T16:00:00Z', 'thickness_map.py', [unit('thickness', '', {}, { 'Thickness variation (2σ)': 1.2, 'Mean thickness': 12.1 })], 'r7');
  run('MEA-SSC-0413', '2026-10-13T11:00:00Z', 'polcurve.py', [
    unit('polcurve', '', { T_C: 80, RH_pct: 20, P_value: 150, P_unit: 'kPa' }, { 'OCV': 0.95, 'V @ 1 A/cm²': 0.61, 'j @ 0.6 V': 0.24, 'HFR': 0.061 }),
    unit('polcurve', '', { T_C: 80, RH_pct: 30, P_value: 150, P_unit: 'kPa' }, { 'OCV': 0.96, 'V @ 1 A/cm²': 0.63, 'j @ 0.6 V': 0.31, 'HFR': 0.055 })
  ], 'ssc');
  run('MEA-AST-0398', '2026-09-30T13:00:00Z', 'ecsa.py', [unit('ecsa', 'BOL', { T_C: 80, RH_pct: 100 }, { 'Average ECSA': 52.1 })], 'bol');
  run('MEA-AST-0398', '2026-10-09T13:00:00Z', 'ecsa.py', [unit('ecsa', '30k cycles', { T_C: 80, RH_pct: 100 }, { 'Average ECSA': 38.4 })], 'ast');

  S.analysis = S.analysis && typeof S.analysis === 'object' ? S.analysis : {};
  S.analysis.schema = 2;
  S.analysis.runs = (Array.isArray(S.analysis.runs) ? S.analysis.runs : []).concat(runs);

  /* ---- provenance: build 2's cell voltage and HFR readings came in through Connect data (one import) ---- */
  function find(doc, id) { return ((doc && doc.kpiUpdates) || []).filter(function (u) { return u.id === id; })[0] || null; }
  function src(r, an, key, extra) {
    var u = r.Data[0];
    var s = { portal: 'analysis', job_id: r.job_id, bin_id: r.bin_id, sample: r.sample_name, bucket: an, key: key, step: u.step || '', cond: u.Conditions || {}, run_t: r.timestamp, imported_t: '2026-10-13T14:30:00Z', script: r.script };
    if (extra) for (var k in extra) s[k] = extra[k];
    return s;
  }
  var EL = S.docs && S.docs['EXEC-DIV-EL'];
  if (EL) {
    ['UPD-V-1', 'UPD-V-2', 'UPD-V-3', 'UPD-V-4'].forEach(function (id, i) {
      var u = find(EL, id);
      if (!u) return;
      u.src = src(pcRuns[i], 'polcurve', 'V @ 2 A/cm²');
      u.note = 'analysis: polcurve/V @ 2 A/cm²';
    });
    ['UPD-H-1', 'UPD-H-2', 'UPD-H-3', 'UPD-H-4'].forEach(function (id, i) {
      var u = find(EL, id);
      if (!u) return;
      u.src = src(eisRuns[i], 'eis', 'HFR', { scale: 1000, value_raw: HFR[i] });
      u.note = 'analysis: eis/HFR';
    });
    /* build 1: one imported reading whose job has since been rotated out of the index (an orphan) */
    var h0 = find(EL, 'UPD-H-0a');
    if (h0) h0.src = { portal: 'analysis', job_id: 'job-0924-1500-eis-b1c01', bin_id: '66f2b8e0a1c4d93b7e1f2a07', sample: 'TS10-B1-C01', bucket: 'eis', key: 'HFR', step: '', cond: EL_COND, run_t: '2026-09-24T15:00:00Z', imported_t: '2026-09-25T09:00:00Z', scale: 1000, value_raw: 0.092 };
  }

  /* ---- who posted each sample reading (Calm records it; today's readings carry no author) ---- */
  var BY = {
    'EXEC-DIV-EL': { def: 'toru@celadyne.com', 'UPD-LK-1': 'priya@celadyne.com', 'UPD-ICR-1': 'priya@celadyne.com', 'UPD-Q-1': 'priya@celadyne.com' },
    'EXEC-DIV-FC': { def: 'erin@celadyne.com' },
    'BIZ-DIV-BD': { def: 'sam@celadyne.com' }
  };
  Object.keys(BY).forEach(function (key) {
    var doc = S.docs && S.docs[key];
    if (!doc) return;
    (doc.kpiUpdates || []).forEach(function (u) { if (!u.by) u.by = BY[key][u.id] || BY[key].def; });
  });
  var PBY = { 'KPI-EL-01-1': 'toru@celadyne.com', 'KPI-FC-01-1': 'erin@celadyne.com', 'KPI-FC-01-01-1': 'erin@celadyne.com', 'KPI-BD-01-1': 'sam@celadyne.com' };
  ((S.portfolio && S.portfolio.kpiUpdates) || []).forEach(function (u) { if (!u.by && PBY[u.kpiId]) u.by = PBY[u.kpiId]; });

  /* ---- the live app materialises legacy link fields on spec KPIs when it loads SPEC-<div> ---- */
  Object.keys(S.spec || {}).forEach(function (k) { var d = S.spec[k]; if (d && Array.isArray(d.kpis)) RD.migrateKpiLinks(d.kpis); });
}
