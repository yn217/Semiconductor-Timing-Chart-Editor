# Claude execution plan — MinimalCycleView responsibility refactor

This plan is for a **manual Claude refactor branch**. It does not re-enable #258/#312 in Codex execution order. Codex may continue product Issue burn-down on `main`; Claude must isolate this structural work on its own branch until verification is complete.

Observed main at plan creation: `0217147f1c4b00e54e711cd4b23763f8d7d56ce2`. Do not pin to it; always fetch/pull latest before starting.

Read first:
- `.codex/HOT_FILE_REFACTOR_PLAYBOOK.md`
- current `timing-chart-v2/apps/editor/src/minimal-cycle-view.tsx`
- existing extracted owners/components under `apps/editor/src/runtime`, `minimal-cycle-view-ribbon.tsx`, `minimal-cycle-view-panels.tsx`, `minimal-cycle-view-ui.tsx`

## Goal

Do not target an arbitrary 4-file split. Split by durable responsibilities that can grow independently.

Target architecture (guidance, not rigid LOC gates):

```text
minimal-cycle-view.tsx                        shell/orchestration          ~250-450 lines
application/use-editor-application-owner.ts  canonical/command/history   ~350-700
application/use-document-lifecycle.ts        New/Open/Save/dirty/epoch   ~250-500
application/use-selection-owner.ts           selection/UI sync           ~300-600
application/use-clipboard-actions.ts         copy/cut/paste/duplicate    ~150-350
runtime/use-timeline-navigation.ts           zoom/Fit/navigation         ~300-650
runtime/use-timeline-geometry.ts             mapping/range/snap geometry ~300-700
runtime/use-timeline-interactions.ts         pointer/keyboard/drag       ~400-800
runtime/use-render-coordinator.ts            mount/refresh/overlays      ~300-700
workspace/use-workspace-ui-state.ts          panes/tabs/visibility       ~250-500
ui/editor-shell-view.tsx                     composition only            ~300-600
ui/signal-tree-panel.tsx                     Signal Tree presentation    ~250-600
ui/bottom-editor-panel.tsx                   Bottom Editor presentation  ~250-600
ui/inspector-shell.tsx                       Inspector composition       ~200-500
ui/editor-dialogs.tsx                        dialogs/file UI             ~250-600
```

Existing good extracted files are reused; do not merge them back into the monolith.

File-size guidance:
- ordinary UI/controller: prefer <= 600-800 lines
- >800 lines: review whether two lifecycle/semantic owners exist
- >1000 lines: normally split before adding new features
- shell should not own semantic logic
- LOC is a maintainability alarm, not acceptance criteria

Dependency direction:

```text
Canonical/Application
        ↓
Document + Selection + Commands
        ↓
Projection/Timeline Geometry
        ↓
Interaction / Render Coordination
        ↓
UI composition
```

UI must not become canonical authority. Renderer must not own document semantics.

---

# Step 0 — Sync Git and isolate the work

Run:

```bash
git status --short --branch
```

If worktree is dirty: STOP. Do not reset/stash/clean/delete unrelated work. Report it.

Then:

