// Filtering an initiative that has no objectives.
//
// initHasMatch asked "does any objective under this initiative match?" — so an initiative with NO
// objectives matched nothing and vanished the moment any filter was set. A long programme that has not
// been broken into objectives yet simply disappeared from the Gantt.
//
// It now falls back to the initiative's OWN designation: unit and division from where it sits, product
// and model from its own classification. Work filters (quarter, status) are properties of objectives,
// so an objectiveless initiative genuinely cannot satisfy them and stays hidden when one is set.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const html = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/planning_app.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
  url: 'https://x.test/?token=t&tab=gantt', pretendToBeVisual: true,
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
  const w = dom.window;
  try {
    /* Two divisions under two units, two products. BARE has no objectives at all; WORKED has one.
       That pairing is the whole point: every assertion below compares them under the same filter. */
    w.eval(`portfolio={
      units:[{id:"U1",name:"Unit one"},{id:"U2",name:"Unit two"}],
      divisions:[{id:"D1",name:"Div one",unitId:"U1",kind:"rd"},{id:"D2",name:"Div two",unitId:"U2",kind:"rd"}],
      products:[{id:"P1",name:"Prod one",divisionId:"D1"},{id:"P2",name:"Prod two",divisionId:"D1"}],
      models:[], milestones:[], kpis:[], kpiDefs:[], kpiUpdates:[], catchupPlans:[],
      initiatives:[
        {id:"BARE",name:"Long programme",divisionId:"D1",productId:"P1"},
        {id:"WORKED",name:"Has objectives",divisionId:"D1",productId:"P1"},
        {id:"OTHERDIV",name:"Elsewhere",divisionId:"D2",productId:"P2"}
      ],
      objectives:[{id:"O1",statement:"O",divisionId:"D1",initiativeId:"WORKED",quarter:"2026Q2",productId:"P1"}]
    };`);

    const setF = (f) => w.eval(`pfFilters.unit=${JSON.stringify(f.unit || '')};pfFilters.division=${JSON.stringify(f.division || '')};` +
      `pfFilters.product=${JSON.stringify(f.product || '')};pfFilters.quarter=${JSON.stringify(f.quarter || '')};` +
      `pfFilters.status=${JSON.stringify(f.status || '')};`);
    const shows = (id) => w.eval(`initHasMatch(portfolio.initiatives.find(i=>i.id===${JSON.stringify(id)}))`);

    // ---------- the reported bug ----------
    setF({});
    ok(shows('BARE') === true, "with no filter set an objectiveless initiative shows");

    setF({ division: 'D1' });
    ok(shows('BARE') === true, "…and still shows when filtering to ITS OWN division");
    ok(shows('WORKED') === true, "…alongside one that has objectives");
    ok(shows('OTHERDIV') === false, "…while one in another division is correctly hidden");

    setF({ division: 'D2' });
    ok(shows('BARE') === false, "filtering to a different division hides it");
    ok(shows('OTHERDIV') === true, "…and shows the one that belongs there");

    // ---------- unit ----------
    setF({ unit: 'U1' });
    ok(shows('BARE') === true, "it matches on the unit its division belongs to");
    setF({ unit: 'U2' });
    ok(shows('BARE') === false, "…and not on another unit");

    // ---------- product, from the initiative's own classification ----------
    setF({ product: 'P1' });
    ok(shows('BARE') === true, "it matches on its OWN product designation, with no objective to inherit from");
    setF({ product: 'P2' });
    ok(shows('BARE') === false, "…and not on a product it is not classified to");

    // ---------- work filters cannot apply ----------
    /* quarter and status are properties of objectives. An initiative with none cannot satisfy them, so
       hiding it is correct — the fallback must not wave those through. */
    setF({ quarter: '2026Q2' });
    ok(shows('BARE') === false, "a QUARTER filter hides it — an initiative has no quarter of its own");
    ok(shows('WORKED') === true, "…while one whose objective matches still shows");
    setF({ status: 'on-track' });
    ok(shows('BARE') === false, "a STATUS filter hides it for the same reason");

    // ---------- an initiative WITH objectives is unchanged ----------
    setF({ division: 'D1', quarter: '2026Q2' });
    ok(shows('WORKED') === true, "an initiative with objectives is still judged by them");
    setF({ division: 'D1', quarter: '2027Q1' });
    ok(shows('WORKED') === false, "…including when none of them match");

    // ---------- combinations ----------
    setF({ unit: 'U1', division: 'D1', product: 'P1' });
    ok(shows('BARE') === true, "every designation filter agreeing shows it");
    setF({ unit: 'U1', division: 'D1', product: 'P2' });
    ok(shows('BARE') === false, "…and one disagreeing is enough to hide it");
  } catch (e) {
    ok(false, 'initiative filter flow threw: ' + (e && e.message));
  }

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} initiative-filter assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1200);
