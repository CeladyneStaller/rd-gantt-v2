// Several KPIs on one key result, created from the +KR modal.
//
// The store has always allowed it — a KPI is exec.kpis with hostType "keyResult" — and keyResultScore
// already means over all of them via meanScorable. Only the modal assumed one, keeping a flat set of
// kpiType/kpiTarget/kpiUnit fields and writing through krPrimaryKpi, which takes the first match.
//
// The draft now holds a LIST, and saving updates existing KPIs in place rather than re-creating them:
// a new id would orphan every reading already recorded against the old one.
const RD = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
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
const SEED = `persist=function(){};
  portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],
    initiatives:[{id:"I",name:"I",divisionId:"D"}],
    objectives:[{id:"O1",statement:"O",divisionId:"D",initiativeId:"I",quarter:"2026Q2",plannedStart:2200,plannedEnd:2600}],
    kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
  divisionId="D"; selectedObj="O1"; renderAll();`;

// ---------- the scoring rule this rests on ----------
(function () {
  /* A KPI-tracked KR scores as the MEAN of all its KPIs — not its first one. Two KPIs at 100 and 50
     score 75; under a primary-only rule it would read 100 and hide the second entirely. */
  const docs = { D: { keyResults: [{ id: 'KR1', objectiveId: 'O1', trackingType: 'kpi' }],
    kpis: [{ id: 'K1', hostType: 'keyResult', hostId: 'KR1', direction: 'up', target: 100, baseline: 0 },
           { id: 'K2', hostType: 'keyResult', hostId: 'KR1', direction: 'up', target: 100, baseline: 0 }],
    kpiUpdates: [{ id: 'u1', kpiId: 'K1', value: 100, timestamp: 1 }, { id: 'u2', kpiId: 'K2', value: 50, timestamp: 1 }],
    objectiveState: [], stageGates: [], tasks: [], boards: [], stageGateSets: [], stageGateEdges: [],
    chainGatesByDate: {}, risks: [], catchupPlans: [], etbTrees: {} } };
  ok(RD.keyResultScore('KR1', docs) === 75,
    "a KPI-tracked KR scores as the mean of ALL its KPIs (" + RD.keyResultScore('KR1', docs) + ", not 100)");
  const one = JSON.parse(JSON.stringify(docs));
  one.D.kpis = [one.D.kpis[0]]; one.D.kpiUpdates = [one.D.kpiUpdates[0]];
  ok(RD.keyResultScore('KR1', one) === 100, "…and a KR with one KPI still scores as that KPI");
})();

