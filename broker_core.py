"""
broker_core.py — pure, dependency-free port of the Division Tracker's JS CORE
builders (the block between ==CORE_START== / ==CORE_END== in
q-tracker-division.html).

These functions own the *document structure*. The browser sends values; the
broker applies them through these functions so a write produces exactly the same
record the in-browser path would have. The JS CORE harness (verify1.py) is the
spec — test_broker_core.py mirrors its assertions one-to-one and the two MUST
agree. Nothing here does I/O.

Forward note (Azure): none of these change for the Table Storage migration —
they shape JSON, not storage. Only the storage seam in broker.py is swapped.
"""

import math
from datetime import datetime, timezone


def _is_num(x):
    """True for a real number, excluding bool (which is an int subclass)."""
    return isinstance(x, (int, float)) and not isinstance(x, bool)


# ---------------------------------------------------------------- ids / lookup
def unprefix_id(prefixed_id):
    """'fc_123' -> 123. Bare numeric string -> int. Non-numeric raw -> str.
    Mirrors the JS unprefixId (parseInt round-trip)."""
    s = str(prefixed_id)
    i = s.find('_')
    raw = s if i < 0 else s[i + 1:]
    try:
        n = int(raw)
    except (ValueError, TypeError):
        return raw
    return n if str(n) == raw else raw


def find_project_by_id(projects, pid):
    """Locate a project by id, tolerant of int/str id mismatch."""
    t = str(pid)
    for p in (projects or []):
        if p and str(p.get('id')) == t:
            return p
    return None


def next_project_id(projects):
    """max numeric id in the bin + 1, floored at 10000. Mirrors the Gantt."""
    m = 9999
    for p in (projects or []):
        i = p.get('id')
        if _is_num(i) and i > m:
            m = i
    return m + 1


# ----------------------------------------------------------------- new records
def new_project_base(pid, name, division):
    return {
        'id': pid, 'name': (name or '').strip(), 'division': division or 'fuelcell',
        'projectType': 'task', 'milestone': False, 'parentId': None,
        'start': '', 'end': '',
        'effortType': 'NRE', 'productLine': '', 'productModel': '',
        'resources': [], 'equipment': [], 'dependencies': [], 'kpis': [], 'milestoneKpis': [],
        'keyResults': [], 'stageGates': [], 'stageGatesLinked': True, 'associatedObjectives': [],
        'isStageGate': False, 'stageGateId': None, 'progress': 0, 'progressType': 'percentage',
        'datePrecision': 'exact', 'completedDate': None, 'manuallyCompleted': False,
        'baselineEndDate': None, 'tentative': False, 'trl': None, 'mrl': None, 'milestoneReport': None,
    }


def build_objective(o):
    o = o or {}
    p = new_project_base(o.get('id'), o.get('name'), o.get('division'))
    p['projectType'] = 'objective'
    p['start'] = o.get('start') or ''
    p['end'] = o.get('end') or ''
    kr = o.get('kr')
    if kr and (kr.get('name') or '').strip():
        raw = kr.get('progress')
        pr = raw if (_is_num(raw) and math.isfinite(raw)) else 0
        pr = max(0, min(100, pr))
        p['keyResults'] = [{'id': 'kr-1', 'name': kr['name'].strip(),
                            'trackingType': 'percentage', 'progress': pr}]
    return p


def build_initiative(o):
    o = o or {}
    p = new_project_base(o.get('id'), o.get('name'), o.get('division'))
    p['projectType'] = 'initiative'
    p['productLine'] = o.get('productLine') or ''
    p['productModel'] = o.get('productModel') or ''
    p['start'] = o.get('start') or ''
    p['end'] = o.get('end') or ''
    return p


def build_milestone(o):
    o = o or {}
    p = new_project_base(o.get('id'), o.get('name'), o.get('division'))
    p['projectType'] = 'milestone'
    p['milestone'] = True
    p['start'] = o.get('dueDate') or ''
    p['end'] = o.get('dueDate') or ''
    owner = o.get('ownerId')
    p['parentId'] = owner if (owner is not None and owner != '') else None
    p['productLine'] = o.get('productLine') or ''
    p['productModel'] = o.get('productModel') or ''
    return p


def is_milestone_project(p):
    return bool(p) and (p.get('projectType') == 'milestone' or bool(p.get('milestone')))


# -------------------------------------------------------------- immutable edits
def apply_objective_edit(project, f):
    """name / start / end only. division untouched (locked); keyResults left as
    the same reference (edited elsewhere)."""
    p = dict(project)
    if f.get('name') is not None:
        p['name'] = str(f['name']).strip()
    if f.get('start') is not None:
        p['start'] = f['start'] or ''
    if f.get('end') is not None:
        p['end'] = f['end'] or ''
    return p


