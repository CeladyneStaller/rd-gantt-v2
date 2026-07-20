// Division-visibility gating: the Sales app shows/selects ONLY kind=biz divisions; the Execution app ONLY
// kind=rd. The gating covers the picker, the default division, a wrong-kind ?division= / remembered value, and
// programmatic switchDivision. Each app derives its kind from execId()'s prefix (BIZ- vs EXEC-), so the two
// builds stay byte-identical. Run against BOTH builds with their opposite expectations.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const OUT=(process.env.RD_OUT||'/mnt/user-data/outputs');
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

function boot(file, url){
  const HTML=fs.readFileSync(OUT+'/'+file,'utf8');
  return new Promise(res=>{
    const dom=new JSDOM(HTML,{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url,pretendToBeVisual:true,
      beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.localStorage&&w.localStorage.clear&&w.localStorage.clear(); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
    setTimeout(()=>res(dom.window),450);
  });
}

function seed(w){
  w.eval(`portfolio={
    units:[{id:'UNIT-TECH',name:'Technical',order:1},{id:'UNIT-BIZ',name:'Business',order:2}],
    divisions:[{id:'DIV-FC',name:'Fuel Cell',unitId:'UNIT-TECH',kind:'rd',order:0},
               {id:'DIV-EL',name:'Electrolyzer',unitId:'UNIT-TECH',kind:'rd',order:1},
               {id:'DIV-FIN',name:'Financial',unitId:'UNIT-BIZ',kind:'biz',order:2},
               {id:'DIV-BD',name:'Business Dev',unitId:'UNIT-BIZ',kind:'biz',order:3},
               {id:'DIV-OLD',name:'Legacy',unitId:'UNIT-TECH',order:4}]}; // no kind -> rd`);
}

// mine = the kind this app should show; other = the kind it must hide
async function checkApp(file, mine){
  const w=await boot(file, "https://x.test/?token=t"); seed(w);
  const mineIds  = mine==='biz' ? ['DIV-FIN','DIV-BD'] : ['DIV-FC','DIV-EL','DIV-OLD'];
  const otherIds = mine==='biz' ? ['DIV-FC','DIV-EL','DIV-OLD'] : ['DIV-FIN','DIV-BD'];

  ok(w.eval("appKind()")===mine, `${file}: appKind() is '${mine}' (from execId prefix)`);

  // ---- picker shows only this app's kind ----
  w.eval("divisionId='';");
  w.eval("fillDivSelect();");
  const opts=[...w.document.querySelectorAll("#divSelect option")].map(o=>o.value).filter(Boolean);
  ok(mineIds.every(id=>opts.indexOf(id)>=0), `${file}: the picker lists every ${mine} division`);
  ok(otherIds.every(id=>opts.indexOf(id)<0), `${file}: the picker hides every ${mine==='biz'?'rd':'biz'} division`);
  // a division with no explicit kind counts as rd
  if(mine==='rd') ok(opts.indexOf("DIV-OLD")>=0, `${file}: a kind-less division counts as rd and shows in the Execution app`);
  else ok(opts.indexOf("DIV-OLD")<0, `${file}: a kind-less (rd) division is hidden in the Sales app`);

  // ---- default division is one of this app's kind ----
  ok(mineIds.indexOf(w.eval("firstAppDivision()"))>=0, `${file}: firstAppDivision() returns a ${mine} division`);

  // ---- a wrong-kind ?division= is rejected, resolution falls back to this app's kind ----
  const wWrong=await boot(file, "https://x.test/?division="+otherIds[0]+"&token=t"); seed(wWrong);
  ok(wWrong.eval("resolveDivision()")===null,
     `${file}: a ?division= of the wrong kind (${otherIds[0]}) is refused by resolveDivision`);
  // a right-kind ?division= is honoured
  const wRight=await boot(file, "https://x.test/?division="+mineIds[0]+"&token=t"); seed(wRight);
  ok(wRight.eval("resolveDivision()")===mineIds[0], `${file}: a ?division= of the right kind is honoured`);

  // ---- switchDivision refuses to cross the kind boundary ----
  w.eval("divisionId='"+mineIds[0]+"';");
  w.eval("switchDivision('"+otherIds[0]+"');");   // async, but the guard returns synchronously before await
  ok(w.eval("divisionId")===mineIds[0],
     `${file}: switchDivision to a wrong-kind division is refused (stays on ${mineIds[0]})`);
}

(async()=>{
  await checkApp("execution_app.html", "rd");
  await checkApp("sales_app.html", "biz");

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} division-visibility kind-gating assertions green`);
  process.exit(fl.length?1:0);
})();
