// PATCH 1: an initiative with no KPIs of its own ends where its children end (even if it carries a later
//          plannedEnd); one WITH KPIs is measured in its own right, so its plannedEnd still governs.
// PATCH 2: an objective with a single workstream hangs its gates straight off the objective — no set row.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   // right edge of the bar on the row for a given lineage — domain-independent, so no x() arithmetic here
   function barRight(lineage){
     var h=document.getElementById('ganttWrap').innerHTML, i=h.indexOf('data-lineage="'+lineage+'"');
     if(i<0) return null;
     var m=/<div class="gbar[^"]*" style="left:([0-9.]+)px;width:([0-9.]+)px/.exec(h.slice(i));
     return m ? Math.round((parseFloat(m[1])+parseFloat(m[2]))*10)/10 : null;
   }
   try{
    var TD=todayDay();   // gates must sit in the FUTURE: an overdue gate forecasts to today, which would swamp every derived end
    var G=()=>document.getElementById('ganttWrap').innerHTML;
    function rowHtml(l){ var h=G(), i=h.indexOf('data-lineage="'+l+'"'); if(i<0) return ''; var j=h.indexOf('class="grow"', i); return j<0?h.slice(i):h.slice(i,j); }
    function slipRight(l){ var m=/<div class="gslip" style="left:([0-9.]+)px;width:([0-9.]+)px/.exec(rowHtml(l)); return m?Math.round((parseFloat(m[1])+parseFloat(m[2]))*10)/10:null; }
    execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],
      stageGateSets:[{id:'S1',objectiveId:'O1',name:'only one',order:0},
                     {id:'S2a',objectiveId:'O2',name:'alpha',order:0},{id:'S2b',objectiveId:'O2',name:'beta',order:1},
                     {id:'S3',objectiveId:'O3',name:'w',order:0},
                     {id:'S4',objectiveId:'O4',name:'w',order:0},{id:'S5',objectiveId:'O5',name:'w',order:0},
                     {id:'S6',objectiveId:'O6',name:'w',order:0},{id:'S7',objectiveId:'O7',name:'w',order:0}],
      stageGates:[{id:'g1',objectiveId:'O1',setId:'S1',name:'lone gate',plannedDate:TD+100},
                  {id:'g2a',objectiveId:'O2',setId:'S2a',name:'a1',plannedDate:TD+150},
                  {id:'g2b',objectiveId:'O2',setId:'S2b',name:'b1',plannedDate:TD+200},
                  {id:'g3',objectiveId:'O3',setId:'S3',name:'c1',plannedDate:TD+200},
                  {id:'g4',objectiveId:'O4',setId:'S4',name:'d1',plannedDate:TD+60},
                  {id:'g5',objectiveId:'O5',setId:'S5',name:'e1',plannedDate:TD+200},
                  {id:'g6',objectiveId:'O6',setId:'S6',name:'f1',plannedDate:TD+200},
                  {id:'g7',objectiveId:'O7',setId:'S7',name:'h1',plannedDate:TD+200}] } };
    portfolio={ divisions:[{id:'D1',name:'Div'}],
      initiatives:[
        {id:'I1',divisionId:'D1',name:'Shrinks',  plannedStart:TD-10,plannedEnd:TD+400},  // no KPIs, work ends TD+200 -> shrinks
        {id:'I2',divisionId:'D1',name:'Measured', plannedStart:TD-10,plannedEnd:TD+400},  // HAS a KPI -> keeps its own end
        {id:'I3',divisionId:'D1',name:'Slips',    plannedStart:TD-10,plannedEnd:TD+100},  // Corey's case: input 26Q1, work into 26Q2
        {id:'I4',divisionId:'D1',name:'AllEnded', plannedStart:TD-200,plannedEnd:TD+400}], // every objective closed out
      kpis:[{id:'PK',hostType:'initiative',hostId:'I2',objectiveId:null,isDefiner:true,groupId:'G',direction:'up',target:10}],
      objectives:[{id:'O1',divisionId:'D1',initiativeId:'I1',statement:'q1 work',plannedStart:TD-10,plannedEnd:TD+100},
                  {id:'O2',divisionId:'D1',initiativeId:'I1',statement:'q2 work',plannedStart:TD-10,plannedEnd:TD+200},
                  {id:'O3',divisionId:'D1',initiativeId:'I2',statement:'measured child',plannedStart:TD-10,plannedEnd:TD+200},
                  {id:'O4',divisionId:'D1',initiativeId:'I3',statement:'early',plannedStart:TD-10,plannedEnd:TD+60},
                  {id:'O5',divisionId:'D1',initiativeId:'I3',statement:'runs into q2',plannedStart:TD-10,plannedEnd:TD+200},
                  {id:'O6',divisionId:'D1',initiativeId:'I4',statement:'killed a',plannedStart:TD-200,plannedEnd:TD+200},
                  {id:'O7',divisionId:'D1',initiativeId:'I4',statement:'killed b',plannedStart:TD-200,plannedEnd:TD+200}],
      milestones:[], products:[], models:[] };
    pfGroupMode="hierarchy"; renderGantt();

    // ---------- shrink: the work finishes before the baseline ----------
    var i1=barRight('initiative:I1'), o1=barRight('objective:O1'), o2=barRight('objective:O2');
    ok(i1!=null && o2!=null, 'the container initiative and its objectives chart');
    ok(i1===o2, 'a KPI-less initiative ends at its last stage-gate (TD+200), NOT its own plannedEnd (TD+400)');
    ok(i1>o1, 'it takes the LATEST work underneath, not the earliest');
    ok(!/gslip/.test(rowHtml('initiative:I1')), 'finishing before the baseline is not slip — no red extension');

    // ---------- an initiative with its own KPIs is measured in its own right ----------
    var i2=barRight('initiative:I2');
    ok(i2>barRight('objective:O3'), 'an initiative WITH KPIs keeps its own plannedEnd (TD+400 > its child at TD+200)');
    ok(i2>i1, 'identical plannedEnds, different bars — only the KPI-less one is driven by its children');

    // ---------- Corey's case: input 26Q1, objectives in Q1 and Q2 ----------
    var i3=barRight('initiative:I3');
    ok(i3===barRight('objective:O1'), 'the banded bar stops at the 26Q1 baseline (TD+100)');
    ok(/gslip/.test(rowHtml('initiative:I3')), 'overrunning the baseline renders as slip: a red extension appears');
    ok(slipRight('initiative:I3')===barRight('objective:O5'), 'the red slip reaches the 26Q2 work (TD+200) — the real end');
    ok(i3<slipRight('initiative:I3'), 'only the slip runs into 26Q2; the banded bar stays in 26Q1');

    // ---------- (i) the day the last objective was closed out ----------
    execDocs["EXEC-D1"].objectiveState=[{objectiveId:'O6',status:'abandoned',endedDay:TD-100},
                                        {objectiveId:'O7',status:'achieved', endedDay:TD-50}];
    renderGantt();
    var i4=barRight('initiative:I4');
    ok(i4===barRight('objective:O7'), 'all objectives closed out -> the initiative ends at the LAST close date (TD-50)');
    ok(i4>barRight('objective:O6'), '...the LAST of them, not the first (O6 closed earlier, at TD-100)');

    // ---------- (i) needs EVERY objective ended ----------
    execDocs["EXEC-D1"].objectiveState=[{objectiveId:'O6',status:'abandoned',endedDay:TD-100}];
    renderGantt();
    ok(barRight('initiative:I4')>i4, 'with one objective still live there is no "last objective ended" — the gate schedule governs again');
    execDocs["EXEC-D1"].objectiveState=[];

    // ---------- no children -> its own dates stand ----------
    portfolio.objectives=portfolio.objectives.filter(o=>o.initiativeId!=='I1');
    renderGantt();
    ok(barRight('initiative:I1')===i2, 'a KPI-less initiative with no children falls back to its own plannedEnd');

    // ---------- PATCH 2 ----------
    portfolio.objectives=[{id:'O1',divisionId:'D1',initiativeId:'I1',statement:'lone workstream',plannedStart:0,plannedEnd:100},
                          {id:'O2',divisionId:'D1',initiativeId:'I1',statement:'two workstreams',plannedStart:0,plannedEnd:200}];
    renderGantt();
    var h=document.getElementById('ganttWrap').innerHTML;
    ok((h.match(/gsetbar/g)||[]).length===2, 'PATCH 2: only the 2-workstream objective renders set rows (2 bars, not 3)');
    ok(!/only one/.test(h), 'PATCH 2: the lone workstream label ("only one") is gone');
    ok(/alpha/.test(h) && /beta/.test(h), 'PATCH 2: real multi-workstream labels still render');
    ok(/lone gate/.test(h), 'PATCH 2: the lone workstream\\'s gate is still charted (hung off the objective)');
    ok((h.match(/class="gdia [^"]*"/g)||[]).length>=3, 'PATCH 2: all three gate diamonds still render');

    // ---------- an ended objective that overran its input end date paints red to the day it closed ----------
    // Corey ex1: input 1/1->2/28, ended 3/27 (27 days over) -> banded bar to 2/28 + solid red 2/28->3/27
    // Corey ex2: input 4/1->6/30, ended 7/3  (3 days over)  -> no red; that gap is quarter-boundary noise
    execDocs["EXEC-D1"].objectiveState=[];
    portfolio.initiatives=[{id:'IX',divisionId:'D1',name:'Host',plannedStart:TD-200,plannedEnd:TD+400}];
    portfolio.kpis=[{id:'PKX',hostType:'initiative',hostId:'IX',objectiveId:null,isDefiner:true,groupId:'G',direction:'up',target:10}];
    portfolio.objectives=[
      {id:'LATE', divisionId:'D1',initiativeId:'IX',statement:'overran by 27d',plannedStart:TD-100,plannedEnd:TD-30},
      {id:'NOISE',divisionId:'D1',initiativeId:'IX',statement:'closed 3d after',plannedStart:TD-100,plannedEnd:TD-10},
      {id:'EDGE7',divisionId:'D1',initiativeId:'IX',statement:'closed exactly 7d after',plannedStart:TD-100,plannedEnd:TD-20},
      {id:'EDGE8',divisionId:'D1',initiativeId:'IX',statement:'closed 8d after',plannedStart:TD-100,plannedEnd:TD-40}];
    execDocs["EXEC-D1"].stageGates=[]; execDocs["EXEC-D1"].stageGateSets=[];
    execDocs["EXEC-D1"].objectiveState=[
      {objectiveId:'LATE', status:'achieved', endedDay:TD-3},    // 27 days past its end
      {objectiveId:'NOISE',status:'abandoned',endedDay:TD-7},    // 3 days past  -> noise
      {objectiveId:'EDGE7',status:'achieved', endedDay:TD-13},   // exactly 7    -> still noise
      {objectiveId:'EDGE8',status:'achieved', endedDay:TD-32}];  // 8 days       -> red
    renderGantt();
    ok(/gslip/.test(rowHtml('objective:LATE')), 'an objective closed 27 days past its input end shows a red overrun');
    ok(slipRight('objective:LATE')>barRight('objective:LATE'), 'the red runs from the input end date out to the day it closed');
    ok(!/gslip/.test(rowHtml('objective:NOISE')), 'closing 3 days past the input end is quarter-boundary noise — no red');
    ok(!/gslip/.test(rowHtml('objective:EDGE7')), 'exactly 7 days past is still within the grace window — no red');
    ok(/gslip/.test(rowHtml('objective:EDGE8')), '8 days past is a real overrun — red');
    ok(/class="gended achieved"/.test(rowHtml('objective:LATE')), 'the end marker still caps the red at the close date');
    // the banded bar itself is untouched: it stops at the input end date, red only beyond it
    var oLate=barRight('objective:LATE');
    execDocs["EXEC-D1"].objectiveState=[];
    renderGantt();
    ok(barRight('objective:LATE')===oLate, 'the banded bar ends at the input end date whether or not the objective is ended');

    // ---------- an objective closed EARLY shrinks its bar to the day the work actually stopped ----------
    portfolio.objectives=[
      {id:'EARLY',divisionId:'D1',initiativeId:'IX',statement:'closed early',plannedStart:TD-100,plannedEnd:TD-10},
      {id:'OPEN', divisionId:'D1',initiativeId:'IX',statement:'still running',plannedStart:TD-100,plannedEnd:TD-10}];
    execDocs["EXEC-D1"].objectiveState=[{objectiveId:'EARLY',status:'achieved',endedDay:TD-40}];
    renderGantt();
    var early=barRight('objective:EARLY'), open=barRight('objective:OPEN');
    ok(early<open, 'an objective closed 30 days early ends where the work stopped, not at its input end date');
    ok(!/gslip/.test(rowHtml('objective:EARLY')), 'finishing early is not a delay — no red');
    ok(/class="gended achieved"/.test(rowHtml('objective:EARLY')), 'the end marker sits at the close date');
    // abandoned behaves the same as achieved
    execDocs["EXEC-D1"].objectiveState=[{objectiveId:'EARLY',status:'abandoned',endedDay:TD-40}];
    renderGantt();
    ok(barRight('objective:EARLY')===early, 'an abandoned objective shrinks identically to an achieved one');
    // closing a few days early is still just the true end (no grace on the shrink side)
    execDocs["EXEC-D1"].objectiveState=[{objectiveId:'EARLY',status:'achieved',endedDay:TD-13}];
    renderGantt();
    ok(barRight('objective:EARLY')<open, 'closing 3 days early still ends the bar there — the grace only suppresses false red');
    execDocs["EXEC-D1"].objectiveState=[];
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>console.log(l));
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} Gantt-patch assertions green`); process.exit(fl.length?1:0); },400);
},450);
