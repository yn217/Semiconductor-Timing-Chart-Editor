# Phase 1 Gate — Schema and Canonical Core

## Objective

Implement the complete persisted v2 contract and a DOM-free canonical Core.
Phase 1 owns parsing, normalization, v1 migration, validation, deterministic
serialization, atomic Open, and Save/Open roundtrip behavior.

## Delivered

- Draft 2020-12 JSON Schema compiled by pinned Ajv.
- Readonly TypeScript DTOs for the v2 top-level format and stable entity IDs.
- Deterministic migration of all 20 retained formatVersion 1 Golden samples.
- Canonical source-time origin fixed at zero; ranges use half-open semantics.
- Stable row membership across Signals and group-owned Spacer rows.
- Semantic validation before Core replacement or Save.
- Deterministic key ordering while preserving semantic array order.
- Deep-frozen canonical snapshots and revision-checked commits.
- Atomic Open: failed syntax, future-version, and invalid documents preserve the
  current document and revision.
- Successful Open returns one full-document-replace contract and requests
  document-specific transient reset.

## Validation coverage

- invalid and globally duplicate stable IDs;
- duplicate, orphan, and unknown row membership;
- missing cross references and invalid reference clocks;
- annotation targets that are missing or non-timing rows;
- signal, annotation, bookmark, time-group, transaction, and phase bounds;
- strict change-point ordering;
- exact bus literal width, including prefixed/unprefixed binary/hex, separators,
  X/Z positional width, leading zeroes, and symbolic values;
- NaN and Infinity;
- persisted transient/derived fields;
- unknown top-level and typed-object fields through JSON Schema.

## Migration policy

Migration is one-way and non-mutating. Legacy `cycleView.signals`,
`cycleView.annotations`, group `signals`, transaction `from/to`, label layout,
spacers, timeline gaps, and document text are projected into v2 owners.
Reference-only test metadata is reported as a warning and excluded. Unknown
future versions return a protected compatibility source and never replace the
active document.

## Deferred to Phase 2+

- Signal/Group/Timeline Semantic Command implementations
- command planning, inverse generation, and History storage
- Dirty-state and Undo/Redo behavior
- WaveDrom adapter implementation and conformance
- renderer and production GUI

No legacy runtime, sample, Golden, or reference asset is modified by Phase 1.
