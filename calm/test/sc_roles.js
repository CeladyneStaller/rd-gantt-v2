/* Who may change the plan: only the CTO and the CEO edit Planning; everyone else sees it view only.
   Execution, Sales, Product spec and My Projects stay open to everyone signed in. The "Signed in as" picker
   stands in for the Hub sign-in and is shared by all the boards (like the Hub's session in the real suite).

     node test/sc_roles.js out          (the folder holding the built boards)
*/
const { Sim, done, textOf } = require('./dc');
const DIR = (process.argv[2] || 'out').replace(/\/$/, '');
const PLAN = DIR + '/Plan-A.dc.html', MAIN = DIR + '/Main.dc.html', SALES = DIR + '/Sales-A.dc.html', SPEC = DIR + '/Spec-A.dc.html', MINE = DIR + '/Mine-A.dc.html';

/* load every board once (each load installs fresh globals), then share one browser storage between them */
[PLAN, MAIN, SALES, SPEC, MINE].forEach((f) => new Sim(f));
const store = {};
global.window.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };

const EDITORS = 'Corey Staller and Dana Whitcomb';
const lastToast = (s) => { const t = (s.c.state.toasts || []).map((x) => x.text); return t[t.length - 1] || ''; };
const signIn = (s, email) => { s.click('Settings'); s.type('Signed in as', email); s.c.closeAllSheets(); s.render(); };
const go = (s, tab) => s.click(tab, { tag: 'button', within: 'Views' });
const snap = (s) => JSON.stringify({ p: s.c.D.portfolio, g: s.c.D.ganttView, d: s.c.D.docs, sp: s.c.D.spec });
const editLike = /^(edit|delete|add |add$|save|mark achieved|pause|resume|reopen milestone|deprioriti|record|create report|new |restore milestone|week earlier|week later)/i;

/* a random walk that never touches Settings (its simulations stand in for OTHER people's changes) */
function walk(s, steps, seed) {
  let x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const VALUES = ['', '1', '2026-11-05', 'abc', '75', 'Renamed', '2027Q1'];
  for (let i = 0; i < steps; i++) {
    if (s.c.sheet() && s.c.sheet().kind === 'shell.settings') { s.c.closeAllSheets(); s.render(); }
    const hs = [];
    s.els.forEach((el) => Object.keys(el.on).forEach((n) => {
      if (el.attrs['aria-label'] === 'Settings') return;
      hs.push({ el, n });
    }));
    if (!hs.length) break;
    const h = hs[Math.floor(rand() * hs.length)];
    let value = VALUES[Math.floor(rand() * VALUES.length)];
    if (h.el.tag === 'select') {
      const opts = s.els.filter((e) => e.tag === 'option' && (e.parent === h.el || (e.parent && e.parent.parent === h.el)));
      if (opts.length) value = String(opts[Math.floor(rand() * opts.length)].attrs.value);
    }
    h.el.on[h.n](s.ev(h.el, { key: rand() < 0.3 ? 'Enter' : 'a', target: { value, checked: rand() < 0.5, dataset: {} }, clientX: Math.floor(rand() * 900) }));
    s.flush(rand() < 0.2 ? 5000 : 0);
  }
}

/* ===================================================================== Planning */
let s = new Sim(PLAN);

s.step('the CTO (default sign-in) edits the plan', () => {
  s.eq('signed in as Corey, CTO', [s.c.viewer().email, s.c.viewer().role, s.c.canEditPlan()], ['corey@celadyne.com', 'CTO', true]);
  s.eq('no View only banner', s.vals.sh.lock, null);
  s.ok(!s.vals.sh.roOn, 'no read-only marker');
  go(s, 'Structure');
  s.click('More actions for Run full roll-to-roll membrane production');
  s.click('Edit');
  s.type('Statement', 'Run full roll-to-roll membrane production at 2 m/min', { within: 'Editor' });
  s.click('Save objective', { within: 'Editor' });
  s.eq('saved', s.c.D.portfolio.objectives.find((o) => o.id === 'OBJ-FC-2026Q4-01').statement, 'Run full roll-to-roll membrane production at 2 m/min');
});

