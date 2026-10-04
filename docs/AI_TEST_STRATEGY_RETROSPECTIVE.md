# AI Test Strategy Retrospective

This document records lessons learned from AI-driven development of the Timing Chart Editor and is intended to be reused when defining `AGENT.md` / `AGENTS.md` rules for future projects.

The goal is not to maximize test count. The goal is to keep AI implementation fast while retaining tests that catch real product regressions.

---

## 1. What we learned

### Tests were necessary, but test count was a poor quality metric

The project did find real production defects through tests. Examples included persistence/type errors, browser-only geometry and lifecycle regressions, performance regressions, virtualization failures, and state-management mistakes.

However, a large suite also accumulated tests that were weak proxies for product correctness:

- tests that matched source-code strings or regular expressions;
- tests that pinned private DOM topology, CSS classes, or internal implementation shape;
- tests that asserted internal counters without also checking the user-visible result;
- repeated copies of the same invariant across many specs;
- tests whose expected result was derived through the same production helper/path as the implementation under test.

A suite can therefore be large and GREEN while still missing a real product bug.

**Rule for future projects: never use number of tests as the primary confidence metric.**

---

## 2. AI-specific failure mode

AI can produce a consistent but wrong implementation and test at the same time:

```text
misread requirement
-> implement the wrong behavior
-> write a test based on the same interpretation
-> implementation and test both agree
-> GREEN
```

This is more dangerous than a simple missing test because the presence of a passing test can create false confidence.

The important question is therefore not:

> Does a test exist?

It is:

> Is the oracle independent enough to detect a wrong implementation?

Prefer expected behavior derived from product requirements, fixed examples, independent formulas, persisted round trips, visible browser behavior, or a separately implemented reference model.

Do not compute both the actual and expected value through the same production code path.

---

## 3. Recommended development flow

Do **not** require a large test suite before implementation.

Use this order:

```text
1. Define acceptance before implementation.
   - user-visible result
   - invariants
   - persistence / Undo / identity requirements where relevant
   - performance bound where relevant

2. Implement the feature.

3. Immediately add only the smallest high-value focused regression test.
   - normally 1–3 strong tests
   - test the product contract, not the implementation shape

4. Run the smallest relevant verification.
   - unit / static / architecture where useful
   - focused browser test only when browser behavior matters

5. Have an independent verifier check the acceptance when risk is high.
   - verifier starts from the requirement/journey
   - verifier must not merely repeat the implementer's explanation

6. Continue implementation.
   - do not stop the development queue for broad test execution

7. After the feature set stabilizes:
   - remove duplicate/low-signal tests
   - consolidate common invariants
   - select a small PR gate
   - keep exhaustive matrices in integration/nightly/manual tiers

8. Near project completion:
   - run the broad regression suite once
   - run a short mutation/negative-control audit
```

Do not defer **all** testing until the entire product is complete. Save/Open, Undo/Redo, stable identity, state ownership, virtualization bounds, and major performance invariants should get focused regression coverage close to the implementation that establishes them. Otherwise later regressions become difficult to localize.

---

## 4. Test hierarchy

Every test should have a clear role.

### PRODUCT_CONTRACT

Preferred and most valuable.

Tests what a user or persisted document can observe.

Examples:

- edit -> visible result is correct;
- Save -> Open preserves semantics and types;
- Undo restores the exact semantic state;
- switching views does not mutate Canonical / History / Dirty;
- 10k entities still mount only a viewport-bounded set;
- two panes remain aligned to the same semantic time.

These are the main tests that belong in focused and PR browser gates.

### ARCHITECTURE_INVARIANT

Useful when the architectural constraint is itself important.

Examples:

- Signal rename does not rebuild all WaveDrom owners;
- view-only interaction performs zero canonical validation;
- scroll does not rebuild RowLayout;
- a cache/lifetime owner remains bounded.

These should usually accompany a product-visible assertion. Internal counters alone are not sufficient proof of correctness.

### IMPLEMENTATION_GUARD

Use sparingly.

Examples:

- source regex checks;
- exact private method names;
- exact React hook arrangement;
- private DOM topology;
- exact internal class names.

These are allowed only for a specific high-value forbidden pattern that cannot be guarded more robustly. They are not equivalent to product tests and should not dominate the PR gate.

---

## 5. Avoid tautological tests

Treat a test as suspicious when:

- expected output uses the same production helper as actual output;
- the test reproduces the implementation algorithm line-by-line;
- a source-code regex is used instead of checking the behavioral consequence;
- a private counter is the only assertion;
- exact geometry numbers were copied from current output without an independent reference;
- changing to a different correct implementation would make the test fail.

For geometry, timing, serialization, and performance contracts, prefer an independent oracle where practical.

---

## 6. E2E policy

Browser E2E is expensive. Use it only where the browser is part of the contract.

