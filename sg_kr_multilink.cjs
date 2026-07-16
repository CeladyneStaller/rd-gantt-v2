// SG↔KR multi-link precedence: multiple SGs may link one KR KPI; latest-linked wins regardless of
// value; a manual reading on the KR always wins; empty-state gate shows a "+ add linked KPI" button.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
function mockCy(w){ w.cytoscape=function(){ return { on(){}, ready(cb){try{cb&&cb();}catch(e){}}, fit(){}, resize(){}, destroy(){}, getElementById(){return{length:0,select(){}};}, zoom(){return 1;}, width(){return 800;}, height(){return 560;}, layout(){return{run(){}};}, elements(){return{length:0};}, $(){return{unselect(){}};} }; }; }
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); mockCy(w); }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); } var D=document;
   try{
    portfolio={divisions:[{id:'DV'}],objectives:[{id:'O',statement:'o',divisionId:'DV',plannedStart:0,plannedEnd:9999}],initiatives:[],milestones:[],products:[],models:[],composition:[],kpis:[]};
    divisionId='DV'; selectedObj='O'; exec=blankExec();
    exec.keyResults=[{id:'KR',objectiveId:'O',statement:'kr'}];
    exec.stageGateSets=[{id:'WS',objectiveId:'O',name:'MEA',order:0,chained:true}];
    exec.stageGates=[{id:'S1',objectiveId:'O',setId:'WS',name:'g1',plannedDate:10},{id:'S2',objectiveId:'O',setId:'WS',name:'g2',plannedDate:20}];
    exec.kpis=[{id:'krk',objectiveId:'O',hostType:'keyResult',hostId:'KR',name:'Power',direction:'up',unit:'kW',target:100,order:0}];

    // (1) empty-state gate row exposes BOTH buttons
    renderKRs(); renderGates();
    var sg=D.getElementById('subSG').innerHTML;
    ok(/data-addkpi="stageGate:S1"/.test(sg) && /data-addlink="stageGate:S1"/.test(sg), 'empty-state gate shows "+ add a target" AND "+ add linked KPI"');

    // (2) an SG can see the KR KPI as a link target (up-only)
    ok(linkCandidates('stageGate','S1').some(k=>k.id==='krk'), 'SG can link up to a KR KPI');

    // (3) link S1; per-host occupied blocks S1 re-linking the same KR, but a sibling SG still can
    makeLinkMember('stageGate','S1','krk',null);
    ok(!linkCandidates('stageGate','S1').some(k=>k.id==='krk'), 'same host cannot double-link the same KR');
    ok(linkCandidates('stageGate','S2').some(k=>k.id==='krk'), 'a SECOND SG can still link the same KR (multi-SG)');

    // (4) link S2; latest link carries the higher priority
    makeLinkMember('stageGate','S2','krk',null);
    var s1m=exec.kpis.find(k=>k.hostId==='S1'&&k.hostType==='stageGate');
    var s2m=exec.kpis.find(k=>k.hostId==='S2'&&k.hostType==='stageGate');
    ok(s1m && s2m && (s2m.linkPriority>s1m.linkPriority), 'later link gets higher linkPriority ('+(s1m&&s1m.linkPriority)+' < '+(s2m&&s2m.linkPriority)+')');

    // (5) latest-linked SG wins the KR value even when its reading is worse
    exec.kpiUpdates=[{id:'u1',kpiId:s1m.id,value:90,timestamp:1000},{id:'u2',kpiId:s2m.id,value:40,timestamp:1001}];
    var krk=exec.kpis.find(k=>k.id==='krk');
    ok(RD.effValue(krk, allKpisPool(), emForCore())===40, 'latest-linked SG (40) wins over earlier SG (90), regardless of value');

    // (6) a manual reading posted on the KR itself always wins over the linked SGs
    exec.kpiUpdates.push({id:'u3',kpiId:'krk',value:77,timestamp:900});
    ok(RD.effValue(krk, allKpisPool(), emForCore())===77, 'manual reading on the KR (77) beats all linked SGs');

    // (7) re-linking flips who is latest: unlink S1 then relink -> S1 now newest -> beats S2 (after clearing manual)
    exec.kpiUpdates=exec.kpiUpdates.filter(u=>u.kpiId!=='krk');       // remove manual so children decide
    unlinkKpi(s1m.id); makeLinkMember('stageGate','S1','krk',null);
    var s1b=exec.kpis.find(k=>k.hostId==='S1'&&k.hostType==='stageGate'&&k.id!==s1m.id) || exec.kpis.find(k=>k.hostId==='S1'&&k.hostType==='stageGate');
    if(s1b){ exec.kpiUpdates.push({id:'u4',kpiId:s1b.id,value:90,timestamp:1100}); }
    ok(RD.effValue(exec.kpis.find(k=>k.id==='krk'), allKpisPool(), emForCore())===90, 're-linking S1 makes it newest -> its value (90) now wins');

   }catch(e){ ok(false,'threw: '+e.message+' @ '+(e.stack||'').split('\\n')[1]); }
   D.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>console.log(l));
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} SG<->KR multi-link assertions green`); process.exit(fl.length?1:0); },500);
},500);
