# Editor commit policy

This document defines when an editor action changes Canonical state and how
users can undo or discard it. A control must make its commit boundary clear;
independent drafts must not be silently committed or discarded by another
control.

| Operation | Commit boundary | Undo behavior | Cancel/revert behavior |
| --- | --- | --- | --- |
| Lightweight property choice (for example, Highlight Position Mode) | Immediately on the explicit control change | One semantic History entry per accepted change | Revert affects only other still-unapplied Inspector fields; it does not undo an accepted change |
| Signal, Transaction, or other Inspector property form | Apply | One semantic update for the form's changed fields | Revert discards only the current Inspector draft |
| Scoped Annotation editor (Anchor, Measurement, Vertical Span) | Its explicitly named Apply action | One semantic History entry for that scoped update | Leaving/reverting the Inspector discards uncommitted fields; an accepted scoped update is undone with Undo |
| Bookmark Inspector or Bottom item draft | Apply in the editing surface | One semantic update for the edited Bookmark fields | Revert/cancel discards the local draft; same-field concurrent edits require an explicit conflict choice |
| Transaction Inspector fields and shared Phase draft | Apply in the Inspector | One semantic update for the edited fields | Revert discards the current draft; Bottom remains a table/selection surface rather than a duplicate detail editor |
| Bottom transition/event row edit | Each explicit Add/Edit operation | Each accepted operation is one Undo step | Invalid input is not committed |
| Advanced JSON | Apply JSON after validation | One semantic document/object update | Cancel restores the source JSON text |
| AI proposal | Preview, then Apply | Apply records one approved semantic batch | Reject is an exact no-op |
| Canvas gesture | Successful pointer release | One semantic operation per completed gesture | Escape/pointer-cancel abandons the preview without a commit |
| View/layout-only interaction | Immediate view-state update | No Canonical History entry | Restore/reset the view control; Canonical and Dirty state remain unchanged |

## Annotation Position Mode

Highlight Position Mode is a lightweight, independently undoable semantic
choice. Changing it commits immediately and creates one History entry. Other
unapplied Inspector fields (such as label or color) remain drafts and are not
included in that command. Revert discards those drafts, not the already
accepted mode change. If the mode change is rejected by semantic validation,
Canonical state and History remain unchanged.

This scoped immediate behavior is intentional and must remain visibly
distinguishable from the Inspector form's Apply/Revert contract.
