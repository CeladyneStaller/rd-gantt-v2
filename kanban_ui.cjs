// Phase K2 — the Kanban UI in the Sales app. Drives the REAL built sales_app.html:
//   - per-objective classic|kanban gate mode, persisted in the exec doc
//   - board tabs; adding a board mints stable gate_ids on every column
//   - the grid renders columns x swimlanes with tiles; health colours come from RD.tileHealth
//   - a simulated drop delegates to RD.dropTile and commits the new board (advancing resets enteredCol)
//   - RD.boardSummary is surfaced
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
const OUT = (process.env.RD_OUT || '/mnt/user-data/outputs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

function boot(url) {
  const HTML = fs.readFileSync(OUT + '/sales_app.html', 'utf8');
  return new Promise(res => {
    const dom = new JSDOM(HTML, {
      runScripts: "dangerously", virtualConsole: new VirtualConsole(), url, pretendToBeVisual: true,
      beforeParse(w) {
        w.matchMedia = () => ({ matches: false, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } });
        w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => { };
        w.fetch = () => Promise.reject(new Error('no net'));
      }
    });
    setTimeout(() => res(dom.window), 500);
  });
}

function seed(w) {
  w.eval(`
    portfolio={ units:[], divisions:[{id:'DIV-FC',name:'FC',kind:'rd'}],
      objectives:[{id:'O1',divisionId:'DIV-FC',statement:'Pipeline'}], initiatives:[] };
    divisionId='DIV-FC'; selectedObj='O1';
    exec={ objectiveState:[], keyResults:[], kpis:[], stageGates:[], tasks:[], boards:[], gateMode:{},
           kpiUpdates:[], stageGateSets:[], stageGateEdges:[] };
    renderAll=function(){ renderGates(); }; setMsg=function(){};
  `);
}

(async () => {
  const w = await boot("https://x.test/?division=DIV-FC&token=t");
  seed(w); const d = w.document;

  // ---- gate mode toggle + persistence ----
  ok(w.eval("gateModeOf('O1')") === 'classic', 'an objective defaults to classic gate mode');
  w.eval("setGateMode('O1','kanban');");
  ok(w.eval("gateModeOf('O1')") === 'kanban', 'switching to kanban persists on exec.gateMode');
  ok(w.eval("exec.gateMode.O1") === 'kanban', '...stored in the exec doc (persists to the BIZ- bin)');

  // ---- add a board: mints gate_ids ----
  w.eval("addBoard();");
  ok(w.eval("(exec.boards||[]).length") === 1, 'adding a board stores it in exec.boards');
  ok(w.eval("exec.boards[0].objectiveId") === 'O1', 'the board is scoped to the objective');
  ok(w.eval("exec.boards[0].columns.every(c=>!!c.gate_id)"), 'every column gets a minted gate_id');
  ok(w.eval("exec.boards[0].columns[0].gate_id") === w.eval("exec.boards[0].id + '/' + exec.boards[0].columns[0].id"),
    'the gate_id is the stable <boardId>/<columnId> identity');

  // ---- render the grid ----
  w.eval("renderGates();");
  ok(d.querySelectorAll('.kb-colh').length === 3, 'the grid renders the 3 seeded columns');
  ok(d.querySelectorAll('.kb-laneh').length === 1, 'the grid renders the seeded swimlane');
  ok(d.querySelectorAll('.kb-tab').length === 1, 'one board -> one tab');

  // ---- add tiles with known health, via the model, then re-render ----
  // put a tile deep in a column past its budget (breached) and a fresh one (on-track)
  const b0 = w.eval("exec.boards[0].id");
  w.eval(`(function(){
    var b=exec.boards[0]; var lane=b.swimlanes[0]; lane.maxDaysPerCol=10;
    var c1=b.columns[0].id, c2=b.columns[1].id;
    var today=todayIso();
    function shift(days){ var t=Date.parse(today+'T00:00:00Z'); return new Date(t+days*86400000).toISOString().slice(0,10); }
    b.tiles=[ {id:'tA',name:'Acme',lane:lane.id,col:c1,startDate:shift(-20),enteredCol:shift(-15)},   // 15d in a 10d col -> breached
              {id:'tB',name:'Globex',lane:lane.id,col:c1,startDate:shift(-3),enteredCol:shift(-3)} ]; // fresh -> on-track
    renderGates();
  })();`);
  ok(d.querySelectorAll('.kb-tile').length === 2, 'both tiles render');
  ok(!!d.querySelector('.kb-tile.breached'), 'a tile past its column budget is coloured breached (RD.tileHealth)');
  ok(!!d.querySelector('.kb-tile.on-track'), 'a fresh tile is coloured on-track');

  // ---- boardSummary is surfaced ----
  const chips = [...d.querySelectorAll('.kb-chip')].map(c => c.textContent.trim());
  ok(chips.some(c => /1 breached/.test(c)) && chips.some(c => /1 on track/.test(c)), 'the board summary chips reflect boardSummary (1 breached, 1 on track)');

  // ---- simulated drop: advance Acme to column 2 -> dropTile -> commit + enteredCol reset ----
  const c2id = w.eval("exec.boards[0].columns[1].id");
  const before = w.eval("exec.boards[0].tiles.find(t=>t.id==='tA').enteredCol");
  // call the same path the drop handler uses
  w.eval(`(function(){
    var board=boardById(activeBoardId());
    var nb=RD.dropTile(board,'tA','${c2id}',board.swimlanes[0].id, todayIso());
    var idx=exec.boards.findIndex(b=>b.id===board.id); if(idx>=0) exec.boards[idx]=nb;
    renderGates();
  })();`);
  ok(w.eval("exec.boards[0].tiles.find(t=>t.id==='tA').col") === c2id, 'dropping a tile advances its column (committed to exec.boards)');
  ok(w.eval("exec.boards[0].tiles.find(t=>t.id==='tA').enteredCol") === w.eval("todayIso()"),
    'advancing a column reset enteredCol to today (via RD.dropTile)');
  ok(w.eval("exec.boards[0].tiles.find(t=>t.id==='tA').enteredCol") !== before, '...and it actually changed');

  // ---- classic mode still works (renders the stage-gate panel, not the board) ----
  w.eval("setGateMode('O1','classic'); renderGates();");
  ok(d.querySelectorAll('.kb-table').length === 0, 'switching back to classic hides the board');
  ok(!!d.querySelector('#subSG .panel'), 'classic mode renders the stage-gate panel');

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fl = out.filter(x => x.startsWith('FAIL'));
  console.log(fl.length ? `\n${fl.length}/${out.length} FAILED` : `\nPASS - ${out.length} kanban-UI (K2) assertions green`);
  process.exit(fl.length ? 1 : 0);
})();
