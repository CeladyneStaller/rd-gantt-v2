// Overall-tab tiled view: boots planning_app with portfolio + exec docs (KRs/gates/KPIs/FMEA) + spec docs
// (model specs/components/sub-products), renders the tiled overview, and opens all 4 read-only modals.
const {JSDOM}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"outside-only", pretendToBeVisual:true, url:"https://localhost/"});
const w=dom.window;
w.fetch=()=>new Promise(()=>{});
if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
if(!w.requestAnimationFrame) w.requestAnimationFrame=cb=>setTimeout(cb,0);
if(!w.cancelAnimationFrame) w.cancelAnimationFrame=()=>{};
const hook=`\n;window.__t={ setP:function(p){portfolio=p;}, blank:function(){return blankPortfolio();}, today:function(){return todayDay();},
  setExec:function(m){Object.keys(m).forEach(function(k){execDocs[k]=m[k];});},
  setSpec:function(m){Object.keys(m).forEach(function(k){specDocs[k]=m[k];});},
  renderOv:function(){try{renderOverview();return document.getElementById('ovBody').innerHTML;}catch(e){return 'ERR:'+e.message+' @ '+(e.stack||'').split('\\n')[1];}},
  openDet:function(k,i){try{openOvDetail(k,i);return {body:document.getElementById('ovDetBody').innerHTML,title:document.getElementById('ovDetTitle').textContent,badges:document.getElementById('ovDetBadges').innerHTML,shown:!document.getElementById('ovDetModal').hidden};}catch(e){return {body:'ERR:'+e.message+' @ '+(e.stack||'').split('\\n')[1]};}} };`;
for(const sc of [...w.document.querySelectorAll('script:not([src])')]){ let code=sc.textContent; if(code.includes('function groupedTreeHtml')) code=code+hook; try{ w.eval(code);}catch(e){ console.error('EVAL ERROR:',e.message); process.exit(1);} }
const T=w.__t; if(!T){ console.error('hook not installed'); process.exit(1); }
const TD=T.today();

const P=T.blank();
P.divisions=[{id:'D1',name:'FuelCell',order:0},{id:'D2',name:'Electrolyzer',order:1}];
P.products=[{id:'P1',name:'MEA Stack',divisionId:'D1',order:0},{id:'P2',name:'PEM Cell',divisionId:'D2',order:1}];
P.models=[{id:'M1',name:'Gen3 MEA',productId:'P1',order:0},{id:'M2',name:'Gen4 MEA',productId:'P1',order:1},{id:'M3',name:'EL-500',productId:'P2',order:0}];
P.initiatives=[{id:'I1',name:'InitA',divisionId:'D1',modelId:'M1',plannedStart:TD-200,plannedEnd:TD+200,order:0},{id:'I2',name:'InitB',divisionId:'D2',modelId:'M3',plannedStart:TD-200,plannedEnd:TD+200,order:1}];
P.objectives=[
  {id:'O1',statement:'Hit 1.2 A/cm2',divisionId:'D1',initiativeId:'I1',modelId:'M1',quarter:'2026Q3',milestoneIds:[],plannedStart:TD-80,plannedEnd:TD+80,order:0},
  {id:'O3',statement:'Reduce Pt loading',divisionId:'D1',initiativeId:'I1',quarter:'2026Q3',milestoneIds:[],plannedStart:TD-80,plannedEnd:TD+80,order:1},
  {id:'O2',statement:'Reach 2 kg/day',divisionId:'D2',initiativeId:'I2',modelId:'M3',quarter:'2026Q3',milestoneIds:[],plannedStart:TD-80,plannedEnd:TD+80,order:2}];
