/* REPAIR (live load-time clean-up) agrees with the sample: the sample's seeds already carry today's load
   clean-up, so repairing the sample's documents again must change nothing structural.

     node test/sc_repair.js out/Main.dc.html     (any sample board)
*/
const { Sim, done } = require('./dc');
const file = process.argv[2] || 'out/Main.dc.html';
const s = new Sim(file);
s.step('the sample is already repaired', () => {
  const D = JSON.parse(JSON.stringify(s.c.D));
  const REPAIR = s.ns.REPAIR;
  s.ok(!!REPAIR, 'REPAIR is reachable');
  if (!REPAIR) return;
  const before = JSON.stringify(D.portfolio);
  REPAIR.portfolio(D.portfolio);
  s.eq('portfolio unchanged', JSON.stringify(D.portfolio), before);
  Object.keys(D.docs).forEach((k) => {
    const b = JSON.stringify(D.docs[k]);
    REPAIR.exec(D.docs[k]);
    s.eq(k + ' unchanged', JSON.stringify(D.docs[k]), b);
  });
  Object.keys(D.spec).forEach((k) => {
    const b = JSON.stringify(D.spec[k]);
    const moved = REPAIR.spec(D.spec[k]);
    s.eq(k + ' unchanged', [JSON.stringify(D.spec[k]) === b, moved], [true, false]);
  });
  Object.keys(D.docs).forEach((k) => {
    const n = REPAIR.autoPass(D.docs[k], k.replace(/^(EXEC|BIZ)-/, ''), D.portfolio, D.today);
    s.eq(k + ': nothing left to auto-pass', n, 0);
  });
  const blank = REPAIR.blank('exec');
  REPAIR.exec(blank);
  s.ok(Array.isArray(blank.stageGates) && blank.etbTrees && typeof blank.etbTrees === 'object', 'a blank exec document is complete');
});
s.clean('repair');
done();
