// Shape says WHAT a thing is; colour says how it's doing. Stage-gates are squares, milestones are diamonds,
// and the status pill echoes the same vocabulary. Milestone glyphs in the initiative panel were previously
// hardcoded colourless.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var o=[]; function ok(c,m){ o.push((c?'ok  ':'FAIL ')+m); }
   try{
    var TD=todayDay();
    execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],
      stageGates:[{id:'G1',objectiveId:'O1',name:'Gate A',plannedDate:TD+30,workstream:'W'},
                  {id:'G2',objectiveId:'O1',name:'Gate B',plannedDate:TD+60,workstream:'W'}] } };
    portfolio={ divisions:[{id:'D1',name:'Div'}], products:[], models:[], kpis:[],
      initiatives:[{id:'I1',divisionId:'D1',name:'Init',plannedStart:TD-20,plannedEnd:TD+300}],
      objectives:[{id:'O1',divisionId:'D1',initiativeId:'I1',statement:'Obj',plannedStart:TD-10,plannedEnd:TD+120}],
      milestones:[{id:'M1',initiativeId:'I1',name:'Late demo',plannedDate:TD+100,completedDate:TD+130}] };
    pfGroupMode="hierarchy"; ganttCollapsed=new Set(); renderGantt();
    var g=document.getElementById('ganttWrap').innerHTML;

    // ---- 1) two different symbols ----
    ok(/class="gdia gsq/.test(g), 'stage-gates render with the square modifier (gsq)');
    ok((g.match(/class="gdia gsq/g)||[]).length>=1, '...on their markers');
    var msDia=g.match(/class="gdia (?!gsq)[a-z-]+"/g)||[];
    ok(msDia.length>=1, 'milestones render a plain gdia (diamond), with no square modifier');
    // the CSS actually distinguishes them: gsq removes the 45-degree rotation
    var css=document.documentElement.innerHTML;
    ok(css.indexOf('.gdia{position:absolute')>=0 && css.indexOf('rotate(45deg)')>=0, 'the base .gdia is rotated 45deg (a diamond)');
    ok(/\\.gdia\\.gsq\\{transform:translateX\\(-50%\\);/.test(css), '.gdia.gsq drops the rotation (a square)');

    // ---- 2) pill shape follows the kind ----
    ok(bandHtml(95).indexOf('class="band on-track"')>=0, 'division/initiative/objective keep the current capsule pill');
    ok(bandHtml(95,'stagegate').indexOf('band on-track sq')>=0, 'a stage-gate pill is square');
    ok(bandHtml(95,'milestone').indexOf('band on-track dia')>=0, 'a milestone pill is diamond');
    ok(bandShape('objective')==='' && bandShape('division')==='', 'other kinds are unmodified');
    ok(css.indexOf('.band.sq{border-radius:3px}')>=0, '.band.sq squares the corners');
    ok(css.indexOf('.band.dia{')>=0 && css.indexOf('clip-path:polygon')>=0, '.band.dia is clipped to a pointed shape');
    // the milestones tab uses the diamond pill
    renderMilestones();
    ok(document.getElementById('msBody').innerHTML.indexOf('band on-track dia')>=0 ||
       /band [a-z-]+ dia/.test(document.getElementById('msBody').innerHTML), 'the milestones tab status pill is a diamond pill');

    // ---- the Gantt ROW dot: circle for spans, diamond for a milestone ----
    // NOTE: indexOf only. A slash-regex here gets mangled by the template literal (\( collapses to "(").
    ok(g.indexOf('class="gdot dia" style="background:var(--')>=0, 'the Gantt milestone row dot is a diamond AND coloured');
    ok(g.indexOf('class="gdot" style="background:var(--')>=0, 'division/initiative/objective row dots stay circles');
    ok(dotShape('milestone')===' dia' && dotShape('objective')==='' && dotShape('division')==='', 'dotShape only diamonds milestones');
    ok(css.indexOf('.gdot.dia{')>=0 && css.indexOf('rotate(45deg)')>=0, '.gdot.dia rotates the circle into a diamond');

    // ---- the Structure TABLE milestone row (renderStructTables) ----
    renderPortfolio();
    var stt=document.getElementById('structTables').innerHTML;
    ok(stt.indexOf('s-ms')>=0, 'the structure table lists milestones under their initiative');
    ok(stt.indexOf('class="s-indent">\u25c6')<0, 'the structure table no longer emits a bare uncoloured diamond glyph');
    ok(stt.indexOf('class="mdia" style="color:var(--')>=0, '...it is now colour-coded from the milestone band');

    // ---- 3) milestone glyphs are colour-coded on the structure side ----
    openEditor('I1','initiative');
    var body=document.getElementById('pfModalBody').innerHTML;
    ok(body.indexOf('class="mdia">')<0, 'the milestone glyph is no longer a bare colourless span');   // note the '>': class="mdia" is a substring of the styled version
    ok(/class="mdia" style="color:var\\(--(ok|warn|bad|none)\\)/.test(body), '...it now carries its band colour');
    // an achieved milestone reads on-track; an unmet, overdue one does not
    ok(nodeBand('milestone','M1')==='on-track', 'a completed milestone bands on-track');
    portfolio.milestones=[{id:'M2',initiativeId:'I1',name:'Unmet',plannedDate:TD-10}];
    openEditor('I1','initiative');
    var b2=document.getElementById('pfModalBody').innerHTML;
    ok(/class="mdia" style="color:var\\(--/.test(b2), 'an unmet milestone glyph is also coloured');
    ok(b2.indexOf('title="')>=0, '...and titled with its band, so the colour is readable');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(o));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]');
    out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    const fl=out.filter(x=>x.startsWith('FAIL'));
    console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} shape-vocabulary assertions green`);
    process.exit(fl.length?1:0); },400);
},450);
