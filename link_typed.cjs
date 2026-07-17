// Exec-local links (stage-gate KPI -> KR KPI) used to fall through to a groupId link, which has nowhere to
// record a relationship — core's linkOf() hardcodes 'contribute' for group links — so the relationship
// selector was suppressed. Now every link is typed via linkParent/linkType.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?division=D1&token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);
setTimeout(()=>{ const w=dom.window;
  const t=(fn,m)=>{ try{ ok(fn(),m); }catch(e){ ok(false,m+' [threw: '+e.message+']'); } };
  const boot=()=>w.eval(`exec={objectiveState:[],keyResults:[{id:'KR1',objectiveId:'O1',statement:'kr'}],
      kpis:[{id:'K-kr',objectiveId:'O1',hostType:'keyResult',hostId:'KR1',name:'KR metric',targetType:'demonstration',direction:'up',target:5,isDefiner:true}],
      kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[{id:'G1',objectiveId:'O1',name:'Gate'}]};
    portfolio={divisions:[{id:'D1',name:'D'}],objectives:[{id:'O1',divisionId:'D1',statement:'o'}],initiatives:[],kpis:[],milestones:[]};
    selectedObj='O1'; divisionId='D1'; refreshTargetIds();
    renderAll=function(){}; setMsg=function(){}; persistExec=function(){}; restoreReturn=function(){return false;};`);
  boot();

  // ---- the selector is no longer suppressed for an exec-local definer ----
  t(()=>w.eval("renderLinkEditor('stageGate','G1').indexOf('data-linkrel')>=0"), 'the gate link editor renders a relationship selector');
  t(()=>{ const h=w.eval("renderLinkEditor('stageGate','G1')");
          return h.indexOf('<option value="contribute"')>=0 && h.indexOf('<option value="direct"')>=0 && h.indexOf('<option value="specification"')>=0; },
    '...offering contribute, direct and specification');
  t(()=>{ const h=w.eval("renderLinkEditor('stageGate','G1')");
          const m=h.match(/data-relwrap[^>]*display:([a-z]+)/); return !!m && m[1]!=='none'; },
    '...and it is VISIBLE (it used to render display:none for a KR KPI definer)');

  // ---- a gate->KR link is now typed, and honours the chosen relationship ----
  t(()=>{ boot(); w.eval("makeLinkMember('stageGate','G1','K-kr','direct');");
          return w.eval("var m=exec.kpis.find(k=>k.hostType==='stageGate'&&k.linkParent==='K-kr'); !!m && m.linkType==='direct'"); },
    'linking a gate KPI to a KR KPI as DIRECT records linkType:direct');
  t(()=>{ boot(); w.eval("makeLinkMember('stageGate','G1','K-kr','specification');");
          return w.eval("var m=exec.kpis.find(k=>k.linkParent==='K-kr'); !!m && m.linkType==='specification'"); },
    '...as SPECIFICATION records linkType:specification');
  t(()=>{ boot(); w.eval("makeLinkMember('stageGate','G1','K-kr','contribute');");
          return w.eval("var m=exec.kpis.find(k=>k.linkParent==='K-kr'); !!m && m.linkType==='contribute'"); },
    '...as CONTRIBUTE records linkType:contribute');
  t(()=>{ boot(); w.eval("makeLinkMember('stageGate','G1','K-kr',null);");
          return w.eval("var m=exec.kpis.find(k=>k.linkParent==='K-kr'); !!m && m.linkType==='contribute'"); },
    'no explicit type falls back to defaultLinkType (contribute for keyResult>stageGate)');

  // ---- it no longer creates a group link ----
  t(()=>{ boot(); w.eval("makeLinkMember('stageGate','G1','K-kr','direct');");
          return w.eval("var m=exec.kpis.find(k=>k.linkParent==='K-kr'); !!m && m.groupId===undefined"); },
    'the new member carries NO groupId (the group fall-through is gone)');
  t(()=>w.eval("exec.kpis.find(k=>k.id==='K-kr').groupId===undefined"),
    '...and the definer is no longer stamped with one');

  // ---- core reads the type back ----
  t(()=>{ boot(); w.eval("makeLinkMember('stageGate','G1','K-kr','direct');");
          return w.eval("var m=exec.kpis.find(k=>k.linkParent==='K-kr'); RD.linkOf ? RD.linkOf(m, allKpisPool()).type==='direct' : RD.rootOf(m, allKpisPool()).id==='K-kr'"); },
    'core resolves the link back to the KR KPI');
  t(()=>w.eval("var m=exec.kpis.find(k=>k.linkParent==='K-kr'); RD.definerOf(m, allKpisPool()).id==='K-kr'"),
    'the gate KPI still inherits its definition from the KR KPI');

  // ---- cycles are now guarded on this path too (the group path never checked) ----
  t(()=>{ boot(); w.eval("makeLinkMember('stageGate','G1','K-kr','direct');");
          const before=w.eval("exec.kpis.length");
          w.eval("var m=exec.kpis.find(k=>k.linkParent==='K-kr'); makeLinkMember('keyResult','KR1', m.id, 'direct');");
          return w.eval("exec.kpis.length")>=before; },
    'linking back the other way does not throw (cycle guard runs on every link now)');

  // ---- legacy groupId data still resolves ----
  t(()=>{ boot(); w.eval(`exec.kpis[0].groupId='GRP1';
            exec.kpis.push({id:'K-old',objectiveId:'O1',hostType:'stageGate',hostId:'G1',groupId:'GRP1',isDefiner:false,name:null,target:null});`);
          return w.eval("RD.definerOf(exec.kpis.find(k=>k.id==='K-old'), allKpisPool()).id==='K-kr'"); },
    'an existing groupId link keeps resolving to its definer (no migration needed)');

  // ---- a LINKED gate KPI must open the OVERRIDE editor, not the blank gate-target editor ----
  // A member has name/target/direction = null (it inherits them), so the full editor opens blank. This is the
  // same guard the keyResult branch already used.
  t(()=>{ boot(); w.eval("makeLinkMember('stageGate','G1','K-kr','contribute');");
          return w.eval("isMemberKpi(exec.kpis.find(k=>k.linkParent==='K-kr'))===true"); },
    'a linked gate KPI is recognised as a member');
  t(()=>w.eval("var m=exec.kpis.find(k=>k.linkParent==='K-kr'); m.name===null && m.target===null"),
    '...and it holds no name/target of its own, which is why the full editor rendered blank');
  t(()=>{ const m=w.eval("exec.kpis.find(k=>k.linkParent==='K-kr').id");
          const h=w.eval(`editingSub={type:'kpi',id:'${m}'}; renderKpiOverrideEditor(exec.kpis.find(k=>k.id==='${m}'))`);
          return h.indexOf('data-f="target"')>=0 || h.indexOf('data-f="targetLo"')>=0; },
    'the override editor exposes a target field to set');

  // ---- core: a contribute member's OWN target wins; a direct member always inherits ----
  t(()=>{ boot(); w.eval("makeLinkMember('stageGate','G1','K-kr','contribute'); var m=exec.kpis.find(k=>k.linkParent==='K-kr'); m.target=9;");
          return w.eval("var m=exec.kpis.find(k=>k.linkParent==='K-kr'); RD.effTarget(m, allKpisPool())===9"); },
    'CONTRIBUTE: a gate target of 9 overrides the KR target of 5');
  t(()=>w.eval("RD.effTarget(exec.kpis.find(k=>k.id==='K-kr'), allKpisPool())===5"),
    '...and the KR keeps its own target of 5 (they genuinely differ)');
  t(()=>{ boot(); w.eval("makeLinkMember('stageGate','G1','K-kr','direct'); var m=exec.kpis.find(k=>k.linkParent==='K-kr'); m.target=9;");
          return w.eval("var m=exec.kpis.find(k=>k.linkParent==='K-kr'); RD.effTarget(m, allKpisPool())===5"); },
    'DIRECT: the gate inherits the KR target of 5 even if a 9 is stamped on it');
  t(()=>{ boot(); w.eval("makeLinkMember('stageGate','G1','K-kr','contribute');");
          return w.eval("var m=exec.kpis.find(k=>k.linkParent==='K-kr'); RD.effTarget(m, allKpisPool())===5"); },
    'CONTRIBUTE with no override still inherits the KR target');

  // ---- blank = clear: the escape hatch from a manual reading that outranks the link ----
  // Drive the REAL inline cell (openPostCell -> its own commit()), NOT postRead() directly. The first version
  // of these assertions called postRead() with a fake host and passed while the actual cell still treated a
  // blank as a cancel — the cell never calls postRead at all.
  const bootLinked=()=>w.eval(`exec={objectiveState:[],keyResults:[{id:'KR1',objectiveId:'O1',statement:'kr'}],
      kpis:[{id:'K-kr',objectiveId:'O1',hostType:'keyResult',hostId:'KR1',name:'KR',targetType:'demonstration',direction:'up',target:5,isDefiner:true},
            {id:'K-gate',objectiveId:'O1',hostType:'stageGate',hostId:'G1',linkParent:'K-kr',linkType:'direct',linkPriority:1,name:null,target:null}],
      kpiUpdates:[{id:'g1',kpiId:'K-gate',value:7,timestamp:1}],tasks:[],stageGateEdges:[],stageGateSets:[],
      stageGates:[{id:'G1',objectiveId:'O1',name:'Gate'}]};
    portfolio={divisions:[{id:'D1',name:'D'}],objectives:[{id:'O1',divisionId:'D1',statement:'o'}],initiatives:[],kpis:[],milestones:[]};
    selectedObj='O1'; divisionId='D1'; refreshTargetIds();
    renderAll=function(){}; setMsg=function(){}; persistExec=function(){}; restoreReturn=function(){return false;};`);
  // open the real cell, type into the real input, press Enter
  const cell=(typed)=>w.eval(`(function(){
      var td=document.createElement('td'); td.dataset.postcell='K-kr'; td.innerHTML='<span>x</span>';
      document.body.appendChild(td);
      openPostCell(td);
      window.__cell=td;                                  // the LIVE cell; earlier tds linger (renderAll is stubbed)
      var inp=td.querySelector('input'); if(!inp) return 'NO INPUT';
      inp.value=${JSON.stringify(typed)};
      inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
      return 'ok';
    })()`);
  const val=()=>w.eval("RD.effValue(exec.kpis.find(k=>k.id==='K-kr'), allKpisPool(), emForCore())");
  const ownN=()=>w.eval("(exec.kpiUpdates||[]).filter(u=>u.kpiId==='K-kr').length");

  t(()=>{ bootLinked(); return val()===7; }, 'the linked KR reads 7 from its gate');
  t(()=>{ bootLinked(); return cell('99')==='ok' && val()===99; }, 'typing 99 into the real cell overrides the link');

  // ONE own reading: clears straight away (retyping it is a trivial undo, so no arming)
  t(()=>cell('')==='ok' && val()===7, 'clearing the cell restores the link read');
  t(()=>ownN()===0, '...the own reading is gone');
  t(()=>w.eval("(exec.kpiUpdates||[]).filter(u=>u.kpiId==='K-gate').length===1"), '...and the gate reading is untouched');

  // MANY own readings: the whole history goes, but only after arming
  t(()=>{ bootLinked(); cell('5'); cell('6'); cell('7'); return ownN()===3; }, 'three manual readings build up a history');
  t(()=>{ cell(''); return ownN()===3; }, 'a first blank does NOT wipe the history — it arms');
  t(()=>val()===7||val()===7, 'sanity: value unchanged while armed');
  t(()=>{ // the armed cell is still open; press Enter again on the same input
          return w.eval(`(function(){ var inp=window.__cell && window.__cell.querySelector('input');
            if(!inp) return 'gone'; inp.value='';
            inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); return 'ok'; })()`)==='ok'
          && ownN()===0; },
    'a second blank Enter clears ALL of them');
  t(()=>val()===7, '...and the KR reads the link again');
  t(()=>{ bootLinked(); cell('5'); cell('6');
          w.eval(`(function(){ var td=document.createElement('td'); td.dataset.postcell='K-kr'; td.innerHTML='<span>x</span>';
            document.body.appendChild(td); openPostCell(td); var inp=td.querySelector('input'); inp.value='';
            inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));   // arms
            inp.dispatchEvent(new FocusEvent('blur'));                                     // then click away
          })()`);
          return ownN()===2; },
    'clicking away from an ARMED clear cancels it — the history survives');
  t(()=>{ bootLinked(); return cell('')==='ok' && ownN()===0 && val()===7; },
    'blanking a KPI with no own reading is a harmless no-op');
  t(()=>{ bootLinked(); return w.eval(`(function(){ var td=document.createElement('td'); td.dataset.postcell='K-kr';
            td.innerHTML='<span>x</span>'; document.body.appendChild(td); openPostCell(td);
            return td.querySelector('input').placeholder; })()`)==='value'; },
    'with no own reading the placeholder stays "value"');
  t(()=>{ bootLinked(); cell('99');
          return w.eval(`(function(){ var td=document.createElement('td'); td.dataset.postcell='K-kr';
            td.innerHTML='<span>x</span>'; document.body.appendChild(td); openPostCell(td);
            return td.querySelector('input').placeholder; })()`)==='blank = clear'; },
    '...and reads "blank = clear" once there is one to clear');
  t(()=>{ bootLinked(); cell('5'); cell('6'); w.eval("var h=document.createElement('div'); h.innerHTML='<input data-read=\"K-kr\" value=\"\">'; postRead(h,'K-kr');");
          return ownN()===0 && val()===7; },
    'postRead() clears through the same helper, so the two paths cannot drift');

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} typed-link assertions green`);
  process.exit(fl.length?1:0);
},500);
