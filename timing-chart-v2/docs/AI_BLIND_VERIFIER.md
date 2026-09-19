# Blind fresh-state verifier protocol

This protocol is for an independent verifier, not the implementer. The verifier starts from a fresh production page, reads the Issue's Intent/Journey/Invariants, performs the user-visible journey, records the actual result, and only then inspects implementation details if the result is unexpected.

## Required evidence

Record the commit SHA, journey version, viewport, browser/runtime, initial document, exact actions, expected result, actual result, console/page errors, and Canonical/History/Dirty deltas. Use production DOM and public UI actions; do not call private runtime methods or mutate internal state.

## Journey selection

Run the target journey and select 2–5 relevant variants from the table. A GUI correction must include at least one fresh-start or mode/selection variant and one interruption variant when applicable.

| Journey | Existing production journey | Useful variants |
| --- | --- | --- |
| Fresh Cycle | `tests/e2e/feature-showcase-startup.spec.ts` | reload, resize |
| Fresh Transaction | `tests/e2e/acceptance-397-sample-a.spec.ts` | reload, selection |
| Fresh Combined | `tests/e2e/gui-split-view-visual.spec.ts` | resize, splitter |
| Mode loop | `tests/e2e/mode-isolation-journey.spec.ts` | rapid switch, scroll |
| Draft / selection interruption | `tests/e2e/transaction-inspector-bottom-draft-sync.spec.ts` | selection change, cancel |
| Undo / Redo | `tests/e2e/edit-commit-contract.spec.ts` | repeat action, selection |
| Escape / cancel | `tests/e2e/annotation-preview-update.spec.ts` | mode switch, reload |
| Horizontal far scroll | `tests/e2e/transaction-viewport-hscroll.spec.ts` | select after scroll, zoom |
| Vertical far scroll | `tests/e2e/combined-long-fixture-acceptance.spec.ts` | select after scroll |
| Bottom pin / selection | `tests/e2e/bottom-context.spec.ts` | pin toggle, selection change |
| Inspector draft | `tests/e2e/layout-inspector.spec.ts` | cancel, apply, undo |
| Save / reload | `tests/e2e/file-beforeunload-dirty-guard.spec.ts` | dirty open, cancel |
| Rapid mode switching | `tests/e2e/mode-isolation-journey.spec.ts` | pending render, zoom |
| Resize during interaction | `tests/e2e/keyboard-tabs-resizers.spec.ts` | splitter limits, cancel |

The mapping is a starting point, not proof of acceptance. The verifier must use the Issue's current journey and record any mismatch between the named spec and the actual user path.

## Pass/fail rule

Do not close from a screenshot, a unit test, or the implementer's report alone. A pass requires the expected visible result plus the applicable semantic and view-only invariants. A failure must name the first divergence and classify it as product code, test targeting, or environment. Fixed waits are not evidence of readiness; use the application's semantic readiness signal.
