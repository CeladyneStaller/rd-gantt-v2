// Analysis-portal index engine (v1 one-shot import). Pure: no DOM, no network.
// The fixture is the SAME data the sign-off mockup runs on, shaped exactly like the index bin
// { schema:2, runs:[ build_index_entry() ] }, so the contract and the engine cannot drift.
const C = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const V1 = 'V @ 1 A/cm\u00B2';   // canonical key, as the portal emits it

function INDEX() {
  return {
    schema: 2, runs: [
      // MEA-17: THREE separate jobs on one sample — the cross-run union case
      { job_id: "j-1041", sample_name: "MEA-17", script: "Polarization Curve", timestamp: "2026-07-19T14:02:00Z", bin_id: "68a3f1c1",
        Data: [{ Analysis: "polcurve", step: "", Conditions: { T_C: 80, RH_pct: 100, P_value: 150, P_unit: "kPa" }, key_values: { "OCV": 0.953, [V1]: 0.681 } }] },
      { job_id: "j-1042", sample_name: "MEA-17", script: "H2 Crossover", timestamp: "2026-07-19T15:20:00Z", bin_id: "68a3f1c2",
        Data: [{ Analysis: "crossover", step: "", Conditions: { T_C: 80, RH_pct: 100 }, key_values: { "|j_xover|": 1.42 } }] },
      { job_id: "j-1043", sample_name: "MEA-17", script: "EIS", timestamp: "2026-07-19T16:05:00Z", bin_id: "68a3f1c3",
        Data: [{ Analysis: "eis", step: "", Conditions: { T_C: 80, RH_pct: 100 }, key_values: { "HFR": 0.045 } }] },
      // MEA-16: one job, TWO units at different setpoints
      { job_id: "j-1035", sample_name: "MEA-16", script: "Polarization Curve", timestamp: "2026-07-17T11:00:00Z", bin_id: "68a3f0b7",
        Data: [
          { Analysis: "polcurve", step: "", Conditions: { T_C: 80, RH_pct: 50 }, key_values: { "OCV": 0.948, [V1]: 0.652 } },
          { Analysis: "polcurve", step: "", Conditions: { T_C: 95, RH_pct: 100 }, key_values: { "OCV": 0.941, [V1]: 0.669 } }
        ] },
      { job_id: "j-1030", sample_name: "CCM-204", script: "ECSA", timestamp: "2026-07-15T09:12:00Z", bin_id: "68a3efd4",
        Data: [{ Analysis: "ecsa", step: "", Conditions: { T_C: 30 }, key_values: { "Average ECSA": 58.4 } }] },
      { job_id: "j-1022", sample_name: "MEA-15", script: "Polarization Curve", timestamp: "2026-07-11T13:44:00Z", bin_id: "68a3ee91",
        Data: [{ Analysis: "polcurve", step: "", Conditions: { T_C: 80, RH_pct: 100 }, key_values: { "OCV": 0.950, [V1]: 0.663 } }] },
      { job_id: "j-1014", sample_name: "STK-03", script: "Polarization Curve", timestamp: "2026-07-08T10:05:00Z", bin_id: "68a3ed22",
        Data: [{ Analysis: "polcurve", step: "", Conditions: { T_C: 75, RH_pct: 100 }, key_values: { "OCV": 0.939, [V1]: 0.641 } }] },
      // older than the recent-5 window — only reachable by search
      { job_id: "j-0998", sample_name: "MEA-12", script: "Polarization Curve", timestamp: "2026-06-28T15:30:00Z", bin_id: "68a3e701",
        Data: [{ Analysis: "polcurve", step: "", Conditions: { T_C: 80, RH_pct: 100 }, key_values: { "OCV": 0.944, [V1]: 0.658 } }] },
      { job_id: "j-0990", sample_name: "CCM-198", script: "ECSA", timestamp: "2026-06-20T08:50:00Z", bin_id: "68a3e5aa",
        Data: [{ Analysis: "ecsa", step: "", Conditions: { T_C: 30 }, key_values: { "Average ECSA": 61.9 } }] }
    ]
  };
}

// ---------- validation ----------
(function () {
  const good = C.validateAnalysisIndex(INDEX());
  ok(good.ok === true && good.schema === 2, "a well-formed schema-2 index validates");
  ok(C.validateAnalysisIndex({ schema: 1, runs: [] }).ok === false, "an unsupported schema is rejected (not thrown)");
  ok(C.validateAnalysisIndex({ schema: 2 }).ok === false, "a missing runs array is rejected");
  ok(C.validateAnalysisIndex(null).ok === false, "a null index is rejected");
  ok(C.analysisIndexSamples(null).length === 0, "a bad index yields no samples rather than throwing");
})();

