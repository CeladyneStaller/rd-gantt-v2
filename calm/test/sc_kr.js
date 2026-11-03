/* Scenario tests for the Key results module (X-kr). Run for every board it is built into:
     node test/sc_kr.js out/xkr/Main.dc.html
     node test/sc_kr.js out/xkr/Sales-A.dc.html
   Clicks and types like a person, then checks what is on screen, the document data and the engine numbers.
   At the end it checks that every handler site in mods/kr/*.html was exercised. */
const fs = require('fs');
const path = require('path');
const { Sim, done, load, textOf } = require('./dc');
const RD = require(require('./engine_path'));

const file = process.argv[2] || 'out/xkr/Main.dc.html';
const SALES = /Sales/.test(path.basename(file));
const APPDOC = SALES ? 'BIZ-' : 'EXEC-';
const TODAY = 2477;

/* ---------------------------------------------------------------- helpers */
const fired = new Set();
function track(s) {
  const fire = s.fire.bind(s), type = s.type.bind(s), check = s.check.bind(s);
  s.fire = (el, name, extra) => { fired.add(name.toLowerCase() + '@' + el.line); return fire(el, name, extra); };
  s.type = (q, v, o) => { const el = s.all(q, o).filter((e) => e.on.onChange || e.on.onInput)[(o && o.nth) || 0]; if (el) fired.add((el.on.onChange ? 'onchange' : 'oninput') + '@' + el.line); return type(q, v, o); };
  s.check = (q, on, o) => { const el = s.all(q, o).filter((e) => e.on.onChange || e.on.onClick)[(o && o.nth) || 0]; if (el) fired.add((el.on.onChange ? 'onchange' : 'onclick') + '@' + el.line); return check(q, on, o); };
  s.blur = (q, o) => { const el = s.find(q, Object.assign({ handler: 'onBlur' }, o)); return s.fire(el, 'onBlur'); };
  return s;
}
function sim() { return track(new Sim(file)); }
function nav(s, patch) { s.c.setState(Object.assign({ menu: '', sheets: [] }, patch)); return s.flush(0); }
function tab(s) { return nav(s, { tab: 'krs' }); }
function ctx(s) { return s.c.ctx; }
function doc(s) { return s.c.D.docs[ctx(s).docKey]; }
function em(s) { const c = ctx(s); return RD.withPortfolio(s.c.D.portfolio, { [c.divId]: doc(s) }); }
function obj(s, id) { return s.c.D.portfolio.objectives.find((o) => o.id === (id || ctx(s).objId)); }
function kr(s, id) { return (doc(s).keyResults || []).find((k) => k.id === id); }
function row(s, id) { return (s.vals.kr.rows || []).find((r) => r.id === id); }
function top(s) { const st = s.c.state.sheets || []; return st.length ? st[st.length - 1] : null; }
function toastSeen(s, text) { return (s.c.state.toasts || []).some((t) => t.text === text); }
function band(b) { return { 'on-track': 'On track', 'at-risk': 'At risk', 'off-track': 'Behind', 'no-band': 'No data' }[b]; }
function isoOf(day) { return new Date(Date.UTC(2020, 0, 1) + day * 86400000).toISOString().slice(0, 10); }
function openRow(s, name) { if (s.has('Edit ' + name)) s.click('Edit ' + name); }
function edit(s, tag) { s.click('Actions for ' + tag); return s.click('Edit key result', { within: 'Actions for ' + tag }); }
function hasKpiApi(s, name) { return !!(compiled().KPI && typeof compiled().KPI[name] === 'function'); }
/* compile the board's script once more to reach MODS / KR / KPI directly (search, public API) */
let _cmp = null;
function compiled() {
  if (_cmp) return _cmp;
  const { parsed } = load(file);
  class DCLogic { constructor(p) { this.props = p || {}; this.state = {}; } setState(u) { const v = typeof u === 'function' ? u(this.state) : u; this.state = Object.assign({}, this.state, v); } }
  _cmp = new Function('DCLogic', 'StreamableLogic', 'React', parsed.script + '\n;return { Component: Component, MODS: MODS, KR: (typeof KR !== "undefined" ? KR : null), KPI: (typeof KPI !== "undefined" ? KPI : null) };')(DCLogic, DCLogic, {});
  return _cmp;
}
function expectRowMatchesEngine(s, id, label) {
  const r = row(s, id);
  const o = obj(s);
  const p = RD.keyResultPace(id, o, em(s), TODAY);
  s.ok(!!r, label + ': row present');
  if (!r) return;
  s.eq(label + ': pace word', r.paceWord, band(p.band));
  s.eq(label + ': score', r.score, p.attainment == null ? '—' : String(Math.round(p.attainment)));
  s.eq(label + ': bar width', r.fillStyle, 'width: ' + (p.attainment == null ? 0 : Math.max(0, Math.min(100, Math.round(p.attainment)))) + '%');
  s.eq(label + ': elapsed marker', r.tickStyle, p.elapsed == null ? '' : 'left: calc(' + Math.round(p.elapsed) + '% - 1px)');
  const smp = RD.keyResultSample(id, em(s));
  s.eq(label + ': partial flag', r.partial, !!smp.partial);
  if (smp.partial) {
    const raw = RD.keyResultScore(id, em(s), true);
    s.eq(label + ': without-discount figure', r.ptRaw, Math.round(raw) + ' without the discount');
    s.eq(label + ': samples caption', r.ptSamples, smp.n + ' of ' + smp.expected + ' samples in');
  }
  /* caption rule, today L4550–4554 */
  const att = p.attainment, el = p.elapsed;
  let cap = '';
  if (att != null && att >= 100) cap = 'Target met';
  else if (att != null && el != null) { const gap = Math.round(el - att); cap = gap <= 0 ? (gap === 0 ? 'On pace' : 'Ahead of pace') : gap + (gap === 1 ? ' pt behind pace' : ' pts behind pace'); }
  else if (att != null) cap = 'No objective dates, score only';
  s.eq(label + ': caption', r.capText, cap);
}

const T = {};

/* ===================================================== 1. the Overview's review rows */
/* Since October 15 the Overview's key-result rows are drawn by mods/review (the one review table); this module
   only receives the link: the key result opens expanded and highlighted (kr_focus) on the Key results tab. */
T.overview = () => {
  const s = sim();
  s.step('overview: one review row per key result, its name opens it here', () => {
    s.eq('starts on Overview', s.c.state.tab, 'overview');
    const krs = (doc(s).keyResults || []).filter((k) => k.objectiveId === ctx(s).objId);
    s.ok(krs.length > 0, 'sample objective has key results');
    s.ok(!s.has('Key results summary') && !s.has((el) => el.attrs['data-k'] === 'kr-ov'), 'the old summary panel is gone');
    const rows = s.ns.MODS.review.api.items(s.c, s.c.ctx).filter((it) => it.type === 'kr');
    s.eq('one review row per KR', rows.map((it) => it.id).sort(), krs.map((k) => k.id).sort());
    krs.forEach((k) => {
      const it = rows.find((x) => x.id === k.id);
      const v = RD.keyResultScore(k.id, em(s));
      s.eq('review score ' + k.id, it.row.barVal, v == null ? '—' : Math.round(v) + '%');
      s.eq('review tag ' + k.id, it.row.tid, s.ns.KR.tag(ctx(s), k.id));
      s.expect(k.statement, 'overview lists ' + k.id);
    });
    const first = krs[krs.length - 1];
    s.click((el) => el.tag === 'button' && /\breview-link\b/.test(el.attrs.class || '') && textOf(el).indexOf(first.statement) >= 0);
    s.eq('clicking its name opens the Key results tab', s.c.state.tab, 'krs');
    s.ok(!!s.c.state.kr_open[first.id], 'and expands that key result');
    s.ok(row(s, first.id) && row(s, first.id).exp, 'row shows expanded');
    s.eq('highlighted, and its row button takes focus', [row(s, first.id).itemCls, row(s, first.id).focus], ['kr-item is-focus', true]);
    s.eq('only that one', s.vals.kr.rows.filter((r) => r.focus).length, 1);
    s.flush(9000);
    s.eq('the highlight clears after a few seconds', [s.c.state.kr_focus, row(s, first.id).itemCls], ['', 'kr-item']);
    s.ok(!s.has('Open key results'), 'no "Open key results" button any more (the tab is one click away)');
    s.clean('overview');
  });
};

/* ===================================================== 2. rows vs engine */
T.rows = () => {
  const s = sim();
  tab(s);
  s.step('rows match the engine', () => {
    const krs = (doc(s).keyResults || []).filter((k) => k.objectiveId === ctx(s).objId);
    s.eq('count shown', s.vals.kr.count, String(krs.length));
    let m = 0;
    krs.forEach((k, i) => {
      expectRowMatchesEngine(s, k.id, k.id);
      const tag = k.trackingType === 'milestone' ? 'KR-M' + (++m) : 'KR' + (i + 1);
      s.eq('tag ' + k.id, row(s, k.id).tag, tag);
      s.expect(tag, 'tag visible ' + tag);
    });
    if (!SALES) {
      s.expect('Partial check-in', 'partial check-in tag on KR1');
      s.eq('KR1 detail', row(s, 'KR-EL-2026Q4-01-1').detail, '0 of 2 KPIs on target, 2 partial');
      s.eq('KR3 detail', row(s, 'KR-EL-2026Q4-01-3').detail, '1 of 1 KPI on target');
      s.eq('KR3 is target met', row(s, 'KR-EL-2026Q4-01-3').capText, 'Target met');
      s.eq('KR2 type', row(s, 'KR-EL-2026Q4-01-2').typeLabel, '% completion');
      s.expect('15% of time elapsed', 'elapsed caption');
    } else {
      s.eq('KR-M1 detail', row(s, 'KR-BD-2026Q4-01-1').detail, '1 of 3 steps done');
      s.eq('milestone score (binary credit)', row(s, 'KR-BD-2026Q4-01-1').score, String(Math.round(RD.milestoneKrScore(kr(s, 'KR-BD-2026Q4-01-1')))));
      s.eq('Sales KR2 type', row(s, 'KR-BD-2026Q4-01-2').typeLabel, 'KPI-based');
    }
    s.clean('rows');
  });
  s.step('expand and collapse', () => {
    const id = (doc(s).keyResults || []).filter((k) => k.objectiveId === ctx(s).objId)[0].id;
    s.click((el) => el.tag === 'button' && el.attrs['aria-expanded'] === false && el.parent && el.parent.attrs && /kr-row/.test(el.parent.attrs.class || ''), { within: id });
    s.ok(row(s, id).exp, 'expanded');
    s.click((el) => el.tag === 'button' && el.attrs['aria-expanded'] === true && el.parent && /kr-row/.test((el.parent.attrs || {}).class || ''), { within: id });
    s.ok(!row(s, id).exp, 'collapsed again');
  });
};

