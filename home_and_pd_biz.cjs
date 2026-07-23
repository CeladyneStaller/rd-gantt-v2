// (1) Every app's Home button links to the CeladyneHQ hub (was index.html).
// (2) The Product Designer excludes kind="biz" divisions from its division picker + default-division fallback
//     (it's a product/hardware tool; biz divisions have no product hierarchy). Broker mocked (no net in sandbox).
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
const OUT = (process.env.RD_OUT || '/mnt/user-data/outputs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HQ = "https://celadynestaller.github.io/CeladyneHQ/";

// ---------- (1) home links: a static check across all four built apps ----------
["planning_app", "execution_app", "sales_app", "product_designer"].forEach(app => {
  const html = fs.readFileSync(OUT + '/' + app + '.html', 'utf8');
  const m = /<a class="home" href="([^"]*)"/.exec(html);
  ok(!!m, app + ": has a .home link");
  ok(m && m[1] === HQ, app + ": the Home button links to the CeladyneHQ hub (not index.html)");
});

// ---------- (2) Product Designer biz-division filter (driven live) ----------
function makeFetch(store) {
  return function (url, opts) {
    opts = opts || {}; const m = /\/state\/([^/?]+)(\/version)?/.exec(String(url)); const id = m ? m[1] : null; const isVer = m && m[2];
    if ((opts.method || "GET").toUpperCase() === "PUT") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ etag: "2", version: "2" }) });
    if (isVer) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ version: store[id] ? store[id].version : "0" }) });
    if (!store[id]) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ doc: store[id].doc, etag: store[id].etag, version: store[id].version }) });
  };
}

(async () => {
  const pf = {
    units: [],
    divisions: [
      { id: "D-FC", name: "Fuel Cell", kind: "rd" },
      { id: "D-EL", name: "Electrolyzer", kind: "rd" },
      { id: "D-SALES", name: "Sales", kind: "biz" },
      { id: "D-BD", name: "BizDev", kind: "biz" },
    ],
    products: [{ id: "P1", name: "Stack", divisionId: "D-FC" }], models: [], initiatives: [], objectives: [],
  };
  const store = { portfolio: { doc: pf, etag: "1", version: "1" } };
  const vc = new VirtualConsole(); const errs = []; vc.on("jsdomError", e => errs.push(e.message));
  const dom = new JSDOM(fs.readFileSync(OUT + '/product_designer.html', 'utf8'), {
    runScripts: "dangerously", virtualConsole: vc, url: "https://x/?token=t", pretendToBeVisual: true,
    beforeParse(w) { w.fetch = makeFetch(store); w.matchMedia = () => ({ matches: false, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } }); w.requestAnimationFrame = cb => setTimeout(cb, 0); }
  });
  await sleep(800);
  const w = dom.window, d = w.document;
  w.eval("portfolio=" + JSON.stringify(pf) + "; if(typeof fillDivSelect==='function') fillDivSelect();");
  ok(errs.length === 0, "product designer boots without errors (" + JSON.stringify(errs.slice(0, 1)) + ")");

  // the helper returns only non-biz divisions
  ok(w.eval("typeof pdDivisions")==="function", "pdDivisions() helper exists");
  ok(w.eval("pdDivisions().length") === 2, "pdDivisions() returns exactly the 2 kind=rd divisions");
  ok(w.eval("pdDivisions().every(function(x){return x.kind!=='biz';})"), "pdDivisions() contains no kind=biz division");

  // the division dropdown lists only the rd divisions
  const optTexts = [...d.getElementById("divSelect").querySelectorAll("option")].map(o => o.textContent);
  ok(optTexts.indexOf("Fuel Cell") >= 0 && optTexts.indexOf("Electrolyzer") >= 0, "the division picker lists the product (rd) divisions");
  ok(optTexts.indexOf("Sales") < 0 && optTexts.indexOf("BizDev") < 0, "the division picker EXCLUDES kind=biz divisions (Sales, BizDev)");

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fl = out.filter(x => x.startsWith('FAIL'));
  console.log(fl.length ? `\n${fl.length}/${out.length} FAILED` : `\nPASS - ${out.length} home-link + PD biz-filter assertions green`);
  process.exit(fl.length ? 1 : 0);
})();
