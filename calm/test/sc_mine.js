/* Scenario test for My Projects (apps/mine).
     node test/sc_mine.js out/Mine-A.dc.html
   1. The model on its own: who is who on the roster (MP-1), which divisions a leader leads (against
      PULL.isLeader), this quarter and later, the Key results diagram's measures, when a reading is due.
   2. Who sees what, clicked like a person: an IC (Priya: her objective in full, only her experiments in Toru's),
      a lead (Toru: Owned Projects and Team Projects, remembered), the CTO (every division), a lead of another
      division (Erin), business objectives (Sam), an IC who only holds tiles (Ken), signed out.
   3. The rows against the engine: objective, project and key result scores, the Key results and Stage-gates
      diagrams, statuses from the review table's rules.
   4. Check-ins: a target's reading (the gate passes on its own and the row stays in view), a statistical KPI's
      readings, a percent key result, a milestone step, an experiment's key reads (unlinked and linked), each
      with its errors, Escape and blanks; read-only.
   5. The toolbar (Needs a check-in, quarter, filter, Expand all, Collapse to objectives, the carets), the
      objective links (Execution, Sales; the hand-off), Settings, and restoring the sample data.
   6. The panel above the tree (round 5, proposal E): the scorecard and the timeline against the engine for a
      lead, the CTO and an IC; what filters the tree (a dot, a timeline row, Show them below, Show it); folding
      (by hand, and past 12 objectives); the quarters (upcoming, all, ended only); nothing in full; a reading
      posted; read-only; nothing in view; the view and the quarter beside the title.
   7. The CEO's and CTO's Team Projects (October 22): the R&D divisions for the CTO and the business divisions for
      the CEO by default; each one's own choice in Settings (R&D, business, every division, or picked divisions),
      kept per person in this browser; the lede's link to it; no business division yet; leads and ICs without it;
      a stored choice that no longer fits. The steps that need the CTO to see every division choose that first.
   8. Pace on the quarter's clock (October 22): the mark is the time elapsed; the shading, the dots, the mean's
      status, Objectives and Key results, and the timeline's colors by pace (RD.keyResultPaceBand), worked out here
      at week 2, week 9, week 1, after the quarter, at the rule's edges and where a zone is too thin to see; the
      tree keeps the score bands; a quarter the suite can't read keeps the bands.
   9. Group by and Sort by (October 22): MINE.arrange on its own; the Group and sort button after the quarter menu
      and its popover (round 6's A: a click outside, the button, Close and Escape shut it; changes apply at once and
      it stays open; tinted and named with the arrangement while it isn't the default; the arrangement in words;
      Back to the default; no button with nothing in view); Division then Project in the timeline and the tree
      alike (rows, folds, filters, depth, flags); unit, product, model and quarter as Planning reads them; owners
      (each objective once); every sort, inside groups and of the groups; no levels; folding past 12 objectives;
      remembered in this browser, and a stored arrangement that no longer fits. */
const fs = require('fs');
const path = require('path');
const { Sim, done, textOf, load } = require('./dc');
const RD = require(require('./engine_path'));

const file = process.argv[2] || 'out/Mine-A.dc.html';
const EL = 'EXEC-DIV-EL', BD = 'BIZ-DIV-BD';
const LOCK = 'OBJ-EL-2026Q4-02', QUAL = 'OBJ-EL-2026Q4-01', CUT = 'OBJ-EL-2027Q1-01', PILOT = 'OBJ-BD-2026Q4-01', HUB = 'OBJ-BD-2027Q1-01';
const AST = 'OBJ-FC-2026Q4-02', HP6 = 'OBJ-FC-2026Q3-01';
const ICR = 'KPI-EL-2026Q4-02-3-1', VOLT = 'KPI-EL-2026Q4-01-1-1', HFR = 'KPI-EL-2026Q4-01-1-2', DECAY = 'KPI-EL-2026Q4-01-5-1', DECAY1K = 'KPI-EL-2026Q4-01-6-1', XOVER = 'KPI-EL-2026Q4-01-3-1', H2500 = 'KPI-EL-2026Q4-01-5-2';

/* Execution and Sales beside it (test/run_all.js builds them all): loaded first, since a board's first load
   installs fresh globals, so the hand-off written here reaches them */
const MAIN = path.join(path.dirname(file), 'Main.dc.html'), SALESB = path.join(path.dirname(file), 'Sales-A.dc.html');
const HAS_APPS = fs.existsSync(MAIN) && fs.existsSync(SALESB);
if (HAS_APPS) { load(MAIN); load(SALESB); }

let s;
/* the localStorage the page reads (the driver's stub keeps nothing); each fresh page starts with it empty unless
   `keep` (a second page in the same browser) */
const store = {};
const useStore = () => { global.window.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }; };
/* a fresh page signed in as `who` ('' signs out) */
const fresh = (who, keep) => {
  if (!keep) Object.keys(store).forEach((k) => { delete store[k]; });
  s = new Sim(file);
  useStore();
  if (who !== undefined) s.c.setViewer(who);
  s.c.setState({ toasts: [] });
  return s.render();
};
const rows = () => s.vals.sh.rows.filter((r) => r.isRow);
const row = (k) => rows().find((r) => r.k === k) || null;
const keys = () => rows().map((r) => r.k);
const label = (r) => (r.tid ? r.tid + ' ' : '') + (r.isGroup ? r.gname : r.name);
const toasts = () => (s.c.state.toasts || []).map((t) => t.text);
const docOf = (k) => s.c.D.docs[k];
const P = () => s.c.D.portfolio;
const emOf = (divId) => RD.withPortfolio(P(), { [divId]: docOf((divId === 'DIV-BD' || divId === 'DIV-PT' ? 'BIZ-' : 'EXEC-') + divId) });
const emAll = () => { const m = {}; Object.keys(s.c.D.docs).forEach((k) => { m[k.replace(/^(EXEC|BIZ)-/, '')] = s.c.D.docs[k]; }); return RD.withPortfolio(P(), m); };
const objIds = () => rows().filter((r) => /k-obj/.test(r.cls)).map((r) => r.k.slice(2));
const kpi = (id) => docOf(EL).kpis.find((k) => k.id === id);
const pool = () => docOf(EL).kpis.concat(P().kpis || []);
const handoff = () => { try { return JSON.parse(global.window.sessionStorage.getItem('celadyne-calm-open') || 'null'); } catch (e) { return null; } };
/* the CEO's or CTO's Team Projects divisions, chosen in Settings as a person does it ('~Every division', ...) */
const teamScope = (q) => { s.click('Settings'); s.check(q, true, { within: 'team-scope' }); s.click('Close'); return s; };

/* ================================================================ 1. the model on its own */
fresh('priya@celadyne.com');
const M = s.ns.MINE;
s.step('MP-1: owners and assignees to roster people', () => {
  const D = s.c.D;
  s.eq('an email as is', M.person(D, 'Priya@Celadyne.com'), 'priya@celadyne.com');
  s.eq('a full name', M.person(D, 'Priya Natarajan'), 'priya@celadyne.com');
  s.eq('the email name', M.person(D, 'toru'), 'toru@celadyne.com');
  s.eq('a first name', M.person(D, 'Erin'), 'erin@celadyne.com');
  s.eq('initials (experiments store them)', M.person(D, 'PN'), 'priya@celadyne.com');
  s.eq('initials, lower case', M.person(D, 'th'), 'toru@celadyne.com');
  s.eq('nobody', M.person(D, 'Zed Q'), '');
  s.eq('blank', M.person(D, ''), '');
  D.roster.users.push({ email: 'paul@celadyne.com', name: 'Paul Nash', orgRole: 'ic', leadDivisions: [], disabled: false });
  s.eq('initials two people share name nobody', M.person(D, 'PN'), '');
  s.eq('their first names still tell them apart', M.person(D, 'Paul'), 'paul@celadyne.com');
  D.roster.users.pop();
  D.roster.users.push({ email: 'pat@celadyne.com', name: 'Priya Smith', orgRole: 'ic', leadDivisions: [], disabled: true });
  s.eq('a disabled person is not counted', M.person(D, 'Priya'), 'priya@celadyne.com');
  D.roster.users.pop();
});
s.step('the divisions a person leads agree with PULL.isLeader', () => {
  const D = s.c.D;
  const divs = P().divisions.map((d) => d.id);
  let checked = 0, same = 0;
  D.roster.users.filter((u) => !u.disabled).forEach((u) => {
    s.c.setViewer(u.email);
    const mine = M.leads(D, u.email);
    divs.forEach((d) => { checked++; if ((mine.indexOf(d) >= 0) === s.ns.PULL.isLeader(s.c, d)) same++; });
  });
  s.eq('every person and division', same, checked);
  s.eq('Toru leads Electrolyzer', M.leads(D, 'toru@celadyne.com'), ['DIV-EL']);
  s.eq('the CTO leads every division', M.leads(D, 'corey@celadyne.com').length, divs.length);
  s.eq('an IC leads none', M.leads(D, 'priya@celadyne.com'), []);
  const toru = D.roster.users.find((u) => u.email === 'toru@celadyne.com');
  toru.leadOf = ['Fuel Cell'];
  s.ok(M.leads(D, 'toru@celadyne.com').indexOf('DIV-FC') >= 0, 'a legacy leadOf naming a division counts');
  delete toru.leadOf;
  s.c.setViewer('priya@celadyne.com');
});
s.step('this quarter and later, every quarter, one quarter', () => {
  const D = s.c.D;
  const hp6 = P().objectives.find((o) => o.id === HP6), lock = P().objectives.find((o) => o.id === LOCK), cut = P().objectives.find((o) => o.id === CUT);
  s.eq('an achieved Q3 objective is behind us', M.inWhen(D, hp6, docOf('EXEC-DIV-FC'), ''), false);
  s.eq('every quarter shows it', M.inWhen(D, hp6, docOf('EXEC-DIV-FC'), '*'), true);
  s.eq('so does its quarter', M.inWhen(D, hp6, docOf('EXEC-DIV-FC'), '2026Q3'), true);
  s.eq('this quarter', M.inWhen(D, lock, docOf(EL), ''), true);
  s.eq('next quarter', M.inWhen(D, cut, docOf(EL), ''), true);
  s.eq('another quarter', M.inWhen(D, cut, docOf(EL), '2026Q4'), false);
  /* a Q3 objective still running (planned end moved out) and not ended stays in view */
  const old = { id: 'OBJ-X', quarter: '2026Q3', plannedStart: D.today - 90, plannedEnd: D.today + 5 };
  s.eq('a late objective still open stays', M.inWhen(D, old, docOf(EL), ''), true);
  s.eq('ended, it goes', M.inWhen(D, old, { objectiveState: [{ objectiveId: 'OBJ-X', status: 'abandoned', endedDay: D.today }] }, ''), false);
});
s.step('the Key results diagram counts every measure like a KPI', () => {
  const D = s.c.D;
  const tag = (kr, i, list) => s.ns.KR.tag({ doc: docOf(EL) }, kr.id);
  const lock = M.measures(docOf(EL), LOCK, pool(), emOf('DIV-EL'), tag);
  s.eq('Lock Tera: KR1 (percent) and KR-M1’s 3 steps', lock.terms, ['KR1', 'KR-M1’s 3 steps']);
  const t = M.tally(lock.parts);
  s.eq('1 off track, 1 in progress, 1 not started, 1 done', t.text, '1 off track, 1 in progress, 1 not started, 1 done');
  s.eq('segments worst first, in progress its own', t.segs.map((x) => x.tone + x.n), ['bad1', 'info1', 'none1', 'done1']);
  const q = M.measures(docOf(EL), QUAL, pool(), emOf('DIV-EL'), tag);
  s.eq('Qualify: its 3 KPIs as one term, then KR2', q.terms, ['3 KPIs', 'KR2']);
  s.eq('Qualify: 1 near, 2 on track, 1 met', M.tally(q.parts).text, '1 near, 2 on track, 1 met');
  s.eq('two KPIs still sampling', q.sampling, 2);
  /* the KPI words are the KPI table's (statusOf): each part against the engine's score parts */
  const kk = pool().filter((k) => k.objectiveId === QUAL && k.hostType === 'keyResult');
  s.eq('KPI words', kk.map((k) => M.kpiWord(RD.kpiScoreParts(k, pool(), emOf('DIV-EL')))), ['On track', 'Near', 'Met']);
  s.eq('a percent key result by its band', M.bandOf(60), { tone: 'bad', word: 'Off track' });
  s.eq('no score yet', M.bandOf(null), { tone: 'none', word: 'Not started' });
  s.eq('a step by its state', [0, 40, 100].map((c) => M.stepOf({ completion: c }).word), ['Not started', 'In progress', 'Done']);
  void D;
});
s.step('when a reading is due', () => {
  const D = s.c.D, em = emOf('DIV-EL'), td = D.today, doc = docOf(EL);
  const lab = (g) => s.ns.GATES.label(doc, g.id);
  const icr = M.due(kpi(ICR), pool(), em, doc, td, lab);
  s.eq('an overdue gate’s unmet target', icr && icr.tone, 'bad');
  s.eq('says which gate and how late', icr && icr.text, 'Reading due: SG-A1 is 5 days overdue and its target isn’t met');
  s.eq('a statistical KPI part way through its sample', M.due(kpi(VOLT), pool(), em, doc, td, lab), { tone: 'warn', text: '6 more samples due' });
  s.eq('one with no readings yet waits for its work', M.due(kpi(DECAY1K), pool(), em, doc, td, lab), null);
  s.eq('a met target', M.due(kpi(H2500), pool(), em, doc, td, lab), null);
  s.eq('a demonstration KPI', M.due(kpi(XOVER), pool(), em, doc, td, lab), null);
  s.eq('a pulled KPI takes no readings', M.due(Object.assign({}, kpi(VOLT), { pull: { each: 'objective' } }), pool(), em, doc, td, lab), null);
  /* the sample filled: nothing more is due */
  const last = doc.kpiUpdates.filter((u) => u.kpiId === VOLT).slice(-1)[0];
  const p0 = RD.kpiScoreParts(kpi(VOLT), pool(), emOf('DIV-EL'));
  for (let i = p0.n; i < p0.expected; i++) doc.kpiUpdates.push({ id: 'UPD-T-' + i, kpiId: VOLT, value: 1.8, timestamp: last.timestamp + 1000 * (i + 1), batch: last.batch, by: 'toru@celadyne.com' });
  const p1 = RD.kpiScoreParts(kpi(VOLT), pool(), emOf('DIV-EL'));
  s.ok(p1.expected > 0 && p1.n === p1.expected, 'the sample is complete');
  s.eq('a complete sample is not due', M.due(kpi(VOLT), pool(), emOf('DIV-EL'), doc, td, lab), null);
});

