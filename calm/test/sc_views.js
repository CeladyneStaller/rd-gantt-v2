/* Scenario test for the views by direct link (apps/exec shell, decided October 15), on both boards.
     node test/sc_views.js out/Main.dc.html
     node test/sc_views.js out/Sales-A.dc.html
   1. "Link to this view" beside the tabs: which tabs have one, Editable or Read-only, the link, Copy link, and
      Open in a new tab (a sample board has one tab, so the view shows here, as a fresh load would).
   2. The view pages (round 2, October 21): no sidebar, tabs or app top bar. The top label stands in for it
      (app / unit / division / quarter / view, the save state or Read-only, Open in …). Every view has the
      objective head with a panel of its own: the Overview keeps the app's five facts, Key results, Stage-gates
      and Kanban have theirs, checked against the engine, the review table and the board. The schedule note
      shows on Overview and Stage-gates; End objective and Reopen stay on the Overview.
   3. Editable views save like the app; read-only views hide every editing control.
   4. Links inside a view: a review row opens its own view with the item highlighted, Risks rows and Current step
      the app's tab, "Open in …" the app on the view's tab.
   5. Settings › Open a link: the View parameter.
   The live pages (?view= on a fresh load, ?item=, ?tab=, window.open, the tab title, an unknown objective, no
   token) are in sc_exec_live.js. */
const { Sim, done, textOf } = require('./dc');
const RD = require(require('./engine_path'));

const file = process.argv[2] || 'out/Main.dc.html';

/* ---- record which handler sites (event@template line) the scenarios fire ---- */
const fired = new Set();
const origFire = Sim.prototype.fire;
Sim.prototype.fire = function (el, name, extra) { fired.add(name.toLowerCase() + '@' + el.line); return origFire.call(this, el, name, extra); };
const origType = Sim.prototype.type;
Sim.prototype.type = function (q, v, opts) {
  const el = this.all(q, opts).filter((e) => e.on.onChange || e.on.onInput)[(opts && opts.nth) || 0];
  if (el) fired.add((el.on.onChange ? 'onchange' : 'oninput') + '@' + el.line);
  return origType.call(this, q, v, opts);
};

let s = new Sim(file);
const SALES = s.c.APP === 'sales';
const APPWORD = SALES ? 'Sales' : 'Execution';
const FILE = SALES ? 'sales_app.html' : 'execution_app.html';
const OBJ = SALES ? 'OBJ-BD-2026Q4-01' : 'OBJ-EL-2026Q4-02';
const OBJ_NAME = SALES ? 'Close three utility pilot agreements' : 'Lock Tera 25-30-R5 components';
const DIV = SALES ? 'DIV-BD' : 'DIV-EL';
/* the top label's breadcrumb up to the view's name */
const CRUMB = SALES ? 'Sales / Business / Business Development / Q4 2026' : 'Execution / Technical / Electrolyzer / Q4 2026';
const EMPTY_OBJ = SALES ? 'OBJ-BD-2027Q1-01' : 'OBJ-EL-2027Q1-01';
const HOST = 'https://celadynestaller.github.io/rd-gantt-v2/';

const fresh = () => { s = new Sim(file); s.c.setState({ objId: OBJ, tab: 'overview' }); s.render(); return s; };
const toasts = () => (s.c.state.toasts || []).map((t) => t.text);
const has = (q, opts) => s.has(q, opts);
const hasSide = () => has((el) => el.tag === 'aside' && el.attrs['aria-label'] === 'Navigation');
const hasTop = () => has((el) => el.tag === 'header' && el.attrs.class === 'top');      // the app's top bar
const hasVTop = () => has((el) => el.tag === 'header' && el.attrs['data-k'] === 'view-top');   // a view page's top label
const hasTabs = () => has((el) => el.attrs['aria-label'] === 'Objective sections');
const hasHead = () => has((el) => el.attrs['data-k'] === 'objective-head');
const pillText = () => { const p = s.all((el) => el.attrs['data-k'] === 'view-status')[0]; return p ? textOf(p) : ''; };
const crumb = () => { const n = s.all((el) => el.tag === 'nav', { within: 'view-top' })[0]; return n ? textOf(n) : ''; };
const facts = () => s.vals.sh.head.facts;
const fact = (k) => facts().find((f) => f.k === 'fact-' + k) || {};
const RV = { within: 'review' };
const expandReview = () => { if (has('Expand all', RV)) s.click('Expand all', RV); };
const page = () => textOf(s.find((el) => el.attrs.class === 'app'));
const vurl = () => { const u = s.all((el) => el.attrs['data-k'] === 'view-url')[0]; return u ? u.attrs.title : ''; };
const tab = (label) => { s.click(label, { within: 'Objective sections' }); return s; };
const review = () => s.vals.review;
const link = (txt) => (el) => el.tag === 'button' && /\breview-link\b/.test(el.attrs.class || '') && textOf(el).indexOf(txt) >= 0;
/* opening a view the way the sample does it: the popover's "Open in a new tab" on that tab */
function openView(label, ro, obj, prep) {
  fresh();
  if (obj) { s.c.setState({ objId: obj }); s.render(); }
  if (prep) { prep(); s.render(); }
  if (label !== 'Overview') tab(label);
  s.click('~Link to this view');
  s.click(ro ? 'Read-only' : 'Editable', { within: 'What the link allows' });
  s.click('Open in a new tab');
  return s;
}

