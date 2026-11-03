/* Kanban (mods/kb) scenarios. Run for both boards:
     node test/sc_kb.js out/xkb/Sales-A.dc.html
     node test/sc_kb.js out/xkb/Main.dc.html
   Sales opens on the BD pilot pipeline; Execution uses the component-lock board on OBJ-EL-2026Q4-02.
   The boards have their own Kanban tab (since October 15; before, a Gates / Kanban switch inside
   Stage-gates, stored in doc.gateMode, which is no longer read or written). */
const path = require('path');
const { Sim, done, textOf } = require('./dc');
const RD = require(require('./engine_path'));

const file = process.argv[2] || 'out/xkb/Sales-A.dc.html';

/* record every handler that fires (clicks, typing, keys, drags), to prove each kb handler site is exercised */
const HIT = new Set();
const baseRender = Sim.prototype.render;
Sim.prototype.render = function () {
  baseRender.call(this);
  this.els.forEach((el) => Object.keys(el.on).forEach((name) => {
    const fn = el.on[name];
    const key = name.toLowerCase() + '@' + el.line;
    el.on[name] = function (ev) { HIT.add(key); return fn(ev); };
  }));
  return this;
};
const TODAY = '2026-10-13';
const clone = (x) => JSON.parse(JSON.stringify(x));
const byK = (k) => (el) => el.attrs['data-k'] === k;

function setup() {
  const s = new Sim(file);
  const sales = s.c.APP === 'sales';
  const env = sales
    ? { sales, docKey: 'BIZ-DIV-BD', objId: 'OBJ-BD-2026Q4-01', objName: 'Close three utility pilot agreements', boardId: 'BRD-BD-PIPE',
        lane1: 'lane-ut', lane2: 'lane-ig', col1: 'col-pr', col2: 'col-di', mover: 'tile-snake', moverName: 'Snake River Electric',
        parked: 'tile-bonneville', laneName: 'Utilities', lane2Name: 'Industrial gas', col2Name: 'Discovery' }
    : { sales, docKey: 'EXEC-DIV-EL', objId: 'OBJ-EL-2026Q4-02', objName: 'Lock Tera 25-30-R5 components', boardId: 'BRD-EL-LOCK',
        lane1: 'lane-hw', lane2: 'lane-sg', col1: 'col-sd', col2: 'col-st', mover: 'tile-endp', moverName: 'End plates and compression',
        parked: 'tile-rods', laneName: 'Stack hardware', lane2Name: 'Soft goods', col2Name: 'Samples in test' };
  env.doc = () => s.c.D.docs[env.docKey];
  env.board = () => (env.doc().boards || []).find((b) => b.id === env.boardId);
  env.tile = (id) => (env.board().tiles || []).find((t) => t.id === id);
  return { s, env };
}
/* open the objective's Kanban tab (the Stage-gates tab never shows the boards) */
function openKanban(s, env) {
  if (!env.sales) s.click('~' + env.objName);
  s.click('Stage-gates', { within: 'Objective sections' });
  s.ok(!s.vals.kb.on && !s.has(byK('kb')), 'Stage-gates: no board there');
  s.click('Kanban', { within: 'Objective sections' });
  s.ok(s.vals.kb.on, 'the Kanban tab shows the boards');
  s.ok(s.has(byK('kb')), 'kanban region rendered');
}
function setSim(s, patch) { s.c.setState({ sim: Object.assign({}, s.c.state.sim, patch) }); s.render(); }
/* the confirm dialog is labelled by its own title */
function dlgOk(s, label) { s.click(label, { within: s.vals.ui.dlg.title }); }
function dlgCancel(s) { s.click('Cancel', { within: s.vals.ui.dlg.title }); }
const TS = { within: 'kb-tile-sheet' };
const CS = { within: 'kb-cfg-sheet' };

