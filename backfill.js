/* backfill.js — Phase 5 (offline, one-time)
 * Transforms milestone KPIs + statuses from the OVERALL GANTT bin (index(13)) into the
 * planning model. Pure/deterministic; the live fetch + re-import are done by hand.
 *
 * Inputs  (exported by hand from the bins):
 *   gantt     : the overall gantt bin JSON      ({record:{projects,...}} | {projects} | [projects])
 *   portfolio : the planning portfolio bin JSON  (divisions, initiatives, milestones, kpis, …)
 *   execDocs  : { "EXEC-<div>": {keyResults,stageGates,kpis,kpiUpdates}, … }  (for reading seeds)
 *   opts.divMap : { <index13 division code> : <planning division id> }  e.g. {fuelcell:"FC"}
 *
 * Output: { portfolio (updated), execDocs (updated), report }.
 * Idempotent: skips milestone KPIs whose name already exists; never overwrites a set completedDate.
 */
'use strict';
var RD = require('./rdcore.js');

var EPOCH = Date.UTC(2020, 0, 1);
function isoToDay(iso){ return iso ? Math.round((Date.parse(iso + 'T00:00:00Z') - EPOCH) / 86400000) : null; }
function norm(s){ return String(s == null ? '' : s).trim().toLowerCase(); }

// peel the storage envelope: broker returns {doc,etag,version}; JSONBin returns {record,metadata}
function unwrap(x){
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    if (x.doc && typeof x.doc === 'object') return x.doc;
    if (x.record && typeof x.record === 'object') return x.record;
  }
  return x;
}

// index(13) direction → planning direction ('up'/'down'); 'maintain' has no equivalent → up + a flag
function mapDir(d){
  if (d === 'decrease') return { dir: 'down', warn: null };
  if (d === 'maintain') return { dir: 'up', warn: 'maintain' };
  return { dir: 'up', warn: null };   // 'increase' or absent
}
// unit: explicit units/unit field, else the trailing "(…)" in the KPI name
function parseUnit(k){
  if (k.units != null && k.units !== '') return String(k.units).trim();
  if (k.unit  != null && k.unit  !== '') return String(k.unit).trim();
  var m = String(k.name || '').match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : '';
}
// KPI display name; strip the trailing "(unit)" only when we derived the unit from the name
function cleanName(k, unit){
  var n = String(k.name || '').trim();
  if (unit && (k.units == null || k.units === '') && (k.unit == null || k.unit === ''))
    n = n.replace(/\s*\(([^)]+)\)\s*$/, '').trim();
  return n;
}
// which projects are milestones we import (stage-gates excluded; 'delivery' counts per index(13))
function isMilestone(p){
  return !p.isStageGate && (p.projectType === 'milestone' || p.projectType === 'delivery' || p.milestone === true);
}
function completionDay(p){
  if (p.completedDate) return isoToDay(p.completedDate);
  if (p.manuallyCompleted && p.end) return isoToDay(p.end);   // manual with no date → its planned end
  return null;
}
function extractProjects(gantt){
  if (Array.isArray(gantt)) return gantt;
  if (gantt && Array.isArray(gantt.projects)) return gantt.projects;
  if (gantt && gantt.record && Array.isArray(gantt.record.projects)) return gantt.record.projects;
  return [];
}
function divOfMilestone(ms, P){
  var init = (P.initiatives || []).find(function(i){ return i.id === ms.initiativeId; });
  return init ? init.divisionId : null;
}
// candidate planning milestones for a gantt milestone: same name, same division (if mappable)
function matchMilestones(gm, P, divMap){
  var gDiv = divMap[norm(gm.division)] || null;
  return (P.milestones || []).filter(function(m){
    if (norm(m.name) !== norm(gm.name)) return false;
    if (!gDiv) return true;
    return divOfMilestone(m, P) === gDiv;
  });
}

function buildBackfill(gantt, portfolio, execDocs, opts){
  opts = opts || {};
  var divMap = opts.divMap || {};
  var P = JSON.parse(JSON.stringify(unwrap(portfolio || {})));
  var rawE = execDocs || {}, E = {};
  Object.keys(rawE).forEach(function(k){ E[k] = JSON.parse(JSON.stringify(unwrap(rawE[k]))); });
  P.divisions = P.divisions || []; P.initiatives = P.initiatives || [];
  P.milestones = P.milestones || []; P.kpis = P.kpis || [];
  var ts = (opts.timestamp != null) ? opts.timestamp : Date.now();

  var report = { matched: [], unmatched: [], ambiguous: [], kpisAdded: 0, statusesSet: 0, readingsSeeded: 0, warnings: [], execDocsTouched: [] };
  var touched = {};
  var gmss = extractProjects(gantt).filter(isMilestone);

  gmss.forEach(function(gm){
    var cands = matchMilestones(gm, P, divMap);
    if (cands.length === 0) { report.unmatched.push({ name: gm.name, division: gm.division }); return; }
    if (cands.length > 1)  { report.ambiguous.push({ name: gm.name, division: gm.division, count: cands.length }); return; }
    var ms = cands[0];
    var divId = divOfMilestone(ms, P);
    var have = new Set(P.kpis.filter(function(k){ return k.hostType === 'milestone' && k.hostId === ms.id; }).map(function(k){ return norm(k.name); }));
    var kpis = gm.milestoneKpis || gm.kpis || [];
    var addedK = 0, seeded = 0;

    kpis.forEach(function(gk){
      var unit = parseUnit(gk);
      var name = cleanName(gk, unit);
      if (!name) return;
      if (have.has(norm(name))) return;                          // idempotent: KPI already present
      var d = mapDir(gk.direction);
      if (d.warn === 'maintain') report.warnings.push({ milestone: ms.name, kpi: name, warn: "direction 'maintain' → 'up' (no planning equivalent)" });
      var id = RD.allocId('kpi', ms.id, P.kpis.map(function(k){ return k.id; }));
      P.kpis.push({ id: id, hostType: 'milestone', hostId: ms.id, objectiveId: null, isDefiner: true, groupId: null,
        name: name, targetType: 'demonstration', direction: d.dir, unit: unit,
        target: (gk.target != null && gk.target !== '') ? Number(gk.target) : null });
      have.add(norm(name)); addedK++;

      if (gk.current != null && gk.current !== '') {
        if (divId) {
          var docId = 'EXEC-' + divId;
          E[docId] = E[docId] || { keyResults: [], stageGates: [], kpis: [], kpiUpdates: [] };
          E[docId].kpiUpdates = E[docId].kpiUpdates || [];
          E[docId].kpiUpdates.push({ kpiId: id, value: Number(gk.current), timestamp: ts, note: 'backfill from overall gantt' });
          touched[docId] = true;
          seeded++;
        } else {
          report.warnings.push({ milestone: ms.name, kpi: name, warn: 'no division exec doc — current reading not seeded' });
        }
      }
    });

    var statusSet = false, cd = completionDay(gm);
    if (cd != null && ms.completedDate == null) { ms.completedDate = cd; statusSet = true; report.statusesSet++; }

    report.matched.push({ gantt: gm.name, milestone: ms.id, division: divId, kpisAdded: addedK, statusSet: statusSet, readings: seeded });
    report.kpisAdded += addedK; report.readingsSeeded += seeded;
  });

  report.execDocsTouched = Object.keys(touched);
  return { portfolio: P, execDocs: E, report: report };
}

