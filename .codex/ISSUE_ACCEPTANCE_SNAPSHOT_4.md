# Semiconductor Timing Chart Editor V2 — Issue Acceptance Snapshot (Broad / Parity / Umbrella)

Captured by ChatGPT for `codex-control` on 2026-09-03 05:05 JST.

Purpose: fallback contract for the `BROADER PHASE / PARITY / UMBRELLA — LATER` block when the Codex environment cannot retrieve GitHub Issue bodies.

Authority rules:
1. Current GitHub Issue body/comments win whenever live retrieval succeeds.
2. If live retrieval fails with 404 / permission / connector / tooling error, use the matching section below.
3. These older Phase issues often mention `rewrite/v2`; current execution target remains `main`. Do **not** recreate the old branch/runtime strategy. Treat these sections as current-main closure/audit contracts: verify the merged owner architecture first, close when already satisfied, and implement only bounded residual gaps.
4. Do not reopen superseded MinimalCycleView decomposition work. Current owner refactor is already merged.
5. Do not weaken Golden/reference/threshold/mask, real-browser assertions, semantic ownership, or geometry ownership to satisfy an old Phase contract.
6. If an issue is umbrella/meta/evidence-only and no bounded production gap remains, record audit evidence and continue; do not block the overall Goal.
7. If a gesture-heavy requirement reproduces the quarantined shared browser-coordinate blocker, quarantine that issue rather than adding fixed-pitch, timeout, sampled-Ruler-DOM, or duplicate geometry workarounds.

---

## #161 — Architecture Lock
Goal: preserve one Canonical document, explicit Canonical/Transient/Derived ownership, shared Semantic Commands, WaveDrom adapter ownership, Semantic/Local/Screen geometry separation, stable IDs and enforceable dependency boundaries.
Acceptance:
- [ ] Current `main` has documented/mechanically enforced package/owner boundaries.
- [ ] Canonical / Transient / Derived owners are explicit and non-duplicated.
- [ ] Semantic Command + History + ChangeSet contracts exist.
- [ ] WaveDrom direct ownership is isolated to the adapter.
- [ ] Geometry layers and stable-ID policy are explicit.
- [ ] Forbidden dependency/import checks exist and are green.
- [ ] Typecheck/test/architecture gates are green without Golden rewrite.
Closure: audit current architecture; do not recreate the historical `rewrite/v2` workspace if the current `main` already supersedes it.

## #162 — Schema + Canonical Core
Goal: DOM/React/WaveDrom-independent canonical parse/normalize/migrate/validate/serialize/round-trip with stable IDs and exact row-membership/reference invariants.
Acceptance:
- [ ] Canonical core has no UI/DOM/WaveDrom dependency.
- [ ] Stable IDs survive rename/reorder/Save/Open; duplicate/copy creates fresh IDs.
- [ ] Every renderable row occurs exactly once; duplicate/orphan membership is rejected.
- [ ] Source cycle contract is 0-based; invalid bounds/references/non-finite values reject atomically.
- [ ] Whitelist serializer leaks no View/Derived/DOM state.
- [ ] Migration/future-version rejection is deterministic and atomic.
- [ ] Save/Open and Save/Open/Save are exact/deterministic.

## #163 — Semantic Command + History
Goal: all mutation entry points converge on one Semantic Command layer with atomic rejection, exact Undo/Redo, revision semantics and semantic ChangeSet invalidation.
Acceptance:
- [ ] GUI/keyboard/context/Inspector/Bottom/AI do not directly mutate Canonical.
- [ ] One completed logical action = one canonical commit/validation/history unit.
- [ ] Rejected/stale command leaves Canonical/History/Dirty/revision unchanged.
- [ ] Undo/Redo and redo invalidation are exact.
- [ ] Timeline transforms update all source-time anchored objects atomically.
- [ ] Delete/reference policy is shared across entry points.
- [ ] ChangeSet does not invalidate unrelated domains.

## #164 — WaveDrom Adapter
Goal: deterministic Canonical -> WaveJSON -> pinned WaveDrom `WaveArtifact` through one adapter with stable signal-ID ownership and conformance.
Acceptance:
- [ ] Production WaveDrom import/execute owner is the adapter only.
- [ ] One pinned runtime/version is authoritative.
- [ ] Canonical -> WaveJSON continuation/data/clock semantics are deterministic.
- [ ] Artifact/cache identity is based on stable Signal ID + semantic contract, never row/viewport index.
- [ ] Selection/reorder/view state does not invalidate semantic artifact cache.
- [ ] Local render failure is diagnostic and does not crash unrelated rows.
- [ ] Supported WaveDrom/default-skin conformance remains green.

