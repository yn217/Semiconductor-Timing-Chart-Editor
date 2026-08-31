# Editor app ownership map

This map keeps the app composition layer explicit while the remaining editor
controllers are extracted incrementally.

| Surface / responsibility | Current owner | Canonical mutation owner | Extraction status |
| --- | --- | --- | --- |
| Review scope, severity, navigation | `review-workflow.tsx` | parent `UiCommandRegistry` callback | extracted |
| Problems presentation | `problems-panel.tsx` | parent `UiCommandRegistry` callback | extracted |
| Viewport, timeline, ruler and grid lifecycle | `minimal-cycle-view.tsx` | parent `UiCommandRegistry` callback | pending extraction |
| File open/save/export lifecycle | `minimal-cycle-view.tsx` | `CommandHistorySession` / SemanticCommand | pending extraction |
| Canonical session and renderer bridge | `minimal-cycle-view.tsx` | `CommandHistorySession` | composition boundary |
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

Rules:

- UI modules may request mutations only through the existing SemanticCommand
  and session/registry callbacks.
- View-only state remains transient and is not persisted in CanonicalDocument.
- Renderer and WaveDrom ownership remains in their existing packages.
- A new surface owner must be added here before adding another responsibility
  to `minimal-cycle-view.tsx`.
| `legend-view.tsx` | Legend presentation, drag/nudge interaction, and `legend.update` command emission | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `ai-operation-panel.tsx` | AI query preview and SemanticCommand application surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `ribbon-icon.tsx` | Shared Ribbon icon adapter for non-critical Ribbon assets | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `insert-semantic-icon.tsx` | Insert-surface semantic icon geometry and rendering | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `editor-icon.tsx` | Shared editor icon and icon-button primitives | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `hardware-hierarchy-browser.tsx` | Derived hardware hierarchy/scope browser and selection surface | `minimal-cycle-view.tsx` composition | 2026-08-31 |
| `inline-name-input.tsx` | Transient name draft, validation feedback, and rename command boundary | `minimal-cycle-view.tsx` composition | 2026-08-31 |