/* ======================================================================== 1. Link to this view */
s.step('"Link to this view" sits beside the four tabs that have a view', () => {
  fresh();
  s.clean('first frame');
  s.ok(s.vals.sh.full && !s.vals.sh.vw, 'the whole app');
  ['Overview', 'Key results', 'Stage-gates', 'Kanban'].forEach((t) => { tab(t); s.ok(has('~Link to this view'), 'on ' + t); });
  ['Risks'].concat(SALES ? [] : ['Experiments']).forEach((t) => { tab(t); s.ok(!has('~Link to this view'), 'not on ' + t); });   // Sales has no Experiments tab since November 3
  tab('Overview');
  s.c.setState({ ro: true }); s.render();
  s.ok(has('~Link to this view'), 'in the read-only preview too: a link changes nothing');
  s.c.setState({ ro: false }); s.render();
  s.clean('tabs');
});

s.step('the popover: what the view shows, Editable or Read-only, the link, Copy link', () => {
  fresh();
  s.click('~Link to this view');
  s.eq('open', [s.c.state.menu, s.vals.sh.vlink.open], ['shell.vlink', true]);
  s.expect('Link to the Overview view');
  s.expect('Opens this objective’s Overview on a page of its own: the top label, the objective’s head with its score and pace, then the Overview. No sidebar or tabs.');
  s.eq('Editable to start', [s.vals.sh.vlink.editOn, s.vals.sh.vlink.roOn], ['true', 'false']);
  s.expect('Changes made on the page save, the same as here.');
  s.eq('the link', vurl(), FILE + '?objective=' + OBJ + '&view=overview');
  s.eq('it wraps between parameters', s.vals.sh.vlink.urlParts.map((p) => p.t), [FILE + '?objective=' + OBJ, '&view=overview']);
  s.click('Read-only', { within: 'What the link allows' });
  s.eq('Read-only adds &readonly', vurl(), FILE + '?objective=' + OBJ + '&view=overview&readonly');
  s.expect('Nothing on the page can be changed or saved. Filters and expanding rows still work.');
  let copied = '';
  const w = global.window.navigator.clipboard.writeText;
  global.window.navigator.clipboard.writeText = (t) => { copied = t; return { then(ok) { if (ok) ok(); return this; } }; };
  s.click('Copy link');
  global.window.navigator.clipboard.writeText = w;
  s.eq('Copy link copies the whole address', copied, HOST + FILE + '?objective=' + OBJ + '&view=overview&readonly');
  s.ok(toasts().indexOf('Link copied.') >= 0, 'and says so');
  s.click('Editable', { within: 'What the link allows' });
  s.eq('back to editable', vurl(), FILE + '?objective=' + OBJ + '&view=overview');
  tab('Key results');
  s.click('~Link to this view');
  s.expect('Link to the Key results view');
  s.expect('Opens this objective’s Key results on a page of its own: the top label, the objective’s head and a Key results panel, then the tab’s contents. No sidebar or tabs.');
  s.eq('each tab its own view', vurl(), FILE + '?objective=' + OBJ + '&view=krs');
  s.click('~Link to this view');
  s.eq('the button closes it', s.c.state.menu, '');
  s.clean('popover');
});

s.step('Open in a new tab: the sample has one tab, so the view shows here', () => {
  openView('Overview', false);
  s.eq('view mode', [s.c.state.view, s.c.ctx.view, s.c.ctx.tab, s.c.ctx.objId, s.c.state.ro], ['overview', 'overview', 'overview', OBJ, false]);
  s.ok(!hasSide() && !hasTop() && !hasTabs(), 'no sidebar, app top bar or tabs');
  s.ok(hasVTop(), 'the view\'s top label instead');
  s.clean('overview view');
});

/* ======================================================================== 2. the view pages */
s.step('the Overview view: the top label, the head with the app\'s panel, then the Overview', () => {
  fresh();
  const app = { facts: JSON.stringify(facts()), sched: JSON.stringify(s.vals.sh.head.sched) };
  openView('Overview', false);
  s.ok(!hasSide() && !hasTop() && !hasTabs(), 'no sidebar, app top bar or tabs');
  s.eq('the top label says where the page sits', crumb(), CRUMB + ' / Overview');
  s.eq('the view is the current page', s.all((el) => el.attrs['aria-current'] === 'page', { within: 'view-top' }).map(textOf), ['Overview']);
  s.ok(hasHead(), 'the objective head');
  s.expect(OBJ_NAME);
  s.expect('Week 2 of 13');
  s.eq('the app\'s five facts, as in the app', JSON.stringify(facts()), app.facts);
  s.eq('the five', facts().map((f) => f.label), ['Key results', 'Stage-gates', 'Gate health', 'Schedule', 'Open high risk']);
  s.eq('and its schedule note', JSON.stringify(s.vals.sh.head.sched), app.sched);
  s.ok(has((el) => el.attrs['data-k'] === 'review'), 'the review table');
  s.ok(has((el) => el.attrs['data-k'] === 'kpi-latest') && has((el) => el.attrs['data-k'] === 'ov-step') === !SALES && has((el) => el.attrs['data-k'] === 'initm'), SALES ? 'the two cards (no Current step in Sales since November 3)' : 'the three cards');
  s.ok(has('End objective'), 'editable: End objective');
  const owners = s.all((el) => /\bshl-owner\b/.test(el.attrs.class || ''));
  s.ok(owners.length > 0 && owners.every((el) => el.tag === 'span' && !el.on.onClick), 'owners are names, not filters');
  s.ok(!page().includes('Owners are set in'), 'no pointer to Planning');
  s.ok(/Saved/.test(pillText()) && pillText().includes('Open in ' + APPWORD), 'the top label: ' + pillText());
  s.ok(!pillText().includes('Read-only'), 'not read-only');
  s.clean('overview view');
});

