# Feature Showcase Sample Inventory

The normal reload document is `transactionDemoDocument` from
`apps/editor/src/fixtures-cycle-reference-documents.ts`. It is loaded through
the same canonical parser and projection path as an opened user document.

| Feature family | Implemented/reachable | Represented in startup sample | How to inspect |
|---|---|---|---|
| Cycle signals and groups | Yes | Directly: clock, reset, input/output, bus, state, three groups | Reload, Cycle view, Signal Tree |
| Waveform transitions and values | Yes | Directly: binary transitions, bus values, symbolic state, generated clock | Cycle center and Signal inspector |
| Annotation overlays | Yes | Directly: all 16 schema/UI-enabled annotation types, including Measurement, Timing Region and Ghost Trace | Cycle view, Annotation tab, select overlay/list row |
| Annotation editing and stable identity | Yes | Directly: stable `demo_ann_*` IDs | Annotation list and Inspector |
| Bookmarks | Yes | Directly: five distinct bookmarks at cycles 4, 10, 12, 28 and 52 | Bookmarks bottom tab; Previous/Next/Reveal |
| Transaction groups and lanes | Yes | Directly: Memory, CPU, Peripheral, plus Ungrouped; lanes 0–2 | Transaction view and left tree |
| Transaction phases and linked signals | Yes | Directly: five phased transactions and one unphased transaction with stable signal links | Transaction bottom table and Inspector |
| Combined time correlation | Yes | Directly: transaction source times share the canonical timeline | Combined view; compare transaction bars with Cycle waveform |
| Inspector and Bottom editors | Yes | Directly: populated signal, annotation, bookmark and transaction records | Select an item, then switch bottom tabs |
| Save/Open persistence | Yes | Same canonical entities are serialized; focused acceptance covers reload/save/open paths | File > Save, then Open the downloaded document |
| JSON and Problems | Yes | Workspace/document tools are reachable; no intentional invalid sample problems | JSON and Problems tabs |
| Undo/Redo and command history | Yes | Workspace-only state; sample starts clean so edits are observable | Edit any sample entity |
| Zoom, grid, snap, ruler, MiniMap | Yes | Workspace-only presentation state; sample contains enough time range to exercise them | Ribbon Display/Zoom controls |
| Cursor and active range | Yes | Workspace-only state, intentionally not serialized into the showcase | Use Cycle interaction surface |
| AI context/bridge | Yes | Directly: signals, transactions, annotations and bookmarks provide semantic context | AI tab after reload |
| Experimental or blocked behavior | N/A | Intentionally omitted | Not enabled solely for showcase data |

The sample does not contain renderer-specific branches or test-only injection.
It deliberately starts in Transaction mode so the transaction hierarchy is
immediately reviewable; Cycle and Combined remain available through the normal
View Mode controls.
