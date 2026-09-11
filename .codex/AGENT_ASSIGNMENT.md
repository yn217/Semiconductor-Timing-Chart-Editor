# Claude / Codex Issue Ownership

Last reconciled: 2026-09-12 07:45 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main: `45661c7e56511df7ca2de68687c055ebacb67a95`
Authoritative queue: `codex-control:.codex/ISSUE_ORDER.txt`

Claude is currently unavailable. Codex is authorized to execute GUI / UX / QA / product work as well as Core / Runtime / Performance work. One Issue has one active implementation owner at a time.

## Shared architecture
- `Canonical -> Semantic Commands / History -> Projection -> Renderer -> DOM`
- one logical mutation = one semantic operation = one History unit
- stable opaque IDs; no array-index/name identity
- view-only operations keep Canonical/History/Dirty delta = 0
- DOM/ruler pixels are not semantic authority
- `source time -> DisplayTimeMapping -> TimeAxisGeometry/LocalGeometry -> screen`
- no Golden/reference/threshold/mask weakening merely to pass

## Current Codex task list

1. **#555 — P0 Transaction Group Journey blocker**
   - Fresh-document GUI must support Transaction -> Group assignment.
   - Left Tree drag/drop + discoverable `Move to Group` menu.
   - Bottom/Inspector share the same Semantic Command owner.
   - Multi-select, Ungroup, cross-surface sync, Undo/Redo, Save/Open.

2. **#554 — P0 User Journey re-audit**
   - Fresh/generic document; no sample-fixture shortcut for authoring proof.
   - Current Transaction status: Group create/rename progressed, assignment/move is blocked by #555; Lane 3 path still unproven; Phase/Links/selection/persistence/cross-mode journeys remain partially proven.
   - File bounded P0/P1 bugs when a Journey cannot be completed; do not convert a blocker into an audit-only PASS.

3. **#550 — Transaction Group composite update closure**
   - Planner fix landed in `b5e8e9f`.
   - Remaining: exact Undo/Redo and GUI-path evidence; then close if full acceptance is met.

4. **#551 — Transaction Phase resize closure**
   - Reject-on-phase-clip policy landed in `ae6faee` / `29c3619`.
   - Remaining: Production pointer/preview rejection UX, successful non-clipping resize History proof, cross-surface consistency.

5. **#553 — Transaction Bottom bulk checkbox closure**
   - Dedicated checkbox column/Select All/indeterminate landed in `a4316e4`.
   - Remaining: active-vs-bulk selection isolation, checked-ID bulk commands, responsive browser evidence, checkbox-only semantic zero deltas.

6. **#552 — Annotation list virtualization closure**
   - Core virtualization/model-index keyboard navigation landed in `45661c7`.
   - Remaining: 1k/5k/20k real-browser scaling and mounted-row/latency/view-only invariants.

7. **#163 — Semantic Command / History / ChangeSet final closure**
   - Remaining only: History storage scaling decision/evidence, rejected-command adapter transient effects, final cross-adapter/ChangeSet audit.

8. **#549 — Cursor A/B runtime/geometry cleanup**
   - One gesture owner; no per-pointermove full ruler DOM scan/sort; shared TimeAxis/Snap/DisplayTimeMapping geometry.

## Explicitly skipped
- **#415** — OPEN but explicitly skipped by user. Do not auto-promote.

## Recently completed / preserve
- **#429** Transaction Mode visual/product closure — CLOSED.
- **#548** Transaction MiniMap incremental correctness — CLOSED.
- **#463** Transaction large-workspace performance/invalidation — CLOSED.
- Earlier completed broad GUI foundations should not be reopened merely for another audit; #554 should produce narrow regression Issues when real journeys expose gaps.

## Journey policy

Focused tests and fixture rendering are evidence, but not sufficient proof of authoring capability.

For user-editable workflows, acceptance should prefer:

`New/generic document -> visible Production GUI operations -> Undo/Redo -> Save/Open -> mode switch -> final state verification`

A closed historical feature Issue does not block fixing a reproducible journey defect. Conversely, do not rebuild Canonical/Semantic Command foundations where the missing piece is only the Production interaction route.

## Worktree / collision policy
- Codex implements on `main`; reads `codex-control` as read-only.
- Never merge/cherry-pick `codex-control` into `main`.
- No reset/stash/clean/delete of unrelated work.
- Inspect dirty hunks; only genuine same-hunk unsafe conflict may defer a bounded change.