/* ================================================================ 2. who sees what */
s.step('an IC: her objective in full, only her experiments in Toru’s', () => {
  fresh('priya@celadyne.com');
  s.eq('no view switch for an IC', s.vals.sh.views.show, false);
  s.expect('My projects');
  s.eq('the lede', s.vals.sh.lede, '1 project: the objective you own, and 3 experiments you run in Toru’s objective. Click a value to update it.');
  s.eq('the objectives shown', objIds().sort(), [QUAL, LOCK].sort());
  const q = row('o:' + QUAL);
  s.eq('Toru’s, just your experiments', q.sub, 'Toru’s, Q4 2026. Just your 3 experiments');
  s.ok(!row('g:' + QUAL + ':kr') && !row('g:' + QUAL + ':gate') && !row('g:' + QUAL + ':risk'), 'his key results, gates and risks stay out');
  const ex = row('g:' + QUAL + ':exp');
  s.eq('her 3 experiments', ex && ex.gcount, '3');
  s.eq('open: they are what is hers here', ex && ex.caretExp, 'true');
  s.eq('caption', ex && ex.cap, 'Your 3 experiments, in Crossover margin at 30 bar. Toru runs 4 more');
  s.eq('experiment rows', rows().filter((r) => r.k.indexOf('x:' + QUAL + ':') === 0).map(label), ['EXP-1 Crossover at 30 bar, first build', 'EXP-2 Crossover at 30 bar after recalibrating the GC', 'EXP-3 Add a recombination layer and repeat the hold']);
  const e1 = rows().find((r) => r.tid === 'EXP-1' && r.k.indexOf(QUAL) > 0);
  s.eq('EXP-1 complete, inconclusive', [e1.stWord, e1.pTxt], ['Complete', 'Inconclusive']);
  s.ok(/drifted 0\.3%/.test(e1.cap) && /Next: EXP-2/.test(e1.cap), 'its note and what came next');
  const e2 = rows().find((r) => r.tid === 'EXP-2' && r.k.indexOf(QUAL) > 0);
  s.eq('EXP-2 in progress, matched', [e2.stWord, e2.pTxt], ['In progress', 'Matched: Margin holds']);
  s.eq('measured and ready to conclude', e2.cap, '2 of 2 key reads measured. Ready to conclude');
  s.eq('its key reads open under it', rows().filter((r) => r.k.indexOf('r:' + QUAL + ':') === 0).length, 2);
  const e3 = rows().find((r) => r.tid === 'EXP-3' && r.k.indexOf(QUAL) > 0);
  s.eq('EXP-3 waits on EXP-2', [e3.stWord, e3.cap], ['Planned', 'Runs only if EXP-2 concludes Margin erodes over the hold']);
  s.ok(e3.owners.length === 1 && e3.owners[0].ini === 'PN', 'her initials in the owner column');
  s.ok(!!row('g:' + LOCK + ':kr') && !!row('g:' + LOCK + ':gate') && !!row('g:' + LOCK + ':tile'), 'Lock Tera in full');
  s.eq('Lock Tera is hers and Toru’s', row('o:' + LOCK).sub, 'You and Toru, Q4 2026');
  s.ok(!keys().some((k) => k.indexOf(CUT) >= 0), 'Cut stack cost is Toru’s alone');
  s.eq('one reading due', s.vals.sh.due.n, '1');
  const icr = row('k:' + LOCK + ':' + ICR);
  s.ok(icr && icr.hasFlag && /SG-A1 is 5 days overdue/.test(icr.flagTitle), 'the flag says why');
  s.eq('the kanban caption counts hers', row('g:' + LOCK + ':tile').cap, 'Component lock board. 2 tiles are yours');
  s.clean('IC');
});
s.step('a lead: Owned Projects, Team Projects, remembered', () => {
  fresh('toru@celadyne.com');
  s.eq('the switch', s.vals.sh.views.opts.map((o) => o.label + ':' + o.on), ['Owned Projects:true', 'Team Projects:false']);
  s.expect('Owned Projects');
  s.eq('his three objectives', objIds().sort(), [QUAL, LOCK, CUT].sort());
  s.eq('the lede', s.vals.sh.lede, '2 projects: the 3 objectives you own. Click a value to update it.');
  s.eq('four readings due', s.vals.sh.due.n, '4');
  s.eq('Qualify is his, in full', row('o:' + QUAL).sub, 'Yours, Q4 2026');
  s.eq('his experiments group stays shut', row('g:' + QUAL + ':exp').caretExp, 'false');
  s.eq('and says whose trees', row('g:' + QUAL + ':exp').cap, '2 logic trees, 1 is Priya’s. Your EXP-2 is trending toward Compression was the cause');
  s.eq('kanban', row('g:' + LOCK + ':tile').cap, 'Component lock board. 4 tiles are yours');
  /* Priya's own objective in his division: Team Projects only */
  P().objectives.push({ id: 'OBJ-EL-2026Q4-09', divisionId: 'DIV-EL', initiativeId: 'INIT-EL-02', quarter: '2026Q4', statement: 'Screen second-source titanium PTL suppliers', owner: ['priya@celadyne.com'], plannedStart: s.c.D.today - 12, plannedEnd: s.c.D.today + 66, milestoneIds: [], order: 4 });
  s.render();
  s.ok(objIds().indexOf('OBJ-EL-2026Q4-09') < 0, 'not in Owned Projects');
  s.eq('a project with another person’s objective says how many are his', row('p:INIT-EL-02').cap, '2 objectives: 1 not started, 1 no score yet. 1 is yours');
  s.click('Team Projects');
  s.eq('Team Projects on', s.vals.sh.views.opts.map((o) => o.on), ['false', 'true']);
  s.eq('remembered in this browser', store.rd_mine_view, 'team');
  s.ok(objIds().indexOf('OBJ-EL-2026Q4-09') >= 0, 'every objective in Electrolyzer');
  s.eq('as Priya’s', row('o:OBJ-EL-2026Q4-09').sub, 'Priya’s, Q4 2026');
  s.eq('the team lede', s.vals.sh.lede, 'Electrolyzer, the team you lead: 2 projects and 4 objectives. Click a value to update it.');
  s.ok(!/is yours/.test(row('p:INIT-EL-02').cap), 'Team Projects doesn’t count what is his');
  s.expect('Team Projects');
  /* a new page in the same browser opens on the remembered view */
  fresh('toru@celadyne.com', true);
  s.eq('a fresh page opens on Team Projects', s.vals.sh.views.opts.map((o) => o.on), ['false', 'true']);
  s.click('Owned Projects');
  s.eq('back to Owned Projects', store.rd_mine_view, 'owned');
  s.clean('lead');
});
s.step('the CTO: the R&D divisions, or every division; Owned until nothing is his', () => {
  fresh('corey@celadyne.com');
  s.eq('Owned first: he holds a tile in Sam’s objective', s.vals.sh.views.opts.map((o) => o.on), ['true', 'false']);
  s.eq('only that objective', objIds(), [PILOT]);
  const g = row('g:' + PILOT + ':tile');
  s.eq('his tile, the group open', [g.gcount, g.caretExp, g.cap], ['1', 'true', 'Your 1 tile on the Pilot pipeline board']);
  s.click('Team Projects');
  s.eq('the R&D divisions, his default', s.vals.sh.lede, 'R&D divisions: 4 projects and 7 objectives. Click a value to update it.');
  s.ok(objIds().every((id) => ['DIV-FC', 'DIV-EL'].indexOf(P().objectives.find((o) => o.id === id).divisionId) >= 0), 'no business objective');
  teamScope('~Every division');
  s.eq('every division, once he chooses it', s.vals.sh.lede, 'Every division: 5 projects and 9 objectives. Click a value to update it.');
  const ids = objIds();
  s.ok(['DIV-FC', 'DIV-EL', 'DIV-BD'].every((d) => P().objectives.some((o) => o.divisionId === d && ids.indexOf(o.id) >= 0)), 'R&D and business');
  /* nothing his any more: a fresh page opens on Team Projects */
  fresh('corey@celadyne.com');
  docOf(BD).boards.forEach((b) => (b.tiles || []).forEach((t) => { if (t.assignee === 'corey@celadyne.com') t.assignee = 'sam@celadyne.com'; }));
  s.render();
  s.eq('then Team Projects', s.vals.sh.views.opts.map((o) => o.on), ['false', 'true']);
  s.clean('CTO');
});
s.step('a lead of another division: Maya’s objective in Team Projects only', () => {
  fresh('erin@celadyne.com');
  s.ok(objIds().indexOf(AST) < 0, 'Root-cause AST degradation is Maya’s alone');
  s.ok(objIds().indexOf('OBJ-FC-2026Q4-03') >= 0, 'the one they share is hers');
  s.ok(objIds().indexOf(HP6) < 0, 'her achieved Q3 objective is behind us');
  s.eq('quarters offered', s.vals.sh.qsel.opts.map((o) => o.label), ['This quarter and later', 'All quarters', 'Q3 2026', 'Q4 2026', 'Q1 2027']);
  s.type('Quarter', '*');
  const hp6 = row('o:' + HP6);
  s.ok(!!hp6, 'All quarters shows it');
  s.eq('as achieved, closed', [hp6.stWord, hp6.caretExp, hp6.hasScore], ['Achieved', 'false', false]);
  s.ok(/^Achieved Sep 25, 2026/.test(hp6.cap), 'how it ended');
  s.type('Quarter', '2026Q3');
  s.eq('one quarter', objIds(), [HP6]);
  s.type('Quarter', '');
  s.click('Team Projects');
  s.ok(objIds().indexOf(AST) >= 0, 'Team Projects has it');
  s.eq('as Maya’s', row('o:' + AST).sub, 'Maya’s, Q4 2026');
  s.clean('Erin');
});
s.step('business objectives open in Sales', () => {
  fresh('sam@celadyne.com');
  s.eq('his two', objIds(), [PILOT, HUB]);
  const o = row('o:' + PILOT);
  s.eq('the title is a link to Sales', [o.isLink, o.href, o.target], [true, 'Sales-A.dc.html', '']);
  s.click('~Close three utility pilot agreements', { tag: 'a' });
  s.eq('the hand-off opens it there', handoff(), { app: 'sales', objective: PILOT });
  const hub = row('o:' + HUB);
  s.eq('nothing planned yet', [hub.hasAct, hub.actText, hub.actHref], [true, 'Plan it in Sales', 'Sales-A.dc.html']);
  s.eq('not started: its start date', [hub.date, hub.dateSub, hub.stWord], ['Jan 4, 2027', 'Starts in 83 days', 'Not started']);
  s.click('Expand all');
  /* Sales has no Experiments tab since November 3: a business objective shows no experiments, and its stored
     logic tree (the pilot-offer tree) is left in its document */
  s.eq('no experiments under it, no Experiments group', [rows().filter((r) => r.k.indexOf('x:' + PILOT + ':') === 0).length, rows().filter((r) => r.isGroup && r.k.indexOf(PILOT) >= 0 && /^Experiments/.test(label(r))).length], [0, 0]);
  s.ok(!rows().some((r) => r.k.indexOf('r:' + PILOT + ':') === 0), 'no key reads either');
  s.ok(!!(s.c.D.docs['BIZ-DIV-BD'].etbTrees || {})[PILOT], 'the stored tree is still in the document');
  /* someone who runs one of its experiments but owns nothing there gets no business objective for it; an Execution
     experiment still counts (the pilot tree is a bare one-tree document, so its experiments sit on it directly) */
  const bag = s.c.D.docs['BIZ-DIV-BD'].etbTrees[PILOT];
  const exps = RD.etbTreesOf(bag).trees[0].experiments;
  const ex1 = exps[Object.keys(exps)[0]];
  const was = ex1.owner;
  ex1.owner = 'priya@celadyne.com';
  const sc = M.scope(s.c.D, 'priya@celadyne.com', 'owned', '*');
  s.eq('running a Sales experiment brings no business objective', sc.filter((e) => /^BIZ-/.test(e.docKey)).map((e) => e.o.id), []);
  s.ok(sc.some((e) => /^EXEC-/.test(e.docKey) && !e.full && e.exps.length > 0), 'running an Execution experiment still does');
  ex1.owner = was;
  s.clean('Sam');
});
s.step('an IC who holds tiles', () => {
  fresh('ken@celadyne.com');
  s.eq('the lede', s.vals.sh.lede, '1 project: 5 tiles you hold in Sam’s objective. Click a value to update it.');
  const g = row('g:' + PILOT + ':tile');
  s.eq('his tiles, open', [g.gcount, g.caretExp], ['5', 'true']);
  s.ok(rows().filter((r) => r.k.indexOf('i:' + PILOT + ':tile:') === 0).every((r) => r.owners.length === 1 && r.owners[0].ini === 'KA'), 'each his');
  s.clean('Ken');
});
s.step('three owners: the first, then +2 naming the rest', () => {
  fresh('priya@celadyne.com');
  P().objectives.find((o) => o.id === LOCK).owner = ['toru@celadyne.com', 'priya@celadyne.com', 'maya@celadyne.com'];
  s.render();
  const o = row('o:' + LOCK);
  s.eq('two fit the column', o.owners.map((x) => x.ini), ['TH', '+2']);
  s.eq('the second names the rest', o.owners[1].name, 'Priya Natarajan and Maya Okafor');
  s.eq('whose', o.sub, 'You, Toru and Maya, Q4 2026');
  s.clean('owners');
});
s.step('signed out', () => {
  fresh('');
  s.eq('no tree', s.vals.sh.hasTree, false);
  s.expect('Signed out of the Hub, so nothing here is yours. Choose who you are in Settings.');
  s.click('Open settings');
  s.ok(!!s.vals.sh.settings, 'Settings opens');
  s.clean('signed out');
});

/* ================================================================ 3. the rows against the engine */
s.step('scores and statuses against the engine', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  s.click('Expand all');
  const D = s.c.D;
  let n = 0;
  rows().filter((r) => /k-obj/.test(r.cls)).forEach((r) => {
    const o = P().objectives.find((x) => x.id === r.k.slice(2));
    const sc = RD.objectiveScore(o.id, emOf(o.divisionId));
    const end = RD.objectiveEndState(docOf((o.divisionId === 'DIV-BD' ? 'BIZ-' : 'EXEC-') + o.divisionId).objectiveState, o.id);
    s.eq('objective score ' + o.id, r.hasScore ? r.score : null, sc == null || end ? null : String(Math.round(sc)));
    const want = end ? (end.status === 'achieved' ? 'Achieved' : 'Abandoned') : sc == null ? (D.today < o.plannedStart ? 'Not started' : 'No score yet') : sc >= 80 ? 'On track' : sc >= 65 ? 'At risk' : 'Off track';
    s.eq('objective status ' + o.id, r.stWord, want);
    n++;
  });
  s.ok(n >= 9, 'every objective checked');
  rows().filter((r) => /k-proj/.test(r.cls) && r.k !== 'p:~' && r.hasScore).forEach((r) => {
    const id = r.k.slice(2);
    s.eq('project score ' + id, r.score, String(Math.round(RD.rollupInitiative(id, P(), emAll()))));
  });
  rows().filter((r) => r.k.indexOf(':kr:') > 0 && r.k[0] === 'i').forEach((r) => {
    const krId = r.k.split(':kr:')[1];
    const oid = r.k.split(':')[1];
    const o = P().objectives.find((x) => x.id === oid);
    const sc = RD.keyResultScore(krId, emOf(o.divisionId));
    s.eq('key result score ' + krId, r.hasScore ? r.score : null, sc == null ? null : String(Math.round(sc)));
    s.eq('key result status by its score ' + krId, r.stWord, sc == null ? 'Not started' : sc >= 80 ? 'On track' : sc >= 65 ? 'At risk' : 'Off track');
  });
  const lockGates = row('g:' + LOCK + ':gate');
  s.eq('gate health from the engine', lockGates.cap.indexOf('Gate health ' + Math.round(RD.objectiveGateReadiness(LOCK, emOf('DIV-EL'), D.today)) + '%'), 0);
  s.eq('Lock Tera gates', lockGates.cap, 'Gate health 33%: 1 of 3 gates passed, 1 overdue');
  s.eq('Qualify gates, two workstreams', row('g:' + QUAL + ':gate').cap, 'Gate health 0%, the weaker of 2 workstreams. 1 of 5 gates passed');
  s.eq('the Key results diagram, Lock Tera', [row('g:' + LOCK + ':kr').segs.map((x) => x.n + ':' + x.cls), row('g:' + LOCK + ':kr').cap],
    [['1:review-seg review-b-bad', '1:review-seg mine-b-info', '1:review-seg review-b-none', '1:review-seg review-b-done'], 'KR1 and KR-M1’s 3 steps: 1 off track, 1 in progress, 1 not started, 1 done']);
  s.eq('Qualify', row('g:' + QUAL + ':kr').cap, '3 KPIs and KR2: 1 near, 2 on track, 1 met. 2 KPIs still sampling');
  s.ok(!row('g:' + LOCK + ':kr').hasScore && !row('g:' + LOCK + ':gate').hasScore, 'groups carry no score');
  const lock = row('o:' + LOCK);
  s.eq('the objective caption', lock.cap, '24% of the time used. Forecast Nov 20, on schedule. Revised plan since Sep 22');
  s.eq('its tick at the share of time used', lock.tickStyle, 'left: 24%');
  s.eq('Qualify’s plan version', row('o:' + QUAL).cap, '15% of the time used. Forecast Dec 18, on schedule. Plan v2 since Oct 6');
  s.eq('Cut stack cost waits on Lock Tera', row('o:' + CUT).cap, 'Nothing planned yet. It can start Dec 4, after Lock Tera 25-30-R5 components plus 14 days');
  s.eq('a step’s words', ['Samples received and inspected', 'Contact resistance screening', '500 h corrosion soak'].map((nm) => { const r = rows().find((x) => x.name === nm); return r.stWord + ' ' + r.btnText; }), ['Done 100%', 'In progress 60%', 'Not started 0%']);
  s.clean('engine');
});

