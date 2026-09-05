# Claude / Codex Issue Ownership

Last reconciled: 2026-09-05 13:19 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main at reconciliation: `fec3566d96cf73cdb87d1e0b5437bdc4530dfb28`
Open Issues observed: 32

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

## Current cross-lane P0 blocker — #357

`#357` (`/?visual-reference` fails to mount) is a Codex-owned Core/runtime blocker.

Why Codex owns it:
- the failure is React StrictMode / Hook ordering / runtime lifecycle / disposal territory;
- it involves the hot orchestration/runtime path rather than visual styling;
- a clean `/?visual-reference` page currently fails before GUI visual acceptance can run meaningfully.

Coordination while #357 is active:
- Codex owns root-cause analysis and the smallest production-safe fix.
- Claude MUST NOT concurrently edit `apps/editor/src/minimal-cycle-view.tsx` or the same runtime lifecycle owner while Codex is working #357.
- Claude may continue #260 residual token/guard work if it stays outside the #357 hot-file path.
- Do not "fix" #357 by weakening/removing StrictMode, bypassing the visual-reference route, or changing Golden/reference/threshold/mask merely to get tests green.
- Fresh-browser evidence is required after the fix: `/?visual-reference` mounts, no Hook-order / duplicate-createRoot / disposed-runtime errors, and the affected specs reach the actual product.

Visual-reference-dependent closure portions of these Claude Issues wait for #357:
- `#181 #182 #184 #185 #186 #306 #309`

This is an Issue-local dependency, not a global project stop. Claude can continue independent non-hot-file work.

## Claude ownership — GUI / UX / Visual / Editor surfaces

Claude owns GUI composition, Ribbon/Inspector/Bottom/Tree interaction presentation, design-system use, visual acceptance, editor workflow UX, and GUI truthfulness.

### Immediate Claude queue

1. `#260` residual design-token / CSS-owner closure only
   - PR #356 completed the legacy-cascade relocation: `legacy.css` is 449 bytes / 0 selectors.
   - Do NOT invent more legacy migration work.
   - Finish the shared CAD token contract and add a hard guard that rejects new production selectors in `legacy.css`.
   - Final visual/current-contract confirmation waits for #357.
2. `#181` Left Tree / role geometry / MiniMap residual closure — after #357 for full visual-reference evidence. Preserve already accepted Collapse/Visibility/Role/MiniMap work.
3. `#182` approved v8 production GUI closure — after #357.
4. `#184` GUI v8 closure blockers — after #357 where visual-reference dependent.
5. `#185` Golden-image visual acceptance — after #357.
6. `#176` professional CAD GUI usability closure.
7. `#262` final GUI/UX closure gate.
8. `#293` non-Home constrained design-system migration closure.
9. `#306` visual scenario acceptance harness — visual-reference scenarios after #357.
10. `#309` interaction before/after/undo visual scenarios — after #357 and any remaining gesture dependency.

### Claude product-GUI follow-ups

- `#205` datasheet-grade timing annotation GUI/editor workflow.
- `#267` Group Band editor and visual/export workflow, after Spacer/layout dependencies are ready.
- `#172` Full GUI broad closure/audit only; do not invent duplicate semantic architecture.
- `#186` Golden GUI harness after #357, and only if still materially open after #185/#306 evidence.

### Claude must not independently implement

Current Core/data/performance/geometry/history/clipboard/resource-policy/runtime work assigned to Codex includes `#357 #313 #170 #175 #200 #221 #222 #223 #250 #264 #265 #269 #281` plus Codex broad closure/audit Issues listed below.

If a Claude GUI fix discovers a core defect in a Codex-owned Issue, record the concrete defect and stop at the ownership boundary unless the user explicitly reassigns it.

## Codex ownership — Core / Data / Geometry / Performance / Architecture

Codex owns Canonical/data integrity, Semantic Command behavior, clipboard policy, geometry/time mapping, projection/renderer scaling, history, resource budgets, AI semantic gateway, architecture/build hygiene, React/runtime lifecycle, and non-visual performance closure.

