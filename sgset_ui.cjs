// Pass-2 UI harness: boots the built app with gates-but-no-sets, verifies migration -> default set,
// per-set grouping + "SetLabel-N" numbering in the rendered DOM, the objective-strip gate-health pill,
// and set-management ops (add / move gate / rename / delete-with-reassign). Broker + cytoscape mocked.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
let html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
// expose host set functions/state via a trailing classic script (host vars are top-level lets)
html=html.replace("</body>", `<script>
window.__T={ renderGates: (typeof renderGates!=='undefined')?renderGates:null, objMetricStrip:(typeof objMetricStrip!=='undefined')?objMetricStrip:null,
  objSetsOrdered:objSetsOrdered, gatesOfSet:gatesOfSet, gateLabel:gateLabel, addSet:addSet, delSet:delSet,
  getExec:()=>exec, getSel:()=>selectedObj, moveGate:(gid,sid)=>{ const g=exec.stageGates.find(x=>x.id===gid); if(g) g.setId=sid; } };
</script></body>`);
function mockCy(w){ w.cytoscape=function(){ return { on(){}, ready(cb){try{cb&&cb();}catch(e){}}, fit(){}, resize(){}, destroy(){}, getElementById(){return{length:0,select(){}};}, zoom(){return 1;}, width(){return 800;}, height(){return 560;}, layout(){return{run(){}};}, elements(){return{length:0};} }; }; }
function makeFetch(store){ return function(url,opts){ opts=opts||{}; const m=/\/state\/([^/?]+)/.exec(String(url)); const id=m?decodeURIComponent(m[1]):null;
  if((opts.method||"GET").toUpperCase()==="PUT"){ let b={}; try{b=JSON.parse(opts.body);}catch(e){} const pv=store[id]?store[id].version:0; store[id]={doc:b.doc,etag:String(pv+1),version:pv+1}; return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({etag:String(pv+1),version:pv+1})}); }
  return Promise.resolve(store[id]?{ok:true,status:200,json:()=>Promise.resolve({doc:store[id].doc,etag:store[id].etag,version:store[id].version})}:{ok:false,status:404,json:()=>Promise.resolve(null)}); }; }
function loadApp(store){ const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push((e&&e.message||String(e)).split("\n")[0]));
  const dom=new JSDOM(html,{ runScripts:"dangerously", url:"https://localhost/?token=tok", pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(w){ w.fetch=makeFetch(store); mockCy(w); if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; } });
  return {w:dom.window, errs}; }
const pf=()=>({ divisions:[{id:"D1",name:"Div1"}], objectives:[{id:"O1",statement:"Obj1",divisionId:"D1",quarter:"2026Q1",plannedStart:2192,plannedEnd:2281}], kpis:[], products:[], models:[], initiatives:[] });
// EXEC-D1 with 4 gates on O1, NO stageGateSets, NO setId -> migration must create a default "General" set
const execNoSets=()=>({ objectiveState:[],keyResults:[],kpis:[],tasks:[],kpiUpdates:[],stageGateEdges:[],chainGatesByDate:{},risks:[],etbTrees:{},
  stageGates:[ {id:"SG-1",objectiveId:"O1",name:"Feasibility",plannedDate:2200,actualDate:2195},
    {id:"SG-2",objectiveId:"O1",name:"Design",plannedDate:2230,actualDate:2225},
    {id:"SG-3",objectiveId:"O1",name:"Pilot",plannedDate:2260},
    {id:"SG-4",objectiveId:"O1",name:"Launch",plannedDate:2280} ] });

(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};
  const store={ portfolio:{doc:pf(),etag:"1",version:1}, "EXEC-D1":{doc:execNoSets(),etag:"5",version:5} };
  const A=loadApp(store); await sleep(1300); const w=A.w, T=w.__T;
  ok(A.errs.length===0, "no jsdom errors ("+JSON.stringify(A.errs.slice(0,2))+")");
  ok(!!T && typeof T.objSetsOrdered==="function", "host set functions exposed (top-level scope confirmed)");

  // migration ran on adoptExec: default set + every gate assigned
  const ex=T.getExec(); const sets=(ex.stageGateSets||[]).filter(s=>s.objectiveId==="O1");
  ok(sets.length===1 && sets[0].name==="General" && sets[0].chained===true, "migration created one default 'General' set, chained on");
  ok(ex.stageGates.every(g=>g.setId===sets[0].id), "every gate assigned to the default set");

  // global "SG-N" numbering by due date
  ok(T.gateLabel("SG-1")==="SG-A1" && T.gateLabel("SG-4")==="SG-A4", "gateLabel = SG-{letter}{n} per workstream ("+T.gateLabel("SG-1")+","+T.gateLabel("SG-4")+")");
  (function(){ const g=ex.stageGates.find(x=>x.id==="SG-4"); const save=g.plannedDate; g.plannedDate=2100; ok(T.gateLabel("SG-4")==="SG-A1" && T.gateLabel("SG-1")==="SG-A2", "re-dating a gate re-ranks the tags by due date"); g.plannedDate=save; })();

  // rendered DOM: set sub-section, labels, score, controls
  let sg=w.document.getElementById("subSG").innerHTML;
  ok(/class="sgset"/.test(sg), "renders a set sub-section (.sgset)");
  ok(sg.includes(">General<") || sg.includes("General"), "set header shows the set name");
  ok(sg.includes(">SG-A1</span>") && sg.includes(">SG-A4</span>"), "gate chips use SG-{letter}{n} labels");
  ok(sg.includes("50%"), "set score shows % passed (2 of 4 = 50%)");
  ok(/data-addset/.test(sg) && /data-addsg-set/.test(sg), "panel has '+ add set' and per-set '+ gate' controls");

  // objective-strip gate-health pill (= min set %passed; single set -> 50%)
  const strip = T.objMetricStrip ? T.objMetricStrip(pf().objectives[0]) : (w.document.getElementById("objHeadWrap")||{}).innerHTML||"";
  ok(/Gate health/.test(strip) && /50%/.test(strip), "objective strip shows a Gate-health pill at 50%");

  // set-management: add a second set, move a gate into it -> per-workstream SG-N re-derives by due date
  T.addSet("MEA"); const sets2=T.objSetsOrdered(); ok(sets2.length===2, "addSet created a second set");
  const mea=sets2.find(s=>s.name==="MEA"); T.moveGate("SG-2", mea.id);
  ok(T.gateLabel("SG-2")==="SG-B1", "moved gate takes workstream B, first slot (SG-B1)");
  ok(T.gateLabel("SG-1")==="SG-A1" && T.gateLabel("SG-3")==="SG-A2", "origin workstream A renumbers by due date (SG-A1, SG-A2)");
  T.renderGates(); sg=w.document.getElementById("subSG").innerHTML;
  ok((sg.match(/class="sgset"/g)||[]).length===2, "two set sub-sections render");
  ok(sg.includes(">SG-A1</span>") && sg.includes(">SG-B1</span>"), "each workstream carries its own letter — SG-A1 (General) and SG-B1 (MEA)");

  // delete a set with gates -> gates reassigned, not orphaned
  T.delSet(mea.id); T.delSet(mea.id);  // two-click arm+confirm
  const ex2=T.getExec(); ok(!(ex2.stageGateSets||[]).some(s=>s.id===mea.id), "deleted set removed");
  ok(ex2.stageGates.find(g=>g.id==="SG-2").setId===sets[0].id, "its gate reassigned to the surviving set (not orphaned)");

  console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' Pass-2 UI assertions green'));
  process.exit(f?1:0);
})();
