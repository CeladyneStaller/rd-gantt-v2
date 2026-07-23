// Statistical key reads (ETB) — pure engine. A key read may be a STATISTIC over several reads.
// Two invariants under test: (1) the statistic has ONE source of truth — a linked statistical KPI
// beats a key read's own config; (2) an entry materialises as RAW readings, never a pre-computed
// statistic, because the KPI layer reduces readings itself (writing a mean would double-reduce).
const C = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const near = (a, b, eps) => a != null && Math.abs(a - b) < (eps == null ? 1e-9 : eps);

// ---------- parsing ----------
(function () {
  ok(C.parseReads("0.68 0.67 0.69").length === 3, "space-separated reads parse");
  ok(C.parseReads("0.68, 0.67; 0.69").length === 3, "commas and semicolons also separate");
  ok(C.parseReads([0.68, 0.67]).length === 2, "an array of numbers is accepted as-is");
  ok(C.parseReads("0.68 n/a 0.69").length === 2, "non-numeric junk is dropped, numbers survive");
  ok(C.parseReads("").length === 0 && C.parseReads(null).length === 0, "empty and null yield no reads");
  ok(C.parseReads("  0.68  ").join() === "0.68", "surrounding whitespace is ignored");
})();

// ---------- summary ----------
(function () {
  const s = C.statSummary("0.66 0.68 0.70", "average");
  ok(s.n === 3, "n counts the reads");
  ok(near(s.value, 0.68), "average is computed over the reads");
  ok(near(s.min, 0.66) && near(s.max, 0.70), "min and max travel with the summary");
  ok(s.sd != null && s.sd > 0, "sd travels alongside so spread is visible without a second call");
  ok(s.values.length === 3, "the raw values are kept on the summary");

  ok(near(C.statSummary("1 2 3 4 100", "median").value, 3), "median is honoured, not silently averaged");
  ok(near(C.statSummary("1 2 3", "max").value, 3), "max is honoured");
  ok(near(C.statSummary("5 5 5", "stddev").value, 0), "stddev of identical reads is 0");

  const one = C.statSummary("0.68", "average");
  ok(one.n === 1 && near(one.value, 0.68) && one.sd === 0, "a single read is a valid summary with sd 0");

  const none = C.statSummary("", "average");
  ok(none.n === 0 && none.value === null, "no reads gives a NULL value, never 0 (0 would read as a result)");
  ok(none.sd === null && none.min === null, "…and null dispersion rather than fabricated zeros");

  ok(near(C.statSummary("1 2 3", "nonsense").value, 2), "an unknown statistic falls back to average (computeStat's contract)");
})();

// ---------- single source of truth ----------
(function () {
  const kr = { id: "kr1", name: "OCV", statistic: "median", readCount: 3 };
  const kpi = { id: "K1", targetType: "statistical", statistic: "average", readCount: 5 };

  const linked = C.keyReadStat(kr, kpi);
  ok(linked.statistical === true, "a key read linked to a statistical KPI is statistical");
  ok(linked.statistic === "average" && linked.readCount === 5, "the LINKED KPI wins over the key read's own config");
  ok(linked.source === "kpi", "…and the source is reported as the KPI");
  ok(linked.overriddenLocal === true, "the ignored local config is surfaced, not silently dropped");

  const unlinked = C.keyReadStat(kr, null);
  ok(unlinked.statistical === true && unlinked.statistic === "median" && unlinked.readCount === 3, "an UNLINKED key read uses its own config");
  ok(unlinked.source === "local", "…reported as local");

  const plain = C.keyReadStat({ id: "kr2", name: "Pass?" }, null);
  ok(plain.statistical === false && plain.source === "none", "a key read with no statistic and no link stays single-valued");

  const nonStatKpi = C.keyReadStat({ id: "kr3" }, { id: "K2", targetType: "demonstration", statistic: "average" });
  ok(nonStatKpi.statistical === false, "linking to a NON-statistical KPI does not make a key read statistical");

  const blankCount = C.keyReadStat({}, { targetType: "statistical", statistic: "average", readCount: "" });
  ok(blankCount.readCount === null, "a blank expected count reads as null, not 0");
})();

