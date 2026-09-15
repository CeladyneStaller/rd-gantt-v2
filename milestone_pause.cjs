// Pausing and deprioritizing milestones.
//
// Modelled the way objectives already end: a separate state record rather than a field on the milestone,
// so the milestone is untouched and the history of pausing survives instead of being overwritten. The
// LAST record for a milestone wins, which makes resuming an append rather than a deletion.
//
// The property most likely to break quietly: milestone dates feed THREE consumers — the timeframe grid's
// year scan, an initiative's bar geometry, and the chart rows. All three have to agree about whether a
// paused milestone counts, or the grid offers a year for work that is not drawn.
const RD = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

// ---------- the state record ----------
(function () {
  let st = [];
  ok(RD.milestonePaused(st, 'M1') === false, "a milestone with no record is not paused");
  ok(RD.milestonePaused(null, 'M1') === false, "…and neither is one with no state at all");

  st = RD.setMilestoneState(st, 'M1', 'paused', 2500, 'waiting on supplier');
  ok(RD.milestonePaused(st, 'M1') === true, "pausing marks it");
  ok(RD.milestoneState(st, 'M1').note === 'waiting on supplier', "…keeping the reason");
  ok(RD.milestoneState(st, 'M1').day === 2500, "…and when");

  st = RD.setMilestoneState(st, 'M1', 'active', 2530, '');
  ok(RD.milestonePaused(st, 'M1') === false, "resuming clears it");
  ok(st.length === 2, "…by APPENDING, so the pause stays on file (" + st.length + " records)");
  ok(st[0].status === 'paused', "…the original record intact");

  st = RD.setMilestoneState(st, 'M2', 'deprioritized', 2540, '');
  ok(RD.milestonePaused(st, 'M2') === true, "deprioritized counts as paused for the chart");
  ok(RD.milestoneState(st, 'M2').status === 'deprioritized',
    "…while staying DISTINCT in the data — the difference matters to a reader, not the renderer");

  ok(JSON.stringify(RD.pausedMilestoneIds(st, [{ id: 'M1' }, { id: 'M2' }, { id: 'M3' }])) === '["M2"]',
    "the paused ids are reported for a count the UI can show");
  ok(RD.pausedMilestoneIds(st, []).length === 0, "an empty list yields none");

  // setMilestoneState must not mutate what it was given
  const before = [{ milestoneId: 'X', status: 'paused' }];
  const after = RD.setMilestoneState(before, 'Y', 'paused', 1, '');
  ok(before.length === 1 && after.length === 2, "the caller's array is not mutated in place");
})();

