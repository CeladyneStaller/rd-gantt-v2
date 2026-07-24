// Connected-state reconstruction — pure engine, no DOM. The "Currently connected" section and the
// per-key-read sample chip are derived from the READINGS, never a stored selection: a linked read is a
// kpiUpdate carrying src; an unlinked read is a {v, src} entry on the experiment. This proves the
// migration-safe reading shape and the index join that groups readings by sample and flags orphans.
const C = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const src = (o) => Object.assign({ portal: 'analysis' }, o);
const idx = {
  schema: 2, runs: [
    { job_id: 'j-900', sample_name: 'MEA-9', script: 'P', timestamp: '2026-07-19T10:00:00Z', bin_id: 'b',
      Data: [{ Analysis: 'polcurve', step: '', Conditions: { T_C: 80 }, key_values: { OCV: 0.671 } }] },
    { job_id: 'j-901', sample_name: 'MEA-9', script: 'X', timestamp: '2026-07-19T11:00:00Z', bin_id: 'b',
      Data: [{ Analysis: 'crossover', step: '', Conditions: { T_C: 80 }, key_values: { Crossover: 1.44 } }] },
    { job_id: 'j-912', sample_name: 'MEA-10', script: 'P', timestamp: '2026-07-20T10:00:00Z', bin_id: 'b',
      Data: [{ Analysis: 'polcurve', step: '', Conditions: { T_C: 80 }, key_values: { OCV: 0.681 } }] }
  ]
};

// ---------- migration-safe reading shape ----------
(function () {
  ok(C.readingValues([1.1, 1.2, 1.3]).join() === '1.1,1.2,1.3', "a legacy bare-number array still yields its values");
  ok(C.readingValues([{ v: 1.1, src: {} }, { v: 1.2 }]).join() === '1.1,1.2', "the new {v,src} array yields the same values");
  ok(C.readingValues([{ v: 1.1 }, 2.2, { v: 3.3, src: {} }]).join() === '1.1,2.2,3.3', "a MIXED array (mid-migration) reads cleanly");
  ok(C.readingValues('0.68 0.67').length === 2, "a legacy string of reads still parses");
  ok(C.readingValues(null).length === 0, "absent readings yield nothing, not a throw");

  const e = C.readingEntries([{ v: 1.1, src: { job_id: 'j1' } }, 2.2]);
  ok(e.length === 2, "readingEntries returns an entry per reading across both shapes (" + e.length + ")");
  ok(e[0] && e[0].v === 1.1 && e[0].src && e[0].src.job_id === 'j1', "…keeping per-reading src on an imported entry");
  ok(e[1] && e[1].v === 2.2 && e[1].src === null, "…and reporting a bare (hand-entered) reading as src-less");
  ok(C.keyReadReadings({ id: 'k' }, { experiment: { key_read_readings: { k: [{ v: 5, src: {} }, { v: 6 }] } } }).n === 2,
    "keyReadReadings counts the new shape");
})();

// ---------- linked reads reconstruct, grouped by sample ----------
(function () {
  const kpis = [{ id: 'K', targetType: 'statistical', statistic: 'average', readCount: 5 }];
  const docs = { d: { kpiUpdates: [
    { id: 'u1', kpiId: 'K', value: 0.671, timestamp: 1, src: src({ job_id: 'j-900', bucket: 'polcurve', key: 'OCV', cond: { T_C: 80 }, sample: 'MEA-9' }) },
    { id: 'u2', kpiId: 'K', value: 0.681, timestamp: 2, src: src({ job_id: 'j-912', bucket: 'polcurve', key: 'OCV', cond: { T_C: 80 }, sample: 'MEA-10' }) }
  ] } };
  const r = C.reconstructConnected([{ id: 'kr_ocv', source_kpi_gid: 'K' }], { index: idx, kpis, execDocs: docs });
  ok(r.samples.length === 2, "one key read with reads from two samples produces TWO connected groups");
  const names = r.samples.map(s => s.sample).sort().join();
  ok(names === 'MEA-10,MEA-9', "…named by the samples the readings came from (" + names + ")");
  ok(r.samples.every(s => s.readings.length === 1 && s.readings[0].matched), "every reading joined a live index unit");
  ok((r.byKeyRead.kr_ocv || []).sort().join() === 'MEA-10,MEA-9', "byKeyRead reports BOTH samples for the chip-plural case");
  ok(r.orphans.length === 0, "nothing orphaned when every source is present");
  const g9 = r.samples.find(s => s.sample === 'MEA-9');
  ok(g9 && g9.readings[0].value === 0.671, "the MEA-9 reading carries its own value");
  ok(g9 && g9.readings[0].target === 'kr_ocv', "…and its target key read");
})();

