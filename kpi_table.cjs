const {JSDOM,VirtualConsole}=require('jsdom'); const fs=require('fs');
const html=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/execution_app.html','utf8');
const dom=new JSDOM(html,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0,select(){}};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},elements(){return{length:0};},$(){return{unselect(){}};}};}; }});
const w=dom.window;
setTimeout(()=>{ const d=w.document, s=d.createElement('script');
  s.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
   try{
    portfolio={divisions:[{id:'D'}],objectives:[{id:'O',divisionId:'D'}],initiatives:[],milestones:[],products:[],models:[]};
    divisionId='D'; selectedObj='O'; exec=blankExec();
    exec.kpis=[
      {id:'k1',objectiveId:'O',hostType:'stageGate',hostId:'g1',name:'Power density',direction:'up',target:1.0,unit:'W/cm2',targetType:'demonstration'},
      {id:'k2',objectiveId:'O',hostType:'stageGate',hostId:'g1',name:'Cell voltage',direction:'up',target:0.65,unit:'V'},
      {id:'k3',objectiveId:'O',hostType:'stageGate',hostId:'g1',name:'Leak test',targetType:'binary'},
      {id:'k4',objectiveId:'O',hostType:'stageGate',hostId:'g1',name:'Cell spread',direction:'down',target:15,unit:'mV'} ];
    exec.kpiUpdates=[{kpiId:'k1',value:1.04,timestamp:1},{kpiId:'k2',value:0.5,timestamp:1}];
    var h=kpiTable("stageGate","g1","O");
    ok(/class="mtbl"/.test(h), 'renders the aligned .mtbl table');
    ok(/>Pass criterion</.test(h) && />Unit</.test(h) && />Current</.test(h) && />Status</.test(h), 'Pass criterion / Unit / Current / Status column headers');
    ok(/\\u2265 1/.test(h), 'up direction -> "≥" criterion (separate from unit)');
    ok(/\\u2264 15/.test(h), 'down direction -> "≤" criterion');
    ok(/W\\/cm2/.test(h) && /mV/.test(h), 'units live in their own column');
    ok(/>pass</.test(h), 'binary target -> "pass" criterion');
    ok(/m-badge met/.test(h), 'a met status badge is rendered');
    ok(/no read/.test(h), 'no-read current for an unmeasured KPI');
    ok(/data-postcell="k1"/.test(h) && !/data-postread/.test(h), 'no post column — Current cell is click-to-post (data-postcell)');
    ok(/data-edit="kpi:k1"/.test(h) && /data-del="kpi:k1"/.test(h), 'edit + delete hooks preserved');
    var hk=kpiTable("keyResult","kr1","O");
    ok(/<th>KPI<\\/th>/.test(hk), 'Key-Result table heads its metric column "KPI"');
    ok(/mtbl-empty/.test(hk), 'empty state renders cleanly');
    // regression (Corey): a KPI at 93% of its target (1.27 vs >=1.36) must read "on track", not "met"
    function k5label(html){ var r=(html.split('data-edit="kpi:k5"')[1]||'').split('</tr>')[0]; var i=r.indexOf('<span class="d"></span>'); if(i<0) return ''; var rest=r.slice(i+'<span class="d"></span>'.length); return rest.slice(0, rest.indexOf('</span>')).trim(); }
    exec.kpis.push({id:'k5',objectiveId:'O',hostType:'stageGate',hostId:'g1',name:'HFR',direction:'up',target:1.36,unit:'x'});
    exec.kpiUpdates.push({kpiId:'k5',value:1.27,timestamp:1});
    ok(k5label(kpiTable("stageGate","g1","O"))==='on track', 'KPI at 93% of target (1.27 vs >=1.36) reads "on track", not "met"');
    var AK5=allKpisPool(), EM5=emForCore(), gk=AK5.filter(k=>k.hostType==='stageGate'&&k.hostId==='g1');
    ok(gk.filter(k=>{var s2=RD.kpiScoreResolved(k,AK5,EM5);return s2!=null&&s2>=100;}).length===1, 'the "N met" count uses score>=100: k1(104%) counts, k5(93%) does not');
    exec.kpiUpdates.push({kpiId:'k5',value:1.40,timestamp:2});
    ok(k5label(kpiTable("stageGate","g1","O"))==='met', 'once the reading reaches the target (1.40 >= 1.36), it reads "met"');
    // statistical completeness (hybrid, Option B): incomplete sample -> provisional "on track" even at score>=100; complete -> "met"
    function rowOf(html,id){ return (html.split('data-edit="kpi:'+id+'"')[1]||'').split('</tr>')[0]; }
    function labelOf(html,id){ var r=rowOf(html,id); var i=r.indexOf('<span class="d"></span>'); if(i<0) return ''; var rest=r.slice(i+'<span class="d"></span>'.length); return rest.slice(0, rest.indexOf('</span>')).trim(); }
    exec.kpis.push({id:'ks',objectiveId:'O',hostType:'stageGate',hostId:'g1',name:'Vstat',direction:'up',target:30,unit:'V',targetType:'statistical',statistic:'average',readCount:5});
    exec.kpiUpdates.push({kpiId:'ks',value:30,timestamp:10},{kpiId:'ks',value:30,timestamp:11},{kpiId:'ks',value:30,timestamp:12}); // 3 of 5, avg 30 -> score 100 but incomplete
    var hs=kpiTable("stageGate","g1","O");
    ok(labelOf(hs,'ks')==='on track', 'statistical: score>=100 but sample incomplete (3/5) reads "on track" (provisional), not "met"');
    ok(/m-cur-sub warn/.test(rowOf(hs,'ks')) && rowOf(hs,'ks').indexOf('3/5')>=0, 'statistical: incomplete sample shows the "3/5" completeness with the warn class');
    exec.kpiUpdates.push({kpiId:'ks',value:30,timestamp:13},{kpiId:'ks',value:30,timestamp:14}); // now 5 of 5
    var hs2=kpiTable("stageGate","g1","O");
    ok(labelOf(hs2,'ks')==='met', 'statistical: once the sample is complete (5/5) and target met, reads "met"');
    ok(/m-cur-sub ok/.test(rowOf(hs2,'ks')) && rowOf(hs2,'ks').indexOf('5/5')>=0, 'statistical: complete sample shows "5/5" with the ok class');
    exec.kpis.push({id:'kb',objectiveId:'O',hostType:'stageGate',hostId:'g1',name:'Vstat2',direction:'up',target:30,unit:'V',targetType:'statistical',statistic:'average',readCount:''});
    exec.kpiUpdates.push({kpiId:'kb',value:40,timestamp:20}); // avg 40 vs 30 -> score 100, blank readCount
    var hb=kpiTable("stageGate","g1","O");
    ok(labelOf(hb,'kb')==='met' && !/m-cur-sub/.test(rowOf(hb,'kb')), 'statistical with blank readCount: no completeness sub, "met" at score>=100 (no gate)');
    // exercise inline click-to-post in a live container (stub renderAll: minimal fixture has no dates for a full re-render)
    var _ra=renderAll; renderAll=function(){};
    var box=document.createElement('div'); box.innerHTML=kpiTable("stageGate","g1","O"); document.body.appendChild(box); wireExec(box);
    var c4=box.querySelector('[data-postcell="k4"]');            // k4 has no reading yet
    var before=exec.kpiUpdates.length; c4.onclick();
    var inp=c4.querySelector('input');
    ok(!!inp, 'clicking the Current cell opens an inline value input');
    inp.value='0.9'; inp.onkeydown({key:'Enter',preventDefault(){}});
    ok(exec.kpiUpdates.length===before+1 && exec.kpiUpdates[exec.kpiUpdates.length-1].kpiId==='k4', 'Enter posts a reading for that KPI');
    var c1=box.querySelector('[data-postcell="k1"]');            // k1 already reads 1.04
    var b2=exec.kpiUpdates.length; c1.onclick(); c1.querySelector('input').onblur();
    ok(exec.kpiUpdates.length===b2, 'blurring an unchanged value posts nothing (no duplicate reading)');
    renderAll=_ra;
   }catch(e){ out.push('FAIL threw: '+e.message+'  '+((e.stack||'').split('\\n')[1]||'')); }
   document.body.setAttribute('data-out', out.join('\\n'));
  })();`;
  d.body.appendChild(s);
  setTimeout(()=>{ const o=(d.body.getAttribute('data-out')||'').split('\n'); const fl=o.filter(x=>x.startsWith('FAIL'));
    o.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
    console.log(fl.length?`\n${fl.length}/${o.length} FAILED`:`\nPASS — ${o.length} aligned KPI/target table assertions green`); process.exit(fl.length?1:0);
  },400);
},500);
