"""
broker.py — Division Tracker write broker (FastAPI, single-worker).

Why this exists
---------------
JSONBin has no conditional write: a PUT is a whole-document replace and the
server will accept a stale one, silently clobbering a concurrent writer. The
browser-only path can't close that race because there is no coordinator. This
service is the coordinator: every write to a given bin runs inside a per-bin
lock in ONE process, so writers genuinely serialize instead of racing. It also
keeps the JSONBin master key server-side — the browser holds only a revocable
broker token.

Guarantee & its single condition
---------------------------------
The serialization guarantee holds because there is exactly one writer process.
Run with ONE web worker. Multiple uvicorn workers (or autoscaled instances)
each get their own in-memory lock and the race returns. See Procfile.

Storage seam (the Azure swap point)
-----------------------------------
All persistence goes through `store` with three methods: read(bin), write(bin,
doc), lock(bin). The JSONBin implementation supplies atomicity via the lock and
treats `_rev` as a manual per-object version checked inside the lock. The Azure
Table Storage migration replaces JUST this object: write becomes an
`If-Match: etag` conditional update, lock becomes a nullcontext, and `_rev`
becomes the entity ETag. Handlers and the client contract do not change.
"""

import hmac
import os
import threading
import time
from collections import defaultdict

import requests
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import broker_core as core

# --------------------------------------------------------------- config
# Divisional source codes + the env var holding each division's bin id. Matches
# SOURCE_BINS in q-tracker-division.html. Objectives are prefixed source+'_'+id;
# initiatives/milestones are hub-native (raw numeric id).
DIVISIONS = [
    {'division': 'fuelcell',     'source': 'fc',  'env': 'JSONBIN_BIN_FC'},
    {'division': 'electrolyzer', 'source': 'el',  'env': 'JSONBIN_BIN_EL'},
    {'division': 'exploration',  'source': 'exp', 'env': 'JSONBIN_BIN_EXP'},
]


def _env(name):
    return (os.environ.get(name) or '').strip()


def hub_bin_id():
    return _env('JSONBIN_BIN_HUB') or None


def div_meta(name):
    return next((d for d in DIVISIONS if d['division'] == name), None)


def div_meta_by_source(src):
    return next((d for d in DIVISIONS if d['source'] == src), None)


def div_bin_id(name):
    d = div_meta(name)
    if not d:
        return None
    return _env(d['env']) or None


# --------------------------------------------------------------- storage seam
class StoreError(Exception):
    pass


class JSONBinStore:
    """read / write / lock over JSONBin, with a per-bin lock + bounded backoff.

    Swap target (Azure Table Storage): replace this class. `write` becomes a
    conditional `If-Match` update keyed by ETag and the lock becomes a no-op,
    because the store enforces concurrency server-side."""

    BASE = 'https://api.jsonbin.io/v3/b/'

    def __init__(self, master_key, retries=4, backoff=0.5, timeout=20):
        self.master_key = master_key
        self.retries = retries
        self.backoff = backoff
        self.timeout = timeout
        self._locks = defaultdict(threading.Lock)
        self._guard = threading.Lock()

    def lock(self, bin_id):
        # Guard the defaultdict so two threads racing on a new bin id share one lock.
        with self._guard:
            return self._locks[bin_id]

    def read(self, bin_id):
        url = self.BASE + bin_id + '/latest'
        headers = {'X-Master-Key': self.master_key, 'X-Bin-Meta': 'false'}
        r = self._req('GET', url, headers)
        data = r.json()
        if isinstance(data, dict):
            return data.get('record', data)   # tolerate wrapped or bare
        return data

    def write(self, bin_id, doc):
        # NB: X-Bin-Private / X-Bin-Meta are intentionally omitted on PUT —
        # sending X-Bin-Private makes JSONBin create a NEW bin.
        url = self.BASE + bin_id
        headers = {'Content-Type': 'application/json', 'X-Master-Key': self.master_key}
        self._req('PUT', url, headers, json=doc)

    def _req(self, method, url, headers, json=None):
        last = None
        for attempt in range(self.retries):
            try:
                r = requests.request(method, url, headers=headers, json=json, timeout=self.timeout)
                if r.status_code in (429, 500, 502, 503, 504):
                    last = StoreError(f'JSONBin {r.status_code}')
                    time.sleep(self.backoff * (2 ** attempt))
                    continue
                if not r.ok:
                    raise StoreError(f'{method} {r.status_code}: {r.text[:200]}')
                return r
            except requests.RequestException as e:
                last = e
                time.sleep(self.backoff * (2 ** attempt))
        raise last or StoreError('request failed')


