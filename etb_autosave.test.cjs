const fs=require('fs');
let saveCount=0, saveStarts=[], saveDelay=0, t0=Date.now();
const now=()=>Date.now()-t0;
const winL={}, docL={};
global.ETB={ saveActive:function(){ saveCount++; saveStarts.push(now()); if(saveDelay>0) return new Promise(r=>setTimeout(()=>r(true),saveDelay)); return Promise.resolve(true); } };
global.window={ ETB:global.ETB, addEventListener:function(ev,fn){ (winL[ev]=winL[ev]||[]).push(fn); } };
global.document={ addEventListener:function(ev,fn){ (docL[ev]=docL[ev]||[]).push(fn); }, visibilityState:"visible" };
const block=fs.readFileSync('/tmp/etb_plumbing.js','utf8');
eval(block+"\n; global.__P={ onChange:window.__etbOnChange, flush:etbFlushSave, setSuppress:function(v){__etbSuppressSave=v;} };");
const P=global.__P;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let n=0,f=0; const ok=(c,m)=>{n++; if(!c){f++; console.error('FAIL:',m);}};

(async()=>{
  // 1) debounce coalescing: 5 rapid changes → one save
  saveCount=0; for(let i=0;i<5;i++){ P.onChange(); await sleep(50); } await sleep(900);
  ok(saveCount===1,'debounce: 5 rapid actions coalesce to 1 save (got '+saveCount+')');

  // 2) suppress: no save while suppressed
  saveCount=0; P.setSuppress(true); P.onChange(); await sleep(900); ok(saveCount===0,'suppress: no save while loading'); P.setSuppress(false);

  // 3) visibilitychange flush: a pending change flushes immediately (well before the 700ms debounce)
  saveCount=0; P.onChange(); global.document.visibilityState="hidden"; (docL.visibilitychange||[]).forEach(fn=>fn()); await sleep(50);
  ok(saveCount===1,'tab-hide flush: pending change saved immediately (got '+saveCount+' at ~'+ (saveStarts[saveStarts.length-1]||'-') +'ms)');
  global.document.visibilityState="visible";

  // 4) flush no-op when nothing pending
  saveCount=0; (docL.visibilitychange||[]).forEach(fn=>fn()); await sleep(50); ok(saveCount===0,'flush is a no-op when no change is pending');

  // 5) max-wait cap: continuous editing still forces a save by ~2500ms
  saveCount=0; let stop=false; (async()=>{ while(!stop){ P.onChange(); await sleep(200); } })();
  await sleep(2700); const savedDuringContinuous=saveCount; stop=true; await sleep(50);
  ok(savedDuringContinuous>=1,'max-wait: a save fires during continuous editing (got '+savedDuringContinuous+' by ~2700ms)');

  // 6) serialization: overlapping flushes do not run saveActive concurrently
  saveDelay=300; saveCount=0; saveStarts=[];
  P.onChange(); await P.flush?0:0; const A=P.flush();   // save A (~300ms)
  P.onChange(); const B=P.flush();                      // save B — must wait for A
  await Promise.all([A,B]); await sleep(50);
  const gap = saveStarts.length>=2 ? (saveStarts[1]-saveStarts[0]) : 0;
  ok(saveStarts.length>=2 && gap>=250,'serialization: 2nd save starts only after the 1st resolves (gap '+gap+'ms)');
  saveDelay=0;

  console.log(f?('\n'+f+' / '+n+' FAILED'):('PASS — '+n+' ETB-autosave plumbing assertions green'));
  process.exit(f?1:0);
})();