## #165 — Geometry
Goal: Semantic / Local WaveDrom / Screen geometry are separate; semantic anchors resolve from actual rendered WaveDrom geometry, never fixed cycle pitch.
Acceptance:
- [ ] Semantic/Local/Screen geometry types/owners are distinct.
- [ ] Local geometry derives from the WaveArtifact/actual SVG.
- [ ] No `cycle * pixelsPerCycle` or Golden-specific pixel offset is an authoritative semantic path.
- [ ] Scroll/reorder changes Screen mapping but not LocalGeometry build for unchanged waveform semantics.
- [ ] Unsupported semantic points fail explicitly rather than silently approximating.
- [ ] Layout reads are batched and counters exist.

## #166 — RowLayout + Stable Waveform Surface
Goal: RowLayout is the sole vertical-position owner while expensive waveform artifacts retain stable identity through reorder/visibility/virtualization.
Acceptance:
- [ ] Canonical/Frozen/Timing row IDs/order use one projection/RowLayout owner.
- [ ] Reorder causes WaveDrom render delta 0 and LocalGeometry build delta 0.
- [ ] Stable waveform/SVG identity is unchanged for semantic-no-change reorder.
- [ ] Visibility is derived from approved state, not stale DOM state.
- [ ] Virtualization keeps stable identity and mounted rows scale with viewport/overscan.
- [ ] Ordinary row moves/visibility do not call a global render-everything path.

## #167 — Minimal Cycle View integration
Goal: current product browser path proves atomic Open, cross-surface row identity, scroll/zoom/selection view-state behavior and stale-state cleanup using the real owners.
Acceptance:
- [ ] Open is atomic and first correct paint never shows mixed old/new document state.
- [ ] Canonical/Frozen/Timing visible IDs agree.
- [ ] A->B->A Open leaves no stale row/cache/selection.
- [ ] Selection/scroll/zoom are Canonical/History neutral and do not semantically rerender WaveDrom.
- [ ] Frozen labels and timing rows remain aligned.
- [ ] Virtualization preserves stable IDs.
- [ ] Localized waveform failure does not crash the editor.
- [ ] Real-browser acceptance exists.

## #168 — Signal Editor
Goal: binary/bus/state/clock/event/pulse semantic editing uses canonical change points/generator settings and localized invalidation, never direct WaveDrom strings.
Acceptance:
- [ ] Normal editing uses Semantic Commands, not WaveDrom `wave` strings.
- [ ] Invalid edit rejects atomically; one completed edit = one History entry.
- [ ] One-Signal waveform edit rerenders/rebuilds geometry for the target only plus true dependents.
- [ ] Clock start/period/duty/phase/gating semantics are consistent.
- [ ] Undo/Redo and Save/Open exact.
- [ ] Real browser UI edit path is covered.

## #169 — Reorder / Visibility / D&D
Goal: one canonical row-order/visibility owner drives Tree/Frozen/Timing; drag preview is transient and drop commits exactly once without waveform rebuild.
Acceptance:
- [ ] D&D target resolves exact `targetGroupId + targetIndex`.
- [ ] Tree/Frozen/Timing row IDs/order remain identical.
- [ ] Reorder has WaveDrom render 0, LocalGeometry build 0 and stable SVG identity.
- [ ] Visibility does not rebuild unrelated wave/geometry.
- [ ] PointerMove/cancel mutates Canonical/History/Dirty by 0.
- [ ] One drop = one History entry; Undo/Redo exact.
- [ ] Real browser D&D coverage exists.

## #170 — Timeline Editing
Goal: insert/delete/duplicate/move range are atomic canonical source-time transforms over all anchored objects using `[start,end)` and authoritative geometry.
Acceptance:
- [ ] Source cycle is consistently 0-based and ranges are half-open.
- [ ] Pointer/insertion boundaries resolve from shared actual geometry, not fixed pitch or sampled Ruler labels.
- [ ] Signal points, clocks, annotations, bookmarks, TimeGroups, label anchors, transactions and constraints transform coherently.
- [ ] Presentation-only display labels are not incorrectly shifted.
- [ ] Delete policies are explicit by object kind.
- [ ] Drag preview is view-only; one completed timeline edit = one History entry.
- [ ] Undo/Redo, Save/Open and real-pointer browser tests are exact.

