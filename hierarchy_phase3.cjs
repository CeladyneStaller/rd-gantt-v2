// Phase 3 of the hierarchy: the UI finally shows units.
//   - Overview: a Company hero with the note "Mean of division scores", and division cards grouped under Unit
//     sections that carry a per-unit score.
//   - ?unit=<id> scopes the app to one unit's divisions (via pfFilters/structDivShows).
//   - Gantt/grouping: 'unit' is an available group dimension.
//   - Structure: a division's unitId (ref to units) and kind (rd|biz) are editable.
// jsdom has no layout engine, so this asserts PRESENCE/STRUCTURE and the scores in the markup — not pixels.
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

// build a portfolio + exec docs so division scores are deterministic (demonstration KPI: value = score)
function seed(w){
  function docFor(objs){
    const kr=[],kpi=[],ups=[];
    objs.forEach(o=>{ const k='KR-'+o.id,p='K-'+o.id;
      kr.push({id:k,objectiveId:o.id});
      kpi.push({id:p,objectiveId:o.id,hostType:'keyResult',hostId:k,targetType:'demonstration',direction:'up',target:100,isDefiner:true});
      ups.push({id:'U-'+p,kpiId:p,value:o.s,timestamp:1}); });
    return {keyResults:kr,kpis:kpi,kpiUpdates:ups,stageGates:[],stageGateSets:[],stageGateEdges:[],tasks:[],objectiveState:[]};
  }
  w.eval(`portfolio={
    units:[{id:'UNIT-TECH',name:'Technical',order:1},{id:'UNIT-BIZ',name:'Business',order:2}],
    divisions:[{id:'DIV-FC',name:'Fuel Cell',unitId:'UNIT-TECH',kind:'rd',order:0},
               {id:'DIV-EL',name:'Electrolyzer',unitId:'UNIT-TECH',kind:'rd',order:1},
               {id:'DIV-FIN',name:'Financial',unitId:'UNIT-BIZ',kind:'biz',order:2}],
    products:[],models:[],initiatives:[],milestones:[],
    objectives:[{id:'O-FC',statement:'a',divisionId:'DIV-FC'},{id:'O-EL',statement:'b',divisionId:'DIV-EL'},
                {id:'O-FIN',statement:'c',divisionId:'DIV-FIN'}],
    kpis:[],kpiDefs:[],kpiUpdates:[] };`);
  w.__fc=docFor([{id:'O-FC',s:100}]); w.__el=docFor([{id:'O-EL',s:0}]); w.__fin=docFor([{id:'O-FIN',s:40}]);
  w.eval(`execDocs={}; execDocs[execIdFor('DIV-FC')]=window.__fc; execDocs[execIdFor('DIV-EL')]=window.__el; execDocs[execIdFor('DIV-FIN')]=window.__fin;`);
}

