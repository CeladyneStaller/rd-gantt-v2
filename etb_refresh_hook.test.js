// ETB port — current-step panel refresh hook: ETB-internal edits (renderAll/softRefresh) fire window.__etbOnChange -> renderExpSummary (4 assertions)
// usage: NODE_PATH=<jsdom> node etb_refresh_hook.test.js [path/to/execution_app.html]
const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const HTML_PATH=process.argv[2]||'/mnt/user-data/outputs/execution_app.html';
const html=fs.readFileSync(HTML_PATH,'utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/",pretendToBeVisual:true});
try{ dom.window.localStorage.setItem('rd_broker_token','t'); }catch(e){}
setTimeout(()=>{ const d=dom.window.document, s=d.createElement('script');
  s.textContent=`(async function(){ try{ var o={};
    portfolio={divisions:[{id:'FC',name:'FC'}],products:[{id:'P1',name:'X',divisionId:'FC'}],initiatives:[{id:'I1',divisionId:'FC',productId:'P1'}],objectives:[{id:'O1',statement:'A',divisionId:'FC',initiativeId:'I1',plannedStart:20000,plannedEnd:20090}],milestones:[],kpis:[]};
    divisionId='FC'; exec=blankExec(); fillObjSelect();
    exec.etbTrees={O1:{project_id:'O1',root_experiment_id:'exp_001',experiments:{
      exp_001:{id:'exp_001',code:'E1',name:'FirstExp',status:'planned',key_reads:[],possible_results:[{id:'res_a',label:'go',criteria:[],next_experiment_ids:['exp_002'],terminal:null}],actual_outcome:null,audit_log:[]},
      exp_002:{id:'exp_002',code:'E2',name:'SecondExp',status:'planned',key_reads:[],possible_results:[],actual_outcome:null,audit_log:[]}
    }}};   // migrated model: seed the tree in the exec doc
    apiGet=async function(id){ return null; };
    apiPut=async function(){ return {etag:'e2',version:2}; };
    etbSyncObjective(); await etbLoadForDivision(); renderAll();
    o.hookSet = (typeof window.__etbOnChange==='function');
    o.showsFirst = /FirstExp/.test(document.getElementById('expSummary').innerHTML);
    // record an outcome DIRECTLY via the ETB (as its own editor/drawer would) — NO app renderAll/renderExpSummary here
    window.ETB.recordOutcomeFor('exp_001', {result_id:'res_a', key_read_values:{}});
    // the ETB's softRefresh should have fired __etbOnChange -> renderExpSummary; panel now reflects the advance
    o.refreshedToSecond = /SecondExp/.test(document.getElementById('expSummary').innerHTML);
    o.firstGone = !/FirstExp/.test(document.getElementById('expSummary').innerHTML);
    document.body.setAttribute('data-out',JSON.stringify(o));
  }catch(e){ document.body.setAttribute('data-out','ERR: '+e.message); } })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ const o=JSON.parse(d.body.getAttribute('data-out')||'{}');
    [['__etbOnChange hook is registered',o.hookSet],['panel shows the first current experiment',o.showsFirst],
     ['ETB-internal record refreshes the panel (no renderAll)',o.refreshedToSecond],['advanced-past experiment no longer shown',o.firstGone]]
    .forEach(([n,c])=>{console.log((c?'  \u2713 ':'  \u2717 FAIL ')+n); if(!c)process.exitCode=1;});
    console.log(process.exitCode?"\u2717 still broken":"\u2705 current-step panel now refreshes on ETB edits");
  },300);
},400);
