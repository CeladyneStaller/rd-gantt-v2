// Division overview detail modal: shows the 3 most delayed initiatives, ranked by slip (desc).
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
  sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    var TD=todayDay();
    // each delayed objective carries an overdue (unpassed) gate -> projects to today -> initiative slips past its plannedEnd
    execDocs={ "EXEC-D1":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],
                 stageGateSets:[{id:'S1',objectiveId:'O1',name:'w',order:0},{id:'S2',objectiveId:'O2',name:'w',order:0},{id:'S3',objectiveId:'O3',name:'w',order:0},{id:'S6',objectiveId:'O6',name:'w',order:0}],
                 stageGates:[{id:'g1',objectiveId:'O1',setId:'S1',name:'g',plannedDate:TD-100},{id:'g2',objectiveId:'O2',setId:'S2',name:'g',plannedDate:TD-100},{id:'g3',objectiveId:'O3',setId:'S3',name:'g',plannedDate:TD-100},{id:'g6',objectiveId:'O6',setId:'S6',name:'g',plannedDate:TD-100}] },
               "EXEC-D2":{ objectiveState:[],keyResults:[],kpis:[],kpiUpdates:[],tasks:[],stageGateEdges:[],stageGateSets:[],stageGates:[] } };
    // I1 +40d, I2 +10d, I3 +25d, I4 on time (0), I5 no plannedEnd (unrankable). Objective projEnd drives initiative slip.
    portfolio={ divisions:[{id:'D1',name:'Div One'},{id:'D2',name:'Div Two'}],
      initiatives:[{id:'I1',divisionId:'D1',name:'Alpha',plannedStart:0,plannedEnd:TD-40},
                   {id:'I2',divisionId:'D1',name:'Bravo',plannedStart:0,plannedEnd:TD-10},
                   {id:'I3',divisionId:'D1',name:'Charlie',plannedStart:0,plannedEnd:TD-25},
                   {id:'I4',divisionId:'D1',name:'Delta',plannedStart:0,plannedEnd:TD+500},
                   {id:'I5',divisionId:'D2',name:'Echo',plannedStart:0,plannedEnd:TD+500}],
      objectives:[{id:'O1',divisionId:'D1',initiativeId:'I1',statement:'a',plannedStart:0,plannedEnd:TD-40},
                  {id:'O2',divisionId:'D1',initiativeId:'I2',statement:'b',plannedStart:0,plannedEnd:TD-10},
                  {id:'O3',divisionId:'D1',initiativeId:'I3',statement:'c',plannedStart:0,plannedEnd:TD-25},
                  {id:'O4',divisionId:'D1',initiativeId:'I4',statement:'d',plannedStart:0,plannedEnd:TD+500}],
      milestones:[],products:[],models:[] };
    openOvDetail("division","D1");
    var body=document.getElementById('ovDetBody').innerHTML;
    ok(/Most delayed initiatives/.test(body), 'the division modal has a "Most delayed initiatives" block');
    var blk=body.split('Most delayed initiatives')[1].split('</div></div>')[0];
    ok(blk.indexOf('Alpha')>=0 && blk.indexOf('Charlie')>=0 && blk.indexOf('Bravo')>=0, 'the three delayed initiatives are listed');
    ok(blk.indexOf('Delta')<0, 'an on-time initiative is not listed');
    var iA=blk.indexOf('Alpha'), iC=blk.indexOf('Charlie'), iB=blk.indexOf('Bravo');
    ok(iA<iC && iC<iB, 'listed most-delayed first (Alpha +40 > Charlie +25 > Bravo +10)');
    ok(/\\+40d/.test(blk), 'the slip magnitude is shown (+40d)');
    // cap at 3: add a 4th delayed initiative, the smallest slip drops off
    portfolio.initiatives.push({id:'I6',divisionId:'D1',name:'Foxtrot',plannedStart:0,plannedEnd:TD-60});
    portfolio.objectives.push({id:'O6',divisionId:'D1',initiativeId:'I6',statement:'f',plannedStart:0,plannedEnd:TD-60});
    openOvDetail("division","D1");
    var b2=document.getElementById('ovDetBody').innerHTML.split('Most delayed initiatives')[1].split('</div></div>')[0];
    ok((b2.match(/modelobjline/g)||[]).length===3, 'caps at 3 initiatives');
    ok(b2.indexOf('Foxtrot')>=0 && b2.indexOf('Bravo')<0, 'the top 3 by slip win (Foxtrot +60 in, Bravo +10 out)');
    // empty state: a division with no delayed initiatives
    openOvDetail("division","D2");
    var b3=document.getElementById('ovDetBody').innerHTML;
    ok(/No initiatives are running late/.test(b3), 'a division with nothing late shows an empty state');
   }catch(e){ ok(false,'threw: '+e.message+' @ '+(e.stack||'').split('\\n')[1]); }
   document.body.setAttribute('data-out', JSON.stringify(out));
  })();`;
  d.body.appendChild(sc);
  setTimeout(()=>{ const out=JSON.parse(d.body.getAttribute('data-out')||'[]'); out.forEach(l=>console.log(l));
    const fl=out.filter(x=>x.startsWith('FAIL')); console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS — ${out.length} delayed-initiatives assertions green`); process.exit(fl.length?1:0); },400);
},400);