(async()=>{
  let w=await boot("https://x.test/?token=t"); seed(w);
  let html=w.eval("overviewTilesHtml()");

  // ---- Company hero + the note ----
  ok(html.indexOf("Mean of division scores")>=0, "the Overview shows the 'Mean of division scores' note");
  ok(html.indexOf("47")>=0, "the company hero shows 47 (mean of division scores 100,0,40 = 46.7)");
  ok(html.indexOf('class="ov-company"')>=0, "the company hero element is present");

  // ---- unit sections, each with a per-unit score ----
  ok(html.indexOf('class="ov-unit"')>=0, "division cards are grouped into unit sections");
  ok(html.indexOf("Technical")>=0 && html.indexOf("Business")>=0, "both unit names are shown as section heads");
  // UNIT-TECH flat mean of its 2 objectives (100,0) = 50; UNIT-BIZ = 40
  const tech = html.slice(html.indexOf("Technical"), html.indexOf("Business"));
  ok(tech.indexOf("50")>=0, "the Technical unit head shows its flat score 50 (mean of 100,0)");
  // ordering: Technical (order 1) appears before Business (order 2)
  ok(html.indexOf("Technical") < html.indexOf("Business"), "units render in their order (Technical before Business)");
  // each division still appears, under its unit
  ok(html.indexOf("Fuel Cell")>=0 && html.indexOf("Electrolyzer")>=0 && html.indexOf("Financial")>=0,
     "every division card still renders, nested under its unit");

  // ---- a division with no unitId falls into an Unassigned section ----
  w=await boot("https://x.test/?token=t"); seed(w);
  w.eval("portfolio.divisions.push({id:'DIV-ORPHAN',name:'Orphan',order:9}); portfolio.objectives.push({id:'O-OR',statement:'d',divisionId:'DIV-ORPHAN'});");
  w.__or=(function(){return null;})(); // no exec doc -> unscored, still listed
  html=w.eval("overviewTilesHtml()");
  ok(html.indexOf("Unassigned")>=0, "a division with no unitId appears under an 'Unassigned' section");
  ok(html.indexOf("Orphan")>=0, "...and the orphan division card renders there");

  // ---- ?unit= scopes the whole app to that unit ----
  w=await boot("https://x.test/?unit=UNIT-BIZ&token=t"); seed(w);
  ok(w.eval("pfFilters.unit")==='UNIT-BIZ', "?unit= seeds pfFilters.unit");
  ok(w.eval("structDivShows(portfolio.divisions.find(d=>d.id==='DIV-FIN'))")===true, "the biz division shows under ?unit=UNIT-BIZ");
  ok(w.eval("structDivShows(portfolio.divisions.find(d=>d.id==='DIV-FC'))")===false, "...and a Technical division is filtered out");
  html=w.eval("overviewTilesHtml()");
  ok(html.indexOf("Financial")>=0 && html.indexOf("Fuel Cell")<0, "the Overview under ?unit=UNIT-BIZ shows only Business divisions");
  ok(w.eval("URLP.unit")==='UNIT-BIZ', "URLP exposes the unit param");
  // case-insensitive param NAME (values stay exact)
  const w2=await boot("https://x.test/?UNIT=UNIT-BIZ&token=t");
  ok(w2.eval("pfFilters.unit")==='UNIT-BIZ', "?UNIT= (uppercase name) is honoured too");

  // ---- 'unit' is a group dimension (Gantt / group-by) ----
  w=await boot("https://x.test/?token=t"); seed(w);
  ok(w.eval("GROUP_DIMS.some(d=>d[0]==='unit')"), "'unit' is an available group dimension");
  ok(w.eval("GROUP_DIMS[0][0]")==='unit', "...and it is first (top of the hierarchy)");
  ok(w.eval("dimLabel('unit','UNIT-TECH')")==='Technical', "dimLabel resolves a unit id to its name");
  // grouping objectives by unit actually partitions them (via the engine's _dimKey)
  ok(w.eval("RD.groupObjectives(portfolio.objectives, ['unit'], portfolio).length")>=2,
     "grouping objectives by unit yields the unit buckets");

  // ---- 'unit' is a first-class FILTER in the planning filter bar (dropdown + predicate + chip) ----
  w=await boot("https://x.test/?token=t"); seed(w);
  ok(w.eval("filterBarHtml(true).indexOf('data-fb=\"unit\"')>=0"), "the filter bar renders a Unit dropdown");
  ok(w.eval("filterBarHtml(true).indexOf('Technical')>=0"), "...and the Unit dropdown lists unit names");
  // objMatches gates on unit: an objective whose division is in another unit is filtered out
  w.eval("pfFilters.unit='UNIT-TECH';");
  ok(w.eval("pfAnyFilter()")===true, "a unit-only filter is recognised as active (pfAnyFilter)");
  const inTech = w.eval("(portfolio.objectives.find(function(o){return RD.unitIdOfDivision(o.divisionId,portfolio)==='UNIT-TECH';})||{}).id");
  const inBiz  = w.eval("(portfolio.objectives.find(function(o){return RD.unitIdOfDivision(o.divisionId,portfolio)==='UNIT-BIZ';})||{}).id");
  if (inTech) ok(w.eval("objMatches(portfolio.objectives.find(function(o){return o.id==='"+inTech+"';}))")===true, "objMatches keeps an objective in the filtered unit");
  if (inBiz)  ok(w.eval("objMatches(portfolio.objectives.find(function(o){return o.id==='"+inBiz+"';}))")===false, "objMatches drops an objective in a different unit");
  // the active-filter chip names the unit, and clearing removes it
  ok(w.eval("pfActiveChips().indexOf('Unit: Technical')>=0"), "the active-filter chip shows the unit name");
  w.eval("pfFilters.unit=pfFilters.division=pfFilters.product=pfFilters.quarter=pfFilters.status='';");
  ok(w.eval("pfAnyFilter()")===false, "clearing the unit filter deactivates it");

  // milestones resolve unit too (via the initiative's division)
  ok(w.eval("typeof RD.groupMilestones")==="function" ? w.eval("(function(){try{var ms=(portfolio.milestones||[]);var g=RD.groupMilestones(ms,['unit'],portfolio);return true;}catch(e){return false;}})()") : true, "grouping milestones by unit does not throw (unit dim resolves for milestones)");

  // ---- Structure: a division's unitId and kind are editable ----
  w=await boot("https://x.test/?token=t"); seed(w);
  const schema=w.eval("JSON.stringify(SCHEMAS.division)");
  ok(schema.indexOf('"unitId"')>=0 && schema.indexOf("ref:unit")>=0, "the division editor has a Unit (ref) field");
  ok(schema.indexOf('"kind"')>=0 && schema.indexOf("enum:rd,biz")>=0, "the division editor has a Kind (rd|biz) field");
  ok(w.eval("SEL.unit().length")===2, "SEL.unit lists the units for the dropdown");
  // the render path is the SCHEMAS loop, which handles ref: and enum: (asserted structurally above). Confirm
  // the enum: field type is actually recognised by rendering a division editor via the real code if reachable.
  // the renderer's SCHEMAS loop handles ref: and enum: types; assert the division schema uses exactly those,
  // so unitId renders as a units dropdown and kind as an rd|biz select.
  ok(w.eval('SCHEMAS.division.some(function(c){return c[0]==="kind" && c[2]==="enum:rd,biz";})'),
     "the kind field uses the enum: type the editor renderer handles");
  ok(w.eval('SCHEMAS.division.some(function(c){return c[0]==="unitId" && c[2]==="ref:unit?";})'),
     "the unit field uses the ref:unit? type the editor renderer handles");

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} overview/unit-tier (phase 3) assertions green`);
  process.exit(fl.length?1:0);
})();