```bash
git fetch origin --prune
git switch main
git pull --ff-only origin main
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

Require HEAD == origin/main and clean worktree.

Create an isolated branch from this exact latest main:

```bash
git switch -c refactor/claude-minimal-cycle-owners
```

Do not modify `codex-control`. Do not merge it into this branch.

Record baseline HEAD in `docs/refactor/MINIMAL_CYCLE_VIEW_REFACTOR_STATUS.md`. Create/update that status file as part of the first real implementation commit, not as a planning-only commit.

Backup: if branch exists, do not force-reset it. Inspect its base and either continue only if it is clearly the same refactor branch and clean, or create `refactor/claude-minimal-cycle-owners-v2`.

---

# Step 1 — Establish behavior fences before structural edits

Inspect package scripts once and record the exact commands used.

Before changing production code, run baseline checks:

- editor TypeScript typecheck
- `git diff --check`
- focused editor tests already covering transaction edit identity, selection, Undo/Redo, zoom/Fit/range, New/Open/Save where available
- focused real-browser smoke: initial render, select signal, open Bottom/Inspector, zoom/Fit, range selection, transaction select/edit, Undo/Redo

Do not rewrite Goldens/reference/threshold/masks.

Create missing characterization tests only for behavior that will be moved and is currently unprotected.

Backup: if broad suite has unrelated pre-existing failure, record exact baseline failure and continue only with focused tests that were green before the refactor. Do not silently fix unrelated failures in this branch.

---

# Step 2 — Application / Command / History owner

Do this first because the rest of the system should depend on a stable semantic API.

Scope:
- `CanonicalSnapshot` state/publication
- `CommandHistorySession`
- `execute`, `executeBatch`
- Undo / Redo
- HistoryState publication
- dirty semantics
- validation/runtime diagnostics publication that is directly tied to command execution
- `EditorApplicationRuntime` bridge where already applicable

Method:
1. Create the owner seam **in the current file first** or as a nearby hook only if it compiles immediately.
2. Route all command/history call sites through one owner API.
3. Remove duplicate direct parent implementations.
4. Test while ownership seam works.
5. Move the whole implementation to `application/use-editor-application-owner.ts`.

Desired API shape:

```ts
application.snapshot
application.history
application.execute(command)
application.executeBatch(id, commands)
application.undo()
application.redo()
application.replaceSession(...)
application.diagnostics
```

Do not expose dozens of individual setters as final API.

Success:
- MinimalCycleView no longer owns CommandHistorySession lifecycle directly
- semantic commands/undo/redo go through application owner
- Undo/Redo entry counts unchanged
- dirty unchanged
- focused tests + typecheck + diff-check pass

Commit/push this step before continuing.

Backup A: if Application owner is too coupled, split Step 2 into **Command/History owner only** first. Leave document replacement outside. Do not retreat to tiny UI extraction.

---

# Step 3 — Document Lifecycle owner

Scope:
- New
- Open / parse / resource-budget checks
- Save / Save As application behavior
- dirty decision / unsaved flow state required by application behavior
- document epoch / stale async protection
- atomic document/session replacement
- file input read lifecycle

Presentation dialogs may remain UI, but decisions/actions belong here.

Desired API:

```ts
documentLifecycle.requestNew()
documentLifecycle.requestOpen(text/file)
documentLifecycle.save()
documentLifecycle.saveAs(...)
documentLifecycle.confirmDiscard()
documentLifecycle.cancelPending()
documentLifecycle.pendingAction
documentLifecycle.isDirty
```

Success:
- no independent New/Open/Save semantic implementations remain in parent
- stale Open cannot overwrite a newer document
- unsaved workflow preserved
- command/history session replacement semantics preserved

Backup B: if dialog focus/state creates cycles, keep dialog visibility/focus in UI and expose only `pendingAction` + decision callbacks from lifecycle owner. Do not put DOM refs into the semantic document owner.

Commit/push.

---

# Step 4 — Selection owner, then Clipboard actions

Selection scope:
- selected signal(s)
- selected group/spacer/annotation/transaction
- authoritative selected IDs + refs needed for event handlers
- clear/select-all/select entity
- Bottom/Inspector synchronization
- selection decoration/projection inputs

Desired API:

```ts
selection.state
selection.selectSignal(...)
selection.selectTransaction(...)
selection.selectAnnotation(...)
selection.clear()
selection.selectAll()
selection.resolvePrimary()
```

After selection is stable, move clipboard separately:
- copy
- cut
- paste
- duplicate
- delete selection if it is semantically part of clipboard/edit commands

Success:
- parent does not maintain duplicate selectedId + selectedXRef synchronization logic
- Bottom/Inspector/Transaction lane point at same stable entity
- multi-select behavior preserved
- clipboard uses selection owner + application command API

Backup C: if Bottom/Inspector synchronization is tangled, first create one SelectionStore/owner in the same file and make every UI read from it; only then physically move it. Do not pass 20 setters into panels.

Commit/push selection, then clipboard may be a separate commit if warranted.

---

# Step 5 — Timeline Navigation owner

Scope only navigation/view mapping first:
- zoom state and scale publication
- Fit All
- Fit Selection
- Navigate to Cycle
- wheel zoom
- viewport scroll coordination
- ViewMetrics interactions needed for navigation
- existing `TimelineViewportRuntime` / navigation controller reuse

Desired API:

```ts
timelineNavigation.zoom
timelineNavigation.zoomBy(...)
timelineNavigation.setZoom(...)
timelineNavigation.fitAll()
timelineNavigation.fitSelection()
timelineNavigation.navigateToCycle(...)
```

Success:
- Ribbon/View buttons and keyboard/wheel paths use the same owner
- no second zoom implementation in parent
- arbitrary cycle navigation remains correct

Backup D: if DOM lifecycle is the blocker, keep the React `useEffect` that obtains mounted refs in MinimalCycleView, but move the controller implementation out and call `attach/detach` from the small effect.

Commit/push.

---

# Step 6 — Timeline Geometry / Range / Snap owner

Scope:
- DisplayTimeMapping access
- TimeAxisGeometry / LocalGeometryMap
- canonical cycle/boundary -> local X conversions
- range selection geometry
- transaction boundary resolution
- snap index/candidates/policy coordination
- ruler is presentation only; do not make DOM tick sampling semantic authority

Desired API:

```ts
timelineGeometry.sourceToLocal(...)
timelineGeometry.boundaryX(...)
timelineGeometry.resolveCycleAtX(...)
timelineGeometry.resolveRange(...)
timelineGeometry.snap(...)
```

Success:
- selection/range/transaction edits resolve from canonical mapping/geometry
- folded/long timelines remain correct
- Fit/Navigate/range use one geometry authority

Backup E: if geometry and render refresh are cyclic, keep geometry pure/read-only and make render coordinator subscribe/call it; geometry must not call renderer.

Commit/push.

---

# Step 7 — Timeline Interaction owner

Scope:
- pointer down/move/up
- drag lifecycle
- range drag
- annotation/transaction interactions
- tree drag/drop only if it shares the same interaction state; otherwise make a separate tree-interaction owner
- keyboard canvas interactions
- cancellation/Escape
- snapping calls
- listener attach/detach symmetry

Desired implementation can be a controller with explicit `attach()/detach()` rather than a giant React hook.

Success:
- one owner controls gesture lifecycle
- commit-on-drop/command behavior unchanged
- no document mutation during preview if old behavior forbids it
- mount/unmount does not duplicate listeners

Backup F: if a single interaction owner exceeds ~800 lines, split by semantic lifecycle:
- `timeline-pointer-controller.ts`
- `range-drag-controller.ts`
- `annotation-transaction-drag-controller.ts`
- `keyboard-interaction-controller.ts`

Do not split by arbitrary line count.

Commit/push.

---

# Step 8 — Render Coordinator owner

Scope:
- waveform surface/provider creation
- renderer mount/update/dispose
- viewport projection/window publication
- grid/ruler/playhead/range/overlay presentation refresh coordination
- render invalidation
- render diagnostics/errors

Renderer reads application/timeline/selection ports. It does not own Canonical state.

Success:
- mount/unmount symmetry
- one render refresh path
- no duplicate renderer instances/listeners
- overlays and transactions still align with waveform

Backup G: if React refs prevent full hook extraction, keep only the host/ref acquisition effect in shell and move all non-hook runtime implementation to a controller class/module.

Commit/push.

---

# Step 9 — Workspace UI state owner

Move non-semantic UI state as one coherent hook:
- ribbonTab / bottomTab / viewMode
- density / workspace preset
- visibility toggles
- pane widths/heights and resize lifecycle
- follow selection / bottom pinning UI state
- Inspector/Bottom reset tokens
- dialog visibility/origin presentation state where appropriate

Use `use-workspace-ui-state.ts`.

Success:
- shell no longer contains dozens of independent UI useState/useRef declarations
- semantic owners do not import workspace UI state except through explicit read-only inputs when necessary

Backup H: if dialog state is too specialized, leave dialogs out and move only workspace/pane/tab state first. Dialog composition gets its own UI owner in Step 10.

Commit/push.

---

# Step 10 — UI composition split

Now split presentation because core ownership seams exist.

Create/reuse:
- `ui/editor-shell-view.tsx`
- `ui/signal-tree-panel.tsx`
- `ui/bottom-editor-panel.tsx`
- `ui/inspector-shell.tsx`
- `ui/editor-dialogs.tsx`

Reuse existing:
- Ribbon
- Title Bar
- Ribbon Tabs
- InspectorPanel
- ContextMenuPanel/Surface
- existing editor components

Pass grouped ports:

```tsx
<EditorShellView
  application={application}
  documentLifecycle={documentLifecycle}
  selection={selection}
  timelineNavigation={timelineNavigation}
  timelineGeometry={timelineGeometry}
  interactions={interactions}
  renderer={renderer}
  workspace={workspace}
