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

The complete pre-V2 GitHub Issue universe is recorded in
[`v1-v2-source-manifest.json`](./v1-v2-source-manifest.json). It was enumerated
from all repository Issues (`state=all`, filtered to issue number `< 161`),
including closed, superseded, canceled and umbrella Issues; PR-only numbers
are excluded. The current capture contains 155 Issues. The parity checker
compares that manifest with both the matrix coverage and the contract
assignments; an Issue cannot be silently removed from both the inventory and
its assignment list.

The `independentContracts` section prevents acceptance loss through broad
grouping. It separately tracks Split View, Hardware Hierarchy/Full Path/Scope,
Canvas Cycle Selection, Range Selection, Grid, Snap, Ruler, MiniMap,
Inspector, Bottom Pin/Follow Selection, Advanced JSON, Header/Footer, Editable
Legend, Clock Edge Counter, Axis Break, Bookmark, Time Group, Measurement,
Threshold Anchor, Timing Region/Ghost Trace, Clipboard semantics, Golden
Samples, and Export. Each currently has `status: OPEN_GAP` unless its evidence
is complete.

`legacyIssueAssignments` maps every issue in `legacyIssueCoverage` to at least
one contract ID. Run `npm run check:parity` (also included in `npm run check`
and `npm run check:ci`) to fail on any unmapped issue, unknown owner,
unclassified decision, stale source manifest, or MERGED row without evidence.

## High-Risk GUI section

