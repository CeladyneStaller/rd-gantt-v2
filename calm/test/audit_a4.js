/* ============================================================================
   Audit A4: Product spec board (apps/spec, mods/sspec, mods/scomp, mods/ssub)
   against today's product_designer.template.html and the inventory checklist
   (inv/spec.md lines 586-783). Independent of the builders' scenarios.

     node test/audit_a4.js out/a4/Spec-A.dc.html

   Numbers are checked three ways: what the screen shows, the engine (RD), and an
   independent re-implementation of today's scoring rules (inventory §17, template
   L898-939, L1547-1577, core progressLinear / progressRange / meanScorable) so a
   board that merely echoed a wrong engine call would still fail.
   Step names are cited in calm/audit/a4.md.
   ========================================================================== */
const path = require('path');
const { Sim, done, textOf, labelOf } = require('./dc');
const RD = require(require('./engine_path'));
const FILE = process.argv[2] || 'out/a4/Spec-A.dc.html';

/* every handler fired by these scenarios (to prove the audit's own additions are exercised) */
const HIT = new Set();
const _render = Sim.prototype.render;
Sim.prototype.render = function () {
  const r = _render.call(this);
  this.els.forEach((el) => Object.keys(el.on).forEach((n) => { const f = el.on[n]; el.on[n] = (e) => { HIT.add(n.toLowerCase() + '@' + el.line); return f(e); }; }));
  return r;
};

/* ---------------------------------------------------------------- helpers */
const fresh = () => new Sim(FILE);
const EL = (s) => s.c.D.spec['SPEC-DIV-EL'];
const FC = (s) => s.c.D.spec['SPEC-DIV-FC'];
const PF = (s) => s.c.D.portfolio;
const AKof = (s, doc) => { const pk = PF(s).kpis || []; return pk.length ? doc.kpis.concat(pk) : doc.kpis; };
const EMof = (s, doc) => RD.withPortfolio(PF(s), { DOC: doc });
const R = (v) => (v == null ? '—' : String(Math.round(v)));
const toasts = (s) => s.vals.ui.toasts.map((t) => t.text);
const saw = (s, t) => toasts(s).some((x) => x.indexOf(t) >= 0);
const top = (s) => { const a = s.c.state.sheets || []; return a.length ? a[a.length - 1] : null; };
const kind = (s) => (top(s) ? top(s).kind : '');
const byK = (s, tag, k) => s.all((el) => el.tag === tag && el.attrs['data-k'] === k)[0];
const textK = (s, tag, k) => { const el = byK(s, tag, k); return el ? textOf(el) : ''; };
const goModel = (s, name) => s.click('~' + name, { within: 'Products' });
const closeSheet = (s) => s.click('Close', { within: 'Editor' });
const openSettings = (s) => s.click('Settings');
const dlgTitle = (s) => (s.vals.ui.dlg ? s.vals.ui.dlg.title : '');
const dlgBody = (s) => (s.vals.ui.dlg ? s.vals.ui.dlg.body : '');
const snapshot = (s) => JSON.stringify({ spec: s.c.D.spec, p: s.c.D.portfolio });

