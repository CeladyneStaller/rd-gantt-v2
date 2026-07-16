// A milestone KPI names its value sources explicitly (kpi.sources), because the KR KPIs that feed it live in
// EXEC-<div> docs the planning app cannot write. Multiple sources are allowed and the BEST-SCORING one wins.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const C=require((process.env.RD_SRC||'/home/claude')+'/core.js');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

// ---------- core: best-scoring source wins ----------
// Corey's case: milestone KPI pressure >= 40 bar, fed by a 10 bar KR and a 40 bar KR.
const msK={ id:'MK', hostType:'milestone', hostId:'M1', name:'Pressure', direction:'up', target:40, unit:'bar',
            targetType:'demonstration', sources:['KA','KB'] };
const kA={ id:'KA', hostType:'keyResult', hostId:'KR1', name:'Rig A pressure', direction:'up', target:40, targetType:'demonstration' };
const kB={ id:'KB', hostType:'keyResult', hostId:'KR2', name:'Rig B pressure', direction:'up', target:40, targetType:'demonstration' };
const pool=[msK,kA,kB];
const docs={ '__portfolio__':{ kpis:[msK], kpiUpdates:[] },
             'D1':{ kpis:[kA,kB], kpiUpdates:[ {id:'u1',kpiId:'KA',value:10,timestamp:5000},     // newer, but worse
                                               {id:'u2',kpiId:'KB',value:40,timestamp:1000} ] } };
ok(C.effValue(msK, pool, docs)===40, 'the best-scoring source wins: 40 bar beats 10 bar against a >=40 target');
const e=C.effValueSource(msK, pool, docs);
ok(e && e.src==='KB', '...and the winner is reported, so the value can be attributed');
ok(e.own===false, '...as a linked source, not a manual entry');
ok(C.kpiScoreResolved(msK, pool, docs)===100, 'the milestone KPI scores on the winning source (100)');
// recency would have picked the WRONG one — proves the rule actually changed
ok(C.effValue(msK, pool, docs)!==10, 'the newer-but-worse reading does not win (this is not recency precedence)');

// direction matters: for a "lower is better" target the smaller value should win
const msD=Object.assign({}, msK, { id:'MD', direction:'down', target:20, sources:['KA','KB'] });
const poolD=[msD,kA,kB];
const docsD={ '__portfolio__':{ kpis:[msD], kpiUpdates:[] }, 'D1':docs['D1'] };
ok(C.effValue(msD, poolD, docsD)===10, 'with a "<= 20" target the 10 bar source wins instead');

// a value posted on the milestone KPI itself overrides every source
const docsOwn={ '__portfolio__':{ kpis:[msK], kpiUpdates:[{id:'u3',kpiId:'MK',value:33,timestamp:9000}] }, 'D1':docs['D1'] };
ok(C.effValue(msK, pool, docsOwn)===33, 'a manually posted value overrides the linked sources');
ok(C.effValueSource(msK, pool, docsOwn).own===true, '...and reports itself as a manual entry');

// a single source needs no contest
const msOne=Object.assign({}, msK, { id:'M1S', sources:['KA'] });
ok(C.effValue(msOne, [msOne,kA,kB], { '__portfolio__':{kpis:[msOne]}, 'D1':docs['D1'] })===10, 'a single source just supplies its value');

// unchanged behaviour when nothing declares sources
const plain={ id:'P', hostType:'milestone', hostId:'M1', direction:'up', target:5, targetType:'demonstration' };
ok(C.effValue(plain, [plain], { '__portfolio__':{kpis:[plain],kpiUpdates:[]} })==null, 'a KPI with no sources and no reading resolves to null (unchanged)');
ok(C.sourcesOf(plain, [plain]).length===0, 'sourcesOf is empty for a KPI that declares none');

