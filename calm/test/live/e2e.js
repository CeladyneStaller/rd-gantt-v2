#!/usr/bin/env node
/* ============================================================================
   e2e.js: the five built pages against the REAL broker on this machine (JSONBin faked by fakebin.py), in
   headless Chromium. Nothing leaves the machine: the broker refuses non-loopback hosts and the pages'
   external requests are answered locally or blocked (lib.js).

     python build.py                                   (repo root: the five pages)
     node calm/test/live/e2e.js [--pages DIR] [--only WORD] [--steps N]

   --pages   where planning_app.html, execution_app.html, sales_app.html, product_designer.html, my_projects.html are
             (default: the repo root, where build.py writes them)
   --only    run the sections whose title contains WORD (e.g. --only Sales)
   --steps   random-walk length per page (default 150)
   RD_OLD_EXEC_APP=<file>   an execution_app.html from before the Calm patch, for the "old tab" section
                            (git show cfcbc3f:execution_app.html > old.html); skipped without it
   OLD_BROKER_DIR=<dir>     a broker/ folder from before the patch, for the "pages first" section; skipped
                            without it

   Needs Python 3 with fastapi + uvicorn (the broker), Node, and Playwright with Chromium.
   Ends with "N passed, M failed".
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const live = require('./lib');
const { T } = live;

const ARGS = process.argv.slice(2);
const arg = (name, dflt) => { const i = ARGS.indexOf(name); return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : dflt; };
const REPO = path.resolve(__dirname, '..', '..', '..');
const PAGES = path.resolve(arg('--pages', REPO));
const ONLY = arg('--only', '');
const STEPS = Number(arg('--steps', 150));
const FILES = { planning: 'planning_app.html', execution: 'execution_app.html', sales: 'sales_app.html', spec: 'product_designer.html', mine: 'my_projects.html' };
const CTO = { email: 'corey@celadyne.com', orgRole: 'cto' };
const LEAD = { email: 'toru@celadyne.com', orgRole: 'lead' };
const IC = { email: 'maya@celadyne.com', orgRole: 'ic' };
const PRIYA = { email: 'priya@celadyne.com', orgRole: 'ic' };
/* what each app may write (LIVE.md) */
const WRITES = {
  planning: (p) => p === '/state/portfolio',
  execution: (p) => p === '/state/portfolio' || /^\/state\/EXEC-/.test(p),
  sales: (p) => p === '/state/portfolio' || /^\/state\/BIZ-/.test(p),
  spec: (p) => p === '/state/portfolio' || /^\/state\/SPEC-/.test(p),
  /* My Projects: readings, progress and steps go to the objective's own document, of either app; never the portfolio */
  mine: (p) => /^\/state\/(EXEC|BIZ)-/.test(p)
};
/* the browser logs every non-2xx answer as a console error; these are the ones a scenario provokes on purpose */
const PROVOKED = /Failed to load resource: the server responded with a status of (412|426|401|502|503)/;

let broker, site, browser;
const waitText = (r, t, ms) => r.page.waitForFunction((s) => document.body && document.body.innerText.includes(s), t, { timeout: ms || 20000 });
const has = async (r, t) => (await r.text()).includes(t);
const puts = (r, from) => r.log.broker.slice(from || 0).filter((x) => x.method === 'PUT');
const stateWrites = (r, from) => r.log.broker.slice(from || 0).filter((x) => x.method !== 'GET' && /^\/state\//.test(x.path));
const clean = (r, extra) => r.unexpected().filter((e) => !(extra && extra.test(e)));
async function page(file, opts) {
  return live.open(browser, site.url(file), Object.assign({ hubSession: CTO }, opts || {}));
}
async function section(title, fn) {
  if (ONLY && title.toLowerCase().indexOf(ONLY.toLowerCase()) < 0) return;
  T.section(title);
  try {
    await broker.recover();
    await broker.reset();
    await fn();
  } catch (e) {
    T.ok(false, title + ': crashed: ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e));
  }
}

/* a random walk of real clicks, typing and choices that never leaves the page (test/browser_lib.js), minus
   the broker token field, which would only lock the page out */
async function walk(p, steps, seed) {
  let x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const VALUES = ['', '1', '42', '2026-11-05', 'abc', '75', 'Renamed item', '2027Q1', '-3', '0.5'];
  let acted = 0;
  for (let i = 0; i < steps; i++) {
    const n = await p.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      const all = Array.from(document.querySelectorAll('button, a[href], input, select, textarea'));
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
      const modals = Array.from(document.querySelectorAll('[aria-modal="true"]')).filter(vis);
      const top = modals.length ? modals[modals.length - 1] : null;
      const list = all.filter((el) => {
        if (!vis(el) || el.disabled) return false;
        if (top && !top.contains(el) && !(el.matches('.sheet-scrim, .scrim') && el.closest('.cw'))) return false;
        if (el.tagName === 'A') { const h = el.getAttribute('href') || ''; if (!h.startsWith('#')) return false; }
        if (el.tagName === 'INPUT' && (el.type === 'file' || el.type === 'hidden' || el.type === 'password')) return false;
        const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).toLowerCase();
        if (/token|open (this|with these) (link|parameters)/.test(label)) return false;
        return reachable(el);
      });
      document.querySelectorAll('[data-walk]').forEach((el) => el.removeAttribute('data-walk'));
      list.forEach((el, i) => el.setAttribute('data-walk', String(i)));
      return list.length;
    });
    if (!n) break;
    const el = p.locator('[data-walk="' + Math.floor(rand() * n) + '"]');
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
      } else await el.click({ timeout: 600 });
      acted++;
    } catch (e) { /* covered by a panel or gone after a re-render: pick again */ }
    if (rand() < 0.05) await p.waitForTimeout(400);
  }
  return acted;
}
/* every unsaved change reaches the broker: the page says Saved and has nothing pending */
async function settled(r) {
  await r.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await r.page.waitForTimeout(3200);
}

const SECTIONS = [];
const add = (title, fn) => SECTIONS.push([title, fn]);

