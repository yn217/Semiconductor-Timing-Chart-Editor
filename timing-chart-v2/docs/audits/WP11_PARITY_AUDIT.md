# WP11 (#177) parity audit

Date: 2026-09-15  
Starting/ending HEAD for this audit: `c7a2151` (`test(e2e): align AI coverage with showcase startup`)

The attachment names `ad86e6ff` as the current HEAD, but the checked-out repository is
at `c7a2151`. No reset, stash, clean, commit, push, GitHub comment, browser test,
Golden/threshold/mask edit, or PNG edit was performed. No repository `AGENTS.md` was
present under the workspace roots; the supplied attachment instruction was used as the
scope authority.

## Mechanical parity result

Command:

```text
npm run check:parity
```

Result: PASS. The inventory contains 55 contract rows (27 grouped, 28 independent),
155 manifest issues == 155 matrix issues, `UNCLASSIFIED=0`,
`UNMAPPED_LEGACY_ISSUE=0`, `UNKNOWN_V2_OWNER=0`, `GUI-01..GUI-16 missing=0`,
`KEEP=55`, and `implementationStatus={NOT_IMPLEMENTED:0, PARTIAL:4,
ACCEPTANCE_ONLY:24, BLOCKED_EXTERNAL:0, COMPLETE:0}`. The checker was also run
directly with `node scripts/check-v1-v2-parity.mjs` and produced the same PASS.

## Manual row review

Every one of the 28 `PARTIAL`/`ACCEPTANCE_ONLY` status rows was read against its
implementation, unit/e2e evidence, and stated acceptance fields. Existing browser
evidence is recorded below; no browser runner was started in this WP.

