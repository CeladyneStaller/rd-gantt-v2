// Portfolio-hosted KPIs (milestone / initiative) had no way to record a value: planning never wrote
// kpiUpdates and the execution app only feeds objective-scoped KPIs, so Measured was always "no read".
// Core already READS portfolio.kpiUpdates (withPortfolio + readingsFor iterate every doc key).
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
function boot(url){ return new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url,pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }}); }
const dom=boot("https://x.test/?token=t"); const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    persistPortfolio=function(){};
    execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] } };
    portfolio=Object.assign(blankPortfolio(), {
      divisions:[{id:'D1',name:'Div'}], initiatives:[{id:'I1',divisionId:'D1',name:'Init'}],
      milestones:[{id:'M1',initiativeId:'I1',name:'Design freeze',plannedDate:100}],
      kpis:[{id:'MK',hostType:'milestone',hostId:'M1',name:'Power',direction:'up',target:5,unit:'kW',isDefiner:true,groupId:'G1'}] });
    ok(Array.isArray(portfolio.kpiUpdates), 'a blank portfolio carries a kpiUpdates array');

    openEditor('M1','milestone');
    var cell=document.querySelector('#pfModalBody [data-tgtpost="MK"]');
    ok(!!cell, 'the milestone target Current cell is click-to-post');
    ok(/no read/.test(cell.textContent), 'it starts with no recorded value');
    ok(RD.effValue(portfolio.kpis[0], poolOf(pfMap()), pfMap())==null, 'core resolves no value before anything is recorded');

    postTargetValue('MK','M1','milestone');
    var inp=document.querySelector('#pfModalBody [data-tgtpost="MK"] input');
    ok(!!inp, 'clicking opens an inline input');
    inp.value='7.5'; inp.onblur();
    ok(portfolio.kpiUpdates.length===1 && portfolio.kpiUpdates[0].kpiId==='MK' && portfolio.kpiUpdates[0].value===7.5,
       'the reading is written onto the portfolio doc — the only doc this app owns');
    // the value must resolve through core (withPortfolio puts the portfolio in the docs map)
    var pm=pfMap(), pool=poolOf(pm);
    ok(RD.effValue(portfolio.kpis[0], pool, pm)===7.5, 'core resolves the recorded value for a milestone KPI');
    ok(RD.kpiScoreResolved(portfolio.kpis[0], pool, pm)===100, '...and scores it against the target (7.5 >= 5 -> 100)');
    var cell2=document.querySelector('#pfModalBody [data-tgtpost="MK"]');
    ok(/7\\.5/.test(cell2.textContent) && !/no read/.test(cell2.textContent), 'the cell refreshes to show the recorded value');

    // a later reading supersedes the earlier one
    postTargetValue('MK','M1','milestone');
    var i2=document.querySelector('#pfModalBody [data-tgtpost="MK"] input'); i2.value='3'; i2.onblur();
    ok(RD.effValue(portfolio.kpis[0], poolOf(pfMap()), pfMap())===3, 'the newest reading wins');
    ok(portfolio.kpiUpdates.length===2, '...and the earlier reading is kept as history');

    // this reaches the milestone report's Measured column, which was the point
    openMilestoneReport('M1');
    ok(document.getElementById('msrBody').innerHTML.indexOf('3')>=0, 'the recorded value reaches the milestone report');

    // blank / invalid input records nothing
    openEditor('M1','milestone');
    postTargetValue('MK','M1','milestone');
    var i3=document.querySelector('#pfModalBody [data-tgtpost="MK"] input'); i3.value=''; i3.onblur();
    ok(portfolio.kpiUpdates.length===2, 'a blank entry records nothing');

    // initiative-hosted targets get the same affordance (shared component)
    portfolio.kpis.push({id:'IK',hostType:'initiative',hostId:'I1',name:'Cost',direction:'down',target:9,isDefiner:true,groupId:'G2'});
    openEditor('I1','initiative');
    ok(!!document.querySelector('#pfModalBody [data-tgtpost="IK"]'), 'initiative targets gain the same recordable cell');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const prev=JSON.parse(d.body.getAttribute('data-out')||'[]'); roBoot(prev); },400);
},450);

function roBoot(prev){
  const dom2=boot("https://x.test/?token=t&readonly=1"); const w2=dom2.window;
  setTimeout(()=>{ const d2=w2.document, s2=d2.createElement('script');
    s2.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
     try{
      execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] } };
      portfolio=Object.assign(blankPortfolio(), { divisions:[{id:'D1',name:'Div'}], initiatives:[{id:'I1',divisionId:'D1',name:'Init'}],
        milestones:[{id:'M1',initiativeId:'I1',name:'ms',plannedDate:100}],
        kpis:[{id:'MK',hostType:'milestone',hostId:'M1',name:'Power',direction:'up',target:5,isDefiner:true,groupId:'G1'}] });
      ok(RO===true, 'read-only instance booted');
      ok(document.getElementById('pfModalBody').innerHTML.indexOf('data-tgtpost')<0, 'read-only: the cell is not postable');
     }catch(e){ ok(false,'RO threw: '+e.message); }
     document.body.setAttribute('data-out', JSON.stringify(out));
    })();`;
    d2.body.appendChild(s2);
    setTimeout(()=>{ const out=prev.concat(JSON.parse(d2.body.getAttribute('data-out')||'[]'));
      out.forEach(l=>console.log(l));
      const fl=out.filter(x=>x.startsWith('FAIL'));
      console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} target-value assertions green`);
      process.exit(fl.length?1:0); },350);
  },450);
}
