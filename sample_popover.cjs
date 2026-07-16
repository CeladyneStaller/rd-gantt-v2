// Statistical targets take a SAMPLE: the check-in opens a sample popover (not a value input), showing the
// readings, what they compute to, and completeness — and lets a mis-keyed reading be removed.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    var _ra=renderAll; renderAll=function(){};
    portfolio={divisions:[{id:'DV'}],objectives:[{id:'O',statement:'o',divisionId:'DV',plannedStart:0,plannedEnd:9999}],initiatives:[],milestones:[],products:[],models:[],composition:[],kpis:[]};
    divisionId='DV'; selectedObj='O'; exec=blankExec();
    exec.keyResults=[{id:'KR',objectiveId:'O',statement:'kr'}];
    exec.kpis=[
      {id:'ks',objectiveId:'O',hostType:'keyResult',hostId:'KR',name:'Power',direction:'up',unit:'W',target:30,targetType:'statistical',statistic:'average',readCount:5,order:0},
      {id:'kd',objectiveId:'O',hostType:'keyResult',hostId:'KR',name:'Demo',direction:'up',unit:'V',target:1,targetType:'demonstration',order:1}];
    exec.kpiUpdates=[{id:'u1',kpiId:'ks',value:30,timestamp:1000},{id:'u2',kpiId:'ks',value:30,timestamp:1001}];

    var box=document.createElement('div'); box.innerHTML=kpiTable("keyResult","KR",selectedObj); document.body.appendChild(box); wireExec(box);

    // --- statistical cell opens the popover, not an inline input ---
    box.querySelector('[data-postcell="ks"]').onclick();
    var pop=document.getElementById('samplePop');
    ok(!!pop, 'clicking a statistical Current cell opens the sample popover');
    ok(!box.querySelector('[data-postcell="ks"] input'), 'no bare inline value input is opened for a statistical target');
    ok(/Power/.test(pop.innerHTML), 'the popover names the KPI');
    ok(/avg = <b>30<\\/b>/.test(pop.innerHTML), 'it shows what the sample computes to (avg = 30)');
    ok(/2 \\/ 5/.test(pop.innerHTML) && /sp-cnt warn/.test(pop.innerHTML), 'it shows completeness against the expected count (2 / 5, warn)');
    ok(/target \\u2265 30 W/.test(pop.innerHTML), 'it shows the target it is being measured against');
    ok((pop.querySelectorAll('.sp-row')||[]).length===2, 'both existing readings are listed');

    // --- THE BUG THAT MOTIVATED THIS: a repeat reading equal to the current average must post ---
    var before=exec.kpiUpdates.length;
    var inp=pop.querySelector('[data-sp-in]'); inp.value='30';
    pop.querySelector('[data-sp-add]').onclick();
    ok(exec.kpiUpdates.length===before+1, 'a repeat reading equal to the current average IS posted (old ===cur guard silently dropped it)');
    ok(RD.readingCount('ks', emForCore())===3, 'the completeness count advances to 3');
    ok(/3 \\/ 5/.test(document.getElementById('samplePop').innerHTML), 'the popover refreshes to 3 / 5 in place');

    // --- remove is armed (house convention), then removes by reference ---
    pop=document.getElementById('samplePop');
    var n0=exec.kpiUpdates.length;
    pop.querySelector('[data-sp-rm="0"]').onclick();
    ok(exec.kpiUpdates.length===n0, 'first click on remove only arms it (nothing deleted yet)');
    ok(/confirm/.test(document.getElementById('samplePop').innerHTML), 'the armed remove shows a confirm affordance');
    document.getElementById('samplePop').querySelector('[data-sp-rm="0"]').onclick();
    ok(exec.kpiUpdates.length===n0-1, 'confirming removes exactly one reading');
    ok(RD.readingCount('ks', emForCore())===2, 'the sample shrinks back to 2 readings');

    // --- readings with no id (ETB-written) are still removable (removal is by reference) ---
    exec.kpiUpdates.push({kpiId:'ks',value:99,timestamp:9999,note:'exp EXP-001'});   // no id
    renderSamplePop();
    var p2=document.getElementById('samplePop');
    ok(/EXP-001/.test(p2.innerHTML), 'an ETB-written reading shows its provenance note');
    var n1=exec.kpiUpdates.length;
    p2.querySelector('[data-sp-rm="0"]').onclick();                                   // newest first -> the id-less one
    document.getElementById('samplePop').querySelector('[data-sp-rm="0"]').onclick();
    ok(exec.kpiUpdates.length===n1-1 && !exec.kpiUpdates.some(u=>u.value===99), 'an id-less reading is removed correctly (by reference, not id)');

    // --- Escape closes ---
    document.dispatchEvent(new w2.KeyboardEvent('keydown',{key:'Escape'}));
    ok(!document.getElementById('samplePop'), 'Escape closes the popover');

    // --- non-statistical KPIs keep the inline input (no regression) ---
    var cd=box.querySelector('[data-postcell="kd"]'); cd.onclick();
    ok(!document.getElementById('samplePop'), 'a demonstration KPI does NOT open the sample popover');
    ok(!!cd.querySelector('input'), 'a demonstration KPI still opens the inline value input');
    renderAll=_ra;
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.defaultView.w2 = d.defaultView;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} sample-popover assertions green`); process.exit(fl.length?1:0); },400);
},450);
