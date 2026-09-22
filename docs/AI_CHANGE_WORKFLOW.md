# AI-driven correction workflow

This repository uses the following evidence order for bug corrections:

`REPRODUCTION -> FAILING TEST -> ROOT CAUSE -> FIX -> INDEPENDENT VERIFICATION`

## Before changing production code

Record the production path, commit, initial state, exact actions, expected result, actual result, and the violated invariant. A race or intermittent issue may begin with instrumentation, but must still identify the first observable divergence before a speculative fix.

GUI bugs require a production-browser journey unless the Issue explicitly records why that is impossible. Unit, typecheck, and static checks are supporting evidence, not a substitute for a user journey.

## Required root-cause record

Every correction records:

```text
Symptom:
Root cause:
Violated invariant:
Why existing tests missed it:
Bug class:
Prevention:
```

Use one of these bug classes where applicable: `STALE_MOUNT_STATE`, `CROSS_MODE_STATE_LEAK`, `FIRST_ENTRY_ONLY`, `ASYNC_STALE_PUBLICATION`, `WRONG_INVALIDATION_DOMAIN`, `GEOMETRY_DRIFT`, `HIDDEN_SURFACE_ACTIVE`, `DRAFT_SELECTION_RACE`, `UNDO_REDO_STATE_DESYNC`, `FOCUS_OWNERSHIP`, `VISUAL_REFERENCE_MISMATCH`.

## Independent verification

The verifier starts from a fresh application state and the Issue's journey/invariants. It records the commit, journey version, actual result, and relevant variants such as Undo/Redo, cancel, selection change, mode switch, scroll, zoom, resize, and save/reload. The verifier must not rely only on the implementer's explanation or private runtime APIs.

## Current Contract

When repeated corrections create conflicting requirements, consolidate the active requirement, superseded behavior, forbidden shortcuts, latest reference, and acceptance journey in one authoritative Issue or document. Do not use an unbounded comment history as the only source of truth.

## Closure rule

Do not close a correction from `REPORTED -> IMPLEMENTED -> CLOSED`, from tests passing alone, or from a screenshot alone. Close only when the reproduction, red-before evidence, root cause, focused fix, and independent verification are recorded. If browser acceptance is environment-blocked, record the exact blocker and leave the Issue open.
