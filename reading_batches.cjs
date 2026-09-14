// Reading batches on statistical KPIs.
//
// A statistical KPI aggregates every reading posted to it — readCount is the expected sample size, not
// a window. So re-measuring meant the new numbers were diluted by the old ones and the only way to
// refresh a statistic was to delete every prior reading.
//
// A reading may now carry a `batch` id. The statistic and the n/readCount completeness are computed
// over the LATEST batch only; earlier batches stay in the document, stay listed, and stop counting.
// Readings with no batch — everything posted before this existed — are one implicit original batch, so
// a KPI that has never been re-batched behaves exactly as it always did.
const RD = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const u = (v, t, b) => { const r = { id: 'u' + t, kpiId: 'K', value: v, timestamp: t }; if (b) r.batch = b; return r; };
const docs = (ups) => ({ d: { kpiUpdates: ups } });
const KPI = { id: 'K', targetType: 'statistical', statistic: 'average', readCount: 3 };
const avg = (ups) => RD.effValue(KPI, [KPI], docs(ups));
const n = (ups) => RD.readingCount('K', docs(ups));

// ---------- legacy data is untouched ----------
(function () {
  const legacy = [u(10, 1), u(20, 2), u(30, 3)];
  ok(avg(legacy) === 20, "with no batches the statistic is every reading, as before (" + avg(legacy) + ")");
  ok(n(legacy) === 3, "…and completeness counts them all (" + n(legacy) + ")");
  ok(RD.latestBatchId(legacy) === '', "unbatched readings resolve to the implicit original batch");
  ok(RD.currentBatchReadings(legacy).length === 3, "…which is all of them");
})();

// ---------- a new batch refreshes the statistic without deleting anything ----------
(function () {
  const old3 = [u(10, 1, 'b1'), u(10, 2, 'b1'), u(10, 3, 'b1')];
  ok(avg(old3) === 10, "a first batch averages its own readings (" + avg(old3) + ")");

  const plusNew = old3.concat([u(100, 4, 'b2'), u(100, 5, 'b2')]);
  ok(avg(plusNew) === 100, "a NEW batch replaces the statistic rather than diluting it (" + avg(plusNew) + ")");
  ok(n(plusNew) === 2, "…and completeness counts only the new batch (" + n(plusNew) + ")");
  ok(plusNew.length === 5, "…while every earlier reading is still in the document");

  const batches = RD.readingBatches('K', docs(plusNew));
  ok(batches.length === 2, "both batches are reported (" + batches.length + ")");
  ok(batches[0].batch === 'b2' && batches[0].current === true, "…newest first, flagged current");
  ok(batches[1].batch === 'b1' && batches[1].current === false, "…the earlier one kept but not current");
  ok(batches[1].n === 3, "…with its readings intact (" + batches[1].n + ")");
})();

// ---------- completeness must not inherit a finished batch ----------
(function () {
  // an old COMPLETE batch of 3, then a new batch with only 1 reading: the KPI is not complete
  const mixed = [u(10, 1, 'b1'), u(10, 2, 'b1'), u(10, 3, 'b1'), u(50, 4, 'b2')];
  ok(n(mixed) === 1, "a half-measured new batch reports its own count (" + n(mixed) + ")");
  ok(n(mixed) < KPI.readCount, "…so a finished earlier batch cannot make it read as complete");
  ok(avg(mixed) === 50, "…and the statistic is the new reading alone (" + avg(mixed) + ")");
})();

// ---------- which batch is current is decided by recency, not by id ----------
(function () {
  // ids deliberately out of alphabetical order: the most RECENT reading decides
  const outOfOrder = [u(10, 1, 'zzz'), u(99, 9, 'aaa')];
  ok(RD.latestBatchId(outOfOrder) === 'aaa', "the batch of the most recent reading is current, whatever its id");
  ok(avg(outOfOrder) === 99, "…and the statistic follows it (" + avg(outOfOrder) + ")");

  // readingsFor sorts newest-first, so order in the array must not matter
  const reversed = [u(99, 9, 'aaa'), u(10, 1, 'zzz')];
  ok(avg(reversed) === avg(outOfOrder), "array order does not change the answer");
})();

// ---------- moving from unbatched to batched ----------
(function () {
  // a KPI with legacy unbatched readings, then a first real batch: the legacy ones become history
  const mixed = [u(10, 1), u(10, 2), u(88, 5, 'b1')];
  ok(avg(mixed) === 88, "starting a batch on legacy data leaves the old readings behind (" + avg(mixed) + ")");
  ok(n(mixed) === 1, "…and counts only the new one");
  const bs = RD.readingBatches('K', docs(mixed));
  ok(bs.length === 2, "the legacy readings form their own batch (" + bs.length + ")");
  ok(bs.filter(b => b.batch === '')[0].n === 2, "…holding both of them");
})();

// ---------- shape and edges ----------
(function () {
  ok(RD.currentBatchReadings([]).length === 0, "no readings yields no batch");
  ok(RD.currentBatchReadings(null).length === 0, "…and neither does nothing at all");
  ok(RD.readingBatches('K', docs([])).length === 0, "a KPI with no readings has no batches");
  ok(typeof RD.newBatchId() === 'string' && RD.newBatchId().length > 3, "a new batch id is a non-trivial string");
  ok(RD.newBatchId() !== RD.newBatchId(), "…and two are distinct");

  // a non-numeric entry must not decide the current batch
  const withJunk = [{ id: 'x', kpiId: 'K', value: 'n/a', timestamp: 99, batch: 'junk' }, u(7, 5, 'real')];
  ok(RD.latestBatchId(withJunk) === 'real', "a non-numeric row does not become the current batch");
})();