def apply_initiative_edit(project, f):
    p = dict(project)
    if f.get('name') is not None:
        p['name'] = str(f['name']).strip()
    if f.get('productLine') is not None:
        p['productLine'] = f['productLine'] or ''
    if f.get('productModel') is not None:
        p['productModel'] = f['productModel'] or ''
    if f.get('start') is not None:
        p['start'] = f['start'] or ''
    if f.get('end') is not None:
        p['end'] = f['end'] or ''
    return p


def apply_milestone_edit(project, f):
    p = dict(project)
    if f.get('name') is not None:
        p['name'] = str(f['name']).strip()
    if f.get('dueDate') is not None:
        p['start'] = f['dueDate'] or ''
        p['end'] = f['dueDate'] or ''
    if 'ownerId' in f:                       # JS: f.ownerId !== undefined
        owner = f.get('ownerId')
        p['parentId'] = owner if (owner is not None and owner != '') else None
    if f.get('productLine') is not None:
        p['productLine'] = f['productLine'] or ''
    if f.get('productModel') is not None:
        p['productModel'] = f['productModel'] or ''
    return p


# ------------------------------------------------------- hub association maps
def with_association(import_associations, initiative_id, prefixed_obj_id):
    """Add an objective under an initiative bucket (create path)."""
    m = {k: list(v or []) for k, v in (import_associations or {}).items()}
    key = str(initiative_id)
    if not isinstance(m.get(key), list):
        m[key] = []
    if prefixed_obj_id not in m[key]:
        m[key].append(prefixed_obj_id)
    return m


def with_product_assoc(import_product_assoc, prefixed_obj_id, product_line_id, product_model_id):
    """Add/overwrite an objective's product link (create path). No removal."""
    m = dict(import_product_assoc or {})
    if product_line_id:
        m[prefixed_obj_id] = {'productLine': product_line_id, 'productModel': product_model_id or ''}
    return m


def move_association(import_associations, old_init_id, new_init_id, prefixed_obj_id):
    """Edit path: an objective belongs to at most one initiative. Remove it from
    every bucket except the new one, then add under the new id. new_init_id
    ''/None clears the link entirely. old_init_id is accepted for signature
    parity but unused (the all-buckets sweep covers it)."""
    m = {k: list(v or []) for k, v in (import_associations or {}).items()}
    nk = str(new_init_id) if (new_init_id is not None and new_init_id != '') else None
    for k in list(m.keys()):
        if k != nk:
            m[k] = [x for x in m[k] if x != prefixed_obj_id]
    if nk is not None:
        if not isinstance(m.get(nk), list):
            m[nk] = []
        if prefixed_obj_id not in m[nk]:
            m[nk].append(prefixed_obj_id)
    return m


def set_product_assoc(import_product_assoc, prefixed_obj_id, product_line_id, product_model_id):
    """Edit path: set OR clear an objective's product link (falsy line removes)."""
    m = dict(import_product_assoc or {})
    if product_line_id:
        m[prefixed_obj_id] = {'productLine': product_line_id, 'productModel': product_model_id or ''}
    else:
        m.pop(prefixed_obj_id, None)
    return m


# --------------------------------------------------- write helpers (rev/version)
def next_rev(cur):
    """Per-object revision bump. Missing/non-int -> starts at 1."""
    return (cur if (isinstance(cur, int) and not isinstance(cur, bool)) else 0) + 1


def rev_conflict(current_rev, base_rev):
    """Conflict only when BOTH sides carry a concrete rev and they differ. A null
    base_rev (legacy/never-stamped record on the client) skips the strict check;
    a null current_rev (legacy record on the server) can't prove a conflict.
    This tightens automatically once every record is broker-stamped — and is the
    forward-analog of Azure's per-entity ETag check."""
    if base_rev is None or current_rev is None:
        return False
    return base_rev != current_rev


def replace_in_place(projects, updated):
    """Swap a project by id (writes back an immutable apply_*_edit result)."""
    for i, p in enumerate(projects):
        if str(p.get('id')) == str(updated.get('id')):
            projects[i] = updated
            return True
    return False


def bump_version(doc):
    """Bump the bin-level _version the Gantt's poll watches; stamp provenance."""
    doc['_version'] = (doc.get('_version') or 0) + 1
    doc['_savedAt'] = datetime.now(timezone.utc).isoformat()
    doc['_savedBy'] = 'division-broker'
    return doc['_version']
