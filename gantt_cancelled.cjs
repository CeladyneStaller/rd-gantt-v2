// Gantt: an ABANDONED objective's unfinished stage-gates render "cancelled" (distinct diamond) and its
// set bar goes cancelled; the objective's slip-extension is suppressed. An ACTIVE objective is untouched.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    execDocs={ "EXEC-D1":{ objectiveState:[{objectiveId:'O2',status:'abandoned',endedDay:50}],
      keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],
      stageGateSets:[{id:'WS1',objectiveId:'O1',name:'s1',order:0},{id:'WS1b',objectiveId:'O1',name:'s1b',order:1},
                     {id:'WS2',objectiveId:'O2',name:'s2',order:0},{id:'WS2b',objectiveId:'O2',name:'s2b',order:1}],
      stageGates:[{id:'g1',objectiveId:'O1',setId:'WS1',name:'gate1',plannedDate:200},
                  {id:'g1b',objectiveId:'O1',setId:'WS1b',name:'gate1b',plannedDate:200},
                  {id:'g2',objectiveId:'O2',setId:'WS2',name:'gate2',plannedDate:200},
                  {id:'g2b',objectiveId:'O2',setId:'WS2b',name:'gate2b',plannedDate:200}] } };
    portfolio={ divisions:[{id:'D1',name:'Div'}], initiatives:[{id:'I1',divisionId:'D1',name:'Init',plannedStart:0,plannedEnd:300}],
      objectives:[{id:'O1',divisionId:'D1',initiativeId:'I1',quarter:'Q1 2026',statement:'active',plannedStart:0,plannedEnd:100},
                  {id:'O2',divisionId:'D1',initiativeId:'I1',quarter:'Q1 2026',statement:'killed',plannedStart:0,plannedEnd:100}],
      milestones:[],products:[],models:[] };
    renderGantt();
    var gw=document.getElementById('ganttWrap').innerHTML;
    var cnlDia=(gw.match(/class="gdia [^"]*cancelled/g)||[]);
    ok(cnlDia.length===2, 'both gates under the abandoned objective are cancelled, and none under the active one');
    ok(/gdia gsq overdue cancelled/.test(gw), 'the cancelled gate is a SQUARE and keeps its state class + gains the cancelled class');
    ok((gw.match(/gsetbar cancelled/g)||[]).length===2, 'both of the abandoned objective workstream bars are cancelled');
    // control: the active objective O1's gate is a normal (non-cancelled) diamond
    ok(/class="gdia gsq overdue"/.test(gw), 'the active objective gate marker is left normal (not cancelled)');
    // legend gained the cancelled key
    ok(/>cancelled<\\/span>/.test(gw), 'the Gantt legend shows a "cancelled" key');
    // Request 1: workstream (set) bar starts at the OBJECTIVE start (left:0), not the first gate's due date
    ok(/gsetbar[^"]*" style="left:0px/.test(gw), 'workstream bar starts at the objective start (left:0), not the first gate due date');
    // Request 2: the abandoned objective's incomplete gate sits at its PLANNED date -> left of the active gate's forecast
    var m1=gw.match(/class="gdia gsq overdue" style="left:([0-9.]+)px/);
    var m2=gw.match(/class="gdia gsq overdue cancelled[^"]*" style="left:([0-9.]+)px/);
    ok(m1 && m2 && parseFloat(m2[1]) < parseFloat(m1[1]), 'ended objective: cancelled gate sits at its planned date, left of the active gate forecast');
    // Request 2.1: an abandon marker is drawn on the abandoned objective row
    ok(/class="gended abandoned"/.test(gw), 'an abandon marker (gended) is rendered on the abandoned objective row');

    // ---------- gates left unhit by an ABANDONED objective read as missed (red); an ACHIEVED one stays grey ----------
    var TD=todayDay();
    execDocs["EXEC-D1"].stageGates.push({id:'gp',objectiveId:'O2',setId:'WS2',name:'passed one',plannedDate:TD-50,actualDate:TD-55});
    renderGantt();
    var gw2=document.getElementById('ganttWrap').innerHTML;
    ok((gw2.match(/gdia [^"]*cancelled missed/g)||[]).length===2, 'both unhit gates under the abandoned objective are marked missed');
    ok(gw2.indexOf('title="missed')>=0, 'a missed gate says so on hover');
    ok(!/gdia passed[^"]*missed/.test(gw2), 'a gate that WAS hit before the abandon stays a normal passed diamond');
    // flip O2 to achieved: the same unhit gates stay grey (cancelled, not missed)
    execDocs["EXEC-D1"].objectiveState=[{objectiveId:'O2',status:'achieved',endedDay:50}];
    renderGantt();
    var gw3=document.getElementById('ganttWrap').innerHTML;
    ok((gw3.match(/cancelled missed/g)||[]).length===0, 'unhit gates under an ACHIEVED objective are NOT marked missed');
    ok((gw3.match(/gdia [^"]*cancelled/g)||[]).length===2, 'they stay cancelled (grey) — the work simply stopped');
    ok(gw3.indexOf('>missed</span>')>=0, 'the legend carries a missed key');
    execDocs["EXEC-D1"].objectiveState=[{objectiveId:'O2',status:'abandoned',endedDay:50}];
   }catch(e){ ok(false,'threw: '+e.message+' @ '+(e.stack||'').split('\\n')[1]); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>console.log(l));
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} Gantt-cancelled assertions green`); process.exit(fl.length?1:0); },400);
},400);