## #171 — Annotation + Snap
Goal: annotations are Canonical semantic anchors + visual offsets, and snapping resolves against actual shared geometry.
Acceptance:
- [ ] Text/Vertical Line/Range/Highlight/Measurement/Arrow/Dependency use semantic anchors.
- [ ] Snap uses actual WaveDrom/Geometry candidates; no fixed-pitch semantic fallback.
- [ ] Snap and Reset Offset are separate operations.
- [ ] Invalid/non-timing targets reject deterministically.
- [ ] Zoom/scroll/reorder/spacing/timeline edits preserve the same semantic target.
- [ ] Measurement values are derived; Dependency From/To are independent anchors.
- [ ] Annotation-only style/anchor edits rerender/rebuild no unrelated waveform geometry.
- [ ] Save/Open/Undo/Redo and real-pointer E2E are exact.

## #172 — Full GUI
Goal: Ribbon/Tree/Inspector/Bottom/Problems/Status are UI adapters over existing owners, with one keyboard registry and one gesture-arbitration owner.
Acceptance:
- [ ] Final desktop hierarchy is coherent and approved GUI workflows are discoverable.
- [ ] All mutation routes share Semantic Commands.
- [ ] Tree order comes from canonical projection only.
- [ ] Inspector and Bottom share the same editing owners and stable selection.
- [ ] Problems are derived/model-driven; JSON apply uses validated atomic canonical lifecycle.
- [ ] Keyboard is focus/IME aware and gesture arbitration is centralized.
- [ ] Cross-route mutations produce equivalent Canonical/Undo results.
- [ ] Selection/panel/view changes do not rerender waveform semantics or dirty the document.
- [ ] Real-browser/visual acceptance is green without Golden rewriting.

## #174 — Performance Closure
Goal: prove localized-update architecture with scale fixtures, real-browser metrics, counters, stable identity, virtualization and leak checks.
Acceptance:
- [ ] Scale fixtures exist through 50/100/500/1000 signals/cycles plus representative heavy mixes.
- [ ] Selection/reorder/one-signal-edit/annotation/scroll/zoom/drag-preview hard counter invariants pass.
- [ ] 1000-row mounted count scales with viewport, not total rows.
- [ ] Stable SVG identity survives semantic-no-change moves.
- [ ] Real browser median/p95/Long Task/layout evidence exists.
- [ ] Repeated Open/edit/Undo/Redo shows no unbounded listener/cache/DOM leak.
- [ ] PR and larger manual/nightly performance gates exist.
Closure: internal microbench/counter-only evidence is insufficient where browser evidence is required.

## #175 — Interaction Performance Closure
Goal: view-only React/UI operations trigger zero canonical validation/wave/geometry work, and product latency is measured inside the browser with incremental invalidation.
Acceptance:
- [ ] Selection/Ribbon/Zoom/Scroll/panel/tab view actions have validator/WaveDrom/LocalGeometry/History/Canonical delta 0.
- [ ] Browser-internal interaction median/p95/max/Long Tasks are measured and regression-gated.
- [ ] Rename does not rebuild Ruler/overlays; local wave edit touches target only; reference-clock edit alone invalidates ruler dependency.
- [ ] Large-row viewport lookup is bounded/near-logarithmic rather than full-list work per scroll where possible.
- [ ] Existing #174 structural gates remain green without removing GUI features.

## #176 — Professional CAD GUI Usability
Goal: feature-rich, high-density, resizable, discoverable desktop CAD/EDA UX without deleting features to gain space/performance.
Acceptance:
- [ ] Ribbon tabs use meaningful multi-group information architecture and frequent annotation/timeline commands are discoverable.
- [ ] Every visible enabled control has real behavior; otherwise it is disabled with reason.
- [ ] Left/Inspector/Bottom resize/collapse without Canonical/History/WaveDrom semantic mutation.
- [ ] Inspector = common/lightweight properties; Bottom = detailed temporal/data editing while sharing commands.
- [ ] Shared density/design tokens support Compact/Comfortable evolution.
- [ ] Cross-surface selection/state feedback is coherent.
- [ ] Rich GUI preserves #175 performance contracts.
- [ ] Real-browser usability/visual evidence exists; no Golden rewrite.

