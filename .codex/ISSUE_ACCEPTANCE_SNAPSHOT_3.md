# Semiconductor Timing Chart Editor V2 — Issue Acceptance Snapshot (GUI / CI)

Captured by ChatGPT for `codex-control` on 2026-09-03 04:47 JST.

Purpose: fallback contract for the GUI / Interaction Consistency and CI / Closure Gate executable blocks when the Codex environment cannot retrieve GitHub Issue bodies.

Authority rules:
1. Current GitHub Issue body is authoritative whenever live retrieval succeeds.
2. If live retrieval fails with 404 / permission / connector / tooling error, use the matching section below.
3. If neither live Issue text nor a snapshot section exists, do not guess. Mark only that Issue retrieval-blocked and continue.
4. Do not weaken Golden/reference/threshold/mask, current product behavior, browser assertions, or merged owner boundaries to satisfy this snapshot.
5. If an Issue reproduces the already-quarantined shared real-browser coordinate/gesture blocker, record it and skip rather than inventing a local coordinate workaround.

Scope: every Issue currently listed in `GUI / INTERACTION CONSISTENCY — LATER` and `CI / CLOSURE GATES` in `.codex/ISSUE_ORDER.txt`.

---

## #195 — Selection capability matrix
Goal: derive command capability from the authoritative selection type/set so Ribbon, Context Menu and keyboard never expose enabled no-op or primary-only behavior accidentally.
Acceptance:
- [ ] Annotation exposes only commands its router supports.
- [ ] Transaction Rename/Delete capabilities agree across Ribbon/Context/keyboard.
- [ ] Multi-Signal Show/Hide policy is explicit and deterministic.
- [ ] Multi-Signal Move is either true batch behavior or disabled with reason.
- [ ] Enabled commands always produce an observable supported action; unsupported commands are disabled.
- [ ] Ribbon and Context Menu share the same capability result; keyboard is consistent where applicable.
- [ ] One semantic action = one History entry; capability calculation is view-only.
- [ ] Real-browser coverage includes Signal single/multi, Group, Annotation and Transaction.

## #197 — Viewport-safe Context Menu / Popover positioning
Goal: use one measured viewport-safe popup positioning policy rather than raw pointer coordinates.
Acceptance:
- [ ] Menus stay fully visible near all four viewport corners.
- [ ] Works at 1672x941, 1366x768 and 1280x720.
- [ ] Zoom/scroll do not corrupt viewport clamping.
- [ ] Signal and Annotation context menus share the same owner; other app popovers adopt it where applicable.
- [ ] Positioning is Canonical/History/Dirty/WaveDrom-semantic neutral.
- [ ] Browser E2E asserts popup bounding rect remains inside viewport.

## #199 — GUI context consistency
Goal: Add operations follow active editing context, visible mode labels remain truthful, Select All semantics match its label, and decorative browser window glyphs do not masquerade as controls.
Acceptance:
- [ ] Selected Group receives new rows; selected row inserts into that row's Group; no-selection fallback is deterministic.
- [ ] Left Tree and Ribbon Insert use the same insertion-target resolver.
- [ ] Insert is one Semantic Command/history entry and Undo/Redo restores exact order/membership.
- [ ] Cycle/Transaction/Split title/status labels agree with actual mode and are view-only.
- [ ] Select All label exactly describes its selected object set.
- [ ] Browser-only decorative window glyphs are removed/restyled or implemented by a real desktop host.

## #211 — Undo/Redo transient editing context
Goal: ordinary Undo/Redo restores canonical state while preserving or deterministically repairing compatible transient editing context; Open/New clears document-scoped stale context.
Acceptance:
- [ ] Rename/edit Undo keeps compatible stable selection.
- [ ] Timeline Undo preserves/restores semantic range/playhead where valid.
- [ ] Reorder/group move Undo preserves compatible selection/viewport.
- [ ] Delete Undo has defined non-stale selection repair.
- [ ] Zoom/panel dimensions do not jump because canonical history changed.
- [ ] Follow Selection/Pin stays deterministic.
- [ ] Open/New clears stale document-specific context.
- [ ] Multi-step real-browser Undo/Redo E2E.
Constraint: do not persist transient view state into Canonical solely for Undo.

