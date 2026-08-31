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

## Step 5 — Selection (state authority seam)

- Owner: `apps/editor/src/application/use-selection-owner.ts`
- The selected signal/multi-signal/group/spacer/annotation/transaction state and synchronous event-handler mirrors now have one React owner.
- Existing production selection handlers route their reads and writes through the owner while transition-level APIs and Bottom/Inspector synchronization remain the next Step 5 slice.
- Focused browser: Status/selection and Bottom synchronization passed; the Inspector geometry and Transaction helper failures reproduce the recorded baseline issues (297px vs 300px and the ambiguous Transaction button locator).
- TypeScript and diff-check: PASS.

## Current size

- `minimal-cycle-view.tsx`: 2,357 lines / 167,581 bytes
- `use-editor-application-owner.ts`: 106 lines / 6,470 bytes
- `use-document-lifecycle.ts`: 204 lines / 11,128 bytes
- `use-selection-owner.ts`: 59 lines / 3,061 bytes

## Next responsibility

Selection: selected entities, ref mirrors, selection commands, and Bottom/Inspector/Transaction synchronization.
