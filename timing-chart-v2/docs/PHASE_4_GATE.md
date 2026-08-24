# Phase 4 Gate — Rendered SVG Local Geometry

## Objective

Extract semantic Local Geometry from actual pinned WaveDrom SVG without fixed
cycle pitch, custom trace geometry, or Screen-coordinate ownership.

## Delivered

- Immutable Local Geometry Map keyed by stable Signal ID, cycle, and anchor.
- Rendered cycle start, center, and end anchors for every complete cycle.
- Value-start and transition start/center/end from referenced skin paths.
- Rising/falling anchors for binary transitions and rendered Clock bricks.
- Bus-transition anchors from the default-skin crossover paths.
- Period and positive/negative half-cycle phase handling from rendered brick
  ownership.
- Persisted semantic-anchor pixel offset application.
- Explicit rejection of detached SVG, missing WaveDrom structure/bricks,
  unsupported transforms/skin commands, and sub-half-cycle phase.
- Geometry build and matrix-read diagnostics.

## Layout-read policy

One Local Geometry build performs exactly two `getCTM()` reads for the affected
SVG: cycle-grid owner and waveform-brick owner. Cycle and transition points then
use SVG line/path/use attributes and those matrices. There are no per-point
layout reads, `getScreenCTM()`, `getBoundingClientRect()`, or fixed
pixels-per-cycle calculations.

## Verification

- 49 unit/schema/command/history/conformance/geometry tests pass.
- Chromium verifies exact Local coordinates for cycle boundaries, transition
  path start/center/end, value start, binary rising/falling edges, period-2
  phase-0.5 Clock edges, and bus transition geometry.
- Architecture boundaries, strict TypeScript, production build, Playwright,
  and dependency audit form the full gate.

No legacy runtime, Golden, sample, or reference asset is changed by Phase 4.
Screen Geometry, RowLayout, Stable Waveform Surface, and production GUI remain
intentionally absent.