## #214 — Single selection-decoration owner
Goal: every visible selected decoration derives from the authoritative stable-ID selection model, not route-specific DOM patches.
Acceptance:
- [ ] Clear Selection clears all Signal/Group/Annotation/Transaction decoration.
- [ ] Switching object type leaves no stale highlight.
- [ ] Multi-Signal decoration exactly matches selected IDs across applicable surfaces.
- [ ] Problems and hierarchy navigation produce the same decoration as direct selection.
- [ ] Open/New and Undo/Redo repair never leave decoration for nonexistent IDs.
- [ ] Selection decoration is Canonical/History/Dirty/WaveDrom-semantic neutral.
- [ ] Real-browser mixed-route test compares visible selected IDs to authoritative state.

## #216 — Dialog / popover keyboard lifecycle
Goal: shared app-owned modal/menu focus lifecycle: deterministic initial focus, focus containment, Esc cancel/close, outside-click policy, and focus return.
Acceptance:
- [ ] Save As and Export: initial focus, Tab loop, Esc, focus return.
- [ ] Bulk Registration, Hardware Hierarchy and Document Properties are keyboard-operable.
- [ ] Rename follows the shared focus-return policy.
- [ ] Context Menu / Tree Add / Tree More / Home More close on Esc.
- [ ] Appropriate outside click closes popovers without unintended canvas selection.
- [ ] Opening/closing is view-only unless Apply succeeds; IME/editable-input native behavior remains intact.
- [ ] Browser E2E verifies `document.activeElement` before/during/after.

## #233 — Result-aware UI post-command side effects
Goal: selection/focus/dialog-close/status/navigation side effects execute only after successful Semantic Command result.
Acceptance:
- [ ] Rejected Transaction create never selects a nonexistent ID.
- [ ] Rejected Annotation create/update leaves no ghost selection/context.
- [ ] Failure leaves Canonical/History/Dirty/document selection unchanged except explicit error state.
- [ ] Successful create selects/focuses only after commit success.
- [ ] Failed operation does not close editor/dialog as success.
- [ ] Ribbon/Inspector/Bottom/Context routes share result-aware policy.
- [ ] Stale rejection does not apply success side effects.
- [ ] Browser E2E proves UI surfaces never point at missing stable IDs after rejection.

## #235 — Current pane metrics for ruler/grid/zoom rebuilds
Goal: long-lived imperative render callbacks consume one current View Metrics owner instead of mount-time pane-width closures.
Acceptance:
- [ ] Resize Left -> semantic edit keeps ruler/grid/waveform origin aligned.
- [ ] Resize Inspector -> Open uses current pane size on first correct render.
- [ ] Resize Frozen/label -> Zoom/Fit remains aligned.
- [ ] Repeated resize/edit/zoom/Open sequences do not reuse initial dimensions.
- [ ] Ruler/Grid/waveform/annotation/transaction timing surfaces share current metrics where applicable.
- [ ] Splitter resize is view-only and does not rerender WaveDrom semantics.
- [ ] Browser assertions measure geometry after rebuild, not only immediate CSS width.

## #236 — Untrusted TCD / WaveDrom SVG executable-DOM safety
Goal: prove and document the trust boundary from external TCD user strings through WaveDrom/SVG DOM/export.
Acceptance:
- [ ] Adversarial TCD never executes scripts/event handlers.
- [ ] Generated SVG has no unexpected script/foreignObject/event-handler/unsafe URL attributes from user input.
- [ ] User strings render as text or are explicitly rejected, never interpreted as markup.
- [ ] SVG/PNG/PDF follows the same safety contract.
- [ ] Malicious input cannot escape editor root or mutate unrelated DOM.
- [ ] Tests use real Open -> production render path.
- [ ] Legitimate WaveDrom conformance remains unchanged unless a reviewed security fix requires a documented delta.
- [ ] Trust boundary / third-party assumptions are documented.

## #253 — No visible enabled no-op GUI controls
Goal: automated capability audit classifies every production interactive control as command-backed, view-only, intentionally disabled with reason, or a form field consumed by an Apply path.
Acceptance:
- [ ] Audit fails for an enabled production button with no behavior.
- [ ] Controlled no-op fixture equivalent is detected.
- [ ] Legitimate view-only controls pass with zero Canonical/History/Dirty mutation.
- [ ] Disabled controls require an explicit accessible/stable reason contract.
- [ ] Audit runs in normal CI/check gate.
- [ ] Click success alone is insufficient; observable behavior must be asserted.