/* ================================================================ 4. check-ins */
s.step('stage-gates under their workstreams, each by due date', () => {
  fresh('toru@celadyne.com');
  const WA = 'g:' + QUAL + ':gate:ws:SGSET-EL-2026Q4-01-1', WB = 'g:' + QUAL + ':gate:ws:SGSET-EL-2026Q4-01-2';
  const under = (k) => { const rs = rows(), i = rs.findIndex((r) => r.k === k), pad = (r) => parseInt(String(r.padStyle).replace(/\D/g, ''), 10); const out = []; for (let j = i + 1; j < rs.length && pad(rs[j]) > pad(rs[i]); j++) if (pad(rs[j]) === pad(rs[i]) + 22) out.push(rs[j]); return out; };
  s.eq('two workstreams, as the Stage-gates tab letters them', under('g:' + QUAL + ':gate').map((r) => r.gname + ' ' + r.gcount), ['Workstream A: Durability 3', 'Workstream B: Teardown and analysis 2']);
  s.eq('A: its gates by due date', under(WA).map((r) => r.tid + ' ' + r.date), ['SG-A1 Sep 30', 'SG-A2 Nov 13', 'SG-A3 Dec 18']);
  s.eq('B: its gates by due date', under(WB).map((r) => r.tid + ' ' + r.date), ['SG-B1 Dec 4', 'SG-B2 Dec 15']);
  s.eq('A says how far it has got and what is next', row(WA).cap, 'Chained, 1 of 3 gates passed. Next: Durability screen, 500 h, 75% ready, Nov 13');
  s.eq('B', row(WB).cap, 'Independent, 0 of 2 gates passed. Next: Post-test teardown and SEM, Dec 4');
  s.eq('each with its own status bar', row(WA).segs.map((x) => x.n + ':' + x.cls), ['1:review-seg review-b-warn', '1:review-seg review-b-none', '1:review-seg review-b-done']);
  s.eq('Lock Tera’s one workstream', [row('g:' + LOCK + ':gate:ws:SGSET-EL-2026Q4-02-1').gname, row('g:' + LOCK + ':gate:ws:SGSET-EL-2026Q4-02-1').cap],
    ['Workstream A: Component lock', 'Chained, 1 of 3 gates passed, 1 overdue. Next: Second-source bipolar plate trial, 38% ready, Oct 8']);
  /* a gate moved earlier takes its place in time (and its label with it, as on the Stage-gates tab) */
  docOf(EL).stageGates.find((g) => g.name === '1,000 h endurance hold').plannedDate = s.c.D.today + 10;
  s.render();
  s.eq('re-ordered by date', under(WA).map((r) => r.tid + ' ' + r.name), ['SG-A1 Build and leak-test the stack', 'SG-A2 1,000 h endurance hold', 'SG-A3 Durability screen, 500 h']);
  s.type('Filter by name', 'teardown and analysis');
  s.eq('the filter finds a workstream by name, with its gates', rows().map(label).slice(-3), ['Workstream B: Teardown and analysis', 'SG-B1 Post-test teardown and SEM', 'SG-B2 Failure-mode review']);
  s.key('Filter by name', 'Escape');
  s.click('Collapse Workstream B: Teardown and analysis');
  s.eq('a workstream folds', under(WB).length, 0);
  s.clean('workstreams');
});
s.step('kanban tiles under their swimlanes', () => {
  fresh('toru@celadyne.com');
  s.click('Expand Kanban', { within: 'g:' + LOCK + ':tile' });
  const lanes = rows().filter((r) => r.k.indexOf('g:' + LOCK + ':tile:lane:') === 0);
  s.eq('the board’s swimlanes in its order, then No swimlane', lanes.map((r) => r.gname + ' ' + r.gcount), ['Stack hardware 4', 'Soft goods 2', 'No swimlane 1']);
  s.eq('each says its limit, deadline and what is his', lanes.map((r) => r.cap), ['21 days per stage, due Nov 20. 3 tiles are yours', '14 days per stage, due Nov 20. 1 tile is yours', 'Swimlane chosen at start']);
  const HW = 'g:' + LOCK + ':tile:lane:BRD-EL-LOCK:lane-hw';
  const i = rows().findIndex((r) => r.k === HW);
  s.eq('its tiles under it', rows().slice(i + 1, i + 5).map((r) => r.name), ['Bipolar plate, second source', 'End plates and compression', 'Porous transport layer', 'Current collectors']);
  s.eq('the Owner column names the person, so the row doesn’t', [row('i:' + LOCK + ':tile:' + rows()[i + 1].k.split(':tile:')[1]).hasSub, rows().find((r) => r.name === 'Stack tie rods').sub], [false, 'Unassigned']);
  /* Sales: a swimlane's finished tiles stay one row inside it */
  fresh('sam@celadyne.com');
  s.click('Expand Kanban', { within: 'g:' + PILOT + ':tile' });
  s.eq('three swimlanes', rows().filter((r) => r.k.indexOf('g:' + PILOT + ':tile:lane:') === 0).map((r) => r.gname + ' ' + r.gcount), ['Utilities 8', 'Industrial gas 4', 'Mobility 5']);
  const ut = rows().findIndex((r) => r.k === 'g:' + PILOT + ':tile:lane:BRD-BD-PIPE:lane-ut');
  s.eq('Utilities: its open tiles, then its finished ones', rows().slice(ut + 1, ut + 6).map((r) => r.name), ['Snake River Electric', 'Cascade Public Power', 'High Desert Co-op', 'Bonneville Rural Electric', '4 tiles in Closed']);
  /* someone else's objective: only your tiles, still by swimlane */
  fresh('ken@celadyne.com');
  const kl = rows().filter((r) => r.k.indexOf('g:' + PILOT + ':tile:lane:') === 0);
  s.eq('Ken’s 5 tiles in their swimlanes', kl.map((r) => r.gname + ' ' + r.gcount), ['Utilities 1', 'Industrial gas 2', 'Mobility 2']);
  s.eq('no “yours” count where everything shown is his', kl.map((r) => r.cap), ['14 days per stage, due Dec 18', '21 days per stage', '14 days per stage']);
  s.clean('swimlanes');
});
s.step('a target’s reading: posted, the gate passes, the row stays', () => {
  fresh('priya@celadyne.com');
  const W = { within: 'k:' + LOCK + ':' + ICR };
  const before = docOf(EL).kpiUpdates.length;
  s.click('Post a reading for Interfacial contact resistance', W);
  s.ok(row('k:' + LOCK + ':' + ICR).pKpiEd, 'the KPI table’s editor opens in the row');
  s.type('New value for Interfacial contact resistance', 'abc', W);
  s.key('New value for Interfacial contact resistance', 'Enter', W);
  s.expect('Use a number, like 1.85.');
  s.eq('nothing posted', docOf(EL).kpiUpdates.length, before);
  s.type('New value for Interfacial contact resistance', '9', W);
  s.key('New value for Interfacial contact resistance', 'Enter', W);
  const u = docOf(EL).kpiUpdates[docOf(EL).kpiUpdates.length - 1];
  s.eq('posted to the division’s document, by her', [docOf(EL).kpiUpdates.length, u.kpiId, u.value, u.by], [before + 1, ICR, 9, 'priya@celadyne.com']);
  s.ok(toasts().indexOf('Reading posted.') >= 0, 'Reading posted.');
  const g = docOf(EL).stageGates.find((x) => x.id === 'SG-EL-2026Q4-02-2');
  s.eq('SG-A1 passed on its own', [g.actualDate, g.completionMethod], [s.c.D.today, 'auto']);
  s.ok(toasts().some((t) => /SG-A1 .* passed: every target is met\./.test(t)), 'and says so');
  const r = row('k:' + LOCK + ':' + ICR);
  s.ok(!!r, 'the row stays in view though its gate is done');
  s.eq('met, no flag', [r.stWord, r.hasFlag], ['Met', false]);
  s.eq('no reading due now', s.vals.sh.due.n, '0');
  s.eq('the gate row says done', row('i:' + LOCK + ':gate:SG-EL-2026Q4-02-2').stWord, 'Done');
  s.clean('target');
});
s.step('a statistical KPI’s readings', () => {
  fresh('toru@celadyne.com');
  const W = { within: 'k:' + QUAL + ':' + VOLT };
  s.click('Readings for Cell voltage at 2 A/cm²', W);
  const d = s.vals.sh.rows.find((r) => r.isDrawer);
  s.ok(!!d && d.k === 'd:k:' + QUAL + ':' + VOLT, 'its readings open under the row');
  s.expect('Readings for Cell voltage at 2 A/cm²');
  const before = docOf(EL).kpiUpdates.filter((x) => x.kpiId === VOLT).length;
  s.type('New reading for Cell voltage at 2 A/cm²', 'x');
  s.click('Add reading');
  s.expect('Use a number, like 1.85.');
  s.type('New reading for Cell voltage at 2 A/cm²', '1.81');
  s.click('Add reading');
  const ups = docOf(EL).kpiUpdates.filter((x) => x.kpiId === VOLT);
  s.eq('one more reading in the sample', ups.length, before + 1);
  s.eq('in the current batch, by him', [ups[ups.length - 1].value, ups[ups.length - 1].by, !!ups[ups.length - 1].batch], [1.81, 'toru@celadyne.com', true]);
  s.ok(toasts().indexOf('Reading added.') >= 0, 'Reading added.');
  const pp = RD.kpiScoreParts(kpi(VOLT), pool(), emOf('DIV-EL'));
  s.eq('5 of 10 now, still due', row('k:' + QUAL + ':' + VOLT).flagTitle, (pp.expected - pp.n) + ' more samples due');
  s.click('Close readings');
  s.ok(!s.vals.sh.rows.some((r) => r.isDrawer), 'closed');
  s.clean('statistical');
});
s.step('a percent key result’s progress', () => {
  fresh('priya@celadyne.com');
  const kr = () => docOf(EL).keyResults.find((x) => x.id === 'KR-EL-2026Q4-02-1');
  s.click('Update KR1, % complete');
  s.ok(row('i:' + LOCK + ':kr:KR-EL-2026Q4-02-1').pMyEd, 'an inline editor');
  s.type('New value for KR1, in %', 'lots');
  s.key('New value for KR1, in %', 'Enter');
  s.expect('Use a number from 0 to 100, like 60.');
  s.type('New value for KR1, in %', '75');
  s.key('New value for KR1, in %', 'Enter');
  s.eq('saved', kr().progress, 75);
  s.ok(toasts().indexOf('KR1 set to 75%.') >= 0, 'KR1 set to 75%.');
  const r = row('i:' + LOCK + ':kr:KR-EL-2026Q4-02-1');
  s.eq('rescored by the engine', [r.score, r.stWord], [String(Math.round(RD.keyResultScore('KR-EL-2026Q4-02-1', emOf('DIV-EL')))), 'At risk']);
  s.eq('the diagram follows', row('g:' + LOCK + ':kr').cap, 'KR1 and KR-M1’s 3 steps: 1 at risk, 1 in progress, 1 not started, 1 done');
  s.eq('the objective follows', row('o:' + LOCK).score, String(Math.round(RD.objectiveScore(LOCK, emOf('DIV-EL')))));
  s.click('Update KR1, % complete');
  s.type('New value for KR1, in %', '10');
  s.key('New value for KR1, in %', 'Escape');
  s.eq('Escape leaves it', kr().progress, 75);
  s.click('Update KR1, % complete');
  s.type('New value for KR1, in %', '');
  s.key('New value for KR1, in %', 'Enter');
  s.eq('a blank changes nothing', kr().progress, 75);
  s.click('Update KR1, % complete');
  s.type('New value for KR1, in %', '150');
  s.key('New value for KR1, in %', 'Enter');
  s.eq('kept to 0 to 100', kr().progress, 100);
  s.clean('percent');
});
s.step('a milestone step', () => {
  fresh('priya@celadyne.com');
  const st = () => docOf(EL).keyResults.find((x) => x.id === 'KR-EL-2026Q4-02-2').steps[1];
  s.click('Update Contact resistance screening, % complete');
  s.type('New value for Contact resistance screening, in %', '80');
  s.key('New value for Contact resistance screening, in %', 'Enter');
  s.eq('saved', st().completion, 80);
  s.ok(toasts().indexOf('Contact resistance screening set to 80%.') >= 0, 'says so');
  s.eq('the key result follows', row('i:' + LOCK + ':kr:KR-EL-2026Q4-02-2').score, String(Math.round(RD.keyResultScore('KR-EL-2026Q4-02-2', emOf('DIV-EL')))));
  s.click('Update Contact resistance screening, % complete');
  s.type('New value for Contact resistance screening, in %', '');
  s.key('New value for Contact resistance screening, in %', 'Enter');
  s.eq('a step’s blank is 0, as on the Key results tab', st().completion, 0);
  s.eq('not started now', rows().find((r) => r.name === 'Contact resistance screening').stWord, 'Not started');
  s.click('Update 500 h corrosion soak, % complete');
  s.type('New value for 500 h corrosion soak, in %', '100');
  s.fire(s.find('New value for 500 h corrosion soak, in %', { handler: 'onBlur' }), 'onBlur');   // moving away commits, as the KPI editor does
  s.eq('saved on blur', docOf(EL).keyResults.find((x) => x.id === 'KR-EL-2026Q4-02-2').steps[2].completion, 100);
  s.click('Update Samples received and inspected, % complete');
  s.type('New value for Samples received and inspected, in %', 'most');
  s.fire(s.find('New value for Samples received and inspected, in %', { handler: 'onBlur' }), 'onBlur');
  s.eq('a word left on blur changes nothing and closes', [docOf(EL).keyResults.find((x) => x.id === 'KR-EL-2026Q4-02-2').steps[0].completion, !!s.c.state.mine_edit], [100, false]);
  s.eq('the diagram follows the steps', row('g:' + LOCK + ':kr').cap, 'KR1 and KR-M1’s 3 steps: 1 off track, 1 not started, 2 done');
  s.clean('step');
});
s.step('a key result that turns on track stays open where it was updated', () => {
  fresh('priya@celadyne.com');
  const KRM = 'i:' + LOCK + ':kr:KR-EL-2026Q4-02-2';
  s.click('Update Contact resistance screening, % complete');
  s.type('New value for Contact resistance screening, in %', '100');
  s.key('New value for Contact resistance screening, in %', 'Enter');
  s.click('Update 500 h corrosion soak, % complete');
  s.type('New value for 500 h corrosion soak, in %', '100');
  s.key('New value for 500 h corrosion soak, in %', 'Enter');
  s.eq('KR-M1 is complete', row(KRM).score, '100');
  s.ok(rows().some((r) => r.name === '500 h corrosion soak') && row(KRM).caretExp === 'true', 'its steps stay in view');
  s.c.setState({ mine_open: {} });
  s.render();
  s.ok(!rows().some((r) => r.name === '500 h corrosion soak'), 'opened afresh, a key result on track starts folded');
  s.clean('kept open');
});
s.step('an experiment’s key reads', () => {
  fresh('priya@celadyne.com');
  const exp = () => RD.etbTreesOf(docOf(EL).etbTrees[QUAL]).trees.find((t) => t.tid === 't_xover').experiments.exp_002;
  const reads = rows().filter((r) => r.k.indexOf('r:' + QUAL + ':t_xover:exp_002:') === 0);
  s.eq('two key reads', reads.map((r) => r.name).length, 2);
  const hold = reads.find((r) => /:kr_002_2$/.test(r.k));
  s.ok(!!hold, 'the hold reading');
  const W = { within: hold.k };
  s.click('~Add a reading for', W);
  s.type('~Add a reading for', '0.81', W);
  s.key('~Add a reading for', 'Enter', W);
  const store2 = exp().key_read_readings.kr_002_2;
  s.eq('recorded on the experiment', store2[store2.length - 1], 0.81);
  s.ok(toasts().some((t) => /reading recorded\. The step stays in progress until you conclude it\./.test(t)), 'the Current step’s words');
  const linked = reads.find((r) => /:kr_002_1$/.test(r.k));
  s.ok(/Linked to KR3’s KPI/.test(linked.sub), 'the linked one says where it posts');
  const before = docOf(EL).kpiUpdates.filter((u) => u.kpiId === XOVER).length;
  s.click('~Add a reading for', { within: linked.k });
  s.type('~Add a reading for', '0.55', { within: linked.k });
  s.key('~Add a reading for', 'Enter', { within: linked.k });
  const ups = docOf(EL).kpiUpdates.filter((u) => u.kpiId === XOVER);
  s.eq('a linked key read posts to its KPI', [ups.length, ups[ups.length - 1].value, ups[ups.length - 1].note], [before + 1, 0.55, 'exp EXP-2']);
  s.clean('key reads');
});
s.step('read-only: values only', () => {
  fresh('priya@celadyne.com');
  s.click('Settings');
  s.check('Preview the read-only view', true);
  s.click('Close');
  s.expect('Read-only');
  s.ok(!s.has('Update KR1, % complete') && !s.has('Post a reading for Interfacial contact resistance'), 'no value buttons');
  s.eq('values as text', row('i:' + LOCK + ':kr:KR-EL-2026Q4-02-1').lineVal, '60%');
  s.ok(/Read-only: values only\./.test(s.vals.sh.lede), 'the lede says so');
  s.eq('no Save', s.vals.sh.showSave, false);
  const before = JSON.stringify(docOf(EL));
  s.c.mutate((D) => { D.docs[EL].keyResults[0].progress = 1; });
  s.eq('nothing changes', JSON.stringify(docOf(EL)), before);
  s.clean('read-only');
});