/* ===================================================== 3. pace captions */
T.captions = () => {
  const s = sim();
  tab(s);
  s.step('caption variants', () => {
    /* make a % key result at progress 15 on the default objective so elapsed (15%) and attainment line up */
    s.click('Add key result');
    s.type('Statement', 'Pace probe');
    s.type('Progress', '15', { within: 'kr-sheet' });
    s.click('Save key result');
    const id = doc(s).keyResults[doc(s).keyResults.length - 1].id;
    s.eq('probe progress saved', kr(s, id).progress, 15);
    expectRowMatchesEngine(s, id, 'on pace');
    s.eq('on pace caption', row(s, id).capText, 'On pace');
    /* behind pace (at risk): drag the inline slider to 0 */
    s.type('Progress of ' + row(s, id).tag, '0');
    expectRowMatchesEngine(s, id, 'behind');
    s.eq('behind caption', row(s, id).capText, '15 pts behind pace');
    s.eq('at risk word', row(s, id).paceWord, 'At risk');
    s.eq('at risk tone', row(s, id).capCls, 'tx-warn');
    /* well behind (off track): widen the elapsed window */
    const o = obj(s);
    const ps = o.plannedStart, pe = o.plannedEnd;
    o.plannedStart = TODAY - 50; o.plannedEnd = TODAY + 50;
    s.type('Progress of ' + row(s, id).tag, '10');
    expectRowMatchesEngine(s, id, 'off track');
    s.eq('off-track word', row(s, id).paceWord, 'Behind');
    s.eq('off-track tone', row(s, id).capCls, 'tx-bad');
    s.eq('off-track caption', row(s, id).capText, '40 pts behind pace');
    /* no objective dates */
    o.plannedStart = null; o.plannedEnd = null;
    s.render();
    expectRowMatchesEngine(s, id, 'no dates');
    s.eq('no-dates caption', row(s, id).capText, 'No objective dates, score only');
    s.eq('no-dates has no elapsed marker', row(s, id).hasTick, false);
    o.plannedStart = ps; o.plannedEnd = pe;
    s.render();
    s.clean('captions');
  });
};

/* ===================================================== 4. add, validation, edit, Enter/Escape */
T.addEdit = () => {
  const s = sim();
  tab(s);
  const objId = ctx(s).objId;
  s.step('add a key result', () => {
    const before = doc(s).keyResults.map((k) => k.id);
    s.click('Add key result');
    s.eq('sheet kind', top(s).kind, 'kr.edit');
    s.expect('Add key result', 'sheet title');
    s.eq('new KR defaults to % completion', s.vals.kr.sheet.tt, 'percentage');
    s.click('Save key result');
    s.expect('Key result needs a statement.', 'statement required');
    s.eq('nothing saved', doc(s).keyResults.length, before.length);
    s.type('Statement', 'Hold 2 A/cm² for 100 h');
    s.eq('error clears while typing', s.vals.ui.hasSheetErr, false);
    s.type('Progress', '35', { within: 'kr-sheet' });
    s.expect('35%', 'live progress value');
    s.click('Save key result');
    const want = RD.allocId('keyResult', objId, before);
    const k = kr(s, want);
    s.ok(!!k, 'KR created with the engine id ' + want);
    s.eq('fields', k && { objectiveId: k.objectiveId, statement: k.statement, trackingType: k.trackingType, progress: k.progress }, { objectiveId: objId, statement: 'Hold 2 A/cm² for 100 h', trackingType: 'percentage', progress: 35 });
    s.ok(toastSeen(s, 'Key result saved.'), 'toast');
    s.eq('sheet closed', top(s), null);
    s.expect('Hold 2 A/cm² for 100 h', 'new row visible');
    s.ok(row(s, want).exp, 'new row lands expanded');
    const sc = RD.objectiveScore(objId, em(s));
    s.ok(sc != null, 'objective still scores');
    s.flush();
    s.eq('save indicator settles', s.c.state.save.state, 'saved');
    s.clean('after adding');
  });
  s.step('edit with the row menu, save with Enter', () => {
    const id = doc(s).keyResults.filter((k) => k.objectiveId === objId)[0].id;
    const tag = row(s, id).tag;
    s.click('Actions for ' + tag);
    s.ok(row(s, id).menuOpen, 'menu open');
    s.click('Edit key result', { within: 'Actions for ' + tag });
    s.eq('editor for that KR', top(s).data.krId, id);
    s.expect('Edit key result', 'edit title');
    s.type('Statement', 'Renamed key result');
    s.key('Statement', 'Enter');
    s.eq('Enter saves', kr(s, id).statement, 'Renamed key result');
    s.eq('sheet closed', top(s), null);
  });
  s.step('Escape cancels', () => {
    const id = doc(s).keyResults.filter((k) => k.objectiveId === objId)[0].id;
    edit(s, row(s, id).tag);
    s.type('Statement', 'Should not stick');
    s.key('Statement', 'Escape');
    s.expect('Discard your changes?', 'Escape with unsaved edits asks first');
    s.click('Discard changes');
    s.eq('sheet closed', top(s), null);
    s.eq('unchanged', kr(s, id).statement, 'Renamed key result');
    edit(s, row(s, id).tag);
    s.click('Cancel', { within: 'Editor' });
    s.eq('Cancel closes', top(s), null);
    edit(s, row(s, id).tag);
    s.click('Close', { within: 'Editor' });
    s.eq('Close closes', top(s), null);
  });
  s.step('edit from the expanded row', () => {
    const id = doc(s).keyResults.filter((k) => k.objectiveId === objId)[0].id;
    if (!row(s, id).exp) s.click('~' + kr(s, id).statement, { within: id });
    s.click('Edit key result', { within: id });
    s.eq('editor opens from the row', top(s) && top(s).data.krId, id);
    s.click('Cancel', { within: 'Editor' });
  });
};

/* ===================================================== 5. inline progress */
T.inlineProgress = () => {
  const s = sim();
  tab(s);
  s.step('drag the inline progress control', () => {
    let id;
    if (!SALES) id = 'KR-EL-2026Q4-01-2';
    else {
      s.click('Add key result'); s.type('Statement', 'Pilot contracts template ready'); s.click('Save key result');
      id = doc(s).keyResults[doc(s).keyResults.length - 1].id;
    }
    if (!row(s, id).exp) s.click('~' + kr(s, id).statement, { within: id });
    const tag = row(s, id).tag;
    s.type('Progress of ' + tag, '62');
    s.eq('progress written', kr(s, id).progress, 62);
    s.eq('score follows', row(s, id).score, '62');
    s.expect('The objective score follows as you drag.', 'hint');
    s.eq('objective score uses it', RD.objectiveScore(ctx(s).objId, em(s)) != null, true);
    s.type('Progress of ' + tag, '62');
    s.eq('same value is not a change', kr(s, id).progress, 62);
  });
};

