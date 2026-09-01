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

### Step 9-E — Listener Lifecycle (complete) — Step 9 (Timeline Interactions) now fully complete

- Audited every `addEventListener` call in `minimal-cycle-view.tsx`: the `attachEditorEventBindings([...])` array (all pointer/keydown/click/drag/scroll listeners for Range/Annotation/Tree-drag/global-shortcut interactions, Steps 9-A through 9-D) attaches once inside a `[]`-dependency `useEffect` and detaches symmetrically (reverse order, exact target/type/listener/options match) on unmount; the one other raw listener (`onDialogKeyDown`, capture-phase Escape/Tab-trap for modals) already had a matching `removeEventListener` in the same effect.
- **Real bug found and fixed**: `leftTree?.addEventListener("keydown", onTreeKeyDown)` was called directly, *in addition to* `onTreeKeyDown` already being registered correctly through the `attachEditorEventBindings` array a few hundred lines later — the same listener bound twice to the same element for the same event type. The direct call had no matching `removeEventListener` anywhere (a leak on every unmount) and caused every Left Tree keydown (arrow navigation, Enter/Space synthetic click, Shift+F10/ContextMenu synthetic contextmenu) to run twice. Confirmed by instrumenting `EventTarget.prototype.addEventListener` before app init: 4 registrations observed pre-fix (React 18 StrictMode's dev-mode double-mount surfacing the bug at 2-per-mount instead of 1), 2 after (the correct count). Fixed by deleting the redundant direct call; the array-based registration was already correct and needed no change.
- Focused browser (new): `tests/e2e/listener-lifecycle.spec.ts` 2/2 passed — the same `addEventListener` instrumentation asserted as a regression guard (`<=2`, i.e. at most one registration per mount even under StrictMode's double-invoke), and one ArrowDown moving Left Tree focus by exactly one row (not two).
- Regression: `tests/e2e/tree-keyboard.spec.ts` — 1 pre-existing failure (a Left Tree filter/collapse-focus-repair assertion unrelated to listener counting), confirmed identical via `git stash`. Zero new regressions.
- TypeScript, `check:boundaries`, `check:editor-complexity`, `check:performance-architecture`, `git diff --check`: PASS.

## Step 9 summary — Timeline Interactions (all sub-steps complete)

Range gesture, Annotation drag/snap/nudge, Transaction drag/snap, Tree drag-and-drop (Signal/Group/Spacer), global keyboard-shortcut routing, and listener-lifecycle symmetry are each owned by one dedicated file (`timeline-range-interaction-owner.ts`, `timeline-annotation-interaction-owner.ts`, `transaction-lanes.tsx` + `tree-drag-interaction-owner.ts` + `keyboard-shortcut-router.ts`), all reusing `TimelineGeometryOwner` for geometry/snap resolution and the shared `UiCommandRegistry`/`documentHistory` for every canonical mutation. `MinimalCycleView` holds only thin aliases to these owners' methods. Along the way this closed five confirmed, previously-unreported product bugs (Transaction terminal-boundary-drag no-op, Transaction drag had no cancel path, Spacer rows were not draggable at all, `Ctrl+D`/`Ctrl+A` had no keyboard binding, and the Left Tree keydown handler fired twice per keystroke) — each verified pre-existing/absent via `git stash` against the pre-step baseline before being fixed, and each covered by a new focused test.

## Current size

- `minimal-cycle-view.tsx`: 1,635 lines
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
- `use-workspace-ui-state.ts`: 85 lines
- `use-dialog-menu-state.ts`: 58 lines

## Step 10 — Render Coordinator (audited; already substantially owned)

- Investigated before writing new code, per the playbook: the target responsibility is **already** owned by two existing pieces, not scattered across `minimal-cycle-view.tsx`:
  - `runtime/render-coordinator.ts` (`RenderCoordinator`, already exists) owns `StableTimingChartRenderer` mount/dispose.
  - `runtime/timeline-viewport-runtime.ts` (`TimelineViewportRuntime`, via `createEditorTimelineRuntime`) owns `attach/detach/dispose`, zoom (`zoomIn/zoomOut/setZoom/fitAll/fitSelection`), `navigateToCycle`, and every presentation refresh (`refreshRuler/refreshGrid/refreshPlayhead/refreshRange/refreshOverlays`) behind one internal `render(reason)` dispatcher that the whole file already calls through (`timelineRuntime.refreshXxx()`), not by composing `refreshTimelinePresentation`/etc. directly. This already matches the plan's target shape (`renderer.refresh(...)/attach(...)/dispose(...)` as one owner) almost verbatim.
- The one genuine gap found: `timelineRender`'s forward declaration had a **dead** dummy body (`(reason) => { ...; renderer.update(projection); }`) that could never execute -- it's synchronously overwritten a few lines later, before `createEditorTimelineRuntime`'s returned closures (the only thing capable of invoking it) can be called. Changed to a definite-assignment `let timelineRender!: ...`, matching this file's own `rangeInteractions`/`treeDrag` forward-declaration convention elsewhere. No behavior change; removes unreachable code.
- Three call sites (`application.attachAcceptedHandler`, `applyCollapsedGroupsRef.current`, `documentLifecycle.attachEffects`'s `applyReplacement`) each recompute `projection` and call `renderer.update(projection)` directly before delegating their conditional refresh work to `timelineRuntime`. These are **not** duplicate implementations of the same responsibility -- they are three genuinely different triggers (command accepted with per-field invalidation, collapsed-group toggle, full document replace with React state reset) that legitimately need their own projection-rebuild-then-refresh sequencing; forcing them into one generic function would blur real behavioral differences (e.g. only `applyReplacement` resets 15+ pieces of React state) for no ownership-transfer benefit, so left as-is rather than manufacturing a "Bad slice" per the playbook's own warning against arbitrary consolidation.
- TypeScript, `check:boundaries`, `check:editor-complexity`, `check:performance-architecture`, `git diff --check`: PASS. `tests/e2e/minimal-cycle-view.spec.ts`/`view-metrics-owner.spec.ts` smoke-tested; 1 pre-existing failure (unrelated `"Cycle View"` visibility timing), confirmed identical via `git stash`.

## Step 11 — Workspace UI State (complete)

- Owner: `apps/editor/src/workspace/use-workspace-ui-state.ts` (`useWorkspaceUiState`, a React hook -- state must stay hook-based to keep React's re-render contract, unlike the class-based Step 9 owners).
- First slice moved 16 `useState` calls (and their 4 paired resize-gesture `useRef`s) out of `minimal-cycle-view.tsx`: `ribbonTab`, `bottomTab`, `viewMode`, `density`, `workspacePreset`, `signalTreeVisible`, `inspectorVisible`, `inspectorResetToken`, `bottomResetToken`, `bottomVisible`, `leftPaneWidth`(+resize ref), `frozenPaneWidth`(+resize ref), `inspectorWidth`(+resize ref), `bottomHeight`(+resize ref), `treeFilter`, `treeTypeFilter`. `MinimalCycleView` calls `useWorkspaceUiState()` once and destructures the identical names back out, so every existing read/write site (JSX props, resize-gesture handlers, `applyWorkspacePreset`, the tree filter `<select>`/`<input>`) needed zero further changes -- purely mechanical relocation, no behavior change, matching the plan's explicit "not LOC reduction, ownership transfer" bar without introducing risk by touching call sites.
- Second slice moved `followSelection`(+ref), `bottomPinned`(+ref), and `pinnedBottomSelection` -- explicitly named in the plan's Step 3 scope ("follow selection, bottom pin"). The hook is now generic over `<SignalId, GroupId, AnnotationId, TransactionId>` (`useWorkspaceUiState<SignalId, GroupId, AnnotationId, TransactionId>()`) purely to type `pinnedBottomSelection`'s shape; `minimal-cycle-view.tsx` passes its own domain ID types at the call site. `followSelectionRef`/`bottomPinnedRef` are populated inside the hook with the same per-render assignment pattern (`xRef.current = x`) the parent used before -- semantically identical, just relocated. `selection.configure(...)`'s `synchronizeContext` callback (the one cross-cutting consumer) now reads the destructured refs from `workspace` exactly as it read the local refs before.
- **Deliberately NOT moved into this owner** (out of Step 11's scope, reclassified rather than deferred): `collapsedGroupIds` (feeds `projectionCoordinator.project(...)` directly at several call sites -- document-projection state, not presentation chrome), and `contextMenu`/`treeAddMenuOpen`/`treeMoreMenuOpen`/the dialog visibility flags (`propertiesVisible`/`exportVisible`/`saveAsVisible`/`hierarchyVisible`/`bulkRegistrationVisible` + bulk-registration form fields). The latter group is one tangled cluster sharing several `useEffect`s (`onDialogKeyDown` checks both context/tree-menu state AND every dialog-visibility flag in one handler; a second effect drives focus-restoration off all three menu flags; a third off all five dialog flags) -- splitting menu state from dialog state here would break one cohesive effect's dependency list across two files for no ownership benefit. This cluster is Step 12 "dialogs" / editor-shell material per the plan's own phase breakdown, not Step 11 "workspace state" (tabs/view-mode/pane-visibility/resize/follow-selection/bottom-pin, all of which are now owned).
- Step 11's full scope per the plan ("tabs, view mode, pane visibility/sizes, resize state, follow selection, bottom pin, presentation-only UI state") is now owned by `use-workspace-ui-state.ts`: 19 state vars + 4 resize refs across two slices.
- TypeScript, `check:boundaries`, `check:editor-complexity`, `check:performance-architecture`, `git diff --check`: PASS. Regression sweep (second slice): `unsaved-file-dialog.spec.ts`, `status-context.spec.ts`, `pinned-bottom-target.spec.ts`, `minimal-cycle-view-next-probe.spec.ts`, `gui-v1-pane-vocabulary.spec.ts`, `gui-reference-v8.spec.ts`, `edit-commit-contract.spec.ts`, `bottom-context.spec.ts` -- 9 pre-existing failures, confirmed identical via `git stash`. Zero new regressions. (First slice's own sweep, previously reported: 7 pre-existing failures, also confirmed identical via `git stash`.)

## Step 12 — UI Presentation (state slice complete; JSX split remains)

- Investigated existing extraction before writing new code: `minimal-cycle-view-ribbon.tsx` (242 lines), `minimal-cycle-view-panels.tsx` (207 lines), `minimal-cycle-view-ui.tsx` (117 lines), `minimal-cycle-view-timeline.tsx` (108 lines), and `minimal-cycle-view-application.ts` (125 lines) already exist and are consumed by `minimal-cycle-view.tsx`. The Properties/Export/SaveAs/Hierarchy dialogs are already their own components (`document-properties.tsx`, `export-dialog.tsx`, `save-as-dialog.tsx`, hardware-hierarchy browser); only their *visibility flags* and the Rename/Bulk-Registration dialogs' full JSX still lived inline.
- Owner: `apps/editor/src/workspace/use-dialog-menu-state.ts` (`useDialogMenuState`, a React hook, same rationale as `use-workspace-ui-state.ts`). Moved 14 `useState` calls out of `minimal-cycle-view.tsx`: `contextMenu`, `treeAddMenuOpen`, `treeMoreMenuOpen`, `propertiesVisible`, `exportVisible`, `saveAsVisible`, `hierarchyVisible`, `bulkRegistrationVisible`, `bulkRegistrationText`, `bulkRegistrationGroupId`, `bulkRegistrationStatus`, `bulkRegistrationPreview`, `renameDialogOpen`, `renameDraft`, `renameError`. Same destructure-back-out-under-identical-names pattern as Step 11 -- zero call-site changes needed.
- **Deliberately left in `minimal-cycle-view.tsx`** (state moved, but the *effects* that compose this state with Document Lifecycle's `compatibilityPreview`/`pendingFileAction` did not): the menu-close focus-restore effect, the `onDialogKeyDown` Escape-routing effect (checks context/tree-menu state, both dialog-visibility flags, and `documentLifecycle`'s pending-action/compatibility state in one handler), and the menu-keyboard-navigation effect. These stay because they are genuinely cross-owner composition, not a single owner's responsibility -- matching the reasoning already used for `onGlobalKeyDown`'s `cancel()` closure in Step 9-D. `collapsedGroupIds` also stays where it is (feeds `projectionCoordinator.project(...)` directly -- document-projection state, not dialog/menu presentation).
- The JSX itself (dialogs, Signal Tree column headings/menus, Bottom Editor, Inspector shell) has **not** been split into separate files yet -- this step's slice was the state-ownership transfer only, following the same incremental-slice discipline as Step 11, so the eventual JSX componentization lands on an already-consolidated state surface instead of having to migrate ~15 `useState` declarations *and* restructure JSX in one risky pass.
- TypeScript, `check:boundaries`, `check:editor-complexity`, `check:performance-architecture`, `git diff --check`: PASS. Regression sweep: `left-tree-menu-contrast.spec.ts`, `left-tree-interaction.spec.ts`, `left-tree-compact-footer.spec.ts`, `icon-button-dialog-close.spec.ts`, `home-command-surface.spec.ts`, `full-gui.spec.ts`, `bulk-registration-strict.spec.ts` -- 31 pre-existing failures / 34 passed, confirmed byte-identical via `git stash`. Zero new regressions.

## Step 12 — UI Presentation (Rename / Bulk Registration dialog JSX extracted)

- Extracted the Rename dialog and Bulk Signal Registration dialog JSX bodies (previously ~40 lines of dense inline JSX in `minimal-cycle-view.tsx`'s return) into `RenameDialog` and `BulkRegistrationDialog` components in `minimal-cycle-view-panels.tsx`, next to the other already-extracted presentational components (`ContextMenuPanel`, `InspectorPanel`, `MinimalCycleViewTitleBar`).
- Both take grouped, component-scoped props (dialog ref, current field values, one callback per user action) rather than passing the raw `use-dialog-menu-state.ts` setters straight through -- `minimal-cycle-view.tsx` still owns exactly how a field edit maps to state updates (e.g. `onDraftChange` still clears `renameError` in the same call, matching pre-extraction behavior byte-for-byte), the components only render and forward events.
- `minimal-cycle-view.tsx` now renders `<RenameDialog .../>` and `<BulkRegistrationDialog .../>` in place of the inline markup; no behavior change, no test-id/DOM-order change.
- The Properties/Export/SaveAs/Hierarchy/Compatibility/Unsaved-file dialogs, the Signal Tree column headers/menus, the Bottom Editor, and the status bar footer remain inline in `minimal-cycle-view.tsx` -- the Properties/Export/SaveAs/Hierarchy dialogs were already their own separate components before this refactor started (this step only had visibility-flag ownership to transfer, done in the state slice above); Compatibility/Unsaved-file dialogs are owned by Document Lifecycle's `pendingFileAction`/`compatibilityPreview` and were intentionally left with the owner that already manages their trigger conditions; Signal Tree/Bottom Editor/status bar are the larger remaining JSX split for a future slice.
- TypeScript, `check:boundaries`, `check:editor-complexity`, `check:performance-architecture`, `git diff --check`: PASS. Regression sweep: `bulk-registration-strict.spec.ts`, `home-command-surface.spec.ts`, `icon-button-dialog-close.spec.ts`, `full-gui.spec.ts` -- 30 pre-existing failures / 30 passed, confirmed byte-identical via `git stash`. Zero new regressions.

## Step 12 — UI Presentation (Signal Tree column header extracted)

- Extracted the Signal/Group tree's column header -- the type/text filter controls, the Add and More popup menus, and the Role/Signal/Time-Scale column labels (previously one very dense inline `<div className="column-headings">`) -- into `SignalTreeColumnHeader` in `minimal-cycle-view-panels.tsx`.
- Investigated `minimal-cycle-view-ui.tsx` before choosing a home for this: it hosts a **separate, non-production** "Next" migration scaffold (`MinimalCycleViewUi`, `MinimalCycleViewSignalTreeCanvas`, `MinimalCycleViewBottomEditor`, etc., all `data-testid="next-*"`) that `minimal-cycle-view.tsx` does not render (only its `MinimalCycleViewRibbonTabs` and three `refreshTree*` helpers are imported from there) -- adding to that file would risk being mistaken for wiring a second production path, which the plan explicitly forbids. `minimal-cycle-view-panels.tsx` (already holding `ContextMenuPanel`/`InspectorPanel`/`RenameDialog`/`BulkRegistrationDialog`) is the correct, already-established home for real presentational components.
- `SignalTreeColumnHeader` takes grouped, component-scoped props -- one callback per user action (`onAddEntity`, `onOpenBulkRegistration`, `onCollapseAllGroups`, etc.) -- not the raw state setters; `minimal-cycle-view.tsx` still decides the exact state-update semantics for each action (e.g. `onOpenBulkRegistration` still sets the target group to the last group before opening the dialog, matching prior behavior exactly).
- TypeScript, `check:boundaries`, `check:editor-complexity` (1,626 lines, still far under the 5,000 budget), `check:performance-architecture`, `git diff --check`: PASS. Regression sweep: `left-tree-type-filter.spec.ts`, `signal-filter-clear-affordance.spec.ts`, `full-gui.spec.ts`, `bulk-registration-strict.spec.ts`, `left-tree-interaction.spec.ts` -- 27 pre-existing failures / 25 passed, confirmed byte-identical via `git stash`. Zero new regressions.

## Step 12 — UI Presentation (Bottom Editor section extracted)

- Extracted the Bottom Editor section (tab strip, Follow-Selection checkbox, Bottom-Pin toggle, and the active-tab content wrapper) into `BottomEditorPanel<Tab extends string>` in `minimal-cycle-view-panels.tsx` -- generic over the tab-name union so `onSelectTab`/`onTabKeyDown` keep their exact `BottomTab` typing instead of widening to `string` (TypeScript caught this immediately when the first non-generic version was tried; fixed before it could mask a real type error elsewhere).
- Which editor renders for the active tab (`signalEditor`/`annotationEditor`/`transactionEditor`/`ProblemsPanel`/`AdvancedJsonPanel`) is still decided by `minimal-cycle-view.tsx` and passed in as a `content` prop -- that ternary depends on several different owners' selection state and stays with the caller rather than being duplicated into the presentational component.
- TypeScript, `check:boundaries`, `check:editor-complexity` (1,624 lines), `check:performance-architecture`, `git diff --check`: PASS. Regression sweep: `bottom-tab-header-visibility.spec.ts`, `bottom-context.spec.ts`, `status-context.spec.ts`, `pinned-bottom-target.spec.ts`, `full-gui.spec.ts` -- 26 pre-existing failures / 31 passed, confirmed byte-identical via `git stash`. Zero new regressions.

## Step 12 — UI Presentation (status bar footer extracted)

- Extracted the editor's bottom status bar into `EditorStatusBar` in `minimal-cycle-view-panels.tsx`. It is purely a display of values already computed by their owners (Application/History, Selection, Timeline Geometry/Navigation, Workspace UI State) -- no state or logic of its own, only formatting.
- The few inline ternaries (tool status, selection label, range label, workspace/pin/scope status-context line, time-axis label) are now computed once in `minimal-cycle-view.tsx` and passed as finished strings, rather than duplicated inside the presentational component -- kept the "Time Axis: " / "Workspace: " literal prefixes intact (verified against the pre-extraction JSX line by line) so status text is byte-identical.
- TypeScript, `check:boundaries`, `check:editor-complexity` (1,635 lines), `check:performance-architecture`, `git diff --check`: PASS. Regression sweep: `status-context.spec.ts`, `minimal-cycle-view.spec.ts`, `edit-commit-contract.spec.ts`, `full-gui.spec.ts` -- 24 pre-existing failures / 31 passed, confirmed byte-identical via `git stash`. Zero new regressions.
- This closes out the practical Step 12 JSX split for the current pass: every large, self-contained block called out in the plan (Signal Tree column header, Bottom Editor, Rename/Bulk-Registration dialogs, status bar) now has its own component in `minimal-cycle-view-panels.tsx`/-`ribbon.tsx`, reusing what already existed (`ContextMenuPanel`/`InspectorPanel`/`Ribbon`) rather than re-deriving it. What remains inline in `minimal-cycle-view.tsx` is mostly: the `<main>` shell/title-bar composition, the cycle canvas/viewport `<section>` (ref-heavy DOM mount points for the renderer, not really "presentation" to extract), the resize-handle elements, the still-inline Compatibility/Unsaved-file dialogs (owned by Document Lifecycle), and the Context Menu wiring (already a component, `ContextMenuPanel`) -- i.e. composition and ref plumbing, which is Step 13's territory rather than more JSX-file splitting.

## Next responsibility

Step 13 — Shell reduction: with Steps 3-12 complete, `minimal-cycle-view.tsx` should now mainly be owner construction + composition. Audit what remains inline (viewport/canvas DOM refs, resize handles, Compatibility/Unsaved-file dialogs, `<main>` composition) and decide what, if anything, still needs its own file versus staying as intentional ref-plumbing in the composition shell. Re-verify final LOC against the plan's target range, confirm no duplicate semantic/selection/geometry/render paths exist, and do a final `git fetch origin` + `git diff origin/main...HEAD` review per the goal's stated end conditions.
