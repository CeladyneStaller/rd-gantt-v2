const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
let html=fs.readFileSync('/mnt/user-data/outputs/execution_app.html','utf8');
html=html.replace("\ninit();\n\n})();",
 "\ninit(); window.__H={ get tree(){return state.tree;}, apid:function(){return state.activeProjectId;}, softRefresh:softRefresh, addExp:function(){return addExperiment(state.tree,{});}, hasCreds:function(){try{return ETB.hasCreds();}catch(e){return 'ERR:'+e.message;}}, execTrees:function(){try{return JSON.parse(JSON.stringify((typeof exec!=='undefined'&&exec&&exec.etbTrees)||{}));}catch(e){return {err:e.message};}} };\n\n})();");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function makeFetch(store,putLog,delay){ delay=delay||{}; return function(url,opts){ opts=opts||{}; const m=/\/state\/([^/?]+)/.exec(String(url)); const id=m?decodeURIComponent(m[1]):null;
  if((opts.method||"GET").toUpperCase()==="PUT"){ let body={}; try{body=JSON.parse(opts.body);}catch(e){} const prev=store[id]; const ver=(prev?prev.version:0)+1; store[id]={doc:body.doc,etag:String(ver),version:ver}; putLog.push({id,doc:body.doc}); return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({etag:String(ver),version:ver})}); }
  const mk=()=> store[id]?{ok:true,status:200,json:()=>Promise.resolve({doc:store[id].doc,etag:store[id].etag,version:store[id].version})}:{ok:false,status:404,json:()=>Promise.resolve(null)};
  const d=delay[id]||0; if(d>0) return new Promise(r=>setTimeout(()=>r(mk()),d)); return Promise.resolve(mk()); }; }
function loadApp(store,putLog,delay){
  const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push((e&&e.message||String(e)).split("\n")[0]));
  const dom=new JSDOM(html,{ runScripts:"dangerously", url:"https://localhost/?token=tok", pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(w){ w.fetch=makeFetch(store,putLog,delay); if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; } });
  return {w:dom.window, errs};
}
(async()=>{
  let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};
  const pf=()=>({ divisions:[{id:"D1",name:"Div1"}], objectives:[{id:"O1",statement:"Obj1",divisionId:"D1",quarter:"2026Q1",plannedStart:2192,plannedEnd:2281}], kpis:[], products:[], models:[], initiatives:[] });
  const priorExec=()=>({ objectiveState:[],keyResults:[],kpis:[],stageGates:[],tasks:[],kpiUpdates:[],stageGateEdges:[],chainGatesByDate:{},risks:[], etbTrees:{ O1:{ project_id:"O1", experiments:{ "X-1":{id:"X-1",code:"E1",name:"prior work",status:"planned",key_reads:[],possible_results:[],audit_log:[]} }, root_experiment_id:"X-1" } } });
  const nonEtbPuts=pl=>pl.filter(p=>p.id!=="EXEC-D1"&&p.id!=="portfolio");

  // A) a user edit persists INTO EXEC-D1.doc.etbTrees (divisional bin) and round-trips; ETB-D1 is never written
  { const store={ portfolio:{doc:pf(),etag:"1",version:1} }; const putLog=[];
    const A=loadApp(store,putLog,{}); await sleep(900);
    ok(A.w.__H&&A.w.__H.hasCreds()===true, "A: hasCreds true");
    const eid=A.w.__H.addExp(); A.w.__H.softRefresh(); await sleep(2600);   // host persist() debounce
    ok(nonEtbPuts(putLog).length===0, "A: NO write to any ETB-<div> bin ("+JSON.stringify(nonEtbPuts(putLog).map(p=>p.id))+")");
    const exdoc=store["EXEC-D1"]&&store["EXEC-D1"].doc;
    ok(exdoc&&exdoc.etbTrees&&exdoc.etbTrees.O1&&exdoc.etbTrees.O1.experiments&&exdoc.etbTrees.O1.experiments[eid], "A: experiment saved into EXEC-D1.doc.etbTrees.O1 (divisional bin)");
    const B=loadApp(store,putLog,{}); await sleep(900);
    ok(B.w.__H&&B.w.__H.tree&&B.w.__H.tree.experiments&&B.w.__H.tree.experiments[eid], "A: experiment round-trips after reload from EXEC-D1"); }

  // B) fast load, pre-seeded in the divisional bin: tree loads, no unsolicited/ETB-bin writes
  { const store={ portfolio:{doc:pf(),etag:"1",version:1}, "EXEC-D1":{doc:priorExec(),etag:"5",version:5} }; const putLog=[];
    const w=loadApp(store,putLog,{}); await sleep(1600);
    ok(w.w.__H.tree&&w.w.__H.tree.experiments&&w.w.__H.tree.experiments["X-1"], "B: prior tree loaded from EXEC-D1.etbTrees into view");
    ok(nonEtbPuts(putLog).length===0, "B: NO ETB-<div> writes on load");
    ok(store["EXEC-D1"].doc.etbTrees.O1.experiments["X-1"], "B: prior tree preserved in divisional bin"); }

  // C) SLOW load, pre-seeded: no clobber of the divisional bin
  { const store={ portfolio:{doc:pf(),etag:"1",version:1}, "EXEC-D1":{doc:priorExec(),etag:"5",version:5} }; const putLog=[];
    loadApp(store,putLog,{"EXEC-D1":800,"portfolio":300}); await sleep(2600);
    ok(nonEtbPuts(putLog).length===0, "C: NO ETB-<div> writes on slow load");
    const o1=store["EXEC-D1"].doc.etbTrees.O1;
    ok(o1&&o1.experiments&&o1.experiments["X-1"], "C: prior experiment SURVIVES a slow load in the divisional bin"); }

  console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' assertions green — ETB persists THROUGH the divisional exec bin'));
  process.exit(f?1:0);
})();
