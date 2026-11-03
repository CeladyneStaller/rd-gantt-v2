/* ============================================================================
   ETB: the experiment logic tree (embedded editor), Calm version.
   Owner: X-exp. The Current step (mods/step) uses this module's public ETB
   namespace for tree access, matching and edits.

   Data: ctx.doc.etbTrees[objectiveId] is the multi-tree container
     { schema:2, trees:[ tree… ], activeTid }   (a bare schema-1 tree is read
   through RD.etbTreesOf and rewritten as a container on the first edit).
   Every edit goes through ETB.edit(), which changes the live tree object IN
   ITS SLOT, so the other trees on the objective are never dropped (today's
   ETB.saveActive / toolbar Save wrote the bare active tree over the container).

   The pure tree logic below is a line-by-line port of today's ETB core
   (execution_app.template.html L6340-L6723, L7604-L7671, L7879-L7908) and the
   host matcher (L1538-L1554); the 91 in-browser tests are ported verbatim.
   ========================================================================== */
const ETB = (function () {
  /* ---------------------------------------------------------- clock */
  let NOWF = function () { return Date.now(); };
  let TODAY = '2026-10-13';
  function setClock(C) {
    NOWF = function () { return C.now(); };
    TODAY = (C.D && C.D.todayIso) || F.iso(C.today());
  }
  function todayISO() { return TODAY; }
  function nowIso() { return new Date(NOWF()).toISOString(); }

  /* ================================================================
     CORE LOGIC (port of today's ETB; names kept so the tests read the same)
     ================================================================ */
  const SCHEMA_VERSION = '1.0';
  const SENTINELS = ['other', 'inconclusive'];
  const isSentinel = (rid) => SENTINELS.includes(rid);

  function enumerateEdges(tree) {
    const edges = [];
    for (const [eid, exp] of Object.entries(tree.experiments || {})) {
      for (const r of exp.possible_results || []) {
        for (const to of r.next_experiment_ids || []) edges.push({ from: eid, via: r.id, viaKind: 'result', to });
      }
      const ao = exp.actual_outcome;
      if (ao && isSentinel(ao.result_id)) {
        for (const to of ao.next_experiment_ids || []) edges.push({ from: eid, via: ao.result_id, viaKind: 'sentinel', to });
      }
    }
    return edges;
  }
  function childrenByParent(edges) { const m = {}; for (const e of edges) (m[e.from] = m[e.from] || []).push(e); return m; }
  function resolveParents(tree, edges) {
    edges = edges || enumerateEdges(tree);
    const parent = {}, counts = {};
    for (const e of edges) { counts[e.to] = (counts[e.to] || 0) + 1; parent[e.to] = { experiment_id: e.from, result_id: e.via, viaKind: e.viaKind }; }
    for (const id of Object.keys(tree.experiments || {})) if (!(id in parent)) parent[id] = null;
    const dupes = Object.keys(counts).filter((id) => counts[id] > 1);
    return { parent, dupes };
  }
  function findRoots(tree, edges) {
    edges = edges || enumerateEdges(tree);
    const hasParent = new Set(edges.map((e) => e.to));
    const roots = Object.keys(tree.experiments || {}).filter((id) => !hasParent.has(id));
    return { root: roots.length === 1 ? roots[0] : null, roots };
  }
  function effectiveRoot(tree, edges) {
    const fr = findRoots(tree, edges);
    if (fr.root) return fr.root;
    if (tree.root_experiment_id && (tree.experiments || {})[tree.root_experiment_id]) return tree.root_experiment_id;
    return fr.roots.length ? fr.roots[0] : null;
  }
  function selectedVia(exp) { const ao = exp && exp.actual_outcome; if (!ao) return null; return ao.result_id; }
  function computeReachability(tree) {
    const edges = enumerateEdges(tree);
    const kids = childrenByParent(edges);
    const root = effectiveRoot(tree, edges);
    const state = {};
    if (!root) return state;
    const queue = [[root, 'active']];
    while (queue.length) {
      const [eid, st] = queue.shift();
      if (state[eid] !== undefined) continue;
      state[eid] = st;
      const exp = tree.experiments[eid];
      const out = kids[eid] || [];
      if (st === 'not_pursued') { for (const e of out) queue.push([e.to, 'not_pursued']); }
      else if (st === 'pending') { for (const e of out) queue.push([e.to, 'pending']); }
      else {
        const sel = selectedVia(exp);
        if (sel == null) { for (const e of out) queue.push([e.to, 'pending']); }
        else { for (const e of out) queue.push([e.to, e.via === sel ? 'active' : 'not_pursued']); }
      }
    }
    return state;
  }
  function resolveOutcome(exp) {
    const ao = exp.actual_outcome;
    if (!ao) return null;
    if (isSentinel(ao.result_id)) {
      return { kind: 'sentinel', resultId: ao.result_id, label: ao.result_id, conclusion: ao.conclusion || null, terminal: ao.terminal || null, nextId: (ao.next_experiment_ids || [])[0] || null };
    }
    const r = (exp.possible_results || []).find((x) => x.id === ao.result_id);
    return { kind: 'result', resultId: ao.result_id, label: r ? r.label : ao.result_id, conclusion: r ? r.conclusion || null : null, terminal: r ? r.terminal || null : null, nextId: r ? (r.next_experiment_ids || [])[0] || null : null, missing: !r };
  }
  function traversedPath(tree) {
    const root = effectiveRoot(tree);
    const path = []; const seen = new Set(); let cur = root;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const exp = tree.experiments[cur];
      if (!exp) break;
      const out = resolveOutcome(exp);
      if (!out) { path.push({ experimentId: cur, code: exp.code, name: exp.name, pending: true }); break; }
      path.push({ experimentId: cur, code: exp.code, name: exp.name, resultId: out.resultId, resultLabel: out.label, conclusion: out.conclusion, terminal: out.terminal });
      if (out.terminal) break;
      cur = out.nextId;
    }
    return path;
  }
  function terminalReached(tree) {
    const path = traversedPath(tree); const last = path[path.length - 1];
    if (last && last.terminal) return { reached: true, type: last.terminal.type, label: last.terminal.label, atExperimentId: last.experimentId };
    return { reached: false };
  }
  function branchState(reach, parentId, parentExp, via) {
    const pr = reach[parentId];
    if (pr === 'not_pursued') return 'not_pursued';
    if (pr === 'pending' || pr === undefined) return 'pending';
    const sel = selectedVia(parentExp);
    if (sel == null) return 'pending';
    return via === sel ? 'active' : 'not_pursued';
  }
  function buildGraphElements(tree, reach) {
    const nodes = [], edges = [];
    const exps = tree.experiments || {};
    for (const [eid, exp] of Object.entries(exps)) {
      nodes.push({ data: { id: eid, kind: 'experiment', code: exp.code || eid, name: exp.name || '', status: exp.status || 'planned', reach: reach[eid] || 'pending', repeat: !!exp.repeat_of, label: (exp.repeat_of ? '↻ ' : '') + (exp.code || eid) + '\n' + (exp.name || '') } });
      const ao = exp.actual_outcome;
      for (const r of exp.possible_results || []) {
        const bs = branchState(reach, eid, exp, r.id);
        const observed = ao && !isSentinel(ao.result_id) && ao.result_id === r.id;
        const accN = (r.accomplishments || []).length; const accR = accN > 0 && !!observed;
        const nextId = (r.next_experiment_ids || [])[0];
        if (r.terminal) {
          const tid = 'term_' + eid + '_' + r.id;
          nodes.push({ data: { id: tid, kind: 'terminal', termType: r.terminal.type, label: r.terminal.label || r.terminal.type, branchState: bs } });
          edges.push({ data: { id: 'edge_' + eid + '_' + r.id + '_' + tid, source: eid, target: tid, label: r.label || '', viaKind: 'result', expId: eid, resultId: r.id, branchState: bs, observed: !!observed, acc: accN > 0, accRealized: accR } });
        } else if (nextId) {
          const lbl = (exps[nextId] && exps[nextId].repeat_of === eid) ? 'repeat' : (r.label || '');
          edges.push({ data: { id: 'edge_' + eid + '_' + r.id + '_' + nextId, source: eid, target: nextId, label: lbl, viaKind: 'result', expId: eid, resultId: r.id, branchState: bs, observed: !!observed, acc: accN > 0, accRealized: accR } });
        } else {
          const nn = 'nonext_' + eid + '_' + r.id;
          nodes.push({ data: { id: nn, kind: 'nonext', label: 'No next step', branchState: bs } });
          edges.push({ data: { id: 'edge_' + eid + '_' + r.id + '_' + nn, source: eid, target: nn, label: r.label || '', viaKind: 'result', expId: eid, resultId: r.id, branchState: bs, observed: !!observed, acc: accN > 0, accRealized: accR } });
        }
      }
      if (ao && isSentinel(ao.result_id)) {
        const bs = branchState(reach, eid, exp, ao.result_id);
        const nextId = (ao.next_experiment_ids || [])[0];
        if (ao.terminal) {
          const tid = 'term_' + eid + '_' + ao.result_id;
          nodes.push({ data: { id: tid, kind: 'terminal', termType: ao.terminal.type, label: ao.terminal.label || ao.terminal.type, branchState: bs } });
          edges.push({ data: { id: 'edge_' + eid + '_' + ao.result_id + '_' + tid, source: eid, target: tid, label: ao.result_id, viaKind: 'sentinel', branchState: bs, observed: true } });
        } else if (nextId) {
          edges.push({ data: { id: 'edge_' + eid + '_' + ao.result_id + '_' + nextId, source: eid, target: nextId, label: ao.result_id, viaKind: 'sentinel', branchState: bs, observed: true } });
        } else {
          const nn = 'nonext_' + eid + '_' + ao.result_id;
          nodes.push({ data: { id: nn, kind: 'nonext', label: 'No next step', branchState: bs } });
          edges.push({ data: { id: 'edge_' + eid + '_' + ao.result_id + '_' + nn, source: eid, target: nn, label: ao.result_id, viaKind: 'sentinel', branchState: bs, observed: true } });
        }
      }
    }
    return { nodes, edges };
  }
  function toRenderElements(nodes, edges) {
    const outNodes = nodes.slice(); const outEdges = [];
    for (const e of edges) {
      const d = e.data; const lab = (d.label == null ? '' : String(d.label)).trim();
      if (!lab) { outEdges.push({ data: Object.assign({}, d) }); continue; }
      const lid = 'lblN_' + d.id;
      outNodes.push({ data: { id: lid, kind: 'edgelabel', label: (d.acc ? '⚑ ' : '') + lab, text: lab, branchState: d.branchState, viaKind: d.viaKind, expId: d.expId, resultId: d.resultId, observed: !!d.observed, acc: !!d.acc, accRealized: !!d.accRealized }, grabbable: false, selectable: true });
      outEdges.push({ data: { id: d.id + '__in', source: d.source, target: lid, branchState: d.branchState, viaKind: d.viaKind, half: 'in', noArrow: 1 } });
      outEdges.push({ data: { id: d.id + '__out', source: lid, target: d.target, branchState: d.branchState, viaKind: d.viaKind, observed: !!d.observed, half: 'out' } });
    }
    return { nodes: outNodes, edges: outEdges };
  }

  /* ---- mutation helpers (pure: operate on the passed tree) ---- */
  function pushAudit(exp, field, from, to, action, reason, user) { (exp.audit_log || (exp.audit_log = [])).push({ timestamp: nowIso(), user: user || '', field, action: action || 'amend', from: from == null ? null : String(from), to: to == null ? null : String(to), reason: reason || null }); }
  function newExperimentId(tree) { let max = 0; for (const k of Object.keys(tree.experiments || {})) { const m = /^exp_(\d+)$/.exec(k); if (m) max = Math.max(max, parseInt(m[1], 10)); } let n = max + 1, id = 'exp_' + String(n).padStart(3, '0'); while (tree.experiments && tree.experiments[id]) { n++; id = 'exp_' + String(n).padStart(3, '0'); } return id; }
  function suggestCode(tree) { const codes = new Set(Object.values(tree.experiments || {}).map((e) => e.code)); let k = Object.keys(tree.experiments || {}).length + 1, code = 'EXP-' + k; while (codes.has(code)) { k++; code = 'EXP-' + k; } return code; }
  function newResultId(tree, expId) { const stem = String(expId || '').replace(/^exp_/, '') || 'x'; const all = new Set(); for (const e of Object.values(tree.experiments || {})) for (const r of e.possible_results || []) all.add(r.id); const letters = 'abcdefghijklmnopqrstuvwxyz'; for (let i = 0; i < letters.length; i++) { const id = 'res_' + stem + letters[i]; if (!all.has(id)) return id; } let i = 0, id; do { id = 'res_' + stem + '_' + (i++); } while (all.has(id)); return id; }
  function addExperiment(tree, fields) { fields = fields || {}; const id = newExperimentId(tree); (tree.experiments || (tree.experiments = {}))[id] = { id, code: fields.code || suggestCode(tree), name: fields.name || 'New experiment', hypothesis: '', toggle: '', hypothesis_verdict: null, test: '', status: 'planned', owner: '', planned_date: null, completed_date: null, notes: '', key_reads: [], possible_results: [], actual_outcome: null, audit_log: [] }; if (Object.keys(tree.experiments).length === 1) tree.root_experiment_id = id; return id; }
  function deleteExperiment(tree, expId) { if (!tree.experiments) return; delete tree.experiments[expId]; for (const e of Object.values(tree.experiments)) { if (e.repeat_of === expId) e.repeat_of = null; for (const r of e.possible_results || []) if ((r.next_experiment_ids || []).includes(expId)) r.next_experiment_ids = r.next_experiment_ids.filter((x) => x !== expId); const ao = e.actual_outcome; if (ao && isSentinel(ao.result_id) && (ao.next_experiment_ids || []).includes(expId)) ao.next_experiment_ids = ao.next_experiment_ids.filter((x) => x !== expId); } }
  function makeRepeat(tree, sourceId) {
    const s = tree.experiments[sourceId]; if (!s) return null;
    const id = newExperimentId(tree);
    const k = Object.values(tree.experiments).filter((e) => e.repeat_of === sourceId).length + 1;
    const clone = (x) => JSON.parse(JSON.stringify(x == null ? null : x));
    const results = (s.possible_results || []).map((sr, i) => ({ id: id + '_r' + (i + 1), source_result_id: sr.id, label: sr.label || '', criteria: clone(sr.criteria || []), conclusion: sr.conclusion || '', accomplishments: clone(sr.accomplishments || []), next_experiment_ids: [], terminal: null }));
    tree.experiments[id] = { id, code: (s.code || 'EXP') + '·R' + k, name: (s.name || 'Experiment') + ' (repeat)', hypothesis: s.hypothesis || '', toggle: s.toggle || '', hypothesis_verdict: null, test: s.test || '', status: 'planned', owner: '', planned_date: null, completed_date: null, notes: '', key_reads: clone(s.key_reads || []), possible_results: results, actual_outcome: null, audit_log: [], repeat_of: sourceId, overrides: {} };
    return id;
  }
  function relinkField(tree, expId, field) { const exp = tree.experiments[expId]; if (!exp || !exp.overrides) return; if (field === 'all') exp.overrides = {}; else delete exp.overrides[field]; }
  function syncRepeats(tree) {
    if (!tree || !tree.experiments) return tree;
    const clone = (x) => JSON.parse(JSON.stringify(x == null ? null : x));
    for (const r of Object.values(tree.experiments)) {
      if (!r.repeat_of) continue;
      const s = tree.experiments[r.repeat_of];
      if (!s) { r.repeat_of = null; continue; }
      const ov = r.overrides || (r.overrides = {});
      if (!ov.hypothesis) r.hypothesis = s.hypothesis || '';
      if (!ov.toggle) r.toggle = s.toggle || '';
      if (!ov.test) r.test = s.test || '';
      if (!ov.key_reads) r.key_reads = clone(s.key_reads || []);
      if (!ov.possible_results) {
        const src = s.possible_results || []; const old = r.possible_results || [];
        const bySource = new Map(); for (const rr of old) if (rr.source_result_id) bySource.set(rr.source_result_id, rr);
        const used = new Set(src.map((sr) => bySource.get(sr.id)).filter(Boolean).map((rr) => rr.id));
        let n = 0; const freshId = () => { let c; do { c = r.id + '_r' + (++n); } while (used.has(c)); used.add(c); return c; };
        r.possible_results = src.map((sr) => { const ex = bySource.get(sr.id); const base = { source_result_id: sr.id, label: sr.label || '', criteria: clone(sr.criteria || []), conclusion: sr.conclusion || '', accomplishments: clone(sr.accomplishments || []) }; return ex ? Object.assign({ id: ex.id, next_experiment_ids: ex.next_experiment_ids || [], terminal: ex.terminal || null }, base) : Object.assign({ id: freshId(), next_experiment_ids: [], terminal: null }, base); });
        const ids = new Set(r.possible_results.map((x) => x.id));
        if (r.actual_outcome && !isSentinel(r.actual_outcome.result_id) && !ids.has(r.actual_outcome.result_id)) r.actual_outcome = null;
      }
    }
    return tree;
  }
  function addResult(tree, expId) { const exp = tree.experiments[expId]; if (!exp) return null; const id = newResultId(tree, expId); (exp.possible_results || (exp.possible_results = [])).push({ id, label: 'New result', criteria: [], conclusion: '', next_experiment_ids: [], terminal: null }); markOverride(exp, 'possible_results'); return id; }
  function removeResult(tree, expId, resultId) { const exp = tree.experiments[expId]; if (!exp) return; exp.possible_results = (exp.possible_results || []).filter((r) => r.id !== resultId); if (exp.actual_outcome && exp.actual_outcome.result_id === resultId) exp.actual_outcome = null; markOverride(exp, 'possible_results'); }
  function setResultLink(tree, expId, resultId, link) { const exp = tree.experiments[expId]; if (!exp) return; const r = (exp.possible_results || []).find((x) => x.id === resultId); if (!r) return; if (link.kind === 'terminal') { const tt = (tree.terminal_types || {})[link.type]; r.terminal = { type: link.type, label: (tt && tt.label) || link.type, note: null }; r.next_experiment_ids = []; } else if (link.kind === 'next') { r.next_experiment_ids = link.expId ? [link.expId] : []; r.terminal = null; } else { r.next_experiment_ids = []; r.terminal = null; } }
  function setExperimentField(tree, expId, field, value, opts) { const exp = tree.experiments[expId]; if (!exp) return; const before = exp[field]; exp[field] = value; if (field === 'hypothesis' || field === 'toggle' || field === 'test') markOverride(exp, field); if (exp.status === 'complete' && field === 'hypothesis_verdict' && before !== value) pushAudit(exp, field, before, value, 'amend', (opts && opts.reason) || null, (opts && opts.user) || ''); }
  function setResultField(tree, expId, resultId, field, value, opts) { const exp = tree.experiments[expId]; if (!exp) return; const r = (exp.possible_results || []).find((x) => x.id === resultId); if (!r) return; const before = r[field]; r[field] = value; if (field === 'label' || field === 'conclusion') markOverride(exp, 'possible_results'); if (exp.status === 'complete' && field === 'conclusion' && before !== value) pushAudit(exp, 'possible_results.' + resultId + '.conclusion', before, value, 'amend', (opts && opts.reason) || null, (opts && opts.user) || ''); }
  function recordOutcome(tree, expId, payload, opts) { const exp = tree.experiments[expId]; if (!exp) return; const rid = payload.result_id; const sent = isSentinel(rid); const next = sent ? (payload.next_experiment_ids || (payload.next != null ? [payload.next] : [])) : []; const ao = { result_id: rid, recorded_date: payload.recorded_date || todayISO(), recorded_by: payload.recorded_by || '', note: payload.note || null, conclusion: sent ? (payload.conclusion || null) : null, next_experiment_ids: next, terminal: sent ? (payload.terminal || null) : null }; if (exp.status === 'complete') pushAudit(exp, 'actual_outcome', exp.actual_outcome ? JSON.stringify(exp.actual_outcome) : null, JSON.stringify(ao), 'amend', (opts && opts.reason) || null, (opts && opts.user) || ''); exp.actual_outcome = ao; }
  function recordOutcomePatch(tree, expId, patch) { const exp = tree.experiments[expId]; if (!exp || !exp.actual_outcome) return; Object.assign(exp.actual_outcome, patch); }
  function clearOutcome(tree, expId) { const exp = tree.experiments[expId]; if (!exp) return; if (exp.status === 'complete' && exp.actual_outcome) pushAudit(exp, 'actual_outcome', JSON.stringify(exp.actual_outcome), null, 'delete', null, ''); exp.actual_outcome = null; }

  /* ---- accomplishment flags (stage-gates) ---- */
  function isResultObserved(exp, resultId) { const ao = exp && exp.actual_outcome; return !!(ao && !isSentinel(ao.result_id) && ao.result_id === resultId); }
  function newAccId(result) { const set = new Set((result.accomplishments || []).map((a) => a.id)); let i = 1, id; do { id = 'acc_' + (i++); } while (set.has(id)); return id; }
  function addAccomplishment(tree, expId, resultId) { const exp = tree.experiments[expId]; if (!exp) return null; const r = (exp.possible_results || []).find((x) => x.id === resultId); if (!r) return null; if (!Array.isArray(r.accomplishments)) r.accomplishments = []; const id = newAccId(r); r.accomplishments.push({ id, type: 'stage_gate', label: '', gate_id: null, note: null }); markOverride(exp, 'possible_results'); if (exp.status === 'complete') pushAudit(exp, 'possible_results.' + resultId + '.accomplishments', null, 'added', 'amend', null, ''); return id; }
  function removeAccomplishment(tree, expId, resultId, accId) { const exp = tree.experiments[expId]; if (!exp) return; const r = (exp.possible_results || []).find((x) => x.id === resultId); if (!r || !Array.isArray(r.accomplishments)) return; r.accomplishments = r.accomplishments.filter((a) => a.id !== accId); markOverride(exp, 'possible_results'); if (exp.status === 'complete') pushAudit(exp, 'possible_results.' + resultId + '.accomplishments', null, 'removed', 'amend', null, ''); }
  function setAccomplishmentField(tree, expId, resultId, accId, field, value) { const exp = tree.experiments[expId]; if (!exp) return; const r = (exp.possible_results || []).find((x) => x.id === resultId); if (!r || !Array.isArray(r.accomplishments)) return; const a = r.accomplishments.find((x) => x.id === accId); if (!a) return; a[field] = value; markOverride(exp, 'possible_results'); if (exp.status === 'complete') pushAudit(exp, 'possible_results.' + resultId + '.accomplishments', null, 'edited', 'amend', null, ''); }
  function collectAccomplishments(tree) { const out = []; for (const exp of Object.values((tree && tree.experiments) || {})) { for (const r of exp.possible_results || []) { for (const a of (r.accomplishments || [])) { out.push({ exp_id: exp.id, exp_code: exp.code || exp.id, result_id: r.id, result_label: r.label || '', label: a.label || '', type: a.type || 'stage_gate', realized: isResultObserved(exp, r.id) }); } } } return out; }

  /* ---- schema normalisation + structured criteria / key reads ---- */
  function normalizeTree(tree) {
    if (!tree || typeof tree !== 'object') return tree;
    for (const exp of Object.values(tree.experiments || {})) {
      if (!exp || typeof exp !== 'object') continue;
      if (typeof exp.toggle !== 'string') exp.toggle = '';
      if (!Array.isArray(exp.key_reads)) exp.key_reads = [];
      for (const k of exp.key_reads) { if (typeof k.unit !== 'string') k.unit = ''; if (k.critical_value == null) k.critical_value = ''; if (k.critical_value_hi == null) k.critical_value_hi = ''; if (!k.direction) k.direction = '>='; }
      if (exp.repeat_of === undefined) exp.repeat_of = null;
      if (!exp.overrides || typeof exp.overrides !== 'object') exp.overrides = {};
      for (const r of exp.possible_results || []) {
        if (!Array.isArray(r.accomplishments)) r.accomplishments = [];
        if (Array.isArray(r.criteria)) continue;
        const s = (r.criteria == null ? '' : String(r.criteria)).trim();
        r.criteria = s ? [{ key_read_id: null, op: '=', value: s }] : [];
      }
    }
    return tree;
  }
  function markOverride(exp, field) { if (exp && exp.repeat_of) { (exp.overrides || (exp.overrides = {}))[field] = true; } }
  const OPS = [{ value: '<', label: '<' }, { value: '<=', label: '≤' }, { value: '=', label: '=' }, { value: '>=', label: '≥' }, { value: '>', label: '>' }];
  function opLabel(op) { const o = OPS.find((x) => x.value === op); return o ? o.label : (op || ''); }
  const DIRS = [{ value: '<=', label: '≤' }, { value: '<', label: '<' }, { value: '=', label: '=' }, { value: '>', label: '>' }, { value: '>=', label: '≥' }, { value: 'range', label: 'between' }];
  function critText(k) {
    if (!k) return ''; const u = k.unit ? (' ' + k.unit) : '';
    const cv = (k.critical_value === '' || k.critical_value == null) ? '?' : k.critical_value;
    if ((k.direction || '') === 'range') { const hi = (k.critical_value_hi === '' || k.critical_value_hi == null) ? '?' : k.critical_value_hi; return cv + ' – ' + hi + u; }
    return opLabel(k.direction) + ' ' + cv + u;
  }
  function criteriaText(res, keyReads) {
    const arr = Array.isArray(res.criteria) ? res.criteria : [];
    const krs = keyReads || [];
    return arr.map((c) => {
      const k = krs.find((x) => x.id === c.key_read_id);
      const name = k ? (k.name || k.id) : (c.key_read_id ? c.key_read_id : '(read?)');
      const unit = k && k.unit ? (' ' + k.unit) : '';
      if (typeof c.status === 'string') return (name + (c.status === 'hit' ? ' ✓' : ' ✗') + (k ? (' (' + critText(k) + ')') : '')).trim();
      return (name + ' ' + opLabel(c.op) + ' ' + (c.value == null ? '' : c.value) + unit).trim();
    }).filter(Boolean).join('  ·  ');
  }
  function newKeyReadId(tree, expId) { const stem = String(expId || '').replace(/^exp_/, '') || 'x'; const exp = (tree.experiments || {})[expId]; const all = new Set(((exp && exp.key_reads) || []).map((k) => k.id)); let i = 1, id; do { id = 'kr_' + stem + '_' + (i++); } while (all.has(id)); return id; }
  function addKeyRead(tree, expId) { const exp = tree.experiments[expId]; if (!exp) return null; const id = newKeyReadId(tree, expId); (exp.key_reads || (exp.key_reads = [])).push({ id, name: '', unit: '', critical_value: '', direction: '>=' }); markOverride(exp, 'key_reads'); return id; }
  function removeKeyRead(tree, expId, krId) { const exp = tree.experiments[expId]; if (!exp) return; exp.key_reads = (exp.key_reads || []).filter((k) => k.id !== krId); for (const r of exp.possible_results || []) for (const c of (Array.isArray(r.criteria) ? r.criteria : [])) if (c.key_read_id === krId) c.key_read_id = null; markOverride(exp, 'key_reads'); }
  function setKeyReadField(tree, expId, krId, field, value) { const exp = tree.experiments[expId]; if (!exp) return; const k = (exp.key_reads || []).find((x) => x.id === krId); if (k) k[field] = value; markOverride(exp, 'key_reads'); }
  function addCriterion(tree, expId, resultId) { const exp = tree.experiments[expId]; if (!exp) return; const r = (exp.possible_results || []).find((x) => x.id === resultId); if (!r) return; if (!Array.isArray(r.criteria)) r.criteria = []; r.criteria.push({ key_read_id: null, op: '>', value: '' }); markOverride(exp, 'possible_results'); if (exp.status === 'complete') pushAudit(exp, 'possible_results.' + resultId + '.criteria', null, 'added', 'amend', null, ''); }
  function removeCriterion(tree, expId, resultId, index) { const exp = tree.experiments[expId]; if (!exp) return; const r = (exp.possible_results || []).find((x) => x.id === resultId); if (!r || !Array.isArray(r.criteria)) return; r.criteria.splice(index, 1); markOverride(exp, 'possible_results'); if (exp.status === 'complete') pushAudit(exp, 'possible_results.' + resultId + '.criteria', null, 'removed', 'amend', null, ''); }
  function setCriterionField(tree, expId, resultId, index, field, value) { const exp = tree.experiments[expId]; if (!exp) return; const r = (exp.possible_results || []).find((x) => x.id === resultId); if (!r || !Array.isArray(r.criteria) || !r.criteria[index]) return; const before = r.criteria[index][field]; r.criteria[index][field] = value; markOverride(exp, 'possible_results'); if (exp.status === 'complete' && before !== value) pushAudit(exp, 'possible_results.' + resultId + '.criteria', before, value, 'amend', null, ''); }
  function setKeyReadStatus(tree, expId, resultId, krId, status) { const exp = tree.experiments[expId]; if (!exp) return; const r = (exp.possible_results || []).find((x) => x.id === resultId); if (!r) return; if (!Array.isArray(r.criteria)) r.criteria = []; const idx = r.criteria.findIndex((c) => c.key_read_id === krId && typeof c.status === 'string'); if (!status) { if (idx >= 0) r.criteria.splice(idx, 1); } else if (idx >= 0) { r.criteria[idx].status = status; } else { r.criteria.push({ key_read_id: krId, status }); } markOverride(exp, 'possible_results'); if (exp.status === 'complete') pushAudit(exp, 'possible_results.' + resultId + '.criteria', null, 'set:' + (status || 'clear'), 'amend', null, ''); }

  /* validation rules 1-13 (same rules and levels as today; messages fall back to the
     id/label when a code or label is missing instead of printing "undefined") */
  function validateTree(tree) {
    const issues = [];
    const err = (rule, message, ref) => issues.push({ level: 'error', rule, message, ref });
    const warn = (rule, message, ref) => issues.push({ level: 'warning', rule, message, ref });
    const experiments = tree.experiments || {};
    const ids = new Set(Object.keys(experiments));
    const edges = enumerateEdges(tree);
    const termTypes = new Set(Object.keys(tree.terminal_types || {}));
    const roots = findRoots(tree, edges).roots;
    if (roots.length === 0 && ids.size > 0) err(1, 'No root: every experiment is referenced as a next step (cycle or no entry point).');
    else if (roots.length > 1) err(1, `Multiple roots: ${roots.join(', ')}. A tree has exactly one entry point.`);
    const dupes = resolveParents(tree, edges).dupes;
    for (const d of dupes) err(2, `${d} is reached from more than one result — not a tree.`, d);
    for (const e of edges) if (!ids.has(e.to)) err(5, `Edge from ${e.from} (${e.via}) points to missing experiment ${e.to}.`, e.from);
    const kids = childrenByParent(edges); const color = {};
    const dfs = (n) => { color[n] = 1; for (const e of kids[n] || []) { if (!ids.has(e.to)) continue; if (color[e.to] === 1) { err(3, `Cycle detected through ${e.to}.`, e.to); continue; } if (!color[e.to]) dfs(e.to); } color[n] = 2; };
    for (const id of ids) if (!color[id]) dfs(id);
    for (const [eid, exp] of Object.entries(experiments)) {
      const code = exp.code || eid;
      for (const r of exp.possible_results || []) {
        const rl = r.label || r.id;
        const nexts = r.next_experiment_ids || []; const hasNext = nexts.length > 0; const hasTerm = !!r.terminal;
        if (nexts.length > 1) err(4, `${code} result "${rl}" has ${nexts.length} next experiments (max 1).`, eid);
        if (hasNext && hasTerm) err(6, `${code} result "${rl}" has both a next experiment and a terminal.`, eid);
        if (!hasNext && !hasTerm) warn(6, `${code} result "${rl}" is dangling — no next step or terminal.`, eid);
        if (hasTerm && !termTypes.has(r.terminal.type)) err(7, `${code} result "${rl}" uses unknown terminal type "${r.terminal.type}".`, eid);
        for (const c of (Array.isArray(r.criteria) ? r.criteria : [])) {
          const kr = (exp.key_reads || []).find((k) => k.id === c.key_read_id);
          if (!c.key_read_id || !kr) warn(11, `${code} result "${rl}" has a criterion with no key read selected.`, eid);
          else if (typeof c.status === 'string' && (kr.critical_value === '' || kr.critical_value == null)) warn(12, `${code} result "${rl}" marks "${kr.name || kr.id}" ${c.status}, but that key read has no critical value to test against.`, eid);
          else if (typeof c.status === 'string' && (kr.direction || '') === 'range' && (kr.critical_value_hi === '' || kr.critical_value_hi == null)) warn(12, `${code} result "${rl}" tests "${kr.name || kr.id}" against a range, but only the low bound is set.`, eid);
        }
        for (const a of (Array.isArray(r.accomplishments) ? r.accomplishments : [])) {
          if (!a.label || !String(a.label).trim()) warn(13, `${code} result "${rl}" has a stage-gate flag with no label.`, eid);
        }
      }
      const ao = exp.actual_outcome;
      if (ao) {
        if (isSentinel(ao.result_id)) {
          const sNext = (ao.next_experiment_ids || []).length > 0;
          if ((ao.next_experiment_ids || []).length > 1) err(4, `${code} ${ao.result_id} outcome has ${ao.next_experiment_ids.length} next experiments (max 1).`, eid);
          if (ao.terminal && sNext) err(6, `${code} ${ao.result_id} outcome has both a next experiment and a terminal.`, eid);
          if (ao.terminal && !termTypes.has(ao.terminal.type)) err(7, `${code} ${ao.result_id} outcome uses unknown terminal type "${ao.terminal.type}".`, eid);
          if (!sNext && !ao.terminal && !(ao.conclusion || '').trim()) warn(8, `${code} recorded "${ao.result_id}" with no conclusion, next step, or terminal.`, eid);
        } else {
          const match = (exp.possible_results || []).some((r) => r.id === ao.result_id);
          if (!match) err(8, `${code} actual outcome "${ao.result_id}" matches no defined result.`, eid);
        }
        if (exp.status === 'planned') warn(10, `${code} has a recorded outcome but status is "planned".`, eid);
      } else if (exp.status === 'complete') {
        warn(10, `${code} is complete but has no recorded outcome.`, eid);
      }
      for (const a of exp.audit_log || []) {
        const isConclusion = typeof a.field === 'string' && a.field.includes('conclusion');
        if (a.action === 'amend' && isConclusion && !(a.reason || '').trim()) warn(9, `${code} conclusion amendment on ${a.timestamp || '?'} has no reason.`, eid);
      }
    }
    return issues;
  }

  /* ---- sample + empty trees (sampleTree is used by the test suite only) ---- */
  function terminalTypes() { return { target_achieved: { label: 'Target achieved', kind: 'success' }, conduct_fmea: { label: 'Conduct FMEA', kind: 'pause' }, halt: { label: 'Halt', kind: 'stop' } }; }
  function sampleTree() {
    return {
      schema_version: SCHEMA_VERSION, tree_id: 'tree_mea_opt_2026', title: 'MEA optimization plan', root_experiment_id: 'exp_001',
      terminal_types: terminalTypes(),
      metadata: { created_date: '2026-03-01', modified_date: '2026-05-02' },
      experiments: {
        exp_001: { id: 'exp_001', code: 'EXP-1', name: 'Baseline MEA characterization', hypothesis: 'Current MEA achieves >= 0.6 V at 1 A/cm2 under H2/Air, standard conditions.', toggle: 'Baseline conditions (control — nothing varied)', hypothesis_verdict: 'confirmed', test: 'Polarization sweep OCV to 1.5 A/cm2, three replicate cells.', status: 'complete', owner: 'AK', planned_date: '2026-03-10', completed_date: '2026-03-14', notes: 'Cell 2 excluded for membrane crossover.', key_reads: [{ id: 'kr_001_v', name: 'Cell voltage @ 1 A/cm²', unit: 'V', critical_value: '0.6', direction: '>=' }, { id: 'kr_001_hfr', name: 'HFR', unit: 'Ω·cm²', critical_value: '0.1', direction: '<=' }], possible_results: [
          { id: 'res_001a', label: 'Meets baseline', criteria: [{ key_read_id: 'kr_001_v', status: 'hit' }], accomplishments: [{ id: 'acc_1', type: 'stage_gate', label: 'SG-1: Baseline established', gate_id: null, note: null }], conclusion: 'Baseline confirmed, proceed to optimization.', next_experiment_ids: ['exp_002a'], terminal: null },
          { id: 'res_001b', label: 'Below baseline', criteria: [{ key_read_id: 'kr_001_v', status: 'miss' }, { key_read_id: 'kr_001_v', op: '>', value: '0.4' }], conclusion: 'Investigate degradation pathways.', next_experiment_ids: ['exp_002b'], terminal: null },
          { id: 'res_001c', label: 'Severely degraded', criteria: [{ key_read_id: 'kr_001_v', op: '<', value: '0.4' }], conclusion: 'Halt and reassess approach.', next_experiment_ids: [], terminal: { type: 'halt', label: 'Halt', note: null } }
        ], actual_outcome: { result_id: 'res_001a', recorded_date: '2026-03-14', recorded_by: 'AK', note: null, conclusion: null, next_experiment_ids: [], terminal: null }, audit_log: [] },
        exp_002a: { id: 'exp_002a', code: 'EXP-2A', name: 'Catalyst loading optimization', hypothesis: 'Reducing Pt loading 20% holds performance within 10 mV.', toggle: 'Cathode Pt loading (mg/cm²)', hypothesis_verdict: null, test: 'Polarization + EIS across a loading sweep.', status: 'in_progress', owner: 'RM', planned_date: '2026-04-01', completed_date: null, notes: '', key_reads: [{ id: 'kr_002a_dv', name: 'ΔV vs baseline @ 1 A/cm²', unit: 'mV', critical_value: '10', direction: '<=' }, { id: 'kr_002a_v', name: 'Cell voltage @ 1 A/cm²', unit: 'V', critical_value: '0.65', direction: '>=' }, { id: 'kr_002a_hfr', name: 'HFR', unit: 'Ω·cm²', critical_value: '0.1', direction: '<=' }], possible_results: [
          { id: 'res_002a_a', label: 'Performance held', criteria: [{ key_read_id: 'kr_002a_dv', status: 'hit' }], accomplishments: [{ id: 'acc_1', type: 'stage_gate', label: 'SG-2: Catalyst loading validated', gate_id: null, note: null }], conclusion: 'Loading reduction viable; verify durability.', next_experiment_ids: ['exp_003'], terminal: null },
          { id: 'res_002a_final', label: 'Meets all targets', criteria: [{ key_read_id: 'kr_002a_v', status: 'hit' }, { key_read_id: 'kr_002a_hfr', status: 'hit' }], conclusion: 'Optimization complete.', next_experiment_ids: [], terminal: { type: 'target_achieved', label: 'Target achieved', note: null } }
        ], actual_outcome: null, audit_log: [] },
        exp_002b: { id: 'exp_002b', code: 'EXP-2B', name: 'Degradation diagnosis', hypothesis: 'Loss is dominated by membrane thinning.', toggle: 'Failure mode (observed, not varied)', hypothesis_verdict: null, test: 'Post-mortem SEM + fluoride emission rate.', status: 'planned', owner: 'RM', planned_date: null, completed_date: null, notes: '', key_reads: [{ id: 'kr_002b_fer', name: 'Fluoride emission rate', unit: 'µg/cm²/h', critical_value: '5', direction: '<=' }], possible_results: [
          { id: 'res_002b_a', label: 'Membrane-dominated', criteria: [{ key_read_id: 'kr_002b_fer', status: 'miss' }], conclusion: 'Pursue reinforced membrane.', next_experiment_ids: [], terminal: { type: 'conduct_fmea', label: 'Conduct FMEA', note: null } }
        ], actual_outcome: null, audit_log: [] },
        exp_003: { id: 'exp_003', code: 'EXP-3', name: 'Durability baseline', hypothesis: 'Optimized MEA survives 500 h with < 10% loss.', toggle: 'AST cycling duration (h)', hypothesis_verdict: null, test: 'AST cycling, 500 h.', status: 'planned', owner: 'AK', planned_date: null, completed_date: null, notes: '', key_reads: [{ id: 'kr_003_loss', name: 'Performance loss @ 500 h', unit: '%', critical_value: '10', direction: '<' }], possible_results: [
          { id: 'res_003_a', label: 'Survives', criteria: [{ key_read_id: 'kr_003_loss', status: 'hit' }], conclusion: 'Durability target met.', next_experiment_ids: [], terminal: { type: 'target_achieved', label: 'Target achieved', note: null } }
        ], actual_outcome: null, audit_log: [] }
      }
    };
  }
  /* blank tree; the id is deterministic per objective so an untouched virtual tree renders the same twice */
  function emptyTree(seed) {
    return {
      schema_version: SCHEMA_VERSION,
      tree_id: 'tree_' + (seed ? String(seed).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(-10) : Math.random().toString(36).slice(2, 8)),
      title: 'Untitled logic tree',
      root_experiment_id: null,
      terminal_types: terminalTypes(),
      metadata: { created_date: todayISO(), modified_date: todayISO() },
      experiments: {}
    };
  }

  /* ---- current step and the focused subgraph (L7879-L7908) ---- */
  function lastAuditTs(exp) { const a = (exp && exp.audit_log) || []; let m = ''; for (let i = 0; i < a.length; i++) { if (a[i].timestamp && a[i].timestamp > m) m = a[i].timestamp; } return m; }
  function currentExperiments(tree, reach) {
    const exps = (tree && tree.experiments) || {}; reach = reach || {};
    const ids = Object.keys(exps);
    const active = ids.filter((id) => (reach[id] || 'pending') === 'active');
    const inProg = active.filter((id) => (exps[id].status || '') === 'in_progress');
    if (inProg.length) return inProg.sort((a, b) => lastAuditTs(exps[b]).localeCompare(lastAuditTs(exps[a])));
    const upNext = active.filter((id) => !exps[id].actual_outcome);
    if (!upNext.length) return [];
    upNext.sort((a, b) => { const ta = lastAuditTs(exps[a]) || '~', tb = lastAuditTs(exps[b]) || '~'; if (ta !== tb) return ta.localeCompare(tb); return ids.indexOf(a) - ids.indexOf(b); });
    return [upNext[0]];
  }
  function focusedSubgraph(tree, expIds) {
    const exps = (tree && tree.experiments) || {}, focus = {}; (expIds || []).forEach((id) => { if (exps[id]) focus[id] = 1; });
    const nextExps = {};
    Object.keys(focus).forEach((eid) => {
      const e = exps[eid];
      (e.possible_results || []).forEach((r) => { (r.next_experiment_ids || []).forEach((nx) => { if (exps[nx] && !focus[nx]) nextExps[nx] = 1; }); });
      const ao = e.actual_outcome; if (ao && ao.next_experiment_ids) ao.next_experiment_ids.forEach((nx) => { if (exps[nx] && !focus[nx]) nextExps[nx] = 1; });
    });
    const focusIds = Object.keys(focus), nextIds = Object.keys(nextExps), seen = {}, allIds = [];
    focusIds.concat(nextIds).forEach((id) => { if (!seen[id]) { seen[id] = 1; allIds.push(id); } });
    return { focusIds, nextIds, allIds };
  }
  function buildFocusedTree(tree, expIds) {
    const sub = focusedSubgraph(tree, expIds), exps = {};
    sub.focusIds.forEach((id) => { if (tree.experiments[id]) exps[id] = tree.experiments[id]; });
    sub.nextIds.forEach((id) => { if (!exps[id]) { const e = tree.experiments[id]; exps[id] = Object.assign({}, e, { possible_results: [], actual_outcome: null }); } });
    const out = Object.assign({}, tree); out.experiments = exps; return out;
  }

  /* ---- waterfall model (L7604-L7671); day numbers are UTC days since 1970 ---- */
  function buildWaterfallModel(tree, today, opts) {
    opts = opts || {};
    const GAP = opts.gap != null ? opts.gap : 7;
    const DUR = opts.dur != null ? opts.dur : 21;
    const exps = (tree && tree.experiments) || {};
    const ids = Object.keys(exps);
    function parseDay(s) { if (!s || typeof s !== 'string') return null; const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return null; return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000; }
    let todayDay = parseDay(today); if (todayDay == null) todayDay = Math.floor(NOWF() / 86400000);
    const edges = [], terminals = [], indeg = {}, kids = {}, parents = {};
    ids.forEach((id) => { indeg[id] = 0; kids[id] = []; parents[id] = []; });
    ids.forEach((id) => { (exps[id].possible_results || []).forEach((r) => {
      (r.next_experiment_ids || []).forEach((nid) => { if (exps[nid]) { edges.push({ from: id, to: nid, label: r.label || '' }); kids[id].push(nid); indeg[nid]++; parents[nid].push(id); } });
      if (r.terminal) { terminals.push({ from: id, label: (r.terminal.label || 'Halt'), type: r.terminal.type || 'halt', result: r.label || '' }); }
    }); });
    const indeg2 = {}; ids.forEach((id) => { indeg2[id] = indeg[id]; });
    const q = ids.filter((id) => indeg2[id] === 0).sort(), topo = []; let qi = 0;
    while (qi < q.length) { const id = q[qi++]; topo.push(id); kids[id].slice().sort().forEach((c) => { if (--indeg2[c] === 0) q.push(c); }); }
    ids.forEach((id) => { if (topo.indexOf(id) < 0) topo.push(id); });
    const depth = {}; topo.forEach((id) => { depth[id] = 0; });
    topo.forEach((id) => { kids[id].forEach((c) => { if (depth[c] < depth[id] + 1) depth[c] = depth[id] + 1; }); });
    const seq = {}, seen = {}; let sidx = 0;
    function visit(id) { if (seen[id]) return; seen[id] = true; seq[id] = sidx++; kids[id].forEach(visit); }
    ids.forEach((id) => { if (indeg[id] === 0) visit(id); });
    ids.forEach((id) => { if (!seen[id]) visit(id); });
    const sched = {};
    topo.forEach((id) => {
      const e = exps[id], st = e.status || 'planned';
      const pd = parseDay(e.planned_date), cd = parseDay(e.completed_date);
      let start, end, projected = false;
      if (pd != null) { start = pd; }
      else { let pend = null; parents[id].forEach((p) => { if (sched[p] && (pend == null || sched[p].endDay > pend)) pend = sched[p].endDay; }); start = (pend != null) ? pend + GAP : todayDay; projected = true; }
      if (cd != null) { end = cd; }
      else if (st === 'in_progress') { end = Math.max(todayDay, start + 1); if (pd == null) projected = true; }
      else { end = start + DUR; if (pd == null) projected = true; }
      if (end < start) end = start + 1;
      sched[id] = { startDay: start, endDay: end, projected: projected };
    });
    const inLabel = {}; edges.forEach((e) => { if (!(e.to in inLabel)) inLabel[e.to] = e.label || ''; });
    const expOrder = ids.slice().sort((a, b) => { if (depth[a] !== depth[b]) return depth[a] - depth[b]; if (seq[a] !== seq[b]) return seq[a] - seq[b]; return a < b ? -1 : (a > b ? 1 : 0); });
    function expNode(id) { const e = exps[id]; return { id: id, kind: 'experiment', code: e.code || id, name: e.name || '', status: e.status || 'planned', startDay: sched[id].startDay, endDay: sched[id].endDay, projected: sched[id].projected, depth: depth[id], leadIn: (id in inLabel) ? inLabel[id] : null }; }
    function termNode(tm, gi) { const pe = sched[tm.from] ? sched[tm.from].endDay : todayDay; return { id: '__term_' + tm.from + '_' + gi, kind: 'terminal', from: tm.from, label: tm.label || 'Halt', type: tm.type, result: tm.result, startDay: pe, endDay: pe, projected: sched[tm.from] ? sched[tm.from].projected : false, depth: (depth[tm.from] || 0) + 1 }; }
    const rows = [];
    expOrder.forEach((id) => { rows.push(expNode(id)); terminals.forEach((tm, gi) => { if (tm.from === id) rows.push(termNode(tm, gi)); }); });
    terminals.forEach((tm, gi) => { if (!exps[tm.from]) rows.push(termNode(tm, gi)); });
    rows.forEach((n, i) => { n.row = i; });
    let minDay = null, maxDay = null;
    rows.forEach((r) => { if (r.kind !== 'experiment') return; if (minDay == null || r.startDay < minDay) minDay = r.startDay; if (maxDay == null || r.endDay > maxDay) maxDay = r.endDay; });
    if (minDay == null) { minDay = todayDay; maxDay = todayDay + DUR; }
    if (todayDay < minDay) minDay = todayDay; if (todayDay > maxDay) maxDay = todayDay;
    return { rows: rows, edges: edges, domain: { minDay: minDay, maxDay: maxDay }, todayDay: todayDay };
  }
  function wfFitLabel(len, barW, opts) {
    opts = opts || {};
    const maxF = opts.maxF || 12, minF = opts.minF || 8, pad = opts.pad != null ? opts.pad : 9, cw = opts.cw || 0.6;
    const avail = Math.max(0, barW - 2 * pad);
    const fitF = len ? avail / (len * cw) : maxF;
    const Fs = Math.min(maxF, fitF);
    return { inside: Fs >= minF, fontSize: Math.max(minF, Math.min(maxF, Math.round(Fs * 10) / 10)) };
  }
  function wfLabelLayout(len, dateW, maxExtW, opts) {
    opts = opts || {};
    const MIN = opts.minF || 8, BASE = opts.maxF || 12, CW = opts.cw || 0.6, PAD = opts.pad != null ? opts.pad : 8;
    const fit = wfFitLabel(len, dateW, { minF: MIN, maxF: BASE, cw: CW, pad: PAD });
    if (fit.inside) return { mode: 'inside', fontSize: fit.fontSize, labelW: dateW };
    const needW = Math.round(len * MIN * CW + 2 * PAD);
    if (needW <= maxExtW) return { mode: 'extend', fontSize: MIN, labelW: Math.max(dateW, needW) };
    return { mode: 'outside', fontSize: BASE, labelW: dateW };
  }

  /* ---- the host matcher (current step + recorder, L1538-L1554) ---- */
  function etbApplyOp(op, a, b, hi) {
    if (b === '' || b == null) return false; a = Number(a); b = Number(b); if (isNaN(a) || isNaN(b)) return false;
    if (op === 'range') { if (hi === '' || hi == null) return false; const h = Number(hi); if (isNaN(h)) return false; const lo = Math.min(b, h), up = Math.max(b, h); return a >= lo && a <= up; }
    switch (op) { case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b; case '=': return Math.abs(a - b) < 1e-9; case '!=': return Math.abs(a - b) >= 1e-9; default: return false; }
  }
  function etbEvalCriterion(crit, keyRead, measured) {
    if (measured == null || measured === '' || isNaN(Number(measured))) return 'pending';
    if (crit && typeof crit.status === 'string') {
      if (!keyRead || keyRead.critical_value === '' || keyRead.critical_value == null) return 'pending';
      if ((keyRead.direction || '') === 'range' && (keyRead.critical_value_hi === '' || keyRead.critical_value_hi == null)) return 'pending';
      const pc = etbApplyOp(keyRead.direction || '>=', measured, keyRead.critical_value, keyRead.critical_value_hi); return (pc === (crit.status === 'hit')) ? 'pass' : 'fail';
    }
    if (crit.value === '' || crit.value == null) return 'pending';
    return etbApplyOp(crit.op || '>', measured, crit.value) ? 'pass' : 'fail';
  }
  function etbMatchResults(exp, readings) {
    readings = readings || {}; const krById = {}; (exp.key_reads || []).forEach((k) => { krById[k.id] = k; });
    const states = {}, matched = [], provisional = [], missingBy = {}; let anyPending = false;
    (exp.possible_results || []).forEach((r) => {
      const crits = Array.isArray(r.criteria) ? r.criteria : []; if (!crits.length) { states[r.id] = 'no-criteria'; return; }
      let f = false, p = false, okN = 0; const pendKrs = [];
      crits.forEach((c) => { const meas = Object.prototype.hasOwnProperty.call(readings, c.key_read_id) ? readings[c.key_read_id] : null; const st = etbEvalCriterion(c, krById[c.key_read_id], meas); if (st === 'fail') f = true; else if (st === 'pending') { p = true; if (pendKrs.indexOf(c.key_read_id) < 0) pendKrs.push(c.key_read_id); } else okN++; });
      if (f) states[r.id] = 'fail';
      else if (p) { anyPending = true; if (okN > 0) { states[r.id] = 'provisional'; provisional.push(r.id); missingBy[r.id] = pendKrs; } else { states[r.id] = 'pending'; missingBy[r.id] = pendKrs; } }
      else { states[r.id] = 'pass'; matched.push(r.id); }
    });
    return { matched, provisional, missingBy, states, complete: !anyPending };
  }
  const etbCritText = critText;
  /* statistical values in compact notation (today's __erFmt) */
  function fmt(v) { if (v == null) return '—'; const n = Number(v); if (!isFinite(n)) return '—'; const a = Math.abs(n); const s = (a !== 0 && (a < 0.001 || a >= 100000)) ? n.toExponential(2) : n.toFixed(a < 1 ? 4 : 3); return String(parseFloat(s)); }
  const STAT_SHORT = { average: 'average', median: 'median', stddev: 'std dev', cv: 'CV', range: 'range', max: 'max', min: 'min' };

  /* ---- the 91 in-browser tests (verbatim, L7490-L7589) ---- */
  const TESTS = [];
  function test(name, fn) { TESTS.push({ name, fn }); }
  function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
  function assertEq(a, b, m) { if (a !== b) throw new Error(`${m || ''} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); }
  function hasIssue(issues, rule, level) { return issues.some((i) => i.rule === rule && (!level || i.level === level)); }
  test('edges: results + sentinel nexts enumerated', () => { const t = sampleTree(); t.experiments.exp_001.actual_outcome = { result_id: 'other', recorded_date: 'x', recorded_by: 'y', note: 'n', conclusion: 'c', next_experiment_ids: ['exp_002a'], terminal: null }; assert(enumerateEdges(t).some((x) => x.viaKind === 'sentinel' && x.to === 'exp_002a'), 'sentinel edge missing'); });
  test('root: exactly one for sample', () => { assertEq(findRoots(sampleTree()).root, 'exp_001'); });
  test('root: none when all referenced', () => { const t = sampleTree(); t.experiments.exp_003.possible_results[0] = { id: 'r', label: 'l', criteria: '', conclusion: '', next_experiment_ids: ['exp_001'], terminal: null }; assertEq(findRoots(t).root, null); });
  test('parents: resolved with originating result id', () => { const p = resolveParents(sampleTree()).parent; assertEq(p.exp_002a.experiment_id, 'exp_001'); assertEq(p.exp_002a.result_id, 'res_001a'); assertEq(p.exp_001, null); });
  test('reachability: selected active, sibling not_pursued, deeper pending', () => { const r = computeReachability(sampleTree()); assertEq(r.exp_001, 'active'); assertEq(r.exp_002a, 'active'); assertEq(r.exp_002b, 'not_pursued'); assertEq(r.exp_003, 'pending'); });
  test('reachability: subtree of not_pursued stays not_pursued', () => { const t = sampleTree(); t.experiments.exp_002b.possible_results[0] = { id: 'rb', label: 'lb', criteria: '', conclusion: '', next_experiment_ids: ['exp_xx'], terminal: null }; t.experiments.exp_xx = { id: 'exp_xx', code: 'EXP-XX', name: 'x', hypothesis: '', test: '', status: 'planned', possible_results: [], actual_outcome: null, audit_log: [] }; const r = computeReachability(t); assertEq(r.exp_002b, 'not_pursued'); assertEq(r.exp_xx, 'not_pursued'); });
  test('reachability: sentinel next active, planned results not_pursued', () => { const t = sampleTree(); t.experiments.exp_001.actual_outcome = { result_id: 'inconclusive', recorded_date: 'x', recorded_by: 'y', note: 'n', conclusion: 'redo', next_experiment_ids: ['exp_003'], terminal: null }; const r = computeReachability(t); assertEq(r.exp_003, 'active'); assertEq(r.exp_002a, 'not_pursued'); assertEq(r.exp_002b, 'not_pursued'); });
  test('traversedPath: follows selected result, stops at pending', () => { const p = traversedPath(sampleTree()); assertEq(p.length, 2); assertEq(p[0].experimentId, 'exp_001'); assertEq(p[0].resultLabel, 'Meets baseline'); assertEq(p[1].experimentId, 'exp_002a'); assert(p[1].pending === true, 'exp_002a should be pending tail'); });
  test('traversedPath: stops at terminal', () => { const t = sampleTree(); t.experiments.exp_002a.actual_outcome = { result_id: 'res_002a_final', recorded_date: 'x', recorded_by: 'y', note: null, conclusion: null, next_experiment_ids: [], terminal: null }; t.experiments.exp_002a.status = 'complete'; const tr = terminalReached(t); assert(tr.reached === true, 'terminal should be reached'); assertEq(tr.type, 'target_achieved'); assertEq(tr.atExperimentId, 'exp_002a'); });
  test('resolveOutcome: real result reads conclusion from result', () => { const o = resolveOutcome(sampleTree().experiments.exp_001); assertEq(o.kind, 'result'); assertEq(o.conclusion, 'Baseline confirmed, proceed to optimization.'); assertEq(o.nextId, 'exp_002a'); });
  test('validate: clean sample has no errors', () => { assert(!validateTree(sampleTree()).some((i) => i.level === 'error')); });
  test('validate rule 1: multiple roots', () => { const t = sampleTree(); t.experiments.exp_solo = { id: 'exp_solo', code: 'X', name: 'x', hypothesis: '', test: '', status: 'planned', possible_results: [], actual_outcome: null, audit_log: [] }; assert(hasIssue(validateTree(t), 1, 'error')); });
  test('validate rule 2: two parents', () => { const t = sampleTree(); t.experiments.exp_002b.possible_results[0] = { id: 'rb', label: 'lb', criteria: '', conclusion: '', next_experiment_ids: ['exp_003'], terminal: null }; assert(hasIssue(validateTree(t), 2, 'error')); });
  test('validate rule 3: cycle', () => { const t = sampleTree(); t.experiments.exp_003.possible_results[0] = { id: 'rc', label: 'lc', criteria: '', conclusion: '', next_experiment_ids: ['exp_002a'], terminal: null }; assert(hasIssue(validateTree(t), 3, 'error')); });
  test('validate rule 4: multiple next', () => { const t = sampleTree(); t.experiments.exp_002a.possible_results[0].next_experiment_ids = ['exp_003', 'exp_002b']; assert(hasIssue(validateTree(t), 4, 'error')); });
  test('validate rule 5: broken reference', () => { const t = sampleTree(); t.experiments.exp_001.possible_results[0].next_experiment_ids = ['nope']; assert(hasIssue(validateTree(t), 5, 'error')); });
  test('validate rule 6: both next and terminal', () => { const t = sampleTree(); t.experiments.exp_001.possible_results[0].terminal = { type: 'halt', label: 'Halt' }; assert(hasIssue(validateTree(t), 6, 'error')); });
  test('validate rule 6: dangling warns', () => { const t = sampleTree(); t.experiments.exp_002a.possible_results[0].next_experiment_ids = []; assert(hasIssue(validateTree(t), 6, 'warning')); });
  test('validate rule 7: unknown terminal type', () => { const t = sampleTree(); t.experiments.exp_001.possible_results[2].terminal = { type: 'explode', label: '?' }; assert(hasIssue(validateTree(t), 7, 'error')); });
  test('validate rule 8: outcome matches no result', () => { const t = sampleTree(); t.experiments.exp_001.actual_outcome.result_id = 'res_nope'; assert(hasIssue(validateTree(t), 8, 'error')); });
  test('validate rule 8: sentinel with empty path warns', () => { const t = sampleTree(); t.experiments.exp_001.actual_outcome = { result_id: 'other', recorded_date: 'x', recorded_by: 'y', note: '', conclusion: '', next_experiment_ids: [], terminal: null }; assert(hasIssue(validateTree(t), 8, 'warning')); });
  test('validate rule 9: conclusion amend without reason warns', () => { const t = sampleTree(); t.experiments.exp_001.audit_log = [{ timestamp: 't', user: 'u', field: 'possible_results.res_001a.conclusion', action: 'amend', from: 'a', to: 'b', reason: '' }]; assert(hasIssue(validateTree(t), 9, 'warning')); });
  test('validate rule 10: complete without outcome warns', () => { const t = sampleTree(); t.experiments.exp_001.actual_outcome = null; assert(hasIssue(validateTree(t), 10, 'warning')); });
  test('validate rule 10: outcome but planned warns', () => { const t = sampleTree(); t.experiments.exp_002b.actual_outcome = { result_id: 'res_002b_a', recorded_date: 'x', recorded_by: 'y', note: null, conclusion: null, next_experiment_ids: [], terminal: null }; assert(hasIssue(validateTree(t), 10, 'warning')); });
  test('graph: node and edge counts for sample', () => { const t = sampleTree(); const g = buildGraphElements(t, computeReachability(t)); assertEq(g.nodes.length, 8, 'nodes'); assertEq(g.edges.length, 7, 'edges'); });
  test('graph: a terminal node per terminal result', () => { const t = sampleTree(); const g = buildGraphElements(t, computeReachability(t)); const terms = g.nodes.filter((n) => n.data.kind === 'terminal'); assertEq(terms.length, 4); assert(terms.some((n) => n.data.termType === 'conduct_fmea')); });
  test('graph: experiment-edge branchState matches target reach', () => { const t = sampleTree(); const reach = computeReachability(t); const g = buildGraphElements(t, reach); const e = g.edges.find((x) => x.data.target === 'exp_002a'); assertEq(e.data.branchState, 'active'); assertEq(e.data.branchState, reach.exp_002a); assertEq(g.edges.find((x) => x.data.target === 'exp_002b').data.branchState, 'not_pursued'); });
  test('graph: observed flag on selected result edge', () => { const t = sampleTree(); const g = buildGraphElements(t, computeReachability(t)); assert(g.edges.find((x) => x.data.target === 'exp_002a').data.observed === true); assert(g.edges.find((x) => x.data.target === 'exp_002b').data.observed === false); });
  test('graph: deeper edge is pending', () => { const t = sampleTree(); const g = buildGraphElements(t, computeReachability(t)); assertEq(g.edges.find((x) => x.data.target === 'exp_003').data.branchState, 'pending'); });
  test('graph: sentinel edge active when parent active', () => { const t = sampleTree(); t.experiments.exp_001.actual_outcome = { result_id: 'other', recorded_date: 'x', recorded_by: 'y', note: 'n', conclusion: 'c', next_experiment_ids: ['exp_003'], terminal: null }; const g = buildGraphElements(t, computeReachability(t)); const e = g.edges.find((x) => x.data.viaKind === 'sentinel' && x.data.target === 'exp_003'); assert(e && e.data.branchState === 'active'); });
  test('render: labeled edge becomes a pill node + paired half-edges', () => { const t = sampleTree(); const g = buildGraphElements(t, computeReachability(t)); const R = toRenderElements(g.nodes, g.edges); const pills = R.nodes.filter((n) => n.data.kind === 'edgelabel'); assert(pills.length > 0, 'has pills'); assertEq(R.edges.filter((e) => e.data.half === 'in').length, pills.length); assertEq(R.edges.filter((e) => e.data.half === 'out').length, pills.length); });
  test('render: out-half keeps target+branchState; in-half has no arrow', () => { const t = sampleTree(); const reach = computeReachability(t); const g = buildGraphElements(t, reach); const R = toRenderElements(g.nodes, g.edges); const out = R.edges.find((e) => e.data.half === 'out' && e.data.target === 'exp_002a'); assert(out, 'out half to exp_002a'); assertEq(out.data.branchState, 'active'); assert(R.edges.some((e) => e.data.half === 'in' && e.data.noArrow)); });
  test('render: all element ids unique after transform', () => { const t = sampleTree(); const g = buildGraphElements(t, computeReachability(t)); const R = toRenderElements(g.nodes, g.edges); const ids = R.nodes.map((n) => n.data.id).concat(R.edges.map((e) => e.data.id)); assertEq(new Set(ids).size, ids.length); });
  test('render: labelless edge passes through whole (no pill)', () => { const R = toRenderElements([{ data: { id: 'a', kind: 'experiment', label: 'A' } }, { data: { id: 'b', kind: 'experiment', label: 'B' } }], [{ data: { id: 'e1', source: 'a', target: 'b', label: '', branchState: 'active', viaKind: 'result' } }]); assertEq(R.edges.length, 1); assertEq(R.edges[0].data.target, 'b'); assert(!R.nodes.some((n) => n.data.kind === 'edgelabel')); });
  test('mut: addExperiment makes a planned node with fresh id+code', () => { const t = sampleTree(); const id = addExperiment(t, {}); assert(t.experiments[id], 'exists'); assertEq(t.experiments[id].status, 'planned'); assert(id !== 'exp_001'); assertEq(t.experiments[id].code.indexOf('EXP-'), 0); });
  test('mut: newExperimentId increments past max', () => { assertEq(newExperimentId(sampleTree()), 'exp_004'); });
  test('mut: addResult appends blank result with unique id', () => { const t = sampleTree(); const before = t.experiments.exp_002a.possible_results.length; const id = addResult(t, 'exp_002a'); assertEq(t.experiments.exp_002a.possible_results.length, before + 1); assert(t.experiments.exp_002a.possible_results.some((r) => r.id === id)); });
  test('mut: removeResult clears observed outcome', () => { const t = sampleTree(); removeResult(t, 'exp_001', 'res_001a'); assertEq(t.experiments.exp_001.actual_outcome, null); assert(!t.experiments.exp_001.possible_results.some((r) => r.id === 'res_001a')); });
  test('mut: setResultLink terminal/next are mutually exclusive', () => { const t = sampleTree(); setResultLink(t, 'exp_001', 'res_001a', { kind: 'terminal', type: 'halt' }); assertEq(t.experiments.exp_001.possible_results[0].next_experiment_ids.length, 0); assertEq(t.experiments.exp_001.possible_results[0].terminal.type, 'halt'); setResultLink(t, 'exp_001', 'res_001a', { kind: 'next', expId: 'exp_002a' }); assertEq(t.experiments.exp_001.possible_results[0].terminal, null); assertEq(t.experiments.exp_001.possible_results[0].next_experiment_ids[0], 'exp_002a'); });
  test('mut: recordOutcome real result nulls inherited fields', () => { const t = sampleTree(); recordOutcome(t, 'exp_002a', { result_id: 'res_002a_a' }, { user: 'AK' }); const ao = t.experiments.exp_002a.actual_outcome; assertEq(ao.result_id, 'res_002a_a'); assertEq(ao.conclusion, null); assertEq(ao.next_experiment_ids.length, 0); assertEq(ao.terminal, null); });
  test('mut: recordOutcome sentinel keeps own conclusion/next', () => { const t = sampleTree(); recordOutcome(t, 'exp_002a', { result_id: 'other', conclusion: 'weird', next: 'exp_003', note: 'n' }, { user: 'AK' }); const ao = t.experiments.exp_002a.actual_outcome; assertEq(ao.result_id, 'other'); assertEq(ao.conclusion, 'weird'); assertEq(ao.next_experiment_ids[0], 'exp_003'); });
  test('mut: setResultField conclusion on complete logs audit with reason', () => { const t = sampleTree(); setResultField(t, 'exp_001', 'res_001a', 'conclusion', 'new', { user: 'AK', reason: 'reviewer note' }); const log = t.experiments.exp_001.audit_log; assertEq(log.length, 1); assert(log[0].field.indexOf('conclusion') >= 0); assertEq(log[0].reason, 'reviewer note'); });
  test('mut: setResultField conclusion on non-complete does not log', () => { const t = sampleTree(); setResultField(t, 'exp_002a', 'res_002a_a', 'conclusion', 'x', { user: 'AK' }); assertEq((t.experiments.exp_002a.audit_log || []).length, 0); });
  test('mut: setExperimentField verdict on complete logs audit', () => { const t = sampleTree(); setExperimentField(t, 'exp_001', 'hypothesis_verdict', 'refuted', { user: 'AK' }); assert((t.experiments.exp_001.audit_log || []).some((a) => a.field === 'hypothesis_verdict')); });
  test('mut: deleteExperiment removes node and inbound links', () => { const t = sampleTree(); deleteExperiment(t, 'exp_002a'); assert(!t.experiments.exp_002a); assert(!(t.experiments.exp_001.possible_results.find((r) => r.id === 'res_001a').next_experiment_ids || []).includes('exp_002a')); });
  test('workflow: build a small valid tree from scratch', () => { const t = { schema_version: '1.0', tree_id: 'x', title: 'x', root_experiment_id: null, terminal_types: { target_achieved: { label: 'Target achieved', kind: 'success' }, halt: { label: 'Halt', kind: 'stop' } }, metadata: {}, experiments: {} }; const a = addExperiment(t, { name: 'A' }); const kr = addKeyRead(t, a); setKeyReadField(t, a, kr, 'name', 'Voltage'); const r1 = addResult(t, a); addCriterion(t, a, r1); setCriterionField(t, a, r1, 0, 'key_read_id', kr); setCriterionField(t, a, r1, 0, 'op', '>'); setCriterionField(t, a, r1, 0, 'value', '0.6'); const b = addExperiment(t, { name: 'B' }); setResultLink(t, a, r1, { kind: 'next', expId: b }); const r2 = addResult(t, b); setResultLink(t, b, r2, { kind: 'terminal', type: 'target_achieved' }); recordOutcome(t, a, { result_id: r1 }, { user: 'AK' }); t.experiments[a].status = 'complete'; assert(!validateTree(t).some((i) => i.level === 'error'), 'clean'); assertEq(t.experiments[a].possible_results[0].criteria.length, 1); assertEq(t.experiments[a].possible_results[0].criteria[0].value, '0.6'); const reach = computeReachability(t); assertEq(reach[a], 'active'); assertEq(reach[b], 'active'); });
  test('norm: legacy string criteria migrates to one structured row', () => { const t = { experiments: { e1: { id: 'e1', possible_results: [{ id: 'r', criteria: 'V >= 0.6' }] } } }; normalizeTree(t); const c = t.experiments.e1.possible_results[0].criteria; assert(Array.isArray(c)); assertEq(c.length, 1); assertEq(c[0].value, 'V >= 0.6'); assertEq(c[0].key_read_id, null); assertEq(t.experiments.e1.toggle, ''); assert(Array.isArray(t.experiments.e1.key_reads)); });
  test('norm: array criteria untouched; empty string -> []', () => { const t = { experiments: { e1: { id: 'e1', possible_results: [{ id: 'r1', criteria: [{ key_read_id: 'k', op: '>', value: '1' }] }, { id: 'r2', criteria: '' }] } } }; normalizeTree(t); assertEq(t.experiments.e1.possible_results[0].criteria.length, 1); assertEq(t.experiments.e1.possible_results[1].criteria.length, 0); });
  test('keyread: add/set, and remove nulls referencing criteria', () => { const t = sampleTree(); const kr = addKeyRead(t, 'exp_003'); setKeyReadField(t, 'exp_003', kr, 'name', 'Mass'); assert(t.experiments.exp_003.key_reads.some((k) => k.id === kr && k.name === 'Mass')); removeKeyRead(t, 'exp_001', 'kr_001_v'); assert(!t.experiments.exp_001.key_reads.some((k) => k.id === 'kr_001_v')); assertEq(t.experiments.exp_001.possible_results.flatMap((r) => r.criteria).filter((c) => c.key_read_id === 'kr_001_v').length, 0); });
  test('criterion: add/set/remove', () => { const t = sampleTree(); addCriterion(t, 'exp_003', 'res_003_a'); const arr = t.experiments.exp_003.possible_results[0].criteria; const n = arr.length; assert(n >= 2); setCriterionField(t, 'exp_003', 'res_003_a', n - 1, 'value', '42'); assertEq(arr[n - 1].value, '42'); removeCriterion(t, 'exp_003', 'res_003_a', n - 1); assertEq(t.experiments.exp_003.possible_results[0].criteria.length, n - 1); });
  test('criterion: edit on complete experiment logs audit', () => { const t = sampleTree(); setCriterionField(t, 'exp_001', 'res_001a', 0, 'value', '0.7'); assert((t.experiments.exp_001.audit_log || []).some((a) => a.field.indexOf('criteria') >= 0)); });
  test('criteriaText: formats name/op/value/unit and joins multiples', () => { const t = sampleTree(); const exp = t.experiments.exp_001; const txt = criteriaText(exp.possible_results[1], exp.key_reads); assert(txt.indexOf('Cell voltage') >= 0 && txt.indexOf('✗') >= 0 && txt.indexOf('>') >= 0 && txt.indexOf('·') >= 0); });
  test('validate rule 11: criterion without a key read warns', () => { const t = sampleTree(); t.experiments.exp_003.possible_results[0].criteria = [{ key_read_id: null, op: '>', value: '1' }]; assert(hasIssue(validateTree(t), 11, 'warning')); });
  test('op: labels map <=/>= to glyphs and pass others through', () => { assertEq(opLabel('<='), '≤'); assertEq(opLabel('>='), '≥'); assertEq(opLabel('<'), '<'); assertEq(opLabel('='), '='); assertEq(opLabel('>'), '>'); assertEq(opLabel('zz'), 'zz'); });
  test('criteriaText: renders ≤ for a <= criterion', () => { assertEq(criteriaText({ criteria: [{ key_read_id: 'k', op: '<=', value: '0.6' }] }, [{ id: 'k', name: 'V', unit: 'V' }]), 'V ≤ 0.6 V'); });
  test('emptyTree: no experiments, seeded terminal types, no root', () => { const t = emptyTree(); assertEq(Object.keys(t.experiments).length, 0); assertEq(t.root_experiment_id, null); assert(t.terminal_types.target_achieved && t.terminal_types.halt); assertEq(t.schema_version, SCHEMA_VERSION); });
  test('validate: empty tree has no errors (rule 1 suppressed)', () => { const issues = validateTree(emptyTree()); assertEq(issues.filter((i) => i.level === 'error').length, 0); assert(!hasIssue(issues, 1)); });
  test('validate: non-empty tree with no root still errors', () => { const t = emptyTree(); t.experiments.e1 = { id: 'e1', code: 'E1', name: 'x', possible_results: [{ id: 'r', criteria: [], conclusion: '', next_experiment_ids: ['e1'], terminal: null }], actual_outcome: null, audit_log: [] }; assert(hasIssue(validateTree(t), 1, 'error')); });
  test('reachability: falls back to declared root under multi-root', () => { const t = sampleTree(); t.experiments.exp_solo = { id: 'exp_solo', code: 'X', name: 'x', hypothesis: '', hypothesis_verdict: null, test: '', status: 'planned', owner: '', planned_date: null, completed_date: null, notes: '', possible_results: [], actual_outcome: null, audit_log: [] }; const r = computeReachability(t); assertEq(r.exp_001, 'active'); assertEq(r.exp_002a, 'active'); assert(r.exp_solo === undefined, 'separate component stays neutral'); });
  test('critText: direction glyph + critical + unit', () => { assertEq(critText({ direction: '>=', critical_value: '0.6', unit: 'V' }), '≥ 0.6 V'); assertEq(critText({ direction: '<=', critical_value: '', unit: 'Ω' }), '≤ ? Ω'); });
  test('criteriaText: hit renders ✓ with the read\'s target', () => { assertEq(criteriaText({ criteria: [{ key_read_id: 'k', status: 'hit' }] }, [{ id: 'k', name: 'V', unit: 'V', direction: '>=', critical_value: '0.6' }]), 'V ✓ (≥ 0.6 V)'); });
  test('criteriaText: miss renders ✗ with the read\'s target', () => { assertEq(criteriaText({ criteria: [{ key_read_id: 'k', status: 'miss' }] }, [{ id: 'k', name: 'V', unit: 'V', direction: '<=', critical_value: '0.1' }]), 'V ✗ (≤ 0.1 V)'); });
  test('criteriaText: mixed hit + manual on one result', () => { assertEq(criteriaText({ criteria: [{ key_read_id: 'k', status: 'miss' }, { key_read_id: 'k', op: '>', value: '0.4' }] }, [{ id: 'k', name: 'V', unit: 'V', direction: '>=', critical_value: '0.6' }]), 'V ✗ (≥ 0.6 V)  ·  V > 0.4 V'); });
  test('addKeyRead: new read carries blank critical + ≥ direction', () => { const t = sampleTree(); const id = addKeyRead(t, 'exp_003'); const k = t.experiments.exp_003.key_reads.find((x) => x.id === id); assertEq(k.critical_value, ''); assertEq(k.direction, '>='); });
  test('normalizeTree: backfills key-read target + repeat fields', () => { const t = { experiments: { e: { id: 'e', key_reads: [{ id: 'k', name: 'V' }], possible_results: [] } } }; normalizeTree(t); const k = t.experiments.e.key_reads[0]; assertEq(k.critical_value, ''); assertEq(k.direction, '>='); assertEq(t.experiments.e.repeat_of, null); assert(t.experiments.e.overrides && typeof t.experiments.e.overrides === 'object'); });
  test('setKeyReadStatus: add, toggle, and clear a hit/miss criterion', () => { const t = sampleTree(); setKeyReadStatus(t, 'exp_002b', 'res_002b_a', 'kr_002b_fer', 'hit'); let c = t.experiments.exp_002b.possible_results[0].criteria.find((x) => x.key_read_id === 'kr_002b_fer' && x.status); assertEq(c.status, 'hit'); setKeyReadStatus(t, 'exp_002b', 'res_002b_a', 'kr_002b_fer', 'miss'); c = t.experiments.exp_002b.possible_results[0].criteria.find((x) => x.key_read_id === 'kr_002b_fer' && x.status); assertEq(c.status, 'miss'); setKeyReadStatus(t, 'exp_002b', 'res_002b_a', 'kr_002b_fer', ''); c = t.experiments.exp_002b.possible_results[0].criteria.find((x) => x.key_read_id === 'kr_002b_fer' && x.status); assert(!c, 'cleared'); });
  test('validate rule 12: hit/miss criterion needs a critical value', () => { const t = sampleTree(); t.experiments.exp_002a.key_reads.find((k) => k.id === 'kr_002a_dv').critical_value = ''; assert(hasIssue(validateTree(t), 12, 'warning')); });
  test('validate: sample has no rule-11 or rule-12 warnings', () => { const issues = validateTree(sampleTree()); assert(!hasIssue(issues, 11), 'no rule 11'); assert(!hasIssue(issues, 12), 'no rule 12'); });
  test('makeRepeat: linked copy with independent identity + next-steps', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); const rep = t.experiments[rid]; const src = t.experiments.exp_002a; assertEq(rep.repeat_of, 'exp_002a'); assertEq(rep.code, 'EXP-2A·R1'); assertEq(rep.name, src.name + ' (repeat)'); assertEq(rep.hypothesis, src.hypothesis); assertEq(rep.key_reads.length, src.key_reads.length); assertEq(rep.possible_results.length, src.possible_results.length); assertEq(rep.possible_results[0].source_result_id, src.possible_results[0].id); assertEq(rep.possible_results[0].next_experiment_ids.length, 0); assertEq(rep.status, 'planned'); assert(rep.actual_outcome === null); });
  test('makeRepeat: second repeat increments the suffix', () => { const t = sampleTree(); makeRepeat(t, 'exp_002a'); const r2 = makeRepeat(t, 'exp_002a'); assertEq(t.experiments[r2].code, 'EXP-2A·R2'); });
  test('syncRepeats: source hypothesis + key_reads propagate to a clean repeat', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); setExperimentField(t, 'exp_002a', 'hypothesis', 'SOURCE CHANGED'); setKeyReadField(t, 'exp_002a', 'kr_002a_dv', 'critical_value', '7'); syncRepeats(t); assertEq(t.experiments[rid].hypothesis, 'SOURCE CHANGED'); assertEq(t.experiments[rid].key_reads.find((k) => k.id === 'kr_002a_dv').critical_value, '7'); });
  test('syncRepeats: result definitions propagate but the repeat\'s next-step is preserved', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); const rrid = t.experiments[rid].possible_results[0].id; setResultLink(t, rid, rrid, { kind: 'terminal', type: 'halt' }); assert(!t.experiments[rid].overrides.possible_results, 'next-step does not break link'); setResultField(t, 'exp_002a', 'res_002a_a', 'label', 'Performance held v2'); syncRepeats(t); const rr = t.experiments[rid].possible_results.find((x) => x.source_result_id === 'res_002a_a'); assertEq(rr.label, 'Performance held v2'); assert(rr.terminal && rr.terminal.type === 'halt', 'next-step preserved'); });
  test('repeat: editing hypothesis breaks only that link', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); setExperimentField(t, rid, 'hypothesis', 'Custom'); assert(t.experiments[rid].overrides.hypothesis === true); setExperimentField(t, 'exp_002a', 'hypothesis', 'SRC'); setExperimentField(t, 'exp_002a', 'toggle', 'SRC TOG'); syncRepeats(t); assertEq(t.experiments[rid].hypothesis, 'Custom'); assertEq(t.experiments[rid].toggle, 'SRC TOG'); });
  test('repeat: editing a key read breaks the key_reads link', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); const kid = t.experiments[rid].key_reads[0].id; setKeyReadField(t, rid, kid, 'critical_value', '99'); assert(t.experiments[rid].overrides.key_reads === true); setKeyReadField(t, 'exp_002a', kid, 'critical_value', '5'); syncRepeats(t); assertEq(t.experiments[rid].key_reads[0].critical_value, '99'); });
  test('repeat: editing a result definition breaks the possible_results link', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); const rrid = t.experiments[rid].possible_results[0].id; setResultField(t, rid, rrid, 'label', 'Repeat-specific'); assert(t.experiments[rid].overrides.possible_results === true); setResultField(t, 'exp_002a', 'res_002a_a', 'label', 'SRC LABEL'); syncRepeats(t); assertEq(t.experiments[rid].possible_results[0].label, 'Repeat-specific'); });
  test('relinkField: clears an override so the field re-syncs', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); setExperimentField(t, rid, 'hypothesis', 'Custom'); setExperimentField(t, 'exp_002a', 'hypothesis', 'SRC'); syncRepeats(t); assertEq(t.experiments[rid].hypothesis, 'Custom'); relinkField(t, rid, 'hypothesis'); syncRepeats(t); assertEq(t.experiments[rid].hypothesis, 'SRC'); });
  test('deleteExperiment: unlinks repeats of the deleted source', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); assertEq(t.experiments[rid].repeat_of, 'exp_002a'); deleteExperiment(t, 'exp_002a'); assertEq(t.experiments[rid].repeat_of, null); });
  test('syncRepeats: self-heals a dangling repeat_of', () => { const t = sampleTree(); t.experiments.exp_003.repeat_of = 'ghost'; syncRepeats(t); assertEq(t.experiments.exp_003.repeat_of, null); });
  test('buildGraphElements: repeat node is marked and its connector says \'repeat\'', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); setResultLink(t, 'exp_002a', 'res_002a_a', { kind: 'next', expId: rid }); const g = buildGraphElements(t, computeReachability(t)); const node = g.nodes.find((n) => n.data.id === rid); assert(node.data.repeat === true); assert(node.data.label.indexOf('↻ ') === 0); const edge = g.edges.find((e) => e.data.target === rid); assertEq(edge.data.label, 'repeat'); });
  test('accomplishments: normalizeTree defaults to []', () => { const t = { experiments: { e: { id: 'e', possible_results: [{ id: 'r', label: 'x' }] } } }; normalizeTree(t); assert(Array.isArray(t.experiments.e.possible_results[0].accomplishments)); assertEq(t.experiments.e.possible_results[0].accomplishments.length, 0); });
  test('addAccomplishment: stage_gate flag, blank label, reserved gate_id', () => { const t = sampleTree(); const id = addAccomplishment(t, 'exp_003', 'res_003_a'); const a = t.experiments.exp_003.possible_results[0].accomplishments.find((x) => x.id === id); assertEq(a.type, 'stage_gate'); assertEq(a.label, ''); assertEq(a.gate_id, null); });
  test('setAccomplishmentField + removeAccomplishment', () => { const t = sampleTree(); const id = addAccomplishment(t, 'exp_003', 'res_003_a'); setAccomplishmentField(t, 'exp_003', 'res_003_a', id, 'label', 'SG-9'); assertEq(t.experiments.exp_003.possible_results[0].accomplishments.find((x) => x.id === id).label, 'SG-9'); removeAccomplishment(t, 'exp_003', 'res_003_a', id); assert(!t.experiments.exp_003.possible_results[0].accomplishments.some((x) => x.id === id)); });
  test('isResultObserved: true only for the recorded result', () => { const t = sampleTree(); assert(isResultObserved(t.experiments.exp_001, 'res_001a')); assert(!isResultObserved(t.experiments.exp_001, 'res_001b')); assert(!isResultObserved(t.experiments.exp_002a, 'res_002a_a')); });
  test('collectAccomplishments: sample shows SG-1 cleared, SG-2 would-clear', () => { const all = collectAccomplishments(sampleTree()); const sg1 = all.find((a) => a.label.indexOf('SG-1') === 0); const sg2 = all.find((a) => a.label.indexOf('SG-2') === 0); assert(sg1 && sg1.realized === true, 'SG-1 realized'); assert(sg2 && sg2.realized === false, 'SG-2 potential'); });
  test('makeRepeat: clones accomplishments into the repeat\'s definitions', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); const rr = t.experiments[rid].possible_results.find((x) => x.source_result_id === 'res_002a_a'); assert(rr.accomplishments && rr.accomplishments.length === 1); assertEq(rr.accomplishments[0].label, 'SG-2: Catalyst loading validated'); });
  test('syncRepeats: source accomplishment change propagates to a clean repeat', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); setAccomplishmentField(t, 'exp_002a', 'res_002a_a', t.experiments.exp_002a.possible_results[0].accomplishments[0].id, 'label', 'SG-2b'); syncRepeats(t); const rr = t.experiments[rid].possible_results.find((x) => x.source_result_id === 'res_002a_a'); assertEq(rr.accomplishments[0].label, 'SG-2b'); });
  test('repeat: editing an accomplishment breaks the possible_results link', () => { const t = sampleTree(); const rid = makeRepeat(t, 'exp_002a'); const rrid = t.experiments[rid].possible_results.find((x) => x.source_result_id === 'res_002a_a').id; const aid = t.experiments[rid].possible_results.find((x) => x.id === rrid).accomplishments[0].id; setAccomplishmentField(t, rid, rrid, aid, 'label', 'Repeat gate'); assert(t.experiments[rid].overrides.possible_results === true); setAccomplishmentField(t, 'exp_002a', 'res_002a_a', t.experiments.exp_002a.possible_results[0].accomplishments[0].id, 'label', 'SRC gate'); syncRepeats(t); assertEq(t.experiments[rid].possible_results.find((x) => x.id === rrid).accomplishments[0].label, 'Repeat gate'); });
  test('buildGraphElements: flagged result edge carries acc data', () => { const t = sampleTree(); const g = buildGraphElements(t, computeReachability(t)); const e1 = g.edges.find((e) => e.data.source === 'exp_001' && e.data.target === 'exp_002a'); assertEq(e1.data.acc, true); assertEq(e1.data.accRealized, true); const e2 = g.edges.find((e) => e.data.source === 'exp_002a' && e.data.target === 'exp_003'); assertEq(e2.data.acc, true); assertEq(e2.data.accRealized, false); });
  test('toRenderElements: flagged edge pill is prefixed with ⚑', () => { const t = sampleTree(); const ge = buildGraphElements(t, computeReachability(t)); const g = toRenderElements(ge.nodes, ge.edges); const pill = g.nodes.find((n) => n.data.kind === 'edgelabel' && n.data.acc); assert(pill && pill.data.label.indexOf('⚑') === 0); });
  test('validate rule 13: stage-gate flag needs a label', () => { const t = sampleTree(); addAccomplishment(t, 'exp_003', 'res_003_a'); assert(hasIssue(validateTree(t), 13, 'warning')); });
  test('validate: sample has no rule-13 warnings (flags labelled)', () => { assert(!hasIssue(validateTree(sampleTree()), 13)); });
  function runTests() {
    return TESTS.map((t) => { try { t.fn(); return { name: t.name, pass: true, error: '' }; } catch (e) { return { name: t.name, pass: false, error: String(e && e.message ? e.message : e) }; } });
  }

  const core = {
    SCHEMA_VERSION, SENTINELS, isSentinel, enumerateEdges, childrenByParent, resolveParents, findRoots, effectiveRoot, selectedVia,
    computeReachability, resolveOutcome, traversedPath, terminalReached, branchState, buildGraphElements, toRenderElements,
    pushAudit, newExperimentId, suggestCode, newResultId, addExperiment, deleteExperiment, makeRepeat, relinkField, syncRepeats,
    addResult, removeResult, setResultLink, setExperimentField, setResultField, recordOutcome, recordOutcomePatch, clearOutcome,
    isResultObserved, addAccomplishment, removeAccomplishment, setAccomplishmentField, collectAccomplishments, normalizeTree,
    markOverride, OPS, opLabel, DIRS, critText, criteriaText, newKeyReadId, addKeyRead, removeKeyRead, setKeyReadField,
    addCriterion, removeCriterion, setCriterionField, setKeyReadStatus, validateTree, sampleTree, emptyTree, terminalTypes,
    lastAuditTs, currentExperiments, focusedSubgraph, buildFocusedTree, buildWaterfallModel, wfFitLabel, wfLabelLayout,
    etbApplyOp, etbEvalCriterion, etbMatchResults, etbCritText, fmt, STAT_SHORT, runTests, TESTS, todayISO, nowIso
  };
  return { core: core, setClock: setClock };
})();

/* ============================================================================
   Calm layer: tree access, edits, layout. Everything below reads C.D through
   ctx (the shell's context) and writes only through C.mutate.
   ========================================================================== */
(function (E) {
  const X = E.core;
  const EXEC = APP !== 'sales';
  E.EXEC = EXEC;
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

  /* ---------------------------------------------------------- words */
  E.STATUS = { planned: 'Planned', in_progress: 'In progress', complete: 'Complete' };
  E.STATUS_TONE = { planned: 'none', in_progress: 'info', complete: 'ok' };
  E.REACH = { active: 'Active', pending: 'Pending', not_pursued: 'Not pursued' };
  E.KIND_TONE = { success: 'ok', pause: 'warn', stop: 'bad' };
  E.statusWord = (s) => E.STATUS[s] || F.cap(String(s || 'planned').replace(/_/g, ' '));
  E.statusCls = (s) => 'st ' + F.tone(E.STATUS_TONE[s] || 'none');
  E.termTone = (term, types) => { const k = (types && term && types[term.type] && types[term.type].kind) || 'stop'; return E.KIND_TONE[k] || 'bad'; };
  E.editor = (C) => String((C.state && C.state.etb_editor) || (C.D && C.D.me && C.D.me.name) || '');   // the audit name; the signed-in person until set
  /* the name is kept in this browser as today (localStorage etb_editor_v1); blocked storage keeps it for this visit (audit A2) */
  E.editorStored = () => { try { const ls = typeof window !== 'undefined' ? window.localStorage : null; return String((ls && ls.getItem('etb_editor_v1')) || ''); } catch (e) { return ''; } };
  E.setEditor = (C, name) => { const v = String(name == null ? '' : name).trim(); C.setState({ etb_editor: v }); try { const ls = typeof window !== 'undefined' ? window.localStorage : null; if (ls) { if (v) ls.setItem('etb_editor_v1', v); else ls.removeItem('etb_editor_v1'); } } catch (e) { /* this visit only */ } };
  E.time = (ms) => F.time(ms);
  E.isoTime = (iso) => { const t = Date.parse(iso || ''); return isFinite(t) ? F.stamp(t) : (iso || '—'); };

  /* ---------------------------------------------------------- trees */
  E.bagOf = (ctx) => { const d = ctx && ctx.doc; return d && d.etbTrees && ctx.objId ? d.etbTrees[ctx.objId] : null; };
  function viewOf(t) { const v = clone(t) || {}; if (!v.experiments || typeof v.experiments !== 'object') v.experiments = {}; X.normalizeTree(v); X.syncRepeats(v); return v; }
  E.viewOf = viewOf;
  /* every tree on the selected objective, normalised copies for display (memoised per render) */
  E.trees = function (C, ctx) {
    return C.memo('etb.trees:' + (ctx.docKey || '') + ':' + (ctx.objId || ''), () => {
      const bag = E.bagOf(ctx);
      const w = RD.etbTreesOf(bag);
      const list = w.trees.map((t) => ({ tid: t.tid, name: t.name || 'Tree', title: t.title || '', view: viewOf(t) }));
      let active = list.find((x) => x.tid === w.activeTid) || list[0] || null;
      const virtual = !active;
      if (!active) {
        const v = X.emptyTree(ctx.objId || 'none'); v.project_id = ctx.objId || null;
        active = { tid: 't_main', name: 'Main', title: v.title, view: viewOf(v), virtual: true };
      }
      return { bag: bag || null, schema: w.schema, list: list, activeTid: active.tid, active: active, virtual: virtual };
    });
  };
  E.entry = function (C, ctx, tid) { const T = E.trees(C, ctx); if (!tid || tid === T.activeTid) return T.active; return T.list.find((x) => x.tid === tid) || null; };

  /* the live tree inside the document; creates the container (and a 'Main' tree) when asked */
  E.live = function (D, ctx, tid, create) {
    const doc = D.docs[ctx.docKey];
    if (!doc || !ctx.objId) return null;
    if (!doc.etbTrees || typeof doc.etbTrees !== 'object') doc.etbTrees = {};
    let bag = doc.etbTrees[ctx.objId];
    if (!bag) {
      if (!create) return null;
      const t = X.emptyTree(ctx.objId); t.project_id = ctx.objId; t.tid = 't_main'; t.name = 'Main';
      doc.etbTrees[ctx.objId] = { schema: 2, trees: [t], activeTid: 't_main' };
      return (!tid || tid === 't_main') ? t : null;
    }
    if (!Array.isArray(bag.trees)) {           // schema 1: wrap once, keeping every field (RD.etbTreesOf rule)
      const w = RD.etbTreesOf(bag);
      doc.etbTrees[ctx.objId] = { schema: 2, trees: w.trees, activeTid: w.activeTid };
      bag = doc.etbTrees[ctx.objId];
    } else if (bag.schema !== 2) bag.schema = 2;
    const want = tid || RD.etbTreesOf(bag).activeTid;
    return bag.trees.find((t) => t && t.tid === want) || null;
  };

  /* KPI pool and the objective's linkable KPIs (today's allKpisPool / hubProjectKpis). allKpisPool also holds the
     in-scope spec targets, which give a spec-linked KPI its name, unit and direction ("H₂ in O₂", not the stored
     "H₂ in O₂ crossover"), so take the KPI module's copy of it; this doc + the portfolio is the fallback (audit A2) */
  E.pool = (C, ctx) => C.memo('etb.pool:' + ctx.docKey, () => {
    try { if (typeof KPI !== 'undefined' && KPI && typeof KPI.pool === 'function') { const p = KPI.pool(C, ctx); if (Array.isArray(p)) return p; } } catch (e) { /* fall back below */ }
    return ((ctx.doc && ctx.doc.kpis) || []).concat((ctx.P && ctx.P.kpis) || []);
  });
  E.kpiById = (C, ctx, id) => E.pool(C, ctx).find((k) => k.id === id) || null;
  function linkRank(k) { const h = k.hostType; if (h === 'initiative' || h === 'milestone') return 5; if (h === 'product') return 4; if (h === 'component') return 3; if (h === 'keyResult') return 2; if (h === 'stageGate') return 1; return 0; }
  const GROUP = { 5: 'Initiative', 4: 'Product', 3: 'Component', 2: 'Key results', 1: 'Stage-gates' };
  E.kpiHostLabel = function (ctx, k) {
    const doc = ctx.doc || {};
    if (k.hostType === 'keyResult') { const krs = (doc.keyResults || []).filter((x) => x.objectiveId === ctx.objId); const i = krs.findIndex((x) => x.id === k.hostId); const kr = krs[i] || (doc.keyResults || []).find((x) => x.id === k.hostId); return { short: (i >= 0 && krs[i].trackingType === 'milestone') ? 'KR-M' + krs.slice(0, i + 1).filter((x) => x.trackingType === 'milestone').length : 'KR' + (i >= 0 ? (i + 1) : ''), long: 'Key result ' + (i >= 0 ? (i + 1) : '') + (kr ? ': ' + (kr.statement || kr.id) : '') }; }
    if (k.hostType === 'stageGate') { const g = (doc.stageGates || []).find((x) => x.id === k.hostId); const nm = (g && (g.name || g.gate_id)) || k.hostId; return { short: 'gate ' + nm, long: 'Stage-gate: ' + nm }; }
    return { short: k.hostType || 'KPI', long: k.hostType || 'KPI' };
  };
  E.projectKpis = function (C, ctx) {
    return C.memo('etb.pk:' + ctx.docKey + ':' + ctx.objId, () => {
      const AK = E.pool(C, ctx), out = [], seen = {};
      AK.forEach((k) => {
        if (k.objectiveId !== ctx.objId || k.hostType === 'task' || k.pull || seen[k.id]) return; seen[k.id] = 1;   // a pulled KPI takes no readings (mods/pull)
        const dir = RD.kpiDirection(k, AK);
        const lab = E.kpiHostLabel(ctx, k);
        out.push({ gid: k.id, name: (RD.kpiName(k, AK) || k.id), unit: (RD.kpiUnit(k, AK) || ''), direction: ((dir === 'down' || dir === 'decrease') ? '<=' : '>='), label: lab.long, short: lab.short, group: GROUP[linkRank(k)] || 'Other' });
      });
      return out;
    });
  };
  /* linked key reads show the KPI's name and unit (today's refreshLinkedKeyRead) */
  E.linkInfo = function (C, ctx, k) {
    if (!k || !k.source_kpi_gid) return { custom: true, name: (k && k.name) || '', unit: (k && k.unit) || '' };
    const p = E.projectKpis(C, ctx).find((x) => x.gid === k.source_kpi_gid);
    if (p) return { linked: true, name: p.name, unit: p.unit, label: p.label, short: p.short };
    return { unlinked: true, name: k.name || '', unit: k.unit || '' };
  };
  E.krName = (C, ctx, k) => E.linkInfo(C, ctx, k).name || k.id;
  E.krUnit = (C, ctx, k) => E.linkInfo(C, ctx, k).unit || '';
  /* critText with the KPI-following name/unit */
  E.krCrit = (C, ctx, k) => X.critText(Object.assign({}, k, { unit: E.krUnit(C, ctx, k) }));
  E.krCtx = (C, ctx, exp) => ({ kpis: E.pool(C, ctx), execDocs: ctx.em, experiment: exp });
  E.krKpi = (C, ctx, k) => (k && k.source_kpi_gid ? E.kpiById(C, ctx, k.source_kpi_gid) : null);
  E.krStat = (C, ctx, k) => RD.keyReadStat(k || {}, E.krKpi(C, ctx, k));
  E.krCurrent = function (C, ctx, exp, k) { try { return RD.keyReadCurrent(k, E.krCtx(C, ctx, exp)); } catch (e) { return { n: 0, value: null, values: [], complete: false, stat: { statistical: false }, sample: { expected: null }, summary: null }; } };
  /* status follows the data: an outcome means complete, a hand-set status is kept, any measurement means in progress */
  E.derivedStatus = function (C, ctx, exp) {
    if (!exp) return 'planned';
    if (exp.actual_outcome) return 'complete';
    if ((exp.status || 'planned') !== 'planned') return exp.status;
    if (!EXEC) return exp.status || 'planned';
    let any = false; (exp.key_reads || []).forEach((k) => { if (E.krCurrent(C, ctx, exp, k).n) any = true; });
    return any ? 'in_progress' : 'planned';
  };
  E.current = function (entry) { if (!entry) return []; const v = entry.view; const reach = X.computeReachability(v); return X.currentExperiments(v, reach).map((id) => v.experiments[id]).filter(Boolean); };
  E.range = function (entry) {
    const exps = E.current(entry);
    if (!exps.length) return { min: 0, max: 0, unplanned: false, capped: false, text: '0–0' };
    let mn = null, mx = 0, un = false, cap = false;
    exps.forEach((e) => { let r; try { r = RD.nextStepRange(entry.view, e.id); } catch (err) { r = { min: 0, max: 0 }; } if (mn === null || r.min < mn) mn = r.min; if (r.max > mx) mx = r.max; if (r.unplanned) un = true; if (r.capped) cap = true; });
    mn = mn || 0;
    return { min: mn, max: mx, unplanned: un, capped: cap, text: mn + '–' + (cap ? mx + '+' : mx) };
  };

  /* ---------------------------------------------------------- edits */
  function refreshLinked(C, ctx, t) {
    const pk = {}; E.projectKpis(C, ctx).forEach((k) => { pk[k.gid] = k; });
    Object.values(t.experiments || {}).forEach((exp) => (exp.key_reads || []).forEach((k) => {
      const p = k && k.source_kpi_gid ? pk[k.source_kpi_gid] : null;
      if (p) { if (p.name != null && k.name !== p.name) k.name = p.name; if (p.unit != null && k.unit !== p.unit) k.unit = p.unit; }
    }));
  }
  /* ETB.edit: change ONE tree in its slot. fn(tree, D) returns false to abort. */
  E.edit = function (C, ctx, tid, fn, opts) {
    E.setClock(C);
    const ok = C.mutate((D) => {
      const t = E.live(D, ctx, tid, true);
      if (!t) return false;
      const r = fn(t, D);
      if (r === false) return false;
      X.normalizeTree(t); X.syncRepeats(t); refreshLinked(C, ctx, t);
      return r;
    }, opts);
    if (ok) E.touch(C, ctx, 'savedAt');
    return ok;
  };
  E.touch = function (C, ctx, field) {
    const io = Object.assign({}, C.state.etb_io || {});
    const cur = Object.assign({}, io[ctx.objId] || {});
    if (field === 'loadedAt') { cur.loadedAt = C.now(); cur.savedAt = null; } else cur.savedAt = C.now();
    io[ctx.objId] = cur;
    C.setState({ etb_io: io });
  };
  /* container-level edits (never replace the container with a bare tree) */
  function container(D, ctx, create) {
    const doc = D.docs[ctx.docKey]; if (!doc || !ctx.objId) return null;
    if (!doc.etbTrees || typeof doc.etbTrees !== 'object') doc.etbTrees = {};
    const bag = doc.etbTrees[ctx.objId];
    if (!bag && !create) return null;
    if (!bag) { doc.etbTrees[ctx.objId] = { schema: 2, trees: [], activeTid: null }; return doc.etbTrees[ctx.objId]; }
    if (!Array.isArray(bag.trees)) { const w = RD.etbTreesOf(bag); doc.etbTrees[ctx.objId] = { schema: 2, trees: w.trees, activeTid: w.activeTid }; }
    const b = doc.etbTrees[ctx.objId]; b.schema = 2;
    if (!b.activeTid || !b.trees.some((t) => t && t.tid === b.activeTid)) b.activeTid = b.trees[0] ? b.trees[0].tid : null;
    return b;
  }
  E.container = container;
  E.setActive = function (C, ctx, tid) {
    const ro = C.isRo();
    return C.mutate((D) => { const b = container(D, ctx, false); if (!b || !b.trees.some((t) => t.tid === tid)) return false; if (b.activeTid === tid) return false; b.activeTid = tid; }, ro ? { quiet: true, allowRo: true } : {});
  };
  E.newTid = (b) => { let i = (b && b.trees ? b.trees.length : 0) + 1, id; const have = new Set(((b && b.trees) || []).map((t) => t.tid)); do { id = 't_' + (i++).toString(36) + Math.random().toString(36).slice(2, 6); } while (have.has(id)); return id; };
  E.addTree = function (C, ctx, name) {
    E.setClock(C);
    let made = null;
    const ok = C.mutate((D) => {
      const b = container(D, ctx, true); if (!b) return false;
      const t = X.emptyTree(ctx.objId + ':' + (b.trees.length + 1)); t.project_id = ctx.objId;
      t.tid = E.newTid(b);
      const nm = String(name == null ? '' : name).trim();
      t.name = nm || ('Tree ' + (b.trees.length + 1));
      t.title = t.name;
      b.trees = b.trees.concat([t]); b.activeTid = t.tid; made = t;
    }, { msg: 'Logic tree created.' });
    return ok ? made : null;
  };
  E.renameTree = function (C, ctx, tid, name) {
    const nm = String(name == null ? '' : name).trim();
    if (!nm) return false;
    return C.mutate((D) => { const b = container(D, ctx, false); const t = b && b.trees.find((x) => x.tid === tid); if (!t || t.name === nm) return false; t.name = nm; }, { msg: 'Logic tree renamed.' });
  };
  E.reorderTrees = function (C, ctx, order) {
    if (!Array.isArray(order)) return false;
    return C.mutate((D) => {
      const b = container(D, ctx, false); if (!b) return false;
      const byId = {}; b.trees.forEach((t) => { byId[t.tid] = t; });
      const next = [];
      order.forEach((id) => { if (byId[id]) { next.push(byId[id]); delete byId[id]; } });
      b.trees.forEach((t) => { if (byId[t.tid]) next.push(t); });
      if (next.length !== b.trees.length) return false;
      b.trees = next;
    });
  };
  E.treeImpact = function (C, ctx, tid) {
    const T = E.trees(C, ctx); const e = T.list.find((x) => x.tid === tid);
    const out = { experiments: 0, linkedKpis: [], readings: 0, isLast: T.list.length <= 1, isActive: T.activeTid === tid };
    if (!e) return out;
    const exps = e.view.experiments || {}; const ids = Object.keys(exps); out.experiments = ids.length;
    const kpiIds = {}; ids.forEach((id) => ((exps[id] || {}).key_reads || []).forEach((k) => { if (k.source_kpi_gid) kpiIds[k.source_kpi_gid] = 1; }));
    out.linkedKpis = Object.keys(kpiIds);
    out.readings = ((ctx.doc && ctx.doc.kpiUpdates) || []).filter((u) => kpiIds[u.kpiId]).length;
    return out;
  };
  E.deleteTree = function (C, ctx, tid) {
    return C.mutate((D) => {
      const b = container(D, ctx, false); if (!b || b.trees.length <= 1) return false;
      const keep = b.trees.filter((t) => t.tid !== tid); if (keep.length === b.trees.length) return false;
      if (b.activeTid === tid) b.activeTid = keep[0].tid;
      b.trees = keep;
    }, { msg: 'Logic tree deleted.' });
  };

  /* open an experiment: the read-only detail view when it has an outcome, otherwise the editor */
  E.open = function (C, ctx, tid, expId, opts) {
    opts = opts || {};
    const entry = E.entry(C, ctx, tid); const exp = entry && entry.view.experiments[expId];
    if (!exp) return;
    const kind = (exp.actual_outcome && !opts.edit) ? 'etb.detail' : 'etb.exp';
    const fn = opts.push ? 'pushSheet' : 'openSheet';
    C[fn](kind, { tid: entry.tid, expId: expId }, { f: {} });
  };
  /* a result label in the graph opens the editor focused on that one result (today's single-result modal) */
  E.openResult = function (C, ctx, tid, expId, resultId) { C.openSheet('etb.exp', { tid: tid, expId: expId, only: resultId }, { f: {} }); };

  /* ---------------------------------------------------------- inline fields (commit on blur / Enter) */
  E.fkey = (k) => String(k).replace(/[^A-Za-z0-9_-]/g, '_');
  E.field = function (C, key, current, commit, opts) {
    opts = opts || {};
    key = E.fkey(key);
    const sh = C.sheet(); const fd = (sh && sh.d && sh.d.f) || {};
    const cur = current == null ? '' : String(current);
    const has = hasOwn(fd, key);
    const v = has ? String(fd[key]) : cur;
    const drop = () => { const s = C.sheet(); if (!s) return; const f2 = Object.assign({}, (s.d && s.d.f) || {}); delete f2[key]; C.setDraft({ f: f2 }); };
    const commitNow = () => { const s = C.sheet(); const f2 = (s && s.d && s.d.f) || {}; if (!hasOwn(f2, key)) return; const nv = String(f2[key]); drop(); if (nv !== cur) commit(nv); };
    return {
      v: v,
      set: (e) => { const val = e && e.target ? e.target.value : e; const s = C.sheet(); if (!s) return; const f2 = Object.assign({}, (s.d && s.d.f) || {}); f2[key] = val == null ? '' : String(val); C.setDraft({ f: f2 }); },
      commit: commitNow,
      key: (e) => {
        if (e.key === 'Enter' && !opts.multi) { if (e.preventDefault) e.preventDefault(); commitNow(); }
        else if (e.key === 'Escape') { if (e.preventDefault) e.preventDefault(); drop(); if (opts.escClose !== false) C.dismissSheet(e); }
      }
    };
  };
  E.sel = function (value, options, onPick) {
    return { v: value == null ? '' : String(value), opts: options.map((o) => ({ v: String(o.value), label: String(o.label) })), on: (e) => onPick(e && e.target ? e.target.value : e) };
  };

  /* ---------------------------------------------------------- graph layout (template-drawn) */
  function wrapLines(text, maxPx, charPx) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = []; let cur = '';
    for (const w of words) { const trial = cur ? cur + ' ' + w : w; if (!cur || trial.length * charPx <= maxPx) cur = trial; else { lines.push(cur); cur = w; } }
    if (cur) lines.push(cur);
    return lines;
  }
  function nodeDims(label, fontPx, maxTextPx, extraW) {
    const charPx = fontPx * 0.6, lineH = Math.round(fontPx * 1.36), padX = 11, padY = 7;
    let lines = []; for (const part of String(label || '').split('\n')) lines = lines.concat(wrapLines(part, maxTextPx, charPx));
    if (!lines.length) lines = [''];
    const widest = Math.max(fontPx, ...lines.map((l) => l.length * charPx));
    return { w: Math.round(Math.max(46, Math.min(maxTextPx, Math.ceil(widest)) + padX * 2 + (extraW || 0))), h: Math.round(Math.max(28, lines.length * lineH + padY * 2)) };
  }
  /* a tidy top-down layout of the render elements (the label-pill transform), like dagre TB */
  E.layout = function (R, opts) {
    opts = opts || {};
    const NODESEP = opts.nodeSep || 22, RANKSEP = opts.rankSep || 26, PAD = opts.pad || 16;
    const nodes = R.nodes.map((n) => n.data), edges = R.edges.map((e) => e.data);
    const byId = {}; nodes.forEach((n) => { byId[n.id] = n; });
    const dim = {};
    nodes.forEach((n) => {
      if (n.kind === 'experiment') dim[n.id] = nodeDims((n.code || n.id) + '\n' + (n.name || ''), 12, 150, n.repeat ? 14 : 0);
      else if (n.kind === 'edgelabel') dim[n.id] = nodeDims(n.text || n.label, 11, 150, n.acc ? 16 : 0);
      else dim[n.id] = nodeDims(n.label, 11, 120);
    });
    const kids = {}, indeg = {};
    edges.forEach((e) => { if (!byId[e.source] || !byId[e.target]) return; (kids[e.source] = kids[e.source] || []); if (kids[e.source].indexOf(e.target) < 0) kids[e.source].push(e.target); indeg[e.target] = (indeg[e.target] || 0) + 1; });
    const visited = {}, depth = {}, tk = {}, forest = [];
    function dfs(id, d) { visited[id] = 1; depth[id] = d; tk[id] = []; (kids[id] || []).forEach((c) => { if (!visited[c]) { tk[id].push(c); dfs(c, d + 1); } }); }
    nodes.forEach((n) => { if (!indeg[n.id] && !visited[n.id]) { forest.push(n.id); dfs(n.id, 0); } });
    nodes.forEach((n) => { if (!visited[n.id]) { forest.push(n.id); dfs(n.id, 0); } });
    const sw = {};
    function width(id) { let s = 0; tk[id].forEach((c, i) => { s += width(c) + (i ? NODESEP : 0); }); sw[id] = Math.max(dim[id].w, s); return sw[id]; }
    forest.forEach(width);
    const rankH = []; nodes.forEach((n) => { const d = depth[n.id]; rankH[d] = Math.max(rankH[d] || 0, dim[n.id].h); });
    const rankY = []; let y = PAD; for (let d = 0; d < rankH.length; d++) { rankY[d] = y + (rankH[d] || 0) / 2; y += (rankH[d] || 0) + RANKSEP; }
    const pos = {};
    function place(id, left) { const w = sw[id]; pos[id] = { x: left + w / 2, y: rankY[depth[id]] }; let kw = 0; tk[id].forEach((c, i) => { kw += sw[c] + (i ? NODESEP : 0); }); let cx = left + (w - kw) / 2; tk[id].forEach((c) => { place(c, cx); cx += sw[c] + NODESEP; }); }
    let x0 = PAD; forest.forEach((r) => { place(r, x0); x0 += sw[r] + NODESEP * 2; });
    const offs = opts.offsets || {};
    Object.keys(offs).forEach((id) => { if (pos[id]) { pos[id] = { x: pos[id].x + (Number(offs[id].dx) || 0), y: pos[id].y + (Number(offs[id].dy) || 0) }; } });
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    nodes.forEach((n) => { const p = pos[n.id], d = dim[n.id]; minX = Math.min(minX, p.x - d.w / 2); minY = Math.min(minY, p.y - d.h / 2); maxX = Math.max(maxX, p.x + d.w / 2); maxY = Math.max(maxY, p.y + d.h / 2); });
    if (!nodes.length) { minX = 0; minY = 0; }
    const sx = minX < PAD ? PAD - minX : 0, sy = minY < PAD ? PAD - minY : 0;
    if (sx || sy) Object.keys(pos).forEach((id) => { pos[id] = { x: pos[id].x + sx, y: pos[id].y + sy }; });
    const W = Math.max(120, Math.round(maxX + sx + PAD)), H = Math.max(60, Math.round(maxY + sy + PAD));
    const r1 = (v) => Math.round(v * 10) / 10;
    const paths = edges.filter((e) => pos[e.source] && pos[e.target]).map((e) => {
      const a = pos[e.source], b = pos[e.target], da = dim[e.source], db = dim[e.target];
      const x1 = r1(a.x), y1 = r1(a.y + da.h / 2), x2 = r1(b.x), y2 = r1(b.y - db.h / 2);
      let d;
      if (y2 > y1 + 6) { const my = r1(y1 + (y2 - y1) / 2); d = 'M' + x1 + ' ' + y1 + ' V' + my + ' H' + x2 + ' V' + y2; }
      else { const ox = r1(Math.max(a.x + da.w / 2, b.x + db.w / 2) + 16); d = 'M' + x1 + ' ' + y1 + ' V' + r1(y1 + 10) + ' H' + ox + ' V' + r1(y2 - 10) + ' H' + x2 + ' V' + y2; }
      return { id: e.id, d: d, bs: e.branchState || 'pending', arrow: !e.noArrow };
    });
    return { nodes: nodes, pos: pos, dim: dim, paths: paths, W: W, H: H };
  };
  E.fitZoom = (W, H, aw, ah, max) => K.clamp(Math.min(aw / Math.max(W, 1), ah / Math.max(H, 1)), 0.2, max || 1.25);
  /* graph model shared by the editor's Graph view and the current-step mini graphs */
  E.graphParts = function (view, expIds) {
    const reach = X.computeReachability(view);
    const src = expIds ? X.buildFocusedTree(view, expIds) : view;
    const ge = X.buildGraphElements(src, reach);
    return X.toRenderElements(ge.nodes, ge.edges);
  };
  E.nodeBox = function (n, L, types) {
    const p = L.pos[n.id], d = L.dim[n.id];
    const st = 'left:' + Math.round(p.x - d.w / 2) + 'px;top:' + Math.round(p.y - d.h / 2) + 'px;width:' + d.w + 'px;height:' + d.h + 'px';
    const o = { id: n.id, kind: n.kind, style: st, isExp: n.kind === 'experiment', isTerm: n.kind === 'terminal', isNonext: n.kind === 'nonext', isPill: n.kind === 'edgelabel', code: '', name: '', text: '', repeat: false, acc: false, aria: '' };
    if (n.kind === 'experiment') {
      o.code = n.code || n.id; o.name = n.name || ''; o.repeat = !!n.repeat;
      o.cls = 'etb-gn k-exp st-' + (n.status || 'planned') + ' r-' + (n.reach || 'pending');
      o.aria = o.code + ' ' + o.name + (o.repeat ? ', repeat run' : '') + ', ' + E.statusWord(n.status) + (n.reach ? ', ' + E.REACH[n.reach] : '');   /* the repeat icon is decorative; the name says it (audit A2) */
    } else if (n.kind === 'terminal') {
      o.text = n.label; o.cls = 'etb-gn k-term t-' + (n.termType || 'halt') + ' b-' + (n.branchState || 'pending');
      o.aria = 'Terminal: ' + n.label;
    } else if (n.kind === 'nonext') {
      o.text = 'No next step'; o.cls = 'etb-gn k-nonext b-' + (n.branchState || 'pending');
    } else {
      o.text = n.text || n.label; o.acc = !!n.acc; o.cls = 'etb-gn k-pill b-' + (n.branchState || 'pending') + (n.accRealized ? ' acc-done' : '') + (n.observed ? ' obs' : '');
      o.aria = 'Result ' + o.text + (n.acc ? ', clears a stage-gate' : '');
    }
    return o;
  };
})(ETB);

/* ============================================================================
   View models
   ========================================================================== */
(function (E) {
  const X = E.core;
  const EXEC = E.EXEC;
  const noop = () => {};
  const DIRS_APP = EXEC ? X.DIRS : X.DIRS.filter((d) => d.value !== 'range');   // Sales has no "between"
  const STAT_OPTS = [{ value: '', label: 'Single value' }, { value: 'average', label: 'Average' }, { value: 'median', label: 'Median' }, { value: 'stddev', label: 'Std dev' }, { value: 'cv', label: 'CV' }, { value: 'range', label: 'Range' }, { value: 'max', label: 'Max' }, { value: 'min', label: 'Min' }];
  const VIEWS = [['outline', 'Outline'], ['graph', 'Graph'], ['waterfall', 'Waterfall'], ['json', 'JSON'], ['tests', 'Tests']];
  const MON = F.MON;
  const r1 = (v) => (Math.round(v * 10) / 10);

  /* this objective's gates, numbered SG-A1 like the Stage-gates tab (today's picker used SG<n>) */
  function gateOptions(ctx) {
    const doc = ctx.doc || {};
    const chip = (g) => { try { return (typeof GATES !== 'undefined' && GATES.label) ? String(GATES.label(doc, g.id) || '') : ''; } catch (e) { return ''; } };
    const rows = (doc.stageGates || []).filter((g) => g && g.objectiveId === ctx.objId).map((g) => ({ g: g, c: chip(g) }));
    rows.sort((a, b) => a.c.localeCompare(b.c, undefined, { numeric: true }) || String(a.g.name || '').localeCompare(String(b.g.name || '')));
    return [{ value: '', label: 'Choose a stage-gate' }].concat(rows.map((r) => ({ value: r.g.id, label: (r.c && r.c !== r.g.id ? r.c + ' ' : '') + (r.g.name || r.g.id) })));
  }
  function leadOptions(view, expId, withNew) {
    const types = view.terminal_types || {};
    const o = [{ value: 'none', label: 'No next step' }];
    Object.keys(types).forEach((tk) => o.push({ value: 'term:' + tk, label: 'Terminal: ' + (types[tk].label || tk) }));
    Object.keys(view.experiments).filter((id) => id !== expId).forEach((id) => o.push({ value: 'exp:' + id, label: 'Go to ' + (view.experiments[id].code || id) }));
    if (withNew) { o.push({ value: 'new', label: 'Create a new experiment as the next step' }); o.push({ value: 'repeat', label: 'Run a repeat (linked copy)' }); }
    return o;
  }
  function termPill(term, types) { return { text: (term && (term.label || term.type)) || '', cls: 'st ' + F.tone(E.termTone(term, types)) }; }
  /* criteria as plain lines ("Cell voltage: hit (≤ 1.85 V)") */
  function critLines(C, ctx, res, krs) {
    return (Array.isArray(res.criteria) ? res.criteria : []).map((c) => {
      const k = krs.find((x) => x.id === c.key_read_id);
      const name = k ? E.krName(C, ctx, k) : (c.key_read_id || 'No key read chosen');
      if (typeof c.status === 'string') return { text: name + ': ' + (c.status === 'hit' ? 'hit' : 'miss') + (k ? ' (' + E.krCrit(C, ctx, k) + ')' : '') };
      const unit = k ? E.krUnit(C, ctx, k) : '';
      return { text: name + ' ' + X.opLabel(c.op) + ' ' + (c.value == null ? '' : c.value) + (unit ? ' ' + unit : '') };
    });
  }
  function nextInfo(view, res, types) {
    const nextId = (res.next_experiment_ids || [])[0];
    if (res.terminal) { const p = termPill(res.terminal, types); return { isTerm: true, termText: p.text, termCls: p.cls, isExp: false, isNone: false, code: '', name: '' }; }
    if (nextId) { const t = view.experiments[nextId]; return { isTerm: false, termText: '', termCls: '', isExp: true, isNone: false, code: t ? (t.code || nextId) : nextId, name: t ? (t.name || '') : 'missing experiment' }; }
    return { isTerm: false, termText: '', termCls: '', isExp: false, isNone: true, code: '', name: '' };
  }

  /* ---------------------------------------------------------- status line */
  function statusVM(C, ctx, T, entry) {
    const view = entry.view;
    const reach = X.computeReachability(view);
    const counts = { active: 0, pending: 0, not_pursued: 0 };
    Object.values(reach).forEach((v) => { if (counts[v] != null) counts[v]++; });
    const issues = X.validateTree(view);
    const errs = issues.filter((i) => i.level === 'error').length, warns = issues.filter((i) => i.level === 'warning').length;
    const term = X.terminalReached(view);
    const n = Object.keys(view.experiments || {}).length;
    const io = (C.state.etb_io || {})[ctx.objId] || {};
    return {
      title: view.title || 'Untitled',
      count: F.plural(n, 'experiment'),
      reach: counts.active + ' active, ' + counts.pending + ' pending, ' + counts.not_pursued + ' not pursued',
      outcome: term.reached ? 'Outcome so far: ' + term.label : 'Plan in progress',
      hasIssues: errs + warns > 0,
      issues: (errs ? F.plural(errs, 'error') : 'No errors') + (warns ? ', ' + F.plural(warns, 'warning') : ''),
      issuesCls: errs ? 'lnk bad' : 'lnk',
      openIssues: () => C.openSheet('etb.issues', { tid: entry.tid }, {}),
      stored: 'Stored in ' + (ctx.docKey || 'the division document') + (io.savedAt ? ', saved ' + F.time(io.savedAt) : io.loadedAt ? ', loaded ' + F.time(io.loadedAt) : ''),
      errs: errs, warns: warns
    };
  }

  /* ---------------------------------------------------------- outline */
  function outlineVM(C, ctx, entry) {
    const view = entry.view, exps = view.experiments || {}, types = view.terminal_types || {};
    const ids = Object.keys(exps);
    if (!ids.length) return { empty: true, noRoot: false, hasStory: false, story: [], hasAcc: false, accOpen: false, accSum: '', acc: [], toggleAcc: noop, items: [] };
    const root = X.findRoots(view).root;
    const reach = X.computeReachability(view);
    const story = root ? X.traversedPath(view).map((s, i) => {
      const tp = s.terminal ? termPill(s.terminal, types) : null;
      return { first: i === 0, notFirst: i > 0, code: s.code || s.experimentId, result: s.pending ? 'Awaiting result' : (s.resultLabel || ''), pending: !!s.pending, hasTerm: !!tp, term: tp ? tp.text : '', termCls: tp ? tp.cls : '', open: () => E.open(C, ctx, entry.tid, s.experimentId) };
    }) : [];
    const accAll = X.collectAccomplishments(view);
    const cleared = accAll.filter((a) => a.realized).length;
    const accOpen = !!C.state.etb_accOpen;
    const items = [];
    const visited = new Set();
    const indent = (d) => 'margin-left:' + Math.min(d, 8) * 22 + 'px';
    function node(eid, depth) {
      const exp = exps[eid];
      if (!exp) { items.push({ isNode: false, isResult: false, isNote: true, isHead: false, indent: indent(depth), note: 'Missing experiment: ' + eid }); return; }
      if (visited.has(eid)) { items.push({ isNode: false, isResult: false, isNote: true, isHead: false, indent: indent(depth), note: 'Already shown above: ' + (exp.code || eid) }); return; }
      visited.add(eid);
      const r = reach[eid];
      const ao = exp.actual_outcome; const out = X.resolveOutcome(exp);
      let outcome = '';
      if (ao) {
        if (out.kind === 'sentinel') outcome = 'Outcome: ' + (ao.result_id === 'other' ? 'unanticipated' : 'inconclusive') + (ao.note ? '. ' + ao.note : '') + (out.conclusion ? '. Conclusion: ' + out.conclusion : '');
        else outcome = 'Outcome: ' + (out.label || ao.result_id) + (ao.recorded_date ? ', recorded ' + ao.recorded_date : '') + (ao.recorded_by ? ' by ' + ao.recorded_by : '');
      }
      const src = exp.repeat_of ? exps[exp.repeat_of] : null;
      items.push({
        isNode: true, isResult: false, isNote: false, isHead: false, indent: indent(depth), key: 'ol-' + eid,
        cls: 'etb-on r-' + (r || 'none'),
        code: exp.code || eid, name: exp.name || '', statusW: E.statusWord(exp.status || 'planned'), statusCls: E.statusCls(exp.status || 'planned'),
        hasReach: !!r, reachW: r ? E.REACH[r] : '',
        isRepeat: !!exp.repeat_of, repeatOf: 'Repeat of ' + ((src && src.code) || exp.repeat_of || ''),
        hasVerdict: !!exp.hypothesis_verdict, verdict: 'Hypothesis ' + (exp.hypothesis_verdict || ''),
        hasHyp: !!exp.hypothesis, hyp: exp.hypothesis || '', hasTest: !!exp.test, test: exp.test || '',
        hasOutcome: !!ao, outcome: outcome, hasNotes: !!exp.notes, notes: exp.notes || '',
        open: () => E.open(C, ctx, entry.tid, eid)
      });
      (exp.possible_results || []).forEach((res) => {
        const observed = !!(ao && !X.isSentinel(ao.result_id) && ao.result_id === res.id);
        const nx = nextInfo(view, res, types);
        items.push({
          isNode: false, isResult: true, isNote: false, isHead: false, indent: indent(depth), key: 'olr-' + res.id,
          cls: 'etb-or' + (observed ? ' obs' : ''), label: res.label || res.id, observed: observed,
          crit: critLines(C, ctx, res, exp.key_reads || []),
          acc: (res.accomplishments || []).map((a) => ({ text: (observed ? 'Cleared: ' : 'Would clear: ') + (a.label || 'Unnamed gate'), cls: 'tag' + (observed ? ' etb-tag-ok' : '') })),
          hasAcc: (res.accomplishments || []).length > 0,
          hasConcl: !!res.conclusion, concl: res.conclusion || '', next: nx
        });
        const nextId = (res.next_experiment_ids || [])[0];
        if (nextId && exps[nextId]) node(nextId, depth + 1);
      });
      if (out && out.kind === 'sentinel' && out.nextId && exps[out.nextId]) node(out.nextId, depth + 1);
    }
    if (root) node(root, 0); else ids.forEach((id) => node(id, 0));
    const orphans = ids.filter((id) => !visited.has(id));
    if (orphans.length) {
      items.push({ isNode: false, isResult: false, isNote: false, isHead: true, indent: '', head: 'Unattached experiments', note: 'Not reachable from the root, usually a broken or missing next-step reference.' });
      orphans.forEach((id) => node(id, 0));
    }
    return {
      empty: false, noRoot: !root, hasStory: story.length > 0, story: story,
      hasAcc: accAll.length > 0, accOpen: accOpen, accSum: cleared + ' cleared, ' + (accAll.length - cleared) + ' would clear',
      toggleAcc: () => C.setState({ etb_accOpen: !accOpen }),
      acc: accAll.map((a) => ({ label: a.label || 'Unnamed gate', realized: a.realized, cls: 'st ' + (a.realized ? 't-ok' : 't-none'), meta: (a.realized ? 'Cleared by ' : 'Would be cleared by ') + a.exp_code + ', ' + a.result_label })),
      items: items
    };
  }

  /* ---------------------------------------------------------- full screen (October 22) */
  /* The logic tree can take the whole screen: the panel covers the window (etb-full: above the page, below sheets,
     dialogs and toasts, so an experiment still opens over it) and, where the browser allows it, the page goes full
     screen too. Leaving the browser's full screen (Esc) leaves this as well. The button ends it, and so does Escape
     inside the panel where the browser couldn't go full screen (a Confluence embed, a phone). Not remembered. */
  function setFull(C, on, e) {
    C.setState({ etb_full: !!on });
    const doc = e && e.currentTarget && e.currentTarget.ownerDocument;
    if (!doc) return;
    try {
      if (on) {
        const root = doc.documentElement;
        if (!doc.fullscreenEnabled || !root || typeof root.requestFullscreen !== 'function' || doc.fullscreenElement) return;
        const sync = () => {
          if (doc.fullscreenElement) { C.setState({ etb_fsAt: Date.now() }); return; }   // in: fit the graph to the screen
          doc.removeEventListener('fullscreenchange', sync);
          if (C.state.etb_full) C.setState({ etb_full: false });   // out (Esc): this goes too
        };
        doc.addEventListener('fullscreenchange', sync);
        const p = root.requestFullscreen();
        if (p && typeof p.catch === 'function') p.catch(() => doc.removeEventListener('fullscreenchange', sync));
      } else if (doc.fullscreenElement && typeof doc.exitFullscreen === 'function') {
        const p = doc.exitFullscreen();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (x) { /* the panel still fills the window */ }
  }
  /* the room the graph's own fit aims at: in full screen the window less the panel's bars, else the panel's */
  function fitBox(C) {
    const w = typeof window !== 'undefined' && window ? Number(window.innerWidth) || 0 : 0;
    const h = typeof window !== 'undefined' && window ? Number(window.innerHeight) || 0 : 0;
    return C.state.etb_full && w > 0 && h > 0 ? [Math.max(860, w - 64), Math.max(520, h - 250)] : [860, 520];
  }

  /* ---------------------------------------------------------- moving around the graph (October 22) */
  /* As the old Cytoscape graph did: the graph sits in a fixed area and moves inside it. The wheel (a trackpad's
     scroll or pinch too) zooms around the pointer at the old graph's speed, a sideways swipe moves it sideways,
     dragging the background (a finger too) moves it anywhere, and two fingers pinch; an experiment dragged still
     moves itself. Zoom and shift are per tree (etb_zoom, etb_pan; never saved); Fit and Re-layout go back to the fit
     at the top left, and the + and - buttons zoom around the middle of the area. C._etbG is the graph as last drawn
     ({ key, fitZ }); C._etbVp the area's size as last measured. */
  const ZMIN = 0.2, ZMAX = 2.5;
  /* zoom to z1, keeping the graph point under (cx, cy) in the area where it is */
  function zoomAt(C, g, z1, cx, cy) {
    const zs = C.state.etb_zoom || {}, ps = C.state.etb_pan || {};
    const z0 = zs[g.key] != null ? zs[g.key] : g.fitZ;
    const p0 = ps[g.key] || { x: 0, y: 0 };
    const z = K.clamp(z1, ZMIN, ZMAX);
    const gx = (cx - p0.x) / z0, gy = (cy - p0.y) / z0;
    C.setState({ etb_zoom: Object.assign({}, zs, { [g.key]: z }), etb_pan: Object.assign({}, ps, { [g.key]: { x: cx - gx * z, y: cy - gy * z } }) });
  }
  function shiftTo(C, key, x, y) {
    const ps = C.state.etb_pan || {};
    C.setState({ etb_pan: Object.assign({}, ps, { [key]: { x: x, y: y } }) });
  }
  function measure(C, el) { if (el && el.clientWidth > 0 && el.clientHeight > 0) C._etbVp = { w: el.clientWidth, h: el.clientHeight }; }
  function wheelMove(C, el, ev) {
    const g = C._etbG;
    if (!g || !el || !ev) return;
    const dy = Number(ev.deltaY) || 0, dx = Number(ev.deltaX) || 0;
    if (!dx && !dy) return;
    if (typeof ev.preventDefault === 'function') ev.preventDefault();   // over the graph the wheel is the graph's
    measure(C, el);
    const unit = ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 100 : 1;   // a line as 33 px (as Cytoscape counted), a page as a notch
    if (!ev.ctrlKey && Math.abs(dx) > Math.abs(dy)) {   // a sideways swipe moves it sideways
      const p0 = (C.state.etb_pan || {})[g.key] || { x: 0, y: 0 };
      shiftTo(C, g.key, p0.x - dx * unit, p0.y - dy * unit);
      return;
    }
    const zs = C.state.etb_zoom || {};
    const z0 = zs[g.key] != null ? zs[g.key] : g.fitZ;
    const r = el.getBoundingClientRect();
    zoomAt(C, g, z0 * Math.pow(10, -dy * unit / 250), ev.clientX - r.left - (el.clientLeft || 0), ev.clientY - r.top - (el.clientTop || 0));   // Cytoscape's rate
  }
  /* the wheel needs a listener that may stop the page scrolling (React's own wheel listener can't), added the first
     time the pointer comes over the graph area (or presses or scrolls there) */
  function armWheel(C) {
    return (e) => {
      const el = e && e.currentTarget;
      measure(C, el);
      if (!el || el.__etbWheel || typeof el.addEventListener !== 'function') return;
      el.__etbWheel = true;
      el.addEventListener('wheel', (ev) => wheelMove(C, el, ev), { passive: false });
    };
  }
  /* dragging the background: one pointer moves the graph, two (fingers) pinch, zooming around the point between them
     and moving with it. C._etbPan is the gesture under way: { key, fitZ, pts: { pointerId: { x, y } }, base, moved };
     base is where it (re)started, taken again whenever a pointer comes or goes. */
  function panBase(C, p, el) {
    const ids = Object.keys(p.pts), a = p.pts[ids[0]], c = p.pts[ids[1]];
    const zs = C.state.etb_zoom || {}, p0 = (C.state.etb_pan || {})[p.key] || { x: 0, y: 0 };
    if (!c) { p.base = { x: a.x, y: a.y, px: p0.x, py: p0.y }; return; }
    const z0 = zs[p.key] != null ? zs[p.key] : p.fitZ;
    const r = el.getBoundingClientRect(), ox = r.left + (el.clientLeft || 0), oy = r.top + (el.clientTop || 0);
    const mx = (a.x + c.x) / 2 - ox, my = (a.y + c.y) / 2 - oy;
    p.base = { two: true, d: Math.max(1, Math.hypot(a.x - c.x, a.y - c.y)), z: z0, gx: (mx - p0.x) / z0, gy: (my - p0.y) / z0, ox: ox, oy: oy };
  }
  function graphPan(C, arm) {
    return {
      down: (e) => {
        arm(e);
        const el = e && e.currentTarget, g = C._etbG;
        if (!el || !g || e.button) return;
        const t = e.target;
        if (t && typeof t.closest === 'function' && t.closest('button')) return;   // an experiment or a result: its own
        let p = C._etbPan;
        if (!p || p.key !== g.key) p = C._etbPan = { key: g.key, fitZ: g.fitZ, pts: {}, moved: false };
        if (Object.keys(p.pts).length >= 2) return;   // a third finger: no part in it
        p.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (Object.keys(p.pts).length === 2) { p.moved = true; if (el.classList) el.classList.add('etb-panning'); }
        panBase(C, p, el);
        try { el.setPointerCapture(e.pointerId); } catch (x) { /* not capturable */ }
      },
      move: (e) => {
        const p = C._etbPan, el = e && e.currentTarget;
        if (!p || !el || !p.pts[e.pointerId]) return;
        p.pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        const ids = Object.keys(p.pts), a = p.pts[ids[0]], c = p.pts[ids[1]], b = p.base;
        if (!b.two) {
          const dx = a.x - b.x, dy = a.y - b.y;
          if (!p.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
          if (!p.moved) { p.moved = true; if (el.classList) el.classList.add('etb-panning'); }
          shiftTo(C, p.key, b.px + dx, b.py + dy);
          return;
        }
        const z = K.clamp(b.z * Math.hypot(a.x - c.x, a.y - c.y) / b.d, ZMIN, ZMAX);
        const mx = (a.x + c.x) / 2 - b.ox, my = (a.y + c.y) / 2 - b.oy;
        C.setState({ etb_zoom: Object.assign({}, C.state.etb_zoom || {}, { [p.key]: z }), etb_pan: Object.assign({}, C.state.etb_pan || {}, { [p.key]: { x: mx - b.gx * z, y: my - b.gy * z } }) });
      },
      up: (e) => {
        const p = C._etbPan, el = e && e.currentTarget;
        if (!p || !e || !p.pts[e.pointerId]) return;   // not one of the gesture's pointers
        delete p.pts[e.pointerId];
        try { if (el) el.releasePointerCapture(e.pointerId); } catch (x) { /* already released */ }
        if (Object.keys(p.pts).length && el) { panBase(C, p, el); return; }   // one finger left: it goes on moving the graph
        C._etbPan = null;
        if (el && el.classList) el.classList.remove('etb-panning');
      }
    };
  }

  /* ---------------------------------------------------------- graph view */
  function graphVM(C, ctx, entry) {
    const view = entry.view;
    if (!Object.keys(view.experiments || {}).length) return { empty: true, nodes: [], edges: [], W: 0, H: 0, area: '', canvas: '', zoomText: '', fit: noop, zin: noop, zout: noop, relayout: noop };
    const key = ctx.objId + '|' + entry.tid;
    const R = E.graphParts(view);
    const offs = (C.state.etb_off || {})[key] || {};
    const L = E.layout(R, { offsets: offs });
    const zmap = C.state.etb_zoom || {};
    const box = fitBox(C);
    const fitZ = E.fitZoom(L.W, L.H, box[0], box[1], 1.25);
    const z = zmap[key] != null ? zmap[key] : fitZ;
    const shift = (C.state.etb_pan || {})[key] || { x: 0, y: 0 };
    /* the area: in the panel as tall as the graph at its fit (240 to 560 px), so zooming never moves the page; in full
       screen it takes the room that's left */
    const areaH = Math.round(Math.min(560, Math.max(240, L.H * fitZ + 2)));
    const types = view.terminal_types || {};
    const g = C._etbG = { key: key, fitZ: fitZ };
    const arm = armWheel(C);
    /* the middle of the area, measured from the button pressed where it can be */
    const mid = (e) => {
      const b = e && e.currentTarget, v = b && typeof b.closest === 'function' ? b.closest('.etb-gview') : null;
      measure(C, v && typeof v.querySelector === 'function' ? v.querySelector('.etb-gwrap') : null);
      const vp = C._etbVp;
      return vp ? [vp.w / 2, vp.h / 2] : [box[0] / 2, (C.state.etb_full ? box[1] : areaH) / 2];
    };
    const reset = (alsoOffsets) => {
      const zs = Object.assign({}, C.state.etb_zoom || {}), ps = Object.assign({}, C.state.etb_pan || {});
      delete zs[key]; delete ps[key];
      const patch = { etb_zoom: zs, etb_pan: ps };
      if (alsoOffsets) { patch.etb_off = Object.assign({}, C.state.etb_off || {}); delete patch.etb_off[key]; }
      C.setState(patch);
    };
    const nodes = L.nodes.map((n) => {
      const b = E.nodeBox(n, L, types);
      b.isPillBtn = EXEC && b.isPill && !!(n.expId && n.resultId);
      b.isStatic = !b.isExp && !b.isPillBtn;
      if (b.isExp) {
        b.open = () => { if (C._etbMoved) { C._etbMoved = false; return; } E.open(C, ctx, entry.tid, n.id); };
        b.down = (e) => { if (e && e.button) return; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* not capturable */ } const o = offs[n.id] || {}; C._etbDrag = { key: key, id: n.id, x0: e.clientX, y0: e.clientY, ox: o.dx || 0, oy: o.dy || 0, z: z, moved: false }; C._etbMoved = false; };
        b.move = (e) => {
          const dg = C._etbDrag; if (!dg || dg.id !== n.id || dg.key !== key) return;
          const dx = (e.clientX - dg.x0) / dg.z, dy = (e.clientY - dg.y0) / dg.z;
          if (!dg.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
          dg.moved = true;
          const all = Object.assign({}, C.state.etb_off || {}); const m = Object.assign({}, all[key] || {});
          m[n.id] = { dx: Math.round(dg.ox + dx), dy: Math.round(dg.oy + dy) }; all[key] = m;
          C.setState({ etb_off: all });
        };
        b.up = () => { const dg = C._etbDrag; C._etbDrag = null; C._etbMoved = !!(dg && dg.moved); };
      } else if (b.isPillBtn) {
        b.open = () => E.openResult(C, ctx, entry.tid, n.expId, n.resultId);
      }
      return b;
    });
    const edges = L.paths.map((p) => ({ d: p.d, cls: 'etb-e b-' + p.bs, mk: p.arrow ? 'url(#etbm-' + p.bs + ')' : 'none' }));
    return {
      empty: false, nodes: nodes, edges: edges, W: L.W, H: L.H,
      area: C.state.etb_full ? '' : 'height:' + areaH + 'px',
      canvas: 'width:' + L.W + 'px;height:' + L.H + 'px;transform:translate(' + shift.x.toFixed(1) + 'px,' + shift.y.toFixed(1) + 'px) scale(' + z.toFixed(3) + ')',
      zoomText: Math.round(z * 100) + '%',
      fit: () => reset(false),
      zin: (e) => { const m = mid(e); zoomAt(C, g, z * 1.2, m[0], m[1]); },
      zout: (e) => { const m = mid(e); zoomAt(C, g, z / 1.2, m[0], m[1]); },
      /* the wheel zooms around the pointer; dragging the background moves around; two fingers pinch */
      arm: arm,
      pan: graphPan(C, arm),
      relayout: () => reset(true)
    };
  }

  /* ---------------------------------------------------------- waterfall */
  /* The chart is drawn at its area's own width, as today's app drew it (at least 680 px), so its text keeps its
     size on any screen: drawn 920 wide and stretched to the area, its text grew half again in full screen and more
     than doubled on a large monitor (October 22). The width is measured once the chart is on screen, and again
     when the window or full screen changes it; until then it is the last one measured, or 920.
     C._etbWfW is that width. */
  function wfMeasure(C) {
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc || typeof doc.querySelector !== 'function' || C._etbWfAsk) return;
    C._etbWfAsk = true;
    const run = () => {
      C._etbWfAsk = false;
      const el = doc.querySelector('[data-k="etb"] .etb-wfwrap');
      const w = el ? Math.round(Number(el.clientWidth) || 0) : 0;
      if (w > 0 && w !== C._etbWfW) { C._etbWfW = w; C.bump(); }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
    if (!C._etbWfRs && typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
      C._etbWfRs = () => wfMeasure(C);
      window.addEventListener('resize', C._etbWfRs);
    }
  }
  function wfVM(C, ctx, entry) {
    const model = X.buildWaterfallModel(entry.view, X.todayISO());
    if (!model.rows.length) return { empty: true };
    wfMeasure(C);
    const W = Math.max(680, C._etbWfW || 920), leftPad = 156, rightPad = 26, topPad = 64, rowH = 46, barH = 28;
    const H = topPad + model.rows.length * rowH + 78;
    const minD = model.domain.minDay; let maxD = model.domain.maxDay; if (maxD <= minD) maxD = minD + 1;
    const plotL = leftPad, plotR = W - rightPad;
    const Xd = (day) => plotL + (day - minD) / (maxD - minD) * (plotR - plotL);
    const barY = (i) => topPad + i * rowH + (rowH - barH) / 2;
    const fmtDay = (d) => { const dt = new Date(d * 86400000); return MON[dt.getUTCMonth()] + ' ' + dt.getUTCDate(); };
    const gy0 = topPad - 8, gy1 = topPad + model.rows.length * rowH + 6;
    const byId = {}; model.rows.forEach((r) => { byId[r.id] = r; });
    model.rows.forEach((r) => { if (r.kind !== 'terminal') return; const label = r.label || 'Halt'; r._cw = Math.max(40, label.length * 7 + 18); let px = Xd(r.startDay) + 6; if (px > plotR - r._cw) px = plotR - r._cw; if (px < plotL) px = plotL; r._px = px; });
    const months = [];
    const d0 = new Date(minD * 86400000);
    let cur = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1) / 86400000;
    while (cur <= maxD) {
      if (cur >= minD) { const gx = r1(Xd(cur)); const md = new Date(cur * 86400000); months.push({ x: gx, y0: gy0, y1: gy1, tx: r1(gx + 4), ty: topPad - 14, label: MON[md.getUTCMonth()] }); }
      const nd = new Date(cur * 86400000); cur = Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth() + 1, 1) / 86400000;
    }
    const tx = r1(Xd(model.todayDay));
    const links = [];
    model.edges.forEach((e) => { const p = byId[e.from], c = byId[e.to]; if (!p || !c) return; const x1 = Xd(p.endDay), y1 = barY(p.row) + barH / 2, x2 = Xd(c.startDay), y2 = barY(c.row) + barH / 2, midx = Math.max(x1 + 10, x2 - 10); links.push({ cls: 'etb-wf-link', d: 'M' + r1(x1) + ' ' + r1(y1) + ' H' + r1(midx) + ' V' + r1(y2) + ' H' + r1(x2) }); });
    model.rows.forEach((r) => { if (r.kind !== 'terminal') return; const p = byId[r.from]; if (!p) return; const x1 = Xd(p.endDay), y1 = barY(p.row) + barH / 2, x2 = r._px, y2 = barY(r.row) + barH / 2, midx = Math.max(x1 + 10, x2 - 10); links.push({ cls: 'etb-wf-tlink', d: 'M' + r1(x1) + ' ' + r1(y1) + ' H' + r1(midx) + ' V' + r1(y2) + ' H' + r1(x2) }); });
    const rows = model.rows.map((r) => {
      const y = barY(r.row);
      if (r.kind === 'terminal') {
        return { isTerm: true, isExp: false, key: r.id, lx: 14, ly: r1(y + barH / 2 + 4), ltext: r.result || 'Terminal', px: r1(r._px), py: r1(y), pw: r._cw, ph: barH, cls: 'etb-wf-term t-' + (r.type || 'halt'), tx: r1(r._px + r._cw / 2), ty: r1(y + barH / 2 + 4), ttext: r.label || 'Halt' };
      }
      const x1 = Xd(r.startDay), x2 = Xd(r.endDay), w = Math.max(x2 - x1, 18), ly = y + barH / 2;
      const lead = (r.leadIn == null) ? 'Kick-off' : (r.leadIn || 'Result');
      const blabel = r.code + (r.name ? ' ' + r.name : '');
      const maxExt = Math.max(0, Math.min(plotR - x1 - 4, 240));
      const lay = X.wfLabelLayout(blabel.length, w, maxExt); const bw = (lay.mode === 'extend') ? lay.labelW : w;
      /* a name that fits neither in nor along its bar goes after the bar as drawn (a short one is drawn 18 wide), else
         before it (clear of the arrow coming in); with room for it on neither side it goes on the roomier one, cut
         short (the whole name shows on hover, and in the experiment). Before, it was drawn over its bar at the
         chart's right edge. */
      const xe = x1 + w, est = blabel.length * 6.6;
      const roomAfter = plotR - (xe + 8), roomBefore = (x1 - 14) - (plotL + 4);
      const after = est <= roomAfter || (est > roomBefore && roomAfter >= roomBefore);
      const fit = Math.floor((after ? roomAfter : roomBefore) / 6.6);
      const cut = lay.mode === 'outside' && est > (after ? roomAfter : roomBefore) && fit >= 8;
      return {
        isTerm: false, isExp: true, key: r.id,
        lead: lead, leadX: 14, leadY: r1(ly - 3), dates: r.projected ? 'Projected' : (fmtDay(r.startDay) + ' to ' + fmtDay(r.endDay)), datesY: r1(ly + 11),
        bx: r1(x1), by: r1(y), bw: r1(bw), bh: barH, barCls: 'etb-wf-bar st-' + (r.status || 'planned') + (r.projected ? ' proj' : ''),
        ext: lay.mode === 'extend', ex: r1(x1 + w), ey1: r1(y), ey2: r1(y + barH),
        inside: lay.mode !== 'outside', ix: r1(x1 + 8), iy: r1(y + barH / 2 + 4), isz: lay.fontSize, text: blabel,
        outside: lay.mode === 'outside', ox: after ? r1(xe + 8) : r1(x1 - 14), oy: r1(y + barH / 2 + 4), oanchor: after ? 'start' : 'end',
        otext: cut ? blabel.slice(0, fit - 1).replace(/\s+$/, '') + '…' : blabel, cut: cut,
        aria: 'Open ' + blabel,
        open: () => E.open(C, ctx, entry.tid, r.id, { edit: true }),
        key2: (e) => { if (e.key === 'Enter' || e.key === ' ') { if (e.preventDefault) e.preventDefault(); E.open(C, ctx, entry.tid, r.id, { edit: true }); } }
      };
    });
    const ly2 = topPad + model.rows.length * rowH + 40;
    return { empty: false, W: W, H: H, vb: '0 0 ' + W + ' ' + H, months: months, today: { x: tx, y0: gy0, y1: gy1, ty: gy1 + 14 }, links: links, rows: rows, legendY: ly2 - 10, legendTy: ly2 };
  }

  /* ---------------------------------------------------------- JSON view */
  function treeJson(entry) { const v = Object.assign({}, entry.view); return JSON.stringify(v, null, 2); }
  function jsonVM(C, ctx, entry) {
    const key = ctx.objId + '|' + entry.tid;
    const jd = C.state.etb_json && C.state.etb_json.key === key ? C.state.etb_json : null;
    const text = jd ? jd.text : treeJson(entry);
    const msg = C.state.etb_jsonMsg && C.state.etb_jsonMsg.key === key ? C.state.etb_jsonMsg : null;
    const iss = C.state.etb_jsonIssues && C.state.etb_jsonIssues.key === key ? C.state.etb_jsonIssues : null;
    const setMsg = (t, kind) => C.setState({ etb_jsonMsg: { key: key, text: t, kind: kind } });
    const setIss = (list, empty) => C.setState({ etb_jsonIssues: { key: key, list: list, empty: empty || '' } });
    const parse = () => { try { return { ok: true, v: JSON.parse(text) } ; } catch (e) { return { ok: false, err: e && e.message ? e.message : String(e) }; } };
    const checkDoc = (p) => {
      if (!p || typeof p !== 'object' || Array.isArray(p) || !p.experiments || typeof p.experiments !== 'object' || Array.isArray(p.experiments)) return 'The document must be an object with an “experiments” map.';
      const bad = Object.keys(p.experiments).find((k) => !p.experiments[k] || typeof p.experiments[k] !== 'object' || Array.isArray(p.experiments[k]));
      if (bad) return 'Experiment “' + bad + '” must be an object.';
      return '';
    };
    const issueRows = (list) => list.map((i) => ({ text: 'Rule ' + i.rule + ': ' + i.message, cls: 'etb-iss ' + i.level }));
    return {
      text: text,
      set: (e) => C.setState({ etb_json: { key: key, text: e && e.target ? e.target.value : '' }, etb_jsonMsg: null }),
      format: () => { const p = parse(); if (!p.ok) { setMsg('Invalid JSON: ' + p.err, 'err'); return; } C.setState({ etb_json: { key: key, text: JSON.stringify(p.v, null, 2) }, etb_jsonMsg: { key: key, text: 'Formatted.', kind: 'ok' } }); },
      validate: () => {
        const p = parse(); if (!p.ok) { setIss([{ text: 'JSON parse error: ' + p.err, cls: 'etb-iss error' }]); return; }
        let list; try { const t = JSON.parse(JSON.stringify(p.v)); X.normalizeTree(t); list = X.validateTree(t); } catch (e) { setIss([{ text: 'Could not validate this document: ' + (e && e.message ? e.message : e), cls: 'etb-iss error' }]); return; }
        setIss(issueRows(list), list.length ? '' : 'No validation issues.');
      },
      apply: () => {
        const p = parse(); if (!p.ok) { setIss([{ text: 'JSON parse error: ' + p.err, cls: 'etb-iss error' }]); return; }
        const bad = checkDoc(p.v); if (bad) { setIss([{ text: bad, cls: 'etb-iss error' }]); return; }
        const parsed = p.v;
        const ok = E.edit(C, ctx, entry.tid, (t) => {
          const keep = { tid: t.tid, name: parsed.name || t.name, project_id: t.project_id || ctx.objId };
          Object.keys(t).forEach((k) => { delete t[k]; });
          Object.assign(t, JSON.parse(JSON.stringify(parsed)), keep);
        }, { msg: 'Logic tree JSON applied.' });
        if (!ok) return;
        const t2 = JSON.parse(JSON.stringify(parsed)); X.normalizeTree(t2);   // the memo predates the edit: validate the applied copy
        const list = X.validateTree(t2);
        C.setState({ etb_json: null, etb_jsonMsg: null, etb_jsonIssues: { key: key, list: issueRows(list), empty: list.length ? '' : 'Applied. No validation issues.' } });
      },
      revert: () => C.setState({ etb_json: null, etb_jsonMsg: null, etb_jsonIssues: null }),
      copy: () => C.copyText(text, 'Logic tree JSON copied to the clipboard.', 'Copy didn’t work here. Select the text and copy it instead.'),
      msg: msg ? msg.text : '', hasMsg: !!msg, msgCls: msg && msg.kind === 'err' ? 'err' : 'okn',
      hasIssues: !!(iss && (iss.list.length || iss.empty)), issues: iss ? iss.list : [], issEmpty: iss ? iss.empty : '', hasEmpty: !!(iss && iss.empty)
    };
  }

  /* ---------------------------------------------------------- tests */
  function testsVM(C) {
    const t = C.state.etb_tests;
    const run = () => C.setState({ etb_tests: { results: X.runTests() } });
    if (!t) return { run: run, has: false, summary: 'Not run yet.', sumCls: 'sub', rows: [] };
    const passed = t.results.filter((r) => r.pass).length;
    return {
      run: run, has: true,
      summary: passed + ' of ' + t.results.length + ' passed', sumCls: passed === t.results.length ? 'okn' : 'err',
      rows: t.results.map((r) => ({ name: r.name, word: r.pass ? 'Pass' : 'Fail', cls: 'st ' + (r.pass ? 't-ok' : 't-bad'), hasErr: !r.pass, error: r.error }))
    };
  }

  /* ---------------------------------------------------------- one result card (editor + single-result sheet) */
  function resultVM(C, ctx, entry, exp, res, complete, edit) {
    const view = entry.view, types = view.terminal_types || {}, expId = exp.id, rid = res.id;
    const ao = exp.actual_outcome;
    const observed = !!(ao && !X.isSentinel(ao.result_id) && ao.result_id === rid);
    const user = E.editor(C);
    const fld = (k, cur, commit, o) => E.field(C, 'r_' + k + '_' + rid, cur, commit, o);
    const krs = exp.key_reads || [];
    const crits = Array.isArray(res.criteria) ? res.criteria : [];
    const sh = C.sheet(); const dd = (sh && sh.d) || {};
    const amending = dd.amend === rid;
    const gates = (ctx.doc && ctx.doc.stageGates) || [];
    const gopts = gateOptions(ctx);
    const realized = X.isResultObserved(exp, rid);
    const linkVal = res.terminal ? ('term:' + res.terminal.type) : ((res.next_experiment_ids || [])[0] ? ('exp:' + res.next_experiment_ids[0]) : 'none');
    const nextId = (res.next_experiment_ids || [])[0];
    const manual = [];
    crits.forEach((c, idx) => {
      if (typeof c.status === 'string') return;
      const k = krs.find((x) => x.id === c.key_read_id); const unit = k ? E.krUnit(C, ctx, k) : '';
      manual.push({
        key: rid + '-c' + idx,
        kr: E.sel(c.key_read_id || '', [{ value: '', label: 'Choose a key read' }].concat(krs.map((x) => ({ value: x.id, label: E.krName(C, ctx, x) }))), (v) => edit((t) => X.setCriterionField(t, expId, rid, idx, 'key_read_id', v || null))),
        op: E.sel(c.op || '>', X.OPS, (v) => edit((t) => X.setCriterionField(t, expId, rid, idx, 'op', v))),
        val: fld('cv' + idx, c.value, (v) => edit((t) => X.setCriterionField(t, expId, rid, idx, 'value', v))),
        ph: unit ? 'value (' + unit + ')' : 'value',
        rm: () => edit((t) => X.removeCriterion(t, expId, rid, idx), { msg: 'Criterion removed.' })
      });
    });
    return {
      key: 'res-' + rid, id: rid, cls: 'etb-res' + (observed ? ' obs' : ''), observed: observed,
      radioName: 'obs-' + expId,
      pick: (e) => { if (e && e.target && e.target.checked === false) return; edit((t) => X.recordOutcome(t, expId, { result_id: rid, recorded_by: user }, { user: user }), { msg: 'Observed result recorded.' }); },
      label: fld('lbl', res.label, (v) => edit((t) => X.setResultField(t, expId, rid, 'label', v, { user: user }))),
      remove: () => C.confirm({ title: 'Remove the result “' + (res.label || rid) + '”?', body: (observed ? 'It is the recorded outcome, so that outcome is cleared too. ' : '') + 'Its criteria, conclusion and next step go with it.', ok: 'Remove result', danger: true, onOk: () => edit((t) => X.removeResult(t, expId, rid), { msg: 'Result removed.' }) }),
      hm: krs.map((k) => {
        const pf = crits.find((c) => c.key_read_id === k.id && typeof c.status === 'string');
        return { key: rid + '-hm-' + k.id, name: E.krName(C, ctx, k), tgt: E.krCrit(C, ctx, k), sel: E.sel(pf ? pf.status : '', [{ value: '', label: 'Not used' }, { value: 'hit', label: 'Hit' }, { value: 'miss', label: 'Miss' }], (v) => edit((t) => X.setKeyReadStatus(t, expId, rid, k.id, v))) };
      }),
      noKrs: !krs.length, manual: manual,
      addCrit: () => edit((t) => X.addCriterion(t, expId, rid)),
      conclEdit: !complete, conclRo: complete && !amending, amending: complete && amending,
      concl: fld('concl', res.conclusion, (v) => edit((t) => X.setResultField(t, expId, rid, 'conclusion', v, { user: user })), { multi: true }),
      conclText: res.conclusion || '—',
      amend: () => C.setDraft({ amend: rid, amendText: res.conclusion || '', amendReason: '', amendErr: '' }),
      amendText: dd.amendText == null ? '' : String(dd.amendText), setAmendText: (e) => C.setDraft({ amendText: e && e.target ? e.target.value : '' }),
      amendReason: dd.amendReason == null ? '' : String(dd.amendReason), setAmendReason: (e) => C.setDraft({ amendReason: e && e.target ? e.target.value : '' }),
      amendErr: dd.amendErr || '', hasAmendErr: !!dd.amendErr,
      saveAmend: () => {
        const s = C.sheet(); const d2 = (s && s.d) || {}; const reason = String(d2.amendReason || '').trim();
        if (!reason) { C.setDraft({ amendErr: 'A reason is required.' }); return; }
        const txt = String(d2.amendText == null ? '' : d2.amendText);
        if (edit((t) => X.setResultField(t, expId, rid, 'conclusion', txt, { user: user, reason: reason }), { msg: 'Conclusion amended.' })) C.setDraft({ amend: null, amendText: '', amendReason: '', amendErr: '' });
      },
      cancelAmend: () => C.setDraft({ amend: null, amendText: '', amendReason: '', amendErr: '' }),
      acc: (res.accomplishments || []).map((a) => ({
        key: rid + '-a-' + a.id, realized: realized, flag: realized ? 'Cleared' : 'Would clear', flagCls: 'st ' + (realized ? 't-ok' : 't-none'),
        sel: E.sel(a.gate_id || '', gopts, (gid) => edit((t) => { const g = gates.find((x) => x.id === gid); X.setAccomplishmentField(t, expId, rid, a.id, 'gate_id', gid || null); X.setAccomplishmentField(t, expId, rid, a.id, 'label', g ? (g.name || g.id) : ''); })),
        rm: () => edit((t) => X.removeAccomplishment(t, expId, rid, a.id), { msg: 'Stage-gate flag removed.' }),
        legacy: !a.gate_id && !!a.label, legacyText: 'Was “' + (a.label || '') + '”. Pick the matching stage-gate to link it.'
      })),
      noAcc: !(res.accomplishments || []).length,
      addAcc: () => edit((t) => X.addAccomplishment(t, expId, rid)),
      lead: E.sel(linkVal, leadOptions(view, expId, true), (v) => {
        if (v === 'repeat') { let code = ''; const ok = edit((t) => { const nid = X.makeRepeat(t, expId); if (!nid) return false; X.setResultLink(t, expId, rid, { kind: 'next', expId: nid }); code = t.experiments[nid].code; }); if (ok) C.toast('Created repeat ' + code + ' and linked it.', 'ok'); return; }
        if (v === 'new') { let code = ''; const ok = edit((t) => { const nid = X.addExperiment(t, {}); X.setResultLink(t, expId, rid, { kind: 'next', expId: nid }); code = t.experiments[nid].code; }); if (ok) C.toast('Created ' + code + ' and linked it.', 'ok'); return; }
        edit((t) => {
          if (v.indexOf('term:') === 0) X.setResultLink(t, expId, rid, { kind: 'terminal', type: v.slice(5) });
          else if (v.indexOf('exp:') === 0) X.setResultLink(t, expId, rid, { kind: 'next', expId: v.slice(4) });
          else X.setResultLink(t, expId, rid, { kind: 'none' });
        });
      }),
      hasNext: !!(nextId && view.experiments[nextId]), nextCode: nextId && view.experiments[nextId] ? (view.experiments[nextId].code || nextId) : '',
      openNext: () => { if (nextId) E.open(C, ctx, entry.tid, nextId, { edit: true }); }
    };
  }

  /* ---------------------------------------------------------- editor sheet ("drawer") */
  function editorVM(C, ctx, sh) {
    const entry = E.entry(C, ctx, sh.data.tid);
    const exp = entry && entry.view.experiments[sh.data.expId];
    if (!exp) return { missing: true, ok: false, title: 'Experiment not found', close: () => C.closeSheet() };
    const view = entry.view, tid = entry.tid, expId = exp.id;
    const ro = C.isRo(), user = E.editor(C), types = view.terminal_types || {};
    const reach = X.computeReachability(view); const rr = reach[expId];
    const onlyRes = sh.data.only ? (exp.possible_results || []).find((x) => x.id === sh.data.only) : null;
    const only = !!onlyRes;
    const complete = only ? (exp.status === 'complete' || !!exp.actual_outcome) : exp.status === 'complete';
    const ov = exp.overrides || {};
    const edit = (fn, opts) => E.edit(C, ctx, tid, (t) => { if (!t.experiments || !t.experiments[expId]) return false; return fn(t); }, opts);
    const fld = (k, cur, commit, o) => E.field(C, 'e_' + k + '_' + expId, cur, commit, o);
    const LINKED = [['hypothesis', 'Hypothesis'], ['toggle', 'Toggle'], ['test', 'Experiment'], ['key_reads', 'Key reads'], ['possible_results', 'Possible results']];
    const mk = {};
    LINKED.forEach((p) => { mk[p[0]] = { show: !!exp.repeat_of, cls: ov[p[0]] ? 'tag etb-tag-warn' : 'tag', text: ov[p[0]] ? 'Overridden' : 'Linked' }; });
    const overrides = exp.repeat_of ? LINKED.filter((p) => ov[p[0]]).map((p) => ({ key: 'ov-' + p[0], label: p[1], relink: () => edit((t) => { X.relinkField(t, expId, p[0]); X.syncRepeats(t); }, { msg: p[1] + ' follows the source again.' }) })) : [];
    const src = exp.repeat_of ? view.experiments[exp.repeat_of] : null;
    const dd = sh.d || {};
    const krs = (exp.key_reads || []).map((k) => {
      const li = E.linkInfo(C, ctx, k);
      const linked = !!k.source_kpi_gid;
      const st = E.krStat(C, ctx, k);
      const unit = li.unit || '';
      const isRange = (k.direction || '') === 'range';
      const card = {
        key: 'kr-' + k.id, linked: linked, custom: !linked,
        nameText: li.name || 'KPI', unitText: unit || 'No unit',
        tag: li.linked ? 'Linked to ' + li.short : 'Unlinked: the KPI was removed', tagCls: li.linked ? 'tag' : 'tag etb-tag-bad', tagTitle: li.linked ? 'Linked to ' + li.label + '. The name and unit follow the KPI.' : 'The linked KPI was removed',
        hasBadge: EXEC && st.statistical, badge: (st.statistic || '') + (st.readCount ? ' of ' + st.readCount : ''), badgeTitle: st.source === 'kpi' ? 'The statistic and sample size come from the linked KPI' + (st.overriddenLocal ? '; this key read’s own setting is ignored' : '') : 'Statistic set on this key read',
        name: fld('krn' + k.id, k.name, (v) => edit((t) => X.setKeyReadField(t, expId, k.id, 'name', v))),
        unit: fld('kru' + k.id, k.unit, (v) => edit((t) => X.setKeyReadField(t, expId, k.id, 'unit', v))),
        aria: 'Key read ' + (li.name || k.id),
        remove: () => C.confirm({ title: 'Remove the key read “' + (li.name || k.id) + '”?', body: 'Criteria that test it lose their key read and are flagged until you pick another.', ok: 'Remove key read', danger: true, onOk: () => edit((t) => X.removeKeyRead(t, expId, k.id), { msg: 'Key read removed.' }) }),
        dir: E.sel(k.direction || '>=', DIRS_APP, (v) => edit((t) => X.setKeyReadField(t, expId, k.id, 'direction', v))),
        isRange: EXEC && isRange,
        crit: fld('krc' + k.id, k.critical_value, (v) => edit((t) => X.setKeyReadField(t, expId, k.id, 'critical_value', v))),
        critPh: isRange ? (unit ? 'low (' + unit + ')' : 'low') : (unit ? 'critical (' + unit + ')' : 'critical value'),
        hi: fld('krh' + k.id, k.critical_value_hi, (v) => edit((t) => X.setKeyReadField(t, expId, k.id, 'critical_value_hi', v))),
        hiPh: unit ? 'high (' + unit + ')' : 'high'
      };
      if (EXEC) {
        card.statRo = linked;
        card.statText = st.statistical ? (st.statistic + (st.readCount ? ' of ' + st.readCount : '')) : 'Single value';
        card.statNote = 'Inherited from the KPI' + (st.overriddenLocal ? '; this key read’s own setting is ignored while linked' : '');
        card.statSel = E.sel(k.statistic || '', STAT_OPTS, (v) => edit((t) => X.setKeyReadField(t, expId, k.id, 'statistic', v || null)));
        card.hasCount = !linked && !!k.statistic;
        card.count = fld('krn_c' + k.id, k.readCount == null ? '' : String(k.readCount), (v) => { const num = String(v).trim() === '' ? null : Number(v); edit((t) => X.setKeyReadField(t, expId, k.id, 'readCount', (num != null && isFinite(num) && num > 0) ? num : null)); });
        Object.assign(card, observedRow(C, ctx, exp, k, st, unit));
      }
      return card;
    });
    const sentinels = [['other', 'Other (unanticipated)'], ['inconclusive', 'Inconclusive']].map((pair) => {
      const sid = pair[0], label = pair[1];
      const ao = exp.actual_outcome; const on = !!(ao && ao.result_id === sid);
      const lv = on ? (ao.terminal ? ('term:' + ao.terminal.type) : ((ao.next_experiment_ids || [])[0] ? ('exp:' + ao.next_experiment_ids[0]) : 'none')) : 'none';
      return {
        key: 'sent-' + sid, sid: sid, label: label, on: on, cls: 'etb-res sent' + (on ? ' obs' : ''), radioName: 'obs-' + expId,
        pick: (e) => { if (e && e.target && e.target.checked === false) return; edit((t) => X.recordOutcome(t, expId, { result_id: sid, recorded_by: user }, { user: user }), { msg: 'Outcome recorded as ' + label.toLowerCase() + '.' }); },
        note: on ? fld('sn' + sid, ao.note, (v) => edit((t) => X.recordOutcomePatch(t, expId, { note: v || null })), { multi: true }) : null,
        concl: on ? fld('sc' + sid, ao.conclusion, (v) => edit((t) => X.recordOutcomePatch(t, expId, { conclusion: v || null })), { multi: true }) : null,
        lead: on ? E.sel(lv, leadOptions(view, expId, false), (v) => {
          let patch;
          if (v.indexOf('term:') === 0) { const tt = types[v.slice(5)]; patch = { terminal: { type: v.slice(5), label: (tt && tt.label) || v.slice(5), note: null }, next_experiment_ids: [] }; }
          else if (v.indexOf('exp:') === 0) patch = { next_experiment_ids: [v.slice(4)], terminal: null };
          else patch = { next_experiment_ids: [], terminal: null };
          edit((t) => X.recordOutcomePatch(t, expId, patch));
        }) : null
      };
    });
    const rawText = dd.json != null ? String(dd.json) : JSON.stringify(exp, null, 2);
    return {
      missing: false, ok: true, ro: ro, canEdit: !ro, full: !only, only: only,
      title: only ? 'Result: ' + (onlyRes.label || onlyRes.id) : (exp.code || expId) + ' ' + (exp.name || ''), sub: only ? (exp.code || expId) + ' ' + (exp.name || '') : 'Editing',
      showAll: () => C.setSheetData({ only: null }),
      statusW: E.statusWord(exp.status || 'planned'), statusCls: E.statusCls(exp.status || 'planned'), hasReach: !!rr, reachW: rr ? E.REACH[rr] : '',
      isRepeat: !!exp.repeat_of, repeatText: 'Repeat of ' + ((src && src.code) || exp.repeat_of || '') + '. Linked fields follow the source until you change them here.', hasSrc: !!src,
      openSrc: () => { if (src) E.open(C, ctx, tid, exp.repeat_of, { edit: true }); },
      relinkAll: () => edit((t) => { X.relinkField(t, expId, 'all'); X.syncRepeats(t); }, { msg: 'Every field follows the source again.' }),
      mk: mk, overrides: overrides, canRelinkAll: !ro && overrides.length > 0,
      code: fld('code', exp.code, (v) => edit((t) => X.setExperimentField(t, expId, 'code', v))),
      name: fld('name', exp.name, (v) => edit((t) => X.setExperimentField(t, expId, 'name', v))),
      status: E.sel(exp.status || 'planned', [{ value: 'planned', label: 'Planned' }, { value: 'in_progress', label: 'In progress' }, { value: 'complete', label: 'Complete' }], (v) => edit((t) => X.setExperimentField(t, expId, 'status', v))),
      hyp: fld('hyp', exp.hypothesis, (v) => edit((t) => X.setExperimentField(t, expId, 'hypothesis', v)), { multi: true }),
      toggle: fld('tog', exp.toggle, (v) => edit((t) => X.setExperimentField(t, expId, 'toggle', v))),
      test: fld('test', exp.test, (v) => edit((t) => X.setExperimentField(t, expId, 'test', v)), { multi: true }),
      krs: krs, noKrs: !krs.length,
      addKr: () => edit((t) => X.addKeyRead(t, expId), { msg: 'Key read added.' }),
      pickOpen: !ro && !!dd.pick, linkKpi: () => C.setDraft({ pick: !dd.pick }),
      pick: (!ro && dd.pick) ? pickVM(C, ctx, tid, expId) : null,
      results: (exp.possible_results || []).filter((res) => !only || res.id === onlyRes.id).map((res) => resultVM(C, ctx, entry, exp, res, complete, edit)),
      noResults: !(exp.possible_results || []).length,
      addResult: () => edit((t) => X.addResult(t, expId), { msg: 'Result added.' }),
      sentinels: sentinels,
      hasOutcome: !!exp.actual_outcome, canClear: !ro && !!exp.actual_outcome,
      clearObserved: () => C.confirm({ title: 'Clear the recorded outcome?', body: 'The observed result, its recorded date and the measured values stored on ' + (exp.code || expId) + ' are removed. KPI readings already posted stay on their KPIs.', ok: 'Clear outcome', danger: true, onOk: () => edit((t) => X.clearOutcome(t, expId), { msg: 'Recorded outcome cleared.' }) }),
      notes: fld('notes', exp.notes, (v) => edit((t) => X.setExperimentField(t, expId, 'notes', v)), { multi: true }),
      audit: (exp.audit_log || []).map((a, i) => ({ key: 'au' + i, when: E.isoTime(a.timestamp), user: a.user || 'Unknown', action: a.action || '', field: a.field || '', hasReason: !!a.reason, reason: a.reason ? 'Reason: ' + a.reason : '' })),
      hasAudit: !!(exp.audit_log || []).length,
      del: () => C.confirm({ title: 'Delete ' + (exp.code || expId) + '?', body: 'Links to it from other results are cleared. This cannot be undone.', ok: 'Delete experiment', danger: true, onOk: () => { if (edit((t) => X.deleteExperiment(t, expId), { msg: 'Experiment deleted.' })) C.closeSheet(); } }),
      raw: {
        open: !!dd.jsonOpen, label: dd.jsonOpen ? 'Hide raw JSON' : 'Advanced: edit raw JSON',
        toggle: () => C.setDraft({ jsonOpen: !dd.jsonOpen, json: null, jsonMsg: '' }),
        text: rawText, set: (e) => C.setDraft({ json: e && e.target ? e.target.value : '', jsonMsg: '' }),
        apply: () => {
          let p; try { p = JSON.parse(rawText); } catch (e) { C.setDraft({ jsonMsg: 'Parse error: ' + (e && e.message ? e.message : e), jsonErr: true }); return; }
          if (!p || typeof p !== 'object' || Array.isArray(p)) { C.setDraft({ jsonMsg: 'Parse error: the experiment must be a JSON object.', jsonErr: true }); return; }
          if (edit((t) => { p.id = expId; t.experiments[expId] = p; }, { msg: 'Experiment JSON applied.' })) C.setDraft({ json: null, jsonMsg: 'Applied.', jsonErr: false });
        },
        msg: dd.jsonMsg || '', hasMsg: !!dd.jsonMsg, msgCls: dd.jsonErr ? 'err' : 'okn'
      }
    };
  }
  /* measured evidence under a key read once an outcome is recorded (today's __erObservedRow) */
  function observedRow(C, ctx, exp, k, st, unit) {
    const none = { hasObs: false, obsText: '', obsCls: '', hasChip: false, chip: '', chipTitle: '', hasVerdict: false, verdict: '', verdictCls: '' };
    const ao = exp.actual_outcome; const kv = ao && ao.key_read_values;
    if (!kv) return none;
    const xs = RD.keyReadValueList(kv[k.id]);
    if (!xs.length) return Object.assign({}, none, { hasObs: true, obsText: 'Not measured. This outcome was recorded without it.', obsCls: 'etb-obs st t-warn' });
    const sum = RD.statSummary(xs, st.statistic || 'average');
    let text = 'Measured ' + X.fmt(sum.value) + (unit ? ' ' + unit : '');
    if (st.statistical && sum.n > 1) text += ', n = ' + sum.n + (st.readCount ? ' of ' + st.readCount : '') + ', ' + (st.statistic || 'average') + (sum.sd != null ? ', sd ' + X.fmt(sum.sd) : '');
    let cls = 'etb-obs';
    if (st.statistical) { const comp = RD.readsComplete(sum.n, st.readCount); if (!comp.complete) { cls = 'etb-obs short'; text += '. Incomplete (' + comp.have + ' of ' + comp.expected + ' reads)'; } }
    let samps = ao.key_read_samples && ao.key_read_samples[k.id];
    if (!samps) { const ls = ao.key_read_sources && ao.key_read_sources[k.id]; if (ls && ls.sample) samps = [ls.sample]; }
    const hasCv = !(k.critical_value === '' || k.critical_value == null) && isFinite(Number(k.critical_value));
    const pass = hasCv && sum.value != null ? X.etbApplyOp(k.direction || '>=', sum.value, k.critical_value, k.critical_value_hi) : null;
    return {
      hasObs: true, obsText: text, obsCls: cls,
      hasChip: !!(samps && samps.length), chip: samps && samps.length ? (samps.length === 1 ? 'From ' + samps[0] : 'From ' + samps.length + ' samples') : '', chipTitle: samps ? samps.join(', ') : '',
      hasVerdict: pass != null, verdict: pass ? 'Meets target' : 'Misses target', verdictCls: 'st ' + (pass ? 't-ok' : 't-bad')
    };
  }

  /* ---------------------------------------------------------- read-only detail sheet */
  function detailVM(C, ctx, sh) {
    const entry = E.entry(C, ctx, sh.data.tid);
    const exp = entry && entry.view.experiments[sh.data.expId];
    if (!exp) return { missing: true, ok: false, title: 'Experiment not found' };
    const view = entry.view, types = view.terminal_types || {}, expId = exp.id;
    const reach = X.computeReachability(view); const rr = reach[expId];
    const out = X.resolveOutcome(exp); const ao = exp.actual_outcome;
    let lines = [];
    if (ao) {
      if (out && out.kind === 'sentinel') { lines = [{ k: 'Outcome', v: ao.result_id === 'other' ? 'Unanticipated' : 'Inconclusive' }]; if (ao.note) lines.push({ k: 'Note', v: ao.note }); if (out.conclusion) lines.push({ k: 'Conclusion', v: out.conclusion }); }
      else { lines = [{ k: 'Observed', v: out ? out.label : ao.result_id }]; if (ao.recorded_date) lines.push({ k: 'Recorded', v: ao.recorded_date + (ao.recorded_by ? ' by ' + ao.recorded_by : '') }); if (ao.note) lines.push({ k: 'Note', v: ao.note }); if (out && out.conclusion) lines.push({ k: 'Conclusion', v: out.conclusion }); }
    }
    let next = { isTerm: false, termText: '', termCls: '', isExp: false, isNone: true, code: '', name: '' };
    if (out && out.terminal) { const p = termPill(out.terminal, types); next = { isTerm: true, termText: p.text, termCls: p.cls, isExp: false, isNone: false, code: '', name: '' }; }
    else if (out && out.nextId && view.experiments[out.nextId]) { const t = view.experiments[out.nextId]; next = { isTerm: false, termText: '', termCls: '', isExp: true, isNone: false, code: t.code || out.nextId, name: t.name || '' }; }
    return {
      missing: false, ok: true,
      title: (exp.code || expId) + ' ' + (exp.name || ''),
      statusW: E.statusWord(exp.status || 'planned'), statusCls: E.statusCls(exp.status || 'planned'), hasReach: !!rr, reachW: rr ? E.REACH[rr] : '',
      hasVerdict: !!exp.hypothesis_verdict, verdict: 'Hypothesis ' + (exp.hypothesis_verdict || ''),
      hasHyp: !!exp.hypothesis, hyp: exp.hypothesis || '', hasToggle: !!exp.toggle, toggle: exp.toggle || '', hasTest: !!exp.test, test: exp.test || '',
      krs: (exp.key_reads || []).map((k) => ({ name: E.krName(C, ctx, k) || 'Unnamed', crit: E.krCrit(C, ctx, k) })), hasKrs: !!(exp.key_reads || []).length,
      hasOutcome: !!ao, lines: lines, next: next,
      results: (exp.possible_results || []).map((res) => {
        const observed = !!(ao && !X.isSentinel(ao.result_id) && ao.result_id === res.id);
        return { key: 'dr-' + res.id, label: res.label || res.id, observed: observed, cls: 'etb-res' + (observed ? ' obs' : ''), crit: critLines(C, ctx, res, exp.key_reads || []), hasConcl: !!res.conclusion, concl: res.conclusion || '', next: nextInfo(view, res, types) };
      }),
      hasResults: !!(exp.possible_results || []).length,
      editLabel: C.isRo() ? 'Open the editor' : 'Edit results',
      edit: () => E.open(C, ctx, entry.tid, expId, { edit: true })
    };
  }

  /* ---------------------------------------------------------- issues sheet */
  function issuesVM(C, ctx, sh) {
    const entry = E.entry(C, ctx, sh.data.tid) || E.trees(C, ctx).active;
    const view = entry.view;
    const issues = X.validateTree(view);
    const errs = issues.filter((i) => i.level === 'error'), warns = issues.filter((i) => i.level === 'warning');
    const row = (i, n) => { const e = i.ref && view.experiments[i.ref]; return { key: 'is' + n, cls: 'etb-irow ' + i.level, icon: i.level === 'error' ? 'Error' : 'Warning', iconCls: 'st ' + (i.level === 'error' ? 't-bad' : 't-warn'), text: i.message, rule: 'Rule ' + i.rule, hasRef: !!e, ref: e ? (e.code || i.ref) : '', open: () => { if (e) E.open(C, ctx, entry.tid, i.ref, { edit: true }); } }; };
    const groups = [];
    if (errs.length) groups.push({ key: 'g-e', title: F.plural(errs.length, 'error'), rows: errs.map(row) });
    if (warns.length) groups.push({ key: 'g-w', title: F.plural(warns.length, 'warning'), rows: warns.map((w, n) => row(w, n + 1000)) });
    return { title: issues.length ? 'Validation issues' : 'Validation issues', sub: issues.length ? (F.plural(errs.length, 'error') + (warns.length ? ', ' + F.plural(warns.length, 'warning') : '')) : 'Nothing to fix', groups: groups, empty: !issues.length };
  }

  /* ---------------------------------------------------------- KPI picker (inline in the editor; today's "Link a key read to a project KPI") */
  function pickVM(C, ctx, tid, expId) {
    const kpis = E.projectKpis(C, ctx);
    const ORDER = ['Initiative', 'Product', 'Component', 'Key results', 'Stage-gates'];
    const by = {}; kpis.forEach((k) => { (by[k.group] = by[k.group] || []).push(k); });
    const gord = ORDER.filter((g) => by[g] && by[g].length); Object.keys(by).forEach((g) => { if (gord.indexOf(g) < 0) gord.push(g); });
    return {
      empty: !kpis.length,
      groups: gord.map((g) => ({ key: 'pg-' + g, label: g, rows: by[g].map((k) => ({
        key: 'pk-' + k.gid, name: k.name, unit: k.unit ? '(' + k.unit + ')' : '', hasUnit: !!k.unit, label: k.label,
        pick: () => {
          const ok = E.edit(C, ctx, tid, (t) => {
            const exp = t.experiments && t.experiments[expId]; if (!exp) return false;
            const id = X.newKeyReadId(t, expId);
            (exp.key_reads || (exp.key_reads = [])).push({ id: id, source_kpi_gid: k.gid, name: k.name || '', unit: k.unit || '', critical_value: '', direction: k.direction || '>=' });
            X.markOverride(exp, 'key_reads');
          }, { msg: 'Key read linked to ' + k.name + '.' });
          if (ok) C.setDraft({ pick: false });
        }
      })) })),
      close: () => C.setDraft({ pick: false })
    };
  }

  /* ---------------------------------------------------------- settings sheet */
  function settingsVM(C, ctx, sh) {
    const T = E.trees(C, ctx); const entry = T.active;
    const d = sh.d || {};
    const name = d.name != null ? String(d.name) : E.editor(C);
    const n = Object.keys(entry.view.experiments || {}).length;
    return {
      name: name, setName: (e) => C.setDraft({ name: e && e.target ? e.target.value : '' }),
      nameKey: (e) => { if (e && e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); E.setEditor(C, name); C.closeSheet(); C.toast('Name saved. It is used for “recorded by” and the audit log.', 'ok'); } },
      save: () => { E.setEditor(C, name); C.closeSheet(); C.toast('Name saved. It is used for “recorded by” and the audit log.', 'ok'); },
      stored: 'Logic trees are saved with this objective in ' + (ctx.docKey || 'the division document') + ', like every other change. There is no separate storage to set up.',
      canClear: !C.isRo(),
      treeName: entry.name || 'this tree',
      clearAll: () => C.confirm({
        title: 'Clear “' + (entry.name || 'this tree') + '”?',
        body: 'All ' + F.plural(n, 'experiment') + ' in this logic tree are deleted and a blank tree is left in its place. This is saved right away and cannot be undone. Other logic trees on this objective are kept, and KPI readings already posted stay on their KPIs.',
        ok: 'Clear all data', danger: true,
        onOk: () => {
          const ok = E.edit(C, ctx, entry.virtual ? null : entry.tid, (t) => {
            const keep = { tid: t.tid, name: t.name, project_id: t.project_id || ctx.objId };
            Object.keys(t).forEach((k) => { delete t[k]; });
            Object.assign(t, X.emptyTree(ctx.objId + ':' + keep.tid), keep);
          }, { msg: 'Cleared. A blank tree is ready.' });
          if (ok) C.closeSheet();
        }
      })
    };
  }

  /* ---------------------------------------------------------- the module */
  MODS.etb = {
    state: () => ({ etb_view: 'graph', etb_zoom: {}, etb_off: {}, etb_json: null, etb_jsonMsg: null, etb_jsonIssues: null, etb_tests: null, etb_editor: E.editorStored(), etb_io: {}, etb_accOpen: false, etb_full: false, etb_fsAt: 0, etb_pan: {} }),
    wide: ['etb.exp', 'etb.detail'],
    vm(C, ctx) {
      E.setClock(C);
      const T = E.trees(C, ctx);
      const entry = T.active;
      const ro = C.isRo();
      const view = C.state.etb_view || 'graph';
      const sheet = C.sheetOf('etb');
      const kind = sheet ? sheet.kind : '';
      const vm = {
        has: !!ctx.obj, ro: ro, canEdit: !ro, isExec: EXEC,
        treeLabel: T.list.length > 1 ? entry.name + (entry.title && entry.title !== entry.name ? ', ' + entry.title : '') : (entry.title || entry.name || 'Untitled logic tree'),
        vw: VIEWS.reduce((o, v) => { o[v[0]] = { label: v[1], on: view === v[0] ? 'true' : 'false', pick: () => C.setState({ etb_view: v[0] }) }; return o; }, {}),
        isOutline: view === 'outline', isGraph: view === 'graph', isWaterfall: view === 'waterfall', isJson: view === 'json', isTests: view === 'tests',
        addExp: () => { let id = ''; const ok = E.edit(C, ctx, T.virtual ? null : entry.tid, (t) => { id = X.addExperiment(t, {}); }, { msg: 'Experiment added.' }); if (ok && id) C.openSheet('etb.exp', { tid: entry.tid, expId: id }, { f: {} }); },
        reload: () => { E.touch(C, ctx, 'loadedAt'); C.setState({ etb_json: null, etb_jsonMsg: null, etb_jsonIssues: null }); C.toast('Loaded at ' + F.time(C.now()) + ' for ' + ctx.objId + '.', 'ok'); },
        save: () => {
          if (!C.guard()) return;
          if (C.state.sim && C.state.sim.offline) { C.toast('You are offline. Changes stay here and save when the connection returns.', 'info'); return; }
          const nErr = X.validateTree(entry.view).filter((i) => i.level === 'error').length;
          E.edit(C, ctx, T.virtual ? null : entry.tid, () => true, { msg: 'Saved at ' + F.time(C.now()) + (nErr ? '. ' + F.plural(nErr, 'validation error') + ' remain' + (nErr === 1 ? 's' : '') + '.' : '.') });
        },
        openSettings: () => C.openSheet('etb.settings', {}, {}),
        /* full screen: an icon in the header; in full screen it says Exit full screen (one button, so the focus stays) */
        full: !!C.state.etb_full,
        panelCls: 'panel etb' + (C.state.etb_full ? ' etb-full' : ''),
        fs: {
          label: C.state.etb_full ? 'Exit full screen' : 'Full screen',
          cls: C.state.etb_full ? 'btn sm' : 'btn sm q ic',
          toggle: (e) => setFull(C, !C.state.etb_full, e),
          key: (e) => {
            if (!e || e.key !== 'Escape' || !C.state.etb_full) return;
            if (e.defaultPrevented || (typeof e.isDefaultPrevented === 'function' && e.isDefaultPrevented())) return;
            if (e.preventDefault) e.preventDefault();
            setFull(C, false, e);
          }
        },
        get st() { return C.memo('etb.st', () => statusVM(C, ctx, T, entry)); },
        get ol() { return C.memo('etb.ol', () => outlineVM(C, ctx, entry)); },
        get g() { return C.memo('etb.g', () => graphVM(C, ctx, entry)); },
        get wf() { return C.memo('etb.wf', () => wfVM(C, ctx, entry)); },
        get js() { return C.memo('etb.js', () => jsonVM(C, ctx, entry)); },
        get ts() { return C.memo('etb.ts', () => testsVM(C)); },
        get exp() { return kind === 'etb.exp' ? C.memo('etb.exp', () => editorVM(C, ctx, sheet)) : null; },
        get det() { return kind === 'etb.detail' ? C.memo('etb.det', () => detailVM(C, ctx, sheet)) : null; },
        get iss() { return kind === 'etb.issues' ? C.memo('etb.iss', () => issuesVM(C, ctx, sheet)) : null; },
        get set() { return kind === 'etb.settings' ? C.memo('etb.set', () => settingsVM(C, ctx, sheet)) : null; }
      };
      return vm;
    },
    /* header search: experiments in every logic tree of this division's objectives */
    search(C, ctx, q) {
      const s = String(q || '').trim().toLowerCase(); if (!s) return [];
      const out = [];
      const doc = ctx.doc || {};
      Object.keys(doc.etbTrees || {}).forEach((objId) => {
        const obj = (ctx.allObjs || []).find((o) => o.id === objId); if (!obj) return;
        RD.etbTreesOf(doc.etbTrees[objId]).trees.forEach((t) => {
          Object.values(t.experiments || {}).forEach((e) => {
            if (!e || typeof e !== 'object') return;
            const hay = [e.code, e.name, e.hypothesis, e.test].filter(Boolean).join(' ').toLowerCase();
            if (hay.indexOf(s) < 0) return;
            out.push({
              label: (e.code || e.id) + ' ' + (e.name || ''), sub: 'Experiment in ' + (t.name || 'logic tree') + ', ' + (obj.statement || objId),
              go: () => {
                C.setState({ objId: objId, tab: 'exp', menu: '', sheets: [], q: '', searchOpen: false });
                const ctx2 = APP_CTX(C);
                const T2 = E.trees(C, ctx2);
                if (T2.activeTid !== t.tid) E.setActive(C, ctx2, t.tid);
                C.openSheet(e.actual_outcome ? 'etb.detail' : 'etb.exp', { tid: t.tid, expId: e.id }, { f: {} });
              }
            });
          });
        });
      });
      return out.slice(0, 12);
    }
  };
})(ETB);