// ---------- sample grouping (a sample spans runs) ----------
(function () {
  const s = C.analysisIndexSamples(INDEX());
  ok(s.length === 7, "every sample with values is grouped (7 distinct names from 9 runs)");
  ok(s[0].sample === "MEA-17", "samples are ordered by most recent run first");
  ok(s[s.length - 1].sample === "CCM-198", "the oldest sample sorts last");

  const m17 = s.find(x => x.sample === "MEA-17");
  ok(!!m17 && m17.units.length === 3, "MEA-17 unions units from its THREE separate jobs");
  ok(!!m17 && m17.units.map(u => u.Analysis).sort().join(",") === "crossover,eis,polcurve", "the union spans polcurve + crossover + eis");
  ok(!!m17 && m17.units.every(u => u.job_id && u.bin_id && u.script), "each unit keeps its own run identity (job_id/bin_id/script)");
  ok(!!m17 && new Set(m17.units.map(u => u.uid)).size === 3, "unit ids are unique within a sample");
  ok(!!m17 && m17.last === "2026-07-19T16:05:00Z", "a sample's 'last' is its most recent run");

  const m16 = s.find(x => x.sample === "MEA-16");
  ok(m16.units.length === 2, "two units in ONE job stay distinct (different setpoints)");
  ok(!!m16 && m16.units.length === 2 && m16.units[0].Conditions.RH_pct === 50 && m16.units[1].Conditions.T_C === 95, "each unit keeps its own conditions — no blending");
})();

// ---------- units with nothing selectable drop out ----------
(function () {
  const idx = INDEX();
  idx.runs.push({ job_id: "j-agg", sample_name: "AGG-1", script: "Batch overlay", timestamp: "2026-07-20T00:00:00Z", bin_id: "b",
    Data: [{ Analysis: "polcurve", step: "", Conditions: {}, key_values: {} }] });
  const s = C.analysisIndexSamples(idx);
  ok(!s.some(x => x.sample === "AGG-1"), "a sample whose only unit has no promoted values is omitted");

  const idx2 = INDEX();
  idx2.runs.push({ job_id: "j-txt", sample_name: "TXT-1", script: "X", timestamp: "2026-07-20T00:00:00Z", bin_id: "b",
    Data: [{ Analysis: "eis", step: "", Conditions: {}, key_values: { "HFR": "n/a", "OCV": 0.9 } }] });
  const t = C.analysisIndexSamples(idx2).find(x => x.sample === "TXT-1");
  ok(t && Object.keys(t.units[0].key_values).join() === "OCV", "non-numeric values are not selectable; numeric siblings survive");
})();

// ---------- recent = distinct SAMPLES, not runs (F-C) ----------
(function () {
  const r = C.analysisRecentSamples(INDEX(), 5);
  ok(r.length === 5, "the default view returns 5 entries");
  ok(new Set(r.map(x => x.sample)).size === 5, "...and they are 5 DISTINCT samples, not 5 runs");
  ok(r.map(x => x.sample).join(",") === "MEA-17,MEA-16,CCM-204,MEA-15,STK-03", "recent samples are the 5 newest by run date");
  ok(!r.some(x => x.sample === "MEA-12"), "an older sample is outside the recent window");
})();

// ---------- search ----------
(function () {
  const I = INDEX();
  ok(C.analysisFiltersActive({}) === false, "an empty filter set is inactive (shows the recent list)");
  ok(C.analysisFiltersActive({ T_C: 80 }) === true, "a single condition makes the filter active");

  // name modes
  ok(C.analysisSearch(I, { name: "mea" }).length === 4, "name contains 'mea' matches 4 samples (case-insensitive)");
  ok(C.analysisSearch(I, { name: "MEA-12", nameMode: "exact" }).map(x => x.sample).join() === "MEA-12", "exact name finds a sample OUTSIDE the recent 5");
  ok(C.analysisSearch(I, { name: "CCM", nameMode: "starts" }).length === 2, "starts-with matches both CCM samples");
  ok(C.analysisSearch(I, { name: "MEA", nameMode: "exact" }).length === 0, "exact mode does not match a prefix");

  // analysis type
  const eis = C.analysisSearch(I, { analysis: "eis" });
  ok(eis.length === 1 && eis[0].sample === "MEA-17", "analysis=eis narrows to the sample that has one");
  ok(eis.length === 1 && eis[0].units.length === 1 && eis[0].units[0].Analysis === "eis", "...and returns ONLY the matching unit, not the whole sample");

  // conditions select units, and a sample matches if ANY unit does
  const t95 = C.analysisSearch(I, { T_C: 95 });
  ok(t95.length === 1 && t95[0].sample === "MEA-16", "T_C=95 finds MEA-16 via its second unit");
  ok(t95.length === 1 && t95[0].units.length === 1 && t95[0].units[0].Conditions.T_C === 95, "only the 95 °C unit comes back");
  ok(C.analysisSearch(I, { RH_pct: 50 }).map(x => x.sample).join() === "MEA-16", "RH filter selects at unit level");
  ok(C.analysisSearch(I, { T_C: 999 }).length === 0, "an unmatched condition yields no samples (never a silent all)");

  // pressure: number, and unit when supplied
  ok(C.analysisSearch(I, { P_value: 150 }).map(x => x.sample).join() === "MEA-17", "pressure value matches");
  ok(C.analysisSearch(I, { P_value: 150, P_unit: "kPa" }).length === 1, "pressure value + matching unit matches");
  ok(C.analysisSearch(I, { P_value: 150, P_unit: "psi" }).length === 0, "same number in a DIFFERENT pressure unit does not match");

  // combined
  const combo = C.analysisSearch(I, { analysis: "polcurve", name: "MEA", T_C: 80, RH_pct: 100 });
  ok(combo.map(x => x.sample).sort().join(",") === "MEA-12,MEA-15,MEA-17", "filters combine (polcurve + name + 80 °C + 100 %RH)");
})();

