var __cnt=0;   // assertion counter: without a printed total sweep.py cannot guard this harness
// ETB port Phase 3 — hubProjectKpis bridge, key-read reading posts to the objective KPI, KR rollup, decrease-KPI mapping (11 assertions)
// usage: NODE_PATH=<jsdom> node etb_phase3_kpi.test.js [path/to/execution_app.html]
const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const HTML_PATH=process.argv[2]||(process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html';
const html=fs.readFileSync(HTML_PATH,'utf8');
const errs=[]; const vc=new VirtualConsole(); vc.on("jsdomError",e=>{ if(!/fetch|network|broker|Failed to|cytoscape|Graph library/i.test(e.message)) errs.push(e.message); });
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:vc,url:"https://x.test/",pretendToBeVisual:true});
try{ dom.window.localStorage.setItem('rd_broker_token','tkn'); }catch(e){}
setTimeout(()=>{ const d=dom.window.document, s=d.createElement('script');
  s.textContent=`(async function(){ try{ var o={};
    portfolio={divisions:[{id:'FC',name:'Fuel Cells'}],products:[{id:'P1',name:'FCS-100',divisionId:'FC'}],initiatives:[{id:'I1',divisionId:'FC',productId:'P1'}],
      objectives:[{id:'O1',statement:'Alpha',divisionId:'FC',initiativeId:'I1',quarter:'2026Q3',plannedStart:20000,plannedEnd:20090}],milestones:[],kpis:[]};
    divisionId='FC'; exec=blankExec();
    exec.keyResults=[{id:'KR1',objectiveId:'O1',statement:'Hit power density'}];
    exec.kpis=[{id:'kpi1',objectiveId:'O1',hostType:'keyResult',hostId:'KR1',name:'Power density',direction:'up',target:1.0,unit:'W/cm2',isDefiner:true,groupId:null},{id:'kpi2',objectiveId:'O1',hostType:'keyResult',hostId:'KR1',name:'Cost',direction:'down',target:5,unit:'usd',isDefiner:true,groupId:null}];
    fillObjSelect();
    var TREE={ project_id:'O1', root_experiment_id:'exp_001', experiments:{
      exp_001:{ id:'exp_001', code:'E1', name:'Membrane screen', status:'planned',
        key_reads:[ {id:'kr1', source_kpi_gid:'kpi1', name:'Power density', unit:'W/cm2', critical_value:1.0, direction:'>='},
                    {id:'kr2', name:'Scratch read', unit:'', critical_value:'', direction:'>='} ],
        possible_results:[ {id:'res_a', label:'Meets target', criteria:[{key_read_id:'kr1', status:'hit'}], next_experiment_ids:[], terminal:{type:'success'}} ],
        actual_outcome:null, audit_log:[] } }};
    exec.etbTrees={ 'O1':TREE };   // migrated model: trees live in the divisional exec doc; loadFromBin reads exec.etbTrees
    apiGet = async function(id){ return null; };
    apiPut = async function(id,doc,etag){ return { etag:'e2', version:3 }; };
    etbSyncObjective(); await etbLoadForDivision(); renderExpSummary();
    // 1) bridge: hubProjectKpis returns the objective's KPI in the ETB shape
    var kpis=window.hubProjectKpis();
    o.bridgeReturns = (kpis.length===2 && kpis.some(function(k){return k.gid==='kpi1';}));
    var k1=kpis.find(function(k){return k.gid==='kpi1';}), k2=kpis.find(function(k){return k.gid==='kpi2';});
    o.bridgeShape = (k1.name==='Power density' && k1.unit==='W/cm2' && k1.direction==='>=' && /KR1/.test(k1.label));
    o.downMapping = (k2 && k2.direction==='<=');
    // score before recording (no readings yet)
    var before = RD.keyResultScore('KR1', emForCore());
    o.scoreBeforeNull = (before==null || before===0);
    // 2) record an outcome: value on the linked read (kr1) + a value on the unlinked read (kr2)
    openExpRecorder('exp_001');
    document.querySelector('#expRecBody .erk-input[data-kr="kr1"]').value='1.5';
    var k2=document.querySelector('#expRecBody .erk-input[data-kr="kr2"]'); if(k2) k2.value='9';
    expRecEval();
    document.querySelector('#expRecBody input[value="res_a"]').checked=true; expRecSync();
    var beforeN=(exec.kpiUpdates||[]).length;
    recordExpOutcome();
    var ups=exec.kpiUpdates||[];
    // 3) exactly one reading written, for kpi1, value 1.5 — the unlinked read is ignored
    var mine=ups.filter(function(u){return u.note && u.note.indexOf('exp E1')>=0;});
    o.oneReading = (mine.length===1);
    o.readingForKpi1 = (mine.length===1 && mine[0].kpiId==='kpi1' && Number(mine[0].value)===1.5);
    o.unlinkedIgnored = !mine.some(function(u){return u.kpiId==='kr2';});
    // 4) rollup: the reading moves the score, but KR1 has a SECOND target (kpi2, cost) that nobody has read.
    //    Under g1' an unread target counts 0, so the KR is half done, not complete: mean(100, 0) = 50.
    var after = RD.keyResultScore('KR1', emForCore());
    o.rollupMoved = (after!=null && Math.abs(after-50)<1e-9);
    o.unreadTargetCounts = (RD.kpiScoreResolved(exec.kpis[0], allKpisPool(), emForCore())===100
                            && RD.kpiScoreResolved(exec.kpis[1], allKpisPool(), emForCore())===null);
    // 5) regression
    o.summaryOk = /Membrane screen|No current experiment/.test(document.getElementById('expSummary').innerHTML);
    renderAll(); o.tasksRetired=!(/Execution tasks/.test(document.getElementById('subTASK').innerHTML));
    o.etbMounted=!!document.getElementById('etb-view');
    document.body.setAttribute('data-out',JSON.stringify(o));
  }catch(e){document.body.setAttribute('data-err',(e&&e.message)+' @ '+((e&&e.stack)||'').split('\\n').slice(1,4).join(' | '));} })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ if(errs.length)console.log('load errors:',errs.join(' | '));
    const err=d.body.getAttribute('data-err'); if(err){console.log('RUNTIME:',err);process.exitCode=1;return;}
    const o=JSON.parse(d.body.getAttribute('data-out')||'{}');
    [['hubProjectKpis returns the objective KPI',o.bridgeReturns],['bridge shape: name/unit/direction/label',o.bridgeShape],['decrease KPI maps to <= operator',o.downMapping],
     ['KR score is empty before any reading',o.scoreBeforeNull],['recording writes exactly one reading',o.oneReading],
     ['reading is for the linked KPI at the measured value',o.readingForKpi1],['unlinked key-read is not posted',o.unlinkedIgnored],
     ['KR score rolls up to 50 — the reading counts, the unread cost target counts 0',o.rollupMoved],
     ['...the read KPI scores 100 while the unread one is still individually null',o.unreadTargetCounts],
     ['summary still renders',o.summaryOk],
     ['tasks panel retired (E5)',o.tasksRetired],['#etb-view still mounted',o.etbMounted]]
    .forEach(([n,c])=>{__cnt++; console.log((c?'  \u2713 ':'  \u2717 FAIL ')+n); if(!c)process.exitCode=1;});
    console.log('\nPASS - '+__cnt+' ETB phase-3 KPI assertions green');   // count so sweep.py can guard it
    console.log("\\n"+(process.exitCode?"\u2717 some failed":"\u2705 ETB Phase 3 all passed"));
  },400);
},400);
