// Deleting a workstream asks what becomes of its stage-gates, and that question IS the confirmation.
//
// It replaces an armed two-click that confirmed nothing useful and then silently MOVED the gates to
// whichever other workstream happened to be first — a decision the user never made and could not see.
// Losing a gate is not recoverable from the UI, so the destructive option is never the default and the
// counts are stated before anything happens.
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
  exec.stageGateSets=[{id:"S1",objectiveId:"O1",name:"Durability",order:0},
                      {id:"S2",objectiveId:"O1",name:"Pilot",order:1}];
  exec.stageGates=[{id:"G1",objectiveId:"O1",setId:"S1",name:"a",plannedDate:2400,order:0},
                   {id:"G2",objectiveId:"O1",setId:"S1",name:"b",plannedDate:2410,order:1},
                   {id:"G3",objectiveId:"O1",setId:"S2",name:"c",plannedDate:2420,order:2}];
  exec.kpis=[{id:"K1",objectiveId:"O1",hostType:"stageGate",hostId:"G1",name:"yield",target:90}];
  exec.stageGateEdges=[{from:"G1",to:"G2"}];
  divisionId="D"; selectedObj="O1"; renderAll();`;

setTimeout(() => {
  const run = (file, kind, body) => {
    const { dom, errs } = boot(file);
    const w = dom.window, d = w.document;
    try { body(w, d, errs); } catch (e) { ok(false, 'flow threw: ' + (e && e.message)); }
  };

  // ---------- the modal itself ----------
  run('execution_app.html', 'rd', (w, d, errs) => {
    w.eval(SEED('rd') + ' wsDeleteModal("S1");');
    const mb = () => d.getElementById('modalBody');
    ok(!!mb(), "clicking delete opens a modal rather than arming a second click");
    ok(/Durability/.test(mb().textContent), "…naming the workstream");
    ok(/2 stage-gates/.test(mb().textContent), "…and how many gates it holds, before anything happens");

    const opts = [...mb().querySelectorAll('input[name=wsdisp]')].map(r => r.value);
    ok(opts.join(',') === 'move,delete', "…offering move or delete (" + opts.join(',') + ")");
    /* Losing a gate is not recoverable from the UI, so the destructive choice is never pre-selected. */
    ok((mb().querySelector('input[name=wsdisp]:checked') || {}).value === 'move',
      "…with the NON-destructive option selected by default");
    ok(!!mb().querySelector('[data-wsdto]'), "…and a choice of where to move them");
    ok(/cannot be undone/.test(mb().textContent), "…saying plainly that deleting cannot be undone");
    ok(!!mb().querySelector('[data-wsdcancel]'), "…with a way out");
    ok(errs.length === 0, "no errors opening it" + (errs[0] ? ': ' + errs[0].slice(0, 70) : ''));
  });

  // ---------- move ----------
  run('execution_app.html', 'rd', (w, d) => {
    w.eval(SEED('rd') + ' wsDeleteModal("S1");');
    const mb = d.getElementById('modalBody');
    mb.querySelector('[data-wsdgo]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('exec.stageGateSets.length') === 1, "moving deletes the workstream");
    ok(w.eval('exec.stageGates.length') === 3, "…and keeps every gate");
    ok(w.eval('exec.stageGates.filter(g=>g.setId==="S2").length') === 3, "…re-homed to the chosen workstream");
    ok(w.eval('exec.kpis.length') === 1, "…with their KPIs intact");
  });

  // ---------- delete ----------
  run('execution_app.html', 'rd', (w, d) => {
    w.eval(SEED('rd') + ' wsDeleteModal("S1");');
    const mb = d.getElementById('modalBody');
    [...mb.querySelectorAll('input[name=wsdisp]')].find(r => r.value === 'delete').checked = true;
    mb.querySelector('[data-wsdgo]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('exec.stageGateSets.length') === 1, "choosing delete removes the workstream");
    ok(w.eval('exec.stageGates.length') === 1, "…and its gates (" + w.eval('exec.stageGates.length') + " left)");
    ok(w.eval('exec.stageGates[0].id') === 'G3', "…leaving the other workstream's gate alone");
    /* A deleted gate takes its hosted KPIs with it, or they point at a gate the plan no longer has. */
    ok(w.eval('exec.kpis.filter(k=>k.hostType==="stageGate"&&k.hostId==="G1").length') === 0,
      "…and the deleted gates' KPIs go with them rather than dangling");
    ok(w.eval('(exec.stageGateEdges||[]).length') === 0, "…as do chain edges that referenced them");
  });

  // ---------- an empty workstream ----------
  run('execution_app.html', 'rd', (w, d) => {
    w.eval(SEED('rd') + ' exec.stageGates=exec.stageGates.filter(g=>g.setId!=="S1"); renderAll(); wsDeleteModal("S1");');
    const mb = d.getElementById('modalBody');
    /* With no gates there is no question to ask, so the modal is a plain confirmation. */
    ok(mb.querySelectorAll('input[name=wsdisp]').length === 0, "an empty workstream asks no disposition question");
    ok(/no stage-gates/.test(mb.textContent), "…saying why");
    mb.querySelector('[data-wsdgo]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('exec.stageGateSets.length') === 1, "…and deletes on confirm");
  });

  // ---------- the only workstream ----------
  run('execution_app.html', 'rd', (w, d) => {
    w.eval(`persist=function(){};
      portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],
        initiatives:[{id:"I",name:"I",divisionId:"D"}],
        objectives:[{id:"O1",statement:"O",divisionId:"D",initiativeId:"I",quarter:"2026Q2",plannedStart:2200,plannedEnd:2600}],
        kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
      exec.stageGateSets=[{id:"S1",objectiveId:"O1",name:"Only one",order:0}];
      exec.stageGates=[{id:"G1",objectiveId:"O1",setId:"S1",name:"a",plannedDate:2400,order:0}];
      divisionId="D"; selectedObj="O1"; renderAll(); wsDeleteModal("S1");`);
    const mb = () => d.getElementById('modalBody');
    const opts = [...mb().querySelectorAll('input[name=wsdisp]')].map(r => r.value);
    /* There is nowhere to move to, so the only non-destructive answer is to stop — but deleting is still
       offered. The old code simply refused, leaving no way to remove the last workstream at all. */
    ok(opts.join(',') === 'cancel,delete', "the only workstream offers keep-everything or delete (" + opts.join(',') + ")");
    ok((mb().querySelector('input[name=wsdisp]:checked') || {}).value === 'cancel', "…defaulting to keeping it");
    mb().querySelector('[data-wsdgo]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('exec.stageGateSets.length') === 1 && w.eval('exec.stageGates.length') === 1,
      "…and keep-everything changes nothing");

    w.eval('wsDeleteModal("S1");');
    [...mb().querySelectorAll('input[name=wsdisp]')].find(r => r.value === 'delete').checked = true;
    mb().querySelector('[data-wsdgo]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('exec.stageGateSets.length') === 0 && w.eval('exec.stageGates.length') === 0,
      "…while an explicit delete removes it and its gate");
  });

  // ---------- cancel ----------
  run('execution_app.html', 'rd', (w, d) => {
    w.eval(SEED('rd') + ' wsDeleteModal("S1");');
    d.getElementById('modalBody').querySelector('[data-wsdcancel]')
      .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('exec.stageGateSets.length') === 2 && w.eval('exec.stageGates.length') === 3,
      "cancelling changes nothing at all");
  });

  // ---------- the sales app ----------
  run('sales_app.html', 'sales', (w, d, errs) => {
    w.eval(SEED('sales') + ' wsDeleteModal("S1");');
    const mb = d.getElementById('modalBody');
    ok(!!mb && mb.querySelectorAll('input[name=wsdisp]').length === 2, "the sales app asks the same question");
    ok((mb.querySelector('input[name=wsdisp]:checked') || {}).value === 'move', "…with the same safe default");
    [...mb.querySelectorAll('input[name=wsdisp]')].find(r => r.value === 'delete').checked = true;
    mb.querySelector('[data-wsdgo]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('exec.stageGates.length') === 1, "…and deletes the gates when asked to");
    ok(errs.length === 0, "no errors in sales" + (errs[0] ? ': ' + errs[0].slice(0, 70) : ''));

    const salesSrc = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/sales_app.html', 'utf8');
    ok(/function wsDeleteModal\(/.test(salesSrc), "…using the same modal");
    ok(!/armed=true; dl\.textContent="Confirm delete"/.test(salesSrc),
      "…with the old armed two-click gone, not left beside it");
  });

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} workstream-delete assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1600);
