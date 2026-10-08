// The partial check-in discount: a statistical KPI with an expected sample size scores
//     raw x min(n, readCount) / readCount
// so a short sample cannot reach 100 — and since gateAtTarget is score === 100, a gate can no longer
// auto-pass on a fraction of its data. raw stays available for the "without discount" figure.
//
// The case that matters most is the one that was broken: an on-target statistic on a short sample. Every
// assertion below that checks a discounted score also checks the raw one, because a discount that also
// moved raw would hide the very gap the screens are meant to explain.
const C = require((process.env.RD_SRC || '.') + '/rdcore.js');
let n = 0, f = 0; const ok = (c, m) => { n++; if (!c) { f++; console.log('FAIL:', m); } };
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-9;

let ts = 1000;
const reads = (kpiId, vals, batch) => vals.map(v => ({ id: 'u' + (ts), kpiId, value: v, timestamp: ts++, ...(batch != null ? { batch } : {}) }));
const stat = (id, extra) => Object.assign({ id, hostType: 'keyResult', hostId: 'KR1', objectiveId: 'O1',
  targetType: 'statistical', statistic: 'average', readCount: 10, target: 1.85, direction: 'down', unit: 'V' }, extra || {});
const doc = (kpis, ups, more) => ({ D: Object.assign({ kpis, kpiUpdates: ups, keyResults: [], stageGates: [] }, more || {}) });
const P = (ex, id) => C.kpiScoreParts(ex.D.kpis.find(k => k.id === id), C.allKpis ? C.allKpis(ex) : ex.D.kpis, ex);

// ---- one KPI: short, complete, over-sampled ----
{
  const ex = doc([stat('V')], reads('V', [1.81, 1.83, 1.82, 1.84]));
  const p = P(ex, 'V');
  ok(near(p.raw, 100), 'an on-target average on 4 of 10 samples is worth 100 on the samples so far (raw)');
  ok(near(p.score, 40), '...and scores 40 once discounted to 4/10 (' + p.score + ')');
  ok(p.partial === true && p.n === 4 && p.expected === 10 && near(p.factor, 0.4), '...reported as a partial check-in, 4 of 10');
  ok(near(C.kpiScoreResolved(ex.D.kpis[0], ex.D.kpis, ex), 40), 'kpiScoreResolved returns the DISCOUNTED score — what every rollup consumes');
  ok(near(C.kpiScoreRaw(ex.D.kpis[0], ex.D.kpis, ex), 100), 'kpiScoreRaw returns the undiscounted one');
  ok(C.band(p.score) === 'off-track' && C.band(p.raw) === 'on-track',
    'the discount moves the band (40 off-track) while the samples themselves are on track (100) — why the label is mandatory');
}
{
  const ex = doc([stat('V')], reads('V', [1.81, 1.83, 1.82, 1.84, 1.80, 1.82, 1.83, 1.81, 1.84, 1.82]));
  const p = P(ex, 'V');
  ok(near(p.score, 100) && p.partial === false && p.n === 10, 'the full sample (10 of 10) scores 100 and is not partial');
}
{
  const ex = doc([stat('V')], reads('V', [1.81, 1.83, 1.82, 1.84, 1.80, 1.82, 1.83, 1.81, 1.84, 1.82, 1.83, 1.81]));
  const p = P(ex, 'V');
  ok(near(p.factor, 1) && near(p.score, p.raw) && p.partial === false && p.n === 12,
    'an over-sampled KPI (12 of 10) is capped at factor 1 — extra readings cannot push a score above raw');
}
{
  const ex = doc([stat('V', { target: 1.80 })], reads('V', [1.81, 1.83, 1.82, 1.84]));
  const p = P(ex, 'V');
  const raw = 100 * 1.80 / 1.825;
  ok(near(p.raw, raw) && near(p.score, raw * 0.4), 'an OFF-target statistic is discounted too: raw ' + raw.toFixed(1) + ' x 4/10');
}

