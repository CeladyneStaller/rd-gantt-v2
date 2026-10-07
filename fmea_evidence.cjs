// FMEA evidence — an experiment attached to a failure mode, an effect, or a cause.
//
// The point of the feature is that a cause carrying an RPN can also carry the experiment that tested
// it. The three attach levels share one shape and one editor; only where it is stored differs, so the
// assertions below check all three rather than trusting that one implies the others.
const RD = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

// ---------- engine ----------
(function () {
  const prob = { modes: [{ mid: 'm1', mode: 'A', experiments: [{ code: 'EXP-1', verdict: 'confirmed' }],
    effects: [{ eid: 'e1', effect: 'E', experiments: [{ code: 'EXP-2', verdict: 'refuted' }],
      causes: [{ cid: 'c1', cause: 'C', experiments: [{ code: 'EXP-3', verdict: '' }] }] }] }] };

  const all = RD.fmeaAllExperiments(prob);
  ok(all.length === 3, "every experiment on a problem is found, at all three levels (" + all.length + ")");
  ok(all.map(r => r.level).sort().join() === 'cause,effect,mode', "…each tagged with the level it hangs off");
  const byLevel = {}; all.forEach(r => byLevel[r.level] = r.x.code);
  ok(byLevel.mode === 'EXP-1' && byLevel.effect === 'EXP-2' && byLevel.cause === 'EXP-3', "…and matched to the right node");
  const causeHit = all.filter(r => r.level === 'cause')[0];
  ok(!!causeHit && causeHit.cid === 'c1', "a cause-level experiment carries its cause id, so the section can place its chip");

  const roll = RD.fmeaEvidenceRollup(prob);
  ok(roll.total === 3, "the rollup counts every experiment (" + roll.total + ")");
  ok(roll.confirmed === 1 && roll.refuted === 1 && roll.open === 1, "…split by verdict, with an unconcluded one counted open");

  ok(RD.fmeaNextExpCode(prob) === 'EXP-4', "the next code skips the ones already used (" + RD.fmeaNextExpCode(prob) + ")");
  // codes must not renumber when one is deleted — a note saying "see EXP-4" has to keep meaning it
  const gappy = { modes: [{ mid: 'm', experiments: [{ code: 'EXP-1' }, { code: 'EXP-3' }], effects: [] }] };
  ok(RD.fmeaNextExpCode(gappy) === 'EXP-2', "a gap left by a deletion is reused rather than skipped (" + RD.fmeaNextExpCode(gappy) + ")");
  ok(RD.fmeaNextExpCode({ modes: [] }) === 'EXP-1', "the first experiment on a problem is EXP-1");

  ok(RD.fmeaNodeExperiments({ experiments: [{}] }).length === 1, "a node's experiments are read off it");
  ok(RD.fmeaNodeExperiments({}).length === 0, "a node with none yields none, not a throw");
  ok(RD.fmeaNodeExperiments(null).length === 0, "…and neither does a missing node");
  ok(RD.fmeaAllExperiments(null).length === 0, "a missing problem yields nothing");

  // results grid completeness = samples x key reads
  const p1 = RD.fmeaExpProgress({ samples: ['S1', 'S2'], key_reads: [{ krid: 'k1' }], values: { S1: { k1: '22' } } });
  ok(p1.total === 2 && p1.filled === 1, "progress counts samples x key reads (" + p1.filled + "/" + p1.total + ")");
  ok(p1.complete === false, "…incomplete while a cell is empty");
  const p2 = RD.fmeaExpProgress({ samples: ['S1'], key_reads: [{ krid: 'k1' }], values: { S1: { k1: '0' } } });
  ok(p2.complete === true, "a recorded ZERO counts as a value, not as blank");
  const p3 = RD.fmeaExpProgress({ samples: ['S1'], key_reads: [{ krid: 'k1' }], values: { S1: { k1: 'abc' } } });
  ok(p3.filled === 0, "a non-numeric entry does not count as recorded");
  ok(RD.fmeaExpProgress({}).total === 0, "an experiment with no samples or key reads has nothing to record");
  ok(RD.fmeaExpProgress({}).complete === false, "…and is not reported complete");
})();


