# Timing Document and Scenario Ownership

This document defines the semantic ownership boundary for multiple timing
scenarios and the implementation contract for #431.

## Ownership policy

Signal definitions are shared by every Scenario in one Timing Document.
`SignalId` is therefore document-wide and stable across Scenario switches and
comparisons. A Signal is defined once; a Scenario never embeds a second Signal
definition with the same identity.

Scenario-specific timing data is owned by the Scenario and refers to shared
Signals by `SignalId`:

| Document-owned | Scenario-owned | Derived or workspace-only |
| --- | --- | --- |
| Signal definitions and stable IDs | Signal event/value streams keyed by SignalId | Check/diagnostic results |
| Signal group definitions and shared row membership | Timeline extent, reference-clock selection, and time groups | Active Scenario selection |
| Protocol definitions | Transactions, phases, and Signal links | ViewMode (Cycle/Transaction/Combined) |
| Document metadata | Annotations, Measurements, Bookmarks, Constraints | Zoom, scroll, selection, panel and splitter state |
| Shared display defaults | Scenario-specific semantic anchors and cycle positions | Temporary previews and drafts |

The Scenario's reference clock must identify a shared Signal by stable ID.
Scenario switching changes which semantic data is projected; it does not
change Signal identity or create another time-axis implementation. Cycle,
Transaction, and Combined remain projections of the same active Scenario and
shared time-mapping contract.

## Mutation rules

- Adding or editing a Signal definition affects the shared Document definition
  and is visible in all Scenarios.
- Editing a Signal's event/value stream affects only the active Scenario.
- Scenario transactions, annotations, measurements, bookmarks, constraints,
  timeline extent, and reference-clock choice are isolated from other
  Scenarios.
- Duplicating a Scenario copies its Scenario-owned semantic content, preserves
  references to shared Signal IDs, and allocates fresh stable IDs for
  Scenario-owned entities.
- Renaming a Scenario changes only its Document-level label and does not alter
  semantic entity identity.
- Deleting a Scenario cannot silently delete shared Signal definitions. A
  Document must retain at least one Scenario; the final Scenario is not
  deletable until another exists.
- Derived diagnostics are recomputed from the active Scenario and are not
  stored as canonical check results.

## Canonical and migration constraints

The current v2 canonical shape stores signals, timeline, transactions,
annotations, bookmarks, time groups, and constraints as document-level arrays.
Adding a Scenario registry beside those arrays would create two competing
semantic truths and is forbidden.

Scenario support must introduce one versioned canonical ownership model in
which each semantic collection has exactly one owner. Existing v2 documents
must migrate deterministically to one Scenario while preserving every stable
ID, event, anchor, transaction, annotation, bookmark, time group, constraint,
and reference-clock choice. Serialization and Save/Open must round-trip that
model exactly. Undo/Redo must operate through the existing SemanticCommand and
History owners; workspace selection of the active Scenario remains view state
and must not dirty the document by itself.

No feature may introduce a Scenario-local cycle scale or duplicate
DisplayTimeMapping/TimeAxis authority. Any document-format version change must
be accompanied by explicit migration, validation, resource-budget, and
serialization tests.

## Implementation status

Scenario v3 is the single semantic owner for scenario-specific data. Existing
v2 documents migrate to one Scenario; the editor can enable Scenario storage,
switch the active Scenario as workspace state, and rename, duplicate, or delete
Scenarios through the Scenario History owner. Scenario CRUD participates in
Undo/Redo; switching alone leaves Canonical revision, History, and Dirty
unchanged. Production Open/Save and Recent use the v3 model without projecting
away inactive Scenarios. The title bar exposes the active Scenario controls.
The comparison panel compares source-cycle event ranges across stable shared
Signal IDs and reports changed Signal/range pairs as derived view state; it
does not create another timeline or semantic owner.

Focused schema, History, Open/Save-boundary and Chromium lifecycle tests cover
these contracts. The broader UX epic still has independent acceptance items;
this does not claim #431 is complete.
