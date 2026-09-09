# Claude / Codex Issue Ownership

Last reconciled: 2026-09-09 20:33 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main: `6566c0c`

This file is the authoritative cross-agent ownership split. One Issue has one active implementation owner at a time. Parent product Issues may have explicitly separated Core children, but neither agent may create a parallel owner for the same responsibility.

## Shared rules
- Both agents start from latest `origin/main`.
- Codex executes non-comment entries in `.codex/ISSUE_ORDER.txt`.
- Codex only reads `codex-control`; never merge/cherry-pick it into main.
- Preserve `Canonical -> Semantic Commands / History -> Projection -> Renderer -> DOM`.
- One logical mutation = one intended semantic operation = one History unit.
- Stable IDs are opaque; no array-index identity.
- View-only operations keep Canonical/History/Dirty delta = 0.
- DOM/ruler samples are not semantic authority.
- Never change Golden/reference/threshold/mask merely to pass.
- Codex uses one repository / one main worktree; no temp clones/worktrees and no reset/stash/clean of unrelated work.

## Ownership model

### Codex — Core / Data / Geometry / Runtime / Reliability
Canonical/schema/data integrity, migration/validation, Semantic Commands/History, geometry/time mapping, projection/renderer/runtime correctness, performance, and bounded Core closure.

### Claude — GUI / UX / Product surfaces
Ribbon/Tree/Inspector/Bottom composition, visual hierarchy/design system, product workflow/discoverability, direct interaction, realistic sample acceptance, and browser-facing completion.

---

## Current agent task lists

### Codex — executable now
1. **#163** — Semantic Command + History / ChangeSet closure.
   - Re-audit latest main first; substantial foundation already exists.
   - Focus only on remaining concrete gaps: Comment Row typed create/update/delete, rejected-operation atomicity including success-only transient effects, precise ChangeSet invalidation (especially row/Y), bounded Dirty/savepoint behavior if still present, History scaling evidence/decision, and current Signal property mutation coverage.
   - Do not redesign GUI and do not touch #414/#415 implementation.
   - Finish with focused tests, evidence, main push, and Issue closure only if acceptance is actually satisfied.

### Explicitly skipped/deferred
- **#415** — nested collapse + shared DisplayTimeMapping / Axis Break.
  - User explicitly instructed to skip this for now.
  - Even if #414 closes, do **not** auto-promote #415.
  - Start only after a later explicit queue update/user instruction.
- #463 Transaction lane virtualization/performance — defer while Claude is exercising #397/#429 Transaction surfaces.
- #258 MinimalCycleView broad decomposition — defer while product agents are editing shared editor surfaces.
- #495 Reset semantics — mixed Core+GUI; split a bounded Core child before Codex takes it wholesale.

### Claude — product/GUI lane
1. **#414** — Excel-like Time Outline GUI.
2. **#534** — Transaction Bottom empty-state simplification.
3. **#397** — Transaction + Split Samples A–E real-browser acceptance.
4. **#429** — Transaction parent closure after #397.
5. **#416** — Time Outline final Ribbon / persistence / export / E2E closure; blocked while #415 is skipped.
6. **#424** — Marker vertical-span GUI/product completion.
7. **#419** — Highlight Cycle Snap / Free GUI/product completion.
8. Reconcile remaining product lanes: **#403/#407/#408/#409**, **#426**, **#431**, then other GUI/design-system backlog such as #436-#441/#474 as product priority requires.

#431 is an Epic/product backlog owner, not a Codex executable Issue by itself. Concrete Core defects from #431 should be isolated into bounded child Issues before assignment.

---

## Time Outline / TimeGroup — #411

Completed Codex:
- #412 nested Canonical hierarchy
- #413 Group/Ungroup + validation/history

Claude current:
- #414 Excel-like Outline GUI

Codex #415:
- intentionally skipped/deferred until explicitly re-promoted

Claude #416:
- remains dependent on #415

Do not start #415 merely because #414 closes.

---

## Transaction Mode — #429

Completed foundations / closure fixes:
- #430 semantic core
- #450 canonical Transaction model/groups/lanes/phases/colors/links
- #455 Transaction Time Scale / TC
- #451 left Transaction Tree
- #452 central Lane workspace
- #453 Bottom Transaction Table
- #454 Transaction Inspector
- #481 live drag preview / commit-on-drop
- #461 partial-update field preservation
- #530 Transaction time-scale optional-field preservation / Secondary Clock / Save-Open
- #529 DocumentEpoch stale transient-state isolation

Current Claude/product follow-up:
- #534 Bottom Transaction zero-state density cleanup
- #397 full Transaction + Split sample-driven acceptance
- #429 parent closure after #397

Do not reopen completed Transaction children merely for another implementation pass. A concrete defect found by #397 should become a bounded follow-up with reproduction and acceptance evidence.

---

## Recently completed — do not reimplement

Codex/runtime/data closure includes:
- #282
- #530 #529 #461 #328 #464 #462
- #481 #459 #460
- #456 #457 #458
- #443 #450 #455 #430 #432 #433

Product/GUI closure includes:
- #451 #452 #453 #454 #473

Earlier completed foundations include:
- #412 #413 #410 #399 #398 #237 #417 #428 #372 #366 #369 #363 #269 #281 #221 #171 #170 #167 #161 #175 #272

---

## Holds
- #177 external/product-decision hold; do not repeatedly re-audit unchanged blocker state.
- #205 mixed/Claude-held unless decomposed into bounded Core children.
- #250 product-decision hold.
- #272 closed/not-planned external Actions condition.

## Collision rules
Hot/shared areas include semantic-command registries, schema/migration files, `minimal-cycle-view.tsx`, Ribbon owners, runtime bridge, Transaction lanes, `DisplayTimeMapping`, LocalGeometry, renderer/projection owners and shared CSS/design primitives.

- Codex should prefer Core/schema/command/test owners and avoid GUI files unless a production adapter change is strictly necessary.
- Claude should consume completed Core APIs instead of duplicating semantic owners.
- If a genuine same-hunk conflict exists, isolate/defer only that bounded Issue; do not reset/stash/clean unrelated work.
- #415 remains the future fold/shared mapping owner, but is currently intentionally deferred.

## Implementation-first policy
`identify concrete missing behavior -> root cause -> bounded production implementation -> focused verification -> evidence/close`.
If current main already satisfies an Issue, close with executable evidence rather than manufacturing a commit.
