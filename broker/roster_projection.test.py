"""
The users bin holds pinHash / salt / iterations. This proves the /roster projection emits ONLY the
whitelisted fields (ROSTER_FIELDS), tested against the real bin shape Corey supplied (credential values
replaced with obvious fakes).
"""
import json, sys, re
import os

# The deployed copy: broker_patch.py beside THIS file (it used to be a hard-coded sandbox path, which tested
# whatever stale copy happened to sit there).
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "broker_patch.py")
src = open(SRC, encoding="utf-8").read()

# exec just the projection (importing the module would need fastapi + env)
ns = {"Dict": dict, "Any": object, "os": os}
# grab from ROSTER_FIELDS up to the route decorator: that span is the projection and nothing else
start = src.index("ROSTER_FIELDS = ")
end = src.index('@state_router.get("/roster"')        # no closing paren: the decorator also names its auth
exec(src[start:end], ns)

EXPECTED_FIELDS = {"email", "name", "orgRole", "leadOf", "leadUnits", "leadDivisions", "disabled"}

REAL = {"users": [
    {"email": "coreystaller@celadynetech.com", "name": "Corey Staller", "role": "admin",
     "pinHash": "fake-hash-1", "salt": "fake-salt-1",
     "iterations": 200000, "createdAt": 1778092162198, "lastLogin": 1783714400785, "disabled": False,
     "assignedObjectives": [{"tracker": "celadyne", "id": "10114", "name": "Maximize Dura performance in WTP"}],
     "orgRole": "cto", "leadOf": [], "configuredTiles": [{"tracker": "electrolyzer", "objectiveId": "10004"}],
     "groupingConfig": {"projects": [], "leadership": ["division", "productLine"]},
     "leadershipViewFilter": ["stagegate"]},
    {"email": "erincastele@celadynetech.com", "role": "user", "orgRole": "lead", "leadOf": ["fuel-cell"],
     "pinHash": "fake-hash-2", "salt": "fake-salt-2",
     "iterations": 200000, "disabled": False, "assignedObjectives": [], "configuredTiles": []},
    {"email": "toruhatsukade@celadynetech.com", "role": "user", "orgRole": "lead", "leadOf": ["electrolyzer"],
     "pinHash": "fake-hash-3", "salt": "fake-salt-3",
     "iterations": 200000, "disabled": True},
], "schemaVersion": 1}

out, ok_, fail = [], 0, 0
def ok(c, m):
    global ok_, fail
    out.append(("ok   " if c else "FAIL ") + m)
    if c: ok_ += 1
    else: fail += 1

proj = [ns["_project_user"](u) for u in REAL["users"] if u.get("email")]
blob = json.dumps(proj)

# --- the whole point ---
for secret in ("pinHash", "salt", "iterations",
               "fake-hash-1", "fake-salt-1", "fake-hash-2", "fake-salt-2", "fake-hash-3", "fake-salt-3"):
    ok(secret not in blob, f"no credential material in the projection: {secret!r} absent")

ok(set(ns["ROSTER_FIELDS"]) == EXPECTED_FIELDS and len(ns["ROSTER_FIELDS"]) == len(EXPECTED_FIELDS),
   "the allow-list is exactly email, name, orgRole, leadOf, leadUnits, leadDivisions, disabled")
ok(all(set(u) == EXPECTED_FIELDS for u in proj),
   "every user emits exactly the whitelisted fields")
ok("assignedObjectives" not in blob, "assignedObjectives is not mirrored (the planning app owns ownership)")
ok("configuredTiles" not in blob and "groupingConfig" not in blob and "lastLogin" not in blob,
   "unrelated user state is not exposed either")
ok("role" not in {k for u in proj for k in u}, "the auth 'role' field is not exposed; only orgRole is")

# --- it still returns what the dropdown needs ---
ok([u["email"] for u in proj] == ["coreystaller@celadynetech.com", "erincastele@celadynetech.com",
                                  "toruhatsukade@celadynetech.com"], "all three users come through, in order")
ok(proj[0]["orgRole"] == "cto" and proj[1]["orgRole"] == "lead", "orgRole survives")
ok(proj[1]["leadOf"] == ["fuel-cell"] and proj[0]["leadOf"] == [], "leadOf survives, including empty")
ok(proj[2]["disabled"] is True and proj[0]["disabled"] is False, "disabled survives as a real bool")
ok(proj[0]["name"] == "Corey Staller", "a user's name passes through")
ok(proj[1]["name"] is None and proj[2]["name"] is None, "...and is null for a user the bin has no name for")

# --- robustness ---
ok(ns["_project_user"]({"email": "x@y.z"}) == {"email": "x@y.z", "name": None, "orgRole": None, "leadOf": [],
                                               "leadUnits": [], "leadDivisions": [], "disabled": False},
   "a sparse user projects with safe defaults, not KeyErrors")
ok(ns["_project_user"]({"email": "x@y.z", "name": {"first": "A"}})["name"] is None,
   "a name that is not a string is not passed through")
ok(ns["_project_user"]({"email": "x@y.z", "leadOf": None})["leadOf"] == [], "a null leadOf becomes an empty list")
ok(ns["_project_user"]({"email": "x@y.z", "secretNewField": "oops"}).get("secretNewField") is None,
   "a NEW field added to the users bin is excluded by default (whitelist, not blacklist)")
ok(ns["_project_user"]({"email": "x@y.z", "leadOf": ["a"]})["leadOf"] is not None, "leadOf is copied, not aliased")
src_list = {"email": "x@y.z", "leadOf": ["a"]}
p = ns["_project_user"](src_list); p["leadOf"].append("b")
ok(src_list["leadOf"] == ["a"], "mutating the projection cannot mutate the source bin")

for l in out:
    if l.startswith("FAIL"): print(l)
print(f"\n{fail}/{len(out)} FAILED" if fail else f"\nPASS - {len(out)} roster-projection assertions green")
sys.exit(1 if fail else 0)