/* ===================================================== 6. KPI-based editor */
T.kpiEditor = () => {
  const s = sim();
  tab(s);
  const id = SALES ? 'KR-BD-2026Q4-01-2' : 'KR-EL-2026Q4-01-1';
  const objId = ctx(s).objId;
  s.step('KPI list in the editor', () => {
    edit(s, row(s, id).tag);
    s.eq('tracking type', s.vals.kr.sheet.tt, 'kpi');
    const hosted = doc(s).kpis.filter((k) => k.hostType === 'keyResult' && k.hostId === id);
    s.eq('one row per hosted KPI', s.vals.kr.sheet.kpis.length, hosted.length);
    s.eq('count shown', s.vals.kr.sheet.kpiCount, String(hosted.length));
    s.expect('The key result scores as the mean of all its KPIs; an unmeasured one counts as nothing achieved.', 'hint');
    const first = hosted[0];
    s.expect(first.name, 'KPI name listed');
    s.ok(s.vals.kr.sheet.kpis[0].open || s.vals.kr.sheet.kpis[0].linked, 'first KPI row starts open, as today');
    if (!s.vals.kr.sheet.kpis[0].linked) {
      s.click('Done editing ' + first.name);
      s.ok(!s.vals.kr.sheet.kpis[0].open, 'row closes');
      s.click('Edit ' + first.name);
      s.ok(s.vals.kr.sheet.kpis[0].open, 'row opens');
    }
  });
  if (!SALES) s.step('statistical fields, validation and in-place update', () => {
    const k0 = doc(s).kpis.find((k) => k.id === 'KPI-EL-2026Q4-01-1-1');
    const reads0 = doc(s).kpiUpdates.filter((u) => u.kpiId === k0.id).length;
    s.eq('target type pressed', s.vals.kr.sheet.kpis[0].types.find((t) => t.on === 'true').label, 'Statistical');
    s.eq('direction pressed', s.vals.kr.sheet.kpis[0].dirs.find((t) => t.on === 'true').label, 'Decrease');
    s.eq('read count', s.vals.kr.sheet.kpis[0].readCount, '10');
    s.eq('target', s.vals.kr.sheet.kpis[0].target, '1.85');
    s.type('Read count', 'abc', { within: 'kr-sheet' });
    s.click('Save key result');
    s.expect('Use a whole number of readings for “Cell voltage at 2 A/cm²”, like 10, or leave it blank.', 'read count check');
    s.type('Read count', '12', { within: 'kr-sheet' });
    s.type('Statistic', 'median', { within: 'kr-sheet' });
    s.type('Target', '1,8', { within: 'kr-sheet' });
    s.click('Save key result');
    s.expect('Use a number for the target of “Cell voltage at 2 A/cm²”, like 1.85.', 'target check');
    s.type('Target', '1.8', { within: 'kr-sheet' });
    s.type('Unit', 'V', { within: 'kr-sheet' });
    /* sample borrowing: groups are this objective's statistical KPIs by key result and stage-gate */
    const groups = s.vals.kr.sheet.kpis[0].sampleGroups.map((g) => g.label);
    s.ok(groups.some((g) => /^Key result KR1: /.test(g)), 'KR group offered: ' + groups.join(' | '));
    s.ok(groups.indexOf('Stage-gate SG-A2: Durability screen, 500 h') >= 0, 'gate group labelled SG-A2');
    s.ok(!s.vals.kr.sheet.kpis[0].sampleGroups.some((g) => g.opts.some((o) => o.v === 'KPI-EL-2026Q4-01-1-1')), 'never offers the KPI being edited');
    s.type('Sample', 'KPI-EL-2026Q4-01-5-1', { within: 'kr-sheet' });
    s.click('Save key result');
    const k = doc(s).kpis.find((x) => x.id === 'KPI-EL-2026Q4-01-1-1');
    s.eq('updated in place', { readCount: k.readCount, statistic: k.statistic, target: k.target, direction: k.direction, readsFrom: k.readsFrom, targetType: k.targetType }, { readCount: 12, statistic: 'median', target: 1.8, direction: 'down', readsFrom: 'KPI-EL-2026Q4-01-5-1', targetType: 'statistical' });
    s.eq('readings survive', doc(s).kpiUpdates.filter((u) => u.kpiId === k.id).length, reads0);
    s.ok(toastSeen(s, 'Key result saved.'), 'toast');
    /* back to own readings */
    edit(s, 'KR1');
    openRow(s, 'Cell voltage at 2 A/cm²');
    s.eq('borrowed sample shown', s.vals.kr.sheet.kpis[0].sample, 'KPI-EL-2026Q4-01-5-1');
    s.type('Sample', '', { within: 'kr-sheet' });
    s.click('Save key result');
    s.ok(!('readsFrom' in doc(s).kpis.find((x) => x.id === 'KPI-EL-2026Q4-01-1-1')), 'own readings again');
    edit(s, 'KR1');
  });
  s.step('add, name fallback, binary, remove', () => {
    const before = doc(s).kpis.map((k) => k.id);
    const krSt = kr(s, id).statement;
    s.click('Add KPI', { within: 'kr-sheet' });
    const n = s.vals.kr.sheet.kpis.length;
    s.ok(s.vals.kr.sheet.kpis[n - 1].open, 'new KPI row opens');
    s.type('Name', 'Membrane resistance', { within: 'kr-sheet' });
    s.type('Unit', 'mΩ', { within: 'kr-sheet' });
    s.click('Decrease', { within: 'kpi-' + (n - 1) });
    s.type('Target', '50', { within: 'kr-sheet' });
    s.click('Add KPI', { within: 'kr-sheet' });
    s.click('Binary', { within: 'kpi-' + n });
    s.ok(!s.vals.kr.sheet.kpis[n].notBin, 'binary hides direction and target');
    s.click('Statistical', { within: 'kpi-' + n });
    s.ok(s.vals.kr.sheet.kpis[n].isStat, 'statistical shows read count');
    s.type('Read count', '5', { within: 'kpi-' + n });
    s.type('Statistic', 'cv', { within: 'kpi-' + n });
    s.type('Sample', '', { within: 'kpi-' + n });
    s.eq('statistical draft', { rc: s.c.draft().kpis[n].kpiReadCount, st: s.c.draft().kpis[n].kpiStatistic }, { rc: '5', st: 'cv' });
    s.click('Demonstration', { within: 'kpi-' + n });
    s.click('Binary', { within: 'kpi-' + n });
    s.click('Save key result');
    const id1 = RD.allocId('kpi', objId, before);
    const id2 = RD.allocId('kpi', objId, before.concat([id1]));
    const a = doc(s).kpis.find((k) => k.id === id1), b = doc(s).kpis.find((k) => k.id === id2);
    s.eq('new KPI fields', a && { hostType: a.hostType, hostId: a.hostId, objectiveId: a.objectiveId, name: a.name, unit: a.unit, direction: a.direction, target: a.target, targetType: a.targetType, isDefiner: a.isDefiner }, { hostType: 'keyResult', hostId: id, objectiveId: objId, name: 'Membrane resistance', unit: 'mΩ', direction: 'down', target: 50, targetType: 'demonstration', isDefiner: true });
    s.eq('unnamed KPI takes the statement; binary clears direction/target/unit', b && { name: b.name, targetType: b.targetType, direction: b.direction, target: b.target, unit: b.unit }, { name: krSt, targetType: 'binary', direction: null, target: null, unit: null });
    /* remove a KPI that has readings: asks, then deletes it with its readings on save */
    edit(s, row(s, id).tag);
    const withReads = doc(s).kpis.filter((k) => k.hostType === 'keyResult' && k.hostId === id && doc(s).kpiUpdates.some((u) => u.kpiId === k.id))[0];
    const rc = doc(s).kpiUpdates.filter((u) => u.kpiId === withReads.id).length;
    s.click('Remove KPI ' + withReads.name);
    s.ok(!!s.c.state.dlg, 'asks first');
    s.expect('Its ' + rc + ' reading' + (rc === 1 ? ' is' : 's are') + ' deleted when you save the key result.', 'says what goes');
    s.click('Cancel', { within: 'Remove ' + withReads.name + '?' });
    s.eq('cancel keeps it', s.vals.kr.sheet.kpis.length, doc(s).kpis.filter((k) => k.hostType === 'keyResult' && k.hostId === id).length);
    s.click('Remove KPI ' + withReads.name);
    s.click('Remove KPI', { within: 'Remove ' + withReads.name + '?' });
    s.ok(!s.vals.kr.sheet.kpis.some((k) => k.name === withReads.name), 'gone from the draft');
    s.eq('not yet deleted', doc(s).kpis.some((k) => k.id === withReads.id), true);
    /* a KPI without readings goes without asking */
    s.click('Remove KPI ' + krSt);
    s.eq('no dialog', s.c.state.dlg, null);
    s.click('Save key result');
    s.eq('KPI deleted on save', doc(s).kpis.some((k) => k.id === withReads.id), false);
    s.eq('its readings deleted', doc(s).kpiUpdates.filter((u) => u.kpiId === withReads.id).length, 0);
    s.eq('blank-named binary KPI deleted', doc(s).kpis.some((k) => k.id === id2), false);
    /* the last KPI cannot go */
    edit(s, row(s, id).tag);
    while (s.vals.kr.sheet.kpis.length > 1) {
      const nm = s.vals.kr.sheet.kpis[s.vals.kr.sheet.kpis.length - 1].name;
      s.click('Remove KPI ' + nm);
      if (s.c.state.dlg) s.click('Remove KPI', { within: 'Remove ' + nm + '?' });
    }
    s.click('Remove KPI ' + s.vals.kr.sheet.kpis[0].name);
    s.expect('A KPI-based key result needs at least one KPI. To drop them all, change the tracking type.', 'last KPI stays');
    s.eq('still one row', s.vals.kr.sheet.kpis.length, 1);
    s.click('Cancel', { within: 'Editor' });
    s.clean('kpi editor');
  });
  s.step('a range KPI keeps its range in the key result editor', () => {
    const k = doc(s).kpis.find((x) => x.hostType === 'keyResult' && x.hostId === id);
    k.direction = 'range'; k.target = { lo: 6, hi: 10 }; k.rangeSpec = { mode: 'pct', center: 8, pct: 25 }; delete k.statistic; k.targetType = 'demonstration';
    s.render();
    edit(s, row(s, id).tag);
    const r = s.vals.kr.sheet.kpis.find((x) => x.name === k.name);
    s.eq('summary shows the range', r.summary, '6 to 10' + (k.unit ? ' ' + k.unit : ''));
    openRow(s, k.name);
    s.ok(s.vals.kr.sheet.kpis.find((x) => x.name === k.name).isRange, 'range inputs shown');
    s.click('Save key result');
    s.eq('untouched range survives a save', { d: k.direction, t: k.target, rs: k.rangeSpec }, { d: 'range', t: { lo: 6, hi: 10 }, rs: { mode: 'pct', center: 8, pct: 25 } });
    edit(s, row(s, id).tag); openRow(s, k.name);
    s.type('Low end', '7', { within: 'kr-sheet' });
    s.type('High end', '', { within: 'kr-sheet' });
    s.click('Save key result');
    s.expect('Enter both ends of the range for “' + k.name + '”, or clear both.', 'both ends');
    s.type('High end', '5', { within: 'kr-sheet' });
    s.click('Save key result');
    s.expect('The low end of the range for “' + k.name + '” is above the high end. Swap them.', 'order check');
    s.type('High end', 'x', { within: 'kr-sheet' });
    s.click('Save key result');
    s.expect('Use numbers for the range of “' + k.name + '”, like 6 and 10.', 'number check');
    s.type('High end', '11', { within: 'kr-sheet' });
    s.click('Save key result');
    s.eq('edited range saved', { d: k.direction, t: k.target, rs: k.rangeSpec }, { d: 'range', t: { lo: 7, hi: 11 }, rs: { mode: 'minmax' } });
    edit(s, row(s, id).tag); openRow(s, k.name);
    s.click('Increase', { within: 'kr-sheet' });
    s.type('Target', '9', { within: 'kr-sheet' });
    s.click('Save key result');
    s.eq('switched to a plain target', { d: k.direction, t: k.target, rs: 'rangeSpec' in k }, { d: 'up', t: 9, rs: false });
  });
  s.step('a linked KPI is listed but not rewritten', () => {
    const d = doc(s);
    const host = SALES ? 'KR-BD-2026Q4-01-2' : 'KR-EL-2026Q4-01-3';
    const k = d.kpis.find((x) => x.hostType === 'keyResult' && x.hostId === host);
    if (!k.linkParent) { k.linkParent = 'KPI-BD-01-1'; k.linkType = 'contribute'; }
    const snap = JSON.stringify(k);
    s.render();
    edit(s, row(s, host).tag);
    const r = s.vals.kr.sheet.kpis[0];
    s.ok(r.linked, 'flagged as linked');
    s.ok(/^Linked to /.test(r.summary), 'says what it links to: ' + r.summary);
    s.ok(!r.canToggle, 'no field editing for a linked KPI');
    s.type('Statement', kr(s, host).statement + ' ');
    s.click('Save key result');
    s.eq('linked KPI unchanged by the save', JSON.stringify(d.kpis.find((x) => x.id === k.id)), snap);
  });
};

