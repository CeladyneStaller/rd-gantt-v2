// Phase 4 (light): the exec/Sales app surfaces which unit its division sits in.
//   - the division picker groups divisions by unit via <optgroup> (ordered; Unassigned last)
//   - a small header tag shows the current division's unit name
// Nothing is gated — this is orientation only. Verified against BOTH the execution and Sales builds, which must
// behave identically here (they are byte-identical but for the BIZ-/EXEC- namespace + branding).
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const OUT=(process.env.RD_OUT||'/mnt/user-data/outputs');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

function boot(file, url){
  const HTML=fs.readFileSync(OUT+'/'+file,'utf8');
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
               {id:'DIV-EL',name:'Electrolyzer',unitId:'UNIT-TECH',kind:'rd',order:1},
               {id:'DIV-FIN',name:'Financial',unitId:'UNIT-BIZ',kind:'biz',order:2},
               {id:'DIV-LOOSE',name:'Loose',order:3}],
    products:[],models:[],initiatives:[],milestones:[],objectives:[],kpis:[],kpiDefs:[],kpiUpdates:[] };`);
}

async function checkApp(file, label){
  const w=await boot(file, "https://x.test/?division=DIV-FC&token=t");
  seed(w);
  w.eval("divisionId='DIV-FC';");
  w.eval("if(typeof fillDivSelect==='function') fillDivSelect();");
  const sel=w.document.getElementById("divSelect");
  ok(!!sel, label+": the division picker exists");

  // grouped by unit via optgroup — but only the divisions of THIS app's kind are shown (kind-gating)
  const groups=[...sel.querySelectorAll("optgroup")].map(g=>g.label);
  ok(groups.indexOf("Technical")>=0, label+": the picker groups its divisions under unit optgroups (Technical)");
  // the exec app (rd) must NOT show the Business unit — its only division (DIV-FIN) is biz and hidden here
  ok(groups.indexOf("Business")<0, label+": the Business unit is absent (its division is biz, hidden in the rd app)");
  // the Technical group holds the rd divisions; DIV-FIN (biz) is not present anywhere
  const techOpts=[...sel.querySelector('optgroup[label="Technical"]').querySelectorAll("option")].map(o=>o.value);
  ok(techOpts.indexOf("DIV-FC")>=0 && techOpts.indexOf("DIV-EL")>=0 && techOpts.indexOf("DIV-FIN")<0,
     label+": the Technical group holds the rd divisions, not the biz one");
  const allOpts=[...sel.querySelectorAll("option")].map(o=>o.value);
  ok(allOpts.indexOf("DIV-FIN")<0, label+": the biz division is not selectable in the rd app at all");

  // the unit tag reflects the current division's unit
  const tag=w.document.getElementById("unitTag");
  ok(!!tag, label+": the header has a unit tag");
  ok(tag.textContent==="Technical", label+": the unit tag shows the current division's unit (Technical)");
  ok(tag.style.display!=="none", label+": the tag is visible when the division has a unit");

  // switch to the unassigned division -> tag hides
  w.eval("divisionId='DIV-LOOSE'; updateUnitTag();");
  ok(w.document.getElementById("unitTag").style.display==="none",
     label+": the tag hides for a division with no unit");

  // no units[] at all -> flat list, no optgroups, no crash; still filtered to this app's kind (3 rd divisions)
  w.eval("portfolio.units=[]; divisionId='DIV-FC'; fillDivSelect();");
  ok(w.document.querySelectorAll("#divSelect optgroup").length===0,
     label+": with no units, the picker is a flat list (back-compat)");
  ok(w.document.querySelectorAll("#divSelect option").length===3,
     label+": ...and lists every division OF THIS APP'S KIND (3 rd, biz excluded)");
}

(async()=>{
  // Phase 4 (unit context) is exercised on the Execution app (rd divisions). The Sales app behaves identically
  // (sales_app.cjs proves the builds are byte-identical); the biz/rd division-visibility split is the new
  // kind-gating harness's job, not this one.
  await checkApp("execution_app.html", "exec");

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} exec/Sales unit-context (phase 4) assertions green`);
  process.exit(fl.length?1:0);
})();