/* ============================================================ 1. board, summary, tiles */
(function () {
  const { s, env } = setup();
  s.step('open board', () => openKanban(s, env));
  s.clean('board drawn');
  const b = env.board();
  const sum = RD.boardSummary(b, TODAY);
  s.step('summary matches RD.boardSummary', () => {
    s.expect(sum.onTrack + ' on track').expect(sum.atRisk + ' at risk').expect(sum.breached + ' breached').expect(sum.closed + ' closed');
    s.expect(sum.total + ' tiles in total');
    if (sum.backlog) s.expect(sum.backlog + ' in the backlog');
    s.eq('Stage-gates count (kb.count)', s.vals.kb.count, b.tiles.length);
  });
  s.step('gate summary matches RD.boardGateSummary', () => {
    for (let k = 0; k < b.columns.length - 1; k++) {
      const g = RD.boardGateSummary(b, k, TODAY);
      s.expect(g.passed + ' of ' + g.total + ' passed', 'gate ' + b.columns[k].name);
      const word = { red: 'Overdue', orange: 'Passed late', green: 'All passed', none: 'Open' }[g.worst];
      s.eq('gate word ' + k, s.vals.kb.gsum[k].word, word);
    }
    s.eq('no summary for the done column', s.vals.kb.gsum.length, b.columns.length - 1);
  });
  s.step('column counts', () => {
    b.columns.slice(0, -1).forEach((c, i) => s.eq('count ' + c.name, s.vals.kb.heads[i].count, String(sum.perColumn[c.id] || 0)));
  });
  s.step('tile card: health, days, note, gate (engine)', () => {
    b.tiles.filter((t) => !RD.tileInBacklog(t) && t.col !== b.columns[b.columns.length - 1].id).forEach((t) => {
      const lane = b.swimlanes.find((l) => l.id === t.lane);
      const h = RD.tileHealth(t, lane, TODAY);
      const el = s.all(byK('kb-tile:' + t.id))[0];
      s.ok(!!el, 'tile drawn ' + t.name);
      if (!el) return;
      const tx = textOf(el);
      const word = { 'on-track': 'On track', 'at-risk': 'At risk', breached: 'Breached' }[h.status];
      s.ok(tx.includes(word), t.name + ' shows ' + word + ' (' + tx + ')');
      s.ok(tx.includes(h.daysInCol + (h.daysInCol === 1 ? ' day' : ' days') + ' in stage'), t.name + ' days in stage');
      const ci = b.columns.findIndex((c) => c.id === t.col);
      const due = RD.gateDueDates(b.columns, lane, t).due[ci];
      const st = RD.gateTileState(b, t, ci, TODAY);
      if (due) s.ok(tx.includes(st === 'overdue' ? 'Stage overdue' : 'Stage due'), t.name + ' gate state ' + st);
    });
  });
  if (env.sales) s.step('sales pipeline story', () => {
    s.expect('Pilot pipeline').expect('Ironwood Industrial').expect('Over the 21-day stage limit');
    s.expect('Stage overdue, was due yesterday', 'Clearwater gate overdue');
    s.expect('2 gates passed late', 'Boise Airport late gates');
    s.expect('12 of 14 days used', 'High Desert at risk');
    const el = s.all(byK('kb-tile:tile-desert'))[0];
    s.ok(el && textOf(el).includes('CS'), 'High Desert avatar shows Corey Staller');
    const un = s.all(byK('kb-tile:tile-treasure'))[0];
    s.ok(un && s.all((x) => x.attrs['aria-label'] === 'Unassigned', {}).length > 0, 'unassigned avatar labelled');
  });
  else s.step('execution board story', () => {
    s.expect('Component lock').expect('Bipolar plate, second source').expect('19 of 21 days used');
    s.expect('1 gate passed late', 'bipolar plate crossed spec late');
    s.expect('Stage overdue, was due Sep 18', 'end plates first gate overdue (deadline-based due dates)');
  });
  s.step('board tabs and add board', () => {
    const n = env.doc().boards.length;
    s.click('Add board', { within: 'kb' });
    s.eq('board added', env.doc().boards.length, n + 1);
    const nb = env.doc().boards[n];
    s.eq('default columns', nb.columns.map((c) => c.name), ['Prospect', 'Working', 'Closed']);
    s.eq('gate ids', nb.columns.map((c) => c.gate_id), nb.columns.map((c) => nb.id + '/' + c.id));
    s.eq('default lane', nb.swimlanes.map((l) => [l.name, l.maxDaysPerCol, l.deadline]), [['Standard', 14, '']]);
    s.eq('objective', nb.objectiveId, env.objId);
    s.eq('named Board N', nb.name, 'Board ' + (RD ? env.doc().boards.filter((x) => x.objectiveId === env.objId).length : 0));
    s.expect('Board added.');
    s.ok(s.vals.kb.boards.find((x) => x.on).name === nb.name, 'new board selected');
    s.click(env.sales ? 'Pilot pipeline' : 'Component lock');
    s.ok(s.vals.kb.boards.find((x) => x.on).name !== nb.name, 'switched back by tab');
    s.flush();
  });
  s.clean('after add board');
})();

/* ============================================================ 2. drag and drop (RD.dropTile) */
(function () {
  const { s, env } = setup();
  openKanban(s, env);
  s.step('drag to the next stage', () => {
    const before = clone(env.board());
    s.drag(byK('kb-tile:' + env.mover), byK('kb-cell:' + env.lane1 + ':' + env.col2));
    const want = RD.dropTile(before, env.mover, env.col2, env.lane1, TODAY);
    s.eq('board equals RD.dropTile', env.board(), want);
    s.eq('column', env.tile(env.mover).col, env.col2);
    s.eq('clock restarts', env.tile(env.mover).enteredCol, TODAY);
    s.eq('gate stamped', env.tile(env.mover).gatePassed[env.col1], TODAY);
    s.expect('Moved to ' + env.col2Name + '. Its stage clock restarts today.');
    s.eq('drag state cleared', [s.c.state.kb_drag, s.c.state.kb_hot], ['', '']);
  });
  s.step('drag back un-stamps the gate', () => {
    const before = clone(env.board());
    s.drag(byK('kb-tile:' + env.mover), byK('kb-cell:' + env.lane1 + ':' + env.col1));
    s.eq('board equals RD.dropTile', env.board(), RD.dropTile(before, env.mover, env.col1, env.lane1, TODAY));
    s.ok(!env.tile(env.mover).gatePassed[env.col1], 'stamp removed');
  });
  s.step('drag to another swimlane keeps the clock', () => {
    const t0 = clone(env.tile(env.mover));
    s.drag(byK('kb-tile:' + env.mover), byK('kb-cell:' + env.lane2 + ':' + env.col1));
    s.eq('lane', env.tile(env.mover).lane, env.lane2);
    s.eq('clock kept', env.tile(env.mover).enteredCol, t0.enteredCol);
    s.expect('Moved to the ' + env.lane2Name + ' swimlane. Its rules apply now.');
  });
  s.step('drop on the same cell changes nothing', () => {
    const v = s.c.D.version;
    s.drag(byK('kb-tile:' + env.mover), byK('kb-cell:' + env.lane2 + ':' + env.col1));
    s.eq('no save', s.c.D.version, v);
  });
  s.step('drag into a backlog group parks the tile', () => {
    s.drag(byK('kb-tile:' + env.mover), byK('kb-bl:' + env.lane1));
    const t = env.tile(env.mover);
    s.eq('parked', [t.col, t.enteredCol, t.lane], [null, null, env.lane1]);
    s.ok(RD.tileInBacklog(t), 'engine says backlog');
    s.expect('Parked in the backlog under ' + env.laneName + '. Its clock is stopped.');
    const g = s.all(byK('kb-bl:' + env.lane1))[0];
    s.ok(g && textOf(g).includes(env.moverName), 'shown in the lane group');
    s.ok(textOf(g).includes('Awaiting start'), 'awaiting start');
  });
  s.step('drag into Unassigned clears the lane', () => {
    s.drag(byK('kb-tile:' + env.mover), byK('kb-bl:none'));
    s.eq('no lane', env.tile(env.mover).lane, null);
    s.ok(textOf(s.all(byK('kb-bl:none'))[0]).includes('No swimlane yet'), 'no swimlane yet');
  });
  s.step('drag from the backlog starts the clock', () => {
    const before = clone(env.board());
    s.drag(byK('kb-tile:' + env.parked), byK('kb-cell:' + env.lane2 + ':' + env.col2));
    s.eq('board equals RD.dropTile', env.board(), RD.dropTile(before, env.parked, env.col2, env.lane2, TODAY));
    s.eq('started today', env.tile(env.parked).enteredCol, TODAY);
    s.expect('Started in ' + env.col2Name + '. Its stage clock starts today.');
  });
  s.step('backlog collapse is a view preference', () => {
    const v = s.c.D.version;
    s.click('Collapse the backlog');
    s.eq('closed', s.vals.kb.bl.open, false);
    s.ok(!s.has(byK('kb-bl:none')), 'groups hidden');
    s.ok(/parked, no clock running|Empty/.test(s.vals.kb.bl.note), 'count stays visible when closed: ' + s.vals.kb.bl.note);
    s.click('Expand the backlog');
    s.eq('open', s.vals.kb.bl.open, true);
    s.eq('no document change', s.c.D.version, v);
  });
  s.clean('after drags');
})();

