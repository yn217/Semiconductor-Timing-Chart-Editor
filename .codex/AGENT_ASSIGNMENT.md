# Claude / Codex Issue Ownership

Last reconciled: 2026-09-05 12:34 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main at reconciliation: `ebe2850fddd418c924dc260d45ab596eaf4be82b`
Open Issues observed: 33

This file is the authoritative agent-ownership split. One Issue has one implementation owner at a time. Do not have Claude and Codex independently implement the same Issue.

## Shared operating rules

- Both agents start each Issue from latest `origin/main`.
- Claude works on `agent/claude` or a short-lived Claude branch; Codex works on `main` according to `.codex/ISSUE_ORDER.txt`.
- After a Claude PR merges, Claude resyncs from latest `origin/main` before the next Issue.
- Codex never merges/cherry-picks `codex-control`; it only reads control files from that branch.
- Home Ribbon remains frozen unless an Issue or explicit user instruction authorizes a Home change.
- Never modify Golden/reference/threshold/mask merely to make a test pass.
- Never reset/stash/clean/delete unrelated user work.
- GitHub Actions is currently unavailable because of billing/spending-limit failure. This is NOT an implementation failure and is NOT a global blocker. Use local verification and record `GitHub Actions: NOT RUN — billing/spending limit`.
- Required local verification as applicable: TypeScript, architecture/boundary/performance gates, focused unit tests, relevant real-Chromium Playwright/E2E, `git diff --check`.
- If an Issue is already satisfied, collect evidence, close it, and continue. Do not manufacture a code change.
- If the same Issue-local blocker reproduces twice, quarantine only that Issue and continue to the next independent Issue.
- Closed Issues are removed from active ownership queues. Do not reopen or reimplement them unless the user explicitly requests it.

## Claude ownership — GUI / UX / Visual / Editor surfaces

Claude owns GUI composition, Ribbon/Inspector/Bottom/Tree interaction presentation, design-system use, visual acceptance, editor workflow UX, and GUI truthfulness.

### Immediate Claude queue

1. `#332` capability/effect audit closure only — Preview items A/B and disabled-reason item D are merged; finish item C so a status-text-only fake implementation mechanically fails the capability audit
2. `#260` design-token + region CSS ownership closure audit
3. `#181` Left Tree / role geometry / MiniMap
4. `#182` approved v8 production GUI closure
5. `#184` GUI v8 closure blockers
6. `#185` Golden-image visual acceptance
7. `#176` professional CAD GUI usability closure
8. `#262` final GUI/UX closure gate
9. `#293` non-Home constrained design-system migration closure
10. `#306` visual scenario acceptance harness
11. `#309` interaction before/after/undo visual scenarios — only after gesture dependencies are safe

### Claude product-GUI follow-ups

- `#205` datasheet-grade timing annotation GUI/editor workflow
- `#267` Group Band editor and visual/export workflow, after Spacer/layout dependencies are ready
- `#172` Full GUI broad closure/audit only; do not invent duplicate semantic architecture
- `#186` Golden GUI harness only if still materially open after #185/#306 evidence

### Claude must not independently implement

Current Core/data/performance/geometry/history/clipboard/resource-policy work assigned to Codex includes `#170 #175 #200 #210 #221 #222 #223 #250 #264 #265 #269 #281 #313` plus Codex broad closure/audit Issues listed below.

If a Claude GUI fix discovers a core defect in a Codex-owned Issue, record the concrete defect and stop at the ownership boundary unless the user explicitly reassigns it.

## Codex ownership — Core / Data / Geometry / Performance / Architecture

Codex owns Canonical/data integrity, Semantic Command behavior, clipboard policy, geometry/time mapping, projection/renderer scaling, history, resource budgets, AI semantic gateway, architecture/build hygiene, and non-visual performance closure.

### Immediate Codex queue

1. `#200` Signal Split View core projection/time-domain architecture
2. `#210` Clock / Edge Counter exact rendered-edge semantics
3. `#221` clipboard semantics matrix
4. `#222` / `#265` Spacer workflow — audit overlap/dependency first, use one production implementation
5. `#223` / `#264` Logic/Event/Pulse lifecycle — audit overlap/dependency first, use one production implementation
6. `#250` AI semantic operation gateway
7. `#269` structured diagnostics model and command/IO error propagation
8. `#281` property/state-machine correctness harness

### Codex closure-only / no-parallel-implementation lane

- `#313` authoritative range-drag geometry: PRs `#338` and `#341` are merged. The reported drag-release authority mismatch and Escape trailing-click leak are fixed. Treat this as a focused closure verification item first; explicitly prove the remaining 100k unsampled-boundary, terminal-boundary, reverse-drag, folds/rebase, zoom/scroll and view-only acceptance before closing. Implement only a bounded residual gap if that audit fails.

### Codex broad closure/audit lane

- `#161 #167 #170 #171 #175 #177`

These older Phase/Umbrella Issues are audited against current `main`. Do not recreate historical `rewrite/v2` execution structure. Close with evidence when already satisfied; implement only bounded residual gaps.

### Codex quarantine / special handling

- `#221 #222 #223 #269 #281` may encounter the previously known shared gesture/coordinate blocker. If reproduced twice, quarantine only the affected Issue and continue.
- `#272` GitHub Actions quality gate is EXTERNAL/HUMAN HOLD while billing/spending limit prevents runner allocation. Do not spend product-development cycles retrying it. Re-evaluate only after billing is restored.

## Recently completed / removed from active split

- `#165` Geometry Semantic/Local/Screen contract — closed.
- `#166` RowLayout + Stable Waveform Surface — closed.
- `#169` Reorder / Visibility / D&D — closed.
- `#180` bounded virtualization projection — closed.
- `#219` renderer/runtime scaling — closed.
- `#259` production query-routable architecture probes — closed.
- `#328` Product Resource Budget enforcement — closed.
- `#352` uncontrolled period-2 Clock timeline ripple regression — fixed by Codex (`510f41c` / `8ce9f60`) and closed.
- `#331` Font editing correctness/UX — closed.
- `#273` LabelAnchor source/display contract — closed.
- `#275` bounded Undo/Redo retention — closed.
- `#277` ArchitectureProbe / StableSurfaceProbe extraction — closed.

## Current partials worth preserving

- `#332`: Annotation Preview (#337), Clock Preview (#353), and contextual Arrange disabled reasons (#354) are merged. Keep open only for the automated capability/effect-contract requirement and any acceptance evidence it reveals.
- `#313`: core fixes are merged but the Issue remains open for the explicit full closure matrix; do not restart broad gesture implementation without a failing acceptance case.

## Cross-agent collision rules

Files such as `minimal-cycle-view.tsx`, `minimal-cycle-view-ribbon.tsx`, `design-system.tsx`, shared CSS primitives, renderer/projection owners, and semantic command registries are hot files. Before modifying a hot file, each agent must resync from latest `origin/main` and confirm the other agent's latest PR is merged.

Do not keep long-lived divergent changes to the same hot file. Prefer small Issue-scoped PRs from Claude and short coherent Codex commits on current main.

If an Issue spans GUI and core, the listed owner remains the primary implementation owner. The other agent may provide review/evidence but must not create a parallel implementation path.
