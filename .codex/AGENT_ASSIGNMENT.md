# Claude / Codex Issue Ownership

Last reconciled: 2026-09-06
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main at reconciliation: `447ebe05051ec6272815ba764245fede0e3d3c1d`

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
- Golden/reference/threshold/mask must not be changed merely to pass; any new Golden change requires explicit user/product approval.
- GitHub Actions runner/billing availability is not a global implementation blocker. Use local typecheck/gates/unit/Chromium/`git diff --check` as applicable.
- If an Issue is already satisfied, collect evidence and close it; do not manufacture code/test-only work.

## Ownership model

### Codex — Core / Data / Geometry / Runtime / Reliability

Codex owns:
- Canonical/schema/data integrity
- migration/validation
- Semantic Commands / History policy
- geometry/time mapping
- projection/renderer/runtime correctness
- performance architecture
- broad Core closure

### Claude — GUI / UX / Product surfaces

Claude owns:
- Ribbon/Tree/Inspector/Bottom composition
- visual hierarchy and design-system consistency
- product workflow presentation/discoverability
- browser-facing GUI completion
- final layout/interaction polish

For mixed Issues, split by explicit child Issue/ownership below. Neither agent should create a parallel implementation path.

---

## Time Outline / TimeGroup ownership — #411 sequence

Parent Epic:
- `#411` — coordination only. Do not implement the entire Epic as one task.

### Codex NOW

1. `#412` — **Codex**
   - explicit nested TimeGroup hierarchy in Canonical model
   - stable `parentId`
   - schema/migration/validation
   - derived hierarchy utilities
   - malformed graph rejection
   - Save/Open round-trip
   - NO GUI/Outline/fold geometry

2. `#413` — **Codex**, after #412
   - deterministic Group/Ungroup Semantic Commands
   - containment/parent resolution
   - automatic reparent
   - partial-overlap reject
   - atomic Undo/Redo
   - specific diagnostics
   - NO Outline rendering/fold mapping/Ribbon

### Claude after #413

3. `#414` — **Claude**
   - Excel-like Outline visualization above ruler
   - hierarchy rows/brackets
   - `+/-` controls
   - `[1][2][3...]` level controls
   - zoom/scroll/accessibility/real-browser visual acceptance
   - consume #412/#413 owners; do not reimplement hierarchy/command rules

### Codex after #414 is completed/closed

4. `#415` — **Codex**, dependency wait until #414 closes
   - nested collapse/effective fold resolution
   - shared `DisplayTimeMapping`
   - Axis Break mapping/geometry owner
   - Ruler/Signal/Grid/Playhead/Range/Annotation/Transaction/Bookmark shared time mapping
   - Clock/fold semantics and performance
   - NO final Ribbon/product closure

### Claude after #415

5. `#416` — **Claude**
   - Timeline Ribbon integration
   - final GUI workflow
   - persistence/export product acceptance
   - Cycle/Transaction/Split real-browser closure
   - final #411 product-level completion

Intended sequence:

```text
Codex  #412
  -> Codex  #413
  -> Claude #414
  -> Codex  #415
  -> Claude #416
```

Do not start #415 early merely because its Core scope is clear; #414 is an explicit dependency in the current Issue contract.

---

## Current Claude / GUI-product lane

Unless explicitly transferred, Claude owns browser/product completion for:
- `#403`–`#409` Contextual Ribbon / Cycle-Transaction-Split sequence
- `#414` Time Outline GUI
- `#416` Time Outline final Ribbon/export/E2E closure
- `#419` Highlight Cycle Snap / Free product UI
- `#424` Marker adjustable vertical-span GUI
- `#426` Bottom Panel UX consolidation Epic
- `#397` Transaction + Split sample-driven product acceptance
- `#200` remaining Signal Split GUI/product completion if still open

`#402` Signal Bottom Panel Draft/Apply work has been implemented/merged; do not reopen it merely to create work. Remaining Bottom consolidation belongs to #426/children.

`#405` Ribbon composition foundation has been implemented/merged; later contextual Ribbon Issues must reuse it rather than create a second composition owner.

---

## Current Codex queue authority

The actual executable order is `.codex/ISSUE_ORDER.txt`.

At this reconciliation it is:

```text
#412
#413
```

`#415` is Codex-owned but not executable until #414 is completed and the control queue is updated.

---

## Holds / mixed ownership

### `#177` — external/product hold

Final parity lane is NOT currently executable.
- Replacement Pack path count = 0
- required product decision pending
- do not invent/synthesize Replacement Pack input
- do not repeatedly re-audit unchanged blocker state

### `#205` — mixed / Claude-held unless explicitly decomposed

Although open, do not let Codex auto-claim the whole datasheet-grade annotation product surface. If a concrete Core geometry/runtime defect is isolated, file/transfer that bounded child separately.

### `#250` — product-decision hold

Production AI provider contract remains a product decision. Do not invent an arbitrary provider merely to close it.

### `#272` — closed not_planned

External GitHub Actions runner/billing condition. It is not a repository implementation task.

---

## Recently completed / do not reimplement

Do not re-add these merely to generate more audit/tests:
- `#410 #399 #398 #237 #417 #428`
- `#372 #366 #369 #363 #269 #281`
- `#221 #171 #170 #167 #161 #175`
- `#272` closed not_planned

`#428` was a one-off explicit Codex transfer for Bottom shell layout and is completed. It does NOT transfer #426 or future Bottom GUI work to Codex.

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

Before editing a hot area, sync latest `origin/main` and confirm the predecessor Issue/other-agent work required by dependency has merged.

If an Issue spans GUI and Core:
- active owner handles only its assigned slice
- the other agent may provide evidence/review
- do not patch across ownership boundary merely to make one E2E pass
- create/transfer a bounded child Issue when necessary

## Implementation-first policy

Prefer:

```text
identify concrete missing behavior
-> root cause
-> bounded production implementation
-> focused verification
-> evidence/close
```

Test-only commits are appropriate only when the Issue itself is a test/harness contract or the test mechanically proves a concrete regression/acceptance gap.
