# Hot-File Refactor Playbook

Purpose: prevent another #258/#312-style stall where a large React hot file is repeatedly inspected or only 10-50 lines are moved per session.

This file is CONTROL GUIDANCE only. It does not activate #258 or #312. Those Issues remain deferred until the user/ChatGPT explicitly re-enables them in `.codex/ISSUE_ORDER.txt`.

## Core rule

Do not treat file splitting itself as the first operation.

Correct order:

```text
behavior fence
-> choose one closed responsibility
-> create an owner seam IN PLACE
-> move all call sites to the owner API
-> prove the parent no longer depends on internals
-> move the whole owner to another file
-> focused browser/type tests
-> commit/push
-> next responsibility
```

A refactor step succeeds because one responsibility changed ownership, not because N lines moved.

## Anti-patterns learned from #258/#312

Do not repeat these:

- fixed 200/300 LOC movement quotas
- one huge 1000+ line cut before a seam exists
- arbitrary source-line ranges as responsibility boundaries
- extracting Title Bar / Context Menu / tiny helpers while core closure coupling stays unchanged
- generating a new shell/interface scaffold and assuming the old runtime logic will migrate automatically
- repeatedly re-inspecting the same file without production code change
- using Props explosion as the final architecture
- blocking all product Issues until architecture cleanup is finished

## Time budget / stop rule

A single responsibility extraction gets one focused implementation session.

- First 10-15 minutes: locate the responsibility, its state, refs, effects, callbacks and tests.
- Next 20-40 minutes: make the seam and route production call sites through it.
- If there is still no production-path change after that, STOP analysis and switch to the backup plan for that step.
- Do not spend a second full session repeating the same dependency analysis.
- Do not declare success for a 10-50 line cosmetic move unless that move fully transfers ownership of a responsibility.

## Step 0 — Activation gate

Only use this playbook when an explicit Issue says a hot file must be structurally changed OR a production Issue cannot be fixed safely without such a change.

Before starting:

1. Confirm the Issue is enabled in `.codex/ISSUE_ORDER.txt`.
2. Keep unrelated product Issues moving; architecture work must not globally block the queue.
3. Record current main HEAD and worktree state.
4. Identify existing focused tests for the behavior being touched.
5. Do not change Golden/reference/threshold/masks to make a refactor pass.

Backup if no focused test exists: create a characterization test first for the exact observable behavior, then continue. Do not attempt the structural move without a behavior fence.

## Step 1 — Pick a CLOSED RESPONSIBILITY, not a line range

A valid slice owns one coherent workflow including its state/ref/effect/callback chain.

Good examples:

- Viewport Navigation: zoom state + Fit All + Fit Selection + Navigate to Cycle + wheel zoom + geometry conversions
- Range Selection: range state + pointer lifecycle + snapping + range band refresh + semantic range output
- Document Lifecycle: New/Open/Save + dirty decision + epoch/stale async guard + session replacement
- Selection: selected IDs + refs + select/clear/select-all + projection decoration + UI synchronization
- Pointer/Gesture: pointer down/move/up + drag state + snapping + command commit/cancel
- Command/History: session + execute/batch + undo/redo + history publication + dirty semantics

Bad slices:

- arbitrary lines 600-1900
- one button
- one icon
- one dialog with no ownership transfer
- a helper used by the same parent state afterward

Selection criterion: after completion, the parent should be able to say `owner.action()` or read `owner.state`, without reimplementing that responsibility internally.

## Step 2 — Build the seam IN PLACE first

Do not immediately move hundreds of lines to another file.

Inside the existing component/module, create a temporary owner boundary such as:

```ts
const viewportOwner = createViewportOwner({
  viewport,
  ruler,
  geometry,
  setZoom,
  timelineRuntimeRef,
});
```

or a hook:

```ts
const viewportOwner = useViewportOwner({...});
```

The owner may initially live in the same file. That is intentional.

Move into the owner, as one coherent unit:

- state mutations for that responsibility
- related refs
- related effect/listener lifecycle
- derived calculations
- commands/callbacks
- cleanup

Temporary input/output interfaces may be large. The goal of this step is ownership, not elegance.

### Step 2 success condition

The parent no longer contains the implementation logic for the responsibility. It only creates/uses the owner.

### Backup Plan B — closure explosion

If creating the owner causes dozens of missing closure dependencies:

1. Do NOT add 80 unrelated scalar props one by one.
2. Group dependencies by existing owner/source:
   - `documentPort`
   - `historyPort`
   - `selectionPort`
   - `timelineRefs`
   - `uiState`
3. Pass grouped ports/objects temporarily.
4. Keep behavior identical.
5. Continue until the owner compiles in the same file.

This is a temporary bridge, not the final API.

## Step 3 — Route ALL production call sites through the owner

This is the step that #258 mostly skipped.

Search for every direct call/state mutation belonging to the responsibility and route it through the owner in the same work unit.

Example for Viewport:

```text
wheel handler          -> viewportOwner.zoomBy(...)
Fit All button         -> viewportOwner.fitAll()
Fit Selection          -> viewportOwner.fitSelection()
Navigate to Cycle      -> viewportOwner.navigateToCycle(...)
Ruler refresh          -> viewportOwner.refreshPresentation()
```

Do not leave duplicate direct paths in the parent.

### Step 3 success condition

There is one production entry point for the responsibility. Parent-level direct implementation is gone.

### Backup Plan C — cyclic dependency

If owner A needs owner B and B needs A:

1. Identify the direction of semantic authority.
2. Replace the reverse dependency with an event/callback or readonly port.
3. Canonical state owner may be read by projection/UI; UI must not become semantic authority.
4. History/command execution stays upstream of rendering.
5. If the cycle cannot be removed in one session, keep both owners in the same file but with explicit ports. Do NOT return to free closure access.

