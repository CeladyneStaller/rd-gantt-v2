/* ============================================================================
   Current step (Experiments tab, top) — owner X-exp.
   Today: execution_app.template.html L1537-L2034 (current step, key-read table,
   statistical popover, logic-trees header and manager), L2036-L2454 (Connect
   data for an experiment), L2455-L2738 (outcome recorder); sales_app L1354-L1457.

   Execution: per-key-read table with a reading popover and batches, a live
   "Trending toward…" strip, Conclude… (disabled until every key read has its
   data), several logic trees per objective with a switcher and a manager.
   Connect data for an experiment is the KPI module's sheet in record mode
   (KPI.openConnect); unlinked imports come back here through applyLocal.
   Sales: cards list key reads with their targets and a "Record outcome" button
   on every card; one tree per objective.
   Trees, matching and edits come from the ETB namespace (mods/etb/mod.js).
   ========================================================================== */
const STEP = (function () {
  const EXEC = APP !== 'sales';
  const X = () => ETB.core;

  /* readings posted from the current step need unique ids even when two posts share a timestamp */
  function uniqRows(rows, existing) {
    const have = new Set((existing || []).map((u) => u.id));
    rows.forEach((r) => { let id = r.id, n = 2; while (have.has(id)) id = r.id + '-' + (n++); r.id = id; have.add(id); });
    return rows;
  }
  /* ---- the measurement stores (today's ETB.addKeyReadReads / noteMeasured / remove*) ---- */
  function addLocalReads(exp, krId, xs, batch) {
    const vals = []; (xs || []).forEach((x) => { const v = Number(x); if (isFinite(v)) vals.push(v); });
    if (!vals.length) return 0;
    const store = exp.key_read_readings || (exp.key_read_readings = {});
    const prev = Array.isArray(store[krId]) ? store[krId].slice() : [];
    store[krId] = prev.concat(batch ? vals.map((v) => ({ v: v, batch: batch })) : vals);
    if (exp.status === 'planned') exp.status = 'in_progress';
    X().markOverride(exp, 'key_read_readings');
    return vals.length;
  }
  function noteMeasured(exp) { if (exp && exp.status === 'planned') exp.status = 'in_progress'; }
  function liveExp(t, expId) { return t && t.experiments ? t.experiments[expId] : null; }
  function keyReadOf(exp, krId) { return ((exp && exp.key_reads) || []).find((k) => k.id === krId) || null; }
  function srcIdOf(C, ctx, k) { const kpi = ETB.krKpi(C, ctx, k); return kpi ? RD.readingSourceId(kpi, ETB.pool(C, ctx)) : k.source_kpi_gid; }
  function curBatch(C, ctx, exp, k) {
    try {
      if (k.source_kpi_gid) return RD.latestBatchId(RD.readingsFor(srcIdOf(C, ctx, k), ctx.em));
      return RD.latestEntryBatch(RD.readingEntries(((exp.key_read_readings) || {})[k.id]));
    } catch (e) { return ''; }
  }
  function connSamples(C, ctx, exp, k) {
    try { const r = RD.reconstructConnected([k], { index: C.D.analysis, kpis: ETB.pool(C, ctx), execDocs: ctx.em, experiment: exp }); return (r.byKeyRead && r.byKeyRead[k.id]) || []; } catch (e) { return []; }
  }
  /* post readings for one key read: linked -> kpiUpdates on its KPI, unlinked -> the experiment */
  function postReads(C, ctx, tid, expId, krId, xs, batch, msg) {
    let n = 0;
    ETB.edit(C, ctx, tid, (t, D) => {
      const exp = liveExp(t, expId); const k = keyReadOf(exp, krId); if (!k) return false;
      if (k.source_kpi_gid) {
        const doc = D.docs[ctx.docKey];
        if (!Array.isArray(doc.kpiUpdates)) doc.kpiUpdates = [];
        const rows = uniqRows(RD.buildStatReadings(k.source_kpi_gid, xs, { timestamp: C.now(), note: 'exp ' + (exp.code || exp.id) }), doc.kpiUpdates);
        rows.forEach((r) => { if (batch) r.batch = batch; doc.kpiUpdates.push(r); });
        n = rows.length; noteMeasured(exp);
      } else n = addLocalReads(exp, krId, xs, batch);
      if (!n) return false;
    });
    if (n) C.toast(msg(n), 'ok');
    return n;
  }

  /* ---------------------------------------------------------- awaiting / strip */
  function awaiting(C, ctx, exp, dc) {
    const nm = {}; (exp.key_reads || []).forEach((k) => { nm[k.id] = ETB.krName(C, ctx, k); });
    const bits = [];
    (dc.missing || []).forEach((id) => bits.push(nm[id] || id));
    (dc.short || []).forEach((id) => {
      const k = keyReadOf(exp, id); const c = k ? ETB.krCurrent(C, ctx, exp, k) : null;
      bits.push((nm[id] || id) + ((c && c.sample.expected) ? ' (' + c.n + ' of ' + c.sample.expected + ' reads)' : ''));
    });
    return bits;
  }
  function readingsNow(C, ctx, exp) { const o = {}; (exp.key_reads || []).forEach((k) => { const c = ETB.krCurrent(C, ctx, exp, k); if (c.value != null) o[k.id] = c.value; }); return o; }
  function strip(C, ctx, exp) {
    let dc = { complete: false, missing: [], short: [] };
    try { dc = RD.experimentDataComplete(exp, ETB.krCtx(C, ctx, exp)); } catch (e) { /* keep defaults */ }
    const m = X().etbMatchResults(exp, readingsNow(C, ctx, exp));
    const byId = {}; (exp.possible_results || []).forEach((r) => { byId[r.id] = r; });
    const aw = awaiting(C, ctx, exp, dc);
    let tone = 'none', head = 'Enter measured values to determine the result.', sub = '';
    if (m.matched.length === 1) { const r = byId[m.matched[0]] || {}; tone = 'ok'; head = 'Matched: ' + (r.label || m.matched[0]); sub = r.conclusion || ''; }
    else if (m.matched.length > 1) { tone = 'info'; head = 'Multiple results match'; sub = 'Conclude to pick one.'; }
    else if (dc.complete && (exp.key_reads || []).length) { tone = 'info'; head = 'No defined result matches'; sub = 'Conclude to record it manually.'; }
    else if (m.provisional.length === 1) { const p = byId[m.provisional[0]] || {}; tone = 'warn'; head = 'Trending toward: ' + (p.label || m.provisional[0]); sub = 'Provisional, awaiting ' + (aw.join(', ') || 'more data') + '.'; }
    else if (m.provisional.length > 1) { tone = 'warn'; head = m.provisional.length + ' results still possible'; sub = 'Awaiting ' + (aw.join(', ') || 'more data') + '.'; }
    else if (aw.length) head = 'Awaiting ' + aw.join(', ') + '.';
    const why = [];
    if ((dc.missing || []).length) why.push('no data yet for ' + F.list((dc.missing || []).map((id) => ETB.krName(C, ctx, keyReadOf(exp, id) || { id: id }))));
    (dc.short || []).forEach((id) => { const k = keyReadOf(exp, id); const c = k ? ETB.krCurrent(C, ctx, exp, k) : null; why.push(ETB.krName(C, ctx, k || { id: id }) + ' has ' + (c ? c.n : 0) + ' of ' + (c && c.sample.expected ? c.sample.expected : '?') + ' reads'); });
    return { cls: 'step-strip ' + F.tone(tone), tone: tone, head: head, sub: sub, hasSub: !!sub, complete: !!dc.complete, why: why.length ? 'Conclude opens once every key read has its data: ' + why.join('; ') + '.' : '', m: m };
  }

  return { EXEC, uniqRows, addLocalReads, noteMeasured, liveExp, keyReadOf, srcIdOf, curBatch, connSamples, postReads, awaiting, readingsNow, strip };
})();

