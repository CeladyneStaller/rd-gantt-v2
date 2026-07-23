// Phase K1 — the Kanban engine (pure rdcore).
//   tileHealth   : days-in-column (vs maxDaysPerCol) + deadline proximity -> on-track|at-risk|breached
//   boardSummary : per-column counts + {onTrack,atRisk,breached,closed,total} (a tile in the last column = closed)
//   dropTile     : pure move; advancing a column resets enteredCol; changing lane re-parents; returns a NEW board
//   gateDueDates : forward from start (no deadline) or backward from deadline; + feasibility flag
const C = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

// date helpers for building fixtures + computing EXPECTED dates the same way the engine does
const DAY = 86400000;
const iso = d => new Date(d).toISOString().slice(0, 10);
const isoDay = s => Math.round(Date.parse(s + 'T00:00:00Z') / DAY);
const dayIso = n => new Date(n * DAY).toISOString().slice(0, 10);
const shift = (isoStr, days) => dayIso(isoDay(isoStr) + days);

const TODAY = '2026-03-01';

// ---------- tileHealth ----------
(function () {
  const lane = { maxDaysPerCol: 21, deadline: '' };
  // fresh: entered 5 days ago, 21-day budget -> on-track (5 < ceil(21*.8)=17)
  ok(C.tileHealth({ enteredCol: shift(TODAY, -5) }, lane, TODAY).status === 'on-track', 'fresh tile is on-track');
  // near the limit: 18 days in a 21-day column -> at-risk (18 >= 17)
  ok(C.tileHealth({ enteredCol: shift(TODAY, -18) }, lane, TODAY).status === 'at-risk', '18d in a 21d column is at-risk');
  // over the limit: 26 days -> breached
  const h = C.tileHealth({ enteredCol: shift(TODAY, -26) }, lane, TODAY);
  ok(h.status === 'breached', '26d in a 21d column is breached');
  ok(h.daysInCol === 26, '...and reports 26 days in column');
  // deadline proximity trumps a fresh column: deadline in 5 days -> at-risk
  ok(C.tileHealth({ enteredCol: shift(TODAY, -2) }, { maxDaysPerCol: 21, deadline: shift(TODAY, 5) }, TODAY).status === 'at-risk',
    'a near deadline (5d) makes an otherwise-fresh tile at-risk');
  // past deadline -> breached
  ok(C.tileHealth({ enteredCol: shift(TODAY, -2) }, { maxDaysPerCol: 21, deadline: shift(TODAY, -3) }, TODAY).status === 'breached',
    'past the deadline is breached');
  // no rules -> on-track
  ok(C.tileHealth({ enteredCol: shift(TODAY, -100) }, { maxDaysPerCol: 0, deadline: '' }, TODAY).status === 'on-track',
    'no column budget + no deadline -> on-track regardless of days');
})();

// ---------- boardSummary ----------
(function () {
  const board = {
    columns: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],   // c3 is the last/closed column
    swimlanes: [{ id: 'L', maxDaysPerCol: 10, deadline: '' }],
    tiles: [
      { id: 't1', lane: 'L', col: 'c1', enteredCol: shift(TODAY, -2) },   // on-track
      { id: 't2', lane: 'L', col: 'c1', enteredCol: shift(TODAY, -9) },   // at-risk (9 >= ceil(8))
      { id: 't3', lane: 'L', col: 'c2', enteredCol: shift(TODAY, -15) },  // breached (>10)
      { id: 't4', lane: 'L', col: 'c3', enteredCol: shift(TODAY, -30) },  // closed (last column)
    ],
  };
  const s = C.boardSummary(board, TODAY);
  ok(s.total === 4, 'summary total counts all tiles');
  ok(s.onTrack === 1, 'one tile on-track');
  ok(s.atRisk === 1, 'one tile at-risk');
  ok(s.breached === 1, 'one tile breached');
  ok(s.closed === 1, 'a tile in the last column is counted as closed, not health-bucketed');
  ok(s.onTrack + s.atRisk + s.breached + s.closed === s.total, 'the four buckets partition every tile');
  ok(s.perColumn.c1 === 2 && s.perColumn.c2 === 1 && s.perColumn.c3 === 1, 'per-column counts are right');
})();

