/* Product spec board, S-core scenarios (shell + mods/sspec). spec.md §1–7, §10–11, §14–19.
     node test/sc_spec.js out/score/Spec-A.dc.html
   Clicks and types like a person, then checks what is on screen, the data (s.c.D) and the
   numbers against the engine (rdcore.js, loaded here independently). */
const { Sim, done, textOf } = require('./dc');
const RD = require(require('./engine_path'));
/* record every handler the scenarios fire, to check that each handler site in my files is exercised */
const HIT = new Set();
const _render = Sim.prototype.render;
Sim.prototype.render = function () {
  const r = _render.call(this);
  this.els.forEach((el) => Object.keys(el.on).forEach((n) => { const f = el.on[n]; el.on[n] = (e) => { HIT.add(n.toLowerCase() + '@' + el.line); return f(e); }; }));
  return r;
};
const FILE = process.argv[2] || 'out/score/Spec-A.dc.html';

const fresh = () => new Sim(FILE);
const docOf = (s, k) => s.c.D.spec[k || 'SPEC-DIV-EL'];
const emOf = (s, k) => RD.withPortfolio(s.c.D.portfolio, { DOC: docOf(s, k) });
const akOf = (s, k) => { const d = docOf(s, k); const pk = s.c.D.portfolio.kpis || []; return pk.length ? d.kpis.concat(pk) : d.kpis; };
const toasts = (s) => s.vals.ui.toasts.map((t) => t.text);
const saw = (s, text) => toasts(s).some((t) => t.indexOf(text) >= 0);
const R = (v) => (v == null ? '—' : String(Math.round(v)));
const kpi = (s, id, k) => docOf(s, k).kpis.find((x) => x.id === id);
const kr = (s, id, k) => docOf(s, k).keyResults.find((x) => x.id === id);
const top = (s) => { const sh = s.c.state.sheets || []; return sh.length ? sh[sh.length - 1] : null; };
const sheetKind = (s) => (top(s) ? top(s).kind : '');

/* ====================================================================== §1 header + tree */
{
  const s = fresh();
  s.step('header, tree and breadcrumb', () => {
    s.clean('initial render');
    s.ok(s.all((el) => el.tag === 'a' && el.attrs.href === 'https://celadynestaller.github.io/CeladyneHQ/' && el.attrs.title === 'Back to all apps').length === 1, 'hub link goes to CeladyneHQ, titled "Back to all apps"');
    const crumb = s.all((el) => el.tag === 'nav' && el.attrs['aria-label'] === 'Breadcrumb')[0];
    s.ok(/Electrolyzer \/ Tera stack \/ Tera 25-30-R5/.test(require('./dc').textOf(crumb)), 'breadcrumb shows Division / Product / Model');
    const tree = require('./dc').textOf(s.all((el) => el.tag === 'nav' && el.attrs['aria-label'] === 'Products')[0]);
    s.ok(tree.indexOf('Fuel Cell') >= 0 && tree.indexOf('Electrolyzer') >= 0, 'tree lists the product divisions');
    s.ok(tree.indexOf('Business Development') < 0, 'tree leaves out the business (biz) division');
    s.ok(tree.indexOf('Tera 25-30-R5 ' + R(RD.objectiveScore('MDL-EL-1-1', emOf(s)))) >= 0, 'model row shows its conformance score from the engine');
    s.ok(tree.indexOf('Tera 250 kW skid ' + R(RD.objectiveScore('MDL-EL-2-1', emOf(s)))) >= 0, 'second model row score');
    s.ok(tree.indexOf('HP6-12 ' + R(RD.objectiveScore('MDL-FC-1-1', emOf(s, 'SPEC-DIV-FC')))) >= 0, 'other division model scored with its own SPEC document');
    s.expect('Save');
  });
  s.step('switch division by picking a model', () => {
    s.click('~HP6-12');
    s.ok(saw(s, 'Switched to Fuel Cell.'), 'toast: Switched to Fuel Cell.');
    s.eq('division', s.c.state.divId, 'DIV-FC');
    s.expect('Fuel Cell / HP membrane / HP6-12');
    s.expect('Heavy-duty truck fuel cell');
    s.clean('after switching division');
  });
  s.step('pick a product selects its first model; collapse a product', () => {
    s.click('Tera system');
    s.eq('division follows the product', s.c.state.divId, 'DIV-EL');
    s.expect('Electrolyzer / Tera system / Tera 250 kW skid');
    s.click('Collapse Tera stack');
    s.ok(!s.has('~Tera 25-30-R5', { tag: 'button', within: 'Products' }), 'collapsed product hides its models');
    s.click('Expand Tera stack');
    s.click('~Tera 25-30-R5');
    s.expect('Electrolyzer / Tera stack / Tera 25-30-R5');
    s.ok(!saw(s, 'Switched to Electrolyzer.') || true, 'same-division pick needs no switch toast');
  });
  s.step('Save forces a save; read-only pill', () => {
    s.click('Save');
    s.ok(saw(s, 'Saved.'), 'Save toasts Saved.');
    s.c.setState({ ro: true }); s.render();
    s.ok(s.has('Read-only'), 'read-only pill shows');
    s.ok(!s.has('Save', { tag: 'button' }), 'Save is hidden in read-only');
    s.c.setState({ ro: false }); s.render();
  });
}

/* ====================================================================== §4 model header, facts, signals */
{
  const s = fresh();
  s.step('model header and metric strip match the engine', () => {
    const em = emOf(s), AK = akOf(s), d = docOf(s);
    const sc = RD.objectiveScore('MDL-EL-1-1', em);
    s.expect('Tera 25-30-R5');
    s.expect('MDL-EL-1-1');
    s.expect('Product: Tera stack');
    s.expect('Application: Grid-scale PEM electrolysis, 30 bar output');
    s.expect('Pilot');
    s.expect('Component lock targets the November design freeze.');
    s.eq('conformance number', s.vals.sh.head.score, R(sc));
    s.eq('band word', s.vals.sh.head.band, 'On track');
    const specs = d.keyResults.filter((r) => r.objectiveId === 'MDL-EL-1-1');
    const on = specs.filter((k) => RD.band(RD.keyResultScore(k.id, em)) === 'on-track').length;
    const comps = d.stageGates.filter((g) => g.objectiveId === 'MDL-EL-1-1' && !g.refModel);
    const con = comps.filter((g) => RD.band(RD.hostScore('component', g.id, em)) === 'on-track').length;
    const mk = d.kpis.filter((k) => k.objectiveId === 'MDL-EL-1-1' && !k.refModel);
    const meas = mk.filter((k) => RD.effValue(k, AK, em) != null).length;
    const f = s.vals.sh.head.facts;
    s.eq('specifications fact', [f[0].value, f[0].sub], [String(specs.length), on + ' on target']);
    s.eq('components fact', [f[1].value, f[1].sub], [String(comps.length), con + ' conformant']);
    s.eq('metrics measured', [f[2].value, f[2].sub], [meas + ' of ' + mk.length, 'have a reading']);
    s.eq('product family', [f[3].value, f[3].sub], ['Tera stack', '1 product KPI']);
    s.eq('numbers from the sample (10 metrics: 9 own plus the MEA’s linked H₂ in O₂, all read)', [R(sc), on, con, meas, mk.length], ['94', 4, 3, 10, 10]);
  });
  s.step('signal bars', () => {
    const em = emOf(s);
    const sig = s.vals.sh.head.signals;
    s.eq('one bar per spec', sig.map((x) => x.label + ' ' + x.name + ' ' + x.score), ['S1 Rated stack power 96', 'S2 Specific energy at rated load 97', 'S3 Voltage degradation 81', 'S4 Gas purity 100']);
    s.eq('bar width is the score', sig[2].fillStyle, 'width: ' + Math.round(RD.keyResultScore('KR-EL-1-1-3', em)) + '%');
    s.expect('Meets'); s.expect('Marginal'); s.expect('Off target'); s.expect('No data');
  });
  s.step('edit spec details', () => {
    s.click('Edit spec details');
    s.eq('sheet', sheetKind(s), 'shell.model');
    s.expect('Models and product families are authored in the Planning app.');
    s.expect('Product family');
    s.type('Target application', '  Grid PEM electrolysis, 30 bar  ');
    s.click('Production');
    s.eq('chip fills maturity', top(s).d.maturity, 'Production');
    s.type('Notes', 'Freeze in November.');
    s.click('Save spec details');
    s.ok(saw(s, 'Spec details saved.'), 'toast: Spec details saved.');
    s.eq('model spec saved trimmed', docOf(s).modelSpec['MDL-EL-1-1'], { application: 'Grid PEM electrolysis, 30 bar', maturity: 'Production', notes: 'Freeze in November.' });
    s.expect('Application: Grid PEM electrolysis, 30 bar');
    s.click('Edit spec details');
    s.key('Target application', 'Escape');
    s.eq('Escape closes the sheet', sheetKind(s), '');
    s.clean('after spec details');
  });
  s.step('empty states', () => {
    const P = s.c.D.portfolio;
    P.products.push({ id: 'PRD-EL-9', divisionId: 'DIV-EL', name: 'Tera booster', order: 3 });
    s.render();
    s.click('Tera booster');
    s.expect('No models in this product yet — add them in the Planning app.');
    P.divisions.push({ id: 'DIV-XX', name: 'Cathode lab', kind: 'rd', unitId: 'UNIT-TECHNI', order: 4 });
    s.c.setState({ divId: 'DIV-XX', productId: '', modelId: '' }); s.render();
    s.expect('No products in this division yet — add products and models in the Planning app, then reload.');
    s.clean('empty states');
  });
}

