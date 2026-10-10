# Editor app ownership map

This map keeps the app composition layer explicit while the remaining editor
controllers are extracted incrementally.

| Surface / responsibility | Current owner | Canonical mutation owner | Extraction status |
| --- | --- | --- | --- |
| Review scope, severity, navigation | `review-workflow.tsx` | parent `UiCommandRegistry` callback | extracted |
| Problems presentation | `problems-panel.tsx` | parent `UiCommandRegistry` callback | extracted |
| Viewport, timeline, ruler and grid lifecycle | `runtime/timeline-viewport-runtime.ts`, `runtime/timeline-geometry-owner.ts`, `runtime/view-metrics.ts` | parent `UiCommandRegistry` callback | explicit runtime owners; `minimal-cycle-view.tsx` integrates them |
| Timeline surface input interactions | `runtime/timeline-surface-interactions.ts`, `runtime/tree-keyboard-controller.ts` | `UiCommandRegistry` / `EditorApplicationOwner` callbacks | explicit pointer, viewport keyboard, tree roving focus, context-menu, and tree-drag owners |
| File open/save/export lifecycle | `application/use-document-lifecycle.ts` | `CommandHistorySession` / SemanticCommand | explicit lifecycle owner; `minimal-cycle-view.tsx` integrates effects |
| Canonical session and renderer bridge | `application/use-editor-application-owner.ts`, `runtime/editor-application-runtime.ts`, `runtime/waveform-surface-provider.ts`, `runtime/render-coordinator.ts` | `CommandHistorySession` | explicit application/renderer boundary |
| Document replacement and async render generation | `runtime/document-epoch.ts`, `projection`, `renderer` | `DocumentEpoch` / current session | explicit epoch propagation; stale wave results are dropped |
| Event table row editing and quick values | `event-table-components.tsx` | parent `UiCommandRegistry` callback | Phase 1 extracted leaf |
| Comment Row editor | `comment-row-editor.tsx` | parent `UiCommandRegistry` callback | Phase 1 extracted leaf |
| Dialog focus trapping and restoration | `dialog-focus-loop.ts` | view-only focus lifecycle | Phase 1 extracted utility |
| Annotation list presentation | `annotation-list.tsx` | `EditorSurfaceCommandController.updateAnnotationProperties` | second-pass typed command boundary |
| Problems filter projection | `problem-filter.ts` | view-only diagnostic projection | Phase 1 extracted utility |
| Read-only JSON panel | `json-panel.tsx` | parent document projection | Phase 1 extracted leaf |
| Selected JSON object replacement | `json-selection.ts` | Advanced JSON command planner | Phase 1 extracted utility |
| Advanced JSON selected-object diagnostics | `json-problems.ts` | validation diagnostic projection | Phase 1 extracted utility |
| Advanced JSON selected-object diagnostics | `json-problems.ts` | validation diagnostic projection | Phase 1 extracted utility |
| Presentation cycle sampling | `presentation-cycles.ts` | view-only geometry projection | Phase 1 extracted utility |
| Text download bridge | `download-text.ts` | external export side effect | Phase 1 extracted utility |
| Semantic command ID generation | `command-id.ts` | command dispatch identity | Phase 1 extracted utility |
| Stable entity ID generation | `entity-id.ts` | canonical entity identity | Phase 1 extracted utility |
| Annotation anchor screen projection | `resolve-anchor-point.ts` | geometry projection | Phase 1 extracted utility |
| Annotation creation planning | `create-annotation.ts` | annotation SemanticCommand planner | Phase 1 extracted utility |
| Annotation toolbar | `annotation-toolbar.tsx` | parent annotation command callback | Phase 1 extracted leaf |
| Geometry grid DOM projection | `render-geometry-grid.ts` | view-only geometry projection | Phase 1 extracted utility |
| Inspector accordion state | `inspector-accordion.ts` | view-only Inspector state | Phase 1 extracted utility |
| Inspector section presentation | `inspector-section.tsx` | parent Inspector callback | Phase 1 extracted leaf |
| Inspector annotation editor | `inspector-annotation-editor.tsx` | `EditorSurfaceCommandController` | Phase 1 extracted leaf; second-pass typed command boundary |
| Inspector signal routing | `inspector-signal-router.tsx` | `EditorSurfaceCommandController` | Phase 1 extracted leaf; second-pass typed command boundary |
| Inspector style readers | `inspector-style.ts` | view-only style projection | Phase 1 extracted utility |
| Inspector clock editor | `inspector-clock-editor.tsx` | `EditorSurfaceCommandController` | Phase 1 extracted leaf; second-pass typed command boundary |
| Inspector reset semantics editor | `panels/inspector-reset-semantics.tsx` | `EditorSurfaceCommandController.updateResetSemantics` | focused semantic draft/Apply owner |
| Editor-wide file shortcuts and drop | `application/editor-file-event-bindings.ts` | document lifecycle callbacks | stable event lifecycle owner; current actions are read through a ref |
| Document-level file actions | `application/editor-document-file-events.ts` | `useDocumentLifecycle` callbacks | routes drop and save/open shortcuts without owning document state |
| Browser tab title | `application/use-editor-tab-title.ts` | view-only history/document projection | isolated title lifecycle |
| Open performance diagnostic projection | `runtime/open-performance-data.ts` | read-only published surface metrics | extracted from editor composition; no Open-path instrumentation |
| Timeline / viewport runtime boundary | `runtime/timeline-viewport-runtime.ts` | parent application runtime callback; view-only geometry/navigation | Step 1 owner transfer |
| Ribbon composition | `minimal-cycle-view-ribbon.tsx` | `EditorSurfaceCommandController` for mutation commands; parent callbacks for frozen Home controls | Physical Group 3 extraction; second-pass typed command boundary |
| Panels / editor composition | `editor-secondary-surfaces.tsx`, `editor-shell-view.tsx` | typed action/router/runtime callbacks | Group 4 extraction complete; second-pass owner boundaries enforced |
| UI action composition | `application/use-editor-actions.ts` | `EditorApplicationOwner` / `UiCommandRegistry` | PR3 owner extraction |
| Presentation-only editor toggles | `application/use-editor-presentation-state.ts`, `application/use-editor-resize-actions.ts`, `application/use-editor-workspace-actions.ts` | view-only React state | PR4 owner extraction |
| Timeline transient presentation state | `workspace/use-timeline-presentation-state.ts` | view-only React state and synchronized refs | PR4 owner extraction |
| Editor shell JSX | `editor-shell-view.tsx` | parent owner models and callbacks | PR5 shell extraction |
| Secondary editor surfaces | `editor-secondary-surfaces.tsx` | typed action/router/runtime callbacks | PR5 D3 surface composition extraction |
| Export service and browser delivery | `application/editor-export-controller.ts` | export service / browser download / clipboard adapter | second-pass controller boundary |
| Transaction linked-signal operation | `application/use-editor-actions.ts` | SemanticCommand / CommandHistorySession | second-pass presentation callback boundary |
| Advanced JSON replacement | `application/use-editor-actions.ts` | SemanticCommand / CommandHistorySession | second-pass presentation callback boundary |
| File action controller | `application/file-action-controller.ts` | document lifecycle owner | second-pass action boundary |
| Selection action controller | `application/selection-actions.ts` | SelectionOwner | second-pass action boundary |
| Bottom editor action controller | `application/bottom-editor-actions.ts` | SemanticCommand / SelectionOwner | second-pass action boundary |
| Clipboard action controller | `application/clipboard-actions.ts` | SemanticCommand / CommandHistorySession | second-pass action boundary |
| Inspector panel composition | `panels/inspector-panel.tsx` | typed command/selection callbacks | second-pass surface boundary |
| Signal editor surface | `editors/signal-editor.tsx` | typed editor/action callbacks | second-pass surface boundary |
| Clock generator editor surface | `editors/clock-generator-editor.tsx` | typed editor/action callbacks | second-pass surface boundary |
| Editor surface command controller | `application/editor-surface-command-controller.ts` | SemanticCommand construction / command IDs | second-pass presentation boundary |
| Find/Replace presentation | `find-replace-panel.tsx` | `EditorSurfaceCommandController.renameSignals` | second-pass typed command boundary |
| Bottom Transaction Editor | `transaction-editor.tsx` | `EditorSurfaceCommandController` transaction editor/bulk APIs | second-pass typed command boundary |
| Document Properties presentation | `document-properties.tsx` | `EditorSurfaceCommandController.updateDocumentProperties` | second-pass typed command boundary |
| Ribbon presentation boundary | `ribbon/editor-ribbon.tsx`, `minimal-cycle-view-ribbon.tsx` | `EditorSurfaceCommandController` for Insert/Annotation operations; parent callbacks for frozen Home controls | second-pass typed command boundary; Home remains frozen |
| Home Ribbon overflow | `ribbon/home-overflow.tsx` | parent Home command callbacks; view-only menu state and portal lifecycle | second-pass presentation owner |
| Editor workspace shell | `editor-workspace-view.tsx` | typed runtime/view callbacks | PR5 workspace extraction |
| Editor dialog layer | `editor-dialog-layer.tsx`, `application/use-editor-dialog-runtime.ts` | document lifecycle / command router | PR5 dialog extraction |
| Runtime presentation previews | `runtime/presentation-preview.ts` | view-only DOM/WaveDrom preview | PR6 helper split |
| Runtime helper boundaries | `runtime/render-invalidation.ts`, `runtime/editor-dom-bridge.ts`, `runtime/viewport-projection.ts`, `runtime/waveform-surface-provider.ts`, `runtime/timeline-presentation-refresh.ts`, `runtime/runtime-diagnostics.ts` | existing runtime owners | PR6 helper split; no compatibility barrel |
| Runtime viewport controller | `runtime/viewport-controller.ts` | view-only viewport/navigation callbacks | second-pass owner boundary |
| Runtime interaction controller | `runtime/interaction-controller.ts` | pointer/keyboard binding and transaction snap callbacks | second-pass owner boundary |
| Transition arrow picker | `runtime/transition-arrow-picker.ts` | two-click snapped Arrow/Dependency creation lifecycle | extracted from the timeline surface controller; mutation remains through `EditorApplicationOwner` |
| Runtime document refresh lifecycle | `runtime/document-lifecycle-controller.ts` | current document epoch/lifecycle guard | second-pass owner boundary |
| Runtime render coordinator | `runtime/render-coordinator.ts` | renderer overlay and edge-counter refresh | second-pass owner boundary |
| Timeline surface controller | `runtime/timeline-surface-controller.ts` | renderer/projection/geometry/gesture lifecycle | explicit non-React runtime owner |
| Signal Split Lower surface controller | `runtime/signal-split-surface-controller.ts` | renderer/projection callbacks remain view-only; Canonical mutation stays with the upper command owner | explicit non-React runtime owner; React hook is lifecycle adapter |
| Runtime viewport projection | `runtime/viewport-projection.ts` | projection/renderer owners | PR6 helper split |
| Runtime waveform provider | `runtime/waveform-surface-provider.ts` | WaveDrom adapter and geometry registry | PR6 helper split |
| Runtime timeline presentation refresh | `runtime/timeline-presentation-refresh.ts` | view-only DOM/geometry presentation | PR6 helper split |
| Runtime renderer host sizing | `runtime/renderer-host-sizing.ts` | view-only DOM sizing | PR6 helper split |
| Editor DOM bridge effects | `runtime/use-editor-dom-bridge-effects.ts` | view-only React effect adapter over DOM presentation helpers | extracted from the composition shell; owns tree presentation, range-band, resize, and ruler refresh effects |
| Runtime diagnostics publication | `runtime/runtime-diagnostics.ts` | runtime diagnostics dataset | PR6 helper split |

