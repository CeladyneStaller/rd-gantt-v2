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
    var T=todayDay(), iso=dayToIso;
    // All three objectives have a large end-buffer (plannedEnd T+40) that HID gate delays before Option A.
    portfolio={divisions:[{id:'D'}],initiatives:[],milestones:[],products:[],models:[],composition:[],kpis:[],
      objectives:[ {id:'OB',statement:'behind',divisionId:'D',plannedStart:T-100,plannedEnd:T+40},
                   {id:'OV',statement:'overdue',divisionId:'D',plannedStart:T-100,plannedEnd:T+40},
                   {id:'OK',statement:'ontime',divisionId:'D',plannedStart:T-100,plannedEnd:T+40} ]};
    divisionId='D'; exec=blankExec();
    exec.stageGateSets=[{id:'SB',objectiveId:'OB',chained:true},{id:'SV',objectiveId:'OV',chained:true},{id:'SK',objectiveId:'OK',chained:true}];
    exec.stageGates=[
      {id:'gb',objectiveId:'OB',setId:'SB',name:'gate',plannedDate:T-60,actualDate:T-10},   // done 50d late, but T-10 < plannedEnd T+40
      {id:'gv',objectiveId:'OV',setId:'SV',name:'gate',plannedDate:T-30},                    // 30d overdue (today T), still < plannedEnd
      {id:'gk',objectiveId:'OK',setId:'SK',name:'gate',plannedDate:T-30,actualDate:T-30} ];  // on time
    selectedObj='OB'; var sb=objMetricStrip(objById('OB'));
    selectedObj='OV'; var sv=objMetricStrip(objById('OV'));
    selectedObj='OK'; var sk=objMetricStrip(objById('OK'));

    ok(/\\+50d behind schedule/.test(sb), 'done-late-within-buffer objective now shows "+50d behind schedule" (was hidden by projEnd)');
    ok(sb.indexOf(iso(T-10))>=0, 'Schedule value = the work forecast (late gate finish T-10), not the buffered plannedEnd T+40');
    ok(sb.indexOf(iso(T+40))>=0, 'planned end (T+40) still shown for reference');
    ok(/var\\(--bad\\)/.test(sb), 'behind-schedule value is red');
    ok(/\\+30d behind schedule/.test(sv), 'overdue-within-buffer objective shows "+30d behind schedule" (was hidden)');
    ok(/on schedule/.test(sk) && !/behind/.test(sk), 'on-time objective shows "on schedule", no delay');
    ok(!/\\dd slip/.test(sb+sv+sk), 'old "Nd slip" wording is gone');
   }catch(e){ out.push('FAIL threw: '+e.message+'  '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', out.join('\\n'));
  })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ const o=(d.body.getAttribute('data-out')||'').split('\n'); const f=o.filter(x=>x.startsWith('FAIL'));
    o.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    console.log(f.length?`\n${f.length}/${o.length} FAILED`:`\nPASS — ${o.length} Schedule-card work-slip UI assertions green`); process.exit(f.length?1:0);
  },400);
},500);
