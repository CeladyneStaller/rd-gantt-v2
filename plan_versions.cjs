// Plan versions: a revision snapshots the whole objective plan.
//
// Per objective, so a version can honestly claim what the committed finish was at the time. A snapshot
// holds workstreams, gates with dates, ordering and targets, and the KPIs hosted on those gates — KPI
// links live on exec.kpis with hostType 'stageGate', not on the gate, so capturing the gate alone would
// record only half of what a revision changed.
//
// Versions are READ-ONLY history. There is deliberately no restore.
const RD = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const baseExec = () => ({
  stageGateSets: [{ id: 'S1', objectiveId: 'O1', name: 'Durability', order: 0 },
                  { id: 'S2', objectiveId: 'O1', name: 'Pilot line', order: 1 }],
  stageGates: [
    { id: 'G1', objectiveId: 'O1', setId: 'S1', name: 'Cell build', plannedDate: 2252, actualDate: 2250, order: 0 },
    { id: 'G2', objectiveId: 'O1', setId: 'S1', name: '500 h AST', plannedDate: 2325, actualDate: null, order: 1 },
    { id: 'G4', objectiveId: 'O1', setId: 'S2', name: 'Pilot line trial', plannedDate: 2420, actualDate: null, order: 2 },
    { id: 'GX', objectiveId: 'OTHER', setId: null, name: 'Someone else', plannedDate: 2300, order: 0 }
  ],
  kpis: [{ id: 'K1', hostType: 'stageGate', hostId: 'G2', name: 'V at 2 A', direction: 'up', target: 0.65, unit: 'V' },
         { id: 'K9', hostType: 'keyResult', hostId: 'KR1', name: 'elsewhere', target: 1 }],
  planVersions: []
});
const pf = { objectives: [{ id: 'O1', plannedEnd: 2464 }] };

/* Each block is guarded: an engine that THROWS must produce a named failure, not kill the process. A
   crashed harness reports no failures at all, which reads exactly like a passing one. */
// ---------- the snapshot ----------
(function () { try {
  const e = baseExec();
  const snap = RD.capturePlanSnapshot(e, pf, 'O1');

  ok(snap.gates.length === 3, "the snapshot holds this objective's gates (" + snap.gates.length + ")");
  ok(!snap.gates.some(g => g.id === 'GX'), "…and not another objective's");
  ok(snap.sets.length === 2, "…its workstreams too");
  ok(snap.finishDay === 2464, "…and the committed finish at the time");

  const g2 = snap.gates.find(g => g.id === 'G2');
  ok(g2.plannedDate === 2325 && g2.name === '500 h AST', "a gate carries its date and name");
  ok(g2.setId === 'S1', "…and which workstream it belongs to");
  /* KPI links live on exec.kpis, not on the gate — capturing the gate alone would record half a change */
  ok(g2.kpis.length === 1 && g2.kpis[0].kpiId === 'K1', "…and the KPIs hosted on it");
  ok(g2.kpis[0].target === 0.65 && g2.kpis[0].direction === 'up', "…with their targets, so a retarget is visible");
  ok(!snap.gates.some(g => (g.kpis || []).some(k => k.kpiId === 'K9')),
    "a KPI hosted elsewhere is not swept in");

  ok(snap.gates[0].order <= snap.gates[1].order, "gates come back in plan order");
  ok(RD.capturePlanSnapshot(e, pf, 'NOPE').gates.length === 0, "an unknown objective yields an empty snapshot");
} catch (e) { ok(false, 'engine block threw: ' + (e && e.message)); } })();

