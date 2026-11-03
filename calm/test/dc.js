/* ============================================================================
   Headless driver for built calm boards. No browser: it evaluates the board's
   logic class against a stub DCLogic, walks the template with renderVals()
   exactly the way the DC runtime does (same expression rules, sc-if/sc-for),
   and lets a test click, type and drag by what a person would see.

     const { Sim } = require('./dc');
     const s = new Sim('out/Main.dc.html');
     s.click('Key results');                 // a tab, by its visible text
     s.click('Add key result');
     s.type('Statement', 'Hold 2 A/cm² for 100 h');   // by label / aria-label / placeholder
     s.click('Save key result');
     s.expect('Hold 2 A/cm² for 100 h');     // visible somewhere
     s.vals.kr.rows.length                    // or read the view model directly
     s.done();                                // prints pass/fail counts, sets exit code

   Queries: an exact string (trimmed visible text, aria-label, title, label or
   placeholder), '~substring', a RegExp, or a function(el) => bool.
   Options: { nth, tag, within } — within matches an ancestor's aria-label,
   title, data-k or id (exact, or '~sub').
   ========================================================================== */
const path = require('path');
const { execFileSync } = require('child_process');

let TIMERS = [];
let NOW = Date.UTC(2026, 9, 13, 16, 0, 0);
const realDateNow = Date.now;

function installGlobals() {
  const store = {};
  global.window = {
    sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    location: { href: 'https://example.test/board', search: '' },
    /* the clipboard accepts at once (a thenable that settles synchronously, so a test sees the toast);
       tests that need a refusal replace writeText */
    navigator: { clipboard: { writeText: () => ({ then(ok) { if (ok) ok(); return this; } }) } },
    open() {}, print() {}, scrollTo() {}
  };
  global.setTimeout = (fn, ms) => { TIMERS.push({ fn, at: NOW + (ms || 0) }); return TIMERS.length; };
  global.clearTimeout = () => {};
  global.requestAnimationFrame = (fn) => global.setTimeout(fn, 16);
  Date.now = () => NOW;
}

class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(u, cb) { const v = typeof u === 'function' ? u(this.state) : u; this.state = Object.assign({}, this.state, v); if (cb) cb(); }
  forceUpdate() {}
  componentDidMount() {}
  componentDidUpdate() {}
  componentWillUnmount() {}
  renderVals() { return {}; }
}

/* the Python that runs the build: RD_PYTHON (sweep.py and build.py --check set it), else `python` on Windows (python.org
   installs no python3 there) and `python3` elsewhere */
const PY = process.env.RD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const CACHE = {};
function load(file) {
  const abs = path.resolve(file);
  if (CACHE[abs]) return CACHE[abs];
  const parsed = JSON.parse(execFileSync(PY, [path.join(__dirname, 'parse.py'), abs], { maxBuffer: 1 << 28 }).toString());
  installGlobals();
  /* the board's script scope also holds the modules' public namespaces; hand them to tests as s.ns */
  const NAMES = ['MODS', 'RD', 'F', 'K', 'KPI', 'KR', 'GATES', 'KB', 'FMEA', 'PED', 'PGT', 'PMS', 'SSPEC', 'SSUB', 'REPAIR', 'MERGE', 'NET', 'MINE', 'REVIEW', 'PULL', 'STEP', 'ETB'];
  const tail = '\n;return { C: (typeof Component!=="undefined"&&Component)||undefined, ns: {' + NAMES.map((n) => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') + '} };';
  const got = new Function('DCLogic', 'StreamableLogic', 'React', parsed.script + tail)(DCLogic, DCLogic, {});
  const Component = got.C;
  if (!Component) throw new Error('no Component class in ' + file);
  CACHE[abs] = { Component, parsed, ns: got.ns };
  return CACHE[abs];
}
/* 'line 812' -> 'line 812 (mods/kr/slot-krs.html:40)' using the build's source markers */
function where(parsed, text) {
  return String(text).replace(/line (\d+)/g, (m, n) => {
    const hit = parsed.srcmap && parsed.srcmap[n];
    return hit ? 'line ' + n + ' (' + hit[0] + ':' + hit[1] + ')' : m;
  });
}
/* map a stack trace's <anonymous>:LINE to the script's source file using the build's section headers */
function jsWhere(parsed, stack) {
  if (!parsed._jsmap) {
    const lines = parsed.script.split('\n');
    const marks = [];
    lines.forEach((l, i) => {
      const m = /^\/\* =+ (?:module: \w+ \(([^)]+)\)|app: (\S+)|(kit\/core\.js)|(data\/sample\.js)|engine)|^\/\* ---- (\S+\.js) \*\//.exec(l);
      if (m) marks.push({ at: i + 1, file: m[1] || m[2] || m[3] || m[4] || m[5] || 'engine/rdcore.js' });
    });
    parsed._jsmap = marks;
  }
  return String(stack).replace(/<anonymous>:(\d+):(\d+)/g, (m, ln, col) => {
    const L = Number(ln) - 2;
    let best = null;
    for (const mk of parsed._jsmap) if (mk.at <= L) best = mk;
    return best ? best.file + ':' + (L - best.at) + ':' + col : m;
  });
}

