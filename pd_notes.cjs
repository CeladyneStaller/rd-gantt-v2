// Product Designer — a free-text Notes field on all four entities: product specification
// (keyResult), component (stageGate), sub-product (stageGate w/ refModel), and component
// specification (KPI hosted on a component). Drives the REAL cards/modals: clicks the actual
// data-edit affordance, asserts the textarea is in the modal that opens, types, saves, and
// checks the value landed on the record and the card shows its marker. Broker mocked.
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
const OUT = (process.env.RD_OUT || '/mnt/user-data/outputs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PEN = String.fromCharCode(0x270e);

const portfolio = {
  units: [], divisions: [{ id: "D-FC", name: "Fuel Cell", kind: "rd" }],
  products: [{ id: "P1", name: "Stack", divisionId: "D-FC" }],
  models: [{ id: "M1", name: "Gen2", productId: "P1" }],
  initiatives: [], objectives: [], kpis: [], kpiDefs: [], kpiUpdates: [], catchupPlans: [],
};
const specDoc = {
  keyResults: [{ id: "KR1", objectiveId: "M1", statement: "Power density" }],
  stageGates: [
    { id: "SG1", objectiveId: "M1", name: "MEA" },                          // component
    { id: "SG2", objectiveId: "M1", name: "Sub Stack", refModel: "M9" },    // sub-product
  ],
  kpis: [{ id: "K1", objectiveId: "M1", hostType: "component", hostId: "SG1", name: "Thickness" }],
  kpiUpdates: [], modelSpec: {},
};

function makeFetch(store) {
  return function (url, opts) {
    opts = opts || {}; const m = /\/state\/([^/?]+)(\/version)?/.exec(String(url)); const id = m ? m[1] : null; const isVer = m && m[2];
    if ((opts.method || "GET").toUpperCase() === "PUT") {
      let b = {}; try { b = JSON.parse(opts.body); } catch (e) { }
      const nv = String((store[id] ? +store[id].version : 0) + 1);
      store[id] = { doc: b.doc, etag: nv, version: nv };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ etag: nv, version: nv }) });
    }
    if (isVer) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: store[id] ? store[id].version : "0" }) });
    if (!store[id]) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ doc: store[id].doc, etag: store[id].etag, version: store[id].version }) });
  };
}

