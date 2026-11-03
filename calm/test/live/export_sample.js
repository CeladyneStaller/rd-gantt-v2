#!/usr/bin/env node
/* ============================================================================
   export_sample.js: write the Calm sample dataset as broker documents (seed set "sample").

     node test/live/export_sample.js [board] [outDir] [--prefs]
       board    a built SAMPLE board (default out/Main.dc.html). Every board runs every seed
                (build.py all_seed_files), so any of the four gives the same dataset.
       outDir   default test/live/seeds/sample
       --prefs  also store the sample's own Done-column choices (D.prefs, for D.me) in the prefs bin,
                the way PATCH /prefs would; without it the prefs bin is empty (version 0)

   It evaluates the board's script with test/dc.js (no browser), constructs the Component and reads C.D:
     state/portfolio.json       D.portfolio
     state/EXEC-*.json, BIZ-*   D.docs
     state/SPEC-*.json          D.spec
     state/gantt-view.json      D.ganttView ({"overrides": {}})
     bins/users.json            D.roster.users as the Hub stores its users bin (email, name, role, orgRole,
                                leadOf, leadUnits, leadDivisions, disabled + OBVIOUSLY FAKE pinHash/salt/iterations)
     bins/analysis-index.json   D.analysis (schema 2)
     bins/prefs.json            {"version": 0, "updatedAt": null, "doc": {"users": {}}}
     manifest.json              divisions (R&D -> UNIFIED_DIVISIONS, business -> BIZ_DIVISIONS) and bin env names
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const CALM = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const pos = argv.filter((a) => !a.startsWith('--'));
const board = path.resolve(pos[0] || path.join(CALM, 'out', 'Main.dc.html'));
const outDir = path.resolve(pos[1] || path.join(HERE, 'seeds', 'sample'));

if (!fs.existsSync(board)) { console.error('export_sample: no board at ' + board + ' (build first: python3 build.py)'); process.exit(2); }

/* Some seeds mint ids with Math.random (FMEA kid/mid/eid/cid); dc.js already fixes the clock. A seeded
   generator makes the export reproducible (and identical from every board), so regenerating gives a
   clean diff. */
Math.random = (function (a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})(20261013);

const { load } = require(path.join(CALM, 'test', 'dc.js'));
const { Component, ns } = load(board);
const C = new Component({});
const D = C.D;
const RD = ns && ns.RD;

if (!D || !D.portfolio || !Array.isArray(D.portfolio.divisions)) { console.error('export_sample: the board has no sample portfolio (is it a LIVE build?)'); process.exit(2); }

const kindOf = (d) => (RD && typeof RD.divisionKind === 'function' ? RD.divisionKind(d) : (d && d.kind) || 'rd');
const divisions = D.portfolio.divisions.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
const unified = divisions.filter((d) => kindOf(d) !== 'biz').map((d) => d.id);
const biz = divisions.filter((d) => kindOf(d) === 'biz').map((d) => d.id);

/* JSON round trip: exactly what a PUT would store (drops undefined, refuses NaN/Infinity below) */
function plain(v, where) {
  const s = JSON.stringify(v, (k, x) => {
    if (typeof x === 'number' && !isFinite(x)) throw new Error('non-finite number at ' + where + (k ? '.' + k : ''));
    return x;
  });
  return s === undefined ? null : JSON.parse(s);
}

const state = {};
state.portfolio = plain(D.portfolio, 'portfolio');
state['gantt-view'] = plain(D.ganttView || { overrides: {} }, 'ganttView');
Object.keys(D.docs || {}).forEach((id) => { state[id] = plain(D.docs[id], id); });
Object.keys(D.spec || {}).forEach((id) => { state[id] = plain(D.spec[id], id); });

