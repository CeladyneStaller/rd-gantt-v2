/* ============================================================================
   Calm standalone runtime
   Runs one calm board (its template and its `class Component extends DCLogic`) with React 18 outside the
   design canvas, following the canvas's rules so a board behaves the same in both places:
     - holes {{a.b}}, {{!x}}, {{a === 'b'}}, {{a[b.c]}}; an attribute that is one whole hole keeps its type
     - <sc-for list as> and <sc-if value>; camelCase attributes (onClick, viewBox, autoFocus) survive parsing
     - tables and selects are parsed as plain elements, so loops inside them are kept
     - interpolated text sits in <span class="sc-interp">, as in the canvas; inside SVG, where a span draws
       nothing, it is plain text (October 22: the logic tree's Waterfall had lost every label to this)
     - DCLogic.setState changes state at once, then re-renders
   Browser storage is the board's own: every key it reads or writes is prefixed, so a prototype on the same
   site as the live apps can never change their settings. The Hub's sign-in (hub_session_v1) is the one key
   read through, and it is never written.
   ========================================================================== */
(function () {
  'use strict';
  var React = window.React, ReactDOM = window.ReactDOM;
  if (!React || !ReactDOM) throw new Error('calm runtime: React did not load');
  var h = React.createElement, Fragment = React.Fragment;

  /* ------------------------------------------------------------ expressions */
  var IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*/;
  var NUM = /^-?\d+(\.\d+)?$/;
  var HOLES = /\{\{([\s\S]+?)\}\}/;
  var WHOLE = /^\s*\{\{([\s\S]+?)\}\}\s*$/;

  /* "(a)" is wrapped; "(a) === (b)" is not */
  function wrapped(e) {
    var n = 0;
    for (var i = 0; i < e.length - 1; i++) {
      if (e[i] === '(') n++;
      else if (e[i] === ')' && --n === 0) return false;
    }
    return true;
  }
  /* the first top-level ===, !==, == or != */
  function findOp(t) {
    var n = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (c === '[' || c === '(') n++;
      else if (c === ']' || c === ')') n--;
      else if (n === 0 && (c === '=' || c === '!') && t[i + 1] === '=') {
        if ((i > 0 && (t[i - 1] === '=' || t[i - 1] === '!')) || !t.slice(0, i).trim()) continue;
        return { index: i, op: t[i + 2] === '=' ? c + '==' : c + '=' };
      }
    }
    return null;
  }
  /* a.b.0.c and a[expr] against the scope; anything missing is undefined, never an error */
  function lookup(scope, src) {
    var m = src.match(IDENT);
    if (!m) return undefined;
    var v = scope == null ? undefined : scope[m[0]];
    var i = m[0].length;
    while (i < src.length) {
      if (src[i] === '.') {
        var rest = src.slice(i + 1);
        var k = rest.match(IDENT) || rest.match(/^\d+/);
        if (!k) return undefined;
        v = v == null ? undefined : v[k[0]];
        i += 1 + k[0].length;
      } else if (src[i] === '[') {
        var depth = 1, j = i + 1;
        while (j < src.length && depth > 0) {
          if (src[j] === '[') depth++;
          else if (src[j] === ']' && --depth === 0) break;
          j++;
        }
        if (depth !== 0) return undefined;
        var key = evalExpr(scope, src.slice(i + 1, j));
        v = v == null ? undefined : v[key];
        i = j + 1;
      } else return undefined;
    }
    return v;
  }
  function evalExpr(scope, src) {
    var e = String(src).trim();
    if (!e) return undefined;
    if (e[0] === '(' && e[e.length - 1] === ')' && wrapped(e)) return evalExpr(scope, e.slice(1, -1));
    var op = findOp(e);
    if (op) {
      var a = evalExpr(scope, e.slice(0, op.index)), b = evalExpr(scope, e.slice(op.index + op.op.length));
      switch (op.op) {
        case '===': return a === b;
        case '!==': return a !== b;
        case '==': return a == b; // eslint-disable-line eqeqeq
        default: return a != b; // eslint-disable-line eqeqeq
      }
    }
    if (e[0] === '!') return !evalExpr(scope, e.slice(1));
    if (e === 'true') return true;
    if (e === 'false') return false;
    if (e === 'null') return null;
    if (e === 'undefined') return undefined;
    if (NUM.test(e)) return Number(e);
    if (e.length >= 2 && (e[0] === '"' || e[0] === "'") && e[e.length - 1] === e[0]) return e.slice(1, -1);
    return lookup(scope, e);
  }
  /* an attribute or text value: one whole hole keeps its type; mixed text joins as a string */
  function getter(raw) {
    var whole = WHOLE.exec(raw);
    if (whole) { var ex = whole[1]; return function (s) { return evalExpr(s, ex); }; }
    if (raw.indexOf('{{') >= 0) {
      var parts = raw.split(HOLES);
      return function (s) {
        var out = '';
        for (var i = 0; i < parts.length; i++) {
          if (i & 1) { var v = evalExpr(s, parts[i]); out += v == null ? '' : v; } else out += parts[i];
        }
        return out;
      };
    }
    return function () { return raw; };
  }

  var warned = {};
  function warnOnce(text) { if (warned[text]) return; warned[text] = 1; if (window.console) console.warn('[calm] ' + text); }

  /* ------------------------------------------------------------ parsing */
  var CAMEL = 'sc-camel-';
  var RAW = 'sc-raw-';
  /* comments, raw-text elements (their content is left alone) and start tags.
     (The comment opener is spelled in two pieces: this file is inlined in a page's script tag.) */
  var ATTRS = '(?:=\\s*"[^"]*"|=\\s*\'[^\']*\'|=(?!\\s*["\'])|[^>=])*';
  var OPEN = '<' + '!';
  var TAGS = new RegExp('(' + OPEN + '---?>|' + OPEN + '--[\\s\\S]*?--!?>)|(<(script|style|textarea|title)(?=[\\s/>])' + ATTRS + '>)([\\s\\S]*?<\\/\\3(?=[\\s/>])[^>]*>)|<[a-zA-Z][^\\s/>]*(?=[\\s/>])' + ATTRS + '>', 'gi');
  /* the HTML parser lower-cases attribute names, so onClick="…" travels as sc-camel-on-click="…" */
  function encodeCamel(tag) {
    return tag.replace(/=\s*"[^"]*"|=\s*'[^']*'|(\s)([a-z]+[A-Z][A-Za-z0-9]*)(?=\s*=)/g, function (m, sp, name) {
      return name === undefined ? m : sp + CAMEL + name.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); });
    });
  }
  function prep(src) {
    src = src.replace(TAGS, function (m, comment, rawOpen, rawName, rawRest) {
      if (comment !== undefined) return m;
      if (rawOpen !== undefined) return encodeCamel(rawOpen) + rawRest;
      return encodeCamel(m);
    });
    /* table parts and selects would be re-ordered or emptied by the parser; parse them as plain elements */
    return src.replace(/(<\/?)(select|table|tbody|thead|tfoot|tr|td|th|caption)(?=[\s>])/gi, function (m, open, name) {
      return open + RAW + name.toLowerCase();
    });
  }
  function camelize(s) { return s.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); }); }
  function parseStyle(s) {
    var o = {};
    s.split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i < 0) return;
      var k = decl.slice(0, i).trim();
      if (!k) return;
      o[k.slice(0, 2) === '--' ? k : camelize(k)] = decl.slice(i + 1).trim();
    });
    return o;
  }

  var EVENTS = {
    onclick: 'onClick', onchange: 'onChange', oninput: 'onInput', onsubmit: 'onSubmit', onkeydown: 'onKeyDown', onkeyup: 'onKeyUp',
    onkeypress: 'onKeyPress', onmousedown: 'onMouseDown', onmouseup: 'onMouseUp', onmouseenter: 'onMouseEnter', onmouseleave: 'onMouseLeave',
    onfocus: 'onFocus', onblur: 'onBlur', ondoubleclick: 'onDoubleClick', ondblclick: 'onDoubleClick', oncontextmenu: 'onContextMenu',
    onmousemove: 'onMouseMove', onmouseover: 'onMouseOver', onmouseout: 'onMouseOut', onpointerdown: 'onPointerDown', onpointerup: 'onPointerUp',
    onpointermove: 'onPointerMove', onpointerenter: 'onPointerEnter', onpointerleave: 'onPointerLeave', onpointercancel: 'onPointerCancel',
    onpointerover: 'onPointerOver', onpointerout: 'onPointerOut', ongotpointercapture: 'onGotPointerCapture', onlostpointercapture: 'onLostPointerCapture',
    ontouchstart: 'onTouchStart', ontouchend: 'onTouchEnd', ontouchmove: 'onTouchMove', ontouchcancel: 'onTouchCancel', ondragstart: 'onDragStart',
    ondragend: 'onDragEnd', ondragenter: 'onDragEnter', ondragleave: 'onDragLeave', ondragover: 'onDragOver', ondrop: 'onDrop', onwheel: 'onWheel',
    onscroll: 'onScroll', onanimationstart: 'onAnimationStart', onanimationend: 'onAnimationEnd', onanimationiteration: 'onAnimationIteration',
    ontransitionend: 'onTransitionEnd'
  };
  /* written with an empty value, these mean true */
  var BOOL = {};
  ('allowFullScreen async autoFocus autoPlay checked controls default defer disabled formNoValidate hidden loop multiple muted ' +
    'noValidate open playsInline readOnly required reversed selected').split(' ').forEach(function (k) { BOOL[k] = 1; });
  function yes() { return true; }

  /* ------------------------------------------------------------ compiling */
  function compile(src) {
    var t = document.createElement('template');
    t.innerHTML = prep(src);
    var kids = compileKids(t.content);
    return function (scope) { return kids.map(function (k, i) { return k(scope, i); }); };
  }
  function compileKids(node) {
    var out = [];
    for (var c = node.firstChild; c; c = c.nextSibling) {
      var f = compileNode(c);
      if (f) out.push(f);
    }
    return out;
  }
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function compileNode(n) {
    if (n.nodeType === 3) return compileText(n.nodeValue || '', !!n.parentNode && n.parentNode.namespaceURI === SVG_NS);
    if (n.nodeType !== 1) return null;
    if (n.localName === 'sc-for') return compileFor(n);
    if (n.localName === 'sc-if') return compileIf(n);
    return compileEl(n);
  }
  function compileText(v, inSvg) {
    if (v.indexOf('{{') < 0) {
      if (!v.trim() && v.indexOf(' ') < 0) return null;   // line breaks between tags; spaces are kept
      return function () { return v; };
    }
    var parts = v.split(HOLES);
    return function (scope, key) {
      var kids = [Fragment, { key: key }];
      for (var i = 0; i < parts.length; i++) {
        if (!(i & 1)) { kids.push(parts[i]); continue; }
        var x = evalExpr(scope, parts[i]);
        if (x === undefined) { warnOnce('{{ ' + parts[i].trim() + ' }} never resolved; rendered as empty'); kids.push(null); }
        else if (x === null || typeof x === 'boolean') kids.push(null);
        else if (React.isValidElement(x) || Array.isArray(x)) kids.push(h(Fragment, { key: i }, x));
        else kids.push(inSvg ? String(x) : h('span', { key: i, className: 'sc-interp' }, String(x)));
      }
      return h.apply(null, kids);
    };
  }
  function compileFor(n) {
    var src = n.getAttribute('list') || '';
    var list = getter(src), as = n.getAttribute('as') || 'item';
    var kids = compileKids(n);
    return function (scope, key) {
      var arr = list(scope);
      if (!Array.isArray(arr)) {
        if (arr != null) warnOnce('sc-for list="' + src + '" is not an array');
        arr = [];
      }
      return h(Fragment, { key: key }, arr.map(function (item, i) {
        var s2 = Object.assign({}, scope);
        s2[as] = item;
        s2.$index = i;
        return h(Fragment, { key: i }, kids.map(function (k, j) { return k(s2, j); }));
      }));
    };
  }
  function compileIf(n) {
    var val = getter(n.getAttribute('value') || '');
    var kids = compileKids(n);
    return function (scope, key) {
      return val(scope) ? h(Fragment, { key: key }, kids.map(function (k, j) { return k(scope, j); })) : null;
    };
  }
  function compileEl(n) {
    var tag = n.localName;
    var real = tag.indexOf(RAW) === 0 ? tag.slice(RAW.length) : tag;
    var props = [], defaultChecked = false;
    for (var i = 0; i < n.attributes.length; i++) {
      var name = n.attributes[i].name, value = n.attributes[i].value;
      if (name.indexOf(CAMEL) === 0) name = camelize(name.slice(CAMEL.length));
      if (name === 'class') name = 'className';
      else if (name === 'for') name = 'htmlFor';
      else if (name.slice(0, 2) === 'on') name = EVENTS[name] || 'on' + name.charAt(2).toUpperCase() + name.slice(3);
      else if (name === 'checked' && real === 'input' && value.indexOf('{{') < 0) { defaultChecked = true; continue; }
      else if (value === '' && BOOL[name]) { props.push([name, yes]); continue; }
      props.push([name, getter(value)]);
    }
    var kids = compileKids(n);
    var isOption = real === 'option';
    return function (scope, key) {
      var p = { key: key };
      for (var i = 0; i < props.length; i++) {
        var name = props[i][0], v = props[i][1](scope);
        if (name === 'style' && typeof v === 'string') v = parseStyle(v);
        if ((name === 'value' || name === 'checked') && v === undefined) v = name === 'checked' ? false : '';
        p[name] = v;
      }
      if (defaultChecked) p.defaultChecked = true;
      var args = [real, p];
      for (var j = 0; j < kids.length; j++) args.push(kids[j](scope, j));
      /* <option label="…"> with no text: show the label as its text too (every browser then shows it) */
      if (isOption && args.length === 2 && p.label != null && p.label !== '') args.push(String(p.label));
      return h.apply(null, args);
    };
  }

  /* ------------------------------------------------------------ logic and host */
  function msg(e) { return e && e.message ? e.message : String(e); }
  function safe(fn) { try { fn(); } catch (e) { console.error(e); } }

  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; this.__host = null; }
    setState(u, cb) {
      if (this.__host) { this.__host.__setLogicState(u, cb); return; }
      var patch = typeof u === 'function' ? u(this.state) : u;
      this.state = Object.assign({}, this.state, patch);
      if (cb) cb();
    }
    forceUpdate() { if (this.__host) this.__host.forceUpdate(); }
    componentDidMount() {}
    componentDidUpdate() {}
    componentWillUnmount() {}
    renderVals() { return {}; }
  }

  class Host extends React.Component {
    constructor(props) {
      super(props);
      this.state = { v: 0, err: null };
      this.ctorErr = null;
      try { this.logic = new props.Logic({}); } catch (e) {
        console.error(e);
        this.ctorErr = props.name + ': ' + msg(e);
        this.logic = new DCLogic({});
      }
      this.logic.__host = this;
    }
    /* state changes at once (the board reads it back straight away), then the page re-renders */
    __setLogicState(u, cb) {
      var prev = this.logic.state || {};
      var patch = typeof u === 'function' ? u(prev) : u;
      this.logic.state = Object.assign({}, prev, patch);
      this.setState(function (s) { return { v: s.v + 1, err: null }; }, cb);
    }
    static getDerivedStateFromError(e) { return { err: msg(e) }; }
    componentDidCatch(e, info) { console.error('[calm] render error', e, info && info.componentStack); }
    componentDidMount() { var L = this.logic; safe(function () { L.componentDidMount(); }); }
    componentDidUpdate(prev) { var L = this.logic; safe(function () { L.componentDidUpdate(prev); }); }
    componentWillUnmount() { var L = this.logic; safe(function () { L.componentWillUnmount(); }); }
    render() {
      var err = this.state.err ? 'Something went wrong on this page (' + this.state.err + '). Reload to start again.' : this.ctorErr;
      return h('div', { className: 'sc-host' + (err ? ' sc-has-error' : ''), 'data-sc-name': this.props.name },
        err ? h('div', { className: 'sc-logic-error', role: 'alert' }, err) : null,
        this.state.err ? null : h(Body, { logic: this.logic, tpl: this.props.tpl, name: this.props.name, v: this.state.v }));
    }
  }
  /* the board itself, rendered inside Host so a failure while drawing it is caught instead of blanking the page */
  function Body(p) {
    var vals;
    try { vals = Object.assign({}, p.logic.renderVals() || {}); } catch (e) {
      console.error(e);
      return h('div', { className: 'sc-logic-error', role: 'alert' }, p.name + '.renderVals(): ' + msg(e));
    }
    return p.tpl(vals);
  }

  /* ------------------------------------------------------------ the board's own storage */
  function prefixed(store, prefix, readThrough) {
    function ownKeys() {
      var out = [];
      for (var i = 0; i < store.length; i++) {
        var k = store.key(i);
        if (k && k.indexOf(prefix) === 0) out.push(k.slice(prefix.length));
      }
      return out;
    }
    return {
      getItem: function (k) { k = String(k); return store.getItem(readThrough[k] ? k : prefix + k); },
      setItem: function (k, v) { k = String(k); if (!readThrough[k]) store.setItem(prefix + k, String(v)); },
      removeItem: function (k) { k = String(k); if (!readThrough[k]) store.removeItem(prefix + k); },
      key: function (i) { var ks = ownKeys(); return i >= 0 && i < ks.length ? ks[i] : null; },
      clear: function () { ownKeys().forEach(function (k) { store.removeItem(prefix + k); }); },
      get length() { return ownKeys().length; }
    };
  }
  /* the `window` the board's code sees: the real one, except for storage */
  function boardWindow(prefix) {
    var views = {};
    var bound = new Map();
    function storage(name) {
      var real = window[name];   // throws where storage is blocked; the board's own try/catch handles that, as before
      if (!real) return real;
      if (!views[name] || views[name].real !== real) {
        views[name] = { real: real, view: prefixed(real, prefix, name === 'localStorage' ? { hub_session_v1: 1 } : {}) };
      }
      return views[name].view;
    }
    return new Proxy(window, {
      get: function (t, k) {
        if (k === 'localStorage' || k === 'sessionStorage') return storage(k);
        var v = Reflect.get(t, k);
        if (typeof v !== 'function') return v;
        var b = bound.get(v);
        if (!b) { b = v.bind(t); bound.set(v, b); }
        return b;
      }
    });
  }

  /* ------------------------------------------------------------ boot */
  function fatal(root, text) {
    root.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'calm-boot-error';
    box.setAttribute('role', 'alert');
    box.textContent = text;
    root.appendChild(box);
  }
  function boot(o) {
    var root = document.getElementById('dc-root');
    var tpl, Logic;
    try {
      tpl = compile(o.template);
      /* a prototype keeps its own storage (prefixed keys); the live apps share the suite's keys */
      Logic = o.logic(DCLogic, DCLogic, React, o.storagePrefix ? boardWindow(o.storagePrefix) : window);
    } catch (e) {
      console.error(e);
      fatal(root, 'This page could not start: ' + msg(e));
      return;
    }
    if (typeof Logic !== 'function') { fatal(root, 'This page could not start: it has no Component class.'); return; }
    root.innerHTML = '';
    ReactDOM.createRoot(root).render(h(Host, { Logic: Logic, tpl: tpl, name: o.name }));
  }

  window.CalmRuntime = { boot: boot, evalExpr: evalExpr, prep: prep, compile: compile, DCLogic: DCLogic, prefixed: prefixed };
})();
