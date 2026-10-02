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

setTimeout(async () => {
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
    /* options[0] is now the "backlog (not started)" choice, so the first real stage is options[1]. */
    /* Pick the LAST stage, so it is a real change whatever the tile started in. */
    colSel.value = colSel.options[colSel.options.length - 1].value;
    const wantCol = colSel.value;
    ok(wantCol !== '', "the stage select offers real columns after the backlog option");
    mb().querySelector('[data-kbte-save]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('exec.boards[0].tiles[0].col') === wantCol, "changing the stage moves the tile");
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
    ok(!!host().querySelector('.kb-blhead [data-kbaddtile]'), "a tile can be added straight to the backlog");

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

    /* ---- grouped by lane, with an unassigned group ----
       A parked tile may carry a lane (so its future rules are visible) or none. "Unassigned" is the
       ABSENCE of a lane, not a placeholder id: a placeholder would need removing later and would show up
       anywhere lanes are enumerated. */
    const bd2 = { columns: [{ id: 'c1' }],
      swimlanes: [{ id: 'L1', name: 'Standard', maxDaysPerCol: 14 }, { id: 'L2', name: 'Fast track', maxDaysPerCol: 7 }],
      tiles: [{ id: 'A', lane: 'L1', col: 'c1' }, { id: 'P1', lane: 'L1', col: null },
              { id: 'P2', lane: null, col: null }, { id: 'P3', col: null }] };
    const gs = RDeng.backlogByLane(bd2);
    ok(gs.length === 3, "every lane gets a group plus an unassigned one (" + gs.length + ")");
    ok(gs[gs.length - 1].unassigned === true, "…with unassigned LAST");
    ok(gs[0].tiles.map(t => t.id).join(',') === 'P1', "a parked tile sits under its lane");
    ok(gs[1].tiles.length === 0, "…and an empty lane still gets a group, because the group is the drop target");
    ok(gs[2].tiles.map(t => t.id).join(',') === 'P2,P3',
      "a tile with no lane, or none stored at all, lands in unassigned");
    ok(!gs.some(g => g.tiles.some(t => t.id === 'A')), "a started tile is in no backlog group");

    // in the app
    w.eval(`(function(){var b=exec.boards[0];
      if(!b.swimlanes.some(function(l){return l.id==="L2";})) b.swimlanes.push({id:"L2",name:"Fast track",maxDaysPerCol:7});
      b.tiles=[{id:"P1",name:"Parked",lane:b.swimlanes[0].id,col:null},{id:"P2",name:"No lane",lane:null,col:null}];
      renderAll();})();`);
    const blRows = [...host().querySelectorAll('.kb-blrow')];
    ok(blRows.length === 3, "the backlog renders a row per lane plus unassigned (" + blRows.length + ")");
    ok(blRows[blRows.length - 1].classList.contains('nolane'), "…unassigned last and marked as not a lane");
    const lims = [...host().querySelectorAll('.kb-bllanelim')].map(e => e.textContent);
    /* The limit is stated as FUTURE: nothing is ticking yet, so "max 14d/col" would read as a live rule. */
    ok(lims.some(t => /will use max 14d\/col/.test(t)), "a lane group names the rule it WILL use (" + lims[0] + ")");
    ok(lims.some(t => /lane chosen at start/.test(t)), "…and unassigned says the lane is still open");
    ok(host().querySelectorAll('.kb-tile.parked.nolane').length === 1, "a lane-less tile is drawn differently");

    // dragging between groups assigns and clears the lane
    const zones = [...host().querySelectorAll('[data-kbbacklogdrop]')];
    ok(zones.length === 3, "each group is a drop target");
    ok(zones[zones.length - 1].dataset.kbbacklogdrop === '',
      "…the unassigned one carrying no lane id, so dropping there stores nothing");
    const noLane = host().querySelector('.kb-tile.parked.nolane');
    noLane.dispatchEvent(Object.assign(new w.Event('dragstart', { bubbles: true }),
      { dataTransfer: { effectAllowed: '', setData() {}, getData() { return ''; } } }));
    zones[1].dispatchEvent(Object.assign(new w.Event('drop', { bubbles: true }), { dataTransfer: { getData() { return ''; } } }));
    ok(w.eval('exec.boards[0].tiles.find(t=>t.id==="P2").lane') === 'L2', "dropping into a lane group assigns that lane");
    ok(w.eval('exec.boards[0].tiles.find(t=>t.id==="P2").col') === null, "…without starting it");

    const back = host().querySelector('[data-kbtile="P2"]');
    back.dispatchEvent(Object.assign(new w.Event('dragstart', { bubbles: true }),
      { dataTransfer: { effectAllowed: '', setData() {}, getData() { return ''; } } }));
    [...host().querySelectorAll('[data-kbbacklogdrop]')].slice(-1)[0]
      .dispatchEvent(Object.assign(new w.Event('drop', { bubbles: true }), { dataTransfer: { getData() { return ''; } } }));
    ok(w.eval('exec.boards[0].tiles.find(t=>t.id==="P2").lane') === null,
      "…and dropping into unassigned clears it rather than storing a placeholder lane");

    // a new backlog tile must not be forced into a lane — that is what unassigned exists to avoid
    ok(/lane:\(laneId==null\|\|laneId===""\)\?null:laneId/.test(html),
      "a tile added with no lane given starts with NO lane");

    /* ---- collapsible backlog ---- */
    ok(!!host().querySelector('[data-kbbltoggle]'), "the backlog has a collapse toggle");
    ok(w.eval('kbBacklogOpen') === true, "…open by default");
    const rowsOpen = host().querySelectorAll('.kb-blrow').length;
    host().querySelector('[data-kbbltoggle]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('kbBacklogOpen') === false, "clicking it collapses the backlog");
    ok(host().querySelectorAll('.kb-blrow').length === 0, "…hiding the groups");
    /* A backlog you cannot see is still work you have committed to: hiding the number would make it
       genuinely forgettable, which is the opposite of why the backlog exists. */
    ok(!!host().querySelector('.kb-blcnt'), "…but the COUNT stays visible while collapsed");
    ok(!!host().querySelector('[data-kbaddtile]'), "…and a tile can still be added");
    host().querySelector('[data-kbbltoggle]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(host().querySelectorAll('.kb-blrow').length === rowsOpen, "clicking again reopens it");
    ok(/localStorage\.setItem\("rd_kb_backlog"/.test(html), "the choice is remembered per person, not per board");

    /* ---- + tile opens the form, not a prompt ---- */
    host().querySelector('.kb-blhead [data-kbaddtile]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const addMb = () => d.getElementById('modalBody');
    ok(!!addMb() && !!addMb().querySelector('[data-kbte-name]'), "+ tile opens the tile form");
    ok(!!addMb().querySelector('[data-kbte-lane]') && !!addMb().querySelector('[data-kbte-col]'),
      "…offering lane and stage at creation, not just a name");
    ok(!addMb().querySelector('[data-kbte-del]'), "…with no Delete on a tile that does not exist yet");
    addMb().querySelector('[data-kbte-name]').value = 'Made in the form';
    addMb().querySelector('[data-kbte-save]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(w.eval('exec.boards[0].tiles.some(t=>t.name==="Made in the form")'), "saving creates the tile");
    ok(!/prompt\("Tile \(workstream driver\) name:"\)/.test(html), "no name-only prompt remains");

    /* ---- a + tile per swimlane ---- */
    const gridAdds = [...host().querySelectorAll('.kb-laneh [data-kbaddtile]')];
    const blAdds = [...host().querySelectorAll('.kb-bllane [data-kbaddtile]')];
    ok(gridAdds.length >= 1, "each grid swimlane has its own + tile (" + gridAdds.length + ")");
    ok(blAdds.length >= 1, "…and so does each backlog group (" + blAdds.length + ")");

    gridAdds[gridAdds.length - 1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const wantLane = gridAdds[gridAdds.length - 1].dataset.kblane;
    ok(addMb().querySelector('[data-kbte-lane]').value === wantLane,
      "a swimlane's button pre-fills THAT swimlane");
    /* A tile added from a grid row is being started, so it also gets that board's first stage. */
    ok(addMb().querySelector('[data-kbte-col]').value !== '', "…and the first stage, since it is being started");
    addMb().querySelector('[data-kbte-name]').value = 'Into that lane';
    addMb().querySelector('[data-kbte-save]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const made = JSON.parse(w.eval('JSON.stringify(exec.boards[0].tiles.find(t=>t.name==="Into that lane"))'));
    ok(made.lane === wantLane, "…and the tile lands in that swimlane");
    /* Without this the new tile sits at 0 days forever: there is no previous column for it to have
       "moved" from, so the re-stamp branch never fires. */
    ok(made.enteredCol != null, "…with its clock started, since it was created straight into a stage");

    blAdds[blAdds.length - 1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok(addMb().querySelector('[data-kbte-col]').value === '',
      "a BACKLOG group's button leaves the stage empty — a tile added there is not being started");
    addMb().querySelector('[data-kbte-cancel]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

    // the sales app has the same thing
    const salesBl = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/sales_app.html', 'utf8');
    /* The class alone proves nothing — it is in the stylesheet whether or not the band is mounted.
       Check that the band is actually PUT in the board's markup. */
    ok(/\$\{summary\}\$\{backlog\}/.test(salesBl), "the sales app mounts the backlog band into its board");
    ok(/const backlog=\(function\(\)\{/.test(salesBl), "…and builds it");
    ok(/data-kbbacklogdrop/.test(salesBl), "…as a drop target");
    ok(/t\.col=null; t\.enteredCol=null;/.test(salesBl), "…clearing both fields on park, exactly as the execution app does");
    ok(/kb-blhead/.test(salesBl) && /data-kbaddtile/.test(salesBl), "…and can add a tile straight to it");
    ok(/RD\.backlogByLane\(board\)/.test(salesBl), "…grouped by lane as well");
    ok(/class="kb-blrow\$\{g\.unassigned\?" nolane":""\}/.test(salesBl), "…with its own unassigned group");
    ok(/t\.lane=\(lane===""\|\|lane==null\)\?null:lane;/.test(salesBl),
      "…assigning or clearing the lane on drop, exactly as the execution app does");
    /* Matching the attribute only proves the button is in the markup. Boot the sales app and click it:
       a toggle that renders and does nothing passes a source check and fails a user. */
    const sdom = new JSDOM(salesBl, { runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
      url: 'https://x.test/?division=D&token=t', pretendToBeVisual: true,
      beforeParse(sw) {
        sw.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
        sw.requestAnimationFrame = cb => setTimeout(cb, 0); sw.cancelAnimationFrame = () => {};
        sw.fetch = () => Promise.reject(new Error('no net'));
        sw.cytoscape = function () { return { on(){}, ready(cb){ try{ cb && cb(); }catch(e){} }, fit(){}, resize(){},
          destroy(){}, getElementById(){ return { length: 0, select(){} }; }, zoom(){ return 1; }, width(){ return 800; },
          height(){ return 560; }, layout(){ return { run(){} }; }, elements(){ return { length: 0 }; },
          $(){ return { unselect(){} }; } }; };
      } });
    await new Promise(r => setTimeout(r, 1200));
    const sw = sdom.window, sd = sw.document;
    sw.eval(`persist=function(){};
      portfolio={units:[],divisions:[{id:"D",name:"D",kind:"sales"}],products:[],models:[],
        initiatives:[{id:"I",name:"I",divisionId:"D"}],
        objectives:[{id:"O1",statement:"O",divisionId:"D",initiativeId:"I",quarter:"2026Q2",plannedStart:2200,plannedEnd:2600}],
        kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
      divisionId="D"; selectedObj="O1"; setGateMode("O1","kanban");`);
    const sh = () => sd.getElementById('subSG');
    sh().querySelector('[data-kbaddboard]').dispatchEvent(new sw.MouseEvent('click', { bubbles: true }));
    const sTog = sh().querySelector('[data-kbbltoggle]');
    ok(!!sTog, "…collapsible there too");
    const sOpenRows = sh().querySelectorAll('.kb-blrow').length;
    ok(sOpenRows > 0, "…with its groups showing");
    sTog.dispatchEvent(new sw.MouseEvent('click', { bubbles: true }));
    ok(sh().querySelectorAll('.kb-blrow').length === 0, "…and the toggle actually collapses it");
    ok(!!sh().querySelector('.kb-blcnt'), "…keeping the count visible");
    sh().querySelector('[data-kbbltoggle]').dispatchEvent(new sw.MouseEvent('click', { bubbles: true }));
    ok(sh().querySelectorAll('.kb-blrow').length === sOpenRows, "…and reopens it");
    ok(sh().querySelectorAll('.kb-laneh [data-kbaddtile]').length >= 1, "…with a + tile on each grid swimlane");
    ok(sh().querySelectorAll('.kb-bllane [data-kbaddtile]').length >= 1, "…and on each backlog group");
    ok(/localStorage\.setItem\("rd_kb_backlog"/.test(salesBl), "…remembering the choice per person");
    ok(/function kbTileForm\(/.test(salesBl), "…using the same add/edit form");
    ok(/kbTileAdd\(b\.dataset\.kbaddtile, b\.dataset\.kblane, b\.dataset\.kbcol\)/.test(salesBl),
      "…with every + tile routed through it, lane and stage carried");
    ok(/if\(isNew && newCol && t\.enteredCol==null\) t\.enteredCol=todayIso\(\);/.test(salesBl),
      "…and a new tile created into a stage starting its clock");
    ok(!/prompt\("Tile \(workstream driver\) name:"\)/.test(salesBl), "…and no name-only prompt left");

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
    /* The stamp is set on a move INTO a stage and cleared on a move back to the backlog — both in one
       expression now, so match that rather than the older one-line form. */
    ok(/else if\(moved\) t\.enteredCol=newCol\?todayIso\(\):null;/.test(salesSrc),
      "…and re-stamps the stage clock only when the stage actually changed, clearing it on a park");

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