const VIEW_FACTS = {
  'Key results': ['Key results', 'On pace', 'KPIs', 'Milestone steps'],
  'Stage-gates': ['Stage-gates', 'Gate health', 'Next gate', 'Schedule', 'Open high risk'],
  Kanban: ['Tiles', 'Stages overdue', 'Next stage due', 'Swimlane deadline']
};
[['Key results', 'kr-panel', SALES ? 'Sign three pilot agreements' : 'Qualify the second-source bipolar plate', 'Add key result'],
  ['Stage-gates', 'gates-panel', SALES ? 'Interconnection study scoped' : 'Second-source bipolar plate trial', 'Add gate'],
  ['Kanban', 'kb-panel', SALES ? 'Snake River Electric' : 'End plates and compression', 'Add tile']].forEach(([label, panel, sample, add]) => {
  s.step(label + ' view: the top label, the head with a panel of its own, then the tab\'s contents', () => {
    fresh();
    const app = { score: JSON.stringify(s.vals.sh.head.score), strip: JSON.stringify(s.vals.sh.head.strip), sched: JSON.stringify(s.vals.sh.head.sched) };
    openView(label, false);
    s.ok(!hasSide() && !hasTop() && !hasTabs(), 'no sidebar, app top bar or tabs');
    s.eq('the top label ends in the view', crumb(), CRUMB + ' / ' + label);
    s.ok(hasHead(), 'the objective head');
    s.expect(OBJ_NAME);
    s.eq('the quarter strip and the score and pace, as in the app', [JSON.stringify(s.vals.sh.head.strip), JSON.stringify(s.vals.sh.head.score)], [app.strip, app.score]);
    s.eq('its own facts', facts().map((f) => f.label), VIEW_FACTS[label]);
    s.eq(label === 'Stage-gates' ? 'the schedule note, as in the app' : 'no schedule note', JSON.stringify(s.vals.sh.head.sched), label === 'Stage-gates' ? app.sched : 'null');
    s.ok(!has('End objective'), 'End objective stays on the Overview');
    s.ok(has((el) => el.attrs['data-k'] === panel), 'its panel');
    s.ok(page().includes(sample), 'its contents: ' + sample);
    s.ok(!has((el) => el.attrs['data-k'] === 'review'), 'no review table');
    s.ok(has(add), 'editable: ' + add);
    s.ok(/Saved/.test(pillText()) && pillText().includes('Open in ' + APPWORD), 'the top label: ' + pillText());
    s.clean(label + ' view');
  });
});

