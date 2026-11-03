# Calm prototypes: build contract

Read this whole file before writing code. It is the agreement every module follows so twelve
people can build one product at the same time.

## 1. What we are building

Corey (CTO, Celadyne) is redesigning the R&D suite. Direction "A. Calm workspace" was shown as four
clickable boards on a Design canvas. He asked: **"Let's update the calm mockup to ensure absolutely all
functionality is preserved from today."** So each Calm board must do everything today's app does,
in the Calm design language, against shared sample data:

| App | Today (source of truth) | Calm board | Inventory |
|---|---|---|---|
| Planning | `/home/claude/work/rd-gantt-v2/planning_app.template.html` | `Plan-A.dc.html` | `../inv/plan.md` |
| Execution | `/home/claude/work/rd-gantt-v2/execution_app.template.html` | `Main.dc.html` | `../inv/exec.md` |
| Sales | `/home/claude/work/rd-gantt-v2/sales_app.template.html` | `Sales-A.dc.html` | `../inv/sales.md` |
| Product spec | `/home/claude/work/rd-gantt-v2/product_designer.template.html` | `Spec-A.dc.html` | `../inv/spec.md` |

The inventories (paths relative to this folder) list every feature, message and rule, with line
numbers into the real templates. Each ends with **(a) Feature checklist** and **(b) Data**. The
checklist is your acceptance list. When the inventory is unclear, read the real template at the
cited lines. Never edit anything under `/home/claude/work/rd-gantt-v2/` (read only).

"Preserved" means a person can do the same job and see the same information, with the same rules
and the same numbers. It does not mean copying today's layout, wording or widgets. Calm changes the
presentation (sidebar, tabs, right-hand sheets, dots and words instead of filled pills, plain
sentence-case copy). Where today's app has a bug, dead code or an unwired control that the
inventory flags, build the **intended** behaviour and say so in your coverage file (e.g. tasks are
never drawn today: in Calm they have a tab; milestone steps cannot be edited in Execution today: in
Calm they can). Native `prompt()`/`confirm()` become `C.ask()`/`C.confirm()`.

External systems are simulated against the sample data: the broker (load, autosave, 412 conflicts,
25 s polling), Hub sign-in, the analysis portal index, the roster, the prefs bin, URL parameters,
import/export. Show their states and messages truthfully (see section 7); never make network calls.

## 2. Where things live

```
calm/
  CONTRACT.md            this file
  build.py               python3 build.py <app> --out=out/<you>    (always build into your own folder)
  engine/rdcore.js       the live engine, unchanged. Available as RD.* (read it; don't re-implement it)
  data/sample.js         shared sample data (calmSample()). Read-only for module agents.
  kit/kit.css            tokens + components. Read-only for module agents.
  kit/core.js            Component class, F (format), K (utils). Read-only for module agents.
  apps/<app>/            app.json, shell.html, shell.js, shell.css  (owned by that app's shell agent)
  mods/<mod>/            one folder per module (owned by exactly one agent)
     mod.js              logic: registers MODS.<mod>; may define one public namespace object (e.g. KPI)
     mod.css             module styles (optional)
     seed.js             optional: function seed_<mod>(S) { ...adds sample records to S... }
     slot-<name>.html    template partial inserted at <!--@slot name--> in the shell (in manifest order)
     part-<name>.html    template partial included explicitly with <!--@include mods/<mod>/part-<name>.html X=path-->
     COVERAGE.md         your checklist mapping (required, see section 9)
  test/                  dc.js (driver), fuzz.js (random walk), parse.py; your scenarios: test/sc_<mod>.js
```

**Ownership rule.** Edit only your own folder(s) and your own `test/sc_<mod>.js`. Do not edit `kit/`,
`data/sample.js`, `engine/`, `build.py`, `test/dc.js|fuzz.js|parse.py`, another module or another
app's shell. If you need something from a file you don't own, work around it inside your module and
put the request in your final report. Keep every file you own syntactically valid at all times
(other agents are building the same app right now; a module with a syntax error is stubbed out of
their builds automatically, but a broken template partial breaks everyone).

Builds: `cd calm && python3 build.py exec --out=out/<yourname>` then test `out/<yourname>/Main.dc.html`.

## 3. The DC board format (what breaks the runtime)

A board is one `.dc.html`: a static template inside `<x-dc>` plus one logic class. build.py assembles
it. The runtime compiles the template once and re-renders it with the object `renderVals()` returns.

