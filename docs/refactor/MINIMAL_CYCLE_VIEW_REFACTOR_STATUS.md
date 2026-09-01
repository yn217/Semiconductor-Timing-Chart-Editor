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

### Step 9-A — Annotation Drag (complete)

- Owner: `apps/editor/src/runtime/timeline-annotation-interaction-owner.ts`
- Owns annotation pointer down/move/up, drag-preview translate, snap-guide/candidate resolution (reusing `TimelineGeometryOwner.currentSnapIndex`/`geometryMaps`/`displayMapping`/`presentationScale`), label-offset drag, whole-annotation translate, anchor-drop semantic command commit (`annotation.setAnchor` / `annotation.translateOffsets` / `annotation.updateLabelOffset`), and cancellation (`cancel()`, used for Escape and document-epoch invalidation).
- `MinimalCycleView` retains only thin aliases (`onAnnotationPointerDown/Move/Up` = `annotationInteraction.onPointerDown/onPointerMove/onPointerUp`), the Escape branch and `mayRouteGlobalShortcut` gate now read `annotationInteraction.active`/call `annotationInteraction.cancel()`, and arrow-key nudge / clipboard / Undo-Redo shortcut routing remain in the parent for Step 9-D to claim (out of this step's closed-responsibility scope).
- `resolveAnchorPoint`, `preferredSnapKinds`, `normalizeSnapDistance`, `withSnapOffset` are no longer imported by `minimal-cycle-view.tsx` (moved with the owner); `withAddedOffset`/`annotationFields` stay imported for the remaining parent-side nudge code.
- Focused browser: `tests/e2e/annotation-snap.spec.ts` 13/14 passed; the one failure ("ripples and clamps Annotation anchors through Timeline edits with Undo and Redo") reproduces identically on the pre-step baseline (verified via `git stash`), confirmed pre-existing. `tests/e2e/timeline-editor.spec.ts` 11/17 passed, same 6 failures reproduce identically on the pre-step baseline.
- TypeScript, `check:boundaries`, `check:editor-complexity`, `check:performance-architecture`, and `git diff --check`: PASS.

### Step 9-B — Transaction Drag / Snap (complete)

- Transaction lane drag/resize/move already lived in one place (`apps/editor/src/runtime/transaction-lanes.tsx`), with all `clientX -> cycle` resolution delegated to `TimelineGeometryOwner` (`timelineGeometry.sourceBoundaryToLocalX` for boundary X, `resolveTransactionSnapCycle` — which itself only reads `timelineGeometry.currentSnapIndex()`/`screen`/`timeAxis` — for pointer-to-cycle snap). No parent-side duplicate geometry math existed; this step closed two real gaps found while adding a behavior-fence test (`tests/e2e/transaction-drag.spec.ts`, none previously existed for Transaction drag):
  1. **Terminal boundary clamp bug**: `resolveTransactionSnapCycle` (`runtime/use-editor-runtime-bridge.ts`) called `currentSnapIndex().nearest(...)` with a fixed small radius and returned `undefined` past it, silently no-opping a drag past the first/last cycle instead of clamping. Now falls back to `cycleBoundaryAtPointerX`, which already has the correct terminal-tolerance logic used elsewhere (Range/Annotation).
  2. **No cancel path**: `TransactionLanes` had no Escape or `pointercancel` handling — an in-flight drag always committed on `pointerup` regardless of Escape. Added an Escape listener (attached only while a drag is active) and `onPointerCancel` on the transaction button, both clearing drag state via the existing `setDrag(undefined)` path so `finish()`'s own `if (!drag ...) return;` guard naturally no-ops the subsequent `pointerup`.
- Focused browser (new): `tests/e2e/transaction-drag.spec.ts` 4/4 passed — move-with-one-history-entry+Undo, edge resize with snap, terminal clamp, Escape-cancels-without-mutation.
- Regression sweep: `timeline-editor.spec.ts`, `annotation-snap.spec.ts`, `transaction-export.spec.ts`, `zoom-cross-surface-alignment.spec.ts`, `clockless-time-axis.spec.ts`, `edit-commit-contract.spec.ts`, `result-aware-create-effects.spec.ts`, `gui-split-view-visual.spec.ts`: 23 pre-existing failures (mostly the already-known ambiguous `"Transaction"` button locator — a ribbon tool and a ribbon *tab* now share the same accessible name — plus the already-known range-preview/drag/marker-geometry set), confirmed identical via `git stash` against the pre-step baseline. Zero new regressions.
- TypeScript, `check:boundaries`, `check:editor-complexity`, `check:performance-architecture`, `git diff --check`: PASS.

### Step 9-C — Tree Drag & Drop (complete)

- Owner: `apps/editor/src/runtime/tree-drag-interaction-owner.ts`
- Owns Signal/Group Left Tree drag state, `dragover` hover-target drop-position (presentation dataset only, no canonical mutation), drop validation, and the semantic reorder command commit (`signal.move` / `group.move`) — a mechanical extraction of logic that was already single-owned in `minimal-cycle-view.tsx` (no parallel implementation existed) into its own file, matching the `AnnotationInteractionOwner`/`TimelineRangeInteractionOwner`/`TransactionLanes` convention.
- `MinimalCycleView` retains only thin aliases (`onDragStart/onDragOver/onDrop/onDragEnd` = `treeDrag.onDragStart/onDragOver/onDrop/onDragEnd`) bound to the same `dragstart/dragover/drop/dragend` listeners as before.
- **Real gap closed**: Spacer rows were not draggable at all. `packages/renderer/src/stable-surface.ts` only ever set `shell.draggable = true` for `row.kind === "timing"`, never for `row.kind === "spacer"`, even though a dedicated `spacer.move` command already existed in `@timing-chart-v2/commands` and was never invoked from the tree. Fixed by (1) also marking `spacer` rows draggable, (2) `TreeDragInteractionOwner.onDragStart` now reads `row.dataset.kind` to classify a drag as `"spacer"` vs `"signal"`, and (3) `onDrop` dispatches `spacer.move` for a Spacer drag (validated to stay within its owning Group, matching `spacer.move`'s own `SPACER_OWNER_MISMATCH` semantics) instead of misrouting it through `signal.move`.
- Focused browser (new): `tests/e2e/tree-drag-drop.spec.ts` 5/5 passed — Signal reorder with one command per drop + Undo/Redo restoring exact order, Spacer reorder within its owning Group with one command per drop + Undo, an invalid self-drop committing no command and leaving `data-canonical-revision`/History untouched, selection surviving a reorder, and a collapse/expand cycle not breaking a subsequent reorder among the group's visible siblings.
- Regression sweep (touched a shared renderer file): `left-tree-interaction.spec.ts`, `left-tree-critical-icons.spec.ts`, `group-band.spec.ts`, `spacer.spec.ts`, `spacer-row.spec.ts`, `signal-spacing.spec.ts`, `left-tree-type-filter.spec.ts` — 4 pre-existing failures, confirmed identical via `git stash`. Zero new regressions.
- `tests/e2e/reorder-visibility.spec.ts` (pre-existing, no changes needed for this step): 2/8 passed both before and after this extraction (verified via `git stash`) — the other 6 assert against a `data-canonical-row-ids` surface attribute that no longer exists anywhere in the source (`grep` found zero producers), a pre-existing test/implementation drift unrelated to Step 9-C's ownership-transfer scope.
- TypeScript, `check:boundaries`, `check:editor-complexity`, `check:performance-architecture`, `git diff --check`: PASS.

### Step 9-D — Keyboard Routing (complete)

- Router: `apps/editor/src/runtime/keyboard-shortcut-router.ts` (`routeGlobalShortcut`, a pure function, not a stateful owner — there is no persistent state to own).
- Routes Delete / Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D / Ctrl+A / Ctrl+Z / Ctrl+Shift+Z / Escape to the shared `UiCommandRegistry` (`selection.delete`, `clipboard.copy/cut/paste/duplicate`, `selection.selectAll`, `history.undo/redo`) or to a caller-supplied `cancel()`. Holds no semantic implementation itself; every branch is a single `execute(name)` dispatch. Gated end-to-end by the existing `mayRouteGlobalShortcut`/`keyboardScope` classifier (typing/IME/dialog/gesture focus), unchanged, so native text-editing and IME composition are never intercepted.
- The previous `onAnnotationKeyDown` handler mixed this global routing with Annotation-specific arrow-key nudge and an Escape cascade (close context menu / cancel Annotation drag / reset dependency-arrow pick). Split cleanly: the global-shortcut part moved to the router above; the nudge moved to `AnnotationInteractionOwner.nudge()` (new method, same file as Step 9-A, since it already owns `annotation.setAnchor` mutation); the Escape cascade stays as a small `cancel()` closure passed into the router from `MinimalCycleView` (it composes three different owners' state, not a single owner's responsibility).
- Widget-scoped keyboard handling not in this step's scope, left untouched: `onViewportKeyDown` (canvas pan arrows/PageUp/PageDown/Home/End) and `onTreeKeyDown` (Left Tree roving-focus arrow/Enter/ContextMenu navigation) are not global shortcuts, they are per-widget keyboard-navigation contracts.
- **Two real gaps closed**: `clipboard.duplicate` and `selection.selectAll` had never been registered in the `UiCommandRegistry` at all -- `Ctrl+D`/`Ctrl+A` had no keyboard binding despite `editActions.duplicate` and a local `selectAllSignals` already existing and being reachable from Ribbon/context-menu. Registered both (`selectAllSignals` needed a `useRef` indirection, matching this file's existing `armArrowPick`-style pattern, since it closes over reactive `snapshot` state and the registration effect runs once on mount).
- `MinimalCycleView` retains no keyboard semantic logic: `onGlobalKeyDown` calls `routeGlobalShortcut(...)`, then `annotationInteraction.nudge(event)` only if unhandled.
- Focused browser (new): `tests/e2e/keyboard-shortcut-router.spec.ts` 4/4 passed -- Ctrl+D duplicates with a fresh stable ID and one History entry, Ctrl+A selects every Signal without canonical mutation, Ctrl+A inside a text input performs native select-all (app shortcut correctly does not fire), Escape cancels an in-progress Annotation drag with zero canonical/History change.
- `tests/e2e/full-gui.spec.ts` "keeps global shortcuts focus-aware and IME-safe" (native Ctrl+Z inside a text input, `isComposing:true` Delete on a focused Annotation) and `tests/e2e/annotation-snap.spec.ts` "nudges by 1/10 px..." (Annotation arrow-key nudge, now owner-hosted): both still pass unchanged.
- Regression: `tests/e2e/home-command-surface.spec.ts` (Copy/Duplicate/Paste/multi-select clipboard/Select-All coverage) -- 3 pre-existing failures (an ambiguous `"Duplicate"` button locator matching both the Ribbon tool and ribbon-tab, unrelated to keyboard routing), confirmed identical via `git stash`. Zero new regressions.
- TypeScript, `check:boundaries`, `check:editor-complexity`, `check:performance-architecture`, `git diff --check`: PASS.

Remaining Step 9 ownership: symmetric listener-lifecycle audit (Step 9-E).

## Current size

- `minimal-cycle-view.tsx`: 1,615 lines
- `use-editor-application-owner.ts`: 106 lines / 6,470 bytes
- `use-document-lifecycle.ts`: 204 lines / 11,128 bytes
- `use-selection-owner.ts`: 84 lines / 4,027 bytes
- `use-clipboard-actions.ts`: 237 lines / 18,024 bytes
- `use-timeline-navigation-owner.ts`: 95 lines / 4,036 bytes
- `timeline-geometry-owner.ts`: 100 lines / 4,891 bytes
- `timeline-range-interaction-owner.ts`: 125 lines / 6,007 bytes
- `timeline-annotation-interaction-owner.ts`: 154 lines
- `tree-drag-interaction-owner.ts`: 95 lines
- `keyboard-shortcut-router.ts`: 55 lines

## Next responsibility

Timeline Interactions: tree DnD (Step 9-C), keyboard routing (Step 9-D), and symmetric listener-lifecycle audit (Step 9-E).