s.step('signing in as a lead makes Planning view only', () => {
  signIn(s, 'toru@celadyne.com');
  s.eq('toast', lastToast(s), 'Signed in as Toru Hayashi (Lead).');
  s.eq('remembered for every board', JSON.parse(store.calm_viewer), { email: 'toru@celadyne.com', signedIn: true });
  s.eq('sidebar person', [s.vals.sh.me.name, s.vals.sh.me.role], ['Toru', 'Lead']);
  s.eq('locked', [s.c.canEditPlan(), s.c.isLocked(), s.c.isRo(), s.c.ctx.ro], [false, true, true, true]);
  s.eq('top-bar marker', [s.vals.sh.roOn, s.vals.sh.roLabel], [true, 'View only']);
  s.expect('You can see the whole plan. Changes are made by the CTO and CEO: ' + EDITORS + '.');
  s.click('Settings');
  s.expect('Toru Hayashi can view the plan but not change it. Planning changes are made by the CTO and CEO (' + EDITORS + ').');
  s.eq('the read-only preview stays a separate switch', s.vals.sh.settings.roOn, false);
  s.c.closeAllSheets(); s.render();
});

s.step('a lead sees no editing controls on any view', () => {
  for (const tab of ['Overview', 'Structure', 'Gantt', 'Milestones']) {
    go(s, tab);
    const edits = s.els.filter((el) => el.on.onClick && editLike.test(textOf(el) || el.attrs['aria-label'] || '')).map((el) => textOf(el) || el.attrs['aria-label']);
    s.eq(tab + ': no editing controls', edits, []);
    s.ok(!s.els.some((el) => el.attrs.draggable === 'true' || el.attrs.draggable === true), tab + ': nothing can be dragged');
  }
});

s.step('every write path refuses a lead, with the reason', () => {
  const before = snap(s);
  s.ns.PED.open(s.c, s.c.ctx, 'objective', 'OBJ-EL-2026Q4-01'); s.render();
  s.eq('editor refused', s.c.sheet(), null);
  s.eq('reason', lastToast(s), 'Planning changes are made by the CTO and CEO (' + EDITORS + ').');
  s.ns.PED.del(s.c, s.c.ctx, 'objective', 'OBJ-EL-2026Q4-01'); s.render();
  s.ns.PED.milestoneStatus(s.c, s.c.ctx, 'MS-EL-01-02', 'achieved'); s.render();
  s.ns.PGT.shift(s.c, 'objective', 'OBJ-EL-2026Q4-01', 7); s.render();
  s.c.mutate((D) => { D.portfolio.objectives[0].statement = 'hacked'; }); s.render();
  s.eq('nothing changed', snap(s), before);
  s.ns.PMS.openReport(s.c, s.c.ctx, 'MS-EL-01-01'); s.render();
  s.eq('the milestone report opens to read', [s.c.sheet() && s.c.sheet().kind, s.vals.pms.sheet && s.vals.pms.sheet.editable], ['pms.report', false]);
  s.c.closeAllSheets(); s.render();
});

s.step('a long random walk as a lead changes nothing in any document', () => {
  const before = snap(s);
  let threw = '';
  try { walk(s, 1500, 11); } catch (e) { threw = e.message; }
  s.eq('no handler failed', threw, '');
  s.eq('viewer unchanged', s.c.viewer().email, 'toru@celadyne.com');
  s.eq('portfolio, Gantt view and documents untouched', snap(s), before);
  s.clean('after the walk');
});

s.step('signed out: view only, and it says why', () => {
  signIn(s, '');
  s.eq('toast', lastToast(s), 'Signed out of the Hub.');
  s.eq('signed out', [s.c.viewer(), s.c.canEditPlan(), s.vals.sh.me.name], [null, false, 'Signed out']);
  s.expect('You’re not signed in to the Hub, so the plan is view only. Changes are made by the CTO and CEO: ' + EDITORS + '.');
  s.eq('remembered', JSON.parse(store.calm_viewer), { email: 'toru@celadyne.com', signedIn: false });
});

s.step('the CEO edits the plan', () => {
  s = new Sim(PLAN);                       /* a fresh board: the walk above left filters and grouping behind */
  signIn(s, 'dana@celadyne.com');
  s.eq('signed in as Dana, CEO', [s.c.viewer().role, s.c.canEditPlan(), s.vals.sh.lock], ['CEO', true, null]);
  go(s, 'Structure');
  s.click('More actions for Lock Tera 25-30-R5 components');
  s.click('Edit');
  s.type('Statement', 'Lock every Tera 25-30-R5 component', { within: 'Editor' });
  s.click('Save objective', { within: 'Editor' });
  s.eq('saved', s.c.D.portfolio.objectives.find((o) => o.id === 'OBJ-EL-2026Q4-02').statement, 'Lock every Tera 25-30-R5 component');
});

s.step('a random walk as the CEO does reach edits', () => {
  const before = snap(s);
  walk(s, 1500, 5);
  s.ok(snap(s) !== before, 'the same walk changes the plan when the viewer may edit');
});

