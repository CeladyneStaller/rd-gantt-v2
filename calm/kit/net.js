/* ============================================================================
   Calm kit: the broker connection (live builds only; LIVE is false on the canvas and in the tests).

   Today's apps' contract, unchanged:
     GET  /state/{id}            -> { doc, etag, version }          404: no document yet
     GET  /state/{id}/version    -> { version, etag }               polled every 25 s
     PUT  /state/{id}  { doc, client }   If-Match: <etag> ("0" for a new document); 412 if someone saved first
     GET  /roster   GET /analysis   GET|PATCH /prefs/{email}
   Every call sends Authorization: Bearer <rd_broker_token>. `client` names this build so the broker can
   turn away pages that predate it (an old tab still open after the update).

   What an app loads and may save comes from its shell's APP_LIVE_PLAN(C). Modules never talk to the
   broker: they change C.D through C.mutate, and NET saves every writable document whose content changed
   (a whole-document PUT, like today) 0.7 s after the last change and within 2.5 s while editing.
   A refused save (412): the portfolio merges field by field (MERGE.three: your fields, their everything
   else) and saves again; any other document reloads and your unsaved change is dropped, as today.
   A dropped connection keeps unsaved changes in the page and retries; closing the page with unsaved
   changes asks first. A load that fails for a passing reason (offline, a 5xx) tries again by itself.

   Shell hooks (all optional):
     APP_LIVE_PLAN(C) -> { roster, prefs, autoPass, createPortfolio, docs(P) -> [ids], writable(id) -> bool,
                           quiet(id) -> bool }
                                createPortfolio: with no portfolio on the broker, load a blank one (Planning)
                                quiet: a document whose changes the poll takes in without "Updated from another editor."
     APP_LIVE_READY(C, url)     after a load; `url` (the page's parameters, lower-case keys) on the first
                                successful load only, null after that
     APP_LIVE_STATUS(C, s)      s = { phase, status } with phase 'loading' | 'ok' | 'notoken' | 'badtoken' |
                                'noportfolio' | 'fail' | 'offline' | 'outdated'
     APP_LIVE_NOTICE(C, tone, text)   conflicts and other editors' changes (default: a toast)
   ========================================================================== */
