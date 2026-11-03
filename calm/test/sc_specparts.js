/* Scenario: Product spec components (mods/scomp) and sub-products, component owners,
   cross-product dependencies (mods/ssub). Spec inventory §8, §9 (through the shared
   SSPEC sheet), §12, §13 and their parts of §15-17, §20-21.

     node test/sc_specparts.js [out/scomp/Spec-A.dc.html]
*/
const path = require('path');
const { Sim, done, textOf } = require('./dc');
const RD = require(require('./engine_path'));
const FILE = process.argv[2] || 'out/scomp/Spec-A.dc.html';

let s = new Sim(FILE);
const D = () => s.c.D;
const EL = () => D().spec['SPEC-DIV-EL'];
const FC = () => D().spec['SPEC-DIV-FC'];
const P = () => D().portfolio;
const em = (doc) => RD.withPortfolio(P(), { DOC: doc || EL() });
const remOf = (doc) => RD.withPortfolio(P(), { REF: doc });
const sc = (v) => (v == null ? '—' : String(Math.round(v)));
const byData = (tag, k) => (el) => el.tag === tag && el.attrs['data-k'] === k;
const textAt = (tag, k) => { const el = s.all(byData(tag, k))[0]; return el ? textOf(el) : ''; };
const card = (id) => textAt('article', id);
const row = (key) => textAt('tr', key);
const numIn = (id) => { const el = s.all((e) => e.attrs.class === 'scomp-num', { within: id })[0]; return el ? textOf(el) : null; };
const goModel = (name) => s.click('~' + name, { within: 'Products' });
const sheetTitle = () => { const el = s.all((e) => e.tag === 'h2' && e.parent && e.parent.attrs.class === 'sh-title')[0]; return el ? textOf(el) : ''; };
const comps = () => EL().stageGates.filter((g) => g.objectiveId === 'MDL-EL-1-1' && !g.refModel).map((g) => g.id);
const kpi = (id, doc) => (doc || EL()).kpis.find((k) => k.id === id);
const fresh = () => { s = new Sim(FILE); };
const openOwners = () => { if (!s.c.state.ssub_ownOpen) s.click((el) => el.attrs.class === 'ssub-tgl' && /Component owners/.test(textOf(el))); };
const setSim = (label, on) => { s.click('Settings'); s.check(label, on); s.click('Close', { within: 'Editor' }); };
const REFDOWN = 'Other divisions’ SPEC bins can’t be reached';
/* today's import preview (L1756): the first six names, then how many more */
const listOf = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const importPreview = (doc, model) => {
  const sp = doc.keyResults.filter((r) => r.objectiveId === model);
  if (!sp.length) return 'This model has no specifications yet. It will be added as an empty sub-product.';
  const names = sp.slice(0, 6).map((r) => r.statement || r.id);
  return sp.length + (sp.length === 1 ? ' specification' : ' specifications') + ' will import: ' + (sp.length > 6 ? names.join(', ') + ' and ' + (sp.length - 6) + ' more' : listOf(names)) + '.';
};
const fcSpecs = () => FC().keyResults.filter((r) => r.objectiveId === 'MDL-FC-1-1');

/* =============================================================== components */
s.step('components panel: cards, type and status, engine scores', () => {
  s.expect('Components');
  s.eq('four components on Tera 25-30-R5', comps(), ['SG-EL-1-1-1', 'SG-EL-1-1-2', 'SG-EL-1-1-3', 'SG-EL-1-1-4']);
  const names = ['Membrane electrode assembly', 'Porous transport layer', 'Bipolar plate', 'End plates and compression'];
  comps().forEach((id, i) => {
    s.ok(card(id).indexOf('C' + (i + 1)) >= 0 && card(id).indexOf(names[i]) >= 0, 'card ' + id + ' shows C' + (i + 1) + ' and its name');
    const want = RD.hostScore('component', id, em());
    s.eq('score ' + id + ' matches RD.hostScore', numIn(id), want == null ? '' : sc(want));
  });
  s.ok(/MEA/.test(card('SG-EL-1-1-1')) && /Prototype/.test(card('SG-EL-1-1-1')), 'type and status shown on C1');
  s.ok(/Second source in trial/.test(card('SG-EL-1-1-3')), 'free-text status shown');
  s.ok(/Off target/.test(card('SG-EL-1-1-4')) && /Meets/.test(card('SG-EL-1-1-1')), 'band words from today’s legend');
  s.expect('3 of 4 conformant');
  s.ok(/Iridium loading/.test(card('SG-EL-1-1-1')) && /Gates Rated stack power/.test(card('SG-EL-1-1-1')), 'component metric table with the gates badge (shared SSPEC table)');
  s.ok(/2 of 4 readings/.test(card('SG-EL-1-1-4')), 'statistical sample shown in the shared table');
  const h2 = row('KPI-EL-1-1-C1-3');
  s.ok(/H₂ in O₂/.test(h2) && /Linked/.test(h2) && /Inherited/.test(h2) && /≤ 1%/.test(h2) && /0\.48%/.test(h2), 'a linked component metric: the MEA’s H₂ in O₂ inherits the stack’s Gas purity target and keeps its own reading');
  s.ok(s.has('Notes', { within: 'SG-EL-1-1-4' }) && !/Disc springs/.test(card('SG-EL-1-1-4')), 'component notes collapsed by default');
  s.click('Notes', { within: 'SG-EL-1-1-4' });
  s.ok(/Disc springs set to 30 N·m/.test(card('SG-EL-1-1-4')), 'component notes expand');
  s.click('Hide notes', { within: 'SG-EL-1-1-4' });
  s.eq('C4 score is discounted for 2 of 4 readings', numIn('SG-EL-1-1-4'), sc(87 / 90 * 100 * 0.5));
  s.clean('components panel');
});

