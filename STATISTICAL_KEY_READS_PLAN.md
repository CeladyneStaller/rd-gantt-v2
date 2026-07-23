# Statistical key reads in the ETB

**Status:** proposal. No code. A key read should be able to be a *statistic of several measurements* rather than a single number.

---

## 1. What exists today (read from source)

**The KPI layer is already statistical.** A KPI carries `targetType:"statistical"` alongside `binary`/`demonstration`, plus `statistic` (default `"average"`) and `readCount` (how many reads the statistic is over). `RD.computeStat(name, xs)` does the reduction, and readings are rows in `exec.kpiUpdates` — many rows per KPI, already. The sample-sharing machinery (`readsFrom`, `ownReadingsOf`, `sampleOwnerId`) is built on top of that: a statistical holder owns readings and other KPIs borrow them.

**The ETB key read is single-valued.** An experiment has `key_reads:[{id, name, unit, target, critical, statement, source_kpi_gid, …}]`. The recorder renders **one `<input class="erk-input" data-kr="…">` per key read**; `__erReadings()` collects one number each; `writeKpiUpdatesFromReads(expId, readings)` writes **one `kpiUpdate` per key read**, resolved to a KPI through `source_kpi_gid`.

**So the gap is narrow and specific:** a key read can already *point at* a statistical KPI, but the recorder can only give it one number. The statistical concept exists on one side of the bridge and not the other.

---

## 2. The design question that actually matters

Not "how do we store several numbers" — that part is easy. It is **where the statistic is defined, and what gets written to the KPI.**

Two sources of truth are possible (key read vs. its linked KPI), and if both can specify a statistic they will eventually disagree — key read says *median of 5*, KPI says *average of 3*. Whichever we pick has to be the only one.

And there is a second trap: if the recorder computes a mean and writes **one** reading, the KPI — which is itself configured to reduce N readings — will reduce a set of pre-reduced values. That double-reduction silently produces the wrong number as soon as an experiment is recorded twice.

---

## 3. Proposed design

### 3.1 Derive the statistic from the linked KPI; don't duplicate it

When a key read has `source_kpi_gid`, it **inherits** `statistic` and `readCount` from that KPI. The key read stores no statistic of its own. One definition, no drift, and it means marking a KPI statistical in the objective automatically makes every experiment that feeds it statistical.

A key read with **no** linked KPI needs its own config (fork **S-A**).

### 3.2 Write the raw reads, not the computed statistic

The recorder collects N values and writes **N `kpiUpdate` rows**, letting the KPI's own `statistic` do the reduction — which is exactly what that machinery is for. Consequences:

- No double-reduction.
- KPI history keeps the individual measurements; the spread stays inspectable.
- `readsFrom` borrowing keeps working untouched, because borrowers read the same reading rows.
- The experiment's own record (`key_read_values`) stores the **array** of reads, so the experiment remains a faithful account of what was measured.

The computed statistic is therefore never *stored* — it is derived wherever it is displayed. That is the invariant worth protecting.

### 3.3 Entry: one field that accepts several numbers

The recorder's single input becomes a field that accepts space/comma-separated values, with a live readout: `n = 4 of 5 · mean 0.679 · sd 0.004`. There is precedent — the product designer already uses a free-text `readings` string parsed by `parseNums` — so this matches house convention and needs no new widget.

Expected count comes from the KPI's `readCount`; entering fewer is allowed but visibly flagged (fork **S-D**).

### 3.4 Criteria evaluation

`etbMatchResults(exp, readings)` currently compares one number against a criterion. With N reads it must compare **the statistic** (fork **S-B**) — "mean ≥ 0.68" is what a statistical key read means. Per-read acceptance ("every read ≥ 0.68") is a genuinely different scientific claim and should be an explicit mode, not an accident of implementation.

### 3.5 Natural tie-in with Connect data

