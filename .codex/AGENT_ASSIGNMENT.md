# Claude / Codex Issue Ownership

Last reconciled: 2026-09-22 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Product branch: `main`
Authoritative Codex queue: `codex-control:.codex/ISSUE_ORDER.txt`

Use two-agent development with **one active implementation owner per Issue**.

- **Codex**: bounded production implementation, architecture/semantic ownership, state lifecycle, geometry correctness, source tracing, measured performance.
- **Claude**: independent real-browser QA, visual/product UX, adversarial PR verification, test-validity review, fresh-state journeys, Issue evidence and Product Decision support.

Shared contract:

```text
Canonical
-> Semantic Commands / History
-> Projection / Derived Geometry
-> Renderer
-> DOM
```

Global rules:
- one logical mutation = one semantic operation = one History unit
- stable opaque IDs
- view-only actions: Canonical/History/Dirty delta = 0
- real user-visible repro overrides narrower green tests
- no Golden/reference weakening
- no unrelated reset/stash/clean/delete
- PR-branch PASS is not closure until original journey passes on actual main

# CODEX — ACTIVE IMPLEMENTATION

## X1 #737 — Phase child-row / Transaction grid alignment

Owner: **Codex**

Current screenshot proves the expanded Phase child rows are on a different column coordinate system.

Required architecture:
- one shared Transaction Bottom column model
- same template for header / parent row / Phase child row
- hierarchy indentation inside Name cell only
- one horizontal scroll owner
- virtualization uses one flattened row projection
- Inspector/Bottom width changes recompute one column owner

Required proof:
- pre-fix FAIL -> post-fix PASS
- Start/End/Duration boundaries <= 1px mismatch
- 1280x720 + 1672x941
- expand/collapse, Inspector open/close, Bottom resize
- no semantic delta for layout operations

## X2 #752 — stable TransactionEditor lifecycle

Owner: **Codex**

Remove selection-keyed remount behavior that discards draft/table state.

Preserve:
- active draft
- sort/filter
- Phase expansion
- table state
- stable selection context

Do not solve by persisting transient DOM state into Canonical.

## X3 #703 — Transaction Bottom Draft -> Apply

Owner: **Codex**

Use one draft owner for editable Transaction row fields.
One Apply = one semantic command / one History unit.
Revert = local discard only.
Must coexist with shared selection and #737 hierarchy.

## X4 #747 — Bottom UX consolidation

Owner: **Codex**

Implement remaining approved UX after #737/#752/#703 constraints:
- Add/Create consistency
- explicit Start/End sorting
- settings behind gear where specified
- stable tree-grid geometry
- no duplicate layout owner

## X5 #770 — filtered hidden-selection safety

Owner: **Codex**

Destructive bulk commands must not silently act on hidden selected rows.
Make operation scope explicit and deterministic.
Selection identity remains stable-ID based.

## X6 #769 — Transaction Tree virtualization / keyboard

Owner: **Codex**

After group expand/collapse/filter/topology changes:
- recompute virtualization window
- preserve keyboard traversal
- preserve focus / aria semantics
- no inaccessible offscreen-only focus target
- stable IDs across remount/window changes

## X7 #593 — cross-mode presentation ownership

Owner: **Codex**

Reopened architecture follow-through.
Do this after current user-visible Bottom/tree correctness so architecture work is grounded in concrete failure modes.

Cycle and Transaction own standalone presentation state.
Combined explicitly owns shared horizontal semantic-time viewport.
No hidden cross-mode stale layout owner.

## X8 #573 — Combined stacked layout

Owner: **Codex**

Restore/maintain Transaction-over-Cycle stacked workspace with one shared horizontal axis.
Coordinate with #593; one source-time X owner only.

# CODEX — QA INFRASTRUCTURE AFTER PRODUCT CORRECTNESS

## X9 #682
Mandatory fix contract / Issue template / PR evidence / taxonomy.

## X10 #683
Machine-readable journey/evidence schemas + mechanical gates.

## X11 #684
Blind fresh-state bug hunts + independent verifier execution.

