/* Scenario test for the KPI module (X-kpi): KPI tables, readings and batches, provenance,
   targets, linking, Connect data, latest readings, search, read-only, Sales differences.
     node test/sc_kpi.js out/xkpi/Main.dc.html
     node test/sc_kpi.js out/xkpi/Sales-A.dc.html
   Numbers are checked against the live engine (rdcore.js, loaded separately). */
const path = require('path');
const { Sim, done } = require('./dc');
const RD = require(require('./engine_path'));

const file = process.argv[2] || 'out/xkpi/Main.dc.html';
const SALES = /Sales/.test(file);

/* ---------------------------------------------------------------- helpers */
const doc = (s) => s.c.D.docs[s.c.ctx.docKey];
const emOf = (s) => RD.withPortfolio(s.c.D.portfolio, { [s.c.ctx.divId]: doc(s) });
const api = (s) => s.c.MODS.kpi.api;
const pool = (s) => api(s).pool(s.c, s.c.ctx);
const kpi = (s, id) => doc(s).kpis.find((k) => k.id === id);
const readsOf = (s, id) => (doc(s).kpiUpdates || []).filter((u) => u.kpiId === id);
const round = (x) => (x == null ? '—' : String(Math.round(x)));
/* the value buttons are named "Post a reading for <KPI>" / "Readings for <KPI>" ("Add readings for <KPI>" before a statistical KPI has a value) */
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const POST = (name) => new RegExp('post a reading for ' + rx(name) + '$', 'i');
const READS = (name) => new RegExp('(^|: |add )readings for ' + rx(name) + '$', 'i');
/* inside the open sheet when there is one: the Overview's review table behind the Readings sheet has the same
   value buttons since October 19 (mods/review) */
const IN = (sim) => (sim.c.sheet() ? { within: 'Editor' } : undefined);
/* the visible table row (view model) of a KPI inside the open Readings sheet */
function row(s, kpiId) {
  const all = s.vals.kpi.all;
  if (!all) return null;
  for (const g of all.groups) for (const h of g.hosts) { const r = h.kt.rows.find((x) => x.id === kpiId); if (r) return r; }
  return null;
}
function tableOf(s, type, id) {
  const all = s.vals.kpi.all;
  if (!all) return null;
  for (const g of all.groups) for (const h of g.hosts) if (h.dk === 'kpi-host:' + type + ':' + id) return h.kt;
  return null;
}
/* the shell sidebar's score for an objective */
function sideScore(s, objId) {
  const o = s.c.D.portfolio.objectives.find((x) => x.id === objId);
  for (const g of s.vals.sh.objGroups) for (const x of g.objs) if (x.name === o.statement) return x.right;
  return null;
}
function openReadings(s) {
  if (s.vals.kpi.all) return;
  if (s.c.state.tab !== 'overview') s.click('Overview');
  s.click(s.c.state.ro ? 'View readings' : 'Record readings');
}
function closeSheets(s) { s.c.closeAllSheets(); s.render(); }
function setRo(s, on) {
  s.click('Settings');
  s.check('Preview the read-only view', on);
  s.click('Close');
}

