// The Sales app is a copy of the execution app with exactly two intended differences:
//   1. its workspace namespace is BIZ-<div>, not EXEC-<div>  (own storage; never touches R&D execution data)
//   2. its branding says "Sales", not "R&D Execution"
// Everything else — the shared engine, the params, and (hard-won) the readonly guard — must be IDENTICAL.
// This harness pins the delta AND asserts the clone did not lose the readonly protections.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const OUT=(process.env.RD_OUT||'/mnt/user-data/outputs');
const SALES=fs.readFileSync(OUT+'/sales_app.html','utf8');
const EXEC =fs.readFileSync(OUT+'/execution_app.html','utf8');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

function boot(html, url){
  return new Promise(res=>{
    const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url,pretendToBeVisual:true,
      beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
    setTimeout(()=>res(dom.window),450);
  });
}

(async()=>{
  // ---- 1. the namespace: BIZ-<div>, and demonstrably NOT EXEC- ----
  const w=await boot(SALES, "https://x.test/?division=DIV-SALES&token=t");
  w.eval("divisionId='DIV-SALES';");
  ok(w.eval("execId()")==='BIZ-DIV-SALES', "the Sales workspace doc is BIZ-<div> (execId returns BIZ-DIV-SALES)");
  ok(w.eval("execId()").indexOf('EXEC-')<0, "...and never EXEC- — it cannot address R&D execution data");
  w.eval("divisionId='DIV-FC';");
  ok(w.eval("execId()")==='BIZ-DIV-FC', "the prefix follows the division id (BIZ-DIV-FC)");

  // the execution app, for contrast, still writes EXEC- (proves the two apps are separated, not aliased)
  const we=await boot(EXEC, "https://x.test/?division=DIV-SALES&token=t");
  we.eval("divisionId='DIV-SALES';");
  ok(we.eval("execId()")==='EXEC-DIV-SALES', "the execution app still writes EXEC-<div> — the namespaces do not collide");
  ok(w.eval("execId()") !== we.eval("execId()"),
     "for the SAME division id, Sales and Execution resolve to DIFFERENT docs (BIZ- vs EXEC-)");

  // ---- 2. branding ----
  ok(SALES.indexOf("<title>Sales — Division</title>")>=0, "the title says Sales");
  ok(SALES.indexOf("R&amp;D Execution")<0, "no leftover 'R&D Execution' branding");
  ok(w.document.querySelector("h1").textContent.indexOf("Sales")>=0, "the h1 says Sales");
  ok(w.document.querySelector("h1").textContent.indexOf("Execution")<0, "...and not Execution");

  // ---- 3. it is the SAME ENGINE (shares rdcore, same exported API surface) ----
  ok(w.eval("typeof RD.hasTarget")==='function' && w.eval("typeof RD.stageGateScore")==='function',
     "the Sales app carries the same rdcore engine (hasTarget/stageGateScore exported)");
  ok(w.eval("typeof RD.keyResultScore")==='function' && w.eval("typeof RD.quarterRange")==='function',
     "...and the same scoring/date machinery (keyResultScore/quarterRange)");

  // ---- 4. SPEC- references are left intact (product-designer namespace, inert for sales but not stripped) ----
  ok(SALES.indexOf('"SPEC-"')>=0, "SPEC- reference machinery is preserved (a faithful copy, inert until sales specs exist)");

  // ---- 5. the readonly protections survived the copy (we fought hard for these; a clone must keep them) ----
  const wr=await boot(SALES, "https://x.test/?division=DIV-SALES&readonly=1&token=t");
  ok(wr.document.body.classList.contains("readonly"), "?readonly still applies the class in the Sales app");
  const hid=[]; for(const sh of wr.document.styleSheets){ let rs; try{rs=sh.cssRules;}catch(e){continue;} for(const r of rs){ if(r.selectorText&&r.style&&r.style.display==="none"&&r.selectorText.indexOf("readonly")>=0) hid.push(r.selectorText); } }
  const isH=el=>hid.some(sel=>{try{return el.matches(sel);}catch(e){return false;}});
  const make=h=>{const d=wr.document.createElement("div");d.innerHTML=h;const el=d.firstElementChild;wr.document.body.appendChild(el);return el;};
  // the +Experiment toolbar button and a KPI-target name — the two things most recently fixed
  const addExp=wr.document.getElementById("btnAddExp");
  ok(!!addExp && isH(addExp), "the + Experiment toolbar button is hidden in the Sales app too");
  if(addExp){ const ev=new wr.MouseEvent("click",{bubbles:true,cancelable:true}); addExp.dispatchEvent(ev);
    ok(ev.defaultPrevented, "...and its click is blocked by the same capture guard"); }
  ok(!make('<a class="rowedit" data-edit="kpi:X" title="edit">AST</a>').matches
     || !isH(make('<a class="rowedit" data-edit="kpi:Y" title="edit">AST</a>')),
     "KPI target names stay visible in the Sales app (the rowedit carve-out copied over)");
  ok(isH(make('<button class="ghost mini" onclick="openFmeaModal()">+ Add problem</button>')),
     "the FMEA + Add problem button is hidden in the Sales app too");

  // ---- 6. the Sales app has now DIVERGED from the execution app (milestone KRs are sales-first) ----
  // The byte-identical invariant is retired by design. The new invariant: both apps build, share the
  // engine + namespace/branding delta, AND the Sales app carries its own milestone-KR machinery that the
  // execution app does not yet have.
  ok(SALES.length>0 && EXEC.length>0, "both apps build");
  ok(SALES.indexOf('milestoneKrScore')>=0, "the Sales build carries the shared milestone engine");
  ok(SALES.indexOf('msStatusPanel')>=0 && SALES.indexOf('data-msmode')>=0,
     "the Sales app has milestone-KR UI (status drawer + credit-mode toggle)");
  ok(EXEC.indexOf('msStatusPanel')<0,
     "the execution app does NOT yet have the milestone UI — the two have intentionally diverged");
  // the shared, hard-won protections must survive the divergence in the Sales app
  ok(SALES.indexOf('readonly')>=0, "the Sales app still carries the read-only guard");

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} sales-app clone assertions green`);
  process.exit(fl.length?1:0);
})();
