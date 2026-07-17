// Pass 2: Structure and Milestones gain collapse (state + per-node toggles + collapse-to-level buttons).
// Structure's HIERARCHY mode is renderStructTables() — flat per-entity tables, nothing nested — so it has no
// levels; collapse there applies only in dims mode. Milestones likewise.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var o=[]; function ok(c,m){ o.push((c?'ok  ':'FAIL ')+m); }
   try{
    var TD=todayDay();
    execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] } };
    portfolio={ divisions:[{id:'D1',name:'DivOne'}], products:[{id:'P1',name:'ProdOne',divisionId:'D1'}],
      models:[{id:'M1',name:'ModelOne',productId:'P1'}], kpis:[],
      initiatives:[{id:'I1',divisionId:'D1',name:'InitOne',productId:'P1',plannedStart:TD-20,plannedEnd:TD+300}],
      objectives:[{id:'O1',divisionId:'D1',initiativeId:'I1',modelId:'M1',statement:'ObjOne',plannedStart:TD-10,plannedEnd:TD+120}],
      milestones:[{id:'MS1',initiativeId:'I1',name:'MsOne',plannedDate:TD+50}] };
    pfGroupMode="dims"; pfGroupDims=["division","product","model"];

    // ---------- Structure ----------
    structCollapsed=new Set(); renderPortfolio();
    var st=document.getElementById('structTables').innerHTML;
    ok(st.indexOf('data-ptoggle')>=0, 'structure: per-node toggles render');
    ok(st.indexOf('ObjOne')>=0 && st.indexOf('ProdOne')>=0, 'expanded: groups and objectives show');

    // a per-node toggle collapses just that node
    var t=document.getElementById('structTables').querySelector('[data-ptoggle]');
    t.click();
    ok(structCollapsed.size===1, 'structure: a toggle collapses a single node');
    ok(document.getElementById('structTables').innerHTML.indexOf('ObjOne')<0, '...hiding its subtree');
    document.getElementById('structTables').querySelector('[data-ptoggle]').click();
    ok(structCollapsed.size===0, '...and toggling again reopens it');

    // ---------- Milestones ----------
    msCollapsed=new Set(); renderMilestones();
    var mh=document.getElementById('msBody').innerHTML;
    ok(mh.indexOf('data-mstoggle')>=0, 'milestones: per-node toggles render');
    ok(mh.indexOf('MsOne')>=0, 'expanded: the milestone row shows');

    // ---------- per-tab state (a Gantt collapse must not reshape Structure) ----------
    structCollapsed=new Set(); msCollapsed=new Set(); renderPortfolio(); renderMilestones();
    ganttCollapseTo('division');
    ok(structCollapsed.size===0 && msCollapsed.size===0, 'collapse state is per-tab: the Gantt does not touch Structure or Milestones');
    ok(document.getElementById('structTables').innerHTML.indexOf('ObjOne')>=0, '...Structure stays expanded');

    // ---------- hierarchy mode: Structure has no tree, so no level bar ----------
    pfGroupMode="hierarchy"; renderPortfolio(); renderMilestones();
    ok(document.getElementById('ganttLevelBar')!==null, 'the Gantt still has its level bar (it draws the entity tree)');
    // Structure and Milestones have per-node toggles only — no collapse-to-level bar at all, in either mode
    ok(document.getElementById('structLevelBar')===null && document.getElementById('msLevelBar')===null,
       'Structure and Milestones have no level bar in hierarchy mode');
    pfGroupMode="dims"; renderPortfolio(); renderMilestones();
    ok(document.getElementById('structLevelBar')===null && document.getElementById('msLevelBar')===null,
       '...nor in dims mode — their per-node toggles are the only collapse control');
    ok(document.getElementById('structTables').innerHTML.indexOf('data-ptoggle')>=0, '...and those toggles still render');
    ok(document.getElementById('msBody').innerHTML.indexOf('data-mstoggle')>=0, '...on both tabs');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(o));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]');
    out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    const fl=out.filter(x=>x.startsWith('FAIL'));
    console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} structure/milestone collapse assertions green`);
    process.exit(fl.length?1:0); },400);
},450);
