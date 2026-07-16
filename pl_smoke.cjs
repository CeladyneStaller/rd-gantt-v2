const {JSDOM}=require("jsdom");
const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"outside-only", pretendToBeVisual:true, url:"https://localhost/"});
const w=dom.window;
w.fetch=()=>new Promise(()=>{});
if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
if(!w.requestAnimationFrame) w.requestAnimationFrame=cb=>setTimeout(cb,0);
if(!w.cancelAnimationFrame) w.cancelAnimationFrame=()=>{};

const hook=`\n;window.__t={setP:function(p){portfolio=p;},blank:function(){return blankPortfolio();},`+
  `gth:function(){return groupedTreeHtml();},collapse:function(d){return collapseInheritedClass(d);},`+
  `gbc:function(){return groupByControlHtml();},dimLabel:function(a,b){return dimLabel(a,b);},`+
  `setG:function(m,d){pfGroupMode=m;pfGroupDims=d;},renderG:function(){try{renderGantt();return document.getElementById('ganttWrap').innerHTML;}catch(e){return 'ERR:'+e.message;}},`+
  `openObj:function(id){try{openEditor(id,'objective');return document.getElementById('pfModalBody').innerHTML;}catch(e){return 'ERR:'+e.message;}},`+
  `infill:function(q){var qs=document.querySelector('#pfModalBody [data-f=\"quarter\"]');qs.value=q;qs.dispatchEvent(new Event('change'));var st=document.querySelector('#pfModalBody [data-f=\"plannedStart\"]'),en=document.querySelector('#pfModalBody [data-f=\"plannedEnd\"]');return st.value+'|'+en.value;},`+
  `renderP:function(){try{renderPortfolio();return document.getElementById('structTables').innerHTML;}catch(e){return 'ERR:'+e.message;}}};`;

const scripts=[...w.document.querySelectorAll('script:not([src])')];
for(const sc of scripts){
  let code=sc.textContent;
  if(code.includes('function groupedTreeHtml')) code=code+hook;   // hook the main app script
  try{ w.eval(code); }catch(e){ console.error('EVAL ERROR in a script:',e.message); process.exit(1); }
}
const T=w.__t;
if(!T){ console.error('hook not installed — main script not found'); process.exit(1); }

const P=T.blank();
P.divisions=[{id:'D1',name:'FuelCell',order:0},{id:'D2',name:'Electrolyzer',order:1}];
P.products=[{id:'P1',name:'StackA',divisionId:'D1',order:0}];
P.models=[{id:'M1',name:'ModelX',productId:'P1',order:0}];
P.initiatives=[{id:'I1',name:'InitA',divisionId:'D1',modelId:'M1',order:0},{id:'I2',name:'InitB',divisionId:'D2',order:1}];
P.objectives=[
  {id:'O1',statement:'obj one',divisionId:'D1',initiativeId:'I1',quarter:'2026Q1',owner:'Amy',milestoneIds:[],plannedStart:400,plannedEnd:450,order:0},
  {id:'O2',statement:'obj two',divisionId:'D1',initiativeId:'I1',quarter:'2026Q2',owner:'Bob',productId:'P1',milestoneIds:[],plannedStart:460,plannedEnd:500,order:1},
  {id:'O3',statement:'obj three',divisionId:'D2',initiativeId:'I2',quarter:'2026Q1',owner:'Amy',milestoneIds:[],plannedStart:400,plannedEnd:440,order:2}];
T.setP(P);

let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++; console.error('FAIL:',m);}};

T.setG('dims',['division','product','model']);
const h1=T.gth();
ok(h1.includes('FuelCell')&&h1.includes('Electrolyzer'),'structure: both divisions render');
ok(h1.includes('StackA'),'structure: product level (StackA)');
ok(h1.includes('ModelX'),'structure: model level (ModelX)');
ok((h1.match(/pfgrp-head/g)||[]).length>=4,'structure: nested group headers render ('+((h1.match(/pfgrp-head/g)||[]).length)+')');
ok(!h1.includes('\u2014 none \u2014'),'structure: no "\u2014 none \u2014" header — items with no value for a dimension skip that level');
ok(h1.indexOf('obj one')>0,'structure: objective leaves render');

T.setG('dims',['owner']);
const h2=T.gth();
ok(h2.includes('Amy')&&h2.includes('Bob'),'group-by owner: both owners as headers');

T.setG('dims',['division','product']);
const g1=T.renderG();
ok(!g1.startsWith('ERR:'),'gantt nested render: no error ('+(g1.startsWith('ERR:')?g1:'ok')+')');
ok((g1.match(/ggrouprow/g)||[]).length>=3,'gantt: >=3 group rows ('+((g1.match(/ggrouprow/g)||[]).length)+')');
ok(/padding-left:22px/.test(g1),'gantt: depth-1 group indent (22px) present');

