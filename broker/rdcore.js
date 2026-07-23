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
   - Unscored (g1'): a KPI with NO target is excluded from its KR's mean entirely
     — it is not a target. A KPI that HAS a target but no read counts as 0, so a
     group cannot score on the strength of the one member somebody measured. If
     NOTHING in the group has been read the group is unscored (null), because
     "not measured" is absence of information, not failure. A KR with no scorable
     KPIs is unscored; an objective with no scorable KRs has no band, not zero.
     No synthesized KRs (decision #3).
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
    unit: 'UNIT', division: 'DIV', initiative: 'INIT', milestone: 'MS', objective: 'OBJ',
    keyResult: 'KR', stageGate: 'SG', task: 'TSK', kpi: 'KPI', kpiGroup: 'KPG',
    product: 'PRD', model: 'MDL', stageGateSet: 'SGSET'
  };
  // Structural levels pad to 2 digits; leaf metrics use plain integers.
  var ID_PAD = { initiative: 2, milestone: 2, objective: 2 };

  function stemFromParent(type, parentId, opts) {
    if (type === 'division' || type === 'unit') return opts.code;   // explicit short code, e.g. "FC" / "BIZ"
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
    if (type === 'division' || type === 'unit') {
      var did = prefix + '-' + stem;
      if (existingIds.indexOf(did) !== -1) throw new Error('allocId: duplicate ' + type + ' code ' + stem);
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
  var KPI_LEVEL = { product: 5, component: 4, initiative: 3, milestone: 3, keyResult: 2, stageGate: 1, task: 0 };
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
  // A KPI may BORROW another KPI's readings (kpi.readsFrom) so that one sample feeds several statistics —
  // e.g. an average target and a CoV target over the same 10 points, entered once. The statistic still comes
  // from each KPI's own definer, so only the data is shared. Follows the chain to whoever actually holds the
  // readings; cycle-safe, and a KPI without readsFrom resolves to itself (unchanged).
  // NOTE: this is a deliberate stopgap for a first-class sample entity — the data still lives on a privileged
  // KPI rather than on the sample it belongs to.
  function readingSourceId(kpi, kpis){
    if(!kpi) return null;
    var seen={}, cur=kpi;
    while(cur && cur.readsFrom && !seen[cur.id]){
      seen[cur.id]=1;
      var nx=kpiById(cur.readsFrom, kpis||[]);
      if(!nx || nx.id===cur.id) break;
      cur=nx;
    }
    return cur.id;
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
      // aggregate ALL posted readings; readCount is the expected sample size (completeness), not a window
      var xs=[]; for(var i=0;i<ups.length;i++){ var v=Number(ups[i].value); if(!isNaN(v)) xs.push(v); }
      if(!xs.length) return null;
      return computeStat(defn.statistic||'average', xs);
    }
    return ups[0].value;
  }
  // count of numeric readings posted to a kpi id — for statistical-target completeness (N / expected)
  function readingCount(kpiId, execDocs){
    var ups=readingsFor(kpiId, execDocs), n=0;
    for(var i=0;i<ups.length;i++){ if(!isNaN(Number(ups[i].value))) n++; }
    return n;
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
  // node's OWN reading (manual) ALWAYS ranks above its children; among children the
  // latest link wins (higher linkPriority), then direct outranks contribute, then
  // quarter (nulls last), then reading recency.
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
    var def=legacyDefinerId(kpi, kpis); return { parent:(def===kpi.id?null:def), type:'contribute', priority:(kpi.linkPriority||0) };
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
  // model N's importable specs: the keyResult-hosted DEFINER kpis scoped to that model (its headline specifications).
  // A parent system references these when N is plugged in as a sub-product; component-level internals are excluded.
  function importableModelKpis(modelId, kpis){
    var out=[]; kpis=kpis||[]; for(var i=0;i<kpis.length;i++){ var k=kpis[i];
      if(k.objectiveId===modelId && k.hostType==='keyResult' && linkOf(k,kpis).parent==null) out.push(k); }
    return out;
  }
  // score a bare value against a bare target (number, or {lo,hi} for range) given direction — 0..100 or null.
  // used for imported sub-product specs, where the value comes from the child doc and the target may be an override.
  function rawScore(value, target, dir){
    if(value==null || target==null) return null;
    var raw = (dir==='range' && target && typeof target==='object')
      ? progressRange(value, target.lo, target.hi)
      : progressLinear(value, target, dir);
    return clamp(raw, 0, 100);
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
    var xo=(x.rank===LINK_OWN_RANK)?1:0, yo=(y.rank===LINK_OWN_RANK)?1:0;
    if(xo!==yo) return yo-xo;                 // a node's OWN reading (manual) always beats linked children
    if(x.priority!==y.priority) return y.priority-x.priority;  // among children: higher linkPriority = latest link wins
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
  // A parent may name its value sources EXPLICITLY (kpi.sources = [kpiId,...]) instead of each child
  // carrying linkParent. This exists because a milestone KPI lives in the portfolio doc while the KR KPIs
  // that feed it live in EXEC-<div> docs, which the planning app cannot write — so the link has to be stored
  // on the parent. sourcesOf is additive: a kpi with no `sources` behaves exactly as before.
  function sourcesOf(kpi, kpis){
    var out=[], ids=kpi.sources||[];
    for(var i=0;i<ids.length;i++){ var k=kpiById(ids[i], kpis); if(k) out.push(k); }
    return out;
  }
  // effectiveValueEntry: like effectiveValue but reports WHICH contributor won, so callers can name the
  // source of a value. { value, src, own }.
  function effectiveValueEntry(kpi, kpis, execDocs, root, seen){
    seen=seen||{}; if(seen[kpi.id]) return null; seen[kpi.id]=1;
    root = root || rootOf(kpi, kpis);
    var pool=[];
    var ownV=resolvedReadingValue(readingSourceId(kpi, kpis), root, execDocs);   // borrowed sample, own statistic
    if(ownV!=null) pool.push({ value:ownV, src:kpi.id, own:true, key:precKey(kpi, latestReadingObj(kpi.id, execDocs), LINK_OWN_RANK, execDocs) });
    var kids=childrenOf(kpi.id, kpis);
    var ex=sourcesOf(kpi, kpis);
    for(var j=0;j<ex.length;j++) if(kids.indexOf(ex[j])===-1) kids.push(ex[j]);   // explicit sources join the children
    for(var i=0;i<kids.length;i++){ var lk=linkOf(kids[i],kpis);
      if(lk.type==='specification') continue;                          // firewall: value does not flow up
      var e=effectiveValueEntry(kids[i], kpis, execDocs, root, seen);
      if(e!=null && e.value!=null) pool.push({ value:e.value, src:e.src, own:false, key:precKey(kids[i], latestReadingObj(kids[i].id, execDocs), relationRank(lk.type), execDocs) });
    }
    if(!pool.length) return null;
    // A milestone KPI draws from several sources at once and asks "did ANY of them meet the milestone?", so
    // the BEST-SCORING source wins — each contributor's value scored against THIS kpi's own target, not the
    // contributor's. (Pressure >= 40 bar fed by a 10 bar KR and a 40 bar KR -> the 40 bar KR wins.) A value
    // posted directly on the milestone KPI still overrides every source (LINK_OWN_RANK).
    var hasOwn=false; for(var p=0;p<pool.length;p++) if(pool[p].own) hasOwn=true;
    if(kpi.hostType==='milestone' && !hasOwn && pool.length>1){
      var tgt=effectiveTarget(kpi, kpis);
      var scored=kpi.targetType==='binary' || tgt!=null;
      if(scored){
        var probe={ targetType:kpi.targetType, target:tgt, direction:kpiDirection(kpi, kpis) };
        pool.sort(function(a,b){
          var sa=kpiScore(probe, a.value), sb=kpiScore(probe, b.value);
          if(sa==null) sa=-1; if(sb==null) sb=-1;
          if(sa!==sb) return sb-sa;                                     // best score first
          return precCmp(a.key, b.key);                                 // tie -> the existing precedence
        });
        return pool[0];
      }
    }
    pool.sort(function(a,b){ return precCmp(a.key, b.key); });
    return pool[0];                                                     // highest precedence contributor that has a value
  }
  function effectiveValue(kpi, kpis, execDocs, root, seen){
    var e=effectiveValueEntry(kpi, kpis, execDocs, root, seen);
    return e?e.value:null;
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

  // hasTarget -> is this KPI actually a target at all? Binary KPIs carry an implicit target; otherwise a
  // target must be defined, either its own or inherited through a link. A KPI with NO target is not a target
  // and must stay out of BOTH the numerator and the denominator — otherwise adding an unconfigured KPI would
  // drag the score down.
  function hasTarget(kpi, kpis) {
    if (definerOf(kpi, kpis).targetType === 'binary') return true;
    return effTarget(kpi, kpis) != null;
  }

  // meanScorable -> mean over every TARGET, counting an unread target as 0. (g1', supersedes g1.)
  //
  // This used to push only non-null scores, i.e. it silently dropped targets nobody had read. A stage-gate
  // with three targets and one reading of 100 scored mean([100]) = 100, so gateAtTarget() called it complete
  // while two of its three targets had never been measured. Same for a KR. The old comment on gateAtTarget
  // already claimed "ALL at/above target" — the code only ever checked the ones that had been read.
  //
  // But "nobody has read ANY of these yet" is not failure, it is absence of information: scoring it 0 would
  // paint every fresh KR red on day one and make "not measured" indistinguishable from "measured and missing".
  // That distinction is what g1 protected and it is kept. So:
  //     no targets at all        -> null (unscored, no band)
  //     targets, none read       -> null (unscored, no band)  <- g1's intent, preserved
  //     targets, >=1 read        -> mean over ALL targets, unread ones counting 0
  function meanScorable(kpis, execDocs) {
    var all = allKpis(execDocs);
    var scores = [], anyRead = false;
    for (var i = 0; i < kpis.length; i++) {
      if (!hasTarget(kpis[i], all)) continue;
      var s = kpiScoreResolved(kpis[i], all, execDocs);
      if (s != null) anyRead = true;
      scores.push(s == null ? 0 : s);
    }
    if (!anyRead) return null;
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
  // ---- Milestone KR tracking (embedded steps) ------------------------------
  // A milestone KR is a weighted checklist of dated steps. Weights are forced to
  // total 100: explicit weights are kept, blank weights split the remainder evenly.
  // creditMode is KR-level: 'binary' gives a step its full weight only when it is
  // 100% complete (strict); 'partial' scales weight by the step's completion.
  function milestoneEffectiveWeights(steps) {
    steps = steps || [];
    var explicit = 0, blanks = 0;
    for (var i = 0; i < steps.length; i++) {
      var w = steps[i].weight;
      if (w == null || w === '') blanks++; else explicit += Number(w);
    }
    var share = blanks ? Math.max(0, 100 - explicit) / blanks : 0;
    return steps.map(function (s) {
      var isBlank = (s.weight == null || s.weight === '');
      return { id: s.id, w: isBlank ? share : Number(s.weight), auto: isBlank };
    });
  }
  function milestoneStepContribution(step, w, mode) {
    var c = Math.max(0, Math.min(100, Number(step.completion) || 0));
    return mode === 'binary' ? (c >= 100 ? w : 0) : w * c / 100;
  }
  // 0..100, or null when the KR has no steps (so it drops out of the objective mean,
  // exactly like a KPI KR with nothing measured).
  function milestoneKrScore(kr) {
    if (!kr) return null;
    var steps = kr.steps || [];
    if (!steps.length) return null;
    var eff = milestoneEffectiveWeights(steps);
    var wOf = {};
    for (var i = 0; i < eff.length; i++) wOf[eff[i].id] = eff[i].w;
    var mode = kr.creditMode || 'binary';
    var total = 0;
    for (var j = 0; j < steps.length; j++) total += milestoneStepContribution(steps[j], wOf[steps[j].id] || 0, mode);
    return total;
  }

  // ---- Kanban stage-gating (board = one gate sequence, tiles = parallel workstreams) --------
  // A board's columns are an ordered stage-gate sequence; each tile is one workstream (a "driver")
  // moving through them. Swimlanes carry the rules (max days per column, a deadline) that drive both
  // tile health and — via gateDueDates — where the gates land on a timeline. Gates are binary; no score.
  function _kIsoDay(iso) { if (!iso) return null; var t = Date.parse(iso + 'T00:00:00Z'); return isNaN(t) ? null : Math.round(t / 86400000); }
  function _kDayIso(d) { return d == null ? '' : new Date(d * 86400000).toISOString().slice(0, 10); }

  // Health of a NON-closed tile from its swimlane's rules. (A tile in the last column is "closed" — the
  // caller buckets that separately; health here is purely days-in-column + deadline proximity.)
  function tileHealth(tile, swimlane, todayIso) {
    var today = _kIsoDay(todayIso);
    var entered = _kIsoDay(tile && tile.enteredCol);
    var days = (today != null && entered != null) ? Math.max(0, today - entered) : 0;
    var status = 'on-track', notes = [];
    var max = swimlane ? (Number(swimlane.maxDaysPerCol) || 0) : 0;
    if (max) {
      if (days > max) { status = 'breached'; notes.push('over ' + max + 'd in column'); }
      else if (days >= Math.ceil(max * 0.8)) { status = 'at-risk'; notes.push(days + '/' + max + 'd'); }
    }
    if (swimlane && swimlane.deadline && today != null) {
      var left = _kIsoDay(swimlane.deadline) - today;
      if (left < 0) { status = 'breached'; notes.push('past deadline'); }
      else if (left <= 7 && status !== 'breached') { status = 'at-risk'; notes.push(left + 'd to deadline'); }
    }
    return { status: status, daysInCol: days, note: notes.join(' \u00b7 ') };
  }

  // Roll-up a board into the metrics a KPI/KR can read. A tile in the last column counts as "closed"
  // (not on/at-risk/breached). Also returns per-column tile counts.
  function boardSummary(board, todayIso) {
    board = board || {};
    var cols = board.columns || [], tiles = board.tiles || [], lanes = board.swimlanes || [];
    var lastColId = cols.length ? cols[cols.length - 1].id : null;
    var laneById = {}; for (var i = 0; i < lanes.length; i++) laneById[lanes[i].id] = lanes[i];
    var perColumn = {}; for (var c = 0; c < cols.length; c++) perColumn[cols[c].id] = 0;
    var sum = { onTrack: 0, atRisk: 0, breached: 0, closed: 0, total: tiles.length };
    for (var t = 0; t < tiles.length; t++) {
      var tile = tiles[t];
      if (perColumn.hasOwnProperty(tile.col)) perColumn[tile.col]++;
      if (tile.col === lastColId) { sum.closed++; continue; }
      var h = tileHealth(tile, laneById[tile.lane], todayIso);
      if (h.status === 'breached') sum.breached++;
      else if (h.status === 'at-risk') sum.atRisk++;
      else sum.onTrack++;
    }
    return { perColumn: perColumn, onTrack: sum.onTrack, atRisk: sum.atRisk, breached: sum.breached, closed: sum.closed, total: sum.total };
  }

  // Pure transition: move a tile. Advancing to a new column resets days-in-column (enteredCol = today);
  // changing swimlane re-parents its rules. Returns a NEW board (original untouched).
  function dropTile(board, tileId, toCol, toLane, todayIso) {
    var nb = JSON.parse(JSON.stringify(board || {}));
    var tiles = nb.tiles || [], cols = nb.columns || [];
    var colIndex = {}; for (var ci = 0; ci < cols.length; ci++) colIndex[cols[ci].id] = ci;
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].id === tileId) {
        if (toCol != null && tiles[i].col !== toCol) { tiles[i].col = toCol; tiles[i].enteredCol = todayIso || tiles[i].enteredCol; }
        if (toLane != null) tiles[i].lane = toLane;
        // reconcile gate-crossing stamps against the tile's (possibly new) position
        var cur = colIndex[tiles[i].col];
        if (cur != null) {
          var gp = tiles[i].gatePassed || {};
          for (var k = 0; k < cols.length; k++) {
            var cid = cols[k].id;
            if (k < cur) { if (!gp[cid]) gp[cid] = todayIso || ''; }   // newly cleared -> stamp today
            else if (gp[cid]) { delete gp[cid]; }                       // retreated past -> un-stamp
          }
          tiles[i].gatePassed = gp;
        }
        break;
      }
    }
    return nb;
  }

  // ---- Kanban gate status for the Gantt ----------------------------------------------------
  // Per (tile, gate-column-index): has the tile cleared this gate, and on time or late? or is it overdue/pending?
  //   'passed-ontime' | 'passed-late' | 'overdue' | 'pending'
  function gateTileState(board, tile, colIndex, todayIso) {
    var cols = (board && board.columns) || [];
    if (colIndex < 0 || colIndex >= cols.length) return 'pending';
    var laneById = {}; ((board && board.swimlanes) || []).forEach(function (l) { laneById[l.id] = l; });
    var lane = laneById[tile.lane];
    var due = gateDueDates(cols, lane, tile).due[colIndex];   // iso or ''
    var curIdx = -1; for (var i = 0; i < cols.length; i++) if (cols[i].id === tile.col) { curIdx = i; break; }
    var col = cols[colIndex];
    if (curIdx > colIndex) {                                  // cleared this gate
      var crossed = (tile.gatePassed || {})[col.id];
      if (crossed && due && crossed > due) return 'passed-late';
      return 'passed-ontime';
    }
    // not cleared
    if (due && todayIso && todayIso > due) return 'overdue';
    return 'pending';
  }

  // Aggregate a gate column across all tiles for the collapsed board row: how many passed, and the WORST state
  // (red = any overdue > orange = any late > green = all passed > none = some pending, none late/overdue).
  function boardGateSummary(board, colIndex, todayIso) {
    var tiles = (board && board.tiles) || [];
    var passed = 0, anyOverdue = false, anyLate = false, allPassed = tiles.length > 0;
    for (var i = 0; i < tiles.length; i++) {
      var st = gateTileState(board, tiles[i], colIndex, todayIso);
      if (st === 'passed-ontime' || st === 'passed-late') passed++; else allPassed = false;
      if (st === 'overdue') anyOverdue = true;
      if (st === 'passed-late') anyLate = true;
    }
    var worst = anyOverdue ? 'red' : (anyLate ? 'orange' : (allPassed ? 'green' : 'none'));
    return { passed: passed, total: tiles.length, worst: worst };
  }

  // Dated milestone-KR steps for the Gantt: only steps WITH a due date, each with a completion-derived status.
  //   'done' (100%) | 'overdue' (<100 & past due) | 'pending'
  function milestoneGanttSteps(kr, todayIso) {
    var steps = (kr && kr.steps) || [];
    var out = [];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (!s.due) continue;                                   // undated steps don't go on the timeline
      var c = Math.max(0, Math.min(100, Number(s.completion) || 0));
      var status = c >= 100 ? 'done' : ((todayIso && todayIso > s.due) ? 'overdue' : 'pending');
      out.push({ id: s.id, name: s.name, due: s.due, completion: c, status: status });
    }
    return out;
  }

  // Where each gate (column) lands on a timeline for a given tile, from its swimlane's rules.
  // due[i] = the date the tile should have CLEARED column i.
  //   no deadline  -> forward:  due[i] = start + (i+1)*maxDaysPerCol
  //   deadline set -> backward: due[last] = deadline; due[i] = deadline - (N-1-i)*maxDaysPerCol
  //                   feasible iff (deadline - start) >= N*maxDaysPerCol
  function gateDueDates(columns, swimlane, tile) {
    var N = (columns || []).length;
    var M = swimlane ? (Number(swimlane.maxDaysPerCol) || 0) : 0;
    var S = _kIsoDay(tile && tile.startDate);
    var due = [], feasible = true;
    if (swimlane && swimlane.deadline) {
      var D = _kIsoDay(swimlane.deadline);
      for (var i = 0; i < N; i++) due.push(D == null ? '' : _kDayIso(D - (N - 1 - i) * M));
      feasible = (D != null && S != null) ? (D - S) >= N * M : true;
    } else {
      for (var j = 0; j < N; j++) due.push(S == null ? '' : _kDayIso(S + (j + 1) * M));
      feasible = true;
    }
    return { due: due, feasible: feasible };
  }

  function keyResultScore(krId, execDocs) {
    var kr = findKr(krId, execDocs);
    var tt = kr ? (kr.trackingType || 'kpi') : 'kpi';
    if (tt === 'percentage') {
      if (!kr || kr.progress == null) return null;
      return clamp(Number(kr.progress), 0, 100);
    }
    if (tt === 'subkr') return subKrScore(kr.subKrs || []);
    if (tt === 'milestone') return milestoneKrScore(kr);
    return meanScorable(kpisFor('keyResult', krId, execDocs), execDocs);
  }
  // Pace-aware KR status: attainment vs how far the parent objective's timeline has elapsed.
  function keyResultPaceBand(attainment, plannedStart, plannedEnd, today) {
    if (attainment == null) return 'no-band';
    if (attainment >= 100) return 'on-track';                                                        // target met
    if (plannedStart == null || plannedEnd == null || plannedEnd <= plannedStart) return band(attainment); // no dates -> score band
    var elapsed = Math.max(0, Math.min(1, (today - plannedStart) / (plannedEnd - plannedStart))) * 100;
    if (elapsed >= 100) return 'off-track';                                                          // past plannedEnd, unmet
    var gap = elapsed - attainment;                                                                  // pts behind the linear pace
    if (gap <= 10) return 'on-track';
    if (gap <= 30) return 'at-risk';
    return 'off-track';
  }
  function keyResultPace(krId, obj, execDocs, today) {
    var att = keyResultScore(krId, execDocs);
    var ps = obj ? obj.plannedStart : null, pe = obj ? obj.plannedEnd : null;
    var elapsed = (ps != null && pe != null && pe > ps) ? Math.max(0, Math.min(1, (today - ps) / (pe - ps))) * 100 : null;
    return { attainment: att, elapsed: elapsed, gap: (att != null && elapsed != null) ? (elapsed - att) : null, band: keyResultPaceBand(att, ps, pe, today) };
  }
  // stageGateScore -> mean of the gate's KPIs (gating/readiness; NOT in OKR score)
  function stageGateScore(sgId, execDocs) { return meanScorable(kpisFor('stageGate', sgId, execDocs), execDocs); }
  // gateAtTarget -> true iff EVERY target on the gate has been read and is at/above target. Unread targets
  // score 0 (see meanScorable), so a gate cannot pass on the strength of the one target somebody measured.
  // A gate with NO scorable KPIs scores null (not 100), so this is the built-in 0/0 auto-complete guard.
  function gateAtTarget(sgId, execDocs) { return stageGateScore(sgId, execDocs) === 100; }

  // ---- stage-gate SETS (parallel workstreams within an objective) -----------
  // A gate carries setId; sets are declared in execDoc.stageGateSets [{id,objectiveId,name,order,chained}].
  function gatesForSet(setId, execDocs){ var out=[]; for(var d in execDocs){ if(!execDocs.hasOwnProperty(d)||d===PORTFOLIO_KEY) continue; var gs=execDocs[d].stageGates||[]; for(var i=0;i<gs.length;i++) if(gs[i].setId===setId) out.push(gs[i]); } return out; }
  function setsForObjective(objId, execDocs){ var out=[]; for(var d in execDocs){ if(!execDocs.hasOwnProperty(d)||d===PORTFOLIO_KEY) continue; var ss=execDocs[d].stageGateSets||[]; for(var i=0;i<ss.length;i++) if(ss[i].objectiveId===objId) out.push(ss[i]); } return out; }
  // set score = % of the set's gates that are passed (date-based classifyGate). null when the set has no gates.
  function setScore(setId, execDocs, today){ var gs=gatesForSet(setId, execDocs); if(!gs.length) return null; var p=0; for(var i=0;i<gs.length;i++){ var st=classifyGate(gs[i], today); if(st==='passed'||st==='passed-late') p++; } return 100*p/gs.length; }
  // objective gate readiness = MIN over the objective's sets of setScore (weakest workstream wins). null if no scorable sets.
  function objectiveGateReadiness(objId, execDocs, today){ var ss=setsForObjective(objId, execDocs), m=null; for(var i=0;i<ss.length;i++){ var sc=setScore(ss[i].id, execDocs, today); if(sc==null) continue; if(m==null||sc<m) m=sc; } return m; }
  // generic: mean resolved score of every KPI hosted at (hostType, hostId) — used for product/component levels
  function hostScore(hostType, hostId, execDocs) { return meanScorable(kpisFor(hostType, hostId, execDocs), execDocs); }
  // milestoneScore -> mean of the milestone's KPIs (peer of initiative in the KPI tree; a standalone
  // gating/readiness signal, NOT folded into the OKR score — same stance as stageGateScore).
  function milestoneScore(msId, execDocs) { return meanScorable(kpisFor('milestone', msId, execDocs), execDocs); }
  // milestoneAchieved -> manual completion mark (ms.completedDate) OR KPI score at 100.
  // A milestone with no scorable KPIs is achieved only by the manual mark.
  function milestoneAchieved(ms, execDocs) {
    if (ms && ms.completedDate) return true;
    var s = milestoneScore(ms && ms.id, execDocs);
    return s != null && s >= 100;
  }

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

  // ---- hierarchy lookups (Phase 1) -----------------------------------------
  // A division carries unitId (which unit it sits under) and kind ('rd' | 'biz', absent-means-'rd').
  function _divRow(divId, portfolio) {
    var ds = (portfolio && portfolio.divisions) || [];
    for (var i = 0; i < ds.length; i++) if (ds[i].id === divId) return ds[i];
    return null;
  }
  function unitIdOfDivision(divId, portfolio) {
    var d = _divRow(divId, portfolio);
    return (d && d.unitId) || null;      // null -> Unassigned
  }
  function divisionKind(div) { return (div && div.kind) || 'rd'; }   // absent -> rd
  function divisionsInUnit(unitId, portfolio) {
    var ds = (portfolio && portfolio.divisions) || [], out = [];
    for (var i = 0; i < ds.length; i++) if ((ds[i].unitId || null) === unitId) out.push(ds[i]);
    return out;
  }

  function objectivesInScope(entityType, entityId, portfolio) {
    var objs = portfolio.objectives || [];
    switch (entityType) {
      case 'objective':  return objs.filter(function (o) { return o.id === entityId; });
      case 'initiative': return objs.filter(function (o) { return o.initiativeId === entityId; });
      case 'division':   return objs.filter(function (o) { return o.divisionId === entityId; });
      case 'unit':       return objs.filter(function (o) { return unitIdOfDivision(o.divisionId, portfolio) === entityId; });
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
    // ended objectives (abandoned AND achieved) count in every rollup, quarterly and overall alike —
    // an abandoned objective's score is part of the record, not something the aggregate forgets.
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
  // Unit score: FLAT mean of every objective in the unit — "how is the work going in general". A larger
  // division therefore weighs more in its unit's score. Reuses the score() primitive via the 'unit' scope.
  function rollupUnit(id, portfolio, execDocs, quarter) { return score('unit', id, portfolio, execDocs, quarter); }
  // Company score: NESTED — the mean of the DIVISION scores, so every division counts equally regardless of
  // how many objectives it holds ("how are my divisions doing"). This is deliberately NOT the flat mean of all
  // objectives (the old behaviour) and NOT the mean of unit scores; a note in the UI reads "Mean of division
  // scores". A division with no scorable objectives drops out (null), exactly as an objective does in a lower mean.
  function rollupCompany(portfolio, execDocs, quarter) {
    var ds = (portfolio && portfolio.divisions) || [];
    var scores = [];
    for (var i = 0; i < ds.length; i++) {
      var sc = score('division', ds[i].id, portfolio, execDocs, quarter);
      if (sc != null) scores.push(sc);
    }
    return mean(scores);
  }

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

  // ---- quarter helpers (calendar quarters, matching YYYY"Q"N) ----
  function quarterRange(q) {                          // 'YYYYQN' -> { start:'YYYY-MM-DD', end:'YYYY-MM-DD' } | null
    var m = /^(\d{4})Q([1-4])$/.exec(String(q == null ? '' : q).trim());
    if (!m) return null;
    var y = +m[1], sm = (+m[2] - 1) * 3, pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var ey = y, em = sm + 3; if (em >= 12) { ey = y + 1; em = 0; }
    var last = new Date(Date.UTC(ey, em, 1) - 86400000);
    return { start: y + '-' + pad(sm + 1) + '-01',
             end: last.getUTCFullYear() + '-' + pad(last.getUTCMonth() + 1) + '-' + pad(last.getUTCDate()) };
  }
  function quarterList(used, refYear, back, fwd) {    // rolling window ∪ used, sorted; caller adds the blank option
    back = back == null ? 1 : back; fwd = fwd == null ? 2 : fwd;
    var set = {};
    for (var y = refYear - back; y <= refYear + fwd; y++) for (var q = 1; q <= 4; q++) set[y + 'Q' + q] = 1;
    (used || []).forEach(function (u) { if (/^\d{4}Q[1-4]$/.test(u)) set[u] = 1; });
    return Object.keys(set).sort();
  }

  // ---- layered grouping of objectives by an ordered list of dimensions ----
  // dims ⊂ ['division','product','model','quarter','owner','initiative']; product/model resolve
  // through the initiative (effProduct/effModel), so a blank objective inherits its initiative.
  // returns a nested tree: [{ key, dim, objs? , children? }] with '' (none) buckets ordered last.
  // owner was free text and is now a list of roster emails. Read BOTH shapes: a legacy string is a
  // one-element list, so nothing needs migrating and old data keeps grouping exactly as it did.
  function ownersOf(rec) {
    if (!rec) return [];
    var v = rec.owner;
    if (v == null || v === '') return [];
    if (Array.isArray(v)) return v.filter(function (x) { return x != null && x !== ''; });
    return [v];
  }
  function _dimKey(o, dim, portfolio) {
    if (dim === 'division') return o.divisionId || '';
    if (dim === 'product') return effProduct(o, portfolio) || '';
    if (dim === 'model') return effModel(o, portfolio) || '';
    if (dim === 'quarter') return o.quarter || '';
    if (dim === 'owner') { var ow = ownersOf(o); return ow.length ? ow : ''; }   // array = fan out (see _groupBy)
    if (dim === 'initiative') return o.initiativeId || '';
    if (dim === 'unit') return unitIdOfDivision(o.divisionId, portfolio) || '';
    return '';
  }
  function _dimOrder(dim, keys, portfolio) {
    var none = keys.indexOf('') >= 0, rest = keys.filter(function (k) { return k !== ''; });
    var src = dim === 'unit' ? portfolio.units : dim === 'division' ? portfolio.divisions : dim === 'product' ? portfolio.products
            : dim === 'model' ? portfolio.models : dim === 'initiative' ? portfolio.initiatives : null;
    if (src) { var idx = {}; src.forEach(function (r, i) { idx[r.id] = i; });
      rest.sort(function (a, b) { var ia = idx[a] == null ? 1e9 : idx[a], ib = idx[b] == null ? 1e9 : idx[b];
        return ia - ib || (a < b ? -1 : a > b ? 1 : 0); });
    } else { rest.sort(); }
    if (none) rest.unshift('');   // no value for this dimension -> reads first
    return rest;
  }
  // A milestone carries no divisionId/quarter/owner of its own — only initiativeId. Division comes from its
  // initiative; product/model fall out of effProduct/effModel, which already inherit the initiative's class
  // because a milestone is always class-agnostic. Dimensions a milestone simply doesn't have return '' and the
  // renderers then skip that level entirely.
  function _msDimKey(m, dim, portfolio) {
    if (dim === 'initiative') return m.initiativeId || '';
    if (dim === 'division') { var i = initiativeOf(m, portfolio); return (i && i.divisionId) || ''; }
    if (dim === 'unit') { var iu = initiativeOf(m, portfolio); return (iu && unitIdOfDivision(iu.divisionId, portfolio)) || ''; }
    if (dim === 'product') return effProduct(m, portfolio) || '';
    if (dim === 'model') return effModel(m, portfolio) || '';
    return '';
  }
  function _groupBy(items, dims, portfolio, keyFn) {
    if (!dims || !dims.length) return [{ key: '__all__', dim: null, objs: (items || []).slice() }];
    var dim = dims[0], rest = dims.slice(1), buckets = {}, seen = [];
    // A key function may return an ARRAY to FAN OUT: the item lands in every one of those buckets. Owner does
    // this, so an objective owned by two people appears under both. Consequence, by design: groups overlap, so
    // each group's own score is right but a total ACROSS groups counts a shared objective once per owner.
    (items || []).forEach(function (o) {
      var k = keyFn(o, dim, portfolio);
      var ks = Array.isArray(k) ? (k.length ? k : ['']) : [k];
      ks.forEach(function (key) {
        if (!buckets[key]) { buckets[key] = []; seen.push(key); }
        if (buckets[key].indexOf(o) < 0) buckets[key].push(o);   // a dupe key must not double-list the item
      });
    });
    return _dimOrder(dim, seen, portfolio).map(function (k) {
      var node = { key: k, dim: dim };
      if (rest.length) node.children = _groupBy(buckets[k], rest, portfolio, keyFn);
      else node.objs = buckets[k];
      return node;
    });
  }
  function groupObjectives(objs, dims, portfolio) { return _groupBy(objs, dims, portfolio, _dimKey); }
  function groupMilestones(ms, dims, portfolio) { return _groupBy(ms, dims, portfolio, _msDimKey); }

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
      // Initiative is at the finest grain. The objective must match that model, or narrow into one of its
      // SUB-PRODUCTS — a composition descendant (portfolio.composition: parent model CONTAINS child model,
      // e.g. a System model containing a Stack model). Narrowing is allowed; broadening or diverging is not.
      // This is how the rest of the system already reasons: the in-scope-target resolver expands a classified
      // model to its descendants too ("+ sub-products, transitively"). Product-pinned initiatives deliberately
      // do NOT get this reach — they stay narrow, so initiatives point at specific models.
      if (oo.kind === 'model') {
        if (oo.modelId === io.modelId) return { ok: true };
        return descendantModels(io.modelId, portfolio.composition).indexOf(oo.modelId) !== -1
          ? { ok: true }
          : { ok: false, reason: 'objective model is neither the initiative model nor one of its sub-products' };
      }
      return { ok: false, reason: 'initiative is model-specific; objective must match that model or one of its sub-products' };
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
      var exf = execFor(o.divisionId);
      var sets = (exf.stageGateSets || []).filter(function (st) { return st.objectiveId === o.id; });
      var gs = childCache[o.id].sgs;
      function chainSeq(list) {
        var seq = list.filter(function (s) { return s.plannedDate != null; }).slice().sort(function (a, b) { return a.plannedDate - b.plannedDate; });
        for (var i = 1; i < seq.length; i++) gatePreds[seq[i].id].push({ from: seq[i - 1].id, lag: seq[i].plannedDate - seq[i - 1].plannedDate });
      }
      if (sets.length) {                                   // per-set date-chain: parallel sets chain independently; cross-set links are explicit edges
        sets.forEach(function (st) { if (st.chained === false) return; chainSeq(gs.filter(function (s) { return s.setId === st.id; })); });
      } else {                                             // legacy per-objective chain (pre-sets docs)
        var exChain = (exf.chainGatesByDate || {})[o.id];
        if (!o.chainGatesByDate && !exChain) return;
        chainSeq(gs);
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
      if (g.actualDate != null) { gateEff[gid] = seed; return seed; }   // a finished gate anchors at its actual; a late predecessor can't inflate it, and a recovered gate re-anchors its successors
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

    // Optimistic ("earliest") gate forecast: same chain, but an undone gate floats down to today, so early
    // upstream finishes DO pull successors in. gateEff (committed) floors undone gates at plannedDate (fork B:
    // delays-only), so gateEff - gateEarliest is the acceleration opportunity we surface without moving the plan.
    var gateEarliest = {}, gateEStack = {};
    function computeGateEarliest(gid) {
      if (gateEarliest[gid] != null) return gateEarliest[gid];
      var g = gateById[gid];
      if (!g) return 0;
      if (g.locked) { gateEarliest[gid] = pfGate(g); return gateEarliest[gid]; }   // locked holds its committed date both ways
      if (g.actualDate != null) { gateEarliest[gid] = g.actualDate; return g.actualDate; }
      var plannedFloor = (g.plannedDate != null) ? Math.max(today, g.plannedDate) : today;
      if (gateEStack[gid]) { gateEarliest[gid] = plannedFloor; return plannedFloor; }
      gateEStack[gid] = true;
      var preds = gatePreds[gid], chain = null;
      for (var i = 0; i < preds.length; i++) {
        if (gateEStack[preds[i].from]) continue;
        var c = computeGateEarliest(preds[i].from) + preds[i].lag;
        chain = (chain == null) ? c : Math.max(chain, c);
      }
      // No binding predecessor -> a gate's earliest is its OWN planned date; it is not accelerated by nothing.
      // (Fixes phantom acceleration on the first gate and on any gate merely planned in the future.) With a
      // predecessor it follows by the planned gap, so only an EARLY upstream actual pulls it below its plan.
      var res = (chain == null) ? plannedFloor : Math.max(today, chain);
      gateEStack[gid] = false;
      gateEarliest[gid] = res;
      return res;
    }
    Object.keys(gateById).forEach(function (gid) { computeGateEarliest(gid); });
    var gateAcceleration = {};
    Object.keys(gateById).forEach(function (gid) { gateAcceleration[gid] = Math.max(0, gateEff[gid] - gateEarliest[gid]); });

    // baseline-aware slip per gate: slipped iff committed and now forecast past it.
    var gateSlipped = {};
    Object.keys(gateById).forEach(function (gid) {
      var g = gateById[gid];
      gateSlipped[gid] = (g.baselineDate != null) && (gateEff[gid] > g.baselineDate);
    });

    // Stage 1c: intrinsic projected end per objective (tasks + chained gate ends) — committed + optimistic
    var intrinsic = {}, intrinsicEarliest = {};
    objs.forEach(function (o) {
      var c = childCache[o.id], vals = [], valsE = [];
      c.tasks.forEach(function (t) { var pt = pfTask(t); vals.push(pt); valsE.push(pt); });
      c.sgs.forEach(function (s) { vals.push(gateEff[s.id]); valsE.push(gateEarliest[s.id]); });
      intrinsic[o.id] = vals.length ? Math.max.apply(null, vals) : o.plannedEnd;
      intrinsicEarliest[o.id] = valsE.length ? Math.max.apply(null, valsE) : o.plannedEnd;
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

    // Work-basis schedule slip (execution Schedule card): how late the objective's OWN gates/tasks are vs their
    // PLANNED dates, independent of the objective's plannedEnd buffer. objectiveProjectedEnd is left untouched.
    // forecast = latest gate/task forecast (intrinsic); baseline = latest gate/task PLANNED date. A childless
    // objective falls back to projEnd vs plannedEnd so a predecessor push still surfaces.
    var objectiveWorkForecast = {}, objectiveScheduleSlip = {};
    objs.forEach(function (o) {
      var c = childCache[o.id], hasWork = (c.sgs.length + c.tasks.length) > 0, fEnd, pEnd, pd = [];
      if (hasWork) {
        c.tasks.forEach(function (t) { if (t.plannedEnd != null) pd.push(t.plannedEnd); });
        c.sgs.forEach(function (s) { if (s.plannedDate != null) pd.push(s.plannedDate); });
        fEnd = intrinsic[o.id];
        pEnd = pd.length ? Math.max.apply(null, pd) : o.plannedEnd;
      } else {
        fEnd = projEnd[o.id];
        pEnd = o.plannedEnd;
      }
      var endSt = objectiveEndState(execFor(o.divisionId).objectiveState, o.id);
      if (endSt) {                                                    // ended objective: freeze the schedule, no ongoing slip
        objectiveWorkForecast[o.id] = (endSt.endedDay != null) ? endSt.endedDay : fEnd;
        objectiveScheduleSlip[o.id] = null;
      } else {
        objectiveWorkForecast[o.id] = fEnd;
        objectiveScheduleSlip[o.id] = (pEnd != null && fEnd != null) ? Math.max(0, fEnd - pEnd) : null;
      }
    });

    // objective earliest end: same OBJ->OBJ topology on the optimistic intrinsic, for the acceleration flag
    var projEndEarliest = {}, objEStack = {};
    function computeProjEndEarliest(id) {
      if (projEndEarliest[id] != null) return projEndEarliest[id];
      var o = objById[id];
      if (!o) return 0;
      if (objEStack[id]) return intrinsicEarliest[id];
      objEStack[id] = true;
      var cs = o.plannedStart, preds = objPreds[id];
      for (var i = 0; i < preds.length; i++) {
        if (objEStack[preds[i].from]) continue;
        cs = Math.max(cs, computeProjEndEarliest(preds[i].from) + preds[i].lag);
      }
      // Mirror the committed projEnd floor EXACTLY (line above uses cs + dur): an objective occupies its full
      // planned duration regardless of how early its gates could finish, so acceleration reflects ONLY genuine
      // early upstream work (a gate/task or predecessor ahead of plan), never the objective's own span slack.
      var res = Math.max(intrinsicEarliest[id], cs + (o.plannedEnd - o.plannedStart));
      objEStack[id] = false;
      projEndEarliest[id] = res;
      return res;
    }
    objs.forEach(function (o) { computeProjEndEarliest(o.id); });
    var objectiveAcceleration = {};
    objs.forEach(function (o) { objectiveAcceleration[o.id] = Math.max(0, projEnd[o.id] - projEndEarliest[o.id]); });

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
      objectiveEarliestEnd: projEndEarliest,
      objectiveAcceleration: objectiveAcceleration,
      objectiveWorkForecast: objectiveWorkForecast,
      objectiveScheduleSlip: objectiveScheduleSlip,
      milestoneEffective: effective,
      initiativeProjectedEnd: initProjEnd,
      longTermSlip: slip,
      gateEffective: gateEff,
      gateForecastEarliest: gateEarliest,
      gateAcceleration: gateAcceleration,
      gateSlipped: gateSlipped,
      cycles: cycles
    };
  }

  // ---- cross-doc linkage scope (execution → product/model KPIs) -----------
  // The product/model KPI targets a division's execution can report against: the products/models its objectives
  // are classified to (own or inherited from their initiative), the models under any classified product, and
  // every sub-product reachable by composition (transitive). Pure over the portfolio + the composition edges.
  // Returns { products:[ids], models:[ids] } (deduped; order not significant).
  function classifiedTargets(portfolio, composition, divisionId) {
    var models = (portfolio && portfolio.models) || [];
    var objs = ((portfolio && portfolio.objectives) || []).filter(function (o) { return o.divisionId === divisionId; });
    var prod = {}, mod = {};
    objs.forEach(function (o) {
      var c = effClass(o, portfolio);
      if (c.kind === 'model') mod[c.modelId] = 1;
      else if (c.kind === 'product') prod[c.productId] = 1;
    });
    for (var i = 0; i < models.length; i++) if (prod[models[i].productId]) mod[models[i].id] = 1;   // a classified product → its models are seeds
    Object.keys(mod).forEach(function (mid) {                                                        // + sub-products, transitively
      var d = descendantModels(mid, composition); for (var j = 0; j < d.length; j++) mod[d[j]] = 1;
    });
    for (var k = 0; k < models.length; k++) if (mod[models[k].id] && models[k].productId) prod[models[k].productId] = 1;   // product-level targets of every in-scope model
    return { products: Object.keys(prod), models: Object.keys(mod) };
  }
  // The linkable DEFINER kpis for a set of in-scope targets, over a pool of spec-doc kpis: each in-scope model's
  // headline specs (keyResult-hosted definers) + each in-scope product's product-level definer kpis.
  function targetKpisInScope(targets, kpis) {
    var pset = {}, out = [], seen = {};
    (targets.products || []).forEach(function (p) { pset[p] = 1; });
    kpis = kpis || [];
    (targets.models || []).forEach(function (m) {
      var mk = importableModelKpis(m, kpis);
      for (var i = 0; i < mk.length; i++) if (!seen[mk[i].id]) { seen[mk[i].id] = 1; out.push(mk[i]); }
    });
    for (var j = 0; j < kpis.length; j++) {
      var k = kpis[j];
      if (k.hostType === 'product' && pset[k.hostId] && linkOf(k, kpis).parent == null && !seen[k.id]) { seen[k.id] = 1; out.push(k); }
    }
    return out;
  }

  // ---- FMEA / risk register (pure) -----------------------------------------
  // A problem is a modes → effects → causes tree; RPN = severity × occurrence ×
  // detection (each 1–10). "Unresolved" RPN skips resolved nodes and is zeroed
  // once the problem is resolved or its linked stage-gate has passed. Scoped to
  // an objective via objectiveId; optional gateId links to a stage-gate.
  var FMEA_SCALES = {
    severity:   ['None','Very minor','Minor','Low','Moderate','Significant','High','Very high','Hazardous','Critical'],
    occurrence: ['Unlikely','Remote','Very low','Low','Moderate','Medium-high','High','Very high','Very high+','Almost certain'],
    detection:  ['Almost certain','Very high','High','Moderately high','Moderate','Low','Very low','Remote','Very remote','Undetectable']
  };
  function calcRpn(s, o, d) { return (parseInt(s, 10) || 1) * (parseInt(o, 10) || 1) * (parseInt(d, 10) || 1); }
  function rpnBand(r) { return r >= 200 ? 'high' : r >= 100 ? 'med' : 'low'; }
  function fmeaScaleLabel(kind, v) { var a = FMEA_SCALES[kind]; if (!a) return ''; return a[(parseInt(v, 10) || 1) - 1] || ''; }
  function worstRpn(prob) {
    var max = 0, modes = (prob && prob.modes) || [];
    for (var i = 0; i < modes.length; i++) { var effs = modes[i].effects || [];
      for (var j = 0; j < effs.length; j++) { var cs = effs[j].causes || [];
        for (var k = 0; k < cs.length; k++) { var r = calcRpn(cs[k].severity, cs[k].occurrence, cs[k].detection); if (r > max) max = r; } } }
    return max;
  }
  function worstUnresolvedRpn(prob, gatePassed) {
    if (gatePassed) return 0;
    if (!prob || prob.status === 'resolved') return 0;
    var max = 0, modes = prob.modes || [];
    for (var i = 0; i < modes.length; i++) { if (modes[i].status === 'resolved') continue; var effs = modes[i].effects || [];
      for (var j = 0; j < effs.length; j++) { if (effs[j].status === 'resolved') continue; var cs = effs[j].causes || [];
        for (var k = 0; k < cs.length; k++) { if (cs[k].status === 'resolved') continue;
          var r = calcRpn(cs[k].severity, cs[k].occurrence, cs[k].detection); if (r > max) max = r; } } }
    return max;
  }
  function fmeaProblemsFor(exec, objectiveId) {
    var out = [], risks = (exec && exec.risks) || [];
    for (var i = 0; i < risks.length; i++) if (risks[i].objectiveId === objectiveId) out.push(risks[i]);
    return out;
  }
  // rollup over a set of problems. gatePassed is a fn(gateId)->bool (defaults to none passed).
  function fmeaRollup(problems, gatePassed) {
    var gp = gatePassed || function () { return false; };
    var out = { total: problems.length, openHigh: 0, openMed: 0, openLow: 0, clear: 0, worst: 0 };
    for (var i = 0; i < problems.length; i++) {
      var u = worstUnresolvedRpn(problems[i], gp(problems[i].gateId));
      if (u > out.worst) out.worst = u;
      if (u >= 200) out.openHigh++; else if (u >= 100) out.openMed++; else if (u > 0) out.openLow++; else out.clear++;
    }
    return out;
  }
  var _fmeaSeq = 0;
  function fmeaId(prefix) { _fmeaSeq++; return (prefix || 'x') + '_' + Date.now().toString(36) + '_' + _fmeaSeq.toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function blankCause() { return { cid: fmeaId('c'), cause: '', severity: 1, occurrence: 1, detection: 1, mitigation: '', status: 'open' }; }
  function blankEffect() { return { eid: fmeaId('e'), effect: '', status: 'open', causes: [blankCause()] }; }
  function blankMode() { return { mid: fmeaId('m'), mode: '', status: 'open', effects: [blankEffect()] }; }
  function blankProblem(objectiveId) { return { rid: fmeaId('r'), problem: '', objectiveId: objectiveId || null, gateId: null, status: 'open', knowns: [], modes: [blankMode()] }; }
  // shape-normalize a stored/imported problem (schema-safe; fills missing arrays/fields, preserves ids)
  function migrateProblem(r) {
    r = r || {};
    return {
      rid: r.rid || r.id || fmeaId('r'),
      problem: r.problem || '',
      objectiveId: (r.objectiveId != null) ? r.objectiveId : null,
      gateId: r.gateId || null,
      status: r.status || 'open',
      knowns: (r.knowns || []).map(function (k) { return (typeof k === 'string') ? { kid: fmeaId('k'), text: k } : { kid: (k && k.kid) || fmeaId('k'), text: (k && k.text) || '' }; }),
      modes: (r.modes || []).map(function (m) { m = m || {};
        return { mid: m.mid || fmeaId('m'), mode: m.mode || '', status: m.status || 'open',
          effects: (m.effects || []).map(function (e) { e = e || {};
            return { eid: e.eid || fmeaId('e'), effect: e.effect || '', status: e.status || 'open',
              causes: (e.causes || []).map(function (c) { c = c || {};
                return { cid: c.cid || fmeaId('c'), cause: c.cause || '',
                  severity: c.severity || 1, occurrence: c.occurrence || 1, detection: c.detection || 1,
                  mitigation: c.mitigation || '', status: c.status || 'open' };
              }) };
          }) };
      })
    };
  }

  // ---- exports --------------------------------------------------------------
  function objectiveEndState(objectiveState, objId){
    var arr = objectiveState || [];
    for (var i=0;i<arr.length;i++){ var r=arr[i]; if(r && r.objectiveId===objId && (r.status==='achieved'||r.status==='abandoned')) return r; }
    return null;
  }
  function activeCatchupPlan(catchupPlans, objId){
    var plans=(catchupPlans||[]).filter(function(p){return p&&p.objectiveId===objId;});
    if(!plans.length) return null;
    return plans.reduce(function(a,b){ return (b.enactedDay||0)>=(a.enactedDay||0)?b:a; });
  }
  function catchupEntry(catchupPlans, objId, gateId){
    var p=activeCatchupPlan(catchupPlans, objId); if(!p) return null;
    var gs=p.gates||[]; for(var i=0;i<gs.length;i++) if(gs[i].gateId===gateId) return gs[i];
    return null;
  }
  // ---- Move an objective's entire execution payload between two exec docs -------------------
  // Used by the sales app's "recover stranded data" (an objective moved divisions, but its execution
  // artifacts stayed in the OLD division's bin). Pure: returns fresh {fromDoc, toDoc}. Moves every
  // objective-scoped artifact — direct (by objectiveId), indirect (kpiUpdates by kpiId, gate edges by
  // endpoint), and map-keyed (gateMode/etbTrees by objId, chainGatesByDate by moved gate). Additive and
  // de-duplicating: an id already present in toDoc is not added twice. Later reused by Option A.
  function moveObjectivePayload(fromDoc, toDoc, objId) {
    var from = JSON.parse(JSON.stringify(fromDoc || {}));
    var to = JSON.parse(JSON.stringify(toDoc || {}));
    // ensure the collections exist on both
    var ARR = ['keyResults','kpis','stageGates','tasks','boards','risks','catchupPlans','objectiveState','stageGateSets','kpiUpdates','stageGateEdges'];
    for (var i = 0; i < ARR.length; i++) { if (!Array.isArray(from[ARR[i]])) from[ARR[i]] = []; if (!Array.isArray(to[ARR[i]])) to[ARR[i]] = []; }
    if (!from.gateMode) from.gateMode = {}; if (!to.gateMode) to.gateMode = {};
    if (!from.etbTrees) from.etbTrees = {}; if (!to.etbTrees) to.etbTrees = {};
    if (!from.chainGatesByDate) from.chainGatesByDate = {}; if (!to.chainGatesByDate) to.chainGatesByDate = {};

    var moved = { keyResults:0, kpis:0, stageGates:0, tasks:0, boards:0, risks:0, catchupPlans:0, objectiveState:0, stageGateSets:0, kpiUpdates:0, stageGateEdges:0, gateMode:0, etbTree:0, chainGates:0 };

    // partition an array on `pred`: kept stay in `from`, matched move to `to` (de-duped by id)
    function move(name, pred) {
      var keep = [], has = {};
      to[name].forEach(function (x) { if (x && x.id != null) has[x.id] = 1; });
      from[name].forEach(function (x) {
        if (pred(x)) { if (!(x && x.id != null && has[x.id])) { to[name].push(x); moved[name]++; } }
        else keep.push(x);
      });
      from[name] = keep;
    }

    // 1) direct by objectiveId
    move('keyResults',    function (x) { return x.objectiveId === objId; });
    move('kpis',          function (x) { return x.objectiveId === objId; });
    move('stageGates',    function (x) { return x.objectiveId === objId; });
    move('tasks',         function (x) { return x.objectiveId === objId; });
    move('boards',        function (x) { return x.objectiveId === objId; });
    move('risks',         function (x) { return x.objectiveId === objId; });
    move('catchupPlans',  function (x) { return x.objectiveId === objId; });
    move('objectiveState',function (x) { return x.objectiveId === objId; });
    move('stageGateSets', function (x) { return x.objectiveId === objId; });

    // 2) indirect: KPI updates whose kpiId is one of the moved KPIs; gate edges touching a moved gate
    var movedKpiIds = {}; to.kpis.forEach(function (k) { if (k.objectiveId === objId && k.id != null) movedKpiIds[k.id] = 1; });
    move('kpiUpdates', function (u) { return u && movedKpiIds[u.kpiId]; });
    var movedGateIds = {}; to.stageGates.forEach(function (g) { if (g.objectiveId === objId && g.id != null) movedGateIds[g.id] = 1; });
    move('stageGateEdges', function (e) { return e && (movedGateIds[e.fromGate] || movedGateIds[e.toGate]); });

    // 3) map-keyed: per-objective gateMode + ETB tree
    if (Object.prototype.hasOwnProperty.call(from.gateMode, objId)) { if (!Object.prototype.hasOwnProperty.call(to.gateMode, objId)) { to.gateMode[objId] = from.gateMode[objId]; moved.gateMode = 1; } delete from.gateMode[objId]; }
    if (Object.prototype.hasOwnProperty.call(from.etbTrees, objId)) { if (!Object.prototype.hasOwnProperty.call(to.etbTrees, objId)) { to.etbTrees[objId] = from.etbTrees[objId]; moved.etbTree = 1; } delete from.etbTrees[objId]; }
    // chainGatesByDate: entries keyed by a moved gate id
    Object.keys(from.chainGatesByDate).forEach(function (gid) {
      if (movedGateIds[gid]) { if (!Object.prototype.hasOwnProperty.call(to.chainGatesByDate, gid)) { to.chainGatesByDate[gid] = from.chainGatesByDate[gid]; moved.chainGates++; } delete from.chainGatesByDate[gid]; }
    });

    return { fromDoc: from, toDoc: to, moved: moved };
  }

  // Count what an objective has in a doc (for the recovery preview). Mirrors moveObjectivePayload's reach.
  function objectivePayloadCounts(doc, objId) {
    doc = doc || {};
    var g = (doc.stageGates || []).filter(function (x) { return x.objectiveId === objId; });
    return {
      keyResults: (doc.keyResults || []).filter(function (x) { return x.objectiveId === objId; }).length,
      kpis: (doc.kpis || []).filter(function (x) { return x.objectiveId === objId; }).length,
      stageGates: g.length,
      tasks: (doc.tasks || []).filter(function (x) { return x.objectiveId === objId; }).length,
      boards: (doc.boards || []).filter(function (x) { return x.objectiveId === objId; }).length,
      risks: (doc.risks || []).filter(function (x) { return x.objectiveId === objId; }).length
    };
  }

  // ---- Analysis-portal index: sample grouping, search, import ------------------------------
  // The portal (record.py / jsonbin.py) publishes an index bin { schema:2, runs:[ entry ] } where
  // each entry is ONE JOB: { job_id, sample_name, script, timestamp, bin_id, Data:[unit] } and each
  // unit is { Analysis, step, Conditions, key_values }. Values are already promoted through the
  // portal's KEY_VALUES allowlist, so a metric is addressed by (Analysis bucket, canonical key) and
  // is immune to filename/annotation churn.
  //
  // v1 is a ONE-SHOT IMPORT, not a binding: the user picks a sample, ticks values, they become
  // ordinary kpiUpdates carrying provenance. Nothing here re-reads later.

  var ANALYSIS_SCHEMA = 2;

  // Units implied per canonical key (mirrors the portal's KEY_VALUE_UNITS).
  var ANALYSIS_KEY_UNITS = {
    'OCV': 'V',
    'V @ 1 A/cm\u00b2': 'V',
    'HFR': '\u03a9\u00b7cm\u00b2',
    '|j_xover|': 'mA/cm\u00b2',
    'Average ECSA': 'm\u00b2/g'
  };
  function analysisKeyUnit(key) { return ANALYSIS_KEY_UNITS[key] || ''; }

  // Guard the index shape so a malformed/rotated bin degrades to a visible state, never a throw.
  function validateAnalysisIndex(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, schema: null, runs: [], reason: 'not an object' };
    var schema = raw.schema == null ? null : raw.schema;
    if (!Array.isArray(raw.runs)) return { ok: false, schema: schema, runs: [], reason: 'runs is not an array' };
    if (schema !== ANALYSIS_SCHEMA) return { ok: false, schema: schema, runs: raw.runs, reason: 'unsupported schema ' + String(schema) };
    return { ok: true, schema: schema, runs: raw.runs, reason: null };
  }

  function _finiteNum(v) {
    if (typeof v === 'boolean' || v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  // Group index runs into SAMPLES. A sample spans several runs — a polcurve job and an H2-crossover
  // job on the same MEA are separate entries sharing sample_name — so the units are unioned and each
  // keeps its own run identity. Units with no numeric promoted values are dropped (aggregate plots).
  function analysisIndexSamples(index) {
    var v = validateAnalysisIndex(index);
    var runs = v.ok ? v.runs : [];
    var by = {}, order = [];
    runs.forEach(function (run) {
      if (!run || typeof run !== 'object') return;
      var name = run.sample_name || '';
      if (!name) return;
      var s = by[name];
      if (!s) { s = by[name] = { sample: name, last: '', units: [] }; order.push(name); }
      var ts = run.timestamp || '';
      if (ts > s.last) s.last = ts;
      var data = Array.isArray(run.Data) ? run.Data : [];
      data.forEach(function (u, i) {
        if (!u || typeof u !== 'object') return;
        var kv = u.key_values || {};
        var vals = {};
        Object.keys(kv).forEach(function (k) {
          var n = _finiteNum(kv[k]);
          if (n !== null) vals[k] = n;
        });
        if (!Object.keys(vals).length) return;   // nothing selectable here
        s.units.push({
          uid: String(run.job_id || '') + ':' + i,
          Analysis: u.Analysis || '',
          step: u.step || '',
          Conditions: u.Conditions || {},
          key_values: vals,
          job_id: run.job_id || '',
          bin_id: run.bin_id || '',
          script: run.script || '',
          timestamp: ts
        });
      });
    });
    var out = order.map(function (n) { return by[n]; }).filter(function (s) { return s.units.length; });
    out.sort(function (a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : (a.sample < b.sample ? -1 : 1); });
    return out;
  }

  // The default modal view: the N most recent DISTINCT samples (not the N most recent runs).
  function analysisRecentSamples(index, n) {
    var lim = (n == null) ? 5 : n;
    return analysisIndexSamples(index).slice(0, lim);
  }

  // Filters: { analysis, name, nameMode:'contains'|'exact'|'starts', T_C, RH_pct, P_value, P_unit, step }
  // Conditions live per unit, so a condition filter selects UNITS; a sample matches when any of its
  // units match, and only the matching units are returned. Pressure carries a unit (kPa/barg/psi/bar):
  // the number must match, and the unit too when the caller supplies one.
  function analysisFiltersActive(f) {
    f = f || {};
    return !!(f.analysis || (f.name && String(f.name).trim()) ||
      _finiteNum(f.T_C) !== null || _finiteNum(f.RH_pct) !== null ||
      _finiteNum(f.P_value) !== null || (f.step && String(f.step).trim()));
  }

  function _unitMatches(u, f) {
    if (f.analysis && u.Analysis !== f.analysis) return false;
    var c = u.Conditions || {};
    var t = _finiteNum(f.T_C); if (t !== null && _finiteNum(c.T_C) !== t) return false;
    var rh = _finiteNum(f.RH_pct); if (rh !== null && _finiteNum(c.RH_pct) !== rh) return false;
    var p = _finiteNum(f.P_value);
    if (p !== null) {
      if (_finiteNum(c.P_value) !== p) return false;
      if (f.P_unit && String(c.P_unit || '').toLowerCase() !== String(f.P_unit).toLowerCase()) return false;
    }
    if (f.step && String(f.step).trim()) {
      if (String(c.step || '').toLowerCase() !== String(f.step).trim().toLowerCase()) return false;
    }
    return true;
  }

  function _nameMatches(sample, f) {
    var q = (f.name == null ? '' : String(f.name)).trim();
    if (!q) return true;
    var a = String(sample).toLowerCase(), b = q.toLowerCase();
    var mode = f.nameMode || 'contains';
    if (mode === 'exact') return a === b;
    if (mode === 'starts') return a.indexOf(b) === 0;
    return a.indexOf(b) >= 0;
  }

  function analysisSearch(index, filters) {
    var f = filters || {};
    var all = analysisIndexSamples(index);
    if (!analysisFiltersActive(f)) return all;
    var out = [];
    all.forEach(function (s) {
      if (!_nameMatches(s.sample, f)) return;
      var units = s.units.filter(function (u) { return _unitMatches(u, f); });
      if (units.length) out.push({ sample: s.sample, last: s.last, units: units });
    });
    return out;
  }

  // Flatten a sample's units into pickable values, for the selection list.
  function analysisSampleValues(sample) {
    var out = [];
    ((sample && sample.units) || []).forEach(function (u) {
      Object.keys(u.key_values).forEach(function (k) {
        out.push({
          selId: u.uid + '|' + k,
          sample: sample.sample, key: k, value: u.key_values[k], unit: analysisKeyUnit(k),
          analysis: u.Analysis, step: u.step, cond: u.Conditions,
          job_id: u.job_id, bin_id: u.bin_id, script: u.script, timestamp: u.timestamp
        });
      });
    });
    return out;
  }

  // Identity of an imported reading, for duplicate detection across repeat imports.
  function analysisSrcKey(src) {
    if (!src) return '';
    var c = src.cond || {};
    var ck = Object.keys(c).sort().map(function (k) { return k + '=' + c[k]; }).join(',');
    return [src.job_id || '', src.bucket || '', src.key || '', src.step || '', ck].join('|');
  }

  // Materialise picks as ordinary kpiUpdates. Each pick must carry a RESOLVED kpiId — creating a new
  // KPI needs id allocation, which is the app layer's job; picks without one are reported, not dropped
  // silently. The reading's `timestamp` is the RUN's time, not the import time, so an imported value
  // slots into KPI history where the measurement actually happened; `src.imported_t` records the pull.
  function buildImportUpdates(picks, existingUpdates, importedIso) {
    var now = importedIso || new Date().toISOString();
    var seen = {};
    (existingUpdates || []).forEach(function (u) {
      if (u && u.src) seen[(u.kpiId || '') + '#' + analysisSrcKey(u.src)] = true;
    });
    var updates = [], duplicates = [], unresolved = [];
    (picks || []).forEach(function (p) {
      if (!p) return;
      if (!p.kpiId) { unresolved.push(p); return; }
      var val = _finiteNum(p.value);
      if (val === null) { unresolved.push(p); return; }
      var src = {
        portal: 'analysis', job_id: p.job_id || '', bin_id: p.bin_id || '',
        sample: p.sample || '', bucket: p.analysis || '', key: p.key || '',
        step: p.step || '', cond: p.cond || {},
        run_t: p.timestamp || '', imported_t: now
      };
      var dupKey = p.kpiId + '#' + analysisSrcKey(src);
      if (seen[dupKey]) { duplicates.push({ kpiId: p.kpiId, key: p.key, sample: p.sample, job_id: p.job_id }); return; }
      seen[dupKey] = true;
      var runMs = Date.parse(p.timestamp || '');
      if (!isFinite(runMs)) runMs = Date.parse(now);
      updates.push({
        id: 'UPD-' + p.kpiId + '-' + runMs + '-' + String(p.key || '').replace(/[^A-Za-z0-9]+/g, '').slice(0, 8),
        kpiId: p.kpiId,
        value: val,
        timestamp: runMs,
        note: 'analysis: ' + (p.analysis || '?') + '/' + (p.key || '?'),
        src: src
      });
    });
    return { updates: updates, duplicates: duplicates, unresolved: unresolved };
  }

  // ---- Statistical key reads (ETB) ---------------------------------------------------------
  // A key read may be a STATISTIC over several measurements rather than one number.
  //
  // Single source of truth: when a key read is linked to a KPI (source_kpi_gid) and that KPI is
  // statistical, the statistic and expected sample size come from the KPI. A key read never
  // overrides a linked KPI — otherwise "median of 5" on one side and "average of 3" on the other
  // would silently disagree. A key read with no link may carry its own config.
  //
  // The recorder writes the RAW reads (N kpiUpdate rows), never a pre-computed statistic: the KPI
  // layer reduces readings itself, so writing a mean would double-reduce. Everything below derives;
  // nothing derived is stored.

  // Read a recorded key_read_value in EITHER shape. The ETB tree historically stored one number per
  // key read; a statistical entry stores the array of raw reads. Existing scalars keep working and are
  // read as n = 1, so no migration pass is needed and old trees stay valid.
  function keyReadValueList(v) {
    if (v == null) return [];
    if (Array.isArray(v)) { var a=[]; for (var i=0;i<v.length;i++){ var n=Number(v[i]); if(isFinite(n)) a.push(n); } return a; }
    var s = Number(v);
    return isFinite(s) ? [s] : [];
  }

  function parseReads(input) {
    if (Array.isArray(input)) {
      var a = [];
      for (var i = 0; i < input.length; i++) { var n = Number(input[i]); if (isFinite(n)) a.push(n); }
      return a;
    }
    if (input == null) return [];
    var s = String(input).trim();
    if (!s) return [];
    var parts = s.split(/[\s,;]+/), out = [];
    for (var j = 0; j < parts.length; j++) {
      if (parts[j] === '') continue;
      var v = Number(parts[j]);
      if (isFinite(v)) out.push(v);
    }
    return out;
  }

  // {n, value, sd, min, max, values}. value is the chosen statistic; sd travels alongside it so the
  // spread is visible without a second call. n===0 -> value null (never 0, which reads as a result).
  function statSummary(input, statistic) {
    var xs = parseReads(input);
    var stat = statistic || 'average';
    if (!xs.length) return { n: 0, value: null, sd: null, min: null, max: null, values: [] };
    return {
      n: xs.length,
      value: computeStat(stat, xs),
      sd: xs.length > 1 ? computeStat('stddev', xs) : 0,
      min: computeStat('min', xs),
      max: computeStat('max', xs),
      values: xs
    };
  }

  // Resolve which statistic a key read uses, and where that came from.
  // source: 'kpi' (linked statistical KPI) | 'local' (unlinked key read's own config) | 'none' (single-valued)
  function keyReadStat(keyRead, kpi) {
    var kr = keyRead || {};
    if (kpi && kpi.targetType === 'statistical') {
      return {
        statistical: true,
        statistic: kpi.statistic || 'average',
        readCount: (kpi.readCount === '' || kpi.readCount == null) ? null : Number(kpi.readCount),
        source: 'kpi',
        overriddenLocal: !!kr.statistic          // surfaced, not silently dropped
      };
    }
    if (kr.statistic) {
      return {
        statistical: true,
        statistic: kr.statistic,
        readCount: (kr.readCount === '' || kr.readCount == null) ? null : Number(kr.readCount),
        source: 'local',
        overriddenLocal: false
      };
    }
    return { statistical: false, statistic: null, readCount: null, source: 'none', overriddenLocal: false };
  }

  // Completeness of ONE entry against the expected sample size. Deliberately separate from the KPI's
  // pooled reading count: a 5-read experiment run twice is entry-complete (5 of 5) while the KPI sits
  // at n=10. Conflating the two makes pooling look like a bug.
  function readsComplete(n, readCount) {
    var have = Number(n) || 0;
    if (readCount == null || !isFinite(Number(readCount)) || Number(readCount) <= 0) {
      return { complete: have > 0, have: have, expected: null, short: 0, over: 0 };
    }
    var want = Number(readCount);
    return {
      complete: have >= want,
      have: have, expected: want,
      short: have < want ? (want - have) : 0,
      over: have > want ? (have - want) : 0
    };
  }

  // The number a criterion should be tested against, given an acceptance mode.
  // 'statistic' (default) tests the summary value; 'all'/'any' are per-read claims and return the
  // worst/best read for the comparison direction, so the caller's existing scalar comparison still works.
  function keyReadTestValue(summary, mode, direction) {
    if (!summary || !summary.n) return null;
    var m = mode || 'statistic';
    if (m === 'statistic') return summary.value;
    var down = (direction === 'down' || direction === 'decrease');
    if (m === 'all') return down ? summary.max : summary.min;   // the hardest read must still pass
    if (m === 'any') return down ? summary.min : summary.max;   // the easiest read may pass
    return summary.value;
  }

  // Materialise one entry as RAW readings for a KPI — N rows, not a reduced value.
  function buildStatReadings(kpiId, values, meta) {
    var xs = parseReads(values);
    var m = meta || {};
    var ts = m.timestamp != null ? m.timestamp : Date.now();
    var out = [];
    for (var i = 0; i < xs.length; i++) {
      var row = { id: 'UPD-' + kpiId + '-' + ts + '-' + i, kpiId: kpiId, value: xs[i], timestamp: ts, note: m.note || '' };
      if (m.src) row.src = m.src;
      out.push(row);
    }
    return out;
  }

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
    importableModelKpis: importableModelKpis,
    rawScore: rawScore,
    childrenOf: childrenOf,
    effectiveTarget: effectiveTarget,
    effectiveValue: effectiveValue,
    migrateKpiLinks: migrateKpiLinks,
    KPI_LEVEL: KPI_LEVEL,
    computeStat: computeStat,
    hasTarget: hasTarget,
    rollupUnit: rollupUnit,
    unitIdOfDivision: unitIdOfDivision,
    divisionsInUnit: divisionsInUnit,
    divisionKind: divisionKind,
    ownersOf: ownersOf,
    readingSourceId: readingSourceId,
    effValueSource: function(kpi, kpis, execDocs){ return effectiveValueEntry(kpi, kpis, execDocs); },
    sourcesOf: sourcesOf,
    readingCount: readingCount,
    scoreEmbeddedKpi: scoreEmbeddedKpi,
    subKrScore: subKrScore,
    keyResultScore: keyResultScore,
    milestoneEffectiveWeights: milestoneEffectiveWeights,
    milestoneStepContribution: milestoneStepContribution,
    milestoneKrScore: milestoneKrScore,
    tileHealth: tileHealth,
    boardSummary: boardSummary,
    dropTile: dropTile,
    gateDueDates: gateDueDates,
    parseReads: parseReads,
    keyReadValueList: keyReadValueList,
    statSummary: statSummary,
    keyReadStat: keyReadStat,
    readsComplete: readsComplete,
    keyReadTestValue: keyReadTestValue,
    buildStatReadings: buildStatReadings,
    validateAnalysisIndex: validateAnalysisIndex,
    analysisIndexSamples: analysisIndexSamples,
    analysisRecentSamples: analysisRecentSamples,
    analysisSearch: analysisSearch,
    analysisSampleValues: analysisSampleValues,
    analysisFiltersActive: analysisFiltersActive,
    analysisKeyUnit: analysisKeyUnit,
    analysisSrcKey: analysisSrcKey,
    buildImportUpdates: buildImportUpdates,
    moveObjectivePayload: moveObjectivePayload,
    objectivePayloadCounts: objectivePayloadCounts,
    gateTileState: gateTileState,
    boardGateSummary: boardGateSummary,
    milestoneGanttSteps: milestoneGanttSteps,
    keyResultPaceBand: keyResultPaceBand,
    keyResultPace: keyResultPace,
    stageGateScore: stageGateScore,
    gateAtTarget: gateAtTarget,
    setScore: setScore,
    objectiveGateReadiness: objectiveGateReadiness,
    gatesForSet: gatesForSet,
    setsForObjective: setsForObjective,
    hostScore: hostScore,
    milestoneScore: milestoneScore,
    milestoneAchieved: milestoneAchieved,
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
    quarterRange: quarterRange,
    quarterList: quarterList,
    groupObjectives: groupObjectives,
    groupMilestones: groupMilestones,
    validateClassification: validateClassification,
    sliceScore: sliceScore,
    cascade: cascade,
    activeCatchupPlan: activeCatchupPlan, catchupEntry: catchupEntry, objectiveEndState: objectiveEndState,
    classifyGate: classifyGate,
    classifiedTargets: classifiedTargets,
    targetKpisInScope: targetKpisInScope,
    // FMEA / risk register
    calcRpn: calcRpn,
    rpnBand: rpnBand,
    fmeaScaleLabel: fmeaScaleLabel,
    FMEA_SCALES: FMEA_SCALES,
    worstRpn: worstRpn,
    worstUnresolvedRpn: worstUnresolvedRpn,
    fmeaProblemsFor: fmeaProblemsFor,
    fmeaRollup: fmeaRollup,
    fmeaId: fmeaId,
    blankProblem: blankProblem,
    blankMode: blankMode,
    blankEffect: blankEffect,
    blankCause: blankCause,
    migrateProblem: migrateProblem,
    // exposed for tests / shells
    _mean: mean, _clamp: clamp, _progressLinear: progressLinear, _progressRange: progressRange
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RDCore = API;

})(typeof window !== 'undefined' ? window : this);