_store = None


def get_store():
    """Overridable in tests via app.dependency_overrides[get_store]."""
    global _store
    if _store is None:
        _store = JSONBinStore(_env('JSONBIN_MASTER_KEY'))
    return _store


# --------------------------------------------------------------- auth
def require_auth(authorization: str = Header(default='')):
    token = _env('BROKER_TOKEN')
    if not token:
        raise HTTPException(status_code=500, detail='broker token not configured')
    parts = authorization.split(' ', 1)
    supplied = parts[1] if len(parts) == 2 and parts[0] == 'Bearer' else ''
    if not hmac.compare_digest(supplied, token):
        raise HTTPException(status_code=401, detail='unauthorized')


# --------------------------------------------------------------- request models
class KR(BaseModel):
    name: str = ''
    progress: float = 0


class ObjectiveCreate(BaseModel):
    name: str
    division: str
    productLine: str = ''
    productModel: str = ''
    initiativeId: str = ''
    start: str = ''
    end: str = ''
    kr: KR | None = None


class ObjectiveEdit(BaseModel):
    name: str
    baseRev: int | None = None
    initiativeId: str = ''
    productLine: str = ''
    productModel: str = ''
    start: str = ''
    end: str = ''


class InitiativeCreate(BaseModel):
    name: str
    division: str
    productLine: str = ''
    productModel: str = ''
    start: str = ''
    end: str = ''


class InitiativeEdit(BaseModel):
    name: str
    baseRev: int | None = None
    productLine: str = ''
    productModel: str = ''
    start: str = ''
    end: str = ''


class MilestoneCreate(BaseModel):
    name: str
    division: str
    dueDate: str
    ownerId: str = ''
    productLine: str = ''
    productModel: str = ''


class MilestoneEdit(BaseModel):
    name: str
    baseRev: int | None = None
    dueDate: str
    ownerId: str = ''
    productLine: str = ''
    productModel: str = ''


# --------------------------------------------------------------- responses
def ok_response(id=None, rev=None, versions=None, warning=None):
    body = {'ok': True}
    if id is not None:
        body['id'] = id
    if rev is not None:
        body['rev'] = rev
    if versions is not None:
        body['version'] = versions
    if warning:
        body['warning'] = 'links_failed'
        body['detail'] = warning
    return body


def conflict_response(current):
    return JSONResponse(status_code=409, content={'ok': False, 'error': 'conflict', 'current': current})


# --------------------------------------------------------------- app
app = FastAPI(title='Division Tracker Broker')

_origins = [o.strip() for o in _env('ALLOWED_ORIGINS').split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ['*'],
    allow_methods=['GET', 'POST', 'PATCH', 'OPTIONS'],
    allow_headers=['Authorization', 'Content-Type'],
)


@app.get('/health')
def health():
    return {
        'ok': True,
        'service': 'division-broker',
        'bins_configured': {
            'hub': hub_bin_id() is not None,
            'fuelcell': div_bin_id('fuelcell') is not None,
            'electrolyzer': div_bin_id('electrolyzer') is not None,
            'exploration': div_bin_id('exploration') is not None,
        },
    }


@app.get('/state')
def get_state(store=Depends(get_store), _=Depends(require_auth)):
    """Raw passthrough of the hub bin + every configured division bin. The
    browser runs its existing, tested assembly (id prefixing, association and
    product-name resolution, model build) on these docs — the broker stays a
    thin credential boundary and write serializer, not a model builder, which
    also keeps the Azure swap small. No lock is taken: these are reads. A bin
    that can't be read surfaces as 502 naming which bin failed; the browser
    keeps its render-cache painted."""
    out = {'ok': True, 'hub': None, 'divisions': {}}
    hub = hub_bin_id()
    if hub:
        try:
            out['hub'] = store.read(hub)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f'failed to read hub bin: {e}')
    for d in DIVISIONS:
        b = div_bin_id(d['division'])
        if not b:
            continue
        try:
            out['divisions'][d['division']] = store.read(b)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"failed to read {d['division']} bin: {e}")
    return out


