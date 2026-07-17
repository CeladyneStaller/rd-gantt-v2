// Grouping rules: (1) items with no value for a dimension read FIRST; (2) that dimension's level is skipped
// entirely — no "— none —" header, the items hang off the parent; (3) the milestones tab groups by the same
// shared dims (milestones derive division/product/model from their initiative; quarter/owner simply skip).
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const C=require((process.env.RD_SRC||'/home/claude')+'/rdcore.js');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

// ---------- core ----------
const P={ divisions:[{id:'D1',name:'Div One'}], products:[{id:'P1',name:'Prod',divisionId:'D1'}],
  models:[{id:'M1',name:'Model',productId:'P1'}],
  initiatives:[{id:'I1',divisionId:'D1',productId:'P1'},{id:'I2',divisionId:'D1',modelId:'M1'}],
  objectives:[], milestones:[] };
// Corey's example: division + product but NO model, grouped division > product > model
const objs=[{id:'oNoModel',divisionId:'D1',initiativeId:'I1',productId:'P1'},
            {id:'oModel',  divisionId:'D1',initiativeId:'I2',modelId:'M1'}];
const g=C.groupObjectives(objs,['division','product','model'],P);
const p1=g[0].children[0];
ok(g[0].key==='D1' && p1.key==='P1', 'nested D1 > P1');
ok(p1.children[0].key==='', 'the no-model bucket is ordered FIRST');
ok(p1.children[0].objs[0].id==='oNoModel', '...and holds the objective with no model');
ok(p1.children[1].key==='M1', 'the real model group follows it');

// ---------- milestone grouping ----------
const MP={ divisions:[{id:'D1',name:'Div One'},{id:'D2',name:'Div Two'}],
  products:[{id:'P1',name:'Prod'}], models:[{id:'M1',name:'Model',productId:'P1'}],
  initiatives:[{id:'I1',divisionId:'D1',productId:'P1'},{id:'I2',divisionId:'D2'}],
  objectives:[], milestones:[] };
const ms=[{id:'MS1',initiativeId:'I1',name:'has div+prod'},{id:'MS2',initiativeId:'I2',name:'div only'},{id:'MS3',name:'no initiative'}];
const mg=C.groupMilestones(ms,['division'],MP);
ok(mg[0].key==='' && mg[0].objs[0].id==='MS3', 'a milestone with no initiative has no division -> reads first');
ok(mg[1].key==='D1' && mg[1].objs[0].id==='MS1', 'a milestone inherits its division from its initiative');
ok(mg[2].key==='D2', '...and the second division follows');
const mgp=C.groupMilestones(ms,['product'],MP);
ok(mgp.some(n=>n.key==='P1' && n.objs[0].id==='MS1'), 'a milestone inherits its product from its initiative');
const mgq=C.groupMilestones(ms,['quarter'],MP);
ok(mgq.length===1 && mgq[0].key==='' && mgq[0].objs.length===3, 'quarter does not exist on a milestone -> one none bucket (the level is skipped in render)');

// ---------- render: Gantt + Structure + Milestones ----------
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var o=[]; function ok(c,m){ o.push((c?'ok  ':'FAIL ')+m); }
   try{
    var TD=todayDay();
    execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] } };
    portfolio={ divisions:[{id:'D1',name:'Div One'}], products:[{id:'P1',name:'Prod',divisionId:'D1'}],
      models:[{id:'M1',name:'Model',productId:'P1'}],
      initiatives:[{id:'I1',divisionId:'D1',productId:'P1',name:'Init',plannedStart:TD-10,plannedEnd:TD+300},
                   {id:'I2',divisionId:'D1',modelId:'M1',name:'Init2',plannedStart:TD-10,plannedEnd:TD+300}],
      kpis:[],
      objectives:[{id:'oPlain',divisionId:'D1',initiativeId:'I1',productId:'P1',statement:'bare objective',plannedStart:TD-10,plannedEnd:TD+100},
                  {id:'oTied', divisionId:'D1',initiativeId:'I2',modelId:'M1',statement:'tied objective',plannedStart:TD-10,plannedEnd:TD+200}],
      milestones:[{id:'MS1',initiativeId:'I1',name:'ms with div',plannedDate:TD+50},
                  {id:'MS3',name:'ms no initiative',plannedDate:TD+20}] };
    pfGroupMode="dims"; pfGroupDims=["division","product","model"];

    // Structure tab
    renderPortfolio();
    var st=document.getElementById('structTables').innerHTML;
    ok(st.indexOf('— none —')<0, 'Structure: no "— none —" group header is rendered');
    ok(st.indexOf('Model')>=0, 'Structure: the real Model group still has its header');
    ok(st.indexOf('bare objective')>=0, 'Structure: the no-model objective still renders');

    // Gantt
    renderGantt();
    var gw=document.getElementById('ganttWrap').innerHTML;
    ok(gw.indexOf('— none —')<0, 'Gantt: no "— none —" synthetic group row');
    ok(gw.indexOf('bare objective')>=0 && gw.indexOf('tied objective')>=0, 'Gantt: both objectives chart');
    ok(gw.indexOf('bare objective') < gw.indexOf('Model'), 'Gantt: the skipped-level objective reads ABOVE the Model group');

    // Milestones tab — shared dims
    renderMilestones();
    var msh=document.getElementById('msBody').innerHTML;
    ok(msh.indexOf('— none —')<0, 'Milestones: no "— none —" header');
    ok(msh.indexOf('Div One')>=0, 'Milestones: grouped by division, derived from the initiative');
    ok(msh.indexOf('ms no initiative') < msh.indexOf('Div One'), 'Milestones: the ungrouped milestone reads first, above the division header');
    ok(document.getElementById('msFilterBar').innerHTML.indexOf('data-gdim')>=0 || document.getElementById('msFilterBar').innerHTML.toLowerCase().indexOf('group')>=0, 'Milestones: the shared grouping picker is available on the tab');
    // regrouping by a dim a milestone lacks flattens it rather than dumping everything in a none bucket
    pfGroupDims=["owner"]; renderMilestones();
    var msh2=document.getElementById('msBody').innerHTML;
    ok(msh2.indexOf('grouphead')<0, 'Milestones: grouping by owner (which milestones lack) flattens — no headers');
    ok(msh2.indexOf('ms with div')>=0 && msh2.indexOf('ms no initiative')>=0, '...and every milestone still renders');
    pfGroupDims=["initiative"]; renderMilestones();
    ok(document.getElementById('msBody').innerHTML.indexOf('Init')>=0, 'Milestones: grouping by initiative works');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(o));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const all=out.concat(JSON.parse(d.body.getAttribute('data-out')||'[]'));
    all.forEach(l=>console.log(l));
    const fl=all.filter(x=>x.startsWith('FAIL'));
    console.log(fl.length?`\n${fl.length}/${all.length} FAILED`:`\nPASS — ${all.length} grouping assertions green`);
    process.exit(fl.length?1:0); },400);
},450);