## Cycle / Transaction / Combined workspace ownership (#593)

This inventory records current presentation owners and remaining shared-shell
coupling. It is an implementation map, not a claim that real-browser isolation
acceptance is complete.

| Concern | Classification | Current owner / source | Boundary and remaining coupling |
| --- | --- | --- | --- |
| Canonical cycles, entities, commands, History, ChangeSet | `SHARED_SEMANTIC` | schema + `CommandHistorySession` / SemanticCommand; `runtime/timeline-geometry-owner.ts` | One canonical source-time contract; must not be forked by mode. |
| Display mapping and source-cycle geometry | `SHARED_PRIMITIVE` | `runtime/timeline-geometry-owner.ts`, `runtime/display-boundary.ts`, `runtime/timeline-viewport-runtime.ts` | Shared source-cycle semantics; each visible mode supplies its presentation attachment. |
| App shell and stable renderer frame | `SHARED_PRIMITIVE` | `editor-shell-view.tsx`, persistent `.cycle-panel` / `.cycle-viewport` in `editor-workspace-view.tsx`, `.desktop-workspace` in `styles/app-shell.css` | `createWorkspaceOwnerPlan` selects one typed mode owner for the active rail, header, panel chrome, upper pane, timeline body, and auxiliary pane. The renderer frame and imperative host remain shared runtime primitives so mode changes do not fork semantic/time owners. `data-workspace-owner` mirrors the selected plan on the panel and rail. |
| Cycle workspace composition | `CYCLE_PRESENTATION` | `CycleWorkspace` / `CycleWorkspaceRail` / `CycleWorkspaceAuxiliary` and the Cycle arm of `createWorkspaceOwnerPlan` in `editor-workspace-view.tsx`; `.editor-shell[data-view-mode="Cycle"]` rules in `styles/mode-cycle.css` | Owns Cycle header, Signal tree rail, frozen/left splitters, embedded Signal tree/frozen columns, Cycle-specific lower Signal Split, and selection of the Cycle timeline body; the Cycle-only horizontal scroll wrapper is selected by `runtime/timeline-scroll-owner.ts`. |
| Transaction workspace composition | `TRANSACTION_PRESENTATION` | `TransactionWorkspace` / `TransactionWorkspaceRail` and the Transaction arm of `createWorkspaceOwnerPlan` in `editor-workspace-view.tsx`; `.cycle-panel.mode-transaction` rules in `styles/mode-transaction.css`; `runtime/transaction-lanes.tsx` | Owns Transaction header/tree rail and selects Transaction lanes as the frame body. The standalone Transaction scroll owner and lane sizing are mode-scoped; it does not mount Cycle frozen rows or Cycle splitters. |
| Combined workspace composition | `COMBINED_PRESENTATION` | `CombinedWorkspace`, `CombinedWorkspacePanes`, `CombinedWorkspaceRail`, and the Combined arm of `createWorkspaceOwnerPlan` in `editor-workspace-view.tsx`; `.cycle-panel.mode-split` rules in `styles/mode-combined.css` | Owns Combined header/tree, upper Transaction pane, lower Cycle timeline body, splitter, and auxiliary selection. One outer `.cycle-viewport` is the horizontal owner for both panes; Transaction/Cycle vertical scrollers remain local. Do not add two-way horizontal mirroring. |
| Standalone Cycle/Transaction zoom | `CYCLE_PRESENTATION` / `TRANSACTION_PRESENTATION` | `runtime/use-timeline-navigation-owner.ts` (`zoomByModeRef`) | Zoom values are snapshotted independently on standalone-mode changes; Split uses the active shared time viewport and does not replace standalone snapshots. |
| Horizontal scroll | mode presentation owners | `runtime/timeline-scroll-owner.ts`; `runtime/use-timeline-navigation-owner.ts` (`scrollLeftByModeRef`); `runtime/timeline-horizontal-scrollbar-owner.ts` | Cycle resolves to the inner timeline wrapper; Transaction and Split resolve to their outer viewport. Split deliberately has one shared owner. The Cycle track's DOM geometry/listener lifecycle is mounted only by its workspace composition and owned by the typed scrollbar adapter. The DOM owner remains authoritative; its position is snapshotted per mode in memory during mode switches only, and reset on document epoch changes. It is not persisted in the document or browser storage. |
| Cursor A/B presentation and drag lifecycle | shared interaction owner | `runtime/cursor-overlay-owner.ts`; `editor-workspace-view.tsx` supplies refs and current typed callbacks | The runtime owner projects Cursor lines using shared source-time geometry and owns resize/scroll observation plus pointer gesture cleanup. Cursor-value preview refreshes call `refresh()` without reconnecting listeners or rebuilding the owner; mode/unmount teardown cancels active drags. |
| Left/frozen/Inspector/Bottom dimensions | `CYCLE_PRESENTATION` / `TRANSACTION_PRESENTATION` / Combined composition | `workspace/use-workspace-ui-state.ts` (`paneDimensionsByModeRef`); CSS vars published by `minimal-cycle-view.tsx` | Cycle and Transaction snapshots restore independently; Combined uses current composition dimensions. Widths still flow through shared CSS variables. |
| Cycle frozen columns and splitter DOM | `CYCLE_PRESENTATION` | `editor-workspace-view.tsx`, `packages/renderer/src/stable-surface.ts`; `styles/mode-cycle.css` | The renderer creates the frozen-column layer only for Cycle/Combined and removes it from the DOM in Transaction; it is recreated when returning. The mode-specific splitters are conditionally mounted by the owning composition. |
| Transaction Group/Lane presentation | `TRANSACTION_PRESENTATION` / `COMBINED_PRESENTATION` | `runtime/transaction-lanes.tsx`; `styles/mode-transaction.css` and `styles/mode-combined.css` | Projection/interaction is shared between standalone and Combined; layout adapters differ by mode. Canonical Transaction identity/mutation remains shared. |
| Ruler, grid, renderer host, annotations, MiniMap | `SHARED_PRIMITIVE` with mode adapters | `runtime/build-ruler.ts`, `runtime/render-geometry-grid.ts`, `runtime/renderer-host-sizing.ts`, `minimap.tsx`; `styles/center-columns.css` | Generic stylesheet still interleaves surface, ruler/grid, frozen-column, and Transaction-lane selectors. Mode styles override selected layout; extraction needs a consumer audit. |
| Bottom routing, tabs, Follow Selection, Pin | mode-aware shared presentation state | `workspace/use-workspace-ui-state.ts`, `minimal-cycle-view-panels.tsx`, `editor-secondary-surfaces.tsx` | Tab/follow/pin state is tracked per standalone mode; Combined preserves source standalone tab behavior. Commands and selection identity remain shared. |
| Inspector | `SHARED_PRIMITIVE` with active-context routing | `panels/inspector-panel.tsx`, `editor-secondary-surfaces.tsx`, active context in `use-workspace-ui-state.ts` | Shared Inspector shell; selected entity/context determines content. Not yet separate mode-owned surface components. |
| Signal Split (Cycle-only dual signal panes) | `CYCLE_PRESENTATION` | `runtime/signal-split-surface-controller.ts`, `runtime/use-signal-split-presentation-sync.ts`, `styles/mode-cycle.css` | Distinct from Combined's Transaction-over-Cycle `Split`; user-facing mode selector says Combined while internal enum remains Split. |

