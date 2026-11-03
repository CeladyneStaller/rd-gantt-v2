// Done-column window: which finished tiles each viewer sees, by how long ago they reached the last column.
// A display filter only — the board, its "closed" count, gate dates and metrics never see it.
//
// Every date here is relative to a FIXED today, passed in: these functions take todayIso as an argument, so
// the test cannot drift with the calendar (two harnesses in this suite once broke on quarter boundaries
// because they read the real clock).
const C = require((process.env.RD_SRC || '.') + '/rdcore.js');
let n = 0, f = 0; const ok = (c, m) => { n++; if (!c) { f++; console.log('FAIL:', m); } };
const TODAY = '2026-10-09';
const ago = d => { const t = Date.parse(TODAY + 'T00:00:00Z') - d * 86400000; return new Date(t).toISOString().slice(0, 10); };

// ---- normalising the stored setting ----
ok(C.normDoneWindow('all') === 'all' && C.normDoneWindow('none') === 'none', "'all' and 'none' pass through");
ok(C.normDoneWindow(14) === 14 && C.normDoneWindow('14') === 14, 'a day count may arrive as a number or a string');
ok(C.normDoneWindow('14.7') === 14, 'a fractional count (only possible from hand-edited storage) is floored to whole days, so the label never reads "last 14.7 days"');
for (const bad of [0, -3, null, undefined, '', 'abc', NaN])
  ok(C.normDoneWindow(bad) === 'all', 'a missing or unusable setting (' + String(bad) + ') falls back to all — nothing hidden by accident');

// ---- age ----
ok(C.doneTileAge({ enteredCol: ago(2) }, TODAY) === 2, 'age is days since the tile entered its column (2)');
ok(C.doneTileAge({ enteredCol: TODAY }, TODAY) === 0, 'a tile finished today is 0 days old');
ok(C.doneTileAge({}, TODAY) === null && C.doneTileAge({ enteredCol: 'not a date' }, TODAY) === null, 'no usable date -> unknown age, not 0');
ok(C.doneTileAge({ enteredCol: '2026-10-12' }, TODAY) === 0, 'a future stamp clamps to 0 rather than going negative');

// ---- the mockup board: 12 finished tiles across three lanes ----
const T = (id, lane, col, age) => ({ id, name: id, lane, col, enteredCol: age == null ? undefined : ago(age) });
const board = {
  columns: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }],
  swimlanes: [{ id: 'L1', maxDaysPerCol: 14 }, { id: 'L2', maxDaysPerCol: 21 }, { id: 'L3', maxDaysPerCol: 14 }],
  tiles: [
    T('Idaho', 'L1', 'c1', 3), T('PacifiCorp', 'L1', 'c2', 9), T('Avista', 'L1', 'c3', 4),
    T('AirLiquide', 'L2', 'c2', 12), T('Linde', 'L2', 'c3', 19), T('Nikola', 'L3', 'c1', 2), T('Seattle', 'L3', 'c2', 15),
    T('RockyMtn', 'L1', 'c4', 2), T('NV', 'L1', 'c4', 11), T('Xcel', 'L1', 'c4', 26), T('APS', 'L1', 'c4', 47), T('SMUD', 'L1', 'c4', 83),
    T('Praxair', 'L2', 'c4', 5), T('AirProducts', 'L2', 'c4', 19), T('Matheson', 'L2', 'c4', 38), T('Messer', 'L2', 'c4', 64),
    T('Hyzon', 'L3', 'c4', 8), T('Plug', 'L3', 'c4', 33), T('Daimler', 'L3', 'c4', 71) ] };
const ids = a => a.map(t => t.id).join(',');

