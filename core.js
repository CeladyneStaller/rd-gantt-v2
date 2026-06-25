/* ============================================================================
   Unified R&D Suite — Shared Core (frozen spec v1.3)
   Pure logic only. No DOM, no network. Runs headless in Node and injects into
   the browser shells via build.py (between the CORE markers).

   Conventions (spec v1.3)
   -----------------------
   - Dates are integer day-counts (days since an arbitrary epoch). Shells convert
     ISO <-> day-count; the core only does max / +lag arithmetic.
   - percentComplete is an integer 0..100.
   - A KPI is the measurement atom, hosted by exactly one Key Result or one
     stage-gate (kpi.hostType / kpi.hostId). A value enters ONLY via kpiUpdates
     (in an exec doc), keyed by kpiId; a KPI's current value = the latest update
     by timestamp.
   - Scoring rolls up: KPI score -> Key Result score (mean of its KPIs) ->
     Objective score (mean of its Key Results). Stage-gate KPIs are gating only
     and never feed the objective OKR score (spec v1.3 §A, decision #1).
   - Unscored: a KPI with a null target or no read yet is excluded from its KR's
     mean (g1). A KR with no scorable KPIs is unscored; an objective with no
     scorable KRs has no band, not zero. No synthesized KRs (decision #3).
   - For direction 'range', score is 100 inside [lo,hi] and falls off linearly to
     0 at one full band-width outside the band.
   ============================================================================ */