/* the panels' facts, against the engine (rdcore.js, loaded on its own), the review table and the board */
const F = s.ns.F;
s.step('the Key results panel agrees with the review table and the engine', () => {
  /* the sample's main objective, and one with a partial check-in and three KPIs (Execution's OBJ-EL-2026Q4-01) */
  (SALES ? [OBJ] : [OBJ, 'OBJ-EL-2026Q4-01']).forEach((id) => {
    fresh();
    s.c.setState({ objId: id }); s.render();
    expandReview();
    const rows = review().groups.find((g) => g.label === 'Key results').rows;
    const krRows = rows.filter((r) => /^review:/.test(r.k));
    const kpiRows = rows.filter((r) => /^kpi:/.test(r.k));
    const stepRows = rows.filter((r) => /^step:/.test(r.k));
    openView('Key results', false, id);
    const ctx = s.c.ctx, em = ctx.em, o = ctx.obj, td = ctx.today;
    const krs = (ctx.doc.keyResults || []).filter((k) => k.objectiveId === id);
    const opc = RD.objectivePartialCount(id, em);
    const onTrack = krs.filter((k) => RD.band(RD.keyResultScore(k.id, em)) === 'on-track').length;
    s.eq(id + ': on track by score, as the review table bands them', krRows.filter((r) => r.stWord === 'On track').length, onTrack);
    s.eq(id + ': Key results', [fact('krs').value, fact('krs').detail], [String(krs.length), onTrack + ' on track by score' + (opc ? ', ' + opc + ' partial' : '')]);
    const paces = krs.map((k) => RD.keyResultPace(k.id, o, em, td)).filter((p) => p.attainment != null);
    const ahead = paces.filter((p) => p.gap != null && Math.round(p.gap) < 0).length;
    /* the Key results tab below says the same, row by row */
    const tabRows = s.vals.kr.rows;
    s.eq(id + ': on pace, as the tab bands them', tabRows.filter((r) => r.paceWord === 'On track').length, paces.filter((p) => p.band === 'on-track').length);
    s.eq(id + ': ahead, as the tab captions them', tabRows.filter((r) => r.capText === 'Ahead of pace' || (r.capText === 'Target met' && r.el < 100)).length, ahead);
    s.eq(id + ': On pace', [fact('pace').value, fact('pace').detail],
      [paces.filter((p) => p.band === 'on-track').length + ' of ' + paces.length, (ahead ? ahead + ' ahead' : 'None ahead') + ', ' + Math.round(paces[0].elapsed) + '% of the time used']);
    s.eq(id + ': all on pace reads good, any behind a warning', /\btx-ok\b/.test(fact('pace').vcls), paces.every((p) => p.band === 'on-track'));
    const n = {};
    kpiRows.forEach((r) => { const w = r.stWord.toLowerCase(); n[w] = (n[w] || 0) + 1; });
    s.eq(id + ': KPIs, in the review table\'s words', [fact('kpis').value, fact('kpis').detail],
      [String(kpiRows.length), kpiRows.length ? ['met', 'on track', 'near', 'below', 'no reading'].filter((w) => n[w]).map((w) => n[w] + ' ' + w).join(', ') : 'None on its key results']);
    const kTone = !kpiRows.length ? '' : n.below ? 'bad' : n.near ? 'warn' : n.met || n['on track'] ? 'ok' : 'none';
    s.eq(id + ': the KPIs\' tone: the worst word', (fact('kpis').vcls.match(/\btx-(\w+)/) || [0, ''])[1], kTone);
    const steps = [];
    krs.filter((k) => k.trackingType === 'milestone').forEach((k) => (k.steps || []).forEach((x) => steps.push(x)));
    s.eq(id + ': every step is in the review table', stepRows.length, steps.length);
    const dueOf = (x) => (typeof x.due === 'number' ? x.due : x.due ? F.fromIso(String(x.due).slice(0, 10)) : null);
    const next = steps.filter((x) => Number(x.completion) < 100 && dueOf(x) != null).sort((a, b) => dueOf(a) - dueOf(b))[0];
    s.eq(id + ': Milestone steps', [fact('steps').value, fact('steps').detail], steps.length
      ? [stepRows.filter((r) => r.stWord === 'Done').length + ' of ' + steps.length, next ? 'Next: ' + next.name + ', due ' + F.dayAuto(dueOf(next), td) : 'All done']
      : ['—', 'No milestone key results']);
  });
  s.clean('kr facts');
});

s.step('the Stage-gates panel: the app\'s gate facts, and the next gate as its panel shows it', () => {
  fresh();
  const app = {};
  facts().forEach((f) => { app[f.k] = JSON.stringify(f); });
  openView('Stage-gates', false);
  ['gates', 'health', 'schedule', 'risk'].forEach((k) => s.eq(k + ', as in the app', JSON.stringify(fact(k)), app['fact-' + k]));
  const ctx = s.c.ctx, td = ctx.today, doc = ctx.doc;
  const open = doc.stageGates.filter((g) => g.objectiveId === OBJ && g.actualDate == null && g.plannedDate != null).sort((a, b) => a.plannedDate - b.plannedDate);
  const g = open[0];
  const lab = s.ns.GATES.label(doc, g.id);
  const late = g.plannedDate < td;
  s.eq('Next gate: the earliest open one', fact('next').value, lab);
  s.ok(page().includes(lab + ' ') || page().includes(lab), 'the panel names it the same way');
  s.eq('how late or when due, and how ready', fact('next').detail,
    g.name + ', ' + (late ? F.plural(td - g.plannedDate, 'day') + ' late' : 'due ' + F.dayAuto(g.plannedDate, td)) + ', ' + Math.round(RD.stageGateScore(g.id, ctx.em)) + '% ready');
  s.eq('a late gate reads bad', /\btx-bad\b/.test(fact('next').vcls), late);
  s.eq('the sample: Execution\'s next gate is late, Sales\' is due', late, !SALES);
  /* the schedule note's button works here, as on the Overview */
  const sched = s.vals.sh.head.sched;
  s.ok(!!sched, 'a schedule note: ' + (sched && sched.text));
  s.click(sched.btn);
  s.ok(!!s.c.sheet(), sched.btn + ' opens the plan editor on the view page');
  s.c.closeSheet(); s.render();
  s.clean('gate facts');
});