(function (S) {
  const EXEC = S.EXEC;
  const X = () => ETB.core;
  const fmt = (v) => ETB.core.fmt(v);
  const STAT_LBL = { average: 'average', median: 'median', stddev: 'std dev', cv: 'CV', range: 'range', max: 'max', min: 'min' };

  /* ---------------------------------------------------------- key-read row (Execution) */
  function rowVM(C, ctx, entry, exp, k) {
    const tid = entry.tid, expId = exp.id, ro = C.isRo();
    const c = ETB.krCurrent(C, ctx, exp, k);
    const statistical = !!(c.stat && c.stat.statistical);
    const want = c.sample && c.sample.expected;
    const samps = S.connSamples(C, ctx, exp, k);
    const menuId = 'step-pop:' + tid + '|' + expId + '|' + k.id;   // one popover at a time; the kit scrim closes it on an outside click
    const ed = C.state.step_edit;
    const editing = !ro && !!(ed && ed.tid === tid && ed.expId === expId && ed.krId === k.id);
    const popOpen = !ro && statistical && C.isMenu(menuId);
    const name = ETB.krName(C, ctx, k);
    const row = {
      key: 'kr-' + expId + '-' + k.id, name: name, crit: ETB.krCrit(C, ctx, k), unit: ETB.krUnit(C, ctx, k) || '—',
      noRead: c.value == null, val: c.value == null ? 'No read' : fmt(c.value),
      hasSub: statistical, sub: (c.stat.statistic || 'average') + ', ' + c.n + (want ? ' of ' + want : '') + (c.complete ? '' : ''), subCls: 'st ' + (c.complete ? 't-ok' : 't-warn'),
      hasChip: samps.length > 0, chip: samps.length === 1 ? 'From ' + samps[0] : 'From ' + samps.length + ' samples', chipTitle: samps.join(', '),
      clickStat: !ro && !editing && statistical, clickOne: !ro && !editing && !statistical, plain: ro, editing: editing, showCell: !editing,
      aria: 'Add a reading for ' + name,
      click: () => {
        if (statistical) { C.setState({ step_arm: null, step_popIn: '', step_batch: null, step_edit: null }); C.toggleMenu(menuId); return; }
        C.closeMenus();
        C.setState({ step_edit: { tid: tid, expId: expId, krId: k.id, v: '' } });
      },
      popOpen: popOpen
    };
    if (editing) {
      const cancel = () => C.setState({ step_edit: null });
      const commit = () => {
        const cur = C.state.step_edit; if (!cur || cur.krId !== k.id || cur.expId !== expId) return;
        C.setState({ step_edit: null });
        let xs = RD.parseReads(cur.v); if (xs.length) xs = [xs[xs.length - 1]];          // a single-valued key read takes one number
        if (!xs.length) return;
        S.postReads(C, ctx, tid, expId, k.id, xs, null, (n) => F.plural(n, 'reading') + ' recorded. The step stays in progress until you conclude it.');
      };
      row.ed = {
        v: String((ed && ed.v) || ''),
        set: (e) => C.setState({ step_edit: Object.assign({}, C.state.step_edit || {}, { v: e && e.target ? e.target.value : '' }) }),
        key: (e) => { if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); commit(); } else if (e.key === 'Escape') { if (e.preventDefault) e.preventDefault(); cancel(); } },
        commit: commit
      };
    }
    if (popOpen) row.pop = popVM(C, ctx, entry, exp, k, c);
    return row;
  }

  /* ---------------------------------------------------------- statistical value list (L1690-L1820) */
  function popVM(C, ctx, entry, exp, k, c) {
    const tid = entry.tid, expId = exp.id;
    const kctx = ETB.krCtx(C, ctx, exp);
    let rows = []; try { rows = RD.keyReadReadingRows(k, kctx); } catch (e) { rows = []; }
    const st = c.stat || {};
    const statLbl = STAT_LBL[st.statistic || 'average'] || st.statistic || 'average';
    const unit = ETB.krUnit(C, ctx, k);
    const cur = S.curBatch(C, ctx, exp, k);
    const want = Number(st.readCount) > 0 ? Number(st.readCount) : 0;
    const complete = !want || c.n >= want;
    const pendKey = tid + '|' + expId + '|' + k.id;
    const pending = C.state.step_batch && C.state.step_batch.key === pendKey ? C.state.step_batch.id : null;
    const arm = C.state.step_arm;
    const close = () => { C.setState({ step_arm: null, step_popIn: '', step_batch: null }); C.closeMenus(); };
    const add = () => {
      const xs = RD.parseReads(C.state.step_popIn || '');
      if (!xs.length) return;
      const batch = pending || S.curBatch(C, ctx, exp, k) || null;
      const n = S.postReads(C, ctx, tid, expId, k.id, xs, batch, (m) => F.plural(m, 'reading') + ' added.');
      if (n) C.setState({ step_popIn: '', step_batch: null, step_arm: null });
    };
    return {
      name: ETB.krName(C, ctx, k), statLbl: statLbl,
      computed: c.summary && c.summary.value != null ? fmt(c.summary.value) : '—', unit: unit,
      cnt: want ? (c.n + ' of ' + want + ' reads') : F.plural(c.n, 'read'), cntCls: 'st ' + (complete ? 't-ok' : 't-warn'),
      crit: ETB.krCrit(C, ctx, k),
      empty: !rows.length,
      rows: rows.map((r, i) => {
        const counted = r.kind === 'linked' || (r.batch || '') === cur;
        const armed = arm === i;
        return {
          key: 'pr' + i, v: fmt(r.value), cls: 'row step-prow' + (counted ? '' : ' dim'),
          tag: r.imported ? (r.sample || 'Analysis') : 'Entered', tagCls: r.imported ? 'tag' : 'sub',
          hasNote: !counted, note: 'Earlier batch, not counted',
          rmText: armed ? 'Confirm remove' : 'Remove', rmCls: armed ? 'btn xs danger push' : 'btn xs q push', rmAria: (armed ? 'Confirm removing ' : 'Remove ') + fmt(r.value),
          rm: () => {
            if (C.state.step_arm !== i) { C.setState({ step_arm: i }); return; }
            let removed = 0;
            ETB.edit(C, ctx, tid, (t, D) => {
              const lexp = S.liveExp(t, expId); if (!lexp) return false;
              if (r.kind === 'linked') {
                const doc = D.docs[ctx.docKey];
                if (Array.isArray(doc.kpiUpdates) && r.upId) { const b = doc.kpiUpdates.length; doc.kpiUpdates = doc.kpiUpdates.filter((u) => u.id !== r.upId); removed = b - doc.kpiUpdates.length; }
              } else {
                const store = lexp.key_read_readings; if (!store || !Array.isArray(store[k.id])) return false;
                const b = store[k.id].length;
                if (r.imported && r.srcKey) store[k.id] = store[k.id].filter((e) => !(e && typeof e === 'object' && e.src && RD.connSrcKey(e.src) === r.srcKey));
                else if (r.localIdx != null && r.localIdx >= 0 && r.localIdx < b) store[k.id].splice(r.localIdx, 1);
                removed = b - store[k.id].length;
                if (removed) X().markOverride(lexp, 'key_read_readings');
              }
              if (!removed) return false;
            });
            C.setState({ step_arm: null });
            C.toast(removed ? 'Reading removed.' : 'Could not remove that reading.', removed ? 'ok' : 'info');
          }
        };
      }),
      in: String(C.state.step_popIn || ''),
      setIn: (e) => C.setState({ step_popIn: e && e.target ? e.target.value : '' }),
      inKey: (e) => { if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); add(); } else if (e.key === 'Escape') { if (e.preventDefault) e.preventDefault(); close(); } },
      add: add,
      newBatch: () => { C.setState({ step_batch: { key: pendKey, id: RD.newBatchId() } }); C.toast('New batch started. The next reading begins a fresh sample.', 'ok'); },
      batchPending: !!pending,
      close: close,
      key: (e) => { if (e && e.key === 'Escape') close(); }
    };
  }

  /* ---------------------------------------------------------- one current-step card */
  function cardVM(C, ctx, entry, exp) {
    const ro = C.isRo();
    const st = ETB.derivedStatus(C, ctx, exp);
    const krs = exp.key_reads || [];
    const card = {
      key: 'card-' + entry.tid + '-' + exp.id, aria: (exp.code || exp.id) + ' ' + (exp.name || ''),
      code: exp.code || exp.id, name: exp.name || 'Untitled experiment',
      statusW: ETB.statusWord(st), statusCls: ETB.statusCls(st),
      hasHyp: !!exp.hypothesis, hyp: exp.hypothesis || '',
      noReads: !krs.length, hasReads: krs.length > 0,
      open: () => ETB.open(C, ctx, entry.tid, exp.id)
    };
    if (EXEC) {
      card.rows = krs.map((k) => rowVM(C, ctx, entry, exp, k));
      card.canConnect = !ro;
      card.connect = () => openConnect(C, ctx, entry.tid, exp.id, false);
      const s = S.strip(C, ctx, exp);
      card.strip = { cls: s.cls, head: s.head, sub: s.sub, hasSub: s.hasSub };
      card.canConclude = !ro;
      card.concludeOn = s.complete;                 // a disabled Conclude… carries no handler; its reason shows beside it
      card.concludeOff = !s.complete;
      card.concludeWhy = s.complete ? '' : s.why;
      card.conclude = () => openRecorder(C, ctx, entry.tid, exp.id);
    } else {
      card.reads = krs.map((k) => ({ key: 'r-' + k.id, name: ETB.krName(C, ctx, k), crit: ETB.krCrit(C, ctx, k) }));
      card.canRecord = !ro;
      card.record = () => openRecorder(C, ctx, entry.tid, exp.id);
    }
    return card;
  }

  /* ---------------------------------------------------------- the focused mini graph (today's renderFocusedGraph) */
  function miniGraph(C, ctx, entry, exps, key) {
    const ids = exps.map((e) => e.id);
    if (!ids.length) return { has: false, empty: true, emptyText: 'No current experiment to graph.', nodes: [], edges: [], sizer: '', canvas: '', W: 0, H: 0, mk: key };
    const R = ETB.graphParts(entry.view, ids);
    const L = ETB.layout(R, { nodeSep: 16, rankSep: 20, pad: 10 });
    const z = ETB.fitZoom(L.W, L.H, 330, 240, 1);
    const types = entry.view.terminal_types || {};
    return {
      has: true, empty: false, emptyText: '', mk: key,
      sizer: 'width:' + Math.round(L.W * z) + 'px;height:' + Math.round(L.H * z) + 'px',
      canvas: 'width:' + L.W + 'px;height:' + L.H + 'px;transform:scale(' + z.toFixed(3) + ')',
      W: L.W, H: L.H,
      edges: L.paths.map((p) => ({ d: p.d, cls: 'etb-e b-' + p.bs, mk: p.arrow ? 'url(#stpm-' + key + '-' + p.bs + ')' : 'none' })),
      nodes: L.nodes.map((n) => {
        const b = ETB.nodeBox(n, L, types);
        b.isStatic = !b.isExp;
        if (b.isExp) b.open = () => ETB.open(C, ctx, entry.tid, n.id);
        return b;
      })
    };
  }

  /* ---------------------------------------------------------- recorder ("Conclude…" / "Record outcome") */
  function prefill(C, ctx, exp, k) {
    if (!EXEC) return '';
    const c = ETB.krCurrent(C, ctx, exp, k);
    if (!c.n) return '';
    return c.stat.statistical ? c.values.join(' ') : String(c.values[c.n - 1]);
  }
  function openRecorder(C, ctx, tid, expId, push) {
    const entry = ETB.entry(C, ctx, tid); const exp = entry && entry.view.experiments[expId]; if (!exp) return;
    const vals = {}, pre = {};
    (exp.key_reads || []).forEach((k) => { const p = prefill(C, ctx, exp, k); vals[k.id] = p; pre[k.id] = p; });
    C[push ? 'pushSheet' : 'openSheet']('step.rec', { tid: tid, expId: expId }, { vals: vals, pre: pre, pick: null, date: F.iso(C.today()) });
  }
  function recStat(C, ctx, k) { return EXEC ? ETB.krStat(C, ctx, k) : { statistical: false, statistic: null, readCount: null }; }
  function recReadings(C, ctx, exp, vals) {
    const o = {};
    (exp.key_reads || []).forEach((k) => {
      const xs = RD.parseReads(vals[k.id]); if (!xs.length) return;
      const st = recStat(C, ctx, k);
      if (st.statistical) { const sum = RD.statSummary(xs, st.statistic); if (sum.value != null) o[k.id] = sum.value; }
      else o[k.id] = xs[xs.length - 1];
    });
    return o;
  }
  function recVM(C, ctx, sh) {
    const entry = ETB.entry(C, ctx, sh.data.tid);
    const exp = entry && entry.view.experiments[sh.data.expId];
    if (!exp) return { missing: true, ok: false, title: 'Experiment not found' };
    const d = sh.d || {}; const vals = d.vals || {};
    const krs = exp.key_reads || [], prs = exp.possible_results || [];
    const readings = recReadings(C, ctx, exp, vals);
    const m = X().etbMatchResults(exp, readings);
    const byId = {}; prs.forEach((r) => { byId[r.id] = r; });
    /* completeness: every key read has data and statistical ones their full sample (never m.complete) */
    let complete = krs.length > 0;
    krs.forEach((k) => { const xs = RD.parseReads(vals[k.id]); if (!xs.length) complete = false; else { const st = recStat(C, ctx, k); if (st.statistical && !RD.readsComplete(xs.length, st.readCount).complete) complete = false; } });
    let auto = null;
    if (EXEC) { if (complete) { if (m.matched.length === 1) auto = m.matched[0]; else if (!m.matched.length) auto = 'other'; } }
    else if (m.matched.length === 1) auto = m.matched[0];
    const pick = d.pick || auto;
    let concl;
    const nm = {}; krs.forEach((k) => { nm[k.id] = ETB.krName(C, ctx, k); });
    if (m.matched.length === 1) { const r = byId[m.matched[0]] || {}; concl = { tone: 'ok', head: 'Matched: ' + (r.label || r.id), sub: r.conclusion || '' }; }
    else if (m.matched.length > 1) concl = { tone: 'info', head: 'Multiple results match', sub: 'Pick one below.' };
    else if (m.complete) concl = { tone: 'info', head: 'No defined result matches', sub: 'Pick one below to record it manually.' };
    else if (EXEC && m.provisional.length === 1) { const p = byId[m.provisional[0]] || {}; const miss = (m.missingBy[p.id] || []).map((id) => nm[id] || id); concl = { tone: 'warn', head: 'Trending toward: ' + (p.label || p.id), sub: 'Provisional, still awaiting ' + (miss.join(', ') || 'more data') + '. Record now to accept it, or finish entering values.' }; }
    else if (EXEC && m.provisional.length > 1) concl = { tone: 'warn', head: m.provisional.length + ' results still possible', sub: 'Enter more values to narrow it down.' };
    else concl = { tone: 'none', head: 'Enter measured values to determine the result automatically.', sub: '' };
    const MARK = { pass: ['Matches', 't-ok'], fail: ['Ruled out', 't-bad'], pending: ['Needs data', 't-none'], provisional: ['Trending', 't-warn'], 'no-criteria': ['No criteria', 't-none'] };
    const setPick = (id) => C.setDraft({ pick: id });
    const results = prs.map((r, i) => { const mk = MARK[m.states[r.id]] || ['', 't-none']; return { key: 'rp-' + r.id, id: r.id, cls: 'step-erp', label: r.label || ('Result ' + (i + 1)), on: pick === r.id, pick: () => setPick(r.id), mark: mk[0], markCls: 'st ' + mk[1], hasMark: !!mk[0] }; });
    if (EXEC && prs.length) [['other', 'Unanticipated: no defined result fits'], ['inconclusive', 'Inconclusive: the data could not decide']].forEach((p) => results.push({ key: 'rp-' + p[0], id: p[0], cls: 'step-erp sent', label: p[1], on: pick === p[0], pick: () => setPick(p[0]), mark: '', markCls: '', hasMark: false }));
    return {
      missing: false, ok: true, isExec: EXEC,
      title: 'Record the outcome', sub: (exp.code || exp.id) + ' ' + (exp.name || ''),
      canConnect: EXEC && !C.isRo(),
      connect: () => openConnect(C, ctx, entry.tid, exp.id, true),
      noKrs: !krs.length,
      krs: krs.map((k) => {
        const st = recStat(C, ctx, k);
        const v = String(vals[k.id] == null ? '' : vals[k.id]);
        let stat = '', statCls = 'sub';
        if (st.statistical) {
          const xs = RD.parseReads(v), sum = RD.statSummary(xs, st.statistic), comp = RD.readsComplete(sum.n, st.readCount);
          if (!sum.n) { stat = 'n = 0' + (comp.expected ? ' of ' + comp.expected : '') + ', ' + st.statistic; statCls = 'sub tx-warn'; }
          else { stat = 'n = ' + sum.n + (comp.expected ? ' of ' + comp.expected : '') + ', ' + st.statistic + ' ' + fmt(sum.value) + (sum.n > 1 && sum.sd != null ? ', sd ' + fmt(sum.sd) : ''); statCls = comp.complete ? 'sub' : 'sub tx-warn'; }
        }
        return {
          key: 'rk-' + k.id, name: ETB.krName(C, ctx, k), crit: 'Target ' + ETB.krCrit(C, ctx, k), unit: ETB.krUnit(C, ctx, k),
          multi: !!st.statistical, v: v, ph: st.statistical ? 'e.g. 0.68 0.67 0.69' : 'measured', aria: 'Measured ' + ETB.krName(C, ctx, k),
          set: (e) => { const nv = Object.assign({}, (C.draft() && C.draft().vals) || {}); nv[k.id] = e && e.target ? e.target.value : ''; C.setDraft({ vals: nv }); },
          hasStat: !!stat, stat: stat, statCls: statCls
        };
      }),
      concl: { cls: 'note step-rconcl ' + F.tone(concl.tone), head: concl.head, sub: concl.sub, hasSub: !!concl.sub },
      results: results, noResults: !prs.length,
      date: d.date || F.iso(C.today()), setDate: (e) => C.setDraft({ date: e && e.target ? e.target.value : '' }),
      canRecord: !!pick && !C.isRo(), recordOff: !pick,
      record: () => { if (pick) recordOutcome(C, ctx, entry, exp, sh, pick); },
      cancel: () => C.closeSheet()
    };
  }
  /* Recording sets the outcome (status complete), stores the raw values and their samples, and posts
     readings for linked key reads on this objective. Today re-posts the pre-filled values, which
     duplicates KPI samples; here only values added or changed in the recorder are posted. */
  function recordOutcome(C, ctx, entry, exp, sh, pick) {
    const d = (C.sheet() && C.sheet().d) || sh.d || {};
    const vals = d.vals || {}, pre = d.pre || {};
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? d.date : F.iso(C.today());
    const readings = recReadings(C, ctx, exp, vals);
    const raw = {}; (exp.key_reads || []).forEach((k) => { const xs = RD.parseReads(vals[k.id]); if (xs.length) raw[k.id] = xs; });
    const recVals = {};
    Object.keys(readings).forEach((id) => { const k = S.keyReadOf(exp, id); const st = recStat(C, ctx, k); const xs = raw[id]; recVals[id] = (st.statistical && xs && xs.length) ? xs.slice() : readings[id]; });
    const samples = {};
    if (EXEC) (exp.key_reads || []).forEach((k) => { const ss = S.connSamples(C, ctx, exp, k); if (ss.length) samples[k.id] = ss; });
    const user = ETB.editor(C);
    const valid = {}; ETB.pool(C, ctx).forEach((k) => { if (k.objectiveId === ctx.objId && k.hostType !== 'task') valid[k.id] = 1; });
    let posted = 0;
    const ok = ETB.edit(C, ctx, entry.tid, (t, D) => {
      const lexp = S.liveExp(t, exp.id); if (!lexp) return false;
      const payload = { result_id: pick, recorded_date: date, recorded_by: user, key_read_values: recVals };
      X().recordOutcome(t, exp.id, payload, { user: user });
      X().recordOutcomePatch(t, exp.id, { key_read_values: recVals });
      if (Object.keys(samples).length) X().recordOutcomePatch(t, exp.id, { key_read_samples: samples });
      lexp.status = 'complete';
      const doc = D.docs[ctx.docKey]; if (!Array.isArray(doc.kpiUpdates)) doc.kpiUpdates = [];
      Object.keys(readings).forEach((krId) => {
        const k = S.keyReadOf(lexp, krId); if (!k || !k.source_kpi_gid || !valid[k.source_kpi_gid]) return;
        let xs = (EXEC && raw[krId]) ? raw[krId] : [Number(readings[krId])];   // Execution posts every value typed (as today); Sales the one number
        const before = RD.parseReads(pre[krId]);
        const left = before.slice();                                   // multiset difference: only new values post
        xs = xs.filter((x) => { const i = left.findIndex((y) => Math.abs(y - x) < 1e-12); if (i >= 0) { left.splice(i, 1); return false; } return true; });
        if (!xs.length) return;
        const rows = S.uniqRows(RD.buildStatReadings(k.source_kpi_gid, xs, { timestamp: C.now(), note: 'exp ' + (lexp.code || lexp.id) }), doc.kpiUpdates);
        rows.forEach((r) => doc.kpiUpdates.push(r));
        posted += rows.length;
      });
    });
    if (!ok) return;
    C.closeAllSheets();
    C.toast(posted ? 'Outcome recorded. ' + F.plural(posted, 'KPI reading') + ' posted to the objective.' : 'Outcome recorded.', 'ok');
  }

  /* ---------------------------------------------------------- Connect data for an experiment (L2036-L2454)
     The KPI module's Connect data sheet in "record" mode (one sheet for KRs, gates and experiments).
     Linked key reads are written there as KPI readings; unlinked ones come back here (applyLocal)
     and are stored on the experiment, inside the same change. */
  function readExp(D, docKey, objId, tid, expId) {
    const doc = D && D.docs ? D.docs[docKey] : null;
    const bag = doc && doc.etbTrees ? doc.etbTrees[objId] : null; if (!bag) return null;
    const w = RD.etbTreesOf(bag);
    const t = w.trees.find((x) => x.tid === tid) || null;
    return t && t.experiments ? t.experiments[expId] || null : null;
  }
  function openConnect(C, ctx, tid, expId, fromRec) {
    if (typeof KPI === 'undefined' || !KPI.openConnect) { C.toast('Connect data is not available on this board.', 'info'); return; }
    const entry = ETB.entry(C, ctx, tid); const exp = entry && entry.view.experiments[expId]; if (!exp) return;
    const docKey = ctx.docKey, objId = ctx.objId, lctx = { docKey: docKey, objId: objId };
    KPI.openConnect(C, ctx, {
      keyReads: (exp.key_reads || []).map((k) => { const o = { id: k.id, name: ETB.krName(C, ctx, k), unit: ETB.krUnit(C, ctx, k) }; if (k.source_kpi_gid) o.source_kpi_gid = k.source_kpi_gid; return o; }),
      getExperiment: (D) => readExp(D, docKey, objId, entry.tid, expId),
      title: 'Connect data: fill key reads',
      label: (exp.code || exp.id) + ' ' + (exp.name || ''),
      applyLocal: (D, o) => applyLocal(C, D, lctx, entry.tid, expId, o || {}),
      afterApply: (C2, res) => afterConnect(C2, entry.tid, expId, fromRec, res)
    });
  }
  function applyLocal(C, D, lctx, tid, expId, o) {
    const t = ETB.live(D, lctx, tid, true); const lexp = t && t.experiments ? t.experiments[expId] : null;
    if (!lexp) return { added: 0, removed: 0, skipped: 0 };
    let added = 0, removed = 0, skipped = 0, touched = false;
    const store = lexp.key_read_readings || (lexp.key_read_readings = {});
    (o.removals || []).forEach((r) => {
      const krId = r.target || r.krId; if (!Array.isArray(store[krId])) return;
      const want = RD.connSrcKey(r.src || {});
      const b = store[krId].length;
      store[krId] = store[krId].filter((e) => !(e && typeof e === 'object' && e.src && RD.connSrcKey(e.src) === want));
      if (store[krId].length !== b) { removed += b - store[krId].length; touched = true; }
    });
    const iso = new Date(C.now()).toISOString();
    Object.keys(o.imports || {}).forEach((krId) => {
      const k = S.keyReadOf(lexp, krId); if (!k) return;
      let prev = Array.isArray(store[krId]) ? store[krId].slice() : [];
      const have = {}; prev.forEach((e) => { if (e && typeof e === 'object' && e.src) have[RD.connSrcKey(e.src)] = 1; });
      let entries = [];
      (o.imports[krId] || []).forEach((p) => {
        const v = Number(p.value); if (!isFinite(v)) return;
        const src = { portal: 'analysis', sample: p.sample || '', bucket: p.analysis || '', key: p.key || '', step: p.step || '', cond: p.cond || {}, job_id: p.job_id || '', bin_id: p.bin_id || '', run_t: p.timestamp || '', imported_t: iso };
        if (p.script) src.script = p.script;
        if (p.scale && p.scale !== 1) { src.scale = p.scale; src.value_raw = p.value_raw; }
        const sk = RD.connSrcKey(src);
        if (have[sk]) { skipped++; return; }
        have[sk] = 1;
        const ent = { v: v, src: src }; if (o.batch) ent.batch = o.batch; entries.push(ent);
      });
      if (!entries.length) return;
      let stat = false; try { stat = !!RD.keyReadStat(k, null).statistical; } catch (e) { stat = false; }
      if (!stat) { prev = []; entries = [entries[entries.length - 1]]; }   // a single-valued key read keeps one reading
      store[krId] = prev.concat(entries);
      added += entries.length; touched = true;
    });
    if (touched) X().markOverride(lexp, 'key_read_readings');
    if ((added || o.linkedAdded) && lexp.status === 'planned') lexp.status = 'in_progress';
    return { added: added, removed: removed, skipped: skipped };
  }
  function afterConnect(C, tid, expId, fromRec, res) {
    const ctx = APP_CTX(C);
    if (res && (res.added || res.removed)) ETB.touch(C, ctx, 'savedAt');
    if (!fromRec) return;
    const top = C.sheet();                              // back on the recorder: refresh what it was pre-filled with
    if (!top || top.kind !== 'step.rec') return;
    const x2 = readExp(C.D, ctx.docKey, ctx.objId, tid, expId); if (!x2) return;   // the live experiment (this render's views predate the import)
    const vals = Object.assign({}, (top.d && top.d.vals) || {}), pre = {};
    (x2.key_reads || []).forEach((k) => { const p = prefill(C, ctx, x2, k); const was = top.d && top.d.pre ? top.d.pre[k.id] : undefined; if (vals[k.id] == null || vals[k.id] === was) vals[k.id] = p; pre[k.id] = p; });
    C.setDraft({ vals: vals, pre: pre });
  }

  /* ---------------------------------------------------------- logic-tree manager (L1881-L1959) */
  function mgrVM(C, ctx) {
    const T = ETB.trees(C, ctx); const ro = C.isRo();
    const total = T.list.reduce((a, t) => a + Object.keys(t.view.experiments || {}).length, 0);
    const order = T.list.map((t) => t.tid);
    return {
      ctxId: ctx.objId, ro: ro, canEdit: !ro, empty: !T.list.length,
      count: F.plural(T.list.length, 'tree') + ', ' + F.plural(total, 'experiment'),
      rows: T.list.map((t, i) => {
        const r = ETB.range(t);
        const nexp = Object.keys(t.view.experiments || {}).length;
        const nameF = ETB.field(C, 'tn_' + t.tid, t.name, (v) => { if (!String(v).trim()) { C.toast('Name the tree. The old name was kept.', 'info'); return; } ETB.renameTree(C, ctx, t.tid, v); }, { escClose: false });
        return {
          key: 'tm-' + t.tid, name: t.name, nameF: nameF, isActive: t.tid === T.activeTid,
          meta: F.plural(nexp, 'experiment') + ', ' + r.text + ' next steps',
          upOff: i === 0, downOff: i === T.list.length - 1,
          up: () => { if (i > 0) ETB.reorderTrees(C, ctx, K.move(order, i, i - 1)); },
          down: () => { if (i < order.length - 1) ETB.reorderTrees(C, ctx, K.move(order, i, i + 1)); },
          open: () => ETB.setActive(C, ctx, t.tid),
          openLabel: t.tid === T.activeTid ? 'Open now' : 'Open',
          canDel: !ro && T.list.length > 1,
          del: () => {
            const imp = ETB.treeImpact(C, ctx, t.tid);
            C.confirm({
              title: 'Delete “' + (t.name || 'Tree') + '”?',
              body: 'Its ' + F.plural(imp.experiments, 'experiment') + ' are deleted with it.' + (imp.readings ? ' ' + F.plural(imp.readings, 'KPI reading') + ' on the KPIs it links to stay where they are, without the experiment that explains them.' : '') + ' This cannot be undone.',
              ok: 'Delete tree', danger: true,
              onOk: () => ETB.deleteTree(C, ctx, t.tid)
            });
          }
        };
      })
    };
  }
  function newTree(C, ctx) {
    C.ask({ title: 'New logic tree', label: 'Name', placeholder: 'e.g. Membrane crossover', ok: 'Create tree', body: 'Each tree has its own root and its own logic. Nothing in one gates anything in another.', onOk: (v) => { ETB.addTree(C, ctx, v); } });
  }

  /* per-tree "Show graph", sticky for this person in this browser as today (localStorage etbGraphOpen:<objectiveId>
     = { tid: 1 }); the session copy in step_graph wins, blocked storage keeps it for this visit (audit A2) */
  function graphKey(objId) { return 'etbGraphOpen:' + (objId || ''); }
  function graphStored(objId) { try { const ls = typeof window !== 'undefined' ? window.localStorage : null; const v = ls ? JSON.parse(ls.getItem(graphKey(objId)) || 'null') : null; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
  function graphRemember(objId, tid, on) {
    try {
      const ls = typeof window !== 'undefined' ? window.localStorage : null; if (!ls) return;
      const m = graphStored(objId); if (on) m[tid] = 1; else delete m[tid];
      ls.setItem(graphKey(objId), JSON.stringify(m));
    } catch (e) { /* this visit only */ }
  }

  /* ---------------------------------------------------------- the module */
  MODS.step = {
    state: { step_edit: null, step_arm: null, step_popIn: '', step_batch: null, step_graph: {} },
    wide: [],
    vm(C, ctx) {
      ETB.setClock(C);
      const ro = C.isRo();
      const T = ETB.trees(C, ctx);
      const multi = EXEC && T.list.length > 1;
      const gmap = C.state.step_graph || {};
      const blocks = [];
      let count = 0;
      const entries = multi ? T.list : [T.active];
      entries.forEach((entry) => {
        const exps = ETB.current(entry);
        count += exps.length;
        const r = ETB.range(entry);
        const gkey = ctx.objId + '|' + entry.tid;
        const open = multi ? (Object.prototype.hasOwnProperty.call(gmap, gkey) ? !!gmap[gkey] : !!graphStored(ctx.objId)[entry.tid]) : true;
        const mk = String(entry.tid).replace(/[^A-Za-z0-9_-]/g, '');
        blocks.push({
          key: 'blk-' + entry.tid, head: multi, name: entry.name || 'Tree', range: r.text,
          cards: exps.map((e) => cardVM(C, ctx, entry, e)),
          empty: !exps.length,
          emptyText: multi ? 'No current experiment on this tree. Conclude the prior step, or add experiments below.' : (EXEC ? 'No current experiment on the active branch. Conclude the prior step, or add experiments below.' : 'No current experiment on the active branch. Record the prior step’s outcome, or add experiments below.'),
          graphOpen: open, graphLazy: !open,
          get graph() { return open ? C.memo('step.g:' + gkey, () => miniGraph(C, ctx, entry, exps, mk)) : null; },
          showGraph: () => { const m = Object.assign({}, C.state.step_graph || {}); m[gkey] = true; C.setState({ step_graph: m }); graphRemember(ctx.objId, entry.tid, true); },
          hideGraph: () => { const m = Object.assign({}, C.state.step_graph || {}); m[gkey] = false; C.setState({ step_graph: m }); graphRemember(ctx.objId, entry.tid, false); }
        });
      });
      const sheet = C.sheetOf('step'); const kind = sheet ? sheet.kind : '';
      const vm = {
        has: !!ctx.obj, ro: ro, isExec: EXEC, count: String(count), blocks: blocks,
        hasTrees: EXEC && T.list.length > 0, canTrees: EXEC && !ro,
        /* the Logic trees panel, between the current step and the editor (November 3): its trees, Manage trees and
           New tree; read-only with no tree, there is nothing to show */
        showTrees: EXEC && (T.list.length > 0 || !ro), noTrees: EXEC && !ro && !T.list.length, treeCount: String(T.list.length),
        trees: EXEC ? T.list.map((t) => { const r = ETB.range(t); const on = t.tid === T.activeTid; return { key: 'tb-' + t.tid, name: t.name || 'Tree', range: r.text, unplanned: r.unplanned, on: on ? 'true' : 'false', cls: 'step-tree' + (on ? ' on' : ''), title: (t.name || 'Tree') + ', ' + r.text + ' next steps' + (r.unplanned ? ', a branch has neither a next step nor a terminal outcome' : ''), pick: () => ETB.setActive(C, ctx, t.tid) }; }) : [],
        manage: () => C.openSheet('step.trees', {}, {}),
        newTree: () => newTree(C, ctx),
        get ov() { return C.memo('step.ov', () => ovVM(C, ctx, T)); },
        get rec() { return kind === 'step.rec' ? C.memo('step.rec', () => recVM(C, ctx, sheet)) : null; },
        get mgr() { return kind === 'step.trees' ? C.memo('step.mgr', () => mgrVM(C, ctx)) : null; }
      };
      return vm;
    },
    /* header search: logic trees and current steps by name */
    search(C, ctx, q) {
      const s = String(q || '').trim().toLowerCase(); if (!s || !ctx.obj) return [];
      const T = ETB.trees(C, ctx); const out = [];
      T.list.forEach((t) => {
        if (String(t.name || '').toLowerCase().indexOf(s) >= 0 || String(t.title || '').toLowerCase().indexOf(s) >= 0) out.push({ label: t.name || t.title || 'Logic tree', sub: 'Logic tree on ' + (ctx.obj.statement || ctx.objId), go: () => { C.setState({ tab: 'exp', menu: '', q: '', searchOpen: false }); ETB.setActive(C, ctx, t.tid); } });
        ETB.current(t).forEach((e) => {
          const hay = [e.code, e.name].join(' ').toLowerCase();
          if (hay.indexOf(s) >= 0) out.push({ label: (e.code || e.id) + ' ' + (e.name || ''), sub: 'Current step in ' + (t.name || 'the logic tree'), go: () => C.setState({ tab: 'exp', menu: '', q: '', searchOpen: false }) });
        });
      });
      return out.slice(0, 8);
    }
  };

  /* ---------------------------------------------------------- Overview card */
  function ovVM(C, ctx, T) {
    const entries = EXEC && T.list.length > 1 ? T.list : [T.active];
    const items = [];
    entries.forEach((entry) => ETB.current(entry).forEach((e) => {
      const st = ETB.derivedStatus(C, ctx, e);
      const s = EXEC ? S.strip(C, ctx, e) : null;
      const krs = e.key_reads || [];
      const measured = EXEC ? krs.filter((k) => ETB.krCurrent(C, ctx, e, k).n > 0).length : 0;
      items.push({
        key: 'ov-' + entry.tid + '-' + e.id, code: e.code || e.id, name: e.name || '', tree: entries.length > 1 ? entry.name : '', hasTree: entries.length > 1,
        statusW: ETB.statusWord(st), statusCls: ETB.statusCls(st),
        hasStrip: !!s, strip: s ? s.head : '', stripCls: s ? 'small ' + (s.tone === 'ok' ? 'tx-ok' : s.tone === 'warn' ? 'tx-warn' : 'muted') : '',
        hasReads: EXEC && krs.length > 0, reads: measured + ' of ' + krs.length + ' key reads measured',
        go: () => goExp(C)
      });
    }));
    /* a view page (?view=overview) has no Experiments tab: the link opens the app's in a new tab */
    const app = APP === 'sales' ? 'Sales' : 'Execution';
    const view = !!ctx.view;
    return {
      items: items, empty: !items.length, go: () => goExp(C),
      goTitle: view ? 'Opens the Experiments tab of ' + app + ' in a new tab' : 'Go to the Experiments tab',
      emptyText: 'No current experiment. Plan one in the logic tree on the Experiments tab' + (view ? ' of ' + app : '') + '.'
    };
  }
  function goExp(C) {
    if (typeof shellGoTab === 'function') shellGoTab(C, 'exp');
    else C.setState({ tab: 'exp', menu: '' });
  }
  /* one key read's controls (value button, inline editor, readings popover) for a page that draws its own rows:
     My Projects' experiment rows (apps/mine). The same function and state as the cards above. */
  S.keyReadRow = (C, ctx, entry, exp, k) => rowVM(C, ctx, entry, exp, k);
})(STEP);
