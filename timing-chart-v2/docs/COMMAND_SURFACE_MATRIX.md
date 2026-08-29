# V2 Command-Surface Matrix

This matrix is the production contract for alternate UI entry points. A check
means that the surface is an intentional entry point; it does not require the
surface to have identical wording or layout. Every checked entry must route to
the listed semantic command family and use the listed precondition/history
policy.

The machine-readable source is `COMMAND_SURFACE_CONTRACTS` in
`packages/ui/src/index.ts`. The unit test rejects incomplete or contradictory
rows.

| Logical command | Ribbon | Context menu | Keyboard | Tree | Inspector | Bottom | Canonical command | History policy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rename | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | `signal.rename` / `group.rename` / `annotation.updateProperties` | one operation |
| Delete | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | `selection.delete` | one operation |
| Visibility | ✓ | ✓ | — | ✓ | ✓ | ✓ | `signal.setVisibility` | one operation |
| Reorder | ✓ | ✓ | — | ✓ | — | — | `signal.move` / `group.move` | one operation |
| Undo/Redo | ✓ | — | ✓ | — | ✓ | ✓ | `history.undo` / `history.redo` | one operation |

Unsupported cells are intentional and must not be silently enabled by a
surface-specific handler. Adding a new checked cell requires a corresponding
real-browser parity test and an explicit command route.

## Invariants

- Supported entry points converge on the same semantic command family.
- Enablement is based on the same selection/precondition policy.
- A mutating operation creates one canonical commit, one validation, one
  history entry, and one ChangeSet.
- View-only presentation changes do not alter Canonical, History, or Dirty.
- This matrix does not authorize removal of any existing entry point.
