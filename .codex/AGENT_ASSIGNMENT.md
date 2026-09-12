# Claude / Codex Issue Ownership

Last reconciled: 2026-09-13 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main: `b9b7d0d0e1a677752a2fca2e09d021ea5542f564`
Authoritative Codex queue: `codex-control:.codex/ISSUE_ORDER.txt`

Claude is available again. Resume two-agent development with **one active implementation owner per Issue**. Do not have Claude and Codex implement the same Issue at the same time.

## Shared architecture / safety
- `Canonical -> Semantic Commands / History -> Projection -> Renderer -> DOM`
- one logical mutation = one semantic operation = one History unit
- stable opaque IDs; no array-index/name identity
- view-only operations keep Canonical/History/Dirty delta = 0
- `source time -> DisplayTimeMapping -> TimeAxisGeometry/LocalGeometry -> screen`
- DOM/ruler pixels are not semantic authority
- no Golden/reference/threshold/mask weakening merely to pass
- user-visible real-browser reproduction overrides a narrower automated PASS
- actual pointer workflows require actual browser pointer acceptance
- do not reset/stash/clean/delete unrelated work

# CLAUDE OWNERSHIP

Claude should concentrate on **GUI / visual-product behavior / real-browser acceptance**, where screenshot-driven review is especially useful.

## C1. #572 — Cycle ruler/default pitch regression — ACTIVE FIRST

Owner: **Claude**

Goal:
- Cycle 100% is a readable, stable default presentation.
- At 100%, prefer **1 cycle per normal ruler interval / readable cycle labeling**, not the current compressed `0,2,4,...` presentation as the default visual grammar.
- `Fit All` may compress/thin labels, but `100%` must restore the normal Cycle pitch exactly.
- Clarify/remove the unexplained outline-level control when it has no useful context.
- Verify fresh load and Cycle -> Transaction -> Combined -> Cycle.

Important:
- Keep semantic time shared; this is Cycle view presentation policy.
- Do not hard-code an isolated `cycle * px` semantic mapping.
- Do not change Transaction/Combined geometry merely to make Cycle look wider.

Real browser:
- 1672x941
- 1280x720
- horizontal scroll at 100%
- Fit All -> 100% restoration
- cycle numbers/grid/waveform exact alignment

## C2. #573 — Combined stacked Transaction-over-Cycle UX — AFTER #572; coordinate with #561

Owner: **Claude**

Current product decision:

```text
Combined center
  Transaction timeline (upper)
  ----------------------------- horizontal splitter
  Cycle waveform (lower)
```

More importantly:

```text
Cycle time axis = master presentation in Combined
Transaction start/end/phase source cycles
  -> shared TimeGeometry
  -> stretched/projected onto exactly the same Cycle X axis
```

User intent:
- select/read a high-level Transaction above;
- inspect the detailed per-Signal behavior directly below over the same cycle interval.

Required visual/product behavior:
- same source cycle = same X in upper/lower panes;
- Transaction bar/Phase boundaries line up with Cycle ruler/grid;
- horizontal zoom/scroll is one shared owner;
- vertical scrolling remains independent;
- lower Cycle ruler/grid makes the correspondence visually obvious, not merely numerically equivalent;
- Transaction pane must not use an independent fixed pitch;
- Bottom/Inspector follows Active Context.

Coordination rule:
- #561 is Codex-owned architecture work. Before touching shared pointer/pane ownership files, re-read #561/main and avoid same-hunk collision.
- If #561 is actively editing the same owner/module, Claude should work on non-conflicting Combined presentation/acceptance pieces or wait for that commit rather than duplicating ownership.

## C3. #554 — Independent User Journey re-audit — AFTER bounded blockers progress

Owner: **Claude (independent acceptance / adversarial reviewer)**

Run from fresh/generic documents with visible Production GUI only.

Do not use completed sample fixtures as authoring proof.

Priority journeys:
- Transaction zero-to-usable workspace
- Group/Lane/Phase/Linked Signal lifecycle
- Undo/Redo + Save/Open
- Cycle -> Transaction -> Cycle
- Transaction -> Combined -> Transaction
- Combined shared-time correspondence