setTimeout(() => {
  // ---------- creating several ----------
  (function () {
    const { dom, errs } = boot('execution_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED + ' subOpenAdd("keyResult");');
      const mb = () => d.getElementById('modalBody');
      ok(!!mb(), "the +KR modal opens");

      const tsel = mb().querySelector('[data-krtype]');
      tsel.value = 'kpi'; tsel.dispatchEvent(new w.Event('change', { bubbles: true }));
      ok(mb().querySelectorAll('.krk-row').length === 1, "KPI tracking starts with one KPI row");
      ok(!!mb().querySelector('[data-krkadd]'), "…and an Add KPI control");
      ok(/mean of all its KPIs/.test(mb().textContent), "…saying how the KR will score");

      const set = (sel, v) => { const el = mb().querySelector(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
      set('[data-f="statement"]', 'Durability demonstrated');
      set('[data-kf="name"]', 'Voltage decay');
      set('[data-kf="kpiTarget"]', '10');

      mb().querySelector('[data-krkadd]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(mb().querySelectorAll('.krk-row').length === 2, "Add KPI adds a row");
      ok(mb().querySelectorAll('[data-kf="name"]').length === 1,
        "…with only the row being edited expanded, so three KPIs are three lines not three forms");
      set('[data-kf="name"][data-ki="1"]', 'ECSA retention');
      set('[data-kf="kpiTarget"][data-ki="1"]', '80');

      mb().querySelector('[data-krsave]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const names = JSON.parse(w.eval('JSON.stringify(exec.kpis.filter(k=>k.hostType==="keyResult").map(k=>k.name))'));
      ok(names.length === 2, "saving writes BOTH KPIs (" + names.join(', ') + ")");
      ok(names.indexOf('Voltage decay') >= 0 && names.indexOf('ECSA retention') >= 0, "…each with the name given");
      const targets = JSON.parse(w.eval('JSON.stringify(exec.kpis.filter(k=>k.hostType==="keyResult").map(k=>k.target))'));
      ok(targets.indexOf(10) >= 0 && targets.indexOf(80) >= 0, "…and its own target");
      ok(w.eval('exec.kpis.every(k=>k.hostId===exec.keyResults[0].id)'), "…both hosted on the new key result");
      /* Rewriting the modal body is easy to do destructively: my first pass dropped the Milestone steps
         tracking type entirely, and only another harness caught it. Check every type is still offered. */
      w.eval('subOpenAdd("keyResult");');
      const types = [...mb().querySelectorAll('[data-krtype] option')].map(o => o.value).sort().join(',');
      /* Sub-key results is deliberately NOT offered for a new KR: its KPIs are embedded in the parent
         record rather than rows in exec.kpis, so they take no readings and never appear in the KR's KPI
         section. Everything else must survive the rewrite. */
      ok(types === 'kpi,milestone,percentage',
        "a new KR offers percentage, KPI and milestone tracking (" + types + ")");
      ok(types.indexOf('subkr') < 0, "…and not sub-key results, whose KPIs cannot take readings");

      ok(errs.length === 0, "no errors creating them" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'create flow threw: ' + (e && e.message)); }
  })();

  // ---------- reopening, editing and removing ----------
  (function () {
    const { dom, errs } = boot('execution_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(`persist=function(){};
        portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],
          initiatives:[{id:"I",name:"I",divisionId:"D"}],
          objectives:[{id:"O1",statement:"O",divisionId:"D",initiativeId:"I",quarter:"2026Q2",plannedStart:2200,plannedEnd:2600}],
          kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
        exec.keyResults=[{id:"KR1",objectiveId:"O1",statement:"Durability",trackingType:"kpi"}];
        exec.kpis=[{id:"K1",objectiveId:"O1",hostType:"keyResult",hostId:"KR1",name:"Decay",direction:"down",target:10,targetType:"demonstration"},
                   {id:"K2",objectiveId:"O1",hostType:"keyResult",hostId:"KR1",name:"ECSA",direction:"up",target:80,targetType:"demonstration"}];
        exec.kpiUpdates=[{id:"u1",kpiId:"K1",value:8,timestamp:1},{id:"u2",kpiId:"K2",value:40,timestamp:1}];
        divisionId="D"; selectedObj="O1"; renderAll(); subOpenEdit("keyResult","KR1");`);
      const mb = () => d.getElementById('modalBody');
      ok(mb().querySelectorAll('.krk-row').length === 2, "reopening a KR lists every KPI it already has");

      mb().querySelector('[data-krkdel="1"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(mb().querySelectorAll('.krk-row').length === 1, "a KPI can be removed in the modal");
      mb().querySelector('[data-krsave]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

      ok(w.eval('exec.kpis.filter(k=>k.hostId==="KR1").length') === 1, "…and saving drops it");
      /* Updated in place, not re-created: a new id would orphan every reading taken against the old one. */
      ok(w.eval('exec.kpis.filter(k=>k.hostId==="KR1")[0].id') === 'K1',
        "the surviving KPI keeps its id, so its readings are still its own");
      ok(w.eval('(exec.kpiUpdates||[]).some(u=>u.kpiId==="K1")'), "…and those readings survive");
      /* The removed KPI's readings go with it: left behind they are unreachable rows that still count
         toward nothing and can never be seen again. */
      ok(!w.eval('(exec.kpiUpdates||[]).some(u=>u.kpiId==="K2")'), "the removed KPI's readings go with it");

      // the last KPI cannot be removed
      w.eval('subOpenEdit("keyResult","KR1");');
      mb().querySelector('[data-krkdel="0"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(mb().querySelectorAll('.krk-row').length === 1,
        "the LAST KPI cannot be removed — a KPI-tracked KR with none would score null forever");
      ok(errs.length === 0, "no errors editing" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'edit flow threw: ' + (e && e.message)); }
  })();

  // ---------- an existing sub-KR tracked KR still opens as itself ----------
  (function () {
    const { dom, errs } = boot('execution_app.html');
    const w = dom.window, d = w.document;
    try {
      /* Hiding the option outright would leave the select with NO matching option for a record that
         already uses it: the browser falls back to the first, and the next save silently converts a
         sub-KR tracked KR to percentage, discarding its sub-results. */
      w.eval(SEED.replace('renderAll();', '') + `
        exec.keyResults=[{id:"KR1",objectiveId:"O1",statement:"Legacy",trackingType:"subkr",
          subKrs:[{id:"s1",statement:"a",weight:100,trackingType:"percentage",progress:40}]}];
        renderAll(); subOpenEdit("keyResult","KR1");`);
      const mb = () => d.getElementById('modalBody');
      const opts = [...mb().querySelectorAll('[data-krtype] option')].map(o => o.value);
      ok(opts.indexOf('subkr') >= 0, "a KR that ALREADY uses sub-key results still offers it");
      ok(mb().querySelector('[data-krtype]').value === 'subkr',
        "…and the select shows it, rather than falling back to the first option");
      ok(/legacy/i.test(mb().querySelector('[data-krtype]').textContent), "…marked as legacy");

      mb().querySelector('[data-krsave]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(w.eval('exec.keyResults[0].trackingType') === 'subkr',
        "saving it does NOT convert it to another tracking type");
      ok(w.eval('(exec.keyResults[0].subKrs||[]).length') === 1, "…and its sub-results survive");
      ok(errs.length === 0, "no errors" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'legacy subkr flow threw: ' + (e && e.message)); }
  })();

  // ---------- the sales app has the same modal ----------
  (function () {
    const { dom, errs } = boot('sales_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED.replace('kind:"rd"', 'kind:"sales"') + ' subOpenAdd("keyResult");');
      const mb = () => d.getElementById('modalBody');
      const tsel = mb().querySelector('[data-krtype]');
      tsel.value = 'kpi'; tsel.dispatchEvent(new w.Event('change', { bubbles: true }));
      const set = (sel, v) => { const el = mb().querySelector(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
      set('[data-f="statement"]', 'Pipeline quality');
      set('[data-kf="name"]', 'Win rate');
      set('[data-kf="kpiTarget"]', '40');
      ok(!!mb().querySelector('[data-krkadd]'), "the sales app's +KR modal has Add KPI too");
      mb().querySelector('[data-krkadd]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      set('[data-kf="name"][data-ki="1"]', 'Cycle time');
      set('[data-kf="kpiTarget"][data-ki="1"]', '30');
      mb().querySelector('[data-krsave]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const names = JSON.parse(w.eval('JSON.stringify(exec.kpis.filter(k=>k.hostType==="keyResult").map(k=>k.name))'));
      ok(names.length === 2, "…and writes both (" + names.join(', ') + ")");
      ok(errs.length === 0, "no errors in sales" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));

      const salesSrc = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/sales_app.html', 'utf8');
      ok(/function krKpiListHtml\(/.test(salesSrc), "…using the same list builder");
      ok(/kpis:existing\.length\?existing\.map\(krDraftKpiFrom\)/.test(salesSrc), "…and the same list-backed draft");
      ok(!/let pk=krPrimaryKpi\(kr\.id\);\n    if\(!pk\)/.test(salesSrc),
        "…with the single-KPI save path gone, not left beside the new one");
      const sOpts = [...mb().querySelectorAll('[data-krtype] option')].map(o => o.value);
      ok(sOpts.indexOf('subkr') < 0, "…and sub-key results hidden for new KRs there too");
      ok(/tt==="subkr"\?`<option value="subkr" selected>/.test(salesSrc),
        "…while an existing sub-KR tracked record still renders its option");
    } catch (e) { ok(false, 'sales flow threw: ' + (e && e.message)); }
  })();

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} KR multi-KPI assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1600);