/* ================================================================ 5. toolbar, links, settings */
s.step('Needs a check-in', () => {
  fresh('toru@celadyne.com');
  s.click('~Needs a check-in');
  s.eq('on', s.vals.sh.due.on, 'true');
  const ks = rows().filter((r) => r.k[0] === 'k').map((r) => r.name);
  s.eq('only the readings due', ks.sort(), ['Cell voltage at 2 A/cm²', 'High-frequency resistance', 'Interfacial contact resistance', 'Voltage decay rate'].sort());
  s.ok(rows().every((r) => r.k[0] !== 'k' || r.hasFlag), 'each flagged');
  s.ok(!rows().some((r) => r.tid === 'KR2'), 'nothing else');
  s.click('~Needs a check-in');
  s.ok(rows().some((r) => r.tid === 'KR2'), 'off again');
  fresh('priya@celadyne.com');
  s.c.setState({ mine_due: true });
  s.render();
  s.type('Filter by name', 'zzqq');
  s.eq('nothing matches', s.vals.sh.noRows, true);
  s.expect('Nothing matches “zzqq” among the readings due.');
  s.click('Clear filters');
  s.eq('everything back', [s.vals.sh.noRows, s.vals.sh.due.on, s.vals.sh.text.v], [false, 'false', '']);
  s.clean('due');
});
s.step('filter by name', () => {
  fresh('priya@celadyne.com');
  s.type('Filter by name', 'corrosion');
  s.eq('the step and the way to it', rows().map(label), ['Tera component lock', 'Lock Tera 25-30-R5 components', 'Key results', 'KR-M1 Qualify the second-source bipolar plate', '500 h corrosion soak']);
  s.type('Filter by name', 'lock tera');
  s.ok(rows().some((r) => r.k === 'g:' + LOCK + ':kr') && rows().some((r) => r.k === 'g:' + LOCK + ':gate'), 'an objective that matches shows what is under it');
  s.key('Filter by name', 'Escape');
  s.eq('Escape clears', s.vals.sh.text.v, '');
  s.clean('filter');
});
s.step('Expand all, Collapse to objectives, the carets', () => {
  fresh('toru@celadyne.com');
  const n0 = rows().length;
  s.ok(!rows().some((r) => r.k.indexOf('i:' + LOCK + ':tile:') === 0), 'the kanban starts shut');
  s.click('Expand all');
  s.ok(rows().length > n0 && rows().some((r) => r.k.indexOf('i:' + LOCK + ':tile:') === 0) && rows().some((r) => r.k.indexOf('i:' + QUAL + ':risk:') === 0), 'everything opens');
  s.click('Collapse to objectives');
  s.eq('projects and objectives only', [...new Set(rows().map((r) => r.cls.replace(/^mine-row k-(\w+).*$/, '$1')))].sort(), ['obj', 'proj']);
  s.click('Expand Lock Tera 25-30-R5 components');
  s.ok(rows().some((r) => r.k === 'g:' + LOCK + ':kr'), 'one objective opened by hand');
  s.ok(!rows().some((r) => r.k.indexOf('i:' + LOCK + ':kr:') === 0), 'one level at a time');
  s.click('Expand Key results', { within: 'g:' + LOCK + ':kr' });
  s.ok(rows().some((r) => r.k.indexOf('i:' + LOCK + ':kr:') === 0), 'its key results');
  s.click('Collapse Key results', { within: 'g:' + LOCK + ':kr' });
  s.ok(!rows().some((r) => r.k.indexOf('i:' + LOCK + ':kr:') === 0), 'its key results folded');
  s.render();
  s.ok(!rows().some((r) => r.k.indexOf('i:' + LOCK + ':kr:') === 0), 'and stay folded');
  /* a reading due under a folded row: the flag rolls up */
  fresh('toru@celadyne.com');
  s.click('Collapse Stage-gates', { within: 'g:' + QUAL + ':gate' });
  const g = row('g:' + QUAL + ':gate');
  s.ok(g.hasFlag && g.flagTitle === 'A reading is due inside: Voltage decay rate', 'a collapsed row shows what is due inside');
  s.clean('expand');
});
s.step('the objective links', () => {
  fresh('priya@celadyne.com');
  const r = row('o:' + LOCK);
  s.eq('to Execution', [r.href, r.linkTitle], ['Main.dc.html', 'Open in Execution']);
  s.click('~Lock Tera 25-30-R5 components', { tag: 'a' });
  s.eq('the hand-off opens the objective there', handoff(), { app: 'exec', objective: LOCK });
  fresh('toru@celadyne.com');
  const cut = row('o:' + CUT);
  s.eq('nothing planned: plan it in Execution', [cut.actText, cut.actHref], ['Plan it in Execution', 'Main.dc.html']);
  s.click('Plan it in Execution');
  s.eq('hand-off', handoff(), { app: 'exec', objective: CUT });
  s.clean('links');
});
s.step('a header opens its part of the objective in Execution or Sales', () => {
  fresh('toru@celadyne.com');
  const L = (k) => { const r = row(k); return r ? [r.gLink, r.gHref, r.gTitle] : null; };
  s.eq('Key results', L('g:' + LOCK + ':kr'), [true, 'Main.dc.html', 'Open the Key results tab in Execution']);
  s.eq('Stage-gates', L('g:' + LOCK + ':gate'), [true, 'Main.dc.html', 'Open the Stage-gates tab in Execution']);
  s.eq('Risks', L('g:' + QUAL + ':risk'), [true, 'Main.dc.html', 'Open the Risks tab in Execution']);
  const WS = 'g:' + LOCK + ':gate:ws:SGSET-EL-2026Q4-02-1';
  for (const [name, k, oid, tab] of [['Key results', 'g:' + LOCK + ':kr', LOCK, 'krs'], ['Stage-gates', 'g:' + LOCK + ':gate', LOCK, 'gates'],
    ['Workstream A: Component lock', WS, LOCK, 'gates'], ['Kanban', 'g:' + LOCK + ':tile', LOCK, 'kanban'],
    ['Risks', 'g:' + QUAL + ':risk', QUAL, 'risks'], ['Experiments', 'g:' + QUAL + ':exp', QUAL, 'exp']]) {
    global.window.sessionStorage.removeItem('celadyne-calm-open');
    s.click(name, { tag: 'a', within: k });
    s.eq(name + ': the objective, on that tab', handoff(), { app: 'exec', objective: oid, tab: tab });
  }
  s.ok(!s.has('Expand Key results', { tag: 'a' }) && s.has('Collapse Key results'), 'the caret still folds; the name is the link');
  if (HAS_APPS) {
    s.click('Stage-gates', { tag: 'a', within: 'g:' + LOCK + ':gate' });
    const ex = new Sim(MAIN);
    s.eq('Execution opens the objective on that tab', [ex.c.state.objId, ex.c.state.tab], [LOCK, 'gates']);
  }
  fresh('sam@celadyne.com');
  s.click('Expand Kanban', { within: 'g:' + PILOT + ':tile' });
  s.click('Utilities', { tag: 'a', within: 'g:' + PILOT + ':tile:lane:BRD-BD-PIPE:lane-ut' });
  s.eq('a swimlane opens the kanban, in Sales', handoff(), { app: 'sales', objective: PILOT, tab: 'kanban' });
  if (HAS_APPS) {
    const sa = new Sim(SALESB);
    s.eq('Sales opens it', [sa.c.state.objId, sa.c.state.tab], [PILOT, 'kanban']);
  }
  s.clean('header links');
});
s.step('Settings and the sample data', () => {
  fresh('priya@celadyne.com');
  s.click('Settings');
  s.click('Dark');
  s.eq('theme', s.c.state.theme, 'dark');
  s.type('Signed in as', 'toru@celadyne.com');
  s.eq('signed in as Toru', s.c.viewer().email, 'toru@celadyne.com');
  s.click('Close');
  s.eq('his views', s.vals.sh.views.show, true);
  s.click('Update KR1, % complete');
  s.type('New value for KR1, in %', '90');
  s.key('New value for KR1, in %', 'Enter');
  s.eq('changed', docOf(EL).keyResults.find((x) => x.id === 'KR-EL-2026Q4-02-1').progress, 90);
  s.click('Settings');
  s.click('Restore the sample data');
  s.click('Restore');
  s.eq('restored', docOf(EL).keyResults.find((x) => x.id === 'KR-EL-2026Q4-02-1').progress, 60);
  s.eq('still Toru', s.c.viewer().email, 'toru@celadyne.com');
  s.clean('settings');
});

/* ================================================================ 6. the panel above the tree */
const F = s.ns.F;
const roll = () => s.vals.sh.roll;
const fact = (k) => roll().score.facts.find((f) => f.k === 'roll-' + k);
const inside = (el, k) => { for (let p = el.parent; p; p = p.parent) if (p.attrs['data-k'] === k) return true; return false; };
const dataK = (k) => (el) => el.attrs['data-k'] === k;
const pctOf = (style, prop) => { const m = new RegExp(prop + ': (-?[\\d.]+)%').exec(style || ''); return m ? Number(m[1]) : null; };
/* what the engine says about each objective in view, worked out here and not by the page */
function engineFacts() {
  const c = s.c.ctx, td = s.c.D.today;
  return c.entries.map((e) => {
    const doc = docOf(e.docKey);
    const em = RD.withPortfolio(P(), { [e.o.divisionId]: doc });
    const casc = RD.cascade(P(), em, td);
    const gates = doc.stageGates.filter((g) => g.objectiveId === e.o.id);
    const passed = (gid) => { const g = gates.find((x) => x.id === gid); const k = g ? RD.classifyGate(g, td) : ''; return k === 'passed' || k === 'passed-late'; };
    return {
      e, doc, em, full: e.full, sc: RD.objectiveScore(e.o.id, em), ended: !!RD.objectiveEndState(doc.objectiveState, e.o.id),
      slip: casc.objectiveScheduleSlip[e.o.id], wf: casc.objectiveWorkForecast[e.o.id],
      krs: doc.keyResults.filter((k) => k.objectiveId === e.o.id), gates, risk: RD.fmeaRollup(RD.fmeaProblemsFor(doc, e.o.id), passed)
    };
  });
}
const gateWord = (g, td) => { const k = RD.classifyGate(g, td); return k === 'passed' || k === 'passed-late' ? 'passed' : k === 'overdue' ? 'overdue' : 'open'; };
/* pace on a quarter's clock, worked out here from the engine's rule: the quarter's first and last day */
const dayOf = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(2020, 0, 1)) / 864e5);
const qDays = (q) => { const m = /^(\d{4})Q([1-4])$/.exec(q); const y = +m[1], n = +m[2]; return [dayOf(y + '-' + String((n - 1) * 3 + 1).padStart(2, '0') + '-01'), Math.round((Date.UTC(y, n * 3, 1) - Date.UTC(2020, 0, 1)) / 864e5) - 1]; };
const paceTone = (v, q, td) => { if (v == null) return 'none'; const w = qDays(q || '2026Q4'); return { 'on-track': 'ok', 'at-risk': 'warn', 'off-track': 'bad' }[RD.keyResultPaceBand(v, w[0], w[1], td == null ? s.c.D.today : td)] || 'none'; };
const elapsed = (q, td) => { const w = qDays(q || '2026Q4'); return Math.max(0, Math.min(1, ((td == null ? s.c.D.today : td) - w[0]) / (w[1] - w[0]))) * 100; };

