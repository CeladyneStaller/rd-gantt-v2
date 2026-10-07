# Multiple logic trees — implementation plan

Approved shape: several independent logic trees per objective. The current step section shows one
summary card per tree, each with its own key reads, its own Conclude, and its own focused graph
(lazy-mounted, sticky). The ETB gains a **Logic trees** header listing every tree with its remaining
min–max next steps and a **+ New tree** button.

---

## 1. What exists today

| Thing | Current state | Why it matters |
|---|---|---|
| `exec.etbTrees[objId]` | **one** tree object per objective | a second tree has nowhere to live |
| `state.tree` | *is* that one tree | every render path reads it |
| `root_experiment_id` | single root on the tree | one entry point per objective |
| `#expSummaryGraph` | hardcoded `getElementById` | assumes exactly one graph on the page |
| `__focusCy` | **single module-level cytoscape instance**, destroyed at the top of every `__etbRenderFocused` call | two graphs would destroy each other — this is the blocker for per-tree graphs |
| `ETB.currentExperiments()` | walks `state.tree` only | returns the active tree's current step, not all trees' |

The last two are the real work. Everything else is plumbing.

---

## 2. Storage change

```
exec.etbTrees[objId] = {
  schema: 2,
  trees: [ { tid, name, root_experiment_id, experiments: {…} }, … ],
  activeTid: "t_…"
}
```

Each tree owns its **own** `experiments` map. Ids in one tree are invisible to the other, so
reachability physically cannot cross — that is what "non-interacting" means here, rather than a
shared pool with a `chainId` tag that invites accidental coupling.

**Migration is load-time and one-way-safe.** A schema-1 doc (a bare tree object) is wrapped as
`trees:[{tid:'t_main', name:'Main', …that tree}]`, `activeTid:'t_main'`. Written back in schema 2 on
the next save. An objective with no ETB stays absent, not an empty array.

> `migrateProblem` is the cautionary tale here: an explicit field whitelist silently discarded
> `experiments` on every load and cost several sessions to find. This migration must pass unknown
> fields through, and the harness must round-trip through the *real* load path, not
> `JSON.parse(JSON.stringify(...))`.

`activeTid` lives in the **document** (it names which tree the ETB opens on). Per-card graph
expansion is **per-person** and lives in localStorage — see §5.

---

## 3. Engine work (rdcore, pure, testable first)

| Function | Contract |
|---|---|
| `etbTrees(doc, objId)` | normalised `{trees, activeTid}` for either schema |
| `treeById(doc, objId, tid)` | one tree, or null |
| `currentStepOf(tree)` | current experiment ids **for that tree** |
| `nextStepRange(tree, expId)` | `{min, max, unplanned}` — the header numbers |

### `nextStepRange` — the min/max rule

Remaining depth from the current step, counting **experiments ahead**. A terminal outcome (FMEA,
etc.) contributes 0.

- `max` = longest path to termination
- `min` = shortest path to termination
- a possible result with a terminal target ⇒ that branch contributes **0**, so `min = 0`
- a possible result targeting experiment `E` ⇒ contributes `1 + depth(E)`

Worked cases from the mockups:

| Tree | Shape | Result |
|---|---|---|
| Seal integrity | concluded, nothing planned after | `0–0` |
| Membrane crossover | every branch → one experiment that itself terminates | `1–1` |
| Catalyst durability | one branch → FMEA (terminal), other → EXP-4 → EXP-7 | `0–2` |
| Stack scale-up | terminal option now, longest run three deep | `0–3` |

Two guards, both load-bearing:

- **Cycles.** `repeat_of` lets a tree loop. Max depth on a cyclic graph is unbounded — cap the walk
  (depth 8) and render `3+` rather than hang.
- **Unplanned branches.** A result with no target and no terminal marker is ambiguous: "ends here" or
  "not thought through yet". Count it as 0 but set `unplanned:true`, so `0–2` on a genuinely terminal
  branch renders differently from `0–2` that is merely unfinished.

