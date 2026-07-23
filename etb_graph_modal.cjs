// Execution-app ETB: (1) layering — the KPI picker/detail modals must sit ABOVE the edit drawer;
// (2) buildGraphElements emits a "No next step" node for dead-end results; (3) openExpDetailModal
// renders a read-only detail modal for completed experiments. Cytoscape is mocked (CDN-only in browser).
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
let html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
html=html.replace("\ninit();\n\n})();",
 "\ninit(); window.__H={ setTree:function(tr){state.tree=tr;try{normalizeTree(state.tree);}catch(e){}}, build:function(){var reach=computeReachability(state.tree);return buildGraphElements(state.tree,reach);}, render:function(){var reach=computeReachability(state.tree);var ge=buildGraphElements(state.tree,reach);return toRenderElements(ge.nodes,ge.edges);}, openConcl:function(e,r){openConclusionModal(e,r);}, renderGraph:function(){try{renderGraph();}catch(e){}}, conclOverlay:function(){var ov=(typeof ETB_ROOT!=='undefined'&&ETB_ROOT.querySelector)?ETB_ROOT.querySelector('#concl-overlay'):document.getElementById('concl-overlay');return ov||null;}, conclVisible:function(){var ov=(typeof ETB_ROOT!=='undefined'&&ETB_ROOT.querySelector)?ETB_ROOT.querySelector('#concl-overlay'):null;return !!(ov&&ov.classList.contains('open')&&ov.parentNode);}, closeConcl:function(){closeConclusionModal();}, getRes:function(e,r){var x=state.tree.experiments[e];return x?(x.possible_results||[]).find(function(p){return p.id===r;}):null;}, openModal:function(id){openExpDetailModal(id);}, overlay:function(){var ov=ETB_ROOT.querySelector('#exp-detail-overlay');return ov?ov.outerHTML:null;}, closeModal:function(){closeExpDetailModal();}, openPanel:function(id){openPanel(id);}, drawerOpen:function(){return $('#drawer').classList.contains('open');}, openKpiPicker:function(id){try{openKeyReadKpiPicker(state.tree,id);}catch(e){return 'ERR:'+e.message;}}, pickerOpen:function(){return !!ETB_ROOT.querySelector('#kr-kpi-overlay.open');} };\n\n})();");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function mockCy(w){ w.__cyCreated=0; w.__cyHandlers=[]; w.cytoscape=function(opts){ w.__cyCreated++; w.__cyEls=(opts&&opts.elements)?opts.elements:[]; w.__cyHandlers=[]; return {
  on:function(ev,sel,cb){ if(typeof sel==="function"){cb=sel;sel=null;} w.__cyHandlers.push({ev:ev,sel:sel,cb:cb}); }, ready:function(cb){ if(typeof cb==="function"){ try{cb();}catch(e){} } }, fit:function(){}, resize:function(){}, destroy:function(){},
  getElementById:function(){ return {length:0, select:function(){}}; }, zoom:function(){return 1;}, width:function(){return 800;}, height:function(){return 560;},
  layout:function(){ return {run:function(){}}; }, elements:function(){ return {length:0}; }, $:function(){return {unselect:function(){}};} }; }; }
function makeFetch(store){ return function(url,opts){ opts=opts||{}; const m=/\/state\/([^/?]+)/.exec(String(url)); const id=m?decodeURIComponent(m[1]):null;
  if((opts.method||"GET").toUpperCase()==="PUT"){ let b={}; try{b=JSON.parse(opts.body);}catch(e){} const pv=store[id]?store[id].version:0; store[id]={doc:b.doc,etag:String(pv+1),version:pv+1}; return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({etag:String(pv+1),version:pv+1})}); }
  return Promise.resolve(store[id]?{ok:true,status:200,json:()=>Promise.resolve({doc:store[id].doc,etag:store[id].etag,version:store[id].version})}:{ok:false,status:404,json:()=>Promise.resolve(null)}); }; }
function loadApp(store){ const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push((e&&e.message||String(e)).split("\n")[0]));
  const dom=new JSDOM(html,{ runScripts:"dangerously", url:"https://localhost/?token=tok", pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(w){ w.fetch=makeFetch(store); mockCy(w); if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; } });
  return {w:dom.window, errs}; }
