# Claude / Codex Issue Ownership

Last reconciled: 2026-09-05 16:53 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main at reconciliation: `391bd916587c6ac98ab283947652f5611d3a9292`
Open Issues observed: 18

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

Prioritize concrete product residuals over repeated broad audit/test-only cycles.

A test-only commit is appropriate when:
- the Issue itself is a test/harness contract, or
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

1. `#223` + `#264` — Logic/Event/Pulse end-to-end product lifecycle. Treat as ONE implementation/evidence stream.
   - PR #370 already added the missing Logic Insert Ribbon entry.
   - Continue with Event/Pulse normal production lifecycle: Insert + Tree creation equivalence, editing without raw JSON, Undo/Redo, Save/Open, renderer/adapter path, export, and real-browser E2E.
   - One Add must remain one SemanticCommand/history operation; do not implement `binary -> mutate type` as a second commit.
   - Do not close either Issue until the shared acceptance set proves the full lifecycle.

2. `#222` + `#265` — Spacer end-to-end product lifecycle. Treat as ONE implementation/evidence stream.
   - Add first-class Spacer entry points to Insert Ribbon and Left Tree Add.
   - Preserve Spacer as a stable layout object, never a fake Signal.
   - Complete selection, height edit, reorder/move, delete, Undo/Redo, Save/Open and export through existing owners.
   - Clipboard behavior must converge on the central `#221` policy; do not invent a separate clipboard implementation.

3. `#200` — Signal Split GUI/product completion, **only after Codex posts `CORE_READY_FOR_GUI` on #200**.
   - Until that marker exists, Claude must not resume the paused PR4 implementation.
   - After handoff: real Upper/Lower/Both routing, assignment UI, splitter UX, browser acceptance and remaining presentation lifecycle.

### Claude queue completed — do not reimplement

The following former Claude queue items are now closed and must not remain active:
- `#293` constrained non-Home design-system architecture.
- `#176` professional CAD/EDA usability closure.
- `#262` final eight-axis GUI/UX closure gate.
- `#260 #181 #182 #184 #185 #186 #306 #309 #172 #205 #267`.

### Claude must not independently implement

Current Codex/Core-owned work includes:
- `#369` empty-Group first-insert projection/render bug.
- `#366` visual-reference wave-owner/ViewMetrics timing bug.
- `#200` until `CORE_READY_FOR_GUI` handoff.
- `#221 #269 #171 #170 #167 #161 #177 #175 #281`.

If Claude encounters one of these while verifying a GUI issue, record concrete reproduction/evidence and stop at the ownership boundary. Do not patch renderer/projection/runtime hot paths merely to unblock a Claude test.

## Codex ownership — Core / Data / Geometry / Runtime / Reliability

Codex owns Canonical/data integrity, command/history policy, geometry/time mapping, projection/renderer correctness, runtime lifecycle, clipboard semantics, structured diagnostics, performance architecture and core closure.

Current concrete Core bugs `#369` and `#366` take precedence over broad test-only churn. `#281` remains valid correctness-harness work but should not displace implementable production defects.

For `#200`, Codex owns Core-model reconciliation only. Leave one authoritative split-assignment model, post `CORE_READY_FOR_GUI`, then stop #200 implementation and hand the remaining GUI/product work to Claude.

## Holds

### Product-decision hold

- `#250` AI provider integration. Provider-neutral Preview/Validate/Apply, deterministic/offline provider and representative semantic-domain coverage exist. Remaining closure requires an explicit production-provider contract: provider/transport, configuration, auth/secrets, network failure behavior and real-provider smoke target. Do not invent an arbitrary network provider merely to close the Issue.

### External / human hold

- `#272` GitHub Actions quality gate. Billing/spending-limit prevents runner allocation. Re-evaluate after billing is restored.

## Recently completed — remove from active queues

Current-session / recent closures include:
- `#363` timeline-zoom runtime-context test regression.
- `#357` visual-reference StrictMode/runtime mount crash.
- `#313` authoritative range-drag geometry.
- `#293` constrained non-Home design-system architecture.
- `#176` professional CAD/EDA usability closure.
- `#262` final GUI/UX closure.
- `#260 #181 #182 #184 #185 #186 #306 #309 #172 #205 #267`.

Earlier completed items remain closed and must not be reimplemented: `#165 #166 #169 #180 #210 #219 #259 #273 #275 #277 #328 #331 #332 #352`.

## Cross-agent collision rules

Hot files include `minimal-cycle-view.tsx`, `minimal-cycle-view-ribbon.tsx`, runtime bridge/geometry owners, shared design-system/CSS primitives, renderer/projection owners and semantic-command registries.

Before editing a hot file, resync from latest `origin/main` and confirm the other agent's latest relevant PR is merged. Keep changes Issue-scoped and short-lived.

If an Issue spans GUI and Core, the active owner above remains authoritative. The other agent may provide evidence/review, but must not create a parallel implementation path.
