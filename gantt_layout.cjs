// Planning-app Gantt: fluid width, month markers, resizable name column.
//
// The chart used to be a fixed 960px — a 240px label column plus a 720px track — with every bar,
// gridline and axis label positioned in absolute pixels off a scale built from the 720 constant. It
// could neither grow on a wide screen nor shrink inside a narrow embed.
//
// Positions are now PERCENTAGES of the track, so CSS owns the scaling and nothing needs measuring at
// render; the label column is a CSS variable so one assignment moves the rows, the axis and the
// gridline overlay together.
const { JSDOM, VirtualConsole } = require((process.env.RD_SRC || '/home/claude/work') + '/node_modules/jsdom');
const fs = require('fs');
const out = []; const ok = (c, m) => out.push((c ? 'ok  ' : 'FAIL ') + m);

const src = fs.readFileSync((process.env.RD_OUT || '/home/claude/work') + '/planning_app.html', 'utf8');
const d = new JSDOM(src, { virtualConsole: new VirtualConsole() }).window.document;
const rules = [...d.styleSheets].flatMap(ss => { try { return [...ss.cssRules]; } catch (e) { return []; } });
const flat = (list) => list.flatMap(r => r.cssRules ? [r, ...flat([...r.cssRules])] : [r]);
const all = flat(rules);
const rule = (pred) => all.find(r => r.selectorText && pred(r.selectorText));
const css = (r) => r ? String(r.style.cssText) : '';

// ---------- the chart is fluid ----------
(function () {
  const chart = rule(t => /\.gchart$/.test(t));
  const track = rule(t => /\.gtrack$/.test(t));
  const label = rule(t => /\.glabel$/.test(t));
  ok(!!chart && !!track && !!label, "the chart, track and label column are all styled");

  ok(!/width:\s*720px/.test(css(track)), "the track is no longer pinned to 720px");
  ok(/flex:\s*1 1 auto/.test(css(track)), "…it takes whatever width is left, so the chart grows with the screen");
  ok(/min-width:\s*0/.test(css(track)), "…and can shrink inside a narrow embed rather than overflowing");
  ok(/width:\s*100%/.test(css(chart)), "the chart fills its container");
  ok(!/width:\s*960px/.test(css(chart)) && !/\$\{LABELW\+TRACKW\}/.test(src),
    "…rather than being written at a fixed pixel width");

  // the gantt view gets more room than the rest of the app
  const wide = rule(t => /main\.wide$/.test(t));
  ok(!!wide && /max-width/.test(css(wide)), "the gantt view is allowed past the app's 1200px cap");
  /* a rule nobody applies is decoration: check the class is actually toggled, and only for the gantt */
  ok(/classList\.toggle\("wide", tab==="gantt"\)/.test(src), "…and the class is applied on the gantt tab only");
  ok(/applyWideView\(b\.dataset\.tab\)/.test(src), "…on every tab switch, including the ?tab= deep link");
})();

// ---------- positions are percentages ----------
(function () {
  ok(/const x=d=>\(d-lo\)\/\(hi-lo\)\*100/.test(src), "the day-to-position scale produces percentages");
  ok(!/TRACKW/.test(src), "…with no pixel track constant left to go stale");
  // no bar may still be positioned from x() in px
  ok(!/left:\$\{x\([^)]*\)\}px/.test(src), "no element is positioned in pixels off the scale");
  ok(!/width:\$\{Math\.max\(2,x\(/.test(src), "…and no width is either");
  ok(/max\(\$\{v\}%, 2px\)/.test(src), "a minimum bar width is kept in px, since a 2px sliver is a pixel idea");
  // indentation is NOT a track position and must stay in pixels
  ok(/left:\$\{n\.depth\*16\+6\}px/.test(src), "row indentation stays in pixels — it is not track space");
})();

// ---------- month markers ----------
(function () {
  ok(/function monthTicks\(/.test(src), "month boundaries are computed");
  ok(/if\(t\.q\) return;/.test(src), "…skipping quarter starts, which already have a tick");

  const month = rule(t => /\.ggrid\.gmonth$/.test(t));
  const quarter = rule(t => /\.ggrid$/.test(t));
  ok(!!month, "month gridlines have their own style");
  const mo = parseFloat((css(month).match(/opacity:\s*([\d.]+)/) || [])[1]);
  const qo = parseFloat((css(quarter).match(/opacity:\s*([\d.]+)/) || [])[1]);
  ok(isFinite(mo) && isFinite(qo) && mo < qo,
    "…and are FAINTER than the quarter lines (" + mo + " vs " + qo + ") — orientation, not structure");
  ok(/border-left-style:\s*dotted/.test(css(month)), "…visually distinct as well as fainter");

  const lab = rule(t => /\.gmonthlab$/.test(t));
  ok(!!lab && /display:\s*none/.test(css(lab)), "month labels are hidden by default");
  const shown = all.some(r => r.selectorText && /\.gmonthlab$/.test(r.selectorText) && /display:\s*inline/.test(css(r)));
  ok(shown, "…and revealed only at a width breakpoint, so a narrow chart is not made illegible");
  ok(/container-type:\s*inline-size/.test(css(rule(t => /\.gchart$/.test(t)))),
    "the breakpoint measures the CHART, not the window, so it is right inside an embed too");
  ok(/@supports not \(container-type/.test(src), "…with a viewport fallback where container queries are unsupported");
})();

// ---------- the name column resizes ----------
(function () {
  const chart = rule(t => /\.gchart$/.test(t));
  const label = rule(t => /\.glabel$/.test(t));
  ok(/--glabelw:\s*240px/.test(css(chart)), "the label width is a CSS variable with the original default");
  ok(/width:\s*var\(--glabelw\)/.test(css(label)), "…which the label column reads");

  const layer = rule(t => /\.ggridlayer$/.test(t));
  ok(!!layer && /left:\s*var\(--glabelw\)/.test(css(layer)),
    "the gridline overlay starts where the label column ends, so resizing does not shift every line");

  const grip = rule(t => /\.glabelgrip$/.test(t));
  ok(!!grip && /cursor:\s*col-resize/.test(css(grip)), "there is a drag handle on the column edge");
  ok(/data-glabelgrip/.test(src), "…rendered into the axis header");
  ok(/mousedown/.test(src) && /col-resize/.test(src), "…wired to a drag");

  ok(/GLABEL_MIN=140, GLABEL_MAX=640/.test(src), "the width is clamped at both ends");
  ok(/Math\.min\(GLABEL_MAX, Math\.max\(GLABEL_MIN,/.test(src),
    "…on every drag frame, so the names cannot vanish and the track cannot be squeezed to nothing");
  ok(/localStorage\.setItem\("rd_gantt_labelw"/.test(src), "the chosen width is remembered");
  ok(/localStorage\.getItem\("rd_gantt_labelw"/.test(src), "…and restored on the next render");
  ok(!/exec\.[a-z]*\s*=\s*[^;]*labelw/i.test(src),
    "…per person in localStorage, not in the document where it would change the view for everyone");
})();

out.forEach(l => { if (l.startsWith('FAIL')) console.log(l); });
const fails = out.filter(x => x.startsWith('FAIL'));
console.log(fails.length ? `\n${fails.length}/${out.length} FAILED` : `\nPASS - ${out.length} gantt-layout assertions green`);
process.exit(fails.length ? 1 : 0);
