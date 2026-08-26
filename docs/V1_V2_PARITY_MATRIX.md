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
| GUI-01 | Multi-group feature-rich Ribbon | KEEP | #176 | Home must contain more than Undo/Redo/Delete. |
| GUI-02 | Signal/Group tree and organization | KEEP | #172/#178 | Hierarchy and full-path behavior require closure. |
| GUI-03 | Direct timing canvas interaction | KEEP | #165/#167/#170 | Actual WaveDrom geometry and hit-zone acceptance required. |
| GUI-04 | Signal/Group/Clock/Annotation/Transaction Inspector | KEEP | #172/#176 | Batch 1B verifies editable Signal/Clock fields through Apply; Group/Annotation/Transaction parity remains open. |
| GUI-05 | Bottom Context Editor | KEEP | #172/#176/#178 | Comment Row and advanced editing require dedicated owners. |
| GUI-06 | Interactive MiniMap | KEEP | #167/#175/#178 | Click-pan and viewport drag are required. |
| GUI-07 | Status Bar | KEEP | #172/#176 | State and count parity requires evidence. |
| GUI-08 | Cycle/Transaction/Split selector | MERGED | #172 | View-only state must preserve Canonical/History = 0. |
| GUI-09 | Grid/Snap/Ruler | KEEP | #165/#170/#175 | Controls must affect real geometry and mapping. |
| GUI-10 | Hardware hierarchy / Full Path / Scope | KEEP | #177/#178 | Signal Tree alone is insufficient. |
| GUI-11 | Signal styling and editable Legend | KEEP | #162/#172/#176 | Type/style/legend capability is incomplete. |
| GUI-12 | Clock editor and Edge Counter | KEEP | #164/#172 | Batch 1B verifies editable Inspector Clock Generator Duty and Edge Counter; full save/export parity remains open. |
| GUI-13 | Problems/JSON/Annotation/Transaction tabs | KEEP | #163/#166/#172 | Advanced JSON and dedicated Comment Row editing required. |
| GUI-14 | Follow Selection / Pin | KEEP | #172/#176 | Pin must be independent from Follow OFF. |
| GUI-15 | Zoom/Fit/navigation | KEEP | #167/#172/#176 | Fit Selection and navigation evidence required. |
| GUI-16 | Clipboard/reorder commands | KEEP | #161/#169/#172/#176 | Shared SemanticCommand and fresh IDs required. |

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