| Row | Status | Current evidence | Bounded remaining gap |
| --- | --- | --- | --- |
| GUI-SPLIT-VIEW | ACCEPTANCE_ONLY | Shared projection/mapping; transaction-export and split visual journeys cover selection, export, and Save/Open. | Full V1 visual and performance matrix. |
| GUI-SIGNAL-SPLIT | PARTIAL | Pane-filtered projection/layout, stable IDs, combined export, Upper/Lower scroll and Lower click are covered by unit and recorded e2e evidence. | Lower-local drag range, annotation drag, context menu; large-design profiling. |
| GUI-HIERARCHY-FULL-PATH | ACCEPTANCE_ONLY | `row-layout.test.ts` plus `full-gui.spec.ts` cover path columns, scope, reveal, filtering, stable selection, and Save/Open. | Dedicated hierarchy export and full V1 tree visual parity. |
| GUI-CANVAS-CYCLE | ACCEPTANCE_ONLY | Geometry-backed Cycle 0 and terminal-boundary click evidence is recorded in `timeline-editor.spec.ts`. | Full interaction-latency matrix. |
| GUI-RANGE-SELECTION | ACCEPTANCE_ONLY | Half-open, reverse, Shift, Escape, counter invariants, delete and Undo/Redo are recorded in `timeline-editor.spec.ts`. | Full export visual and interaction-latency matrix. |
| GUI-GRID | ACCEPTANCE_ONLY | Grid/ruler alignment at 100%/125% and folded-cycle omission are covered by focused browser evidence. | Full V1 visual parity only; no semantic defect identified. |
| GUI-SNAP | ACCEPTANCE_ONLY | Candidate ranking and rendered-boundary behavior are covered by `screen-and-snap.test.ts` and annotation-snap evidence. | Full interaction-latency matrix. |
| GUI-RULER | ACCEPTANCE_ONLY | Shared mapping, folds, label anchors, zoom alignment, Save/Open, export, and scale evidence are recorded. | Full shared-mapping visual/export/latency matrix. |
| GUI-MINIMAP | ACCEPTANCE_ONLY | Viewport-proportional indicator, waveform overview, click/drag pan and view-only counters are covered. | Large-row scaling matrix. |
| GUI-INSPECTOR-CAPABILITY | ACCEPTANCE_ONLY | Signal, Group, Transaction, Annotation and Clock apply flows plus targeted-change evidence are recorded. | Full Inspector-context/export/performance matrix. |
| GUI-BOTTOM-PIN-FOLLOW | ACCEPTANCE_ONLY | `bottom-context.spec.ts` records independent Pin/Follow, pinned context, and zero mutation. | Full V1 visual parity only. |
| GUI-ADVANCED-JSON | ACCEPTANCE_ONLY | Selected-object/document scope, validation, atomic apply/rejection, and Group Save/Open are recorded. | Full JSON scope matrix. |
| GUI-HEADER-FOOTER | ACCEPTANCE_ONLY | Header/footer Save/Open and SVG/PNG/PDF metadata with Fit Page/Width are recorded. | Full V1 reference layout matrix. |
| GUI-EDITABLE-LEGEND | OPEN_GAP | Overlay selection now follows the singleton Legend into an Inspector with Show, Used Roles Only, orientation, and X/Y drafts through `legend.update`; focused E2E coverage was added for selection being view-only, one-command Apply, and Undo. | Real-browser run remains blocked by the linked dependency tree; explicit Anchor+Offset/Free Position mode, complete Save/Open and visual/performance acceptance remain open. |
| GUI-CLOCK-EDGE-COUNTER | ACCEPTANCE_ONLY | Compact reachability, reflow, bookmark identity, range filtering, Undo/Redo and export are recorded. | Full V1 visual/reference matrix. |
| GUI-AXIS-BREAK | ACCEPTANCE_ONLY | Mapping, multiple folds, Save/Open, paired marks, export policies, and 100k/1k scale checks are recorded. | Fold/label coexistence and full folded-view latency matrix. |
| GUI-BOOKMARK | ACCEPTANCE_ONLY | Lifecycle, ruler creation, zoom/scroll alignment, 100-bookmark navigation, Save/Open and export policy are recorded. | Full bookmark visual and latency matrix. |
| GUI-TIME-GROUP | ACCEPTANCE_ONLY | Atomic edit/validation, collapse/fold presentation, multiple breaks, Save/Open, export and scale checks are recorded. | Full V1 visual/export/latency matrix. |
| GUI-MEASUREMENT | ACCEPTANCE_ONLY | 30/70 and custom profile lifecycle, geometry, Save/Open, and targeted overlay invariants are recorded. | Folded-transition visual export acceptance. |
| GUI-THRESHOLD-ANCHOR | ACCEPTANCE_ONLY | Rendered transition handles, custom ratios, Save/Open and shared export metadata are recorded. | Exact transition-shape export and full visual matrix. |
| GUI-TIMING-REGION-GHOST | ACCEPTANCE_ONLY | Linked overlays, source trace, offsets, Save/Open and no unrelated waveform rebuild are recorded. | Waveform-accurate trace geometry export. |
| GUI-CLIPBOARD | ACCEPTANCE_ONLY | Same/cross-document copy, paste, duplicate, collision rejection and entity-specific lifecycle evidence are recorded. | Full V1 clipboard Save/Open/export/large-selection matrix. |
| GUI-GOLDEN-SAMPLES | ACCEPTANCE_ONLY | All 20 samples have browser Save/Open and SVG/PNG/PDF semantic generation evidence. | V1 pixel/reference comparison and full sample performance matrix; baseline files remain untouched. |
| GUI-EXPORT-COMPLETENESS | ACCEPTANCE_ONLY | Shared ExportScene, SVG/PNG/PDF/Clipboard, header/footer, page layout, threshold and overlay metadata have focused evidence. | Full Fit/Page matrix, waveform-accurate Ghost Trace, visual closure and export performance. |
| GUI-TRANSITION-ARROW | ACCEPTANCE_ONLY | Arrow/Dependency pick, distinct Straight/Orthogonal/Curve/Diagonal paths, markers, Save/Open and export are covered. | Full Golden Sample 15 visual matrix. |
| GUI-RULER-LABEL-ANCHOR | PARTIAL | Five command tests plus standalone/folded/no-fold, conflict, Undo/Redo, Save/Open and SVG evidence. | Full Golden Sample 16 visual and label-anchor performance matrix. |
| GUI-ANNOTATION-PRIMITIVES | PARTIAL | Marker/Callout/Bracket distinctness, multiline Callout, export shapes and Callout Save/Open are covered. | Independent Marker/Bracket Save/Open and full SVG/PNG/PDF Golden matrix. |
| GUI-ANNOTATION-PRESENTATION | PARTIAL | Capability matrix tests and 6/6 browser evidence cover Stroke/Fill, Lock, visibility/z-order routing and lock persistence. | Per-property Save/Open verification, text layout controls, and full Golden Sample 14 visual/performance matrix. |

