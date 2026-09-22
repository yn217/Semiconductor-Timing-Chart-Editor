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
