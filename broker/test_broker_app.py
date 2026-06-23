"""
test_broker_app.py — end-to-end handler tests with an in-memory store (no
network). Exercises create, edit, the rev-conflict 409, legacy null-rev writes,
the links-failed partial success, and auth. Run: `python3 test_broker_app.py`.
"""

import json
import os
import threading
from collections import defaultdict

# Env must be set before importing broker (bin resolution reads it).
os.environ.setdefault('JSONBIN_MASTER_KEY', 'x')
os.environ.setdefault('JSONBIN_BIN_HUB', 'HUB')
os.environ.setdefault('JSONBIN_BIN_FC', 'FC')
os.environ.setdefault('JSONBIN_BIN_EL', 'EL')
os.environ.pop('JSONBIN_BIN_EXP', None)          # exploration intentionally unconfigured
os.environ.setdefault('BROKER_TOKEN', 'testtoken')
os.environ.setdefault('ALLOWED_ORIGINS', 'http://localhost')

import broker  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

AUTH = {'Authorization': 'Bearer testtoken'}
PASS = 0
FAIL = 0
MSGS = []


def ok(cond, msg):
    global PASS, FAIL
    if cond:
        PASS += 1
    else:
        FAIL += 1
        MSGS.append('FAIL: ' + msg)


def eq(a, b, msg):
    ok(a == b, f'{msg}  got={a!r} want={b!r}')


class FakeStore:
    def __init__(self, seed):
        self._bins = {k: json.loads(json.dumps(v)) for k, v in seed.items()}
        self._locks = defaultdict(threading.Lock)
        self.fail_bins = set()

    def lock(self, b):
        return self._locks[b]

    def read(self, b):
        if b not in self._bins:
            raise broker.StoreError('404 ' + b)
        return json.loads(json.dumps(self._bins[b]))   # deep copy, like a GET

    def write(self, b, doc):
        if b in self.fail_bins:
            raise broker.StoreError('simulated write failure ' + b)
        self._bins[b] = json.loads(json.dumps(doc))    # whole-doc replace, like a PUT


def seed():
    return {
        'HUB': {
            '_version': 1,
            'products': [{'id': 'P', 'name': 'Prod', 'division': 'fuelcell', 'models': [{'id': 'M', 'name': 'Gen1'}]}],
            'importAssociations': {'50': ['fc_2']},
            'importProductAssoc': {'fc_2': {'productLine': 'P', 'productModel': 'M'}},
            'projects': [
                {'id': 50, 'projectType': 'initiative', 'division': 'fuelcell', 'name': 'Init', '_rev': 3},
                {'id': 9, 'projectType': 'milestone', 'division': 'fuelcell', 'name': 'MS', 'end': '2026-05-01', 'milestone': True, '_rev': 2},
            ],
        },
        'FC': {'_version': 1, 'projects': [
            {'id': 2, 'projectType': 'objective', 'division': 'fuelcell', 'name': 'Obj', 'start': '', 'end': '', 'keyResults': [], '_rev': 4},
        ]},
        'EL': {'_version': 1, 'projects': []},
    }


def client(store):
    broker.app.dependency_overrides[broker.get_store] = lambda: store
    return TestClient(broker.app)


# --- health is open ---
s = FakeStore(seed())
r = client(s).get('/health')
eq(r.status_code, 200, 'health 200')
eq(r.json()['bins_configured']['exploration'], False, 'health reports exploration unconfigured')

# --- auth required on writes ---
r = client(FakeStore(seed())).post('/objective', json={'name': 'X', 'division': 'fuelcell'})
eq(r.status_code, 401, 'create without token -> 401')

# --- /state returns hub + configured divisions, requires auth ---
s = FakeStore(seed())
r = client(s).get('/state', headers=AUTH)
eq(r.status_code, 200, '/state 200')
body = r.json()
ok(body['hub'] is not None and body['hub'].get('_version') == 1, '/state returns the hub doc')
eq(sorted(body['divisions'].keys()), ['electrolyzer', 'fuelcell'], '/state returns configured divisions only (no exploration)')
ok(any(p['id'] == 2 for p in body['divisions']['fuelcell']['projects']), '/state fuelcell carries its raw projects')

r = client(FakeStore(seed())).get('/state')
eq(r.status_code, 401, '/state without token -> 401')

# --- /state surfaces a bin read failure as 502 ---
s = FakeStore(seed())
del s._bins['FC']                       # make the fuelcell read raise
r = client(s).get('/state', headers=AUTH)
eq(r.status_code, 502, '/state read failure -> 502')

# --- objective create writes div bin + hub links ---
s = FakeStore(seed())
r = client(s).post('/objective', headers=AUTH, json={
    'name': 'New Obj', 'division': 'fuelcell', 'initiativeId': '50', 'productLine': 'P', 'productModel': 'M',
    'kr': {'name': 'hit', 'progress': 40}})
eq(r.status_code, 200, 'objective create 200')
body = r.json()
eq(body['id'], 'fc_10000', 'objective create assigns prefixed id')
eq(body['rev'], 1, 'objective create rev 1')
ok(any(p['id'] == 10000 and p['name'] == 'New Obj' for p in s._bins['FC']['projects']), 'objective landed in FC')
ok('fc_10000' in s._bins['HUB']['importAssociations']['50'], 'objective linked under initiative 50')
eq(s._bins['HUB']['importProductAssoc']['fc_10000'], {'productLine': 'P', 'productModel': 'M'}, 'objective product link set')

