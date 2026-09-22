# Test layer selection policy

Choose the cheapest test layer that can independently prove the product
invariant. A lower layer is not a substitute for a browser journey when the
contract depends on real user-visible behavior; conversely, browser tests
should not duplicate pure calculations or freeze private DOM structure.

Before adding or materially changing a test, record:

1. The product invariant that failed or needs protection.
2. The cheapest valid layer: unit/property, contract/component, browser,
   visual, or performance.
3. Why the selected layer is necessary and whether an existing product-domain
   contract suite can be extended.
4. Whether assertions remain valid after internal refactoring.
5. Expected runtime, fixture size, and viewport rationale for expensive tests.
6. The replacement coverage and issue traceability when moving or merging a
   test.

Use pure unit/property tests for deterministic parsing, validation, state
transitions, and geometry invariants. Use contract/component tests for shared
owners and subsystem behavior. Keep focused browser tests for user-visible
journeys and cross-surface behavior that cannot be established below the UI.
Keep visual and performance budgets separate from functional correctness.

Tests taking more than 10 seconds, using multiple viewports, large fixtures,
or performing a full Save/Open cycle require explicit justification. Do not
remove coverage only because it is slow: map each moved or consolidated test
to the invariant and replacement test, and retain automated integration or
nightly execution for heavy acceptance.

Avoid expected values computed by the same production helper under test.
Prefer independent anchors, round-trip/monotonicity properties, semantic
selection/results, and cross-surface alignment over duplicated implementation
formulas or assertions tied only to private DOM/CSS topology.

## Current execution profiles

In `timing-chart-v2`, the current commands are:

- `npm run test:fast` — static architecture checks and the Vitest unit/contract suite.
- `npm run test:focused -- tests/e2e/<spec>.spec.ts` — a developer-selected focused Playwright target.
- `npm run test:e2e:pr` — explicitly reviewed PR browser cases.
- `npm run test:pr` — repository check gate plus reviewed PR browser cases.
- `npm run test:integration` — reviewed Save/Open and cross-surface journeys.
- `npm run test:visual` — reviewed geometry contract plus visual acceptance.
- `npm run test:performance` — the existing PR-scale performance suite.
- `npm run test:nightly` — complete E2E suite plus nightly performance tests.
- `npm run test:all` — repository checks, complete E2E, and nightly performance.

The profile runner reads per-case reviewed metadata from
`qa/test-suite-review.json`; it does not infer a tier from a filename. The
machine-readable collection is regenerated before profile execution and fails
if a curated case no longer matches the Playwright test list. Until review is
complete, only explicitly reviewed cases enter the focused profiles. The full
E2E suite remains in the scheduled/manual nightly path so unreviewed coverage
is not dropped from automation.