// ---------- the LOAD path must not discard evidence ----------
// This is the one that was missing. migrateProblem rebuilds every problem from an explicit field list,
// so anything not named there is silently dropped when the document is read back. The save was correct
// the whole time; the load threw the experiments away. A round trip through JSON.parse/stringify —
// which is what the earlier tests did — does not exercise this at all.
(function () {
  const X = [{ xid: 'x1', code: 'EXP-1', hypothesis: 'H', toggle: 'T', test: 'E',
    samples: ['S1'], key_reads: [{ krid: 'k1', name: 'OCV', unit: 'V' }],
    values: { S1: { k1: '0.67' } }, notes: 'N', verdict: 'confirmed', conclusion: 'C' }];
  const stored = { rid: 'r1', problem: 'P', objectiveId: 'O1', modes: [
    { mid: 'm1', mode: 'M', experiments: X, effects: [
      { eid: 'e1', effect: 'E', experiments: X, causes: [
        { cid: 'c1', cause: 'C', severity: 7, occurrence: 6, detection: 5, mitigation: '', experiments: X }] }] }] };
  const back = RD.migrateProblem(stored);

  ok((back.modes[0].experiments || []).length === 1, "a MODE-level experiment survives the load migration");
  ok((back.modes[0].effects[0].experiments || []).length === 1, "…an EFFECT-level one too");
  ok((back.modes[0].effects[0].causes[0].experiments || []).length === 1, "…and a CAUSE-level one");
  const rt = (back.modes[0].experiments || [])[0] || {};
  ok(rt.code === 'EXP-1' && rt.hypothesis === 'H' && rt.verdict === 'confirmed', "…with its details intact");
  ok(((rt.values || {}).S1 || {}).k1 === '0.67', "…including the recorded values");
  ok((rt.key_reads || []).length === 1 && (rt.samples || []).length === 1, "…and its key reads and samples");

  // a problem with no evidence must not gain an empty array — the shape stays as it was
  const plain = RD.migrateProblem({ rid: 'r2', modes: [{ mid: 'm', effects: [{ eid: 'e', causes: [{ cid: 'c' }] }] }] });
  ok(!('experiments' in plain.modes[0]), "a problem with no evidence is unchanged by the migration");
  ok(!('experiments' in plain.modes[0].effects[0].causes[0]), "…at every level");

  // and the migration still normalises what it always did
  ok(plain.modes[0].effects[0].causes[0].severity === 1, "the migration still fills missing S/O/D defaults");
  ok(plain.status === 'open', "…and the problem status");
})();

// ---------- the modal flow, through the real DOM ----------
// Buttons are clicked, not called: the point is that "+ Experiment" is reachable at all three levels
// and that what it opens edits the node it was launched from.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
let html = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8');
html = html.replace("\ninit();\n\n})();", "\ninit();\n\n})();");
const vc = new VirtualConsole();
const dom = new JSDOM(html, { runScripts: "dangerously", virtualConsole: vc, url: "https://x.test/?token=tok",
  pretendToBeVisual: true, beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {};
    w.fetch = () => Promise.reject(new Error('no net'));
    w.cytoscape = function () { return { on(){}, ready(cb){try{cb&&cb();}catch(e){}}, fit(){}, resize(){}, destroy(){},
      getElementById(){return{length:0,select(){}};}, zoom(){return 1;}, width(){return 800;}, height(){return 560;},
      layout(){return{run(){}};}, elements(){return{length:0};}, $(){return{unselect(){}};} }; };
  } });

