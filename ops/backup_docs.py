#!/usr/bin/env python3
"""
backup_docs.py — copy every unified-app document OUT of the broker into a timestamped folder, and (only
when asked) put a saved copy back.

Reads go through the broker exactly as the apps read: GET /state/portfolio and /state/gantt-view, then for
every division in portfolio.divisions EXEC-<id> (BIZ-<id> when the division's kind is "biz" — the same rule
as rdcore's divisionKind) plus SPEC-<id> for every non-biz division, and GET /roster. Each document file
holds the broker's full answer ({version, etag, updatedAt, doc}). A document the broker does not have (404)
is listed in manifest.json instead of being written. The roster is the broker's projection, so it carries no
PIN material.

Everything is read before anything is written, so a backup folder only ever holds a COMPLETE backup: any
error other than a 404 stops the run with a message and leaves no folder behind.

A backup never writes to the broker. --restore does, and only with --yes: for each saved document it reads
the current version (GET /state/<id>/version), then PUTs {doc, client: "ops"} with If-Match set to that
version's etag. Without --yes it prints what it would do and writes nothing. The roster is not restored:
the broker has no write path to the users bin.

Standard library only (urllib) — no pip install required.

Env:
  BROKER_TOKEN   the broker's bearer token (required)
  BROKER_URL     the broker (default https://web-production-b17a2.up.railway.app — the BROKER constant
                 in the app templates)

Usage:
  python ops/backup_docs.py                         # -> ./backup-YYYYmmdd-HHMMSS/
  python ops/backup_docs.py --out DIR               # -> DIR (must be absent or empty)
  python ops/backup_docs.py --restore DIR           # dry run: say what would be put back
  python ops/backup_docs.py --restore DIR --yes     # put every saved document back

The folder holds your documents (not credentials) — keep it out of git.
"""
import argparse
import json
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BROKER = "https://web-production-b17a2.up.railway.app"
UA = "Mozilla/5.0 (compatible; CeladyneRD/1.0)"   # same UA as migrate.py
CLIENT = "ops"                                     # the broker refuses PUT /state from unlisted clients (426)
TIMEOUT = 30
MANIFEST = "manifest.json"
ROSTER_FILE = "roster.json"


class BrokerError(Exception):
    """A step that did not succeed, worded so a person knows what to do next."""


def _error_body(e):
    try:
        raw = e.read().decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return {}
    try:
        body = json.loads(raw)
    except ValueError:
        return {"detail": raw[:300]}
    return body if isinstance(body, dict) else {"detail": body}


class Broker:
    def __init__(self, url, token):
        self.url = url
        self.token = token

    def request(self, method, path, body=None, headers=None):
        """(status, parsed JSON body). HTTP errors come back as a status; only an unreachable broker raises."""
        h = {"Authorization": "Bearer " + self.token, "User-Agent": UA, "Accept": "application/json"}
        h.update(headers or {})
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            h["Content-Type"] = "application/json"
        try:
            req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        except ValueError:
            raise BrokerError(f"BROKER_URL is not a usable URL: {self.url!r}") from None
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                raw = resp.read()
                status = resp.status
        except urllib.error.HTTPError as e:
            return e.code, _error_body(e)
        except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as e:
            reason = getattr(e, "reason", None) or e
            raise BrokerError(f"could not reach the broker at {self.url} ({reason}). "
                              f"Check BROKER_URL and your network; nothing was changed.") from None
        try:
            return status, json.loads(raw or b"null")
        except ValueError:
            raise BrokerError(f"{method} {path}: the broker answered with something that is not JSON "
                              f"(is BROKER_URL the broker?)") from None


def explain(method, path, status, body):
    """One line a person can act on, for a broker answer that was not a success."""
    detail = body.get("detail") if isinstance(body, dict) else body
    msg = detail.get("message") if isinstance(detail, dict) else detail
    where = f"{method} {path}"
    if status == 401:
        return f"{where}: the broker refused the token (401). Set BROKER_TOKEN to the broker's current token."
    if status == 426:
        return (f"{where}: the broker refused this client (426: {msg}). This script writes as client "
                f"'{CLIENT}', so the broker's RD_ALLOWED_CLIENTS must include it.")
    if status == 500 and detail == "broker token not configured":
        return f"{where}: the broker has no BROKER_TOKEN set (500), so it refuses every data request."
    if status == 502:
        cause = detail.get("cause") if isinstance(detail, dict) else None
        return (f"{where}: the broker could not reach its storage (502{': ' + cause if cause else ''}). "
                f"{msg or 'Try again in a moment.'}")
    if status == 412:
        return f"{where}: the document changed between reading its version and writing it (412). Re-run to retry."
    return f"{where}: HTTP {status}: {msg if msg is not None else detail}"


