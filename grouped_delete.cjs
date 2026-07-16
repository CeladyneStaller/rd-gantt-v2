// Custom grouping (pfGroupMode="dims") replaces #structTables with the grouped tree, whose leaves render
// treeActs(). Delete must be present + wired there, exactly as in the hierarchy tables.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] } };
    portfolio={ divisions:[{id:'D1',name:'Div'}], initiatives:[{id:'I1',divisionId:'D1',name:'Init'}],
      objectives:[{id:'O1',divisionId:'D1',initiativeId:'I1',statement:'obj one',quarter:'Q1 2026'},
                  {id:'O2',divisionId:'D1',initiativeId:'I1',statement:'obj two',quarter:'Q1 2026'}],
      milestones:[],products:[],models:[] };
    // --- custom grouping ---
    pfGroupMode="dims"; pfGroupDims=["division"]; renderPortfolio();
    var host=document.getElementById('structTables'), h=host.innerHTML;
    ok(/data-sdel="objective:O1"/.test(h), 'custom grouping: an objective row has a delete button');
    ok(/data-tedit="objective:O1"/.test(h), 'custom grouping: the edit button is still present');
    var btn=host.querySelector('[data-sdel="objective:O1"]');
    ok(!!btn && typeof btn.onclick==='function', 'the grouped delete button is wired (onclick bound)');
    // firing it opens the shared confirm modal rather than deleting silently
    if(btn){ btn.onclick({preventDefault(){},stopPropagation(){}});
      var dm=document.getElementById('delModal');
      ok(dm && !dm.hidden, 'clicking delete opens the shared delete-confirm modal');
      ok(portfolio.objectives.length===2, 'nothing is deleted until the confirm is chosen');
      var go=document.querySelector('#delModal [data-delgo]');
      ok(!!go, 'the confirm modal offers a delete action');
    }
    // --- hierarchy mode still has its table delete (no regression) ---
    pfGroupMode="hierarchy"; renderPortfolio();
    var h2=document.getElementById('structTables').innerHTML;
    ok(/data-sdel="objective:O1"/.test(h2), 'hierarchy mode: the table delete is unaffected');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+(e.stack||'').split('\\n')[1]); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); roBoot(out); },400);
},450);

// read-only is a const from the URL -> boot a separate instance with ?readonly=1
function roBoot(prev){
  const dom2=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t&readonly=1",pretendToBeVisual:true,
    beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
  const w2=dom2.window;
  setTimeout(()=>{ const d2=w2.document, s2=d2.createElement('script');
    s2.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
     try{
      execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] } };
      portfolio={ divisions:[{id:'D1',name:'Div'}], initiatives:[{id:'I1',divisionId:'D1',name:'Init'}],
        objectives:[{id:'O1',divisionId:'D1',initiativeId:'I1',statement:'obj one',quarter:'Q1 2026'}], milestones:[],products:[],models:[] };
      ok(RO===true, 'read-only instance booted');
      pfGroupMode="dims"; pfGroupDims=["division"]; renderPortfolio();
      ok(!/data-sdel/.test(document.getElementById('structTables').innerHTML), 'read-only: no delete buttons render in the grouped tree');
     }catch(e){ ok(false,'RO threw: '+e.message); }
     document.body.setAttribute('data-out', JSON.stringify(out));
    })();`;
    d2.body.appendChild(s2);
    setTimeout(()=>{ const out=prev.concat(JSON.parse(d2.body.getAttribute('data-out')||'[]'));
      out.forEach(l=>console.log(l));
      const fl=out.filter(x=>x.startsWith('FAIL'));
      console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} grouped-delete assertions green`);
      process.exit(fl.length?1:0); },300);
  },450);
}