This is where the analysis import becomes markedly more useful. A statistical key read wants N measurements of the same quantity; the portal index frequently *has* several — the same canonical key across several runs of one sample. The picker already lets you tick several values from one sample; today each tick maps to a distinct target. For a statistical key read, several ticks should be able to fill **several reads of the same key read** (fork **S-E**). That is a small change to the picker's target model and it makes "import my five polcurve OCVs" a one-gesture operation.

---

## 4. Forks

**S-A — key reads with no linked KPI.**
*Default:* allow a local `{statistic, readCount}` on the key read, used only when `source_kpi_gid` is absent. The moment it is linked, the KPI wins and the local config is ignored (shown as overridden, not silently dropped).
*Alt:* statistical key reads require a linked KPI. Simpler and enforces one definition, but blocks exploratory experiments that aren't wired to an objective yet.

**S-B — what the criterion tests.**
*Default:* the statistic (`mean ≥ target`).
*Alt:* a per-key-read `acceptance` field — `statistic` | `all-reads` | `any-read` — defaulting to `statistic`. More expressive; more UI.

**S-C — dispersion.**
*Default:* show `n`, the statistic, and sd in the recorder and on the experiment record, but store only the raw reads. Nothing derived is persisted.
*Alt:* also surface sd against a tolerance (e.g. flag when sd exceeds a threshold) — real value for MEA work, but needs a per-KPI tolerance field.

**S-D — incomplete sets.**
*Default:* allow recording with `n < readCount`, flag it clearly on the experiment and the reading provenance.
*Alt:* block until complete. Cleaner data, but experiments legitimately end early.

**S-F — repeated experiments: pool or replace? — DECIDED: pool (status quo).** No batch stamping, no `readingScope` field; a statistical KPI keeps aggregating every posted reading. Recorded here with its consequences (see §8). *(Original framing below for the record.)*
Because the current value aggregates **every** posted reading, an experiment run twice pools both batches: 5 reads then 5 more gives the mean of 10, blending two experiments. This is already the behaviour for hand-entered statistical KPIs; the ETB change just makes it easy to hit, since each experiment posts a whole batch.
*Default:* **scope by batch** — stamp each reading with its experiment id (the ETB already writes `note:'exp <code>'`, so the provenance is half there) and let a statistical KPI resolve over the most recent batch. Matches "this experiment's result".
*Alt 1:* pool (status quo) — defensible if the KPI is a running estimate rather than a per-experiment result.
*Alt 2:* make it explicit per KPI: `readingScope: 'all' | 'latest-batch'`, defaulting to `all` so nothing existing changes.
Note this also applies to **Connect data imports**, which likewise post several rows at once.

**S-E — Connect data filling several reads of one key read.**
*Default:* yes — extend the picker's target model so one target can accept several values.
*Alt:* defer; keep one-value-per-target and let people paste.

---

## 5. Build phases

1. **Engine (`rdcore`, pure).** `statSummary(values, statistic) → {n, value, sd, min, max}`; `keyReadStat(keyRead, kpi) → {statistic, readCount, source:'kpi'|'local'|'none'}` (the single-source-of-truth resolver); criterion evaluation extended to take a summary rather than a scalar. Headless-tested, including the double-reduction trap as an explicit case.
2. **ETB recorder UI.** Multi-value entry + live `n / statistic / sd` readout; `__erReadings()` returns arrays; `writeKpiUpdatesFromReads` writes N rows sharing one experiment provenance.
3. **Experiment record + display.** `key_read_values` holds arrays; the experiment view shows `n`, the statistic and the spread; criteria matching uses the resolver.
4. **Connect data integration (S-E).** Multi-value targets in the picker.

Phases 1–2 are independently shippable; 3 is display; 4 is optional.

---

## 6. To verify before building (I have not confirmed these)