const s14 = C.doneSplit(board, 14, TODAY);
ok(s14.total === 12 && s14.shown === 4, 'last 14 days: 4 of the 12 finished tiles are drawn (' + s14.shown + ' of ' + s14.total + ')');
ok(ids(s14.byLane.L1.shown) === 'RockyMtn,NV' && ids(s14.byLane.L1.older) === 'Xcel,APS,SMUD', 'Utilities: 2 shown, 3 older');
ok(s14.byLane.L2.shown.length === 1 && s14.byLane.L2.older.length === 3, 'Industrial gas: 1 shown, 3 older');
ok(s14.byLane.L3.shown.length === 1 && s14.byLane.L3.older.length === 2, 'Mobility: 1 shown, 2 older');
ok(!s14.byLane.L1.shown.concat(s14.byLane.L1.older).some(t => t.col !== 'c4'), 'only the LAST column is windowed — active tiles are never touched');

const sAll = C.doneSplit(board, 'all', TODAY);
ok(sAll.shown === 12 && sAll.total === 12, "'all' draws every finished tile — what an untouched board does today");
const sNone = C.doneSplit(board, 'none', TODAY);
ok(sNone.shown === 0 && sNone.total === 12, "'none' draws none and still knows there are 12");
const s3 = C.doneSplit(board, 3, TODAY);
ok(s3.shown === 1 && ids(s3.byLane.L1.shown) === 'RockyMtn', 'last 3 days: only the tile finished 2 days ago');

// boundary: "last 14 days" keeps day 14 and drops day 15
{
  const b = { columns: [{ id: 'a' }, { id: 'z' }], tiles: [T('d14', 'L', 'z', 14), T('d15', 'L', 'z', 15)] };
  const s = C.doneSplit(b, 14, TODAY);
  ok(ids(s.byLane.L.shown) === 'd14' && ids(s.byLane.L.older) === 'd15', 'a tile finished exactly 14 days ago is inside "last 14 days"; 15 is not');
}
// undated finished tiles
{
  const b = { columns: [{ id: 'a' }, { id: 'z' }], tiles: [T('old', 'L', 'z', 40), T('undated', 'L', 'z', null)] };
  ok(ids(C.doneSplit(b, 7, TODAY).byLane.L.shown) === 'undated', 'an undated finished tile is never hidden by a day window — its age is unknown, so it cannot be "older"');
  ok(C.doneSplit(b, 'none', TODAY).shown === 0, '...but count-only hides it like everything else');
}
// parked tiles and odd boards
{
  const b = { columns: [{ id: 'a' }, { id: 'z' }], tiles: [T('parked', null, 'z', 1), T('real', 'L', 'z', 1)] };
  const s = C.doneSplit(b, 'all', TODAY);
  ok(s.total === 1 && ids(s.byLane.L.shown) === 'real', 'a parked tile (no lane) is not a finished tile, exactly as boardSummary treats it');
  ok(C.doneSplit({ columns: [], tiles: [T('x', 'L', 'z', 1)] }, 14, TODAY).total === 0, 'a board with no columns has no done column');
}
// the summary is untouched
{
  const sum = C.boardSummary(board, TODAY);
  ok(sum.closed === 12 && sum.closed === s14.total, 'boardSummary still counts all 12 as closed, whatever any viewer has hidden');
}
// re-finishing restarts the age
{
  let b = JSON.parse(JSON.stringify(board));
  b = C.dropTile(b, 'SMUD', 'c3', null, TODAY);      // reopened…
  b = C.dropTile(b, 'SMUD', 'c4', null, TODAY);      // …and finished again today
  ok(C.doneSplit(b, 3, TODAY).byLane.L1.shown.some(t => t.id === 'SMUD'), 'a tile finished again today counts as finished today, even under a 3-day window');
}
// recency order
{
  const r = C.doneByRecency([T('b11', 'L', 'z', 11), T('und', 'L', 'z', null), T('a2', 'L', 'z', 2), T('c11', 'L', 'z', 11)], TODAY);
  ok(ids(r) === 'a2,b11,c11,und', 'newest-finished first, ties in board order, undated last (' + ids(r) + ')');
}

console.log(f ? `\n${f}/${n} FAILED` : `\nPASS — ${n} done-column window assertions green`); process.exit(f ? 1 : 0);