// ---------- the three consumers agree ----------
(function () {
  const html = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/planning_app.html', 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', virtualConsole: new VirtualConsole(),
    url: 'https://x.test/?token=t&tab=gantt', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {};
      w.fetch = () => Promise.reject(new Error('no net'));
      w.cytoscape = function () { return { on() {}, ready(cb) { try { cb && cb(); } catch (e) {} }, fit() {}, resize() {},
        destroy() {}, getElementById() { return { length: 0 }; }, zoom() { return 1; }, width() { return 800; },
        height() { return 560; }, layout() { return { run() {} }; }, $() { return { unselect() {} }; } }; };
    }
  });

  setTimeout(() => {
    const w = dom.window, d = w.document;
    try {
      const day = (iso) => w.eval('isoToDay("' + iso + '")');
      /* FAR is the only thing reaching 2027. Pause it and every consumer must forget 2027 together. */
      const plan = (state) => w.eval(`portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],
        models:[],kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[],objectives:[],
        initiatives:[{id:"I",name:"I",divisionId:"D",plannedStart:${day('2026-01-01')},plannedEnd:${day('2026-12-31')}}],
        milestones:[
          {id:"NEAR",name:"Near",initiativeId:"I",plannedStart:${day('2026-02-01')},plannedEnd:${day('2026-03-01')},plannedDate:${day('2026-03-01')}},
          {id:"FAR",name:"Far",initiativeId:"I",plannedStart:${day('2027-02-01')},plannedEnd:${day('2027-03-01')},plannedDate:${day('2027-03-01')}}
        ],
        milestoneState:${JSON.stringify(state)}};
        ganttQtrZoom=false; ganttQuarters=[]; ganttShowPaused=false; renderGantt();`);

      plan([]);
      const yrsLive = JSON.parse(w.eval('JSON.stringify(ganttGridYears())'));
      ok(yrsLive.indexOf(2027) >= 0, "a live milestone in 2027 puts 2027 in the year grid (" + yrsLive.join(',') + ")");
      ok(d.querySelectorAll('[data-lineage*="FAR"]').length > 0, "…and draws its row");

      plan([{ milestoneId: 'FAR', status: 'paused', day: 1, note: '' }]);
      const yrsPaused = JSON.parse(w.eval('JSON.stringify(ganttGridYears())'));
      ok(yrsPaused.indexOf(2027) < 0,
        "pausing it drops 2027 from the year grid — no year offered for work that is not drawn (" + yrsPaused.join(',') + ")");
      ok(d.querySelectorAll('[data-lineage*="FAR"]').length === 0, "…and the row is hidden by default");
      ok(d.querySelectorAll('[data-lineage*="NEAR"]').length > 0, "…while the live milestone is untouched");

      // it is HIDDEN, not lost: the count shows regardless
      const bar = d.getElementById('ganttLevelBar');
      ok(/1 paused/.test(bar.textContent), "the toolbar counts it, so a hidden row is not a forgotten one");
      const btn = bar.querySelector('[data-gview="paused"]');
      ok(!!btn, "…with a control to bring it back");

      btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(w.eval('ganttShowPaused') === true, "the toggle turns showing on");
      ok(d.querySelectorAll('[data-lineage*="FAR"]').length > 0, "…and the paused milestone reappears");

      // shown, it keeps its date as a ghost
      const ghosts = d.querySelectorAll('.gdia.ghost');
      ok(ghosts.length > 0, "…rendered as a ghost marker at the date that was planned");
      const titles = [...ghosts].map(g => g.getAttribute('title') || '').join(' | ');
      ok(/paused/.test(titles), "…saying so on hover (" + titles.slice(0, 60) + ")");
      ok(/2027/.test(titles), "…and naming the date that was intended, so the plan is still legible");

      // a paused milestone must not drag its initiative's dates even while shown
      w.eval('ganttShowPaused=true; renderGantt();');
      const yrsShown = JSON.parse(w.eval('JSON.stringify(ganttGridYears())'));
      ok(yrsShown.indexOf(2027) < 0,
        "showing paused milestones does not put their years back in the grid — they are visible, not counted");

      // deprioritized behaves the same on the chart
      plan([{ milestoneId: 'FAR', status: 'deprioritized', day: 1, note: '' }]);
      ok(d.querySelectorAll('[data-lineage*="FAR"]').length === 0, "a DEPRIORITIZED milestone is hidden the same way");
      ok(/1 paused/.test(d.getElementById('ganttLevelBar').textContent), "…and counted the same way");

      /* Not asserted here: whether a paused milestone drags an initiative's derived START. An initiative
         with no dates of its own does not render a bar from milestones alone, and one WITH dates ignores
         its children entirely — so there is no configuration in this app where the exclusion is
         observable. The exclusion is still applied (activeMilestones in the geometry branch), but it is
         defence, and claiming a test for it would be claiming coverage that does not exist. */

      /* ---- the CONTROL ----
         The engine, the rollup exclusions, the toggle and the ghost were all built before anything could
         actually pause a milestone: the feature was unreachable from the UI. Assert the control exists
         and works, not just that the model does. */
      w.eval(`persistPortfolio=function(){};
        portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],kpis:[],
        kpiDefs:[],kpiUpdates:[],catchupPlans:[],objectives:[],
        initiatives:[{id:"I",name:"I",divisionId:"D",plannedStart:${day('2026-01-01')},plannedEnd:${day('2026-12-31')}}],
        milestones:[{id:"M1",name:"Pilot build",initiativeId:"I",plannedDate:${day('2026-06-30')}}],
        milestoneState:[]}; renderAll(); openEditor("M1","milestone");`);
      const ed = () => d.getElementById('pfModalBody');
      ok(!!ed(), "the milestone editor opens");
      ok(!!ed().querySelector('[data-mspause="paused"]'), "…offering a Pause control");
      ok(!!ed().querySelector('[data-mspause="deprioritized"]'), "…and a Deprioritize control");
      ok(!!ed().querySelector('[data-mspnote]'), "…with somewhere to say why");

      const why = ed().querySelector('[data-mspnote]'); why.value = 'vendor slipped';
      ed().querySelector('[data-mspause="paused"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(w.eval('RD.milestonePaused(portfolio.milestoneState,"M1")') === true, "clicking Pause actually pauses it");
      ok(w.eval('JSON.parse(JSON.stringify(RD.milestoneState(portfolio.milestoneState,"M1"))).note') === 'vendor slipped',
        "…recording the reason given");
      ok(w.eval('RD.milestoneState(portfolio.milestoneState,"M1").day') != null, "…and when");

      ok(!!ed().querySelector('[data-msresume]'), "the editor then offers Resume instead");
      ok(!ed().querySelector('[data-mspause="paused"]'), "…and no longer offers Pause");
      ed().querySelector('[data-msresume]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(w.eval('RD.milestonePaused(portfolio.milestoneState,"M1")') === false, "clicking Resume un-pauses it");
      ok(w.eval('portfolio.milestoneState.length') === 2, "…keeping the pause in the history rather than deleting it");

      /* ---- the milestones TABLE ----
         A paused milestone was still being given a performance band there — "off track" for work nobody
         is doing, which states something false. The state takes precedence. */
      w.eval(`portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],kpis:[],
        kpiDefs:[],kpiUpdates:[],catchupPlans:[],objectives:[],
        initiatives:[{id:"I",name:"I",divisionId:"D",plannedStart:${day('2026-01-01')},plannedEnd:${day('2026-12-31')}}],
        milestones:[{id:"LIVE",name:"Live one",initiativeId:"I",plannedDate:${day('2026-06-30')}},
                    {id:"SHELF",name:"Shelved",initiativeId:"I",plannedDate:${day('2026-08-31')}}],
        milestoneState:[{milestoneId:"SHELF",status:"paused",day:${day('2026-05-01')},note:"vendor slipped"}]};
        renderMilestones();`);
      /* Match by the row's edit id, not its rendered name: the name cell is wrapped in <b> and the
         lookup should not depend on markup that can change. */
      const msRow = (id) => d.querySelector('.ms-row[data-msedit="' + id + '"]');

      ok(!!msRow('LIVE') && !!msRow('SHELF'), "both milestones appear in the table — pausing hides nothing here");
      const shelfBand = msRow('SHELF').querySelector('.band');
      ok(/paused/.test(shelfBand.textContent), "the paused one reads 'paused' in the Status column (" + shelfBand.textContent + ")");
      ok(shelfBand.classList.contains('ms-paused'),
        "…styled as a STATE, not as one of the performance bands");
      ok(!/off track|at risk|on track|no band/.test(shelfBand.textContent),
        "…and is not given a score band, which would claim something false about work nobody is doing");
      const ttl = shelfBand.getAttribute('title') || '';
      ok(/2026-05-01/.test(ttl), "…with when it was paused on hover");
      ok(/vendor slipped/.test(ttl), "…and why (" + ttl.slice(0, 48) + ")");
      ok(msRow('SHELF').classList.contains('ms-rowpaused'), "…and the row reads as inactive");

      // a live milestone is untouched
      ok(!msRow('LIVE').classList.contains('ms-rowpaused'), "a live milestone's row is not dimmed");
      ok(!msRow('LIVE').querySelector('.band.ms-paused'), "…and keeps its ordinary band");

      // deprioritized says so, rather than being flattened into 'paused'
      w.eval(`portfolio.milestoneState=[{milestoneId:"SHELF",status:"deprioritized",day:${day('2026-05-01')},note:""}]; renderMilestones();`);
      ok(/deprioritized/.test(msRow('SHELF').querySelector('.band').textContent),
        "a deprioritized milestone says DEPRIORITIZED, not paused — the distinction is why both words exist");

      // achieved outranks the state: something finished before being shelved is finished
      w.eval(`portfolio.milestones[1].completedDate=${day('2026-04-01')};
        portfolio.milestoneState=[{milestoneId:"SHELF",status:"paused",day:${day('2026-05-01')},note:""}]; renderMilestones();`);
      ok(/achieved/.test(((msRow('SHELF') || {}).querySelector ? msRow('SHELF').querySelector('.band').textContent : '')),
        "a milestone completed before being paused still reads as achieved");

      // resuming restores everything
      plan([{ milestoneId: 'FAR', status: 'paused', day: 1, note: '' },
            { milestoneId: 'FAR', status: 'active', day: 2, note: '' }]);
      ok(d.querySelectorAll('[data-lineage*="FAR"]').length > 0, "resuming brings the row back");
      ok(JSON.parse(w.eval('JSON.stringify(ganttGridYears())')).indexOf(2027) >= 0, "…and its year with it");
      ok(!/paused/.test(d.getElementById('ganttLevelBar').textContent), "…with nothing left to count");
    } catch (e) {
      ok(false, 'milestone pause flow threw: ' + (e && e.message));
    }

    out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
    const fails = out.filter(x => x.startsWith('FAIL'));
    console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} milestone-pause assertions green`);
    process.exit(fails.length ? 1 : 0);
  }, 1200);
})();
