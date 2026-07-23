// Guard against a class of bug that shipped once: a literal double-backslash unicode escape (\\uXXXX) in the
// JS source, which renders as the text "\uXXXX" instead of the intended glyph. This happens when a code block is
// written via file-creation and the escape is spelled \\uXXXX instead of \uXXXX. jsdom renders it fine as text,
// so only the eye (or this check) catches it. Scans every built app + template.
const fs = require('fs'); const path = require('path');
const OUT = process.env.RD_OUT || '/mnt/user-data/outputs';
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

// two literal backslashes followed by u + 4 hex digits
const BAD = /\\\\u[0-9a-fA-F]{4}/g;

const files = fs.readdirSync(OUT).filter(f =>
  (/_app\.html$/.test(f) || f === 'product_designer.html' || /\.template\.html$/.test(f))
);
ok(files.length > 0, 'found app/template files to scan (' + files.length + ')');

let totalBad = 0;
for (const f of files) {
  const s = fs.readFileSync(path.join(OUT, f), 'utf8');
  const m = s.match(BAD) || [];
  if (m.length) {
    totalBad += m.length;
    // report the distinct offenders so a failure is actionable
    const uniq = [...new Set(m)].join(', ');
    ok(false, `${f} contains ${m.length} literal double-backslash escape(s): ${uniq} — should be a single-backslash \\uXXXX`);
  } else {
    ok(true, `${f}: no literal \\uXXXX escapes`);
  }
}
ok(totalBad === 0, `no literal double-backslash unicode escapes anywhere (found ${totalBad})`);

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} unicode-escape-guard assertions green`);
process.exit(fails.length ? 1 : 0);
