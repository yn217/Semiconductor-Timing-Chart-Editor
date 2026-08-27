# V1 → V2 Product Parity Matrix

Batch 0 inventory for the V2 rewrite. This is a contract inventory, not a
permission to delete V1 capability.

## Decision policy

- `KEEP`: V1 behavior remains required and needs V2 closure evidence.
- `MERGED`: the V2 architecture owner exists, but V1 acceptance still has to
  be demonstrated where the evidence columns are not complete.
- `DEFER`: not used in this inventory without explicit product approval.
- `DROP`: zero. Product/user approval is required before any removal.

The machine-readable source of truth is
[`v1-v2-parity.json`](./v1-v2-parity.json). Every requirement records:

`V1 Source`, `Requirement`, `Decision`, `V2 Owner Issue`, `Canonical Owner`,
`Command Owner`, `View Owner`, `Export Owner`, `Unit`, `E2E`, `Visual`,
`Save/Open`, `Performance`, and `Notes`.

The `independentContracts` section prevents acceptance loss through broad
grouping. It separately tracks Split View, Hardware Hierarchy/Full Path/Scope,
Canvas Cycle Selection, Range Selection, Grid, Snap, Ruler, MiniMap,
Inspector, Bottom Pin/Follow Selection, Advanced JSON, Header/Footer, Editable
Legend, Clock Edge Counter, Axis Break, Bookmark, Time Group, Measurement,
Threshold Anchor, Timing Region/Ghost Trace, Clipboard semantics, Golden
Samples, and Export. Each currently has `status: OPEN_GAP` unless its evidence
is complete.

`legacyIssueAssignments` maps every issue in `legacyIssueCoverage` to at least
one contract ID. The checker fails on any unmapped issue, unknown owner or
unclassified decision.

## High-Risk GUI section

