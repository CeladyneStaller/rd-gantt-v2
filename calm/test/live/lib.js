/* ============================================================================
   lib.js: helpers for browser tests against the REAL broker, run locally by broker_up.py on top of
   fakebin (an in-memory JSONBin). Nothing here touches the network: the broker cannot (fakebin refuses
   every non-loopback host) and pages opened with open() have every non-loopback request blocked.

     const live = require('./lib');
     const broker = await live.startBroker({ seed: 'sample' });         // spawns broker_up.py
     const site = await live.serve({ root: '/path/to/built/pages' });  // rewrites the Railway URL to broker.url
     const browser = await live.chromium.launch();
     const r = await live.open(browser, site.url('execution_app.html'),
                               { hubSession: { email: 'corey@celadyne.com', orgRole: 'cto' } });
     await r.page.waitForSelector('text=Loaded');
     await broker.saveAs('portfolio', (doc) => { doc.objectives[0].statement = 'Edited elsewhere'; });
     await broker.fail('EXEC-DIV-FC', { mode: 500, ops: 'write' });   ...   await broker.recover();
     await broker.reset();                                              // back to the seed, cold caches
     await r.close(); await browser.close(); await site.close(); await broker.stop();

   startBroker(opts) -> Broker        opts: seed ('sample' | 'mapped' | dir), port, adminPort, token, origins,
                                       env {NAME: value | null (unset)}, brokerDir, verbose, python, timeoutMs
   Broker: url, adminUrl, fakebinUrl, token, client, seed
     api(path, {method, body, headers, token, ifMatch, timeout}) -> {status, ok, headers, body, text}
     get(id) / version(id)            GET /state/<id>[/version] (throws unless 200; get(id) gives null on 404)
     put(id, doc, {ifMatch, client, extra})   PUT /state/<id> {doc, client:'calm-1'} -> the raw response
     saveAs(id, docOrFn, {ifMatch, allowFail})  another editor saves through the broker's PUT path
     readDoc(name) -> {name, binId, version, updatedAt, doc, record}   the raw stored bin (no broker cache)
     writeRaw(name, record, {create})   overwrite a bin out of band (a broker that already read that /state
                                        doc or prefs keeps serving its cached copy until restart())
     editViaAdmin(name, doc, {ifMatch}) the admin route that does the same as saveAs, server side
     fail(name, {mode, status, ops, times, delay, after, hang}) / recover([name])
     reset({seed, reload}) / restart()  reseed bins (+ re-import the broker); restart = cold caches only
     jsonbinLog({since, name}) / clearLog() / config() / stderr() / stop()
   api(path, opts), get, version, put, saveAs, readDoc, writeRaw, fail, recover, reset, restart, jsonbinLog,
   clearLog                            the same methods on the most recently started broker
   serve({root, files, broker, prodUrl, rewrite}) -> {base, url(p), served, close()}
   open(browser, url, {token, hubSession, storage, reseed, viewport, waitFor, cdn, ...})
       -> {ctx, page, errors, log, unexpected(), text(), close()}
   hubSession(email, orgRole, ttlMs) -> the hub_session_v1 object the Hub writes
   T: ok / eq / done (prints "N passed, M failed") / section
   ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/* Playwright: an installed `playwright` package (npm i -D playwright, then npx playwright install chromium),
   or PLAYWRIGHT_MODULE pointing at one, or the copy this sandbox ships */
const PLAYWRIGHT = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/npm-tools/node_modules/playwright'].filter(Boolean);
const PROD_BROKER = 'https://web-production-b17a2.up.railway.app';
const TOKEN = 'test-token';
const CLIENT = 'calm-1';
const HERE = __dirname;
const CALM = path.resolve(HERE, '..', '..');

let chromium = null;
for (const m of PLAYWRIGHT) { try { chromium = require(m).chromium; break; } catch (e) { /* next; only open() needs it */ } }

/* ------------------------------------------------------------------ http */
function httpJson(method, url, opts) {
  opts = opts || {};
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const headers = Object.assign({}, opts.headers || {});
    let body = opts.body;
    if (body !== undefined && body !== null && typeof body !== 'string' && !Buffer.isBuffer(body)) {
      body = JSON.stringify(body);
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
    }
    if (body != null) headers['Content-Length'] = Buffer.byteLength(body);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: method, headers: headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, headers: res.headers, body: parsed, text: text });
      });
    });
    req.on('error', reject);
    req.setTimeout(opts.timeout || 60000, () => req.destroy(new Error(method + ' ' + url + ': timed out')));
    if (body != null) req.write(body);
    req.end();
  });
}
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, opts) {
  opts = opts || {};
  const until = Date.now() + (opts.timeout || 10000);
  let last;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() > until) throw new Error('waitFor: timed out' + (opts.what ? ' waiting for ' + opts.what : ''));
    await sleep(opts.interval || 100);
  }
}

