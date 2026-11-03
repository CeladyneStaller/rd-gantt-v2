/* ============================================================================
   Calm kit: three-way merge for the shared portfolio (live builds).
   When a portfolio save is refused because someone saved first (412), NET merges
     base   the portfolio as this page last loaded or saved it
     mine   the portfolio with this page's unsaved changes
     theirs the portfolio the other editor saved
   and saves the result: every field this page changed keeps its value, everything else comes from
   theirs. Lists of records with ids (objectives, milestones, KPIs…) merge record by record, so two
   people editing different objectives never touch each other's work.
   A real clash makes the merge give up (ok:false) and the caller reloads theirs:
     - one side deleted a record (or field) the other side changed
     - both sides added a record with the same id
   Both sides changing the same field is not a clash: this page's value wins, as today's Planning
   re-applies your change.
   Pure functions over JSON data; tested by test/merge.js.
   ========================================================================== */
const MERGE = (function () {
  function same(a, b) {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }
  function rec(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  /* a list of records that all carry a distinct id (an empty list qualifies) */
  function idList(a) {
    if (!Array.isArray(a)) return false;
    const seen = {};
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      if (!rec(x) || x.id == null || x.id === '') return false;
      const k = String(x.id);
      if (seen[k]) return false;
      seen[k] = 1;
    }
    return true;
  }
  function byId(a) { const m = {}; a.forEach((x) => { m[String(x.id)] = x; }); return m; }
  function keysOf() {
    const out = [], seen = {};
    for (let i = 0; i < arguments.length; i++) {
      const o = arguments[i];
      if (!rec(o)) continue;
      Object.keys(o).forEach((k) => { if (!seen[k]) { seen[k] = 1; out.push(k); } });
    }
    return out;
  }

  function merge(b, m, t, cx, path) {
    if (same(m, b)) return clone(t);           // this page didn't change it: theirs
    if (same(t, b)) return clone(m);           // they didn't change it: this page's
    if (same(m, t)) return clone(m);           // both made the same change
    if (rec(b) && rec(m) && rec(t)) return mergeRec(b, m, t, cx, path);
    if (idList(b) && idList(m) && idList(t)) return mergeList(b, m, t, cx, path);
    return clone(m);                           // both changed one value: this page's change wins
  }
  function mergeRec(b, m, t, cx, path) {
    const out = {};
    keysOf(t, m, b).forEach((k) => {
      const hb = Object.prototype.hasOwnProperty.call(b, k);
      const hm = Object.prototype.hasOwnProperty.call(m, k);
      const ht = Object.prototype.hasOwnProperty.call(t, k);
      if (hb && !hm) {                         // this page removed the field
        if (ht && !same(t[k], b[k])) clash(cx, path + '.' + k, 'removed here, changed there');
        return;
      }
      if (hb && !ht) {                         // they removed the field
        if (hm && !same(m[k], b[k])) clash(cx, path + '.' + k, 'changed here, removed there');
        return;
      }
      if (!hb && hm && ht) { out[k] = merge(undefined, m[k], t[k], cx, path + '.' + k); return; }
      if (!hb) { out[k] = clone(hm ? m[k] : t[k]); return; }
      out[k] = merge(b[k], m[k], t[k], cx, path + '.' + k);
    });
    return out;
  }
  function mergeList(b, m, t, cx, path) {
    const B = byId(b), M = byId(m), T = byId(t);
    const out = [];
    t.forEach((x) => {                         // their order first
      const id = String(x.id);
      const inB = Object.prototype.hasOwnProperty.call(B, id), inM = Object.prototype.hasOwnProperty.call(M, id);
      if (inB && !inM) {                       // this page deleted it
        if (!same(T[id], B[id])) clash(cx, path + '[' + id + ']', 'deleted here, changed there');
        return;
      }
      if (!inB && inM) {                       // both sides added this id
        if (!same(M[id], T[id])) clash(cx, path + '[' + id + ']', 'added on both sides');
        out.push(clone(T[id]));
        return;
      }
      out.push(inM ? merge(B[id], M[id], T[id], cx, path + '[' + id + ']') : clone(x));
    });
    m.forEach((x) => {                         // this page's additions, in its order
      const id = String(x.id);
      if (!Object.prototype.hasOwnProperty.call(B, id) && !Object.prototype.hasOwnProperty.call(T, id)) out.push(clone(x));
    });
    Object.keys(B).forEach((id) => {           // they deleted a record this page changed
      if (!Object.prototype.hasOwnProperty.call(T, id) && Object.prototype.hasOwnProperty.call(M, id) && !same(M[id], B[id])) clash(cx, path + '[' + id + ']', 'changed here, deleted there');
    });
    return out;
  }
  function clash(cx, where, why) { cx.ok = false; cx.clashes.push(where.replace(/^\./, '') + ': ' + why); }

  /* three(base, mine, theirs) -> { ok, value, clashes } */
  function three(base, mine, theirs) {
    const cx = { ok: true, clashes: [] };
    const value = merge(base, mine, theirs, cx, '');
    return { ok: cx.ok, value: value, clashes: cx.clashes };
  }
  return { three: three, same: same };
})();
