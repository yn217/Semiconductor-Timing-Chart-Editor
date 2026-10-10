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

### Current-main evidence correction — 2026-10-09

For `GUI-ANNOTATION-PRESENTATION` / owner #378, the live label-placement
ordering assertion is no longer merely authored or unrun. The focused
`annotation-multiline-and-export-shapes.spec.ts` case
`annotation label placement presets move the live label between its semantic
endpoints and above/below` passed 1/1 in current-main Chromium on 2026-10-09,
with tracing disabled and a run-owned local server. It proves live rendered
positions satisfy Start < Center < End and Above < Center < Below. This
corrects the older execution note in the machine-readable row. Golden Sample
14 is retained as a legacy V1 migration/regression fixture under #777; it is
not a normative current-V2 visual baseline. This focused result does not by
itself close `GUI-ANNOTATION-PRESENTATION`: any remaining current-V2 functional,
Save/Open, export, or visual acceptance must be stated and evidenced directly,
without treating a V1 pixel comparison as a blocker.

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
Samples, and Export. The current status for each is in the machine-readable
ledger; as of the 2026-10-10 working-tree audit all 28 independent contracts
are COMPLETE with focused evidence.

### Current-release reconciliation — 2026-10-10

Some dated evidence notes below still use historical phrases such as “V1
visual parity remains open.” Those refer to the retired V1 pixel comparison,
not an active release gap. The owner decision on #1095/#1103 is to retain the
current V2 specification and accept its measured difference from the V2 v8
Golden (5.83% versus the unchanged 5% threshold). This is accepted variance,
not a threshold pass; no Golden, reference, threshold, or mask was changed.
Current V2 functional, geometry, persistence, export, and security evidence
remain binding and are recorded in `v1-v2-parity.json`.

`legacyIssueAssignments` maps every issue in `legacyIssueCoverage` to at least
one contract ID. Run `npm run check:parity` (also included in `npm run check`
and `npm run check:ci`) to fail on any unmapped issue, unknown owner,
unclassified decision, stale source manifest, or MERGED row without evidence.

## Explicit V1/V2 conflict register

These are specification conflicts, not implementation failures. Each row
records its product decision; none is represented as `DROP`, and no visual
baseline is changed to make a conflict disappear.

