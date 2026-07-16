const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
const PORTFOLIO={ divisions:[{id:'D1',name:'Div One'},{id:'D2',name:'Div Two'}],
  initiatives:[], milestones:[], products:[], models:[], composition:[], kpis:[],
  objectives:[ {id:'OA',statement:'A',divisionId:'D1',quarter:'2026Q1',plannedStart:0,plannedEnd:100},
               {id:'OB',statement:'B',divisionId:'D2',quarter:'2026Q1',plannedStart:0,plannedEnd:100},
               {id:'OC',statement:'C',divisionId:'D2',quarter:'2026Q2',plannedStart:0,plannedEnd:100} ] };
const mkCyto=()=>({on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0,select(){}};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},elements(){return{length:0};},$(){return{unselect(){}};}});
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?objective=OC&quarter=2026Q1",pretendToBeVisual:true,
  beforeParse(window){
    window.localStorage.setItem('rd_broker_token','t');
    window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
    window.requestAnimationFrame=cb=>setTimeout(cb,0); window.cancelAnimationFrame=()=>{};
    window.cytoscape=function(){return mkCyto();};
    window.fetch=(url,opts)=>{ const u=String(url);
      if(u.indexOf('/state/portfolio')>=0) return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({doc:PORTFOLIO,version:'1'})});
      if(opts&&opts.method==='PUT') return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({version:'1'})});
      return Promise.resolve({ok:false,status:404,json:()=>Promise.resolve(null)});  // exec + ETB bins -> blank
    };
  }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, s=d.createElement('script');
  s.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    // loadAll already ran with ?objective=OC&quarter=2026Q1 (OC is a D2 / 2026Q2 objective)
    ok(divisionId==='D2', 'robust-resolve switched to the objective\\'s division (D2), overriding the default');
    ok(selectedObj==='OC', 'the deep-linked objective (OC) is selected on load');
    ok(selectedQuarter==='', 'the ?quarter=2026Q1 filter that would hide OC (a Q2 objective) was dropped');

    // compatible filter is preserved
    selectedObj=null; selectedQuarter='2026Q1'; selectedProduct=''; pendingObjective='OB'; fillObjSelect();
    ok(selectedObj==='OB', 'compatible target (OB, Q1) is selected under a ?quarter=2026Q1 filter');
    ok(selectedQuarter==='2026Q1', 'a compatible quarter filter is preserved, not dropped');

    // unknown id -> graceful default
    selectedObj=null; selectedQuarter=''; pendingObjective='ZZZ'; fillObjSelect();
    ok(selectedObj==='OB'||selectedObj==='OC', 'unknown ?objective id falls back to the default first objective');

    // one-shot: consumed, not re-applied
    selectedObj='OC'; pendingObjective=''; fillObjSelect();
    ok(selectedObj==='OC', 'once consumed, a later re-render leaves the selection alone (one-shot)');
   }catch(e){ out.push('FAIL threw: '+e.message+'  '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', out.join('\\n'));
  })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ const o=(d.body.getAttribute('data-out')||'').split('\n'); const f=o.filter(x=>x.startsWith('FAIL'));
    o.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    console.log(f.length?`\n${f.length}/${o.length} FAILED`:`\nPASS — ${o.length} ?objective deep-link assertions green`); process.exit(f.length?1:0);
  },400);
},700);
