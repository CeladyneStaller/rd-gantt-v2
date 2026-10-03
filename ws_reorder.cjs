// Drag-reordering workstreams in the execution app's stage-gates section.
//
// Order is not cosmetic here: the blocks are labelled positionally (Workstream A, B, C), so the order a
// reader sees IS the order. The list sorts by `order` with a name tiebreak, so a reorder rewrites every
// set with a contiguous index — leaving gaps or duplicate values would make the result depend on the
// tiebreak rather than on what was dragged.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const boot = () => {
  const vc = new VirtualConsole(); const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8'), {
    runScripts: 'dangerously', virtualConsole: vc, url: 'https://x.test/?division=D&token=t', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
      w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {};
      w.fetch = () => Promise.reject(new Error('no net'));
      w.cytoscape = function () { return { on(){}, ready(cb){ try{ cb && cb(); }catch(e){} }, fit(){}, resize(){},
        destroy(){}, getElementById(){ return { length: 0, select(){} }; }, zoom(){ return 1; }, width(){ return 800; },
        height(){ return 560; }, layout(){ return { run(){} }; }, elements(){ return { length: 0 }; },
        $(){ return { unselect(){} }; } }; };
    } });
  return { dom, errs };
};
const SEED = (nSets) => `persist=function(){};
  portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],
    initiatives:[{id:"I",name:"I",divisionId:"D"}],
    objectives:[{id:"O1",statement:"O",divisionId:"D",initiativeId:"I",quarter:"2026Q2",plannedStart:2200,plannedEnd:2600}],
    kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
  exec.stageGateSets=${JSON.stringify(
    [{ id: 'S1', objectiveId: 'O1', name: 'Durability', order: 0 },
     { id: 'S2', objectiveId: 'O1', name: 'Pilot', order: 1 },
     { id: 'S3', objectiveId: 'O1', name: 'Scale', order: 2 }].slice(0, nSets))};
  exec.stageGates=${JSON.stringify(
    [{ id: 'G1', objectiveId: 'O1', setId: 'S1', name: 'a', plannedDate: 2400, order: 0 },
     { id: 'G2', objectiveId: 'O1', setId: 'S2', name: 'b', plannedDate: 2410, order: 1 },
     { id: 'G3', objectiveId: 'O1', setId: 'S3', name: 'c', plannedDate: 2420, order: 2 }].slice(0, nSets))};
  divisionId="D"; selectedObj="O1"; renderAll();`;

setTimeout(() => {
  (function () {
    const { dom, errs } = boot();
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED(3));
      const blocks = () => [...d.querySelectorAll('[data-wsblock]')];
      const order = () => blocks().map(e => e.dataset.wsblock).join(',');
      const letters = () => [...d.querySelectorAll('.ws-eyebrow')].map(e => e.textContent.trim().split(' ').pop()).join(',');
      const dt = { effectAllowed: '', setData() {}, getData() { return ''; } };
      const fire = (el, type) => el.dispatchEvent(Object.assign(
        new w.Event(type, { bubbles: true, cancelable: true }), { dataTransfer: dt }));

      ok(blocks().length === 3, "each workstream renders as its own block");
      ok(blocks().every(b => b.getAttribute('draggable') === 'true'), "…draggable when there is more than one");
      ok(d.querySelectorAll('[data-wsgrip]').length === 3, "…each with a drag handle");
      ok(order() === 'S1,S2,S3', "…in their stored order");

      // drag the last onto the first
      fire(blocks()[2].querySelector('[data-wsgrip]'), 'dragstart');
      fire(blocks()[0], 'drop');
      ok(order() === 'S3,S1,S2', "dragging a workstream onto an earlier one moves it there (" + order() + ")");

      const orders = JSON.parse(w.eval('JSON.stringify(exec.stageGateSets.map(s=>s.order))')).slice().sort();
      /* Contiguous from zero: the sort has a name tiebreak, so gaps or duplicates would let the tiebreak
         decide the result instead of the drag. */
      ok(orders.join(',') === '0,1,2', "every set is rewritten with a contiguous order (" + orders.join(',') + ")");
      ok(w.eval('exec.stageGateSets.find(s=>s.id==="S3").order') === 0, "…the moved one landing first");

      /* The letters are positional, so they must re-letter rather than travel with the block. */
      ok(letters() === 'A,B,C', "the positional letters stay A, B, C after the move");
      ok(d.querySelector('[data-wsblock="S3"] .ws-eyebrow').textContent.trim().endsWith('A'),
        "…so the block now first is Workstream A");

      // a drag that does not start on the handle must not reorder
      const before = order();
      fire(blocks()[1].querySelector('.ws-name'), 'dragstart');
      fire(blocks()[0], 'drop');
      ok(order() === before,
        "a drag that did not start on the handle reorders nothing — a gate drag cannot move its parent");

      // dropping a block on itself is not a move
      fire(blocks()[0].querySelector('[data-wsgrip]'), 'dragstart');
      fire(blocks()[0], 'drop');
      ok(order() === before, "dropping a workstream on itself changes nothing");
      /* The splice pair is a no-op at the same index, so the ORDER is unchanged either way. The guard
         still matters: without it the drop reports success, which saves the document and claims
         "Workstreams reordered" for a move that did not happen. Test the decision, not just the result. */
      ok(w.eval('wsReorder("S3","S3")') === false, "…and is not reported as a reorder, so nothing is saved");
      ok(w.eval('wsReorder("S3","")') === false, "a drop with no target is not a reorder either");
      ok(w.eval('wsReorder("nope","S1")') === false, "…nor one naming a workstream that does not exist");

      ok(errs.length === 0, "no errors" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'reorder flow threw: ' + (e && e.message)); }
  })();

  // ---------- a single workstream ----------
  (function () {
    const { dom, errs } = boot();
    const d = dom.window.document;
    try {
      dom.window.eval(SEED(1));
      /* One workstream has nowhere to go: a handle that does nothing is worse than no handle. */
      ok(d.querySelectorAll('[data-wsgrip]').length === 0, "a lone workstream shows no drag handle");
      ok(!d.querySelector('[data-wsblock][draggable="true"]'), "…and is not draggable");
      ok(errs.length === 0, "no errors" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'single-set flow threw: ' + (e && e.message)); }
  })();

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} workstream-reorder assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1500);