## Focused non-browser checks

The earlier WP11 command listed eight paths but used the incorrect
`tests/schema-and-roundtrip.test.ts` path. Vitest therefore ran only seven existing
files; that run did **not** provide schema test evidence.

The corrected command was run for this follow-up:

```text
npx vitest run tests/commands/semantic-commands.test.ts tests/schema/schema-and-roundtrip.test.ts
```

Result: PASS — 2 test files, 91 tests passed in 2.81s. This is the exact evidence for
schema round trips and SemanticCommand annotation behavior. The earlier seven-file
run remains evidence only for the seven paths that Vitest actually found. The first
attempted alias `npm run check:v1-v2-parity` failed because that script is not defined;
npm's defined `check:parity` script was then used.

## Bounded follow-up coverage

`tests/commands/semantic-commands.test.ts` now covers a Marker and a Bracket through
the existing `annotation.updateProperties`, `annotation.setRotation`,
`annotation.setAlign`, `annotation.setLocked`, and Marker
`annotation.updateVerticalSpan` command paths. It asserts the resulting semantic
fields, validates Save/Open with `serializeValidatedCanonicalDocument` and
`parseDocument`, checks exact document equality after reopen, and checks deterministic
Save/Open/Save bytes. No production source was changed.

## Audit D follow-up (multi-feature schema specimen)

Existing focused schema tests already covered individual Transaction Group,
measurement, overlay, Label Anchor, and Time Group cases, but did not assert one
multi-feature canonical document as a whole. The bounded addition in
`tests/schema/schema-and-roundtrip.test.ts` constructs one valid specimen containing:

- three Signals in two Groups (fixture `sig_clk`/`sig_data` plus `sig_aux`);
- one Transaction with two Phases and a linked Signal;
- Marker and Bracket annotations, including Marker row-span semantics and Bracket
  style/route fields;
- a named Bookmark; and
- a collapsed Axis-Break TimeGroup.

Command:

```text
npx vitest run tests/schema/schema-and-roundtrip.test.ts
```

Result: PASS — 1 test file, 36 tests passed in 2.66s. The new test first requires
`validateCanonicalDocument(document) === []`, then serializes through the current
canonical schema, parses through `parseDocument`, asserts full document equality, and
asserts deterministic Save/Open/Save bytes. This is schema-level evidence only; no
browser lifecycle or production Save/Open claim is made.

Remaining browser/export gaps are unchanged: independent Marker/Bracket browser
Save/Open acceptance, full SVG/PNG/PDF Golden coverage, full visual parity, and
export-specific visual/performance matrices remain open.

## Conclusion

No bounded production defect was proven by this parity audit or follow-up. The parity inventory is
mechanically complete, but it is not closure-complete: all 28 status rows remain
open because their explicitly stated visual, performance, export, or narrower
acceptance gaps remain. These are concrete follow-up gaps, not a claim that parity
passing closes #177.

Working-tree PNG preservation was verified with `git status --short`: the seven
pre-existing modified PNGs remain modified and no additional PNG was changed.