/* ===================================================== 7. milestone steps: drawer and editor */
T.milestones = () => {
  const s = sim();
  const id = SALES ? 'KR-BD-2026Q4-01-1' : 'KR-EL-2026Q4-02-2';
  if (!SALES) nav(s, { objId: 'OBJ-EL-2026Q4-02', tab: 'krs' }); else tab(s);
  s.step('drawer', () => {
    const k = kr(s, id);
    s.eq('KR-M chip', row(s, id).tag, 'KR-M1');
    s.ok(k.steps.every((x) => typeof x.due === 'string'), 'step due dates are ISO strings, as in the real documents');
    s.click('~' + k.statement, { within: id });
    const ms = row(s, id).ms;
    s.eq('mode word', ms.modeWord, k.creditMode === 'partial' ? 'Partial credit' : 'Binary credit');
    s.expect('Update status here. Names, weights and due dates are edited in the key result.', 'drawer hint');
    const eff = RD.milestoneEffectiveWeights(k.steps);
    s.eq('weights', ms.rows.map((r) => r.weight), eff.map((e) => e.w.toFixed(e.auto ? 1 : 0) + '%'));
    s.eq('auto flags', ms.rows.map((r) => r.auto), eff.map((e) => e.auto));
    s.eq('sum of weights', ms.sum, eff.reduce((a, e) => a + e.w, 0).toFixed(0) + '%');
    s.eq('due dates', ms.rows.map((r) => r.due), k.steps.map((x) => { const t = Date.parse(x.due + 'T00:00:00Z'); const d = new Date(t); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCDate(); }));
    s.eq('score is the engine milestone score', row(s, id).score, String(Math.round(RD.milestoneKrScore(k))));
    if (k.creditMode === 'partial') {
      s.eq('contributions', ms.rows.map((r) => r.contrib), k.steps.map((x, i) => RD.milestoneStepContribution(x, eff[i].w, 'partial').toFixed(1) + '%'));
      const st = k.steps[1];
      s.click('Completion of ' + st.name + ', in %');
      s.ok(row(s, id).ms.rows[1].editing, 'inline edit opens');
      s.type('Completion of ' + st.name + ', in %', 'abc');
      s.key('Completion of ' + st.name + ', in %', 'Enter');
      s.ok(toastSeen(s, 'Use a number from 0 to 100, like 60.'), 'rejects a non-number');
      s.ok(row(s, id).ms.rows[1].editing, 'still editing');
      s.key('Completion of ' + st.name + ', in %', 'Escape');
      s.eq('Escape cancels', st.completion, 60);
      s.click('Completion of ' + st.name + ', in %');
      s.type('Completion of ' + st.name + ', in %', '75');
      s.key('Completion of ' + st.name + ', in %', 'Enter');
      s.eq('Enter saves', st.completion, 75);
      s.eq('score follows', row(s, id).score, String(Math.round(RD.milestoneKrScore(k))));
      s.click('Completion of ' + st.name + ', in %');
      s.type('Completion of ' + st.name + ', in %', '140');
      s.blur('Completion of ' + st.name + ', in %');
      s.eq('blur saves, clamped to 100 like today', st.completion, 100);
      s.eq('done count', row(s, id).detail, '2 of 3 steps done');
    } else {
      const st = k.steps[1];
      s.check('Done: ' + st.name, true);
      s.eq('checkbox marks it 100', st.completion, 100);
      s.eq('done count', row(s, id).detail, '2 of 3 steps done');
      s.eq('score follows', row(s, id).score, String(Math.round(RD.milestoneKrScore(k))));
      s.check('Done: ' + st.name, false);
      s.eq('unchecking sets 0', st.completion, 0);
    }
    s.clean('drawer');
  });
  s.step('editor: credit mode, add, reorder, remove, validate, save', () => {
    const k = kr(s, id);
    edit(s, 'KR-M1');
    s.eq('tracking type', s.vals.kr.sheet.tt, 'milestone');
    s.eq('steps listed', s.vals.kr.sheet.steps.length, k.steps.length);
    s.eq('due shown as ISO', s.vals.kr.sheet.steps[0].due, k.steps[0].due);
    /* both credit modes, in both apps (Execution saved neither mode nor steps before) */
    s.click('Partial', { within: 'kr-sheet' });
    s.expect('Weight scales by % complete.', 'partial credit hint');
    s.eq('partial shows a completion column', s.vals.kr.sheet.compHead, 'Completion');
    s.click('Binary', { within: 'kr-sheet' });
    s.expect('Full weight only when a step is done, strictly at 100%.', 'binary credit hint');
    s.eq('binary shows a done column', s.vals.kr.sheet.compHead, 'Done');
    s.click('Add step');
    const n = s.vals.kr.sheet.steps.length;
    s.eq('new step id', s.c.draft().steps[n - 1].id, 'ST-' + n);
    s.type('Name of step ' + n, 'Supplier audit');
    s.type('Due date of “Supplier audit”', '2026-10-01');
    s.click('Move “Supplier audit” up');
    s.eq('moved up', s.c.draft().steps[n - 2].name, 'Supplier audit');
    s.click('Move “Supplier audit” down');
    s.eq('moved down', s.c.draft().steps[n - 1].name, 'Supplier audit');
    s.drag((el) => el.on.onDragStart && el.parent && el.parent.parent && el.parent.parent.attrs['data-k'] === 'step-' + (n - 1), (el) => el.attrs['data-k'] === 'step-0');
    s.eq('dragged to the top', s.c.draft().steps[0].name, 'Supplier audit');
    s.eq('drop target cleared', s.c.state.kr_hot, -1);
    s.drag((el) => el.on.onDragStart && el.parent && el.parent.parent && el.parent.parent.attrs['data-k'] === 'step-0', (el) => el.attrs['data-k'] === 'step-' + (n - 1));
    s.eq('dragged back to the end', s.c.draft().steps[n - 1].name, 'Supplier audit');
    s.type('Weight of “Supplier audit”, in %', 'x');
    s.click('Save key result');
    s.expect('Use a number for the weight of “Supplier audit”, like 25, or leave it blank to share what is left.', 'weight check');
    s.type('Weight of “Supplier audit”, in %', '110');
    s.eq('over 100 warns', s.vals.kr.sheet.sumWarn, true);
    s.expect('The weights you set add up to more than 100%. Lower them so the steps total 100%.', 'over-100 hint');
    s.type('Weight of “Supplier audit”, in %', '');
    s.eq('back to an even split', s.vals.kr.sheet.sumText, '100.0% of 100%');
    const nm2 = k.steps[1].name;
    s.check('Done: “' + nm2 + '”', true);
    s.eq('done sets 100 in the draft', s.c.draft().steps[1].completion, '100');
    s.check('Done: “' + nm2 + '”', false);
    s.eq('not done sets 0', s.c.draft().steps[1].completion, '0');
    s.click('Partial', { within: 'kr-sheet' });
    s.type('Completion of “' + nm2 + '”, in %', 'abc');
    s.click('Save key result');
    s.expect('Use a completion from 0 to 100 for “' + nm2 + '”, like 60.', 'completion check');
    s.type('Completion of “' + nm2 + '”, in %', '50');
    if (!SALES) s.click('Binary', { within: 'kr-sheet' });
    s.type('Due date of “' + nm2 + '”', '11/20/2026');
    s.click('Save key result');
    s.expect('Use a date like 2026-11-20 for “' + nm2 + '”, or leave it blank.', 'date check');
    s.type('Due date of “' + nm2 + '”', '2026-11-20');
    s.click('Remove “Supplier audit”');
    s.eq('removed', s.c.draft().steps.length, n - 1);
    s.click('Add step');
    s.type('Name of step ' + n, 'Supplier audit');
    s.type('Due date of “Supplier audit”', '2026-10-01');
    s.click('Save key result');
    const saved = kr(s, id);
    s.eq('credit mode saved', saved.creditMode, SALES ? 'partial' : 'binary');
    s.eq('steps saved in the real shape', saved.steps[n - 1], { id: 'ST-' + n, name: 'Supplier audit', weight: null, due: '2026-10-01', completion: 0 });
    s.eq('step 2', { due: saved.steps[1].due, completion: saved.steps[1].completion }, { due: '2026-11-20', completion: 50 });
    s.ok(saved.steps.every((x) => Object.keys(x).join(',') === 'id,name,weight,due,completion'), 'only the real step fields');
    s.eq('score from the engine', row(s, id).score, String(Math.round(RD.milestoneKrScore(saved))));
    s.ok(!('progress' in saved) && !('subKrs' in saved), 'no stray % or sub-KR fields');
    /* overdue: an unfinished step past its due date */
    s.ok(row(s, id).ms.rows[n - 1].overdue, 'past-due unfinished step is overdue');
    s.expect('Overdue', 'overdue shown');
    if (!SALES) {
      s.check('Done: Supplier audit', true);
      s.eq('drawer checkbox (binary credit) marks it done', kr(s, id).steps[n - 1].completion, 100);
      s.ok(!row(s, id).ms.rows[n - 1].overdue, 'done is never overdue');
    } else {
      s.click('Completion of Supplier audit, in %');
      s.type('Completion of Supplier audit, in %', '40');
      s.blur('Completion of Supplier audit, in %');
      s.eq('drawer % input saves on blur', kr(s, id).steps[n - 1].completion, 40);
      s.click('Completion of Supplier audit, in %');
      s.type('Completion of Supplier audit, in %', '100');
      s.key('Completion of Supplier audit, in %', 'Enter');
      s.eq('drawer % input (partial credit) marks it done', kr(s, id).steps[n - 1].completion, 100);
    }
    s.clean('milestone editor');
  });
  s.step('a milestone key result with no steps', () => {
    s.click('Add key result');
    s.type('Statement', 'Ship the field kit');
    s.type('Tracking type', 'milestone', { within: 'kr-sheet' });
    s.expect('No steps yet. Add the accomplishments that complete this key result.', 'editor empty state');
    s.click('Save key result');
    const nk = doc(s).keyResults[doc(s).keyResults.length - 1];
    s.eq('saved with no steps', { tt: nk.trackingType, steps: nk.steps, cm: nk.creditMode }, { tt: 'milestone', steps: [], cm: 'binary' });
    s.eq('no score, no data', row(s, nk.id).paceWord, 'No data');
    s.eq('KR-M2 chip', row(s, nk.id).tag, 'KR-M2');
    s.expect('No steps yet.', 'drawer empty state');
    s.click('Add steps in the key result');
    s.eq('opens its editor', top(s).data.krId, nk.id);
    s.click('Add step');
    s.type('Name of step 1', 'Kit assembled');
    s.ok(!s.vals.kr.sheet.steps[0].canRemove, 'the only step has no remove button');
    s.click('Save key result');
    s.eq('one step', kr(s, nk.id).steps.length, 1);
  });
  s.step('steps without ids (older records) get unique ids when edited', () => {
    const d = doc(s);
    d.keyResults.push({ id: 'KR-TEST-NOIDS', objectiveId: ctx(s).objId, statement: 'Old checklist', trackingType: 'milestone', creditMode: 'binary',
      steps: [{ name: 'One', completion: 100 }, { name: 'Two', completion: 0 }, { id: 'ST-1', name: 'Three', completion: 0 }, { id: 'ST-1', name: 'Four', completion: 0 }] });
    s.render();
    edit(s, row(s, 'KR-TEST-NOIDS').tag);
    s.click('Save key result');
    const ids = kr(s, 'KR-TEST-NOIDS').steps.map((x) => x.id);
    s.eq('unique ids', new Set(ids).size, 4);
    s.eq('existing id kept', ids[2], 'ST-1');
    s.eq('score unchanged by the ids', row(s, 'KR-TEST-NOIDS').score, '25');
  });
};