// ---- what is never discounted ----
for (const [label, extra] of [['no readCount', { readCount: null }], ['readCount blank', { readCount: '' }], ['readCount 0', { readCount: 0 }]]) {
  const ex = doc([stat('V', extra)], reads('V', [1.81, 1.83]));
  const p = P(ex, 'V');
  ok(near(p.score, 100) && p.partial === false && p.expected === null,
    'a statistical KPI with ' + label + ' has no expected size, so nothing to be short of — undiscounted');
}
{
  const ex = doc([stat('V', { targetType: 'demonstration', statistic: undefined })], reads('V', [1.81]));
  const p = P(ex, 'V');
  ok(near(p.score, 100) && p.partial === false, 'a non-statistical KPI is never discounted, even carrying a stray readCount');
}
{
  const ex = doc([stat('B', { targetType: 'binary', target: null, direction: null, statistic: undefined })], reads('B', [1]));
  const p = P(ex, 'B');
  ok(near(p.score, 100) && p.partial === false, 'a binary KPI is never discounted');
}
{
  const ex = doc([stat('V')], []);
  const p = P(ex, 'V');
  ok(p.score === null && p.raw === null && p.partial === false,
    'no readings -> no score and NOT partial: unread is "no read", not a partial check-in');
}

// ---- which readings are counted ----
{
  // An older COMPLETE batch must not make a half-measured new one look done.
  const ups = reads('V', [1.81, 1.83, 1.82, 1.84, 1.80, 1.82, 1.83, 1.81, 1.84, 1.82], 'b1').concat(reads('V', [1.79, 1.80, 1.81], 'b2'));
  const p = P(doc([stat('V')], ups), 'V');
  ok(p.n === 3 && p.partial === true && near(p.factor, 0.3), 'only the CURRENT batch counts: a finished batch of 10 then a new batch of 3 is 3 of 10');
}
{
  // A borrowed sample (readsFrom) is counted where it lives.
  const src = stat('SRC', { statistic: 'average' });
  const cv = stat('CV', { statistic: 'cv', target: 2, direction: 'down', unit: '%', readsFrom: 'SRC' });
  const ex = doc([src, cv], reads('SRC', [1.81, 1.83, 1.82, 1.84]));
  const p = P(ex, 'CV');
  ok(p.n === 4 && p.partial === true && near(p.factor, 0.4), 'a KPI that borrows another KPI\'s readings counts them at the source (4 of 10)');
}
{
  // A definer scored on readings posted on its linked member: the count follows the reading that WON the
  // pool. Counting the definer's own (empty) readings would report 0 and zero the score.
  const D = stat('DEF');
  const M = stat('MEM', { hostType: 'stageGate', hostId: 'G1', linkParent: 'DEF', linkType: 'contribute', readCount: null });
  const ex = doc([D, M], reads('MEM', [1.81, 1.83, 1.82, 1.84]));
  const p = P(ex, 'DEF');
  ok(p.n === 4 && near(p.raw, 100) && near(p.score, 40),
    'a definer scored on its member\'s readings counts the MEMBER\'s 4 readings, against the definer\'s readCount of 10');
}