When a concrete defect is found:
- reproduce twice where practical;
- search existing Issue first;
- update existing owner or file one bounded Issue;
- do not bury implementation inside #554 unless the defect is truly audit-only.

## C4. #568 — Broad visual / exploratory QA — AFTER C1/C2 or when waiting on dependency

Owner: **Claude for discovery/review pass**

This Issue is discovery-only: do not modify Production code under #568.

Use it when Claude is waiting on a Codex-owned architecture dependency or after C1/C2 stabilization.

Focus on real-browser use, screenshots, interaction defects, and deduplicated Issue triage. Avoid spending the task merely rerunning the full automated suite.

# CODEX OWNERSHIP

Codex should concentrate on **architecture / semantic command / pointer ownership / performance / bounded core implementation**.

## X1. #561 — Cycle/Transaction interaction-owner boundary — ACTIVE FIRST

Owner: **Codex**

- Scope Cycle and Transaction pointer/gesture ownership by pane root.
- Remove foreign-mode selector blacklists as the ownership mechanism.
- Combined/Split arbitration explicit.
- Real pointer mode-switch acceptance.

This is a foundation for #573; finish/push bounded changes promptly so Claude can consume them.

## X2. #565 — Cycle Transition reorder + D&D

Owner: **Codex**

- Correct semantic reorder: Value/Duration/Comment travel with Transition.
- Recompute Start/End from new order.
- Move Up/Down and D&D converge on one semantic reorder path.
- Multi-selection block semantics, one History unit, Save/Open.

This is largely independent from #572/#573 and is suitable for parallel work.

## X3. #556 — Transaction drag performance / local preview

Owner: **Codex**

- local preview only during pointermove
- no canonical/history/minimap/diagnostic publish per pointermove
- cache geometry at drag start
- RAF coalescing
- actual performance counters and browser trace

Coordinate with #561 owner boundaries before touching overlapping pointer modules.

## X4. #163 — Semantic Command / History / ChangeSet final closure

Owner: **Codex**

Finish only remaining measured closure items. Do not rebuild foundations already proven.

## X5. #549 — Cursor A/B runtime/geometry cleanup

Owner: **Codex**

One gesture owner; no per-pointermove full ruler DOM scan/sort; shared TimeAxis/Snap/DisplayTimeMapping geometry.

# HOLD / DEPENDENCY / PRODUCT NOTES

- **#571 Transaction Bookmark + TimeGroup/Axis Break integration** remains open, but #415 is still explicitly skipped by the user. Do not silently reactivate #415. Work on #571 only where existing shared mapping already supports it; if completion requires #415, report the dependency instead of implementing a Transaction-local workaround.
- **#570 Product spec** remains authority/reference, not a parallel code owner.
- **#205 Annotation acceptance** remains incomplete; Standard/Custom Measurement is blocked by virtualized overlay stable-identity/selection acceptance. Do not burn repeated cycles on `last()`-style test workarounds. A bounded overlay-identity owner should be created/used before retrying closure.
- **#555, #559, #562, #563** are now CLOSED. Do not keep them in active task queues; preserve their behavior and file narrow regressions if user journeys fail.
- **#415** remains explicitly skipped until the user re-enables it.

# COLLISION / HANDOFF POLICY

1. One Issue = one implementation owner.
2. Before starting an Issue, read latest `origin/main`, Issue body and latest comments.
3. Before editing a shared owner/module, check whether the other agent is currently assigned an Issue likely to touch the same file/hunk.
4. If genuine same-hunk collision exists, do not both patch it. The dependency owner lands first; the other agent rebases/continues afterward.
5. Small adjacent tests/docs are not a reason to block work, but do not overwrite another agent's uncommitted changes.
6. Commit/push bounded logical changes frequently so the other agent can consume them.
7. Add implementation/evidence to the owning Issue.
8. Independent reviewer should attempt the Production GUI journey rather than trusting implementer-authored tests alone.

# Recommended parallel start

```text
Claude: #572 Cycle ruler / 100% presentation
Codex : #561 interaction-owner boundary
```

Then:

```text
Claude: #573 Combined master-Cycle-axis UX
Codex : #565 Transition reorder/D&D
```

Then:

```text
Claude: #554 independent Journey re-audit / #568 exploratory QA
Codex : #556 performance -> #163 -> #549
```
