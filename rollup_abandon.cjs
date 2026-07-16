// Ended objectives count in EVERY rollup. Abandoned and achieved alike are included in the overall
// division/company score, the quarterly score, and the band counts — an abandoned objective's score is
// part of the record, not something the aggregate forgets. A single objective's own score is untouched.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    execDocs={ "EXEC-D1":{ objectiveState:[],
      keyResults:[{id:'KR1',objectiveId:'O1'},{id:'KR2',objectiveId:'O2'},{id:'KR3',objectiveId:'O3'}],
      kpis:[{id:'k1',objectiveId:'O1',hostType:'keyResult',hostId:'KR1',name:'m',direction:'up',unit:'x',target:100,order:0},
            {id:'k2',objectiveId:'O2',hostType:'keyResult',hostId:'KR2',name:'m',direction:'up',unit:'x',target:100,order:0},
            {id:'k3',objectiveId:'O3',hostType:'keyResult',hostId:'KR3',name:'m',direction:'up',unit:'x',target:100,order:0}],
      kpiUpdates:[{id:'u1',kpiId:'k1',value:100,timestamp:1000},{id:'u2',kpiId:'k2',value:0,timestamp:1000},{id:'u3',kpiId:'k3',value:40,timestamp:1000}],
      stageGates:[],tasks:[],stageGateEdges:[] } };
    portfolio={ divisions:[{id:'D1',name:'Div'}],
      objectives:[{id:'O1',divisionId:'D1',quarter:'Q1 2026',statement:'a'},{id:'O2',divisionId:'D1',quarter:'Q1 2026',statement:'b'},{id:'O3',divisionId:'D1',quarter:'Q1 2026',statement:'c'}],
      initiatives:[],milestones:[],products:[],models:[] };
    var em=pfMap();
    // scores: O1=100, O2=0, O3=40
    ok(Math.round(RD.rollupDivision('D1',portfolio,em))===47, 'baseline overall = mean(100,0,40) = 47 (nothing ended)');

    // abandon O2
    execDocs["EXEC-D1"].objectiveState=[{objectiveId:'O2',status:'abandoned',endedDay:50}]; em=pfMap();
    var ov=Math.round(RD.rollupDivision('D1',portfolio,em));
    ok(ov===47, 'OVERALL counts abandoned O2 -> mean(100,0,40) = 47 (it is not dropped)');
    ok(ov!==70, 'the old exclusion is gone -> overall is NOT mean(100,40) = 70');
    ok(Math.round(RD.score('division','D1',portfolio,em,'Q1 2026'))===47, 'QUARTERLY counts abandoned O2 -> mean(100,0,40) = 47');
    ok(RD.rollupObjective('O2',portfolio,em)===0, "abandoned objective's OWN score is untouched (0)");
    var s1=statusCounts('division','D1',em);
    ok(s1['on-track']===1 && s1['off-track']===2 && (s1['on-track']+s1['at-risk']+s1['off-track']+s1['no-band'])===3,
       'band counts include abandoned (on 1, off 2, total 3)');

    // mark O3 achieved (O2 still abandoned) — achieved must STILL count in overall
    execDocs["EXEC-D1"].objectiveState=[{objectiveId:'O2',status:'abandoned',endedDay:50},{objectiveId:'O3',status:'achieved',endedDay:60}]; em=pfMap();
    ok(Math.round(RD.rollupDivision('D1',portfolio,em))===47, 'ACHIEVED O3 and ABANDONED O2 both count in overall -> mean(100,0,40) = 47');
    var s2=statusCounts('division','D1',em);
    ok(s2['on-track']===1 && s2['off-track']===2, 'both ended objectives still counted in band counts (on 1, off 2)');
    ok(Math.round(RD.score('division','D1',portfolio,em,'Q1 2026'))===47, 'quarterly still mean(100,0,40)=47 (both O2 and O3 present)');

    // company rollup honours it too
    ok(Math.round(RD.rollupCompany(portfolio,em))===47, 'company overall counts abandoned too (47)');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+(e.stack||'').split('\\n')[1]); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>console.log(l));
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} rollup-abandon assertions green`); process.exit(fl.length?1:0); },400);
},400);