/* ===================================================== 8. duplicate */
T.duplicate = () => {
  const s = sim();
  tab(s);
  const objId = ctx(s).objId;
  s.step('duplicate a KPI-based key result', () => {
    const id = SALES ? 'KR-BD-2026Q4-01-2' : 'KR-EL-2026Q4-01-1';
    const before = doc(s).keyResults.map((k) => k.id);
    const kpisBefore = doc(s).kpis.filter((k) => k.hostType === 'keyResult' && k.hostId === id);
    const readsBefore = doc(s).kpiUpdates.length;
    s.click('Actions for ' + row(s, id).tag);
    s.click('Duplicate');
    const nid = RD.allocId('keyResult', objId, before);
    const c = kr(s, nid);
    s.ok(!!c, 'copy created ' + nid);
    s.eq('copy statement', c && c.statement, kr(s, id).statement + ' (copy)');
    s.eq('copy type', c && c.trackingType, 'kpi');
    s.ok(c && !('progress' in c), 'no stray progress on a KPI-based copy');
    const copies = doc(s).kpis.filter((k) => k.hostType === 'keyResult' && k.hostId === nid);
    s.eq('KPIs copied', copies.map((k) => [k.name, k.target, k.direction, k.unit, k.targetType]), kpisBefore.map((k) => [k.name, k.target, k.direction, k.unit, k.targetType]));
    s.ok(copies.every((k) => kpisBefore.every((o) => o.id !== k.id)), 'with new ids');
    s.eq('no readings copied', doc(s).kpiUpdates.length, readsBefore);
    s.ok(toastSeen(s, 'Key result duplicated.'), 'toast');
    s.eq('lands on the copy (editor open on it)', top(s) && top(s).data.krId, nid);
    s.ok(s.c.state.kr_open[nid], 'copy expanded in the list');
    s.click('Cancel', { within: 'Editor' });
  });
  s.step('duplicate a milestone key result resets completion', () => {
    if (!SALES) nav(s, { objId: 'OBJ-EL-2026Q4-02', tab: 'krs' });
    const id = SALES ? 'KR-BD-2026Q4-01-1' : 'KR-EL-2026Q4-02-2';
    const src = kr(s, id);
    s.click('Actions for KR-M1');
    s.click('Duplicate');
    const c = doc(s).keyResults[doc(s).keyResults.length - 1];
    s.eq('steps copied with completion 0', c.steps.map((x) => [x.id, x.name, x.weight, x.due, x.completion]), src.steps.map((x) => [x.id, x.name, x.weight, x.due, 0]));
    s.eq('credit mode copied', c.creditMode, src.creditMode);
    s.eq('original untouched', src.steps.map((x) => x.completion).some((v) => v > 0), true);
    s.eq('copy is KR-M2', row(s, c.id).tag, 'KR-M2');
    s.click('Cancel', { within: 'Editor' });
  });
  s.step('duplicate from the sheet with unsaved edits asks first', () => {
    const list = doc(s).keyResults.filter((k) => k.objectiveId === ctx(s).objId);
    const id = list[0].id;
    edit(s, row(s, id).tag);
    s.type('Statement', 'Unsaved wording');
    s.click('Duplicate', { within: 'Editor' });
    s.expect('Duplicate the saved key result?', 'asks');
    s.click('Duplicate', { within: 'Duplicate the saved key result?' });
    const c = doc(s).keyResults[doc(s).keyResults.length - 1];
    s.eq('copied from the saved version', c.statement, list[0].statement + ' (copy)');
    s.eq('original not changed', kr(s, id).statement, list[0].statement);
    s.eq('editor now on the copy', top(s).data.krId, c.id);
    s.click('Duplicate', { within: 'Editor' });
    s.eq('clean sheet duplicates straight away', doc(s).keyResults[doc(s).keyResults.length - 1].statement, c.statement + ' (copy)');
    s.click('Cancel', { within: 'Editor' });
  });
  s.step('a key result with no tracking type stays KPI-based', () => {
    const k = doc(s).keyResults.filter((x) => x.objectiveId === ctx(s).objId)[0];
    const keep = k.trackingType;
    delete k.trackingType;
    s.render();
    s.click('Actions for ' + row(s, k.id).tag); s.click('Duplicate');
    s.eq('copy is KPI-based (today it became % completion)', doc(s).keyResults[doc(s).keyResults.length - 1].trackingType, 'kpi');
    s.click('Cancel', { within: 'Editor' });
    k.trackingType = keep;
  });
};

