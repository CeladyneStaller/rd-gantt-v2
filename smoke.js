// DOM smoke test for q-tracker-division.html
//
// The CORE harness (verify1.py) runs the pure, DOM-free functions. This
// evaluates the FULL page script under a minimal DOM stub and exercises the
// impure layer — init, the render pipeline, the add/edit modal, a broker
// GET /state pull, and broker writes (incl. the 409 -> overwrite flow) — so
// runtime / wiring errors are caught before ship. Everything goes through the
// broker now; there is no direct-JSONBin path.

const fs = require('fs'), path = require('path');
const HTML = path.join(__dirname, 'q-tracker-division.html');

const elById = {};
function makeEl(id){
  return {
    id, style:{}, className:'', _text:'', innerHTML:'', disabled:false,
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){}, getAttribute(){ return null; }, addEventListener(){},
    appendChild(){}, querySelector(){ return makeEl('q'); }, querySelectorAll(){ return []; },
    get textContent(){ return this._text; }, set textContent(v){ this._text = v; },
    get value(){ return this._val || ''; }, set value(v){ this._val = v; }, focus(){}
  };
}
global.document = {
  getElementById(id){ if(!elById[id]) elById[id] = makeEl(id); return elById[id]; },
  querySelector(){ return makeEl('qs'); }, querySelectorAll(){ return []; },
  createElement(){ return makeEl('c'); }, addEventListener(){}, body: makeEl('body')
};
global.window = {
  location:{ search:'', pathname:'/q-tracker-division.html', hash:'' },
  history:{ replaceState(st, t, url){ var q = String(url).split('?')[1] || ''; q = q.split('#')[0]; global.window.location.search = q ? '?' + q : ''; } },
  addEventListener(){}, matchMedia(){ return { matches:false, addEventListener(){} }; }
};
global.localStorage = { _d:{}, getItem(k){ return this._d[k] || null; }, setItem(k,v){ this._d[k] = v; }, removeItem(k){ delete this._d[k]; } };
global.navigator = { onLine:true };
global.setInterval = () => 0;
global.setTimeout = () => 0;
global.URLSearchParams = URLSearchParams;

/* The /state payload the stubbed broker returns. */
function stateDoc(){
  return {
    ok:true,
    hub:{
      _version:1,
      products:[{ id:'P', name:'Prod', division:'fuelcell', models:[{ id:'M', name:'Gen1' }] }],
      importAssociations:{ '50':['fc_2'] },
      importProductAssoc:{ 'fc_2':{ productLine:'P', productModel:'M' } },
      projects:[
        { id:50, projectType:'initiative', division:'fuelcell', name:'Init' },
        { id:9,  projectType:'milestone',  division:'fuelcell', name:'MS', end:'2026-05-01', milestone:true }
      ]
    },
    divisions:{
      fuelcell:{ _version:1, projects:[{ id:2, projectType:'objective', division:'fuelcell', name:'Obj', keyResults:[{ trackingType:'percentage', progress:50 }] }] }
    }
  };
}

global.__validFetch = false;
global.__puts = [];             /* any direct JSONBin PUT would land here (there should be none) */
global.__brokerCalls = [];      /* captured broker POST/PATCH requests */
global.__brokerNext409 = false; /* when true, the next broker write returns 409 */
global.fetch = async (url, opts) => {
  const method = (opts && opts.method) || 'GET';
  if(method === 'POST' || method === 'PATCH'){            /* broker writes */
    global.__brokerCalls.push({ url:String(url), method, body: (opts && opts.body) ? JSON.parse(opts.body) : null });
    if(global.__brokerNext409){
      global.__brokerNext409 = false;
      return { ok:false, status:409, json: async () => ({ ok:false, error:'conflict', current:{ name:'Theirs', rev:7 } }) };
    }
    return { ok:true, status:200, json: async () => ({ ok:true, id:'fc_2', rev:5, version:{ fuelcell:2 } }) };
  }
  if(method === 'PUT'){ global.__puts.push(String(url)); return { ok:true, status:200, json: async () => ({}) }; }
  if(method === 'GET' && String(url).indexOf('/state') !== -1){   /* broker read */
    if(!global.__validFetch) return { ok:false, status:0, json: async () => ({}) };
    return { ok:true, status:200, json: async () => stateDoc() };
  }
  return { ok:false, status:404, json: async () => ({}) };
};

