// Phase M2 — milestone KR UI in the Sales app. Drives the REAL built sales_app.html:
//   - a milestone KR shows a KR-M{n} chip and a "{done}/{total} steps · {score}%" toggle
//   - the drawer is STATUS-ONLY (checkbox/% editable; names/weights/due read-only, no mode toggle)
//   - the KR edit modal has the credit-mode toggle + an editable step plan; saving persists steps+creditMode
//   - the milestone KR's attainment + objective rollup come from the shared engine
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
const OUT = (process.env.RD_OUT || '/mnt/user-data/outputs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

function boot(url) {
  const HTML = fs.readFileSync(OUT + '/sales_app.html', 'utf8');
  return new Promise(res => {
    const dom = new JSDOM(HTML, {
      runScripts: "dangerously", virtualConsole: new VirtualConsole(), url, pretendToBeVisual: true,
      beforeParse(w) {
        w.matchMedia = () => ({ matches: false, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } });
        w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => { };
        w.fetch = () => Promise.reject(new Error('no net'));
      }
    });
    setTimeout(() => res(dom.window), 500);
  });
}

// seed a division with one objective and, in exec, one milestone KR + one percentage KR
function seed(w) {
  w.eval(`
    portfolio={ units:[], divisions:[{id:'DIV-FC',name:'FC',kind:'rd'}],
      objectives:[{id:'O1',divisionId:'DIV-FC',statement:'Ship it',quarter:'2026 Q1'}],
      initiatives:[], products:[], models:[], milestones:[], kpis:[], kpiDefs:[], kpiUpdates:[] };
    divisionId='DIV-FC'; selectedObj='O1';
    exec={ objectiveState:[], keyResults:[
        {id:'KR1', objectiveId:'O1', statement:'Land 3 logos', trackingType:'milestone', creditMode:'binary',
          steps:[ {id:'a',name:'List built',weight:15,due:'',completion:100},
                  {id:'b',name:'Meetings',weight:null,due:'',completion:67},
                  {id:'c',name:'Proposals',weight:35,due:'',completion:33},
                  {id:'d',name:'Signed',weight:null,due:'',completion:0} ]},
        {id:'KR2', objectiveId:'O1', statement:'Coverage', trackingType:'percentage', progress:80}
      ], kpis:[], kpiUpdates:[], stageGates:[], stageGateSets:[], stageGateEdges:[], tasks:[] };
    renderAll=function(){ renderKRs(); }; setMsg=function(){}; persistExec=function(){};
    renderKRs();
  `);
}

(async () => {
  const w = await boot("https://x.test/?division=DIV-FC&token=t");
  seed(w);
  const d = w.document;

  // ---- chip + toggle label ----
  const chips = [...d.querySelectorAll('#subKR .g-chip')].map(c => c.textContent.trim());
  ok(chips.indexOf('KR-M1') >= 0, 'the milestone KR shows a KR-M1 chip');
  ok(chips.indexOf('KR2') >= 0, 'the percentage KR keeps its KR2 chip');
  const toggles = [...d.querySelectorAll('#subKR .tgt-toggle')].map(t => t.textContent.replace(/\s+/g, ' ').trim());
  const msToggle = toggles.find(t => /step/.test(t));
  ok(!!msToggle && /1\/4 steps/.test(msToggle), 'the milestone toggle shows done/total steps (1/4)');
  ok(/15%/.test(msToggle || ''), 'the milestone toggle shows the binary score (15%)');

  // ---- attainment comes from the engine (binary = 15) ----
  const attVals = [...d.querySelectorAll('#subKR .kr-block .r-val')].map(v => v.textContent.trim());
  ok(attVals.some(v => v.indexOf('15') === 0), 'the milestone KR attainment renders 15 (binary engine score)');

  // ---- expand: status-only drawer ----
  w.eval("expandedKRs.add('KR1'); renderAll();");
  const drawer = d.querySelector('#subKR .tgt-panel');
  ok(!!drawer && !!drawer.querySelector('[data-mscheck]'), 'the drawer has a status control (checkbox in binary)');
  ok(!drawer.querySelector('[data-msmode],[data-mswt],[data-msname],[data-msdue],[data-msadd]'),
    'the drawer has NO structural editors (mode/weight/name/due/add are modal-only)');
  ok(drawer.querySelectorAll('.ms-wro').length === 4, 'the drawer shows weights as read-only cells');

  // ticking a step updates completion + re-scores (binary: 2 of 4 done -> 15+? depends; check done-count in toggle)
  const firstUnchecked = [...drawer.querySelectorAll('[data-mscheck]')].find(x => !x.checked);
  ok(!!firstUnchecked, 'there is an unchecked step to tick');
  firstUnchecked.checked = true; firstUnchecked.dispatchEvent(new w.Event('change'));
  const t2 = [...d.querySelectorAll('#subKR .tgt-toggle')].map(t => t.textContent).find(t => /step/.test(t));
  ok(/2\/4 steps/.test(t2 || ''), 'ticking a step updates the drawer + toggle to 2/4 steps');

  // ---- the KR edit modal: mode toggle + editable steps, and saving persists ----
  // open the edit modal for KR1 via the pencil path
  w.eval("draftKr=initDraftKr(exec.keyResults.find(k=>k.id==='KR1')); draftKrFor='KR1';");
  w.eval("document.getElementById('modalBody').innerHTML=krModalBody(); wireKrModal();");
  const mb = d.getElementById('modalBody');
  ok(!!mb.querySelector('[data-msmode]'), 'the KR modal has the credit-mode toggle (binary/partial)');
  ok(mb.querySelectorAll('[data-mswt]').length === 4, 'the KR modal has editable weight inputs for all 4 steps');
  ok(!!mb.querySelector('[data-msadd]'), 'the KR modal has an add-step control');
  // switch to partial in the draft and save
  w.eval("draftKr.creditMode='partial';");
  w.eval("saveKrModal(false);");
  const kr = w.eval("JSON.stringify(exec.keyResults.find(k=>k.id==='KR1'))");
  const krObj = JSON.parse(kr);
  ok(krObj.creditMode === 'partial', 'saving the modal persists creditMode=partial onto the KR');
  ok(Array.isArray(krObj.steps) && krObj.steps.length >= 4, 'saving persists the steps array on the KR');
  // after switching to partial, KR-M score changes (partial rescoring); objective rollup follows
  const msScore = w.eval("RD.milestoneKrScore(exec.keyResults.find(k=>k.id==='KR1'))");
  ok(msScore > 15, 'partial mode rescored the milestone KR above the binary 15');
  const objScore = w.eval("RD.objectiveScore('O1', emForCore())");
  ok(objScore != null, 'the objective still scores with the milestone KR folded in');

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fl = out.filter(x => x.startsWith('FAIL'));
  console.log(fl.length ? `\n${fl.length}/${out.length} FAILED` : `\nPASS - ${out.length} milestone-UI (M2) assertions green`);
  process.exit(fl.length ? 1 : 0);
})();