def doc_ids_for(portfolio_doc):
    """The per-division documents for a portfolio: EXEC-<id> or (kind "biz") BIZ-<id>, plus SPEC-<id> for
    every non-biz division. The kind rule is rdcore's divisionKind: kind === 'biz' is biz, anything else R&D."""
    ids = []
    divisions = portfolio_doc.get("divisions") if isinstance(portfolio_doc, dict) else None
    for d in divisions if isinstance(divisions, list) else []:
        did = d.get("id") if isinstance(d, dict) else None
        if not isinstance(did, str) or not did:
            continue
        if d.get("kind") == "biz":
            ids.append("BIZ-" + did)
        else:
            ids += ["EXEC-" + did, "SPEC-" + did]
    seen = set()
    return [i for i in ids if not (i in seen or seen.add(i))]


def _filename(doc_id, taken):
    """A safe file name for a doc id: never a path, never hidden, never a clash."""
    base = re.sub(r"[^A-Za-z0-9._-]", "_", doc_id).lstrip(".") or "doc"
    name, n = base + ".json", 1
    while name in taken or name in (MANIFEST, ROSTER_FILE):
        n += 1
        name = f"{base}~{n}.json"
    taken.add(name)
    return name


def _path(doc_id):
    return "/state/" + urllib.parse.quote(doc_id, safe="")


def _ensure_empty(out_dir):
    if os.path.exists(out_dir) and (not os.path.isdir(out_dir) or os.listdir(out_dir)):
        raise BrokerError(f"{out_dir} already exists and is not an empty folder; choose another --out.")


