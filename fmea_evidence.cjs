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
  } catch (e) {
    ok(false, "DOM flow threw: " + (e && e.message));
  }

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} FMEA evidence assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 900);