// ---------- dropTile ----------
(function () {
  const board = {
    columns: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
    swimlanes: [{ id: 'L1' }, { id: 'L2' }],
    tiles: [{ id: 't1', lane: 'L1', col: 'c1', enteredCol: '2026-01-01' }],
  };
  // advance a column: col changes AND enteredCol resets to today
  const b1 = C.dropTile(board, 't1', 'c2', 'L1', TODAY);
  ok(b1.tiles[0].col === 'c2', 'dropTile advances the column');
  ok(b1.tiles[0].enteredCol === TODAY, 'advancing a column resets enteredCol to today');
  ok(board.tiles[0].col === 'c1', 'the original board is untouched (returns a new board)');
  // change swimlane only (same column): lane re-parents, enteredCol NOT reset
  const b2 = C.dropTile(board, 't1', 'c1', 'L2', TODAY);
  ok(b2.tiles[0].lane === 'L2', 'dropTile re-parents the swimlane');
  ok(b2.tiles[0].enteredCol === '2026-01-01', 'staying in the same column does NOT reset days-in-column');
  // move both column and lane
  const b3 = C.dropTile(board, 't1', 'c3', 'L2', TODAY);
  ok(b3.tiles[0].col === 'c3' && b3.tiles[0].lane === 'L2' && b3.tiles[0].enteredCol === TODAY, 'dropTile can move column + lane at once');
  // unknown tile -> board unchanged
  ok(JSON.stringify(C.dropTile(board, 'nope', 'c2', 'L2', TODAY)) === JSON.stringify(board), 'dropping an unknown tile leaves the board unchanged');
})();

// ---------- gateDueDates ----------
(function () {
  const cols = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }]; // N=5
  const S = '2026-01-01';

  // forward (no deadline): due[i] = start + (i+1)*M
  const fwd = C.gateDueDates(cols, { maxDaysPerCol: 10, deadline: '' }, { startDate: S });
  ok(fwd.due[0] === shift(S, 10), 'forward: first gate due at start + 10 days');
  ok(fwd.due[4] === shift(S, 50), 'forward: last gate due at start + 50 days (5*10)');
  ok(fwd.feasible === true, 'forward has no deadline, so it is always feasible');

  // backward (deadline set): due[last] = deadline; due[i] = deadline - (N-1-i)*M
  const D = '2026-06-01', M = 14;
  const back = C.gateDueDates(cols, { maxDaysPerCol: M, deadline: D }, { startDate: S });
  ok(back.due[4] === D, 'backward: the last gate is pinned to the deadline');
  ok(back.due[3] === shift(D, -M), 'backward: the second-to-last gate is deadline - 14 days');
  ok(back.due[0] === shift(D, -4 * M), 'backward: the first gate is deadline - (N-1)*M = deadline - 56 days');
  // feasible iff (D - S) >= N*M ; here D-S is ~151 days, N*M=70 -> feasible
  ok(back.feasible === true, 'backward is feasible when there is enough runway (151d >= 70d)');

  // infeasible: start too close to the deadline (D - S < N*M)
  const tight = C.gateDueDates(cols, { maxDaysPerCol: M, deadline: D }, { startDate: '2026-05-01' }); // ~31d < 70d
  ok(tight.feasible === false, 'backward is flagged infeasible when the deadline is too close (31d < 70d)');
  ok(tight.due[4] === D, '...but the dates still render (last gate still at the deadline)');
})();

// ---------- dropTile records gate-crossing stamps (for on-time/late) ----------
(function () {
  const board = {
    columns: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
    swimlanes: [{ id: 'L', maxDaysPerCol: 10, deadline: '' }],
    tiles: [{ id: 't1', lane: 'L', col: 'c1', startDate: '2026-01-01', enteredCol: '2026-01-01' }],
  };
  // advance c1 -> c2 : the tile clears gate c1, stamped today
  const b1 = C.dropTile(board, 't1', 'c2', 'L', '2026-02-01');
  ok(b1.tiles[0].gatePassed && b1.tiles[0].gatePassed.c1 === '2026-02-01', 'advancing stamps the cleared gate with today');
  ok(!b1.tiles[0].gatePassed.c2, 'the current column is not stamped as passed');
  // advance again c2 -> c3 : now c1 and c2 both stamped
  const b2 = C.dropTile(b1, 't1', 'c3', 'L', '2026-02-15');
  ok(b2.tiles[0].gatePassed.c1 === '2026-02-01' && b2.tiles[0].gatePassed.c2 === '2026-02-15', 'each advance stamps the newly-cleared gate; earlier stamps persist');
  // retreat c3 -> c2 : c2 is no longer cleared, its stamp is dropped; c1 remains
  const b3 = C.dropTile(b2, 't1', 'c2', 'L', '2026-03-01');
  ok(!b3.tiles[0].gatePassed.c2 && b3.tiles[0].gatePassed.c1 === '2026-02-01', 'retreating drops the stamp for a gate now ahead of the tile');
})();

