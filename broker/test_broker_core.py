"""
test_broker_core.py — parity harness for broker_core.

The edit-builder assertions below mirror, one-to-one, the block added to
verify1.py for the in-browser CORE (which passes 294/294). Identical inputs must
yield identical outputs here — that's the proof the Python and JS ports agree.
Create-builder coverage is added on top. Run: `python3 test_broker_core.py`
(exits non-zero on any failure).
"""

import sys
import broker_core as c

PASS = 0
FAIL = 0
MSGS = []


def eq(a, b, msg):
    global PASS, FAIL
    if a == b:
        PASS += 1
    else:
        FAIL += 1
        MSGS.append(f'FAIL: {msg}  got={a!r} want={b!r}')


def ok(cond, msg):
    global PASS, FAIL
    if cond:
        PASS += 1
    else:
        FAIL += 1
        MSGS.append(f'FAIL: {msg}')


# ----------------------------------------------------------- edit builders
# (mirrors verify1.py)
eq(c.unprefix_id('fc_123'), 123, 'unprefix strips prefix -> int')
eq(c.unprefix_id('exp_10001'), 10001, 'unprefix exploration')
eq(c.unprefix_id('50'), 50, 'unprefix bare numeric -> int')
eq(c.unprefix_id('fc_abc'), 'abc', 'unprefix non-numeric raw stays str')

ps = [{'id': 50, 'name': 'A'}, {'id': 'fc_2', 'name': 'B'}]
eq(c.find_project_by_id(ps, 50)['name'], 'A', 'find numeric')
eq(c.find_project_by_id(ps, '50')['name'], 'A', 'find numeric-as-string')
eq(c.find_project_by_id(ps, 'fc_2')['name'], 'B', 'find string id')
eq(c.find_project_by_id(ps, 999), None, 'find miss -> None')

obj = {'id': 'fc_2', 'name': 'Old', 'start': '2026-01-01', 'end': '2026-03-01',
       'division': 'fuelcell', 'keyResults': [{'x': 1}], 'projectType': 'objective'}
oe = c.apply_objective_edit(obj, {'name': '  New  ', 'start': '2026-02-01', 'end': ''})
eq(oe['name'], 'New', 'obj edit trims name')
eq(oe['start'], '2026-02-01', 'obj edit start')
eq(oe['end'], '', 'obj edit clears end')
eq(oe['division'], 'fuelcell', 'obj edit leaves division')
ok(oe['keyResults'] is obj['keyResults'], 'obj edit keeps keyResults ref (read-only)')
ok(oe is not obj, 'obj edit returns a copy')
eq(obj['name'], 'Old', 'obj edit does not mutate original')

init = {'id': 50, 'name': 'I', 'productLine': '', 'productModel': '', 'start': '', 'end': '',
        'division': 'fuelcell', 'projectType': 'initiative'}
ie = c.apply_initiative_edit(init, {'name': 'I2', 'productLine': 'P', 'productModel': 'M',
                                    'start': '2026-01-01', 'end': '2026-06-01'})
eq([ie['name'], ie['productLine'], ie['productModel'], ie['start'], ie['end']],
   ['I2', 'P', 'M', '2026-01-01', '2026-06-01'], 'initiative edit fields')

ms = {'id': 9, 'name': 'M', 'start': '2026-05-01', 'end': '2026-05-01', 'parentId': 'fc_2',
      'productLine': '', 'productModel': '', 'projectType': 'milestone', 'milestone': True}
me = c.apply_milestone_edit(ms, {'name': 'M2', 'dueDate': '2026-07-01', 'ownerId': 50,
                                 'productLine': 'P', 'productModel': 'M'})
eq([me['name'], me['start'], me['end'], me['parentId'], me['productLine']],
   ['M2', '2026-07-01', '2026-07-01', 50, 'P'], 'milestone edit fields + due->start/end')
eq(c.apply_milestone_edit(ms, {'ownerId': ''})['parentId'], None, 'ms edit clears owner -> None')

A = {'50': ['fc_2', 'fc_3'], '60': ['fc_9']}
eq(c.move_association(A, 50, 60, 'fc_2'), {'50': ['fc_3'], '60': ['fc_9', 'fc_2']}, 'move 50->60')
eq(c.move_association(A, 50, '', 'fc_2'), {'50': ['fc_3'], '60': ['fc_9']}, 'clear removes from old')
eq(c.move_association(A, 50, 50, 'fc_2'), {'50': ['fc_2', 'fc_3'], '60': ['fc_9']}, 'same bucket no-op')
eq(c.move_association({}, '', 60, 'fc_7'), {'60': ['fc_7']}, 'add into empty / new bucket')
eq(c.move_association({'50': ['fc_2'], '60': ['fc_2']}, 50, 70, 'fc_2'),
   {'50': [], '60': [], '70': ['fc_2']}, 'dedupes across buckets')
ok(A == {'50': ['fc_2', 'fc_3'], '60': ['fc_9']}, 'move_association does not mutate input')

PA = {'fc_2': {'productLine': 'P', 'productModel': 'M'}}
eq(c.set_product_assoc(PA, 'fc_3', 'Q', 'N'),
   {'fc_2': {'productLine': 'P', 'productModel': 'M'}, 'fc_3': {'productLine': 'Q', 'productModel': 'N'}},
   'set_product_assoc add')
