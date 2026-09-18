# AI-assisted change workflow

This workflow makes corrections verifiable from the reported user journey. It
does not replace engineering judgment, and a checklist is not proof by itself.

## Bug-fix state machine

For a behavior correction, record evidence for each applicable transition:

```text
REPORTED
  -> REPRODUCED
  -> TEST_RED
  -> ROOT_CAUSE_CONFIRMED
  -> IMPLEMENTED
  -> TEST_GREEN
  -> INDEPENDENT_VERIFIED
  -> CLOSED
```

Do not close a reproduced GUI defect directly from REPORTED or IMPLEMENTED.
Before implementation, preserve the failing journey, assertion, or equivalent
observable evidence. After implementation, repeat that same journey and verify
the relevant Canonical, History, Dirty, identity, and geometry invariants.

### Reproduction exceptions

If a defect is intermittent or cannot safely be reproduced on demand, do not
invent a reproduction or start a speculative behavior change. Record the exact
environment, attempts, last observable stage, and uncertainty; add narrowly
scoped instrumentation or a deterministic regression harness first. Feature
work that is not a correction may mark bug-only fields N/A with a reason; it
must still provide feature-specific acceptance evidence.

## Evidence by change type

- GUI behavior corrections require a production-path browser journey for
  closure. Unit tests and typecheck alone are insufficient.
- Non-GUI corrections use the narrowest deterministic test that proves the
  affected contract; include browser evidence only when the affected behavior
  depends on the browser/UI.
- Feature PRs do not need fabricated red-before evidence. State `N/A — feature
  work` and provide the planned acceptance journey and its result.
- A verifier should start from fresh application state and execute the journey
  from the user's intent, not rely solely on the implementer's conclusion.
- State what was not verified and any remaining uncertainty. Never claim more
  than the evidence proves.

## Bug classes

Use one or more root-cause categories in the Issue/PR evidence:

```text
STALE_MOUNT_STATE
CROSS_MODE_STATE_LEAK
FIRST_ENTRY_ONLY
ASYNC_STALE_PUBLICATION
WRONG_INVALIDATION_DOMAIN
GEOMETRY_DRIFT
HIDDEN_SURFACE_ACTIVE
DRAFT_SELECTION_RACE
UNDO_REDO_STATE_DESYNC
FOCUS_OWNERSHIP
VISUAL_REFERENCE_MISMATCH
OTHER (explain)
```

## Current Contract rule

When corrections accumulate, reconcile active requirements, superseded
requirements, and the latest acceptance into one authoritative Issue section or
repository document. Link historical discussion for context, but do not require
implementers or verifiers to infer the current contract from a long comment
thread.

## Closure rule

Close only when the current contract's acceptance is satisfied or remaining
items are explicitly split/tracked and the parent Issue's closure policy allows
that. A workflow artifact, green test, or implementation statement alone is
not acceptance evidence.
