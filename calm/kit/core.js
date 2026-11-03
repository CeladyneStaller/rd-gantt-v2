/* ============================================================================
   Calm kit: core runtime shared by all four apps.
   Built into each .dc.html by build.py, AFTER the engine (RD), the sample data
   (calmSample) and the seeds (SEEDS), and BEFORE the module files and the app
   file. Read CONTRACT.md before changing anything here.

   Globals available to every module (all live inside the one DC script scope):
     APP          'exec' | 'sales' | 'plan' | 'spec'
     RD           the real rdcore engine (same API the live apps use)
     MODS         module registry (modules add themselves: MODS.kr = {...})
     F            formatting helpers (below)
     K            small pure utilities (below)
     calmDay(iso) calmTs(iso)   day-number and timestamp helpers from the sample
   ========================================================================== */
const MODS = {};
/* Suite rule: only these roster roles (orgRole) may change the plan in Planning.
   Execution, Sales and Product spec stay open to everyone signed in, as today. */
const PLAN_EDITOR_ROLES = ['cto', 'ceo'];
/* today as the live apps compute it: the LOCAL calendar date's day number (todayDay) */
function liveToday() { const n = new Date(); return Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(2020, 0, 1)) / 86400000); }
/* inside an iframe (a Confluence embed): the browser keeps the Hub sign-in from the page */
function inEmbed() { try { return window.self !== window.top; } catch (e) { return true; } }

/* ------------------------------------------------------------------ K: utils */
const K = {
  clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); },
  byOrder(a, b) { return (a.order == null ? 1e9 : a.order) - (b.order == null ? 1e9 : b.order); },
  uniq(arr) { const out = []; arr.forEach((x) => { if (out.indexOf(x) < 0) out.push(x); }); return out; },
  sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0); },
  mean(arr) { const v = arr.filter((x) => x != null && isFinite(x)); return v.length ? K.sum(v) / v.length : null; },
  clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); },
  idx(arr, pred) { for (let i = 0; i < arr.length; i++) if (pred(arr[i], i)) return i; return -1; },
  move(arr, from, to) { const a = arr.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; },
  /* parse a typed number: accepts "1,234.5", " 12 ", "-3"; returns null when not a number */
  num(s) {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) ? s : null;
    const t = String(s).trim().replace(/,/g, '');
    if (!t || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
    const v = Number(t);
    return isFinite(v) ? v : null;
  },
  /* set a value at a dotted path inside a cloned object: setPath({a:{b:[1,2]}}, 'a.b.1', 5) */
  setPath(obj, path, value) {
    const parts = String(path).split('.');
    const root = Array.isArray(obj) ? obj.slice() : Object.assign({}, obj);
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      const nxt = cur[k];
      cur[k] = Array.isArray(nxt) ? nxt.slice() : Object.assign({}, nxt || {});
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
    return root;
  },
  getPath(obj, path) { return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
};

