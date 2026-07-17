// Range targets: direction:'range' + target={lo,hi}. Core's progressRange already scores 100 inside the band
// and falls off linearly to 0 one full band-width outside — this exercises the AUTHORING that was missing, and
// the hybrid storage: {lo,hi} canonical, rangeSpec an optional record of "average +/- width%" so it round-trips.
const C=require((process.env.RD_SRC||'/home/claude')+'/rdcore.js');
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

// ---- core scoring (already existed; pinning the contract the UI now depends on) ----
const k=(lo,hi)=>({id:'K',hostType:'keyResult',hostId:'KR1',name:'R',targetType:'demonstration',direction:'range',target:{lo,hi},isDefiner:true});
const dv=(v)=>({D1:{kpis:[k(95,105)],kpiUpdates:[{id:'u',kpiId:'K',value:v,timestamp:1}]}});
ok(C.kpiScoreResolved(k(95,105),[k(95,105)],dv(100))===100, 'a value inside the band scores 100');
ok(C.kpiScoreResolved(k(95,105),[k(95,105)],dv(95))===100,  'the lower bound is full credit');
ok(C.kpiScoreResolved(k(95,105),[k(95,105)],dv(105))===100, 'the upper bound is full credit');
ok(C.kpiScoreResolved(k(95,105),[k(95,105)],dv(85))===0,    'one full band-width below scores 0');
ok(C.kpiScoreResolved(k(95,105),[k(95,105)],dv(115))===0,   'one full band-width above scores 0');
ok(Math.abs(C.kpiScoreResolved(k(95,105),[k(95,105)],dv(90))-50)<1e-9, 'half a band-width below scores 50');
const half=C.kpiScoreResolved(k(95,105),[k(95,105)],dv(110));
ok(half>0 && half<100 && Math.abs(half-50)<1e-9, 'half a band-width outside scores 50 (linear falloff)');

