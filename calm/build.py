#!/usr/bin/env python3
"""Build the calm prototypes into single-file Design-canvas boards (.dc.html).

    python3 build.py                 # build every app into out/
    python3 build.py exec sales      # build some apps
    python3 build.py --publish       # also copy the outputs into ../modern-canvas/project/
    python3 build.py exec --out=out/kr   # build into your own folder (agents: always do this)
    python3 build.py --flag=deploy --out=out/deploy   # extra build-time flag (standalone.py does this)

Each app has apps/<app>/app.json:
    { "app": "exec", "out": "Main.dc.html", "title": "...", "preview": {"width":1440,"height":1100},
      "shell": "apps/exec/shell.html", "css": ["apps/exec/shell.css"], "js": ["apps/exec/shell.js"],
      "mods": ["kr", "kpi", ...], "flags": ["exec"] }

Template directives (HTML comments, processed recursively):
    <!--@slot NAME-->                    every module's  mods/<m>/slot-NAME.html, in manifest order
    <!--@include mods/kpi/part-table.html KT=k.kt-->   include a file; $KT inside it becomes k.kt
    <!--@if sales--> ... <!--@else--> ... <!--@endif-->   build-time flags (app name + "flags"); "!x" negates
Module files (all optional): mods/<m>/mod.js, mod.css, seed.js (defines function seed_<m>(S)), slot-*.html, part-*.html
"""
import hashlib, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
# the engine: the repo's own rdcore.js when calm/ sits inside rd-gantt-v2, else this folder's copy.
# test/engine_path.js makes the same choice, so the suites check numbers against the engine the boards carry.
ENGINE = '../rdcore.js' if os.path.exists(os.path.join(ROOT, '..', 'rdcore.js')) else 'engine/rdcore.js'
RDCORE_START = '/* ==RDCORE_START=='   # build_rdcore.py finds the inlined engine between these two markers
RDCORE_END = '/* ==RDCORE_END== */'
OUT = os.path.join(ROOT, 'out')
PUBLISH = os.path.normpath(os.path.join(ROOT, '..', 'modern-canvas', 'project'))
FONTS = '<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&amp;display=swap" rel="stylesheet">'


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def exists(rel):
    return os.path.exists(os.path.join(ROOT, rel))


class BuildError(Exception):
    pass


def apply_ifs(src, flags, where):
    """Resolve <!--@if x-->...<!--@else-->...<!--@endif--> blocks (nestable)."""
    tok = re.compile(r'<!--@(if\s+!?[\w-]+|else|endif)\s*-->')
    out, stack, pos = [], [], 0
    active = lambda: all(s['on'] for s in stack)
    for m in tok.finditer(src):
        if active():
            out.append(src[pos:m.start()])
        else:
            out.append('\n' * src.count('\n', pos, m.start()))   # keep line numbers stable for test reports
        pos = m.end()
        t = m.group(1)
        if t.startswith('if'):
            name = t[2:].strip()
            neg = name.startswith('!')
            name = name.lstrip('!')
            cond = (name in flags) != neg
            stack.append({'cond': cond, 'on': cond})
        elif t == 'else':
            if not stack:
                raise BuildError(f'{where}: <!--@else--> without <!--@if-->')
            stack[-1]['on'] = not stack[-1]['cond']
        else:
            if not stack:
                raise BuildError(f'{where}: <!--@endif--> without <!--@if-->')
            stack.pop()
    if stack:
        raise BuildError(f'{where}: unclosed <!--@if-->')
    out.append(src[pos:])
    return ''.join(out)


def expand(src, ctx, where, depth=0):
    if depth > 12:
        raise BuildError(f'{where}: include depth exceeded')
    src = apply_ifs(src, ctx['flags'], where)

    def slot(m):
        name = m.group(1)
        parts = []
        for mod in ctx['mods']:
            rel = f'mods/{mod}/slot-{name}.html'
            if exists(rel):
                body = expand(read(rel), ctx, rel, depth + 1)
                parts.append(f'<!--src:{rel}-->\n{body}\n<!--/src-->')
        ctx['slots_used'].add(name)
        return '\n'.join(parts)

    def include(m):
        args = m.group(1).split()
        rel = args[0]
        if not exists(rel):
            raise BuildError(f'{where}: include not found: {rel}')
        body = read(rel)
        for a in args[1:]:
            if '=' not in a:
                raise BuildError(f'{where}: bad include argument {a!r} (use KEY=value)')
            k, v = a.split('=', 1)
            body = re.sub(r'\$' + re.escape(k) + r'\b', v, body)
        return f'<!--src:{rel}-->\n' + expand(body, ctx, rel, depth + 1) + '\n<!--/src-->'

    src = re.sub(r'<!--@slot\s+([\w-]+)\s*-->', slot, src)
    src = re.sub(r'<!--@include\s+([^>]+?)\s*-->', include, src)
    return src


