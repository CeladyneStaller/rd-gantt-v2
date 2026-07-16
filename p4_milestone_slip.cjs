// P4: the delay cascade reaches MILESTONES in the planning app — a gate slip -> objective projEnd ->
// milestoneEffective, surfaced as slip in the milestone reporting table and the Active-section milestone tile.
const {JSDOM}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"outside-only", pretendToBeVisual:true, url:"https://localhost/"});
const w=dom.window;
w.fetch=()=>new Promise(()=>{});
if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
if(!w.requestAnimationFrame) w.requestAnimationFrame=cb=>setTimeout(cb,0);
if(!w.cancelAnimationFrame) w.cancelAnimationFrame=()=>{};
const hook=`\n;window.__t={ setP:function(p){portfolio=p;}, blank:function(){return blankPortfolio();},
  setExec:function(m){Object.keys(m).forEach(function(k){execDocs[k]=m[k];});},
  td:function(){return todayDay();}, iso:function(d){return dayToIso(d);},
  renderMs:function(){try{renderMilestones();return document.getElementById('msBody').innerHTML;}catch(e){return 'ERR:'+e.message;}},
  msTile:function(id){try{var em=pfMap(),pool=poolOf(em),casc=RD.cascade(portfolio,em,todayDay());var m=portfolio.milestones.find(function(x){return x.id===id;});return ovMsTile(m,em,pool,casc);}catch(e){return 'ERR:'+e.message;}} };`;
for(const sc of [...w.document.querySelectorAll('script:not([src])')]){ let code=sc.textContent; if(code.includes('function groupedTreeHtml')) code=code+hook; try{ w.eval(code); }catch(e){ console.error('EVAL ERROR:',e.message); process.exit(1);} }
const T=w.__t; if(!T){ console.error('hook not installed'); process.exit(1); }
const TD=T.td();

const P=T.blank();
P.divisions=[{id:'D1',name:'FC',order:0}];
P.initiatives=[{id:'I1',name:'I',divisionId:'D1',plannedStart:TD-40,plannedEnd:TD+70,order:0}];
P.objectives=[{id:'O1',statement:'Obj',divisionId:'D1',initiativeId:'I1',quarter:'2026Q1',milestoneIds:['M1'],plannedStart:TD-40,plannedEnd:TD+70,order:0}];
P.milestones=[{id:'M1',name:'Alpha ship',initiativeId:'I1',plannedDate:TD+70,order:0}];
T.setP(P);
T.setExec({ "EXEC-D1":{ keyResults:[],
  stageGates:[
    {id:'g1',objectiveId:'O1',setId:'SA',name:'Freeze',plannedDate:TD-30,actualDate:TD},  // 30 late
    {id:'g2',objectiveId:'O1',setId:'SA',name:'Fab',plannedDate:TD+20},
    {id:'g3',objectiveId:'O1',setId:'SA',name:'Test',plannedDate:TD+70} ],
  stageGateSets:[ {id:'SA',objectiveId:'O1',name:'Qual',order:0,chained:true} ],
  kpis:[],tasks:[],kpiUpdates:[],stageGateEdges:[] } });

let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};
const EFF=T.iso(TD+100);  // O1 projEnd = TD+100 (g3 pushed +30); M1 planned TD+70 -> effective TD+100, slip 30

const tbl=T.renderMs();
ok(tbl.indexOf('ERR:')!==0, "milestone report rendered");
ok(tbl.indexOf(EFF)>=0, "report Effective column shows the propagated milestone date "+EFF);
ok(/ms-slip/.test(tbl) && /\+30d/.test(tbl), "report shows a +30d milestone slip badge");

const tile=T.msTile('M1');
ok(tile.indexOf('ERR:')!==0, "milestone tile rendered ("+tile.slice(0,40)+")");
ok(tile.indexOf('Est '+EFF)>=0, "tile shows forecast 'Est "+EFF+"' (not just planned Due)");
ok(/ov-slip/.test(tile) && /\+30d slip/.test(tile), "tile shows '+30d slip'");

console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' P4 milestone-slip assertions green'));
process.exit(f?1:0);