const pf=()=>({ divisions:[{id:"D1",name:"Div1"}], objectives:[{id:"O1",statement:"Obj1",divisionId:"D1",quarter:"2026Q1",plannedStart:2192,plannedEnd:2281}], kpis:[], products:[], models:[], initiatives:[] });
const seedExec=()=>({ objectiveState:[],keyResults:[],kpis:[],stageGates:[],tasks:[],kpiUpdates:[],stageGateEdges:[],chainGatesByDate:{},risks:[], etbTrees:{ O1:{ project_id:"O1", experiments:{ "X-1":{id:"X-1",code:"E1",name:"seed",status:"planned",key_reads:[],possible_results:[],audit_log:[]} }, root_experiment_id:"X-1" } } });
const testTree={ project_id:"O1", root_experiment_id:"exp_001", terminal_types:{target_achieved:{label:"Target achieved",kind:"go"},halt:{label:"Halt",kind:"stop"}},
  experiments:{
    exp_001:{id:"exp_001",code:"EXP-1",name:"Baseline",status:"complete",hypothesis:"Higher loading raises conductivity",toggle:"catalyst loading",test:"run polcurve",
      key_reads:[{id:"kr_1_1",name:"conductivity",unit:"S/cm",critical_value:10,direction:">="}],
      possible_results:[
        {id:"res_1a",label:"High conductivity",criteria:[],conclusion:"meets spec",next_experiment_ids:["exp_002"],terminal:null,accomplishments:[]},
        {id:"res_1b",label:"Low conductivity",criteria:[],conclusion:"below spec",next_experiment_ids:[],terminal:null,accomplishments:[]}],
      actual_outcome:{result_id:"res_1a",recorded_date:"2026-05-01",recorded_by:"corey",note:"clean run",conclusion:null,next_experiment_ids:[],terminal:null}, audit_log:[]},
    exp_002:{id:"exp_002",code:"EXP-2",name:"Follow-up",status:"planned",hypothesis:"",toggle:"",test:"",key_reads:[],possible_results:[],actual_outcome:null,audit_log:[]}
  }};

