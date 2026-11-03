#!/usr/bin/env python3
"""
broker_up.py: run the REAL broker on 127.0.0.1 against fakebin, for browser tests.

    python3 broker_up.py [--seed sample|mapped|<dir>] [--port 0] [--admin-port 0]
                         [--broker-dir DIR] [--app broker:app] [--token test-token] [--origins '*']
                         [--env NAME=VALUE]... [--unset NAME]... [--exit-with-parent]
                         [--ready-file PATH] [--verbose]

It imports the broker the way the Procfile runs it (`broker:app` from --broker-dir, default
the repo's broker/, or $BROKER_DIR) with an environment that points every bin at an
in-memory fake JSONBin seeded from a seed set, and serves it with uvicorn, one worker, as in production.
When it answers, it prints (flushed; BROKER_URL is always the last of these lines):

    FAKEBIN_URL=http://127.0.0.1:<p2>          the fake JSONBin
    ADMIN_URL=http://127.0.0.1:<p2>/__admin    the test-only admin API (README.md)
    BROKER_URL=http://127.0.0.1:<p1>

The broker's environment (nothing from the real deployment is read or needed):
    BROKER_TOKEN=test-token, ALLOWED_ORIGINS=*, JSONBIN_MASTER_KEY=<a fake key fakebin checks>,
    UNIFIED_DIVISIONS and BIZ_DIVISIONS from the seed's manifest, <DOC>_BIN for every /state document
    (PORTFOLIO_BIN, GANTT_VIEW_BIN, EXEC_<DIV>_BIN, SPEC_<DIV>_BIN, BIZ_<DIV>_BIN), and the manifest's raw
    bins (USERS_BIN, ANALYSIS_INDEX_BIN, PREFS_BIN). Proxy variables are removed and the process cannot
    reach the network (fakebin.install_redirect refuses every non-loopback host).

Reset and restart re-import the broker modules in place (the port stays open, so pages already pointed
at BROKER_URL keep working): the broker's in-memory caches start cold, as after a redeploy, and any edit
another agent made to the broker files since is picked up. If an import fails because a file is
mid-edit, it is retried every second until --import-timeout.
"""

import argparse
import asyncio
import http.client
import importlib
import json
import os
import socket
import sys
import threading
import time
from urllib.parse import quote, urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
# the repo's broker (calm/test/live -> rd-gantt-v2/broker) unless BROKER_DIR or --broker-dir says otherwise
DEFAULT_BROKER_DIR = os.environ.get("BROKER_DIR") or os.path.normpath(os.path.join(HERE, "..", "..", "..", "broker"))
FAKE_MASTER_KEY = "fakebin-master-key-for-tests"
PROXY_VARS = ("http_proxy", "https_proxy", "all_proxy", "no_proxy", "ftp_proxy")


def log(msg):
    sys.stderr.write(f"[broker_up] {msg}\n")
    sys.stderr.flush()


def read_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# --------------------------------------------------------------------------- seeds
def resolve_seed_dir(seed):
    # a seed set's name first: run from the repo root, "mapped" would otherwise be the raw mapped/ folder
    d = os.path.join(HERE, "seeds", seed)
    if os.path.isfile(os.path.join(d, "manifest.json")):
        return d
    if os.path.isfile(os.path.join(seed, "manifest.json")):
        return os.path.abspath(seed)
    raise SystemExit(f"broker_up: no seed set {seed!r} (looked for {d} and {seed}, each with a manifest.json)")


def doc_env(doc_id):
    """The env var the broker reads a document's bin id from (broker_patch._env_name)."""
    return doc_id.upper().replace("-", "_") + "_BIN"


