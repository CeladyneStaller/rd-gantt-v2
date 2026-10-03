// Assigning a kanban tile to a user.
//
// The people list has two sets. The NARROW one is those owning an active objective in this division —
// the people who would plausibly pick the work up, so it is the useful default rather than a
// restriction. The WIDE one is everyone known, for the deliberate case of assigning outside it.
//
// The current assignee is always in the list whatever the filter says: someone whose objective has since
// closed would otherwise vanish from the picker that shows their own assignment, and the list would
// quietly disagree with the tile.
const RD = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

// ---------- the engine ----------
(function () {
  try {
    const pf = { objectives: [
      { id: 'O1', divisionId: 'D', owner: ['corey.staller@x.com'], plannedEnd: 2600 },
      { id: 'O2', divisionId: 'D', owner: ['priya.raman@x.com', 'corey.staller@x.com'], plannedEnd: 2600 },
      { id: 'O3', divisionId: 'D', owner: ['past.owner@x.com'], plannedEnd: 2300 },     // window closed
      { id: 'O4', divisionId: 'D', owner: ['done.owner@x.com'], plannedEnd: 2600 },     // ended below
      { id: 'O5', divisionId: 'OTHER', owner: ['jordan.liu@x.com'], plannedEnd: 2600 } ] };
    const st = [{ objectiveId: 'O4', status: 'achieved' }];
    const all = ['corey.staller@x.com', 'priya.raman@x.com', 'jordan.liu@x.com', 'mei.okafor@x.com'];

    const owners = RD.divisionOwnerEmails(pf, 'D', 2464, st);
    ok(owners.indexOf('corey.staller@x.com') >= 0 && owners.indexOf('priya.raman@x.com') >= 0,
      "owners of active objectives in the division are listed");
    ok(owners.indexOf('jordan.liu@x.com') < 0, "…and an owner in ANOTHER division is not");
    /* "Active" has to mean active: a closed window or an ended objective is not work anyone is on. */
    ok(owners.indexOf('past.owner@x.com') < 0, "…nor an owner whose objective's window has passed");
    ok(owners.indexOf('done.owner@x.com') < 0, "…nor one whose objective is achieved or abandoned");
    ok(owners.length === 2, "…so the narrow set is exactly the two (" + owners.join(', ') + ")");

    ok(RD.objectivesOwnedIn(pf, 'D', 'corey.staller@x.com', 2464, st) === 2,
      "a person's active objective count is reported, so the row can say why they are offered");
    ok(RD.objectivesOwnedIn(pf, 'D', 'COREY.STALLER@X.COM', 2464, st) === 2, "…matching case-insensitively");

    const narrow = RD.assigneeOptions({ portfolio: pf, divisionId: 'D', todayDay: 2464, objectiveState: st,
      allEmails: all, narrow: true });
    ok(narrow.length === 2, "the narrow picker offers the division's owners (" + narrow.length + ")");
    const wide = RD.assigneeOptions({ portfolio: pf, divisionId: 'D', todayDay: 2464, objectiveState: st,
      allEmails: all, narrow: false });
    ok(wide.length === 4, "the wide picker offers everyone known (" + wide.length + ")");
    ok(wide.some(r => r.email === 'mei.okafor@x.com' && !r.isOwner),
      "…marking who does not own anything active here, so picking them is deliberate");

    /* The case the rule exists for. */
    const stale = RD.assigneeOptions({ portfolio: pf, divisionId: 'D', todayDay: 2464, objectiveState: st,
      allEmails: all, narrow: true, current: 'past.owner@x.com' });
    ok(stale.some(r => r.email === 'past.owner@x.com'),
      "a current assignee who no longer qualifies is STILL in the narrow list");
    ok(stale.find(r => r.email === 'past.owner@x.com').current === true, "…flagged as the current one");
    ok(stale.find(r => r.email === 'past.owner@x.com').isOwner === false, "…and not pretended to be an owner");
    ok(stale[0].email === 'past.owner@x.com', "…placed first, where the selected row belongs");

    const dup = RD.assigneeOptions({ portfolio: pf, divisionId: 'D', todayDay: 2464, objectiveState: st,
      allEmails: all, narrow: true, current: 'corey.staller@x.com' });
    ok(dup.filter(r => r.email === 'corey.staller@x.com').length === 1,
      "an assignee already in the list is not added twice");
    ok(dup.find(r => r.email === 'corey.staller@x.com').current === true, "…just flagged");

    ok(RD.initialsOf('corey.staller@x.com') === 'CS', "initials come from the address (CS)");
    ok(RD.initialsOf('mei.okafor@x.com') === 'MO', "…first and last part");
    ok(RD.initialsOf('bob@x.com') === 'BO', "…and a single-part name still gives two letters");
    ok(RD.initialsOf('') === '' && RD.initialsOf(null) === '', "…with nothing for nobody");
  } catch (e) { ok(false, 'engine block threw: ' + (e && e.message)); }
})();

