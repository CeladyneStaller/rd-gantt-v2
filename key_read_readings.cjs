// One reading list per key read, whatever its source — pure engine, no DOM.
// The drift this exists to prevent: a table cell counting readings one way (kpiUpdates) while the
// matcher counts another (the ETB store), so the row says "5 of 5" while the verdict still waits.
// Every assertion below either pins the two sources to ONE count, or pins that count to the SAME
// number the KPI table already derives via readingCount(readingSourceId(...)).
const C = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const upd = (kpiId, value, t) => ({ id: 'UPD-' + kpiId + '-' + t, kpiId, value, timestamp: t });

// ---------- unlinked: the experiment's own store ----------
(function () {
  const kr = { id: 'kr_1', name: 'H2 crossover', statistic: 'average', readCount: 5 };
  const exp = { id: 'exp_1', key_reads: [kr], key_read_readings: { kr_1: [1.1, 1.3, 1.2] } };
  const r = C.keyReadReadings(kr, { experiment: exp });
  ok(r.source === 'local', "an unlinked key read reads from the experiment, not the KPI layer");
  ok(r.n === 3 && r.values.length === 3, "the local store's reads are counted");
  ok(r.kpiId === null, "no KPI id is claimed for an unlinked key read");

  const typed = C.keyReadReadings({ id: 'kr_1' }, { experiment: { key_read_readings: { kr_1: "1.1 1.3 1.2" } } });
  ok(typed.n === 3, "a typed string of reads parses to the same count as an array");
  const junk = C.keyReadReadings({ id: 'kr_1' }, { experiment: { key_read_readings: { kr_1: "1.1 n/a 1.2" } } });
  ok(junk.n === 2, "non-numeric junk is dropped on the local path");
  ok(C.keyReadReadings({ id: 'kr_x' }, { experiment: exp }).n === 0, "a key read with no entry yields no reads");
  ok(C.keyReadReadings({ id: 'kr_1' }, {}).n === 0, "a missing experiment yields no reads rather than throwing");
})();

// ---------- linked: through the KPI's posted readings ----------
(function () {
  const kpis = [{ id: 'kpi_a', targetType: 'statistical', statistic: 'average', readCount: 5 }];
  const docs = { d1: { kpiUpdates: [upd('kpi_a', 0.66, 300), upd('kpi_a', 0.68, 100), upd('kpi_a', 0.70, 200)] } };
  const kr = { id: 'kr_2', source_kpi_gid: 'kpi_a' };
  const r = C.keyReadReadings(kr, { kpis, execDocs: docs });
  ok(r.source === 'kpi', "a linked key read reads through the KPI layer");
  ok(r.n === 3, "every posted reading is counted");
  ok(r.kpiId === 'kpi_a', "the resolved reading source id travels with the result");

  // THE anti-drift assertion: identical to what the KPI table computes for the same key read.
  ok(r.n === C.readingCount(C.readingSourceId(kpis[0], kpis), docs),
     "the accessor's count equals readingCount(readingSourceId(...)) — table and matcher cannot disagree");

  ok(r.values[r.values.length - 1] === 0.66, "readings come back oldest-first, so the last one is the newest");

  const withJunk = { d1: { kpiUpdates: [upd('kpi_a', 0.5, 10), upd('kpi_a', 'n/a', 20)] } };
  ok(C.keyReadReadings(kr, { kpis, execDocs: withJunk }).n === 1, "non-numeric readings are dropped on the KPI path too");
  ok(C.keyReadReadings(kr, { kpis, execDocs: {} }).n === 0, "a KPI with nothing posted yields no reads");
})();

// ---------- a borrowed sample is counted where it lives ----------
(function () {
  const kpis = [
    { id: 'kpi_def', targetType: 'statistical', statistic: 'average', readCount: 3 },
    { id: 'kpi_mem', readsFrom: 'kpi_def' }
  ];
  const docs = { d1: { kpiUpdates: [upd('kpi_def', 1, 10), upd('kpi_def', 2, 20)] } };
  const kr = { id: 'kr_3', source_kpi_gid: 'kpi_mem' };
  const r = C.keyReadReadings(kr, { kpis, execDocs: docs });
  ok(r.kpiId === 'kpi_def', "readsFrom is followed to the KPI that actually holds the sample");
  ok(r.n === 2, "a borrowed sample is counted where it lives, not reported as empty");
  ok(r.n === C.readingCount(C.readingSourceId(kpis[1], kpis), docs),
     "the borrowed count also matches what the KPI table derives");
})();

// ---------- a broken link still surfaces its readings ----------
(function () {
  const docs = { d1: { kpiUpdates: [upd('kpi_gone', 4, 10)] } };
  const r = C.keyReadReadings({ id: 'kr_4', source_kpi_gid: 'kpi_gone' }, { kpis: [], execDocs: docs });
  ok(r.n === 1, "readings posted under a since-deleted KPI are still found, not silently lost");
})();

// ---------- one completeness rule over both sources ----------
(function () {
  const stat = { statistic: 'average', readCount: 5 };
  const local = { id: 'kr_5', statistic: 'average', readCount: 5 };
  const linked = { id: 'kr_6', source_kpi_gid: 'kpi_b' };
  const kpis = [{ id: 'kpi_b', targetType: 'statistical', statistic: 'average', readCount: 5 }];
  const docs = { d1: { kpiUpdates: [upd('kpi_b', 1, 10), upd('kpi_b', 2, 20), upd('kpi_b', 3, 30)] } };
  const exp = { key_read_readings: { kr_5: [1, 2, 3] } };

  const a = C.keyReadReadings(local, { experiment: exp });
  const b = C.keyReadReadings(linked, { kpis, execDocs: docs });
  ok(a.n === b.n, "three reads is three reads regardless of where they are stored");

  const ca = C.readsComplete(a.n, stat.readCount), cb = C.readsComplete(b.n, stat.readCount);
  ok(ca.complete === false && cb.complete === false, "both sources are short of the expected sample");
  ok(ca.have === cb.have && ca.expected === cb.expected && ca.short === cb.short,
     "readsComplete reports identically for a local and a linked key read at the same n");

  const full = { d1: { kpiUpdates: [1, 2, 3, 4, 5].map((v, i) => upd('kpi_b', v, i * 10)) } };
  ok(C.readsComplete(C.keyReadReadings(linked, { kpis, execDocs: full }).n, 5).complete === true,
     "a linked key read completes once the expected sample is posted");
  ok(C.readsComplete(C.keyReadReadings({ id: 'kr_5' }, { experiment: { key_read_readings: { kr_5: [1, 2, 3, 4, 5] } } }).n, 5).complete === true,
     "an unlinked key read completes at the same n");

  // the statistic itself must also agree across sources
  const sa = C.statSummary(a.values, 'average'), sb = C.statSummary(b.values, 'average');
  ok(sa.n === sb.n && sa.value === sb.value, "the computed statistic is identical across the two sources");
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} key-read reading-source assertions green`);
process.exit(fails.length ? 1 : 0);