def load_seed(seed):
    """A seed set directory -> what to store. Layout (README.md):
         manifest.json   {"unifiedDivisions": [...], "bizDivisions": [...], "bins": {alias: {env, file}}, ...}
         state/<docId>.json  bare document payloads; stored as {"version", "updatedAt", "doc"} wrappers
         bins/*.json     raw bin records, stored exactly as written (users bin, analysis index, prefs bin)"""
    d = resolve_seed_dir(seed)
    m = read_json(os.path.join(d, "manifest.json"))
    unified = [str(x) for x in (m.get("unifiedDivisions") or [])]
    biz = [str(x) for x in (m.get("bizDivisions") or [])]
    implied = (["portfolio", "gantt-view"] + [f"EXEC-{x}" for x in unified] + [f"SPEC-{x}" for x in unified]
               + [f"BIZ-{x}" for x in biz])
    sdir = os.path.join(d, "state")
    files = {}
    if os.path.isdir(sdir):
        for fn in sorted(os.listdir(sdir)):
            if fn.endswith(".json"):
                files[fn[:-5]] = os.path.join(sdir, fn)
    versions = m.get("versions") or {}
    default_version = int(m.get("stateVersion", 1))
    updated = m.get("updatedAt")
    missing = m.get("missingState", "fresh")
    state = {}
    for doc_id in implied + [x for x in files if x not in implied]:
        if doc_id in files:
            state[doc_id] = {"version": int(versions.get(doc_id, default_version)),
                             "updatedAt": updated if updated is not None else time.time(),
                             "doc": read_json(files[doc_id])}
        elif missing == "fresh":
            # what create_bins.py puts in a new bin: "exists, version 0"
            state[doc_id] = {"version": 0, "updatedAt": None, "doc": {}}
    bins = {}
    for alias, spec in (m.get("bins") or {}).items():
        bins[alias] = {"env": spec["env"], "record": read_json(os.path.join(d, spec["file"]))}
    return {"name": m.get("name") or os.path.basename(d), "dir": d, "unified": unified, "biz": biz,
            "state": state, "bins": bins, "env": {k: str(v) for k, v in (m.get("env") or {}).items()}}


# --------------------------------------------------------------------------- importing the broker
def _purge(broker_dir, modname):
    sys.modules.pop(modname, None)
    for name, mod in list(sys.modules.items()):
        f = getattr(mod, "__file__", None)
        if f and os.path.dirname(os.path.abspath(f)) == broker_dir:
            sys.modules.pop(name, None)


def import_broker(broker_dir, app_ref, timeout):
    """Import <module>:<attr> fresh from broker_dir, retrying while the files are mid-edit."""
    modname, _, attr = app_ref.partition(":")
    attr = attr or "app"
    deadline = time.time() + timeout
    last = None
    while True:
        _purge(broker_dir, modname)
        importlib.invalidate_caches()
        try:
            mod = importlib.import_module(modname)
            app = getattr(mod, attr)
            if last:
                log("import succeeded")
            return app
        except BaseException as e:  # noqa: BLE001 — SyntaxError, NameError, SystemExit... while mid-edit
            if isinstance(e, KeyboardInterrupt):
                raise
            msg = f"{type(e).__name__}: {e}"
            if msg != last:
                log(f"importing the broker failed, retrying until it imports (a file may be mid-edit): {msg}")
                last = msg
            if time.time() > deadline:
                raise RuntimeError(f"could not import {app_ref} from {broker_dir} within {timeout:.0f}s: {msg}")
            time.sleep(1.0)


# --------------------------------------------------------------------------- the served app
class SwappableApp:
    """The ASGI app uvicorn serves. It forwards to the current broker app, so a reset can swap in a
    freshly imported broker (cold caches) without closing the port. Lifespan is driven per app, so a
    swapped-in app gets its startup (and the old one its shutdown) like a restart would give them."""

    def __init__(self, app):
        self.app = app
        self.loop = None
        self._life = {}          # id(app) -> (task, inbox, outbox, state)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "lifespan":
            await self._serve_lifespan(receive, send)
            return
        app = self.app
        life = self._life.get(id(app))
        if life is not None:
            scope = dict(scope)
            scope["state"] = dict(life[3])
        await app(scope, receive, send)

    async def _serve_lifespan(self, receive, send):
        self.loop = asyncio.get_running_loop()
        while True:
            msg = await receive()
            if msg["type"] == "lifespan.startup":
                err = await self._start(self.app)
                if err:
                    await send({"type": "lifespan.startup.failed", "message": err})
                    return
                await send({"type": "lifespan.startup.complete"})
            elif msg["type"] == "lifespan.shutdown":
                await self._stop(self.app)
                await send({"type": "lifespan.shutdown.complete"})
                return

    async def _start(self, app):
        inbox, outbox, state = asyncio.Queue(), asyncio.Queue(), {}
        scope = {"type": "lifespan", "asgi": {"version": "3.0", "spec_version": "2.0"}, "state": state}

        async def run():
            try:
                await app(scope, inbox.get, outbox.put)
            except Exception as e:  # noqa: BLE001 — an app without lifespan support (uvicorn's "auto")
                await outbox.put({"type": "lifespan.unsupported", "error": repr(e)})

        task = asyncio.ensure_future(run())
        await inbox.put({"type": "lifespan.startup"})
        msg = await outbox.get()
        if msg["type"] == "lifespan.startup.failed":
            return msg.get("message") or "lifespan startup failed"
        if msg["type"] == "lifespan.startup.complete":
            self._life[id(app)] = (task, inbox, outbox, state)
        return None

    async def _stop(self, app):
        life = self._life.pop(id(app), None)
        if not life:
            return
        task, inbox, outbox, _ = life
        await inbox.put({"type": "lifespan.shutdown"})
        try:
            await asyncio.wait_for(outbox.get(), 5)
        except asyncio.TimeoutError:
            task.cancel()

    async def _swap(self, new_app):
        err = await self._start(new_app)
        if err:
            raise RuntimeError(f"the new broker app failed to start: {err}")
        old, self.app = self.app, new_app
        await self._stop(old)

    def swap(self, new_app, timeout=30):
        """From another thread: start the new app, switch to it, stop the old one."""
        if self.loop is None:
            self.app = new_app
            return
        asyncio.run_coroutine_threadsafe(self._swap(new_app), self.loop).result(timeout)


