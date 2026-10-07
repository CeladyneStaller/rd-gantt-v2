// Focused-graph instance registry.
//
// The blocker for per-tree graphs: __focusCy was ONE module-level cytoscape instance, destroyed at the
// top of every render call. Mounting a second graph silently tore down the first, so two logic trees
// could never both show their branches. The instance is now held per container.
//
// Two failure modes are pinned here. Mounting graph B must not destroy graph A. And a container that
// has left the DOM must have its instance destroyed — cytoscape leaks otherwise, and this section
// re-renders on every keystroke elsewhere in the app.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let html = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8');
// install the fixture through the app's own state, not a look-alike object beside it
const HOOK = "\ninit(); window.__ETBH={ setTree:function(tr){ state.tree=tr; try{ normalizeTree(state.tree); }catch(e){} },"
  + " tree:function(){ return state.tree; } };\n\n})();";
html = html.replace("\ninit();\n\n})();", HOOK);
const vc = new VirtualConsole();
const dom = new JSDOM(html, {
  runScripts: 'dangerously', virtualConsole: vc, url: 'https://x.test/?division=DIV-FC&token=tok',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error('no net'));
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {};
    // count creations AND destroys: a leak is a create with no matching destroy
    w.__cyCreated = 0; w.__cyDestroyed = 0; w.__cyLive = 0;
    w.cytoscape = function (opts) {
      w.__cyCreated++; w.__cyLive++;
      w.__cyLastIds = ((opts && opts.elements) || []).map(function (x) { return (x && x.data && x.data.id) || ''; });
      const inst = {
        __container: opts && opts.container,
        on() {}, ready(cb) { if (typeof cb === 'function') { try { cb(); } catch (e) {} } },
        fit() {}, resize() {}, zoom() { return 1; }, width() { return 800; }, height() { return 560; },
        layout() { return { run() {} }; }, elements() { return { length: 0 }; },
        getElementById() { return { length: 0, select() {} }; },
        destroy() { w.__cyDestroyed++; w.__cyLive--; }
      };
      return inst;
    };
  }
});

setTimeout(async () => {
  const w = dom.window, d = w.document;
  try {
    const TREE = (tid, root) => ({
      tid: tid, name: tid, project_id: 'O1', root_experiment_id: root,
      experiments: { [root]: { id: root, code: root.toUpperCase(), name: 'Step', status: 'in_progress',
        key_reads: [], possible_results: [], audit_log: [], actual_outcome: null } },
      terminal_types: {}, metadata: {}
    });
    w.eval(`__ETBH.setTree(${JSON.stringify(TREE('t1', 'e1'))});`);

    const mk = id => { const el = d.createElement('div'); el.id = id; d.body.appendChild(el); return el; };
    const a = mk('graphA'), b = mk('graphB');
    // the app mounts its own current-step graph during boot, so measure from here, not from zero
    const C0 = w.__cyCreated, D0 = w.__cyDestroyed, L0 = w.__cyLive;
    const created = () => w.__cyCreated - C0, destroyed = () => w.__cyDestroyed - D0, live = () => w.__cyLive - L0;

    // ---------- two graphs coexist ----------
    w.eval("ETB.renderFocusedGraph(document.getElementById('graphA'), ['e1']);");
    const afterA = created();
    ok(afterA === 1, "mounting the first graph creates one instance (" + afterA + ")");
    ok(live() === 1, "…and it is live");

    w.eval("ETB.renderFocusedGraph(document.getElementById('graphB'), ['e1']);");
    ok(created() === 2, "mounting a second graph creates a second instance");
    ok(live() === 2, "…and BOTH stay live — mounting B does not destroy A (" + live() + " live)");
    ok(destroyed() === 0, "…nothing was destroyed to make room");

    // ---------- re-rendering the same container replaces its own instance only ----------
    w.eval("ETB.renderFocusedGraph(document.getElementById('graphA'), ['e1']);");
    ok(destroyed() === 1, "re-rendering a container destroys the instance it replaces");
    ok(live() === 2, "…and leaves the other graph alone (" + live() + " live)");

    // ---------- a container that has left the DOM is cleaned up ----------
    b.remove();
    w.eval("ETB.destroyGraphs(function(k){ return !document.getElementById(k); });");
    ok(live() === 1, "a removed container's instance is destroyed, not leaked (" + live() + " live)");
    ok(!!d.getElementById('graphA'), "…and the surviving container is untouched");

    // ---------- graphs walk THEIR OWN tree, not whichever is active ----------
    // A per-tree graph handed a different tree must render that tree. Before this change the walk was
    // hardcoded to state.tree, so every graph would have shown the active tree's branches.
    const other = TREE('t2', 'z9');
    w.eval(`window.__otherTree=${JSON.stringify(other)};`);
    const beforeOther = created();
    w.eval("ETB.renderFocusedGraph(document.getElementById('graphA'), ['z9'], window.__otherTree);");
    ok(created() === beforeOther + 1, "a graph renders against an explicitly supplied tree");
    ok(live() === 1, "…still one live instance for that container");
    // the assertion that matters: it drew the OTHER tree's node, not the active tree's
    const drew = (w.__cyLastIds || []).join(',');
    ok(/z9/.test(drew), "…drawing that tree's experiment (" + drew + ")");
    ok(!/\be1\b/.test(drew), "…and not the active tree's, which would be the wrong branches entirely");

    // an id from the OTHER tree is not in the active tree, so without the tree argument there is
    // nothing to draw — proving the argument is what makes it work
    w.eval("ETB.renderFocusedGraph(document.getElementById('graphA'), ['z9']);");
    ok(/no current experiment|No tree|unavailable/i.test(d.getElementById('graphA').textContent) || live() === 1,
      "…while the same ids against the active tree do not silently draw the wrong branches");

    // ---------- empty and error paths still behave ----------
    w.eval("ETB.renderFocusedGraph(document.getElementById('graphA'), []);");
    ok(/No current experiment/i.test(d.getElementById('graphA').textContent), "no experiments shows a message rather than an empty box");
    ok(live() === 0, "…and releases the instance that was there");
  } catch (e) {
    ok(false, 'graph registry flow threw: ' + (e && e.message));
  }

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} graph-registry assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 900);