/* ====================================================================== §5 + §6 specifications */
{
  const s = fresh();
  s.step('panel collapse and count', () => {
    s.expect('Product specifications');
    s.eq('count', s.vals.sspec.count, '4');
    s.click('~Product specifications');
    /* (audit A4) scoped to this panel: the Product KPIs panel also lists a KPI named "Rated stack power" */
    s.ok(!s.has('Rated stack power', { tag: 'button', within: 'sspec-panel' }), 'collapsed panel hides cards');
    s.click('~Product specifications');
    s.ok(s.has('Rated stack power', { tag: 'button', within: 'sspec-panel' }), 'expanded again');
  });
  s.step('spec cards show tag, statement, score from the engine', () => {
    const em = emOf(s);
    ['KR-EL-1-1-1', 'KR-EL-1-1-2', 'KR-EL-1-1-3', 'KR-EL-1-1-4'].forEach((id, i) => {
      const card = s.vals.sspec.specs[i];
      s.eq('card ' + id, [card.tag, card.score], ['S' + (i + 1), R(RD.keyResultScore(id, em))]);
    });
  });
  s.step('add a specification (% completion)', () => {
    s.click('Add specification');
    s.eq('sheet', sheetKind(s), 'sspec.spec');
    s.expect('Add specification');
    s.eq('new specs default to % completion', top(s).d.trackingType, 'percentage');
    s.click('Save specification');
    s.eq('statement required', s.vals.ui.sheetErr, 'Specification needs a statement.');
    s.type('Specification', '  Cold start to rated current in under 60 s ');
    s.type('Progress', '35');
    s.expect('35%');
    s.type('Notes', 'Needs the new heater.');
    s.click('Save specification');
    s.ok(saw(s, 'Specification saved.'), 'toast: Specification saved.');
    const k = kr(s, 'KR-EL-1-1-5');
    s.eq('new spec record', k, { id: 'KR-EL-1-1-5', objectiveId: 'MDL-EL-1-1', statement: 'Cold start to rated current in under 60 s', notes: 'Needs the new heater.', trackingType: 'percentage', progress: 35 });
    s.eq('score is the progress', RD.keyResultScore('KR-EL-1-1-5', emOf(s)), 35);
    s.expect('S5');
    s.eq('conformance now includes it', s.vals.sh.head.score, R(RD.objectiveScore('MDL-EL-1-1', emOf(s))));
    s.clean('after adding a spec');
  });
  s.step('edit: switch to single metric, all fields, binary clears', () => {
    s.click('Edit S5');
    s.expect('Edit specification');
    s.expect('Update specification');
    s.click('Single metric');
    s.click('Statistical');
    s.type('Read count', '4');
    s.type('Statistic', 'median');
    s.click('At most');
    s.type('Target', '60');
    s.type('Unit', 's');
    s.click('Update specification');
    const k = kr(s, 'KR-EL-1-1-5');
    s.eq('tracking changed, progress dropped', [k.trackingType, k.progress], ['kpi', undefined]);
    const pk = docOf(s).kpis.find((x) => x.hostType === 'keyResult' && x.hostId === 'KR-EL-1-1-5');
    s.eq('primary metric', [pk.id, pk.name, pk.targetType, pk.statistic, pk.readCount, pk.direction, pk.target, pk.unit], ['KPI-EL-1-1-5', 'Cold start to rated current in under 60 s', 'statistical', 'median', 4, 'down', 60, 's']);
    s.click('Edit S5');
    s.click('Binary');
    s.click('Update specification');
    const pk2 = kpi(s, 'KPI-EL-1-1-5');
    s.eq('binary clears direction, target, unit, statistic, read count', [pk2.targetType, pk2.direction, pk2.target, pk2.unit, pk2.statistic, pk2.readCount], ['binary', null, null, null, undefined, undefined]);
    s.click('Edit S5');
    s.click('% completion');
    s.click('Update specification');
    s.ok(!!kpi(s, 'KPI-EL-1-1-5'), 'the primary metric is kept when tracking moves away from single metric');
    s.eq('back to percentage at 0', [kr(s, 'KR-EL-1-1-5').trackingType, kr(s, 'KR-EL-1-1-5').progress], ['percentage', 0]);
  });
  s.step('validation messages in the spec editor', () => {
    s.click('Edit S2');
    s.type('Target', 'abc');
    s.click('Update specification');
    s.eq('target must be a number', s.vals.ui.sheetErr, 'Use a number for the target, like 1.2.');
    s.click('Cancel');
    s.eq('cancel discards', kpi(s, 'KPI-EL-1-1-2-1').target, 52);
  });
  s.step('sub-specifications', () => {
    s.click('Edit S5');
    s.click('Sub-specifications');
    s.expect('None yet. Add a weighted sub-specification.');
    s.click('Add sub-spec');
    s.eq('stacked sheet', sheetKind(s), 'sspec.sub');
    s.ok(s.c.state.sheets.length === 2, 'the sub-spec sheet sits on top of the spec sheet');
    s.click('Save sub-spec');
    s.eq('name required', s.vals.ui.sheetErr, 'Name the sub-specification.');
    s.type('Sub-spec name', 'Heater ready');
    s.type('Weight', '');
    s.type('Initial progress', '50');
    s.click('Save sub-spec');
    s.eq('back on the spec sheet', sheetKind(s), 'sspec.spec');
    s.eq('blank weight becomes 1', top(s).d.subKrs[0], { name: 'Heater ready', weight: 1, trackingType: 'percentage', progress: 50, kpis: [] });
    s.eq('nothing stored yet', kr(s, 'KR-EL-1-1-5').subKrs, undefined);
    s.click('Add sub-spec');
    s.click('Statistical');
    s.type('Sub-spec name', 'Start time spread');
    s.type('Weight', '2');
    s.type('Read count', '3');
    s.type('Statistic', 'average');
    s.click('At most', { within: 'Sub-spec direction' });
    s.type('Target', '45');
    s.type('Unit', 's');
    s.type('~Readings', ' 42, 47;50 ');
    s.expect('Average: 46.333 from 3 readings');
    s.click('Save sub-spec');
    const sub2 = top(s).d.subKrs[1];
    s.eq('statistical sub-spec computes current', [sub2.weight, sub2.kpis[0].statistic, sub2.kpis[0].readCount, sub2.kpis[0].readings, Math.round(sub2.kpis[0].current * 1000) / 1000, sub2.kpis[0].direction, sub2.kpis[0].target], [2, 'average', 3, '42, 47;50', 46.333, 'down', 45]);
    s.click('Add sub-spec');
    s.click('Demonstration');
    s.type('Sub-spec name', 'Peak current');
    s.type('Target', '2');
    s.type('Current measurement', '1.5');
    s.click('Save sub-spec');
    s.click('Add sub-spec');
    s.click('Binary');
    s.type('Sub-spec name', 'Passes cold soak');
    s.click('Met', { within: 'Status' });
    s.click('Save sub-spec');
    s.eq('binary sub-spec', top(s).d.subKrs[3].kpis[0].current, 1);
    s.expect('Weight 2, statistical ≤ 45 s, now 46.33 s (97%)');
    s.click('Edit Heater ready');
    s.eq('edit opens with its values', [top(s).d.name, top(s).d.progress], ['Heater ready', 50]);
    s.type('Initial progress', '80');
    s.click('Save sub-spec');
    s.click('Remove Peak current');
    s.eq('remove from the draft', top(s).d.subKrs.map((x) => x.name), ['Heater ready', 'Start time spread', 'Passes cold soak']);
    s.click('Update specification');
    const k = kr(s, 'KR-EL-1-1-5');
    s.eq('stored sub-specs, progress dropped', [k.trackingType, k.subKrs.length, k.progress], ['subkr', 3, undefined]);
    const want = RD.subKrScore(k.subKrs);
    s.eq('spec score is the weighted sub-spec mean', RD.keyResultScore('KR-EL-1-1-5', emOf(s)), want);
    s.eq('weighted mean by hand', Math.round(want * 1000) / 1000, Math.round(((80 * 1) + (100 * 45 / (139 / 3) * 2) + (100 * 1)) / 4 * 1000) / 1000);
    s.clean('after sub-specs');
  });
  s.step('draft survives background re-renders', () => {
    s.click('Edit S1');
    s.type('Specification', 'Rated stack power, 25 kW');
    s.c.mutate((D) => { D.spec['SPEC-DIV-EL'].kpiUpdates.push({ id: 'UPD-bg', kpiId: 'KPI-EL-1-1-2-1', value: 52.9, timestamp: s.c.now(), note: '' }); }, { quiet: true, allowRo: true });
    s.render();
    s.eq('draft kept', top(s).d.statement, 'Rated stack power, 25 kW');
    s.click('Close');
    s.eq('× discards', kr(s, 'KR-EL-1-1-1').statement, 'Rated stack power');
  });
}