# --------------------------------------------------------------------------- local HTTP calls
def http_call(base, method, path, body=None, headers=None, timeout=30):
    u = urlsplit(base)
    conn = http.client.HTTPConnection(u.hostname, u.port, timeout=timeout)
    try:
        h = dict(headers or {})
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            h["Content-Type"] = "application/json"
        conn.request(method, path, body=data, headers=h)
        r = conn.getresponse()
        raw = r.read()
        try:
            obj = json.loads(raw) if raw else None
        except ValueError:
            obj = raw.decode("utf-8", "replace")
        return r.status, obj
    finally:
        conn.close()


# --------------------------------------------------------------------------- control + admin
class Control:
    def __init__(self, args, store):
        self.args = args
        self.store = store
        self.lock = threading.RLock()
        self.broker_dir = os.path.abspath(args.broker_dir)
        self.cli_env = dict(kv.split("=", 1) for kv in args.env)
        self.cli_unset = list(args.unset)
        self.env_names = set()
        self.seed = None
        self.docs = {}
        self.wrapper = None
        self.broker_url = None
        self.fake_url = None
        self.reloads = 0

    @staticmethod
    def _bin_id(name):
        return "fakebin-" + name.lower()

    def _env_for(self, s):
        """The broker env for a loaded seed set, and the name -> bin id map."""
        env = {"JSONBIN_MASTER_KEY": FAKE_MASTER_KEY, "BROKER_TOKEN": self.args.token,
               "ALLOWED_ORIGINS": self.args.origins,
               "UNIFIED_DIVISIONS": ",".join(s["unified"]), "BIZ_DIVISIONS": ",".join(s["biz"])}
        docs = {}
        for doc_id in s["state"]:
            env[doc_env(doc_id)] = docs[doc_id] = self._bin_id(doc_id)
        for alias, b in s["bins"].items():
            env[b["env"]] = docs[alias] = self._bin_id(alias)
        env.update(s["env"])
        env.update(self.cli_env)
        return env, docs

    def _set_env(self, env):
        """Point the process env at the seed's bins. Returns what to pass back to restore the previous env."""
        names = set(env) | set(self.cli_unset) | self.env_names
        before = {k: os.environ.get(k) for k in names}
        for name in self.env_names - set(env):
            os.environ.pop(name, None)
        os.environ.update(env)
        for name in self.cli_unset:
            os.environ.pop(name, None)
        prev_names, self.env_names = self.env_names, set(env) | set(self.cli_unset)
        return before, prev_names

    def _restore_env(self, saved):
        before, prev_names = saved
        for k, v in before.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        self.env_names = prev_names

    def _store_bins(self, s, docs):
        self.store.reset()
        for doc_id, rec in s["state"].items():
            self.store.put_bin(docs[doc_id], rec, alias=doc_id)
        for alias, b in s["bins"].items():
            self.store.put_bin(docs[alias], b["record"], alias=alias)
        self.seed, self.docs = s, docs

    def apply_seed(self, seed):
        """Replace every bin with the seed set's content and point the env at them (the broker reads its
        env at import: used once, before the first import)."""
        s = load_seed(seed)
        with self.lock:
            env, docs = self._env_for(s)
            self._set_env(env)
            self._store_bins(s, docs)

    def reload(self, timeout=None):
        """Re-import the broker modules and swap the served app (fresh caches; port stays open)."""
        with self.lock:
            app = import_broker(self.broker_dir, self.args.app, timeout or self.args.import_timeout)
            self.wrapper.swap(app)
            self.reloads += 1

    def reset(self, seed=None, reload=True, timeout=None):
        """Back to a seed set (this one by default). The new broker is imported BEFORE any bin changes,
        so a reset that cannot import (a file mid-edit) leaves bins, env and the served broker as they were."""
        s = load_seed(seed or self.seed["dir"])
        with self.lock:
            env, docs = self._env_for(s)
            saved = self._set_env(env)
            app = None
            if reload:
                try:
                    app = import_broker(self.broker_dir, self.args.app, timeout or self.args.import_timeout)
                except BaseException:
                    self._restore_env(saved)
                    raise
            self._store_bins(s, docs)
            if app is not None:
                self.wrapper.swap(app)
                self.reloads += 1

    def put_through_broker(self, doc_id, doc, if_match=None, extra=None):
        """Save a document the way another editor's page does: PUT /state/<id> with the token,
        If-Match (the current etag unless given) and the client id. Returns the broker's answer."""
        auth = {"Authorization": "Bearer " + self.args.token}
        path = "/state/" + quote(doc_id, safe="")
        if if_match is None:
            st, v = http_call(self.broker_url, "GET", path + "/version", headers=auth)
            if st != 200 or not isinstance(v, dict):
                return st, {"error": "reading the current version failed", "status": st, "body": v}
            if_match = v.get("etag") or str(v.get("version", 0))
        payload = {"doc": doc, "client": self.args.client}
        payload.update(extra or {})
        return http_call(self.broker_url, "PUT", path, body=payload, headers={**auth, "If-Match": str(if_match)})

    def config(self):
        s = self.seed or {}
        return {
            "brokerUrl": self.broker_url, "fakebinUrl": self.fake_url,
            "adminUrl": (self.fake_url or "") + "/__admin", "pid": os.getpid(),
            "seed": s.get("name"), "seedDir": s.get("dir"), "brokerDir": self.broker_dir, "app": self.args.app,
            "token": self.args.token, "client": self.args.client,
            "unifiedDivisions": s.get("unified"), "bizDivisions": s.get("biz"),
            "docs": dict(self.docs), "reloads": self.reloads,
            "env": {k: os.environ.get(k) for k in sorted(self.env_names)},
        }