/* ---------------------------------------------------------------------------------------------- loads */
add('Every page loads from the broker and writes nothing on load', async () => {
  const want = {
    planning: ['/roster', '/state/portfolio', '/state/EXEC-DIV-FC', '/state/EXEC-DIV-EL', '/state/BIZ-DIV-BD', '/state/BIZ-DIV-PT', '/state/SPEC-DIV-FC', '/state/SPEC-DIV-EL'],
    /* Execution and Sales read each other's documents too (October 19: a pulled KPI reaches any objective) */
    execution: ['/roster', '/state/portfolio', '/state/EXEC-DIV-FC', '/state/EXEC-DIV-EL', '/state/BIZ-DIV-BD', '/state/BIZ-DIV-PT', '/state/SPEC-DIV-FC', '/state/SPEC-DIV-EL'],
    sales: ['/roster', '/state/portfolio', '/state/BIZ-DIV-BD', '/state/BIZ-DIV-PT', '/state/EXEC-DIV-FC', '/state/EXEC-DIV-EL', '/state/SPEC-DIV-FC', '/state/SPEC-DIV-EL'],
    spec: ['/roster', '/state/portfolio', '/state/SPEC-DIV-FC', '/state/SPEC-DIV-EL'],
    /* My Projects: every division's document of both apps (objectives from anywhere), and the specifications */
    mine: ['/roster', '/state/portfolio', '/state/EXEC-DIV-FC', '/state/EXEC-DIV-EL', '/state/BIZ-DIV-BD', '/state/BIZ-DIV-PT', '/state/SPEC-DIV-FC', '/state/SPEC-DIV-EL']
  };
  for (const app of Object.keys(FILES)) {
    const r = await page(FILES[app]);
    await r.page.waitForLoadState('networkidle');
    await r.page.waitForTimeout(3500);
    const reads = r.log.broker.filter((x) => x.method === 'GET' && !/\/version$|^\/prefs\//.test(x.path)).map((x) => x.path);
    T.eq(app + ': read the documents it needs', reads.slice().sort(), want[app].slice().sort());
    T.ok(r.log.broker.every((x) => x.status === 200), app + ': every call answered 200');
    T.eq(app + ': wrote nothing on load', stateWrites(r).map((x) => x.method + ' ' + x.path), []);
    T.ok(!(await has(r, 'Prototype with sample data')) && !(await has(r, 'Restore the sample data')), app + ': no prototype wording');
    T.eq(app + ': title', await r.page.title(), { planning: 'R&D Planning', execution: 'R&D Execution', sales: 'Sales', spec: 'Product Specification', mine: 'My Projects' }[app]);
    T.eq(app + ': nothing sent to the production broker', r.log.prodBroker, []);
    T.eq(app + ': no errors', clean(r), []);
    await r.close();
  }
});

/* ---------------------------------------------------------------------------------------------- Planning */
async function planEdit(p, from, to) {
  await p.getByRole('button', { name: 'Structure', exact: true }).click();
  await p.getByRole('button', { name: 'More actions for ' + from }).click();
  await p.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  const editor = p.locator('[aria-label="Editor"]');
  await editor.getByLabel('Statement').fill(to);
  await editor.getByRole('button', { name: 'Save objective' }).click();
}
const objOf = (P, id) => (P.objectives || []).find((o) => o.id === id) || {};

add('Planning: the CTO edits, another editor saves first, the plan merges', async () => {
  const r = await page(FILES.planning);
  await r.page.waitForLoadState('networkidle');
  await waitText(r, 'Run full roll-to-roll membrane production');
  T.ok(!(await has(r, 'View only')), 'the CTO is not view only');
  await planEdit(r.page, 'Run full roll-to-roll membrane production', 'Run full roll-to-roll membrane production at 2 m/min');
  await live.waitFor(async () => objOf((await broker.get('portfolio')).doc, 'OBJ-FC-2026Q4-01').statement === 'Run full roll-to-roll membrane production at 2 m/min', { timeout: 10000, what: 'the statement on the broker' });
  T.eq('one portfolio PUT, accepted', puts(r).map((x) => x.path + ' ' + x.status), ['/state/portfolio 200']);
  await broker.saveAs('portfolio', (P) => { objOf(P, 'OBJ-EL-2026Q4-02').statement = 'Lock Tera components (Dana)'; });
  await planEdit(r.page, 'Run full roll-to-roll membrane production at 2 m/min', 'Run roll-to-roll production at 2 m/min');
  await waitText(r, 'Saved, merged with a change another editor saved first.');
  const P = (await broker.get('portfolio')).doc;
  T.eq('both changes on the broker', [objOf(P, 'OBJ-FC-2026Q4-01').statement, objOf(P, 'OBJ-EL-2026Q4-02').statement], ['Run roll-to-roll production at 2 m/min', 'Lock Tera components (Dana)']);
  T.eq('a refused PUT, then the merged one', puts(r).slice(1).map((x) => x.status), [412, 200]);
  T.ok(await has(r, 'Lock Tera components (Dana)'), 'their change is on the page too');
  T.eq('only the portfolio written', [...new Set(puts(r).map((x) => x.path))], ['/state/portfolio']);
  T.eq('no errors', clean(r, /status of 412/), []);
  await r.close();
});

add('Planning: a lead and a Confluence embed see it view only', async () => {
  let r = await page(FILES.planning, { hubSession: LEAD });
  await r.page.waitForLoadState('networkidle');
  await waitText(r, 'View only');
  T.ok(await has(r, 'Changes are made by the CTO and CEO'), 'the banner says who can change the plan');
  T.eq('nothing written', stateWrites(r).length, 0);
  await r.close();
  /* inside an iframe the Hub sign-in isn't visible: view only, with a link to the full page */
  const frameHost = await live.serve({ files: { 'confluence.html': (() => { const f = path.join(require('os').tmpdir(), 'calm-e2e-confluence.html'); fs.writeFileSync(f, '<!doctype html><title>Wiki</title><iframe id="f" style="width:1300px;height:800px" src="' + site.url(FILES.planning + '?tab=gantt') + '"></iframe>'); return f; })() } });
  try {
    r = await live.open(browser, frameHost.url('confluence.html'), { hubSession: null });
    const fr = r.page.frameLocator('#f');
    await fr.getByText('Open the full page to edit').waitFor({ timeout: 20000 });
    const a = fr.getByRole('link', { name: 'Open the full page to edit' });
    T.eq('the link opens the full page in a new tab', [await a.getAttribute('target'), /planning_app\.html\?tab=gantt$/.test(await a.getAttribute('href'))], ['_blank', true]);
    await r.close();
  } finally { await frameHost.close(); }
});

add('Planning: present mode and ?readonly never write', async () => {
  for (const q of ['?present', '?readonly=1']) {
    const r = await page(FILES.planning + q);
    await r.page.waitForLoadState('networkidle');
    const acted = await walk(r.page, Math.round(STEPS / 2), 41 + q.length);
    await settled(r);
    T.ok(acted > STEPS * 0.15, q + ': the walk acted ' + acted + ' times');
    T.eq(q + ': nothing written', stateWrites(r).map((x) => x.method + ' ' + x.path), []);
    T.eq(q + ': no errors', clean(r), []);
    await r.close();
  }
});

/* ---------------------------------------------------------------------------------------------- Execution */
add('Execution: a link, a saved edit, a 412, a poll, Settings', async () => {
  const r = await page(FILES.execution + '?division=DIV-FC&objective=OBJ-EL-2026Q4-01');
  await waitText(r, 'Loaded Electrolyzer.');
  T.ok(await has(r, 'Qualify the 10-cell short stack for durability testing'), 'the objective from ?objective= is open');
  T.eq('remembered division', await r.page.evaluate(() => localStorage.getItem('rd_division')), 'DIV-EL');
  await r.page.getByRole('button', { name: 'End objective' }).first().click();
  await r.page.locator('aside[aria-label="Editor"] .sh-foot').getByRole('button', { name: 'End objective' }).click();
  await live.waitFor(async () => ((await broker.get('EXEC-DIV-EL')).doc.objectiveState || []).some((s) => s.objectiveId === 'OBJ-EL-2026Q4-01'), { timeout: 10000, what: 'the end state on the broker' });
  T.eq('one PUT, to EXEC-DIV-EL, answered 200', puts(r).map((x) => x.path + ' ' + x.status), ['/state/EXEC-DIV-EL 200']);
  await waitText(r, 'Saved');
  await broker.saveAs('EXEC-DIV-EL', (doc) => { doc.keyResults.find((k) => k.objectiveId === 'OBJ-EL-2026Q4-01').statement = 'Edited by another editor'; });
  await r.page.getByRole('button', { name: 'Reopen' }).click();
  await waitText(r, 'Another editor saved first — reloaded; re-apply your change.');
  T.ok(puts(r).some((x) => x.path === '/state/EXEC-DIV-EL' && x.status === 412), 'the stale save got 412');
  T.ok(await has(r, 'Edited by another editor'), 'their version is on the page');
  T.ok(((await broker.get('EXEC-DIV-EL')).doc.objectiveState || []).some((s) => s.objectiveId === 'OBJ-EL-2026Q4-01'), 'the broker kept their version');
  await broker.saveAs('EXEC-DIV-EL', (doc) => { doc.keyResults.find((k) => k.objectiveId === 'OBJ-EL-2026Q4-01').statement = 'Renamed again elsewhere'; });
  await r.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitText(r, 'Updated from another editor.');
  T.ok(await has(r, 'Renamed again elsewhere'), 'the poll brought the change in');
  await r.page.getByRole('button', { name: 'Settings' }).click();
  await waitText(r, 'Load from the broker');
  const st = await r.text();
  T.ok(!/Simulate|Go offline|Restore the sample data|teammate/.test(st), 'Settings: no simulations');
  T.eq('the token is never on the page', st.includes(broker.token), false);
  T.eq('no errors', clean(r, /status of 412/), []);
  await r.close();
});

add('Execution: Revise plan saves the new finish to the portfolio', async () => {
  const r = await page(FILES.execution + '?objective=OBJ-EL-2026Q4-01');
  await waitText(r, 'Loaded Electrolyzer.');
  const p = r.page;
  await p.getByRole('button', { name: 'Stage-gates', exact: true }).click();
  await p.getByRole('button', { name: 'Revise plan' }).click();
  const ed = p.locator('aside[aria-label="Editor"]');
  await ed.getByRole('textbox', { name: 'Committed finish' }).fill('2027-01-08');
  await ed.getByRole('textbox', { name: 'Why this revision' }).fill('End-to-end check.');
  await ed.getByRole('button', { name: /^Commit v\d+$/ }).click();
  await live.waitFor(async () => r.log.broker.some((x) => x.method === 'PUT' && x.path === '/state/portfolio' && x.status === 200), { timeout: 10000, what: 'the portfolio PUT' });
  await settled(r);
  const P = (await broker.get('portfolio')).doc;
  const o = P.objectives.find((x) => x.id === 'OBJ-EL-2026Q4-01');
  T.ok(o && o.plannedEnd > 0, 'the portfolio on the broker has a planned finish');
  T.eq('written: the portfolio and EXEC-DIV-EL', [...new Set(puts(r).filter((x) => x.status === 200).map((x) => x.path))].sort(), ['/state/EXEC-DIV-EL', '/state/portfolio']);
  T.eq('no errors', clean(r), []);
  await r.close();
});

add('Execution: the Done column choice follows the person (/prefs)', async () => {
  const r = await page(FILES.execution + '?objective=OBJ-EL-2026Q4-02');
  await waitText(r, 'Loaded Electrolyzer.');
  const p = r.page;
  await p.getByRole('button', { name: 'Kanban', exact: true }).click();
  await p.getByRole('button', { name: 'All finished' }).first().click();
  await p.getByRole('menuitemradio', { name: '30 days' }).or(p.getByRole('button', { name: '30 days' })).first().click();
  await live.waitFor(async () => r.log.broker.some((x) => x.method === 'PATCH' && /^\/prefs\//.test(x.path) && x.status === 200), { timeout: 10000, what: 'PATCH /prefs' });
  const prefs = (await broker.readDoc('prefs')).doc;
  const mine = ((prefs.users || {})['corey@celadyne.com'] || {}).kbDone || {};
  T.eq('stored on the broker for this person', mine['BRD-EL-LOCK'] && mine['BRD-EL-LOCK'].win, 30);
  T.eq('no document written for a view choice', stateWrites(r).length, 0);
  await r.close();
  const r2 = await page(FILES.execution + '?objective=OBJ-EL-2026Q4-02');
  await waitText(r2, 'Loaded Electrolyzer.');
  await r2.page.getByRole('button', { name: 'Kanban', exact: true }).click();
  await r2.page.waitForTimeout(800);
  T.ok(await r2.page.getByRole('button', { name: 'Last 30 days' }).count() > 0, 'another browser shows the same choice');
  T.eq('no errors', clean(r).concat(clean(r2)), []);
  await r2.close();
});

add('Execution: Connect data reads the analysis index', async () => {
  const r = await page(FILES.execution + '?objective=OBJ-EL-2026Q4-01');
  await waitText(r, 'Loaded Electrolyzer.');
  const p = r.page;
  await p.getByRole('button', { name: 'Record readings' }).first().click();
  await p.locator('[data-k="kpi-t:all:keyResult:KR-EL-2026Q4-01-1"]').getByRole('button', { name: 'Connect data' }).click();
  await live.waitFor(async () => r.log.broker.some((x) => x.path === '/analysis'), { timeout: 10000, what: 'GET /analysis' });
  T.ok(r.log.broker.some((x) => x.path === '/analysis' && x.status === 200), 'GET /analysis answered 200');
  await waitText(r, 'Currently connected');
  T.ok(true, 'the picker shows what is connected, from the index');
  T.eq('no errors', clean(r), []);
  await r.close();
});

add('Execution: offline keeps the change and saves it when back', async () => {
  const r = await page(FILES.execution + '?objective=OBJ-EL-2026Q4-01');
  await waitText(r, 'Loaded Electrolyzer.');
  await r.ctx.setOffline(true);
  await r.page.getByRole('button', { name: 'End objective' }).first().click();
  await r.page.locator('aside[aria-label="Editor"] .sh-foot').getByRole('button', { name: 'End objective' }).click();
  await waitText(r, 'Changes are kept here', 15000);
  T.ok(!((await broker.get('EXEC-DIV-EL')).doc.objectiveState || []).some((s) => s.objectiveId === 'OBJ-EL-2026Q4-01'), 'not on the broker while offline');
  await r.ctx.setOffline(false);
  await r.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await live.waitFor(async () => ((await broker.get('EXEC-DIV-EL')).doc.objectiveState || []).some((s) => s.objectiveId === 'OBJ-EL-2026Q4-01'), { timeout: 15000, what: 'the change on the broker after reconnecting' });
  T.ok(true, 'saved once back online');
  T.eq('no errors besides the offline requests', r.log.pageErrors, []);
  await r.close();
});

add('Execution: read-only links never write', async () => {
  const r = await page(FILES.execution + '?readonly=1&objective=OBJ-EL-2026Q4-01');
  await waitText(r, 'Loaded Electrolyzer.');
  const acted = await walk(r.page, STEPS, 11);
  await settled(r);
  T.ok(acted > STEPS * 0.3, 'the walk acted ' + acted + ' times');
  T.eq('nothing written', stateWrites(r).map((x) => x.method + ' ' + x.path), []);
  T.eq('no errors', clean(r), []);
  await r.close();
});

add('Execution: a storage error at load writes nothing and the page retries by itself', async () => {
  await broker.restart();
  await broker.fail('EXEC-DIV-EL', { mode: 500, ops: 'read' });
  const r = await page(FILES.execution + '?objective=OBJ-EL-2026Q4-01');
  await r.page.waitForTimeout(2500);
  T.ok(r.log.broker.some((x) => x.path === '/state/EXEC-DIV-EL' && x.status === 502), 'the broker answers 502, not 404');
  T.eq('nothing written while the read fails', stateWrites(r).length, 0);
  await broker.recover();
  await waitText(r, 'Loaded Electrolyzer.', 20000);
  T.ok(await has(r, 'Qualify the 10-cell short stack for durability testing'), 'it loaded by itself once storage answered, with the link applied');
  T.eq('still nothing written', stateWrites(r).length, 0);
  T.eq('no errors besides the 502', clean(r, /status of 502/), []);
  await r.close();
});

add('Execution: a failed reload keeps the page and its data', async () => {
  const r = await page(FILES.execution + '?objective=OBJ-EL-2026Q4-01');
  await waitText(r, 'Loaded Electrolyzer.');
  await broker.restart();
  await broker.fail('portfolio', { mode: 500, ops: 'read' });
  await r.page.getByRole('button', { name: 'Settings' }).click();
  await r.page.getByRole('button', { name: 'Load from the broker' }).click();
  await r.page.waitForTimeout(1500);
  await r.page.keyboard.press('Escape');
  T.ok(await has(r, 'Qualify the 10-cell short stack for durability testing'), 'the objective is still on the page');
  await broker.recover();
  await r.page.getByRole('button', { name: 'End objective' }).first().click();
  await r.page.locator('aside[aria-label="Editor"] .sh-foot').getByRole('button', { name: 'End objective' }).click();
  await live.waitFor(async () => ((await broker.get('EXEC-DIV-EL')).doc.objectiveState || []).some((s) => s.objectiveId === 'OBJ-EL-2026Q4-01'), { timeout: 10000, what: 'an edit after the failed reload is saved' });
  T.ok(true, 'and it still saves');
  await r.close();
});

add('Execution: no token, then a token from Settings; a refused token', async () => {
  let r = await page(FILES.execution + '?objective=OBJ-FC-2026Q4-02', { token: null });
  await waitText(r, 'Open this app from the Hub, or add the token in Settings.');
  T.eq('no state request without a token', r.log.broker.filter((x) => /^\/state\//.test(x.path)).length, 0);
  await r.page.getByRole('button', { name: 'Open settings' }).click();
  await r.page.getByLabel('Broker token').fill(broker.token);
  await r.page.getByRole('button', { name: 'Save token' }).click();
  await waitText(r, 'Loaded Fuel Cell.');
  T.eq('kept in this browser', await r.page.evaluate(() => localStorage.getItem('rd_broker_token')), broker.token);
  T.eq('the link applied on the first good load', await r.page.evaluate(() => localStorage.getItem('rd_division')), 'DIV-FC');
  T.eq('no errors', clean(r), []);
  await r.close();
  r = await page(FILES.execution, { token: 'wrong-token' });
  await waitText(r, 'The broker didn’t accept the token');
  T.eq('nothing written', stateWrites(r).length, 0);
  await r.close();
  r = await page(FILES.execution + '?token=' + encodeURIComponent(broker.token) + '&objective=OBJ-FC-2026Q4-02', { token: null });
  await waitText(r, 'Loaded Fuel Cell.');
  T.ok(!/token=/i.test(r.page.url()), 'a ?token= link loads, and the token leaves the address bar');
  await r.close();
});

add('Execution and Sales: the kanban has its own tab, and there is no Tasks tab', async () => {
  for (const [app, q] of [['execution', '?objective=OBJ-EL-2026Q4-02'], ['sales', '?division=DIV-BD&objective=OBJ-BD-2026Q4-01']]) {
    const r = await page(FILES[app] + q);
    await waitText(r, 'Loaded ');
    const p = r.page;
    const tabs = (await p.locator('[aria-label="Objective sections"]').getByRole('button').allInnerTexts()).map((t) => t.trim());
    T.eq(app + ': tabs (Sales: no Experiments since November 3)', tabs, ['Overview', 'Key results', 'Stage-gates', 'Kanban', 'Risks'].concat(app === 'sales' ? [] : ['Experiments']));
    T.eq(app + ': no Up next on the Overview (tasks removed October 15)', await p.getByText('Up next', { exact: true }).count(), 0);
    await p.getByRole('button', { name: 'Stage-gates', exact: true }).click();
    await p.waitForSelector('[data-k="gates-panel"]');
    T.eq(app + ': Stage-gates shows the gates, no board and no switch', [await p.locator('[data-k="kb"]').count(), await p.getByRole('group', { name: 'Show stage-gates as' }).count()], [0, 0]);
    await p.getByRole('button', { name: 'Kanban', exact: true }).click();
    await p.waitForSelector('[data-k="kb"]');
    T.eq(app + ': Kanban shows the board, not the gates', await p.locator('[data-k="gates-panel"]').count(), 0);
    T.eq(app + ': moving between them writes nothing', stateWrites(r).length, 0);
    T.eq(app + ': no errors', clean(r), []);
    await r.close();
  }
});

add('Execution: the Experiments tab reads Current step, Logic trees, then the logic tree', async () => {
  /* November 3: Logic trees (the trees, Manage trees, New tree) moved out of Current step to sit just above the logic
     tree it opens. (Sales has had no Experiments tab since the same day; its own section follows.) */
  for (const [app, q] of [['execution', '?objective=OBJ-EL-2026Q4-01']]) {
    const r = await page(FILES[app] + q);
    await waitText(r, 'Loaded ');
    const p = r.page;
    await p.getByRole('button', { name: 'Experiments', exact: true }).click();
    await p.waitForSelector('[data-k="etb"]');
    const tops = await p.evaluate(() => ['current-step', 'logic-trees', 'etb'].map((k) => { const el = document.querySelector('[data-k="' + k + '"]'); return el ? Math.round(el.getBoundingClientRect().top + scrollY) : null; }));
    {
      T.ok(tops[0] < tops[1] && tops[1] < tops[2], 'execution: Current step, Logic trees, then the logic tree, top to bottom (' + tops.join(', ') + ')');
      const lt = p.locator('[data-k="logic-trees"]');
      T.eq('execution: Manage trees and New tree are in Logic trees, not Current step', [await lt.getByRole('button', { name: 'Manage trees', exact: true }).count(), await lt.getByRole('button', { name: 'New tree' }).count(), await p.locator('[data-k="current-step"]').getByRole('button', { name: 'Manage trees', exact: true }).count(), await p.locator('[data-k="current-step"]').getByRole('button', { name: 'New tree' }).count()], [1, 1, 0, 0]);
      const trees = lt.locator('button.step-tree');
      const n = await trees.count();
      T.ok(n >= 2, 'execution: the trees are in it (' + n + ')');
      const pick = trees.nth(1), name = (await pick.locator('.strong').innerText()).trim();
      await pick.click();
      await p.waitForTimeout(300);
      T.eq('execution: picking one there opens it in the logic tree below', [await pick.getAttribute('aria-pressed'), (await p.locator('[data-k="etb"] .h2, [data-k="etb"] h2').first().innerText()).trim() === 'Logic tree', (await p.locator('[data-k="etb"]').innerText()).includes(name)], ['true', true, true]);
    }
    T.eq(app + ': no errors', clean(r), []);
    await r.close();
  }
});

add('Sales: no Experiments tab; a link to it opens the Overview, and the stored logic tree is kept', async () => {
  /* November 3: Sales' board leaves out the current step and the logic tree. Its Overview has no Current step card,
     a link naming the Experiments tab opens the Overview, and the document's stored tree stays as it was. */
  const before = JSON.stringify((((await broker.get('BIZ-DIV-BD')).doc || {}).etbTrees || {})['OBJ-BD-2026Q4-01'] || null);
  T.ok(before !== 'null', 'sales: the seed holds a logic tree for the pilot objective');
  const r = await page(FILES.sales + '?division=DIV-BD&objective=OBJ-BD-2026Q4-01&tab=exp');
  await waitText(r, 'Loaded ');
  const p = r.page;
  const tabs = (await p.locator('[aria-label="Objective sections"]').getByRole('button').allInnerTexts()).map((t) => t.trim());
  T.eq('sales: the tabs, no Experiments', tabs, ['Overview', 'Key results', 'Stage-gates', 'Kanban', 'Risks']);
  T.eq('sales: ?tab=exp opens the Overview', await p.locator('[aria-label="Objective sections"] [aria-current="page"]').innerText().then((t) => t.trim()), 'Overview');
  T.eq('sales: no Current step card, no logic tree, nothing about experiments', [await p.locator('[data-k="ov-step"]').count(), await p.locator('[data-k="etb"]').count(), await p.locator('[data-k="current-step"]').count(), await p.getByText('Open experiments').count(), await p.getByText('Record outcome').count()], [0, 0, 0, 0, 0]);
  T.ok((await p.locator('.ov-three > [data-k]').count()) === 2, 'sales: Latest readings and Initiative metrics side by side');
  for (const t of ['Key results', 'Stage-gates', 'Kanban', 'Risks', 'Overview']) await p.getByRole('button', { name: t, exact: true }).click();
  T.eq('sales: going through every tab writes nothing', stateWrites(r).length, 0);
  T.eq('sales: the stored tree is as it was', JSON.stringify((((await broker.get('BIZ-DIV-BD')).doc || {}).etbTrees || {})['OBJ-BD-2026Q4-01'] || null), before);
  T.eq('sales: no errors', clean(r), []);
  await r.close();
});

add('Execution: the logic tree goes full screen and back', async () => {
  for (const [app, q] of [['execution', '?objective=OBJ-EL-2026Q4-01']]) {   // Sales has no logic tree since November 3
    const r = await page(FILES[app] + q);
    await waitText(r, 'Loaded ');
    const p = r.page;
    await p.getByRole('button', { name: 'Experiments', exact: true }).click();
    await p.waitForSelector('[data-k="etb"]');
    const btn = p.locator('[data-k="etb-full"]');
    /* the panel: full screen or not, covering the window, the browser's own full screen, the page behind held still,
       the graph's height, and what's on top at the window's top edge */
    const state = () => p.evaluate(() => {
      const el = document.querySelector('[data-k="etb"]'), b = el.getBoundingClientRect(), g = el.querySelector('.etb-gwrap');
      const t = document.elementFromPoint(innerWidth / 2, 6);
      return {
        full: /\betb-full\b/.test(el.className),
        covers: Math.round(b.left) === 0 && Math.round(b.top) === 0 && Math.round(b.right) === innerWidth && Math.round(b.bottom) === innerHeight,
        fs: !!document.fullscreenElement, locked: getComputedStyle(document.documentElement).overflow === 'hidden',
        gh: g ? Math.round(g.getBoundingClientRect().height) : 0, onTop: !!(t && t.closest('[data-k="etb"]')),
        /* the graph and its legend reach the bottom of the panel's body (nothing left over) */
        gap: (() => { const body = el.querySelector('.etb-body'), leg = el.querySelector('.etb-legend'); if (!body || !leg) return null; return Math.abs(Math.round(body.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(body).paddingBottom) || 0) - leg.getBoundingClientRect().bottom)); })()
      };
    });
    T.eq(app + ': a Full screen button in the logic tree\'s header', [await btn.count(), await btn.getAttribute('aria-label')], [1, 'Full screen']);
    await btn.click();
    await p.waitForTimeout(500);
    let st = await state();
    T.eq(app + ': full screen: the tree covers the window, the browser goes full screen, the page behind holds still', [st.full, st.covers, st.fs, st.locked, st.onTop], [true, true, true, true, true]);
    T.ok(st.gh > 560 && st.gap <= 1, app + ': the graph takes the height that\'s left (' + st.gh + ' px, ' + st.gap + ' px to spare)');
    T.eq(app + ': the button says how to leave', [(await btn.textContent()).trim(), await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-k'))], ['Exit full screen', 'etb-full']);
    await p.locator('[data-k="etb"] button.etb-gn').first().click();
    await p.waitForSelector('aside[aria-label="Editor"]');
    T.ok(await p.evaluate(() => { const a = document.querySelector('aside[aria-label="Editor"]').getBoundingClientRect(); const t = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2); return !!(t && t.closest('aside[aria-label="Editor"]')); }), app + ': an experiment opens over it');
    await p.locator('aside[aria-label="Editor"] .sh-head').getByRole('button', { name: 'Close' }).click();
    st = await state();
    T.eq(app + ': closing the experiment leaves full screen as it was', [st.full, st.fs], [true, true]);
    await btn.click();
    await p.waitForTimeout(400);
    st = await state();
    T.eq(app + ': Exit full screen: back in the page, the browser too, and the page scrolls again', [st.full, st.covers, st.fs, st.locked], [false, false, false, false]);
    /* leaving the browser's full screen (what Esc does there) leaves the tree's too */
    await btn.click();
    await p.waitForTimeout(400);
    await p.evaluate(() => document.exitFullscreen());
    await p.waitForTimeout(400);
    st = await state();
    T.eq(app + ': leaving the browser\'s full screen leaves it too', [st.full, st.fs, st.locked], [false, false, false]);
    /* where the browser can't go full screen (a Confluence embed, a phone): the tree still fills the window; Escape ends it */
    await p.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => false }));
    await btn.click();
    await p.waitForTimeout(300);
    st = await state();
    T.eq(app + ': no browser full screen: the tree still fills the window', [st.full, st.covers, st.fs], [true, true, false]);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    T.eq(app + ': Escape ends it', (await state()).full, false);
    T.eq(app + ': nothing written', stateWrites(r).length, 0);
    T.eq(app + ': no errors', clean(r), []);
    await r.close();
  }
});

add('Execution: the logic tree graph zooms with the wheel and moves when dragged, as the old graph did', async () => {
  /* October 22: the Calm graph (October 14) had lost what Cytoscape gave the old one: the wheel zooms around the
     pointer (at Cytoscape's rate, ten times for 250 px), dragging the background moves the graph, two fingers pinch.
     An experiment still drags itself and still opens. In the panel and in full screen; the page never scrolls. */
  for (const [app, q] of [['execution', '?objective=OBJ-EL-2026Q4-01']]) {   // Sales has no logic tree since November 3
    const r = await page(FILES[app] + q, { context: { hasTouch: true } });
    await waitText(r, 'Loaded ');
    const p = r.page;
    await p.getByRole('button', { name: 'Experiments', exact: true }).click();
    await p.waitForSelector('[data-k="etb"] .etb-gwrap');
    await p.evaluate(() => { const b = document.querySelector('[data-k="etb"]').getBoundingClientRect(); window.scrollTo(0, b.top + scrollY - 40); });
    await p.waitForTimeout(200);
    /* the view as drawn: the shift and zoom, the page's scroll, an experiment's middle and offset, the editor */
    const view = (label) => p.evaluate((label) => {
      const w = document.querySelector('[data-k="etb"] .etb-gwrap'), c = w.querySelector('.etb-gcanvas');
      const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(c.style.transform) || [];
      const n = label ? Array.from(w.querySelectorAll('button.etb-gn')).find((b) => b.getAttribute('aria-label') === label) : null;
      const nb = n ? n.getBoundingClientRect() : null;
      return { x: +m[1], y: +m[2], z: +m[3], page: Math.round(scrollY), node: nb ? [nb.left + nb.width / 2, nb.top + nb.height / 2] : null, style: n ? n.getAttribute('style') : null, editor: !!document.querySelector('aside[aria-label="Editor"]'), moving: /\betb-panning\b/.test(w.className) };
    }, label);
    /* an experiment wholly inside the area */
    const pickNode = () => p.evaluate(() => {
      const w = document.querySelector('[data-k="etb"] .etb-gwrap'), a = w.getBoundingClientRect();
      const n = Array.from(w.querySelectorAll('button.etb-gn')).find((b) => { const q = b.getBoundingClientRect(); return q.left > a.left + 4 && q.right < a.right - 4 && q.top > a.top + 4 && q.bottom < a.bottom - 4; });
      return n ? n.getAttribute('aria-label') : null;
    });
    /* a spot on the background with background gap px to its right too (a finger on an experiment drags it) */
    const bgSpot = (gap) => p.evaluate((gap) => {
      const w = document.querySelector('[data-k="etb"] .etb-gwrap'), a = w.getBoundingClientRect();
      const bg = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && w.contains(t) && !t.closest('button'); };
      for (let y = a.top + 30; y < a.bottom - 30; y += 11) for (let x = a.left + 60; x < a.right - 60 - gap; x += 13) if (bg(x, y) && bg(x + gap, y) && bg(x + gap / 2, y)) return [x, y];
      return null;
    }, gap);
    const fit = async () => { await p.locator('[data-k="etb"]').getByRole('button', { name: 'Fit', exact: true }).click(); await p.waitForTimeout(150); };
    const near = (a, b, d) => Math.abs(a[0] - b[0]) <= d && Math.abs(a[1] - b[1]) <= d;
    const wheelAtNode = async (where) => {
      const label = await pickNode();
      const v0 = await view(label);
      await p.mouse.move(v0.node[0], v0.node[1]);
      await p.mouse.wheel(0, -100);
      await p.waitForTimeout(250);
      const v1 = await view(label);
      T.ok(Math.abs(v1.z / v0.z - Math.pow(10, 0.4)) < 0.01 || v1.z === 2.5, app + where + ': one wheel notch zooms in as the old graph did (' + Math.round(v0.z * 100) + '% to ' + Math.round(v1.z * 100) + '%)');
      T.ok(near(v1.node, v0.node, 2), app + where + ': the experiment under the pointer stays under it (' + [v1.node[0] - v0.node[0], v1.node[1] - v0.node[1]].map((d) => d.toFixed(1)) + ' px)');
      T.eq(app + where + ': the page doesn\'t scroll', v1.page, v0.page);
      await p.mouse.wheel(0, 100);
      await p.waitForTimeout(250);
      const v2 = await view(label);
      T.ok(Math.abs(v2.z - v0.z) < 0.002 || v1.z === 2.5, app + where + ': a notch back out returns it');
    };
    await wheelAtNode('');
    /* dragging the background moves the graph, opens nothing and selects no text (it starts on a label where
       there is one) */
    await fit();
    const spot = (await p.evaluate(() => {
      const w = document.querySelector('[data-k="etb"] .etb-gwrap'), a = w.getBoundingClientRect();
      for (let y = a.top + 12; y < a.bottom - 12; y += 7) for (let x = a.left + 12; x < a.right - 12; x += 9) {
        const t = document.elementFromPoint(x, y);
        if (t && w.contains(t) && !t.closest('button') && Array.from(t.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())) return [x, y];
      }
      return null;
    })) || await bgSpot(0);
    const d0 = await view(null);
    await p.mouse.move(spot[0], spot[1]);
    await p.mouse.down();
    await p.mouse.move(spot[0] - 60, spot[1] - 40, { steps: 6 });
    const dm = await view(null);
    await p.mouse.up();
    await p.waitForTimeout(200);
    const d1 = await view(null);
    T.ok(Math.abs(d1.x - d0.x + 60) < 0.11 && Math.abs(d1.y - d0.y + 40) < 0.11 && d1.z === d0.z, app + ': dragging the background by (-60, -40) moves the graph with it');
    T.eq(app + ': a grabbing hand while it moves; nothing opened or selected, the page still', [dm.moving, d1.moving, d1.editor, await p.evaluate(() => String(getSelection())), d1.page], [true, false, false, '', d0.page]);
    /* what moves past the area's edge is hidden by it */
    await fit();
    const top = await p.evaluate(() => {
      const w = document.querySelector('[data-k="etb"] .etb-gwrap'), a = w.getBoundingClientRect();
      const n = Array.from(w.querySelectorAll('button.etb-gn')).sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0];
      const b = n.getBoundingClientRect();
      return { label: n.getAttribute('aria-label'), lift: Math.ceil(b.top + b.height / 2 - a.top) + 30 };
    });
    const sp2 = await bgSpot(0);
    await p.mouse.move(sp2[0], sp2[1]);
    await p.mouse.down();
    await p.mouse.move(sp2[0], sp2[1] - top.lift, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(150);
    T.ok(await p.evaluate((label) => {
      const w = document.querySelector('[data-k="etb"] .etb-gwrap'), n = Array.from(w.querySelectorAll('button.etb-gn')).find((b) => b.getAttribute('aria-label') === label);
      const b = n.getBoundingClientRect(), t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return b.top + b.height / 2 < w.getBoundingClientRect().top && !(t && w.contains(t));
    }, top.label), app + ': moved up past the area\'s top, an experiment is hidden, not drawn over the page');
    /* an experiment still drags itself, and still opens */
    await fit();
    const label = await pickNode();
    const n0 = await view(label);
    await p.mouse.move(n0.node[0], n0.node[1]);
    await p.mouse.down();
    await p.mouse.move(n0.node[0] + 40, n0.node[1] + 20, { steps: 5 });
    await p.mouse.up();
    await p.waitForTimeout(200);
    const n1 = await view(label);
    T.ok(near([n1.node[0] - n0.node[0], n1.node[1] - n0.node[1]], [40, 20], 1) && n1.x === n0.x && n1.y === n0.y && !n1.editor, app + ': an experiment dragged moves itself, not the view, and doesn\'t open');
    await p.locator('[data-k="etb"] button.etb-gn[aria-label="' + label + '"]').click();
    await p.waitForSelector('aside[aria-label="Editor"]');
    T.ok(true, app + ': a click still opens it');
    await p.locator('aside[aria-label="Editor"] .sh-head').getByRole('button', { name: 'Close' }).click();
    await p.locator('[data-k="etb"]').getByRole('button', { name: 'Re-layout', exact: true }).click();
    await p.waitForTimeout(150);
    /* two fingers pinch around the point between them; one finger moves it */
    const cdp = await p.context().newCDPSession(p);
    const tp = await bgSpot(100);
    const cx = tp[0] + 50, cy = tp[1];
    const t0 = await view(null);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 50, y: cy, id: 1 }, { x: cx + 50, y: cy, id: 2 }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 50 - 10 * i, y: cy, id: 1 }, { x: cx + 50 + 10 * i, y: cy, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(200);
    const t1 = await view(null);
    const org = await p.evaluate(() => { const w = document.querySelector('[data-k="etb"] .etb-gwrap'), b = w.getBoundingClientRect(); return [b.left + w.clientLeft, b.top + w.clientTop]; });
    const under = (v) => [(cx - org[0] - v.x) / v.z, (cy - org[1] - v.y) / v.z];
    T.ok(Math.abs(t1.z / t0.z - 2) < 0.01 && near(under(t1), under(t0), 0.5) && t1.page === t0.page, app + ': two fingers going from 100 to 200 px apart: twice the zoom, around the point between them');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 3 }] });
    for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 10 * i, y: cy + 5 * i, id: 3 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(200);
    const t2 = await view(null);
    T.ok(Math.abs(t2.x - t1.x - 40) < 0.11 && Math.abs(t2.y - t1.y - 20) < 0.11 && t2.page === t1.page && !t2.editor, app + ': one finger moves it');
    await cdp.detach();
    /* full screen: + zooms around the middle of the bigger area (measured, not remembered from the panel), and the
       same wheel */
    await fit();
    await p.locator('[data-k="etb-full"]').click();
    await p.waitForTimeout(500);
    const midOf = (v) => p.evaluate((v) => { const w = document.querySelector('[data-k="etb"] .etb-gwrap'); return [(w.clientWidth / 2 - v.x) / v.z, (w.clientHeight / 2 - v.y) / v.z]; }, v);
    const f0 = await view(null), m0 = await midOf(f0);
    await p.locator('[data-k="etb"]').getByRole('button', { name: 'Zoom in', exact: true }).click();
    await p.waitForTimeout(150);
    const f1 = await view(null), m1 = await midOf(f1);
    T.ok(Math.abs(f1.z / f0.z - 1.2) < 0.01 && near(m1, m0, 0.5), app + ': full screen: + zooms in around the middle of the area (' + m0.map((d, i) => (m1[i] - d).toFixed(2)) + ')');
    await fit();
    await wheelAtNode(' (full screen)');
    await p.locator('[data-k="etb-full"]').click();
    await p.waitForTimeout(300);
    T.eq(app + ': nothing written', stateWrites(r).length, 0);
    T.eq(app + ': no errors', clean(r), []);
    await r.close();
  }
});

