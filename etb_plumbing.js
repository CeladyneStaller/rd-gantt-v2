var __etbSaveTimer=null, __etbMaxTimer=null, __etbSuppressSave=true, __etbSaveChain=Promise.resolve();   // START suppressed: no ETB save until the initial broker load completes (else the empty tree clobbers the saved one)
var ETB_SAVE_DEBOUNCE_MS=700, ETB_SAVE_MAXWAIT_MS=2500;   // mirror the app's persist() timings
function __etbClearSaveTimers(){ if(__etbSaveTimer){ clearTimeout(__etbSaveTimer); __etbSaveTimer=null; } if(__etbMaxTimer){ clearTimeout(__etbMaxTimer); __etbMaxTimer=null; } }
// serialize writes so a debounced save and a flush can never overlap (no self-inflicted 412);
// each ETB.saveActive is already a read-modify-write against its per-division doc's etag.
function __etbRunSave(){ __etbClearSaveTimers(); __etbSaveChain=__etbSaveChain.then(function(){ try{ if(window.ETB && ETB.saveActive) return ETB.saveActive(); }catch(e){} return false; }).catch(function(){ return false; }); return __etbSaveChain; }
function etbScheduleSave(){
  if(__etbSuppressSave) return;
  if(__etbSaveTimer) clearTimeout(__etbSaveTimer);
  __etbSaveTimer=setTimeout(__etbRunSave, ETB_SAVE_DEBOUNCE_MS);                    // debounce: save shortly after the last action
  if(!__etbMaxTimer) __etbMaxTimer=setTimeout(__etbRunSave, ETB_SAVE_MAXWAIT_MS);   // hard cap: force a save during continuous editing
}
// flush a pending write now (a pending timer == an unsaved change); otherwise just wait out any in-flight write
function etbFlushSave(){ if(__etbSaveTimer || __etbMaxTimer) return __etbRunSave(); return __etbSaveChain; }
window.__etbOnChange = function(){
  try{ if(typeof renderExpSummary==="function") renderExpSummary(); }catch(e){}   // keep the host current-step panel in sync
  if(__etbSuppressSave) return;                                                    // don't write during the initial load (else the empty tree clobbers the saved one)
  try{
    if(window.ETB && ETB.exportActive){
      var __s = ETB.exportActive();
      if(__s && __s.pid!=null && __s.tree){ if(!exec.etbTrees) exec.etbTrees={}; exec.etbTrees[__s.pid] = __s.tree; }   // active tree → divisional exec doc (in memory, always current)
    }
  }catch(e){}
  try{ if(typeof persist==="function") persist(); }catch(e){}          // debounced EXEC-<div> write; host owns flush / beforeunload / serialize
};