const fs=require('fs'); const RD=require('./core.js');
let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.error('FAIL: '+m); } }
const html=fs.readFileSync('/mnt/user-data/outputs/execution_app.html','utf8');
const m=html.match(/function migrateStageGateSets\(x\)\{([\s\S]*?)\n\}/);
if(!m){ console.error('migrateStageGateSets not found in built file'); process.exit(1); }
const migrate=new Function('RD','x', m[1]);
ok(typeof RD.allocId==='function','core exports allocId (migration dependency)');

// case 1: gates, no sets -> a default set per objective, every gate assigned, chained on
let d1={ stageGates:[ {id:'g1',objectiveId:'O1'}, {id:'g2',objectiveId:'O1'}, {id:'g3',objectiveId:'O2'} ] };
migrate(RD, d1);
ok(Array.isArray(d1.stageGateSets) && d1.stageGateSets.length===2, 'one default set per objective (2)');
ok(d1.stageGates.every(g=>g.setId), 'every gate got a setId');
const o1set=d1.stageGateSets.find(s=>s.objectiveId==='O1');
ok(o1set && d1.stageGates.filter(g=>g.objectiveId==='O1').every(g=>g.setId===o1set.id), 'O1 gates -> the O1 default set');
ok(o1set.name==='General' && o1set.chained===true, 'default set: name General, chained ON');

// case 2: existing set (chained:false) + a gate with a stale setId
let d2={ stageGates:[ {id:'g1',objectiveId:'O1',setId:'setX'}, {id:'g2',objectiveId:'O1',setId:'GHOST'} ], stageGateSets:[ {id:'setX',objectiveId:'O1',name:'MEA',chained:false} ] };
migrate(RD, d2);
ok(d2.stageGateSets.length===1, 'existing set kept, no duplicate');
ok(d2.stageGates.find(g=>g.id==='g1').setId==='setX', 'valid setId preserved');
ok(d2.stageGates.find(g=>g.id==='g2').setId==='setX', 'stale setId reassigned to default');
ok(d2.stageGateSets[0].chained===true, 'chaining FORCED on (was false)');

// case 3: idempotent
let snap=JSON.stringify(d1); migrate(RD, d1); ok(JSON.stringify(d1)===snap, 'migration is idempotent');

// case 4: no gates -> no sets, no crash
let d4={ stageGates:[] }; migrate(RD, d4); ok(Array.isArray(d4.stageGateSets)&&d4.stageGateSets.length===0, 'no gates -> no sets, no crash');

console.log(fail? (fail+' FAILED') : ('PASS — '+pass+' assertions green'));
process.exit(fail?1:0);
