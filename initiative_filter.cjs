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
    // ---------- the TIMEFRAME is a separate path from the designation filters ----------
    // "drop emptied ancestors" discarded any initiative with no objective children once a window was set.
    // An objectiveless initiative was never a container: it has its own dates and IS the work, so it must
    // stand or fall on its own overlap with the window.
    const day = (iso) => w.eval('isoToDay("' + iso + '")');
    w.eval(`portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],milestones:[],
      kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[],
      initiatives:[
        {id:"BARE",name:"Bare",divisionId:"D",plannedStart:${day('2026-01-01')},plannedEnd:${day('2028-12-31')}},
        {id:"AWAY",name:"Away",divisionId:"D",plannedStart:${day('2030-01-01')},plannedEnd:${day('2030-12-31')}},
        {id:"WITHOBJ",name:"Has work",divisionId:"D",plannedStart:${day('2026-01-01')},plannedEnd:${day('2028-12-31')}}
      ],
      objectives:[{id:"O1",statement:"O",divisionId:"D",initiativeId:"WITHOBJ",quarter:"2026Q2",
                   plannedStart:${day('2026-04-01')},plannedEnd:${day('2026-06-30')}}]};
      pfFilters.unit="";pfFilters.division="";pfFilters.product="";pfFilters.quarter="";pfFilters.status="";`);

    const rows = (id) => w.document.querySelectorAll('[data-lineage*="' + id + '"]').length;
    const setWin = (qs) => w.eval(`ganttQtrZoom=true; ganttQuarters=${JSON.stringify(qs)}; renderGantt();`);

    w.eval('ganttQtrZoom=false; ganttQuarters=[]; renderGantt();');
    ok(rows('BARE') > 0, "with no timeframe an objectiveless initiative shows");

    setWin(['2026Q2']);
    ok(rows('BARE') > 0, "…and STILL shows when a timeframe it runs through is set");
    ok(rows('AWAY') === 0, "…while one whose dates fall outside that window does not");

    setWin(['2030Q1']);
    ok(rows('AWAY') > 0, "…and it appears once the window reaches ITS dates");
    ok(rows('BARE') === 0, "…with the other one dropping out, so each shows over its own timeframe");

    // the constraint: nothing about initiatives WITH objectives may change
    setWin(['2026Q2']);
    ok(rows('WITHOBJ') > 0, "an initiative WITH objectives shows when one of them is in the window");
    /* This is the constraint, and it needs a window where the initiative's OWN dates overlap but none of
       its objectives do. Without that, dropping the has-no-objectives guard would change nothing here and
       the test would pass while the behaviour regressed. WITHOBJ runs 2026-2028; its only objective sits
       in 2026Q2; so 2027Q1 is inside its span and outside its work. */
    setWin(['2027Q1']);
    ok(rows('WITHOBJ') === 0,
      "…and is still dropped when none of its objectives are in the window, even though its OWN dates span it");
    ok(rows('BARE') > 0, "…while the standalone one, whose dates span it, DOES show — judged on its own bar");

  } catch (e) {
    ok(false, 'timeframe flow threw: ' + (e && e.message));
  }

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} initiative-filter assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1200);
