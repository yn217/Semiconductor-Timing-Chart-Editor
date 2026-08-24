# Phase 3 Gate — WaveDrom Adapter

## Objective

Implement the only legal WaveDrom boundary: canonical Signal to temporary
WaveJSON, pinned default-skin rendering, SVG retrieval, conformance, and stable
signal ownership. Geometry extraction remains Phase 4.

## Delivered

- Pinned `wavedrom@3.6.2`, shared by production and conformance paths.
- Canonical logic, bus/state, and Clock conversion without persisted WaveJSON.
- Mandatory `.` continuation and change-only bus `data` materialization.
- Low/high, X, Z, weak-low/weak-high, positive/negative Clock, period, phase,
  aligned gating/suppression, and derived `|` gap support.
- Default-skin SVG rendering with stable `signalId` owner attributes and
  lifetime-stable WaveDrom render indices.
- Explicit adapter errors for unsupported or lossy conversion and render
  failures.
- Render-call and active-owner counters as derived diagnostics.
- Explicit Phase 4 failure from Local Geometry extraction; no fixed-pitch or
  custom SVG approximation exists.

## Conformance

The reference path sends independently authored WaveJSON directly to pinned
WaveDrom. The DUT path sends canonical Signal fixtures through the adapter and
then the production renderer. Tests compare generated WaveJSON and exact
default-skin SVG markup at zero coordinate tolerance.

Coverage includes:

- all 36 ordered transitions over the six supported non-clock tokens;
- persistence lengths 1, 2, 4, and 8 for every supported token;
- mandatory `0..1...0..` and `=..=...=..` fixtures;
- Clock periods 1 through 4 and phase 0.5;
- negative Clock, aligned gating, suppression, and gap behavior;
- explicit reasons for every intentionally unsupported capability;
- real Chromium verification that the SVG is a WaveDrom subtree owned by the
  expected stable Signal ID.

## Verification

The Phase 3 gate runs architecture boundaries, 46 unit/schema/command/history/
conformance tests, strict TypeScript, production build, Chromium Playwright,
and dependency audit.

The production build reports WaveDrom's upstream CommonJS `eval` warning from
an evaluator module included by its package entry point. The adapter invokes
only `renderAny`; `npm audit` reports no vulnerability. The dependency remains
pinned and any version change requires full conformance review.

No legacy runtime, Golden, sample, or reference asset is changed by Phase 3.
Phase 4 Geometry and Phase 5 stable-surface layout are intentionally absent.