s.step('collapse and expand the panel (memory only)', () => {
  s.click((el) => el.attrs.class === 'scomp-tgl');
  s.ok(!s.has(byData('article', 'SG-EL-1-1-1')), 'collapsed hides the cards');
  s.eq('collapse is UI state only', s.c.state.scomp_closed, true);
  s.click((el) => el.attrs.class === 'scomp-tgl');
  s.ok(s.has(byData('article', 'SG-EL-1-1-1')), 'expanded again');
});

s.step('add a component, then add its first specification in the same sheet', () => {
  s.click('Add component');
  s.eq('sheet title', sheetTitle(), 'Add component');
  s.expect('Add the component first');
  s.type('Name', '  Cell frame and seals ');
  s.type('Type optional', 'Frame');
  s.type('Status optional', 'Concept');
  s.type('Notes', 'PPS frames; seal creep at 80 °C is the open risk.');
  s.click('Add component', { within: 'Editor' });
  const g = EL().stageGates.find((x) => x.id === 'SG-EL-1-1-5');
  s.eq('new component record (id from RD.allocId, trimmed fields)', g && { objectiveId: g.objectiveId, name: g.name, ctype: g.ctype, status: g.status, notes: g.notes },
    { objectiveId: 'MDL-EL-1-1', name: 'Cell frame and seals', ctype: 'Frame', status: 'Concept', notes: 'PPS frames; seal creep at 80 °C is the open risk.' });
  s.expect('Component added. You can add its specifications now.');
  s.eq('sheet stays open on the new component', sheetTitle(), 'Edit component');
  s.ok(/No data/.test(card('SG-EL-1-1-5')) && numIn('SG-EL-1-1-5') === '', 'a component without measured specifications has no score yet');
  s.expect('Component specifications');
  s.expect('No metrics yet. Add or link a measurement.');
  s.click('Add specification', { within: 'component-specifications' });
  s.eq('shared §9 sheet stacks on top', sheetTitle(), 'Add component specification');
  s.eq('two sheets on the stack', s.c.state.sheets.map((x) => x.kind), ['scomp.comp', 'sspec.metric']);
  s.type('Name', 'Seal compression set');
  s.click('At most');
  s.type('Target', '15');
  s.type('Unit', '%');
  s.type('Gates a product specification (optional)', 'KR-EL-1-1-3');
  s.click('Save specification');
  s.expect('Gating spec saved — gates “Voltage degradation”.');
  s.eq('back on the component sheet', sheetTitle(), 'Edit component');
  const k = kpi('KPI-EL-1-1-5');
  s.eq('component specification record', k && { hostType: k.hostType, hostId: k.hostId, objectiveId: k.objectiveId, name: k.name, targetType: k.targetType, direction: k.direction, target: k.target, unit: k.unit, gates: k.gates },
    { hostType: 'component', hostId: 'SG-EL-1-1-5', objectiveId: 'MDL-EL-1-1', name: 'Seal compression set', targetType: 'demonstration', direction: 'down', target: 15, unit: '%', gates: 'KR-EL-1-1-3' });
  s.expect('Seal compression set');
  s.click('Add specification', { within: 'component-specifications' });
  s.type('Name', 'Leak test at 30 bar');
  s.click('Binary');
  s.click('Save specification');
  s.expect('Component specification saved.');
  const kb = EL().kpis.find((x) => x.hostId === 'SG-EL-1-1-5' && x.name === 'Leak test at 30 bar');
  s.eq('binary specification clears direction, target and unit', kb && [kb.targetType, kb.direction, kb.target, kb.unit], ['binary', null, null, null]);
  s.click('Post Met for Leak test at 30 bar', { within: 'component-specifications' });
  s.expect('Reading posted.');
  s.eq('binary reading 1 = met', EL().kpiUpdates.filter((u) => u.kpiId === kb.id).map((u) => u.value), [1]);
  s.eq('still on the component sheet', sheetTitle(), 'Edit component');
  s.click('Close', { within: 'Editor' });
  s.click('Post Not met for Leak test at 30 bar', { within: 'SG-EL-1-1-5' });
  s.click('Post Met for Leak test at 30 bar', { within: 'SG-EL-1-1-5' });
  s.eq('Met / Not met from the card post 1 and 0', EL().kpiUpdates.filter((u) => u.kpiId === kb.id).map((u) => u.value), [1, 0, 1]);
  s.eq('sheet closed', s.c.state.sheets.length, 0);
  s.ok(/C5/.test(card('SG-EL-1-1-5')) && /Frame/.test(card('SG-EL-1-1-5')) && /Concept/.test(card('SG-EL-1-1-5')), 'new card C5 with type and status');
  s.eq('C5 scored on its specifications: unread target counts 0 (RD.hostScore)', numIn('SG-EL-1-1-5'), sc(RD.hostScore('component', 'SG-EL-1-1-5', em())));
  s.ok(/Off target/.test(card('SG-EL-1-1-5')), 'C5 off target until the seal is measured');
  s.clean('after adding a component');
});

