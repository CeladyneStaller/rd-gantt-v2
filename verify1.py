#!/usr/bin/env python3
import re, subprocess, sys, os

HTML = os.path.join(os.path.dirname(__file__), 'q-tracker-division.html')
src = open(HTML, encoding='utf-8').read()

# 1) longest <script> block — match (attrs, body); skip JSON/snapshot tags by ATTRS only
pairs = re.findall(r'<script([^>]*)>(.*?)</script>', src, re.S)
bodies = [body for (attrs, body) in pairs if 'application/json' not in attrs]
script = max(bodies, key=len)
open('/tmp/_full.js', 'w', encoding='utf-8').write(script)
r = subprocess.run(['node', '--check', '/tmp/_full.js'], capture_output=True, text=True)
if r.returncode != 0:
    print('SYNTAX FAIL (full script):\n', r.stderr); sys.exit(1)
print('node --check: full script OK')

# 2) slice CORE block (DOM-free) and run with tests
m = re.search(r'==CORE_START==.*?\*/(.*?)/\*\s*\n?\s*==CORE_END==', script, re.S)
if not m:
    print('Could not locate CORE markers'); sys.exit(1)
core = m.group(1)

tests = r"""
/* ----------------------------- test harness ---------------------------- */
var PASS=0, FAIL=0, MSGS=[];
function eq(a,b,msg){ var ok = JSON.stringify(a)===JSON.stringify(b);
  if(ok)PASS++; else { FAIL++; MSGS.push('FAIL: '+msg+'  got='+JSON.stringify(a)+' want='+JSON.stringify(b)); } }
function ok(c,msg){ if(c)PASS++; else { FAIL++; MSGS.push('FAIL: '+msg); } }
/* recurse a grouping tree to its leaf items, recording the path of values */
function walkLeaves(nodes, cb, path){
  path = path || [];
  nodes.forEach(function(n){
    var p2 = path.concat([n.value]);
    if(n.leaf) n.items.forEach(function(it){ cb(it, p2.join('/')); });
    else walkLeaves(n.groups, cb, p2);
  });
}

var TODAY = new Date().toISOString().slice(0,10);
function dayOffset(n){ return new Date(Date.now()+n*86400000).toISOString().slice(0,10); }

/* --- KPI scoring chain ------------------------------------------------- */
eq(calculateKpiProgress([]), 0, 'empty kpis -> 0');
eq(calculateKpiProgress([{type:'demonstration',direction:'increase',target:'100',current:50}]), 50, 'increase 50/100=50');
eq(calculateKpiProgress([{type:'demonstration',direction:'increase',target:'100',current:200}]), 100, 'increase caps at 100');
eq(calculateKpiProgress([{type:'demonstration',direction:'decrease',target:'10',current:10}]), 100, 'decrease at target=100');
eq(calculateKpiProgress([{type:'demonstration',direction:'decrease',target:'10',current:20}]), 0, 'decrease 2x target=0');
eq(calculateKpiProgress([{type:'binary',current:1}]), 100, 'binary pass=100');
eq(calculateKpiProgress([{type:'binary',current:0}]), 0, 'binary fail=0');
eq(calculateKpiProgress([{type:'demonstration',direction:'increase',target:'10',current:null}]), 0, 'unmeasured excluded -> 0 (none measured)');
eq(calculateKpiProgress([{type:'demonstration',direction:'increase',target:'100',current:80},
                         {type:'demonstration',direction:'increase',target:'100',current:40}]), 60, 'mean of 80,40=60');
// unmeasured should be excluded from the mean, not counted as 0:
eq(calculateKpiProgress([{type:'demonstration',direction:'increase',target:'100',current:80},
                         {type:'demonstration',direction:'increase',target:'100',current:null}]), 80, 'unmeasured excluded from mean');

/* --- sub-KR weighting -------------------------------------------------- */
eq(calcSubKrProgress([{trackingType:'percentage',progress:100,weight:1},
                      {trackingType:'percentage',progress:0,weight:1}]), 50, 'subkr equal weight 100,0=50');
eq(calcSubKrProgress([{trackingType:'percentage',progress:100,weight:3},
                      {trackingType:'percentage',progress:0,weight:1}]), 75, 'subkr weighted 3:1 =75');
eq(subKrPct({trackingType:'kpi',kpis:[{type:'demonstration',direction:'increase',target:'10',current:5}]}), 50, 'subKrPct kpi=50');

/* --- getKrPct dispatch ------------------------------------------------- */
eq(getKrPct({trackingType:'percentage',progress:42}), 42, 'kr percentage');
eq(getKrPct({trackingType:'kpi',kpis:[{type:'demonstration',direction:'increase',target:'4',current:2}]}), 50, 'kr kpi');
eq(getKrPct({trackingType:'subkr',subKrs:[{trackingType:'percentage',progress:80,weight:1}]}), 80, 'kr subkr');

/* --- objective score (mean of KRs; null when no KRs) ------------------- */
eq(objectiveScore({keyResults:[]}), null, 'no KRs -> null');
eq(objectiveScore({keyResults:[{trackingType:'percentage',progress:100},
                               {trackingType:'percentage',progress:50}]}), 75, 'obj score mean 100,50=75');

/* --- band colours / labels -------------------------------------------- */
eq(bandColor(null), '#bbb', 'null band grey');
eq(bandColor(70), '#639922', '70 green');
eq(bandColor(69), '#BA7517', '69 amber');
eq(bandColor(40), '#BA7517', '40 amber');
eq(bandColor(39), '#E24B4A', '39 red');
eq(bandLabel(75), 'On track', 'label on track');
eq(bandLabel(50), 'At risk', 'label at risk');
eq(bandLabel(10), 'Off track', 'label off track');

/* --- milestone status -------------------------------------------------- */
eq(milestoneDone({manuallyCompleted:true}), true, 'done via flag');
eq(milestoneDone({progress:100}), true, 'done via progress');
eq(milestoneDone({progress:50}), false, 'not done 50');
eq(milestoneStatus({manuallyCompleted:true,end:dayOffset(-5)}, TODAY), 'done', 'done beats overdue');
eq(milestoneStatus({end:dayOffset(-5)}, TODAY), 'overdue', 'past + open = overdue');
eq(milestoneStatus({end:dayOffset(5),progress:10}, TODAY), 'active', 'future + progress = active');
eq(milestoneStatus({end:dayOffset(5)}, TODAY), 'upcoming', 'future + no progress = upcoming');
eq(milestoneDue({end:dayOffset(-1)}, TODAY), true, 'due if end<=today');
eq(milestoneDue({end:dayOffset(3)}, TODAY), false, 'not due if future');

/* --- isMilestoneProject: projectType OR legacy milestone:true flag ------ */
ok(isMilestoneProject({projectType:'milestone'}), 'projectType milestone -> yes');
ok(isMilestoneProject({milestone:true}), 'legacy milestone flag, no projectType -> yes (the bug fix)');
ok(isMilestoneProject({milestone:true, projectType:'task'}), 'milestone flag wins over task type');
ok(!isMilestoneProject({projectType:'task'}), 'plain task -> no');
ok(!isMilestoneProject({projectType:'objective'}), 'objective -> no');
ok(!isMilestoneProject({projectType:'delivery', milestone:true}), 'delivery excluded');
ok(!isMilestoneProject({projectType:'milestone', isStageGate:true}), 'stage-gate excluded');
ok(!isMilestoneProject(null), 'null -> no');

/* --- buildDivisionModel picks up flag-only milestones across divisions -- */
(function(){
  var projects = [
    /* fuel cell: modern milestone (has projectType) */
    { id:'fc_1', projectType:'milestone', division:'fuelcell', name:'FC MS', end:'2026-05-01' },
    /* electrolyzer: legacy milestone (flag only, no projectType) */
    { id:'el_1', milestone:true, division:'electrolyzer', name:'EZ MS', end:'2026-05-01' },
    /* a delivery in electrolyzer should NOT count */
    { id:'el_2', projectType:'delivery', milestone:true, division:'electrolyzer', name:'EZ delivery', end:'2026-05-01' }
  ];
  var overall = buildDivisionModel(projects, null, null);
  eq(overall.milestones.map(function(m){return m.name;}).sort(), ['EZ MS','FC MS'], 'overall shows both divisions\' milestones');
  var ez = buildDivisionModel(projects, 'electrolyzer', null);
  eq(ez.milestones.map(function(m){return m.name;}), ['EZ MS'], 'electrolyzer milestone now appears (flag-only)');
  var fc = buildDivisionModel(projects, 'fuelcell', null);
  eq(fc.milestones.map(function(m){return m.name;}), ['FC MS'], 'fuel cell milestone still appears');
})();

/* --- hub-native milestones carry their own division (numeric ids) ------- */
(function(){
  /* Models the merged cache after the fix: milestones come from the hub with
     their own numeric ids + divisions; divisional milestones were excluded
     upstream, so a division with no divisional objectives still shows its
     hub milestone. */
  var merged = [
    { id:200, milestone:true, division:'electrolyzer', name:'EZ Hub MS', end:'2026-05-01' },
    { id:201, projectType:'milestone', division:'fuelcell', name:'FC Hub MS', end:'2026-05-01' },
    { id:'fc_1', projectType:'objective', division:'fuelcell', parentId:null, name:'FC Obj',
      keyResults:[{trackingType:'percentage',progress:50}] }
  ];
  eq(buildDivisionModel(merged, 'electrolyzer', null).milestones.map(function(m){return m.name;}),
     ['EZ Hub MS'], 'electrolyzer shows its hub milestone even with no divisional objectives');
  eq(buildDivisionModel(merged, 'fuelcell', null).milestones.map(function(m){return m.name;}),
     ['FC Hub MS'], 'fuel cell shows its hub milestone (own division, not stamped)');
  eq(buildDivisionModel(merged, null, null).milestones.map(function(m){return m.name;}).sort(),
     ['EZ Hub MS','FC Hub MS'], 'overall shows hub milestones from every division');
})();

/* --- milestones grouped by division/product/generation (like initiatives) - */
(function(){
  var byVal = function(nodes, v){ return nodes.filter(function(n){ return n.value === v; })[0]; };
  var merged = [
    /* hub initiative carrying a product — a child milestone inherits it */
    { id:300, projectType:'initiative', division:'fuelcell', name:'Init P', productLine:'Spectre', productModel:'Gen 2' },
    /* milestone with its OWN product/generation */
    { id:301, projectType:'milestone', division:'fuelcell', name:'MS own', end:'2026-03-01', productLine:'Phantom', productModel:'Gen 1' },
    /* milestone under the initiative, no own product -> inherits Spectre / Gen 2 */
    { id:302, projectType:'milestone', division:'fuelcell', parentId:300, name:'MS inherited', end:'2026-04-01' },
    /* milestone with neither -> unassigned product bucket, other division */
    { id:303, projectType:'milestone', division:'electrolyzer', name:'MS bare', end:'2026-05-01' }
  ];
  /* Overall: Division -> Product -> Generation */
  var overall = buildDivisionModel(merged, null, null);
  var fcDiv = byVal(overall.msGroups, 'fuelcell');
  ok(fcDiv && !fcDiv.leaf, 'overall msGroups nests under a fuelcell division node');
  eq(fcDiv.groups.map(function(g){return g.value;}).sort(), ['Phantom','Spectre'],
     'fuelcell milestones split by own + inherited product');
  ok(byVal(overall.msGroups, 'electrolyzer'), 'electrolyzer division node present too');
  /* Single division: Product -> Generation (no division level) */
  var fc = buildDivisionModel(merged, 'fuelcell', null);
  eq(fc.msGroups.map(function(g){return g.value;}).sort(), ['Phantom','Spectre'],
     'single-division msGroups keyed by product');
  var spectre = byVal(fc.msGroups, 'Spectre');
  eq(spectre.groups.map(function(g){return g.value;}), ['Gen 2'], 'inherited milestone lands in Gen 2');
  eq(spectre.groups[0].items[0].name, 'MS inherited', 'inherited milestone placed under its owner\'s product');
  /* bare milestone -> empty (unassigned) product bucket, pinned with empty value */
  var ez = buildDivisionModel(merged, 'electrolyzer', null);
  eq(ez.msGroups.length, 1, 'electrolyzer has a single (unassigned) product group');
  eq(ez.msGroups[0].value, '', 'unassigned product bucket carries an empty value');
  eq(ez.msGroups[0].groups[0].items[0].name, 'MS bare', 'bare milestone sits in the unassigned bucket');
})();

/* --- carried-forward overdue milestones (original/delay/updated due) ---- */
(function(){
  var today = '2026-05-15';            // Q2
  var win = quarterWindow(2026, 2);     // Apr 1 – Jun 30
  var merged = [
    { id:1, projectType:'milestone', division:'fuelcell', name:'Q1 overdue', end:'2026-02-10', progress:0 },
    { id:2, projectType:'milestone', division:'fuelcell', name:'Q1 done',    end:'2026-02-20', progress:100 },
    { id:3, projectType:'milestone', division:'fuelcell', name:'Q2 future',  end:'2026-06-01', progress:0 }, // in Q2, not yet due
    { id:4, projectType:'milestone', division:'fuelcell', name:'Q3 future',  end:'2026-08-01', progress:0 }
  ];
  var m = buildDivisionModel(merged, 'fuelcell', win, today);
  eq(m.milestones.map(function(x){return x.name;}).sort(), ['Q1 overdue','Q2 future'],
     'Q2 view = carried Q1-overdue + in-window Q2 (done & future-quarter excluded)');
  var c = m.milestones.filter(function(x){return x.name==='Q1 overdue';})[0];
  eq(c.overdue, true, 'Q1 milestone flagged overdue');
  eq(c.date, '2026-02-10', 'original due date preserved');
  eq(c.delayedDays, 94, 'delayed days = today − original due');
  eq(c.delayedDue, '2026-05-15', 'effective (delayed) due date = today');
  eq(c.status, 'overdue', 'carried milestone still flagged overdue');
  var w = m.milestones.filter(function(x){return x.name==='Q2 future';})[0];
  eq(w.overdue, false, 'not-yet-due in-window milestone is not overdue');
  eq(w.delayedDays, 0, 'not-yet-due milestone has no delay');
  ok(m.msGroups.length >= 1, 'carried milestone still appears in the grouped panel');
})();

/* --- delay flags also show in the all-quarters view (win = null) -------- */
(function(){
  var today = '2026-05-15';
  var merged = [
    { id:1, projectType:'milestone', division:'fuelcell', name:'Overdue', end:'2026-02-10', progress:0 },
    { id:2, projectType:'milestone', division:'fuelcell', name:'Upcoming', end:'2026-09-01', progress:0 },
    { id:3, projectType:'milestone', division:'fuelcell', name:'Done late', end:'2026-01-05', progress:100 }
  ];
  var m = buildDivisionModel(merged, 'fuelcell', null, today);   // all quarters
  var o = m.milestones.filter(function(x){return x.name==='Overdue';})[0];
  eq(o.overdue, true, 'overdue flag set even with no quarter selected');
  eq(o.delayedDays, 94, 'delay computed in all-quarters view');
  eq(o.delayedDue, '2026-05-15', 'effective due = today in all-quarters view');
  eq(m.milestones.filter(function(x){return x.name==='Upcoming';})[0].overdue, false, 'future milestone not overdue');
  eq(m.milestones.filter(function(x){return x.name==='Done late';})[0].overdue, false, 'completed milestone not overdue');
})();

/* --- quarter window / overlap ----------------------------------------- */
eq(quarterWindow(2026,1), {start:'2026-01-01', end:'2026-03-31'}, 'Q1 2026 window');
eq(quarterWindow(2026,2), {start:'2026-04-01', end:'2026-06-30'}, 'Q2 2026 window');
eq(quarterWindow(2026,4), {start:'2026-10-01', end:'2026-12-31'}, 'Q4 2026 window');
eq(quarterWindow(null,null), null, 'no filter window');
ok(overlapsWindow({start:'2026-02-01',end:'2026-02-20'}, quarterWindow(2026,1)), 'inside Q1 overlaps');
ok(!overlapsWindow({start:'2026-05-01',end:'2026-05-20'}, quarterWindow(2026,1)), 'May does not overlap Q1');
ok(overlapsWindow({start:'2026-03-20',end:'2026-04-10'}, quarterWindow(2026,1)), 'straddling Q1/Q2 overlaps Q1');
ok(overlapsWindow({}, quarterWindow(2026,1)), 'no dates -> included');

/* --- initiativeInWindow: quarter filter for initiatives ---------------- */
(function(){
  var q1 = quarterWindow(2026,1);
  ok(initiativeInWindow({id:1}, null, {}), 'no window -> always in');
  ok(initiativeInWindow({id:1}, q1, {1:true}), 'has in-quarter objective -> in (even dateless)');
  ok(!initiativeInWindow({id:1}, q1, {}), 'dateless + no in-quarter objective -> OUT (the bug fix)');
  ok(initiativeInWindow({id:2, start:'2026-02-01', end:'2026-02-20'}, q1, {}), 'own dates overlap -> in');
  ok(!initiativeInWindow({id:3, start:'2026-05-01', end:'2026-05-20'}, q1, {}), 'own dates outside + no objectives -> OUT');
  ok(initiativeInWindow({id:3, start:'2026-05-01', end:'2026-05-20'}, q1, {3:true}), 'own dates outside but has objective -> in (tag stays resolvable)');
})();

/* --- daysBetween -------------------------------------------------------- */
eq(daysBetween('2026-02-10','2026-05-15'), 94, 'daysBetween counts calendar days');
eq(daysBetween('2026-05-15','2026-05-15'), 0, 'same day -> 0');
eq(daysBetween('', '2026-05-15'), 0, 'missing start -> 0');
eq(daysBetween('2026-05-15', ''), 0, 'missing end -> 0');

/* --- milestoneInWindow: overlap OR carried-forward overdue ------------- */
(function(){
  var q2 = quarterWindow(2026,2);   // Apr 1 – Jun 30
  var today = '2026-05-15';
  ok(milestoneInWindow({end:'2026-05-01'}, q2, today), 'in-window milestone -> in');
  ok(!milestoneInWindow({end:'2026-08-01'}, q2, today), 'future-quarter milestone -> out');
  ok(milestoneInWindow({end:'2026-02-10', progress:0}, q2, today), 'overdue Q1 milestone carries into Q2');
  ok(!milestoneInWindow({end:'2026-02-10', progress:100}, q2, today), 'completed Q1 milestone does not carry');
  ok(!milestoneInWindow({end:'2026-02-10', manuallyCompleted:true}, q2, today), 'manually-completed Q1 does not carry');
  ok(milestoneInWindow({end:'2026-01-01'}, null, today), 'no window -> always in');
  /* future-quarter view: a milestone due after today (not yet overdue) must not carry */
  var q3 = quarterWindow(2026,3);   // Jul–Sep
  ok(!milestoneInWindow({end:'2026-06-20', progress:0}, q3, today), 'due after today, before Q3 -> not overdue, not carried');
  ok(milestoneInWindow({end:'2026-02-10', progress:0}, q3, today), 'already-overdue Q1 carries into Q3 too');
})();

/* --- buildDivisionModel quarter-filters initiatives (end to end) -------- */
(function(){
  var base = [
    { id:50, projectType:'initiative', division:'fuelcell', name:'Dateless Q1', productLine:'' },     // dateless, has Q1 obj
    { id:51, projectType:'initiative', division:'fuelcell', name:'Dateless empty', productLine:'' },   // dateless, no obj
    { id:52, projectType:'initiative', division:'fuelcell', name:'Q3 dated', start:'2026-08-01', end:'2026-09-01', productLine:'' },
    { id:'fc_1', projectType:'objective', division:'fuelcell', parentId:null, name:'O-Q1',
      start:'2026-02-01', end:'2026-02-15', keyResults:[{trackingType:'percentage',progress:70}] }
  ];
  var withInit = applyInitiativeAssoc(base, { '50': ['fc_1'] });
  var q1 = buildDivisionModel(withInit, 'fuelcell', quarterWindow(2026,1));
  var names = q1.initiatives.map(function(i){ return i.name; });
  ok(names.indexOf('Dateless Q1') >= 0, 'initiative with a Q1 objective is kept');
  ok(names.indexOf('Dateless empty') < 0, 'dateless empty initiative is filtered out in Q1');
  ok(names.indexOf('Q3 dated') < 0, 'Q3-dated initiative filtered out of Q1');
  eq(q1.initiatives.length, 1, 'only the Q1-relevant initiative remains');
  /* without a window, all initiatives show */
  var all = buildDivisionModel(withInit, 'fuelcell', null);
  eq(all.initiatives.length, 3, 'no quarter filter -> all initiatives shown');
})();

/* --- initiative resolution -------------------------------------------- */
(function(){
  var byId = {1:{id:1,projectType:'initiative'}, 2:{id:2,projectType:'objective',parentId:1},
              3:{id:3,projectType:'product',parentId:1}, 4:{id:4,projectType:'objective',parentId:3},
              5:{id:5,projectType:'objective',parentId:99}};
  eq(resolveInitiativeId(byId[2], byId), 1, 'direct parent initiative');
  eq(resolveInitiativeId(byId[4], byId), 1, 'walks through product to initiative');
  eq(resolveInitiativeId(byId[5], byId), null, 'broken parent -> null');
})();

/* --- buildDivisionModel: end-to-end ----------------------------------- */
(function(){
  var projects = [
    {id:1, projectType:'initiative', division:'fuelcell', name:'Init A'},
    {id:2, projectType:'initiative', division:'fuelcell', name:'Init B'},
    {id:10, projectType:'objective', division:'fuelcell', parentId:1, name:'Obj A1',
      keyResults:[{trackingType:'percentage',progress:80},{trackingType:'percentage',progress:80}]}, // score 80
    {id:11, projectType:'objective', division:'fuelcell', parentId:1, name:'Obj A2',
      keyResults:[{trackingType:'percentage',progress:40}]}, // score 40
    {id:12, projectType:'objective', division:'fuelcell', parentId:2, name:'Obj B1',
      keyResults:[]}, // unscored
    {id:13, projectType:'objective', division:'electrolyzer', parentId:1, name:'Other div',
      keyResults:[{trackingType:'percentage',progress:100}]},
    {id:20, projectType:'milestone', division:'fuelcell', parentId:10, name:'MS done', manuallyCompleted:true, end:dayOffset(-3)},
    {id:21, projectType:'milestone', division:'fuelcell', parentId:11, name:'MS overdue', end:dayOffset(-3)},
    {id:22, projectType:'milestone', division:'fuelcell', parentId:2, name:'MS future', end:dayOffset(10)}
  ];
  var m = buildDivisionModel(projects, 'fuelcell', null);
  eq(m.objCount, 3, 'fuelcell objectives counted (excludes other division)');
  eq(m.scoredObjCount, 2, 'two scored objectives (B1 has no KRs)');
  eq(m.divAttain, 60, 'division attainment mean(80,40)=60');
  eq(m.onTrack, 1, 'one objective >=70 (the 80)');
  eq(m.initiatives.length, 2, 'two initiatives');
  var initA = m.initiatives.filter(function(i){return i.id===1;})[0];
  eq(initA.health, 60, 'Init A health = mean(80,40)=60');
  eq(initA.objCount, 2, 'Init A has 2 objectives');
  var initB = m.initiatives.filter(function(i){return i.id===2;})[0];
  eq(initB.health, null, 'Init B has only an unscored objective -> null health');
  eq(m.milestones.length, 3, 'three milestones in division');
  eq(m.dueMsCount, 2, 'two due (done + overdue, both past)');
  eq(m.doneMsCount, 1, 'one done');
  eq(m.msHitRate, 50, 'milestone hit rate 1/2=50');
  eq(m.overdueOpen, 1, 'one overdue open');
  // OKR ordering: objectives grouped by initiative order, then name
  eq(m.okrRows.map(function(r){return r.id;}), [10,11,12], 'okr rows ordered by initiative then name');
  // unassigned objective handling
  eq(m.unassigned.length, 0, 'no unassigned (all have initiative parents)');
})();

/* --- unassigned + quarter filter -------------------------------------- */
(function(){
  var projects = [
    {id:1, projectType:'objective', division:'fuelcell', parentId:999, name:'Orphan',
      start:'2026-02-01', end:'2026-02-15',
      keyResults:[{trackingType:'percentage',progress:90}]},
    {id:2, projectType:'objective', division:'fuelcell', parentId:999, name:'Q2 obj',
      start:'2026-05-01', end:'2026-05-15',
      keyResults:[{trackingType:'percentage',progress:30}]}
  ];
  var q1 = buildDivisionModel(projects, 'fuelcell', quarterWindow(2026,1));
  eq(q1.objCount, 1, 'Q1 filter keeps only the Feb objective');
  eq(q1.unassigned.length, 1, 'orphan objective is unassigned');
  eq(q1.divAttain, 90, 'Q1 attainment = 90 only');
  var all = buildDivisionModel(projects, 'fuelcell', null);
  eq(all.objCount, 2, 'no filter keeps both');
  eq(all.divAttain, 60, 'all attainment mean(90,30)=60');
})();

/* --- signal rollup ----------------------------------------------------- */
eq(computeSignal({divAttain:null,scoredObjCount:0,msHitRate:null,overdueOpen:0,scoredInitCount:0,redInits:0}).color, null, 'no data -> grey signal');
eq(computeSignal({divAttain:85,scoredObjCount:3,msHitRate:90,overdueOpen:0,scoredInitCount:2,redInits:0}).color, '#639922', 'healthy -> green');
eq(computeSignal({divAttain:30,scoredObjCount:3,msHitRate:90,overdueOpen:0,scoredInitCount:2,redInits:0}).color, '#E24B4A', 'low attainment -> red');
eq(computeSignal({divAttain:65,scoredObjCount:3,msHitRate:80,overdueOpen:1,scoredInitCount:2,redInits:0}).color, '#BA7517', 'mid -> amber');

/* --- esc safety -------------------------------------------------------- */
eq(esc('<b>&"'), '&lt;b&gt;&amp;&quot;', 'esc escapes html');
eq(esc(null), '', 'esc null -> empty');

/* --- groupTree 2-level (product→gen): bucketing, sort, pinning, order --- */
(function(){
  var t = groupTree([
    {product:'Beta',  gen:'G2', item:'b2'},
    {product:'Alpha', gen:'G1', item:'a1'},
    {product:'Alpha', gen:'G2', item:'a2'},
    {product:'Alpha', gen:'G1', item:'a1b'},
    {product:'',      gen:'',   item:'orphan'},
    {product:'Alpha', gen:'',   item:'a_nogen'}
  ], ['product','gen'], {});
  eq(t.map(function(n){return n.value;}), ['Alpha','Beta',''], 'products sorted, empty last');
  eq(t.map(function(n){return n.level;}), ['product','product','product'], 'top level = product');
  var alpha = t[0];
  eq(alpha.leaf, false, 'product node not leaf');
  eq(alpha.count, 4, 'alpha count rolls up (a1,a2,a1b,a_nogen)');
  eq(alpha.groups.map(function(x){return x.value;}), ['G1','G2',''], 'alpha gens sorted, no-gen last');
  eq(alpha.groups[0].leaf, true, 'gen node is leaf');
  eq(alpha.groups[0].items, ['a1','a1b'], 'G1 items preserve input order');
  eq(alpha.groups[0].count, 2, 'G1 count');
  eq(alpha.groups[2].items, ['a_nogen'], 'alpha no-gen bucket');
  eq(t[2].value, '', 'unassigned product bucket last');
  eq(t[2].groups[0].items, ['orphan'], 'orphan in unassigned/no-gen');
})();
eq(groupTree([], ['product','gen'], {}), [], 'groupTree empty -> []');

/* --- groupTree 3-level (division→product→gen) + division ordering ------- */
(function(){
  var t = groupTree([
    {division:'fuelcell',     product:'Spectre', gen:'G1', item:'fc1'},
    {division:'exploration',  product:'Probe',   gen:'',   item:'ex1'},
    {division:'electrolyzer', product:'Volt',    gen:'G2', item:'ez1'},
    {division:'fuelcell',     product:'Spectre', gen:'G2', item:'fc2'}
  ], ['division','product','gen'], { division: divisionCmp });
  eq(t.map(function(n){return n.value;}), ['electrolyzer','fuelcell','exploration'], 'divisions in toggle order');
  eq(t.map(function(n){return n.level;}), ['division','division','division'], 'top level = division');
  var fc = t[1];
  eq(fc.count, 2, 'fuelcell count = 2');
  eq(fc.groups[0].level, 'product', '2nd level = product');
  eq(fc.groups[0].value, 'Spectre', 'fuelcell product Spectre');
  eq(fc.groups[0].groups.map(function(n){return n.value;}), ['G1','G2'], 'spectre gens ordered');
  eq(fc.groups[0].groups[0].level, 'gen', '3rd level = gen');
  eq(fc.groups[0].groups[0].items, ['fc1'], 'gen leaf items');
})();
ok(divisionCmp('fuelcell','electrolyzer') > 0, 'electrolyzer before fuelcell');
ok(divisionCmp('exploration','fuelcell') > 0, 'fuelcell before exploration');
eq([['exploration','fuelcell','electrolyzer'].sort(divisionCmp)][0], ['electrolyzer','fuelcell','exploration'], 'divisionCmp full order');

/* --- initiativeGroups: own fields / derived / fallback / dedupe --------- */
(function(){
  var objRows = [
    {id:10, initiativeId:1, productLine:'Spectre', productModel:'Gen 1'},
    {id:11, initiativeId:1, productLine:'Spectre', productModel:'Gen 2'},
    {id:12, initiativeId:2, productLine:'',        productModel:''},
    {id:13, initiativeId:3, productLine:'Phantom', productModel:'Gen 1'},
    {id:14, initiativeId:3, productLine:'Phantom', productModel:'Gen 1'}
  ];
  eq(initiativeGroups({id:9, productLine:'Owned', productModel:'GX'}, objRows),
     [{product:'Owned', gen:'GX'}], 'own fields used directly');
  eq(initiativeGroups({id:1, productLine:'', productModel:''}, objRows),
     [{product:'Spectre', gen:'Gen 1'},{product:'Spectre', gen:'Gen 2'}], 'derived multi-bucket from children');
  eq(initiativeGroups({id:2, productLine:'', productModel:''}, objRows),
     [{product:'', gen:''}], 'productless children -> unassigned');
  eq(initiativeGroups({id:3, productLine:'', productModel:''}, objRows),
     [{product:'Phantom', gen:'Gen 1'}], 'duplicate child buckets deduped');
})();

/* --- buildDivisionModel grouping output (single division → 2 levels) --- */
(function(){
  var projects = [
    {id:1, projectType:'initiative', division:'fuelcell', name:'Init Own', productLine:'Spectre', productModel:'Gen 2'},
    {id:2, projectType:'initiative', division:'fuelcell', name:'Init Derived'},
    {id:10, projectType:'objective', division:'fuelcell', parentId:2, name:'O-A', productLine:'Spectre', productModel:'Gen 1',
      keyResults:[{trackingType:'percentage',progress:100}]},
    {id:11, projectType:'objective', division:'fuelcell', parentId:1, name:'O-B', productLine:'Spectre', productModel:'Gen 2',
      keyResults:[{trackingType:'percentage',progress:50}]},
    {id:12, projectType:'objective', division:'fuelcell', parentId:2, name:'O-C', productLine:'', productModel:'',
      keyResults:[{trackingType:'percentage',progress:20}]}
  ];
  var m = buildDivisionModel(projects, 'fuelcell', null);
  eq(m.okrGroups.map(function(n){return n.level;}), ['product','product'], 'single-division view: top level product');
  eq(m.okrGroups.map(function(n){return n.value;}), ['Spectre',''], 'okr products: Spectre then unassigned');
  var spec = m.okrGroups[0];
  eq(spec.groups.map(function(x){return x.value;}), ['Gen 1','Gen 2'], 'spectre gens ordered');
  eq(spec.groups[0].items.map(function(o){return o.name;}), ['O-A'], 'gen1 has O-A');
  eq(spec.groups[1].items.map(function(o){return o.name;}), ['O-B'], 'gen2 has O-B');
  eq(m.okrGroups[1].groups[0].items.map(function(o){return o.name;}), ['O-C'], 'unassigned has O-C');
  var names = {};
  walkLeaves(m.initGroups, function(it, path){ (names[it.name] = names[it.name]||[]).push(path); });
  eq(names['Init Own'], ['Spectre/Gen 2'], 'Init Own grouped by its own fields');
  eq(names['Init Derived'], ['Spectre/Gen 1'], 'Init Derived grouped from child objective');
})();

/* --- buildDivisionModel Overall view nests Division → Product → Gen ----- */
(function(){
  var projects = [
    {id:1, projectType:'objective', division:'fuelcell',     parentId:0, name:'FCobj', productLine:'Spectre', productModel:'Gen 1', keyResults:[{trackingType:'percentage',progress:100}]},
    {id:2, projectType:'objective', division:'electrolyzer', parentId:0, name:'EZobj', productLine:'Volt',    productModel:'Gen 2', keyResults:[{trackingType:'percentage',progress:50}]}
  ];
  var m = buildDivisionModel(projects, null, null);
  eq(m.okrGroups.map(function(n){return n.level;}), ['division','division'], 'overall: top level division');
  eq(m.okrGroups.map(function(n){return n.value;}), ['electrolyzer','fuelcell'], 'overall divisions in toggle order');
  var ez = m.okrGroups[0];
  eq(ez.groups[0].level, 'product', 'overall 2nd level product');
  eq(ez.groups[0].value, 'Volt', 'ez product Volt');
  eq(ez.groups[0].groups[0].level, 'gen', 'overall 3rd level gen');
  eq(ez.groups[0].groups[0].items.map(function(o){return o.name;}), ['EZobj'], 'leaf objective EZobj');
  // paths confirm full 3-level nesting
  var paths = [];
  walkLeaves(m.okrGroups, function(o, path){ paths.push(o.name+'@'+path); });
  eq(paths, ['EZobj@electrolyzer/Volt/Gen 2','FCobj@fuelcell/Spectre/Gen 1'], 'overall leaf paths div/prod/gen');
})();

/* --- buildProductIndex (catalog id -> name, nested models) ------------- */
(function(){
  var hub = {
    products: [
      { id:'product-111', name:'Spectre', models:[ {id:'model-1', name:'Gen 1'}, {id:'model-2', title:'Gen 2'} ] },
      { id:'product-222', label:'Phantom' }
    ],
    projects: [ { id:10, name:'Native', productLine:'product-111' } ]
  };
  var idx = buildProductIndex(hub);
  eq(idx['product-111'], 'Spectre', 'index: product name');
  eq(idx['product-222'], 'Phantom', 'index: product via label');
  eq(idx['model-1'], 'Gen 1', 'index: model name');
  eq(idx['model-2'], 'Gen 2', 'index: model via title (nested)');
  ok(idx[10] === undefined, 'numeric project ids not indexed');
})();
eq(buildProductIndex(null), {}, 'buildProductIndex null -> {}');

/* --- mergeSourceProjects: namespacing + division stamping -------------- */
(function(){
  var merged = mergeSourceProjects([
    { prefix:'fc_',  division:'fuelcell',     projects:[ {id:1, name:'A', parentId:null}, {id:2, name:'B', parentId:1} ] },
    { prefix:'el_',  division:'electrolyzer', projects:[ {id:1, name:'C', parentId:null} ] }
  ]);
  eq(merged.map(function(p){return p.id;}), ['fc_1','fc_2','el_1'], 'ids prefixed per source (no collision)');
  eq(merged[1].parentId, 'fc_1', 'parentId prefixed with same source');
  eq(merged[0].parentId, null, 'null parentId stays null');
  eq(merged.map(function(p){return p.division;}), ['fuelcell','fuelcell','electrolyzer'], 'division stamped from source');
  eq(merged[2].id, 'el_1', 'colliding numeric id disambiguated across bins');
})();
eq(mergeSourceProjects([]), [], 'mergeSourceProjects empty -> []');

/* --- applyImportAssoc: resolve product/model via importProductAssoc ----- */
(function(){
  var catalog = { 'product-111':'Spectre', 'model-2':'Gen 2', 'product-222':'Phantom', 'model-9':'Gen 9' };
  var assoc = {
    'fc_1': { productLine:'product-111', productModel:'model-2' },   // objective
    'el_1': { productLine:'product-222', productModel:'' }           // product, no model
  };
  var projects = [
    { id:'fc_1', name:'Obj A', parentId:null, productLine:'', productModel:'' },
    { id:'fc_2', name:'KR child', parentId:'fc_1', productLine:'', productModel:'' }, // inherits from fc_1
    { id:'el_1', name:'Obj C', parentId:null, productLine:'', productModel:'' },
    { id:'fc_9', name:'Unassoc', parentId:null, productLine:'', productModel:'' }      // no assoc anywhere
  ];
  var out = applyImportAssoc(projects, assoc, catalog);
  eq(out[0].productLine, 'Spectre', 'direct assoc product -> name');
  eq(out[0].productModel, 'Gen 2', 'direct assoc model -> name');
  eq(out[1].productLine, 'Spectre', 'child inherits product up the parent chain');
  eq(out[1].productModel, 'Gen 2', 'child inherits model up the parent chain');
  eq(out[2].productLine, 'Phantom', 'second product resolves');
  eq(out[2].productModel, '', 'empty model stays empty');
  eq(out[3].productLine, '', 'no association -> unassigned product');
  // falls back to a project's own catalog id when there is no association
  var own = applyImportAssoc([{id:'x', parentId:null, productLine:'model-9', productModel:''}], {}, catalog);
  eq(own[0].productLine, 'Gen 9', 'own catalog id resolves when no assoc');
  // unresolved id passes through as-is
  var raw = applyImportAssoc([{id:'y', parentId:null, productLine:'product-zzz', productModel:''}], {}, catalog);
  eq(raw[0].productLine, 'product-zzz', 'unknown catalog id passes through');
})();

/* --- applyInitiativeAssoc: objective→initiative from importAssociations -- */
(function(){
  var projects = [
    { id:50, projectType:'initiative', name:'Init Hub' },                 // hub-native, numeric id
    { id:51, projectType:'task',       name:'Local task' },               // non-initiative local target
    { id:'fc_1', projectType:'objective', name:'Obj A', parentId:null },
    { id:'fc_2', projectType:'objective', name:'Obj B', parentId:null },
    { id:'el_1', projectType:'objective', name:'Obj C', parentId:null },
    { id:'fc_9', projectType:'objective', name:'Obj D', parentId:null }   // not linked
  ];
  /* JSON object keys are strings — coerced to the numeric local id. */
  var importAssociations = { '50': ['fc_1','fc_2','el_1'], '51': ['fc_9'] };
  var out = applyInitiativeAssoc(projects, importAssociations);
  var by = {}; out.forEach(function(p){ by[p.id] = p; });
  eq(by['fc_1']._assocInitiativeId, 50, 'objective linked to hub initiative (string key coerced)');
  eq(by['fc_2']._assocInitiativeId, 50, 'second objective linked');
  eq(by['el_1']._assocInitiativeId, 50, 'cross-bin objective linked to same initiative');
  ok(by['fc_9']._assocInitiativeId === undefined, 'link to non-initiative target ignored');
  ok(by['fc_1'] !== projects[2], 'stamped objective is a copy, not mutated in place');
})();
eq(applyInitiativeAssoc([], {}), [], 'applyInitiativeAssoc empty -> []');

/* --- buildDivisionModel consolidates via association (hub initiative) --- */
(function(){
  var raw = [
    { id:50, projectType:'initiative', division:'fuelcell', name:'Strategic Init', productLine:'Spectre', productModel:'' },
    { id:'fc_1', projectType:'objective', division:'fuelcell', parentId:null, name:'O1',
      keyResults:[{trackingType:'percentage',progress:80}] },
    { id:'fc_2', projectType:'objective', division:'fuelcell', parentId:null, name:'O2',
      keyResults:[{trackingType:'percentage',progress:40}] }
  ];
  var withInit = applyInitiativeAssoc(raw, { '50': ['fc_1','fc_2'] });
  var m = buildDivisionModel(withInit, 'fuelcell', null);
  eq(m.initiatives.length, 1, 'hub initiative present in model');
  var init = m.initiatives[0];
  eq(init.id, 50, 'initiative id is the hub numeric id');
  eq(init.objCount, 2, 'both objectives consolidate under the initiative via association');
  eq(init.health, 60, 'initiative health = mean(80,40)=60');
  /* objectives are tagged with that initiative, not Unassigned */
  eq(m.okrRows.filter(function(o){return o.initiativeId===50;}).length, 2, 'objectives tagged with hub initiative');
  eq(m.unassigned.length, 0, 'no unassigned objectives');
})();

/* --- overall view (null division) spans every division (Issue 2) ------- */
(function(){
  var projects = [
    {id:1, projectType:'objective', division:'fuelcell',     parentId:0, name:'FC obj', keyResults:[{trackingType:'percentage',progress:80}]},
    {id:2, projectType:'objective', division:'electrolyzer', parentId:0, name:'EZ obj', keyResults:[{trackingType:'percentage',progress:40}]},
    {id:3, projectType:'objective', division:'exploration',  parentId:0, name:'EX obj', keyResults:[{trackingType:'percentage',progress:60}]}
  ];
  var all = buildDivisionModel(projects, null, null);
  eq(all.objCount, 3, 'overall counts all divisions');
  eq(all.divAttain, 60, 'overall attainment mean(80,40,60)=60');
  eq(all.division, '__all__', 'overall model.division sentinel');
  var fc = buildDivisionModel(projects, 'fuelcell', null);
  eq(fc.objCount, 1, 'single-division view filters down');
  eq(fc.divAttain, 80, 'fuelcell attainment 80');
})();

/* --- write-payload builders -------------------------------------------- */
eq(nextProjectId([]), 10000, 'nextProjectId empty -> 10000 floor');
eq(nextProjectId([{id:5},{id:'fc_3'},{id:12345}]), 12346, 'nextProjectId = max numeric + 1 (ignores string ids)');
eq(nextProjectId([{id:9000}]), 10000, 'nextProjectId floor holds below 10000');

(function(){
  var o = buildObjective({ id:10001, name:'  Cut cost  ', division:'fuelcell', start:'2026-01-01', end:'2026-03-01',
                           kr:{ name:' Reach 0.6V ', progress:150 } });
  eq(o.projectType, 'objective', 'objective type');
  eq(o.name, 'Cut cost', 'name trimmed');
  eq(o.division, 'fuelcell', 'division set');
  eq(o.start, '2026-01-01', 'start set'); eq(o.end, '2026-03-01', 'end set');
  eq(o.keyResults.length, 1, 'one KR built');
  eq(o.keyResults[0].trackingType, 'percentage', 'KR is percentage');
  eq(o.keyResults[0].progress, 100, 'KR progress clamped to 100');
  eq(o.keyResults[0].name, 'Reach 0.6V', 'KR name trimmed');
  // full schema present so the Gantt renders it
  ['milestone','effortType','resources','dependencies','keyResults','stageGatesLinked','progress','manuallyCompleted'].forEach(function(k){
    ok(Object.prototype.hasOwnProperty.call(o, k), 'objective has field '+k);
  });
  eq(o.milestone, false, 'objective not a milestone');
  var o2 = buildObjective({ id:1, name:'No KR', division:'electrolyzer' });
  eq(o2.keyResults.length, 0, 'no KR when none supplied');
})();

(function(){
  var i = buildInitiative({ id:50, name:'Platform', division:'fuelcell', productLine:'product-1', productModel:'model-2', start:'2026-01-01', end:'2026-12-31' });
  eq(i.projectType, 'initiative', 'initiative type');
  eq(i.productLine, 'product-1', 'initiative product line (catalog id) set on the project');
  eq(i.productModel, 'model-2', 'initiative product model set');
  eq(i.milestone, false, 'initiative not a milestone');
  ok(Array.isArray(i.associatedObjectives) && i.associatedObjectives.length === 0, 'initiative starts with empty associatedObjectives');
})();

(function(){
  var m = buildMilestone({ id:60, name:'Gate 1', division:'electrolyzer', dueDate:'2026-06-30', ownerId:'el_123', productLine:'product-9' });
  eq(m.projectType, 'milestone', 'milestone type');
  eq(m.milestone, true, 'milestone flag true');
  eq(m.start, '2026-06-30', 'milestone start = due date');
  eq(m.end, '2026-06-30', 'milestone end = due date');
  eq(m.parentId, 'el_123', 'milestone parentId = owner id (prefixed objective)');
  eq(m.productLine, 'product-9', 'milestone product set');
  var m2 = buildMilestone({ id:61, name:'Standalone', division:'fuelcell', dueDate:'2026-06-30', ownerId:'' });
  eq(m2.parentId, null, 'blank owner -> null parentId');
})();

/* --- association map updates (immutable, prefixed keys) ----------------- */
(function(){
  var base = { '50':['fc_1'] };
  var next = withAssociation(base, 50, 'fc_2');
  eq(next['50'], ['fc_1','fc_2'], 'objective appended under initiative key');
  ok(base['50'].length === 1, 'original association map not mutated');
  var dedupe = withAssociation(next, 50, 'fc_2');
  eq(dedupe['50'], ['fc_1','fc_2'], 'no duplicate association entry');
  var fresh = withAssociation({}, 77, 'el_9');
  eq(fresh['77'], ['el_9'], 'new initiative key created');

  var pbase = { 'fc_1':{productLine:'p1',productModel:''} };
  var pnext = withProductAssoc(pbase, 'fc_2', 'p2', 'm2');
  eq(pnext['fc_2'], {productLine:'p2', productModel:'m2'}, 'product assoc added by prefixed id');
  ok(!Object.prototype.hasOwnProperty.call(pbase, 'fc_2'), 'original product map not mutated');
  var pskip = withProductAssoc(pbase, 'fc_3', '', '');
  ok(!Object.prototype.hasOwnProperty.call(pskip, 'fc_3'), 'no product assoc written when product line is blank');
})();

/* --- add-modal link filtering by division + product + generation ------- */
(function(){
  var projects = [
    { id:50, projectType:'initiative', division:'fuelcell', name:'Spectre init',    productLine:'Spectre', productModel:'' },
    { id:51, projectType:'initiative', division:'fuelcell', name:'Spectre G2 init', productLine:'Spectre', productModel:'Gen 2' },
    { id:52, projectType:'initiative', division:'fuelcell', name:'Phantom init',    productLine:'Phantom', productModel:'' },
    { id:53, projectType:'initiative', division:'fuelcell', name:'General init',    productLine:'' },
    { id:54, projectType:'initiative', division:'electrolyzer', name:'EZ init',     productLine:'Spectre' },
    { id:55, projectType:'initiative', division:'fuelcell', name:'Derived init',    productLine:'' },
    { id:'fc_9', projectType:'objective', division:'fuelcell', name:'child', productLine:'Phantom', productModel:'Gen 1', _assocInitiativeId:55 },
    { id:'fc_1', projectType:'objective', division:'fuelcell', name:'Obj Spectre', productLine:'Spectre', productModel:'Gen 1' },
    { id:'fc_2', projectType:'objective', division:'fuelcell', name:'Obj Phantom', productLine:'Phantom', productModel:'Gen 1' }
  ];
  var names = function(arr){ return arr.map(function(p){ return p.name; }).sort(); };
  eq(names(relevantInitiativesFor(projects, 'fuelcell', 'Spectre', 'Gen 1')), ['General init','Spectre init'],
     'Spectre/Gen1 -> Spectre(any-gen) + general; Spectre-G2/Phantom/derived-Phantom excluded');
  eq(names(relevantInitiativesFor(projects, 'fuelcell', 'Spectre', '')), ['General init','Spectre G2 init','Spectre init'],
     'Spectre (no gen) -> both Spectre generations + general');
  eq(names(relevantInitiativesFor(projects, 'fuelcell', 'Phantom', 'Gen 1')), ['Derived init','General init','Phantom init'],
     'Phantom/Gen1 -> own Phantom + derived-from-child Phantom + general');
  eq(relevantInitiativesFor(projects, 'fuelcell', '', '').length, 5, 'no product -> all fuelcell initiatives (division only)');
  ok(names(relevantInitiativesFor(projects, 'electrolyzer', 'Spectre', '')).indexOf('Spectre init') < 0, 'other-division initiative excluded');
  eq(names(relevantObjectivesFor(projects, 'fuelcell', 'Spectre', 'Gen 1')), ['Obj Spectre'],
     'objective owner filter: Spectre/Gen1 -> only the Spectre/Gen1 objective');
  eq(relevantObjectivesFor(projects, 'fuelcell', '', '').length, 3, 'no product -> all fuelcell objectives');
})();

/* --- edit builders ----------------------------------------------------- */
(function(){
  eq(unprefixId('fc_123'), 123, 'unprefixId strips prefix -> number');
  eq(unprefixId('exp_10001'), 10001, 'unprefixId exploration');
  eq(unprefixId('50'), 50, 'unprefixId bare numeric -> number');
  eq(unprefixId('fc_abc'), 'abc', 'unprefixId non-numeric raw stays string');

  var ps = [{ id:50, name:'A' }, { id:'fc_2', name:'B' }];
  eq(findProjectById(ps, 50).name, 'A', 'findProjectById numeric');
  eq(findProjectById(ps, '50').name, 'A', 'findProjectById numeric-as-string');
  eq(findProjectById(ps, 'fc_2').name, 'B', 'findProjectById string id');
  eq(findProjectById(ps, 999), null, 'findProjectById miss -> null');

  var obj = { id:'fc_2', name:'Old', start:'2026-01-01', end:'2026-03-01', division:'fuelcell', keyResults:[{x:1}], projectType:'objective' };
  var oe = applyObjectiveEdit(obj, { name:'  New  ', start:'2026-02-01', end:'' });
  eq(oe.name, 'New', 'objective edit trims name');
  eq(oe.start, '2026-02-01', 'objective edit start');
  eq(oe.end, '', 'objective edit clears end');
  eq(oe.division, 'fuelcell', 'objective edit leaves division');
  ok(oe.keyResults === obj.keyResults, 'objective edit keeps keyResults ref (read-only)');
  ok(oe !== obj, 'objective edit returns a copy');
  eq(obj.name, 'Old', 'objective edit does not mutate original');

  var init = { id:50, name:'I', productLine:'', productModel:'', start:'', end:'', division:'fuelcell', projectType:'initiative' };
  var ie = applyInitiativeEdit(init, { name:'I2', productLine:'P', productModel:'M', start:'2026-01-01', end:'2026-06-01' });
  eq([ie.name, ie.productLine, ie.productModel, ie.start, ie.end], ['I2','P','M','2026-01-01','2026-06-01'], 'initiative edit fields');

  var ms = { id:9, name:'M', start:'2026-05-01', end:'2026-05-01', parentId:'fc_2', productLine:'', productModel:'', projectType:'milestone', milestone:true };
  var me = applyMilestoneEdit(ms, { name:'M2', dueDate:'2026-07-01', ownerId:50, productLine:'P', productModel:'M' });
  eq([me.name, me.start, me.end, me.parentId, me.productLine], ['M2','2026-07-01','2026-07-01',50,'P'], 'milestone edit fields + due->start/end');
  eq(applyMilestoneEdit(ms, { ownerId:'' }).parentId, null, 'milestone edit clears owner -> null parentId');

  var A = { '50':['fc_2','fc_3'], '60':['fc_9'] };
  eq(moveAssociation(A, 50, 60, 'fc_2'), { '50':['fc_3'], '60':['fc_9','fc_2'] }, 'move fc_2 from 50 to 60');
  eq(moveAssociation(A, 50, '', 'fc_2'), { '50':['fc_3'], '60':['fc_9'] }, 'clear removes from old, adds nowhere');
  eq(moveAssociation(A, 50, 50, 'fc_2'), { '50':['fc_2','fc_3'], '60':['fc_9'] }, 'same bucket is a no-op');
  eq(moveAssociation({}, '', 60, 'fc_7'), { '60':['fc_7'] }, 'add into empty map / new bucket');
  eq(moveAssociation({ '50':['fc_2'], '60':['fc_2'] }, 50, 70, 'fc_2'), { '50':[], '60':[], '70':['fc_2'] }, 'dedupes across buckets');
  ok(JSON.stringify(A) === JSON.stringify({ '50':['fc_2','fc_3'], '60':['fc_9'] }), 'moveAssociation does not mutate input');

  var PA = { 'fc_2':{ productLine:'P', productModel:'M' } };
  eq(setProductAssoc(PA, 'fc_3', 'Q', 'N'), { 'fc_2':{ productLine:'P', productModel:'M' }, 'fc_3':{ productLine:'Q', productModel:'N' } }, 'setProductAssoc add');
  eq(setProductAssoc(PA, 'fc_2', '', ''), {}, 'setProductAssoc clear removes entry');
  eq(setProductAssoc(PA, 'fc_2', 'Q', ''), { 'fc_2':{ productLine:'Q', productModel:'' } }, 'setProductAssoc overwrite');
  ok(JSON.stringify(PA) === JSON.stringify({ 'fc_2':{ productLine:'P', productModel:'M' } }), 'setProductAssoc does not mutate input');

  var cat = [{ id:'P1', name:'Spectre', models:[{ id:'M1', name:'Gen 1' }, { id:'M2', name:'Gen 2' }] }];
  eq(catalogIdByName(cat, 'Spectre'), 'P1', 'catalogIdByName');
  eq(catalogIdByName(cat, 'Nope'), '', 'catalogIdByName miss');
  eq(catalogIdByName(cat, ''), '', 'catalogIdByName empty');
  eq(catalogModelIdByName(cat, 'P1', 'Gen 2'), 'M2', 'catalogModelIdByName');
  eq(catalogModelIdByName(cat, 'P1', 'Nope'), '', 'catalogModelIdByName miss');
  eq(catalogModelIdByName(cat, '', 'Gen 1'), '', 'catalogModelIdByName no product');
})();

console.log('PASS='+PASS+' FAIL='+FAIL);
if(MSGS.length) console.log(MSGS.join('\n'));
process.exit(FAIL ? 1 : 0);
"""

runner = core + "\n" + tests
open('/tmp/_core.js', 'w', encoding='utf-8').write(runner)
r2 = subprocess.run(['node', '/tmp/_core.js'], capture_output=True, text=True)
print(r2.stdout.strip())
if r2.stderr.strip():
    print(r2.stderr.strip())
core_rc = r2.returncode

# 3) DOM smoke test — evaluate the FULL script under a stub and exercise the
#    impure layer (init + render + add modal) to catch wiring/runtime errors
#    the CORE harness can't see.
smoke = os.path.join(os.path.dirname(__file__), 'smoke.js')
r3 = subprocess.run(['node', smoke], capture_output=True, text=True)
print(r3.stdout.strip())
if r3.stderr.strip():
    print(r3.stderr.strip())

sys.exit(0 if (core_rc == 0 and r3.returncode == 0) else 1)