# Claude / Codex Issue Ownership

Last reconciled: 2026-09-06 17:43 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main at reconciliation: `4956eab` (user-reported pushed main)

This file is the authoritative cross-agent ownership split. One Issue has one active implementation owner at a time. Do not have Claude and Codex independently implement the same Issue.

## Shared operating rules

- Both agents start each Issue from latest `origin/main`.
- Codex executes only non-comment entries in `.codex/ISSUE_ORDER.txt` unless the user explicitly transfers one Issue.
- Codex never merges/cherry-picks `codex-control`; it only reads control files from that branch.
- Claude resyncs from latest `origin/main` before starting the next GUI/product Issue.
- One repository / one main worktree for Codex; no temporary clones or `git worktree add`.
- Never reset/stash/clean/delete unrelated user work.
- Preserve `Canonical -> Semantic Commands / History -> Projection -> Renderer -> DOM`.
- Renderer/DOM/ruler samples are not semantic authority. Stable IDs are opaque.
- One logical mutation = one intended semantic operation = one History unit.
- View-only operations keep Canonical/History/Dirty delta = 0.
- Home Ribbon is protected unless an Issue or explicit user instruction authorizes a Home change.
- Golden/reference/threshold/mask must not be changed merely to pass.
- GitHub Actions availability is not a global implementation blocker. Use local verification as applicable.
- If an Issue is already satisfied, collect evidence and close it; do not manufacture work.

## Ownership model

### Codex — Core / Data / Geometry / Runtime / Reliability
Codex owns Canonical/schema/data integrity, migration/validation, Semantic Commands/History, geometry/time mapping, projection/renderer/runtime correctness, performance architecture and bounded Core closure.

### Claude — GUI / UX / Product surfaces
Claude owns Ribbon/Tree/Inspector/Bottom composition, visual hierarchy/design-system consistency, product workflow presentation/discoverability, browser-facing GUI completion and final interaction polish.

For mixed Issues, split by explicit child Issue/ownership below. Neither agent should create a parallel implementation path.

---

## Time Outline / TimeGroup ownership — #411 sequence

Parent Epic:
- `#411` — coordination only.

### Completed by Codex
- `#412` — completed/closed on main through `4956eab` lineage.
  - stable parent ID
  - hierarchy validation
  - shared selector
  - Save/Open
- `#413` — completed/closed on main through `4956eab` lineage.
  - Group/Ungroup
  - deterministic child reparent
  - partial-overlap reject
  - atomic Undo/Redo

Do not reimplement #412/#413.

### Claude NOW
- `#414` — Excel-like Time Outline visualization above ruler
  - hierarchy rows/brackets
  - +/- controls
  - [1][2][3...] level controls
  - zoom/scroll/accessibility/real-browser acceptance
  - MUST consume #412/#413 owners; no duplicate hierarchy/command logic

### Codex after #414 is completed/closed
- `#415` — nested collapse + shared DisplayTimeMapping / Axis Break
  - effective nested fold resolution
  - shared mapping/geometry ownership
  - Ruler/Signal/Grid/Playhead/Range/Annotation/Transaction/Bookmark alignment
  - Clock/fold semantics and performance
  - no final Ribbon/product closure

### Claude after #415
- `#416` — Timeline Ribbon integration + persistence/export/E2E product closure

Intended dependency chain:

```text
DONE  Codex  #412
DONE  Codex  #413
NOW   Claude #414
NEXT  Codex  #415
THEN  Claude #416
```

---

## Transaction Mode product lane

### `#429` — P0 Transaction Mode production completion — Claude/product owner

This is the concrete production implementation owner for the currently underdeveloped Transaction workspace. It is not merely an acceptance Issue.

Primary scope:
- multiple Transactions / Lane visualization
- semantic Phase visualization
- Create / Duplicate / Delete
- direct Move / Resize
- completed Bottom Transaction detailed editor
- Phase GUI editing
- Linked Signal workflow
- Inspector/Bottom synchronization
- Transaction-focused Ribbon integration/reuse
- shared time geometry
- Undo/Redo, Save/Open, Export
- empty/first-use state
- 1672x941 and 1280x720 real-browser completion

Related existing owners must be reused rather than duplicated:
- `#403-#409` ActiveContext / contextual Ribbon / Cycle-Transaction Split
- `#426` common Bottom Draft/Apply contract
- `#397` final sample-driven Transaction/Split acceptance

Recommended execution relationship:

```text
Claude #414
   -> #414 merge
      -> Codex #415 starts
      -> Claude may start #429 in parallel at product/GUI layer, avoiding #415 mapping/runtime hot-file collisions
   -> after #415, Claude #416
   -> after concrete Transaction/Split implementation is mature, run #397 final acceptance
```

#397 remains an acceptance gate; do not substitute it for #429 production implementation.

---

## Current Claude / GUI-product lane

Priority:
1. `#414` Time Outline GUI — immediate dependency unblocker
2. `#429` Transaction Mode P0 production completion — start after #414 merge while Codex works #415
3. `#416` Time Outline final product closure — after #415
4. continue/reconcile applicable `#403-#409` and `#426` residuals through #429 rather than duplicating features
5. `#397` final sample-driven Transaction/Split acceptance when implementation is ready

Other Claude-owned surfaces unless explicitly transferred:
- `#419` Highlight Cycle Snap / Free
- `#424` Marker vertical span

---

## Current Codex queue authority

The actual executable order is `.codex/ISSUE_ORDER.txt`.

Current status:
- no executable Issue while #414 is in progress
- `#415` is next Codex-owned task after #414 closes and control queue is updated

Codex should report dependency wait rather than manufacture unrelated work.

---

## Holds / mixed ownership

### `#177` — external/product hold
Replacement Pack path count remains 0 / product decision pending. Do not invent input or repeatedly re-audit unchanged state.

### `#205` — mixed / Claude-held unless explicitly decomposed
Concrete Core geometry/runtime defects may be separately filed/transferred.

### `#250` — product-decision hold
Production AI provider contract unresolved.

### `#272` — closed not_planned
External GitHub Actions runner/billing condition.

---

## Recently completed / do not reimplement

- `#412 #413`
- `#410 #399 #398 #237 #417 #428`
- `#372 #366 #369 #363 #269 #281`
- `#221 #171 #170 #167 #161 #175`
- `#272` closed not_planned

`#428` was a one-off Codex transfer and does not transfer #426.

---

## Cross-agent collision rules

Hot/shared areas include:
- `minimal-cycle-view.tsx`
- Ribbon composition owners
- runtime bridge / geometry owners
- `DisplayTimeMapping` / LocalGeometry owners
- shared design-system/CSS primitives
- renderer/projection owners
- semantic-command registries

Before editing a hot area, sync latest `origin/main` and confirm predecessor/other-agent work required by dependency has merged.

When Claude #429 and Codex #415 overlap in calendar time:
- Codex owns fold/shared mapping runtime changes
- Claude owns Transaction GUI/product surfaces
- Claude must not create a Transaction-only mapping to bypass #415
- Codex must not redesign Transaction Bottom/Ribbon/UI as part of #415
- isolate and transfer a bounded defect if one side needs the other's owner.

## Implementation-first policy

Prefer:
`identify concrete missing behavior -> root cause -> bounded production implementation -> focused verification -> evidence/close`.

Test-only commits are appropriate only when the Issue itself is a test/harness contract or the test mechanically proves a concrete regression/acceptance gap.
