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

function makeFetch(store){
  return function(url,opts){ opts=opts||{}; const m=/\/state\/([^/?]+)(\/version)?/.exec(String(url)); const id=m?m[1]:null; const isVer=m&&m[2];
    if(/\/analysis$/.test(String(url))) return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({schema:2,runs:[]})});
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
  async function type(krId, text){
    const td = cell(krId);
    if(!td){ ok(false, "current-value cell for "+krId+" is click-to-post"); return null; }
    td.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));      // the real click, not the handler
    await sleep(30);
    const inp = td.querySelector('input.krpostin');
    if(!inp) return null;
    inp.value = text;
    inp.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await sleep(60);
    return inp;
  }

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

  // ---------- clicking a real cell opens an editor IN THAT CELL ----------
  ok(!!cell('kr_a') && !!cell('kr_b') && !!cell('kr_c'), "every current-value cell carries the click-to-post hook");
  const td_a = cell('kr_a');
  if(td_a) td_a.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await sleep(40);
  const liveIn = td_a ? td_a.querySelector('input.krpostin') : null;
  ok(!!liveIn, "clicking the current-value cell opens an input INSIDE that cell");
  ok(d.querySelectorAll('input.krpostin').length===1, "…and only that cell, not every row at once");
  if(liveIn) liveIn.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await sleep(30);
  ok(!!cell('kr_a') && !cell('kr_a').querySelector('input'), "Escape closes the editor without writing");
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

  out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
  const fails = out.filter(x => x.startsWith('FAIL'));
  console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} current-step measurement-surface assertions green`);
  process.exit(fails.length ? 1 : 0);
})();