## #260 — CSS/design-token and region ownership
Goal: complete migration from the large legacy cascade to real shared CAD UI tokens/primitives plus explicit region ownership without redesigning approved GUI behavior.
Acceptance:
- [ ] Shared tokens cover repeated typography/control/input/table/icon/hit-target/padding/spacing/focus/state/z-index/density decisions.
- [ ] Region CSS files own the majority of their production styles; responsive rules are not hidden in legacy.
- [ ] `legacy.css` is materially reduced with a retirement budget and CI guard against casual additions.
- [ ] Ribbon/Tree/Inspector/Bottom share equivalent density/focus primitives; Compact/Comfortable use shared tokens.
- [ ] Approved viewport/resized-pane/focus/state visual behavior stays green; Golden is not rewritten to conceal migration regressions.
- [ ] No Canonical/History/renderer behavior changes from this UI-system migration.

## #270 — Timeline Ribbon workflow
Goal: replace generic top-level Edit with a discoverable Timeline workflow using existing semantic owners.
Acceptance:
- [ ] Top-level Edit is replaced by Timeline.
- [ ] Generic editing remains in Home/context editors, not duplicated to fill Timeline.
- [ ] Timeline has Range, Insert/Delete, Range Edit, Bookmark, Fold/Break and display-time groups as applicable.
- [ ] Count is adjacent to N-cycle insertion; To is adjacent to Range Move.
- [ ] Bookmark Previous/Add/Next/List and Time Group Collapse/Expand/Axis Break/Expand All are discoverable and functional via existing owners.
- [ ] Source time and ruler-display labels remain separate; no per-Signal manual fold owner.
- [ ] Tab switching is view-only with zero semantic/render side effects.
- [ ] Enabled controls have observable behavior or disabled reason.
- [ ] 1672x941 and 1280x720 acceptance passes.
Closure: a label rename alone is insufficient; actual production grouping/ownership/behavior must match.

## #287 — Shared Inspector / Bottom edit-commit contract
Goal: classify property editing into a small explicit set: Immediate command, Draft+Apply/Cancel, or documented inline commit; same property uses the same semantics across Inspector and Bottom unless explicitly justified.
Acceptance:
- [ ] Interaction matrix classifies every property editor.
- [ ] Same property is not immediate in one surface and Apply-based in another without explicit justification/test.
- [ ] Draft+Apply supports Cancel/Revert; dirty-draft selection change is deterministic.
- [ ] Failed validation mutates Canonical/History/Dirty by 0.
- [ ] Successful Apply creates intended one History unit; Undo restores same prior Canonical state regardless of entry surface.
- [ ] Focused browser coverage includes rename, immediate boolean, multi-field Apply, Cancel/Esc and selection change with draft.

## #288 — Command parity across UI surfaces
Goal: alternate expert entry points remain, but equivalent logical commands share identity, enablement/preconditions, validation/dependency policy and History/Dirty result.
Acceptance:
- [ ] Command-surface parity matrix exists.
- [ ] Shared command IDs/predicates are used where practical.
- [ ] Rename and Delete parity tested across multiple surfaces + keyboard; Delete includes dependency handling.
- [ ] Visibility and move/reorder parity covered.
- [ ] Undo/Redo result independent of initiating surface.
- [ ] Representative disabled states agree across equivalent surfaces.
- [ ] No surface-specific direct Canonical mutation.
Closure: similarly named handlers are not enough; mechanical semantic equivalence is required.

## #289 — Large-design Transaction Linked Signals picker
Goal: replace the full-document checkbox list with a hierarchy-aware searchable, bounded/virtualized picker while retaining a compact current-linked list.
Acceptance:
- [ ] Inspector no longer renders one checkbox per Signal.
- [ ] Current linked Signals are visible without opening picker.
- [ ] Search covers Signal name and hierarchy path; duplicate leaf names are disambiguated.
- [ ] Result rendering is bounded/virtualized.
- [ ] Keyboard-only search/select/unlink works.
- [ ] Link/unlink uses Semantic Commands; Undo/Redo exact.
- [ ] Usable with 10k Signals and instrumentation proves Inspector does not create O(totalSignals) interactive DOM nodes.
Closure: adding a text filter above the full checkbox list is insufficient.

## #292 — View Ribbon fixed slots / Zoom Slot 4
Goal: approved View group order is `Show | Panels | Guides | Zoom | Workspace | Layout`; shared Zoom stays in fixed Slot 4 and same internal order across Home/View at primary desktop width.
Acceptance:
- [ ] View order matches approved slots; Zoom is Slot 4.
- [ ] Home/View Zoom start position, group width and command order match within approved tolerance at reference width.
- [ ] Home -> View -> Home does not visibly shift Zoom.
- [ ] Shared Zoom controls route to same behavior.
- [ ] Show/Panels/Guides/Workspace/Density/Layout operations are view-only as specified.
- [ ] Reset Layout and Focus Waveform preserve document semantics.
- [ ] Narrow-width compression/overflow is deterministic and keeps controls reachable.
- [ ] Tab switching Canonical/History/Dirty delta = 0.
- [ ] Do not change Golden/reference/threshold/mask or redesign unrelated tabs.