/>
```

Do not create a 100-scalar-prop interface. Do not introduce React Context unless there is demonstrated 3+ level prop drilling that grouped ports cannot reasonably handle.

Home Ribbon DOM/CSS/order/test IDs are frozen.

Success:
- UI files own presentation, not semantic state
- old UI JSX deleted from MinimalCycleView
- no wrapper around duplicate old implementation

Backup I: if one panel is very coupled, keep that panel in `editor-shell-view.tsx` temporarily while the other panels move; do not stop the entire campaign. The coupled panel becomes the next closed responsibility.

Commit/push.

---

# Step 11 — Reduce MinimalCycleView to shell

Final shell should approximately do:

```tsx
export function MinimalCycleView() {
  const application = useEditorApplicationOwner(...);
  const documentLifecycle = useDocumentLifecycle(application, ...);
  const selection = useSelectionOwner(application, ...);
  const timelineNavigation = useTimelineNavigation(...);
  const timelineGeometry = useTimelineGeometry(...);
  const interactions = useTimelineInteractions(...);
  const renderer = useRenderCoordinator(...);
  const workspace = useWorkspaceUiState(...);

  return <EditorShellView ... />;
}
```

It may contain top-level integration effects that truly require multiple owners, but no implementation-sized workflows.

Do not chase a fixed LOC number. If shell is >~600 lines, inspect what responsibility is still implemented there and extract that responsibility, not random helpers.

Success:
- no duplicated old/new implementations
- all major stateful responsibilities have explicit owners
- dependency direction is explainable
- future features have an obvious destination

Commit/push.

---

# Step 12 — Post-refactor verification

After all structural steps, run and record:

## Static/build
- clean `git status`
- typecheck PASS
- build PASS if available
- `git diff --check` PASS
- no circular import warnings/errors

## Focused semantic behavior
- create/edit/delete signal/entity
- command executes exactly once
- Undo exactly restores previous state
- Redo restores edited state
- Dirty changes exactly as before
- validation/problems refresh

## Selection/UI synchronization
- Signal Tree selection
- Canvas/wave selection
- Bottom Editor
- Inspector
- Transaction lane
- Context menu target
- multi-select if supported

All must reference the same canonical stable IDs.

## Timeline
- zoom in/out
- direct zoom value
- Fit All
- Fit Selection
- Navigate to arbitrary long-timeline cycle
- terminal boundary
- range select/edit
- fold/axis-break cases if supported
- transaction boundaries
- snapping

## Interaction lifecycle
- pointer drag preview
- drop commits once
- Escape cancels
- Undo after drag
- repeated mount/unmount or route reload does not duplicate listeners

## File lifecycle
- New clean document
- Open valid document
- Open invalid/oversized document behavior
- unsaved New/Open Cancel/Discard/Save path
- Save
- Save As
- stale async open cannot overwrite newer document

## Renderer/presentation
- waveform renders
- ruler/grid/playhead/range align
- annotations align
- transactions align
- minimap where enabled
- no runtime render errors

## Ribbon / visuals
- Home Ribbon DOM/order/appearance unchanged
- stable test IDs unchanged
- do not modify Golden/reference/threshold/masks merely to pass
- compare existing focused visual tests against baseline

## Performance sanity
- long timeline opens and interacts without obvious regression
- no one DOM ruler tick per cycle regression if virtualization/sampling is intended
- no duplicate event listener/render loop growth after repeated interactions

## Architecture inspection
Confirm each question is YES:
- Does Canonical/Application own semantic state?
- Does Command/History have one path?
- Is Document Lifecycle separate from dialog presentation?
- Is Selection a single source of truth?
- Is Timeline Geometry independent of DOM ruler sampling?
- Are interactions isolated from renderer ownership?
- Does Renderer consume state rather than own semantics?
- Is UI mostly presentation/composition?
- Is MinimalCycleView shell/orchestration only?
- Is every previous implementation deleted after its new owner becomes production path?

## File-size/growth inspection
Run line counts for the touched files and record them in the status document. Treat these as maintenance guidance:
- shell ideally 250-450
- ordinary owner ideally 300-700
- interaction/render owner <=800 preferred
- >1000 requires explicit justification or responsibility split

No acceptance failure solely because a file is 20 lines over guidance.

---

# Step 13 — Integration strategy

Do not directly merge this risky branch merely because typecheck passes.

Before integration:
1. Rebase/merge latest `origin/main` into the refactor branch using the project's normal policy.
2. Resolve conflicts by preserving newer product behavior from main.
3. Re-run Step 12 completely.
4. Review `git diff origin/main...HEAD` for accidental functional changes.
5. Confirm no Golden/Home Ribbon workaround.
6. Only then merge to main.

If main moved significantly during the refactor and conflicts are widespread, do not manually choose old refactor code over newer features. Re-apply owner seams to the newest code responsibility-by-responsibility.

---

# Global backup strategy

If any single step fails:

Plan A: repair the explicit owner seam in the same file.

Plan B: reduce to a smaller **closed responsibility** (e.g. Command/History rather than all Application), never to arbitrary 10-line helpers.

Plan C: use grouped ports/read-only callbacks to break closure/cycles temporarily.

Plan D: keep React hook/effect shell local but move controller/runtime implementation out.

Plan E: if focused behavior cannot be restored in one concentrated session, revert only that uncommitted step to the previous green commit, record the blocker in the status document, skip to another independent responsibility if safe.

Plan F: if two consecutive responsibility steps are blocked by the same shared coupling, stop the refactor campaign rather than spending repeated sessions. Product work continues on main; return after that coupling has a test/seam.

Never use these as fallback:
- Golden/reference changes
- Home Ribbon redesign
- deleting tests
- broad `any` casts to hide ownership/type errors
- reset/stash/clean of unrelated work
- wrapper/scaffold with old implementation still active underneath and calling it "complete"

---

# Required report after every step

```text
Branch:
Base main SHA:
Current HEAD:

Step:
Responsibility:
Ownership transfer: COMPLETE / PARTIAL / BLOCKED
Production path uses new owner: YES / NO
Old direct implementation removed: YES / NO
Files changed:

Typecheck:
Focused tests:
Browser check:
git diff --check:

Commit:
Push:
Backup plan used: NONE / A / B / C / D / E / F
Remaining blocker:
Next step:
```

Do not report a tiny line movement as progress unless ownership actually changed.