s.step('the panel: a lead’s scorecard against the engine', () => {
  fresh('toru@celadyne.com');
  const R = roll(), td = s.c.D.today;
  const iRoll = s.els.findIndex(dataK('roll')), iTree = s.els.findIndex(dataK('tree'));
  s.ok(iRoll >= 0 && iRoll < iTree, 'the panel shows above the tree');
  const fs = engineFacts().filter((f) => f.full), live = fs.filter((f) => !f.ended);
  const xs = live.filter((f) => f.sc != null).map((f) => f.sc).sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const med = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  s.eq('the mean (the average, as before), its status by pace, the median', [R.score.big, R.score.word, R.score.sub], [String(Math.round(mean)), F.bandWord(paceTone(mean)), 'Mean of ' + xs.length + ' scored objectives, median ' + Math.round(med)]);
  s.ok(F.band(mean) !== paceTone(mean), 'not the score band: two weeks in, a mean of ' + Math.round(mean) + ' is on track');
  s.eq('what has no score', R.score.sub2, '1 objective not started or not scored yet');
  s.eq('a dot per scored objective, low to high', R.score.dots.map((d) => d.label), xs.map((x) => String(Math.round(x))));
  s.eq('each in its status by pace', R.score.dots.map((d) => d.cls.split(' ')[1]), xs.map((x) => 't-' + paceTone(x)));
  s.eq('placed on 0 to 100', R.score.dots.map((d) => pctOf(d.style, 'left')), xs.map((x) => Number(x.toFixed(1))));
  s.eq('the mark is the time elapsed in the quarter, not the mean', [pctOf(R.score.mark.style, 'left'), R.score.mark.label, R.score.mark.title], [Number(elapsed().toFixed(1)), '13% elapsed', '13% of Q4 2026 elapsed']);
  s.ok(!s.has((el) => /mine-mean/.test(el.attrs.class || '')) && s.has((el) => el.attrs.class === 'mine-elapsed'), 'drawn as the elapsed mark; no mean mark');
  s.eq('the shading at week 2: nothing off track yet', [R.score.zones.map((z) => z.cls), R.score.zoneKey.map((z) => z.text)], [['mine-z warn first', 'mine-z ok last'], ['At risk, below 3', 'On track, 3 and up']]);
  s.eq('the rule, from the engine', R.score.caption, 'One dot per scored objective; the mark is how much of Q4 2026 has passed. Status follows pace: within 10 points of it is on track, within 30 at risk. The rows below keep the score bands.');
  const krs = [].concat(...fs.map((f) => f.krs.map((k) => paceTone(RD.keyResultScore(k.id, f.em)))));
  const gw = [].concat(...fs.map((f) => f.gates.map((g) => gateWord(g, td))));
  const high = fs.reduce((n, f) => n + f.risk.openHigh, 0), probs = fs.reduce((n, f) => n + f.risk.total, 0), worst = Math.max(...fs.map((f) => f.risk.worst));
  s.eq('objectives by status, by pace', [fact('objs').value, fact('objs').detail], ['3', '2 on track, 1 not started']);
  s.eq('the tree keeps the score bands', [row('o:' + LOCK).stWord, row('o:' + QUAL).stWord], ['Off track', 'At risk']);
  s.eq('key results, on track by pace', [fact('krs').value, fact('krs').detail], [String(krs.length), krs.filter((b) => b === 'ok').length + ' on track by pace']);
  const kr1 = docOf(EL).keyResults.find((k) => k.id === 'KR-EL-2026Q4-02-1');
  s.eq('KR1 at 60, two weeks in: on track by pace', paceTone(RD.keyResultScore(kr1.id, emOf('DIV-EL'))), 'ok');
  kr1.progress = 2;
  s.render();
  s.eq('at 2 it is 11 points behind: at risk, not on track', [paceTone(RD.keyResultScore(kr1.id, emOf('DIV-EL'))), fact('krs').detail], ['warn', (krs.filter((b) => b === 'ok').length - 1) + ' on track by pace']);
  kr1.progress = 60;
  s.render();
  s.eq('stage-gates passed and overdue', [fact('gates').value, fact('gates').detail], [String(gw.length), gw.filter((w) => w === 'passed').length + ' passed, ' + gw.filter((w) => w === 'overdue').length + ' overdue']);
  s.eq('nothing behind schedule', [fact('sched').value, fact('sched').detail, fact('sched').vcls], [String(live.filter((f) => f.slip > 0).length), 'Every objective on schedule', 'mine-fv t-ok tx-ok']);
  s.eq('open high risk', [fact('risk').value, fact('risk').detail, fact('risk').vcls], [String(high), probs + ' problems, worst RPN ' + worst, 'mine-fv t-bad tx-bad']);
  s.eq('readings due, as Needs a check-in counts them', [R.score.due.n, s.vals.sh.due.n], ['4', '4']);
  s.eq('the quarter', [R.score.strip.label, R.score.strip.range, R.score.strip.status], ['Q4 2026', 'Oct 1 to Dec 31', 'Week 2 of 13']);
  s.eq('its weeks', R.score.strip.cells.map((c) => c.cls.replace('mine-qc', '').trim() || '-'), ['done', 'now'].concat(Array(11).fill('-')));
  s.ok(!R.score.alarm && !s.has(dataK('roll-alarm')), 'no alarm');
  /* the view and the quarter beside the title; Needs a check-in, the filter and the depth stay with the tree */
  s.ok(inside(s.find('Quarter', { tag: 'select' }), 'scope') && !inside(s.find('Quarter', { tag: 'select' }), 'tree'), 'the quarter menu is beside the title');
  s.ok(inside(s.find('Team Projects', { tag: 'button' }), 'scope'), 'so is the view switch');
  s.ok(['~Needs a check-in', 'Expand all', 'Collapse to objectives'].every((q) => inside(s.find(q, { tag: 'button' }), 'tree')) && inside(s.find('Filter by name', { tag: 'input' }), 'tree'), 'the tree keeps its own tools');
  /* scores within 4.5 of each other: the next label goes up a lane, up to three */
  const E = s.ns.RD, score = E.objectiveScore;
  try {
    E.objectiveScore = function (id) { return id === QUAL ? 54 : id === CUT ? 56 : score.apply(this, arguments); };
    s.render();
    s.eq('labels that would collide go up a lane', roll().score.dots.map((d) => d.label + ':' + d.cls.split(' ')[2]), ['52:lane0', '54:lane1', '56:lane2']);
    E.objectiveScore = function (id) { return id === QUAL ? 57 : id === CUT ? 61.5 : score.apply(this, arguments); };
    s.render();
    s.eq('4.5 apart or more share a lane', roll().score.dots.map((d) => d.label + ':' + d.cls.split(' ')[2]), ['52:lane0', '57:lane0', '62:lane0']);
  } finally { E.objectiveScore = score; s.render(); }
  s.click('Team Projects');
  s.eq('the panel follows the view', fact('objs').value, String(s.c.ctx.entries.length));
  s.clean('scorecard');
});
s.step('the panel filters the tree: a dot, a timeline row, Show them below', () => {
  fresh('toru@celadyne.com');
  const d = roll().score.dots[0];
  s.eq('the lowest dot is Lock Tera', d.title, 'Lock Tera 25-30-R5 components: 52, on track (13% of the quarter elapsed). Show it below');
  s.click(d.title, { tag: 'button' });
  s.eq('a dot filters the tree to its objective', [s.vals.sh.text.v, objIds()], ['Lock Tera 25-30-R5 components', [LOCK]]);
  s.ok(rows().some((r) => r.k === 'g:' + LOCK + ':kr'), 'with what is under it');
  s.click('Show them below');
  s.eq('Show them below: every reading due, whatever the name filter was', [s.vals.sh.due.on, s.vals.sh.text.v, rows().filter((r) => r.k[0] === 'k').length], ['true', '', 4]);
  s.eq('it says so', roll().score.due.text, 'Showing them below');
  s.click('Showing them below');
  s.eq('off again', s.vals.sh.due.on, 'false');
  s.click('Show them below');
  s.click('Cut stack cost 18%: not started. Show only it below', { tag: 'button' });
  s.eq('a filter from the panel turns Needs a check-in off', s.vals.sh.due.on, 'false');
  s.click('Cut stack cost 18%: not started. Show only it below', { tag: 'button' });
  s.eq('a timeline row filters to its objective', objIds(), [CUT]);
  s.click('Show only Tera component lock below', { tag: 'button' });
  s.eq('a project’s name to its objectives', objIds().sort(), [QUAL, LOCK].sort());
  s.ok(rows().filter((r) => /k-proj/.test(r.cls)).every((r) => r.name === 'Tera component lock'), 'and only that project');
  s.c.setState({ mine_depth: 'objectives' });
  s.click('Lock Tera 25-30-R5 components: on track, 52. Show only it below', { tag: 'button' });
  s.eq('a filter from the panel undoes Collapse to objectives, to show what is under it', [s.c.state.mine_depth, rows().some((r) => r.k === 'g:' + LOCK + ':kr')], ['', true]);
  s.key('Filter by name', 'Escape');
  s.eq('Escape clears it', objIds().length, 3);
  s.clean('panel filters');
});
s.step('the timeline: a row per project and objective, its marks from the engine', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  const T = roll().tl, c = s.c.ctx, td = s.c.D.today;
  s.eq('a row per project and objective', [T.rows.filter((r) => r.isProj).length, T.rows.filter((r) => r.isObj).length], [c.groups.length, c.entries.length]);
  s.eq('in the tree’s order', T.rows.filter((r) => r.isObj).map((r) => r.k.slice(4)), objIds());
  engineFacts().forEach((f) => {
    const o = f.e.o, r = T.rows.find((x) => x.k === 'tlo:' + o.id);
    s.eq(o.id + ': its stage-gates', r.gates.map((g) => g.cls.replace('mine-gt ', '')), f.gates.filter((g) => (g.actualDate != null ? g.actualDate : g.plannedDate) != null).map((g) => gateWord(g, td)));
    s.eq(o.id + ': its forecast', r.hasFc, f.wf != null);
    s.eq(o.id + ': behind', r.slip, f.slip > 0 ? F.plural(f.slip, 'day') + ' behind' : '');
    s.eq(o.id + ': its status by pace', r.barCls, 'mine-tbar t-' + paceTone(f.ended ? null : f.sc));
    /* positions agree with the dates: today inside the window when the window holds today */
    const today = pctOf(T.todayStyle, 'left'), a = pctOf(r.barStyle, 'left'), w = pctOf(r.barStyle, 'width');
    s.eq(o.id + ': today against its window', a < today && today < a + w, o.plannedStart < td && td < o.plannedEnd);
    if (f.wf != null) s.eq(o.id + ': the forecast against its window’s end', pctOf(r.fcStyle, 'left') > a + w + 0.05, f.wf > o.plannedEnd);
  });
  const oct = T.months.find((m) => m.label === 'Oct');
  const today = pctOf(T.todayStyle, 'left');
  s.ok(!!oct && pctOf(oct.style, 'left') < today && today < pctOf(oct.style, 'left') + pctOf(oct.style, 'width'), 'today falls in October');
  s.eq('the months, the year on the first and on January', T.months.map((m) => m.label), ['Sep 2026', 'Oct', 'Nov', 'Dec', 'Jan 2027', 'Feb', 'Mar']);
  const ms = T.rows.find((r) => r.k === 'tlp:INIT-FC-01').flags;
  s.ok(ms.length === 2 && ms.every((m) => /, ahead$/.test(m.title)), 'a project’s milestones, ahead');
  /* fold a project by hand: one bar over its objectives' windows, the tree untouched */
  const n = T.rows.length;
  s.click('Fold Tera component lock');
  const p = roll().tl.rows.find((r) => r.k === 'tlp:INIT-EL-01');
  s.eq('folded: its objectives leave the timeline', [roll().tl.rows.length, p.caretExp, p.count], [n - 2, 'false', '2 objectives']);
  const kids = T.rows.filter((r) => r.k === 'tlo:' + QUAL || r.k === 'tlo:' + LOCK).map((r) => [pctOf(r.barStyle, 'left'), pctOf(r.barStyle, 'left') + pctOf(r.barStyle, 'width')]);
  s.eq('one bar over their windows', [pctOf(p.barStyle, 'left'), Number((pctOf(p.barStyle, 'left') + pctOf(p.barStyle, 'width')).toFixed(1))], [Math.min(...kids.map((k) => k[0])), Number(Math.max(...kids.map((k) => k[1])).toFixed(1))]);
  s.eq('in the project’s score, by pace', p.barCls, 'mine-tbar t-' + paceTone(RD.rollupInitiative('INIT-EL-01', P(), emAll())));
  s.ok(objIds().indexOf(QUAL) >= 0 && objIds().indexOf(LOCK) >= 0, 'the tree keeps its rows');
  const fc = roll().tl.rows.find((r) => r.k === 'tlp:INIT-FC-02');
  s.click('Fold Low-humidity durability');
  const fc2 = roll().tl.rows.find((r) => r.k === 'tlp:INIT-FC-02');
  s.eq('a folded project says its worst slip', [fc.hasSlip, fc2.hasSlip, fc2.slip], [false, true, '18 days behind']);
  const fk = T.rows.filter((r) => r.isObj && s.c.ctx.groups.find((g) => g.key === 'INIT-FC-02').entries.some((e) => 'tlo:' + e.o.id === r.k)).map((r) => [pctOf(r.barStyle, 'left'), pctOf(r.barStyle, 'left') + pctOf(r.barStyle, 'width')]);
  s.ok(fk.length === 2 && fk[0][0] !== fk[1][0], 'its objectives start on different days');
  s.eq('from the first start to the last end', [pctOf(fc2.barStyle, 'left'), Number((pctOf(fc2.barStyle, 'left') + pctOf(fc2.barStyle, 'width')).toFixed(1))], [Math.min(...fk.map((k) => k[0])), Number(Math.max(...fk.map((k) => k[1])).toFixed(1))]);
  /* "N days behind": after a bar with room, before one that ends late, on the end of one that spans the axis */
  const hub = T.rows.find((r) => r.k === 'tlo:' + HUB);
  s.eq('a bar ending late: before its start', [/^right: /.test(hub.slipStyle), / on-bar/.test(hub.slipCls)], [true, false]);
  s.ok(pctOf(hub.slipStyle, 'right') > 100 - pctOf(hub.barStyle, 'left'), 'clear of the bar');
  s.click('Fold Utility pilot program');
  const up = roll().tl.rows.find((r) => r.k === 'tlp:INIT-BD-01');
  s.ok(pctOf(up.barStyle, 'left') < 16 && pctOf(up.barStyle, 'left') + pctOf(up.barStyle, 'width') > 84, 'a project spanning the axis');
  s.eq('its slip sits on the end of its bar', [up.slip, / on-bar/.test(up.slipCls), Number(pctOf(up.slipStyle, 'right').toFixed(1))], ['18 days behind', true, Number((100 - pctOf(up.barStyle, 'left') - pctOf(up.barStyle, 'width') + 1).toFixed(1))]);
  s.click('Open Utility pilot program');
  s.click('Open Tera component lock');
  s.click('Open Low-humidity durability');
  s.eq('open again', roll().tl.rows.length, n);
  s.clean('timeline');
});
s.step('past 12 objectives the timeline starts folded', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  s.type('Quarter', '*');
  const add = (i) => P().objectives.push({ id: 'OBJ-EL-2026Q4-1' + i, divisionId: 'DIV-EL', initiativeId: 'INIT-EL-02', quarter: '2026Q4', statement: 'Extra objective ' + i, owner: ['toru@celadyne.com'], plannedStart: s.c.D.today - 5, plannedEnd: s.c.D.today + 40, milestoneIds: [], order: 10 + i });
  add(1); add(2); s.render();
  s.eq('12 objectives: every project open', [s.c.ctx.entries.length, roll().tl.rows.filter((r) => r.isObj).length], [12, 12]);
  add(3); s.render();
  const T = roll().tl;
  s.eq('13: each project folded to one row', [T.rows.length, T.rows.every((r) => r.isProj && r.caretExp === 'false')], [s.c.ctx.groups.length, true]);
  s.ok(T.rows.every((r) => r.hasBar && /^\d+ objectives?$/.test(r.count)), 'each with its span and count');
  s.click('Open Stack cost-down');
  /* in the tree's order: this quarter's first, then Planning's */
  s.eq('one opened by hand', roll().tl.rows.filter((r) => r.isObj).map((r) => r.name), ['Extra objective 1', 'Extra objective 2', 'Extra objective 3', 'Cut stack cost 18%']);
  s.eq('as the tree has them', roll().tl.rows.filter((r) => r.isObj).map((r) => r.k.slice(4)), s.c.ctx.groups.find((g) => g.key === 'INIT-EL-02').entries.map((e) => e.o.id));
  s.click('Fold Stack cost-down');
  s.eq('and folded again', roll().tl.rows.filter((r) => r.isObj).length, 0);
  s.click('Open Stack cost-down');
  s.click('Owned Projects');
  s.click('Team Projects');
  s.ok(roll().tl.rows.every((r) => r.isProj), 'another view starts over');
  s.click('Open Stack cost-down');
  s.c.setViewer('dana@celadyne.com');
  s.render();
  s.eq('and so does another person', s.c.state.mine_tl, {});
  s.clean('fold');
});
s.step('behind schedule and the alarm; an upcoming quarter', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  const live = engineFacts().filter((f) => f.full && !f.ended);
  const behind = live.filter((f) => f.slip > 0).sort((a, b) => b.slip - a.slip);
  s.eq('behind schedule, past the alarm', [fact('sched').value, fact('sched').vcls], [String(behind.length), 'mine-fv t-bad tx-bad']);
  s.eq('the worst, cut at a word', [fact('sched').detail, fact('sched').title], ['Worst: Root-cause AST degradation, ' + F.plural(behind[0].slip, 'day'), 'Worst: Root-cause AST degradation, 18 days behind schedule']);
  s.eq('the note names them', roll().score.alarm.text, '2 objectives are past the 10-day schedule alarm: Root-cause AST degradation (18 days) and Build the Q1 hydrogen-hub pipeline (18 days).');
  s.ok(!s.has('Show it'), 'two of them: no single one to show');
  s.type('Quarter', '2027Q1');
  const R = roll();
  s.eq('an upcoming quarter', [R.score.strip.label, R.score.strip.status, R.score.strip.cells.every((c) => c.cls === 'mine-qc')], ['Q1 2027', 'Upcoming', true]);
  s.eq('nothing scored yet: no number, no dots', [R.score.hasBig, R.score.word, R.score.sub, R.score.hasSub2, R.score.dots.length, R.score.hasCaption], [false, 'No score yet', 'None of these 3 objectives has a score yet', false, 0, false]);
  s.eq('its clock has not started: the mark at 0, every score on track', [R.score.mark.label, R.score.mark.lcls, R.score.zones.map((z) => z.cls), R.score.zoneKey.map((z) => z.text)], ['0% elapsed', 'mine-mlbl at-l', ['mine-z ok first last'], ['On track, any score']]);
  s.eq('not started and already behind counts as behind (R5-5)', [row('o:' + HUB).stWord, fact('sched').value], ['Not started', '1']);
  s.click('Show it');
  s.eq('Show it filters the tree to it', objIds(), [HUB]);
  s.clean('alarm');
});
s.step('the alarm is past 10 days, as in Execution and Sales', () => {
  fresh('toru@celadyne.com');
  const E = s.ns.RD, cascade = E.cascade;
  const slip = (days) => { E.cascade = function () { const c = cascade.apply(this, arguments); c.objectiveScheduleSlip = Object.assign({}, c.objectiveScheduleSlip, { [LOCK]: days }); return c; }; s.render(); };
  const lockRow = () => roll().tl.rows.find((r) => r.k === 'tlo:' + LOCK);
  try {
    slip(10);
    s.eq('10 days: behind, not past the alarm', [fact('sched').value, fact('sched').vcls, !!roll().score.alarm, lockRow().slipCls], ['1', 'mine-fv t-warn tx-warn', false, 'mine-slip tx-warn']);
    s.eq('the worst says so', fact('sched').detail, 'Worst: Lock Tera 25-30-R5 components, 10 days');
    slip(11);
    s.eq('11 days: past it', [fact('sched').vcls, roll().score.alarm.text, roll().score.alarm.one, lockRow().slipCls], ['mine-fv t-bad tx-bad', 'Lock Tera 25-30-R5 components is 11 days behind schedule, past the 10-day alarm.', true, 'mine-slip tx-bad']);
    s.eq('its label sits after its bar, early in the axis', /^left: /.test(lockRow().slipStyle), true);
    slip(0);
    s.eq('0 days: on schedule', [fact('sched').value, lockRow().hasSlip], ['0', false]);
  } finally { E.cascade = cascade; }
  s.clean('alarm boundary');
});
s.step('all quarters: ended objectives as how they ended, out of the score', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  const big = roll().score.big;
  s.type('Quarter', '*');
  s.eq('objectives with how they ended; the rest by pace on this quarter’s clock', fact('objs').detail, '6 on track, 3 not started, 1 achieved');
  s.eq('the score leaves it out', roll().score.big, big);
  const r = roll().tl.rows.find((x) => x.k === 'tlo:' + HP6);
  s.eq('its row', [r.val, r.barCls, r.hasFc, r.hasSlip, r.dotCls], ['Achieved', 'mine-tbar t-done', false, false, 'dot t-done']);
  s.eq('the months reach back to it', roll().tl.months[0].label, 'Jul 2026');
  s.type('Quarter', '2026Q3');
  s.eq('ended only: nothing under way', [roll().score.word, roll().score.sub, fact('sched').detail, fact('sched').value], ['Nothing under way', 'Every objective here has ended: 1 achieved', 'Nothing under way', '0']);
  s.eq('a quarter behind us', roll().score.strip.status, 'Complete');
  s.clean('all quarters');
});
s.step('an IC; and a view with nothing in full', () => {
  fresh('priya@celadyne.com');
  const R = roll();
  s.eq('one scored objective: the mark is the time elapsed all the same', [R.score.big, R.score.sub, R.score.mark.label, R.score.hasCaption], ['52', 'The only objective here with a score', '13% elapsed', true]);
  const q = R.tl.rows.find((r) => r.k === 'tlo:' + QUAL);
  s.eq('Toru’s objective: her experiments only, faint', [q.val, q.barCls, q.gates.length, q.hasFc, q.hasSlip, q.dotCls], ['Yours: 3 experiments', 'mine-tbar t-none faint', 0, false, false, 'dot t-none']);
  s.eq('and out of the counts', [fact('objs').value, fact('gates').value], ['1', '3']);
  s.eq('says what she sees in it', q.nameTitle, 'Qualify the 10-cell short stack for durability testing: only your 3 experiments are in view. Show only it below');
  fresh('ken@celadyne.com');
  s.eq('only tiles in view: no score to roll up', [roll().score.hasFull, roll().score.noFullText], [false, 'No score to roll up: only your tiles are in view, in objectives that aren’t yours. The timeline shows when those objectives run.']);
  s.ok(!s.has(dataK('roll-objs')) && !s.has(dataK('roll-spread')) && s.has(dataK('roll-timeline')) && s.has(dataK('roll-quarter')), 'the quarter and the timeline, no scorecard');
  s.clean('IC panel');
});
s.step('the panel follows a reading posted', () => {
  fresh('priya@celadyne.com');
  s.eq('before', [fact('gates').detail, roll().score.due.n], ['1 passed, 1 overdue', '1']);
  const W = { within: 'k:' + LOCK + ':' + ICR };
  s.click('Post a reading for Interfacial contact resistance', W);
  s.type('New value for Interfacial contact resistance', '9', W);
  s.key('New value for Interfacial contact resistance', 'Enter', W);
  s.eq('the gate passed, nothing due', [fact('gates').detail, roll().score.due.n, roll().score.due.none], ['2 passed, 0 overdue', '0', true]);
  s.ok(textOf(s.find(dataK('roll-due'))).indexOf('Nothing due') >= 0 && !s.has('Show them below'), 'Nothing due, no button');
  s.clean('posted');
});
s.step('read-only keeps the panel; nothing in view hides it; signed out, no scope', () => {
  fresh('priya@celadyne.com');
  s.click('Settings');
  s.check('Preview the read-only view', true);
  s.click('Close');
  s.ok(!!roll(), 'read-only: the panel stays');
  s.click(roll().score.dots[0].title, { tag: 'button' });
  s.eq('and still filters (a view, not a change)', objIds(), [LOCK]);
  fresh('');
  s.c.D.roster.users.push({ email: 'nia@celadyne.com', disabled: false, name: 'Nia Brooks', orgRole: 'ic', leadDivisions: [] });
  s.c.setViewer('nia@celadyne.com');
  s.render();
  s.eq('nothing is hers: no panel, the quarter menu stays', [roll(), s.vals.sh.scope, s.has('Quarter', { tag: 'select' })], [null, true, true]);
  s.ok(!s.has(dataK('roll')), 'nothing drawn');
  fresh('');
  s.eq('signed out: no panel, no view or quarter', [roll(), s.vals.sh.scope, s.has('Quarter', { tag: 'select' })], [null, false, false]);
  s.clean('empty');
});

