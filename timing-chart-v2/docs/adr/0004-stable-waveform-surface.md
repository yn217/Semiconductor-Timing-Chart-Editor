# ADR 0004: Stable waveform surface and virtualization identity

- Status: Accepted and implemented in Phase 5
- Date: 2026-08-24

Canonical row shells and heavy SVG surfaces have separate ownership. Signals,
rows, DOM owners, caches, and overlays use stable IDs. Reorder changes row order
and screen Y without regenerating or moving heavy waveform subtrees. Mounted
content is viewport plus overscan and pinned rows; mount identity is never a
viewport-local index.

`projection` owns derived RowLayout and emits identical visible IDs for Left,
Frozen Label, and Timing semantic shells. `renderer` may reorder those cheap
shells, but signal-owned heavy SVG nodes remain in creation order and move only
through Y transforms. Virtualization detaches and reattaches the same owner and
SVG node; a dirty unmounted signal retains its invalidation until remount.
