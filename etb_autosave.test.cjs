// Focused unit test for the ETB -> divisional-exec-doc write-through wiring (__etbOnChange).
// The ETB no longer owns a broker debounce; it syncs the active tree into exec.etbTrees and
// lets the host's persist() flush EXEC-<div>. This asserts that contract.
const fs=require("fs");
const block=fs.readFileSync('/tmp/etb_plumbing.js','utf8');
let persistCalls=0; global.persist=function(){persistCalls++;};
global.exec={etbTrees:{}};
let activeTree={experiments:{X:1}}; let activePid="O1";
global.window={ ETB:{ exportActive:function(){ return {pid:activePid, tree:activeTree?JSON.parse(JSON.stringify(activeTree)):null}; } }, addEventListener:function(){} };
global.document={ addEventListener:function(){}, visibilityState:"visible" };
global.ETB=global.window.ETB;   // in a browser, bareword ETB === window.ETB (shared global)
eval(block + "\n; global.__setSuppress=function(v){__etbSuppressSave=v;};");   // block starts suppressed
let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++;console.error('FAIL:',m);} else console.log('ok:',m);};

global.__setSuppress(false);
// 1) a change syncs the active tree into the divisional exec doc, keyed by objective
persistCalls=0; global.exec.etbTrees={}; global.window.__etbOnChange();
ok(global.exec.etbTrees.O1 && global.exec.etbTrees.O1.experiments && global.exec.etbTrees.O1.experiments.X===1, "onChange writes active tree into exec.etbTrees[pid]");
// 2) ...and triggers the host persist() (which owns the EXEC-<div> write + flush)
ok(persistCalls>=1, "onChange calls host persist()");
// 3) suppressed (initial load): no write, no persist -> can't clobber the loaded tree
global.__setSuppress(true); persistCalls=0; global.exec.etbTrees={}; global.window.__etbOnChange();
ok(Object.keys(global.exec.etbTrees).length===0 && persistCalls===0, "suppressed onChange neither writes nor persists");
global.__setSuppress(false);
// 4) no active objective -> nothing keyed in (still safe)
activePid=null; persistCalls=0; global.exec.etbTrees={}; global.window.__etbOnChange(); activePid="O1";
ok(Object.keys(global.exec.etbTrees).length===0, "onChange with no active objective writes nothing");
// 5) a fresh objective id keys a second tree without dropping the first
global.exec.etbTrees={O1:{experiments:{X:1}}}; activePid="O2"; activeTree={experiments:{Y:2}}; global.window.__etbOnChange();
ok(global.exec.etbTrees.O1 && global.exec.etbTrees.O2 && global.exec.etbTrees.O2.experiments.Y===2, "second objective tree coexists in exec.etbTrees");

console.log(f?('\n'+f+' / '+n+' FAILED'):('\nPASS — '+n+' ETB write-through plumbing assertions green'));
process.exit(f?1:0);
