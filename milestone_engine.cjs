// Phase M1 — the milestone KR engine (pure rdcore). A milestone KR is a weighted, dated checklist:
//   - weights forced to 100 (explicit kept; blanks split the remainder evenly)
//   - KR-level creditMode: binary = full weight only at 100% (strict); partial = weight * completion/100
//   - milestoneKrScore is 0..100, or null when there are no steps (so it drops out of the objective mean)
//   - wired into keyResultScore, so a milestone KR rolls up exactly like any other KR
const C = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const near = (a, b, e) => Math.abs(a - b) < (e == null ? 1e-9 : e);

// ---------- effective weights: sum-to-100 with blank-split ----------
(function () {
  // two explicit (15,35) + two blank -> blanks share (100-50)/2 = 25 each
  let eff = C.milestoneEffectiveWeights([{ id: 'a', weight: 15 }, { id: 'b', weight: null }, { id: 'c', weight: 35 }, { id: 'd', weight: null }]);
  let byId = {}; eff.forEach(e => byId[e.id] = e);
  ok(byId.a.w === 15 && byId.c.w === 35, 'explicit weights are kept as-is');
  ok(byId.b.w === 25 && byId.d.w === 25, 'blank weights split the remainder evenly (25 each)');
  ok(byId.b.auto === true && byId.a.auto === false, 'blank steps are flagged auto, explicit are not');
  ok(near(eff.reduce((s, e) => s + e.w, 0), 100), 'effective weights total 100');

  // all explicit summing to 100
  eff = C.milestoneEffectiveWeights([{ id: 'a', weight: 40 }, { id: 'b', weight: 60 }]);
  ok(near(eff.reduce((s, e) => s + e.w, 0), 100), 'all-explicit weights that already total 100 are untouched');

  // over-100 explicit -> blanks clamp to 0 (never negative)
  eff = C.milestoneEffectiveWeights([{ id: 'a', weight: 70 }, { id: 'b', weight: 50 }, { id: 'c', weight: null }]);
  byId = {}; eff.forEach(e => byId[e.id] = e);
  ok(byId.c.w === 0, 'when explicit weights already exceed 100, a blank gets 0 (clamped, not negative)');

  // empty -> empty
  ok(C.milestoneEffectiveWeights([]).length === 0, 'no steps -> no weights');
})();

// ---------- per-step contribution: binary vs partial ----------
(function () {
  ok(C.milestoneStepContribution({ completion: 100 }, 25, 'binary') === 25, 'binary: a 100% step credits its full weight');
  ok(C.milestoneStepContribution({ completion: 67 }, 25, 'binary') === 0, 'binary is STRICT: a 67% step credits 0');
  ok(C.milestoneStepContribution({ completion: 99 }, 25, 'binary') === 0, 'binary: even 99% credits 0 (only 100 counts)');
  ok(near(C.milestoneStepContribution({ completion: 67 }, 25, 'partial'), 16.75), 'partial: 25 weight * 67% = 16.75');
  ok(C.milestoneStepContribution({ completion: 0 }, 40, 'partial') === 0, 'partial: 0% credits 0');
  ok(C.milestoneStepContribution({ completion: 150 }, 20, 'partial') === 20, 'completion is clamped to 100 (150% -> full weight)');
  ok(C.milestoneStepContribution({ completion: -10 }, 20, 'partial') === 0, 'completion is clamped to 0 (negative -> 0)');
})();

// ---------- milestoneKrScore: the seed case both ways ----------
(function () {
  // weights 15/(blank)/35/(blank) -> 15/25/35/25 ; completions 100/67/33/0
  const steps = [
    { id: 'a', weight: 15, completion: 100 },
    { id: 'b', weight: null, completion: 67 },
    { id: 'c', weight: 35, completion: 33 },
    { id: 'd', weight: null, completion: 0 },
  ];
  ok(C.milestoneKrScore({ creditMode: 'binary', steps }) === 15, 'binary KR score = 15 (only the fully-done step counts)');
  ok(near(C.milestoneKrScore({ creditMode: 'partial', steps }), 43.3, 0.05), 'partial KR score = 43.3 (weights scaled by completion)');
  // default mode is binary
  ok(C.milestoneKrScore({ steps }) === 15, 'creditMode defaults to binary');
  // no steps -> null (drops out of rollup), NOT 0
  ok(C.milestoneKrScore({ creditMode: 'binary', steps: [] }) === null, 'a milestone KR with no steps scores null (not 0)');
  ok(C.milestoneKrScore({}) === null, 'a milestone KR with undefined steps scores null');
  // steps present but nothing done -> a real 0 (it has steps, they are just incomplete)
  ok(C.milestoneKrScore({ creditMode: 'binary', steps: [{ id: 'x', weight: 100, completion: 0 }] }) === 0, 'steps present but incomplete -> real 0');
})();

// ---------- integration: keyResultScore + objectiveScore ----------
(function () {
  // one objective, one division; a milestone KR alongside a percentage KR
  const steps = [
    { id: 's1', weight: 50, completion: 100 },
    { id: 's2', weight: 50, completion: 0 },
  ];
  const execDocs = {
    'DIV-FIN': {
      keyResults: [
        { id: 'KR-M', objectiveId: 'O1', trackingType: 'milestone', creditMode: 'binary', steps: steps },
        { id: 'KR-P', objectiveId: 'O1', trackingType: 'percentage', progress: 80 },
      ],
      kpis: [], kpiUpdates: [], stageGates: [],
    },
  };
  // keyResultScore dispatches to the milestone engine
  ok(C.keyResultScore('KR-M', execDocs) === 50, 'keyResultScore routes a milestone KR to the milestone engine (50)');
  ok(C.keyResultScore('KR-P', execDocs) === 80, '...and a percentage KR still scores the old way (80)');
  // objectiveScore rolls the milestone KR in like any other -> mean(50, 80) = 65
  ok(near(C.objectiveScore('O1', execDocs), 65), 'objectiveScore folds the milestone KR into the flat mean: mean(50,80)=65');

  // an empty milestone KR drops OUT of the objective mean (null excluded)
  execDocs['DIV-FIN'].keyResults.push({ id: 'KR-empty', objectiveId: 'O1', trackingType: 'milestone', steps: [] });
  ok(near(C.objectiveScore('O1', execDocs), 65), 'an empty milestone KR (null) is excluded from the objective mean, not counted as 0');

  // switching creditMode to partial changes the rollup: milestone becomes 50 (50%*100 + 50%*0) -> still 50 here,
  // so make step 2 half-done to show partial differs: 50*1 + 50*0.5 = 75
  execDocs['DIV-FIN'].keyResults[0].creditMode = 'partial';
  execDocs['DIV-FIN'].keyResults[0].steps[1].completion = 50;
  ok(C.keyResultScore('KR-M', execDocs) === 75, 'partial mode re-scores the milestone KR live (50 + 50*0.5 = 75)');
  ok(near(C.objectiveScore('O1', execDocs), 77.5), 'objective rollup follows: mean(75,80)=77.5');
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} milestone-engine (M1) assertions green`);
process.exit(fails.length ? 1 : 0);