| ID | Capability | Decision | V2 owner | Current evidence / gap |
|---|---|---|---|---|
| GUI-01 | Multi-group feature-rich Ribbon | KEEP | #176 | Home now exposes File, History, Clipboard, Edit, Selection, Visibility, Arrange, Timeline, View, Properties, Review and Export groups with existing semantic/view handlers; Chromium layout checks verify the 12-group high-density surface and stable ribbon/workspace geometry. V1 tab labels and group captions are restored without changing English compatibility names or command routing (`gui-v1-home-vocabulary.spec.ts`). Save As now opens a real filename dialog and downloads the canonical document under the requested name (`full-gui.spec.ts`). At 1024px File, History, Clipboard, Edit, Selection, Visibility, Arrange and all View commands (Zoom/Fit/Grid/Snap/Ruler/MiniMap) are reachable through the More Home Commands menu without Ribbon scrolling; 1280px retains the direct V1-compatible surface (`ribbon-responsive-overflow.spec.ts`). Replacement Pack perceptual diff and complete command matrix remain open. |
| GUI-02 | Signal/Group tree and organization | KEEP | #172/#178 | Derived tree supports DOM-only filtering by display name, path, role and group while retaining stable IDs and canonical state; dedicated Group headers, row role/visibility controls and Hardware Hierarchy browser are present. The Tree Add surface now exposes Signal/Clock/Bus/State/Group/Comment Row through `UiCommandRegistry → semantic.execute`, with one canonical revision/history entry. The 330px V1 pane default now has a bounded 280–420px view-only splitter; `gui-left-pane-resize.spec.ts` verifies the derived tree/frozen-label/waveform offsets and zero mutation. Real-browser evidence is in `full-gui.spec.ts` and the V1-compatible header surface is visually checked. Full V1 tree visual parity remains open. |
| GUI-03 | Direct timing canvas interaction | KEEP | #165/#167/#170 | Batch 2A/2B is covered by `timeline-editor.spec.ts`: real waveform-surface cycle click, exclusive terminal boundary, geometry-backed half-open drag, Shift extension, reverse-range normalization and Escape preview cancel. Canonical/History/Dirty remain unchanged throughout view-only interaction. The locked `gui-visual-acceptance.spec.ts` also verifies the V1-sized local waveform viewport geometry; V8 reference mode derives the Screen Geometry width from the full center column after the frozen label column and applies the same scale to ruler/grid screen positions, with `gui-reference-v8.spec.ts` gating the expanded wave owner. Pixel-level V1 parity remains open. |
| GUI-04 | Signal/Group/Clock/Annotation/Transaction Inspector | KEEP | #172/#176 | Signal/Annotation/Group/Transaction editors use active transient drafts and semantic Apply. Clock now also exposes common Signal Properties, Source/Hierarchy, Label Style and Waveform/Timing sections through the existing `signal.updateProperties` command, alongside its Generator and Edge Counter editors. With no selection, the Inspector now exposes editable Global Row height and Signal spacing through `document.updateLayout`; Group and Value/Clock Signal Inspectors expose independent transient `spacingBefore`/`spacingAfter` fields through `group.updateProperties` and `signal.updateProperties`. The derived Projection invalidates RowLayout on `geometryScreenY` and repositions stable rows without WaveDrom regeneration. `full-gui.spec.ts`, `layout-inspector.spec.ts` and `signal-spacing.spec.ts` verify one History entry per Apply, Undo/Redo, combined global/group/signal spacing, Save/Open exact values and SVG/PNG/PDF signatures. The right Inspector retains the V1 300px default plus bounded 240–420px view-only resize. Full visual parity remains open. |
| GUI-05 | Bottom Context Editor | KEEP | #172/#176/#178 | Batch 1C verifies independent Pin/Follow and Advanced JSON, restores the dense Signal Event Table toolbar (Add Row, Duplicate, Delete, Import, Export and Preview Update), and restores the Clock Bottom context toolbar (Presets, Duplicate, Import, Export and Preview). The approved V8 visual state now selects `clk` by stable ID and places that compact Clock toolbar at the top of the Bottom editor; generic drag/property controls remain available in normal editing and Inspector surfaces. Clock Presets/Import are transient drafts, Export/Preview are view-only, and Duplicate routes through the shared stable-ID batch command with one History entry. The V2 GUI contract now has a bounded center-column Bottom splitter (180–420px) with view-only resize and collapse/reopen; the Bottom tab strip is restored to the V1 38px height. The Annotation context now exposes a dense V1-style table with Type, Start, End, Label/Text, Target and X/Y columns; stable-ID row selection routes back to the shared selection owner without Canonical/History/Dirty/render mutation (`annotation-bottom-list.spec.ts`). Annotation JSON Import replaces the annotation collection through `document.replace`, reselects a stable imported ID, and is verified through Save/Open with History reset. `signal-editor.spec.ts` and `gui-reference-v8.spec.ts` verify the Clock toolbar labels, V8 initial selection, view-only counter invariants, and one-history Duplicate operation in a real browser. Geometry matches the approved V8 layout exactly; full pixel parity remains open. |
| GUI-06 | Interactive MiniMap | KEEP | #167/#175/#178 | MiniMap derives a proportional viewport indicator from the actual scrollable range and supports click-pan plus pointer-drag pan with view-only invariants. It now renders a dense derived waveform overview for every canonical row using normalized screen fractions; `full-gui.spec.ts` verifies row/segment coverage and zero Canonical/History/render mutation. Large-document scaling and full V1 visual parity remain open. |
| GUI-07 | Status Bar | KEEP | #172/#176 | Batch Status Bar: `Ready`, signal/annotation/problem counts, half-open Time Range, Cycle, Zoom, Snap, Mode, revision/history/dirty and WaveDrom state are derived in the production footer. `full-gui.spec.ts` verifies the view-only counter invariant; visual artifact `gui-batch-shell-dut-1672x941.png` confirms the dense 27px layout. Full V1 reference diff remains open. |
| GUI-08 | Cycle/Transaction/Split selector | KEEP | #172 | Cycle exposes Signal/Annotation/Problems/JSON; Transaction exposes Transaction/Annotation/Problems/JSON; Split exposes both Signal and Transaction contexts. V1 Ribbon labels `Transaction` and `Check` are restored while retaining internal compatibility keys for existing command routing. Mode switching preserves Canonical/History/Dirty/render counters; `gui-v1-ribbon-labels.spec.ts` verifies the label and view-only invariant, and `gui-split-view-visual.spec.ts` captures the 1672x941 Split composition with zero mutation. Current-main `transaction-export.spec.ts` also verifies canonical Split content Save/Open plus the shared Split ExportScene producing valid SVG/PNG/PDF outputs containing both signal and transaction layers without editor mutation. |
| GUI-09 | Grid/Snap/Ruler | KEEP | #165/#170/#175 | Batch 2C adds geometry-derived grid lines and gates annotation/transaction snapping on the real Snap ON/OFF state. Snap ON resolves rendered candidates; Snap OFF uses free geometry. The Axis Break mapping closure makes Ruler, Grid and Snap share source↔display geometry, skips hidden folded cycles, and preserves canonical source-cycle anchors. Current-main focused evidence includes mapping unit/export coverage, Chromium axis-break compression, exact Time Group Save/Open, multiple folds, folded export, and 100k-cycle/1k-fold scale checks. Ruler/MiniMap visibility toggles remain view-only with zero Canonical/History/Dirty/WaveDrom/LocalGeometry delta. The locked V1 visual run also applies reference-sized local ruler/waveform geometry without changing semantic coordinates; full pixel parity remains open. |
| GUI-10 | Hardware hierarchy / Full Path / Scope | KEEP | #177/#178 | Batch 1D adds RowLayout path metadata, Scope breadcrumb, stable-ID Reveal and atomic bulk registration; current batch adds a derived high-density Hardware Hierarchy browser with stable-ID selection. `full-gui.spec.ts` now saves and reopens after atomic bulk registration and verifies both full paths remain present with History reset to 0. Full hierarchy visual parity remains open. |
| GUI-11 | Signal styling and editable Legend | KEEP | #162/#172/#176 | Signal display style, alignment and overflow now flow through Projection to derived row presentation; style-only Apply avoids WaveDrom/LocalGeometry rebuilds. Editable Legend now exposes stable-ID row controls for label, visibility and order, applies through `legend.update`, and is covered by real-browser plus visual evidence (`timing-chart-v2/.tmp_gui_reference/gui-batch-legend-editor-1280x720.png`). Full V1 visual/export parity remains open. |
| GUI-12 | Clock editor and Edge Counter | KEEP | #164/#172 | Inspector and Bottom Clock editors expose editable Start, Period, Duty, Phase, Initial and Polarity plus independent Edge Counter settings (Rising/Falling/Both, Count From, explicit Bookmark anchor, interval and offsets) through separate SemanticCommands. `countFrom=marker` requires a persisted `edgeCounter.anchorId` that resolves to the selected Bookmark; no implicit earliest-Bookmark fallback is allowed. Real-browser coverage verifies one History entry, Undo, and no WaveDrom/local-geometry rebuild for counter-only edits. Full origin matrix and V1 visual parity remain open. |
| GUI-13 | Problems/JSON/Annotation/Transaction tabs | KEEP | #163/#166/#172 | Batch 1C verifies Advanced JSON Selected Object/Whole Document validation and Apply. Selected Object now covers Signal, Group, Annotation and Transaction through stable-ID-preserving `document.replace`; Group selection plus Save/Open history reset is covered by `bottom-context.spec.ts`. Full tab parity remains open. |
| GUI-14 | Follow Selection / Pin | KEEP | #172/#176 | Batch 1C verifies Pin freezes context independently while Follow Selection remains a separate tab-follow state. |
| GUI-15 | Zoom/Fit/navigation | KEEP | #167/#172/#176 | View Ribbon now exposes 50/100/150/200% Zoom presets in addition to Zoom ±. Fit Selection uses ruler-derived geometry; Fit All returns the shared viewport to the document origin with view-only Canonical/History/WaveDrom/LocalGeometry invariants. Keyboard viewport pan (Arrow/Page/Home/End) remains covered. Full V1 navigation and visual parity remain open. |
| GUI-16 | Clipboard/reorder commands | KEEP | #161/#169/#172/#176 | Clipboard now snapshots multi-selected Signals with source Group/index metadata; Copy is view-only, while multi-selection Paste/Duplicate/Cut use one atomic Semantic batch with fresh stable IDs. Full V1 visual/Save-Open parity remains open. |

