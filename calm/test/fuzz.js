/* Random-walk check of a built board: renders, fires a random visible handler with a
   plausible event, repeats. Reports exceptions, view-model errors, suspicious text
   (undefined / NaN / [object …]), unresolved holes and handler sites never reached.

     node test/fuzz.js out/Main.dc.html [steps=4000] [seed=7]
*/
const { Sim, textOf, where, jsWhere } = require('./dc');

const file = process.argv[2];
const steps = Number(process.argv[3] || 4000);
let seed = Number(process.argv[4] || 7);
function rand() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
const pick = (a) => a[Math.floor(rand() * a.length)];

const VALUES = ['', '1.83', '1.9', 'abc', '75', '0', '1', '-3', '12.5', '2026-11-05', '2027-02-01', '2026-10-13', 'Seal creep at 80 °C', '3', '100', '0.4', 'pass', '  ', '1e3', 'Toru', 'toru@celadyne.com', '10'];
const KEYS = ['Enter', 'Escape', 'a', 'ArrowDown', 'ArrowUp', 'Tab', 'Backspace'];

let s;
try { s = new Sim(file); } catch (e) { console.log('CONSTRUCT/RENDER FAIL', e.stack); process.exit(1); }
const problems = new Map();
const add = (k, v) => { if (!problems.has(k)) problems.set(k, v || ''); };
s.parsed.errors.forEach((e) => add('TEMPLATE ' + e));
const initialUnresolved = new Set(s.ctx.unresolved);
const unresolvedAll = new Set(s.ctx.unresolved);
const counts = {};
const sites = new Set();
(function collect(n) { if (n.attrs) for (const k of Object.keys(n.attrs)) if (k.startsWith('on')) sites.add(k + '@' + n.line); (n.kids || []).forEach(collect); })(s.parsed.tree);

function collectProblems() {
  s.ctx.errs.forEach((e) => add(where(s.parsed, 'RENDER ' + e)));
  s.vmErrors.forEach((e) => add('VIEW ' + e));
  s.ctx.unresolved.forEach((u) => unresolvedAll.add(u));
}
collectProblems();
let fails = 0;
for (let i = 0; i < steps && fails < 30; i++) {
  const hs = [];
  s.els.forEach((el) => Object.keys(el.on).forEach((name) => hs.push({ el, name })));
  if (!hs.length) { s = new Sim(file); continue; }
  let h;
  if (rand() < 0.65) {
    let best = Infinity, pool = [];
    for (const x of hs) { const n = counts[x.name + '@' + x.el.line] || 0; if (n < best) { best = n; pool = [x]; } else if (n === best) pool.push(x); }
    h = pick(pool);
  } else h = pick(hs);
  const key = h.name.replace(/^on/, 'on').toLowerCase() + '@' + h.el.line;
  counts[h.name + '@' + h.el.line] = (counts[h.name + '@' + h.el.line] || 0) + 1;
  const type = h.el.attrs.type || '';
  let value = pick(VALUES);
  if (type === 'range') value = String(Math.floor(rand() * 101));
  if (type === 'date') value = rand() < 0.85 ? '2026-' + pick(['09', '10', '11', '12']) + '-' + pick(['01', '09', '13', '20', '28']) : '';
  if (type === 'number') value = pick(['', '1', '5', '10', '0', '-1', '3.5', '200']);
  if (h.el.tag === 'select') {
    const opts = s.els.filter((e) => e.tag === 'option' && e.parent && (e.parent === h.el || (e.parent.parent === h.el)));
    if (opts.length) value = String(pick(opts).attrs.value);
  }
  const extra = { key: pick(KEYS), target: { value, checked: rand() < 0.5, dataset: {} }, clientX: Math.floor(rand() * 900), clientY: Math.floor(rand() * 40) };
  try {
    h.el.on[h.name](s.ev(h.el, extra));
    s.flush(rand() < 0.3 ? 10000 : 0);
  } catch (e) {
    fails++;
    add(where(s.parsed, 'HANDLER ' + h.name + ' line ' + h.el.line) + ' "' + (textOf(h.el) || h.el.attrs['aria-label'] || h.el.tag).slice(0, 40) + '": ' + e.message, jsWhere(s.parsed, String(e.stack).split('\n').slice(1, 4).join('\n    ')));
    try { s.render(); } catch (e2) { add('RENDER FAIL after handler: ' + e2.message, jsWhere(s.parsed, String(e2.stack).split('\n').slice(1, 4).join('\n    '))); s = new Sim(file); }
  }
  try { collectProblems(); } catch (e) { add('COLLECT ' + e.message); }
  if (rand() < 0.004) s = new Sim(file);
}
const hit = Object.keys(counts).map((k) => k.replace(/^on([A-Z])/, (m, c) => 'on' + c.toLowerCase()));
const hitSet = new Set(Object.keys(counts).map((k) => k.toLowerCase()));
const missed = [...sites].filter((k) => !hitSet.has(k.toLowerCase()));
console.log('file:', file, 'steps:', steps, 'handler sites hit:', (sites.size - missed.length) + ' of ' + sites.size);
if (missed.length) console.log('never reached (' + missed.length + '):', missed.slice(0, 80).map((k) => { const n = k.split('@')[1]; const hit = s.parsed.srcmap && s.parsed.srcmap[n]; return k + (hit ? ' (' + hit[0] + ':' + hit[1] + ')' : ''); }).join(', '));
console.log('unresolved holes at start:', [...initialUnresolved].slice(0, 40).map((u) => where(s.parsed, u)).join(' | ') || 'none');
const later = [...unresolvedAll].filter((u) => !initialUnresolved.has(u));
console.log('unresolved holes later:', later.slice(0, 40).map((u) => where(s.parsed, u)).join(' | ') || 'none');
if (problems.size) { console.log('PROBLEMS (' + problems.size + '):'); for (const [k, v] of problems) console.log('- ' + k + (v ? '\n    ' + v : '')); process.exitCode = 1; } else console.log('no problems');
