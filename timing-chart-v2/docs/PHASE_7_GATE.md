# Phase 7 Gate — Signal Editor

## Objective

Add a selection-following Signal context editor without introducing a second
document model or UI-specific mutation path. Every accepted editor action must
use a typed Semantic Command and produce one canonical validation, commit,
History entry, and ChangeSet.

## Delivered

- Bottom Signal Editor following stable `signalId` row selection.
- Signal name, role, and bus display-format properties.
- Event Table centered on canonical Start and Value.
- Derived End and Duration display; neither field is persisted.
- Atomic Start + Value + Comment row replacement.
- Event insertion/replacement and removal while retaining schema validity.
- Binary quick values `0 / 1 / X / Z`.
- Bus quick values for Hex, Binary, Symbol, X, and Z entry.
- Clock Generator form for start, integer period, duty, half-cycle phase,
  initial value, polarity, and suppressed period slots. Exact non-50% duty is
  expanded through standard WaveDrom tokens when the integer period contains
  the requested half-cycle boundaries; finer values are rejected atomically.
- Undo/Redo and dirty/history/revision status in the editor composition.
- Inline command rejection messages with no state mutation.

## Command and render contracts

Phase 7 adds typed commands for:

- atomic value-change replacement;
- value-change movement and removal;
- signal properties;
- Clock Generator semantics.

Name and role edits update lightweight row presentation only. Value, bus
format, and Clock Generator edits invalidate only the affected waveform and
Local Geometry. Event End and Duration remain derived UI values.

## Browser acceptance

Chromium verifies:

- row selection opens the matching Signal Editor;
- Event Table Start/Value and derived End/Duration are correct;
- one atomic event edit produces one revision and one History entry;
- only the edited signal receives one WaveDrom render and one geometry build;
- unrelated SVG identity remains unchanged;
- Undo restores exact event semantics and enables Redo;
- name/role changes update row shells with zero waveform regeneration;
- Clock Generator edits produce one semantic History entry and one affected
  waveform/geometry update.

## Verification

- Architecture boundary and state-owner gates.
- 54 unit/schema/command/history/conformance/geometry/projection tests.
- Nine Chromium E2E tests, including four Signal Editor contracts.
- Strict TypeScript, production build, and dependency audit.

Phase 8 Reorder / Visibility / Drag-and-Drop remains deferred. No legacy
runtime, Golden, sample, or reference asset is changed by Phase 7.
