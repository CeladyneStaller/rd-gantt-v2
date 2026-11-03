/* Shared helpers for testing the deployed (standalone) calm pages in headless Chromium. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('./live/lib');   /* Playwright, resolved the same way as the live tests */

const DEPLOY = path.resolve(__dirname, '..', 'deploy');

/* a static server for deploy/ (the same files GitHub Pages would serve) */
function serve(dir) {
  dir = dir || DEPLOY;
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const f = path.join(dir, u === '/' ? 'calm-planning.html' : u.replace(/^\/+/, ''));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port + '/' }));
  });
}

let PASS = 0, FAIL = 0;
function ok(cond, label) { if (cond) PASS++; else { FAIL++; console.log('FAIL', label); } }
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) PASS++; else { FAIL++; console.log('FAIL', label, '\n   got ', g, '\n   want', w); }
}
function done() { console.log(PASS + ' passed, ' + FAIL + ' failed'); if (FAIL) process.exitCode = 1; }

/* a fresh browser profile; `storage` seeds localStorage before any page script runs (first load only) */
async function open(browser, base, page, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, colorScheme: opts.colorScheme || 'light' });
  if (opts.before) await opts.before(ctx);
  if (opts.storage) {
    await ctx.addInitScript((seed) => {
      if (!sessionStorage.getItem('__seeded')) {
        for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
        sessionStorage.setItem('__seeded', '1');
      }
    }, opts.storage);
  }
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.message ? e.message : e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  p.on('dialog', (d) => d.dismiss().catch(() => {}));
  await p.goto(base + page);
  await p.waitForSelector('.cw', { timeout: 15000 });
  return { ctx, p, errors };
}

const PAGES = ['calm-planning.html', 'calm-execution.html', 'calm-sales.html', 'calm-product-spec.html'];
const SHOTS = process.env.CALM_SHOTS || '';
const EDITORS = 'Corey Staller and Dana Whitcomb';
const hubSession = (email, orgRole, ttl) => JSON.stringify({ email: email, role: 'user', orgRole: orgRole, issuedAt: Date.now() - 1000, expiresAt: Date.now() + (ttl == null ? 3600000 : ttl) });
/* what the live apps keep on the same site; the prototype must leave every one of these alone */
const LIVE = {
  rd_theme: 'dark', rd_division: 'LIVE-DIV', rd_gantt_quarters: '["2025Q1"]', rd_gantt_showpaused: '1', rd_gantt_labelw: '333',
  rd_kb_backlog: '1', rd_kb_narrow: '1', rd_kb_done: '{"live-board":{"win":"7d","style":"compact"}}', rd_kb_done_acct: '{"someone@celadynetech.com":{"prefs":{},"pending":[]}}',
  etb_editor_v1: 'Live Name', 'etbGraphOpen:OBJ-EL-2026Q4-01': '{"live":1}', calm_viewer: '{"email":"live@celadynetech.com","signedIn":true}'
};

const fontsOff = async (ctx) => ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
async function page(browser, base, file, opts) {
  const r = await open(browser, base, file, Object.assign({ before: fontsOff }, opts || {}));
  return r;
}
const text = async (p) => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
const storageOf = (p) => p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + '.png') }); } };

/* a random walk of real clicks, typing and choices, never leaving the page */
async function walk(p, steps, seed, errors) {
  let x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const VALUES = ['', '1', '42', '2026-11-05', 'abc', '75', 'Renamed item', '2027Q1', '-3', '0.5'];
  let acted = 0;
  for (let i = 0; i < steps; i++) {
    const n = await p.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      const all = Array.from(document.querySelectorAll('button, a[href], input, select, textarea'));
      /* reachable: on screen and not covered by a panel or the dimmed page (off-screen ones get scrolled to) */
      const reachable = (el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return true;
        const top = document.elementFromPoint(cx, cy);
        if (!top) return false;
        if (top === el || el.contains(top) || top.contains(el)) return true;
        const lab = el.closest('label');
        return !!lab && lab.contains(top);
      };
      /* with a panel or dialog open, only what is in the top one (or the dimmed page around it) can be used */
      const modals = Array.from(document.querySelectorAll('[aria-modal="true"]')).filter(vis);
      const top = modals.length ? modals[modals.length - 1] : null;
      const list = all.filter((el) => {
        if (!vis(el) || el.disabled) return false;
        if (top && !top.contains(el) && !(el.matches('.sheet-scrim, .scrim') && el.closest('.cw'))) return false;
        if (el.tagName === 'A') { const h = el.getAttribute('href') || ''; if (!h.startsWith('#')) return false; }
        if (el.tagName === 'INPUT' && (el.type === 'file' || el.type === 'hidden')) return false;
        return reachable(el);
      });
      document.querySelectorAll('[data-walk]').forEach((el) => el.removeAttribute('data-walk'));
      list.forEach((el, i) => el.setAttribute('data-walk', String(i)));
      return list.length;
    });
    if (!n) break;
    const pick = Math.floor(rand() * n);
    const el = p.locator('[data-walk="' + pick + '"]');
    try {
      const info = await el.evaluate((e) => ({ tag: e.tagName, type: e.type || '' }));
      if (rand() < 0.06) await p.keyboard.press('Escape');
      else if (info.tag === 'SELECT') {
        const vals = await el.evaluate((e) => Array.from(e.options).map((o) => o.value));
        if (vals.length) await el.selectOption(vals[Math.floor(rand() * vals.length)], { timeout: 600 });
      } else if (info.tag === 'TEXTAREA' || (info.tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(info.type))) {
        const v = VALUES[Math.floor(rand() * VALUES.length)];
        await el.fill(info.type === 'date' ? '2026-11-05' : info.type === 'number' ? String(Math.floor(rand() * 100)) : v, { timeout: 600 });
        if (rand() < 0.4) await el.press('Enter', { timeout: 600 });
      } else {
        await el.click({ timeout: 600 });
      }
      acted++;
    } catch (e) { /* covered by a panel or gone after a re-render: pick again */ }
    if (rand() < 0.05) await p.waitForTimeout(400);
    if (errors.length) break;
  }
  return acted;
}


module.exports = { serve, open, ok, eq, done, chromium, DEPLOY, PAGES, EDITORS, SHOTS, hubSession, LIVE, page, text, storageOf, shot, walk };