---

## 4. The graph blocker

`__etbRenderFocused` holds `__focusCy` as one module-level instance and destroys it on entry. Per-tree
graphs need:

- an instance **map** keyed by container id, not a single variable
- `destroy()` on the *specific* instance being replaced, and on every instance when the section
  re-renders — cytoscape leaks if a container is dropped without destroying
- `renderFocusedGraph(container, expIds)` keeps its signature; the registry is internal

The section re-renders on every keystroke elsewhere in the app. That is precisely why the current
step goes lazy.

---

## 5. Lazy + sticky graphs

- Only a card whose graph is **expanded** mounts cytoscape. Collapsed cards show a dashed placeholder
  with the next-step count and a **Show graph** button.
- Expansion is **sticky per tree** and independent of which tree is active in the ETB — watching two
  trees at once is the point. Stored in localStorage keyed `etbGraphOpen:{objId}`, so it is
  per-person and per-browser, and resets on a new machine rather than following the document.
- Switching the active tree in the ETB header does **not** move or unmount anything in the current
  step section.

---

## 6. UI work (execution_app template)

**Current step** — `renderExpSummary` loops trees instead of rendering one card:
each card carries tree name, min–max, the current experiment, its key-read table, Conclude, and the
graph slot. All existing per-card behaviour (click-to-post, the statistical popover, Connect data,
the sample chip) is per-experiment and needs no change beyond being called in a loop.

**ETB** — a Logic trees header above the tree body: one button per tree showing name and min–max,
the active one accented; **+ New tree**; Rename on the active tree. `0–0` renders as plain
`0–0 next steps` — **not** tagged "finished", since a tree with no planned next step is unfinished,
not closed.

---

## 7. Final mockups (the binding contract)

Three widgets rendered in-conversation, in this order:

1. **`current_step_graphs_lazy`** — the approved current step: active tree mounted, others collapsed
   to a placeholder with Show graph. *This is the contract for §5 and §6.*
2. **`etb_logic_trees_header_v2`** — the approved ETB header: four trees with min–max, New tree,
   active tree body below with its branches. *Contract for the header and the min/max display.*
3. **`etb_chain_manager`** — rename / reorder / delete, with a confirm step on delete.

Note the mockup graphs are static SVG standing in for real `renderFocusedGraph` output — node shapes
and layout come from the app's `cyStyle`, not from the mockup.

---

## 8. Build order

| Phase | Work | Gate |
|---|---|---|
| 1 | Storage + migration in rdcore; `etbTrees`, `treeById`, `nextStepRange` | engine harness green, mutation-tested, incl. schema-1 round trip through the real load path |
| 2 | Cytoscape instance registry; `__focusCy` → map; destroy on re-render | existing single-graph behaviour unchanged, harness green |
| 3 | ETB Logic trees header, switching, New tree, Rename | switching does not disturb current step |
| 4 | Current step per-tree cards, lazy + sticky graphs | full sweep green, determinism verified |
| 5 | Chain manager (rename/reorder/delete) + orphan guard | delete blocked or warned when a stage gate references the tree |

Phases 1 and 2 are independent and carry the risk; 3–5 are assembly.

---

## 9. Open questions

1. **Stage gates referencing experiments.** A gate can point at an experiment; deleting a tree would
   orphan it. Chain-scope the gates, or block delete on inbound references? Default: **block with a
   message naming the gate.**
2. **Ordering of trees** in both header and card stack. Default: **creation order**, with drag to
   reorder in the manager.
3. **Depth hint on the card.** The mockup shows `EXP-4 → EXP-7` inline to explain a max of 2. Fine at
   depth 2, ugly at depth 4. Default: **immediate next step only; the min–max number carries the
   rest.**
4. **Sales app.** It has its own copy of the current step section and does not get this. Consistent
   with the standing exec/sales fork, but one more divergence.
