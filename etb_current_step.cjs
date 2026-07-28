// Current step as a measurement surface. Drives the REAL section: clicks the real current-value
// cells, types into the real input, and checks where the reading landed and what the step's status
// became. The invariant under test throughout: measuring is NOT concluding — no path through this
// card may write an actual_outcome.
const { JSDOM, VirtualConsole } = require("jsdom"); const fs = require("fs");
const OUT = (process.env.RD_OUT || '/mnt/user-data/outputs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
process.on("unhandledRejection", e => { const t=String((e&&e.message)||e); if(/Invalid time value/.test(t)) return; throw e; });

const portfolio = { units:[], divisions:[{id:"DIV-FC",name:"FC",kind:"rd"}], products:[], models:[],
  initiatives:[{id:"I1",name:"I",divisionId:"DIV-FC"}],
  objectives:[{id:"O1",statement:"Gen2",divisionId:"DIV-FC",initiativeId:"I1",quarter:"2026 Q1",plannedStart:2192,plannedEnd:2280}],
  kpis:[], kpiDefs:[], kpiUpdates:[], catchupPlans:[] };

const execDoc = { objectiveState:[], keyResults:[{id:"KR1",objectiveId:"O1",statement:"Hit 0.68 V"}],
  kpis:[
    {id:"K-STAT",objectiveId:"O1",hostType:"keyResult",hostId:"KR1",name:"OCV",unit:"V",targetType:"statistical",statistic:"average",readCount:5,direction:"up",target:0.68},
    {id:"K-ONE", objectiveId:"O1",hostType:"keyResult",hostId:"KR1",name:"Leak",unit:"sccm",targetType:"demonstration",direction:"down",target:1}
  ],
  stageGates:[], tasks:[], boards:[], gateMode:{}, kpiUpdates:[], stageGateEdges:[],
  chainGatesByDate:{}, risks:[], stageGateSets:[], catchupPlans:[], etbTrees:{} };

// kr_a linked+statistical, kr_b UNLINKED with its own statistic, kr_c linked single-value.
const TREE = { project_id:"O1", root_experiment_id:"exp_1", experiments:{ exp_1:{ id:"exp_1", code:"EXP-1",
  name:"Baseline", status:"planned", hypothesis:"H", audit_log:[], actual_outcome:null,
  key_reads:[ {id:"kr_a", name:"OCV", unit:"V", source_kpi_gid:"K-STAT", direction:">=", critical_value:"0.6"},
              {id:"kr_b", name:"Crossover", unit:"mA/cm2", statistic:"average", readCount:3, direction:"<=", critical_value:"2"},
              {id:"kr_c", name:"Leak", unit:"sccm", source_kpi_gid:"K-ONE", direction:"<=", critical_value:"1"} ],
  possible_results:[{id:"res_1", label:"Meets spec", conclusion:"ship it",
    criteria:[{key_read_id:"kr_a",op:">=",value:0.6},{key_read_id:"kr_c",op:"<=",value:1}], next_experiment_ids:[]}] } } };

const INDEX = { schema:2, runs:[
  { job_id:"j-900", sample_name:"MEA-9", script:"Polarization Curve", timestamp:"2026-07-19T14:02:00Z", bin_id:"bin-a",
    Data:[{ Analysis:"polcurve", step:"", Conditions:{T_C:80,RH_pct:100}, key_values:{ "OCV":0.671 } }] },
  { job_id:"j-901", sample_name:"MEA-9", script:"Polarization Curve", timestamp:"2026-07-20T09:10:00Z", bin_id:"bin-b",
    Data:[{ Analysis:"polcurve", step:"", Conditions:{T_C:80,RH_pct:100}, key_values:{ "OCV":0.679 } }] },
  { job_id:"j-902", sample_name:"MEA-9", script:"H2 Crossover", timestamp:"2026-07-20T11:00:00Z", bin_id:"bin-c",
    Data:[{ Analysis:"crossover", step:"", Conditions:{T_C:80,RH_pct:100}, key_values:{ "Crossover":1.44 } }] }
]};

function makeFetch(store){
  return function(url,opts){ opts=opts||{}; const m=/\/state\/([^/?]+)(\/version)?/.exec(String(url)); const id=m?m[1]:null; const isVer=m&&m[2];
    if(/\/analysis$/.test(String(url))) return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(INDEX)});
    if((opts.method||"GET").toUpperCase()==="PUT"){ const nv=String((store[id]?+store[id].version:0)+1); store[id]={doc:JSON.parse(opts.body).doc,etag:nv,version:nv}; return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({etag:nv,version:nv})}); }
    if(isVer) return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({version:store[id]?store[id].version:"0"})});
    if(!store[id]) return Promise.resolve({ok:false,status:404,json:()=>Promise.resolve(null)});
    return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({doc:store[id].doc,etag:store[id].etag,version:store[id].version})}); };
}