// ---- the editor: authoring both ways ----
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?division=D1&token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
setTimeout(()=>{ const w=dom.window;
  const t=(fn,m)=>{ try{ ok(fn(),m); }catch(e){ ok(false,m+' [threw: '+e.message+']'); } };
  // saveTgtModal re-reads every [data-tf] from the DOM, so set the SEGMENT state on the draft, redraw, then
  // fill the real inputs — exactly what a user does. Setting draftTgt alone is silently overwritten.
  const author=(host,hostId,kpiId,segs,fields)=>w.eval(`(function(){
      openKpiTgtModal(${JSON.stringify(host)}, ${JSON.stringify(hostId)}, ${JSON.stringify(kpiId)});
      Object.assign(draftTgt, ${JSON.stringify(segs)});
      redrawTgtBody();
      var b=document.getElementById('kpiTgtBody'), f=${JSON.stringify(fields)};
      Object.keys(f).forEach(function(k){ var el=b.querySelector('[data-tf="'+k+'"]'); if(el) el.value=f[k]; });
      saveTgtModal();
    })()`);
  const boot=()=>w.eval(`exec={objectiveState:[],keyResults:[{id:'KR1',objectiveId:'O1',statement:'kr'}],kpis:[],kpiUpdates:[],
      tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[{id:'G1',objectiveId:'O1',name:'Gate'}]};
    portfolio={divisions:[{id:'D1',name:'D'}],objectives:[{id:'O1',divisionId:'D1',statement:'o'}],initiatives:[],kpis:[],milestones:[]};
    selectedObj='O1'; divisionId='D1'; refreshTargetIds();
    renderAll=function(){}; setMsg=function(){}; persistExec=function(){}; restoreReturn=function(){return false;};`);

  // Range is offered at all
  const has=(sel)=>w.eval("(function(){var d=document.createElement('div');d.innerHTML=tgtModalBody();return !!d.querySelector('"+sel+"');})()");
  t(()=>{ boot(); w.eval("openKpiTgtModal('keyResult','KR1',null);"); return has('[data-tgtdir=range]'); },
    'the shared editor offers a Range direction');
  t(()=>{ w.eval("openKpiTgtModal('stageGate','G1',null);"); return has('[data-tgtdir=range]'); },
    '...on stage-gate targets too');
  t(()=>{ w.eval("openKpiTgtModal('keyResult','KR1',null); draftTgt.dir='range';");
          return has('[data-tf=rangeLo]') && has('[data-tf=rangeHi]') && has('[data-tgtrmode=pct]'); },
    'choosing Range reveals min/max inputs and an average +/- width% mode');

  // MIN/MAX authoring
  t(()=>{ boot(); author('keyResult','KR1',null,{dir:'range',rangeMode:'minmax'},{name:'Band',rangeLo:'95',rangeHi:'105'});
          return w.eval("var x=exec.kpis.find(k=>k.name==='Band'); !!x && x.direction==='range' && x.target.lo===95 && x.target.hi===105"); },
    'min/max authoring saves direction:range and target {lo:95,hi:105}');
  t(()=>w.eval("exec.kpis.find(k=>k.name==='Band').rangeSpec===undefined"),
    '...and records no rangeSpec (min/max IS the intent)');
  t(()=>w.eval("var x=exec.kpis.find(k=>k.name==='Band'); RD.kpiScore(x, 100)===100 && RD.kpiScore(x, 85)===0 && RD.kpiScore(x, 90)===50"),
    '...and core scores it: 100 inside, 50 half a width out, 0 one full width out');
  t(()=>{ boot(); author('keyResult','KR1',null,{dir:'range',rangeMode:'minmax'},{name:'Swapped',rangeLo:'105',rangeHi:'95'});
          return w.eval("var x=exec.kpis.find(k=>k.name==='Swapped'); x.target.lo===95 && x.target.hi===105"); },
    'entering min/max backwards is normalised, not stored inverted');

  // AVERAGE +/- WIDTH% authoring
  t(()=>{ boot(); author('keyResult','KR1',null,{dir:'range',rangeMode:'pct'},{name:'Pct',rangeCenter:'100',rangePct:'10'});
          return w.eval("var x=exec.kpis.find(k=>k.name==='Pct'); x.target.lo===95 && x.target.hi===105"); },
    'average 100 with width 10% gives a band of 95 to 105 (width = 10% OF the average)');
  t(()=>w.eval("var x=exec.kpis.find(k=>k.name==='Pct'); x.rangeSpec && x.rangeSpec.mode==='pct' && x.rangeSpec.center===100 && x.rangeSpec.pct===10"),
    '...and rangeSpec records the intent so it round-trips');
  t(()=>{ w.eval("var x=exec.kpis.find(k=>k.name==='Pct'); openKpiTgtModal('keyResult','KR1', x.id);");
          return w.eval("draftTgt.dir==='range' && draftTgt.rangeMode==='pct' && String(draftTgt.rangeCenter)==='100' && String(draftTgt.rangePct)==='10'"); },
    'reopening a pct range restores average + width%, not raw lo/hi');
  t(()=>{ boot(); author('keyResult','KR1',null,{dir:'range',rangeMode:'minmax'},{name:'MM',rangeLo:'2',rangeHi:'4'});
          w.eval("var x=exec.kpis.find(k=>k.name==='MM'); openKpiTgtModal('keyResult','KR1', x.id);");
          return w.eval("draftTgt.dir==='range' && String(draftTgt.rangeLo)==='2' && String(draftTgt.rangeHi)==='4' && draftTgt.rangeMode==='minmax'"); },
    'reopening a min/max range restores lo/hi');

  // the latent bug this fixes: the editor used to flatten any direction to increase/decrease
  t(()=>{ boot(); author('keyResult','KR1',null,{dir:'range',rangeMode:'minmax'},{name:'Keep',rangeLo:'1',rangeHi:'3'});
          w.eval("var x=exec.kpis.find(k=>k.name==='Keep'); openKpiTgtModal('keyResult','KR1', x.id); saveTgtModal();");
          return w.eval("var x=exec.kpis.find(k=>k.name==='Keep'); x.direction==='range' && x.target.lo===1 && x.target.hi===3"); },
    'reopening and re-saving a range KPI no longer flattens it to increase');

  // switching away from range cleans up
  t(()=>{ const id=w.eval("exec.kpis.find(k=>k.name==='Keep').id");
          author('keyResult','KR1',id,{dir:'increase'},{target:'7'});
          return w.eval("var x=exec.kpis.find(k=>k.name==='Keep'); x.direction==='up' && x.target===7 && x.rangeSpec===undefined"); },
    'switching a range KPI back to increase restores a scalar target and drops rangeSpec');
  t(()=>{ boot(); author('keyResult','KR1',null,{dir:'range',rangeMode:'minmax'},{name:'Empty',rangeLo:'',rangeHi:''});
          return w.eval("var x=exec.kpis.find(k=>k.name==='Empty'); !!x && x.target===null"); },
    'an incomplete range saves a null target (unscored) rather than inventing a band');

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} range-target assertions green`);
  process.exit(fl.length?1:0);
},500);