s.step('a disabled account is never offered', () => {
  s.click('Settings');
  s.ok(!s.vals.sh.settings.hub.opts.some((o) => o.v === 'lena@celadyne.com'), 'Lena (disabled) is not in the picker');
  s.c.closeAllSheets(); s.render();
});

s.step('restoring the sample data keeps who is signed in', () => {
  signIn(s, 'toru@celadyne.com');
  s.c.resetData(); s.render();
  s.eq('still Toru, still view only', [s.c.viewer().email, s.c.D.me.email, s.c.canEditPlan()], ['toru@celadyne.com', 'toru@celadyne.com', false]);
});

/* ===================================================================== other boards stay open */
/* the Planning walk may have followed an "Open in Execution" link; start Execution at its default instead */
global.window.sessionStorage.removeItem('celadyne-calm-open');
delete store.rd_division;
const m = new Sim(MAIN);
m.step('Execution picks up the same sign-in and stays editable', () => {
  m.eq('signed in as Toru here too', [m.c.viewer().email, m.vals.sh.me.name], ['toru@celadyne.com', 'Toru']);
  m.eq('not read-only', m.c.isRo(), false);
  m.expect('Owners are set in Planning by the CTO or CEO');
  m.click('Record readings');
  m.click(/post a reading for H₂ in O₂$/i, { within: 'Editor' });
  m.type('New value for H₂ in O₂', '0.58');
  m.key('New value for H₂ in O₂', 'Enter');
  const ups = m.c.D.docs['EXEC-DIV-EL'].kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-2026Q4-01-3-1');
  m.eq('posted by Toru', [ups[ups.length - 1].value, ups[ups.length - 1].by], [0.58, 'toru@celadyne.com']);
  m.c.closeAllSheets(); m.render();
});
m.step('ICs revise plans in Execution (only the Planning app is locked)', () => {
  m.ns.GATES.openRevise(m.c, m.c.ctx); m.render();
  m.eq('Revise plan opens for a lead', m.c.sheet() && m.c.sheet().kind, 'gates.revise');
  m.c.closeAllSheets(); m.render();
});
m.step('signed out, readings carry no author', () => {
  m.click('Settings'); m.type('Signed in as', ''); m.c.closeAllSheets(); m.render();
  m.eq('signed out, still editable like today', [m.c.viewer(), m.c.isRo()], [null, false]);
  m.click('Record readings');
  m.click(/post a reading for H₂ in O₂$/i, { within: 'Editor' });
  m.type('New value for H₂ in O₂', '0.6');
  m.key('New value for H₂ in O₂', 'Enter');
  const ups = m.c.D.docs['EXEC-DIV-EL'].kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-2026Q4-01-3-1');
  m.eq('no author', 'by' in ups[ups.length - 1], false);
  m.c.closeAllSheets(); m.render();
});
m.step('the CTO sees the plain owners hint', () => {
  m.click('Settings'); m.type('Signed in as', 'corey@celadyne.com'); m.c.closeAllSheets(); m.render();
  m.expect('Owners are set in Planning');
  m.expectNot('by the CTO or CEO');
});

const k = new Sim(SALES);
k.step('Done-column choices belong to each person', () => {
  const corey = JSON.stringify(k.c.D.prefs.kbDone);
  k.ok(corey !== '{}', 'Corey has saved choices in the sample');
  k.click('Settings'); k.type('Signed in as', 'sam@celadyne.com'); k.c.closeAllSheets(); k.render();
  k.eq('Sam starts with none', JSON.stringify(k.c.D.prefs.kbDone), '{}');
  k.click('Settings'); k.type('Signed in as', 'corey@celadyne.com'); k.c.closeAllSheets(); k.render();
  k.eq('Corey gets his back', JSON.stringify(k.c.D.prefs.kbDone), corey);
});

store.calm_viewer = JSON.stringify({ email: 'priya@celadyne.com', signedIn: true });
const p = new Sim(SPEC);
p.step('Product spec stays open to everyone signed in', () => {
  p.eq('Priya, engineer', [p.c.viewer().email, p.vals.sh.me.role], ['priya@celadyne.com', 'Engineer']);
  p.eq('editable', p.c.isRo(), false);
  p.ok(p.has('Add specification'), 'specifications can be added');
});

