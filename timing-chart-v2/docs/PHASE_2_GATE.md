# Phase 2 Gate — Semantic Command and History

## Objective

Implement DOM-free semantic editing and History while preserving one canonical
owner and the one-action/one-commit invariant.

## Delivered

- Pure TypeScript planners for Signal create/delete/rename/value update,
  Group create/delete/rename/move, Signal reorder, visibility, annotation
  anchor update, and Timeline insert/delete.
- Runtime stable-ID checks for commands and atomic batches.
- Copy-on-write candidates; planners do not mutate source snapshots.
- One Core validation and one revision-checked commit per accepted command.
- Atomic multi-command batches with one merged `ChangeSet` and History entry.
- Exact-snapshot Undo/Redo through the canonical Core boundary.
- Dirty state derived from deterministic canonical serialization, with an
  explicit clean baseline.
- Atomic rejection of invalid and no-op edits without changing canonical state,
  revision, History, Redo, or Dirty state.
- Half-open Timeline ripple across Signal change points, clock starts/enables,
  Annotation anchors, Bookmarks, TimeGroups, label anchors, Transactions, and
  phases.
- ChangeSet domains for semantic, row, geometry, overlay, and minimap updates.

## Invariants verified

- Accepted command: one validation, one commit, one History entry, one
  `ChangeSet`.
- Accepted batch: any number of pure plans, then one validation and commit.
- Reorder and visibility omit `waveSemantics` and `geometryLocal`.
- Undo restores exact canonical semantics and the clean Dirty state when the
  baseline is reached; Redo restores the accepted result.
- Failed and no-op commands preserve an existing Redo chain.
- Timeline deletion reports IDs of semantic ranges removed by the ripple.

## Timeline policy

Edit intervals use integer source-cycle boundaries and half-open `[start, end)`
semantics. Fractional persisted semantic positions remain supported. Deletion
clamps positions inside the interval to its start, preserves the value active at
the deleted end, removes empty ranges, and retains at least one cycle. Untyped
constraints block Timeline ripple until a typed transformation contract exists.

## Verification

The Phase 2 gate runs architecture checks, 35 unit/schema/command/history
tests, strict TypeScript, production build, Chromium Playwright smoke coverage,
and dependency audit. Phase 3 WaveDrom implementation is intentionally absent.

No legacy runtime, Golden, sample, or reference asset is changed by Phase 2.
