# Semiconductor Timing Chart Editor V2 — Issue Acceptance Snapshot (Continuation)

Captured by ChatGPT for `codex-control` on 2026-09-03 03:05 JST.

Purpose: continuation of `.codex/ISSUE_ACCEPTANCE_SNAPSHOT.md` for executable Issues after #234 when live GitHub Issue retrieval fails in the Codex environment.

Authority:
1. Current GitHub Issue body wins whenever live retrieval succeeds.
2. If live retrieval fails, use the matching section here as the fallback contract.
3. If neither live text nor snapshot exists, do not guess; mark only that Issue retrieval-blocked and continue.
4. Do not weaken Golden/reference/threshold/mask, real-browser assertions, or owner boundaries to satisfy a snapshot.

Scope: PRODUCT WORKFLOWS / PARITY — INDEPENDENT CANDIDATES and PERFORMANCE / CORRECTNESS ENGINE — INDEPENDENT CANDIDATES from `ISSUE_ORDER.txt`.

---

## #173 — Transaction + Export
Goal: Transaction View and Export share the same Canonical Document/Timeline and source-time -> display-X mapping as Cycle View. Export is Canonical + Projection/ExportScene based, never a viewport screenshot.
Acceptance:
- [ ] Transaction uses the same Canonical Timeline and shared time mapping.
- [ ] Create/move/resize/link are Semantic Commands; one completed operation = one History entry.
- [ ] Shared Snap Service and Timeline transforms are reused.
- [ ] Split View horizontal alignment/scroll/zoom are exact.
- [ ] Export includes offscreen/virtualized objects and approved wave/labels/annotations/transactions/ruler content.
- [ ] Editor chrome/selection handles are excluded.
- [ ] SVG -> PNG/PDF pipeline works deterministically.
- [ ] Save/Open/Undo/Redo exact; real-browser Transaction/Export E2E green.
Closure: do not create a second time axis, selection truth, fixed pixels-per-cycle mapping, or screenshot-authoritative export.

## #209 — Export completeness
Goal: close export parity across SVG/PNG/PDF, Clipboard SVG/PNG, Entire Document and approved selected scopes while preserving timing-document semantics.
Acceptance:
- [ ] Required formats produce valid output.
- [ ] Clipboard SVG/PNG works where permitted, otherwise deterministic failure/fallback.
- [ ] Selected Range clips/rebases according to approved semantic policy.
- [ ] Offscreen/unmounted rows export.
- [ ] No Ribbon/Inspector/selection/debug chrome.
- [ ] Same document/settings -> deterministic SVG geometry/structure.
- [ ] PNG/PDF derive from the same ExportScene.
- [ ] E2E fixtures include hierarchy, comments, edge counters, annotations, transactions, folds and document regions.
Closure: export source must remain Canonical + Projection/ExportScene, not current editor screenshot.

## #210 — Clock Editor / Edge Counter completeness
Goal: complete stable-ID Clock editing and Edge Counter behavior using actual rendered edge geometry.
Acceptance:
- [ ] Multiple Clocks maintain independent settings/counters.
- [ ] Delayed start/phase/gating labels match actual rendered edges.
- [ ] Zoom/scroll/timeline edits preserve semantic edge association.
- [ ] Invalid edits reject atomically.
- [ ] Clock conversion confirmation/cancel/undo exact.
- [ ] Save/Open exact.
- [ ] Real-browser E2E plus Geometry assertions.
Closure: no fixed-pitch edge derivation and no hard-coded clock-name special cases.

## #212 — Inspector / Bottom Editor completeness
Goal: one coherent stable-selection detail workflow; Inspector and Bottom Editor share SemanticCommand ownership.
Acceptance:
- [ ] Rapid Signal selection never shows stale prior details.
- [ ] Equivalent Inspector/Bottom edits produce same canonical result/history.
- [ ] Event Table lists all canonical change points and supports add/edit/delete.
- [ ] Pin and Follow Selection ON/OFF are visible and deterministic.
- [ ] Styling edits do not rebuild unrelated WaveDrom traces.
- [ ] Invalid drafts reject atomically.
- [ ] Undo/Redo exact with coherent selection/detail projection.
- [ ] Real-browser E2E.
Closure: do not create separate Inspector and Bottom mutation implementations.