/* ===================================================== 9. delete */
T.del = () => {
  const s = sim();
  tab(s);
  s.step('delete cascades and says what goes', () => {
    const d = doc(s);
    const id = SALES ? 'KR-BD-2026Q4-01-2' : 'KR-EL-2026Q4-01-1';
    const own = d.kpis.filter((k) => k.hostType === 'keyResult' && k.hostId === id);
    const ids = own.map((k) => k.id);
    /* a gate KPI linked to one of this KR's KPIs, and one that borrows its sample */
    const gate = d.stageGates.find((g) => g.objectiveId === ctx(s).objId);
    d.kpis.push({ id: 'KPI-TEST-MEMBER', objectiveId: ctx(s).objId, hostType: 'stageGate', hostId: gate.id, linkParent: ids[0], linkType: 'contribute', linkPriority: 1, name: null, direction: null, unit: null, target: null, order: 5 });
    d.kpis.push({ id: 'KPI-TEST-BORROW', objectiveId: ctx(s).objId, hostType: 'stageGate', hostId: gate.id, name: 'Borrowed spread', targetType: 'statistical', statistic: 'cv', readsFrom: ids[0], direction: 'down', target: 5, unit: '%', order: 6 });
    s.render();
    const reads = d.kpiUpdates.filter((u) => ids.indexOf(u.kpiId) >= 0).length;
    const tag = row(s, id).tag;
    s.click('Actions for ' + tag);
    s.click('Delete key result');
    s.expect('Delete ' + tag + '?', 'confirm title');
    const body = s.c.state.dlg.body;
    s.ok(body.indexOf(own.length === 1 ? 'with its KPI ' + own[0].name : 'with its ' + own.length + ' KPIs') >= 0, 'names the KPIs: ' + body);
    s.ok(reads ? body.indexOf(reads + (reads === 1 ? ' reading' : ' readings')) >= 0 : true, 'counts the readings');
    s.ok(body.indexOf('1 KPI elsewhere that links to it') >= 0, 'names the linked KPI elsewhere');
    s.ok(body.indexOf('1 KPI that borrows its sample (Borrowed spread) goes back to its own readings.') >= 0, 'names the borrower');
    if (!SALES) s.ok(body.indexOf('The milestone target Cell voltage at 2 A/cm² will stop reading from it.') >= 0, 'names the milestone target fed by it');
    s.click('Cancel', { within: 'Delete ' + tag + '?' });
    s.ok(!!kr(s, id), 'cancel keeps it');
    const pool = d.kpis.concat(s.c.D.portfolio.kpis);
    const member = d.kpis.find((k) => k.id === 'KPI-TEST-MEMBER');
    const inherited = { name: RD.kpiName(member, pool), direction: RD.kpiDirection(member, pool), unit: RD.kpiUnit(member, pool), target: RD.effTarget(member, pool) };
    s.click('Actions for ' + tag);
    s.click('Delete key result');
    s.click('Delete key result', { within: 'Delete ' + tag + '?' });
    const d2 = doc(s);
    s.eq('KR gone', !!kr(s, id), false);
    s.eq('its KPIs gone', d2.kpis.filter((k) => ids.indexOf(k.id) >= 0).length, 0);
    s.eq('their readings gone', d2.kpiUpdates.filter((u) => ids.indexOf(u.kpiId) >= 0).length, 0);
    const m2 = d2.kpis.find((k) => k.id === 'KPI-TEST-MEMBER');
    s.eq('linked KPI keeps what it inherited and stands alone', { name: m2.name, direction: m2.direction, unit: m2.unit, target: m2.target, linkParent: m2.linkParent }, Object.assign({}, inherited, { linkParent: null }));
    s.ok(!('readsFrom' in d2.kpis.find((k) => k.id === 'KPI-TEST-BORROW')), 'borrower back to own readings');
    s.ok(toastSeen(s, 'Key result deleted.'), 'toast');
    s.ok(!(id in s.c.state.kr_open), 'expansion state cleaned');
    const left = d2.keyResults.filter((k) => k.objectiveId === ctx(s).objId);
    if (left.length) s.eq('renumbered', row(s, left[0].id).tag, left[0].trackingType === 'milestone' ? 'KR-M1' : 'KR1');
    s.clean('after delete');
  });
  s.step('delete from the sheet', () => {
    const left = doc(s).keyResults.filter((k) => k.objectiveId === ctx(s).objId);
    const id = left[left.length - 1].id;
    const tag = row(s, id).tag;
    edit(s, tag);
    s.click('Delete key result', { within: 'Editor' });
    s.click('Delete key result', { within: 'Delete ' + tag + '?' });
    s.eq('deleted', !!kr(s, id), false);
    s.eq('sheet closed', top(s), null);
    s.ok(s.vals.kr.none || s.vals.kr.rows.length === left.length - 1, 'list updated');
  });
  s.step('empty state', () => {
    const d = doc(s);
    d.keyResults = d.keyResults.filter((k) => k.objectiveId !== ctx(s).objId);
    s.render();
    s.expect('No key results yet. A key result groups the KPIs that score this objective; without one, the objective has no score.', 'empty state text');
    s.expect('Add one to start scoring.', 'invites the next action');
    nav(s, { tab: 'overview' });
    s.expect('No key results yet. Without one the objective has no score.', 'overview empty state (the review table)');
    s.click('Add key result', { within: 'review' });
    s.eq('overview add opens the editor', top(s) && top(s).kind, 'kr.edit');
  });
};

/* ===================================================== 10. legacy sub-key results */
T.legacy = () => {
  const s = sim();
  let id;
  if (!SALES) { nav(s, { divId: 'DIV-FC', objId: 'OBJ-FC-2026Q4-03', tab: 'krs' }); id = 'KR-FC-2026Q4-03-1'; }
  else {
    tab(s);
    id = 'KR-BD-2026Q4-01-9';
    doc(s).keyResults.push({ id: id, objectiveId: ctx(s).objId, statement: 'Legacy pilot readiness', trackingType: 'subkr',
      subKrs: [{ name: 'Template signed', weight: 1, trackingType: 'percentage', progress: 50 }, { name: 'Sites surveyed', weight: 2, trackingType: 'kpi', kpis: [{ type: 'kpi', targetType: 'demonstration', name: 'Sites surveyed', current: 2, direction: 'up', target: 4, unit: 'sites' }] }] });
    s.render();
  }
  s.step('display and score', () => {
    const k = kr(s, id);
    s.eq('type label', row(s, id).typeLabel, 'Sub-key results (legacy)');
    s.eq('score is RD.subKrScore', row(s, id).score, String(Math.round(RD.subKrScore(k.subKrs))));
    expectRowMatchesEngine(s, id, 'legacy');
    s.click('~' + k.statement, { within: id });
    const subs = row(s, id).subs;
    s.eq('sub rows', subs.map((x) => x.name), k.subKrs.map((x) => x.name));
    s.eq('sub scores', subs.map((x) => x.score), k.subKrs.map((x) => { const v = RD.subKrScore([x]); return v == null ? '—' : String(Math.round(v)); }));
    if (!SALES) {
      s.expect('Demonstration, target ≥ 1.2 A/cm²', 'embedded target');
      s.expect('Now 0.22 A/cm²', 'embedded value');
    }
    s.clean('legacy display');
  });
  s.step('editor and sub-KR sheet', () => {
    const k = kr(s, id);
    edit(s, row(s, id).tag);
    s.ok(s.vals.kr.sheet.typeOpts.some((o) => o.v === 'subkr'), 'legacy option offered for a legacy KR');
    s.eq('list', s.vals.kr.sheet.subs.length, k.subKrs.length);
    s.click('Add sub-key result');
    s.eq('pushed sheet', top(s).kind, 'kr.sub');
    s.ok(s.vals.ui.sheetBack, 'back button available');
    s.click('Save sub-key result');
    s.expect('Give the sub-key result a name.', 'name required');
    s.type('Name', 'Ionomer dispersion stability', { within: 'kr-sub' });
    s.type('Weight', '0.05', { within: 'kr-sub' });
    s.click('Save sub-key result');
    s.expect('Use a weight of 0.1 or more, like 1.', 'weight minimum');
    s.type('Weight', '1.5', { within: 'kr-sub' });
    s.click('Statistical', { within: 'kr-sub' });
    s.type('Read count', '4', { within: 'kr-sub' });
    s.type('Statistic', 'median', { within: 'kr-sub' });
    s.click('Decrease', { within: 'kr-sub' });
    s.type('Target', '2', { within: 'kr-sub' });
    s.type('Unit', 'cP', { within: 'kr-sub' });
    s.type('Readings, newest first', '1.02, 0.98, 1.05,');
    s.expect('Median: 1.02 from 3 readings', 'live preview (a trailing comma is not a reading)');
    s.click('Save sub-key result');
    s.eq('back on the key result sheet', top(s).kind, 'kr.edit');
    s.eq('draft has the new sub', s.vals.kr.sheet.subs.length, k.subKrs.length + 1);
    s.click('Edit sub-key result ' + k.subKrs[0].name);
    s.eq('edit opens', top(s).data.idx, 0);
    s.click('Binary', { within: 'kr-sub' });
    s.click('Met', { within: 'kr-sub' });
    s.click('Save sub-key result');
    s.click('Edit sub-key result ' + k.subKrs[1].name);
    s.click('Demonstration', { within: 'kr-sub' });
    s.type('Current measurement', 'abc', { within: 'kr-sub' });
    s.click('Save sub-key result');
    s.expect('Use a number for the current measurement, like 0.22, or leave it blank.', 'current check');
    s.type('Current measurement', '0.9', { within: 'kr-sub' });
    s.type('Target', 'x', { within: 'kr-sub' });
    s.click('Save sub-key result');
    s.expect('Use a number for the target, like 1.2.', 'target check');
    s.type('Target', '1.2', { within: 'kr-sub' });
    s.click('Increase', { within: 'kr-sub' });
    s.click('Save sub-key result');
    s.click('Add sub-key result');
    s.type('Name', 'Throwaway', { within: 'kr-sub' });
    s.click('% completion', { within: 'kr-sub' });
    s.type('Sub-key result progress', '30');
    s.expect('30%', 'live progress');
    s.click('Statistical', { within: 'kr-sub' });
    s.type('Read count', '2.5', { within: 'kr-sub' });
    s.click('Save sub-key result');
    s.expect('Use a whole number of readings, like 10, or leave it blank.', 'read count check');
    s.click('Cancel', { within: 'Editor' });
    s.eq('cancel returns to the key result', top(s).kind, 'kr.edit');
    s.click('Add sub-key result');
    s.type('Name', 'Throwaway', { within: 'kr-sub' });
    s.key('Name', 'Enter', { within: 'kr-sub' });
    s.eq('Enter saves the sub-key result', s.vals.kr.sheet.subs.length, k.subKrs.length + 2);
    s.click('Remove sub-key result Throwaway');
    s.click('Add sub-key result');
    s.key('Name', 'Escape', { within: 'kr-sub' });
    s.eq('Escape goes back', top(s).kind, 'kr.edit');
    s.click('Add sub-key result');
    s.click('Back');
    s.eq('Back goes back', top(s).kind, 'kr.edit');
    s.click('Add sub-key result');
    s.click('Close', { within: 'Editor' });
    s.eq('Close on the sub sheet goes back too', top(s).kind, 'kr.edit');
    s.click('Save key result');
    const saved = kr(s, id).subKrs;
    s.eq('three sub-KRs saved', saved.length, 3);
    s.eq('binary sub', { tt: saved[0].trackingType, k: saved[0].kpis[0].targetType, cur: saved[0].kpis[0].current }, { tt: 'kpi', k: 'binary', cur: 1 });
    s.eq('demonstration sub', { cur: saved[1].kpis[0].current, t: saved[1].kpis[0].target, d: saved[1].kpis[0].direction }, { cur: 0.9, t: 1.2, d: 'up' });
    const st = saved[2];
    s.eq('statistical sub', { name: st.name, weight: st.weight, tt: st.trackingType, k: { type: st.kpis[0].type, targetType: st.kpis[0].targetType, statistic: st.kpis[0].statistic, readCount: st.kpis[0].readCount, direction: st.kpis[0].direction, target: st.kpis[0].target, unit: st.kpis[0].unit, readings: st.kpis[0].readings, current: st.kpis[0].current } },
      { name: 'Ionomer dispersion stability', weight: 1.5, tt: 'kpi', k: { type: 'statistical', targetType: 'statistical', statistic: 'median', readCount: 4, direction: 'down', target: 2, unit: 'cP', readings: '1.02, 0.98, 1.05,', current: 1.02 } });
    s.eq('score follows', row(s, id).score, String(Math.round(RD.subKrScore(saved))));
    s.clean('legacy editor');
  });
  s.step('switching away from legacy and back before saving', () => {
    edit(s, row(s, id).tag);
    s.type('Tracking type', 'percentage', { within: 'kr-sheet' });
    s.ok(s.vals.kr.sheet.typeOpts.some((o) => o.v === 'subkr'), 'legacy option stays available');
    s.type('Tracking type', 'subkr', { within: 'kr-sheet' });
    s.eq('sub list intact', s.vals.kr.sheet.subs.length, 3);
    s.type('Tracking type', 'kpi', { within: 'kr-sheet' });
    s.eq('KPI-based starts with one KPI row', s.vals.kr.sheet.kpis.length, 1);
    s.click('Cancel', { within: 'Editor' });
  });
};