P.milestones=[{id:'MS1',name:'Design freeze',initiativeId:'I1',plannedDate:TD,order:0}];
T.setP(P);
T.setExec({
 "EXEC-D1":{ keyResults:[{id:'KR1',objectiveId:'O1',statement:'Current density'}],
   kpis:[{id:'K1',hostType:'keyResult',hostId:'KR1',name:'j',target:1.2,direction:'up',unit:'A/cm2',objectiveId:'O1'},{id:'K2',hostType:'stageGate',hostId:'SG1',name:'PoC',target:3,direction:'up',objectiveId:'O1'},{id:'K3',hostType:'milestone',hostId:'MS1',name:'BOM',target:180,direction:'down',unit:'$',objectiveId:null}],
   stageGates:[{id:'SG1',objectiveId:'O1',setId:'SET1',name:'Feasibility',plannedDate:TD-40,actualDate:TD-45},{id:'SG2',objectiveId:'O1',setId:'SET1',name:'Design',plannedDate:TD+40}],
   stageGateSets:[{id:'SET1',objectiveId:'O1',name:'General',order:0,chained:true}],
   risks:[{rid:'R1',objectiveId:'O1',problem:'Delamination',modes:[{mid:'m1',mode:'Membrane delamination',effects:[{eid:'e1',effect:'leak',causes:[{cid:'c1',cause:'swelling',severity:8,occurrence:5,detection:5}]}]}]}],
   kpiUpdates:[{kpiId:'K1',value:1.05},{kpiId:'K2',value:3},{kpiId:'K3',value:205}], tasks:[],stageGateEdges:[] },
 "EXEC-D2":{ keyResults:[{id:'KR2',objectiveId:'O2',statement:'Rate'}],
   kpis:[{id:'K4',hostType:'keyResult',hostId:'KR2',name:'rate',target:2,direction:'up',unit:'kg',objectiveId:'O2'}],
   stageGates:[{id:'SG3',objectiveId:'O2',setId:'SET2',name:'Rig',plannedDate:TD-30,actualDate:TD-35}],
   stageGateSets:[{id:'SET2',objectiveId:'O2',name:'General',order:0,chained:true}],
   risks:[], kpiUpdates:[{kpiId:'K4',value:1.4}], tasks:[],stageGateEdges:[] }});
T.setSpec({
 "SPEC-D1":{ modelSpec:{M1:{maturity:'Prototype'},M2:{maturity:'Concept'}},
   keyResults:[{id:'SP1',objectiveId:'M1',statement:'Active area'}],
   stageGates:[{id:'CO1',objectiveId:'M1',name:'MEA component'},{id:'SUB1',objectiveId:'M1',name:'Cell frame sub',refModel:'M2'}],
   kpis:[{id:'SK1',hostType:'keyResult',hostId:'SP1',name:'area',target:25,direction:'up',unit:'cm2',objectiveId:'M1'},{id:'SK2',hostType:'stageGate',hostId:'CO1',name:'swelling',target:5,direction:'down',unit:'%',objectiveId:'M1'}],
   kpiUpdates:[{kpiId:'SK1',value:25},{kpiId:'SK2',value:4.2}], tasks:[],stageGateEdges:[] },
 "SPEC-D2":{ modelSpec:{M3:{maturity:'Pilot'}}, keyResults:[{id:'SP2',objectiveId:'M3',statement:'Cell area'}], stageGates:[{id:'CO2',objectiveId:'M3',name:'Anode'}], kpis:[{id:'SK3',hostType:'keyResult',hostId:'SP2',name:'area',target:100,direction:'up',objectiveId:'M3'}], kpiUpdates:[{kpiId:'SK3',value:100}], tasks:[],stageGateEdges:[] }});