The current-main Bottom contract refresh is covered by
`timing-chart-v2/tests/e2e/bottom-context.spec.ts` (5/5 Chromium): Pin and
Follow Selection remain independent, pinned Group JSON context does not mutate
Canonical/History/Dirty/render state, Selected Object JSON uses one command,
and Whole Document JSON remains read-only until Advanced mode and validation.
The complete V1 visual matrix remains open.

The Header/Footer export refresh is covered by the current-main Chromium
checks in `timing-chart-v2/tests/e2e/transaction-export.spec.ts`: canonical
metadata is preserved through Save/Open and emitted in SVG, PNG and PDF, and
long metadata remains present under A4 portrait Fit Page and landscape Fit
Width. The full V1 reference-layout comparison remains open.

The editable Legend refresh is covered by the current-main `full-gui.spec.ts`
browser flow: stable entry label, visibility and ordering changes survive
Save/Open, the SVG contains the ordered visible labels, and the shared
ExportScene also produces valid PNG and PDF outputs. The complete V1 legend
style/fit reference matrix remains open.

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

## v8 GUI migration evidence

The approved v8 pack is fixed at `references/v2-gui-reference-v8/`. The
Bottom Context Editor now exposes real command-backed Signal Event actions for
Presets, Duplicate, Import, Export, and Preview using the shared SVG sprite.
Preview and Presets remain view-only; Duplicate and Import use the existing
semantic command path. Browser evidence is in
`timing-chart-v2/tests/e2e/gui-reference-v8.spec.ts` and
`timing-chart-v2/tests/e2e/signal-editor.spec.ts`; v8 shell geometry and
counter invariants are asserted without changing the WaveDrom adapter or
canonical architecture.