// ---------- unlinked reads reconstruct identically (parity, what A buys) ----------
(function () {
  const exp = { key_read_readings: { kr_xo: [
    { v: 1.44, src: src({ job_id: 'j-901', bucket: 'crossover', key: 'Crossover', cond: { T_C: 80 }, sample: 'MEA-9' }) }
  ] } };
  const r = C.reconstructConnected([{ id: 'kr_xo' }], { index: idx, kpis: [], execDocs: {}, experiment: exp });
  ok(r.samples.length === 1 && r.samples[0] && r.samples[0].sample === 'MEA-9', "an UNLINKED reading reconstructs into its sample group");
  const u0 = r.samples[0] && r.samples[0].readings[0];
  ok(u0 && u0.matched && u0.value === 1.44, "…joined to the index with its value");
  ok((r.byKeyRead.kr_xo || []).join() === 'MEA-9', "…and appears in byKeyRead for the chip");

  // hand-entered (src-less) unlinked reads are NOT connected — they have no analysis origin
  const exp2 = { key_read_readings: { kr_h: [1.0, 2.0] } };
  const r2 = C.reconstructConnected([{ id: 'kr_h' }], { index: idx, kpis: [], execDocs: {}, experiment: exp2 });
  ok(r2.samples.length === 0 && r2.orphans.length === 0, "hand-entered readings are not shown as connected");
})();

// ---------- linked + unlinked together, one connected view ----------
(function () {
  const kpis = [{ id: 'K', targetType: 'statistical', statistic: 'average', readCount: 5 }];
  const docs = { d: { kpiUpdates: [
    { id: 'u1', kpiId: 'K', value: 0.671, timestamp: 1, src: src({ job_id: 'j-900', bucket: 'polcurve', key: 'OCV', cond: { T_C: 80 }, sample: 'MEA-9' }) }
  ] } };
  const exp = { key_read_readings: { kr_xo: [
    { v: 1.44, src: src({ job_id: 'j-901', bucket: 'crossover', key: 'Crossover', cond: { T_C: 80 }, sample: 'MEA-9' }) }
  ] } };
  const r = C.reconstructConnected([{ id: 'kr_ocv', source_kpi_gid: 'K' }, { id: 'kr_xo' }], { index: idx, kpis, execDocs: docs, experiment: exp });
  ok(r.samples.length === 1 && r.samples[0] && r.samples[0].sample === 'MEA-9', "a linked and an unlinked read on the same sample land in ONE group");
  ok(r.samples[0] && r.samples[0].readings.length === 2, "…with both readings present");
  const keys = (r.samples[0] ? r.samples[0].readings : []).map(x => x.key).sort().join();
  ok(keys === 'Crossover,OCV', "…the KPI-linked OCV beside the unlinked Crossover, no forked handling (" + keys + ")");
})();

// ---------- orphans: source removed from the index ----------
(function () {
  const exp = { key_read_readings: { kr_xo: [
    { v: 9.9, src: src({ job_id: 'j-GONE', bucket: 'eis', key: 'HFR', cond: { T_C: 80 }, sample: 'MEA-11' }) }
  ] } };
  const r = C.reconstructConnected([{ id: 'kr_xo' }], { index: idx, kpis: [], execDocs: {}, experiment: exp });
  ok(r.samples.length === 0, "a reading whose source is gone is not placed in a matched group");
  ok(r.orphans.length === 1, "…it becomes an orphan");
  ok(r.orphans[0] && r.orphans[0].matched === false, "…flagged unmatched");
  ok(r.orphans[0] && r.orphans[0].value === 9.9 && r.orphans[0].sample === 'MEA-11', "…still carrying its value and (from stored src) its sample");
  ok((r.byKeyRead.kr_xo || []).join() === 'MEA-11', "an orphaned reading still counts toward the key read's chip");
})();