# ---- shared hub-link application (objective create + edit) ----
def apply_objective_links(store, prefixed, initiative_id, product_line, product_model, is_edit):
    """Update the hub's association + product maps for an objective. Returns a
    warning string if the hub write fails (the division-bin write already
    stands), else None. Create skips entirely when there are no links to set;
    edit always runs (it may be *clearing* a link)."""
    hub = hub_bin_id()
    if not hub:
        return None
    if not is_edit and not (initiative_id or product_line):
        return None
    try:
        with store.lock(hub):
            hdoc = store.read(hub)
            assoc = hdoc.get('importAssociations') or {}
            passoc = hdoc.get('importProductAssoc') or {}
            if is_edit:
                hdoc['importAssociations'] = core.move_association(assoc, None, initiative_id or '', prefixed)
                hdoc['importProductAssoc'] = core.set_product_assoc(passoc, prefixed, product_line, product_model)
            else:
                if initiative_id:
                    hdoc['importAssociations'] = core.with_association(assoc, initiative_id, prefixed)
                if product_line:
                    hdoc['importProductAssoc'] = core.with_product_assoc(passoc, prefixed, product_line, product_model)
            core.bump_version(hdoc)
            store.write(hub, hdoc)
        return None
    except Exception as e:  # noqa: BLE001 — surface as a partial-success warning
        return str(e)


def _hub_create(store, build_fn, payload):
    hub = hub_bin_id()
    if not hub:
        raise HTTPException(status_code=400, detail='a hub bin is required')
    with store.lock(hub):
        doc = store.read(hub)
        projects = doc.get('projects')
        if not isinstance(projects, list):
            projects = []
            doc['projects'] = projects
        raw_id = core.next_project_id(projects)
        rec = build_fn({**payload, 'id': raw_id})
        rec['_rev'] = 1
        projects.append(rec)
        version = core.bump_version(doc)
        store.write(hub, doc)
    return raw_id, version


def _hub_edit(store, kind, item_id, fields, base_rev, apply_fn, type_check):
    hub = hub_bin_id()
    if not hub:
        raise HTTPException(status_code=400, detail='a hub bin is required')
    with store.lock(hub):
        doc = store.read(hub)
        projects = doc.get('projects') or []
        target = core.find_project_by_id(projects, item_id)
        if target is None:
            raise HTTPException(status_code=404, detail=f'{kind} not found')
        if not type_check(target):
            raise HTTPException(status_code=400, detail=f'that id is not a {kind}')
        cur_rev = target.get('_rev')
        if core.rev_conflict(cur_rev, base_rev):
            return conflict_response({'name': target.get('name'), 'rev': cur_rev,
                                      'productLine': target.get('productLine', ''),
                                      'productModel': target.get('productModel', '')})
        updated = apply_fn(target, fields)
        updated['_rev'] = core.next_rev(cur_rev)
        core.replace_in_place(projects, updated)
        version = core.bump_version(doc)
        store.write(hub, doc)
    return ok_response(id=item_id, rev=updated['_rev'], versions={'hub': version})


# ---- objectives (division bin + hub links) ----
@app.post('/objective')
def create_objective(body: ObjectiveCreate, store=Depends(get_store), _=Depends(require_auth)):
    d = div_meta(body.division)
    if not d:
        raise HTTPException(status_code=400, detail=f'unknown division: {body.division}')
    div_bin = div_bin_id(body.division)
    if not div_bin:
        raise HTTPException(status_code=400, detail=f'division not configured: {body.division}')
    kr = {'name': body.kr.name, 'progress': body.kr.progress} if body.kr else None
    with store.lock(div_bin):
        doc = store.read(div_bin)
        projects = doc.get('projects')
        if not isinstance(projects, list):
            projects = []
            doc['projects'] = projects
        raw_id = core.next_project_id(projects)
        obj = core.build_objective({'id': raw_id, 'name': body.name, 'division': body.division,
                                    'start': body.start, 'end': body.end, 'kr': kr})
        obj['_rev'] = 1
        projects.append(obj)
        version = core.bump_version(doc)
        store.write(div_bin, doc)
    prefixed = d['source'] + '_' + str(raw_id)
    warning = apply_objective_links(store, prefixed, body.initiativeId, body.productLine, body.productModel, is_edit=False)
    return ok_response(id=prefixed, rev=1, versions={body.division: version}, warning=warning)


