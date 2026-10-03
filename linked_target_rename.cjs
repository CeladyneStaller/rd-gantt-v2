// Renaming a linked stage-gate target without renaming the metric it links to.
//
// A linked target is a member KPI: it inherits name, direction, unit and target from the definer, and
// kpiName resolved straight to the definer's name — so there was no way to word a target for one gate.
// The member now carries a `localName` that kpiName prefers and NEVER follows up the link, so renaming
// a target here cannot rename the metric every other host reads.
const RD = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

// ---------- the engine rule ----------
(function () {
  try {
    const ks = [{ id: 'DEF', name: 'Cell voltage', groupId: 'g1', isDefiner: true, direction: 'up', target: 0.7, unit: 'V' },
                { id: 'MEM', groupId: 'g1', hostType: 'stageGate', hostId: 'G1' }];
    ok(RD.kpiName(ks[1], ks) === 'Cell voltage', "a linked target shows the metric it inherits from");

    ks[1].localName = 'Voltage at this gate';
    ok(RD.kpiName(ks[1], ks) === 'Voltage at this gate', "…and its own label once given one");
    ok(ks[0].name === 'Cell voltage', "…without touching the definer's name");
    /* The label is the ONLY thing that stops at this row. Everything else still resolves through the
       link, or a renamed target would quietly become a different metric. */
    ok(RD.kpiUnit(ks[1], ks) === 'V', "…still inheriting the unit");
    ok(RD.effTarget(ks[1], ks) === 0.7, "…and the target");
    ok(RD.kpiDirection(ks[1], ks) === 'up', "…and the direction");
    ok(RD.kpiSourceName(ks[1], ks) === 'Cell voltage',
      "the inherited name stays readable, so a renamed row can still say what it links to");

    ks[1].localName = '';
    ok(RD.kpiName(ks[1], ks) === 'Cell voltage', "an empty label falls back to the inherited name");
    ks[1].localName = '   ';
    ok(RD.kpiName(ks[1], ks) === 'Cell voltage', "…and so does whitespace");

    // a definer is unaffected
    ok(RD.kpiName(ks[0], ks) === 'Cell voltage', "a definer still reads its own name");
  } catch (e) { ok(false, 'engine block threw: ' + (e && e.message)); }
})();

