/* FMEA risk register scenarios (X-fmea). Run for both boards:
     node test/sc_fmea.js out/xfmea/Main.dc.html
     node test/sc_fmea.js out/xfmea/Sales-A.dc.html
   Clicks and types like a person, then checks what is on screen, the stored
   document (s.c.D) and the numbers against the engine (rdcore.js). */
const path = require('path');
const { Sim, done, load, textOf } = require('./dc');
const RD = require(require('./engine_path'));

const file = process.argv[2] || 'out/xfmea/Main.dc.html';
let s = new Sim(file);
const APP = s.c.APP;
const EXEC = APP !== 'sales';
const DOC = EXEC ? 'EXEC-DIV-EL' : 'BIZ-DIV-BD';
const OBJ = EXEC ? 'OBJ-EL-2026Q4-01' : 'OBJ-BD-2026Q4-01';
console.log('board:', file, 'app:', APP);

/* the module's own functions (search, FMEA namespace) from a second evaluation of the board script */
class StubLogic { constructor(p) { this.props = p || {}; this.state = {}; } setState(u) { this.state = Object.assign({}, this.state, typeof u === 'function' ? u(this.state) : u); } }
const X = new Function('DCLogic', 'StreamableLogic', 'React', load(file).parsed.script + '\n;return { MODS: MODS, FMEA: (typeof FMEA !== "undefined" ? FMEA : null) };')(StubLogic, StubLogic, {});

