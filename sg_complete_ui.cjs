const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true});
const w=dom.window;
if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net'));
w.cytoscape=function(){ return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0,select(){}};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},elements(){return{length:0};},$(){return{unselect(){}};}}; };
setTimeout(()=>{ const d=w.document, s=d.createElement('script');
  s.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    portfolio={divisions:[{id:'D'}],initiatives:[],milestones:[],products:[],models:[],
      objectives:[{id:'O',divisionId:'D',plannedStart:80,plannedEnd:200}]};
    divisionId='D'; selectedObj='O'; selectedQuarter=null; exec=blankExec();
    exec.stageGateSets=[{id:'S',objectiveId:'O',name:'Set A',order:0,chained:true}];
    exec.stageGates=[
      {id:'gFull',objectiveId:'O',setId:'S',name:'Full',plannedDate:100},
      {id:'gPart',objectiveId:'O',setId:'S',name:'Part',plannedDate:110},
      {id:'gNone',objectiveId:'O',setId:'S',name:'None',plannedDate:120},
      {id:'gDone',objectiveId:'O',setId:'S',name:'Prior',plannedDate:90,actualDate:95,completionMethod:'manual'} ];
    exec.kpis=[
      {id:'Kf',objectiveId:'O',hostType:'stageGate',hostId:'gFull',name:'Voltage',direction:'up',target:10,unit:'V'},
      {id:'Kp',objectiveId:'O',hostType:'stageGate',hostId:'gPart',name:'Current',direction:'up',target:10,unit:'A'} ];
    exec.kpiUpdates=[ {id:'u1',kpiId:'Kf',value:10,timestamp:1}, {id:'u2',kpiId:'Kp',value:5,timestamp:1} ];

    renderAll();   // fires autoCompleteGates
    const gF=exec.stageGates.find(x=>x.id==='gFull'), gP=exec.stageGates.find(x=>x.id==='gPart'),
          gN=exec.stageGates.find(x=>x.id==='gNone'), gD=exec.stageGates.find(x=>x.id==='gDone');
    ok(gF.actualDate!=null && gF.completionMethod==='auto', '100% gate auto-completes as method=auto');
    ok(gP.actualDate==null, '50% gate does NOT auto-complete');
    ok(gN.actualDate==null && gN.completionMethod==null, 'no-KPI gate does NOT auto-complete (0/0 guard)');
    ok(gD.actualDate===95 && gD.completionMethod==='manual', 'already-passed gate untouched');

    const sg=document.getElementById('subSG').innerHTML;
    ok(/data-completion="gFull"/.test(sg) && /passed-label/.test(sg), 'auto-completed gate shows a clickable passed-label');
    ok(/data-markcomplete="gPart"/.test(sg) && /data-markcomplete="gNone"/.test(sg), 'incomplete gates show a Mark-complete button');
    ok(!/data-pass=/.test(sg), 'old passed-date input is gone');
    ok(/data-completion="gDone"/.test(sg), 'prior manual gate also shows the passed-label');

    // Mark-complete modal on the 50% gate
    openMarkComplete('gPart');
    var mb=document.getElementById('modalBody');
    ok(/Completed date/.test(mb.innerHTML) && /Override justification/.test(mb.innerHTML), 'mark-complete modal has date + optional justification');
    mb.querySelector('#mcDate').value='2026-05-30'; mb.querySelector('#mcJust').value='accepted with waiver';
    mb.querySelector('[data-mc-save]').click();
    ok(gP.actualDate!=null && gP.completionMethod==='manual' && gP.overrideJustification==='accepted with waiver', 'manual complete sets date + method=manual + justification');

    // Detail modal on the AUTO gate -> Targets achieved + KPI table
    openGateDetail('gFull'); mb=document.getElementById('modalBody');
    ok(/Targets achieved/.test(mb.innerHTML), 'auto gate detail shows "Targets achieved"');
    ok(/gc-kpi/.test(mb.innerHTML) && /Voltage/.test(mb.innerHTML) && /10 V/.test(mb.innerHTML), 'detail lists the gate KPIs with target');
    closeModal();

    // Detail modal on the MANUAL gate -> justification + un-complete
    openGateDetail('gPart'); mb=document.getElementById('modalBody');
    ok(/Manual override/.test(mb.innerHTML) && /accepted with waiver/.test(mb.innerHTML), 'manual gate detail shows override + justification');
    mb.querySelector('[data-gc-uncomplete]').click();
    ok(gP.actualDate==null && gP.completionMethod==null && gP.overrideJustification==null, 'un-complete clears date/method/justification (sticks: gate below target)');
   }catch(e){ out.push('FAIL threw: '+e.message+'  '+(e.stack||'').split('\\n')[1]); }
   document.body.setAttribute('data-out', out.join('\\n'));
  })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ const o=(d.body.getAttribute('data-out')||'').split('\n'); const f=o.filter(x=>x.startsWith('FAIL'));
    o.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    console.log(f.length?`\n${f.length}/${o.length} FAILED`:`\nPASS — ${o.length} stage-gate completion UI assertions green`); process.exit(f.length?1:0);
  },400);
},500);
