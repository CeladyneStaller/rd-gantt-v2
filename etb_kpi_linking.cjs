// Verifies the 5-group KPI linking: rank model, component-level surfacing (new), strict up-only
// filtering (KR never sees stage-gates; stage-gate sees KRs), optgroup rendering, key-read grouping.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
let html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
html=html.replace("\ninit();\n\n})();",
 "\ninit(); window.__L={ rankOf:rankOf, linkRank:linkRank, linkGroupLabel:linkGroupLabel, linkCandidates:linkCandidates, renderLinkEditor:renderLinkEditor, componentTargetsInScope:componentTargetsInScope, linkTargetKpis:linkTargetKpis, hubProjectKpis:function(){return window.hubProjectKpis();}, refreshTargetIds:refreshTargetIds, setState:function(st){ if('selectedObj' in st) selectedObj=st.selectedObj; if(st.exec) exec=st.exec; if(st.refDocs) refDocs=st.refDocs; if(st.portfolio) portfolio=st.portfolio; if('divisionId' in st) divisionId=st.divisionId; } };\n\n})();");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function load(){ const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push((e&&e.message||String(e)).split("\n")[0]));
  const dom=new JSDOM(html,{ runScripts:"dangerously", url:"https://localhost/?division=D1", pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(w){ w.fetch=()=>Promise.resolve({ok:false,status:404,json:()=>Promise.resolve(null)}); if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; } });
  return {w:dom.window, errs}; }

