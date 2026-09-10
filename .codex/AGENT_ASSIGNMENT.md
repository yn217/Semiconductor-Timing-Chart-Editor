# Claude / Codex Issue Ownership

Last reconciled: 2026-09-11 06:52 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main: `c051583`

One Issue has one active implementation owner at a time. Codex executes only non-comment entries in `.codex/ISSUE_ORDER.txt` on `codex-control` and implements on `main`; never merge/cherry-pick `codex-control` into `main`.

## Shared architecture
- `Canonical -> Semantic Commands / History -> Projection -> Renderer -> DOM`
- one logical mutation = one semantic operation = one History unit
- stable opaque IDs; no array-index/name identity
- view-only operations keep Canonical/History/Dirty delta = 0
- DOM/ruler pixels are not semantic authority
- `source time -> DisplayTimeMapping -> TimeAxisGeometry/LocalGeometry -> screen`
- no Golden/reference/threshold/mask changes merely to pass

## Current task lists

### Codex — Core / Runtime / Performance
1. **#163** — Semantic Command / History / ChangeSet final closure.
   - Remaining only: measured History storage scaling decision/evidence; rejected-command success-only transient effects through shared adapters; final cross-adapter/ChangeSet audit.
   - Do not redo already-complete Comment Row, Signal property, NO_OP, Dirty-read, TransactionGroup work.

2. **#548** — Transaction MiniMap incremental correctness.
   - Direct #429 blocker. Old/new lane/group invalidation, create/delete, Group color/order, timeline extent, Undo/Redo, Chromium regression.

3. **#463** — Transaction large-workspace performance/invalidation closure.
   - Previous #397 defer removed because #397 is CLOSED.
   - Existing virtualization/indexing/partition reuse stays; finish reconciled 1k/5k/10k latency/invalidation and production drag/move/resize evidence.
   - Check same-hunk ownership before touching files Claude is changing for #429 visuals.

4. **#549** — Cursor A/B drag runtime/geometry cleanup.
   - One gesture owner; no per-pointermove full ruler DOM scan/sort; shared TimeAxis/Snap/DisplayTimeMapping geometry; range clamp and browser/perf evidence.

### Explicitly skipped
- **#415** — OPEN but explicitly skipped by user. #414 is now CLOSED, but dependency readiness does not authorize execution. Do not auto-promote #415 until explicitly requested.
- #258 broad MinimalCycleView decomposition — defer while shared product surfaces remain active unless explicitly transferred.
- #495 mixed Reset Core+GUI — split/transfer bounded Core scope first.

### Claude — GUI / Product
1. **#429** — Transaction visual/product convergence. **NOW.**
   - Approved reference screenshot is product authority.
   - Focus on grouped/compact Left Tree, Group/Lane + Phase central structure, table-first Bottom with no duplicate persistent single-item editor, compact Inspector, populated MiniMap and TC ruler at 1672x941 / 1280x720.
   - Consume #548/#463 fixes; do not duplicate their projection/performance owners.

2. **#426** — Bottom Panel cross-tab consolidation after #429 unless user-visible priority changes.
3. **#431** — UX/Product Completion Epic; use to select/close concrete remaining child work, not as a monolithic Codex task.
4. Remaining GUI/product backlog such as **#403/#407/#408/#409**, **#436-#441**, **#474**, **#205** according to live issue state and current visual priorities.

## Completed since previous reconciliation
- **#414** Time Outline GUI — CLOSED
- **#416** Time Outline final GUI/Ribbon/export/E2E closure — CLOSED
- **#397** Transaction + Split sample-driven acceptance — CLOSED
- **#534** Transaction Bottom zero-state simplification — CLOSED
- **#424** Marker vertical-span GUI — CLOSED
- **#419** Highlight Snap/Free GUI — CLOSED

Do not re-add these broad completed Issues merely for another audit. File narrow regressions if concrete defects appear.

## Transaction Mode — #429
Completed foundations include #430/#450/#455/#451/#452/#453/#454/#481/#461/#530/#529/#534/#397.

Remaining:
- Codex #548 MiniMap correctness
- Codex #463 performance/invalidation closure
- Claude #429 screenshot-driven integrated visual convergence

#429 closes only after those runtime blockers are gone and the Production view substantially matches the approved reference at both target resolutions.

## Time Outline
- #412 CLOSED
- #413 CLOSED
- #414 CLOSED
- #416 CLOSED
- #415 remains OPEN but explicitly skipped. Do not infer it must run merely from historical dependency text.

## Collision rules
- Codex owns Core/schema/command/projection/runtime/performance work.
- Claude owns GUI composition/visual hierarchy/product interaction/real-browser acceptance.
- For #548/#463 vs #429, Claude consumes runtime fixes; Codex avoids visual redesign.
- Genuine same-hunk conflict may defer only that bounded work; never reset/stash/clean unrelated work.

## Implementation-first policy
`identify concrete missing behavior -> root cause -> bounded production implementation -> focused verification -> evidence/close`.
If current main already satisfies an Issue, prove it and close rather than manufacturing code.