add('Execution: the logic tree\'s Waterfall draws its labels, at its own size, clear of the bars', async () => {
  /* October 22: every label the chart draws from the tree (months, names, dates, outcomes) was missing, because the
     runtime wrapped bound text in an HTML span, which SVG doesn't draw. The chart was also drawn 920 wide and
     stretched to its area, so on a big screen or in full screen its text grew to twice its size. Now it is drawn at
     its area's width (at least 680), every label shows, and a name beside its bar never sits on a bar. */
  for (const [app, q] of [['execution', '?objective=OBJ-EL-2026Q4-01']]) {   // Sales has no logic tree since November 3
    for (const vw of [1440, 1920]) {
      const r = await page(FILES[app] + q, { viewport: { width: vw, height: 1000 } });
      await waitText(r, 'Loaded ');
      const p = r.page;
      const tag = app + ' at ' + vw + ' px';
      await p.getByRole('button', { name: 'Experiments', exact: true }).click();
      await p.waitForSelector('[data-k="etb"]');
      await p.locator('[data-k="etb"]').getByRole('button', { name: 'Waterfall', exact: true }).click();
      await p.waitForSelector('svg.etb-wf');
      await p.waitForTimeout(300);
      /* what the chart shows: its labels drawn, its size against its area's, and what sits on what */
      const look = () => p.evaluate(() => {
        const svg = document.querySelector('svg.etb-wf'), wrap = svg.closest('.etb-wfwrap');
        const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const hit = (a, c) => a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1;
        const texts = Array.from(svg.querySelectorAll('text')).map((t) => ({ el: t, cls: t.getAttribute('class') || '', s: t.textContent, bx: box(t), own: t.closest('g.etb-wf-g') }));
        const boxes = Array.from(svg.querySelectorAll('rect.etb-wf-bar, rect.etb-wf-term')).filter((x) => !/etb-wf-leg/.test(x.nextElementSibling ? x.nextElementSibling.getAttribute('class') || '' : '')).map((x) => ({ g: x.closest('g.etb-wf-g'), bx: box(x) }));
        const over = [];
        texts.forEach((t, i) => {
          if (/etb-wf-leg/.test(t.cls)) return;
          boxes.forEach((b) => {
            if (t.own && b.g === t.own) return;   // a name inside its own bar
            if (/etb-wf-termtext/.test(t.cls) && hit(t.bx, b.bx) && t.bx.l >= b.bx.l - 1 && t.bx.r <= b.bx.r + 1) return;   // an outcome in its box
            if (hit(t.bx, b.bx)) over.push(t.s + ' on a bar');
          });
          texts.forEach((u, j) => { if (j > i && !/etb-wf-leg/.test(u.cls) && hit(t.bx, u.bx)) over.push(t.s + ' on ' + u.s); });
        });
        const lead = svg.querySelector('.etb-wf-lead'), out = svg.querySelector('.etb-wf-out');
        const os = out ? getComputedStyle(out) : null;
        return {
          spans: svg.querySelectorAll('span').length,
          blank: texts.filter((t) => !(t.el.getComputedTextLength() > 0)).map((t) => t.cls),
          all: texts.map((t) => t.s).join(' | '),
          width: Math.round(svg.getBoundingClientRect().width), area: wrap.clientWidth, drawn: Number(svg.getAttribute('width')),
          leadPx: lead ? Math.round(lead.getBoundingClientRect().height) : 0,
          over: over,
          halo: os ? [os.paintOrder.split(' ')[0], os.stroke === getComputedStyle(wrap).backgroundColor] : null
        };
      });
      let v = await look();
      T.eq(tag + ': every label is drawn (none in an HTML span)', [v.spans, v.blank], [0, []]);
      T.ok(/Kick-off/.test(v.all) && /EXP-1 /.test(v.all) && /today/.test(v.all) && / to /.test(v.all), tag + ': names, dates, outcomes and months show');
      T.ok(v.drawn === Math.max(680, v.area) && Math.abs(v.width - v.drawn) <= 1, tag + ': drawn at its area\'s width, not stretched (' + v.drawn + ' in ' + v.area + ')');
      T.ok(v.leadPx >= 11 && v.leadPx <= 18, tag + ': text at its own size (' + v.leadPx + ' px lines)');
      T.eq(tag + ': no label on a bar or another label', v.over, []);
      if (v.halo) T.eq(tag + ': a name beside its bar is edged in the background, so lines pass behind it', v.halo, ['stroke', true]);
      /* full screen: the chart takes the wider area at the same text size */
      await p.locator('[data-k="etb-full"]').click();
      await p.waitForTimeout(600);
      const f = await look();
      T.ok(f.drawn === f.area && f.area > v.area && Math.abs(f.width - f.drawn) <= 1 && f.leadPx === v.leadPx && !f.over.length && !f.blank.length, tag + ': full screen: drawn at the wider area\'s width (' + f.drawn + '), text the same size, nothing overlapping');
      await p.locator('[data-k="etb-full"]').click();
      await p.waitForTimeout(400);
      if (vw === 1440) {
        /* a narrower window: drawn again at the new width */
        await p.setViewportSize({ width: 1200, height: 1000 });
        await p.waitForTimeout(500);
        const n = await look();
        T.ok(n.area < v.area && n.drawn === Math.max(680, n.area) && Math.abs(n.width - n.drawn) <= 1 && !n.over.length, tag + ': a narrower window draws it again at the new width (' + n.drawn + '), nothing overlapping');
        /* a name with room on neither side of its bar is cut short; hovering it shows the whole name */
        const cuts = await p.evaluate(() => Array.from(document.querySelectorAll('svg.etb-wf text.etb-wf-out')).filter((t) => t.querySelector('title')).map((t) => {
          const shown = Array.from(t.childNodes).filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join('');
          return { shown: shown, whole: t.querySelector('title').textContent };
        }));
        T.ok((app === 'sales' ? cuts.length > 0 : true) && cuts.every((c) => /…$/.test(c.shown) && c.whole.indexOf(c.shown.slice(0, -1)) === 0 && c.whole.length > c.shown.length), tag + ': a name cut short ends in … and shows whole on hover (' + cuts.map((c) => c.shown).join(', ') + ')');
        /* an area narrower than 680: the chart stays 680 wide, at its text size, and the area scrolls sideways */
        await p.setViewportSize({ width: 1000, height: 1000 });
        await p.waitForTimeout(500);
        const m = await look(), sc = await p.evaluate(() => { const w = document.querySelector('svg.etb-wf').closest('.etb-wfwrap'); return w.scrollWidth > w.clientWidth; });
        T.ok(m.area < 680 && m.drawn === 680 && Math.abs(m.width - 680) <= 1 && sc && m.leadPx === v.leadPx, tag + ': an area narrower than 680 (' + m.area + ') scrolls; the chart stays 680 wide, text the same size');
        await p.setViewportSize({ width: 1200, height: 1000 });
        await p.waitForTimeout(300);
        /* a bar still opens its experiment */
        await p.locator('svg.etb-wf g.etb-wf-g').first().click();
        await p.waitForSelector('aside[aria-label="Editor"]');
        T.ok(true, tag + ': a bar opens its experiment');
        await p.locator('aside[aria-label="Editor"] .sh-head').getByRole('button', { name: 'Close' }).click();
      }
      T.eq(tag + ': nothing written', stateWrites(r).length, 0);
      T.eq(tag + ': no errors', clean(r), []);
      await r.close();
    }
  }
});