setTimeout(() => {
  const w = dom.window, d = w.document;
  const draft = () => w.eval("JSON.stringify(draftRisk)");
  try {
    // a problem with one mode -> one effect -> one cause, opened in the FMEA modal
    w.eval(`exec.risks=[{rid:'r1',problem:'P',gateId:'',status:'open',knowns:[],modes:[
      {mid:'m1',mode:'Pt dissolution',status:'open',effects:[
        {eid:'e1',effect:'ECSA loss',status:'open',causes:[
          {cid:'c1',cause:'Potential excursions',severity:7,occurrence:6,detection:5,mitigation:'',status:'open'}]}]}]}];
      selectedObj='O1'; persist=function(){}; setMsg=function(){}; renderAll=function(){};
      openEditFmeaModal('r1');`);

    const body = d.getElementById('fmeaBody');
    ok(!!body && body.innerHTML.length > 0, "the FMEA modal opens for editing");
    const addBtns = [...d.querySelectorAll('#fmeaBody button')].filter(b => /\+ Experiment/.test(b.textContent));
    ok(addBtns.length === 3, "an + Experiment button sits at all three levels: mode, effect and cause (" + addBtns.length + ")");

    // the cause-level button must sit ABOVE the mitigation field, per the spec
    const mitInput = d.querySelector('#fmeaBody input.fm-mit');
    ok(!!mitInput, "the cause still has its mitigation field");
    const causeBtn = addBtns[addBtns.length - 1];
    ok(!!causeBtn && !!mitInput &&
       (causeBtn.compareDocumentPosition(mitInput) & 4) !== 0,
       "the cause's + Experiment sits above the mitigation field");

    // clicking it adds an experiment to THAT cause and opens the editor
    causeBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const dr = JSON.parse(draft());
    const cause = dr.modes[0].effects[0].causes[0];
    ok(Array.isArray(cause.experiments) && cause.experiments.length === 1, "clicking it attaches an experiment to that cause");
    ok(cause.experiments[0].code === 'EXP-1', "…with a code assigned (" + cause.experiments[0].code + ")");
    ok(dr.modes[0].experiments === undefined || (dr.modes[0].experiments || []).length === 0, "…and not to the failure mode above it");
    const fxOv = d.getElementById('fxOverlay');
    ok(!!fxOv && fxOv.classList.contains('open'), "the experiment editor opens");
    ok(/Cause 1/.test(d.getElementById('fxCtx').textContent), "…naming the node it was launched from (" + d.getElementById('fxCtx').textContent.slice(0, 30) + ")");

    // the editor carries the four detail fields and the results section
    const fxb = d.getElementById('fxBody').innerHTML;
    ok(/Hypothesis/.test(fxb) && /Toggle/.test(fxb) && /Experiment<\/label>/.test(fxb) && /Samples/.test(fxb),
       "the details section has hypothesis, toggle, experiment and samples");
    ok(/Results/.test(fxb) && /Notes/.test(fxb) && /Conclusion/.test(fxb), "the results section has notes and a conclusion");

    // a sample added in DETAILS appears as a row in RESULTS
    const sIn = d.getElementById('fx-newsample');
    ok(!!sIn, "samples can be added");
    sIn.value = 'MEA-21'; sIn.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const krBtn = [...d.querySelectorAll('#fxBody button')].find(b => /\+ Key read/.test(b.textContent));
    ok(!!krBtn, "a key read column can be added");
    krBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const grid = d.querySelector('#fxBody table.fx-grid');
    ok(!!grid, "the results grid renders");
    ok(/MEA-21/.test(grid.textContent), "the sample declared in details appears as a results row, not re-entered");
    ok(grid.querySelectorAll('input.fx-val').length === 1, "…with a value cell per key read (" + grid.querySelectorAll('input.fx-val').length + ")");

    // recording a value updates progress
    const vIn = grid.querySelector('input.fx-val');
    vIn.value = '22'; vIn.dispatchEvent(new w.Event('input', { bubbles: true }));
    const dr2 = JSON.parse(draft());
    const x2 = dr2.modes[0].effects[0].causes[0].experiments[0];
    ok(RD.fmeaExpProgress(x2).filled === 1, "a recorded value lands on the experiment");
    ok(/1 of 1/.test(d.getElementById('fxCount').textContent), "…and the footer counts it (" + d.getElementById('fxCount').textContent + ")");

    // a verdict drives the chip shown back in the FMEA modal
    const vSel = d.querySelector('#fxBody select.fx-verdict');
    ok(!!vSel, "the conclusion carries a verdict");
    vSel.value = 'confirmed'; vSel.dispatchEvent(new w.Event('change', { bubbles: true }));
    w.eval("closeFmeaExp()");
    ok(!d.getElementById('fxOverlay').classList.contains('open'), "closing returns to the FMEA modal");
    const chip = d.querySelector('#fmeaBody .fx-chip');
    ok(!!chip && /EXP-1/.test(chip.textContent), "the experiment shows on the cause it belongs to");
    ok(!!chip && chip.classList.contains('ok'), "…coloured by its verdict");

    // mode-level and effect-level attach to their own nodes
    const btns2 = [...d.querySelectorAll('#fmeaBody button')].filter(b => /\+ Experiment/.test(b.textContent));
    btns2[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true })); w.eval("closeFmeaExp()");
    const dr3 = JSON.parse(draft());
    ok((dr3.modes[0].experiments || []).length === 1, "the mode-level button attaches to the failure mode");
    ok(dr3.modes[0].experiments[0].code === 'EXP-2', "…taking the next code, unique across the problem (" + dr3.modes[0].experiments[0].code + ")");
    ok((dr3.modes[0].effects[0].experiments || []).length === 0, "…and not to the effect below it");
    // ---------- collapsing sections in the FMEA modal ----------
    // The state cannot live in the DOM: renderFmeaModes re-runs on every keystroke, so a class or a
    // <details> would be wiped by the next input event. And it must be keyed on the stable ids, or
    // deleting one row would silently collapse a different one.
    w.eval("fmSetAllCollapsed(false)");
    const carets = () => [...d.querySelectorAll('#fmeaBody .fm-caret')];
    ok(carets().length === 3, "every level offers a collapse control: mode, effect and cause (" + carets().length + ")");
    ok(carets().every(b => b.getAttribute('aria-expanded') === 'true'), "…all expanded by default, so opening the modal is unchanged");

    const modeCard = () => d.querySelector('#fmeaBody .fm-mode');
    ok(!!modeCard().querySelector('textarea'), "an expanded failure mode shows its editor");
    carets()[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(modeCard().classList.contains('fm-collapsed'), "clicking the caret collapses the failure mode");
    ok(!modeCard().querySelector('textarea'), "…hiding its editor");
    const lbl = modeCard().querySelector('.fm-ctxt');
    ok(!!lbl && /Pt dissolution/.test(lbl.textContent), "…while still naming it (" + (lbl && lbl.textContent) + ")");
    const meta = modeCard().querySelector('.fm-cmeta');
    ok(!!meta && /effect/.test(meta.textContent) && /cause/.test(meta.textContent),
       "…and summarising what is inside (" + (meta && meta.textContent) + ")");
    ok(/evidence/.test((meta && meta.textContent) || ''), "…including its evidence count");

    // the state has to survive the re-render that every keystroke triggers
    w.eval("renderFmeaModes()");
    ok(modeCard().classList.contains('fm-collapsed'), "the collapse survives a re-render, so typing elsewhere does not reopen it");

    // expand again, then collapse a CAUSE and delete a different one: the wrong row must not collapse
    d.querySelector('#fmeaBody .fm-caret').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(!modeCard().classList.contains('fm-collapsed'), "clicking again expands it");

    w.eval(`draftRisk.modes[0].effects[0].causes.push({cid:'c2',cause:'Second cause',severity:3,occurrence:3,detection:3,mitigation:'',status:'open'}); renderFmeaModes();`);
    const causeCarets = () => [...d.querySelectorAll('#fmeaBody .fm-cause .fm-caret')];
    ok(causeCarets().length === 2, "two causes, two carets");
    causeCarets()[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const causeCards = () => [...d.querySelectorAll('#fmeaBody .fm-cause')];
    ok(!causeCards()[0].classList.contains('fm-collapsed') && causeCards()[1].classList.contains('fm-collapsed'),
       "collapsing the second cause leaves the first open");
    w.eval("delDraftCause(0,0,0)");            // delete the FIRST cause; indices shift
    ok(causeCards().length === 1, "one cause remains after deleting the other");
    ok(causeCards()[0].classList.contains('fm-collapsed'),
       "the surviving cause keeps ITS own collapse state — keyed on id, not on index");

    // collapse all / expand all
    w.eval("fmSetAllCollapsed(true)");
    ok([...d.querySelectorAll('#fmeaBody .fm-mode,#fmeaBody .fm-effect,#fmeaBody .fm-cause')].every(x => x.classList.contains('fm-collapsed')),
       "Collapse all collapses every level at once");
    ok(d.querySelectorAll('#fmea-modes-section textarea').length === 0, "…leaving no mode, effect or cause editor open");
    w.eval("fmSetAllCollapsed(false)");
    ok([...d.querySelectorAll('#fmeaBody .fm-mode,#fmeaBody .fm-effect,#fmeaBody .fm-cause')].every(x => !x.classList.contains('fm-collapsed')),
       "Expand all reopens them");

    // ---------- an experiment must SURVIVE a save and a reload ----------
    // The bug this pins: "Save experiment" only closed the sub-modal, leaving the work in draftRisk.
    // Closing the FMEA modal or refreshing lost it. The engine and DOM assertions above all passed
    // while that was true, because none of them crossed from the draft into exec.
    let persisted = 0;
    w.eval("persist=function(){ window.__persistCalls=(window.__persistCalls||0)+1; }; flushPersist=function(){ window.__persistCalls=(window.__persistCalls||0)+1; return Promise.resolve(); };");
    w.eval(`exec.risks=[{rid:'r9',problem:'Round trip',objectiveId:'O1',gateId:null,status:'open',knowns:[],modes:[
      {mid:'m9',mode:'M',status:'open',effects:[{eid:'e9',effect:'E',status:'open',causes:[
        {cid:'c9',cause:'C',severity:5,occurrence:5,detection:5,mitigation:'',status:'open'}]}]}]}];
      window.__persistCalls=0; openEditFmeaModal('r9');`);
    const causeBtn2 = [...d.querySelectorAll('#fmeaBody button')].filter(b => /\+ Experiment/.test(b.textContent)).pop();
    causeBtn2.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    w.eval("var x=draftRisk.modes[0].effects[0].causes[0].experiments[0]; x.hypothesis='H'; x.samples=['S1']; x.key_reads=[{krid:'k1',name:'OCV',unit:'V'}]; x.values={S1:{k1:'0.67'}}; x.verdict='confirmed';");

    const liveExps = () => JSON.parse(w.eval(
      "(function(){var r=(exec.risks||[])[0]||{};var m=(r.modes||[])[0]||{};var e=(m.effects||[])[0]||{};" +
      "var c=(e.causes||[])[0]||{};return JSON.stringify(c.experiments||[]);})()"));
    ok(liveExps().length === 0, "before saving, the experiment is only in the draft");

    // click the modal's own Save experiment button — not the function
    const fxSave = [...d.querySelectorAll('#fxOverlay button')].find(b => /Save experiment/.test(b.textContent));
    ok(!!fxSave, "the experiment modal has a Save experiment button");
    fxSave.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

    ok(liveExps().length === 1, "Save experiment commits it to the live problem, not just the draft");
    const le0 = liveExps()[0] || {};
    ok(le0.verdict === 'confirmed' && le0.hypothesis === 'H', "…with its details intact");
    ok(((le0.values || {}).S1 || {}).k1 === '0.67', "…including recorded values");
    ok(w.eval("window.__persistCalls") > 0, "…and asks for a save, so a refresh cannot lose it");
    // asserting persist() was CALLED is not the same as a write leaving the app — the earlier version of
    // this test passed while the feature saved nothing. Check the document actually goes out.
    ok(/flushPersist/.test(w.eval("String(saveFmeaExp)")),
       "the save flushes immediately rather than scheduling a debounced write that a refresh can outrun");

    // closing the FMEA modal WITHOUT Save changes must not undo it
    w.eval("closeFmeaModal()");
    ok(liveExps().length === 1, "closing the FMEA modal without Save changes does not discard a saved experiment");

    // and it survives a serialise/parse round trip, which is what a reload does
    const ser = w.eval("JSON.stringify(exec)");
    w.eval("exec=JSON.parse(" + JSON.stringify(ser) + ");");
    ok(liveExps().length === 1, "the experiment survives a document round trip");
    ok((liveExps()[0] || {}).code === 'EXP-1', "…keeping its code (" + (liveExps()[0] || {}).code + ")");

    // The draft can diverge structurally from the live problem before the experiment is saved — add a
    // mode and every later index shifts. Matching the live node by POSITION would then write the
    // experiment onto the wrong node, or onto nothing at all.
    w.eval(`exec.risks=[{rid:'r8',problem:'Shift',objectiveId:'O1',gateId:null,status:'open',knowns:[],modes:[
      {mid:'mZ',mode:'Original',status:'open',effects:[{eid:'eZ',effect:'E',status:'open',causes:[
        {cid:'cZ',cause:'C',severity:5,occurrence:5,detection:5,mitigation:'',status:'open'}]}]}]}];
      openEditFmeaModal('r8');
      draftRisk.modes.unshift({mid:'mNEW',mode:'Inserted first',status:'open',effects:[]});
      renderFmeaModes();`);
    ok(w.eval("draftRisk.modes.length") === 2 && w.eval("exec.risks[0].modes.length") === 1,
       "the draft now has a mode the live problem does not, so indices no longer line up");
    // attach to the ORIGINAL mode, which is now at draft index 1 but live index 0
    w.eval("addDraftExperiment(1,0,0);");
    const fxSave2 = [...d.querySelectorAll('#fxOverlay button')].find(b => /Save experiment/.test(b.textContent));
    if (fxSave2) fxSave2.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const shifted = JSON.parse(w.eval(
      "(function(){var r=(exec.risks||[]).filter(function(x){return x.rid==='r8';})[0]||{};" +
      "var m=(r.modes||[]).filter(function(x){return x.mid==='mZ';})[0]||{};" +
      "var e=(m.effects||[])[0]||{};var c=(e.causes||[])[0]||{};return JSON.stringify(c.experiments||[]);})()"));
    ok(shifted.length === 1, "the experiment still reaches the right node after an index shift — matched by id, not position");

    // The write-nothing path: a node created in THIS editing session has no counterpart in the saved
    // document. The surgical per-node commit silently wrote nothing here, which is how evidence was
    // being lost — every assertion above passed while this case did.
    w.eval(`exec.risks=[{rid:'r7',problem:'Draft node',objectiveId:'O1',gateId:null,status:'open',knowns:[],modes:[
      {mid:'m7',mode:'M',status:'open',effects:[{eid:'e7',effect:'E',status:'open',causes:[
        {cid:'c7',cause:'existing',severity:5,occurrence:5,detection:5,mitigation:'',status:'open'}]}]}]}];
      openEditFmeaModal('r7');
      draftRisk.modes[0].effects[0].causes.push({cid:'cNEW',cause:'created just now',severity:1,occurrence:1,detection:1,mitigation:'',status:'open'});
      renderFmeaModes(); window.__persistCalls=0;`);
    const newBtn = [...d.querySelectorAll('#fmeaBody button')].filter(b => /\+ Experiment/.test(b.textContent)).pop();
    newBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const saveNew = [...d.querySelectorAll('#fxOverlay button')].find(b => /Save experiment/.test(b.textContent));
    if (saveNew) saveNew.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const savedNew = JSON.parse(w.eval(
      "(function(){var r=(exec.risks||[]).filter(function(x){return x.rid==='r7';})[0]||{};" +
      "var m=(r.modes||[])[0]||{};var e=(m.effects||[])[0]||{};" +
      "return JSON.stringify((e.causes||[]).filter(function(c){return c.cid==='cNEW';})[0]||null);})()"));
    ok(!!savedNew, "a cause created during this session is written to the document");
    ok(!!savedNew && (savedNew.experiments || []).length === 1, "…carrying the experiment attached to it");
    ok(w.eval("window.__persistCalls") > 0, "…and a save is requested, not silently skipped");

    // and a problem that has never been saved at all still cannot swallow evidence
    w.eval(`window.__persistCalls=0; window.__before=exec.risks.length;
      editingRiskId=null;
      draftRisk={rid:'rNEW',problem:'',objectiveId:null,gateId:null,status:'open',knowns:[],modes:[
        {mid:'mX',mode:'New mode',status:'open',effects:[{eid:'eX',effect:'E',status:'open',causes:[
          {cid:'cX',cause:'C',severity:1,occurrence:1,detection:1,mitigation:'',status:'open'}]}]}]};
      renderFmeaModes();`);
    const nb2 = [...d.querySelectorAll('#fmeaBody button')].filter(b => /\+ Experiment/.test(b.textContent)).pop();
    nb2.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const sv2 = [...d.querySelectorAll('#fxOverlay button')].find(b => /Save experiment/.test(b.textContent));
    if (sv2) sv2.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval("exec.risks.length") === w.eval("window.__before") + 1, "an unsaved problem is created rather than losing the evidence in it");
    ok(w.eval("window.__persistCalls") > 0, "…and that write is requested too");

  } catch (e) {
    ok(false, "DOM flow threw: " + (e && e.message) + " @ " + String((e&&e.stack||"").split("\n")[1]||"").trim().slice(0,90));
  }

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} FMEA evidence assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 900);
