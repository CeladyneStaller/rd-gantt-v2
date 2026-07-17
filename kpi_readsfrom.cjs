// STOPGAP for a first-class sample entity: kpi.readsFrom lets one sample feed several statistics — an average
// target and a CoV target over the SAME 10 points, entered once. The statistic still comes from each KPI's own
// definer; only the data is shared.
const C=require((process.env.RD_SRC||'/home/claude')+'/rdcore.js');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

// Corey's case: 10 points, targeting average AND CoV.
const pts=[10,10.4,9.6,10.2,9.8,10.1,9.9,10.3,9.7,10.0];
const avg={ id:'K-avg', hostType:'keyResult', hostId:'KR1', name:'Power average', targetType:'statistical',
            statistic:'average', readCount:10, direction:'up', target:9.5, isDefiner:true };
const cov={ id:'K-cov', hostType:'keyResult', hostId:'KR1', name:'Power CoV', targetType:'statistical',
            statistic:'cv', readCount:10, direction:'down', target:5, isDefiner:true, readsFrom:'K-avg' };
const kpis=[avg,cov];
const docs={ D1:{ kpis:kpis, kpiUpdates: pts.map((v,i)=>({id:'u'+i, kpiId:'K-avg', value:v, timestamp:1000+i})) } };

ok(C.readingSourceId(avg,kpis)==='K-avg', 'a KPI holding its own data resolves to itself');
ok(C.readingSourceId(cov,kpis)==='K-avg', 'a borrowing KPI resolves to the sample owner');

const a=C.effValue(avg,kpis,docs), v=C.effValue(cov,kpis,docs);
ok(Math.abs(a-10.0)<1e-9, 'the average KPI reads the mean of the 10 points (10.0)');
ok(v!=null && v>0 && v<10, 'the CoV KPI reads a CoV from the SAME points, with no data entered twice');
ok(a!==v, '...and the two KPIs report different statistics over one sample');
// the borrowed KPI applies ITS OWN statistic, not the owner's
ok(Math.abs(v - C.computeStat('cv', pts))<1e-9, 'the borrowed KPI applies its own statistic (cv), not the owners average');
ok(Math.abs(a - C.computeStat('average', pts))<1e-9, '...and the owner still applies average');

// scoring works off the borrowed sample
ok(C.kpiScoreResolved(avg,kpis,docs)===100, 'the average scores against its own target (10.0 >= 9.5)');
ok(C.kpiScoreResolved(cov,kpis,docs)===100, 'the CoV scores against its own target (low CoV <= 5%)');

// completeness: the borrower sees the owner's sample size, so N/expected is not stuck at 0
ok(C.readingCount('K-avg',docs)===10, 'the owner counts 10 readings');
ok(C.readingCount(C.readingSourceId(cov,kpis),docs)===10, 'the borrower sees the same 10 (completeness is not zero)');

// adding one point moves BOTH — the whole point of sharing
const docs2={ D1:{ kpis:kpis, kpiUpdates: docs.D1.kpiUpdates.concat([{id:'u10',kpiId:'K-avg',value:20,timestamp:2000}]) } };
ok(C.effValue(avg,kpis,docs2)!==a, 'adding a point to the sample moves the average');
ok(C.effValue(cov,kpis,docs2)!==v, '...and moves the CoV too, from the same single entry');

// unchanged behaviour when nothing borrows
const solo={ id:'K-solo', hostType:'keyResult', hostId:'KR1', targetType:'statistical', statistic:'average', direction:'up', target:1, isDefiner:true };
const sdocs={ D1:{ kpis:[solo], kpiUpdates:[{id:'s1',kpiId:'K-solo',value:7,timestamp:1}] } };
ok(C.effValue(solo,[solo],sdocs)===7, 'a KPI with no readsFrom is unaffected');
ok(C.readingSourceId(solo,[solo])==='K-solo', '...and resolves to itself');

// chains resolve to the data holder; cycles cannot hang
const mid={ id:'K-mid', targetType:'statistical', statistic:'median', readsFrom:'K-avg' };
const tail={ id:'K-tail', targetType:'statistical', statistic:'min', readsFrom:'K-mid' };
ok(C.readingSourceId(tail,[avg,mid,tail])==='K-avg', 'a readsFrom chain resolves through to the data holder');
const cyA={ id:'A', readsFrom:'B' }, cyB={ id:'B', readsFrom:'A' };
ok(['A','B'].indexOf(C.readingSourceId(cyA,[cyA,cyB]))>=0, 'a readsFrom cycle terminates instead of hanging');
const dangling={ id:'K-x', readsFrom:'K-gone' };
ok(C.readingSourceId(dangling,[dangling])==='K-x', 'a dangling readsFrom falls back to the KPI itself');

