# Claude / Codex Issue Ownership

Last reconciled: 2026-09-05 07:00 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main at reconciliation: `8399228e330e37d580277e9c297949a9e39f446b`
Open Issues observed: 44

This file is the authoritative agent-ownership split. One Issue has one implementation owner at a time. Do not have Claude and Codex independently implement the same Issue.

## Shared operating rules

- Both agents start each Issue from latest `origin/main`.
- Claude works on `agent/claude`; Codex works on `main` according to `.codex/ISSUE_ORDER.txt`.
- After a Claude PR merges, Claude resyncs from latest `origin/main` before the next Issue.
- Codex never merges/cherry-picks `codex-control`; it only reads control files from that branch.
- Home Ribbon remains frozen unless an Issue or explicit user instruction authorizes a Home change.
- Never modify Golden/reference/threshold/mask merely to make a test pass.
- Never reset/stash/clean/delete unrelated user work.
- GitHub Actions is currently unavailable because of billing/spending-limit failure. This is NOT an implementation failure and is NOT a global blocker. Use local verification and record `GitHub Actions: NOT RUN — billing/spending limit`.
- Required local verification as applicable: TypeScript, architecture/boundary/performance gates, focused unit tests, relevant real-Chromium Playwright/E2E, `git diff --check`.
- If an Issue is already satisfied, collect evidence, close it, and continue. Do not manufacture a code change.
- If the same Issue-local blocker reproduces twice, quarantine only that Issue and continue to the next independent Issue.

## Claude ownership — GUI / UX / Visual / Editor surfaces

Claude owns GUI composition, Ribbon/Inspector/Bottom/Tree interaction presentation, design-system use, visual acceptance, editor workflow UX, and GUI truthfulness.

### Immediate Claude queue

1. `#331` Font editing correctness/UX remaining scope
2. `#332` real Preview behavior / capability truthfulness
3. `#260` design-token + region CSS ownership closure audit
4. `#181` Left Tree / role geometry / MiniMap
5. `#182` approved v8 production GUI closure
6. `#184` GUI v8 closure blockers
7. `#185` Golden-image visual acceptance
8. `#176` professional CAD GUI usability closure
9. `#262` final GUI/UX closure gate
10. `#293` non-Home constrained design-system migration closure
11. `#306` visual scenario acceptance harness
12. `#309` interaction before/after/undo visual scenarios — only after gesture dependencies are safe

### Claude product-GUI follow-ups

- `#205` datasheet-grade timing annotation GUI/editor workflow
- `#267` Group Band editor and visual/export workflow, after Spacer/layout dependencies are ready
- `#172` Full GUI broad closure/audit only; do not invent duplicate semantic architecture
- `#186` Golden GUI harness only if still materially open after #185/#306 evidence

### Claude must not independently implement

Core/data/performance/geometry/history/clipboard/resource-policy Issues assigned to Codex below, including `#165 #166 #169 #170 #175 #180 #200 #210 #219 #221 #222 #223 #250 #259 #264 #265 #269 #273 #275 #277 #281 #313 #328`.

If a Claude GUI fix discovers a core defect in a Codex-owned Issue, record the concrete defect and stop at the ownership boundary unless the user explicitly reassigns it.

## Codex ownership — Core / Data / Geometry / Performance / Architecture

Codex owns Canonical/data integrity, Semantic Command behavior, clipboard policy, geometry/time mapping, projection/renderer scaling, history, resource budgets, AI semantic gateway, architecture/build hygiene, and non-visual performance closure.

### Immediate Codex queue

1. `#328` enforce Product Resource Budget at authoritative canonical mutation/replacement boundary
2. `#180` viewport projection scaling closure audit / residual implementation
3. `#219` renderer/runtime scaling and diagnostic hot-path cleanup
4. `#273` LabelAnchor source/display contract
5. `#275` bounded Undo/Redo retention
6. `#259` / `#277` architecture probe extraction — audit overlap first, implement once, close duplicate/superseded Issue appropriately
7. `#200` Signal Split View core projection/time-domain architecture
8. `#210` Clock / Edge Counter exact rendered-edge semantics
9. `#221` clipboard semantics matrix
10. `#222` / `#265` Spacer workflow — audit overlap/dependency first, use one production implementation
11. `#223` / `#264` Logic/Event/Pulse lifecycle — audit overlap/dependency first, use one production implementation
12. `#250` AI semantic operation gateway
13. `#269` structured diagnostics model and command/IO error propagation
14. `#281` property/state-machine correctness harness

### Codex broad closure/audit lane

- `#161 #165 #166 #167 #169 #170 #171 #175 #177`

These older Phase/Umbrella Issues are audited against current `main`. Do not recreate historical `rewrite/v2` execution structure. Close with evidence when already satisfied; implement only bounded residual gaps.

### Codex quarantine / special handling

- `#313` authoritative range-drag geometry: keep quarantined until the known shared browser-coordinate/gesture blocker has a production-safe reproduction/fix path. Do not increase ruler tick density or use sampled DOM coordinates as a workaround.
- `#221 #222 #223 #269 #281` may also encounter the previously known shared gesture/coordinate blocker. If reproduced twice, quarantine only the affected Issue and continue.
- `#272` GitHub Actions quality gate is EXTERNAL/HUMAN HOLD while billing/spending limit prevents runner allocation. Do not spend product-development cycles retrying it. Re-evaluate only after billing is restored.

## Cross-agent collision rules

Files such as `minimal-cycle-view.tsx`, `minimal-cycle-view-ribbon.tsx`, `design-system.tsx`, shared CSS primitives, renderer/projection owners, and semantic command registries are hot files. Before modifying a hot file, each agent must resync from latest `origin/main` and confirm the other agent's latest PR is merged.

Do not keep long-lived divergent changes to the same hot file. Prefer small Issue-scoped PRs from Claude and short coherent Codex commits on current main.

If an Issue spans GUI and core, the listed owner remains the primary implementation owner. The other agent may provide review/evidence but must not create a parallel implementation path.
