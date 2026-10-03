// Editing a stage-gate and adding a KPI in the same sitting.
//
// Saving a target calls renderAll(), which rebuilds the sub-editor from the STORED record. Anything
// typed into the gate's own fields and not yet saved was therefore reverted on screen, and the Save that
// followed wrote the old values back: the KPI landed, the gate's edits vanished. Silent, and the user
// had no reason to suspect it — the field simply showed what it used to say.
//
// The open editor's live values are now captured before the re-render and replayed after.
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
  exec.stageGateSets=[{id:"S1",objectiveId:"O1",name:"W",order:0}];
  exec.stageGates=[{id:"G1",objectiveId:"O1",setId:"S1",name:"Original name",intention:"old intent",
                    plannedDate:2400,order:0}];
  divisionId="D"; selectedObj="O1"; renderAll();`;

setTimeout(() => {
  // ---------- editing an existing gate ----------
  (function () {
    const { dom, errs } = boot('execution_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED('rd') + ' subOpenEdit("stageGate","G1");');
      const mb = () => d.getElementById('modalBody');
      const f = (k) => mb().querySelector('[data-f="' + k + '"]');
      ok(!!f('name'), "the gate editor opens");
      ok(f('name').value === 'Original name', "…showing the stored name");

      f('name').value = 'CHANGED NAME';
      if (f('intention')) f('intention').value = 'new intent';

      // add a KPI target without leaving the editor
      w.eval('openTgtModal("G1", null);');
      const tb = d.getElementById('kpiTgtBody');
      ok(!!tb, "a target can be added from inside the editor");
      tb.querySelector('[data-tf="name"]').value = 'Yield';
      const tt = tb.querySelector('[data-tf="target"]'); if (tt) tt.value = '90';
      w.eval('saveTgtModal();');

      ok(w.eval('(exec.kpis||[]).filter(k=>k.hostType==="stageGate").length') === 1, "the KPI is saved");
      /* The symptom the user saw: the field reverted to the stored value. */
      ok(f('name') && f('name').value === 'CHANGED NAME',
        "…and the gate's typed name SURVIVES the re-render (" + (f('name') || {}).value + ")");
      ok(!f('intention') || f('intention').value === 'new intent', "…along with the other fields");

      w.eval('saveSub();');
      ok(w.eval('exec.stageGates[0].name') === 'CHANGED NAME',
        "saving then stores the edit, not the value it had before");
      ok(w.eval('exec.stageGates[0].intention') === 'new intent', "…and every other changed field");
      ok(w.eval('(exec.kpis||[]).length') === 1, "…with the KPI still there, so neither change is lost");
      ok(errs.length === 0, "no errors" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'edit flow threw: ' + (e && e.message)); }
  })();

  // ---------- adding a gate, with a pending target ----------
  (function () {
    const { dom, errs } = boot('execution_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED('rd') + ' exec.stageGates=[]; renderAll(); pendingGateSet="S1"; subOpenAdd("stageGate");');
      const mb = () => d.getElementById('modalBody');
      const f = (k) => mb().querySelector('[data-f="' + k + '"]');
      f('name').value = 'Brand new gate';
      if (f('plannedDate')) f('plannedDate').value = '2026-08-01';

      /* While ADDING, the target is stashed and becomes a KPI once the gate exists — a different path
         through the same save, so it needs its own check. */
      w.eval('openTgtModal(null, null);');
      const tb = d.getElementById('kpiTgtBody');
      tb.querySelector('[data-tf="name"]').value = 'Yield';
      const tt = tb.querySelector('[data-tf="target"]'); if (tt) tt.value = '90';
      w.eval('saveTgtModal();');

      ok(f('name') && f('name').value === 'Brand new gate', "a NEW gate's typed name survives the same way");
      w.eval('saveSub();');
      ok(w.eval('(exec.stageGates||[]).length') === 1, "the gate is created");
      ok(w.eval('exec.stageGates[0].name') === 'Brand new gate', "…with the name that was typed");
      ok(w.eval('(exec.kpis||[]).length') === 1, "…and the pending target became its KPI");
      ok(errs.length === 0, "no errors" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'add flow threw: ' + (e && e.message)); }
  })();

  // ---------- the KR modal keeps its own draft ----------
  (function () {
    const { dom, errs } = boot('execution_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(`persist=function(){};
        portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],
          initiatives:[{id:"I",name:"I",divisionId:"D"}],
          objectives:[{id:"O1",statement:"O",divisionId:"D",initiativeId:"I",quarter:"2026Q2",plannedStart:2200,plannedEnd:2600}],
          kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
        exec.keyResults=[{id:"KR1",objectiveId:"O1",statement:"Original KR",trackingType:"kpi"}];
        exec.kpis=[{id:"K1",objectiveId:"O1",hostType:"keyResult",hostId:"KR1",name:"first",
                    targetType:"demonstration",direction:"up",target:10}];
        divisionId="D"; selectedObj="O1"; renderAll(); subOpenEdit("keyResult","KR1");`);
      const mb = () => d.getElementById('modalBody');
      const st = mb().querySelector('[data-f="statement"]');
      st.value = 'CHANGED KR'; st.dispatchEvent(new w.Event('input', { bubbles: true }));

      mb().querySelector('[data-krkadd]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const nm = mb().querySelector('[data-kf="name"][data-ki="1"]');
      nm.value = 'second'; nm.dispatchEvent(new w.Event('input', { bubbles: true }));
      const tg = mb().querySelector('[data-kf="kpiTarget"][data-ki="1"]');
      tg.value = '20'; tg.dispatchEvent(new w.Event('input', { bubbles: true }));

      /* The KR modal holds its own in-memory draft, so adding a KPI there never discarded typing — this
         guards it staying that way if the KPI list is ever reworked to re-render from the record. */
      ok(mb().querySelector('[data-f="statement"]').value === 'CHANGED KR',
        "the KR statement survives adding a KPI in its modal");
      mb().querySelector('[data-krsave]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(w.eval('exec.keyResults[0].statement') === 'CHANGED KR', "…and is stored on save");
      const names = JSON.parse(w.eval('JSON.stringify(exec.kpis.filter(k=>k.hostId==="KR1").map(k=>k.name))'));
      ok(names.length === 2, "…with both KPIs (" + names.join(', ') + ")");
      ok(errs.length === 0, "no errors" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'KR flow threw: ' + (e && e.message)); }
  })();

  // ---------- the sales app ----------
  (function () {
    const { dom, errs } = boot('sales_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED('sales') + ' subOpenEdit("stageGate","G1");');
      const mb = () => d.getElementById('modalBody');
      const f = (k) => mb().querySelector('[data-f="' + k + '"]');
      f('name').value = 'CHANGED NAME';
      w.eval('openTgtModal("G1", null);');
      const tb = d.getElementById('kpiTgtBody');
      tb.querySelector('[data-tf="name"]').value = 'Yield';
      const tt = tb.querySelector('[data-tf="target"]'); if (tt) tt.value = '90';
      w.eval('saveTgtModal();');
      ok(f('name') && f('name').value === 'CHANGED NAME', "the sales app keeps the edit too");
      w.eval('saveSub();');
      ok(w.eval('exec.stageGates[0].name') === 'CHANGED NAME', "…and stores it");
      ok(errs.length === 0, "no errors in sales" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));

      const salesSrc = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/sales_app.html', 'utf8');
      ok(/captureSubEdits\(\);\s*\n\s*closeTgtModal\(\); renderAll\(\); applySubEdits\(\);/.test(salesSrc),
        "…using the same capture-and-replay around the re-render");
    } catch (e) { ok(false, 'sales flow threw: ' + (e && e.message)); }
  })();

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} editor-edit-survives assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1600);