@app.patch('/objective/{prefixed_id}')
def edit_objective(prefixed_id: str, body: ObjectiveEdit, store=Depends(get_store), _=Depends(require_auth)):
    src = prefixed_id.split('_', 1)[0] if '_' in prefixed_id else ''
    d = div_meta_by_source(src)
    if not d:
        raise HTTPException(status_code=400, detail=f'unrecognized objective id: {prefixed_id}')
    div_bin = div_bin_id(d['division'])
    if not div_bin:
        raise HTTPException(status_code=400, detail=f'division not configured: {d["division"]}')
    raw_id = core.unprefix_id(prefixed_id)
    with store.lock(div_bin):
        doc = store.read(div_bin)
        projects = doc.get('projects') or []
        target = core.find_project_by_id(projects, raw_id)
        if target is None:
            raise HTTPException(status_code=404, detail='objective not found')
        cur_rev = target.get('_rev')
        if core.rev_conflict(cur_rev, body.baseRev):
            return conflict_response({'name': target.get('name'), 'start': target.get('start'),
                                      'end': target.get('end'), 'rev': cur_rev})
        updated = core.apply_objective_edit(target, {'name': body.name, 'start': body.start, 'end': body.end})
        updated['_rev'] = core.next_rev(cur_rev)
        core.replace_in_place(projects, updated)
        version = core.bump_version(doc)
        store.write(div_bin, doc)
        new_rev = updated['_rev']
    warning = apply_objective_links(store, prefixed_id, body.initiativeId, body.productLine, body.productModel, is_edit=True)
    return ok_response(id=prefixed_id, rev=new_rev, versions={d['division']: version}, warning=warning)


# ---- initiatives (hub) ----
@app.post('/initiative')
def create_initiative(body: InitiativeCreate, store=Depends(get_store), _=Depends(require_auth)):
    if not div_meta(body.division):
        raise HTTPException(status_code=400, detail=f'unknown division: {body.division}')
    raw_id, version = _hub_create(store, core.build_initiative, {
        'name': body.name, 'division': body.division,
        'productLine': body.productLine, 'productModel': body.productModel,
        'start': body.start, 'end': body.end,
    })
    return ok_response(id=raw_id, rev=1, versions={'hub': version})


@app.patch('/initiative/{init_id}')
def edit_initiative(init_id: str, body: InitiativeEdit, store=Depends(get_store), _=Depends(require_auth)):
    return _hub_edit(
        store, 'initiative', init_id,
        {'name': body.name, 'productLine': body.productLine, 'productModel': body.productModel,
         'start': body.start, 'end': body.end},
        body.baseRev, core.apply_initiative_edit,
        lambda t: t.get('projectType') == 'initiative',
    )


# ---- milestones (hub) ----
@app.post('/milestone')
def create_milestone(body: MilestoneCreate, store=Depends(get_store), _=Depends(require_auth)):
    if not div_meta(body.division):
        raise HTTPException(status_code=400, detail=f'unknown division: {body.division}')
    raw_id, version = _hub_create(store, core.build_milestone, {
        'name': body.name, 'division': body.division, 'dueDate': body.dueDate,
        'ownerId': body.ownerId, 'productLine': body.productLine, 'productModel': body.productModel,
    })
    return ok_response(id=raw_id, rev=1, versions={'hub': version})


@app.patch('/milestone/{ms_id}')
def edit_milestone(ms_id: str, body: MilestoneEdit, store=Depends(get_store), _=Depends(require_auth)):
    return _hub_edit(
        store, 'milestone', ms_id,
        {'name': body.name, 'dueDate': body.dueDate, 'ownerId': body.ownerId,
         'productLine': body.productLine, 'productModel': body.productModel},
        body.baseRev, core.apply_milestone_edit,
        core.is_milestone_project,
    )