/* Key results seed (X-kr).
   The real documents store a milestone step's due date as an ISO string, '' when undated (Sales saves
   `due: x.due||""` from a date input, L2673; rdcore.milestoneGanttSteps compares ISO strings). The shared
   sample stores day numbers, so the KR module's boards normalise them here. No records are added. */
function seed_kr(S) {
  var EPOCH = Date.UTC(2020, 0, 1);
  Object.keys(S.docs || {}).forEach(function (key) {
    var doc = S.docs[key];
    ((doc && doc.keyResults) || []).forEach(function (kr) {
      (kr.steps || []).forEach(function (st) {
        if (typeof st.due === 'number' && isFinite(st.due)) st.due = new Date(EPOCH + st.due * 86400000).toISOString().slice(0, 10);
        else if (st.due == null) st.due = '';
      });
    });
  });
}