## #294 — View Ribbon information hierarchy / visual grammar
Goal: keep feature count while reorganizing View into understandable Display / Panels / Guides / Zoom / Workspace visual grammars. Home is a frozen forbidden region.
Acceptance:
- [ ] Display/Panels/Guides/Zoom/Workspace meanings are visually clear; related label vs overlay functions are grouped.
- [ ] Panels and Guides use internally consistent control grammar.
- [ ] Duplicate 100% Zoom presentation is removed; current/preset Zoom is one clear control.
- [ ] Workspace/Layout relationship is consolidated/organized.
- [ ] Group width/spacing/caption alignment follows design-system rules; no ad-hoc primitive overrides.
- [ ] View-only semantics preserved.
- [ ] Home DOM/CSS unchanged and Home visual delta = 0.
- [ ] Focused View geometry/visual tests and real-browser acceptance pass.
Key geometry expectation: same-family icon/button/caption alignment within ~1px and no overflow/overlap.

## #295 — Insert + Timeline/Edit Ribbon organization
Goal: organize Insert and Timeline/Edit according to approved workflow groups and timing-editor icon semantics without touching Home.
Acceptance:
- [ ] Insert = Signals / Structure / Annotation / More.
- [ ] Signal/Clock/Bus/State have distinct icons; Clock uses a digital square-wave/EDA clock metaphor, never analog clock/time-of-day icon.
- [ ] Annotation creation entry points exist in Insert.
- [ ] Timeline/Edit = Range / Insert / Range Edit / Bookmark / Fold-Break.
- [ ] Start/End/Count/To sit next to the commands that consume them.
- [ ] Bookmark/Time Group/Axis Break reuse existing semantic owners.
- [ ] Non-Home design-system primitives/geometry contracts are used and browser behavior passes at target widths.
- [ ] Home DOM/CSS unchanged, Home visual delta 0, no Golden/reference workaround.

## #301 — Current-cycle red line synchronized with range preview
Goal: red current-cycle line and blue active-range edge derive from the same current interaction snapshot/mapping epoch for each pointer update.
Acceptance:
- [ ] Red line and range edge update on the same pointer move with no frame/cycle lag.
- [ ] Fast movement and PointerUp do not cause trailing/jump correction.
- [ ] Remains synchronized after horizontal scroll, Zoom/Fit and folds/time mapping.
- [ ] Repeated drags do not reuse stale geometry/document epochs; Open/New during drag cancels stale interaction.
- [ ] Preview Canonical/History/Dirty deltas = 0.
- [ ] Focused unit + real-browser drag verifies alignment.
Constraint: no timeout or fixed-pitch workaround. If this reproduces the quarantined shared gesture/coordinate blocker and no production-safe fix is proven, record/skip rather than repeatedly retrying.

## #303 — Edit Ribbon alignment / clear range semantics
Goal: keep existing features but use a common internal Ribbon grid, full/clear command labels, and explicit start/end/length semantics without silently changing range behavior.
Acceptance:
- [ ] Inputs/buttons/labels/group footers have consistent vertical baselines.
- [ ] Previous is not clipped; Bookmark text and primary command labels do not severely overflow at reference width.
- [ ] Start/End are explicitly labeled cycles and derived selected length is visible.
- [ ] Cycle Insert Count belongs visually to insertion; Range Edit From/To belong to range-edit commands.
- [ ] Bookmark/marker semantics are clear and Fold/Break aligns to same grid.
- [ ] Responsive behavior has no overlap/unreachable commands.
- [ ] Layout/tab switching is Canonical/History/Dirty neutral; existing command routing/semantics preserved.

## #304 — Crisp single View Ribbon footer labels
Goal: each View group footer renders exactly once with one shared baseline/typography path; no doubled/ghosted/blurred labels.
Acceptance:
- [ ] Show/Panels/Guides/Workspace each render once and match crisp Zoom label quality.
- [ ] No duplicated visible/accessibility label layer; footer baselines consistent.
- [ ] Repeated Home/View switching, Workspace/Density changes and supported scale do not duplicate labels.
- [ ] Group order/command routing/Zoom Slot-4 semantics unchanged.
- [ ] Rendering/switching is Canonical/History/Dirty neutral.
- [ ] Focused DOM + browser checks prove one footer-label instance per group.