def make_admin(fakebin, store, ctl):
    class BrokerAdmin(fakebin.Admin):
        def __init__(self):
            super().__init__(store)
            self.add("GET", r"/__admin/config/?", self.config)
            self.add("POST", r"/__admin/docs/(?P<name>[^/]+)/edit", self.edit)
            self.add("POST", r"/__admin/reset/?", self.reset)
            self.add("POST", r"/__admin/restart/?", self.restart)

        def summary(self, **kw):
            st, out = super().summary(**kw)
            out["config"] = ctl.config()
            return st, out

        def config(self, **_):
            return 200, ctl.config()

        def edit(self, name, data, **_):
            if "doc" not in data:
                return 400, {"error": 'body must be {"doc": <the whole document>, "ifMatch"?: "<etag>"}'}
            return ctl.put_through_broker(name, data["doc"], if_match=data.get("ifMatch"), extra=data.get("extra"))

        def reset(self, data, **_):
            try:
                ctl.reset(data.get("seed"), reload=data.get("reload", True), timeout=data.get("importTimeout"))
            except (Exception, SystemExit) as e:  # noqa: BLE001
                return 500, {"error": f"reset failed: {type(e).__name__}: {e}"}
            return 200, {"ok": True, "reloaded": bool(data.get("reload", True)), "config": ctl.config()}

        def restart(self, data, **_):
            try:
                ctl.reload(data.get("importTimeout"))
            except Exception as e:  # noqa: BLE001
                return 500, {"error": f"restart failed: {type(e).__name__}: {e}"}
            return 200, {"ok": True, "config": ctl.config()}

    return BrokerAdmin()