/* ------------------------------------------------------------------ the broker */
const RUNNING = new Set();
let CURRENT = null;
process.on('exit', () => { RUNNING.forEach((b) => { try { b.proc.kill('SIGTERM'); } catch (e) { /* gone */ } }); });

class Broker {
  constructor(o) {
    Object.assign(this, o);
    this.client = CLIENT;
  }
  /* ---- the broker's own API (always with the token unless {token: null}) ---- */
  api(p, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    const token = opts.token === undefined ? this.token : opts.token;
    if (token) headers.Authorization = 'Bearer ' + token;
    if (opts.ifMatch != null) headers['If-Match'] = String(opts.ifMatch);
    const method = opts.method || (opts.body !== undefined ? 'POST' : 'GET');
    return httpJson(method, this.url + p, { headers: headers, body: opts.body, timeout: opts.timeout });
  }
  async get(id) {
    const r = await this.api('/state/' + encodeURIComponent(id));
    if (r.status === 404) return null;
    if (r.status !== 200) throw new Error('GET /state/' + id + ' -> ' + r.status + ' ' + r.text.slice(0, 200));
    return r.body;
  }
  async version(id) {
    const r = await this.api('/state/' + encodeURIComponent(id) + '/version');
    if (r.status !== 200) throw new Error('GET /state/' + id + '/version -> ' + r.status + ' ' + r.text.slice(0, 200));
    return r.body;
  }
  put(id, doc, opts) {
    opts = opts || {};
    const body = Object.assign({ doc: doc, client: opts.client === undefined ? this.client : opts.client }, opts.extra || {});
    if (body.client === null) delete body.client;
    return this.api('/state/' + encodeURIComponent(id), { method: 'PUT', body: body, ifMatch: opts.ifMatch == null ? '0' : opts.ifMatch, token: opts.token });
  }
  /* another editor saves: read the current document and etag, apply the change, PUT with If-Match and the
     client id. `change` is the new document, or a function that edits a copy (or returns a new one). */
  async saveAs(id, change, opts) {
    opts = opts || {};
    const cur = await this.get(id);
    const before = cur ? clone(cur.doc) : {};
    let doc = before;
    if (typeof change === 'function') { const out = await change(doc, cur); if (out !== undefined) doc = out; } else doc = clone(change);
    const ifMatch = opts.ifMatch != null ? opts.ifMatch : cur ? cur.etag : '0';
    const r = await this.put(id, doc, { ifMatch: ifMatch, extra: opts.extra });
    if (!r.ok && !opts.allowFail) throw new Error('saveAs ' + id + ': PUT -> ' + r.status + ' ' + r.text.slice(0, 300));
    return r;
  }
  /* ---- admin (fakebin + broker control) ---- */
  async admin(method, p, body) {
    const r = await httpJson(method, this.adminUrl + p, { body: body, timeout: 120000 });
    if (!r.ok) throw new Error('admin ' + method + ' ' + p + ' -> ' + r.status + ' ' + r.text.slice(0, 300));
    return r.body;
  }
  readDoc(name) { return this.admin('GET', '/docs/' + encodeURIComponent(name)); }
  writeRaw(name, record, opts) { return this.admin('PUT', '/docs/' + encodeURIComponent(name), Object.assign({ record: record }, opts || {})); }
  async editViaAdmin(name, doc, opts) {
    const body = Object.assign({ doc: doc }, opts && opts.ifMatch != null ? { ifMatch: opts.ifMatch } : {});
    return httpJson('POST', this.adminUrl + '/docs/' + encodeURIComponent(name) + '/edit', { body: body, timeout: 60000 });
  }
  fail(name, opts) { return this.admin('POST', '/fail', Object.assign({ target: name == null ? '*' : name }, opts || {})); }
  recover(name) { return this.admin('POST', '/recover', name == null ? {} : { target: name }); }
  reset(opts) { return this.admin('POST', '/reset', opts || {}); }
  restart() { return this.admin('POST', '/restart', {}); }
  async jsonbinLog(opts) {
    opts = opts || {};
    const q = [];
    if (opts.since) q.push('since=' + opts.since);
    if (opts.name) q.push('name=' + encodeURIComponent(opts.name));
    return (await this.admin('GET', '/log' + (q.length ? '?' + q.join('&') : ''))).log;
  }
  clearLog() { return this.admin('DELETE', '/log'); }
  config() { return this.admin('GET', '/config'); }
  stderr() { return this.errLines.join('\n'); }
  stop() {
    RUNNING.delete(this);
    if (CURRENT === this) CURRENT = null;
    if (this.proc.exitCode != null || this.proc.signalCode != null) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(() => { try { this.proc.kill('SIGKILL'); } catch (e) { /* gone */ } }, 4000);
      this.proc.once('exit', () => { clearTimeout(t); resolve(); });
      try { this.proc.kill('SIGTERM'); } catch (e) { clearTimeout(t); resolve(); }
    });
  }
}

