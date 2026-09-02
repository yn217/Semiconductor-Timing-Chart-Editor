# Semiconductor Timing Chart Editor V2 — Issue Acceptance Snapshot

Captured by ChatGPT for `codex-control` on 2026-09-03 03:05 JST.

Purpose: fallback contract for Codex when the GitHub Issue body/Acceptance Criteria cannot be retrieved from the local execution environment.

Authority rules:

1. Current GitHub Issue body is the primary source of truth when it can be fetched successfully.
2. If GitHub Issue retrieval fails with 404/permission/tooling error, use this snapshot for the listed Issue only.
3. If both current GitHub Issue text and a snapshot section are unavailable, do not guess product behavior. Mark that Issue retrieval-blocked and continue to the next executable Issue.
4. If the current GitHub Issue body later conflicts with this snapshot, the current GitHub Issue body wins. Refresh this snapshot before implementation.
5. This snapshot is acceptance/closure guidance, not permission to weaken existing tests, Golden/reference/threshold/mask, or owner boundaries.

Snapshot scope: the current SAFE-FIRST queue plus the first mechanical visual/acceptance block. Later queue items still require live GitHub retrieval or a future snapshot refresh.

---

## #314 — Cross-document clipboard identity safety

Title: `[V2][P1][BUG][CLIPBOARD] Prevent cross-document paste from silently retargeting stable-ID references`

Goal: cross-document paste must never infer semantic identity only because a stable-ID string happens to match in another document.

Required contract:
- Clipboard payload records source document identity/epoch, or document replacement deliberately clears document-local clipboard contents.
- Reference-bearing Annotation/Transaction payloads use an explicit cross-document reject/remap policy.
- Do not silently reuse a foreign document's stable-ID string as proof of identity.
- Failed paste is atomic: Canonical/History/Dirty unchanged and a structured clipboard diagnostic is reported.

Acceptance:
- [ ] Clipboard provenance is recorded or clipboard is deliberately cleared on replacement.
- [ ] Annotation copied in A then pasted in B with a colliding textual Signal ID cannot silently retarget.
- [ ] Transaction `linkedSignals` follows the same cross-document policy.
- [ ] Missing/unmappable referenced targets fail deterministically with no partial mutation.
- [ ] Same-document Copy/Paste/Duplicate remains unchanged.
- [ ] Cut -> Open another document cannot become a silently retargeted paste.
- [ ] Undo/Redo after successful approved paste is exact.
- [ ] Failed paste leaves Canonical/History/Dirty unchanged and reports a structured diagnostic.
- [ ] Save/Open round-trip of successfully pasted entities is exact.
- [ ] Tests include deliberate stable-ID collision across two documents.

Closure rule: matching stable-ID strings in two different documents must never be treated as sufficient proof of semantic identity.

---

## #229 — Canonical -> Renderer compatibility / ValueSignal conversion

Title: `[V2][P0] Enforce Canonical → Renderer compatibility and define ValueSignal type semantics/conversion`

Goal: a Canonical document accepted as a supported production state must be renderable by the production WaveDrom path; GUI actions must not commit known-unrenderable type/value combinations.

Required contract:
- One authoritative compatibility policy is shared by parser/Open, Semantic Commands, Add Signal factories, Inspector type conversion, Event Table/Quick Values, WaveDrom Adapter, Save/Open and Export.
- Define explicit legal value domains and semantics for Binary / Logic / Event / Pulse.
- Define a ValueSignal conversion matrix including compatible/incompatible values, rejection/confirmation/normalization policy and exact Undo restoration.
- Do not silently coerce arbitrary unsupported values and do not weaken Adapter errors.

Acceptance:
- [ ] Supported Canonical state cannot later fail solely because Signal value/type is outside the supported renderer profile.
- [ ] Parser/Open rejects or compatibility-diagnoses unsupported value/type combinations before replacement.
- [ ] Every GUI Quick Value for every Signal type is renderable.
- [ ] Event/Pulse defaults are explicitly defined and renderable.
- [ ] State -> Binary with `IDLE/ACTIVE` cannot silently commit an unrenderable Binary.
- [ ] Bus -> Binary with non-logic values follows the documented conversion/rejection policy.
- [ ] Binary/Logic/Event/Pulse value domains are unit-tested against adapter conversion.
- [ ] Logic/Event/Pulse semantics are documented in Product/Data specs.
- [ ] Type conversion has real-browser tests for compatible, incompatible, Cancel, Apply, Undo/Redo and Save/Open.
- [ ] No Adapter error is hidden with a custom waveform or arbitrary fallback token.
- [ ] Golden/WaveDrom conformance is unchanged except for an explicitly approved product-spec delta.

---

## #279 — DisplayTimeMapping linearity/cache evidence closure

Title: `[V2][P1][PERF] Make DisplayTimeMapping linear and cache it by timeline/fold revision`

Current audit classification: `EVIDENCE_ONLY` unless a concrete missing production gap is proven first.

