const C=require('./core.js'); let n=0,f=0;
const ok=(c,m)=>{n++; if(!c){f++; console.log('FAIL:',m);}};
const ex={ D:{ keyResults:[],
  kpis:[
    {id:'Kf1',hostType:'stageGate',hostId:'gFull',objectiveId:'O',name:'V',direction:'up',target:10},
    {id:'Kf2',hostType:'stageGate',hostId:'gFull',objectiveId:'O',name:'I',direction:'up',target:20},
    {id:'Kp1',hostType:'stageGate',hostId:'gPart',objectiveId:'O',name:'V',direction:'up',target:10} ],
  kpiUpdates:[ {kpiId:'Kf1',value:10,timestamp:1}, {kpiId:'Kf2',value:20,timestamp:1}, {kpiId:'Kp1',value:5,timestamp:1} ],
  stageGates:[{id:'gFull',objectiveId:'O'},{id:'gPart',objectiveId:'O'},{id:'gNone',objectiveId:'O'}] } };
ok(C.stageGateScore('gFull',ex)===100,'all KPIs at target -> score 100');
ok(C.stageGateScore('gPart',ex)===50,'half -> score 50');
ok(C.stageGateScore('gNone',ex)===null,'no KPIs -> score null (guard)');
ok(C.gateAtTarget('gFull',ex)===true, 'gateAtTarget true when all at target');
ok(C.gateAtTarget('gPart',ex)===false,'gateAtTarget false when partial');
ok(C.gateAtTarget('gNone',ex)===false,'gateAtTarget false when no KPIs (0/0 guard: null !== 100) — no phantom auto-complete');
console.log(f?`\n${f}/${n} FAILED`:`\nPASS — ${n} gate auto-complete predicate assertions green`);