### Immediate Codex queue

1. `#357` P0 visual-reference mount / StrictMode / runtime lifecycle blocker.
2. `#313` focused closure audit for authoritative range geometry; implementation fixes are merged, so prove the remaining matrix first and change code only for a concrete bounded residual.
3. `#200` Signal Split View core projection/time-domain architecture.
4. `#250` AI semantic operation gateway.

### Codex overlap / dependency lane

- `#221` clipboard semantics matrix.
- `#222` / `#265` Spacer workflow — audit overlap/dependency first, use one production implementation.
- `#223` / `#264` Logic/Event/Pulse lifecycle — audit overlap/dependency first, use one production implementation.
- `#269` structured diagnostics model and command/IO error propagation.
- `#281` property/state-machine correctness harness.

These remain held/quarantined when the previously observed shared gesture/coordinate blocker is still the concrete blocker. If the blocker is no longer reproducible, re-enter one Issue at a time rather than reviving all at once.

### Codex broad closure/audit lane

- `#161 #167 #170 #171 #175 #177`

These older Phase/Umbrella Issues are audited against current `main`. Do not recreate historical `rewrite/v2` execution structure. Close with evidence when already satisfied; implement only bounded residual gaps.

### External / human hold

- `#272` GitHub Actions quality gate is EXTERNAL/HUMAN HOLD while billing/spending limit prevents runner allocation. Do not spend product-development cycles retrying it. Re-evaluate only after billing is restored.

## Recently completed / removed from active split

- `#332` capability truthfulness / real Preview + effect audit — closed after PR #355; A/B/C/D are complete.
- `#165` Geometry Semantic/Local/Screen contract — closed.
- `#166` RowLayout + Stable Waveform Surface — closed.
- `#169` Reorder / Visibility / D&D — closed.
- `#180` bounded virtualization projection — closed.
- `#210` Clock Editor / Edge Counter parity — closed.
- `#219` renderer/runtime scaling — closed.
- `#259` production query-routable architecture probes — closed.
- `#328` Product Resource Budget enforcement — closed.
- `#352` uncontrolled period-2 Clock timeline ripple regression — fixed by Codex (`510f41c` / `8ce9f60`) and closed.
- `#331` Font editing correctness/UX — closed.
- `#273` LabelAnchor source/display contract — closed.
- `#275` bounded Undo/Redo retention — closed.
- `#277` ArchitectureProbe / StableSurfaceProbe extraction — closed.

## Current partials worth preserving

- `#260`: legacy CSS relocation is DONE; keep open only for the residual token-contract, hard anti-regression guard, and final visual/current-contract evidence after #357.
- `#181`: accepted Collapse/Visibility semantics, Role badge geometry and focused MiniMap evidence must not be redone; remaining full-v8 visual/E2E closure waits for #357.
- `#175`: current `main@fec3566` removes `zoom` from the pane/host resize effect dependency, eliminating one redundant resize-render path on view-only Zoom. This is partial progress only; retain the full performance/latency/invalidation closure contract.
- `#313`: core fixes from PR #338/#341 are merged; do not restart broad gesture implementation without a failing acceptance case.
- `#357`: new P0 current-main runtime blocker; fix this before interpreting visual-reference test failures as GUI/Golden regressions.

## Cross-agent collision rules

Files such as `minimal-cycle-view.tsx`, `minimal-cycle-view-ribbon.tsx`, `design-system.tsx`, shared CSS primitives, renderer/projection owners, and semantic command registries are hot files. Before modifying a hot file, each agent must resync from latest `origin/main` and confirm the other agent's latest PR is merged.

During #357 specifically, `minimal-cycle-view.tsx` and the directly related runtime lifecycle owner are Codex-exclusive until the fix/PR is merged.

Do not keep long-lived divergent changes to the same hot file. Prefer small Issue-scoped PRs from Claude and short coherent Codex commits on current main.

If an Issue spans GUI and core, the listed owner remains the primary implementation owner. The other agent may provide review/evidence but must not create a parallel implementation path.
