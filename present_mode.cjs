// ?present strips the planning app to the tab's own content — no header, nav, filter bar or level bar — for a
// screen or a slide. The view is chosen entirely by the other params.
//
// NOTE ON WHAT IS PROVABLE HERE: jsdom has no layout engine and does not apply stylesheets to computed style,
// so "is the header actually invisible" is NOT testable in this sandbox — Corey must eyeball it. What IS
// testable: the class lands on <body>, the CSS rule exists and names the right selectors, readonly is implied,
// and the content that must SURVIVE is still rendered. Asserting a rule's existence is weaker than asserting a
// pixel; it is stated here rather than dressed up as more than it is.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const HTML=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

function boot(url){
  return new Promise(res=>{
    const dom=new JSDOM(HTML,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url,pretendToBeVisual:true,
      beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
    setTimeout(()=>res(dom.window),450);
  });
}
const FIX=`portfolio={ divisions:[{id:'DIV-FC',name:'FC'}], products:[], models:[], kpis:[], milestones:[],
    initiatives:[{id:'INI-1',divisionId:'DIV-FC',name:'I',plannedStart:todayDay()-10,plannedEnd:todayDay()+10}],
    objectives:[{id:'OBJ-1',divisionId:'DIV-FC',initiativeId:'INI-1',statement:'work',quarter:currentQuarter(),
                 plannedStart:todayDay()-5,plannedEnd:todayDay()+5}]};
  execDocs={};`;

(async()=>{
  // ---- off by default ----
  let w=await boot("https://x.test/?token=t"); w.eval(FIX);
  ok(w.eval("URLP.present")===false, "present is off by default");
  ok(!w.document.body.classList.contains('present'), "...no class on body");
  ok(w.eval("RO")===false, "...and readonly is untouched");

  // ---- on ----
  w=await boot("https://x.test/?present&token=t"); w.eval(FIX);
  ok(w.eval("URLP.present")===true, "?present (bare) turns it on");
  ok(w.document.body.classList.contains('present'), "...and the class lands on body");
  ok(w.eval("RO")===true, "?present IMPLIES readonly — no navigation should mean no edits either");
  ok(w.document.body.classList.contains('readonly'), "...so the readonly class is applied too");

  // case-insensitive + flag semantics, consistent with the other params
  w=await boot("https://x.test/?PRESENT=1&token=t"); w.eval(FIX);
  ok(w.eval("URLP.present")===true, "?PRESENT=1 works (names are case-insensitive)");
  w=await boot("https://x.test/?present=0&token=t"); w.eval(FIX);
  ok(w.eval("URLP.present")===false, "?present=0 is off");
  ok(w.eval("RO")===false, "...and does not drag readonly in with it");
  w=await boot("https://x.test/?present=false&token=t"); w.eval(FIX);
  ok(w.eval("URLP.present")===false, "?present=false is off");

  // readonly stays independent
  w=await boot("https://x.test/?readonly&token=t"); w.eval(FIX);
  ok(w.eval("RO")===true && w.eval("URLP.present")===false, "?readonly alone does NOT imply present");

  // ---- the rule names the right things ----
  const css=HTML;
  ok(/body\.present header[^{]*\{[^}]*display:none/.test(css), "the CSS hides the header in present mode");
  ok(/body\.present[^{]*\.filterbar[^{]*\{[^}]*display:none/.test(css), "...and the filter bar");
  ok(/body\.present[^{]*\.lvlbar[^{]*\{[^}]*display:none/.test(css), "...and the level bar (collapse + toggles)");
  ok(css.indexOf("body.present main")>=0, "...and re-pads main, which is the element that actually pads the page");
  ok(!/body\.present[^{]*\.legend/.test(css), "the legend is NOT hidden — it is how you read the chart");
  ok(!/body\.present[^{]*#ganttWrap/.test(css), "...and neither is the chart itself");

  // every filter bar shares the class, so one selector covers all three tabs
  ok((HTML.match(/class="filterbar"/g)||[]).length>=3, "all three tabs' filter bars share the .filterbar class");

  // ---- the content still renders: chrome is HIDDEN, not unrendered ----
  w=await boot("https://x.test/?present&tab=gantt&token=t"); w.eval(FIX);
  w.eval("renderGantt();");
  ok(w.document.querySelectorAll('#ganttWrap .grow').length>0, "the gantt still renders its rows in present mode");
  ok(!!w.document.querySelector('#tab-gantt .legend'), "the legend element is still in the DOM");
  ok(!!w.document.getElementById('ganttLevelBar'), "the level bar still EXISTS (hidden by CSS, not skipped)");
  ok(w.eval("applyTabParam()")===true, "...so ?tab= still works — every handler wired up as usual");
  ok(w.document.getElementById('tab-gantt').classList.contains('active'), "...and opens the requested tab");

  // ---- composes with the whole param set: one link to a presentable view ----
  w=await boot("https://x.test/?present&tab=gantt&division=DIV-FC&ganttactive=1&ganttquarter=1&token=t");
  w.eval(FIX);
  ok(w.eval("URLP.present")===true && w.eval("pfFilters.division")==='DIV-FC'
     && w.eval("ganttActiveOnly")===true && w.eval("ganttQtrZoom")===true,
     "present composes with tab, division and both gantt toggles — the whole view comes from the URL");
  w.eval("applyTabParam();");
  ok(w.document.getElementById('tab-gantt').classList.contains('active'),
     "...and lands on the gantt with no way to navigate away, which is the point");

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} present-mode assertions green`);
  process.exit(fl.length?1:0);
})();