// ---------- the join key is exact on job+analysis+key ----------
(function () {
  const a = C.connSrcKey({ job_id: 'j1', bucket: 'polcurve', key: 'OCV', cond: { T_C: 80 } });
  const b = C.connSrcKey({ job_id: 'j1', analysis: 'polcurve', key: 'OCV', Conditions: { T_C: 80 } });
  ok(a === b, "connSrcKey normalises bucket/analysis and cond/Conditions to the same key");
  ok(a !== C.connSrcKey({ job_id: 'j2', bucket: 'polcurve', key: 'OCV', cond: { T_C: 80 } }), "a different job is a different reading");
  ok(a !== C.connSrcKey({ job_id: 'j1', bucket: 'polcurve', key: 'HFR', cond: { T_C: 80 } }), "a different key is a different reading");
})();

// ---------- per-reading rows for the ETB statistical popover ----------
(function () {
  // linked: two kpiUpdates, one imported (has src), one hand-posted (no src)
  const kpis = [{ id: 'K', targetType: 'statistical', statistic: 'average', readCount: 5 }];
  const docs = { d: { kpiUpdates: [
    { id: 'u1', kpiId: 'K', value: 0.671, timestamp: 100, src: src({ job_id: 'j-900', bucket: 'polcurve', key: 'OCV', cond: { T_C: 80 }, sample: 'MEA-9' }) },
    { id: 'u2', kpiId: 'K', value: 0.680, timestamp: 200 }
  ] } };
  // readingsFor returns whatever order; the rows lister must sort. u1 is OLDER but listed first in the
  // fixture, so a dropped sort would leave u1 at index 0 and fail the newest-first check.
  const rows = C.keyReadReadingRows({ id: 'kr_ocv', source_kpi_gid: 'K' }, { kpis, execDocs: docs });
  ok(rows.length === 2, "a linked key read lists every kpiUpdate as a row (" + rows.length + ")");
  ok(rows[0].value === 0.680 && rows[1].value === 0.671, "…newest first");
  ok(rows[1].imported === true && rows[1].sample === 'MEA-9' && rows[1].kind === 'linked', "an imported linked reading is tagged with its sample");
  ok(rows[0].imported === false && rows[0].sample === '', "a hand-posted linked reading has no sample tag");
  ok(rows[1].upId === 'u1' && rows[0].upId === 'u2', "each linked row carries its kpiUpdate id for deletion");

  // unlinked: one imported {v,src}, one hand-entered bare number
  const exp = { key_read_readings: { kr_xo: [
    { v: 1.44, src: src({ job_id: 'j-901', bucket: 'crossover', key: 'Crossover', cond: { T_C: 80 }, sample: 'MEA-9', imported_t: '2026-07-20T00:00:00Z' }) },
    2.2
  ] } };
  const rows2 = C.keyReadReadingRows({ id: 'kr_xo' }, { experiment: exp });
  ok(rows2.length === 2, "an unlinked key read lists {v,src} and bare entries as rows (" + rows2.length + ")");
  const imp = rows2.filter(r => r.imported)[0], hand = rows2.filter(r => !r.imported)[0];
  ok(imp && imp.value === 1.44 && imp.sample === 'MEA-9' && imp.srcKey, "the imported unlinked reading carries a src key for deletion");
  ok(imp && imp.kind === 'unlinked', "…flagged unlinked");
  ok(hand && hand.value === 2.2 && hand.imported === false && typeof hand.localIdx === 'number', "the hand-entered reading carries its index for deletion");
  ok(hand && !hand.srcKey, "…and has no src key");

  // the sort is newest-first by timestamp, tested where array order != time order: an unlinked list
  // with an older imported_t placed BEFORE a newer one must come back newest-first.
  const expOrd = { key_read_readings: { kr_o: [
    { v: 1.0, src: src({ job_id: 'jA', bucket: 'polcurve', key: 'OCV', cond: {}, sample: 'S1', imported_t: '2026-07-01T00:00:00Z' }) },
    { v: 2.0, src: src({ job_id: 'jB', bucket: 'polcurve', key: 'OCV', cond: {}, sample: 'S2', imported_t: '2026-07-09T00:00:00Z' }) }
  ] } };
  const ord = C.keyReadReadingRows({ id: 'kr_o' }, { experiment: expOrd });
  ok(ord.length === 2 && ord[0].value === 2.0 && ord[1].value === 1.0, "rows come back newest-first even when stored oldest-first (" + ord.map(r => r.value).join(',') + ")");

  ok(C.keyReadReadingRows({ id: 'none' }, { experiment: { key_read_readings: {} } }).length === 0, "a key read with no readings lists nothing");
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} connected-reconstruction assertions green`);
process.exit(fails.length ? 1 : 0);
