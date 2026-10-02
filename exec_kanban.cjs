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

    /* ---- editing a tile ----
       A tile carries more than a name: its swimlane and its column both change what the board computes,
       so the editor has to offer them. */
    const tileEl = host().querySelector('[data-kbtile]');
    ok(!!tileEl, "a tile is on the board");
    const editBtn = host().querySelector('[data-kbtiledit]');
    ok(!!editBtn, "…carrying an edit button");
    /* The button sits inside a draggable tile. Without draggable="false" a press on it starts a drag and
       the click never lands — the button would look present and do nothing. */
    ok(editBtn.getAttribute('draggable') === 'false', "…which does not start a tile drag when pressed");
    ok(!!editBtn.getAttribute('aria-label'), "…and names itself for a screen reader");

    editBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const mb = () => d.getElementById('modalBody');
    ok(!!mb(), "clicking it opens the editor");
    ok(!!mb().querySelector('[data-kbte-name]'), "…offering the name");
    ok(!!mb().querySelector('[data-kbte-lane]'), "…the swimlane");
    ok(!!mb().querySelector('[data-kbte-col]'), "…the stage");
    ok(!!mb().querySelector('[data-kbte-start]') && !!mb().querySelector('[data-kbte-entered]'),
      "…and both dates the health calculation reads");

    const stampBefore = w.eval('exec.boards[0].tiles[0].enteredCol');
    mb().querySelector('[data-kbte-name]').value = 'Acme Corp';
    mb().querySelector('[data-kbte-save]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('exec.boards[0].tiles[0].name') === 'Acme Corp', "saving renames the tile");
    /* Leaving the stage alone must NOT re-stamp the clock, or every edit silently resets the age that
       drives the at-risk and breached colours. */
    ok(w.eval('exec.boards[0].tiles[0].enteredCol') === stampBefore,
      "…and an edit that does not change stage leaves the days-in-stage clock alone");

    host().querySelector('[data-kbtiledit]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const colSel = mb().querySelector('[data-kbte-col]');
    colSel.value = colSel.options[1].value;
    mb().querySelector('[data-kbte-save]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('exec.boards[0].tiles[0].col') === w.eval('exec.boards[0].columns[1].id'), "changing the stage moves the tile");
    ok(w.eval('exec.boards[0].tiles[0].enteredCol') !== stampBefore,
      "…and DOES restart the clock, the same as dragging it there");

    host().querySelector('[data-kbtiledit]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    mb().querySelector('[data-kbte-del]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('(exec.boards[0].tiles||[]).length') === 0, "a tile can be deleted from its editor");

    /* ---- the backlog ----
       A parked tile has no column, so no stage clock applies to it. That IS the definition — there is no
       "exempt from the clock" flag, which would allow a tile to be both in a column and not timed. */
    const RDeng = require((process.env.RD_SRC || '/home/claude/work') + '/rdcore.js');
    const bd = { columns: [{ id: 'c1' }, { id: 'c2' }], swimlanes: [{ id: 'L', maxDaysPerCol: 14 }],
      tiles: [{ id: 'A', lane: 'L', col: 'c1', enteredCol: '2026-09-28' },
              { id: 'B', lane: 'L', col: null }, { id: 'C', lane: 'L' }] };
    ok(RDeng.tileInBacklog({ col: null }) && RDeng.tileInBacklog({}), "a tile with no column is in the backlog");
    ok(!RDeng.tileInBacklog({ col: 'c1' }), "…and one in a column is not");
    ok(RDeng.backlogTiles(bd).map(t => t.id).join(',') === 'B,C', "the backlog is every parked tile");
    ok(RDeng.activeTiles(bd).map(t => t.id).join(',') === 'A', "…and the rest are active");

    const sumBl = RDeng.boardSummary(bd, '2026-10-01');
    ok(sumBl.backlog === 2, "the summary counts them separately (" + sumBl.backlog + ")");
    /* Without the exclusion a parked tile falls through to tileHealth, which reads a deadline it does not
       have, and reports on-track — a board could read "5 on track" with nothing started. */
    ok(sumBl.onTrack === 1, "…and does NOT count them as on track (" + sumBl.onTrack + ")");
    ok(sumBl.total === 3, "…while the total still counts every tile");

    // in the app
    w.eval(`(function(){var b=exec.boards[0];
      b.tiles=[{id:"A",name:"Acme",lane:b.swimlanes[0].id,col:b.columns[0].id,enteredCol:"2026-09-25"},
               {id:"P",name:"Parked",lane:b.swimlanes[0].id,col:null,enteredCol:null}];
      renderAll();})();`);
    ok(host().querySelectorAll('.kb-backlog').length === 1, "the board shows a backlog band");
    ok(host().querySelectorAll('.kb-tile.parked').length === 1, "…holding the parked tile");
    ok(host().querySelectorAll('.kb-cell .kb-tile').length === 1, "…and not the live one, which stays in the grid");
    const parkedMeta = host().querySelector('.kb-tile.parked .kb-tdays').textContent;
    ok(/\u2014/.test(parkedMeta), "a parked tile shows no day count (" + parkedMeta + ")");
    ok(/awaiting start/.test(host().querySelector('.kb-tile.parked').textContent), "…saying it is awaiting start");
    ok([...host().querySelectorAll('.kb-chip')].some(c => /backlog/.test(c.textContent)),
      "the summary carries a backlog chip");
    ok(!!host().querySelector('[data-kbaddbacklog]'), "a tile can be added straight to the backlog");

    // parking a live tile clears BOTH fields
    const zone = host().querySelector('[data-kbbacklogdrop]');
    ok(!!zone, "the backlog is a drop target");
    const liveTile = host().querySelector('.kb-cell .kb-tile');
    liveTile.dispatchEvent(Object.assign(new w.Event('dragstart', { bubbles: true }),
      { dataTransfer: { effectAllowed: '', setData() {}, getData() { return ''; } } }));
    zone.dispatchEvent(Object.assign(new w.Event('drop', { bubbles: true }),
      { dataTransfer: { getData() { return ''; } } }));
    ok(w.eval('exec.boards[0].tiles.find(t=>t.id==="A").col') === null, "dropping a tile there parks it");
    /* Cleared, not paused: a tile parked for two months must not come back already breached. */
    ok(w.eval('exec.boards[0].tiles.find(t=>t.id==="A").enteredCol') === null,
      "…clearing its time in stage, so it restarts when someone starts it again");

    // the sales app has the same thing
    const salesBl = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/sales_app.html', 'utf8');
    /* The class alone proves nothing — it is in the stylesheet whether or not the band is mounted.
       Check that the band is actually PUT in the board's markup. */
    ok(/\$\{summary\}\$\{backlog\}/.test(salesBl), "the sales app mounts the backlog band into its board");
    ok(/const backlog=\(function\(\)\{/.test(salesBl), "…and builds it");
    ok(/data-kbbacklogdrop/.test(salesBl), "…as a drop target");
    ok(/t\.col=null; t\.enteredCol=null;/.test(salesBl), "…clearing both fields on park, exactly as the execution app does");
    ok(/data-kbaddbacklog/.test(salesBl), "…and can add a tile straight to it");

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

  /* ---- the sales app carries the same editor ----
     The two apps have diverged a long way and every port between them this session has lost something:
     a shadowed function, module state, 32 CSS rules. Compare the built files directly rather than
     trusting that the port was complete. */
  try {
    const salesSrc = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/sales_app.html', 'utf8');
    const execSrc = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8');

    ok(/<button class="kb-tedit" draggable="false" data-kbtiledit=/.test(salesSrc),
      "the sales app's tiles carry the edit button too");
    ok(/function kbTileEdit\(/.test(salesSrc), "…and the editor behind it");
    ok(/data-kbtiledit\]"\)\.forEach/.test(salesSrc), "…wired to a click");
    ok(/closest\("\[data-kbtiledit\]"\)/.test(salesSrc), "…with the drag guard, so the click is not swallowed");

    // the behaviour that is easy to get subtly wrong on a copy
    ok(/else if\(moved\) t\.enteredCol=todayIso\(\);/.test(salesSrc),
      "…and re-stamps the stage clock only when the stage actually changed");

    // the editor function itself must be the SAME code in both, comments aside
    const body = (src) => {
      const i = src.indexOf('function kbTileEdit(');
      if (i < 0) return null;
      const j = src.indexOf('\nfunction ', i + 10);
      return src.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').split(/\s+/).join(' ');
    };
    ok(body(salesSrc) !== null && body(salesSrc) === body(execSrc),
      "the two apps run the SAME editor code — a copy that drifts is how they diverge");

    // and the styling has to come across, not just the markup
    const kbteSelectors = (src) => {
      const doc = new JSDOM(src, { virtualConsole: new VirtualConsole() }).window.document;
      const rules = [...doc.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
      return new Set(rules.filter(r => r.selectorText && /kb-tedit|kbte-foot/.test(r.selectorText)).map(r => r.selectorText));
    };
    const sSel = kbteSelectors(salesSrc), eSel = kbteSelectors(execSrc);
    ok(eSel.size >= 4, "the execution app styles the edit button (" + eSel.size + " rules)");
    ok([...eSel].every(x => sSel.has(x)),
      "…and the sales app has every one of those rules, so the button is not invisible there");
  } catch (e) {
    ok(false, 'sales parity check threw: ' + (e && e.message));
  }

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} exec-kanban assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1400);