// ---------- gateTileState ----------
(function () {
  const cols = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
  // gate due dates for this tile: forward, M=10, start Jan1 -> c1 due Jan11, c2 due Jan21, c3 due Jan31
  const base = { columns: cols, swimlanes: [{ id: 'L', maxDaysPerCol: 10, deadline: '' }] };
  // tile at c3 (passed c1,c2), crossed c1 on Jan10 (on time, due Jan11) and c2 on Jan25 (LATE, due Jan21)
  const tile = { id: 't', lane: 'L', col: 'c3', startDate: '2026-01-01', gatePassed: { c1: '2026-01-10', c2: '2026-01-25' } };
  const board = Object.assign({}, base, { tiles: [tile] });
  ok(C.gateTileState(board, tile, 0, '2026-02-01') === 'passed-ontime', 'a gate cleared before its due date is passed-ontime');
  ok(C.gateTileState(board, tile, 1, '2026-02-01') === 'passed-late', 'a gate cleared after its due date is passed-late');
  // a tile still at c1 (not cleared c1), today past c1's due (Jan11) -> overdue at c1
  const t2 = { id: 't2', lane: 'L', col: 'c1', startDate: '2026-01-01', gatePassed: {} };
  const b2 = Object.assign({}, base, { tiles: [t2] });
  ok(C.gateTileState(b2, t2, 0, '2026-02-01') === 'overdue', 'an uncleared gate past its due date is overdue');
  ok(C.gateTileState(b2, t2, 1, '2026-01-05') === 'pending', 'an uncleared gate before its due date is pending');
})();

// ---------- boardGateSummary (collapsed gate square: passed count + worst status) ----------
(function () {
  const cols = [{ id: 'c1' }, { id: 'c2' }];
  const lane = { id: 'L', maxDaysPerCol: 10, deadline: '' };   // c1 due start+10
  const today = '2026-02-01';
  // 3 tiles, all started Jan1 (c1 due Jan11): one passed on time, one passed late, one overdue
  const board = { columns: cols, swimlanes: [lane], tiles: [
    { id: 'a', lane: 'L', col: 'c2', startDate: '2026-01-01', gatePassed: { c1: '2026-01-05' } },  // ontime
    { id: 'b', lane: 'L', col: 'c2', startDate: '2026-01-01', gatePassed: { c1: '2026-01-20' } },  // late
    { id: 'c', lane: 'L', col: 'c1', startDate: '2026-01-01', gatePassed: {} },                    // overdue (past Jan11)
  ] };
  let sum = C.boardGateSummary(board, 0, today);
  ok(sum.passed === 2, 'gate square count = tiles that cleared the gate (2 of 3)');
  ok(sum.total === 3, 'total tiles reported');
  ok(sum.worst === 'red', 'worst status is red when any tile is overdue at the gate');
  // remove the overdue tile -> worst becomes orange (a late crossing remains)
  board.tiles = board.tiles.slice(0, 2);
  ok(C.boardGateSummary(board, 0, today).worst === 'orange', 'worst is orange when some passed late, none overdue');
  // both on time -> green
  board.tiles[1].gatePassed.c1 = '2026-01-05';
  ok(C.boardGateSummary(board, 0, today).worst === 'green', 'worst is green when all tiles cleared the gate on time');
})();

// ---------- milestoneGanttSteps (dated only) ----------
(function () {
  const kr = { creditMode: 'binary', steps: [
    { id: 's1', name: 'A', weight: 25, due: '2026-01-15', completion: 100 },   // done
    { id: 's2', name: 'B', weight: 25, due: '2026-01-20', completion: 0 },      // overdue (past today)
    { id: 's3', name: 'C', weight: 25, due: '2026-06-01', completion: 0 },      // pending (future)
    { id: 's4', name: 'D', weight: 25, due: '', completion: 0 },                // UNDATED -> omitted
  ] };
  const steps = C.milestoneGanttSteps(kr, '2026-02-01');
  ok(steps.length === 3, 'undated steps are omitted from the Gantt (3 of 4 dated)');
  ok(steps.find(s => s.id === 's1').status === 'done', 'a 100% step is done');
  ok(steps.find(s => s.id === 's2').status === 'overdue', 'an incomplete step past its due is overdue');
  ok(steps.find(s => s.id === 's3').status === 'pending', 'an incomplete step before its due is pending');
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} kanban-engine (K1) assertions green`);
process.exit(fails.length ? 1 : 0);
