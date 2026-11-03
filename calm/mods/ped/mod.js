/* ============================================================================
   ped: the Planning editor. One sheet for every entity today's editor handles
   (unit, division, product, model, initiative, milestone, objective), the
   initiative / milestone targets and their readings, milestone status and
   pause, the lineage navigator and the delete flow.

   Public (used by mods/pst, mods/pov, mods/pgt, mods/pms):
     PED.open(C, ctx, type, id, opts)     id null = add. opts: { parentId, prefill, push }
     PED.lineage(C, ctx, type, id)        read-only navigator (pushes when a lineage sheet is open)
     PED.del(C, ctx, type, id)            delete with today's cascade choices and counts
     PED.milestoneStatus(C, ctx, msId, status, note)
                                          'paused' | 'deprioritized' | 'active' | 'achieved' | 'open'
   Sheet kinds: ped.edit, ped.target, ped.lineage, ped.delete
   ========================================================================== */
const PED_SCHEMA = {
  unit: [['name', 'Name', 'text'], ['order', 'Order', 'number']],
  division: [['name', 'Name', 'text'], ['unitId', 'Unit', 'ref:unit?'], ['kind', 'Kind', 'kind'], ['order', 'Order', 'number']],
  product: [['name', 'Name', 'text'], ['divisionId', 'Division', 'ref:division'], ['code', 'Code', 'code'], ['order', 'Order', 'number']],
  model: [['name', 'Name', 'text'], ['productId', 'Product', 'ref:product'], ['order', 'Order', 'number']],
  initiative: [['name', 'Name', 'text'], ['divisionId', 'Division', 'ref:division'], ['desc', 'Description', 'area'], ['plannedStart', 'Planned start', 'date'], ['plannedEnd', 'Planned end', 'date'], ['productId', 'Product', 'ref:product?'], ['modelId', 'Model', 'ref:model?'], ['order', 'Order', 'number']],
  milestone: [['name', 'Name', 'text'], ['initiativeId', 'Initiative', 'ref:initiative'], ['plannedDate', 'Planned date', 'date'], ['completedDate', 'Completed date', 'date'], ['trl', 'TRL achieved', 'number'], ['mrl', 'MRL achieved', 'number'], ['order', 'Order', 'number']],
  objective: [['statement', 'Statement', 'text'], ['divisionId', 'Division', 'ref:division'], ['initiativeId', 'Initiative', 'ref:initiative'], ['quarter', 'Quarter', 'quarter'], ['owner', 'Owners', 'owners'], ['plannedStart', 'Planned start', 'date'], ['plannedEnd', 'Planned end', 'date'], ['milestoneIds', 'Linked milestones', 'milestones'], ['productId', 'Product', 'ref:product?'], ['modelId', 'Model', 'ref:model?'], ['order', 'Order', 'number']]
};
const PED_STATS = [['average', 'Average'], ['median', 'Median'], ['stddev', 'Std dev'], ['cv', 'CV %'], ['range', 'Range'], ['max', 'Max'], ['min', 'Min']];
const PED_TAG = { unit: 'Unit', division: 'Division', product: 'Product', model: 'Model', initiative: 'Initiative', milestone: 'Milestone', objective: 'Objective' };

function pedA(word) { return (/^[aeiou]/i.test(word) ? 'an ' : 'a ') + word; }
function pedNum(v) { return v == null || !isFinite(v) ? '—' : String(Math.round(v * 100) / 100); }
function pedVal(v, unit) { if (v == null || !isFinite(v)) return null; return pedNum(v) + (unit ? (/^(%|°)/.test(unit) ? '' : ' ') + unit : ''); }
function pedSummary(k) {
  const tt = k.targetType || 'demonstration';
  if (tt === 'binary') return 'Binary, met or not met';
  const dir = k.direction === 'down' ? '≤' : '≥';
  const tgt = k.target != null && k.target !== '' ? (typeof k.target === 'object' ? (k.target.lo + ' to ' + k.target.hi) : pedNum(Number(k.target))) : '—';
  const unit = k.unit ? (/^(%|°)/.test(k.unit) ? '' : ' ') + k.unit : '';
  if (tt === 'statistical') {
    const st = (PED_STATS.find((o) => o[0] === (k.statistic || 'average')) || ['', 'Value'])[1];
    const n = k.readCount != null && k.readCount !== '' ? F.plural(Number(k.readCount), 'reading') + ' expected' : 'all readings';
    return st + ' ' + dir + ' ' + tgt + unit + ', ' + n;
  }
  return dir + ' ' + tgt + unit;
}
function pedFirst(P, ent) { const l = PLAN.list(P, ent); return l.length ? l[0].id : ''; }
function pedHas(P, ent, id) { return !!PLAN.byId(P, ent, id); }

/* ---------------------------------------------------------------- drafts */
function pedDraftFrom(type, rec, P) {
  const d = {};
  PED_SCHEMA[type].forEach((f) => {
    const k = f[0], kind = f[2], v = rec[k];
    if (kind === 'date') d[k] = v != null && v !== '' && isFinite(v) ? F.iso(v) : '';
    else if (kind === 'number') d[k] = v != null && v !== '' ? String(v) : '';
    else if (kind === 'owners') d[k] = RD.ownersOf(rec).slice();
    else if (kind === 'milestones') d[k] = Array.isArray(v) ? v.slice() : [];
    else if (kind === 'kind') d[k] = v === 'biz' ? 'biz' : 'rd';
    else if (kind.indexOf('ref:') === 0) {
      const ent = kind.slice(4).replace('?', '');
      const opt = /\?$/.test(kind);
      d[k] = v != null && v !== '' && pedHas(P, ent, v) ? v : (opt ? '' : pedFirst(P, ent));
    } else d[k] = v != null ? String(v) : '';
  });
  /* product + model: a model shows its product; an objective with neither shows what it inherits */
  if (type === 'initiative' || type === 'objective') {
    if (d.modelId && !d.productId) { const m = PLAN.byId(P, 'model', d.modelId); if (m) d.productId = m.productId || ''; }
    if (type === 'objective' && !d.productId && !d.modelId) {
      const ini = PLAN.byId(P, 'initiative', d.initiativeId);
      if (ini && ini.modelId && pedHas(P, 'model', ini.modelId)) { d.modelId = ini.modelId; d.productId = (PLAN.byId(P, 'model', ini.modelId) || {}).productId || ''; d._inh = true; }
      else if (ini && ini.productId && pedHas(P, 'product', ini.productId)) { d.productId = ini.productId; d._inh = true; }
    }
  }
  if (type === 'milestone') d._why = '';
  return d;
}

/* ---------------------------------------------------------------- open */
function pedOpen(C, ctx, type, id, opts) {
  opts = opts || {};
  if (!PED_SCHEMA[type]) return;
  if (!C.guard()) return;
  /* replacing the sheet stack would drop unsaved edits: ask first */
  if (!opts.push && !opts.force && planDirtySheets(C)) {
    C.confirm({ title: 'Discard your changes?', body: 'Your edits in the open panel are not saved yet.', ok: 'Discard changes', danger: true, onOk: () => pedOpen(C, ctx, type, id, Object.assign({}, opts, { force: true })) });
    return;
  }
  const P = C.D.portfolio;
  let rec = null;
  if (id) {
    rec = PLAN.byId(P, type, id);
    if (!rec) { C.toast('That ' + type + ' no longer exists.', 'err'); return; }
  }
  const pre = Object.assign({}, opts.prefill || {});
  if (!id && opts.parentId) {
    const pid = opts.parentId;
    if (type === 'initiative' || type === 'product') pre.divisionId = pid;
    else if (type === 'objective') { const i = PLAN.byId(P, 'initiative', pid); pre.initiativeId = pid; pre.divisionId = i ? i.divisionId : ''; }
    else if (type === 'milestone') pre.initiativeId = pid;
    else if (type === 'model') pre.productId = pid;
  }
  if (!id && type === 'objective' && pre.initiativeId && !pre.divisionId) { const i = PLAN.byId(P, 'initiative', pre.initiativeId); if (i) pre.divisionId = i.divisionId; }
  /* an objective added from a division group lands under an initiative of that division (one whose
     classification fits the group's product or model when there is one), not the first initiative of
     the whole plan, which would quietly make it a cross-division objective */
  if (!id && type === 'objective' && pre.divisionId && !pre.initiativeId) {
    const inDiv = PLAN.byOrder((P.initiatives || []).filter((i) => i.divisionId === pre.divisionId));
    const fits = inDiv.find((i) => RD.validateClassification({ initiativeId: i.id, productId: pre.modelId ? null : (pre.productId || null), modelId: pre.modelId || null }, P).ok);
    if (fits || inDiv.length) pre.initiativeId = (fits || inDiv[0]).id;
  }
  const d = pedDraftFrom(type, rec || pre, P);
  if (!id && type === 'objective' && d.quarter && !d.plannedStart && !d.plannedEnd) {
    const r = RD.quarterRange(d.quarter);
    if (r) { d.plannedStart = r.start; d.plannedEnd = r.end; }
  }
  const data = { type: type, id: id || null, d0: JSON.stringify(d) };
  if (opts.push && C.sheet()) C.pushSheet('ped.edit', data, d);
  else C.openSheet('ped.edit', data, d);
}