/* ============================================================ 3. Done column (per person) */
(function () {
  const { s, env } = setup();
  openKanban(s, env);
  const b0 = env.board();
  const last = b0.columns[b0.columns.length - 1];
  const doneHead = () => s.vals.kb.heads[s.vals.kb.heads.length - 1].count;
  const prefs = () => clone(s.c.D.prefs.kbDone);
  const labelOf = (p) => (p.win === 'all' ? 'All finished' : p.win === 'none' ? 'Count only' : 'Last ' + p.win + ' days') + (p.style === 'compact' ? ', compact' : '');
  const seeded = prefs()[env.boardId];
  s.step('the broker choice is shown while signed in (seeded on another device)', () => {
    s.ok(!!seeded, 'seeded choice for this board');
    s.eq('label', s.vals.kb.done.label, labelOf(seeded));
    const sp = RD.doneSplit(b0, seeded.win, TODAY);
    s.eq('shown of total', doneHead(), sp.shown + ' of ' + sp.total);
    s.eq('compact rows', s.all((el) => /^kb-drow/.test(el.attrs.class || '')).length, sp.shown);
    const lane = Object.keys(sp.byLane).find((k) => sp.byLane[k].older.length);
    s.ok(!!lane, 'some finished tiles are older than the window');
    const g = sp.byLane[lane];
    const hidden = g.older[0];
    s.expectNot(hidden.name, 'older hidden');
    s.click('+' + g.older.length + ' older', { within: 'kb-cell:' + lane + ':' + last.id });
    s.expect(hidden.name).expect('Hide older');
    const cell = s.all(byK('kb-cell:' + lane + ':' + last.id))[0];
    const names = s.all((el) => el.tag === 'button' && el.attrs.class === 'kb-tn').filter((el) => { let p = el.parent; while (p) { if (p === cell) return true; p = p.parent; } return false; }).map(textOf);
    s.eq('newest first, older after', names, RD.doneByRecency(g.shown, TODAY).concat(RD.doneByRecency(g.older, TODAY)).map((t) => t.name));
    s.click('Hide older');
    s.expectNot(hidden.name);
  });
  s.step('pick a window while signed in: stored on the broker (RD.doneVal)', () => {
    s.flush();
    s.eq('settled before', s.c.state.save.state, 'saved');
    s.click(s.vals.kb.done.label);
    s.ok(s.vals.kb.done.open, 'menu open');
    s.expect('Just for you — follows you to any device where you’re signed in to the Hub. Hidden tiles still count in “closed”.');
    s.click('30 days');
    s.eq('broker value', prefs()[env.boardId], RD.doneVal({ win: 30, style: seeded.style }));
    const sp = RD.doneSplit(env.board(), 30, TODAY);
    s.eq('header', doneHead(), sp.shown + ' of ' + sp.total);
    s.ok(s.vals.kb.done.open, 'menu stays open');
    s.click('Cards');
    s.eq('style', prefs()[env.boardId], { win: 30, style: 'cards' });
    s.ok(s.all((el) => /^kb-tile kb-done/.test(el.attrs.class || '')).length === sp.shown, 'finished tiles as cards');
    s.click('None, show the count only');
    s.eq('none', prefs()[env.boardId], { win: 'none', style: 'cards' });
    s.eq('none shows nothing', doneHead(), '0 of ' + RD.doneSplit(env.board(), 'none', TODAY).total);
    s.ok(s.has((el) => el.tag === 'button' && /^\d+ done$/.test(textOf(el))), 'count-only stub "N done"');
    s.click('All finished tiles');
    s.ok(!(env.boardId in prefs()), 'default is never stored (doneVal null)');
    s.eq('label', s.vals.kb.done.label, 'All finished');
    s.eq('count', doneHead(), String(RD.boardSummary(env.board(), TODAY).perColumn[last.id]));
    s.key(s.vals.kb.done.aria, 'Escape');
    s.ok(!s.vals.kb.done.open, 'Escape closes the menu');
    s.eq('no document save for a view', s.c.state.save.state === 'saving', false);
  });
  s.step('signed out: kept in this browser, the broker is untouched', () => {
    s.c.D.prefs.kbDone[env.boardId] = { win: 30, style: 'cards' };
    s.render();
    s.eq('signed in shows the broker', s.vals.kb.done.label, 'Last 30 days');
    setSim(s, { hub: false });
    s.eq('signed out shows this browser (default)', s.vals.kb.done.label, 'All finished');
    s.click(s.vals.kb.done.label);
    s.expect('Saved in this browser only. Open this board from the Hub to keep it on every device.');
    s.click('3 days');
    s.eq('browser copy', s.c.state.kb_anon[env.boardId], { win: 3 });
    s.eq('broker untouched', prefs()[env.boardId], { win: 30, style: 'cards' });
    s.eq('label', s.vals.kb.done.label, 'Last 3 days');
    setSim(s, { hub: true });
    s.eq('signed in again: the person’s choice follows them', s.vals.kb.done.label, 'Last 30 days');
    s.c.closeMenus(); s.render();
  });
  s.step('offline while signed in: kept on this device, retried', () => {
    setSim(s, { offline: true });
    s.click(s.vals.kb.done.label);
    s.click('14 days');
    s.expect('Saved on this device — couldn’t reach the server yet, so it will retry.');
    s.eq('shown from the device copy', s.vals.kb.done.label, 'Last 14 days');
    s.eq('broker not reached', prefs()[env.boardId], { win: 30, style: 'cards' });
    s.c.closeMenus();
    setSim(s, { offline: false });
    s.eq('pending choice still wins', s.vals.kb.done.label, 'Last 14 days');
    s.click(s.vals.kb.done.label);
    s.eq('delivered on the next exchange', prefs()[env.boardId], { win: 14, style: 'cards' });
    s.expect('Just for you');
    s.c.closeMenus(); s.render();
  });
  s.step('first sign-in carries this browser’s choices up (RD.reconcileDone)', () => {
    const t = setup(); const s2 = t.s, e2 = t.env;
    openKanban(s2, e2);
    s2.click('Add board', { within: 'kb' });
    const fresh = e2.doc().boards[e2.doc().boards.length - 1].id;
    setSim(s2, { hub: false });
    s2.click(s2.vals.kb.done.label);
    s2.click('30 days');
    s2.click('Compact rows');
    s2.click(e2.sales ? 'Pilot pipeline' : 'Component lock');
    s2.click(s2.vals.kb.done.label);
    s2.click('3 days');
    s2.c.closeMenus(); s2.render();
    const anon = clone(s2.c.state.kb_anon);
    setSim(s2, { hub: true });
    const server = clone(s2.c.D.prefs.kbDone);
    const r = RD.reconcileDone(server, null, anon);
    s2.eq('broker wins for a board it already has', r.prefs[e2.boardId], server[e2.boardId]);
    s2.eq('carried up for a board the broker lacked', r.prefs[fresh], { win: 30, style: 'compact' });
    s2.eq('shown after sign-in', s2.vals.kb.done.label, labelOf(server[e2.boardId]));
    s2.click(s2.vals.kb.done.label);
    s2.eq('broker after first sync', clone(s2.c.D.prefs.kbDone), Object.assign({}, server, r.push));
    s2.click('Board ' + e2.doc().boards.filter((b) => b.objectiveId === e2.objId).length);
    s2.eq('the new board follows the person now', s2.vals.kb.done.label, 'Last 30 days, compact');
    s2.clean('after first sync');
  });
  s.step('read-only: the Done view still changes; nothing else does', () => {
    s.c.setState({ ro: true }); s.render();
    s.click(s.vals.kb.done.label);
    s.click('7 days');
    s.eq('personal preference allowed', prefs()[env.boardId], { win: 7, style: 'cards' });
    s.expectNot('Read-only view — editing is disabled.');
    s.c.setState({ ro: false }); s.c.closeMenus(); s.render();
  });
  s.clean('after done menu');
})();

