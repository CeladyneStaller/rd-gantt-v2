const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0,select(){}};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},elements(){return{length:0};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, s=d.createElement('script');
  s.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); } var D=document;
   try{
    portfolio={divisions:[{id:'D'}],objectives:[{id:'O',statement:'Obj',divisionId:'D',plannedStart:0,plannedEnd:100}],initiatives:[],milestones:[],products:[],models:[]};
    divisionId='D'; selectedObj='O'; exec=blankExec();
    exec.stageGateSets=[{id:'S1',objectiveId:'O',name:'MEA',order:0,chained:true},{id:'S2',objectiveId:'O',name:'Coatings',order:1,chained:false}];
    exec.stageGates=[
      {id:'g1',objectiveId:'O',setId:'S1',name:'Membrane down-select',plannedDate:20,actualDate:20},
      {id:'g2',objectiveId:'O',setId:'S1',name:'Durability freeze',plannedDate:50,intention:'Prove 500h durability.'},
      {id:'c1',objectiveId:'O',setId:'S2',name:'Coating screen',plannedDate:40} ];
    exec.kpis=[{id:'k1',objectiveId:'O',hostType:'stageGate',hostId:'g1',name:'Power',direction:'up',target:1,unit:'W/cm2'}];
    exec.kpiUpdates=[{kpiId:'k1',value:1.1,timestamp:1}];

    renderGates(); var sg=D.getElementById('subSG').innerHTML;
    ok(/class="grow/.test(sg), 'gates render as .grow rows');
    ok(/chain-ic on/.test(sg) && /chain-ic off/.test(sg), 'chained workstream shows linked symbol; independent shows broken');
    ok(/statepill/.test(sg), 'status pill rendered per gate');
    ok(/r-fill/.test(sg) && /Readiness/.test(sg), 'readiness meter rendered');
    ok(/g-sched/.test(sg) && /planned/.test(sg), 'schedule cell shows planned + completion/forecast');
    ok(/g-intent/.test(sg) && /500h durability/.test(sg), 'intention line renders in the new row');
    ok(/data-wsedit="S1"/.test(sg), 'workstream header has an edit trigger');
    ok(/data-addset/.test(sg) && /workstream/.test(sg), 'panel has a "+ workstream" control');
    ok(/ws-eyebrow/.test(sg) && /Workstream A/.test(sg) && /Workstream B/.test(sg), 'workstream headers show "Workstream A / B" eyebrows');
    ok(/gs-plan/.test(sg) && /gs-done/.test(sg) && /gs-delta/.test(sg), 'schedule cell is a 2x2 (planned/est over complete/delta)');
    ok(!/data-del="stageGate:g1"/.test(sg), 'gate row no longer carries a hover delete button');
    ok(/data-edit="stageGate:g1"/.test(sg), 'gate stays editable via its chip / name');
    var gmE=gateModalBody({id:'g1',name:'X',objectiveId:'O',setId:'S1'});
    ok(/data-gatedel="g1"/.test(gmE) && /Delete gate/.test(gmE), 'edit-gate modal has a "Delete gate" button');
    ok(!/data-gatedel/.test(gateModalBody({})), 'add-gate modal has no delete button');
    ok(/data-f="setId"/.test(gmE) && /value="S2"/.test(gmE), 'edit-gate modal exposes the workstream picker when 2+ workstreams exist');
    ok(!/data-f="setId"/.test(gateModalBody({})), 'add-gate modal has no workstream picker (assignment is via the + gate button)');
    ok(!/data-setmove/.test(sg) && !/class="g-acts"/.test(sg), 'gate rows dropped the inline move column (moved into the edit modal)');

    // collapse
    ok(/data-gtoggle="g1"/.test(sg), 'gate with targets shows a Targets toggle');
    ok(!/class="mtbl"/.test(sg), 'targets are collapsed by default (no table shown)');
    expandedGates.add('g1'); renderGates(); sg=D.getElementById('subSG').innerHTML;
    ok(/tgt-panel/.test(sg) && /class="mtbl"/.test(sg), 'expanding a gate reveals its aligned target table');
    var _tbl=D.querySelector('#subSG .mtbl');
    ok(!!_tbl && !_tbl.closest('.grow') && !!_tbl.closest('.gate-block'), 'expanded target table is a full-width block (outside .grow), so it spans the row');
    expandedGates.delete('g1'); renderGates(); sg=D.getElementById('subSG').innerHTML;
    ok(!/tgt-panel/.test(sg), 'collapsing hides the table again');

    // workstream modal - ADD
    openWorkstreamModal(null); var mb=D.getElementById('modalBody');
    ok(!!mb.querySelector('#wsName') && !!mb.querySelector('.ws-choice'), 'New-workstream modal has a name field + chaining selector');
    ok(!!mb.querySelector('[data-wschoice="chained"]') && !!mb.querySelector('[data-wschoice="independent"]'), 'both chained + independent options present');
    ok(mb.querySelector('[data-wschoice="chained"]').classList.contains('sel'), 'new workstream defaults to Chained');
    mb.querySelector('#wsName').value='Balance of plant'; mb.querySelector('[data-ws-save]').click();
    var ns=objSetsOrdered().find(x=>x.name==='Balance of plant');
    ok(!!ns && ns.chained===true, 'saving creates a new chained workstream');

    // workstream modal - EDIT (prefill + switch chaining)
    openWorkstreamModal('S2'); mb=D.getElementById('modalBody');
    ok(mb.querySelector('#wsName').value==='Coatings', 'edit modal pre-fills the name');
    ok(mb.querySelector('[data-wschoice="independent"]').classList.contains('sel'), 'edit modal pre-selects the current mode (independent)');
    mb.querySelector('[data-wschoice="chained"]').click(); mb.querySelector('[data-ws-save]').click();
    ok((exec.stageGateSets||[]).find(x=>x.id==='S2').chained===true, 'editing can switch a workstream to chained');

    // workstream modal - DELETE (2-click, reassigns its gate)
    openWorkstreamModal('S2'); mb=D.getElementById('modalBody');
    var dl=mb.querySelector('[data-wsdel]'); dl.click();
    ok(/Confirm/i.test(dl.textContent), 'delete arms on first click');
    dl.click();
    ok(!(exec.stageGateSets||[]).some(x=>x.id==='S2'), 'second click deletes the workstream');
    ok(exec.stageGates.find(g=>g.id==='c1').setId!=='S2', 'its gate was reassigned, not orphaned');
   }catch(e){ out.push('FAIL threw: '+e.message+'  '+((e.stack||'').split('\\n')[1]||'')); }
   D.body.setAttribute('data-out', out.join('\\n'));
  })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ const o=(d.body.getAttribute('data-out')||'').split('\n'); const fl=o.filter(x=>x.startsWith('FAIL'));
    o.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    console.log(fl.length?`\n${fl.length}/${o.length} FAILED`:`\nPASS — ${o.length} gate-row + workstream-modal assertions green`); process.exit(fl.length?1:0);
  },500);
},500);