/* ---------------------------------------------------------------- save */
function pedPlainReason(reason, rec, P) {
  const ini = PLAN.byId(P, 'initiative', rec.initiativeId);
  const iniProd = ini && ini.productId ? PLAN.nameOf(PLAN.byId(P, 'product', ini.productId)) : '';
  const iniModel = ini && ini.modelId ? PLAN.nameOf(PLAN.byId(P, 'model', ini.modelId)) : '';
  if (/both productId and modelId/.test(reason) && /^objective/.test(reason)) return 'pick a product or a model, not both.';
  if (/has no initiative/.test(reason)) return 'pick an initiative first. An objective is classified through its initiative.';
  if (/^initiative sets both/.test(reason)) return 'its initiative pins both a product and a model. Fix the initiative first.';
  if (/pins a different product/.test(reason)) return 'this product differs from the initiative’s product (' + iniProd + '). Pick ' + iniProd + ', one of its models, or leave both blank to inherit.';
  if (/belongs to a different product/.test(reason)) return 'this model belongs to a different product than the initiative’s (' + iniProd + ').';
  if (/neither the initiative model/.test(reason)) return 'pick the initiative’s model (' + iniModel + ') or one of its sub-products.';
  if (/model-specific/.test(reason)) return 'the initiative is pinned to ' + iniModel + ', so the objective must use that model or one of its sub-products.';
  return reason;
}
function pedValidate(type, rec, P) {
  if ((type === 'objective' || type === 'initiative') && rec.productId && rec.modelId) return 'A node can pin a product or a model, not both.';
  if (type === 'objective') {
    const v = RD.validateClassification(rec, P);
    if (!v.ok) return 'Classification blocked: ' + pedPlainReason(v.reason, rec, P);
  }
  return '';
}
/* an objective's product/model that equals what it would inherit is stored blank, so it keeps inheriting */
function pedCollapseInherited(data, P) {
  const init = data.initiativeId ? PLAN.byId(P, 'initiative', data.initiativeId) : null;
  if (!init) return;
  if (data.modelId) { if (data.modelId === (init.modelId || null)) { data.modelId = null; data.productId = null; } }
  else if (data.productId) { if (data.productId === (init.productId || null) && !init.modelId) data.productId = null; }
}
/* a move that makes the objective's own class invalid clears it (it then inherits), as today */
function pedReconcile(rec, P) {
  if (rec.productId == null && rec.modelId == null) return false;
  if (RD.validateClassification(rec, P).ok) return false;
  const test = Object.assign({}, rec, { productId: null, modelId: null });
  if (RD.validateClassification(test, P).ok) { rec.productId = null; rec.modelId = null; return true; }
  return false;
}
function pedAlloc(type, data, P) {
  if (type === 'division') {
    const code = (data.name || 'DIV').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'DIV';
    return RD.allocId('division', null, (P.divisions || []).map((x) => x.id), { code: code });
  }
  if (type === 'unit') {
    const code = (data.name || 'UNIT').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'UNIT';
    return RD.allocId('unit', null, (P.units || []).map((x) => x.id), { code: code });
  }
  if (type === 'product') return RD.allocId('product', data.divisionId, (P.products || []).map((x) => x.id));
  if (type === 'model') return RD.allocId('model', data.productId, (P.models || []).map((x) => x.id));
  if (type === 'initiative') return RD.allocId('initiative', data.divisionId, (P.initiatives || []).map((x) => x.id));
  if (type === 'milestone') return RD.allocId('milestone', data.initiativeId, (P.milestones || []).map((x) => x.id));
  return RD.allocId('objective', data.divisionId, (P.objectives || []).map((x) => x.id), { quarter: data.quarter || 'UNSET' });
}
function pedAllocError(type, data) {
  if (type === 'division') {
    const code = (data.name || 'DIV').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'DIV';
    return 'The id DIV-' + code + ' is already taken. A division’s id comes from the first four letters of its name, so start the name differently.';
  }
  if (type === 'unit') {
    const code = (data.name || 'UNIT').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'UNIT';
    return 'The id UNIT-' + code + ' is already taken. A unit’s id comes from the first six letters of its name, so start the name differently.';
  }
  return 'A new id could not be made for this ' + type + '. Check its ' + (type === 'model' ? 'product' : type === 'milestone' ? 'initiative' : 'division') + '.';
}
function pedMoveWarning(D, type, id, rec, data) {
  if (type !== 'objective' && type !== 'initiative') return null;
  if (data.divisionId === undefined || !rec.divisionId || data.divisionId === rec.divisionId) return null;
  const P = D.portfolio;
  const sig = type + ':' + id + ':' + rec.divisionId + '>' + data.divisionId;
  const from = PLAN.nameOf(PLAN.byId(P, 'division', rec.divisionId)), to = PLAN.nameOf(PLAN.byId(P, 'division', data.divisionId));
  if (type === 'objective') {
    const doc = PLAN.docOf(D, rec.divisionId);
    const bits = [];
    if (doc) {
      const kr = (doc.keyResults || []).filter((x) => x.objectiveId === id).length;
      const g = (doc.stageGates || []).filter((x) => x.objectiveId === id).length;
      if (kr) bits.push(F.plural(kr, 'key result'));
      if (g) bits.push(F.plural(g, 'stage-gate'));
      if (!bits.length) return null;
    }
    const what = bits.length ? F.list(bits) : 'execution data, if any,';
    return { sig: sig, msg: 'Moving this objective from ' + from + ' to ' + to + '. Its ' + what + ' live in ' + from + '’s execution bin and will not move. They’ll disappear from view until the division is set back. Select Move anyway to go ahead.' };
  }
  const stay = (P.objectives || []).filter((o) => o.initiativeId === id && o.divisionId === rec.divisionId);
  if (!stay.length) return null;
  return { sig: sig, msg: 'Moving this initiative from ' + from + ' to ' + to + '. Its ' + F.plural(stay.length, 'objective') + ' stay in ' + from + '. They’ll show under ' + to + ' here but remain in ' + from + ' in the execution app. Select Move anyway to go ahead.' };
}
/* read the draft like today's readEditor, with plain errors instead of silent zeros */
function pedRead(type, d, P) {
  const data = {};
  for (const f of PED_SCHEMA[type]) {
    const k = f[0], label = f[1], kind = f[2];
    if (kind === 'text' || kind === 'area' || kind === 'code') { const v = String(d[k] == null ? '' : d[k]).trim(); data[k] = v === '' ? null : v; }
    else if (kind === 'number') {
      const raw = String(d[k] == null ? '' : d[k]).trim();
      if (raw === '') data[k] = null;
      else { const n = K.num(raw); if (n == null) return { err: label + ' must be a number, like 2.' }; data[k] = n; }
    } else if (kind === 'date') {
      const raw = String(d[k] == null ? '' : d[k]).trim();
      if (!raw) data[k] = null;
      else { const day = F.fromIso(raw); if (day == null) return { err: label + ' must be a date.' }; data[k] = day; }
    } else if (kind === 'owners' || kind === 'milestones') data[k] = (d[k] || []).slice();
    else if (kind === 'kind') data[k] = d[k] === 'biz' ? 'biz' : 'rd';
    else if (kind === 'quarter') data[k] = d[k] ? String(d[k]) : null;
    else if (kind.indexOf('ref:') === 0) {
      const ent = kind.slice(4).replace('?', '');
      const v = d[k] || '';
      if (!/\?$/.test(kind) && !v) return { err: PLAN.list(P, ent).length ? 'Pick ' + pedA(label.toLowerCase()) + '.' : 'Add ' + pedA(ent) + ' first. Every ' + type + ' belongs to one.' };
      data[k] = v === '' ? null : v;
    }
  }
  if (data.modelId) data.productId = null;
  const nameKey = type === 'objective' ? 'statement' : 'name';
  if (!data[nameKey]) return { err: type === 'objective' ? 'Write the objective statement.' : 'Give the ' + type + ' a name.' };
  if (type === 'initiative' && data.plannedStart != null && data.plannedEnd != null && data.plannedEnd < data.plannedStart) return { err: 'The planned end is before the planned start.' };
  if (type === 'objective' && data.plannedStart != null && data.plannedEnd != null && data.plannedEnd < data.plannedStart) return { err: 'The planned end is before the planned start.' };
  return { data: data };
}
function pedSave(C, ctx) {
  const s = C.sheet();
  if (!s || s.kind !== 'ped.edit') return;
  if (!C.guard()) return;
  const type = s.data.type, id = s.data.id;
  const D = C.D, P = D.portfolio;
  const r = pedRead(type, s.d || {}, P);
  if (r.err) { C.sheetErr(r.err); return; }
  const data = r.data;
  if (type === 'objective') pedCollapseInherited(data, P);
  let cleared = false, msg;
  if (id) {
    const rec = PLAN.byId(P, type, id);
    if (!rec) { C.sheetErr('This ' + type + ' was deleted, so it can’t be saved.'); return; }
    const merged = Object.assign({}, rec, data);
    if (type === 'objective' && pedReconcile(merged, P)) { data.productId = null; data.modelId = null; cleared = true; }
    const v = pedValidate(type, merged, P);
    if (v) { C.sheetErr(v); return; }
    const warn = pedMoveWarning(D, type, id, rec, data);
    if (warn && s.data.moveSig !== warn.sig) { C.setSheetData({ moveSig: warn.sig, moveMsg: warn.msg }); return; }
    msg = !cleared ? PLAN.ENT[type] + ' saved.' : (data.initiativeId !== rec.initiativeId
      ? 'Objective saved. Its product and model were cleared to match the new initiative.'
      : 'Objective saved. Its product and model didn\u2019t fit its initiative, so they were cleared and it inherits the initiative\u2019s again.');
    if (!C.mutate((DD) => { const r2 = PLAN.byId(DD.portfolio, type, id); if (!r2) return false; Object.assign(r2, data); }, { msg: msg })) return;
  } else {
    let newId;
    try { newId = pedAlloc(type, data, P); } catch (e) { C.sheetErr(pedAllocError(type, data)); return; }
    const rec = Object.assign({ id: newId }, data);
    if (type === 'objective' && pedReconcile(rec, P)) cleared = true;
    const v = pedValidate(type, rec, P);
    if (v) { C.sheetErr(v); return; }
    msg = cleared ? 'Objective added. Its product and model were cleared to match the initiative.' : PLAN.ENT[type] + ' added.';
    if (!C.mutate((DD) => { const key = PLAN.KEY[type]; DD.portfolio[key] = DD.portfolio[key] || []; DD.portfolio[key].push(rec); }, { msg: msg })) return;
  }
  if ((C.state.sheets || []).length > 1) C.closeSheet(); else C.closeAllSheets();
}

