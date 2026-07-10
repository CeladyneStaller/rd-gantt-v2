// P3: the planning app reflects delay propagation (Phase 0) — Gantt gate diamonds move to their propagated
// gateEffective, the objective bar slips, and the overview tile shows +Nd slip / Nd faster possible.
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
  td:function(){return todayDay();}, iso:function(d){return dayToIso(d);},
  renderG:function(){try{renderGantt();return document.getElementById('ganttWrap').innerHTML;}catch(e){return 'ERR:'+e.message;}},
  objTile:function(id){try{var em=pfMap(),pool=poolOf(em),casc=RD.cascade(portfolio,em,todayDay());var o=portfolio.objectives.find(function(x){return x.id===id;});return ovObjTile(o,em,pool,casc);}catch(e){return 'ERR:'+e.message;}} };`;
for(const sc of [...w.document.querySelectorAll('script:not([src])')]){ let code=sc.textContent; if(code.includes('function groupedTreeHtml')) code=code+hook; try{ w.eval(code); }catch(e){ console.error('EVAL ERROR:',e.message); process.exit(1);} }
const T=w.__t; if(!T){ console.error('hook not installed'); process.exit(1); }
const TD=T.td();

const P=T.blank();
P.divisions=[{id:'D1',name:'FC',order:0}];
P.initiatives=[{id:'I1',name:'I',divisionId:'D1',plannedStart:TD-40,plannedEnd:TD+70,order:0}];
P.objectives=[
  {id:'O1',statement:'Delay obj',divisionId:'D1',initiativeId:'I1',quarter:'2026Q1',milestoneIds:[],plannedStart:TD-40,plannedEnd:TD+70,order:0},
  {id:'O2',statement:'Accel obj',divisionId:'D1',initiativeId:'I1',quarter:'2026Q1',milestoneIds:[],plannedStart:TD-10,plannedEnd:TD+40,order:1}];
T.setP(P);
T.setExec({ "EXEC-D1":{
  keyResults:[],
  stageGates:[
    {id:'g1',objectiveId:'O1',setId:'SA',name:'Freeze',plannedDate:TD-30,actualDate:TD},    // 30 late
    {id:'g2',objectiveId:'O1',setId:'SA',name:'Fab',plannedDate:TD+20},                      // pushed +30 -> eff TD+50
    {id:'g3',objectiveId:'O1',setId:'SA',name:'Test',plannedDate:TD+70},                     // pushed +30 -> eff TD+100
    {id:'h1',objectiveId:'O2',setId:'SB',name:'Load',plannedDate:TD-10,actualDate:TD-40},    // 30 early
    {id:'h2',objectiveId:'O2',setId:'SB',name:'Cost',plannedDate:TD+40} ],                   // accel 30
  stageGateSets:[ {id:'SA',objectiveId:'O1',name:'Qual',order:0,chained:true}, {id:'SB',objectiveId:'O2',name:'Cost',order:1,chained:true} ],
  kpis:[],tasks:[],kpiUpdates:[],stageGateEdges:[] } });

let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};
const G=T.renderG();
ok(G.indexOf('ERR:')!==0, "Gantt rendered");
// propagation in the Gantt: g2 diamond sits at its propagated forecast (planned TD+20 -> eff TD+50)
ok(G.indexOf('forecast '+T.iso(TD+50))>=0, "Gantt: pushed gate g2 diamond at propagated forecast "+T.iso(TD+50)+" (+30d)");
ok(G.indexOf('forecast '+T.iso(TD+100))>=0, "Gantt: pushed gate g3 diamond at propagated forecast "+T.iso(TD+100)+" (+30d)");
ok((G.match(/· forecast /g)||[]).length>=3, "Gantt: late + both pushed gates all show forecast tooltips");
ok(/class="gslip"/.test(G), "Gantt: objective O1 bar draws a slip extension");

// overview tile chips
const t1=T.objTile('O1'), t2=T.objTile('O2');
ok(/\+30d slip/.test(t1), "overview tile O1 shows '+30d slip' (objective shifted by propagation)");
ok(/ov-slip/.test(t1), "O1 slip uses the ov-slip (red) class");
ok(/30d faster possible/.test(t2), "overview tile O2 shows '30d faster possible' (acceleration)");
ok(/ov-accel/.test(t2), "O2 acceleration uses the ov-accel (green) class");
ok(!/slip/.test(t2), "O2 shows no slip (it is on plan)");

console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' P3 planning-app propagation + tile assertions green'));
process.exit(f?1:0);
