# Focused mutation evidence

Date: 2026-09-24  
Branch: `codex/issue-782-test-architecture`  
Pre-batch HEAD: `92289372e4aae33b904eb528a51e631ae5c5c7a7`

Each production mutation below was temporary, was applied only to answer whether
the named focused contract detects the regression, and was removed immediately
after the test. No mutation is present in the committed production tree.

| Contract | Temporary mutant | Focused test evidence | Result |
| --- | --- | --- | --- |
| Transaction row density | Force `.transaction-list-row > button` height to `48px` instead of the compact production height | `transaction-bottom-panel-table.spec.ts` at 1280×720 failed at the new row-height assertion: expected `<= 32px`, received `48px`. The unmutated two-viewport test passed 2/2. | Killed |
| Transaction-cycle scale projection | Pass literal scale `1` rather than `cyclesPerTc` into ruler-presentation rebuilding | `issue-750-geometry-10-to-50.spec.ts` failed its independent source-anchor assertion: expected `[0, 10, 20, 30]`, received `[0, 1, 2, 3]`. Mutant removed. | Killed |
| AI preview-only policy | Temporarily auto-apply every user proposal, including document-mutating proposals while the setting is “Auto-apply view-only operations” | `ai-proposal-workflow.spec.ts` case “Auto-apply view-only operations applies a view-only proposal immediately, but never a document-mutating one” failed because the preview was already absent after the document-mutating proposal. Mutant removed. | Killed |
| AI stale revision | Temporarily make `isAIPreviewFresh` always return true | `ai-proposal-workflow.spec.ts` case “AI proposal rejects a stale revision after an intervening semantic edit” failed: expected the stale-preview message, received “Validated”. Mutant removed. | Killed |
| Bookmark SPA URL stability | Temporarily call `history.pushState` to add `#bookmark-mutation` during cycle navigation | `issue-753-bookmark-navigation-stays-in-app.spec.ts` failed immediately on the Cycle double-click reveal: the guard expected no navigation, but observed `http://127.0.0.1:51521/#bookmark-mutation`. With the mutation removed, the strengthened exact-URL guard passed all three modes (3/3). | Killed |
| Cycle frozen-column position | Temporarily translate `[data-role='frozen-label-rows']` by `-scrollLeft` during timeline scroll | `cycle-frozen-columns-scroll.spec.ts` at 1280×720 failed the stationary-X assertion: expected `265px`, received `205px` (60px scroll). After restoring production code, the same focused case passed (1/1). | Killed |

All temporary mutations were reverted before commit. The fixed-column negative run generated a Playwright trace in the ignored `test-results` directory; it is local diagnostic output and is not part of the patch.

These results are focused sensitivity evidence, not a claim that the complete
test profile or full suite is mutation-tested. Baseline aggregate runtime was
not recorded in the original inventory, so no before/after aggregate runtime is
inferred here.