## X12 #681
Umbrella closure only after #682/#683/#684 are integrated and proven useful in actual correction workflow.

Before coding these, inspect existing open PRs (#730/#731/#732 and #686/#687/#688 families) and reconcile rather than duplicating work.

# CLAUDE — ACTIVE QA / PRODUCT REVIEW

## C1 Main merge monitor — highest priority

At each cycle:
1. compare current main to previous observation
2. identify new merges
3. run the original Issue journey on actual main
4. use fresh server/tab if HMR/session contamination is possible
5. recommend close only after main evidence
6. reopen a closed Issue if the exact user-visible defect reappears

## C2 PR #762 reconciliation / independent QA

PR #762 is broad and spans several already-closed Issues.

Claude should:
- inventory each commit/slice against current main
- identify already-superseded code
- avoid treating Issue closure as proof the PR should merge wholesale
- provide per-slice Keep / Drop / Rebase / Needs-main-acceptance classification
- run the original visual journeys for retained slices

Do not merge unrelated stale slices just because the branch is green.

## C3 #754 Transaction video-regression umbrella

Owner: **Claude QA**

Track the child defects surfaced from video.
Do not implement the umbrella directly.
When a child is fixed, rerun the exact visible journey rather than relying on fixture-only coverage.

## C4 #738 / #753 — evidence-gated repro

Owner: **Claude QA**

#738:
- current broad repro matrix did not reproduce the reported stale ruler-origin path.
- do not loop random tests.
- resume when exact gesture/document/zoom/video evidence changes.

#753:
- randomized bookmark operations did not reproduce blank/navigation crash.
- resume only with exact operation sequence, console/page error, or deterministic video repro.

Keep OPEN as NEEDS_REPRO, not as continuously executable work.

## C5 #426 / #431 / #554 — continuing exploratory QA

When implementation PRs are waiting:
- Bottom/Inspector context synchronization
- Cycle/Transaction/Combined real-user journeys
- selection/reveal/scroll
- 1280x720 and 1672x941
- MiniMap / Ribbon / workspace density
- hidden-mode stale state
- console/page errors
- accidental remount / state loss
- visual settling
- test validity (pre-fix FAIL -> fix PASS where practical)

Create bounded child Issues for independent defects rather than inflating epics.

# CURRENT OPEN PRODUCT WORK — STATUS SUMMARY

Implementation queue:
- #737 OPEN / reopened
- #752 OPEN / reopened
- #703 OPEN / reopened
- #747 OPEN / reopened
- #770 OPEN
- #769 OPEN
- #593 OPEN / reopened
- #573 OPEN / reopened

Evidence-gated:
- #738 OPEN, needs better repro
- #753 OPEN, needs exact repro
- #754 OPEN umbrella

QA workflow:
- #681/#682/#683/#684 OPEN

# RECENTLY CLOSED — REMOVE FROM ACTIVE IMPLEMENTATION LIST

#615, #621, #623, #624, #625, #626, #632, #637, #639, #646,
#651, #676, #698, #748, #750, #751, #756, #759, #760,
#763, #764, #765, #766.

If a closed defect reappears in current main, reopen with new evidence rather than creating a duplicate.

# FIXED STATUS — DO NOT SPEND AUTONOMOUS CYCLES

- #272 = BLOCKED_EXTERNAL
- #415 = SKIPPED_BY_USER
- #633 = AWAITING_CLEANUP_APPROVAL

Do not repeatedly report these three unless their state materially changes.

# HANDOFF / COLLISION POLICY

1. One Issue = one active implementation owner.
2. Read current main + latest Issue comments + related PR before work.
3. If another agent touches same file/hunk, coordinate before editing.
4. Claude can create temporary QA harnesses but removes them after evidence gathering unless intentionally committed.
5. Claude does not silently decide architecture/product policy for Codex-owned work.
6. Codex does not turn Claude-owned exploratory observations into product decisions without an approved Issue contract.
7. A blocked child does not block unrelated queue progress.
8. Green test / merged PR / Issue close is not completion without required main-branch user journey.
