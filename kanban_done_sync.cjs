// The Done-column choice follows the person: the engine half.
//   hubSessionEmail — who is viewing, read from the Hub's sign-in exactly as strictly as the Hub reads it
//   doneVal         — a choice as stored; the default is never stored
//   reconcileDone   — square this device's copy with the broker's (broker wins, undelivered changes win back)
// The broker merges a push server-side (null deletes); `serverApply` below is that contract, so the two-device
// story at the bottom runs the same sequence the apps and the broker run, minus the network.
const C = require((process.env.RD_SRC || '.') + '/rdcore.js');
let n = 0, f = 0; const ok = (c, m) => { n++; if (!c) { f++; console.log('FAIL:', m); } };
const J = x => JSON.stringify(x);
const NOW = Date.parse('2026-10-09T15:00:00Z');
const sess = o => JSON.stringify(Object.assign({ email: 'corey@celadyne.com', role: 'admin', issuedAt: NOW - 1e6, expiresAt: NOW + 86400000 }, o));

// ---- who is viewing ----
ok(C.hubSessionEmail(sess(), NOW) === 'corey@celadyne.com', 'a live Hub sign-in names the viewer');
ok(C.hubSessionEmail(sess({ email: '  Corey@Celadyne.COM ' }), NOW) === 'corey@celadyne.com', 'the email is trimmed and lower-cased, so one person is one key');
ok(C.hubSessionEmail(sess({ expiresAt: NOW - 1 }), NOW) === null, 'an expired sign-in is nobody');
ok(C.hubSessionEmail(sess({ expiresAt: NOW }), NOW) === null, '...including one that expires this very millisecond');
ok(C.hubSessionEmail(sess({ expiresAt: String(NOW + 1e6) }), NOW) === null, 'an expiry that is not a number is not trusted');
ok(C.hubSessionEmail(JSON.stringify({ email: 'corey@celadyne.com' }), NOW) === null, 'no expiry at all -> nobody');
ok(C.hubSessionEmail(sess({ email: 'corey' }), NOW) === null && C.hubSessionEmail(sess({ email: '@celadyne.com' }), NOW) === null,
  'something that is not an email is nobody');
ok(C.hubSessionEmail(sess({ email: 42 }), NOW) === null, 'a non-string email is nobody');
for (const raw of [null, undefined, '', '{not json', '"a string"', '42', 'null', '[]'])
  ok(C.hubSessionEmail(raw, NOW) === null, 'unreadable storage (' + J(raw) + ') is nobody, not a throw');
ok(C.hubSessionEmail(JSON.parse(sess()), NOW) === 'corey@celadyne.com', 'an already-parsed session object works too');

// ---- the stored form ----
ok(C.doneVal({ win: 'all', style: 'cards' }) === null && C.doneVal({}) === null && C.doneVal(null) === null && C.doneVal({ win: 'all' }) === null,
  'the default (all, cards) is never stored');
ok(J(C.doneVal({ win: 14 })) === J({ win: 14, style: 'cards' }), 'a window alone stores with cards');
ok(J(C.doneVal({ style: 'compact' })) === J({ win: 'all', style: 'compact' }), 'compact alone stores with all');
ok(J(C.doneVal({ win: '14', style: 'sideways' })) === J({ win: 14, style: 'cards' }), 'stored values are normalised (string 14 -> 14; unknown style -> cards)');
ok(J(C.doneVal({ win: 'none' })) === J({ win: 'none', style: 'cards' }), 'count-only is a real choice and is stored');

