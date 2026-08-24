# ADR 0010: RowLayout and stable-surface update domains

- Status: Accepted for Phase 5
- Date: 2026-08-25

## Decision

`projection` derives one RowLayout from canonical group order, visibility,
global row height/spacing, Group spacing, Signal spacing, and Spacer height.
Absolute row Y is never persisted. The projection publishes canonical IDs,
visible IDs, and Left/Frozen/Timing surface IDs; the three visible surface lists
must be exactly equal and in the same order.

`renderer` owns lightweight shell nodes separately from signal-owned WaveDrom
owners. Lightweight shells may move in DOM order. Heavy owners remain in their
creation order and receive only `translateY` updates when rows reorder. A
WaveDrom render or Local Geometry build occurs only for a new owner or a
`waveSemantics` invalidation.

Virtualization mounts viewport plus overscan and pinned timing Signals. Leaving
the window detaches the owner but retains its node/cache identity. Re-entry
reattaches the same SVG without rendering or rebuilding Geometry. An invalidated
unmounted Signal remains dirty until it is mounted and refreshed.

## Consequences

- Signal reorder changes row shells and affected Y positions only.
- Visibility and viewport changes do not mutate Canonical order or duplicate
  visibility state.
- Comment and Spacer rows participate in all semantic shell ID lists but never
  request WaveDrom SVG ownership.
- Deleted Signals dispose their WaveDrom owner; hidden or virtualized Signals
  retain it.
- Render counters expose WaveDrom, Local Geometry, row-position, and overlay
  update domains for browser acceptance.
