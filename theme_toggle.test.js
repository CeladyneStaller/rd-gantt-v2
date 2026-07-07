// Theme system: OS-seed, saved-choice precedence, toggle flip+persist, palette completeness. (12 assertions)
// usage: NODE_PATH=<jsdom> node theme_toggle.test.js [path/to/execution_app.html]
const {JSDOM}=require('jsdom'); const fs=require('fs');
const HTML_PATH=process.argv[2]||'/mnt/user-data/outputs/execution_app.html';
const html=fs.readFileSync(HTML_PATH,'utf8');
let pass=0, fail=0;
function ok(name,cond){ if(cond){pass++;console.log('  \u2713 '+name);} else {fail++;console.log('  \u2717 FAIL '+name);} }

function makeMM(osDark){ return function(q){ return { matches: /dark/.test(q)?!!osDark:false, media:q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }; }; }
function seed(saved, osDark){
  const dom=new JSDOM(html,{runScripts:"dangerously",url:"https://x.test/",
    beforeParse(w){ try{ if(saved) w.localStorage.setItem('rd_theme',saved); }catch(e){} w.matchMedia=makeMM(osDark); }});
  return dom;
}

// --- seed scenarios (pre-paint script) ---
ok('saved "light" wins over OS(dark)',        seed('light', true ).window.document.documentElement.getAttribute('data-theme')==='light');
ok('saved "dark" wins over OS(light)',        seed('dark',  false).window.document.documentElement.getAttribute('data-theme')==='dark');
ok('no saved + OS(dark) seeds dark',          seed(null,   true ).window.document.documentElement.getAttribute('data-theme')==='dark');
ok('no saved + OS(light) seeds light',        seed(null,   false).window.document.documentElement.getAttribute('data-theme')==='light');

// --- toggle flips + persists (after handler wiring) ---
(function(){
  const dom=seed('light', false); const w=dom.window, d=w.document;
  setTimeout(()=>{
    const darkBtn=d.querySelector('[data-theme-set="dark"]'), lightBtn=d.querySelector('[data-theme-set="light"]');
    ok('toggle buttons rendered in settings', !!darkBtn && !!lightBtn);
    darkBtn.click();
    ok('clicking Dark sets data-theme=dark', d.documentElement.getAttribute('data-theme')==='dark');
    ok('clicking Dark persists rd_theme=dark', w.localStorage.getItem('rd_theme')==='dark');
    ok('Dark button marked aria-pressed', darkBtn.getAttribute('aria-pressed')==='true' && lightBtn.getAttribute('aria-pressed')==='false');
    lightBtn.click();
    ok('clicking Light flips back + persists', d.documentElement.getAttribute('data-theme')==='light' && w.localStorage.getItem('rd_theme')==='light');

    // --- palette completeness: every token defined in BOTH :root(dark) and html[data-theme=light] ---
    const css=(html.match(/<style[^>]*>([\s\S]*?)<\/style>/g)||[]).join('\n');
    const root=(css.match(/:root\s*\{([\s\S]*?)\}/)||[])[1]||'';
    const lightP=(css.match(/html\[data-theme="light"\]\s*\{([\s\S]*?)\}/)||[])[1]||'';
    const need=['--bg','--panel','--panel2','--line','--ink','--muted','--accent','--accent2','--ok','--warn','--bad','--none',
      '--pill-ok-bg','--pill-ok-fg','--pill-ok-bd','--pill-warn-bg','--pill-warn-fg','--pill-warn-bd','--pill-bad-bg','--pill-bad-fg','--pill-bad-bd',
      '--pill-neutral-bg','--pill-neutral-fg','--pill-active-bg','--pill-active-fg','--pill-active-bd','--pill-info-bg','--pill-info-fg','--pill-info-bd',
      '--on-accent','--on-danger','--scrim'];
    const missDark=need.filter(v=>!new RegExp(v.replace(/[-]/g,'\\-')+'\\s*:').test(root));
    const missLight=need.filter(v=>!new RegExp(v.replace(/[-]/g,'\\-')+'\\s*:').test(lightP));
    ok('dark (:root) defines all '+need.length+' tokens'+(missDark.length?' [missing: '+missDark.join(',')+']':''), missDark.length===0);
    ok('light palette defines all '+need.length+' tokens'+(missLight.length?' [missing: '+missLight.join(',')+']':''), missLight.length===0);

    // --- ETB (execution only) now follows the toggle, not the OS media query ---
    if(/#etb-view/.test(css)){
      ok('ETB dark palette keyed off data-theme (no prefers-color-scheme left)',
         /html\[data-theme="dark"\]\s+#etb-view/.test(css) && !/prefers-color-scheme/.test(css));
    } else {
      ok('no prefers-color-scheme media query left (app has no ETB)', !/prefers-color-scheme/.test(css));
    }

    console.log(fail? "\u2717 theme system FAILED" : "\u2705 theme: OS-seed + saved-wins + toggle persist + full palettes + ETB on toggle");
    process.exitCode = fail?1:0;
  }, 400);
})();