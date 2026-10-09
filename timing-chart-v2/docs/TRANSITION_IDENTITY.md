# Signal transition identity

Each Signal value change and Clock enable change has a stable `id`. New edits allocate an ID independently of `start`; editing or reordering preserves the existing ID, and duplicating creates a new one. Event-table selection, React reconciliation keys, and row metadata all use that same ID. Editor runtime rejects an unnormalized row rather than falling back to `start`.

At the v2 document boundary, missing change IDs are deterministically derived from the owning Signal ID and change position. Existing explicit IDs are retained. The canonical entity inventory includes these IDs, so an explicit duplicate within a Signal, across Signals, or against another canonical entity is rejected before the document enters runtime state. The migration does not rewrite an explicit duplicate silently.

Saving writes the normalized IDs, and subsequent Open preserves them. Undo and Redo restore the exact IDs carried by the semantic history entries.
