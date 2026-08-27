// Multiple logic trees — storage normalisation and the remaining next-step range.
//
// An objective used to hold exactly one experiment tree. It now holds several INDEPENDENT trees, each
// owning its own experiments map so reachability cannot cross between them. Schema 1 (a bare tree) is
// wrapped as one tree named "Main" on read.
//
// nextStepRange answers "how many experiments still lie ahead of the current step", shortest and
// longest. A branch ending in a terminal (FMEA, halt, target achieved) contributes 0; a branch
// targeting experiment E contributes 1 + depth(E).
const C = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const T = (exps) => ({ tid: 't1', name: 'T', root_experiment_id: 'a', experiments: exps });

// ---------- schema 1 is wrapped, not rewritten ----------
(function () {
  const old = { project_id: 'O1', root_experiment_id: 'e1', experiments: { e1: { id: 'e1' } },
    metadata: { created_date: '2026-01-01' }, custom_field: 'kept' };
  const w = C.etbTreesOf(old);
  ok(w.schema === 1, "a bare tree is recognised as schema 1");
  ok(w.trees.length === 1, "…and wrapped as a single tree");
  ok(w.trees[0].name === 'Main', "…named Main");
  ok(w.trees[0].tid === 't_main', "…with a stable id");
  ok(w.activeTid === 't_main', "…and made active");
  ok(w.trees[0].root_experiment_id === 'e1', "the original root survives the wrap");
  ok(!!w.trees[0].experiments.e1, "…as do its experiments");
  ok(!!w.trees[0].metadata, "…and its metadata");
  // the migrateProblem lesson: a normaliser that names fields silently destroys the ones it forgot
  ok(w.trees[0].custom_field === 'kept', "an UNKNOWN field is carried through, not dropped by a whitelist");
})();

// ---------- schema 2 passes through ----------
(function () {
  const two = { schema: 2, trees: [{ tid: 'a', name: 'A' }, { tid: 'b', name: 'B' }], activeTid: 'b' };
  const w = C.etbTreesOf(two);
  ok(w.trees.length === 2, "a schema 2 bag keeps both trees");
  ok(w.activeTid === 'b', "…and its active tree");
  ok(C.etbTreeById(two, 'a').name === 'A', "a tree can be fetched by id");
  ok(C.etbTreeById(two, 'zzz') === null, "…and an unknown id yields null, not a throw");
  ok(C.etbActiveTree(two).name === 'B', "the active tree resolves");
  ok(C.etbTreesOf({ trees: [{ tid: 'a', name: 'A' }], activeTid: 'gone' }).activeTid === 'a',
    "a dangling activeTid falls back to the first tree rather than leaving nothing selected");
  ok(C.etbTreesOf(null).trees.length === 0, "an absent bag yields no trees");
  ok(C.etbActiveTree(null) === null, "…and no active tree");
  ok(C.etbTreesOf({ trees: [null, { tid: 'a' }] }).trees.length === 1, "malformed entries are dropped");
})();

// ---------- the worked cases from the plan ----------
(function () {
  // Seal integrity: concluded, nothing planned after it
  const seal = T({ a: { id: 'a', possible_results: [] } });
  const r1 = C.nextStepRange(seal, 'a');
  ok(r1.min === 0 && r1.max === 0, "a step with no planned results is 0-0 (" + r1.min + "-" + r1.max + ")");

  // Membrane crossover: every branch leads to one experiment that itself terminates
  const memb = T({
    a: { id: 'a', possible_results: [{ next_experiment_ids: ['b'] }, { next_experiment_ids: ['c'] }] },
    b: { id: 'b', possible_results: [{ terminal: 'halt' }] },
    c: { id: 'c', possible_results: [{ terminal: 'halt' }] } });
  const r2 = C.nextStepRange(memb, 'a');
  ok(r2.min === 1 && r2.max === 1, "every branch one experiment deep is 1-1 (" + r2.min + "-" + r2.max + ")");

  // Catalyst durability: a terminal option NOW plus a two-deep chain
  const cat = T({
    a: { id: 'a', possible_results: [{ next_experiment_ids: ['b'] }, { terminal: 'conduct_fmea' }] },
    b: { id: 'b', possible_results: [{ next_experiment_ids: ['c'] }] },
    c: { id: 'c', possible_results: [{ terminal: 'target_achieved' }] } });
  const r3 = C.nextStepRange(cat, 'a');
  ok(r3.min === 0, "a terminal branch available now makes min 0 (" + r3.min + ")");
  ok(r3.max === 2, "…while the longest chain sets max (" + r3.max + ")");
  ok(r3.unplanned === false, "…and nothing is flagged unplanned when every branch is decided");
})();

