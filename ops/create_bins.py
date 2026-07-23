#!/usr/bin/env python3
"""
create_bins.py — make the unified app's NEW, isolated JSONBin bins.

These are SEPARATE from your existing tool bins. The unified app reads and writes
ONLY these; your current divisional / quarter / gantt bins are never referenced by
it (their ids never enter the broker's BIN_FOR map).

Creates one bin per unified document:
  portfolio, gantt-view, EXEC-<div> + SPEC-<div> per R&D division, and BIZ-<div>
  per Business division. This matches the broker's BIN_FOR doc set exactly.

Standard library only (urllib) — no pip install required.

Run ONCE. JSONBin's create endpoint makes a brand-new bin on every call, so
re-running produces duplicate bins. Paste the printed env block into the Railway
broker service, then run fetch_bins.py + migrate.py.

Env:
  JSONBIN_MASTER_KEY   your X-Master-Key (Core API key)
  UNIFIED_DIVISIONS    comma-separated R&D division ids, e.g. "DIV-FC,DIV-EL"
                       (default "DIV-FC"); each gets EXEC- + SPEC- bins
  BIZ_DIVISIONS        comma-separated Business division ids, e.g. "DIV-FIN,DIV-BD,DIV-HR"
                       (default empty); each gets a BIZ- bin

Usage:
  python ops/create_bins.py                 # human log on stderr, env block on stdout
  python ops/create_bins.py > new_bins.env  # capture just the env block (do NOT commit)
"""
import json
import os
import sys
import urllib.error
import urllib.request

KEY = os.environ.get("JSONBIN_MASTER_KEY")
if not KEY:
    sys.exit("set JSONBIN_MASTER_KEY (your X-Master-Key)")

DIVISIONS = [d.strip() for d in os.environ.get("UNIFIED_DIVISIONS", "DIV-FC").split(",") if d.strip()]
# Business divisions get a BIZ-<div> execution workspace only (no EXEC-/SPEC-). Disjoint from the R&D list so
# no empty bins are created for a division that will not use them. Default empty -> biz is opt-in.
BIZ_DIVISIONS = [d.strip() for d in os.environ.get("BIZ_DIVISIONS", "").split(",") if d.strip()]
# One bin per unified doc, MATCHING the broker's _DOC_IDS: EXEC- + SPEC- per R&D division, BIZ- per business one.
DOC_IDS = (["portfolio", "gantt-view"]
           + [f"EXEC-{d}" for d in DIVISIONS]
           + [f"SPEC-{d}" for d in DIVISIONS]
           + [f"BIZ-{d}" for d in BIZ_DIVISIONS])


# doc id -> env var name the broker's BIN_FOR reads, e.g. EXEC-DIV-FC -> EXEC_DIV_FC_BIN
def env_name(doc_id: str) -> str:
    return doc_id.upper().replace("-", "_") + "_BIN"


# JSONBin is fronted by Cloudflare, which 403s the urllib default "Python-urllib/x"
# User-Agent with "error code: 1010". Send a non-default UA on every call.
_UA = "Mozilla/5.0 (compatible; CeladyneRD/1.0)"

# Seed the bin with a version-0 wrapper so the broker reads it as "exists, version 0";
# migration's first write then bumps each to version 1.
SEED = {"version": 0, "updatedAt": None, "doc": {}}


def create_bin(doc_id: str) -> str:
    data = json.dumps(SEED).encode("utf-8")
    req = urllib.request.Request(
        "https://api.jsonbin.io/v3/b", data=data, method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Master-Key": KEY,
            "X-Bin-Name": doc_id,      # readable name in the JSONBin dashboard
            "X-Bin-Private": "true",   # private on create (the correct place for this header)
            "User-Agent": _UA,         # avoid Cloudflare's urllib 1010 block
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())["metadata"]["id"]
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        sys.exit(f"JSONBin create failed for '{doc_id}' (HTTP {e.code}): {body}")
    except urllib.error.URLError as e:
        sys.exit(f"network error creating '{doc_id}': {e.reason}")


print("# creating unified app bins (these are NEW and isolated):", file=sys.stderr)
# env lines are printed incrementally, so a mid-run failure still records what was made
for doc_id in DOC_IDS:
    bin_id = create_bin(doc_id)
    print(f"  {doc_id:16} -> {bin_id}", file=sys.stderr)
    print(f"{env_name(doc_id)}={bin_id}")   # stdout: redirectable env line
print("# --- paste the lines above into the Railway broker env ---", file=sys.stderr)
