# V2 Inspector / Bottom Editor edit-commit contract

This matrix records the current V2 interaction contract.  Alternate entry
points remain intentional; every mutation is dispatched through the shared
`UiCommandRegistry`/`SemanticCommand` path and is one canonical commit and one
history entry.

## Apply/Revert button wording (#431 P0-3)

Every Inspector Draft+Apply row below shares one generic action pair --
**Revert** / **Apply** -- via the shared `InspectorFooter` primitive
(`apps/editor/src/inspector-section.tsx`), not a type-specific label like
"Apply Signal Properties" or "Apply Transaction". The button's meaning is
identical everywhere: Revert restores the draft to the last committed value
(no command, no history entry); Apply dispatches exactly one
`SemanticCommand` for whatever entity is selected. Only `data-testid`
differs per entity (`apply-inspector-signal`, `apply-inspector-transaction`,
...) so existing tests can still target the right button; the visible text
and behavior contract are the same across Signal/Group/Transaction/
Annotation/Bookmark. Delete lives in its own section above the sticky
footer, never inside the Revert/Apply pair, on every entity that has one.

| Surface | Property/editor | Class | SemanticCommand owner | Enter | Escape/Cancel | Selection change | Invalid input |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Inspector | Signal name | Inline commit | `selection.rename` | commits form/blur | restores draft | remounts editor and discards draft | no command |
| Inspector | Signal visibility | Immediate | `selection.visibility` | n/a | n/a | already committed | browser control prevents invalid value |
| Inspector | Signal layout/style | Draft+Apply | `signal.updateProperties` | Apply form | editor remount/revert | discard on remount | command rejected; canonical unchanged |
| Inspector | Clock generator | Draft+Apply | `signal.updateGenerator` | Apply form | editor remount/revert | discard on remount | command rejected; canonical unchanged |
| Inspector | Clock edge counter | Draft+Apply | `signal.updateEdgeCounter` | Apply form | editor remount/revert | discard on remount | command rejected; canonical unchanged |
| Inspector | Group properties | Draft+Apply | `group.updateProperties` | Apply form | editor remount/revert | discard on remount | command rejected; canonical unchanged |
| Inspector | Transaction fields/phases | Draft+Apply | `transaction.update` | Apply form | editor remount/revert | discard on remount | JSON/command rejection; canonical unchanged |
| Inspector | Transaction linked-signal summary | View-only | none | n/a | n/a | resolves from the selected stable Transaction ID | no mutation |
| Inspector | Annotation fields | Draft+Apply | `annotation.update` | Apply form | editor remount/revert | discard on remount | command rejection; canonical unchanged |
| Inspector | Annotation anchor | Draft+Apply | `annotation.setAnchor` | Apply Anchor | editor remount/revert | discard on remount | command rejection; canonical unchanged |
| Inspector | Document/header/footer | Draft+Apply | `document.updateProperties` | Apply form | Cancel closes without command | closes/discards | command rejection; canonical unchanged |
| Inspector | Legend entries/settings | Draft+Apply | `legend.update` | Apply Legend | editor remount/revert | discard on remount | parse/shape error; canonical unchanged |
| Inspector | Advanced JSON | Draft+Apply | `document.restore` / selected-object command | Apply JSON | read-only until enabled; remount discards | discard on remount | parse/validation error; canonical unchanged |
| Inspector | Layout | Draft+Apply | `document.updateLayout` | Apply Layout | editor remount/revert | discard on remount | command rejection; canonical unchanged |
| Inspector | Spacer rows | Immediate per action | `spacer.create/update/delete` | Apply Height | delete/revert action | action already committed | command rejection; canonical unchanged |
| Bottom | Signal editor | Draft+Apply | `signal.updateValues` / `signal.updateProperties` | Save | editor remount/revert | discard on remount | command rejection; canonical unchanged |
| Bottom | Comment Row editor | Draft+Apply | `signal.updateCommentRow` | Apply | editor remount/revert | discard on remount | command rejection; canonical unchanged |
| Bottom | Problems | View-only | none | n/a | n/a | selection only | no mutation |
| Bottom | JSON | Draft+Apply when Advanced | `document.restore` / selected-object command | Apply JSON | read-only/default; remount discards | discard on remount | parse/validation error; canonical unchanged |
| Bottom | Transaction | Draft+Apply | `transaction.update` | Apply | editor remount/revert | discard on remount | parse/command rejection; canonical unchanged |
| Bottom | Transaction Linked Signals | Immediate per link/unlink action | `transaction.toggleSignal` | n/a | n/a | keyed to the selected Transaction ID; summary refreshes from Canonical | rejected command leaves Canonical unchanged |
| Bottom | Follow Selection / Pin | Immediate view-only | none | n/a | n/a | deterministic view state | no mutation |

## Invariants

- Immediate controls dispatch one command per interaction.
- Draft controls do not mutate Canonical while typing; Apply dispatches one
  command, and failed validation leaves the draft editable.
- Inline rename commits on Enter/blur and Escape cancels the transient draft.
- Selection changes use the keyed editor remount as the deterministic discard
  policy for unapplied drafts.
- Undo restores the same prior Canonical snapshot regardless of entry point.
- View-only Bottom operations never change Canonical, History, Dirty, or
  validation counters.
- Transaction linked-signal editing has one mutation owner in the Bottom
  Linked Signals tab. Inspector presents the same canonical links as a summary
  and navigates to that tab for edits; it never owns a second editable draft.

## History retention policy

`CommandHistorySession` retains at most 1,000 committed actions across the
combined Undo and Redo stacks.  A normal command remains one history step;
coalescing is currently disabled.  When the limit is exceeded, only the
oldest retained Undo entry is evicted.  Eviction removes a history reference
and never mutates the current Canonical document or creates a new entry.

History entries continue to use structurally shared canonical snapshot
references.  Retention accounting reports entry count and a lightweight
two-snapshot-reference estimate; it never serializes, hashes, deep-clones, or
stringifies the document.  The clean marker remains a document reference, so
Save/Mark Clean stays correct even when the saved state is older than the
retained Undo horizon.
