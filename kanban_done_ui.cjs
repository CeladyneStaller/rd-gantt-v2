// Done-column menu in the execution AND sales apps, from one seed (only the division kind differs).
//
// What a passing run means: an untouched board looks exactly as it did (every finished tile, as a card, in the
// board's own order); the menu changes only this viewer's view of this board — never the document, never the
// "closed" count; a window hides older finished tiles behind "+N older"; compact rows are still real tiles
// (draggable back out of Done); and the choice survives a reload, per board.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const OUT = process.env.RD_OUT || '/home/claude/work';
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const boot = (file, stored) => {
  const vc = new VirtualConsole(); const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(fs.readFileSync(OUT + '/' + file, 'utf8'), {
    runScripts: 'dangerously', virtualConsole: vc, url: 'https://x.test/?division=D&token=t', pretendToBeVisual: true,
    beforeParse(w) {
      if (stored) w.localStorage.setItem('rd_kb_done', JSON.stringify(stored));   // a previous session's choice
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

/* Industrial gas is deliberately out of recency order on the board (Matheson, 38 days, before Praxair, 5 days):
   an untouched board must keep that order, and only an opted-in view may sort newest-first. */
/* persist() is stubbed only to keep the test off the network. renderAll calls it on EVERY render (the real one
   returns early unless the document actually changed), so counting calls proves nothing; the test instead
   compares the whole document before and after — an unchanged document is one there is nothing to save. */
const SEED = (kind) => `persist=function(){};
var base=Date.parse(todayIso()+'T00:00:00Z'), iso=function(n){ return new Date(base-n*86400000).toISOString().slice(0,10); };
portfolio={units:[],divisions:[{id:'D',name:'D',kind:'${kind}'}],initiatives:[{id:'I',name:'I',divisionId:'D'}],
  objectives:[{id:'O',statement:'O',divisionId:'D',initiativeId:'I',quarter:'2026Q4',plannedStart:1,plannedEnd:99999}],
  milestones:[],products:[],models:[],kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
divisionId='D'; selectedObj='O'; exec=blankExec();
var T=function(id,lane,col,age){ return {id:id,name:id,lane:lane,col:col,startDate:iso(age+20),enteredCol:iso(age)}; };
exec.boards=[{id:'B1',objectiveId:'O',name:'Pipeline',columns:[{id:'c1',name:'Prospect'},{id:'c2',name:'Working'},{id:'c3',name:'Proposal'},{id:'c4',name:'Closed'}],
  swimlanes:[{id:'L1',name:'Utilities',maxDaysPerCol:14},{id:'L2',name:'Industrial gas',maxDaysPerCol:21},{id:'L3',name:'Mobility',maxDaysPerCol:14}],
  tiles:[T('Idaho','L1','c1',3),T('PacifiCorp','L1','c2',9),T('Avista','L1','c3',4),T('AirLiquide','L2','c2',12),T('Linde','L2','c3',19),
    T('Nikola','L3','c1',2),T('Seattle','L3','c2',15),
    T('RockyMtn','L1','c4',2),T('NV','L1','c4',11),T('Xcel','L1','c4',26),T('APS','L1','c4',47),T('SMUD','L1','c4',83),
    T('Matheson','L2','c4',38),T('Praxair','L2','c4',5),T('AirProducts','L2','c4',19),T('Messer','L2','c4',64),
    T('Hyzon','L3','c4',8),T('Plug','L3','c4',33),T('Daimler','L3','c4',71)]},
 {id:'B2',objectiveId:'O',name:'Second board',columns:[{id:'x1',name:'Open'},{id:'x2',name:'Done'}],swimlanes:[{id:'M1',name:'Lane',maxDaysPerCol:14}],
  tiles:[T('OldOne','M1','x2',90),T('NewOne','M1','x2',1)]}];
exec.gateMode={O:'kanban'};
renderAll();`;

const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

function runApp(file, kind, label) {
  const T_ = s => label + ': ' + s;
  // ---------------- session 1 ----------------
  {
    const { dom, errs } = boot(file);
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED(kind));
      const host = () => d.getElementById('subSG');
      const doneTh = () => [...host().querySelectorAll('th.kb-colh')].pop();
      const doneCell = lane => host().querySelector(`[data-kbcell="${lane}:c4"]`);
      const names = lane => [...doneCell(lane).querySelectorAll('[data-kbtile]')].map(e => e.getAttribute('data-kbtile')).join(',');
      const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
      const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
      const boardJson = () => w.eval('JSON.stringify(exec.boards)');
      const docJson = () => w.eval('JSON.stringify(exec)');

      // --- untouched: exactly as before ---
      ok(txt(doneTh().querySelector('.kb-donebtn')) === 'all ▾', T_('an untouched board says "all" on the Done column'));
      ok(txt(doneTh().querySelector('.kb-colcnt')) === '12', T_('...and counts all 12 finished tiles'));
      ok(host().querySelectorAll('[data-kbcell$=":c4"] .kb-tile.closed:not(.kb-drow)').length === 12, T_('...drawn as 12 cards'));
      ok(!host().querySelector('.kb-older, .kb-drow'), T_('...with no "+N older" and no compact rows'));
      ok(names('L2') === 'Matheson,Praxair,AirProducts,Messer', T_("...in the board's own order (" + names('L2') + ')'));
      const rocky = host().querySelector('[data-kbtile="RockyMtn"]');
      ok(/done 2d ago/.test(txt(rocky)), T_('a finished card says how long ago it finished: "' + txt(rocky.querySelector('.kb-tmeta')) + '"'));
      const before = boardJson(), beforeDoc = docJson();

      // --- the menu ---
      click(doneTh().querySelector('.kb-donebtn'));
      const menu = () => host().querySelector('.kb-donemenu');
      ok(!!menu(), T_('the Done-column button opens the menu'));
      ok(menu() && menu().querySelectorAll('[data-kbdonewin]').length === 6 && menu().querySelectorAll('[data-kbdonestyle]').length === 2,
        T_('...6 windows and 2 styles'));
      ok(menu() && menu().querySelector('[data-kbdonewin="all"]').checked && menu().querySelector('[data-kbdonestyle="cards"]').checked,
        T_('...showing the current choice: all, cards'));
      /* nobody is signed in to the Hub in this harness (kanban_done_sync_ui.cjs covers signed in) */
      ok(/Saved in this browser only\. Open this board from the Hub to keep it on every device\./.test(txt(menu()))
        && menu().querySelector('[data-kbdonenote="local"]'), T_('...and saying, signed out, that the choice stays in this browser'));

      // --- last 14 days ---
      const pick = (attr, v) => { const r = menu().querySelector(`[${attr}="${v}"]`); r.checked = true; fire(r, 'change'); };
      pick('data-kbdonewin', '14');
      ok(txt(doneTh().querySelector('.kb-colcnt')) === '4 of 12' && txt(doneTh().querySelector('.kb-donebtn')) === 'last 14 days ▾',
        T_('last 14 days: the header reads "4 of 12" and "last 14 days"'));
      ok(names('L1') === 'RockyMtn,NV' && names('L2') === 'Praxair' && names('L3') === 'Hyzon', T_('...only the four finished in the last 14 days are drawn'));
      ok(txt(doneCell('L1').querySelector('.kb-older')) === '+3 older' && txt(doneCell('L2').querySelector('.kb-older')) === '+3 older'
        && txt(doneCell('L3').querySelector('.kb-older')) === '+2 older', T_('...each lane says how many older ones it holds'));
      ok(!!menu(), T_('...and the menu stays open, so the style can be set too'));
      ok([...host().querySelectorAll('.kb-chip')].some(c => txt(c) === '12 closed'), T_('the summary still counts 12 closed — hiding is not deleting'));

      // --- compact rows ---
      pick('data-kbdonestyle', 'compact');
      const rows = host().querySelectorAll('.kb-drow');
      ok(rows.length === 4 && txt(doneTh().querySelector('.kb-donebtn')) === 'last 14 days · compact ▾', T_('compact: the four become one-line rows'));
      ok([...rows].every(r => r.classList.contains('kb-tile') && r.getAttribute('draggable') === 'true' && r.dataset.kbtile && r.querySelector('[data-kbtiledit]')),
        T_('...each still a draggable, editable tile'));
      ok(txt(host().querySelector('[data-kbtile="NV"] .kb-dage')) === '11d', T_('...showing its age (11d)'));

      // --- open one lane's older tiles ---
      click(doneCell('L2').querySelector('.kb-older'));
      ok(names('L2') === 'Praxair,AirProducts,Matheson,Messer', T_('"+3 older" opens that lane newest-first (' + names('L2') + ')'));
      ok(txt(doneCell('L2').querySelector('.kb-older')) === 'hide older', T_('...and becomes "hide older"'));
      ok(names('L1') === 'RockyMtn,NV', T_('...other lanes stay as they were'));
      click(doneCell('L2').querySelector('.kb-older'));
      ok(names('L2') === 'Praxair', T_('"hide older" folds them away again'));

      // --- count only ---
      /* the "+3 older" clicks were clicks outside the menu, which closes it — by design — so reopen it first */
      ok(!menu(), T_('clicking "+3 older" (outside the menu) closed the menu'));
      if (!menu()) click(doneTh().querySelector('.kb-donebtn'));   // the button toggles, so only press it if the menu is shut
      pick('data-kbdonewin', 'none');
      ok(host().querySelectorAll('[data-kbcell$=":c4"] [data-kbtile]').length === 0 && txt(doneTh().querySelector('.kb-colcnt')) === '0 of 12',
        T_('count only: no finished tile drawn, "0 of 12"'));
      ok(txt(doneCell('L1').querySelector('.kb-older')) === '5 done' && txt(doneCell('L3').querySelector('.kb-older')) === '3 done',
        T_('...each lane says how many are done'));

      // --- it was a view, not an edit ---
      ok(boardJson() === before, T_('none of this changed the board itself'));
      ok(docJson() === beforeDoc, T_('...nor anything else in the shared document, so there is nothing for a save to send'));
      ok(!/rd_kb_done|kbDone|doneWin/.test(docJson()), T_('...and the document carries no trace of the Done-column choice'));
      const stored = JSON.parse(w.localStorage.getItem('rd_kb_done') || '{}');
      ok(stored.B1 && stored.B1.win === 'none' && stored.B1.style === 'compact', T_('the choice is kept in this browser, per board: ' + JSON.stringify(stored.B1)));

      // --- closing the menu ---
      const ev = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }); menu().dispatchEvent(ev);
      ok(!menu(), T_('Escape closes the menu'));
      click(doneTh().querySelector('.kb-donebtn'));
      click(d.body);
      ok(!menu(), T_('...and so does a click anywhere else'));

      // --- per board ---
      w.eval(`kanbanBoardSel='B2'; renderAll();`);
      const th2 = [...host().querySelectorAll('th.kb-colh')].pop();
      ok(txt(th2.querySelector('.kb-donebtn')) === 'all ▾' && host().querySelectorAll('[data-kbcell$=":x2"] .kb-tile').length === 2,
        T_("another board keeps its own setting (all), unaffected by this board's"));
      w.eval(`kanbanBoardSel='B1'; renderAll();`);

      // --- a compact row can be dragged back out of Done ---
      pick && w.eval(`kbSetDonePrefs('B1',{win:14,style:'compact'}); renderAll();`);
      const row = host().querySelector('.kb-drow[data-kbtile="RockyMtn"]');
      fire(row, 'dragstart');
      fire(host().querySelector('[data-kbcell="L1:c2"]'), 'drop');
      ok(w.eval('exec.boards[0].tiles.find(t=>t.id==="RockyMtn").col') === 'c2', T_('dragging a compact row into Working reopens the tile'));
      ok(txt([...host().querySelectorAll('.kb-chip')].find(c => /closed/.test(txt(c)))) === '11 closed', T_('...and the closed count drops to 11'));

      ok(errs.length === 0, T_('no errors' + (errs[0] ? ': ' + errs[0].slice(0, 100) : '')));
    } catch (e) { ok(false, label + ' session 1 threw: ' + (e && e.message)); }
  }
  // ---------------- session 2: the choice survives a reload ----------------
  {
    const { dom, errs } = boot(file, { B1: { win: 14, style: 'compact' } });
    const w = dom.window, d = w.document;
    try {
      w.eval(SEED(kind));
      const host = d.getElementById('subSG');
      ok(host.querySelectorAll('.kb-drow').length === 4 && /last 14 days · compact/.test(txt(host.querySelector('.kb-donebtn'))),
        label + ': after a reload the board opens as this viewer left it (last 14 days, compact)');
      ok(errs.length === 0, label + ': no errors on reload' + (errs[0] ? ': ' + errs[0].slice(0, 100) : ''));
    } catch (e) { ok(false, label + ' session 2 threw: ' + (e && e.message)); }
  }
}

setTimeout(() => {
  runApp('execution_app.html', 'rd', 'exec');
  runApp('sales_app.html', 'sales', 'sales');
  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} done-column UI assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1500);
