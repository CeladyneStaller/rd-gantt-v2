/* ============================================================================
   Current-step seeds (X-exp): analysis-portal runs for the Fuel Cell AST cells,
   so an experiment's Connect data has real samples to import. Two 30k-cycle
   ECSA values are already connected to EXP-2 (see mods/etb/seed.js); the third
   cell (HP6-AST-03) and every HFR value are waiting to be imported.
   Appends to C.D.analysis (schema 2 runs, the portal index shape); never
   removes runs another module seeded.
   ========================================================================== */
function seed_step(S) {
  if (!S.analysis || typeof S.analysis !== 'object') S.analysis = { schema: 2, runs: [] };
  if (!Array.isArray(S.analysis.runs)) S.analysis.runs = [];
  var COND = function () { return { T_C: 80, RH_pct: 100 }; };
  function run(job, sample, script, ts, data) { return { job_id: job, sample_name: sample, script: script, timestamp: ts, bin_id: 'bin-' + job, Data: data }; }
  function unit(an, step, kv) { return { Analysis: an, step: step, Conditions: COND(), key_values: kv }; }
  var have = {}; S.analysis.runs.forEach(function (r) { if (r && r.job_id) have[r.job_id] = 1; });
  [
    run('j-ast-0101', 'HP6-AST-01', 'CV and EIS, beginning of life', '2026-10-06T14:00:00Z', [unit('ecsa', 'BOL', { 'Average ECSA': 54.1 }), unit('eis', 'BOL', { 'HFR': 0.051 })]),
    run('j-ast-0201', 'HP6-AST-02', 'CV and EIS, beginning of life', '2026-10-06T16:00:00Z', [unit('ecsa', 'BOL', { 'Average ECSA': 52.8 }), unit('eis', 'BOL', { 'HFR': 0.053 })]),
    run('j-ast-0301', 'HP6-AST-03', 'CV and EIS, beginning of life', '2026-10-07T09:00:00Z', [unit('ecsa', 'BOL', { 'Average ECSA': 53.6 }), unit('eis', 'BOL', { 'HFR': 0.052 })]),
    run('j-ast-0102', 'HP6-AST-01', 'CV and EIS after 30k AST cycles', '2026-10-11T10:00:00Z', [unit('ecsa', '30k', { 'Average ECSA': 31.2 }), unit('eis', '30k', { 'HFR': 0.066 })]),
    run('j-ast-0202', 'HP6-AST-02', 'CV and EIS after 30k AST cycles', '2026-10-11T15:30:00Z', [unit('ecsa', '30k', { 'Average ECSA': 29.8 }), unit('eis', '30k', { 'HFR': 0.071 })]),
    run('j-ast-0302', 'HP6-AST-03', 'CV and EIS after 30k AST cycles', '2026-10-12T11:00:00Z', [unit('ecsa', '30k', { 'Average ECSA': 33.9 }), unit('eis', '30k', { 'HFR': 0.064 })])
  ].forEach(function (r) { if (!have[r.job_id]) S.analysis.runs.push(r); });
}