/* ===================================================== 11. KPI table hand-off, link and connect */
T.kpiTable = () => {
  const s = sim();
  tab(s);
  const id = SALES ? 'KR-BD-2026Q4-01-2' : 'KR-EL-2026Q4-01-1';
  s.step('KPI table inside an expanded key result', () => {
    s.click('~' + kr(s, id).statement, { within: id });
    const kt = row(s, id).kt;
    s.ok(kt && Array.isArray(kt.rows), 'KPI.table view model');
    s.eq('one row per hosted KPI', kt.rows.length, doc(s).kpis.filter((k) => k.hostType === 'keyResult' && k.hostId === id).length);
    s.click('Add KPI', { within: id });
    s.ok(top(s) && /^kpi\./.test(top(s).kind), 'Add KPI opens the KPI sheet (' + (top(s) && top(s).kind) + ')');
    s.eq('for this key result', top(s) && top(s).data && top(s).data.host, { type: 'keyResult', id: id });
    nav(s, {});
    /* the KPI table's own footer links ("+ link") and, in Execution, connects data for this key result */
    if (kt && kt.canLink) {
      s.click(kt.linkLabel || 'Link a metric', { within: id });
      s.ok(top(s) && top(s).kind === 'kpi.link', 'the table footer links a metric to this key result');
      nav(s, {});
    }
    if (hasKpiApi(s, 'openLink')) {
      edit(s, row(s, id).tag);
      s.type('Statement', 'Linked from the editor');
      s.click('Save and link');
      s.eq('Save and link saves first', kr(s, id).statement, 'Linked from the editor');
      s.ok(top(s) && top(s).kind === 'kpi.link', 'then opens the link sheet for this key result');
      s.eq('link sheet host', top(s) && top(s).data && top(s).data.host, { type: 'keyResult', id: id });
      nav(s, {});
    }
    if (!SALES) {
      s.click('Actions for ' + row(s, id).tag);
      s.click('Connect data', { within: 'Actions for ' + row(s, id).tag });
      s.ok(top(s) && top(s).kind === 'kpi.connect', 'Connect data from the row menu');
      s.eq('connect host', top(s) && top(s).data && top(s).data.host, { type: 'keyResult', id: id });
      nav(s, {});
      if (kt && kt.canConnect) s.ok(s.has('Connect data', { within: id }), 'the KPI table footer also offers Connect data');
    } else {
      s.click('Actions for ' + row(s, id).tag);
      s.ok(!s.has('Connect data'), 'Sales has no Connect data');
      s.c.closeMenus(); s.render();
    }
  });
  s.step('a non-KPI key result that still hosts KPIs shows them with a note', () => {
    const d = doc(s);
    let pid;
    if (!SALES) pid = 'KR-EL-2026Q4-01-2';
    else { d.keyResults.push({ id: 'KR-BD-2026Q4-01-8', objectiveId: ctx(s).objId, statement: 'Coverage plan', trackingType: 'percentage', progress: 40 }); pid = 'KR-BD-2026Q4-01-8'; }
    d.kpis.push({ id: 'KPI-TEST-LEFT', objectiveId: ctx(s).objId, hostType: 'keyResult', hostId: pid, name: 'Leftover', targetType: 'demonstration', direction: 'up', target: 1, unit: '' });
    s.render();
    s.click('~' + kr(s, pid).statement, { within: pid });
    s.ok(row(s, pid).showKpis, 'KPI table shown');
    s.expect('These KPIs don’t count toward this key result’s score while it is tracked by % completion.', 'note');
  });
  /* added by audit A1: today every key result offers "+ add a KPI" / "+ link" (exec L4558–4564), so a
     non-KPI key result gets them in its row menu (a KPI-based one has them in its table footer) */
  s.step('a non-KPI key result offers Add KPI and Link a metric in its menu', () => {
    const pid = !SALES ? 'KR-EL-2026Q4-01-2' : 'KR-BD-2026Q4-01-8';
    const tag = row(s, pid).tag;
    s.click('Actions for ' + tag);
    s.click('Add KPI', { within: 'Actions for ' + tag });
    s.ok(top(s) && top(s).kind === 'kpi.target', 'Add KPI opens the KPI sheet');
    s.eq('for this key result', top(s) && top(s).data && top(s).data.host, { type: 'keyResult', id: pid });
    nav(s, {});
    s.click('Actions for ' + tag);
    s.click('Link a metric', { within: 'Actions for ' + tag });
    s.ok(top(s) && top(s).kind === 'kpi.link', 'Link a metric opens the link sheet');
    nav(s, {});
    const k = doc(s).keyResults.find((x) => x.trackingType === 'kpi' && x.objectiveId === ctx(s).objId);
    s.click('Actions for ' + row(s, k.id).tag);
    s.ok(!s.has('Add KPI', { within: 'Actions for ' + row(s, k.id).tag }), 'a KPI-based key result keeps them in its KPI table footer');
    nav(s, {});
  });
};

/* ===================================================== 12. read-only */
T.readOnly = () => {
  const s = sim();
  tab(s);
  s.c.setState({ ro: true });
  s.render();
  s.step('read-only view', () => {
    s.ok(!s.has('Add key result'), 'no add');
    s.ok(!s.has((el) => /^Actions for /.test(el.attrs['aria-label'] || '')), 'no row menus');
    const krs = doc(s).keyResults.filter((k) => k.objectiveId === ctx(s).objId);
    krs.forEach((k) => s.expect(k.statement, 'still visible ' + k.id));
    krs.forEach((k) => { if (!row(s, k.id).exp) s.click('~' + k.statement, { within: k.id }); });
    s.ok(krs.every((k) => row(s, k.id).exp), 'rows still expand');
    if (!SALES) {
      s.ok(!s.has('Progress of KR2'), 'no progress slider');
      s.expect('Progress is set in the key result.', 'progress shown as a value');
      s.expect('84%', 'progress value');
      const kt = row(s, 'KR-EL-2026Q4-01-1').kt;
      s.eq('KPI table cannot add', kt.canAdd, false);
      nav(s, { objId: 'OBJ-EL-2026Q4-02', tab: 'krs' });
      s.c.setState({ kr_open: { 'KR-EL-2026Q4-02-2': true } }); s.render();
      s.ok(!s.has((el) => el.tag === 'button' && /^Completion of /.test(el.attrs['aria-label'] || '')), 'no completion editing');
      s.expect('60%', 'completion still shown');
    } else {
      const cb = s.all((el) => el.tag === 'input' && el.attrs.type === 'checkbox' && /^Done: /.test(el.attrs['aria-label'] || ''));
      s.ok(cb.length === 3 && cb.every((el) => el.attrs.disabled === true), 'step checkboxes disabled');
    }
    s.vals.kr.add();
    s.flush(0);
    s.ok(toastSeen(s, 'Read-only view — editing is disabled.'), 'opening the editor is refused');
    s.eq('no sheet', top(s), null);
    s.clean('read-only');
  });
};

