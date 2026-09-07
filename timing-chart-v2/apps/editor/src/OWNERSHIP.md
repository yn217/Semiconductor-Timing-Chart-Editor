# Editor app ownership map

This map keeps the app composition layer explicit while the remaining editor
controllers are extracted incrementally.

| Surface / responsibility | Current owner | Canonical mutation owner | Extraction status |
| --- | --- | --- | --- |
| Review scope, severity, navigation | `review-workflow.tsx` | parent `UiCommandRegistry` callback | extracted |
| Problems presentation | `problems-panel.tsx` | parent `UiCommandRegistry` callback | extracted |
| Viewport, timeline, ruler and grid lifecycle | `runtime/timeline-viewport-runtime.ts`, `runtime/timeline-geometry-owner.ts`, `runtime/view-metrics.ts` | parent `UiCommandRegistry` callback | explicit runtime owners; `minimal-cycle-view.tsx` integrates them |
| Timeline surface input interactions | `runtime/timeline-surface-interactions.ts` | `UiCommandRegistry` / `EditorApplicationOwner` callbacks | explicit pointer, keyboard, context-menu, and tree-drag owner |
| File open/save/export lifecycle | `application/use-document-lifecycle.ts` | `CommandHistorySession` / SemanticCommand | explicit lifecycle owner; `minimal-cycle-view.tsx` integrates effects |
| Canonical session and renderer bridge | `application/use-editor-application-owner.ts`, `runtime/editor-application-runtime.ts`, `runtime/use-editor-runtime-bridge.ts` | `CommandHistorySession` | explicit application/renderer boundary |
| Document replacement and async render generation | `runtime/document-epoch.ts`, `projection`, `renderer` | `DocumentEpoch` / current session | explicit epoch propagation; stale wave results are dropped |
| Event table row editing and quick values | `event-table-components.tsx` | parent `UiCommandRegistry` callback | Phase 1 extracted leaf |
| Comment Row editor | `comment-row-editor.tsx` | parent `UiCommandRegistry` callback | Phase 1 extracted leaf |
| Dialog focus trapping and restoration | `dialog-focus-loop.ts` | view-only focus lifecycle | Phase 1 extracted utility |
| Annotation list presentation | `annotation-list.tsx` | parent selection callback | Phase 1 extracted leaf |
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
| Inspector annotation editor | `inspector-annotation-editor.tsx` | parent Inspector SemanticCommand callback | Phase 1 extracted leaf |
| Inspector signal routing | `inspector-signal-router.tsx` | parent Inspector SemanticCommand callback | Phase 1 extracted leaf |
| Inspector style readers | `inspector-style.ts` | view-only style projection | Phase 1 extracted utility |
| Inspector clock editor | `inspector-clock-editor.tsx` | parent Inspector SemanticCommand callback | Phase 1 extracted leaf |
| Timeline / viewport runtime boundary | `runtime/timeline-viewport-runtime.ts` | parent application runtime callback; view-only geometry/navigation | Step 1 owner transfer |
| Ribbon composition | `minimal-cycle-view-ribbon.tsx` | parent callback / existing command boundary | Physical Group 3 extraction |
| Panels / editor composition | `minimal-cycle-view.tsx` | parent application command boundary | Pending Group 4 extraction |
| UI action composition | `application/use-editor-actions.ts` | `EditorApplicationOwner` / `UiCommandRegistry` | PR3 owner extraction |
| Presentation-only editor toggles | `application/use-editor-presentation-state.ts`, `application/use-editor-resize-actions.ts`, `application/use-editor-workspace-actions.ts` | view-only React state | PR4 owner extraction |
| Timeline transient presentation state | `workspace/use-timeline-presentation-state.ts` | view-only React state and synchronized refs | PR4 owner extraction |
| Editor shell JSX | `editor-shell-view.tsx` | parent owner models and callbacks | PR5 shell extraction |
| Secondary editor surfaces | `editor-secondary-surfaces.tsx` | typed action/router/runtime callbacks | PR5 D3 surface composition extraction |
| Export service and browser delivery | `application/editor-export-controller.ts` | export service / browser download / clipboard adapter | second-pass controller boundary |
| Transaction linked-signal operation | `application/use-editor-actions.ts` | SemanticCommand / CommandHistorySession | second-pass presentation callback boundary |
| Advanced JSON replacement | `application/use-editor-actions.ts` | SemanticCommand / CommandHistorySession | second-pass presentation callback boundary |
| Ribbon presentation boundary | `ribbon/editor-ribbon.tsx`, `minimal-cycle-view-ribbon.tsx` | parent command/router callbacks | PR5 presentation boundary |
| Editor workspace shell | `editor-workspace-view.tsx` | typed runtime/view callbacks | PR5 workspace extraction |
| Editor dialog layer | `editor-dialog-layer.tsx`, `application/use-editor-dialog-runtime.ts` | document lifecycle / command router | PR5 dialog extraction |
| Runtime presentation previews | `runtime/presentation-preview.ts` | view-only DOM/WaveDrom preview | PR6 helper split |
| Runtime helper barrel | `runtime/use-editor-runtime-bridge.ts` | existing runtime owners | PR6 compatibility barrel |
| Runtime viewport projection | `runtime/viewport-projection.ts` | projection/renderer owners | PR6 helper split |
| Runtime waveform provider | `runtime/waveform-surface-provider.ts` | WaveDrom adapter and geometry registry | PR6 helper split |
| Runtime timeline presentation refresh | `runtime/timeline-presentation-refresh.ts` | view-only DOM/geometry presentation | PR6 helper split |
| Runtime renderer host sizing | `runtime/renderer-host-sizing.ts` | view-only DOM sizing | PR6 helper split |
| Runtime diagnostics publication | `runtime/runtime-diagnostics.ts` | runtime diagnostics dataset | PR6 helper split |

Rules:

- UI modules may request mutations only through the existing SemanticCommand
  and session/registry callbacks.
- View-only state remains transient and is not persisted in CanonicalDocument.
- Renderer and WaveDrom ownership remains in their existing packages.
- `MinimalCycleView` is the composition/integration layer for these owners; its
  long-lived callbacks may access mutable product/view state only through the
  current owner APIs and refs. Do not add a second state system or split the
  component solely for file size.

The complete capture classification for the primary `useEffect(..., [])` is
maintained in [`runtime/MOUNT_EFFECT_INVENTORY.md`](runtime/MOUNT_EFFECT_INVENTORY.md).
That inventory is part of the #237 contract: a new long-lived callback must be
added to the inventory with its owner, lifetime, and replacement/reset rule.
| `legend-view.tsx` | Legend presentation, drag/nudge interaction, and `legend.update` command emission | `minimal-cycle-view.tsx` composition | 2026-08-31 |
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
| `timeline-toolbar.tsx` | Timeline range, insert/edit, bookmark, and fold/break command surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `layout-inspector.tsx` | Layout dimensions, column alignment, and auto-fit property surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `annotation-editor.tsx` | Annotation list, import/export, style, anchor-offset, and command surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `advanced-json-panel.tsx` | Advanced JSON draft, validation, resource policy, clipboard, and replace command surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `signal-editor.tsx` | Bottom signal editor, group drop targets, properties, and context editor composition | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `runtime/transaction-lanes.tsx` | Transaction lane projection and pointer interaction using supplied geometry/snap callbacks | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `transaction-editor.tsx` | Transaction create/edit list and command surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
