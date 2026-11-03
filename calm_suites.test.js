/* Every Calm suite, from the repo's sweep. The four apps are built from calm/ (python build.py), so their
   tests live there too: this builds the sample boards into calm/out/ (the same source, with the sample data
   the suites are written against) and runs calm/test/run_all.js, which prints "<N> calm assertions green".

     node calm_suites.test.js

   Slow (a minute or more), so sweep.py lists it in SLOW and gives it a longer timeout. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = [process.env.RD_OUT, __dirname].find((d) => d && fs.existsSync(path.join(d, 'calm', 'build.py')));
if (!BASE) {
  console.log('FAIL: no calm/ folder beside this harness (or in RD_OUT)');
  process.exit(1);
}
const CALM = path.join(BASE, 'calm');
const PY = process.env.RD_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

const build = spawnSync(PY, [path.join(CALM, 'build.py')], { cwd: CALM, encoding: 'utf8' });
if (build.error || build.status !== 0) {
  process.stdout.write(String(build.stdout || '') + String(build.stderr || ''));
  console.log('FAIL: the Calm sample build did not finish' + (build.error ? ' (' + build.error.message + ')' : ''));
  process.exit(1);
}
/* the suites run Python too (the board parser, the live builds): the same interpreter as the build above */
const run = spawnSync(process.execPath, [path.join(CALM, 'test', 'run_all.js')], { cwd: CALM, encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, { RD_PYTHON: PY }) });
process.stdout.write(String(run.stdout || ''));
process.stderr.write(String(run.stderr || ''));
process.exit(run.status === 0 ? 0 : 1);
