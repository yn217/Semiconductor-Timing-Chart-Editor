# Timeline surface mount-effect capture inventory

This is the review inventory for the primary `useEffect(..., [])` in
`runtime/use-timeline-surface-runtime.ts` (the lifecycle owner whose
non-React controller begins near the `rendererHost` lookup).
It records every value intentionally captured by the effect's long-lived
callbacks and the rule that makes the capture safe. Values in the final column
are the only mutable values that a callback may read directly.

| Captured value or family | Classification | Current owner / lifetime rule |
| --- | --- | --- |
| `host`, `viewport`, `ruler`, `gridLayer` refs and the derived DOM elements | Immutable DOM handles for this mount | Bound once for this mounted view; all listeners and renderers are detached in the effect cleanup. |
| `application`, `documentLifecycle`, `selection`, `editActions`, `timelineNavigation` | Stable typed controllers | Hook-owned controllers; callbacks call their current APIs, never a state snapshot. Their document-scoped state is reset by the lifecycle owner on replacement. |
| `runtime`, `sessionController`, `projectionCoordinator`, `mappingCache`, `geometryRegistry`, `renderCoordinator`, `renderer`, `adapter` | Stable infrastructure owners | Created for this mount and disposed/cleared on cleanup or document replacement; current document identity comes from `sessionController.snapshot()` / `sessionController.current()`. |
| `sessionController` current access | Current document/history owner handle | The replaceable `EditorSessionController` is stable for the mount; callbacks read `snapshot()` / `current()` at invocation time, so Open/New cannot leave a mount-time session object behind. |
| `documentEpoch` | Current document generation owner | `advance()` is called for full replacement; async render and interaction owners compare their captured generation to `isCurrent`. |
| `projection`, `window` | Current derived render/viewport state | Mutable only inside the mount effect; both are replaced after every projection/viewport calculation and never used as Canonical state. |
| `timelineGeometry`, `timelineRuntime` | Current geometry and viewport owners | Their APIs resolve current mapping, metrics, and geometry; `reset()` / epoch update runs during replacement and `dispose()` runs during cleanup. |
| `viewMetricsOwner` | Current pane/viewport metrics owner | Callbacks call `snapshot()` at use time; the owner is updated from current splitter/zoom state outside the mount effect. No mount-time width is used as authoritative state. |
| `collapsedGroupIdsRef`, `gridEnabledRef`, `snapEnabledRef`, `timelineRangeRef`, `selectedCycleRef`, `selectedEdgeRef` | Current transient refs | Each ref is updated on render or by its interaction owner; replacement synchronously clears document-scoped range/cycle/edge state. |
| `selection.refs` and `followSelectionRef` | Current selection/context owner | Selection routes converge on `SelectionController`; replacement calls `selection.clear()`, and callbacks query refs rather than captured selection state. |
| `interactionHandle` / `timeline-surface-interactions.ts` | Current gesture and input owner | The extracted owner wires range, tree-drag, annotation, canvas, ruler, context-menu, and global keyboard input; replacement calls `interactionHandle.cancel()`, and cleanup calls `interactionHandle.detach()`. |
| `pendingArrow`, `pendingArrowAnnotationType` | Current arrow-pick gesture state | Owned by this effect's interaction lifetime; replacement clears the pending anchor, resets the type, and removes the `arrowPick` marker. Escape also clears it. |
| `rulerInitialized`, `rulerBuilds`, `edgeCounterResolvePasses`, `frame`, `active` | Effect-local lifecycle/diagnostic state | Valid only for this mount; `active` becomes false before asynchronous continuations can publish, and cleanup cancels the animation frame. |
| `collapsedGroupIds` snapshots passed to `project()` | Read-only call input | Materialized from `collapsedGroupIdsRef.current` at each call; no closure copy is used. |
| React setters and diagnostic setters | Stable dispatch functions | Setters are used only for presentation/diagnostic projection; Canonical mutation remains in the application command owner. |
| `initialDocument`, `snapshot`, `leftPaneWidth`, `frozenPaneWidth`, `inspectorWidth`, `timelineRange`, `selectedCycle`, and other render values not listed above | **Illegal stale capture for long-lived callbacks** | Not read as authoritative state by the primary mount callbacks. Current values are obtained from owners/refs; these values are used by render-time presentation or the dedicated dependency-bearing effects only. |

## Review invariants

- Open/New replaces the session through `EditorSessionController`, advances the document epoch, cancels all
  document-scoped gestures, clears selection and transient range state, clears
  geometry caches, and projects the new snapshot before asynchronous follow-up
  presentation.
- An async continuation must check both the mount `active` flag and the current
  document epoch before publishing DOM state.
- Resize/zoom callbacks obtain `ViewMetricsOwner.snapshot()` and
  `TimelineNavigation.getZoom()` at invocation time.
- The primary effect remains an integration boundary. This inventory does not
  authorize a second mutable bag or another MinimalCycleView decomposition.

## Cross-feature evidence

- Open then drag an Annotation endpoint: `tests/e2e/runtime-owner-acceptance.spec.ts`.
- Resize then edit then zoom: `tests/e2e/runtime-owner-acceptance.spec.ts`.
- Open during pending WaveDrom work: `tests/e2e/open-progressive-wave-yield.spec.ts`.
