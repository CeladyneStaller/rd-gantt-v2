// todayDay must be the LOCAL CALENDAR DATE's day number.
//
// The bug this pins: todayDay was Math.round((Date.now()-EPOCH)/86400000). That rounds a FRACTIONAL
// day count to nearest, so from 12:00 UTC onward it rolls to tomorrow. West of UTC that is the entire
// working day — in Mountain Time it flips at 06:00 local — so every completion that defaulted to
// "today" was stamped a day in the future, and every lateness/at-risk check ran a day ahead.
//
// A day number means a calendar date: isoToDay parses "YYYY-MM-DD" at UTC midnight, so its fraction is
// exactly zero and its rounding is harmless. todayDay has to agree with that, which means deriving the
// number from the LOCAL y/m/d rather than from an instant.
//
// This runs the shipped helper under forced timezones. It is engine-level (no DOM): the helper is
// extracted from the built app so the test cannot drift from what actually ships.
const fs = require('fs');
const path = (process.env.RD_OUT || '/home/claude/work') + '/execution_app.html';
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

// pull the shipped EPOCH + todayDay + dayToIso out of the built app, so this tests real code
const app = fs.readFileSync(path, 'utf8');
function extract(re, label) {
  const m = app.match(re);
  if (!m) { ok(false, 'could not find ' + label + ' in the built app'); return null; }
  return m[0];
}
const epochSrc = extract(/const EPOCH = Date\.UTC\([^)]*\);/, 'EPOCH');
const dayIsoSrc = extract(/^const dayToIso = .*$/m, 'dayToIso');
const isoDaySrc = extract(/^const isoToDay = .*$/m, 'isoToDay');
// todayDay may be a one-liner OR a block arrow. Extract by scanning from the declaration to the
// statement-ending `;` at brace depth 0, so this harness keeps testing the real helper whatever shape
// it takes — otherwise a mutation that reshapes it would only produce a vague "not found" failure
// instead of the actual wrong-date failure it should.
function extractDecl(name) {
  const start = app.indexOf('const ' + name + ' = ');
  if (start < 0) { ok(false, 'could not find ' + name + ' in the built app'); return null; }
  let depth = 0;
  for (let i = start; i < app.length; i++) {
    const c = app[i];
    if (c === '{' || c === '(') depth++;
    else if (c === '}' || c === ')') depth--;
    else if (c === ';' && depth === 0) return app.slice(start, i + 1);
  }
  ok(false, 'could not find the end of ' + name); return null;
}
const todaySrc = extractDecl('todayDay');

function build(tzNow) {
  // evaluate the shipped helpers with Date pinned to a chosen local instant
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(tzNow.getTime()); else super(...a); }
    static now() { return tzNow.getTime(); }
  }
  const fn = new Function('Date', `${epochSrc}\n${isoDaySrc}\n${dayIsoSrc}\n${todaySrc}\nreturn {todayDay, dayToIso, isoToDay};`);
  return fn(FakeDate);
}

function checkDay(localIso, hhmm, label) {
  // construct a local-time instant for the given wall clock in the process TZ
  const [Y, M, D] = localIso.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date(Y, M - 1, D, h, m, 0);
  const api = build(now);
  const got = api.dayToIso(api.todayDay());
  ok(got === localIso, label + ' \u2014 ' + localIso + ' ' + hhmm + ' local reads as ' + got);
  return got === localIso;
}

// Force the timezones rather than inheriting the machine's, so this harness's coverage is the same
// wherever it runs. Node re-reads process.env.TZ at runtime. Boise is the reported case; the others
// bracket it (UTC where the old code flipped at noon, and east-of-UTC where it flipped differently).
const ZONES = ['America/Boise', 'UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'];
if (todaySrc && epochSrc && dayIsoSrc) for (const TZ of ZONES) {
  process.env.TZ = TZ;
  const z = (m) => '[' + TZ + '] ' + m;
  // ---------- a full working day must all land on the same calendar date ----------
  // The old code flipped at 06:00 in Mountain Time, so these hours are exactly where it broke.
  ['06:00', '07:00', '09:00', '12:00', '15:00', '17:00', '19:00', '23:30'].forEach(t => {
    checkDay('2026-07-27', t, z('a working-day completion keeps today\'s date'));
  });
  // ---------- the hours that used to be right must stay right ----------
  ['00:15', '03:00', '05:59'].forEach(t => {
    checkDay('2026-07-27', t, z('an early-morning completion is unchanged'));
  });

  // ---------- month, year and leap boundaries ----------
  checkDay('2026-07-31', '18:00', z('the last evening of a month does not roll into the next'));
  checkDay('2026-12-31', '20:00', z('new year\'s eve does not roll into next year'));
  checkDay('2026-01-01', '13:00', z('new year\'s day is itself'));
  checkDay('2028-02-29', '16:00', z('a leap day is itself'));

  // ---------- DST transitions (the process TZ is forced by the runner below) ----------
  checkDay('2026-03-08', '04:00', z('the morning after spring-forward'));
  checkDay('2026-11-01', '04:00', z('the morning after fall-back'));

  // ---------- the day number must round-trip against isoToDay ----------
  (function () {
    const now = new Date(2026, 6, 27, 15, 0, 0);
    const api = build(now);
    ok(api.todayDay() === api.isoToDay('2026-07-27'),
      z('todayDay agrees with isoToDay for the same calendar date (') + api.todayDay() + ' vs ' + api.isoToDay('2026-07-27') + ')');
    ok(api.todayDay() === Math.trunc(api.todayDay()), z('the day number is a whole number'));
  })();

  // ---------- the regression itself, stated directly ----------
  (function () {
    const now = new Date(2026, 6, 27, 15, 0, 0);   // 3pm local, mid working day
    const api = build(now);
    const oldWay = Math.round((now.getTime() - Date.UTC(2020, 0, 1)) / 86400000);
    const tzOffsetMin = now.getTimezoneOffset();
    if (tzOffsetMin > 0) {   // only meaningful west of UTC, where the old code broke
      ok(api.todayDay() !== oldWay,
        z('the fix genuinely differs from the old rounding at 3pm local (fixed ') + api.todayDay() + ' vs old ' + oldWay + ')');
      ok(api.dayToIso(oldWay) === '2026-07-28', z('\u2026and the old rounding did stamp tomorrow (') + api.dayToIso(oldWay) + ')');
    } else {
      ok(true, z('east of UTC the old rounding did not differ at 3pm local (not applicable)'));
      ok(true, z('(not applicable in this timezone)'));
    }
  })();
}

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} todayDay local-calendar assertions green`);
process.exit(fails.length ? 1 : 0);