/* ================================================================ 7. the CEO's and CTO's Team Projects */
const team = () => s.vals.sh.settings && s.vals.sh.settings.team;
const divOf = (id) => P().objectives.find((o) => o.id === id).divisionId;
s.step('the CTO: the R&D divisions by default; his own choice in Settings', () => {
  fresh('corey@celadyne.com');
  s.click('Team Projects');
  s.eq('R&D divisions', s.vals.sh.lede, 'R&D divisions: 4 projects and 7 objectives. Click a value to update it.');
  s.eq('Fuel Cell and Electrolyzer only', [...new Set(objIds().map(divOf))], ['DIV-FC', 'DIV-EL']);
  s.click('Change divisions');
  s.ok(!!team() && s.has((el) => el.attrs['data-k'] === 'team-scope'), 'the lede’s link opens Settings at Team Projects');
  s.eq('the choices', team().opts.map((o) => [o.label, o.desc, o.on, o.isDefault]), [
    ['R&D divisions', 'Fuel Cell and Electrolyzer', true, true],
    ['Business divisions', 'Business Development and Partnerships', false, false],
    ['Every division', 'Fuel Cell, Electrolyzer and 2 more', false, false],
    ['Choose divisions', 'Any divisions you pick, R&D or business.', false, false]]);
  s.eq('it says whose default', team().lede, 'Which divisions your Team Projects view covers. The CTO’s default is the R&D divisions.');
  s.eq('nothing stored for a default', store.rd_mine_team, undefined);
  s.check('~Business divisions', true, { within: 'team-scope' });
  s.eq('kept for him in this browser', JSON.parse(store.rd_mine_team), { 'corey@celadyne.com': { mode: 'biz' } });
  s.click('Close');
  s.eq('Business divisions', [s.vals.sh.lede, objIds()], ['Business divisions: 1 project and 2 objectives. Click a value to update it.', [PILOT, HUB]]);
  s.ok(!!roll() && fact('objs').value === '2', 'the panel follows it');
  /* pick divisions one by one, starting from what Team Projects covers now */
  s.click('Change divisions');
  s.check('~Choose divisions', true, { within: 'team-scope' });
  const picks = () => team().groups.map((g) => g.label + ': ' + g.divs.map((d) => d.name + (d.on ? ' on' : '')).join(', '));
  s.eq('starts from the business divisions', picks(), ['R&D: Fuel Cell, Electrolyzer', 'Business: Business Development on, Partnerships on']);
  s.check('Electrolyzer', true, { within: 'team-picks' });
  s.eq('Electrolyzer added', s.vals.sh.lede, 'Electrolyzer, Business Development and Partnerships: 3 projects and 5 objectives. Click a value to update it.');
  s.check('Business Development', false, { within: 'team-picks' });
  s.check('Partnerships', false, { within: 'team-picks' });
  s.eq('Electrolyzer alone', [s.vals.sh.lede, JSON.parse(store.rd_mine_team)], ['Electrolyzer: 2 projects and 3 objectives. Click a value to update it.', { 'corey@celadyne.com': { mode: 'pick', divs: ['DIV-EL'] } }]);
  const el = team().groups[0].divs.find((d) => d.name === 'Electrolyzer');
  s.eq('the last one stays', [el.on, el.locked, el.title], [true, true, 'Team Projects keeps at least one division']);
  el.toggle({ target: { checked: false } });
  s.render();
  s.eq('unchecking it changes nothing', JSON.parse(store.rd_mine_team)['corey@celadyne.com'].divs, ['DIV-EL']);
  s.check('~R&D divisions', true, { within: 'team-scope' });
  s.eq('back to his default: nothing stored', [store.rd_mine_team, s.vals.sh.lede], [undefined, 'R&D divisions: 4 projects and 7 objectives. Click a value to update it.']);
  s.click('Close');
  /* another choice starts the tree and the timeline over, as another view does */
  s.click('Fold Tera component lock');
  s.click('Collapse Lock Tera 25-30-R5 components');
  s.ok(Object.keys(s.c.state.mine_tl).length === 1 && Object.keys(s.c.state.mine_open).length === 1, 'a fold and a row closed by hand');
  teamScope('~Every division');
  s.eq('a new choice starts them over', [s.c.state.mine_tl, s.c.state.mine_open], [{}, {}]);
  teamScope('~R&D divisions');
  /* Owned Projects doesn't follow it; a new page in this browser keeps it */
  s.click('Owned Projects');
  s.eq('Owned Projects: still his tile in Sam’s objective', objIds(), [PILOT]);
  s.ok(!s.has('Change divisions'), 'the link is for Team Projects only');
  teamScope('~Every division');
  fresh('corey@celadyne.com', true);
  s.click('Team Projects');
  s.eq('a new page in this browser keeps his choice', s.vals.sh.lede, 'Every division: 5 projects and 9 objectives. Click a value to update it.');
  s.eq('who may change pulled KPIs is unchanged', M.leads(s.c.D, 'corey@celadyne.com').length, P().divisions.length);
  s.clean('CTO choice');
});
s.step('the CEO: the business divisions by default, and her choice is hers', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  fresh('dana@celadyne.com', true);
  s.eq('nothing of her own: she opens on Team Projects', s.vals.sh.views.opts.map((o) => o.on), ['false', 'true']);
  s.eq('the business divisions, though the CTO chose every division here', [s.vals.sh.lede, objIds()], ['Business divisions: 1 project and 2 objectives. Click a value to update it.', [PILOT, HUB]]);
  s.click('Settings');
  s.eq('her default', [team().opts.filter((o) => o.isDefault).map((o) => o.label), team().lede], [['Business divisions'], 'Which divisions your Team Projects view covers. The CEO’s default is the business divisions.']);
  s.check('~R&D divisions', true, { within: 'team-scope' });
  s.click('Close');
  s.eq('she chooses for herself', [s.vals.sh.lede, JSON.parse(store.rd_mine_team)], ['R&D divisions: 4 projects and 7 objectives. Click a value to update it.', { 'corey@celadyne.com': { mode: 'all' }, 'dana@celadyne.com': { mode: 'rd' } }]);
  s.clean('CEO choice');
});
s.step('no business division yet: the CEO is told where to choose', () => {
  fresh('dana@celadyne.com');
  P().divisions.forEach((d) => { d.kind = 'rd'; });
  s.render();
  s.eq('Team Projects stays, with nothing in it', [s.vals.sh.views.show, s.vals.sh.hasTree, roll()], [true, false, null]);
  s.eq('it says why', s.vals.sh.empty.text, 'There are no business divisions yet. Choose which divisions Team Projects covers in Settings.');
  s.click('Open settings');
  s.ok(!!team(), 'Settings, at Team Projects');
  s.eq('nothing to list under business', team().opts.find((o) => o.k === 'biz').desc, 'None yet');
  s.clean('no business');
});
s.step('leads and ICs have no such setting', () => {
  for (const who of ['toru@celadyne.com', 'priya@celadyne.com']) {
    fresh(who);
    s.click('Settings');
    s.ok(!team() && !s.has((el) => el.attrs['data-k'] === 'team-scope'), who + ': no Team Projects choice');
    s.click('Close');
    s.ok(!s.has('Change divisions'), who + ': no link');
  }
  fresh('toru@celadyne.com');
  s.click('Team Projects');
  s.eq('a lead’s Team Projects: the divisions he leads', s.vals.sh.lede, 'Electrolyzer, the team you lead: 2 projects and 3 objectives. Click a value to update it.');
  s.clean('no setting');
});
s.step('a stored choice that no longer fits', () => {
  store.rd_mine_team = '{not json';
  fresh('corey@celadyne.com', true);
  s.click('Team Projects');
  s.eq('unreadable: his default', s.vals.sh.lede.split(':')[0], 'R&D divisions');
  store.rd_mine_team = JSON.stringify({ 'corey@celadyne.com': { mode: 'sideways' } });
  fresh('corey@celadyne.com', true);
  s.click('Team Projects');
  s.eq('an unknown choice: his default', s.vals.sh.lede.split(':')[0], 'R&D divisions');
  store.rd_mine_team = JSON.stringify({ 'corey@celadyne.com': { mode: 'pick', divs: ['DIV-GONE', 'DIV-BD'] } });
  fresh('corey@celadyne.com', true);
  s.click('Team Projects');
  s.eq('a picked division that is gone drops out', s.vals.sh.lede.split(':')[0], 'Business Development');
  store.rd_mine_team = JSON.stringify({ 'corey@celadyne.com': { mode: 'pick', divs: ['DIV-PT', 'DIV-BD', 'DIV-EL', 'DIV-FC'] } });
  fresh('corey@celadyne.com', true);
  s.click('Team Projects');
  s.eq('more than three picked: how many', s.vals.sh.lede.split(':')[0], '4 divisions you chose');
  store.rd_mine_team = JSON.stringify({ 'corey@celadyne.com': { mode: 'pick', divs: ['DIV-GONE'] } });
  fresh('corey@celadyne.com', true);
  s.click('Team Projects');
  s.eq('none left', [s.vals.sh.empty.text, s.vals.sh.empty.actLabel], ['No divisions are chosen for Team Projects. Choose which divisions Team Projects covers in Settings.', 'Open settings']);
  s.clean('stored choice');
});

/* ================================================================ 8. pace on the quarter's clock (October 22) */
const ORDER = ['Off track', 'At risk', 'On track', 'Not started', 'No score yet', 'Achieved', 'Abandoned'];
/* the panel's Objectives fact, worked out here: how it ended, else its status by pace, else not started or no score */
const paceWords = (fs) => {
  const cnt = {}, td = s.c.D.today;
  fs.forEach((f) => {
    const end = RD.objectiveEndState(f.doc.objectiveState, f.e.o.id);
    const w = end ? (end.status === 'achieved' ? 'Achieved' : 'Abandoned') : f.sc != null ? F.bandWord(paceTone(f.sc)) : f.e.o.plannedStart != null && td < f.e.o.plannedStart ? 'Not started' : 'No score yet';
    cnt[w] = (cnt[w] || 0) + 1;
  });
  return ORDER.filter((w) => cnt[w]).map((w) => cnt[w] + ' ' + w.toLowerCase()).join(', ');
};
s.step('pace, week 9: the mark, the shading, the dots, the status and the facts move with the clock', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  s.c.D.today = dayOf('2026-11-26');
  s.render();
  const R = roll().score, e = elapsed();
  const fs = engineFacts().filter((f) => f.full), live = fs.filter((f) => !f.ended);
  const xs = live.filter((f) => f.sc != null).map((f) => f.sc).sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  s.eq('week 9', R.strip.status, 'Week 9 of 13');
  s.ok(e % 1 >= 0.5, 'a share that rounds up (' + e.toFixed(2) + ')');
  s.eq('the mark at the time elapsed', [pctOf(R.mark.style, 'left'), R.mark.label, R.mark.lcls], [Number(e.toFixed(1)), Math.round(e) + '% elapsed', 'mine-mlbl']);
  s.eq('off track below the time elapsed less 30, on track from it less 10', R.zoneKey.map((z) => z.text), ['Off track, below ' + Math.round(e - 30), 'At risk', 'On track, ' + Math.round(e - 10) + ' and up']);
  s.eq('the zones meet at those points', R.zones.map((z) => z.cls + ' | ' + z.style), ['mine-z bad first | flex: 0 0 calc(' + (e - 30).toFixed(2) + '% - 1px)', 'mine-z warn | flex: 0 0 calc(20.00% - 2px)', 'mine-z ok last | flex: 1 1 auto']);
  s.eq('each dot by pace', R.dots.map((d) => d.cls.split(' ')[1]), xs.map((x) => 't-' + paceTone(x)));
  s.ok(['t-bad', 't-warn', 't-ok'].every((t) => R.dots.some((d) => d.cls.split(' ')[1] === t)), 'off track, at risk and on track all show');
  s.eq('a dot says it', R.dots[0].title, 'Show a 20% RH polarization-curve gain: ' + Math.round(xs[0]) + ', off track (' + Math.round(e) + '% of the quarter elapsed). Show it below');
  s.eq('the mean (the average) by pace', [R.big, R.word], [String(Math.round(mean)), F.bandWord(paceTone(mean))]);
  s.ok(R.aria.endsWith('; ' + Math.round(e) + '% of Q4 2026 elapsed'), 'the spread says the time elapsed to a screen reader');
  s.eq('objectives by status, by pace', fact('objs').detail, paceWords(fs));
  const krs = [].concat(...fs.map((f) => f.krs.map((k) => paceTone(RD.keyResultScore(k.id, f.em)))));
  s.eq('key results on track by pace', fact('krs').detail, krs.filter((b) => b === 'ok').length + ' on track by pace');
  /* the timeline's colors by pace; the tree keeps the score bands */
  const T = roll().tl;
  live.forEach((f) => {
    const r = T.rows.find((x) => x.k === 'tlo:' + f.e.o.id);
    s.eq(f.e.o.id + ': on the timeline by pace', [r.barCls, r.dotCls], ['mine-tbar t-' + paceTone(f.sc), 'dot t-' + paceTone(f.sc)]);
    if (f.sc != null) s.eq(f.e.o.id + ': in the tree by its score band', row('o:' + f.e.o.id).stWord, F.bandWord(F.band(f.sc)));
  });
  s.ok(live.some((f) => f.sc != null && F.band(f.sc) !== paceTone(f.sc)), 'and the two differ for some');
  /* "N days behind" after the forecast when it runs past the window */
  const q = T.rows.find((r) => r.k === 'tlo:' + QUAL);
  s.ok(q.hasSlip && q.hasFc && pctOf(q.slipStyle, 'left') > pctOf(q.fcStyle, 'left'), 'a slip label clears the forecast mark (' + q.slip + ')');
  s.click('Fold Tera component lock');
  const p = roll().tl.rows.find((r) => r.k === 'tlp:INIT-EL-01');
  s.eq('a folded project by its Planning score, by pace', p.barCls, 'mine-tbar t-' + paceTone(RD.rollupInitiative('INIT-EL-01', P(), emAll())));
  s.clean('pace week 9');
});
s.step('pace at its edges: within 10 points is on track, past 30 off track; 100 is on track', () => {
  fresh('toru@celadyne.com');
  s.c.D.today = dayOf('2026-11-24');
  s.render();
  const e = elapsed();
  const E = s.ns.RD, score = E.objectiveScore;
  try {
    const set = (a, b) => { E.objectiveScore = function (id) { return id === QUAL ? a : id === LOCK ? b : score.apply(this, arguments); }; s.render(); return roll().score.dots.map((d) => d.cls.split(' ')[1]); };
    s.eq('9.99 behind: on track; 10.01 behind: at risk', set(e - 9.99, e - 10.01), ['t-warn', 't-ok']);
    s.eq('29.99 behind: at risk; 30.01 behind: off track', set(e - 29.99, e - 30.01), ['t-bad', 't-warn']);
    s.eq('ahead of the time elapsed and at 100: on track', set(e + 5, 100), ['t-ok', 't-ok']);
  } finally { E.objectiveScore = score; s.render(); }
  s.clean('pace edges');
});
s.step('pace when the quarter is over: anything short of 100 is off track', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  s.c.D.today = dayOf('2027-01-05');
  s.type('Quarter', '2026Q4');
  const R = roll().score;
  s.eq('the quarter, complete', [R.strip.status, R.mark.label, R.mark.lcls], ['Complete', '100% elapsed', 'mine-mlbl at-r']);
  s.eq('one zone, off track up to 100', [R.zones.map((z) => z.cls), R.zoneKey.map((z) => z.text)], [['mine-z bad first last'], ['Off track, below 100', 'On track only at 100']]);
  s.ok(R.dots.length > 0 && R.dots.every((d) => / t-bad /.test(d.cls)), 'every dot off track');
  s.eq('the mean too', R.word, 'Off track');
  const E = s.ns.RD, score = E.objectiveScore;
  try {
    E.objectiveScore = function (id) { return id === LOCK ? 100 : score.apply(this, arguments); };
    s.render();
    s.eq('an objective at 100 is on track', roll().score.dots.slice(-1)[0].cls.split(' ')[1], 't-ok');
  } finally { E.objectiveScore = score; s.render(); }
  s.clean('pace over');
});
s.step('pace in week 1: any score is on track', () => {
  fresh('toru@celadyne.com');
  s.c.D.today = dayOf('2026-10-05');
  s.render();
  const R = roll().score;
  s.eq('4% elapsed: one zone', [R.mark.label, R.mark.lcls, R.zones.map((z) => z.cls), R.zoneKey.map((z) => z.text)], ['4% elapsed', 'mine-mlbl at-l', ['mine-z ok first last'], ['On track, any score']]);
  s.ok(R.dots.every((d) => / t-ok /.test(d.cls)) && R.word === 'On track', 'every dot and the mean on track');
  s.clean('pace week 1');
});
s.step('pace: a zone too thin to see goes to its neighbour, and the line stays covered', () => {
  fresh('toru@celadyne.com');
  s.type('Quarter', '2027Q1');
  s.c.D.today = dayOf('2027-01-10');
  s.render();
  let e = elapsed('2027Q1');
  s.ok(e - 10 > 0 && e - 10 < 0.5, 'at risk would be ' + (e - 10).toFixed(2) + ' wide');
  s.eq('so on track takes the line', [roll().score.zones.map((z) => z.cls), roll().score.zoneKey.map((z) => z.text)], [['mine-z ok first last'], ['On track, any score']]);
  s.c.D.today = dayOf('2027-01-28');
  s.render();
  e = elapsed('2027Q1');
  s.ok(e - 30 > 0 && e - 30 < 0.5, 'off track would be ' + (e - 30).toFixed(2) + ' wide');
  s.eq('so at risk starts at 0 and ends where it should', roll().score.zones.map((z) => z.cls + ' | ' + z.style), ['mine-z warn first | flex: 0 0 calc(' + (e - 10).toFixed(2) + '% - 1px)', 'mine-z ok last | flex: 1 1 auto']);
  s.eq('its key', roll().score.zoneKey.map((z) => z.text), ['At risk, below ' + Math.round(e - 10), 'On track, ' + Math.round(e - 10) + ' and up']);
  s.clean('pace slivers');
});
s.step('a quarter the suite can’t read: no clock, so the score bands', () => {
  fresh('toru@celadyne.com');
  P().objectives.find((o) => o.id === LOCK).quarter = 'Backlog';
  s.render();
  s.type('Quarter', 'Backlog');
  const R = roll().score;
  s.eq('no quarter strip, no mark', [R.hasStrip, R.mark], [false, null]);
  s.eq('the bands', R.zoneKey.map((z) => z.text), ['Off track, below 65', 'At risk', 'On track, 80 and up']);
  s.eq('Lock Tera by its band', [R.dots.map((d) => d.cls.split(' ')[1]), R.word, fact('krs').detail.replace(/^\d+ /, '')], [['t-bad'], 'Off track', 'on track by score']);
  s.eq('a caption without the rule', R.caption, 'One dot per scored objective.');
  s.clean('no clock');
});