function startBroker(opts) {
  opts = opts || {};
  const args = [path.join(HERE, 'broker_up.py'), '--seed', opts.seed || 'sample', '--port', String(opts.port || 0),
    '--admin-port', String(opts.adminPort || 0), '--exit-with-parent'];
  if (opts.brokerDir) args.push('--broker-dir', opts.brokerDir);
  if (opts.token) args.push('--token', opts.token);
  if (opts.origins) args.push('--origins', opts.origins);
  if (opts.verbose) args.push('--verbose');
  Object.keys(opts.env || {}).forEach((k) => { const v = opts.env[k]; if (v == null) args.push('--unset', k); else args.push('--env', k + '=' + v); });
  const proc = spawn(opts.python || process.env.RD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const out = {};
  const errLines = [];
  return new Promise((resolve, reject) => {
    let done = false;
    const fail = (why) => {
      if (done) return;
      done = true;
      try { proc.kill('SIGKILL'); } catch (e) { /* gone */ }
      reject(new Error('broker_up did not start: ' + why + (errLines.length ? '\n--- broker_up stderr (last lines)\n' + errLines.slice(-25).join('\n') : '')));
    };
    const timer = setTimeout(() => fail('no BROKER_URL within ' + ((opts.timeoutMs || 150000) / 1000) + ' s'), opts.timeoutMs || 150000);
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        const m = /^(BROKER_URL|ADMIN_URL|FAKEBIN_URL)=(\S+)$/.exec(line);
        if (m) out[m[1]] = m[2];
        else if (opts.verbose && line) process.stdout.write('[broker] ' + line + '\n');
        if (m && m[1] === 'BROKER_URL' && !done) {
          done = true;
          clearTimeout(timer);
          const b = new Broker({ proc: proc, url: out.BROKER_URL, adminUrl: out.ADMIN_URL, fakebinUrl: out.FAKEBIN_URL, token: opts.token || TOKEN, seed: opts.seed || 'sample', errLines: errLines, exited: null });
          proc.on('exit', (code, sig) => { b.exited = { code: code, signal: sig }; });
          RUNNING.add(b);
          CURRENT = b;
          resolve(b);
        }
      }
    });
    let ebuf = '';
    proc.stderr.on('data', (d) => {
      ebuf += d.toString();
      let i;
      while ((i = ebuf.indexOf('\n')) >= 0) {
        const line = ebuf.slice(0, i);
        ebuf = ebuf.slice(i + 1);
        errLines.push(line);
        if (errLines.length > 2000) errLines.splice(0, errLines.length - 2000);
        if (opts.verbose || opts.echoStderr) process.stderr.write('[broker] ' + line + '\n');
      }
    });
    proc.on('exit', (code, sig) => { RUNNING.forEach((b) => { if (b.proc === proc) RUNNING.delete(b); }); fail('exited with ' + (sig || code)); });
    proc.on('error', (e) => fail(e.message));
  });
}
const currentBroker = () => CURRENT;
/* the most recently started broker's methods, as plain functions: live.api('/roster'), live.saveAs(...), ... */
const onCurrent = (name) => function () {
  if (!CURRENT) return Promise.reject(new Error(name + '(): no broker started (startBroker first)'));
  return CURRENT[name].apply(CURRENT, arguments);
};
const api = onCurrent('api');
const shortcuts = {};
['get', 'version', 'put', 'saveAs', 'readDoc', 'writeRaw', 'fail', 'recover', 'reset', 'restart', 'jsonbinLog', 'clearLog'].forEach((n) => { shortcuts[n] = onCurrent(n); });

/* ------------------------------------------------------------------ static pages */
const TYPES = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json' };
/* Serves built pages; in every HTML (and JS) response the production broker URL becomes the local one.
   opts.root: a directory; opts.files: {'name.html': '/abs/file'} (checked first); opts.broker: a Broker or a
   URL (default: the current broker, looked up per request); opts.rewrite: extra [from, to] pairs. */