Goal: mapping construction must be O(C + G), mapping-relevant state must own/cache it, all time-domain consumers should reuse the authoritative mapping, and identity/no-fold work should avoid unnecessary remap allocation where safe.

Known implementation evidence already observed:
- `buildDisplayTimeMapping()` consumes sorted collapsed ranges with a moving cursor rather than a per-cycle full range search.
- `DisplayTimeMappingCache` keys mapping-relevant timeline/fold/anchor state and tracks builds/hits/timing.
- Identity mapping can reuse canonical value arrays rather than remapping them.

Remaining acceptance/evidence:
- [ ] Demonstrate mapping construction is bounded-linear and no cycles × folds behavior remains.
- [ ] Unchanged mapping-relevant revision reuses the mapping across waveform batches.
- [ ] Unrelated Signal/UI edits produce 0 mapping rebuilds.
- [ ] Fold/timeline edits invalidate deterministically.
- [ ] Wave/Ruler/Grid/Annotation/Snap/Transaction/Export use the same authoritative mapping contract where applicable.
- [ ] Identity/no-fold avoids unnecessary value-remap work where semantically safe.
- [ ] Record 100k-cycle synthetic evidence including 0 folds and 1k folds, median/p95 and operation counters.
- [ ] Increasing folds does not restore cycles × folds scaling.
- [ ] Save/Open/Undo/Redo/fold semantics remain exact.
- [ ] Axis Break and label-anchor behavior remain correct.

Closure rule: do not close from a small unit test alone. Provide counter-based and production/browser-path scale evidence plus all-consumer reuse evidence.

---

## #228 — Reference Clock / Reference Edge

Title: `[V2][P1][PARITY] Reference Clock / Reference Edge must be editable and all GUI labels must derive from canonical timeline state`

Goal: one authoritative Timeline/Document workflow owns Reference Clock and Reference Edge; visible labels and dependent geometry derive from canonical timeline state, never a hard-coded `clk` string.

Acceptance:
- [ ] Create two distinct Clock Signals and select Clock B as reference.
- [ ] Header/status/properties show the selected Clock B rather than hard-coded `clk`.
- [ ] Rising <-> Falling switch follows the documented reference-dependent behavior.
- [ ] Save/Open retains exact reference stable ID and edge.
- [ ] Rename updates the visible reference label without changing reference stable ID.
- [ ] Reorder/move between Groups preserves the reference.
- [ ] Delete/convert current reference follows a documented deterministic policy with no dangling ID.
- [ ] Undo/Redo restores exact reference and edge.
- [ ] Axis Break, Zoom, horizontal scroll and Split/Transaction views remain aligned.
- [ ] SVG/PNG/PDF export uses the same reference/time mapping where applicable.
- [ ] No production semantic truth depends on a literal `clk` name.

Closure rule: test at least two differently named clocks and Open a document whose reference is not the first/default Clock.

---

## #246 — Clockless timing documents

Title: `[V2][P0][TIMELINE] Support clockless timing documents and allow removing the reference clock`

Product decision: `timeline.referenceClock` is optional. Support explicit Reference-clock mode and Clockless time-axis mode without persisting or displaying a fake Clock Signal.

Acceptance:
- [ ] Create/open a document with zero Clock Signals and no reference; editor renders correctly.
- [ ] Ruler/Grid/range selection remain aligned through zoom and horizontal scroll.
- [ ] Add a Clock and choose it as Reference; axis switches deterministically.
- [ ] Delete the current Reference Clock; document remains usable in clockless mode.
- [ ] Undo restores exact Clock + reference; Redo removes it again.
- [ ] Delete the only Clock in a power-sequencing fixture; Save/Open/Export remain valid.
- [ ] Time-based Annotation/range/snap/transactions continue to resolve without a Clock.
- [ ] No hard-coded `clk` or fake Clock identity appears.
- [ ] Delete/reference transition is one atomic canonical/history operation.
- [ ] Golden/reference/threshold/mask are not rewritten to accept the change.

Closure rule: prove the whole editor remains usable and geometrically coherent with zero Clock Signals; merely enabling Delete is insufficient.

---

## #266 — Per-Group / per-Signal vertical spacing

Title: `[V2][P0][PARITY] Add per-Group / per-Signal vertical spacing controls — before/after layout editing and persistence`

Goal: complete the approved vertical-layout model with Group/Signal `spacingBefore` / `spacingAfter`, derived through RowLayout rather than persisted absolute Y.

