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

## Current size

- `minimal-cycle-view.tsx`: 2,471 lines / 175,717 bytes
- `use-editor-application-owner.ts`: 104 lines / 6,330 bytes

## Next responsibility

Document Lifecycle: New/Open/Save, pending unsaved decision, request epoch, document replacement, and file-read lifecycle.