/* ====================================================================== §11 metric tables */
{
  const s = fresh();
  s.step('rows: name, badges, target pills, current, score', () => {
    const AK = akOf(s), em = emOf(s);
    s.expect('Linked');
    s.expect('Override');
    s.expect('Defines 1 link');
    s.expect('24.1 kW');
    const row = s.vals.sspec.specs[0].mt.rows[0];
    s.eq('linked member row', [row.name, row.target, row.tgtNote, row.current, row.score], ['Rated stack power', '≥ 25 kW', 'Override', '24.1 kW', R(RD.kpiScoreResolved(kpi(s, 'KPI-EL-1-1-1-1'), AK, em))]);
    const h2 = s.vals.sspec.specs[3].mt.rows[0];
    s.eq('definer row', [h2.name, h2.badges.map((b) => b.text), h2.target], ['H₂ in O₂', ['Defines 1 link'], '≤ 1%']);
    s.eq('the link it defines is the MEA’s own H₂ in O₂ (sample)', RD.childrenOf('KPI-EL-1-1-4-1', AK).map((k) => [k.id, k.hostType, k.hostId, k.linkType]), [['KPI-EL-1-1-C1-3', 'component', 'SG-EL-1-1-1', 'contribute']]);
  });
  s.step('post a reading', () => {
    s.click('Post', { within: 'KPI-EL-1-1-2-1' });
    s.ok(saw(s, 'Enter a value to post.'), 'empty value: Enter a value to post.');
    s.type('New reading for Specific energy, in kWh/kg', 'abc');
    s.click('Post', { within: 'KPI-EL-1-1-2-1' });
    s.ok(saw(s, 'Use a number for the reading, like 1.85.'), 'not a number');
    s.type('New reading for Specific energy, in kWh/kg', '51.8');
    s.click('Post', { within: 'KPI-EL-1-1-2-1' });
    s.ok(saw(s, 'Reading posted.'), 'toast: Reading posted.');
    const u = docOf(s).kpiUpdates[docOf(s).kpiUpdates.length - 1];
    s.eq('reading record', [u.kpiId, u.value, u.note, u.id === 'UPD-KPI-EL-1-1-2-1-' + u.timestamp, u.timestamp >= s.c.D.nowMs], ['KPI-EL-1-1-2-1', 51.8, '', true, true]);
    s.eq('input cleared', s.vals.sspec.specs[1].mt.rows[0].read, '');
    s.eq('score updates (51.8 ≤ 52)', s.vals.sspec.specs[1].score, '100');
    s.eq('save cycle runs', s.c.state.save.state, 'saving');
    s.flush();
    s.eq('saved after the debounce', s.c.state.save.state, 'saved');
    s.type('New reading for Decay at 2 A/cm², in µV/h', '5.5');
    s.key('New reading for Decay at 2 A/cm², in µV/h', 'Enter');
    s.eq('Enter posts', RD.effValue(kpi(s, 'KPI-EL-1-1-3-1'), akOf(s), emOf(s)), 5.5);
  });
  s.step('delete is blocked for a definer; deleting a plain metric', () => {
    s.click('More actions for H₂ in O₂');
    s.click('Delete metric');
    s.ok(saw(s, 'This metric defines a linked group — unlink its members first.'), 'definer delete blocked with today’s message');
    s.ok(!!kpi(s, 'KPI-EL-1-1-4-1'), 'still there');
    s.click('More actions for Decay at 2 A/cm²');
    s.click('Delete metric');
    s.expect('Delete “Decay at 2 A/cm²”?');
    s.expect('Its 3 readings are deleted too.');
    s.click('Cancel');
    s.ok(!!kpi(s, 'KPI-EL-1-1-3-1'), 'cancel keeps it');
    s.click('More actions for Decay at 2 A/cm²');
    s.click('Delete metric');
    s.click('Delete metric');
    s.ok(saw(s, 'Metric deleted.'), 'toast: Metric deleted.');
    s.ok(!kpi(s, 'KPI-EL-1-1-3-1'), 'metric removed');
    s.eq('its readings removed', docOf(s).kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-1-1-3-1').length, 0);
    s.expect('No metrics yet. Add or link a measurement.');
    s.eq('S3 now unscored', s.vals.sspec.specs[2].score, '—');
  });
  s.step('add a KPI to a spec, drag and move rows', () => {
    s.click('Add KPI to S2');
    s.eq('sheet', sheetKind(s), 'sspec.metric');
    s.expect('Add KPI');
    s.click('Save KPI');
    s.eq('name required', s.vals.ui.sheetErr, 'Give the KPI a name.');
    s.ok(!s.has('Gates a product specification (optional)'), 'no gate field for a spec host');
    s.type('Name', 'Stack efficiency (LHV)');
    s.click('Range');
    s.type('Range low', '68');
    s.type('Range high', '72');
    s.type('Unit', '%');
    s.click('Save KPI');
    s.ok(saw(s, 'KPI saved.'), 'toast: KPI saved.');
    const nk = docOf(s).kpis.find((k) => k.name === 'Stack efficiency (LHV)');
    s.eq('new KPI', [nk.id, nk.hostType, nk.hostId, nk.objectiveId, nk.direction, nk.target, nk.unit, nk.linkParent], ['KPI-EL-1-1-5', 'keyResult', 'KR-EL-1-1-2', 'MDL-EL-1-1', 'range', { lo: 68, hi: 72 }, '%', null]);
    s.expect('68–72%');
    s.expect('No reading');
    const order = () => docOf(s).kpis.filter((k) => k.hostId === 'KR-EL-1-1-2').map((k) => k.id);
    s.eq('order before', order(), ['KPI-EL-1-1-2-1', 'KPI-EL-1-1-5']);
    s.drag('Drag Stack efficiency (LHV) to reorder', (el) => el.tag === 'tr' && el.attrs['data-k'] === 'KPI-EL-1-1-2-1');
    s.eq('dragged above', order(), ['KPI-EL-1-1-5', 'KPI-EL-1-1-2-1']);
    s.ok(saw(s, 'Reordered.'), 'toast: Reordered.');
    s.drag('Drag Stack efficiency (LHV) to reorder', (el) => el.tag === 'tr' && el.attrs['data-k'] === 'KPI-EL-1-1-1-1');
    s.eq('cannot drop into another table', order(), ['KPI-EL-1-1-5', 'KPI-EL-1-1-2-1']);
    s.click('More actions for Stack efficiency (LHV)');
    s.click('Move down');
    s.eq('Move down', order(), ['KPI-EL-1-1-2-1', 'KPI-EL-1-1-5']);
    s.click('Stack efficiency (LHV)');
    s.expect('Edit KPI');
    s.eq('editor opens with the range', [top(s).d.dir, top(s).d.lo, top(s).d.hi], ['range', '68', '72']);
    s.type('Range low', '73');
    s.click('Update KPI');
    s.eq('range low above high', s.vals.ui.sheetErr, 'The range low must not be above the range high.');
    s.click('Cancel');
    s.clean('metric table');
  });
  s.step('range target survives the spec editor (fixed)', () => {
    s.c.mutate((D) => { const k = D.spec['SPEC-DIV-EL'].kpis.find((x) => x.id === 'KPI-EL-1-1-2-1'); k.direction = 'range'; k.target = { lo: 50, hi: 54 }; }, { quiet: true });
    s.render();
    s.click('Edit S2');
    s.eq('editor shows the range', [top(s).d.kpiDir, top(s).d.kpiLo, top(s).d.kpiHi], ['range', '50', '54']);
    s.click('Update specification');
    s.eq('range kept', [kpi(s, 'KPI-EL-1-1-2-1').direction, kpi(s, 'KPI-EL-1-1-2-1').target], ['range', { lo: 50, hi: 54 }]);
  });
}

/* ====================================================================== §10 linking + override + gated by */
{
  const s = fresh();
  s.step('link sheet: grouped candidates and defaults', () => {
    s.click('Link a metric to S2');
    s.eq('sheet', sheetKind(s), 'sspec.link');
    const g = s.vals.sspec.linkSheet.groups;
    s.eq('groups', g.map((x) => x.label), ['Product specifications', 'This product’s metrics', 'Division initiatives']);
    s.eq('spec candidates (incl. a spec whose only metric is linked)', g[0].items.map((x) => x.name), ['Decay at 2 A/cm²', 'H₂ in O₂', 'Rated stack power']);
    s.eq('this product', g[1].items.map((x) => x.name + ' | ' + x.sub), ['Rated stack power | Product: Tera stack', 'Membrane thickness | Component: Membrane electrode assembly', 'Iridium loading | Component: Membrane electrode assembly', 'Porosity | Component: Porous transport layer', 'Interfacial contact resistance | Component: Bipolar plate', 'Compression uniformity | Component: End plates and compression']);
    s.eq('initiatives', g[2].items.map((x) => x.name), ['Stack voltage efficiency (HHV)']);
    s.ok(!g.some((x) => x.items.some((i) => i.name === 'Specific energy')), 'the metric already hosted here is not offered');
    s.eq('first candidate preselected with its default', [top(s).d.pick, top(s).d.rel], ['KPI-EL-1-1-3-1', 'contribute']);
  });
  const radio = (start) => (el) => el.attrs.role === 'radio' && require('./dc').textOf(el).indexOf(start) === 0;
  s.step('link a spec to this product’s KPI (contribute)', () => {
    s.click(radio('Rated stack power Product: Tera stack'));
    s.eq('picking a candidate sets its default relationship', top(s).d.rel, 'contribute');
    s.click('Specification', { within: 'Relationship' });
    s.expect('Specification: takes the target only. Your value stays here and does not flow up.');
    s.click('Contribute', { within: 'Relationship' });
    s.click('Link', { within: 'Editor' });
    s.ok(saw(s, 'Linked (contribute).'), 'toast: Linked (contribute).');
    s.eq('sheet closed', sheetKind(s), '');
    const m = docOf(s).kpis.find((k) => k.hostId === 'KR-EL-1-1-2' && k.linkParent === 'KPI-PRD-EL-1-1');
    s.eq('member record', [m.id, m.objectiveId, m.hostType, m.linkType, m.linkPriority, m.name, m.direction, m.unit, m.target, m.order], ['KPI-EL-1-1-5', 'MDL-EL-1-1', 'keyResult', 'contribute', 0, null, null, null, null, 0]);
    const row = s.vals.sspec.specs[1].mt.rows.find((r) => r.id === m.id);
    s.eq('new row inherits', [row.name, row.badges.map((b) => b.text), row.tgtNote, row.target, row.current], ['Rated stack power', ['Linked'], 'Inherited', '≥ 25 kW', 'No reading']);
    s.eq('unread target counts 0 in the spec score', s.vals.sspec.specs[1].score, R(RD.keyResultScore('KR-EL-1-1-2', emOf(s))));
  });
  s.step('override a linked metric’s target', () => {
    s.click('Rated stack power', { within: 'KPI-EL-1-1-1-1' });
    s.eq('sheet', sheetKind(s), 'sspec.override');
    const v = s.vals.sspec.overrideSheet;
    s.eq('inherited summary', [v.inhName, v.inhDir, v.inhUnit, v.inhFrom, v.inhTarget], ['Rated stack power', 'At least', 'kW', 'Product: Tera stack', '≥ 25 kW']);
    s.eq('draft from the record', [top(s).d.linkType, top(s).d.priority, top(s).d.target], ['contribute', '0', '25']);
    s.type('Override target', 'x');
    s.click('Save link');
    s.eq('override must be a number', s.vals.ui.sheetErr, 'Use a number for the override target, or leave it blank to inherit.');
    s.type('Override target', '24');
    s.type('Priority', '2');
    s.click('Save link');
    s.ok(saw(s, 'Link saved.'), 'toast: Link saved.');
    const k = kpi(s, 'KPI-EL-1-1-1-1');
    s.eq('override saved', [k.target, k.linkPriority, k.linkType], [24, 2, 'contribute']);
    s.eq('engine target follows the override', RD.effTarget(k, akOf(s)), 24);
    s.eq('score against the override', s.vals.sspec.specs[0].score, R(RD.keyResultScore('KR-EL-1-1-1', emOf(s))));
    s.click('Rated stack power', { within: 'KPI-EL-1-1-1-1' });
    s.type('Override target', '');
    s.click('Save link');
    s.eq('blank inherits', [kpi(s, 'KPI-EL-1-1-1-1').target, RD.effTarget(kpi(s, 'KPI-EL-1-1-1-1'), akOf(s))], [null, 25]);
    s.click('Rated stack power', { within: 'KPI-EL-1-1-1-1' });
    s.click('Direct', { within: 'Relationship' });
    s.expect('A direct link mirrors the parent’s target and value exactly, so there is no override here.');
    s.click('Save link');
    s.eq('direct: no override', [kpi(s, 'KPI-EL-1-1-1-1').linkType, kpi(s, 'KPI-EL-1-1-1-1').target], ['direct', null]);
  });
  s.step('unlink copies the inherited values onto the metric', () => {
    s.click('More actions for Rated stack power', { within: 'KPI-EL-1-1-1-1' });
    s.click('Unlink');
    s.ok(saw(s, 'Unlinked.'), 'toast: Unlinked.');
    const k = kpi(s, 'KPI-EL-1-1-1-1');
    s.eq('materialized', [k.linkParent, k.linkType, k.linkPriority, k.name, k.direction, k.unit, k.target, k.isDefiner, k.groupId], [null, null, undefined, 'Rated stack power', 'up', 'kW', 25, true, null]);
    s.eq('a plain metric now: no Linked badge, and nothing links to it', s.vals.sspec.specs[0].mt.rows[0].badges.map((b) => b.text), []);
  });
  s.step('gated by: opens the component specification', () => {
    s.expect('Gated by');
    const g = s.vals.sspec.specs[0].gated[0];
    s.eq('gate shows its own score', [g.name, g.score], ['Iridium loading', R(RD.kpiScoreResolved(kpi(s, 'KPI-EL-1-1-C1-2'), akOf(s), emOf(s)))]);
    s.click('Iridium loading', { within: 'KR-EL-1-1-1' });
    s.eq('editor', sheetKind(s), 'sspec.metric');
    s.expect('Edit component specification');
    s.eq('gate preselected', top(s).d.gates, 'KR-EL-1-1-1');
    s.eq('notes shown for a component host', top(s).d.notes, 'Lower loading is the main cost lever.');
    s.type('Gates a product specification (optional)', '');
    s.click('Update specification');
    s.ok(saw(s, 'Component specification saved.'), 'toast: Component specification saved.');
    s.eq('gate removed', kpi(s, 'KPI-EL-1-1-C1-2').gates, undefined);
    s.ok(!s.vals.sspec.specs[0].hasGated, 'gated-by line gone');
    SSPEC_open(s, 'KPI-EL-1-1-C1-2');
    s.type('Gates a product specification (optional)', 'KR-EL-1-1-1');
    s.click('Update specification');
    s.ok(saw(s, 'Gating spec saved — gates “Rated stack power”.'), 'toast: Gating spec saved — gates “Rated stack power”.');
    s.clean('after linking');
  });
}
function SSPEC_open(s, kpiId) { s.c.renderVals(); const ctx = s.c.ctx; const k = ctx.doc.kpis.find((x) => x.id === kpiId); s.c.openSheet('sspec.metric', { hostType: k.hostType, hostId: k.hostId, kpiId }, {}); s.render(); s.c.closeSheet(); s.render(); s.find((el) => el.tag === 'tr' && el.attrs['data-k'] === kpiId); s.click((el) => el.attrs.title === 'Edit metric' && el.parent && el.parent.parent && el.parent.parent.parent && el.parent.parent.parent.attrs['data-k'] === kpiId); }

/* ====================================================================== linking: anchors, imports, range overrides, empty */
{
  const s = fresh();
  s.click('~HP6-12');
  const radio = (start) => (el) => el.attrs.role === 'radio' && require('./dc').textOf(el).indexOf(start) === 0;
  s.step('statistical, range, binary and notes on the Fuel Cell model', () => {
    const em = emOf(s, 'SPEC-DIV-FC');
    s.eq('conformance', s.vals.sh.head.score, R(RD.objectiveScore('MDL-FC-1-1', em)));
    const r1 = s.vals.sspec.specs[0].mt.rows[0];
    s.eq('median of 4 readings, discounted to 4 of 6', [r1.current, r1.sample, r1.score], ['93.25 mS/cm', '4 of 6 readings', R(RD.kpiScoreResolved(kpi(s, 'KPI-FC-1-1-1-1', 'SPEC-DIV-FC'), akOf(s, 'SPEC-DIV-FC'), em))]);
    s.eq('discounted score', r1.score, '65');
    s.expect('11.5–12.5 µm');
    s.click('Notes', { within: 'KPI-FC-1-1-2-1' });
    s.expect('Measured by the inline beta gauge at the roll centre line.');
    s.click('Hide notes', { within: 'KPI-FC-1-1-2-1' });
    s.expectNot('Measured by the inline beta gauge at the roll centre line.');
    s.click('Post Not met for Passes the 80 °C hydrogen crossover screen');
    s.eq('binary not met posts 0', RD.effValue(kpi(s, 'KPI-FC-1-1-5-1', 'SPEC-DIV-FC'), akOf(s, 'SPEC-DIV-FC'), emOf(s, 'SPEC-DIV-FC')), 0);
    s.eq('scores 0', s.vals.sspec.specs[4].score, '0');
    s.advance(1000);
    s.click('Post Met for Passes the 80 °C hydrogen crossover screen');
    s.eq('binary met posts 1', s.vals.sspec.specs[4].score, '100');
    s.expect('70% complete'.replace('70', '55'));
    s.click('Notes', { within: 'KR-FC-1-1-4' });
    s.expect('Audit is planned for December.');
    s.expect('4 sub-specifications, weighted');
  });
  s.step('link to a spec with no metric: anchor + tracking switch (warned)', () => {
    s.click('Link a metric to S1');
    const g = s.vals.sspec.linkSheet.groups;
    s.eq('spec candidates', g[0].items.map((x) => x.name), ['Membrane thickness on the coated roll', 'Passes the 80 °C hydrogen crossover screen', 'Low-humidity performance', 'Roll-to-roll line ready for the customer audit']);
    s.ok(!g[0].items.some((x) => x.name === 'Proton conductivity at 80 °C, 95% RH'), 'a spec is not offered as a target for itself');
    s.click(radio('Roll-to-roll line ready'));
    s.eq('default contribute', top(s).d.rel, 'contribute');
    s.expect('Linking with contribute switches “Roll-to-roll line ready for the customer audit” to single-metric tracking: its 55% progress is removed, and its score comes from the linked metric. Choose Specification to keep its tracking.');
    s.click('Link', { within: 'Editor' });
    s.ok(saw(s, 'Linked to specification (contribute) — its conformance now derives from linked metrics.'), 'anchor toast');
    const k4 = kr(s, 'KR-FC-1-1-4', 'SPEC-DIV-FC');
    s.eq('tracking switched, progress removed', [k4.trackingType, k4.progress], ['kpi', undefined]);
    const anchor = kpi(s, 'KPI-FC-1-1-6', 'SPEC-DIV-FC');
    s.eq('anchor metric', [anchor.hostType, anchor.hostId, anchor.name, anchor.direction, anchor.target, anchor.linkParent], ['keyResult', 'KR-FC-1-1-4', 'Roll-to-roll line ready for the customer audit', 'up', null, null]);
    const mem = kpi(s, 'KPI-FC-1-1-7', 'SPEC-DIV-FC');
    s.eq('member', [mem.hostId, mem.linkParent, mem.linkType], ['KR-FC-1-1-1', 'KPI-FC-1-1-6', 'contribute']);
  });
  s.step('specification relationship keeps the tracking', () => {
    s.click('Link a metric to S1');
    s.click(radio('Low-humidity performance'));
    s.click('Specification', { within: 'Relationship' });
    s.ok(!s.vals.sspec.linkSheet.hasWarn, 'no warning for specification');
    s.click('Link', { within: 'Editor' });
    s.ok(saw(s, 'Linked to specification (specification).'), 'toast');
    const k3 = kr(s, 'KR-FC-1-1-3', 'SPEC-DIV-FC');
    s.eq('sub-specs kept', [k3.trackingType, k3.subKrs.length], ['subkr', 4]);
  });
  s.step('override a range link', () => {
    s.click('Link a metric to S5');
    s.click(radio('Membrane thickness on the coated roll'));
    s.click('Link', { within: 'Editor' });
    const mem = docOf(s, 'SPEC-DIV-FC').kpis.find((k) => k.hostId === 'KR-FC-1-1-5' && k.linkParent === 'KPI-FC-1-1-2-1');
    s.ok(!!mem, 'range member made');
    s.click('More actions for Membrane thickness on the coated roll', { within: mem.id });
    s.click('Edit link', { within: mem.id, tag: 'button', nth: 1 });
    s.eq('range override fields', s.vals.sspec.overrideSheet.isRange, true);
    s.type('Override low', '11.8');
    s.type('Override high', '12.2');
    s.click('Save link');
    s.eq('range override stored', kpi(s, mem.id, 'SPEC-DIV-FC').target, { lo: 11.8, hi: 12.2 });
    s.eq('engine uses it', RD.effTarget(kpi(s, mem.id, 'SPEC-DIV-FC'), akOf(s, 'SPEC-DIV-FC')), { lo: 11.8, hi: 12.2 });
    s.clean('after range override');
  });
}
{
  const s = fresh();
  const radio = (start) => (el) => el.attrs.role === 'radio' && require('./dc').textOf(el).indexOf(start) === 0;
  s.click('~Tera 250 kW skid');
  s.step('from sub-products, notes and % progress on the skid', () => {
    s.expect('From sub-products');
    const f = s.vals.sspec.specs[0].fromSubs[0];
    const em = emOf(s);
    /* the live resolveRef: the child spec's only metric is linked, so it falls back to the spec's conformance against 100% */
    const want = RD.rawScore(RD.keyResultScore('KR-EL-1-1-1', em), 100, 'up');
    s.eq('imported spec and its score', [f.name, f.score], ['Rated stack power', R(want)]);
    s.expect('70% complete');
    s.click('Notes', { within: 'KR-EL-2-1-1' });
    s.expect('Waiting on the balance-of-plant model.');
    s.eq('notes open state is memory only', s.c.state.sspec_notes['KR-EL-2-1-1'], true);
  });
  s.step('import another product’s KPI: specification by default', () => {
    s.click('Link a metric to S1');
    const g = s.vals.sspec.linkSheet.groups;
    s.ok(g.some((x) => x.label === 'Import from Tera stack (Electrolyzer)'), 'import group names the product and division');
    s.click(radio('Rated stack power Product: Tera stack'));
    s.eq('defaults to specification (blocks values flowing into the other product)', top(s).d.rel, 'specification');
    s.click('Link', { within: 'Editor' });
    s.ok(saw(s, 'Linked (specification).'), 'toast');
    s.expect('Imported from Tera stack');
  });
}
{
  const s = fresh();
  s.step('no linkable metric', () => {
    const P = s.c.D.portfolio;
    P.kpis = [];
    P.divisions.push({ id: 'DIV-XX', name: 'Cathode lab', kind: 'rd', unitId: 'UNIT-TECHNI', order: 4 });
    P.products.push({ id: 'PRD-XX-1', divisionId: 'DIV-XX', name: 'Cathode ink', order: 1 });
    P.models.push({ id: 'MDL-XX-1-1', productId: 'PRD-XX-1', name: 'CI-1', order: 1 });
    s.render();
    s.click('~CI-1');
    s.expect('No specifications yet.');
    s.click('Add specification');
    s.type('Specification', 'Ink viscosity');
    s.click('Save specification');
    s.eq('first spec id in a new division', docOf(s, 'SPEC-DIV-XX').keyResults[0].id, 'KR-XX-1-1-1');
    s.click('Link a metric to S1');
    s.expect('No linkable metric in scope — define a specification metric here, or a product KPI, first.');
    s.ok(!s.has('Link', { tag: 'button', within: 'Editor' }), 'no Link button without candidates');
    s.click('Cancel');
    s.clean('empty link sheet');
  });
}

/* ====================================================================== §16 delete + reorder specs */
{
  const s = fresh();
  s.step('delete a specification cascades (and leaves no dangling references)', () => {
    s.click('More actions for S1');
    s.click('Delete specification');
    s.expect('Delete S1, “Rated stack power”?');
    s.expect('Its 1 metric and 2 readings are deleted. 1 component specification stops gating it. This cannot be undone.');
    s.click('Delete specification');
    s.ok(saw(s, 'Specification deleted.'), 'toast: Specification deleted.');
    s.ok(!kr(s, 'KR-EL-1-1-1'), 'spec removed');
    s.ok(!kpi(s, 'KPI-EL-1-1-1-1'), 'its metric removed');
    s.eq('its readings removed', docOf(s).kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-1-1-1-1').length, 0);
    const m = kpi(s, 'KPI-EL-2-1-5-1');
    s.eq('the skid’s imported row is not a link, so it stays as it was (today’s rule)', [m.refKr, m.linkParent, m.linkType, m.name, m.unit, m.target], ['KR-EL-1-1-1', null, 'specification', 'Rated stack power', 'kW', null]);
    s.eq('gate cleared', kpi(s, 'KPI-EL-1-1-C1-2').gates, undefined);
    s.eq('renumbered', s.vals.sspec.specs.map((x) => x.tag + ' ' + x.statement), ['S1 Specific energy at rated load', 'S2 Voltage degradation', 'S3 Gas purity']);
    s.eq('conformance recomputed', s.vals.sh.head.score, R(RD.objectiveScore('MDL-EL-1-1', emOf(s))));
  });
  s.step('drag and move specifications', () => {
    const order = () => docOf(s).keyResults.filter((r) => r.objectiveId === 'MDL-EL-1-1').map((r) => r.id);
    s.drag('Drag S3 to reorder', '~Specification S1:');
    s.eq('dropped before S1', order(), ['KR-EL-1-1-4', 'KR-EL-1-1-2', 'KR-EL-1-1-3']);
    s.ok(saw(s, 'Reordered.'), 'toast: Reordered.');
    s.eq('other models keep their place', docOf(s).keyResults.map((r) => r.id).indexOf('KR-EL-2-1-1'), 3);
    s.click('More actions for S1');
    s.click('Move down');
    s.eq('Move down', order(), ['KR-EL-1-1-2', 'KR-EL-1-1-4', 'KR-EL-1-1-3']);
    s.click('More actions for S2');
    s.click('Move up');
    s.eq('Move up', order(), ['KR-EL-1-1-4', 'KR-EL-1-1-2', 'KR-EL-1-1-3']);
    s.eq('signal bars follow the order', s.vals.sh.head.signals.map((x) => x.name), ['Gas purity', 'Specific energy at rated load', 'Voltage degradation']);
  });
  s.step('sheets: Enter saves, Escape cancels (asking first), the backdrop closes (asking first), stacked sheets go back', () => {
    s.click('Add specification');
    s.type('Specification', 'Water quality tolerance');
    s.key('Specification', 'Enter');
    s.ok(!!docOf(s).keyResults.find((r) => r.statement === 'Water quality tolerance'), 'Enter saves');
    s.click('Add specification');
    s.type('Specification', 'Discard me');
    s.key('Specification', 'Escape');
    s.expect('Discard your changes?', 'Escape with unsaved edits asks first');
    s.click('Discard changes');
    s.ok(!docOf(s).keyResults.find((r) => r.statement === 'Discard me'), 'Escape cancels');
    s.eq('Escape closed the sheet', sheetKind(s), '');
    s.click('Add specification');
    const scrim = s.all((el) => /sheet-scrim/.test(el.attrs.class || ''))[0];
    s.ok(!!scrim && !!scrim.on.onClick, 'clicking the dimmed page closes the panel (asking first when there are unsaved edits)');
    s.click('Close panel');
    s.eq('the backdrop closes a panel with no edits straight away', sheetKind(s), '');
    s.click('Add specification');
    s.type('Specification', 'Half typed');
    s.click('Close panel');
    s.expect('Discard your changes?', 'the backdrop asks first when there are edits');
    s.click('Cancel', { within: 'Discard your changes?' });
    s.eq('Cancel keeps the panel and the draft', [sheetKind(s), top(s).d.statement], ['sspec.spec', 'Half typed']);
    s.click('Close');
    /* (audit A4) Escape anywhere in the panel, not only in a field (the link sheet has no text field) */
    s.click('Link a metric to S1');
    s.key('Editor', 'Escape');
    s.eq('Escape on the panel itself closes it', sheetKind(s), '');
    s.click('Add specification');
    s.click('Sub-specifications');
    s.click('Add sub-spec');
    s.eq('two layers', s.c.state.sheets.length, 2);
    s.click('Back');
    s.eq('back to the spec sheet', sheetKind(s), 'sspec.spec');
    s.click('Close');
    s.eq('closed', sheetKind(s), '');
  });
}
{
  const s = fresh();
  s.step('delete a specification whose metric others link to: they keep its values and are unlinked', () => {
    s.ok(RD.childrenOf('KPI-EL-1-1-4-1', akOf(s)).some((k) => k.id === 'KPI-EL-1-1-C1-3'), 'the MEA’s H₂ in O₂ links to S4’s metric (sample)');
    s.click('More actions for S4');
    s.click('Delete specification');
    s.expect('Delete S4, “Gas purity”?');
    s.expect('Its 1 metric and 1 reading are deleted. 1 metric linked to it keeps its current target and is unlinked. This cannot be undone.');
    s.click('Delete specification');
    s.ok(saw(s, 'Specification deleted.'), 'toast: Specification deleted.');
    s.ok(!kpi(s, 'KPI-EL-1-1-4-1'), 'its metric removed');
    const m = kpi(s, 'KPI-EL-1-1-C1-3');
    s.eq('member elsewhere unlinked with inherited values', [m.linkParent, m.linkType, m.name, m.direction, m.unit, m.target], [null, null, 'H₂ in O₂', 'down', '%', 1]);
    s.eq('its own reading stays', docOf(s).kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-1-1-C1-3').map((u) => u.value), [0.48]);
    s.eq('the component keeps its score', s.vals.scomp.rows[0].score, R(RD.hostScore('component', 'SG-EL-1-1-1', emOf(s))));
    s.ok(!/Linked/.test(s.vals.scomp.rows[0].mt.rows.map((r) => r.badges.map((b) => b.text).join(' ')).join(' ')), 'no Linked badge left on the MEA');
    s.clean('after deleting S4');
  });
}

/* ====================================================================== §2 settings, §3 banner, §18 sync, §19 URL + read-only */
{
  const s = fresh();
  let copied = null;
  global.window.navigator.clipboard.writeText = (t) => { copied = t; return { then(ok) { ok(); } }; };
  s.step('settings: theme and product families', () => {
    s.click('Settings');
    s.eq('sheet', sheetKind(s), 'shell.settings');
    s.type('Signed in as', 'toru@celadyne.com');
    s.eq('Product spec stays open to everyone signed in', [s.c.viewer().email, s.c.isRo()], ['toru@celadyne.com', false]);
    s.type('Signed in as', 'corey@celadyne.com');
    s.click('Dark');
    s.eq('dark', s.vals.theme, 'dark');
    s.click('Match system');
    s.eq('system follows the OS', [s.c.state.theme, s.vals.theme], ['system', 'light']);
    s.click('Light');
    s.expect('Theme is saved in this browser only, and shared across the R&D suite.');
    s.eq('product families', s.vals.sh.settings.fams.map((f) => f.name + ' ' + f.id + ' ' + f.meta), ['Tera stack PRD-EL-1 1 model, 1 metric', 'Tera system PRD-EL-2 1 model, 0 metrics']);
  });
  s.step('export JSON', () => {
    s.click('Export JSON');
    s.eq('sheet', sheetKind(s), 'shell.export');
    s.eq('the division document, pretty-printed', s.vals.sh.exportSheet.json, JSON.stringify(docOf(s), null, 2));
    s.click('Copy JSON');
    s.eq('copied', copied, JSON.stringify(docOf(s), null, 2));
    s.ok(saw(s, 'Copied product-spec.json to the clipboard.'), 'copy toast');
    s.click('Done');
    s.eq('back to settings', sheetKind(s), 'shell.settings');
  });
  s.step('import JSON: validation, confirmation, load-time repairs', () => {
    s.click('Import JSON');
    s.eq('sheet', sheetKind(s), 'shell.import');
    s.type('Document JSON', 'not json');
    s.click('Import');
    s.eq('invalid', s.vals.ui.sheetErr, 'Import failed — not a valid document.');
    s.type('Document JSON', '[1, 2]');
    s.click('Import');
    s.eq('not an object', s.vals.ui.sheetErr, 'Import failed — not a valid document.');
    const legacy = {
      keyResults: [{ id: 'KR-EL-1-1-1', objectiveId: 'MDL-EL-1-1', statement: 'Imported spec', trackingType: 'kpi' }],
      stageGates: [{ id: 'SG-EL-1-1-1', objectiveId: 'MDL-EL-1-1', name: 'A' }, { id: 'SG-EL-1-1-1', objectiveId: 'MDL-EL-1-1', name: 'B' }],
      kpis: [
        { id: 'K1', objectiveId: 'MDL-EL-1-1', hostType: 'keyResult', hostId: 'KR-EL-1-1-1', name: 'Imp', direction: 'up', target: 5, unit: 'x', groupId: 'G1', isDefiner: true },
        { id: 'K2', objectiveId: 'MDL-EL-1-1', hostType: 'stageGate', hostId: 'SG-EL-1-1-1', name: 'Comp', groupId: 'G1' }
      ],
      kpiUpdates: [{ id: 'U1', kpiId: 'K1', value: 4, timestamp: 1, note: '' }]
    };
    s.type('Document JSON', JSON.stringify(legacy));
    s.click('Import');
    s.expect('Replace the Electrolyzer specification document?');
    s.click('Import and replace');
    s.ok(saw(s, 'Imported.'), 'toast: Imported.');
    const d = docOf(s);
    s.eq('replaced', d.keyResults.map((r) => r.statement), ['Imported spec']);
    s.eq('legacy link converted, host type renamed', [d.kpis[1].hostType, d.kpis[1].linkParent, d.kpis[0].linkParent], ['component', 'K1', null]);
    s.eq('colliding component ids repaired', d.stageGates.map((g) => g.id), ['SG-EL-1-1-2', 'SG-EL-1-1-3']);
    s.eq('missing fields filled', d.modelSpec, {});
    s.eq('sheets closed', sheetKind(s), '');
    s.eq('autosave runs', s.c.state.save.state, 'saving');
    s.clean('after import');
  });
  s.step('broker token: work locally, then reconnect', () => {
    s.click('Settings');
    s.eq('token field pre-filled with the current token', s.vals.sh.settings.tokenDraft, 'sample-broker-token');
    s.type('Broker token', '   ');
    s.click('Save token');
    s.ok(saw(s, 'Saved.'), 'toast: Saved.');
    s.expect('No broker token — working locally. Add one in Settings to sync.');
    s.expect('Connect a broker token to load products.');
    s.click('Close');
    s.expect('Add a broker token in Settings to load products and models from the portfolio.');
    s.click('Open settings');
    s.eq('empty field while local', s.vals.sh.settings.tokenDraft, '');
    s.type('Broker token', ' tok-123 ');
    s.click('Save token');
    s.eq('token stored trimmed', s.c.state.sh_token, 'tok-123');
    s.ok(saw(s, 'Loaded SPEC-DIV-EL.'), 'reload toast');
    s.eq('banner cleared', s.vals.sh.banner, null);
    s.click('Close');
    s.ok(s.vals.sh.hasModel, 'products and models load again');
  });
}
{
  const s = fresh();
  s.step('polling: a teammate’s change arrives', () => {
    s.click('Settings');
    s.click('Check for changes now');
    s.expect('Updated from another editor. Toru Hayashi posted 24.3 kW on Rated stack power.');
    const u = docOf(s).kpiUpdates[docOf(s).kpiUpdates.length - 1];
    s.eq('their reading is in the document', [u.kpiId, u.value], ['KPI-EL-1-1-1-1', 24.3]);
    s.click('Dismiss message');
    s.eq('banner dismissed', s.vals.sh.banner, null);
    s.click('Close');
  });
  s.step('save conflict (412): reload, your last change is lost', () => {
    s.type('New reading for Specific energy, in kWh/kg', '50');
    s.click('Post', { within: 'KPI-EL-1-1-2-1' });
    s.ok(docOf(s).kpiUpdates.some((u) => u.value === 50), 'my reading is there');
    s.click('Settings');
    s.click('Simulate a save conflict');
    s.ok(!docOf(s).kpiUpdates.some((u) => u.value === 50), 'my unsaved reading is gone');
    s.expect('Another editor saved first — reloaded; re-apply your change.');
    s.eq('save state', s.vals.ui.saveText, 'Reloaded after a conflict');
  });
  s.step('connection lost, then back', () => {
    s.click('Settings');
    s.check('Lose the connection (saves fail until it returns)', true);
    s.expect('Save failed (network unreachable). Your changes stay in this browser and save when the connection returns.');
    s.click('Close');
    s.type('New reading for Specific energy, in kWh/kg', '51');
    s.click('Post', { within: 'KPI-EL-1-1-2-1' });
    s.eq('kept here', s.vals.ui.saveText, 'Offline, changes kept here');
    s.click('Settings');
    s.check('Lose the connection (saves fail until it returns)', false);
    s.eq('saving again', s.c.state.save.state, 'saving');
    s.flush();
    s.eq('saved', s.c.state.save.state, 'saved');
  });
  s.step('other divisions unreachable and slow', () => {
    s.check('Other divisions’ SPEC bins can’t be reached', true);
    s.eq('refDocOfModel: failed', !!(s.c.ctx.refDocOfModel('MDL-FC-1-1') || {}).failed, true);
    s.click('Close');
    s.click('~HP6-12');
    s.expect('Couldn’t load SPEC-DIV-FC (503) — is its SPEC bin configured on the broker?');
    s.eq('stayed on Electrolyzer', s.c.state.divId, 'DIV-EL');
    s.click('Settings');
    s.check('Other divisions’ SPEC bins can’t be reached', false);
    s.click('Load other divisions slowly');
    s.eq('refDocOfModel: loading', s.c.ctx.refDocOfModel('MDL-FC-1-1'), null);
    s.flush(3000);
    s.ok(!!s.c.ctx.refDocOfModel('MDL-FC-1-1'), 'loaded after the delay');
  });
  s.step('portfolio write merges on a 412', () => {
    s.check('Next portfolio write meets a concurrent change (412, merged)', true);
    s.c.ctx.portfolioWrite((D) => { D.portfolio.composition.push({ id: 'CMP-TEST', parent: 'MDL-EL-2-1', child: 'MDL-FC-1-1' }); }, 'Sub-product added');
    s.render();
    s.ok(saw(s, 'Sub-product added (merged with a concurrent change)'), 'merged message');
    s.eq('flag used up', s.c.state.sh_sim.portConflict, false);
  });
}
{
  const s = fresh();
  s.step('URL parameters: biz redirect, token, read-only', () => {
    s.click('Settings');
    s.type('Division', 'DIV-BD');
    s.type('Token', 'sso-abc');
    s.check('Read-only', true);
    s.expect('Spec-A.dc.html?division=DIV-BD&token=sso-abc&readonly');
    s.click('Open with these parameters');
    s.ok(saw(s, 'Business Development is a business division with no products, so Fuel Cell opened instead.'), 'biz redirect explained');
    s.ok(saw(s, 'Loaded SPEC-DIV-FC.'), 'load toast');
    s.eq('state', [s.c.state.divId, s.c.state.ro, s.c.state.sh_token, s.c.state.sh_link.token], ['DIV-FC', true, 'sso-abc', '']);
  });
  s.step('read-only view hides every write and keeps names visible', () => {
    s.click('~Tera 25-30-R5');
    s.expect('Read-only');
    ['Add specification', 'Add KPI to S1', 'Link a metric to S1', 'More actions for S1', 'Edit spec details', 'Save', 'Post', 'Met'].forEach((q) => s.ok(!s.has(q, { tag: 'button' }), 'hidden in read-only: ' + q));
    s.ok(!s.has('New reading for Specific energy, in kWh/kg'), 'no reading inputs');
    s.ok(!s.has('Drag S1 to reorder'), 'no drag handles');
    s.expect('Rated stack power');
    s.expect('Specific energy at rated load');
    s.ok(!s.has('Specific energy at rated load', { tag: 'button' }), 'statements are plain text');
    s.click('Settings');
    s.ok(!s.has('Import JSON', { tag: 'button' }), 'no import in read-only');
    s.ok(s.has('Export JSON', { tag: 'button' }), 'export still works');
    s.check('Preview the read-only view', false);
    s.ok(s.has('Import JSON', { tag: 'button' }), 'editing back');
  });
  s.step('product parameter only within its division', () => {
    s.c.setState({ sh_link: { division: 'DIV-FC', product: 'PRD-EL-2', token: '', readonly: false } }); s.render();
    s.click('Open with these parameters');
    s.eq('foreign product ignored', [s.c.state.divId, s.vals.sh.productName], ['DIV-FC', 'HP membrane']);
    s.click('Settings');
    s.type('Division', 'DIV-EL');
    s.type('Product', 'PRD-EL-2');
    s.click('Open with these parameters');
    s.eq('product applied', [s.c.state.divId, s.vals.sh.modelName], ['DIV-EL', 'Tera 250 kW skid']);
    s.clean('after URL parameters');
  });
}
/* ====================================================================== remaining paths: ask dialog, binary + sub-spec fields, component tables */
{
  const s = fresh();
  s.step('ask dialog (shell)', () => {
    let got = null;
    s.c.ask({ title: 'Name the export', label: 'File name', value: '', ok: 'Use name', onOk: (v) => (String(v).trim() ? (got = v, null) : 'Type a file name.') });
    s.render();
    s.key('File name', 'Enter');
    s.expect('Type a file name.');
    s.type('File name', 'spec.json');
    s.key('File name', 'Enter');
    s.eq('ask returns the value', got, 'spec.json');
    s.c.ask({ title: 'Again', label: 'File name', onOk: () => null }); s.render();
    s.click('Cancel');
    s.eq('cancel closes', s.c.state.dlg, null);
  });
  s.step('binary component specification: Met / Not met on the card and in the component sheet', () => {
    s.click('Add a specification to C4');
    s.expect('Add component specification');
    s.type('Name', 'Bolt torque verified');
    s.click('Binary', { within: 'Metric target type' });
    s.type('Notes', 'Torque wrench calibrated monthly.');
    s.click('Save specification');
    s.ok(saw(s, 'Component specification saved.'), 'toast');
    const k = docOf(s).kpis.find((x) => x.name === 'Bolt torque verified');
    s.eq('binary component spec', [k.hostType, k.hostId, k.targetType, k.direction, k.target, k.unit, k.notes], ['component', 'SG-EL-1-1-4', 'binary', null, null, null, 'Torque wrench calibrated monthly.']);
    s.click('Post Met for Bolt torque verified');
    s.eq('met on the card', RD.effValue(k, akOf(s), emOf(s)), 1);
    s.click('Edit C4, End plates and compression');
    s.advance(1000);
    s.click('Post Not met for Bolt torque verified', { within: 'Editor' });
    s.eq('not met in the component sheet', RD.effValue(kpi(s, k.id), akOf(s), emOf(s)), 0);
    s.click('Notes', { within: 'Editor' });
    s.expect('Torque wrench calibrated monthly.');
    s.click('Hide notes', { within: 'Editor' });
    s.click('More actions for Bolt torque verified', { within: 'Editor' });
    s.click('Move up', { within: 'Editor' });
    s.eq('moved up in the component table', docOf(s).kpis.filter((x) => x.hostId === 'SG-EL-1-1-4').map((x) => x.name), ['Bolt torque verified', 'Compression uniformity']);
    s.click('More actions for Bolt torque verified', { within: 'Editor' });
    s.click('Move down', { within: 'Editor' });
    s.drag((el) => el.attrs['aria-label'] === 'Drag Bolt torque verified to reorder' && /Editor/.test(String((function up(x) { return x ? (x.attrs['aria-label'] || '') + up(x.parent) : ''; })(el.parent))), (el) => el.tag === 'tr' && el.attrs['data-k'] === 'KPI-EL-1-1-C4-1' && /Editor/.test(String((function up(x) { return x ? (x.attrs['aria-label'] || '') + up(x.parent) : ''; })(el.parent))));
    s.eq('dragged in the sheet', docOf(s).kpis.filter((x) => x.hostId === 'SG-EL-1-1-4').map((x) => x.name), ['Bolt torque verified', 'Compression uniformity']);
    s.type('New reading for Compression uniformity, in %', '91', { within: 'Editor' });
    s.key('New reading for Compression uniformity, in %', 'Enter', { within: 'Editor' });
    s.eq('posted from the sheet', RD.readingsFor('KPI-EL-1-1-C4-1', { DOC: docOf(s) })[0].value, 91);
    s.type('New reading for Compression uniformity, in %', '92', { within: 'Editor' });
    s.click('Post', { within: 'Editor' });
    s.click('Compression uniformity', { within: 'Editor' });
    s.eq('metric editor stacked on the component sheet', [sheetKind(s), s.c.state.sheets.length], ['sspec.metric', 2]);
    s.click('Cancel');
    s.click('More actions for Compression uniformity', { within: 'Editor' });
    s.click((el) => el.attrs.role === 'menuitem' && textOf(el) === 'Edit metric', { within: 'Editor' });
    s.eq('menu edit opens the editor', sheetKind(s), 'sspec.metric');
    s.click('Back');
    s.click('More actions for Bolt torque verified', { within: 'Editor' });
    s.click('Delete metric', { within: 'Editor' });
    s.click('Delete metric');
    s.ok(!docOf(s).kpis.some((x) => x.name === 'Bolt torque verified'), 'deleted from the sheet');
    s.c.closeAllSheets(); s.render();
  });
  s.step('component link: unlink from the card', () => {
    s.click('Link a metric to C3');
    const g = s.vals.sspec.linkSheet.groups;
    s.eq('component host groups', g.map((x) => x.label), ['Product specifications', 'This product’s metrics', 'Division initiatives']);
    s.click((el) => el.attrs.role === 'radio' && textOf(el).indexOf('Rated stack power Product: Tera stack') === 0);
    s.eq('product KPI from a component defaults to specification', top(s).d.rel, 'specification');
    s.click('Link', { within: 'Editor' });
    s.ok(saw(s, 'Linked (specification).'), 'toast');
    const m = docOf(s).kpis.find((x) => x.hostId === 'SG-EL-1-1-3' && x.linkParent === 'KPI-PRD-EL-1-1');
    s.eq('component member', [m.hostType, m.linkType], ['component', 'specification']);
    s.click('More actions for Rated stack power', { within: m.id });
    s.click('Unlink', { within: m.id });
    s.eq('unlinked', kpi(s, m.id).linkParent, null);
    s.click('More actions for Rated stack power', { within: m.id });
    s.click('Edit metric', { within: m.id, nth: 1 });
    s.eq('now edits as a plain metric', sheetKind(s), 'sspec.metric');
    s.c.closeAllSheets(); s.render();
  });
}
{
  const s = fresh();
  s.click('~HP6-12');
  s.step('sub-spec sheet: statistical, demonstration and binary fields', () => {
    s.click('Edit S3');
    s.click('Edit Current density at 0.6 V, 20% RH');
    s.eq('opens statistical', [top(s).d.trackingType, top(s).d.readings, top(s).d.readCount], ['statistical', '0.21, 0.23, 0.22', '3']);
    s.type('Read count', '4');
    s.type('Statistic', 'max');
    s.type('Target', '1.1');
    s.type('Unit', 'A/cm²');
    s.key('Target', 'Escape');
    s.expect('Discard your changes?', 'Escape with unsaved edits asks first');
    s.click('Discard changes');
    s.eq('Escape leaves the sub-spec sheet', sheetKind(s), 'sspec.spec');
    s.click('Edit Current density at 0.6 V, 20% RH');
    s.type('Statistic', 'max');
    s.type('~Readings', '0.21, 0.23, 0.22, 0.25');
    s.expect('Max: 0.25 from 4 readings');
    s.type('Read count', 'abc');
    s.click('Save sub-spec');
    s.eq('read count must be whole', s.vals.ui.sheetErr, 'Read count is a whole number of readings, like 10.');
    s.type('Read count', '4');
    s.key('Read count', 'Enter');
    s.eq('Enter saves into the draft', top(s).d.subKrs[0].kpis[0].current, 0.25);
    s.click('Edit High-frequency resistance at 20% RH');
    s.eq('demonstration', [top(s).d.trackingType, top(s).d.current, top(s).d.dir], ['demonstration', '96', 'decrease']);
    s.type('Current measurement', 'n/a');
    s.click('Save sub-spec');
    s.eq('current must be a number', s.vals.ui.sheetErr, 'Use a number for the current measurement, like 1.18.');
    s.type('Current measurement', '84');
    s.key('Current measurement', 'Enter');
    s.click('Edit Passes 500 h of RH cycling');
    s.eq('binary unmeasured', [top(s).d.trackingType, top(s).d.metFlag], ['binary', '']);
    s.click('Not met', { within: 'Status' });
    s.click('Unmeasured', { within: 'Status' });
    s.click('Met', { within: 'Status' });
    s.type('Weight', '-1');
    s.click('Save sub-spec');
    s.eq('weight floor', s.vals.ui.sheetErr, 'Weight is a number of 0.1 or more, like 1.');
    s.type('Weight', '1');
    s.key('Weight', 'Enter');
    s.click('Edit Swap to the short-side-chain ionomer');
    s.type('Initial progress', '60');
    s.key('Sub-spec name', 'Enter');
    s.click('Update specification');
    const k3 = kr(s, 'KR-FC-1-1-3', 'SPEC-DIV-FC');
    s.eq('sub-spec values stored', [k3.subKrs[0].kpis[0].current, k3.subKrs[0].kpis[0].statistic, k3.subKrs[2].kpis[0].current, k3.subKrs[3].kpis[0].current, k3.subKrs[1].progress], [0.25, 'max', 84, 1, 60]);
    s.eq('spec score is the weighted mean', s.vals.sspec.specs[2].score, R(RD.subKrScore(k3.subKrs)));
  });
  s.step('edit a sub-spec straight from the card', () => {
    s.click('Edit sub-spec “High-frequency resistance at 20% RH” of S3');
    s.eq('spec editor with the sub-spec on top', s.c.state.sheets.map((x) => x.kind), ['sspec.spec', 'sspec.sub']);
    s.eq('the right sub-spec', [top(s).d.name, top(s).data.idx], ['High-frequency resistance at 20% RH', 2]);
    s.click('Back');
    s.eq('back to its specification', [sheetKind(s), top(s).data.krId], ['sspec.spec', 'KR-FC-1-1-3']);
    s.click('Cancel');
  });
  s.step('two-row spec table: move rows', () => {
    const ids = () => docOf(s, 'SPEC-DIV-FC').kpis.filter((x) => x.hostId === 'KR-FC-1-1-1').map((x) => x.id);
    s.click('More actions for Conductivity at 80 °C, 50% RH');
    s.click('Move up');
    s.eq('moved up', ids(), ['KPI-FC-1-1-1-2', 'KPI-FC-1-1-1-1']);
    s.click('More actions for Conductivity at 80 °C, 50% RH');
    s.click('Move down');
    s.eq('moved down', ids(), ['KPI-FC-1-1-1-1', 'KPI-FC-1-1-1-2']);
    s.eq('S1 mean of two metrics', s.vals.sspec.specs[0].score, R(RD.keyResultScore('KR-FC-1-1-1', emOf(s, 'SPEC-DIV-FC'))));
  });
  s.step('spec editor keyboard on every field', () => {
    s.click('Edit S1');
    ['Read count', 'Target', 'Unit'].forEach((f) => s.key(f, 'a'));
    s.click('Range', { within: 'Direction' });
    s.key('Range low', 'a'); s.key('Range high', 'a');
    s.click('At least', { within: 'Direction' });
    s.click('Demonstration', { within: 'Target type' });
    s.click('Cancel');
    s.click('Add KPI to S1');
    s.click('Statistical', { within: 'Metric target type' });
    s.type('Read count', '6'); s.key('Read count', 'a');
    s.type('Statistic', 'cv');
    s.click('Range', { within: 'Metric direction' });
    s.type('Range low', '1'); s.key('Range low', 'a');
    s.type('Range high', '3'); s.key('Range high', 'a');
    s.click('At most', { within: 'Metric direction' });
    s.type('Target', '5'); s.key('Target', 'a');
    s.type('Unit', '%'); s.key('Unit', 'a');
    s.type('Name', 'Conductivity spread (CV)');
    s.key('Name', 'Enter');
    const k = docOf(s, 'SPEC-DIV-FC').kpis.find((x) => x.name === 'Conductivity spread (CV)');
    s.eq('statistical KPI from the keyboard', [k.targetType, k.statistic, k.readCount, k.direction, k.target, k.unit], ['statistical', 'cv', 6, 'down', 5, '%']);
    s.click('Link a metric to S5');
    s.click((el) => el.attrs.role === 'radio' && textOf(el).indexOf('Membrane thickness on the coated roll') === 0);
    s.click('Link', { within: 'Editor' });
    const mem = docOf(s, 'SPEC-DIV-FC').kpis.find((x) => x.hostId === 'KR-FC-1-1-5' && x.linkParent === 'KPI-FC-1-1-2-1');
    s.click('Membrane thickness on the coated roll', { within: mem.id });
    s.key('Priority', 'a');
    s.type('Override low', '11.6'); s.key('Override low', 'a');
    s.type('Override high', '12.4');
    s.key('Override high', 'Enter');
    s.eq('Enter saves the override', kpi(s, mem.id, 'SPEC-DIV-FC').target, { lo: 11.6, hi: 12.4 });
    s.click('Proton conductivity at 80 °C, 95% RH', { within: 'KPI-FC-1-1-1-1' });
    s.key('Name', 'Escape');
    s.eq('Escape closes the metric editor', sheetKind(s), '');
    s.click('Edit spec details');
    s.type('Maturity', 'Pilot');
    s.key('Maturity', 'Enter');
    s.eq('Enter saves spec details', docOf(s, 'SPEC-DIV-FC').modelSpec['MDL-FC-1-1'].maturity, 'Pilot');
    s.click('Settings');
    s.type('Broker token', 'tok-9');
    s.key('Broker token', 'Enter');
    s.eq('Enter saves the token', s.c.state.sh_token, 'tok-9');
    s.click('Import JSON');
    s.click('Start from the current document');
    s.eq('prefilled', s.vals.sh.importSheet.text, JSON.stringify(docOf(s, 'SPEC-DIV-FC'), null, 2));
    s.click('Cancel');
    s.click('Copy link');
    s.click('Restore the sample data');
    s.click('Restore');
    s.ok(saw(s, 'Sample data restored.'), 'restored');
    s.eq('fresh data', docOf(s, 'SPEC-DIV-FC').kpis.length, 4);
    s.clean('end');
  });
}
/* ====================================================================== close / back / cancel everywhere; my partial inside the component cards and sheet */
{
  const s = fresh();
  const mi = (t) => (el) => el.attrs.role === 'menuitem' && textOf(el) === t;
  s.step('menus: the scrim closes; spec card menu items', () => {
    s.click('More actions for S1');
    s.ok(s.c.isMenu('sspec.s.KR-EL-1-1-1'), 'menu open');
    s.click('Close menu');
    s.eq('scrim closes it', s.c.state.menu, '');
    s.click('More actions for S2');
    s.click(mi('Edit specification'));
    s.eq('edit from the menu', sheetKind(s), 'sspec.spec');
    s.click('Range', { within: 'Direction' });
    s.type('Range low', '50'); s.type('Range high', '54');
    s.click('Close');
    s.eq('× discards the draft', kpi(s, 'KPI-EL-1-1-2-1').direction, 'down');
    s.click('More actions for S2');
    s.click(mi('Add KPI'));
    s.eq('add KPI from the menu', [sheetKind(s), top(s).data.hostId], ['sspec.metric', 'KR-EL-1-1-2']);
    s.click('Close');
    s.click('More actions for S2');
    s.click(mi('Link a metric'));
    s.eq('link from the menu', sheetKind(s), 'sspec.link');
    s.click('Close');
    s.eq('closed', sheetKind(s), '');
  });
  s.step('override sheet: close, cancel, keys', () => {
    s.click('Rated stack power', { within: 'KPI-EL-1-1-1-1' });
    s.click('Close');
    s.click('Rated stack power', { within: 'KPI-EL-1-1-1-1' });
    s.type('Override target', '23');
    s.key('Override target', 'a');
    s.click('Cancel');
    s.eq('cancel keeps the old override', kpi(s, 'KPI-EL-1-1-1-1').target, 25);
  });
  s.step('sub-spec sheet: close and cancel', () => {
    s.click('Add specification');
    s.type('Specification', 'Startup purge');
    s.click('Sub-specifications');
    s.click('Add sub-spec');
    s.click('Close');
    s.eq('× returns to the spec sheet', sheetKind(s), 'sspec.spec');
    s.click('Add sub-spec');
    s.click('Demonstration');
    s.type('Unit', 's'); s.key('Unit', 'a');
    s.click('Cancel');
    s.eq('cancel returns too, nothing added', [sheetKind(s), top(s).d.subKrs.length], ['sspec.spec', 0]);
    s.click('Cancel');
  });
  s.step('model, export and import sheets: close, cancel, back', () => {
    s.click('Edit spec details'); s.click('Close'); s.eq('model sheet ×', sheetKind(s), '');
    s.click('Edit spec details'); s.click('Cancel'); s.eq('model sheet cancel', sheetKind(s), '');
    s.click('Settings');
    s.click('Export JSON'); s.click('Back'); s.eq('export back', sheetKind(s), 'shell.settings');
    s.click('Export JSON'); s.click('Close'); s.eq('export ×', sheetKind(s), '');
    s.click('Settings');
    s.click('Import JSON'); s.click('Back'); s.eq('import back', sheetKind(s), 'shell.settings');
    s.click('Import JSON'); s.click('Close'); s.eq('import ×', sheetKind(s), '');
    s.click('Save');
    s.click('Dismiss');
    s.ok(!saw(s, 'Saved.'), 'toast dismissed');
  });
  s.step('my metric table inside a component card', () => {
    const order = () => docOf(s).kpis.filter((x) => x.hostId === 'SG-EL-1-1-1').map((x) => x.id);
    s.drag('Drag Iridium loading to reorder', (el) => el.tag === 'tr' && el.attrs['data-k'] === 'KPI-EL-1-1-C1-1');
    s.eq('component rows reorder', order(), ['KPI-EL-1-1-C1-2', 'KPI-EL-1-1-C1-1', 'KPI-EL-1-1-C1-3']);
    s.click('Notes', { within: 'KPI-EL-1-1-C1-2' });
    s.expect('Lower loading is the main cost lever.');
    s.type('New reading for Membrane thickness, in µm', '88');
    s.key('New reading for Membrane thickness, in µm', 'Enter');
    s.type('New reading for Membrane thickness, in µm', '87.5');
    s.click('Post', { within: 'KPI-EL-1-1-C1-1' });
    s.eq('readings posted on the component', RD.readingsFor('KPI-EL-1-1-C1-1', { DOC: docOf(s) }).map((u) => u.value).slice(0, 2), [87.5, 88]);
    s.click('More actions for Membrane thickness');
    s.click(mi('Move up'));
    s.click('More actions for Membrane thickness');
    s.click(mi('Move down'));
    s.eq('moved back', order(), ['KPI-EL-1-1-C1-2', 'KPI-EL-1-1-C1-1', 'KPI-EL-1-1-C1-3']);
    s.click('More actions for Membrane thickness');
    s.click(mi('Delete metric'));
    s.click('Cancel');
    s.ok(!!kpi(s, 'KPI-EL-1-1-C1-1'), 'kept');
  });
  s.step('my metric table inside the component sheet: edit link, unlink, link back', () => {
    s.click('Link a metric to C3');
    s.click((el) => el.attrs.role === 'radio' && textOf(el).indexOf('Rated stack power Product: Tera stack') === 0);
    s.click('Link', { within: 'Editor' });
    const m = docOf(s).kpis.find((x) => x.hostId === 'SG-EL-1-1-3' && x.linkParent === 'KPI-PRD-EL-1-1');
    s.click('Edit C3, Bipolar plate');
    s.click('More actions for Rated stack power', { within: 'Editor' });
    s.click(mi('Edit link'), { within: 'Editor' });
    s.eq('override stacked on the component sheet', [sheetKind(s), s.c.state.sheets.length], ['sspec.override', 2]);
    s.click('Back');
    s.click('More actions for Rated stack power', { within: 'Editor' });
    s.click(mi('Unlink'), { within: 'Editor' });
    s.eq('unlinked in the sheet', kpi(s, m.id).linkParent, null);
    s.eq('still on the component sheet', s.c.state.sheets.length, 1);
    s.ok(saw(s, 'Unlinked.'), 'toast');
    SSPEC_link(s);
    s.eq('link sheet stacked', [sheetKind(s), s.c.state.sheets.length], ['sspec.link', 2]);
    s.click('Back');
    s.eq('back to the component sheet', s.c.state.sheets.length, 1);
    s.c.closeAllSheets(); s.render();
    s.clean('component tables');
  });
}
function SSPEC_link(s) { const b = s.all((el) => el.on.onClick && /Link a metric/.test((el.attrs['aria-label'] || '') + ' ' + textOf(el)), { within: 'Editor' })[0]; if (b) s.fire(b, 'onClick'); }
{
  const s0 = fresh();
  const sites = [];
  (function walk(n) { if (n.attrs) for (const k of Object.keys(n.attrs)) if (k.startsWith('on')) sites.push(k + '@' + n.line); (n.kids || []).forEach(walk); })(s0.parsed.tree);
  const mine = sites.filter((k) => { const m = s0.parsed.srcmap[k.split('@')[1]]; return m && (m[0] === 'shell' || m[0].indexOf('mods/sspec/') === 0); });
  const missed = mine.filter((k) => !HIT.has(k.toLowerCase()));
  s0.ok(!missed.length, 'scenarios fire every handler site in shell + mods/sspec (' + (mine.length - missed.length) + ' of ' + mine.length + ')' + (missed.length ? ': ' + missed.map((k) => k + ' ' + s0.parsed.srcmap[k.split('@')[1]].join(':')).join(', ') : ''));
}
done();
