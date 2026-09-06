# Claude / Codex Issue Ownership

Last reconciled: 2026-09-06 17:56 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main: `4956eab` (user-reported pushed main)

This file is the authoritative cross-agent ownership split. One Issue has one active implementation owner at a time. Parent product Issues may have explicitly separated Core child Issues, but neither agent may create a parallel owner for the same responsibility.

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
- One repository / one main worktree for Codex; no temp clones or `git worktree add`.

## Ownership model

### Codex — Core / Data / Geometry / Runtime / Reliability
Canonical/schema/data integrity, migration/validation, Semantic Commands/History, geometry/time mapping, projection/renderer/runtime correctness, performance and bounded Core closure.

### Claude — GUI / UX / Product surfaces
Ribbon/Tree/Inspector/Bottom composition, visual hierarchy/design system, product workflow/discoverability, direct interaction and browser-facing completion.

---

## Time Outline / TimeGroup — #411

Completed Codex:
- #412 nested Canonical hierarchy
- #413 Group/Ungroup + validation/history

Claude NOW:
- #414 Excel-like Outline GUI

Codex after #414 closes:
- #415 nested fold resolution + shared DisplayTimeMapping / Axis Break

Claude after #415:
- #416 final Timeline Ribbon / persistence / export / E2E

Do not start #415 before #414 is merged/closed.

---

## Transaction Mode split

### Parent #429 — Claude/product owner
Claude owns the production workspace:
- multiple Lane/Transaction visual structure
- Phase visualization
- direct move/resize gestures
- Bottom detailed editor
- Inspector synchronization
- Transaction-focused Ribbon
- Linked Signal product workflow
- empty state / responsiveness / final real-browser UX
- final Export/product closure

### Child #430 — Codex/Core owner — executable now
Codex owns only the reusable semantic/data foundation:
- Create / Duplicate / Delete Transaction
- Name/Start/End/Lane mutation
- Phase CRUD and deterministic validation
- Link/Unlink stable Signal IDs
- fresh IDs on duplicate
- atomic invalid no-op
- one logical operation / one History unit
- exact Undo/Redo and Save/Open
- sequential Open stale-state Core regression

Claude #429 must consume #430 rather than implement a second Transaction state/command path.
Codex #430 must not redesign Ribbon/Bottom/Inspector/direct manipulation.

---

## Marker vertical span split

### Parent #424 — Claude/product owner
Claude owns:
- top/bottom extent handles
- hit testing / drag gesture
- Marker visual representation
- Inspector/Bottom controls
- real-browser interaction/visual acceptance

### Child #432 — Codex/Core owner — executable now
Codex owns:
- vertical span semantic model (`auto/rows/custom` or approved equivalent)
- stable row/signal boundary IDs
- migration/backward compatibility
- validation and deleted/reordered-row policy
- Semantic Command path
- Undo/Redo
- Save/Open
- projection-facing selectors

Changing vertical span must not change Marker semantic time anchor.
Canonical screen-pixel height is forbidden.

---

## Highlight Snap/Free split

### Parent #419 — Claude/product owner
Claude owns:
- Inspector Position/Snap controls
- Global Snap default integration
- pointer create/edit gesture
- product wording and visual acceptance

### Child #433 — Codex/Core owner — executable now
Codex owns:
- persisted `cycle-snap` vs `free` semantic positioning model
- migration/validation
- integer source-boundary semantics for Cycle Snap
- continuous/fractional semantic time for Free
- Semantic Command path
- Undo/Redo
- Save/Open
- geometry-facing selectors compatible with shared DisplayTimeMapping

Free mode must never persist screen X or ruler DOM positions as Canonical time.

---

## Current queues

Codex executable order is authoritative in `.codex/ISSUE_ORDER.txt`:

```text
#430
#432
#433
```

#415 is dependency-waiting on Claude #414. When #414 closes, finish the currently active bounded Codex Issue safely, then prefer promoting #415 ahead of remaining lower-priority independent Core work because it unblocks #416.

Claude immediate/product lane:
1. #414
2. #429 product GUI/workspace
3. #416 after #415
4. #424 GUI after/alongside #432 completion
5. #419 GUI after/alongside #433 completion
6. reconcile #431 UX Epic / #426 / #403-#409
7. #397 final Transaction/Split acceptance when implementation is mature

#431 is an Epic/product backlog owner, not a Codex executable Issue by itself. Concrete Core defects from #431 should be isolated into bounded child Issues before assignment.

---

## Holds
- #177 external/product hold; do not re-audit unchanged Replacement Pack blocker.
- #205 mixed/Claude-held unless decomposed into bounded Core children.
- #250 product-decision hold.
- #272 closed not_planned external Actions condition.

## Completed — do not reimplement
#412 #413 #410 #399 #398 #237 #417 #428 #372 #366 #369 #363 #269 #281 #221 #171 #170 #167 #161 #175 #272.

## Collision rules
Hot/shared areas include semantic-command registries, schema/migration files, `minimal-cycle-view.tsx`, Ribbon owners, runtime bridge, `DisplayTimeMapping`, LocalGeometry, renderer/projection owners and shared CSS/design primitives.

- Codex children should prefer Core/schema/command/test files and avoid GUI files unless a production adapter change is strictly necessary.
- Claude parent work should consume Core APIs instead of duplicating them.
- If same-hunk conflict exists, isolate/defer only that bounded Issue; do not reset/stash/clean unrelated work.
- #415 owns fold/shared mapping runtime; #429/#424/#419 GUI work must not introduce competing time mappers.

## Implementation-first policy
`identify concrete missing behavior -> root cause -> bounded production implementation -> focused verification -> evidence/close`.
If current main already satisfies an Issue, close with evidence rather than manufacturing a commit.
