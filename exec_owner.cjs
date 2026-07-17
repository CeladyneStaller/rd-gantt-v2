// The execution app has NO identity — it is scoped by ?division=. So ?owner=<email> is how you narrow to one
// person's objectives, and owners are READ-ONLY here (authored in the planning app).
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const HTML=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

const FIX=`portfolio={divisions:[{id:'D1',name:'D'}],products:[],models:[],initiatives:[],kpis:[],milestones:[],
    objectives:[
      {id:'O1',divisionId:'D1',statement:'shared',quarter:'26Q2',owner:['corey@x.com','erin@x.com']},
      {id:'O2',divisionId:'D1',statement:'corey only',quarter:'26Q2',owner:['corey@x.com']},
      {id:'O3',divisionId:'D1',statement:'legacy',quarter:'26Q2',owner:'Toru'},
      {id:'O4',divisionId:'D1',statement:'unowned',quarter:'26Q2'},
      {id:'O5',divisionId:'D2',statement:'other division',quarter:'26Q2',owner:['corey@x.com']}]};
  exec={objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[]};
  divisionId='D1'; selectedQuarter=''; selectedProduct='';
  // this fixture is minimal; the board render is not what these assertions are about
  renderAll=function(){}; setMsg=function(){}; persistExec=function(){}; etbFlushSave=function(){return Promise.resolve();};
  etbSyncObjective=function(){};`;

function boot(url){
  return new Promise(res=>{
    const dom=new JSDOM(HTML,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url,pretendToBeVisual:true,
      beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
    setTimeout(()=>res(dom.window),450);
  });
}
const ids=(w)=>w.eval("myObjectives().map(o=>o.id).join()");

(async()=>{
  // ---- no ?owner= : the division's objectives, unchanged ----
  let w=await boot("https://x.test/?division=D1&token=t");
  w.eval(FIX);
  ok(ids(w)==='O1,O2,O3,O4', 'without ?owner= every objective in the division is listed (O5 is another division)');
  ok(w.eval("URLP.owner")==='', 'URLP.owner is empty when the param is absent');

  // the read-only owners line
  w.eval("fillObjSelect();");
  ok(w.eval("selectedObj")==='O1', 'the first objective is selected');
  ok(w.document.getElementById('objOwners').textContent.indexOf('corey@x.com')>=0
     && w.document.getElementById('objOwners').textContent.indexOf('erin@x.com')>=0,
     'the header shows BOTH owners of the selected objective');
  // it must REFRESH when the objective changes — drive the REAL picker, never re-render by hand:
  // fillObjSelect() is NOT called by renderAll(), so calling it manually here would hide a stale-header bug.
  await new Promise(r=>{ w.eval("var s=document.getElementById('objSelect'); s.value='O3'; s.onchange();"); setTimeout(r,60); });
  ok(w.eval("selectedObj")==='O3', 'selecting another objective in the real picker switches it');
  ok(w.document.getElementById('objOwners').textContent.indexOf('Toru')>=0
     && w.document.getElementById('objOwners').textContent.indexOf('corey@x.com')<0,
     'switching objective refreshes the header (a legacy free-text owner shows too)');
  await new Promise(r=>{ w.eval("var s=document.getElementById('objSelect'); s.value='O4'; s.onchange();"); setTimeout(r,60); });
  ok(w.document.getElementById('objOwners').textContent==='', 'switching to an unowned objective clears the line, rather than leaving the previous owners');
  ok(w.eval("ownerLine('O2')")==='corey@x.com', 'ownerLine returns the joined owners');
  ok(w.eval("ownerLine('nope')")==='', 'ownerLine on an unknown id is empty, not a throw');
  // position: far left of the header, right after the R&D Execution title and BEFORE the spacer that pushes
  // the pickers right. DOM order is assertable; pixels are not (jsdom has no layout engine).
  ok(w.eval("(function(){var k=[].slice.call(document.querySelector('header').children).map(function(e){return e.id||e.tagName;});"
           +"return k.indexOf('objOwners')===k.indexOf('H1')+1;})()"),
     'the owners line sits immediately after the R&D Execution title');
  ok(w.eval("(function(){var k=[].slice.call(document.querySelector('header').children).map(function(e){return e.id||e.className||e.tagName;});"
           +"return k.indexOf('objOwners') < k.indexOf('spacer');})()"),
     '...before the spacer, so it stays far LEFT rather than drifting right with the pickers');
  ok(w.eval("(function(){var k=[].slice.call(document.querySelector('header').children).map(function(e){return e.id||e.tagName;});"
           +"return k.indexOf('objOwners') < k.indexOf('divSelect') && k.indexOf('objOwners') < k.indexOf('objSelect');})()"),
     '...and ahead of every picker');
  // read-only: no editor for owner in this app
  ok(w.eval("document.querySelectorAll('#objOwners input, #objOwners select').length")===0,
     'the owners line is read-only — no input, no select');

  // ---- ?owner=corey@x.com ----
  w=await boot("https://x.test/?division=D1&owner=corey@x.com&token=t");
  w.eval(FIX);
  ok(w.eval("URLP.owner")==='corey@x.com', 'URLP.owner carries the param');
  ok(ids(w)==='O1,O2', 'only Corey objectives are listed — including the SHARED one');
  ok(ids(w).indexOf('O3')<0 && ids(w).indexOf('O4')<0, '...and not the ones he does not own');
  ok(ids(w).indexOf('O5')<0, '...and the division filter still applies on top');

  // ---- ?owner=erin@x.com : the shared objective is hers too ----
  w=await boot("https://x.test/?division=D1&owner=erin@x.com&token=t");
  w.eval(FIX);
  ok(ids(w)==='O1', "Erin sees the objective she SHARES with Corey — multi-owner works through the filter");

  // ---- case-insensitivity + legacy text ----
  w=await boot("https://x.test/?division=D1&owner=COREY@X.COM&token=t");
  w.eval(FIX);
  ok(ids(w)==='O1,O2', 'the owner match is case-insensitive (emails are)');
  w=await boot("https://x.test/?division=D1&owner=Toru&token=t");
  w.eval(FIX);
  ok(ids(w)==='O3', 'a LEGACY free-text owner can still be filtered on');

  // ---- an owner nobody has ----
  w=await boot("https://x.test/?division=D1&owner=ghost@x.com&token=t");
  w.eval(FIX);
  ok(ids(w)==='', 'an owner with no objectives yields an empty list, not an error');
  w.eval("fillObjSelect();");
  ok(w.eval("selectedObj")===null, '...and nothing is selected');
  ok(w.document.getElementById('objSelect').innerHTML.indexOf('no objectives')>=0, '...with the empty-state option shown');
  ok(w.document.getElementById('objOwners').textContent==='', '...and no owners line');

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} exec owner-filter assertions green`);
  process.exit(fl.length?1:0);
})();
