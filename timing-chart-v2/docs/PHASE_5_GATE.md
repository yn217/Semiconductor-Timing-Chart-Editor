# Phase 5 Gate — RowLayout and Stable Waveform Surface

## Objective

Separate canonical row shells from heavy WaveDrom SVG ownership and prove that
reorder changes row order/Y only.

## Delivered

- Derived RowLayout for Group, Signal, Comment, and Spacer rows.
- Global, Group, Signal, and Spacer vertical-spacing semantics without persisted
  absolute Y.
- Exact canonical-visible/Left/Frozen/Timing row-ID projection invariant.
- Viewport + overscan + pinned-row virtualization projection.
- Stable `signalId` WaveDrom owner cache independent of row/viewport indices.
- Lightweight row-shell reorder separated from heavy SVG creation order.
- ChangeSet-driven waveform invalidation with dirty-state retention while
  unmounted.
- Render-domain counters and explicit provider failure reporting.

## Browser acceptance

With two real WaveDrom SVG Signals, Chromium verifies:

- initial canonical, Left, Frozen, and Timing IDs are identical;
- after adjacent reorder all four ID sequences become identical in the new
  order;
- heavy owner DOM creation order does not change;
- both SVG nodes retain exact JavaScript object identity;
- `waveDromRenders` delta is 0;
- `localGeometryBuilds` delta is 0;
- only the two affected row Y positions change;
- viewport exit and re-entry retain SVG identity with zero render/build delta.

## Verification

- Architecture gate: 12 packages and 14 authoritative state owners.
- 53 unit/schema/command/history/conformance/geometry/projection tests.
- Strict TypeScript and production build.
- Two Chromium E2E tests: Phase 4 exact Geometry and Phase 5 stable surface.
- Dependency audit reports zero vulnerabilities.

No legacy runtime, Golden, sample, or reference asset is changed by Phase 5.
The browser composition remains an architecture probe, not the Phase 6 Minimal
Cycle View or later production GUI.