| ID | V1 requirement | V2 proposal/current contract | Tradeoff | Recommended resolution | Product decision needed |
|---|---|---|---|---|---|
| `CONFLICT-01` | V1 #32 favors compact split/dropdown Signal insertion and a lower-density Ribbon. | V2 #176 exposes feature-rich Home/Insert/Timeline workflows with direct Signal, Clock, Bus and State discovery, using responsive overflow where necessary. | Direct discovery improves findability but consumes Ribbon density; a compact menu preserves density but hides approved actions. | Keep the V2 semantic owners and direct supported entries, retain the V1 command vocabulary/IDs, and use the documented overflow route at constrained widths. | RESOLVED: owner decision on 2026-10-10 keeps the current V2 specification/presentation and accepts Golden difference; feature-rich Ribbon and responsive overflow remain the V2 contract. |
| `CONFLICT-02` | Historical V1 overall/panel crops have different dimensions from V2 v8. | V2 v8 is the approved current-release visual authority. | Direct V1/V2 pixel comparison would conflate intentional layout differences with regressions. | Preserve the V1 pack as history; verify current V2 functionality and V2 visual regressions. | RESOLVED: product owner approved V2 v8 as the formal replacement for the five historical panels on 2026-10-09 (#1095). No V1 panel pixel-match obligation remains. |
| `CONFLICT-03` | Existing V1 fixtures commonly assume a first/default `clk` reference identity. | V2 timeline state may use a differently named reference Clock and supports the approved clockless mode; no literal `clk` may be semantic truth. | Default-name compatibility is convenient for old fixtures, but it can silently retarget stable IDs and prevents valid clockless documents. | Preserve opaque stable-ID references, test differently named clocks, and keep clockless behavior explicit; do not synthesize a fake `clk`. | RESOLVED: the owner contract requires reference-clock identity by stable `signalId`, forbids row-index/default-name identity, and defines an explicit no-reference/clockless state. |

## High-Risk GUI section

| ID | Capability | Decision | V2 owner | Current evidence / gap |
|---|---|---|---|---|
| GUI-01 | Multi-group feature-rich Ribbon | KEEP | #176 | Home now exposes File, History, Clipboard, Edit, Selection, Visibility, Arrange, Timeline, View, Properties, Review and Export groups with existing semantic/view handlers; Chromium layout checks verify the 12-group high-density surface and stable ribbon/workspace geometry. V1 tab labels and group captions are restored without changing English compatibility names or command routing (`gui-v1-home-vocabulary.spec.ts`). Save As now opens a real filename dialog and downloads the canonical document under the requested name (`full-gui.spec.ts`). At 1024px File, History, Clipboard, Edit, Selection, Visibility, Arrange and all View commands (Zoom/Fit/Grid/Snap/Ruler/MiniMap) are reachable through the More Home Commands menu without Ribbon scrolling; 1280px retains the direct V1-compatible surface (`ribbon-responsive-overflow.spec.ts`). Replacement Pack perceptual diff and complete command matrix remain open. |
| GUI-02 | Signal/Group tree and organization | KEEP | #172/#178 | Derived tree supports DOM-only filtering by display name, path, role and group while retaining stable IDs and canonical state; dedicated Group headers, row role/visibility controls and Hardware Hierarchy browser are present. The Tree Add surface now exposes Signal/Clock/Bus/State/Group/Comment Row through `UiCommandRegistry → semantic.execute`, with one canonical revision/history entry. The 330px V1 pane default now has a bounded 280–420px view-only splitter; `gui-left-pane-resize.spec.ts` verifies the derived tree/frozen-label/waveform offsets and zero mutation. Current-main Chromium `full-gui.spec.ts` passes the hierarchy/full-path/stable-ID reveal/bulk-registration and display-name/path/role/group filter scenarios, including Save/Open history reset. The V1-compatible header surface is visually checked. Historical V1 tree pixel matching is retired by the #1095 V2 v8 replacement decision; current V2 appearance is governed by the approved v8 reference, while remaining functional/export evidence is tracked separately. |
| GUI-03 | Direct timing canvas interaction | KEEP | #165/#167/#170 | Batch 2A/2B is covered by `timeline-editor.spec.ts`: real waveform-surface cycle click, exclusive terminal boundary, geometry-backed half-open drag, Shift extension, reverse-range normalization and Escape preview cancel. Canonical/History/Dirty remain unchanged throughout view-only interaction. The locked `gui-visual-acceptance.spec.ts` also verifies the V1-sized local waveform viewport geometry; V8 reference mode derives the Screen Geometry width from the full center column after the frozen label column and applies the same scale to ruler/grid screen positions, with `gui-reference-v8.spec.ts` gating the expanded wave owner. Pixel-level V1 parity remains open. |
| GUI-04 | Signal/Group/Clock/Annotation/Transaction Inspector | KEEP | #172/#176 | Signal/Annotation/Group/Transaction editors use active transient drafts and semantic Apply. Clock now also exposes common Signal Properties, Source/Hierarchy, Label Style and Waveform/Timing sections through the existing `signal.updateProperties` command, alongside its Generator and Edge Counter editors. With no selection, the Inspector now exposes editable Global Row height and Signal spacing through `document.updateLayout`; Group and Value/Clock Signal Inspectors expose independent transient `spacingBefore`/`spacingAfter` fields through `group.updateProperties` and `signal.updateProperties`. The derived Projection invalidates RowLayout on `geometryScreenY` and repositions stable rows without WaveDrom regeneration. `full-gui.spec.ts`, `layout-inspector.spec.ts` and `signal-spacing.spec.ts` verify one History entry per Apply, Undo/Redo, combined global/group/signal spacing, Save/Open exact values and SVG/PNG/PDF signatures. The right Inspector retains the V1 300px default plus bounded 240–420px view-only resize. Full visual parity remains open. |
| GUI-05 | Bottom Context Editor | KEEP | #172/#176/#178 | Batch 1C verifies independent Pin/Follow and Advanced JSON, restores the dense Signal Event Table toolbar (Add Row, Duplicate, Delete, Import, Export and Preview Update), and restores the Clock Bottom context toolbar (Presets, Duplicate, Import, Export and Preview). The approved V8 visual state now selects `clk` by stable ID and places that compact Clock toolbar at the top of the Bottom editor; generic drag/property controls remain available in normal editing and Inspector surfaces. Clock Presets/Import are transient drafts, Export/Preview are view-only, and Duplicate routes through the shared stable-ID batch command with one History entry. The V2 GUI contract now has a bounded center-column Bottom splitter (180–420px) with view-only resize and collapse/reopen; the Bottom tab strip is restored to the V1 38px height. The Annotation context now exposes a dense V1-style table with Type, Start, End, Label/Text, Target and X/Y columns; stable-ID row selection routes back to the shared selection owner without Canonical/History/Dirty/render mutation (`annotation-bottom-list.spec.ts`). Annotation JSON Import replaces the annotation collection through `document.replace`, reselects a stable imported ID, and is verified through Save/Open with History reset. `signal-editor.spec.ts` and `gui-reference-v8.spec.ts` verify the Clock toolbar labels, V8 initial selection, view-only counter invariants, and one-history Duplicate operation in a real browser. Current-main `bottom-context.spec.ts` + `advanced-json-diagnostic.spec.ts` pass 10/10 in Chromium, covering independent Pin/Follow, pinned Group JSON, read-only-to-Advanced transition, deterministic syntax/validation diagnostics, atomic ID rejection, clipboard failure diagnostics, one-command Signal/Group Apply and Group Save/Open. The approved V2 v8 reference replaces historical Bottom-panel pixel matching; current V2 functional, interaction, persistence and export acceptance remains applicable. |
| GUI-06 | Interactive MiniMap | KEEP | #167/#175/#178 | MiniMap derives a proportional viewport indicator from the actual scrollable range and supports click-pan plus pointer-drag pan with view-only invariants. It now renders a dense derived waveform overview for every canonical row using normalized screen fractions; `full-gui.spec.ts` verifies row/segment coverage and zero Canonical/History/render mutation. Large-document scaling and full V1 visual parity remain open. |
| GUI-07 | Status Bar | KEEP | #172/#176 | Batch Status Bar: `Ready`, signal/annotation/problem counts, half-open Time Range, Cycle, Zoom, Snap, Mode, revision/history/dirty and WaveDrom state are derived in the production footer. `full-gui.spec.ts` verifies the view-only counter invariant; visual artifact `gui-batch-shell-dut-1672x941.png` confirms the dense 27px layout. Full V1 reference diff remains open. |
| GUI-08 | Cycle/Transaction/Split selector | KEEP | #172 | Cycle exposes Signal/Annotation/Problems/JSON; Transaction exposes Transaction/Annotation/Problems/JSON; Split exposes both Signal and Transaction contexts. V1 Ribbon labels `Transaction` and `Check` are restored while retaining internal compatibility keys for existing command routing. Mode switching preserves Canonical/History/Dirty/render counters; `gui-v1-ribbon-labels.spec.ts` verifies the label and view-only invariant, and `gui-split-view-visual.spec.ts` captures the 1672x941 Split composition with zero mutation. Current-main `transaction-export.spec.ts` also verifies canonical Split content Save/Open plus the shared Split ExportScene producing valid SVG/PNG/PDF outputs containing both signal and transaction layers without editor mutation. |
| GUI-09 | Grid/Snap/Ruler | KEEP | #165/#170/#175 | Batch 2C adds geometry-derived grid lines and gates annotation/transaction snapping on the real Snap ON/OFF state. Snap ON resolves rendered candidates; Snap OFF uses free geometry. The Axis Break mapping closure makes Ruler, Grid and Snap share source↔display geometry, skips hidden folded cycles, and preserves canonical source-cycle anchors. Current-main focused evidence includes mapping unit/export coverage, Chromium axis-break compression, exact Time Group Save/Open, multiple folds, folded export, and 100k-cycle/1k-fold scale checks. Ruler/MiniMap visibility toggles remain view-only with zero Canonical/History/Dirty/WaveDrom/LocalGeometry delta. The locked V1 visual run also applies reference-sized local ruler/waveform geometry without changing semantic coordinates; full pixel parity remains open. |
| GUI-10 | Hardware hierarchy / Full Path / Scope | KEEP | #177/#178 | Batch 1D adds RowLayout path metadata, Scope breadcrumb, stable-ID Reveal and atomic bulk registration; the derived high-density Hardware Hierarchy browser has stable-ID selection. Scope projection now accepts ancestor-path prefixes and Relative Path removes the selected prefix (e.g. `top.u_soc.u_dma` → `u_axi.arvalid`), covered by focused projection tests. Current-main Chromium `full-gui.spec.ts` covers all four display modes, scope filtering, stable-ID reveal, atomic two-row registration, Save/Open and History reset. Historical V1 hierarchy pixel matching is retired by the #1095 V2 v8 replacement decision; current V2 hierarchy behavior remains subject to feature, persistence and relevant V2 regression evidence. Nested RTL-specific behavior still requires separate coverage. |
| GUI-11 | Signal styling and editable Legend | KEEP | #162/#172/#176 | Signal display style, alignment and overflow now flow through Projection to derived row presentation; style-only Apply avoids WaveDrom/LocalGeometry rebuilds. PR #826 (`306d7d1`) makes the document-wide Legend a stable selectable overlay and routes Inspector Show/Used Roles/Orientation/X/Y drafts through `legend.update`; selection is transient and Apply is one semantic command. PR #828 (`62ce661`) also aligns deterministic SVG export with the editor's persisted top-left Legend position and horizontal/vertical orientation; focused export assertions were added, export package TypeScript check and parity gate pass. PR #830 adds focused Chromium evidence for Legend selection/Inspector/Apply/Undo/Save-Open and Bus Decimal/Signed/Unsigned consistency across waveform and Bottom values with Undo/Redo; Save/Open retains the authored presentation/format. Remaining approved V1 gaps: explicit persisted Anchor+Offset versus Free Position semantics (the canonical anchor/reference target is unspecified) and full V1 visual/export acceptance. |
| GUI-12 | Clock editor and Edge Counter | KEEP | #164/#172 | Inspector and Bottom Clock editors expose editable Start, Period, Duty, Phase, Initial and Polarity plus independent Edge Counter settings (Rising/Falling/Both, Count From, explicit Bookmark anchor, interval and offsets) through separate SemanticCommands. `countFrom=marker` requires a persisted `edgeCounter.anchorId` that resolves to the selected Bookmark; no implicit earliest-Bookmark fallback is allowed. Real-browser coverage verifies one History entry, Undo, and no WaveDrom/local-geometry rebuild for counter-only edits. Full origin matrix and V1 visual parity remain open. |
| GUI-13 | Problems/JSON/Annotation/Transaction tabs | KEEP | #163/#166/#172 | Batch 1C verifies Advanced JSON Selected Object/Whole Document validation and Apply. Selected Object now covers Signal, Group, Annotation and Transaction through stable-ID-preserving `document.replace`; Group selection plus Save/Open history reset is covered by `bottom-context.spec.ts`. Full tab parity remains open. |
| GUI-14 | Follow Selection / Pin | KEEP | #172/#176 | Batch 1C verifies Pin freezes context independently while Follow Selection remains a separate tab-follow state. |
| GUI-15 | Zoom/Fit/navigation | KEEP | #167/#172/#176 | View Ribbon now exposes 50/100/150/200% Zoom presets in addition to Zoom ±. Fit Selection uses ruler-derived geometry; Fit All returns the shared viewport to the document origin with view-only Canonical/History/WaveDrom/LocalGeometry invariants. Keyboard viewport pan (Arrow/Page/Home/End) remains covered. Full V1 navigation and visual parity remain open. |
| GUI-16 | Clipboard/reorder commands | KEEP | #161/#169/#172/#176 | Clipboard now snapshots multi-selected Signals with source Group/index metadata; Copy is view-only, while multi-selection Paste/Duplicate/Cut use one atomic Semantic batch with fresh stable IDs. Full V1 visual/Save-Open parity remains open. |

The current-main Bottom contract refresh is covered by
`timing-chart-v2/tests/e2e/bottom-context.spec.ts` and
`timing-chart-v2/tests/e2e/advanced-json-diagnostic.spec.ts` (10/10 Chromium):
Pin and Follow Selection remain independent, pinned Group JSON context does not
mutate Canonical/History/Dirty/render state, Selected Object JSON uses one
command, Whole Document JSON remains read-only until Advanced mode and
validation, malformed/invalid drafts report structured diagnostics without
mutation, and Group JSON Save/Open is exact. The complete V1 visual matrix
remains open.

The Header/Footer export refresh is covered by the current-main Chromium
`transaction-export.spec.ts` focused run (2/2, 2026-09-06): canonical
metadata is preserved through Save/Open and emitted in SVG, PNG and PDF, and
long metadata remains present under A4 portrait Fit Page and landscape Fit
Width. The full V1 reference-layout comparison remains open.

The current-main hierarchy/full-path and Comment Row alignment refresh is covered
by `timing-chart-v2/tests/e2e/full-gui.spec.ts` (4/4 focused Chromium):
hierarchy display modes and scope filtering, stable-ID reveal, atomic bulk
registration with Save/Open, non-mutating tree filters, and the shared Cycle-0
waveform boundary all pass. Historical V1 hierarchy pixel matching is retired
by the approved V2 v8 replacement decision; remaining visual work is against
the current V2 reference or separately scoped nested-RTL behavior.

The editable Legend row-entry refresh is covered by the current-main
`full-gui.spec.ts` browser flow: stable entry label, visibility and ordering
changes survive Save/Open, the SVG contains the ordered visible labels, and
the shared ExportScene also produces valid PNG and PDF outputs. PR #826
(`306d7d1`) additionally makes the Legend a selectable stable-identity overlay
with Inspector-owned Show/Used Roles/Orientation/X/Y drafts through the shared
`legend.update` Semantic Command. Current-main focused semantic, interactive
control and parity-inventory checks pass. PR #830's focused production browser
test now passes selection through the stable overlay ID, Inspector identity,
one-command Apply, Undo, and Save/Open of Inspector-authored orientation and
position. The local dependency links were restored without changing the lock
file; the test ran in Chromium. Anchor+Offset
versus Free Position remains unmodeled; the approved source does not define the
canonical anchor/reference target, so that specific design point is tracked as
a product decision rather than guessed.
The complete V1 legend style/fit reference matrix remains open.

The current-main Ribbon visual refresh is covered by
`timing-chart-v2/tests/e2e/ribbon-visual-scenario-matrix.spec.ts` (2/2 focused
Chromium): deterministic desktop manifests cover all supported Ribbon tabs,
mechanical icon/baseline diagnostics report no findings, and compressed layout
plus repeated Home round-trip preserves geometry and canonical/history state.
`v8-gui-contract-coverage.spec.ts` also passes its locked V8 geometry contract.
The complete V1 replacement-pack pixel matrix remains open.

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

### State Enum slice (DATA-03)

The approved State/Enum editor and symbolic projection slice is implemented on
current main by PR #850 (`33d96b6`): definitions and State assignment use the
existing canonical/SemanticCommand owners; value choices retain source values;
the WaveDrom adapter resolves known labels and falls back for unknown values.
Current-main focused evidence is 30/30 tests plus typecheck PASS.

This is not full visual parity evidence. Golden Feature 11 currently contains a
generic State signal but no EnumDefinition or assignment, and the production
file-dialog Save/Open UI journey has not been run for this feature. Those gaps
remain explicit in DATA-03; do not mutate the immutable Golden fixture to make
the matrix appear complete.


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
shape. Its canonical layout uses the normative 61px Role and 148px Signal
columns, leaving a 209px frozen pane and the full center waveform width at the
locked viewport. It is selected only by the `visual-reference` query parameter;
the normal production fixture shares the same layout contract and runtime
architecture. Browser evidence remains in
`timing-chart-v2/tests/e2e/gui-reference-v8.spec.ts`.

The same visual-reference fixture now presents the approved English shell
vocabulary (`Signals / Groups`, `Time Scale: Cycle`, `Reference: clk`,
`Signal`, `Annotations`, `Checks`, and `Follow Selection`) while the
normal V2 surface retains its existing product vocabulary. This is a
presentation-only reference route; no canonical command or persistence path
is forked.

The V8 reference view also exposes the Golden shell vocabulary and context
headers (`Signals / Groups`, `Role`, `Signal / Annotation`, `Time Scale`, and
`Reference`) plus the dense English Bottom Editor tabs and Follow Selection
control. Current-main Chromium evidence on 2026-09-06 is 3/3 for the V8 shell
and 1/1 for normal/reference presentation equivalence at 1672×941; the locked
visual pixel gate is also 1/1. These are visual-reference presentation states
only; the normal V2 surface continues to retain the product's existing labels
and all commands.

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

Current-main Chromium responsive evidence on 2026-09-06 is 5/5: Home Ribbon
icon/label overlap checks pass at 1672px and 1365px; Home commands remain
reachable without horizontal scrolling at 1280px and 1024px; and the 1024px
More Home Commands menu exposes the required document, edit, selection,
view/zoom, grid, snap, ruler, and MiniMap actions while Zoom remains
view-only. The test uses locator-based view actions and does not exercise the
quarantined #221/#222/#223 gesture paths.

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

The current-main Chromium `label-anchor-source-display.spec.ts` case also
passes (1/1, 2026-09-06), proving the standalone LabelAnchor source/display
relationship on both no-fold and folded ruler paths, including Undo and
Save/Open. `clock-presentation-closure.spec.ts` passes 2/2 for delayed-start
clock presentation and geometry-backed edge-counter updates. These are
additional acceptance evidence only; the complete V1 visual/reference matrix
and cross-feature closure remain open.

Ghost Trace export parity is now derived from the source signal's WaveDrom
wave tokens and shared source/display mapping. ExportScene emits a stable
polyline with source signal and cycle-offset metadata, and SVG/PNG/PDF share
that overlay path. Unit coverage is in
`timing-chart-v2/tests/export/deterministic-export.test.ts`; browser export
coverage is in `timing-chart-v2/tests/e2e/transaction-export.spec.ts`.
The complete V1 visual trace matrix remains open.

Measurement, Threshold and Timing Region/Ghost Trace contracts are current-main
browser verified by four focused `annotation-snap.spec.ts` cases (4/4,
2026-09-06): linked Ghost Trace and Timing Region edits preserve source links
and avoid WaveDrom/LocalGeometry regeneration; 30/70 Threshold Measurement
creation survives Save/Open; standard and custom measurement profiles resolve
explicit transition semantics; and a custom Measurement edit is one history
step with exact Undo/Redo and Save/Open restoration. The complete folded
transition and V1 visual/export matrices remain open.

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
exports a vertical tick. Golden Sample 14 is retained only as a legacy V1
migration/regression fixture; it is not a current-V2 visual acceptance
obligation. This evidence does not claim that all current-V2 visual acceptance
is complete.

The type-aware Annotation presentation audit also passes 3/3 in current-main
Chromium (`annotation-presentation-controls.spec.ts`): Range Stroke/Fill
changes are canonical, rendered and exported; Vertical Line exports a
full-height dashed line; and Text exposes Stroke/Fill as disabled with a
truthful reason. Lock interaction remains a functional acceptance item where
not yet evidenced. Golden Sample 14 is not a current-V2 acceptance gate;
current V2 v8 pixel parity is tracked separately under #1103.

Bookmark navigation and editing are current-main browser verified by the two
focused `timeline-editor.spec.ts` cases (2/2, 2026-09-06): Previous/Next
navigation reaches a geometry-backed Bookmark without changing Canonical or
History, and Bottom Bookmarks editing preserves name/cycle/comment through
Save/Open while delete followed by Undo restores the entry. The new
`deterministic-export.test.ts` contract case also verifies that persisted
navigation Bookmark IDs/names/comments and Bookmark flag layers are excluded
from default specification SVG export, as required by V1 #108; Annotation
Marker export remains separate. The new `timeline-editor.spec.ts` case passes
through 50/100/150/200% Zoom and horizontal scroll, comparing the live
Bookmark flag with the rendered cycle tick while preserving Canonical and
History. A second current-main Chromium case opens a 220-cycle document with
100 persisted Bookmarks, proves same-time entries remain distinct by stable ID,
and performs repeated list navigation with zero WaveDrom/render-counter,
Canonical or History mutation. The full bookmark visual matrix remains open.
The Ruler context-menu creation path is also current-main Chromium verified
1/1: a real right-click on the rendered cycle-4 tick opens the dedicated
`ブックマークを追加` menu item, resolves the cycle through the shared geometry
resolver, creates one canonical Bookmark/History entry, and opens the Bottom
Bookmarks panel with the flag aligned to the same tick.

The current-main Hierarchy/Full Path route is browser verified by the focused
`full-gui.spec.ts` case (1/1, 2026-09-06): Scope breadcrumb, Group/Hierarchy
view switching, path filtering, stable-ID Reveal, atomic bulk registration,
and Save/Open preservation of the registered full paths all pass. The
dedicated hierarchy export view and complete V1 tree visual matrix remain
open.

The current-main MiniMap overview route is browser verified by the focused
`full-gui.spec.ts` case (1/1, 2026-09-06): all eight canonical rows and their
derived waveform segments are present, while Canonical revision, History and
render counters remain unchanged. Viewport click/drag navigation and the
large-document scaling matrix remain open and were not retried here.

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
| `GUI-RULER-LABEL-ANCHOR` | #376 | `TIME-01` | #111 | 16 | `timing-chart-v1/artifacts/issue111/issue111-1672x941.png` | standalone create/edit/list/delete, exact source-cycle ripple, Undo/Redo, no-fold/folded projection and Save/Open verified; focused export tests cover displayed ruler labels in SVG, PNG raster input and PDF; Golden Sample 16 visual comparison remains open |
| `GUI-ANNOTATION-PRIMITIVES` | #377 | `ANNOT-01` | #40, #69 | 14 | `timing-chart-v1/artifacts/issue40/annotation-1672x941.png`; `timing-chart-v1/artifacts/issue69/issue69-1672x941.png` | Marker/Callout/Bracket production presentation and Callout multiline Save/Open verified; focused export test proves distinct type-specific content reaches SVG, PNG raster input and PDF; Golden Sample 14 is a legacy V1 migration/regression fixture, not a current-V2 visual gate |
| `GUI-ANNOTATION-PRESENTATION` | #378 | `ANNOT-01` | #40, #69 | 14 | `timing-chart-v1/artifacts/issue40/annotation-1672x941.png`; `timing-chart-v1/artifacts/issue69/issue69-1672x941.png` | capability matrix + Lock/Stroke/Fill/z-order/visibility, authored label wrap/max-width (#811/#812), line-height (#821), and semantic Start/Center/End/Above/Below label placement are implemented on the existing draft/Apply, canonical, live-overlay, and SVG-export paths; focused schema/command/export tests pass; placement browser test is authored but not run; Golden Sample 14 is a legacy V1 migration/regression fixture, not a current-V2 visual gate |

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
| `01_left_panel_LOCKED.png` | 330 × 670 | V2 v8 Left Tree region in `gui-visual-acceptance.spec.ts` | CLOSED BY PRODUCT DECISION (2026-10-09, #1095): V2 v8 replaces this historical panel; V2 functional and visual-regression acceptance remains required |
| `02_bottom_signal_LOCKED.png` | 1039 × 272 | V2 v8 center Bottom Editor | CLOSED BY PRODUCT DECISION (2026-10-09, #1095): V2 v8 replaces this historical panel; V2 functional and visual-regression acceptance remains required |
| `03_bottom_annotation_LOCKED.png` | 985 × 325 | V2 Annotation Bottom context tests | CLOSED BY PRODUCT DECISION (2026-10-09, #1095): V2 v8 replaces this historical panel; V2 functional and visual-regression acceptance remains required |
| `04_bottom_problems_LOCKED.png` | 983 × 393 | V2 Problems Bottom context tests | CLOSED BY PRODUCT DECISION (2026-10-09, #1095): V2 v8 replaces this historical panel; V2 functional and visual-regression acceptance remains required |
| `05_bottom_json_LOCKED.png` | 983 × 440 | V2 JSON Bottom context tests | CLOSED BY PRODUCT DECISION (2026-10-09, #1095): V2 v8 replaces this historical panel; V2 functional and visual-regression acceptance remains required |

The V2 v8 layout metrics and browser artifacts remain the authoritative
executable evidence for the current V2 contract. On 2026-10-09 the product
owner explicitly approved V2 v8 as the formal replacement for all five
historical panel rows (#1095). Their V1 mapping/pixel-comparison obligation
is therefore closed by product decision, not by an unperformed comparison.
The mapping-status observations in the historical table above explain why
the old images are not direct V2 baselines; they no longer impose an open
current-release visual-matching requirement. Current V2 functional,
interaction, persistence, Export, and visual-regression acceptance remains
required. Historical assets, Golden files, thresholds, and masks are unchanged.
