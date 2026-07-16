const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0,select(){}};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},elements(){return{length:0};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, s=d.createElement('script');
  s.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); } var D=document;
   try{
    var T=todayDay();
    portfolio={divisions:[{id:'D'}],objectives:[{id:'O',statement:'Obj',divisionId:'D',plannedStart:T-30,plannedEnd:T+70}],initiatives:[],milestones:[],products:[],models:[]};
    divisionId='D'; selectedObj='O'; exec=blankExec();
    exec.keyResults=[{id:'kr1',objectiveId:'O',statement:'Hit 1.0 W/cm2 on the short stack'},{id:'kr2',objectiveId:'O',statement:'5000h projected durability'},{id:'kr3',objectiveId:'O',statement:'Qualify the pilot MEA line'}];
    exec.kpis=[
      {id:'a1',objectiveId:'O',hostType:'keyResult',hostId:'kr1',name:'Power',direction:'up',target:1.0,unit:'W/cm2'},
      {id:'b1',objectiveId:'O',hostType:'keyResult',hostId:'kr2',name:'Life factor',direction:'up',target:1.0,unit:'x'} ];
    exec.kpiUpdates=[{kpiId:'a1',value:0.7,timestamp:1},{kpiId:'b1',value:0.05,timestamp:1}];

    renderKRs(); var kr=D.getElementById('subKR').innerHTML;
    ok(/class="krow/.test(kr), 'KRs render as .krow pace rows');
    ok(/kr-band on/.test(kr) && /kr-band risk/.test(kr) && /kr-band none/.test(kr), 'band pills reflect pace (On track / At risk / No data)');
    ok(/pace-fill/.test(kr) && /pace-mark/.test(kr), 'pace meter carries an attainment fill + an elapsed tick');
    ok(/ahead of pace/.test(kr), 'a result beating the pace reads "ahead of pace"');
    ok(/pts behind pace/.test(kr), 'a lagging result shows points behind pace');
    ok(/% elapsed/.test(kr), 'caption notes elapsed % of the objective timeline');
    ok(/Attainment/.test(kr), 'attainment label present');
    ok(/data-krtoggle="kr1"/.test(kr), 'KR with KPIs shows a collapse toggle');
    ok(/add a KPI/.test(kr) && /data-addkpi="keyResult:kr3"/.test(kr), 'KR with no KPIs shows "+ add a KPI"');
    ok(/data-edit="keyResult:kr1"/.test(kr) && /data-del="keyResult:kr1"/.test(kr), 'edit + delete hooks preserved');

    ok(!/class="mtbl"/.test(kr), 'KPI table collapsed by default');
    expandedKRs.add('kr1'); renderKRs(); kr=D.getElementById('subKR').innerHTML;
    ok(/tgt-panel/.test(kr) && /class="mtbl"/.test(kr), 'expanding a KR reveals its aligned KPI table');
    expandedKRs.delete('kr1'); renderKRs(); kr=D.getElementById('subKR').innerHTML;
    ok(!/tgt-panel/.test(kr), 'collapsing hides the KPI table again');
   }catch(e){ out.push('FAIL threw: '+e.message+'  '+((e.stack||'').split('\\n')[1]||'')); }
   D.body.setAttribute('data-out', out.join('\\n'));
  })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ const o=(d.body.getAttribute('data-out')||'').split('\n'); const fl=o.filter(x=>x.startsWith('FAIL'));
    o.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    console.log(fl.length?`\n${fl.length}/${o.length} FAILED`:`\nPASS — ${o.length} KR pace-row assertions green`); process.exit(fl.length?1:0);
  },450);
},500);