const implied = ['portfolio', 'gantt-view'].concat(unified.map((d) => 'EXEC-' + d), unified.map((d) => 'SPEC-' + d), biz.map((d) => 'BIZ-' + d));
const missing = implied.filter((id) => !state[id]);
const extra = Object.keys(state).filter((id) => implied.indexOf(id) < 0);
if (missing.length) console.warn('export_sample: no sample document for ' + missing.join(', ') + ' (seeded as fresh version-0 bins)');
if (extra.length) console.warn('export_sample: documents with no division in the portfolio: ' + extra.join(', ') + ' (seeded, but the broker will not serve them)');

/* the users bin as the Hub stores it; the credentials are fake on purpose and must never reach a browser */
const ADMIN_ROLES = ['cto', 'ceo'];
const users = ((D.roster && D.roster.users) || []).filter((u) => u && u.email).map((u) => {
  const local = String(u.email).split('@')[0];
  const role = String(u.orgRole || '').toLowerCase();
  return {
    email: String(u.email).toLowerCase(),
    name: u.name || '',
    role: ADMIN_ROLES.indexOf(role) >= 0 ? 'admin' : 'user',
    orgRole: role,
    leadOf: (u.leadDivisions || []).slice(),
    leadUnits: (u.leadUnits || []).slice(),
    leadDivisions: (u.leadDivisions || []).slice(),
    disabled: !!u.disabled,
    pinHash: 'FAKE-TEST-PINHASH-' + local + '-not-a-real-credential',
    salt: 'FAKE-TEST-SALT-' + local,
    iterations: 1
  };
});

const analysis = plain(D.analysis || { schema: 2, runs: [] }, 'analysis');

let prefs = { version: 0, updatedAt: null, doc: { users: {} } };
if (flags.has('--prefs') && D.me && D.me.email && D.prefs && Object.keys(D.prefs).length) {
  const mine = {};
  Object.keys(D.prefs).forEach((area) => { if (D.prefs[area] && Object.keys(D.prefs[area]).length) mine[area] = plain(D.prefs[area], 'prefs.' + area); });
  if (Object.keys(mine).length) prefs = { version: 1, updatedAt: null, doc: { users: { [String(D.me.email).toLowerCase()]: mine } } };
}

/* one enabled person per role, for tests that sign someone in */
const signIn = {};
users.forEach((u) => { if (!u.disabled && u.orgRole && !signIn[u.orgRole]) signIn[u.orgRole] = u.email; });

const manifest = {
  name: 'sample',
  description: 'The Calm sample dataset (calm/data/sample.js plus every seed) as broker documents. Regenerate: node test/live/export_sample.js',
  source: path.relative(CALM, board),
  generatedAt: new Date().toISOString(),
  unifiedDivisions: unified,
  bizDivisions: biz,
  stateVersion: 1,
  missingState: 'fresh',
  bins: {
    users: { env: 'USERS_BIN', file: 'bins/users.json' },
    analysis: { env: 'ANALYSIS_INDEX_BIN', file: 'bins/analysis-index.json' },
    prefs: { env: 'PREFS_BIN', file: 'bins/prefs.json' }
  },
  signIn: signIn,
  today: D.todayIso || null
};

/* write: clear what an earlier export left, then every file */
const write = (rel, obj) => {
  const f = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(obj, null, 2) + '\n');
};
['state', 'bins'].forEach((sub) => {
  const d = path.join(outDir, sub);
  if (fs.existsSync(d)) fs.readdirSync(d).filter((f) => f.endsWith('.json')).forEach((f) => fs.unlinkSync(path.join(d, f)));
});
Object.keys(state).forEach((id) => write('state/' + id + '.json', state[id]));
write('bins/users.json', { users: users });
write('bins/analysis-index.json', analysis);
write('bins/prefs.json', prefs);
write('manifest.json', manifest);

console.log('export_sample: wrote ' + path.relative(process.cwd(), outDir) + ': ' + Object.keys(state).length + ' documents (' + Object.keys(state).join(', ') + '), ' +
  users.length + ' users, ' + ((analysis && analysis.runs) || []).length + ' analysis runs; UNIFIED_DIVISIONS=' + unified.join(',') + ' BIZ_DIVISIONS=' + biz.join(','));
