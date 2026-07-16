const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0,select(){}};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},elements(){return{length:0};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, s=d.createElement('script');
  s.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    portfolio={divisions:[{id:'D'}],initiatives:[],milestones:[],products:[],models:[],composition:[],
      objectives:[{id:'O',statement:'MEA performance',divisionId:'D',plannedStart:0,plannedEnd:100}]};
    divisionId='D'; selectedObj='O'; exec=blankExec(); exec.stageGateSets=[{id:'S',objectiveId:'O',name:'A',chained:true}];

    // --- intention: field on the add modal ---
    subOpenAdd("stageGate"); var mb=document.getElementById("modalBody");
    ok(/data-f="intention"/.test(mb.innerHTML) && /<textarea/.test(mb.innerHTML), 'add-gate modal has an intention field');
    mb.querySelector('.ed [data-f="name"]').value="Design freeze";
    mb.querySelector('.ed [data-f="intention"]').value="Sign off the MEA stack-up as build-ready.";
    saveSub();
    var g=exec.stageGates.find(x=>x.name==="Design freeze");
    ok(!!g && g.intention==="Sign off the MEA stack-up as build-ready.", 'intention saves with the new gate');

    // --- intention: edit modal pre-fills it ---
    subOpenEdit("stageGate", g.id); mb=document.getElementById("modalBody");
    ok(mb.querySelector('.ed [data-f="intention"]').value==="Sign off the MEA stack-up as build-ready.", 'edit-gate modal pre-fills the intention');
    subCancel();

    // --- intention: shown in the table/card ---
    renderGates(); var sg=document.getElementById("subSG").innerHTML;
    ok(/g-intent/.test(sg) && /build-ready/.test(sg), 'gate card displays the intention line');

    // --- grouped predecessor dropdown ---
    portfolio.objectives=[{id:'O',statement:'MEA performance',divisionId:'D',plannedStart:0,plannedEnd:100},{id:'O2',statement:'Durability',divisionId:'D',plannedStart:0,plannedEnd:100}];
    exec.stageGateSets=[{id:'S',objectiveId:'O',name:'A',chained:true},{id:'S2',objectiveId:'O2',name:'B',chained:true}];
    exec.stageGates=[
      {id:'g1',objectiveId:'O',setId:'S',name:'Membrane down-select',plannedDate:10},
      {id:'g2',objectiveId:'O',setId:'S',name:'Catalyst verified',plannedDate:20},
      {id:'h1',objectiveId:'O2',setId:'S2',name:'Durability freeze',plannedDate:30} ];
    var opts=gateOptsByObjective(exec.stageGates);
    ok(/optgroup label="MEA performance"/.test(opts) && /optgroup label="Durability"/.test(opts), 'predecessor options grouped into <optgroup> by objective');
    ok(opts.indexOf('MEA performance') < opts.indexOf('Durability'), 'the current objective is listed first');
    ok(/Membrane down-select/.test(opts) && /Durability freeze/.test(opts), 'each gate appears under its objective, with its label');
    ok(!/optgroup label=""/.test(opts), 'no empty objective groups');
   }catch(e){ out.push('FAIL threw: '+e.message+'  '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', out.join('\\n'));
  })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ const o=(d.body.getAttribute('data-out')||'').split('\n'); const fl=o.filter(x=>x.startsWith('FAIL'));
    o.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    console.log(fl.length?`\n${fl.length}/${o.length} FAILED`:`\nPASS — ${o.length} intention + grouped-dropdown assertions green`); process.exit(fl.length?1:0);
  },400);
},500);
