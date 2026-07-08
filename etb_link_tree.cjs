// Verifies familial filtering + nested indented link tree.
// Scenario (division D1): O_A -> model Stack A, which is a sub-product of System A (composition edge).
// Sibling Stack B and a Fuel Cell family also exist in scope. Stack A must see its own + System A (ancestor)
// metrics, but NOT Stack B (sibling) or Fuel Cell (other family). Tree renders nested headers + indented rows.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
let html=fs.readFileSync('/mnt/user-data/outputs/execution_app.html','utf8');
html=html.replace("\ninit();\n\n})();",
 "\ninit(); window.__T={ linkCandidates:linkCandidates, renderLinkEditor:renderLinkEditor, familyOfObjective:familyOfObjective, refreshTargetIds:refreshTargetIds, setState:function(st){ if('selectedObj' in st) selectedObj=st.selectedObj; if(st.exec) exec=st.exec; if(st.portfolio) portfolio=st.portfolio; if(st.refDocs) refDocs=st.refDocs; if('divisionId' in st) divisionId=st.divisionId; } };\n\n})();");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push((e&&e.message||String(e)).split("\n")[0]));
const dom=new JSDOM(html,{ runScripts:"dangerously", url:"https://localhost/?division=D1", pretendToBeVisual:true, virtualConsole:vc,
  beforeParse(w){ w.fetch=()=>Promise.resolve({ok:false,status:404,json:()=>Promise.resolve(null)}); if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; } });
const w=dom.window;
const K=(id,ht,extra)=>Object.assign({id,hostType:ht,isDefiner:true,groupId:null},extra);

