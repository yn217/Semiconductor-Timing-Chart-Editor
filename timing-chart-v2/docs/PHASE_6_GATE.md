# Phase 6 Gate — Minimal Cycle View

## Objective

Replace the architecture probe at the default editor route with the first
read-only Cycle View over a validated Canonical Document. Preserve the Phase 5
stable waveform ownership and keep selection and scrolling outside canonical
state and History.

## Delivered

- Default Minimal Cycle View with a compact application header and status bar.
- Separate Signal Tree, frozen Role/Signal label, and waveform columns.
- Two arbitrary Signal Groups and eight input/output/internal signals.
- Exact cross-surface row ID and projected-Y alignment.
- Cycle ruler positions and waveform extent derived from the reference clock's
  Local Geometry Map, with no independent cycle-pitch model.
- One synchronized horizontal/vertical viewport with sticky label columns.
- View-only row selection identified by stable `signalId` DOM attributes.
- Viewport projection updates that do not regenerate WaveDrom SVG or Local
  Geometry.
- Phase 4 and Phase 5 probes retained at `?probe=geometry` and `?probe=stable`.

## Browser acceptance

Chromium verifies:

- all eight canonical signal IDs match across Left, Frozen, and Timing shells;
- every signal uses one projected Y position across shells and SVG owner;
- both Group boundaries and role labels are represented;
- all eight real WaveDrom SVGs are mounted;
- ruler ticks are monotonic and sourced from Local Geometry;
- row selection changes no canonical revision, History depth, render count, or
  geometry-build count;
- horizontal scrolling keeps frozen labels aligned with their heading;
- viewport scrolling preserves the exact reference-clock SVG node identity and
  causes zero waveform/geometry regeneration.

## Deferred

Signal Editor, drag-and-drop reorder, Timeline editing, Annotation tools,
Inspector, Minimap, and the full Ribbon remain later phases. Phase 6 does not
introduce an alternate document model or write path.

## Verification

- Architecture boundary and state-owner gates.
- 53 unit/schema/command/history/conformance/geometry/projection tests.
- Five Chromium E2E tests, including three Minimal Cycle View contracts.
- Strict TypeScript, production build, and dependency audit.

No legacy runtime, Golden, sample, or reference asset is changed by Phase 6.
