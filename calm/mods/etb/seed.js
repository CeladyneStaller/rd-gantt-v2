/* ============================================================================
   Logic-tree seeds (X-exp). Shapes are exactly the live ETB's:
     EXEC-DIV-EL  etbTrees['OBJ-EL-2026Q4-01'] = { schema:2, trees:[…], activeTid }   (two trees)
     EXEC-DIV-FC  etbTrees['OBJ-FC-2026Q4-02'] = a bare schema-1 tree (an older document;
                  it is wrapped as "Main" on read and rewritten as a container on the first edit)
     BIZ-DIV-BD   etbTrees['OBJ-BD-2026Q4-01'] = a bare tree (the Sales app keeps one tree per objective)
   Story: Toru chases the cell 7 voltage outlier the milestone report found (tree 1: a concluded
   step, a partly read current step with an imported sample, a range key read, a repeat with an
   overridden field, a manual criterion and an amended conclusion); tree 2 checks crossover margin
   (an "inconclusive" outcome, then a step whose reads are all in and match). Maya splits AST
   degradation into catalyst vs membrane from imported analysis runs; Sam tests which pilot offer
   converts (one tree, a linked pipeline KPI, a stage-gate accomplishment and a repeat).
   ========================================================================== */
function seed_etb(S) {
  var TERM = function () { return { target_achieved: { label: 'Target achieved', kind: 'success' }, conduct_fmea: { label: 'Conduct FMEA', kind: 'pause' }, halt: { label: 'Halt', kind: 'stop' } }; };
  var T_OK = { type: 'target_achieved', label: 'Target achieved', note: null };
  var T_FMEA = { type: 'conduct_fmea', label: 'Conduct FMEA', note: null };
  var T_HALT = { type: 'halt', label: 'Halt', note: null };
  function exp(o) {
    return Object.assign({ hypothesis: '', toggle: '', hypothesis_verdict: null, test: '', status: 'planned', owner: '', planned_date: null, completed_date: null, notes: '', key_reads: [], possible_results: [], actual_outcome: null, audit_log: [], repeat_of: null, overrides: {} }, o);
  }
  function kr(id, name, unit, dir, cv, extra) { return Object.assign({ id: id, name: name, unit: unit, critical_value: cv, critical_value_hi: '', direction: dir }, extra || {}); }
  function res(id, label, criteria, conclusion, next, terminal, acc) { return { id: id, label: label, criteria: criteria, conclusion: conclusion, accomplishments: acc || [], next_experiment_ids: next || [], terminal: terminal || null }; }
  function hit(k) { return { key_read_id: k, status: 'hit' }; }
  function miss(k) { return { key_read_id: k, status: 'miss' }; }

  /* ---------------- Electrolyzer: the 10-cell stack qualification ---------------- */
  var cell7 = {
    schema_version: '1.0', tree_id: 'tree_el_cell7_2026', tid: 't_cell7', name: 'Cell 7 voltage outlier', title: 'Cell 7 voltage outlier',
    project_id: 'OBJ-EL-2026Q4-01', root_experiment_id: 'exp_001', terminal_types: TERM(),
    metadata: { created_date: '2026-10-01', modified_date: '2026-10-12' },
    experiments: {
      exp_001: exp({
        id: 'exp_001', code: 'EXP-1', name: 'Map cell voltages at first light',
        hypothesis: 'Cell 7 sits more than 15 mV above the stack mean at 2 A/cm².', toggle: 'Nothing varied: first-light baseline',
        hypothesis_verdict: 'confirmed', test: 'Polarization curve on the 10-cell build with per-cell voltage taps, three sweeps.',
        status: 'complete', owner: 'TH', planned_date: '2026-09-30', completed_date: '2026-10-02', notes: 'Cells 6 and 8 also read high, by less.',
        key_reads: [kr('kr_001_1', 'Cell 7 deviation from stack mean', 'mV', '<=', '15')],
        possible_results: [
          res('res_001a', 'Outlier confirmed', [miss('kr_001_1')], 'Cell 7 is a real outlier. Check compression on cells 6 to 8 first.', ['exp_002']),
          res('res_001b', 'Within normal spread', [hit('kr_001_1')], 'No outlier; the first-light reading was noise.', [], T_OK),
          res('res_001c', 'Voltage tap fault', [{ key_read_id: 'kr_001_1', op: '>', value: '80' }], 'A deviation this large is the tap, not the cell. Fix the wiring first.', [], T_HALT)
        ],
        actual_outcome: { result_id: 'res_001a', recorded_date: '2026-10-02', recorded_by: 'Toru Hayashi', note: null, conclusion: null, next_experiment_ids: [], terminal: null, key_read_values: { kr_001_1: 41 } },
        audit_log: [{ timestamp: '2026-10-03T08:40:00.000Z', user: 'Toru Hayashi', field: 'possible_results.res_001a.conclusion', action: 'amend', from: 'Cell 7 is a real outlier.', to: 'Cell 7 is a real outlier. Check compression on cells 6 to 8 first.', reason: 'Added the next check agreed in the build review.' }]
      }),
      exp_002: exp({
        id: 'exp_002', code: 'EXP-2', name: 'Gasket compression check on cells 6 to 8',
        hypothesis: 'Thicker gaskets on cells 6 to 8 under-compress the PTL, which raises contact resistance and the cell 7 voltage.',
        toggle: 'Gasket set: matched vs as-built', test: 'Measure every gasket, rebuild with a matched set, rerun the 2 A/cm² hold and log per-cell voltage.',
        status: 'in_progress', owner: 'TH', planned_date: '2026-10-06',
        key_reads: [
          kr('kr_002_1', 'Cell voltage at 2 A/cm²', 'V', '<=', '1.85', { source_kpi_gid: 'KPI-EL-2026Q4-01-1-1' }),
          kr('kr_002_2', 'Cell 7 deviation from stack mean', 'mV', '<=', '15', { statistic: 'average', readCount: 3 }),
          kr('kr_002_3', 'Gasket thickness spread', 'mm', '<=', '0.02')
        ],
        key_read_readings: { kr_002_2: [12] },
        possible_results: [
          res('res_002a', 'Compression was the cause', [hit('kr_002_2'), hit('kr_002_3')], 'Matched gaskets fix the outlier; lock the gasket tolerance.', [], T_OK,
            [{ id: 'acc_1', type: 'stage_gate', label: 'Durability screen, 500 h', gate_id: 'SG-EL-2026Q4-01-2', note: null }]),
          res('res_002b', 'Cell 7 MEA is the problem', [miss('kr_002_2'), hit('kr_002_3')], 'Compression is fine; the MEA itself is off.', ['exp_003'], null,
            [{ id: 'acc_1', type: 'stage_gate', label: 'SG-2: uniformity proven', gate_id: null, note: null }]),
          res('res_002c', 'Both still out of spec', [miss('kr_002_2'), miss('kr_002_3')], 'More than one failure mode. Take it to the FMEA.', [], T_FMEA)
        ]
      }),
      exp_003: exp({
        id: 'exp_003', code: 'EXP-3', name: 'Swap the cell 7 MEA and retest',
        hypothesis: 'A replacement MEA from a different lot brings cell 7 within 15 mV of the mean.', toggle: 'MEA lot',
        test: 'Swap the cell 7 MEA for one from lot 2611, rerun the 2 A/cm² hold.', owner: 'TH', planned_date: '2026-10-27',
        key_reads: [
          kr('kr_003_1', 'Cell 7 deviation from stack mean', 'mV', '<=', '15'),
          kr('kr_003_2', 'Cell 7 voltage at 2 A/cm²', 'V', 'range', '1.78', { critical_value_hi: '1.85' })
        ],
        possible_results: [
          res('res_003a', 'Deviation gone', [hit('kr_003_1'), hit('kr_003_2')], 'Bad MEA lot. Quarantine lot 2604.', [], T_OK),
          res('res_003b', 'Deviation persists', [miss('kr_003_1')], 'Not the MEA. Re-map the stack after the swap before changing hardware.', ['exp_004'])
        ]
      }),
      exp_004: exp({
        id: 'exp_004', code: 'EXP-1·R1', name: 'Map cell voltages at first light (repeat)', repeat_of: 'exp_001', overrides: { test: true }, owner: 'TH',
        hypothesis: 'Cell 7 sits more than 15 mV above the stack mean at 2 A/cm².', toggle: 'Nothing varied: first-light baseline',
        test: 'Repeat the first-light polarization curve after the MEA swap, three sweeps, with the taps re-seated.',
        key_reads: [kr('kr_001_1', 'Cell 7 deviation from stack mean', 'mV', '<=', '15')],
        possible_results: [
          { id: 'exp_004_r1', source_result_id: 'res_001a', label: 'Outlier confirmed', criteria: [miss('kr_001_1')], conclusion: 'Cell 7 is a real outlier. Check compression on cells 6 to 8 first.', accomplishments: [], next_experiment_ids: [], terminal: null },
          { id: 'exp_004_r2', source_result_id: 'res_001b', label: 'Within normal spread', criteria: [hit('kr_001_1')], conclusion: 'No outlier; the first-light reading was noise.', accomplishments: [], next_experiment_ids: [], terminal: null },
          { id: 'exp_004_r3', source_result_id: 'res_001c', label: 'Voltage tap fault', criteria: [{ key_read_id: 'kr_001_1', op: '>', value: '80' }], conclusion: 'A deviation this large is the tap, not the cell. Fix the wiring first.', accomplishments: [], next_experiment_ids: [], terminal: null }
        ]
      })
    }
  };
  var xover = {
    schema_version: '1.0', tree_id: 'tree_el_xover_2026', tid: 't_xover', name: 'Crossover margin at 30 bar', title: 'Crossover margin at 30 bar',
    project_id: 'OBJ-EL-2026Q4-01', root_experiment_id: 'exp_001', terminal_types: TERM(),
    metadata: { created_date: '2026-10-05', modified_date: '2026-10-12' },
    experiments: {
      exp_001: exp({
        id: 'exp_001', code: 'EXP-1', name: 'Crossover at 30 bar, first build',
        hypothesis: 'H₂ in O₂ stays under 1% at 30 bar on the first build.', toggle: 'Nothing varied: first build at 30 bar',
        test: 'Gas chromatograph on the anode outlet at 30 bar.', status: 'complete', owner: 'PN', planned_date: '2026-10-06', completed_date: '2026-10-08',
        key_reads: [kr('kr_001_1', 'H₂ in O₂, first build', '%', '<=', '1')],
        possible_results: [
          res('res_001a', 'Margin holds', [hit('kr_001_1')], 'Crossover is not a risk for the durability campaign.', [], T_OK),
          res('res_001b', 'Over the limit', [miss('kr_001_1')], 'The membrane is too thin for 30 bar.', [], T_HALT)
        ],
        actual_outcome: { result_id: 'inconclusive', recorded_date: '2026-10-08', recorded_by: 'Priya Natarajan', note: 'The gas chromatograph drifted 0.3% during the run.', conclusion: 'Recalibrate the GC and repeat before deciding.', next_experiment_ids: ['exp_002'], terminal: null, key_read_values: { kr_001_1: 0.62 } }
      }),
      exp_002: exp({
        id: 'exp_002', code: 'EXP-2', name: 'Crossover at 30 bar after recalibrating the GC',
        hypothesis: 'H₂ in O₂ stays under 1% at 30 bar, fresh and after a 100 h hold.', toggle: 'Hold time at 30 bar',
        test: 'Recalibrated gas chromatograph on the anode outlet at 30 bar, at start and after a 100 h hold.', status: 'in_progress', owner: 'PN', planned_date: '2026-10-09',
        key_reads: [
          kr('kr_002_1', 'H₂ in O₂ crossover', '%', '<=', '1', { source_kpi_gid: 'KPI-EL-2026Q4-01-3-1' }),
          kr('kr_002_2', 'Crossover after a 100 h hold', '%', '<=', '1')
        ],
        key_read_readings: { kr_002_2: [0.74] },
        possible_results: [
          res('res_002a', 'Margin holds', [hit('kr_002_1'), hit('kr_002_2')], 'Crossover is not a risk for the durability campaign.', [], T_OK),
          res('res_002b', 'Margin erodes over the hold', [hit('kr_002_1'), miss('kr_002_2')], 'Fresh is fine but it creeps. Try a recombination layer.', ['exp_003']),
          res('res_002c', 'Over the limit when fresh', [miss('kr_002_1')], 'The membrane is too thin for 30 bar.', [], T_HALT)
        ]
      }),
      exp_003: exp({
        id: 'exp_003', code: 'EXP-3', name: 'Add a recombination layer and repeat the hold',
        hypothesis: 'A Pt recombination interlayer keeps crossover under 1% through the hold.', toggle: 'Recombination layer: none vs Pt interlayer',
        test: 'Repeat the 100 h hold at 30 bar with the interlayer MEA.', owner: 'PN',
        key_reads: [kr('kr_003_1', 'Crossover after a 100 h hold', '%', '<=', '1')],
        possible_results: [
          res('res_003a', 'Back under 1%', [hit('kr_003_1')], 'Adopt the interlayer for the durability build.', [], T_OK),
          res('res_003b', 'Still over 1%', [miss('kr_003_1')], 'Crossover needs a design change. Take it to the FMEA.', [], T_FMEA)
        ]
      })
    }
  };

  /* ---------------- Fuel Cell: AST degradation root cause (legacy single-tree shape) ---------------- */
  var SRC = function (job, sample, bucket, key, step, run) { return { portal: 'analysis', job_id: job, bin_id: 'bin-' + job, sample: sample, bucket: bucket, key: key, step: step, cond: { T_C: 80, RH_pct: 100 }, run_t: run, imported_t: '2026-10-12T16:20:00.000Z' }; };
  var ast = {
    schema_version: '1.0', tree_id: 'tree_fc_ast_2026', title: 'AST degradation root cause', project_id: 'OBJ-FC-2026Q4-02',
    root_experiment_id: 'exp_001', terminal_types: TERM(), metadata: { created_date: '2026-10-05', modified_date: '2026-10-12' },
    experiments: {
      exp_001: exp({
        id: 'exp_001', code: 'EXP-1', name: 'Baseline ECSA and HFR before the AST',
        hypothesis: 'Fresh HP6-12 MEAs start within family: ECSA above 50 m²/g, HFR under 0.06 Ω·cm².', toggle: 'Nothing varied: beginning of life',
        hypothesis_verdict: 'confirmed', test: 'Cyclic voltammetry and EIS on three MEAs at 80 °C, 100% RH.',
        status: 'complete', owner: 'MO', planned_date: '2026-10-05', completed_date: '2026-10-07',
        key_reads: [
          kr('kr_001_1', 'Average ECSA, fresh', 'm²/g', '>=', '50', { statistic: 'average', readCount: 3 }),
          kr('kr_001_2', 'HFR, fresh', 'Ω·cm²', '<=', '0.06')
        ],
        possible_results: [
          res('res_001a', 'Baseline in family', [hit('kr_001_1'), hit('kr_001_2')], 'Start the AST on these three cells.', ['exp_002']),
          res('res_001b', 'Baseline off', [miss('kr_001_1')], 'Bad MEA batch. Stop before spending AST time on it.', [], T_HALT)
        ],
        actual_outcome: { result_id: 'res_001a', recorded_date: '2026-10-07', recorded_by: 'Maya Okafor', note: null, conclusion: null, next_experiment_ids: [], terminal: null,
          key_read_values: { kr_001_1: [54.1, 52.8, 53.6], kr_001_2: 0.052 }, key_read_samples: { kr_001_1: ['HP6-AST-01', 'HP6-AST-02', 'HP6-AST-03'] } },
        audit_log: [{ timestamp: '2026-10-08T09:12:00.000Z', user: 'Maya Okafor', field: 'possible_results.res_001a.conclusion', action: 'amend', from: 'Start the AST.', to: 'Start the AST on these three cells.', reason: 'Named the cells so the AST log matches.' }]
      }),
      exp_002: exp({
        id: 'exp_002', code: 'EXP-2', name: '30k-cycle AST: catalyst or membrane?',
        hypothesis: 'ECSA loss, not membrane thinning, drives the voltage decay seen after the AST.', toggle: 'Cycle count (0 vs 30k)',
        test: 'Square-wave AST, 30k cycles 0.6 to 0.95 V, then CV, EIS and fluoride emission on each cell.',
        status: 'in_progress', owner: 'MO', planned_date: '2026-10-08',
        key_reads: [
          kr('kr_002_1', 'Average ECSA after 30k cycles', 'm²/g', '>=', '32', { statistic: 'average', readCount: 3 }),
          kr('kr_002_2', 'HFR after 30k cycles', 'Ω·cm²', '<=', '0.07'),
          kr('kr_002_3', 'Fluoride emission rate', 'µg/cm²/h', '<=', '5')
        ],
        key_read_readings: {
          kr_002_1: [
            { v: 31.2, src: SRC('j-ast-0102', 'HP6-AST-01', 'ecsa', 'Average ECSA', '30k', '2026-10-11T10:00:00Z'), batch: 'b_ast30k' },
            { v: 29.8, src: SRC('j-ast-0202', 'HP6-AST-02', 'ecsa', 'Average ECSA', '30k', '2026-10-11T15:30:00Z'), batch: 'b_ast30k' }
          ]
        },
        possible_results: [
          res('res_002a', 'Catalyst-dominated', [miss('kr_002_1'), hit('kr_002_2')], 'The catalyst layer is what degrades. Try a Pt-Co catalyst.', ['exp_003']),
          res('res_002b', 'Membrane-dominated', [hit('kr_002_1'), miss('kr_002_2')], 'The membrane thins. Take it to the FMEA with the membrane team.', [], T_FMEA),
          res('res_002c', 'Both degrade', [miss('kr_002_1'), miss('kr_002_2')], 'Mixed signal. Rerun on fresh cells before deciding.', ['exp_004'])
        ]
      }),
      exp_003: exp({
        id: 'exp_003', code: 'EXP-3', name: 'Swap to a Pt-Co catalyst and rerun the AST',
        hypothesis: 'A Pt-Co cathode halves the ECSA loss over 30k cycles.', toggle: 'Cathode catalyst', test: 'Same AST protocol on three Pt-Co MEAs.', owner: 'MO',
        key_reads: [kr('kr_003_1', 'Average ECSA after 30k cycles', 'm²/g', '>=', '40', { statistic: 'average', readCount: 3 })],
        possible_results: [
          res('res_003a', 'Loss halved', [hit('kr_003_1')], 'Adopt Pt-Co for the low-humidity build.', [], T_OK),
          res('res_003b', 'No better', [miss('kr_003_1')], 'Catalyst swap does not help; stop this line.', [], T_HALT)
        ]
      }),
      exp_004: exp({
        id: 'exp_004', code: 'EXP-2·R1', name: '30k-cycle AST: catalyst or membrane? (repeat)', repeat_of: 'exp_002', owner: 'MO',
        hypothesis: 'ECSA loss, not membrane thinning, drives the voltage decay seen after the AST.', toggle: 'Cycle count (0 vs 30k)',
        test: 'Square-wave AST, 30k cycles 0.6 to 0.95 V, then CV, EIS and fluoride emission on each cell.',
        key_reads: [
          kr('kr_002_1', 'Average ECSA after 30k cycles', 'm²/g', '>=', '32', { statistic: 'average', readCount: 3 }),
          kr('kr_002_2', 'HFR after 30k cycles', 'Ω·cm²', '<=', '0.07'),
          kr('kr_002_3', 'Fluoride emission rate', 'µg/cm²/h', '<=', '5')
        ],
        possible_results: [
          { id: 'exp_004_r1', source_result_id: 'res_002a', label: 'Catalyst-dominated', criteria: [miss('kr_002_1'), hit('kr_002_2')], conclusion: 'The catalyst layer is what degrades. Try a Pt-Co catalyst.', accomplishments: [], next_experiment_ids: [], terminal: null },
          { id: 'exp_004_r2', source_result_id: 'res_002b', label: 'Membrane-dominated', criteria: [hit('kr_002_1'), miss('kr_002_2')], conclusion: 'The membrane thins. Take it to the FMEA with the membrane team.', accomplishments: [], next_experiment_ids: [], terminal: null },
          { id: 'exp_004_r3', source_result_id: 'res_002c', label: 'Both degrade', criteria: [miss('kr_002_1'), miss('kr_002_2')], conclusion: 'Mixed signal. Rerun on fresh cells before deciding.', accomplishments: [], next_experiment_ids: [], terminal: null }
        ]
      })
    }
  };

  /* ---------------- Business Development: which pilot offer converts (Sales, one tree) ---------------- */
  var pilot = {
    schema_version: '1.0', tree_id: 'tree_bd_pilot_2026', title: 'Which pilot offer converts', project_id: 'OBJ-BD-2026Q4-01',
    root_experiment_id: 'exp_001', terminal_types: TERM(), metadata: { created_date: '2026-09-28', modified_date: '2026-10-10' },
    experiments: {
      exp_001: exp({
        id: 'exp_001', code: 'EXP-1', name: 'Standard pilot term sheet with Teton Valley Utility',
        hypothesis: 'A standard 250 kW pilot term sheet signs within 45 days of the proposal.', toggle: 'Offer: standard terms',
        hypothesis_verdict: 'confirmed', test: 'Send the approved term sheet; track days from proposal to signature.',
        status: 'complete', owner: 'SR', planned_date: '2026-09-01', completed_date: '2026-10-08',
        key_reads: [kr('kr_001_1', 'Days from proposal to signature', 'days', '<=', '45')],
        possible_results: [
          res('res_001a', 'Signed on standard terms', [hit('kr_001_1')], 'Standard terms work for a small municipal utility. Test shared savings next.', ['exp_002']),
          res('res_001b', 'Stalled in legal review', [miss('kr_001_1')], 'The term sheet needs rework before the next pitch.', [], T_HALT)
        ],
        actual_outcome: { result_id: 'res_001a', recorded_date: '2026-10-08', recorded_by: 'Sam Rivera', note: null, conclusion: null, next_experiment_ids: [], terminal: null, key_read_values: { kr_001_1: 38 } }
      }),
      exp_002: exp({
        id: 'exp_002', code: 'EXP-2', name: 'Shared-savings offer to Cascade Public Power',
        hypothesis: 'A shared-savings pilot gets a verbal yes within 30 days and lifts the qualified pipeline past $4.5 M.', toggle: 'Offer: shared savings vs fixed fee',
        test: 'Pitch shared savings in the proposal draft; log the days to a verbal yes.',
        status: 'in_progress', owner: 'SR', planned_date: '2026-10-10',
        key_reads: [
          kr('kr_002_1', 'Qualified pipeline value', '$M', '>=', '4.5', { source_kpi_gid: 'KPI-BD-2026Q4-01-2-1' }),
          kr('kr_002_2', 'Days to a verbal yes', 'days', '<=', '30')
        ],
        possible_results: [
          res('res_002a', 'Shared savings converts', [hit('kr_002_2')], 'Lead with shared savings for the next utility.', ['exp_003']),
          res('res_002b', 'Price objection', [miss('kr_002_2')], 'Shared savings stalls on price. Fall back to the standard term sheet with Cascade.', ['exp_004'])
        ]
      }),
      exp_003: exp({
        id: 'exp_003', code: 'EXP-3', name: 'Offer shared savings to Ironwood Industrial',
        hypothesis: 'An industrial host accepts the same shared-savings terms.', toggle: 'Customer type: utility vs industrial host',
        test: 'Site visit, then the shared-savings proposal.', owner: 'SR',
        key_reads: [kr('kr_003_1', 'Days to a verbal yes', 'days', '<=', '30')],
        possible_results: [
          res('res_003a', 'Second pilot signed', [hit('kr_003_1')], 'Shared savings is the default offer.', [], T_OK,
            [{ id: 'acc_1', type: 'stage_gate', label: 'Interconnection study scoped', gate_id: 'SG-BD-2026Q4-01-2', note: null }]),
          res('res_003b', 'Declined', [miss('kr_003_1')], 'Industrial hosts need a different offer.', [], T_HALT)
        ]
      }),
      /* a repeat (linked copy) of EXP-1 for Cascade, with its own test text */
      exp_004: exp({
        id: 'exp_004', code: 'EXP-1·R1', name: 'Standard pilot term sheet with Teton Valley Utility (repeat)', repeat_of: 'exp_001', overrides: { test: true }, owner: 'SR',
        hypothesis: 'A standard 250 kW pilot term sheet signs within 45 days of the proposal.', toggle: 'Offer: standard terms',
        test: 'Send the standard term sheet to Cascade Public Power; track days from proposal to signature.',
        key_reads: [kr('kr_001_1', 'Days from proposal to signature', 'days', '<=', '45')],
        possible_results: [
          { id: 'exp_004_r1', source_result_id: 'res_001a', label: 'Signed on standard terms', criteria: [hit('kr_001_1')], conclusion: 'Standard terms work for a small municipal utility. Test shared savings next.', accomplishments: [], next_experiment_ids: [], terminal: null },
          { id: 'exp_004_r2', source_result_id: 'res_001b', label: 'Stalled in legal review', criteria: [miss('kr_001_1')], conclusion: 'The term sheet needs rework before the next pitch.', accomplishments: [], next_experiment_ids: [], terminal: T_HALT }
        ]
      })
    }
  };

  var el = S.docs['EXEC-DIV-EL'], fc = S.docs['EXEC-DIV-FC'], bd = S.docs['BIZ-DIV-BD'];
  if (el) { el.etbTrees = el.etbTrees || {}; el.etbTrees['OBJ-EL-2026Q4-01'] = { schema: 2, trees: [cell7, xover], activeTid: 't_cell7' }; }
  if (fc) { fc.etbTrees = fc.etbTrees || {}; fc.etbTrees['OBJ-FC-2026Q4-02'] = ast; }
  if (bd) { bd.etbTrees = bd.etbTrees || {}; bd.etbTrees['OBJ-BD-2026Q4-01'] = pilot; }
}