/* ============================================================ 4. configure (stages, swimlanes, board) */
(function () {
  const { s, env } = setup();
  openKanban(s, env);
  const W = CS;
  s.step('open configure', () => {
    s.click('Configure');
    s.eq('sheet', s.c.sheet().kind, 'kb.config');
    s.expect('Configure board');
  });
  s.step('rename the board (Enter saves, empty refused, Escape reverts)', () => {
    s.type('Board name', '   ', W); s.key('Board name', 'Enter', W);
    s.expect('A board needs a name.');
    s.type('Board name', 'Renamed board', W); s.key('Board name', 'Enter', W);
    s.eq('name', env.board().name, 'Renamed board');
    s.ok(s.vals.kb.boards.some((b) => b.name === 'Renamed board'), 'tab renamed');
    s.type('Board name', 'Typo', W); s.key('Board name', 'Escape', W);
    s.eq('escape keeps the stored name', env.board().name, 'Renamed board');
    s.eq('field shows stored name again', s.vals.kb.cfg.name, 'Renamed board');
  });
  s.step('rename a stage on blur', () => {
    const el = s.all('Stage 2 name', W).find((e) => e.on.onBlur);
    s.type('Stage 2 name', 'Qualifying', W);
    s.fire(s.all('Stage 2 name', W).find((e) => e.on.onBlur), 'onBlur');
    s.ok(!!el, 'stage input');
    s.eq('stage name', env.board().columns[1].name, 'Qualifying');
  });
  s.step('add and reorder a stage', () => {
    const n = env.board().columns.length;
    s.click('Add stage', W);
    const b = env.board();
    s.eq('added', b.columns.length, n + 1);
    const c = b.columns[n];
    s.eq('name', c.name, 'Stage ' + (n + 1));
    s.eq('gate id', c.gate_id, b.id + '/' + c.id);
    s.expect('Stage added.');
    s.click('Move Stage ' + (n + 1) + ' earlier', W);
    s.eq('moved', env.board().columns[n - 1].id, c.id);
    s.ok(s.all('Move ' + env.board().columns[0].name + ' earlier', W)[0].attrs.disabled === true, 'first cannot move earlier');
    s.click('Move Stage ' + (n + 1) + ' later', W);
    s.eq('back last', env.board().columns[n].id, c.id);
  });
  s.step('delete the empty last stage: confirm says what happens', () => {
    const b = env.board();
    const c = b.columns[b.columns.length - 1];
    const prev = b.columns[b.columns.length - 2];
    s.click('Delete stage ' + c.name, W);
    s.eq('dialog', s.vals.ui.dlg.title, 'Delete the stage “' + c.name + '”?');
    s.eq('body', s.vals.ui.dlg.body, 'No tiles are in this stage. “' + prev.name + '” becomes the done column.');
    dlgOk(s, 'Delete stage');
    s.ok(!env.board().columns.some((x) => x.id === c.id), 'deleted');
    s.expect('Stage deleted.');
  });
  s.step('delete a stage with tiles: count in the confirm, tiles go with it (fixed: today silent)', () => {
    const b = env.board();
    const c = b.columns[1];
    const n = b.tiles.filter((t) => t.col === c.id).length;
    s.ok(n > 0, 'stage has tiles');
    s.click('Delete stage ' + c.name, W);
    s.eq('body', s.vals.ui.dlg.body, 'Its ' + n + (n === 1 ? ' tile is' : ' tiles are') + ' deleted with it, for everyone.');
    dlgCancel(s);
    s.ok(env.board().columns.some((x) => x.id === c.id), 'cancel keeps it');
    s.click('Delete stage ' + c.name, W);
    dlgOk(s, 'Delete stage');
    s.eq('tiles gone', env.board().tiles.filter((t) => t.col === c.id).length, 0);
    s.expect('Stage deleted with ' + n + (n === 1 ? ' tile.' : ' tiles.'));
  });
  s.step('swimlane rules: max days and deadline', () => {
    const l = env.board().swimlanes[0];
    const q = 'Max days per stage for ' + l.name;
    s.type(q, 'abc', W); s.key(q, 'Enter', W);
    s.expect('Use a number of days, like 14. Leave it blank for no limit.');
    s.type(q, '10', W); s.key(q, 'Enter', W);
    s.eq('max', env.board().swimlanes[0].maxDaysPerCol, 10);
    s.type(q, '', W); s.key(q, 'Enter', W);
    s.eq('blank = no limit', env.board().swimlanes[0].maxDaysPerCol, 0);
    s.type('Deadline for ' + l.name, '2026-11-30', W);
    s.eq('deadline', env.board().swimlanes[0].deadline, '2026-11-30');
    s.type('Deadline for ' + l.name, '', W);
    s.eq('deadline cleared', env.board().swimlanes[0].deadline, '');
    s.type('Swimlane 1 name', 'Renamed lane', W); s.key('Swimlane 1 name', 'Enter', W);
    s.eq('lane renamed', env.board().swimlanes[0].name, 'Renamed lane');
    s.c.closeSheet(); s.render();
    s.expect('No stage limit', 'lane rule on the board');
    s.click('Configure');
  });
  s.step('add, reorder and delete swimlanes', () => {
    const n = env.board().swimlanes.length;
    s.click('Add swimlane', W);
    const l = env.board().swimlanes[n];
    s.eq('new lane', [l.name, l.maxDaysPerCol, l.deadline], ['Swimlane ' + (n + 1), 14, '']);
    s.click('Move Swimlane ' + (n + 1) + ' up', W);
    s.eq('moved up', env.board().swimlanes[n - 1].id, l.id);
    s.click('Delete swimlane Swimlane ' + (n + 1), W);
    s.eq('empty lane body', s.vals.ui.dlg.body, 'No tiles are in this swimlane.');
    dlgOk(s, 'Delete swimlane');
    s.eq('lane removed', env.board().swimlanes.length, n);
  });
  s.step('delete a swimlane with tiles, including parked ones', () => {
    const b = env.board();
    const l = b.swimlanes.find((x) => b.tiles.some((t) => t.lane === x.id && RD.tileInBacklog(t))) || b.swimlanes[0];
    const inLane = b.tiles.filter((t) => t.lane === l.id);
    const parked = inLane.filter((t) => RD.tileInBacklog(t)).length;
    s.click('Delete swimlane ' + l.name, W);
    s.eq('body', s.vals.ui.dlg.body, inLane.length ? 'Its ' + inLane.length + (inLane.length === 1 ? ' tile is' : ' tiles are') + ' deleted with it, for everyone' + (parked ? ', including ' + parked + ' waiting in the backlog' : '') + '.' : 'No tiles are in this swimlane.');
    dlgOk(s, 'Delete swimlane');
    s.eq('tiles of the lane gone', env.board().tiles.filter((t) => t.lane === l.id).length, 0);
  });
  s.step('the last stage and swimlane cannot be deleted', () => {
    const b = env.board();
    while (env.board().swimlanes.length > 1) { s.click('Delete swimlane ' + env.board().swimlanes[0].name, W); dlgOk(s, 'Delete swimlane'); }
    s.ok(!s.vals.kb.cfg.lanes[0].canDel, 'one lane left: no delete');
    while (env.board().columns.length > 1) { s.click('Delete stage ' + env.board().columns[0].name, W); dlgOk(s, 'Delete stage'); }
    s.ok(!s.vals.kb.cfg.cols[0].canDel, 'one stage left: no delete');
    s.ok(b, 'board');
  });
  s.step('delete the board from the sheet', () => {
    const b = env.board();
    s.click('Delete board', W);
    s.eq('title', s.vals.ui.dlg.title, 'Delete the board “' + b.name + '”?');
    s.eq('body', s.vals.ui.dlg.body, 'Its 1 stage, 1 swimlane and ' + b.tiles.length + (b.tiles.length === 1 ? ' tile' : ' tiles') + ' are deleted for everyone. Scores are not affected.');
    dlgOk(s, 'Delete board');
    s.ok(!env.board(), 'board deleted');
    s.ok(!s.c.sheet(), 'its sheet closed');
    s.expect('Board deleted.');
    s.expect('No boards yet. A Kanban board is a stage-gate sequence (columns) that parallel workstreams (tiles) move through.');
  });
  s.clean('after configure');
})();