const c1={initiativeId:'I1',modelId:'M1'}; T.collapse(c1); ok(c1.modelId==null&&c1.productId==null,'collapse: model==inherited -> blank (inherits)');
const c2={initiativeId:'I1',modelId:'M9'}; T.collapse(c2); ok(c2.modelId==='M9','collapse: different model kept');
const c3={initiativeId:'I2',productId:'P1'}; T.collapse(c3); ok(c3.productId==='P1','collapse: product on agnostic-init kept');
const c4={initiativeId:null,productId:'P1'}; T.collapse(c4); ok(c4.productId==='P1','collapse: no initiative -> untouched');

const eO1=T.openObj('O1');
ok(!eO1.startsWith('ERR:'),'editor opens for O1 ('+(eO1.startsWith('ERR:')?eO1:'ok')+')');
ok(/<select[^>]*data-f="quarter"/.test(eO1),'editor: quarter is a dropdown');
ok(eO1.includes('value="2026Q1"'),'editor: current quarter present in options');
ok(/value="M1"[^>]*selected|selected[^>]*value="M1"/.test(eO1) || /data-f="modelId"[\s\S]*?value="M1" selected/.test(eO1),'editor: model autofilled from initiative (M1 selected)');
const inf=T.infill('2026Q3'); ok(inf==='2026-07-01|2026-09-30','editor: picking Q3 infills plannedStart/plannedEnd (got '+inf+')');

T.setG('dims',['division','product']);
const ctrl=T.gbc();
ok(ctrl.includes('data-gb="mode"')&&ctrl.includes('data-gb="dim"')&&ctrl.includes('data-gb="add"'),'builder: mode + dim chain + add present');
T.setG('hierarchy',[]);
ok(!T.gbc().includes('data-gb="dim"'),'builder: hierarchy mode shows no dim chain');

// ---- the ACTUAL Structure tab dispatch (renderPortfolio -> #structTables) ----
T.setG('dims',['division','product','model']);
const sp1=T.renderP();
ok(!sp1.startsWith('ERR:'),'structure tab: renderPortfolio no error ('+(sp1.startsWith('ERR:')?sp1:'ok')+')');
ok(sp1.includes('pfgrp-head')&&sp1.includes('StackA')&&sp1.includes('ModelX'),'structure tab: custom grouping renders the nested grouped tree');
ok(sp1.includes('obj one'),'structure tab: objective leaves present under groups');
ok(!sp1.includes('data-addnew='),'structure grouped: no flat top toolbar when grouped');
ok((sp1.match(/data-gnew=/g)||[]).length>=3,'structure grouped: per-group add buttons present ('+((sp1.match(/data-gnew=/g)||[]).length)+')');
ok(/data-tedit="objective:/.test(sp1),'structure grouped: per-objective edit button present (treeCtx fixed)');
const gbtns=[...w.document.querySelectorAll('#structTables [data-gnew]')].map(b=>JSON.parse(b.getAttribute('data-gnew')));
ok(gbtns.some(d=>d.e==='initiative'&&d.p.divisionId&&!d.p.productId),'structure grouped: division group offers + init prefilled with divisionId only');
ok(gbtns.some(d=>d.e==='model'&&d.p.productId),'structure grouped: product group offers + model prefilled with productId');
ok(gbtns.some(d=>d.e==='objective'&&d.p.modelId==='M1'&&d.p.divisionId==='D1'),'structure grouped: model-level + obj prefilled with divisionId+modelId');
const modelObjBtn=[...w.document.querySelectorAll('#structTables [data-gnew]')].find(b=>{const d=JSON.parse(b.getAttribute('data-gnew'));return d.e==='objective'&&d.p.modelId==='M1';});
if(modelObjBtn) modelObjBtn.click();
const mb=w.document.getElementById('pfModalBody').innerHTML;
ok(/data-f="quarter"/.test(mb)&&/data-f="statement"/.test(mb),'structure grouped: + obj opens the objective editor');
ok(/value="M1"[^>]*selected/.test(mb),'structure grouped: + obj on a model group preselects that model (M1)');
// flat case (no dims): minimal top toolbar returns, no per-group buttons
T.setG('dims',[]);
const spFlat=T.renderP();
ok(spFlat.includes('data-addnew="objective"')&&spFlat.includes('data-addnew="initiative"'),'structure flat (no dims): top toolbar + New objective/initiative');
ok(!spFlat.includes('data-gnew='),'structure flat: no per-group add buttons');

T.setG('hierarchy',[]);
const sp2=T.renderP();
ok(sp2.includes('struct-section')&&sp2.includes('Divisions')&&sp2.includes('Initiatives'),'structure tab: Hierarchy renders the full structure tables');
ok(!sp2.includes('pfgrp-head'),'structure tab: Hierarchy is NOT the grouped tree');

console.log(f?('\n'+f+' / '+n+' FAILED'):('PASS - '+n+' planning-app assertions green'));
process.exit(f?1:0);