eq(c.set_product_assoc(PA, 'fc_2', '', ''), {}, 'set_product_assoc clear removes')
eq(c.set_product_assoc(PA, 'fc_2', 'Q', ''), {'fc_2': {'productLine': 'Q', 'productModel': ''}},
   'set_product_assoc overwrite')
ok(PA == {'fc_2': {'productLine': 'P', 'productModel': 'M'}}, 'set_product_assoc does not mutate input')

# --------------------------------------------------------- create builders
eq(c.next_project_id([]), 10000, 'next id empty -> 10000')
eq(c.next_project_id([{'id': 5}]), 10000, 'next id below floor -> 10000')
eq(c.next_project_id([{'id': 10005}]), 10006, 'next id above floor -> +1')
eq(c.next_project_id([{'id': 'fc_2'}, {'id': 10010}]), 10011, 'next id ignores non-numeric')
eq(c.next_project_id([{'id': True}]), 10000, 'next id ignores bool ids')

bo = c.build_objective({'id': 10000, 'name': '  Obj  ', 'division': 'fuelcell',
                        'start': '2026-01-01', 'end': '2026-03-01',
                        'kr': {'name': 'Hit 0.6V', 'progress': 150}})
eq(bo['projectType'], 'objective', 'build_objective type')
eq(bo['id'], 10000, 'build_objective id')
eq(bo['name'], 'Obj', 'build_objective trims name')
eq([bo['start'], bo['end']], ['2026-01-01', '2026-03-01'], 'build_objective dates')
eq(len(bo['keyResults']), 1, 'build_objective makes 1 KR')
eq(bo['keyResults'][0]['progress'], 100, 'build_objective clamps KR progress to 100')
eq(bo['keyResults'][0]['trackingType'], 'percentage', 'build_objective KR type')
eq(c.build_objective({'id': 1, 'name': 'x'})['keyResults'], [], 'build_objective no KR when none given')

bi = c.build_initiative({'id': 10000, 'name': 'Init', 'division': 'electrolyzer',
                         'productLine': 'P', 'productModel': 'M', 'start': '2026-01-01', 'end': '2026-12-01'})
eq(bi['projectType'], 'initiative', 'build_initiative type')
eq([bi['productLine'], bi['productModel']], ['P', 'M'], 'build_initiative product')
eq(bi['division'], 'electrolyzer', 'build_initiative division')

bm = c.build_milestone({'id': 10000, 'name': 'MS', 'division': 'fuelcell',
                        'dueDate': '2026-07-01', 'ownerId': 'fc_2', 'productLine': 'P'})
eq(bm['projectType'], 'milestone', 'build_milestone type')
eq(bm['milestone'], True, 'build_milestone flag')
eq([bm['start'], bm['end']], ['2026-07-01', '2026-07-01'], 'build_milestone due -> start/end')
eq(bm['parentId'], 'fc_2', 'build_milestone owner -> parentId')
eq(c.build_milestone({'id': 1, 'name': 'x', 'dueDate': '2026-01-01', 'ownerId': ''})['parentId'], None,
   'build_milestone empty owner -> None')

eq(c.with_association({}, 50, 'fc_2'), {'50': ['fc_2']}, 'with_association add new bucket')
eq(c.with_association({'50': ['fc_2']}, 50, 'fc_2'), {'50': ['fc_2']}, 'with_association dedup')
eq(c.with_association({'50': ['fc_2']}, 50, 'fc_3'), {'50': ['fc_2', 'fc_3']}, 'with_association append')
eq(c.with_product_assoc({}, 'fc_2', 'P', 'M'), {'fc_2': {'productLine': 'P', 'productModel': 'M'}},
   'with_product_assoc add')
eq(c.with_product_assoc({}, 'fc_2', '', ''), {}, 'with_product_assoc no-op when no product')

# ------------------------------------------------------------ rev / version
eq(c.next_rev(None), 1, 'next_rev from None -> 1')
eq(c.next_rev(3), 4, 'next_rev bump')
eq(c.next_rev(True), 1, 'next_rev ignores bool')
ok(c.rev_conflict(5, 3) is True, 'rev_conflict differs')
ok(c.rev_conflict(5, 5) is False, 'rev_conflict equal')
ok(c.rev_conflict(5, None) is False, 'rev_conflict null base skips')
ok(c.rev_conflict(None, 3) is False, 'rev_conflict null current skips')

projs = [{'id': 2, 'name': 'a', '_rev': 1}, {'id': 'fc_3', 'name': 'b'}]
upd = {'id': 2, 'name': 'a2', '_rev': 2}
ok(c.replace_in_place(projs, upd) is True, 'replace_in_place hit')
eq(projs[0]['name'], 'a2', 'replace_in_place swapped')
ok(c.replace_in_place(projs, {'id': 999}) is False, 'replace_in_place miss')

dv = {'_version': 4}
v = c.bump_version(dv)
eq(v, 5, 'bump_version increments')
eq(dv['_savedBy'], 'division-broker', 'bump_version stamps savedBy')
eq(c.bump_version({}), 1, 'bump_version from missing -> 1')

print(f'PASS={PASS} FAIL={FAIL}')
if MSGS:
    print('\n'.join(MSGS))
sys.exit(1 if FAIL else 0)
