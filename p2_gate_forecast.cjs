// P2: execution-app renders per-gate forecast surfacing (est + pushed/slip/accel badges) and the
// objective Schedule acceleration line, from RD.cascade. Cytoscape mocked; renderGates/objMetricStrip are globals.
const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true});
const w=dom.window;
try{ w.localStorage.setItem('rd_broker_token','t'); }catch(e){}
if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net'));
w.cytoscape=function(){ return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0,select(){}};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},elements(){return{length:0};},$(){return{unselect(){}};}}; };

setTimeout(()=>{ const d=w.document, s=d.createElement('script');
  s.textContent=`(function(){ try{ var o={}; var T=todayDay();
    portfolio={ divisions:[{id:'D',name:'D'}], initiatives:[], kpis:[], products:[], models:[], composition:[], milestones:[],
      objectives:[ {id:'O1',statement:'Delay',divisionId:'D',plannedStart:T-40,plannedEnd:T+70},
                   {id:'O2',statement:'Accel',divisionId:'D',plannedStart:T-10,plannedEnd:T+40},
                   {id:'O3',statement:'OnPlan',divisionId:'D',plannedStart:T+10,plannedEnd:T+120} ] };
    divisionId='D'; exec=blankExec();
    exec.stageGates=[
      {id:'g1',objectiveId:'O1',setId:'S1',name:'Design freeze',plannedDate:T-30,actualDate:T},   // 30 late (done)
      {id:'g2',objectiveId:'O1',setId:'S1',name:'MEA fab',plannedDate:T+20},                       // future -> pushed
      {id:'g3',objectiveId:'O1',setId:'S1',name:'Durability',plannedDate:T+70},                    // future -> pushed
      {id:'h1',objectiveId:'O2',setId:'S2',name:'Loading',plannedDate:T-10,actualDate:T-40},       // 30 early (done)
      {id:'h2',objectiveId:'O2',setId:'S2',name:'Cost model',plannedDate:T+80},
      {id:'k1',objectiveId:'O3',setId:'S3',name:'Kickoff',plannedDate:T+30},
      {id:'k2',objectiveId:'O3',setId:'S3',name:'Phase 2',plannedDate:T+120} ];
    exec.stageGateSets=[ {id:'S1',objectiveId:'O1',name:'Qual',chained:true}, {id:'S2',objectiveId:'O2',name:'Cost',chained:true}, {id:'S3',objectiveId:'O3',name:'Plan',chained:true} ];

    selectedObj='O1'; renderGates(); o.gatesO1=document.getElementById('subSG').innerHTML; o.stripO1=objMetricStrip(objById('O1'));
    selectedObj='O2'; renderGates(); o.gatesO2=document.getElementById('subSG').innerHTML; o.stripO2=objMetricStrip(objById('O2'));
    selectedObj='O3'; renderGates(); o.gatesO3=document.getElementById('subSG').innerHTML; o.stripO3=objMetricStrip(objById('O3'));
    document.body.setAttribute('data-out',JSON.stringify(o));
  }catch(e){ document.body.setAttribute('data-out','ERR: '+e.message+' @ '+((e.stack||'').split(String.fromCharCode(10))[1]||'')); } })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ const raw=d.body.getAttribute('data-out')||'{}';
    if(raw.indexOf('ERR:')===0){ console.log(raw); process.exit(1); }
    const o=JSON.parse(raw); let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};
    const G1=o.gatesO1, G2=o.gatesO2;
    // --- delay objective (O1) ---
    ok(/finished \+30d late/.test(G1), 'late gate g1 badged "finished +30d late"');
    ok(/fc-badge pushed/.test(G1), 'downstream gate carries a "pushed" badge');
    ok((G1.match(/pushed \+30d/g)||[]).length>=2, 'both g2 and g3 show "pushed +30d"');
    ok(/pushed \+30d by /.test(G1), 'pushed badge names its upstream driver');
    ok(/class="fc-est late"/.test(G1), 'pushed gates show an est forecast date');
    ok(/\+30d behind schedule/.test(o.stripO1), 'objective Schedule card shows +30d behind schedule (work-basis)');
    ok(!/acceleration possible/.test(o.stripO1), 'no acceleration line while running late');
    // --- acceleration objective (O2) ---
    ok(/finished 30d early/.test(G2), 'early gate h1 badged "finished 30d early"');
    ok(/could finish .* \(30d earlier\)/.test(G2), 'undone gate h2 flags a 30d acceleration opportunity');
    ok(/fc-badge accel/.test(G2), 'acceleration uses the accel badge (green)');
    ok(!/fc-badge pushed/.test(G2), 'no pushed badge when nothing slipped');
    ok(/30d acceleration possible/.test(o.stripO2), 'objective Schedule shows "30d acceleration possible"');
    ok(/on schedule/.test(o.stripO2), 'O2 gates are each on their own plan -> on schedule (work-basis); acceleration still flags the pull-in opportunity');
    ok(!/acceleration available/.test(o.stripO2), 'wording is "possible", not "available"');
    ok(!/acceleration possible/.test(o.stripO3), 'on-plan objective shows NO acceleration line (first-gate/undone phantom fixed)');
    ok(!/fc-badge accel/.test(o.gatesO3), 'on-plan undone gates show NO acceleration badge');
    ok(!/fc-badge pushed/.test(o.gatesO3), 'on-plan gates show no pushed badge');
    console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' P2 gate-forecast surfacing assertions green'));
    process.exit(f?1:0);
  },400);
},600);