The visual-reference route now uses an independent V2 canonical fixture that
matches the approved Golden's ten-row hierarchy (Input, Internal Control and
Output), three comment rows, stable role presentation and reference clock
shape. It is selected only by the `visual-reference` query parameter; the
normal production fixture and runtime architecture are unchanged. Browser
evidence remains in `timing-chart-v2/tests/e2e/gui-reference-v8.spec.ts`.

The same visual-reference fixture now presents the approved English shell
vocabulary (`Signals / Groups`, `Time Scale: Cycle`, `Reference: clk`,
`Signal Editor`, `Annotations`, `Checks`, and `Follow Selection`) while the
normal V2 surface retains its existing product vocabulary. This is a
presentation-only reference route; no canonical command or persistence path
is forked.

The V8 reference view also exposes the Golden shell vocabulary and context
headers (`Signals / Groups`, `Role`, `Signal / Annotation`, `Time Scale`, and
`Reference`) plus the dense English Bottom Editor tabs and Follow Selection
control. These are visual-reference presentation states only; the normal V2
surface continues to retain the product's existing labels and all commands.

GUI-02 tree parity evidence also includes the header-level More menu with
view-only Expand All Groups, Collapse All Groups, and Clear Filter actions.
These actions operate only on derived tree presentation state and are
browser-verified with Canonical revision, History and Dirty deltas of zero.

## Batch evidence update

Comment Row export parity is verified for the current batch: the body is
emitted as a derived purple label at the shared waveform origin, while the
Comment Row remains excluded from WaveDrom waveform generation. Unit coverage
is in `tests/export/deterministic-export.test.ts`; browser coverage is in
`tests/e2e/full-gui.spec.ts` and `tests/e2e/transaction-export.spec.ts`.
PNG and PDF inherit the same ExportScene path. Full V1 export visual closure
remains open.

Split View parity was also extended in this batch: Home retains the Signal
command groups and exposes Add/Duplicate/Delete Transaction actions while
Split is active. The actions use the existing SemanticCommand path and are
covered by `tests/e2e/transaction-export.spec.ts`; full V1 visual closure
remains open. The same suite now exports from an active Split View and asserts
that the canonical ExportScene contains both stable signal and transaction
layers while Canonical, History, and render counters remain unchanged.

The Home Ribbon now exposes an explicit V8 major-surface grouping layer for
File, Edit, Layout, Time, Zoom and Options, with Display represented as its
own nested presentation subgroup. Existing History,
Clipboard, Selection, Visibility, Arrange, Properties, Review and Export
command groups remain reachable inside those surfaces; the grouping layer is
presentation-only and does not introduce a second command owner. Browser
evidence and the no-scroll assertion are in
`timing-chart-v2/tests/e2e/gui-reference-v8.spec.ts` and the Ribbon tab and
responsive tests.

The current-main Clipboard audit is browser verified by four focused
`home-command-surface.spec.ts` cases (4/4, 2026-09-06): same-document Copy is
view-only and Duplicate/Paste allocate fresh IDs through one command; opening
another document rejects the foreign clipboard atomically; and Annotation and
Transaction payloads with colliding foreign Signal IDs report the structured
`CLIPBOARD_FOREIGN_DOCUMENT` diagnostic without retargeting or mutation. The
full V1 clipboard Save/Open and large-selection matrix remains open.

The Group Inspector now reflects the selected Group's derived collapse state
and can toggle that state from the Inspector. This is intentionally a
view-only layout operation: the browser test
`timing-chart-v2/tests/e2e/reorder-visibility.spec.ts` verifies that the
Canonical revision, History, WaveDrom and LocalGeometry counters remain
unchanged while the Tree and Inspector stay synchronized.

