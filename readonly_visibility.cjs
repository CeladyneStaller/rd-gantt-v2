// Readonly hid [data-edit] and [data-editsubkr] wholesale. But those attributes are NOT only on buttons — they
// are also the click-to-edit affordance ON the content: g-name, g-chip, icard-title, icard-num, skr-name. So a
// readonly load blanked the KR/SG names, KPIs and targets: 2 controls suppressed by deleting 7 pieces of content.
//
// jsdom applies no stylesheets to computed style, so "is it visible" is not directly testable. But jsdom DOES
// parse the CSS, and elements can be matched against the REAL selector with .matches() — the browser's own
// matching logic against the real rendered DOM. That is much stronger than regexing the stylesheet text.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const HTML=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

function boot(url){
  return new Promise(res=>{
    const dom=new JSDOM(HTML,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url,pretendToBeVisual:true,
      beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
    setTimeout(()=>res(dom.window),450);
  });
}

// pull the readonly display:none rule straight out of the live stylesheet
function hideSelector(w){
  // return the data-edit rule (the historical "HIDE" whose selectorText several assertions inspect textually)
  for(const sheet of w.document.styleSheets){
    let rules; try{ rules=sheet.cssRules; }catch(e){ continue; }
    for(const r of rules){
      if(r.selectorText && r.style && r.style.display==="none" && r.selectorText.indexOf("body.readonly")>=0
         && r.selectorText.indexOf("data-edit")>=0) return r.selectorText;
    }
  }
  return null;
}
// ALL readonly display:none rules — an element counts as hidden if it matches ANY of them.
function allHideSelectors(w){
  const out=[];
  for(const sheet of w.document.styleSheets){
    let rules; try{ rules=sheet.cssRules; }catch(e){ continue; }
    for(const r of rules){
      if(r.selectorText && r.style && r.style.display==="none" && r.selectorText.indexOf("body.readonly")>=0)
        out.push(r.selectorText);
    }
  }
  return out;
}
function isHidden(el, hideList){ return hideList.some(sel=>{ try{ return el.matches(sel); }catch(e){ return false; } }); }
function inertSelector(w){
  for(const sheet of w.document.styleSheets){
    let rules; try{ rules=sheet.cssRules; }catch(e){ continue; }
    for(const r of rules){
      if(r.selectorText && r.style && r.style.pointerEvents==="none" && r.selectorText.indexOf("body.readonly")>=0)
        return r.selectorText;
    }
  }
  return null;
}

(async()=>{
  const w=await boot("https://x.test/?division=D1&readonly&token=t");
  ok(w.document.body.classList.contains("readonly"), "?readonly applies the class");

  const HIDE=hideSelector(w);
  const ALLHIDE=allHideSelectors(w);
  ok(!!HIDE, "the readonly display:none rule is found in the stylesheet");
  const INERT=inertSelector(w);
  ok(!!INERT, "an inert (pointer-events:none) rule exists for the content spans");

  // build every element shape that carries these attributes and ask the REAL selector about each
  const make=(html)=>{ const d=w.document.createElement("div"); d.innerHTML=html; return d.firstElementChild; };
  const CONTENT=[
    ['<span class="g-name click" data-edit="k1">KR name</span>', "a KR/SG name span"],
    ['<span class="g-chip" data-edit="k1">SG-1</span>',          "a chip"],
    ['<span class="icard-title click" data-edit="k1">Card</span>',"an initiative card title"],
    ['<span class="icard-num" data-edit="k1">3</span>',          "a card number"],
    ['<span class="skr-name" data-editsubkr="0">Sub KR</span>',  "a sub-KR name"],
  ];
  const CONTROLS=[
    ['<button class="ghost mini btn-ico" data-edit="k1">edit</button>', "an edit button"],
    ['<a class="btn-ico" data-edit="k1">edit</a>',                      "a non-name edit link (btn-ico, not .rowedit)"],
  ];

  for(const [html,label] of CONTENT){
    const el=make(html); w.document.body.appendChild(el);
    ok(!el.matches(HIDE), `${label} is NOT hidden by the readonly rule — its text survives`);
    ok(el.matches(INERT), `...but IS made inert, so it cannot open an editor`);
  }
  for(const [html,label] of CONTROLS){
    const el=make(html); w.document.body.appendChild(el);
    ok(el.matches(HIDE), `${label} IS still hidden in readonly`);
  }

  // the add/delete controls must not have been loosened on the way past
  for(const [html,label] of [
    ['<button data-addkpi="1">+</button>', "add-KPI"],
    ['<button data-addkr="1">+</button>',  "add-KR"],
    ['<button data-addsg="1">+</button>',  "add-SG"],
    ['<button data-addtask="1">+</button>',"add-task"],
    ['<button data-addlink="1">+</button>',"add-link"],
    ['<button data-addsubkr="1">+</button>',"add-sub-KR"],
    ['<button data-addedge="1">+</button>',"add-edge"],
    ['<button data-del="1">x</button>',    "delete"],
  ]){
    const el=make(html); w.document.body.appendChild(el);
    ok(el.matches(HIDE), `${label} is still hidden in readonly`);
  }
  ok(w.document.getElementById("saveBtn").matches(HIDE), "the Save button is still hidden in readonly");

  // and NOT readonly: nothing is hidden
  const w2=await boot("https://x.test/?division=D1&token=t");
  ok(!w2.document.body.classList.contains("readonly"), "without ?readonly the class is absent");
  const el=w2.document.createElement("div");
  el.innerHTML='<span class="g-name click" data-edit="k1">KR name</span>';
  w2.document.body.appendChild(el.firstElementChild);
  ok(!w2.document.body.lastElementChild.matches(HIDE), "...so a name is not hidden");
  ok(!w2.document.getElementById("saveBtn").matches(HIDE), "...and Save is visible");

  // ---- BEHAVIOURAL COMPLETENESS: the capture guard blocks EVERY mutating click ----
  // CSS enumeration rotted three times this session, so the guarantee is now behavioural: dispatch a real click
  // on a control bearing each mutation attribute and assert the guard swallowed it (defaultPrevented). A future
  // data-add*/data-edit*/data-del* control is caught by the prefix matcher without anyone updating a list.
  const guardBlocks=(html)=>{
    const el=make(html); w.document.body.appendChild(el);
    const ev=new w.MouseEvent("click",{bubbles:true,cancelable:true});
    el.dispatchEvent(ev);
    el.remove();
    return ev.defaultPrevented;
  };
  // every mutating control Corey has reported, plus a representative of each family, by REAL markup
  const MUTS=[
    ['<button data-addset="1">+ workstream</button>', "+workstream/+gate"],
    ['<span class="ws-name click" data-wsedit="s1">WS name</span>', "edit workstream (content span)"],
    ['<button data-addpendingtarget="1">+ target</button>', "+target"],
    ['<span class="pt-main" data-editpending="0"><span class="pt-name">KPI</span></span>', "edit pending target (content span)"],
    ['<button data-addkpi="1">+ KPI</button>', "+KPI"],
    ['<button data-addkr="1">+ KR</button>', "+KR"],
    ['<button data-addsg="1">+ SG</button>', "+SG"],
    ['<button data-addlink="1">+ link</button>', "+link"],
    ['<button data-addtask="1">+ task</button>', "+task"],
    ['<button data-addedge="1">+ edge</button>', "+edge"],
    ['<button data-del="1">delete</button>', "delete"],
    ['<button data-delsubkr="0">x</button>', "delete sub-KR"],
    ['<button data-editsubkr="0">edit</button>', "edit sub-KR"],
    ['<a data-edit="k1">edit</a>', "edit (link)"],
    ['<button data-markcomplete="g1">mark complete</button>', "mark gate complete"],
    ['<button data-release="1">release</button>', "release"],
    ['<button data-endobj="1">end objective</button>', "end objective"],
    ['<button data-reopenobj="1">reopen</button>', "reopen objective"],
    ['<button data-unlink="1">unlink</button>', "unlink"],
    ['<button data-setdel="s1">x</button>', "delete workstream set"],
    ['<button data-setrename="s1">rename</button>', "rename set"],
    ['<button data-rmpending="0">remove</button>', "remove pending target"],
    ['<button data-savelink="1">save</button>', "save link"],
    ['<button data-addsg-set="s1">+ gate</button>', "+gate within a workstream (data-addsg-set)"],
    ['<button onclick="addDraftMode()">+ Add failure mode</button>', "FMEA + Add failure mode (inline onclick)"],
  ];
  for(const [html,label] of MUTS){
    ok(guardBlocks(html), `readonly guard blocks: ${label}`);
  }

  // buttons built in JS with NO data-attribute, inside an edit-only container (the ETB panel + FMEA editor).
  // The old attribute-only guard was blind to these — this is the "+ experiment still works" bug.
  const guardBlocksInContainer=(containerId, btnHtml)=>{
    const cont=w.document.createElement('div'); cont.id=containerId; w.document.body.appendChild(cont);
    const d=w.document.createElement('div'); d.innerHTML=btnHtml; const el=d.firstElementChild; cont.appendChild(el);
    const ev=new w.MouseEvent('click',{bubbles:true,cancelable:true}); el.dispatchEvent(ev); cont.remove();
    return ev.defaultPrevented;
  };
  ok(guardBlocksInContainer('drawerContent', '<button class="mini">+ experiment</button>'),
     "readonly guard blocks a bare <button> inside the ETB panel (#drawerContent) — no data-attr needed");
  ok(guardBlocksInContainer('drawerContent', '<button class="danger">Delete experiment</button>'),
     "...and Delete experiment");
  ok(guardBlocksInContainer('fmeaBody', '<button class="mini">+ failure mode</button>'),
     "readonly guard blocks a bare <button> inside the FMEA editor (#fmeaBody)");

  // FMEA inline-onclick mutating buttons: the guard blocked the click, but they were still VISIBLE (dead
  // buttons). Now hidden by CSS matched on the onclick verb. Corey's "+ Add problem" is onclick="openFmeaModal()".
  for(const [html,label] of [
    ['<button class="ghost mini" onclick="openFmeaModal()">+ Add problem</button>', "+ Add problem (Corey's report)"],
    ['<button class="ghost mini" onclick="addDraftMode()">+ Add failure mode</button>', "+ Add failure mode"],
    ['<button class="ghost mini" onclick="delProblem(1)">delete</button>', "delete problem"],
    ['<button class="ghost mini" onclick="saveFmea()">Save</button>', "save FMEA"],
    ['<button class="ghost mini" onclick="addDraftEffect(0)">+ effect</button>', "add draft effect"],
  ]){
    const el=make(html); w.document.body.appendChild(el);
    ok(isHidden(el, ALLHIDE), `FMEA mutating button hidden in readonly: ${label}`);
  }
  // ---- ETB TOOLBAR: static id'd buttons, no data-attr, no inline onclick, OUTSIDE the panels ----
  // btnAddExp ("+ Experiment") and btnSave mutate/persist -> hidden + blocked. btnLoad (re-fetch) and
  // btnSettings (open settings) are safe -> visible. These are REAL shell buttons, tested in place.
  for(const [id,label] of [['btnAddExp','+ Experiment (Corey\'s report)'],['btnSave','ETB Save']]){
    const el=w.document.getElementById(id);
    ok(!!el, `${label} button (#${id}) exists in the shell`);
    if(el){
      ok(isHidden(el, ALLHIDE), `${label} is hidden in readonly`);
      const ev=new w.MouseEvent("click",{bubbles:true,cancelable:true}); el.dispatchEvent(ev);
      ok(ev.defaultPrevented, `${label} click is blocked by the guard`);
    }
  }
  for(const [id,label] of [['btnLoad','ETB Reload'],['btnSettings','ETB Settings']]){
    const el=w.document.getElementById(id);
    if(el){
      ok(!isHidden(el, ALLHIDE), `${label} (#${id}) stays VISIBLE in readonly — reading/re-fetch is allowed`);
      const ev=new w.MouseEvent("click",{bubbles:true,cancelable:true}); el.dispatchEvent(ev);
      ok(!ev.defaultPrevented, `${label} click is NOT blocked`);
    }
  }

  // navigational FMEA buttons must NOT be hidden (their onclick verb is not a mutating one)
  for(const [html,label] of [
    ['<button class="lv-btn" onclick="setFmeaView(\'list\')">List</button>', "FMEA view toggle"],
    ['<button class="sm" onclick="closeFmeaModal()">Cancel</button>', "FMEA modal Cancel (close, not mutate)"],
  ]){
    const el=make(html); w.document.body.appendChild(el);
    ok(!isHidden(el, ALLHIDE), `FMEA navigational button stays visible: ${label}`);
  }
  // but a navigational button OUTSIDE those containers with no onclick is fine
  ok(!guardBlocksInContainer('someOtherPanel', '<button class="mini">next page</button>'),
     "a plain button in a NON-edit container is NOT blocked (navigation survives)");

  // navigational / display interactions must STILL work (guard must NOT swallow them)
  const guardAllows=(html)=>{
    const el=make(html); w.document.body.appendChild(el);
    const ev=new w.MouseEvent("click",{bubbles:true,cancelable:true});
    el.dispatchEvent(ev); el.remove();
    return !ev.defaultPrevented;
  };
  for(const [html,label] of [
    ['<button data-panel="kr">panel</button>', "panel toggle"],
    ['<button data-view="tree">view</button>', "view switch"],
    ['<button data-gtoggle="g1">collapse</button>', "gate collapse"],
    ['<button data-krtoggle="k1">collapse</button>', "KR collapse"],
    ['<button data-close="1">close</button>', "modal close"],
    ['<button data-cancel="1">cancel</button>', "cancel"],
  ]){
    ok(guardAllows(html), `readonly still ALLOWS: ${label} (reading the board must work)`);
  }

  // ---- the regression Corey just hit: content must stay VISIBLE ----
  // pt-main wraps the KPI name; it must NOT be display:none (only inert). Same for ws-name, g-name, skr-name.
  for(const [html,label] of [
    ['<span class="pt-main" data-editpending="0"><span class="pt-name">Power density</span></span>', "pending-target KPI name (pt-main)"],
    ['<span class="ws-name click" data-wsedit="s1">Membrane</span>', "workstream name (ws-name)"],
    ['<span class="g-name click" data-edit="k1">Cost per kW</span>', "KR/SG name (g-name)"],
    ['<span class="skr-name" data-editsubkr="0">Sub target</span>', "sub-KR name (skr-name)"],
    // Corey's exact report: the KPI TARGET name is an <a class="rowedit" data-edit>, not a span. Hiding
    // a[data-edit] wholesale blanked it (text present in the DOM, element display:none).
    ['<a class="rowedit" data-edit="kpi:KPI-FC-UNSET-01-2" title="edit">AST</a>', "KPI target name (a.rowedit) — Corey's report"],
    ['<a class="rowedit" data-edit="kpi:KPI-FC-UNSET-01-1" title="edit">Demonstrate DuraGen1 durability</a>', "a long KPI target name (a.rowedit)"],
  ]){
    const el=make(html); w.document.body.appendChild(el);
    ok(!el.matches(HIDE), `${label} is NOT hidden — its text stays visible in readonly`);
  }
  // the rowedit name must ALSO be inert (its click is dead) AND blocked by the capture guard
  ok(guardBlocks('<a class="rowedit" data-edit="kpi:X" title="edit">AST</a>'),
     "clicking a KPI target name in readonly is blocked (belt-and-suspenders with the inert CSS)");
  // a PURE edit link that is NOT a name (if any) should still be hidden — carve-out is scoped to .rowedit
  { const el=make('<a data-edit="k1" class="btn-ico">edit</a>'); w.document.body.appendChild(el);
    ok(el.matches(HIDE), "a non-.rowedit edit link is still hidden (the carve-out is scoped to the name link)"); }

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} readonly-visibility assertions green`);
  process.exit(fl.length?1:0);
})();
