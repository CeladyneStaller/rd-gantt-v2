// "Collapse to X" = X is the LOWEST level shown: every node at X is collapsed (children hidden) and every
// ancestor stays open. The button row derives from the active grouping, so it changes with the dims.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var o=[]; function ok(c,m){ o.push((c?'ok  ':'FAIL ')+m); }
   try{
    var TD=todayDay();
    execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],
      stageGates:[{id:'G1',objectiveId:'O1',name:'Gate A',plannedDate:TD+30,workstream:'W'},
                  {id:'G2',objectiveId:'O1',name:'Gate B',plannedDate:TD+60,workstream:'W'}] } };
    portfolio={ units:[{id:'U1',name:'UnitOne'}], divisions:[{id:'D1',name:'DivOne',unitId:'U1'}], products:[{id:'P1',name:'ProdOne',divisionId:'D1'}],
      models:[{id:'M1',name:'ModelOne',productId:'P1'}], kpis:[], milestones:[],
      initiatives:[{id:'I1',divisionId:'D1',name:'InitOne',productId:'P1',plannedStart:TD-20,plannedEnd:TD+300}],
      objectives:[{id:'O1',divisionId:'D1',initiativeId:'I1',productId:'P1',statement:'ObjOne',plannedStart:TD-10,plannedEnd:TD+120}] };

    // ---------- hierarchy mode ----------
    pfGroupMode="hierarchy"; ganttCollapsed=new Set(); renderGantt();
    var bar=document.getElementById('ganttLevelBar');
    ok(!!bar && bar.querySelectorAll('[data-lvl]').length===5, 'hierarchy: a button per level (Units..Objectives) + Expand all');
    var labels=Array.from(bar.querySelectorAll('[data-lvl]')).map(b=>b.textContent);
    ok(labels.indexOf('Units')>=0 && labels[0]==='Units', 'hierarchy: Units is the FIRST collapse level');
    ok(labels.indexOf('Divisions')>=0 && labels.indexOf('Initiatives')>=0 && labels.indexOf('Objectives')>=0, 'hierarchy: Divisions, Initiatives and Objectives buttons exist');
    var all=document.getElementById('ganttWrap').innerHTML;
    ok(all.indexOf('Gate A')>=0, 'expanded: stage-gates chart');

    // collapse to objectives -> objective visible, its gates hidden
    ganttCollapseTo('objective');
    var h=document.getElementById('ganttWrap').innerHTML;
    ok(h.indexOf('ObjOne')>=0, 'collapse to objectives: the objective is still shown');
    ok(h.indexOf('Gate A')<0 && h.indexOf('Gate B')<0, '...and its stage-gates are hidden (objective is the lowest level)');
    ok(h.indexOf('InitOne')>=0 && h.indexOf('DivOne')>=0, '...while its ancestors stay open');

    // collapse to initiatives -> initiative visible, objective hidden
    ganttCollapseTo('initiative');
    h=document.getElementById('ganttWrap').innerHTML;
    ok(h.indexOf('InitOne')>=0, 'collapse to initiatives: the initiative is still shown');
    ok(h.indexOf('ObjOne')<0, '...and objectives below it are hidden');
    ok(h.indexOf('DivOne')>=0, '...while the division stays open');

    // expand all
    ganttCollapseTo(null);
    h=document.getElementById('ganttWrap').innerHTML;
    ok(h.indexOf('Gate A')>=0 && ganttCollapsed.size===0, 'Expand all reopens every level');

    // ---- unit tier: the hierarchy preset now roots at Unit -> Division -> Initiative -> Objective ----
    ok(ganttRoots.length>0 && ganttRoots.every(function(r){return r.synthetic && r.dim==='unit';}), 'hierarchy roots are unit group nodes');
    ok(ganttRoots.some(function(r){return r.label==='UnitOne';}), 'the unit node is labelled by unit name');
    ok(document.getElementById('ganttWrap').innerHTML.indexOf('UnitOne')>=0, 'the unit row renders on the Gantt above the division');
    var uNode=ganttRoots.find(function(r){return r.label==='UnitOne';});
    ok(uNode && uNode.kids.some(function(k){return k.entity==='division' && k.rec && k.rec.name==='DivOne';}), 'the division nests under its unit');
    // collapse to unit -> unit visible, everything below (division/initiative/objective) hidden
    ganttCollapseTo('unit');
    var hu=document.getElementById('ganttWrap').innerHTML;
    ok(hu.indexOf('UnitOne')>=0, 'collapse to unit: the unit is still shown');
    ok(hu.indexOf('DivOne')<0 && hu.indexOf('ObjOne')<0 && hu.indexOf('Gate A')<0, '...and divisions/objectives/gates below it are hidden');
    ganttCollapseTo(null);

    // buttons are wired, not just rendered
    ganttCollapsed=new Set(); renderGantt();
    Array.from(document.getElementById('ganttLevelBar').querySelectorAll('[data-lvl]')).filter(b=>b.dataset.lvl==='objective')[0].click();
    ok(document.getElementById('ganttWrap').innerHTML.indexOf('Gate A')<0, 'clicking the Objectives button collapses to objectives');

    // ---------- dims mode: the row follows the chosen dimensions ----------
    pfGroupMode="dims"; pfGroupDims=["division","product","model"]; ganttCollapsed=new Set(); renderGantt();
    var dl=Array.from(document.getElementById('ganttLevelBar').querySelectorAll('[data-lvl]')).map(b=>b.dataset.lvl);
    ok(dl.indexOf('division')>=0 && dl.indexOf('product')>=0 && dl.indexOf('model')>=0 && dl.indexOf('objective')>=0,
       'dims mode: one button per chosen dimension, plus objectives');
    ganttCollapseTo('product');
    h=document.getElementById('ganttWrap').innerHTML;
    ok(h.indexOf('ProdOne')>=0, 'collapse to product: the product group is shown');
    ok(h.indexOf('ObjOne')<0, '...and everything under it is hidden');
    ok(h.indexOf('DivOne')>=0, '...while the division group stays open');

    // re-picking the dims re-shapes the button row
    pfGroupDims=["division"]; renderGantt();
    dl=Array.from(document.getElementById('ganttLevelBar').querySelectorAll('[data-lvl]')).map(b=>b.dataset.lvl);
    ok(dl.indexOf('product')<0 && dl.indexOf('division')>=0, 'dropping a dimension drops its button');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(o));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]');
    out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    const fl=out.filter(x=>x.startsWith('FAIL'));
    console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} gantt collapse-level assertions green`);
    process.exit(fl.length?1:0); },400);
},450);