## #305 — Clear Insert timing-editor icon metaphors
Goal: replace only ambiguous Insert icons with concrete timing-diagram metaphors while preserving commands/labels/tooltips/IDs/routing.
Acceptance:
- [ ] Signal = generic one-off digital waveform distinct from periodic Clock.
- [ ] Bus = multi-bit/data-band metaphor.
- [ ] Event = instantaneous occurrence; Marker = reference flag/bookmark; Vertical Line = plain guide; all distinguishable.
- [ ] Range = bounded interval; Highlight = filled emphasis region; Bracket = actual bracket/brace; all distinguishable.
- [ ] Text reads as text annotation; Dependency uses directional node-to-node relation.
- [ ] Signal/Clock/Bus/State remain distinguishable at Ribbon size.
- [ ] Existing commands/labels/tooltips/command IDs/Automation IDs remain semantically stable.
- [ ] Icons are crisp at normal and one higher-DPI/scale; icon replacement is Canonical/History/Dirty neutral.
- [ ] No Golden/reference/threshold/mask change.

---

# CI / CLOSURE GATES

## #272 — Restore real GitHub Actions quality gate
Goal: repository-level Architecture Gate must actually allocate a runner and execute checkout/setup/npm/check/audit/Playwright rather than fail before any steps.
Acceptance:
- [ ] Real runner allocated; steps are non-empty and execute.
- [ ] `npm ci`, `npm run check`, approved `npm audit`, Playwright Chromium install and `npm run test:e2e` all execute with visible results.
- [ ] At least one new `main` run succeeds on current/fixed HEAD.
- [ ] A deliberately failing check causes the gate to fail.
- [ ] Required status/branch protection cannot be satisfied by skipped/no-step run.
- [ ] Root cause of pre-run failure documented.
Closure: local green or valid YAML alone is insufficient; hosted Actions must execute end-to-end.

## #184 — GUI v8 closure blockers
Goal: close specific reviewed GUI v8 gaps without changing V2 rendering architecture.
Acceptance:
- [ ] Group Collapse hides Left Tree children only; Frozen/Waveform remain visible; collapse has Canonical/History/WaveDrom/LocalGeometry delta 0.
- [ ] Visual Acceptance asserts geometry, Ribbon overflow and pixel-diff pass; threshold is not weakened.
- [ ] Pixel-diff mask does not cover Role/Signal GUI columns; only legitimate heavy waveform region may be masked.
- [ ] Normal `/` and `?visual-reference` use the same approved production GUI geometry; reference mode changes deterministic fixture/state only.
- [ ] Pane min/max agrees with initial geometry; first resize does not jump.
- [ ] Signal Tree filter scope is explicit/consistent.
- [ ] Role badge widths, Grid/Snap two-row layout, MiniMap Y matrix and Bottom toolbar SVG icons are mechanically covered.
- [ ] Latest acceptance artifacts regenerated and `npm run check`, `npm run test:e2e`, `npm run visual:acceptance`, `git diff --check` pass.
Constraint: do not broaden masks/change Golden/reference just to obtain green.

## #311 — Strict parity feature-identity / completion gate
Goal: parity inventory mechanically separates product-feature identity from implementation/acceptance status so semantically different features cannot satisfy each other's evidence.
Acceptance:
- [ ] Explicit statuses equivalent to NOT_IMPLEMENTED / PARTIAL / ACCEPTANCE_ONLY / BLOCKED_EXTERNAL / COMPLETE exist separately from feature identity.
- [ ] Legacy source #98 is represented and #98/#200 Signal Split cannot be satisfied by #173 Cycle/Transaction Split evidence.
- [ ] Current Signal Split status is corrected to actual state.
- [ ] Negative checker test proves differently scoped `Split View` features cannot satisfy each other.
- [ ] ACCEPTANCE_ONLY requires production evidence; COMPLETE requires all mandated evidence classes.
- [ ] Report distinguishes genuine missing production work from acceptance-only/external blockers.
- [ ] #177/#178 consume the stricter model; no Golden/reference/threshold/mask workaround.
Closure: adding a field alone is insufficient; the known #98/#200-vs-#173 false positive must be mechanically impossible.

---

## Maintenance
Refresh this snapshot when a listed Issue changes materially, closes, or leaves/enters these executable blocks. Current GitHub text always wins when available.