/* ---------------------------------------------------------- F: formatting */
const F = (function () {
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const EPOCH = Date.UTC(2020, 0, 1);
  const DAY = 86400000;
  let ROSTER = [];
  const F = {
    MON: MON,
    setRoster(users) { ROSTER = users || []; },
    /* ---- dates: day numbers since 2020-01-01 UTC ---- */
    dateOf(day) { return new Date(EPOCH + day * DAY); },
    iso(day) { if (day == null || !isFinite(day)) return ''; const d = F.dateOf(day); return d.toISOString().slice(0, 10); },
    fromIso(s) { if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) return null; const t = Date.parse(String(s).trim() + 'T00:00:00Z'); return isFinite(t) ? Math.round((t - EPOCH) / DAY) : null; },
    day(day) { if (day == null || !isFinite(day)) return '—'; const d = F.dateOf(day); return MON[d.getUTCMonth()] + ' ' + d.getUTCDate(); },
    dayY(day) { if (day == null || !isFinite(day)) return '—'; const d = F.dateOf(day); return MON[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear(); },
    /* "Oct 13" when in the same year as `ref` (a day number), otherwise "Oct 13, 2027" */
    dayAuto(day, ref) { if (day == null || !isFinite(day)) return '—'; const y = F.dateOf(day).getUTCFullYear(); return ref != null && F.dateOf(ref).getUTCFullYear() === y ? F.day(day) : F.dayY(day); },
    weekday(day) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][F.dateOf(day).getUTCDay()]; },
    /* relative to today (day numbers): "today", "tomorrow", "in 3 days", "yesterday", "5 days ago" */
    rel(day, today) {
      if (day == null) return '';
      const n = day - today;
      if (n === 0) return 'today';
      if (n === 1) return 'tomorrow';
      if (n === -1) return 'yesterday';
      return n > 0 ? 'in ' + n + ' days' : -n + ' days ago';
    },
    dayOfMs(ms) { return Math.floor((ms - EPOCH) / DAY); },
    msOfDay(day) { return EPOCH + day * DAY; },
    /* timestamps (ms) */
    time(ms) { const d = new Date(ms); let h = d.getUTCHours(); const m = d.getUTCMinutes(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap; },
    stamp(ms) { if (!ms) return '—'; return F.day(F.dayOfMs(ms)) + ', ' + F.time(ms); },
    ago(ms, now) {
      if (!ms) return '';
      const s = Math.max(0, Math.round((now - ms) / 1000));
      if (s < 60) return 'just now';
      const m = Math.round(s / 60);
      if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
      const h = Math.round(m / 60);
      if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
      const d = Math.round(h / 24);
      if (d === 1) return 'yesterday';
      if (d < 14) return d + ' days ago';
      return F.day(F.dayOfMs(ms));
    },
    /* quarters: '2026Q4' -> 'Q4 2026' */
    q(q) { const m = /^(\d{4})Q([1-4])$/.exec(q || ''); return m ? 'Q' + m[2] + ' ' + m[1] : (q || 'No quarter'); },
    qOfDay(day) { const d = F.dateOf(day); return d.getUTCFullYear() + 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1); },
    qRange(q) { const m = /^(\d{4})Q([1-4])$/.exec(q || ''); if (!m) return null; const y = +m[1], i = +m[2] - 1; const s = Math.round((Date.UTC(y, i * 3, 1) - EPOCH) / DAY); const e = Math.round((Date.UTC(y, i * 3 + 3, 1) - EPOCH) / DAY) - 1; return { start: s, end: e }; },
    /* ---- numbers ---- */
    n(v, dp) {
      if (v == null || v === '' || !isFinite(v)) return '—';
      const x = Number(v);
      if (dp != null) return x.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
      const a = Math.abs(x);
      const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4;
      return Number(x.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d });
    },
    /* value with unit: 1.84 'V' -> '1.84 V'; '%' and '°C' attach without a space */
    u(v, unit) { const s = F.n(v); if (s === '—') return s; if (!unit) return s; return /^(%|°)/.test(unit) ? s + unit : s + ' ' + unit; },
    score(s) { return s == null || !isFinite(s) ? '—' : String(Math.round(s)); },
    pct(x) { return x == null || !isFinite(x) ? '—' : Math.round(x) + '%'; },
    plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); },
    list(items) { const a = items.filter(Boolean); if (a.length < 2) return a.join(''); return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; },
    cap(s) { s = String(s || ''); return s ? s[0].toUpperCase() + s.slice(1) : s; },
    /* ---- people (emails are the stored identity) ---- */
    person(email) { const e = String(email || '').toLowerCase(); return ROSTER.find((u) => String(u.email).toLowerCase() === e) || null; },
    /* the roster's name, else the email before the @ in words ("toru.hatsukade@…" -> "Toru Hatsukade") */
    name(email) {
      const u = F.person(email);
      if (u && u.name) return u.name;
      const local = String(email || '').split('@')[0];
      if (!LIVE) return local || '—';   // the sample's people are all on its roster
      const words = local.split(/[._-]+/).filter(Boolean);
      return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : (local || '—');
    },
    first(email) { return F.name(email).split(' ')[0]; },
    initials(email) { const n = F.name(email); const p = n.split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); },
    people(emails) { return F.list((emails || []).map(F.first)); },
    /* the roster's orgRole as a job title: cto -> CTO, ceo -> CEO, lead -> Lead, ic -> Engineer */
    roleLabel(orgRole) { const r = String(orgRole || '').toLowerCase(); return { cto: 'CTO', ceo: 'CEO', lead: 'Lead', ic: 'Engineer' }[r] || (r ? F.cap(r) : ''); },
    roleOf(email) { const u = F.person(email); return u && u.orgRole ? String(u.orgRole).toLowerCase() : ''; },
    /* ---- score bands (the engine's thresholds: 80+ on track, 65 to 79 at risk, below 65 off track) ---- */
    band(score) { if (score == null || !isFinite(score)) return 'none'; const b = RD.band(score); return b === 'on-track' ? 'ok' : b === 'at-risk' ? 'warn' : b === 'off-track' ? 'bad' : 'none'; },
    bandWord(tone) { return { ok: 'On track', warn: 'At risk', bad: 'Off track', none: 'No score yet' }[tone] || ''; },
    tone(t) { return 't-' + (t || 'none'); }
  };
  return F;
})();