const NET = (function () {
  const BROKER = 'https://web-production-b17a2.up.railway.app';
  const CLIENT = 'calm-1';
  const TOKEN_KEY = 'rd_broker_token';
  const POLL_MS = 25000, DEBOUNCE_MS = 700, MAXWAIT_MS = 2500;
  const warned = {};

  function warnOnce(t) { if (warned[t]) return; warned[t] = 1; try { console.warn('[calm] ' + t); } catch (e) { /* no console */ } }
  function token() { try { return String(window.localStorage.getItem(TOKEN_KEY) || '').trim(); } catch (e) { return ''; } }
  function storeToken(t) {
    try { if (t) window.localStorage.setItem(TOKEN_KEY, t); else window.localStorage.removeItem(TOKEN_KEY); } catch (e) { /* storage blocked */ }
  }
  function enc(id) { return encodeURIComponent(id); }
  function kindOf(id) { return id === 'portfolio' ? 'portfolio' : /^SPEC-/.test(id) ? 'spec' : 'exec'; }
  function divOf(id) { return String(id).replace(/^(EXEC|BIZ|SPEC)-/, ''); }
  function getObj(C, id) { const D = C.D; return id === 'portfolio' ? D.portfolio : kindOf(id) === 'spec' ? (D.spec || {})[id] : (D.docs || {})[id]; }
  function setObj(C, id, o) {
    const D = C.D;
    if (id === 'portfolio') D.portfolio = o;
    else if (kindOf(id) === 'spec') { D.spec = D.spec || {}; D.spec[id] = o; }
    else { D.docs = D.docs || {}; D.docs[id] = o; }
    D.version = (D.version || 0) + 1;
  }
  function plan(C) {
    const p = typeof APP_LIVE_PLAN === 'function' ? APP_LIVE_PLAN(C) : null;
    return Object.assign({ roster: true, prefs: false, autoPass: false, createPortfolio: false, docs: () => [], writable: () => false }, p || {});
  }
  function now() { return Date.now(); }

  /* ------------------------------------------------------------ the wire */
  async function call(method, path, body, ifMatch, opts) {
    const headers = { Authorization: 'Bearer ' + token() };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (ifMatch != null) headers['If-Match'] = String(ifMatch);
    let res;
    try {
      res = await fetch(BROKER + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', keepalive: !!(opts && opts.keepalive) });
    } catch (e) {
      const err = new Error('offline');
      err.offline = true;
      throw err;
    }
    if (res.status === 404 && method === 'GET' && /^\/state\/[^/]+$/.test(path)) return null;
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  function transient(e) { return !!(e && (e.offline || !e.status || e.status >= 500)); }

  /* ------------------------------------------------------------ status and notices */
  function status(C, phase, code) {
    const s = { phase: phase, status: code || null };
    C.net.phase = phase;
    if (typeof APP_LIVE_STATUS === 'function') APP_LIVE_STATUS(C, s);
    else if (phase === 'notoken') C.toast('No broker token in this browser yet. Open this app from the Hub, or add the token in Settings.', 'info');
    else if (phase === 'badtoken') C.toast('The broker didn’t accept the token. Check it in Settings.', 'err');
    else if (phase === 'fail') C.toast('Load failed (' + (code || 'error') + ').', 'err');
    else if (phase === 'offline') C.toast('Couldn’t reach the broker. Check your connection; this page keeps trying.', 'err');
    else if (phase === 'outdated') C.toast('This page is out of date. Reload it to keep working.', 'err');
  }
  function notice(C, tone, text) {
    if (typeof APP_LIVE_NOTICE === 'function') APP_LIVE_NOTICE(C, tone, text);
    else C.toast(text, tone === 'bad' ? 'err' : tone === 'ok' ? 'ok' : 'info');
  }
  function setSave(C, state, extra) {
    C.setState({ save: Object.assign({ state: state, at: now() }, extra || {}) });
  }

  /* ------------------------------------------------------------ documents */
  function repair(C, id, doc) {
    const kind = kindOf(id);
    if (kind === 'portfolio') REPAIR.portfolio(doc);
    else if (kind === 'spec') REPAIR.spec(doc);
    else REPAIR.exec(doc);
  }
  /* put a document read from the broker into C.D and the registry. Gates at target are passed here
     (Execution and Sales, writable documents), and that counts as a change to save. A full load passes
     them once every document is in (passOnLoad), since a pulled target reads the other documents. */
  function install(C, id, resp, p, reg, passLater) {
    const kind = kindOf(id);
    const doc = resp && resp.doc && typeof resp.doc === 'object' && !Array.isArray(resp.doc) ? resp.doc : REPAIR.blank(kind);
    repair(C, id, doc);
    const base = JSON.stringify(doc);
    const writable = !!p.writable(id);
    if (!passLater && kind === 'exec' && p.autoPass && writable && !C.state.ro && REPAIR.autoPass(doc, divOf(id), C.D.portfolio, C.D.today) && C.net) C.net.sinceSave = true;
    setObj(C, id, doc);
    reg[id] = { id: id, kind: kind, writable: writable, etag: resp ? String(resp.etag) : '0', version: resp ? Number(resp.version) || 0 : 0, base: base, missing: !resp };
    return doc;
  }
  function passOnLoad(C, id, p) {
    const doc = getObj(C, id);
    if (!doc || kindOf(id) !== 'exec' || !p.autoPass || !p.writable(id) || C.state.ro) return;
    if (REPAIR.autoPass(doc, divOf(id), C.D.portfolio, C.D.today)) {
      C.D.version = (C.D.version || 0) + 1;      // a passed gate changes what other documents' pulled targets read
      if (C.net) C.net.sinceSave = true;
    }
  }
  function adopt(C, id, resp) {
    const n = C.net;
    install(C, id, resp, n.plan, n.reg);
  }
  /* every writable document whose content differs from what the broker has */
  function dirty(C) {
    const n = C.net;
    if (!n || !n.loaded) return [];
    const p = n.plan;
    const D = C.D;
    /* a document a module created after the load (a new division's first document): saved from its next change */
    [['docs', D.docs || {}], ['spec', D.spec || {}]].forEach((pair) => {
      Object.keys(pair[1]).forEach((id) => {
        if (n.reg[id] || !pair[1][id]) return;
        n.reg[id] = { id: id, kind: kindOf(id), writable: !!p.writable(id), etag: '0', version: 0, base: JSON.stringify(pair[1][id]), missing: true };
      });
    });
    const out = [];
    Object.keys(n.reg).forEach((id) => {
      const r = n.reg[id];
      const o = getObj(C, id);
      if (!o) return;
      const s = JSON.stringify(o);
      if (s === r.base) return;
      if (!r.writable) { warnOnce('a change to ' + id + ' was not saved: this app does not write that document'); return; }
      out.push({ id: id, json: s });
    });
    return out;
  }

  /* ------------------------------------------------------------ loading */
  function urlParams() {
    const out = {};
    try { new URLSearchParams(window.location.search || '').forEach((v, k) => { out[String(k).toLowerCase()] = v; }); } catch (e) { /* no URL */ }
    return out;
  }
  /* ?token= is saved in this browser and removed from the address bar, as today */
  function takeUrlToken() {
    try {
      const u = new URL(window.location.href);
      let t = null;
      const drop = [];
      u.searchParams.forEach((v, k) => { if (String(k).toLowerCase() === 'token') { t = v; drop.push(k); } });
      if (t == null) return;
      storeToken(String(t).trim());
      drop.forEach((k) => u.searchParams.delete(k));
      const q = u.searchParams.toString();
      window.history.replaceState(window.history.state, '', u.pathname + (q ? '?' + q : '') + u.hash);
    } catch (e) { /* no history API */ }
  }
  async function loadRoster(C) {
    try {
      const r = await call('GET', '/roster');
      const users = ((r && r.users) || []).filter((u) => u && typeof u.email === 'string').map((u) => {
        const email = u.email.trim().toLowerCase();
        return {
          email: email,
          disabled: !!u.disabled,
          name: typeof u.name === 'string' && u.name.trim() ? u.name.trim() : '',
          orgRole: typeof u.orgRole === 'string' ? u.orgRole.trim().toLowerCase() : '',
          leadOf: Array.isArray(u.leadOf) ? u.leadOf : [],
          leadUnits: Array.isArray(u.leadUnits) ? u.leadUnits : [],
          leadDivisions: Array.isArray(u.leadDivisions) ? u.leadDivisions : []
        };
      });
      C.D.roster = { users: users };
    } catch (e) {
      if (e.status === 401) throw e;
      warnOnce('the roster could not be read (' + (e.status || 'offline') + '); names and roles fall back to the Hub sign-in');
    }
  }
  /* one load at a time; a load asked for meanwhile (a new token, say) runs right after */
  async function load(C) {
    const n = C.net;
    if (n.loading) { n.again = true; return; }
    n.loading = true;
    clearTimeout(n.retry);
    n.retry = null;
    try { await loadOnce(C); } finally { n.loading = false; }
    if (n.again) { n.again = false; return load(C); }
  }
  /* a load that failed for a passing reason (offline, a 5xx) tries again: 5 s, 10 s, 20 s … up to a minute */
  function retryLoad(C) {
    const n = C.net;
    n.retryMs = Math.min(60000, n.retryMs ? n.retryMs * 2 : 5000);
    n.retry = setTimeout(() => { n.retry = null; if (!n.loaded) load(C); }, n.retryMs);
  }
  async function loadOnce(C) {
    const n = C.net;
    n.plan = plan(C);
    stopPoll(C);
    if (!token()) { n.loaded = false; status(C, 'notoken'); C.bump(); return; }
    status(C, 'loading');
    try {
      if (n.plan.roster) await loadRoster(C);
      const pr = await call('GET', '/state/portfolio');
      /* no portfolio yet: only Planning starts one (a blank plan, created by its first save with If-Match "0") */
      if (!pr && !n.plan.createPortfolio) { n.loaded = false; status(C, 'noportfolio'); C.bump(); return; }
      /* read everything first, then swap it in: a load that fails halfway leaves the page as it was */
      const view = pr && pr.doc && typeof pr.doc === 'object' && !Array.isArray(pr.doc) ? JSON.parse(JSON.stringify(pr.doc)) : REPAIR.blank('portfolio');
      REPAIR.portfolio(view);
      const ids = K.uniq((n.plan.docs(view) || []).filter((id) => id && id !== 'portfolio'));
      const got = await Promise.all(ids.map((id) => call('GET', '/state/' + enc(id)).then((r) => ({ id: id, r: r }))));
      const reg = {};
      install(C, 'portfolio', pr, n.plan, reg);
      got.forEach((x) => install(C, x.id, x.r, n.plan, reg, true));
      got.forEach((x) => passOnLoad(C, x.id, n.plan));
      n.reg = reg;
      n.loaded = true;
      n.lastLoad = now();
      n.offline = false;
      if (typeof C.liveRoster === 'function') C.liveRoster();
      n.retryMs = 0;
      if (typeof APP_LIVE_READY === 'function') APP_LIVE_READY(C, n.urlUsed ? null : n.url);   // the page's parameters apply once
      n.urlUsed = true;
      C.setState({ sim: Object.assign({}, C.state.sim, { offline: false }), save: { state: 'saved', at: now() }, rev: (C.state.rev || 0) + 1 });
      status(C, pr ? 'ok' : 'noportfolio');
      if (dirty(C).length && !C.state.ro) schedule(C);
      startPoll(C);
      if (n.plan.prefs) pullPrefs(C);
    } catch (e) {
      /* a reload that fails keeps what the page had, unsaved changes included, and goes on polling and saving */
      const had = n.loaded;
      if (e.status === 401) status(C, 'badtoken', 401);
      else if (transient(e) && !e.status) status(C, 'offline');
      else status(C, 'fail', e.status || null);
      if (had) {
        if (transient(e) && !e.status) goOffline(C);
        startPoll(C);
        if (dirty(C).length && !C.state.ro) schedule(C);
      } else {
        n.loaded = false;
        if (e.status !== 401 && transient(e)) retryLoad(C);
      }
      C.bump();
    }
  }
  /* documents the plan lists that the page doesn't have: a division added in Planning since the load, or one
     whose read failed. Asked on every poll; returns how many it loaded. */
  async function loadNew(C) {
    const n = C.net;
    const ids = K.uniq((n.plan.docs(C.D.portfolio) || []).filter((id) => id && id !== 'portfolio' && !n.reg[id]));
    let added = 0;
    for (let i = 0; i < ids.length; i++) {
      try { const r = await call('GET', '/state/' + enc(ids[i])); install(C, ids[i], r, n.plan, n.reg); added++; } catch (e) { if (transient(e)) break; }
    }
    return added;
  }

  /* ------------------------------------------------------------ saving */
  function schedule(C) {
    const n = C.net;
    if (!n || !n.loaded) return;
    clearTimeout(n.debounce);
    n.debounce = setTimeout(() => flush(C), DEBOUNCE_MS);
    if (!n.maxWait) n.maxWait = setTimeout(() => flush(C), MAXWAIT_MS);
  }
  function changed(C) {
    const n = C.net;
    if (!n || !n.loaded || C.state.ro) return;
    n.sinceSave = true;
    if (n.offline) setSave(C, 'offline', { pending: true });
    else setSave(C, 'saving');
    schedule(C);
  }
  function flush(C) {
    const n = C.net;
    if (!n) return Promise.resolve(true);
    clearTimeout(n.debounce);
    clearTimeout(n.maxWait);
    n.debounce = n.maxWait = null;
    n.queue = n.queue.then(() => saveAll(C)).catch((e) => { try { console.error('[calm] save failed', e); } catch (x) { /* no console */ } return false; });
    return n.queue;
  }
  async function saveAll(C) {
    const n = C.net;
    if (!n.loaded || C.state.ro) return true;
    const list = dirty(C);
    if (!list.length) { if (!n.offline) setSave(C, 'saved'); return true; }
    /* every change should come through C.mutate; a document that changed without one is a bug to find
       (a view sorting a stored list in place, say). It is still saved: data is never dropped silently. */
    if (!n.sinceSave) warnOnce('saving ' + list.map((x) => x.id).join(', ') + ' although nothing called C.mutate since the last save');
    setSave(C, 'saving');
    for (let i = 0; i < list.length; i++) {
      const r = await saveOne(C, list[i]);
      if (r === 'stop') return false;
    }
    if (dirty(C).length) { schedule(C); return false; }
    n.sinceSave = false;
    setSave(C, 'saved');
    return true;
  }
  async function saveOne(C, item) {
    const n = C.net;
    const r = n.reg[item.id];
    if (!r) return true;
    try {
      const res = await call('PUT', '/state/' + enc(item.id), { doc: JSON.parse(item.json), client: CLIENT }, r.etag || '0');
      r.etag = String(res.etag);
      r.version = Number(res.version) || 0;
      r.base = item.json;
      r.missing = false;
      if (n.offline) backOnline(C, true);
      return true;
    } catch (e) {
      if (e.status === 412) { await conflict(C, item.id); return true; }
      if (e.status === 401) { status(C, 'badtoken', 401); setSave(C, 'error', { why: 'Not saved: the broker refused the token.' }); return 'stop'; }
      if (e.status === 426) { status(C, 'outdated', 426); setSave(C, 'error', { why: 'Not saved: reload this page.' }); return 'stop'; }
      if (transient(e)) { goOffline(C); return 'stop'; }
      setSave(C, 'error', { why: 'Not saved (' + e.status + ').' });
      return 'stop';
    }
  }
  async function conflict(C, id) {
    const n = C.net;
    const r = n.reg[id];
    let fresh;
    try { fresh = await call('GET', '/state/' + enc(id)); } catch (e) {
      if (transient(e)) { goOffline(C); return; }
      notice(C, 'bad', 'Save conflict couldn’t resolve (' + (e.status || 'error') + ').');
      return;
    }
    if (r.kind === 'portfolio') {
      const theirs = fresh && fresh.doc && typeof fresh.doc === 'object' ? fresh.doc : REPAIR.blank('portfolio');
      REPAIR.portfolio(theirs);
      const m = MERGE.three(JSON.parse(r.base), getObj(C, id), theirs);
      if (!m.ok) {
        warnOnce('portfolio merge gave up: ' + m.clashes.join('; '));
        adopt(C, id, fresh);
        notice(C, 'bad', 'Another editor changed the same part of the plan first. Their version is loaded; re-apply your change.');
        C.bump();
        return;
      }
      REPAIR.portfolio(m.value);
      setObj(C, id, m.value);
      r.etag = fresh ? String(fresh.etag) : '0';
      r.version = fresh ? Number(fresh.version) || 0 : 0;
      r.base = JSON.stringify(theirs);
      const json = JSON.stringify(m.value);
      try {
        const res = await call('PUT', '/state/' + enc(id), { doc: m.value, client: CLIENT }, r.etag);
        r.etag = String(res.etag);
        r.version = Number(res.version) || 0;
        r.base = json;
        notice(C, 'ok', 'Saved, merged with a change another editor saved first.');
      } catch (e2) {
        if (transient(e2)) { goOffline(C); C.bump(); return; }
        if (e2.status === 412) {
          let again = null;
          try { again = await call('GET', '/state/' + enc(id)); } catch (e3) { again = fresh; }
          adopt(C, id, again);
          notice(C, 'bad', 'The plan changed again while your change was merging. The latest version is loaded; re-apply your change.');
        } else notice(C, 'bad', 'Save failed (' + (e2.status || 'error') + ').');
      }
      C.bump();
      return;
    }
    adopt(C, id, fresh);
    notice(C, 'bad', 'Another editor saved first — reloaded; re-apply your change.');
    C.bump();
  }

  /* ------------------------------------------------------------ connection */
  function goOffline(C) {
    const n = C.net;
    n.offline = true;
    C.setState({ sim: Object.assign({}, C.state.sim, { offline: true }), save: { state: 'offline', at: now(), pending: dirty(C).length > 0 } });
  }
  function backOnline(C, fromSave) {
    const n = C.net;
    n.offline = false;
    C.setState({ sim: Object.assign({}, C.state.sim, { offline: false }) });
    if (!fromSave) { if (dirty(C).length && !C.state.ro) flush(C); else setSave(C, 'saved'); }
    if (n.plan && n.plan.prefs) pullPrefs(C);
  }
  async function pollOnce(C) {
    const n = C.net;
    if (!n || !n.loaded || n.polling) return;
    n.polling = true;
    try {
      if (!C.state.ro && dirty(C).length) await flush(C);
      const changedIds = [];
      const ids = Object.keys(n.reg);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const r = n.reg[id];
        if (!r) continue;
        let v;
        try { v = await call('GET', '/state/' + enc(id) + '/version'); } catch (e) {
          if (transient(e)) { goOffline(C); return; }
          if (e.status === 401) { status(C, 'badtoken', 401); return; }
          continue;
        }
        if (n.offline) backOnline(C, false);
        if (!v || Number(v.version) === r.version) continue;
        const o = getObj(C, id);
        if (o && r.writable && !C.state.ro && JSON.stringify(o) !== r.base) { await flush(C); continue; }   // your change goes first; a 412 settles it
        let fresh;
        try { fresh = await call('GET', '/state/' + enc(id)); } catch (e) { if (transient(e)) { goOffline(C); return; } continue; }
        adopt(C, id, fresh);
        changedIds.push(id);
      }
      const added = await loadNew(C);
      if (changedIds.length || added) {
        /* a document the plan reads quietly (Execution and Sales: the other app's, read for pulled KPIs) updates without a word */
        if (changedIds.some((id) => !(n.plan.quiet && n.plan.quiet(id)))) notice(C, 'info', 'Updated from another editor.');
        C.bump();
        if (!C.state.ro && dirty(C).length) schedule(C);   // gates that reached their targets in the update
      }
    } finally { n.polling = false; }
  }
  function startPoll(C) {
    const n = C.net;
    stopPoll(C);
    n.poll = setInterval(() => pollOnce(C), POLL_MS);
  }
  function stopPoll(C) { const n = C.net; if (n && n.poll) { clearInterval(n.poll); n.poll = null; } }
  function listen(C) {
    const n = C.net;
    /* back online or back to the tab: a page that never finished loading tries again, a loaded one polls */
    const wake = () => { if (!n.loaded && (n.phase === 'offline' || n.phase === 'fail')) load(C); else pollOnce(C); };
    n.on = {
      online: wake,
      vis: () => {
        if (document.visibilityState === 'hidden') { if (!C.state.ro && dirty(C).length) flush(C); }
        else wake();
      },
      focus: () => { if (n.plan && n.plan.prefs) pullPrefs(C); },
      leave: (e) => {
        if (!n.loaded || C.state.ro || !dirty(C).length) return;
        flush(C);
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('online', n.on.online);
    document.addEventListener('visibilitychange', n.on.vis);
    window.addEventListener('focus', n.on.focus);
    window.addEventListener('beforeunload', n.on.leave);
  }

  /* ------------------------------------------------------------ per-person kanban choices (/prefs) */
  function viewerEmail(C) { const v = typeof C.viewer === 'function' ? C.viewer() : null; return v && v.email ? String(v.email).toLowerCase() : ''; }
  async function pullPrefs(C) {
    const n = C.net;
    const me = viewerEmail(C);
    if (!n || !n.loaded || !me) return;
    try {
      const r = await call('GET', '/prefs/' + enc(me));
      C.D.prefs = { kbDone: (r && r.prefs && r.prefs.kbDone) || {} };
      n.prefsReady = true;
      C.bump();
      if (typeof KB !== 'undefined' && KB && typeof KB.liveSettle === 'function') KB.liveSettle(C);
    } catch (e) { if (transient(e) && !e.status) goOffline(C); }
  }
  /* send this person's Done-column changes; resolves true once the broker has them */
  function pushPrefs(C, email, push) {
    return call('PATCH', '/prefs/' + enc(email), { kbDone: push }, null, { keepalive: true }).then((r) => {
      if (r && r.prefs) C.D.prefs = { kbDone: r.prefs.kbDone || {} };
      return true;
    }, (e) => { if (transient(e) && !e.status) goOffline(C); return false; });
  }

  /* ------------------------------------------------------------ analysis portal index (Connect data) */
  function analysis(C) {
    const n = C.net;
    if (!n) return Promise.reject(new Error('not connected'));
    if (n.analysisP) return n.analysisP;
    n.analysisP = call('GET', '/analysis').then((idx) => {
      C.D.analysis = idx && typeof idx === 'object' ? idx : { schema: 2, runs: [] };
      C.bump();
      return C.D.analysis;
    }, (e) => { n.analysisP = null; throw e; });
    return n.analysisP;
  }

  /* ------------------------------------------------------------ public */
  function boot(C) {
    if (C.net) return;
    C.net = { reg: {}, plan: plan(C), loaded: false, phase: '', queue: Promise.resolve(), debounce: null, maxWait: null, poll: null, offline: false, polling: false, lastLoad: 0, url: urlParams(), urlUsed: false, loading: false, again: false, retry: null, retryMs: 0, prefsReady: false, analysisP: null, on: null };
    takeUrlToken();
    if (Object.prototype.hasOwnProperty.call(C.net.url, 'readonly')) C.setState({ ro: true });
    listen(C);
    load(C);
  }
  function stop(C) {
    const n = C.net;
    if (!n) return;
    stopPoll(C);
    clearTimeout(n.debounce);
    clearTimeout(n.maxWait);
    clearTimeout(n.retry);
    if (n.on) {
      window.removeEventListener('online', n.on.online);
      document.removeEventListener('visibilitychange', n.on.vis);
      window.removeEventListener('focus', n.on.focus);
      window.removeEventListener('beforeunload', n.on.leave);
    }
  }
  /* load everything again; unsaved changes are saved first, and if they can't be, the page doesn't reload */
  async function reload(C) {
    const n = C.net;
    if (!n) return;
    await flush(C);
    if (n.loaded && !C.state.ro && dirty(C).length) {
      notice(C, 'bad', 'Your latest changes aren’t saved yet, so the page didn’t reload. It keeps trying to save them.');
      return false;
    }
    return load(C);
  }
  function saveToken(C, t) {
    storeToken(String(t || '').trim());
    return reload(C);
  }
  function info(C) {
    const n = C.net || {};
    return { loaded: !!n.loaded, phase: n.phase || '', lastLoad: n.lastLoad || 0, offline: !!n.offline, hasToken: !!token(), pending: n.loaded ? dirty(C).length : 0, docs: Object.keys(n.reg || {}) };
  }
  /* primitives for flows that must order their writes (Sales: recover stranded data) */
  function get(C, id) { return call('GET', '/state/' + enc(id)); }
  async function put(C, id, doc) {
    const n = C.net;
    const r = n.reg[id] || (n.reg[id] = { id: id, kind: kindOf(id), writable: true, etag: '0', version: 0, base: '', missing: true });
    const json = JSON.stringify(doc);
    const res = await call('PUT', '/state/' + enc(id), { doc: JSON.parse(json), client: CLIENT }, r.etag || '0');
    r.etag = String(res.etag);
    r.version = Number(res.version) || 0;
    r.base = json;
    r.missing = false;
    setObj(C, id, JSON.parse(json));
    return res;
  }
  function putAs(C, id, doc, etag) {
    return call('PUT', '/state/' + enc(id), { doc: doc, client: CLIENT }, etag || '0');
  }
  return {
    BROKER: BROKER, CLIENT: CLIENT, TOKEN_KEY: TOKEN_KEY,
    boot: boot, stop: stop, reload: reload, changed: changed, flush: flush, poll: pollOnce,
    token: token, saveToken: saveToken, info: info, dirty: dirty,
    pushPrefs: pushPrefs, pullPrefs: pullPrefs, analysis: analysis,
    get: get, put: put, putAs: putAs, adopt: adopt, transient: transient
  };
})();
