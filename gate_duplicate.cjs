// Duplicating a stage-gate, within its workstream or into another in the same objective.
//
// The split that matters: a duplicate copies the DEFINITION and leaves behind everything that records
// what happened. Name, intention, planned date and the KPIs hosted on the gate come across, so the copy
// is measurable from the moment it exists. Actual date, status, the gate id and the readings taken
// against the original do not — carrying those would assert the copy had already been passed and
// measured.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

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
  exec.stageGateSets=[{id:"S1",objectiveId:"O1",name:"Durability",order:0}];
  exec.stageGates=[{id:"G1",objectiveId:"O1",setId:"S1",name:"500 h AST",intention:"prove durability",
    plannedDate:2400,actualDate:2390,status:"hit",gate_id:"AST-500",order:0}];
  exec.kpis=[{id:"K1",objectiveId:"O1",hostType:"stageGate",hostId:"G1",name:"decay",direction:"down",target:10,current:8}];
  exec.kpiUpdates=[{id:"u1",kpiId:"K1",value:8,timestamp:1}];
  divisionId="D"; selectedObj="O1"; renderAll();`;

setTimeout(() => {
  // ---------- within a workstream ----------
  (function () {
    const { dom, errs } = boot('execution_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED('rd'));
      /* Duplicate moved OFF the row and into the editor: a row button fires on a record you may not have
         open, and the row was already carrying several controls. */
      ok(!/Duplicate/.test(d.getElementById('subSG').textContent), "the gate row no longer carries Duplicate");
      w.eval('subOpenEdit("stageGate","G1");');
      const gmb = () => d.getElementById('modalBody');
      ok(!!gmb().querySelector('[data-gatedup]'), "…the gate's edit modal does");
      gmb().querySelector('[data-gatedup]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const gs = JSON.parse(w.eval('JSON.stringify(exec.stageGates)'));
      ok(gs.length === 2, "duplicating adds a gate");
      const copy = gs.find(g => g.id !== 'G1');
      ok(copy.id !== 'G1', "…with its own id");
      ok(copy.setId === 'S1', "…in the same workstream when there is only one");

      // what copies
      ok(/500 h AST/.test(copy.name) && /copy/i.test(copy.name), "the name comes across, marked as a copy (" + copy.name + ")");
      ok(copy.intention === 'prove durability', "…and the intention");
      ok(copy.plannedDate === 2400, "…and the planned date");

      // what does not
      /* A duplicate is work still to do. Carrying the outcome over would assert it had already happened. */
      ok(copy.actualDate == null, "the actual date does NOT come across");
      ok(copy.status === 'pending', "…and the status resets to pending (" + copy.status + ")");
      /* A gate id identifies ONE gate, so the copy must not claim the original's. The copy object is
         built field by field rather than cloned, so it simply never has one — no clearing step needed,
         and this assertion guards the day someone "helpfully" switches to Object.assign. */
      ok(!copy.gate_id, "…and the copy does not claim the original's gate id");

      // KPIs: the definition, not the measurement
      const ks = JSON.parse(w.eval('JSON.stringify(exec.kpis)'));
      ok(ks.length === 2, "the gate's KPIs are copied, so the duplicate is measurable at once");
      const nk = ks.find(k => k.hostId === copy.id);
      ok(!!nk && nk.id !== 'K1', "…each as a new KPI, not the same row re-hosted");
      ok(nk.target === 10 && nk.direction === 'down', "…keeping the target definition");
      ok(nk.current == null, "…but NOT the measured value, which belongs to the gate it was measured on");
      ok(w.eval('(exec.kpiUpdates||[]).length') === 1, "…and no readings are copied");
      ok(w.eval('(exec.kpiUpdates||[])[0].kpiId') === 'K1', "…the original's readings staying its own");

      // the original is untouched
      const orig = gs.find(g => g.id === 'G1');
      ok(orig.actualDate === 2390 && orig.status === 'hit' && orig.gate_id === 'AST-500',
        "the original gate is unchanged");
      ok(errs.length === 0, "no errors" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'within-workstream flow threw: ' + (e && e.message)); }
  })();

  // ---------- between workstreams ----------
  (function () {
    const { dom, errs } = boot('execution_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED('rd') + ' exec.stageGateSets.push({id:"S2",objectiveId:"O1",name:"Pilot",order:1}); renderAll();');
      w.eval('sgDuplicate("G1");');
      const mb = () => d.getElementById('modalBody');
      /* With one workstream the destination is not a choice, so it duplicates in place. With more than
         one it is, so it asks rather than guessing. */
      ok(!!mb() && !!mb().querySelector('[data-sgdupset]'),
        "with more than one workstream it asks where the copy goes");
      const opts = [...mb().querySelectorAll('[data-sgdupset] option')].map(o => o.value);
      ok(opts.length === 2, "…offering every workstream in the objective (" + opts.join(',') + ")");
      ok(mb().querySelector('[data-sgdupset]').value === 'S1', "…defaulting to the gate's own");

      const sel = mb().querySelector('[data-sgdupset]'); sel.value = 'S2';
      mb().querySelector('[data-sgdupgo]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(w.eval('exec.stageGates.filter(g=>g.setId==="S2").length') === 1, "choosing another puts the copy there");
      ok(w.eval('exec.stageGates.filter(g=>g.setId==="S1").length') === 1, "…and leaves the original where it was");
      ok(w.eval('exec.stageGates.every(g=>g.objectiveId==="O1")'), "…still inside the same objective");

      // cancelling writes nothing
      const before = w.eval('exec.stageGates.length');
      w.eval('sgDuplicate("G1");');
      mb().querySelector('[data-sgdupcancel]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(w.eval('exec.stageGates.length') === before, "cancelling the dialog duplicates nothing");
      ok(errs.length === 0, "no errors" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'cross-workstream flow threw: ' + (e && e.message)); }
  })();

  // ---------- duplicating a key result ----------
  (function () {
    const { dom, errs } = boot('execution_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(`persist=function(){};
        portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],
          initiatives:[{id:"I",name:"I",divisionId:"D"}],
          objectives:[{id:"O1",statement:"O",divisionId:"D",initiativeId:"I",quarter:"2026Q2",plannedStart:2200,plannedEnd:2600}],
          kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
        exec.keyResults=[{id:"KR1",objectiveId:"O1",statement:"Durability",trackingType:"kpi",progress:70,
          subKrs:[{id:"s1",statement:"part",weight:100,trackingType:"percentage",progress:40}]}];
        exec.kpis=[{id:"K1",objectiveId:"O1",hostType:"keyResult",hostId:"KR1",name:"decay",target:10,current:8}];
        exec.kpiUpdates=[{id:"u1",kpiId:"K1",value:8,timestamp:1}];
        divisionId="D"; selectedObj="O1"; renderAll(); subOpenEdit("keyResult","KR1");`);
      const mb = () => d.getElementById('modalBody');
      ok(!!mb().querySelector('[data-krdup]'), "the KR edit modal offers Duplicate");

      mb().querySelector('[data-krdup]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const krs = JSON.parse(w.eval('JSON.stringify(exec.keyResults)'));
      ok(krs.length === 2, "duplicating adds a key result");
      const copy = krs.find(k => k.id !== 'KR1');
      ok(/copy/i.test(copy.statement), "…marked as a copy (" + copy.statement + ")");
      ok(copy.trackingType === 'kpi', "…keeping how it is tracked");
      /* A copy is work still to do: carrying 70% across would assert progress nobody has made. */
      ok(copy.progress === 0, "…with progress reset, not inherited (" + copy.progress + ")");
      ok((copy.subKrs || []).length === 1, "…sub-results copied structurally");
      ok(copy.subKrs[0].progress === 0, "…with their progress reset too");

      const kpis = JSON.parse(w.eval('JSON.stringify(exec.kpis)'));
      ok(kpis.length === 2, "its KPIs are copied, so the duplicate is measurable at once");
      const nk = kpis.find(k => k.hostId === copy.id);
      ok(!!nk && nk.id !== 'K1', "…as new KPIs rather than the same rows re-hosted");
      ok(nk.target === 10, "…keeping the target");
      ok(nk.current == null, "…but not the measured value");
      ok(w.eval('exec.kpiUpdates.length') === 1, "…and no readings follow");
      ok(w.eval('exec.keyResults.find(k=>k.id==="KR1").progress') === 70, "the original is unchanged");
      ok(errs.length === 0, "no errors" + (errs[0] ? ': ' + errs[0].slice(0, 70) : ''));

      // a NEW key result has nothing to duplicate
      w.eval('subCancel(); subOpenAdd("keyResult");');
      ok(!mb().querySelector('[data-krdup]'), "a key result being created offers no Duplicate");
    } catch (e) { ok(false, 'KR duplicate flow threw: ' + (e && e.message)); }
  })();

  // ---------- the sales app ----------
  (function () {
    const { dom, errs } = boot('sales_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED('sales'));
      w.eval('subOpenEdit("stageGate","G1");');
      ok(!!d.getElementById('modalBody').querySelector('[data-gatedup]'),
        "the sales app's gate modal offers Duplicate too");
      d.getElementById('modalBody').querySelector('[data-gatedup]')
        .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const gs = JSON.parse(w.eval('JSON.stringify(exec.stageGates)'));
      ok(gs.length === 2, "…and duplicates");
      const copy = gs.find(g => g.id !== 'G1');
      ok(copy.status === 'pending' && copy.actualDate == null, "…resetting the outcome the same way");
      ok(errs.length === 0, "no errors in sales" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));

      const salesSrc = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/sales_app.html', 'utf8');
      ok(/function sgDuplicate\(/.test(salesSrc), "…using the same function");
      ok(/actualDate:null, status:"pending"/.test(salesSrc), "…with the same outcome reset");
      ok(/delete nk\.current;/.test(salesSrc), "…and the same measured-value drop");
      ok(/function krDuplicate\(/.test(salesSrc), "…and can duplicate a key result as well");
      ok(/data-krdup=/.test(salesSrc), "…from its edit modal");
    } catch (e) { ok(false, 'sales flow threw: ' + (e && e.message)); }
  })();

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} gate-duplicate assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1600);