## #202 — Bookmark / Time Group / Axis Break
Goal: production CRUD/jump/reveal/fold workflows with one shared piecewise source-time -> display-X mapping.
Acceptance:
- [ ] Bookmark create/edit/delete and jump.
- [ ] Time Group create/edit/fold/unfold.
- [ ] Multiple Axis Breaks show paired marks and correct ruler labels.
- [ ] All time-domain overlays/surfaces use the same mapping.
- [ ] Timeline edits ripple semantic anchors atomically.
- [ ] Undo/Redo exact; Save/Open exact.
- [ ] Export Respect Folds / Expand All deterministic.
- [ ] Real Playwright E2E across zoom/scroll/fold/reveal.
Closure: no per-Signal manual skip owner or independent fixed-pitch mapping.

## #201 — Hardware hierarchy / Full Path / batch registration
Goal: preserve structured source hierarchy separately from display name and provide hierarchy navigation plus atomic batch Signal registration.
Acceptance:
- [ ] Existing hierarchy data round-trips without flattening into display name.
- [ ] Signal-only / Relative Path / Full Path / Split-column modes use the same stable Signal ID.
- [ ] Scope navigation and Reveal in Hierarchy work in browser.
- [ ] Group View / Hierarchy View do not create parallel canonical ownership.
- [ ] Batch preview reports valid/duplicate/invalid rows before commit.
- [ ] Cancel changes Canonical/History/Dirty by 0.
- [ ] Apply creates accepted rows atomically; one Undo removes the batch.
- [ ] Group move preserves `source.instancePath` and Role.
- [ ] Save/Open/export preserve hierarchy presentation.
Closure: do not encode hardware hierarchy into canonical Signal display-name strings.

## #206 — Editable Legend and Header/Footer
Goal: explicit specification-document presentation objects independent from waveform geometry.
Acceptance:
- [ ] Legend derives used roles deterministically and supports drag/nudge/Inspector editing via one owner.
- [ ] Header/Footer long text wraps without changing waveform geometry.
- [ ] Document layout persists according to approved policy.
- [ ] Export includes Legend/Header/Footer and excludes editor chrome.
- [ ] Same canonical document/settings -> deterministic export geometry.
- [ ] Real-browser and export tests.
Closure: static legend or generic metadata JSON alone is not completion; do not expand WaveDrom geometry to implement document regions.

## #207 — Advanced JSON editor
Goal: read-only default plus explicit validated Advanced editing with draft/live separation and atomic apply.
Acceptance:
- [ ] Default mode cannot mutate canonical document.
- [ ] Advanced mode is explicit/visually clear.
- [ ] Format/Validate/Copy work for supported scopes.
- [ ] Invalid syntax/semantics show useful path/location.
- [ ] Invalid Apply leaves Canonical/History/Dirty unchanged.
- [ ] Valid Apply is one atomic semantic operation with defined History behavior.
- [ ] Selection/draft lifecycle deterministic.
- [ ] Save/Open after valid JSON edit exact.
- [ ] Real-browser E2E.
Closure: no raw live-store injection or persistence shortcut from `JSON.stringify(liveStore)`.

## #224 — Role / Signal label column layout + Auto Fit
Goal: expose canonical Role width, Signal-name width, alignment, overflow and Auto Fit while separating persisted column presentation from transient pane splitters.
Acceptance:
- [ ] Role width / Signal-name width / alignment / overflow are editable.
- [ ] Auto Fit computes from visible typographic content and commits canonical width once, never DOM coordinates.
- [ ] Reset to documented defaults works.
- [ ] View-only outer pane resize remains History/Dirty-free.
- [ ] Headings/Role badges/Signal labels/ruler origin/waveform remain exactly aligned.
- [ ] Label-layout changes do not rebuild unrelated WaveDrom traces.
- [ ] E2E covers long names, comment rows, all modes, Auto Fit, resize, scroll, zoom, Save/Open, Undo/Redo.
Closure: transient pane geometry and persisted canonical label-column settings must not independently fight over the same geometry.

## #226 — Clock -> value-signal conversion
Goal: explicit confirmation-based Clock -> Binary/Bus/State conversion with one atomic Semantic Command and exact Undo.
Acceptance:
- [ ] Each supported target works through explicit Convert Type action.
- [ ] Cancel leaves Canonical/History/Dirty unchanged.
- [ ] Apply preserves stable ID, Group/order, Role and source hierarchy; discards Clock-only state.
- [ ] Target waveform uses the same authoritative defaults as normal Add.
- [ ] One Apply = one History entry.
- [ ] Undo restores exact generator/enable/gating/Edge Counter state; Redo exact.
- [ ] Save/Open exact.
Closure: do not simply enable the Clock type selector or generalize this destructive policy to all ValueSignal conversions.

