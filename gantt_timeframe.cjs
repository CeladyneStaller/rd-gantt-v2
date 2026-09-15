// Gantt timeframe: a toggled set of quarters.
//
// The selector is a grid of years x quarters and clicking TOGGLES a cell, so a selection can end up
// non-contiguous — 2026Q1 and 2026Q4 with nothing between. A Gantt axis has to be one continuous span,
// so the window runs earliest-selected to latest-selected and the quarters in between are IMPLIED. The
// grid shades those differently, so it never claims a gap it cannot honour.
const RD = require((process.env.RD_SRC || '/home/claude') + '/rdcore.js');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const j = a => (a || []).join(',');

// ---------- the span is contiguous even when the selection is not ----------
(function () {
  ok(j(RD.quarterSpan(['2026Q2'])) === '2026Q2', "one quarter spans itself");
  ok(j(RD.quarterSpan(['2026Q2', '2026Q3'])) === '2026Q2,2026Q3', "two adjacent quarters span both");

  const gapped = RD.quarterSpan(['2026Q1', '2026Q4']);
  ok(j(gapped) === '2026Q1,2026Q2,2026Q3,2026Q4',
    "a GAPPED selection still yields a continuous window (" + j(gapped) + ")");
  ok(j(RD.quarterSpanImplied(['2026Q1', '2026Q4'])) === '2026Q2,2026Q3',
    "…and the quarters nobody clicked are reported as implied, so the grid can show them differently");
  ok(RD.quarterSpanImplied(['2026Q1', '2026Q2']).length === 0, "an adjacent pair implies nothing");

  // across a year boundary — the case a per-row grid could easily get wrong
  const across = RD.quarterSpan(['2026Q3', '2027Q2']);
  ok(j(across) === '2026Q3,2026Q4,2027Q1,2027Q2', "a span crosses the year boundary (" + j(across) + ")");
  ok(j(RD.quarterSpanImplied(['2026Q3', '2027Q2'])) === '2026Q4,2027Q1', "…implying the middle across years");

  // order of selection must not matter
  ok(j(RD.quarterSpan(['2027Q2', '2026Q3'])) === j(across), "selection order does not change the span");
})();

// ---------- the day window ----------
(function () {
  const r = RD.quarterSpanRange(['2026Q2', '2027Q1']);
  ok(!!r, "a selection yields a day window");
  ok(r.from === '2026Q2' && r.to === '2027Q1', "…named by its first and last quarter");
  ok(r.start === '2026-04-01', "…starting at the first day of the first quarter (" + r.start + ")");
  ok(r.end === '2027-03-31', "…ending at the last day of the last (" + r.end + ")");

  const one = RD.quarterSpanRange(['2026Q1']);
  ok(one.start === '2026-01-01' && one.end === '2026-03-31', "a single quarter covers exactly itself");

  ok(RD.quarterSpanRange([]) === null, "an EMPTY selection yields no window — the caller falls back to the current quarter");
  ok(RD.quarterSpanRange(null) === null, "…and so does nothing at all");
  ok(RD.quarterSpanRange(['nonsense']) === null, "a malformed quarter yields no window rather than a wrong one");
  ok(j(RD.quarterSpan(['2026Q2', 'nonsense'])) === '2026Q2', "…and is ignored inside an otherwise valid selection");
})();

// ---------- toggling ----------
(function () {
  ok(j(RD.toggleQuarter([], '2026Q2')) === '2026Q2', "clicking an unselected quarter adds it");
  ok(j(RD.toggleQuarter(['2026Q2'], '2026Q2')) === '', "clicking a SELECTED quarter removes it");
  ok(j(RD.toggleQuarter(['2026Q2'], '2026Q4')) === '2026Q2,2026Q4', "a second click adds rather than replacing");
  ok(j(RD.toggleQuarter(['2026Q4'], '2026Q1')) === '2026Q1,2026Q4', "…and the result stays in chronological order");

  // an IMPLIED quarter is not in the set, so clicking it adds it and the window does not move
  const sel = ['2026Q1', '2026Q4'];
  const before = RD.quarterSpanRange(sel);
  const after = RD.toggleQuarter(sel, '2026Q2');
  ok(after.indexOf('2026Q2') >= 0, "clicking an implied quarter makes it explicit");
  const afterR = RD.quarterSpanRange(after);
  ok(afterR.start === before.start && afterR.end === before.end,
    "…without moving the window, which is the point of showing it as implied");
  ok(RD.quarterSpanImplied(after).length === 1, "…and one fewer quarter is implied");

  ok(j(RD.toggleQuarter(['2026Q2'], 'junk')) === '2026Q2', "toggling a malformed quarter changes nothing");
})();

