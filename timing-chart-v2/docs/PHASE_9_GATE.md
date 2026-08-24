# Phase 9 Gate — Timeline Editing

## Objective

Provide zero-based, half-open Timeline editing through Semantic Commands while
rippling every canonical owner deterministically and keeping ruler interaction
on the reference-clock Local Geometry Map.

## Delivered

- Geometry-derived ruler selection; click selects one cycle and Shift+click
  extends a half-open range.
- Insert Before, Insert After, and Insert N Cycles.
- Delete Cycle/Range with deterministic active-value joins.
- Duplicate Range at an arbitrary insertion boundary.
- Move Range to a post-removal destination by cycle permutation.
- Marker create/delete backed by canonical Bookmarks.
- Collapse/Gap range create/delete backed by canonical Time Groups and
  `axis-break` presentation.
- Geometry-positioned Marker and Gap ruler overlays.
- One validation, canonical commit, History entry, and ChangeSet per accepted
  Timeline action.

## Ripple and identity policy

- Insert/Delete ripple Signal changes, Clock starts/enables, Annotation
  anchors, Bookmarks, Time Groups, label anchors, Transactions, and phases.
- Duplicate rebuilds Value Signal cycle states, clones fully-contained semantic
  objects with deterministic stable IDs, and ripples original objects.
- Move permutes Value Signal cycle states and maps existing object positions
  without changing their stable IDs.
- A Move that would split a canonical range, or includes non-periodic Clock
  enable/suppression controls, is rejected atomically.
- Untyped Constraints continue to block every Timeline ripple operation.
- Timeline length and canonical source coordinates remain integers beginning at
  zero; ranges remain `[start, end)`.

## Render contracts

- Insert/Delete/Duplicate/Move invalidate Timeline semantics and each affected
  waveform/local geometry exactly once.
- Marker and Gap presentation updates do not regenerate WaveDrom or Local
  Geometry.
- Marker and Gap X/width values come from Local Geometry anchors; no
  pixels-per-cycle constant is used.
- Gap persistence is a Time Group presentation concern. Phase 9 renders its
  axis-break overlay without rewriting WaveDrom local geometry.

## Verification

- 58 unit/schema/command/history/conformance/geometry/projection tests.
- Twenty Chromium E2E tests, including six Timeline Editor contracts.
- Browser coverage for ruler range selection, ripple/Undo, active-value joins,
  Duplicate, Move, Marker, Gap, and render-domain deltas.
- Architecture boundary/state-owner gates, strict TypeScript, production build,
  and dependency audit.

Phase 10 Annotation / Snap remains deferred. No legacy runtime, Golden, sample,
or reference asset is changed by Phase 9.
