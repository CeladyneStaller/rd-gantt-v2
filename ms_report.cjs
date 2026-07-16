// The milestone report follows the uploaded mockup: fixed-light document, derived fields read-only, no
// Band/Score, additive schema (project/author/version/demonstrated/context/actions), signatures as drawn.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.print=()=>{ w.__printed=true; }; w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var o=[]; function ok(c,m){ o.push((c?'ok  ':'FAIL ')+m); }
   try{
    persistPortfolio=function(){};
    execDocs={ "EXEC-D1":{ objectiveState:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[],
      keyResults:[{id:'KR1',objectiveId:'O1',statement:'Reach pressure'}],
      kpis:[{id:'KA',hostType:'keyResult',hostId:'KR1',name:'Rig A pressure',direction:'up',target:40,targetType:'demonstration'}],
      kpiUpdates:[{id:'u1',kpiId:'KA',value:44,timestamp:5000}] } };
    portfolio=Object.assign(blankPortfolio(), {
      divisions:[{id:'D1',name:'Div'}], products:[{id:'P1',name:'MEA Stack',divisionId:'D1'}],
      initiatives:[{id:'I1',divisionId:'D1',name:'Init',productId:'P1'}],
      objectives:[{id:'O1',divisionId:'D1',initiativeId:'I1',statement:'Demonstrate pressure envelope',quarter:'26Q1'}],
      milestones:[{id:'M1',initiativeId:'I1',name:'Pressure demo',plannedDate:100,completedDate:113,trl:5,mrl:4}],
      kpis:[{id:'MK',hostType:'milestone',hostId:'M1',name:'Pressure',direction:'up',target:40,unit:'bar',targetType:'demonstration',isDefiner:true,sources:['KA']}] });

    openMilestoneReport('M1');
    ok(!document.getElementById('msReportModal').hidden, 'the report opens');
    var h=document.getElementById('msrBody').innerHTML;

    // ---- every section from the mockup ----
    ok(/msr-doc/.test(h), 'it renders as a fixed-light document, not themed app chrome');
    ok(/What was demonstrated/.test(h), 'section: What was demonstrated');
    ok(/Performance vs. targets/.test(h), 'section: Performance vs. targets');
    ok(/Key findings/.test(h), 'section: Key findings & learnings');
    ok(/Milestone context/.test(h), 'section: Milestone context');
    ok(/Actions required before next milestone/.test(h), 'section: Actions required');
    ok((h.match(/msr-sig"/g)||[]).length===3, 'three ruled signature lines');   // note the quote: msr-sig also prefixes msr-siglbl
    ok(/Technical lead/.test(h) && /CTO/.test(h) && /Reviewer/.test(h), '...with the drawn labels');
    ok(!!document.getElementById('msrPrint'), 'a Print / Save as PDF button is offered');

    // ---- DECISION: Band and Score are gone; Result stays ----
    ok(!/>Band</.test(h) && !/>Score</.test(h), 'Band and Score columns are dropped, per the mockup');
    ok(!/msr-sel/.test(h) && !/data-msr="result"/.test(h), 'Result is no longer a user-selected dropdown');
    ok(/msr-badge msr-green">Met</.test(h), 'Result is ASSESSED from current vs target and colour-coded (44 >= 40 -> green Met)');

    // ---- DECISION: derived fields are read-only, everything else editable ----
    var tag=h.match(/msr-tag">([^<]*)/);
    ok(!!tag, 'the milestone number renders as a derived tag');
    ok(h.indexOf('data-msr="project"')>=0 && h.indexOf('data-msr="author"')>=0 && h.indexOf('data-msr="version"')>=0, 'project / author / version are editable');
    var doc=document.getElementById('msrDoc');
    var derived=['Planned date','Actual date','Variance'];
    ok(/2026|—|[0-9]{4}-/.test(doc.textContent), 'dates render');
    var ce=Array.from(doc.querySelectorAll('[contenteditable]')).map(x=>x.dataset.msr||'');
    ok(ce.indexOf('planned')<0 && ce.indexOf('variance')<0, 'derived dates/variance are NOT editable');
    ok(/Achieved/.test(h), 'the achieved badge is derived from the milestone');

    // ---- the value source note (asked for in the report) ----
    ok(/source: Rig A pressure/.test(h), 'the metric names where its current value came from');
    ok(/44 bar/.test(h), '...and shows that linked value as Measured');

    // ---- TRL / MRL and the reworked context section ----
    ok(/TRL 5/.test(h) && /MRL 4/.test(h), 'the report states TRL and MRL achieved');
    ok(h.indexOf('TRL / MRL')>=0, '...and surfaces them in the header meta too');   // indexOf: a slash-regex would terminate early
    ok(/Linked objectives/.test(h), 'context lists Linked objectives');
    ok(/Demonstrate pressure envelope/.test(h), '...naming the objective whose KR KPI feeds this milestone');
    ok(!/Variance/.test(h) && !/Budget spent/.test(h) && !/Prototype build/.test(h) && !/Linked OKR/.test(h),
       'context is exactly planned/actual/TRL/MRL/linked objectives — the old rows are gone');
    ok(msLinkedObjectives('M1').length===1, 'linked objectives resolve through the source KPI to its objective');
    // a milestone with no linked sources says so rather than inventing objectives
    var mk=(portfolio.kpis||[]).find(k=>k.id==='MK'); var keep=mk.sources; mk.sources=[];
    ok(msLinkedObjectives('M1').length===0, 'no sources -> no linked objectives');
    mk.sources=keep;

    // ---- DECISION: additive schema, 3 fixed action rows ----
    ok((h.match(/msr-action"/g)||[]).length===3, 'exactly 3 fixed action rows');
    ok((h.match(/msr-finding"/g)||[]).length===4, 'and 4 fixed findings, as before');

    // ---- edits round-trip through the new schema ----
    doc.querySelector('[data-msr="project"]').textContent='Tera Electrolyzer';
    doc.querySelector('[data-msr="author"]').textContent='Corey';
    doc.querySelector('[data-msr="demonstrated"]').textContent='Ran the stack at 44 bar for 6 h.';
    doc.querySelector('[data-msr="act"][data-idx="0"][data-key="item"]').textContent='Re-run AST';
    doc.querySelector('[data-msr="finding"][data-idx="0"]').textContent='Seals held.';
    saveMilestoneReport();
    var rep=byId('milestone','M1').milestoneReport;
    ok(rep.project==='Tera Electrolyzer' && rep.author==='Corey', 'project and author persist');
    ok(rep.demonstrated==='Ran the stack at 44 bar for 6 h.', 'the demonstrated narrative persists');
    ok(rep.actions[0].item==='Re-run AST' && rep.actions.length===3, 'actions persist as 3 rows');
    ok(rep.findings[0]==='Seals held.', 'findings still persist');

    // ---- additive: a report saved before these fields existed still opens ----
    byId('milestone','M1').milestoneReport={ kpiOverrides:{}, findings:['a','b','c','d'], locked:false, savedAt:1 };
    openMilestoneReport('M1');
    ok(document.getElementById('msrBody').innerHTML.indexOf('data-msr="project"')>=0, 'a legacy report opens and gains the new fields blank');
    ok(msrDraft.actions.length===3, '...with actions defaulted to 3 rows, not undefined');
    ok(msrDraft.findings[0]==='a', '...and its existing findings preserved');

    // ---- placeholders are not saved as content ----
    saveMilestoneReport();
    ok(byId('milestone','M1').milestoneReport.project==='', 'an untouched placeholder saves as empty, not as its hint text');

    // ---- lock makes it read-only ----
    openMilestoneReport('M1'); toggleMsLock();
    ok(msrDraft.locked===true, 'the report locks');
    ok(document.getElementById('msrDoc').querySelectorAll('[contenteditable]').length===0, 'locked: nothing is editable');
    ok(/msr-badge/.test(document.getElementById('msrBody').innerHTML), 'locked: the assessed Result badge still renders');
    toggleMsLock();
   }catch(e){ ok(false,'threw: '+e.message+' @ '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', JSON.stringify(o));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]');
    out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    const fl=out.filter(x=>x.startsWith('FAIL'));
    console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} milestone-report assertions green`);
    process.exit(fl.length?1:0); },400);
},450);
