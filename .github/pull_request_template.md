## Issue / Contract

<!-- Link the correction Issue and the active acceptance contract. -->

## Reproduction before fix

- Commit/environment:
- Production journey:
- Expected:
- Actual:

## Failing-before evidence

- Test or artifact:
- Observed red result:

## Root cause

- Root cause:
- Violated invariant:
- Bug class:
- Why existing tests missed it:

## Fix scope

- Files intentionally changed:
- Areas explicitly unchanged:
- Forbidden shortcuts avoided:

## Test design (required when tests are added or changed)

- Product invariant protected:
- Cheapest valid test layer (`unit` / `property` / `contract` / `component` / `browser` / `visual` / `performance`):
- Why is a more expensive layer necessary, if used?
- Existing product-contract suite that could be extended (or why none applies):
- Is the assertion independent of private DOM/CSS/implementation details?
- Expected runtime and viewport/fixture justification (required for >10s, multiple viewports, large fixtures, or full Save/Open):
- Replacement coverage and traceability, if a test is moved or consolidated:

## Verification

- Green-after focused tests:
- Adjacent regression tests:
- Browser acceptance / artifact:
- Independent verifier:
- Fresh-start and production-path evidence:
- Remaining uncertainty:

## Safety checklist

- [ ] Canonical / History / Dirty contracts preserved.
- [ ] No Golden, threshold, or mask was weakened.
- [ ] No private runtime API is the only acceptance path.
- [ ] GUI correction includes a production journey or an explicit environment blocker.
