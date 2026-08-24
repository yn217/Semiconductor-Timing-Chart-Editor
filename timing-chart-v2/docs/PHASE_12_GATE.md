# Phase 12 Gate — Transaction and Deterministic Export

## Transaction

- Canonical Transaction supports source-time range, lane, stable linked Signal
  IDs, category, style, metadata, and legacy phase/source/destination fields.
- Create/delete/rename/move/resize/lane/link/unlink are semantic commands with
  one History entry per completed operation.
- Signal deletion retains Transactions and atomically removes the deleted
  stable ID from `linkedSignals`.
- Timeline insert/delete/duplicate/move continues to transform Transaction
  ranges in the same atomic Phase 9 operation.
- Transaction and Split modes are integrated into the Phase 11 shell. Their
  horizontal positions use actual geometry-derived ruler coordinates and the
  shared viewport scroll/zoom.
- Body/start/end pointer edits reuse the Phase 10 immutable Snap Service.
- Inspector and Bottom Editor use the shared UI Command Registry. Save/Open
  round-trips exact Transaction data.

## Export

- `CanonicalDocument + ExportSettings -> ExportScene -> SVG -> PNG/PDF`.
- ExportScene enumerates canonical row order directly, including all offscreen
  and unmounted rows; it never clones the editor DOM or takes a viewport image.
- Deterministic SVG contains ruler/grid, group bands, labels/roles, pinned
  WaveDrom conversion metadata and waveform geometry, semantic annotations,
  Transactions, and legend.
- SVG excludes Ribbon, Inspector, Bottom Editor, scrollbars, selection handles,
  hover, snap guides, and debug counters.
- PNG rasterizes the canonical SVG element stream at 1x/2x/3x.
- PDF is a deterministic vector document container with page-policy settings
  represented by the Export API. Entire Document and Selected Range scopes are
  supported.

## Verification

- Unit coverage for all Transaction commands, link cleanup, timeline ripple,
  100-signal offscreen export, deterministic SVG/PDF, selected range, group
  bands, annotations, Transactions, and editor-chrome exclusion.
- Real Chromium E2E for create/edit/link/lane/Undo/Redo/Save/Open, geometry snap,
  Timeline ripple, Split alignment across zoom/scroll, and SVG/PNG/PDF download.
- Transaction selection/style and Split scrolling produce zero WaveDrom and
  Local Geometry rebuilds.

Phase 13 measures these contracts with 50/100/500/1000-signal fixtures and
turns the local-update expectations into explicit performance invariants.