const boot = (file) => {
  const vc = new VirtualConsole(); const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/' + file, 'utf8'), {
    runScripts: 'dangerously', virtualConsole: vc, url: 'https://x.test/?division=D&token=t', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
      w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {};
      w.fetch = () => Promise.reject(new Error('no net'));
      w.cytoscape = function () { return { on(){}, ready(cb){ try{ cb && cb(); }catch(e){} }, fit(){}, resize(){},
        destroy(){}, getElementById(){ return { length: 0, select(){} }; }, zoom(){ return 1; }, width(){ return 800; },
        height(){ return 560; }, layout(){ return { run(){} }; }, elements(){ return { length: 0 }; },
        $(){ return { unselect(){} }; } }; };
    } });
  return { dom, errs };
};
const SEED = (kind) => `persist=function(){};
  portfolio={units:[],divisions:[{id:"D",name:"D",kind:"${kind}"}],products:[],models:[],
    initiatives:[{id:"I",name:"I",divisionId:"D"}],
    objectives:[
      {id:"O1",statement:"A",divisionId:"D",initiativeId:"I",quarter:"2026Q2",plannedStart:2200,plannedEnd:2600,owner:["corey.staller@x.com"]},
      {id:"O2",statement:"B",divisionId:"D",initiativeId:"I",quarter:"2026Q2",plannedStart:2200,plannedEnd:2600,owner:["priya.raman@x.com"]}],
    kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
  kbRoster=["corey.staller@x.com","priya.raman@x.com","jordan.liu@x.com","mei.okafor@x.com"];
  divisionId="D"; selectedObj="O1"; setGateMode("O1","kanban");`;

