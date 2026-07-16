// End objective: freezes the schedule (slip null, forecast frozen at endedDay), header gets an
// End/Reopen control + outcome badge, the Schedule card shows the outcome (no alarm/catch-up), and
// UNFINISHED gates render cancelled (passed gates untouched). Reopen restores everything.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
function mockCy(w){ w.cytoscape=function(){ return { on(){}, ready(cb){try{cb&&cb();}catch(e){}}, fit(){}, resize(){}, destroy(){}, getElementById(){return{length:0,select(){}};}, zoom(){return 1;}, width(){return 800;}, height(){return 560;}, layout(){return{run(){}};}, elements(){return{length:0};}, $(){return{unselect(){}};} }; }; }
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); mockCy(w); }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); } var D=document;
   try{
    portfolio={divisions:[{id:'DV'}],objectives:[{id:'O',statement:'Kill me',divisionId:'DV',plannedStart:0,plannedEnd:100,quarter:'Q1 2026'}],initiatives:[],milestones:[],products:[],models:[],composition:[],kpis:[]};
    divisionId='DV'; selectedObj='O'; exec=blankExec();
    exec.stageGateSets=[{id:'WS',objectiveId:'O',name:'MEA',order:0,chained:true}];
    exec.stageGates=[{id:'P1',objectiveId:'O',setId:'WS',name:'passed-gate',plannedDate:30,actualDate:28},
      {id:'S2',objectiveId:'O',setId:'WS',name:'open-gate',plannedDate:200}];
    var o=portfolio.objectives[0];

    // ACTIVE state
    ok(RD.objectiveEndState(exec.objectiveState,'O')===null, 'no state -> objectiveEndState null');
    ok(/data-endobj="O"/.test(quarterHeader(o)) && !/obj-ended/.test(quarterHeader(o)), 'active header shows "End objective", no ended badge');
    var stripA=objMetricStrip(o);
    ok(/sched-alarm/.test(stripA), 'active objective with overdue gate trips the schedule alarm');
    var cA=RD.cascade(portfolio, emForCore(), todayDay());
    ok(cA.objectiveScheduleSlip['O']>10, 'active slip climbs ('+cA.objectiveScheduleSlip['O']+')');

    // END it (abandon at day 60)
    endObjective('O','abandoned',60,'ran out of runway');
    ok(exec.objectiveState.length===1 && exec.objectiveState[0].status==='abandoned' && exec.objectiveState[0].endedDay===60, 'endObjective writes the state record');
    var c2=RD.cascade(portfolio, emForCore(), todayDay());
    ok(c2.objectiveScheduleSlip['O']===null, 'slip is neutralized once ended');
    ok(c2.objectiveWorkForecast['O']===60, 'forecast frozen at endedDay (60), not climbing to today');

    // header + strip reflect ended
    ok(/obj-ended abandoned/.test(quarterHeader(o)) && /data-reopenobj="O"/.test(quarterHeader(o)), 'ended header shows Abandoned badge + Reopen');
    var stripE=objMetricStrip(o);
    ok(/Abandoned/.test(stripE) && !/sched-alarm/.test(stripE), 'Schedule card shows "Abandoned", alarm gone');
    ok(!/catchup-btn/.test(stripE), 'no catch-up button on an ended objective');

    // gates: unfinished -> cancelled, passed -> untouched
    renderGates(); var sg=D.getElementById('subSG').innerHTML;
    ok((sg.match(/st-cancelled/g)||[]).length===1, 'exactly one gate cancelled (the unfinished one)');
    ok(/statepill cancelled/.test(sg) && sg.indexOf('>cancelled<')>=0, 'cancelled gate shows a cancelled pill + a cancelled schedule note');
    ok(/passed 2026/.test(sg) || /passed-label/.test(sg), 'the passed gate is NOT cancelled (keeps its passed state)');

    // catch-up alarm stays quiet even with a live plan on an ended objective
    exec.catchupPlans=[{id:'catchup:O',objectiveId:'O',enactedDay:50,gates:[{gateId:'S2',originalDate:200,newDate:70,version:1}]}];
    ok(!/catchup-btn/.test(objMetricStrip(o)), 'even with an active catch-up plan, an ended objective shows no catch-up affordance');

    // REOPEN restores everything
    reopenObjective('O');
    ok(RD.objectiveEndState(exec.objectiveState,'O')===null, 'reopen clears the state');
    ok(RD.cascade(portfolio, emForCore(), todayDay()).objectiveScheduleSlip['O']>10, 'reopen brings the slip back');
    renderGates(); ok(!/st-cancelled/.test(D.getElementById('subSG').innerHTML), 'reopen un-cancels the gates');

    // MODAL: outcome radio + Save writes a record
    exec.objectiveState=[]; openEndObjectiveModal('O');
    var mb=D.getElementById('modalBody');
    ok(mb.querySelectorAll('.ws-opt[data-eo]').length===2 && mb.querySelector('#eoDate') && mb.querySelector('[data-eo-save]'), 'modal has 2 outcomes, a date, and a Save');
    mb.querySelector('[data-eo="achieved"]').click();
    mb.querySelector('#eoDate').value='2026-01-31';
    mb.querySelector('[data-eo-save]').click();
    var rec=RD.objectiveEndState(exec.objectiveState,'O');
    ok(rec && rec.status==='achieved', 'picking Achieved + Save records status=achieved');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+(e.stack||'').split('\\n')[1]); }
   D.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>console.log(l));
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} objective-end assertions green`); process.exit(fl.length?1:0); },500);
},500);