if (!SALES) {
/* ========================================================= Execution */
const s = new Sim(file);
const OBJ = 'OBJ-EL-2026Q4-01';
const KR1 = 'KR-EL-2026Q4-01-1', KR3 = 'KR-EL-2026Q4-01-3';
const CV = 'KPI-EL-2026Q4-01-1-1', HFR = 'KPI-EL-2026Q4-01-1-2', XO = 'KPI-EL-2026Q4-01-3-1';
const SGA2 = 'SG-EL-2026Q4-01-2', DEC = 'KPI-EL-2026Q4-01-5-1';
s.clean('initial');

s.step('Latest readings on the Overview', () => {
  s.expect('Latest readings');
  const L = s.vals.kpi.latest;
  s.eq('latest rows', L.rows.length, 5);
  s.eq('newest reading', [L.rows[0].name, L.rows[0].val, L.rows[0].meta, L.rows[0].progress], ['Cell voltage at 2 A/cm²', '1.84 V', 'Toru, 2 hours ago', '4 of 10 samples in']);
  s.expect('Toru, 2 hours ago');
  s.expect('4 of 10 samples in');
  s.eq('latest count text', L.count, '5 of 16');
});

s.step('A latest reading opens the Readings sheet at its KPI', () => {
  s.click('Show Cell voltage at 2 A/cm² in the readings panel');
  s.eq('readings sheet', s.c.sheet().kind, 'kpi.all');
  s.ok(row(s, CV).hl, 'the KPI is highlighted');
  s.click('Done');
  s.eq('closed', s.c.state.sheets.length, 0);
});

s.step('Readings sheet shows every KPI table with engine numbers', () => {
  s.click('Record readings');
  s.expect('Readings');
  s.clean('readings sheet');
  const P = pool(s), em = emOf(s);
  [CV, HFR, XO, DEC].forEach((id) => {
    const k = P.find((x) => x.id === id);
    const pp = RD.kpiScoreParts(k, P, em);
    s.eq('score of ' + id, row(s, id).score, round(pp.score));
  });
  const cv = row(s, CV);
  s.eq('CV current', cv.cur, '1.825 V');
  s.eq('CV target', cv.crit, '≤ 1.85 V');
  s.eq('CV sample line', cv.sub, 'Average, 4 of 10 samples');
  s.eq('CV partial math', cv.math, '100 × 4/10 samples');
  s.eq('CV status', cv.stWord, 'On track');
  s.ok(cv.partial, 'CV is a partial check-in');
  const xo = row(s, XO);
  s.eq('linked KPI badge', xo.badges.map((b) => b.label), ['Linked']);
  s.eq('override tag', xo.critTag, 'Override');
  s.expect('Partial');
  /* gate numbering follows the gate tab: SG-A1, SG-A2 … */
  s.expect('SG-A2');
  /* the value buttons keep the names other modules' tests click */
  s.ok(s.has('Post a reading for H₂ in O₂', IN(s)) && s.has('Readings for Cell voltage at 2 A/cm²', IN(s)), 'value button names');
});

s.step('Post a single reading inline; KR and objective scores follow the engine', () => {
  const before = readsOf(s, XO).length;
  s.click(POST('H₂ in O₂'), IN(s));
  s.eq('editor prefilled', s.vals.kpi.all && row(s, XO).ed.v, '0.62');
  s.type('New value for H₂ in O₂', '1.25');
  s.key('New value for H₂ in O₂', 'Enter');
  s.expect('Reading posted.');
  const rs = readsOf(s, XO);
  s.eq('one reading added', rs.length, before + 1);
  const r = rs[rs.length - 1];
  s.eq('reading fields', [r.value, r.note, r.by, typeof r.timestamp, /^UPD-KPI-EL-2026Q4-01-3-1-\d+/.test(r.id)], [1.25, '', 'corey@celadyne.com', 'number', true]);
  s.ok(r.timestamp >= s.c.D.nowMs, 'timestamp is now');
  const em = emOf(s);
  s.eq('KR3 score', RD.keyResultScore(KR3, em), 80);
  s.eq('row score', row(s, XO).score, '80');
  s.eq('row status (80 is on track)', row(s, XO).stWord, 'On track');
  s.eq('sidebar objective score', sideScore(s, OBJ), round(RD.objectiveScore(OBJ, em)));
  s.clean('after posting');
});

s.step('Invalid and unchanged values post nothing', () => {
  const n0 = readsOf(s, XO).length;
  s.click(POST('H₂ in O₂'), IN(s));
  s.type('New value for H₂ in O₂', 'abc');
  s.key('New value for H₂ in O₂', 'Enter');
  s.expect('Use a number, like 1.85.');
  s.key('New value for H₂ in O₂', 'Escape');
  s.expectNot('Use a number, like 1.85.');
  s.ok(!s.has('New value for H₂ in O₂'), 'Escape closes the editor');
  s.click(POST('H₂ in O₂'), IN(s));
  s.type('New value for H₂ in O₂', '1.25');
  s.key('New value for H₂ in O₂', 'Enter');
  s.eq('unchanged value is not posted', readsOf(s, XO).length, n0);
  /* leaving the field commits a changed value (blur), like today */
  s.click(POST('H₂ in O₂'), IN(s));
  s.type('New value for H₂ in O₂', '0.9');
  s.fire(s.find('New value for H₂ in O₂', { handler: 'onBlur' }), 'onBlur');
  s.eq('blur posts', readsOf(s, XO).length, n0 + 1);
  s.eq('blur value', readsOf(s, XO).slice(-1)[0].value, 0.9);
});

s.step('Blank clears the KPI’s own readings (confirm when more than one)', () => {
  const n = readsOf(s, XO).length;
  s.ok(n > 1, 'several own readings');
  s.click(POST('H₂ in O₂'), IN(s));
  s.eq('placeholder says blank clears', row(s, XO).ed.ph, 'Blank clears');
  s.type('New value for H₂ in O₂', '');
  /* blur with a blank field cancels: only an explicit Enter clears */
  s.fire(s.find('New value for H₂ in O₂', { handler: 'onBlur' }), 'onBlur');
  s.eq('blur does not clear', readsOf(s, XO).length, n);
  s.click(POST('H₂ in O₂'), IN(s));
  s.type('New value for H₂ in O₂', '');
  s.key('New value for H₂ in O₂', 'Enter');
  s.expect('Clear ' + n + ' readings?');
  s.click('Cancel');
  s.eq('cancel keeps readings', readsOf(s, XO).length, n);
  s.click(POST('H₂ in O₂'), IN(s));
  s.type('New value for H₂ in O₂', '');
  s.key('New value for H₂ in O₂', 'Enter');
  s.click('Clear readings');
  s.eq('all own readings cleared', readsOf(s, XO).length, 0);
  s.expect('Cleared ' + n + ' readings.');
  s.eq('no reading now', row(s, XO).cur, 'No reading');
  s.eq('KR3 unscored', RD.keyResultScore(KR3, emOf(s)), null);
  /* a single reading clears without asking */
  s.click(POST('H₂ in O₂'), IN(s));
  s.type('New value for H₂ in O₂', '0.5');
  s.key('New value for H₂ in O₂', 'Enter');
  s.click(POST('H₂ in O₂'), IN(s));
  s.type('New value for H₂ in O₂', '');
  s.key('New value for H₂ in O₂', 'Enter');
  s.eq('single reading cleared at once', readsOf(s, XO).length, 0);
  s.expect('Cleared 1 reading.');
});

s.step('Statistical readings drawer: sample, partial block, add, remove, new batch', () => {
  s.click(READS('Cell voltage at 2 A/cm²'), IN(s));
  const d = row(s, CV).drawer;
  s.ok(!!d, 'drawer open');
  s.eq('stat line', d.statLine, 'Average = 1.825 V');
  s.eq('count', d.cnt, '4 of 10 samples');
  s.eq('target', d.tgt, 'Target ≤ 1.85 V');
  s.eq('partial block', [d.pt.score, d.pt.raw, d.pt.math, d.pt.more], ['40', '100 without discount', '100 × 4/10 samples = 40', '6 more readings to a full check-in']);
  s.eq('readings newest first', d.rows.map((r) => r.v), ['1.84 V', '1.82 V', '1.83 V', '1.81 V']);
  s.expect('Partial check-in');
  /* add: joins the current batch */
  s.type('New reading for Cell voltage at 2 A/cm²', '1.79');
  s.key('New reading for Cell voltage at 2 A/cm²', 'Enter');
  s.expect('Reading added.');
  let r = readsOf(s, CV).slice(-1)[0];
  s.eq('added reading', [r.value, r.batch, r.by], [1.79, 'b_build2', 'corey@celadyne.com']);
  s.eq('5 of 10', row(s, CV).drawer.cnt, '5 of 10 samples');
  const em = emOf(s), P = pool(s);
  s.eq('CV score = engine', row(s, CV).score, round(RD.kpiScoreParts(kpi(s, CV), P, em).score));
  s.eq('KR1 score = engine', RD.keyResultScore(KR1, em) != null, true);
  s.eq('sidebar objective score', sideScore(s, OBJ), round(RD.objectiveScore(OBJ, em)));
  /* invalid */
  s.type('New reading for Cell voltage at 2 A/cm²', 'x1');
  s.click('Add reading');
  s.expect('Use a number, like 1.85.');
  /* remove asks once more, inline */
  s.click('Remove reading 1.79');
  s.ok(s.has('Confirm removing 1.79'), 'armed');
  s.click('Confirm removing 1.79');
  s.expect('Reading removed.');
  s.eq('removed', readsOf(s, CV).some((u) => u.value === 1.79), false);
  /* new batch: the next reading starts a fresh sample, earlier ones stay but stop counting */
  s.click('Start a new batch');
  s.expect('New batch started. The next reading begins a fresh sample.');
  s.eq('nothing written yet', readsOf(s, CV).length, 4);
  s.type('New reading for Cell voltage at 2 A/cm²', '1.7');
  s.click('Add reading');
  r = readsOf(s, CV).slice(-1)[0];
  s.ok(r.batch && r.batch !== 'b_build2', 'new batch id');
  const d2 = row(s, CV).drawer;
  s.eq('statistic uses the new batch only', [d2.statLine, d2.cnt], ['Average = 1.7 V', '1 of 10 samples']);
  s.eq('earlier batch dimmed', d2.rows.filter((x) => x.stale).length, 4);
  s.expect('Earlier batch');
  s.eq('engine agrees', RD.readingCount(CV, emOf(s)), 1);
  /* a second reading joins that batch */
  s.type('New reading for Cell voltage at 2 A/cm²', '1.72');
  s.click('Add reading');
  s.eq('joins the new batch', readsOf(s, CV).slice(-1)[0].batch, r.batch);
  /* Escape closes the drawer */
  s.key('New reading for Cell voltage at 2 A/cm²', 'Escape');
  s.ok(!row(s, CV).drawer, 'Escape closes the drawer');
  s.click(READS('Cell voltage at 2 A/cm²'), IN(s));
  s.click('Close readings');
  s.ok(!row(s, CV).drawer, 'Close button closes the drawer');
  s.clean('after batches');
});

s.step('Provenance chip and source row for imported readings', () => {
  const h = row(s, HFR);
  s.ok(h.chip, 'HFR shows the analysis chip');
  s.eq('chip tooltip', h.chipTitle, 'TS10-B2-C04, 80 °C, 30 barg, 2026-10-12');
  s.click('Show where the imported readings of High-frequency resistance came from');
  const p = row(s, HFR).prov;
  s.eq('provenance title', p.title, 'Imported from analysis, 5 readings');
  s.eq('provenance sample', p.rows[0], { k: 'Sample', v: 'TS10-B2-C04' });
  s.eq('provenance analysis', p.rows[1].v, 'eis, HFR');
  s.eq('provenance scale', p.rows[p.rows.length - 1].v, '×1,000 on import (was 0.086)');
  s.expect('Imported from analysis, 5 readings');
  /* stays open across re-renders, closes on a second click */
  s.render();
  s.ok(row(s, HFR).provOpen, 'still open');
  s.click('Show where the imported readings of High-frequency resistance came from');
  s.ok(!row(s, HFR).provOpen, 'closed');
});


s.step('Add a KPI: validation, then saved exactly like today', () => {
  s.click('Add KPI', { within: 'kpi-t:all:keyResult:' + KR1 });
  s.expect('Add KPI');
  s.click('Save KPI');
  s.expect('Give the target a name.');
  s.type('Name', 'Open-circuit voltage');
  s.click('Decrease');
  s.type('Target', 'abc');
  s.click('Save KPI');
  s.expect('Use a number for the target, like 1.85.');
  s.type('Target', '1.45');
  s.type('Unit', 'V');
  const ids0 = doc(s).kpis.map((k) => k.id);
  s.click('Save KPI');
  s.expect('KPI saved.');
  const k = doc(s).kpis.find((x) => ids0.indexOf(x.id) < 0);
  s.eq('new KPI record', k, { id: RD.allocId('kpi', OBJ, ids0), objectiveId: OBJ, hostType: 'keyResult', hostId: KR1, groupId: null, isDefiner: true, name: 'Open-circuit voltage', targetType: 'demonstration', direction: 'down', target: 1.45, unit: 'V' });
  s.eq('sheet closed', s.c.state.sheets.map((x) => x.kind), ['kpi.all']);
  const em = emOf(s);
  s.eq('unread target counts 0 in the KR', RD.keyResultScore(KR1, em) != null, true);
  s.eq('sidebar objective score', sideScore(s, OBJ), round(RD.objectiveScore(OBJ, em)));
  s.eq('new row', [row(s, k.id).cur, row(s, k.id).crit, row(s, k.id).stWord], ['No reading', '≤ 1.45 V', 'Open']);
  global.NEWK = k.id;
});

s.step('Edit target: statistical with read count, statistic and a borrowed sample', () => {
  const id = global.NEWK;
  s.click('Edit KPI Open-circuit voltage');
  s.expect('Edit KPI');
  s.click('Statistical');
  s.type('Read count', '0');
  s.click('Save KPI');
  s.expect('Read count must be a whole number, 1 or more (or blank).');
  s.type('Read count', '5');
  s.type('Statistic', 'median');
  const opts = s.vals.kpi.tg.readsFromOpts;
  s.ok(opts.some((o) => o.v === CV && !o.dis), 'Cell voltage is offered as a sample');
  s.ok(opts.some((o) => o.label === 'Key results' && o.dis), 'grouped by key result');
  s.type('Readings come from', CV);
  s.click('Save KPI');
  const k = kpi(s, id);
  s.eq('statistical fields', [k.targetType, k.statistic, k.readCount, k.readsFrom, k.direction, k.target, k.unit], ['statistical', 'median', 5, CV, 'down', 1.45, 'V']);
  const P = pool(s), em = emOf(s);
  const pp = RD.kpiScoreParts(k, P, em);
  s.eq('borrowed sample feeds this statistic', row(s, id).cur, (Math.round(RD.effValue(k, P, em) * 1000) / 1000) + ' V');
  s.eq('borrowed sample count', row(s, id).sub, 'Median, ' + pp.n + ' of 5 samples');
  s.eq('score = engine', row(s, id).score, round(pp.score));
});

s.step('Edit target: binary clears direction, target, unit and statistics', () => {
  const id = global.NEWK;
  s.click('Edit KPI Open-circuit voltage');
  s.click('Binary (pass or fail)');
  s.expectNot('Readings come from');
  s.click('Save KPI');
  const k = kpi(s, id);
  s.eq('binary record', [k.targetType, k.direction, k.target, k.unit, 'statistic' in k, 'readCount' in k, 'readsFrom' in k], ['binary', null, null, null, false, false, false]);
  s.eq('binary target text', row(s, id).crit, 'Pass');
  s.click(POST('Open-circuit voltage'), IN(s));
  s.type('New value for Open-circuit voltage', 'pass');
  s.key('New value for Open-circuit voltage', 'Enter');
  s.expect('Use 1 for pass or 0 for fail.');
  s.type('New value for Open-circuit voltage', '1');
  s.key('New value for Open-circuit voltage', 'Enter');
  s.eq('binary pass shown', [row(s, id).cur, row(s, id).score, row(s, id).stWord], ['Pass', '100', 'Met']);
});

s.step('Stacked sheets: Back returns to Readings, Close closes the top sheet, Enter saves', () => {
  s.click('Add KPI', { within: 'kpi-t:all:keyResult:' + KR3 });
  s.eq('stacked', s.c.state.sheets.map((x) => x.kind), ['kpi.all', 'kpi.target']);
  s.click('Back');
  s.eq('back to readings', s.c.state.sheets.map((x) => x.kind), ['kpi.all']);
  s.click('Add KPI', { within: 'kpi-t:all:keyResult:' + KR3 });
  s.click('Close');
  s.eq('closed the top sheet', s.c.state.sheets.map((x) => x.kind), ['kpi.all']);
  s.click('Add KPI', { within: 'kpi-t:all:keyResult:' + KR3 });
  s.type('Name', 'Crossover at 10 bar');
  s.click('Decrease');
  s.type('Target', '0.5');
  s.key('Target', 'Enter');
  s.expect('KPI saved.');
  const k = doc(s).kpis.find((x) => x.name === 'Crossover at 10 bar');
  s.eq('saved with Enter', [k.hostId, k.direction, k.target], [KR3, 'down', 0.5]);
  s.click('Edit KPI Crossover at 10 bar');
  s.type('Name', 'Crossover at 10 barg');
  s.key('Name', 'Enter');
  s.eq('renamed with Enter', kpi(s, k.id).name, 'Crossover at 10 barg');
  s.click('Link a metric', { within: 'kpi-t:all:keyResult:' + KR3 });
  s.click('Back');
  s.click('Link a metric', { within: 'kpi-t:all:keyResult:' + KR3 });
  s.click('Close');
  s.eq('link sheet closed', s.c.state.sheets.map((x) => x.kind), ['kpi.all']);
  /* the Readings sheet can sit on top of another sheet too (KPI.openAll) */
  s.click('Add KPI', { within: 'kpi-t:all:keyResult:' + KR3 });
  api(s).openAll(s.c, s.c.ctx);
  s.render();
  s.eq('readings on top', s.c.state.sheets.map((x) => x.kind), ['kpi.all', 'kpi.target', 'kpi.all']);
  s.click('Back');
  s.click('Close');
  s.eq('back to the first readings sheet', s.c.state.sheets.map((x) => x.kind), ['kpi.all']);
});

s.step('Gate target with a range: min / max and average ± width %', () => {
  s.click('Add target', { within: 'kpi-t:all:stageGate:' + SGA2 });
  s.expect('Add gate target');
  s.type('Name', 'Plate flatness');
  s.click('Range');
  s.expect('Enter both values.');
  s.type('Minimum', '10');
  s.click('Save target');
  s.expect('Enter both the minimum and the maximum, or leave both blank.');
  s.type('Maximum', '6');
  s.expect('Full credit from 6 to 10 (width 4); zero one width outside.');
  s.type('Unit', 'µm');
  const ids0 = doc(s).kpis.map((k) => k.id);
  s.click('Save target');
  s.expect('Gate target saved.');
  const k = doc(s).kpis.find((x) => ids0.indexOf(x.id) < 0);
  s.eq('range record', [k.hostType, k.hostId, k.direction, k.target, 'rangeSpec' in k, k.unit], ['stageGate', SGA2, 'range', { lo: 6, hi: 10 }, false, 'µm']);
  s.eq('range target text', row(s, k.id).crit, '6 to 10 µm');
  s.click('Edit target Plate flatness');
  s.click('Average ± width %');
  s.type('Average', '8');
  s.click('Save target');
  s.expect('Enter both the average and the width %, or leave both blank.');
  s.type('Width %', '50');
  s.expect('Full credit from 6 to 10 (width 4); zero one width outside.');
  s.click('Save target');
  const k2 = kpi(s, k.id);
  s.eq('pct range record', [k2.target, k2.rangeSpec], [{ lo: 6, hi: 10 }, { mode: 'pct', center: 8, pct: 50 }]);
  /* reopening keeps the entry mode */
  s.click('Edit target Plate flatness');
  s.eq('round-trips the mode', [s.vals.kpi.tg.isPct, s.vals.kpi.tg.rangeCenter, s.vals.kpi.tg.rangePct], [true, '8', '50']);
  s.click('Cancel');
  /* range scoring: 100 inside, linear to 0 one width outside */
  s.click(POST('Plate flatness'), IN(s));
  s.type('New value for Plate flatness', '12');
  s.key('New value for Plate flatness', 'Enter');
  s.eq('range score', row(s, k.id).score, '50');
  s.eq('gate readiness = engine', RD.stageGateScore(SGA2, emOf(s)) != null, true);
  global.FLAT = k.id;
});

s.step('Delete a target from its sheet (confirm says what is lost)', () => {
  const id = global.FLAT;
  s.click('Edit target Plate flatness');
  s.click('Delete target', { within: 'Editor' });
  s.expect('Delete “Plate flatness”?');
  s.expect('Its 1 reading will be deleted too. This can’t be undone.');
  s.click('Delete target', { within: 'Delete “Plate flatness”?' });
  s.expect('Target deleted.');
  s.eq('KPI gone', !!kpi(s, id), false);
  s.eq('readings gone', readsOf(s, id).length, 0);
  s.eq('sheet closed', s.c.state.sheets.map((x) => x.kind), ['kpi.all']);
});

s.step('Link a metric: tree, defaults, priority, write like today', () => {
  s.click('Link a metric', { within: 'kpi-t:all:stageGate:' + SGA2 });
  s.expect('Link a metric');
  const lk = s.vals.kpi.lk;
  const heads = lk.items.filter((i) => i.isHead).map((i) => i.label);
  ['Initiative: Tera component lock', 'Product: Tera stack', 'Model: Tera 25-30-R5', 'Component: Membrane electrode assembly', 'Product: Tera system', 'Objective: Qualify the 10-cell short stack for durability testing', 'KR1 — Demonstrate cell-to-cell uniformity across the 10-cell build']
    .forEach((h) => s.ok(heads.indexOf(h) >= 0, 'tree heading ' + h));
  const opts = lk.items.filter((i) => !i.isHead);
  s.ok(opts.some((i) => i.id === 'KPI-EL-01-1'), 'initiative target offered');
  s.ok(opts.some((i) => i.id === 'KPI-EL-01-02-1'), 'milestone target offered');
  s.ok(opts.some((i) => i.id === 'KPI-EL-1-1-4-1'), 'model spec offered');
  s.ok(opts.some((i) => i.id === 'KPI-EL-1-1-C1-1'), 'component KPI offered');
  s.ok(opts.some((i) => i.id === CV), 'KR KPI offered to a gate (higher level)');
  s.ok(!opts.some((i) => i.id === DEC), 'the gate’s own target is not offered');
  s.ok(!opts.some((i) => i.id === 'KPI-FC-01-1'), 'other families are not offered');
  s.ok(opts.filter((i) => i.on).length === 1 && opts[0].on, 'first metric preselected');
  s.check((el) => el.tag === 'input' && el.scope && el.scope.kpi_i && el.scope.kpi_i.id === CV, true);
  s.eq('relationship default', s.vals.kpi.lk.rels.map((r) => r.on), ['true', 'false', 'false']);
  s.expect('Contribute rolls this reading up into the target metric.');
  s.expect('This link gets priority 1: when several linked KPIs report into the same metric, the newest link wins ties.');
  const ids0 = doc(s).kpis.map((k) => k.id);
  s.click('Link');
  s.expect('Linked to key result “Demonstrate cell-to-cell uniformity across the 10-cell build” (contribute).');
  const k = doc(s).kpis.find((x) => ids0.indexOf(x.id) < 0);
  s.eq('member record', k, { id: RD.allocId('kpi', OBJ, ids0), objectiveId: OBJ, hostType: 'stageGate', hostId: SGA2, linkParent: CV, linkType: 'contribute', linkPriority: 1, name: null, direction: null, unit: null, target: null, order: 0 });
  const r = row(s, k.id);
  s.eq('member row', [r.name, r.badges.map((b) => b.label), r.crit, r.critTag, r.cur], ['Cell voltage at 2 A/cm²', ['Linked'], '≤ 1.85 V', 'Inherited', 'No reading']);
  s.eq('definer badge', row(s, CV).badges.map((b) => b.label), ['Defines 1']);
  const P = pool(s);
  s.eq('engine sees the link', [RD.linkOf(k, P).parent, RD.rootOf(k, P).id, RD.effTarget(k, P)], [CV, CV, 1.85]);
  global.MEM = k.id;
});

s.step('Override a linked KPI: local name and target', () => {
  const id = global.MEM;
  s.click('Edit the override for Cell voltage at 2 A/cm²');
  s.expect('Linked KPI');
  s.expect('Inherits “Cell voltage at 2 A/cm²” (decrease, V) from key result “Demonstrate cell-to-cell uniformity across the 10-cell build”. Link: contribute, priority 1.');
  s.expect('Inherited target: ≤ 1.85 V.');
  s.type('Name here', 'Gate cell voltage');
  s.type('Override target', 'x');
  s.click('Save override');
  s.expect('Use a number for the override, like 1.85, or leave it blank to inherit.');
  s.type('Override target', '1.9');
  s.click('Save override');
  s.expect('Override saved.');
  const k = kpi(s, id);
  s.eq('override record', [k.target, k.localName, k.name], [1.9, 'Gate cell voltage', null]);
  const r = row(s, id);
  s.eq('override row', [r.name, r.badges.map((b) => b.label), r.crit, r.critTag], ['Gate cell voltage', ['Linked: Cell voltage at 2 A/cm²'], '≤ 1.9 V', 'Override']);
  s.eq('engine target', RD.effTarget(k, pool(s)), 1.9);
  s.eq('source keeps its name', RD.kpiName(kpi(s, CV), pool(s)), 'Cell voltage at 2 A/cm²');
});

s.step('A definer with members cannot be deleted', () => {
  s.click('Actions for Cell voltage at 2 A/cm²');
  s.click('Delete KPI');
  s.expect('This KPI defines a linked metric — unlink its members first (1 KPI links to it).');
  s.ok(!!kpi(s, CV), 'still there');
});

s.step('Unlink keeps what the row showed', () => {
  const id = global.MEM;
  s.click('Actions for Gate cell voltage');
  s.click('Unlink');
  s.expect('Unlinked.');
  const k = kpi(s, id);
  s.eq('unlinked record', [k.name, k.direction, k.unit, k.target, k.targetType, k.statistic, k.readCount, k.groupId, k.isDefiner, k.linkParent, 'linkType' in k, 'linkPriority' in k],
    ['Gate cell voltage', 'down', 'V', 1.9, 'statistical', 'average', 10, null, true, null, false, false]);
  s.eq('definer badge gone', row(s, CV).badges.length, 0);
  /* delete it from the row menu (no readings) */
  s.click('Actions for Gate cell voltage');
  s.click('Delete target');
  s.expect('It has no readings. This can’t be undone.');
  s.click('Delete target', { within: 'Delete “Gate cell voltage”?' });
  s.eq('deleted', !!kpi(s, id), false);
});

s.step('Specification link to an initiative target', () => {
  s.click('Link a metric', { within: 'kpi-t:all:stageGate:' + SGA2 });
  s.check((el) => el.tag === 'input' && el.scope && el.scope.kpi_i && el.scope.kpi_i.id === 'KPI-EL-01-1', true);
  s.click('Specification');
  s.expect('Specification measures against the target metric without rolling the reading up.');
  const ids0 = doc(s).kpis.map((k) => k.id);
  s.click('Link');
  s.expect('Linked to initiative Tera component lock (specification).');
  const k = doc(s).kpis.find((x) => ids0.indexOf(x.id) < 0);
  s.eq('spec link', [k.linkParent, k.linkType, k.linkPriority], ['KPI-EL-01-1', 'specification', 1]);
  s.eq('inherits the initiative target', row(s, k.id).crit, '≥ 75%');
  /* a second link to the same metric from another host gets the next priority */
  s.click('Link a metric', { within: 'kpi-t:all:keyResult:' + KR1 });
  s.check((el) => el.tag === 'input' && el.scope && el.scope.kpi_i && el.scope.kpi_i.id === 'KPI-EL-01-1', true);
  s.expect('This link gets priority 2');
  s.click('Cancel');
});

s.step('Cycle refusal (today’s message)', () => {
  /* a portfolio milestone target whose id is the id this link would allocate: linking would point the KPI at itself */
  const next = RD.allocId('kpi', OBJ, doc(s).kpis.map((k) => k.id));
  s.c.D.portfolio.kpis.push({ id: next, objectiveId: null, hostType: 'milestone', hostId: 'MS-EL-01-02', name: 'Stack leak rate', targetType: 'demonstration', direction: 'down', target: 0.1, unit: 'sccm', linkParent: null, linkType: 'contribute' });
  s.render();
  s.click('Link a metric', { within: 'kpi-t:all:stageGate:' + SGA2 });
  s.check((el) => el.tag === 'input' && el.scope && el.scope.kpi_i && el.scope.kpi_i.id === next, true);
  const n0 = doc(s).kpis.length;
  s.click('Link');
  s.expect('That link would create a cycle — choose a different target.');
  s.eq('nothing linked', doc(s).kpis.length, n0);
  s.eq('sheet stays open', s.c.sheet().kind, 'kpi.link');
  s.click('Cancel');
  s.c.D.portfolio.kpis = s.c.D.portfolio.kpis.filter((k) => k.id !== next);
  s.render();
  s.clean('after linking');
});

s.step('Override a range target on a task, unlink and delete from the override sheet', () => {
  closeSheets(s);
  s.click('~Lock Tera 25-30-R5 components');
  s.click('Overview');
  s.click('Record readings');
  const TASK = 'TSK-EL-2026Q4-02-1', ICR = 'KPI-EL-2026Q4-02-3-1';
  s.click('Link a metric', { within: 'kpi-t:all:task:' + TASK });
  s.check((el) => el.tag === 'input' && el.scope && el.scope.kpi_i && el.scope.kpi_i.id === ICR, true);
  const ids0 = doc(s).kpis.map((k) => k.id);
  s.click('Link');
  s.expect('Linked to gate “Second-source bipolar plate trial” (contribute).');
  const m = doc(s).kpis.find((x) => ids0.indexOf(x.id) < 0);
  s.eq('task member', [m.hostType, m.hostId, m.objectiveId, row(s, m.id).crit], ['task', TASK, 'OBJ-EL-2026Q4-02', '6 to 10 mΩ·cm²']);
  s.click('Edit the override for Interfacial contact resistance');
  s.click('Back');
  s.click('Edit the override for Interfacial contact resistance');
  s.click('Close');
  s.click('Edit the override for Interfacial contact resistance');
  s.click('Cancel');
  s.click('Edit the override for Interfacial contact resistance');
  s.expect('Inherited target: 6 to 10 mΩ·cm².');
  s.type('Override minimum', '7');
  s.click('Save override');
  s.expect('Enter both the minimum and the maximum, or leave both blank to inherit.');
  s.type('Override maximum', '5');
  s.click('Save override');
  s.eq('range override (normalised)', kpi(s, m.id).target, { lo: 5, hi: 7 });
  s.eq('row shows the override', [row(s, m.id).crit, row(s, m.id).critTag], ['5 to 7 mΩ·cm²', 'Override']);
  s.click(POST('Interfacial contact resistance'), IN(s));
  s.type('New value for Interfacial contact resistance', '8');
  s.key('New value for Interfacial contact resistance', 'Enter');
  s.eq('range scoring against the override = engine', row(s, m.id).score, round(RD.kpiScoreParts(kpi(s, m.id), pool(s), emOf(s)).score));
  s.click('Edit the override for Interfacial contact resistance');
  s.click('Unlink');
  s.expect('Unlinked.');
  const u = kpi(s, m.id);
  s.eq('unlinked range KPI', [u.direction, u.target, u.unit, u.linkParent], ['range', { lo: 5, hi: 7 }, 'mΩ·cm²', null]);
  s.eq('sheet closed', s.c.state.sheets.map((x) => x.kind), ['kpi.all']);
  /* link again and delete the member from its override sheet */
  s.click('Link a metric', { within: 'kpi-t:all:task:' + TASK });
  s.check((el) => el.tag === 'input' && el.scope && el.scope.kpi_i && el.scope.kpi_i.id === ICR, true);
  const ids1 = doc(s).kpis.map((k) => k.id);
  s.click('Link');
  const m2 = doc(s).kpis.find((x) => ids1.indexOf(x.id) < 0);
  s.click('Edit the override for Interfacial contact resistance');
  s.click('Delete KPI', { within: 'Editor' });
  s.click('Delete KPI', { within: 'Delete “Interfacial contact resistance”?' });
  s.expect('KPI deleted.');
  s.eq('member deleted', !!kpi(s, m2.id), false);
  closeSheets(s);
  s.click('~Qualify the 10-cell short stack for durability testing');
  s.eq('back on the first objective', s.c.ctx.objId, OBJ);
});

s.step('Search finds KPIs and shows them in Readings', () => {
  closeSheets(s);
  const res = s.c.MODS.kpi.search(s.c, s.c.ctx, 'decay');
  s.eq('search hits', res.map((r) => r.label), ['Voltage decay rate', 'Voltage decay rate, 1,000 h']);
  s.type('Search', 'decay');
  s.expect('KPIs');
  s.click('~Voltage decay rate On gate');
  s.eq('went to the gate tab', [s.c.state.objId, s.c.state.tab, s.c.sheet().kind], [OBJ, 'gates', 'kpi.all']);
  s.ok(row(s, DEC).hl, 'row highlighted');
  s.click('Close');
  s.eq('readings closed', s.c.state.sheets.length, 0);
});


/* ------------------------------------------------ Connect data (fresh board) */
const c = new Sim(file);
c.step('Connect data: loading, currently connected, last 5 samples', () => {
  openReadings(c);
  c.click('Connect data', { within: 'kpi-t:all:keyResult:' + KR1 });
  c.expect('Loading the analysis index…');
  c.flush();
  c.expectNot('Loading the analysis index…');
  c.expect('Currently connected');
  const cd = c.vals.kpi.cd;
  c.eq('title and context', [cd.title, cd.sub], ['Connect data', 'KR1, Demonstrate cell-to-cell uniformity across the 10-cell build']);
  c.eq('connected summary', cd.connSum, '5 samples, 9 readings');
  c.eq('connected groups (newest first, as the engine returns them)', cd.connGroups.map((g) => g.sample), ['TS10-B2-C04', 'TS10-B2-C03', 'TS10-B2-C02', 'TS10-B2-C01']);
  c.eq('orphan', [cd.hasOrphans, cd.orphans[0].keyName], [true, 'HFR']);
  c.expect('Source removed from the index');
  c.eq('scaled reading shows the target unit', cd.connGroups[0].rows.find((r) => r.keyName === 'HFR').val, '86 mΩ·cm²');
  /* the index is shared (other modules add runs too), so the expected lists come from the engine */
  c.eq('default list', [cd.listLabel, cd.samples.map((x) => x.name)], ['Last 5 samples', RD.analysisRecentSamples(c.c.D.analysis, 5).map((x) => x.sample)]);
  c.ok(cd.samples.some((x) => x.name === 'TS10-B2-C05'), 'the newest cells are listed');
  c.eq('footer count', cd.count, '8 connected, 0 new');
  c.eq('apply disabled', [cd.applyLabel, cd.applyOff], ['Apply changes', true]);
  c.clean('connect sheet');
});

c.step('Connect data: pick, re-target, scale, unit warning, apply', () => {
  c.click('~TS10-B2-C05');
  c.check('Import V @ 2 A/cm² from TS10-B2-C05 (polcurve)', true);
  let v = c.vals.kpi.cd.samples[1].unitList[0].rows.find((x) => x.key === 'V @ 2 A/cm²');
  c.eq('default target is a new KPI', v.tv, '__new__');
  c.type('Import V @ 2 A/cm² from TS10-B2-C05 (polcurve) into', CV);
  c.check('Import HFR from TS10-B2-C05 (eis)', true);
  c.type('Import HFR from TS10-B2-C05 (eis) into', HFR);
  c.expect('Unit differs (the target uses mΩ·cm²). Scale it if needed.');
  c.type('Scale HFR from TS10-B2-C05 (eis)', '1000');
  const h = c.vals.kpi.cd.samples[1].unitList[1].rows[0];
  c.eq('scaled value', [h.shown, h.was], ['71', 'was 0.071']);
  c.eq('footer count', c.vals.kpi.cd.count, '8 connected, 2 new');
  const n0 = doc(c).kpiUpdates.length;
  c.click('Apply changes');
  c.expect('2 readings added.');
  const ups = doc(c).kpiUpdates.slice(n0);
  c.eq('two readings', ups.length, 2);
  const uv = ups.find((u) => u.kpiId === CV), uh = ups.find((u) => u.kpiId === HFR);
  c.eq('voltage reading', [uv.value, uv.timestamp, uv.note, uv.by, uv.src.sample, uv.src.bucket, uv.src.key, uv.src.run_t, uv.src.script, uv.src.portal],
    [1.8, Date.parse('2026-10-13T14:40:00Z'), 'analysis: polcurve/V @ 2 A/cm²', 'corey@celadyne.com', 'TS10-B2-C05', 'polcurve', 'V @ 2 A/cm²', '2026-10-13T14:40:00Z', 'polcurve.py', 'analysis']);
  c.eq('HFR reading scaled with provenance', [uh.value, uh.src.scale, uh.src.value_raw], [71, 1000, 0.071]);
  c.ok(uv.batch && uv.batch === uh.batch && uv.batch !== 'b_build2', 'one new batch for the import');
  c.eq('sheet closed', c.c.sheet().kind, 'kpi.all');
  const P = pool(c), em = emOf(c);
  c.eq('row score = engine', row(c, CV).score, round(RD.kpiScoreParts(kpi(c, CV), P, em).score));
  c.eq('import batch is the current sample', row(c, CV).sub, 'Average, 1 of 10 samples');
  c.eq('engine agrees', RD.readingCount(CV, em), 1);
  c.eq('sidebar objective score', sideScore(c, OBJ), round(RD.objectiveScore(OBJ, em)));
});

c.step('Connect data: untick removes, re-target moves, duplicates skipped, orphans removable', () => {
  c.click('Connect data', { within: 'kpi-t:all:keyResult:' + KR1 });
  c.flush();
  c.eq('now connected', c.vals.kpi.cd.connSum, '6 samples, 11 readings');
  c.check('Keep V @ 2 A/cm² from TS10-B2-C01', false);
  c.eq('count with a removal', c.vals.kpi.cd.count, '9 connected, 0 new, 1 to remove');
  c.click('Apply changes');
  c.expect('1 removed.');
  c.eq('UPD-V-1 removed', doc(c).kpiUpdates.some((u) => u.id === 'UPD-V-1'), false);
  /* re-target: the C02 voltage moves from Cell voltage to HFR */
  c.click('Connect data', { within: 'kpi-t:all:keyResult:' + KR1 });
  c.flush();
  c.type('Target for V @ 2 A/cm² from TS10-B2-C02', HFR);
  c.click('Apply changes');
  c.expect('1 reading added, 1 removed.');
  c.eq('moved', [doc(c).kpiUpdates.some((u) => u.id === 'UPD-V-2'), doc(c).kpiUpdates.some((u) => u.kpiId === HFR && u.value === 1.83 && u.src && u.src.sample === 'TS10-B2-C02')], [false, true]);
  /* duplicate: importing a reading that is already connected is skipped */
  c.click('Connect data', { within: 'kpi-t:all:keyResult:' + KR1 });
  c.flush();
  c.click('~TS10-B2-C04');
  c.check('Import V @ 2 A/cm² from TS10-B2-C04 (polcurve)', true);
  c.type('Import V @ 2 A/cm² from TS10-B2-C04 (polcurve) into', CV);
  const n0 = doc(c).kpiUpdates.length;
  c.click('Apply changes');
  c.expect('1 already connected.');
  c.eq('nothing added', doc(c).kpiUpdates.length, n0);
  /* the orphan can be removed */
  c.click('Connect data', { within: 'kpi-t:all:keyResult:' + KR1 });
  c.flush();
  c.check('Keep HFR from TS10-B1-C01', false);
  c.click('Apply changes');
  c.eq('orphan removed', doc(c).kpiUpdates.some((u) => u.id === 'UPD-H-0a'), false);
});

c.step('Connect data on a gate: filters, matches a target, create one new KPI per key', () => {
  c.click('Connect data', { within: 'kpi-t:all:stageGate:' + SGA2 });
  c.flush();
  c.expectNot('Currently connected');
  c.eq('import button', c.vals.kpi.cd.applyLabel, 'Import');
  c.type('Analysis', 'crossover');
  const idx = c.c.D.analysis;
  const want = (f) => RD.analysisSearch(idx, f).map((x) => x.sample);
  c.eq('analysis filter', c.vals.kpi.cd.samples.map((x) => x.name), want({ analysis: 'crossover' }));
  c.ok(c.vals.kpi.cd.samples.some((x) => x.name === 'TS10-B2-STACK'), 'stack crossover found');
  c.type('Analysis', '');
  c.type('How the sample name matches', 'starts');
  c.type('Sample name', 'HP6');
  c.eq('starts with', c.vals.kpi.cd.listLabel, want({ name: 'HP6', nameMode: 'starts' }).length + ' samples match');
  c.type('How the sample name matches', 'exact');
  c.type('Sample name', 'hp6-12-r07');
  c.eq('exact', c.vals.kpi.cd.samples.map((x) => x.name), ['HP6-12-R07']);
  c.click('Clear filters');
  c.eq('cleared', c.vals.kpi.cd.listLabel, 'Last 5 samples');
  c.type('Temp (°C)', '80');
  c.type('RH (%)', '20');
  c.eq('conditions select units', c.vals.kpi.cd.samples.map((x) => x.name), want({ T_C: 80, RH_pct: 20 }));
  c.ok(c.vals.kpi.cd.samples.some((x) => x.name === 'MEA-SSC-0413'), 'conditions: the low-RH MEA');
  c.click('~MEA-SSC-0413');
  c.eq('only the matching unit', c.vals.kpi.cd.samples[0].unitList.length, 1);
  c.click('Clear filters');
  c.type('Pressure', '150 kPa');
  c.eq('pressure with unit', c.vals.kpi.cd.samples.map((x) => x.name), want({ P_value: 150, P_unit: 'kPa' }));
  c.type('Pressure', '999 kPa');
  c.expect('No samples match those filters.');
  c.click('Clear filters');
  c.type('Sample name', 'STACK');
  c.click('~TS10-B2-STACK');
  const units = c.vals.kpi.cd.samples[0].unitList;
  c.eq('stack units', units.length, 8);
  const dr = units[0].rows.find((x) => x.key === 'Voltage decay rate');
  c.eq('matches a target here', [dr.matched, dr.tv], [true, DEC]);
  c.expect('Matches a target here');
  /* the three newest durability segments into the decay-rate target */
  const segs = c.vals.kpi.cd.samples[0].unitList.map((u, i) => ({ i, u })).filter((x) => x.u.run.indexOf('durability.py') === 0);
  c.eq('six durability segments', segs.length, 6);
  /* tick decay rate in the 3 newest units (units are listed in run order: 4th, 5th, 6th) */
  ['400 h', '450 h', '500 h'].forEach((st) => c.check('Import Voltage decay rate from TS10-B2-STACK (polcurve, ' + st + ')', true));
  /* and H2 in O2 from both crossover runs into a new KPI */
  c.check('Import H₂ in O₂ from TS10-B2-STACK (crossover)', true);
  c.check('Import H₂ in O₂ from TS10-B2-STACK (crossover, 500 h)', true);
  c.eq('count', c.vals.kpi.cd.count, '5 values selected from TS10-B2-STACK');
  const k0 = doc(c).kpis.map((k) => k.id);
  c.click('Import');
  c.expect('5 readings added.');
  const created = doc(c).kpis.filter((k) => k0.indexOf(k.id) < 0);
  c.eq('one new KPI for the key', created.map((k) => [k.name, k.targetType, k.direction, k.target, k.hostType, k.hostId, k.isDefiner]), [['H₂ in O₂', 'statistical', 'up', null, 'stageGate', SGA2, false]]);
  c.eq('it holds both readings', readsOf(c, created[0].id).map((u) => u.value).sort(), [0.62, 0.71]);
  const em = emOf(c), P = pool(c);
  c.eq('decay rate: the import is the current batch', [RD.readingCount(DEC, em), row(c, DEC).sub], [3, 'Average, 3 of 6 samples']);
  c.eq('decay statistic', row(c, DEC).cur, '8.933 µV/h');
  c.eq('gate readiness = engine', RD.stageGateScore(SGA2, em) != null, true);
  c.eq('row score = engine', row(c, DEC).score, round(RD.kpiScoreParts(kpi(c, DEC), P, em).score));
});

c.step('Connect data sheet: Back and Close', () => {
  c.click('Connect data', { within: 'kpi-t:all:keyResult:' + KR1 });
  c.flush();
  c.click('Back');
  c.eq('back to readings', c.c.state.sheets.map((x) => x.kind), ['kpi.all']);
  c.click('Connect data', { within: 'kpi-t:all:keyResult:' + KR1 });
  c.click('Close');
  c.eq('closed', c.c.state.sheets.map((x) => x.kind), ['kpi.all']);
});

c.step('Connect data: offline and unreadable index messages', () => {
  c.c.setState({ sim: Object.assign({}, c.c.state.sim, { offline: true }) });
  c.render();
  c.click('Connect data', { within: 'kpi-t:all:keyResult:' + KR1 });
  c.flush();
  c.expect('Analysis index unavailable (offline). Connect data reads the analysis portal; try again when you’re back online.');
  c.c.setState({ sim: Object.assign({}, c.c.state.sim, { offline: false }) });
  c.click('Try again');
  c.flush();
  c.expect('Currently connected');
  c.click('Cancel');
  closeSheets(c);
  c.click('Settings');
  c.check('Simulate an unreadable analysis index', true);
  c.click('Close');
  openReadings(c);
  c.click('Connect data', { within: 'kpi-t:all:keyResult:' + KR1 });
  c.flush();
  c.expect('Analysis index unreadable: unsupported schema 1. Ask whoever runs the analysis portal to republish it.');
  c.eq('import disabled', c.vals.kpi.cd.applyOff, true);
  closeSheets(c);
  c.click('Settings');
  c.check('Simulate an unreadable analysis index', false);
  c.click('Close');
});

c.step('Connect data for an experiment’s key reads (KPI.openConnect record mode)', () => {
  let local = null, after = null;
  const keyReads = [{ id: 'kr_v', name: 'V @ 2 A/cm²', unit: 'V', source_kpi_gid: CV }, { id: 'kr_ocv', name: 'OCV', unit: 'V' }];
  api(c).openConnect(c.c, c.c.ctx, {
    keyReads, getExperiment: () => ({ key_read_readings: {} }), label: 'EXP-1, key reads',
    applyLocal: (D, x) => { local = x; return { added: (x.imports.kr_ocv || []).length, removed: 0, skipped: 0 }; },
    afterApply: (C, r) => { after = r; }
  });
  c.render();
  c.flush();
  c.eq('record title', [c.vals.kpi.cd.title, c.vals.kpi.cd.sub], ['Connect data: fill key reads', 'EXP-1, key reads']);
  c.click('~TS10-B2-C06');
  c.check('Import V @ 2 A/cm² from TS10-B2-C06 (polcurve)', true);
  c.check('Import OCV from TS10-B2-C06 (polcurve)', true);
  const rows = c.vals.kpi.cd.samples[0].unitList[0].rows;
  c.eq('key reads matched by name', [rows.find((r) => r.key === 'OCV').tv, rows.find((r) => r.key === 'V @ 2 A/cm²').tv], ['kr_ocv', 'kr_v']);
  c.ok(!rows[0].topts.some((o) => o.v === '__new__'), 'no "create a new KPI" for key reads');
  c.ok(c.vals.kpi.cd.hasConn, 'the linked key read shows its KPI’s connected readings');
  const n0 = readsOf(c, CV).length;
  c.click('Apply changes');
  c.expect('2 readings added.');
  c.eq('linked key read posts a KPI reading', readsOf(c, CV).length, n0 + 1);
  c.eq('unlinked key read handed to the experiment', [Object.keys(local.imports), local.imports.kr_ocv[0].value, !!local.batch, local.linkedAdded], [['kr_ocv'], 1.43, true, 1]);
  c.eq('afterApply called', after, { added: 2, removed: 0, skipped: 0 });
});

/* ------------------------------------------------ read-only (fresh board) */
const r = new Sim(file);
r.step('Read-only: values visible, editing blocked with the read-only message', () => {
  setRo(r, true);
  r.expect('View readings');
  r.click('View readings');
  r.ok(!!row(r, CV) && !!row(r, XO), 'tables visible');
  r.eq('values shown', [row(r, XO).cur, row(r, CV).cur], ['0.62%', '1.825 V']);
  r.ok(!r.has('Add KPI') && !r.has('Link a metric') && !r.has('Connect data'), 'no add, link or connect');
  r.ok(!r.has('Actions for Cell voltage at 2 A/cm²'), 'no row menu');
  r.ok(!r.has('Edit KPI Cell voltage at 2 A/cm²'), 'names are not editors');
  r.ok(!r.has(POST('H₂ in O₂'), IN(r)), 'single values are not editable');
  r.click(READS('Cell voltage at 2 A/cm²'), IN(r));
  r.expect('Read-only view — editing is disabled.');
  r.ok(!r.has('Add reading') && !r.has('Start a new batch') && !r.has('Remove reading 1.84'), 'drawer is view-only');
  r.eq('readings listed', row(r, CV).drawer.rows.length, 4);
  const before = JSON.stringify(r.c.D);
  api(r).openTarget(r.c, r.c.ctx, { type: 'keyResult', id: KR1 }, null);
  r.render();
  r.expect('Read-only view — editing is disabled.');
  r.eq('no target sheet', r.c.sheet().kind, 'kpi.all');
  api(r).openConnect(r.c, r.c.ctx, { host: { type: 'keyResult', id: KR1 } });
  api(r).openLink(r.c, r.c.ctx, { type: 'keyResult', id: KR1 });
  api(r).del(r.c, r.c.ctx, CV);
  r.render();
  r.eq('still only the readings sheet', r.c.state.sheets.map((x) => x.kind), ['kpi.all']);
  r.eq('data unchanged', JSON.stringify(r.c.D), before);
  r.clean('read-only');
});

closeSheets(s);
done();
} else {
/* ============================================================= Sales */
const s = new Sim(file);
const OBJ = 'OBJ-BD-2026Q4-01', KR2 = 'KR-BD-2026Q4-01-2', PV = 'KPI-BD-2026Q4-01-2-1';
s.clean('initial');

s.step('Latest readings on the Overview', () => {
  const L = s.vals.kpi.latest;
  s.eq('newest reading', [L.rows[0].name, L.rows[0].val, L.rows[0].meta], ['Qualified pipeline value', '3.6 $M', 'Sam, 3 days ago']);
  s.expect('Sam, 3 days ago');
});

s.step('Post a reading; KR and objective scores follow the engine', () => {
  openReadings(s);
  const r0 = row(s, PV);
  s.eq('row', [r0.cur, r0.crit, r0.score, r0.stWord], ['3.6 $M', '≥ 4.5 $M', '80', 'On track']);
  s.ok(!r0.chip, 'no analysis chip in Sales');
  s.click(POST('Qualified pipeline value'), IN(s));
  s.type('New value for Qualified pipeline value', '4');
  s.key('New value for Qualified pipeline value', 'Enter');
  s.expect('Reading posted.');
  const u = readsOf(s, PV).slice(-1)[0];
  s.eq('reading', [u.value, u.by, u.note], [4, 'corey@celadyne.com', '']);
  const em = emOf(s);
  s.eq('KR score', Math.round(RD.keyResultScore(KR2, em)), 89);
  s.eq('row score', row(s, PV).score, '89');
  s.eq('sidebar objective score', sideScore(s, OBJ), round(RD.objectiveScore(OBJ, em)));
  s.clean('after posting');
});

s.step('Sales has no Connect data or analysis provenance', () => {
  s.ok(!s.has('Connect data'), 'no Connect data button');
  api(s).openConnect(s.c, s.c.ctx, { host: { type: 'keyResult', id: KR2 } });
  s.render();
  s.expect('Connect data is part of the Execution app.');
  s.eq('no connect sheet', s.c.state.sheets.map((x) => x.kind), ['kpi.all']);
  closeSheets(s);
  s.click('Settings');
  s.expectNot('Simulate an unreadable analysis index');
  s.click('Close');
});

s.step('Targets, statistical readings and links work the same in Sales', () => {
  openReadings(s);
  s.click('Add KPI', { within: 'kpi-t:all:keyResult:' + KR2 });
  s.type('Name', 'Pilot proposals out');
  s.click('Statistical');
  s.type('Read count', '3');
  s.type('Target', '2');
  s.type('Unit', 'proposals');
  const ids0 = doc(s).kpis.map((k) => k.id);
  s.click('Save KPI');
  s.expect('KPI saved.');
  const k = doc(s).kpis.find((x) => ids0.indexOf(x.id) < 0);
  s.eq('record', [k.id, k.objectiveId, k.hostType, k.hostId, k.targetType, k.statistic, k.readCount, k.direction, k.target, k.unit],
    [RD.allocId('kpi', OBJ, ids0), OBJ, 'keyResult', KR2, 'statistical', 'average', 3, 'up', 2, 'proposals']);
  s.ok(s.has('Add readings for Pilot proposals out', IN(s)), 'no value yet: Add readings');
  s.click(READS('Pilot proposals out'), IN(s));
  s.type('New reading for Pilot proposals out', '2');
  s.click('Add reading');
  s.eq('partial check-in', [row(s, k.id).sub, row(s, k.id).math, row(s, k.id).score], ['Average, 1 of 3 samples', '100 × 1/3 samples', '33']);
  s.eq('engine', round(RD.kpiScoreParts(kpi(s, k.id), pool(s), emOf(s)).score), '33');
  s.click('Close readings');
  s.click('Link a metric', { within: 'kpi-t:all:keyResult:' + KR2 });
  s.expect('Initiative: Utility pilot program');
  const ids1 = doc(s).kpis.map((x) => x.id);
  s.click('Link');
  s.expect('Linked to initiative Utility pilot program (contribute).');
  const m = doc(s).kpis.find((x) => ids1.indexOf(x.id) < 0);
  s.eq('member', [m.linkParent, m.linkType, m.linkPriority], ['KPI-BD-01-1', 'contribute', 1]);
  s.eq('member row', [row(s, m.id).name, row(s, m.id).crit, row(s, m.id).critTag], ['Signed pilot capacity', '≥ 3 MW', 'Inherited']);
});

s.step('Sales: drawer remove and new batch, edit and delete targets, override and unlink', () => {
  const k = doc(s).kpis.find((x) => x.name === 'Pilot proposals out');
  s.click(READS('Pilot proposals out'), IN(s));
  s.click('Start a new batch');
  s.type('New reading for Pilot proposals out', '3');
  s.key('New reading for Pilot proposals out', 'Enter');
  s.eq('new batch counts alone', row(s, k.id).drawer.cnt, '1 of 3 samples');
  s.click('Remove reading 3');
  s.click('Confirm removing 3');
  s.eq('removed', readsOf(s, k.id).length, 1);
  s.key('New reading for Pilot proposals out', 'Escape');
  /* edit to a range with average ± width, then delete it from the sheet */
  s.click('Edit KPI Pilot proposals out');
  s.click('Range');
  s.click('Average ± width %');
  s.type('Average', '4');
  s.type('Width %', '50');
  s.expect('Full credit from 3 to 5 (width 2); zero one width outside.');
  s.key('Name', 'Enter');
  s.eq('range saved', [kpi(s, k.id).target, kpi(s, k.id).rangeSpec], [{ lo: 3, hi: 5 }, { mode: 'pct', center: 4, pct: 50 }]);
  s.click('Edit KPI Pilot proposals out');
  s.click('Delete KPI', { within: 'Editor' });
  s.expect('Its 1 reading will be deleted too. This can’t be undone.');
  s.click('Delete KPI', { within: 'Delete “Pilot proposals out”?' });
  s.eq('deleted with its readings', [!!kpi(s, k.id), readsOf(s, k.id).length], [false, 0]);
  /* the linked member made above: override, then unlink from the row menu */
  const m = doc(s).kpis.find((x) => x.linkParent === 'KPI-BD-01-1');
  s.click('Edit the override for Signed pilot capacity');
  s.type('Override target', '2');
  s.type('Name here', 'Pilot MW this quarter');
  s.click('Save override');
  s.eq('override', [kpi(s, m.id).target, kpi(s, m.id).localName, row(s, m.id).crit, row(s, m.id).critTag], [2, 'Pilot MW this quarter', '≥ 2 MW', 'Override']);
  s.click('Actions for Pilot MW this quarter');
  s.click('Unlink');
  s.eq('unlinked', [kpi(s, m.id).linkParent, kpi(s, m.id).name, kpi(s, m.id).target], [null, 'Pilot MW this quarter', 2]);
  s.click('Actions for Pilot MW this quarter');
  s.click('Delete KPI');
  s.click('Delete KPI', { within: 'Delete “Pilot MW this quarter”?' });
  s.expect('KPI deleted.');
  s.eq('gone', !!kpi(s, m.id), false);
  s.clean('sales flows');
});

s.step('Sales: sheet navigation, statistic and sample fields, latest readings', () => {
  s.click('Add KPI', { within: 'kpi-t:all:keyResult:' + KR2 });
  s.click('Back');
  s.click('Add KPI', { within: 'kpi-t:all:keyResult:' + KR2 });
  s.type('Name', 'Proposal win rate');
  s.click('Statistical');
  s.type('Statistic', 'median');
  s.type('Readings come from', '');
  s.type('Read count', '4');
  s.click('Increase');
  s.type('Target', '40');
  s.type('Unit', '%');
  s.key('Target', 'Enter');
  const k = doc(s).kpis.find((x) => x.name === 'Proposal win rate');
  s.eq('saved', [k.statistic, k.readCount, k.target, k.unit, 'readsFrom' in k], ['median', 4, 40, '%', false]);
  s.click('Link a metric', { within: 'kpi-t:all:keyResult:' + KR2 });
  s.click('Direct');
  s.expect('Direct mirrors the target metric: the target is always inherited and the reading rolls up.');
  s.click('Back');
  s.click('Link a metric', { within: 'kpi-t:all:keyResult:' + KR2 });
  s.click('Close');
  s.click('Done');
  s.eq('all closed', s.c.state.sheets.length, 0);
  s.click('Show Qualified pipeline value in the readings panel');
  s.ok(row(s, PV).hl, 'highlighted from the Overview');
});

s.step('Sales: blank blur cancels; range by min / max; a gate links to it and overrides the range', () => {
  closeSheets(s);
  openReadings(s);
  const GATE = 'SG-BD-2026Q4-01-2';
  /* leaving a blank field cancels: only an explicit Enter clears */
  const n0 = readsOf(s, PV).length;
  s.click(POST('Qualified pipeline value'), IN(s));
  s.type('New value for Qualified pipeline value', '');
  s.fire(s.find('New value for Qualified pipeline value', { handler: 'onBlur' }), 'onBlur');
  s.eq('blank blur posts nothing', readsOf(s, PV).length, n0);
  s.ok(!s.has('New value for Qualified pipeline value'), 'editor closed');
  /* Cancel and Close leave without saving */
  s.click('Add KPI', { within: 'kpi-t:all:keyResult:' + KR2 });
  s.type('Name', 'Deal size band');
  s.click('Cancel');
  s.click('Add KPI', { within: 'kpi-t:all:keyResult:' + KR2 });
  s.click('Close');
  s.eq('nothing saved', doc(s).kpis.some((x) => x.name === 'Deal size band'), false);
  s.eq('back on Readings', s.c.state.sheets.map((x) => x.kind), ['kpi.all']);
  /* the Readings sheet stacked on the target sheet: its Close and Back both return to the target sheet */
  s.click('Add KPI', { within: 'kpi-t:all:keyResult:' + KR2 });
  api(s).openAll(s.c, s.c.ctx);
  s.render();
  s.click('Close');
  s.eq('top readings closed', s.c.state.sheets.map((x) => x.kind), ['kpi.all', 'kpi.target']);
  api(s).openAll(s.c, s.c.ctx);
  s.render();
  s.click('Back');
  s.eq('back to the target sheet', s.c.state.sheets.map((x) => x.kind), ['kpi.all', 'kpi.target']);
  /* a range entered as minimum / maximum (normalised) */
  s.type('Name', 'Deal size band');
  s.click('Range');
  s.type('Minimum', '6');
  s.type('Maximum', '2');
  s.expect('Full credit from 2 to 6 (width 4); zero one width outside.');
  s.type('Unit', '$M');
  const ids0 = doc(s).kpis.map((k) => k.id);
  s.click('Save KPI');
  s.expect('KPI saved.');
  const k = doc(s).kpis.find((x) => ids0.indexOf(x.id) < 0);
  s.eq('range record', [k.hostId, k.direction, k.target, k.unit], [KR2, 'range', { lo: 2, hi: 6 }, '$M']);
  s.eq('range target text', row(s, k.id).crit, '2 to 6 $M');
  /* the gate links to the key result's KPI (picked in the tree), then overrides the range */
  s.click('Link a metric', { within: 'kpi-t:all:stageGate:' + GATE });
  s.check((el) => el.tag === 'input' && el.scope && el.scope.kpi_i && el.scope.kpi_i.id === k.id, true);
  const ids1 = doc(s).kpis.map((x) => x.id);
  s.click('Link');
  const m = doc(s).kpis.find((x) => ids1.indexOf(x.id) < 0);
  s.eq('gate member', [m.hostType, m.hostId, m.linkParent, m.linkType, row(s, m.id).crit], ['stageGate', GATE, k.id, 'contribute', '2 to 6 $M']);
  s.click('Edit the override for Deal size band');
  s.click('Back');
  s.click('Edit the override for Deal size band');
  s.click('Close');
  s.click('Edit the override for Deal size band');
  s.click('Cancel');
  s.eq('override sheet closed', s.c.state.sheets.map((x) => x.kind), ['kpi.all']);
  s.click('Edit the override for Deal size band');
  s.expect('Inherited target: 2 to 6 $M.');
  s.type('Override minimum', '3');
  s.type('Override maximum', '5');
  s.click('Save override');
  s.expect('Override saved.');
  s.eq('range override', [kpi(s, m.id).target, row(s, m.id).crit, row(s, m.id).critTag], [{ lo: 3, hi: 5 }, '3 to 5 $M', 'Override']);
  s.click('Edit the override for Deal size band');
  s.click('Delete target', { within: 'Editor' });
  s.click('Delete target', { within: 'Delete “Deal size band”?' });
  s.expect('Target deleted.');
  s.eq('member deleted', !!kpi(s, m.id), false);
  s.click('Actions for Deal size band');
  s.click('Delete KPI');
  s.click('Delete KPI', { within: 'Delete “Deal size band”?' });
  s.eq('definer deleted', !!kpi(s, k.id), false);
  s.clean('sales range override');
});

s.step('Link sheet empty state', () => {
  const saved = s.c.D.portfolio.kpis;
  s.c.D.portfolio.kpis = saved.filter((k) => k.id !== 'KPI-BD-01-1');
  s.render();
  s.click('Link a metric', { within: 'kpi-t:all:keyResult:' + KR2 });
  s.expect('No linkable metric in scope. Define a KPI here, one at the initiative or milestone level, or one on a product or model in this objective’s family.');
  s.eq('Link disabled', s.vals.kpi.lk.canLink, false);
  s.click('Cancel');
  s.c.D.portfolio.kpis = saved;
  s.render();
});

s.step('Read-only in Sales', () => {
  closeSheets(s);
  setRo(s, true);
  s.click('View readings');
  s.ok(!s.has('Add KPI') && !s.has(POST('Qualified pipeline value'), IN(s)), 'editing off');
  s.eq('values visible', row(s, PV).cur, '4 $M');
  setRo(s, false);
});
closeSheets(s);
done();
}