/* --------------------------------------------------------------- Component */
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this._t0 = Date.now();
    this._timers = [];
    this.APP = APP;
    this._hub = this.hubSession();   // the real Hub sign-in, when this page shares the Hub's origin (deployed copies)
    this.D = this.freshData();
    this.pullHook();
    const st = {
      rev: 0,                 // bumped after every data mutation
      menu: '',               // id of the one open menu or popover ('' = none)
      sheets: [],             // right-hand editor stack: [{ kind:'mod.name', data:{}, d:{draft}, err:'' }]
      dlg: null,              // confirm / ask dialog
      toasts: [], tseq: 0,
      save: { state: 'saved', at: this.D.nowMs },
      sim: { offline: false, hub: true },
      ro: false,              // read-only preview
      theme: 'light',         // 'light' | 'dark' | 'system'; light until a choice is saved (decided October 14; 'Match system' follows the OS)
      q: '', searchOpen: false,
      settings: false
    };
    MOD_ORDER.forEach((n) => {
      const m = MODS[n];
      if (m && m.state) Object.assign(st, typeof m.state === 'function' ? m.state(this) : K.clone(m.state));
    });
    if (typeof APP_INIT === 'function') APP_INIT(this, st);
    /* who is viewing: the Hub's own sign-in when there is one; otherwise the simulated sign-in, shared by all
       four boards like the real Hub session (the canvas, a file opened locally, a Confluence embed) */
    const vp = this._hub ? { email: this._hub.email, signedIn: true } : LIVE ? { email: '', signedIn: false } : this.storedViewer();
    st.viewer = vp.email;
    st.sim = Object.assign({}, st.sim || {}, { hub: vp.signedIn });
    this.state = st;
    this.applyViewer(st.viewer);
  }

  freshData() {
    if (LIVE) return this.liveData();
    const S = calmSample();
    SEEDS.forEach((f) => f(S));
    if (this._hub) this.addHubPerson(S, this._hub);
    F.setRoster((S.roster && S.roster.users) || []);
    S.prefsByEmail = {};
    if (S.me && S.me.email) S.prefsByEmail[S.me.email] = S.prefs || { kbDone: {} };
    return S;
  }

  /* live builds start empty; NET fills the documents from the broker (kit/net.js) */
  liveData() {
    const t = liveToday();
    const S = {
      today: t, todayIso: F.iso(t), nowMs: Date.now(),
      me: { email: '', name: '', role: '' }, hubSignedIn: !!this._hub,
      roster: { users: [] }, portfolio: REPAIR.blank('portfolio'), docs: {}, spec: {},
      ganttView: { overrides: {} }, analysis: null, prefs: { kbDone: {} }, version: 1, prefsByEmail: {}
    };
    if (this._hub) this.addHubPerson(S, this._hub);
    F.setRoster(S.roster.users);
    return S;
  }
  /* live: after the broker's roster loads, the Hub person keeps the roster's name and role */
  liveRoster() {
    const D = this.D;
    if (!D.roster || !Array.isArray(D.roster.users)) D.roster = { users: [] };
    if (this._hub) this.addHubPerson(D, this._hub);
    F.setRoster(D.roster.users);
    if (this._hub) this.applyViewer(this._hub.email);
    this.setState({ viewer: this._hub ? this._hub.email : '', sim: Object.assign({}, this.state.sim, { hub: !!this._hub }), rev: (this.state.rev || 0) + 1 });
  }

  /* ------------------------------------------------ who is viewing (the Hub sign-in) */
  /* The Hub's sign-in (localStorage 'hub_session_v1'), read the way the live apps read it: RD.hubSessionEmail
     accepts it only if it parses, carries an email and has not expired. The role is the orgRole the Hub
     stored with it. Null when there is none: the canvas, a file opened locally, a Confluence embed where
     the Hub's storage is not visible. The expiry is real time, so this uses the clock, not the sample's today. */
  hubSession() {
    let raw = null;
    try { raw = window.localStorage ? window.localStorage.getItem('hub_session_v1') : null; } catch (e) { return null; }
    if (!raw || typeof RD.hubSessionEmail !== 'function') return null;
    const email = RD.hubSessionEmail(raw, Date.now());
    if (!email) return null;
    let s = null;
    try { s = JSON.parse(raw); } catch (e) { s = null; }
    return { email: email, orgRole: s && typeof s.orgRole === 'string' ? s.orgRole.trim().toLowerCase() : '' };
  }
  /* the signed-in Hub person joins the sample roster (or updates their entry), with the role the Hub gave them */
  addHubPerson(S, hub) {
    if (!S.roster) S.roster = { users: [] };
    if (!Array.isArray(S.roster.users)) S.roster.users = [];
    const known = S.roster.users.find((u) => String(u.email).toLowerCase() === hub.email);
    if (known) {
      known.disabled = false;
      if (!LIVE || !known.orgRole) known.orgRole = hub.orgRole;   // live: the broker's roster is the authority on roles
      known.hub = true;
      return;
    }
    const local = hub.email.split('@')[0];
    const words = local.split(/[._-]+/).filter(Boolean);
    const name = words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : hub.email;
    S.roster.users.push({ email: hub.email, disabled: false, name: name, orgRole: hub.orgRole, leadDivisions: [], hub: true });
  }
  storedViewer() {
    const dflt = { email: (this.D.me && this.D.me.email) || '', signedIn: true };
    try {
      const raw = window.localStorage && window.localStorage.getItem('calm_viewer');
      if (!raw) return dflt;
      const v = JSON.parse(raw);
      const u = v && F.person(v.email);
      if (!u || u.disabled) return dflt;
      return { email: u.email, signedIn: v.signedIn !== false };
    } catch (e) { return dflt; }
  }
  /* make the data's "me" (sidebar, posted-by, prefs) the given roster person */
  applyViewer(email) {
    const u = F.person(email);
    if (!u) return;
    const D = this.D;
    D.me = { email: u.email, name: F.first(u.email), role: F.roleLabel(u.orgRole) };
    if (!D.prefsByEmail) D.prefsByEmail = {};
    if (!D.prefsByEmail[u.email]) D.prefsByEmail[u.email] = { kbDone: {} };
    D.prefs = D.prefsByEmail[u.email];
  }
  /* sign in as a roster person, or pass '' to sign out (the person is remembered for signing back in) */
  setViewer(email) {
    if (this._hub) return;   // the Hub decides who is signed in; sign in as someone else there
    const signedIn = !!email;
    const target = signedIn ? email : this.state.viewer;
    const u = F.person(target);
    if (signedIn && (!u || u.disabled)) return;
    try { window.localStorage && window.localStorage.setItem('calm_viewer', JSON.stringify({ email: target, signedIn: signedIn })); } catch (e) { /* storage blocked: this board only */ }
    this.applyViewer(target);
    this.setState({ viewer: target, sim: Object.assign({}, this.state.sim, { hub: signedIn }), rev: (this.state.rev || 0) + 1 });
    if (typeof APP_VIEWER_CHANGED === 'function') APP_VIEWER_CHANGED(this);
    this.toast(signedIn ? 'Signed in as ' + F.name(target) + (u && u.orgRole ? ' (' + F.roleLabel(u.orgRole) + ')' : '') + '.' : 'Signed out of the Hub.', 'info');
  }
  /* the signed-in person, or null when signed out */
  viewer() {
    if (!(this.state.sim && this.state.sim.hub)) return null;
    const u = F.person(this.state.viewer);
    return u && !u.disabled ? { email: u.email, name: u.name, orgRole: String(u.orgRole || '').toLowerCase(), role: F.roleLabel(u.orgRole) } : null;
  }
  hasRole(roles) { const v = this.viewer(); return !!v && roles.indexOf(v.orgRole) >= 0; }
  canEditPlan() { return this.hasRole(PLAN_EDITOR_ROLES); }
  /* "Corey Staller and Dana Whitcomb": the people who may change the plan */
  planEditorsText() {
    const names = ((this.D.roster && this.D.roster.users) || [])
      .filter((u) => u.email && !u.disabled && PLAN_EDITOR_ROLES.indexOf(String(u.orgRole || '').toLowerCase()) >= 0)
      .map((u) => u.name || u.email);
    return F.list(names);
  }
  /* the sidebar's person block */
  meVM() {
    const v = this.viewer();
    if (!v) return { name: 'Signed out', role: 'Not signed in to the Hub', initials: '–', signedIn: false };
    return { name: F.first(v.email), role: v.role || 'Signed in', initials: F.initials(v.email), signedIn: true };
  }
  /* the "Signed in as" picker every board's Settings shows (fixed to the Hub person when the Hub signed them in) */
  viewerVM() {
    const S = this.state;
    if (LIVE && !this._hub) {
      return {
        fixed: true, value: '', opts: [{ v: '', label: 'Not signed in to the Hub' }], pick: () => {},
        hint: inEmbed()
          ? 'Inside a Confluence page the browser hides your Hub sign-in. Open the full page to sign in and edit.'
          : 'Sign in to the Hub, then reload this page.'
      };
    }
    if (this._hub) {
      const v = this.viewer();
      return {
        fixed: true,
        value: this._hub.email,
        opts: [{ v: this._hub.email, label: v ? v.name + (v.role ? ', ' + v.role : '') : this._hub.email }],
        pick: () => {},
        hint: 'From your Hub sign-in (' + this._hub.email + '). To see someone else’s view, sign in as them in the Hub.'
      };
    }
    const signedIn = !!(S.sim && S.sim.hub);
    const opts = ((this.D.roster && this.D.roster.users) || []).filter((u) => u.email && !u.disabled)
      .map((u) => ({ v: u.email, label: u.name + (u.orgRole ? ', ' + F.roleLabel(u.orgRole) : '') }));
    opts.push({ v: '', label: 'Signed out' });
    return {
      fixed: false,
      value: signedIn ? S.viewer : '',
      opts: opts,
      pick: (e) => this.setViewer(e && e.target ? e.target.value : e),
      hint: signedIn
        ? 'The prototype stands in for the Hub sign-in. Every board uses the same person.'
        : 'Signed out, or inside a Confluence embed where the Hub sign-in is not visible.'
    };
  }

  componentDidMount() { if (LIVE) NET.boot(this); }
  componentWillUnmount() { this._timers.forEach((t) => clearTimeout(t)); if (LIVE) NET.stop(this); }

  /* ---------------------------------------------------------------- time */
  now() { return this.D.nowMs + Math.max(0, Date.now() - this._t0); }
  today() { return this.D.today; }
  later(fn, ms) { const t = setTimeout(fn, ms); this._timers.push(t); return t; }

  /* --------------------------------------------------------------- state */
  set(patch) { this.setState(patch); }
  bump() { this.setState({ rev: (this.state.rev || 0) + 1 }); }
  /* per-render cache: C.memo('kr.rows', () => expensive()) */
  memo(key, fn) { const m = this._memo || (this._memo = {}); if (!(key in m)) m[key] = fn(); return m[key]; }
  /* another module's view model (computed once per render) */
  vmOf(name) { return this.memo('vm:' + name, () => this.computeVM(name)); }

  /* -------------------------------------------- data changes (simulated save) */
  /* read-only: the preview / link flag, or an app rule about who may edit (APP_LOCKED) */
  isRo() { return !!this.state.ro || this.isLocked(); }
  isLocked() { return typeof APP_LOCKED === 'function' && !!APP_LOCKED(this); }
  guard() {
    if (this.state.ro) { this.toast('Read-only view — editing is disabled.', 'info'); return false; }
    if (LIVE && !(this.net && this.net.loaded)) { this.toast('Nothing is loaded from the broker yet, so nothing can be changed.', 'info'); return false; }
    if (this.isLocked()) { this.toast((typeof APP_LOCK_MESSAGE === 'function' && APP_LOCK_MESSAGE(this)) || 'You can view this, but not change it.', 'info'); return false; }
    return true;
  }
  /* Pulled KPIs read other documents (RD.pulledResult): the engine asks the page for every document it has
     and today. pullSource() hands out one object per version of the data, so what the engine works out is
     kept until the next change (C.mutate and every document NET installs bump D.version). pullHook() makes
     this page the one the engine asks (a test may hold several pages of one board in one process). */
  pullHook() {
    if (typeof RD === 'undefined' || typeof RD.setPullSource !== 'function') return;
    if (!this._pullFn) this._pullFn = () => this.pullSource();
    RD.setPullSource(this._pullFn);
  }
  pullSource() {
    const D = this.D, s = this._pullSrc;
    if (s && s._D === D && s._v === D.version && s._docs === D.docs && s._p === D.portfolio && s.today === D.today) return s;
    const docs = {};
    Object.keys(D.docs || {}).forEach((k) => { const m = /^(?:EXEC|BIZ)-(.+)$/.exec(k); if (m && D.docs[k]) docs[m[1]] = D.docs[k]; });
    this._pullSrc = { portfolio: D.portfolio || {}, docs: docs, today: D.today, todayIso: D.todayIso || F.iso(D.today), _D: D, _v: D.version, _docs: D.docs, _p: D.portfolio };
    return this._pullSrc;
  }
  /* Run fn(D) to change the data. Returns false (and changes nothing) in read-only
     mode or when fn returns false. Pass { quiet:true } to skip the save indicator
     (view-only state that the real app also does not save). */
  mutate(fn, opts) {
    opts = opts || {};
    this.pullHook();
    if (!opts.allowRo && !this.guard()) return false;
    let r;
    try { r = fn(this.D); } catch (e) {
      console.error(e);
      this.toast('That change could not be applied (' + (e && e.message ? e.message : e) + ').', 'err');
      return false;
    }
    if (r === false) return false;
    this.D.version = (this.D.version || 0) + 1;
    if (opts.quiet) this.bump(); else this.markDirty(opts.msg);
    return true;
  }
  /* today's autosave: write 700 ms after the last change, but never later than 2.5 s after the first unsaved one */
  markDirty(msg) {
    if (LIVE) {
      this.setState({ rev: (this.state.rev || 0) + 1 });
      NET.changed(this);
      if (msg) this.toast(msg, 'ok');
      return;
    }
    const seq = (this._saveSeq = (this._saveSeq || 0) + 1);
    const patch = { rev: (this.state.rev || 0) + 1 };
    const now = this.now();
    if (this.state.sim && this.state.sim.offline) patch.save = { state: 'offline', at: now, pending: true };
    else {
      if (!this._dirtySince) this._dirtySince = now;
      const wait = Math.max(0, Math.min(700, 2500 - (now - this._dirtySince)));
      patch.save = { state: 'saving', at: now };
      this.later(() => {
        if (this.state.sim && this.state.sim.offline) return;
        const sv = this.state.save || {};
        if (seq === this._saveSeq || (sv.state === 'saving' && this.now() - this._dirtySince >= 2500)) {
          this._dirtySince = 0;
          this.setState({ save: { state: 'saved', at: this.now() } });
        }
      }, wait);
    }
    this.setState(patch);
    if (msg) this.toast(msg, 'ok');
  }
  /* the "Save" button: flush now */
  saveNow() {
    if (!this.guard()) return;
    if (LIVE) {
      NET.flush(this).then((ok) => {
        const sv = this.state.save || {};
        if (ok && sv.state === 'saved') this.toast('Saved.', 'ok');
        else if (sv.state === 'offline') this.toast('You are offline. Changes stay here and save when the connection returns.', 'info');
      });
      return;
    }
    if (this.state.sim.offline) { this.toast('You are offline. Changes stay here and save when the connection returns.', 'info'); return; }
    this._saveSeq = (this._saveSeq || 0) + 1;
    this._dirtySince = 0;
    this.setState({ save: { state: 'saved', at: this.now() } });
    this.toast('Saved.', 'ok');
  }
  resetData() {
    if (LIVE) { NET.reload(this); return; }
    const keep = { viewer: this.state.viewer, hub: !!(this.state.sim && this.state.sim.hub) };
    this.D = this.freshData();
    this.applyViewer(keep.viewer);
    this.setState({ rev: (this.state.rev || 0) + 1, sheets: [], dlg: null, menu: '', save: { state: 'saved', at: this.now() } });
    if (typeof APP_RESET === 'function') APP_RESET(this);
    this.setState({ viewer: keep.viewer, sim: Object.assign({}, this.state.sim, { hub: keep.hub }) });   // restoring data never changes who is signed in
    this.toast('Sample data restored.', 'ok');
  }

  /* -------------------------------------------------------------- toasts */
  toast(text, kind) {
    const id = (this.state.tseq || 0) + 1;
    const list = (this.state.toasts || []).concat([{ id: id, text: String(text), kind: kind || 'ok' }]).slice(-3);
    this.setState({ toasts: list, tseq: id });
    this.later(() => this.setState({ toasts: (this.state.toasts || []).filter((t) => t.id !== id) }), kind === 'err' ? 9000 : 4200);
  }
  dropToast(id) { this.setState({ toasts: (this.state.toasts || []).filter((t) => t.id !== id) }); }
  /* copy text to the clipboard and say so only once it worked: the browser can refuse (no permission, an
     embed without clipboard access), and a refusal arrives later, as a rejected promise */
  copyText(text, okMsg, failMsg) {
    const fail = () => this.toast(failMsg || 'Copy didn’t work here. Select the text and copy it instead.', 'err');
    let p = null;
    try {
      const cb = window.navigator && window.navigator.clipboard;
      p = cb && typeof cb.writeText === 'function' ? cb.writeText(String(text)) : null;
    } catch (e) { p = null; }
    if (p && typeof p.then === 'function') p.then(() => this.toast(okMsg || 'Copied.', 'ok'), fail);
    else fail();
  }

  /* --------------------------------------------------------------- menus */
  isMenu(id) { return this.state.menu === id; }
  toggleMenu(id) { this.setState({ menu: this.state.menu === id ? '' : id }); }
  openMenu(id) { this.setState({ menu: id }); }
  closeMenus() { this.setState({ menu: '' }); }

  /* -------------------------------------------------------------- sheets */
  sheet() { const s = this.state.sheets || []; return s.length ? s[s.length - 1] : null; }
  sheetOf(prefix) { const s = this.sheet(); return s && s.kind.indexOf(prefix + '.') === 0 ? s : null; }
  openSheet(kind, data, draft) { this.setState({ sheets: [{ kind: kind, data: data || {}, d: draft || {}, d0: JSON.stringify(draft || {}), err: '' }], menu: '' }); }
  pushSheet(kind, data, draft) { this.setState({ sheets: (this.state.sheets || []).concat([{ kind: kind, data: data || {}, d: draft || {}, d0: JSON.stringify(draft || {}), err: '' }]), menu: '' }); }
  /* has this sheet's draft changed since it opened? (a module may move the baseline with setSheetData({ d0: JSON.stringify(d) }) after a save) */
  sheetDirty(s) {
    if (!s) return false;
    const base = s.data && typeof s.data.d0 === 'string' ? s.data.d0 : s.d0;
    return typeof base === 'string' && JSON.stringify(s.d || {}) !== base;
  }
  /* close the top sheet, asking first when it has unsaved edits (Escape, back) */
  dismissSheet(e) {
    if (e && e.preventDefault) e.preventDefault();
    const top = this.sheet();
    if (!top) return;
    if (this.sheetDirty(top)) { this.confirm({ title: 'Discard your changes?', body: 'Your edits in this panel are not saved yet.', ok: 'Discard changes', danger: true, onOk: () => this.closeSheet() }); return; }
    this.closeSheet();
  }
  /* close every sheet, asking first when any has unsaved edits (clicking the dimmed page) */
  dismissAll() {
    if ((this.state.sheets || []).some((s) => this.sheetDirty(s))) { this.confirm({ title: 'Discard your changes?', body: 'Your edits in this panel are not saved yet.', ok: 'Discard changes', danger: true, onOk: () => this.closeAllSheets() }); return; }
    this.closeAllSheets();
  }
  closeSheet() { this.setState({ sheets: (this.state.sheets || []).slice(0, -1), menu: '' }); }
  closeAllSheets() { this.setState({ sheets: [], menu: '' }); }
  draft() { const s = this.sheet(); return s ? s.d : {}; }
  /* merge fields into the top sheet's draft */
  setDraft(patch) {
    const s = (this.state.sheets || []).slice();
    if (!s.length) return;
    const top = s[s.length - 1];
    s[s.length - 1] = Object.assign({}, top, { d: Object.assign({}, top.d, patch), err: '' });
    this.setState({ sheets: s });
  }
  /* set one nested field: setDraftPath('steps.2.name', 'Soak test') */
  setDraftPath(path, value) {
    const s = (this.state.sheets || []).slice();
    if (!s.length) return;
    const top = s[s.length - 1];
    s[s.length - 1] = Object.assign({}, top, { d: K.setPath(top.d || {}, path, value), err: '' });
    this.setState({ sheets: s });
  }
  /* replace the top sheet's data payload (rarely needed) */
  setSheetData(patch) {
    const s = (this.state.sheets || []).slice();
    if (!s.length) return;
    const top = s[s.length - 1];
    s[s.length - 1] = Object.assign({}, top, { data: Object.assign({}, top.data, patch) });
    this.setState({ sheets: s });
  }
  sheetErr(msg) {
    const s = (this.state.sheets || []).slice();
    if (!s.length) return;
    s[s.length - 1] = Object.assign({}, s[s.length - 1], { err: msg || '' });
    this.setState({ sheets: s });
  }
  /* onChange handler factories for draft fields */
  bindDraft(field) { return (e) => this.setDraft({ [field]: e && e.target ? e.target.value : e }); }
  bindDraftCheck(field) { return (e) => this.setDraft({ [field]: !!(e && e.target && e.target.checked) }); }
  bindDraftPath(path) { return (e) => this.setDraftPath(path, e && e.target ? e.target.value : e); }

  /* ------------------------------------------------- confirm / ask dialogs */
  /* C.confirm({ title, body, ok:'Delete', danger:true, onOk(){...} }) */
  confirm(o) { this._dlgOk = o.onOk || null; this.setState({ dlg: { kind: 'confirm', title: o.title || 'Are you sure?', body: o.body || '', ok: o.ok || 'Confirm', cancel: o.cancel || 'Cancel', danger: !!o.danger }, menu: '' }); }
  /* C.ask({ title, label, value, placeholder, ok:'Create', onOk(value){ return 'error text' or nothing } }) */
  ask(o) { this._dlgOk = o.onOk || null; this.setState({ dlg: { kind: 'ask', title: o.title || '', body: o.body || '', label: o.label || '', value: o.value || '', placeholder: o.placeholder || '', ok: o.ok || 'Save', cancel: o.cancel || 'Cancel', danger: false, err: '' }, menu: '' }); }
  dlgOk() {
    const d = this.state.dlg;
    if (!d) return;
    const fn = this._dlgOk;
    if (d.kind === 'ask') {
      const r = fn ? fn(d.value) : null;
      if (typeof r === 'string' && r) { this.setState({ dlg: Object.assign({}, d, { err: r }) }); return; }
    }
    this._dlgOk = null;
    this.setState({ dlg: null });
    if (d.kind !== 'ask' && fn) fn();
  }
  dlgCancel() { this._dlgOk = null; this.setState({ dlg: null }); }

  /* ------------------------------------------------------- app hand-off */
  handoff(payload) { try { window.sessionStorage.setItem('celadyne-calm-open', JSON.stringify(payload)); } catch (e) { /* storage blocked */ } }
  takeHandoff(app) {
    try {
      const raw = window.sessionStorage.getItem('celadyne-calm-open');
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || p.app !== app) return null;
      window.sessionStorage.removeItem('celadyne-calm-open');
      return p;
    } catch (e) { return null; }
  }

  /* --------------------------------------------------------------- theme */
  themeNow() {
    const t = this.state.theme;
    if (t === 'dark' || t === 'light') return t;
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }

  /* ------------------------------------------------------- view models */
  computeVM(name) {
    const m = MODS[name];
    if (!m || !m.vm) return {};
    try { return m.vm(this, this.ctx) || {}; } catch (e) {
      console.error('[calm] ' + name + ' view failed', e);
      (this._vmErrors || (this._vmErrors = [])).push(name + ': ' + (e && e.message ? e.message : e));
      return { __err: String(e && e.message ? e.message : e) };
    }
  }
  lazy(name) {
    const C = this;
    return new Proxy({}, {
      get(_, k) {
        if (typeof k === 'symbol' || k === 'toJSON' || k === '$$typeof' || k === 'then') return undefined;
        return C.vmOf(name)[k];
      }
    });
  }
  uiVM() {
    const S = this.state;
    const top = this.sheet();
    const sv = S.save || {};
    const saveText = sv.state === 'saving' ? 'Saving…' : sv.state === 'offline' ? 'Offline, changes kept here' : sv.state === 'conflict' ? 'Reloaded after a conflict' : sv.state === 'error' ? (sv.why || 'Not saved') : 'Saved ' + F.ago(sv.at, this.now());
    const d = S.dlg;
    return {
      anyMenu: !!S.menu,
      closeMenus: () => this.closeMenus(),
      sheetOpen: !!top,
      sheetKind: top ? top.kind : '',
      sheetDepth: (S.sheets || []).length,
      sheetBack: (S.sheets || []).length > 1,
      sheetErr: top ? top.err || '' : '',
      hasSheetErr: !!(top && top.err),
      sheetCls: 'sheet' + (top && ((MODS[top.kind.split('.')[0]] || {}).wide || []).indexOf(top.kind) >= 0 ? ' wide' : ''),
      closeSheet: () => this.closeSheet(),
      closeAllSheets: () => this.closeAllSheets(),
      dismissSheet: (e) => this.dismissSheet(e),
      dismissAll: () => this.dismissAll(),
      sheetKey: (e) => { if (!e || e.key !== 'Escape') return; if (e.defaultPrevented || (typeof e.isDefaultPrevented === 'function' && e.isDefaultPrevented())) return; this.dismissSheet(e); },
      toasts: (S.toasts || []).map((t) => ({ text: t.text, cls: 'toast ' + (t.kind === 'err' ? 'err' : t.kind === 'info' ? 'info' : ''), drop: () => this.dropToast(t.id) })),
      saving: sv.state === 'saving',
      saveText: saveText,
      saveTone: sv.state === 'error' ? 't-bad' : sv.state === 'offline' || sv.state === 'conflict' ? 't-warn' : sv.state === 'saving' ? 't-info' : 't-ok',
      saveNow: () => this.saveNow(),
      dlg: d ? {
        title: d.title, body: d.body, hasBody: !!d.body, ok: d.ok, cancel: d.cancel,
        okCls: d.danger ? 'btn danger solid' : 'btn pri',
        isAsk: d.kind === 'ask', label: d.label, value: d.value, placeholder: d.placeholder, err: d.err || '', hasErr: !!d.err,
        onValue: (e) => this.setState({ dlg: Object.assign({}, this.state.dlg, { value: e.target.value, err: '' }) }),
        onKey: (e) => { if (e.key === 'Enter') { e.preventDefault(); this.dlgOk(); } else if (e.key === 'Escape') this.dlgCancel(); },
        okFn: () => this.dlgOk(), cancelFn: () => this.dlgCancel()
      } : null,
      hasDlg: !!d,
      errors: (this._vmErrors || []).slice(),
      hasErrors: !!(this._vmErrors && this._vmErrors.length)
    };
  }

  renderVals() {
    if (LIVE) { const t = liveToday(); if (t !== this.D.today) { this.D.today = t; this.D.todayIso = F.iso(t); } }
    this.pullHook();
    this._memo = {};
    this._vmErrors = [];
    const ctx = APP_CTX(this);
    this.ctx = ctx;
    const vals = { ro: this.isRo(), theme: this.themeNow() };
    MOD_ORDER.forEach((n) => { vals[n] = this.lazy(n); });
    vals.sh = APP_SHELL(this, ctx);
    vals.ui = this.uiVM();
    return vals;
  }
}