1. ~~How a statistical KPI's current value is computed~~ — **ANSWERED, see §7.** It aggregates **all** readings; `readCount` is a completeness indicator, not a window. This changes §3.2 — see fork **S-F**.
2. ~~Which statistics `RD.computeStat` supports~~ — **ANSWERED:** `average`, `median`, `stddev`, `cv`, `range`, `max`, `min` (unknown names fall back to `average`). The recorder should offer exactly these.
3. **Whether `etbMatchResults` compares numerically or via a criterion DSL**, which determines how much of it changes for a summary input.
4. **Whether anything else writes `key_read_values`** (import/export, the ETB tree schema) and would need the array shape tolerated — the schema change must be migration-safe: existing scalars keep working and are treated as `n = 1`.


---

## 7. Verification result (checked in source before build)

**Question:** does a statistical KPI's current value use all its readings, or only the most recent `readCount`?

**Answer: all of them.** In `rdcore.js`, `resolvedReadingValue(kpiId, defn, execDocs)` gathers every `kpiUpdate` for the KPI, and when `defn.targetType === 'statistical'` it pushes **all** numeric values into `computeStat(defn.statistic || 'average', xs)` — there is no slice or window. The in-function comment is explicit: *"aggregate ALL posted readings; readCount is the expected sample size (completeness), not a window."* The app reaches this through `RD.effValue → effectiveValueEntry → resolvedReadingValue`, so it is the value shown on KPI rows.

**Stale comment worth fixing.** The docstring immediately above that function says the opposite — *"'statistical' aggregates the latest readCount readings"*. The code and the inner comment agree with each other and contradict the docstring. Anyone trusting the docstring (as I nearly did) would design the wrong thing. Worth correcting whenever that file is next touched.

**Consequence for this plan.** §3.2's "write N raw readings and let the KPI reduce them" is right *within* one experiment and avoids double-reduction — that part holds. But across **repeated** experiments it pools rather than replaces, which is almost certainly not what "the mean of my five reads" is meant to convey on the second run. Hence fork **S-F**, which now needs answering before the build rather than after.


---

## 8. Consequences of pooling (S-F = status quo), and one thing it exposes

Pooling is now settled: a statistical KPI aggregates every reading ever posted, across experiments. Two follow-ons.

### 8.1 Re-recording the same experiment currently *appends* — that should be fixed

`writeKpiUpdatesFromReads` does a bare `exec.kpiUpdates.push({kpiId, value, timestamp, note:'exp <code>'})` per key read. There is no dedupe and no replace. So re-recording an outcome for the **same** experiment posts another reading on top of the first.

This is distinct from S-F. Pooling *across different experiments* is the intent Corey chose. Re-recording **one** experiment is an amendment, not a new measurement — and today it silently double-counts. It is already mildly wrong for single-value key reads; the statistical change multiplies it by the batch size (re-record a 5-read experiment and the KPI now averages 10 values, half of them superseded).

**Recommendation (small, and does not touch the pooling decision):** on record, first remove readings previously written by *that* experiment, then write the new batch. Cross-experiment pooling is unaffected.

Identity for "written by that experiment" should not be the `note` string — it is display text and will drift. Better to add a structured marker on the reading, mirroring what the analysis import already does with `src`: e.g. `src:{origin:'etb', expId}`. Existing rows without it keep working (they simply never match, so nothing is retro-deleted).

*Fork **S-G**: fix this as part of the statistical build (default), fix it separately first as a small standalone correction, or leave as-is.*

### 8.2 Two different "n"s in the UI, which must not be conflated

- **Entry n** — how many reads were typed into *this* experiment (`n = 4 of 5` against the KPI's `readCount`). This is about completeness of one entry.
- **KPI n** — how many readings the statistic is now over, pooled across everything.

Under pooling these diverge immediately: a 5-read experiment run twice shows entry `5 of 5` and KPI `n = 10`. The recorder should show entry n; the KPI row should show KPI n. Labelling them the same would make the pooling behaviour look like a bug when it is the chosen design.
