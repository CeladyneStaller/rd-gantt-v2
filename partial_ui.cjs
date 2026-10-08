// Partial check-in UI, execution AND sales apps, from one seed (only the division kind differs) so the two
// screens are held to identical expectations rather than to two hand-kept copies that drift.
//
// The seed is the approved mockup's scenario. Every number asserted below is what the engine produces for
// it (see partial_discount.cjs): KR1 57 / 92 raw, objective 70 / 88 raw, gate A2 75 / 100 raw.
//
// What a passing run means: each discounted number on screen is accompanied by its undiscounted figure and
// the Partial tag; the measurement (Current) is coloured by what it achieved, not by the discount; a partial
// target is never "met"; complete rows carry none of it; and a partial gate does not auto-pass.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const OUT = process.env.RD_OUT || '/home/claude/work';
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const boot = (file) => {
  const vc = new VirtualConsole(); const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = new JSDOM(fs.readFileSync(OUT + '/' + file, 'utf8'), {
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
var td=todayDay();
portfolio={units:[],divisions:[{id:'D',name:'D',kind:'${kind}'}],initiatives:[{id:'I',name:'I',divisionId:'D'}],
  objectives:[{id:'O',statement:'O',divisionId:'D',initiativeId:'I',quarter:'2026Q4',plannedStart:td-190,plannedEnd:td+84}],
  milestones:[],products:[],models:[],kpis:[],kpiDefs:[],kpiUpdates:[],catchupPlans:[]};
divisionId='D'; selectedObj='O'; exec=blankExec();
exec.keyResults=[{id:'KR1',objectiveId:'O',statement:'uniformity',trackingType:'kpi'},
                 {id:'KR2',objectiveId:'O',statement:'protocol',trackingType:'percentage',progress:84}];
exec.stageGateSets=[{id:'S1',objectiveId:'O',name:'Durability',order:0}];
exec.stageGates=[{id:'A1',objectiveId:'O',setId:'S1',name:'build',plannedDate:td-50,actualDate:td-53,order:0},
                 {id:'A2',objectiveId:'O',setId:'S1',name:'screen',plannedDate:td+37,order:1}];
exec.kpis=[
 {id:'V',objectiveId:'O',hostType:'keyResult',hostId:'KR1',name:'Cell voltage',direction:'down',target:1.85,unit:'V',targetType:'statistical',statistic:'average',readCount:10},
 {id:'H',objectiveId:'O',hostType:'keyResult',hostId:'KR1',name:'HFR',direction:'down',target:60,unit:'mOhm',targetType:'statistical',statistic:'median',readCount:10},
 {id:'X',objectiveId:'O',hostType:'keyResult',hostId:'KR1',name:'Crossover',direction:'down',target:1.0,unit:'%',targetType:'demonstration'},
 {id:'LK',objectiveId:'O',hostType:'stageGate',hostId:'A1',name:'Leak test',targetType:'binary'},
 {id:'DEC',objectiveId:'O',hostType:'stageGate',hostId:'A2',name:'Decay',direction:'down',target:10,unit:'uV/h',targetType:'statistical',statistic:'average',readCount:6},
 {id:'XO',objectiveId:'O',hostType:'stageGate',hostId:'A2',name:'Crossover 500h',direction:'down',target:1.0,unit:'%',targetType:'demonstration'}];
var t=1000, r=function(id,vals){ return vals.map(function(v){ t+=60000; return {kpiId:id,value:v,timestamp:t}; }); };
exec.kpiUpdates=[].concat(r('V',[1.81,1.83,1.82,1.84]), r('H',[74,81,79,86]), r('X',[0.62]), r('LK',[1]), r('DEC',[8.1,9.0,8.2]), r('XO',[0.71]));
expandedKRs.add('KR1'); expandedGates.add('A2');
renderAll();`;

const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

function runApp(file, kind, label) {
  const { dom, errs } = boot(file);
  const w = dom.window, d = w.document;
  try {
    w.eval(SEED(kind));
    const T = (s) => label + ': ' + s;
    const krBlock = id => [...d.querySelectorAll('#subKR .kr-block')].find(b => b.querySelector(`[data-edit="keyResult:${id}"]`));
    const gateBlock = id => [...d.querySelectorAll('#subSG .gate-block')].find(b => b.querySelector(`[data-edit="stageGate:${id}"]`));
    const row = (host, kpiId) => { const a = host && host.querySelector(`[data-edit="kpi:${kpiId}"]`); return a ? a.closest('tr') : null; };

    // ---------- KPI table ----------
    const kr1 = krBlock('KR1'), tbl = kr1 && kr1.querySelector('table.mtbl');
    ok(!!tbl, T('KR1 renders its KPI table'));
    const heads = tbl ? [...tbl.querySelectorAll('thead th')].map(th => txt(th)) : [];
    ok(heads.join('|') === 'KPI|Target|Unit|Current|Score|Status|', T('a Score column sits between Current and Status (' + heads.join('|') + ')'));
    ok(tbl && tbl.querySelectorAll('colgroup col').length === 7, T('...and the colgroup has 7 widths to match'));

    const rV = row(kr1, 'V'), rH = row(kr1, 'H'), rX = row(kr1, 'X');
    const cells = r => r ? [...r.children] : [];
    const [, , , curV, scoreV, statusV] = cells(rV);
    ok(txt(scoreV.querySelector('.sv')) === '40', T('a partial KPI shows its DISCOUNTED score (40)'));
    const mathV = scoreV.querySelector('.pt-math');
    ok(mathV && txt(mathV) === '100 × 4/10 samples', T('...with the math beneath it: "' + txt(mathV) + '"'));
    ok(mathV && mathV.querySelector('b.met') && txt(mathV.querySelector('b.met')) === '100',
      T('...where the undiscounted 100 carries its own band colour (met), not the discounted one'));
    ok(scoreV.querySelector('.sv').classList.contains('miss'), T('...and the discounted 40 is coloured by ITS band (miss)'));
    ok(curV.classList.contains('met') && !curV.classList.contains('miss'),
      T('Current is coloured by the measurement against its target (met), not by the discount'));
    ok(txt(curV).startsWith('1.825') && txt(curV).indexOf('1.8250000') < 0, T('a computed statistic is rounded (1.825, not 1.8250000000000002)'));
    ok(/4\/10/.test(txt(curV)), T('...and still shows its 4/10 completeness'));
    const stack = statusV.querySelector('.st-stack');
    ok(!!stack, T('a partial status is a stack'));
    const kids = stack ? [...stack.children] : [];
    ok(kids.length === 2 && kids[0].classList.contains('pt-tag') && txt(kids[0]) === 'Partial', T('...the Partial tag on top'));
    ok(kids[1] && kids[1].classList.contains('m-badge') && txt(kids[1]) === 'on track' && kids[1].classList.contains('met'),
      T('...over the status the raw 100 earns: "on track" — never "met" on a partial sample (' + txt(kids[1]) + ')'));
    const [, , , curH, scoreH, statusH] = cells(rH);
    ok(txt(scoreH.querySelector('.sv')) === '30' && txt(scoreH.querySelector('.pt-math')) === '75 × 4/10 samples'
      && scoreH.querySelector('.pt-math b.near'), T('an off-target partial: 30, from an amber 75 × 4/10'));
    ok(curH.classList.contains('near'), T('...its Current amber (near), from the raw 75'));
    ok(txt(statusH.querySelector('.m-badge')) === 'near', T('...status Partial over "near"'));
    const [, , , curX, scoreX, statusX] = cells(rX);
    ok(txt(scoreX) === '100' && !scoreX.querySelector('.pt-math'), T('a complete KPI scores 100 with no math'));
    ok(!statusX.querySelector('.st-stack') && !statusX.querySelector('.pt-tag') && txt(statusX) === 'met', T('...and a plain "met", no Partial tag'));

    // ---------- KR block ----------
    ok(!!kr1.querySelector('.g-status-cell .pt-tag') && txt(kr1.querySelector('.g-status-cell .pt-tag')) === 'Partial check-in',
      T('the KR carries a "Partial check-in" tag beside its band'));
    ok(txt(kr1.querySelector('.r-val')).startsWith('57'), T('...its attainment is the discounted 57%'));
    const hatch = kr1.querySelector('.pace-bar .pt-hatch');
    ok(hatch && /left:\s*56\.6/.test(hatch.getAttribute('style')) && /width:\s*35/.test(hatch.getAttribute('style')),
      T('...the bar is hatched from 57 to 92: ' + (hatch && hatch.getAttribute('style'))));
    const cap = kr1.querySelector('.pt-cap');
    ok(cap && /92% without discount/.test(txt(cap)) && /8 of 20 samples/.test(txt(cap)), T('...captioned "' + txt(cap) + '"'));
    ok(/2 partial/.test(txt(kr1.querySelector('[data-krtoggle]'))), T('...and its KPI toggle counts "2 partial"'));
    const kr2 = krBlock('KR2');
    ok(kr2 && !kr2.querySelector('.pt-tag, .pt-hatch, .pt-cap'), T('a complete KR carries none of it'));

    // ---------- gate ----------
    const a2 = gateBlock('A2'), a1 = gateBlock('A1');
    ok(a2 && txt(a2.querySelector('.statepill')) === 'pending', T('gate A2, all targets at target on 3 of 6 cells, is still PENDING — it did not auto-pass'));
    ok(w.eval('exec.stageGates.find(g=>g.id==="A2").actualDate') == null, T('...its actualDate stayed empty through autoCompleteGates'));
    ok(a2 && a2.querySelector('.g-status-cell .pt-tag'), T('...it carries the Partial tag under its state'));
    ok(txt(a2.querySelector('.g-ready .r-val')).startsWith('75'), T('...readiness is the discounted 75%'));
    ok(a2.querySelector('.r-bar .pt-hatch'), T('...hatched to 100'));
    const gcap = [...a2.querySelectorAll('.g-ready .pt-cap')].map(txt).join(' / ');
    ok(/100% without discount/.test(gcap) && /3 of 6 samples/.test(gcap) && /reaches 100 only once all 6 are in/.test(gcap), T('...captioned "' + gcap + '"'));
    ok(/1 partial/.test(txt(a2.querySelector('[data-gtoggle]'))), T('...its Targets toggle counts "1 partial"'));
    ok(a1 && !a1.querySelector('.pt-tag, .pt-hatch, .pt-cap'), T('a complete gate carries none of it'));

    // the other half of the auto-pass contract: complete the sample and the gate DOES pass
    w.eval(`exec.kpiUpdates.push({kpiId:'DEC',value:8.4,timestamp:900001},{kpiId:'DEC',value:8.8,timestamp:900002},{kpiId:'DEC',value:8.6,timestamp:900003}); renderAll();`);
    ok(w.eval('exec.stageGates.find(g=>g.id==="A2").completionMethod') === 'auto' && w.eval('exec.stageGates.find(g=>g.id==="A2").actualDate') != null,
      T('with all 6 cells in, the gate auto-passes ("Targets achieved")'));
    w.eval(`exec.kpiUpdates=exec.kpiUpdates.filter(u=>u.timestamp<900000); var g2=exec.stageGates.find(g=>g.id==="A2"); g2.actualDate=null; delete g2.completionMethod; renderAll();`);

    // ---------- metric strip ----------
    const mc = [...d.querySelectorAll('.metrics .mc')];
    const objCard = mc.find(c => /Objective score/i.test(txt(c.querySelector('.mc-label'))));
    ok(objCard && txt(objCard.querySelector('.mc-val')) === '70', T('the objective score is the discounted 70'));
    ok(objCard && objCard.querySelector('.pt-tag') && /88 without discount/.test(txt(objCard)), T('...tagged Partial, with "88 without discount"'));
    ok(objCard && objCard.querySelector('.mc-bar .pt-hatch'), T('...and its bar hatched to 88'));
    const krCard = mc.find(c => /Key results/i.test(txt(c.querySelector('.mc-label'))));
    ok(krCard && /1 partial/.test(txt(krCard)), T('the Key results card counts "1 partial"'));

    // ---------- readings popover ----------
    w.eval(`openSamplePop(document.querySelector('[data-postcell="V"]'), 'V');`);
    const pop = d.getElementById('samplePop'), sp = pop && pop.querySelector('.sp-partial');
    ok(!!sp, T('the readings popover for a partial KPI explains the check-in'));
    ok(sp && /Scores 40/.test(txt(sp)) && /100 without discount/.test(txt(sp)), T('...what it scores now and undiscounted: "' + txt(sp && sp.querySelector('.sp-pt-row')) + '"'));
    ok(sp && txt(sp.querySelector('.sp-pt-math')) === '100 × 4/10 samples = 40' && sp.querySelector('.sp-pt-math b.met'), T('...the math, raw figure band-coloured'));
    ok(sp && /6 more readings to a full check-in/.test(txt(sp)), T('...and how many readings are still owed'));
    w.eval(`openSamplePop(document.querySelector('[data-postcell="X"]'), 'X');`);
    ok(!d.querySelector('#samplePop .sp-partial'), T('a complete KPI\'s popover has no partial block'));

    // ---------- the readiness bar that never rendered ----------
    const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
    ok(/\.g-ready \.r-fill\{display:block/.test(css),
      T('the readiness fill is display:block — as an inline span it rendered 0x0 in real browsers (measured in Chromium)'));

    ok(errs.length === 0, T('no errors' + (errs[0] ? ': ' + errs[0].slice(0, 100) : '')));
  } catch (e) { ok(false, label + ' flow threw: ' + (e && e.message)); }
}

setTimeout(() => {
  runApp('execution_app.html', 'rd', 'exec');
  runApp('sales_app.html', 'sales', 'sales');
  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} partial check-in UI assertions green`);
  process.exit(fails.length ? 1 : 0);
}, 1500);
