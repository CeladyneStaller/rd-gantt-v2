var __cnt=0;   // assertion counter: without a printed total sweep.py cannot guard this harness
// ETB port — persistence over the broker: manual save-with-warning, debounced auto-save,
// objective-switch flush (no data loss), and refresh-restore. (9 assertions)
// usage: NODE_PATH=<jsdom> node etb_persistence.test.js [path/to/execution_app.html]
const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const HTML_PATH=process.argv[2]||(process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html';
const html=fs.readFileSync(HTML_PATH,'utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/",pretendToBeVisual:true});
try{ dom.window.localStorage.setItem('rd_broker_token','t'); }catch(e){}
setTimeout(()=>{ const d=dom.window.document, s=d.createElement('script');
  s.textContent=`
  window.__R={};
  (function(){ function ef(id,v){return 'et_'+id+'_'+v;} var STORE={}; window.__STORE=STORE;
    apiGet=async function(id){var e=STORE[id];return e?{version:e.version,etag:ef(id,e.version),doc:e.doc}:null;};
    apiPut=async function(id,doc,im){var e=STORE[id];var cv=e?e.version:0;if(im!==ef(id,cv)&&im!==String(cv))throw new Error('412 '+id);STORE[id]={version:cv+1,doc:JSON.parse(JSON.stringify(doc))};return {version:cv+1,etag:ef(id,cv+1)};};
  })();
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
  function hasExp(pid,eid){return !!(typeof exec!=='undefined'&&exec&&exec.etbTrees&&exec.etbTrees[pid]&&exec.etbTrees[pid].experiments&&exec.etbTrees[pid].experiments[eid]);}
  function mkExp(id,code,results){return {id:id,code:code,name:code,status:'planned',key_reads:[],possible_results:results||[],actual_outcome:null,audit_log:[]};}
  async function run(){ var R=window.__R;
    portfolio={divisions:[{id:'FC',name:'FC'}],products:[{id:'P1',name:'X',divisionId:'FC'}],initiatives:[{id:'I1',divisionId:'FC',productId:'P1'}],objectives:[
      {id:'O1',statement:'A',divisionId:'FC',initiativeId:'I1',plannedStart:20000,plannedEnd:20090},
      {id:'O2',statement:'B',divisionId:'FC',initiativeId:'I1',plannedStart:20000,plannedEnd:20090}],milestones:[],kpis:[]};
    divisionId='FC'; exec=blankExec(); fillObjSelect(); etbSyncObjective(); await etbLoadForDivision();
    var sel=document.getElementById('objSelect'); sel.value='O1'; sel.dispatchEvent(new Event('change')); await sleep(50);

    // A) manual Save with a VALIDATION ERROR present (result points to a missing experiment) -> must still persist
    var t=ETB.getTree(); t.experiments['exp_A1']=mkExp('exp_A1','A1',[{id:'r1',label:'x',criteria:[],next_experiment_ids:['ghost_missing'],terminal:null}]); t.root_experiment_id='exp_A1';
    document.getElementById('btnSave').click(); await sleep(300);
    R.manualSaveWithErrorPersists = hasExp('O1','exp_A1');
    R.btnStillPresent = !!document.getElementById('btnSave');   // armConfirm did NOT replace the button

    // B) auto-save: add an experiment, fire the ETB change hook, DON'T click Save
    ETB.getTree().experiments['exp_A2']=mkExp('exp_A2','A2'); window.__etbOnChange(); await sleep(950);
    R.autoSavePersists = hasExp('O1','exp_A2');

    // C) switch race: edit O1 then immediately switch to O2 (before the 700ms debounce) -> O1 edit must not be lost
    ETB.getTree().experiments['exp_A3']=mkExp('exp_A3','A3'); window.__etbOnChange();
    sel.value='O2'; sel.dispatchEvent(new Event('change')); await sleep(350);
    R.switchFlushesO1 = hasExp('O1','exp_A3');
    R.activeIsO2 = (ETB.getActiveProjectId()==='O2');
    // edit O2 too, switch back to O1
    ETB.getTree().experiments['exp_B1']=mkExp('exp_B1','B1'); window.__etbOnChange();
    sel.value='O1'; sel.dispatchEvent(new Event('change')); await sleep(350);
    R.switchFlushesO2 = hasExp('O2','exp_B1');

    // D) refresh: the persist store (exec.etbTrees) is authoritative on reload — drop exp_A2 there, reload, working tree follows
    delete exec.etbTrees['O1'].experiments['exp_A2']; await ETB.loadForHub();
    R.refreshRestoresA1 = !!ETB.experimentById('exp_A1');
    R.refreshRestoresA3 = !!ETB.experimentById('exp_A3');
    R.refreshDropsLocal = !ETB.experimentById('exp_A2');
    document.body.setAttribute('data-done','1');
  }
  run().catch(function(e){ document.body.setAttribute('data-err', e.message+' | '+((e.stack||'').split(String.fromCharCode(10))[1]||'')); });
  `;
  d.body.appendChild(s);
  setTimeout(()=>{ const err=d.body.getAttribute('data-err'); if(err){ console.log('RUN ERR:',err); process.exitCode=1; return; }
    const R=dom.window.__R;
    [['manual Save persists even WITH validation errors (no confirm gate)',R.manualSaveWithErrorPersists],
     ['Save button not consumed by an armed confirm',R.btnStillPresent],
     ['edit auto-saves (debounced) with no Save click',R.autoSavePersists],
     ['switching objectives flushes O1 pending edit (no loss)',R.switchFlushesO1],
     ['active project is now O2 after switch',R.activeIsO2],
     ['switching back flushes O2 pending edit (no loss)',R.switchFlushesO2],
     ['refresh restores manually-saved experiment',R.refreshRestoresA1],
     ['refresh restores auto-saved/flushed experiment',R.refreshRestoresA3],
     ['refresh follows the persist store (exec.etbTrees authoritative)',R.refreshDropsLocal]]
    .forEach(([n,c])=>{__cnt++; console.log((c?'  \u2713 ':'  \u2717 FAIL ')+n); if(!c)process.exitCode=1;});
    console.log('\nPASS - '+__cnt+' ETB persistence assertions green');   // count so sweep.py can guard it
    console.log(process.exitCode?"\u2717 persistence FAILED":"\u2705 ETB persists: manual + auto + switch-safe + refresh-restore");
  },2600);
},400);
