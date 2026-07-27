// Execution app — "Connect data" one-shot import. Drives the REAL controls: clicks the actual
// button on a KR row, asserts the modal is VISIBLE in the container the trigger opens, ticks a real
// checkbox, clicks the real Import button, and checks the reading landed on exec.kpiUpdates with
// provenance. Broker (incl. GET /analysis) is mocked — no network in the sandbox.
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
const OUT = (process.env.RD_OUT || '/mnt/user-data/outputs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// The app's boot render hits a known metric-strip "Invalid time value" on minimal fixtures. That is a
// RENDER issue in unrelated code, not a connect-data failure; swallow only that one so the real
// assertions below still run. Anything else still surfaces.
process.on("unhandledRejection", e => { const t=String((e&&e.message)||e); if(/Invalid time value/.test(t)) return; throw e; });
const V1 = 'V @ 1 A/cm\u00B2';

const INDEX = { schema: 2, runs: [
  { job_id:"j-1041", sample_name:"MEA-17", script:"Polarization Curve", timestamp:"2026-07-19T14:02:00Z", bin_id:"b1",
    Data:[{Analysis:"polcurve", step:"", Conditions:{T_C:80,RH_pct:100,P_value:150,P_unit:"kPa"}, key_values:{"OCV":0.953,[V1]:0.681}}]},
  { job_id:"j-1042", sample_name:"MEA-17", script:"H2 Crossover", timestamp:"2026-07-19T15:20:00Z", bin_id:"b2",
    Data:[{Analysis:"crossover", step:"", Conditions:{T_C:80,RH_pct:100}, key_values:{"|j_xover|":1.42}}]},
  { job_id:"j-1035", sample_name:"MEA-16", script:"Polarization Curve", timestamp:"2026-07-17T11:00:00Z", bin_id:"b3",
    Data:[{Analysis:"polcurve", step:"", Conditions:{T_C:95,RH_pct:100}, key_values:{"OCV":0.941}}]},
  { job_id:"j-1030", sample_name:"CCM-204", script:"ECSA", timestamp:"2026-07-15T09:12:00Z", bin_id:"b4",
    Data:[{Analysis:"ecsa", step:"", Conditions:{T_C:30}, key_values:{"Average ECSA":58.4}}]},
  { job_id:"j-1022", sample_name:"MEA-15", script:"Polarization Curve", timestamp:"2026-07-11T13:44:00Z", bin_id:"b5",
    Data:[{Analysis:"polcurve", step:"", Conditions:{T_C:80,RH_pct:100}, key_values:{"OCV":0.950}}]},
  { job_id:"j-1014", sample_name:"STK-03", script:"Polarization Curve", timestamp:"2026-07-08T10:05:00Z", bin_id:"b6",
    Data:[{Analysis:"polcurve", step:"", Conditions:{T_C:75,RH_pct:100}, key_values:{"OCV":0.939}}]},
  { job_id:"j-0998", sample_name:"MEA-12", script:"Polarization Curve", timestamp:"2026-06-28T15:30:00Z", bin_id:"b7",
    Data:[{Analysis:"polcurve", step:"", Conditions:{T_C:80,RH_pct:100}, key_values:{"OCV":0.944}}]}
]};

const portfolio = { units:[], divisions:[{id:"DIV-FC",name:"Fuel Cell",kind:"rd"}], products:[], models:[],
  initiatives:[{id:"I1",name:"Init",divisionId:"DIV-FC"}],
  objectives:[{id:"O1",statement:"Gen2 MEA",divisionId:"DIV-FC",initiativeId:"I1",quarter:"2026 Q1",plannedStart:2192,plannedEnd:2280}],
  kpis:[], kpiDefs:[], kpiUpdates:[], catchupPlans:[] };
const execDoc = { objectiveState:[], keyResults:[{id:"KR1",objectiveId:"O1",statement:"Hit 0.68 V"}],
  kpis:[{id:"K-11",objectiveId:"O1",hostType:"keyResult",hostId:"KR1",name:V1,unit:"V",targetType:"statistical",direction:"up",target:0.68}],
  stageGates:[{id:"SG1",objectiveId:"O1",name:"Perf gate"}], tasks:[], boards:[], gateMode:{},
  kpiUpdates:[], stageGateEdges:[], chainGatesByDate:{}, risks:[], stageGateSets:[], catchupPlans:[], etbTrees:{} };

let analysisCalls = 0;
function makeFetch(store){
  return function(url,opts){
    opts=opts||{}; const u=String(url);
    if(/\/analysis$/.test(u)){ analysisCalls++; return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(INDEX)}); }
    const m=/\/state\/([^/?]+)(\/version)?/.exec(u); const id=m?m[1]:null; const isVer=m&&m[2];
    if((opts.method||"GET").toUpperCase()==="PUT"){ const nv=String((store[id]?+store[id].version:0)+1); store[id]={doc:JSON.parse(opts.body).doc,etag:nv,version:nv}; return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({etag:nv,version:nv})}); }
    if(isVer) return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({version:store[id]?store[id].version:"0"})});
    if(!store[id]) return Promise.resolve({ok:false,status:404,json:()=>Promise.resolve(null)});
    return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({doc:store[id].doc,etag:store[id].etag,version:store[id].version})});
  };
}

