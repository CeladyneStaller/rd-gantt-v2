// How a milestone gets its product.
//
// A milestone has no product of its own — it inherits from its initiative. Four places derived that
// independently with `init.productId`, which missed a MODEL-pinned initiative entirely: the schema
// allows productId OR modelId (the app enforces one or the other), so a model-pinned initiative left
// its milestones unclassified — blank in the Product column and invisible to a product filter.
//
// They now share one resolver built on RD.effProduct, which walks a model up to its parent product the
// same way objectives already classify.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const html = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/planning_app.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
  url: 'https://x.test/?token=t&tab=milestones', pretendToBeVisual: true,
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {};
    w.fetch = () => Promise.reject(new Error('no net'));
    w.cytoscape = function () { return { on() {}, ready(cb) { try { cb && cb(); } catch (e) {} }, fit() {}, resize() {},
      destroy() {}, getElementById() { return { length: 0 }; }, zoom() { return 1; }, width() { return 800; },
      height() { return 560; }, layout() { return { run() {} }; }, $() { return { unselect() {} }; } }; };
  }
});

setTimeout(() => {
  const w = dom.window, d = w.document;
  try {
    const day = (iso) => w.eval('isoToDay("' + iso + '")');
    /* PROD-pinned and MODEL-pinned initiatives side by side, plus one pinned to nothing. The model
       belongs to P2, so a correct resolver classifies MS-MODEL to P2 without it being named anywhere. */
    w.eval(`persistPortfolio=function(){};
      portfolio={units:[{id:"U1",name:"U"}],
        divisions:[{id:"D",name:"D",unitId:"U1",kind:"rd"}],
        products:[{id:"P1",name:"Prod one",divisionId:"D"},{id:"P2",name:"Prod two",divisionId:"D"}],
        models:[{id:"M-A",name:"Model A",productId:"P2"}],
        kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[],objectives:[],milestoneState:[],
        initiatives:[
          {id:"I-PROD",name:"Product pinned",divisionId:"D",productId:"P1"},
          {id:"I-MODEL",name:"Model pinned",divisionId:"D",modelId:"M-A"},
          {id:"I-NONE",name:"Unpinned",divisionId:"D"}
        ],
        milestones:[
          {id:"MS-PROD",name:"From product init",initiativeId:"I-PROD",plannedDate:${day('2026-06-30')}},
          {id:"MS-MODEL",name:"From model init",initiativeId:"I-MODEL",plannedDate:${day('2026-07-31')}},
          {id:"MS-NONE",name:"From unpinned init",initiativeId:"I-NONE",plannedDate:${day('2026-08-31')}},
          {id:"MS-ORPHAN",name:"No initiative",initiativeId:null,plannedDate:${day('2026-09-30')}}
        ]};
      pfFilters.unit="";pfFilters.division="";pfFilters.product="";pfFilters.quarter="";pfFilters.status="";
      renderMilestones();`);

    const prodOf = (id) => w.eval('String(msProductId(byId("milestone",' + JSON.stringify(id) + ')))');

    // ---------- the resolver ----------
    ok(prodOf('MS-PROD') === 'P1', "a milestone under a PRODUCT-pinned initiative takes that product");
    ok(prodOf('MS-MODEL') === 'P2',
      "a milestone under a MODEL-pinned initiative resolves to the model's parent product (" + prodOf('MS-MODEL') + ")");
    ok(prodOf('MS-NONE') === 'null', "an unpinned initiative gives its milestones no product");
    ok(prodOf('MS-ORPHAN') === 'null', "…and a milestone with no initiative has none either, rather than throwing");

    // ---------- the table column ----------
    const row = (id) => d.querySelector('.ms-row[data-msedit="' + id + '"]');
    const prodCell = (id) => { const r = row(id); return r ? (r.querySelector('td:nth-child(4)') || {}).textContent.trim() : null; };
    ok(!!row('MS-MODEL'), "the model-pinned milestone appears in the table");
    ok(/Prod two/.test(prodCell('MS-MODEL') || ''),
      "…showing its product rather than a blank cell (" + prodCell('MS-MODEL') + ")");
    ok(/Prod one/.test(prodCell('MS-PROD') || ''), "…and the product-pinned one is unchanged");

    // ---------- the product filter ----------
    const matches = (id) => w.eval('msMatches(byId("milestone",' + JSON.stringify(id) + '))');
    w.eval('pfFilters.product="P2";');
    ok(matches('MS-MODEL') === true,
      "filtering to the model's parent product FINDS the milestone — it used to be invisible");
    ok(matches('MS-PROD') === false, "…and does not match one belonging to another product");
    w.eval('pfFilters.product="P1";');
    ok(matches('MS-PROD') === true, "filtering to the other product finds that one");
    ok(matches('MS-MODEL') === false, "…and not the model-pinned one");
    w.eval('pfFilters.product="";');

    // ---------- every site agrees ----------
    /* The point of one resolver: the table, the filter, the numbering and the report cannot disagree
       about which product a milestone belongs to. */
    ok(/msProductId/.test(html), "a single helper resolves the product");
    const uses = (html.match(/msProductId\(/g) || []).length;
    ok(uses >= 4, "…and every site uses it — table, filter, numbering, report (" + uses + " call sites)");
    ok(!/prodId=init\?init\.productId:null/.test(html),
      "…with no site left deriving the product for itself");
  } catch (e) {
    ok(false, 'milestone product flow threw: ' + (e && e.message));
  }

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} milestone-product assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1200);
