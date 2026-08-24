# ADR 0004: Stable waveform surface and virtualization identity

- Status: Accepted for Phase 0
- Date: 2026-08-24

Canonical row shells and heavy SVG surfaces have separate ownership. Signals,
rows, DOM owners, caches, and overlays use stable IDs. Reorder changes row order
and screen Y without regenerating or moving heavy waveform subtrees. Mounted
content is viewport plus overscan and pinned rows; mount identity is never a
viewport-local index. Implementation begins in Phase 5.
