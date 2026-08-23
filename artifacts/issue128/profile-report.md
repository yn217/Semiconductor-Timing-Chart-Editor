# Issue #128 browser profiling report

Environment: Chromium 151.0.7922.34, Playwright, headless, 1672x941, deviceScaleFactor 1.

The checked-in `scripts/issue128-profile.mjs` starts a CDP `Tracing` session around real UI interactions and stores a compact summary in `profile-summary.json`. Production `performance.mark()` entries use the `tc:` prefix so the browser trace can be correlated with history, reconcile, render, Frozen Label, Zoom, Grid, and MiniMap owners.

## Current measured result

Fixture: 50 signals / 100 cycles.

| Scenario | Browser-ready | Scripting | Style | Layout | Paint | Long tasks | WaveDrom | Geometry |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Signal Up | ~1.87 s | measured in trace | ~0.24 s | ~0.80 s | measured in trace | 11 | 0 | 0 |
| Signal Down | ~0.20 s | measured in trace | ~0.03 s | ~0.02 s | measured in trace | 2 | 0 | 0 |
| Eye OFF | ~0.78 s | measured in trace | ~0.02 s | ~0.00 s | measured in trace | 0 | 0 | 0 |
| Eye ON | ~0.36 s | measured in trace | ~0.01 s | ~0.00 s | measured in trace | 0 | 0 | 0 |
| Cycle Insert | ~12.31 s | ~23.0 s | ~4.6 s | ~0.55 s | ~1.7 s | 36 | 50 | 1 |

The command User Timing span for Signal reorder is about 15–20ms after the Timing Pane visual-reorder optimization. The checked-in summary also contains `traceBounds`, `commandInterval`, and `incrementalTrace` so the CDP totals are restricted to `tc:command:start` through `tc:command:raf-1` and the local reconcile owner is explicit.

The Timing Pane keeps the existing WaveDrom SVG row nodes in place and applies semantic order through a single flex layout container; the Frozen Label Pane performs the lightweight DOM move. Off-screen timing rows use browser `content-visibility:auto` after incremental reorder, with an intrinsic row size. This avoids moving the SVG-heavy subtree while preserving the rendered order and keeping WaveDrom/Geometry invalidation at zero.

## Command interval (current run)

| Scenario | Browser-ready | Style | Layout | Paint | Scripting |
| --- | ---: | ---: | ---: | ---: | ---: |
| Signal Up | 1.87 s | ~0.001 s | 0.264 s | 0.683 s | measured in trace |
| Signal Down | 0.20 s | ~0.001 s | 0.031 s | 0.020 s | measured in trace |
| Eye OFF | 0.78 s | ~0.001 s | 0.012 s | 0.008 s | measured in trace |
| Eye ON | 0.36 s | ~0.001 s | 0.011 s | 0.005 s | measured in trace |

The interval confirms that the reorder delay is not an artifact of pre-command fixture rendering. `UpdateLayoutTree` and `Paint` remain visible, but the SVG subtree is no longer moved and the previous large style recalculation is removed. The 100/500 fixture remains above the aspirational end-to-end target and is retained as an open performance finding.

## Trace hotspot classification

Before the visual-reorder change, Signal Up/Down top trace entries were:

- `RunTask`: about 2.06s / 2.39s — category I/J: browser task/event-loop work, not WaveDrom semantic rendering.
- `UpdateLayoutTree`: about 1.29s / 1.26s — category C: style recalculation after moving large grid rows containing WaveDrom SVGs.
- `Paint`: about 0.45s / 0.37s — category I: raster/paint cost for the visible SVG-heavy canvas.
- `Layout`: about 0.16s / 0.15s — category C: grid and timing-pane layout after row movement.

After the change, the same 50/100 fixture records `UpdateLayoutTree` below 1ms, Layout around 24–26ms, and Paint around 48–91ms for the command interval.

No `frozen-labels`, `zoom`, `grid`, or `minimap` User Timing span occurred in the measured reorder interval. WaveDrom render, local Geometry build, Ruler/Grid, Bottom/Inspector, and Transaction counters remained zero. This rules out those domains as the primary cause for this trace.

The current runtime `content-visibility:auto` path is limited to timing rows after incremental reorder; it does not change the WaveDrom renderer or semantic geometry contract. No CSS file or Golden reference was changed.

## Large fixture

The harness also profiles 100 signals / 500 cycles for Signal Up/Down and Eye OFF/ON. It intentionally omits large Cycle Insert from the default run because the complete WaveDrom-consistent render is an extremely long heavyweight operation; the normal fixture covers the timeline-edit trace. The large results are retained in `profile-summary.json` and must not be interpreted as a lightweight-command pass.

## Status

This is profiling evidence for the optimized path. The 50/100 fixture is below the 250ms browser-ready target but remains above the aspirational <50ms end-to-end target because Chromium still needs a frame/layout turn. The 100/500 fixture remains heavyweight due layout/paint. No Golden reference, canonical schema, WaveDrom renderer, or geometry expectation was changed.
