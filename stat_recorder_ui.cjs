// ETB recorder — statistical key reads. Drives the REAL recorder: opens it for an experiment whose
// key read is linked to a statistical KPI, types several numbers into the actual field, checks the
// live readout, records, and verifies N RAW readings were written (not one reduced mean).
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
const OUT = (process.env.RD_OUT || '/mnt/user-data/outputs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
process.on("unhandledRejection", e => { const t=String((e&&e.message)||e); if(/Invalid time value/.test(t)) return; throw e; });

const portfolio = { units:[], divisions:[{id:"DIV-FC",name:"FC",kind:"rd"}], products:[], models:[],
  initiatives:[{id:"I1",name:"I",divisionId:"DIV-FC"}],
  objectives:[{id:"O1",statement:"Gen2",divisionId:"DIV-FC",initiativeId:"I1",quarter:"2026 Q1",plannedStart:2192,plannedEnd:2280}],
  kpis:[], kpiDefs:[], kpiUpdates:[], catchupPlans:[] };

// K-STAT is statistical (average of 5); K-ONE is an ordinary single-valued KPI
const execDoc = { objectiveState:[], keyResults:[{id:"KR1",objectiveId:"O1",statement:"Hit 0.68 V"}],
  kpis:[
    {id:"K-STAT",objectiveId:"O1",hostType:"keyResult",hostId:"KR1",name:"OCV",unit:"V",targetType:"statistical",statistic:"average",readCount:5,direction:"up",target:0.68},
    {id:"K-ONE", objectiveId:"O1",hostType:"keyResult",hostId:"KR1",name:"Leak",unit:"sccm",targetType:"demonstration",direction:"down",target:1}
  ],
  stageGates:[], tasks:[], boards:[], gateMode:{}, kpiUpdates:[], stageGateEdges:[],
  chainGatesByDate:{}, risks:[], stageGateSets:[], catchupPlans:[], etbTrees:{} };

const TREE = { project_id:"O1", experiments:{ exp_1:{ code:"EXP-1", name:"Baseline", status:"planned",
  key_reads:[ {id:"kr_a", name:"OCV", unit:"V", source_kpi_gid:"K-STAT"},
              {id:"kr_b", name:"Leak", unit:"sccm", source_kpi_gid:"K-ONE"} ],
  possible_results:[{id:"res_1", label:"Meets spec", criteria:[], next_experiment_ids:[]}] } } };

function makeFetch(store){
  return function(url,opts){ opts=opts||{}; const m=/\/state\/([^/?]+)(\/version)?/.exec(String(url)); const id=m?m[1]:null; const isVer=m&&m[2];
    if(/\/analysis$/.test(String(url))) return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({schema:2,runs:[]})});
    if((opts.method||"GET").toUpperCase()==="PUT"){ const nv=String((store[id]?+store[id].version:0)+1); store[id]={doc:JSON.parse(opts.body).doc,etag:nv,version:nv}; return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({etag:nv,version:nv})}); }
    if(isVer) return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({version:store[id]?store[id].version:"0"})});
    if(!store[id]) return Promise.resolve({ok:false,status:404,json:()=>Promise.resolve(null)});
    return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({doc:store[id].doc,etag:store[id].etag,version:store[id].version})}); };
}

