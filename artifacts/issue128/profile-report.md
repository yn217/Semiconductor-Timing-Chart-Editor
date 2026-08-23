# Issue #128 browser profiling report

Environment: Chromium 151.0.7922.34, Playwright, headless, 1672x941, deviceScaleFactor 1.

The checked-in `scripts/issue128-profile.mjs` starts a CDP `Tracing` session around real UI interactions and stores a compact summary in `profile-summary.json`. Production `performance.mark()` entries use the `tc:` prefix so the browser trace can be correlated with history, reconcile, render, Frozen Label, Zoom, Grid, and MiniMap owners.

## Current measured baseline

Fixture: 50 signals / 100 cycles.

| Scenario | Browser-ready | Scripting | Style | Layout | Paint | Long tasks | WaveDrom | Geometry |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Signal Up | ~1.70 s | ~2.53 s | ~1.29 s | ~0.16 s | ~0.61 s | 10 | 0 | 0 |
| Signal Down | ~1.92 s | ~2.39 s | ~1.26 s | ~0.15 s | ~0.49 s | 10 | 0 | 0 |
| Eye OFF | ~0.85 s | ~1.27 s | ~0.01 s | ~0.02 s | ~0.37 s | 10 | 0 | 0 |
| Eye ON | ~0.39 s | ~0.65 s | ~0.01 s | ~0.02 s | ~0.07 s | 4 | 0 | 0 |
| Cycle Insert | ~14.49 s | ~26.92 s | ~5.31 s | ~0.67 s | ~1.79 s | 36 | 50 | 1 |

The command User Timing span for Signal reorder is only about 60ms. The remaining delay is after `tc:command:dom-ready` and before `tc:command:raf-1`.

## Trace hotspot classification

Signal Up/Down top trace entries were:

- `RunTask`: about 2.06s / 2.39s — category I/J: browser task/event-loop work, not WaveDrom semantic rendering.
- `UpdateLayoutTree`: about 1.29s / 1.26s — category C: style recalculation after moving large grid rows containing WaveDrom SVGs.
- `Paint`: about 0.45s / 0.37s — category I: raster/paint cost for the visible SVG-heavy canvas.
- `Layout`: about 0.16s / 0.15s — category C: grid and timing-pane layout after row movement.

No `frozen-labels`, `zoom`, `grid`, or `minimap` User Timing span occurred in the measured reorder interval. WaveDrom render, local Geometry build, Ruler/Grid, Bottom/Inspector, and Transaction counters remained zero. This rules out those domains as the primary cause for this trace.

A temporary runtime `contain: layout` experiment on `.wave-row` changed the result only marginally and is not part of Production; no visual/CSS contract was changed.

## Large fixture

The harness also profiles 100 signals / 500 cycles for Signal Up/Down and Eye OFF/ON. It intentionally omits large Cycle Insert from the default run because the complete WaveDrom-consistent render is an extremely long heavyweight operation; the normal fixture covers the timeline-edit trace. The large results are retained in `profile-summary.json` and must not be interpreted as a lightweight-command pass.

## Status

This is profiling evidence, not a closure claim. The browser confirms that #126's invalidation work removes unrelated semantic domains, but Signal reorder still exceeds the stated <50ms target because row movement triggers large style/layout/paint work. No Golden reference, canonical schema, WaveDrom renderer, or geometry expectation was changed.