s.step('the Kanban panel agrees with the board: tiles, stages overdue, the next stage due, the next swimlane deadline', () => {
  openView('Kanban', false);
  const ctx = s.c.ctx, td = ctx.today, doc = ctx.doc;
  const boards = doc.boards.filter((b) => b.objectiveId === OBJ);
  const tiles = [].concat.apply([], boards.map((b) => b.tiles || []));
  const fin = boards.reduce((n, b) => n + (b.tiles || []).filter((t) => !RD.tileInBacklog(t) && t.col === b.columns[b.columns.length - 1].id).length, 0);
  const back = tiles.filter((t) => RD.tileInBacklog(t)).length;
  s.eq('Tiles', [fact('tiles').value, fact('tiles').detail], [String(tiles.length), fin + ' finished' + (back ? ', ' + back + ' in the backlog' : '')]);
  const board = textOf(s.find((el) => el.attrs['data-k'] === 'kb-panel'));
  s.ok(board.includes(tiles.length + ' tiles in total') && board.includes(back + ' in the backlog'), 'as the board counts them');
  /* the board marks each overdue stage "Stage overdue, was due <day>" and the others "Stage due <day>", a day
     being today, tomorrow, yesterday or a date */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYW = '(today|tomorrow|yesterday|[A-Z][a-z]{2} \\d{1,2}(?:, \\d{4})?)';
  const dayOf = (w) => w === 'today' ? td : w === 'tomorrow' ? td + 1 : w === 'yesterday' ? td - 1
    : F.fromIso((w.split(', ')[1] || '2026') + '-' + String(MON.indexOf(w.slice(0, 3)) + 1).padStart(2, '0') + '-' + w.split(', ')[0].slice(4).padStart(2, '0'));
  const words = (re) => { const out = []; let m; const r = new RegExp(re, 'g'); while ((m = r.exec(board))) out.push(m[1]); return out; };
  const marks = words('Stage overdue, was due ' + DAYW);
  s.eq('Stages overdue: as many as the board marks', fact('overdue').value, String(marks.length));
  s.ok(marks.length > 0 && /\btx-bad\b/.test(fact('overdue').vcls), 'and reads bad');
  const worst = Math.min.apply(null, marks.map(dayOf));
  s.ok(fact('overdue').detail.indexOf(F.plural(td - worst, 'day') + ' late in ') > 0 && (marks.length > 1) === /^Worst: /.test(fact('overdue').detail), 'the worst: ' + fact('overdue').detail);
  /* the next stage due: the earliest "Stage due <day>" on the board, in its words */
  const dues = words('Stage due ' + DAYW);
  const first = dues.slice().sort((a, b) => dayOf(a) - dayOf(b))[0];
  s.ok(dues.length > 0 && dayOf(first) >= td, 'the board has stages due: ' + dues.join(', '));
  s.eq('Next stage due: the board\'s earliest, in its words', fact('nextdue').value, F.cap(first));
  const lanes = [].concat.apply([], boards.map((b) => b.swimlanes || [])).filter((l) => l.deadline).map((l) => ({ name: l.name, day: F.fromIso(String(l.deadline).slice(0, 10)) })).filter((l) => l.day >= td);
  const dl = Math.min.apply(null, lanes.map((l) => l.day));
  s.eq('the next swimlane deadline', fact('deadline').value, F.cap(dl - td === 0 ? 'today' : dl - td === 1 ? 'tomorrow' : F.dayAuto(dl, td)));
  s.ok(board.includes('due ' + fact('deadline').value), 'as the swimlane says it');
  s.ok(lanes.filter((l) => l.day === dl).every((l) => fact('deadline').detail.includes(l.name)) && (dl - td <= 1 || fact('deadline').detail.endsWith(', ' + F.rel(dl, td))), 'which lanes, and when: ' + fact('deadline').detail);
  s.clean('kanban facts');
});

s.step('an objective with nothing yet: each panel says so', () => {
  openView('Key results', false, EMPTY_OBJ);
  s.eq('Key results', facts().map((f) => f.value + ' ' + f.detail), ['0 No key results yet', '— No scores yet', '0 None on its key results', '— No milestone key results']);
  openView('Stage-gates', false, EMPTY_OBJ);
  s.eq('Next gate', [fact('next').value, fact('next').detail], ['—', 'No stage-gates yet']);
  openView('Kanban', false, EMPTY_OBJ);
  s.eq('Kanban', facts().map((f) => f.value + ' ' + f.detail), ['0 No kanban board yet', '0 No tiles yet', '— Nothing due', '— No swimlane deadlines']);
  s.ok(!/\btx-ok\b/.test(fact('overdue').vcls), 'nothing overdue is not "good" when there is nothing');
  s.clean('empty');
});

s.step('when every gate is passed, the next gate says so', () => {
  openView('Stage-gates', false, null, () => s.c.mutate((D) => {
    D.docs[s.c.ctx.docKey].stageGates.filter((g) => g.objectiveId === OBJ).forEach((g) => { if (g.actualDate == null) g.actualDate = s.c.ctx.today - 1; });
  }));
  s.eq('Next gate', [fact('next').value, fact('next').detail, /\btx-ok\b/.test(fact('next').vcls)], ['None', 'Every gate is passed', true]);
  s.clean('all passed');
});

s.step('a next gate that is due, not late, says when; a finished milestone list says all done', () => {
  openView('Stage-gates', false, null, () => s.c.mutate((D) => {
    D.docs[s.c.ctx.docKey].stageGates.filter((g) => g.objectiveId === OBJ && g.actualDate == null).forEach((g) => { g.plannedDate = s.c.ctx.today + 9; });
  }));
  s.ok(/, due [A-Z][a-z]{2} \d{1,2}, \d+% ready$/.test(fact('next').detail) && !/\btx-bad\b/.test(fact('next').vcls), 'due, not late: ' + fact('next').detail);
  s.eq('nine days out', fact('next').detail.indexOf('due ' + F.dayAuto(s.c.ctx.today + 9, s.c.ctx.today)) > 0, true);
  openView('Stage-gates', false, null, () => s.c.mutate((D) => {
    D.docs[s.c.ctx.docKey].stageGates.filter((g) => g.objectiveId === OBJ && g.actualDate == null).forEach((g, i) => { g.plannedDate = s.c.ctx.today + i; });
  }));
  s.ok(/, due today, \d+% ready$/.test(fact('next').detail) && !/\btx-bad\b/.test(fact('next').vcls), 'a gate due today is not late: ' + fact('next').detail);
  openView('Key results', false, null, () => s.c.mutate((D) => {
    D.docs[s.c.ctx.docKey].keyResults.filter((k) => k.objectiveId === OBJ && k.trackingType === 'milestone').forEach((k) => (k.steps || []).forEach((x) => { x.completion = 100; }));
  }));
  s.ok(/^(\d+) of \1$/.test(fact('steps').value) && fact('steps').detail === 'All done', 'all done: ' + fact('steps').value + ', ' + fact('steps').detail);
  s.clean('due and done');
});

