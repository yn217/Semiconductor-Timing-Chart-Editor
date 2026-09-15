# Claude / Codex Issue Ownership

Last reconciled: 2026-09-16 JST  
Repository: `yn217/Semiconductor-Timing-Chart-Editor`  
Current product branch: `main`  
Observed main: `830432de6fe6db021289651ecccd29046618a6b5`  
Authoritative Codex queue: `codex-control:.codex/ISSUE_ORDER.txt`

Use two-agent development with **one active implementation owner per Issue**. Claude concentrates on visual/product behavior, real-browser journeys and independent review. Codex concentrates on architecture, semantic ownership, geometry/runtime correctness and measured performance.

## Shared semantic architecture

Preserve:

```text
Canonical
-> Semantic Commands / History
-> Projection
-> Renderer
-> DOM
```

Rules:
- one logical mutation = one semantic operation = one History unit
- stable opaque IDs; no array-index/name/DOM-order identity
- view-only operations keep Canonical/History/Dirty delta = 0
- `source time -> DisplayTimeMapping -> TimeAxisGeometry/LocalGeometry -> screen`
- DOM/ruler pixels are not semantic authority
- no Golden/reference/threshold/mask weakening merely to pass
- user-visible real-browser reproduction overrides narrower automated PASS
- real pointer workflows require real browser pointer acceptance
- do not reset/stash/clean/delete unrelated work

# New GUI interaction architecture rule

The existing semantic pipeline remains authoritative. Add an explicit ownership rule for GUI interaction:

```text
User input
-> passive View emits typed UI intent/event
-> bounded local Mediator/Controller handles or delegates upward
-> explicit interaction state transition
-> Semantic Command OR workspace/view-state update
-> Projection
-> passive View render
```

Conceptual hierarchy may look like:

```text
AppRootMediator
├─ WorkspaceMediator
│  ├─ CycleMediator
│  ├─ TransactionMediator
│  └─ CombinedMediator
├─ Selection/Focus owner
├─ Inspector owner
├─ Bottom owner
└─ Modal/Overlay owner
```

This is a responsibility model, not a required class naming scheme.

## Passive View rule
A component may render explicit state, emit typed intent, and own purely local ephemeral visual state such as hover/animation/DOM refs. It must not directly mutate a peer View, become a second semantic owner, or control cross-surface mode/visibility/selection outside the owning mediator/controller.

## Event ownership rule
One event/gesture has one authoritative owner. Local owners may consume or delegate/bubble upward. Avoid unordered peer-to-peer event broadcasts where multiple surfaces independently mutate shared interaction state.

## State-machine rule
High-risk interactions such as drag/resize/connect/pan/modal/restoring/AI preview should use explicit bounded states/transitions where current evidence shows distributed flags/timers can race. Do not centralize harmless local state into a global god object.

## Async rule
Async results publish only if the current semantic freshness **and** owner/state/generation are still valid. Preserve #606-style stale-result protection and apply the pattern to analogous proven races.

Authoritative implementation Issue: **#615**.

# CODEX OWNERSHIP

Codex should concentrate on **architecture / semantic command / geometry/runtime ownership / performance / bounded core implementation**.

## X1. #614 — P0 Cycle waveform per-signal scale mismatch — ACTIVE FIRST

Owner: **Codex**

Current evidence shows two signals in the same bounded visible source window can have different native WaveDrom viewBox widths but are stretched into the same shared CSS width, producing different px-per-cycle scales.

Required:
- shared source-cycle boundaries remain the semantic authority
- all signals in one visible source window align to the same approved Cycle presentation geometry
- do not disable bounded rendering
- do not add a separate fixed `cycle * px` semantic truth
- test near cycle 0 and scrolled/windowed ranges
- after implementation, hand off to Claude for independent visual/browser verification

## X2. #615 — Passive View + hierarchical Mediator/state-machine ownership

Owner: **Codex**

Start with an ownership audit; do not big-bang rewrite.

