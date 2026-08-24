# ADR 0007: Pure semantic planning and deterministic timeline ripple

- Status: Accepted for Phase 2
- Date: 2026-08-24

## Decision

`commands` is a pure planning layer. A planner receives a canonical document
and one semantic command, then returns either an immutable candidate plus
forward/inverse `ChangeSet`s or a rejection. It does not validate or commit the
canonical store. `history` composes plans and performs exactly one
revision-checked Core commit for an accepted command or atomic batch.

Undo and Redo restore the exact accepted canonical snapshots through that same
Core commit boundary. Snapshot restoration is internal History machinery, not
an alternate user mutation path. Failed and no-op plans preserve canonical
state, History, Redo, revision, and Dirty state.

Timeline edit boundaries and counts are integers. Persisted semantic positions
may remain fractional. Insert shifts points at or after the insertion boundary
and extends ranges containing it. Delete uses half-open `[start, end)`
semantics: points inside the deleted interval clamp to its start, points at the
end survive and shift to the start, and later points shift left. Empty
TimeGroups, Transactions, and phases are removed. Label anchors lose a removed
TimeGroup owner. Timeline ripple is rejected while untyped constraints exist,
because their time-bearing fields cannot be updated safely.

## Consequences

- Atomic batches can contain several plans but produce one validation, commit,
  History entry, and merged `ChangeSet`.
- Signal reorder and visibility changes never request WaveDrom regeneration or
  Local Geometry reconstruction.
- Timeline ChangeSets include both retained and removed semantic owner IDs so
  downstream projections can invalidate stale overlays.
- Phase 3 remains responsible for WaveDrom behavior; no renderer or DOM concern
  enters command planning.
