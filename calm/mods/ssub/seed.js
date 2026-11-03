/* ssub seed (Product spec board): one real cross-product dependency, additive only. The Tera 250 kW
   skid's specification "System efficiency at rated load" (KR-EL-2-1-1, Tera system) links to the
   Tera stack's product KPI "Rated stack power" (KPI-PRD-EL-1-1), so the skid's efficiency is stated
   at the stack's rated power. Linking to another product's KPI is a specification link in today's
   app (linkDefaultFor, L1325: the cross-product firewall), so the target is inherited and no value
   flows back to the stack. The record is what today's "+ link" on a specification writes
   (makeLinkMember, L1389): name, direction, unit and target null, linkPriority 0, order 0. Its id
   follows the sample's naming (S1, first metric); RD.allocId reads it as 1, below the imported
   rows' 5, so the skid's next metric id is still KPI-EL-2-1-6. It is the skid's only
   cross-product dependency (crossProductImports, L1457) and makes the stack's product KPI define a
   second link. The imported sub-product rows on SG-EL-2-1-5 stay as today writes them (linkParent
   null). Execution's link lists show definers only, so they don't change. */
function seed_ssub(S) {
  var doc = S.spec && S.spec['SPEC-DIV-EL'];
  var P = S.portfolio;
  if (!doc || !P) return;
  var kpis = doc.kpis || (doc.kpis = []);
  var spec = (doc.keyResults || []).some(function (r) { return r.id === 'KR-EL-2-1-1'; });
  var src = (P.kpis || []).some(function (k) { return k.id === 'KPI-PRD-EL-1-1'; });
  if (!spec || !src || kpis.some(function (k) { return k.id === 'KPI-EL-2-1-1-1'; })) return;
  kpis.push({ id: 'KPI-EL-2-1-1-1', objectiveId: 'MDL-EL-2-1', hostType: 'keyResult', hostId: 'KR-EL-2-1-1',
    linkParent: 'KPI-PRD-EL-1-1', linkType: 'specification', linkPriority: 0,
    name: null, direction: null, unit: null, target: null, order: 0 });
}