# --- objective edit with matching baseRev ---
s = FakeStore(seed())
r = client(s).patch('/objective/fc_2', headers=AUTH, json={
    'name': 'Obj v2', 'baseRev': 4, 'initiativeId': '50', 'productLine': 'P', 'productModel': 'M', 'start': '2026-02-01', 'end': ''})
eq(r.status_code, 200, 'objective edit 200')
eq(r.json()['rev'], 5, 'objective edit bumps rev 4->5')
ok(any(p['id'] == 2 and p['name'] == 'Obj v2' and p['start'] == '2026-02-01' for p in s._bins['FC']['projects']), 'objective fields updated')

# --- objective edit with stale baseRev -> 409 ---
s = FakeStore(seed())
r = client(s).patch('/objective/fc_2', headers=AUTH, json={'name': 'Z', 'baseRev': 3})
eq(r.status_code, 409, 'stale objective edit -> 409')
eq(r.json()['current']['rev'], 4, '409 returns current rev')
ok(any(p['name'] == 'Obj' for p in s._bins['FC']['projects']), '409 did not modify the record')

# --- legacy objective (no _rev) with null baseRev stamps rev 1 ---
sd = seed()
sd['FC']['projects'][0].pop('_rev')
s = FakeStore(sd)
r = client(s).patch('/objective/fc_2', headers=AUTH, json={'name': 'Legacy edit', 'baseRev': None})
eq(r.status_code, 200, 'legacy objective edit 200')
eq(r.json()['rev'], 1, 'legacy edit stamps rev 1')

# --- objective edit links-failed partial success ---
s = FakeStore(seed())
s.fail_bins = {'HUB'}
r = client(s).patch('/objective/fc_2', headers=AUTH, json={'name': 'Obj v3', 'baseRev': 4, 'initiativeId': '50'})
eq(r.status_code, 200, 'links-failed still 200')
eq(r.json().get('warning'), 'links_failed', 'links-failed warning surfaced')
ok(any(p['name'] == 'Obj v3' for p in s._bins['FC']['projects']), 'field write stands despite link failure')

# --- initiative create + edit + conflict ---
s = FakeStore(seed())
r = client(s).post('/initiative', headers=AUTH, json={'name': 'Init2', 'division': 'electrolyzer', 'productLine': '', 'productModel': ''})
eq(r.status_code, 200, 'initiative create 200')
eq(r.json()['id'], 10000, 'initiative create raw id')
ok(any(p['id'] == 10000 and p['projectType'] == 'initiative' for p in s._bins['HUB']['projects']), 'initiative landed in hub')

s = FakeStore(seed())
r = client(s).patch('/initiative/50', headers=AUTH, json={'name': 'Init v2', 'baseRev': 3, 'productLine': 'P', 'productModel': 'M'})
eq(r.status_code, 200, 'initiative edit 200')
eq(r.json()['rev'], 4, 'initiative edit rev 3->4')
ok(any(p['id'] == 50 and p['name'] == 'Init v2' for p in s._bins['HUB']['projects']), 'initiative updated')

r = client(FakeStore(seed())).patch('/initiative/50', headers=AUTH, json={'name': 'x', 'baseRev': 99})
eq(r.status_code, 409, 'stale initiative edit -> 409')

# editing a non-initiative id (the milestone) -> 400
r = client(FakeStore(seed())).patch('/initiative/9', headers=AUTH, json={'name': 'x', 'baseRev': None})
eq(r.status_code, 400, 'editing wrong type as initiative -> 400')

# --- milestone create + edit ---
s = FakeStore(seed())
r = client(s).post('/milestone', headers=AUTH, json={'name': 'MS2', 'division': 'fuelcell', 'dueDate': '2026-09-01', 'ownerId': 'fc_2'})
eq(r.status_code, 200, 'milestone create 200')
ok(any(p['projectType'] == 'milestone' and p.get('parentId') == 'fc_2' for p in s._bins['HUB']['projects']), 'milestone landed with owner')

s = FakeStore(seed())
r = client(s).patch('/milestone/9', headers=AUTH, json={'name': 'MS v2', 'baseRev': 2, 'dueDate': '2026-06-15', 'ownerId': ''})
eq(r.status_code, 200, 'milestone edit 200')
eq(r.json()['rev'], 3, 'milestone edit rev 2->3')
ok(any(p['id'] == 9 and p['start'] == '2026-06-15' and p.get('parentId') is None for p in s._bins['HUB']['projects']), 'milestone due+owner updated')

# --- unconfigured division -> 400 ---
r = client(FakeStore(seed())).post('/objective', headers=AUTH, json={'name': 'X', 'division': 'exploration'})
eq(r.status_code, 400, 'objective create on unconfigured division -> 400')

# --- malformed body -> 422 (the payoff of explicit typed endpoints) ---
r = client(FakeStore(seed())).post('/objective', headers=AUTH, json={'division': 'fuelcell'})
eq(r.status_code, 422, 'missing name -> 422')

print(f'PASS={PASS} FAIL={FAIL}')
if MSGS:
    print('\n'.join(MSGS))
import sys  # noqa: E402
sys.exit(1 if FAIL else 0)