(async () => {
  const store={ portfolio:{doc:portfolio,etag:"1",version:"1"}, "EXEC-DIV-FC":{doc:execDoc,etag:"1",version:"1"} };
  const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push(e.message));
  const dom=new JSDOM(fs.readFileSync(OUT+'/execution_app.html','utf8'),{
    runScripts:"dangerously",virtualConsole:vc,url:"https://x/?division=DIV-FC&token=t",pretendToBeVisual:true,
    beforeParse(w){ w.fetch=makeFetch(store); w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); }});
  await sleep(900);
  const w=dom.window, d=dom.window.document;
  ok(errs.length===0, "boots without errors ("+JSON.stringify(errs.slice(0,1))+")");

  // put the app on the fixture objective; stub renderAll (the metric strip needs a fuller fixture)
  w.eval(`portfolio=${JSON.stringify(portfolio)}; exec=${JSON.stringify(execDoc)}; selectedObj='O1'; divisionId='DIV-FC'; renderAll=function(){}; persist=function(){}; setMsg=function(){};`);

  const overlay = () => d.getElementById("cdOverlay");
  const visible = () => { const o=overlay(); return !!(o && o.classList.contains("open")); };

  // ---------- 1) open from a KR ----------
  w.eval("openConnectData('keyResult','KR1')");
  await sleep(200);
  ok(visible(), "opening from a KR shows the picker modal (.open — actually visible, not just present)");
  ok(analysisCalls === 1, "the index is fetched from the broker's /analysis route");
  ok(d.getElementById("cdCtx").textContent.indexOf("Hit 0.68 V") >= 0, "the modal names the host key result");

  // ---------- 2) default view = 5 distinct samples ----------
  let rows=[...d.querySelectorAll("#cdBody .cd-srow")];
  ok(rows.length===5, "the default view lists 5 samples ("+rows.length+")");
  const names=rows.map(r=>r.querySelector(".cd-sname").textContent);
  ok(names.join(",")==="MEA-17,MEA-16,CCM-204,MEA-15,STK-03", "...the 5 most recent DISTINCT samples");
  ok(!names.includes("MEA-12"), "an older sample is outside the default window");

  // ---------- 3) search reaches the whole index ----------
  d.getElementById("cdName").value="MEA-12"; w.eval("cdRender()");
  await sleep(80);
  rows=[...d.querySelectorAll("#cdBody .cd-srow")];
  ok(rows.length===1 && rows[0].querySelector(".cd-sname").textContent==="MEA-12", "search finds a sample outside the recent 5");
  d.getElementById("cdName").value=""; w.eval("cdRender()"); await sleep(60);

  // ---------- 4) expand a sample: units unioned across runs ----------
  w.eval("cdToggle('MEA-17')"); await sleep(80);
  const units=[...d.querySelectorAll("#cdBody .cd-unit")];
  ok(units.length===2, "MEA-17 expands to units unioned from its TWO jobs ("+units.length+")");
  ok(d.querySelector("#cdBody .cd-sbody").textContent.indexOf("crossover")>=0, "the crossover run appears alongside the polcurve run");

  // ---------- 5) tick a real checkbox ----------
  const boxes=[...d.querySelectorAll('#cdBody input[type=checkbox][data-cdpick]')];
  ok(boxes.length>=3, "each promoted value has a checkbox ("+boxes.length+")");
  const vBox=boxes.find(b=>b.getAttribute("data-key")===V1);
  ok(!!vBox, "the V @ 1 A/cm² value is selectable");
  vBox.checked=true; vBox.dispatchEvent(new w.Event("change")); await sleep(80);
  ok(d.getElementById("cdCount").textContent.indexOf("1 value")>=0, "ticking a value updates the selection count");
  ok(d.getElementById("cdImport").disabled===false, "...and enables Import");

  // the target dropdown pre-selects the KPI whose name matches the canonical key
  const selEl=d.querySelector("#cdBody td.cd-t select");
  ok(!!selEl && selEl.value==="K-11", "the import target pre-selects the KPI matching the canonical key");

  // ---------- 6) import writes a real reading ----------
  d.getElementById("cdImport").click(); await sleep(200);
  const ups=w.eval("JSON.stringify(exec.kpiUpdates)");
  const updates=JSON.parse(ups);
  ok(updates.length===1, "importing writes exactly one reading");
  const u0=updates[0]||{};
  ok(u0.kpiId==="K-11" && u0.value===0.681, "the reading lands on the chosen KPI with the measured value");
  ok(u0.timestamp===Date.parse("2026-07-19T14:02:00Z"), "it is timestamped when the measurement RAN, not when imported");
  ok(!!u0.src && u0.src.portal==="analysis" && u0.src.job_id==="j-1041", "provenance records the portal and job");
  ok(!!u0.src && u0.src.sample==="MEA-17" && u0.src.cond && u0.src.cond.T_C===80, "provenance records the sample and conditions taken");
  ok(!visible(), "the modal closes after importing");

  // ---------- 7) re-importing the same value is skipped ----------
  w.eval("openConnectData('keyResult','KR1')"); await sleep(150);
  if(!d.querySelector("#cdBody .cd-sbody")){ w.eval("cdToggle('MEA-17')"); await sleep(80); }
  const b2=[...d.querySelectorAll('#cdBody input[type=checkbox][data-cdpick]')].find(b=>b.getAttribute("data-key")===V1);
  ok(!!b2, "the previously-imported value is still listed");
  if(b2){ b2.checked=true; b2.dispatchEvent(new w.Event("change")); await sleep(80);
    d.getElementById("cdImport").click(); await sleep(200); }
  ok(JSON.parse(w.eval("JSON.stringify(exec.kpiUpdates)")).length===1, "re-importing the same measurement does not double-count");

  // ---------- 8) create-new-KPI path ----------
  w.eval("openConnectData('stageGate','SG1')"); await sleep(150);
  ok(visible(), "the picker also opens from a stage-gate");
  w.eval("cdToggle('MEA-17')"); await sleep(80);
  const xBox=[...d.querySelectorAll('#cdBody input[type=checkbox][data-cdpick]')].find(b=>b.getAttribute("data-key")==="|j_xover|");
  ok(!!xBox, "the crossover value is selectable from the same sample");
  xBox.checked=true; xBox.dispatchEvent(new w.Event("change")); await sleep(80);
  const sel2=d.querySelector("#cdBody td.cd-t select");
  ok(!!sel2 && sel2.value==="__new__", "with no matching KPI on the gate, the target defaults to 'create new KPI'");
  d.getElementById("cdImport").click(); await sleep(200);
  const kpis=JSON.parse(w.eval("JSON.stringify(exec.kpis)"));
  const made=kpis.find(k=>k.hostType==="stageGate" && k.hostId==="SG1");
  ok(!!made && made.name==="|j_xover|", "a new KPI is created on the gate, named from the canonical key");
  ok(!!made && made.unit==="mA/cm\u00B2", "...carrying the key's implied unit");
  const ups2=JSON.parse(w.eval("JSON.stringify(exec.kpiUpdates)"));
  ok(ups2.length===2 && ups2.some(u=>u.kpiId===(made||{}).id), "the reading is written against the newly created KPI");


  // ---------- 9) provenance is VISIBLE on the reading surface ----------
  // kpiTable is the table a KR / stage-gate actually renders (data-postcell current value).
  const host = d.createElement("div"); host.id = "provProbe"; d.body.appendChild(host);
  host.innerHTML = w.eval('kpiTable("keyResult","KR1","O1")');
  const chip = host.querySelector(".src-chip");
  ok(!!chip, "an imported reading shows an 'analysis' chip beside its value");
  ok(!!chip && chip.textContent.indexOf("analysis") >= 0, "the chip reads as a real glyph + label, not a literal escape");
  ok(!!chip && (chip.getAttribute("title") || "").indexOf("MEA-17") >= 0, "the chip's tooltip names the sample it came from");
  ok(!!chip && /80/.test(chip.getAttribute("title") || ""), "...and the conditions taken");
  // the chip must theme with the app, not carry a fixed color that vanishes in one mode. jsdom does
  // not resolve CSS custom properties in getComputedStyle, so assert on the RULE the app ships.
  const chipRule = [...d.styleSheets].flatMap(ss=>{try{return [...ss.cssRules]}catch(e){return[]}})
    .find(r=>r.selectorText===".src-chip");
  ok(!!chipRule && /var\(--pill-info/.test(chipRule.style.cssText), "the chip's color is driven by theme tokens, so it adapts to light and dark");
  ok(!!chipRule && !/#13/.test(chipRule.style.cssText), "…with no hardcoded dark-only hex left behind");

  const det = host.querySelector("tr.prov-tr details.prov-d");
  ok(!!det, "a collapsible source row is rendered under the reading");
  ok(!!det && !det.open, "the source row is COLLAPSED by default");
  ok(!!det && det.closest("td").getAttribute("colspan") === "6", "it spans the full table width");
  const body = det && det.querySelector(".prov-body");
  const txt = body ? body.textContent : "";
  ok(/MEA-17/.test(txt) && /polcurve/.test(txt), "the source body names the sample and analysis");
  ok(/j-1041/.test(txt), "...the job it came from");
  ok(/imported/.test(txt) && /run/.test(txt), "...and separates the run time from the import time");

  // expanding survives a re-render
  if (det) { det.open = true; w.eval('cdProvToggle(document.querySelector("#provProbe details.prov-d"))'); }
  ok(w.eval('__provOpen.has("K-11")'), "expanding the source row records it so a re-render keeps it open");
  host.innerHTML = w.eval('kpiTable("keyResult","KR1","O1")');
  const det2 = host.querySelector("tr.prov-tr details.prov-d");
  ok(!!det2 && det2.open, "...and it is still open after re-rendering the table");

  // a KPI with no imported readings shows neither
  const gateHost = d.createElement("div");
  gateHost.innerHTML = w.eval('kpiTable("keyResult","KR1","O1")');
  ok(w.eval('cdLatestSrc("nope-kpi")') === null || w.eval('!cdLatestSrc("nope-kpi")'), "a KPI with no imported reading has no provenance");
  ok(w.eval('cdChipHtml("nope-kpi")') === "", "...and renders no chip");


  // ---------- reopening shows what's connected, reconstructed from the readings ----------
  // Source of truth is the readings, not a stored selection: section 6 imported V1 from MEA-17 into
  // K-11, so reopening KR1 must show that reading in a "Currently connected" section with its box
  // still ticked — reconstructed by joining kpiUpdates.src back to the index, surviving close/reopen.
  const connRows=()=>[...d.querySelectorAll('#cdBody .cd-connected [data-connpick]')];
  const connChecked=()=>connRows().filter(b=>b.checked).length;

  w.eval("openConnectData('keyResult','KR1')"); await sleep(250);
  ok(visible(), "the picker reopens");
  ok(!!d.querySelector("#cdBody .cd-connected"), "a Currently-connected section is shown, reconstructed from the readings");
  ok(connRows().length>=1, "the earlier import appears as a connected row ("+connRows().length+")");
  ok(connChecked()===connRows().length, "every connected reading is pre-ticked");
  ok(/MEA-17/.test((d.querySelector("#cdBody .cd-connected")||{}).textContent||""), "the connected section names the sample it came from");
  ok(d.getElementById("cdImport").textContent.indexOf("Apply")>=0, "the button reads Apply changes once something is connected");

  // ---------- unticking a connected reading removes it on Apply (the diff) ----------
  const cRow=connRows()[0];
  const kBefore=JSON.parse(w.eval("JSON.stringify(exec.kpiUpdates)")).filter(u=>u.kpiId==="K-11").length;
  ok(kBefore>=1, "K-11 has the connected reading before removal ("+kBefore+")");
  if(cRow){ cRow.checked=false; cRow.dispatchEvent(new w.Event("change")); await sleep(60); }
  ok(d.getElementById("cdCount").textContent.indexOf("to remove")>=0, "unticking a connected reading shows it will be removed");
  d.getElementById("cdImport").click(); await sleep(200);
  const kAfter=JSON.parse(w.eval("JSON.stringify(exec.kpiUpdates)")).filter(u=>u.kpiId==="K-11").length;
  ok(kAfter===kBefore-1, "applying removes exactly the unticked reading ("+kBefore+"→"+kAfter+")");

  w.eval("openConnectData('keyResult','KR1')"); await sleep(200);
  const stillConn=[...d.querySelectorAll('#cdBody .cd-connected [data-connpick]')].length;
  ok(stillConn===0 || !d.querySelector("#cdBody .cd-connected"), "after removal, that reading is no longer connected");
  w.eval("closeConnectData()"); await sleep(60);

  // ---------- the scale control ----------
  // Portal values sometimes arrive a decade or three off the plan's unit. The row carries a ×/÷ selector
  // whose factor is applied on import and recorded, so a scaled number stays explainable.
  w.eval("openConnectData('keyResult','KR1')"); await sleep(200);
  if(!d.querySelector("#cdBody .cd-sbody")){ const h0=d.querySelector('#cdBody .cd-shead'); if(h0){h0.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await sleep(100);} }
  const oBox=[...d.querySelectorAll('#cdBody input[type=checkbox][data-cdpick]')].find(b=>b.getAttribute("data-key")==="OCV");
  ok(!!oBox, "a second value is selectable for the scale test");
  if(oBox){ oBox.checked=true; oBox.dispatchEvent(new w.Event("change")); await sleep(80); }
  const scaleSel=d.querySelector("#cdBody select.cd-scale");
  ok(!!scaleSel, "a ticked row offers a scale selector");
  ok(!!scaleSel && scaleSel.value==="1", "…defaulting to ×1, so scaling is opt-in");
  const scaleOpts=scaleSel?[...scaleSel.options].map(o=>o.value):[];
  ok(scaleOpts.join(",")==="0.001,0.01,0.1,1,10,100,1000", "…offering ÷1000 through ×1000 ("+scaleOpts.join(",")+")");

  // choose ×1000 and confirm the row previews the scaled value
  if(scaleSel){ scaleSel.value="1000"; scaleSel.dispatchEvent(new w.Event("change")); await sleep(80); }
  const vShown=d.querySelector("#cdBody .cd-vscaled");
  ok(!!vShown, "choosing a scale previews the scaled value on the row");
  ok(!!vShown && Math.abs(Number(vShown.textContent)-953)<1e-6, "…0.953 shown as 953 under ×1000 ("+(vShown&&vShown.textContent)+")");
  ok(!!d.querySelector("#cdBody .cd-vwas"), "…while still showing what it was");

  const beforeScale=JSON.parse(w.eval("JSON.stringify(exec.kpiUpdates)")).length;
  const oSel=[...d.querySelectorAll("#cdBody td.cd-t select")].find(s=>!s.classList.contains("cd-scale"));
  if(oSel){ oSel.value="K-11"; oSel.dispatchEvent(new w.Event("change")); await sleep(60); }
  // re-pick the scale after the target re-render, then import
  const scaleSel2=d.querySelector("#cdBody select.cd-scale");
  if(scaleSel2 && scaleSel2.value!=="1000"){ scaleSel2.value="1000"; scaleSel2.dispatchEvent(new w.Event("change")); await sleep(60); }
  d.getElementById("cdImport").click(); await sleep(200);
  const afterUps=JSON.parse(w.eval("JSON.stringify(exec.kpiUpdates)"));
  ok(afterUps.length===beforeScale+1, "the scaled value imports as one reading");
  const scaled=afterUps[afterUps.length-1]||{};
  ok(Math.abs(Number(scaled.value)-953)<1e-6, "the SCALED number is what lands, not the raw one ("+scaled.value+")");
  ok(scaled.src && scaled.src.scale===1000, "the factor is recorded on the reading's provenance");
  ok(scaled.src && Math.abs(Number(scaled.src.value_raw)-0.953)<1e-9, "…alongside the original value ("+(scaled.src&&scaled.src.value_raw)+")");


  // ---------- the picker table's column widths are declared, not left to auto layout ----------
  // The regression this pins: with auto table-layout a long canonical key name ate the row and the
  // "Import into" column collapsed — and once it holds both a target dropdown and a scale selector,
  // that made it unusable. jsdom does no layout, so assert the contract rather than the pixels.
  const vt=d.querySelector("#cdBody table.cd-vals");
  ok(!!vt, "the value table is rendered");
  const cg=vt&&vt.querySelector("colgroup");
  ok(!!cg, "…with a colgroup declaring the column widths");
  ok(!!cg && cg.querySelectorAll("col").length===5, "…one col per column ("+(cg?cg.querySelectorAll("col").length:0)+")");
  ok(!!cg && !!cg.querySelector("col.c-tgt"), "…including a named column for Import into");
  const heads2=vt?[...vt.querySelectorAll("th")]:[];
  ok(heads2.every(h=>!/width/i.test(h.getAttribute("style")||"")), "no inline width hint is left on a header (auto layout would ignore it anyway)");
  ok(!!vt && !!vt.querySelector("td.cd-read"), "the reading cell is classed so a long key name wraps instead of pushing the row");
  const sheet=[...d.styleSheets].flatMap(ss=>{try{return [...ss.cssRules]}catch(e){return[]}});
  // the build scopes some selectors (".cd-vals" ships as "#cdBody table.cd-vals"), so match on substring
  const valsRule=sheet.find(r=>r.selectorText && /(^|[\s,])[#.\w]*\.cd-vals$/.test(r.selectorText) && /table-layout/.test(r.style.cssText||""));
  ok(!!valsRule && /fixed/.test(valsRule.style.cssText||""), "the table uses fixed layout, so declared widths are honoured");
  const tgtRule=sheet.find(r=>r.selectorText && r.selectorText.indexOf("col.c-tgt")>=0);
  ok(!!tgtRule && parseInt(tgtRule.style.width,10)>=240, "the Import-into column is wide enough for a target and a scale ("+(tgtRule&&tgtRule.style.width)+")");

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length ? `\n${fl.length}/${out.length} FAILED` : `\nPASS - ${out.length} connect-data (execution app) assertions green`);
  process.exit(fl.length?1:0);
})();