/* ============================================================ 5. tiles: add, edit, assign, delete */
(function () {
  const { s, env } = setup();
  openKanban(s, env);
  const save = () => s.click(s.vals.kb.tile.saveText, TS);
  s.step('add from the bar goes to the backlog with no lane (as today)', () => {
    s.click('Add tile', { within: 'kb' });
    s.eq('sheet', s.c.sheet().kind, 'kb.tile');
    s.eq('title', s.vals.kb.tile.title, 'Add tile');
    s.eq('no lane, no stage', [s.vals.kb.tile.lane, s.vals.kb.tile.col], ['', '']);
  });
  s.step('name required', () => {
    save();
    s.expect('A tile needs a name.');
    s.ok(!!s.c.sheet(), 'stays open');
  });
  s.step('add straight into a stage: clock starts today, assignee stored', () => {
    const n = env.board().tiles.length;
    s.type('Name', 'New prospect tile', TS);
    s.type('Swimlane', env.lane1, TS);
    s.type('Stage', env.col2, TS);
    s.ok(!s.vals.kb.tile.parkHint, 'no park hint with a lane');
    const owner = env.sales ? 'sam@celadyne.com' : 'toru@celadyne.com';
    s.click(byK('kb-asg:' + owner));
    s.ok(s.vals.kb.tile.people.find((p) => p.email === owner).on, 'picked');
    save();
    s.eq('added', env.board().tiles.length, n + 1);
    const t = env.board().tiles[n];
    s.eq('fields', [t.name, t.lane, t.col, t.enteredCol, t.assignee, t.startDate], ['New prospect tile', env.lane1, env.col2, TODAY, owner, null]);
    s.ok(/^tile/.test(t.id), 'id like today: tile…');
    s.expect('Tile added.');
    s.ok(!s.c.sheet(), 'closed');
    const el = s.all(byK('kb-tile:' + t.id))[0];
    s.ok(el && textOf(el).includes('On track') && textOf(el).includes('0 days in stage'), 'drawn on the board');
  });
  s.step('lane and backlog "Add tile" buttons pre-fill', () => {
    s.click('Add tile to ' + env.laneName);
    s.eq('lane prefill', [s.vals.kb.tile.lane, s.vals.kb.tile.col], [env.lane1, env.board().columns[0].id]);
    s.c.closeSheet(); s.render();
    s.click('Add tile to the backlog under ' + env.laneName);
    s.eq('backlog group prefill', [s.vals.kb.tile.lane, s.vals.kb.tile.col], [env.lane1, '']);
    s.type('Name', 'Parked one', TS);
    save();
    const t = env.board().tiles.find((x) => x.name === 'Parked one');
    s.eq('parked new tile has no clock', [t.col, t.enteredCol, t.lane], [null, null, env.lane1]);
    s.click('Add tile to the backlog');
    s.eq('backlog head prefill', [s.vals.kb.tile.lane, s.vals.kb.tile.col], ['', '']);
    s.key('Name', 'Escape', TS);
    s.ok(!s.c.sheet(), 'Escape closes');
  });
  s.step('edit: changing the stage restarts the clock', () => {
    s.click(env.moverName);
    s.eq('title', s.vals.kb.tile.title, 'Edit tile');
    s.type('Stage', env.col2, TS);
    save();
    const t = env.tile(env.mover);
    s.eq('moved', [t.col, t.enteredCol], [env.col2, TODAY]);
    s.expect('Tile saved.');
  });
  s.step('edit: a typed "Entered this stage" date wins', () => {
    s.click(env.moverName);
    s.type('Stage', env.col1, TS);
    s.type('Entered this stage', '2026-10-01', TS);
    save();
    s.eq('entered as typed', [env.tile(env.mover).col, env.tile(env.mover).enteredCol], [env.col1, '2026-10-01']);
  });
  s.step('edit without moving keeps the clock; Enter saves', () => {
    s.click(env.moverName);
    s.type('Name', env.moverName + ' (renamed)', TS);
    s.key('Name', 'Enter', TS);
    s.eq('clock kept', env.tile(env.mover).enteredCol, '2026-10-01');
    s.eq('renamed', env.tile(env.mover).name, env.moverName + ' (renamed)');
  });
  s.step('clearing the swimlane parks the tile', () => {
    s.click(env.moverName + ' (renamed)');
    s.type('Swimlane', '', TS);
    s.ok(s.vals.kb.tile.parkHint, 'park hint shown');
    s.expect('Without a swimlane the tile stays in the backlog');
    save();
    const t = env.tile(env.mover);
    s.eq('parked', [t.lane, t.col, t.enteredCol], [null, null, null]);
  });
  s.step('stage-gates for this tile (RD.gateTileState / gateDueDates)', () => {
    const b = env.board();
    const t = b.tiles.find((x) => !RD.tileInBacklog(x) && x.col !== b.columns[b.columns.length - 1].id && Object.keys(x.gatePassed || {}).length);
    s.click(t.name);
    const lane = b.swimlanes.find((l) => l.id === t.lane);
    const due = RD.gateDueDates(b.columns, lane, t).due;
    b.columns.forEach((c, k) => {
      const st = RD.gateTileState(b, t, k, TODAY);
      const word = { 'passed-ontime': 'Passed', 'passed-late': 'Passed late', overdue: 'Overdue', pending: 'Not yet' }[st];
      s.eq('gate ' + c.name, s.vals.kb.tile.gates[k].word, word);
      s.eq('due ' + c.name, s.vals.kb.tile.gates[k].due === 'No due date', !due[k]);
    });
    const h = RD.tileHealth(t, lane, TODAY);
    s.eq('health word', s.vals.kb.tile.st, { 'on-track': 'On track', 'at-risk': 'At risk', breached: 'Breached' }[h.status]);
    s.c.closeSheet(); s.render();
  });
  s.step('assignee picker: division owners only, roster rules', () => {
    const owner = env.sales ? 'sam@celadyne.com' : 'toru@celadyne.com';
    const t = env.board().tiles.find((x) => x.assignee && x.assignee !== owner && x.assignee !== 'priya@celadyne.com') || env.board().tiles.find((x) => x.assignee);
    s.click(t.name);
    const all = s.c.D.roster.users.filter((u) => !u.disabled).map((u) => u.email);
    s.c.D.portfolio.objectives.forEach((o) => RD.ownersOf(o).forEach((e) => { if (all.indexOf(e) < 0) all.push(e); }));
    const div = env.sales ? 'DIV-BD' : 'DIV-EL';
    const opts = (narrow) => RD.assigneeOptions({ portfolio: s.c.D.portfolio, divisionId: div, todayDay: s.c.D.today, objectiveState: env.doc().objectiveState, allEmails: all, narrow: narrow, current: t.assignee });
    const rows = opts(true);
    s.eq('narrow rows', s.vals.kb.tile.people.map((p) => p.email), rows.map((r) => r.email));
    s.expect('Showing ' + rows.length + ' of ' + all.length + ' people, those owning an active objective in this division.');
    const r = rows.find((x) => x.email === t.assignee);
    s.ok(!!r && r.current, 'current assignee always listed');
    if (r && !r.isOwner) s.expect('Assigned, but owns nothing active here');
    if (r && r.isOwner) s.expect('Owns ' + r.owns + ' active objective');
    s.ok(!s.vals.kb.tile.people.some((p) => p.email === 'lena@celadyne.com'), 'disabled user left out');
    s.check('Division owners only', false, TS);
    s.eq('narrow pref off', s.c.state.kb_narrow, false);
    s.expect('Showing everyone known.');
    s.eq('wide rows', s.vals.kb.tile.people.map((p) => p.email), opts(false).map((x) => x.email));
    s.ok(!s.vals.kb.tile.people.some((p) => p.email === 'lena@celadyne.com'), 'disabled user left out of everyone');
    s.expect('No active objective here');
    s.click('~Nobody owns this tile yet', TS);
    s.ok(s.vals.kb.tile.noneOn, 'unassigned picked');
    s.check('Division owners only', true, TS);
    s.ok(s.vals.kb.tile.noneOn, 'flipping the switch keeps the pick');
    save();
    s.ok(!('assignee' in env.tile(t.id)), 'unassigned stores nothing');
    s.ok(s.all((el) => el.attrs['aria-label'] === 'Unassigned' && el.attrs.role === 'img').length > 0, 'dashed unassigned disc');
  });
  s.step('delete a tile asks first (fixed: today deletes at once)', () => {
    const t = env.board().tiles.find((x) => !RD.tileInBacklog(x));
    const n = env.board().tiles.length;
    s.click(t.name);
    s.click('Delete tile', TS);
    s.eq('confirm title', s.vals.ui.dlg.title, 'Delete the tile “' + t.name + '”?');
    dlgCancel(s);
    s.eq('cancel keeps it', env.board().tiles.length, n);
    s.ok(!!s.c.sheet(), 'sheet still open');
    s.click('Delete tile', TS);
    dlgOk(s, 'Delete tile');
    s.eq('deleted', env.board().tiles.length, n - 1);
    s.expect('Tile deleted.');
    s.ok(!s.c.sheet(), 'sheet closed');
  });
  s.step('bad dates are refused', () => {
    const b = env.board();
    s.click(b.tiles.find((x) => !RD.tileInBacklog(x) && x.col !== b.columns[b.columns.length - 1].id).name);
    s.type('Started', 'not a date', TS);
    save();
    s.expect('Use a real date, like 2026-10-13.');
    s.c.closeSheet(); s.render();
  });
  s.clean('after tiles');
})();