// ---- UI: the editor must actually RENDER and SAVE the picker. The first version of this harness was
// core-only, so a ReferenceError in krModalBody (it referenced `pk`, which only exists in initDraftKr) shipped
// undetected and broke BOTH the sample picker and the "+ add key result" button.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?division=D1&token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
setTimeout(()=>{ const w=dom.window;
  const t=(fn,m)=>{ try{ ok(fn(),m); }catch(e){ ok(false,m+' [threw: '+e.message+']'); } };
  w.eval(`exec={objectiveState:[],keyResults:[{id:'KR1',objectiveId:'O1',statement:'kr'}],
    kpis:[{id:'K-avg',hostType:'keyResult',hostId:'KR1',name:'Power average',targetType:'statistical',statistic:'average',isDefiner:true,readCount:10}],
    kpiUpdates:[{id:'u1',kpiId:'K-avg',value:10,timestamp:1}],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[]};
    portfolio={divisions:[{id:'D1',name:'D'}],objectives:[{id:'O1',divisionId:'D1',statement:'o'}],initiatives:[],kpis:[],milestones:[]};
    selectedObj='O1';      // allocId derives the new KPI id from the selected objective
    renderAll=function(){}; setMsg=function(){};   // this fixture is minimal; we are testing the SAVE, not the board render
    persistExec=function(){};`);
  // the "+ add key result" path: a NEW draft must render without throwing
  t(()=>{ w.eval("draftKr=initDraftKr(null); krModalBody();"); return true; }, 'the + add key result modal body renders (new draft)');
  t(()=>w.eval("draftKr=initDraftKr(exec.keyResults[0]); krModalBody(); true"), 'editing an existing key result renders');
  t(()=>w.eval("draftKr=initDraftKr(exec.keyResults[0]); draftKr.trackingType='kpi'; draftKr.kpiType='statistical'; krModalBody().indexOf('kpiReadsFrom')>=0"),
    'a statistical KPI shows the Sample picker');
  t(()=>w.eval("readsFromCandidates('K-avg').length===0"), 'the picker never offers the KPI being edited');
  t(()=>w.eval("readsFromCandidates('K-new').map(c=>c.name).indexOf('Power average')>=0"), 'it offers another statistical KPI that holds its own data');
  t(()=>w.eval("exec.kpis.push({id:'K-borrow',hostType:'keyResult',hostId:'KR1',name:'Borrower',targetType:'statistical',statistic:'cv',isDefiner:true,readsFrom:'K-avg'}); readsFromCandidates('K-new').map(c=>c.id).indexOf('K-borrow')<0"),
    'it does NOT offer a KPI that is itself borrowing (no chains)');
  // the popover reads and writes the OWNER's sample, so entering from either KPI works
  // *** the editor Corey actually uses ***: "+ KPI" on a KR and "+ target" on a stage-gate share ONE modal
  // (openKpiTgtModal -> tgtModalBody -> saveTgtModal). The picker must live there, not only in krModalBody.
  t(()=>w.eval("openKpiTgtModal('keyResult','KR1',null); draftTgt.type='statistical'; tgtModalBody().indexOf('data-tf=\"readsFrom\"')>=0"),
    'KR "+ KPI": the shared editor shows the Sample picker');
  t(()=>{ const h=w.eval("openKpiTgtModal('keyResult','KR1',null); draftTgt.type='statistical'; tgtModalBody()");
          return h.indexOf('<optgroup label="KR1')>=0 && h.indexOf('>Power average</option>')>=0; },
    'KR "+ KPI": it offers the existing statistical KPI, nested under its KR');
  t(()=>w.eval("exec.stageGates=[{id:'G1',objectiveId:'O1',name:'Gate'}]; openKpiTgtModal('stageGate','G1',null); draftTgt.type='statistical'; tgtModalBody().indexOf('data-tf=\"readsFrom\"')>=0"),
    'stage-gate "+ target": the same editor shows it there too');
  // saveTgtModal re-reads every [data-tf] from the DOM, so drive the FIELDS, not the draft — otherwise the
  // stale DOM overwrites what you set and the test lies about what a user would get.
  t(()=>{ w.eval(`openKpiTgtModal('keyResult','KR1',null);
            draftTgt.type='statistical';                                  // the type segment is not a [data-tf]
            document.getElementById('kpiTgtBody').innerHTML=tgtModalBody();
            document.querySelector('#kpiTgtBody [data-tf="name"]').value='Power CoV';
            document.querySelector('#kpiTgtBody [data-tf="statistic"]').value='cv';
            document.querySelector('#kpiTgtBody [data-tf="readsFrom"]').value='K-avg';
            saveTgtModal();`);
          return w.eval("var k=exec.kpis.find(x=>x.name==='Power CoV'); !!k && k.readsFrom==='K-avg' && k.statistic==='cv'"); },
    'saving a SECOND statistical KPI on the same KR persists readsFrom (driven through the real fields)');
  t(()=>w.eval("exec.kpis.filter(k=>k.hostType==='keyResult'&&k.hostId==='KR1').length>=2"),
    '...so one key result now carries two statistical KPIs over one sample');
  t(()=>w.eval("RD.readingSourceId(exec.kpis.find(k=>k.name==='Power CoV'), allKpisPool())==='K-avg'"),
    '...and the second resolves to the first KPI sample');
  // ---- completeness must count the BORROWED sample, not the borrower's empty one ----
  t(()=>{ w.eval(`exec.kpiUpdates=[1,2,3,4,5].map((v,i)=>({id:'r'+i,kpiId:'K-avg',value:v,timestamp:i}));
                  exec.kpis.find(k=>k.id==='K-avg').readCount=5;
                  exec.kpis.push({id:'K-cov2',objectiveId:'O1',hostType:'keyResult',hostId:'KR1',name:'CoV2',targetType:'statistical',statistic:'cv',readCount:5,isDefiner:true,readsFrom:'K-avg'});`);
          return w.eval("RD.readingCount(RD.readingSourceId(exec.kpis.find(k=>k.id==='K-cov2'), allKpisPool()), emForCore())===5"); },
    'a borrowing KPI counts the owner 5 readings, not 0 (the 0/5-under-the-score bug)');
  t(()=>w.eval("RD.readingCount('K-cov2', emForCore())===0"),
    '...and its own id genuinely has none — which is why the raw count read 0/5');

  // ---- the sample list is scoped to the objective and grouped KRs / Stage-gates ----
  t(()=>{ w.eval(`exec.stageGates=[{id:'G1',objectiveId:'O1',name:'Alpha gate',setId:null}];
            exec.kpis.push({id:'K-gate',objectiveId:'O1',hostType:'stageGate',hostId:'G1',name:'Gate pressure',targetType:'statistical',statistic:'average',isDefiner:true});
            portfolio.objectives.push({id:'O2',divisionId:'D1',statement:'other'});
            exec.keyResults.push({id:'KR9',objectiveId:'O2',statement:'other KR'});
            exec.kpis.push({id:'K-other',objectiveId:'O2',hostType:'keyResult',hostId:'KR9',name:'Foreign stat',targetType:'statistical',statistic:'average',isDefiner:true});`);
          return w.eval("readsFromGroups('K-new').map(s=>s.section).join('|')==='Key results|Stage-gates'"); },
    'the list is grouped: Key results, then Stage-gates');
  t(()=>w.eval("readsFromGroups('K-new')[0].groups[0].label.indexOf('KR1 ')===0"),
    'a KR group is tagged KR1 (krTreeLabel already carries tag + statement)');
  t(()=>w.eval("readsFromGroups('K-new')[1].groups[0].label.indexOf('SG-1 ')===0 && readsFromGroups('K-new')[1].groups[0].label.indexOf('Alpha gate')>0"),
    'a stage-gate group is tagged SG-1 with its name (the apps own gateLabel format)');
  t(()=>w.eval("readsFromGroups('K-new')[1].groups[0].kpis.map(k=>k.name).join()==='Gate pressure'"),
    '...with its KPIs nested under it');
  t(()=>w.eval("readsFromCandidates('K-new').map(c=>c.id).indexOf('K-other')<0"),
    'a statistical KPI on ANOTHER objective is not offered');
  t(()=>{ const h=w.eval("readsFromOptions('', 'K-new')");
          return h.indexOf('<optgroup label="KR1')>=0 && h.indexOf('<optgroup label="SG-1')>=0
              && h.indexOf('<option disabled>Key results</option>')>=0
              && h.indexOf('<option disabled>Stage-gates</option>')>=0; },
    'the select renders section headers plus one optgroup per KR/SG');
  t(()=>w.eval("sampleOwnerId('K-borrow')==='K-avg'"), 'the popover resolves a borrower to the sample owner');
  t(()=>w.eval("samplePopReads('K-borrow').length===RD.readingCount('K-avg', emForCore())"),
    'opening the popover on the borrower shows the owner sample, whatever its size');
  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const f2=out.filter(x=>x.startsWith('FAIL'));
  console.log(f2.length?`\n${f2.length}/${out.length} FAILED`:`\nPASS - ${out.length} readsFrom sample-sharing assertions green`);
  process.exit(f2.length?1:0);
},500);


