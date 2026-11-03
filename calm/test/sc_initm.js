/* Scenario test for the initiative metrics module (initm), on both boards.
     node test/sc_initm.js out/Main.dc.html
     node test/sc_initm.js out/Sales-A.dc.html
   Until October 15 these steps lived in sc_tasks.js, with the Tasks tab; the tab and the tasks module are
   gone (the Kanban covers that work), initiative metrics stay. Shell navigation (division / objective /
   tab) is set through state; everything in the initiative-metrics panel is driven by clicking. */
const { Sim, done, textOf } = require('./dc');
const RD = require(require('./engine_path'));

const file = process.argv[2] || 'out/Main.dc.html';

function engine(s, divId, docKey) {
  const D = s.c.D;
  const em = RD.withPortfolio(D.portfolio, { [divId]: D.docs[docKey] });
  const pool = [];
  Object.keys(em).forEach((k) => (em[k].kpis || []).forEach((x) => pool.push(x)));
  return { em, pool, casc: RD.cascade(D.portfolio, em, D.today) };
}
const nav = (s, patch) => { s.c.setState(Object.assign({ menu: '', sheets: [] }, patch)); return s.render(); };

const s = new Sim(file);
const SALES = s.c.APP === 'sales';
const DIV = SALES ? 'DIV-BD' : 'DIV-EL';
const KEY = SALES ? 'BIZ-DIV-BD' : 'EXEC-DIV-EL';
const OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-01';
s.clean('start');

const regionOf = (k) => s.all((e) => e.attrs && e.attrs['data-k'] === k)[0] || null;
const regionText = (k) => { const el = regionOf(k); return el ? textOf(el) : ''; };
function insideInitm(el) { let p = el.parent; while (p) { if (p.attrs && p.attrs['data-k'] === 'initm') return true; p = p.parent; } return false; }
/* anything in the panel a person could use to change data (the toggle and "show the sample" only view) */
const initmControls = () => s.all((el) => insideInitm(el) && (el.tag === 'input' || el.tag === 'select' || el.tag === 'textarea' ||
  (el.on.onClick && !/initm-tog/.test(el.attrs.class || '') && !/^Readings for /.test(el.attrs['aria-label'] || '') && el.attrs['aria-label'] !== 'Close readings')));

s.step('initiative metrics: collapsed, read-only, same numbers', () => {
  nav(s, { objId: OBJ, tab: 'overview' });
  s.eq('collapsed at start', s.vals.initm.open, false);
  const kname = SALES ? 'Signed pilot capacity' : 'Stack voltage efficiency (HHV)';
  const iniId = SALES ? 'INIT-BD-01' : 'INIT-EL-01';
  /* (the review table above may mention the same words, e.g. a risk effect "Signed pilot capacity falls short") */
  s.ok(regionText('initm').indexOf(kname) < 0, 'its KPIs are hidden while collapsed');
  s.eq('a card beside Latest readings and Current step', [s.vals.initm.panelCls, regionOf('initm').parent.attrs.class], ['panel initm-panel', 'ov-three']);
  s.expect('Initiative metrics').expect('Defined in Planning. Link to them from a key result or stage-gate.');
  s.eq('initiative count', s.vals.initm.count, SALES ? '1' : '2');
  s.click('Initiative metrics');
  s.eq('expanded', s.vals.initm.open, true);
  s.eq('opened, it takes a row of its own', s.vals.initm.panelCls, 'panel initm-panel open');
  const E = engine(s, DIV, KEY);
  const k = s.c.D.portfolio.kpis.find((x) => x.name === kname);
  const p = RD.kpiScoreParts(k, E.pool, E.em);
  const t = regionText(iniId);
  s.ok(t.indexOf(kname) >= 0, 'KPI listed');
  s.ok(t.indexOf(SALES ? '≥ 3 MW' : '≥ 75%') >= 0, 'target with direction');
  s.ok(t.indexOf(SALES ? '1 MW' : '73.1%') >= 0, 'current = engine value ' + RD.effValue(k, E.pool, E.em));
  s.ok(new RegExp('\\b' + Math.round(p.score) + '\\b').test(t), 'score = engine ' + Math.round(p.score));
  s.ok(t.indexOf('Defines') < 0, 'no links yet');
  s.ok(t.indexOf('This objective\'s initiative') >= 0 && t.indexOf('1 target') >= 0, 'own initiative tagged, target count');
  if (!SALES) s.ok(/Stack cost-down 0 targets No targets yet\. Add initiative targets in the Planning app/.test(regionText('INIT-EL-02')), 'empty initiative');
  s.eq('read-only: no editing controls', initmControls().map((e) => textOf(e) || e.attrs['aria-label'] || e.tag), []);
  s.clean('initiative metrics');
  s.click('Initiative metrics');
  s.eq('collapses again', s.vals.initm.open, false);
  s.ok(regionText('initm').indexOf(kname) < 0, 'hidden again');
});

