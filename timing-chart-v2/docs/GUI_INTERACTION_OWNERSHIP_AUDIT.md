# GUI Interaction Ownership Audit

Current-main source audit for #615. This is a bounded Phase 1 inventory, not
an assertion that every GUI journey or async path has been verified in a real
browser. Reviewed on `2908001b3c8bc778a7eebf7fffca742e97d445b1`.

## Audited paths

| Interaction / data | Classification | Current owner and route | Finding |
| --- | --- | --- | --- |
| Canonical edit from Ribbon, tree, Inspector, Bottom, keyboard, context menu | `SEMANTIC_MUTATION` | `useEditorCommandRouter` registers `semantic.execute` to `EditorApplicationOwner.execute`; edit actions use the same application/session command path. | No parallel View-owned Canonical mutation found in the audited route. `dispatchResult` is the accepted/rejected boundary for snapshot/history publication. |
| Cycle selection and cross-surface decoration | `CROSS_SURFACE_INTERACTION` | `SelectionOwner` owns stable selected IDs; `useEditorPresentationState.applySelectionDecorations` updates derived DOM selection attributes; the composition root injects `synchronizeContext` to implement Follow Selection's Bottom-tab policy. | This is an explicit injected policy callback, not direct sibling-component mutation. The selection owner remains unaware of Bottom implementation. A real-browser owner/invalidation issue remains separately tracked in #632. |
| Workspace preset, mode, panel visibility and Bottom tab | `WORKSPACE_VIEW_STATE` | `useEditorWorkspaceActions` applies bounded workspace presets through injected setters; `useWorkspaceUiState` owns mode normalization and available-tab rules. | State transitions are grouped in a workspace action owner. Some composition-root setter injection remains, but no Canonical/History route is involved. |
| Pointer, keyboard, tree drag, annotation/range gestures | `CROSS_SURFACE_INTERACTION` | `attachTimelineSurfaceInteractions` owns listener attachment; specialized `TimelineRangeInteractionOwner`, `AnnotationInteractionOwner`, and `TreeDragInteractionOwner` own gesture lifecycles. `attachEditorEventBindings` detaches bindings in reverse order. | Gesture success routes through Semantic Commands; cancellation is explicit. Document replacement cancels active interaction and effect cleanup detaches listeners. |
| Open/New and transient UI reset | `WORKSPACE_VIEW_STATE` / `ASYNC_PUBLICATION` | The timeline surface lifecycle replacement callback clears selection/range/gesture/menu state, resets geometry, resets scroll, and projects the replacement snapshot. `DocumentEpoch` gates async render publication. | The existing `runtime/MOUNT_EFFECT_INVENTORY.md` documents mount captures and freshness invariants; this audit found no specific stale-capture defect in the reviewed path. |
| Waveform/geometry async work | `ASYNC_PUBLICATION` | `createWaveformSurfaceProvider` checks request freshness and document epoch before/after WaveDrom work, validates stable Signal identity against the latest snapshot, then publishes geometry by stable Signal ID. | No row-index identity or unguarded document-replacement publication was found in the reviewed provider path. This does not replace focused race tests. |
| Projection, viewport and renderer domains | `LOCAL_VIEW_EPHEMERAL` / `ASYNC_PUBLICATION` | `ProjectionCoordinator`, `TimelineGeometryOwner`, `TimelineViewportRuntime`, `StableTimingChartRenderer`, and the Waveform provider each own distinct derived domains. | Architecture docs already state their boundaries. #632 shows a remaining measured first-selection invalidation whose triggering scroll event has not yet been identified; do not infer a production fix from this audit. |

## Concrete contracts already present

- `docs/ARCHITECTURE.md` defines the Canonical → Semantic Command/History → Projection → Renderer path and the render-domain policy.
- `architecture/state-ownership.json` distinguishes persistent, transient, and derived state owners.
- `runtime/MOUNT_EFFECT_INVENTORY.md` records the long-lived mount effect's captures, reset behavior, and async freshness rules.
- `scripts/check-boundaries.mjs` and `scripts/check-performance-architecture.mjs` enforce package/runtime boundaries and selected architectural invariants.
- `tests/e2e/mode-isolation-journey.spec.ts` exercises view-state isolation; focused interaction tests cover gesture cancellation and semantic command/history paths.

## Risks and remaining audit work

1. The composition root remains a large integration boundary. Continue extracting only when a concrete ownership violation or testability boundary is identified; do not split it mechanically.
2. `SelectionOwner.synchronizeContext` is intentionally callback-driven. Add an invariant test only if a concrete route bypasses this injected workspace policy or causes a mode-incompatible Bottom tab.
3. There is no comprehensive static rule that can decide whether arbitrary React setter injection is a peer-mutation violation. A filename-based ban would reject legitimate composition-root wiring; a future gate should target a demonstrated illegal dependency instead.
4. The first Cycle Signal selection's viewport-only projection remains an unresolved measured performance path (#632). The current evidence identifies the scroll projection boundary, but not the event that first changes the viewport window.
5. Real-browser interrupt/cancel coverage is journey-specific and is not claimed complete by this source audit.

## Result

This audit found existing bounded owners for the reviewed semantic, workspace,
gesture, projection, and async publication paths, plus one open measured
invalidation question already tracked by #632. It found no additional concrete
production defect that justifies an ownership refactor. This document advances
the Phase 1 inventory for #615; it does not satisfy the issue's architecture
test and real-browser acceptance closure criteria.