def backup(broker, out_dir, log=print):
    _ensure_empty(out_dir)
    log(f"backing up from {broker.url}")
    fetched, missing = {}, []

    def get_doc(doc_id):
        status, body = broker.request("GET", _path(doc_id))
        if status == 404:
            missing.append(doc_id)
            log(f"  {doc_id:20} missing (404) — listed in {MANIFEST}")
            return None
        if status != 200 or not isinstance(body, dict) or "doc" not in body:
            raise BrokerError(explain("GET", _path(doc_id), status, body) + " Nothing was written.")
        fetched[doc_id] = body
        log(f"  {doc_id:20} v{body.get('version')}")
        return body

    portfolio = get_doc("portfolio")
    get_doc("gantt-view")
    if portfolio is None:
        log("  warning: the broker has no portfolio, so no division documents could be listed")
    for doc_id in doc_ids_for(portfolio.get("doc") if portfolio else None):
        get_doc(doc_id)

    status, roster = broker.request("GET", "/roster")
    if status == 404:
        missing.append("roster")
        roster = None
        log(f"  {'roster':20} missing (404) — listed in {MANIFEST}")
    elif status != 200 or not isinstance(roster, dict):
        raise BrokerError(explain("GET", "/roster", status, roster) + " Nothing was written.")
    else:
        log(f"  {'roster':20} {len(roster.get('users') or [])} user(s)")

    # Everything is read: only now touch the disk, so the folder only ever holds a complete backup.
    os.makedirs(out_dir, exist_ok=True)
    taken, docs = set(), {}
    for doc_id, body in fetched.items():
        fname = _filename(doc_id, taken)
        with open(os.path.join(out_dir, fname), "w", encoding="utf-8") as fh:
            json.dump(body, fh, indent=2, ensure_ascii=False)
        docs[doc_id] = {"file": fname, "version": body.get("version"), "etag": body.get("etag"),
                        "updatedAt": body.get("updatedAt")}
    if roster is not None:
        with open(os.path.join(out_dir, ROSTER_FILE), "w", encoding="utf-8") as fh:
            json.dump(roster, fh, indent=2, ensure_ascii=False)
    manifest = {
        "tool": "ops/backup_docs.py",
        "broker": broker.url,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "docs": docs,
        "roster": {"file": ROSTER_FILE, "users": len(roster.get("users") or [])} if roster is not None else None,
        "missing": missing,
    }
    with open(os.path.join(out_dir, MANIFEST), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
    written = len(docs) + (1 if roster is not None else 0)
    log(f"wrote {written} file(s) + {MANIFEST} to {out_dir}" + (f"  ({len(missing)} missing)" if missing else ""))
    return manifest


def _saved_entries(src_dir):
    """[(doc_id, file name)] from the manifest, or from the file names when there is no manifest."""
    mpath = os.path.join(src_dir, MANIFEST)
    if os.path.exists(mpath):
        with open(mpath, encoding="utf-8") as fh:
            manifest = json.load(fh)
        docs = manifest.get("docs") if isinstance(manifest, dict) else None
        if not isinstance(docs, dict):
            raise BrokerError(f"{mpath} has no 'docs' map; is this a backup_docs.py folder?")
        return [(doc_id, os.path.basename(str((info or {}).get("file") or ""))) for doc_id, info in docs.items()]
    return [(name[:-len(".json")], name) for name in sorted(os.listdir(src_dir))
            if name.endswith(".json") and name not in (MANIFEST, ROSTER_FILE)]


def restore(broker, src_dir, yes, log=print):
    if not os.path.isdir(src_dir):
        raise BrokerError(f"{src_dir} is not a folder")
    plan = []
    for doc_id, fname in _saved_entries(src_dir):         # check every file before the first write
        path = os.path.join(src_dir, fname)
        try:
            with open(path, encoding="utf-8") as fh:
                saved = json.load(fh)
        except (OSError, ValueError) as e:
            raise BrokerError(f"{path}: cannot read it as JSON ({e}). Nothing was written.") from None
        if not isinstance(saved, dict) or "doc" not in saved:
            raise BrokerError(f"{path}: not a saved broker document (no 'doc'). Nothing was written.")
        plan.append((doc_id, saved))
    if not plan:
        raise BrokerError(f"no saved documents in {src_dir}")

    log(f"{'restoring' if yes else 'dry run — would restore'} {len(plan)} document(s) from {src_dir} "
        f"to {broker.url}")
    if os.path.exists(os.path.join(src_dir, ROSTER_FILE)):
        log(f"  {ROSTER_FILE}: skipped — the roster is read-only through the broker")
    done = []
    for i, (doc_id, saved) in enumerate(plan):
        vpath = _path(doc_id) + "/version"
        status, cur = broker.request("GET", vpath)
        if status != 200 or not isinstance(cur, dict) or "etag" not in cur:
            raise BrokerError(explain("GET", vpath, status, cur) + _progress(done, plan[i:]))
        line = f"{doc_id}: broker has v{cur.get('version')}, backup has v{saved.get('version')}"
        if not yes:
            log(f"  would PUT {line} (If-Match {cur['etag']})")
            continue
        status, res = broker.request("PUT", _path(doc_id), {"doc": saved["doc"], "client": CLIENT},
                                     headers={"If-Match": cur["etag"]})
        if status != 200:
            raise BrokerError(explain("PUT", _path(doc_id), status, res) + _progress(done, plan[i:]))
        done.append(doc_id)
        log(f"  restored {line} -> now v{res.get('version') if isinstance(res, dict) else '?'}")
    log("dry run — nothing was written. Re-run with --yes to restore." if not yes
        else f"restored {len(done)} document(s).")
    return done


def _progress(done, remaining):
    return (f" Restored before this: {', '.join(done) if done else 'none'}."
            f" Not restored: {', '.join(d for d, _ in remaining)}.")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Back up (or restore) every unified-app document through the broker.")
    ap.add_argument("--out", help="backup folder (default ./backup-YYYYmmdd-HHMMSS)")
    ap.add_argument("--restore", metavar="DIR", help="put the documents saved in DIR back into the broker")
    ap.add_argument("--yes", action="store_true", help="with --restore: really write (without it, a dry run)")
    args = ap.parse_args(argv)
    if args.yes and not args.restore:
        ap.error("--yes only applies to --restore")
    if args.out and args.restore:
        ap.error("--out is for a backup; --restore reads the folder it is given")

    token = (os.environ.get("BROKER_TOKEN") or "").strip()
    if not token:
        print("set BROKER_TOKEN (the broker's bearer token)", file=sys.stderr)
        return 2
    url = (os.environ.get("BROKER_URL") or DEFAULT_BROKER).strip().rstrip("/")
    if "://" not in url:
        url = "https://" + url                     # a bare host name, as people paste it
    broker = Broker(url, token)
    try:
        if args.restore:
            restore(broker, args.restore, args.yes)
        else:
            backup(broker, args.out or os.path.join(".", time.strftime("backup-%Y%m%d-%H%M%S")))
    except BrokerError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
