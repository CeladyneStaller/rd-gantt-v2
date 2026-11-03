/* ============================================================================
   FMEA seed (X-fmea): realistic risk registers in the real `exec.risks` shape,
   then the same load-time clean-up today's apps run in adoptExec (L2893 in
   Execution, L1610 in Sales): every stored problem is reshaped by
   RD.migrateProblem. The Business Development problem is stored in an older
   shape on purpose (an `id` instead of `rid`, knowns as plain strings, no node
   ids, missing statuses and mitigation) so the migration has visible work to do.

   Story notes
   - OBJ-EL-2026Q4-01 (Toru, 10-cell Tera short stack): seal creep is the one
     high open risk (worst open RPN 216), cell 7 is medium, the PTL supply risk
     is resolved, and the 30 bar leak risk is tied to the leak-test gate that
     passed on Sep 30, so it no longer counts as open.
   - OBJ-FC-2026Q4-01 (Erin, roll-to-roll line): coating defects, medium.
   - OBJ-BD-2026Q4-01 (Sam, utility pilots): interconnection delays, high.
   Evidence experiments sit on failure modes, effects and causes in
   Execution (all three levels); Sales never shows evidence (sales §22).
   ========================================================================== */
function seed_fmea(S) {
  function cause(cid, text, s, o, d, mit, status, xs) {
    var c = { cid: cid, cause: text, severity: s, occurrence: o, detection: d, mitigation: mit, status: status };
    if (xs && xs.length) c.experiments = xs;
    return c;
  }

  /* ---------------------------------------------------------- Electrolyzer */
  var EL = S.docs['EXEC-DIV-EL'];
  if (EL) {
    EL.risks = (EL.risks || []).concat([
      {
        rid: 'r_el_seal', objectiveId: 'OBJ-EL-2026Q4-01', gateId: 'SG-EL-2026Q4-01-2', status: 'mitigating',
        problem: 'Seal creep at 80 °C lets hydrogen into the oxygen loop',
        knowns: [
          { kid: 'k_el_seal_1', text: 'Gasket thickness varied by up to 0.06 mm across the stack at build.' },
          { kid: 'k_el_seal_2', text: 'PTFE coupons lost about 12% compression set after 200 h at 80 °C.' }
        ],
        modes: [{
          mid: 'm_el_seal_1', mode: 'Gasket relaxes and loses seal compression', status: 'open',
          experiments: [{
            xid: 'fx_seal02', code: 'EXP-2',
            hypothesis: 'Thermal cycling between 20 and 80 °C, not steady heat, drives the creep.',
            toggle: 'Steady 80 °C against 20 to 80 °C cycling',
            test: 'Two coupon sets for 100 h each; measure compression set every 25 h.',
            samples: [], key_reads: [], values: {}, notes: '', verdict: '', conclusion: ''
          }],
          effects: [
            {
              eid: 'e_el_seal_1', effect: 'H₂ in O₂ climbs past the 1% safety limit', status: 'open',
              experiments: [{
                xid: 'fx_seal03', code: 'EXP-3',
                hypothesis: 'A 0.2% offset on the H₂-in-O₂ sensor would hide the early climb.',
                toggle: 'Sensor as installed or freshly calibrated',
                test: 'Feed 1.0% H₂-in-O₂ calibration gas before and after calibrating the sensor.',
                samples: ['As installed', 'Calibrated'],
                key_reads: [{ krid: 'k_cal', name: 'Reading at 1.0% gas', unit: '%' }],
                values: { 'As installed': { k_cal: '0.78' } },
                notes: 'Calibration is booked with the sensor task.', verdict: '', conclusion: ''
              }],
              causes: [
                cause('c_el_seal_1', 'PTFE creeps above 70 °C under the 30 N·m clamp load', 9, 6, 4,
                  'Trial EPDM gaskets on cells 6 to 8 and re-torque at 100 h.', 'open', [{
                    xid: 'fx_seal01', code: 'EXP-1',
                    hypothesis: 'PTFE gaskets lose compression above 70 °C; EPDM holds it.',
                    toggle: 'Gasket material, PTFE or EPDM',
                    test: 'Compress coupons to the stack clamp load, hold 200 h at 80 °C, then measure compression set and helium leak rate.',
                    samples: ['PTFE-1', 'PTFE-2', 'EPDM-1', 'EPDM-2'],
                    key_reads: [{ krid: 'k_cset', name: 'Compression set', unit: '%' }, { krid: 'k_leak', name: 'Leak rate', unit: 'sccm' }],
                    values: { 'PTFE-1': { k_cset: '12.4', k_leak: '0.8' }, 'PTFE-2': { k_cset: '11.9', k_leak: '0.6' }, 'EPDM-1': { k_cset: '4.1', k_leak: '0.1' }, 'EPDM-2': { k_cset: '4.6' } },
                    notes: 'The EPDM-2 leak check is booked for Oct 15.',
                    verdict: 'confirmed',
                    conclusion: 'PTFE lost about 12% compression set; EPDM held under 5%. Cells 6 to 8 move to EPDM for the rebuild.'
                  }]),
                cause('c_el_seal_2', 'Gasket thickness varies by up to 0.06 mm across the stack', 8, 4, 6,
                  'Measure every gasket before the rebuild.', 'mitigating')
              ]
            },
            {
              eid: 'e_el_seal_2', effect: 'The stack trips the crossover alarm during the 500 h screen', status: 'mitigating',
              causes: [
                cause('c_el_seal_3', 'Crossover sensor drift hides a slow leak', 7, 3, 7,
                  'Calibrate the H₂-in-O₂ sensor before hour 0.', 'mitigating')
              ]
            }
          ]
        }]
      },
      {
        rid: 'r_el_cell7', objectiveId: 'OBJ-EL-2026Q4-01', gateId: 'SG-EL-2026Q4-01-5', status: 'open',
        problem: 'Cell 7 runs 40 mV above the stack average',
        knowns: [
          { kid: 'k_el_c7_1', text: 'Cell 7 sat 40 mV above the stack average at first light.' },
          { kid: 'k_el_c7_2', text: 'Cell 7 HFR reads about 9 mΩ·cm² above cells 6 and 8.' }
        ],
        modes: [{
          mid: 'm_el_c7_1', mode: 'Cell 7 voltage keeps rising under load', status: 'open',
          experiments: [{
            xid: 'fx_c7_01', code: 'EXP-1',
            hypothesis: 'Cell 7 has higher contact resistance than its neighbours.',
            toggle: 'Cell position in the stack',
            test: 'Map HFR at 1 kHz on cells 6, 7 and 8 at 1 A/cm².',
            samples: ['Cell 6', 'Cell 7', 'Cell 8'],
            key_reads: [{ krid: 'k_hfr', name: 'HFR', unit: 'mΩ·cm²' }],
            values: { 'Cell 6': { k_hfr: '74' }, 'Cell 7': { k_hfr: '83' }, 'Cell 8': { k_hfr: '75' } },
            notes: '', verdict: 'inconclusive',
            conclusion: 'Cell 7 reads 9 mΩ·cm² higher, but build 1 had a similar spread. Repeat after the rebuild.'
          }],
          effects: [{
            eid: 'e_el_c7_1', effect: 'The stack misses the 10 µV/h decay target at 500 h', status: 'open',
            causes: [
              cause('c_el_c7_1', 'Poor PTL-to-catalyst contact under a thin gasket', 7, 5, 3,
                'Fit a measured gasket on cell 7 at the rebuild.', 'open'),
              cause('c_el_c7_2', 'Membrane pinched during assembly', 9, 2, 6,
                'Single-cell leak check of cell 7.', 'resolved', [{
                  xid: 'fx_c7_02', code: 'EXP-2',
                  hypothesis: 'The cell 7 membrane was pinched during assembly.',
                  toggle: 'None, a single-cell check',
                  test: 'Isolate cell 7 and measure hydrogen crossover current at 30 bar.',
                  samples: ['Cell 7'],
                  key_reads: [{ krid: 'k_xo', name: 'Crossover current', unit: 'mA/cm²' }],
                  values: { 'Cell 7': { k_xo: '1.1' } },
                  notes: 'Within the 1.0 to 1.3 mA/cm² band of the other cells.',
                  verdict: 'refuted', conclusion: 'No sign of membrane damage on cell 7.'
                }])
            ]
          }]
        }]
      },
      {
        rid: 'r_el_ptl', objectiveId: 'OBJ-EL-2026Q4-01', gateId: null, status: 'resolved',
        problem: 'Single-source titanium PTL supply',
        knowns: [{ kid: 'k_el_ptl_1', text: 'Spare PTLs were ordered Oct 5 and arrived Oct 12.' }],
        modes: [{
          mid: 'm_el_ptl_1', mode: 'Spare PTLs arrive too late for the rebuild', status: 'resolved',
          effects: [{
            eid: 'e_el_ptl_1', effect: 'The 1,000 h hold slips past the quarter', status: 'resolved',
            causes: [cause('c_el_ptl_1', 'Supplier lead time stretched to 10 weeks', 6, 4, 2,
              'Spares ordered now; a second source is qualified under the cost-down work.', 'resolved')]
          }]
        }]
      },
      {
        rid: 'r_el_leak', objectiveId: 'OBJ-EL-2026Q4-01', gateId: 'SG-EL-2026Q4-01-1', status: 'open',
        problem: 'Stack leaks at the 30 bar pressure hold',
        knowns: [],
        modes: [{
          mid: 'm_el_leak_1', mode: 'Manifold O-ring extrudes at 30 bar', status: 'open',
          effects: [{
            eid: 'e_el_leak_1', effect: 'The pressure hold fails and the build is torn down', status: 'open',
            causes: [cause('c_el_leak_1', 'O-ring groove depth out of tolerance', 8, 3, 3,
              'Check groove depth on both end plates before assembly.', 'open')]
          }]
        }]
      }
    ]);
  }

  /* ------------------------------------------------------------- Fuel Cell */
  var FC = S.docs['EXEC-DIV-FC'];
  if (FC) {
    FC.risks = (FC.risks || []).concat([{
      rid: 'r_fc_coat', objectiveId: 'OBJ-FC-2026Q4-01', gateId: 'SG-FC-2026Q4-01-3', status: 'mitigating',
      problem: 'Coating defects on the roll-to-roll line',
      knowns: [
        { kid: 'k_fc_coat_1', text: 'Pinholes cluster in the first 3 m after each splice.' },
        { kid: 'k_fc_coat_2', text: 'Thickness 2σ reached 1.7 µm on the Oct 9 roll.' }
      ],
      modes: [
        {
          mid: 'm_fc_coat_1', mode: 'Pinholes in the cast membrane', status: 'open',
          effects: [{
            eid: 'e_fc_coat_1', effect: 'MEAs fail the crossover screen', status: 'open',
            causes: [
              cause('c_fc_coat_1', 'Air entrained in the ionomer dispersion', 8, 5, 4,
                'Vacuum-degas the dispersion for 30 min before each run.', 'mitigating', [{
                  xid: 'fx_pin01', code: 'EXP-1',
                  hypothesis: 'Vacuum degassing the ionomer dispersion removes most pinholes.',
                  toggle: 'Degassed or not degassed',
                  test: 'Coat two 10 m rolls back to back and count pinholes on the light table.',
                  samples: ['Roll 12, degassed', 'Roll 13, control'],
                  key_reads: [{ krid: 'k_pin', name: 'Pinholes', unit: 'per m²' }],
                  values: { 'Roll 12, degassed': { k_pin: '0.4' }, 'Roll 13, control': { k_pin: '2.1' } },
                  notes: '', verdict: 'confirmed',
                  conclusion: 'Degassing cut pinholes by about 80%. It is now on the run sheet.'
                }]),
              cause('c_fc_coat_2', 'Dust on the carrier film at the splice', 8, 4, 5,
                'Tack-roll the carrier film ahead of the slot die.', 'open')
            ]
          }]
        },
        {
          mid: 'm_fc_coat_2', mode: 'Thickness drifts across the web', status: 'open',
          effects: [{
            eid: 'e_fc_coat_2', effect: 'Edge conductivity falls below 95 mS/cm', status: 'open',
            causes: [cause('c_fc_coat_3', 'Slot-die shim wear', 6, 4, 3,
              'Second shim set ordered and fitted Oct 7.', 'resolved')]
          }]
        }
      ]
    }]);
  }

  /* -------------------------------------------- Business Development (Sales) */
  var BD = S.docs['BIZ-DIV-BD'];
  if (BD) {
    /* stored in an older shape: migrateProblem below fills ids, statuses and fields */
    BD.risks = (BD.risks || []).concat([{
      id: 'RISK-BD-2026Q4-01-1', objectiveId: 'OBJ-BD-2026Q4-01', gateId: 'SG-BD-2026Q4-01-2', status: 'open',
      problem: 'Utility interconnection studies run long',
      knowns: ['Teton Valley’s interconnection queue is about nine months.', 'Cascade Public Power has not scoped a study yet.'],
      modes: [
        {
          mode: 'Studies are not scoped before the term sheets expire',
          effects: [{
            effect: 'A signed pilot cannot energize in Q1',
            causes: [
              { cause: 'Utility engineering staff are booked through December', severity: 7, occurrence: 8, detection: 4,
                mitigation: 'Offer to fund a third-party study for the second and third pilots.' },
              { cause: 'The site needs a transformer upgrade', severity: 8, occurrence: 3, detection: 5,
                mitigation: 'Ask each utility for a hosting-capacity map before signing.', status: 'mitigating' }
            ]
          }]
        },
        {
          mode: 'Pilot capacity is cut to fit the feeder', status: 'open',
          effects: [{ effect: 'Signed pilot capacity falls short of 3 MW', causes: [{ cause: 'Ironwood’s feeder hosting limit is under 1 MW', severity: 6, occurrence: 4, detection: 3 }] }]
        }
      ]
    }]);
  }

  /* today's load-time clean-up: risks are reshaped by RD.migrateProblem (adoptExec) */
  Object.keys(S.docs || {}).forEach(function (k) {
    var doc = S.docs[k];
    if (doc) doc.risks = (doc.risks || []).map(RD.migrateProblem);
  });
}
