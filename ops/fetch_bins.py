#!/usr/bin/env python3
"""
fetch_bins.py — pull your EXISTING bins into ./export/ for the one-time migration.

Reads your current tool bins (read-only — it never writes or modifies them) and
saves the JSON files migrate.py expects:
  divisional.json, gantt.json, quarter_<divisionId>.json (one per division).

The source bin ids live on SRC_* env vars, deliberately a different prefix from the
destination *_BIN vars, so the existing bins and the new isolated bins can never be
mixed up.

Standard library only (urllib) — no pip install required.

Env:
  JSONBIN_MASTER_KEY      your X-Master-Key
  UNIFIED_DIVISIONS       comma-separated division ids (default "DIV-FC")
  SRC_DIVISIONAL_BIN      id of your existing divisional-tracker bin
  SRC_GANTT_BIN           id of your existing gantt bin
  SRC_QUARTER_<DIV>_BIN   id of each division's existing quarter bin
                          (e.g. division DIV-FC -> SRC_QUARTER_DIV_FC_BIN)

Usage:
  python ops/fetch_bins.py              # writes ./export/*.json
  python ops/fetch_bins.py --out DIR    # custom output dir
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

KEY = os.environ.get("JSONBIN_MASTER_KEY")
if not KEY:
    sys.exit("set JSONBIN_MASTER_KEY (your X-Master-Key)")

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="./export")
args = ap.parse_args()

DIVISIONS = [d.strip() for d in os.environ.get("UNIFIED_DIVISIONS", "DIV-FC").split(",") if d.strip()]


def src_env(div: str) -> str:
    return "SRC_QUARTER_" + div.upper().replace("-", "_") + "_BIN"


# destination filename -> source bin id
SOURCES = {
    "divisional.json": os.environ.get("SRC_DIVISIONAL_BIN"),
    "gantt.json": os.environ.get("SRC_GANTT_BIN"),
}
for d in DIVISIONS:
    SOURCES[f"quarter_{d}.json"] = os.environ.get(src_env(d))

missing = [fname for fname, v in SOURCES.items() if not v]
if missing:
    sys.exit("missing source bin id env var(s) for: " + ", ".join(missing) +
             "\n  (divisional.json=SRC_DIVISIONAL_BIN, gantt.json=SRC_GANTT_BIN, "
             "quarter_<div>.json=SRC_QUARTER_<DIV>_BIN)")


# JSONBin is fronted by Cloudflare, which 403s the urllib default "Python-urllib/x"
# User-Agent with "error code: 1010". Send a non-default UA on every call.
_UA = "Mozilla/5.0 (compatible; CeladyneRD/1.0)"


def fetch_record(bin_id: str):
    req = urllib.request.Request(
        f"https://api.jsonbin.io/v3/b/{bin_id}/latest",
        headers={"X-Master-Key": KEY, "User-Agent": _UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read()).get("record")  # JSONBin returns payload under "record"
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        sys.exit(f"JSONBin read failed for bin {bin_id} (HTTP {e.code}): {body}")
    except urllib.error.URLError as e:
        sys.exit(f"network error reading bin {bin_id}: {e.reason}")


os.makedirs(args.out, exist_ok=True)
for fname, bin_id in SOURCES.items():
    record = fetch_record(bin_id)
    with open(os.path.join(args.out, fname), "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)  # utf-8, no BOM
    print(f"{fname:28} <- bin {bin_id}")

print(f"\nwrote {len(SOURCES)} file(s) to {args.out}/")
print(f"next: python ops/migrate.py --in {args.out} --out ./mapped   (dry run, originals untouched)")