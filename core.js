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
    keyResult: 'KR', stageGate: 'SG', task: 'TSK', kpi: 'KPI', kpiGroup: 'KPG'
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

  // ---- KPI link groups, level resolution & scoring (v1.3.1) ----------------
  // A KPI is the measurement atom, hosted at a level: initiative > keyResult >
  // stageGate > task(=execution). KPIs may share a free-standing groupId to form
  // a LINK GROUP; exactly one member carries isDefiner and owns the IDENTITY
  // (name/direction/unit). Resolution is asymmetric (decision v1.3.1):
  //   - TARGET cascades DOWN: a member's effective target = its own if set, else
  //     the nearest HIGHER level's (self overrides ancestor). Within-objective
  //     levels resolve against the same objective; the initiative level is
  //     objective-agnostic (one definition spanning every linked objective).
  //   - VALUE cascades UP: a member's effective value = its own latest reading if
  //     present, else the nearest LOWER level's. A higher-level reading never
  //     leaks downward; a higher level's own reading overrides a lower one for
  //     that higher level (positional override).
  // A KPI with no groupId is a standalone singleton (its own definer) -> the
  // resolution collapses to its own target/value, identical to v1.3.
  var KPI_LEVEL = { initiative: 3, keyResult: 2, stageGate: 1, task: 0 };

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

  // ---- statistics (for statistical KPI targets) ----------------------------
  function statSum(xs){ var s=0; for(var i=0;i<xs.length;i++) s+=xs[i]; return s; }
  function statAverage(xs){ return xs.length ? statSum(xs)/xs.length : null; }
  function statMedian(xs){ if(!xs.length) return null; var a=xs.slice().sort(function(p,q){return p-q;}); var m=Math.floor(a.length/2); return a.length%2 ? a[m] : (a[m-1]+a[m])/2; }
  function statMax(xs){ if(!xs.length) return null; var m=xs[0]; for(var i=1;i<xs.length;i++) if(xs[i]>m) m=xs[i]; return m; }
  function statMin(xs){ if(!xs.length) return null; var m=xs[0]; for(var i=1;i<xs.length;i++) if(xs[i]<m) m=xs[i]; return m; }
  function statStdDev(xs){ if(xs.length<2) return xs.length?0:null; var mu=statAverage(xs),s=0; for(var i=0;i<xs.length;i++){ var d=xs[i]-mu; s+=d*d; } return Math.sqrt(s/(xs.length-1)); }
  function statCV(xs){ var mu=statAverage(xs); if(mu==null||mu===0) return null; var sd=statStdDev(xs); return sd==null?null:(sd/Math.abs(mu))*100; }
  function statRange(xs){ if(!xs.length) return null; return statMax(xs)-statMin(xs); }
  function computeStat(name, xs){
    switch(name){
      case 'average': return statAverage(xs);
      case 'median':  return statMedian(xs);
      case 'stddev':  return statStdDev(xs);
      case 'cv':      return statCV(xs);
      case 'range':   return statRange(xs);
      case 'max':     return statMax(xs);
      case 'min':     return statMin(xs);
    }
    return statAverage(xs);
  }
  // all readings posted to a kpi id, newest first
  function readingsFor(kpiId, execDocs){
    var out=[];
    for(var div in execDocs){ if(!execDocs.hasOwnProperty(div)) continue;
      var ups=execDocs[div].kpiUpdates||[];
      for(var i=0;i<ups.length;i++) if(ups[i].kpiId===kpiId) out.push(ups[i]);
    }
    out.sort(function(a,b){ return (b.timestamp||0)-(a.timestamp||0); });
    return out;
  }
  // resolved value for a member id honoring the definer's targetType:
  // 'statistical' aggregates the latest readCount readings; else the newest reading.
  function resolvedReadingValue(kpiId, defn, execDocs){
    var ups=readingsFor(kpiId, execDocs);
    if(!ups.length) return null;
    if(defn && defn.targetType==='statistical'){
      var n=parseInt(defn.readCount,10);
      var slice=(isNaN(n)||n<=0)?ups:ups.slice(0,n);
      var xs=[]; for(var i=0;i<slice.length;i++){ var v=Number(slice[i].value); if(!isNaN(v)) xs.push(v); }
      if(!xs.length) return null;
      return computeStat(defn.statistic||'average', xs);
    }
    return ups[0].value;
  }

  // latest reading posted to a specific KPI id (the host where it was entered)
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

  function allKpis(execDocs) {
    var out = [];
    for (var div in execDocs) {
      if (!execDocs.hasOwnProperty(div)) continue;
      var ks = execDocs[div].kpis || [];
      for (var i = 0; i < ks.length; i++) out.push(ks[i]);
    }
    return out;
  }
  function effGroup(kpi) { return kpi.groupId || kpi.id; }
  function groupMembers(kpi, kpis) {
    var g = effGroup(kpi), out = [];
    for (var i = 0; i < kpis.length; i++) if (effGroup(kpis[i]) === g) out.push(kpis[i]);
    return out;
  }
  // the definer owns identity; a lone member is its own definer
  function definerOf(kpi, kpis) {
    var members = groupMembers(kpi, kpis);
    for (var i = 0; i < members.length; i++) if (members[i].isDefiner) return members[i];
    return members[0] || kpi;
  }
  function kpiDirection(kpi, kpis) { return definerOf(kpi, kpis).direction; }
  function kpiUnit(kpi, kpis) { return definerOf(kpi, kpis).unit; }
  function kpiName(kpi, kpis) { return definerOf(kpi, kpis).name; }

  // the group member sitting at a given level (within objectiveId for the
  // within-objective levels; objective-agnostic at the initiative level)
  function memberAtLevel(members, level, objectiveId) {
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (KPI_LEVEL[m.hostType] !== level) continue;
      if (level === KPI_LEVEL.initiative) return m;
      if (m.objectiveId === objectiveId) return m;
    }
    return null;
  }

  // effective TARGET: self, then nearest higher level (cascades down)
  function effTarget(kpi, kpis) {
    var members = groupMembers(kpi, kpis);
    var lvl = KPI_LEVEL[kpi.hostType];
    for (var L = lvl; L <= KPI_LEVEL.initiative; L++) {
      var m = memberAtLevel(members, L, kpi.objectiveId);
      if (m && m.target != null) return m.target;
    }
    return null;
  }
  // effective VALUE: self, then nearest lower level (cascades up)
  function effValue(kpi, kpis, execDocs) {
    var members = groupMembers(kpi, kpis);
    var defn = definerOf(kpi, kpis);
    var lvl = KPI_LEVEL[kpi.hostType];
    for (var L = lvl; L >= 0; L--) {
      var m = memberAtLevel(members, L, kpi.objectiveId);
      if (m) {
        var v = resolvedReadingValue(m.id, defn, execDocs);
        if (v != null) return v;
      }
    }
    return null;
  }

  // kpiScore(kpi, currentValue) -> 0..100 or null. Pure formula against the
  // kpi's own direction/target (used for standalone KPIs and unit tests).
  function kpiScore(kpi, currentValue) {
    if (kpi.targetType === 'binary') {
      if (currentValue == null) return null;
      return currentValue >= 1 ? 100 : 0;
    }
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

  // group/level-aware score: resolved target (down) vs resolved value (up),
  // direction from the definer.
  function kpiScoreResolved(kpi, kpis, execDocs) {
    var defn = definerOf(kpi, kpis);
    if (defn.targetType === 'binary') {
      var bv = effValue(kpi, kpis, execDocs);
      if (bv == null) return null;
      return bv >= 1 ? 100 : 0;
    }
    var target = effTarget(kpi, kpis);
    if (target == null) return null;
    var value = effValue(kpi, kpis, execDocs);
    if (value == null) return null;
    var dir = kpiDirection(kpi, kpis);
    var raw = (dir === 'range') ? progressRange(value, target.lo, target.hi)
                                : progressLinear(value, target, dir);
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
    var all = allKpis(execDocs);
    var scores = [];
    for (var i = 0; i < kpis.length; i++) {
      var s = kpiScoreResolved(kpis[i], all, execDocs);
      if (s != null) scores.push(s);
    }
    return mean(scores);
  }

  // find a KR object across exec docs
  function findKr(krId, execDocs) {
    for (var div in execDocs) { if (!execDocs.hasOwnProperty(div)) continue;
      var krs = execDocs[div].keyResults || [];
      for (var i = 0; i < krs.length; i++) if (krs[i].id === krId) return krs[i];
    }
    return null;
  }
  // score one embedded KPI (sub-KR tracker) from its stored `current`
  function scoreEmbeddedKpi(k) {
    var tt = k.targetType || k.type || 'demonstration';
    if (tt === 'binary') {
      if (k.current == null) return null;
      return Number(k.current) >= 1 ? 100 : 0;
    }
    if (k.current == null) return null;
    var cur = Number(k.current); if (isNaN(cur)) return null;
    if (k.target == null || k.target === '') return null;
    var tgt = Number(k.target); if (isNaN(tgt)) return null;
    var dir = (k.direction === 'down' || k.direction === 'decrease') ? 'down' : 'up';
    return clamp(progressLinear(cur, tgt, dir), 0, 100);
  }
  function meanEmbedded(kpis) {
    var scores = [];
    for (var i = 0; i < (kpis || []).length; i++) { var s = scoreEmbeddedKpi(kpis[i]); if (s != null) scores.push(s); }
    return mean(scores);
  }
  // weighted mean of sub-KR scores (percentage -> progress, kpi -> embedded KPI mean)
  function subKrScore(subKrs) {
    var totalW = 0, sum = 0, any = false;
    for (var i = 0; i < (subKrs || []).length; i++) {
      var skr = subKrs[i], pct;
      if ((skr.trackingType || 'percentage') === 'kpi') pct = meanEmbedded(skr.kpis || []);
      else pct = (skr.progress == null) ? null : clamp(Number(skr.progress), 0, 100);
      if (pct == null) continue;
      var w = Number(skr.weight) || 1;
      totalW += w; sum += w * pct; any = true;
    }
    return (any && totalW > 0) ? sum / totalW : null;
  }
  // keyResultScore: percentage -> manual %, subkr -> weighted sub-KR mean,
  // else (kpi / absent) -> mean of the KR's KPIs' resolved scores
  function keyResultScore(krId, execDocs) {
    var kr = findKr(krId, execDocs);
    var tt = kr ? (kr.trackingType || 'kpi') : 'kpi';
    if (tt === 'percentage') {
      if (!kr || kr.progress == null) return null;
      return clamp(Number(kr.progress), 0, 100);
    }
    if (tt === 'subkr') return subKrScore(kr.subKrs || []);
    return meanScorable(kpisFor('keyResult', krId, execDocs), execDocs);
  }
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

  // ---- stage-gate state classifier (pure; baseline-aware) ------------------
  // passed-late compares the actual finish to the COMMITTED reference
  // (baselineDate if set, else plannedDate); overdue is about the current plan.
  function classifyGate(g, today) {
    if (!g) return 'pending';
    var ref = (g.baselineDate != null) ? g.baselineDate : g.plannedDate;
    if (g.actualDate != null) {
      return (ref != null && g.actualDate > ref) ? 'passed-late' : 'passed';
    }
    if (g.plannedDate != null && g.plannedDate < today) return 'overdue';
    return 'pending';
  }

  // ---- schedule cascade (§6) -----------------------------------------------
  // cascade(portfolio, execDocs, today) ->
  //   { objectiveProjectedEnd, milestoneEffective, initiativeProjectedEnd,
  //     longTermSlip, gateEffective, gateSlipped, cycles }
  function cascade(portfolio, execDocs, today) {
    var objs = portfolio.objectives || [];
    var inits = portfolio.initiatives || [];
    var miles = portfolio.milestones || [];
    var objById = {}; objs.forEach(function (o) { objById[o.id] = o; });
    var cycles = [];

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

    // Stage 1a: gather children once; index every gate globally
    var childCache = {}, gateById = {}, gateObjOf = {};
    objs.forEach(function (o) {
      var c = childrenOf(o);
      childCache[o.id] = c;
      c.sgs.forEach(function (s) { gateById[s.id] = s; gateObjOf[s.id] = o; });
    });

    // gate predecessors: explicit stageGateEdges + opt-in per-objective date-chain.
    // Edges and the chain flag may live on the portfolio (cross-division) OR in an
    // execDoc (per-division, authored in the execution app). Both are merged here.
    // With none of them, a gate has no preds and gateEff == pfGate.
    var gatePreds = {};
    Object.keys(gateById).forEach(function (gid) { gatePreds[gid] = []; });
    function addGateEdge(e) { if (e && gatePreds[e.toGate]) gatePreds[e.toGate].push({ from: e.fromGate, lag: e.lagDays || 0 }); }
    (portfolio.stageGateEdges || []).forEach(addGateEdge);
    for (var dk in execDocs) {
      if (!execDocs.hasOwnProperty(dk)) continue;
      (execDocs[dk].stageGateEdges || []).forEach(addGateEdge);
    }
    objs.forEach(function (o) {
      var exChain = (execFor(o.divisionId).chainGatesByDate || {})[o.id];
      if (!o.chainGatesByDate && !exChain) return;
      var seq = childCache[o.id].sgs.filter(function (s) { return s.plannedDate != null; })
        .slice().sort(function (a, b) { return a.plannedDate - b.plannedDate; });
      for (var i = 1; i < seq.length; i++) {
        gatePreds[seq[i].id].push({ from: seq[i - 1].id, lag: 0 });
      }
    });

    // Stage 1b: gate->gate forward pass, seeded from pfGate (cycle-guarded, lagged).
    // A locked gate is exempt from INHERITED push (committed date holds), but it
    // still seeds its successors at pfGate. Lock never lets an overdue, undone gate
    // read as on-time: the seed still floors at today via pfGate.
    var gateEff = {}, gateStack = {};
    function computeGateEff(gid) {
      if (gateEff[gid] != null) return gateEff[gid];
      var g = gateById[gid];
      if (!g) return 0;
      var seed = pfGate(g);
      if (g.locked) { gateEff[gid] = seed; return seed; }
      if (gateStack[gid]) { cycles.push('GATE:' + gid); return seed; }
      gateStack[gid] = true;
      var res = seed, preds = gatePreds[gid];
      for (var i = 0; i < preds.length; i++) {
        if (gateStack[preds[i].from]) { cycles.push('GATE:' + preds[i].from); continue; }
        res = Math.max(res, computeGateEff(preds[i].from) + preds[i].lag);
      }
      gateStack[gid] = false;
      gateEff[gid] = res;
      return res;
    }
    Object.keys(gateById).forEach(function (gid) { computeGateEff(gid); });

    // baseline-aware slip per gate: slipped iff committed and now forecast past it.
    var gateSlipped = {};
    Object.keys(gateById).forEach(function (gid) {
      var g = gateById[gid];
      gateSlipped[gid] = (g.baselineDate != null) && (gateEff[gid] > g.baselineDate);
    });

    // Stage 1c: intrinsic projected end per objective (tasks + chained gate ends)
    var intrinsic = {};
    objs.forEach(function (o) {
      var c = childCache[o.id], vals = [];
      c.tasks.forEach(function (t) { vals.push(pfTask(t)); });
      c.sgs.forEach(function (s) { vals.push(gateEff[s.id]); });
      intrinsic[o.id] = vals.length ? Math.max.apply(null, vals) : o.plannedEnd;
    });

    // Stage 2: lateral OBJ->OBJ forward pass (topological, cycle-guarded)
    var objPreds = {}; objs.forEach(function (o) { objPreds[o.id] = []; });
    (portfolio.objectiveEdges || []).forEach(function (e) {
      if (objPreds[e.toObj]) objPreds[e.toObj].push({ from: e.fromObj, lag: e.lagDays || 0 });
    });
    var projEnd = {}, objStack = {};
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
      gateEffective: gateEff,
      gateSlipped: gateSlipped,
      cycles: cycles
    };
  }

  // ---- exports --------------------------------------------------------------
  var API = {
    allocId: allocId,
    kpiScore: kpiScore,
    kpiScoreResolved: kpiScoreResolved,
    kpiCurrentValue: kpiCurrentValue,
    kpisFor: kpisFor,
    groupMembers: groupMembers,
    definerOf: definerOf,
    kpiDirection: kpiDirection,
    kpiUnit: kpiUnit,
    kpiName: kpiName,
    effTarget: effTarget,
    effValue: effValue,
    computeStat: computeStat,
    scoreEmbeddedKpi: scoreEmbeddedKpi,
    subKrScore: subKrScore,
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
    classifyGate: classifyGate,
    // exposed for tests / shells
    _mean: mean, _clamp: clamp, _progressLinear: progressLinear, _progressRange: progressRange
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RDCore = API;

})(typeof window !== 'undefined' ? window : this);