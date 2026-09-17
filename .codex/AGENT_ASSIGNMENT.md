# Claude / Codex Issue Ownership

Last reconciled: 2026-09-18 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Product branch: `main`
Observed main: `2908001b3c8bc778a7eebf7fffca742e97d445b1`
Authoritative Codex queue: `codex-control:.codex/ISSUE_ORDER.txt`

Use two-agent development with **one active implementation owner per Issue**.

- **Codex**: architecture, semantic ownership, runtime/geometry correctness, bounded implementation, source tracing, measured performance.
- **Claude**: independent real-browser QA, visual/product UX, accessibility journeys, adversarial PR verification, test-validity review, Product Decision evidence.

## Shared architecture contract

```text
Canonical
-> Semantic Commands / History
-> Projection / Derived Geometry
-> Renderer
-> DOM
```

Rules:
- one logical mutation = one semantic operation = one History unit
- stable opaque IDs; no array-index/name/DOM-order semantic identity
- view-only operations: Canonical/History/Dirty delta = 0
- source time -> DisplayTimeMapping -> TimeAxisGeometry/LocalGeometry -> screen
- DOM/ruler pixels are not semantic authority
- user-visible real-browser repro overrides narrower automated PASS
- no Golden/reference/threshold/mask weakening
- real pointer workflows require real browser acceptance
- do not reset/stash/clean/delete unrelated work
- PR-branch PASS is not closure until the original journey is re-run on actual main

# CODEX — ACTIVE IMPLEMENTATION QUEUE

## X1. #639 — Cycle-mode Transaction creation leaves invalid Bottom state — ACTIVE FIRST

Owner: **Codex**

Current main still reproduces the product bug. PR #654/test work does not fix the production route.

Required:
- reproduce through visible Cycle UI
- trace mode/context/Bottom-tab ownership
- fix real behavior, not only test setup
- view-only context transitions must not mutate Canonical/History/Dirty
- re-run exact real-browser journey after merge on main

## X2. #676 — Annotation Canvas -> Inspector synchronization

Owner: **Codex**

Real drag moves the Annotation handle, but Inspector anchor-X remains stale.

Trace:
```text
pointer drag
-> interaction owner
-> semantic/canonical anchor commit
-> History
-> selected stable Annotation ID
-> Inspector/Bottom projection invalidation
```

Acceptance includes one drag = one semantic operation, Undo/Redo exact, Save/Open exact, no re-selection needed to refresh Inspector.

## X3. #651 — Dialog focus restoration

Owner: **Codex**

Important correction: broad focus-visible styling is **not broken**. Real Tab/Shift+Tab shows working focus indicators on sampled controls.

Remaining bug only:
- dialog close should restore focus to the invoking control when still valid
- otherwise explicit deterministic fallback
- preserve working dialog focus trap
- verify Cancel / Apply / Escape, especially Bulk Signal Registration

Do not add an app-wide focus-ring override for the earlier false-positive observation.

## X4. #650 — Transaction selection minimal reveal

Owner: **Codex**

Current behavior resets horizontal scroll to 0 irrespective of selected Transaction position.

Implement:
- already visible -> no scroll
- off-screen -> minimal reveal from semantic start/end and current viewport
- no blind reset to 0
- view-only zero delta

## X5. #624 — Cycle restore/mode-entry projection completeness

Owner: **Codex**

PR #670 is independently verified PASS:
- 6/6 restored annotations via Transaction -> Cycle
- 6/6 via Combined -> Cycle
- mode persists across reload
- view-only invariants preserved

Coordinate safe rebase/merge; #636 is superseded. Closure only after main re-Acceptance.

## X6. #646 — Transaction fixed Tree during horizontal scroll

Owner: **Codex**

PR #652 independently PASS. Land/rebase, then main re-Acceptance with real scrollbar drag at both target viewports.

Scope:
- fixed left Tree / timeline-only horizontal movement
- #647 separately owns Tree/Lane Y correspondence
- #650 separately owns selection reveal

## X7. #632 — first Signal selection full replace

Owner: **Codex**

QA isolation:
- idle wait: no flush
- Bottom/Inspector unrelated interactions: no flush
- first Signal selection: all visible signals rerender
- fullReplaceCalls/fullReplaceEpochResets +1
- cache hits 0 / all visible misses
- repeat Signal selection: no recurrence
- public refresh-reason fields do not expose the cause

Source-trace who performs full replace/epoch reset and why first selection triggers it. Fix ownership/invalidation if unnecessary; do not mask with memoization alone.

## X8. #615 — Passive View / Mediator ownership

Owner: **Codex**

Continue incrementally. Use concrete issues #639/#676/#651/#632 as ownership examples. No big-bang framework rewrite or giant root god-object.

## X9. #593 — mode presentation isolation

Owner: **Codex**

Maintain separate standalone Cycle/Transaction presentation ownership; Combined keeps one authoritative horizontal semantic-time owner.

## X10. #599 — startup/reload performance

Owner: **Codex**

Re-measure after correctness work. Optimize only measured avoidable work and preserve readiness correctness, Save/Open and lazy mode entry.

# CLAUDE — ACTIVE REVIEW / DISCOVERY QUEUE