Axis Break and Time Group parity is now explicit in the shared ExportScene and
the production browser path. Collapsed Time Groups produce derived paired
boundary marks with stable Time Group IDs, source `[start,end)` metadata and
the same display-time X mapping used by the compressed ruler and WaveDrom
lanes. Current-main focused Chromium evidence is 4/4 for axis compression,
folded export, exact Time Group Save/Open and multiple independent folds;
`time-mapping-scale-closure.spec.ts` adds 2/2 production scale cases for
100,000 cycles with 0 folds and 1,000 folds. The mapping/export unit suites
pass 14/14 and 19/19 respectively. `tests/export/deterministic-export.test.ts`
and `timing-chart-v2/tests/e2e/export-fold-mapping.spec.ts` verify that
respecting folds emits the boundary layer while Expand emits none; source time
and canonical state remain unchanged. Full V1 visual/reference closure remains
open.

Ghost Trace export parity is now derived from the source signal's WaveDrom
wave tokens and shared source/display mapping. ExportScene emits a stable
polyline with source signal and cycle-offset metadata, and SVG/PNG/PDF share
that overlay path. Unit coverage is in
`timing-chart-v2/tests/export/deterministic-export.test.ts`; browser export
coverage is in `timing-chart-v2/tests/e2e/transaction-export.spec.ts`.
The complete V1 visual trace matrix remains open.

Signal individual spacing parity is now wired for Value and Clock rows. The
Inspector keeps `spacingBefore` and `spacingAfter` as transient drafts and
applies them through `signal.updateProperties`; the Planner emits only the
affected downstream screen-Y rows, leaving WaveDrom and Local Geometry
unchanged. Unit coverage is in
`timing-chart-v2/tests/commands/semantic-commands.test.ts`, and real-browser
coverage including Undo/Redo and Save/Open is in
`timing-chart-v2/tests/e2e/signal-spacing.spec.ts`. Comment Row spacing and
full V1 visual parity remain open.

Spacer Row lifecycle parity is now implemented through the Group Inspector.
Add, height update, and delete are separate stable-ID SemanticCommands and
use derived RowLayout screen-Y invalidation without WaveDrom or Local Geometry
rebuilds. Projection now includes newly inserted rows during row-order updates,
so a visible Spacer is mounted immediately rather than waiting for a scroll
event. Unit coverage is in
`timing-chart-v2/tests/commands/semantic-commands.test.ts` and
`timing-chart-v2/tests/projection/row-layout.test.ts`; browser coverage is in
`timing-chart-v2/tests/e2e/spacer-row.spec.ts`. Full V1 visual parity remains
open.

Comment Row spacing parity is now part of the dedicated Bottom Context Editor.
`spacingBefore` and `spacingAfter` remain transient until Apply and are
committed together with title/body by `commentRow.update`; downstream screen-Y
rows are invalidated through the existing derived RowLayout path, with no
WaveDrom or Local Geometry rebuild. Unit coverage is in
`timing-chart-v2/tests/commands/semantic-commands.test.ts`, and browser
coverage including Save/Open is in
`timing-chart-v2/tests/e2e/full-gui.spec.ts`. Full V1 visual parity remains
open.

Event and Pulse lifecycle parity is now covered in the production Insert Ribbon
and Tree Add surfaces. Each type is created as a stable canonical ValueSignal,
edited through the shared Signal Event Table and SemanticCommand path, rendered
through the existing WaveDrom adapter, and verified through Undo/Redo, Save/Open
and SVG/PNG/PDF export in `timing-chart-v2/tests/e2e/event-pulse-lifecycle.spec.ts`.
The compatibility policy explicitly distinguishes Event data-domain markers,
Pulse logic tokens, X/Z states and weak-drive logic tokens; full V1 visual parity
remains open.

Group Band presentation is now owned by the Group Inspector and shared
ExportScene. Show Background, Background, Opacity, Scope (label/waveform/both),
Border enable/color and Header remain transient until one
`group.updateProperties` Apply. Export band bounds derive from RowLayout group
membership, including per-Group/per-Signal spacing and Spacer rows, and SVG,
PNG and PDF share the same scoped fill, opacity and stroke semantics. Unit
coverage is in `timing-chart-v2/tests/export/deterministic-export.test.ts`;
browser coverage is in `timing-chart-v2/tests/e2e/group-band.spec.ts`.
On current main `548114e`, the focused Chromium run is 3/3: the complete
style/persistence/export flow, invalid-opacity draft atomicity, and valid-draft
preview/cancel restoration all pass. The first flow also verifies Undo/Redo,
Save/Open, SVG/PNG/PDF signatures and unchanged WaveDrom/LocalGeometry
counters. The production implementation is anchored at `4f8822e`.
Full V1 visual parity remains open.

