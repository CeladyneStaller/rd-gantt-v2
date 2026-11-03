/* ============================================================================
   Kanban (X-kb). One module for Execution and Sales: today's kanban code is the
   same in both apps (exec L4802-5326, sales L3492-4117; engine core L780-1074).

   Where it shows: the Kanban tab (the shell's "kanban" slot; its own tab next to
   Stage-gates since October 15, when it stopped being a view of that tab switched by
   doc.gateMode, which is no longer read or written). This module draws the boards
   while that tab is open (kb.on), plus two sheets:
     kb.tile    add / edit / view one tile (today's "Add tile" / "Edit tile" modal)
     kb.config  configure a board (today's inline "configure" panel)

   Public (for other modules):
     KB.boardsFor(doc, objId)   boards of an objective, in document order
     KB.count(C, ctx)           tiles on the selected objective's active board: the Kanban
                                tab's header count (today's Stage-gates header in Kanban mode)
   The view model also exposes kb.count, kb.hasBoard and kb.addBoard.

   Per-person and per-browser view state (never written to the shared document):
     kb_sel     selected board (session only, like today's kanbanBoardSel)
     kb_bl      backlog open (today's rd_kb_backlog, this browser)
     kb_narrow  "Division owners only" in the assignee picker (rd_kb_narrow)
     kb_older   expanded older finished tiles per "board:lane" (session only)
     kb_focus   the tile the Overview's review table just opened: highlighted, and its name takes focus
     kb_anon    Done-column choices while nobody is signed in to the Hub (rd_kb_done)
     kb_acct    this device's copy per signed-in person, { prefs, pending[], first? } (rd_kb_done_acct)
   Signed in (C.state.sim.hub), the Done-column choice lives on the broker in
   C.D.prefs.kbDone and follows the person; RD.hubSessionEmail / doneVal /
   reconcileDone square this device with it exactly as the live apps do.
   ========================================================================== */