add('Execution and Sales: a KPI reading posted on the Overview\'s review table saves', async () => {
  /* October 19: KPI and target rows take readings with the KPI table's own controls */
  for (const [app, obj, docId, name, value, kpiId, unit] of [
    ['execution', 'OBJ-EL-2026Q4-01', 'EXEC-DIV-EL', 'H₂ in O₂', '0.51', 'KPI-EL-2026Q4-01-3-1', '%'],
    ['sales', 'OBJ-BD-2026Q4-01', 'BIZ-DIV-BD', 'Qualified pipeline value', '4.05', 'KPI-BD-2026Q4-01-2-1', ' $M']]) {
    const r = await page(FILES[app] + '?objective=' + obj);
    await waitText(r, 'Loaded ');
    const rv = r.page.locator('[data-k="review"]');
    const ex = rv.getByRole('button', { name: 'Expand all' });
    if (await ex.count()) await ex.click();
    const val = rv.getByRole('button', { name: 'Post a reading for ' + name, exact: true });
    await val.click();
    const input = rv.getByLabel('New value for ' + name);
    await input.fill(value);
    await input.press('Enter');
    await waitText(r, 'Reading posted.');
    await live.waitFor(async () => puts(r).some((x) => x.path === '/state/' + docId && x.status === 200), { timeout: 10000, what: app + ': the PUT of ' + docId });
    const u = (((await broker.get(docId)).doc.kpiUpdates) || []).filter((x) => x.kpiId === kpiId).slice(-1)[0] || {};
    T.eq(app + ': the reading is on the broker', u.value, Number(value));
    T.eq(app + ': the row shows it', (await val.innerText()).trim(), value + unit);
    T.eq(app + ': no errors', clean(r), []);
    await r.close();
  }
});

add('Execution: a pulled KPI saves, reads other divisions\' documents, and every reader agrees', async () => {
  /* October 19 (mods/pull): the CTO adds the average of every objective score on an Electrolyzer key result (the
     CTO starts on every division, R&D and business alike). It saves with what it pulls; its value reads Fuel Cell's
     and Sales' documents too; a fresh page and the engine alone (as the Hub reads it, from the broker's documents
     and today's date) agree. Nothing else is written. */
  const RD = require(path.join(REPO, 'rdcore.js'));
  const r = await page(FILES.execution + '?objective=OBJ-EL-2026Q4-01&tab=krs');
  await waitText(r, 'Loaded ');
  const p = r.page;
  const before = r.log.broker.length;
  await p.locator('[data-k="KR-EL-2026Q4-01-1"] button.kr-main').click();
  const kt = p.locator('[data-k="kpi-t:keyResult:KR-EL-2026Q4-01-1"]');
  await kt.getByRole('button', { name: 'Add KPI' }).click();
  const ed = p.locator('aside[aria-label="Editor"]');
  await ed.getByRole('button', { name: 'Pulled from other work' }).click();
  await ed.getByRole('button', { name: 'Add KPI', exact: true }).click();
  await waitText(r, 'KPI added.');
  await live.waitFor(async () => puts(r, before).some((x) => x.path === '/state/EXEC-DIV-EL' && x.status === 200), { timeout: 10000, what: 'the PUT of EXEC-DIV-EL' });
  T.eq('only Electrolyzer\'s document is written', [...new Set(stateWrites(r, before).map((x) => x.path))], ['/state/EXEC-DIV-EL']);
  const doc = (await broker.get('EXEC-DIV-EL')).doc;
  const k = (doc.kpis || []).find((x) => x.pull);
  T.ok(!!k, 'the pulled KPI is on the broker');
  if (!k) { await r.close(); return; }
  T.eq('with what it pulls', [k.hostType, k.hostId, k.targetType, k.statistic, k.target, k.unit, k.pull.each, k.pull.measure, k.pull.scope.div, k.pull.scope.quarter, k.pull.follow, k.pull.by],
    ['keyResult', 'KR-EL-2026Q4-01-1', 'statistical', 'average', 80, '%', 'objective', 'score', 'all', 'current', true, CTO.email]);
  /* the engine alone over the broker's documents: every division's objectives this quarter, never its own */
  const P = (await broker.get('portfolio')).doc, docs = {};
  for (const d of P.divisions || []) { const g = await broker.get((RD.divisionKind(d) === 'biz' ? 'BIZ-' : 'EXEC-') + d.id).catch(() => null); if (g && g.doc) docs[d.id] = g.doc; }
  const em = RD.withPortfolio(P, docs);
  const now = new Date(), q = now.getUTCFullYear() + 'Q' + (Math.floor(now.getUTCMonth() / 3) + 1);
  const objs = (P.objectives || []).filter((o) => docs[o.divisionId] && o.quarter === q && o.id !== 'OBJ-EL-2026Q4-01');
  const xs = objs.map((o) => RD.objectiveScore(o.id, em)).filter((x) => x != null);
  T.ok(objs.some((o) => o.divisionId === 'DIV-FC') && objs.some((o) => o.divisionId === 'DIV-BD') && xs.length >= 2, 'it reads Fuel Cell\'s and Business Development\'s objectives too (' + objs.map((o) => o.id).join(', ') + ')');
  const want = Math.round(10 * xs.reduce((a, x) => a + x, 0) / xs.length) / 10 + '%';
  const row = kt.locator('.kpi-row', { hasText: k.name });
  T.eq('the row', (await row.getByRole('button', { name: 'Readings for ' + k.name }).innerText()).trim(), want);
  const page1 = (await p.locator('nav[aria-label="Objectives"] button', { hasText: 'Qualify the 10-cell' }).innerText()).match(/\d+\s*$/);
  const engine = RD.objectiveScore('OBJ-EL-2026Q4-01', em);
  T.eq('the objective\'s score, here and from the engine alone', page1 ? Number(page1[0]) : null, Math.round(engine));
  await settled(r);
  await r.close();
  /* a fresh page reads it the same, and loading writes nothing */
  const r2 = await page(FILES.execution + '?objective=OBJ-EL-2026Q4-01&tab=krs');
  await waitText(r2, 'Loaded ');
  await r2.page.locator('[data-k="KR-EL-2026Q4-01-1"] button.kr-main').click();
  const v2 = r2.page.locator('[data-k="kpi-t:keyResult:KR-EL-2026Q4-01-1"]').getByRole('button', { name: 'Readings for ' + k.name });
  T.eq('a fresh page shows the same value', (await v2.innerText()).trim(), want);
  await v2.click();
  T.ok(await has(r2, 'Pulls each objective’s score: every division'), 'and what it pulled');
  T.eq('loading wrote nothing', stateWrites(r2).length, 0);
  T.eq('no errors', clean(r).concat(clean(r2)), []);
  await r2.close();
  /* a lead elsewhere: values only */
  const r3 = await page(FILES.execution + '?objective=OBJ-EL-2026Q4-01&tab=krs', { hubSession: { email: 'erin@celadyne.com', orgRole: 'lead' } });
  await waitText(r3, 'Loaded ');
  await r3.page.locator('[data-k="KR-EL-2026Q4-01-1"] button.kr-main').click();
  T.eq('Fuel Cell\'s lead gets no menu on it', await r3.page.getByRole('button', { name: 'Actions for ' + k.name }).count(), 0);
  T.eq('no errors (lead)', clean(r3), []);
  await r3.close();
});

add('Sales: a pulled KPI reaches Execution\'s objectives', async () => {
  /* October 19, Corey: "KPIs adding in the sales app cannot see objectives in the execution app. I need to be able to
     reference any objective, regardless of division or business unit." The CTO adds, on a Business Development key
     result, the average of Fuel Cell's objective scores: Sales lists Execution's divisions, reads their documents,
     and writes only its own. */
  const RD = require(path.join(REPO, 'rdcore.js'));
  /* October 20: the live portfolio holds each objective's owner as one email, not a list, and the sheet came up
     blank on it ("clicking pull from other work yields a white window"); hold them that way here, then put them back */
  const owners0 = {};
  ((await broker.get('portfolio')).doc.objectives || []).forEach((o) => { owners0[o.id] = o.owner; });
  await broker.saveAs('portfolio', (doc) => { (doc.objectives || []).forEach((o) => { if (Array.isArray(o.owner)) o.owner = o.owner.length ? String(o.owner[0]) : ''; }); return doc; });
  try {
    const r = await page(FILES.sales + '?objective=OBJ-BD-2026Q4-01&tab=krs');
    await waitText(r, 'Loaded ');
    const p = r.page;
    const before = r.log.broker.length;
    await p.locator('[data-k="KR-BD-2026Q4-01-2"] button.kr-main').click();
    const kt = p.locator('[data-k="kpi-t:keyResult:KR-BD-2026Q4-01-2"]');
    await kt.getByRole('button', { name: 'Add KPI' }).click();
    const ed = p.locator('aside[aria-label="Editor"]');
    await ed.getByRole('button', { name: 'Pulled from other work' }).click();
    const div = ed.locator('label.fld', { has: p.locator('span.lab', { hasText: /^Division$/ }) }).locator('select');   // its name reads the choice too
    T.eq('the CTO starts on every division', await div.inputValue(), 'all');
    T.eq('Execution\'s divisions are listed, with their unit', [await div.locator('option[value="DIV-FC"]').count(), await div.locator('option[value="DIV-EL"]').count(), await div.locator('option[value="unit:UNIT-TECHNI"]').count()], [1, 1, 1]);
    const own = ed.locator('label.fld', { has: p.locator('span.lab', { hasText: /^Owner$/ }) }).locator('select');
    T.eq('owners held as one email are listed, Execution\'s too', await own.locator('option[value="maya@celadyne.com"]').count(), 1);
    await div.selectOption('DIV-FC');
    await ed.getByRole('button', { name: 'Add KPI', exact: true }).click();
    await waitText(r, 'KPI added.');
    await live.waitFor(async () => puts(r, before).some((x) => x.path === '/state/BIZ-DIV-BD' && x.status === 200), { timeout: 10000, what: 'the PUT of BIZ-DIV-BD' });
    T.eq('only Business Development\'s document is written', [...new Set(stateWrites(r, before).map((x) => x.path))], ['/state/BIZ-DIV-BD']);
    const k = ((await broker.get('BIZ-DIV-BD')).doc.kpis || []).find((x) => x.pull);
    T.ok(!!k, 'the pulled KPI is on the broker');
    if (!k) { await r.close(); return; }
    T.eq('pulling Fuel Cell\'s objectives', [k.pull.each, k.pull.measure, k.pull.scope.div, k.pull.scope.quarter], ['objective', 'score', 'DIV-FC', 'current']);
    /* the engine alone over the broker's documents */
    const P = (await broker.get('portfolio')).doc, docs = {};
    for (const d of P.divisions || []) { const g = await broker.get((RD.divisionKind(d) === 'biz' ? 'BIZ-' : 'EXEC-') + d.id).catch(() => null); if (g && g.doc) docs[d.id] = g.doc; }
    const em = RD.withPortfolio(P, docs);
    const now = new Date(), q = now.getUTCFullYear() + 'Q' + (Math.floor(now.getUTCMonth() / 3) + 1);
    const objs = (P.objectives || []).filter((o) => o.divisionId === 'DIV-FC' && o.quarter === q);
    const xs = objs.map((o) => RD.objectiveScore(o.id, em)).filter((x) => x != null);
    T.ok(xs.length >= 2, 'Fuel Cell\'s objectives this quarter (' + objs.map((o) => o.id).join(', ') + ')');
    const want = Math.round(10 * xs.reduce((a, x) => a + x, 0) / xs.length) / 10 + '%';
    T.eq('the row', (await kt.locator('.kpi-row', { hasText: k.name }).getByRole('button', { name: 'Readings for ' + k.name }).innerText()).trim(), want);
    await settled(r);
    T.eq('no errors', clean(r), []);
    await r.close();
  } finally {
    await broker.saveAs('portfolio', (doc) => { (doc.objectives || []).forEach((o) => { if (Object.prototype.hasOwnProperty.call(owners0, o.id)) o.owner = owners0[o.id]; }); return doc; });
  }
});