- **Holes**: `{{path.to.value}}` in text or attributes. Expressions allowed: paths (`a.b.c`,
  `a[b]`, `a.0`), `!x`, `x === y`, `x !== y`, `==`, `!=`, literals (`'text'`, `3`, `true`,
  `null`). Nothing else: no `&&`, `||`, `?:`, calls, arithmetic. Precompute in the view model.
- Text hole values: string/number render; `null`, `undefined`, booleans render nothing. Never put
  objects or functions in text. A path that resolves to `undefined` renders empty and is reported
  by the tests as unresolved; use `''` or `null` deliberately.
- **Attributes**: a whole-hole attribute passes the raw value (`disabled="{{x.off}}"` with a boolean,
  `aria-expanded="{{x.open}}"`, `checked="{{x.on}}"`). Mixed attributes interpolate strings
  (`class="btn {{x.cls}}"`). `style="{{x.style}}"` takes a CSS string. Use `class=`, never className.
- **Events**: `onClick="{{x.fn}}"`, `onChange`, `onInput`, `onKeyDown`, `onSubmit`, `onBlur`,
  `onFocus`, `onDoubleClick`, `onPointerDown/Move/Up/Cancel`, `onDragStart/Over/Enter/Leave/Drop/End`,
  `onMouseEnter/Leave`, `onContextMenu`. The value must be one whole hole that resolves to a function
  (a closure your view model builds, e.g. `pick: () => C.setState({...})`). Handlers receive a React
  event (`e.target.value`, `e.target.checked`, `e.key`, `e.preventDefault()`, `e.clientX`,
  `e.currentTarget.getBoundingClientRect()`, `e.dataTransfer`).
- **Lists**: `<sc-for list="{{x.rows}}" as="r" hint-placeholder-count="3"> ... {{r.name}} ... </sc-for>`.
  The list must be an array (of objects, no nulls). Keys are the index, so always bind inputs
  (`value="{{r.v}}"` + `onChange`) — never rely on uncontrolled inputs inside lists.
  `as` names are scoped; inner loops may reuse names only if you don't need the outer item.
- **Conditions**: `<sc-if value="{{x.open}}" hint-placeholder-val="{{false}}"> ... </sc-if>` renders
  children only when truthy (children are not evaluated otherwise). No else: use a second sc-if with
  `{{!x.open}}`. Both hint attributes are required.
- **No** script-built UI (no innerHTML, no document.createElement, no React elements in holes), no
  global key or click listeners (no `window.addEventListener`), no window globals, no `<p>` (use
  `<div>`), no `<button>`/`<a>` inside another `<button>`/`<a>`, no inputs inside buttons, no nested
  `<form>`, no self-closing HTML tags (`<div/>`; SVG `<path .../>` is fine). Tables need
  `<thead>`/`<tbody>`; never put `<tr>` straight under `<table>`.
- **Selects**: `<select class="sel" value="{{x.v}}" onChange="{{x.on}}"><sc-for list="{{x.opts}}" as="o" hint-placeholder-count="3"><option value="{{o.v}}" label="{{o.label}}"></option></sc-for></select>`.
  Never put a hole inside `<option>` text (it breaks); use the `label` attribute. Static options with
  plain text are fine.
- `autoFocus=""` (exactly this spelling) focuses an input when it mounts; use it in sheets and inline editors. A bare `autofocus` does nothing.
- Keyboard: handle Enter / Escape with `onKeyDown` on the input or element that has focus.
- Links between boards: `<a href="Main.dc.html">`. To open the target at a specific thing, call
  `C.handoff({ app: 'exec', objective: 'OBJ-…' })` in the link's `onClick` (the target app reads it
  once at load with `C.takeHandoff`).
- Drag and drop: HTML5 DnD (`draggable="true"`, `onDragStart` storing the id on the component, e.g.
  `C._drag = {...}`, `onDragOver` calling `e.preventDefault()`, `onDrop`). Pointer-drag (Gantt bars)
  uses pointer events + `e.currentTarget.setPointerCapture(e.pointerId)`.

## 4. The runtime (kit/core.js)

```js
MODS.kr = {
  state: { kr_open: {}, kr_form: null },   // initial UI state; EVERY key starts with your module name + '_'
  wide: ['kr.bulk'],                         // optional: sheet kinds that use the wide sheet
  vm(C, ctx) { return { rows: [...], sheet: ... } },   // view model for your template partials
  search(C, ctx, q) { return [{ label, sub, go }] }     // optional: header search results
};
```

