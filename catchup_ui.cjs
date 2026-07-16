// Catch-up plan: schedule alarm (slip>threshold) + Build button; enact snapshots original->new and
// re-dates gates; SG section shows banner + per-gate recommit; revise preserves the true original;
// clear removes it; the modal requires every unfinished gate to be dated before Enact.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
function mockCy(w){ w.cytoscape=function(){ return { on(){}, ready(cb){try{cb&&cb();}catch(e){}}, fit(){}, resize(){}, destroy(){}, getElementById(){return{length:0,select(){}};}, zoom(){return 1;}, width(){return 800;}, height(){return 560;}, layout(){return{run(){}};}, elements(){return{length:0};}, $(){return{unselect(){}};} }; }; }
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); mockCy(w); }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); } var D=document;
   try{
    portfolio={divisions:[{id:'DV'}],objectives:[{id:'O',statement:'o',divisionId:'DV',plannedStart:0,plannedEnd:100}],initiatives:[],milestones:[],products:[],models:[],composition:[],kpis:[]};
    divisionId='DV'; selectedObj='O'; exec=blankExec();
    exec.stageGateSets=[{id:'WS',objectiveId:'O',name:'MEA',order:0,chained:true}];
    exec.stageGates=[{id:'S1',objectiveId:'O',setId:'WS',name:'done',plannedDate:20,actualDate:18},
      {id:'S2',objectiveId:'O',setId:'WS',name:'late-a',plannedDate:200},
      {id:'S3',objectiveId:'O',setId:'WS',name:'late-b',plannedDate:300}];

    // engine helpers with no plan
    ok(RD.activeCatchupPlan(exec.catchupPlans,'O')===null, 'no plan -> activeCatchupPlan null');

    // (1) alarm + button appear when slip > threshold
    var strip=objMetricStrip(portfolio.objectives[0]);
    ok(/sched-alarm/.test(strip) && /data-catchup="O"/.test(strip), 'slip>10 -> Schedule card gets alarm glow + Build catch-up button');

    // (2) enact re-dates gates + snapshots original->new (finished gate untouched)
    enactCatchup('O', {S2:50, S3:60});
    ok(exec.stageGates.find(g=>g.id==='S2').plannedDate===50 && exec.stageGates.find(g=>g.id==='S3').plannedDate===60, 'enact sets new plannedDates');
    ok(exec.stageGates.find(g=>g.id==='S1').plannedDate===20, 'finished gate keeps its date');
    var plan=RD.activeCatchupPlan(exec.catchupPlans,'O');
    ok(plan && plan.gates.length===2, 'plan record created with exactly the 2 unfinished gates');
    var e2=RD.catchupEntry(exec.catchupPlans,'O','S2');
    ok(e2 && e2.originalDate===200 && e2.newDate===50, 'catchupEntry S2 = {orig 200, new 50}');
    ok(RD.catchupEntry(exec.catchupPlans,'O','S1')===null, 'finished gate has no catchup entry');
    ok(e2.version===1, 'first enact stamps version v1');

    // (3) calm marker once a plan is active (simulate slip back under threshold via an earlier plannedEnd)
    var strip2=objMetricStrip(portfolio.objectives[0]);
    ok(/data-catchup="O"/.test(strip2), 'Schedule card keeps a catch-up affordance while a plan is active');

    // (4) SG section: banner + per-gate recommit + tag
    renderGates(); var sg=D.getElementById('subSG').innerHTML;
    ok(/cu-banner/.test(sg), 'SG section shows the catch-up banner');
    ok((sg.match(/gs-recommit/g)||[]).length===2, 'both re-committed gates show a recommit line');
    ok(/catch-up v1/.test(sg), 'recommit line carries the version label (catch-up v1)');
    ok((sg.match(/cu-tag/g)||[]).length===2, 'both re-committed gates show a re-committed tag');
    ok(/data-catchup-clear="O"/.test(sg) && /data-catchup="O"/.test(sg), 'banner has Revise + Clear controls');

    // (5) revise keeps the TRUE original
    enactCatchup('O', {S2:55, S3:65});
    var e2b=RD.catchupEntry(exec.catchupPlans,'O','S2');
    ok(e2b.originalDate===200 && e2b.newDate===55, 'revise preserves the true original (200) and updates new (55)');
    ok(RD.activeCatchupPlan(exec.catchupPlans,'O').gates.length===2 && exec.catchupPlans.filter(p=>p.objectiveId==='O').length===1, 'revise replaces (still one plan per objective)');
    ok(e2b.version===2, 'revise bumps the gate version to v2');
    renderGates(); ok(/catch-up v2/.test(D.getElementById('subSG').innerHTML), 'recommit line shows catch-up v2 after revise');

    // (6) clear
    clearCatchup('O');
    ok(RD.activeCatchupPlan(exec.catchupPlans,'O')===null, 'clear removes the plan');
    renderGates(); ok(!/cu-banner/.test(D.getElementById('subSG').innerHTML), 'banner gone after clear');

    // (7) modal defaults each new-date to the FORECAST (committed + delay), and requires all dated
    exec.stageGates.find(g=>g.id==='S2').plannedDate = todayDay()-120;   // force S2 clearly overdue -> forecast > committed
    openCatchupModal('O');
    var mb=D.getElementById('modalBody');
    ok(mb.querySelectorAll('.cu-row').length===2, 'modal lists the 2 unfinished gates (finished excluded)');
    var s2row=Array.from(mb.querySelectorAll('.cu-row')).find(r=>/data-cu-date="S2"/.test(r.innerHTML));
    var fcText=s2row.querySelector('.cu-fc').textContent.trim(), s2in=s2row.querySelector('[data-cu-date="S2"]');
    ok(fcText!=='\u2014' && fcText!==dayToIso(todayDay()-120) && s2in.value===fcText, 'new-date input defaults to the forecast (committed+delay), not the committed date');
    var enact=mb.querySelector('[data-cu-enact]');
    ok(enact && !enact.disabled, 'Enact enabled when all rows are pre-dated');
    var inp=mb.querySelector('[data-cu-date]'); inp.value=''; inp.dispatchEvent(new Event('input',{bubbles:true}));
    ok(enact.disabled, 'clearing any date disables Enact');

    // (8) Clear requires typing CLEAR
    closeModal(); enactCatchup('O',{S2:70,S3:80});   // re-establish a plan to clear
    confirmClearCatchup('O'); var cb=D.getElementById('modalBody');
    var clearBtn=cb.querySelector('[data-cu-clearok]'), word=cb.querySelector('[data-cu-clearword]');
    ok(clearBtn && clearBtn.disabled, 'Clear button starts disabled');
    word.value='nope'; word.dispatchEvent(new Event('input',{bubbles:true})); ok(clearBtn.disabled, 'wrong word keeps Clear disabled');
    word.value='CLEAR'; word.dispatchEvent(new Event('input',{bubbles:true})); ok(!clearBtn.disabled, 'typing CLEAR enables Clear');
    clearBtn.click(); ok(RD.activeCatchupPlan(exec.catchupPlans,'O')===null, 'confirming CLEAR clears the plan');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+(e.stack||'').split('\\n')[1]); }
   D.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>console.log(l));
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} catch-up plan assertions green`); process.exit(fl.length?1:0); },500);
},500);
