// Milestones read like stage-gates in the Gantt: a grey ghost at the planned date + a status marker at the
// actual date. Early -> green, late -> orange, unmet+overdue -> red, still ahead -> pending.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var o=[]; function ok(c,m){ o.push((c?'ok  ':'FAIL ')+m); }
   function dias(){ return Array.from(document.getElementById('ganttWrap').querySelectorAll('.gdia')).map(e=>e.className); }
   try{
    var TD=todayDay();
    execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] } };
    function boot(ms){ portfolio={ divisions:[{id:'D1',name:'Div'}], products:[], models:[], kpis:[], objectives:[],
      initiatives:[{id:'I1',divisionId:'D1',name:'Init',plannedStart:TD-200,plannedEnd:TD+400}], milestones:[ms] };
      pfGroupMode="hierarchy"; ganttCollapsed=new Set(); renderGantt(); }

    // ---- EARLY completion: grey ghost at planned + GREEN marker at completed ----
    boot({id:'M1',initiativeId:'I1',name:'Early',plannedDate:TD+100,completedDate:TD+80});
    var c=dias();
    ok(c.some(x=>x.indexOf('ghost')>=0), 'early: a grey ghost marks the planned date');
    ok(c.some(x=>x.indexOf('passed')>=0 && x.indexOf('passed-late')<0), 'early: the completion marker is green (passed)');
    ok(document.getElementById('ganttWrap').innerHTML.indexOf('gconn')>=0, 'early: a connector joins planned to completed');
    ok(msDiaClass(portfolio.milestones[0], pfMap())==='passed', 'early completion classifies as passed');

    // ---- LATE completion: grey ghost at planned + ORANGE marker at completed ----
    boot({id:'M2',initiativeId:'I1',name:'Late',plannedDate:TD+100,completedDate:TD+130});
    c=dias();
    ok(c.some(x=>x.indexOf('ghost')>=0), 'late: a grey ghost marks the planned date');
    ok(c.some(x=>x.indexOf('passed-late')>=0), 'late: the completion marker is orange (passed-late)');
    ok(msDiaClass(portfolio.milestones[0], pfMap())==='passed-late', 'late completion classifies as passed-late');
    ok(document.getElementById('ganttWrap').innerHTML.indexOf('completed ')>=0, 'the marker is titled with the completion date');

    // ---- ON TIME: completed exactly on the planned date -> green, and no ghost/connector needed ----
    boot({id:'M3',initiativeId:'I1',name:'OnTime',plannedDate:TD+100,completedDate:TD+100});
    c=dias();
    ok(msDiaClass(portfolio.milestones[0], pfMap())==='passed', 'on-time completion is green, not late');
    ok(!c.some(x=>x.indexOf('ghost')>=0), 'on time: no ghost — planned and actual coincide');

    // ---- NOT completed, planned date already passed -> red ----
    boot({id:'M4',initiativeId:'I1',name:'Overdue',plannedDate:TD-30});
    ok(msDiaClass(portfolio.milestones[0], pfMap())==='overdue', 'an unmet milestone past its planned date is overdue (red)');
    ok(dias().some(x=>x.indexOf('overdue')>=0), '...and renders the red marker');

    // ---- NOT completed, still ahead -> pending ----
    boot({id:'M5',initiativeId:'I1',name:'Future',plannedDate:TD+100});
    ok(msDiaClass(portfolio.milestones[0], pfMap())==='pending', 'an unmet future milestone is pending');
    ok(dias().some(x=>x.indexOf('pending')>=0), '...and renders the pending marker');

    // ---- achieved on KPIs with no completedDate -> still green ----
    boot({id:'M6',initiativeId:'I1',name:'KpiMet',plannedDate:TD+100});
    portfolio.kpis=[{id:'K1',hostType:'milestone',hostId:'M6',name:'P',direction:'up',target:1,targetType:'demonstration',isDefiner:true}];
    portfolio.kpiUpdates=[{id:'u',kpiId:'K1',value:5,timestamp:1}];
    ok(RD.milestoneAchieved(portfolio.milestones[0], pfMap())===true, 'a milestone can be achieved on its KPIs alone');
    ok(msDiaClass(portfolio.milestones[0], pfMap())==='passed', '...and still reads green with no date recorded');

    // ---- the old flat treatment is gone ----
    boot({id:'M7',initiativeId:'I1',name:'Late2',plannedDate:TD+100,completedDate:TD+130});
    ok(!dias().some(x=>/gdia planned($| )/.test(x)), 'the old always-grey "planned" diamond no longer renders for milestones');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(o));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]');
    out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    const fl=out.filter(x=>x.startsWith('FAIL'));
    console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} milestone-diamond assertions green`);
    process.exit(fl.length?1:0); },400);
},450);