// ---------- planning: picker + note ----------
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var o=[]; function ok(c,m){ o.push((c?'ok  ':'FAIL ')+m); }
   try{
    persistPortfolio=function(){};
    execDocs={ "EXEC-D1":{ objectiveState:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[],
      keyResults:[{id:'KR1',objectiveId:'O1',statement:'Reach pressure'},{id:'KR2',objectiveId:'O1',statement:'Hold pressure'},
                  {id:'KR3',objectiveId:'O2',statement:'Seal integrity'},{id:'KR0',objectiveId:'O1',statement:'KR with no KPIs'},
                  {id:'KRX',objectiveId:'OX',statement:'Other initiative KR'}],
      kpis:[{id:'KA',hostType:'keyResult',hostId:'KR1',name:'Rig A pressure',direction:'up',target:40,targetType:'demonstration'},
            {id:'KB',hostType:'keyResult',hostId:'KR2',name:'Rig B pressure',direction:'up',target:40,targetType:'demonstration'},
            {id:'KC',hostType:'keyResult',hostId:'KR3',name:'Leak rate',direction:'down',target:2,targetType:'demonstration'},
            {id:'KX',hostType:'keyResult',hostId:'KRX',name:'Unrelated',direction:'up',target:1,targetType:'demonstration'}],
      kpiUpdates:[{id:'u1',kpiId:'KA',value:10,timestamp:5000},{id:'u2',kpiId:'KB',value:40,timestamp:1000}] } };
    portfolio=Object.assign(blankPortfolio(), {
      divisions:[{id:'D1',name:'Div'}],
      initiatives:[{id:'I1',divisionId:'D1',name:'Init'},{id:'I2',divisionId:'D1',name:'Other'}],
      objectives:[{id:'O1',divisionId:'D1',initiativeId:'I1',statement:'Demonstrate pressure envelope',quarter:'26Q1'},
                  {id:'O2',divisionId:'D1',initiativeId:'I1',statement:'Qualify seals',quarter:'26Q2'},
                  {id:'OX',divisionId:'D1',initiativeId:'I2',statement:'other'}],
      milestones:[{id:'M1',initiativeId:'I1',name:'Pressure demo',plannedDate:100}],
      kpis:[{id:'MK',hostType:'milestone',hostId:'M1',name:'Pressure',direction:'up',target:40,unit:'bar',targetType:'demonstration',isDefiner:true,sources:['KA','KB']}] });

    // candidates are scoped to the milestone's own initiative
    var cands=msSourceCandidates('M1').map(c=>c.id);
    ok(cands.indexOf('KA')>=0 && cands.indexOf('KB')>=0, 'KR KPIs in the milestone initiative are offered as sources');
    ok(cands.indexOf('KX')<0, 'a KR KPI from a different initiative is NOT offered');

    // the value resolves through the sources, best-scoring first
    var pm=pfMap(), pool=poolOf(pm);
    ok(RD.effValue(portfolio.kpis[0], pool, pm)===40, 'the milestone target reads 40 (the best-scoring source)');

    // the note names the source under the row
    openEditor('M1','milestone');
    var tgts=document.getElementById('pfModalBody').innerHTML;
    ok(/pft-src/.test(tgts), 'a source note renders under the milestone KPI');
    ok(/Rig B pressure/.test(tgts), '...naming the KPI the value came from');
    ok(/best of 2/.test(tgts), '...and noting it won out of 2 sources');

    // the picker is checkboxed to the current sources
    openKpiEditor('M1','MK','milestone');
    var body=document.getElementById('pfKpiBody');
    ok(body.querySelectorAll('[data-src]').length===3, 'the editor lists every KR KPI in the initiative as a source option');
    ok(body.querySelector('[data-src="KA"]').checked && body.querySelector('[data-src="KB"]').checked, 'existing sources come back checked');
    // unchecking one persists
    body.querySelector('[data-src="KA"]').checked=false;
    saveKpiEditor();
    var mk=(portfolio.kpis||[]).find(k=>k.id==='MK');
    ok(mk.sources.length===1 && mk.sources[0]==='KB', 'unchecking a source removes it from kpi.sources');

    // ---- the picker is grouped: objective (quarter) > KR > its KPIs ----
    openKpiEditor('M1','MK','milestone');
    var pb=document.getElementById('pfKpiBody'), ph=pb.innerHTML;
    ok(pb.querySelectorAll('.pfk-obj').length===2, 'the picker groups by objective (both initiative objectives listed)');
    ok(/Demonstrate pressure envelope/.test(ph) && /Qualify seals/.test(ph), '...naming each objective');
    ok(/26Q1/.test(ph) && /26Q2/.test(ph), '...with its quarter beside it');
    ok(pb.querySelectorAll('.pfk-kr').length===3, 'each objective breaks down into its Key Results');
    ok(/Reach pressure/.test(ph) && /Hold pressure/.test(ph) && /Seal integrity/.test(ph), '...naming each KR');
    ok(!/KR with no KPIs/.test(ph), 'a KR with no KPIs is pruned — it has nothing to offer');
    ok(!/Other initiative KR/.test(ph) && !/Unrelated/.test(ph), 'a different initiative is still excluded entirely');
    // nesting order: objective, then its KR, then that KR's KPI
    ok(ph.indexOf('Demonstrate pressure envelope') < ph.indexOf('Reach pressure'), 'the objective heads its KRs');
    ok(ph.indexOf('Reach pressure') < ph.indexOf('Rig A pressure'), 'the KR heads its KPIs');
    ok(ph.indexOf('Rig B pressure') < ph.indexOf('Qualify seals'), 'the first objective closes before the next begins');
    ok(pb.querySelectorAll('[data-src]').length===3, 'every offered KPI is still checkable');
    ok(msSourceCandidates('M1').length===3, 'the flat candidate view agrees with the tree');

    // an initiative KPI gets no picker (milestone-only feature)
    portfolio.kpis.push({id:'IK',hostType:'initiative',hostId:'I1',name:'Cost',direction:'down',target:9,targetType:'demonstration',isDefiner:true});
    openKpiEditor('I1','IK','initiative');
    ok(document.getElementById('pfKpiBody').querySelectorAll('[data-src]').length===0, 'initiative KPIs get no source picker');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(o));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const all=out.concat(JSON.parse(d.body.getAttribute('data-out')||'[]'));
    all.forEach(l=>console.log(l));
    const fl=all.filter(x=>x.startsWith('FAIL'));
    console.log(fl.length?`\n${fl.length}/${all.length} FAILED`:`\nPASS — ${all.length} milestone-source assertions green`);
    process.exit(fl.length?1:0); },400);
},450);
