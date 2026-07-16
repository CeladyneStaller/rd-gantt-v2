// Modal click-off dismissal is disabled globally: a backdrop click must NOT reach the overlay's own
// close handler. Adding the overlay id to CLICKOFF_OK restores it. Verified for all three apps.
const {JSDOM, VirtualConsole}=require("jsdom"); const fs=require("fs");
function mocks(){ return { runScripts:"dangerously", virtualConsole:new VirtualConsole(), url:"https://x.test/?token=t", pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}); w.requestAnimationFrame=cb=>setTimeout(cb,0); w.cancelAnimationFrame=()=>{}; w.fetch=()=>Promise.reject(new Error('no net')); w.cytoscape=function(){return {on(){},ready(cb){try{cb&&cb();}catch(e){}},fit(){},resize(){},destroy(){},getElementById(){return{length:0};},zoom(){return 1;},width(){return 800;},height(){return 560;},layout(){return{run(){}};},$(){return{unselect(){}};}};}; } }; }
function testApp(path, overlayId){
  return new Promise((resolve)=>{
    const dom=new JSDOM(fs.readFileSync(path,'utf8'), mocks()); const w=dom.window;
    setTimeout(()=>{ const d=w.document, sc=d.createElement('script');
      sc.textContent=`(function(){ var out=[]; function ok(c,m){ out.push((c?'ok  ':'FAIL ')+m); }
       try{
        var ov=document.getElementById('${overlayId}');
        ok(!!ov, 'overlay ${overlayId} exists');
        if(ov){
          var reached=false; ov.addEventListener('click', function(){ reached=true; });
          ov.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
          ok(reached===false, 'click-off DISABLED: a backdrop click on ${overlayId} is swallowed (never reaches its close handler)');
          reached=false; CLICKOFF_OK.add('${overlayId}');
          ov.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
          ok(reached===true, 're-enable: adding ${overlayId} to CLICKOFF_OK lets the backdrop click through again');
          // a click on modal CONTENT (not the backdrop) is never intercepted
          CLICKOFF_OK.delete('${overlayId}');
          var inner=document.createElement('button'); ov.appendChild(inner); var innerReached=false; inner.addEventListener('click', function(){ innerReached=true; });
          inner.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
          ok(innerReached===true, 'a click on modal content still works (only the backdrop itself is gated)');
        }
       }catch(e){ ok(false,'threw: '+e.message); }
       document.body.setAttribute('data-out', JSON.stringify(out));
      })();`;
      d.body.appendChild(sc);
      setTimeout(()=>resolve(JSON.parse(d.body.getAttribute('data-out')||'[]')), 250);
    }, 450);
  });
}
(async ()=>{
  const O=(process.env.RD_OUT||'/mnt/user-data/outputs')+'/';
  let all=[];
  all=all.concat((await testApp(O+'execution_app.html','modalOverlay')).map(x=>'[exec] '+x));
  all=all.concat((await testApp(O+'planning_app.html','delModal')).map(x=>'[plan] '+x));
  all=all.concat((await testApp(O+'product_designer.html','modalOverlay')).map(x=>'[prod] '+x));
  all.forEach(l=>{ if(l.indexOf('FAIL')>=0) console.log(l); });
  const fl=all.filter(x=>x.indexOf('FAIL')>=0);
  console.log(fl.length?`\n${fl.length}/${all.length} FAILED`:`\nPASS — ${all.length} click-off assertions green (all 3 apps)`);
  process.exit(fl.length?1:0);
})();