/* ---------------------------------------------------------------- delete */
function pedCascadeSet(P, ent, id) {
  const out = [];
  if (ent === 'unit') return out;
  if (ent === 'product') (P.models || []).filter((m) => m.productId === id).forEach((m) => out.push({ ent: 'model', id: m.id }));
  else if (ent === 'initiative') {
    (P.objectives || []).filter((o) => o.initiativeId === id).forEach((o) => out.push({ ent: 'objective', id: o.id }));
    (P.milestones || []).filter((m) => m.initiativeId === id).forEach((m) => out.push({ ent: 'milestone', id: m.id }));
  } else if (ent === 'division') {
    (P.products || []).filter((p) => p.divisionId === id).forEach((p) => {
      out.push({ ent: 'product', id: p.id });
      (P.models || []).filter((m) => m.productId === p.id).forEach((m) => out.push({ ent: 'model', id: m.id }));
    });
    const inits = (P.initiatives || []).filter((i) => i.divisionId === id);
    inits.forEach((i) => {
      out.push({ ent: 'initiative', id: i.id });
      (P.objectives || []).filter((o) => o.initiativeId === i.id).forEach((o) => out.push({ ent: 'objective', id: o.id }));
      (P.milestones || []).filter((m) => m.initiativeId === i.id).forEach((m) => out.push({ ent: 'milestone', id: m.id }));
    });
    (P.objectives || []).filter((o) => o.divisionId === id && !inits.some((i) => i.id === o.initiativeId)).forEach((o) => out.push({ ent: 'objective', id: o.id }));
  }
  const seen = {};
  return out.filter((x) => { const k = x.ent + ':' + x.id; if (seen[k]) return false; seen[k] = 1; return true; });
}
/* remove the records, then clean every reference to them (today left targets, readings, pause
   records, edges and dangling parent ids behind) */
function pedDeleteData(P, targets) {
  const del = {};
  targets.forEach((t) => { (del[t.ent] = del[t.ent] || {})[t.id] = 1; });
  const gone = (ent, v) => v != null && !!(del[ent] && del[ent][v]);
  Object.keys(del).forEach((ent) => { const key = PLAN.KEY[ent]; if (P[key]) P[key] = P[key].filter((r) => !del[ent][r.id]); });
  (P.divisions || []).forEach((d) => { if (gone('unit', d.unitId)) d.unitId = null; });
  (P.products || []).forEach((p) => { if (gone('division', p.divisionId)) p.divisionId = null; });
  (P.models || []).forEach((m) => { if (gone('product', m.productId)) m.productId = null; });
  (P.initiatives || []).forEach((i) => {
    if (gone('division', i.divisionId)) i.divisionId = null;
    if (gone('product', i.productId)) i.productId = null;
    if (gone('model', i.modelId)) i.modelId = null;
  });
  (P.milestones || []).forEach((m) => { if (gone('initiative', m.initiativeId)) m.initiativeId = null; });
  (P.objectives || []).forEach((o) => {
    if (gone('division', o.divisionId)) o.divisionId = null;
    if (gone('initiative', o.initiativeId)) o.initiativeId = null;
    if (gone('product', o.productId)) o.productId = null;
    if (gone('model', o.modelId)) o.modelId = null;
    if (o.milestoneIds) o.milestoneIds = o.milestoneIds.filter((x) => !gone('milestone', x));
  });
  const deadK = {};
  if (P.kpis) P.kpis = P.kpis.filter((k) => {
    const g = (k.hostType === 'initiative' && gone('initiative', k.hostId)) || (k.hostType === 'milestone' && gone('milestone', k.hostId)) || (k.hostType === 'product' && gone('product', k.hostId));
    if (g) deadK[k.id] = 1;
    return !g;
  });
  if (P.kpiUpdates) P.kpiUpdates = P.kpiUpdates.filter((u) => !deadK[u.kpiId]);
  if (P.milestoneState) P.milestoneState = P.milestoneState.filter((x) => !gone('milestone', x.milestoneId));
  if (P.objectiveEdges) P.objectiveEdges = P.objectiveEdges.filter((e) => !gone('objective', e.fromObj) && !gone('objective', e.toObj));
  if (P.milestoneEdges) P.milestoneEdges = P.milestoneEdges.filter((e) => !gone('milestone', e.fromMs) && !gone('milestone', e.toMs));
  if (P.composition) P.composition = P.composition.filter((c) => !gone('model', c.parent) && !gone('model', c.child));
}
function pedRunDelete(C, type, id, cascade) {
  const P = C.D.portfolio;
  const kids = cascade ? pedCascadeSet(P, type, id) : [];
  const targets = kids.concat([{ ent: type, id: id }]);
  const n = targets.length - 1;
  const msg = PLAN.ENT[type] + (n > 0 ? ' and ' + F.plural(n, 'item') + ' deleted.' : ' deleted.');
  const ok = C.mutate((D) => { pedDeleteData(D.portfolio, targets); }, { msg: msg });
  if (!ok) return;
  /* close the delete sheet, and any editor or lineage of something that no longer exists */
  const live = (C.state.sheets || []).filter((s) => {
    if (s.kind === 'ped.delete') return false;
    const t = s.data && s.data.type, i = s.data && s.data.id;
    if ((s.kind === 'ped.edit' || s.kind === 'ped.lineage') && i && !PLAN.byId(C.D.portfolio, t, i)) return false;
    if (s.kind === 'ped.target' && s.data && s.data.hostId && !PLAN.byId(C.D.portfolio, s.data.hostType, s.data.hostId)) return false;
    if (s.kind === 'pov.detail' && s.data && s.data.id && !PLAN.byId(C.D.portfolio, s.data.type, s.data.id)) return false;
    return true;
  });
  C.setState({ sheets: live, menu: '' });
}
function pedDel(C, ctx, type, id) {
  if (!PED_SCHEMA[type]) return;
  if (!C.guard()) return;
  const P = C.D.portfolio;
  const rec = PLAN.byId(P, type, id);
  if (!rec) return;
  const name = PLAN.nameOf(rec);
  if (type === 'unit') {
    const members = (P.divisions || []).filter((d) => (d.unitId || null) === id);
    C.confirm({
      title: 'Delete unit ' + name + '?',
      body: members.length ? F.plural(members.length, 'division') + ' in this unit will become Unassigned. They are not deleted.' : 'This can’t be undone.',
      ok: 'Delete unit', danger: true, onOk: () => pedRunDelete(C, type, id, false)
    });
    return;
  }
  const kids = pedCascadeSet(P, type, id);
  if (!kids.length) {
    C.confirm({ title: 'Delete ' + name + '?', body: 'This can’t be undone.', ok: 'Delete ' + type, danger: true, onOk: () => pedRunDelete(C, type, id, false) });
    return;
  }
  const data = { type: type, id: id };
  if (C.sheet()) C.pushSheet('ped.delete', data, {}); else C.openSheet('ped.delete', data, {});
}

/* ---------------------------------------------------------------- milestone status */
function pedMilestoneStatus(C, ctx, msId, status, note) {
  if (!C.guard()) return;
  const ms = PLAN.byId(C.D.portfolio, 'milestone', msId);
  if (!ms) return;
  if (status === 'achieved' || status === 'open') {
    const day = C.today();
    C.mutate((D) => { const m = PLAN.byId(D.portfolio, 'milestone', msId); if (!m) return false; m.completedDate = status === 'achieved' ? day : null; }, { msg: status === 'achieved' ? 'Milestone marked achieved.' : 'Milestone reopened.' });
    return;
  }
  if (status !== 'paused' && status !== 'deprioritized' && status !== 'active') return;
  const day = C.today();
  const msg = status === 'active' ? 'Milestone resumed.' : 'Milestone ' + (status === 'paused' ? 'paused' : 'deprioritized') + '.';
  C.mutate((D) => { D.portfolio.milestoneState = RD.setMilestoneState(D.portfolio.milestoneState, msId, status, day, note || ''); }, { msg: msg });
}