if (!SALES) s.step('initiative metrics: partial math, local tag, link count (Fuel Cell)', () => {
  nav(s, { divId: 'DIV-FC', objId: 'OBJ-FC-2026Q4-01', tab: 'overview', initm_open: true });
  const E = engine(s, 'DIV-FC', 'EXEC-DIV-FC');
  const k = s.c.D.portfolio.kpis.find((x) => x.id === 'KPI-FC-01-1');
  const p = RD.kpiScoreParts(k, E.pool, E.em);
  const t = regionText('INIT-FC-01');
  s.ok(t.indexOf('Line yield') >= 0 && t.indexOf('≥ 85%') >= 0, 'line yield and target');
  s.ok(t.indexOf('82.333%') >= 0, 'statistical current rounded to 3 decimals');
  s.ok(new RegExp('\\b' + Math.round(p.score) + '\\b').test(t), 'partial score = engine ' + Math.round(p.score));
  s.ok(t.indexOf(Math.round(p.raw) + ' × 3/5 samples') >= 0 && t.indexOf('Partial') >= 0, 'partial math ' + Math.round(p.raw) + ' × 3/5');
  s.eq('values only: no sample view or reading entry', s.all((e) => insideInitm(e) && !!e.on.onClick && !/initm-tog/.test(e.attrs.class || '')).length, 0);
  const fc = s.c.D.docs['EXEC-DIV-FC'];
  fc.kpis.push({ id: 'KPI-FC-02-L1', objectiveId: null, hostType: 'initiative', hostId: 'INIT-FC-02', name: 'Humidity cycles survived', targetType: 'demonstration', direction: 'up', target: 500, unit: 'cycles' });
  fc.kpis.push({ id: 'KPI-FC-2026Q4-01-1-9', objectiveId: 'OBJ-FC-2026Q4-01', hostType: 'keyResult', hostId: 'KR-FC-2026Q4-01-1', linkParent: 'KPI-FC-01-1', linkType: 'contribute', linkPriority: 1, name: null, direction: null, unit: null, target: null, order: 1 });
  s.render();
  const t2 = regionText('INIT-FC-02');
  s.ok(/1 target/.test(t2) && t2.indexOf('Humidity cycles survived') >= 0 && t2.indexOf('Local') >= 0 && t2.indexOf('≥ 500 cycles') >= 0 && t2.indexOf('No reading') >= 0, 'local KPI listed with its tag');
  s.ok(regionText('INIT-FC-01').indexOf('Defines 1') >= 0, 'a link made with the link editor is counted');
  fc.kpis = fc.kpis.filter((x) => x.id !== 'KPI-FC-02-L1' && x.id !== 'KPI-FC-2026Q4-01-1-9');
  nav(s, { divId: DIV, objId: OBJ, tab: 'overview', initm_open: false });
  s.clean('fuel cell initiative metrics');
});

done();