### Concrete remaining architecture work

- The shell intentionally keeps one stable `.cycle-panel`, `.cycle-viewport`,
  and imperative renderer host so mode switches do not tear down runtime-owned
  DOM. Mode-specific header, tree-rail, splitter, and pane compositions now
  have explicit typed owners; remaining shared CSS variables are presentation
  inputs rather than separate semantic/time-axis authorities.
- `center-columns.css` interleaves shared primitives and mode-specific
  selectors. Consumers include `--gui-left-width`, `--gui-frozen-width`, and
  `--wave-width`; extracting a block without auditing consumers can shift the
  time origin or sizing contract.
- Horizontal scroll resolves to distinct mode DOM owners, and Combined has one
  shared outer owner, but the complete 1672x941 / 1280x720 switch-resize-return
  real-browser contract is not verified on current main.
- `tests/e2e/issue-593-mode-layout-isolation.spec.ts` checks shared-region
  geometry across mode round-trips; `tests/e2e/mode-isolation-journey.spec.ts`
  checks selected width/origin ownership. Neither replaces #593's complete
  real-browser acceptance matrix.

Rules:

- `MinimalCycleView` root allow-list:
  - ALLOW: top-level owner hooks, lightweight selected-entity/view-model
    lookup, typed owner composition, and passing grouped view models to
    `EditorShellView`.
  - DENY: renderer/WaveDrom/geometry lifecycle, raw listener lifecycle,
    semantic command implementation, clipboard/file parsing, bulk
    parser/normalizer logic, large surface JSX, and feature-specific pointer
    gesture implementation.
