const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
let html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
html=html.replace("\ninit();\n\n})();",
 "\ninit(); window.__H={ sampleTree:function(){return sampleTree();}, setTree:function(tr){state.tree=tr;try{normalizeTree(state.tree);}catch(e){}}, renderStatus:function(){renderStatus();}, statusline:function(){var e=$('#statusline');return e?e.innerHTML:'';}, openIssues:function(){try{openEtbIssues();}catch(e){return 'ERR:'+e.message;}}, closeIssues:function(){closeEtbIssues();}, issuesOpen:function(){var o=$('#etbIssuesOverlay');return !!(o&&o.classList.contains('open'));}, issuesBody:function(){var e=$('#etbIssuesBody');return e?e.innerHTML:'';}, setGates:function(gates,objId){exec.stageGates=gates;selectedObj=objId;}, accHtml:function(expId,resId){try{var exp=state.tree.experiments[expId];var res=(exp.possible_results||[]).find(function(r){return r.id===resId;});return renderAccomplishments(state.tree,expId,exp,res).outerHTML;}catch(e){return 'ERR:'+e.message;}} };\n\n})();");
const mkCyto=()=>({on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0,select(){}};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},elements(){return{length:0};},$(){return{unselect(){}};}});
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=tok",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return mkCyto();}; }});
const w=dom.window;
setTimeout(()=>{
  let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++; console.log('FAIL:',m);}};
  const H=w.__H; if(!H){ console.log('hook missing'); process.exit(1); }
  try{
    // ===== Change 1: clickable statusline -> issues modal =====
    const t=H.sampleTree(); t.experiments.exp_001.possible_results[0].next_experiment_ids=["nope"]; // rule 5 broken ref
    H.setTree(t); H.renderStatus();
    const sl=H.statusline();
    ok(/status-issues/.test(sl), 'statusline error/warning indicator is a clickable element');
    ok(/issues-view/.test(sl) && />view</.test(sl), 'a "view" affordance signals it opens a modal');
    ok(/error/.test(sl), 'statusline still shows the error count');
    const r=H.openIssues(); ok(r!=='ERR', typeof r==='string'&&r.indexOf('ERR:')===0?('openEtbIssues threw: '+r):'openEtbIssues ran');
    ok(H.issuesOpen(), 'clicking opens the #etbIssuesOverlay modal');
    const ib=H.issuesBody();
    ok(/issue-row error/.test(ib), 'modal lists an error row');
    ok(/rule 5/.test(ib), 'modal shows the rule number (rule 5)');
    ok(ib.length>40 && /issue-txt/.test(ib), 'modal shows the issue message text');
    H.closeIssues(); ok(!H.issuesOpen(), 'close button/backdrop closes the modal');
    const t2=H.sampleTree(); H.setTree(t2); H.renderStatus();
    ok(!/status-issues/.test(H.statusline()) && /no errors/.test(H.statusline()), 'a clean tree shows "no errors" and no clickable issues element');

    // ===== Change 2: stage-gate accomplishment -> dropdown =====
    H.setGates([{id:'g1',objectiveId:'O',name:'Baseline established'},{id:'g2',objectiveId:'O',name:'Cell design freeze'}],'O');
    const t3=H.sampleTree(); H.setTree(t3);
    const acc=H.accHtml('exp_001','res_001a');  // has acc_1 {label:'SG-1: Baseline established', gate_id:null}
    ok(acc.indexOf('ERR:')!==0, 'renderAccomplishments ran without error');
    ok(/<select/.test(acc), 'accomplishment now renders a <select> dropdown (not a free-text input)');
    ok(!/<input/i.test(acc), 'no free-text label input remains');
    ok(acc.indexOf('Baseline established')>=0 && acc.indexOf('Cell design freeze')>=0, "dropdown lists the objective's stage-gates");
    ok(/select a stage-gate/.test(acc), 'a blank "select a stage-gate" option is present');
    ok(/acc-legacy/.test(acc) && /was:/.test(acc), 'legacy manual label is surfaced as a caption (migration-safe, nothing lost)');
  }catch(e){ f++; console.log('THREW:',e.message, (e.stack||'').split('\n')[1]); }
  console.log(f?`\n${f}/${n} FAILED`:`\nPASS — ${n} ETB issues-modal + gate-dropdown assertions green`);
  process.exit(f?1:0);
},500);
