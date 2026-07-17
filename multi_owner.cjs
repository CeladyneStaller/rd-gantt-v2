// Objectives can have several owners (roster emails). owner fans out when grouping: an objective owned by two
// people appears under BOTH. Legacy free-text owners keep working untouched.
const C=require((process.env.RD_SRC||'/home/claude')+'/rdcore.js');
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
const out=[]; const ok=(c,m)=>out.push((c?'ok  ':'FAIL ')+m);

// ---- ownersOf: tolerant of both shapes, no migration ----
ok(JSON.stringify(C.ownersOf({owner:["a@x.com","b@x.com"]}))==='["a@x.com","b@x.com"]', 'an array of owners reads back as a list');
ok(JSON.stringify(C.ownersOf({owner:"Corey"}))==='["Corey"]', 'a LEGACY free-text owner reads as a one-element list');
ok(JSON.stringify(C.ownersOf({owner:""}))==='[]' && JSON.stringify(C.ownersOf({}))==='[]', 'blank/absent owner is an empty list');
ok(JSON.stringify(C.ownersOf({owner:["a@x.com","",null]}))==='["a@x.com"]', 'empty entries are dropped');
ok(JSON.stringify(C.ownersOf(null))==='[]', 'a null record does not throw');

// ---- grouping fans out ----
const pf={ divisions:[{id:'D1',name:'D'}], products:[], models:[], initiatives:[], objectives:[], kpis:[], milestones:[] };
const objs=[
  {id:'O1',divisionId:'D1',statement:'shared',owner:['corey@x.com','erin@x.com']},
  {id:'O2',divisionId:'D1',statement:'corey only',owner:['corey@x.com']},
  {id:'O3',divisionId:'D1',statement:'legacy',owner:'Toru'},
  {id:'O4',divisionId:'D1',statement:'unowned'},
];
const g=C.groupObjectives(objs,['owner'],pf);
const byKey={}; g.forEach(n=>byKey[n.key]=(n.objs||[]).map(o=>o.id));
ok(byKey['corey@x.com'] && byKey['corey@x.com'].indexOf('O1')>=0 && byKey['corey@x.com'].indexOf('O2')>=0,
   "Corey's group holds both the shared objective and his own");
ok(byKey['erin@x.com'] && byKey['erin@x.com'].join()==='O1', "Erin's group holds the SHARED objective — it fanned out");
ok(byKey['Toru'] && byKey['Toru'].join()==='O3', 'a legacy free-text owner still groups under itself');
ok(byKey[''] && byKey[''].join()==='O4', 'an unowned objective lands in the none bucket');
ok(g[0].key==='', 'the none bucket is still ordered first');
// the shared objective is in two groups on purpose
const appearances=g.reduce((n,x)=>n+((x.objs||[]).some(o=>o.id==='O1')?1:0),0);
ok(appearances===2, 'the shared objective appears in exactly two groups (fan-out, by design)');
ok(objs.length===4, '...and fanning out did not mutate the source list');

// a duplicate owner must not double-list the objective inside one group
const dup=C.groupObjectives([{id:'O9',divisionId:'D1',owner:['a@x.com','a@x.com']}],['owner'],pf);
ok(dup.filter(n=>n.key==='a@x.com')[0].objs.length===1, 'a duplicated owner does not list the objective twice in one group');

// other dimensions are untouched by the fan-out change
const gd=C.groupObjectives(objs,['division'],pf);
ok(gd.length===1 && gd[0].objs.length===4, 'grouping by division still puts every objective in exactly one group');
// nested: owner then division
const gn=C.groupObjectives(objs,['owner','division'],pf);
const cn=gn.filter(n=>n.key==='corey@x.com')[0];
ok(cn && cn.children && cn.children[0].objs.length===2, 'fan-out composes with a nested dimension');

// ---- the editor ----
const dom=new JSDOM(fs.readFileSync((process.env.RD_OUT||'/mnt/user-data/outputs')+'/planning_app.html','utf8'),{runScripts:"dangerously",virtualConsole:new VirtualConsole(),url:"https://x.test/?token=t",pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; }});
setTimeout(()=>{ const w=dom.window;
  const t=(fn,m)=>{ try{ ok(fn(),m); }catch(e){ ok(false,m+' [threw: '+e.message+']'); } };
  w.eval(`portfolio={divisions:[{id:'D1',name:'D'}],products:[],models:[],initiatives:[],kpis:[],milestones:[],
      objectives:[{id:'O1',divisionId:'D1',statement:'s',owner:['corey@x.com','erin@x.com']},
                  {id:'O3',divisionId:'D1',statement:'legacy',owner:'Toru'}]};
    execDocs={}; roster=[{email:'corey@x.com',orgRole:'cto',leadOf:[],disabled:false},
                         {email:'erin@x.com',orgRole:'lead',leadOf:['fuel-cell'],disabled:false},
                         {email:'gone@x.com',orgRole:'user',leadOf:[],disabled:true}];`);

  t(()=>w.eval("ownerOptions().map(o=>o.id).indexOf('corey@x.com')>=0"), 'the picker offers roster users');
  t(()=>w.eval("ownerOptions().map(o=>o.id).indexOf('gone@x.com')<0"), 'a disabled user is not offered');
  t(()=>w.eval("ownerOptions().filter(o=>o.id==='Toru').length===1"), 'a legacy free-text owner is still offered, not dropped');
  t(()=>w.eval("ownerOptions().filter(o=>o.id==='Toru')[0].name.indexOf('not in roster')>0"), '...and is marked "not in roster"');
  t(()=>w.eval("ownerOptions().filter(o=>o.id==='corey@x.com')[0].name.indexOf('not in roster')<0"), '...while a roster user is not marked');

  // the editor renders a MULTI picker with the right options selected
  t(()=>{ w.eval("openEditor('O1','objective');"); const h=w.eval("document.getElementById('pfModalBody').innerHTML");
          return h.indexOf('data-f="owner"')>=0 && h.indexOf('multiple')>=0; },
    'the objective editor renders owner as a multi-select');
  t(()=>{ const h=w.eval("document.getElementById('pfModalBody').innerHTML");
          const sel=[...w.document.querySelectorAll('[data-f="owner"] option')].filter(o=>o.selected).map(o=>o.value);
          return sel.length===2 && sel.indexOf('corey@x.com')>=0 && sel.indexOf('erin@x.com')>=0; },
    'both current owners come back selected');
  t(()=>{ w.eval("openEditor('O3','objective');");
          const sel=[...w.document.querySelectorAll('[data-f="owner"] option')].filter(o=>o.selected).map(o=>o.value);
          return sel.length===1 && sel[0]==='Toru'; },
    'a legacy string owner opens with that value selected, not blanked');
  // the substring trap: a scalar reaching indexOf() would match on a prefix
  t(()=>{ w.eval("portfolio.objectives.push({id:'O5',divisionId:'D1',statement:'x',owner:'co'}); openEditor('O5','objective');");
          const sel=[...w.document.querySelectorAll('[data-f=owner] option')].filter(o=>o.selected).map(o=>o.value);
          return sel.length===1 && sel[0]==='co'; },
    'a legacy owner that is a PREFIX of a roster email does not select that email');

  out.forEach(l=>{ if(l.startsWith('FAIL')) console.log(l); });
  const fl=out.filter(x=>x.startsWith('FAIL'));
  console.log(fl.length?`\n${fl.length}/${out.length} FAILED`:`\nPASS - ${out.length} multi-owner assertions green`);
  process.exit(fl.length?1:0);
},500);
