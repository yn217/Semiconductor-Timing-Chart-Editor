# Blind GUI verifier and journey selection

This document defines how to verify GUI changes from observable production
behavior. It complements, but does not replace, each Issue's acceptance
contract.

## Verifier protocol

1. Start from a fresh application state at the exact commit under review.
2. Read the Issue's intent, journey, expected visible result, and invariants;
   do not use the implementer's completion narrative as a test oracle.
3. Execute the production UI path. Choose 2–5 applicable interruption variants
   from the matrix below; do not mutate private runtime state.
4. Record the first divergent action, visible result, Canonical/History/Dirty
   deltas, stable entity IDs when relevant, and console/page errors.
5. Run the named automated journey headlessly. Record the exact spec, test name,
   viewport, commit, and result.
6. If a defect is found, reduce it to the shortest reproducible journey before
   inspecting the implementation. Keep the failing-before evidence.

### Browser and process safety

- Fresh interactive/manual review uses the Codex in-app browser when available.
- Automated regression journeys use headless Playwright only.
- Do not launch a normal OS browser window, pass `--headed`, set
  `headless: false`, or use `vite --open` from autonomous verifier paths.
- Playwright's Vite server must bind loopback, use a run-owned strict port, and
  never reuse or terminate an unrelated server/process.
- A manual-only headed journey, if ever needed, must be named separately and
  excluded from autonomous and CI commands.

## Fixed journey inventory

The canonical smoke journeys reuse production-path E2E specs rather than
maintaining a parallel test-only state machine:

| Journey | Existing executable coverage |
| --- | --- |
| Fresh -> Cycle / Transaction / Combined; mode loop | `tests/e2e/feature-showcase-startup.spec.ts`, `tests/e2e/mode-isolation-journey.spec.ts` |
| Select -> edit -> Undo -> Redo; Save/Open | `tests/e2e/transaction-gui-authoring.spec.ts`, `tests/e2e/signal-editor-draft-survives-unrelated-edit.spec.ts` |
| Annotation create/drag/Escape | `tests/e2e/annotation-snap.spec.ts` |
| Horizontal far scroll -> select | `tests/e2e/combined-long-fixture-acceptance.spec.ts`, `tests/e2e/feature-showcase-startup.spec.ts` |
| Vertical scroll / mode-local state | `tests/e2e/mode-isolation-journey.spec.ts` |
| Bottom Pin -> selection change | `tests/e2e/pinned-bottom-target.spec.ts` |
| Inspector draft -> selection change | `tests/e2e/transaction-inspector-bottom-draft-sync.spec.ts`, `tests/e2e/signal-editor-draft-survives-unrelated-edit.spec.ts` |
| Save -> edit -> Undo; Save -> reload | `tests/e2e/transaction-gui-authoring.spec.ts`, `tests/e2e/feature-showcase-startup.spec.ts` |
| Dirty Open -> Cancel / Discard | `tests/e2e/unsaved-file-dialog.spec.ts` |
| Zoom -> scroll -> mode switch; pane/layout resize | `tests/e2e/mode-isolation-journey.spec.ts`, `tests/e2e/view-ribbon-slot.spec.ts` |

Run the smallest relevant file/test by default. For every UI correction, keep
one mandatory smoke: the affected production journey plus the mode-isolation
journey when the change touches workspace, selection, viewport, or panel state.
Use `--workers=1 --retries=0` for focused local reproduction; CI may shard only
after server ownership remains isolated.

Example commands from `timing-chart-v2/`:

```powershell
npm run test:e2e -- tests/e2e/mode-isolation-journey.spec.ts --workers=1 --retries=0
npm run test:e2e -- tests/e2e/transaction-gui-authoring.spec.ts --workers=1 --retries=0
```

Do not imply the matrix is fully complete because one row passed. The selected
journey and unrun rows must be reported explicitly.

Known unfilled acceptance point: a dedicated resize-the-browser-window-during-
an-active-pointer-gesture journey is not mapped above. Existing splitter and
responsive tests do not prove that interaction. Do not infer the expected
gesture outcome; product policy and a focused journey remain to be established.

## Interruption variants

Choose only variants relevant to the changed contract:

- first entry / fresh reload
- Undo / Redo
- Escape / Cancel
- selection change
- mode switch
- panel open / close
- horizontal / vertical scroll
- zoom
- resize
- repeated action
- Save / reload
- dirty Open / New
- async render pending

## Evidence record

For each verifier run, record:

```text
commit:
journey/spec and test name:
fresh start: yes/no
production UI path: yes/no
viewport:
selected interruption variants:
expected / actual:
Canonical, History, Dirty deltas:
stable IDs checked:
console/page errors:
result and remaining uncertainty:
```

DOM attributes and observational counters may be read as evidence. They must
not be written to force test state. The verifier reports behavior; it does not
certify correctness merely because a test or workflow is green.
