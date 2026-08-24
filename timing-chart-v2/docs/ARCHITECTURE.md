# V2 Architecture Contract

## Package responsibilities

| Unit | Authoritative responsibility |
|---|---|
| `apps/editor` | Composition root only; wires ports and lifecycle |
| `schema` | Persisted format contracts, stable ID types, migration/serialization boundary |
| `core` | Sole canonical document owner and canonical validation contracts |
| `commands` | Semantic command dispatcher and ChangeSet contract used by every input path |
| `history` | One-entry-per-commit Undo/Redo contract; never owns a second document model |
| `wavedrom-adapter` | Canonical signal to temporary WaveJSON, WaveDrom SVG, and local geometry boundary |
| `geometry` | Semantic/local geometry contracts and screen-transform primitives |
| `projection` | Derived render projection, visible rows, screen geometry, and minimap projection |
| `renderer` | Stable waveform surface, row placement, overlays, interaction preview, render counters |
| `ui` | React shell contracts; receives only the semantic command port for document edits |
| `export` | Independent document-to-SVG/PNG/PDF projection boundary |
| `testing` | Cross-package fixtures, invariant helpers, and performance counter expectations |

## Runtime flow

```text
React UI / keyboard / pointer / AI / API
  -> SemanticCommandDispatcher
  -> canonical validation and one Core commit
  -> one HistoryEntry + one ChangeSet
  -> ProjectionService
  -> Renderer update domains

Canonical signal
  -> WaveDromAdapter.toWaveJson
  -> pinned WaveDrom render
  -> WaveDromAdapter.extractLocalGeometry
  -> ScreenGeometry projection
```

The renderer never receives `CanonicalMutationPort`. UI never receives Core
state mutation APIs. WaveDrom Adapter owns no persistent state.

Phase 6's Minimal Cycle View composes these ports in `apps/editor`. Its row
selection and viewport are transient view state: they do not dispatch a
semantic command, create a History entry, or alter the canonical revision.
Cycle ruler positions come from the reference-clock Local Geometry Map.

Phase 7's Signal Editor reads the selected Signal from the current canonical
snapshot. Form drafts are transient component state. Submit dispatches one
typed Semantic Command; Event End/Duration are derived and never persisted.

Phase 8 drag state belongs to the view and exists only for the active native
drag gesture. A successful drop dispatches `signal.move` or `group.move` once;
drag end without drop dispatches nothing. Visibility remains solely
`Signal.display.visible` in the canonical document.

Phase 9 Timeline selection is transient and half-open. Insert/Delete ripple
canonical positions; Duplicate creates deterministic clone IDs; Move preserves
existing IDs through a cycle permutation. Bookmark and Time Group remain the
canonical owners for Marker and Collapse/Gap semantics.

Phase 10 stores only semantic Annotation anchors and pixel offsets in the
canonical document. Geometry owns the immutable snap index; Renderer owns the
stable overlay DOM and pointer preview. A completed pointer gesture dispatches
one Annotation command, while cancel dispatches none.

Phase 11's Ribbon, tree routes, Inspector, Bottom Editor, context menu, and
keyboard shortcuts converge on one UI Command Registry. Inspector forms own
only transient drafts; Apply, Enter, or blur dispatches one semantic command.
The single global keyboard owner classifies editable/modal/gesture scopes and
does not route composition events. Problems are recomputed from canonical
validation and resolve their paths back to stable canonical selections. Panel,
tab, selection, zoom, and document-properties state are view-only and never
enter canonical History. Clock edge labels are renderer-owned projections of
actual Local Geometry and do not regenerate WaveDrom.

Phase 12 keeps Transaction ranges, lanes, and stable Signal links in the same
canonical document and source timeline. Every edit is a semantic command;
Timeline ripple uses the Phase 9 atomic transform and pointer snapping uses the
Phase 10 geometry index. Transaction and Split views read the same rendered
ruler positions and viewport scroll/zoom as Cycle View. Export reads the full
canonical document (never mounted DOM), builds a deterministic ExportScene,
serializes stable SVG using the pinned WaveDrom conversion contract, and derives
PNG/PDF outputs from that scene. Export settings are one-shot view state.

## Render-domain policy

- Reorder: row order and screen Y only; WaveDrom/local-geometry deltas are zero.
- Signal semantic edit: affected signal waveform/local geometry and dependents.
- Annotation style: affected overlay only.
- Scroll/zoom: screen projection and visible viewport only.
- Range pointer move: interactive preview only; pointerup emits one command.

## Mechanical enforcement

The boundary gate reads the allow-list and state owner registry in
`architecture/`, scans package manifests and source imports, restricts
WaveDrom imports to its adapter, rejects legacy/other-product runtime imports,
and keeps domain packages free of browser/UI ownership. Unit tests verify owner
uniqueness and the pinned WaveDrom version. Playwright verifies the browser
composition boundary can start before production GUI work begins.