s.step('a key result exactly on pace is on pace, not ahead, as the tab captions it', () => {
  let kid = '';
  openView('Key results', false, null, () => s.c.mutate((D) => {
    const ctx = s.c.ctx;
    const k = D.docs[ctx.docKey].keyResults.find((x) => x.objectiveId === OBJ);
    const el = RD.keyResultPace(k.id, ctx.obj, ctx.em, ctx.today).elapsed;
    kid = k.id;
    k.trackingType = 'percentage';
    k.progress = el + 0.25;   // a quarter point past the time used: rounds to no gap
  }));
  const row = s.vals.kr.rows.find((r) => r.id === kid);
  s.eq('the tab: On pace', row.capText, 'On pace');
  const others = s.vals.kr.rows.filter((r) => r.id !== kid && (r.capText === 'Ahead of pace' || (r.capText === 'Target met' && r.el < 100))).length;
  s.ok(fact('pace').detail.indexOf(others ? others + ' ahead' : 'None ahead') === 0, 'the panel leaves it out of ahead: ' + fact('pace').detail);
  s.clean('on pace');
});

s.step('only milestone key results count steps; the nearest of several swimlane deadlines', () => {
  /* a key result moved off milestone tracking keeps its steps in the data; neither the panel nor the review counts them */
  const ms = (D) => D.docs[s.c.ctx.docKey].keyResults.filter((k) => k.objectiveId === OBJ && k.trackingType === 'milestone');
  openView('Key results', false, null, () => s.c.mutate((D) => { ms(D).forEach((k) => { k.trackingType = 'percentage'; }); }));
  s.ok(s.c.D.docs[s.c.ctx.docKey].keyResults.some((k) => k.objectiveId === OBJ && (k.steps || []).length), 'the steps are still in the data');
  s.eq('Milestone steps', [fact('steps').value, fact('steps').detail], ['—', 'No milestone key results']);
  /* two swimlanes with deadlines: the nearer one */
  let lane = null;
  openView('Kanban', false, null, () => s.c.mutate((D) => {
    const b = D.docs[s.c.ctx.docKey].boards.find((x) => x.objectiveId === OBJ);
    const used = new Set(b.tiles.filter((t) => !RD.tileInBacklog(t) && t.col !== b.columns[b.columns.length - 1].id).map((t) => t.lane));
    const lanes = b.swimlanes.filter((l) => used.has(l.id));
    b.swimlanes.forEach((l) => { delete l.deadline; });
    lanes[0].deadline = F.iso(s.c.ctx.today + 40);
    lanes[1].deadline = F.iso(s.c.ctx.today + 10);
    lane = lanes[1];
  }));
  const near = s.c.ctx.today + 10;
  s.eq('the nearer deadline', [fact('deadline').value, fact('deadline').detail], [F.dayAuto(near, s.c.ctx.today), lane.name + ', ' + F.rel(near, s.c.ctx.today)]);
  s.clean('milestones and lanes');
});

s.step('an ended objective: Reopen on the Overview view only', () => {
  const end = () => s.c.mutate((D) => {
    const d = D.docs[s.c.ctx.docKey];
    d.objectiveState = (d.objectiveState || []).filter((r) => r.objectiveId !== OBJ).concat([{ objectiveId: OBJ, status: 'achieved', endedDay: s.c.ctx.today - 2, note: '' }]);
  });
  openView('Overview', false, null, end);
  s.ok(has('Reopen') && !has('End objective'), 'the Overview view: Reopen');
  s.expect('Achieved');
  ['Key results', 'Stage-gates', 'Kanban'].forEach((label) => {
    openView(label, false, null, end);
    s.eq(label + ' view: no Reopen', [crumb(), has('Reopen'), has('End objective')], [CRUMB + ' / ' + label, false, false]);
  });
  openView('Stage-gates', false, null, end);
  s.eq('an ended objective\'s schedule', [fact('schedule').value, s.vals.sh.head.sched], ['Achieved', null]);
  s.clean('ended');
});

/* ======================================================================== 3. editable and read-only */
s.step('an editable view saves like the app; the corner follows', () => {
  openView('Stage-gates', false);
  const before = JSON.stringify(s.c.D.docs[s.c.ctx.docKey].stageGateSets.find((x) => x.objectiveId === OBJ));
  s.click((el) => el.on.onClick && /^Chained: /.test(el.attrs['aria-label'] || ''));
  const after = s.c.D.docs[s.c.ctx.docKey].stageGateSets.find((x) => x.objectiveId === OBJ);
  s.ok(JSON.stringify(after) !== before && after.chained === false, 'the workstream is independent now');
  s.ok(/Saving/.test(pillText()), 'saving: ' + pillText());
  s.flush(3000);
  s.ok(/Saved/.test(pillText()), 'saved: ' + pillText());
  s.clean('saves');
});