// ---------- the year button ----------
(function () {
  ok(j(RD.yearQuarters(2026)) === '2026Q1,2026Q2,2026Q3,2026Q4', "a year is its four quarters");

  ok(j(RD.toggleYear([], 2026)) === '2026Q1,2026Q2,2026Q3,2026Q4', "clicking a year selects all four");
  ok(j(RD.toggleYear(RD.yearQuarters(2026), 2026)) === '', "clicking a FULLY selected year clears it");
  /* a partly selected year fills rather than clearing: otherwise the button's effect depends on which
     cells happen to be on, and the user cannot predict it before clicking */
  ok(j(RD.toggleYear(['2026Q2'], 2026)) === '2026Q1,2026Q2,2026Q3,2026Q4',
    "a PARTLY selected year fills to all four rather than clearing");

  // other years are untouched either way
  const mixed = RD.toggleYear(['2025Q4', '2026Q2'], 2026);
  ok(mixed.indexOf('2025Q4') >= 0, "filling a year leaves other years alone");
  const cleared = RD.toggleYear(['2025Q4'].concat(RD.yearQuarters(2026)), 2026);
  ok(j(cleared) === '2025Q4', "…and so does clearing one (" + j(cleared) + ")");
})();

// ---------- the grid, in the built app ----------
(function () {
  const fs = require('fs');
  const src = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/planning_app.html', 'utf8');
  const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
  const d = new JSDOM(src, { virtualConsole: new VirtualConsole() }).window.document;
  const rules = [...d.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
  const rule = (p) => rules.find(r => r.selectorText && p(r.selectorText));
  const css = (r) => r ? String(r.style.cssText) : '';

  ok(/function ganttTimeframeGridHtml\(/.test(src), "the app builds a timeframe grid");
  ok(/data-tfq=/.test(src) && /data-tfy=/.test(src), "…with quarter cells and a year button per row");

  /* A builder that exists is not a control the user can see. The first version returned "" unless the
     quarter view was already on — so the grid was hidden behind the very toggle it replaces, and to
     anyone who had never turned that on it simply did not exist. Render it and look. */
  const { JSDOM: J2, VirtualConsole: V2 } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
  const live = new J2(src, { runScripts: 'dangerously', virtualConsole: new V2(),
    url: 'https://x.test/?token=t&tab=gantt', pretendToBeVisual: true,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
      w.requestAnimationFrame = cb => setTimeout(cb, 0); w.cancelAnimationFrame = () => {};
      w.fetch = () => Promise.reject(new Error('no net'));
      w.cytoscape = function () { return { on(){}, ready(cb){ try{ cb && cb(); }catch(e){} }, fit(){}, resize(){},
        destroy(){}, getElementById(){ return { length: 0 }; }, zoom(){ return 1; }, width(){ return 800; },
        height(){ return 560; }, layout(){ return { run(){} }; }, $(){ return { unselect(){} }; } }; };
    } });
  const lw = live.window, ld = lw.document;
  lw.eval('portfolio={units:[],divisions:[{id:"D",name:"D",kind:"rd"}],products:[],models:[],' +
    'initiatives:[{id:"I",name:"I",divisionId:"D"}],objectives:[{id:"O1",statement:"O",divisionId:"D",' +
    'initiativeId:"I",quarter:"2026Q2",plannedStart:2300,plannedEnd:2500}],milestones:[],kpis:[],' +
    'kpiDefs:[],kpiUpdates:[],catchupPlans:[]}; ganttQtrZoom=false; ganttQuarters=[]; renderGantt();');

  ok(ld.querySelectorAll('.tfgrid').length === 1,
    "the grid RENDERS on the gantt even with the quarter limit off — it is the control, not a detail of it");
  ok(ld.querySelectorAll('[data-tfq]').length === 4, "…with a cell per quarter (" + ld.querySelectorAll('[data-tfq]').length + ")");
  ok(ld.querySelectorAll('[data-tfy]').length >= 1, "…and a year button per row");
  ok(ld.querySelectorAll('.tfgrid.off').length === 1, "…dimmed while the limit is off, so it reads as available rather than active");

  // clicking must not appear to do nothing. Guarded: with the grid unmounted this is null, and an
  // unguarded deref would CRASH the harness — which reads as an error, not a named failure, and makes
  // a mutation that deletes the grid look like it survived.
  const cell = ld.querySelector('[data-tfq]');
  if (cell) cell.dispatchEvent(new lw.MouseEvent('click', { bubbles: true }));
  ok(!!cell && lw.eval('ganttQtrZoom') === true, "choosing a quarter turns the limit ON, so the first click is never a no-op");
  ok(!!cell && lw.eval('ganttQuarters.length') > 0, "…and records the choice");
  ok(ld.querySelectorAll('.tfgrid.off').length === 0, "…and the grid stops being dimmed");

  const grid = rule(t => /\.tfgrid$/.test(t));
  ok(!!grid && /grid-template-columns:\s*56px repeat\(4, ?64px\)/.test(css(grid)),
    "…laid out as a year label plus four quarters per row");

  // the implied middle must be visibly weaker than an explicit pick, or the grid overstates the choice
  const on = rule(t => /\.tfq\.on$/.test(t));
  const imp = rule(t => /\.tfq\.on\.imp$/.test(t));
  ok(!!on && !!imp, "chosen and implied quarters are styled differently");
  ok(/font-weight:\s*600/.test(css(on)) && /font-weight:\s*400/.test(css(imp)),
    "…the implied ones weaker, so the grid does not claim a gap it cannot honour");
  ok(/border-style:\s*dashed/.test(css(imp)), "…and dashed, distinguishable without relying on colour");
  ok(!!rule(t => /\.tfq\.now/.test(t)), "the current quarter is marked");

  // the years offered come from the plan, capped
  ok(/function ganttGridYears\(/.test(src), "the years are derived from the plan");
  ok(/if\(list\.length>3\)/.test(src), "…capped at three");
  ok(/ys\[nowY\]=1/.test(src), "…always including the current year, so there is a way back");

  /* Two date shapes are in play: objective quarters resolve to ISO strings, while plannedStart/
     plannedEnd are DAY NUMBERS. The first version ran day numbers through an ISO slice, producing
     nonsense like "2500" — so milestones contributed nothing and a long initiative was invisible. */
  const years = (plan) => { lw.eval('portfolio=' + JSON.stringify(plan) + ';'); return JSON.parse(lw.eval('JSON.stringify(ganttGridYears())')); };
  const day = (iso) => lw.eval('isoToDay("' + iso + '")');
  const base = { units: [], divisions: [{ id: 'D', name: 'D', kind: 'rd' }], products: [], models: [],
    kpis: [], kpiDefs: [], kpiUpdates: [], catchupPlans: [], milestones: [], objectives: [], initiatives: [] };

  // an initiative running past its objectives must still be reachable — the reported case
  const longInit = Object.assign({}, base, {
    initiatives: [{ id: 'I', name: 'Long', divisionId: 'D', plannedStart: day('2026-01-01'), plannedEnd: day('2028-12-31') }],
    objectives: [{ id: 'O1', statement: 'O', divisionId: 'D', initiativeId: 'I', quarter: '2026Q2' }] });
  const ly = years(longInit);
  ok(ly.indexOf(2028) >= 0, "an initiative ending in 2028 puts 2028 in the grid, even with no objective out there (" + ly.join(',') + ")");
  ok(ly.indexOf(2027) >= 0, "…and the year BETWEEN is offered too, so the range has no holes");
  ok(ly.indexOf(2026) >= 0, "…along with the year the work starts");

  // milestones count as well, and their dates are day numbers
  /* The milestone is the ONLY thing reaching 2027 here — no initiative dates, no objective — so this
     fails if milestones stop being scanned, rather than being covered by something else. */
  const msPlan = Object.assign({}, base, {
    initiatives: [],
    milestones: [{ id: 'M', name: 'M', plannedStart: day('2026-02-01'), plannedEnd: day('2027-09-30') }] });
  const my = years(msPlan);
  ok(my.indexOf(2027) >= 0, "a MILESTONE reaching 2027 is counted (" + my.join(',') + ")");
  ok(my.every(y => y > 2000 && y < 2100), "…and no day number leaks through as a bogus year");

  // an objective's own planned dates, not just its quarter
  const objPlan = Object.assign({}, base, {
    initiatives: [{ id: 'I', name: 'I', divisionId: 'D' }],
    objectives: [{ id: 'O', statement: 'O', divisionId: 'D', initiativeId: 'I', plannedStart: day('2026-03-01'), plannedEnd: day('2027-06-30') }] });
  ok(years(objPlan).indexOf(2027) >= 0, "an objective's planned end counts even without a quarter tag");

  const capped = years(Object.assign({}, base, {
    initiatives: [{ id: 'I', name: 'I', divisionId: 'D', plannedStart: day('2026-01-01'), plannedEnd: day('2032-12-31') }] }));
  ok(capped.length === 3, "a very long plan is still capped at three years (" + capped.join(',') + ")");

  // empty falls back to the current quarter, never a blank chart
  ok(/function ganttEffectiveQuarters\(/.test(src), "an effective selection is resolved separately from the stored one");
  ok(/if\(ganttQuarters\.length\) return ganttQuarters;/.test(src) && /return RD\.quarterRange\(q\) \? \[q\] : \[\];/.test(src),
    "…falling back to the CURRENT quarter when nothing is selected");
  ok(/nothing selected/.test(src), "…and saying so, rather than looking like a chosen window");

  // per person, not in the document
  ok(/localStorage\.setItem\("rd_gantt_quarters"/.test(src), "the selection is remembered per person");
  ok(!/portfolio\.[a-z]*\s*=\s*[^;]*ganttQuarters/i.test(src),
    "…in localStorage, not written into the plan where it would change the view for everyone");

  // the window is driven by the span, not a single quarter
  ok(/RD\.quarterSpanRange\(ganttEffectiveQuarters\(\)\)/.test(src),
    "the axis window comes from the selected span");
  ok(/lo:a-GANTT_QBUF, hi:b\+GANTT_QBUF/.test(src), "…keeping the 7-day axis buffer at both ends");
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} quarter-span assertions green`);
process.exit(fails.length ? 1 : 0);