let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};
const g=T.renderOv();
ok(!g.startsWith('ERR:'), "renderOverview ran ("+g.slice(0,80)+")");
ok((g.match(/class="card"/g)||[]).length===2, "2 division cards");
ok(/objectives \u00b7/.test(g)&&/milestones/.test(g), "division card: # objectives · # milestones");
ok((g.match(/class="pip"/g)||[]).length===8, "division cards: status pips (4 each)");
ok((g.match(/class="divgroup"/g)||[]).length===2, "2 division groups");
ok((g.match(/kidlbl">Models/g)||[]).length===2 && (g.match(/kidlbl">Objectives/g)||[]).length===2 && (g.match(/kidlbl">Milestones/g)||[]).length===1, "Models/Objectives/Milestones rows");
ok((g.match(/class="mtile"/g)||[]).length===3, "3 model tiles (M1,M2 under P1; M3 under P2)");
ok((g.match(/class="tcard"/g)||[]).length===4, "4 obj+ms tiles (O1,O3,O2,MS1)");
ok(/Gen3 MEA/.test(g)&&/conformance/.test(g)&&/Active area/.test(g), "model tile: name + conformance + spec");
ok(/components \u00b7 1 sub-products/.test(g), "model tile: component + sub-product counts (M1: 1 comp, 1 sub)");
ok(/Current density/.test(g)&&/Gates 1\/2/.test(g), "objective tile: KR + gate strip");
// modals
let d=T.openDet('objective','O1');
ok(d.shown&&!String(d.body).startsWith('ERR:'), "objective modal opens ("+String(d.body).slice(0,60)+")");
ok(/Key results/.test(d.body)&&/Stage-gates/.test(d.body)&&/PoC:/.test(d.body), "obj modal: KRs + gate target/value");
ok(/RPN summary/.test(d.body)&&/Membrane delamination/.test(d.body)&&/>200</.test(d.body), "obj modal: RPN summary (8x5x5=200)");
ok(/Schedule/.test(d.body), "obj modal: schedule");
d=T.openDet('model','M1');
ok(/Components \u00b7 readiness/.test(d.body)&&/MEA component/.test(d.body), "model modal: components");
ok(/Sub-products/.test(d.body)&&/Cell frame sub/.test(d.body), "model modal: sub-products");
ok(/Objective rollup/.test(d.body)&&/Product specifications/.test(d.body), "model modal: specs + rollup");
d=T.openDet('milestone','MS1');
ok(/KPIs/.test(d.body)&&/BOM/.test(d.body)&&/Schedule/.test(d.body), "milestone modal: KPIs + schedule");
d=T.openDet('division','D1');
ok(/Summary/.test(d.body)&&/Models/.test(d.body)&&/Gen3 MEA/.test(d.body), "division modal: summary + models");

// ---- products/models tile by OWNING division, not by whoever references them ----
// P3 is owned by D1 and has NO objective this quarter; O4 sits in D2 but points at D1's product P1.
const P2t=T.blank();
P2t.divisions=[{id:'D1',name:'FuelCell',order:0},{id:'D2',name:'Electrolyzer',order:1}];
P2t.products=[{id:'P1',name:'MEA Stack',divisionId:'D1',order:0},{id:'P2',name:'PEM Cell',divisionId:'D2',order:1},{id:'P3',name:'Idle Product',divisionId:'D1',order:2}];
P2t.models=[{id:'M1',name:'Gen3 MEA',productId:'P1',order:0},{id:'M9',name:'Idle Model',productId:'P3',order:1}];
P2t.initiatives=[{id:'I1',name:'InitA',divisionId:'D1',modelId:'M1',plannedStart:TD-200,plannedEnd:TD+200,order:0},
                 {id:'IX',name:'CrossInit',divisionId:'D1',productId:'P1',plannedStart:TD-200,plannedEnd:TD+200,order:1}];
P2t.objectives=[
  {id:'O1',statement:'FC work',divisionId:'D1',initiativeId:'I1',modelId:'M1',quarter:'2026Q3',milestoneIds:[],plannedStart:TD-80,plannedEnd:TD+80,order:0},
  {id:'O4',statement:'EL objective on FC product',divisionId:'D2',initiativeId:'IX',quarter:'2026Q3',milestoneIds:[],plannedStart:TD-80,plannedEnd:TD+80,order:1}];
P2t.milestones=[];
T.setP(P2t);
const h2=T.renderOv();
const dg=h2.split('divgroup'), fcBlock=dg[1]||'', elBlock=dg[2]||'';
ok(/Idle Product/.test(h2), "a product with no objective this quarter still gets a tile");
ok(/Idle Model/.test(h2), "...and its models tile with it");
ok(/Idle Product/.test(fcBlock) && !/Idle Product/.test(elBlock), "the idle product tiles only under the division that owns it");
ok(/MEA Stack/.test(fcBlock), "MEA Stack tiles under its owning division (FuelCell)");
// a division whose work points at another division's product gets a LABELLED block, not "unclassified"
ok(/MEA Stack/.test(elBlock), "a borrowed product still gets a labelled block in the borrowing division");
ok(!/unclassified/.test(elBlock), "...so its objectives are NOT dumped into the unclassified bucket");
ok(/D1 \u2014 MEA Stack/.test(elBlock), "the borrowed block is prefixed with the owning division's code");
ok(!/D1 \u2014 MEA Stack/.test(fcBlock), "...while the owning division shows the bare product name");
ok(/EL objective on FC product/.test(elBlock), "the borrowing objective reads under that product block");
// scorecards (model tiles) belong to the owning division only
ok(/Gen3 MEA/.test(fcBlock), "model scorecards render under the owning division");
ok(!/Gen3 MEA/.test(elBlock), "...and NOT under the borrowing division");

console.log(f?('\n'+f+'/'+n+' FAILED'):('\nPASS — '+n+' overview-tiles assertions green'));
process.exit(f?1:0);
