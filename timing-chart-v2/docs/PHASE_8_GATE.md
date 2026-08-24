# Phase 8 Gate — Reorder, Visibility, and Drag-and-Drop

## Objective

Connect Signal and Group organization controls to the existing semantic move
and visibility commands while preserving stable IDs, stable SVG ownership, and
role/group independence.

## Delivered

- Native Signal drag-and-drop in the Signal Tree.
- Cross-Group Signal movement without changing `Signal.role`.
- Group drag handles on group headers and arbitrary Group reorder.
- Before/after transient drop indicators.
- Drag-end/cancel cleanup with no canonical or History change.
- Hide/Show control that follows the selected Signal even while its row is not
  projected.
- Stable detached waveform owners for hidden Signals, reattached on Show.
- One semantic commit and one History entry per successful drop or visibility
  action.

## Render contracts

- Signal/Group reorder changes row order and projected Y only.
- Visibility changes mounted/visible rows and projected Y only.
- Neither operation invalidates WaveDrom semantics or Local Geometry.
- Heavy SVG owner creation order and exact SVG object identity remain stable.
- Drag preview is transient DOM state (`data-dragging` and
  `data-drop-position`) and is never persisted.

## Browser acceptance

Chromium verifies:

- hide removes all projected shells and detaches the selected waveform;
- Show restores the exact original SVG object with zero render/build delta;
- intra-Group Signal D&D changes row order with only row-position updates;
- stable heavy-owner order and SVG identity survive Signal D&D;
- arbitrary Group D&D moves the complete Group with zero waveform/geometry
  regeneration;
- cross-Group movement updates Group membership while preserving semantic role;
- canceled drag preview clears indicators with revision and History unchanged.

## Verification

- Architecture boundary and state-owner gates.
- 54 unit/schema/command/history/conformance/geometry/projection tests.
- Fourteen Chromium E2E tests, including five Phase 8 contracts.
- Strict TypeScript, production build, and dependency audit.

Phase 9 Timeline Editing remains deferred. No legacy runtime, Golden, sample,
or reference asset is changed by Phase 8.
