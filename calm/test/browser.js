/* The deployed (standalone) calm pages in headless Chromium: what a person on the Celadyne site would get.

     python3 standalone.py && node test/browser.js

   Checks every page renders without errors, the Hub sign-in decides who may change the plan, the pages never
   touch the live apps' browser storage, and links between pages carry the hand-off. The random walks are in
   test/browser_walk.js.
*/
const { serve, ok, eq, done, chromium, PAGES, EDITORS, hubSession, LIVE, page, text, storageOf, shot, walk } = require('./browser_lib');

(async () => {
  const { srv, base } = await serve();
  const browser = await chromium.launch();
  try {
    /* ---------------------------------------------------------------- every page */
    for (const f of PAGES) {
      const r = await page(browser, base, f);
      await r.p.waitForTimeout(300);
      const t = await text(r.p);
      ok(/calm prototype$/.test(await r.p.title()), f + ': title says prototype');
      ok(t.includes('Prototype with sample data'), f + ': the sidebar says prototype with sample data');
      ok(t.includes('Saved'), f + ': save status shows');
      eq(f + ': no errors on load', r.errors, []);
      await shot(r.p, f.replace('.html', ''));
      await r.ctx.close();
    }

    /* ---------------------------------------------------------------- Planning, nobody signed in to the Hub */
    {
      const r = await page(browser, base, 'calm-planning.html');
      const p = r.p;
      ok(!(await text(p)).includes('View only'), 'planning default (the canvas default, the CTO): no View only marker');
      await p.getByRole('button', { name: 'Structure', exact: true }).click();
      await p.getByRole('button', { name: 'More actions for Run full roll-to-roll membrane production' }).click();
      await p.getByRole('menuitem', { name: 'Edit', exact: true }).click();
      const editor = p.locator('[aria-label="Editor"]');
      await editor.getByLabel('Statement').fill('Run roll-to-roll membrane production at 2 m/min');
      await editor.getByRole('button', { name: 'Save objective' }).click();
      await p.waitForTimeout(200);
      ok((await text(p)).includes('Run roll-to-roll membrane production at 2 m/min'), 'planning: an edit typed in the editor shows in Structure');
      await p.waitForTimeout(3200);
      ok((await text(p)).includes('Saved'), 'planning: autosave settles to Saved');
      eq('planning edit: no errors', r.errors, []);
      await r.ctx.close();
    }

    /* ---------------------------------------------------------------- Planning, a lead signed in to the Hub */
    {
      const r = await page(browser, base, 'calm-planning.html', { storage: { hub_session_v1: hubSession('Toru.Hatsukade@celadynetech.com', 'lead') } });
      const p = r.p;
      const t = await text(p);
      ok(t.includes('View only'), 'hub lead: View only marker');
      ok(t.includes('You can see the whole plan. Changes are made by the CTO and CEO: ' + EDITORS + '.'), 'hub lead: the banner names who can change the plan');
      ok(t.includes('Toru') && t.includes('Lead'), 'hub lead: the sidebar shows the Hub person');
      await p.getByRole('button', { name: 'Structure', exact: true }).click();
      const menus = p.getByRole('button', { name: /^More actions for/ });
      const nMenus = await menus.count();
      const editItems = [];
      for (let i = 0; i < nMenus; i += Math.max(1, Math.floor(nMenus / 6))) {
        await menus.nth(i).click();
        const items = await p.getByRole('menuitem').allInnerTexts();
        items.filter((x) => /^(edit|delete|add|new|pause|resume|mark|restore|deprioriti|record|create)/i.test(x.trim())).forEach((x) => editItems.push(x.trim()));
        await p.keyboard.press('Escape');
        if (await p.getByRole('menuitem').count()) await p.getByRole('button', { name: 'Close menu' }).click();
      }
      eq('hub lead: row menus offer no editing (' + nMenus + ' rows)', editItems, []);
      await p.getByRole('button', { name: 'Settings' }).click();
      const sel = p.getByLabel('Signed in as');
      ok(await sel.isDisabled(), 'hub lead: the Signed in as picker is fixed');
      eq('hub lead: it shows the Hub person', (await sel.evaluate((s) => s.options[s.selectedIndex].text)).trim(), 'Toru Hatsukade, Lead');
      ok((await text(p)).includes('From your Hub sign-in (toru.hatsukade@celadynetech.com).'), 'hub lead: Settings says where the sign-in comes from');
      await shot(p, 'planning-hub-lead-settings');
      eq('hub lead: no errors', r.errors, []);
      await r.ctx.close();
    }

    /* ---------------------------------------------------------------- Planning, the CTO signed in to the Hub */
    {
      const r = await page(browser, base, 'calm-planning.html', { storage: { hub_session_v1: hubSession('corey@celadynetech.com', 'cto') } });
      const p = r.p;
      ok(!(await text(p)).includes('View only'), 'hub CTO: no View only marker');
      await p.getByRole('button', { name: 'Structure', exact: true }).click();
      await p.getByRole('button', { name: 'More actions for Run full roll-to-roll membrane production' }).click();
      ok(await p.getByRole('menuitem', { name: 'Edit', exact: true }).count() === 1, 'hub CTO: the row menu offers Edit');
      eq('hub CTO: no errors', r.errors, []);
      await r.ctx.close();
    }

    /* ---------------------------------------------------------------- an expired Hub session falls back to the picker */
    {
      const r = await page(browser, base, 'calm-planning.html', { storage: { hub_session_v1: hubSession('toru.hatsukade@celadynetech.com', 'lead', -60000) } });
      const p = r.p;
      await p.getByRole('button', { name: 'Settings' }).click();
      ok(!(await p.getByLabel('Signed in as').isDisabled()), 'expired session: the picker works');
      await p.getByLabel('Signed in as').selectOption('toru@celadyne.com');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(100);
      ok((await text(p)).includes('View only'), 'expired session: picking a lead makes Planning view only');
      eq('expired session: no errors', r.errors, []);
      await r.ctx.close();
    }

    /* ---------------------------------------------------------------- the live apps' storage is never touched */
    {
      const seed = Object.assign({ hub_session_v1: hubSession('toru.hatsukade@celadynetech.com', 'lead') }, LIVE);
      const r = await page(browser, base, 'calm-execution.html', { storage: seed });
      const p = r.p;
      ok(!(await p.locator('.cw').getAttribute('data-theme')).includes('dark'), 'the live theme choice (dark) does not leak into the prototype');
      await p.getByRole('button', { name: 'Settings' }).click();
      await p.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
      await p.keyboard.press('Escape');
      await p.locator('.shl-pick').click();
      const radios = p.getByRole('menuitemradio');
      await radios.nth((await radios.count()) - 1).click();
      await p.waitForTimeout(200);
      await walk(p, 120, 7, r.errors);
      await p.goto(base + 'calm-planning.html');
      await p.waitForSelector('.cw');
      await p.getByRole('button', { name: 'Gantt', exact: true }).click();
      await walk(p, 120, 9, r.errors);
      await p.goto(base + 'calm-product-spec.html');
      await p.waitForSelector('.cw');
      await walk(p, 80, 13, r.errors);
      const after = await storageOf(p);
      for (const k of Object.keys(seed)) eq('live key untouched: ' + k, after[k], seed[k]);
      const strays = Object.keys(after).filter((k) => !(k in seed) && !k.startsWith('calm-prototype:'));
      eq('every key the prototype wrote is its own', strays, []);
      ok(Object.keys(after).some((k) => k.startsWith('calm-prototype:')), 'the prototype does keep its own choices (prefixed)');
      eq('storage walk: no errors', r.errors, []);
      await r.ctx.close();
    }

    /* ---------------------------------------------------------------- links between pages carry the hand-off */
    {
      const r = await page(browser, base, 'calm-planning.html');
      const p = r.p;
      await p.getByRole('button', { name: 'Structure', exact: true }).click();
      await p.getByRole('button', { name: 'More actions for Lock Tera 25-30-R5 components' }).click();
      const link = p.getByRole('menuitem', { name: 'Open in Execution' });
      eq('the row menu links to the deployed page', await link.getAttribute('href'), 'calm-execution.html');
      await Promise.all([p.waitForURL(/calm-execution\.html$/), link.click()]);
      await p.waitForSelector('.cw');
      await p.waitForTimeout(200);
      ok(/Lock Tera 25-30-R5 components OBJ-EL-2026Q4-02/.test(await text(p)), 'Execution opened on the same objective (hand-off)');
      await p.getByRole('link', { name: 'Product spec', exact: true }).click();
      await p.waitForURL(/calm-product-spec\.html$/);
      await p.waitForSelector('.cw');
      ok((await text(p)).includes('Product specifications'), 'sidebar link to Product spec works');
      eq('links: no errors', r.errors, []);
      await r.ctx.close();
    }

    /* ---------------------------------------------------------------- dragging with a real pointer and real drag events */
    {
      const r = await page(browser, base, 'calm-planning.html');
      const p = r.p;
      await p.getByRole('button', { name: 'Gantt', exact: true }).click();
      const bar = p.locator('[data-k="objective:OBJ-FC-2026Q4-02"] button[class*="pgt-bar"]').first();
      await bar.scrollIntoViewIfNeeded();
      const b = await bar.boundingBox();
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await p.mouse.down();
      await p.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2, { steps: 4 });
      await p.mouse.move(b.x + b.width / 2 + 90, b.y + b.height / 2, { steps: 4 });
      await p.mouse.up();
      await p.waitForTimeout(150);
      ok(/Moved \d+ days later\./.test(await text(p)), 'Gantt: dragging a bar with the mouse moves the objective');
      eq('Gantt drag: no errors', r.errors, []);
      await r.ctx.close();
    }
    {
      const r = await page(browser, base, 'calm-sales.html');
      const p = r.p;
      await p.getByRole('button', { name: 'Kanban', exact: true }).click();
      await p.waitForSelector('[data-k="kb"]');
      const tile = p.locator('[data-k="kb-tile:tile-snake"]');
      const target = p.locator('[data-k="kb-cell:lane-ut:col-di"]');
      /* both ends on screen first: scrolling in the middle of a drag drops it (how far down the board starts
         depends on the head's height, which changed when the KR signal left the head) */
      await target.scrollIntoViewIfNeeded();
      await tile.scrollIntoViewIfNeeded();
      await tile.dragTo(target);
      await p.waitForTimeout(150);
      eq('kanban: the dragged tile lands in Discovery', await p.locator('[data-k="kb-cell:lane-ut:col-di"] [data-k="kb-tile:tile-snake"]').count(), 1);
      eq('kanban drag: no errors', r.errors, []);
      await r.ctx.close();
    }

    /* ---------------------------------------------------------------- dark theme and a narrow window render */
    {
      const r = await page(browser, base, 'calm-execution.html', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
      await shot(r.p, 'execution-narrow');
      eq('narrow window: no errors', r.errors, []);
      await r.ctx.close();
    }
  } catch (e) {
    ok(false, 'browser test crashed: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  } finally {
    await browser.close();
    srv.close();
    done();
  }
})();