Priorities:
1. identify direct cross-component/cross-mode state mutation and ambiguous event owners
2. document/classify ownership
3. add architecture checks where practical
4. migrate only proven high-risk paths incrementally
5. retain the existing Semantic Command/History pipeline

Important:
- no giant Root god-object
- no framework rewrite
- no moving local hover/animation state into global state
- each bounded migration gets focused tests + browser acceptance where applicable

## X3. #612 — Hidden Cycle paint vs shared geometry at Transaction startup

Owner: **Codex**

Separate shared time geometry required by Transaction from hidden Cycle SVG paint. Hidden Cycle paint must not block Transaction first-useful paint, while later Cycle/Combined entry still works and shared geometry authority remains single-source.

Use #615 ownership rules rather than introducing ad-hoc lazy flags/timers.

## X4. #593 — Cycle / Transaction / Combined workspace ownership isolation

Owner: **Codex**

Continue explicit presentation-owner separation:
- standalone Cycle presentation state independent
- standalone Transaction presentation state independent
- Combined owns one horizontal semantic-time viewport
- independent vertical state allowed
- mode switch remains view-only

Consume #615 architecture rather than duplicating interaction owners.

## X5. #599 — Transaction startup/reload performance closure

Owner: **Codex**

Re-measure after #612. Remove only proven duplicate/nonessential work. Preserve readiness correctness, Save/Open and later mode entry. Report phase order/build counters and real-browser timings rather than best-case-only claims.

# CLAUDE OWNERSHIP

Claude should concentrate on **GUI / visual-product behavior / real-browser acceptance / adversarial review**.

## C1. #613 — Cycle-only v8 Inspector acceptance setup — ACTIVE FIRST

Owner: **Claude**

This is a test/acceptance setup defect: startup can be Transaction mode while the target Cycle-only row exists under a hidden Cycle surface.

Required:
- enter Cycle through the visible Production selector
- retain current v8 assertions
- no production behavior change
- no force-click / hidden-surface shortcut
- no Golden/threshold/mask changes

Close with focused Chromium evidence.

## C2. #614 — independent review after Codex lands the fix

Reviewer: **Claude**, implementation owner remains Codex until handoff.

After Codex pushes #614:
- verify CLOCK/data/square-wave alignment at cycle 0
- scroll into bounded windows (including ~150+ in a long document)
- check ruler/grid/waveform correspondence
- test 1672x941 and 1280x720 where practical
- reproduce user-visible behavior rather than trusting viewBox assertions alone

If failure remains, update #614; do not start a parallel implementation without ownership handoff.

## C3. #554 — Independent fresh-document User Journey re-audit

Owner: **Claude**

Use Production GUI from New/generic documents; sample fixtures are not authoring proof.

Priority journeys:
- build usable Transaction workspace from scratch
- Group/Lane/Phase/Linked Signal lifecycle
- Undo/Redo + Save/Open
- Cycle -> Transaction -> Cycle
- Transaction -> Combined -> Transaction
- Combined same-source-time correspondence

When a concrete defect is found:
- reproduce twice where practical
- search existing Issue
- update it or create one bounded child Issue
- do not bury unrelated implementation inside #554

## C4. #431 — Structured GUI/UX exploratory review

Owner: **Claude for discovery/review**

Run Cycle / Transaction / Combined at 1672x941 and 1280x720. Exercise actual operations across Ribbon, left tree, center, Bottom, Inspector, MiniMap and Status.

Important new review lens from #615:
- does a View directly control another View?
- does a hidden surface still influence visible state?
- are conflicting inputs arbitrated by one owner?
- does rapid input/cancel/mode switch reveal implicit-state races?

Create bounded child Issues for concrete findings. Avoid giant catch-all fixes under #431.

## C5. #426 — Bottom Panel UX / interaction review

Owner: **Claude for product/GUI review and bounded child triage**

Review Signal / Annotation / Bookmarks / Transaction / Problems / JSON workflows and Inspector synchronization.