Acceptance:
- [ ] Group `spacingBefore` editable from production GUI.
- [ ] Group `spacingAfter` editable from production GUI.
- [ ] Signal `spacingBefore` editable from production GUI.
- [ ] Signal `spacingAfter` editable from production GUI.
- [ ] No absolute signal Y is persisted as a shortcut.
- [ ] Invalid values reject atomically with Canonical/History/Dirty unchanged.
- [ ] One completed Apply = one semantic commit/history entry.
- [ ] Left/center/waveform row alignment remains exact after spacing edits.
- [ ] Group Bands and overlays follow derived row geometry.
- [ ] Spacing-only edits do not regenerate unrelated WaveDrom semantics.
- [ ] Undo/Redo exact.
- [ ] Save/Open exact.
- [ ] SVG/PNG/PDF reflect the same layout.
- [ ] Real-browser E2E covers Group and Signal before/after spacing independently and with global spacing.
- [ ] Golden Sample 12 covers per-object spacing.
- [ ] Parity Matrix records production/E2E/Save-Open/Export evidence.

---

## #310 — Mechanical visual diagnostics / AI-review artifacts

Title: `[V2][TEST][VISUAL] Mechanical visual diagnostics and AI-review artifacts`

Goal: reusable machine-readable visual diagnostics should detect objective layout failures before AI/image review, and produce review bundles without altering immutable Golden/reference assets.

Acceptance:
- [ ] Reusable diagnostic helpers exist outside one scenario-specific test.
- [ ] Findings include severity/category/target/evidence.
- [ ] Text clipping, overlap, duplicate label and icon alignment have positive + negative detector tests.
- [ ] Scenario results can be consumed by Ribbon, Sample and Interaction visual suites.
- [ ] AI-review bundle manifest is generated for representative scenarios.
- [ ] No immutable Golden/reference/threshold/mask weakening.
- [ ] Adding a diagnostic/scenario does not require rewriting the whole harness.

---

## #307 — Ribbon/layout/typography screenshot matrix

Title: `[V2][TEST][VISUAL] Ribbon / layout / typography screenshot matrix`

Goal: deterministic production-browser visual scenarios for every supported Ribbon tab, desktop/compressed layouts, round-trip/repeated switching, plus mechanical layout/typography/icon diagnostics.

Acceptance:
- [ ] Every supported Ribbon tab has a deterministic screenshot scenario.
- [ ] Desktop and compressed-view checks exist.
- [ ] Layout/typography/icon diagnostics are emitted as JSON.
- [ ] A controlled test proves clipping/baseline/duplicate-label defects are detectable.
- [ ] Tab switching preserves Canonical/History/Dirty invariants.
- [ ] No Golden/reference/threshold/mask modification is required.
- [ ] Scenario artifacts are suitable for direct Codex/AI review.

Home remains frozen unless an explicit Home issue authorizes a change.

---

## #308 — Golden Sample production-browser visual matrix

Title: `[V2][TEST][VISUAL] Golden Sample visual matrix and production sample switching`

Goal: load immutable Golden Samples through the production file-input path, verify deterministic visual/sample switching behavior, stale-state isolation, and representative mechanical visual diagnostics.

Acceptance:
- [ ] Production file input loads the representative sample set and captures deterministic screenshots.
- [ ] All 20 immutable samples run through a browser smoke matrix.
- [ ] At least one no-reload A -> B sample switch checks stale visual/data leakage.
- [ ] Representative sample artifacts include mechanical diagnostics.
- [ ] Save/Open of a loaded sample remains visually/semantically coherent.
- [ ] Sample/reference assets are unchanged.
- [ ] A single sample can be selected by filter for focused debugging.

---

## #234 — Golden Samples must fail on real regressions

Title: `[V2][P0][TEST] 20 Golden Samples must fail on semantic, visual, or export regressions`

Goal: Golden browser coverage must assert real semantics/visual/export output; missing required features may only FAIL or be explicitly DEFER/SKIP with approved owner/reason, never evidence-only PASS.

Acceptance:
- [ ] Assert expected cycle count for each sample that declares it.
- [ ] Assert expected Signal count for each sample that declares it.
- [ ] Assert expected Transaction count for each sample that declares it.
- [ ] `coverage[]` maps to concrete canonical/UI/export checks rather than metadata only.
- [ ] Visual samples use immutable reference comparison or an explicitly linked visual gate.
- [ ] Missing required SVG export = FAIL unless explicitly deferred in parity inventory with owner/reason.
- [ ] Successful SVG export checks required semantic objects/content, not just document title.
- [ ] Feature samples cover declared annotations, Group Band/Spacer, clock/edge counter, header/footer/legend, transaction links and folds.
- [ ] Deliberately removing one Golden feature makes the harness fail.
- [ ] Deliberately failing export makes the harness fail.
- [ ] Golden/reference inputs are never rewritten to match current DUT output.
- [ ] Produce a feature -> sample -> Unit/E2E/Visual/Export coverage report usable for parity closure.

---

## Maintenance

Refresh this snapshot when:
- a listed GitHub Issue body/Acceptance Criteria changes materially;
- an Issue is closed and removed from the safe queue;
- a new Issue enters the safe-first executable block;
- Codex repeatedly cannot fetch the next Issue body.

Do not treat this file as a permanent replacement for GitHub Issues. It is a controlled fallback so external retrieval failures do not stall safe, contract-driven work.