// ---------- unlinked key-read readings honour batches the same way ----------
// Unlinked readings live on the experiment, not in kpiUpdates, and have no timestamps — the array IS
// the order. They must still scope to the current batch, or the ETB's statistical key reads keep the
// old behaviour while the KR/SG ones get the new one.
(function () {
  const kr = { id: 'k', statistic: 'average', readCount: 3 };
  const ctx = (raw) => ({ experiment: { key_read_readings: { k: raw } } });
  const vals = (raw) => RD.keyReadReadings(kr, ctx(raw)).values;

  ok(vals([10, 20, 30]).join() === '10,20,30', "legacy bare numbers are one implicit batch (" + vals([10, 20, 30]).join() + ")");
  ok(vals([{ v: 10, batch: 'b1' }, { v: 10, batch: 'b1' }, { v: 99, batch: 'b2' }]).join() === '99',
    "a new batch supersedes the earlier unlinked readings (" + vals([{ v: 10, batch: 'b1' }, { v: 99, batch: 'b2' }]).join() + ")");
  ok(vals([10, 20, { v: 99, batch: 'b2' }]).join() === '99', "…including when the earlier ones were unbatched");
  ok(RD.keyReadReadings(kr, ctx([{ v: 10, batch: 'b1' }, { v: 99, batch: 'b2' }])).n === 1,
    "…and completeness counts the new batch only");

  // an imported {v,src} entry keeps working, batched or not
  const imported = [{ v: 1.4, src: { sample: 'MEA-9' } }, { v: 1.5, src: { sample: 'MEA-10' } }];
  ok(vals(imported).join() === '1.4,1.5', "imported entries with no batch are one sample");
  const rebatched = imported.concat([{ v: 9.9, src: { sample: 'MEA-11' }, batch: 'b9' }]);
  ok(vals(rebatched).join() === '9.9', "…and a re-batched import supersedes them");

  // the entry-level helpers
  ok(RD.entryBatchOf({ v: 1, batch: 'x' }) === 'x', "an entry reports its batch");
  ok(RD.entryBatchOf({ v: 1 }) === '', "…and an unbatched one reports the implicit batch");
  ok(RD.latestEntryBatch([{ v: 1, batch: 'a' }, { v: 2, batch: 'z' }]) === 'z',
    "the LAST entry decides the current batch, since there are no timestamps here");
  ok(RD.latestEntryBatch([]) === '', "…and an empty list has none");

  // reading rows carry the batch so the popover can mark history
  const rows = RD.keyReadReadingRows({ id: 'k' }, ctx([{ v: 10, batch: 'b1' }, { v: 99, batch: 'b2' }]));
  ok(rows.length === 2 && rows.every(r => 'batch' in r), "every reading row carries its batch");
  ok(rows.filter(r => r.batch === 'b2').length === 1, "…distinguishing the batches (" + rows.map(r => r.batch).join(',') + ")");
})();

// ---------- the control has to be REACHABLE, not merely present ----------
// The popover is a fixed 252px and its add row was a non-wrapping flex line holding an input, Add, and
// + New batch. The button was generated, sat outside the box, and was clipped — so every assertion that
// checked "is it in the HTML" passed while the feature was invisible in the browser. jsdom does no
// layout, so assert the RULES that make it fit.
(function () {
  const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
  const fs = require('fs');
  const d = new JSDOM(fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8'),
    { virtualConsole: new VirtualConsole() }).window.document;
  const rules = [...d.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
  const find = (pred) => rules.find(r => r.selectorText && pred(r.selectorText));

  const pop = find(t => /\.spop$/.test(t));
  const addRow = find(t => /\.sp-add$/.test(t));
  ok(!!pop && !!addRow, "the popover and its add row are styled");

  const popW = pop ? (String(pop.style.cssText).match(/width:\s*(\d+)px/) || [])[1] : null;
  ok(popW != null, "the popover has a fixed width (" + popW + "px)");
  ok(!!addRow && /flex-wrap:\s*wrap/.test(addRow.style.cssText),
    "…so the add row WRAPS — three controls cannot share one line in " + popW + "px");

  const inRule = find(t => /\.sp-add \.sp-in$/.test(t));
  ok(!!inRule && /flex:\s*1 1 100%/.test(inRule.style.cssText),
    "the reading input takes a full line, leaving the buttons room below");

  const btnRule = find(t => /\.sp-add button$/.test(t));
  ok(!!btnRule && /flex:\s*0 0 auto/.test(btnRule.style.cssText), "the buttons keep their intrinsic width");

  // and the markup still carries both controls
  const src = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8');
  ok(src.indexOf('data-sp-newbatch') > 0, "the KR/SG popover emits a + New batch control");
  ok(src.indexOf('data-etbnewbatch') > 0, "…and so does the ETB popover");
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} reading-batch assertions green`);
process.exit(fails.length ? 1 : 0);
