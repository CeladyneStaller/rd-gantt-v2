// ETB port Phase 1 — module mounts in #subEXP, per-objective scoping, brokered ETB-<div> load, tasks panel kept (10 assertions)
// usage: NODE_PATH=<jsdom> node etb_phase1_mount.test.js [path/to/execution_app.html]
const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const HTML_PATH=process.argv[2]||'/mnt/user-data/outputs/execution_app.html';
const html=fs.readFileSync(HTML_PATH,'utf8');
const errs=[]; const vc=new VirtualConsole(); vc.on("jsdomError",e=>{ if(!/fetch|network|broker|Failed to|cytoscape|Graph library/i.test(e.message)) errs.push(e.message); });
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:vc,url:"https://x.test/",pretendToBeVisual:true});
try{ dom.window.localStorage.setItem('rd_broker_token','tkn'); }catch(e){}
setTimeout(()=>{ const d=dom.window.document, s=d.createElement('script');
  s.textContent=`(async function(){ try{ var o={};
    // ETB module booted
    o.etbGlobal = !!(window.ETB && ETB.setActiveProject && ETB.loadForHub);
    // mounted inside #subEXP
    var ev=document.getElementById('etb-view');
    o.mounted = !!ev && !!ev.closest('#subEXP');
    o.notHidden = !!ev && !ev.hasAttribute('hidden');
    // ETB rendered its Outline (sample tree at init) — content present
    var ol=document.getElementById('view-outline');
    o.outlineRendered = !!ol && ol.innerHTML.trim().length>0;
    // per-objective scoping without a loaded doc: setActiveProject stamps the tree
    ETB.setActiveProject('O1');
    o.scopeStamp = (ETB.getActiveProjectId()==='O1');
    // broker seam: stub apiGet, load the division's ETB doc, confirm doc id + tree selection
    var captured=[];
    apiGet = async function(id){ captured.push(id);
      if(id.indexOf('ETB-')===0) return { doc:{ trees:{ 'O1':{ project_id:'O1', experiments:{ exp_001:{ id:'exp_001', code:'E1', name:'Membrane test', status:'planned', results:[] } }, root_experiment_id:'exp_001' } }, meta:{} }, etag:'e1', version:3 };
      return null; };
    seedPortfolioForTest();
    await etbLoadForDivision();
    o.brokerDocId = (captured.indexOf('ETB-FC')>=0);
    o.treeLoaded = !!(ETB.experimentById && ETB.experimentById('exp_001'));
    o.outlineHasExp = /Membrane test/.test(document.getElementById('view-outline').innerHTML);
    // tasks panel still present after a full render
    renderAll();
    o.tasksIntact = /Execution tasks/.test(document.getElementById('subTASK').innerHTML);
    o.expSectionPresent = !!document.getElementById('subEXP');
    document.body.setAttribute('data-out',JSON.stringify(o));
  }catch(e){document.body.setAttribute('data-err',(e&&e.message)+' @ '+((e&&e.stack)||'').split('\\n').slice(1,4).join(' | '));} })();
  function seedPortfolioForTest(){
    portfolio={divisions:[{id:'FC',name:'Fuel Cells'}],products:[{id:'P1',name:'FCS-100',divisionId:'FC'}],initiatives:[{id:'I1',divisionId:'FC',productId:'P1'}],objectives:[{id:'O1',statement:'Alpha',divisionId:'FC',initiativeId:'I1',quarter:'2026Q3',plannedStart:20000,plannedEnd:20090}],milestones:[],kpis:[]};
    divisionId='FC'; exec=blankExec(); fillObjSelect();
  }`;
  // expose seed fn to the async block scope by declaring it before appending
  d.body.appendChild(s);
  setTimeout(()=>{ if(errs.length)console.log('load errors:',errs.join(' | '));
    const err=d.body.getAttribute('data-err'); if(err){console.log('RUNTIME:',err);process.exitCode=1;return;}
    const o=JSON.parse(d.body.getAttribute('data-out')||'{}');
    [['ETB module booted (window.ETB API present)',o.etbGlobal],['#etb-view mounted inside #subEXP',o.mounted],
     ['#etb-view is shown (hidden removed)',o.notHidden],['ETB rendered its Outline at init',o.outlineRendered],
     ['setActiveProject stamps the active objective',o.scopeStamp],['broker seam hits ETB-<division> doc id',o.brokerDocId],
     ['objective tree loads from broker doc',o.treeLoaded],['loaded experiment shows in the Outline',o.outlineHasExp],
     ['Experiments section present in the objective view',o.expSectionPresent],['tasks panel intact (kept)',o.tasksIntact]]
    .forEach(([n,c])=>{console.log((c?'  \u2713 ':'  \u2717 FAIL ')+n); if(!c)process.exitCode=1;});
    console.log("\\n"+(process.exitCode?"\u2717 some failed":"\u2705 ETB port Phase 1 all passed"));
  },400);
},400);