The independent clock edge-counter contract is also current-main browser
verified in `timing-chart-v2/tests/e2e/edge-counter-compact.spec.ts` (3/3,
2026-09-06): all controls remain reachable in the compact grid, the narrow
bottom-editor layout has no horizontal clipping, and an explicitly selected
later Bookmark remains the persisted `countFrom=marker` anchor through
Undo/Redo and Save/Open. The coordinate-dependent selected-edge scenario was
not executed; the full V1 visual/reference matrix remains open.

Annotation primitive evidence is also current-main browser verified in
`timing-chart-v2/tests/e2e/annotation-presentation.spec.ts` and
`annotation-multiline-and-export-shapes.spec.ts` (4/4, 2026-09-06): Marker,
Callout and Bracket have distinct production presentation, multiline Callout
text survives into exported SVG tspans, Bracket exports cap marks, and Marker
exports a vertical tick. The Golden Sample 14 visual/reference matrix remains
open.

The type-aware Annotation presentation audit also passes 3/3 in current-main
Chromium (`annotation-presentation-controls.spec.ts`): Range Stroke/Fill
changes are canonical, rendered and exported; Vertical Line exports a
full-height dashed line; and Text exposes Stroke/Fill as disabled with a
truthful reason. Lock interaction and the remaining Golden Sample 14 matrix
stay explicitly open.

Bookmark navigation and editing are current-main browser verified by the two
focused `timeline-editor.spec.ts` cases (2/2, 2026-09-06): Previous/Next
navigation reaches a geometry-backed Bookmark without changing Canonical or
History, and Bottom Bookmarks editing preserves name/cycle/comment through
Save/Open while delete followed by Undo restores the entry. The full bookmark
visual/export matrix remains open.

The current-main Hierarchy/Full Path route is browser verified by the focused
`full-gui.spec.ts` case (1/1, 2026-09-06): Scope breadcrumb, Group/Hierarchy
view switching, path filtering, stable-ID Reveal, atomic bulk registration,
and Save/Open preservation of the registered full paths all pass. The
dedicated hierarchy export view and complete V1 tree visual matrix remain
open.

The current-main Inspector capability audit is browser verified by five
focused `full-gui.spec.ts` cases (5/5, 2026-09-06): Annotation, Signal,
Group, Transaction and Clock draft/apply paths complete through the shared
semantic owners, with Signal Save/Open and the Group draft synchronization
covered. The full cross-context visual/export matrix remains open.

## Dedicated parity children from the 2026-09-05 specification-leak audit

The broad annotation and timeline rows remain in the inventory, but they do
not absorb the following narrower V2 contracts. These are independent
machine-readable rows in `v1-v2-parity.json`, each with an explicit parent,
legacy source and immutable Golden Sample mapping. Their status is deliberately
open until the child Issue's complete production and acceptance evidence is
available.

| Contract | V2 owner | Parent | V1 source | Golden Sample | Historical V1 visual inputs | Current state |
|---|---|---|---|---:|---|---|
| `GUI-TRANSITION-ARROW` | #375 | `ANNOT-01` | #10, #68 | 15 | `timing-chart-v1/artifacts/issue10/dependency-arrows.png`; `timing-chart-v1/artifacts/issue68/issue68-1672x941.png` | partial production route/marker evidence; full lifecycle/export closure open |
| `GUI-RULER-LABEL-ANCHOR` | #376 | `TIME-01` | #111 | 16 | `timing-chart-v1/artifacts/issue111/issue111-1672x941.png` | standalone create/edit/list/delete lifecycle landed; complete coexistence, export and closure evidence remains open |
| `GUI-ANNOTATION-PRIMITIVES` | #377 | `ANNOT-01` | #40, #69 | 14 | `timing-chart-v1/artifacts/issue40/annotation-1672x941.png`; `timing-chart-v1/artifacts/issue69/issue69-1672x941.png` | type-specific presentation exists; direct lifecycle/persistence/export matrix open |
| `GUI-ANNOTATION-PRESENTATION` | #378 | `ANNOT-01` | #40, #69 | 14 | `timing-chart-v1/artifacts/issue40/annotation-1672x941.png`; `timing-chart-v1/artifacts/issue69/issue69-1672x941.png` | shared style/offset paths exist; full capability matrix and lock/z-order/multiline closure open |

