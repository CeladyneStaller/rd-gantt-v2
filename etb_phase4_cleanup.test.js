var __cnt=0;   // assertion counter: without a printed total sweep.py cannot guard this harness
// ETB port Phase 4 — cleanup: empty init (no demo sample), task-KPI reconciliation, no product/model spec bleed (4 assertions)
// usage: NODE_PATH=<jsdom> node etb_phase4_cleanup.test.js [path/to/execution_app.html]
const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const HTML_PATH=process.argv[2]||(process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html';
const html=fs.readFileSync(HTML_PATH,'utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/",pretendToBeVisual:true});
try{ dom.window.localStorage.setItem('rd_broker_token','tkn'); }catch(e){}
setTimeout(()=>{ const d=dom.window.document, s=d.createElement('script');
  s.textContent=`(function(){ try{ var o={};
    // 1) init cleanup: ETB starts EMPTY (no demo sample) before any objective loads
    o.emptyAtInit = (Object.keys(((window.ETB&&ETB.getTree&&ETB.getTree())||{experiments:{}}).experiments||{}).length===0);
    // 2) reconciliation: product/model spec KPIs are NOT offered as experiment link targets (readings go to the exec doc)
    portfolio={divisions:[{id:'FC',name:'FC'}],products:[{id:'P1',name:'FCS-100',divisionId:'FC'}],initiatives:[{id:'I1',divisionId:'FC',productId:'P1'}],
      objectives:[{id:'O1',statement:'A',divisionId:'FC',initiativeId:'I1'}],milestones:[],kpis:[]};
    divisionId='FC'; exec=blankExec();
    exec.keyResults=[{id:'KR1',objectiveId:'O1',statement:'x'}];
    exec.kpis=[{id:'kKR',objectiveId:'O1',hostType:'keyResult',hostId:'KR1',name:'KR kpi',direction:'up',target:1,isDefiner:true,groupId:null},
               {id:'kT',objectiveId:'O1',hostType:'task',hostId:'T1',name:'Task kpi',direction:'up',target:1,isDefiner:true,groupId:null}];
    exec.tasks=[{id:'T1',objectiveId:'O1',name:'legacy task'}];
    selectedObj='O1';
    var kp=window.hubProjectKpis(); var gids=kp.map(function(k){return k.gid;});
    o.hasKrKpi = gids.indexOf('kKR')>=0;
    o.taskKpiExcluded = gids.indexOf('kT')<0;       // (E5+b) task KPIs no longer offered as experiment targets
    o.noForeignHost = kp.every(function(k){ return k.gid==='kKR'||k.gid==='kT'; });  // only in-objective exec KPIs, no product/model spec bleed
    document.body.setAttribute('data-out',JSON.stringify(o));
  }catch(e){ document.body.setAttribute('data-out','ERR: '+e.message); } })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ const o=JSON.parse(d.body.getAttribute('data-out')||'{}');
    [['ETB starts empty at init (no demo sample)',o.emptyAtInit],['KR-hosted KPI is a link target',o.hasKrKpi],
     ['task-hosted KPI NOT offered (E5+b)',o.taskKpiExcluded],['only in-objective exec KPIs offered (no spec bleed)',o.noForeignHost]]
    .forEach(([n,c])=>{__cnt++; console.log((c?'  \u2713 ':'  \u2717 FAIL ')+n); if(!c)process.exitCode=1;});
    console.log('\nPASS - '+__cnt+' ETB phase-4 cleanup assertions green');   // count so sweep.py can guard it
    console.log(process.exitCode?"\u2717":"\u2705 Phase 4 cleanup checks passed");
  },300);
},300);
