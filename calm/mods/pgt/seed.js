/* ============================================================================
   P-gantt seed. Planning reads the execution documents read-only, and its Gantt draws their
   Kanban boards (gate squares per column). The boards are seeded for Execution and Sales by
   mods/kb/seed.js, which is not part of the Planning build, so this mirrors the same two boards
   (same ids, columns, lanes and tiles) to keep the story identical across the four apps.
   If seed_kb is ever added to the Planning build it runs instead, and this does nothing.
   ========================================================================== */
function seed_pgt(S) {
  if (typeof seed_kb === 'function') return;
  function board(id, objectiveId, name, cols, lanes, tiles) {
    return {
      id: id, objectiveId: objectiveId, name: name,
      columns: cols.map(function (c) { return { id: c[0], name: c[1], gate_id: id + '/' + c[0] }; }),
      swimlanes: lanes.map(function (l) { return { id: l[0], name: l[1], maxDaysPerCol: l[2], deadline: l[3] }; }),
      tiles: tiles
    };
  }
  function tile(id, name, lane, col, start, entered, assignee, passed) {
    var t = { id: id, name: name, lane: lane, col: col, startDate: start, enteredCol: entered, gatePassed: passed || {} };
    if (assignee) t.assignee = assignee;
    return t;
  }
  var SAM = 'sam@celadyne.com', KEN = 'ken@celadyne.com', COREY = 'corey@celadyne.com';
  var TORU = 'toru@celadyne.com', PRIYA = 'priya@celadyne.com';
  var pipe = board('BRD-BD-PIPE', 'OBJ-BD-2026Q4-01', 'Pilot pipeline',
    [['col-pr', 'Prospect'], ['col-di', 'Discovery'], ['col-po', 'Proposal'], ['col-cl', 'Closed']],
    [['lane-ut', 'Utilities', 14, '2026-12-18'], ['lane-ig', 'Industrial gas', 21, ''], ['lane-mo', 'Mobility', 14, '']],
    [
      tile('tile-snake', 'Snake River Electric', 'lane-ut', 'col-pr', '2026-10-10', '2026-10-10', SAM),
      tile('tile-cascade', 'Cascade Public Power', 'lane-ut', 'col-di', '2026-09-21', '2026-10-04', SAM, { 'col-pr': '2026-10-04' }),
      tile('tile-desert', 'High Desert Co-op', 'lane-ut', 'col-po', '2026-09-02', '2026-10-01', COREY, { 'col-pr': '2026-09-16', 'col-di': '2026-10-01' }),
      tile('tile-northgate', 'Northgate Gases', 'lane-ig', 'col-di', '2026-09-15', '2026-10-01', KEN, { 'col-pr': '2026-10-01' }),
      tile('tile-ironwood', 'Ironwood Industrial', 'lane-ig', 'col-po', '2026-08-25', '2026-09-20', SAM, { 'col-pr': '2026-09-05', 'col-di': '2026-09-20' }),
      tile('tile-treasure', 'Treasure Valley Transit', 'lane-mo', 'col-pr', '2026-10-11', '2026-10-11', null),
      tile('tile-clearwater', 'Clearwater Port Authority', 'lane-mo', 'col-di', '2026-09-14', '2026-09-28', KEN, { 'col-pr': '2026-09-28' }),
      tile('tile-airport', 'Boise Airport ground fleet', 'lane-mo', 'col-po', '2026-09-01', '2026-10-06', SAM, { 'col-pr': '2026-09-19', 'col-di': '2026-10-06' }),
      tile('tile-teton', 'Teton Valley Utility', 'lane-ut', 'col-cl', '2026-08-03', '2026-10-09', SAM, { 'col-pr': '2026-08-14', 'col-di': '2026-08-28', 'col-po': '2026-10-09' }),
      tile('tile-sawtooth', 'Sawtooth Energy', 'lane-ut', 'col-cl', '2026-07-20', '2026-10-02', SAM, { 'col-pr': '2026-07-30', 'col-di': '2026-08-21', 'col-po': '2026-10-02' }),
      tile('tile-owyhee', 'Owyhee Rural Electric', 'lane-ut', 'col-cl', '2026-07-06', '2026-09-17', KEN, { 'col-pr': '2026-07-15', 'col-di': '2026-08-10', 'col-po': '2026-09-17' }),
      tile('tile-gemstate', 'Gem State Power', 'lane-ut', 'col-cl', '2026-06-22', '2026-08-27', SAM, { 'col-pr': '2026-07-01', 'col-di': '2026-07-24', 'col-po': '2026-08-27' }),
      tile('tile-summit', 'Summit Specialty Gas', 'lane-ig', 'col-cl', '2026-08-10', '2026-10-08', KEN, { 'col-pr': '2026-08-24', 'col-di': '2026-09-11', 'col-po': '2026-10-08' }),
      tile('tile-pacific', 'Pacific Industrial Gases', 'lane-ig', 'col-cl', '2026-07-27', '2026-09-24', SAM, { 'col-pr': '2026-08-07', 'col-di': '2026-08-31', 'col-po': '2026-09-24' }),
      tile('tile-freight', 'Boise Freight Depot', 'lane-mo', 'col-cl', '2026-08-17', '2026-10-05', KEN, { 'col-pr': '2026-08-26', 'col-di': '2026-09-15', 'col-po': '2026-10-05' }),
      tile('tile-magic', 'Magic Valley Fleet', 'lane-mo', 'col-cl', '2026-07-13', '2026-09-10', SAM, { 'col-pr': '2026-07-24', 'col-di': '2026-08-12', 'col-po': '2026-09-10' }),
      tile('tile-bonneville', 'Bonneville Rural Electric', 'lane-ut', null, null, null, null)
    ]);
  var lock = board('BRD-EL-LOCK', 'OBJ-EL-2026Q4-02', 'Component lock',
    [['col-sd', 'Spec drafted'], ['col-st', 'Samples in test'], ['col-ql', 'Qualified'], ['col-rl', 'Released']],
    [['lane-hw', 'Stack hardware', 21, '2026-11-20'], ['lane-sg', 'Soft goods', 14, '2026-11-20']],
    [
      tile('tile-ptl', 'Porous transport layer', 'lane-hw', 'col-rl', '2026-08-20', '2026-10-09', PRIYA, { 'col-sd': '2026-09-01', 'col-st': '2026-09-22', 'col-ql': '2026-10-09' }),
      tile('tile-cc', 'Current collectors', 'lane-hw', 'col-rl', '2026-08-17', '2026-09-30', TORU, { 'col-sd': '2026-08-28', 'col-st': '2026-09-14', 'col-ql': '2026-09-30' }),
      tile('tile-bpp', 'Bipolar plate, second source', 'lane-hw', 'col-st', '2026-09-10', '2026-09-24', TORU, { 'col-sd': '2026-09-24' }),
      tile('tile-endp', 'End plates and compression', 'lane-hw', 'col-sd', '2026-10-05', '2026-10-05', TORU),
      tile('tile-mea', 'Membrane electrode assembly', 'lane-sg', 'col-ql', '2026-09-01', '2026-10-07', PRIYA, { 'col-sd': '2026-09-08', 'col-st': '2026-10-07' }),
      tile('tile-gasket', 'Gaskets', 'lane-sg', 'col-st', '2026-09-15', '2026-09-29', TORU, { 'col-sd': '2026-09-29' }),
      tile('tile-rods', 'Stack tie rods', null, null, null, null, null)
    ]);
  function add(doc, b) { if (!doc) return; doc.boards = doc.boards || []; if (!doc.boards.some(function (x) { return x.id === b.id; })) doc.boards.push(b); }
  add(S.docs && S.docs['BIZ-DIV-BD'], pipe);
  add(S.docs && S.docs['EXEC-DIV-EL'], lock);
  var bd = S.docs && S.docs['BIZ-DIV-BD'];
  if (bd) { bd.gateMode = bd.gateMode || {}; if (!bd.gateMode['OBJ-BD-2026Q4-01']) bd.gateMode['OBJ-BD-2026Q4-01'] = 'kanban'; }
}