/* ---------------------------------------------------------------- lineage */
/* the lineage stacks over whatever is open (an editor keeps its draft; Back returns to it) */
function pedLineage(C, ctx, type, id) {
  if (!PED_TAG[type]) return;
  if (!PLAN.byId(C.D.portfolio, type, id)) return;
  const data = { type: type, id: id };
  if (C.sheet()) C.pushSheet('ped.lineage', data, {});
  else C.openSheet('ped.lineage', data, {});
}

/* ---------------------------------------------------------------- shared row helpers */
function pedSubCount(D, ent, r) {
  const P = D.portfolio;
  if (ent === 'division') return F.list([F.plural((P.products || []).filter((p) => p.divisionId === r.id).length, 'product'), F.plural((P.initiatives || []).filter((i) => i.divisionId === r.id).length, 'initiative'), F.plural((P.objectives || []).filter((o) => o.divisionId === r.id).length, 'objective')]);
  if (ent === 'product') return F.plural((P.models || []).filter((m) => m.productId === r.id).length, 'model') + ', ' + F.plural((P.objectives || []).filter((o) => o.productId === r.id).length, 'objective');
  if (ent === 'model') return F.plural((P.objectives || []).filter((o) => o.modelId === r.id).length, 'objective');
  if (ent === 'initiative') return F.plural((P.milestones || []).filter((m) => m.initiativeId === r.id).length, 'milestone') + ', ' + F.plural((P.objectives || []).filter((o) => o.initiativeId === r.id).length, 'objective');
  if (ent === 'milestone') return F.plural((P.objectives || []).filter((o) => (o.milestoneIds || []).indexOf(r.id) >= 0).length, 'objective') + ' linked';
  if (ent === 'objective') {
    const doc = PLAN.docOf(D, r.divisionId);
    if (doc) {
      const k = (doc.keyResults || []).filter((x) => x.objectiveId === r.id).length;
      const g = (doc.stageGates || []).filter((x) => x.objectiveId === r.id).length;
      const ns = pedSets(doc, r.id).length;
      return F.plural(k, 'key result') + ', ' + F.plural(g, 'gate') + (ns > 1 ? ', ' + F.plural(ns, 'workstream') : '');
    }
    return r.quarter ? F.q(r.quarter) : '';
  }
  return '';
}
function pedSets(doc, objId) {
  return ((doc && doc.stageGateSets) || []).filter((s) => s.objectiveId === objId).slice().sort((a, b) => ((a.order || 0) - (b.order || 0)) || String(a.name || '').localeCompare(String(b.name || '')));
}
/* today's planGroupGates: gates by workstream (set), due-date order; orphans in "Ungrouped" */
function pedGateGroups(doc, objId) {
  const byDue = (a, b) => { const pa = a.plannedDate == null ? Infinity : a.plannedDate, pb = b.plannedDate == null ? Infinity : b.plannedDate; return (pa - pb) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)); };
  const gates = ((doc && doc.stageGates) || []).filter((g) => g.objectiveId === objId);
  const sets = pedSets(doc, objId);
  const groups = sets.map((st) => ({ set: st, gates: gates.filter((g) => g.setId === st.id).slice().sort(byDue) }));
  const valid = {};
  sets.forEach((st) => { valid[st.id] = 1; });
  const orphans = gates.filter((g) => !valid[g.setId]).slice().sort(byDue);
  if (orphans.length) groups.push({ set: { id: '__ung__:' + objId, name: 'Ungrouped' }, gates: orphans });
  return groups;
}
function pedHasKids(D, ent, id) {
  const P = D.portfolio;
  if (ent === 'division') return (P.initiatives || []).some((i) => i.divisionId === id) || (P.products || []).some((p) => p.divisionId === id);
  if (ent === 'initiative') return (P.milestones || []).some((m) => m.initiativeId === id) || (P.objectives || []).some((o) => o.initiativeId === id);
  if (ent === 'product') return (P.models || []).some((m) => m.productId === id);
  if (ent === 'objective') {
    const o = PLAN.byId(P, 'objective', id);
    const doc = o ? PLAN.docOf(D, o.divisionId) : null;
    if (!doc) return false;
    return (doc.keyResults || []).some((k) => k.objectiveId === id) || (doc.stageGates || []).some((g) => g.objectiveId === id);
  }
  return false;
}
function pedModelConf(D, modelId) { return RD.objectiveScore(modelId, D.spec || {}); }
function pedSpecMeta(D, modelId) {
  const P = D.portfolio;
  const m = PLAN.byId(P, 'model', modelId);
  const p = m ? PLAN.byId(P, 'product', m.productId) : null;
  const sd = p ? (D.spec || {})['SPEC-' + p.divisionId] : null;
  return (sd && sd.modelSpec && sd.modelSpec[modelId]) || {};
}