(async () => {
  const store={ portfolio:{doc:portfolio,etag:"1",version:"1"}, "EXEC-DIV-FC":{doc:execDoc,etag:"1",version:"1"} };
  const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push(e.message));
  // ETB internals (renderKeyReads, state.tree, …) live inside a module IIFE and are unreachable from
  // the page. Inject a test hook at the end of that IIFE — the same pattern etb_graph_modal.cjs uses —
  // so ETB rendering is testable without shipping test-only code.
  let html = fs.readFileSync(OUT+'/execution_app.html','utf8');
  const HOOK = "\ninit(); window.__ETBH={"
    + " setTree:function(tr){ state.tree=tr; try{ normalizeTree(state.tree); }catch(e){} },"
    + " tree:function(){ return state.tree; },"
    + " renderKeyReads:function(expId){ var t=state.tree, e=t&&t.experiments&&t.experiments[expId]; return e?renderKeyReads(t,expId,e):null; }"
    + " };\n\n})();";
  const before = html.length;
  html = html.replace("\ninit();\n\n})();", HOOK);
  const injected = html.length !== before;

  const dom=new JSDOM(html,{ runScripts:"dangerously",virtualConsole:vc,
    url:"https://x/?division=DIV-FC&token=t",pretendToBeVisual:true,
    beforeParse(w){ w.fetch=makeFetch(store); w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); }});
  await sleep(900);
  const w=dom.window, d=w.document;
  ok(errs.length===0, "boots without errors ("+JSON.stringify(errs.slice(0,1))+")");

  w.eval(`portfolio=${JSON.stringify(portfolio)}; exec=${JSON.stringify(execDoc)}; selectedObj='O1'; divisionId='DIV-FC'; renderAll=function(){}; persist=function(){}; setMsg=function(){};`);
  // mount the fixture tree so ETB.experimentById resolves
  w.eval(`if(window.ETB && ETB.getTree){ try{ var t=ETB.getTree(); }catch(e){} } window.__testTree=${JSON.stringify(TREE)};
          window.ETB=window.ETB||{}; ETB.experimentById=function(id){ return window.__testTree.experiments[id]||null; };
          ETB.recordOutcomeFor=function(){}; ETB.saveActive=function(){};`);

  // ---------- the statistic resolves from the linked KPI ----------
  ok(w.eval("__erStatOf({id:'kr_a',source_kpi_gid:'K-STAT'}).statistical")===true, "a key read linked to a statistical KPI resolves as statistical");
  ok(w.eval("__erStatOf({id:'kr_a',source_kpi_gid:'K-STAT'}).statistic")==="average", "…taking the statistic from the KPI");
  ok(w.eval("__erStatOf({id:'kr_a',source_kpi_gid:'K-STAT'}).readCount")===5, "…and the expected sample size");
  ok(w.eval("__erStatOf({id:'kr_b',source_kpi_gid:'K-ONE'}).statistical")===false, "a key read on a non-statistical KPI stays single-valued");

  // ---------- open the REAL recorder ----------
  w.eval("openExpRecorder('exp_1')"); await sleep(200);
  const body=d.getElementById("expRecBody");
  ok(!!body && body.innerHTML.length>0, "the recorder renders for the experiment");
  const inA=body.querySelector('.erk-input[data-kr="kr_a"]');
  const inB=body.querySelector('.erk-input[data-kr="kr_b"]');
  ok(!!inA && !!inB, "both key reads render an input");
  ok(inA.getAttribute("type")==="text" && inA.classList.contains("multi"), "the STATISTICAL key read takes a multi-value text field");
  ok(inB.getAttribute("type")==="number", "the single-valued key read keeps its number field");
  ok(/0\.68/.test(inA.getAttribute("placeholder")||""), "…with a placeholder showing several values are expected");

  // ---------- type several reads; the live readout reacts ----------
  inA.value="0.66 0.68 0.70"; inA.dispatchEvent(new w.Event("input")); await sleep(80);
  const stat=body.querySelector('.erk-stat[data-krstat="kr_a"]');
  ok(!!stat, "the statistical key read has a live readout");
  const txt=stat?stat.textContent:"";
  ok(/n = 3 of 5/.test(txt), "the readout shows n against the expected count ("+txt+")");
  ok(/average/.test(txt), "…names the statistic");
  ok(/0\.68/.test(txt), "…and shows the computed value");
  ok(/sd/.test(txt), "…with the spread alongside");
  ok(stat.className.indexOf("short")>=0, "an incomplete entry is visibly flagged (3 of 5)");
  inA.value="0.66 0.68 0.70 0.67 0.69"; inA.dispatchEvent(new w.Event("input")); await sleep(80);
  ok(body.querySelector('.erk-stat[data-krstat="kr_a"]').className.indexOf("short")<0, "a complete entry (5 of 5) is no longer flagged");

  // ---------- matching sees the STATISTIC, storage keeps the raw reads ----------
  const scal=JSON.parse(w.eval("JSON.stringify(__erReadings())"));
  ok(Math.abs(scal.kr_a-0.68)<1e-9, "result matching receives the STATISTIC for a statistical key read");
  const raw=JSON.parse(w.eval("JSON.stringify(__erReadValues())"));
  ok(Array.isArray(raw.kr_a) && raw.kr_a.length===5, "the raw reads are kept as an array for storage");

  // ---------- record: N RAW rows, not one mean ----------
  inB.value="0.4"; inB.dispatchEvent(new w.Event("input")); await sleep(60);
  w.eval("writeKpiUpdatesFromReads('exp_1', __erReadings())"); await sleep(120);
  const ups=JSON.parse(w.eval("JSON.stringify(exec.kpiUpdates)"));
  const statRows=ups.filter(u=>u.kpiId==="K-STAT");
  ok(statRows.length===5, "recording writes FIVE raw readings for the statistical key read, not one mean ("+statRows.length+")");
  ok(statRows.map(u=>u.value).sort().join()==="0.66,0.67,0.68,0.69,0.7", "the individual measurements are what got written");
  ok(!statRows.some(u=>u.value===0.68 && statRows.length===1), "a pre-computed mean was never substituted (double-reduction guard)");
  ok(statRows.every(u=>/exp EXP-1/.test(u.note||"")), "each row carries the experiment provenance note");
  const oneRows=ups.filter(u=>u.kpiId==="K-ONE");
  ok(oneRows.length===1 && oneRows[0].value===0.4, "the single-valued key read still writes exactly one reading");

  // ---------- the KPI reduces those rows back to the entry's statistic ----------
  const back=JSON.parse(w.eval("JSON.stringify(RD.statSummary(exec.kpiUpdates.filter(function(u){return u.kpiId==='K-STAT';}).map(function(u){return u.value;}),'average'))"));
  ok(Math.abs(back.value-0.68)<1e-9, "reducing the written rows reproduces the entry's statistic");

  // ---------- the experiment RECORD keeps the raw reads (schema, migration-safe) ----------
  let captured = null;
  w.eval("ETB.recordOutcomeFor=function(id,p){ window.__captured=p; };");
  const pick = d.querySelector('#expRecBody input[name="erp-pick"]');
  if (pick) { pick.checked = true; pick.dispatchEvent(new w.Event("change")); }
  w.eval("try{ recordExpOutcome(); }catch(e){ window.__recErr=String(e&&e.message||e); }");
  await sleep(150);
  captured = JSON.parse(w.eval("JSON.stringify(window.__captured||null)"));
  ok(!!captured, "recording hands a payload to the ETB (" + (w.eval("window.__recErr||''") || "ok") + ")");
  const kv = (captured || {}).key_read_values || {};
  ok(Array.isArray(kv.kr_a), "a STATISTICAL key read is recorded as an ARRAY of raw reads");
  ok(Array.isArray(kv.kr_a) && kv.kr_a.length === 5, "…all five measurements, not a reduced value");
  ok(!Array.isArray(kv.kr_b), "a single-valued key read is still recorded as a plain number");
  // both shapes read back through the normaliser
  ok(w.eval("(window.__captured&&window.__captured.key_read_values)?RD.keyReadValueList(window.__captured.key_read_values.kr_a).length:-1") === 5, "the array shape reads back as 5 values");
  ok(w.eval("(window.__captured&&window.__captured.key_read_values)?RD.keyReadValueList(window.__captured.key_read_values.kr_b).length:-1") === 1, "the scalar shape reads back as 1 value (legacy trees stay valid)");

  // ---------- the key-read CARD shows which statistic is in force ----------
  // Guards the trap that __etbKpiById holds a PROJECTION ({gid,name,unit,direction}) with no
  // targetType — reading the statistic from it would silently never render the badge.
  ok(injected, "the ETB test hook was injected (the IIFE anchor still matches)");
  ok(w.eval("typeof window.__ETBH") === "object", "the hook exposes ETB internals to the harness");

  const hookOk = injected && w.eval("typeof window.__ETBH") === "object";
  if (!hookOk) {
    // fail cleanly instead of crashing on the first deref, so the cause is readable
    ok(false, "ETB hook unavailable — the injection anchor no longer matches; badge assertions skipped");
  } else {
  w.eval("window.__ETBH.setTree(" + JSON.stringify(TREE) + ")");
  ok(!!w.eval("window.__ETBH.tree() && window.__ETBH.tree().experiments.exp_1"), "the fixture tree is mounted inside the ETB");

  const probe = d.createElement("div"); probe.id = "krProbe"; d.body.appendChild(probe);
  let renderErr = null;
  try { w.eval("(function(){var n=window.__ETBH.renderKeyReads('exp_1'); if(n) document.getElementById('krProbe').appendChild(n);})()"); }
  catch (e) { renderErr = String(e && e.message || e); }
  ok(renderErr === null, "renderKeyReads runs through the hook (" + (renderErr || "ok") + ")");

  const badges = [...probe.querySelectorAll(".statbadge")];
  ok(badges.length === 1, "exactly the statistical key read gets a badge — the single-valued one does not (" + badges.length + ")");
  ok(badges.length === 1 && /average/.test(badges[0].textContent), "the badge names the statistic");
  ok(badges.length === 1 && /of 5/.test(badges[0].textContent), "…and the expected sample size");
  ok(badges.length === 1 && /linked KPI/.test(badges[0].getAttribute("title") || ""), "…and attributes the definition to the linked KPI");
  ok(probe.textContent.indexOf("Leak") >= 0, "the non-statistical key read still renders (it just has no badge)");

  // ---------- observed values render for EVERY key read ----------
  // Values live at exp.actual_outcome.key_read_values — array for statistical, scalar for single-valued.
  w.eval("(function(){var t=window.__ETBH.tree(); var e=t.experiments.exp_1;"
       + " e.status='complete';"
       + " e.actual_outcome={result_id:'res_1',recorded_date:'2026-07-20',recorded_by:'x',"
       + "   key_read_values:{ kr_a:[0.66,0.68,0.70,0.67,0.69], kr_b:0.4 } };})()");
  const probe2 = d.createElement("div"); probe2.id = "krProbe2"; d.body.appendChild(probe2);
  w.eval("(function(){var n=window.__ETBH.renderKeyReads('exp_1'); if(n) document.getElementById('krProbe2').appendChild(n);})()");
  const rows = [...probe2.querySelectorAll(".kr-observed")];
  ok(rows.length === 2, "an observed line renders for BOTH key reads — single-valued reads are no longer write-only (" + rows.length + ")");
  const statRow = rows.find(r => /n = /.test(r.textContent));
  const oneRow  = rows.find(r => !/n = /.test(r.textContent));
  ok(!!statRow && /measured 0\.68/.test(statRow.textContent), "the statistical read shows its computed statistic");
  ok(!!statRow && /n = 5 of 5/.test(statRow.textContent), "…with n against the expected sample size");
  ok(!!statRow && /sd/.test(statRow.textContent), "…and the spread");
  ok(!!oneRow && /measured 0\.4/.test(oneRow.textContent), "the single-valued read shows its measured number");
  ok(!!oneRow && !/n = /.test(oneRow.textContent), "…without a spurious n/statistic line");
  // legacy shape: a scalar recorded for a STATISTICAL read still renders (migration safety)
  w.eval("window.__ETBH.tree().experiments.exp_1.actual_outcome.key_read_values.kr_a=0.68;");
  const probe3 = d.createElement("div"); d.body.appendChild(probe3);
  w.eval("(function(){var n=window.__ETBH.renderKeyReads('exp_1'); if(n) document.body.lastChild.appendChild(n);})()");
  ok([...probe3.querySelectorAll(".kr-observed")].some(r => /measured 0\.68/.test(r.textContent)), "a LEGACY scalar on a statistical key read still renders (n = 1)");
  // no outcome -> no observed rows
  w.eval("delete window.__ETBH.tree().experiments.exp_1.actual_outcome;");
  const probe4 = d.createElement("div"); d.body.appendChild(probe4);
  w.eval("(function(){var n=window.__ETBH.renderKeyReads('exp_1'); if(n) document.body.lastChild.appendChild(n);})()");
  ok(probe4.querySelectorAll(".kr-observed").length === 0, "an experiment with no recorded outcome shows no observed line");
  }

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length ? `\n${fl.length}/${out.length} FAILED` : `\nPASS - ${out.length} ETB statistical-recorder assertions green`);
  process.exit(fl.length?1:0);
})();
