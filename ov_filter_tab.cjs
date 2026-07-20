// Two URL-driven behaviours in the planning app:
//   1. the Overview honours pfFilters.division / .product (it walked every division unconditionally before,
//      so ?division= scoped every OTHER tab and silently did nothing here). No filter bar on Overview, so the
//      URL is in practice the only way to set it.
//   2. ?tab=<name> opens on that tab.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const HTML=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

const FIX=`portfolio={
    divisions:[{id:'DIV-FC',name:'Fuel Cell'},{id:'DIV-EL',name:'Electrolyzer'}],
    products:[{id:'PRD-A',name:'ProdA',divisionId:'DIV-FC'},{id:'PRD-B',name:'ProdB',divisionId:'DIV-FC'},
              {id:'PRD-C',name:'ProdC',divisionId:'DIV-EL'}],
    models:[], initiatives:[{id:'INI-1',divisionId:'DIV-FC',name:'I',productId:'PRD-A'}],
    kpis:[], milestones:[],
    objectives:[{id:'OBJ-1',divisionId:'DIV-FC',initiativeId:'INI-1',productId:'PRD-A',statement:'fc work',quarter:'26Q2'},
                {id:'OBJ-2',divisionId:'DIV-EL',statement:'el work',quarter:'26Q2'}]};
  execDocs={};`;

function boot(url){
  return new Promise(res=>{
    const dom=new JSDOM(HTML,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url,pretendToBeVisual:true,
      beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
    setTimeout(()=>res(dom.window),450);
  });
}
const ov=(w)=>w.eval("overviewTilesHtml()");

(async()=>{
  // ---- no filter: everything ----
  let w=await boot("https://x.test/?token=t"); w.eval(FIX);
  let h=ov(w);
  ok(h.indexOf("Fuel Cell")>=0 && h.indexOf("Electrolyzer")>=0, "with no filter the Overview shows both divisions");

  // ---- ?division= scopes the Overview (it did NOT before) ----
  w=await boot("https://x.test/?division=DIV-FC&token=t"); w.eval(FIX);
  ok(w.eval("pfFilters.division")==='DIV-FC', "?division= seeds pfFilters");
  h=ov(w);
  ok(h.indexOf("Fuel Cell")>=0, "?division=DIV-FC keeps its own division");
  ok(h.indexOf("Electrolyzer")<0, "...and drops the other division entirely");
  ok(h.indexOf("ProdC")<0, "...including that division's products");

  // ---- ?product= thins a kept division rather than dropping it ----
  w=await boot("https://x.test/?division=DIV-FC&product=PRD-A&token=t"); w.eval(FIX);
  h=ov(w);
  ok(h.indexOf("Fuel Cell")>=0, "?product= keeps the division block");
  ok(h.indexOf("ProdA")>=0 && h.indexOf("ProdB")<0, "...but thins it to the chosen product");

  // ---- a MISTYPED division must not look like an empty portfolio ----
  w=await boot("https://x.test/?division=fuelcell&token=t"); w.eval(FIX);
  h=ov(w);
  ok(h.indexOf("No divisions match")>=0, "an unmatched division says the FILTER hid things");
  ok(h.indexOf("No divisions yet")<0, "...and does NOT claim there are no divisions");
  ok(h.indexOf("DIV-FC")>=0, "...and names the id form, since ?division= takes an id not a name");

  // ---- genuinely empty portfolio still reads correctly ----
  w=await boot("https://x.test/?token=t");
  w.eval("portfolio={divisions:[],products:[],models:[],initiatives:[],kpis:[],milestones:[],objectives:[]}; execDocs={};");
  h=ov(w);
  ok(h.indexOf("No divisions yet")>=0 && h.indexOf("No divisions match")<0,
     "an actually-empty portfolio still says 'No divisions yet'");

  // ---- ?tab= ----
  w=await boot("https://x.test/?token=t");
  ok(w.eval("URLP.tab")==='', "no ?tab= leaves it empty");
  ok(w.document.querySelector('#nav button[data-tab=overview]').classList.contains('active'),
     "...and Overview is the default tab");

  w=await boot("https://x.test/?tab=gantt&token=t"); w.eval(FIX);
  ok(w.eval("URLP.tab")==='gantt', "?tab=gantt is read");
  ok(w.eval("applyTabParam()")===true, "applyTabParam finds the button and clicks it");
  ok(w.document.getElementById('tab-gantt').classList.contains('active'), "...the gantt section becomes active");
  ok(!w.document.getElementById('tab-overview').classList.contains('active'), "...and overview is deactivated");
  ok(w.document.querySelector('#nav button[data-tab=gantt]').classList.contains('active'), "...and its nav button is marked active");

  for(const t of ["portfolio","milestones","settings"]){
    w=await boot(`https://x.test/?tab=${t}&token=t`); w.eval(FIX); w.eval("applyTabParam()");
    ok(w.document.getElementById('tab-'+t).classList.contains('active'), `?tab=${t} opens that tab`);
  }

  // case-insensitive, and junk falls back rather than blanking
  w=await boot("https://x.test/?tab=GANTT&token=t"); w.eval(FIX);
  ok(w.eval("applyTabParam()")===true && w.document.getElementById('tab-gantt').classList.contains('active'),
     "?tab= is case-insensitive");
  w=await boot("https://x.test/?tab=nonsense&token=t"); w.eval(FIX);
  ok(w.eval("applyTabParam()")===false, "an unknown ?tab= is refused");
  ok(w.document.getElementById('tab-overview').classList.contains('active'),
     "...leaving Overview active rather than a blank page");

  // the two params compose: a scoped link to a specific tab
  w=await boot("https://x.test/?tab=gantt&division=DIV-FC&token=t"); w.eval(FIX); w.eval("applyTabParam()");
  ok(w.document.getElementById('tab-gantt').classList.contains('active') && w.eval("pfFilters.division")==='DIV-FC',
     "?tab= and ?division= compose into one scoped link");

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} overview-filter + tab-param assertions green`);
  process.exit(fl.length?1:0);
})();