(function (root) {
  'use strict';

  // ---- small helpers --------------------------------------------------------
  function mean(arr) {
    if (!arr.length) return null;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // ---- IDs ------------------------------------------------------------------
  // Type-prefixed, parent-scoped, monotonic counter. The counter is an
  // ALLOCATION number, never a position: reordering existing ids never changes
  // the next id. Display order lives in the separate `order` field.
  var ID_PREFIX = {
    division: 'DIV', initiative: 'INIT', milestone: 'MS', objective: 'OBJ',
    keyResult: 'KR', stageGate: 'SG', task: 'TSK', kpi: 'KPI'
  };
  // Structural levels pad to 2 digits; leaf metrics use plain integers.
  var ID_PAD = { initiative: 2, milestone: 2, objective: 2 };

  function stemFromParent(type, parentId, opts) {
    if (type === 'division') return opts.code;                 // explicit short code, e.g. "FC"
    var parentStem = parentId.substring(parentId.indexOf('-') + 1); // "DIV-FC"->"FC", "INIT-FC-01"->"FC-01"
    if (type === 'objective') return parentStem + '-' + opts.quarter; // parent is the division
    return parentStem;
  }

  // allocId(type, parentId, existingIds, opts?)
  //   division:  opts.code required (parentId may be null)
  //   objective: opts.quarter required, parentId = division id
  //   others:    parentId = immediate logical parent (initiative / objective / host)
  function allocId(type, parentId, existingIds, opts) {
    opts = opts || {};
    var prefix = ID_PREFIX[type];
    if (!prefix) throw new Error('allocId: unknown type ' + type);
    var stem = stemFromParent(type, parentId, opts);
    if (type === 'division') {
      var did = prefix + '-' + stem;
      if (existingIds.indexOf(did) !== -1) throw new Error('allocId: duplicate division code ' + stem);
      return did;
    }
    var base = prefix + '-' + stem + '-';
    var max = 0;
    for (var i = 0; i < existingIds.length; i++) {
      var id = existingIds[i];
      if (id.indexOf(base) === 0) {
        var n = parseInt(id.slice(base.length), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
    var next = max + 1;
    var pad = ID_PAD[type] || 0;
    var num = pad ? String(next).padStart(pad, '0') : String(next);
    return base + num;
  }

  // ---- KPI values & scoring (v1.3) -----------------------------------------
  // A KPI is the measurement atom, hosted by a Key Result or a stage-gate. A
  // value enters ONLY via kpiUpdates (keyed by kpiId); current = latest by ts.
  function kpiCurrentValue(kpiId, execDocs) {
    var latest = null;
    for (var div in execDocs) {
      if (!execDocs.hasOwnProperty(div)) continue;
      var ups = execDocs[div].kpiUpdates || [];
      for (var i = 0; i < ups.length; i++) {
        if (ups[i].kpiId === kpiId) {
          if (!latest || ups[i].timestamp > latest.timestamp) latest = ups[i];
        }
      }
    }
    return latest ? latest.value : null;
  }

  function progressLinear(value, target, direction) {
    if (direction === 'up')   return target === 0 ? 0 : 100 * value / target;
    if (direction === 'down') return value === 0 ? (target === 0 ? 100 : 0) : 100 * target / value;
    return 0;
  }
  function progressRange(value, lo, hi) {
    if (value >= lo && value <= hi) return 100;
    var width = (hi - lo) || 1;
    var d = value < lo ? (lo - value) : (value - hi);
    return 100 * Math.max(0, 1 - d / width);
  }

  // kpiScore(kpi, currentValue) -> 0..100 or null (unscored: null target / no read)
  function kpiScore(kpi, currentValue) {
    if (kpi.target == null) return null;
    if (currentValue == null) return null;
    var raw;
    if (kpi.direction === 'range') {
      raw = progressRange(currentValue, kpi.target.lo, kpi.target.hi);
    } else {
      raw = progressLinear(currentValue, kpi.target, kpi.direction);
    }
    return clamp(raw, 0, 100);
  }

  // all KPIs hosted by (hostType, hostId), scanned across exec docs
  function kpisFor(hostType, hostId, execDocs) {
    var out = [];
    for (var div in execDocs) {
      if (!execDocs.hasOwnProperty(div)) continue;
      var ks = execDocs[div].kpis || [];
      for (var i = 0; i < ks.length; i++) {
        if (ks[i].hostType === hostType && ks[i].hostId === hostId) out.push(ks[i]);
      }
    }
    return out;
  }

  function meanScorable(kpis, execDocs) {
    var scores = [];
    for (var i = 0; i < kpis.length; i++) {
      var s = kpiScore(kpis[i], kpiCurrentValue(kpis[i].id, execDocs));
      if (s != null) scores.push(s);
    }
    return mean(scores);
  }

  // keyResultScore -> mean of the KR's KPIs' scores (null if none scorable)
  function keyResultScore(krId, execDocs) { return meanScorable(kpisFor('keyResult', krId, execDocs), execDocs); }
  // stageGateScore -> mean of the gate's KPIs (gating/readiness; NOT in OKR score)
  function stageGateScore(sgId, execDocs) { return meanScorable(kpisFor('stageGate', sgId, execDocs), execDocs); }

  // ---- objective & tier scores ---------------------------------------------
  function krsForObjective(objId, execDocs) {
    var out = [];
    for (var div in execDocs) {
      if (!execDocs.hasOwnProperty(div)) continue;
      var krs = execDocs[div].keyResults || [];
      for (var i = 0; i < krs.length; i++) if (krs[i].objectiveId === objId) out.push(krs[i]);
    }
    return out;
  }

  // objectiveScore -> mean of scorable Key Result scores; null when none are
  // scorable (an objective with no Key Result is unscored -> no band, decision #3).
  function objectiveScore(objId, execDocs) {
    var krs = krsForObjective(objId, execDocs);
    var scores = [];
    for (var i = 0; i < krs.length; i++) {
      var s = keyResultScore(krs[i].id, execDocs);
      if (s != null) scores.push(s);
    }
    return mean(scores); // null if empty
  }

  function objectivesInScope(entityType, entityId, portfolio) {
    var objs = portfolio.objectives || [];
    switch (entityType) {
      case 'objective':  return objs.filter(function (o) { return o.id === entityId; });
      case 'initiative': return objs.filter(function (o) { return o.initiativeId === entityId; });
      case 'division':   return objs.filter(function (o) { return o.divisionId === entityId; });
      case 'company':    return objs.slice();
      default: return [];
    }
  }

  // score(entityType, entityId, portfolio, execDocs, quarter?)
  //   quarter omitted -> OVERALL (grand mean of the entity's objectives)
  //   quarter given   -> QUARTERLY (objectives stamped that quarter)
  // Returns 0..100 or null (no scorable objectives in the bound -> no band).
  function score(entityType, entityId, portfolio, execDocs, quarter) {
    var objs = objectivesInScope(entityType, entityId, portfolio);
    if (quarter != null) objs = objs.filter(function (o) { return o.quarter === quarter; });
    var scores = [];
    for (var i = 0; i < objs.length; i++) {
      var s = objectiveScore(objs[i].id, execDocs);
      if (s != null) scores.push(s);
    }
    return mean(scores);
  }

  // boundsOf -> sorted distinct quarters in scope. length 1 => caller collapses
  // quarterly and overall into a single number.
  function boundsOf(entityType, entityId, portfolio) {
    var objs = objectivesInScope(entityType, entityId, portfolio);
    var seen = {}, out = [];
    for (var i = 0; i < objs.length; i++) {
      var q = objs[i].quarter;
      if (q && !seen[q]) { seen[q] = 1; out.push(q); }
    }
    out.sort();
    return out;
  }

  function rollupObjective(id, portfolio, execDocs) { return score('objective', id, portfolio, execDocs); }
  function rollupInitiative(id, portfolio, execDocs) { return score('initiative', id, portfolio, execDocs); }
  function rollupDivision(id, portfolio, execDocs) { return score('division', id, portfolio, execDocs); }
  function rollupCompany(portfolio, execDocs) { return score('company', null, portfolio, execDocs); }

  function band(s) {
    if (s == null) return 'no-band';
    if (s >= 90) return 'on-track';
    if (s >= 70) return 'at-risk';
    return 'off-track';
  }

  // ---- product / model classification (§5) ---------------------------------
  function ownClass(node) {
    if (node.modelId) return { kind: 'model', modelId: node.modelId };
    if (node.productId) return { kind: 'product', productId: node.productId };
    return { kind: 'agnostic' };
  }
  function parentProductOf(modelId, portfolio) {
    var ms = portfolio.models || [];
    for (var i = 0; i < ms.length; i++) if (ms[i].id === modelId) return ms[i].productId;
    return null;
  }
  function initiativeOf(obj, portfolio) {
    var inits = portfolio.initiatives || [];
    for (var i = 0; i < inits.length; i++) if (inits[i].id === obj.initiativeId) return inits[i];
    return null;
  }
  function effClass(obj, portfolio) {
    var c = ownClass(obj);
    if (c.kind === 'agnostic') {
      var init = initiativeOf(obj, portfolio);
      if (init) c = ownClass(init);
    }
    return c;
  }
  function effProduct(obj, portfolio) {
    var c = effClass(obj, portfolio);
    if (c.kind === 'model') return parentProductOf(c.modelId, portfolio);
    if (c.kind === 'product') return c.productId;
    return null;
  }
  function effModel(obj, portfolio) {
    var c = effClass(obj, portfolio);
    return c.kind === 'model' ? c.modelId : null;
  }

  // validateClassification(obj, portfolio) -> {ok:true} | {ok:false, reason}
  // Enforces the node invariant (at most one of productId/modelId) and the
  // §5.3 no-broadening / same-branch rule relative to the objective's initiative.
  function validateClassification(obj, portfolio) {
    if (obj.productId && obj.modelId) return { ok: false, reason: 'objective sets both productId and modelId' };
    var init = initiativeOf(obj, portfolio);
    if (!init) return { ok: false, reason: 'objective has no initiative' };
    if (init.productId && init.modelId) return { ok: false, reason: 'initiative sets both productId and modelId' };

    var io = ownClass(init);
    var oo = ownClass(obj);
    if (oo.kind === 'agnostic') return { ok: true };           // inherits; always valid
    if (io.kind === 'agnostic') return { ok: true };           // anything allowed below agnostic

    if (io.kind === 'product') {
      if (oo.kind === 'product') {
        return oo.productId === io.productId
          ? { ok: true }
          : { ok: false, reason: 'objective pins a different product than its initiative' };
      }
      // oo is model -> must be under the initiative's product
      return parentProductOf(oo.modelId, portfolio) === io.productId
        ? { ok: true }
        : { ok: false, reason: 'objective model belongs to a different product than its initiative' };
    }

    if (io.kind === 'model') {
      // initiative is at the finest grain: objective must match exactly (no broaden)
      if (oo.kind === 'model' && oo.modelId === io.modelId) return { ok: true };
      return { ok: false, reason: 'initiative is model-specific; objective must match that model' };
    }
    return { ok: true };
  }

  // sliceScore(axis, id, portfolio, execDocs, quarter?) -> 0..100 or null
  function sliceScore(axis, id, portfolio, execDocs, quarter) {
    var objs = (portfolio.objectives || []).filter(function (o) {
      var match = axis === 'product' ? (effProduct(o, portfolio) === id)
                                     : (effModel(o, portfolio) === id);
      if (!match) return false;
      if (quarter != null && o.quarter !== quarter) return false;
      return true;
    });
    var scores = [];
    for (var i = 0; i < objs.length; i++) {
      var s = objectiveScore(objs[i].id, execDocs);
      if (s != null) scores.push(s);
    }
    return mean(scores);
  }

  // ---- schedule cascade (§6) -----------------------------------------------
  // cascade(portfolio, execDocs, today) ->
  //   { objectiveProjectedEnd, milestoneEffective, initiativeProjectedEnd,
  //     longTermSlip, cycles }
  function cascade(portfolio, execDocs, today) {
    var objs = portfolio.objectives || [];
    var inits = portfolio.initiatives || [];
    var miles = portfolio.milestones || [];
    var objById = {}; objs.forEach(function (o) { objById[o.id] = o; });

    function execFor(divId) { return execDocs[divId] || {}; }
    function childrenOf(obj) {
      var ex = execFor(obj.divisionId);
      var sgs = (ex.stageGates || []).filter(function (s) { return s.objectiveId === obj.id; });
      var tasks = (ex.tasks || []).filter(function (t) { return t.objectiveId === obj.id; });
      return { sgs: sgs, tasks: tasks };
    }

    function pfTask(t) {
      if (t.actualEnd != null) return t.actualEnd;
      var started = (t.actualStart != null) || (t.percentComplete && t.percentComplete > 0);
      if (started) {
        var frac = clamp((t.percentComplete || 0) / 100, 0, 1);
        return Math.max(t.plannedEnd, today + Math.ceil((1 - frac) * (t.plannedEnd - t.plannedStart)));
      }
      return t.plannedEnd; // not started
    }
    // A stage-gate is a checkpoint: done -> actualDate; otherwise it cannot have
    // finished before now, so it projects to max(plannedDate, today).
    function pfGate(s) {
      if (s.actualDate != null) return s.actualDate;
      return Math.max(s.plannedDate, today);
    }

    // Stage 1: intrinsic projected end per objective
    var intrinsic = {};
    objs.forEach(function (o) {
      var c = childrenOf(o), vals = [];
      c.tasks.forEach(function (t) { vals.push(pfTask(t)); });
      c.sgs.forEach(function (s) { vals.push(pfGate(s)); });
      intrinsic[o.id] = vals.length ? Math.max.apply(null, vals) : o.plannedEnd;
    });

    // Stage 2: lateral OBJ->OBJ forward pass (topological, cycle-guarded)
    var objPreds = {}; objs.forEach(function (o) { objPreds[o.id] = []; });
    (portfolio.objectiveEdges || []).forEach(function (e) {
      if (objPreds[e.toObj]) objPreds[e.toObj].push({ from: e.fromObj, lag: e.lagDays || 0 });
    });
    var projEnd = {}, objStack = {}, cycles = [];
    function computeProjEnd(id) {
      if (projEnd[id] != null) return projEnd[id];
      var o = objById[id];
      if (!o) return 0;
      if (objStack[id]) { cycles.push('OBJ:' + id); return intrinsic[id]; } // break cycle
      objStack[id] = true;
      var cs = o.plannedStart;
      var preds = objPreds[id];
      for (var i = 0; i < preds.length; i++) {
        if (objStack[preds[i].from]) { cycles.push('OBJ:' + preds[i].from); continue; }
        cs = Math.max(cs, computeProjEnd(preds[i].from) + preds[i].lag);
      }
      var dur = o.plannedEnd - o.plannedStart;
      var res = Math.max(intrinsic[id], cs + dur);
      objStack[id] = false;
      projEnd[id] = res;
      return res;
    }
    objs.forEach(function (o) { computeProjEnd(o.id); });

    // Stage 3: vertical lift into milestones
    var effective = {};
    miles.forEach(function (m) { effective[m.id] = m.plannedDate; });
    objs.forEach(function (o) {
      (o.milestoneIds || []).forEach(function (mid) {
        if (effective[mid] != null) effective[mid] = Math.max(effective[mid], projEnd[o.id]);
      });
    });

    // Stage 4: lateral MS->MS forward pass (topological, cycle-guarded)
    var msById = {}; miles.forEach(function (m) { msById[m.id] = m; });
    var msPreds = {}; miles.forEach(function (m) { msPreds[m.id] = []; });
    (portfolio.milestoneEdges || []).forEach(function (e) {
      if (msPreds[e.toMs]) msPreds[e.toMs].push({ from: e.fromMs, lag: e.lagDays || 0 });
    });
    var msDone = {}, msStack = {};
    function liftMilestone(id) {
      if (msDone[id]) return effective[id];
      if (!msById[id]) return effective[id] || 0;
      if (msStack[id]) { cycles.push('MS:' + id); return effective[id]; }
      msStack[id] = true;
      var preds = msPreds[id];
      for (var i = 0; i < preds.length; i++) {
        if (msStack[preds[i].from]) { cycles.push('MS:' + preds[i].from); continue; }
        effective[id] = Math.max(effective[id], liftMilestone(preds[i].from) + preds[i].lag);
      }
      msStack[id] = false;
      msDone[id] = true;
      return effective[id];
    }
    miles.forEach(function (m) { liftMilestone(m.id); });

    // Stage 5: initiative projected end + headline slip
    var initProjEnd = {}, slip = {};
    inits.forEach(function (I) {
      var vals = [I.plannedEnd];
      miles.forEach(function (m) { if (m.initiativeId === I.id) vals.push(effective[m.id]); });
      objs.forEach(function (o) {
        if (o.initiativeId === I.id && (!o.milestoneIds || o.milestoneIds.length === 0)) {
          vals.push(projEnd[o.id]);
        }
      });
      var pe = Math.max.apply(null, vals);
      initProjEnd[I.id] = pe;
      slip[I.id] = pe - I.plannedEnd;
    });

    return {
      objectiveProjectedEnd: projEnd,
      milestoneEffective: effective,
      initiativeProjectedEnd: initProjEnd,
      longTermSlip: slip,
      cycles: cycles
    };
  }

  // ---- exports --------------------------------------------------------------
  var API = {
    allocId: allocId,
    kpiScore: kpiScore,
    kpiCurrentValue: kpiCurrentValue,
    kpisFor: kpisFor,
    keyResultScore: keyResultScore,
    stageGateScore: stageGateScore,
    krsForObjective: krsForObjective,
    objectiveScore: objectiveScore,
    score: score,
    boundsOf: boundsOf,
    band: band,
    rollupObjective: rollupObjective,
    rollupInitiative: rollupInitiative,
    rollupDivision: rollupDivision,
    rollupCompany: rollupCompany,
    ownClass: ownClass,
    effClass: effClass,
    effProduct: effProduct,
    effModel: effModel,
    validateClassification: validateClassification,
    sliceScore: sliceScore,
    cascade: cascade,
    // exposed for tests / shells
    _mean: mean, _clamp: clamp, _progressLinear: progressLinear, _progressRange: progressRange
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RDCore = API;

})(typeof window !== 'undefined' ? window : this);