- `vm(C, ctx)` is called lazily — only when the template reads `{{kr.something}}` — at most once per
  render. It must be **pure**: no `setState`, no data writes. Build closures for handlers inside it.
  If it throws, your region renders empty and the tests report it; don't let it throw.
- Templates read your view model under your module name: `{{kr.rows}}`. Other top-level names:
  `sh` (shell view model), `ui` (core UI: sheets, toasts, dialogs, save), `ro` (read-only on),
  `theme`. Another module's VM: `{{kpi.something}}` in templates or `C.vmOf('kpi')` in code.
- `ctx` is the app context built by the shell each render (`APP_CTX` in `apps/<app>/shell.js`; the
  fields are documented at the top of that file). Treat it as read-only.
- `C` is the component. Use:
  - `C.D` — the data (mutable; see section 5). `C.state` — UI state. `C.setState(patch)` (sync merge).
  - `C.mutate(fn, { msg })` — the ONLY way to change data. Runs `fn(C.D)`; returns false and shows
    "Read-only view — editing is disabled." in read-only; shows the simulated save ("Saving…" then
    "Saved just now"); `msg` becomes a toast. Return `false` from fn to abort. For changes the real
    app makes without saving (view toggles that are explicitly "still allowed in read-only"), use
    `C.mutate(fn, { quiet: true, allowRo: true })` or plain UI state.
  - `C.toast(text, 'ok' | 'info' | 'err')` — the real app's message bar becomes toasts.
  - Sheets (right-hand editors replacing today's modals): `C.openSheet(kind, data, draft)`,
    `C.pushSheet(...)` (stack on top, e.g. a KPI target from inside a KR editor), `C.closeSheet()`,
    `C.closeAllSheets()`, `C.sheet()`, `C.sheetOf('kr')` (top sheet if its kind starts with `kr.`),
    `C.draft()`, `C.setDraft(patch)`, `C.setDraftPath('steps.2.name', v)`, `C.bindDraft('field')`,
    `C.bindDraftCheck('field')`, `C.bindDraftPath('a.b')`, `C.sheetErr('message')`, `C.setSheetData(p)`.
    Kinds are `<mod>.<name>`. Your `slot-sheets.html` renders `<sc-if value="{{kr.sheet}}">` with the
    standard chrome (`.sh-head` / `.sh-body` / `.sh-foot`, close button `{{ui.closeSheet}}`; show a
    back button when `{{ui.sheetBack}}`).
  - Menus and popovers: `C.toggleMenu(id)`, `C.isMenu(id)`, `C.closeMenus()`. Only one is open; a
    transparent scrim closes it. Wrap the trigger and the menu in `<div class="above">` (or `.anchor`
    + `.above`) and position the `.menu`/`.pop` absolutely.
  - Dialogs: `C.confirm({ title, body, ok, danger, onOk })`, `C.ask({ title, label, value, ok, onOk(v) })`
    (onOk returns an error string to keep the dialog open).
  - `C.memo(key, fn)` per-render cache: put everything the value depends on in the key. My Projects builds
    one ctx per objective in the same render (with `ctx.docKey` and `ctx.objId`), so a cache of one
    document's or one objective's rows is keyed by them (`'review.items:' + ctx.docKey + ':' + ctx.objId`).
  - `C.now()` simulated clock (ms); `C.today()` day number;
    `C.later(fn, ms)` timers; `C.isRo()`; `C.guard()` (toast + false in read-only);
    `C.handoff(p)` / `C.takeHandoff(app)`.
- `F` formatting: `F.day(d)` "Oct 13", `F.dayY(d)` "Oct 13, 2026", `F.iso(d)`, `F.fromIso(s)`,
  `F.rel(d, today)` "in 3 days", `F.q('2026Q4')` "Q4 2026", `F.qRange(q)`, `F.n(v)`, `F.u(v, unit)`
  "1.84 V", `F.score(s)` "73"/"—", `F.pct`, `F.plural(n,'gate')`, `F.list([...])`, `F.ago(ms, now)`,
  `F.stamp(ms)`, `F.name(email)`, `F.first(email)`, `F.initials(email)`, `F.people(emails)`,
  `F.band(score)` → 'ok'|'warn'|'bad'|'none' (engine thresholds), `F.bandWord(tone)`, `F.tone(t)` → 't-ok'.
- `K` utils: `K.clone`, `K.byOrder`, `K.uniq`, `K.sum`, `K.mean`, `K.clamp`, `K.idx`, `K.move`,
  `K.num(text)` (strict number parse, null when not a number), `K.setPath`, `K.getPath`.
- `APP` is `'exec' | 'sales' | 'plan' | 'spec'`. Execution and Sales are built from the same modules;
  branch on `APP === 'sales'` in JS and `<!--@if sales-->…<!--@else-->…<!--@endif-->` in templates
  where the apps really differ (sales.md §22 lists the differences).

## 5. Data

`data/sample.js` builds one dataset in the **real document shapes** (portfolio, `EXEC-<div>` /
`BIZ-<div>` exec docs in `C.D.docs`, `SPEC-<div>` in `C.D.spec`, `C.D.analysis`, `C.D.prefs`,
`C.D.roster`, `C.D.ganttView`). Dates are integer day numbers since 2020-01-01 UTC (today = 2477 =
2026-10-13); timestamps are ms; kanban tiles use ISO strings like the real apps. All four boards
start from the same data, so the story agrees across apps.

- Compute with the engine exactly like the real app does (same RD calls, same arguments, same doc
  maps — e.g. Execution passes `ctx.em = RD.withPortfolio(P, { [divId]: doc })`). Copy the real app's
  logic for anything the engine doesn't do (find it at the inventory's line numbers). Same rules,
  same rounding, same messages.