function serve(opts) {
  opts = opts || {};
  const root = opts.root ? path.resolve(opts.root) : null;
  const files = {};
  Object.keys(opts.files || {}).forEach((k) => { files[k.replace(/^\/+/, '')] = path.resolve(opts.files[k]); });
  const prod = opts.prodUrl || PROD_BROKER;
  const rewriteExt = opts.rewriteExt || ['.html', '.htm', '.js', '.mjs'];
  const served = [];
  let target = opts.broker || null;
  const brokerUrl = () => { const b = target || CURRENT; return b ? (typeof b === 'string' ? b : b.url) : null; };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let rel;
      try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, ''); } catch (e) { res.writeHead(400); res.end('bad path'); return; }
      if (!rel && opts.index) rel = opts.index;
      let f = files[rel] || null;
      if (!f && root) {
        const cand = path.resolve(root, rel);
        const segs = rel.split('/');
        if ((cand === root || cand.startsWith(root + path.sep)) && !segs.some((s) => s.startsWith('.')) && !/\.env$/i.test(rel)) f = cand;
      }
      if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { served.push({ path: '/' + rel, status: 404 }); res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
      const ext = path.extname(f).toLowerCase();
      let body = fs.readFileSync(f);
      let rewrites = 0;
      const local = brokerUrl();
      if (rewriteExt.indexOf(ext) >= 0) {
        let s = body.toString('utf8');
        const pairs = (local ? [[prod, local]] : []).concat(opts.rewrite || []);
        pairs.forEach((pr) => { const parts = s.split(pr[0]); rewrites += parts.length - 1; s = parts.join(pr[1]); });
        body = Buffer.from(s, 'utf8');
      }
      served.push({ path: '/' + rel, status: 200, rewrites: rewrites });
      res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store', 'content-length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
    srv.listen(opts.port || 0, '127.0.0.1', () => {
      const base = 'http://127.0.0.1:' + srv.address().port + '/';
      resolve({
        srv: srv, base: base, served: served,
        url: (p) => base + String(p || '').replace(/^\/+/, ''),
        setBroker: (b) => { target = b; },
        close: () => new Promise((r) => { srv.closeAllConnections && srv.closeAllConnections(); srv.close(() => r()); })
      });
    });
  });
}

/* ------------------------------------------------------------------ pages */
function hubSession(email, orgRole, ttlMs) {
  const now = Date.now();
  return { email: email, role: 'user', orgRole: orgRole || '', issuedAt: now - 1000, expiresAt: now + (ttlMs == null ? 12 * 3600 * 1000 : ttlMs) };
}
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const isLocal = (u) => LOOPBACK.has(u.hostname) || /^127\./.test(u.hostname);
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

/* Opens `url` in a fresh browser context. Before any page script runs, localStorage gets rd_broker_token
   (opts.token; default the current broker's token; null for none), hub_session_v1 (opts.hubSession:
   {email, orgRole, ttlMs} or an email; written the way the Hub writes it) and opts.storage. By default
   that happens on the first load of the tab only, so a reload keeps what the page stored (opts.reseed:
   every load). Every non-loopback request is answered locally or blocked: Google Fonts get an empty
   200, opts.cdn ({regex source: local file}) can serve CDN scripts from disk, anything else (including
   the production broker, if a page still calls it) is aborted and listed in log.blocked. */