(async()=>{
  await sleep(500);
  let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};
  const T=w.__T; ok(!!T,"hook exposed"); if(!T){process.exit(1);}
  const obj=(id,mid)=>({id,divisionId:"D1",modelId:mid,initiativeId:"I1",statement:id+" obj",plannedStart:2192,plannedEnd:2281});
  T.setState({
    selectedObj:"O_A", divisionId:"D1",
    portfolio:{
      divisions:[{id:"D1"}], initiatives:[{id:"I1",name:"Init 1"}], milestones:[], kpis:[],
      objectives:[obj("O_A","M_stackA"), obj("O_B","M_stackB"), obj("O_C","M_fuelcell")],
      models:[{id:"M_stackA",productId:"P_stack",name:"Stack A"},{id:"M_stackB",productId:"P_stack",name:"Stack B"},{id:"M_systemA",productId:"P_system",name:"System A"},{id:"M_fuelcell",productId:"P_fuelcell",name:"Fuel Cell"}],
      products:[{id:"P_stack",name:"Stack",divisionId:"D1"},{id:"P_system",name:"System",divisionId:"D1"},{id:"P_fuelcell",name:"FC Product",divisionId:"D1"}],
      composition:[{id:"c1",parent:"M_systemA",child:"M_stackA"}]   // Stack A is a sub-product of System A
    },
    exec:{ kpis:[ K("K_kr1","keyResult",{objectiveId:"O_A",hostId:"KR1",name:"Stack A efficiency",direction:"up",target:80}),
                  K("K_sg1","stageGate",{objectiveId:"O_A",hostId:"SG1",name:"Stack A gate",direction:"up"}),
                  K("K_init","initiative",{objectiveId:null,hostId:"I1",name:"Portfolio efficiency",direction:"up"}) ],
           keyResults:[{id:"KR1",objectiveId:"O_A",statement:"Improve stack A efficiency"}], stageGates:[{id:"SG1",objectiveId:"O_A",name:"Stack A validation"}],
           tasks:[], kpiUpdates:[], objectiveState:[], stageGateEdges:[], chainGatesByDate:{}, risks:[], etbTrees:{} },
    refDocs:{ "SPEC-D1":{doc:{ kpis:[
      K("PS_stack","product",{hostId:"P_stack",objectiveId:null,name:"Stack cost",direction:"down"}),
      K("MS_stackA","keyResult",{objectiveId:"M_stackA",hostId:"spec_stackA",name:"Stack A power density",direction:"up"}),
      K("CMP_A","component",{objectiveId:"M_stackA",hostId:"comp_A",name:"Membrane A thickness",direction:"down"}),
      K("MS_systemA","keyResult",{objectiveId:"M_systemA",hostId:"spec_systemA",name:"System A output",direction:"up"}),
      K("PS_system","product",{hostId:"P_system",objectiveId:null,name:"System cost",direction:"down"}),
      K("MS_stackB","keyResult",{objectiveId:"M_stackB",hostId:"spec_stackB",name:"Stack B power density",direction:"up"}),
      K("MS_fuelcell","keyResult",{objectiveId:"M_fuelcell",hostId:"spec_fc",name:"Fuel cell efficiency",direction:"up"}),
      K("PS_fuelcell","product",{hostId:"P_fuelcell",objectiveId:null,name:"FC cost",direction:"down"}) ],
      stageGates:[{id:"comp_A",name:"Membrane A"},{id:"spec_stackA",name:"Stack A spec"},{id:"spec_systemA",name:"System A spec"},{id:"spec_stackB",name:"Stack B spec"},{id:"spec_fc",name:"FC spec"}] }, etag:"1", version:1} }
  });
  T.refreshTargetIds();

  // 1) familial set
  const fam=T.familyOfObjective("O_A");
  ok(fam.models.has("M_stackA") && fam.models.has("M_systemA") && !fam.models.has("M_stackB") && !fam.models.has("M_fuelcell"), "1: family = {Stack A, System A}; excludes Stack B + Fuel Cell");
  ok(fam.products.has("P_stack") && fam.products.has("P_system") && !fam.products.has("P_fuelcell"), "1: family products = {Stack, System}; excludes FC product");

  // 2) KR link candidates — familial + up-only
  const kr=T.linkCandidates("keyResult","KR1").map(k=>k.id);
  ok(kr.includes("MS_stackA")&&kr.includes("CMP_A")&&kr.includes("PS_stack")&&kr.includes("K_init"), "2: KR sees own model/component/product + initiative ("+JSON.stringify(kr)+")");
  ok(kr.includes("MS_systemA")&&kr.includes("PS_system"), "2: KR sees System A (ancestor / sub-product parent)");
  ok(!kr.includes("MS_stackB"), "2: KR does NOT see sibling Stack B");
  ok(!kr.includes("MS_fuelcell")&&!kr.includes("PS_fuelcell"), "2: KR does NOT see the Fuel Cell family");
  ok(!kr.includes("K_kr1")&&!kr.includes("K_sg1"), "2: up-only holds (no same-level KR, no stage-gate)");

  // 3) stage-gate adds the KR branch (up-only: KR is above a gate)
  const sg=T.linkCandidates("stageGate","SG1").map(k=>k.id);
  ok(sg.includes("K_kr1"), "3: stage-gate sees the objective's KR (above)");
  ok(!sg.includes("K_sg1"), "3: stage-gate excludes same-level stage-gate");
  ok(!sg.includes("MS_stackB")&&!sg.includes("MS_fuelcell"), "3: stage-gate still familial-filtered");

  // 4) nested tree rendering for the KR source
  const h=T.renderLinkEditor("keyResult","KR1");
  ok(/<option disabled>[^<]*Initiative: Init 1/.test(h), "4: 'Initiative: Init 1' header");
  ok(h.includes("Product: Stack")&&h.includes("Model: Stack A")&&h.includes("Component: Membrane A"), "4: nested Product > Model > Component headers");
  ok(h.includes("Product: System")&&h.includes("Model: System A"), "4: System A (ancestor) nested as its own Product > Model");
  ok(!h.includes("Stack B")&&!h.includes("Fuel Cell")&&!h.includes("FC "), "4: no Stack B / Fuel Cell anywhere in the tree");
  ok(!h.includes("Objective:"), "4: KR source hides the Objective (KR/stage-gate) branch (up-only)");
  const opts=(h.match(/<option/g)||[]).length, disabled=(h.match(/<option disabled/g)||[]).length;
  ok(disabled>=5 && opts>disabled, "4: renders disabled headers + selectable KPI rows ("+disabled+" headers / "+opts+" options)");
  ok(h.indexOf("Component: Membrane A") > h.indexOf("Model: Stack A") && h.indexOf("Model: Stack A") > h.indexOf("Product: Stack"), "4: depth order Product > Model > Component");

  // 5) stage-gate render shows the Objective > KR branch
  const hs=T.renderLinkEditor("stageGate","SG1");
  ok(hs.includes("Objective:")&&/KR1 \u2014 Improve stack A efficiency/.test(hs), "5: stage-gate tree shows Objective > 'KR1 — <name>' branch");

  ok(errs.length===0, "no jsdom errors ("+JSON.stringify(errs.slice(0,2))+")");
  console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' familial-link-tree assertions green'));
  process.exit(f?1:0);
})();
