// Sales app — "Recover stranded execution data" (Option B). An objective was moved from BIZ-FIN to BIZ-BD;
// its KRs/KPIs/gates stayed in BIZ-FIN. Loading BIZ-BD, the scan finds them and recovery moves the full
// payload into BIZ-BD and removes it from BIZ-FIN (writing both bins). Broker mocked (no net in sandbox).
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
const OUT = (process.env.RD_OUT || '/mnt/user-data/outputs');
const html = fs.readFileSync(OUT + '/sales_app.html', 'utf8');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// store-backed broker mock; records PUTs so we can assert what each bin was written with
function makeFetch(store, puts) {
  return function (url, opts) {
    opts = opts || {}; const m = /\/state\/([^/?]+)(\/version)?/.exec(String(url)); const id = m ? m[1] : null;
    const isVer = m && m[2];
    if ((opts.method || "GET").toUpperCase() === "PUT") {
      let b = {}; try { b = JSON.parse(opts.body); } catch (e) { }
      const nv = String((store[id] ? +store[id].version : 0) + 1);
      store[id] = { doc: b.doc, etag: nv, version: nv };
      puts.push({ id, doc: b.doc });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ etag: nv, version: nv }) });
    }
    if (isVer) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: store[id] ? store[id].version : "0" }) });
    if (!store[id]) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ doc: store[id].doc, etag: store[id].etag, version: store[id].version }) });
  };
}

const portfolio = {
  divisions: [{ id: "FIN", name: "Financial", kind: "biz" }, { id: "BD", name: "Business Dev", kind: "biz" }],
  units: [], products: [], models: [],
  objectives: [{ id: "O1", statement: "Land logos", divisionId: "BD", quarter: "2026 Q1", plannedStart: 2192, plannedEnd: 2280 }],  // O1 now lives in BD
  initiatives: [], kpis: [], kpiDefs: [], kpiUpdates: [], catchupPlans: [],
};
// BIZ-FIN still holds O1's execution payload (stranded); BIZ-BD is empty for O1
const finDoc = {
  objectiveState: [], keyResults: [{ id: "KR1", objectiveId: "O1", statement: "signed" }, { id: "KRother", objectiveId: "Oz", statement: "keep" }],
  kpis: [{ id: "K1", objectiveId: "O1", hostType: "keyResult", hostId: "KR1" }], stageGates: [{ id: "G1", objectiveId: "O1", name: "gate" }],
  tasks: [], boards: [{ id: "B1", objectiveId: "O1", columns: [], swimlanes: [], tiles: [] }], gateMode: { O1: "kanban" },
  kpiUpdates: [{ id: "U1", kpiId: "K1", value: 5 }], stageGateEdges: [], chainGatesByDate: {}, risks: [], stageGateSets: [], catchupPlans: [], etbTrees: { O1: { project_id: "O1", experiments: {} } },
};
const bdDoc = { objectiveState: [], keyResults: [], kpis: [], stageGates: [], tasks: [], boards: [], gateMode: {}, kpiUpdates: [], stageGateEdges: [], chainGatesByDate: {}, risks: [], stageGateSets: [], catchupPlans: [], etbTrees: {} };

