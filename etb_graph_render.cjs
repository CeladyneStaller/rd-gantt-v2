// Proves the graph view builds cy on the INITIAL render (load) and on the FIRST experiment,
// instead of staying empty until a tab toggle. cytoscape is CDN-loaded (absent in sandbox),
// so we mock it to count constructions. Before the fix, renderAll's `cy && ...` guard meant
// cy was never created until showView() ran; now it builds whenever the graph view is visible.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
let html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
html=html.replace("\ninit();\n\n})();",
 "\ninit(); window.__H={ addExp:function(){return addExperiment(state.tree,{});}, softRefresh:softRefresh, graphHidden:function(){return $('#view-graph').hidden;}, cyExists:function(){return !!cy;} };\n\n})();");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function mockCy(w){ w.__cyCreated=0; w.cytoscape=function(opts){ w.__cyCreated++; w.__cyEls=(opts&&opts.elements)?opts.elements.length:0; return {
  on:function(){}, ready:function(cb){ if(typeof cb==="function"){ try{cb();}catch(e){} } }, fit:function(){}, resize:function(){}, destroy:function(){},
  getElementById:function(){ return {length:0, select:function(){}}; }, zoom:function(){return 1;}, width:function(){return 800;}, height:function(){return 560;},
  layout:function(){ return {run:function(){}}; }, elements:function(){ return {length:0}; } }; }; }
function makeFetch(store){ return function(url,opts){ opts=opts||{}; const m=/\/state\/([^/?]+)/.exec(String(url)); const id=m?decodeURIComponent(m[1]):null;
  if((opts.method||"GET").toUpperCase()==="PUT"){ let b={}; try{b=JSON.parse(opts.body);}catch(e){} const pv=store[id]?store[id].version:0; store[id]={doc:b.doc,etag:String(pv+1),version:pv+1}; return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({etag:String(pv+1),version:pv+1})}); }
  return Promise.resolve(store[id]?{ok:true,status:200,json:()=>Promise.resolve({doc:store[id].doc,etag:store[id].etag,version:store[id].version})}:{ok:false,status:404,json:()=>Promise.resolve(null)}); }; }
function loadApp(store){ const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push((e&&e.message||String(e)).split("\n")[0]));
  const dom=new JSDOM(html,{ runScripts:"dangerously", url:"https://localhost/?token=tok", pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(w){ w.fetch=makeFetch(store); mockCy(w); if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; } });
  return {w:dom.window, errs}; }
const pf=()=>({ divisions:[{id:"D1",name:"Div1"}], objectives:[{id:"O1",statement:"Obj1",divisionId:"D1",quarter:"2026Q1",plannedStart:2192,plannedEnd:2281}], kpis:[], products:[], models:[], initiatives:[] });
const execWithExp=()=>({ objectiveState:[],keyResults:[],kpis:[],stageGates:[],tasks:[],kpiUpdates:[],stageGateEdges:[],chainGatesByDate:{},risks:[], etbTrees:{ O1:{ project_id:"O1", experiments:{ "X-1":{id:"X-1",code:"E1",name:"seed",status:"planned",key_reads:[],possible_results:[],audit_log:[]} }, root_experiment_id:"X-1" } } });

(async()=>{
  let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};

  // 1) REFRESH with an existing tree: graph view is visible and cy is built on the initial render (no tab toggle)
  { const store={ portfolio:{doc:pf(),etag:"1",version:1}, "EXEC-D1":{doc:execWithExp(),etag:"5",version:5} };
    const A=loadApp(store); await sleep(1200);
    ok(A.errs.length===0, "1: no jsdom errors ("+JSON.stringify(A.errs.slice(0,2))+")");
    ok(A.w.__H.graphHidden()===false, "1: graph is the visible view on load");
    ok(A.w.__cyCreated>=1, "1: cy BUILT on initial render (was empty-until-toggle before) — count="+A.w.__cyCreated);
    ok(A.w.__H.cyExists()===true, "1: cy instance exists after load"); }

  // 2) FIRST experiment from an empty tree: adding builds/refreshes the graph without a tab toggle
  { const store={ portfolio:{doc:pf(),etag:"1",version:1} };   // no EXEC-D1 -> empty tree
    const B=loadApp(store); await sleep(1000);
    const beforeAdd=B.w.__cyCreated;                            // graph already builds once on load (empty tree)
    ok(beforeAdd>=1, "2: cy built on load even with an empty tree — count="+beforeAdd);
    B.w.__H.addExp(); B.w.__H.softRefresh(); await sleep(300);
    ok(B.w.__cyCreated>beforeAdd, "2: adding the FIRST experiment rebuilds the graph (no toggle needed) — "+beforeAdd+" -> "+B.w.__cyCreated);
    ok(B.w.__cyEls>0, "2: graph now contains node/edge elements after the first experiment"); }

  console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' graph-render assertions green — graph builds on load + first experiment'));
  process.exit(f?1:0);
})();
