# Phase 13 Gate

Phase 13 is complete when all of the following are true.

- Deterministic fixture generation and median/p95 statistics have unit tests.
- Projection owns one shared mounted-row set for left, frozen, and timing
  surfaces.
- Renderer exposes read-only diagnostics for projection updates, DOM owner
  lifecycle, cache behavior, and mounted ownership.
- Selection, reorder, one-signal edit, annotation style, cancelled preview,
  scroll, and zoom satisfy their exact counter and History invariants.
- 1000×1000 virtualization and repeated Open lifecycle tests pass.
- PR and nightly/manual performance workflows are separated.
- Boundary, performance-architecture, unit, type, build, E2E, and dependency
  audit gates pass.
- Export waveforms come from pinned WaveDrom SVG rather than a fixed-pitch
  parallel renderer; browser PNG and PDF derive from the same complete SVG.

The final architecture audit rejects MutationObserver-based synchronization
and a monolithic `renderEverything` path. Canonical state remains owned by
Core; mounted rows, renderer diagnostics, and percentile summaries are
derived state with explicit owners. Performance instrumentation is
observational and cannot dispatch commands or mutate the document.