// ---- reconciling ----
const W = (win, style) => ({ win, style: style || 'cards' });
{ // first signed-in load on this device: pre-sync choices are carried up
  const r = C.reconcileDone({}, null, { B1: W(14, 'compact'), B2: W('all', 'cards') });
  ok(J(r.prefs) === J({ B1: W(14, 'compact') }) && J(r.push) === J({ B1: W(14, 'compact') }),
    "first time here: this browser's earlier choice is shown and sent up (" + J(r.push) + ')');
  ok(!('B2' in r.push), '...but a board left at the default sends nothing');
}
{
  const r = C.reconcileDone({ B1: W(7) }, null, { B1: W(14) });
  ok(J(r.prefs) === J({ B1: W(7) }) && J(r.push) === '{}', "first time here, the broker already has this board: the broker's choice wins");
}
{
  const r = C.reconcileDone({ B2: W(30) }, null, { B1: W(3) });
  ok(J(r.prefs) === J({ B2: W(30), B1: W(3) }) && J(r.push) === J({ B1: W(3) }), 'first time here: boards merge — the broker keeps its, this browser adds its own');
}
{ // steady state: the broker is the truth
  const r = C.reconcileDone({ B1: W(7) }, { prefs: { B1: W(14), B3: W(30) }, pending: [] }, { B9: W(3) });
  ok(J(r.prefs) === J({ B1: W(7) }) && J(r.push) === '{}',
    'after the first time: the broker replaces this copy outright — a change made on another device lands, a board cleared there clears here');
  ok(!('B9' in r.prefs), "...and this browser's signed-out choices are not consulted again");
}
{ // undelivered changes win
  const r = C.reconcileDone({ B2: W(30) }, { prefs: { B2: W(3) }, pending: ['B2'] }, {});
  ok(J(r.prefs) === J({ B2: W(3) }) && J(r.push) === J({ B2: W(3) }), 'a change this device has not delivered yet beats the broker, and is sent again');
}
{ // a reset is not resurrected
  const r = C.reconcileDone({ B1: W(14) }, { prefs: {}, pending: ['B1'] }, { B1: W(14) });
  ok(!('B1' in r.prefs) && r.push.B1 === null && 'B1' in r.push,
    'a board put back to the default here, not yet delivered, is DELETED on the broker (push null) rather than revived from its copy');
}
{ // changed before the broker ever answered (it was down, or not set up yet): still the first time
  const prov = { prefs: { B1: W(14), B3: W(7) }, pending: ['B3'], first: true };
  const r = C.reconcileDone({}, prov, { B1: W(14) });
  ok(J(r.prefs) === J({ B1: W(14), B3: W(7) }) && J(r.push) === J({ B1: W(14), B3: W(7) }),
    'a change made before the broker first answered: the first sync carries up BOTH the earlier choices and the change');
  const r2 = C.reconcileDone({ B2: W(30) }, { prefs: {}, pending: ['B2'], first: true }, { B2: W(14) });
  ok(!('B2' in r2.prefs) && r2.push.B2 === null, "...and a reset made then beats both the broker's copy and this browser's old one");
  const r3 = C.reconcileDone({ B1: W(30) }, { prefs: { B1: W(14) }, pending: [], first: true }, { B1: W(14) });
  ok(J(r3.prefs) === J({ B1: W(30) }) && J(r3.push) === '{}', "...while a board it did not touch still defers to the broker");
}
{
  const r = C.reconcileDone({ 7: W(3) }, { prefs: { 7: W(30) }, pending: [7] }, null);
  ok(J(r.push) === J({ 7: W(30) }), 'numeric board ids are keyed as strings');
}
for (const junk of [null, undefined, 'x', 42])
  ok(J(C.reconcileDone(junk, null, junk)) === J({ prefs: {}, push: {} }), 'a malformed reply or store (' + J(junk) + ') reconciles to nothing, not a throw');
{
  const r = C.reconcileDone({ B1: { win: '14', style: 'compact' }, B2: { win: 'abc' } }, { prefs: {}, pending: [] }, {});
  ok(J(r.prefs) === J({ B1: W(14, 'compact') }), "the broker's values are normalised too, and an unusable one falls back to the default (and so drops out)");
}

// ---- two devices, one person (the broker's merge: a push sets keys, null deletes) ----
{
  const serverApply = (srv, push) => { const s = Object.assign({}, srv); for (const k in push) { if (push[k] === null) delete s[k]; else s[k] = push[k]; } return s; };
  let srv = {};
  // laptop: signed in for the first time; it had a choice from before sync existed
  let r = C.reconcileDone(srv, null, { B1: W(14, 'compact') }); srv = serverApply(srv, r.push);
  let laptop = { prefs: r.prefs, pending: [] };
  ok(J(srv) === J({ B1: W(14, 'compact') }), "the laptop's earlier choice reaches the broker");
  // desktop: never used the menu
  r = C.reconcileDone(srv, null, {}); srv = serverApply(srv, r.push);
  let desktop = { prefs: r.prefs, pending: [] };
  ok(J(desktop.prefs) === J({ B1: W(14, 'compact') }), 'the desktop opens the board the way the laptop left it');
  // desktop resets the board; delivered
  desktop = { prefs: {}, pending: ['B1'] };
  r = C.reconcileDone(srv, desktop, {}); srv = serverApply(srv, r.push); desktop = { prefs: r.prefs, pending: [] };
  ok(J(srv) === '{}', 'resetting on the desktop clears it on the broker');
  // laptop comes back, still holding its old copy
  r = C.reconcileDone(srv, laptop, { B1: W(14, 'compact') }); srv = serverApply(srv, r.push); laptop = { prefs: r.prefs, pending: [] };
  ok(J(laptop.prefs) === '{}' && J(srv) === '{}', "the laptop's stale copy does not bring the reset board back");
}

console.log(f ? `\n${f}/${n} FAILED` : `\nPASS — ${n} done-column sync engine assertions green`); process.exit(f ? 1 : 0);
