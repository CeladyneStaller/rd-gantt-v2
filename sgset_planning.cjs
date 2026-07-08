// Planning-app set-awareness: boots planning_app with an exec doc carrying 2 sets on O1, then checks the
// internal Gantt's set tier (objective -> set -> gates), tree grouping, SetLabel-N labels, and the overview
// gate-health chip. runScripts:outside-only + manual eval + a hook on the main script (fetch is a no-op here).
const {JSDOM}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync('/mnt/user-data/outputs/planning_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"outside-only", pretendToBeVisual:true, url:"https://localhost/"});
const w=dom.window;
w.fetch=()=>new Promise(()=>{});
if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
if(!w.requestAnimationFrame) w.requestAnimationFrame=cb=>setTimeout(cb,0);
if(!w.cancelAnimationFrame) w.cancelAnimationFrame=()=>{};

const hook=`\n;window.__t={ setP:function(p){portfolio=p;}, blank:function(){return blankPortfolio();},
  setExec:function(m){Object.keys(m).forEach(function(k){execDocs[k]=m[k];});},
  renderG:function(){try{renderGantt();return document.getElementById('ganttWrap').innerHTML;}catch(e){return 'ERR:'+e.message;}},
  treeHtml:function(id){try{return objectiveExecHtml(id);}catch(e){return 'ERR:'+e.message;}},
  overviewDots:function(id){try{return activeKrDots(byId('objective',id), pfMap());}catch(e){return 'ERR:'+e.message;}},
  gateLabel:function(g){try{return ganttGateLabel(g);}catch(e){return 'ERR:'+e.message;}} };`;
const scripts=[...w.document.querySelectorAll('script:not([src])')];
for(const sc of scripts){ let code=sc.textContent; if(code.includes('function groupedTreeHtml')) code=code+hook; try{ w.eval(code); }catch(e){ console.error('EVAL ERROR:',e.message); process.exit(1);} }
const T=w.__t; if(!T){ console.error('hook not installed'); process.exit(1); }

const P=T.blank();
P.divisions=[{id:'D1',name:'FuelCell',order:0}];
P.initiatives=[{id:'I1',name:'InitA',divisionId:'D1',plannedStart:2900,plannedEnd:3200,order:0}];
P.objectives=[{id:'O1',statement:'obj one',divisionId:'D1',initiativeId:'I1',quarter:'2026Q1',milestoneIds:[],plannedStart:2900,plannedEnd:3200,order:0}];
T.setP(P);
T.setExec({ "EXEC-D1":{
  keyResults:[{id:'KR-1',objectiveId:'O1',statement:'kr one'}],
  stageGates:[
    {id:'SG-1',objectiveId:'O1',setId:'SET-A',name:'Feasibility',plannedDate:3000,actualDate:2950},
    {id:'SG-2',objectiveId:'O1',setId:'SET-A',name:'Design',plannedDate:3100},
    {id:'SG-3',objectiveId:'O1',setId:'SET-B',name:'Rig build',plannedDate:3050} ],
  stageGateSets:[
    {id:'SET-A',objectiveId:'O1',name:'MEA',order:0,chained:true},
    {id:'SET-B',objectiveId:'O1',name:'Stack',order:1,chained:true} ],
  kpis:[],tasks:[],kpiUpdates:[],stageGateEdges:[] } });

let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};

// labels: SetLabel-N (index within the set)
ok(T.gateLabel({id:'SG-1',objectiveId:'O1'})==="MEA-1", "gateLabel SG-1 = MEA-1 ("+T.gateLabel({id:'SG-1',objectiveId:'O1'})+")");
ok(T.gateLabel({id:'SG-2',objectiveId:'O1'})==="MEA-2", "gateLabel SG-2 = MEA-2");
ok(T.gateLabel({id:'SG-3',objectiveId:'O1'})==="Stack-1", "gateLabel SG-3 = Stack-1");

// internal Gantt: set tier
const g=T.renderG();
ok(!g.startsWith('ERR:'), "renderGantt ran ("+g.slice(0,50)+")");
ok(g.includes("MEA") && g.includes("Stack"), "Gantt renders both set swimlane rows (MEA, Stack)");
ok(g.includes("MEA-1") && g.includes("MEA-2") && g.includes("Stack-1"), "Gantt gate rows use SetLabel-N");
ok(g.includes("gsetbar"), "set roll-up bar rendered (.gsetbar)");
ok(g.includes("gsetnum"), "gate label prefix rendered (.gsetnum)");

// Portfolio tree: gates grouped under set headers
const t=T.treeHtml('O1');
ok(!t.startsWith('ERR:'), "objectiveExecHtml ran");
ok((t.match(/tsethead/g)||[]).length===2, "two set sub-headers in the tree");
ok(t.includes("MEA-1") && t.includes("MEA-2") && t.includes("Stack-1"), "tree gate leaves labeled per set");
ok(t.indexOf("KR")>=0 && t.indexOf("KR")<t.indexOf("MEA"), "KRs listed before the set groups");

// Overview: gate-health chip = min set % passed = min(MEA 50, Stack 0) = 0%
const ov=T.overviewDots('O1');
ok(!ov.startsWith('ERR:'), "activeKrDots ran");
ok(ov.includes("health") && ov.includes("0%"), "overview gate-health chip = weakest set % passed (min(50,0)=0%)");

console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' planning-app set assertions green'));
process.exit(f?1:0);