/* ===================================================== 13. search and public API */
T.search = () => {
  const s = sim();
  s.step('search and KR API', () => {
    const X = compiled();
    s.ok(!!X.KR && typeof X.KR.openEditor === 'function' && typeof X.KR.tag === 'function', 'KR.openEditor and KR.tag exist');
    const c = new X.Component({});
    c.renderVals();
    const q = SALES ? 'pipeline' : 'crossover';
    const res = X.MODS.kr.search(c, c.ctx, q);
    s.ok(res.length >= 1, 'finds a key result by statement');
    s.ok(res.every((r) => typeof r.label === 'string' && typeof r.sub === 'string' && typeof r.go === 'function'), 'result shape');
    s.ok(/^Key result KR\d+ in /.test(res[0].sub), 'sub names the tag and objective: ' + res[0].sub);
    res[0].go();
    s.eq('go opens the tab', c.state.tab, 'krs');
    s.ok(Object.keys(c.state.kr_open).length === 1, 'and expands it');
    s.eq('empty query', X.MODS.kr.search(c, c.ctx, '  ').length, 0);
    if (!SALES) {
      const fc = X.MODS.kr.search(c, c.ctx, 'polarization');
      s.eq('nothing for an objective statement', fc.length, 0);
      const other = X.MODS.kr.search(c, c.ctx, 'thickness');
      s.ok(other.length === 1 && /, Fuel Cell$/.test(other[0].sub), 'other division named: ' + (other[0] && other[0].sub));
      c.setState({ fQuarter: '2027Q1' });
      c.renderVals();
      X.MODS.kr.search(c, c.ctx, 'thickness')[0].go();
      s.eq('switches division', c.state.divId, 'DIV-FC');
      s.eq('picks the objective', c.state.objId, 'OBJ-FC-2026Q4-01');
      s.eq('clears a filter that would hide it', c.state.fQuarter, '');
      c.renderVals();
      s.eq('tag', X.KR.tag(c.ctx, 'KR-FC-2026Q4-01-2'), 'KR2');
    } else {
      c.renderVals();
      s.eq('tag', X.KR.tag(c.ctx, 'KR-BD-2026Q4-01-1'), 'KR-M1');
    }
  });
};

/* ===================================================== 14. dark mode tokens */
T.tokens = () => {
  const s = sim();
  s.step('module CSS uses tokens only', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'mods', 'kr', 'mod.css'), 'utf8');
    s.ok(!/#[0-9a-f]{3,8}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'no raw hex colours');
    s.ok(!/rgba?\(/i.test(css), 'no raw rgb colours');
    css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').forEach((rule) => {
      const sel = rule.split('{')[0].trim();
      if (!sel || /^@media/.test(sel)) return;
      sel.split(',').forEach((one) => { const t = one.trim().replace(/^@media[^{]*/, ''); if (t && !/(^|\s|\.)kr-/.test(t)) s.ok(false, 'unprefixed selector ' + t); });
    });
    s.c.setState({ theme: 'dark' }); tab(s);
    s.eq('dark theme on', s.vals.theme, 'dark');
    s.clean('dark');
  });
};

/* ===================================================== 15. local fuzz of states the board-wide walk rarely reaches */
T.localFuzz = () => {
  const { parsed } = load(file);
  const mineLine = (line) => { const src = parsed.srcmap[line]; return !!(src && /^mods\/kr\//.test(src[0])); };
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const VALUES = ['', '0', '1', '50', '100', '120', '-3', 'abc', '1.5', '0.05', '2026-11-05', '2026-10-01', '1, 2, 3,', '1,8', ' ', 'Seal creep'];
  const legacySetup = (s) => {
    if (!SALES) nav(s, { divId: 'DIV-FC', objId: 'OBJ-FC-2026Q4-03', tab: 'krs', kr_open: { 'KR-FC-2026Q4-03-1': true } });
    else {
      tab(s);
      doc(s).keyResults.push({ id: 'KR-BD-2026Q4-01-9', objectiveId: ctx(s).objId, statement: 'Legacy pilot readiness', trackingType: 'subkr', subKrs: [{ name: 'Template signed', weight: 1, trackingType: 'percentage', progress: 50 }] });
      s.c.setState({ kr_open: { 'KR-BD-2026Q4-01-9': true } }); s.render();
    }
  };
  const states = [
    ['list', (s) => tab(s)],
    ['milestone drawer', (s) => { if (!SALES) nav(s, { objId: 'OBJ-EL-2026Q4-02', tab: 'krs', kr_open: { 'KR-EL-2026Q4-02-2': true } }); else nav(s, { tab: 'krs', kr_open: { 'KR-BD-2026Q4-01-1': true } }); }],
    ['milestone editor', (s) => { if (!SALES) nav(s, { objId: 'OBJ-EL-2026Q4-02', tab: 'krs' }); else tab(s); edit(s, 'KR-M1'); }],
    ['KPI editor', (s) => { tab(s); const id = SALES ? 'KR-BD-2026Q4-01-2' : 'KR-EL-2026Q4-01-1'; edit(s, row(s, id).tag); s.c.setDraft({ openKpi: 0 }); s.render(); }],
    ['legacy editor', (s) => { legacySetup(s); edit(s, 'KR' + (SALES ? '3' : '1')); }],
    ['sub-key result sheet', (s) => { legacySetup(s); edit(s, 'KR' + (SALES ? '3' : '1')); s.click('Add sub-key result'); }],
    ['read-only', (s) => { tab(s); s.c.setState({ ro: true, kr_open: {} }); s.render(); }]
  ];
  let problems = 0, fires = 0;
  states.forEach(([label, setup]) => {
    let s = sim();
    try { setup(s); } catch (e) { problems++; console.log('FAIL local fuzz setup ' + label + ': ' + e.message); return; }
    for (let i = 0; i < 300 && problems < 10; i++) {
      const hs = [];
      s.els.forEach((el) => { if (mineLine(el.line)) Object.keys(el.on).forEach((n) => hs.push({ el: el, n: n })); });
      if (!hs.length || rnd() < 0.02) { s = sim(); setup(s); continue; }
      const h = pick(hs);
      let value = pick(VALUES);
      if (h.el.tag === 'select') { const opts = s.els.filter((e) => e.tag === 'option' && (e.parent === h.el || (e.parent && e.parent.parent === h.el))); if (opts.length) value = String(pick(opts).attrs.value); }
      if (h.el.attrs.type === 'range') value = String(Math.floor(rnd() * 101));
      if (h.el.attrs.type === 'date') value = rnd() < 0.8 ? pick(['2026-10-01', '2026-11-20', '2027-01-15']) : '';
      try {
        h.el.on[h.n](s.ev(h.el, { key: pick(['Enter', 'Escape', 'a']), target: { value: value, checked: rnd() < 0.5, dataset: {} } }));
        fires++;
        s.flush(rnd() < 0.3 ? 10000 : 0);
        if (s.c.state.dlg && rnd() < 0.6) { if (rnd() < 0.7) s.c.dlgOk(); else s.c.dlgCancel(); s.flush(0); }
      } catch (e) { problems++; console.log('FAIL local fuzz (' + label + ') ' + h.n + ' line ' + h.el.line + ': ' + e.message); try { s.render(); } catch (e2) { s = sim(); setup(s); } }
      const bad = [...s.ctx.errs].filter((x) => { const m = /line (\d+)/.exec(x); return !m || mineLine(Number(m[1])); }).concat(s.vmErrors.filter((x) => /^kr/.test(x)));
      const unres = [...s.ctx.unresolved].filter((x) => { const m = /line (\d+)/.exec(x); return m && mineLine(Number(m[1])); });
      if (bad.length || unres.length) { problems++; console.log('FAIL local fuzz (' + label + ') render: ' + bad.concat(unres).slice(0, 4).join(' | ')); s = sim(); setup(s); }
    }
  });
  const s = sim();
  s.ok(problems === 0, 'local fuzz: no exceptions, view errors or unresolved holes in key result states (' + fires + ' events)');
  console.log('local fuzz: ' + fires + ' events over ' + states.length + ' key result states, ' + problems + ' problems');
};

/* -------------------------------------------------------------- run all */
Object.keys(T).forEach((name) => {
  try { T[name](); } catch (e) { console.log('FAIL scenario ' + name + ': ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n   ')); process.exitCode = 1; }
});

/* every handler site in mods/kr/*.html must have been exercised */
(function coverage() {
  const { parsed } = load(file);
  const mine = [];
  (function walk(n) {
    if (n.attrs) Object.keys(n.attrs).forEach((k) => {
      if (!k.startsWith('on')) return;
      const src = parsed.srcmap[n.line];
      if (src && /^mods\/kr\//.test(src[0])) mine.push({ key: k.toLowerCase() + '@' + n.line, where: src[0] + ':' + src[1], raw: n.attrs[k] });
    });
    (n.kids || []).forEach(walk);
  })(parsed.tree);
  const X = compiled();
  const optional = (m) => (/krw\.connect/.test(m.raw) && !(X.KPI && X.KPI.openConnect)) || (/krw\.link\b/.test(m.raw) && !(X.KPI && X.KPI.openLink)) || (/saveLink/.test(m.raw) && !(X.KPI && X.KPI.openLink)) || (/krw\.connect/.test(m.raw) && SALES);
  const missed = mine.filter((m) => !fired.has(m.key) && !optional(m));
  const s = sim();
  s.ok(mine.length > 0, 'found the module handler sites');
  s.ok(!missed.length, 'every handler site in mods/kr was exercised' + (missed.length ? ': missed ' + missed.map((m) => m.key + ' (' + m.where + ')').join(', ') : ''));
  console.log('kr handler sites: ' + mine.length + ', exercised: ' + mine.filter((m) => fired.has(m.key)).length + ', waiting on KPI.* APIs: ' + mine.filter(optional).length);
})();
done();