## C1. Main-branch merge monitor — ACTIVE FIRST

Owner: **Claude QA**

At each cycle:
1. compare main HEAD to previous observation
2. identify newly merged PRs
3. re-run the original reported real-browser journey on actual main
4. close/recommend close only after main evidence
5. distinguish stale Vite/HMR/long-session artifacts using fresh tab/server restart

Priority merge candidates currently awaiting main confirmation:
- #670 / #624
- #652 / #646
- #668 + #669 integration
- #660 / #671

## C2. #635 — Signal Bottom UX / Draft-Apply review

Owner: **Claude reviewer/product QA**

Continue table-first workflow review:
- Add vs Edit clarity
- Generator disclosure
- Follow Selection / Pin
- Delete scope
- Draft / Apply / Cancel
- long-list usability at 1280x720

Known sub-fix:
- PR #668 fixes binary-signal phantom dirty and is independently PASS.
- PR #669 disclosure/collapse is independently PASS.
- They overlap in one code path; after reconciliation/merge run one combined acceptance journey.

Claude does not independently implement the semantic fix without handoff.

## C3. #631 — Transaction visual hierarchy

Owner: **Claude**

Keep scope visual:
- Bookmark prominence vs structural Transaction/Phase boundaries
- default / hover / selected hierarchy
- do not re-open the disproven global focus-visible theory
- collect evidence; product/design owner decides final visual policy

## C4. #647 — Tree/Lane correspondence Product Decision

Owner: **Claude evidence / product review**

Current evidence:
- Tree = Group/Transaction hierarchy
- Timeline = Lane packing
- exact 1:1 Y alignment is not structurally true
- Tree selection already highlights corresponding Lane/bar

Gather representative cases (same Lane multiple Transactions, multiple Lanes, groups, collapse/expand). Do not silently choose a model.

## C5. #677 — Pinned Annotation Bottom routing

Owner: **Claude product/GUI review first**

PR #664 revealed:
- Pin itself stays engaged
- Bottom routes to single-item Annotation editor rather than expected collection/list surface
- test expects collection Delete action

Clarify intended collection-vs-detail routing and Delete scope under #426. After decision, hand bounded implementation to Codex if needed.

## C6. #431 / #426 / #441 / #554 — continuing exploratory review

Owner: **Claude**

When implementation queues are waiting:
- Cycle / Transaction / Combined real-user journeys
- Bottom/Inspector context synchronization
- selection/reveal/scroll
- accessibility with real keyboard input
- Ribbon density/adaptive behavior
- MiniMap
- 1280x720 and 1672x941
- console/page errors
- hidden-mode stale state
- visual settling / first-correct-paint
- test validity (pre-fix FAIL -> fix PASS where practical)

Create bounded child Issues for independent defects rather than expanding epics indefinitely.

# PR / QA COORDINATION NOTES

## Verified PASS
- PR #668: #635 binary phantom-dirty fix
- PR #669: Generator disclosure/collapse
- PR #670: #624 restore/mode persistence
- PR #660: two-viewport evidence
- PR #671: geometry manifest
- PR #652: #646 fixed Transaction Tree

## Coordination / blockers
- #668 and #669 overlap in the same function; rebase/reconcile before second merge and run combined acceptance.
- PR #667 exposes real product bug #676; test failure is meaningful.
- PR #664 exposes product/routing gap #677; do not merely rename/fake the expected toolbar.
- PR #654 does not fix current-main #639 behavior.
- PR #665 looked logically sound but QA could not find a live production path to verify; confirm reachability before relying on it.
- PR #673 failures were split correctly: several depend on #670 timing fix, one test-authoring mismatch, one real overlapping-Annotation click-interception observation. Keep causes separate.

# RECENTLY CLOSED / CORRECTED RECORD

- #627 CLOSED: Add Phase semantic commit fixed and previously re-verified.
- #628 CLOSED: main re-Acceptance confirms single Annotation Bottom scroll owner, stable list width, Inspector-only detail editing at both target viewports.
- #629 / #630 CLOSED after main verification.
- Earlier claim that Grid/MiniMap/Snap/Ruler accessible names were all `"on"` was a tooling artifact; authoritative role/name checks show distinct names.
- Earlier broad focus-visible claim in #651 was also a methodology artifact: programmatic `.focus()` is not equivalent to real keyboard `:focus-visible`. Real Tab navigation passes on sampled controls.

# PRODUCT DECISION / HOLD

- #647: Tree/Lane correspondence model — evidence gathering only until explicit decision.
- #611: role-column contract conflict — no silent Golden/reference change.
- #415: explicitly skipped until user re-enables.
- #272: external CI runner/billing allocation block; do not loop.

# HANDOFF / COLLISION POLICY

1. One Issue = one active implementation owner.
2. Read latest main + Issue/comments + open PR before work.
3. If another agent touches the same file/hunk, coordinate before editing.
4. Claude may create scratch tests for QA but removes them after evidence gathering unless intentionally committed.
5. Codex should not convert Claude-owned product questions into implementation decisions.
6. Claude should not take over Codex implementation Issues without explicit handoff.
7. Repeated blocker becomes a bounded Issue; do not endlessly rerun the same command.
8. A merge/green test is not completion without the required main-branch user journey.
