// Phase G2 — the planning-app Gantt renders the sales-tracking additions. Drives the REAL built planning_app.html:
//   - a milestone KR shows a KR-M row with its DATED steps as status diamonds (done/overdue/pending)
//   - a Kanban board shows (collapsed by default) one gate SQUARE per column at the latest-due-across-tiles point,
//     labelled with the passed-count and coloured by the WORST tile status (red>orange>green>pending)
//   - expanding the board reveals per-tile workstream rows
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
const OUT = (process.env.RD_OUT || '/mnt/user-data/outputs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const D = iso => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(2020, 0, 1)) / 86400000);

function boot() {
  const HTML = fs.readFileSync(OUT + '/planning_app.html', 'utf8');
  return new Promise(res => {
    const dom = new JSDOM(HTML, {
      runScripts: "dangerously", virtualConsole: new VirtualConsole(), url: "https://x/?token=t", pretendToBeVisual: true,
      beforeParse(w) {
        w.matchMedia = () => ({ matches: false, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } });
        w.requestAnimationFrame = cb => setTimeout(cb, 0); w.fetch = () => Promise.reject(new Error('x'));
      }
    });
    setTimeout(() => res(dom.window), 500);
  });
}

// board on O1: gate c1 -> Acme passed on-time, Globex passed LATE (worst = orange), gate c2 -> both pending (future).
// milestone KR on O1: one done step, one overdue step, one UNDATED step (omitted).
function seed(w) {
  w.eval(`portfolio={divisions:[{id:'DIV-FC',name:'FC',kind:'rd',order:0}],units:[],products:[],models:[],initiatives:[{id:'I1',divisionId:'DIV-FC',name:'I',order:0}],milestones:[],milestoneEdges:[],objectives:[{id:'O1',divisionId:'DIV-FC',initiativeId:'I1',statement:'Obj',plannedStart:${D('2026-01-01')},plannedEnd:${D('2026-12-01')},quarter:''}],objectiveEdges:[],kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};`);
  w.eval(`execDocs={'EXEC-DIV-FC':{keyResults:[{id:'KR1',objectiveId:'O1',statement:'Land logos',trackingType:'milestone',creditMode:'binary',steps:[
      {id:'s1',name:'List',due:'2026-02-01',completion:100},
      {id:'s2',name:'Signed',due:'2026-03-01',completion:0},
      {id:'s3',name:'Undated',due:'',completion:0}]}],
    kpis:[],stageGates:[],boards:[{id:'B1',objectiveId:'O1',name:'Pipe',
      columns:[{id:'c1',name:'A',gate_id:'B1/c1'},{id:'c2',name:'B',gate_id:'B1/c2'}],
      swimlanes:[{id:'L',name:'S',maxDaysPerCol:30,deadline:''}],
      tiles:[{id:'t1',name:'Acme',lane:'L',col:'c2',startDate:'2026-08-01',gatePassed:{c1:'2026-08-15'}},
             {id:'t2',name:'Globex',lane:'L',col:'c2',startDate:'2026-08-01',gatePassed:{c1:'2026-09-15'}}]}]}};`);
  w.eval('renderGantt();');
}

const clsOf = e => [...e.classList].filter(c => ['passed', 'passed-late', 'overdue', 'pending', 'done'].includes(c))[0];

(async () => {
  const w = await boot(); seed(w); const d = w.document;
  const names = () => [...d.querySelectorAll('.gname')].map(e => e.textContent.trim());

  // ---- milestone-KR row + step diamonds ----
  ok(names().some(n => /Land logos/.test(n)), 'the milestone KR shows a KR-M row on the Gantt');
  const krRow = [...d.querySelectorAll('.gname')].find(e => /Land logos/.test(e.textContent));
  ok(krRow && /\(KR\)/.test(krRow.textContent) && !!krRow.querySelector('.gkrtag'), 'the milestone-KR (parent) row is prefixed with a (KR) tag');
  ok(krRow && krRow.querySelector('.gkrtag').textContent === '(KR)', 'the parent tag reads exactly (KR)');
  ok(names().some(n => /List/.test(n)) && names().some(n => /Signed/.test(n)), 'its dated steps render as rows');
  // the STEP rows underneath are prefixed with the parent milestone-KR number: (KR-M{n}) {step name}
  const stepRow = [...d.querySelectorAll('.gname')].find(e => /Signed/.test(e.textContent));
  const stepTag = stepRow && stepRow.querySelector('.gkrtag');
  ok(!!stepTag && /\(KR-M\d+\)/.test(stepTag.textContent), 'a milestone STEP row is prefixed with a (KR-M{n}) tag');
  ok(!!stepTag && stepTag.textContent === '(KR-M1)', 'the step tag reads (KR-M1) — the parent milestone-KR number');
  ok(stepRow && /Signed/.test(stepRow.textContent), 'the step row still shows the step name after the tag');
  ok(!names().some(n => /Undated/.test(n)), 'an UNDATED step is omitted from the Gantt');
  const stepDots = [...d.querySelectorAll('.gdia')].filter(e => !e.classList.contains('gsq'));
  const stepCls = stepDots.map(clsOf).filter(Boolean);
  ok(stepCls.includes('done'), 'a 100% step renders a done (green) diamond');
  ok(stepCls.includes('overdue'), 'an incomplete step past its due renders an overdue (red) diamond');

  // ---- Kanban board: collapsed by default, gate squares with count + worst colour ----
  ok(names().includes('Pipe'), 'the board shows a row');
  ok(!names().includes('Acme') && !names().includes('Globex'), 'the board is collapsed by default (tiles hidden)');
  const squares = [...d.querySelectorAll('.gdia.gsq')];
  ok(squares.length === 2, 'a collapsed board draws one gate square per column (2)');
  const counts = squares.map(s => s.querySelector('.gsqn') ? s.querySelector('.gsqn').textContent : null);
  ok(counts[0] === '2', 'gate c1 square shows the passed count (2 of 2 tiles cleared it)');
  ok(counts[1] === '0', 'gate c2 square shows 0 passed (no tile cleared it yet)');
  ok(clsOf(squares[0]) === 'passed-late', 'gate c1 is orange (passed-late): one tile crossed late, worst status wins');
  ok(clsOf(squares[1]) === 'pending', 'gate c2 is pending: both tiles yet to reach it, none overdue');

  // ---- expanding the board reveals per-tile workstream rows ----
  w.eval("ganttCollapsed.delete('board:B1'); renderGantt();");
  ok(names().includes('Acme') && names().includes('Globex'), 'expanding the board reveals the per-tile workstream rows');
  // each tile row draws its own gate squares coloured by that tile's state (Acme c1 on-time -> passed)
  const tileSquares = [...d.querySelectorAll('.gdia.gsq')];
  ok(tileSquares.some(s => clsOf(s) === 'passed'), 'an expanded tile shows a passed (green) square for a gate it cleared on time');

  // ---- all-on-time flips c1 to green ----
  w.eval("ganttCollapsed.add('board:B1'); execDocs['EXEC-DIV-FC'].boards[0].tiles[1].gatePassed.c1='2026-08-20'; renderGantt();");
  const sq0 = [...d.querySelectorAll('.gdia.gsq')][0];
  ok(clsOf(sq0) === 'passed', 'when every tile cleared gate c1 on time, the collapsed square is green (passed)');

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fl = out.filter(x => x.startsWith('FAIL'));
  console.log(fl.length ? `\n${fl.length}/${out.length} FAILED` : `\nPASS - ${out.length} gantt-sales-tracking (G2) assertions green`);
  process.exit(fl.length ? 1 : 0);
})();
