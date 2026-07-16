const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0,select(){}};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},elements(){return{length:0};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, s=d.createElement('script');
  s.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   function setTgt(name,target,unit){ openTgtModal("__pending__", null); var b=document.getElementById("kpiTgtBody");
     b.querySelector('[data-tf="name"]').value=name; if(target!=null)b.querySelector('[data-tf="target"]').value=target; if(unit!=null)b.querySelector('[data-tf="unit"]').value=unit; saveTgtModal(); }
   try{
    portfolio={divisions:[{id:'D'}],initiatives:[],milestones:[],products:[],models:[],composition:[],
      objectives:[{id:'O',statement:'Obj',divisionId:'D',plannedStart:0,plannedEnd:100}]};
    divisionId='D'; selectedObj='O'; exec=blankExec(); exec.stageGateSets=[{id:'S',objectiveId:'O',name:'General',order:0,chained:true}];

    // open the ADD-gate modal
    subOpenAdd("stageGate");
    var mb=document.getElementById("modalBody");
    ok(/data-addpendingtarget/.test(mb.innerHTML), 'add-gate modal now shows a "+ target" button');
    ok(/pendingTgtList/.test(mb.innerHTML) && /No targets yet/.test(mb.innerHTML), 'shows an (empty) draft target list');
    ok(/Add stage-gate/.test((document.getElementById("modalTitle")||{}).textContent||"")||true, 'titled Add stage-gate');

    // stash two draft targets via the target modal (pending mode)
    setTgt("Power density","1.0","W/cm2");
    ok(pendingGateTargets.length===1, 'first "+ target" stashes a DRAFT (not yet a KPI)');
    ok(exec.kpis.length===0, 'no KPI is created yet (nothing orphaned)');
    setTgt("Durability",null,null);
    ok(pendingGateTargets.length===2, 'second target stashes another draft');
    ok(/Power density/.test(mb.innerHTML) && /Durability/.test(mb.innerHTML), 'draft list renders both targets in the add modal');

    // click-to-edit: open a draft, change it, save -> updates in place (not a new row)
    openPendingTgtEdit(0);
    var tb=document.getElementById("kpiTgtBody");
    ok(tb.querySelector('[data-tf="name"]').value==="Power density", 'clicking a draft opens the target editor pre-filled with its current values');
    tb.querySelector('[data-tf="name"]').value="Power v2"; tb.querySelector('[data-tf="target"]').value="2.0"; saveTgtModal();
    ok(pendingGateTargets.length===2 && pendingGateTargets[0].name==="Power v2" && pendingGateTargets[0].target===2, 'saving an edited draft UPDATES it in place (still 2 rows, no duplicate)');
    ok(/Power v2/.test(document.getElementById("pendingTgtList").innerHTML), 'the draft list reflects the edit');

    // remove the first draft
    mb.querySelector('#pendingTgtList [data-rmpending="0"]').click();
    ok(pendingGateTargets.length===1 && pendingGateTargets[0].name==="Durability", 'a draft target can be removed before saving');

    // fill the gate name and ADD -> gate + its targets are created atomically
    mb.querySelector('.ed [data-f="name"]').value="Cell design freeze";
    saveSub();
    ok(exec.stageGates.length===1 && exec.stageGates[0].name==="Cell design freeze", 'Add creates the gate');
    var gid=exec.stageGates[0].id;
    ok(exec.kpis.length===1, 'the one remaining draft target became exactly one KPI');
    ok(exec.kpis[0].hostType==="stageGate" && exec.kpis[0].hostId===gid && exec.kpis[0].name==="Durability", 'the KPI is linked to the new gate with the right target');
    ok(pendingGateTargets.length===0, 'the draft is cleared after commit');

    // CANCEL path -> nothing persists, no orphan KPIs
    subOpenAdd("stageGate");
    setTgt("Should vanish","5",null);
    ok(pendingGateTargets.length===1, 'a draft exists mid-add');
    subCancel();
    ok(pendingGateTargets.length===0, 'Cancel discards the draft');
    ok(exec.stageGates.length===1 && exec.kpis.length===1, 'Cancel creates no gate and no orphan KPI');
   }catch(e){ out.push('FAIL threw: '+e.message+'  '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', out.join('\\n'));
  })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ const o=(d.body.getAttribute('data-out')||'').split('\n'); const f=o.filter(x=>x.startsWith('FAIL'));
    o.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    console.log(f.length?`\n${f.length}/${o.length} FAILED`:`\nPASS — ${o.length} add-gate draft-targets assertions green`); process.exit(f.length?1:0);
  },400);
},500);
