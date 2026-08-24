# ADR 0006: Canonical v2 persistence and migration

- Status: Accepted for Phase 1
- Date: 2026-08-24

The canonical source timeline starts at zero and has an integer `cycleCount`.
Semantic positions may be finite fractional cycle values because retained
multi-clock and phase fixtures require them. Intervals are half-open
`[start,end)` and may end at `cycleCount`; point/change anchors must be before
`cycleCount`.

All renderable Signals and group-owned Spacers occur exactly once in
`signalGroups[].rows`. Stable IDs are globally unique across addressable entity
kinds. WaveJSON, SVG, screen geometry, view state, Problems, and generated edge
lists are rejected from persistence.

Format version 1 is migrated deterministically and non-destructively. Format
version 2 is validated without silent repair. Unknown future versions retain a
protected source payload and cannot replace the active document.