s.step('post a reading on a component specification (shared table) and the score follows', () => {
  s.type('~New reading for Seal compression set', '12', { within: 'SG-EL-1-1-5' });
  s.click('Post', { within: 'SG-EL-1-1-5' });
  s.expect('Reading posted.');
  const ups = EL().kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-1-1-5');
  s.eq('reading stored', ups.map((u) => u.value), [12]);
  s.eq('C5 score = RD.hostScore', numIn('SG-EL-1-1-5'), sc(RD.hostScore('component', 'SG-EL-1-1-5', em())));
  s.ok(/Meets/.test(card('SG-EL-1-1-5')), 'C5 now meets');
  s.ok(/Gates Voltage degradation/.test(card('SG-EL-1-1-5')), 'gates badge on the new specification');
});

s.step('notes on a component expand and collapse', () => {
  s.ok(!/seal creep at 80/.test(card('SG-EL-1-1-5')), 'notes collapsed by default');
  s.click('Notes', { within: 'SG-EL-1-1-5' });
  s.ok(/seal creep at 80/.test(card('SG-EL-1-1-5')), 'notes shown');
  s.click('Hide notes', { within: 'SG-EL-1-1-5' });
  s.ok(!/seal creep at 80/.test(card('SG-EL-1-1-5')), 'notes hidden again');
});

s.step('edit a component; its draft survives a link sheet opened on top (fixes today’s lost typing)', () => {
  s.click('Edit C1, Membrane electrode assembly');
  s.eq('sheet title', sheetTitle(), 'Edit component');
  s.ok(/Membrane thickness/.test(textOf(s.find('Editor'))) && /Iridium loading/.test(textOf(s.find('Editor'))), 'component sheet lists its specifications');
  s.click('More actions for Iridium loading', { within: 'component-specifications' });
  s.click('Move up', { within: 'component-specifications' });
  s.eq('rows reorder inside the component sheet’s table', EL().kpis.filter((k) => k.hostId === 'SG-EL-1-1-1').map((k) => k.id), ['KPI-EL-1-1-C1-2', 'KPI-EL-1-1-C1-1', 'KPI-EL-1-1-C1-3']);
  s.expect('Reordered.');
  s.eq('still on the component sheet after a row action', sheetTitle(), 'Edit component');
  s.type('Status optional', 'Pilot');
  s.click('Link a metric', { within: 'component-specifications' });
  s.eq('link sheet stacked on the component sheet', s.c.state.sheets.map((x) => x.kind), ['scomp.comp', 'sspec.link']);
  s.click('Back');
  s.eq('back on the component sheet', sheetTitle(), 'Edit component');
  s.eq('typed status kept', s.c.state.sheets[0].d.status, 'Pilot');
  s.click('Save component');
  s.expect('Component saved.');
  s.eq('status saved', EL().stageGates.find((x) => x.id === 'SG-EL-1-1-1').status, 'Pilot');
  s.eq('sheet closed after save', s.c.state.sheets.length, 0);
});

s.step('a blank name is allowed, as today; the card shows the id', () => {
  s.click('Edit C2, Porous transport layer');
  s.type('Name', '');
  s.type('Type optional', '');
  s.click('Save component');
  const g = EL().stageGates.find((x) => x.id === 'SG-EL-1-1-2');
  s.eq('blank fields stored as null', [g.name, g.ctype], [null, null]);
  s.ok(/Unnamed component \(SG-EL-1-1-2\)/.test(card('SG-EL-1-1-2')), 'card shows the id');
  s.click('~Edit C2');
  s.type('Name', 'Porous transport layer');
  s.type('Type optional', 'PTL');
  s.click('Save component');
});

s.step('Specification and Link buttons on a card open the shared sheets', () => {
  s.click('Add a specification to C3');
  s.eq('Add component specification on C3', [sheetTitle(), s.c.state.sheets[0].data.hostId], ['Add component specification', 'SG-EL-1-1-3']);
  s.click('Cancel', { within: 'Editor' });
  s.click('Link a metric to C3');
  s.eq('link sheet for C3', [s.c.state.sheets[0].kind, s.c.state.sheets[0].data.hostId], ['sspec.link', 'SG-EL-1-1-3']);
  s.click('Close', { within: 'Editor' });
  s.eq('closed', s.c.state.sheets.length, 0);
});

s.step('drag a component to reorder; Move up / Move down in the menu', () => {
  s.drag('Drag C4 to reorder', byData('article', 'SG-EL-1-1-1'));
  s.eq('C4 now sits before C1', comps(), ['SG-EL-1-1-4', 'SG-EL-1-1-1', 'SG-EL-1-1-2', 'SG-EL-1-1-3', 'SG-EL-1-1-5']);
  s.expect('Reordered.');
  s.eq('sub-product host keeps its place in the array', EL().stageGates.map((g) => g.id).indexOf('SG-EL-2-1-5'), 4);
  s.ok(/C1/.test(card('SG-EL-1-1-4')), 'tags renumber with the order');
  s.click('More actions for C1');
  s.click('Move down');
  s.eq('moved down one', comps(), ['SG-EL-1-1-1', 'SG-EL-1-1-4', 'SG-EL-1-1-2', 'SG-EL-1-1-3', 'SG-EL-1-1-5']);
  s.expect('Component moved down.');
  s.click('More actions for C2');
  s.click('Move up');
  s.eq('moved up one', comps(), ['SG-EL-1-1-4', 'SG-EL-1-1-1', 'SG-EL-1-1-2', 'SG-EL-1-1-3', 'SG-EL-1-1-5']);
  s.click('More actions for C1');
  s.ok(!s.has('Move up', { within: 'SG-EL-1-1-4' }), 'no Move up on the first card');
  s.click('More actions for C1');
});