(async () => {
  const store = {
    portfolio: { doc: portfolio, etag: "1", version: "1" },
    "SPEC-D-FC": { doc: specDoc, etag: "1", version: "1" },
  };
  const vc = new VirtualConsole(); const errs = []; vc.on("jsdomError", e => errs.push(e.message));
  const dom = new JSDOM(fs.readFileSync(OUT + '/product_designer.html', 'utf8'), {
    runScripts: "dangerously", virtualConsole: vc, url: "https://x/?division=D-FC&token=t", pretendToBeVisual: true,
    beforeParse(w) { w.fetch = makeFetch(store); w.matchMedia = () => ({ matches: false, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } }); w.requestAnimationFrame = cb => setTimeout(cb, 0); }
  });
  await sleep(900);
  const w = dom.window, d = w.document;
  ok(errs.length === 0, "boots without errors (" + JSON.stringify(errs.slice(0, 1)) + ")");

  // put the app on the fixture model and paint the panels (this also runs wireExec)
  w.eval("divisionId='D-FC'; selectedProduct='P1'; selectedModel='M1'; doc=" + JSON.stringify(specDoc) + "; renderAll();");
  await sleep(150);

  const overlay = () => d.getElementById("modalOverlay");
  const modalOpen = () => { const o = overlay(); return !!(o && o.classList.contains("open")); };
  const body = () => d.getElementById("modalBody");
  const notesTa = () => body().querySelector('textarea[data-f="notes"]');
  const closeIfOpen = () => { if (modalOpen()) w.eval("closeModal()"); };

  // open an editor the way a user does: click the card's real data-edit affordance
  function clickEdit(sel) {
    const el = d.querySelector(sel);
    if (!el) return null;
    el.click();
    return el;
  }

  // ---------- 1) product specification (keyResult) ----------
  const specHit = clickEdit('[data-edit="keyResult:KR1"]');
  ok(!!specHit, "the product-specification card exposes an edit affordance");
  ok(modalOpen(), "clicking it opens the modal overlay (.open)");
  ok(!!notesTa(), "product spec editor has a Notes textarea, inside the modal that opened");
  if (notesTa()) {
    notesTa().value = "spec note here";
    const sv = body().querySelector("[data-krsave]");
    ok(!!sv, "product spec editor has its save button");
    if (sv) sv.click();
    await sleep(120);
    ok(w.eval("(doc.keyResults.find(x=>x.id==='KR1')||{}).notes") === "spec note here", "the product spec note persists on the keyResult record");
  }
  closeIfOpen();

  // ---------- 2) component (stageGate) ----------
  w.eval("renderAll();"); await sleep(80);
  const compHit = clickEdit('[data-edit="stageGate:SG1"]');
  ok(!!compHit, "the component card exposes an edit affordance");
  ok(modalOpen() && !!notesTa(), "component editor has a Notes textarea in the opened modal");
  if (notesTa()) {
    notesTa().value = "component note";
    const sv = body().querySelector('[data-save="1"]');
    if (sv) sv.click();
    await sleep(120);
    ok(w.eval("(doc.stageGates.find(x=>x.id==='SG1')||{}).notes") === "component note", "the component note persists on the stageGate record");
  }
  closeIfOpen();

  // ---------- 3) sub-product (stageGate with refModel) ----------
  w.eval("renderAll();"); await sleep(80);
  const subHit = clickEdit('[data-edit="stageGate:SG2"]');
  ok(!!subHit, "the sub-product card exposes an edit affordance (it had none before)");
  ok(modalOpen() && !!notesTa(), "sub-product editor has a Notes textarea in the opened modal");
  ok(d.getElementById("modalTitle").textContent === "Edit sub-product", "the modal is titled 'Edit sub-product', not 'Edit component'");
  ok(!body().querySelector('[data-f="ctype"]') && !body().querySelector('[data-f="status"]'), "the sub-product editor hides Type/Status (they belong to the referenced model)");
  ok(body().textContent.indexOf("Component specifications") < 0, "...and hides the component-specification list");
  if (notesTa()) {
    notesTa().value = "using it here";
    const sv = body().querySelector('[data-save="1"]');
    if (sv) sv.click();
    await sleep(120);
    ok(w.eval("(doc.stageGates.find(x=>x.id==='SG2')||{}).notes") === "using it here", "the sub-product note persists on the LOCAL stageGate (not the referenced model)");
    ok(w.eval("(doc.stageGates.find(x=>x.id==='SG2')||{}).refModel") === "M9", "the sub-product still references its model after saving");
  }
  closeIfOpen();

  // ---------- 4) component specification (KPI on a component) ----------
  // NB: a component-hosted KPI is intercepted by the [data-edit] handler and opens the TARGET
  // modal (#kpiTgtOverlay / #kpiTgtBody, fields keyed data-tf) — not the generic sub-editor.
  w.eval("renderAll();"); await sleep(80);
  const kpiHit = clickEdit('[data-edit="kpi:K1"]');
  ok(!!kpiHit, "the component-specification row exposes an edit affordance");
  const tgtOv = d.getElementById("kpiTgtOverlay");
  const tgtBody = d.getElementById("kpiTgtBody");
  ok(!!tgtOv && tgtOv.classList.contains("open"), "it opens the target modal (visible, .open)");
  const tgtNotes = tgtBody.querySelector('textarea[data-tf="notes"]');
  ok(!!tgtNotes, "component spec editor has a Notes textarea, in the modal that actually opened");
  ok(!!tgtNotes && tgtNotes.closest(".modal-field").style.display !== "none", "the Notes field is SHOWN for a component-hosted spec");
  if (tgtNotes) {
    tgtNotes.value = "spec metric note";
    const sv = tgtBody.querySelector("[data-tgtsave]");
    ok(!!sv, "the target modal has its save button");
    if (sv) sv.click();
    await sleep(140);
    ok(w.eval("(doc.kpis.find(x=>x.id==='K1')||{}).notes") === "spec metric note", "the component spec note persists on the KPI record");
  }
  w.eval("closeTgtModal()");

  // a KPI hosted on a product SPECIFICATION must NOT offer notes (the spec record owns them)
  w.eval("openTgtModal('KR1', null, 'keyResult');"); await sleep(80);
  const krTgtNotes = d.getElementById("kpiTgtBody").querySelector('textarea[data-tf="notes"]');
  ok(!krTgtNotes || krTgtNotes.closest(".modal-field").style.display === "none", "a keyResult-hosted metric hides Notes (no second box beside the spec's own)");
  w.eval("closeTgtModal()");

  // ---------- 5) notes render as an expandable section, COLLAPSED by default ----------
  w.eval("renderAll();"); await sleep(120);
  const sections = [...d.querySelectorAll("details.note-details")];
  ok(sections.length >= 4, "every card with notes shows an expandable notes section (" + sections.length + " found)");
  ok(sections.every(s => !s.open), "all notes sections are COLLAPSED by default");
  ok(sections.every(s => (s.querySelector("summary") || {}).textContent && s.querySelector("summary").textContent.indexOf(PEN) >= 0), "the summary shows the notes affordance glyph");
  // the note TEXT lives in the collapsed body (present in DOM, not shown as a card preview)
  ok(sections.some(s => (s.querySelector(".note-body") || {}).textContent === "spec note here"), "the note text is inside the collapsible body");
  // expanding one reveals its text and records open-state; collapsing clears it
  const specSection = sections.find(s => (s.querySelector(".note-body") || {}).textContent === "using it here");
  ok(!!specSection, "the sub-product's note section is present");
  if (specSection) {
    specSection.open = true; specSection.dispatchEvent(new w.Event("toggle"));
    await sleep(40);
    ok(w.eval("notesOpen.has('SG2')"), "expanding a section records it in notesOpen (survives re-render)");
    // a re-render keeps it open
    w.eval("renderAll();"); await sleep(80);
    const reSG2 = [...d.querySelectorAll("details.note-details")].find(s => s.dataset.noteid === "SG2");
    ok(reSG2 && reSG2.open, "an expanded note stays open across a re-render");
    // collapse clears the state
    reSG2.open = false; reSG2.dispatchEvent(new w.Event("toggle"));
    await sleep(40);
    ok(!w.eval("notesOpen.has('SG2')"), "collapsing a section clears its open-state");
  }
  // a component-spec note appears as a full-width sub-row inside the metrics table
  ok([...d.querySelectorAll("tr.note-tr")].some(tr => (tr.textContent || "").indexOf("spec metric note") >= 0), "a component-spec note renders as a full-width row in the metrics table");

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fl = out.filter(x => x.startsWith('FAIL'));
  console.log(fl.length ? `\n${fl.length}/${out.length} FAILED` : `\nPASS - ${out.length} product-designer notes assertions green`);
  process.exit(fl.length ? 1 : 0);
})();