/* ---- the runtime's expression rules (ported from dc-runtime) ---- */
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const NUM = /^-?\d+(\.\d+)?$/;
function wrapped(e) { let n = 0; for (let i = 0; i < e.length - 1; i++) { if (e[i] === '(') n++; else if (e[i] === ')' && (n--, n === 0)) return false; } return true; }
function findOp(t) {
  let n = 0;
  for (let e = 0; e < t.length; e++) {
    const r = t[e];
    if (r === '[' || r === '(') n++;
    else if (r === ']' || r === ')') n--;
    else if (n === 0 && (r === '=' || r === '!') && t[e + 1] === '=') {
      if ((e > 0 && (t[e - 1] === '=' || t[e - 1] === '!')) || !t.slice(0, e).trim()) continue;
      const o = t[e + 2] === '=' ? r + '==' : r + '=';
      return { index: e, op: o };
    }
  }
  return null;
}
function lookupPath(scope, n) {
  const m = n.match(IDENT);
  if (!m) return undefined;
  let r = scope == null ? undefined : scope[m[0]];
  let o = m[0].length;
  while (o < n.length) {
    if (n[o] === '.') {
      const s = n.slice(o + 1).match(IDENT) || n.slice(o + 1).match(/^\d+/);
      if (!s) return undefined;
      r = r == null ? undefined : r[s[0]];
      o += 1 + s[0].length;
    } else if (n[o] === '[') {
      let s = 1, i = o + 1;
      while (i < n.length && s > 0) { if (n[i] === '[') s++; else if (n[i] === ']' && (s--, s === 0)) break; i++; }
      if (s !== 0) return undefined;
      const k = evalExpr(scope, n.slice(o + 1, i));
      r = r == null ? undefined : r[k];
      o = i + 1;
    } else return undefined;
  }
  return r;
}
function evalExpr(scope, src) {
  const e = String(src).trim();
  if (!e) return undefined;
  if (e[0] === '(' && e[e.length - 1] === ')' && wrapped(e)) return evalExpr(scope, e.slice(1, -1));
  const op = findOp(e);
  if (op) {
    const a = evalExpr(scope, e.slice(0, op.index)), b = evalExpr(scope, e.slice(op.index + op.op.length));
    switch (op.op) { case '===': return a === b; case '!==': return a !== b; case '==': return a == b; default: return a != b; }
  }
  if (e[0] === '!') return !evalExpr(scope, e.slice(1));
  if (e === 'true') return true;
  if (e === 'false') return false;
  if (e === 'null') return null;
  if (e === 'undefined') return undefined;
  if (NUM.test(e)) return Number(e);
  if (e.length >= 2 && (e[0] === '"' || e[0] === "'") && e[e.length - 1] === e[0]) return e.slice(1, -1);
  return lookupPath(scope, e);
}
const HOLE = /\{\{([\s\S]+?)\}\}/g;
function attrValue(scope, raw) {
  const whole = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/);
  if (whole) return { v: evalExpr(scope, whole[1]), whole: true, holes: [whole[1].trim()] };
  if (!raw.includes('{{')) return { v: raw, whole: false, holes: [] };
  const holes = [];
  const v = raw.split(/\{\{([\s\S]+?)\}\}/g).map((s, i) => { if (!(i & 1)) return s; holes.push(s.trim()); const x = evalExpr(scope, s); return x == null ? '' : x; }).join('');
  return { v, whole: false, holes };
}
const EVENT = { onclick: 'onClick', onchange: 'onChange', oninput: 'onInput', onsubmit: 'onSubmit', onkeydown: 'onKeyDown', onkeyup: 'onKeyUp', onblur: 'onBlur', onfocus: 'onFocus', ondoubleclick: 'onDoubleClick', ondblclick: 'onDoubleClick', onmousedown: 'onMouseDown', onmouseup: 'onMouseUp', onmouseenter: 'onMouseEnter', onmouseleave: 'onMouseLeave', onpointerdown: 'onPointerDown', onpointermove: 'onPointerMove', onpointerup: 'onPointerUp', onpointercancel: 'onPointerCancel', onpointerenter: 'onPointerEnter', onpointerleave: 'onPointerLeave', ondragstart: 'onDragStart', ondragend: 'onDragEnd', ondragover: 'onDragOver', ondragenter: 'onDragEnter', ondragleave: 'onDragLeave', ondrop: 'onDrop', oncontextmenu: 'onContextMenu', onwheel: 'onWheel', onscroll: 'onScroll' };

