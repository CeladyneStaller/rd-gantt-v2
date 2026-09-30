// Kanban view in the execution app.
//
// A board is an alternative VIEW of an objective's execution, not a second set of gates: the same
// toggle the sales app uses switches between them, and switching stores nothing beyond the mode. The
// stage gates stay exactly as they were.
//
// The rule that matters here: in the execution app the Kanban is for managing work only. ONLY stage
// gates feed the score — a board must never move a gate forecast or an objective's readiness.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const html = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
  url: 'https://x.test/?division=D&token=t', pretendToBeVisual: true,
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {};
    w.fetch = () => Promise.reject(new Error('no net'));
    w.cytoscape = function () { return { on() {}, ready(cb) { try { cb && cb(); } catch (e) {} }, fit() {}, resize() {},
      destroy() {}, getElementById() { return { length: 0, select() {} }; }, zoom() { return 1; }, width() { return 800; },
      height() { return 560; }, layout() { return { run() {} }; }, elements() { return { length: 0 }; },
      $() { return { unselect() {} }; } }; };
  }
});

setTimeout(() => {
  const w = dom.window, d = w.document;
  try {
    w.eval(`persist=function(){};
      portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],
        initiatives:[{id:"I",name:"I",divisionId:"D"}],
        objectives:[{id:"O1",statement:"Obj",divisionId:"D",initiativeId:"I",quarter:"2026Q2",
                     plannedStart:2200,plannedEnd:2600}],
        kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
      exec.stageGateSets=[{id:"S1",objectiveId:"O1",name:"Main",order:0}];
      exec.stageGates=[{id:"G1",objectiveId:"O1",setId:"S1",name:"Gate one",plannedDate:2400,actualDate:null}];
      divisionId="D"; selectedObj="O1"; renderAll();`);

    const host = () => d.getElementById('subSG');
    const seg = (mode) => [...host().querySelectorAll('[data-gatemode]')].find(b => b.dataset.gatemode === mode);
    const gateEff = () => w.eval('String(RD.cascade(portfolio, emForCore(), todayDay()).gateEffective["G1"])');

    // ---------- the doc carries boards ----------
    ok(/boards:\[\]/.test(html), "the execution doc shape includes boards");
    ok(/gateMode:\{\}/.test(html), "…and the per-objective view mode");

    // ---------- the toggle, in both views ----------
    ok(w.eval('gateModeOf("O1")') === 'classic', "an objective starts in the stage-gate view");
    ok(host().querySelectorAll('[data-gatemode]').length === 2, "the Gates / Kanban toggle renders there");
    ok(/Gate one/.test(host().textContent), "…showing the stage gates");

    const before = gateEff();
    seg('kanban').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('gateModeOf("O1")') === 'kanban', "clicking Kanban switches the view");
    ok(host().querySelectorAll('[data-gatemode]').length === 2,
      "…and the toggle is still there, so the switch is not one-way");
    ok(host().querySelectorAll('[data-kbaddboard]').length > 0, "…offering to add a board");
    ok(!/Gate one/.test(host().textContent), "…with the gate list replaced rather than stacked beneath");

    // ---------- the score is untouched ----------
    /* The whole point of the instruction: a board manages work, it does not measure it. */
    ok(gateEff() === before, "switching view does not move the gate forecast (" + before + ")");
    ok(w.eval('exec.stageGates.length') === 1, "…and the stage gates are still stored");

    host().querySelector('[data-kbaddboard]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('(exec.boards||[]).length') === 1, "a board can be created");
    ok(gateEff() === before, "…and creating one still does not move the score");
    ok(w.eval('exec.stageGates.length') === 1, "…nor touch the gates");

    // a board's own columns must not appear as gates anywhere
    ok(w.eval('exec.stageGates.filter(function(g){return g.objectiveId==="O1";}).length') === 1,
      "a board's columns do not become stage gates");

    // ---------- switching back ----------
    seg('classic').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('gateModeOf("O1")') === 'classic', "the toggle switches back");
    ok(/Gate one/.test(host().textContent), "…and the stage gates return unchanged");
    ok(w.eval('(exec.boards||[]).length') === 1, "…with the board kept, not discarded");
    ok(gateEff() === before, "…and the score still where it started");

    // ---------- the mode is per objective ----------
    w.eval(`portfolio.objectives.push({id:"O2",statement:"Other",divisionId:"D",initiativeId:"I",
      quarter:"2026Q2",plannedStart:2200,plannedEnd:2600});
      exec.gateMode={O1:"kanban"}; selectedObj="O2"; renderAll();`);
    ok(w.eval('gateModeOf("O2")') === 'classic',
      "one objective on Kanban does not put another there — the mode is per objective");
  } catch (e) {
    ok(false, 'kanban view flow threw: ' + (e && e.message));
  }

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} exec-kanban assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1400);