(async () => {
  const store = { "portfolio": { doc: portfolio, etag: "1", version: "1" }, "BIZ-FIN": { doc: finDoc, etag: "3", version: "3" }, "BIZ-BD": { doc: bdDoc, etag: "2", version: "2" } };
  const puts = [];
  const vc = new VirtualConsole(); const errs = []; vc.on("jsdomError", e => errs.push(e.message));
  const dom = new JSDOM(html, {
    runScripts: "dangerously", virtualConsole: vc, url: "https://x/?division=BD&token=tok", pretendToBeVisual: true,
    beforeParse(w) { w.fetch = makeFetch(store, puts); w.matchMedia = () => ({ matches: false, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } }); w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => { }; }
  });
  await sleep(900);
  const w = dom.window;
  ok(errs.length === 0, "no boot errors (" + JSON.stringify(errs.slice(0, 1)) + ")");

  // PLACEMENT: the recover button must live in the settings panel the HEADER GEAR opens (#settingsPanel),
  // not the ETB storage-settings modal (#settings) — the bug that shipped first.
  const _panel = w.document.getElementById("settingsPanel");
  const _btn = w.document.getElementById("btnRecoverStranded");
  ok(!!_panel && !!_btn && _panel.contains(_btn), "the Recover button is inside #settingsPanel (the header-gear settings)");
  const _gear = w.document.getElementById("settingsBtn"); if (_gear && _gear.onclick) _gear.onclick();
  ok(_panel.style.display === "block" && _panel.contains(_btn), "clicking the header gear reveals the panel with the Recover button");
  const _etb = w.document.getElementById("settings");
  ok(!(_etb && _etb.contains(_btn)), "the Recover button is NOT hidden in the ETB storage-settings modal");

  // WIRING REGRESSION (the actual bug): the handler was bound with the ETB-scoped $, so #btnRecoverStranded in
  // #settingsPanel never received a click handler and the button did nothing. Click the REAL button and require
  // the report to render. renderRecoverReport was NOT stubbed for this (we removed that stub); the direct-call
  // block below re-stubs via its own eval, so this must run first against the pristine store.
  _btn.click();
  await sleep(400);
  const _rep0 = w.document.getElementById("recoverReport");
  ok(!!_rep0 && _rep0.innerHTML.length > 0, "clicking the Recover button renders the report (wiring attached in the right scope)");
  ok(!!_rep0 && /stranded/i.test(_rep0.textContent), "the rendered report names the stranded objective");
  ok(!!w.document.getElementById("btnDoRecover"), "the report offers a 'Move it all here' button");
  // clear it so the direct-call block starts clean
  const _cancel0 = w.document.getElementById("btnCancelRecover"); if (_cancel0) _cancel0.click();

  // force the app into the BD division with the loaded portfolio/exec (bypass the real load handshake)
  w.eval(`portfolio=${JSON.stringify(portfolio)}; divisionId='BD'; exec=${JSON.stringify(bdDoc)}; execEtag='2'; selectedObj='O1'; setMsg=window.setMsg||function(){}; renderAll=function(){};`);

  // 1) SCAN: finds O1's payload stranded in BIZ-FIN
  const plan = await w.eval("scanStranded()");
  ok(Array.isArray(plan) && plan.length === 1, "scan finds exactly one stranded objective");
  ok(plan[0] && plan[0].objId === "O1" && plan[0].srcDiv === "FIN", "the stranded objective is O1, sourced from Financial");
  ok(plan[0].counts.keyResults === 1 && plan[0].counts.kpis === 1 && plan[0].counts.stageGates === 1 && plan[0].counts.boards === 1, "the preview counts KR+KPI+gate+board");

  // 2) RECOVER: moves the payload into BD and removes it from FIN
  await w.eval("doRecover()");
  await sleep(200);

  // this bin (exec / BIZ-BD) now HAS the payload
  ok(w.eval("exec.keyResults.filter(k=>k.objectiveId==='O1').length") === 1, "after recovery, O1's KR is in THIS division's exec");
  ok(w.eval("exec.kpis.length") === 1 && w.eval("exec.stageGates.length") === 1 && w.eval("exec.boards.length") === 1, "KPIs + gates + boards recovered into this bin");
  ok(w.eval("exec.kpiUpdates.length") === 1, "the KPI update followed its KPI");
  ok(w.eval("exec.gateMode && exec.gateMode.O1==='kanban'") === true, "gateMode[O1] recovered");
  ok(w.eval("!!(exec.etbTrees && exec.etbTrees.O1)") === true, "the ETB tree recovered");

  // both bins were written; the source bin (BIZ-FIN) had O1's payload REMOVED, keeping Oz
  const finWrite = puts.filter(p => p.id === "BIZ-FIN").pop();
  const bdWrite = puts.filter(p => p.id === "BIZ-BD").pop();
  ok(!!finWrite && !!bdWrite, "both the source bin (BIZ-FIN) and this bin (BIZ-BD) were written");
  ok(finWrite && finWrite.doc.keyResults.filter(k => k.objectiveId === "O1").length === 0, "the source bin no longer holds O1's KR (moved out)");
  ok(finWrite && finWrite.doc.keyResults.some(k => k.id === "KRother"), "the source bin still holds its OTHER objective's KR (Oz untouched)");
  ok(finWrite && !("O1" in (finWrite.doc.gateMode || {})), "the source bin's gateMode[O1] was removed");
  ok(bdWrite && bdWrite.doc.keyResults.some(k => k.id === "KR1"), "this bin's write includes the recovered KR");

  // 3) idempotent: a second scan now finds nothing
  const plan2 = await w.eval("scanStranded()");
  ok(Array.isArray(plan2) && plan2.length === 0, "a second scan finds nothing (recovery was complete)");

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fl = out.filter(x => x.startsWith('FAIL'));
  console.log(fl.length ? `\n${fl.length}/${out.length} FAILED` : `\nPASS - ${out.length} recover-stranded (sales) assertions green`);
  process.exit(fl.length ? 1 : 0);
})();