// ---------- terminal vs unplanned ----------
(function () {
  const un = T({ a: { id: 'a', possible_results: [{ next_experiment_ids: ['b'] }, {}] },
                 b: { id: 'b', possible_results: [{ terminal: 'halt' }] } });
  const r = C.nextStepRange(un, 'a');
  ok(r.min === 0 && r.max === 1, "a branch with no target and no terminal ends the path (" + r.min + "-" + r.max + ")");
  ok(r.unplanned === true, "…but is flagged unplanned, so 0 does not read as a decision");

  const term = T({ a: { id: 'a', possible_results: [{ terminal: 'halt' }, { next_experiment_ids: ['b'] }] },
                   b: { id: 'b', possible_results: [{ terminal: 'halt' }] } });
  ok(C.nextStepRange(term, 'a').unplanned === false, "a genuinely terminal branch is not flagged");

  // a result pointing at an experiment that does not exist is not a path
  const dangling = T({ a: { id: 'a', possible_results: [{ next_experiment_ids: ['nope'] }] } });
  const rd = C.nextStepRange(dangling, 'a');
  ok(rd.min === 0 && rd.max === 0, "a result targeting a missing experiment adds no depth");
  ok(rd.unplanned === true, "…and counts as unplanned");
})();

// ---------- cycles are capped, not fatal ----------
(function () {
  const cyc = T({ a: { id: 'a', possible_results: [{ next_experiment_ids: ['b'] }] },
                  b: { id: 'b', possible_results: [{ next_experiment_ids: ['a'] }] } });
  const r = C.nextStepRange(cyc, 'a');
  ok(typeof r.max === 'number' && isFinite(r.max), "a cyclic tree returns a finite depth rather than hanging");
  ok(r.capped === true, "…and reports that the walk was capped, so the UI can render 3+");

  // The depth cap alone would catch a short cycle, so this case separates the two guards: a SELF-loop
  // at depth 0 is caught only by the visited check. Without it the walk recurses until the cap and
  // reports a depth the tree does not have.
  const selfLoop = T({ a: { id: 'a', possible_results: [{ next_experiment_ids: ['a'] }] } });
  const rs = C.nextStepRange(selfLoop, 'a');
  ok(rs.max <= 1, "a self-referencing step does not accumulate phantom depth (" + rs.max + ")");
  ok(rs.capped === true, "…and is reported as capped");

  const deep = {}; for (let i = 0; i < 20; i++) deep['e' + i] = { id: 'e' + i, possible_results: [{ next_experiment_ids: ['e' + (i + 1)] }] };
  const rd = C.nextStepRange(T(deep), 'e0');
  ok(rd.capped === true, "a chain longer than the cap is capped too");
  ok(rd.max <= 9, "…and the reported depth stays bounded (" + rd.max + ")");
})();

// ---------- branches are independent ----------
(function () {
  // one branch two deep, another terminal: min and max come from DIFFERENT branches
  const t = T({ a: { id: 'a', possible_results: [
      { next_experiment_ids: ['b'] }, { terminal: 'halt' }, { next_experiment_ids: ['d'] }] },
    b: { id: 'b', possible_results: [{ next_experiment_ids: ['c'] }] },
    c: { id: 'c', possible_results: [{ terminal: 'halt' }] },
    d: { id: 'd', possible_results: [{ terminal: 'halt' }] } });
  const r = C.nextStepRange(t, 'a');
  ok(r.min === 0, "min takes the shortest branch across all results");
  ok(r.max === 2, "max takes the longest, independently (" + r.min + "-" + r.max + ")");

  // a result with several targets: min is the shortest of them, max the longest
  const multi = T({ a: { id: 'a', possible_results: [{ next_experiment_ids: ['b', 'c'] }] },
    b: { id: 'b', possible_results: [{ terminal: 'halt' }] },
    c: { id: 'c', possible_results: [{ next_experiment_ids: ['d'] }] },
    d: { id: 'd', possible_results: [{ terminal: 'halt' }] } });
  const rm = C.nextStepRange(multi, 'a');
  ok(rm.min === 1 && rm.max === 2, "one result with two targets spans both depths (" + rm.min + "-" + rm.max + ")");

  ok(C.nextStepRange(T({}), 'missing').max === 0, "an unknown current step is 0-0, not a throw");
})();