s.step('delete a component: confirm says what goes; linked metrics elsewhere are unlinked with their values', () => {
  /* a spec metric on S2 linked (contribute) to the bipolar plate's contact resistance */
  EL().kpis.push({ id: 'KPI-EL-1-1-9', objectiveId: 'MDL-EL-1-1', hostType: 'keyResult', hostId: 'KR-EL-1-1-2', linkParent: 'KPI-EL-1-1-C3-1', linkType: 'contribute', linkPriority: 0, name: null, direction: null, unit: null, target: null });
  s.render();
  const before = EL().kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-1-1-C3-1').length;
  const cIdx = comps().indexOf('SG-EL-1-1-3') + 1;
  s.click('More actions for C' + cIdx);
  s.click('Delete component');
  s.expect('Delete Bipolar plate?');
  s.expect('Deletes Bipolar plate with its 1 specification and 1 reading.');
  s.expect('One metric elsewhere is linked to them: it keeps its current name, unit and target and is unlinked.');
  s.eq('nothing deleted before confirming', !!EL().stageGates.find((g) => g.id === 'SG-EL-1-1-3'), true);
  s.click('Delete component', { within: 'Delete Bipolar plate?' });
  s.expect('Component deleted.');
  s.eq('component gone', !!EL().stageGates.find((g) => g.id === 'SG-EL-1-1-3'), false);
  s.eq('its metric gone', !!kpi('KPI-EL-1-1-C3-1'), false);
  s.eq('its readings gone', EL().kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-1-1-C3-1').length, 0);
  s.ok(before === 1, 'there was one reading before');
  const m = kpi('KPI-EL-1-1-9');
  s.eq('linked metric materialized and unlinked', { name: m.name, direction: m.direction, unit: m.unit, target: m.target, linkParent: m.linkParent, linkType: m.linkType },
    { name: 'Interfacial contact resistance', direction: 'down', unit: 'mΩ·cm²', target: 10, linkParent: null, linkType: null });
  s.clean('after delete');
});

s.step('cancel a delete changes nothing', () => {
  s.click('More actions for C1');
  s.click('Delete component');
  s.click('Cancel', { within: '~Delete' });
  s.eq('still there', comps().length, 4);
});

/* ============================================================== sub-products */
fresh();
s.step('sub-products on the Tera 250 kW skid: imported table, values from the child document', () => {
  goModel('Tera 250 kW skid');
  s.eq('selected model', s.c.state.modelId, 'MDL-EL-2-1');
  s.expect('Sub-products');
  const host = byData('article', 'SG-EL-2-1-5');
  s.ok(s.has((el) => el.attrs['data-k'] === 'SG-EL-2-1-5'), 'sub-product card');
  s.expect('Tera stack · Tera 25-30-R5');
  s.expect('MDL-EL-1-1');
  const REM = remOf(EL());
  /* Rated stack power: the child spec's metric is linked, so (today) target 100% and value = conformance */
  const rsp = RD.keyResultScore('KR-EL-1-1-1', REM);
  s.ok(/≥ 100%/.test(row('KPI-EL-2-1-5-1')) && row('KPI-EL-2-1-5-1').indexOf(String(Math.round(rsp * 10) / 10) + '%') >= 0, 'Rated stack power: 100% target, conformance as value');
  s.ok(row('KPI-EL-2-1-5-1').indexOf(sc(RD.rawScore(rsp, 100, 'up'))) >= 0, 'Rated stack power score = rawScore');
  /* Gas purity: primary metric, with your target 0.5 */
  s.ok(/≤ 1%/.test(row('KPI-EL-2-1-5-2')) && /0\.62%/.test(row('KPI-EL-2-1-5-2')) && /≤ 0\.5%/.test(row('KPI-EL-2-1-5-2')) && /Override/.test(row('KPI-EL-2-1-5-2')), 'Gas purity: target, value, your override');
  s.ok(row('KPI-EL-2-1-5-2').indexOf(sc(RD.rawScore(0.62, 0.5, 'down'))) >= 0, 'score uses your target, no sample discount');
  /* auto-import: the child's two specifications added later show straight away */
  s.ok(/Specific energy at rated load/.test(row('SG-EL-2-1-5|KR-EL-1-1-2')) && /Inherits/.test(row('SG-EL-2-1-5|KR-EL-1-1-2')), 'Specific energy auto-imported');
  s.ok(row('SG-EL-2-1-5|KR-EL-1-1-2').indexOf(sc(RD.rawScore(53.4, 52, 'down'))) >= 0, 'auto-imported row is scored');
  s.ok(/Voltage degradation/.test(row('SG-EL-2-1-5|KR-EL-1-1-3')), 'Voltage degradation auto-imported');
  s.eq('nothing written yet (view only)', EL().kpis.filter((k) => k.hostId === 'SG-EL-2-1-5').length, 2);
  s.ok(!!host, 'host card found');
  s.clean('skid sub-products');
});

s.step('an imported row whose child specification was deleted stays, with its saved name (today’s rule)', () => {
  const keep = EL().keyResults;
  EL().keyResults = keep.filter((r) => r.id !== 'KR-EL-1-1-4');
  s.render();
  const r = row('KPI-EL-2-1-5-2');
  s.ok(/Gas purity/.test(r) && /No longer a specification of the sub-product/.test(r) && /No reading/.test(r), 'row kept with its saved name');
  s.ok(/0\.5%/.test(r) && !/≤ 0\.5%|≥ 0\.5%/.test(r), 'your target shown without a guessed direction');
  s.clean('deleted child spec');
  EL().keyResults = keep;
  s.render();
});

s.step('your target: set on an auto-imported row (materializes today’s sync), validate, clear', () => {
  s.click('Inherits', { within: 'SG-EL-2-1-5|KR-EL-1-1-2' });
  s.type('~Your target for Specific energy at rated load', '50');
  s.key('~Your target for Specific energy at rated load', 'Enter');
  s.expect('Target override set.');
  const rows = EL().kpis.filter((k) => k.hostId === 'SG-EL-2-1-5');
  s.eq('sync wrote the two missing rows with today’s ids and order', rows.map((k) => [k.id, k.refKr, k.unit, k.linkType]),
    [['KPI-EL-2-1-5-1', 'KR-EL-1-1-1', 'kW', 'specification'], ['KPI-EL-2-1-5-2', 'KR-EL-1-1-4', '%', 'specification'], ['KPI-EL-2-1-6', 'KR-EL-1-1-2', 'kWh/kg', 'specification'], ['KPI-EL-2-1-7', 'KR-EL-1-1-3', 'µV/h', 'specification']]);
  s.eq('override stored', kpi('KPI-EL-2-1-6').target, 50);
  s.ok(/≤ 50 kWh\/kg/.test(row('KPI-EL-2-1-6')) && /Override/.test(row('KPI-EL-2-1-6')), 'override shown');
  s.ok(row('KPI-EL-2-1-6').indexOf(sc(RD.rawScore(53.4, 50, 'down'))) >= 0, 'score against your target');
  s.click('≤ 50 kWh/kg', { within: 'KPI-EL-2-1-6' });
  s.type('~Your target for Specific energy at rated load', 'abc');
  s.click('Set target');
  s.expect('Use a number, like 0.5. Leave it blank to use the sub-product’s target.');
  s.eq('bad input changes nothing', kpi('KPI-EL-2-1-6').target, 50);
  s.key('~Your target for Specific energy at rated load', 'Escape');
  s.ok(!s.has('Set target'), 'Escape cancels the inline editor');
  s.click('≤ 50 kWh/kg', { within: 'KPI-EL-2-1-6' });
  s.click('Clear override');
  s.expect('Override cleared. Using the sub-product’s target.');
  s.eq('override cleared', kpi('KPI-EL-2-1-6').target, null);
  s.click('Inherits', { within: 'KPI-EL-2-1-6' });
  s.type('~Your target for Specific energy at rated load', '51');
  s.click('Set target');
  s.click('≤ 51 kWh/kg', { within: 'KPI-EL-2-1-6' });
  s.type('~Your target for Specific energy at rated load', '');
  s.click('Set target');
  s.eq('a blank target clears the override, as today', kpi('KPI-EL-2-1-6').target, null);
});

s.step('links to spec: associate an imported spec with a product specification, then clear it', () => {
  s.type('~Product specification that Gas purity links to', 'KR-EL-2-1-1');
  s.expect('Imported specification linked to a product specification.');
  s.eq('linkSpec stored', kpi('KPI-EL-2-1-5-2').linkSpec, 'KR-EL-2-1-1');
  const spec = textAt('article', 'KR-EL-2-1-1');
  s.ok(/From sub-products/.test(spec) && /Gas purity/.test(spec), 'the specification card lists it under From sub-products');
  s.ok(spec.indexOf(sc(RD.rawScore(0.62, 0.5, 'down'))) >= 0, 'with the imported score');
  s.type('~Product specification that Gas purity links to', '');
  s.expect('Link cleared.');
  s.eq('linkSpec removed', 'linkSpec' in kpi('KPI-EL-2-1-5-2'), false);
});

s.step('edit a sub-product: name and notes only', () => {
  s.click('More actions for Tera stack · Tera 25-30-R5');
  s.click('Edit sub-product');
  s.eq('sheet title', sheetTitle(), 'Edit sub-product');
  s.expect('This is a reference to another product.');
  s.ok(!s.has('Type optional'), 'no type or status for a sub-product');
  s.type('Notes', 'Four stacks per skid, manifolded in pairs.');
  s.click('Save sub-product');
  s.expect('Sub-product saved.');
  s.eq('notes saved', EL().stageGates.find((g) => g.id === 'SG-EL-2-1-5').notes, 'Four stacks per skid, manifolded in pairs.');
  s.click('Notes', { within: 'SG-EL-2-1-5' });
  s.ok(/manifolded in pairs/.test(textAt('article', 'SG-EL-2-1-5')), 'notes expand on the card');
});

s.step('cross-product dependencies on the skid', () => {
  /* the sample's one: the skid's S1 links to the Tera stack's product KPI (a specification link, as today) */
  s.expect('Cross-product dependencies');
  const t = textAt('div', 'PRD-EL-1');
  s.ok(/Tera stack/.test(t) && /Electrolyzer/.test(t), 'grouped by source product with its division');
  const r = textAt('tr', 'dep:KPI-EL-2-1-1-1');
  s.ok(/System efficiency at rated load/.test(r) && /Tera 250 kW skid/.test(r) && /Rated stack power/.test(r) && /Specification/.test(r) && /No reading/.test(r) && /≥ 25 kW/.test(r), 'row: where, model, metric, relationship, value, target');
  s.eq('the imported sub-product rows are not links, so they are not listed', s.all((el) => el.tag === 'tr' && /^dep:/.test(el.attrs['data-k'] || '')).map((el) => el.attrs['data-k']), ['dep:KPI-EL-2-1-1-1']);
  s.ok(/Imported from Tera stack/.test(textAt('article', 'KR-EL-2-1-1')), 'the spec card marks the metric as imported from the Tera stack');
  s.click((el) => el.attrs.class === 'ssub-tgl' && /Cross-product/.test(textOf(el)));
  s.ok(!s.has(byData('div', 'PRD-EL-1')), 'collapsible');
});

s.step('component owners on the skid: empty state', () => {
  openOwners();
  s.expect('This model isn’t used as a sub-product in any other model yet.');
});

s.step('remove a sub-product: confirm, then host, rows and composition edge go', () => {
  s.click('More actions for Tera stack · Tera 25-30-R5');
  s.click('Remove sub-product');
  s.expect('Remove Tera stack · Tera 25-30-R5?');
  s.expect('with its 4 imported specifications');
  s.expect('The composition link that Planning shows is removed too.');
  s.click('Remove sub-product', { within: '~Remove Tera stack' });
  s.expect('Sub-product removed.');
  s.eq('host gone', EL().stageGates.some((g) => g.id === 'SG-EL-2-1-5'), false);
  s.eq('imported rows gone', EL().kpis.some((k) => k.hostId === 'SG-EL-2-1-5'), false);
  s.eq('composition edge gone', (P().composition || []).length, 0);
  s.expect('None yet. Plug a specific model of another product in as a sub-product.');
  s.ok(s.see('Cross-product dependencies'), 'the cross-product link sits on S1, not on the sub-product, so its panel stays');
});

s.step('add a sub-product: products grouped by division, preview, import', () => {
  s.click('Add sub-product');
  s.eq('sheet', sheetTitle(), 'Add sub-product');
  s.ok(s.has('Fuel Cell', { within: 'Editor' }) && s.has('This division', { within: 'Editor' }), 'division groups, this division marked');
  s.ok(!s.has('Tera system', { within: 'Editor' }), 'the model itself is not offered');
  s.expect(importPreview(FC(), 'MDL-FC-1-1'));
  s.click('Tera stack', { within: 'Electrolyzer' });
  s.expect('4 specifications will import: Rated stack power, Specific energy at rated load, Voltage degradation and Gas purity.');
  s.c.setState({ sh_sim: Object.assign({}, s.c.state.sh_sim, { portConflict: true }) }); s.render();
  s.click('Add sub-product', { within: 'Editor', nth: 0, tag: 'button' });
  s.expect('Sub-product added, 4 specifications imported. (merged with a concurrent change)');
  const host = EL().stageGates.find((g) => g.objectiveId === 'MDL-EL-2-1' && g.refModel === 'MDL-EL-1-1');
  s.eq('host record', host && { id: host.id, refProduct: host.refProduct, name: host.name }, { id: 'SG-EL-2-1-1', refProduct: 'PRD-EL-1', name: 'Tera stack · Tera 25-30-R5' });
  /* RD.allocId reads S1's linked metric KPI-EL-2-1-1-1 as number 1, so today's ids start at 2 */
  s.eq('imported rows', EL().kpis.filter((k) => k.hostId === 'SG-EL-2-1-1').map((k) => [k.id, k.refKr, k.unit, k.target, k.linkType, k.linkParent]),
    [['KPI-EL-2-1-2', 'KR-EL-1-1-1', '%', null, 'specification', null], ['KPI-EL-2-1-3', 'KR-EL-1-1-2', 'kWh/kg', null, 'specification', null], ['KPI-EL-2-1-4', 'KR-EL-1-1-3', 'µV/h', null, 'specification', null], ['KPI-EL-2-1-5', 'KR-EL-1-1-4', '%', null, 'specification', null]]);
  s.eq('composition edge in the portfolio', P().composition, [{ id: 'CMP-SG-EL-2-1-1', parent: 'MDL-EL-2-1', child: 'MDL-EL-1-1' }]);
  s.eq('sheet closed', s.c.state.sheets.length, 0);
  s.clean('after adding a sub-product');
});

/* =========================================== other divisions, owners, states */
fresh();
s.step('component owners on Tera 25-30-R5: collapsed by default, grouped by product then model', () => {
  s.expect('Component owners');
  s.ok(!s.see('System efficiency at rated load'), 'collapsed by default');
  s.eq('owners collapsed by default (state)', s.c.state.ssub_ownOpen, false);
  openOwners();
  const g = textAt('div', 'OWNP:PRD-EL-2');
  s.ok(/Tera system/.test(g) && /Electrolyzer/.test(g) && /Tera 250 kW skid/.test(g), 'product with division tag, then model');
  const sk = RD.keyResultScore('KR-EL-2-1-1', remOf(EL()));
  s.ok(/System efficiency at rated load/.test(g) && /100%/.test(g) && g.indexOf(sc(sk)) >= 0, 'owner spec, target summary 100% (% tracked), live score');
  s.click('Tera 250 kW skid', { within: 'OWNP:PRD-EL-2' });
  s.ok(!/System efficiency/.test(textAt('div', 'OWNP:PRD-EL-2')), 'model group collapses');
  s.click('Tera 250 kW skid', { within: 'OWNP:PRD-EL-2' });
  s.click('~Tera system', { within: 'OWNP:PRD-EL-2' });
  s.ok(!/Tera 250 kW skid/.test(textAt('div', 'OWNP:PRD-EL-2')), 'product group collapses');
  s.click('~Tera system', { within: 'OWNP:PRD-EL-2' });
  s.ok(!s.see('Cross-product dependencies'), 'no cross-product dependencies for Tera stack');
});

s.step('cross-division sub-product: add Tera 25-30-R5 under HP6-12 (Fuel Cell)', () => {
  goModel('HP6-12');
  s.eq('model', s.c.state.modelId, 'MDL-FC-1-1');
  s.click('Add sub-product');
  s.click('Tera stack', { within: 'Electrolyzer' });
  s.ok(s.has('~Tera 25-30-R5', { within: 'Model' }), 'model choice');
  s.click('Add sub-product', { within: 'Editor', tag: 'button' });
  s.expect('Sub-product added, 4 specifications imported.');
  s.eq('host in SPEC-DIV-FC', FC().stageGates.map((g) => [g.id, g.refModel]), [['SG-FC-1-1-1', 'MDL-EL-1-1']]);
  s.eq('edge', P().composition.map((e) => e.id), ['CMP-SG-EL-2-1-5', 'CMP-SG-FC-1-1-1']);
  s.ok(/≤ 1%/.test(textAt('article', 'SG-FC-1-1-1')) && /0\.62%/.test(textAt('article', 'SG-FC-1-1-1')), 'values read from the Electrolyzer document');
});

s.step('owners: two owner products; a model with no specifications says so', () => {
  goModel('Tera 25-30-R5');
  openOwners();
  const g = () => textAt('div', 'OWNP:PRD-FC-1');
  s.ok(/HP membrane/.test(g()) && /Fuel Cell/.test(g()) && /HP6-12/.test(g()), 'second owner group');
  const REM = remOf(FC());
  const want = { 'KR-FC-1-1-1': '≥ 95 mS/cm', 'KR-FC-1-1-2': '11.5 to 12.5 µm', 'KR-FC-1-1-3': '100%', 'KR-FC-1-1-4': '100%', 'KR-FC-1-1-5': 'Pass' };
  fcSpecs().forEach((kr) => {
    s.ok(g().indexOf(kr.statement) >= 0 && g().indexOf(want[kr.id]) >= 0, 'owner spec ' + kr.id + ' with target summary ' + want[kr.id]);
    s.ok(g().indexOf(sc(RD.keyResultScore(kr.id, REM))) >= 0, 'owner spec ' + kr.id + ' live score');
  });
  const keep = FC().keyResults;
  FC().keyResults = keep.filter((r) => r.objectiveId !== 'MDL-FC-1-1');
  s.render();
  s.ok(/No specifications yet/.test(g()), 'no-specs state');
  FC().keyResults = keep;
  s.render();
});

s.step('no addable product: every candidate would duplicate or form a cycle', () => {
  s.click('Add sub-product');
  s.expect('No other product has a model that can be added here.');
  s.click('Close', { within: 'Editor', nth: 1 });
  s.eq('closed', s.c.state.sheets.length, 0);
});

s.step('unreachable SPEC bin (Settings): owner group, sub-product card, add preview', () => {
  setSim(REFDOWN, true);
  s.ok(/Unreachable/.test(textAt('div', 'OWNP:PRD-FC-1')), 'owner group in another division is unreachable');
  s.ok(/System efficiency at rated load/.test(textAt('div', 'OWNP:PRD-EL-2')), 'same-division owner still loads');
  setSim(REFDOWN, false);
  goModel('HP6-12');
  setSim(REFDOWN, true);
  s.ok(/Unreachable/.test(textAt('article', 'SG-FC-1-1-1')), 'sub-product card in another division is unreachable');
  s.ok(/Rated stack power/.test(textAt('article', 'SG-FC-1-1-1')), 'stored rows keep their saved names');
  s.clean('unreachable');
  setSim(REFDOWN, false);
});

s.step('add from an unreachable SPEC bin: added empty, specifications import once it is reachable (today’s rule)', () => {
  goModel('Tera 250 kW skid');
  setSim(REFDOWN, true);
  s.click('Add sub-product');
  s.expect('Couldn’t reach that product’s SPEC bin. Is it configured on the broker?');
  s.click('Add sub-product', { within: 'Editor', tag: 'button' });
  s.expect('Sub-product added. Its specifications import once that product’s SPEC bin is reachable.');
  const host = EL().stageGates.find((x) => x.objectiveId === 'MDL-EL-2-1' && x.refModel === 'MDL-FC-1-1');
  s.ok(!!host, 'host added');
  s.eq('no rows imported while unreachable', EL().kpis.filter((k) => k.hostId === host.id).length, 0);
  s.ok(/Unreachable/.test(textAt('article', host.id)) && /This model has no importable specifications/.test(textAt('article', host.id)), 'card says unreachable, table empty');
  setSim(REFDOWN, false);
  fcSpecs().forEach((kr) => s.ok(row(host.id + '|' + kr.id).indexOf(kr.statement) >= 0, 'auto-imported once reachable: ' + kr.statement));
  s.click('More actions for HP membrane · HP6-12');
  s.click('Remove sub-product');
  s.expect('with its ' + fcSpecs().length + ' imported specifications');
  s.click('Remove sub-product', { within: '~Remove HP membrane' });
  s.eq('removed again, edge too', P().composition.some((e) => e.parent === 'MDL-EL-2-1' && e.child === 'MDL-FC-1-1'), false);
  s.eq('auto-imported rows written then removed with the host', EL().kpis.filter((k) => k.hostId === host.id).length, 0);
});

s.step('slow load (Settings): loading states, and Add waits', () => {
  goModel('Tera 250 kW skid');
  s.click('Settings');
  s.click('Load other divisions slowly');
  s.click('Close', { within: 'Editor' });
  s.click('Add sub-product');
  s.expect('Loading specifications…');
  s.click('Add sub-product', { within: 'Editor', tag: 'button' });
  s.expect('Still loading that product’s specifications. Try again in a moment.');
  s.eq('nothing added while loading', EL().stageGates.filter((g) => g.objectiveId === 'MDL-EL-2-1').length, 1);
  s.advance(3000);
  s.expect(importPreview(FC(), 'MDL-FC-1-1'));
  s.click('Add sub-product', { within: 'Editor', tag: 'button' });
  s.expect('Sub-product added, ' + fcSpecs().length + ' specifications imported.');
  s.eq('HP6-12 now a sub-product of the skid', P().composition.some((e) => e.parent === 'MDL-EL-2-1' && e.child === 'MDL-FC-1-1'), true);
  const host = EL().stageGates.find((x) => x.refModel === 'MDL-FC-1-1');
  s.eq('one imported row per HP6-12 specification', EL().kpis.filter((k) => k.hostId === host.id).map((k) => k.refKr), fcSpecs().map((r) => r.id));
  const bin = EL().kpis.find((k) => k.hostId === host.id && k.refKr === 'KR-FC-1-1-5');
  s.ok(/Pass/.test(row(bin.id)) && /Met/.test(row(bin.id)), 'binary child spec: Pass and Met');
});

s.step('a specification added to the child later is imported automatically (cross-division)', () => {
  FC().keyResults.push({ id: 'KR-FC-1-1-9', objectiveId: 'MDL-FC-1-1', statement: 'Peak power density', trackingType: 'percentage', progress: 40 });
  s.render();
  const host = EL().stageGates.find((g) => g.refModel === 'MDL-FC-1-1');
  const t = textAt('article', host.id);
  const r = row(host.id + '|KR-FC-1-1-9');
  s.ok(/Peak power density/.test(r) && /≥ 100%/.test(r) && /40%/.test(r), 'new child spec shows with target 100% and its progress');
  s.ok(r.indexOf(sc(RD.rawScore(40, 100, 'up'))) >= 0, 'scored');
  s.ok(/Peak power density/.test(t), 'on the card');
});

s.step('a range target on the child: override takes low and high', () => {
  const host = EL().stageGates.find((x) => x.refModel === 'MDL-FC-1-1');
  const m0 = EL().kpis.find((x) => x.hostId === host.id && x.refKr === 'KR-FC-1-1-2');
  s.ok(/11\.5 to 12\.5 µm/.test(row(m0.id)) && /12\.3 µm/.test(row(m0.id)), 'range target and value shown');
  s.ok(row(m0.id).indexOf(sc(RD.rawScore(12.3, { lo: 11.5, hi: 12.5 }, 'range'))) >= 0, 'scored inside the range');
  s.click('Inherits', { within: m0.id });
  s.type('Range low', '12');
  s.type('Range high', '');
  s.key('Range low', 'Enter');
  s.expect('Enter both ends of the range, or leave both blank to use the sub-product’s target.');
  s.type('Range high', '11');
  s.click('Set target');
  s.expect('The low end of the range must not be above the high end.');
  s.type('Range high', '12.2');
  s.click('Set target');
  s.eq('range override stored', m0.target, { lo: 12, hi: 12.2 });
  s.ok(/12 to 12\.2 µm/.test(row(m0.id)) && /Override/.test(row(m0.id)), 'your range shown');
  s.ok(row(m0.id).indexOf(sc(RD.rawScore(12.3, { lo: 12, hi: 12.2 }, 'range'))) >= 0, 'scored against your range (fixed: today a single number made a range row score 0)');
});

/* ================================================================ read-only */
fresh();
s.step('read-only: no add, edit, delete, drag or menus; names and values stay readable', () => {
  s.c.setState({ ro: true }); s.render();
  s.ok(!s.has('Add component'), 'no Add component');
  s.ok(!s.has('More actions for C1'), 'no card menu');
  s.ok(!s.has('Drag C1 to reorder'), 'no drag handle');
  s.ok(!s.has('Edit C1, Membrane electrode assembly'), 'name is not an edit link');
  s.ok(/Membrane electrode assembly/.test(card('SG-EL-1-1-1')), 'name still shown (fixed: today it disappears)');
  s.ok(!s.has('~New reading for Membrane thickness'), 'no reading input');
  goModel('Tera 250 kW skid');
  s.ok(!s.has('Add sub-product'), 'no Add sub-product');
  s.ok(!s.has('More actions for Tera stack · Tera 25-30-R5'), 'no sub-product menu');
  s.ok(!s.has('Inherits', { tag: 'button' }) && s.see('Inherits'), 'your target is text');
  s.ok(!s.has('~Product specification that Gas purity links to'), 'links to spec is text');
  s.expect('Not linked');
  s.clean('read-only');
  /* a write reached anyway is refused with the kit's message */
  s.c.setState({ ro: false }); s.render();
  s.click('Inherits', { within: 'SG-EL-2-1-5|KR-EL-1-1-2' });
  s.type('~Your target for Specific energy at rated load', '49');
  s.c.setState({ ro: true }); s.render();
  s.click('Set target');
  s.expect('Read-only view — editing is disabled.');
  s.eq('nothing written in read-only', EL().kpis.filter((k) => k.hostId === 'SG-EL-2-1-5').length, 2);
});

done();