/* ---------------------------------------------------------------- view models */
function pedFieldsVM(C, ctx, s) {
  const P = ctx.P, d = s.d || {}, type = s.data.type;
  const set = (patch) => C.setDraft(patch);
  const fields = [];
  PED_SCHEMA[type].forEach((f) => {
    const k = f[0], label = f[1], kind = f[2];
    const fl = { key: k, label: label, v: d[k] == null ? '' : d[k], cls: 'ped-f', hasTag: false, hasHint: false, hint: '', placeholder: '',
      isText: false, isTextRest: false, first: false, isArea: false, isNum: false, isDate: false, isSel: false, isKind: false, isChecks: false, disabled: false, opts: [], checks: [], segs: [], noChecks: false, emptyChecks: '',
      on: (e) => set({ [k]: e && e.target ? e.target.value : '' }) };
    if (kind === 'text' || kind === 'code') {
      fl.isText = true;
      if (kind === 'code') { fl.hasHint = true; fl.hint = 'Optional. Numbers this product’s milestones, like TS-01. Left blank, a code is made from the name.'; }
      if (k === 'statement') { fl.cls = 'ped-f wide'; fl.placeholder = 'e.g. Qualify the 10-cell short stack for durability testing'; }
      if (k === 'name') fl.cls = 'ped-f wide';
    } else if (kind === 'area') { fl.isArea = true; fl.cls = 'ped-f wide'; }
    else if (kind === 'number') {
      fl.isNum = true; fl.cls = 'ped-f narrow';
      if (k === 'order') { fl.hasHint = true; fl.hint = 'Lower numbers list first; blank lists last.'; }
    } else if (kind === 'date') {
      fl.isDate = true;
      if (k === 'completedDate') { fl.hasHint = true; fl.hint = 'Setting it marks the milestone achieved.'; }
    } else if (kind === 'kind') {
      fl.isKind = true;
      fl.segs = [['rd', 'R&D'], ['biz', 'Business']].map((x) => ({ label: x[1], on: (d.kind || 'rd') === x[0] ? 'true' : 'false', pick: () => set({ kind: x[0] }) }));
      fl.hasHint = true; fl.hint = 'R&D divisions are executed in Execution; Business divisions in Sales.';
    } else if (kind === 'quarter') {
      fl.isSel = true;
      const list = RD.quarterList(PLAN.quarters(P), F.dateOf(ctx.today).getUTCFullYear(), 1, 2);
      if (d.quarter && list.indexOf(d.quarter) < 0) list.push(d.quarter);
      fl.opts = [{ v: '', label: 'None' }].concat(list.map((q) => ({ v: q, label: F.q(q) })));
      fl.on = (e) => {
        const q = e && e.target ? e.target.value : '';
        const r = RD.quarterRange(q);
        set(r ? { quarter: q, plannedStart: r.start, plannedEnd: r.end } : { quarter: q });
      };
      fl.hasHint = true; fl.hint = 'Picking a quarter fills the planned dates; you can still change them.';
    } else if (kind === 'owners') {
      fl.isChecks = true; fl.cls = 'ped-f wide';
      const cur = (d.owner || []).slice();
      const users = ((C.D.roster && C.D.roster.users) || []);
      const known = users.filter((u) => !u.disabled && u.email).map((u) => u.email);
      const extra = [];
      (P.objectives || []).forEach((o) => RD.ownersOf(o).forEach((v) => { if (known.indexOf(v) < 0 && extra.indexOf(v) < 0) extra.push(v); }));
      cur.forEach((v) => { if (known.indexOf(v) < 0 && extra.indexOf(v) < 0) extra.push(v); });
      const toggle = (email) => (e) => {
        const on = !!(e && e.target ? e.target.checked : cur.indexOf(email) < 0);
        const now = (C.draft().owner || []).filter((x) => x !== email);
        if (on) now.push(email);
        set({ owner: now });
      };
      fl.checks = known.map((em) => ({ label: F.name(em), sub: em, on: cur.indexOf(em) >= 0, toggle: toggle(em) }))
        .concat(extra.map((em) => ({ label: em, sub: 'not in the roster', on: cur.indexOf(em) >= 0, toggle: toggle(em) })));
      fl.noChecks = !fl.checks.length; fl.emptyChecks = 'No people in the roster yet.';
    } else if (kind === 'milestones') {
      fl.isChecks = true; fl.cls = 'ped-f wide';
      const cur = (d.milestoneIds || []).slice();
      const mine = (P.milestones || []).filter((m) => m.initiativeId === d.initiativeId);
      const rest = (P.milestones || []).filter((m) => m.initiativeId !== d.initiativeId);
      fl.checks = mine.concat(rest).map((m) => {
        const ini = PLAN.byId(P, 'initiative', m.initiativeId);
        return {
          label: m.name || m.id,
          sub: (ini ? ini.name : 'No initiative') + ', ' + (m.plannedDate != null ? F.dayY(m.plannedDate) : 'no date'),
          on: cur.indexOf(m.id) >= 0,
          toggle: (e) => {
            const on = !!(e && e.target ? e.target.checked : cur.indexOf(m.id) < 0);
            const now = (C.draft().milestoneIds || []).filter((x) => x !== m.id);
            if (on) now.push(m.id);
            set({ milestoneIds: now });
          }
        };
      });
      fl.noChecks = !fl.checks.length; fl.emptyChecks = 'No milestones yet. Add them to an initiative first.';
      fl.hasHint = true; fl.hint = 'A linked milestone’s date follows this objective’s projected end.';
    } else if (kind.indexOf('ref:') === 0) {
      fl.isSel = true;
      const ent = kind.slice(4).replace('?', '');
      const opt = /\?$/.test(kind);
      let list = PLAN.list(P, ent);
      if (ent === 'model' && d.productId) list = list.filter((m) => m.productId === d.productId);
      const lab = (r) => {
        if (ent === 'initiative') { const dv = PLAN.byId(P, 'division', r.divisionId); return r.name + (dv ? ' (' + dv.name + ')' : ''); }
        if (ent === 'model') { const p = PLAN.byId(P, 'product', r.productId); return (p ? p.name + ', ' : '') + r.name; }
        return PLAN.nameOf(r);
      };
      fl.opts = (opt ? [{ v: '', label: 'None' }] : []).concat(list.map((r) => ({ v: r.id, label: lab(r) })));
      if (!opt && !list.length) { fl.opts = [{ v: '', label: 'No ' + ent + 's yet' }]; fl.disabled = true; fl.hasHint = true; fl.hint = 'Add ' + pedA(ent) + ' first.'; }
      if (k === 'productId' || k === 'modelId') {
        fl.hasTag = true;
        if (d._inh) { fl.hasHint = true; fl.hint = k === 'productId' ? 'Inherited from the initiative. Leave it to keep inheriting.' : ''; fl.hasHint = !!fl.hint; }
      }
      if (k === 'productId') fl.on = (e) => {
        const v = e && e.target ? e.target.value : '';
        const dm = C.draft().modelId;
        const keep = dm && (P.models || []).some((m) => m.id === dm && m.productId === v);
        set({ productId: v, modelId: keep ? dm : '', _inh: false });
      };
      if (k === 'modelId') fl.on = (e) => {
        const v = e && e.target ? e.target.value : '';
        const m = PLAN.byId(P, 'model', v);
        set(m && m.productId ? { modelId: v, productId: m.productId, _inh: false } : { modelId: v, _inh: false });
      };
      if (k === 'initiativeId' && type === 'objective') fl.hasHint = false;
    }
    fl.hasHint = !!fl.hint && fl.hasHint;
    fl.first = fl.isText && !fields.length;
    fl.isTextRest = fl.isText && !fl.first;
    fields.push(fl);
  });
  return fields;
}
function pedTargetsVM(C, ctx, hostType, hostId) {
  const P = ctx.P, pm = ctx.em, pool = ctx.pool;
  const rec = C.state.ped_rec || null;
  const list = (P.kpis || []).filter((k) => k.hostType === hostType && k.hostId === hostId);
  const rows = list.map((k) => {
    const val = RD.effValue(k, pool, pm), sc = RD.kpiScoreResolved(k, pool, pm), b = RD.band(sc);
    const recording = !!(rec && rec.id === k.id);
    const nReads = (P.kpiUpdates || []).filter((u) => u.kpiId === k.id).length;
    let src = '';
    if (hostType === 'milestone' && (val != null || (k.sources || []).length)) {
      const e = RD.effValueSource(k, pool, pm);
      if (e) {
        if (e.src === k.id) src = 'Source: manual entry';
        else { const sk = pool.find((x) => x.id === e.src); const n = (k.sources || []).length; src = 'Source: ' + (sk ? (sk.name || sk.id) : e.src) + (n > 1 ? ' (best of ' + n + ')' : ''); }
      }
    }
    const commit = (raw, fromBlur) => {
      const cur = C.state.ped_rec;
      if (!cur || cur.id !== k.id) return;
      const t = String(raw == null ? '' : raw).trim();
      if (t === '') { C.setState({ ped_rec: null }); return; }
      const n = K.num(t);
      if (n == null) { if (fromBlur) C.setState({ ped_rec: null }); else C.setState({ ped_rec: Object.assign({}, cur, { err: 'Use a number, like 1.85.' }) }); return; }
      const ts = C.now();
      C.setState({ ped_rec: null });
      C.mutate((D) => { D.portfolio.kpiUpdates = D.portfolio.kpiUpdates || []; D.portfolio.kpiUpdates.push({ id: 'UPD-' + k.id + '-' + ts, kpiId: k.id, value: n, timestamp: ts, note: '' }); }, { msg: 'Value recorded.' });
    };
    return {
      id: k.id, name: k.name || k.id, dotCls: 'dot ' + F.tone(PLAN.tone(b)), word: PLAN.word(b), summary: pedSummary(k),
      cur: val == null ? 'No reading' : pedVal(val, k.unit), curCls: val == null ? 'ped-cur faint' : 'ped-cur',
      score: F.score(sc), scoreCls: 'num strong tx-' + PLAN.tone(b),
      canRecord: !ctx.ro, recording: recording, notRecording: !recording,
      recordLabel: 'Record a value for ' + (k.name || k.id),
      start: () => { if (!C.guard()) return; C.setState({ ped_rec: { id: k.id, v: '', err: '' } }); },
      rv: recording ? rec.v : '',
      rvErr: recording ? rec.err || '' : '', hasRvErr: !!(recording && rec.err),
      onRv: (e) => C.setState({ ped_rec: Object.assign({}, C.state.ped_rec, { v: e && e.target ? e.target.value : '', err: '' }) }),
      rvKey: (e) => {
        if (!e) return;
        if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); commit(C.state.ped_rec ? C.state.ped_rec.v : ''); }
        else if (e.key === 'Escape') { if (e.stopPropagation) e.stopPropagation(); C.setState({ ped_rec: null }); }
      },
      rvBlur: () => commit(C.state.ped_rec ? C.state.ped_rec.v : '', true),
      hasSrc: !!src, src: src,
      reads: F.plural(nReads, 'reading'),
      edit: () => pedOpenTarget(C, hostType, hostId, k.id),
      editLabel: 'Edit target ' + (k.name || k.id),
      remove: () => C.confirm({
        title: 'Remove ' + (k.name || 'this target') + '?',
        body: nReads ? 'The target and its ' + F.plural(nReads, 'reading') + ' are removed. This can’t be undone.' : 'This can’t be undone.',
        ok: 'Remove target', danger: true,
        onOk: () => C.mutate((D) => {
          const PP = D.portfolio;
          PP.kpis = (PP.kpis || []).filter((x) => x.id !== k.id);
          PP.kpiUpdates = (PP.kpiUpdates || []).filter((u) => u.kpiId !== k.id);
          (PP.kpis || []).forEach((x) => { if (x.sources) x.sources = x.sources.filter((sid) => sid !== k.id); });
        }, { msg: 'Target removed.' })
      }),
      removeLabel: 'Remove target ' + (k.name || k.id)
    };
  });
  return {
    head: hostType === 'milestone' ? 'Milestone targets' : 'Initiative targets',
    rows: rows, has: rows.length > 0, none: !rows.length,
    empty: 'No targets yet. Define a KPI at this ' + hostType + ' here, then link key results or stage-gates to it from Execution to feed its value.',
    canAdd: !ctx.ro,
    add: () => pedOpenTarget(C, hostType, hostId, null)
  };
}
function pedOpenTarget(C, hostType, hostId, kpiId) {
  if (!C.guard()) return;
  const P = C.D.portfolio;
  const ex = kpiId ? (P.kpis || []).find((k) => k.id === kpiId) : null;
  const d = ex ? {
    name: ex.name || '', targetType: ex.targetType || 'demonstration', direction: ex.direction === 'down' ? 'down' : 'up',
    target: ex.target != null && typeof ex.target !== 'object' ? String(ex.target) : '', unit: ex.unit || '',
    statistic: ex.statistic || 'average', readCount: ex.readCount != null ? String(ex.readCount) : '', sources: (ex.sources || []).slice()
  } : { name: '', targetType: 'demonstration', direction: 'up', target: '', unit: '', statistic: 'average', readCount: '', sources: [] };
  C.pushSheet('ped.target', { hostType: hostType, hostId: hostId, kpiId: kpiId || null, d0: JSON.stringify(d) }, d);
}
/* KR KPIs in the milestone's initiative, as Objective (quarter) > key result > KPI */
function pedSourceTree(C, ctx, msId) {
  const P = ctx.P, D = C.D;
  const ms = PLAN.byId(P, 'milestone', msId);
  if (!ms) return [];
  const tree = [];
  (P.objectives || []).filter((o) => o.initiativeId === ms.initiativeId).forEach((o) => {
    const krs = [];
    Object.keys(D.docs || {}).forEach((key) => {
      const doc = D.docs[key] || {};
      (doc.keyResults || []).filter((r) => r.objectiveId === o.id).forEach((kr) => {
        const kpis = (doc.kpis || []).filter((k) => k.hostType === 'keyResult' && k.hostId === kr.id).map((k) => ({ id: k.id, label: k.name || k.id }));
        if (kpis.length) krs.push({ id: kr.id, label: kr.statement || kr.id, kpis: kpis });
      });
    });
    if (krs.length) tree.push({ id: o.id, label: o.statement || o.id, quarter: o.quarter || '', krs: krs });
  });
  return tree;
}
function pedTargetVM(C, ctx, s) {
  const d = s.d || {}, data = s.data || {};
  const set = (p) => C.setDraft(p);
  const tt = d.targetType || 'demonstration';
  const seg = (key, val, opts) => opts.map((o) => ({ label: o[1], on: val === o[0] ? 'true' : 'false', pick: () => set({ [key]: o[0] }) }));
  const isMs = data.hostType === 'milestone';
  const host = PLAN.byId(ctx.P, data.hostType, data.hostId);
  const srcRows = [];
  if (isMs) {
    const cur = d.sources || [];
    pedSourceTree(C, ctx, data.hostId).forEach((o) => {
      srcRows.push({ isObj: true, isKr: false, isKpi: false, label: o.label, sub: o.quarter ? F.q(o.quarter) : '', on: false, toggle: null });
      o.krs.forEach((kr) => {
        srcRows.push({ isObj: false, isKr: true, isKpi: false, label: kr.label, sub: '', on: false, toggle: null });
        kr.kpis.forEach((k) => srcRows.push({
          isObj: false, isKr: false, isKpi: true, label: k.label, sub: '', on: cur.indexOf(k.id) >= 0,
          toggle: (e) => {
            const on = !!(e && e.target ? e.target.checked : cur.indexOf(k.id) < 0);
            const now = (C.draft().sources || []).filter((x) => x !== k.id);
            if (on) now.push(k.id);
            set({ sources: now });
          }
        }));
      });
    });
  }
  return {
    title: data.kpiId ? 'Edit target' : 'Add target',
    sub: (isMs ? 'Milestone: ' : 'Initiative: ') + PLAN.nameOf(host),
    name: d.name || '', onName: C.bindDraft('name'),
    types: seg('targetType', tt, [['demonstration', 'Demonstration'], ['statistical', 'Statistical'], ['binary', 'Binary']]),
    isStat: tt === 'statistical', notBinary: tt !== 'binary',
    readCount: d.readCount || '', onReadCount: C.bindDraft('readCount'),
    statistic: d.statistic || 'average', onStatistic: C.bindDraft('statistic'),
    stats: PED_STATS.map((x) => ({ v: x[0], label: x[1] })),
    dirs: seg('direction', d.direction === 'down' ? 'down' : 'up', [['up', 'Increase'], ['down', 'Decrease']]),
    target: d.target || '', onTarget: C.bindDraft('target'),
    unit: d.unit || '', onUnit: C.bindDraft('unit'),
    isMs: isMs, srcRows: srcRows, hasSrc: srcRows.length > 0, noSrc: isMs && !srcRows.length,
    save: () => pedSaveTarget(C, ctx),
    cancel: () => C.closeSheet()
  };
}
function pedSaveTarget(C, ctx) {
  const s = C.sheet();
  if (!s || s.kind !== 'ped.target') return;
  if (!C.guard()) return;
  const d = s.d || {}, data = s.data;
  const tt = d.targetType || 'demonstration';
  const name = String(d.name || '').trim();
  if (!name) { C.sheetErr('Give the target a name, like Mass activity.'); return; }
  const rec = { hostType: data.hostType, hostId: data.hostId, objectiveId: null, isDefiner: true, groupId: null, name: name, targetType: tt };
  if (data.hostType === 'milestone') rec.sources = (d.sources || []).slice();
  if (tt !== 'binary') {
    rec.direction = d.direction === 'down' ? 'down' : 'up';
    const raw = String(d.target == null ? '' : d.target).trim();
    if (raw === '') rec.target = null;
    else { const n = K.num(raw); if (n == null) { C.sheetErr('Use a number for the target value, like 1.85.'); return; } rec.target = n; }
    rec.unit = String(d.unit || '').trim();
  }
  if (tt === 'statistical') {
    rec.statistic = d.statistic || 'average';
    const raw = String(d.readCount == null ? '' : d.readCount).trim();
    if (raw === '') rec.readCount = null;
    else { const n = K.num(raw); if (n == null || n < 1 || Math.round(n) !== n) { C.sheetErr('Readings expected must be a whole number of 1 or more, or blank for every reading.'); return; } rec.readCount = n; }
  }
  const P = C.D.portfolio;
  let ok;
  if (data.kpiId) {
    ok = C.mutate((D) => { const k = (D.portfolio.kpis || []).find((x) => x.id === data.kpiId); if (!k) return false; Object.assign(k, rec); }, { msg: 'Target saved.' });
  } else {
    const id = RD.allocId('kpi', data.hostId, (P.kpis || []).map((x) => x.id));
    ok = C.mutate((D) => { D.portfolio.kpis = D.portfolio.kpis || []; D.portfolio.kpis.push(Object.assign({ id: id }, rec)); }, { msg: 'Target saved.' });
  }
  if (ok) C.closeSheet();
}
function pedSpecsVM(C, ctx, node) {
  const D = C.D, P = ctx.P;
  const c = RD.effClass(node, P);
  if (c.kind === 'agnostic') return null;
  const targets = c.kind === 'product' ? { products: [c.productId], models: [] } : { products: [], models: [c.modelId] };
  let div = null;
  if (c.kind === 'product') { const p = PLAN.byId(P, 'product', c.productId); div = p ? p.divisionId : null; }
  else { const m = PLAN.byId(P, 'model', c.modelId); const p = m ? PLAN.byId(P, 'product', m.productId) : null; div = p ? p.divisionId : null; }
  let all = [];
  Object.keys(D.spec || {}).forEach((k) => { all = all.concat((D.spec[k] && D.spec[k].kpis) || []); });
  const kpis = RD.targetKpisInScope(targets, all);
  const loaded = !!(D.spec || {})['SPEC-' + div];
  const fullEm = ctx.fullEm;
  const pool = C.memo('ped.fullPool', () => planPool(fullEm));
  const label = c.kind === 'product' ? PLAN.nameOf(PLAN.byId(P, 'product', c.productId)) : PLAN.nameOf(PLAN.byId(P, 'model', c.modelId));
  const rows = loaded ? kpis.map((k) => {
    const cv = RD.effValue(k, pool, fullEm), sc = RD.kpiScoreResolved(k, pool, fullEm), b = RD.band(sc);
    const unit = RD.kpiUnit(k, pool) || k.unit || '';
    return { name: RD.kpiName(k, pool) || k.id, summary: pedSummary(Object.assign({}, k, { unit: unit })), cur: cv == null ? 'No reading' : pedVal(cv, unit), dotCls: 'dot ' + F.tone(PLAN.tone(b)), word: PLAN.word(b), score: F.score(sc), scoreCls: 'num strong tx-' + PLAN.tone(b) };
  }) : [];
  let hint = '';
  if (!loaded) hint = 'The spec document for this ' + c.kind + ' isn’t loaded' + (C.state.bk && C.state.bk.token ? '.' : '. Add a broker token in Settings.');
  else if (!rows.length) hint = 'No headline KPIs on this ' + c.kind + ' yet. Add them in Product spec.';
  return {
    head: (c.kind === 'product' ? 'Product specifications: ' : 'Model specifications: ') + label,
    rows: rows, has: rows.length > 0, hint: hint, hasHint: !!hint,
    isModel: c.kind === 'model',
    openSpec: () => C.handoff({ app: 'spec', model: c.modelId })
  };
}
function pedStatusVM(C, ctx, ms) {
  const em = ctx.em, P = ctx.P;
  const s = RD.milestoneScore(ms.id, em), ach = RD.milestoneAchieved(ms, em), b = RD.band(s);
  const hasPms = typeof PMS !== 'undefined' && PMS && typeof PMS.openReport === 'function';
  return {
    achieved: ach,
    achText: ach ? (ms.completedDate != null ? 'Marked complete ' + F.dayY(ms.completedDate) : 'KPI target met') : '',
    hasBand: !ach && s != null, dotCls: 'dot ' + F.tone(PLAN.tone(b)), word: PLAN.word(b),
    noRead: !ach && s == null,
    noReadText: 'No reading yet. Set a completed date, or link a key result or stage-gate to a milestone KPI in Execution.',
    hasScore: s != null, score: F.score(s), scoreCls: 'num strong tx-' + PLAN.tone(b),
    reportLabel: ms.milestoneReport ? 'Open report' : 'Create report',
    locked: !!(ms.milestoneReport && ms.milestoneReport.locked),
    report: () => {
      if (hasPms) { PMS.openReport(C, ctx, ms.id); return; }
      C.setState({ tab: 'milestones', sheets: [], menu: '' });
      C.toast('Reports open from the Milestones tab.', 'info');
    }
  };
}
function pedPauseVM(C, ctx, ms, d) {
  const cur = PLAN.msState(ctx.P, ms.id);
  const st = (cur && cur.status) || 'active';
  const paused = st === 'paused' || st === 'deprioritized';
  const apply = (status) => {
    const note = String((C.draft() || {})._why || '').trim();
    pedMilestoneStatus(C, ctx, ms.id, status, status === 'active' ? '' : note);
    if (C.sheet() && C.sheet().kind === 'ped.edit') C.setDraft({ _why: '' });
  };
  return {
    paused: paused, active: !paused,
    stateText: (st === 'paused' ? 'Paused' : 'Deprioritized') + (cur && cur.day != null ? ' since ' + F.dayY(cur.day) : ''),
    note: cur && cur.note ? cur.note : '', hasNote: !!(cur && cur.note),
    pausedHint: 'Kept, and excluded from dates and scores. Shown on the Gantt only when paused milestones are displayed.',
    activeHint: 'Keeps the milestone and its dates, but stops it counting toward any rollup and takes it off the Gantt.',
    why: d._why || '', onWhy: C.bindDraft('_why'),
    canEdit: !ctx.ro,
    pause: () => apply('paused'), deprio: () => apply('deprioritized'), resume: () => apply('active')
  };
}
function pedMsListVM(C, ctx, initId) {
  const P = ctx.P;
  const list = (P.milestones || []).filter((m) => m.initiativeId === initId).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  return {
    rows: list.map((m) => {
      const b = ctx.msBand(m.id), paused = ctx.paused(m.id);
      return {
        name: m.name || m.id, date: m.plannedDate != null ? F.dayY(m.plannedDate) : 'No date',
        dmdCls: 'ped-dmd ' + F.tone(paused ? 'none' : PLAN.tone(b)), word: paused ? 'Paused' : PLAN.word(b),
        edit: () => PED.open(C, ctx, 'milestone', m.id, { push: true }),
        editLabel: 'Edit milestone ' + (m.name || m.id),
        removeLabel: 'Remove milestone ' + (m.name || m.id),
        remove: () => C.confirm({
          title: 'Delete ' + (m.name || 'this milestone') + '?',
          body: 'It is removed from the initiative and from every objective that links it. This can’t be undone.',
          ok: 'Delete milestone', danger: true,
          onOk: () => C.mutate((D) => { pedDeleteData(D.portfolio, [{ ent: 'milestone', id: m.id }]); }, { msg: 'Milestone deleted.' })
        })
      };
    }),
    none: !list.length,
    canAdd: !ctx.ro,
    add: () => PED.open(C, ctx, 'milestone', null, { parentId: initId, push: true })
  };
}
function pedEditVM(C, ctx, s) {
  const P = ctx.P, D = C.D, d = s.d || {}, type = s.data.type, id = s.data.id;
  const rec = id ? PLAN.byId(P, type, id) : null;
  const ent = PLAN.ENT[type];
  const live = rec ? Object.assign({}, rec) : null;
  /* the division-move warning shows only while the draft still makes that same move */
  let moveMsg = '', armed = false;
  if (rec && s.data.moveSig) {
    const sig = type + ':' + id + ':' + rec.divisionId + '>' + (d.divisionId || '');
    if (sig === s.data.moveSig) { moveMsg = s.data.moveMsg || ''; armed = true; }
  }
  const pushed = (C.state.sheets || []).length > 1;
  const vm = {
    title: (id ? 'Edit ' : 'Add ') + type,
    sub: id ? ent + ', ' + id : 'New ' + type,
    fields: pedFieldsVM(C, ctx, s),
    err: s.err || '', hasErr: !!s.err,
    warn: moveMsg, hasWarn: !!moveMsg,
    okLabel: armed ? 'Move anyway' : (id ? 'Save ' + type : 'Add ' + type),
    okCls: armed ? 'btn danger solid' : 'btn pri',
    save: () => pedSave(C, ctx),
    cancel: () => { if (pushed) C.closeSheet(); else C.closeAllSheets(); },
    cancelLabel: pushed ? 'Back' : 'Cancel',
    isEdit: !!rec,
    canDelete: !!rec && !ctx.ro,
    del: () => PED.del(C, ctx, type, id),
    delLabel: 'Delete ' + type,
    lineage: () => PED.lineage(C, ctx, type, id),
    hasTargets: false, targets: null, hasMsList: false, msList: null, hasSpecs: false, specs: null, hasStatus: false, status: null, hasPause: false, pause: null,
    isObjEdit: !!rec && type === 'objective',
    openHref: rec && type === 'objective' && ctx.appOf(rec.divisionId) === 'sales' ? 'Sales-A.dc.html' : 'Main.dc.html',
    openLabel: rec && type === 'objective' && ctx.appOf(rec.divisionId) === 'sales' ? 'Open in Sales' : 'Open in Execution',
    openApp: () => { if (rec) C.handoff({ app: ctx.appOf(rec.divisionId), objective: rec.id }); }
  };
  if (rec && type === 'initiative') {
    vm.targets = pedTargetsVM(C, ctx, 'initiative', id); vm.hasTargets = true;
    vm.msList = pedMsListVM(C, ctx, id); vm.hasMsList = true;
  }
  if (rec && type === 'milestone') {
    vm.status = pedStatusVM(C, ctx, rec); vm.hasStatus = true;
    vm.targets = pedTargetsVM(C, ctx, 'milestone', id); vm.hasTargets = true;
    vm.pause = pedPauseVM(C, ctx, rec, d); vm.hasPause = true;
  }
  if (live && (type === 'initiative' || type === 'objective')) {
    vm.specs = pedSpecsVM(C, ctx, live);
    vm.hasSpecs = !!vm.specs;
  }
  return vm;
}
function pedLineageVM(C, ctx, s) {
  const D = C.D, P = ctx.P;
  const type = s.data.type, id = s.data.id;
  const rec = PLAN.byId(P, type, id);
  const col = C.state.ped_lncol || {};
  const go = (t, i) => () => PED.lineage(C, ctx, t, i);
  if (!rec) return { missing: true, found: false, title: 'Not found', sub: 'It may have been deleted.', crumbs: [], rows: [], groups: [], empty: false, canEdit: false, isObj: false, isModel: false, edit: null, openApp: null, openHref: 'Main.dc.html', openLabel: '', openSpec: null };
  const crumbs = [];
  const crumb = (t, i) => { const r = PLAN.byId(P, t, i); if (r) crumbs.push({ label: PLAN.nameOf(r), go: go(t, i) }); };
  if (type === 'product') crumb('division', rec.divisionId);
  else if (type === 'model') { const p = PLAN.byId(P, 'product', rec.productId); if (p) { crumb('division', p.divisionId); crumb('product', p.id); } }
  else if (type === 'initiative') crumb('division', rec.divisionId);
  else if (type === 'milestone') { const i = PLAN.byId(P, 'initiative', rec.initiativeId); if (i) { crumb('division', i.divisionId); crumb('initiative', i.id); } }
  else if (type === 'objective') { if (rec.divisionId) crumb('division', rec.divisionId); if (rec.initiativeId) crumb('initiative', rec.initiativeId); }
  else if (type === 'division' && rec.unitId) { const u = PLAN.byId(P, 'unit', rec.unitId); if (u) crumbs.push({ label: u.name, go: go('unit', u.id) }); }

  const rows = [];
  const toggleKey = (k) => () => C.setState({ ped_lncol: Object.assign({}, C.state.ped_lncol, { [k]: !(C.state.ped_lncol || {})[k] }) });
  const bandTone = (ent, rid) => {
    if (ent === 'milestone') return ctx.paused(rid) ? 'none' : PLAN.tone(ctx.msBand(rid));
    if (ent === 'objective') return PLAN.tone(ctx.objBand(rid));
    if (ent === 'initiative') return PLAN.tone(RD.band(RD.rollupInitiative(rid, P, ctx.em)));
    if (ent === 'division') return PLAN.tone(RD.band(RD.rollupDivision(rid, P, ctx.em)));
    return '';
  };
  const add = (o) => rows.push(Object.assign({ key: '', pad: '', tag: '', label: '', sub: '', hasDot: false, dotCls: 'dot', isMs: false, dmdCls: 'ped-dmd', hasToggle: false, open: 'true', toggle: null, toggleLabel: '', canGo: false, go: null, plain: true, isSet: false }, o));
  const pad = (depth) => 'padding-left: ' + (12 + depth * 20) + 'px';
  const node = (ent, r, depth) => {
    const kids = pedHasKids(D, ent, r.id);
    const k = ent + ':' + r.id;
    const open = !col[k];
    const tone = bandTone(ent, r.id);
    const meta = ent === 'model' ? pedModelMeta(D, r) : pedSubCount(D, ent, r);
    add({
      key: k, pad: pad(depth), tag: PED_TAG[ent], label: PLAN.nameOf(r), sub: meta,
      hasDot: ent !== 'milestone' && !!tone, dotCls: 'dot ' + F.tone(tone || 'none'),
      isMs: ent === 'milestone', dmdCls: 'ped-dmd ' + F.tone(tone || 'none'),
      hasToggle: kids, open: open ? 'true' : 'false', toggle: toggleKey(k), toggleLabel: (open ? 'Collapse ' : 'Expand ') + PLAN.nameOf(r),
      canGo: true, go: go(ent, r.id), plain: false
    });
    if (kids && open) children(ent, r.id, depth + 1);
  };
  const children = (ent, rid, depth) => {
    if (ent === 'division') {
      (P.initiatives || []).filter((i) => i.divisionId === rid).forEach((i) => node('initiative', i, depth));
      (P.products || []).filter((p) => p.divisionId === rid).forEach((p) => node('product', p, depth));
    } else if (ent === 'initiative') {
      (P.milestones || []).filter((m) => m.initiativeId === rid).forEach((m) => node('milestone', m, depth));
      (P.objectives || []).filter((o) => o.initiativeId === rid).forEach((o) => node('objective', o, depth));
    } else if (ent === 'product') {
      (P.models || []).filter((m) => m.productId === rid).forEach((m) => node('model', m, depth));
    } else if (ent === 'objective') {
      const o = PLAN.byId(P, 'objective', rid);
      const doc = o ? PLAN.docOf(D, o.divisionId) : null;
      if (!doc) { add({ pad: pad(depth), label: 'No execution document is loaded for this division.', plain: true }); return; }
      const before = rows.length;
      (doc.keyResults || []).filter((k) => k.objectiveId === rid).forEach((k) => add({ pad: pad(depth), tag: 'Key result', label: k.statement || k.id, plain: true }));
      pedGateGroups(doc, rid).forEach((grp, gi) => {
        if (!grp.gates.length) return;
        add({ pad: pad(depth), tag: 'Workstream', label: grp.set.name || 'Set', plain: true, isSet: true });
        grp.gates.forEach((g, i) => add({ pad: pad(depth + 1), tag: 'SG-' + String.fromCharCode(65 + gi) + (i + 1), label: g.name || g.id, plain: true }));
      });
      if (rows.length === before) add({ pad: pad(depth), label: 'No key results or stage-gates yet.', plain: true });
    } else if (ent === 'unit') {
      (P.divisions || []).filter((d) => (d.unitId || null) === rid).forEach((d) => node('division', d, depth));
    }
  };
  children(type, id, 0);

  const item = (e, r) => ({ tag: PED_TAG[e], name: PLAN.nameOf(r), sub: e === 'model' ? pedModelMeta(D, r) : pedSubCount(D, e, r), go: go(e, r.id) });
  const groups = [];
  const classOf = (r) => { const c = []; if (r && r.productId) { const p = PLAN.byId(P, 'product', r.productId); if (p) c.push(item('product', p)); } if (r && r.modelId) { const m = PLAN.byId(P, 'model', r.modelId); if (m) c.push(item('model', m)); } return c; };
  const compItem = (mid) => { const m = PLAN.byId(P, 'model', mid); if (!m) return null; const p = PLAN.byId(P, 'product', m.productId); const dv = p ? PLAN.byId(P, 'division', p.divisionId) : null; return { tag: 'Model', name: (p ? p.name + ', ' : '') + m.name, sub: dv ? dv.name : '', go: go('model', mid) }; };
  if (type === 'objective') {
    const cls = classOf(rec); if (cls.length) groups.push({ title: 'Classification', items: cls });
    const mils = (rec.milestoneIds || []).map((mid) => PLAN.byId(P, 'milestone', mid)).filter(Boolean);
    if (mils.length) groups.push({ title: 'Linked milestones', items: mils.map((m) => item('milestone', m)) });
  } else if (type === 'initiative') {
    const cls = classOf(rec); if (cls.length) groups.push({ title: 'Classification', items: cls });
  } else if (type === 'milestone') {
    const objs = (P.objectives || []).filter((o) => (o.milestoneIds || []).indexOf(id) >= 0);
    if (objs.length) groups.push({ title: 'Objectives linking this', items: objs.map((o) => item('objective', o)) });
  } else if (type === 'product' || type === 'model') {
    const key = type === 'product' ? 'productId' : 'modelId';
    const inits = (P.initiatives || []).filter((i) => i[key] === id);
    if (inits.length) groups.push({ title: 'Initiatives classified here', items: inits.map((i) => item('initiative', i)) });
    const objs = (P.objectives || []).filter((o) => o[key] === id);
    if (objs.length) groups.push({ title: 'Objectives classified here', items: objs.map((o) => item('objective', o)) });
    if (type === 'model') {
      const comp = P.composition || [];
      const kids = RD.compositionChildren(id, comp).map(compItem).filter(Boolean);
      if (kids.length) groups.push({ title: 'Composed of', items: kids });
      const par = RD.compositionParents(id, comp).map(compItem).filter(Boolean);
      if (par.length) groups.push({ title: 'Used in', items: par });
    }
  }
  const app = type === 'objective' ? ctx.appOf(rec.divisionId) : 'exec';
  return {
    missing: false, found: true,
    title: PLAN.nameOf(rec), sub: PLAN.ENT[type], tid: id,
    crumbs: crumbs, hasCrumbs: crumbs.length > 0, here: PLAN.nameOf(rec),
    rows: rows, empty: !rows.length,
    groups: groups,
    canEdit: !ctx.ro,
    edit: () => PED.open(C, ctx, type, id),
    editLabel: 'Edit ' + type,
    isObj: type === 'objective', isModel: type === 'model',
    openHref: app === 'sales' ? 'Sales-A.dc.html' : 'Main.dc.html',
    openLabel: app === 'sales' ? 'Open in Sales' : 'Open in Execution',
    openApp: () => C.handoff({ app: app, objective: id }),
    openSpec: () => C.handoff({ app: 'spec', model: id })
  };
}
function pedModelMeta(D, m) {
  const P = D.portfolio;
  const sc = pedModelConf(D, m.id), meta = pedSpecMeta(D, m.id);
  const comp = P.composition || [];
  const nKids = RD.compositionChildren(m.id, comp).length, nPar = RD.compositionParents(m.id, comp).length;
  const bits = [];
  if (meta.maturity) bits.push(meta.maturity);
  if (sc != null) bits.push(Math.round(sc) + '% conformance');
  if (nKids) bits.push(F.plural(nKids, 'sub-product'));
  if (nPar) bits.push('used in ' + F.plural(nPar, 'model'));
  return bits.join(', ');
}
function pedDeleteVM(C, ctx, s) {
  const P = ctx.P, type = s.data.type, id = s.data.id;
  const rec = PLAN.byId(P, type, id);
  if (!rec) return { title: 'Delete ' + type, lead: 'Already deleted.', body: '', onlyHint: '', only: () => C.closeSheet(), all: () => C.closeSheet(), onlyLabel: 'Close', allLabel: 'Close', onlyTitle: '', cancel: () => C.closeSheet() };
  const kids = pedCascadeSet(P, type, id);
  const counts = {};
  kids.forEach((k) => { counts[k.ent] = (counts[k.ent] || 0) + 1; });
  const summary = F.list(['product', 'model', 'initiative', 'objective', 'milestone'].filter((k) => counts[k]).map((k) => F.plural(counts[k], k)));
  return {
    title: 'Delete ' + type,
    lead: 'Delete ' + PLAN.nameOf(rec) + '?',
    body: 'This ' + type + ' contains ' + summary + '. Delete those too, or keep them?',
    onlyLabel: 'Delete ' + type + ' only',
    onlyTitle: 'Keep the nested items; they lose their ' + type + ' link',
    onlyHint: 'Keeps the nested items. They lose their link to this ' + type + '.',
    allLabel: 'Delete ' + type + ' and ' + F.plural(kids.length, 'item'),
    only: () => pedRunDelete(C, type, id, false),
    all: () => pedRunDelete(C, type, id, true),
    cancel: () => C.closeSheet()
  };
}

const PED = {
  open: (C, ctx, type, id, opts) => pedOpen(C, ctx, type, id, opts),
  lineage: (C, ctx, type, id) => pedLineage(C, ctx, type, id),
  del: (C, ctx, type, id) => pedDel(C, ctx, type, id),
  milestoneStatus: (C, ctx, msId, status, note) => pedMilestoneStatus(C, ctx, msId, status, note)
};

MODS.ped = {
  state: { ped_rec: null, ped_lncol: {} },
  wide: ['ped.lineage'],
  vm(C, ctx) {
    const s = C.sheet();
    const kind = s ? s.kind : '';
    return {
      edit: kind === 'ped.edit' ? pedEditVM(C, ctx, s) : null,
      target: kind === 'ped.target' ? pedTargetVM(C, ctx, s) : null,
      lineage: kind === 'ped.lineage' ? pedLineageVM(C, ctx, s) : null,
      del: kind === 'ped.delete' ? pedDeleteVM(C, ctx, s) : null
    };
  }
};