/* ============================================================ 6. read-only: view only */
(function () {
  const { s, env } = setup();
  openKanban(s, env);
  s.c.setState({ ro: true }); s.render();
  s.step('no editing controls, no dragging', () => {
    s.ok(!s.has('Add tile'), 'no Add tile');
    s.ok(!s.has('Configure'), 'no Configure');
    s.ok(!s.has('Delete board'), 'no Delete board');
    s.ok(!s.has('Add board'), 'no Add board');
    const tiles = s.all((el) => /^kb-tile:/.test(el.attrs['data-k'] || ''));
    s.ok(tiles.length > 0 && tiles.every((el) => el.attrs.draggable === false && !el.on.onDragStart), 'tiles not draggable');
    s.ok(s.all((el) => /^kb-cell:|^kb-bl:/.test(el.attrs['data-k'] || '')).every((el) => !el.on.onDrop), 'no drop targets');
  });
  s.step('open a tile read-only', () => {
    s.click(env.moverName);
    s.ok(!s.vals.kb.tile.canSave && !s.vals.kb.tile.canDelete, 'no save or delete');
    s.ok(s.all('Name', { within: 'kb-tile-sheet', tag: 'input' })[0].attrs.disabled === true, 'fields disabled');
    s.expect('Close');
    s.c.closeSheet(); s.render();
  });
  s.step('handlers are guarded too', () => {
    const v = s.c.D.version;
    s.vals.kb.addBoard();
    s.render();
    s.expect('Read-only view — editing is disabled.');
    s.eq('nothing saved', s.c.D.version, v);
  });
  s.step('read-only: moving between the Stage-gates and Kanban tabs only changes the view', () => {
    const before = JSON.stringify(env.doc());
    s.click('Stage-gates', { within: 'Objective sections' });
    s.ok(!s.vals.kb.on && !s.has(byK('kb')), 'no board on the Stage-gates tab');
    s.click('Kanban', { within: 'Objective sections' });
    s.ok(s.vals.kb.on && s.has(byK('kb')), 'the board on the Kanban tab');
    s.eq('document untouched', JSON.stringify(env.doc()), before);
  });
  s.step('views still work: board tabs, backlog, older tiles', () => {
    s.click('Collapse the backlog');
    s.eq('backlog closed', s.vals.kb.bl.open, false);
    s.click('Expand the backlog');
    const stub = s.all((el) => el.tag === 'button' && /^\+\d+ older$/.test(textOf(el)))[0];
    s.ok(!!stub, 'older stub in read-only');
    if (stub) { s.fire(stub, 'onClick'); s.expect('Hide older'); }
  });
  s.clean('read-only');
})();

