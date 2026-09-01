# MinimalCycleView responsibility refactor status

- Branch: `refactor/codex-minimal-cycle-owners`
- Base main: `ee7c26efcf55cafbe19950a4aeb3f24a1d2c2024`
- Golden/reference/threshold/mask changes: none
- Home Ribbon changes: none

## Baseline characterization

- TypeScript: PASS
- `git diff --check`: PASS
- Focused browser: 16 passed / 4 pre-existing failures
- Green fences include initial selection, Transaction stable-ID edit with Undo/Redo, semantic timeline edits, dirty New/Open/Save, stale Open ordering, atomic document replacement, and Compatibility Mode.
- Pre-existing failures are confined to three range-preview/drag expectations and one ambiguous Transaction button locator in `timeline-editor.spec.ts`.

## Step 3 — Application / Command / History

- Owner: `apps/editor/src/application/use-editor-application-owner.ts`
- Owns the long-lived `EditorApplicationRuntime`, replaceable command session, canonical snapshot publication, History/Dirty publication, command rejection diagnostics, execute/batch/undo/redo, and accepted-result handoff to render coordination.
- Every production semantic command and History action now enters through the application owner.
- `MinimalCycleView` retains only the accepted-result rendering callback and readonly session access needed by later Document/Renderer owner steps.
- Focused browser after transfer: 2 passed.
- TypeScript and diff-check: PASS.

## Step 4 — Document Lifecycle

- Owner: `apps/editor/src/application/use-document-lifecycle.ts`
- Owns New/Open/Save/Save As behavior, pending unsaved decisions, file-read request IDs, stale async Open rejection, parse/resource-budget handling, compatibility preview state, and atomic application-session replacement.
- Validated Open documents are handed through the Application session owner without duplicate canonical validation.
- `MinimalCycleView` retains only the file input/focus refs, dialog presentation, and the renderer/UI synchronization effect invoked after an accepted replacement.
- Focused browser after transfer: 11 passed (dirty New/Open Cancel/Discard/Save, Save As failure, stale Open ordering, valid/oversized/over-budget Open, atomic replacement, compatibility mode, and external Save storage failure).
- TypeScript and diff-check: PASS.

## Step 5 — Selection

- Owner: `apps/editor/src/application/use-selection-owner.ts`
- The selected signal/multi-signal/group/spacer/annotation/transaction state and synchronous event-handler mirrors now have one React owner.
- All production selection transitions now use owner APIs for signal/multi-signal/group/spacer/annotation/transaction selection, target navigation, clear, and select-all.
- The owner atomically clears competing entity kinds, updates synchronous refs and React state, applies DOM selection decoration, and synchronizes Follow Selection with Bottom context. Inspector and Transaction lanes consume the same stable-ID owner state.
- The obsolete `EditorApplicationRuntime.selection` / `SelectionController` authority was removed.
- Focused browser: 6 passed across Signal Tree, multi-select atomic Delete, Bottom Pin/Follow, Annotation, Transaction, and Spacer selection. Additional Inspector/Home/Tree tests reached their selection assertions and then reproduced pre-existing GUI/ambiguous-locator failures.
- TypeScript and diff-check: PASS.

## Step 6 — Clipboard / Edit Actions

- Owner: `apps/editor/src/application/use-clipboard-actions.ts`
- Owns copy/cut/paste/duplicate for signals, groups, spacers, annotations, and transactions, plus stable-ID regeneration and one-batch command construction.
- Also owns selection delete, semantic rename, visibility, and arrange/move routing using only the Application and Selection owners.
- `MinimalCycleView` retains rename-dialog presentation and thin aliases used by Ribbon, Context Menu, keyboard routing, and Bottom editors; it contains no clipboard storage or command implementation.
- Focused browser: 5 final focused checks passed for Cut/Paste, Context Menu duplicate, pinned-target duplicate/visibility, and pinned Annotation/Signal deletion. Multi-selection delete also passed; Group copy/cut reached the expected clipboard state before pre-existing Home Ribbon locator failures for Paste.
- TypeScript, boundary gate, and diff-check: PASS.

## Step 7 — Timeline Navigation

- Owner: `apps/editor/src/runtime/use-timeline-navigation-owner.ts`
- Owns zoom state and the production Zoom In/Out/preset, Fit All, Fit Selection, and cycle-navigation routes shared by Ribbon and bookmark navigation.
- The owner connects the existing `TimelineViewportRuntime` to viewport geometry, presentation scaling, selection range, and `ViewMetricsOwner`; the parent no longer stores navigation callback refs or constructs separate zoom/navigation controllers.
- Renderer, ruler, range, and interaction code reads the owner's synchronous zoom authority, avoiding a second closure-local zoom value.
- Focused browser: 4 passed for status/view-only invariants, Fit All/Fit Selection, ruler-backed cycle navigation/playhead, and horizontal-scroll range alignment across 50/100/150/200% zoom.
- TypeScript and diff-check: PASS.

## Step 8 — Timeline Geometry

- Owner: `apps/editor/src/runtime/timeline-geometry-owner.ts`
- Owns the read-only Canonical source time → `DisplayTimeMapping` → `TimeAxisGeometry`/`LocalGeometryMap` → local/screen coordinate path.
- Also owns presentation geometry revision state, source-boundary lookup, screen-to-local conversion, cycle-boundary hit testing, transaction boundary lookup, and snap-index construction/invalidation.
- `MinimalCycleView` no longer constructs a second mapping function, screen projector, time-axis state, snap service, or snap-index resolver; interaction and `TimelineViewportRuntime` consume the same geometry owner.
- Focused unit: 1 passed. Focused browser: 5 passed for axis-break compression, canonical anchor preservation through a fold, terminal boundary, Canvas boundary selection, and reverse/Shift range selection. Two additional legacy tests reached the geometry assertion path but reproduced pre-existing missing/ambiguous UI locators.
- TypeScript, boundary gate, and diff-check: PASS.

## Step 9 — Timeline Interactions (in progress)

- Range gesture owner: `apps/editor/src/runtime/timeline-range-interaction-owner.ts`
- Owns pointer down/move/up/cancel, Escape cancellation, ruler/waveform gesture normalization, transient preview/playhead synchronization, click suppression, Shift extension, terminal-boundary clamping, and final range selection state handoff.
- Parent listener registration now binds the owner's symmetric event methods and contains no range-drag controller or gesture implementation.
- Focused browser: 5 passed for every accepted hit surface, preview/playhead synchronization, scroll/zoom geometry, reverse/Shift/terminal selection, exclusions, and cancellation.
- Remaining Step 9 ownership: annotation drag, transaction drag/snap adapter, tree DnD, and keyboard routing.

## Current size

- `minimal-cycle-view.tsx`: 1,770 lines / 129,295 bytes
- `use-editor-application-owner.ts`: 106 lines / 6,470 bytes
- `use-document-lifecycle.ts`: 204 lines / 11,128 bytes
- `use-selection-owner.ts`: 84 lines / 4,027 bytes
- `use-clipboard-actions.ts`: 237 lines / 18,024 bytes
- `use-timeline-navigation-owner.ts`: 95 lines / 4,036 bytes
- `timeline-geometry-owner.ts`: 100 lines / 4,891 bytes
- `timeline-range-interaction-owner.ts`: 125 lines / 6,007 bytes

## Next responsibility

Timeline Interactions: annotation drag, transaction drag/snap adapter, tree DnD, keyboard routing, and symmetric listener lifecycle.
