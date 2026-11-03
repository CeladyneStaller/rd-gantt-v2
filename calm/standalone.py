#!/usr/bin/env python3
"""Package the five calm boards as standalone pages that run outside the design canvas.

    python3 standalone.py                 # prototype: build with --flag=deploy, write deploy/calm-*.html
    python3 standalone.py --no-build      # package whatever is already in out/deploy
    python3 standalone.py --live [--out=DIR]
                                          # the apps themselves: build with --flag=live (broker data, the
                                          # Hub sign-in, the suite's own browser keys) and write
                                          # planning_app.html, execution_app.html, sales_app.html,
                                          # product_designer.html and my_projects.html into DIR (default: live/)

Each page is one self-contained file: React 18.3.1 (the same builds the canvas loads, checked against the
canvas's integrity hashes), standalone/runtime.js, the board's template and the board's code. Pages link to
each other by their new names, keep their browser storage apart from the live apps (runtime.js), and read
the Hub's sign-in when they share its origin (kit/core.js).
"""
import base64, hashlib, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
LIVE = '--live' in sys.argv
BUILT = os.path.join(ROOT, 'out', 'live' if LIVE else 'deploy')
DEPLOY = os.path.join(ROOT, 'live' if LIVE else 'deploy')
for _a in sys.argv[1:]:
    if _a.startswith('--out='):
        DEPLOY = os.path.abspath(_a.split('=', 1)[1])
BOARDS = [  # (built board, deployed page, app name)
    ('Main.dc.html', 'execution_app.html' if LIVE else 'calm-execution.html', 'Execution'),
    ('Sales-A.dc.html', 'sales_app.html' if LIVE else 'calm-sales.html', 'Sales'),
    ('Plan-A.dc.html', 'planning_app.html' if LIVE else 'calm-planning.html', 'Planning'),
    ('Spec-A.dc.html', 'product_designer.html' if LIVE else 'calm-product-spec.html', 'Product spec'),
    ('Mine-A.dc.html', 'my_projects.html' if LIVE else 'calm-my-projects.html', 'My Projects'),
]
LIVE_TITLES = {'Execution': 'R&amp;D Execution', 'Sales': 'Sales', 'Planning': 'R&amp;D Planning', 'Product spec': 'Product Specification',
               'My Projects': 'My Projects'}
VENDOR = [  # the canvas runtime loads exactly these builds, with these integrity hashes
    ('standalone/vendor/react.production.min.js', 'sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z'),
    ('standalone/vendor/react-dom.production.min.js', 'sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1'),
]
STORAGE_PREFIX = '' if LIVE else 'calm-prototype:'
PAGE_CSS = """html,body{height:100%;margin:0}
#dc-root,#dc-root>.sc-host{height:100%}
#dc-root>.sc-host{position:relative}
.sc-logic-error,.calm-boot-error{position:fixed;top:12px;left:12px;right:12px;z-index:2147483647;max-width:72ch;padding:10px 14px;border-radius:8px;background:#9A2C22;color:#fff;font:13px/1.45 system-ui,sans-serif;white-space:pre-wrap}"""


class PackError(Exception):
    pass


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def sri(path):
    with open(path, 'rb') as f:
        return 'sha384-' + base64.b64encode(hashlib.sha384(f.read()).digest()).decode()


def between(src, start, end, what):
    i = src.find(start)
    j = src.find(end, i + len(start)) if i >= 0 else -1
    if i < 0 or j < 0:
        raise PackError(f'{what}: could not find {start} … {end}')
    return src[i + len(start):j]


def script_safe(js, what):
    if re.search(r'</script', js, re.I):
        raise PackError(f'{what}: contains "</script"')
    if '<!--' in js:
        raise PackError(f'{what}: contains "<!--"')
    return js


def rename_links(text):
    """Main.dc.html -> calm-execution.html, and so on (template hrefs and the code's own links)."""
    names = {b[:-len('.dc.html')]: page for b, page, _ in BOARDS}
    return re.sub(r'\b(' + '|'.join(re.escape(n) for n in names) + r')\.dc\.html\b', lambda m: names[m.group(1)], text)


def package(board, page, app, vendor_js, runtime_js):
    src = read(os.path.join(BUILT, board))
    title = between(src, '<title>', '</title>', board).strip()
    xdc = between(src, '<x-dc>', '</x-dc>', board)
    helmet = between(xdc, '<helmet>', '</helmet>', board).strip()
    template = xdc[xdc.index('</helmet>') + len('</helmet>'):].strip()
    m = re.search(r'<script type="text/x-dc" data-dc-script[^>]*>\n?(.*)</script>\s*</body>', src, re.S)
    if not m:
        raise PackError(f'{board}: no board script')
    js = m.group(1)
    if '{{' in helmet:
        raise PackError(f'{board}: the helmet has holes; standalone pages expect a static head')
    if '.dc.html' not in template:
        raise PackError(f'{board}: expected links to the other boards in the template')
    template, js = rename_links(template), rename_links(js)
    left = re.findall(r'[\w-]+\.dc\.html', template + js)
    if left:
        raise PackError(f'{board}: links left to canvas boards: {sorted(set(left))[:5]}')
    script_safe(js, board)
    tpl_json = json.dumps(template, ensure_ascii=False).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    page_title = LIVE_TITLES[app] if LIVE else re.sub(r', calm workspace$', '', title) + ', calm prototype'
    html = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        + ('' if LIVE else '<meta name="robots" content="noindex">\n') +
        f'<title>{page_title}</title>\n'
        f'{helmet}\n<style>\n{PAGE_CSS}\n</style>\n</head>\n<body>\n'
        '<div id="dc-root"><noscript>This prototype needs JavaScript.</noscript></div>\n'
        + ''.join(f'<script>\n{js_}\n</script>\n' for js_ in vendor_js)
        + f'<script>\n{runtime_js}\n</script>\n'
        '<script>\n'
        'CalmRuntime.boot({\n'
        f'  name: {json.dumps(board[:-len(".dc.html")])},\n'
        f'  storagePrefix: {json.dumps(STORAGE_PREFIX)},\n'
        f'  template: {tpl_json},\n'
        '  logic: function (DCLogic, StreamableLogic, React, window) {\n'
        f'{js}\n'
        ';return (typeof Component !== "undefined" && Component) || undefined;\n'
        '  }\n'
        '});\n'
        '</script>\n</body>\n</html>\n'
    )
    os.makedirs(DEPLOY, exist_ok=True)
    out = os.path.join(DEPLOY, page)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'packaged {page:<24} {len(html.encode("utf-8")) / 1024:8.1f} KB  ({app}, from {board})')
    return out


def main():
    if '--no-build' not in sys.argv:
        flag, out = ('--flag=live', '--out=out/live') if LIVE else ('--flag=deploy', '--out=out/deploy')
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'build.py'), flag, out], cwd=ROOT)
        if r.returncode:
            sys.exit('build failed')
    vendor_js = []
    for rel, want in VENDOR:
        path = os.path.join(ROOT, rel)
        got = sri(path)
        if got != want:
            sys.exit(f'{rel}: integrity {got} does not match the canvas runtime\'s {want}')
        vendor_js.append(script_safe(read(path).strip(), rel))
    runtime_js = script_safe(read(os.path.join(ROOT, 'standalone', 'runtime.js')).strip(), 'standalone/runtime.js')
    try:
        for board, page, app in BOARDS:
            package(board, page, app, vendor_js, runtime_js)
    except PackError as e:
        sys.exit(f'PACKAGE FAILED: {e}')


if __name__ == '__main__':
    main()