// ---- rollups: KR, gate, objective ----
{
  const kV = stat('V');
  const kH = stat('H', { statistic: 'median', target: 60, unit: 'mOhm.cm2' });
  const kX = stat('X', { targetType: 'demonstration', statistic: undefined, readCount: null, target: 1.0, unit: '%' });
  const ups = reads('V', [1.81, 1.83, 1.82, 1.84]).concat(reads('H', [74, 81, 79, 86])).concat(reads('X', [0.62]));
  const ex = doc([kV, kH, kX], ups, { keyResults: [{ id: 'KR1', objectiveId: 'O1', trackingType: 'kpi' }] });
  const disc = C.keyResultScore('KR1', ex), raw = C.keyResultScore('KR1', ex, true);
  ok(near(disc, (40 + 30 + 100) / 3), 'a KR averages its DISCOUNTED KPI scores: mean(40, 30, 100) = ' + (disc && disc.toFixed(1)));
  ok(near(raw, (100 + 75 + 100) / 3), '...and keyResultScore(..., true) averages the raw ones: mean(100, 75, 100) = ' + (raw && raw.toFixed(1)));
  const hs = C.keyResultSample('KR1', ex);
  ok(hs.partial === true && hs.partialCount === 2 && hs.n === 8 && hs.expected === 20, 'the KR reports 2 partial KPIs, 8 of 20 samples');
  const od = C.objectiveScore('O1', ex), or = C.objectiveScore('O1', ex, true);
  ok(near(od, disc) && near(or, raw), 'an objective inherits both figures from its KRs');
  ok(C.objectivePartialCount('O1', ex) === 1, '...and counts one partial KR');
  const pace = C.keyResultPace('KR1', { plannedStart: 0, plannedEnd: 100 }, ex, 69);
  ok(near(pace.attainment, disc) && pace.band === 'at-risk',
    'pace runs on the discounted attainment (57 at 69% elapsed -> at risk), as the screens show it');
}
{
  // percentage-tracked KR with KPIs attached: they do not score it, so it cannot be partial
  const ex = doc([stat('V')], reads('V', [1.81, 1.83]), { keyResults: [{ id: 'KR1', objectiveId: 'O1', trackingType: 'percentage', progress: 50 }] });
  ok(C.keyResultSample('KR1', ex).partial === false && C.keyResultScore('KR1', ex) === 50,
    'a percentage-tracked KR is never partial, whatever KPIs sit on it');
}
{
  // An unread statistical KPI adds to the expected total but does not make the host partial.
  const ex = doc([stat('V'), stat('W')], reads('V', [1.81, 1.83, 1.82, 1.84, 1.80, 1.82, 1.83, 1.81, 1.84, 1.82]),
    { keyResults: [{ id: 'KR1', objectiveId: 'O1' }] });
  const hs = C.keyResultSample('KR1', ex);
  ok(hs.partial === false && hs.n === 10 && hs.expected === 20, 'complete + unread: 10 of 20 samples, but not a partial check-in');
  ok(near(C.keyResultScore('KR1', ex), 50), '...and the unread KPI still counts 0 in the mean, exactly as before');
}

// ---- the gate auto-pass hole ----
{
  const g = (id, extra) => stat(id, Object.assign({ hostType: 'stageGate', hostId: 'G1' }, extra));
  const kD = g('DEC', { target: 10, unit: 'uV/h', readCount: 6 });
  const kX = g('XO', { targetType: 'demonstration', statistic: undefined, readCount: null, target: 1.0 });
  const ex = doc([kD, kX], reads('DEC', [8.1, 9.0, 8.2]).concat(reads('XO', [0.71])), { stageGates: [{ id: 'G1', objectiveId: 'O1' }] });
  ok(near(C.stageGateScore('G1', ex, true), 100), 'gate A2 on 3 of 6 cells: every target at target, so raw readiness is 100...');
  ok(near(C.stageGateScore('G1', ex), 75), '...but discounted readiness is 75');
  ok(C.gateAtTarget('G1', ex) === false, '...so the gate does NOT count as at target — it cannot auto-pass on half its data');
  ex.D.kpiUpdates = ex.D.kpiUpdates.concat(reads('DEC', [8.4, 8.8, 8.6]));
  ok(near(C.stageGateScore('G1', ex), 100) && C.gateAtTarget('G1', ex) === true, 'with all 6 in, readiness is 100 and the gate is at target');
}

console.log(f ? `\n${f}/${n} FAILED` : `\nPASS — ${n} partial check-in discount assertions green`); process.exit(f ? 1 : 0);