// ---------- entry completeness (distinct from the KPI's pooled n) ----------
(function () {
  const c = C.readsComplete(4, 5);
  ok(c.complete === false && c.short === 1, "4 of 5 is incomplete and reports how many are missing");
  ok(C.readsComplete(5, 5).complete === true, "5 of 5 is complete");
  const over = C.readsComplete(7, 5);
  ok(over.complete === true && over.over === 2, "more reads than expected is complete, and the excess is reported");
  ok(C.readsComplete(3, null).complete === true, "with no expected count, any reads count as complete");
  ok(C.readsComplete(0, null).complete === false, "…but zero reads never counts as complete");
  ok(C.readsComplete(0, 5).short === 5, "an empty entry is short by the whole expected count");
})();

// ---------- what a criterion tests ----------
(function () {
  const s = C.statSummary("0.66 0.68 0.70", "average");
  ok(near(C.keyReadTestValue(s, "statistic", "up"), 0.68), "by default a criterion tests the STATISTIC");
  ok(near(C.keyReadTestValue(s, null, "up"), 0.68), "…and that is the default when no mode is given");
  ok(near(C.keyReadTestValue(s, "all", "up"), 0.66), "'all reads must pass' tests the WORST read (min when higher is better)");
  ok(near(C.keyReadTestValue(s, "all", "down"), 0.70), "…and the max when LOWER is better");
  ok(near(C.keyReadTestValue(s, "any", "up"), 0.70), "'any read may pass' tests the best read");
  ok(C.keyReadTestValue(C.statSummary("", "average"), "statistic", "up") === null, "no reads gives no test value");
})();

// ---------- materialisation: RAW readings, never a reduced value ----------
(function () {
  const rows = C.buildStatReadings("K1", "0.66 0.68 0.70", { timestamp: 1000, note: "exp EXP-4" });
  ok(rows.length === 3, "an entry of 3 reads writes THREE reading rows, not one");
  ok(rows.every(r => r.kpiId === "K1"), "all rows target the key read's KPI");
  ok(rows.map(r => r.value).join() === "0.66,0.68,0.7", "the RAW reads are written — no pre-computed statistic");
  ok(!rows.some(r => near(r.value, 0.68) && rows.length === 1), "a mean is never substituted for the reads (double-reduction guard)");
  ok(new Set(rows.map(r => r.id)).size === 3, "row ids are unique within one entry");
  ok(rows.every(r => r.note === "exp EXP-4"), "each row carries the entry's provenance note");

  // the KPI layer reducing those rows must reproduce the summary — the round trip that matters
  const back = C.statSummary(rows.map(r => r.value), "average");
  ok(near(back.value, C.statSummary("0.66 0.68 0.70", "average").value), "reducing the written rows reproduces the entry's statistic");

  ok(C.buildStatReadings("K1", "", {}).length === 0, "an empty entry writes nothing");
  const src = C.buildStatReadings("K1", "1 2", { timestamp: 5, src: { origin: "etb", expId: "E1" } });
  ok(src.every(r => r.src && r.src.expId === "E1"), "a structured src marker is carried onto every row when supplied");
})();

// ---------- reading a recorded key_read_value in either shape (migration safety) ----------
(function () {
  ok(C.keyReadValueList([0.66, 0.68, 0.70]).length === 3, "an array of raw reads reads back as 3 values");
  ok(C.keyReadValueList(0.68).length === 1, "a legacy SCALAR reads back as one value (old trees stay valid)");
  ok(C.keyReadValueList(0.68)[0] === 0.68, "…with the value preserved");
  ok(C.keyReadValueList(null).length === 0 && C.keyReadValueList(undefined).length === 0, "null/undefined read as no values");
  ok(C.keyReadValueList("n/a").length === 0, "a non-numeric scalar reads as no values, not NaN");
  ok(C.keyReadValueList(["0.7", 0.8, "x"]).length === 2, "numeric strings survive, junk is dropped");
  ok(C.keyReadValueList([]).length === 0, "an empty array reads as no values");
  // a legacy scalar and a 1-read array are indistinguishable downstream — the point of the normaliser
  const a = C.statSummary(C.keyReadValueList(0.68), "average");
  const b = C.statSummary(C.keyReadValueList([0.68]), "average");
  ok(a.n === b.n && a.value === b.value, "a legacy scalar and a one-element array summarise identically (n = 1)");
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} statistical key-read engine assertions green`);
process.exit(fails.length ? 1 : 0);
