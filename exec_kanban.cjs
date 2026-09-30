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

    /* Creating a record is not the same as rendering it. The first port stored the board correctly and
       then threw on render — kanbanCfgOpen and _kbDrag sit BETWEEN the render functions in the sales
       app, so extracting functions by name skipped them. The throw took the whole section with it, and
       because the board was already stored it threw again on every reload. Assert the TABLE. */
    ok(host().querySelectorAll('.kb-colh').length > 0,
      "…and its column headers actually render (" + host().querySelectorAll('.kb-colh').length + ")");
    ok(host().querySelectorAll('.kb-lanename').length > 0, "…with at least one tile row");
    ok(host().innerHTML.length > 900, "…so the section has real content, not an empty shell");

    // the failure only showed on a SECOND render, once a board existed in the doc
    const lenBefore = host().innerHTML.length;
    w.eval('renderAll();');
    ok(host().querySelectorAll('.kb-colh').length > 0,
      "the board survives a re-render — the case a refresh hits");
    ok(host().innerHTML.length === lenBefore, "…rendering identically, not degrading");
    ok(gateEff() === before, "…and creating one still does not move the score");
    ok(w.eval('exec.stageGates.length') === 1, "…nor touch the gates");

    /* Drag-and-drop uses its own module variable. Without exercising a drag, an undeclared _kbDrag is
       invisible — the board renders fine and only moving a tile throws. */
    /* A fresh board has lanes and columns but no tiles, so one has to exist before a drag is possible. */
    w.eval(`(function(){ var b=exec.boards[0];
      b.tiles=(b.tiles||[]).concat([{id:"T1",name:"Tile one",
        lane:(b.swimlanes&&b.swimlanes[0]?b.swimlanes[0].id:null),
        col:(b.columns&&b.columns[0]?b.columns[0].id:null), enteredCol:null}]);
      renderAll(); })();`);
    const tile = host().querySelector('[data-kbtile]');
    ok(!!tile, "a tile is draggable");
    if (tile) {
      const dt = { effectAllowed: '', setData() {}, getData() { return ''; } };
      tile.dispatchEvent(Object.assign(new w.Event('dragstart', { bubbles: true }), { dataTransfer: dt }));
      ok(tile.classList.contains('dragging'), "…dragstart marks it, so the drag state was set without throwing");
      tile.dispatchEvent(Object.assign(new w.Event('dragend', { bubbles: true }), { dataTransfer: dt }));
      ok(!tile.classList.contains('dragging'), "…and dragend clears it");
    }

    /* ---- styling parity with the sales app ----
       The Kanban is a straight port, so its CSS must be too. The first port used a line-anchored pattern
       that only caught single-line rules starting with .kb — 32 of 58 rules were left behind, so column
       counts ran into their headers, the legend rendered as bare text instead of chips, and tile health
       had no colour. Compare the PARSED stylesheets rather than the source, so formatting cannot hide a
       missing rule. */
    const kbSelectors = (file) => {
      const doc = new JSDOM(fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/' + file, 'utf8'),
        { virtualConsole: new VirtualConsole() }).window.document;
      const rules = [...doc.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
      return new Set(rules.filter(r => r.selectorText && r.selectorText.includes('.kb')).map(r => r.selectorText));
    };
    const salesSel = kbSelectors('sales_app.html'), execSel = kbSelectors('execution_app.html');
    const absent = [...salesSel].filter(x => !execSel.has(x));
    ok(salesSel.size > 40, "the sales app defines the Kanban styling (" + salesSel.size + " selectors)");
    ok(absent.length === 0,
      "the execution app defines every one of them — no rule left behind (" + absent.slice(0, 3).join(', ') + ")");

    // the pieces that were visibly broken in the reported screenshots
    ok(!!host().querySelector('.kb-colcnt'), "a column header has its own count element, not text run together");
    ok(host().querySelectorAll('.kb-chip').length >= 4,
      "the legend renders as chips (" + host().querySelectorAll('.kb-chip').length + ")");
    ok(!!host().querySelector('.kb-summary'), "…inside a summary row");
    ok(!!host().querySelector('.kb-lanename'), "the swimlane name is its own element");

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