/* ---- walk the template with a scope; returns the rendered element tree ---- */
function walk(node, scope, ctx, parent) {
  if (node.tag === '#text') {
    let out = '';
    let last = 0;
    HOLE.lastIndex = 0;
    let m;
    while ((m = HOLE.exec(node.text))) {
      out += node.text.slice(last, m.index);
      last = m.index + m[0].length;
      const v = evalExpr(scope, m[1]);
      if (v === undefined) ctx.unresolved.add('{{' + m[1].trim() + '}} line ' + node.line);
      else if (typeof v === 'function') ctx.errs.add('function in text {{' + m[1].trim() + '}} line ' + node.line);
      else if (v !== null && typeof v === 'object') ctx.errs.add('object in text {{' + m[1].trim() + '}} line ' + node.line);
      else if (typeof v === 'number' && !isFinite(v)) ctx.errs.add('non-finite number in text {{' + m[1].trim() + '}} line ' + node.line);
      else if (typeof v === 'string' && /\bundefined\b|\bNaN\b|\[object |\bnull\b|Infinity/.test(v)) ctx.errs.add('suspicious text "' + v.slice(0, 80) + '" from {{' + m[1].trim() + '}} line ' + node.line);
      if (v != null && typeof v !== 'boolean' && typeof v !== 'object' && typeof v !== 'function') out += String(v);
    }
    out += node.text.slice(last);
    if (parent) parent.textParts.push(out);
    return;
  }
  const a = node.attrs || {};
  if (node.tag === 'sc-for') {
    const r = attrValue(scope, a.list || '');
    if (!Array.isArray(r.v)) { if (r.v !== undefined && r.v !== null) ctx.errs.add('sc-for list not an array: ' + a.list + ' line ' + node.line); else ctx.unresolved.add('sc-for ' + a.list + ' line ' + node.line); return; }
    r.v.forEach((item, i) => {
      if (item === undefined || item === null) ctx.errs.add('sc-for item is ' + item + ': ' + a.list + '[' + i + '] line ' + node.line);
      const s2 = Object.assign({}, scope, { [a.as || 'item']: item, $index: i });
      node.kids.forEach((k) => walk(k, s2, ctx, parent));
    });
    return;
  }
  if (node.tag === 'sc-if') {
    const r = attrValue(scope, a.value || '');
    if (r.v === undefined) ctx.unresolved.add('sc-if ' + a.value + ' line ' + node.line);
    if (r.v) node.kids.forEach((k) => walk(k, scope, ctx, parent));
    return;
  }
  const el = { tag: node.tag, line: node.line, attrs: {}, on: {}, kids: [], textParts: [], parent, scope };
  for (const k of Object.keys(a)) {
    const raw = a[k];
    if (k.startsWith('on')) {
      const r = attrValue(scope, raw);
      const name = EVENT[k] || k;
      if (typeof r.v === 'function') el.on[name] = r.v;
      else if (r.v !== undefined && r.v !== null) ctx.errs.add('handler ' + k + ' is not a function, line ' + node.line);
      else ctx.deadHandlers.add(k + ' ' + raw.trim() + ' line ' + node.line);
      continue;
    }
    const r = attrValue(scope, raw);
    if (r.whole && r.v === undefined && !/^(aria-|disabled|checked|selected|hidden|readonly|required|open|title|class|style|href|draggable|tabindex|autofocus|min|max|step|placeholder|label|value|id|for|role|type|name|width|height|x|y|cx|cy|r|d|points|x1|x2|y1|y2|fill|stroke|transform|data-)/.test(k)) ctx.unresolved.add(k + '=' + raw + ' line ' + node.line);
    if (typeof r.v === 'string' && /\bundefined\b|\bNaN\b|\[object /.test(r.v)) ctx.errs.add('suspicious attribute ' + k + '="' + r.v.slice(0, 80) + '" line ' + node.line);
    if (typeof r.v === 'number' && !isFinite(r.v)) ctx.errs.add('non-finite attribute ' + k + ' line ' + node.line);
    if (k === 'style' && r.v != null && typeof r.v !== 'string' && typeof r.v !== 'object') ctx.errs.add('style is not a string, line ' + node.line);
    if (k === 'value' && r.v != null && typeof r.v === 'object') ctx.errs.add('object as value, line ' + node.line);
    el.attrs[k] = r.v;
  }
  if (parent) { parent.kids.push(el); parent.textParts.push(el); }
  ctx.all.push(el);
  (node.kids || []).forEach((k) => walk(k, scope, ctx, el));
}

function textOf(el) {
  if (el._text != null) return el._text;
  let s = '';
  for (const p of el.textParts) s += typeof p === 'string' ? p : ' ' + textOf(p) + ' ';
  el._text = s.replace(/\s+/g, ' ').trim();
  return el._text;
}
function labelOf(el) {
  const own = [el.attrs['aria-label'], el.attrs.title, el.attrs.placeholder].filter((x) => x != null && x !== '');
  let p = el.parent;
  while (p) {
    if (p.tag === 'label') { own.push(textOf(p)); break; }
    p = p.parent;
  }
  return own;
}
function matches(el, q) {
  if (typeof q === 'function') return !!q(el);
  const cands = [textOf(el)].concat(labelOf(el)).filter((x) => typeof x === 'string');
  if (q instanceof RegExp) return cands.some((c) => q.test(c));
  if (typeof q === 'string' && q[0] === '~') return cands.some((c) => c.includes(q.slice(1)));
  return cands.some((c) => c.trim() === q);
}
function withinOk(el, w) {
  if (!w) return true;
  let p = el.parent;
  while (p) {
    const keys = [p.attrs['aria-label'], p.attrs.title, p.attrs['data-k'], p.attrs.id].filter((x) => typeof x === 'string');
    if (keys.some((k) => (w[0] === '~' ? k.includes(w.slice(1)) : k === w))) return true;
    p = p.parent;
  }
  return false;
}

let PASS = 0, FAIL = 0;
class Sim {
  constructor(file, props) {
    const { Component, parsed, ns } = load(file);
    this.file = file;
    this.parsed = parsed;
    this.ns = ns || {};
    TIMERS = [];
    NOW = Date.UTC(2026, 9, 13, 16, 0, 0);
    this.c = new Component(props || {});
    this.render();
  }
  render() {
    const vals = this.c.renderVals();
    const ctx = { all: [], errs: new Set(), unresolved: new Set(), deadHandlers: new Set() };
    const root = { tag: '#root', attrs: {}, on: {}, kids: [], textParts: [], parent: null };
    this.parsed.tree.kids.forEach((k) => walk(k, vals, ctx, root));
    this.vals = vals;
    this.root = root;
    this.els = ctx.all;
    this.ctx = ctx;
    this.vmErrors = (this.c._vmErrors || []).slice();
    return this;
  }
  get text() { return textOf(this.root); }
  flush(ms) {
    const until = NOW + (ms == null ? 60000 : ms);
    for (let guard = 0; guard < 200; guard++) {
      TIMERS.sort((a, b) => a.at - b.at);
      const t = TIMERS[0];
      if (!t || t.at > until) break;
      TIMERS.shift();
      if (t.at > NOW) NOW = t.at;
      t.fn();
    }
    return this.render();
  }
  advance(ms) { NOW += ms; return this.flush(0); }
  all(q, opts) {
    opts = opts || {};
    return this.els.filter((el) => (!opts.tag || el.tag === opts.tag) && withinOk(el, opts.within) && matches(el, q));
  }
  find(q, opts) {
    opts = opts || {};
    const want = opts.handler;
    let list = this.all(q, opts);
    if (want) list = list.filter((el) => el.on[want]);
    const el = list[opts.nth || 0];
    if (!el) {
      const near = this.els.filter((e) => Object.keys(e.on).length).map((e) => textOf(e) || labelOf(e)[0] || e.tag).filter(Boolean).slice(0, 60);
      throw new Error('not found: ' + String(q) + (opts.within ? ' within ' + opts.within : '') + (want ? ' with ' + want : '') + '\n   clickable now: ' + JSON.stringify(near));
    }
    return el;
  }
  has(q, opts) { return this.all(q, opts).length > 0; }
  ev(el, extra) {
    const s = this;
    const data = s._dt || (s._dt = {});
    return Object.assign({
      preventDefault() {}, stopPropagation() {}, persist() {},
      key: '', button: 0, pointerId: 1, clientX: 0, clientY: 0, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false,
      target: { value: el.attrs.value != null ? el.attrs.value : '', checked: !!el.attrs.checked, dataset: {}, closest: () => null },
      currentTarget: {
        value: el.attrs.value, dataset: {},
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 30, width: 1000, height: 30, x: 0, y: 0 }),
        setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true, focus() {}, blur() {}, scrollIntoView() {}
      },
      dataTransfer: { setData(k, v) { data[k] = v; }, getData(k) { return data[k] || ''; }, effectAllowed: 'move', dropEffect: 'move', setDragImage() {} }
    }, extra || {});
  }
  fire(el, name, extra) {
    const fn = el.on[name];
    if (!fn) throw new Error('element has no ' + name + ': ' + (textOf(el) || labelOf(el)[0] || el.tag) + ' line ' + el.line);
    try { fn(this.ev(el, extra)); } catch (e) { e.message = e.message + ' [in ' + name + ' of "' + (textOf(el) || labelOf(el)[0] || el.tag).slice(0, 40) + '" ' + where(this.parsed, 'line ' + el.line) + ']'; e.stack = jsWhere(this.parsed, e.stack); throw e; }
    return this.flush(0);
  }
  click(q, opts) { const el = this.find(q, Object.assign({ handler: 'onClick' }, opts)); return this.fire(el, 'onClick', opts && opts.event); }
  type(q, value, opts) {
    const list = this.all(q, opts).filter((e) => e.on.onChange || e.on.onInput);
    const el = list[(opts && opts.nth) || 0];
    if (!el) throw new Error('no input for ' + String(q));
    const ev = this.ev(el, { target: { value: String(value), checked: false, dataset: {} } });
    (el.on.onChange || el.on.onInput)(ev);
    return this.flush(0);
  }
  check(q, on, opts) {
    const list = this.all(q, opts).filter((e) => e.on.onChange || e.on.onClick);
    const el = list[(opts && opts.nth) || 0];
    if (!el) throw new Error('no checkbox for ' + String(q));
    const ev = this.ev(el, { target: { value: el.attrs.value, checked: on !== false, dataset: {} } });
    (el.on.onChange || el.on.onClick)(ev);
    return this.flush(0);
  }
  key(q, key, opts) { const el = this.find(q, Object.assign({ handler: 'onKeyDown' }, opts)); return this.fire(el, 'onKeyDown', { key }); }
  submit(q, opts) { const el = this.find(q, Object.assign({ handler: 'onSubmit' }, opts)); return this.fire(el, 'onSubmit'); }
  drag(fromQ, toQ, opts) {
    opts = opts || {};
    const from = this.find(fromQ, Object.assign({ handler: 'onDragStart' }, opts.from));
    this._dt = {};
    this.fire(from, 'onDragStart');
    const to = this.find(toQ, Object.assign({ handler: 'onDrop' }, opts.to));
    if (to.on.onDragEnter) this.fire(to, 'onDragEnter');
    if (to.on.onDragOver) this.fire(to, 'onDragOver');
    const to2 = this.find(toQ, Object.assign({ handler: 'onDrop' }, opts.to));
    this.fire(to2, 'onDrop');
    const from2 = this.all(fromQ, opts.from).find((e) => e.on.onDragEnd);
    if (from2) this.fire(from2, 'onDragEnd');
    return this;
  }
  see(text) { return this.text.includes(text); }
  /* ---- assertions ---- */
  expect(text, label) { this.ok(this.see(text), (label || 'visible') + ': ' + text); return this; }
  expectNot(text, label) { this.ok(!this.see(text), (label || 'not visible') + ': ' + text); return this; }
  eq(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) PASS++; else { FAIL++; console.log('FAIL', label, '\n   got ', JSON.stringify(got), '\n   want', JSON.stringify(want)); }
    return this;
  }
  ok(cond, label) { if (cond) PASS++; else { FAIL++; console.log('FAIL', label); } return this; }
  clean(label) {
    const errs = [...this.ctx.errs].concat(this.vmErrors.map((e) => 'view error: ' + e));
    if (errs.length) { FAIL++; console.log('FAIL clean ' + (label || ''), '\n   ' + errs.slice(0, 12).map((e) => where(this.parsed, e)).join('\n   ')); } else PASS++;
    return this;
  }
  step(label, fn) {
    try { fn(this); } catch (e) { FAIL++; console.log('FAIL step "' + label + '": ' + jsWhere(this.parsed, where(this.parsed, (e.stack || e).toString())).split('\n').slice(0, 7).join('\n     ')); }
    return this;
  }
}
function done() { console.log(PASS + ' passed, ' + FAIL + ' failed'); if (FAIL) process.exitCode = 1; }
module.exports = { Sim, load, done, textOf, labelOf, evalExpr, where, jsWhere, PY };