## #230 — Group Band / Legend presentation semantics
Goal: enabled canonical Group/Legend presentation properties must have observable Editor behavior, transient preview semantics, persistence and matching export.
Acceptance — Group:
- [ ] Background ON/OFF, color, opacity and border visibly preview and survive Apply/Undo/Redo/Save/Open.
- [ ] `extend=label|waveform|both` produces distinct specified results.
- [ ] `showHeader=false` follows approved policy without unexplained 32px blank space.
- [ ] Preview changes Canonical/History/Dirty by 0; Apply exactly one History entry; Cancel exact original.
- [ ] Export matches Editor Group Band semantics.
Acceptance — Legend:
- [ ] `usedRolesOnly=true` hides unused roles under the approved rule even with explicit items.
- [ ] Custom label/visibility/order remains deterministic.
- [ ] Editor and SVG/PNG/PDF effective Legend content match.
Closure: no enabled dead/no-op presentation controls.

## #244 — Event Table duplicate actions / Preview
Goal: one coherent Event Table command surface; Preview must be real transient draft preview or be removed/renamed.
Acceptance:
- [ ] No duplicate command buttons without explicit distinct purpose.
- [ ] One normal Import, Export and Duplicate route.
- [ ] Preview either shows observable pending data/waveform or is removed/renamed.
- [ ] Preview-only Canonical/History/Dirty delta = 0.
- [ ] Apply of previewed edit = one semantic operation/history entry.
- [ ] Cancel restores exact original draft/view state.
- [ ] Invalid Import shows deterministic feedback and leaves Canonical/History/Dirty unchanged.
- [ ] Valid Import uses normal validation/renderer-compatibility rules.
- [ ] Browser E2E covers Add/Edit/Preview/Apply/Cancel/Import invalid/valid.
Closure: do not change Golden/reference assets to hide duplicate controls.

## #248 — Compact Signals/Groups footer
Goal: remove the oversized empty lower-left tail; extend the Tree to a compact status footer without duplicating primary commands.
Acceptance:
- [ ] With Bottom Editor visible, Tree extends to a compact footer; no unexplained blank tail.
- [ ] With Bottom hidden, Tree uses reclaimed height.
- [ ] Signal count and useful current Scope appear compactly.
- [ ] Duplicate `Hierarchy/+Group/+Signal` tail actions are removed/moved to the approved single command owner.
- [ ] Standard Add Signal/Add Group remain discoverable.
- [ ] Empty Groups live in normal Tree, not a special tail list.
- [ ] Bottom min/max and Left pane narrow/wide remain stable without overlap.
- [ ] Real-browser visual/E2E at 1672x941 and laptop-class viewport.
Closure: do not fill the blank area with invented functionality merely to preserve old geometry.

## #252 — Check / Review workflow
Goal: expand Review beyond a Problems shortcut while reusing the shared diagnostic source.
Acceptance:
- [ ] Review provides more than one Problems shortcut/count.
- [ ] User can filter severity and navigate Previous/Next.
- [ ] Selecting a problem reveals its target and relevant cycle/range where available.
- [ ] Ribbon count and Bottom Problems remain consistent after edits/re-checks.
- [ ] View-only review operations preserve Canonical/History/Dirty.
- [ ] E2E verifies cross-surface diagnostic consistency.
Closure: do not create a second Ribbon-owned diagnostic state source.

## #254 — Value label layout
Goal: fit long Bus/State/symbolic labels within actual WaveDrom segment geometry without changing timing semantics.
Acceptance:
- [ ] WaveDrom transition/cycle geometry never moves because of label length.
- [ ] Layout uses actual segment `xStart/xEnd`; multi-cycle holds use full segment width.
- [ ] Auto policy: normal size -> approved minimum shrink -> ellipsis/clip.
- [ ] Adjacent labels do not overlap/cross transitions in normal Auto mode.
- [ ] Full semantic value remains available in Inspector/Bottom and hover/focus.
- [ ] Optional `displayLabel` is presentation-only and round-trips.
- [ ] Document default + Signal override policy defined.
- [ ] Save/Open and Undo/Redo exact for presentation fields.
- [ ] SVG/PNG/PDF use the same fitting policy.
- [ ] E2E covers 1-cycle long 32-bit, 3-cycle hold, adjacent values, symbolic text, zoom and export.
Closure: never change timing geometry or sample semantic values merely to make text fit.