### Normal implementation loop

```text
unit / static / architecture as applicable
+ owning focused browser test if required
```

Target focused browser execution: approximately **1–3 minutes**.

### PR gate

Keep only merge-blocking representative journeys.

Target browser gate: approximately **5 minutes**. If it repeatedly exceeds about 8 minutes, reclassify or parallelize tests instead of accepting the growth.

Functional browser tests may use safe parallel workers.

Performance/latency tests should remain isolated when parallel load would corrupt measurements.

### Integration / performance / visual

Run only when the changed contract requires that tier.

### Full E2E

Do not run after every implementation slice.

Use full E2E for:

- nightly/manual coverage;
- major stabilization points;
- final project/release regression;
- one final after-run against a retained baseline.

A child Issue that satisfies its focused acceptance must not remain open merely because Full E2E has not run.

---

## 7. Viewport policy

Do not duplicate every functional test across every viewport.

Default:

```text
functional correctness
-> one representative viewport

layout / responsive / pane geometry
-> required viewport matrix

performance
-> only the viewport defined by the performance contract

visual regression
-> approved representative viewport(s)
```

Two viewports are valuable when layout can change the result, not as a blanket rule.

---

## 8. Mutation / negative-control audit

Occasionally verify that the test suite can actually detect a broken product.

Do not run exhaustive mutation testing.

Use a short, bounded spot-check:

```text
target: about 10 minutes
hard stop: 15 minutes
3–4 high-value mutations
smallest mapped focused test only
no PR tier
no integration tier
no full E2E
non-blocking: normal implementation continues in parallel
```

Good sample mutations:

- view-only action incorrectly changes Dirty/History;
- Signal rename rerenders every waveform owner;
- virtualization mounts all 10k entities;
- Save/Open drops one persisted field;
- Undo fails to restore one semantic edit;
- shared time mapping is deliberately offset.

Record only:

```text
mutation
expected detecting test
KILLED / SURVIVED
coverage/oracle gap if survived
action
```

The purpose is to detect false confidence, not to maximize mutation score.

---

## 9. What should be written into AGENT.md

The following is the recommended copy-ready policy for a future project.

### Test strategy

1. Define acceptance before implementation, but do not create a large test suite up front.
2. Implement the product behavior first, then add the smallest high-value regression test needed to protect the contract.
3. Prefer PRODUCT_CONTRACT tests over implementation-shape tests.
4. Never use test count as a quality metric.
5. A passing test written from the same mistaken interpretation as the implementation is not independent evidence.
6. Do not derive expected values through the same production code path being tested.
7. Internal counters/architecture assertions supplement user-visible assertions; they do not replace them.
8. Source-regex, private DOM topology, CSS-class, and exact implementation-shape tests must be rare and justified.
9. Save/Open, Undo/Redo, stable identity, view-only state, virtualization bounds, and critical performance invariants receive focused regression tests close to implementation time.
10. Do not require broad E2E before continuing implementation.
11. Run only the smallest relevant focused tests during normal development.
12. Target focused browser verification at 1–3 minutes.
13. Keep the mandatory PR browser gate near 5 minutes; investigate/reclassify if it exceeds 8 minutes.
14. Do not run every functional test at multiple viewports; reserve viewport matrices for layout/responsive contracts.
15. Isolate performance tests from parallel load; safely parallelize ordinary functional browser tests.
16. Full E2E is nightly/manual/final stabilization, not a per-Issue gate.
17. A completed Issue may close from its own focused acceptance without waiting for Full E2E.
18. Periodically perform a 10-minute, 3–4 case negative-control/mutation spot-check to confirm tests catch real regressions.
19. Mutation/test-quality audits must not block normal implementation; run them in parallel where possible.
20. When a test does not protect a real product contract, consolidate, move tier, rewrite, or delete it.

---

## 10. Decision rule when adding a new test

Before adding a test, the agent should answer:

```text
What real bug would this test catch?
Would the test fail if that bug were deliberately introduced?
Is the expected result independent from the implementation under test?
Can this be tested more cheaply below the browser layer?
Is an equivalent contract already tested elsewhere?
Does this need to block every PR?
```

If these questions have no strong answer, do not add another test merely because code changed.

---

## 11. Main retrospective conclusion

The main mistake was not "having tests."

The mistake was allowing this pattern to grow:

```text
every implementation detail
-> another test
-> another browser journey
-> another helper
-> another mandatory verification step
```

That increases maintenance and execution time without proportionally increasing defect detection.

The preferred future pattern is:

```text
clear acceptance
-> implementation
-> few strong independent product-contract tests
-> focused verification
-> continue development
-> consolidate later
-> broad regression only at stabilization points
```

Optimize for **bugs detected per minute of developer/agent time**, not for number of tests or percentage of lines exercised.
