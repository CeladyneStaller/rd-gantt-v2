// Planning-app objective labeling: abandoned/achieved objectives get an "Abandoned"/"Achieved" badge
// wherever they render (tree names, structure table, overview rows/tiles/detail); abandoned names are
// struck through; and an ended objective's overview tile shows "ended <date>" instead of a stale slip.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    execDocs={ "EXEC-D1":{ objectiveState:[{objectiveId:'O2',status:'abandoned',endedDay:50},{objectiveId:'O3',status:'achieved',endedDay:60}],
      keyResults:[],kpis:[],kpiUpdates:[],
      stageGates:[{id:'g2',objectiveId:'O2',plannedDate:200}],  // overdue -> would slip if not ended
      tasks:[],stageGateEdges:[] } };
    portfolio={ divisions:[{id:'D1',name:'Div'}],
      objectives:[{id:'O1',divisionId:'D1',quarter:'Q1 2026',statement:'active one',plannedStart:0,plannedEnd:100},
                  {id:'O2',divisionId:'D1',quarter:'Q1 2026',statement:'killed one',plannedStart:0,plannedEnd:100},
                  {id:'O3',divisionId:'D1',quarter:'Q1 2026',statement:'done one',plannedStart:0,plannedEnd:100}],
      initiatives:[],milestones:[],products:[],models:[] };
    var O1=portfolio.objectives[0], O2=portfolio.objectives[1], O3=portfolio.objectives[2];

    // helper
    ok(pfObjEnd(O2) && pfObjEnd(O2).status==='abandoned', 'pfObjEnd resolves abandoned');
    ok(pfObjEnd(O1)===null, 'active objective -> pfObjEnd null');
    ok(/obj-ended abandoned/.test(objEndBadge(O2)) && /Abandoned/.test(objEndBadge(O2)), 'objEndBadge(abandoned) = Abandoned badge');
    ok(/obj-ended achieved/.test(objEndBadge(O3)) && /Achieved/.test(objEndBadge(O3)), 'objEndBadge(achieved) = Achieved badge');
    ok(objEndBadge(O1)==='', 'objEndBadge(active) = empty');

    // tree name render
    var rn2=rowName("objective",O2), rn3=rowName("objective",O3), rn1=rowName("objective",O1);
    ok(/obj-ended abandoned/.test(rn2) && /obj-struck/.test(rn2), 'tree name: abandoned gets badge + strikethrough');
    ok(/obj-ended achieved/.test(rn3) && !/obj-struck/.test(rn3), 'tree name: achieved gets badge, no strikethrough');
    ok(!/obj-ended/.test(rn1), 'tree name: active objective has no badge');

    // overview tile: badge + "ended <date>" + NO stale slip
    var em=pfMap(), pool=poolOf(em), casc=RD.cascade(portfolio, em, todayDay());
    var tile=ovObjTile(O2, em, pool, casc);
    ok(/obj-ended abandoned/.test(tile), 'overview tile shows the Abandoned badge');
    ok(/ended /.test(tile) && !/d slip/.test(tile), 'ended tile shows "ended <date>" and suppresses the stale +Nd slip');
    var tileActive=ovObjTile(O1, em, pool, casc);
    ok(!/obj-ended/.test(tileActive), 'active tile has no ended badge');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+(e.stack||'').split('\\n')[1]); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>console.log(l));
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} planning-labeling assertions green`); process.exit(fl.length?1:0); },400);
},400);
