/* MERGE.three: the portfolio merge that runs when a save is refused because someone saved first.

     node test/merge.js
*/
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'kit', 'merge.js'), 'utf8');
const MERGE = new Function(src + '\n;return MERGE;')();

let PASS = 0, FAIL = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) PASS++; else { FAIL++; console.log('FAIL', label, '\n   got ', g, '\n   want', w); }
}
const clone = (x) => JSON.parse(JSON.stringify(x));

const base = {
  objectives: [
    { id: 'OBJ-1', statement: 'Qualify the stack', plannedEnd: 100, owners: ['a@x'] },
    { id: 'OBJ-2', statement: 'Lock components', plannedEnd: 120, owners: ['b@x'] }
  ],
  milestones: [{ id: 'MS-1', name: 'Build 2', plannedDate: 90 }],
  kpis: [],
  milestoneState: { 'MS-1': { status: 'active' } },
  divisions: [{ id: 'DIV-EL', name: 'Electrolyzer', order: 1 }]
};

/* 1. different records: both changes kept */
{
  const mine = clone(base); mine.objectives[0].statement = 'Qualify the 10-cell stack';
  const theirs = clone(base); theirs.objectives[1].plannedEnd = 127;
  const r = MERGE.three(base, mine, theirs);
  eq('different records: ok', r.ok, true);
  eq('different records: mine', r.value.objectives[0].statement, 'Qualify the 10-cell stack');
  eq('different records: theirs', r.value.objectives[1].plannedEnd, 127);
}
/* 2. different fields of one record: both kept (a finish moved from Execution survives a Planning rename) */
{
  const mine = clone(base); mine.objectives[0].statement = 'Renamed here';
  const theirs = clone(base); theirs.objectives[0].plannedEnd = 107;
  const r = MERGE.three(base, mine, theirs);
  eq('one record, two fields', [r.ok, r.value.objectives[0].statement, r.value.objectives[0].plannedEnd], [true, 'Renamed here', 107]);
}
/* 3. the same field: this page's value wins (today's Planning re-applies your change) */
{
  const mine = clone(base); mine.objectives[0].plannedEnd = 111;
  const theirs = clone(base); theirs.objectives[0].plannedEnd = 107;
  const r = MERGE.three(base, mine, theirs);
  eq('same field: mine wins', [r.ok, r.value.objectives[0].plannedEnd], [true, 111]);
}
/* 4. additions on both sides with different ids: both kept, theirs first then mine */
{
  const mine = clone(base); mine.kpis.push({ id: 'KPI-A', name: 'Mine' });
  const theirs = clone(base); theirs.kpis.push({ id: 'KPI-B', name: 'Theirs' });
  const r = MERGE.three(base, mine, theirs);
  eq('both added', [r.ok, r.value.kpis.map((k) => k.id)], [true, ['KPI-B', 'KPI-A']]);
}
/* 5. the same new id on both sides with different content: a clash */
{
  const mine = clone(base); mine.kpis.push({ id: 'KPI-A', name: 'Mine' });
  const theirs = clone(base); theirs.kpis.push({ id: 'KPI-A', name: 'Theirs' });
  const r = MERGE.three(base, mine, theirs);
  eq('id collision', r.ok, false);
}
/* 6. deletes: mine deletes an untouched record -> gone; they delete a record I didn't touch -> gone */
{
  const mine = clone(base); mine.objectives = mine.objectives.filter((o) => o.id !== 'OBJ-2');
  const theirs = clone(base); theirs.milestones = [];
  const r = MERGE.three(base, mine, theirs);
  eq('clean deletes', [r.ok, r.value.objectives.map((o) => o.id), r.value.milestones], [true, ['OBJ-1'], []]);
}
/* 7. I delete what they changed: a clash */
{
  const mine = clone(base); mine.objectives = mine.objectives.filter((o) => o.id !== 'OBJ-2');
  const theirs = clone(base); theirs.objectives[1].statement = 'Changed there';
  eq('delete vs change', MERGE.three(base, mine, theirs).ok, false);
}
/* 8. they delete what I changed: a clash */
{
  const mine = clone(base); mine.objectives[1].statement = 'Changed here';
  const theirs = clone(base); theirs.objectives = theirs.objectives.filter((o) => o.id !== 'OBJ-2');
  eq('change vs delete', MERGE.three(base, mine, theirs).ok, false);
}
/* 9. maps keyed by id merge per key */
{
  const mine = clone(base); mine.milestoneState['MS-1'] = { status: 'paused' };
  const theirs = clone(base); theirs.milestoneState['MS-9'] = { status: 'active' };
  const r = MERGE.three(base, mine, theirs);
  eq('map keys', [r.ok, r.value.milestoneState], [true, { 'MS-1': { status: 'paused' }, 'MS-9': { status: 'active' } }]);
}
/* 10. lists without ids (owners): mine wins when both changed, theirs when only they did */
{
  const mine = clone(base); mine.objectives[0].owners = ['a@x', 'c@x'];
  const theirs = clone(base); theirs.objectives[0].owners = ['d@x'];
  eq('plain list, both changed', MERGE.three(base, mine, theirs).value.objectives[0].owners, ['a@x', 'c@x']);
  const mine2 = clone(base);
  eq('plain list, theirs only', MERGE.three(base, mine2, theirs).value.objectives[0].owners, ['d@x']);
}
/* 11. nothing changed on this side: theirs exactly */
{
  const theirs = clone(base); theirs.divisions.push({ id: 'DIV-FC', name: 'Fuel Cell', order: 2 });
  const r = MERGE.three(base, clone(base), theirs);
  eq('mine unchanged -> theirs', r.value, theirs);
}
/* 12. inputs are never modified */
{
  const b = clone(base), m = clone(base), t = clone(base);
  m.objectives[0].statement = 'x'; t.objectives[1].statement = 'y';
  const m0 = JSON.stringify(m), t0 = JSON.stringify(t), b0 = JSON.stringify(b);
  MERGE.three(b, m, t);
  eq('inputs untouched', [JSON.stringify(b) === b0, JSON.stringify(m) === m0, JSON.stringify(t) === t0], [true, true, true]);
}
/* 13. a field added on both sides with different values: mine */
{
  const mine = clone(base); mine.objectives[0].note = 'mine';
  const theirs = clone(base); theirs.objectives[0].note = 'theirs';
  eq('field added both sides', MERGE.three(base, mine, theirs).value.objectives[0].note, 'mine');
}
/* 14. a field removed here and untouched there: removed; removed there and untouched here: removed */
{
  const mine = clone(base); delete mine.objectives[0].owners;
  const theirs = clone(base); delete theirs.objectives[1].owners;
  const r = MERGE.three(base, mine, theirs);
  eq('field removals', [r.ok, 'owners' in r.value.objectives[0], 'owners' in r.value.objectives[1]], [true, false, false]);
}
console.log(PASS + ' passed, ' + FAIL + ' failed');
if (FAIL) process.exitCode = 1;
