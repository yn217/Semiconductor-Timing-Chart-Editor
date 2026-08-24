# Phase 0 Architecture Gate

## Scope

Contracts and build/test infrastructure only. Phase 1 parsing, normalization,
migration, validation, serialization, and Save/Open behavior are intentionally
not implemented.

## State ownership

Persistent canonical state is owned by `core`; saved shape is owned by
`schema`. Selection is owned by UI, hover/viewport/interaction preview by the
renderer, WaveJSON/SVG by the adapter, local geometry by geometry, and screen
geometry/minimap by projection. Problems are derived by core validation.

## Stable identity

Signal, Group, Row, Annotation, Transaction, Bookmark, TimeGroup, and Command
identities are branded stable IDs. Array indices, row/DOM positions,
viewport-local indices, names, and rendered text are forbidden identities.

## Deferred to Phase 1+

- Complete v2 JSON Schema and Ajv validation
- deterministic parse/normalize/migrate/serialize and atomic Open
- command implementations, inverses, transactions, and history storage
- WaveDrom rendering and conformance harness
- local geometry extraction and screen projection implementations
- row shells, stable waveform surface, virtualization, and browser E2E

No Golden or legacy reference asset is modified by this phase.
