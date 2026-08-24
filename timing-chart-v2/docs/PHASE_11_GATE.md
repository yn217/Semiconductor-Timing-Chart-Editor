# Phase 11 Gate — Full Desktop GUI

## Objective

Connect the Phase 1–10 canonical, command, projection, geometry, and renderer
services to the approved desktop shell without introducing a second document,
timeline, row-order, selection, or interaction owner.

## Delivered

- Office-style title bar, eight Ribbon tabs, Cycle/Transaction/Split mode entry,
  locked desktop panes, center-only Bottom Editor, Inspector, and Status Bar.
- File New/Open/Save/Save As, local Recent entry, Document Properties, and the
  Phase 12 Export integration point. Open uses parse/validate/atomic replace.
- A shared UI Command Registry used by Ribbon, keyboard, context menu,
  Inspector, Bottom Editor, pointer gestures, and exact-index tree D&D.
- Signal/group/annotation Inspector projections with transient drafts and one
  semantic commit on Apply or blur.
- Signal, Annotation, Problems, and generated read-only JSON Bottom tabs.
- Derived Problems filtering and stable-target navigation; diagnostics are not
  persisted.
- One focus-scope-aware global keyboard owner. Native editable shortcuts and
  IME composition take precedence over document mutation shortcuts.
- View-only panel/tab/selection/zoom state outside canonical History/Dirty.
- Clock Edge Numbers derived from actual rendered geometry as presentation-only
  state, with no WaveDrom or local-geometry rebuild.
- Replacement icon sprite reused from the approved GUI asset pack.

## Visual closure

The 1672 × 941 DUT was reviewed beside the immutable approved Signal-tab
reference. Automated browser assertions lock the Ribbon boundary, left and
right pane widths, center-only 270 px Bottom Editor, and Inspector placement.
The source Golden/reference assets were not modified.

## Verification

- Architecture boundary and unique state-owner registry checks.
- Strict TypeScript and production Vite build.
- Unit tests for shared command routing, keyboard scope, problem navigation,
  semantic edge-number commands, and prior Phase contracts.
- Chromium E2E for locked geometry, four delete routes with exact Undo,
  Inspector drafts/visibility, Problems/JSON, panel visibility, atomic
  Save/Open, Clock Edge Numbers, IME/native-edit safety, and zero-history/
  zero-WaveDrom view-only interactions.

Phase 12 must add Transaction and Export to this shell and registry. It must not
create an independent application state or timeline owner.