- UI modules may request mutations only through the existing SemanticCommand
  and session/registry callbacks.
- View-only state remains transient and is not persisted in CanonicalDocument.
- Renderer and WaveDrom ownership remains in their existing packages.
- The deprecated `runtime/use-editor-runtime-bridge.ts` compatibility bridge is
  intentionally absent. Its former lifecycle boundary is owned by the typed
  `useTimelineSurfaceRuntime` / `timeline-surface-controller` pair; restoring
  the old filename would create a second, ambiguous runtime owner.
- `MinimalCycleView` is the composition/integration layer for these owners; its
  long-lived callbacks may access mutable product/view state only through the
  current owner APIs and refs. Do not add a second state system or split the
  component solely for file size.

The complete capture classification for the primary `useEffect(..., [])` is
maintained in [`runtime/MOUNT_EFFECT_INVENTORY.md`](runtime/MOUNT_EFFECT_INVENTORY.md).
That inventory is part of the #237 contract: a new long-lived callback must be
added to the inventory with its owner, lifetime, and replacement/reset rule.
| Legend presentation | `legend-view.tsx` | `EditorSurfaceCommandController.updateLegend` | second-pass typed command boundary |
| `ai-operation-panel.tsx` | AI query preview and SemanticCommand application surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `ribbon-icon.tsx` | Shared Ribbon icon adapter for non-critical Ribbon assets | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `insert-semantic-icon.tsx` | Insert-surface semantic icon geometry and rendering | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `editor-icon.tsx` | Shared editor icon and icon-button primitives | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `hardware-hierarchy-browser.tsx` | Derived hardware hierarchy/scope browser and selection surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `inline-name-input.tsx` | Transient name draft, validation feedback, and rename command boundary | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `runtime/display-boundary.ts` | Shared source-cycle to display-boundary mapping helper | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `runtime/snap-index.ts` | Shared semantic snap-index construction from projection and local geometry | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `runtime/annotation-overlays.ts` | Annotation anchor, measurement, and ghost-trace overlay projection | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `runtime/clock-settings.ts` | Deterministic clock settings serialization for export | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `save-as-dialog.tsx` | Save As filename draft, validation, and focus-loop UI | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `problems-panel-legacy.tsx` | Filterable diagnostic presentation and problem navigation | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `event-table.tsx` | Signal event table state, import/export, and event command surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `clock-generator-editor.tsx` | Clock generator, edge counter, import/export, and preview surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `runtime/build-ruler.ts` | Ruler DOM projection from shared local geometry and display mapping | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `document-properties.tsx` | Document metadata, header/footer, and editable legend properties surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| Bottom Bookmark editor | `bookmark-editor.tsx` | `EditorSurfaceCommandController.createBookmark/updateBookmark` | second-pass typed command boundary |
| `timeline-toolbar.tsx` | Timeline range, insert/edit, bookmark, and fold/break command surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `layout-inspector.tsx` | Layout dimensions, column alignment, and auto-fit property surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| Bottom Annotation editor | `annotation-editor.tsx` | `EditorSurfaceCommandController` plus `EditorActions.replaceDocument` for import | second-pass typed command boundary |
| `advanced-json-panel.tsx` | Advanced JSON draft, validation, resource policy, clipboard, and replace command surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `signal-editor.tsx` | Bottom signal editor, group drop targets, properties, and context editor composition | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `runtime/transaction-lanes.tsx` | Transaction lane projection and pointer interaction using supplied geometry/snap callbacks | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `transaction-editor.tsx` | Transaction create/edit list and command surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
