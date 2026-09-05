# Claude / Codex Issue Ownership

Last reconciled: 2026-09-05 19:06 JST
Repository: `yn217/Semiconductor-Timing-Chart-Editor`
Current product branch: `main`
Observed main at reconciliation: `00d2661f2bbe030f14efdc849e2beb7d3b99d4c9`
Open Issues observed: 14

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

1. `#200` — Signal Split GUI/product completion. **START NOW.**
   - Codex posted `CORE_READY_FOR_GUI` on #200 after Core reconciliation in commit `5b664ce`.
   - The authoritative assignment model is `signal.display.splitPane`; the standalone duplicate assignment model was removed.
   - Claude now owns the remaining product surface: real Upper/Lower/Both routing, assignment UI, splitter UX, Save/Open presentation policy, export-once behavior, real-browser acceptance and performance evidence.
   - Do not create a second horizontal time/zoom/ruler/playhead/range/snap owner.
   - `Both` must retain one canonical Signal ID and one semantic waveform truth; default full-document export must emit that Signal once.
   - A GUI control is not complete unless it changes the real split presentation in the same implementation slice; no status-only/fake controls.

2. `#223` + `#264` — Logic/Event/Pulse lifecycle **REVERIFY AFTER #372 IS FIXED**.
   - PR #370 added the missing Logic Insert Ribbon entry.
   - Insert + Tree creation, non-JSON editing, Undo/Redo, live rendering and SVG/PNG/PDF export are already evidenced.
   - The only remaining blocker is `#372`: Event/Pulse canonical Save/Open round-trip succeeds, but the full-document-replace projection/render path drops those rows from the DOM after Open.
   - Claude must not patch #372's renderer/projection/runtime path. Once Codex closes #372, immediately rerun the Event/Pulse lifecycle E2E and close #223/#264 if the full acceptance set passes.
   - Do not idle waiting for #372 while #200 remains implementable.

### Claude queue completed — do not reimplement

The following former Claude queue items are now closed and must not remain active:
- `#222 #265` Spacer lifecycle — PR #371 merged; both Issues closed after first-class GUI/clipboard/reorder/lifecycle evidence.
- `#293` constrained non-Home design-system architecture.
- `#176` professional CAD/EDA usability closure.
- `#262` final eight-axis GUI/UX closure gate.
- `#260 #181 #182 #184 #185 #186 #306 #309 #172 #205 #267`.

### Claude must not independently implement

Current Codex/Core-owned work includes:
- `#372` Event/Pulse rows dropped after Save->Open full-document replace.
- `#366` visual-reference wave-owner/ViewMetrics timing bug.
- `#221 #171 #170 #167 #161 #177 #175`.

`#369` is now closed and must not remain an active blocker.

If Claude encounters one of the Core-owned issues while verifying a GUI issue, record concrete reproduction/evidence and stop at the ownership boundary. Do not patch renderer/projection/runtime hot paths merely to unblock a Claude test.

## Codex ownership — Core / Data / Geometry / Runtime / Reliability

Codex owns Canonical/data integrity, command/history policy, geometry/time mapping, projection/renderer correctness, runtime lifecycle, clipboard semantics, performance architecture and broad Core closure.

Concrete Core defects `#372` and `#366` should be resolved without asking Claude to patch renderer/projection/runtime internals. `#369` is completed. `#281`/`#269` and other recently completed Core work must not be re-added to the active queue merely to generate more tests.

For `#200`, Codex Core work is complete and ownership has transferred to Claude. Codex must not build a parallel Signal Split GUI/renderer route unless Claude reports a new, specifically Core-owned defect.

## Holds

### Product-decision hold

- `#250` AI provider integration. Provider-neutral Preview/Validate/Apply, deterministic/offline provider and representative semantic-domain coverage exist. Remaining closure requires an explicit production-provider contract: provider/transport, configuration, auth/secrets, network failure behavior and real-provider smoke target. Do not invent an arbitrary network provider merely to close the Issue.

### External / human hold

- `#272` GitHub Actions quality gate. Billing/spending-limit prevents runner allocation. Re-evaluate after billing is restored.

## Recently completed — remove from active queues

Current-session / recent closures include:
- `#222 #265` Spacer lifecycle via PR #371.
- `#369` empty-Group first-insert projection/render bug.
- `#363` timeline-zoom runtime-context test regression.
- `#357` visual-reference StrictMode/runtime mount crash.
- `#313` authoritative range-drag geometry.
- `#293` constrained non-Home design-system architecture.
- `#176` professional CAD/EDA usability closure.
- `#262` final GUI/UX closure.
- `#260 #181 #182 #184 #185 #186 #306 #309 #172 #205 #267`.

Earlier completed items remain closed and must not be reimplemented: `#165 #166 #169 #180 #210 #219 #259 #269 #273 #275 #277 #281 #328 #331 #332 #352`.

## Cross-agent collision rules

Hot files include `minimal-cycle-view.tsx`, `minimal-cycle-view-ribbon.tsx`, runtime bridge/geometry owners, shared design-system/CSS primitives, renderer/projection owners and semantic-command registries.

Before editing a hot file, resync from latest `origin/main` and confirm the other agent's latest relevant PR is merged. Keep changes Issue-scoped and short-lived.

If an Issue spans GUI and Core, the active owner above remains authoritative. The other agent may provide evidence/review, but must not create a parallel implementation path.