/* ================================================================ 9. group and sort (October 22) */
const under = (dim) => { let cur = null; const out = []; rows().forEach((r) => { const m = new RegExp('^p:' + dim + ':([^/]*)$').exec(r.k); if (m) cur = m[1]; else if (/k-obj/.test(r.cls)) out.push([r.k.slice(2), cur]); }); return out; };
const sets = () => rows().filter((r) => /k-set/.test(r.cls));
const groupsNow = () => { const out = []; let cur = null; rows().forEach((r) => { if (/k-(proj|set)/.test(r.cls)) { cur = { k: r.k, objs: [] }; out.push(cur); } else if (/k-obj/.test(r.cls) && cur) cur.objs.push(r.k.slice(2)); }); return out; };
const objOf = (id) => P().objectives.find((o) => o.id === id);
const scoreOf = (id) => { const o = objOf(id); const doc = docOf((o.divisionId === 'DIV-BD' || o.divisionId === 'DIV-PT' ? 'BIZ-' : 'EXEC-') + o.divisionId); return RD.objectiveEndState(doc.objectiveState, id) ? null : RD.objectiveScore(id, emOf(o.divisionId)); };
/* tree and timeline as one sequence: groups and objectives */
const treeSeq = () => rows().filter((r) => /k-(set|proj|obj)/.test(r.cls)).map((r) => r.k);
const tlSeq = () => roll().tl.rows.map((r) => r.k.replace(/^tlp:/, 'p:').replace(/^tlo:/, 'o:'));
/* Group and sort (round 6's A): the popover opens from its button, as a person opens it, and stays open for the
   next change; Escape closes it, as a person would before working with the rows behind it */