Apply #615 review rule:
- Bottom and Inspector must not be peer semantic owners
- cross-surface selection/draft conflicts must route through explicit ownership
- local drafts may remain local, but Apply document changes must use Semantic Commands

If implementation-heavy architectural work is found, create a bounded child Issue and assign Codex only after ownership is updated here.

## C6. #441 — Adaptive high-density Ribbon visual/product review

Owner: **Claude for GUI/product review**

Verify high-density Home/View/contextual Ribbon behavior at wide/narrow viewports, overflow/compact behavior, accessibility names, keyboard access and no broken labels.

Ribbon remains presentation/composition owner; it must not become a semantic or cross-surface interaction owner.

# PRODUCT DECISION HOLD

## #611 — v8 role-column width: 28px reference vs 44px production

Current focused evidence reports 28px expected vs 44px production. This requires an explicit product decision.

- Claude may collect side-by-side screenshots/geometry evidence and summarize trade-offs.
- Neither Claude nor Codex should silently change the approved reference contract or Golden assets.
- After user/product decision, assign one implementation owner.

# PRODUCT / REFERENCE / EXTERNAL

- **#570** remains the current cross-feature product specification authority.
- **#569** remains the AI subscription/external-agent product policy. Local/provider-independent policy/runtime acceptance may proceed; unavailable external-agent E2E must not block unrelated work.
- **#272** remains external GitHub Actions runner allocation/billing/policy block. Do not repeatedly poll/retry it as productive work.
- **#415** remains explicitly skipped until the user re-enables it.
- **#411** TimeGroup Epic may receive review/acceptance work that does not silently reactivate #415.
- **#177** parity remains a closure/audit owner; green `check:parity` alone is not full Product Acceptance.

# RECENTLY CLOSED / PRESERVE

Do not keep these in active queues unless a new regression is reproduced:

- #604 Transaction large/fold geometry
- #556 Transaction drag local-preview/performance
- #606 stale same-epoch waveform render rejection
- #607 Cycle scroll pitch regression
- #608 terminal ruler click off-by-one
- #609 Bookmark test mismatch
- #587 / #573 / #552 recorded large-browser acceptance closures

# COLLISION / HANDOFF POLICY

1. One Issue = one active implementation owner.
2. Before starting, read latest `origin/main`, Issue body and latest comments.
3. Before editing a shared owner/module, check whether the other agent is likely touching the same file/hunk.
4. If same-hunk collision exists, dependency owner lands first; reviewer works elsewhere.
5. Commit/push bounded logical changes frequently.
6. Add implementation/evidence to the owning Issue.
7. Independent review uses Production GUI and user-visible journeys, not just implementer-authored tests.
8. A review finding becomes a bounded Issue rather than an untracked side-fix when it crosses ownership/scope.
9. A blocked/acceptance-only Issue does not end an autonomous run; continue to another independent task.

# Recommended parallel start

```text
Codex : #614 P0 waveform alignment
Claude: #613 Cycle-mode GUI-reference acceptance
```

Then:

```text
Codex : #615 ownership audit/foundation
Claude: #554 fresh-document Journey audit + #614 independent visual verification after handoff
```

Then:

```text
Codex : #612 -> #593 -> #599
Claude: #431 exploratory GUI review -> #426 Bottom review -> #441 Ribbon review
```

# What changed in this reconciliation

- Removed stale queue entries that are now closed.
- Promoted current P0 #614 to Codex first.
- Added #615 to turn Passive View / hierarchical Mediator / explicit state-machine guidance into a bounded architecture task rather than a vague refactor mandate.
- Assigned hidden-surface startup #612 and mode isolation #593 behind that ownership foundation.
- Recast Claude as the independent GUI/journey reviewer with explicit review lenses for direct View-to-View mutation, hidden-surface ownership and rapid-input state races.
- Kept #611 on product-decision hold rather than allowing either agent to silently redefine the visual contract.