## #177 — V1 -> V2 Product Specification Parity Audit
Goal: every approved legacy requirement is classified and has a concrete V2 owner/evidence rather than silently disappearing during the architecture rewrite.
Acceptance:
- [ ] Human + machine-readable parity matrix exists.
- [ ] Every relevant legacy requirement is KEEP/DEFER/DROP (or current stricter equivalent) with explicit owner/rationale.
- [ ] DROP requires explicit product approval.
- [ ] High-risk domains are covered: hierarchy/full-path/batch registration, label columns/splitter, editable Legend, Bottom Pin/Follow, Advanced JSON, Header/Footer, Clipboard semantics, Comment alignment, Axis Break/folds, Ribbon naming/tooltips.
- [ ] 20 Golden Samples have a feature/evidence coverage matrix.
- [ ] Mechanical parity/orphan gate exists.
- [ ] Production + E2E + visual + Save/Open + Export evidence is used where required.
Constraint: parity means behavior/specification parity, never copying V1 runtime patches.

## #178 — Exhaustive V1 Contract Sweep
Goal: enumerate every legacy Issue/spec contract exactly once, distinguish feature identity from neighboring features, and create/identify missing V2 owners.
Acceptance:
- [ ] Repository-wide legacy Issue/spec source universe is enumerated, not inferred by issue-number continuity.
- [ ] Every contract is KEEP/MERGED/DEFER/DROP exactly once; MERGED retains important legacy acceptance, DROP requires explicit approval.
- [ ] Human and machine-readable inventories plus mechanical checker exist.
- [ ] Mandatory high-risk cases are explicitly handled, including direct timing-canvas interactions, real Grid/Snap/Ruler/MiniMap, Signal Split (#98/#200 distinct from Transaction Split), Inspector/Bottom completeness, Undo context, File UX, Review/Problems, AI proposal workflow, hierarchy, Legend/Header/Footer, Clock/Edge Counter, Export and datasheet annotations.
- [ ] A legacy feature cannot be satisfied by semantically different evidence merely because names are similar.
- [ ] V2 architecture invariants remain intact.

## #181 — Left Tree / role geometry / fixed MiniMap
Goal: match approved v8 Left Tree visibility/disclosure/role geometry and keep MiniMap fixed at Inspector bottom.
Acceptance:
- [ ] Group Chevron is tree disclosure only and view-only.
- [ ] Signal rows use `[Role][Name][Eye/Eye-off][More]`; visibility does not remove the Tree row or alter selection unexpectedly.
- [ ] Role widths: input/output 28px, wire 42px, comment 24px; Left/Center geometry alignment within ~1px.
- [ ] MiniMap Y remains stable across selection/long Inspector content and fixed bottom layout.
- [ ] Visibility uses existing owner; unrelated waveform/geometry rebuild 0.
- [ ] Real-browser v8 visual evidence exists without changing Golden to current DUT.

## #182 — Approved v8 Production GUI Closure
Goal: production `/` itself matches approved v8 Golden/geometry; `?visual-reference` may only stabilize deterministic state, not use a separate GUI design.
Acceptance:
- [ ] Normal production uses the approved composition and target pane geometry at the reference viewport.
- [ ] Ribbon has no horizontal scroll/clipping and approved grouping/layout.
- [ ] #181 Left Tree/role/visibility acceptance is green.
- [ ] Left/Center/Wave rows align ~1px; major regions align within approved tolerance.
- [ ] Visual acceptance actually asserts `geometryPass` and `visualDiff.pass`; diagnostic-only false-green is impossible.
- [ ] Current-HEAD artifacts are generated and immutable Golden/reference is not rewritten.
- [ ] Architecture/view-only invariants remain intact.

## #185 — Golden-image-driven Visual Acceptance
Goal: approved Golden is the immutable visual source of truth and Production Chromium is deterministically captured/compared by region, geometry and image diff.
Acceptance:
- [ ] Fixed Chromium 1672x941 DPR1 capture state is deterministic.
- [ ] reference/dut/diff/region-diff artifacts are generated.
- [ ] Major GUI regions plus waveform viewport/ruler/alignment are compared; GUI chrome is not masked.
- [ ] Geometry and image thresholds both fail CI when exceeded.
- [ ] Normal capture/test never auto-updates Golden.
- [ ] Closure evidence includes before/after/diff and regression tests.

## #186 — Golden GUI Harness Engineering
Goal: repository-owned visual harness makes Golden closure mechanical, scoped and resistant to acceptance/test cheating.
Acceptance:
- [ ] Golden hash/capture conditions/thresholds/assertions are integrity-locked.
- [ ] Deterministic capture, region crop, diff, overlay and machine-readable report exist.
- [ ] Narrow task packets/region ownership and file-scope guards exist where the harness uses workers.
- [ ] Threshold/Golden/assertion weakening and out-of-scope modifications are mechanically detected.
- [ ] Before/after region regression budgets prevent improving one region while damaging another.
- [ ] Harness commands fail non-zero on real acceptance failure.
- [ ] End-to-end Golden -> task/correction -> recapture -> verifier -> PASS/FAIL loop is demonstrated.
Note: current control policy is single-thread sequential; do not resurrect historical parallel-worker orchestration merely because the old Issue describes it. Preserve the useful harness/guardrail contract only.

## #200 — Signal Split View
Goal: Upper/Lower/Both Cycle panes with one canonical Signal identity and shared horizontal time domain; distinct from #173 Transaction Split.
Acceptance:
- [ ] Real GUI Upper/Lower/Both assignment works.
- [ ] Upper/Lower have independent vertical scroll but shared horizontal scroll/Zoom/playhead/range/Grid/Ruler/Snap/reference clock.
- [ ] `Both` uses one canonical Signal identity and does not duplicate semantic WaveJSON truth.
- [ ] Splitter resize is view-only.
- [ ] Save/Open presentation policy is explicit.
- [ ] Default full-document export outputs each canonical Signal once.
- [ ] Real-browser and performance evidence exists.

## #204 — AI proposal workflow
Goal: provider-neutral Scope -> Proposal -> Preview -> Validate -> Apply/Cancel pipeline with revision conflict control and SemanticCommand-only mutation.
Acceptance:
- [ ] Proposal carries stable IDs/scope/document revision.
- [ ] Preview is transient and Validate is deterministic/local.
- [ ] Cancel changes Canonical/History/Dirty by 0.
- [ ] Apply is atomic through Semantic Commands and exact Undo/Redo.
- [ ] Stale revision conflicts reject or use an explicitly approved deterministic rebase policy.
- [ ] Deterministic mock provider supports real-browser CI without network dependency.

## #205 — Datasheet-grade timing annotations
Goal: complete advanced measurement/threshold/ratio/ghost-timing region semantics beyond basic annotation primitives.
Acceptance:
- [ ] Datasheet dimension lines support independent markers/extensions/arrow layout/label offset and lane stacking.
- [ ] Transition threshold/ratio anchors are distinct and resolve 30/70, 10/90, 20/80, 50%, Custom from actual geometry with correct rising/falling order.
- [ ] Timing Region/Ghost Trace uses semantic START/STOP/repeated-START and stable row spans without duplicating canonical Signal identity or creating a local competing time mapper.
- [ ] Real pointer create/edit, zoom/scroll/reorder/timeline tracking, Undo/Redo, Save/Open and deterministic export pass.
- [ ] Annotation-only edits do not rerender unrelated waveform traces.

## #250 — AI semantic operation gateway
Goal: expand safe AI intents beyond local rename/show/hide while retaining typed SemanticCommand + Preview + revision-safe Apply.
Acceptance:
- [ ] At least one end-to-end operation exists for each supported domain: Signal, Group, Timeline, Bookmark/TimeGroup, Annotation, Transaction and view/navigation as applicable.
- [ ] Preview names concrete entities/changes and mutates nothing.
- [ ] Unsupported/ambiguous requests are clear and non-mutating.
- [ ] Stale preview rejects.
- [ ] Apply uses normal validation/History and Save/Open behavior, never arbitrary JSON-path mutation.
- [ ] AI and GUI share the same semantic owners.

## #262 — Professional CAD/EDA GUI UX closure gate
Goal: final GUI quality is accepted across Visual, Geometry, Interaction, Discoverability, Keyboard/Focus, State Feedback, Error Recovery and Performance — not screenshots alone.
Acceptance:
- [ ] Representative real-browser workflows are reviewed across all eight dimensions.
- [ ] 1672x941 / 1366x768 / 1280x720 workflows are usable.
- [ ] No visible enabled silent no-op controls.
- [ ] Shared tokens/primitives govern common control geometry/states.
- [ ] Inspector vs Bottom roles are explicit and compact property density is usable.
- [ ] Frequent workflows are discoverable from GUI.
- [ ] Focus/dialog/menu/tree keyboard lifecycle is coherent.
- [ ] Selection/time/range/Zoom/Snap/Dirty/mode feedback is truthful.
- [ ] Failed operations preserve canonical atomicity and offer recovery.
- [ ] Selection/resize/scroll/zoom remain responsive; no feature removal to make UX pass.

## #277 — Move architecture probes out of production entrypoint
Goal: preserve browser probe value while removing ArchitectureProbe/StableSurfaceProbe implementation and test-only query routing from normal production startup.
Acceptance:
- [ ] Normal `main.tsx` primarily boots the editor and does not contain probe implementation bodies/test-only branch logic.
- [ ] Geometry/stable probes have explicit test/dev entries and still exercise real production packages.
- [ ] No duplicate renderer/command implementation is introduced.
- [ ] Normal production startup/bundle does not eagerly load probe-only code.
- [ ] Probe browser tests and production build remain green.

## #286 — Opaque stable IDs / separate provenance
Goal: stable IDs are opaque identity only; copy/import/AI provenance, when needed, is explicit metadata rather than parsed from ID text.
Acceptance:
- [ ] Production semantics never parse ID spelling such as `.copy.` to infer type/origin/ancestry.
- [ ] Copy/Duplicate still creates unique IDs and remaps internal references correctly.
- [ ] Cross-document provenance can be represented separately without changing existing ID compatibility.
- [ ] Existing persisted IDs round-trip unchanged; no cosmetic mass migration.
- [ ] Tests assert identity/reference semantics rather than human-readable ID formatting.

## #293 — GUI Stability / non-Home design-system migration
Goal: keep Home as a frozen protected baseline while non-Home GUI adopts constrained Design Tokens + Visual Primitives + Layout Contracts + component/region acceptance.
Acceptance:
- [ ] Home DOM/CSS/visual is mechanically protected unless explicitly authorized.
- [ ] Non-Home shared tokens/primitives own internal geometry; tab CSS does not override primitive internals ad hoc.
- [ ] View -> Insert -> Timeline -> Annotation migration demonstrates the pattern before broader spread.
- [ ] Primitive/component/region geometry + visual tests can localize regressions.
- [ ] Shared primitive changes enumerate/test affected regions.
- [ ] Semantic command/model ownership is unchanged by visual migration.
Closure: do not close for adding a token file/button alone; the constrained architecture and protection gates must be operational.

## #306 — AI-assisted Visual Scenario Acceptance Harness
Goal: reusable production-browser visual scenarios combine deterministic before/after screenshots, DOM/geometry diagnostics and supplemental AI review without replacing functional tests or weakening Golden.
Acceptance:
- [ ] Ribbon/layout/typography, Golden Sample matrix, interaction before/after/undo, and mechanical-diagnostics workstreams are implemented or explicitly superseded by equivalent coverage.
- [ ] One documented command produces scenario evidence.
- [ ] Scenario IDs and expected-change/stable regions are machine-readable.
- [ ] Mechanical diagnostics accompany visual review where possible.
- [ ] Controlled broken fixtures prove overlap/clipping/alignment detection can fail.
- [ ] Generated artifacts remain separate from immutable Golden/reference.
- [ ] New scenarios can be appended without rewriting the harness.

---

## Broad-block execution rule

When this snapshot is used because live GitHub retrieval is unavailable:

1. Audit current `main` first. Many #161–#178 Phase contracts may already be structurally satisfied by the merged V2 implementation.
2. If the issue is already satisfied, post concise audit evidence and close it rather than reimplementing old branch architecture.
3. If a bounded residual gap exists, implement only that gap using current owners.
4. If the issue is umbrella/meta/final-evidence only, do not manufacture production changes merely to create a commit.
5. Do not block the overall Goal merely because an individual broad Issue has no remaining safe bounded implementation.
6. Never use an adjacent feature as evidence for a semantically distinct contract (especially #200 Signal Split vs #173 Transaction Split).
