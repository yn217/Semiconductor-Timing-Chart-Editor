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