function formatReport(r){
  var L = [];
  L.push('MILESTONE BACKFILL — dry run');
  L.push('  matched ' + r.matched.length + ' · unmatched ' + r.unmatched.length + ' · ambiguous ' + r.ambiguous.length);
  L.push('  KPIs added ' + r.kpisAdded + ' · statuses set ' + r.statusesSet + ' · readings seeded ' + r.readingsSeeded + ' · warnings ' + r.warnings.length);
  if (r.matched.length)  { L.push(''); L.push('MATCHED'); r.matched.forEach(function(m){ L.push('  ' + m.gantt + ' → ' + m.milestone + (m.division ? ' [' + m.division + ']' : '') + ' · +' + m.kpisAdded + ' KPIs' + (m.statusSet ? ' · status set' : '') + (m.readings ? ' · ' + m.readings + ' readings' : '')); }); }
  if (r.unmatched.length){ L.push(''); L.push('UNMATCHED (no planning milestone of that name in the division)'); r.unmatched.forEach(function(u){ L.push('  ' + u.name + (u.division ? ' [' + u.division + ']' : '')); }); }
  if (r.ambiguous.length){ L.push(''); L.push('AMBIGUOUS (multiple planning milestones match)'); r.ambiguous.forEach(function(a){ L.push('  ' + a.name + (a.division ? ' [' + a.division + ']' : '') + ' — ' + a.count + ' candidates'); }); }
  if (r.warnings.length) { L.push(''); L.push('WARNINGS'); r.warnings.forEach(function(w){ L.push('  ' + w.milestone + ' · ' + w.kpi + ': ' + w.warn); }); }
  return L.join('\n');
}

module.exports = { buildBackfill: buildBackfill, formatReport: formatReport, isMilestone: isMilestone, matchMilestones: matchMilestones, mapDir: mapDir, parseUnit: parseUnit, cleanName: cleanName, completionDay: completionDay, isoToDay: isoToDay, extractProjects: extractProjects, unwrap: unwrap };

// CLI: node backfill.js <gantt.json> <portfolio.json> <execDocs.json> <divMap.json> [outDir]
if (require.main === module) {
  var fs = require('fs'), path = require('path');
  var a = process.argv.slice(2);
  if (a.length < 4) { console.error('usage: node backfill.js <gantt.json> <portfolio.json> <execDocs.json> <divMap.json> [outDir]'); process.exit(1); }
  var gantt = JSON.parse(fs.readFileSync(a[0], 'utf8'));
  var portfolio = JSON.parse(fs.readFileSync(a[1], 'utf8'));
  var execDocs = JSON.parse(fs.readFileSync(a[2], 'utf8'));
  var divMap = JSON.parse(fs.readFileSync(a[3], 'utf8'));
  var out = buildBackfill(gantt, portfolio, execDocs, { divMap: divMap });
  console.log(formatReport(out.report));
  var dir = a[4] || '.';
  fs.writeFileSync(path.join(dir, 'backfill.report.txt'), formatReport(out.report));
  fs.writeFileSync(path.join(dir, 'portfolio.backfilled.json'), JSON.stringify(out.portfolio, null, 2));   // review
  fs.writeFileSync(path.join(dir, 'portfolio.put.json'), JSON.stringify({ doc: out.portfolio }));           // PUT body
  out.report.execDocsTouched.forEach(function(k){
    fs.writeFileSync(path.join(dir, k + '.backfilled.json'), JSON.stringify(out.execDocs[k], null, 2));
    fs.writeFileSync(path.join(dir, k + '.put.json'), JSON.stringify({ doc: out.execDocs[k] }));
  });
  console.log('\nwrote to ' + dir + ':');
  console.log('  backfill.report.txt');
  console.log('  portfolio.backfilled.json (review)   portfolio.put.json (PUT body)');
  out.report.execDocsTouched.forEach(function(k){ console.log('  ' + k + '.backfilled.json (review)   ' + k + '.put.json (PUT body)'); });
  if (!out.report.execDocsTouched.length) console.log('  (no exec docs changed — only the portfolio needs re-importing)');
}