# --------------------------------------------------------------------------- main
def parse_args(argv):
    p = argparse.ArgumentParser(description="Run the real broker locally against an in-memory JSONBin.")
    p.add_argument("--seed", default="sample", help="seed set name under seeds/, or a directory (default: sample)")
    p.add_argument("--port", type=int, default=0, help="broker port (default: a free one)")
    p.add_argument("--admin-port", type=int, default=0, help="fakebin + admin port (default: a free one)")
    p.add_argument("--broker-dir", default=DEFAULT_BROKER_DIR)
    p.add_argument("--app", default="broker:app", help="module:attribute of the ASGI app (default broker:app)")
    p.add_argument("--token", default="test-token")
    p.add_argument("--origins", default="*", help="ALLOWED_ORIGINS (default *)")
    p.add_argument("--client", default="calm-1", help='"client" sent by admin edits (default calm-1)')
    p.add_argument("--env", action="append", default=[], metavar="NAME=VALUE", help="extra/override broker env")
    p.add_argument("--unset", action="append", default=[], metavar="NAME", help="remove a variable from the broker env")
    p.add_argument("--import-timeout", type=float, default=90.0)
    p.add_argument("--exit-with-parent", action="store_true", help="exit when the parent process goes away")
    p.add_argument("--ready-file", help="also write the URLs as JSON here when ready")
    p.add_argument("--no-ua-check", action="store_true", help="don't emulate Cloudflare's 403 for urllib's default UA")
    p.add_argument("--verbose", action="store_true", help="uvicorn access log + fakebin request log on stderr")
    a = p.parse_args(argv)
    for kv in a.env:
        if "=" not in kv:
            p.error(f"--env takes NAME=VALUE (got {kv!r})")
    return a


def main(argv=None):
    args = parse_args(argv)
    for k in list(os.environ):
        if k.lower() in PROXY_VARS:
            os.environ.pop(k, None)
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    sys.dont_write_bytecode = True          # never write __pycache__ into the broker folder

    sys.path.insert(0, HERE)
    import fakebin
    import uvicorn

    store = fakebin.FakeJSONBin(master_key=FAKE_MASTER_KEY, check_ua=not args.no_ua_check)
    ctl = Control(args, store)
    fake = fakebin.FakeBinServer(store, port=args.admin_port, admin=make_admin(fakebin, store, ctl),
                                 verbose=args.verbose).start()
    ctl.fake_url = fake.url
    fakebin.install_redirect(fake.url, store)
    ctl.apply_seed(args.seed)

    if not os.path.isfile(os.path.join(ctl.broker_dir, args.app.partition(":")[0] + ".py")):
        raise SystemExit(f"broker_up: no {args.app.partition(':')[0]}.py in {ctl.broker_dir}")
    sys.path.insert(0, ctl.broker_dir)
    app = import_broker(ctl.broker_dir, args.app, args.import_timeout)

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", args.port))
    ctl.broker_url = f"http://127.0.0.1:{sock.getsockname()[1]}"
    ctl.wrapper = SwappableApp(app)

    config = uvicorn.Config(ctl.wrapper, lifespan="on", interface="asgi3",
                            log_level="info" if args.verbose else "warning", access_log=args.verbose,
                            timeout_graceful_shutdown=2)
    server = uvicorn.Server(config)

    def announce():
        while not server.started:
            if server.should_exit:
                return
            time.sleep(0.02)
        for _ in range(200):                  # one real request through the stack before saying "ready"
            try:
                http_call(ctl.broker_url, "GET", "/health", timeout=5)
                break
            except OSError:
                time.sleep(0.05)
        if args.ready_file:
            with open(args.ready_file, "w", encoding="utf-8") as fh:
                json.dump(ctl.config(), fh, indent=2)
        sys.stdout.write(f"FAKEBIN_URL={fake.url}\nADMIN_URL={fake.url}/__admin\nBROKER_URL={ctl.broker_url}\n")
        sys.stdout.flush()

    threading.Thread(target=announce, name="announce", daemon=True).start()

    if args.exit_with_parent:
        ppid = os.getppid()

        def watch():
            while True:
                time.sleep(0.5)
                if os.getppid() != ppid:
                    log("parent process went away; stopping")
                    server.should_exit = True
                    time.sleep(5)
                    os._exit(0)

        threading.Thread(target=watch, name="parent-watch", daemon=True).start()

    try:
        server.run(sockets=[sock])
    finally:
        fake.stop()


if __name__ == "__main__":
    main()
