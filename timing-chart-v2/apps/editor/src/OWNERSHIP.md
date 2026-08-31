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

Rules:

- UI modules may request mutations only through the existing SemanticCommand
  and session/registry callbacks.
- View-only state remains transient and is not persisted in CanonicalDocument.
- Renderer and WaveDrom ownership remains in their existing packages.
- A new surface owner must be added here before adding another responsibility
  to `minimal-cycle-view.tsx`.
