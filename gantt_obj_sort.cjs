// The Gantt orders objectives by end date (ascending) inside whatever parent/group they land in —
// hierarchy (under an initiative), custom grouping (dims), and the flat list (dims cleared).
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   function objOrder(){ var h=document.getElementById('ganttWrap').innerHTML, re=/data-lineage="objective:([^"]+)"/g, m, o=[];
     while((m=re.exec(h))) o.push(m[1]); return o; }
   try{
    execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] } };
    // deliberately declared out of end-date order in the portfolio array (Gantt used raw array order before)
    portfolio={ divisions:[{id:'D1',name:'Div'}],
      initiatives:[{id:'I1',divisionId:'D1',name:'Init',plannedStart:0,plannedEnd:400}],
      objectives:[
        {id:'LATE',  divisionId:'D1',initiativeId:'I1',statement:'late',   quarter:'Q1 2026',plannedStart:0,plannedEnd:300},
        {id:'EARLY', divisionId:'D1',initiativeId:'I1',statement:'early',  quarter:'Q1 2026',plannedStart:0,plannedEnd:100},
        {id:'MIDDLE',divisionId:'D1',initiativeId:'I1',statement:'middle', quarter:'Q1 2026',plannedStart:0,plannedEnd:200}],
      milestones:[], products:[], models:[] };

    // ---------- hierarchy: under an initiative ----------
    pfGroupMode="hierarchy"; renderGantt();
    var o1=objOrder();
    ok(o1.join(",")==='EARLY,MIDDLE,LATE', 'hierarchy: objectives sort by end date ascending (was portfolio array order)');

    // ---------- milestones keep their slots (only objectives are reordered) ----------
    portfolio.milestones=[{id:'M1',initiativeId:'I1',name:'ms',plannedDate:150}];
    renderGantt();
    var h=document.getElementById('ganttWrap').innerHTML;
    ok(h.indexOf('milestone:M1') < h.indexOf('objective:EARLY'), 'the milestone keeps its slot ahead of the objectives');
    ok(objOrder().join(",")==='EARLY,MIDDLE,LATE', 'objectives still sort by end date alongside a milestone');
    portfolio.milestones=[];

    // ---------- custom grouping (dims) ----------
    pfGroupMode="dims"; pfGroupDims=["division"]; renderGantt();
    ok(objOrder().join(",")==='EARLY,MIDDLE,LATE', 'custom grouping: objectives sort by end date inside the group');

    // ---------- dims cleared -> flat list ----------
    pfGroupDims=[]; renderGantt();
    ok(objOrder().join(",")==='EARLY,MIDDLE,LATE', 'flat list (dims cleared): objectives sort by end date');

    // ---------- projected end is used when plannedEnd is absent ----------
    pfGroupMode="hierarchy"; pfGroupDims=["division"];
    portfolio.objectives=[
      {id:'A',divisionId:'D1',initiativeId:'I1',statement:'a',quarter:'Q1 2026',plannedStart:0,plannedEnd:250},
      {id:'B',divisionId:'D1',initiativeId:'I1',statement:'b',quarter:'Q1 2026',plannedStart:0,plannedEnd:50}];
    renderGantt();
    ok(objOrder().join(",")==='B,A', 'an earlier-ending objective leads regardless of declaration order');

    // ---------- equal end dates -> stable, name-ordered ----------
    portfolio.objectives=[
      {id:'Z',divisionId:'D1',initiativeId:'I1',statement:'zebra',quarter:'Q1 2026',plannedStart:0,plannedEnd:200},
      {id:'A2',divisionId:'D1',initiativeId:'I1',statement:'alpha',quarter:'Q1 2026',plannedStart:0,plannedEnd:200}];
    renderGantt();
    ok(objOrder().join(",")==='A2,Z', 'equal end dates fall back to a stable name order');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>console.log(l));
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} Gantt objective-sort assertions green`); process.exit(fl.length?1:0); },400);
},450);