| ID | Capability | Decision | V2 owner | Current evidence / gap |
|---|---|---|---|---|
| GUI-01 | Multi-group feature-rich Ribbon | KEEP | #176 | Home now exposes File, History, Clipboard, Edit, Selection, Visibility, Arrange, Timeline, View, Properties, Review and Export groups with existing semantic/view handlers; Chromium layout checks verify the 12-group high-density surface and stable ribbon/workspace geometry. V1 tab labels and group captions are restored without changing English compatibility names or command routing (`gui-v1-home-vocabulary.spec.ts`). At 1024px the existing command handlers remain reachable through the More Home Commands menu without Ribbon scrolling; 1280px retains the direct V1-compatible surface (`ribbon-responsive-overflow.spec.ts`). Replacement Pack perceptual diff and complete command matrix remain open. |
| GUI-02 | Signal/Group tree and organization | KEEP | #172/#178 | Derived tree supports DOM-only filtering by display name, path, role and group while retaining stable IDs and canonical state; dedicated Group headers, row role/visibility controls and Hardware Hierarchy browser are present. The Tree Add surface now exposes Signal/Clock/Bus/State/Group/Comment Row through `UiCommandRegistry → semantic.execute`, with one canonical revision/history entry. The 330px V1 pane default now has a bounded 280–420px view-only splitter; `gui-left-pane-resize.spec.ts` verifies the derived tree/frozen-label/waveform offsets and zero mutation. Real-browser evidence is in `full-gui.spec.ts` and the V1-compatible header surface is visually checked. Full V1 tree visual parity remains open. |
| GUI-03 | Direct timing canvas interaction | KEEP | #165/#167/#170 | Batch 2A/2B is covered by `timeline-editor.spec.ts`: real waveform-surface cycle click, exclusive terminal boundary, geometry-backed half-open drag, Shift extension, reverse-range normalization and Escape preview cancel. Canonical/History/Dirty remain unchanged throughout view-only interaction. Full V1 visual parity remains open. |
| GUI-04 | Signal/Group/Clock/Annotation/Transaction Inspector | KEEP | #172/#176 | Batch 1B verifies editable Signal/Clock fields through Apply; current batches add editable Annotation, Group presentation, and Transaction phase properties through semantic Apply with no WaveDrom regeneration. The right Inspector now has the V1 300px default plus a bounded 240–420px view-only splitter; `gui-inspector-resize.spec.ts` verifies resize/collapse/reopen and zero Canonical/History/Dirty/render delta. Bottom Signal Type/Bus Width and Bottom Clock Duty now use the same typed commands. Full visual parity remains open. |
| GUI-05 | Bottom Context Editor | KEEP | #172/#176/#178 | Batch 1C verifies independent Pin/Follow and Advanced JSON, and restores the dense Signal Event Table toolbar: Add Row, Duplicate, Delete, Import, Export and Preview Update. The V2 GUI contract now has a bounded center-column Bottom splitter (180–420px) with view-only resize and collapse/reopen; the Bottom tab strip is restored to the V1 38px height. The Annotation context now exposes a dense V1-style table with Type, Start, End, Label/Text, Target and X/Y columns; stable-ID row selection routes back to the shared selection owner without Canonical/History/Dirty/render mutation (`annotation-bottom-list.spec.ts`). Annotation JSON Import replaces the annotation collection through `document.replace`, reselects a stable imported ID, and is verified through Save/Open with History reset. Import uses one semantic operation; Export and Preview are view-only. Full V1 toolbar/tab visual parity remains open. |
| GUI-06 | Interactive MiniMap | KEEP | #167/#175/#178 | MiniMap derives a proportional viewport indicator from the actual scrollable range and supports click-pan plus pointer-drag pan with view-only invariants; large-document scaling and visual parity remain open. |
| GUI-07 | Status Bar | KEEP | #172/#176 | Batch Status Bar: `Ready`, signal/annotation/problem counts, half-open Time Range, Cycle, Zoom, Snap, Mode, revision/history/dirty and WaveDrom state are derived in the production footer. `full-gui.spec.ts` verifies the view-only counter invariant; visual artifact `gui-batch-shell-dut-1672x941.png` confirms the dense 27px layout. Full V1 reference diff remains open. |
| GUI-08 | Cycle/Transaction/Split selector | KEEP | #172 | Cycle exposes Signal/Annotation/Problems/JSON; Transaction exposes Transaction/Annotation/Problems/JSON; Split exposes both Signal and Transaction contexts. V1 Ribbon labels `Transaction` and `Check` are restored while retaining internal compatibility keys for existing command routing. Mode switching preserves Canonical/History/Dirty/render counters; `gui-v1-ribbon-labels.spec.ts` verifies the label and view-only invariant, and `gui-split-view-visual.spec.ts` captures the 1672x941 Split composition with zero mutation. |
| GUI-09 | Grid/Snap/Ruler | KEEP | #165/#170/#175 | Batch 2C adds geometry-derived grid lines and gates annotation/transaction snapping on the real Snap ON/OFF state. Snap ON resolves rendered candidates; Snap OFF uses free geometry. The Axis Break mapping closure makes Ruler, Grid and Snap share source↔display geometry, skips hidden folded cycles, and preserves canonical source-cycle anchors. Ruler/MiniMap visibility toggles remain view-only with zero Canonical/History/Dirty/WaveDrom/LocalGeometry delta. Full visual parity remains open. |
| GUI-10 | Hardware hierarchy / Full Path / Scope | KEEP | #177/#178 | Batch 1D adds RowLayout path metadata, Scope breadcrumb, stable-ID Reveal and atomic bulk registration; current batch adds a derived high-density Hardware Hierarchy browser with stable-ID selection. Save/Open and full hierarchy visual parity remain open. |
| GUI-11 | Signal styling and editable Legend | KEEP | #162/#172/#176 | Signal display style, alignment and overflow now flow through Projection to derived row presentation; style-only Apply avoids WaveDrom/LocalGeometry rebuilds. Editable Legend now exposes stable-ID row controls for label, visibility and order, applies through `legend.update`, and is covered by real-browser plus visual evidence (`timing-chart-v2/.tmp_gui_reference/gui-batch-legend-editor-1280x720.png`). Full V1 visual/export parity remains open. |
| GUI-12 | Clock editor and Edge Counter | KEEP | #164/#172 | Inspector and Bottom Clock editors expose editable Start, Period, Duty, Phase, Initial and Polarity plus independent Edge Counter settings (Rising/Falling/Both, Count From, interval and offsets) through separate SemanticCommands. Real-browser coverage verifies one History entry, Undo, and no WaveDrom/local-geometry rebuild for counter-only edits. Full origin matrix and V1 visual parity remain open. |
| GUI-13 | Problems/JSON/Annotation/Transaction tabs | KEEP | #163/#166/#172 | Batch 1C verifies Advanced JSON Selected Object/Whole Document validation and Apply; full tab parity remains open. |
| GUI-14 | Follow Selection / Pin | KEEP | #172/#176 | Batch 1C verifies Pin freezes context independently while Follow Selection remains a separate tab-follow state. |
| GUI-15 | Zoom/Fit/navigation | KEEP | #167/#172/#176 | Fit Selection uses ruler-derived geometry; current batch adds keyboard viewport pan (Arrow/Page/Home/End) with view-only Canonical/History/WaveDrom invariants. Full V1 navigation and visual parity remain open. |
| GUI-16 | Clipboard/reorder commands | KEEP | #161/#169/#172/#176 | Clipboard now snapshots multi-selected Signals with source Group/index metadata; Copy is view-only, while multi-selection Paste/Duplicate/Cut use one atomic Semantic batch with fresh stable IDs. Full V1 visual/Save-Open parity remains open. |

## Non-GUI V1 contract sections

The JSON inventory also covers the full product contract, including:

- versioned persistence and migration;
- signal types, roles, widths, change points and bus literals;
- group bands, spacing, label columns and layout invariants;
- markers, bookmarks, Time Groups and Axis Break;
- annotations, semantic anchors, dependencies and measurements;
- WaveDrom compatibility and geometry conformance;
- complete SVG/PNG/PDF/clipboard export;
- AI query/preview/apply boundaries;
- 20 Golden Samples and feature-coverage acceptance;
- structural performance and incremental invalidation.

The `legacyIssueCoverage` array retains every discovered pre-V2 issue number
from the repository audit. Issues are grouped by contract where one V2 owner
is appropriate; grouping does not remove the original traceability obligation.

## Architecture invariants

All future closure work must preserve:

`Canonical → Derived → DOM`

- GUI, keyboard, context menu, Inspector, Bottom Editor and AI use the same
  SemanticCommand owner.
- Stable IDs are used instead of array index, DOM position or viewport index.
- WaveDrom is used only through its Adapter.
- Semantic, Local WaveDrom and Screen Geometry remain separate.
- ChangeSet drives local invalidation.
- One completed operation has one canonical commit, one validation, one
  History entry and one ChangeSet.
- View-only actions have Canonical/History/Dirty delta zero.
- V1 runtime code is reference-only and is not copied into V2.
