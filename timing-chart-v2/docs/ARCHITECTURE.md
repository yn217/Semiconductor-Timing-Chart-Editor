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