async function open(browser, url, opts) {
  opts = opts || {};
  if (!browser) throw new Error('open(): pass a browser (live.chromium.launch())');
  const ctx = await browser.newContext(Object.assign({ viewport: opts.viewport || { width: 1440, height: 900 }, colorScheme: opts.colorScheme || 'light' }, opts.context || {}));
  const log = { pageErrors: [], consoleErrors: [], warnings: [], blocked: [], stubbed: [], prodBroker: [], failed: [], broker: [] };
  const errors = [];
  const blockedUrls = new Set();
  const cdn = Object.keys(opts.cdn || {}).map((k) => [new RegExp(k), opts.cdn[k]]);
  await ctx.route((u) => !isLocal(u), async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (FONT_HOSTS.has(u.hostname)) {
      log.stubbed.push(u.href);
      return route.fulfill({ status: 200, contentType: u.hostname === 'fonts.googleapis.com' ? 'text/css' : 'font/woff2', body: '' });
    }
    const hit = cdn.find((c) => c[0].test(u.href));
    if (hit && fs.existsSync(hit[1])) {
      log.stubbed.push(u.href + ' <- ' + hit[1]);
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(hit[1]) });
    }
    if (u.origin === new URL(PROD_BROKER).origin) log.prodBroker.push(req.method() + ' ' + u.pathname);
    log.blocked.push(req.method() + ' ' + u.href);
    blockedUrls.add(u.href);
    return route.abort('blockedbyclient');
  });
  const storage = {};
  const token = opts.token === undefined ? (CURRENT ? CURRENT.token : TOKEN) : opts.token;
  if (token) storage.rd_broker_token = token;
  if (opts.hubSession) {
    const h = typeof opts.hubSession === 'string' ? hubSession(opts.hubSession, '') : opts.hubSession.expiresAt ? opts.hubSession : hubSession(opts.hubSession.email, opts.hubSession.orgRole, opts.hubSession.ttlMs);
    storage.hub_session_v1 = JSON.stringify(h);
  }
  Object.keys(opts.storage || {}).forEach((k) => { const v = opts.storage[k]; storage[k] = typeof v === 'string' ? v : JSON.stringify(v); });
  if (Object.keys(storage).length) {
    await ctx.addInitScript((arg) => {
      try {
        if (!/^https?:$/.test(location.protocol)) return;
        if (arg.once && sessionStorage.getItem('__live_seeded')) return;
        Object.keys(arg.storage).forEach((k) => localStorage.setItem(k, arg.storage[k]));
        if (arg.once) sessionStorage.setItem('__live_seeded', '1');
      } catch (e) { /* storage blocked */ }
    }, { storage: storage, once: !opts.reseed });
  }
  const page = await ctx.newPage();
  const brokerOrigin = () => (CURRENT ? new URL(CURRENT.url).origin : null);
  page.on('pageerror', (e) => { const m = 'pageerror: ' + (e && e.message ? e.message : e); log.pageErrors.push(m); errors.push(m); });
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const loc = (m.location && m.location()) || {};
      const entry = { text: m.text(), url: loc.url || '' };
      log.consoleErrors.push(entry);
      errors.push('console: ' + entry.text + (entry.url ? ' (' + entry.url + ')' : ''));
    } else if (m.type() === 'warning') log.warnings.push(m.text());
  });
  page.on('requestfailed', (r) => { const f = r.failure(); log.failed.push(r.method() + ' ' + r.url() + ' ' + (f ? f.errorText : '')); });
  page.on('response', (r) => {
    const o = brokerOrigin();
    if (!o) return;
    const u = new URL(r.url());
    if (u.origin === o && r.request().method() !== 'OPTIONS') log.broker.push({ method: r.request().method(), path: u.pathname, status: r.status() });
  });
  page.on('dialog', (d) => (opts.onDialog ? opts.onDialog(d) : d.dismiss()).catch(() => {}));
  if (opts.goto !== false) await page.goto(url, { waitUntil: opts.waitUntil || 'load', timeout: opts.timeout || 30000 });
  if (opts.waitFor) await page.waitForSelector(opts.waitFor, { timeout: opts.timeout || 30000 });
  /* errors that are not explained by a request this harness blocked on purpose (fonts, CDNs) */
  const unexpected = () => log.pageErrors.concat(log.consoleErrors.filter((c) => {
    if (/^Failed to load resource/.test(c.text) && (blockedUrls.has(c.url) || (c.url && !isLocal(new URL(c.url))))) return false;
    return true;
  }).map((c) => 'console: ' + c.text + (c.url ? ' (' + c.url + ')' : '')));
  return {
    ctx: ctx, page: page, p: page, errors: errors, log: log, unexpected: unexpected,
    text: async () => (await page.locator('body').innerText()).replace(/\s+/g, ' '),
    close: () => ctx.close()
  };
}

/* ------------------------------------------------------------------ results */
const T = (function () {
  let pass = 0, fail = 0;
  return {
    ok(cond, label) { if (cond) { pass++; if (process.env.LIVE_VERBOSE) console.log('ok   ' + label); } else { fail++; console.log('FAIL ' + label); } return !!cond; },
    eq(label, got, want) {
      const g = JSON.stringify(got), w = JSON.stringify(want);
      if (g === w) { pass++; if (process.env.LIVE_VERBOSE) console.log('ok   ' + label); return true; }
      fail++;
      console.log('FAIL ' + label + '\n   got  ' + String(g).slice(0, 400) + '\n   want ' + String(w).slice(0, 400));
      return false;
    },
    section(name) { console.log('\n== ' + name); },
    counts() { return { pass: pass, fail: fail }; },
    done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exitCode = 1; }
  };
})();

module.exports = Object.assign({
  startBroker, currentBroker, api, serve, open, hubSession, httpJson, waitFor, sleep, clone, T, Broker,
  chromium, PROD_BROKER, TOKEN, CLIENT, HERE, CALM, SEEDS: path.join(HERE, 'seeds')
}, shortcuts);
