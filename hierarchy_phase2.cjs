// Phase 2 of the hierarchy: the planning app's exec-doc addressing becomes KIND-AWARE.
//   - execIdFor(divId): rd -> EXEC-<div>, biz -> BIZ-<div>   (biz = the namespace the Sales app writes)
//   - execMap()'s reverse-strip must handle BOTH prefixes (EXEC- is 5 chars, BIZ- is 4) — the old slice(5)
//     silently corrupted biz doc keys.
// The point: a full Company rollup pulls a Business division's KR/KPI readings from its BIZ- doc automatically.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const HTML=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

function boot(url){
  return new Promise(res=>{
    const dom=new JSDOM(HTML,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url,pretendToBeVisual:true,
      beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
    setTimeout(()=>res(dom.window),450);
  });
}

(async()=>{
  const w=await boot("https://x.test/?token=t");

  // ---- kind picks the prefix ----
  w.eval(`portfolio={ units:[{id:'UNIT-TECH',order:1},{id:'UNIT-BIZ',order:2}],
    divisions:[{id:'DIV-FC',unitId:'UNIT-TECH',kind:'rd'},{id:'DIV-FIN',unitId:'UNIT-BIZ',kind:'biz'},
               {id:'DIV-OLD',unitId:'UNIT-TECH'}],   // kind absent -> rd
    products:[],models:[],initiatives:[],milestones:[],objectives:[],kpis:[],kpiDefs:[],kpiUpdates:[] };`);
  ok(w.eval("execIdFor('DIV-FC')")==='EXEC-DIV-FC', "an rd division addresses EXEC-<div>");
  ok(w.eval("execIdFor('DIV-FIN')")==='BIZ-DIV-FIN', "a biz division addresses BIZ-<div>");
  ok(w.eval("execIdFor('DIV-OLD')")==='EXEC-DIV-OLD', "a division with no kind defaults to EXEC- (absent-means-rd)");
  ok(w.eval("divisionKindOf('DIV-FIN')")==='biz' && w.eval("divisionKindOf('DIV-FC')")==='rd',
     "divisionKindOf reflects the division's kind");

  // ---- watchedDocs (the fetch list) includes BOTH prefixes ----
  const watched=w.eval("JSON.stringify(watchedDocs())");
  ok(watched.indexOf("EXEC-DIV-FC")>=0, "the fetch list watches the rd division's EXEC- doc");
  ok(watched.indexOf("BIZ-DIV-FIN")>=0, "...and the biz division's BIZ- doc");

  // ---- execMap reverse-strip round-trips BOTH prefixes (the slice(5) trap) ----
  ok(w.eval("stripDocPrefix('EXEC-DIV-FC')")==='DIV-FC', "EXEC- strips to the division id");
  ok(w.eval("stripDocPrefix('BIZ-DIV-FIN')")==='DIV-FIN', "BIZ- ALSO strips to the division id (not 'IV-FIN')");
  w.eval(`execDocs={ 'EXEC-DIV-FC':{kpis:[]}, 'BIZ-DIV-FIN':{kpis:[]} };`);
  const em=w.eval("JSON.stringify(Object.keys(execMap()).sort())");
  ok(em==='["DIV-FC","DIV-FIN"]', "execMap keys are the clean division ids for BOTH namespaces");

  // ---- the payoff: a Company rollup pulls a biz division's readings from its BIZ- doc ----
  // one demonstration KPI per objective; value = the objective's intended score.
  function docFor(objs){
    const kr=[],kpi=[],ups=[];
    objs.forEach(o=>{ const k='KR-'+o.id, p='K-'+o.id;
      kr.push({id:k,objectiveId:o.id});
      kpi.push({id:p,objectiveId:o.id,hostType:'keyResult',hostId:k,targetType:'demonstration',direction:'up',target:100,isDefiner:true});
      ups.push({id:'U-'+p,kpiId:p,value:o.s,timestamp:1}); });
    return {keyResults:kr,kpis:kpi,kpiUpdates:ups,stageGates:[],stageGateSets:[],stageGateEdges:[],tasks:[],objectiveState:[]};
  }
  w.eval(`portfolio.objectives=[{id:'O-FC',divisionId:'DIV-FC'},{id:'O-FIN',divisionId:'DIV-FIN'}];`);
  // DIV-FC scores 80 from its EXEC- doc; DIV-FIN scores 40 from its BIZ- doc. Build the docs in Node, inject
  // them onto window, then wire execDocs to point EXEC-DIV-FC and BIZ-DIV-FIN at them.
  w.__fc  = docFor([{id:'O-FC',  s:80}]);
  w.__fin = docFor([{id:'O-FIN', s:40}]);
  // key each doc BY execIdFor(divId) — exactly what the fetch loop does. If execIdFor were kind-blind, the biz
  // doc would land under EXEC-DIV-FIN, the BIZ- lookup would miss, and DIV-FIN would score null.
  w.eval(`execDocs = {}; execDocs[execIdFor('DIV-FC')] = window.__fc; execDocs[execIdFor('DIV-FIN')] = window.__fin;`);

  // Once the biz doc is LOADED (under whatever key execIdFor produced), the rollup resolves it by objectiveId
  // and the math is right. (The engine is key-agnostic across exec docs, so kind-awareness lives in the FETCH
  // addressing above — execIdFor + watchedDocs — not here. These assert the numbers, given the load.)
  const divFC=w.eval("RD.rollupDivision('DIV-FC', portfolio, pfMap())");
  const divFIN=w.eval("RD.rollupDivision('DIV-FIN', portfolio, pfMap())");
  ok(Math.abs(divFC-80)<1e-9, "with its exec doc loaded, the rd division scores 80");
  ok(Math.abs(divFIN-40)<1e-9, "with its BIZ- doc loaded, the biz division scores 40");

  const company=w.eval("RD.rollupCompany(portfolio, pfMap())");
  // DIV-OLD has no objectives -> drops out; company = mean(80, 40) = 60
  ok(Math.abs(company-60)<1e-9, "Company = mean of both division scores (80 & 40 -> 60), biz data included");

  const unitBiz=w.eval("RD.rollupUnit('UNIT-BIZ', portfolio, pfMap())");
  ok(Math.abs(unitBiz-40)<1e-9, "the Business unit's score reflects its biz division's readings");

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} cross-namespace (phase 2) assertions green`);
  process.exit(fl.length?1:0);
})();