add('Execution and Sales: a plan revision takes in the delay of a gate that passed late', async () => {
  /* October 20, Corey: "a plan revision should be assumed to already capture the 3d delay or mitigation of it. The
     objective may then have a plan to be back on track pending the due date for the last stage-gate." A drill
     objective in each app: SG1 due 6 days ago passed 3 days ago, SG2 to SG5 chained every 10 days from 10 days out.
     Before, each later gate is pushed 3 days by SG1. Revised (Execution: Revise plan moves SG2 to SG5 out 3 days;
     Sales: Build revised plan from the Stage-gates panel), nothing is pushed, the objective is on schedule, SG1 says
     the plan took its delay in, and the engine alone over the broker's documents agrees. */
  const RD = require(path.join(REPO, 'rdcore.js'));
  const today = Math.floor((Date.now() - Date.UTC(2020, 0, 1)) / 86400000);
  const iso = (d) => new Date(Date.UTC(2020, 0, 1) + d * 86400000).toISOString().slice(0, 10);
  const nowQ = (() => { const t = new Date(Date.UTC(2020, 0, 1) + today * 86400000); return t.getUTCFullYear() + 'Q' + (Math.floor(t.getUTCMonth() / 3) + 1); })();
  const LATER = [2, 3, 4, 5];
  for (const [app, div, key, word] of [['execution', 'DIV-EL', 'EXEC-DIV-EL', 'Plan v2'], ['sales', 'DIV-BD', 'BIZ-DIV-BD', 'The revised plan']]) {
    const OBJ = 'OBJ-DRILL-' + div, WS = 'SGSET-DRILL-' + div, gid = (i) => 'SG-DRILL-' + div + '-' + i;
    await broker.saveAs('portfolio', (doc) => { doc.objectives.push({ id: OBJ, divisionId: div, initiativeId: null, quarter: nowQ, statement: 'Revision drill', owner: ['corey@celadyne.com'],
      plannedStart: today - 30, plannedEnd: today + 60, milestoneIds: [], productId: null, modelId: null, order: 99 }); return doc; });
    await broker.saveAs(key, (doc) => {
      doc.stageGateSets = (doc.stageGateSets || []).concat([{ id: WS, objectiveId: OBJ, name: 'Pilot', order: 1, chained: true }]);
      [[-6, -3], [10], [20], [30], [40]].forEach(([pd, ad], i) => doc.stageGates.push({ id: gid(i + 1), objectiveId: OBJ, setId: WS, name: 'Drill gate ' + (i + 1), intention: null, gate_id: null,
        plannedDate: today + pd, actualDate: ad == null ? null : today + ad, status: ad == null ? 'pending' : 'passed', order: i }));
      return doc;
    });
    const r = await page(FILES[app] + '?objective=' + OBJ + '&tab=gates');
    await waitText(r, 'Loaded ');
    const p = r.page;
    await waitText(r, 'Drill gate 5');
    T.eq(app + ': before, SG2 to SG5 are each pushed 3 days by SG1', ((await r.text()).match(/Pushed 3 days by SG-A1/g) || []).length, 4);
    const before = r.log.broker.length;
    if (app === 'execution') {
      await p.locator('[data-k="gates-history"]').getByRole('button', { name: 'Revise plan' }).click();
      const ed = p.locator('aside[aria-label="Editor"]');
      for (const i of LATER) await ed.getByLabel('Planned date, Drill gate ' + i, { exact: true }).fill(iso(today + 10 * (i - 1) + 3));
      await ed.getByLabel('Why this revision').fill('Gate 1 ran 3 days over.');
      await ed.getByRole('button', { name: 'Commit v2' }).click();
      await waitText(r, 'Revised plan committed as v2.');
    } else {
      await p.locator('[data-k="gates-panel"]').getByRole('button', { name: 'Build revised plan' }).click();
      const ed = p.locator('aside[aria-label="Editor"]');
      for (const i of LATER) await ed.getByLabel('New commitment for SG-A' + i, { exact: true }).fill(iso(today + 10 * (i - 1) + 3));
      await ed.getByRole('button', { name: 'Enact plan revision' }).click();
      await waitText(r, 'Plan revision enacted: 4 gates re-committed.');
    }
    await live.waitFor(async () => puts(r, before).some((x) => x.path === '/state/' + key && x.status === 200), { timeout: 10000, what: app + ': the PUT of ' + key });
    T.eq(app + ': only its own documents are written', [...new Set(stateWrites(r, before).map((x) => x.path))].filter((x) => x !== '/state/portfolio'), ['/state/' + key]);
    await waitText(r, word + ' takes this into account');
    const txt = await r.text();
    T.eq(app + ': nothing is pushed any more', (txt.match(/Pushed \d+ days? by/g) || []).length, 0);
    T.ok(txt.includes('Finished 3 days late'), app + ': SG1 keeps its 3 days');
    T.ok(txt.includes('Delays before it are part of the plan; only new slips count.'), app + ': the head says the plan took the delays in');
    /* the engine alone over the broker's documents */
    const P = (await broker.get('portfolio')).doc, d = (await broker.get(key)).doc;
    const c = RD.cascade(P, RD.withPortfolio(P, { [div]: d }), today);
    T.eq(app + ': the engine alone: SG2 to SG5 on their new dates, on schedule', [LATER.map((i) => c.gateEffective[gid(i)] - today), c.objectiveScheduleSlip[OBJ]], [[13, 23, 33, 43], 0]);
    T.eq(app + ': no errors', clean(r), []);
    await r.close();
  }
});

add('Execution and Sales: views by direct link, editable and read-only', async () => {
  for (const [app, obj, docId, appWord] of [['execution', 'OBJ-EL-2026Q4-02', 'EXEC-DIV-EL', 'Execution'], ['sales', 'OBJ-BD-2026Q4-01', 'BIZ-DIV-BD', 'Sales']]) {
    /* the Overview view: the top label, the head, the score panel and the review table with its headings; no
       sidebar, tabs or app top bar (round 2, October 21) */
    let r = await page(FILES[app] + '?objective=' + obj + '&view=overview');
    const p = r.page;
    await p.waitForSelector('[data-k="review"]');
    T.eq(app + ': no sidebar, app top bar or tabs', [await p.locator('aside[aria-label="Navigation"]').count(), await p.locator('header.top:not([data-k="view-top"])').count(), await p.locator('[aria-label="Objective sections"]').count()], [0, 0, 0]);
    const crumbText = async (pg) => (await pg.locator('[data-k="view-top"] nav').innerText()).replace(/\s+/g, ' ').trim();
    T.ok(new RegExp('^' + appWord + ' / .+ / Q4 2026 / Overview$').test(await crumbText(p)), app + ': the top label: ' + (await crumbText(p)));
    T.eq(app + ': the head and the score panel', [await p.locator('[data-k="objective-head"]').count(), await p.locator('[data-k="score-panel"]').count()], [1, 1]);
    T.eq(app + ': the app\'s five facts and End objective', [await p.locator('.shl-facts .fact').count(), await p.getByRole('button', { name: 'End objective', exact: true }).count()], [5, 1]);
    T.ok(/^Overview – /.test(await p.title()), app + ': the tab title names the view: ' + (await p.title()));
    await live.waitFor(async () => (await p.locator('[data-k="view-status"]').innerText()).includes('Saved'), { timeout: 10000, what: app + ': the top label\'s save state' });
    T.ok((await p.locator('[data-k="view-status"]').innerText()).replace(/\s+/g, ' ').includes('Open in ' + appWord), app + ': the top label opens the app');
    /* the top label sits above the head, across the page, on one line at this width */
    const tb = await p.locator('[data-k="view-top"]').boundingBox(), hb = await p.locator('[data-k="objective-head"]').boundingBox();
    T.ok(tb && hb && tb.y + tb.height <= hb.y && tb.height < 70, app + ': the top label above the head (' + (tb && Math.round(tb.height)) + ' px tall)');
    T.ok(await p.locator('[data-k^="review-sub:ws:"]').count() >= 1 && await p.locator('[data-k^="review-sub:lane:"]').count() >= 1, app + ': workstream and swimlane headings');
    T.eq(app + ': the remembered division is left alone', await p.evaluate(() => localStorage.getItem('rd_division')), null);
    /* a review row opens a new browser tab at its own view, the item highlighted */
    const krLink = p.locator('[data-k="review"] .review-link').first();
    const [popup] = await Promise.all([p.context().waitForEvent('page'), krLink.click()]);
    await popup.waitForLoadState('domcontentloaded');
    T.ok(/[?&]view=krs&item=/.test(popup.url()), app + ': a review row opens its own view in a new tab (' + popup.url().replace(/^[^?]*/, '') + ')');
    await popup.waitForSelector('[data-k="kr-panel"]');
    await live.waitFor(async () => (await popup.locator('.kr-item.is-focus').count()) === 1, { timeout: 10000, what: app + ': the highlighted key result' });
    T.ok(true, app + ': the item is highlighted there');
    T.eq(app + ': this tab stays the Overview view', await p.locator('[data-k="review"]').count(), 1);
    await popup.close();
    T.eq(app + ': no errors (Overview view)', clean(r), []);
    await r.close();
    /* an editable view saves like the app; its panel is the Stage-gates one, with the schedule note, and no End objective */
    r = await page(FILES[app] + '?objective=' + obj + '&view=gates');
    await r.page.waitForSelector('[data-k="gates-panel"]');
    await live.waitFor(async () => (await r.page.locator('[data-k="view-status"]').innerText()).includes('Saved'), { timeout: 10000, what: app + ': loaded' });
    T.ok(/ \/ Stage-gates$/.test(await crumbText(r.page)), app + ': the top label ends in Stage-gates');
    T.eq(app + ': the Stage-gates panel', await r.page.locator('.shl-facts .fact .sub:first-child').allInnerTexts(), ['Stage-gates', 'Gate health', 'Next gate', 'Schedule', 'Open high risk']);
    T.eq(app + ': the schedule note, no End objective', [await r.page.locator('[data-k="plan-active"], [data-k="alarm"]').count(), await r.page.getByRole('button', { name: 'End objective', exact: true }).count()], [1, 0]);
    await r.page.locator('button.chip[aria-label^="Chained:"]').first().click();
    await live.waitFor(async () => puts(r).some((x) => x.path === '/state/' + docId && x.status === 200), { timeout: 10000, what: app + ': the view\'s save' });
    T.eq(app + ': the editable view saved its document only', puts(r).map((x) => x.path + ' ' + x.status), ['/state/' + docId + ' 200']);
    T.ok(((await broker.get(docId)).doc.stageGateSets || []).some((x) => x.objectiveId === obj && x.chained === false), app + ': the change is on the broker');
    T.eq(app + ': no errors (editable view)', clean(r), []);
    await r.close();
    /* a read-only view: a walk of real clicks writes nothing; new tabs it opens are closed as they come */
    r = await page(FILES[app] + '?objective=' + obj + '&view=kanban&readonly');
    await r.page.waitForSelector('[data-k="kb"]');
    r.page.context().on('page', (pg) => { pg.close().catch(() => {}); });
    T.ok((await r.page.locator('[data-k="view-status"]').innerText()).includes('Read-only'), app + ': the top label says Read-only');
    T.eq(app + ': the Kanban panel, no schedule note', [await r.page.locator('.shl-facts .fact .sub:first-child').allInnerTexts(), await r.page.locator('[data-k="plan-active"], [data-k="alarm"]').count()], [['Tiles', 'Stages overdue', 'Next stage due', 'Swimlane deadline'], 0]);
    T.eq(app + ': no editing controls or drag hints', [await r.page.getByRole('button', { name: 'Add tile', exact: true }).count(), await r.page.getByText('Drag a tile between columns').count()], [0, 0]);
    const acted = await walk(r.page, Math.round(STEPS / 2), 71 + app.length);
    await settled(r);
    T.ok(acted > STEPS * 0.1, app + ': the walk acted ' + acted + ' times');
    T.eq(app + ': the read-only view wrote nothing', stateWrites(r).map((x) => x.method + ' ' + x.path), []);
    T.eq(app + ': no errors (read-only view)', clean(r), []);
    await r.close();
  }
  /* a view link whose objective isn't there: a message, nothing else */
  let r = await page(FILES.execution + '?objective=OBJ-NOPE-1&view=krs');
  await waitText(r, 'There is no objective OBJ-NOPE-1 in Execution, so this view has nothing to show.');
  T.eq('unknown objective: no other objective shown', [await r.page.locator('[data-k="kr-panel"]').count(), await r.page.locator('aside[aria-label="Navigation"]').count()], [0, 0]);
  T.eq('unknown objective: no errors', clean(r), []);
  await r.close();
  /* the whole app: "Link to this view" copies the whole address and opens it in a new tab; ?tab= opens a tab */
  r = await page(FILES.execution + '?objective=OBJ-EL-2026Q4-02&tab=kanban');
  await waitText(r, 'Loaded Electrolyzer.');
  T.eq('?tab= opens the app on that tab', await r.page.locator('[data-k="kb"]').count(), 1);
  await r.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await r.page.getByRole('button', { name: 'Link to this view' }).click();
  await r.page.getByRole('group', { name: 'What the link allows' }).getByRole('button', { name: 'Read-only' }).click();
  await r.page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await waitText(r, 'Link copied.');
  const copied = await r.page.evaluate(() => navigator.clipboard.readText());
  T.ok(/^http:\/\/[^/]+\/execution_app\.html\?objective=OBJ-EL-2026Q4-02&view=kanban&readonly$/.test(copied), 'Copy link copies the whole address: ' + copied.replace(/^[^?]*/, ''));
  const [tab2] = await Promise.all([r.page.context().waitForEvent('page'), r.page.getByRole('button', { name: 'Open in a new tab' }).click()]);
  await tab2.waitForSelector('[data-k="kb"]');
  T.eq('the new tab is the read-only Kanban view', [await tab2.locator('aside[aria-label="Navigation"]').count(), (await tab2.locator('[data-k="view-status"]').innerText()).includes('Read-only')], [0, true]);
  await tab2.close();
  T.eq('the whole app wrote nothing', stateWrites(r).length, 0);
  T.eq('no errors (link to this view)', clean(r), []);
  await r.close();
});

add('Execution and Sales open on the current quarter', async () => {
  const d = new Date();
  const NOWQ = d.getFullYear() + 'Q' + (Math.floor(d.getMonth() / 3) + 1);
  const P = (await broker.get('portfolio')).doc;
  for (const app of ['execution', 'sales']) {
    const r = await page(FILES[app]);
    await waitText(r, 'Loaded ');
    /* Execution: the division it remembers; Sales: All divisions (decided October 16), every business division */
    const div = await r.page.evaluate(() => localStorage.getItem('rd_division'));
    if (app === 'sales') T.eq('sales: remembers no division', div, null);
    const biz = P.divisions.filter((d) => d.kind === 'biz').map((d) => d.id);
    const mine = P.objectives.filter((o) => (app === 'sales' ? biz.indexOf(o.divisionId) >= 0 : o.divisionId === div));
    const want = mine.some((o) => o.quarter === NOWQ) ? NOWQ : '';
    T.eq(app + ': the quarter picker opens on ' + (want || 'all quarters'), await r.page.getByLabel('Quarter').inputValue(), want);
    const side = async () => (await r.page.locator('[aria-label="Objectives"]').first().innerText()).replace(/\s+/g, ' ');
    if (want) {
      const s1 = await side();
      T.ok(mine.filter((o) => o.quarter === NOWQ).every((o) => s1.includes(o.statement)), app + ': this quarter\'s objectives are listed');
      T.ok(mine.filter((o) => o.quarter !== NOWQ).every((o) => !s1.includes(o.statement)), app + ': other quarters\' are not');
    }
    await r.page.getByLabel('Quarter').selectOption('');
    await r.page.waitForTimeout(300);
    const s2 = await side();
    T.ok(mine.every((o) => s2.includes(o.statement)), app + ': All quarters lists every objective again');
    T.eq(app + ': no errors', clean(r), []);
    await r.close();
  }
});

