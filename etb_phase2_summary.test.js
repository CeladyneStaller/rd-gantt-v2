// ETB port Phase 2 — current-step summary, result auto-matcher, outcome recorder advances reachability, graph fallback (15 assertions)
// usage: NODE_PATH=<jsdom> node etb_phase2_summary.test.js [path/to/execution_app.html]
const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const HTML_PATH=process.argv[2]||'/mnt/user-data/outputs/execution_app.html';
const html=fs.readFileSync(HTML_PATH,'utf8');
const errs=[]; const vc=new VirtualConsole(); vc.on("jsdomError",e=>{ if(!/fetch|network|broker|Failed to|cytoscape|Graph library/i.test(e.message)) errs.push(e.message); });
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:vc,url:"https://x.test/",pretendToBeVisual:true});
try{ dom.window.localStorage.setItem('rd_broker_token','tkn'); }catch(e){}
setTimeout(()=>{ const d=dom.window.document, s=d.createElement('script');
  s.textContent=`(async function(){ try{ var o={};
    portfolio={divisions:[{id:'FC',name:'Fuel Cells'}],products:[{id:'P1',name:'FCS-100',divisionId:'FC'}],initiatives:[{id:'I1',divisionId:'FC',productId:'P1'}],objectives:[{id:'O1',statement:'Alpha',divisionId:'FC',initiativeId:'I1',quarter:'2026Q3',plannedStart:20000,plannedEnd:20090}],milestones:[],kpis:[]};
    divisionId='FC'; exec=blankExec(); fillObjSelect();
    var TREE={ project_id:'O1', root_experiment_id:'exp_001', experiments:{
      exp_001:{ id:'exp_001', code:'E1', name:'Membrane screen', status:'planned', hypothesis:'Thinner membrane raises power density',
        key_reads:[{id:'kr1', name:'Power density', unit:'W/cm2', critical_value:1.0, direction:'>='}],
        possible_results:[ {id:'res_a', label:'Meets target', criteria:[{key_read_id:'kr1', status:'hit'}], next_experiment_ids:['exp_002'], terminal:null},
                           {id:'res_b', label:'Below target', criteria:[{key_read_id:'kr1', status:'miss'}], next_experiment_ids:[], terminal:{type:'dead_end'}} ],
        actual_outcome:null, audit_log:[] },
      exp_002:{ id:'exp_002', code:'E2', name:'Durability soak', status:'planned', key_reads:[], possible_results:[], actual_outcome:null, audit_log:[] }
    }};
    apiGet = async function(id){ if(id.indexOf('ETB-')===0) return { doc:{ trees:{ 'O1':TREE }, meta:{} }, etag:'e1', version:2 }; return null; };
    apiPut = async function(id,doc,etag){ return { etag:'e2', version:3 }; };
    etbSyncObjective(); await etbLoadForDivision(); renderExpSummary();
    // 1) summary shows the current experiment
    var sum=document.getElementById('expSummary').innerHTML;
    o.summaryShowsCurrent = /Membrane screen/.test(sum) && /Current step/.test(sum);
    o.summaryShowsKeyread = /Power density/.test(sum);
    o.graphFallback = /cy-msg|Graph (library|unavailable)/i.test(document.getElementById('expSummary').innerHTML);
    // 2) matcher auto-selects from measured values
    var exp=ETB.experimentById('exp_001');
    o.matchHit = (etbMatchResults(exp,{kr1:1.2}).matched.join(',')==='res_a');
    o.matchMiss = (etbMatchResults(exp,{kr1:0.6}).matched.join(',')==='res_b');
    o.matchPending = (etbMatchResults(exp,{}).complete===false);
    // 3) recorder DOM: open, enter value, auto-eval checks the matched radio, record advances reachability
    openExpRecorder('exp_001');
    var body=document.getElementById('expRecBody').innerHTML;
    o.recorderHasKeyread = /data-kr="kr1"/.test(body);
    o.recorderHasResults = /value="res_a"/.test(body) && /value="res_b"/.test(body);
    var inp=document.querySelector('#expRecBody .erk-input[data-kr="kr1"]'); inp.value='1.2'; expRecEval();
    o.autoChecked = document.querySelector('#expRecBody input[value="res_a"]').checked===true;
    o.recordEnabled = document.getElementById('erRecord').disabled===false;
    recordExpOutcome();
    // after recording res_a → exp_002 becomes the current experiment
    var cur=ETB.currentExperiments().map(function(e){return e.id;});
    o.advanced = (cur.join(',')==='exp_002');
    o.exp1Complete = (ETB.experimentById('exp_001').status==='complete');
    renderExpSummary();
    o.summaryAdvanced = /Durability soak/.test(document.getElementById('expSummary').innerHTML);
    // 4) Phase-1 regression
    o.etbMounted = !!document.getElementById('etb-view') && !!document.getElementById('etb-view').closest('#subEXP');
    renderAll(); o.tasksIntact = /Execution tasks/.test(document.getElementById('subTASK').innerHTML);
    document.body.setAttribute('data-out',JSON.stringify(o));
  }catch(e){document.body.setAttribute('data-err',(e&&e.message)+' @ '+((e&&e.stack)||'').split('\\n').slice(1,4).join(' | '));} })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ if(errs.length)console.log('load errors:',errs.join(' | '));
    const err=d.body.getAttribute('data-err'); if(err){console.log('RUNTIME:',err);process.exitCode=1;return;}
    const o=JSON.parse(d.body.getAttribute('data-out')||'{}');
    [['summary shows the current experiment + header',o.summaryShowsCurrent],['summary lists the key-read + target',o.summaryShowsKeyread],
     ['focused-graph fallback renders (no Cytoscape)',o.graphFallback],['matcher: value \u2265 target \u2192 pass result',o.matchHit],
     ['matcher: value < target \u2192 fail result',o.matchMiss],['matcher: no values \u2192 pending',o.matchPending],
     ['recorder populates key-read input',o.recorderHasKeyread],['recorder populates result radios',o.recorderHasResults],
     ['entering a value auto-checks the matched result',o.autoChecked],['record button enables once a result is picked',o.recordEnabled],
     ['recording advances reachability to next experiment',o.advanced],['recorded experiment marked complete',o.exp1Complete],
     ['summary re-renders to the new current step',o.summaryAdvanced],['Phase-1: #etb-view still mounted',o.etbMounted],['Phase-1: tasks panel intact',o.tasksIntact]]
    .forEach(([n,c])=>{console.log((c?'  \u2713 ':'  \u2717 FAIL ')+n); if(!c)process.exitCode=1;});
    console.log("\\n"+(process.exitCode?"\u2717 some failed":"\u2705 ETB Phase 2 all passed"));
  },400);
},400);
