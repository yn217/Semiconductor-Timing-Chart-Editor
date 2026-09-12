# Claude / Codex Issue Ownership

Last reconciled: 2026-09-12 11:45 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main: `cc2cc157467e0cf948b28c04f4d08d98d7df9d4c`
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

1. **#555 — P0 Transaction Group real-user D&D blocker**
   - User re-tested the Production UI and still cannot move a Transaction between Groups by drag/drop.
   - This overrides prior focused-E2E/source-wiring claims for D&D acceptance.
   - Reproduce from a normal/generic document with actual pointer drag.
   - Audit native `draggable`/drop target hit area, nested child events, selection/gesture ownership and feedback.
   - Require Group A -> Group B, Ungrouped -> Group, same-group NO_OP, Undo/Redo, Save/Open and all-surface sync.
   - Context-menu `Move to Group` is useful but does not substitute for working D&D.

2. **#559 — Transaction Left Sidebar parity with Cycle**
   - #555 D&D is the blocking subset and must work first.
   - Continue Transaction/Group row menus, filter parity, keyboard navigation, F2/Delete, Timeline focus, multi-select/bulk actions, visibility policy and responsive evidence.
   - Prefer a shared sidebar interaction shell/grammar rather than two independent Cycle/Transaction UI systems.
   - Cycle sidebar must remain regression-free.

3. **#561 — Cycle/Transaction interaction-owner boundary**
   - Scope Cycle and Transaction pointer/gesture owners to pane roots.
   - Remove cross-mode DOM selector blacklists as the ownership mechanism.
   - Split arbitration must be explicit; test real pointer mode switches.

4. **#562 — Transaction geometry independence from Cycle DOM/runtime**
   - Refactor started in `96772ee`: Transaction lane screen-origin is captured at pointerdown.
   - Finish mode-neutral semantic time/snap geometry and prove Transaction-only operation with Cycle surface unmounted.
   - Preserve exact Split alignment; no hidden Cycle DOM dependency or new fixed-pitch truth.

5. **#563 — Cycle/Transaction workspace-state isolation**
   - Bottom-tab normalization/memory has landed; focused Bottom/mode tests are green.
   - Complete explicit per-mode pane sizing and Pin/Follow/context state ownership per the Issue.
   - Repeated Cycle -> Transaction -> Cycle and Transaction -> Split -> Transaction must restore correct state without leakage.

6. **#554 — P0 User Journey re-audit / integration gate**
   - Run after bounded blockers above are implemented enough to retry the journey.
   - Fresh/generic document; no sample-fixture shortcut for authoring proof.
   - T1/T2 remain blocked until real pointer Transaction Group D&D succeeds.
   - Lane 3, Phase/Links, selection/persistence and cross-mode journeys remain to be proven.
   - A focused/fixture PASS cannot override a reproducible user journey failure.

7. **#550 — Transaction Group composite update closure**
   - Planner fix landed in `b5e8e9f`.
   - Remaining: exact Undo/Redo and GUI-path evidence; then close if full acceptance is met.

8. **#551 — Transaction Phase resize closure**
   - Reject-on-phase-clip policy is implemented; latest main adds both-edge tests.
   - Remaining: Production pointer/preview rejection UX, successful non-clipping resize History proof, cross-surface consistency.

9. **#553 — Transaction Bottom bulk checkbox closure**
   - Dedicated checkbox column/Select All/indeterminate landed in `a4316e4`.
   - Remaining: active-vs-bulk selection isolation, checked-ID bulk commands, responsive browser evidence, checkbox-only semantic zero deltas.

10. **#552 — Annotation list virtualization closure**
   - Core virtualization/model-index keyboard navigation is on main.
   - Remaining: 1k/5k/20k real-browser scaling and mounted-row/latency/view-only invariants.

11. **#163 — Semantic Command / History / ChangeSet final closure**
   - Remaining only: History storage scaling decision/evidence, rejected-command adapter transient effects, final cross-adapter/ChangeSet audit.

12. **#549 — Cursor A/B runtime/geometry cleanup**
   - One gesture owner; no per-pointermove full ruler DOM scan/sort; shared TimeAxis/Snap/DisplayTimeMapping geometry.

## Explicitly skipped
- **#415** — OPEN but explicitly skipped by user. Do not auto-promote.

## Recently completed / preserve
- **#429** Transaction Mode visual/product closure — CLOSED.
- **#548** Transaction MiniMap incremental correctness — CLOSED.
- **#463** Transaction large-workspace performance/invalidation — CLOSED.
- **#557** Cycle Home Ribbon File/Time dead-space cleanup — CLOSED.
- **#560** Transaction Group inline rename — CLOSED.

## Journey policy

Focused tests and fixture rendering are evidence, but are not sufficient proof of authoring capability.

For user-editable workflows, acceptance should prefer:

`New/generic document -> visible Production GUI operations -> Undo/Redo -> Save/Open -> mode switch -> final state verification`

For drag/drop or pointer workflows specifically:
- actual Chromium pointer interaction is required;
- direct Semantic Command calls, synthetic DOM event dispatch, source attributes, or test fixture mutation are not equivalent proof;
- a current user-visible reproduction of failure keeps the owning Issue open even if a narrower E2E is green.

A closed historical feature Issue does not block fixing a reproducible journey defect. Conversely, do not rebuild Canonical/Semantic Command foundations where the missing piece is only the Production interaction route.

## Worktree / collision policy
- Codex implements on `main`; reads `codex-control` as read-only.
- Never merge/cherry-pick `codex-control` into `main`.
- No reset/stash/clean/delete of unrelated work.
- Inspect dirty hunks; only genuine same-hunk unsafe conflict may defer a bounded change.