(async()=>{
  const {w,errs}=load(); await sleep(500);
  let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};
  const L=w.__L; ok(!!L,"hook exposed"); if(!L){ console.log('\nFAILED: no hook'); process.exit(1); }

  // scenario: division D1, objective O1 classified to model M1 (product P1); spec doc carries product-family,
  // per-model Product Spec, and component KPIs; exec has one KR and one stage-gate.
  const KRk ={id:"KRK",hostType:"keyResult",objectiveId:"O1",hostId:"KR1",name:"Efficiency",unit:"%",direction:"up",target:80,isDefiner:true};
  const SGk ={id:"SGK",hostType:"stageGate",objectiveId:"O1",hostId:"SG1",name:"Durability gate",unit:"h",direction:"up",target:1000,isDefiner:true};
  const CMP ={id:"CMP",hostType:"component",objectiveId:"M1",hostId:"comp1",name:"Membrane thickness",unit:"um",direction:"down",target:15,isDefiner:true};
  const PS1 ={id:"PS1",hostType:"keyResult",objectiveId:"M1",hostId:"spec1",name:"Power density",unit:"W/cm2",direction:"up",target:1.2,isDefiner:true};
  const PF1 ={id:"PF1",hostType:"product",objectiveId:null,hostId:"P1",name:"Cost",unit:"$/kW",direction:"down",target:50,isDefiner:true};
  L.setState({
    selectedObj:"O1", divisionId:"D1",
    portfolio:{ divisions:[{id:"D1",name:"FC"}], objectives:[{id:"O1",divisionId:"D1",modelId:"M1",statement:"Obj"}],
                models:[{id:"M1",productId:"P1",name:"Stack-A"}], products:[{id:"P1",name:"FC Stack"}], composition:[], milestones:[], kpis:[], initiatives:[] },
    exec:{ kpis:[KRk,SGk], keyResults:[{id:"KR1",objectiveId:"O1",statement:"Improve efficiency"}], stageGates:[{id:"SG1",name:"Durability",gate_id:"G1"}],
           tasks:[], kpiUpdates:[], objectiveState:[], stageGateEdges:[], chainGatesByDate:{}, risks:[], etbTrees:{} },
    refDocs:{ "SPEC-D1":{doc:{kpis:[CMP,PS1,PF1], stageGates:[{id:"comp1",name:"Membrane"},{id:"spec1",name:"Cathode"}]}, etag:"1", version:1} }
  });
  L.refreshTargetIds();

  // 1) rank model
  ok(L.rankOf("initiative",null)===5 && L.rankOf("milestone",null)===5, "1: initiative/milestone rank 5");
  ok(L.rankOf("product","P1")===4, "1: product-family rank 4");
  ok(L.rankOf("keyResult","M1")===4, "1: per-model Product Spec (keyResult on model) rank 4");
  ok(L.rankOf("component","comp1")===3, "1: component rank 3");
  ok(L.rankOf("keyResult","O1")===2, "1: execution KR (keyResult on objective) rank 2");
  ok(L.rankOf("stageGate","SG1")===1, "1: stage-gate rank 1");
  ok(L.linkGroupLabel(4)==="Product" && L.linkGroupLabel(3)==="Component" && L.linkGroupLabel(2)==="Key results" && L.linkGroupLabel(1)==="Stage-gates", "1: group labels");

  // 2) component-level surfacing (new capability)
  ok(L.componentTargetsInScope({models:["M1"]}).some(k=>k.id==="CMP"), "2: component surfaced for an in-scope model");
  ok(L.componentTargetsInScope({models:["M2"]}).length===0, "2: component NOT surfaced for an out-of-scope model");
  const tk=L.linkTargetKpis().map(k=>k.id);
  ok(tk.includes("CMP") && tk.includes("PS1") && tk.includes("PF1"), "2: linkTargetKpis surfaces component + product-spec + product-family ("+JSON.stringify(tk)+")");

  // 3) strict up-only filter
  const krCands=L.linkCandidates("keyResult","KR1").map(k=>k.id);
  ok(!krCands.includes("SGK"), "3: KR link does NOT offer a stage-gate (below)");
  ok(!krCands.includes("KRK"), "3: KR link does NOT offer a same-level KR");
  ok(krCands.includes("CMP") && krCands.includes("PS1") && krCands.includes("PF1"), "3: KR link offers Component + Product levels ("+JSON.stringify(krCands)+")");
  const sgCands=L.linkCandidates("stageGate","SG1").map(k=>k.id);
  ok(sgCands.includes("KRK"), "3: stage-gate link OFFERS the KR (above)");
  ok(!sgCands.includes("SGK"), "3: stage-gate link does NOT offer a same-level stage-gate");
  ok(sgCands.includes("CMP") && sgCands.includes("PF1"), "3: stage-gate link also offers Component + Product");

  // 4) nested indented tree, filtered per source (optgroups replaced by header rows)
  const krHtml=L.renderLinkEditor("keyResult","KR1");
  ok(krHtml.includes("Product:") && krHtml.includes("Model:") && krHtml.includes("Component:"), "4: KR editor nests Product > Model > Component headers");
  ok(!krHtml.includes("Objective:"), "4: KR editor hides the Objective (KR/stage-gate) branch (up-only)");
  ok(krHtml.indexOf("Component:") > krHtml.indexOf("Model:") && krHtml.indexOf("Model:") > krHtml.indexOf("Product:"), "4: depth order Product > Model > Component");
  const sgHtml=L.renderLinkEditor("stageGate","SG1");
  ok(sgHtml.includes("Product:") && sgHtml.includes("Component:"), "4: stage-gate editor nests Product + Component");
  ok(sgHtml.includes("Objective:"), "4: stage-gate editor shows the Objective branch (KR above a gate)");

  // 5) key-read picker grouping (host->ETB bridge tags each KPI)
  const hub=L.hubProjectKpis();
  const krEntry=hub.find(k=>k.gid==="KRK"), sgEntry=hub.find(k=>k.gid==="SGK");
  ok(krEntry && krEntry.group==="Key results", "5: key-read bridge tags the KR as 'Key results'");
  ok(sgEntry && sgEntry.group==="Stage-gates", "5: key-read bridge tags the stage-gate as 'Stage-gates'");

  ok(errs.length===0, "no jsdom errors ("+JSON.stringify(errs.slice(0,2))+")");
  console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' KPI-linking assertions green'));
  process.exit(f?1:0);
})();
