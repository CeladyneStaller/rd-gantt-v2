// ETB (Q_tracker): (1) buildGraphElements emits a "No next step" node for results with no terminal/next;
// (2) openExpDetailModal renders a read-only detail modal (details/result/next step/edit) for completed experiments.
// Cytoscape is CDN-only (guarded headless), so this tests the pure graph model + the modal DOM, not the canvas.
const {JSDOM}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_SRC||'/home/claude')+'/qtracker.html','utf8');
const dom=new JSDOM(html,{runScripts:"outside-only", pretendToBeVisual:true, url:"https://localhost/"});
const w=dom.window;
w.fetch=()=>Promise.reject(new Error("no net"));
if(!w.matchMedia) w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
if(!w.requestAnimationFrame) w.requestAnimationFrame=cb=>setTimeout(cb,0);
if(!w.cancelAnimationFrame) w.cancelAnimationFrame=()=>{};
const hook=`
window.__etb={
  setTree:function(tr){state.tree=tr;try{normalizeTree(state.tree);}catch(e){}},
  build:function(){var reach=computeReachability(state.tree);return buildGraphElements(state.tree,reach);},
  openModal:function(id){openExpDetailModal(id);},
  overlay:function(){var ov=ETB_ROOT.querySelector('#exp-detail-overlay');return ov?ov.outerHTML:null;},
  closeModal:function(){closeExpDetailModal();}
};`;
for(const sc of [...w.document.querySelectorAll('script:not([src])')]){
  let code=sc.textContent;
  if(code.includes('function buildGraphElements')){ code=code.replace('\ninit();\n\n})();', '\ntry{init();}catch(__e){}\n'+hook+'\n})();'); }
  try{ w.eval(code); }catch(e){ /* sibling Q-tracker scripts may not boot headlessly; ETB script is what matters */ }
}
const E=w.__etb; if(!E){ console.error('hook not installed'); process.exit(1); }

const tree={ root_experiment_id:"exp_001", terminal_types:{target_achieved:{label:"Target achieved"},halt:{label:"Halt"}},
  experiments:{
    exp_001:{id:"exp_001",code:"EXP-1",name:"Baseline",status:"complete",hypothesis:"Higher loading raises conductivity",toggle:"catalyst loading",test:"run polcurve",
      key_reads:[{id:"kr_1_1",name:"conductivity",unit:"S/cm",critical_value:10,direction:">="}],
      possible_results:[
        {id:"res_1a",label:"High conductivity",criteria:[],conclusion:"meets spec",next_experiment_ids:["exp_002"],terminal:null,accomplishments:[]},
        {id:"res_1b",label:"Low conductivity",criteria:[],conclusion:"below spec",next_experiment_ids:[],terminal:null,accomplishments:[]}],
      actual_outcome:{result_id:"res_1a",recorded_date:"2026-05-01",recorded_by:"corey",note:"clean run",conclusion:null,next_experiment_ids:[],terminal:null}, audit_log:[]},
    exp_002:{id:"exp_002",code:"EXP-2",name:"Follow-up",status:"planned",hypothesis:"",toggle:"",test:"",key_reads:[],possible_results:[],actual_outcome:null,audit_log:[]}
  }};
E.setTree(tree);

let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};

// ---- change 1: buildGraphElements ----
const g=E.build();
ok(g&&Array.isArray(g.nodes)&&Array.isArray(g.edges), "buildGraphElements returned {nodes,edges}");
const nonext=g.nodes.filter(x=>x.data.kind==="nonext");
ok(nonext.length===1, "exactly 1 'No next step' node (res_1b only; res_1a has a next) — got "+nonext.length);
ok(nonext[0]&&nonext[0].data.label==="No next step", "node label reads 'No next step'");
ok(/nonext_exp_001_res_1b/.test(nonext[0].data.id), "nonext node is scoped to exp_001/res_1b");
ok(g.edges.some(e=>e.data.source==="exp_001"&&/^nonext_/.test(e.data.target)), "edge from exp_001 to its No-next-step node");
ok(g.edges.some(e=>e.data.source==="exp_001"&&e.data.target==="exp_002"), "res_1a still edges exp_001 -> exp_002");
ok(g.nodes.some(x=>x.data.kind==="experiment"&&x.data.id==="exp_001"), "experiment nodes still built");

// ---- change 2: openExpDetailModal ----
E.openModal("exp_001");
const ov=E.overlay();
ok(ov!=null, "detail modal overlay created");
ok(/EXP-1/.test(ov)&&/Experiment details/.test(ov), "modal shows code + details section");
ok(/Higher loading raises conductivity/.test(ov)&&/catalyst loading/.test(ov), "modal shows hypothesis + toggle");
ok(/conductivity/.test(ov)&&/S\/cm/.test(ov), "modal shows key reads");
ok(/Result/.test(ov)&&/Observed:/.test(ov)&&/High conductivity/.test(ov), "modal shows the observed result");
ok(/Next step/.test(ov)&&/EXP-2/.test(ov), "modal shows the next step (-> EXP-2)");
ok(/Possible results/.test(ov)&&/Low conductivity/.test(ov)&&/nonext-tag/.test(ov), "modal lists possible results incl a 'No next step' tag for res_1b");
ok(/observed-badge/.test(ov), "observed result is badged");
ok(/Edit results/.test(ov), "modal has an Edit results button");
E.closeModal();
ok(E.overlay()==null, "closeModal removes the overlay");

console.log(f?('\n'+f+'/'+n+' FAILED'):('\nPASS — '+n+' ETB no-next-step + detail-modal assertions green'));
process.exit(f?1:0);