/* ---------------------------------------------------------------------------------------------- Sales */
add('Sales opens on All divisions: every business division\'s objectives, by division', async () => {
  const P = (await broker.get('portfolio')).doc;
  const r = await page(FILES.sales);
  const p = r.page;
  await waitText(r, 'Loaded all business divisions.');
  T.eq('remembers no division', await p.evaluate(() => localStorage.getItem('rd_division')), null);
  const pick = p.locator('button.shl-pick');
  T.ok((await pick.innerText()).includes('All divisions'), 'the picker says All divisions');
  await p.getByLabel('Quarter').selectOption('');
  await p.waitForTimeout(300);
  const side = async () => (await p.locator('[aria-label="Objectives"]').first().innerText()).replace(/\s+/g, ' ');
  const s1 = await side();
  const biz = P.divisions.filter((d) => d.kind === 'biz');
  T.ok(biz.length > 1 && biz.every((d) => s1.includes(d.name)), 'every business division heads the list: ' + s1);
  T.ok(P.objectives.filter((o) => biz.some((d) => d.id === o.divisionId)).every((o) => s1.includes(o.statement)), 'every business objective is listed');
  await pick.click();
  await p.getByRole('menuitemradio', { name: /Partnerships/ }).click();
  await waitText(r, 'Switched to Partnerships.');
  T.ok((await pick.innerText()).includes('Partnerships'), 'one division on the picker');
  await pick.click();
  await p.getByRole('menuitemradio', { name: 'All divisions' }).click();
  await waitText(r, 'Switched to all divisions.');
  T.eq('still no remembered division', await p.evaluate(() => localStorage.getItem('rd_division')), null);
  T.eq('nothing written', stateWrites(r).map((x) => x.method + ' ' + x.path), []);
  T.eq('no errors', clean(r), []);
  await r.close();
});

add('Sales: recover stranded data, this division first', async () => {
  const r = await page(FILES.sales + '?division=DIV-BD');
  await waitText(r, 'Loaded Business Development.');
  await r.page.getByRole('button', { name: 'Settings' }).click();
  await r.page.getByRole('button', { name: 'Recover stranded execution data' }).click();
  await waitText(r, 'stranded in Partnerships');
  const n0 = r.log.broker.length;
  await r.page.getByRole('button', { name: 'Move it all here' }).click();
  await waitText(r, 'Recovered from Partnerships.');
  const calls = r.log.broker.slice(n0).filter((x) => x.method === 'PUT' || (x.method === 'GET' && x.path === '/state/BIZ-DIV-PT')).map((x) => x.method + ' ' + x.path + ' ' + x.status);
  T.eq('fresh read, this division, then the source', calls, ['GET /state/BIZ-DIV-PT 200', 'PUT /state/BIZ-DIV-BD 200', 'PUT /state/BIZ-DIV-PT 200']);
  const bd = (await broker.get('BIZ-DIV-BD')).doc, pt = (await broker.get('BIZ-DIV-PT')).doc;
  T.ok(bd.keyResults.some((k) => k.objectiveId === 'OBJ-BD-2027Q1-01'), 'moved into BIZ-DIV-BD');
  T.ok(!pt.keyResults.some((k) => k.objectiveId === 'OBJ-BD-2027Q1-01'), 'gone from BIZ-DIV-PT');
  T.eq('no errors', clean(r), []);
  await r.close();
});

add('Sales: a refused write here never touches the source', async () => {
  const r = await page(FILES.sales + '?division=DIV-BD');
  await waitText(r, 'Loaded Business Development.');
  await r.page.getByRole('button', { name: 'Settings' }).click();
  await r.page.getByRole('button', { name: 'Recover stranded execution data' }).click();
  await waitText(r, 'stranded in Partnerships');
  await broker.fail('BIZ-DIV-BD', { mode: 503, ops: 'write' });
  const n1 = r.log.broker.length;
  await r.page.getByRole('button', { name: 'Move it all here' }).click();
  await waitText(r, 'reopen to retry');
  T.eq('one refused write here, none to the source', puts(r, n1).map((x) => x.path + ' ' + x.status), ['/state/BIZ-DIV-BD 502']);
  T.ok((await broker.get('BIZ-DIV-PT')).doc.keyResults.some((k) => k.objectiveId === 'OBJ-BD-2027Q1-01'), 'the source still holds the data');
  await broker.recover();
  await r.close();
});

add('Sales: the kanban drag saves BIZ-DIV-BD only', async () => {
  const r = await page(FILES.sales + '?division=DIV-BD&objective=OBJ-BD-2026Q4-01');
  await waitText(r, 'Loaded Business Development.');
  const p = r.page;
  await p.getByRole('button', { name: 'Kanban', exact: true }).click();
  await p.waitForSelector('[data-k="kb"]');
  /* both ends on screen first: scrolling in the middle of a drag drops it */
  await p.locator('[data-k="kb-cell:lane-ut:col-di"]').scrollIntoViewIfNeeded();
  await p.locator('[data-k="kb-tile:tile-snake"]').scrollIntoViewIfNeeded();
  await p.locator('[data-k="kb-tile:tile-snake"]').dragTo(p.locator('[data-k="kb-cell:lane-ut:col-di"]'));
  await live.waitFor(async () => puts(r).some((x) => x.path === '/state/BIZ-DIV-BD' && x.status === 200), { timeout: 10000, what: 'PUT BIZ-DIV-BD' });
  const b = (await broker.get('BIZ-DIV-BD')).doc.boards.find((x) => x.id === 'BRD-BD-PIPE');
  const t = b && b.tiles.find((x) => x.id === 'tile-snake');
  T.eq('the tile moved on the broker', t && [t.lane, t.col], ['lane-ut', 'col-di']);
  T.eq('only BIZ-DIV-BD written', [...new Set(puts(r).map((x) => x.path))], ['/state/BIZ-DIV-BD']);
  T.eq('no errors', clean(r), []);
  await r.close();
});