SEED_ORDER = ['kpi', 'kr', 'gates', 'kb', 'fmea', 'step', 'etb', 'tasks', 'initm', 'pov', 'pst', 'ped', 'pgt', 'pms', 'sspec', 'scomp', 'ssub']


def all_seed_files():
    """Every board runs EVERY seed, in one fixed order, so all four apps tell the same story:
    data/seed_*.js, then each module's seed.js (SEED_ORDER, then any other module alphabetically),
    then each app's apps/<app>/seed_*.js. Seeds must be self-contained (no module code)."""
    out = [f'data/{f}' for f in sorted(os.listdir(os.path.join(ROOT, 'data'))) if f.startswith('seed_') and f.endswith('.js')]
    mods = [m for m in SEED_ORDER] + sorted(m for m in os.listdir(os.path.join(ROOT, 'mods')) if m not in SEED_ORDER)
    out += [f'mods/{m}/seed.js' for m in mods if exists(f'mods/{m}/seed.js')]
    for app in sorted(os.listdir(os.path.join(ROOT, 'apps'))):
        d = os.path.join(ROOT, 'apps', app)
        if os.path.isdir(d):
            out += [f'apps/{app}/{f}' for f in sorted(os.listdir(d)) if f.startswith('seed_') and f.endswith('.js')]
    return out


def syntax_error(rel):
    """node --check one module file (wrapped so top-level const/let are legal); returns the first error line or ''."""
    import subprocess, tempfile
    src = read(rel)
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
        f.write('(function(){\n' + src + '\n})();\n')
        tmp = f.name
    try:
        r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
        if r.returncode == 0:
            return ''
        msg = (r.stderr or r.stdout).strip().splitlines()
        loc = next((l for l in msg if tmp in l), '')
        m = re.search(r':(\d+)', loc)
        line = int(m.group(1)) - 1 if m else '?'
        err = next((l for l in msg if 'Error' in l), msg[-1] if msg else 'syntax error')
        return f'{rel}:{line}: {err}'
    finally:
        os.unlink(tmp)


def check_js(name, js):
    if re.search(r'</script', js, re.I):
        raise BuildError(f'{name}: contains "</script" (write it as "<\\/script")')
    if '<!--' in js:
        raise BuildError(f'{name}: contains "<!--", which breaks the inline script')