const gsPop = () => s.has(dataK('group-sort-pop'));
const gsOpen = () => { if (!gsPop()) s.click('Group and sort'); };
const gsType = (q, v) => { gsOpen(); s.type(q, v, { within: 'group-sort-pop' }); };
const gsClick = (q) => { gsOpen(); s.click(q, { within: 'group-sort-pop' }); };
const gsClose = () => { if (gsPop()) s.key(dataK('group-sort-pop'), 'Escape'); };
const gsBtn = () => s.find(dataK('group-sort'));
const gsWords = () => textOf(s.find(dataK('group-sort-words')));
const inOrder = (list, cmp) => list.every((x, i) => i === 0 || cmp(list[i - 1], x) <= 0);
const nullsLast = (f, dir) => (a, b) => { const x = f(a), y = f(b); return (x == null ? 1 : 0) - (y == null ? 1 : 0) || (x != null && y != null ? (x - y) * dir : 0); };
s.step('MINE.arrange on its own: layers, paths, and the tree’s own grouping by default', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  const D = s.c.D, es = s.c.ctx.entries;
  s.eq('Project alone is the tree’s old grouping', M.arrange(D, es, ['project']).groups.map((g) => [g.key, g.entries.map((e) => e.o.id)]), M.group(D, es).map((g) => [g.key, g.entries.map((e) => e.o.id)]));
  const A = M.arrange(D, es, ['division', 'project']);
  s.eq('divisions in Planning’s order', A.groups.map((g) => g.key), ['division:DIV-FC', 'division:DIV-EL', 'division:DIV-BD']);
  s.eq('their projects, keyed by path', A.groups[0].kids.map((g) => [g.key, g.init && g.init.id]), [['division:DIV-FC/INIT-FC-01', 'INIT-FC-01'], ['division:DIV-FC/INIT-FC-02', 'INIT-FC-02']]);
  s.eq('every entry under its division', A.groups.map((g) => g.entries.every((e) => e.o.divisionId === g.val)), [true, true, true]);
  s.eq('no levels: one list in Planning’s order', M.arrange(D, es, []).flat.map((e) => e.o.id), es.slice().sort(M.objSort).map((e) => e.o.id));
  /* objectives in no project: "No project" in their own division, after its projects */
  const lone = Object.assign({}, objOf(AST), { id: 'OBJ-LONE', initiativeId: null });
  const es2 = es.concat([{ o: lone, docKey: 'EXEC-DIV-FC', own: false, full: true, exps: [], tiles: [] }]);
  s.eq('No project last in its division', M.arrange(D, es2, ['project']).groups.map((g) => g.key).slice(0, 3), ['INIT-FC-01', 'INIT-FC-02', '~DIV-FC']);
  s.eq('owners together, roster emails first, then names nobody matches', M.ownerKey(D, { owner: ['Toru', 'priya@celadyne.com', 'Zed Q', 'toru@celadyne.com'] }), 'priya@celadyne.com+toru@celadyne.com+Zed Q');
  s.eq('dimension values', ['project', 'division', 'unit', 'product', 'model', 'quarter', 'owner'].map((d) => M.dimKey(D, objOf(LOCK), d)), ['INIT-EL-01', 'DIV-EL', 'UNIT-TECHNI', 'PRD-EL-1', 'MDL-EL-1-1', '2026Q4', 'priya@celadyne.com+toru@celadyne.com']);
});
s.step('Group and sort: one button after the quarter menu; its popover holds Group by and Sort by, Project and Planning order by default', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  const b = gsBtn();
  s.eq('beside the view and the quarter, closed, untinted, named plainly', [inside(b, 'scope'), b.parent.attrs.class, b.attrs.class, b.attrs['aria-haspopup'], b.attrs['aria-expanded'], b.attrs['aria-label'], b.attrs.title || '', textOf(b)],
    [true, 'above anchor', 'btn mine-gsbtn', 'dialog', 'false', 'Group and sort', '', 'Group and sort']);
  const iQ = s.els.indexOf(s.find('Quarter', { tag: 'select' })), iB = s.els.indexOf(b), iRoll = s.els.findIndex(dataK('roll')), iTree = s.els.findIndex(dataK('tree'));
  s.ok(iQ >= 0 && iQ < iB && iB < iRoll && iRoll < iTree, 'after the quarter menu, above the panel, which is above the tree');
  s.ok(!gsPop() && !s.has(dataK('arrange')) && !s.has('Sort by') && !s.has('Group by'), 'closed: no bar above the panel, no controls on the page');
  s.click('Group and sort');
  const pop = s.find(dataK('group-sort-pop'));
  s.eq('it opens: a dialog hung from the button, which says so; it can take the focus', [s.c.state.menu, gsBtn().attrs['aria-expanded'], pop.attrs.role, pop.attrs['aria-label'], pop.parent === gsBtn().parent, s.vals.ui.anyMenu, pop.attrs.tabindex],
    ['mine.gs', 'true', 'dialog', 'Group and sort', true, true, '-1']);
  const A = s.vals.sh.arrange;
  s.eq('one level, Project, numbered', A.levels.map((l) => [l.n, l.v, l.aria]), [['1', 'project', 'Group by']]);
  s.eq('a level to add', A.addOpts.map((o) => o.label), ['Add a level…', 'Division', 'Unit', 'Product', 'Model', 'Quarter', 'Owner']);
  s.eq('the sorts', A.sort.opts.map((o) => o.label), ['Planning order', 'Score, lowest first', 'Score, highest first', 'Most behind schedule first', 'End date, soonest first', 'End date, latest first', 'Name, A to Z']);
  s.eq('Planning order', A.sort.v, '');
  s.eq('the arrangement in words; nothing to go back to', [gsWords(), s.has('Back to the default')], ['Grouped by project, in Planning order.', false]);
  s.ok(inside(s.find('Sort by', { tag: 'select' }), 'group-sort-pop') && inside(s.find('Group by', { tag: 'select' }), 'group-sort-pop') && inside(s.find('Add a grouping level'), 'group-sort-pop'), 'Group by, Add a level and Sort by are in it');
  s.ok(!inside(s.find('Sort by', { tag: 'select' }), 'tree') && !inside(s.find('Group by', { tag: 'select' }), 'roll'), 'outside both: it arranges both');
  s.eq('the tree as before: a row per project, in Planning order', rows().filter((r) => /k-proj/.test(r.cls)).map((r) => r.k.slice(2)), s.c.ctx.groups.map((g) => g.key));
  s.eq('the timeline the same', tlSeq(), treeSeq());
  s.eq('nothing stored for the default', store.rd_mine_arrange, undefined);
  s.click('Close menu');
  s.eq('a click outside it closes it', [s.c.state.menu, gsPop(), gsBtn().attrs['aria-expanded']], ['', false, 'false']);
  s.click('Group and sort');
  s.click('Group and sort');
  s.eq('so does the button', [s.c.state.menu, gsPop()], ['', false]);
  /* nothing in view (the CEO's Team Projects with no business division yet): no button; the view and the quarter stay */
  fresh('dana@celadyne.com');
  P().divisions.forEach((d) => { d.kind = 'rd'; });
  s.render();
  s.eq('nothing in view: no button; the view and the quarter stay', [s.vals.sh.hasTree, s.has(dataK('group-sort')), s.has('Quarter', { tag: 'select' }), s.has('Team Projects', { tag: 'button' })], [false, false, true, true]);
  s.clean('arrange default');
});
s.step('Group and sort: changes apply at once and it stays open; tinted and named while not the default; Back to the default', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  gsType('Group by', 'division');
  gsType('Add a grouping level', 'project');
  gsType('Sort by', 'score');
  s.eq('three changes, still open', [gsPop(), s.c.state.menu], [true, 'mine.gs']);
  s.eq('levels numbered outer first', s.vals.sh.arrange.levels.map((l) => [l.n, l.v, l.aria]), [['1', 'division', 'Group by, level 1'], ['2', 'project', 'Group by, level 2']]);
  s.eq('the arrangement in words', gsWords(), 'Grouped by division, then project, lowest score first.');
  s.eq('the button: tinted, its name and tooltip say the arrangement, its text stays', [gsBtn().attrs.class, gsBtn().attrs['aria-label'], gsBtn().attrs.title, textOf(gsBtn())],
    ['btn mine-gsbtn on', 'Group and sort: Grouped by division, then project, lowest score first.', 'Grouped by division, then project, lowest score first.', 'Group and sort']);
  s.eq('the timeline and the tree follow at once', [treeSeq()[0], tlSeq()], ['p:division:DIV-FC', treeSeq()]);
  s.key(dataK('group-sort-pop'), 'Escape');
  s.eq('Escape closes it; the tint stays', [gsPop(), s.c.state.menu, gsBtn().attrs.class], [false, '', 'btn mine-gsbtn on']);
  gsOpen();
  s.key(dataK('group-sort-pop'), 'Enter');
  s.eq('other keys leave it open', gsPop(), true);
  s.click('Close', { within: 'group-sort-pop' });
  s.eq('Close closes it', [gsPop(), s.c.state.menu], [false, '']);
  gsOpen();
  s.key(dataK('group-sort'), 'Escape');
  s.eq('Escape on the button closes it too', [gsPop(), s.c.state.menu], [false, '']);
  s.key(dataK('group-sort'), 'Escape');
  s.key(dataK('group-sort'), 'Enter');
  s.eq('with it closed, keys on the button open nothing', gsPop(), false);
  /* every sort and every level, in words */
  const sorts = [['', 'in Planning order'], ['score-desc', 'highest score first'], ['slip', 'most behind schedule first'], ['end', 'soonest end first'], ['end-desc', 'latest end first'], ['name', 'by name, A to Z'], ['score', 'lowest score first']];
  s.eq('each sort in words', sorts.map(([v]) => { gsType('Sort by', v); return gsWords(); }), sorts.map(([, w]) => 'Grouped by division, then project, ' + w + '.'));
  const dims = ['unit', 'product', 'model', 'quarter', 'owner'];
  s.eq('each level in words', dims.map((d) => { gsType('Group by, level 2', d); return gsWords(); }), dims.map((d) => 'Grouped by division, then ' + d + ', lowest score first.'));
  gsType('Group by, level 2', 'project');
  /* a page opened later in this browser: tinted from the start */
  fresh('corey@celadyne.com', true);
  s.click('Team Projects');
  s.eq('a new page keeps it, tinted and named', [s.c.state.mine_gb, s.c.state.mine_sort, gsBtn().attrs.class, gsBtn().attrs['aria-label']], [['division', 'project'], 'score', 'btn mine-gsbtn on', 'Group and sort: Grouped by division, then project, lowest score first.']);
  gsClick('Back to the default');
  s.eq('Back to the default: Project, Planning order, nothing stored; still open', [s.c.state.mine_gb, s.c.state.mine_sort, store.rd_mine_arrange, gsPop()], [['project'], '', undefined, true]);
  s.eq('untinted, named plainly, nothing to go back to', [gsBtn().attrs.class, gsBtn().attrs['aria-label'], gsBtn().attrs.title || '', s.has('Back to the default'), gsWords()], ['btn mine-gsbtn', 'Group and sort', '', false, 'Grouped by project, in Planning order.']);
  s.eq('the tree as before', rows().filter((r) => /k-proj/.test(r.cls)).map((r) => r.k.slice(2)), s.c.ctx.groups.map((g) => g.key));
  gsType('Sort by', 'name');
  s.eq('the sort alone isn’t the default', [gsBtn().attrs.class, gsWords(), s.has('Back to the default')], ['btn mine-gsbtn on', 'Grouped by project, by name, A to Z.', true]);
  gsType('Sort by', '');
  gsType('Group by', 'quarter');
  s.eq('a level alone isn’t either', [gsBtn().attrs.class, gsWords()], ['btn mine-gsbtn on', 'Grouped by quarter, in Planning order.']);
  gsClick('Remove the quarter level');
  s.eq('no levels: one list, and it says so', [gsWords(), s.vals.sh.arrange.flat, s.has('No levels, so objectives show as one list.'), s.vals.sh.arrange.addOpts[0].label, gsBtn().attrs.class],
    ['One list, not grouped, in Planning order.', true, true, 'Group by…', 'btn mine-gsbtn on']);
  gsType('Add a grouping level', 'project');
  s.eq('Project again: the default, untinted, nothing stored', [s.c.state.mine_gb, gsBtn().attrs.class, store.rd_mine_arrange, gsPop()], [['project'], 'btn mine-gsbtn', undefined, true]);
  s.clean('group and sort');
});
s.step('Division, then Project: the timeline and the tree, layer by layer', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  gsType('Group by', 'division');
  s.eq('Division alone', s.c.state.mine_gb, ['division']);
  gsType('Add a grouping level', 'project');
  s.eq('then Project under it', [s.c.state.mine_gb, s.vals.sh.arrange.levels.map((l) => [l.aria, l.n])], [['division', 'project'], [['Group by, level 1', '1'], ['Group by, level 2', '2']]]);
  s.eq('a level’s menu leaves out the other levels', s.vals.sh.arrange.levels[0].opts.map((o) => o.v), ['division', 'unit', 'product', 'model', 'quarter', 'owner']);
  s.eq('kept in this browser', JSON.parse(store.rd_mine_arrange), { gb: ['division', 'project'], sort: '' });
  const c = s.c.ctx;
  const want = [];
  ['DIV-FC', 'DIV-EL', 'DIV-BD'].forEach((d) => { want.push('p:division:' + d); c.groups.filter((g) => g.divId === d).forEach((g) => { want.push('p:division:' + d + '/' + g.key); g.entries.forEach((e) => want.push('o:' + e.o.id)); }); });
  s.eq('the tree: each division, its projects, their objectives', treeSeq(), want);
  s.eq('the timeline the same', tlSeq(), want);
  const fcF = engineFacts().filter((f) => f.e.o.divisionId === 'DIV-FC');
  const xs = fcF.filter((f) => !f.ended && f.sc != null).map((f) => f.sc);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const fc = row('p:division:DIV-FC');
  s.eq('a division’s row: its objectives’ mean, in the score bands', [fc.tagText, fc.name, fc.sub, fc.score, fc.stWord, fc.barStyle], ['Division', 'Fuel Cell', 'R&D division', String(Math.round(mean)), F.bandWord(F.band(mean)), 'width: ' + Math.round(mean) + '%']);
  s.eq('and their statuses', fc.cap, '4 objectives: 2 off track, 1 at risk, 1 not started');
  s.eq('a business division', row('p:division:DIV-BD').sub, 'Business division');
  const T = roll().tl;
  const tr = (k) => T.rows.find((r) => r.k === k);
  s.eq('the timeline’s division row', [tr('tlp:division:DIV-FC').cls, tr('tlp:division:DIV-FC').tagText, tr('tlp:division:DIV-FC').tagCls, tr('tlp:division:DIV-FC').padStyle], ['mine-tlrow is-grp is-set is-top', 'Division', 'tag', '--lv: 0']);
  s.eq('a project under it', [tr('tlp:division:DIV-FC/INIT-FC-01').cls, tr('tlp:division:DIV-FC/INIT-FC-01').tagText, tr('tlp:division:DIV-FC/INIT-FC-01').padStyle], ['mine-tlrow is-grp is-proj', 'Project', '--lv: 1']);
  s.eq('its objectives under that', tr('tlo:' + AST).padStyle, '--lv: 1');
  s.ok(tr('tlp:division:DIV-FC/INIT-FC-01').flags.length === 2, 'the project keeps its milestones');
  const n = T.rows.length;
  gsClose();
  s.click('Fold Fuel Cell');
  const fr = roll().tl.rows.find((r) => r.k === 'tlp:division:DIV-FC');
  s.eq('a division folds: its projects and objectives leave the timeline', [roll().tl.rows.length, fr.count, fr.hasBar, fr.barCls], [n - 6, '4 objectives', true, 'mine-tbar t-' + paceTone(mean)]);
  s.eq('the tree keeps them', objIds().filter((id) => divOf(id) === 'DIV-FC').length, 4);
  s.click('Open Fuel Cell');
  s.click('Show only Fuel Cell below', { tag: 'button' });
  s.eq('a division’s name filters the tree to it', [s.vals.sh.text.v, [...new Set(objIds().map(divOf))]], ['Fuel Cell', ['DIV-FC']]);
  s.key('Filter by name', 'Escape');
  s.click('Collapse to objectives');
  s.eq('Collapse to objectives: every group open, objectives closed', [...new Set(rows().map((r) => r.cls.split(' ')[1]))].sort(), ['k-obj', 'k-proj', 'k-set']);
  s.click('Expand all');
  s.c.setState({ mine_depth: '' });
  s.click('Collapse Fuel Cell');
  s.ok(row('p:division:DIV-FC').hasFlag && /^A reading is due inside/.test(row('p:division:DIV-FC').flagTitle), 'a closed division flags a reading due inside it');
  s.eq('the lede doesn’t change', s.vals.sh.lede, 'Every division: 5 projects and 9 objectives. Click a value to update it.');
  gsClick('Remove the division level');
  s.eq('back to Project alone: the default, stored as nothing', [s.c.state.mine_gb, store.rd_mine_arrange], [['project'], undefined]);
  s.clean('division project');
});
s.step('Unit, product, model and quarter, as Planning reads them', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  const top = () => sets().filter((r) => !/\//.test(r.k)).map((r) => [r.name, r.sub]);
  gsType('Group by', 'unit');
  s.eq('by unit, in Planning’s order, with their divisions', top(), [['Technical', 'Fuel Cell and Electrolyzer'], ['Business', 'Business Development']]);
  s.ok(under('unit').every(([id, u]) => u === RD.unitIdOfDivision(objOf(id).divisionId, P())), 'each objective under its division’s unit');
  gsType('Group by', 'product');
  s.ok(under('product').every(([id, p]) => p === (RD.effProduct(objOf(id), P()) || '')), 'by product: each objective where the engine puts it (its own, else its project’s)');
  s.eq('products in Planning’s order, No product last', top(), [['HP membrane', 'Fuel Cell'], ['Tera stack', 'Electrolyzer'], ['No product', 'Objectives not tied to a product']]);
  gsType('Add a grouping level', 'model');
  s.eq('models under their products', sets().map((r) => r.k.slice(2) + ' ' + r.name), ['product:PRD-FC-1 HP membrane', 'product:PRD-FC-1/model:MDL-FC-1-1 HP6-12', 'product:PRD-EL-1 Tera stack', 'product:PRD-EL-1/model:MDL-EL-1-1 Tera 25-30-R5', 'product:PRD-EL-1/model: No model', 'product: No product', 'product:/model: No model']);
  s.eq('a model’s product as its subtitle', row('p:product:PRD-FC-1/model:MDL-FC-1-1').sub, 'HP membrane');
  const cut = objOf(CUT);
  cut.modelId = 'MDL-EL-2-1';
  s.render();
  s.eq('an objective’s own model wins over its project’s', [under('product').find(([id]) => id === CUT)[1], row('p:product:PRD-EL-2/model:MDL-EL-2-1').name], ['PRD-EL-2', 'Tera 250 kW skid']);
  cut.modelId = null;
  /* Model alone: models in their products' order (division, then product), whatever their own order says */
  gsClick('Remove the product level');
  P().models.find((m) => m.id === 'MDL-FC-1-1').order = 5;
  s.render();
  s.eq('Model alone: by product first', top().map((x) => x[0]), ['HP6-12', 'Tera 25-30-R5', 'No model']);
  P().models.find((m) => m.id === 'MDL-FC-1-1').order = 1;
  s.render();
  gsType('Group by', 'quarter');
  s.eq('quarters by date', top(), [['Q4 2026', 'Oct 1 to Dec 31'], ['Q1 2027', 'Jan 1, 2027 to Mar 31, 2027']]);
  cut.quarter = '';
  s.render();
  s.eq('no quarter: last', top().map((x) => x[0]), ['Q4 2026', 'Q1 2027', 'No quarter']);
  cut.quarter = '2027Q1';
  s.clean('dims');
});
s.step('Owner: each objective once; co-owners together; yours first', () => {
  fresh('toru@celadyne.com');
  s.click('Team Projects');
  gsType('Group by', 'owner');
  s.eq('yours, then yours with someone', sets().map((r) => [r.name, r.sub, r.owners.map((o) => o.ini)]), [['You', 'Lead', ['TH']], ['You and Priya Natarajan', 'Owned together', ['TH', 'PN']]]);
  s.eq('their objectives', under('owner'), [[QUAL, 'toru@celadyne.com'], [CUT, 'toru@celadyne.com'], [LOCK, 'priya@celadyne.com+toru@celadyne.com']]);
  s.eq('each objective once', objIds().length, s.c.ctx.entries.length);
  objOf(CUT).owner = ['erin@celadyne.com'];
  s.render();
  s.eq('yours, and yours with others, before anyone else’s', sets().map((r) => r.name), ['You', 'You and Priya Natarajan', 'Erin Walsh']);
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  gsType('Group by', 'owner');
  s.eq('by name', sets().map((r) => r.name), ['Erin Walsh', 'Erin Walsh and Maya Okafor', 'Maya Okafor', 'Priya Natarajan and Toru Hayashi', 'Sam Rivera', 'Toru Hayashi']);
  s.eq('each objective once, in a timeline row each', [objIds().length, roll().tl.rows.filter((r) => r.isObj).length], [9, 9]);
  objOf(PILOT).owner = ['Zed Q'];
  objOf(HUB).owner = [];
  s.render();
  s.eq('a name nobody matches; no owner last', sets().slice(-2).map((r) => [r.name, r.sub]), [['Zed Q', 'Not on the roster'], ['No owner', 'Objectives with no owner yet']]);
  s.clean('owner');
});
s.step('Sort by: objectives inside their groups, groups by what their rows show', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  const fx = {};
  engineFacts().forEach((f) => { fx[f.e.o.id] = f; });
  const slipOf = (id) => (fx[id].slip > 0 ? fx[id].slip : 0);
  const projScore = (k) => { const id = k.replace(/^p:/, ''); return id[0] === '~' ? null : RD.rollupInitiative(id, P(), emAll()); };
  const lastEnd = (g) => Math.max(...g.objs.map((id) => objOf(id).plannedEnd));
  gsType('Sort by', 'score');
  s.eq('stored', JSON.parse(store.rd_mine_arrange), { gb: ['project'], sort: 'score' });
  let G = groupsNow();
  s.ok(G.every((g) => inOrder(g.objs, nullsLast(scoreOf, 1))), 'lowest score first in each project, unscored last');
  s.ok(inOrder(G.map((g) => g.k), nullsLast(projScore, 1)), 'projects by their Planning score, lowest first');
  s.eq('the timeline the same', tlSeq(), treeSeq());
  /* an objective with no score, first in Planning order, goes last; "No project" has no score of its own */
  const E = s.ns.RD, score = E.objectiveScore;
  /* AST (scored) out of its project: "No project" in Fuel Cell; a group with a score inside it, but none of its own */
  objOf(AST).initiativeId = null;
  try {
    E.objectiveScore = function (id) { return id === QUAL ? null : score.apply(this, arguments); };
    s.render();
    s.eq('no score, first in Planning order: last', groupsNow().find((g) => g.k === 'p:INIT-EL-01').objs, [LOCK, QUAL]);
    /* the projects without a score (No project, and Stack cost-down, whose one objective has none) after the rest,
       in Planning order among themselves */
    s.eq('No project, with no score of its own: after every scored project', groupsNow().slice(-2).map((g) => g.k), ['p:~DIV-FC', 'p:INIT-EL-02']);
    gsType('Sort by', 'score-desc');
    G = groupsNow();
    s.eq('highest first: still last', [G.find((g) => g.k === 'p:INIT-EL-01').objs, G.slice(-2).map((g) => g.k)], [[LOCK, QUAL], ['p:~DIV-FC', 'p:INIT-EL-02']]);
    gsType('Sort by', '');
    s.eq('Planning order: No project last in its division', groupsNow().map((g) => g.k).slice(0, 3), ['p:INIT-FC-01', 'p:INIT-FC-02', 'p:~DIV-FC']);
    gsType('Sort by', 'name');
    s.eq('by name: No project last', groupsNow().slice(-1)[0].k, 'p:~DIV-FC');
    s.eq('its row shows no score', [row('p:~DIV-FC').hasScore, row('p:~DIV-FC').name], [false, 'No project']);
  } finally { E.objectiveScore = score; objOf(AST).initiativeId = 'INIT-FC-02'; s.render(); }
  gsType('Sort by', 'score-desc');
  G = groupsNow();
  s.ok(G.every((g) => inOrder(g.objs, nullsLast(scoreOf, -1))) && inOrder(G.map((g) => g.k), nullsLast(projScore, -1)), 'highest first; unscored still last');
  /* the first project in Planning order without a score: it goes last, however the sort meets it */
  const roll0 = E.rollupInitiative;
  try {
    E.rollupInitiative = function (id) { return id === 'INIT-FC-01' ? null : roll0.apply(this, arguments); };
    ['score', 'score-desc'].forEach((so) => {
      gsType('Sort by', so);
      s.eq(so + ': a project with no score after every scored one', groupsNow().slice(-2).map((g) => g.k), ['p:INIT-FC-01', 'p:INIT-EL-02']);
    });
  } finally { E.rollupInitiative = roll0; s.render(); }
  gsType('Sort by', 'slip');
  G = groupsNow();
  s.ok(G.every((g) => inOrder(g.objs, (a, b) => slipOf(b) - slipOf(a))), 'most behind first in each project');
  s.eq('projects with the worst slip first', G.slice(0, 2).map((g) => g.k), ['p:INIT-FC-02', 'p:INIT-BD-01']);
  s.eq('inside one: the 18 days first', G[1].objs, [HUB, PILOT]);
  gsType('Sort by', 'end');
  G = groupsNow();
  s.ok(G.every((g) => inOrder(g.objs, (a, b) => objOf(a).plannedEnd - objOf(b).plannedEnd)) && inOrder(G, (a, b) => lastEnd(a) - lastEnd(b)), 'soonest end first; a project by its last objective’s end');
  s.eq('the projects, ties in Planning order', G.map((g) => g.k), ['p:INIT-FC-02', 'p:INIT-EL-01', 'p:INIT-FC-01', 'p:INIT-EL-02', 'p:INIT-BD-01']);
  gsType('Sort by', 'end-desc');
  G = groupsNow();
  s.ok(G.every((g) => inOrder(g.objs, (a, b) => objOf(b).plannedEnd - objOf(a).plannedEnd)) && inOrder(G, (a, b) => lastEnd(b) - lastEnd(a)), 'latest end first');
  s.eq('the projects, latest first', G.map((g) => g.k), ['p:INIT-FC-01', 'p:INIT-EL-02', 'p:INIT-BD-01', 'p:INIT-FC-02', 'p:INIT-EL-01']);
  gsType('Sort by', 'name');
  G = groupsNow();
  const nm = (k) => row(k).name;
  s.ok(G.every((g) => inOrder(g.objs, (a, b) => objOf(a).statement.localeCompare(objOf(b).statement))) && inOrder(G.map((g) => g.k), (a, b) => nm(a).localeCompare(nm(b))), 'A to Z, projects too');
  /* no levels: one list, sorted */
  gsType('Sort by', 'score');
  gsClick('Remove the project level');
  s.eq('one list, by score', [rows().filter((r) => /k-(proj|set)/.test(r.cls)).length, inOrder(objIds(), nullsLast(scoreOf, 1))], [0, true]);
  s.eq('so is the timeline', [roll().tl.rows.every((r) => r.isObj && r.padStyle === '--lv: 0; --ob: 0px'), tlSeq()], [true, treeSeq()]);
  s.eq('it says so', s.vals.sh.arrange.flat, true);
  s.eq('stored', JSON.parse(store.rd_mine_arrange), { gb: [], sort: 'score' });
  fresh('corey@celadyne.com', true);
  s.click('Team Projects');
  s.eq('a new page in this browser keeps it', [s.c.state.mine_gb, s.c.state.mine_sort, inOrder(objIds(), nullsLast(scoreOf, 1))], [[], 'score', true]);
  gsType('Sort by', '');
  gsType('Add a grouping level', 'project');
  s.eq('back to the default: nothing stored', store.rd_mine_arrange, undefined);
  s.clean('sort');
});
s.step('every level and every sort, one and two levels deep: the timeline and the tree agree, each objective once', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  const dims = ['project', 'division', 'unit', 'product', 'model', 'quarter', 'owner'];
  const sorts = ['', 'score', 'score-desc', 'slip', 'end', 'end-desc', 'name'];
  const n = s.c.ctx.entries.length;
  let tried = 0, agree = 0, once = 0;
  const check = () => {
    tried++;
    const ids = objIds();
    if (ids.length === n && new Set(ids).size === n) once++;
    if (JSON.stringify(tlSeq()) === JSON.stringify(treeSeq())) agree++;
  };
  dims.forEach((d) => sorts.forEach((so) => { s.c.setState({ mine_gb: [d], mine_sort: so }); s.render(); check(); }));
  dims.forEach((a) => dims.forEach((b2) => { if (a !== b2) { s.c.setState({ mine_gb: [a, b2], mine_sort: 'score' }); s.render(); check(); } }));
  s.eq('every arrangement tried', tried, 7 * 7 + 7 * 6);
  s.eq('each objective once in each', once, tried);
  s.eq('the timeline as the tree in each', agree, tried);
  s.clean('every arrangement');
});
s.step('past 12 objectives in layers: the last level starts folded', () => {
  fresh('corey@celadyne.com');
  teamScope('~Every division');
  s.click('Team Projects');
  s.type('Quarter', '*');
  [1, 2, 3].forEach((i) => P().objectives.push({ id: 'OBJ-EL-2026Q4-1' + i, divisionId: 'DIV-EL', initiativeId: 'INIT-EL-02', quarter: '2026Q4', statement: 'Extra objective ' + i, owner: ['toru@celadyne.com'], plannedStart: s.c.D.today - 5, plannedEnd: s.c.D.today + 40, milestoneIds: [], order: 10 + i }));
  s.render();
  gsType('Group by', 'division');
  gsType('Add a grouping level', 'project');
  const T = roll().tl;
  s.eq('13 objectives: divisions open, their projects folded', [s.c.ctx.entries.length, T.rows.filter((r) => r.cls.indexOf('is-set') >= 0).every((r) => r.caretExp === 'true'), T.rows.filter((r) => r.isProj).every((r) => r.caretExp === 'false'), T.rows.filter((r) => r.isObj).length], [13, true, true, 0]);
  gsClick('Remove the project level');
  s.ok(roll().tl.rows.filter((r) => r.isGrp).every((r) => r.caretExp === 'false'), 'Division alone: each division folded');
  gsClick('Remove the division level');
  s.eq('no levels: nothing to fold', roll().tl.rows.filter((r) => r.isObj).length, 13);
  s.clean('fold layers');
});
s.step('a stored arrangement that no longer fits', () => {
  const at = (v) => { store.rd_mine_arrange = v; fresh('corey@celadyne.com', true); return [s.c.state.mine_gb, s.c.state.mine_sort]; };
  s.eq('unreadable: the default', at('{not json'), [['project'], '']);
  s.eq('unknown levels and sorts drop out', at(JSON.stringify({ gb: ['division', 'galaxy', 'division'], sort: 'sideways' })), [['division'], '']);
  s.eq('nothing known left: the default levels', at(JSON.stringify({ gb: ['galaxy'], sort: 'name' })), [['project'], 'name']);
  s.eq('no levels is a choice', at(JSON.stringify({ gb: [], sort: '' })), [[], '']);
  s.eq('not an object: the default', at(JSON.stringify(['division'])), [['project'], '']);
  delete store.rd_mine_arrange;
});

done();
