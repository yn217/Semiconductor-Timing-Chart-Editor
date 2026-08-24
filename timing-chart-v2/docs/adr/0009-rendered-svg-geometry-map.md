# ADR 0009: Local Geometry comes only from rendered WaveDrom SVG

- Status: Accepted for Phase 4
- Date: 2026-08-25

## Decision

Local Geometry extraction runs only after a WaveDrom SVG is mounted. Cycle
start/center/end anchors come from WaveDrom's rendered cycle-grid lines.
Transition start/center/end come from the actual primary-stroke path segments
inside the referenced default-skin brick. Rising/falling clock anchors come
from rendered `pclk`/`nclk` brick uses. Bus value-start is the end of its actual
transition path; an initial value starts at the rendered cycle boundary.

The extractor reads two matrices per affected SVG: one for the cycle-grid owner
and one for the waveform brick owner. All anchor points are projected from
those batched matrices and SVG attributes. It does not call `getScreenCTM()` or
`getBoundingClientRect()` per point and contains no fixed pixels-per-cycle
constant.

`ImmutableLocalGeometryMap` is keyed by stable Signal ID, source cycle, and
semantic anchor point. A lookup for another or missing Signal owner fails.
Persisted pixel offsets are applied to the resolved Local point without
mutating base geometry.

## Consequences

- A detached or structurally invalid WaveDrom SVG is rejected explicitly.
- Half-cycle-aligned WaveDrom phase is supported. Finer phase is rejected
  before rendering because exact anchor ownership cannot be preserved.
- Screen coordinates, scrolling, zoom, RowLayout Y, and stable-surface
  placement are not Local Geometry and remain Phase 5+ concerns.
- Geometry build and matrix-read counters allow later renderer tests to prove
  that reorder causes zero Local Geometry rebuilds.
