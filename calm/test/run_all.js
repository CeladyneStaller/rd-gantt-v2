/* Every Calm suite against the sample boards (build them first: python build.py). Cross-platform twin of
   run_all.sh, used by the repo's sweep.py.

     node test/run_all.js [buildDir]        (default out)

   Prints one line per suite, then "<N> calm assertions green" when everything passed (the phrase sweep.py
   counts), or "<N> passed, <M> failed" and exit code 1. */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const DIR = (process.argv[2] || 'out').replace(/[\\/]+$/, '');
const B = (name) => path.join(DIR, name);
const SUITES = [];
['sc_shell', 'sc_kr', 'sc_kpi', 'sc_pull', 'sc_gates', 'sc_kb', 'sc_fmea', 'sc_exp', 'sc_initm', 'sc_review', 'sc_views'].forEach((t) => {
  SUITES.push([t + '.js', B('Main.dc.html')], [t + '.js', B('Sales-A.dc.html')]);
});
SUITES.push(['sc_plan.js', B('Plan-A.dc.html')], ['sc_gantt.js', B('Plan-A.dc.html')], ['sc_spec.js', B('Spec-A.dc.html')], ['sc_specparts.js', B('Spec-A.dc.html')]);
SUITES.push(['sc_mine.js', B('Mine-A.dc.html')]);
['Main', 'Sales-A', 'Plan-A', 'Spec-A', 'Mine-A'].forEach((b) => { SUITES.push(['sc_kit.js', B(b + '.dc.html')], ['sc_repair.js', B(b + '.dc.html')]); });
SUITES.push(['sc_roles.js', DIR]);
SUITES.push(['audit_a1.js', B('Main.dc.html')], ['audit_a1.js', B('Sales-A.dc.html')], ['audit_a2.js', B('Main.dc.html')], ['audit_a2.js', B('Sales-A.dc.html')], ['audit_a3.js', B('Plan-A.dc.html')], ['audit_a4.js', B('Spec-A.dc.html')]);
SUITES.push(['merge.js', '']);
['sc_exec_live.js', 'sc_plan_live.js', 'sc_spec_live.js', 'sc_mine_live.js'].forEach((t) => { if (fs.existsSync(path.join(__dirname, t))) SUITES.push([t, '']); });

const LIMIT = Math.max(2, Math.min(8, require('os').cpus().length));
let pass = 0, fail = 0, bad = 0, i = 0, running = 0;
const results = new Array(SUITES.length);

function runOne(k) {
  const [t, arg] = SUITES[k];
  running++;
  const args = [path.join('test', t)].concat(arg ? [arg] : []);
  execFile(process.execPath, args, { cwd: ROOT, maxBuffer: 1 << 26, timeout: 600000 }, (err, stdout, stderr) => {
    running--;
    const out = String(stdout || '') + String(stderr || '');
    const lines = out.trim().split('\n');
    const last = lines[lines.length - 1] || '';
    const m = /(\d+) passed, (\d+) failed/.exec(last);
    let line;
    if (m && Number(m[2]) === 0 && !err) { pass += Number(m[1]); line = 'ok   ' + t + ' ' + (arg ? path.basename(arg) : '') + ': ' + last; }
    else {
      bad++;
      if (m) { pass += Number(m[1]); fail += Number(m[2]); } else fail++;
      line = 'FAIL ' + t + ' ' + (arg ? path.basename(arg) : '') + ': ' + (last || (err && err.message) || 'no result') + '\n' +
        lines.filter((l) => /FAIL|Error|error/.test(l)).slice(0, 12).map((l) => '     ' + l).join('\n');
    }
    results[k] = line;
    next();
  });
}
function next() {
  while (running < LIMIT && i < SUITES.length) runOne(i++);
  if (running === 0 && i >= SUITES.length) {
    results.forEach((l) => console.log(l));
    if (bad) { console.log(pass + ' passed, ' + fail + ' failed'); process.exitCode = 1; }
    else console.log(pass + ' calm assertions green');
  }
}
next();
