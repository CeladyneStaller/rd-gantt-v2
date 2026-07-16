// myObjectives no longer hides layer:"roadmap" objectives. Division scoping must still hold.
// Fixture mirrors Corey's live data (OBJ-FC roadmap, OBJ-EXP execution cross-division, no-layer objectives).
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    portfolio={ divisions:[{id:'DIV-FC'},{id:'DIV-EL'},{id:'DIV-EXP'}], initiatives:[], milestones:[], products:[], models:[], composition:[], kpis:[],
      objectives:[
        {id:'OBJ-FC-2026Q1-01', divisionId:'DIV-FC',  statement:'Full R2R Produced Membrane', layer:'roadmap'},
        {id:'OBJ-FC-2026Q3-01', divisionId:'DIV-FC',  statement:'R2R Pre-Pilot Demonstration', layer:'roadmap'},
        {id:'OBJ-FC-2026Q1-09', divisionId:'DIV-FC',  statement:'bench work', layer:'execution'},
        {id:'OBJ-FC-2026Q1-10', divisionId:'DIV-FC',  statement:'newly created in planning'},          // no layer at all
        {id:'OBJ-EXP-2026Q1-01',divisionId:'DIV-EXP', statement:'Develop the steelmaking model', layer:'execution'},
        {id:'OBJ-EL-2026Q1-02', divisionId:'DIV-EL',  statement:'Functional Enapter System', layer:'roadmap'}
      ] };
    divisionId='DIV-FC';
    var ids=myObjectives().map(o=>o.id);
    ok(ids.indexOf('OBJ-FC-2026Q1-01')>=0 && ids.indexOf('OBJ-FC-2026Q3-01')>=0, 'roadmap-layer objectives are now visible in the execution app');
    ok(ids.indexOf('OBJ-FC-2026Q1-09')>=0, 'execution-layer objectives are still visible');
    ok(ids.indexOf('OBJ-FC-2026Q1-10')>=0, 'an objective with no layer field at all is still visible');
    ok(ids.length===4, 'every objective in the division shows, regardless of layer (4 of 4)');
    ok(ids.indexOf('OBJ-EL-2026Q1-02')<0 && ids.indexOf('OBJ-EXP-2026Q1-01')<0, 'division scoping still holds — other divisions are excluded');
    divisionId='DIV-EXP';
    var e=myObjectives().map(o=>o.id);
    ok(e.length===1 && e[0]==='OBJ-EXP-2026Q1-01', 'the cross-division OBJ-EXP objective shows under its own division (DIV-EXP)');
    divisionId='DIV-EL';
    var l=myObjectives().map(o=>o.id);
    ok(l.length===1 && l[0]==='OBJ-EL-2026Q1-02', 'DIV-EL now surfaces its roadmap objective (was hidden before)');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>console.log(l));
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} layer-filter assertions green`); process.exit(fl.length?1:0); },400);
},450);