// ---------- the diff ----------
(function () { try {
  const e = baseExec();
  const v1 = RD.capturePlanSnapshot(e, pf, 'O1');

  e.stageGates.find(g => g.id === 'G2').plannedDate = 2356;             // moved +31
  e.stageGates = e.stageGates.filter(g => g.id !== 'G4');               // removed
  e.stageGates.push({ id: 'G5', objectiveId: 'O1', setId: 'S1', name: 'Supplier qualification', plannedDate: 2440, order: 3 });
  const v2 = RD.capturePlanSnapshot(e, pf, 'O1');
  const d = RD.diffPlanSnapshots(v1, v2);

  ok(d.moved.length === 1 && d.moved[0].id === 'G2', "a moved gate is reported as moved");
  ok(d.moved[0].deltaDays === 31, "…with the day delta (" + d.moved[0].deltaDays + ")");
  ok(d.added.length === 1 && d.added[0].id === 'G5', "an added gate is reported as added");
  ok(d.removed.length === 1 && d.removed[0].id === 'G4', "a removed gate is reported as removed");
  ok(d.finishChanged === false, "the finish is unchanged, and says so");

  // a gate counts ONCE, under the most significant thing that happened to it
  const e2 = baseExec();
  const a = RD.capturePlanSnapshot(e2, pf, 'O1');
  const g = e2.stageGates.find(x => x.id === 'G2');
  g.plannedDate = 2356; g.name = 'Renamed too';
  const b = RD.capturePlanSnapshot(e2, pf, 'O1');
  const d2 = RD.diffPlanSnapshots(a, b);
  ok(d2.moved.length === 1 && d2.renamed.length === 0,
    "a gate both moved and renamed counts once, as moved — the bigger fact");

  // retarget is its own category
  const e3 = baseExec();
  const c = RD.capturePlanSnapshot(e3, pf, 'O1');
  e3.kpis.find(k => k.id === 'K1').target = 0.70;
  const dd = RD.diffPlanSnapshots(c, RD.capturePlanSnapshot(e3, pf, 'O1'));
  ok(dd.retargeted.length === 1 && dd.retargeted[0].id === 'G2',
    "changing a gate's KPI target is reported as a retarget");
  ok(dd.moved.length === 0, "…not as a move");

  // the finish moving is recorded, since a revision is allowed to change it deliberately
  const e4 = baseExec();
  const f1 = RD.capturePlanSnapshot(e4, pf, 'O1');
  const f2 = RD.capturePlanSnapshot(e4, { objectives: [{ id: 'O1', plannedEnd: 2500 }] }, 'O1');
  ok(RD.diffPlanSnapshots(f1, f2).finishChanged === true, "a changed finish date is reported");
} catch (e) { ok(false, 'engine block threw: ' + (e && e.message)); } })();

// ---------- per-gate marks ----------
(function () { try {
  const e = baseExec();
  const v1 = RD.capturePlanSnapshot(e, pf, 'O1');
  e.stageGates.find(g => g.id === 'G2').plannedDate = 2356;
  const v2 = RD.capturePlanSnapshot(e, pf, 'O1');
  e.stageGates.push({ id: 'G5', objectiveId: 'O1', setId: 'S1', name: 'Supplier', plannedDate: 2440, order: 3 });
  e.stageGates.find(g => g.id === 'G2').plannedDate = 2370;             // moved AGAIN in v3
  const v3 = RD.capturePlanSnapshot(e, pf, 'O1');
  e.planVersions = [{ objectiveId: 'O1', v: 1, snapshot: v1 },
                    { objectiveId: 'O1', v: 2, snapshot: v2 },
                    { objectiveId: 'O1', v: 3, snapshot: v3 }];

  const marks = RD.gateVersionMarks(e, 'O1');
  ok(marks.G5 && marks.G5.kind === 'added' && marks.G5.v === 3, "an added gate is marked with the version that added it");
  /* the LAST change wins: a gate touched in v2 and again in v3 must read v3, or the table claims a stale
     version was the last to touch it */
  ok(marks.G2 && marks.G2.v === 3, "a gate moved twice reads the LATEST version (" + (marks.G2 && marks.G2.v) + ")");
  ok(marks.G2.kind === 'moved' && marks.G2.deltaDays === 14, "…with that version's delta (" + marks.G2.deltaDays + ")");
  ok(!marks.G1, "an untouched gate carries no mark");

  const e0 = baseExec();
  e0.planVersions = [{ objectiveId: 'O1', v: 1, snapshot: RD.capturePlanSnapshot(e0, pf, 'O1') }];
  ok(Object.keys(RD.gateVersionMarks(e0, 'O1')).length === 0, "the original version alone marks nothing");
} catch (e) { ok(false, 'engine block threw: ' + (e && e.message)); } })();

// ---------- version bookkeeping ----------
(function () { try {
  const e = baseExec();
  ok(RD.planVersionsOf(e, 'O1').length === 0, "an objective starts with no versions");
  ok(RD.latestPlanVersion(e, 'O1') === null, "…and no latest");
  ok(RD.nextPlanVersionNumber(e, 'O1') === 1, "…the first revision being v1");

  e.planVersions = [{ objectiveId: 'O1', v: 2, snapshot: { gates: [] } },
                    { objectiveId: 'O1', v: 1, snapshot: { gates: [] } },
                    { objectiveId: 'O2', v: 7, snapshot: { gates: [] } }];
  ok(RD.planVersionsOf(e, 'O1').map(r => r.v).join(',') === '1,2', "versions come back in order whatever order they are stored");
  ok(RD.latestPlanVersion(e, 'O1').v === 2, "the latest is the highest");
  ok(RD.nextPlanVersionNumber(e, 'O1') === 3, "…and the next follows it");
  ok(RD.planVersionsOf(e, 'O2').length === 1, "another objective's versions are its own — versions are PER OBJECTIVE");
  ok(RD.nextPlanVersionNumber(e, 'O2') === 8, "…numbered independently");

  // no restore exists, by design
  ok(typeof RD.restorePlanVersion === 'undefined',
    "there is no restore — rewinding a plan cannot decide what happens to gates passed since");
} catch (e) { ok(false, 'engine block threw: ' + (e && e.message)); } })();