s.step('the Overview view takes readings on its KPI and target rows, like the app (October 19)', () => {
  const NAME = SALES ? 'Qualified pipeline value' : 'Interfacial contact resistance';
  const RV = { within: 'review' };
  const expand = () => { if (has('Expand all', RV)) s.click('Expand all', RV); };
  openView('Overview', false);
  expand();
  s.click('Post a reading for ' + NAME, RV);
  s.type('New value for ' + NAME, SALES ? '4.2' : '8', RV);
  s.key('New value for ' + NAME, 'Enter', RV);
  s.ok(toasts().includes('Reading posted.'), 'posted on the view page');
  s.ok(/Saving/.test(pillText()), 'the corner says saving: ' + pillText());
  s.flush(3000);
  s.ok(/Saved/.test(pillText()), 'saved: ' + pillText());
  openView('Overview', true);
  expand();
  s.ok(!has('Post a reading for ' + NAME, RV) && !has('New value for ' + NAME, RV), 'a read-only view shows the value only');
  s.clean('overview readings');
});

s.step('read-only views: every editing control is gone, and nothing saves', () => {
  openView('Overview', true);
  s.eq('read-only', [s.c.state.view, s.c.state.ro], ['overview', true]);
  s.ok(pillText().includes('Read-only') && !/Saved/.test(pillText()), 'the corner says Read-only: ' + pillText());
  s.ok(!has('End objective') && !has('Revise') && !has('Build revised plan'), 'no End objective or Revise');
  openView('Key results', true);
  s.ok(!has('Add key result'), 'no Add key result');
  openView('Stage-gates', true);
  s.ok(!has('Add gate') && !has('Add workstream') && !has('Mark complete'), 'no gate editing');
  openView('Kanban', true);
  s.ok(!has('Add tile') && !has('Configure') && !has('Add board'), 'no board editing');
  s.ok(!page().includes('Drag a tile'), 'no drag hints');
  if (SALES || s.vals.kb.bl.groups.some((g) => g.empty)) s.expect('Nothing parked here.');
  const v = s.c.D.version;
  s.c.mutate(() => {}); s.render();
  s.eq('nothing changes', s.c.D.version, v);
  s.clean('read-only');
});

s.step('in the read-only preview of the whole app, the Kanban has no drag hints either', () => {
  fresh();
  tab('Kanban');
  s.ok(page().includes('Drag a tile between columns'), 'editable: the hint');
  s.c.setState({ ro: true }); s.render();
  s.ok(!page().includes('Drag a tile'), 'read-only: none');
  s.clean('kanban ro');
});

/* ======================================================================== 4. links inside a view */
s.step('a review row opens its own view, highlighted; it keeps read-only', () => {
  openView('Overview', true);
  const kr = review().groups.find((g) => g.label === 'Key results').rows.find((r) => r.isRow && r.hasLink);
  s.eq('says where it goes', kr.linkTitle, 'Open the Key results view in a new tab');
  s.click(link(kr.name));
  s.eq('the Key results view, still read-only', [s.c.state.view, s.c.state.ro], ['krs', true]);
  s.ok(s.vals.kr.rows.some((r) => r.focus && /is-focus/.test(r.itemCls)), 'the key result highlighted');
  s.flush(9000);
  s.ok(!s.vals.kr.rows.some((r) => r.focus), 'then not');
  openView('Overview', false);
  const tileRow = review().groups.find((g) => g.label === 'Kanban').rows.find((r) => r.isRow && r.hasLink && r.stWord !== 'Done');
  s.click(link(tileRow.name));
  s.eq('a tile: the Kanban view, its board, highlighted', [s.c.state.view, !!s.c.state.kb_focus], ['kanban', true]);
  s.clean('row links');
});

s.step('Risks rows and Current step open the app\'s tab (Sales: Risks only, since November 3)', () => {
  fresh();
  s.c.setState({ objId: SALES ? OBJ : 'OBJ-EL-2026Q4-01' }); s.render();
  s.click('~Link to this view');
  s.click('Open in a new tab');
  const risk = review().groups.find((g) => g.label === 'Risks').rows.find((r) => r.isRow && r.hasLink);
  s.eq('says where it goes', risk.linkTitle, 'Open on the Risks tab of ' + APPWORD + ', in a new tab');
  s.click(link(risk.name));
  s.eq('the whole app on Risks, the problem highlighted', [s.c.state.view, s.c.ctx.tab, !!s.c.state.fmea_focus], ['', 'risks', true]);
  s.ok(hasSide() && hasTabs(), 'the whole app');
  tab('Overview');
  s.click('~Link to this view');
  s.click('Open in a new tab');
  if (SALES) { s.eq('Sales: no Current step, so no way to Experiments', [s.has('Open experiments'), s.has((el) => el.attrs['data-k'] === 'ov-step')], [false, false]); s.clean('app links'); return; }
  s.eq('Current step says where it goes', s.find('Open experiments').attrs.title, 'Opens the Experiments tab of ' + APPWORD + ' in a new tab');
  s.click('Open experiments');
  s.eq('the whole app on Experiments', [s.c.state.view, s.c.ctx.tab], ['', 'exp']);
  s.clean('app links');
});