const y = new Sim(MINE);
y.step('My Projects picks up the same sign-in and takes check-ins from everyone signed in', () => {
  y.eq('Priya here too', [y.c.viewer().email, y.vals.sh.me.name], ['priya@celadyne.com', 'Priya']);
  y.eq('editable', y.c.isRo(), false);
  y.click('Update KR1, % complete');
  y.type('New value for KR1, in %', '70');
  y.key('New value for KR1, in %', 'Enter');
  y.eq('saved to the objective’s own document', y.c.D.docs['EXEC-DIV-EL'].keyResults.find((x) => x.id === 'KR-EL-2026Q4-02-1').progress, 70);
  y.click('Settings'); y.type('Signed in as', 'toru@celadyne.com'); y.c.closeAllSheets(); y.render();
  y.eq('signing in here follows to every board', JSON.parse(store.calm_viewer), { email: 'toru@celadyne.com', signedIn: true });
  y.eq('a lead gets Owned Projects and Team Projects', y.vals.sh.views.opts.map((o) => o.label), ['Owned Projects', 'Team Projects']);
});

store.calm_viewer = JSON.stringify({ email: 'lena@celadyne.com', signedIn: true });
const q = new Sim(PLAN);
q.step('a stored sign-in for a disabled account falls back to the default person', () => {
  q.eq('back to Corey', q.c.viewer().email, 'corey@celadyne.com');
});

/* ===================================================================== the real Hub sign-in (deployed copies) */
/* On the Celadyne site the boards share the Hub's origin, so the Hub's own session (hub_session_v1, as the Hub
   writes it) names the viewer and the picker steps aside. Date.now() here is the harness clock. */
const SESSION = (email, orgRole, ttl) => JSON.stringify(Object.assign({ email: email, role: 'user', issuedAt: Date.now() - 1000, expiresAt: Date.now() + (ttl == null ? 3600000 : ttl) }, orgRole == null ? {} : { orgRole: orgRole }));
delete store.calm_viewer;
store.hub_session_v1 = SESSION('Toru.Hatsukade@CeladyneTech.com', 'lead');
const hubRaw = store.hub_session_v1;
const h1 = new Sim(PLAN);
h1.step('a lead signed in to the Hub sees Planning view only', () => {
  h1.eq('the Hub person, by their Hub role', [h1.c.viewer().email, h1.c.viewer().name, h1.c.viewer().role, h1.c.canEditPlan()], ['toru.hatsukade@celadynetech.com', 'Toru Hatsukade', 'Lead', false]);
  h1.eq('sidebar person', [h1.vals.sh.me.name, h1.vals.sh.me.role], ['Toru', 'Lead']);
  h1.eq('top-bar marker', [h1.vals.sh.roOn, h1.vals.sh.roLabel], [true, 'View only']);
  h1.expect('You can see the whole plan. Changes are made by the CTO and CEO: ' + EDITORS + '.');
  h1.click('Settings');
  const hub = h1.vals.sh.settings.hub;
  h1.eq('the picker is fixed to the Hub person', [hub.fixed, hub.opts.map((o) => o.label), hub.value], [true, ['Toru Hatsukade, Lead'], 'toru.hatsukade@celadynetech.com']);
  const sel = h1.find('Signed in as', { tag: 'select' });
  h1.eq('and disabled', sel.attrs.disabled, true);
  h1.expect('From your Hub sign-in (toru.hatsukade@celadynetech.com). To see someone else’s view, sign in as them in the Hub.');
  h1.c.closeAllSheets(); h1.render();
});
h1.step('the Hub decides: the prototype cannot switch people or sign out', () => {
  h1.c.setViewer('corey@celadyne.com'); h1.render();
  h1.c.setViewer(''); h1.render();
  h1.eq('still Toru, still view only', [h1.c.viewer().email, h1.c.canEditPlan()], ['toru.hatsukade@celadynetech.com', false]);
  h1.ok(!('calm_viewer' in store), 'no simulated sign-in is stored');
});
h1.step('every write path still refuses the Hub lead', () => {
  const before = snap(h1);
  h1.ns.PED.open(h1.c, h1.c.ctx, 'objective', 'OBJ-EL-2026Q4-01'); h1.render();
  h1.eq('editor refused', h1.c.sheet(), null);
  h1.c.mutate((D) => { D.portfolio.objectives[0].statement = 'hacked'; }); h1.render();
  let threw = '';
  try { walk(h1, 600, 23); } catch (e) { threw = e.message; }
  h1.eq('no handler failed', threw, '');
  h1.eq('nothing changed', snap(h1), before);
  h1.eq('the Hub session is only read, never written', store.hub_session_v1, hubRaw);
});
h1.step('restoring the sample data keeps the Hub person', () => {
  h1.c.resetData(); h1.render();
  h1.eq('still in the roster and signed in', [h1.c.viewer() && h1.c.viewer().email, !!h1.c.D.roster.users.find((u) => u.email === 'toru.hatsukade@celadynetech.com')], ['toru.hatsukade@celadynetech.com', true]);
});