// ---------- flattening for the selection list ----------
(function () {
  const m17 = C.analysisIndexSamples(INDEX()).find(x => x.sample === "MEA-17");
  const vals = C.analysisSampleValues(m17);
  ok(vals.length === 4, "MEA-17 exposes 4 pickable values across its 3 units");
  const xo = vals.find(v => v.key === "|j_xover|");
  ok(xo && xo.value === 1.42 && xo.unit === "mA/cm\u00B2", "each value carries its implied unit");
  ok(!!xo && xo.job_id === "j-1042" && xo.analysis === "crossover", "...and the run it came from");
  ok(new Set(vals.map(v => v.selId)).size === 4, "selection ids are unique");
  ok(C.analysisKeyUnit("HFR") === "\u03A9\u00B7cm\u00B2" && C.analysisKeyUnit("nope") === "", "key→unit lookup, blank for unknown keys");
})();

// ---------- import materialisation ----------
(function () {
  const m17 = C.analysisIndexSamples(INDEX()).find(x => x.sample === "MEA-17");
  const vals = C.analysisSampleValues(m17);
  const picks = [
    Object.assign({ kpiId: "K-11" }, vals.find(v => v.key === V1)),
    Object.assign({ kpiId: "K-23" }, vals.find(v => v.key === "|j_xover|")),
  ];
  const r = C.buildImportUpdates(picks, [], "2026-07-21T09:40:11Z");
  ok(r.updates.length === 2, "two picks become two readings");
  ok(r.updates.every(u => u.kpiId && typeof u.value === "number"), "each is a normal kpiUpdate (kpiId + numeric value)");

  const v = r.updates[0] || {src:{}};
  ok(v.timestamp === Date.parse("2026-07-19T14:02:00Z"), "the reading is timestamped when the MEASUREMENT ran, not when it was imported");
  ok((v.src||{}).imported_t === "2026-07-21T09:40:11Z", "...and the import time is recorded separately in src");
  ok(v.note === "analysis: polcurve/" + V1, "the note names the source bucket + key");
  ok((v.src||{}).portal === "analysis" && (v.src||{}).job_id === "j-1041" && (v.src||{}).bin_id === "68a3f1c1", "provenance carries the job and its detail bin");
  ok((v.src||{}).sample === "MEA-17" && ((v.src||{}).cond||{}).T_C === 80, "provenance carries the sample and the conditions taken");
  ok(new Set(r.updates.map(u => u.id)).size === 2, "generated ids are unique");

  // re-importing the same value is caught
  const again = C.buildImportUpdates(picks, r.updates, "2026-07-22T00:00:00Z");
  ok(again.updates.length === 0 && again.duplicates.length === 2, "re-importing the same values is reported as duplicates, not appended");
  // ...but the same measurement onto a DIFFERENT KPI is legitimate
  const other = C.buildImportUpdates([Object.assign({ kpiId: "K-99" }, vals.find(v => v.key === V1))], r.updates, "2026-07-22T00:00:00Z");
  ok(other.updates.length === 1, "the same measurement may be imported onto a different KPI");

  // picks the app hasn't resolved are surfaced, not silently dropped
  const unres = C.buildImportUpdates([Object.assign({}, vals[0])], [], "2026-07-21T00:00:00Z");
  ok(unres.updates.length === 0 && unres.unresolved.length === 1, "a pick with no kpiId is reported as unresolved (KPI creation is the app's job)");
  const nonnum = C.buildImportUpdates([{ kpiId: "K-1", value: "n/a", key: "OCV" }], [], "2026-07-21T00:00:00Z");
  ok(nonnum.updates.length === 0 && nonnum.unresolved.length === 1, "a non-numeric value is never written as a reading");
  ok(C.buildImportUpdates([], [], "2026-07-21T00:00:00Z").updates.length === 0, "no picks writes nothing");
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} analysis-index engine assertions green`);
process.exit(fails.length ? 1 : 0);
