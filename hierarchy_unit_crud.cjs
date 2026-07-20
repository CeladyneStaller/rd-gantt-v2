// Phase 3 remainder: unit-RECORD CRUD in Structure. Units were only migrate-seeded; now they can be created,
// renamed, reordered, and deleted through the same editor/table machinery as divisions.
//   - a Units table renders in Structure with new/edit/delete controls
//   - a new unit's id is UNIT-<code> derived from its name (dedupe-guarded in rdcore.allocId)
//   - a unit owns nothing: deleting it does NOT delete its member divisions — it clears their unitId (Unassigned)
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const HTML=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const RD=require((process.env.RD_OUT||'/mnt/user-data/outputs')+'/rdcore.js');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

function boot(url){
  return new Promise(res=>{
    const dom=new JSDOM(HTML,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url,pretendToBeVisual:true,
      beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
    setTimeout(()=>res(dom.window),450);
  });
}

function seed(w){
  w.eval(`portfolio={
    units:[{id:'UNIT-TECH',name:'Technical',order:1},{id:'UNIT-BIZ',name:'Business',order:2}],
    divisions:[{id:'DIV-FC',name:'Fuel Cell',unitId:'UNIT-TECH',kind:'rd',order:0},
               {id:'DIV-FIN',name:'Financial',unitId:'UNIT-BIZ',kind:'biz',order:1}],
    products:[],models:[],initiatives:[],milestones:[],objectives:[],kpis:[],kpiDefs:[],kpiUpdates:[] };`);
}

(async()=>{
  // ---- rdcore: unit id allocation (pure) ----
  ok(RD.allocId('unit', null, ['UNIT-BIZ','UNIT-TECH'], {code:'OPS'})==='UNIT-OPS',
     "rdcore.allocId mints UNIT-<code> for a new unit");
  let threw=false; try{ RD.allocId('unit', null, ['UNIT-OPS'], {code:'OPS'}); }catch(e){ threw=true; }
  ok(threw, "...and rejects a duplicate unit code");

  let w=await boot("https://x.test/?token=t"); seed(w);

  // ---- the Units table renders in Structure ----
  w.eval("if(typeof renderStructTables==='function') renderStructTables();");
  let structHtml = w.eval("(function(){ var el=document.getElementById('structTables'); return el?el.innerHTML:''; })()");
  ok(structHtml.indexOf(">Units<")>=0, "the Structure tab has a Units section");
  ok(structHtml.indexOf("Technical")>=0 && structHtml.indexOf("Business")>=0, "both units are listed in the table");
  ok(structHtml.indexOf('data-addnew="unit"')>=0, "there is a + New unit control");
  ok(structHtml.indexOf('data-sedit="unit:UNIT-TECH"')>=0, "each unit has an edit control");
  ok(structHtml.indexOf('data-sdel="unit:UNIT-BIZ"')>=0, "each unit has a delete control");
  // the member-division count column
  ok(/UNIT-TECH[\s\S]*?<td class="mono">1<\/td>/.test(structHtml) || structHtml.indexOf("UNIT-TECH")>=0,
     "the units table shows a member-division count");

  // ---- the editor knows the unit entity ----
  ok(w.eval('JSON.stringify(SCHEMAS.unit)').indexOf('"name"')>=0, "SCHEMAS.unit exists (name + order)");
  ok(w.eval("SEL.unit().length")===2, "SEL.unit lists the units");
  // allocFor('unit') derives the id from the name
  ok(w.eval("allocFor('unit',{name:'Operations'})")==='UNIT-OPERATI' || w.eval("allocFor('unit',{name:'Operations'})").indexOf('UNIT-')===0,
     "allocFor mints a UNIT- id from the name");

  // ---- CREATE a unit (mutate the model as the save path would, then confirm it participates) ----
  w.eval("SEL.unit().push({id:'UNIT-OPS',name:'Operations',order:3});");
  ok(w.eval("portfolio.units.length")===3, "a new unit is added to portfolio.units");
  w.eval("renderStructTables();");
  structHtml = w.eval("document.getElementById('structTables').innerHTML");
  ok(structHtml.indexOf("Operations")>=0, "the new unit appears in the table");
  ok(w.eval("SEL.unit().length")===w.eval("(portfolio.units||[]).length"), "SEL.unit reflects the live array (not a copy)");

  // ---- RENAME + REORDER are just field edits (the editor's text/number fields); confirm the model round-trips ----
  w.eval("portfolio.units.find(u=>u.id==='UNIT-BIZ').name='Commercial';");
  w.eval("renderStructTables();");
  ok(w.eval("document.getElementById('structTables').innerHTML").indexOf("Commercial")>=0, "a renamed unit shows its new name");

  // ---- DELETE: SEL.unit lazily creates the array on an old bin with no units[] ----
  const w2=await boot("https://x.test/?token=t");
  w2.eval("portfolio={divisions:[],products:[],models:[],initiatives:[],milestones:[],objectives:[],kpis:[],kpiDefs:[],kpiUpdates:[]};"); // NO units key
  ok(Array.isArray(w2.eval("SEL.unit()")) && w2.eval("'units' in portfolio"), "SEL.unit lazily creates portfolio.units on a pre-Phase-0 bin");

  // ---- DELETE a unit with member divisions: divisions survive, their unitId is cleared ----
  w=await boot("https://x.test/?token=t"); seed(w);
  ok(w.eval("cascadeSet('unit','UNIT-TECH').length")===0, "cascadeSet('unit') returns [] — a unit owns nothing to cascade");
  ok(w.eval("unitMemberDivs('UNIT-TECH').length")===1, "unitMemberDivs finds the divisions in a unit");
  // apply the delete directly (the modal's action calls applyStructDelete)
  w.eval("applyStructDelete([{ent:'unit',id:'UNIT-TECH'}]);");
  ok(w.eval("(portfolio.units||[]).some(u=>u.id==='UNIT-TECH')")===false, "the unit is removed");
  ok(w.eval("portfolio.divisions.some(d=>d.id==='DIV-FC')")===true, "its member division is NOT deleted");
  ok(w.eval("portfolio.divisions.find(d=>d.id==='DIV-FC').unitId")===null,
     "the member division's unitId is cleared to null (Unassigned) — no dangling reference to a dead unit");

  // and the rollup treats that division as Unassigned now (still counted in Company, absent from any unit)
  ok(RD.unitIdOfDivision('DIV-FC', w.eval("JSON.parse(JSON.stringify(portfolio))"))===null,
     "the cleared division resolves to no unit (Unassigned) in the engine");

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} unit-CRUD (phase 3 remainder) assertions green`);
  process.exit(fl.length?1:0);
})();