/* ============================================================ 8. remaining controls */
(function () {
  const { s, env } = setup();
  openKanban(s, env);
  const blur = (q, opts) => s.fire(s.all(q, opts).find((e) => e.on.onBlur), 'onBlur');
  s.step('Done menu closes with its own button', () => {
    s.click(s.vals.kb.done.label);
    s.click('Close', { within: s.vals.kb.done.aria });
    s.ok(!s.vals.kb.done.open, 'closed');
  });
  s.step('compact rows: open, drag back out of Done (reopens the tile)', () => {
    s.click(s.vals.kb.done.label);
    s.click('7 days'); s.click('Compact rows');
    s.c.closeMenus(); s.render();
    const b = env.board();
    const last = b.columns[b.columns.length - 1];
    const sp = RD.doneSplit(b, 7, TODAY);
    const lane = Object.keys(sp.byLane).find((k) => sp.byLane[k].shown.length);
    const t = sp.byLane[lane].shown[0];
    s.ok(s.all((el) => el.attrs.class === 'kb-drow' && el.attrs['data-k'] === 'kb-tile:' + t.id).length === 1, 'compact row drawn');
    s.click(t.name);
    s.eq('done tile sheet', s.vals.kb.tile.st.indexOf('Done'), 0);
    s.click('Close', { within: 'kb-tile-sheet' });
    s.ok(!s.c.sheet(), 'header close');
    const older = Object.keys(sp.byLane).find((k) => sp.byLane[k].older.length);
    if (older) {
      const n = sp.byLane[older].older.length;
      s.click('+' + n + ' older', { within: 'kb-cell:' + older + ':' + last.id });
      s.ok(s.vals.kb.lanes.find((l) => l.id === older).cells.slice(-1)[0].olderOpen, 'older shown');
    }
    const row = () => s.all((el) => /^kb-drow/.test(el.attrs.class || '') && el.attrs['data-k'] === 'kb-tile:' + t.id)[0];
    s.fire(row(), 'onDragStart');
    s.eq('lifted while dragging', s.c.state.kb_drag, t.id);
    s.ok(/lift/.test(row().attrs.class), 'row shows it is lifted');
    s.fire(row(), 'onDragEnd');
    s.eq('a cancelled drag clears the lift', s.c.state.kb_drag, '');
    const before = clone(env.board());
    const to = b.columns[b.columns.length - 2];
    s.drag(byK('kb-tile:' + t.id), byK('kb-cell:' + t.lane + ':' + to.id));
    s.eq('reopened by RD.dropTile', env.board(), RD.dropTile(before, t.id, to.id, t.lane, TODAY));
    s.eq('clock restarted', env.tile(t.id).enteredCol, TODAY);
    s.ok(!env.tile(t.id).gatePassed[to.id], 'its own gate un-stamped');
  });
  s.step('open a parked tile, then Cancel', () => {
    s.click(env.board().tiles.find((x) => x.id === env.parked).name);
    s.ok(['Awaiting start', 'No swimlane yet'].indexOf(s.vals.kb.tile.st) >= 0, 'parked state: ' + s.vals.kb.tile.st);
    s.eq('backlog sub', s.vals.kb.tile.stSub, 'In the backlog, no clock running');
    s.click('Cancel', { within: 'kb-tile-sheet' });
    s.ok(!s.c.sheet(), 'cancel closes');
  });
  s.step('configure: blur and Enter save, close buttons', () => {
    s.click('Configure');
    s.type('Board name', 'Blurred name', CS); blur('Board name', CS);
    s.eq('board name on blur', env.board().name, 'Blurred name');
    s.type('Stage 1 name', 'First stage', CS); s.key('Stage 1 name', 'Enter', CS);
    s.eq('stage name on Enter', env.board().columns[0].name, 'First stage');
    s.type('Swimlane 1 name', 'Lane by blur', CS); blur('Swimlane 1 name', CS);
    s.eq('lane name on blur', env.board().swimlanes[0].name, 'Lane by blur');
    const q = 'Max days per stage for Lane by blur';
    s.type(q, '9', CS); blur(q, CS);
    s.eq('max on blur', env.board().swimlanes[0].maxDaysPerCol, 9);
    const first = env.board().swimlanes[0].id;
    s.click('Move Lane by blur down', CS);
    s.eq('moved down', env.board().swimlanes[1].id, first);
    s.click('Close', CS);
    s.ok(!s.c.sheet(), 'header close');
    s.click('Configure');
    s.click('Done', CS);
    s.ok(!s.c.sheet(), 'Done closes');
  });
  s.step('delete the board from the bar; empty state adds a new one', () => {
    s.click('Delete board', { within: 'kb' });
    dlgCancel(s);
    s.ok(!!env.board(), 'cancel keeps the board');
    const others = KBboards(env, s).filter((b) => b.id !== env.boardId);
    s.click('Delete board', { within: 'kb' });
    dlgOk(s, 'Delete board');
    s.ok(!env.board(), 'deleted');
    s.ok(others.length || s.vals.kb.noBoards, 'empty when it was the only board');
    s.expect('No boards yet. A Kanban board is a stage-gate sequence (columns) that parallel workstreams (tiles) move through.');
    s.click('Add board', { within: 'kb' });
    const bs = KBboards(env, s);
    s.eq('one new board', bs.length, 1);
    s.eq('named Board 1', bs[0].name, 'Board 1');
    s.ok(s.vals.kb.hasBoard, 'board shown');
  });
  s.clean('remaining controls');
})();
function KBboards(env, s) { return (env.doc().boards || []).filter((b) => b.objectiveId === env.objId); }

