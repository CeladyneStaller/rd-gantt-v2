// An objective with two stage-gate SETS (workstreams) runs them in PARALLEL. The overview tile took gates flat
// by objectiveId, so both sets merged into one date-ordered strip and read as a single series. One lane per set now.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var o=[]; function ok(c,m){ o.push((c?'ok  ':'FAIL ')+m); }
   function lanes(html){ var x=document.createElement('div'); x.innerHTML=html; return x.querySelectorAll('.gdots'); }
   try{
    var TD=todayDay();
    // TWO parallel workstreams whose dates INTERLEAVE — a flat strip would shuffle them into one series
    execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],
      stageGateSets:[{id:'S1',objectiveId:'O1',name:'Membrane',order:0},{id:'S2',objectiveId:'O1',name:'Stack',order:1}],
      stageGates:[{id:'GA1',objectiveId:'O1',setId:'S1',name:'A1',plannedDate:TD+10},
                  {id:'GB1',objectiveId:'O1',setId:'S2',name:'B1',plannedDate:TD+20},
                  {id:'GA2',objectiveId:'O1',setId:'S1',name:'A2',plannedDate:TD+30},
                  {id:'GB2',objectiveId:'O1',setId:'S2',name:'B2',plannedDate:TD+40}] } };
    portfolio={ divisions:[{id:'D1',name:'Div'}], products:[{id:'P1',name:'Prod',divisionId:'D1'}], models:[], kpis:[], milestones:[],
      initiatives:[{id:'I1',divisionId:'D1',name:'Init',productId:'P1',plannedStart:TD-20,plannedEnd:TD+300}],
      objectives:[{id:'O1',divisionId:'D1',initiativeId:'I1',productId:'P1',statement:'Obj',plannedStart:TD-10,plannedEnd:TD+120}] };

    var em=pfMap(), pool=poolOf(em), casc=RD.cascade(portfolio, em, todayDay());
    var html=ovObjTile(portfolio.objectives[0], em, pool, casc);

    ok(lanes(html).length===2, 'two workstreams render TWO lanes, not one merged strip');
    ok(html.indexOf('Gates 0/4')>=0, 'the header still counts every gate across both workstreams');
    // each lane holds only its own set's gates, in its own order
    var L=lanes(html);
    ok(L[0].querySelectorAll('.gdot,[class*=gdot]').length===2 && L[1].querySelectorAll('.gdot,[class*=gdot]').length===2,
       'each lane holds its own two gates (4 interleaved gates did not collapse into one series)');
    ok(L[0].textContent.indexOf('A')===0, 'the first lane is labelled A');
    ok(L[1].textContent.indexOf('B')===0, 'the second lane is labelled B');
    ok(html.indexOf('title="Membrane"')>=0 && html.indexOf('title="Stack"')>=0, 'each lane label carries its set name as a tooltip');

    // ---- a single workstream keeps the old plain strip ----
    execDocs["EXEC-D1"].stageGateSets=[{id:'S1',objectiveId:'O1',name:'Only',order:0}];
    execDocs["EXEC-D1"].stageGates=[{id:'GA1',objectiveId:'O1',setId:'S1',name:'A1',plannedDate:TD+10},
                                    {id:'GA2',objectiveId:'O1',setId:'S1',name:'A2',plannedDate:TD+30}];
    em=pfMap(); pool=poolOf(em); casc=RD.cascade(portfolio, em, todayDay());
    var h1=ovObjTile(portfolio.objectives[0], em, pool, casc);
    ok(lanes(h1).length===1, 'a lone workstream renders a single lane');
    ok(h1.indexOf('wslbl')<0, '...with no A/B label — the common case is unchanged');
    ok(h1.indexOf('Gates 0/2')>=0, '...and still counts its gates');

    // ---- ungrouped gates (no setId) still show ----
    execDocs["EXEC-D1"].stageGateSets=[];
    execDocs["EXEC-D1"].stageGates=[{id:'GX',objectiveId:'O1',name:'X',plannedDate:TD+10}];
    em=pfMap(); pool=poolOf(em); casc=RD.cascade(portfolio, em, todayDay());
    var h2=ovObjTile(portfolio.objectives[0], em, pool, casc);
    ok(lanes(h2).length===1 && h2.indexOf('Gates 0/1')>=0, 'a gate with no set still renders (the Ungrouped bucket)');

    // ---- no gates at all ----
    execDocs["EXEC-D1"].stageGates=[];
    em=pfMap(); pool=poolOf(em); casc=RD.cascade(portfolio, em, todayDay());
    var h3=ovObjTile(portfolio.objectives[0], em, pool, casc);
    ok(lanes(h3).length===0 && h3.indexOf('Gates ')<0, 'no gates renders no gate block at all');

    // ---- three workstreams -> three lanes, A B C ----
    execDocs["EXEC-D1"].stageGateSets=[{id:'S1',objectiveId:'O1',name:'One',order:0},{id:'S2',objectiveId:'O1',name:'Two',order:1},{id:'S3',objectiveId:'O1',name:'Three',order:2}];
    execDocs["EXEC-D1"].stageGates=[{id:'G1',objectiveId:'O1',setId:'S1',name:'a',plannedDate:TD+10},
                                    {id:'G2',objectiveId:'O1',setId:'S2',name:'b',plannedDate:TD+10},
                                    {id:'G3',objectiveId:'O1',setId:'S3',name:'c',plannedDate:TD+10}];
    em=pfMap(); pool=poolOf(em); casc=RD.cascade(portfolio, em, todayDay());
    var h4=ovObjTile(portfolio.objectives[0], em, pool, casc);
    var L4=lanes(h4);
    ok(L4.length===3, 'three workstreams render three lanes');
    ok(L4[2].textContent.indexOf('C')===0, '...labelled through to C, matching the Gantt SG-A/B/C scheme');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(o));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]');
    out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    const fl=out.filter(x=>x.startsWith('FAIL'));
    console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} overview workstream-lane assertions green`);
    process.exit(fl.length?1:0); },400);
},450);