const boot = (file) => {
  const vc = new VirtualConsole(); const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/' + file, 'utf8'), {
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
const SEED = (kind) => `persist=function(){};
  portfolio={units:[],divisions:[{id:"D",name:"D",kind:"${kind}"}],products:[],models:[],
    initiatives:[{id:"I",name:"I",divisionId:"D"}],
    objectives:[{id:"O1",statement:"O",divisionId:"D",initiativeId:"I",quarter:"2026Q2",plannedStart:2200,plannedEnd:2600}],
    kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
  exec.stageGateSets=[{id:"S1",objectiveId:"O1",name:"W",order:0}];
  exec.stageGates=[{id:"G1",objectiveId:"O1",setId:"S1",name:"Gate",plannedDate:2400,order:0}];
  exec.keyResults=[{id:"KR1",objectiveId:"O1",statement:"KR",trackingType:"kpi"}];
  exec.kpis=[{id:"DEF",objectiveId:"O1",hostType:"keyResult",hostId:"KR1",name:"Cell voltage",
              groupId:"g1",isDefiner:true,direction:"up",target:0.7,unit:"V"},
             {id:"MEM",objectiveId:"O1",hostType:"stageGate",hostId:"G1",groupId:"g1"}];
  divisionId="D"; selectedObj="O1"; renderAll();`;

setTimeout(() => {
  // ---------- renaming in the app ----------
  (function () {
    const { dom, errs } = boot('execution_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED('rd') + ' subOpenEdit("kpi","MEM");');
      const mb = () => d.getElementById('modalBody');
      const nm = mb().querySelector('[data-f="name"]');
      ok(!!nm, "a linked target's editor offers a name field");
      ok(nm.placeholder === 'Cell voltage',
        "…showing the inherited name as the placeholder, so blank plainly means inherit");
      ok(nm.value === '', "…and starting empty, since nothing local is set yet");

      nm.value = 'Voltage at this gate'; nm.dispatchEvent(new w.Event('input', { bubbles: true }));
      w.eval('saveSub();');

      ok(w.eval('exec.kpis.find(k=>k.id==="MEM").localName') === 'Voltage at this gate',
        "saving stores the label on the member");
      /* The whole point: the source metric is untouched. */
      ok(w.eval('exec.kpis.find(k=>k.id==="DEF").name') === 'Cell voltage',
        "…and does NOT rename the linked metric");
      ok(w.eval('exec.kpis.find(k=>k.id==="MEM").name') === undefined,
        "…nor write a plain name onto the member, which would be followed up the link");
      ok(w.eval('RD.kpiName(exec.kpis.find(k=>k.id==="MEM"), allKpisPool())') === 'Voltage at this gate',
        "the gate's row shows the new wording");
      ok(w.eval('RD.effTarget(exec.kpis.find(k=>k.id==="MEM"), allKpisPool())') === 0.7,
        "…while still inheriting the target");

      // the row must still say what it links to, or a rename hides the connection
      const tbl = w.eval('kpiTable("stageGate","G1","O1")');
      ok(/Voltage at this gate/.test(tbl), "the target table shows the local name");
      /* "Cell voltage" appears elsewhere in the table (the inherits-from tooltip), so match the BADGE
         itself — otherwise dropping the source from it passes. */
      ok(/linkbadge[^>]*>linked \u00b7 Cell voltage</.test(tbl),
        "…and names the source on the badge, so a renamed target does not hide what it links to");

      // clearing reverts
      w.eval('subOpenEdit("kpi","MEM");');
      const nm2 = mb().querySelector('[data-f="name"]');
      ok(nm2.value === 'Voltage at this gate', "reopening shows the label that was set");
      nm2.value = ''; nm2.dispatchEvent(new w.Event('input', { bubbles: true }));
      w.eval('saveSub();');
      ok(w.eval('exec.kpis.find(k=>k.id==="MEM").localName') === undefined,
        "clearing it removes the label rather than storing an empty one");
      ok(w.eval('RD.kpiName(exec.kpis.find(k=>k.id==="MEM"), allKpisPool())') === 'Cell voltage',
        "…and the row goes back to the inherited name");

      // typing the inherited name is not a local label
      w.eval('subOpenEdit("kpi","MEM");');
      const nm3 = mb().querySelector('[data-f="name"]');
      nm3.value = 'Cell voltage'; nm3.dispatchEvent(new w.Event('input', { bubbles: true }));
      w.eval('saveSub();');
      ok(w.eval('exec.kpis.find(k=>k.id==="MEM").localName') === undefined,
        "typing the inherited name stores nothing — it is not an override of anything");

      ok(errs.length === 0, "no errors" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'rename flow threw: ' + (e && e.message)); }
  })();

  // ---------- the sales app ----------
  (function () {
    const { dom, errs } = boot('sales_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED('sales') + ' subOpenEdit("kpi","MEM");');
      const nm = d.getElementById('modalBody').querySelector('[data-f="name"]');
      ok(!!nm, "the sales app offers the name field too");
      nm.value = 'Voltage here'; nm.dispatchEvent(new w.Event('input', { bubbles: true }));
      w.eval('saveSub();');
      ok(w.eval('exec.kpis.find(k=>k.id==="MEM").localName') === 'Voltage here', "…and stores it locally");
      ok(w.eval('exec.kpis.find(k=>k.id==="DEF").name') === 'Cell voltage', "…leaving the source alone");
      ok(errs.length === 0, "no errors in sales" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'sales flow threw: ' + (e && e.message)); }
  })();

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} linked-rename assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1600);