// ---------- the history summary ----------
(function () { try {
  const e = baseExec();
  const v1 = RD.capturePlanSnapshot(e, pf, 'O1');
  e.stageGates.find(g => g.id === 'G2').plannedDate = 2356;
  e.stageGates = e.stageGates.filter(g => g.id !== 'G4');
  const v2 = RD.capturePlanSnapshot(e, pf, 'O1');
  e.planVersions = [{ objectiveId: 'O1', v: 1, snapshot: v1 }, { objectiveId: 'O1', v: 2, snapshot: v2 }];

  const s1 = RD.planVersionSummary(e, 'O1', 1);
  ok(s1 && s1.first === true, "the original version is marked as the original, with nothing to diff against");

  const s2 = RD.planVersionSummary(e, 'O1', 2);
  ok(s2.counts.moved === 1 && s2.counts.removed === 1, "a later version summarises what it changed");
  ok(s2.finishChanged === false, "…including whether the finish held");
  ok(RD.planVersionSummary(e, 'O1', 9) === null, "an unknown version has no summary");
} catch (e) { ok(false, 'engine block threw: ' + (e && e.message)); } })();

// ---------- the revision flow, in the app ----------
(function () {
  const fs = require('fs');
  const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
  const vc = new VirtualConsole(); const errs = []; vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8'), {
    runScripts: 'dangerously', virtualConsole: vc, url: 'https://x.test/?division=D&token=t', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
      w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {};
      w.fetch = () => Promise.reject(new Error('no net')); w.prompt = () => null;
      w.cytoscape = function () { return { on(){}, ready(cb){ try{ cb && cb(); }catch(e){} }, fit(){}, resize(){},
        destroy(){}, getElementById(){ return { length: 0, select(){} }; }, zoom(){ return 1; }, width(){ return 800; },
        height(){ return 560; }, layout(){ return { run(){} }; }, elements(){ return { length: 0 }; },
        $(){ return { unselect(){} }; } }; };
    } });

  setTimeout(() => {
    const w = dom.window, d = w.document;
    try {
      w.eval(`persist=function(){}; persistPortfolio=function(){};
        portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],
          initiatives:[{id:"I",name:"I",divisionId:"D"}],
          objectives:[{id:"O1",statement:"Obj",divisionId:"D",initiativeId:"I",quarter:"2026Q2",plannedStart:2200,plannedEnd:2464}],
          kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
        exec.stageGateSets=[{id:"S1",objectiveId:"O1",name:"Durability",order:0}];
        exec.stageGates=[{id:"G1",objectiveId:"O1",setId:"S1",name:"Cell build",plannedDate:2252,actualDate:2250,order:0},
          {id:"G2",objectiveId:"O1",setId:"S1",name:"500 h AST",plannedDate:2325,actualDate:null,order:1},
          {id:"G4",objectiveId:"O1",setId:"S1",name:"Pilot trial",plannedDate:2420,actualDate:null,order:2}];
        exec.kpis=[{id:"K1",hostType:"stageGate",hostId:"G4",name:"yield",target:90,direction:"up"}];
        divisionId="D"; selectedObj="O1"; renderAll(); rpOpen("O1");`);

      const mb = () => d.getElementById('modalBody');
      ok(!!mb(), "the revision modal opens");
      ok(mb().querySelectorAll('[data-rp-row]').length === 3, "…listing every gate, passed ones included");
      /* A passed gate's date must not be editable: a revision re-plans what is still ahead, and letting
         someone retype a date that already happened would rewrite history rather than record it. */
      ok(!!mb().querySelector('[data-rp-date="G1"][disabled]'), "…with a passed gate locked");
      ok(!mb().querySelector('[data-rp-del="G1"]'), "…and not deletable");
      ok(!!mb().querySelector('[data-rp-del="G2"]'), "an unfinished gate can be deleted");
      ok(!!mb().querySelector('[data-rp-add]'), "a gate can be added to a workstream");

      const dt = mb().querySelector('[data-rp-date="G2"]');
      dt.value = '2026-07-15'; dt.dispatchEvent(new w.Event('change', { bubbles: true }));

      mb().querySelector('[data-rp-del="G4"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(!!mb().querySelector('.rp-row.del'), "deleting strikes the gate through rather than removing it at once");
      ok(!!mb().querySelector('[data-rp-undel="G4"]'), "…offering an undo, so you see what you are dropping");

      mb().querySelector('[data-rp-add]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const rows = [...mb().querySelectorAll('[data-rp-row]')];
      const nid = rows[rows.length - 1].dataset.rpRow;
      const nm = mb().querySelector('[data-rp-name="' + nid + '"]');
      nm.value = 'Supplier qualification'; nm.dispatchEvent(new w.Event('input', { bubbles: true }));
      const nd = mb().querySelector('[data-rp-date="' + nid + '"]');
      nd.value = '2026-09-05'; nd.dispatchEvent(new w.Event('change', { bubbles: true }));
      const re = mb().querySelector('[data-rp-reason]');
      re.value = 'vendor slipped'; re.dispatchEvent(new w.Event('input', { bubbles: true }));

      mb().querySelector('[data-rp-commit]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

      // ---- what landed ----
      const vs = JSON.parse(w.eval('JSON.stringify(RD.planVersionsOf(exec,"O1").map(r=>r.v))'));
      /* The first commit writes BOTH: without a v1 baseline the history starts mid-story and the
         revision has nothing to diff against. */
      ok(vs.join(',') === '1,2', "the first commit records the original as v1 AND the revision as v2 (" + vs.join(',') + ")");
      ok(w.eval('RD.planVersionsOf(exec,"O1")[1].reason') === 'vendor slipped', "…storing the reason given");

      const names = JSON.parse(w.eval('JSON.stringify(exec.stageGates.filter(g=>g.objectiveId==="O1").map(g=>g.name))'));
      ok(names.indexOf('Supplier qualification') >= 0, "the added gate is now in the live plan");
      ok(names.indexOf('Pilot trial') < 0, "…the deleted one is gone");
      ok(names.indexOf('Cell build') >= 0, "…and the passed one untouched");
      /* A removed gate takes its hosted KPIs with it, or they point at nothing and every score reading
         them measures a gate the plan no longer has. */
      ok(w.eval('(exec.kpis||[]).filter(k=>k.hostType==="stageGate"&&k.hostId==="G4").length') === 0,
        "a deleted gate's KPIs go with it rather than dangling");

      const sg = d.getElementById('subSG');
      const marks = [...sg.querySelectorAll('.gv-mark')].map(e => e.textContent);
      ok(marks.length === 2, "the table marks the gates this revision touched (" + marks.join(', ') + ")");
      ok(marks.some(t => /added v2/.test(t)), "…naming the added one");
      ok(marks.some(t => /v2/.test(t) && /\+/.test(t)), "…and the moved one with its delta");
      ok(sg.querySelectorAll('.ph-row').length === 2, "plan history lists both versions");
      ok(/PLAN HISTORY/.test(sg.textContent), "…under its own heading");
      ok(/finish held/.test(sg.textContent), "…saying the committed finish held");

      // compare is read-only: no restore anywhere in the UI
      ok(!/data-ph-restore/.test(fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8')),
        "there is no restore control — versions are history, not a rewind");
      const cmp = sg.querySelector('[data-ph-cmp="2"]');
      ok(!!cmp, "a version offers a compare");
      cmp.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const txt = d.getElementById('modalBody').textContent;
      ok(/added/.test(txt) && /removed/.test(txt) && /moved/.test(txt),
        "…which spells out what changed between the two versions");

      // cancelling leaves nothing behind
      w.eval('closeModal(); rpOpen("O1");');
      d.getElementById('modalBody').querySelector('[data-rp-del="G2"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      d.getElementById('modalBody').querySelector('[data-rp-cancel]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(w.eval('exec.stageGates.filter(g=>g.objectiveId==="O1").length') === 3,
        "cancelling a draft changes nothing — the draft is held in memory until Commit");
      ok(w.eval('RD.planVersionsOf(exec,"O1").length') === 2, "…and writes no version");

      ok(errs.length === 0, "no uncaught errors through the whole flow" + (errs[0] ? ': ' + errs[0].slice(0, 90) : ''));
    } catch (e) {
      ok(false, 'revision flow threw: ' + (e && e.message));
    }

    out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
    const fails = out.filter(x => x.startsWith('FAIL'));
    console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} plan-version assertions green`);
    process.exit(fails.length ? 1 : 0);
  }, 1500);
})();

const __done = true;
if (!__done) out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