Commit only after the cycle is removed or contained behind explicit ports.

## Step 4 — Test BEFORE physical file movement

Run:

- TypeScript typecheck
- `git diff --check`
- focused unit tests for the responsibility
- focused real-browser scenario when user-visible interaction is involved

At this point the code may still be in the original file. That is acceptable.

This checkpoint answers: "Did ownership change without changing behavior?"

### Backup Plan D — behavior regression

If tests fail after seam creation:

1. Keep the new owner boundary.
2. Compare old and new call ordering, effect attachment, refs and cleanup.
3. Fix the owner until focused behavior passes.
4. If the owner boundary itself is proven wrong, revert only this uncommitted responsibility attempt, not unrelated earlier refactors.
5. Record the blocker and choose a smaller *closed responsibility*, not a smaller line count.

Do not fall back to extracting leaf UI components.

## Step 5 — Move the owner WHOLE to another file

Only after Steps 2-4 pass, physically move the owner implementation.

Expected move size can be hundreds of lines. There is no minimum or maximum LOC gate.

Example:

```text
minimal-cycle-view.tsx
  useViewportOwner(...) only

runtime/use-viewport-owner.ts
  zoom/Fit/navigation/geometry/listener implementation
```

Because call sites already use an explicit seam, this move should be mostly mechanical.

### Step 5 success condition

- old implementation removed from parent
- production path imports/uses new owner
- no duplicate implementation
- focused tests pass
- typecheck passes
- diff-check passes

Commit and push here.

### Backup Plan E — file move breaks imports/lifecycle

If same-file owner passes but cross-file move fails:

1. Do not redesign the owner.
2. Fix imports/types first.
3. If module cycles appear, move shared types/pure utilities to a small neutral module.
4. If React lifecycle is the problem, keep hook creation in the component and move the runtime class/controller implementation out.
5. If still blocked, commit the successful same-file ownership seam only if it materially removed free closure coupling; schedule the mechanical file move as the next step.

This is the one case where a step can finish without file-size reduction, because ownership has genuinely changed.

## Step 6 — Simplify the temporary port AFTER extraction

Only now reduce overly large dependency objects.

Look for:

- multiple scalar setters that should be one command API
- duplicated readonly state
- mutable refs exposed unnecessarily
- UI state passed into semantic runtime
- renderer APIs leaking back into application state

Do not combine this cleanup with the initial extraction unless it is trivial.

## Step 7 — Repeat by dependency order

For `MinimalCycleView`, if this work is explicitly re-enabled later, preferred order is:

```text
R1 Viewport Navigation / Zoom / Fit
R2 Range + Timeline Geometry
R3 Document Lifecycle / Open-New-Save / epoch
R4 Selection ownership
R5 Pointer / Drag / Gesture interaction
R6 Command / History / Dirty application owner
R7 Remaining UI composition shell
```

Reason: start with responsibilities that already have partial runtime seams and measurable behavior, then remove stateful closures, and move UI shell last.

Do not restart the old CUT-A/CUT-B/CUT-C/CUT-D plan unless the current code has already acquired seams that make those cuts mechanical.

## Backup Plan F — owner is still too large

If one owner remains >~800-1200 lines and cannot be understood safely:

Split by lifecycle/semantic boundary, not UI fragments.

Example:

```text
TimelineOwner
  -> ViewportNavigationController
  -> TimelineGeometryController
  -> PointerGestureController
  -> RenderRefreshCoordinator
```

Each child must have a narrow API and one direction of dependency.

Do not split merely because of LOC.

## Backup Plan G — parallel rewrite

Use a parallel rewrite only if ALL are true:

- old behavior is well-covered by characterization/parity tests
- ownership boundaries are already understood
- new implementation can be mounted independently
- parity can be automated
- the rewrite is explicitly funded as a feature-sized project

If these conditions are not met, a parallel shell/scaffold only creates a second incomplete architecture. That is what happened with #312.

## Backup Plan H — cannot make meaningful progress in one session

If after Plan A/B/C no responsibility ownership can be transferred:

1. Stop the refactor Issue; mark the precise coupling blocker.
2. Do not continue inspecting it indefinitely.
3. Return to product Issue burn-down.
4. Let future product work create seams naturally around the hotspot.
5. Re-attempt only when a specific responsibility has become separable or when tests/ownership infrastructure improve.

This is not failure; it prevents architecture work from blocking the product.

## Commit policy

Valid commit:

- one responsibility has a new owner/seam OR a mechanically moved owner
- old direct path removed
- production path uses the owner
- typecheck + diff-check pass
- focused behavior passes

Invalid "progress" commit:

- OWNERSHIP.md only
- comments/planning only
- wrapper around unchanged children
- 10-line helper extraction while parent still owns the workflow
- interface/scaffold unused by production

## Reporting format

After each responsibility:

```text
Responsibility: <name>
Ownership transfer: COMPLETE / PARTIAL / BLOCKED
Parent direct implementation remaining: YES / NO
Production path uses new owner: YES / NO
Focused tests: PASS / FAIL
Browser evidence: PASS / N/A / FAIL
Typecheck: PASS / FAIL
Commit: <sha or none>
Backup plan used: NONE / B / C / D / E / F / G / H
Next responsibility: <name>
```

Do not report LOC reduction as the primary metric.

## Definition of successful refactor campaign

A hot-file refactor is complete when:

- stateful responsibilities have explicit owners
- parent is composition/orchestration rather than implementation
- semantic ownership direction is clear
- no duplicate old/new production paths remain
- focused and browser behavior remains stable
- file sizes reduce as a consequence

The file does not need to reach an arbitrary LOC target.
