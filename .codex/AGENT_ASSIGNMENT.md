# Claude / Codex Issue Ownership

Last reconciled: 2026-09-05 15:40 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main at reconciliation: `1fc36b6ad9fba865f5c8f12b73da4931c638a2fa`
Open Issues observed: 20

This file is the authoritative agent-ownership split. One Issue has one active implementation owner at a time. Do not have Claude and Codex independently implement the same Issue.

## Shared operating rules

- Both agents start each Issue from latest `origin/main`.
- Claude works through `agent/claude` or short-lived Claude PR branches; Codex works single-threaded on `main` according to `.codex/ISSUE_ORDER.txt`.
- After a Claude PR merges, Claude resyncs from latest `origin/main` before the next Issue.
- Codex never merges/cherry-picks `codex-control`; it only reads the control files from that branch.
- Never reset/stash/clean/delete unrelated user work.
- Preserve Canonical -> Derived/Projection -> DOM ownership and shared SemanticCommand mutation paths.
- Renderer/DOM/ruler samples are not semantic authority. Stable IDs remain opaque.
- Home Ribbon is protected unless an Issue or explicit user instruction authorizes a Home change.
- Golden/reference/threshold/mask must not be changed merely to pass. The 2026-09-05 v8 Golden regeneration in PR #362 was explicitly user/product approved and is the current approved baseline; any later Golden change again requires explicit approval.
- GitHub Actions remains unavailable because of billing/spending-limit runner allocation. This is NOT an implementation failure and is NOT a global blocker. Use local verification and record `GitHub Actions: NOT RUN — billing/spending limit`.
- Required local verification as applicable: TypeScript, architecture/boundary/performance gates, focused unit tests, relevant real-Chromium Playwright/E2E, `git diff --check`.
- If an Issue is already satisfied, collect evidence and close it; do not manufacture a code change.
- If the same Issue-local blocker reproduces twice, quarantine only that Issue and continue.

## Implementation-first policy

The remaining backlog is small enough that agents should prioritize concrete product residuals over repeated broad audit/test-only cycles.

A test-only commit is appropriate when:
- the Issue itself is a test/harness contract (for example #281), or
- it reproduces/proves a concrete regression or closes an explicit acceptance gap.

Otherwise prefer:

```text
identify concrete missing product behavior
-> implement bounded production residual
-> focused verification
-> close/evidence
```

Do not spend repeated cycles adding measurements/assertions while an independent, implementable feature gap remains.

## Claude ownership — GUI / UX / product surfaces

Claude owns Ribbon/Tree/Inspector/Bottom composition, discoverability, product workflow presentation, visual/system consistency and browser-facing completion.

### Immediate Claude queue

1. `#223` + `#264` — Event/Pulse end-to-end product lifecycle. Treat as ONE implementation and use one evidence set to close both overlapping contracts where satisfied.
2. `#222` + `#265` — Spacer end-to-end product lifecycle. Treat as ONE implementation; reuse existing canonical Spacer/RowLayout/organization owners.
3. `#293` — constrained non-Home design-system architecture closure; preserve the current approved Home baseline.
4. `#176` — professional CAD/EDA usability closure.
5. `#262` — final eight-axis GUI/UX closure gate.

### Staged handoff for #200 Signal Split

`#200` currently has Codex as the active owner ONLY for the Core-model reconciliation described below.

When Codex posts an Issue comment containing `CORE_READY_FOR_GUI` with evidence that one authoritative split-assignment model remains, ownership automatically transfers to Claude for the remaining product surface:
- real Upper/Lower/Both per-signal routing;
- Bottom/Inspector assignment UX;
- splitter UX;
- browser acceptance and remaining presentation lifecycle.

At that handoff, Codex stops implementing #200 unless Claude records a new bounded Core defect. No parallel PR4 implementation.

### Claude must not independently implement

Current Codex-owned Core/data/runtime work: `#363 #200` (until handoff) `#221 #269 #171 #170 #167 #161 #177 #175 #281`.

If Claude discovers a Core defect in one of these, record the concrete defect and stop at the ownership boundary unless this file or the user reassigns it.

## Codex ownership — Core / Data / Geometry / Runtime / Reliability

Codex owns Canonical/data integrity, command/history policy, geometry/time mapping, runtime lifecycle, clipboard semantics, structured diagnostics, performance architecture and core closure.

### Immediate Codex queue

1. `#363` — fast-fix the current timeline-zoom unit/runtime-context regression. Keep this narrow; restore the green unit baseline first.
2. `#200` — Core reconciliation ONLY. Resolve the duplicate Signal Split assignment models (`signal.display.splitPane` versus standalone `SignalSplitAssignment[]`) into one authoritative presentation model. Do not build a parallel GUI. Post `CORE_READY_FOR_GUI` and hand off to Claude.
3. `#221` — complete central clipboard semantics across entities using one policy/command path.
4. `#269` — structured diagnostics/error propagation through command/IO/parser/export/Problems paths.
5. `#171` — Annotation/Snap semantic/geometry closure audit and only bounded residual Core fixes.
6. `#170` — Timeline semantic-transform closure audit and bounded residual fixes.

### Later Codex correctness / broad-closure lane

- `#167` Minimal Cycle View closure.
- `#161` Architecture Lock closure.
- `#177` V1 -> V2 parity audit closure.
- `#175` Interaction Performance Closure — background lane; recent production Zoom/viewport optimizations are real progress, but do not let this consume the main product queue through repeated test-only measurement work.
- `#281` property/state-machine correctness harness — inherently test-focused, therefore intentionally late in the queue after concrete product residuals.

## Holds

### Product-decision hold

- `#250` AI provider integration. Provider-neutral Preview/Validate/Apply, deterministic/offline provider and representative semantic-domain coverage exist. Remaining closure requires an explicit production-provider contract: provider/transport, configuration, auth/secrets, network failure behavior and real-provider smoke target. Do not invent an arbitrary network provider merely to close the Issue.

### External / human hold

- `#272` GitHub Actions quality gate. Billing/spending-limit prevents runner allocation. Do not burn product-development cycles retrying it; re-evaluate after billing is restored.

## Recently completed — remove from active queues

Current session closures include:
- `#357` visual-reference StrictMode/runtime mount crash — closed.
- `#313` authoritative range-drag geometry — closed.
- `#260` CSS/design-token ownership / legacy cascade retirement — closed.
- `#181` Left Tree / role geometry / MiniMap — closed.
- `#182` approved v8 production GUI closure — closed.
- `#184` GUI v8 blockers — closed.
- `#185` Golden visual acceptance — closed after explicitly approved PR #362 baseline update and passing mechanical visual gate.
- `#186` Golden GUI Harness Engineering — closed.
- `#306` AI-assisted Visual Scenario Harness — closed.
- `#309` interaction before/after/undo visual scenarios — closed.
- `#172` Full GUI — closed.
- `#205` datasheet-grade timing annotations — closed.
- `#267` Group Band editor — closed.

Earlier completed items remain closed and must not be reimplemented: `#165 #166 #169 #180 #210 #219 #259 #273 #275 #277 #328 #331 #332 #352`.

## Cross-agent collision rules

Hot files include `minimal-cycle-view.tsx`, `minimal-cycle-view-ribbon.tsx`, runtime bridge/geometry owners, shared design-system/CSS primitives, renderer/projection owners and semantic-command registries.

Before editing a hot file, resync from latest `origin/main` and confirm the other agent's latest relevant PR is merged. Keep changes Issue-scoped and short-lived.

If an Issue spans GUI and Core, the active owner above remains authoritative. The other agent may provide evidence/review, but must not create a parallel implementation path.