def build(app, publish=False):
    man = json.loads(read(f'apps/{app}/app.json'))
    flags = set([man['app']] + man.get('flags', []) + EXTRA_FLAGS)
    mods = man.get('mods', [])
    for m in mods:
        if not os.path.isdir(os.path.join(ROOT, 'mods', m)):
            raise BuildError(f'{app}: module folder mods/{m} is missing')
    ctx = {'flags': flags, 'mods': mods, 'slots_used': set()}

    # ---- template
    tpl = expand(read(man['shell']), ctx, man['shell'])
    left = re.findall(r'<!--@[^>]*-->', tpl)
    if left:
        raise BuildError(f'{app}: unprocessed directives: {left[:3]}')
    stray = sorted(set(re.findall(r'\$[A-Z][A-Z0-9_]+\b', tpl)))
    if stray:
        raise BuildError(f'{app}: unreplaced include parameters: {stray}')
    for mod in mods:
        d = os.path.join(ROOT, 'mods', mod)
        for fn in os.listdir(d):
            mm = re.match(r'slot-([\w-]+)\.html$', fn)
            if mm and mm.group(1) not in ctx['slots_used']:
                print(f'  note: mods/{mod}/{fn} has no <!--@slot {mm.group(1)}--> in the {app} shell (not included)')

    # ---- css
    css = [read('kit/kit.css')]
    for rel in man.get('css', []):
        css.append(f'/* ---- {rel} */\n' + apply_ifs(read(rel), flags, rel))
    for mod in mods:
        rel = f'mods/{mod}/mod.css'
        if exists(rel):
            css.append(f'/* ---- {rel} */\n' + apply_ifs(read(rel), flags, rel))
    css = '\n'.join(css)
    if '</style' in css.lower():
        raise BuildError(f'{app}: CSS contains </style')

    # ---- js
    seeds_src, seed_names = [], []
    seed_files = all_seed_files()
    for rel in seed_files:
        s = read(rel)
        names = re.findall(r'^function\s+(seed_\w+)\s*\(', s, re.M)
        if not names:
            raise BuildError(f'{rel}: must define a top-level function seed_<name>(S)')
        seed_names += names
        seeds_src.append(f'/* ---- {rel} */\n{s}')
    if len(set(seed_names)) != len(seed_names):
        raise BuildError(f'{app}: duplicate seed function names {seed_names}')

    mod_js = []
    for mod in mods:
        rel = f'mods/{mod}/mod.js'
        if exists(rel):
            bad = syntax_error(rel)
            if bad:
                print(f'  WARNING: {rel} has a syntax error, so this build stubs module "{mod}" out:\n    {bad}')
                mod_js.append(f'/* ================= module: {mod} ({rel}) STUBBED: syntax error */\nMODS.{mod} = {{ state: {{}}, vm() {{ return {{}}; }} }};')
                continue
            mod_js.append(f'/* ================= module: {mod} ({rel}) */\n' + read(rel))
    app_js = [f'/* ================= app: {rel} */\n' + read(rel) for rel in man.get('js', [])]

    engine = read(ENGINE).strip()
    digest = hashlib.sha256(engine.encode('utf-8')).hexdigest()[:16]
    if RDCORE_START in engine or RDCORE_END in engine:
        raise BuildError(f'{ENGINE} contains the RDCORE markers itself')
    live = 'live' in flags
    if live:   # live builds carry no sample data: NET loads the documents from the broker
        sample_parts = ['function calmSample() { throw new Error(\'a live build has no sample data\'); }', 'const SEEDS = [];']
    else:
        sample_parts = ['/* ================= data/sample.js */\n' + read('data/sample.js'), *seeds_src,
                        'const SEEDS = [' + ', '.join(seed_names) + '];']
    parts = [
        f"const APP = {json.dumps(man['app'])};",
        f"const LIVE = {'true' if live else 'false'};",
        '/* ================= engine: the live apps\' rdcore.js, unchanged */',
        'const RD = (function () { var module = { exports: {} };\n'
        f'{RDCORE_START} sha256:{digest} — rdcore.js, inlined by calm/build.py; edit rdcore.js instead */\n'
        f'{engine}\n{RDCORE_END}\n; return module.exports; }})();',
        *sample_parts,
        '/* ================= kit/core.js */\n' + read('kit/core.js'),
        '/* ================= kit/merge.js */\n' + read('kit/merge.js'),
        '/* ================= kit/repair.js */\n' + read('kit/repair.js'),
        '/* ================= kit/net.js */\n' + read('kit/net.js'),
        *mod_js,
        *app_js,
        'const MOD_ORDER = ' + json.dumps(mods) + ';',
    ]
    js = '\n'.join(parts)
    check_js(app, js)

    preview = json.dumps({'$preview': man.get('preview', {'width': 1440, 'height': 1100})})
    if "'" in preview:
        raise BuildError('preview JSON must not contain single quotes')
    html = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        f'<title>{man["title"]}</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n'
        f'<helmet>\n{FONTS}\n<style>\n{css}\n</style>\n</helmet>\n'
        f'{tpl.strip()}\n</x-dc>\n'
        f"<script type=\"text/x-dc\" data-dc-script data-props='{preview}'>\n{js}\n</script>\n</body>\n</html>\n"
    )
    out_dir = OUT_DIR or OUT
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, man['out'])
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    kb = len(html.encode('utf-8')) / 1024
    print(f'built {man["out"]:<18} {kb:8.1f} KB  (template {len(tpl)/1024:.0f} KB, js {len(js)/1024:.0f} KB, css {len(css)/1024:.0f} KB)')
    if publish:
        shutil.copyfile(out, os.path.join(PUBLISH, man['out']))
        print(f'  copied to {os.path.join(PUBLISH, man["out"])}')
    return out


OUT_DIR = None
EXTRA_FLAGS = []   # --flag=NAME (repeatable): extra build-time flags, e.g. "deploy" for the standalone copies


def main():
    global OUT_DIR
    for a in sys.argv[1:]:
        if a.startswith('--out='):
            OUT_DIR = os.path.join(ROOT, a.split('=', 1)[1]) if not os.path.isabs(a.split('=', 1)[1]) else a.split('=', 1)[1]
        elif a.startswith('--flag='):
            EXTRA_FLAGS.append(a.split('=', 1)[1])
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    publish = '--publish' in sys.argv
    apps = args or sorted(d for d in os.listdir(os.path.join(ROOT, 'apps')) if exists(f'apps/{d}/app.json'))
    ok = True
    for a in apps:
        try:
            build(a, publish)
        except BuildError as e:
            ok = False
            print(f'BUILD FAILED ({a}): {e}')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