## #261 — Shared SVG icon buttons
Goal: eliminate remaining icon-only Unicode/text glyph actions where an approved SVG icon exists and use one accessible shared icon-button contract.
Acceptance:
- [ ] DocumentProperties Close and Legend reorder use SVG icon buttons, not literal `×/↑/↓`.
- [ ] No production icon-only button uses Unicode/text glyphs where approved SVG exists.
- [ ] All icon-only buttons have accessible names.
- [ ] Equivalent surfaces share icon/hit-target sizing and keyboard/focus/disabled behavior.
- [ ] Representative dialog/tree/bottom acceptance at 1672x941 and 1280x720.
- [ ] Semantic command/History/Canonical ownership unchanged.
- [ ] Golden/reference is not rewritten to accept platform-dependent glyphs.
Closure: ordinary text/mathematical content is not part of this replacement rule.

---

# Performance / Correctness Engine

## #218 — Local Geometry performance
Goal: remove O(E²) geometry insertion, repeated transition path work and per-Signal write/read layout thrash while keeping WaveDrom/default skin normative.
Acceptance:
- [ ] Geometry insertion O(E), not O(E²); no full-list uniqueness scan in hot path.
- [ ] 100/500/1000/long-cycle median/p95 evidence; doubling cycles does not show duplicate-check quadratic growth.
- [ ] Previous semantic token is carried forward without backward slice/reverse scans.
- [ ] Transition brick/path lookup/parsing is cached within safe scope.
- [ ] Render scheduling reduces per-Signal write/read thrash with bounded `getScreenCTM()`/layout reads.
- [ ] Actual WaveDrom geometry remains source of truth.
- [ ] Conformance and Annotation/Snap/Edge Counter remain exact.
- [ ] #217 Open performance re-measured before/after.
Closure: requires real-browser trace/counters and Open evidence, not unit/microbench alone.

## #217 — Open first-correct-paint performance
Goal: reduce File Open -> first correct visible paint/editor idle through real browser scheduling and removal of duplicate/main-thread/DOM work.
Acceptance:
- [ ] Real-browser Open measured for `perf_50x100`, `perf_100x500` and long-cycle fixture with median/p95 first-correct-paint.
- [ ] No duplicate whole-document validation/deep clone solely in normal Open handoff.
- [ ] Browser can paint before all WaveDrom work finishes; bounded render batches yield to browser.
- [ ] Reference clock/ruler usable early without fixed-pitch/custom geometry.
- [ ] MiniMap lookup O(N), not O(N²), and viewport updates avoid full overview rebuild.
- [ ] DisplayTimeMapping once per relevant revision; identity mapping avoids unnecessary remap.
- [ ] Ruler/Grid long-timeline DOM growth bounded/reduced while using real geometry.
- [ ] Geometry transition scans/path parsing and gated-clock enable scans are linearized.
- [ ] A->B->A Open has no stale cache/geometry/listener state and offscreen rendering remains bounded.
- [ ] WaveDrom/default skin remains normative; functional/Save/Open/Golden/conformance green.
- [ ] CI artifacts expose severe firstCorrectPaint regression.
Closure: measure visible browser completion, not just callback duration.

## #257 — Document resource budgets / Open-Save full-tree work
Goal: define explicit resource limits for large/adversarial documents and remove redundant full-tree work without weakening semantic validation.
Acceptance:
- [ ] Explicit documented file/count/cycle/value-change or equivalent resource budgets are tested.
- [ ] Arbitrary unbounded input is not synchronously cloned/validated on UI thread without policy.
- [ ] Save does not redundantly validate the exact same immutable revision.
- [ ] Failed Open is atomic and preserves current document/unsaved state with clear diagnostic.
- [ ] Large valid fixture has before/after Open/Save profile evidence.
- [ ] No semantic validation weakening.
Closure: do not silently truncate documents.

## #256 — Diagnostics transport performance
Goal: remove full per-signal diagnostics JSON serialization/DOM `data-*` churn from production interaction paths while preserving detailed test/dev observability.
Acceptance:
- [ ] 1k/5k/10k signal interactions do not serialize full per-signal maps into DOM attributes.
- [ ] Production `data-*` payload size is bounded independently of document signal count.
- [ ] Detailed diagnostics remain available through explicit test/dev interface.
- [ ] Browser before/after profile shows reduced script/allocation/DOM-attribute work for affected interactions.
- [ ] Existing performance counter assertions remain green.
Closure: do not remove useful diagnostics; separate production diagnostics ownership from test transport.

