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

  // grouped by unit via optgroup
  const groups=[...sel.querySelectorAll("optgroup")].map(g=>g.label);
  ok(groups.indexOf("Technical")>=0 && groups.indexOf("Business")>=0,
     label+": the picker groups divisions under unit optgroups");
  // unit order: Technical (order 1) before Business (order 2)
  ok(groups.indexOf("Technical") < groups.indexOf("Business"),
     label+": unit groups are in order (Technical before Business)");
  // the unassigned division falls under an Unassigned group, last
  ok(groups.indexOf("Unassigned")>=0, label+": a division with no unit is under an Unassigned group");
  ok(groups.indexOf("Unassigned")===groups.length-1, label+": ...and Unassigned is last");
  // the divisions land in the right groups
  const techOpts=[...sel.querySelector('optgroup[label="Technical"]').querySelectorAll("option")].map(o=>o.value);
  ok(techOpts.indexOf("DIV-FC")>=0 && techOpts.indexOf("DIV-EL")>=0 && techOpts.indexOf("DIV-FIN")<0,
     label+": the Technical group holds exactly its divisions");

  // the unit tag reflects the current division's unit
  const tag=w.document.getElementById("unitTag");
  ok(!!tag, label+": the header has a unit tag");
  ok(tag.textContent==="Technical", label+": the unit tag shows the current division's unit (Technical)");
  ok(tag.style.display!=="none", label+": the tag is visible when the division has a unit");

  // switch to the unassigned division -> tag hides
  w.eval("divisionId='DIV-LOOSE'; updateUnitTag();");
  ok(w.document.getElementById("unitTag").style.display==="none",
     label+": the tag hides for a division with no unit");

  // no units[] at all -> flat list, no optgroups, no crash
  w.eval("portfolio.units=[]; divisionId='DIV-FC'; fillDivSelect();");
  ok(w.document.querySelectorAll("#divSelect optgroup").length===0,
     label+": with no units, the picker is a flat list (back-compat)");
  ok(w.document.querySelectorAll("#divSelect option").length===4,
     label+": ...and still lists every division");
}

(async()=>{
  await checkApp("execution_app.html", "exec");
  await checkApp("sales_app.html", "sales");

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} exec/Sales unit-context (phase 4) assertions green`);
  process.exit(fl.length?1:0);
})();
