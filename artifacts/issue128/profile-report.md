# Issue #128 browser profiling report

Environment: Chromium 151.0.7922.34, Playwright, headless, 1672x941, deviceScaleFactor 1.

The checked-in `scripts/issue128-profile.mjs` starts a CDP `Tracing` session around real UI interactions and stores a compact summary in `profile-summary.json`. Production `performance.mark()` entries use the `tc:` prefix so the browser trace can be correlated with history, reconcile, render, Frozen Label, Zoom, Grid, and MiniMap owners.

## Current measured baseline

Fixture: 50 signals / 100 cycles.

| Scenario | Browser-ready | Scripting | Style | Layout | Paint | Long tasks | WaveDrom | Geometry |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Signal Up | ~1.66 s | ~2.16 s | ~1.03 s | ~0.10 s | ~0.55 s | 10 | 0 | 0 |
| Signal Down | ~1.61 s | ~2.08 s | ~1.02 s | ~0.09 s | ~0.47 s | 10 | 0 | 0 |
| Eye OFF | ~0.79 s | ~1.17 s | ~0.01 s | ~0.02 s | ~0.02 s | 10 | 0 | 0 |
| Eye ON | ~0.36 s | ~0.59 s | ~0.01 s | ~0.02 s | ~0.03 s | 4 | 0 | 0 |
| Cycle Insert | ~12.57 s | ~23.47 s | ~4.63 s | ~0.55 s | ~1.67 s | 36 | 50 | 1 |

The command User Timing span for Signal reorder is only about 55–60ms. The checked-in summary now also contains `traceBounds` and `commandInterval`, which restrict the CDP totals to `tc:command:start` through `tc:command:raf-1` instead of mixing in setup work.

## Command interval (current run)

| Scenario | Browser-ready | Style | Layout | Paint | Scripting |
| --- | ---: | ---: | ---: | ---: | ---: |
| Signal Up | 1.756 s | 1.099 s | 0.103 s | 0.532 s | 0.161 s |
| Signal Down | 1.631 s | 1.024 s | 0.096 s | 0.463 s | 0.181 s |
| Eye OFF | 0.816 s | 0.005 s | 0.017 s | 0.022 s | 0.132 s |
| Eye ON | 0.367 s | 0.014 s | 0.018 s | 0.041 s | 0.145 s |

The interval confirms that the reorder delay is not an artifact of pre-command fixture rendering: `UpdateLayoutTree` and `Paint` occur inside the command-to-first-frame interval.

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