- Write data only through `C.mutate`. Mutate the real document fields the real app writes (so other
  modules and the engine see the change). Allocate IDs with `RD.allocId` the way the real app does.
- Need more sample records for your feature (boards, risks, logic trees, analysis runs, plan
  versions…)? Add them in `mods/<mod>/seed.js` → `function seed_<mod>(S) {...}` which receives the
  sample after `calmSample()` and may add to or adjust it. Keep seeds realistic and consistent with
  the story below; don't delete other modules' records.
- The story (keep it coherent): Electrolyzer is qualifying a 10-cell Tera short stack (Toru Hayashi
  owns it; Priya Natarajan co-owns component lock); Fuel Cell is scaling HP membrane roll-to-roll
  production (Erin Walsh) and chasing low-humidity durability (Maya Okafor); Business Development is
  landing utility pilots (Sam Rivera). The person using the prototype is Corey Staller, CTO.

## 6. Calm design language

Use `kit/kit.css` classes and its CSS variables; module CSS must use `var(--…)` tokens only (dark
mode must keep working) and prefix its classes with the module name (`.kr-row`, `.kb-tile`).

- **Frame**: left sidebar (app switcher, context pickers, list), a quiet top bar (breadcrumb, search,
  save state, settings), page content in `.panel` cards on the `--bg` page. Tabs (`.tabs/.tab`) split
  today's long page into sections.
- **Editing**: today's modals become right-hand sheets (`.sheet`); quick single-value edits are
  inline (click the value, type, Enter saves, Escape cancels); destructive actions confirm with
  `C.confirm` and say what will be lost (counts). Row actions sit in a "…" menu (`.menu/.mi`) or as
  quiet buttons that appear on the row.
- **Status**: a dot and a word (`<span class="st t-warn"><span class="dot"></span>At risk</span>`),
  not filled pills. Scores are plain numbers. Bands: `F.band`. Pace bars: `.track/.fill` with a
  `.tick` for time elapsed; partial check-ins use `.hatch`.
