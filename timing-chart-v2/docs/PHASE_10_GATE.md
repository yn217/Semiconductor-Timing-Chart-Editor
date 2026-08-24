# Phase 10 Gate — Annotation and Exact Snap

## Objective

Render and edit canonical Annotation overlays independently from heavy WaveDrom
SVGs, and resolve every snap target from rendered Local Geometry rather than a
cycle-to-pixel estimate.

## Delivered

- Typed Annotation create/delete, anchor, whole-offset move, offset reset,
  label-offset, and property commands.
- Renderer-owned stable Annotation overlay surface with keyed owners.
- Text, Callout, Vertical Line, Range, Bracket, Highlight, Marker,
  Measurement, Arrow, and Dependency tools.
- Straight, orthogonal, curve, and diagonal line presentation.
- End/start/bidirectional/none Arrow heads.
- Independent endpoint handles and label drag.
- Pointer drag with transient preview and one pointerup semantic commit.
- Arrow-key 1 px nudge and Shift+Arrow 10 px nudge.
- Pointer cancel and Escape cancellation with no canonical/History change.
- Two-click transition Arrow capture: From transition, then To transition.
- Screen Geometry projector and immutable nearest-snap index.
- Geometry-owned candidate construction, tool-aware priority, and transient
  point/vertical/row/cycle-label snap guides.
- Derived Measurement cycle delta and Timeline insert/delete ripple with
  delete-range clamp policy.

## Snap sources

The snap index is rebuilt from actual WaveDrom Local Geometry and contains:

- reference and per-Signal cycle boundaries;
- Clock rising/falling edges;
- binary/logic Signal transitions;
- Bus/State transitions and value starts;
- canonical Bookmark markers;
- other Annotation anchors.

Nearest matching uses an explicit pixel tolerance. Exact coincident candidates
prefer richer semantic targets (Annotation, Marker, Clock edge, transition)
over a generic cycle boundary. A snapped anchor retains a canonical semantic
anchor plus any residual pixel offset.

## Render and history contracts

- Annotation position/style changes increment only `overlayUpdates`.
- WaveDrom render and Local Geometry build deltas remain zero.
- Re-submitting an identical overlay primitive causes no overlay update.
- Drag move is preview-only; pointerup dispatches one command. Body drag changes
  every visual offset without changing semantics; handle drag changes one
  semantic target; Reset Offset remains a separate command.
- Endpoint, label, and style operations are individually undoable.
- Overlay DOM identity is the stable canonical `annotationId`.

## Verification

- 63 unit/schema/command/history/conformance/geometry/projection tests.
- Twenty-eight Chromium E2E tests, including eight Annotation/Snap contracts.
- Browser coverage for all Annotation types, style/label offset, exact endpoint
  snap guides, 1/10 px nudge, whole move/reset, preview cancellation,
  Timeline clamp/ripple/Undo/Redo, reorder/zoom/scroll alignment, and two-click
  Arrow creation.
- Visual verification at 1672 × 941.
- Architecture boundary/state-owner gates, strict TypeScript, production build,
  and dependency audit.

Phase 11 Full Ribbon / Inspector / Bottom remains deferred. No legacy runtime,
Golden, sample, or reference asset is changed by Phase 10.