store.hub_session_v1 = SESSION('corey@celadynetech.com', 'cto');
const h2 = new Sim(PLAN);
h2.step('the CTO signed in to the Hub edits the plan', () => {
  h2.eq('editor', [h2.c.viewer().name, h2.c.viewer().role, h2.c.canEditPlan(), h2.vals.sh.lock], ['Corey', 'CTO', true, null]);
  go(h2, 'Structure');
  h2.click('More actions for Run full roll-to-roll membrane production');
  h2.click('Edit');
  h2.type('Statement', 'Run roll-to-roll membrane production at 2 m/min', { within: 'Editor' });
  h2.click('Save objective', { within: 'Editor' });
  h2.eq('saved', h2.c.D.portfolio.objectives.find((o) => o.id === 'OBJ-FC-2026Q4-01').statement, 'Run roll-to-roll membrane production at 2 m/min');
});

store.hub_session_v1 = SESSION('ken@celadyne.com', 'ceo');
const h3 = new Sim(PLAN);
h3.step('the Hub role wins over the sample roster', () => {
  h3.eq('Ken is the CEO here', [h3.c.viewer().name, h3.c.viewer().role, h3.c.canEditPlan()], ['Ken Albright', 'CEO', true]);
});

store.hub_session_v1 = SESSION('nadia@celadynetech.com', null);
const h4 = new Sim(PLAN);
h4.step('a Hub session without a role is view only', () => {
  h4.eq('signed in, no role', [h4.c.viewer().email, h4.vals.sh.me.role, h4.c.canEditPlan()], ['nadia@celadynetech.com', 'Signed in', false]);
});

store.hub_session_v1 = SESSION('toru.hatsukade@celadynetech.com', 'lead', -60000);
store.calm_viewer = JSON.stringify({ email: 'dana@celadyne.com', signedIn: true });
const h5 = new Sim(PLAN);
h5.step('an expired Hub session is ignored, and the picker works again', () => {
  h5.click('Settings');
  h5.eq('back to the simulated sign-in', [h5.c.viewer().email, h5.c.canEditPlan(), h5.vals.sh.settings.hub.fixed], ['dana@celadyne.com', true, false]);
  h5.c.closeAllSheets(); h5.render();
  h5.ok(!h5.c.D.roster.users.some((u) => u.email === 'toru.hatsukade@celadynetech.com'), 'the expired person does not join the roster');
});
store.hub_session_v1 = '{not json';
const h6 = new Sim(PLAN);
h6.step('a damaged Hub session is ignored', () => {
  h6.eq('simulated sign-in', h6.c.viewer().email, 'dana@celadyne.com');
});
delete store.calm_viewer;

store.hub_session_v1 = SESSION('toru.hatsukade@celadynetech.com', 'lead');
global.window.sessionStorage.removeItem('celadyne-calm-open');
delete store.rd_division;
const h7 = new Sim(MAIN);
h7.step('Execution: the Hub person posts readings and keeps editing', () => {
  h7.eq('signed in from the Hub, not read-only', [h7.c.viewer().email, h7.c.isRo()], ['toru.hatsukade@celadynetech.com', false]);
  h7.click('Settings');
  h7.expect('From your Hub sign-in (toru.hatsukade@celadynetech.com). To see someone else’s view, sign in as them in the Hub. Kanban Done-column choices follow you to any device.');
  h7.c.closeAllSheets(); h7.render();
  h7.click('Record readings');
  h7.click(/post a reading for H₂ in O₂$/i, { within: 'Editor' });
  h7.type('New value for H₂ in O₂', '0.57');
  h7.key('New value for H₂ in O₂', 'Enter');
  const ups = h7.c.D.docs['EXEC-DIV-EL'].kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-2026Q4-01-3-1');
  h7.eq('posted by the Hub person', [ups[ups.length - 1].value, ups[ups.length - 1].by], [0.57, 'toru.hatsukade@celadynetech.com']);
  h7.c.closeAllSheets(); h7.render();
});
const h8 = new Sim(SPEC);
h8.step('Product spec: the Hub person, open as today', () => {
  h8.click('Settings');
  h8.eq('signed in, editable', [h8.c.viewer().email, h8.c.isRo(), h8.vals.sh.settings.hub.fixed], ['toru.hatsukade@celadynetech.com', false, true]);
  h8.c.closeAllSheets(); h8.render();
});
delete store.hub_session_v1;

[s, m, k, p, q, h1, h2, h3, h4, h5, h6, h7, h8].forEach((x, i) => x.clean('board ' + i));
done();