setTimeout(() => {
  (function () {
    const { dom, errs } = boot('execution_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED('rd'));
      const h = () => d.getElementById('subSG');
      h().querySelector('[data-kbaddboard]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      w.eval(`(function(){var b=exec.boards[0];
        b.tiles=[{id:"T1",name:"Acme",lane:b.swimlanes[0].id,col:b.columns[0].id,enteredCol:"2026-09-28"}];
        renderAll();})();`);

      /* An unassigned tile draws a dashed empty disc rather than nothing: a blank corner reads as a
         rendering gap, not as "nobody owns this". */
      ok(h().querySelectorAll('.kb-av.none').length === 1, "an unassigned tile shows an empty assignment disc");
      ok(/Unassigned/.test(h().querySelector('.kb-av.none').getAttribute('aria-label')), "…labelled for a reader");

      h().querySelector('[data-kbtiledit]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const mb = () => d.getElementById('modalBody');
      const names = () => [...mb().querySelectorAll('.asg-row .asg-nm')].map(e => e.textContent);
      ok(!!mb().querySelector('.asg-box'), "the tile form offers an assignee picker");
      ok(!!mb().querySelector('[data-kbnarrow]'), "…with the division-owners toggle");
      ok(mb().querySelector('[data-kbnarrow]').checked === true, "…on by default");
      ok(names().indexOf('corey.staller@x.com') >= 0 && names().indexOf('priya.raman@x.com') >= 0,
        "…listing the division's owners");
      ok(names().indexOf('mei.okafor@x.com') < 0, "…and not someone who owns nothing active here");
      ok(names().indexOf('Unassigned') >= 0, "…with Unassigned as an explicit choice");

      const tg = mb().querySelector('[data-kbnarrow]');
      tg.checked = false; tg.dispatchEvent(new w.Event('change', { bubbles: true }));
      ok(names().indexOf('mei.okafor@x.com') >= 0, "turning the toggle off shows everyone");
      ok(/Showing everyone/.test(mb().textContent), "…and says so");

      const pick = [...mb().querySelectorAll('input[name=kbasg]')].find(r => r.value === 'priya.raman@x.com');
      pick.checked = true;
      mb().querySelector('[data-kbte-save]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(w.eval('exec.boards[0].tiles[0].assignee') === 'priya.raman@x.com', "saving stores the assignee");

      const av = h().querySelector('.kb-av');
      ok(!!av && av.textContent === 'PR', "the tile shows their initials (" + (av && av.textContent) + ")");
      ok(av.getAttribute('title') === 'priya.raman@x.com', "…with the full address on hover");

      // clearing it
      h().querySelector('[data-kbtiledit]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const none = [...mb().querySelectorAll('input[name=kbasg]')].find(r => r.value === '');
      none.checked = true;
      mb().querySelector('[data-kbte-save]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(w.eval('exec.boards[0].tiles[0].assignee') === undefined,
        "choosing Unassigned stores nothing rather than an empty string");

      /* The case the always-include rule exists for. */
      w.eval(`exec.boards[0].tiles[0].assignee="past.owner@x.com"; kbSetNarrow(true); renderAll();`);
      h().querySelector('[data-kbtiledit]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(names().indexOf('past.owner@x.com') >= 0,
        "a current assignee who owns nothing active here is still in the narrow list");
      ok((mb().querySelector('input[name=kbasg]:checked') || {}).value === 'past.owner@x.com',
        "…and is the selected row, so the picker agrees with the tile");
      ok(/owns nothing active here/.test(mb().textContent), "…with the reason stated");

      /* The loader was defined but never called, so the wide list silently fell back to whoever already
         owned objectives — people on the roster who own nothing here never appeared at all. */
      const execSrc = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8');
      ok(/\n  loadKbRoster\(\);/.test(execSrc), "the roster is actually loaded at startup, not merely defined");
      ok(!/await loadKbRoster\(\)/.test(execSrc),
        "…without awaiting it, so a slow or missing /roster cannot hold up the portfolio load");
      ok(/!u\.disabled/.test(execSrc), "…and a disabled account is left out of the picker");

      ok(/localStorage\.setItem\("rd_kb_narrow"/.test(
        fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/execution_app.html', 'utf8')),
        "the toggle is remembered per person, not stored on the board");
      ok(errs.length === 0, "no errors" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'exec flow threw: ' + (e && e.message)); }
  })();

  // ---------- the sales app ----------
  (function () {
    const { dom, errs } = boot('sales_app.html');
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED('sales'));
      const h = () => d.getElementById('subSG');
      h().querySelector('[data-kbaddboard]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      w.eval(`(function(){var b=exec.boards[0];
        b.tiles=[{id:"T1",name:"Acme",lane:b.swimlanes[0].id,col:b.columns[0].id,enteredCol:"2026-09-28"}];
        renderAll();})();`);
      h().querySelector('[data-kbtiledit]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const mb = d.getElementById('modalBody');
      ok(!!mb.querySelector('.asg-box'), "the sales app offers the picker too");
      ok(!!mb.querySelector('[data-kbnarrow]'), "…with the same toggle");
      const pick = [...mb.querySelectorAll('input[name=kbasg]')].find(r => r.value === 'corey.staller@x.com');
      pick.checked = true;
      mb.querySelector('[data-kbte-save]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      ok(w.eval('exec.boards[0].tiles[0].assignee') === 'corey.staller@x.com', "…and stores the assignee");
      ok((h().querySelector('.kb-av') || {}).textContent === 'CS', "…showing initials on the tile");
      const salesSrc = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/sales_app.html', 'utf8');
      ok(/\n  loadKbRoster\(\);/.test(salesSrc), "…loading the roster at startup there too");
      ok(errs.length === 0, "no errors in sales" + (errs[0] ? ': ' + errs[0].slice(0, 80) : ''));
    } catch (e) { ok(false, 'sales flow threw: ' + (e && e.message)); }
  })();

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} tile-assignment assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1600);