(async () => {
  const store={ portfolio:{doc:portfolio,etag:"1",version:"1"}, "EXEC-DIV-FC":{doc:execDoc,etag:"1",version:"1"} };
  const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push(e.message));
  // The ETB's state.tree lives inside a module IIFE. Mutating a stub experiment object instead of the
  // module's own tree has cost two debugging cycles before now, so the fixture is installed THROUGH
  // the hook and every read-back goes through it too.
  let html = fs.readFileSync(OUT+'/execution_app.html','utf8');
  const HOOK = "\ninit(); window.__ETBH={"
    + " setTree:function(tr){ state.tree=tr; try{ normalizeTree(state.tree); }catch(e){} },"
    + " tree:function(){ return state.tree; }"
    + " };\n\n})();";
  html = html.replace("\ninit();\n\n})();", HOOK);

  const dom=new JSDOM(html,{ runScripts:"dangerously",virtualConsole:vc,
    url:"https://x/?division=DIV-FC&token=t",pretendToBeVisual:true,
    beforeParse(w){ w.fetch=makeFetch(store); w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); }});
  await sleep(900);
  const w=dom.window, d=w.document;
  ok(errs.length===0, "boots without errors ("+JSON.stringify(errs.slice(0,1))+")");
  ok(!!w.__ETBH, "the ETB test hook is installed");

  w.eval(`portfolio=${JSON.stringify(portfolio)}; exec=${JSON.stringify(execDoc)}; selectedObj='O1'; divisionId='DIV-FC';
          persist=function(){}; setMsg=function(){}; renderAll=function(){ renderExpSummary(); };`);
  w.eval(`__ETBH.setTree(${JSON.stringify(TREE)});
          ETB.currentExperiments=function(){ return [ETB.experimentById('exp_1')]; };
          ETB.saveActive=function(){ return Promise.resolve(true); };`);

  const host = () => d.getElementById('expSummary');
  const cell = krId => host().querySelector('td.m-cur[data-krpost="'+krId+'"]');
  const conc = () => host().querySelector('[data-conc]');
  const tree = () => w.__ETBH.tree();
  const exp1 = () => tree().experiments.exp_1;
  const strip = () => host().querySelector('.exs-concl');
  const statPop = () => d.getElementById('etbStatPop');
  async function type(krId, text){
    const td = cell(krId);
    if(!td){ ok(false, "current-value cell for "+krId+" is click-to-post"); return null; }
    try{ w.eval('closeEtbStatPop&&closeEtbStatPop()'); }catch(e){}   // don't let a prior popover intercept
    await sleep(15);
    td.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));      // the real click, not the handler
    await sleep(40);
    // a statistical cell opens the value-list popover; add through its add field. a single-valued cell
    // opens the inline input. this helper handles both so existing add-tests keep working.
    const pop = statPop();
    if(pop){
      const pin = pop.querySelector('[data-etbin]');
      if(!pin) return null;
      pin.value = text;
      pin.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      await sleep(80);
      return pin;
    }
    const inp = td.querySelector('input.krpostin');
    if(!inp) return null;
    inp.value = text;
    inp.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await sleep(60);
    return inp;
  }
  // close any open popover between phases so a lingering one doesn't swallow the next cell click
  async function closePop(){ try{ w.eval('closeEtbStatPop&&closeEtbStatPop()'); }catch(e){} await sleep(20); }

  w.eval("renderExpSummary()"); await sleep(120);

  // ---------- the section renders as a measurement table ----------
  const tbl = host().querySelector('table.mtbl');
  ok(!!tbl, "key reads render through the same measurement table the KR and gate hosts use");
  const heads = Array.from(tbl.querySelectorAll('thead th')).map(t=>t.textContent.trim());
  ok(heads.length===4, "the table has exactly four columns ("+heads.length+")");
  ok(heads.join('|')==="Key read|Pass criterion|Unit|Current value", "…key read, pass criterion, unit, current value ("+heads.join('|')+")");
  ok(!tbl.querySelector('.m-badge') && !/on track|off-track|at-risk/.test(tbl.innerHTML),
     "no banded status column is rendered in the current step");
  ok(tbl.querySelectorAll('tbody tr').length===3, "every key read gets a row");
  ok(/\u2265 0.6 V/.test(tbl.textContent), "the pass criterion column renders the key read's own target");

  // ---------- the starting state ----------
  ok(host().querySelectorAll('.m-noread').length===3, "with nothing measured every current value reads 'no read'");
  ok(/planned/.test(host().querySelector('.exs-badge').textContent), "the step starts planned");
  ok(!!conc() && conc().disabled===true, "Conclude is present but disabled while data is missing");
  ok(!!strip() && /Awaiting/i.test(strip().textContent), "the strip names what is still awaited");

  // ---------- clicking a STATISTICAL cell opens the value-list popover ----------
  ok(!!cell('kr_a') && !!cell('kr_b') && !!cell('kr_c'), "every current-value cell carries the click-to-post hook");
  const td_a = cell('kr_a');
  if(td_a) td_a.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await sleep(60);
  ok(!!statPop(), "clicking a statistical cell opens the value-list popover (like the KR/SG cells)");
  ok(!!statPop() && !!statPop().querySelector('[data-etbin]'), "…with an add field");
  ok(!!statPop() && !!statPop().querySelector('.sp-list'), "…and a list region for the individual readings");
  ok(statPop() && /no readings yet/.test(statPop().textContent), "…empty at first");
  // Escape closes it and writes nothing
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await sleep(30);
  ok(!statPop(), "Escape closes the popover");
  ok((w.eval("exec.kpiUpdates.length"))===0, "…and posts nothing");

  // ---------- clicking a SINGLE-VALUED cell opens an inline input in that cell ----------
  const td_c = cell('kr_c');
  if(td_c) td_c.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await sleep(40);
  ok(!statPop(), "a single-valued cell does NOT open the popover");
  ok(!!td_c && !!td_c.querySelector('input.krpostin'), "…it opens an inline input in that cell instead");
  ok(d.querySelectorAll('input.krpostin').length===1, "…and only that cell");
  const cIn = td_c && td_c.querySelector('input.krpostin');
  if(cIn) cIn.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await sleep(30);
  ok(!!cell('kr_c') && !cell('kr_c').querySelector('input'), "Escape closes the inline editor without writing");
  ok((w.eval("exec.kpiUpdates.length"))===0, "…and posts nothing");

  // ---------- a LINKED key read posts to the objective's KPI ----------
  await type('kr_a', "0.66 0.68 0.70");
  ok(w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='K-STAT';}).length")===3,
     "a linked key read posts each read to the linked KPI, as the KR and gate tables do");
  ok(exp1().actual_outcome===null, "measuring wrote NO outcome — the step is not concluded");
  ok(exp1().status==="in_progress", "the step advanced planned -> in progress on the first measurement");
  w.eval("renderExpSummary()"); await sleep(60);
  ok(/in progress/.test(host().querySelector('.exs-badge').textContent), "…and the badge says so");

  // ---------- the sample sub-badge tracks completeness ----------
  let sub = cell('kr_a') && cell('kr_a').querySelector('.m-cur-sub');
  ok(!!sub && /3\/5/.test(sub.textContent), "a short statistical sample shows n of the expected count ("+(sub&&sub.textContent)+")");
  ok(!!sub && sub.className.indexOf('warn')>=0, "…flagged as incomplete, not as met");
  ok(!!cell('kr_a') && !/no read/.test(cell('kr_a').textContent), "the cell now shows the computed statistic instead of 'no read'");

  // ---------- an UNLINKED key read stays in the ETB ----------
  await type('kr_b', "1.1 1.2 1.3");
  ok(w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='kr_b';}).length")===0,
     "an unlinked key read posts nothing to the KPI layer");
  const store_b = (exp1().key_read_readings||{}).kr_b;
  ok(Array.isArray(store_b) && store_b.length===3, "…its reads live on the experiment instead");
  w.eval("renderExpSummary()"); await sleep(60);
  const sub_b = cell('kr_b') && cell('kr_b').querySelector('.m-cur-sub');
  ok(!!sub_b && /3\/3/.test(sub_b.textContent) && sub_b.className.indexOf('ok')>=0,
     "an unlinked sample reaching its own readCount reads as complete ("+(sub_b&&sub_b.textContent)+")");

  // ---------- appending, not replacing ----------
  await type('kr_a', "0.67 0.69");
  ok(w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='K-STAT';}).length")===5,
     "a second entry APPENDS to the sample rather than replacing it");
  w.eval("renderExpSummary()"); await sleep(60);
  sub = cell('kr_a') && cell('kr_a').querySelector('.m-cur-sub');
  ok(!!sub && /5\/5/.test(sub.textContent) && sub.className.indexOf('ok')>=0, "…and the sample now reads complete");

  // ---------- the conclusion strip trends while data is short ----------
  ok(/Trending toward/i.test(strip().textContent), "with one criterion satisfied and one unmeasured the strip shows a trend");
  ok(/Meets spec/.test(strip().textContent), "…naming the result the data is trending toward");
  ok(/Leak/.test(strip().textContent), "…and naming the key read it is still awaiting");
  ok(strip().className.indexOf('prov')>=0, "…styled as provisional, not as a match");
  ok(!!conc() && conc().disabled===true, "Conclude stays disabled while any key read is unmeasured");

  // ---------- completing the data enables the conclusion ----------
  await type('kr_c', "0.4");
  w.eval("renderExpSummary()"); await sleep(60);
  ok(w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='K-ONE';}).length")===1,
     "a single-valued key read posts exactly one reading");
  ok(!!conc() && conc().disabled===false, "Conclude enables once every key read has its data");
  ok(/Matched/.test(strip().textContent) && strip().className.indexOf('match')>=0,
     "…and the strip promotes the trend to a match");
  ok(exp1().actual_outcome===null, "complete data STILL does not conclude on its own");
  ok(exp1().status==="in_progress", "…the step remains in progress until someone concludes it");

  // ---------- Conclude opens the recorder, prefilled from what was measured ----------
  if(conc()) conc().dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await sleep(200);
  const recBody=d.getElementById('expRecBody');
  ok(!!recBody && recBody.innerHTML.length>0, "Conclude opens the recorder");
  const pre_a=recBody.querySelector('.erk-input[data-kr="kr_a"]');
  const pre_b=recBody.querySelector('.erk-input[data-kr="kr_b"]');
  const pre_c=recBody.querySelector('.erk-input[data-kr="kr_c"]');
  ok(!!pre_a && pre_a.value.split(/\s+/).filter(Boolean).length===5,
     "the recorder is PREFILLED with the linked reads already measured ("+(pre_a&&pre_a.value)+")");
  ok(!!pre_b && pre_b.value.split(/\s+/).filter(Boolean).length===3, "…and with the unlinked reads too");
  ok(!!pre_c && Number(pre_c.value)===0.4, "…and the single-valued read");

  // ---------- a single-valued cell takes one number, not a sample ----------
  await type('kr_c', "0.5 0.6");
  ok(w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='K-ONE';}).length")===2,
     "typing several numbers into a single-valued key read posts one reading, not a sample");

  // ---------- the UNLINKED path on its own, from a clean planned step ----------
  // The linked path advances status and appends through different code (noteMeasured / kpiUpdates),
  // so testing only the mixed experiment above left the ETB-local writes unproven.
  const TREE2 = { project_id:"O1", root_experiment_id:"exp_2", experiments:{ exp_2:{ id:"exp_2", code:"EXP-2",
    name:"Local only", status:"planned", audit_log:[], actual_outcome:null,
    key_reads:[{id:"kr_z", name:"Crossover", unit:"mA/cm2", statistic:"average", readCount:4, direction:"<=", critical_value:"2"}],
    possible_results:[] } } };
  w.eval(`__ETBH.setTree(${JSON.stringify(TREE2)}); ETB.currentExperiments=function(){ return [ETB.experimentById('exp_2')]; };`);
  w.eval("renderExpSummary()"); await sleep(80);
  const exp2 = () => tree().experiments.exp_2;
  ok(exp2().status==="planned", "the fresh unlinked-only step starts planned");

  await type('kr_z', "1.1 1.2");
  ok(exp2().status==="in_progress", "an UNLINKED measurement also advances planned -> in progress");
  ok(exp2().actual_outcome===null, "…and still writes no outcome");
  ok(((exp2().key_read_readings||{}).kr_z||[]).length===2, "…storing both reads on the experiment");
  ok(w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='kr_z';}).length")===0, "…and nothing in the KPI layer");

  w.eval("renderExpSummary()"); await sleep(60);
  await type('kr_z', "1.3 1.4");
  const zs=((exp2().key_read_readings||{}).kr_z)||[];
  ok(zs.length===4, "a second unlinked entry APPENDS to the stored sample rather than replacing it ("+zs.length+")");
  w.eval("renderExpSummary()"); await sleep(60);
  const sub_z = cell('kr_z') && cell('kr_z').querySelector('.m-cur-sub');
  ok(!!sub_z && /4\/4/.test(sub_z.textContent) && sub_z.className.indexOf('ok')>=0,
     "…and the unlinked sample reads complete at its own readCount");
  ok(!!host().querySelector('[data-conc]') && host().querySelector('[data-conc]').disabled===false, "Conclude enables for an experiment whose only key read is unlinked");

  // ---------- Connect data, driven from the CARD ----------
  // This branch previously wrote into the recorder's inputs, so it only worked with the recorder
  // mounted — and the recorder now opens from a button that is disabled until data is complete.
  // These assertions pin the import to the same stores the cells write to.
  const TREE3 = { project_id:"O1", root_experiment_id:"exp_3", experiments:{ exp_3:{ id:"exp_3", code:"EXP-3",
    name:"Import", status:"planned", audit_log:[], actual_outcome:null,
    key_reads:[ {id:"kr_ocv", name:"OCV", unit:"V", source_kpi_gid:"K-STAT", direction:">=", critical_value:"0.6"},
                {id:"kr_xo", name:"Crossover", unit:"mA/cm2", statistic:"average", readCount:3, direction:"<=", critical_value:"2"} ],
    possible_results:[] } } };
  w.eval(`__ETBH.setTree(${JSON.stringify(TREE3)}); ETB.currentExperiments=function(){ return [ETB.experimentById('exp_3')]; };
          exec.kpiUpdates=[];`);
  w.eval("renderExpSummary()"); await sleep(80);
  const exp3 = () => tree().experiments.exp_3;

  // one drive of the portal picker: open it from the card, expand the sample, tick every value,
  // route each to its key read, import.
  async function driveImport(){
    const b = host().querySelector('[data-cdexp]');
    if(!b) return false;
    b.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    await sleep(400);
    // the picker may reopen with the attached sample already expanded — clicking would collapse it
    if(!d.querySelector('#cdBody .cd-sbody')){
      const head = d.querySelector('#cdBody .cd-shead');
      if(head){ head.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await sleep(120); }
    }
    const boxes = Array.from(d.querySelectorAll('#cdBody [data-cdpick]'));
    for(const cb of boxes){ cb.checked=true; cb.dispatchEvent(new w.Event('change',{bubbles:true})); await sleep(20); }
    for(const sel of Array.from(d.querySelectorAll('#cdBody select[data-selid]'))){
      const key=(sel.getAttribute('data-selid')||'').split('|').pop();
      sel.value = /Crossover/i.test(key) ? 'kr_xo' : 'kr_ocv';
      sel.dispatchEvent(new w.Event('change',{bubbles:true})); await sleep(20);
    }
    const imp = d.getElementById('cdImport');
    if(imp) imp.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    await sleep(250);
    return boxes.length;
  }

  const cdBtn = host().querySelector('[data-cdexp]');
  ok(!!cdBtn, "the current-step card offers Connect data where the measurements now live");
  ok(cdBtn && cdBtn.getAttribute('data-cdexp')==='exp_3', "…bound to the experiment on the card");
  const nPicked = await driveImport();
  const cdOv = d.getElementById('cdOverlay');
  ok(!!cdOv && !cdOv.classList.contains('open'), "importing closes the picker");
  ok(nPicked>0, "the picker lists values from the analysis index ("+nPicked+")");

  const statUps = () => w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='K-STAT';})");
  ok(statUps().length===2, "a LINKED key read's imported values post to its KPI ("+statUps().length+")");
  ok(statUps().every(u=>u.src && u.src.portal==='analysis'), "…each carrying portal provenance");
  ok(((exp3().key_read_readings||{}).kr_xo||[]).length===1, "an UNLINKED key read's imported value lands on the experiment");
  ok(w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='kr_xo';}).length")===0, "…and not in the KPI layer");
  // provenance now lives PER READING, not in a scalar: the unlinked reading is a {v,src} entry
  ok((function(){ var e=(exp3().key_read_readings||{}).kr_xo||[]; return e[0]&&typeof e[0]==='object'&&e[0].src&&e[0].src.sample==='MEA-9'; })(),
     "the unlinked reading carries its own {v,src} provenance, naming the sample");
  ok(exp3().status==='in_progress', "importing advances planned -> in progress");
  ok(exp3().actual_outcome===null, "importing writes NO outcome — the step is not concluded");
  w.eval("renderExpSummary()"); await sleep(60);
  ok(!!cell('kr_ocv') && !/no read/.test(cell('kr_ocv').textContent), "the imported value shows in the current-value cell");

  // ---------- the cell is labelled with the sample it came from (derived from readings) ----------
  const chipO = cell('kr_ocv') && cell('kr_ocv').querySelector('.src-chip');
  ok(!!chipO, "an imported reading carries a provenance chip on the current-value cell");
  ok(chipO && /MEA-9/.test(chipO.textContent), "…naming the SAMPLE visibly for a single-sample key read ("+(chipO&&chipO.textContent)+")");
  const chipX = cell('kr_xo') && cell('kr_xo').querySelector('.src-chip');
  ok(!!chipX && /MEA-9/.test(chipX.textContent), "the unlinked key read is labelled from its per-reading provenance too");

  // ---------- reopening Connect data shows the connected section (reconstructed) ----------
  const cdBtn3 = host().querySelector('[data-cdexp]');
  if(cdBtn3) cdBtn3.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await sleep(450);
  ok(!!d.querySelector('#cdBody .cd-connected'), "reopening shows a Currently-connected section, not a seeded filter");
  ok(d.querySelectorAll('#cdBody .cd-connected [data-connpick]').length>0, "…listing the connected readings, reconstructed from the data");
  ok([...d.querySelectorAll('#cdBody .cd-connected [data-connpick]')].every(b=>b.checked), "…each pre-ticked");
  ok(/MEA-9/.test((d.querySelector('#cdBody .cd-connected')||{}).textContent||""), "…grouped under the sample they came from");
  ok((d.getElementById('cdName')||{}).value==='' || !d.getElementById('cdName').value, "…while the search filter starts EMPTY");
  w.eval("closeConnectData()"); await sleep(80);

  // ---------- re-importing the same portal values must not inflate the sample ----------
  const beforeN = statUps().length, beforeX = ((exp3().key_read_readings||{}).kr_xo||[]).length;
  await driveImport();
  ok(statUps().length===beforeN, "re-importing the same portal values adds no duplicate KPI readings ("+statUps().length+")");
  ok(((exp3().key_read_readings||{}).kr_xo||[]).length===beforeX,
     "…and none to the unlinked store, so a statistical sample cannot be inflated by a repeat import");

  // ---------- the statistical popover lists connected + hand-entered readings, deletes across backends ----------
  // exp_3 now has kr_ocv (LINKED, imported to K-STAT) and kr_xo (UNLINKED, imported {v,src}). Clicking a
  // statistical cell opens the value-list popover; it must show each reading, tag imported ones by sample,
  // and delete the right thing per backend.
  const cell3 = krId => host().querySelector('td.m-cur[data-krpost="'+krId+'"]');
  const pop = () => d.getElementById('etbStatPop');
  const popRows = () => pop() ? [...pop().querySelectorAll('.sp-row')] : [];
  const popArmed = () => pop() ? [...pop().querySelectorAll('[data-etbrm]')].find(b=>/confirm/.test(b.textContent)) : null;
  async function armAndRemove(pred){        // click a matching row's remove twice (arm, then confirm)
    const row = popRows().find(pred); const b = row && row.querySelector('[data-etbrm]');
    if(!b) return false;
    b.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await sleep(40);
    const c = popArmed(); if(c){ c.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await sleep(60); }
    return true;
  }

  // add one HAND-ENTERED reading to the linked key read, so the popover mixes imported + entered
  await type('kr_ocv', "0.690");
  w.eval("renderExpSummary()"); await sleep(60);

  try{ w.eval('closeEtbStatPop&&closeEtbStatPop()'); }catch(e){} await sleep(20);
  const tdOcv = cell3('kr_ocv');
  if(tdOcv) tdOcv.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await sleep(80);
  ok(!!pop(), "clicking the linked statistical cell opens the value-list popover");
  const rowsOcv = () => pop() ? [...pop().querySelectorAll('.sp-row')] : [];
  const tags = () => pop() ? [...pop().querySelectorAll('.sp-tag')] : [];
  ok(rowsOcv().length>=3, "the popover lists every reading on the key read ("+rowsOcv().length+")");
  ok(tags().length>=2, "imported readings are tagged with their sample ("+tags().length+")");
  ok(tags().some(t=>/MEA-9/.test(t.textContent)), "…naming the sample (MEA-9)");
  ok((pop()?pop().querySelectorAll('.sp-hand').length:0)>=1, "a hand-entered reading is marked as entered");

  // delete an IMPORTED (linked) reading: it removes the specific kpiUpdate
  const kOcvBefore = w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='K-STAT';}).length");
  const impRow = popRows().find(r=>r.querySelector('.sp-tag'));
  ok(!!(impRow && impRow.querySelector('[data-etbrm]')), "an imported reading row has a remove button");
  if(impRow && impRow.querySelector('[data-etbrm]')){ impRow.querySelector('[data-etbrm]').dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await sleep(40); }
  ok(!!popArmed(), "the remove is armed first (house convention)");
  const _ab=popArmed(); if(_ab){ _ab.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await sleep(60); }
  const kOcvAfter = w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='K-STAT';}).length");
  ok(kOcvAfter===kOcvBefore-1, "removing an imported linked reading deletes exactly its kpiUpdate ("+kOcvBefore+"→"+kOcvAfter+")");

  // delete the HAND-ENTERED (linked) reading too
  try{ w.eval('closeEtbStatPop&&closeEtbStatPop()'); }catch(e){} await sleep(20);
  const tdOcv2 = cell3('kr_ocv'); if(tdOcv2) tdOcv2.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await sleep(80);
  const kB = w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='K-STAT';}).length");
  await armAndRemove(r=>r.querySelector('.sp-hand'));
  ok(w.eval("exec.kpiUpdates.filter(function(u){return u.kpiId==='K-STAT';}).length")===kB-1, "a hand-entered linked reading is removable too");

  // delete an IMPORTED (UNLINKED) reading via the popover: removes the {v,src} entry
  try{ w.eval('closeEtbStatPop&&closeEtbStatPop()'); }catch(e){} await sleep(20);
  const tdXo = cell3('kr_xo'); if(tdXo) tdXo.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await sleep(80);
  ok(!!pop(), "the unlinked statistical cell also opens the popover");
  const xoBefore = ((exp3().key_read_readings||{}).kr_xo||[]).length;
  await armAndRemove(r=>r.querySelector('.sp-tag'));
  ok(((exp3().key_read_readings||{}).kr_xo||[]).length===xoBefore-1,
     "removing an imported UNLINKED reading deletes its {v,src} entry ("+xoBefore+"→"+((exp3().key_read_readings||{}).kr_xo||[]).length+")");
  try{ w.eval('closeEtbStatPop&&closeEtbStatPop()'); }catch(e){} await sleep(20);

  // ---------- a key read can pass on a RANGE, like a stage-gate target ----------
  // Stage-gate/KPI targets already support direction:'range' with {lo,hi}; a key read now uses the same
  // vocabulary, keeping critical_value as the low bound so every existing reader still works and adding
  // critical_value_hi. Bounds are inclusive, matching rdcore's progressRange.
  const applyOp = (op,a,b,hi) => w.eval(`etbApplyOp(${JSON.stringify(op)},${JSON.stringify(a)},${JSON.stringify(b)},${JSON.stringify(hi)})`);
  ok(applyOp('range', 0.7, 0.6, 0.8)===true,  "a value inside the range passes");
  ok(applyOp('range', 0.5, 0.6, 0.8)===false, "below the low bound fails");
  ok(applyOp('range', 0.9, 0.6, 0.8)===false, "above the high bound fails");
  ok(applyOp('range', 0.6, 0.6, 0.8)===true,  "the low bound itself passes (inclusive, as stage gates are)");
  ok(applyOp('range', 0.8, 0.6, 0.8)===true,  "the high bound itself passes (inclusive)");
  ok(applyOp('range', 0.7, 0.8, 0.6)===true,  "bounds entered in either order still work, so a reversed pair is not a never-passing criterion");
  ok(applyOp('range', 0.7, 0.6, '')===false,  "a range with no high bound cannot pass");
  // Number('') is 0, so an unguarded implementation reads 0.6 – '' as the range [0, 0.6] and passes
  // values that were never in range. This is the assertion that catches that.
  ok(applyOp('range', 0.3, 0.6, '')===false,  "…and an empty high bound is UNSET, not zero");
  ok(applyOp('range', 0.3, '', 0.6)===false,  "…likewise an empty low bound");
  ok(applyOp('>=', 0.7, 0.6)===true,          "the existing operators are unaffected");
  ok(applyOp('<=', 0.7, 0.6)===false,         "…in both directions");

  // criterion text reads as a range, not as an operator
  const critText = k => w.eval(`etbCritText(${JSON.stringify(k)})`);
  ok(critText({direction:'range',critical_value:'0.6',critical_value_hi:'0.8',unit:'V'})==='0.6 \u2013 0.8 V',
     "the pass criterion renders as a range ("+critText({direction:'range',critical_value:'0.6',critical_value_hi:'0.8',unit:'V'})+")");
  ok(critText({direction:'range',critical_value:'0.6',critical_value_hi:'',unit:'V'}).indexOf('?')>=0,
     "…with a missing high bound shown as unset, not silently dropped");
  ok(critText({direction:'>=',critical_value:'0.6',unit:'V'})==='\u2265 0.6 V', "a non-range criterion is unchanged");

  // a result criterion referencing a range key read stays PENDING until the high bound is set
  const evalCrit = (kr,measured) => w.eval(`etbEvalCriterion({status:'hit'},${JSON.stringify(kr)},${JSON.stringify(measured)})`);
  ok(evalCrit({direction:'range',critical_value:'0.6',critical_value_hi:''},0.7)==='pending',
     "a half-specified range is pending, never a silent fail");
  ok(evalCrit({direction:'range',critical_value:'0.6',critical_value_hi:'0.8'},0.7)==='pass',
     "…and passes once both bounds are set");
  ok(evalCrit({direction:'range',critical_value:'0.6',critical_value_hi:'0.8'},0.9)==='fail',
     "…failing outside the range");

  // the editor offers it — asserted through the built app's source, since DIRS is module-scoped.
  // (The editor panel itself lives in the ETB modal; the DOM assertion belongs with that harness.)
  const appSrc = require('fs').readFileSync((process.env.RD_OUT||'/home/claude/work')+'/execution_app.html','utf8');
  ok(/DIRS=\[[^\]]*value:"range"[^\]]*\]/.test(appSrc), "the key-read direction picker offers a range option");
  ok(/value:"range",\s*label:"between"/.test(appSrc), "…labelled 'between'");
  ok(/critical_value_hi/.test(appSrc), "the second bound is a real field on the key read");

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} current-step measurement-surface assertions green`);
  process.exit(fails.length ? 1 : 0);
})();
