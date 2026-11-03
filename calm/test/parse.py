"""Parse a built .dc.html board into JSON: template tree + logic script + structural errors.

    python3 test/parse.py out/Main.dc.html  > tree.json

Structural checks mirror what breaks the DC runtime or React:
  nested <button>/<a>, form controls inside <button>, nested <form>, <p> (auto-close risk),
  event attributes that are not one whole {{hole}}, sc-for/sc-if without hint attributes,
  self-closing HTML elements, holes in <option> text, <tr> directly inside <table>.
"""
import json, re, sys
from html.parser import HTMLParser

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
SVG_SELF = {'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'use', 'stop', 'animate'}


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {'tag': '#root', 'attrs': {}, 'kids': [], 'line': 0}
        self.stack = [self.root]
        self.errors = []
        self.warnings = []

    def handle_starttag(self, tag, attrs):
        node = {'tag': tag, 'attrs': {k: (v if v is not None else '') for k, v in attrs}, 'kids': [], 'line': self.getpos()[0]}
        anc = [n['tag'] for n in self.stack]
        if tag in ('button', 'a') and any(t in ('button', 'a') for t in anc):
            self.errors.append(f'line {node["line"]}: <{tag}> nested inside {[t for t in anc if t in ("button", "a")]}')
        if tag in ('input', 'select', 'textarea') and 'button' in anc:
            self.errors.append(f'line {node["line"]}: <{tag}> inside <button>')
        if tag == 'form' and 'form' in anc:
            self.errors.append(f'line {node["line"]}: nested <form>')
        if tag == 'p':
            self.errors.append(f'line {node["line"]}: <p> used (auto-closing risk); use <div>')
        if tag == 'tr' and self.stack[-1]['tag'] == 'table':
            self.errors.append(f'line {node["line"]}: <tr> directly inside <table>; wrap rows in <tbody>/<thead>')
        for k in node['attrs']:
            if k.startswith('on') and not re.fullmatch(r'\s*\{\{[^}]+\}\}\s*', node['attrs'][k]):
                self.errors.append(f'line {node["line"]}: event attr {k} is not a whole hole')
            if k == 'classname':
                self.errors.append(f'line {node["line"]}: use class=, not className=')
        if tag in ('sc-for', 'sc-if'):
            need = 'hint-placeholder-count' if tag == 'sc-for' else 'hint-placeholder-val'
            if need not in node['attrs']:
                self.errors.append(f'line {node["line"]}: <{tag}> missing {need}')
            if tag == 'sc-for' and 'as' not in node['attrs']:
                self.errors.append(f'line {node["line"]}: <sc-for> missing as=')
        self.stack[-1]['kids'].append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            if tag not in SVG_SELF:
                self.errors.append(f'line {self.getpos()[0]}: self-closing <{tag}/> (HTML elements need an explicit close tag)')
            self.stack.pop()

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if self.stack[-1]['tag'] != tag:
            self.errors.append(f'line {self.getpos()[0]}: </{tag}> closes <{self.stack[-1]["tag"]}> (opened line {self.stack[-1]["line"]})')
            for i in range(len(self.stack) - 1, 0, -1):
                if self.stack[i]['tag'] == tag:
                    del self.stack[i:]
                    return
            return
        self.stack.pop()

    def handle_data(self, data):
        if self.stack[-1]['tag'] in ('style', 'script'):
            return
        if self.stack[-1]['tag'] == 'option' and '{{' in data:
            self.errors.append(f'line {self.getpos()[0]}: hole inside <option> text; use <option value="{{{{x.v}}}}" label="{{{{x.label}}}}"></option>')
        if data.strip() or ' ' in data:
            self.stack[-1]['kids'].append({'tag': '#text', 'text': data, 'line': self.getpos()[0]})


def main(path):
    src = open(path, encoding='utf-8').read()
    errors = []
    if '<script src="./support.js"></script>' not in src:
        errors.append('support.js head line missing')
    a = src.find('<x-dc>')
    b = src.rfind('</x-dc>')
    tpl = src[a + len('<x-dc>'):b]
    hl = tpl.find('</helmet>')
    body_offset_lines = 0
    if hl >= 0:
        body_offset_lines = src[:a + len('<x-dc>') + hl + len('</helmet>')].count('\n')
        tpl_body = tpl[hl + len('</helmet>'):]
    else:
        tpl_body = tpl
    m = re.search(r'<script type="text/x-dc" data-dc-script data-props=\'([^\']*)\'>(.*?)</script>', src, re.S)
    if not m:
        errors.append('logic script block missing')
        script, props = '', '{}'
    else:
        props, script = m.group(1), m.group(2)
    try:
        json.loads(props)
    except Exception as e:
        errors.append(f'data-props JSON: {e}')
    p = P()
    p.feed(tpl_body)
    p.close()
    if len(p.stack) != 1:
        errors.append('unclosed: ' + ' > '.join(f'{n["tag"]}@{n["line"]}' for n in p.stack[1:]))
    errors += p.errors

    def fix(n):
        if 'line' in n:
            n['line'] = n['line'] + body_offset_lines
        for k in n.get('kids', []):
            fix(k)
    fix(p.root)
    errors = [re.sub(r'line (\d+)', lambda mm: 'line ' + str(int(mm.group(1)) + body_offset_lines), e) for e in errors]
    hrefs = sorted(set(re.findall(r'href="([^"#][^"]*\.dc\.html)"', tpl_body)))
    # source map: built-file line -> [source file, line in that file], from the <!--src:...--> markers
    srcmap = {}
    stack = [['shell', 0]]
    for i, ln in enumerate(tpl_body.split('\n')):
        abs_line = body_offset_lines + 1 + i
        stack[-1][1] += 1
        srcmap[abs_line] = [stack[-1][0], stack[-1][1]]
        for mk in re.finditer(r'<!--src:([^>]+?)-->|<!--/src-->', ln):
            if mk.group(1):
                stack.append([mk.group(1), 0])
            elif len(stack) > 1:
                stack.pop()
    json.dump({'tree': p.root, 'script': script, 'errors': errors, 'hrefs': hrefs, 'srcmap': srcmap}, sys.stdout)


main(sys.argv[1])