- **Typography**: Instrument Sans (already loaded). Sentence case everywhere. No ALL-CAPS labels,
  no decorative eyebrows, no emoji in UI (today's ▣ ◆ ● ⌂ ↻ glyphs become words or SVG icons).
  Avoid "A · B · C" meta strings; use separate muted spans or commas.
- **Copy**: plain verbs that say what happens ("Add key result", "Save target", "Delete gate").
  A button's verb matches its toast ("Delete gate" → "Gate deleted."). Errors say what's wrong and
  how to fix it ("Use a number, like 1.85."). Empty states invite the next action. Keep today's
  domain terms (Key result, KPI, Stage-gate, Workstream, FMEA, RPN, Logic tree, Key read). Keep the
  real app's message text where it is already plain; rewrite the cryptic ones.
- **Icons**: inline SVG, 24-unit viewBox, `stroke="currentColor"`, stroke-width 1.8–2, round caps,
  `aria-hidden="true"`, 16–18 px. Icon-only buttons need `aria-label` and `title`.
  plus `<path d="M12 5v14M5 12h14"></path>`, close `<path d="M6 6l12 12M18 6L6 18"></path>`,
  more `<circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle>` (fill="currentColor", stroke none),
  chevron-down `<path d="M6 9l6 6 6-6"></path>`, chevron-right `<path d="M9 6l6 6-6 6"></path>`,
  check `<path d="M5 12.5l4.5 4.5L19 7"></path>`, edit `<path d="M4 20h4L19 9l-4-4L4 16z"></path>`,
  trash `<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path>`,
  link `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>`,
  drag `<circle cx="9" cy="6" r="1.4"></circle><circle cx="15" cy="6" r="1.4"></circle><circle cx="9" cy="12" r="1.4"></circle><circle cx="15" cy="12" r="1.4"></circle><circle cx="9" cy="18" r="1.4"></circle><circle cx="15" cy="18" r="1.4"></circle>` (fill),
  warning `<path d="M12 4l9 16H3z"></path><path d="M12 10v4M12 17v.5"></path>`,
  calendar `<rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M4 10h16M9 3v4M15 3v4"></path>`.
- **Accessibility**: real buttons for actions, `aria-label` on icon buttons, `aria-pressed` on
  toggles, `aria-expanded` on menu triggers, labels on every input (wrap in `<label class="fld">`),
  visible focus (kit does it). Colour is never the only signal (dot + word).
- Density: this is a working tool for engineers. Comfortable but not airy: 13.5–14 px body, 12.5 px
  secondary, rows 36–44 px.

## 7. Simulated systems (be truthful)

- Saving: every `C.mutate` shows the save cycle. The Settings sheet (shell) offers simulations:
  go offline, a teammate's edit arriving (the polling message), a 412 conflict, Hub sign-in on/off,
  read-only preview, URL-parameter links. Modules don't simulate the broker themselves; they react
  to state the shell exposes when relevant (e.g. kanban Done-column prefs follow the person only when
  `C.state.sim.hub` is true; otherwise "kept in this browser").
- The analysis portal (Connect data) reads `C.D.analysis` (schema 2 runs) — the KPI module seeds it.
- Roster: `C.D.roster.users` (disabled users excluded from pickers, as today).
- Exports (JSON export, print, copy link): produce the real content and show it in a sheet with a
  copy button, or toast what would be downloaded. Imports: a sheet with a textarea that accepts the
  same JSON and applies the same validation.

## 8. Testing (required)

1. `python3 build.py <app> --out=out/<you>` must build without warnings about your files.
2. `node test/fuzz.js out/<you>/<File>.dc.html 4000` must report **no problems** in your files (the
   report maps lines to source files: `line 812 (mods/kr/slot-krs.html:40)`), and every handler site
   in your partials must be reached (open things in your scenario first if the walk can't reach them).
3. Write `test/sc_<mod>.js` with the driver (`test/dc.js`): click and type like a person, then
   assert the visible result AND the data (`s.c.D…`) AND the numbers against the engine. Cover every
   checklist item you implemented, read-only behaviour, and Sales differences. Run it for every app
   your module is built into. It must pass.

```js
const { Sim, done } = require('./dc');
const s = new Sim(process.argv[2] || 'out/kr/Main.dc.html');
s.click('Key results');                       // exact visible text / aria-label / title / label
s.click('Add key result');
s.type('Statement', 'Hold 2 A/cm² for 100 h'); // inputs by label, aria-label or placeholder
s.click('Save key result');
s.expect('Hold 2 A/cm² for 100 h');           // anywhere on screen
s.eq('KR count', s.c.D.docs['EXEC-DIV-EL'].keyResults.length, 6);
s.click('~Add', { within: 'KR-EL-2026Q4-01-1' });  // ~ = substring; within = ancestor aria-label/title/data-k/id
s.clean('after adding a KR');                  // no undefined/NaN/objects on screen, no view errors
done();
```
Other driver calls: `s.check(label, true)`, `s.key(q, 'Enter')`, `s.drag(fromQ, toQ)`,
`s.flush()` (runs timers, e.g. the save cycle), `s.has(q)`, `s.all(q)`, `s.vals` (the view model),
`s.text` (all visible text), `s.step(label, fn)` (catches and reports an exception).
Put `data-k="..."` on containers when you need a stable `within` anchor.

## 9. Coverage file and report

`mods/<mod>/COVERAGE.md`: one line per checklist item from your inventory section(s) (Execution, and
Sales where it differs): `- [x] <item> — <where/how in Calm>` or `- [~] … — changed: <why>` or
`- [ ] … — not done: <why>`. Fixed bugs get `— fixed: <what was wrong>`. This file is how Corey's
parity review works, so be exact and honest.

Final report (your last message): what you built (files), checklist counts (done / changed / not
done), test results (scenario pass count, fuzz summary), anything you need from the kit/shell/another
module, and known gaps. No narration of your process.