## #276 — Remove duplicate Save validation
Goal: one explicit validation trust boundary for Save; normal Save must not validate the same canonical snapshot twice.
Acceptance:
- [ ] Normal Save no longer performs two full canonical validation passes.
- [ ] Validation ownership/trust boundary is explicit in API/type/docs.
- [ ] Public serializer still rejects invalid arbitrary input.
- [ ] Validated DocumentSession snapshot cannot silently become invalid before Save.
- [ ] Save output remains deterministic/compatible unless an explicit formatting change is intended.
- [ ] Save/Open round-trip green; validator invocation mechanically asserted.
- [ ] Large-document benchmark shows duplicate validation removed.
- [ ] No duplicate deep clone/stringify comparison added as replacement work.
Closure: structural removal of duplicate validation is required; small-fixture speed alone is insufficient.

## #282 — Stable validation rule layers
Goal: mechanically distinguish Schema/structural validation, Canonical invariants and Command policy, with stable typed rule/problem contracts.
Acceptance:
- [ ] Architecture docs define the three layers.
- [ ] Existing problem codes inventoried with owner/category.
- [ ] Problem codes are typed/enumerated/mechanically constrained.
- [ ] Same canonical fault does not use unrelated planner/validator codes without justification.
- [ ] Command policy is not hidden inside schema validation.
- [ ] Validator remains authoritative for canonical validity.
- [ ] Problems/Review consume rule metadata without parsing message text.
- [ ] Tests assert code/path/entityId for representative faults.
- [ ] Rule-code changes require explicit compatibility decision.
- [ ] Final/allErrors validation is not weakened.
Closure: file/function renaming alone is not completion; rule ownership must be mechanically non-drifting.

## #283 — Versioned migration chain
Goal: replace one-off version switches with a sequential migration registry and explicit loss/compatibility policy.
Acceptance:
- [ ] Migration selection is registry/chain based.
- [ ] V1 -> current remains deterministic/backward compatible.
- [ ] Synthetic V1 -> V2 -> V3 proves chain order.
- [ ] Every lossy step emits structured warning surfaced by Open.
- [ ] No migration silently drops unknown/unsupported semantic fields.
- [ ] Unsupported future versions preserve current open document exactly.
- [ ] Save emits only current approved formatVersion.
- [ ] Migration fixtures are immutable.
- [ ] Round-trip tests distinguish migration from current-version Save/Open.
- [ ] Data-format docs define lossless/lossy/unsupported behavior.
Closure: requires a real version-chain mechanism and multi-step regression fixture, not only a `migrateV2()` placeholder.

## #284 — User-text SVG/WaveDrom/export security
Goal: audit all canonical user-string trust boundaries and make DOM/SVG/export text handling safe by construction.
Acceptance:
- [ ] All user-string -> DOM/SVG/export paths inventoried.
- [ ] No raw user text becomes executable markup.
- [ ] `innerHTML`-style insertion eliminated or guarded by a reviewed narrow sanitizer.
- [ ] WaveDrom adapter has explicit trust/sanitization contract.
- [ ] Exported SVG contains no script/event-handler/javascript URL derived from canonical strings.
- [ ] Adversarial strings render as text, not execute.
- [ ] Valid engineering `< > & quotes Unicode` round-trip.
- [ ] CSP is defense-in-depth only.
- [ ] Editor-render and exported-SVG security tests exist.
- [ ] Golden/reference content is not changed to hide escaping defects.
Closure: React JSX escaping alone is insufficient; imperative WaveDrom/SVG/export paths must be audited.

## #285 — Deterministic JSON syntax diagnostics
Goal: browser-independent malformed-JSON diagnostic contract; native engine message is secondary, not normative.
Acceptance:
- [ ] Syntax diagnostic contract documented.
- [ ] Chromium/Firefox/WebKit covered where supported.
- [ ] Representative malformed inputs produce deterministic problem codes.
- [ ] Line/column is consistent or explicitly optional with deterministic fallback.
- [ ] Multiline, CRLF/LF and non-ASCII covered.
- [ ] Syntax failure never replaces current canonical document.
- [ ] Engine human-readable error message is not the sole location source.
- [ ] Advanced JSON UI can navigate/highlight reported location when available.
Closure: Chromium-only regex parsing is insufficient; supported browser matrix contract is required.

---

Maintenance: refresh this continuation when any listed Issue changes materially, closes, or leaves the executable queue.