The parity checker requires these four child rows, verifies their parent/V1
source/Golden mappings, and keeps their status rows synchronized with
`v1-v2-contract-status.json`. This prevents a later broad row or a neighboring
annotation type from silently satisfying a newly identified contract.

## Historical V1 visual artifact boundary

The repository also contains Git-managed historical V1 issue artifacts under
`timing-chart-v1/artifacts/`. A read-only inventory of the current parity
source universe found artifacts for 116 of 155 legacy Issue numbers. These
artifacts include issue-level acceptance JSON, screenshots, references and
diffs for the V1 workflows, and remain immutable.

They are historical V1 evidence, not an automatically approved one-to-one
pixel baseline for the V2 Feature Coverage samples 11–20. A V1 artifact may be
cited as a legacy reference input only after its fixture/state is explicitly
mapped to the corresponding V2 production route. Until that mapping and the
required V2 visual/export review are recorded, the relevant parity row remains
`ACCEPTANCE_ONLY` or `PARTIAL`; the existence of a V1 image must not be treated
as proof of V2 closure, and its absence must not be treated as a production
implementation gap.

### Replacement Pack and the current V2 executable reference

The legacy V1 workspace also has a `references/gui-replacement-pack/` with
locked overall and Bottom/Left-panel captures plus its production HTML/CSS/SVG
assets. Its V1 regression script compares that pack with V1's `gui-mockup` and
`ui-reference-v2` routes; it does not capture or exercise a V2 production DUT.
The pack is not a tracked asset under the current V2 `references/` directory,
so its existence cannot by itself provide a V2 Reference-vs-DUT result.

For V2, the executable comparison input is the approved
`references/v2-gui-reference-v8/` fixture and its production-browser tests.
The explicit v8 overrides therefore take precedence where the older V1 pack
differs. A V1-pack comparison can close a V2 parity row only after a mapped
V2 fixture/state, route, and unchanged-reference diff are recorded; otherwise
the row remains `ACCEPTANCE_ONLY` or `PARTIAL` pending the product decision or
evidence that the row itself requires.

#### Replacement Pack asset-by-asset mapping status

The legacy pack's six PNGs have fixed dimensions, but those dimensions do not
match the current V2 v8 shell targets. This is the concrete reason a direct
image comparison is recorded as an audit observation rather than closure
evidence.

| Legacy V1 asset | Fixed size | V2 executable counterpart | Mapping status |
|---|---:|---|---|
| `00_overall_cycle_view.png` | 1672 × 941 | `gui-visual-acceptance.spec.ts` DUT at `/?visual-reference` | Same viewport, but V2 v8 targets a 265px left pane, 1110px center and 297px Inspector; V1 overall image is not a direct V2 baseline |
| `01_left_panel_LOCKED.png` | 330 × 670 | V2 v8 Left Tree region in `gui-visual-acceptance.spec.ts` | V1 330px panel versus V2 v8 265px panel; route/state mapping and approved diff are required |
| `02_bottom_signal_LOCKED.png` | 1039 × 272 | V2 v8 center Bottom Editor | V1 signal context crop and V2 bottom region use different bounds (V2 target 1110 × 240); not directly comparable |
| `03_bottom_annotation_LOCKED.png` | 985 × 325 | V2 Annotation Bottom context tests | V1 annotation crop has no one-to-one V2 capture contract yet |
| `04_bottom_problems_LOCKED.png` | 983 × 393 | V2 Problems Bottom context tests | V1 problems crop has no one-to-one V2 capture contract yet |
| `05_bottom_json_LOCKED.png` | 983 × 440 | V2 JSON Bottom context tests | V1 JSON crop has no one-to-one V2 capture contract yet |

The V2 v8 layout metrics and browser artifacts remain the authoritative
executable evidence for the current V2 contract. The five panel rows stay
open until each has a mapped V2 fixture/state and an unchanged-reference
comparison, or an explicit product decision records why the v8 override is
the accepted replacement.
