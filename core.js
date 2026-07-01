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
    keyResult: 'KR', stageGate: 'SG', task: 'TSK', kpi: 'KPI', kpiGroup: 'KPG',
    product: 'PRD', model: 'MDL'
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

  // ---- KPI levels + typed-link resolution (Unified KPI Model) --------------
  // A KPI is the measurement atom, hosted at a level (hostType). Levels rank the
  // hierarchy for link-direction validation + default-type lookup ONLY; they do
  // NOT drive resolution. Resolution follows explicit typed parent links (see the
  // typed-link block below). Legacy groupId/isDefiner data is normalized on the
  // fly (linkOf) and scores identically.
  var KPI_LEVEL = { product: 5, component: 4, initiative: 3, keyResult: 2, stageGate: 1, task: 0 };
  var PORTFOLIO_KEY = '__portfolio__';   // reserved docs-map key: portfolio KPIs join resolution, skipped by structural iteration

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
  // ---- typed-link resolution (Unified KPI Model, Phase B) ------------------
  // Each KPI optionally points at ONE parent via linkParent + linkType
  // (direct|contribute|specification) + optional linkPriority; the tree IS the
  // group and its root (linkParent==null) owns identity + authors the target.
  //   direct        : child shows the parent's target exactly (no override); value flows up
  //   contribute    : child may override the target (else inherit); value flows up
  //   specification : child may override the target (else inherit); value does NOT flow up (firewall)
  // Legacy groupId/isDefiner is normalized on the fly by linkOf (definer/standalone
  // -> root, every member -> contribute-child of its definer), so existing data
  // resolves identically. Precedence among contributors to a parent (§7): the
  // node's OWN reading ranks above its children; among children direct outranks
  // contribute; then quarter (nulls last), then reading recency. linkPriority wins first.
  var LINK_OWN_RANK = 3;                    // a node's own directly-posted reading
  function relationRank(type){ return type==='direct'?2 : type==='contribute'?1 : 0; }
  function kpiById(id, kpis){ for(var i=0;i<kpis.length;i++) if(kpis[i].id===id) return kpis[i]; return null; }
  function legacyDefinerId(kpi, kpis){
    var g=kpi.groupId; if(!g) return null; var first=null;
    for(var i=0;i<kpis.length;i++){ if(kpis[i].groupId===g){ if(first==null) first=kpis[i].id; if(kpis[i].isDefiner) return kpis[i].id; } }
    return first;
  }
  // normalized link for either model: {parent, type, priority}
  function linkOf(kpi, kpis){
    if(kpi.linkParent !== undefined) return { parent:kpi.linkParent, type:kpi.linkType||'contribute', priority:kpi.linkPriority||0 };
    if(!kpi.groupId || kpi.isDefiner) return { parent:null, type:'contribute', priority:0 };
    var def=legacyDefinerId(kpi, kpis); return { parent:(def===kpi.id?null:def), type:'contribute', priority:0 };
  }
  function rootOf(kpi, kpis){ var seen={}, cur=kpi;
    while(cur){ if(seen[cur.id]) return cur; seen[cur.id]=1; var lk=linkOf(cur,kpis);
      if(lk.parent==null) return cur; var p=kpiById(lk.parent,kpis); if(!p) return cur; cur=p; }
    return kpi; }
  function childrenOf(kpiId, kpis){ var out=[]; for(var i=0;i<kpis.length;i++) if(linkOf(kpis[i],kpis).parent===kpiId) out.push(kpis[i]); return out; }
  // wouldCreateCycle: true if pointing childId's parent at parentId would form a cycle — i.e. childId === parentId,
  // or childId already sits on parentId's ancestor chain. (A pre-existing upstream cycle is not attributed to this edit.)
  function wouldCreateCycle(childId, parentId, kpis){
    if(childId===parentId) return true;
    var seen={}, cur=kpiById(parentId,kpis);
    while(cur){ if(cur.id===childId) return true; if(seen[cur.id]) return false; seen[cur.id]=1;
      var lk=linkOf(cur,kpis); cur=(lk.parent!=null)?kpiById(lk.parent,kpis):null; }
    return false;
  }
  // ── product composition (model-to-model): edges are { id, parent, child }, meaning parent-model CONTAINS child-model.
  // A child model plugged into a parent model is a "sub-product". This edge list is the canonical graph (planning reads
  // it directly; the designer hosts the imported specs on a refModel-marked component). All four helpers are pure over
  // the edge array — no portfolio, no DOM.
  function compositionChildren(modelId, composition){ var out=[]; composition=composition||[]; for(var i=0;i<composition.length;i++) if(composition[i].parent===modelId) out.push(composition[i].child); return out; }
  function compositionParents(modelId, composition){ var out=[]; composition=composition||[]; for(var i=0;i<composition.length;i++) if(composition[i].child===modelId) out.push(composition[i].parent); return out; }
  function descendantModels(modelId, composition){ composition=composition||[]; var out={}, stack=[modelId];
    while(stack.length){ var kids=compositionChildren(stack.pop(), composition);
      for(var i=0;i<kids.length;i++) if(!out[kids[i]]){ out[kids[i]]=1; stack.push(kids[i]); } }
    var arr=[]; for(var k in out) arr.push(k); return arr; }
  // true if making parentModel contain childModel would form a composition cycle — i.e. same model, or childModel
  // already (transitively) contains parentModel. (A duplicate direct edge is the caller's check, not a cycle.)
  function wouldComposeCycle(parentModel, childModel, composition){
    if(parentModel===childModel) return true;
    return descendantModels(childModel, composition).indexOf(parentModel)!==-1;
  }
  // group = every KPI sharing a root (retained name/semantics for shells)
  function groupMembers(kpi, kpis){ var r=rootOf(kpi,kpis), out=[]; for(var i=0;i<kpis.length;i++) if(rootOf(kpis[i],kpis)===r) out.push(kpis[i]); return out; }
  // identity lives on the root (a lone KPI is its own root)
  function definerOf(kpi, kpis){ return rootOf(kpi, kpis); }
  function kpiDirection(kpi, kpis){ return rootOf(kpi, kpis).direction; }
  function kpiUnit(kpi, kpis){ return rootOf(kpi, kpis).unit; }
  function kpiName(kpi, kpis){ return rootOf(kpi, kpis).name; }

  function objectiveQuarter(objId, execDocs){
    if(objId==null || !execDocs) return null; var pf=execDocs[PORTFOLIO_KEY]; if(!pf) return null;
    var objs=pf.objectives||[]; for(var i=0;i<objs.length;i++) if(objs[i].id===objId) return objs[i].quarter||null; return null;
  }
  function precKey(kpi, reading, rank, execDocs){
    return { priority:(kpi.linkPriority||0), rank:rank, quarter:objectiveQuarter(kpi.objectiveId, execDocs), ts:(reading?(reading.timestamp||0):0) };
  }
  function precCmp(x, y){                    // sort comparator: negative => x wins (ranks first)
    if(x.priority!==y.priority) return y.priority-x.priority;
    if(x.rank!==y.rank) return y.rank-x.rank;
    if(x.quarter!==y.quarter){ if(x.quarter==null) return 1; if(y.quarter==null) return -1; return x.quarter<y.quarter?1:-1; }
    return (y.ts||0)-(x.ts||0);
  }
  function latestReadingObj(kpiId, execDocs){ var ups=readingsFor(kpiId, execDocs); return ups.length?ups[0]:null; }

  // effective TARGET — walk UP the parent chain (§6)
  function effectiveTarget(kpi, kpis, seen){
    seen=seen||{}; if(seen[kpi.id]) return null; seen[kpi.id]=1;
    var lk=linkOf(kpi,kpis);
    if(lk.parent==null) return kpi.target!=null?kpi.target:null;
    var P=kpiById(lk.parent,kpis); if(!P) return kpi.target!=null?kpi.target:null;
    if(lk.type==='direct') return effectiveTarget(P, kpis, seen);
    return kpi.target!=null ? kpi.target : effectiveTarget(P, kpis, seen);
  }
  // effective VALUE — own reading + direct/contribute children, precedence winner (§6/§7)
  function effectiveValue(kpi, kpis, execDocs, root, seen){
    seen=seen||{}; if(seen[kpi.id]) return null; seen[kpi.id]=1;
    root = root || rootOf(kpi, kpis);
    var pool=[];
    var ownV=resolvedReadingValue(kpi.id, root, execDocs);
    if(ownV!=null) pool.push({ value:ownV, key:precKey(kpi, latestReadingObj(kpi.id, execDocs), LINK_OWN_RANK, execDocs) });
    var kids=childrenOf(kpi.id, kpis);
    for(var i=0;i<kids.length;i++){ var lk=linkOf(kids[i],kpis);
      if(lk.type==='specification') continue;                          // firewall: value does not flow up
      var v=effectiveValue(kids[i], kpis, execDocs, root, seen);
      if(v!=null) pool.push({ value:v, key:precKey(kids[i], latestReadingObj(kids[i].id, execDocs), relationRank(lk.type), execDocs) });
    }
    if(!pool.length) return null;
    pool.sort(function(a,b){ return precCmp(a.key, b.key); });
    return pool[0].value;                                              // highest precedence contributor that has a value
  }
  // public 2/3-arg aliases (harness + shells call these)
  function effTarget(kpi, kpis){ return effectiveTarget(kpi, kpis); }
  function effValue(kpi, kpis, execDocs){ return effectiveValue(kpi, kpis, execDocs); }
  // materialize legacy groupId/isDefiner into explicit link fields (apps: on load, write back on save)
  function migrateKpiLinks(kpis){ var changed=false;
    for(var i=0;i<kpis.length;i++){ var k=kpis[i]; if(k.linkParent!==undefined) continue;
      var lk=linkOf(k, kpis); k.linkParent=lk.parent; k.linkType=lk.type; if(lk.priority) k.linkPriority=lk.priority; changed=true; }
    return changed;
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
    for (var div in execDocs) { if (!execDocs.hasOwnProperty(div) || div === PORTFOLIO_KEY) continue;
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
  // generic: mean resolved score of every KPI hosted at (hostType, hostId) — used for product/component levels
  function hostScore(hostType, hostId, execDocs) { return meanScorable(kpisFor(hostType, hostId, execDocs), execDocs); }

  // ---- objective & tier scores ---------------------------------------------
  function krsForObjective(objId, execDocs) {
    var out = [];
    for (var div in execDocs) {
      if (!execDocs.hasOwnProperty(div) || div === PORTFOLIO_KEY) continue;
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

  // Combine the portfolio doc into a docs map for cross-document KPI resolution.
  // Portfolio KPIs join the resolution pool (their targets/identity cascade down
  // to linked exec members; values cascade up from exec readings). The reserved
  // key is skipped by structural iteration, so KRs/gates/objectives never double.
  function withPortfolio(portfolio, execDocs) {
    var m = {}; m[PORTFOLIO_KEY] = portfolio || {};
    for (var k in execDocs) { if (execDocs.hasOwnProperty(k)) m[k] = execDocs[k]; }
    return m;
  }

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
      if (!execDocs.hasOwnProperty(dk) || dk === PORTFOLIO_KEY) continue;
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
    linkOf: linkOf,
    rootOf: rootOf,
    wouldCreateCycle: wouldCreateCycle,
    compositionChildren: compositionChildren,
    compositionParents: compositionParents,
    descendantModels: descendantModels,
    wouldComposeCycle: wouldComposeCycle,
    childrenOf: childrenOf,
    effectiveTarget: effectiveTarget,
    effectiveValue: effectiveValue,
    migrateKpiLinks: migrateKpiLinks,
    KPI_LEVEL: KPI_LEVEL,
    computeStat: computeStat,
    scoreEmbeddedKpi: scoreEmbeddedKpi,
    subKrScore: subKrScore,
    keyResultScore: keyResultScore,
    stageGateScore: stageGateScore,
    hostScore: hostScore,
    krsForObjective: krsForObjective,
    objectiveScore: objectiveScore,
    score: score,
    boundsOf: boundsOf,
    band: band,
    rollupObjective: rollupObjective,
    rollupInitiative: rollupInitiative,
    rollupDivision: rollupDivision,
    rollupCompany: rollupCompany,
    withPortfolio: withPortfolio,
    PORTFOLIO_KEY: PORTFOLIO_KEY,
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