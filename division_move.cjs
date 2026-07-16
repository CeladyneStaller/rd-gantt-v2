// Division-move guard. objective.divisionId decides which EXEC-<div> bin holds its KRs/gates, and planning
// can only write the portfolio bin — so a move is warned about (armed), never blocked or auto-"fixed".
// Door 2 = objective's own division changes (strands its exec payload). Door 1 = initiative moves (its
// objectives stay behind). Badge = neutral report of a cross-division objective.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    persistPortfolio=function(){};                                  // no network in the sandbox
    execDocs={ "EXEC-DIV-EL":{ objectiveState:[],keyResults:[{id:'KR1',objectiveId:'OBJ-EL-1'},{id:'KR2',objectiveId:'OBJ-EL-1'}],
                 kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],
                 stageGates:[{id:'g1',objectiveId:'OBJ-EL-1'},{id:'g2',objectiveId:'OBJ-EL-1'},{id:'g3',objectiveId:'OBJ-EL-1'}] },
               "EXEC-DIV-FC":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] },
               "EXEC-DIV-EXP":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] } };
    portfolio={ divisions:[{id:'DIV-EL',name:'Electrolyzer'},{id:'DIV-FC',name:'Fuel Cell'},{id:'DIV-EXP',name:'Experimental'}],
      initiatives:[{id:'INIT-EL-1',divisionId:'DIV-EL',name:'Stack Dev'}],
      objectives:[
        {id:'OBJ-EL-1',   divisionId:'DIV-EL', initiativeId:'INIT-EL-1', statement:'aligned objective', quarter:'Q1 2026'},
        {id:'OBJ-EXP-1',  divisionId:'DIV-EXP',initiativeId:'INIT-EL-1', statement:'Develop the steelmaking model', quarter:'Q1 2026'}
      ], milestones:[], products:[], models:[] };

    // ---------- badge: neutral, only on the cross-division objective ----------
    ok(objXDiv(byId("objective","OBJ-EXP-1"))==='DIV-EXP', 'a cross-division objective is detected');
    ok(objXDiv(byId("objective","OBJ-EL-1"))===null, 'an aligned objective is not flagged');
    var b=objDivBadge(byId("objective","OBJ-EXP-1"));
    ok(/obj-xdiv/.test(b) && /exec: Experimental/.test(b), 'the badge names the executing division ("exec: Experimental")');
    ok(!/mismatch|error|warn|\\u26a0/i.test(b), 'the badge is neutral \\u2014 no error/warning language');
    ok(objDivBadge(byId("objective","OBJ-EL-1"))==='', 'an aligned objective gets no badge');
    ok(objDivBadge({id:'X',divisionId:'DIV-EL'})==='', 'an objective with no initiative gets no badge');
    pfGroupMode="hierarchy"; renderStructTables();
    ok(/obj-xdiv/.test(document.getElementById('structTables').innerHTML), 'the badge renders in the structure table');

    // ---------- Door 2: objective's own division changes ----------
    openEditor("OBJ-EL-1","objective");
    var sel=document.querySelector('#pfModalBody [data-f="divisionId"]');
    sel.value='DIV-FC'; saveRecord();
    ok(byId("objective","OBJ-EL-1").divisionId==='DIV-EL', 'Door 2: the first Save does NOT move the objective');
    var err=document.getElementById('pfModalErr');
    ok(err && !err.hidden, 'Door 2: a warning is shown');
    ok(/2 key results and 3 stage-gates/.test(err.textContent), 'Door 2: the warning counts what would be stranded');
    ok(/Electrolyzer/.test(err.textContent) && /will NOT move/.test(err.textContent), 'Door 2: it names the bin the data stays in');
    // re-arm: switching to a DIFFERENT division must warn again, not consume the existing arm
    sel.value='DIV-EXP'; saveRecord();
    ok(byId("objective","OBJ-EL-1").divisionId==='DIV-EL', 're-arm: picking a different division warns again rather than sliding through');
    saveRecord();                                                   // armed for DIV-EXP -> proceeds
    ok(byId("objective","OBJ-EL-1").divisionId==='DIV-EXP', 'Door 2: Saving again moves it (advisory, not a block)');
    // an objective whose current bin holds nothing has nothing to strand -> moves with no warning
    openEditor("OBJ-EXP-1","objective");
    document.querySelector('#pfModalBody [data-f="divisionId"]').value='DIV-FC';
    saveRecord();
    ok(byId("objective","OBJ-EXP-1").divisionId==='DIV-FC', 'an objective with no execution data in its bin moves with no warning');

    // ---------- Door 1: initiative moves, its objectives stay ----------
    portfolio.objectives=[{id:'OBJ-EL-1',divisionId:'DIV-EL',initiativeId:'INIT-EL-1',statement:'a',quarter:'Q1 2026'},
                          {id:'OBJ-EL-2',divisionId:'DIV-EL',initiativeId:'INIT-EL-1',statement:'b',quarter:'Q1 2026'}];
    openEditor("INIT-EL-1","initiative");
    document.querySelector('#pfModalBody [data-f="divisionId"]').value='DIV-FC';
    saveRecord();
    ok(byId("initiative","INIT-EL-1").divisionId==='DIV-EL', 'Door 1: the first Save does NOT move the initiative');
    var e2=document.getElementById('pfModalErr');
    ok(/2 objectives stay in Electrolyzer/.test(e2.textContent), 'Door 1: the warning names how many objectives stay behind');
    ok(/remain in Electrolyzer in the execution app/.test(e2.textContent), 'Door 1: it explains the planning/execution divergence');
    saveRecord();
    ok(byId("initiative","INIT-EL-1").divisionId==='DIV-FC', 'Door 1: Saving again moves it');
    ok(byId("objective","OBJ-EL-1").divisionId==='DIV-EL', 'Door 1: the objectives genuinely stay put (no silent auto-sync)');

    // an initiative with no aligned objectives moves silently
    portfolio.objectives=[];
    openEditor("INIT-EL-1","initiative");
    document.querySelector('#pfModalBody [data-f="divisionId"]').value='DIV-EL';
    saveRecord();
    ok(byId("initiative","INIT-EL-1").divisionId==='DIV-EL', 'an initiative with no objectives moves with no warning');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} division-move guard assertions green`); process.exit(fl.length?1:0); },400);
},450);