s.step('"Open in …" opens the whole app on the view\'s tab', () => {
  openView('Stage-gates', true);
  s.click((el) => el.on.onClick && /\bshl-vopen\b/.test(el.attrs.class || ''));
  s.eq('the whole app on Stage-gates, still read-only', [s.c.state.view, s.c.ctx.tab, s.c.state.ro, s.c.ctx.objId], ['', 'gates', true, OBJ]);
  s.ok(hasSide() && hasTop() && hasTabs(), 'sidebar, top bar and tabs');
  s.clean('open app');
});

s.step('a view\'s empty rows name the app\'s tab', () => {
  fresh();
  s.c.setState({ objId: SALES ? 'OBJ-BD-2027Q1-01' : 'OBJ-EL-2027Q1-01' }); s.render();
  s.click('~Link to this view');
  s.click('Open in a new tab');
  s.expect('No kanban board yet. Add one on the Kanban tab of ' + APPWORD + ' to track work through stages.');
  s.expect('No FMEA problems yet. Add one on the Risks tab of ' + APPWORD + ' and its worst open cause shows here.');
  if (SALES) s.ok(!s.has('~No current experiment'), 'Sales: nothing about experiments (no Experiments tab since November 3)');
  else s.expect('No current experiment. Plan one in the logic tree on the Experiments tab of ' + APPWORD + '.');
  s.clean('empty rows');
});

/* ======================================================================== 5. Settings › Open a link */
s.step('Settings › Open a link: the View parameter', () => {
  fresh();
  s.click('Settings');
  s.click('Open a link');
  s.expect('A view shows one objective on a page of its own, without the sidebar or tabs.');
  const viewSel = (el) => el.tag === 'select' && el.on.onChange && textOf(el.parent).includes('?view=');
  s.type(viewSel, 'kanban');
  /* Sales starts on All divisions, which a link without ?division= opens on, so its link names no division */
  const DIVP = SALES ? '' : 'division=' + DIV + '&';
  s.eq('the link', s.vals.sh.linkSheet.url, FILE + '?' + DIVP + 'objective=' + OBJ + '&view=kanban');
  s.expect('The top label, the objective’s head and a Kanban panel, then the tab’s contents.');
  s.type(viewSel, 'overview');
  s.expect('The top label, the objective’s head with its score and pace, then its Overview.');
  s.type('~Objective', '', { within: 'Parameters' });
  s.expect('A view needs an objective. Without one the link opens the whole app.');
  s.ok(!s.vals.sh.linkSheet.url.includes('objective='), 'no objective in the link');
  s.type('~Objective', OBJ, { within: 'Parameters' });
  s.check('~Read-only', true, { within: 'Parameters' });
  s.eq('with read-only', s.vals.sh.linkSheet.url, FILE + '?' + DIVP + 'objective=' + OBJ + '&view=overview&readonly');
  s.click('Open this link');
  s.flush(400);
  s.eq('a fresh load of a view link: the view, read-only', [s.c.state.view, s.c.state.ro, s.c.ctx.objId], ['overview', true, OBJ]);
  s.eq('one objective on its own page: never All divisions', [s.c.ctx.all, s.c.ctx.divId], [false, DIV]);
  s.ok(!hasSide() && hasVTop() && hasHead() && crumb() === CRUMB + ' / Overview', 'the Overview view');
  s.clean('open a link');
});

s.step('a view link without an objective opens the whole app', () => {
  fresh();
  s.click('Settings');
  s.click('Open a link');
  s.click('Clear all', { within: 'Parameters' });
  s.type((el) => el.tag === 'select' && el.on.onChange && textOf(el.parent).includes('?view='), 'krs');
  s.type('~Division', DIV, { within: 'Parameters' });
  s.click('Open this link');
  s.flush(400);
  s.eq('the whole app', [s.c.state.view, s.c.ctx.tab], ['', 'overview']);
  s.ok(hasSide(), 'sidebar');
  s.clean('no objective');
});

/* ---- every handler the views added to the shell template was used by the steps above ---- */
s.step('every new handler site in the shell fired', () => {
  const want = ['sh.vlink.toggle', 'sh.vlink.pickEdit', 'sh.vlink.pickRo', 'sh.vlink.copy', 'sh.vlink.openIt', 'sh.vw.openApp', 'sh.linkSheet.onView'];
  const sites = [];
  (function walk(n) {
    if (n.attrs) Object.keys(n.attrs).forEach((k) => {
      if (!k.startsWith('on')) return;
      const v = String(n.attrs[k]);
      const hit = want.find((w) => v.indexOf('{{' + w + '}}') >= 0);
      if (hit) sites.push({ key: k.toLowerCase() + '@' + n.line, what: hit });
    });
    (n.kids || []).forEach(walk);
  })(s.parsed.tree);
  s.eq('found them all', want.filter((w) => !sites.some((x) => x.what === w)), []);
  s.eq('not fired', sites.filter((x) => !fired.has(x.key)).map((x) => x.what), []);
});

done();