const KB = (function () {
  const WINDOWS = [[3, '3 days'], [7, '7 days'], [14, '14 days'], [30, '30 days'], ['all', 'All finished tiles'], ['none', 'None, show the count only']];
  const STYLES = [['cards', 'Cards'], ['compact', 'Compact rows']];

  /* ------------------------------------------------------------ helpers */
  function boardsFor(doc, objId) { return ((doc && doc.boards) || []).filter((b) => b && b.objectiveId === objId); }
  function boardById(doc, id) { return ((doc && doc.boards) || []).find((b) => b && b.id === id) || null; }
  function activeBoard(C, boards) {
    if (!boards.length) return null;
    const sel = C.state.kb_sel;
    return (sel && boards.find((b) => b.id === sel)) || boards[0];
  }
  function todayIso(ctx) { return F.iso(ctx.today); }
  function isoDay(iso) { return F.fromIso(iso); }
  function dayText(iso, ctx) { const d = isoDay(iso); return d == null ? String(iso || '') : F.dayAuto(d, ctx.today); }
  /* a due date in words near today ("today", "tomorrow", "yesterday"), otherwise "Oct 27" */
  function dueText(iso, ctx) {
    const d = isoDay(iso);
    if (d == null) return String(iso || '');
    const n = d - ctx.today;
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : F.dayAuto(d, ctx.today);
  }
  function validIso(s) { return s === '' || F.fromIso(s) != null; }
  function plural(n, one, many) { return F.plural(n, one, many); }
  function stageName(c) { return (c && c.name) || 'Untitled stage'; }
  function laneName(l) { return (l && (l.name || l.id)) || 'Untitled swimlane'; }
  function boardName(b) { return (b && b.name) || 'Untitled board'; }
  /* names from the roster where we know them, otherwise the engine's email rule (today's initials) */
  function initials(email) { const u = F.person(email); return u && u.name ? F.initials(email) : RD.initialsOf(email); }
  function personName(email) { const u = F.person(email); return u && u.name ? u.name : String(email || ''); }
  function allIds(doc) {
    const ids = [];
    ((doc && doc.boards) || []).forEach((b) => {
      ids.push(b.id);
      (b.columns || []).forEach((c) => ids.push(c.id));
      (b.swimlanes || []).forEach((l) => ids.push(l.id));
      (b.tiles || []).forEach((t) => ids.push(t.id));
    });
    return ids;
  }
  /* today's newId(pre): prefix + time + a counter (deterministic here; unique in the document) */
  function newId(C, pre, taken) {
    let id;
    do {
      C._kbSeq = (C._kbSeq || 0) + 1;
      id = pre + Math.floor(C.now()).toString(36) + C._kbSeq.toString(36);
    } while (taken.indexOf(id) >= 0);
    taken.push(id);
    return id;
  }
  /* this browser's copy of the per-person view choices, under today's keys (rd_kb_backlog / rd_kb_narrow "1"/"0",
     rd_kb_done and rd_kb_done_acct as JSON), so they outlast the visit as they do today. Blocked or missing storage
     leaves them for this visit only (audit A2). */
  const LS_KEYS = { kb_bl: 'rd_kb_backlog', kb_narrow: 'rd_kb_narrow', kb_anon: 'rd_kb_done', kb_acct: 'rd_kb_done_acct' };
  function lsGet(k) { try { const ls = typeof window !== 'undefined' ? window.localStorage : null; return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { const ls = typeof window !== 'undefined' ? window.localStorage : null; if (ls) ls.setItem(k, v); } catch (e) { /* this visit only */ } }
  function lsObj(k) { try { const v = JSON.parse(lsGet(k) || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch (e) { return null; } }
  function initialView() {
    return { kb_bl: lsGet(LS_KEYS.kb_bl) !== '0', kb_narrow: lsGet(LS_KEYS.kb_narrow) !== '0', kb_anon: lsObj(LS_KEYS.kb_anon) || {}, kb_acct: lsObj(LS_KEYS.kb_acct) || {} };
  }
  function keepView(C, patch) {
    C.setState(patch);
    Object.keys(patch).forEach((k) => {
      if (!LS_KEYS[k]) return;
      const v = patch[k];
      lsSet(LS_KEYS[k], typeof v === 'boolean' ? (v ? '1' : '0') : JSON.stringify(v || {}));
    });
  }
  /* run fn(board, doc) on the stored board; returns what C.mutate returns */
  function editBoard(C, ctx, boardId, fn, opts) {
    return C.mutate((D) => {
      const doc = D.docs[ctx.docKey];
      const b = boardById(doc, boardId);
      if (!b) return false;
      return fn(b, doc);
    }, opts);
  }

  /* --------------------------------------------- Done column: who and where */
  function viewer(C) {
    if (LIVE) { const v = C.viewer(); return v && v.email ? String(v.email).toLowerCase() : null; }   // the Hub sign-in
    const sim = C.state.sim || {};
    if (!sim.hub) return null;
    const now = C.now();
    /* the Hub's own session test, on the session the simulated Hub sign-in holds */
    return RD.hubSessionEmail({ email: String((C.D.me && C.D.me.email) || ''), expiresAt: now + 8 * 3600000 }, now);
  }
  function offline(C) { return !!(C.state.sim && C.state.sim.offline); }
  function server(C) { return (C.D.prefs && C.D.prefs.kbDone) || {}; }
  /* today's kbDoneMap(): signed out -> this browser; signed in -> the broker squared with this device's copy.
     Offline the pull fails, so this device's copy (or, the first time, this browser's choices) stands. */
  function doneMap(C) {
    const me = viewer(C);
    const anon = C.state.kb_anon || {};
    if (!me) return anon;
    const acct = (C.state.kb_acct || {})[me] || null;
    if (offline(C)) return acct ? acct.prefs || {} : anon;
    return RD.reconcileDone(server(C), acct, anon).prefs;
  }
  function donePrefs(C, boardId) {
    const p = doneMap(C)[boardId] || {};
    return { win: RD.normDoneWindow(p.win == null ? 'all' : p.win), style: p.style === 'compact' ? 'compact' : 'cards' };
  }
  /* deliver what this device owes the broker (pull + push in one go: the simulated broker answers at once).
     Live: PATCH /prefs/<email>; the boards stay pending on this device until the broker has them. */
  function push(C, acct) {
    const r = RD.reconcileDone(server(C), acct, C.state.kb_anon || {});
    const keys = Object.keys(r.push);
    if (LIVE) {
      if (!keys.length) return { prefs: r.prefs, pending: [] };
      const me = viewer(C);
      const kd = Object.assign({}, server(C));
      keys.forEach((k) => { if (r.push[k]) kd[k] = r.push[k]; else delete kd[k]; });
      C.D.prefs = { kbDone: kd };
      NET.pushPrefs(C, me, r.push).then((ok) => {
        if (!ok) return;
        const accts = Object.assign({}, C.state.kb_acct || {});
        const a = accts[me];
        if (!a) return;
        accts[me] = { prefs: a.prefs || {}, pending: (a.pending || []).filter((k) => keys.indexOf(String(k)) < 0) };
        keepView(C, { kb_acct: accts });
      });
      return { prefs: r.prefs, pending: keys };
    }
    if (keys.length) {
      C.mutate((D) => {
        D.prefs = D.prefs || {};
        const kd = Object.assign({}, D.prefs.kbDone || {});
        keys.forEach((k) => { if (r.push[k]) kd[k] = r.push[k]; else delete kd[k]; });
        D.prefs.kbDone = kd;
      }, { quiet: true, allowRo: true });
    }
    return { prefs: r.prefs, pending: [] };
  }
  /* coming back online, or seen signed in for the first time on this device: settle up */
  function flush(C) {
    const me = viewer(C);
    if (!me || offline(C)) return;
    const accts = C.state.kb_acct || {};
    const a = accts[me] || null;
    if (a && !a.first && !(a.pending || []).length) return;
    const next = Object.assign({}, accts);
    next[me] = push(C, a);
    keepView(C, { kb_acct: next });
  }
  function setDone(C, boardId, patch) {
    const me = viewer(C);
    const anon = C.state.kb_anon || {};
    if (!me) {   /* nobody signed in: this browser only, as today's rd_kb_done */
      const next = Object.assign({}, anon);
      next[boardId] = Object.assign({}, anon[boardId] || {}, patch);
      keepView(C, { kb_anon: next });
      return;
    }
    const cur = donePrefs(C, boardId);
    const accts = Object.assign({}, C.state.kb_acct || {});
    let a = accts[me];
    if (!a) {   /* changed before the broker ever answered: start from this browser's choices, stay "first" */
      a = { prefs: {}, pending: [], first: true };
      Object.keys(anon).forEach((k) => { const v = RD.doneVal(anon[k]); if (v) a.prefs[k] = v; });
    } else a = { prefs: Object.assign({}, a.prefs || {}), pending: (a.pending || []).slice(), first: !!a.first };
    if (!offline(C)) a.prefs = Object.assign({}, doneMap(C));
    const v = RD.doneVal(Object.assign({}, cur, patch));
    if (v) a.prefs[boardId] = v; else delete a.prefs[boardId];
    if (a.pending.indexOf(String(boardId)) < 0) a.pending.push(String(boardId));
    accts[me] = offline(C) ? a : push(C, a);
    keepView(C, { kb_acct: accts });
  }
  function doneNote(C) {
    if (!viewer(C)) return 'Saved in this browser only. Open this board from the Hub to keep it on every device.';
    if (offline(C)) return 'Saved on this device — couldn’t reach the server yet, so it will retry.';
    return 'Just for you — follows you to any device where you’re signed in to the Hub.';
  }
  function doneLabel(p) {
    return (p.win === 'all' ? 'All finished' : p.win === 'none' ? 'Count only' : 'Last ' + p.win + ' days') + (p.style === 'compact' ? ', compact' : '');
  }

  /* ----------------------------------------------------- tile presentation */
  const HEALTH = { 'on-track': ['ok', 'On track'], 'at-risk': ['warn', 'At risk'], breached: ['bad', 'Breached'] };
  /* the engine's note fragments ("over 14d in column · 12/14d · past deadline · 5d to deadline") in plain words */
  function noteWords(note) {
    return String(note || '').split(' · ').filter(Boolean).map((p) => {
      let m = /^over (\d+)d in column$/.exec(p);
      if (m) return 'Over the ' + m[1] + '-day stage limit';
      m = /^(\d+)\/(\d+)d$/.exec(p);
      if (m) return m[1] + ' of ' + m[2] + ' days used';
      if (p === 'past deadline') return 'Past the swimlane deadline';
      m = /^(\d+)d to deadline$/.exec(p);
      if (m) return m[1] === '0' ? 'Swimlane deadline is today' : plural(Number(m[1]), 'day') + ' to the swimlane deadline';
      return p;
    }).join('. ');
  }
  function doneWords(age, prefix) {
    if (age == null) return prefix ? 'Done' : '';
    const w = age === 0 ? 'today' : age === 1 ? 'yesterday' : age + ' days ago';
    return prefix ? 'Done ' + w : F.cap(w);
  }
  function lateCount(board, t, upTo, tIso) {
    let n = 0;
    for (let k = 0; k < upTo; k++) if (RD.gateTileState(board, t, k, tIso) === 'passed-late') n++;
    return n;
  }

  /* -------------------------------------------------------------- actions */
  function openTile(C, boardId, tileId, prefill) {
    const D = C.D;
    let t = null;
    Object.keys(D.docs || {}).some((k) => { const b = boardById(D.docs[k], boardId); if (b) { t = tileId ? (b.tiles || []).find((x) => x.id === tileId) || null : null; return true; } return false; });
    if (tileId && !t) return;
    const p = prefill || {};
    const d = t
      ? { name: t.name || '', lane: t.lane || '', col: t.col || '', start: t.startDate || '', entered: t.enteredCol || '', asg: t.assignee ? String(t.assignee) : '' }
      : { name: '', lane: p.lane || '', col: p.col || '', start: '', entered: '', asg: '' };
    C.openSheet('kb.tile', { boardId: boardId, tileId: tileId || '', lane: p.lane || '', col: p.col || '' }, d);
  }
  function addBoard(C, ctx) {
    if (!C.guard()) return;
    let made = '';
    const ok = C.mutate((D) => {
      const doc = D.docs[ctx.docKey];
      const taken = allIds(doc);
      const id = newId(C, 'BRD', taken);
      const c1 = newId(C, 'col', taken), c2 = newId(C, 'col', taken), c3 = newId(C, 'col', taken);
      const lane = newId(C, 'lane', taken);
      const b = {
        id: id, objectiveId: ctx.objId, name: 'Board ' + (boardsFor(doc, ctx.objId).length + 1),
        columns: [{ id: c1, name: 'Prospect', gate_id: id + '/' + c1 }, { id: c2, name: 'Working', gate_id: id + '/' + c2 }, { id: c3, name: 'Closed', gate_id: id + '/' + c3 }],
        swimlanes: [{ id: lane, name: 'Standard', maxDaysPerCol: 14, deadline: '' }],
        tiles: []
      };
      (doc.boards = doc.boards || []).push(b);
      made = id;
    }, { msg: 'Board added.' });
    if (ok) C.setState({ kb_sel: made, menu: '' });
  }
  function deleteBoard(C, ctx, b) {
    if (!C.guard()) return;
    const nc = (b.columns || []).length, nl = (b.swimlanes || []).length, nt = (b.tiles || []).length;
    C.confirm({
      title: 'Delete the board “' + boardName(b) + '”?',
      body: 'Its ' + plural(nc, 'stage') + ', ' + plural(nl, 'swimlane') + ' and ' + plural(nt, 'tile') + ' are deleted for everyone. Scores are not affected.',
      ok: 'Delete board', danger: true,
      onOk: () => {
        const ok = C.mutate((D) => {
          const doc = D.docs[ctx.docKey];
          const before = (doc.boards || []).length;
          doc.boards = (doc.boards || []).filter((x) => x.id !== b.id);
          if (doc.boards.length === before) return false;
        }, { msg: 'Board deleted.' });
        if (ok) {
          const sh = C.sheetOf('kb');
          C.setState({ kb_sel: '', sheets: sh && sh.data && sh.data.boardId === b.id ? [] : C.state.sheets });
        }
      }
    });
  }
  function dragId(C, e) {
    let id = C._kbDrag || C.state.kb_drag || '';
    if (!id) { try { id = e && e.dataTransfer ? e.dataTransfer.getData('text/plain') : ''; } catch (x) { id = ''; } }
    return id || '';
  }
  function dragStart(C, e, id) {
    try { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* not a real drag */ }
    C._kbDrag = id;
    C.setState({ kb_drag: id, menu: '' });
  }
  function dragEnd(C) {
    C._kbDrag = '';
    if (C.state.kb_drag || C.state.kb_hot) C.setState({ kb_drag: '', kb_hot: '' });
  }
  function dragOver(C, e, key) {
    if (e && e.preventDefault) e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch (x) { /* not a real drag */ }
    if (C.state.kb_hot !== key) C.setState({ kb_hot: key });
  }
  /* onto a cell: RD.dropTile (column change restarts the clock and re-stamps gates; lane change re-parents the rules) */
  function dropCell(C, ctx, boardId, laneId, colId, e) {
    if (e && e.preventDefault) e.preventDefault();
    const id = dragId(C, e);
    dragEnd(C);
    if (!id) return;
    const b0 = boardById(ctx.doc, boardId);
    const t0 = b0 ? (b0.tiles || []).find((x) => x.id === id) : null;
    if (!b0 || !t0) return;
    if (t0.col === colId && t0.lane === laneId) return;
    const cols = b0.columns || [];
    const col = cols.find((c) => c.id === colId);
    const lane = (b0.swimlanes || []).find((l) => l.id === laneId);
    const lastId = cols.length ? cols[cols.length - 1].id : null;
    const colMoved = t0.col !== colId, laneMoved = t0.lane !== laneId;
    let msg;
    if (RD.tileInBacklog(t0)) msg = 'Started in ' + stageName(col) + '. Its stage clock starts today.';
    else if (colMoved && colId === lastId) msg = 'Moved to ' + stageName(col) + '. It counts as done from today.';
    else if (colMoved) msg = 'Moved to ' + stageName(col) + (laneMoved ? ' in ' + laneName(lane) : '') + '. Its stage clock restarts today.';
    else msg = 'Moved to the ' + laneName(lane) + ' swimlane. Its rules apply now.';
    const tIso = todayIso(ctx);
    C.mutate((D) => {
      const doc = D.docs[ctx.docKey];
      const i = K.idx(doc.boards || [], (x) => x.id === boardId);
      if (i < 0) return false;
      if (!(doc.boards[i].tiles || []).some((x) => x.id === id)) return false;
      doc.boards[i] = RD.dropTile(doc.boards[i], id, colId, laneId, tIso);
    }, { msg: msg });
  }
  /* into the backlog: column and clock cleared, lane set to the group (none for Unassigned) */
  function dropBacklog(C, ctx, boardId, laneId, e) {
    if (e && e.preventDefault) e.preventDefault();
    const id = dragId(C, e);
    dragEnd(C);
    if (!id) return;
    const b0 = boardById(ctx.doc, boardId);
    const t0 = b0 ? (b0.tiles || []).find((x) => x.id === id) : null;
    if (!b0 || !t0) return;
    const want = laneId || null;
    if (RD.tileInBacklog(t0) && (t0.lane || null) === want && !t0.col) return;
    const lane = want ? (b0.swimlanes || []).find((l) => l.id === want) : null;
    C.mutate((D) => {
      const b = boardById(D.docs[ctx.docKey], boardId);
      const t = b ? (b.tiles || []).find((x) => x.id === id) : null;
      if (!t) return false;
      t.col = null;
      t.enteredCol = null;
      t.lane = want;
    }, { msg: 'Parked in the backlog' + (lane ? ' under ' + laneName(lane) : ' with no swimlane') + '. Its clock is stopped.' });
  }

  /* ------------------------------------------------------------ board VM */
  function boardVM(C, ctx, boards, board) {
    const S = C.state;
    const ro = C.isRo();
    const tIso = todayIso(ctx);
    const out = {
      noBoards: !boards.length,
      hasBoard: !!board,
      boards: boards.map((b) => ({ name: boardName(b), on: !!board && b.id === board.id, pick: () => C.setState({ kb_sel: b.id, menu: '' }) }))
    };
    if (!board) return out;
    const cols = board.columns || [], lanes = board.swimlanes || [], tiles = board.tiles || [];
    const lastId = cols.length ? cols[cols.length - 1].id : null;
    const colIdx = {}; cols.forEach((c, i) => { colIdx[c.id] = i; });
    const laneById = {}; lanes.forEach((l) => { laneById[l.id] = l; });
    const sum = RD.boardSummary(board, tIso);
    const dp = donePrefs(C, board.id);
    const dsplit = RD.doneSplit(board, dp.win, tIso);
    const dFiltered = dp.win !== 'all';
    const dSort = dFiltered || dp.style === 'compact';
    const editable = !ro;

    function tileVM(t, where) {
      const e = t.assignee ? String(t.assignee) : '';
      const base = {
        id: t.id, k: 'kb-tile:' + t.id, name: t.name || '(tile)',
        av: e ? initials(e) : '—',
        avCls: 'avatar xs kb-av' + (e ? '' : ' none'),
        avTitle: e ? 'Assigned to ' + personName(e) : 'Unassigned',
        drag: editable,
        start: editable ? (ev) => dragStart(C, ev, t.id) : null,
        open: () => openTile(C, board.id, t.id),
        row: false, card: true, when: '',
        hasDays: false, days: '', hasNote: false, note: '', noteCls: 'sub', hasGate: false, gate: '', gateCls: 'sub', hasLate: false, late: ''
      };
      /* a tile opened from the Overview's review table stays highlighted for a moment and takes focus */
      const lift = (S.kb_drag === t.id ? ' lift' : '') + (S.kb_focus && S.kb_focus === t.id ? ' is-focus' : '');
      base.focus = !!S.kb_focus && S.kb_focus === t.id;
      if (where === 'park') {
        return Object.assign(base, {
          cls: 'kb-tile kb-park' + lift,
          stCls: 'st t-none', st: (t.lane == null || t.lane === '') ? 'No swimlane yet' : 'Awaiting start'
        });
      }
      if (where === 'done') {
        const age = RD.doneTileAge(t, tIso);
        const late = lateCount(board, t, colIdx[t.col] || 0, tIso);
        return Object.assign(base, {
          cls: (dp.style === 'compact' ? 'kb-drow' : 'kb-tile kb-done') + lift,
          row: dp.style === 'compact', card: dp.style !== 'compact',
          stCls: 'st t-info', st: doneWords(age, true), when: doneWords(age, false),
          hasLate: late > 0, late: late ? plural(late, 'gate') + ' passed late' : ''
        });
      }
      const h = RD.tileHealth(t, laneById[t.lane], tIso);
      const tone = HEALTH[h.status] || HEALTH['on-track'];
      const ci = colIdx[t.col];
      const dueIso = ci == null ? '' : (RD.gateDueDates(cols, laneById[t.lane], t).due[ci] || '');
      const gst = ci == null ? 'pending' : RD.gateTileState(board, t, ci, tIso);
      const late = ci == null ? 0 : lateCount(board, t, ci, tIso);
      return Object.assign(base, {
        cls: 'kb-tile kb-' + tone[0] + lift,
        stCls: 'st t-' + tone[0], st: tone[1],
        hasDays: true, days: plural(h.daysInCol, 'day') + ' in stage',
        hasNote: !!h.note, note: noteWords(h.note), noteCls: tone[0] === 'bad' ? 'small tx-bad' : tone[0] === 'warn' ? 'small tx-warn' : 'sub',
        hasGate: !!dueIso, gate: dueIso ? (gst === 'overdue' ? 'Stage overdue, was due ' + dueText(dueIso, ctx) : 'Stage due ' + dueText(dueIso, ctx)) : '',
        gateCls: gst === 'overdue' ? 'small tx-bad' : 'sub',
        hasLate: late > 0, late: late ? plural(late, 'gate') + ' passed late' : ''
      });
    }

    /* column heads; the last column is the Done column with this viewer's menu */
    out.heads = cols.map((c) => {
      const isDone = c.id === lastId;
      return {
        name: stageName(c), isDone: isDone,
        cls: 'kb-ch' + (isDone ? ' kb-ch-done' : ''),
        count: isDone && dFiltered ? dsplit.shown + ' of ' + dsplit.total : String(sum.perColumn[c.id] || 0)
      };
    });
    const N = Math.max(1, cols.length);
    out.gridStyle = 'grid-template-columns: 172px repeat(' + N + ', minmax(184px, 1fr)); min-width: ' + (172 + N * 184) + 'px';
    out.lanes = lanes.map((l) => {
      const max = Number(l.maxDaysPerCol) || 0;
      const rule = (max ? plural(max, 'day') + ' per stage' : 'No stage limit') + (l.deadline ? ', due ' + dayText(l.deadline, ctx) : '');
      return {
        id: l.id, name: laneName(l), rule: rule,
        addLabel: 'Add tile to ' + laneName(l),
        add: () => openTile(C, board.id, null, { lane: l.id, col: cols[0] ? cols[0].id : '' }),
        cells: cols.map((c) => {
          const key = l.id + '|' + c.id;
          const isDone = c.id === lastId;
          let list = [], hasOlder = false, olderText = '', olderOpen = false, toggleOlder = null;
          if (isDone) {
            const g = dsplit.byLane[l.id] || { shown: [], older: [] };
            const okey = board.id + ':' + l.id;
            olderOpen = !!(S.kb_older || {})[okey];
            const shown = dSort ? RD.doneByRecency(g.shown, tIso) : g.shown;
            const older = olderOpen ? (dSort ? RD.doneByRecency(g.older, tIso) : g.older) : [];
            list = shown.concat(older).map((t) => tileVM(t, 'done'));
            hasOlder = g.older.length > 0;
            olderText = olderOpen ? (dp.win === 'none' ? 'Hide' : 'Hide older') : (dp.win === 'none' ? g.older.length + ' done' : '+' + g.older.length + ' older');
            toggleOlder = () => { const o = Object.assign({}, C.state.kb_older || {}); if (o[okey]) delete o[okey]; else o[okey] = true; C.setState({ kb_older: o }); };
          } else {
            list = tiles.filter((t) => t.lane === l.id && t.col === c.id).map((t) => tileVM(t, 'grid'));
          }
          return {
            k: 'kb-cell:' + l.id + ':' + c.id,
            cls: 'kb-cell dz' + (isDone ? ' kb-cell-done' : '') + (S.kb_hot === key ? ' hot' : ''),
            tiles: list,
            empty: !list.length && !hasOlder,
            over: editable ? (e) => dragOver(C, e, key) : null,
            drop: editable ? (e) => dropCell(C, ctx, board.id, l.id, c.id, e) : null,
            hasOlder: hasOlder, olderText: olderText, olderOpen: olderOpen, toggleOlder: toggleOlder
          };
        })
      };
    });

    /* summary: RD.boardSummary (counts) and RD.boardGateSummary (one gate per column before the done column) */
    out.sum = [
      { cls: 'st t-ok', text: sum.onTrack + ' on track' },
      { cls: 'st t-warn', text: sum.atRisk + ' at risk' },
      { cls: 'st t-bad', text: sum.breached + ' breached' },
      { cls: 'st t-info', text: sum.closed + ' closed' }
    ];
    out.total = plural(sum.total, 'tile') + ' in total';
    out.hasBacklogSum = sum.backlog > 0;
    out.backlogSum = sum.backlog + ' in the backlog';
    const WORST = { red: ['bad', 'Overdue'], orange: ['warn', 'Passed late'], green: ['ok', 'All passed'], none: ['none', 'Open'] };
    out.gsum = cols.slice(0, Math.max(0, cols.length - 1)).map((c, k) => {
      const g = RD.boardGateSummary(board, k, tIso);
      let overdue = 0, late = 0, latest = '';
      tiles.forEach((t) => {
        const st = RD.gateTileState(board, t, k, tIso);
        if (st === 'overdue') overdue++;
        if (st === 'passed-late') late++;
        const due = RD.gateDueDates(cols, laneById[t.lane], t).due[k];
        if (due && (!latest || due > latest)) latest = due;
      });
      const w = WORST[g.worst] || WORST.none;
      const bits = [g.passed + ' of ' + g.total + ' passed'];
      if (overdue) bits.push(overdue + ' overdue');
      if (late) bits.push(late + ' late');
      if (latest) bits.push('all due by ' + dayText(latest, ctx));
      return { name: stageName(c), cls: 'st t-' + w[0], word: w[1], text: bits.join(', ') };
    });
    out.hasGsum = out.gsum.length > 0;

    /* Done-column menu (a view, allowed in read-only) */
    const lastCol = cols.length ? cols[cols.length - 1] : null;
    out.done = {
      open: C.isMenu('kb.done'),
      toggle: () => { flush(C); C.toggleMenu('kb.done'); },
      close: () => C.closeMenus(),
      onKey: (e) => { if (e && e.key === 'Escape') C.closeMenus(); },
      label: doneLabel(dp),
      aria: 'Finished tiles in ' + (lastCol ? stageName(lastCol) : 'the last column'),
      wins: WINDOWS.map((w) => ({ label: w[1], on: String(dp.win) === String(w[0]), pick: () => setDone(C, board.id, { win: RD.normDoneWindow(w[0]) }) })),
      styles: STYLES.map((w) => ({ label: w[1], on: dp.style === w[0], pick: () => setDone(C, board.id, { style: w[0] === 'compact' ? 'compact' : 'cards' }) })),
      note: doneNote(C) + ' Hidden tiles still count in “closed”.'
    };

    /* backlog: RD.backlogByLane (every lane, then Unassigned) */
    const groups = RD.backlogByLane(board);
    const parked = groups.reduce((n, g) => n + g.tiles.length, 0);
    const blOpen = S.kb_bl !== false;
    out.bl = {
      open: blOpen,
      toggle: () => keepView(C, { kb_bl: !(C.state.kb_bl !== false) }),
      togTitle: (blOpen ? 'Collapse' : 'Expand') + ' the backlog',
      chev: 'transition: transform .15s ease; transform: rotate(' + (blOpen ? 90 : 0) + 'deg)',
      count: String(parked),
      note: blOpen ? 'Not started, no clock running' : (parked ? parked + ' parked, no clock running' : 'Empty'),
      add: () => openTile(C, board.id, null, { lane: '', col: '' }),
      groups: groups.map((g) => {
        const key = 'bl|' + (g.unassigned ? '' : g.laneId);
        const max = g.lane ? Number(g.lane.maxDaysPerCol) || 0 : 0;
        return {
          name: g.unassigned ? 'Unassigned' : laneName(g.lane),
          lim: g.unassigned ? 'Swimlane chosen at start' : (max ? 'Will use ' + plural(max, 'day') + ' per stage' : 'No stage limit'),
          k: 'kb-bl:' + (g.unassigned ? 'none' : g.laneId),
          cls: 'kb-bldrop dz' + (S.kb_hot === key ? ' hot' : ''),
          addLabel: g.unassigned ? 'Add tile to the backlog with no swimlane' : 'Add tile to the backlog under ' + laneName(g.lane),
          add: () => openTile(C, board.id, null, { lane: g.unassigned ? '' : g.laneId, col: '' }),
          tiles: g.tiles.map((t) => tileVM(t, 'park')),
          empty: !g.tiles.length,
          /* read-only: nothing can be dragged, so the drop hints say what is there instead */
          emptyText: !editable ? 'Nothing parked here.' : g.unassigned ? 'Drag a tile here to leave its swimlane open.' : 'Drag a tile here to put it in this swimlane.',
          over: editable ? (e) => dragOver(C, e, key) : null,
          drop: editable ? (e) => dropBacklog(C, ctx, board.id, g.unassigned ? '' : g.laneId, e) : null
        };
      })
    };

    out.addTile = () => openTile(C, board.id, null, { lane: '', col: '' });
    out.configure = () => C.openSheet('kb.config', { boardId: board.id }, { f: {} });
    out.delBoard = () => deleteBoard(C, ctx, board);
    return out;
  }

  /* ------------------------------------------------------------ tile sheet */
  function allEmails(C, ctx) {
    const out = (((C.D.roster && C.D.roster.users) || []).filter((u) => u && u.email && !u.disabled)).map((u) => u.email);
    ((ctx.P && ctx.P.objectives) || []).forEach((o) => RD.ownersOf(o).forEach((e) => { if (out.indexOf(e) < 0) out.push(e); }));
    return out;
  }
  function tileSheetVM(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'kb.tile') return null;
    const ro = C.isRo();
    const board = boardById(ctx.doc, sh.data.boardId);
    const isNew = !sh.data.tileId;
    const t = board && !isNew ? (board.tiles || []).find((x) => x.id === sh.data.tileId) || null : null;
    const ok = !!board && (isNew || !!t);
    const d = sh.d || {};
    const vm = {
      ok: ok, missing: !ok, ro: ro,
      title: isNew ? 'Add tile' : ro ? (t ? t.name || '(tile)' : 'Tile') : 'Edit tile',
      sub: board ? 'On ' + boardName(board) : '',
      canSave: ok && !ro, saveText: isNew ? 'Add tile' : 'Save tile',
      canDelete: ok && !ro && !isNew, cancelText: ro ? 'Close' : 'Cancel',
      hasState: false, stCls: '', st: '', stSub: '',
      hasGates: false, gates: [], parkHint: false
    };
    if (!ok) return vm;
    const tIso = todayIso(ctx);
    const cols = board.columns || [], lanes = board.swimlanes || [];
    const lastId = cols.length ? cols[cols.length - 1].id : null;
    vm.name = d.name == null ? '' : String(d.name);
    vm.lane = d.lane == null ? '' : String(d.lane);
    vm.col = d.col == null ? '' : String(d.col);
    vm.start = d.start == null ? '' : String(d.start);
    vm.entered = d.entered == null ? '' : String(d.entered);
    vm.lanes = [{ v: '', label: 'Unassigned (backlog)' }].concat(lanes.map((l) => ({ v: l.id, label: laneName(l) })));
    vm.cols = [{ v: '', label: 'Backlog (not started)' }].concat(cols.map((c) => ({ v: c.id, label: stageName(c) })));
    vm.parkHint = !vm.lane && !!vm.col;
    vm.onName = C.bindDraft('name');
    vm.onLane = C.bindDraft('lane');
    vm.onCol = C.bindDraft('col');
    vm.onStart = C.bindDraft('start');
    vm.onEntered = C.bindDraft('entered');
    /* Enter saves; Escape closes here (preventDefault tells the shell's sheet handler it is dealt with) */
    vm.onKey = (e) => {
      if (!e) return;
      if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); save(); }
      else if (e.key === 'Escape') C.dismissSheet(e);
    };

    /* who: RD.assigneeOptions over the roster (disabled people left out) plus every objective owner */
    const all = allEmails(C, ctx);
    const narrow = C.state.kb_narrow !== false;
    const asg = d.asg ? String(d.asg) : '';
    const rows = RD.assigneeOptions({
      portfolio: ctx.P, divisionId: ctx.divId, todayDay: ctx.today,
      objectiveState: (ctx.doc && ctx.doc.objectiveState) || [], allEmails: all,
      narrow: narrow, current: asg || null
    });
    vm.narrow = narrow;
    vm.toggleNarrow = (e) => keepView(C, { kb_narrow: !!(e && e.target ? e.target.checked : !(C.state.kb_narrow !== false)) });
    vm.people = rows.map((r) => ({
      k: 'kb-asg:' + r.email,
      name: personName(r.email), email: r.email, hasEmail: personName(r.email) !== r.email,
      ini: initials(r.email),
      why: r.isOwner ? 'Owns ' + plural(r.owns, 'active objective') : (r.current ? 'Assigned, but owns nothing active here' : 'No active objective here'),
      on: asg === r.email,
      cls: 'kb-asg' + (asg === r.email ? ' on' : ''),
      pick: () => C.setDraft({ asg: r.email })
    }));
    vm.noneOn = !asg;
    vm.noneCls = 'kb-asg' + (!asg ? ' on' : '');
    vm.pickNone = () => C.setDraft({ asg: '' });
    vm.peopleHint = narrow ? 'Showing ' + rows.length + ' of ' + all.length + ' people, those owning an active objective in this division.' : 'Showing everyone known.';

    /* where the stored tile stands now, and each of its stage-gates (RD.gateDueDates / RD.gateTileState) */
    if (t) {
      const laneById = {}; lanes.forEach((l) => { laneById[l.id] = l; });
      if (RD.tileInBacklog(t)) { vm.hasState = true; vm.stCls = 'st t-none'; vm.st = (t.lane ? 'Awaiting start' : 'No swimlane yet'); vm.stSub = 'In the backlog, no clock running'; }
      else if (t.col === lastId) { const age = RD.doneTileAge(t, tIso); vm.hasState = true; vm.stCls = 'st t-info'; vm.st = doneWords(age, true); vm.stSub = 'In ' + stageName(cols[cols.length - 1]) + ', the done column'; }
      else {
        const h = RD.tileHealth(t, laneById[t.lane], tIso);
        const tone = HEALTH[h.status] || HEALTH['on-track'];
        vm.hasState = true; vm.stCls = 'st t-' + tone[0]; vm.st = tone[1];
        vm.stSub = plural(h.daysInCol, 'day') + ' in ' + stageName(cols.find((c) => c.id === t.col)) + (h.note ? '. ' + noteWords(h.note) : '');
      }
      const due = RD.gateDueDates(cols, laneById[t.lane], t).due;
      const STATE = { 'passed-ontime': ['ok', 'Passed'], 'passed-late': ['warn', 'Passed late'], overdue: ['bad', 'Overdue'], pending: ['none', 'Not yet'] };
      vm.gates = cols.map((c, k) => {
        const st = RD.gateTileState(board, t, k, tIso);
        const w = STATE[st] || STATE.pending;
        const crossed = (t.gatePassed || {})[c.id];
        return {
          name: stageName(c),
          due: due[k] ? dayText(due[k], ctx) : 'No due date',
          cls: 'st t-' + w[0], word: w[1],
          when: (st === 'passed-ontime' || st === 'passed-late') && crossed ? 'on ' + dayText(crossed, ctx) : ''
        };
      });
      vm.hasGates = vm.gates.length > 0;
    }

    function save() {
      if (C.isRo()) { C.guard(); return; }
      const dd = C.draft() || {};
      const nm = String(dd.name == null ? '' : dd.name).trim();
      if (!nm) { C.sheetErr('A tile needs a name.'); return; }
      const st = String(dd.start || '').trim(), en = String(dd.entered || '').trim();
      if (!validIso(st) || !validIso(en)) { C.sheetErr('Use a real date, like 2026-10-13.'); return; }
      const ok2 = C.mutate((D) => {
        const b = boardById(D.docs[ctx.docKey], board.id);
        if (!b) return false;
        const tile = isNew
          ? { id: newId(C, 'tile', allIds(D.docs[ctx.docKey])), name: '', lane: sh.data.lane || null, col: sh.data.col || null, startDate: null, enteredCol: null }
          : (b.tiles || []).find((x) => x.id === t.id);
        if (!tile) return false;
        /* today's save rules (L5068-5094), unchanged */
        const newCol = dd.col || null;
        const moved = newCol !== (tile.col || null);
        tile.name = nm;
        tile.lane = dd.lane || null;
        tile.col = tile.lane ? newCol : null;              /* no swimlane parks the tile */
        tile.startDate = st || tile.startDate || null;
        if (dd.asg) tile.assignee = String(dd.asg); else delete tile.assignee;
        if (en && en !== tile.enteredCol) tile.enteredCol = en;
        else if (moved) tile.enteredCol = tile.col ? tIso : null;
        if (!tile.col) tile.enteredCol = null;             /* parked means no clock, however it got parked */
        if (isNew && tile.col && tile.enteredCol == null) tile.enteredCol = tIso;
        if (isNew) (b.tiles = b.tiles || []).push(tile);
      }, { msg: isNew ? 'Tile added.' : 'Tile saved.' });
      if (ok2) C.closeSheet();
    }
    vm.save = save;
    vm.del = () => {
      if (!C.guard()) return;
      C.confirm({
        title: 'Delete the tile “' + (t.name || '(tile)') + '”?',
        body: 'It is removed from ' + boardName(board) + ' for everyone, with its stage dates.',
        ok: 'Delete tile', danger: true,
        onOk: () => {
          const ok2 = editBoard(C, ctx, board.id, (b) => {
            const before = (b.tiles || []).length;
            b.tiles = (b.tiles || []).filter((x) => x.id !== t.id);
            if (b.tiles.length === before) return false;
          }, { msg: 'Tile deleted.' });
          if (ok2 && C.sheetOf('kb')) C.closeSheet();
        }
      });
    };
    return vm;
  }

  /* ---------------------------------------------------------- config sheet */
  function cfgSheetVM(C, ctx) {
    const sh = C.sheet();
    if (!sh || sh.kind !== 'kb.config') return null;
    const ro = C.isRo();
    const board = boardById(ctx.doc, sh.data.boardId);
    const vm = { ok: !!board, missing: !board, ro: ro, sub: board ? boardName(board) : '', canDelete: !!board && !ro };
    if (!board) return vm;
    const f = (sh.d && sh.d.f) || {};
    const cols = board.columns || [], lanes = board.swimlanes || [], tiles = board.tiles || [];
    const val = (key, stored) => (Object.prototype.hasOwnProperty.call(f, key) ? String(f[key]) : stored);
    const edit = (key) => (e) => { const cur = (C.draft() || {}).f || {}; C.setDraft({ f: Object.assign({}, cur, { [key]: e && e.target ? e.target.value : e }) }); };
    const drop = (key) => { const cur = Object.assign({}, (C.draft() || {}).f || {}); delete cur[key]; C.setDraft({ f: cur }); };
    /* Escape puts the field back and keeps the sheet open (preventDefault: the shell would close it) */
    const keyer = (key) => (e) => {
      if (!e) return;
      if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); commit(key); }
      else if (e.key === 'Escape') { if (e.preventDefault) e.preventDefault(); drop(key); }
    };
    /* apply one edited field to the stored board: Enter or leaving the field saves it, Escape puts it back */
    function commit(key) {
      const cur = (C.draft() || {}).f || {};
      if (!Object.prototype.hasOwnProperty.call(cur, key)) return;
      const raw = String(cur[key] == null ? '' : cur[key]);
      const i = key.indexOf(':');
      const kind = i < 0 ? key : key.slice(0, i), id = i < 0 ? '' : key.slice(i + 1);
      const v = raw.trim();
      let fn = null;
      if (kind === 'name') {
        if (!v) { C.sheetErr('A board needs a name.'); return; }
        fn = (b) => { if (b.name === v) return false; b.name = v; };
      } else if (kind === 'col') {
        if (!v) { C.sheetErr('A stage needs a name.'); return; }
        fn = (b) => { const c = (b.columns || []).find((x) => x.id === id); if (!c || c.name === v) return false; c.name = v; };
      } else if (kind === 'lname') {
        if (!v) { C.sheetErr('A swimlane needs a name.'); return; }
        fn = (b) => { const l = (b.swimlanes || []).find((x) => x.id === id); if (!l || l.name === v) return false; l.name = v; };
      } else if (kind === 'lmax') {
        const n = v === '' ? 0 : K.num(v);
        if (n == null || n < 0) { C.sheetErr('Use a number of days, like 14. Leave it blank for no limit.'); return; }
        fn = (b) => { const l = (b.swimlanes || []).find((x) => x.id === id); if (!l || (Number(l.maxDaysPerCol) || 0) === n) return false; l.maxDaysPerCol = n; };
      }
      if (fn) editBoard(C, ctx, board.id, fn);
      drop(key);
    }
    vm.name = val('name', board.name || '');
    vm.onName = edit('name');
    vm.keyName = keyer('name');
    vm.blurName = () => commit('name');
    vm.cols = cols.map((c, i) => {
      const n = tiles.filter((t) => t.col === c.id).length;
      const isLast = i === cols.length - 1;
      return {
        k: 'kb-cfg-col:' + c.id,
        name: val('col:' + c.id, c.name || ''),
        aria: 'Stage ' + (i + 1) + ' name',
        meta: (isLast ? 'Done column, ' : '') + plural(n, 'tile'),
        on: edit('col:' + c.id), key: keyer('col:' + c.id), blur: () => commit('col:' + c.id),
        upLabel: 'Move ' + stageName(c) + ' earlier', downLabel: 'Move ' + stageName(c) + ' later',
        upDis: ro || i === 0, downDis: ro || isLast,
        up: () => moveCol(i, i - 1), down: () => moveCol(i, i + 1),
        canDel: !ro && cols.length > 1, delLabel: 'Delete stage ' + stageName(c),
        del: () => delCol(c, n, isLast)
      };
    });
    vm.lanes = lanes.map((l, i) => {
      const inLane = tiles.filter((t) => t.lane === l.id);
      return {
        k: 'kb-cfg-lane:' + l.id,
        name: val('lname:' + l.id, l.name || ''),
        max: val('lmax:' + l.id, l.maxDaysPerCol ? String(l.maxDaysPerCol) : ''),
        due: l.deadline || '',
        nameAria: 'Swimlane ' + (i + 1) + ' name', maxAria: 'Max days per stage for ' + laneName(l), dueAria: 'Deadline for ' + laneName(l),
        meta: plural(inLane.length, 'tile'),
        onName: edit('lname:' + l.id), keyName: keyer('lname:' + l.id), blurName: () => commit('lname:' + l.id),
        onMax: edit('lmax:' + l.id), keyMax: keyer('lmax:' + l.id), blurMax: () => commit('lmax:' + l.id),
        onDue: (e) => {
          const v = String(e && e.target ? e.target.value : '').trim();
          if (!validIso(v)) { C.sheetErr('Use a real date, like 2026-12-18, or clear it for no deadline.'); return; }
          editBoard(C, ctx, board.id, (b) => { const x = (b.swimlanes || []).find((y) => y.id === l.id); if (!x || (x.deadline || '') === v) return false; x.deadline = v; });
        },
        upLabel: 'Move ' + laneName(l) + ' up', downLabel: 'Move ' + laneName(l) + ' down',
        upDis: ro || i === 0, downDis: ro || i === lanes.length - 1,
        up: () => moveLane(i, i - 1), down: () => moveLane(i, i + 1),
        canDel: !ro && lanes.length > 1, delLabel: 'Delete swimlane ' + laneName(l),
        del: () => delLane(l, inLane)
      };
    });
    function moveCol(from, to) {
      editBoard(C, ctx, board.id, (b) => { if (to < 0 || to >= (b.columns || []).length) return false; b.columns = K.move(b.columns, from, to); });
    }
    function moveLane(from, to) {
      editBoard(C, ctx, board.id, (b) => { if (to < 0 || to >= (b.swimlanes || []).length) return false; b.swimlanes = K.move(b.swimlanes, from, to); });
    }
    function delCol(c, n, isLast) {
      if (!C.guard()) return;
      const prev = isLast && cols.length > 1 ? cols[cols.length - 2] : null;
      C.confirm({
        title: 'Delete the stage “' + stageName(c) + '”?',
        body: (n ? 'Its ' + plural(n, 'tile') + (n === 1 ? ' is' : ' are') + ' deleted with it, for everyone.' : 'No tiles are in this stage.') + (prev ? ' “' + stageName(prev) + '” becomes the done column.' : ''),
        ok: 'Delete stage', danger: true,
        onOk: () => editBoard(C, ctx, board.id, (b) => {
          if ((b.columns || []).length <= 1 || !(b.columns || []).some((x) => x.id === c.id)) return false;
          b.columns = b.columns.filter((x) => x.id !== c.id);
          b.tiles = (b.tiles || []).filter((t) => t.col !== c.id);
        }, { msg: n ? 'Stage deleted with ' + plural(n, 'tile') + '.' : 'Stage deleted.' })
      });
    }
    function delLane(l, inLane) {
      if (!C.guard()) return;
      const n = inLane.length;
      const parked = inLane.filter((t) => RD.tileInBacklog(t)).length;
      C.confirm({
        title: 'Delete the swimlane “' + laneName(l) + '”?',
        body: n ? 'Its ' + plural(n, 'tile') + (n === 1 ? ' is' : ' are') + ' deleted with it, for everyone' + (parked ? ', including ' + parked + ' waiting in the backlog' : '') + '.' : 'No tiles are in this swimlane.',
        ok: 'Delete swimlane', danger: true,
        onOk: () => editBoard(C, ctx, board.id, (b) => {
          if ((b.swimlanes || []).length <= 1 || !(b.swimlanes || []).some((x) => x.id === l.id)) return false;
          b.swimlanes = b.swimlanes.filter((x) => x.id !== l.id);
          b.tiles = (b.tiles || []).filter((t) => t.lane !== l.id);
        }, { msg: n ? 'Swimlane deleted with ' + plural(n, 'tile') + '.' : 'Swimlane deleted.' })
      });
    }
    vm.addCol = () => editBoard(C, ctx, board.id, (b, doc) => {
      const cid = newId(C, 'col', allIds(doc));
      b.columns = (b.columns || []).concat([{ id: cid, name: 'Stage ' + ((b.columns || []).length + 1), gate_id: b.id + '/' + cid }]);
    }, { msg: 'Stage added.' });
    vm.addLane = () => editBoard(C, ctx, board.id, (b, doc) => {
      const lid = newId(C, 'lane', allIds(doc));
      b.swimlanes = (b.swimlanes || []).concat([{ id: lid, name: 'Swimlane ' + ((b.swimlanes || []).length + 1), maxDaysPerCol: 14, deadline: '' }]);
    }, { msg: 'Swimlane added.' });
    vm.del = () => deleteBoard(C, ctx, board);
    return vm;
  }

  /* ------------------------------------------------------------------ VM */
  /* the boards are drawn while the Kanban tab is open on an objective */
  function kanbanOn(C, ctx) {
    return !!ctx.objId && ctx.tab === 'kanban';
  }
  function vm(C, ctx) {
    const doc = ctx.doc || {};
    const objId = ctx.objId || '';
    const ro = C.isRo();
    const on = kanbanOn(C, ctx);
    const boards = objId ? boardsFor(doc, objId) : [];
    const board = activeBoard(C, boards);
    const out = {
      on: on, ro: ro, edit: !ro,
      count: board ? (board.tiles || []).length : 0,
      hasBoard: !!board, noBoards: !boards.length,
      addBoard: () => addBoard(C, ctx),
      dragEnd: () => dragEnd(C),
      tile: tileSheetVM(C, ctx),
      cfg: cfgSheetVM(C, ctx)
    };
    if (on) Object.assign(out, boardVM(C, ctx, boards, board));
    return out;
  }

  function search(C, ctx, q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return [];
    const objs = {};
    (ctx.allObjs || []).forEach((o) => { objs[o.id] = o; });
    const out = [];
    ((ctx.doc && ctx.doc.boards) || []).forEach((b) => {
      if (!objs[b.objectiveId]) return;
      (b.tiles || []).forEach((t) => {
        if (String(t.name || '').toLowerCase().indexOf(s) < 0) return;
        const col = (b.columns || []).find((c) => c.id === t.col);
        out.push({
          label: t.name || '(tile)',
          sub: 'Tile on ' + boardName(b) + ', ' + (RD.tileInBacklog(t) || !col ? 'in the backlog' : stageName(col)),
          go: () => {
            /* the shell's own navigation keeps its filters honest; then the Kanban tab and the tile */
            if (typeof shellOpenObjective === 'function') shellOpenObjective(C, b.objectiveId);
            else C.setState({ objId: b.objectiveId });
            C.setState({ tab: 'kanban', kb_sel: b.id, menu: '' });
            openTile(C, b.id, t.id);
          }
        });
      });
    });
    return out.slice(0, 8);
  }

  function count(C, ctx) {
    const bs = boardsFor(ctx.doc, ctx.objId);
    const b = activeBoard(C, bs);
    return b ? (b.tiles || []).length : 0;
  }

  return { boardsFor: boardsFor, count: count, _vm: vm, _search: search, _initialView: initialView, liveSettle: flush };
})();

MODS.kb = {
  searchLabel: 'Kanban tiles',
  state: () => Object.assign({ kb_sel: '', kb_bl: true, kb_narrow: true, kb_older: {}, kb_anon: {}, kb_acct: {}, kb_drag: '', kb_hot: '', kb_focus: '' }, KB._initialView()),
  vm(C, ctx) { return KB._vm(C, ctx); },
  search(C, ctx, q) { return KB._search(C, ctx, q); }
};