const src = fs.readFileSync(HTML, 'utf8');
const code = [...src.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/application\/json/.test(m[1]))
  .map(m => m[2])
  .sort((a, b) => b.length - a.length)[0];

const exercise = `
;(function(){
  /* seed a render directly (assembleState is exercised via the /state pull below) */
  _loadedDivisions = ['fuelcell']; _hubLoaded = true;
  _projectsCache = [
    { id:50, projectType:'initiative', division:'fuelcell', name:'Init', productLine:'P' },
    { id:'fc_1', projectType:'objective', division:'fuelcell', parentId:null, name:'Obj', keyResults:[{ trackingType:'percentage', progress:60 }] },
    { id:201, projectType:'milestone', division:'fuelcell', name:'MS', end:'2026-05-01' }
  ];
  rebuildAndRender();
  if(document.getElementById('dashboard').style.display !== '') throw new Error('dashboard did not un-hide after render');
  ['overall','fuelcell','electrolyzer'].forEach(function(v){ buildDivisionModel(_projectsCache, v === 'overall' ? null : v, null); });
  _catalog = [{ id:'P', name:'Prod', division:'fuelcell', models:[{ id:'M', name:'Gen1' }] }];
  openAddModal();
  setAddType('milestone'); setAddType('initiative'); setAddType('objective');
  addDivisionChanged();

  global.__runFetchTest = async function(){
    localStorage.setItem('qdivision-gantt', JSON.stringify({ brokerUrl:'https://broker.test', brokerToken:'tok' }));
    if(!brokerEnabled()) throw new Error('brokerEnabled false after setting URL + token');
    var ok = await fetchAll(true);
    if(!ok) throw new Error('fetchAll returned false on a valid /state: ' + _lastFetchError);
    if(document.getElementById('dashboard').style.display !== '') throw new Error('dashboard not shown after fetchAll');
    if(!(_projectsCache && _projectsCache.length)) throw new Error('no projects after fetchAll');
    if(_loadedDivisions.indexOf('fuelcell') < 0) throw new Error('fuelcell not in loaded divisions after fetchAll');
    if(!_hubLoaded) throw new Error('hub not flagged loaded after fetchAll');
    if(!findProjectById(_projectsCache, 'fc_2')) throw new Error('objective fc_2 not assembled from /state');
    return true;
  };

  global.__runBrokerWriteTest = async function(){
    /* objective edit -> PATCH /objective/fc_2 on the broker, and NO direct PUT */
    var putsBefore = global.__puts.length;
    global.__brokerCalls = [];
    openEditModal('fc_2');
    if(_editTarget !== 'fc_2') throw new Error('openEditModal did not set edit target for objective');
    document.getElementById('add-name').value = 'Broker edited';
    await submitAdd();                                  /* arm */
    if(!_addArmed) throw new Error('edit submit did not arm');
    await submitAdd();                                  /* confirm -> brokerWrite */
    if(global.__puts.length !== putsBefore) throw new Error('a direct PUT was issued (legacy path not removed)');
    var patched = global.__brokerCalls.filter(function(c){ return c.method === 'PATCH' && c.url.indexOf('/objective/fc_2') !== -1; });
    if(!patched.length) throw new Error('brokered objective edit did not PATCH /objective/fc_2');

    /* initiative edit -> PATCH /initiative/50 */
    global.__brokerCalls = [];
    openEditModal('50');
    if(_editTarget !== '50') throw new Error('openEditModal did not set edit target for initiative');
    document.getElementById('add-name').value = 'Init edited';
    await submitAdd(); await submitAdd();
    if(!global.__brokerCalls.filter(function(c){ return c.method === 'PATCH' && c.url.indexOf('/initiative/50') !== -1; }).length) throw new Error('initiative edit did not PATCH /initiative/50');

    /* a 409 must arm overwrite and capture the server's rev */
    global.__brokerCalls = [];
    global.__brokerNext409 = true;
    openEditModal('fc_2');
    document.getElementById('add-name').value = 'Conflict edit';
    await submitAdd();                                  /* arm */
    await submitAdd();                                  /* confirm -> 409 */
    if(!_pendingOverwrite) throw new Error('409 did not set _pendingOverwrite');
    if(_conflictRev !== 7) throw new Error('409 did not capture server rev (got ' + _conflictRev + ')');

    /* the overwrite click resends baseRev = the server rev, then clears the flag */
    global.__brokerCalls = [];
    await submitAdd();                                  /* already armed -> overwrite */
    var ow = global.__brokerCalls.filter(function(c){ return c.method === 'PATCH'; });
    if(!ow.length) throw new Error('overwrite did not PATCH');
    if(ow[0].body.baseRev !== 7) throw new Error('overwrite did not send server rev as baseRev (got ' + ow[0].body.baseRev + ')');
    if(_pendingOverwrite) throw new Error('overwrite success did not clear _pendingOverwrite');

    /* create -> POST /objective on the broker */
    global.__brokerCalls = [];
    openAddModal(); setAddType('objective');
    document.getElementById('add-division').value = 'fuelcell';
    document.getElementById('add-name').value = 'New via broker';
    await submitAdd();                                  /* arm */
    await submitAdd();                                  /* confirm -> POST */
    var posted = global.__brokerCalls.filter(function(c){ return c.method === 'POST' && c.url.slice(-10) === '/objective'; });
    if(!posted.length) throw new Error('brokered create did not POST /objective');
    return true;
  };
  global.__runDefaultUrlTest = async function(){
    /* token only, no brokerUrl -> brokerBase() must fall back to DEFAULT_BROKER_URL
       and the tracker must connect against it */
    localStorage.setItem('qdivision-gantt', JSON.stringify({ brokerToken:'tok' }));
    if(!brokerEnabled()) throw new Error('brokerEnabled false with token + default URL');
    if(brokerBase() !== DEFAULT_BROKER_URL) throw new Error('brokerBase did not fall back to DEFAULT_BROKER_URL (got ' + brokerBase() + ')');
    global.__brokerCalls = [];
    var ok = await fetchAll(true);
    if(!ok) throw new Error('fetchAll failed against the default URL: ' + _lastFetchError);
    if(!findProjectById(_projectsCache, 'fc_2')) throw new Error('default-URL fetch did not assemble fc_2');
    return true;
  };
  global.__runTokenParamTest = async function(){
    /* an embed URL carrying ?token= seeds the broker token, then strips the
       param from the URL while keeping the other params (view) intact */
    localStorage.setItem('qdivision-gantt', JSON.stringify({}));   /* no stored token */
    global.window.location.search = '?token=embedtok&view=fuelcell';
    applyUrlAndSettings();
    if(loadSettings().brokerToken !== 'embedtok') throw new Error('?token= did not seed the broker token');
    if(!brokerEnabled()) throw new Error('brokerEnabled false after ?token= seeded the token');
    if(global.window.location.search.indexOf('token') !== -1) throw new Error('token param not stripped from URL (' + global.window.location.search + ')');
    if(global.window.location.search.indexOf('view=fuelcell') === -1) throw new Error('stripping token also dropped the view param');
    global.window.location.search = '';
    return true;
  };
  global.__smokeOK = true;
})();`;

try {
  eval(code + exercise);
} catch(e){
  console.log('SMOKE FAIL (sync):', e.message);
  console.log((e.stack || '').split('\n').slice(0, 3).join('\n'));
  process.exit(1);
}

(async () => {
  try {
    if(!global.__smokeOK) throw new Error('sync exercise did not complete');
    global.__validFetch = true;
    await global.__runFetchTest();
    await global.__runBrokerWriteTest();
    await global.__runDefaultUrlTest();
    await global.__runTokenParamTest();
    console.log('SMOKE OK (init + render + add/edit modal + broker /state pull + broker writes + 409 overwrite + default URL + ?token= embed)');
    process.exit(0);
  } catch(e){
    console.log('SMOKE FAIL (async):', e.message);
    console.log((e.stack || '').split('\n').slice(0, 3).join('\n'));
    process.exit(1);
  }
})();