/* ---------- independent expectations (today's rules, written out again) ---------- */
const doc = () => s.c.D.docs[DOC];
const today = () => s.c.D.today;
function passed(d, gid) { if (!gid) return false; const g = (d.stageGates || []).find((x) => x.id === gid); if (!g) return false; const st = RD.classifyGate(g, today()); return st === 'passed' || st === 'passed-late'; }
const probs = (d, o) => RD.fmeaProblemsFor(d || doc(), o || OBJ);
const roll = (d, o) => RD.fmeaRollup(probs(d, o), (gid) => passed(d || doc(), gid));
const byDue = (l) => l.slice().sort((a, b) => { const pa = a.plannedDate == null ? Infinity : a.plannedDate, pb = b.plannedDate == null ? Infinity : b.plannedDate; return (pa - pb) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)); });
function gateLabel(d, gid) {
  const g = d.stageGates.find((x) => x.id === gid); if (!g) return String(gid);
  const n = byDue(d.stageGates.filter((x) => x.objectiveId === g.objectiveId && x.setId === g.setId)).findIndex((x) => x.id === gid) + 1;
  const sets = d.stageGateSets.filter((x) => x.objectiveId === g.objectiveId).slice().sort((a, b) => ((a.order || 0) - (b.order || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
  const si = sets.findIndex((x) => x.id === g.setId);
  return 'SG-' + (si >= 0 ? String.fromCharCode(65 + si) : '') + n;
}
const unres = (p) => RD.worstUnresolvedRpn(p, passed(doc(), p.gateId));
const topRpn = (p) => { const u = unres(p); return u > 0 ? u : (p.status === 'resolved' ? 0 : RD.worstRpn(p)); };
const band = (r) => ({ high: 'High', med: 'Medium', low: 'Low' })[RD.rpnBand(r)];
const reg = () => s.vals.fmea.reg;
const card = (rid) => reg().probs.find((p) => p.k === 'prob-' + rid);
const prob = (rid) => (doc().risks || []).find((p) => p.rid === rid);
const sheetKind = () => { const t = s.c.sheet(); return t ? t.kind : ''; };
const role = (r, txt) => (el) => el.attrs.role === r && textOf(el) === txt;
function pickStatus(within, aria, word) {
  s.click(aria, { within: within });
  s.click(role('menuitemradio', word), { within: within });
}
function goRisks() { if (s.c.state.tab !== 'risks') s.click('Risks'); }
/* through the shell's Settings sheet; falls back to the flag if the shell renames its controls */
function setRo(on) {
  try {
    s.click('Settings');
    s.check((el) => el.tag === 'input' && el.attrs.type === 'checkbox' && /read-only/i.test((require('./dc').labelOf(el) || []).join(' ')), on);
    s.c.closeAllSheets(); s.render();
  } catch (e) {
    console.log('  note: read-only toggled through state (' + e.message.split('\n')[0] + ')');
    s.c.setState({ ro: !!on, sheets: [] }); s.render();
  }
}

/* ===================================================================== load */
s.step('risks are reshaped by RD.migrateProblem on load (adoptExec)', () => {
  const bd = s.c.D.docs['BIZ-DIV-BD'].risks[0];
  s.eq('legacy id becomes rid', bd.rid, 'RISK-BD-2026Q4-01-1');
  s.ok(bd.knowns.length === 2 && bd.knowns.every((k) => typeof k === 'object' && k.kid && k.text), 'string knowns become {kid, text}');
  s.ok(bd.modes.every((m) => m.mid && m.status === 'open' && m.effects.every((e) => e.eid && e.status && e.causes.every((c) => c.cid && c.status && typeof c.mitigation === 'string'))), 'every node gets an id, a status and a mitigation');
  s.eq('missing status defaults to open', bd.modes[0].effects[0].causes[0].status, 'open');
  s.eq('a set status is kept', bd.modes[0].effects[0].causes[1].status, 'mitigating');
  if (EXEC) {
    const seal = s.c.D.docs['EXEC-DIV-EL'].risks.find((p) => p.rid === 'r_el_seal');
    s.eq('evidence survives migration (mode)', seal.modes[0].experiments.map((x) => x.code), ['EXP-2']);
    s.eq('evidence survives migration (effect)', seal.modes[0].effects[0].experiments.map((x) => x.code), ['EXP-3']);
    s.eq('evidence survives migration (cause)', seal.modes[0].effects[0].causes[0].experiments[0].values['PTFE-1'].k_cset, '12.4');
  }
  s.clean('after load');
});

/* ================================================================= overview */
/* Since October 15 the Overview has no "Open high risks" card: the head's Open high risk fact (the shell, from
   FMEA.rollup's numbers) and the review table's Risks rows (mods/review) show the same rollup, and a problem's
   name opens it here, highlighted. */
const reviewRisks = () => s.c.MODS.review.api.items(s.c, s.c.ctx).filter((it) => it.type === 'risk');
const headRisk = () => s.vals.sh.head.facts.find((f) => f.k === 'fact-risk');
const statusOfU = (u) => (u >= 200 ? 'off' : u >= 100 ? 'risk' : u > 0 ? 'ok' : 'done');
const reviewLink = (txt) => (el) => el.tag === 'button' && /\breview-link\b/.test(el.attrs.class || '') && textOf(el).indexOf(txt) >= 0;
s.step('overview: the head fact and the review rows show today\'s open-risk rollup; a name opens the problem', () => {
  s.ok(!s.has('Open high risks') && !s.has('Review risks'), 'the old Overview card is gone');
  const r = roll();
  s.eq('one high risk open in the sample', r.openHigh, 1);
  s.eq('head fact = rollup.openHigh, red when any high', [headRisk().value, /t-bad/.test(headRisk().vcls)], [String(r.openHigh), true]);
  s.eq('head sub-line uses total and worst open RPN', headRisk().detail, r.total + (r.total === 1 ? ' problem' : ' problems') + ', worst RPN ' + r.worst);
  const rows = reviewRisks();
  s.eq('one review row per problem', rows.map((it) => it.id).sort(), probs().map((p) => p.rid).sort());
  probs().forEach((p) => {
    const it = rows.find((x) => x.id === p.rid), u = unres(p);
    s.eq('status by the worst open RPN: ' + p.rid, it.status, statusOfU(u));
    s.eq('RPN shown: ' + p.rid, it.row.rpnVal, String(u > 0 ? u : RD.worstRpn(p)));
  });
  const cnt = (st) => rows.filter((it) => it.status === st).length;
  s.eq('rows by status = the rollup (high, medium, low, clear)', [cnt('off'), cnt('risk'), cnt('ok'), cnt('done')], [r.openHigh, r.openMed, r.openLow, r.clear]);
  if (X.FMEA) {
    const pub = X.FMEA.rollup(s.c.ctx);
    s.eq('FMEA.rollup matches the engine', [pub.total, pub.openHigh, pub.openMed, pub.openLow, pub.clear, pub.worst], [r.total, r.openHigh, r.openMed, r.openLow, r.clear, r.worst]);
  }
  const highs = probs().filter((p) => unres(p) >= 200);
  s.click(reviewLink(highs[0].problem));
  s.eq('its name opens the Risks tab', s.c.state.tab, 'risks');
  s.eq('and highlights that problem', s.c.state.fmea_focus, highs[0].rid);
  s.ok(/is-focus/.test(card(highs[0].rid).cls), 'focused card is marked');
  s.eq('its name takes focus (scrolls it into view)', [card(highs[0].rid).focus, reg().probs.filter((x) => x.focus).length], [true, 1]);
  s.flush(9000);
  s.eq('the highlight clears after a few seconds', s.c.state.fmea_focus, '');
  s.clean('overview');
});

if (EXEC) s.step('overview tone: amber for medium only, muted without problems (head fact and review rows)', () => {
  s.click('Overview');
  s.c.setState({ objId: 'OBJ-FC-2026Q4-01', divId: 'DIV-FC' }); s.render();
  const r = roll(s.c.D.docs['EXEC-DIV-FC'], 'OBJ-FC-2026Q4-01');
  s.eq('FC: worst open RPN 160 (medium)', [r.openHigh, r.openMed, r.worst], [0, 1, 160]);
  s.eq('FC head fact amber', [headRisk().value, /t-warn/.test(headRisk().vcls)], ['0', true]);
  s.eq('FC review row at risk (medium)', reviewRisks().map((it) => [it.status, it.row.stSub, it.row.rpnVal]), [['risk', 'Medium risk open', '160']]);
  s.c.setState({ objId: 'OBJ-FC-2026Q4-02' }); s.render();
  s.eq('no problems: muted', [headRisk().value, headRisk().detail, /t-none/.test(headRisk().vcls)], ['0', 'No FMEA items', true]);
  s.eq('no review rows', reviewRisks().length, 0);
  s.expect('No FMEA problems yet. Add one on the Risks tab and its worst open cause shows here.');
  s.c.setState({ objId: OBJ, divId: 'DIV-EL' }); s.render();
  s.clean('tones');
});

/* ================================================================= register */
s.step('register: sorted by worst open RPN, badges, gate tags, knowns', () => {
  goRisks();
  s.expect('FMEA risk register');
  const list = probs();
  const want = list.map((p) => ({ p: p, u: unres(p) })).sort((a, b) => b.u - a.u).map((x) => 'prob-' + x.p.rid);
  s.eq('order', reg().probs.map((p) => p.k), want);
  s.eq('count', reg().count, list.length + (list.length === 1 ? ' problem' : ' problems'));
  list.forEach((p) => {
    const c = card(p.rid);
    const t = topRpn(p);
    s.eq('RPN badge for ' + p.rid, c.hasRpn ? Number(c.rpn) : 0, t);
    if (t) s.eq('band for ' + p.rid, c.bandWord, band(t));
    s.eq('gate tag for ' + p.rid, c.gateTag, p.gateId ? gateLabel(doc(), p.gateId) : '');
    s.eq('status for ' + p.rid, c.st.word, { open: 'Open', mitigating: 'Mitigating', resolved: 'Resolved' }[p.status]);
    p.knowns.forEach((k) => s.expect(k.text));
  });
  const r = roll();
  s.expect(r.openHigh ? r.openHigh + ' high' : 'Nothing counts as open');
  s.clean('register');
});

s.step('register rows: S, O, D and RPN per cause match the engine; resolved mode or effect hides the RPN', () => {
  goRisks();
  probs().forEach((p) => {
    const rows = card(p.rid).rows.filter((r) => r.hasCause);
    const causes = [];
    p.modes.forEach((m) => m.effects.forEach((e) => e.causes.forEach((c) => causes.push({ c: c, hide: m.status === 'resolved' || e.status === 'resolved' }))));
    s.eq('cause rows for ' + p.rid, rows.length, causes.length);
    rows.forEach((row, i) => {
      const c = causes[i].c;
      s.eq('RPN ' + c.cid, Number(row.cause.rpn), RD.calcRpn(c.severity, c.occurrence, c.detection));
      s.eq('S O D ' + c.cid, [row.cause.sod.s, row.cause.sod.o, row.cause.sod.d], [String(c.severity), String(c.occurrence), String(c.detection)]);
      s.eq('hidden ' + c.cid, row.cause.rpnHidden, causes[i].hide);
    });
  });
});

if (EXEC) s.step('passed gate zeroes the open RPN (leak problem), resolved problem shows no badge, evidence chips', () => {
  goRisks();
  const leak = card('r_el_leak');
  s.eq('leak problem: gate passed, worst open RPN 0', unres(prob('r_el_leak')), 0);
  s.eq('badge keeps today\'s plain worst RPN', [leak.rpn, leak.bandWord], ['72', 'Low']);
  s.expect('Its stage-gate has passed, so this problem no longer counts toward open risk.');
  s.expect('Build and leak-test the stack, passed Sep 30');
  s.eq('resolved problem: no badge', card('r_el_ptl').hasRpn, false);
  s.ok(/is-res/.test(card('r_el_ptl').cls), 'resolved problem is struck through');
  s.expect('3 evidence experiments: 1 confirmed, 2 not concluded');
  const chips = [];
  reg().probs.forEach((p) => p.rows.forEach((r) => ['mode', 'eff', 'cause'].forEach((k) => { if (r[k] && r[k].xs) r[k].xs.forEach((x) => chips.push(x.code + ' ' + x.word)); })));
  s.eq('register chips show code and verdict', chips.sort(), ['EXP-1 Confirmed', 'EXP-1 Inconclusive', 'EXP-2 Not concluded', 'EXP-2 Refuted', 'EXP-3 Not concluded']);
  s.eq('effect-level chip', card('r_el_seal').rows[0].eff.xs.map((x) => x.code), ['EXP-3']);
  s.ok(/t-ok/.test(card('r_el_seal').rows[0].cause.xs[0].cls), 'confirmed chip is green');
});

/* ============================================================== status menus */
s.step('status at every level, with toasts and the open-risk numbers following', () => {
  goRisks();
  const p0 = probs().slice().sort((a, b) => unres(b) - unres(a))[0];
  const rid = p0.rid, K = 'prob-' + rid;
  const before = roll();
  pickStatus(K, 'Problem status, ' + { open: 'Open', mitigating: 'Mitigating', resolved: 'Resolved' }[p0.status], 'Resolved');
  s.eq('problem status saved', prob(rid).status, 'resolved');
  s.expect('Problem marked resolved.');
  s.eq('resolved problem leaves the open-high count', roll().openHigh, before.openHigh - 1);
  s.eq('the head fact follows', headRisk().value, String(before.openHigh - 1));
  s.eq('the review row follows', reviewRisks().find((it) => it.id === rid).status, 'done');
  pickStatus(K, 'Problem status, Resolved', 'Open');
  s.eq('problem reopened', prob(rid).status, 'open');

  const m = prob(rid).modes[0];
  pickStatus(K, 'Failure mode status, Open', 'Resolved');
  s.eq('mode status saved', prob(rid).modes[0].status, 'resolved');
  s.expect('Failure mode marked resolved.');
  const rows = card(rid).rows.filter((r) => r.hasCause && r.cls.indexOf('fmea-dimrow') >= 0);
  s.ok(rows.length >= 1 && rows.every((r) => r.cause.rpnHidden), 'its causes show — for RPN');
  s.eq('open RPN ignores the resolved mode', unres(prob(rid)), RD.worstUnresolvedRpn(prob(rid), passed(doc(), prob(rid).gateId)));
  pickStatus(K, 'Failure mode status, Resolved', 'Open');

  const e = m.effects[0];
  pickStatus(K, 'Effect status, ' + (e.status === 'mitigating' ? 'Mitigating' : 'Open'), 'Mitigating');
  s.eq('effect status saved', prob(rid).modes[0].effects[0].status, 'mitigating');
  s.expect('Effect marked mitigating.');
  const c = Object.assign({}, e.causes[0]);
  const cAria = 'Cause status, ' + { open: 'Open', mitigating: 'Mitigating', resolved: 'Resolved' }[c.status];
  s.click(cAria, { within: K });
  s.key((el) => el.on.onKeyDown && /fmea-hot/.test(el.attrs.class || ''), 'Escape');
  s.eq('Escape closes the status menu', s.c.state.menu, '');
  pickStatus(K, cAria, 'Resolved');
  s.eq('cause status saved', prob(rid).modes[0].effects[0].causes[0].status, 'resolved');
  s.expect('Cause marked resolved.');
  s.eq('problem badge follows the open RPN', Number(card(rid).rpn), topRpn(prob(rid)));
  pickStatus(K, 'Cause status, Resolved', c.status === 'mitigating' ? 'Mitigating' : 'Open');
  s.eq('cause status restored', prob(rid).modes[0].effects[0].causes[0].status, c.status);
  s.clean('statuses');
});

s.step('rescore a cause inline (S, O, D popover) and the RPN follows', () => {
  goRisks();
  const p0 = probs().slice().sort((a, b) => unres(b) - unres(a))[0];
  const c = Object.assign({}, p0.modes[0].effects[0].causes[0]);
  const K = 'prob-' + p0.rid;
  s.click('Rescore: severity ' + c.severity + ', occurrence ' + c.occurrence + ', detection ' + c.detection, { within: K });
  s.expect('Rescore this cause');
  s.type('Occurrence', '3', { within: K });
  const c2 = prob(p0.rid).modes[0].effects[0].causes[0];
  s.eq('occurrence stored as a number', c2.occurrence, 3);
  const want = RD.calcRpn(c2.severity, 3, c2.detection);
  s.eq('row RPN follows', Number(card(p0.rid).rows[0].cause.rpn), want);
  s.expect('RPN ' + want);
  s.key((el) => el.on.onKeyDown && /fmea-hot/.test(el.attrs.class || ''), 'Escape');
  s.eq('Escape closes the popover', s.c.state.menu, '');
  s.eq('problem badge follows the worst open RPN', Number(card(p0.rid).rpn), topRpn(prob(p0.rid)));
  s.click('Rescore: severity ' + c2.severity + ', occurrence 3, detection ' + c2.detection, { within: K });
  s.type('Occurrence', String(c.occurrence), { within: K });
  s.click('Done', { within: K });
  s.eq('restored', prob(p0.rid).modes[0].effects[0].causes[0].occurrence, c.occurrence);
  s.clean('rescore');
});

/* ========================================================= add a problem */
s.step('add a problem: required statement, knowns, gate, modes, effects, causes, S/O/D, mitigation', () => {
  goRisks();
  const n0 = doc().risks.length;
  s.click('Add problem');
  s.eq('sheet', sheetKind(), 'fmea.edit');
  s.expect('Add problem');
  s.expect('No failure modes yet. Add one to begin.');
  s.click('Save problem');
  s.expect('Give the problem a statement before saving.');
  s.eq('nothing saved without a statement', doc().risks.length, n0);
  s.type('Problem', 'Anode plate corrosion raises contact resistance');
  s.click('Add known');
  s.type('Known 1', 'Uncoated titanium passivates within 200 h at 2 A/cm².');
  s.click('Add known');
  s.type('Known 2', 'scratch');
  s.click('Remove known 2');
  s.eq('known removed from the draft', s.c.draft().knowns.length, 1);
  const gates = byDue(doc().stageGates.filter((g) => g.objectiveId === OBJ));
  const g = gates[gates.length - 1];
  s.type('~Stage-gate', g.id);
  s.eq('gate in draft', s.c.draft().gateId, g.id);
  s.ok(s.all((el) => el.tag === 'option' && el.attrs.label === gateLabel(doc(), g.id) + ': ' + g.name).length === 1, 'gate options read "SG-x: name"');
  s.click('Add failure mode');
  s.type('Failure mode 1', 'Titanium plate passivates');
  s.click('Add effect');
  s.type('Effect 1, failure mode 1', 'Contact resistance climbs past 10 mΩ·cm²');
  s.click('Add cause');
  const cw = 'mode-1-effect-1-cause-1';
  s.eq('a new cause starts at 1, 1, 1', [s.c.draft().modes[0].effects[0].causes[0].severity, s.c.draft().modes[0].effects[0].causes[0].occurrence, s.c.draft().modes[0].effects[0].causes[0].detection], [1, 1, 1]);
  s.type('Cause 1, effect 1, failure mode 1', 'No protective coating on the anode side');
  ['severity', 'occurrence', 'detection'].forEach((k) => RD.FMEA_SCALES[k].forEach((lbl, i) => {
    if (!s.has((el) => el.tag === 'option' && el.attrs.label === (i + 1) + ' — ' + lbl, { within: cw })) s.ok(false, 'scale label ' + k + ' ' + (i + 1));
  }));
  s.ok(true, 'S, O, D lists read "1 — None" to "10 — …" from RD.FMEA_SCALES');
  s.type('Severity', '8', { within: cw });
  s.type('Occurrence', '5', { within: cw });
  s.type('Detection', '6', { within: cw });
  s.expect('240');
  s.ok(s.has((el) => el.attrs.class === 'st t-bad' && textOf(el) === 'High', { within: cw }), 'live RPN shows the high band');
  s.type('Mitigation or action', 'Gold-coat the anode plates for the rebuild.');
  s.click('Add failure mode');
  s.click('Remove failure mode 2');
  s.eq('empty second mode removed from the draft', s.c.draft().modes.length, 1);
  s.click('Save problem');
  s.expect('Problem saved.');
  s.eq('sheet closed', sheetKind(), '');
  s.eq('one problem added', doc().risks.length, n0 + 1);
  const p = doc().risks[doc().risks.length - 1];
  s.eq('stored shape', {
    problem: p.problem, objectiveId: p.objectiveId, gateId: p.gateId, status: p.status,
    knowns: p.knowns.map((k) => k.text), mode: p.modes[0].mode, mstatus: p.modes[0].status,
    effect: p.modes[0].effects[0].effect, cause: p.modes[0].effects[0].causes[0].cause,
    sod: [p.modes[0].effects[0].causes[0].severity, p.modes[0].effects[0].causes[0].occurrence, p.modes[0].effects[0].causes[0].detection],
    mit: p.modes[0].effects[0].causes[0].mitigation, cstatus: p.modes[0].effects[0].causes[0].status
  }, {
    problem: 'Anode plate corrosion raises contact resistance', objectiveId: OBJ, gateId: g.id, status: 'open',
    knowns: ['Uncoated titanium passivates within 200 h at 2 A/cm².'], mode: 'Titanium plate passivates', mstatus: 'open',
    effect: 'Contact resistance climbs past 10 mΩ·cm²', cause: 'No protective coating on the anode side',
    sod: [8, 5, 6], mit: 'Gold-coat the anode plates for the rebuild.', cstatus: 'open'
  });
  s.ok(p.rid && p.knowns[0].kid && p.modes[0].mid && p.modes[0].effects[0].eid && p.modes[0].effects[0].causes[0].cid, 'ids allocated with RD.fmeaId');
  s.eq('new problem sorts first (RPN 240)', reg().probs[0].k, 'prob-' + p.rid);
  s.eq('open-high count includes it', headRisk().value, String(roll().openHigh));
  s.eq('and the review lists it, off track', reviewRisks().find((it) => it.id === p.rid).status, 'off');
  s.clean('after add');
});

/* =========================================================== edit / cancel */
s.step('edit a problem: prefilled, Save changes updates in place; Cancel discards', () => {
  goRisks();
  const p = EXEC ? prob('r_el_cell7') : probs()[0];
  const n0 = doc().risks.length;
  s.click(p.problem, { within: 'prob-' + p.rid });
  s.expect('Edit problem');
  s.eq('statement prefilled', s.c.draft().problem, p.problem);
  s.eq('gate prefilled', s.vals.fmea.ed.gateV, p.gateId);
  s.type('Problem', p.problem + ' (rev)');
  s.click('Cancel');
  s.eq('cancel keeps the stored text', prob(p.rid).problem, p.problem);
  s.click('~More actions for ' + p.problem.slice(0, 40));
  s.click('Edit problem', { within: 'prob-' + p.rid });
  s.type('Problem', '  ' + p.problem + ' (rev)  ');
  s.type('~Stage-gate', '');
  s.click('Save changes');
  s.expect('Problem saved.');
  s.eq('updated in place', [doc().risks.length, prob(p.rid).problem, prob(p.rid).gateId], [n0, p.problem + ' (rev)', null]);
  s.click(p.problem + ' (rev)', { within: 'prob-' + p.rid });
  s.type('Problem', '   ');
  s.click('Save changes');
  s.expect('Give the problem a statement before saving.');
  s.eq('blank statement refused', prob(p.rid).problem, p.problem + ' (rev)');
  s.click('Close');
  s.clean('edit');
});

/* ======================================================== remove / delete */
s.step('delete a problem: confirm names what goes with it, then gone', () => {
  goRisks();
  const p = EXEC ? prob('r_el_cell7') : probs().find((x) => x.problem === 'Anode plate corrosion raises contact resistance');
  const n0 = doc().risks.length;
  const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const nm = p.modes.length, ne = p.modes.reduce((a, m) => a + m.effects.length, 0), nc = p.modes.reduce((a, m) => a + m.effects.reduce((b, e) => b + e.causes.length, 0), 0);
  const nk = p.knowns.filter((k) => k.text.trim()).length, nx = RD.fmeaAllExperiments(p).length;
  s.click('~More actions for ' + p.problem.slice(0, 40));
  s.click('Delete problem', { within: 'prob-' + p.rid });
  s.expect('Delete this problem?');
  [pl(nm, 'failure mode'), pl(ne, 'effect'), pl(nc, 'cause')].concat(nk ? [pl(nk, 'known')] : []).concat(nx ? [pl(nx, 'evidence experiment')] : []).forEach((t) => s.expect(t));
  s.click('Cancel', { within: 'Delete this problem?' });
  s.ok(!!prob(p.rid), 'cancel keeps it');
  s.click('~More actions for ' + p.problem.slice(0, 40));
  s.click('Delete problem', { within: 'prob-' + p.rid });
  s.click('Delete problem', { within: 'Delete this problem?' });
  s.expect('Problem deleted.');
  s.eq('removed', [doc().risks.length, !!prob(p.rid)], [n0 - 1, false]);
  s.clean('delete');
});


s.step('remove a cause: confirm names what goes with it; the last cause takes its effect and mode', () => {
  goRisks();
  const p = probs().find((x) => x.modes.length && x.modes[0].effects.length === 1 && x.modes[0].effects[0].causes.length === 1) ||
    probs().find((x) => x.modes.some((m) => m.effects.some((e) => e.causes.length === 1)));
  const m = p.modes.find((mm) => mm.effects.some((e) => e.causes.length === 1));
  const e = m.effects.find((ee) => ee.causes.length === 1);
  const c = e.causes[0];
  const K = 'prob-' + p.rid;
  const modeHadOne = m.effects.length === 1;
  s.click('~Remove cause: ' + c.cause.slice(0, 40), { within: K });
  s.expect('Remove this cause?');
  s.expect('so that effect is removed too');
  if (modeHadOne) s.expect('so the failure mode goes as well');
  s.click('Cancel', { within: 'Remove this cause?' });
  s.ok(!!prob(p.rid).modes.find((x) => x.mid === m.mid), 'cancel keeps it');
  s.click('~Remove cause: ' + c.cause.slice(0, 40), { within: K });
  s.click('Remove cause', { within: 'Remove this cause?' });
  const mm = prob(p.rid).modes.find((x) => x.mid === m.mid);
  if (modeHadOne) { s.ok(!mm, 'mode removed with its last effect'); s.expect('Cause removed, with its effect and failure mode.'); }
  else { s.ok(mm && !mm.effects.find((x) => x.eid === e.eid), 'effect removed with its last cause'); s.expect('Cause removed, with its effect.'); }
  /* a cause with siblings goes alone */
  const p2 = probs().find((x) => x.modes.some((mo) => mo.effects.some((ef) => ef.causes.length > 1)));
  const e2 = [].concat(...p2.modes.map((mo) => mo.effects)).find((ef) => ef.causes.length > 1);
  const c2 = e2.causes[e2.causes.length - 1];
  const n = e2.causes.length;
  s.click('~Remove cause: ' + c2.cause.slice(0, 40), { within: 'prob-' + p2.rid });
  s.click('Remove cause', { within: 'Remove this cause?' });
  s.expect('Cause removed.');
  const e2b = [].concat(...prob(p2.rid).modes.map((mo) => mo.effects)).find((ef) => ef.eid === e2.eid);
  s.eq('sibling causes stay', e2b.causes.length, n - 1);
  s.clean('remove cause');
});

/* ===================================================== evidence (Execution) */
if (EXEC) s.step('evidence experiments: add, fill, samples, key reads, values, verdict, Back keeps edits, Save commits the whole draft', () => {
  goRisks();
  const n0 = doc().risks.length;
  s.click('Add problem');
  s.type('Problem', 'Endplate bolts lose preload');
  s.click('Add failure mode');
  s.type('Failure mode 1', 'Bolt preload relaxes');
  s.click('Add effect');
  s.click('Add cause');
  s.click('Add experiment to cause 1 of effect 1, failure mode 1');
  s.eq('experiment sheet stacked on the editor', [sheetKind(), (s.c.state.sheets || []).length], ['fmea.exp', 2]);
  s.expect('Experiment EXP-1');
  s.expect('Cause 1');
  s.type('Hypothesis', 'Preload drops 15% in the first 100 h.');
  s.type('Toggle', 'Belleville washers on or off');
  s.type('Experiment', 'Strain-gauge two bolts per side for 100 h at 80 °C.');
  s.type('Add sample', 'Bolt A');
  s.key('Add sample', 'Enter');
  s.type('Add sample', 'Bolt B');
  s.click('Add', { within: 'fmea-experiment' });
  s.type('Add sample', 'Bolt A');
  s.key('Add sample', 'Enter');
  s.expect('“Bolt A” is already a sample.');
  s.expect('No key reads yet');
  s.click('Add key read');
  s.click('Add key read');
  s.type('Key read 1 name', 'Preload loss');
  s.type('Key read 1 unit', '%');
  s.type('Key read 2 name', 'Torque');
  s.type('Bolt A, Preload loss', '14.2');
  s.type('Bolt B, Preload loss', 'abc');
  s.expect('1 of 4 values recorded');
  s.ok(s.has((el) => el.tag === 'input' && /\bbad\b/.test(el.attrs.class || '') && el.attrs['aria-label'] === 'Bolt B, Preload loss'), 'a non-number is flagged and not counted');
  s.type('Bolt B, Preload loss', '9.8');
  s.type('Bolt A, Torque', '30');
  s.expect('3 of 4 values recorded');
  s.click('Remove key read 2');
  s.expect('2 of 2 values recorded');
  const live = () => s.c.state.sheets[0].d.modes[0].effects[0].causes[0].experiments[0];
  s.eq('key read removal drops its values', Object.keys(live().values['Bolt A']).length, 1);
  s.click('Remove sample Bolt B');
  s.eq('sample removal drops its values', [live().samples, live().values['Bolt B']], [['Bolt A'], undefined]);
  s.type('Notes', 'Gauge 3 was noisy.');
  s.type('Verdict', 'confirmed');
  s.type('Conclusion', 'Preload relaxes; add Belleville washers.');
  s.click('Back to problem');
  s.eq('back to the editor', sheetKind(), 'fmea.edit');
  s.expect('1 of 1 values');
  s.eq('nothing saved yet', doc().risks.length, n0);
  s.click('Open EXP-1');
  s.eq('edits kept in the draft', [s.vals.fmea.ex.hypothesis, s.vals.fmea.ex.verdict], ['Preload drops 15% in the first 100 h.', 'confirmed']);
  s.click('Save experiment');
  s.expect('Experiment saved.');
  s.eq('saving the experiment creates the problem', doc().risks.length, n0 + 1);
  const p = doc().risks[doc().risks.length - 1];
  const x = p.modes[0].effects[0].causes[0].experiments[0];
  s.eq('stored experiment', { code: x.code, h: x.hypothesis, t: x.toggle, test: x.test, samples: x.samples, krs: x.key_reads.map((k) => [k.name, k.unit]), v: x.values['Bolt A'][x.key_reads[0].krid], notes: x.notes, verdict: x.verdict, concl: x.conclusion },
    { code: 'EXP-1', h: 'Preload drops 15% in the first 100 h.', t: 'Belleville washers on or off', test: 'Strain-gauge two bolts per side for 100 h at 80 °C.', samples: ['Bolt A'], krs: [['Preload loss', '%']], v: '14.2', notes: 'Gauge 3 was noisy.', verdict: 'confirmed', concl: 'Preload relaxes; add Belleville washers.' });
  s.eq('engine progress', RD.fmeaExpProgress(x), { filled: 1, total: 1, complete: true });
  s.eq('statement typed so far is saved with it', [p.problem, p.objectiveId], ['Endplate bolts lose preload', OBJ]);
  s.expect('Edit problem');
  s.click('Add experiment to failure mode 1');
  s.expect('Experiment EXP-2');
  s.click('Back to problem');
  s.click('Remove EXP-2');
  s.click('Save changes');
  s.eq('later save updates, not duplicates', doc().risks.filter((r) => r.rid === p.rid).length, 1);
  s.eq('removed draft experiment is gone', RD.fmeaAllExperiments(prob(p.rid)).map((r) => r.x.code), ['EXP-1']);
  s.expect('1 evidence experiment: 1 confirmed');
  /* a register chip opens the editor with that experiment on top */
  s.click((el) => el.tag === 'button' && /fmea-x/.test(el.attrs.class || '') && textOf(el) === 'EXP-1 Confirmed', { within: 'prob-' + p.rid });
  s.eq('chip opens the experiment over its problem', [(s.c.state.sheets || []).map((x) => x.kind), s.vals.fmea.ex.title], [['fmea.edit', 'fmea.exp'], 'Experiment EXP-1']);
  s.click('Back to problem');
  s.click('Close');
  s.clean('evidence');
});

if (EXEC) s.step('collapse all, expand all and per card, kept while the page is open', () => {
  goRisks();
  const pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const sm = prob('r_el_seal').modes[0];
  const nc = sm.effects.reduce((a, e) => a + e.causes.length, 0);
  s.click('~Seal creep', { within: 'prob-r_el_seal' });
  s.click('Collapse all');
  s.expect(pl(sm.effects.length, 'effect') + ', ' + pl(nc, 'cause') + ', ' + RD.fmeaAllExperiments({ modes: [sm] }).length + ' evidence');
  s.ok(!s.has('What could go wrong?'), 'collapsed mode hides its fields');
  s.click('Expand failure mode 1');
  s.expect('Gasket relaxes and loses seal compression');
  const e0x = RD.fmeaNodeExperiments(sm.effects[0]).length;
  s.ok(s.has(pl(sm.effects[0].causes.length, 'cause') + (e0x ? ', ' + e0x + ' evidence' : ''), { within: 'mode-1-effect-1' }), 'collapsed effect shows its summary');
  s.click('Expand effect 1 of failure mode 1');
  s.ok(s.has('RPN ' + RD.calcRpn(9, 6, 4)), 'collapsed cause shows its RPN');
  s.click('Close');
  s.click('~Seal creep', { within: 'prob-r_el_seal' });
  s.ok(s.has('Expand cause 1 of effect 1, failure mode 1'), 'collapse state survives reopening the editor');
  s.click('Expand all');
  s.ok(!s.has('Expand cause 1 of effect 1, failure mode 1') && s.has('What could go wrong?'), 'expand all opens everything');
  s.click('Collapse failure mode 1');
  s.ok(s.has('Expand failure mode 1'), 'per-card collapse');
  s.click('Expand all');
  s.click('Close');
  s.clean('collapse');
});

if (!EXEC) s.step('Sales: no evidence experiments and no collapse; a blank statement now says why', () => {
  goRisks();
  s.ok(!s.has('~EXP-'), 'no evidence chips');
  s.click('Add problem');
  s.ok(!s.has('Collapse all') && !s.has('Expand all'), 'no collapse controls');
  s.click('Add failure mode');
  s.click('Add effect');
  s.click('Add cause');
  s.ok(!s.has('Add experiment'), 'no experiments');
  s.click('Save problem');
  s.expect('Give the problem a statement before saving.');
  s.click('Cancel');
  s.clean('sales');
});

/* ====================================================== stale gate links */
s.step('a problem linked to a gate that no longer exists says so and can be unlinked', () => {
  goRisks();
  const p = probs()[0];
  p.gateId = 'SG-GONE-1';
  s.c.bump(); s.render();
  s.expect('Linked stage-gate no longer exists');
  s.eq('tag falls back to the stored id (today\'s gateLabel)', card(p.rid).gateTag, 'SG-GONE-1');
  s.click(p.problem, { within: 'prob-' + p.rid });
  s.ok(s.has((el) => el.tag === 'option' && el.attrs.label === 'SG-GONE-1 (this gate no longer exists)'), 'editor shows the dangling link');
  s.type('~Stage-gate', '');
  s.click('Save changes');
  s.eq('unlinked', prob(p.rid).gateId, null);
  s.clean('stale gate');
});

/* ================================================================== search */
s.step('header search finds problems and failure modes and opens them', () => {
  const srch = (q) => X.MODS.fmea.search(s.c, s.c.ctx, q);
  const q1 = EXEC ? 'creep' : 'interconnection';
  const r1 = srch(q1);
  s.ok(r1.length >= 1 && r1.some((r) => /^Risk in /.test(r.sub)), 'problem found by text');
  const q2 = EXEC ? 'gasket relaxes' : 'term sheets expire';
  const r2 = srch(q2);
  s.ok(r2.some((r) => /^Failure mode of /.test(r.sub)), 'failure mode found by text');
  s.eq('nothing for unknown text', srch('zzqq').length, 0);
  s.eq('blank query', srch('  ').length, 0);
  s.click('Overview');
  s.c.setState({ fQuarter: '2027Q1' }); s.render();
  srch(q1)[0].go(); s.render();
  s.eq('go opens the objective, the Risks tab and highlights the problem', [s.c.state.objId, s.c.state.tab, !!s.c.state.fmea_focus], [OBJ, 'risks', true]);
  s.eq('filters that hid it are cleared', s.c.state.fQuarter, '');
  s.clean('search');
});

/* =============================================================== read-only */
s.step('read-only: register visible, every editing control gone, data untouched', () => {
  goRisks();
  const snap = JSON.stringify(doc().risks);
  setRo(true);
  goRisks();
  s.ok(s.c.isRo(), 'read-only on');
  s.expect('FMEA risk register');
  s.ok(!s.has('Add problem'), 'no Add problem');
  s.ok(!s.has('~Problem status,') && !s.has('~Cause status,'), 'statuses are plain dot and word');
  s.ok(!s.has('~Remove cause') && !s.has('~More actions for'), 'no remove or delete');
  s.ok(!s.has('~Rescore'), 'no rescore');
  const p = probs()[0];
  s.ok(!s.all(p.problem, { within: 'prob-' + p.rid }).some((el) => el.on.onClick), 'problem name is not a button');
  if (EXEC) s.ok(!s.all((el) => /fmea-x/.test(el.attrs.class || '')).some((el) => el.on.onClick), 'evidence chips are not buttons');
  s.ok(s.has((el) => /^st t-/.test(el.attrs.class || '') && textOf(el) === 'Open'), 'status still shown');
  s.eq('nothing changed', JSON.stringify(doc().risks), snap);
  setRo(false);
  s.ok(!s.c.isRo() && s.has('Add problem'), 'editing returns when read-only is off');
  s.clean('read-only');
});

/* ======================================================= rule cross-check */
s.step('FMEA.migrate reshapes a stored doc like today\'s load', () => {
  if (!X.FMEA) return s.ok(false, 'FMEA namespace missing');
  const d = X.FMEA.migrate({ risks: [{ id: 'R1', knowns: ['a'], modes: [{ mode: 'm', effects: [] }] }] });
  s.eq('migrated', [d.risks[0].rid, d.risks[0].knowns[0].text, d.risks[0].modes[0].status, !!d.risks[0].modes[0].mid], ['R1', 'a', 'open', true]);
});

s.step('numbers match today\'s rules across every objective and division', () => {
  Object.keys(s.c.D.docs).forEach((k) => {
    const d = s.c.D.docs[k];
    const objs = [...new Set((d.risks || []).map((p) => p.objectiveId))];
    objs.forEach((o) => {
      const ps = RD.fmeaProblemsFor(d, o);
      const r = RD.fmeaRollup(ps, (gid) => passed(d, gid));
      const ctx = { doc: d, objId: o, today: today() };
      if (X.FMEA) { const pub = X.FMEA.rollup(ctx); s.eq('rollup ' + k + ' ' + o, [pub.openHigh, pub.openMed, pub.worst, pub.total], [r.openHigh, r.openMed, r.worst, r.total]); }
    });
  });
});

done();
