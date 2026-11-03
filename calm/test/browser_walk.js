/* Random walks of real clicks, typing and choices on every deployed page, signed out of the Hub and as a
   Hub lead. Any page error or console error fails.

     node test/browser_walk.js [steps] [page-substring]   (default 300 steps per walk, every page)
*/
const { serve, ok, eq, done, chromium, PAGES, hubSession, page, walk } = require('./browser_lib');
const STEPS = Number(process.argv[2]) || 300;
(async () => {
  const { srv, base } = await serve();
  const browser = await chromium.launch();
  try {
    for (const [i, f] of PAGES.entries()) {
      if (process.argv[3] && !f.includes(process.argv[3])) continue;
      for (const who of [null, 'lead', 'cto']) {
        const label = f + (who ? ' (Hub ' + who + ')' : ' (no Hub sign-in)');
        const r = await page(browser, base, f, who ? { storage: { hub_session_v1: hubSession('someone@celadynetech.com', who) } } : {});
        const t0 = Date.now();
        const acted = await walk(r.p, STEPS, 101 + i * 7 + (who === 'lead' ? 3 : who === 'cto' ? 5 : 0), r.errors);
        ok(acted > STEPS * 0.4, label + ': the walk acted ' + acted + ' times');
        ok(await r.p.locator('.cw').count() === 1, label + ': still on the page');
        eq(label + ': no error', r.errors, []);
        console.log('  ' + label + ': ' + acted + ' actions in ' + Math.round((Date.now() - t0) / 1000) + ' s');
        await r.ctx.close();
      }
    }
  } catch (e) {
    ok(false, 'walk crashed: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  } finally {
    await browser.close();
    srv.close();
    done();
  }
})();
