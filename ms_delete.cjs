// The milestone table gains a delete button, wired to the same cascade-aware confirm the rest of the app uses.
// It must not trigger the row's click-to-edit underneath it.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
function boot(url){ return new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url,pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }}); }
const FIXTURE = `
  persistPortfolio=function(){};
  execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] } };
  portfolio={ divisions:[{id:'D1',name:'Div'}], initiatives:[{id:'I1',divisionId:'D1',name:'Init'}],
    objectives:[], kpis:[],
    milestones:[{id:'M1',initiativeId:'I1',name:'First light',plannedDate:100},
                {id:'M2',initiativeId:'I1',name:'Second light',plannedDate:200}],
    products:[], models:[] };
  renderMilestones();`;
const dom=boot("https://x.test/?token=t"); const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    ${FIXTURE}
    var el=document.getElementById('msBody'), h=el.innerHTML;
    ok((h.match(/data-sdel="milestone:/g)||[]).length===2, 'every milestone row gets a delete button');
    ok(h.indexOf('data-sdel="milestone:M1"')>=0, 'the button carries the milestone id');
    ok(h.indexOf('data-msreport')>=0, 'the report button is still there beside it');
    ok((h.match(/<th[ >]/g)||[]).length===10, 'no extra column was added — delete shares the existing actions cell');
    ok(h.indexOf('colspan="10"')>=0, 'the group header still spans the table');

    var btn=el.querySelector('[data-sdel="milestone:M1"]');
    ok(!!btn && typeof btn.onclick==='function', 'the delete button is wired');
    // clicking delete must NOT open the row editor underneath
    var edOpened=false, _oe=openEditor; openEditor=function(){ edOpened=true; };
    var stopped=false;
    btn.onclick({ stopPropagation:function(){ stopped=true; } });
    openEditor=_oe;
    ok(stopped===true, 'the click is stopped from reaching the row (which is click-to-edit)');
    ok(edOpened===false, 'deleting does not open the milestone editor');
    var dm=document.getElementById('delModal');
    ok(dm && !dm.hidden, 'it opens the shared delete-confirm modal');
    ok(document.getElementById('delTitle').textContent==='Delete milestone', 'the confirm names the milestone entity');
    ok(portfolio.milestones.length===2, 'nothing is deleted until the confirm is chosen');
    var go=document.querySelector('#delModal [data-delgo]');
    ok(!!go, 'the confirm offers a delete action');
    go.click();
    ok(portfolio.milestones.length===1 && !portfolio.milestones.some(m=>m.id==='M1'), 'confirming removes that milestone');
    // NO manual re-render here: the app must refresh the tab itself (this is what the original harness missed)
    ok(document.getElementById('msBody').innerHTML.indexOf('data-sdel="milestone:M1"')<0, 'the table refreshes itself — the row disappears without a reload');
    ok(document.getElementById('msBody').innerHTML.indexOf('data-sdel="milestone:M2"')>=0, '...and the surviving milestone is still listed');
    // saving an edit must refresh the tab too (same omission, same fix)
    openEditor('M2','milestone');
    document.querySelector('#pfModalBody [data-f="name"]').value='Renamed light';
    saveRecord();
    ok(document.getElementById('msBody').innerHTML.indexOf('Renamed light')>=0, 'saving a milestone edit refreshes the table without a reload');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const prev=JSON.parse(d.body.getAttribute('data-out')||'[]'); roBoot(prev); }, 350);
},450);

// read-only is a const from the URL -> needs its own instance
function roBoot(prev){
  const dom2=boot("https://x.test/?token=t&readonly=1"); const w2=dom2.window;
  setTimeout(()=>{ const d2=w2.document, s2=d2.createElement('script');
    s2.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
     try{
      ${FIXTURE}
      ok(RO===true, 'read-only instance booted');
      ok(document.getElementById('msBody').innerHTML.indexOf('data-sdel')<0, 'read-only: no delete button renders');
     }catch(e){ ok(false,'RO threw: '+e.message); }
     document.body.setAttribute('data-out', JSON.stringify(out));
    })();`;
    d2.body.appendChild(s2);
    setTimeout(()=>{ const out=prev.concat(JSON.parse(d2.body.getAttribute('data-out')||'[]'));
      out.forEach(l=>console.log(l));
      const fl=out.filter(x=>x.startsWith('FAIL'));
      console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} milestone-delete assertions green`);
      process.exit(fl.length?1:0); },350);
  },450);
}