/* ---------------------------------------------------------------------------------------------- Product spec */
add('Product spec: an edit, a 412, a merged portfolio save, a poll', async () => {
  const r = await page(FILES.spec + '?division=DIV-EL', { hubSession: LEAD });
  const p = r.page;
  const editor = p.locator('[aria-label="Editor"]');
  await waitText(r, 'Loaded SPEC-DIV-EL.');
  const v0 = (await broker.readDoc('SPEC-DIV-EL')).version;
  await p.getByRole('button', { name: 'Edit spec details' }).click();
  await editor.getByLabel('Target application').fill('Grid PEM electrolysis, 30 bar');
  await editor.getByRole('button', { name: 'Save spec details' }).click();
  await live.waitFor(async () => (await broker.readDoc('SPEC-DIV-EL')).version > v0, { timeout: 15000 });
  T.eq('stored', (await broker.readDoc('SPEC-DIV-EL')).doc.modelSpec['MDL-EL-1-1'].application, 'Grid PEM electrolysis, 30 bar');
  await broker.saveAs('SPEC-DIV-EL', (d) => { d.keyResults.find((k) => k.id === 'KR-EL-1-1-2').statement = 'Specific energy, edited by a teammate'; });
  await p.getByRole('button', { name: 'Edit spec details' }).click();
  await editor.getByLabel('Notes').fill('This change meets a newer save');
  await editor.getByRole('button', { name: 'Save spec details' }).click();
  await waitText(r, 'Another editor saved first — reloaded; re-apply your change.');
  T.ok(!JSON.stringify((await broker.readDoc('SPEC-DIV-EL')).doc).includes('This change meets a newer save'), 'the refused change was not stored');
  await broker.saveAs('portfolio', (P) => { P.initiatives.find((i) => i.id === 'INIT-EL-02').desc = 'Take 20% out of the stack bill of materials.'; });
  await p.getByRole('button', { name: 'Add product KPI' }).click();
  await editor.getByLabel('Name').fill('Stack cost');
  await editor.getByRole('button', { name: 'At most', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Target', exact: true }).fill('1800');
  await editor.getByLabel('Unit').fill('$/kW');
  await editor.getByRole('button', { name: 'Save product KPI' }).click();
  await waitText(r, 'Saved, merged with a change another editor saved first.');
  const P = (await broker.readDoc('portfolio')).doc;
  T.eq('both changes in the stored portfolio', [P.initiatives.find((i) => i.id === 'INIT-EL-02').desc, P.kpis.some((k) => k.name === 'Stack cost')], ['Take 20% out of the stack bill of materials.', true]);
  await broker.saveAs('SPEC-DIV-FC', (d) => { d.modelSpec['MDL-FC-1-1'].notes = 'Hold for the RH sweep.'; });
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitText(r, 'Updated from another editor.');
  T.ok(stateWrites(r).every((x) => WRITES.spec(x.path)), 'wrote only SPEC documents and the portfolio');
  T.eq('no errors', clean(r, /status of 412/), []);
  await r.close();
});

/* ---------------------------------------------------------------------------------------------- walks */
add('Random walks as the CTO: no errors, only allowed documents written, everything saved', async () => {
  for (const app of Object.keys(FILES)) {
    await broker.reset();
    const r = await page(FILES[app]);
    await r.page.waitForLoadState('networkidle');
    await r.page.waitForTimeout(1500);
    const acted = await walk(r.page, STEPS, 7 + app.length);
    await settled(r);
    T.ok(acted > STEPS * 0.3, app + ': the walk acted ' + acted + ' times');
    const w = stateWrites(r);
    T.eq(app + ': wrote only what it may', w.filter((x) => !WRITES[app](x.path)).map((x) => x.path), []);
    T.eq(app + ': every write accepted', w.filter((x) => x.status !== 200).map((x) => x.method + ' ' + x.path + ' ' + x.status), []);
    T.eq(app + ': nothing left unsaved', await r.page.evaluate(() => /Saving…|Not saved|Offline/.test(document.body.innerText)), false);
    T.eq(app + ': no errors', clean(r), []);
    console.log('   ' + app + ': ' + acted + ' actions, ' + w.length + ' writes');
    await r.close();
  }
});

add('View-only people never write documents', async () => {
  for (const [app, who] of [['planning', LEAD], ['planning', IC], ['execution', IC], ['mine', PRIYA]]) {
    await broker.reset();
    const r = await page(FILES[app] + (app === 'execution' ? '?readonly=1' : app === 'mine' ? '?readonly=1&quarter=all' : ''), { hubSession: who });
    await r.page.waitForLoadState('networkidle');
    const acted = await walk(r.page, STEPS, 23 + app.length);
    await settled(r);
    T.ok(acted > STEPS * 0.3, app + ' as ' + who.orgRole + ': the walk acted ' + acted + ' times');
    T.eq(app + ' as ' + who.orgRole + ': nothing written', stateWrites(r).map((x) => x.method + ' ' + x.path), []);
    T.eq(app + ' as ' + who.orgRole + ': no errors', clean(r), []);
    await r.close();
  }
});

/* ---------------------------------------------------------------------------------------------- My Projects */
add('My Projects: a reading and a percent key result save to the objective\'s own document; a 412; links', async () => {
  const r = await page(FILES.mine + '?quarter=all', { hubSession: PRIYA });
  await waitText(r, 'Lock Tera 25-30-R5 components');
  T.ok(await has(r, '1 project: the objective you own, and 3 experiments you run in Toru’s objective.'), 'Priya: her objective and her experiments in Toru’s');
  await r.page.getByRole('button', { name: 'Expand all' }).click();
  const val = r.page.getByRole('button', { name: 'Post a reading for Interfacial contact resistance', exact: true });
  await val.click();
  const input = r.page.getByLabel('New value for Interfacial contact resistance');
  await input.fill('9');
  await input.press('Enter');
  await waitText(r, 'Reading posted.');
  await live.waitFor(async () => puts(r).some((x) => x.path === '/state/EXEC-DIV-EL' && x.status === 200), { timeout: 10000, what: 'the PUT of EXEC-DIV-EL' });
  const doc = (await broker.get('EXEC-DIV-EL')).doc;
  const u = (doc.kpiUpdates || []).filter((x) => x.kpiId === 'KPI-EL-2026Q4-02-3-1').slice(-1)[0] || {};
  T.eq('the reading is on the broker, by her', [u.value, u.by], [9, 'priya@celadyne.com']);
  T.eq('SG-A1 passed on its own', ((doc.stageGates || []).find((g) => g.id === 'SG-EL-2026Q4-02-2') || {}).completionMethod, 'auto');
  T.eq('only EXEC-DIV-EL written', puts(r).map((x) => x.path + ' ' + x.status), ['/state/EXEC-DIV-EL 200']);
  /* the title opens the objective in Execution, in a new tab */
  const link = r.page.locator('a.mine-olink', { hasText: 'Lock Tera 25-30-R5 components' }).first();
  T.eq('the link', [await link.getAttribute('href'), await link.getAttribute('target'), await link.getAttribute('rel')], ['execution_app.html?objective=OBJ-EL-2026Q4-02', '_blank', 'noopener']);
  const [tab] = await Promise.all([r.ctx.waitForEvent('page'), link.click()]);
  await tab.waitForLoadState('load');
  await tab.waitForFunction(() => document.body && document.body.innerText.includes('Loaded Electrolyzer.'), null, { timeout: 20000 });
  T.ok(/execution_app\.html\?objective=OBJ-EL-2026Q4-02$/.test(tab.url()), 'a new tab on Execution, by the objective');
  T.eq('Execution opened that objective', await tab.evaluate(() => (document.querySelector('h1') || {}).textContent || ''), 'Lock Tera 25-30-R5 components');
  await tab.close();
  T.eq('no hand-off left in this tab', await r.page.evaluate(() => sessionStorage.getItem('celadyne-calm-open')), null);
  /* another editor saves first */
  await broker.saveAs('EXEC-DIV-EL', (d) => { d.keyResults.find((k) => k.id === 'KR-EL-2026Q4-02-1').progress = 64; });
  await r.page.getByRole('button', { name: 'Update KR1, % complete' }).click();
  const kr = r.page.getByLabel('New value for KR1, in %');
  await kr.fill('75');
  await kr.press('Enter');
  await waitText(r, 'Another editor saved first — reloaded; re-apply your change.');
  T.ok(puts(r).some((x) => x.path === '/state/EXEC-DIV-EL' && x.status === 412), 'the stale save got 412');
  T.eq('their value on the broker and on the page', [(await broker.get('EXEC-DIV-EL')).doc.keyResults.find((k) => k.id === 'KR-EL-2026Q4-02-1').progress, (await r.page.getByRole('button', { name: 'Update KR1, % complete' }).innerText()).trim()], [64, '64%']);
  await r.page.getByRole('button', { name: 'Update KR1, % complete' }).click();
  await kr.fill('75');
  await kr.press('Enter');
  await waitText(r, 'KR1 set to 75%.');
  await live.waitFor(async () => (await broker.get('EXEC-DIV-EL')).doc.keyResults.find((k) => k.id === 'KR-EL-2026Q4-02-1').progress === 75, { timeout: 10000, what: 'KR1 at 75 on the broker' });
  T.ok(true, 'made again, it saves');
  await r.page.getByRole('button', { name: 'Settings' }).click();
  await waitText(r, 'Load from the broker');
  const st = await r.text();
  T.ok(!/Restore the sample data|Prototype with sample data/.test(st), 'Settings: no sample data');
  T.eq('the token is never on the page', st.includes(broker.token), false);
  T.eq('no errors', clean(r, /status of 412/), []);
  await r.close();
});

add('My Projects: a header opens its view of the objective in a new tab', async () => {
  const r = await page(FILES.mine + '?quarter=all', { hubSession: LEAD });
  await waitText(r, 'Lock Tera 25-30-R5 components');
  const kr = r.page.locator('[data-k="g:OBJ-EL-2026Q4-02:kr"] a.mine-glink');
  T.eq('Key results: its view by direct link', [await kr.getAttribute('href'), await kr.getAttribute('target')], ['execution_app.html?objective=OBJ-EL-2026Q4-02&view=krs', '_blank']);
  const [tab] = await Promise.all([r.ctx.waitForEvent('page'), kr.click()]);
  await tab.waitForLoadState('load');
  await tab.waitForFunction(() => document.body && document.body.innerText.includes('Freeze the porous transport layer spec'), null, { timeout: 20000 });
  T.ok(/execution_app\.html\?objective=OBJ-EL-2026Q4-02&view=krs$/.test(tab.url()), 'a new tab on the Key results view');
  T.ok(await tab.evaluate(() => !document.querySelector('nav[aria-label="Apps"]')), 'a view page: no sidebar');
  await tab.close();
  const rk = r.page.locator('[data-k="g:OBJ-EL-2026Q4-01:risk"] a.mine-glink');
  T.eq('Risks has no view: the app on its tab', await rk.getAttribute('href'), 'execution_app.html?objective=OBJ-EL-2026Q4-01&tab=risks');
  const [t2] = await Promise.all([r.ctx.waitForEvent('page'), rk.click()]);
  await t2.waitForLoadState('load');
  await t2.waitForFunction(() => document.body && document.body.innerText.includes('Loaded Electrolyzer.'), null, { timeout: 20000 });
  T.eq('Execution on the Risks tab', await t2.evaluate(() => { const b = document.querySelector('nav[aria-label="Objective sections"] [aria-current="page"]'); return b ? b.textContent.trim() : ''; }), 'Risks');
  await t2.close();
  T.eq('no hand-off left in this tab', await r.page.evaluate(() => sessionStorage.getItem('celadyne-calm-open')), null);
  T.eq('nothing written', stateWrites(r).map((x) => x.method + ' ' + x.path), []);
  T.eq('no errors', clean(r), []);
  await r.close();
});

add('My Projects: Team Projects for a lead, Sales objectives for Sam', async () => {
  let r = await page(FILES.mine + '?view=team&quarter=all', { hubSession: LEAD });
  await waitText(r, 'Electrolyzer, the team you lead: 2 projects and 3 objectives.');
  T.eq('Team Projects is on', await r.page.getByRole('button', { name: 'Team Projects' }).getAttribute('aria-pressed'), 'true');
  for (const t of ['Qualify the 10-cell short stack for durability testing', 'Lock Tera 25-30-R5 components', 'Cut stack cost 18%']) T.ok(await has(r, t), 'Team Projects: ' + t);
  await r.page.getByRole('button', { name: 'Owned Projects' }).click();
  T.eq('the choice is remembered in this browser', await r.page.evaluate(() => localStorage.getItem('rd_mine_view')), 'owned');
  T.eq('nothing written', stateWrites(r).map((x) => x.method + ' ' + x.path), []);
  T.eq('no errors', clean(r), []);
  await r.close();
  r = await page(FILES.mine + '?quarter=all', { hubSession: { email: 'sam@celadyne.com', orgRole: 'lead' } });
  await waitText(r, 'Close three utility pilot agreements');
  T.eq('a business objective opens in Sales', await r.page.locator('a.mine-olink', { hasText: 'Close three utility pilot agreements' }).first().getAttribute('href'), 'sales_app.html?objective=OBJ-BD-2026Q4-01');
  await r.page.getByRole('button', { name: 'Expand all' }).click();
  const val = r.page.getByRole('button', { name: 'Post a reading for Qualified pipeline value', exact: true });
  await val.click();
  const input = r.page.getByLabel('New value for Qualified pipeline value');
  await input.fill('4.05');
  await input.press('Enter');
  await live.waitFor(async () => puts(r).some((x) => x.path === '/state/BIZ-DIV-BD' && x.status === 200), { timeout: 10000, what: 'the PUT of BIZ-DIV-BD' });
  const u = (((await broker.get('BIZ-DIV-BD')).doc.kpiUpdates) || []).filter((x) => x.kpiId === 'KPI-BD-2026Q4-01-2-1').slice(-1)[0] || {};
  T.eq('the reading is on the broker, by him', [u.value, u.by], [4.05, 'sam@celadyne.com']);
  T.eq('only BIZ-DIV-BD written', puts(r).map((x) => x.path + ' ' + x.status), ['/state/BIZ-DIV-BD 200']);
  T.eq('no errors', clean(r), []);
  await r.close();
});

add('My Projects: the CTO and the CEO choose the divisions in their Team Projects', async () => {
  let r = await page(FILES.mine + '?view=team&quarter=all', { hubSession: CTO });
  /* the lede once the documents are in ("…: 4 projects and 8 objectives."), not the one shown while loading */
  const loaded = () => r.page.waitForFunction(() => /: \d+ projects? and \d+ objectives?\./.test(((document.querySelector('.mine-head .sub') || {}).textContent) || ''), null, { timeout: 20000 });
  const lede = async () => ((await r.page.locator('.mine-head .sub').first().innerText()) || '').trim();
  await loaded();
  T.ok(/^R&D divisions: /.test(await lede()), 'the CTO: the R&D divisions by default');
  await r.page.getByRole('button', { name: 'Change divisions' }).click();
  await r.page.getByRole('radio', { name: /Every division/ }).check();
  await r.page.locator('aside[aria-label="Editor"] .sh-head').getByRole('button', { name: 'Close' }).click();
  await r.page.waitForTimeout(200);
  T.ok(/^Every division: /.test(await lede()), 'every division, once he chooses it');
  await r.page.reload();
  await loaded();
  T.ok(/^Every division: /.test(await lede()), 'kept in this browser after a reload');
  T.eq('nothing written, no /prefs', [stateWrites(r).length, r.log.broker.filter((x) => /^\/prefs\//.test(x.path)).length], [0, 0]);
  T.eq('no errors', clean(r), []);
  await r.close();
  r = await page(FILES.mine + '?view=team&quarter=all', { hubSession: { email: 'dana@celadyne.com', orgRole: 'ceo' } });
  await loaded();
  T.ok(/^Business divisions: /.test(await lede()), 'the CEO: the business divisions by default');
  T.eq('no errors (CEO)', clean(r), []);
  await r.close();
});

add('My Projects: the panel above the tree', async () => {
  const r = await page(FILES.mine + '?view=team&quarter=all', { hubSession: LEAD });
  await r.page.waitForSelector('[data-k="roll"]', { timeout: 20000 });
  const p = r.page;
  T.ok(await p.evaluate(() => { const s = document.querySelector('[data-k="scope"]'); return !!s && !!s.querySelector('select[aria-label="Quarter"]') && !!s.querySelector('[aria-label="View"]'); }), 'the view and the quarter sit beside the title');
  const objs = await p.locator('.mine-row.k-obj').count();
  T.eq('the panel counts the objectives in the tree', (await p.locator('[data-k="roll-objs"] .mine-fv').innerText()).trim(), String(objs));
  T.eq('a timeline row for each', await p.locator('[data-k="roll-timeline"] .mine-tlrow.is-obj').count(), objs);
  const dot = p.locator('[data-k="roll-spread"] .mine-dot').first();
  const name = String(await dot.getAttribute('title')).split(': ')[0];
  const treeTop = () => p.evaluate(() => document.querySelector('[data-k="tree"]').getBoundingClientRect().top);
  const top0 = await treeTop();
  await dot.click();
  await p.waitForTimeout(900);
  T.eq('a dot filters the tree to its objective', [await p.getByLabel('Filter by name').inputValue(), await p.locator('.mine-row.k-obj').count()], [name, 1]);
  const top = await treeTop();
  T.ok(top0 > 400 && top >= -2 && top < 120, 'and scrolls the tree up into view (its top from ' + Math.round(top0) + ' to ' + Math.round(top) + ')');
  await p.getByRole('button', { name: 'Show them below' }).click();
  await p.waitForTimeout(200);
  T.eq('Show them below: every reading due', [await p.getByLabel('Filter by name').inputValue(), await p.locator('.mine-due').getAttribute('aria-pressed')], ['', 'true']);
  const rows0 = await p.locator('[data-k="roll-timeline"] .mine-tlrow').count();
  await p.getByRole('button', { name: 'Fold Tera component lock' }).click();
  T.eq('a project folds on the timeline', await p.locator('[data-k="roll-timeline"] .mine-tlrow').count(), rows0 - 2);
  await p.getByRole('button', { name: 'Open Tera component lock' }).click();
  T.eq('and opens', await p.locator('[data-k="roll-timeline"] .mine-tlrow').count(), rows0);
  const labels = await p.evaluate(() => { const b = Array.from(document.querySelectorAll('.mine-mon > span')).filter((x) => x.textContent.trim()).map((x) => x.getBoundingClientRect()); let n = 0; for (let i = 1; i < b.length; i++) if (b[i].left < b[i - 1].right + 2) n++; return n; });
  T.eq('month labels never overlap', labels, 0);
  T.eq('nothing written', stateWrites(r).map((x) => x.method + ' ' + x.path), []);
  T.eq('no errors', clean(r), []);
  await r.close();
});

add('My Projects: Group and sort arranges the timeline and the tree; the mark is the time elapsed', async () => {
  const r = await page(FILES.mine + '?view=team&quarter=all', { hubSession: CTO });
  await r.page.waitForSelector('[data-k="roll"]', { timeout: 20000 });
  const p = r.page;
  /* Group and sort (round 6's A): a button after the quarter menu; Group by and Sort by only in its popover */
  const btn = p.locator('[data-k="group-sort"]'), pop = p.locator('[data-k="group-sort-pop"]');
  const tinted = async () => /\bon\b/.test(await btn.getAttribute('class'));
  const focusIn = () => p.evaluate(() => { const a = document.activeElement; return a ? (a.closest('[data-k="group-sort-pop"]') ? 'popover' : a.getAttribute('data-k') || a.tagName) : ''; });
  /* where the popover sits: under the button, its right edge on the button's, inside the window, on top of the page */
  const placed = () => p.evaluate(() => {
    const a = document.querySelector('[data-k="group-sort-pop"]').getBoundingClientRect(), b = document.querySelector('[data-k="group-sort"]').getBoundingClientRect();
    const pts = [[a.left + 8, a.top + 8], [a.right - 8, a.top + 8], [a.left + a.width / 2, a.bottom - 8], [a.right - 8, a.bottom - 8]];
    const onTop = pts.every(([x, y]) => { const t = document.elementFromPoint(x, y); return !!(t && t.closest('[data-k="group-sort-pop"]')); });
    return { under: a.top >= b.bottom - 0.5 && a.top - b.bottom < 12, rightAligned: Math.abs(a.right - b.right) < 1, inside: a.left >= 0 && a.right <= window.innerWidth, onTop: onTop };
  });
  T.eq('closed: the button untinted, no Group by or Sort by on the page', [await btn.getAttribute('aria-expanded'), await tinted(), await pop.count(), await p.getByLabel('Sort by').count()], ['false', false, 0, 0]);
  T.ok(await p.evaluate(() => { const q = document.querySelector('[data-k="scope"] select[aria-label="Quarter"]'), b = document.querySelector('[data-k="group-sort"]'); return !!q && !!(q.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && Math.abs(q.getBoundingClientRect().top - b.getBoundingClientRect().top) < 2; }), 'beside the quarter menu, on its row');
  await btn.click();
  await pop.waitFor({ timeout: 5000 });
  await p.waitForTimeout(150);
  T.eq('it opens: under the button, in the window, nothing over it; it takes the focus', [await placed(), await focusIn()], [{ under: true, rightAligned: true, inside: true, onTop: true }, 'popover']);
  await p.keyboard.press('Shift+Tab');
  T.eq('Shift+Tab: back to the button', await focusIn(), 'group-sort');
  await p.keyboard.press('Escape');
  T.eq('Escape there closes it', [await pop.count(), await btn.getAttribute('aria-expanded')], [0, 'false']);
  await p.keyboard.press('Enter');
  await pop.waitFor({ timeout: 5000 });
  await p.waitForTimeout(150);
  await p.keyboard.press('Tab');
  T.eq('Enter opens it from the keyboard; Tab goes to its first control', await p.evaluate(() => { const a = document.activeElement; return [!!a.closest('[data-k="group-sort-pop"]'), a.getAttribute('aria-label')]; }), [true, 'Close']);
  await p.getByLabel('Group by', { exact: true }).selectOption('division');
  await p.getByLabel('Add a grouping level').selectOption('project');
  await p.getByLabel('Sort by').selectOption('score');
  await p.waitForTimeout(250);
  T.eq('still open after three changes; the button tinted; the arrangement in words', [await pop.count(), await tinted(), (await p.locator('[data-k="group-sort-words"]').textContent()).trim()], [1, true, 'Grouped by division, then project, lowest score first.']);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(100);
  T.eq('Escape closes it and puts the focus back on the button', [await pop.count(), await focusIn()], [0, 'group-sort']);
  /* the tree's groups and objectives, and the timeline's rows, in order; each project's scores as shown */
  const seen = () => p.evaluate(() => {
    const tree = Array.from(document.querySelectorAll('[data-k="tree"] .mine-row')).filter((x) => /\bk-(set|proj|obj)\b/.test(x.className));
    const tl = Array.from(document.querySelectorAll('[data-k="roll-timeline"] .mine-tlrow')).map((x) => x.getAttribute('data-k').replace(/^tlp:/, 'p:').replace(/^tlo:/, 'o:'));
    const groups = [];
    tree.forEach((x) => { if (/\bk-(set|proj)\b/.test(x.className)) groups.push([]); else if (groups.length) { const t = (x.querySelector('.mine-score') || {}).textContent; groups[groups.length - 1].push(t ? Number(t) : null); } });
    return { tree: tree.map((x) => x.getAttribute('data-k')), tl: tl, groups: groups };
  });
  let v = await seen();
  T.ok(v.tree.length > 0 && v.tree[0].indexOf('p:division:') === 0, 'divisions head the tree');
  T.eq('the timeline: the same layers in the same order', v.tl, v.tree);
  T.ok(v.groups.every((g) => g.every((x, i) => i === 0 || x == null || (g[i - 1] != null && g[i - 1] <= x))), 'lowest score first in each group, unscored last');
  T.eq('kept in this browser', JSON.parse(await p.evaluate(() => localStorage.getItem('rd_mine_arrange'))), { gb: ['division', 'project'], sort: 'score' });
  await p.reload();
  await p.waitForSelector('[data-k="roll"]', { timeout: 20000 });
  T.eq('after a reload: tinted, named with the arrangement', [await tinted(), await btn.getAttribute('aria-label')], [true, 'Group and sort: Grouped by division, then project, lowest score first.']);
  await btn.click();
  T.eq('after a reload', [await p.getByLabel('Group by, level 1').inputValue(), await p.getByLabel('Group by, level 2').inputValue(), await p.getByLabel('Sort by').inputValue()], ['division', 'project', 'score']);
  /* a click outside it (on a timeline caret) closes it and goes no further; the next click folds */
  const n0 = await p.locator('[data-k="roll-timeline"] .mine-tlrow').count();
  const car = await p.locator('[data-k="roll-timeline"] .mine-tlrow.is-set').first().locator('button.mine-car').boundingBox();
  await p.mouse.click(car.x + car.width / 2, car.y + car.height / 2);
  T.eq('a click outside closes it, and nothing under it happens', [await pop.count(), await p.locator('[data-k="roll-timeline"] .mine-tlrow').count()], [0, n0]);
  await p.locator('[data-k="roll-timeline"] .mine-tlrow.is-set').first().locator('button.mine-car').click();
  T.ok((await p.locator('[data-k="roll-timeline"] .mine-tlrow').count()) < n0, 'a division folds on the timeline');
  await btn.click();
  await p.getByRole('button', { name: 'Remove the division level' }).click();
  await p.waitForTimeout(100);
  T.eq('removing a level keeps the popover open, and the focus in it', [await pop.count(), await focusIn()], [1, 'popover']);
  await p.getByRole('button', { name: 'Remove the project level' }).click();
  await p.waitForTimeout(150);
  v = await seen();
  T.eq('no levels: one list, the timeline alike', [v.tree.every((k) => k.indexOf('o:') === 0), v.tl], [true, v.tree]);
  await p.getByRole('button', { name: 'Back to the default' }).click();
  await p.waitForTimeout(150);
  T.eq('Back to the default: Project, Planning order, untinted, nothing kept; still open, the focus in it', [await p.getByLabel('Group by', { exact: true }).inputValue(), await p.getByLabel('Sort by').inputValue(), await tinted(), await p.evaluate(() => localStorage.getItem('rd_mine_arrange')), await pop.count(), await focusIn()], ['project', '', false, null, 1, 'popover']);
  await p.getByRole('button', { name: 'Close', exact: true }).click();
  await p.waitForTimeout(100);
  T.eq('Close closes it and puts the focus back on the button', [await pop.count(), await focusIn()], [0, 'group-sort']);
  /* a phone: the controls keep to the right, so the popover stays in the window */
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(200);
  await btn.click();
  T.eq('on a phone, it fits the window', await placed(), { under: true, rightAligned: true, inside: true, onTop: true });
  await p.keyboard.press('Escape');
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.waitForTimeout(200);
  /* the mark: the share of this quarter gone by, on the page's own clock */
  const m = await p.evaluate(() => {
    const el = document.querySelector('.mine-elapsed'), plot = document.querySelector('.mine-plot'), lab = document.querySelector('.mine-mlbl');
    const a = el.getBoundingClientRect(), b = plot.getBoundingClientRect(), c = lab.getBoundingClientRect();
    const key = Array.from(document.querySelectorAll('.mine-zk')).map((x) => x.getBoundingClientRect());
    return { at: (a.left + a.width / 2 - b.left) / b.width * 100, label: lab.textContent.trim(), clear: key.every((k) => k.top >= c.bottom - 0.5) && c.left >= b.left - 1 && c.right <= b.right + 1 };
  });
  const now = new Date(), y = now.getFullYear(), qn = Math.floor(now.getMonth() / 3);
  const d0 = Date.UTC(y, qn * 3, 1), d1 = Date.UTC(y, qn * 3 + 3, 1) - 864e5, td = Date.UTC(y, now.getMonth(), now.getDate());
  const e = Math.max(0, Math.min(1, (td - d0) / (d1 - d0))) * 100;
  T.ok(Math.abs(m.at - e) < 0.6, 'the mark at the time elapsed in this quarter (' + m.at.toFixed(1) + '%, ' + e.toFixed(1) + '% by the date)');
  T.eq('its label, inside the line and clear of the key', [m.label, m.clear], [Math.round(e) + '% elapsed', true]);
  T.eq('nothing written', stateWrites(r).map((x) => x.method + ' ' + x.path), []);
  T.eq('no errors', clean(r), []);
  await r.close();
});

/* ---------------------------------------------------------------------------------------------- real data */
add('Rehearsal on the real snapshot (mapped/)', async () => {
  const seedDir = path.join(live.SEEDS, 'mapped');
  if (!fs.existsSync(path.join(seedDir, 'manifest.json'))) execFileSync(process.env.RD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), [path.join(__dirname, 'export_mapped.py')], { stdio: 'inherit' });
  await broker.reset({ seed: 'mapped' });
  const before = {};
  for (const id of ['portfolio', 'EXEC-DIV-EL', 'EXEC-DIV-EXP', 'EXEC-DIV-FC']) before[id] = (await broker.get(id)).doc;
  const cto = { email: 'cto.test@celadyne.test', orgRole: 'cto' };
  for (const app of ['planning', 'execution', 'spec']) {
    const r = await page(FILES[app], { hubSession: cto });
    await r.page.waitForLoadState('networkidle');
    await r.page.waitForTimeout(3500);
    T.ok(r.log.broker.some((x) => x.path === '/state/portfolio' && x.status === 200), app + ': loaded the real portfolio');
    const w = stateWrites(r);
    T.eq(app + ': load writes only what it may', w.filter((x) => !WRITES[app](x.path)).map((x) => x.path), []);
    if (w.length) console.log('   ' + app + ' wrote on load (auto-pass of gates at target): ' + w.map((x) => x.path + ' ' + x.status).join(', '));
    T.eq(app + ': no errors', clean(r), []);
    await r.close();
  }
  for (const id of Object.keys(before)) {
    const now = (await broker.get(id)).doc;
    const count = (d) => JSON.stringify(['objectives', 'keyResults', 'kpis', 'stageGates', 'tasks', 'divisions', 'products'].map((k) => (d[k] || []).length));
    T.eq(id + ': nothing lost (list sizes)', count(now), count(before[id]));
  }
  for (const app of ['planning', 'execution', 'spec']) {
    const r = await page(FILES[app], { hubSession: cto });
    await r.page.waitForLoadState('networkidle');
    const acted = await walk(r.page, Math.round(STEPS / 2), 31 + app.length);
    await settled(r);
    const w = stateWrites(r);
    T.eq(app + ' walk on real data: wrote only what it may', w.filter((x) => !WRITES[app](x.path)).map((x) => x.path), []);
    T.eq(app + ' walk on real data: every write accepted', w.filter((x) => x.status !== 200).map((x) => x.path + ' ' + x.status), []);
    T.eq(app + ' walk on real data: no errors', clean(r), []);
    console.log('   ' + app + ' on real data: ' + acted + ' actions, ' + w.length + ' writes');
    await r.close();
  }
  /* the Overview's review table for every objective of every division on the real data: it renders, says
     nothing broken (no undefined / NaN / [object …]) and raises no error; only counts are printed */
  let seen = 0, rows = 0;
  for (const div of ['DIV-EL', 'DIV-EXP', 'DIV-FC']) {
    const r = await page(FILES.execution + '?division=' + div, { hubSession: cto });
    await r.page.waitForLoadState('networkidle');
    await r.page.waitForTimeout(1500);
    await r.page.getByLabel('Quarter', { exact: true }).selectOption('');   /* every quarter, not only the current one */
    await r.page.waitForTimeout(150);
    const objs = r.page.locator('nav[aria-label="Objectives"] button.obj');
    const n = await objs.count();
    for (let i = 0; i < n; i++) {
      await objs.nth(i).click();
      await r.page.locator('.tabs .tab', { hasText: 'Overview' }).first().click();
      await r.page.waitForTimeout(150);
      const panel = r.page.locator('[data-k="review"]');
      const ok = (await panel.count()) === 1;
      const txt = ok ? await panel.innerText() : '';
      T.ok(ok && !/\bundefined\b|\bNaN\b|\[object /.test(txt), 'real data, ' + div + ' objective ' + (i + 1) + ': the review table renders cleanly');
      rows += await r.page.locator('[data-k="review"] .review-row.is-item').count();
      seen++;
    }
    T.eq('real data, ' + div + ': no errors on the Overview', clean(r), []);
    await r.close();
  }
  T.ok(seen > 0, 'real data: review tables checked');
  console.log('   execution Overview on real data: ' + seen + ' objectives, ' + rows + ' review rows');
  /* My Projects on the real data: the CTO's Team Projects (every division) fully open, then each roster person's
     own view; it renders cleanly, writes nothing, raises no error. Only counts are printed. */
  {
    const r = await page(FILES.mine + '?view=team&quarter=all', { hubSession: cto });
    await r.page.waitForLoadState('networkidle');
    await r.page.waitForTimeout(2000);
    await r.page.getByRole('button', { name: 'Expand all' }).click();
    await r.page.waitForTimeout(500);
    const txt = await r.text();
    const n = await r.page.locator('.mine-row.k-obj').count();
    T.ok(n > 0, 'real data, My Projects: the CTO sees objectives in Team Projects');
    T.ok(!/\bundefined\b|\bNaN\b|\[object /.test(txt), 'real data, My Projects: the tree renders cleanly');
    T.eq('real data, My Projects: nothing written but automatic gate passes', stateWrites(r).filter((x) => !WRITES.mine(x.path)).length, 0);
    T.eq('real data, My Projects: no errors', clean(r).length, 0);
    console.log('   My Projects on real data, CTO Team Projects: ' + n + ' objectives, ' + (await r.page.locator('.mine-row').count()) + ' rows');
    /* the panel above the tree: past 12 objectives the timeline starts with each project folded to one row */
    const tl = await r.page.evaluate(() => {
      const q = (sel) => document.querySelectorAll(sel).length;
      const b = Array.from(document.querySelectorAll('.mine-mon > span')).filter((x) => x.textContent.trim()).map((x) => x.getBoundingClientRect());
      let overlap = 0;
      for (let i = 1; i < b.length; i++) if (b[i].left < b[i - 1].right + 2) overlap++;
      const panel = document.querySelector('[data-k="roll"]');
      return { rows: q('[data-k="roll-timeline"] .mine-tlrow'), proj: q('[data-k="roll-timeline"] .mine-tlrow.is-proj'), treeProj: q('.mine-row.k-proj'), dots: q('.mine-dot'), months: b.length, overlap: overlap, clean: !!panel && !/\bundefined\b|\bNaN\b|\[object /.test(panel.innerText) };
    });
    T.ok(tl.clean, 'real data, My Projects: the panel renders cleanly');
    T.eq('real data, My Projects: the timeline starts folded, a row per project', [tl.rows, tl.proj], n > 12 ? [tl.treeProj, tl.treeProj] : [tl.rows, tl.treeProj]);
    T.eq('real data, My Projects: month labels never overlap', tl.overlap, 0);
    console.log('   My Projects panel on real data: ' + tl.dots + ' scored objectives, ' + tl.proj + ' projects on the timeline, ' + tl.months + ' month labels');
    /* Group by and Sort by on the real data: division, product, model and owner in layers, by score; the timeline and
       the tree agree, everything renders cleanly (counts only) */
    await r.page.locator('[data-k="group-sort"]').click();
    await r.page.getByLabel('Group by', { exact: true }).selectOption('division');
    for (const d of ['product', 'model', 'owner']) await r.page.getByLabel('Add a grouping level').selectOption(d);
    await r.page.getByLabel('Sort by').selectOption('score');
    await r.page.keyboard.press('Escape');
    await r.page.waitForTimeout(100);
    T.eq('real data, My Projects: Escape closes Group and sort', await r.page.locator('[data-k="group-sort-pop"]').count(), 0);
    await r.page.getByRole('button', { name: 'Expand all' }).click();
    await r.page.waitForTimeout(400);
    const gr = await r.page.evaluate(() => {
      const tree = Array.from(document.querySelectorAll('[data-k="tree"] .mine-row')).filter((x) => /\bk-(set|proj|obj)\b/.test(x.className)).map((x) => x.getAttribute('data-k'));
      const tl = Array.from(document.querySelectorAll('[data-k="roll-timeline"] .mine-tlrow')).map((x) => x.getAttribute('data-k').replace(/^tlp:/, 'p:').replace(/^tlo:/, 'o:'));
      const panel = document.querySelector('[data-k="roll"]'), treeEl = document.querySelector('[data-k="tree"]');
      return { tree: tree, tl: tl, sets: tree.filter((k) => k.indexOf('p:') === 0).length, objs: tree.filter((k) => k.indexOf('o:') === 0).length, clean: !/\bundefined\b|\bNaN\b|\[object /.test(panel.innerText + treeEl.innerText) };
    });
    T.ok(gr.clean, 'real data, My Projects: grouped four levels deep, it renders cleanly');
    T.eq('real data, My Projects: every objective once', gr.objs, n);
    /* past 12 objectives the timeline folds the last level (owner), so it has every group row the tree has */
    T.eq('real data, My Projects: the timeline has the tree’s groups, in its order', gr.tl.filter((k) => k.indexOf('p:') === 0), gr.tree.filter((k) => k.indexOf('p:') === 0));
    T.eq('real data, My Projects: no errors after grouping', clean(r).length, 0);
    console.log('   My Projects grouped on real data (division, product, model, owner): ' + gr.sets + ' group rows, ' + gr.objs + ' objectives');
    await r.close();
    const users = (((await broker.api('/roster')).body || {}).users || []).filter((x) => x && x.email && !x.disabled);
    let people = 0, withRows = 0, objs = 0, bad = 0, errs = 0;
    for (const x of users) {
      const q = await page(FILES.mine + '?quarter=all', { hubSession: { email: x.email, orgRole: x.orgRole || 'ic' } });
      await q.page.waitForLoadState('networkidle');
      await q.page.waitForTimeout(800);
      const k = await q.page.locator('.mine-row.k-obj').count();
      const t = await q.text();
      people++;
      if (k) { withRows++; objs += k; }
      if (/\bundefined\b|\bNaN\b|\[object /.test(t)) bad++;
      errs += clean(q).length;
      await q.close();
    }
    T.ok(people > 0, 'real data, My Projects: the roster has people');
    T.eq('real data, My Projects: every person’s view renders cleanly', bad, 0);
    T.eq('real data, My Projects: no errors for anyone', errs, 0);
    console.log('   My Projects on real data: ' + people + ' people, ' + withRows + ' with objectives of their own (' + objs + ' objective rows)');
  }
});

/* ---------------------------------------------------------------------------------------------- the update itself */
add('An old tab after the update cannot save (426)', async () => {
  const old = process.env.RD_OLD_EXEC_APP;
  if (!old || !fs.existsSync(old)) { console.log('   skipped: set RD_OLD_EXEC_APP to an execution_app.html from before the patch'); return; }
  const oldSite = await live.serve({ files: { 'old_execution_app.html': old } });
  try {
    const r = await live.open(browser, oldSite.url('old_execution_app.html'), { hubSession: CTO });
    await r.page.waitForFunction(() => { const m = document.getElementById('msg'); return m && /Loaded|failed/i.test(m.textContent || ''); }, null, { timeout: 30000 });
    T.ok(/Loaded/.test(await r.page.evaluate(() => document.getElementById('msg').textContent)), 'the old page still reads (it sends the token)');
    const v0 = (await broker.readDoc('EXEC-DIV-FC')).version;
    /* a change in the old page (its own document and save path): exec is the old app's open document */
    await r.page.evaluate(() => { exec.e2eMarker = Date.now(); return flushPersist(); });
    await live.waitFor(async () => r.log.broker.some((x) => x.method === 'PUT'), { timeout: 10000, what: 'the old page\'s save' });
    await r.page.waitForTimeout(500);
    T.ok(puts(r).every((x) => x.status === 426), 'its save is refused with 426');
    T.eq('nothing stored', (await broker.readDoc('EXEC-DIV-FC')).version, v0);
    T.ok(/Save failed \(426\)/.test(await r.page.evaluate(() => document.getElementById('msg').textContent)), 'it says "Save failed (426)."');
    await r.close();
  } finally { await oldSite.close(); }
});

add('Pages first: the new pages work with the broker from before the patch', async () => {
  const dir = process.env.OLD_BROKER_DIR;
  if (!dir || !fs.existsSync(path.join(dir, 'broker.py'))) { console.log('   skipped: set OLD_BROKER_DIR to a broker/ folder from before the patch'); return; }
  const oldBroker = await live.startBroker({ seed: 'sample', brokerDir: dir });
  const oldSite = await live.serve({ files: Object.fromEntries(Object.values(FILES).map((f) => [f, path.join(PAGES, f)])), broker: oldBroker });
  try {
    for (const app of ['planning', 'execution', 'sales', 'spec']) {
      const r = await live.open(browser, oldSite.url(FILES[app]), { hubSession: CTO, token: oldBroker.token });
      await r.page.waitForLoadState('networkidle');
      await r.page.waitForTimeout(1500);
      T.ok(r.log.broker.some((x) => x.path === '/state/portfolio' && x.status === 200), app + ': loads from the old broker');
      T.eq(app + ': no errors', clean(r), []);
      await r.close();
    }
    const r = await live.open(browser, oldSite.url(FILES.execution + '?objective=OBJ-EL-2026Q4-01'), { hubSession: CTO, token: oldBroker.token });
    await waitText(r, 'Loaded Electrolyzer.');
    await r.page.getByRole('button', { name: 'End objective' }).first().click();
    await r.page.locator('aside[aria-label="Editor"] .sh-foot').getByRole('button', { name: 'End objective' }).click();
    await live.waitFor(async () => r.log.broker.some((x) => x.method === 'PUT' && x.status === 200), { timeout: 10000, what: 'a save accepted by the old broker' });
    T.ok(((await oldBroker.get('EXEC-DIV-EL')).doc.objectiveState || []).some((s) => s.objectiveId === 'OBJ-EL-2026Q4-01'), 'a save from the new page lands on the old broker');
    await r.close();
  } finally { await oldSite.close(); await oldBroker.stop(); }
});

(async () => {
  for (const f of Object.values(FILES)) {
    if (!fs.existsSync(path.join(PAGES, f))) { console.log('FAIL missing ' + path.join(PAGES, f) + ' (run python build.py first)'); process.exit(1); }
  }
  broker = await live.startBroker({ seed: 'sample' });
  site = await live.serve({ files: Object.fromEntries(Object.values(FILES).map((f) => [f, path.join(PAGES, f)])) });
  browser = await live.chromium.launch();
  const t0 = Date.now();
  try {
    for (const [title, fn] of SECTIONS) await section(title, fn);
  } finally {
    await browser.close();
    await site.close();
    await broker.stop();
  }
  console.log('\n(' + Math.round((Date.now() - t0) / 1000) + ' s)');
  T.done();
})().catch((e) => { console.log('FAIL (crash) ' + (e && e.stack ? e.stack : e)); process.exitCode = 1; });
