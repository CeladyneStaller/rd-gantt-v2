/* scomp seed (Product spec board): two touches on Tera 25-30-R5 components, additive only.
   1. A note on End plates and compression, so the component Notes toggle shows in the sample. It
      matches the 10-cell build (torqued to 30 N·m, see MS-EL-01-01).
   2. A linked component metric, so the sample shows a real in-product link: the membrane electrode
      assembly measures H₂ in O₂ on its own cells and links it to the stack's Gas purity
      specification metric KPI-EL-1-1-4-1 as contribute (today's default for a component linking to
      a specification metric, L1323). That metric then "Defines 1 link" and today's app blocks its
      delete until the member is unlinked. The record is what today's "+ link" on a component writes
      (makeLinkMember, L1389): name, direction, unit and target null (all inherited), linkPriority 0,
      order 0. Its id follows the sample's component naming and leaves RD.allocId's next metric id
      alone. The reading is the MEA's single-cell crossover result, under the stack's own 0.62 %,
      which still wins as the stack's value (an own reading beats linked ones). Execution's link
      lists show definers only, so they don't change. */
function seed_scomp(S) {
  var TS = calmTs;
  var doc = S.spec && S.spec['SPEC-DIV-EL'];
  if (!doc) return;
  var gates = doc.stageGates || [];
  var g = gates.filter(function (x) { return x.id === 'SG-EL-1-1-4'; })[0];
  if (g && !g.notes) g.notes = 'Disc springs set to 30 N·m at assembly. Re-torque after the first thermal cycle.';
  var kpis = doc.kpis || (doc.kpis = []);
  var has = function (id) { return kpis.some(function (k) { return k.id === id; }); };
  var mea = gates.some(function (x) { return x.id === 'SG-EL-1-1-1'; });
  if (mea && has('KPI-EL-1-1-4-1') && !has('KPI-EL-1-1-C1-3')) {
    kpis.push({ id: 'KPI-EL-1-1-C1-3', objectiveId: 'MDL-EL-1-1', hostType: 'component', hostId: 'SG-EL-1-1-1',
      linkParent: 'KPI-EL-1-1-4-1', linkType: 'contribute', linkPriority: 0,
      name: null, direction: null, unit: null, target: null, order: 0 });
    (doc.kpiUpdates || (doc.kpiUpdates = [])).push(
      { id: 'UPD-C1-c', kpiId: 'KPI-EL-1-1-C1-3', value: 0.48, timestamp: TS('2026-10-06T15:00:00Z'), note: '' });
  }
}