/* ============================================================ 9. header search finds tiles */
(function () {
  const { s, env } = setup();
  const t = env.sales ? { id: 'tile-ironwood', name: 'Ironwood Industrial', sub: 'Tile on Pilot pipeline, Proposal' } : { id: 'tile-gasket', name: 'Gaskets', sub: 'Tile on Component lock, Samples in test' };
  s.step('search a tile and open it', () => {
    if (!s.has('Search')) { s.ok(true, 'no header search in this build'); return; }
    s.type('Search', t.name.slice(0, 6));
    const res = s.all('~' + t.sub, { within: 'Search results' });
    s.ok(res.length > 0, 'result with where it sits: ' + t.sub);
    s.expect('Kanban tiles', 'group label');
    s.click('~' + t.sub, { within: 'Search results' });
    s.eq('objective', s.c.ctx.objId, env.objId);
    s.eq('tab', s.c.state.tab, 'kanban');
    s.eq('tile sheet', [s.c.sheet() && s.c.sheet().kind, s.c.sheet() && s.c.sheet().data.tileId], ['kb.tile', t.id]);
    s.eq('title', s.vals.kb.tile.title, 'Edit tile');
  });
  s.clean('search');
})();

/* ============================================================ 7. every kb handler site was exercised */
(function () {
  const { s } = setup();
  const sites = [];
  (function collect(n) {
    if (n.attrs) Object.keys(n.attrs).forEach((k) => {
      if (!k.startsWith('on')) return;
      const src = s.parsed.srcmap && s.parsed.srcmap[n.line];
      if (src && /^mods\/kb\//.test(src[0])) sites.push({ key: k.toLowerCase() + '@' + n.line, where: src[0] + ':' + src[1] + ' ' + k });
    });
    (n.kids || []).forEach(collect);
  })(s.parsed.tree);
  const missed = sites.filter((x) => !HIT.has(x.key)).map((x) => x.where);
  s.ok(sites.length > 30, 'kb handler sites found: ' + sites.length);
  s.eq('kb handler sites never exercised', missed, []);
})();

done();
