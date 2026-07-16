// Verifies the KR "+ KPI" now uses the polished stage-gate-style modal (openKpiTgtModal), renders the
// segmented target-type + direction controls, creates a keyResult-hosted definer KPI, and that the
// stage-gate path is unchanged (back-compat).
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
let html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
html=html.replace("\ninit();\n\n})();",
 "\ninit(); window.__M={ openKpiTgtModal:openKpiTgtModal, openTgtModal:openTgtModal, saveTgtModal:saveTgtModal, execKpis:function(){return exec.kpis;}, setState:function(st){ if('selectedObj' in st) selectedObj=st.selectedObj; if(st.exec) exec=st.exec; if(st.portfolio) portfolio=st.portfolio; if('divisionId' in st) divisionId=st.divisionId; } };\n\n})();");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const vc=new VirtualConsole(); const errs=[]; vc.on("jsdomError",e=>errs.push((e&&e.message||String(e)).split("\n")[0]));
const dom=new JSDOM(html,{ runScripts:"dangerously", url:"https://localhost/?division=D1", pretendToBeVisual:true, virtualConsole:vc,
  beforeParse(w){ w.fetch=()=>Promise.resolve({ok:false,status:404,json:()=>Promise.resolve(null)}); if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; } });
const w=dom.window, doc=w.document;

(async()=>{
  await sleep(500);
  let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};
  const M=w.__M; ok(!!M,"hook exposed"); if(!M){process.exit(1);}
  M.setState({ selectedObj:"O1", divisionId:"D1",
    portfolio:{ divisions:[{id:"D1"}], objectives:[{id:"O1",divisionId:"D1",statement:"Obj",plannedStart:2192,plannedEnd:2281}], models:[], products:[], milestones:[], kpis:[], initiatives:[], composition:[] },
    exec:{ kpis:[], keyResults:[{id:"KR1",objectiveId:"O1",statement:"Efficiency KR",trackingType:"percentage",progress:0}], stageGates:[{id:"SG1",name:"Gate 1"}], tasks:[], kpiUpdates:[], objectiveState:[], stageGateEdges:[], chainGatesByDate:{}, risks:[], etbTrees:{} } });

  // 1) KR +KPI opens the polished modal with the same structure as the stage-gate one
  M.openKpiTgtModal("keyResult","KR1",null);
  ok(doc.getElementById("kpiTgtTitle").textContent==="Add KPI", "1: KR +KPI title is 'Add KPI'");
  ok(doc.getElementById("kpiTgtOverlay").classList.contains("open"), "1: modal overlay opened");
  let body=doc.getElementById("kpiTgtBody");
  ok([...body.querySelectorAll("[data-tgttype]")].map(b=>b.dataset.tgttype).join(",")==="demonstration,statistical,binary", "1: segmented target-type control (Demonstration/Statistical/Binary)");
  ok([...body.querySelectorAll("[data-tgtdir]")].map(b=>b.dataset.tgtdir).join(",")==="increase,decrease", "1: segmented direction control (Increase/Decrease)");
  ok(body.querySelector('[data-tf="name"]')&&body.querySelector('[data-tf="target"]')&&body.querySelector('[data-tf="unit"]'), "1: name/target/unit fields present");
  ok(!body.querySelector('[data-f="direction"]'), "1: old plain up/down/range dropdown is gone");

  // 2) statistical toggle reveals read-count + statistic (shared segmented behavior)
  body.querySelector('[data-tgttype="statistical"]').click();
  body=doc.getElementById("kpiTgtBody");
  const rcField=body.querySelector('[data-tf="readCount"]'), stField=body.querySelector('[data-tf="statistic"]');
  ok(rcField && stField, "2: statistical reveals Read count + Statistic fields");
  body.querySelector('[data-tgttype="demonstration"]').click();   // back to demonstration for save

  // 3) saving creates a keyResult-hosted definer KPI
  body=doc.getElementById("kpiTgtBody");
  body.querySelector('[data-tf="name"]').value="Efficiency"; body.querySelector('[data-tf="target"]').value="80"; body.querySelector('[data-tf="unit"]').value="%";
  M.saveTgtModal();
  const krk=M.execKpis().find(k=>k.hostType==="keyResult"&&k.hostId==="KR1");
  ok(krk&&krk.name==="Efficiency"&&krk.target===80&&krk.unit==="%"&&krk.isDefiner===true&&krk.targetType==="demonstration"&&krk.direction==="up", "3: KR +KPI creates a keyResult-hosted definer KPI ("+JSON.stringify(krk&&{h:krk.hostType,n:krk.name,t:krk.target,u:krk.unit,tt:krk.targetType,d:krk.direction})+")");

  // 4) stage-gate +KPI is unchanged (back-compat) — same modal, stageGate host
  M.openTgtModal("SG1", null);
  ok(doc.getElementById("kpiTgtTitle").textContent==="Add gate target", "4: stage-gate title still 'Add gate target'");
  let bg=doc.getElementById("kpiTgtBody"); bg.querySelector('[data-tf="name"]').value="Durability"; bg.querySelector('[data-tf="target"]').value="1000";
  M.saveTgtModal();
  ok(M.execKpis().some(k=>k.hostType==="stageGate"&&k.hostId==="SG1"&&k.name==="Durability"), "4: stage-gate +KPI still creates a stageGate-hosted KPI");

  // 5) editing a KR-hosted definer KPI routes to the same modal (add/edit parity)
  M.openKpiTgtModal("keyResult","KR1", krk.id);
  ok(doc.getElementById("kpiTgtTitle").textContent==="Edit KPI", "5: editing a KR KPI uses the same modal ('Edit KPI')");
  ok(doc.getElementById("kpiTgtBody").querySelector('[data-tf="name"]').value==="Efficiency", "5: edit modal pre-fills the existing KR KPI");

  ok(errs.length===0, "no jsdom errors ("+JSON.stringify(errs.slice(0,2))+")");
  console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' KR-KPI-modal assertions green'));
  process.exit(f?1:0);
})();