/* ---------------------------------------------- today's rules, re-implemented */
const clamp = (x) => Math.max(0, Math.min(100, x));
function ruleRaw(targetType, value, target, dir) {
  if (targetType === 'binary') return value == null ? null : (value >= 1 ? 100 : 0);
  if (target == null || value == null) return null;
  if (dir === 'range') {
    if (value >= target.lo && value <= target.hi) return 100;
    const w = (target.hi - target.lo) || 1, d = value < target.lo ? target.lo - value : value - target.hi;
    return clamp(100 * Math.max(0, 1 - d / w));
  }
  if (dir === 'up') return clamp(target === 0 ? 0 : 100 * value / target);
  if (dir === 'down') return clamp(value <= target ? 100 : value <= 0 ? 0 : 100 * target / value);
  return 0;
}
const median = (xs) => { const a = xs.slice().sort((p, q) => p - q); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const average = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length;
/* today's link resolution (core definerOf / effectiveTarget): a linked metric takes its type, direction and
   statistic from the metric at the top of its chain; its target is its own override (contribute, specification)
   or else its parent's, and a direct link always takes the parent's. pool = the document's metrics plus the
   portfolio's (product KPIs live there). */
function ruleDefiner(pool, k) {
  let d = k; const seen = {};
  while (d.linkParent != null && !seen[d.id]) { seen[d.id] = 1; const p = pool.find((x) => x.id === d.linkParent); if (!p) break; d = p; }
  return d;
}
function ruleTarget(pool, k, seen) {
  seen = seen || {};
  if (k.linkParent == null || seen[k.id]) return k.target;
  if (k.linkType !== 'direct' && k.target != null) return k.target;
  seen[k.id] = 1;
  const p = pool.find((x) => x.id === k.linkParent);
  return p ? ruleTarget(pool, p, seen) : k.target;
}
/* one metric scored on its OWN readings (no metric in the sample reads through members of its own): newest
   reading, or the statistic over EVERY reading; read-count discount */
function ruleMetric(doc, k, pool) {
  pool = pool || doc.kpis;
  const d = ruleDefiner(pool, k), target = ruleTarget(pool, k);
  const ups = (doc.kpiUpdates || []).filter((u) => u.kpiId === k.id).sort((a, b) => b.timestamp - a.timestamp);
  let v = null;
  if (ups.length) {
    if (d.targetType === 'statistical') { const xs = ups.map((u) => Number(u.value)); v = d.statistic === 'median' ? median(xs) : average(xs); }
    else v = Number(ups[0].value);
  }
  let s = ruleRaw(d.targetType, v, target, d.direction);
  if (s != null && d.targetType === 'statistical' && Number(d.readCount) > 0) s = s * Math.min(ups.length, Number(d.readCount)) / Number(d.readCount);
  return { v, s, has: d.targetType === 'binary' || target != null };
}
/* mean over metrics that have a target; unread count 0; none read -> no score (meanScorable) */
function ruleMean(list) { const sc = list.filter((x) => x.has); if (!sc.some((x) => x.s != null)) return null; return average(sc.map((x) => (x.s == null ? 0 : x.s))); }
function ruleEmbedded(k) {
  const tt = k.targetType || k.type || 'demonstration';
  if (tt === 'binary') return k.current == null ? null : (Number(k.current) >= 1 ? 100 : 0);
  if (k.current == null || k.target == null || k.target === '') return null;
  return clamp(ruleRaw('demonstration', Number(k.current), Number(k.target), k.direction === 'down' ? 'down' : 'up'));
}
function ruleSpec(doc, kr, pool) {
  const tt = kr.trackingType || 'kpi';
  if (tt === 'percentage') return kr.progress == null ? null : clamp(Number(kr.progress));
  if (tt === 'subkr') {
    let tw = 0, sum = 0, any = false;
    (kr.subKrs || []).forEach((x) => {
      let p;
      if ((x.trackingType || 'percentage') === 'kpi') { const v = (x.kpis || []).map(ruleEmbedded).filter((y) => y != null); p = v.length ? average(v) : null; }
      else p = x.progress == null ? null : clamp(Number(x.progress));
      if (p == null) return;
      const w = Number(x.weight) || 1; tw += w; sum += w * p; any = true;
    });
    return any && tw > 0 ? sum / tw : null;
  }
  return ruleMean(doc.kpis.filter((k) => k.hostType === 'keyResult' && k.hostId === kr.id).map((k) => ruleMetric(doc, k, pool)));
}
function ruleModel(scores) { if (!scores.some((x) => x != null)) return null; return average(scores.map((x) => (x == null ? 0 : x))); }
const ruleBand = (x) => (x == null ? 'No score yet' : x >= 80 ? 'On track' : x >= 65 ? 'At risk' : 'Off track');

/* ============================================================== Header (§1) */
{
  const s = fresh();
  s.step('H1 theme before first paint: stored choice wins; none or blocked storage gives light (Calm default)', () => {
    const real = global.window.localStorage;
    global.window.localStorage = { getItem: (k) => (k === 'rd_theme' ? 'dark' : null), setItem() {}, removeItem() {} };
    s.eq('stored dark is applied at construction', new Sim(FILE).c.state.theme, 'dark');
    global.window.localStorage = { getItem: (k) => (k === 'rd_theme' ? 'banana' : null), setItem() {}, removeItem() {} };
    s.eq('an invalid stored value falls back (light, the four boards agree)', new Sim(FILE).c.state.theme, 'light');
    global.window.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
    s.eq('blocked storage does not break the board', new Sim(FILE).c.state.theme, 'light');
    global.window.localStorage = real;
    s.eq('the shell renders the theme it chose', s.vals.theme, 'light');
  });
  s.step('H2 hub link; H3 app switcher marks Product spec', () => {
    const hub = s.all((el) => el.tag === 'a' && el.attrs.href === 'https://celadynestaller.github.io/CeladyneHQ/');
    s.eq('one hub link, same URL as today', hub.length, 1);
    s.eq('hub link labelled like today', [hub[0].attrs.title, hub[0].attrs['aria-label']], ['Back to all apps', 'Back to all apps']);
    const cur = s.all((el) => el.tag === 'a' && el.attrs['aria-current'] === 'page')[0];
    s.eq('current app', cur && textOf(cur), 'Product spec');
    s.ok(!/[⌂▤]/.test(s.text), 'no ⌂ or ▤ glyphs');
  });
  s.step('H4 context pill becomes the breadcrumb Division / Product / Model', () => {
    const crumb = s.all((el) => el.tag === 'nav' && el.attrs['aria-label'] === 'Breadcrumb')[0];
    s.eq('breadcrumb', textOf(crumb), 'Electrolyzer / Tera stack / Tera 25-30-R5');
  });
  s.step('H5 division picker: product divisions only; switching saves first, stores rd_division, resets the selection', () => {
    const tree = textOf(s.all((el) => el.tag === 'nav' && el.attrs['aria-label'] === 'Products')[0]);
    s.ok(tree.indexOf('Fuel Cell') >= 0 && tree.indexOf('Electrolyzer') >= 0, 'both product divisions listed');
    s.ok(tree.indexOf('Business Development') < 0, 'the biz division is not listed (pdDivisions)');
    s.click('Edit S1');
    s.eq('an editor is open', kind(s), 'sspec.spec');
    s.click('Cancel');
    s.type('~New reading for Specific energy', '52.5');
    s.click('Post', { within: 'KPI-EL-1-1-2-1' });
    s.eq('a save is pending', s.c.state.save.state, 'saving');
    const stored = [];
    const real = global.window.localStorage;
    global.window.localStorage = { getItem: () => null, setItem: (k, v) => stored.push([k, v]), removeItem() {} };
    goModel(s, 'HP6-12');
    global.window.localStorage = real;
    s.eq('pending edits saved before switching (flushPersist)', s.c.state.save.state, 'saved');
    s.ok(stored.some((x) => x[0] === 'rd_division' && x[1] === 'DIV-FC'), 'rd_division stored');
    s.ok(saw(s, 'Switched to Fuel Cell.'), 'toast "Switched to Fuel Cell."');
    s.eq('selection follows', [s.c.state.divId, s.c.state.productId, s.c.state.modelId], ['DIV-FC', 'PRD-FC-1', 'MDL-FC-1-1']);
    s.eq('the reading stayed in the Electrolyzer document', EL(s).kpiUpdates.filter((u) => u.kpiId === 'KPI-EL-1-1-2-1').length, 2);
    s.clean('after a division switch');
  });
  s.step('H5b a division whose SPEC bin cannot be loaded keeps you where you are (fixed)', () => {
    openSettings(s);
    s.check('Other divisions’ SPEC bins can’t be reached', true);
    closeSheet(s);
    goModel(s, 'Tera 25-30-R5');
    s.eq('still on Fuel Cell', s.c.state.divId, 'DIV-FC');
    s.ok(s.vals.sh.banner && s.vals.sh.banner.text === 'Couldn’t load SPEC-DIV-EL (503) — is its SPEC bin configured on the broker?', 'today\'s failure message');
    openSettings(s);
    s.check('Other divisions’ SPEC bins can’t be reached', false);
    closeSheet(s);
  });
  s.step('H7 product picker selects the product and its first model; H8 model picker', () => {
    s.click('Tera system', { within: 'Products' });
    s.eq('product and first model', [s.c.state.productId, s.c.state.modelId], ['PRD-EL-2', 'MDL-EL-2-1']);
    goModel(s, 'Tera 25-30-R5');
    s.eq('model picked', s.c.state.modelId, 'MDL-EL-1-1');
    s.click('Collapse Tera stack');
    s.ok(!s.has('~Tera 25-30-R5', { within: 'Products', tag: 'button' }), 'a product collapses in the tree');
    s.click('Expand Tera stack');
  });
  s.step('H10 Save forces the save; H11 Settings opens with the token filled in', () => {
    s.type('~New reading for Decay at 2 A/cm²', '6.0');
    s.click('Post', { within: 'KPI-EL-1-1-3-1' });
    s.click('Save');
    s.ok(saw(s, 'Saved.'), 'Save toasts Saved.');
    s.eq('save state', s.c.state.save.state, 'saved');
    openSettings(s);
    s.eq('settings sheet', kind(s), 'shell.settings');
    s.eq('token prefilled', top(s).d.token, 'sample-broker-token');
    closeSheet(s);
  });
}
{
  /* H6 / H7 / H9 / §19: URL parameters read at load */
  const s0 = fresh();
  s0.step('H6 + H7 + H9 + U1 URL parameters at load: biz division redirected, product only inside its division, read-only', () => {
    const at = (q) => { global.window.location.search = q; const x = new Sim(FILE); global.window.location.search = ''; return x; };
    const stored = [];
    const real = global.window.localStorage;
    global.window.localStorage = { getItem: () => null, setItem: (k, v) => stored.push([k, v]), removeItem() {} };
    const a = at('?division=DIV-BD');
    global.window.localStorage = real;
    s0.eq('a biz division redirects to the first product division', a.c.state.divId, 'DIV-FC');
    s0.ok(stored.some((x) => x[0] === 'rd_division' && x[1] === 'DIV-FC'), 'the resolved division is stored at load (L480) — fixed by audit');
    s0.eq('...and that division renders its first model', a.vals.sh.modelName, 'HP6-12');
    const b = at('?division=DIV-EL&product=PRD-EL-2');
    s0.eq('?product selects that product and its first model', [b.vals.sh.productName, b.vals.sh.modelName], ['Tera system', 'Tera 250 kW skid']);
    const c = at('?division=DIV-EL&product=PRD-FC-1');
    s0.eq('a product outside the division is ignored (first product)', c.vals.sh.productName, 'Tera stack');
    const d = at('?division=DIV-FC&readonly&token=abc');
    s0.ok(d.c.state.ro === true && d.vals.sh.roOn === true, 'readonly flag turns read-only on');
    s0.ok(d.has('Read-only'), 'read-only badge (dot and word)');
    s0.ok(!d.has('Save', { tag: 'button' }), 'Save hidden in read-only');
    s0.eq('token from the URL is used', d.c.state.sh_token, 'abc');
    s0.ok(!/token=/.test(global.window.location.search), 'the board does not keep the token in its address');
  });
}

/* ============================================================== Settings (§2), banner (§3) */
{
  const s = fresh();
  let copied = null;
  global.window.navigator.clipboard.writeText = (t) => { copied = t; return { then(ok) { ok(); } }; };
  s.step('S1 broker token: empty means working locally (no portfolio), saving one reloads', () => {
    openSettings(s);
    s.ok(s.see('?division=DIV-FC') && s.see('?token=…'), 'S2 sync help text kept');
    s.type('Broker token', '   ');
    s.click('Save token');
    s.ok(saw(s, 'Saved.'), 'Saved.');
    s.eq('empty token = local mode', s.c.state.sh_token, '');
    s.ok(s.vals.sh.banner && /No broker token — working locally/.test(s.vals.sh.banner.text), 'info banner like today');
    s.eq('no portfolio, so no products (today\'s local mode)', s.vals.sh.noModel, true);
    s.eq('product families empty text', s.vals.sh.settings.famEmpty, 'Connect a broker token to load products.');
    s.type('Broker token', ' tok-2 ');
    s.key('Broker token', 'Enter');
    s.eq('trimmed and stored', s.c.state.sh_token, 'tok-2');
    s.ok(saw(s, 'Loaded SPEC-DIV-EL.'), 'reload message');
    s.ok(!s.vals.sh.banner, 'banner cleared');
    s.eq('saved token is the new baseline (no discard prompt) — fixed by audit', s.c.sheetDirty(top(s)), false);
    s.click('Close panel');
    s.eq('the dimmed page closes Settings without asking', kind(s), '');
  });
  s.step('S3 theme: Light / Dark / Match system, pressed state', () => {
    openSettings(s);
    s.click('Dark');
    s.eq('dark', [s.c.state.theme, s.vals.theme], ['dark', 'dark']);
    const pressed = s.all((el) => el.tag === 'button' && el.attrs['aria-pressed'] === 'true', { within: 'Theme' }).map(textOf);
    s.eq('aria-pressed follows', pressed, ['Dark']);
    s.click('Match system');
    s.eq('match system follows the OS (stub: light)', [s.c.state.theme, s.vals.theme], ['system', 'light']);
    s.click('Light');
  });
  s.step('S4 product families: read-only list with model and metric counts', () => {
    const P = PF(s);
    const want = P.products.filter((p) => p.divisionId === 'DIV-EL').map((p) => {
      const mc = P.models.filter((m) => m.productId === p.id).length;
      const kc = AKof(s, EL(s)).filter((k) => k.hostType === 'product' && k.hostId === p.id).length;
      return p.name + ' ' + p.id + ' ' + mc + ' model' + (mc === 1 ? '' : 's') + ', ' + kc + ' metric' + (kc === 1 ? '' : 's');
    });
    s.eq('rows', s.vals.sh.settings.fams.map((f) => f.name + ' ' + f.id + ' ' + f.meta), want);
  });
  s.step('S5 export JSON: exactly the division document, no portfolio data', () => {
    s.click('Export JSON');
    s.eq('export sheet', kind(s), 'shell.export');
    s.eq('content', JSON.parse(s.vals.sh.exportSheet.json), EL(s));
    s.ok(!/"products"|"models"|"composition"/.test(s.vals.sh.exportSheet.json), 'no portfolio data in the file');
    s.click('Copy JSON');
    s.eq('copied the same text', copied, s.vals.sh.exportSheet.json);
    s.click('Done');
  });
  s.step('S6 import JSON: today\'s message for unparsable or non-object input; malformed records refused before the confirm (fixed by audit)', () => {
    s.click('Import JSON');
    const before = snapshot(s);
    s.type('Document JSON', '{ nope');
    s.click('Import');
    s.eq('not JSON', s.vals.ui.sheetErr, 'Import failed — not a valid document.');
    s.type('Document JSON', '5');
    s.click('Import');
    s.eq('not an object', s.vals.ui.sheetErr, 'Import failed — not a valid document.');
    s.type('Document JSON', '{"kpis":[null]}');
    s.click('Import');
    s.eq('a null record is refused, with where', s.vals.ui.sheetErr, 'Import failed — not a valid document. “kpis” must be a list of records.');
    s.eq('no confirm offered for it', dlgTitle(s), '');
    s.type('Document JSON', '{"keyResults":[1,2]}');
    s.click('Import');
    s.eq('numbers are not records', s.vals.ui.sheetErr, 'Import failed — not a valid document. “keyResults” must be a list of records.');
    s.type('Document JSON', '{"stageGates":{}}');
    s.click('Import');
    s.eq('an object is not a list', s.vals.ui.sheetErr, 'Import failed — not a valid document. “stageGates” must be a list of records.');
    s.type('Document JSON', '{"modelSpec":[]}');
    s.click('Import');
    s.eq('modelSpec must map models', s.vals.ui.sheetErr, 'Import failed — not a valid document. “modelSpec” must map model ids to their spec details.');
    s.eq('nothing changed by refused imports', snapshot(s), before);
    s.ok(!toasts(s).some((t) => /could not be applied/.test(t)), 'no raw error toast');
    s.click('Start from the current document');
    s.eq('current document offered as a start', JSON.parse(top(s).d.text), EL(s));
    const legacy = {
      keyResults: [{ id: 'KR-A', objectiveId: 'MDL-EL-1-1', statement: 'Alpha' }, { id: 'KR-A', objectiveId: 'MDL-EL-1-1', statement: 'Beta' }],
      stageGates: [{ id: 'SG-X', objectiveId: 'MDL-EL-1-1', name: 'Frame' }, { id: 'SG-X', objectiveId: 'MDL-EL-1-1', name: 'Gasket' }],
      kpis: [
        { id: 'K1', objectiveId: 'MDL-EL-1-1', hostType: 'stageGate', hostId: 'SG-X', name: 'Flatness', direction: 'down', target: 50, unit: 'µm', groupId: 'G', isDefiner: true },
        { id: 'K2', objectiveId: 'MDL-EL-1-1', hostType: 'keyResult', hostId: 'KR-A', name: null, groupId: 'G' },
        { id: 'K3', objectiveId: null, hostType: 'initiative', hostId: 'PRD-EL-1', name: 'Old product KPI' }
      ],
      kpiUpdates: [{ id: 'U1', kpiId: 'K1', value: 40, timestamp: 1, note: '' }]
    };
    s.type('Document JSON', JSON.stringify(legacy));
    s.click('Import');
    s.eq('asks first, naming the division (fixed: today has no confirmation)', dlgTitle(s), 'Replace the Electrolyzer specification document?');
    s.ok(/now 5 specifications, 13 metrics and 13 readings; the file has 2 specifications, 3 metrics and 1 reading/.test(dlgBody(s)), 'the confirm counts what is lost and what comes in');
    s.click('Import and replace');
    s.ok(saw(s, 'Imported.'), 'Imported.');
    const d = EL(s);
    s.eq('legacy group link made explicit (normalizeKpis)', [d.kpis[0].linkParent, d.kpis[1].linkParent, d.kpis[1].linkType], [null, 'K1', 'contribute']);
    s.eq('host types renamed: stageGate -> component, initiative -> product', [d.kpis[0].hostType, d.kpis[2].hostType], ['component', 'product']);
    s.eq('colliding component ids renumbered (dedupeStructuralIds)', d.stageGates.map((g) => g.id), ['SG-EL-1-1-1', 'SG-EL-1-1-2']);
    s.eq('their metrics re-homed to the first plain component', d.kpis[0].hostId, 'SG-EL-1-1-1');
    s.eq('colliding specification id renumbered', d.keyResults.map((r) => r.id), ['KR-A', 'KR-EL-1-1-1']);
    s.eq('autosave runs (the broker copy is replaced)', s.c.state.save.state, 'saving');
    s.eq('sheets closed', kind(s), '');
    s.clean('after import');
  });
  s.step('B1 messages: ok as toasts that go away, info and err as a banner that stays until dismissed', () => {
    s.ok(toasts(s).length > 0, 'a toast is showing');
    s.flush(10000);
    s.eq('ok toasts leave on their own', toasts(s).filter((t) => t === 'Imported.').length, 0);
    openSettings(s);
    s.check('Lose the connection (saves fail until it returns)', true);
    closeSheet(s);
    s.ok(s.vals.sh.banner && s.vals.sh.banner.cls.indexOf('t-bad') >= 0, 'err banner');
    s.flush(30000);
    s.ok(!!s.vals.sh.banner, 'err banner stays');
    s.click('Dismiss message');
    s.ok(!s.vals.sh.banner, 'dismissed');
    openSettings(s);
    s.check('Lose the connection (saves fail until it returns)', false);
    closeSheet(s);
  });
}

/* ============================================================== Model header, metric strip, signal bars (§4) */
{
  const s = fresh();
  const check = (label, modelName, docOf) => {
    goModel(s, modelName);
    const doc = docOf(s);
    const mid = s.c.state.modelId;
    const specs = doc.keyResults.filter((r) => r.objectiveId === mid);
    const pool = AKof(s, doc);
    const sc = specs.map((r) => ruleSpec(doc, r, pool));
    const model = ruleModel(sc);
    const em = EMof(s, doc);
    s.eq(label + ': conformance = mean of spec scores, unscored as 0 (rule = engine = screen)', [R(model), R(RD.objectiveScore(mid, em)), s.vals.sh.head.score], [R(model), R(model), R(model)]);
    s.eq(label + ': band word', s.vals.sh.head.band, ruleBand(model));
    s.eq(label + ': bar width', s.vals.sh.head.barStyle, 'width: ' + (model == null ? 0 : Math.round(model)) + '%');
    const comps = doc.stageGates.filter((g) => g.objectiveId === mid && !g.refModel);
    const compScores = comps.map((g) => ruleMean(doc.kpis.filter((k) => k.hostType === 'component' && k.hostId === g.id).map((k) => ruleMetric(doc, k, pool))));
    const mk = doc.kpis.filter((k) => k.objectiveId === mid && !k.refModel);
    const measured = mk.filter((k) => RD.effValue(k, AKof(s, doc), em) != null).length;
    const pid = PF(s).models.find((m) => m.id === mid).productId;
    const pk = PF(s).kpis.filter((k) => k.hostType === 'product' && k.hostId === pid).length;
    s.eq(label + ': the four other tiles', s.vals.sh.head.facts.map((f) => f.label + '|' + f.value + '|' + f.sub), [
      'Specifications|' + specs.length + '|' + sc.filter((x) => x != null && x >= 80).length + ' on target',
      'Components|' + comps.length + '|' + compScores.filter((x) => x != null && x >= 80).length + ' conformant',
      'Metrics measured|' + measured + ' of ' + mk.length + '|have a reading',
      'Product family|' + PF(s).products.find((p) => p.id === pid).name + '|' + pk + ' product KPI' + (pk === 1 ? '' : 's')
    ]);
    s.eq(label + ': one signal bar per spec, S‹n› + statement, width = score', s.vals.sh.head.signals.map((x) => x.label + ' ' + x.name + ' ' + x.score + ' ' + x.fillStyle),
      specs.map((r, i) => 'S' + (i + 1) + ' ' + r.statement + ' ' + R(sc[i]) + ' width: ' + (sc[i] == null ? 0 : Math.round(sc[i])) + '%'));
    s.eq(label + ': spec card scores match the rule', s.vals.sspec.specs.map((x) => x.score), sc.map(R));
    s.eq(label + ': component scores match the rule', (s.vals.scomp.rows || []).map((c) => c.score), compScores.map((x) => (x == null ? '' : R(x))));
  };
  s.step('M strip and signal bars on all three models (Electrolyzer stack, skid, Fuel Cell HP6-12)', () => {
    check('Tera 25-30-R5', 'Tera 25-30-R5', EL);
    s.eq('known value: 94', s.vals.sh.head.score, '94');
    s.eq('known component scores (C1 counts its linked H₂ in O₂, 0.48 against the inherited ≤ 1; C4 statistical 2 of 4 readings discounted)', s.vals.scomp.rows.map((c) => c.score), ['96', '100', '80', '48']);
    check('Tera 250 kW skid', 'Tera 250 kW skid', EL);
    check('HP6-12', 'HP6-12', FC);
    s.eq('known value: 75 (statistical discount, range, weighted sub-specs, % and binary)', s.vals.sh.head.score, '75');
    s.eq('known spec scores', s.vals.sspec.specs.map((x) => x.score), ['78', '100', '40', '55', '100']);
  });
  s.step('SB2 legend: meets / marginal / off target / no data, each a dot and a word', () => {
    const lg = s.all((el) => /spc-legend/.test(el.attrs.class || ''))[0];
    s.eq('legend', textOf(lg), 'Meets Marginal Off target No data');
  });
  s.step('M2 + M3 title, id, maturity, product, application and notes', () => {
    goModel(s, 'Tera 25-30-R5');
    const ms = EL(s).modelSpec['MDL-EL-1-1'];
    s.eq('header', [s.vals.sh.head.name, s.vals.sh.head.id, s.vals.sh.head.maturity, s.vals.sh.head.productText, s.vals.sh.head.appText, s.vals.sh.head.notes],
      ['Tera 25-30-R5', 'MDL-EL-1-1', ms.maturity, 'Product: Tera stack', 'Application: ' + ms.application, ms.notes]);
  });
  s.step('MD model spec details: read-only model and family, application, maturity with suggestions, notes, trimmed save', () => {
    s.click('Edit spec details');
    s.eq('sheet', kind(s), 'shell.model');
    s.ok(s.see('Models and product families are authored in the Planning app.'), 'read-only hint');
    s.eq('family shown', s.vals.sh.modelSheet.product, 'Tera stack');
    s.eq('suggestions (today\'s datalist)', s.vals.sh.modelSheet.suggestions.map((x) => x.label), ['Concept', 'Prototype', 'Pilot', 'Pre-production', 'Production']);
    s.type('Target application', '  Grid-scale PEM, 30 bar  ');
    s.click('Pre-production');
    s.type('Notes', ' Freeze in November. ');
    s.click('Save spec details');
    s.eq('saved trimmed', EL(s).modelSpec['MDL-EL-1-1'], { application: 'Grid-scale PEM, 30 bar', maturity: 'Pre-production', notes: 'Freeze in November.' });
    s.ok(saw(s, 'Spec details saved.'), 'toast');
    s.click('Edit spec details');
    s.type('Maturity', 'Concept');
    s.click('Cancel');
    s.eq('Cancel keeps the saved value', EL(s).modelSpec['MDL-EL-1-1'].maturity, 'Pre-production');
  });
  s.step('M1 empty states: no token, no divisions, no products, no models', () => {
    const P = PF(s);
    P.products.push({ id: 'PRD-EL-9', divisionId: 'DIV-EL', name: 'Tera spare', order: 9 });
    s.render();
    s.click('Tera spare', { within: 'Products' });
    s.eq('no models', s.vals.sh.emptyText, 'No models in this product yet — add them in the Planning app.');
    s.ok(s.has('Open Planning'), 'links to Planning');
    P.divisions.push({ id: 'DIV-NEW', name: 'Stacks R&D', kind: 'rd', order: 4 });
    s.render();
    openSettings(s);
    s.type('Division', 'DIV-NEW');
    s.click('Open with these parameters');
    s.eq('no products', s.vals.sh.emptyText, 'No products in this division yet — add products and models in the Planning app, then reload.');
    openSettings(s);
    s.type('Broker token', '');
    s.click('Save token');
    closeSheet(s);
    s.eq('no token', s.vals.sh.emptyText, 'Add a broker token in Settings to load products and models from the portfolio.');
    s.click('Open settings');
    s.eq('the empty state opens Settings', kind(s), 'shell.settings');
    s.type('Broker token', 'tok');
    s.click('Save token');
    closeSheet(s);
    P.divisions.forEach((d) => { d.kind = 'biz'; });
    s.render();
    s.eq('no divisions', s.vals.sh.emptyText, 'No divisions exist yet — add one in Planning.');
    s.clean('empty states');
  });
}

/* ============================================================== Product specifications (§5, §6, §7) */
{
  const s = fresh();
  s.step('P1 panel collapses with its count; P2 add; P4 card tag and statement open the editor; P5 score', () => {
    s.eq('count', s.vals.sspec.count, '4');
    s.click('~Product specifications');
    s.ok(!s.has('Edit S1'), 'collapsed');
    s.click('~Product specifications');
    s.ok(s.has('Edit S1'), 'expanded');
    s.eq('cards S1..S4 with statements', s.vals.sspec.specs.map((x) => x.tag + ' ' + x.statement), ['S1 Rated stack power', 'S2 Specific energy at rated load', 'S3 Voltage degradation', 'S4 Gas purity']);
    s.click('Edit S2');
    s.eq('editor for S2', [kind(s), top(s).data.krId], ['sspec.spec', 'KR-EL-1-1-2']);
    s.click('Cancel');
  });
  s.step('SM1-3 add: statement required, % completion by default, progress clamped', () => {
    s.click('Add specification');
    s.eq('new spec defaults to % completion', top(s).d.trackingType, 'percentage');
    s.click('Save specification');
    s.eq('statement required', s.vals.ui.sheetErr, 'Specification needs a statement.');
    s.type('Specification', '  Stack leak rate  ');
    s.type('Progress', '140');
    s.eq('live readout clamps', s.vals.sspec.specSheet.progressText, '100%');
    s.type('Progress', '35');
    s.type('Notes', '  Helium sniff test.  ');
    s.click('Save specification');
    const kr = EL(s).keyResults.find((r) => r.statement === 'Stack leak rate');
    s.eq('saved record (id from RD.allocId)', kr, { id: 'KR-EL-1-1-5', objectiveId: 'MDL-EL-1-1', statement: 'Stack leak rate', notes: 'Helium sniff test.', trackingType: 'percentage', progress: 35 });
    s.ok(saw(s, 'Specification saved.'), 'toast');
    s.eq('scores its progress', s.vals.sspec.specs[4].score, '35');
    s.eq('model conformance includes it', s.vals.sh.head.score, R(RD.objectiveScore('MDL-EL-1-1', EMof(s, EL(s)))));
  });
  s.step('SM4 single metric: every field, binary clears them, the primary metric is named after the statement', () => {
    s.click('Edit S5');
    s.click('Single metric');
    s.click('Statistical');
    s.type('Read count', '2.5');
    s.click('At most');
    s.type('Target', '1e-3');
    s.type('Unit', 'mbar·L/s');
    s.click('Update specification');
    s.eq('read count must be whole', s.vals.ui.sheetErr, 'Read count is a whole number of readings, like 10.');
    s.type('Read count', '5');
    s.type('Statistic', 'max');
    s.type('Target', 'abc');
    s.click('Update specification');
    s.eq('target must be a number (today saves it empty)', s.vals.ui.sheetErr, 'Use a number for the target, like 1.2.');
    s.type('Target', '0.001');
    s.click('Update specification');
    const kr = EL(s).keyResults.find((r) => r.id === 'KR-EL-1-1-5');
    const pk = EL(s).kpis.find((k) => k.hostType === 'keyResult' && k.hostId === 'KR-EL-1-1-5');
    s.eq('tracking switched, progress dropped', [kr.trackingType, 'progress' in kr], ['kpi', false]);
    s.eq('primary metric', [pk.name, pk.targetType, pk.statistic, pk.readCount, pk.direction, pk.target, pk.unit, pk.linkParent], ['Stack leak rate', 'statistical', 'max', 5, 'down', 0.001, 'mbar·L/s', null]);
    s.click('Edit S5');
    s.click('Binary');
    s.click('Update specification');
    const pk2 = EL(s).kpis.find((k) => k.id === pk.id);
    s.eq('binary clears direction, target, unit, statistic, read count', [pk2.targetType, pk2.direction, pk2.target, pk2.unit, 'statistic' in pk2, 'readCount' in pk2], ['binary', null, null, null, false, false]);
    s.click('Edit S5');
    s.click('% completion');
    s.click('Update specification');
    s.ok(!!EL(s).kpis.find((k) => k.id === pk.id), 'switching away keeps the primary metric (today\'s rule)');
  });
  s.step('SM5 sub-specifications: add, edit by name, remove; switching to them drops progress; switching away drops them', () => {
    s.click('Edit S5');
    s.click('Sub-specifications');
    s.ok(s.see('None yet. Add a weighted sub-specification.'), 'empty list');
    s.click('Add sub-spec');
    s.eq('stacked', s.c.state.sheets.map((x) => x.kind), ['sspec.spec', 'sspec.sub']);
    s.click('Save sub-spec');
    s.eq('name required (today only refocuses)', s.vals.ui.sheetErr, 'Name the sub-specification.');
    s.type('Sub-spec name', 'Sniff test');
    s.type('Weight', '0');
    s.type('Initial progress', '60');
    s.click('Save sub-spec');
    s.click('Add sub-spec');
    s.click('Demonstration', { within: 'Sub-spec tracking type' });
    s.type('Sub-spec name', 'Pressure decay');
    s.type('Weight', '2');
    s.click('At most', { within: 'Sub-spec direction' });
    s.type('Target', '5');
    s.type('Unit', 'mbar');
    s.type('Current measurement', '8');
    s.click('Save sub-spec');
    s.eq('two rows in the draft', top(s).d.subKrs.map((x) => [x.name, x.weight, x.trackingType]), [['Sniff test', 1, 'percentage'], ['Pressure decay', 2, 'kpi']]);
    s.ok(s.see('Weight 1, 60% complete') && s.see('Weight 2, demonstration ≤ 5 mbar, now 8 mbar (63%)'), 'summaries');
    const ws = (60 * 1 + (100 * 5 / 8) * 2) / 3;
    s.eq('weighted score of the draft', s.vals.sspec.specSheet.subScore, 'Weighted score ' + R(ws));
    s.click('Edit Sniff test');
    s.type('Sub-spec name', 'Helium sniff test');
    s.click('Save sub-spec');
    s.click('Remove Pressure decay');
    s.eq('remove is draft-only', top(s).d.subKrs.map((x) => x.name), ['Helium sniff test']);
    s.click('Update specification');
    const kr = EL(s).keyResults.find((r) => r.id === 'KR-EL-1-1-5');
    s.eq('saved; progress dropped', [kr.trackingType, kr.subKrs.length, 'progress' in kr], ['subkr', 1, false]);
    s.click('Edit S5');
    s.click('% completion');
    s.click('Update specification');
    s.eq('switching to % drops sub-specs', 'subKrs' in EL(s).keyResults.find((r) => r.id === 'KR-EL-1-1-5'), false);
  });
  s.step('SS sub-spec sheet: statistical readings preview, binary status, weight rules, Cancel / × / Back', () => {
    s.click('Edit S5');
    s.click('Sub-specifications');
    s.click('Add sub-spec');
    s.click('Statistical', { within: 'Sub-spec tracking type' });
    s.type('Sub-spec name', 'Leak repeatability');
    s.type('Read count', '4');
    s.type('Statistic', 'median');
    s.type('Target', '2');
    s.type('~Readings', ' 1.5, 2.5 ,, 3.5, ');
    s.eq('live preview, blank pieces skipped (fixed: today counts a phantom 0)', s.vals.sspec.subSheet.preview, 'Median: 2.5 from 3 readings');
    s.type('Weight', '-1');
    s.click('Save sub-spec');
    s.eq('negative weight refused (fixed)', s.vals.ui.sheetErr, 'Weight is a number of 0.1 or more, like 1.');
    s.type('Weight', '');
    s.click('Save sub-spec');
    const sub = top(s).d.subKrs[0];
    s.eq('blank weight becomes 1; current = statistic of the readings', [sub.weight, sub.kpis[0].current, sub.kpis[0].readings, sub.kpis[0].readCount], [1, 2.5, '1.5, 2.5 ,, 3.5,', 4]);
    s.click('Add sub-spec');
    s.click('Binary', { within: 'Sub-spec tracking type' });
    s.type('Sub-spec name', 'Passes 30 bar hold');
    s.eq('three statuses', s.all((el) => el.tag === 'button', { within: 'Status' }).map(textOf), ['Unmeasured', 'Not met', 'Met']);
    s.click('Met', { within: 'Status' });
    s.click('Save sub-spec');
    s.eq('binary met = current 1', top(s).d.subKrs[1].kpis[0].current, 1);
    s.click('Add sub-spec');
    s.type('Sub-spec name', 'dropped');
    s.click('Cancel');
    s.click('Add sub-spec');
    s.click('Back');
    s.eq('Cancel and Back leave the draft alone', top(s).d.subKrs.length, 2);
    s.click('Update specification');
    const kr = EL(s).keyResults.find((r) => r.id === 'KR-EL-1-1-5');
    s.eq('spec score = weighted mean (engine = rule)', [R(RD.keyResultScore(kr.id, EMof(s, EL(s)))), R(ruleSpec(EL(s), kr, AKof(s, EL(s))))], [R((100 * 1 + 100) / 2), R((100 * 1 + 100) / 2)]);
  });
  s.step('SM8 the editor survives a background change (draft lives in the panel)', () => {
    s.click('Edit S1');
    s.type('Specification', 'Rated stack power at 2 A/cm²');
    s.c.mutate((D) => { D.spec['SPEC-DIV-EL'].kpiUpdates.push({ id: 'UPD-bg2', kpiId: 'KPI-EL-1-1-3-1', value: 5.9, timestamp: s.c.now(), note: '' }); }, { quiet: true, allowRo: true });
    s.render();
    s.eq('typing kept', top(s).d.statement, 'Rated stack power at 2 A/cm²');
    s.click('Close');
    s.eq('× discards', EL(s).keyResults[0].statement, 'Rated stack power');
  });
  s.step('P13 spec notes expand and collapse (memory only)', () => {
    s.flush(1000);
    goModel(s, 'Tera 250 kW skid');
    s.ok(!s.see('Waiting on the balance-of-plant model.'), 'collapsed by default');
    s.click('Notes', { within: 'KR-EL-2-1-1' });
    s.ok(s.see('Waiting on the balance-of-plant model.'), 'expanded');
    s.eq('not saved', s.c.state.save.state, 'saved');
    s.click('Hide notes', { within: 'KR-EL-2-1-1' });
    goModel(s, 'Tera 25-30-R5');
  });
}

/* ============================================================== Metric tables (§11) and §9 editor */
{
  const s = fresh();
  s.step('T1 columns and rows: name, badges, target with direction, current, score, post', () => {
    s.eq('header', textOf(s.all((el) => el.tag === 'thead', { within: 'KR-EL-1-1-2' })[0]), 'Metric Target Current Score Post a reading Actions');
    s.eq('S2 row', textK(s, 'tr', 'KPI-EL-1-1-2-1'), 'Specific energy ≤ 52 kWh/kg 53.4 kWh/kg ' + R(ruleRaw('demonstration', 53.4, 52, 'down')) + ' Post');
    s.ok(/Linked/.test(textK(s, 'tr', 'KPI-EL-1-1-1-1')) && /Override/.test(textK(s, 'tr', 'KPI-EL-1-1-1-1')), 'linked badge + override pill');
    s.ok(/Gates Rated stack power/.test(textK(s, 'tr', 'KPI-EL-1-1-C1-2')), 'gates badge');
  });
  s.step('T6 post a reading: id, timestamp, value, empty note; empty and non-number refused; newest wins', () => {
    s.click('Post', { within: 'KPI-EL-1-1-2-1' });
    s.ok(saw(s, 'Enter a value to post.'), 'empty refused (today\'s message)');
    s.type('~New reading for Specific energy', 'fifty');
    s.click('Post', { within: 'KPI-EL-1-1-2-1' });
    s.ok(saw(s, 'Use a number for the reading, like 1.85.'), 'non-number refused');
    s.type('~New reading for Specific energy', '51.8');
    s.key('~New reading for Specific energy', 'Enter');
    const u = EL(s).kpiUpdates[EL(s).kpiUpdates.length - 1];
    s.eq('reading record', [u.id, u.kpiId, u.value, u.note, u.timestamp], ['UPD-KPI-EL-1-1-2-1-' + u.timestamp, 'KPI-EL-1-1-2-1', 51.8, '', s.c.now()]);
    s.ok(saw(s, 'Reading posted.'), 'toast');
    s.eq('newest reading wins, score follows the rule', textK(s, 'tr', 'KPI-EL-1-1-2-1'), 'Specific energy ≤ 52 kWh/kg 51.8 kWh/kg 100 Post');
    s.eq('input cleared', s.c.state.sspec_reads['keyResult|KR-EL-1-1-2|MDL-EL-1-1|page|KPI-EL-1-1-2-1'], '');
    s.type('~New reading for Specific energy', '9');
    s.key('~New reading for Specific energy', 'Escape');
    s.eq('Escape clears a typed reading', s.c.state.sspec_reads['keyResult|KR-EL-1-1-2|MDL-EL-1-1|page|KPI-EL-1-1-2-1'], '');
  });
  s.step('T6b statistical: every reading counts, read count discounts until met, shown as "n of N readings"', () => {
    goModel(s, 'HP6-12');
    const k = FC(s).kpis.find((x) => x.id === 'KPI-FC-1-1-1-1');
    const r0 = ruleMetric(FC(s), k);
    s.eq('4 of 6 readings, discounted score', [/4 of 6 readings/.test(textK(s, 'tr', k.id)), textK(s, 'tr', k.id).indexOf(' ' + R(r0.s) + ' ') >= 0], [true, true]);
    s.type('~New reading for Proton conductivity at 80 °C, 95% RH', '96');
    s.click('Post', { within: k.id });
    s.type('~New reading for Proton conductivity at 80 °C, 95% RH', '97');
    s.click('Post', { within: k.id });
    const r1 = ruleMetric(FC(s), k);
    s.eq('6 of 6: median of all six, no discount', [r1.v, R(r1.s)], [median([92.8, 93.4, 94.0, 93.1, 96, 97]), R(clamp(100 * median([92.8, 93.4, 94.0, 93.1, 96, 97]) / 95))]);
    s.ok(/6 of 6 readings/.test(textK(s, 'tr', k.id)) && textK(s, 'tr', k.id).indexOf(' ' + R(r1.s) + ' ') >= 0, 'table follows');
    s.eq('engine agrees', R(RD.kpiScoreResolved(k, AKof(s, FC(s)), EMof(s, FC(s)))), R(r1.s));
    s.eq('range metric inside the band scores 100', /11\.5–12\.5 µm 12\.3 µm 100/.test(textK(s, 'tr', 'KPI-FC-1-1-2-1')), true);
    s.type('~New reading for Membrane thickness on the coated roll', '12.8');
    s.click('Post', { within: 'KPI-FC-1-1-2-1' });
    s.eq('outside the band: 100 × (1 − distance / width)', s.vals.sspec.specs[1].mt.rows[0].score, R(ruleRaw('demonstration', 12.8, { lo: 11.5, hi: 12.5 }, 'range')));
    s.click('Post Not met for Passes the 80 °C hydrogen crossover screen');
    s.eq('binary: Met / Not met post 1 / 0 (today types 1 or 0)', [FC(s).kpiUpdates.filter((u) => u.kpiId === 'KPI-FC-1-1-5-1').map((u) => u.value), s.vals.sspec.specs[4].score], [[1, 0], '0']);
    goModel(s, 'Tera 25-30-R5');
  });
  s.step('T2 + T5 + T7 click a name: §9 editor for own metrics, override for linked ones; unlink copies the inherited values', () => {
    s.click('Specific energy', { within: 'KPI-EL-1-1-2-1' });
    s.eq('own metric -> editor', [kind(s), s.vals.sspec.metricSheet.title], ['sspec.metric', 'Edit KPI']);
    s.click('Cancel');
    s.click('Rated stack power', { within: 'KPI-EL-1-1-1-1' });
    s.eq('linked metric -> override', [kind(s), s.vals.sspec.overrideSheet.title], ['sspec.override', 'Override metric target']);
    s.click('Cancel');
    s.click('More actions for Rated stack power', { within: 'KR-EL-1-1-1' });
    s.click('Unlink');
    const m = EL(s).kpis.find((k) => k.id === 'KPI-EL-1-1-1-1');
    s.eq('unlink materializes name, direction, unit, target and cuts the link (L1394)', [m.name, m.direction, m.unit, m.target, m.linkParent, m.linkType, m.groupId, m.isDefiner, 'linkPriority' in m], ['Rated stack power', 'up', 'kW', 25, null, null, null, true, false]);
    s.ok(saw(s, 'Unlinked.'), 'toast');
    s.ok(!/Linked/.test(textK(s, 'tr', 'KPI-EL-1-1-1-1')), 'badge gone');
  });
  s.step('T8 delete: blocked for a definer (today\'s message), otherwise confirmed with the reading count; members of a deleted metric keep their values (fixed)', () => {
    s.click('More actions for H₂ in O₂');
    s.click('Delete metric');
    s.eq('H₂ in O₂ defines one link in the sample: the MEA\'s own H₂ in O₂ (contribute)', RD.childrenOf('KPI-EL-1-1-4-1', AKof(s, EL(s))).map((k) => [k.id, k.hostId, k.linkType]), [['KPI-EL-1-1-C1-3', 'SG-EL-1-1-1', 'contribute']]);
    s.ok(saw(s, 'This metric defines a linked group — unlink its members first.'), 'definer blocked');
    s.ok(!!EL(s).kpis.find((k) => k.id === 'KPI-EL-1-1-4-1'), 'not deleted');
    /* a member that others link to: link C2's porosity to S3, then link C3 to that member */
    s.click('Link a metric to C2');
    s.click('~Decay at 2 A/cm²', { within: 'Metric to link to' });
    s.click('Link', { within: 'Editor' });
    const mem = EL(s).kpis.find((k) => k.hostId === 'SG-EL-1-1-2' && k.linkParent === 'KPI-EL-1-1-3-1');
    s.ok(!!mem, 'member on C2');
    EL(s).kpis.push({ id: 'KPI-X-CHILD', objectiveId: 'MDL-EL-1-1', hostType: 'component', hostId: 'SG-EL-1-1-3', linkParent: mem.id, linkType: 'contribute', linkPriority: 0, name: null, direction: null, unit: null, target: null });
    s.render();
    s.click('More actions for Decay at 2 A/cm²', { within: 'SG-EL-1-1-2' });
    s.click('Delete metric');
    s.eq('confirm says what goes', dlgBody(s), 'It has no readings. 1 metric linked to it keeps its current target and is unlinked. This cannot be undone.');
    s.click('Delete metric', { within: dlgTitle(s) });
    const ch = EL(s).kpis.find((k) => k.id === 'KPI-X-CHILD');
    s.eq('the child kept its inherited identity and target', [ch.linkParent, ch.name, ch.direction, ch.unit, ch.target], [null, 'Decay at 2 A/cm²', 'down', 'µV/h', 5]);
    s.ok(saw(s, 'Metric deleted.'), 'toast');
  });
  s.step('T9 drag rows only within one table; Move up / Move down', () => {
    s.click('Add KPI to S2');
    s.type('Name', 'Stack efficiency');
    s.type('Target', '75');
    s.type('Unit', '%');
    s.click('Save KPI');
    const ids = () => EL(s).kpis.filter((k) => k.hostType === 'keyResult' && k.hostId === 'KR-EL-1-1-2').map((k) => k.id);
    const [a, b] = ids();
    s.drag('Drag Stack efficiency to reorder', (el) => el.tag === 'tr' && el.attrs['data-k'] === a);
    s.eq('dragged before', ids(), [b, a]);
    s.ok(saw(s, 'Reordered.'), 'toast');
    const others = EL(s).kpis.filter((k) => k.hostType === 'component').map((k) => k.id).join();
    s.drag('Drag Stack efficiency to reorder', (el) => el.tag === 'tr' && el.attrs['data-k'] === 'KPI-EL-1-1-C2-1');
    s.eq('a drop on another table does nothing', [ids(), EL(s).kpis.filter((k) => k.hostType === 'component').map((k) => k.id).join()], [[b, a], others]);
    s.click('More actions for Stack efficiency');
    s.click('Move down');
    s.eq('move down', ids(), [a, b]);
  });
  s.step('T10 notes row; T11 empty table', () => {
    s.click('Notes', { within: 'KPI-EL-1-1-C1-2' });
    s.ok(s.see('Lower loading is the main cost lever.'), 'notes row opens');
    s.click('Hide notes', { within: 'KPI-EL-1-1-C1-2' });
    s.click('Add specification');
    s.type('Specification', 'Empty one');
    s.click('Single metric');
    s.click('Save specification');
    s.click('More actions for Empty one', { within: 'KR-EL-1-1-5' });
    s.click('Delete metric');
    s.click('Delete metric', { within: dlgTitle(s) });
    s.ok(/No metrics yet\. Add or link a measurement\./.test(textK(s, 'article', 'KR-EL-1-1-5')), 'empty table text');
  });
  s.step('K1-8 §9 editor: name required, target types, range low/high both or none, gates (components only), notes (components only), binary clears', () => {
    s.click('Add a specification to C1');
    s.eq('component editor', [s.vals.sspec.metricSheet.title, s.vals.sspec.metricSheet.isComp], ['Add component specification', true]);
    s.click('Save specification');
    s.eq('name required', s.vals.ui.sheetErr, 'Give the specification a name.');
    s.type('Name', 'Membrane swelling');
    s.click('Range');
    s.type('Range low', '12');
    s.type('Range high', '8');
    s.click('Save specification');
    s.eq('low above high refused', s.vals.ui.sheetErr, 'The range low must not be above the range high.');
    s.type('Range high', '');
    s.type('Range low', '8');
    s.type('Gates a product specification (optional)', 'KR-EL-1-1-3');
    s.type('Notes', '  In-plane, at 80 °C.  ');
    s.click('Save specification');
    const k = EL(s).kpis.find((x) => x.name === 'Membrane swelling');
    s.eq('range stored only when both ends are filled (today\'s rule)', [k.direction, k.target, k.gates, k.notes, k.hostType, k.hostId, k.objectiveId], ['range', null, 'KR-EL-1-1-3', 'In-plane, at 80 °C.', 'component', 'SG-EL-1-1-1', 'MDL-EL-1-1']);
    s.ok(saw(s, 'Gating spec saved — gates “Voltage degradation”.'), 'gating toast');
    s.ok(/Membrane swelling/.test(textK(s, 'article', 'KR-EL-1-1-3')) && /Gated by/.test(textK(s, 'article', 'KR-EL-1-1-3')), 'G "Gated by" on the spec card');
    s.click('Membrane swelling', { within: 'KR-EL-1-1-3', tag: 'button' });
    s.eq('gated-by opens its editor', [kind(s), top(s).data.kpiId], ['sspec.metric', k.id]);
    s.eq('reopens as a range although one end was missing (fixed by audit)', top(s).d.dir, 'range');
    s.type('Range low', '8');
    s.type('Range high', '12');
    s.click('Statistical');
    s.type('Read count', '3');
    s.click('Update specification');
    s.eq('range saved', [EL(s).kpis.find((x) => x.id === k.id).target, EL(s).kpis.find((x) => x.id === k.id).readCount], [{ lo: 8, hi: 12 }, 3]);
    s.ok(saw(s, 'Gating spec saved'), 'toast');
    s.click('Add KPI to S3');
    s.eq('spec host: KPI editor, no gates or notes', [s.vals.sspec.metricSheet.title, s.vals.sspec.metricSheet.isComp], ['Add KPI', false]);
    s.click('Statistical');
    s.ok(/A statistical target uses every reading posted/.test(s.vals.sspec.metricSheet.readHint), 'fixed hint: every reading, read count is a discount (today says "latest reads")');
    s.type('Name', 'Pass fail');
    s.click('Binary');
    s.click('Save KPI');
    const b = EL(s).kpis.find((x) => x.name === 'Pass fail');
    s.eq('binary clears direction, target, unit, statistic, read count', [b.targetType, b.direction, b.target, b.unit, 'statistic' in b, 'readCount' in b], ['binary', null, null, null, false, false]);
    s.ok(saw(s, 'KPI saved.'), 'toast');
  });
}

/* ============================================================== Linking (§10) */
{
  const s = fresh();
  s.step('L1-3 candidates grouped like today, specs without a metric offered, a metric hosted here left out, default relationship per candidate', () => {
    s.click('Link a metric to C1');
    const groups = s.vals.sspec.linkSheet.groups.map((g) => g.label + ': ' + g.items.map((i) => i.name + (i.defText ? ' [' + i.defText + ']' : '')).join(' | '));
    s.eq('from a component', groups, [
      'Product specifications: Specific energy | Decay at 2 A/cm² | H₂ in O₂ | Rated stack power',
      'This product’s metrics: Rated stack power [Default: specification] | Porosity | Interfacial contact resistance | Compression uniformity',
      'Division initiatives: Stack voltage efficiency (HHV)']);
    s.ok(!groups.join().includes('Membrane thickness') && !groups.join().includes('Iridium loading'), 'C1\'s own metrics are not offered');
    /* today's LINK_DEFAULTS (L1319) has no keyResult>component entry: the fallback is contribute */
    s.eq('first candidate pre-selected with its default', [top(s).d.pick, top(s).d.rel], ['KPI-EL-1-1-2-1', 'contribute']);
    s.click('~Product: Tera stack', { within: 'Metric to link to' });
    s.eq('product KPI of this product from a component: specification', top(s).d.rel, 'specification');
    s.click('~Initiative: Tera component lock', { within: 'Metric to link to' });
    s.eq('initiative KPI: contribute', top(s).d.rel, 'contribute');
    s.click('Direct');
    s.eq('relationship can be changed', top(s).d.rel, 'direct');
    s.ok(/mirrors the parent’s target and value exactly/.test(s.vals.sspec.linkSheet.relHelp), 'help text for the choice');
    s.click('Cancel');
    s.click('Link a metric to S2');
    s.click('~Product: Tera stack', { within: 'Metric to link to' });
    s.eq('product KPI of this product from a spec: contribute', top(s).d.rel, 'contribute');
    s.click('Cancel');
  });
  s.step('L6 another product\'s KPI defaults to specification (blocks values flowing into it)', () => {
    goModel(s, 'HP6-12');
    s.eq('CP1 no cross-product panel while HP membrane imports nothing', s.vals.ssub.dep.show, false);
    s.click('Link a metric to S1');
    s.ok(s.vals.sspec.linkSheet.groups.some((g) => g.label === 'Import from Tera stack (Electrolyzer)'), 'import group with the division');
    s.click('~Product: Tera stack', { within: 'Metric to link to' });
    s.eq('specification', top(s).d.rel, 'specification');
    s.click('Link', { within: 'Editor' });
    const m = FC(s).kpis.find((k) => k.hostId === 'KR-FC-1-1-1' && k.linkParent === 'KPI-PRD-EL-1-1');
    s.eq('member record like today (L1389)', m && [m.objectiveId, m.hostType, m.linkType, m.linkPriority, m.name, m.target, m.order], ['MDL-FC-1-1', 'keyResult', 'specification', 0, null, null, 0]);
    s.ok(saw(s, 'Linked (specification).'), 'toast');
    s.ok(/Imported from Tera stack/.test(textK(s, 'tr', m.id)), 'imported badge');
    const v0 = RD.effValue(PF(s).kpis.find((k) => k.id === 'KPI-PRD-EL-1-1'), AKof(s, FC(s)), EMof(s, FC(s)));
    s.type('~New reading for Rated stack power', '99');
    s.click('Post', { within: m.id });
    s.eq('a specification link never feeds the other product\'s KPI', RD.effValue(PF(s).kpis.find((k) => k.id === 'KPI-PRD-EL-1-1'), AKof(s, FC(s)), EMof(s, FC(s))), v0);
    s.expect('Cross-product dependencies');
    const dep = s.vals.ssub.dep.groups[0];
    s.eq('CP cross-product dependency listed, grouped by source product', [dep.name, dep.div, dep.rows[0].where, dep.rows[0].model, dep.rows[0].metric, dep.rows[0].rel, dep.rows[0].value, dep.rows[0].target],
      ['Tera stack', 'Electrolyzer', 'Proton conductivity at 80 °C, 95% RH', 'HP6-12', 'Rated stack power', 'Specification', '99 kW', '≥ 25 kW']);
    PF(s).models.push({ id: 'MDL-FC-1-9', productId: 'PRD-FC-1', name: 'HP6-15', order: 2 });
    s.render();
    goModel(s, 'HP6-15');
    s.eq('the panel covers every model of the product in the division (L1460)', s.vals.ssub.dep.show && s.vals.ssub.dep.groups[0].rows.map((r) => r.model), ['HP6-12']);
    goModel(s, 'HP6-12');
  });
  s.step('L7 anchor: linking to a spec with no metric creates one; contribute switches its tracking (warned first)', () => {
    s.click('Link a metric to S2');
    s.click('~Roll-to-roll line ready for the customer audit', { within: 'Metric to link to' });
    s.ok(/switches “Roll-to-roll line ready for the customer audit” to single-metric tracking: its 55% progress is removed/.test(s.vals.sspec.linkSheet.warn), 'warned before (today: silent)');
    s.click('Specification');
    s.ok(!s.vals.sspec.linkSheet.hasWarn, 'no warning for a specification link');
    s.click('Contribute');
    s.click('Link', { within: 'Editor' });
    const kr = FC(s).keyResults.find((r) => r.id === 'KR-FC-1-1-4');
    const anchor = FC(s).kpis.find((k) => k.hostType === 'keyResult' && k.hostId === 'KR-FC-1-1-4' && k.linkParent == null);
    s.eq('anchor metric (L1373)', anchor && [anchor.name, anchor.direction, anchor.target, anchor.unit], ['Roll-to-roll line ready for the customer audit', 'up', null, null]);
    s.eq('tracking switched, progress gone', [kr.trackingType, 'progress' in kr], ['kpi', false]);
    s.ok(saw(s, 'Linked to specification (contribute) — its conformance now derives from linked metrics.'), 'toast');
    s.eq('member on S2 points at the anchor', !!FC(s).kpis.find((k) => k.hostId === 'KR-FC-1-1-2' && k.linkParent === anchor.id && k.linkType === 'contribute'), true);
  });
  s.step('L5 cycle check runs before every link (a fresh member can never close a loop)', () => {
    const AK = AKof(s, FC(s));
    s.eq('engine refuses a self link', RD.wouldCreateCycle('KPI-FC-1-1-2-1', 'KPI-FC-1-1-2-1', AK), true);
    s.eq('a new id cannot be on any ancestor chain', RD.wouldCreateCycle(RD.allocId('kpi', 'MDL-FC-1-1', AK.map((k) => k.id)), 'KPI-FC-1-1-2-1', AK), false);
  });
  s.step('L8-9 override: inherited summary, relationship, priority, override or inherit; direct has no override', () => {
    goModel(s, 'Tera 25-30-R5');
    s.click('Rated stack power', { within: 'KPI-EL-1-1-1-1' });
    const o = s.vals.sspec.overrideSheet;
    s.eq('inherited summary', [o.inhName, o.inhDir, o.inhUnit, o.inhFrom, o.inhTarget], ['Rated stack power', 'At least', 'kW', 'Product: Tera stack', '≥ 25 kW']);
    s.type('Priority', 'x');
    s.click('Save link');
    s.eq('priority must be a number', s.vals.ui.sheetErr, 'Priority is a number, like 0 or 1.');
    s.type('Priority', '2');
    s.type('Override target', '24');
    s.click('Save link');
    const m = EL(s).kpis.find((k) => k.id === 'KPI-EL-1-1-1-1');
    s.eq('saved', [m.linkType, m.linkPriority, m.target], ['contribute', 2, 24]);
    s.eq('contribute: own override wins', RD.effTarget(m, AKof(s, EL(s))), 24);
    s.ok(saw(s, 'Link saved.'), 'toast (changed from "Metric saved.")');
    s.click('Rated stack power', { within: 'KPI-EL-1-1-1-1' });
    s.type('Override target', '');
    s.click('Save link');
    s.eq('blank inherits', [EL(s).kpis.find((k) => k.id === 'KPI-EL-1-1-1-1').target, RD.effTarget(EL(s).kpis.find((k) => k.id === 'KPI-EL-1-1-1-1'), AKof(s, EL(s)))], [null, 25]);
    s.ok(/Inherited/.test(textK(s, 'tr', 'KPI-EL-1-1-1-1')), 'inherited pill');
    s.click('Rated stack power', { within: 'KPI-EL-1-1-1-1' });
    s.type('Override target', '30');
    s.click('Direct');
    s.ok(s.vals.sspec.overrideSheet.isDirect && !s.has('Override target'), 'direct: the override field goes, today\'s note shows');
    s.click('Save link');
    s.eq('direct forces the override empty', [EL(s).kpis.find((k) => k.id === 'KPI-EL-1-1-1-1').linkType, EL(s).kpis.find((k) => k.id === 'KPI-EL-1-1-1-1').target], ['direct', null]);
  });
  s.step('L10 defines-N badge and value flowing up through contribute links', () => {
    s.click('Link a metric to C3');
    s.click('Specific energy', { within: 'Metric to link to' });
    s.click('Link', { within: 'Editor' });
    s.ok(/Defines 1 link/.test(textK(s, 'tr', 'KPI-EL-1-1-2-1')), 'definer badge');
    const mem = EL(s).kpis.find((k) => k.hostId === 'SG-EL-1-1-3' && k.linkParent === 'KPI-EL-1-1-2-1');
    s.ok(/Linked/.test(textK(s, 'tr', mem.id)) && /Inherited/.test(textK(s, 'tr', mem.id)), 'member badge');
    s.type('~New reading for Specific energy', '51', { within: 'SG-EL-1-1-3' });
    s.click('Post', { within: mem.id });
    const def = EL(s).kpis.find((k) => k.id === 'KPI-EL-1-1-2-1');
    s.eq('the definer\'s own reading outranks the member (own reading always wins)', RD.effValue(def, AKof(s, EL(s)), EMof(s, EL(s))), 53.4);
  });
}

/* ============================================================== Components (§8) */
{
  const s = fresh();
  s.step('C1-6 panel, cards C‹n›, type and status, score, notes', () => {
    s.eq('count', s.vals.scomp.count, 4);
    s.eq('cards', s.vals.scomp.rows.map((c) => [c.tag, c.name, c.ctype, c.status]), [['C1', 'Membrane electrode assembly', 'MEA', 'Prototype'], ['C2', 'Porous transport layer', 'PTL', 'Qualified'], ['C3', 'Bipolar plate', 'BPP', 'Second source in trial'], ['C4', 'End plates and compression', '', '']]);
    s.click('~Components');
    s.ok(!s.has('~Edit C1'), 'collapses');
    s.click('~Components');
    s.click('Notes', { within: 'SG-EL-1-1-4' });
    s.ok(s.see('Disc springs set to 30 N·m'), 'notes expand');
  });
  s.step('CM add: blank name allowed, stays open on the new component; Escape after saving closes without asking (fixed by audit)', () => {
    s.click('Add component');
    s.ok(s.see('Add the component first.'), 'hint while adding');
    s.click('Add component', { within: 'Editor' });
    const g = EL(s).stageGates.find((x) => x.id === 'SG-EL-1-1-5');
    s.eq('blank name allowed (today\'s rule), fields null', g && [g.name, g.ctype, g.status, g.notes, g.objectiveId], [null, null, null, null, 'MDL-EL-1-1']);
    s.eq('sheet stays on the new component', [kind(s), s.vals.scomp.comp.title], ['scomp.comp', 'Edit component']);
    s.eq('not dirty after the save', s.c.sheetDirty(top(s)), false);
    s.key('Name', 'Escape');
    s.eq('Escape closes straight away', [kind(s), dlgTitle(s)], ['', '']);
    s.ok(/Unnamed component \(SG-EL-1-1-5\)/.test(textK(s, 'article', 'SG-EL-1-1-5')), 'card shows the id');
  });
  s.step('CM edit: fields, specifications section, link and back; Update toasts Component saved.', () => {
    s.click('Edit C5, Unnamed component (SG-EL-1-1-5)');
    s.type('Name', 'Cell frame');
    s.type('Type optional', 'Frame');
    s.click('Link a metric', { within: 'component-specifications' });
    s.eq('link stacks on the component', s.c.state.sheets.map((x) => x.kind), ['scomp.comp', 'sspec.link']);
    s.click('Cancel');
    s.eq('back on the component with the typing kept', [kind(s), top(s).d.name], ['scomp.comp', 'Cell frame']);
    s.click('Save component');
    s.ok(saw(s, 'Component saved.'), 'toast');
    s.eq('saved', [EL(s).stageGates.find((x) => x.id === 'SG-EL-1-1-5').name, EL(s).stageGates.find((x) => x.id === 'SG-EL-1-1-5').ctype], ['Cell frame', 'Frame']);
  });
  s.step('C8 delete cascades: its metrics and readings go, metrics elsewhere linked to them keep their values', () => {
    s.click('Link a metric to S3');
    s.click('~Membrane thickness', { within: 'Metric to link to' });
    s.click('Link', { within: 'Editor' });
    const mem = EL(s).kpis.find((k) => k.hostId === 'KR-EL-1-1-3' && k.linkParent === 'KPI-EL-1-1-C1-1');
    s.click('More actions for C1');
    s.click('Delete component');
    s.eq('confirm', dlgBody(s), 'Deletes Membrane electrode assembly with its 3 specifications and 3 readings. One of them gates a product specification; that gate goes too. One metric elsewhere is linked to them: it keeps its current name, unit and target and is unlinked. This cannot be undone.');
    s.click('Delete component', { within: dlgTitle(s) });
    s.eq('component, metrics and readings gone', [!!EL(s).stageGates.find((g) => g.id === 'SG-EL-1-1-1'), EL(s).kpis.filter((k) => k.hostId === 'SG-EL-1-1-1').length, EL(s).kpiUpdates.filter((u) => /C1-/.test(u.kpiId)).length], [false, 0, 0]);
    const m2 = EL(s).kpis.find((k) => k.id === mem.id);
    s.eq('member materialized (L737)', [m2.linkParent, m2.name, m2.direction, m2.unit, m2.target], [null, 'Membrane thickness', 'down', 'µm', 90]);
    s.ok(saw(s, 'Component deleted.'), 'toast');
    s.ok(!/Gated by/.test(textK(s, 'article', 'KR-EL-1-1-1')), 'gate line gone with it');
    s.eq('its own linked metric went with it (L734: every metric on the component), so H₂ in O₂ defines nothing now', [RD.childrenOf('KPI-EL-1-1-4-1', AKof(s, EL(s))).length, /Defines/.test(textK(s, 'tr', 'KPI-EL-1-1-4-1'))], [0, false]);
  });
  s.step('C9 drag to reorder components; sub-product hosts keep their place', () => {
    const ids = () => EL(s).stageGates.map((g) => g.id);
    const comps = () => EL(s).stageGates.filter((g) => g.objectiveId === 'MDL-EL-1-1' && !g.refModel).map((g) => g.id);
    const before = ids(), c0 = comps();
    s.drag('Drag C3 to reorder', (el) => el.tag === 'article' && el.attrs['data-k'] === c0[0]);
    const after = ids();
    s.eq('C3 moves before C1 (L1583), the rest keep their order', comps(), [c0[2], c0[0], c0[1]].concat(c0.slice(3)));
    s.eq('the skid host keeps its slot in the array', [after.indexOf('SG-EL-2-1-5'), after.length], [before.indexOf('SG-EL-2-1-5'), before.length]);
    s.ok(saw(s, 'Reordered.'), 'toast');
  });
}

/* ============================================================== Sub-products (§12), owners and dependencies (§13) */
{
  const s = fresh();
  s.step('SP1-6 skid: imported table, stack target / value from the child document, your target, score without discount, links to spec', () => {
    goModel(s, 'Tera 250 kW skid');
    s.eq('one sub-product', s.vals.ssub.count, 1);
    const rows = s.vals.ssub.hosts[0].rows;
    s.eq('imported rows in child order (stored, then auto-imported)', rows.map((r) => r.name), ['Rated stack power', 'Gas purity', 'Specific energy at rated load', 'Voltage degradation']);
    const REM = RD.withPortfolio(PF(s), { REF: EL(s) });
    s.eq('a spec whose only metric is linked resolves to 100% / its conformance (L596)', [rows[0].stackTarget, rows[0].stackValue], ['≥ 100%', String(Math.round(RD.keyResultScore('KR-EL-1-1-1', REM) * 10) / 10) + '%']);
    s.eq('Gas purity: stack target and value, your target, score = rawScore without discount', [rows[1].stackTarget, rows[1].stackValue, rows[1].yours, rows[1].score], ['≤ 1%', '0.62%', '≤ 0.5%', R(ruleRaw('demonstration', 0.62, 0.5, 'down'))]);
    s.eq('links to spec shown', rows[0].linkText, 'System efficiency at rated load');
    s.ok(/From sub-products/.test(textK(s, 'article', 'KR-EL-2-1-1')) && textK(s, 'article', 'KR-EL-2-1-1').indexOf('Rated stack power') >= 0, 'P12 "From sub-products" on the spec card');
    s.eq('...and it does not count in the spec\'s score', s.vals.sspec.specs[0].score, '70');
  });
  s.step('SP auto-import: a spec added to the child later appears at once and is written with today\'s ids on the next sub-product save', () => {
    goModel(s, 'Tera 25-30-R5');
    s.click('Add specification');
    s.type('Specification', 'Cold start time');
    s.click('Save specification');
    goModel(s, 'Tera 250 kW skid');
    s.ok(s.vals.ssub.hosts[0].rows.some((r) => r.name === 'Cold start time'), 'shown at once');
    s.type('~Product specification that Cold start time links to', 'KR-EL-2-1-1');
    const rows = EL(s).kpis.filter((k) => k.hostType === 'component' && k.hostId === 'SG-EL-2-1-5');
    s.eq('today\'s sync wrote every missing row (same fields as L843)', rows.map((k) => [k.refKr, k.linkType, k.linkParent, k.target]), [['KR-EL-1-1-1', 'specification', null, null], ['KR-EL-1-1-4', 'specification', null, 0.5], ['KR-EL-1-1-2', 'specification', null, null], ['KR-EL-1-1-3', 'specification', null, null], ['KR-EL-1-1-5', 'specification', null, null]]);
    s.eq('...and the link was set on the new row', rows[4].linkSpec, 'KR-EL-2-1-1');
    s.ok(saw(s, 'Imported specification linked to a product specification.'), 'toast');
  });
  s.step('SP your target: set and clear; a range child takes low and high', () => {
    s.click('Inherits', { within: EL(s).kpis.filter((k) => k.hostId === 'SG-EL-2-1-5')[2].id });
    s.type('~Your target for Specific energy at rated load', '50');
    s.key('~Your target for Specific energy at rated load', 'Enter');
    s.ok(saw(s, 'Target override set.'), 'toast');
    const row = s.vals.ssub.hosts[0].rows[2];
    s.eq('score against your target', [row.yours, row.score], ['≤ 50 kWh/kg', R(ruleRaw('demonstration', 53.4, 50, 'down'))]);
    s.click('≤ 50 kWh/kg');
    s.click('Clear override');
    s.ok(saw(s, 'Override cleared. Using the sub-product’s target.'), 'toast');
    goModel(s, 'Tera 25-30-R5');
    s.click('Add specification');
    s.type('Specification', 'Cell spread');
    s.click('Single metric');
    s.click('Range');
    s.type('Range low', '0');
    s.type('Range high', '20');
    s.type('Unit', 'mV');
    s.click('Save specification');
    goModel(s, 'Tera 250 kW skid');
    const vrow = s.vals.ssub.hosts[0].rows.find((r) => r.name === 'Cell spread');
    s.eq('range child: stack target shown as a range', vrow && vrow.stackTarget, '0 to 20 mV');
    s.click('Inherits', { within: 'SG-EL-2-1-5|KR-EL-1-1-6' });
    s.type('Range low', '2');
    s.type('Range high', '15');
    s.click('Set target');
    const rr = EL(s).kpis.find((k) => k.hostId === 'SG-EL-2-1-5' && k.refKr === 'KR-EL-1-1-6');
    s.eq('your range stored (fixed: today a single number scores a range row 0)', rr && rr.target, { lo: 2, hi: 15 });
  });
  s.step('SP add: eligibility (no self, duplicate or cycle), grouped by division, preview, host + rows + composition edge', () => {
    goModel(s, 'Tera 25-30-R5');
    s.click('Add sub-product');
    s.eq('stack: the skid would be a cycle, itself is excluded', s.vals.ssub.add.groups.map((g) => g.name + ':' + g.prods.map((p) => p.name).join(',')), ['Fuel Cell:HP membrane']);
    s.eq('preview', s.vals.ssub.add.preview, '5 specifications will import: Proton conductivity at 80 °C, 95% RH, Membrane thickness on the coated roll, Low-humidity performance, Roll-to-roll line ready for the customer audit and Passes the 80 °C hydrogen crossover screen.');
    s.click('Add sub-product', { within: 'Editor' });
    const host = EL(s).stageGates.find((g) => g.objectiveId === 'MDL-EL-1-1' && g.refModel === 'MDL-FC-1-1');
    s.eq('host named "Product · Model"', host && [host.name, host.refProduct], ['HP membrane · HP6-12', 'PRD-FC-1']);
    const rows = EL(s).kpis.filter((k) => k.hostId === host.id);
    s.eq('one specification-type row per child spec, unit from its metric or %', rows.map((k) => [k.refKr, k.linkType, k.unit, k.target]), [['KR-FC-1-1-1', 'specification', 'mS/cm', null], ['KR-FC-1-1-2', 'specification', 'µm', null], ['KR-FC-1-1-3', 'specification', '%', null], ['KR-FC-1-1-4', 'specification', '%', null], ['KR-FC-1-1-5', 'specification', null, null]]);
    s.ok(PF(s).composition.some((e) => e.id === 'CMP-' + host.id && e.parent === 'MDL-EL-1-1' && e.child === 'MDL-FC-1-1'), 'composition edge in the portfolio');
    s.ok(saw(s, 'Sub-product added, 5 specifications imported.'), 'toast');
    s.click('Add sub-product');
    s.ok(s.vals.ssub.add.none, 'nothing left to add');
    s.eq('today\'s text', s.vals.ssub.add.noneText, 'No other product has a model that can be added here. Every candidate would either duplicate an existing sub-product or form a composition cycle.');
    s.click('Close', { within: 'Editor' });
    s.eq('× closes the picker (fixed)', kind(s), '');
  });
  s.step('OW owners on HP6-12: collapsed by default, grouped product then model, target summary and live score, group toggles', () => {
    goModel(s, 'HP6-12');
    s.eq('collapsed by default with a count', [s.vals.ssub.ow.open, s.vals.ssub.ow.count], [false, 1]);
    s.click('~Component owners');
    const pr = s.vals.ssub.ow.prods[0];
    s.eq('group', [pr.name, pr.div, pr.models[0].name], ['Tera stack', 'Electrolyzer', 'Tera 25-30-R5']);
    const REM = RD.withPortfolio(PF(s), { REF: EL(s) });
    s.eq('rows: statement, target summary, score in the owner\'s document', pr.models[0].rows.map((r) => r.name + ' | ' + r.target + ' | ' + r.score), EL(s).keyResults.filter((r) => r.objectiveId === 'MDL-EL-1-1').map((r) => {
      /* today's ownerSpecTarget (L1492): a spec whose only metric is linked has no primary metric and is kpi-tracked: "—" */
      const t = { 'KR-EL-1-1-1': 'No target', 'KR-EL-1-1-2': '≤ 52 kWh/kg', 'KR-EL-1-1-3': '≤ 5 µV/h', 'KR-EL-1-1-4': '≤ 1%', 'KR-EL-1-1-5': '100%', 'KR-EL-1-1-6': '0 to 20 mV' }[r.id];
      return r.statement + ' | ' + t + ' | ' + R(RD.keyResultScore(r.id, REM));
    }));
    s.click('~Tera 25-30-R5', { within: 'OWNP:PRD-EL-1' });
    s.eq('model group collapses', s.vals.ssub.ow.prods[0].models[0].rows.length, 0);
    s.click('~Tera stack', { within: 'OWNP:PRD-EL-1' });
    s.eq('product group collapses', s.vals.ssub.ow.prods[0].models.length, 0);
  });
  s.step('OW states: loading, unreachable, no specifications; SP card states', () => {
    openSettings(s);
    s.click('Load other divisions slowly');
    closeSheet(s);
    s.click('~Tera stack', { within: 'OWNP:PRD-EL-1' });
    s.click('~Tera 25-30-R5', { within: 'OWNP:PRD-EL-1' });
    s.eq('loading', s.vals.ssub.ow.prods[0].models[0].loading, true);
    s.flush(3000);
    goModel(s, 'Tera 25-30-R5');
    openSettings(s);
    s.click('Load other divisions slowly');
    closeSheet(s);
    const host0 = s.vals.ssub.hosts[0];
    s.eq('SP5 a cross-division sub-product loading: card state, rows marked (today\'s "…" pill)', [host0.loading, host0.rows.every((r) => r.pending && r.stackTarget === '…' && r.stackValue === '…')], [true, true]);
    s.ok(s.has('Loading specifications', { within: 'sub-products' }), 'spinner and words');
    s.flush(3000);
    s.eq('loaded', s.vals.ssub.hosts[0].loading, false);
    goModel(s, 'HP6-12');
    openSettings(s);
    s.check('Other divisions’ SPEC bins can’t be reached', true);
    closeSheet(s);
    s.eq('unreachable', s.vals.ssub.ow.prods[0].models[0].unreachable, true);
    goModel(s, 'Tera 25-30-R5');
    s.eq('an unreachable SPEC bin also blocks a division switch (H5b)', s.c.state.modelId, 'MDL-FC-1-1');
    openSettings(s);
    s.check('Other divisions’ SPEC bins can’t be reached', false);
    closeSheet(s);
    goModel(s, 'Tera 25-30-R5');
    openSettings(s);
    s.check('Other divisions’ SPEC bins can’t be reached', true);
    closeSheet(s);
    s.eq('the cross-division sub-product card says Unreachable', s.vals.ssub.hosts[0].unreachable, true);
    s.ok(s.has('Unreachable', { within: 'sub-products' }), 'dot and word');
    openSettings(s);
    s.check('Other divisions’ SPEC bins can’t be reached', false);
    closeSheet(s);
  });
  s.step('SP remove: confirm, host, rows and composition edge go', () => {
    const host = EL(s).stageGates.find((g) => g.objectiveId === 'MDL-EL-1-1' && g.refModel === 'MDL-FC-1-1');
    s.click('More actions for HP membrane · HP6-12');
    s.click('Remove sub-product');
    s.ok(/with its 5 imported specifications/.test(dlgBody(s)) && /The composition link that Planning shows is removed too/.test(dlgBody(s)), 'confirm says what goes');
    s.click('Remove sub-product', { within: dlgTitle(s) });
    s.eq('gone', [!!EL(s).stageGates.find((g) => g.id === host.id), EL(s).kpis.filter((k) => k.hostId === host.id).length, PF(s).composition.some((e) => e.id === 'CMP-' + host.id)], [false, 0, false]);
    s.ok(saw(s, 'Sub-product removed.'), 'toast');
  });
  s.step('SP a child model with no specifications: today\'s preview, then an empty imported table', () => {
    PF(s).models.push({ id: 'MDL-FC-1-9', productId: 'PRD-FC-1', name: 'HP6-15', order: 2 });
    s.render();
    s.click('Add sub-product');
    s.click('~HP6-15', { within: 'Model' });
    s.eq('preview', s.vals.ssub.add.preview, 'This model has no specifications yet. It will be added as an empty sub-product.');
    s.click('Add sub-product', { within: 'Editor' });
    s.ok(saw(s, 'Sub-product added.'), 'toast');
    const host = EL(s).stageGates.find((g) => g.refModel === 'MDL-FC-1-9');
    s.ok(/This model has no importable specifications\./.test(textK(s, 'article', host.id)), 'empty row text');
  });
}

/* ============================================================== spec delete cascade, empty states, drag (§5, §13, §16) */
{
  const s = fresh();
  s.step('P9 drag a specification before another; other models\' specs keep their slots; Move up / down', () => {
    const order = () => EL(s).keyResults.map((r) => r.id);
    s.drag('Drag S3 to reorder', (el) => el.tag === 'article' && el.attrs['data-k'] === 'KR-EL-1-1-1');
    s.eq('S3 moved before S1 (reorderWithin L1583); the skid spec stays last', order(), ['KR-EL-1-1-3', 'KR-EL-1-1-1', 'KR-EL-1-1-2', 'KR-EL-1-1-4', 'KR-EL-2-1-1']);
    s.ok(saw(s, 'Reordered.'), 'toast');
    s.eq('tags and bars follow', [s.vals.sspec.specs[0].tag + ' ' + s.vals.sspec.specs[0].statement, s.vals.sh.head.signals[0].name], ['S1 Voltage degradation', 'Voltage degradation']);
    s.click('More actions for S1');
    s.click('Move down');
    s.eq('Move down', order().slice(0, 2), ['KR-EL-1-1-1', 'KR-EL-1-1-3']);
  });
  s.step('P8 delete a specification: its metrics and readings, members elsewhere unlinked with their values, gates and imported links cleared (fixed: no dangling ids)', () => {
    s.click('Link a metric to C3');
    s.click('Specific energy', { within: 'Metric to link to' });
    s.click('Link', { within: 'Editor' });
    s.click('Membrane thickness', { within: 'KPI-EL-1-1-C1-1' });
    s.type('Gates a product specification (optional)', 'KR-EL-1-1-2');
    s.click('Update specification');
    const mem = EL(s).kpis.find((k) => k.hostId === 'SG-EL-1-1-3' && k.linkParent === 'KPI-EL-1-1-2-1');
    const idx = s.vals.sspec.specs.findIndex((x) => x.id === 'KR-EL-1-1-2');
    s.click('More actions for S' + (idx + 1));
    s.click('Delete specification');
    s.eq('confirm names it and counts what goes', [dlgTitle(s), dlgBody(s)], ['Delete S' + (idx + 1) + ', “Specific energy at rated load”?', 'Its 1 metric and 1 reading are deleted. 1 metric linked to it keeps its current target and is unlinked. 1 component specification stops gating it. This cannot be undone.']);
    s.click('Delete specification', { within: dlgTitle(s) });
    s.eq('spec, its metric and reading gone', [EL(s).keyResults.some((r) => r.id === 'KR-EL-1-1-2'), EL(s).kpis.some((k) => k.id === 'KPI-EL-1-1-2-1'), EL(s).kpiUpdates.some((u) => u.kpiId === 'KPI-EL-1-1-2-1')], [false, false, false]);
    const m = EL(s).kpis.find((k) => k.id === mem.id);
    s.eq('member materialized and unlinked (L737)', [m.linkParent, m.name, m.direction, m.unit, m.target], [null, 'Specific energy', 'down', 'kWh/kg', 52]);
    s.eq('the gate is cleared, not left as a raw id', 'gates' in EL(s).kpis.find((k) => k.id === 'KPI-EL-1-1-C1-1'), false);
    s.ok(!/Gates KR-EL-1-1-2/.test(s.text), 'no raw id on screen');
    s.ok(saw(s, 'Specification deleted.'), 'toast');
  });
  s.step('P3 + SB hidden + OW6: the skid with no specifications: empty hint, no bars, no score; imported link cleared; owners empty text', () => {
    goModel(s, 'Tera 250 kW skid');
    s.ok(s.vals.ssub.ow.empty && s.vals.ssub.ow.emptyText === 'This model isn’t used as a sub-product in any other model yet. When it is, the owner products and their specifications show here.', 'owners empty text (the skid is in nothing)');
    s.eq('CP1 the cross-product panel only appears when such links exist', s.vals.ssub.dep.show, true);
    s.ok(s.see('None yet. Components are the parts that must meet specifications to deliver the product specifications.'), 'C62 components empty-state hint (the skid has only a sub-product)');
    s.eq('a sub-product host is not counted as a component', [s.vals.scomp.count, s.vals.sh.head.facts[1].value], [0, '0']);
    s.click('More actions for S1');
    s.click('Delete specification');
    s.eq('confirm', dlgBody(s), 'Its 1 metric is deleted. 1 imported sub-product spec stops linking to it. This cannot be undone.');
    s.click('Delete specification', { within: dlgTitle(s) });
    s.eq('CP1 ...and goes with its only link (S1\'s metric linked to the Tera stack\'s product KPI)', [EL(s).kpis.some((k) => k.id === 'KPI-EL-2-1-1-1'), s.vals.ssub.dep.show], [false, false]);
    s.eq('imported link cleared (today: falls back to "—")', 'linkSpec' in EL(s).kpis.find((k) => k.id === 'KPI-EL-2-1-5-1'), false);
    s.ok(s.see('No specifications yet. A product specification is a requirement the product must meet; its metrics roll up to the model’s conformance score.'), 'today\'s hint');
    s.eq('no signal bars, no score', [s.vals.sh.head.hasSignals, s.vals.sh.head.score, s.vals.sh.head.band], [false, '—', 'No score yet']);
    s.ok(/Tera 250 kW skid No specs/.test(textOf(s.all((el) => el.tag === 'nav' && el.attrs['aria-label'] === 'Products')[0])), 'the tree says so');
    goModel(s, 'Tera 25-30-R5');
    s.click('~Component owners');
    s.eq('OW4 an owner with no specifications says so', s.vals.ssub.ow.prods[0].models[0].none, true);
    s.ok(s.has('No specifications yet', { within: 'component-owners' }), 'shown');
  });
  s.step('SP1 + SP5 + SP12 sub-product panel collapses; card: child id, loading state, edit name and notes only; notes toggle', () => {
    goModel(s, 'Tera 250 kW skid');
    s.click('~Sub-products');
    s.eq('collapsed', s.vals.ssub.hosts.length, 0);
    s.click('~Sub-products');
    s.ok(s.has('MDL-EL-1-1', { within: 'SG-EL-2-1-5' }), 'child model id');
    s.click('Notes', { within: 'SG-EL-2-1-5' });
    s.ok(s.see('Four stacks per skid.'), 'notes expand');
    s.click('More actions for Tera stack · Tera 25-30-R5');
    s.click('Edit sub-product');
    s.eq('edit sheet', [s.vals.scomp.comp.title, s.vals.scomp.comp.isSub], ['Edit sub-product', true]);
    s.ok(!s.has('Type optional') && !s.has('Status optional') && !s.has('Component specifications'), 'name and notes only (pd_notes.cjs)');
    s.ok(s.see('This is a reference to another product. Its specifications live on that product'), 'today\'s note');
    s.type('Notes', 'Four stacks per skid, manifolded in pairs.');
    s.click('Save sub-product');
    s.eq('saved on the local host, still a reference', [EL(s).stageGates.find((g) => g.id === 'SG-EL-2-1-5').notes, EL(s).stageGates.find((g) => g.id === 'SG-EL-2-1-5').refModel], ['Four stacks per skid, manifolded in pairs.', 'MDL-EL-1-1']);
    s.ok(saw(s, 'Sub-product saved.'), 'toast');
  });
  s.step('T5 an unread metric shows No reading and counts as 0 in its spec', () => {
    goModel(s, 'Tera 25-30-R5');
    s.click('Add KPI to S1');
    s.type('Name', 'Peak power at 2.2 A/cm²');
    s.type('Target', '27');
    s.type('Unit', 'kW');
    s.click('Save KPI');
    const k = EL(s).kpis.find((x) => x.name === 'Peak power at 2.2 A/cm²');
    s.ok(/No reading/.test(textK(s, 'tr', k.id)) && /—/.test(textK(s, 'tr', k.id)), 'No reading, no score');
    const kr = EL(s).keyResults.find((r) => r.id === 'KR-EL-1-1-1');
    s.eq('spec = mean with the unread metric as 0 (rule = engine)', [s.vals.sspec.specs.find((x) => x.id === 'KR-EL-1-1-1').score, R(RD.keyResultScore('KR-EL-1-1-1', EMof(s, EL(s))))], [R(ruleSpec(EL(s), kr, AKof(s, EL(s)))), R(ruleSpec(EL(s), kr, AKof(s, EL(s))))]);
  });
}

/* ============================================================== Product KPIs: today's dead code given its panel (fixed by audit) */
{
  const s = fresh();
  s.step('PK product KPIs: listed for the product, add, post a reading (portfolio), edit, delete with its readings, definer blocked', () => {
    const pvm = () => s.vals.ssub.prod;
    s.eq('panel lists the product KPI with its link badge and engine numbers', pvm().rows.map((r) => [r.name, r.badges.map((b) => b.text).join(), r.target, r.current, r.score]),
      [['Rated stack power', 'Defines 2 links', '≥ 25 kW', '24.1 kW', R(RD.kpiScoreResolved(PF(s).kpis.find((k) => k.id === 'KPI-PRD-EL-1-1'), AKof(s, EL(s)), EMof(s, EL(s))))]]);
    s.eq('...the stack\'s Stack power (contribute) and the skid\'s S1 across products (specification)', RD.childrenOf('KPI-PRD-EL-1-1', AKof(s, EL(s))).map((k) => [k.id, k.linkType]), [['KPI-EL-1-1-1-1', 'contribute'], ['KPI-EL-2-1-1-1', 'specification']]);
    s.click('~Product KPIs');
    s.eq('collapses', pvm().rows.length, 0);
    s.click('~Product KPIs');
    s.click('Add product KPI');
    s.eq('editor', [s.vals.sspec.metricSheet.title, s.vals.sspec.metricSheet.sub, s.vals.sspec.metricSheet.isComp], ['Add product KPI', 'On product Tera stack, shared by all its models', false]);
    s.click('Save product KPI');
    s.eq('name required', s.vals.ui.sheetErr, 'Give the KPI a name.');
    s.type('Name', 'Stack cost');
    s.click('At most');
    s.type('Target', '1800');
    s.type('Unit', '$/kW');
    s.click('Save product KPI');
    const k = PF(s).kpis.find((x) => x.name === 'Stack cost');
    s.eq('stored in the portfolio like today\'s saveSub (no model scope, id from RD.allocId on the product)', k && [k.id, k.objectiveId, k.hostType, k.hostId, k.linkParent, k.direction, k.target, k.unit], ['KPI-EL-1-2', null, 'product', 'PRD-EL-1', null, 'down', 1800, '$/kW']);
    s.ok(saw(s, 'Product KPI saved.'), 'toast');
    s.eq('the strip counts it', s.vals.sh.head.facts[3].sub, '2 product KPIs');
    s.type('~New reading for Stack cost', '2100');
    s.key('~New reading for Stack cost', 'Enter');
    const u = PF(s).kpiUpdates.find((x) => x.kpiId === 'KPI-EL-1-2');
    s.eq('reading in the portfolio (L755)', u && [u.id, u.value, u.note], ['UPD-KPI-EL-1-2-' + u.timestamp, 2100, '']);
    s.eq('scored by today\'s rule', pvm().rows[1].score, R(ruleRaw('demonstration', 2100, 1800, 'down')));
    s.click('Stack cost', { within: 'product-kpis' });
    s.eq('edit opens the same editor', [kind(s), s.vals.sspec.metricSheet.title], ['sspec.metric', 'Edit product KPI']);
    s.type('Target', '2000');
    s.click('Update product KPI');
    s.eq('updated', PF(s).kpis.find((x) => x.id === 'KPI-EL-1-2').target, 2000);
    s.click('More actions for Stack cost', { within: 'product-kpis' });
    s.click('Edit product KPI', { within: 'More actions for Stack cost' });
    s.eq('the menu opens the editor too', top(s).data.kpiId, 'KPI-EL-1-2');
    s.click('Cancel');
    s.type('~New reading for Rated stack power', '24.6', { within: 'product-kpis' });
    s.click('Post', { within: 'KPI-PRD-EL-1-1' });
    s.eq('a product KPI\'s own reading outranks its linked metrics', s.vals.ssub.prod.rows[0].current, '24.6 kW');
    s.click('More actions for Rated stack power', { within: 'product-kpis' });
    s.click('Delete product KPI');
    s.ok(saw(s, 'This metric defines a linked group — unlink its members first.'), 'a definer with links cannot be deleted');
    s.click('More actions for Stack cost', { within: 'product-kpis' });
    s.click('Delete product KPI');
    s.eq('confirm', dlgBody(s), 'Its 1 reading is deleted too. Every model of this product loses it. This cannot be undone.');
    s.click('Delete product KPI', { within: dlgTitle(s) });
    s.eq('KPI and readings gone from the portfolio', [PF(s).kpis.some((x) => x.id === 'KPI-EL-1-2'), PF(s).kpiUpdates.some((x) => x.kpiId === 'KPI-EL-1-2')], [false, false]);
    s.ok(saw(s, 'Product KPI deleted.'), 'toast');
  });
  s.step('PK binary product KPI, a 412 merge, a linked product KPI, read-only, link targets', () => {
    openSettings(s);
    s.check('Next portfolio write meets a concurrent change (412, merged)', true);
    closeSheet(s);
    s.click('Add product KPI');
    s.type('Name', 'Passes the 30 bar proof test');
    s.click('Binary');
    s.click('Save product KPI');
    s.ok(saw(s, 'Product KPI saved. (merged with a concurrent change)'), 'portfolio write merges on a 412 like persistPortfolio');
    const b = PF(s).kpis.find((x) => x.name === 'Passes the 30 bar proof test');
    s.click('Post Met for Passes the 30 bar proof test');
    s.click('Post Not met for Passes the 30 bar proof test');
    s.eq('binary readings 1 then 0', PF(s).kpiUpdates.filter((u) => u.kpiId === b.id).map((u) => u.value), [1, 0]);
    s.eq('scores 0 (today: value ≥ 1 is 100, else 0)', s.vals.ssub.prod.rows[1].score, '0');
    /* a product KPI that is itself linked (only possible from data): unlink copies its inherited values */
    PF(s).kpis.push({ id: 'KPI-EL-1-9', objectiveId: null, hostType: 'product', hostId: 'PRD-EL-1', linkParent: 'KPI-EL-01-1', linkType: 'contribute', linkPriority: 0, name: null, direction: null, unit: null, target: null });
    s.render();
    s.ok(/Linked/.test(textK(s, 'tr', 'KPI-EL-1-9')), 'linked product KPI shows it');
    s.click('More actions for Stack voltage efficiency (HHV)', { within: 'product-kpis' });
    s.click('Unlink');
    const m = PF(s).kpis.find((x) => x.id === 'KPI-EL-1-9');
    s.eq('unlinked with inherited values', [m.linkParent, m.name, m.direction, m.target, m.unit], [null, 'Stack voltage efficiency (HHV)', 'up', 75, '%']);
    s.click('Link a metric to C2');
    s.ok(s.vals.sspec.linkSheet.groups[1].items.some((i) => i.name === 'Passes the 30 bar proof test'), 'a new product KPI is a link target at once');
    s.click('Cancel');
    openSettings(s);
    s.check('Preview the read-only view', true);
    closeSheet(s);
    s.ok(!s.has('Add product KPI') && !s.has('~New reading for Stack voltage efficiency'), 'read-only: no add, post or menu');
    s.ok(s.has('Stack voltage efficiency (HHV)', { within: 'product-kpis' }), 'names stay visible');
    s.clean('product KPIs');
  });
}

/* ============================================================== Sheets (§15), persistence (§18), read-only (§19) */
{
  const s = fresh();
  s.step('MO stacked sheets go back; × closes; Escape anywhere in a sheet closes it (asking first when there are edits)', () => {
    s.click('Edit C2, Porous transport layer');
    s.click('Add specification', { within: 'component-specifications' });
    s.eq('stack', s.c.state.sheets.map((x) => x.kind), ['scomp.comp', 'sspec.metric']);
    s.click('Back');
    s.eq('back', kind(s), 'scomp.comp');
    s.click('Close', { within: 'Editor' });
    s.eq('closed', kind(s), '');
    s.click('Link a metric to S1');
    s.key('Editor', 'Escape');
    s.eq('Escape on the panel itself (link sheet has no text field) — fixed by audit', kind(s), '');
    s.click('Add sub-product');
    s.key('Editor', 'Escape');
    s.eq('...and on the sub-product picker', kind(s), '');
    s.click('Edit S1');
    s.type('Specification', 'changed');
    s.key('Editor', 'Escape');
    s.eq('edits: asks first', dlgTitle(s), 'Discard your changes?');
    s.click('Cancel', { within: 'Discard your changes?' });
    s.click('Close panel');
    s.eq('the dimmed page asks too (changed: today it is inert)', dlgTitle(s), 'Discard your changes?');
    s.click('Discard changes');
    s.eq('discarded', [kind(s), EL(s).keyResults[0].statement], ['', 'Rated stack power']);
  });
  s.step('PS save cycle, offline, 412 reload, polling, portfolio merge', () => {
    s.type('~New reading for Specific energy', '52');
    s.click('Post', { within: 'KPI-EL-1-1-2-1' });
    s.eq('saving then saved after 0.7 s', s.c.state.save.state, 'saving');
    s.flush(800);
    s.eq('saved', s.c.state.save.state, 'saved');
    openSettings(s);
    s.click('Simulate a save conflict');
    s.eq('412: your last change is lost, the teammate\'s is kept', EL(s).kpiUpdates.some((u) => u.kpiId === 'KPI-EL-1-1-2-1' && u.value === 52), false);
    s.ok(/^Another editor saved first — reloaded; re-apply your change\./.test(s.vals.sh.banner.text), 'today\'s message');
    openSettings(s);
    const n0 = EL(s).kpiUpdates.length;
    s.click('Check for changes now');
    s.ok(/^Updated from another editor\./.test(s.vals.sh.banner.text), 'poll adopts the newer document');
    s.eq('a teammate reading arrived', EL(s).kpiUpdates.length, n0 + 1);
    s.check('Lose the connection (saves fail until it returns)', true);
    s.click('Check for changes now');
    s.ok(saw(s, 'You are offline, so other editors’ changes can’t arrive.'), 'offline: nothing arrives (today\'s poll fails quietly) — fixed by audit');
    s.eq('no teammate reading while offline', EL(s).kpiUpdates.length, n0 + 1);
    s.type('~New reading for Specific energy', '52.2');
    openSettings(s);
    s.click('Simulate a save conflict');
    s.ok(saw(s, 'You are offline, so no save reaches the broker and none can conflict.'), 'no 412 while offline');
    s.check('Lose the connection (saves fail until it returns)', false);
    closeSheet(s);
  });
  s.step('RO read-only: every write hidden, names visible; a random walk over every visible control changes no data', () => {
    openSettings(s);
    s.check('Preview the read-only view', true);
    closeSheet(s);
    s.ok(!s.has('Add specification') && !s.has('Add component') && !s.has('Add sub-product') && !s.has('Edit spec details') && !s.has('Save', { tag: 'button' }), 'adds, edit details and Save hidden');
    s.ok(s.has('Rated stack power', { within: 'KR-EL-1-1-1' }) && s.see('Membrane electrode assembly'), 'names stay readable (fixed: today they vanish with their edit links)');
    s.ok(!s.has('~New reading for'), 'no reading inputs (changed: today they work in memory and toast success)');
    const base = snapshot(s);
    let seed = 5; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const skip = /Restore the sample data|Check for changes now|Simulate a save conflict|Open with these parameters|Preview the read-only view|^Restore$/;
    let fired = 0;
    for (let i = 0; i < 1500 && s.c.state.ro; i++) {
      const hs = [];
      s.els.forEach((el) => Object.keys(el.on).forEach((n) => hs.push({ el, n })));
      const h = hs[Math.floor(rnd() * hs.length)];
      const lab = [textOf(h.el)].concat(labelOf(h.el)).join(' | ');
      if (skip.test(lab)) continue;
      try { h.el.on[h.n](s.ev(h.el, { key: ['Enter', 'Escape'][Math.floor(rnd() * 2)], target: { value: ['1', '', 'KR-EL-1-1-1', '{}'][Math.floor(rnd() * 4)], checked: rnd() < 0.5, dataset: {} } })); s.flush(0); fired++; } catch (e) { s.ok(false, 'handler threw in read-only: ' + lab + ': ' + e.message); break; }
    }
    s.ok(fired > 1000, 'walked ' + fired + ' handlers');
    s.eq('no data changed in read-only', snapshot(s) === base, true);
  });
}

/* ============================================================== the audit's own additions are all exercised */
{
  const s0 = fresh();
  const sites = [];
  (function walk(n) { if (n.attrs) for (const k of Object.keys(n.attrs)) if (k.startsWith('on')) sites.push(k + '@' + n.line); (n.kids || []).forEach(walk); })(s0.parsed.tree);
  /* the Product KPIs panel (mods/ssub/slot-main.html) and the sheet's Escape (shell) */
  const mine = sites.filter((k) => {
    const m = s0.parsed.srcmap[k.split('@')[1]];
    if (!m) return false;
    if (m[0] === 'mods/ssub/slot-main.html') { const src = require('fs').readFileSync(path.join(__dirname, '..', m[0]), 'utf8').split('\n')[m[1] - 1] || ''; return /ssub\.prod|\{\{pk\./.test(src); }
    return m[0] === 'shell' && /onkeydown/i.test(k) && /aria-label="Editor"/.test(require('fs').readFileSync(path.join(__dirname, '..', 'apps/spec/shell.html'), 'utf8').split('\n')[m[1] - 1] || '');
  });
  const missed = mine.filter((k) => !HIT.has(k.toLowerCase()));
  s0.ok(mine.length > 10 && !missed.length, 'every handler the audit added is fired (' + (mine.length - missed.length) + ' of ' + mine.length + ')' + (missed.length ? ': ' + missed.join(', ') : ''));
}
done();