// ---------- the header, switching and creation, through the real DOM ----------
// Buttons are clicked, not called. The write-back is the sharp edge here: the old single-tree
// assignment (exec.etbTrees[pid] = activeTree) would delete every other tree on the next change, and
// that would only show up after switching and editing.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let html = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8');
const vc = new VirtualConsole();
const dom = new JSDOM(html, {
  runScripts: 'dangerously', virtualConsole: vc, url: 'https://x.test/?division=DIV-FC&token=tok',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error('no net'));
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {};
    w.cytoscape = function () { return { on() {}, ready(cb) { try { cb && cb(); } catch (e) {} }, fit() {}, resize() {},
      destroy() {}, getElementById() { return { length: 0, select() {} }; }, zoom() { return 1; },
      width() { return 800; }, height() { return 560; }, layout() { return { run() {} }; }, elements() { return { length: 0 }; } }; };
    w.prompt = () => 'Second tree';
  }
});

setTimeout(async () => {
  const w = dom.window, d = w.document;
  try {
    const mkTree = (tid, name, root, results) => ({
      tid: tid, name: name, project_id: 'O1', root_experiment_id: root,
      experiments: { [root]: { id: root, code: root.toUpperCase(), name: name + ' step', status: 'in_progress',
        key_reads: [], possible_results: results || [], audit_log: [], actual_outcome: null } },
      terminal_types: { halt: { label: 'Halt', kind: 'stop' } }, metadata: {}
    });
    // tree A: one branch to a terminal -> 0-0 ; tree B: nothing planned -> 0-0
    w.eval(`exec.etbTrees={ O1: { schema:2, activeTid:'tA', trees:[
      ${JSON.stringify(mkTree('tA', 'Catalyst durability', 'a1', [{ terminal: 'halt' }]))},
      ${JSON.stringify(mkTree('tB', 'Membrane crossover', 'b1', []))} ] } };
      selectedObj='O1'; persist=function(){};
      if(window.ETB&&ETB.setActiveProject) ETB.setActiveProject('O1');`);
    // point the ETB at tree A explicitly, as a load would
    w.eval("if(window.ETB&&ETB.setActiveTree) ETB.setActiveTree('tA');");
    await sleep(60);

    const host = () => d.getElementById('expSummary');
    const btns = () => [...(host() ? host().querySelectorAll('[data-lttid]') : [])];


    ok(btns().length === 2, "the header lists every tree under the objective (" + btns().length + ")");
    const names = btns().map(b => b.querySelector('.lt-name').textContent).join(' | ');
    ok(/Catalyst durability/.test(names) && /Membrane crossover/.test(names), "…by name (" + names + ")");
    ok(btns().filter(b => b.classList.contains('on')).length === 1, "exactly one tree is marked active");
    ok(btns()[0].classList.contains('on'), "…the one the document says is active");
    ok(/next steps/.test(host().textContent), "each tree shows its remaining next steps");
    ok(!/finished/i.test(host().textContent), "a tree with nothing planned is NOT tagged finished");
    ok(!!host().querySelector('[data-ltnew]'), "a new tree can be created from the header");

    // ---------- switching ----------
    ok(w.eval("ETB.activeTreeId()") === 'tA', "tree A is active before switching");
    btns()[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(60);
    ok(w.eval("ETB.activeTreeId()") === 'tB', "clicking a tree makes it active");
    ok(w.eval("ETB.getTree().tid") === 'tB', "…and repoints the ETB's own tree, so every render follows");
    ok(btns()[1].classList.contains('on'), "…and the header marks it");

    // ---------- the write-back must not eat the other trees ----------
    // this is the failure the old single-tree assignment would have produced, only after an edit
    w.eval("if(window.__etbOnChange) window.__etbOnChange();");
    await sleep(40);
    const kept = w.eval("RD.etbTreesOf(exec.etbTrees.O1).trees.length");
    ok(kept === 2, "a change while tree B is active preserves tree A (" + kept + " trees)");
    ok(w.eval("!!RD.etbTreeById(exec.etbTrees.O1,'tA')"), "…tree A is still addressable by id");
    ok(w.eval("RD.etbTreesOf(exec.etbTrees.O1).activeTid") === 'tB', "…and the active tree is recorded");

    // ---------- creating a tree ----------
    const before = w.eval("ETB.listTrees().length");
    host().querySelector('[data-ltnew]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(60);
    ok(w.eval("ETB.listTrees().length") === before + 1, "New tree adds a tree (" + w.eval("ETB.listTrees().length") + ")");
    ok(w.eval("ETB.getTree().name") === 'Second tree', "…named as entered, and made active");
    ok(w.eval("RD.etbTreesOf(exec.etbTrees.O1).trees.length") === before + 1, "…and it reaches the document");
    ok(w.eval("ETB.getTree().experiments && Object.keys(ETB.getTree().experiments).length === 0"),
      "a new tree starts empty — it does not inherit the other tree's experiments");

    // ---------- renaming ----------
    ok(w.eval("ETB.renameTree('tA','Catalyst v2')") === true, "a tree can be renamed");
    // the bag entry and the in-memory tree can be the SAME object, so reading it back proves nothing.
    // Round-trip through serialisation — that is what a save and reload actually does.
    ok(w.eval("JSON.parse(JSON.stringify(RD.etbTreesOf(exec.etbTrees.O1))).trees.filter(function(t){return t.tid==='tA';})[0].name") === 'Catalyst v2',
      "…and the new name survives a document round trip");
    ok(w.eval("ETB.renameTree('nope','x')") === false, "renaming an unknown tree fails cleanly");

    // ---------- per-tree resolution, the API the per-tree cards need ----------
    // The host cannot derive this itself: currentExperiments() reads state.tree, which the ETB has
    // already normalised, and reachability is only meaningful against a normalised tree. Walking a raw
    // tree out of the document returns nothing — which is how the first attempt at per-tree cards
    // silently rendered empty cards.
    w.eval(`exec.etbTrees={ O3: { schema:2, activeTid:'tX', trees:[
      ${JSON.stringify(mkTree('tX', 'Active tree', 'x1', [{ terminal: 'halt' }]))},
      ${JSON.stringify(mkTree('tY', 'Other tree', 'y1', [{ next_experiment_ids: ['y2'] }]))} ] } };
      exec.etbTrees.O3.trees[1].experiments.y2={ id:'y2', code:'Y2', name:'second', status:'planned', key_reads:[], possible_results:[{terminal:'halt'}], audit_log:[], actual_outcome:null };
      selectedObj='O3'; if(window.ETB&&ETB.setActiveProject) ETB.setActiveProject('O3');
      if(window.ETB&&ETB.setActiveTree) ETB.setActiveTree('tX');`);
    await sleep(60);

    const idsFor = tid => JSON.parse(w.eval("JSON.stringify((ETB.currentExperimentsFor(" + JSON.stringify(tid) + ")||[]).map(function(e){return e.id;}))"));
    ok(idsFor('tX').join() === 'x1', "the ACTIVE tree resolves its own current step (" + idsFor('tX').join() + ")");
    ok(idsFor('tY').join() === 'y1', "a NON-ACTIVE tree resolves its own current step too (" + idsFor('tY').join() + ")");
    ok(idsFor('tY').length > 0, "…which is the case a raw walk gets wrong, returning nothing");
    ok(idsFor('nope').length === 0, "an unknown tree resolves to nothing rather than throwing");

    // resolving another tree must not disturb the ETB's own state or the document
    const activeBefore = w.eval("ETB.activeTreeId()");
    const docBefore = w.eval("JSON.stringify(exec.etbTrees.O3)");
    idsFor('tY');
    ok(w.eval("ETB.activeTreeId()") === activeBefore, "resolving another tree leaves the active tree unchanged");
    ok(w.eval("JSON.stringify(exec.etbTrees.O3)") === docBefore, "…and does not mutate the document");
    ok(w.eval("ETB.getTree().tid") === 'tX', "…nor repoint state.tree");

    // the active tree returns LIVE objects, so cards act on the same experiment every other path holds
    ok(w.eval("ETB.currentExperimentsFor('tX')[0]===ETB.experimentById('x1')"),
      "the active tree yields live experiment objects, not copies");

    // ---------- per-tree range ----------
    const rangeFor = tid => JSON.parse(w.eval("JSON.stringify(ETB.treeRangeFor(" + JSON.stringify(tid) + "))"));
    const rX = rangeFor('tX'), rY = rangeFor('tY');
    ok(rX.min === 0 && rX.max === 0, "a tree whose only branch is terminal is 0-0 (" + rX.min + "-" + rX.max + ")");
    ok(rY.min === 1 && rY.max === 1, "a tree with one experiment ahead is 1-1 (" + rY.min + "-" + rY.max + ")");
    ok(rangeFor('nope').max === 0, "an unknown tree has no range rather than throwing");

    // A tree straight out of a document is RAW: string criteria instead of arrays, missing key_reads,
    // absent repeat_of. normalizeTree fixes those. Resolving such a tree without normalising is the
    // phase-4 failure, and it must not mutate the stored copy either.
    w.eval(`exec.etbTrees.O3.trees.push({ tid:'tRaw', name:'Raw tree', project_id:'O3', root_experiment_id:'r1',
      experiments:{ r1:{ id:'r1', code:'R1', name:'raw step', status:'in_progress',
        possible_results:[{ id:'pr1', label:'ok', criteria:'some free text', next_experiment_ids:[] }] } },
      terminal_types:{}, metadata:{} });`);
    const rawIds = idsFor('tRaw');
    ok(rawIds.join() === 'r1', "a RAW tree from the document resolves its current step (" + rawIds.join() + ")");
    const rawExp = JSON.parse(w.eval("JSON.stringify(ETB.currentExperimentsFor('tRaw')[0]||null)"));
    ok(!!rawExp && Array.isArray(rawExp.key_reads), "…normalised, so key_reads exists as an array");
    ok(!!rawExp && Array.isArray((rawExp.possible_results || [])[0].criteria),
      "…and string criteria became an array, as every other code path expects");
    // the document must be untouched: normalisation happens on a copy
    const storedRaw = JSON.parse(w.eval("JSON.stringify(RD.etbTreeById(exec.etbTrees.O3,'tRaw').experiments.r1)"));
    ok(typeof storedRaw.possible_results[0].criteria === 'string',
      "the STORED tree is still raw — resolving it did not rewrite the document");
    ok(storedRaw.key_reads === undefined, "…and gained no fields behind the user's back");

    // ---------- the current step section renders ONE CARD BLOCK PER TREE ----------
    w.eval(`exec.etbTrees={ O4: { schema:2, activeTid:'p1', trees:[
      ${JSON.stringify(mkTree('p1', 'Catalyst durability', 'c1', [{ terminal: 'halt' }]))},
      ${JSON.stringify(mkTree('p2', 'Membrane crossover', 'm1', [{ next_experiment_ids: ['m2'] }]))} ] } };
      exec.etbTrees.O4.trees[1].experiments.m2={ id:'m2', code:'M2', name:'follow up', status:'planned', key_reads:[], possible_results:[{terminal:'halt'}], audit_log:[], actual_outcome:null };
      selectedObj='O4'; try{ localStorage.removeItem('etbGraphOpen:O4'); }catch(e){}
      if(window.ETB&&ETB.setActiveProject) ETB.setActiveProject('O4');
      if(window.ETB&&ETB.setActiveTree) ETB.setActiveTree('p1');`);
    await sleep(80);

    const blocks = () => [...(host() ? host().querySelectorAll('.lt-block') : [])];
    ok(blocks().length === 2, "two trees produce two card blocks (" + blocks().length + ")");
    const btext = blocks().map(b => b.textContent).join(' || ');
    ok(/Catalyst durability/.test(btext) && /Membrane crossover/.test(btext), "…each labelled with its tree");
    ok(blocks()[0].querySelectorAll('.exs-card').length === 1, "the first tree shows its own current step");
    ok(blocks()[1].querySelectorAll('.exs-card').length === 1, "…and the second shows a DIFFERENT one, resolved from its own tree");
    ok(/C1/.test(blocks()[0].textContent) && /M1/.test(blocks()[1].textContent),
      "…the right experiment in each (" + blocks().map(b => (b.querySelector('.exs-code') || {}).textContent).join(',') + ")");
    ok(/0\u20130 next/.test(blocks()[0].textContent), "each block shows its own min-max");
    ok(/1\u20131 next/.test(blocks()[1].textContent), "…computed per tree, not shared");

    // ---------- graphs are LAZY ----------
    ok(blocks().every(b => !!b.querySelector('.exs-graph-lazy')), "every graph starts collapsed — N trees cost no cytoscape instances");
    ok(host().querySelectorAll('[data-ltgraph]').length === 0, "…so nothing is mounted");
    ok(blocks().every(b => !!b.querySelector('[data-ltshow]')), "…each offering to show its graph");

    // ---------- expansion is STICKY and per tree ----------
    blocks()[1].querySelector('[data-ltshow]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(60);
    ok(host().querySelectorAll('[data-ltgraph]').length === 1, "showing one graph mounts exactly one (" + host().querySelectorAll('[data-ltgraph]').length + ")");
    ok(!!blocks()[1].querySelector('[data-ltgraph]'), "…the one asked for");
    ok(!!blocks()[0].querySelector('.exs-graph-lazy'), "…leaving the other collapsed");
    ok(/etbGraphOpen/.test(Object.keys(w.localStorage).join(',')) || !!w.localStorage.getItem('etbGraphOpen:O4'),
      "expansion is remembered per person, in localStorage rather than the document");

    // switching the ACTIVE tree must not move or close the expanded graph — sticky is the point
    w.eval("ETB.setActiveTree('p2');"); await sleep(80);
    ok(!!blocks()[1].querySelector('[data-ltgraph]'), "switching the active tree leaves the expanded graph expanded");
    ok(!!blocks()[0].querySelector('.exs-graph-lazy'), "…and the collapsed one collapsed");
    w.eval("ETB.setActiveTree('p1');"); await sleep(80);
    ok(!!blocks()[1].querySelector('[data-ltgraph]'), "…in both directions");

    // and it survives a re-render, which happens on every keystroke elsewhere
    w.eval("renderExpSummary()"); await sleep(60);
    ok(!!blocks()[1].querySelector('[data-ltgraph]'), "expansion survives a re-render");

    blocks()[1].querySelector('[data-lthide]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(60);
    ok(host().querySelectorAll('[data-ltgraph]').length === 0, "hiding a graph unmounts it again");

    // ---------- every class the section emits must have a rule ----------
    // Phase 4's CSS was lost in a rebuild and nothing noticed, because jsdom does no layout: the
    // classes were emitted, styled by nothing, and every assertion still passed.
    const sheet = [...d.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
    const hasRule = cls => sheet.some(r => r.selectorText && r.selectorText.indexOf('.' + cls) >= 0);
    ['lt-block', 'lt-bhead', 'lt-bname', 'lt-brange', 'exs-graph-lazy', 'lt-lazy-n'].forEach(c => {
      ok(hasRule(c), "the section's ." + c + " has a style rule, not just markup");
    });



    // ---------- the chain manager ----------
    host().querySelector('[data-ltmanage]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(60);
    const mgr = () => d.getElementById('ltmBody');
    ok(d.getElementById('ltmOverlay').classList.contains('open'), "Manage opens the chain manager");
    const mrows = () => [...mgr().querySelectorAll('.ltm-row')];
    ok(mrows().length === 2, "…listing every tree (" + mrows().length + ")");
    ok(mgr().querySelectorAll('[data-ltmname]').length === 2, "…each renameable in place");
    ok(mgr().querySelectorAll('[data-ltmdel]').length === 2, "…each deletable");
    ok(/2 trees/.test(d.getElementById('ltmCount').textContent), "…with a count (" + d.getElementById('ltmCount').textContent + ")");
    ['lt' + 'm-row', 'ltm-list', 'ltm-confirm', 'ltm-meta'].forEach(c => {
      ok(hasRule(c), "the manager's ." + c + " has a style rule");
    });

    // reorder
    const orderNow = () => JSON.parse(w.eval("JSON.stringify(ETB.listTrees().map(function(t){return t.tid;}))"));
    ok(orderNow().join() === 'p1,p2', "trees start in creation order");
    mrows()[1].querySelector('[data-ltmup]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(50);
    ok(orderNow().join() === 'p2,p1', "moving a tree up reorders it (" + orderNow().join() + ")");
    ok(w.eval("ETB.activeTreeId()") === 'p1', "…without changing which tree is active");
    ok(w.eval("RD.etbTreesOf(exec.etbTrees.O4).trees.length") === 2, "…and without losing a tree");

    // rename through the manager
    const nameInput = mgr().querySelector('[data-ltmname]');
    nameInput.value = 'Renamed here';
    nameInput.dispatchEvent(new w.Event('change', { bubbles: true }));
    await sleep(50);
    ok(w.eval("ETB.listTrees()[0].name") === 'Renamed here', "renaming in the manager takes effect");

    // delete is armed, and names what it will take
    const delBtn = mrows()[0].querySelector('[data-ltmdel]');
    delBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(50);
    ok(!!mgr().querySelector('.ltm-confirm'), "delete asks first rather than acting");
    ok(/cannot be undone/i.test(mgr().querySelector('.ltm-confirm').textContent), "…saying it is irreversible");
    ok(/experiment/i.test(mgr().querySelector('.ltm-confirm').textContent), "…and how many experiments go with it");
    ok(w.eval("ETB.listTrees().length") === 2, "…having deleted nothing yet");

    mgr().querySelector('[data-ltmcancel]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(50);
    ok(!mgr().querySelector('.ltm-confirm'), "cancel backs out");
    ok(w.eval("ETB.listTrees().length") === 2, "…changing nothing");

    // confirmed delete
    const doomed = orderNow()[0];
    mrows()[0].querySelector('[data-ltmdel]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(50);
    mgr().querySelector('[data-ltmyes]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(60);
    ok(w.eval("ETB.listTrees().length") === 1, "confirming deletes the tree (" + w.eval("ETB.listTrees().length") + " left)");
    ok(orderNow().indexOf(doomed) === -1, "…the one that was asked for");
    ok(w.eval("!!ETB.getTree() && !!ETB.getTree().experiments"), "…and the ETB is left pointing at a real tree");

    // the last tree cannot be deleted — an objective must never be left with none
    ok(mgr().querySelectorAll('[data-ltmdel]').length === 0, "the last remaining tree offers no delete");
    ok(w.eval("ETB.deleteTree(ETB.listTrees()[0].tid)") === false, "…and refuses if called directly");
    ok(w.eval("ETB.listTrees().length") === 1, "…leaving the objective with its tree");

    // deleting the ACTIVE tree must hand off, not strand the ETB
    w.eval(`exec.etbTrees.O4={ schema:2, activeTid:'q2', trees:[
      ${JSON.stringify(mkTree('q1', 'Keeper', 'k1', []))},
      ${JSON.stringify(mkTree('q2', 'Doomed', 'd1', []))} ] };
      if(window.ETB&&ETB.setActiveTree) ETB.setActiveTree('q2');`);
    await sleep(50);
    ok(w.eval("ETB.activeTreeId()") === 'q2', "the doomed tree is active");
    ok(w.eval("ETB.deleteTree('q2')") === true, "deleting the active tree succeeds");
    ok(w.eval("ETB.activeTreeId()") === 'q1', "…and the active tree moves to a survivor (" + w.eval("ETB.activeTreeId()") + ")");
    ok(w.eval("ETB.getTree().tid") === 'q1', "…with state.tree following it");
    // The guards below are reachable from the API even when the UI hides the control, so drive them
    // directly — a defensive path that is never exercised is a defensive path that has never worked.
    w.eval(`exec.etbTrees.O4={ schema:2, activeTid:'s1', trees:[
      ${JSON.stringify(mkTree('s1', 'One', 'o1', []))},
      ${JSON.stringify(mkTree('s2', 'Two', 'w1', []))},
      ${JSON.stringify(mkTree('s3', 'Three', 'h1', []))} ] };
      if(window.ETB&&ETB.setActiveTree) ETB.setActiveTree('s2');`);
    await sleep(50);
    ok(w.eval("ETB.deleteTree('s3')") === true, "a tree deletes down to two");
    ok(w.eval("ETB.deleteTree('s1')") === true, "…and down to one");
    ok(w.eval("ETB.deleteTree(ETB.listTrees()[0].tid)") === false,
      "deleting the LAST tree is refused, whatever the UI shows — an objective is never left with none");
    ok(w.eval("ETB.listTrees().length") === 1, "…and it survives");
    ok(w.eval("ETB.deleteTree('never-existed')") === false, "deleting an unknown tree is refused");

    // reorder: a caller passing a short or bogus list must not lose trees
    w.eval(`exec.etbTrees.O4={ schema:2, activeTid:'r2', trees:[
      ${JSON.stringify(mkTree('r1', 'Alpha', 'a1', []))},
      ${JSON.stringify(mkTree('r2', 'Beta', 'b1', []))},
      ${JSON.stringify(mkTree('r3', 'Gamma', 'g1', []))} ] };
      if(window.ETB&&ETB.setActiveTree) ETB.setActiveTree('r2');`);
    await sleep(50);
    const ord = () => JSON.parse(w.eval("JSON.stringify(ETB.listTrees().map(function(t){return t.tid;}))"));
    ok(w.eval("ETB.reorderTrees(['r3','r1','r2'])") === true, "a full reorder is accepted");
    ok(ord().join() === 'r3,r1,r2', "…and applied (" + ord().join() + ")");
    ok(w.eval("ETB.activeTreeId()") === 'r2', "…leaving the active tree alone");

    ok(w.eval("ETB.reorderTrees(['r1'])") === true, "a PARTIAL order is accepted");
    ok(ord().length === 3, "…without dropping the trees it did not mention (" + ord().length + ")");
    ok(ord()[0] === 'r1', "…placing the named one first");
    ok(w.eval("ETB.reorderTrees(['nope','alsonope'])") === true, "an order naming unknown trees is survivable");
    ok(ord().length === 3, "…and still loses nothing");
    ok(w.eval("ETB.reorderTrees('not an array')") === false, "a malformed order is refused outright");
    ok(ord().length === 3, "…changing nothing");

    w.eval("closeTreeManager()");

    // ---------- the header must show a REAL range for an ordinary objective ----------
    // Every fixture above hands the app a ready-made schema-2 bag. A real objective is schema 1 and is
    // reached through setActiveProject, which resolves from state.doc — a snapshot only refreshed at
    // load. That drift made every tree read 0-0 in the running app while these tests passed.
    w.eval(`exec.etbTrees={ OS: { project_id:'OS', root_experiment_id:'s1',
      experiments:{ s1:{ id:'s1', code:'S1', name:'step', status:'in_progress', key_reads:[], audit_log:[], actual_outcome:null,
                         possible_results:[{ id:'x1', label:'ok', next_experiment_ids:['s2'] }] },
                    s2:{ id:'s2', code:'S2', name:'next', status:'planned', key_reads:[], audit_log:[], actual_outcome:null,
                         possible_results:[{ id:'x2', label:'done', terminal:'halt' }] } },
      terminal_types:{ halt:{ label:'Halt' } }, metadata:{} } };
      selectedObj='OS'; ETB.setActiveProject('OS'); renderExpSummary();`);
    await sleep(80);
    const liveTid = w.eval("ETB.activeTreeId()");
    ok(w.eval("Object.keys((ETB.getTree()||{}).experiments||{}).length") === 2,
      "a schema-1 objective reaches the ETB with its experiments intact");
    const liveRange = JSON.parse(w.eval("JSON.stringify(ETB.treeRangeFor(" + JSON.stringify(liveTid) + "))"));
    ok(liveRange.max === 1, "…and its remaining next steps compute (" + liveRange.min + "-" + liveRange.max + ")");
    const hdr = (host().querySelector('.lt-range') || {}).textContent || '';
    ok(/1\u20131/.test(hdr), "the header label shows that range, not a pinned 0-0 (" + hdr.trim() + ")");
    ok(!/^0\u20130/.test(hdr.trim()), "…specifically not 0-0");

    // A schema-1 bag is COPIED by the wrap, not shared, so a rename that only mutates the normalised
    // copy would vanish on the next read. This is the case that needs the explicit write-back.
    w.eval(`exec.etbTrees={ O2: { tid:'t_main', name:'Main', project_id:'O2', root_experiment_id:'m1',
      experiments:{ m1:{ id:'m1', code:'M1', name:'s', status:'planned', key_reads:[], possible_results:[], audit_log:[], actual_outcome:null } },
      terminal_types:{}, metadata:{} } };
      selectedObj='O2'; if(window.ETB&&ETB.setActiveProject) ETB.setActiveProject('O2');
      if(window.ETB&&ETB.setActiveTree) ETB.setActiveTree('t_main');`);
    await sleep(50);
    ok(w.eval("ETB.listTrees().length") === 1, "an unmigrated objective presents one tree");
    ok(w.eval("ETB.renameTree('t_main','Renamed on legacy')") === true, "…which can be renamed");
    ok(w.eval("JSON.parse(JSON.stringify(RD.etbTreesOf(exec.etbTrees.O2))).trees[0].name") === 'Renamed on legacy',
      "…and the rename reaches the document even though the wrap copied the tree");
  } catch (e) {
    ok(false, 'header flow threw: ' + (e && e.message));
  }

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} multi-tree engine assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 900);
