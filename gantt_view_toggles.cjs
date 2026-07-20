// Two Gantt view toggles, independent and composable:
//   1. Active only  — objectives filtered by isActiveObjective; the EXISTING ancestor prune then drops any
//      initiative/division with no surviving objective, which IS "an initiative is active iff it holds >=1
//      active objective" (no isActiveInitiative needed).
//   2. <quarter> only — the axis is pinned to the quarter rather than derived from what survived. Bars crossing
//      the edge are clipped by the track; rows with NO overlap drop out.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const HTML=fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

function boot(url){
  return new Promise(res=>{
    const dom=new JSDOM(HTML,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url,pretendToBeVisual:true,
      beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
    setTimeout(()=>res(dom.window),450);
  });
}

// Fixture built RELATIVE to today and the real current quarter, so it cannot rot.
const FIX=`(function(){
  var TD=todayDay(), Q=currentQuarter(), qr=RD.quarterRange(Q);
  var QLO=isoToDay(qr.start), QHI=isoToDay(qr.end);
  window.__Q={lo:QLO,hi:QHI,name:Q};
  portfolio={ divisions:[{id:'DIV-FC',name:'FC'}], products:[], models:[], kpis:[], milestones:[],
    initiatives:[
      {id:'INI-LIVE', divisionId:'DIV-FC', name:'Live init',  plannedStart:QLO-5,  plannedEnd:QHI+5},
      {id:'INI-DEAD', divisionId:'DIV-FC', name:'Dead init',  plannedStart:QLO-400,plannedEnd:QLO-300},
      {id:'INI-LONG', divisionId:'DIV-FC', name:'Long init',  plannedStart:QLO-400,plannedEnd:QHI+400}],
    objectives:[
      // active: inside its planned window today
      {id:'OBJ-LIVE', divisionId:'DIV-FC', initiativeId:'INI-LIVE', statement:'live', plannedStart:TD-5, plannedEnd:TD+5},
      // inactive: window long past, and not this quarter
      {id:'OBJ-OLD',  divisionId:'DIV-FC', initiativeId:'INI-DEAD', statement:'old',  quarter:'2000Q1', plannedStart:QLO-400, plannedEnd:QLO-300},
      // active, but its bar runs far outside the quarter on BOTH sides
      {id:'OBJ-LONG', divisionId:'DIV-FC', initiativeId:'INI-LONG', statement:'long', plannedStart:QLO-400, plannedEnd:QHI+400}]};
  execDocs={};
})()`;

const rows=(w)=>{ w.eval("renderGantt();");
  return [...w.document.querySelectorAll('#ganttWrap .grow')].map(r=>r.textContent); };
const has=(rs,t)=>rs.some(x=>x.indexOf(t)>=0);

(async()=>{
  // ---- neither toggle ----
  let w=await boot("https://x.test/?token=t"); w.eval(FIX);
  let r=rows(w);
  ok(has(r,'live') && has(r,'old') && has(r,'long'), "with no toggles every dated objective shows");
  ok(has(r,'Dead init'), "...including an initiative whose objectives are all finished");
  ok(w.eval("ganttActiveOnly")===false && w.eval("ganttQtrZoom")===false, "both toggles default off");

  // ---- 1. active only ----
  w=await boot("https://x.test/?ganttActive=1&token=t"); w.eval(FIX);
  ok(w.eval("ganttActiveOnly")===true, "?ganttActive=1 seeds the toggle");
  r=rows(w);
  ok(has(r,'live'), "active-only keeps an in-window objective");
  ok(!has(r,'old'), "...drops an objective whose window is long past");
  ok(!has(r,'Dead init'), "...and drops the initiative holding ONLY that objective (the ancestor prune)");
  ok(has(r,'Live init'), "...while an initiative with a live objective stays");

  // ---- (c): a TAGGED objective is in the quarter whatever its dates say ----
  w=await boot("https://x.test/?ganttQuarter=1&token=t"); w.eval(FIX);
  w.eval(`(function(){ var Q=window.__Q;
    // tagged this quarter, but planned entirely a year earlier — the case Corey hit
    portfolio.initiatives.push({id:'INI-TAG',divisionId:'DIV-FC',name:'Tag init',plannedStart:Q.lo-400,plannedEnd:Q.lo-300});
    portfolio.objectives.push({id:'OBJ-TAG',divisionId:'DIV-FC',initiativeId:'INI-TAG',statement:'tagged',
      quarter:currentQuarter(), plannedStart:Q.lo-400, plannedEnd:Q.lo-300});
    // NOT tagged, and only grazes the quarter by 3 days
    portfolio.initiatives.push({id:'INI-GRAZE',divisionId:'DIV-FC',name:'Graze init',plannedStart:Q.lo-60,plannedEnd:Q.lo+2});
    portfolio.objectives.push({id:'OBJ-GRAZE',divisionId:'DIV-FC',initiativeId:'INI-GRAZE',statement:'graze',
      plannedStart:Q.lo-60, plannedEnd:Q.lo+2});
    // NOT tagged, overlaps by exactly 7 days
    portfolio.initiatives.push({id:'INI-SEVEN',divisionId:'DIV-FC',name:'Seven init',plannedStart:Q.lo-60,plannedEnd:Q.lo+6});
    portfolio.objectives.push({id:'OBJ-SEVEN',divisionId:'DIV-FC',initiativeId:'INI-SEVEN',statement:'seven',
      plannedStart:Q.lo-60, plannedEnd:Q.lo+6}); })()`);
  r=rows(w);
  ok(has(r,'tagged'), "an objective TAGGED this quarter shows even though its dates are a year off");
  ok(has(r,'Tag init'), "...and its initiative survives, though the initiative's OWN dates miss the quarter entirely");
  ok(!has(r,'graze'), "an untagged objective overlapping by only 3 days is dropped (grazing is not being in it)");
  ok(!has(r,'Graze init'), "...and its initiative goes with it");
  ok(has(r,'seven'), "an untagged objective overlapping by exactly 7 days is kept");
  ok(w.eval("GANTT_MIN_OVERLAP")===7, "the minimum overlap is 7 days");
  ok(w.eval("(function(){var q=ganttQuarterWindow(); var qr=RD.quarterRange(currentQuarter());"
           +"return q.qlo===isoToDay(qr.start) && q.qhi===isoToDay(qr.end);})()"),
     "membership is judged against the quarter ITSELF, unbuffered");
  ok(w.eval("(function(){var q=ganttQuarterWindow(); var qr=RD.quarterRange(currentQuarter());"
           +"return q.lo===isoToDay(qr.start)-7 && q.hi===isoToDay(qr.end)+7;})()"),
     "...while the AXIS still carries a week of slack each side");

  // ---- 2. quarter zoom ----
  w=await boot("https://x.test/?ganttQuarter=1&token=t"); w.eval(FIX);
  ok(w.eval("ganttQtrZoom")===true, "?ganttQuarter=1 seeds the toggle");
  r=rows(w);
  ok(has(r,'long'), "quarter zoom KEEPS a bar that spans the quarter (clipped, not dropped)");
  ok(!has(r,'old'), "...drops a row with no overlap at all");
  ok(has(r,'live'), "...keeps a row inside the quarter");

  // the axis is pinned to the quarter, not to the data
  // the gridlines are .ggrid, and only ticks INSIDE [lo,hi] are drawn — so their count tracks the axis span
  w=await boot("https://x.test/?token=t"); w.eval(FIX); w.eval("renderGantt();");
  const wide=w.eval("document.querySelectorAll('#ganttWrap .ggrid').length");
  w=await boot("https://x.test/?ganttQuarter=1&token=t"); w.eval(FIX); w.eval("renderGantt();");
  const narrow=w.eval("document.querySelectorAll('#ganttWrap .ggrid').length");
  ok(wide>0, "the unzoomed axis draws gridlines at all (guards against 0<0 passing for the wrong reason)");
  ok(narrow<wide, "the axis spans fewer gridlines when pinned to one quarter than when spanning all the data");

  // ---- together ----
  w=await boot("https://x.test/?ganttActive=1&ganttQuarter=1&token=t"); w.eval(FIX);
  r=rows(w);
  ok(w.eval("ganttActiveOnly")===true && w.eval("ganttQtrZoom")===true, "both params compose");
  ok(has(r,'live'), "together: an active in-quarter objective survives");
  ok(!has(r,'old'), "together: the finished, out-of-quarter objective is gone");
  ok(has(r,'long'), "together: an ACTIVE objective overlapping the quarter survives even though it runs off both ends");

  // ---- the toggles themselves ----
  w=await boot("https://x.test/?token=t"); w.eval(FIX); w.eval("renderGantt();");
  const btn=(k)=>w.document.querySelector(`#ganttLevelBar [data-gview=${k}]`);
  ok(!!btn('active') && !!btn('quarter'), "both toggles render in the gantt bar");
  ok(btn('quarter').textContent.indexOf(w.eval("currentQuarter()"))>=0, "the quarter toggle names the actual quarter");
  ok(!btn('active').classList.contains('on'), "a toggle is unstyled when off");
  btn('active').click();
  ok(w.eval("ganttActiveOnly")===true, "clicking the toggle flips the state");
  ok(w.document.querySelector('#ganttLevelBar [data-gview=active]').classList.contains('on'),
     "...and the button repaints as engaged (the bar is rebuilt, so it cannot go stale)");
  r=[...w.document.querySelectorAll('#ganttWrap .grow')].map(x=>x.textContent);
  ok(!has(r,'old'), "...and the chart actually re-filters");
  w.document.querySelector('#ganttLevelBar [data-gview=active]').click();
  ok(w.eval("ganttActiveOnly")===false, "clicking again turns it off");
  ok(!w.document.querySelector('#ganttLevelBar [data-gview=active]').classList.contains('on'), "...and unstyles");

  // the toggles are gantt-only
  w=await boot("https://x.test/?token=t"); w.eval(FIX);
  ok(w.eval("levelBarHtml('gantt')").indexOf('data-gview')>=0, "the gantt bar carries the toggles");
  ok(w.eval("levelBarHtml('portfolio')").indexOf('data-gview')<0, "...and no other tab does");

  // ---- COREY'S URL: param names are case-INSENSITIVE (?ganttquarter=1 silently did nothing before) ----
  w=await boot("https://x.test/?tab=gantt&ganttquarter=1&token=t"); w.eval(FIX);
  ok(w.eval("ganttQtrZoom")===true, "?ganttquarter=1 (lowercase) works — the exact URL that did nothing before");
  w=await boot("https://x.test/?ganttactive=1&token=t"); w.eval(FIX);
  ok(w.eval("ganttActiveOnly")===true, "?ganttactive=1 (lowercase) works too");
  w=await boot("https://x.test/?GANTTQUARTER=1&token=t"); w.eval(FIX);
  ok(w.eval("ganttQtrZoom")===true, "...and SHOUTING works");
  w=await boot("https://x.test/?DIVISION=DIV-FC&token=t"); w.eval(FIX);
  ok(w.eval("pfFilters.division")==='DIV-FC', "the leniency is general: ?DIVISION= is found");
  ok(w.eval("pfFilters.division")!=='div-fc', "...while the VALUE stays exact (DIV-FC is an id, case matters)");
  w=await boot("https://x.test/?ganttQuarter=0&token=t"); w.eval(FIX);
  ok(w.eval("ganttQtrZoom")===false, "=0 is off, not merely present");
  w=await boot("https://x.test/?ganttQuarter=false&token=t"); w.eval(FIX);
  ok(w.eval("ganttQtrZoom")===false, "=false is off too");
  w=await boot("https://x.test/?ganttQuarter&token=t"); w.eval(FIX);
  ok(w.eval("ganttQtrZoom")===true, "a bare ?ganttQuarter is on");

  // ---- the +/-7 day buffer: quarter-boundary slop must not amputate bars ----
  w=await boot("https://x.test/?ganttQuarter=1&token=t");
  w.eval(FIX);
  w.eval(`(function(){ var Q=window.__Q;
    portfolio.initiatives.push({id:'INI-SPILL',divisionId:'DIV-FC',name:'Spill init',plannedStart:Q.hi-20,plannedEnd:Q.hi+3});
    // ends 3 days into the NEXT quarter — classic date-mismatch slop
    portfolio.objectives.push({id:'OBJ-SPILL',divisionId:'DIV-FC',initiativeId:'INI-SPILL',statement:'spill',
      plannedStart:Q.hi-20, plannedEnd:Q.hi+3});
    // starts entirely 30 days AFTER the quarter + buffer -> genuinely out
    portfolio.initiatives.push({id:'INI-FAR',divisionId:'DIV-FC',name:'Far init',plannedStart:Q.hi+40,plannedEnd:Q.hi+60});
    portfolio.objectives.push({id:'OBJ-FAR',divisionId:'DIV-FC',initiativeId:'INI-FAR',statement:'far',
      plannedStart:Q.hi+40, plannedEnd:Q.hi+60}); })()`);
  r=rows(w);
  ok(has(r,'spill'), "a bar ending 3 days into the next quarter is present");
  ok(!has(r,'far'), "...while one starting 40 days out is still dropped");
  // the buffer's real job: the bar must FIT the track, not be amputated at the boundary
  const rightEdge=()=>w.eval(`(function(){
      var rows=[].slice.call(document.querySelectorAll('#ganttWrap .grow'));
      var row=rows.filter(function(x){return x.textContent.indexOf('spill')>=0;})[0];
      if(!row) return null;
      var bar=row.querySelector('.gbar,[class*=gbar]'); if(!bar) return null;
      return parseFloat(bar.style.left||'0')+parseFloat(bar.style.width||'0');
    })()`);
  const edgeBuffered=rightEdge();
  ok(edgeBuffered!=null, "the spill row renders a bar");
  ok(edgeBuffered<=720+0.5, "...whose right edge FITS the 720px track — the 7-day buffer saved it from clipping");
  ok(w.eval("GANTT_QBUF")===7, "the buffer is 7 days");
  ok(w.eval("(function(){var q=ganttQuarterWindow(); var qr=RD.quarterRange(currentQuarter());"
           +"return q.lo===isoToDay(qr.start)-7 && q.hi===isoToDay(qr.end)+7;})()"),
     "the window is the quarter widened by 7 days on each side");
  // Prove the assertion above is real: with the buffer removed the SAME bar overflows the track. Must
  // re-render after stubbing — reading the DOM alone would just re-measure the old bars. Done LAST, because
  // the stub replaces ganttQuarterWindow for good.
  w.eval("ganttQuarterWindow=function(){ var q=currentQuarter(), qr=RD.quarterRange(q);"
        +"var a=isoToDay(qr.start), b=isoToDay(qr.end);"
        +"return {name:q, qlo:a, qhi:b, lo:a, hi:b}; }; renderGantt();");
  const edgeUnbuffered=rightEdge();
  ok(edgeUnbuffered!=null && edgeUnbuffered>720,
     "...and without the buffer it overflows the track, so the fit above is the buffer's doing");
  w=await boot("https://x.test/?token=t"); w.eval(FIX);
  ok(w.eval("ganttQuarterWindow()")===null, "with the toggle off there is no window at all");

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} gantt view-toggle assertions green`);
  process.exit(fl.length?1:0);
})();