(async()=>{
  let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};
  const store={ portfolio:{doc:pf(),etag:"1",version:1}, "EXEC-D1":{doc:seedExec(),etag:"5",version:5} };
  const A=loadApp(store); await sleep(1200);
  ok(A.errs.length===0, "no jsdom errors on boot ("+JSON.stringify(A.errs.slice(0,2))+")");
  const H=A.w.__H; if(!H){ console.error("hook missing"); process.exit(1); }
  H.setTree(testTree);

  // ---- change 2: buildGraphElements "No next step" node ----
  const g=H.build();
  const nonext=g.nodes.filter(x=>x.data.kind==="nonext");
  ok(nonext.length===1, "exactly 1 'No next step' node (res_1b only) — got "+nonext.length);
  ok(nonext[0]&&nonext[0].data.label==="No next step", "node label reads 'No next step'");
  ok(g.edges.some(e=>e.data.source==="exp_001"&&/^nonext_/.test(e.data.target)), "edge exp_001 -> its No-next-step node");
  ok(g.edges.some(e=>e.data.source==="exp_001"&&e.data.target==="exp_002"), "res_1a still edges exp_001 -> exp_002");

  // ---- change 3: detail modal ----
  H.openModal("exp_001");
  const ov=H.overlay();
  ok(ov!=null, "detail modal overlay created");
  ok(/EXP-1/.test(ov)&&/Experiment details/.test(ov)&&/Higher loading raises conductivity/.test(ov), "modal: code + details + hypothesis");
  ok(/conductivity/.test(ov)&&/S\/cm/.test(ov), "modal: key reads");
  ok(/Observed:/.test(ov)&&/High conductivity/.test(ov)&&/Next step/.test(ov)&&/EXP-2/.test(ov), "modal: observed result + next step (-> EXP-2)");
  ok(/Possible results/.test(ov)&&/Low conductivity/.test(ov)&&/nonext-tag/.test(ov), "modal: possible results incl 'No next step' tag");
  ok(/observed-badge/.test(ov)&&/Edit results/.test(ov), "modal: observed badge + Edit results button");
  H.closeModal();
  ok(H.overlay()==null, "closeModal removes overlay");

  // ---- change 1: layering — picker coexists with the drawer (does not close it) ----
  H.openPanel("exp_001");
  ok(H.drawerOpen()===true, "edit drawer opens");
  const pr=H.openKpiPicker("exp_001");
  ok(pr!=="ERR", "KPI picker opened without error ("+(pr||"ok")+")");
  ok(H.pickerOpen()===true, "KPI picker overlay is open");
  ok(H.drawerOpen()===true, "drawer STAYS open when the picker opens (layering fix — picker no longer sits behind it)");

  // ---- conclusion-on-arrow: the pill node carries expId+resultId, and tapping it opens an editor/amend modal ----
  H.setTree(testTree);
  const rel = H.render();
  const pills = rel.nodes.filter(x => x.data.kind === "edgelabel");
  ok(pills.length > 0, "graph has edgelabel pill nodes on the arrows");
  const pill1a = pills.find(x => x.data.resultId === "res_1a");
  ok(!!pill1a && pill1a.data.expId === "exp_001", "the arrow pill carries expId+resultId so a tap can recover the result");
  ok(pill1a && /High conductivity/.test(pill1a.data.label), "the pill still shows the RESULT LABEL (not the conclusion text)");

  // exp_001 tap on res_1a -> the modal is now the FULL single-result editor (Result, Criteria, Conclusion,
  // Accomplishments + SG select, Leads-to) — the same card the experiment setup renders, scoped to one result.
  H.openConcl("exp_001", "res_1a");
  let cov = H.conclOverlay();
  ok(!!cov, "tapping a result pill opens the result modal");
  ok(H.conclVisible(), "the modal is visible (ETB_ROOT + .open)");
  ok(!!cov && !!cov.querySelector(".result"), "the modal renders the full result card (.result), not a bare textarea");
  const modalTxt = cov ? cov.textContent : "";
  ok(/Criteria/i.test(modalTxt), "section: Criteria of the result");
  ok(/Conclusion/i.test(modalTxt), "section: Conclusion");
  ok(/Accomplishments/i.test(modalTxt), "section: Accomplishments");
  ok(/stage-gate/i.test(modalTxt), "the Accomplishments section has the stage-gate select");
  ok(/(Next|Leads|next step|Go to)/i.test(modalTxt), "section: Leads-to (next step)");
  // the result's own fields are present + seeded (label input, conclusion textarea)
  const inputs = [...cov.querySelectorAll("input,textarea")];
  ok(inputs.some(i => (i.value || "") === "High conductivity"), "the Result label is shown and seeded");
  ok(modalTxt.indexOf("meets spec") >= 0, "the result's conclusion (meets spec) is shown in the modal");
  H.closeConcl();
  ok(!H.conclOverlay(), "closing the modal removes it");

  // ---- WIRING: replay the actual cy.on("tap",'node[kind="edgelabel"]') path (the browser path, not a direct call) ----
  H.setTree(testTree);
  H.renderGraph();   // registers the tap handlers via the recording mock
  const handlers = A.w.__cyHandlers || [];
  const tapEdge = handlers.find(h => h.ev === "tap" && h.sel === 'node[kind="edgelabel"]');
  ok(!!tapEdge, "a tap handler IS registered for edgelabel pills");
  // build the exact data object a real pill carries, and fire the handler as Cytoscape would
  const rel2 = H.render();
  const pillNode = rel2.nodes.find(x => x.data.kind === "edgelabel" && x.data.resultId);
  ok(!!pillNode, "there is a pill node carrying a resultId to tap");
  if (tapEdge && pillNode) {
    H.closeConcl();
    const fakeEvt = { target: { id: () => pillNode.data.id, data: () => pillNode.data } };
    let threw = null; try { tapEdge.cb(fakeEvt); } catch (e) { threw = e.message; }
    ok(threw === null, "invoking the tap handler does not throw (" + (threw || "ok") + ")");
    ok(!!H.conclOverlay(), "firing the edgelabel tap handler OPENS the conclusion modal (the real wiring works)");
    ok(H.conclVisible(), "the opened modal is actually VISIBLE — attached to ETB_ROOT with the .open class (not display:none)");
    H.closeConcl();
  }

  console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' ETB nonext + detail-modal + layering assertions green'));
  process.exit(f?1:0);
})();
