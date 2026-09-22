import { useMemo, useState } from "react";
import type { Annotation, AnnotationGroup, AnnotationGroupId, AnnotationId, AnnotationType, BookmarkId, CanonicalDocument, ClockSignal, CommentRow, DocumentProblem, GroupId, JsonObject, SignalId, SignalRole, SpacerId, TimeGroupId, TransactionGroup, TransactionId, ValueSignal } from "@timing-chart-v2/schema";
import { FontStyleToolbar } from "./font-style-toolbar.js";
import { ArrangeGroup } from "./arrange-group.js";
import { FindReplacePanel } from "./find-replace-panel.js";
import { TransactionTimeScalePanel } from "./transaction-time-scale-panel.js";
import { annotationPropertiesBase } from "./annotation-style-command.js";
import type { HistoryState } from "@timing-chart-v2/history";
import { DsIconBox, DsRibbonButton, DsRibbonGroup, DsRibbonSelect, DsRibbonToggle, DsRibbonToggleButton } from "./design-system.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { RibbonGroup } from "./ribbon-group.js";
import type { RibbonGroupSpec } from "./ribbon-schema.js";
import { composeRibbon } from "./ribbon-composition.js";
import type { ActiveContext } from "./workspace/use-workspace-ui-state.js";
import { InsertSemanticIcon } from "./insert-semantic-icon.js";
import { SIGNAL_TYPE_OPTIONS, signalTypeDefinition, signalTypeLabel } from "./runtime/signal-type-registry.js";
import { AnnotationToolbar } from "./annotation-toolbar.js";
import { ReviewWorkflow } from "./review-workflow.js";
import { TimelineToolbar } from "./timeline-toolbar.js";
import { createAnnotation } from "./create-annotation.js";
import { NEW_DOCUMENT_POLICY_DESCRIPTION } from "./file-document-controller.js";
import { nextEntityId } from "./entity-id.js";
import { resolveGroupInsertionIndex, resolveInsertionTarget } from "./insertion-target.js";
import type { AIViewIntent } from "./ai-proposal-provider.js";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { HomeOverflow } from "./ribbon/home-overflow.js";
import { buildTransactionRibbonGroups } from "./ribbon/transaction-ribbon-groups.js";
import { buildSignalRibbonGroups } from "./ribbon/signal-ribbon-groups.js";
import { buildCommonRibbonGroups } from "./ribbon/common-ribbon-groups.js";
import { buildViewRibbonGroups } from "./ribbon/view-ribbon-groups.js";

type DensityMode = "compact" | "comfortable";
type WorkspacePreset = "waveform" | "edit" | "review" | "transaction";
const signalId = (value: string) => value as SignalId;
const groupId = (value: string) => value as GroupId;
const spacerId = (value: string) => value as SpacerId;
function valueSignal(id: string, name: string, role: SignalRole, values: ValueSignal["values"], options: Pick<ValueSignal, "type" | "width" | "displayFormat"> = { type: "binary" }): ValueSignal {
  return { id: signalId(id), name, role, type: options.type, source: { instancePath: ["dut"], signalName: name.toLowerCase() }, display: { name }, values, ...(options.width === undefined ? {} : { width: options.width }), ...(options.displayFormat === undefined ? {} : { displayFormat: options.displayFormat }) };
}

export { Ribbon };

function Ribbon({ tab, document, revision, range, history, zoom, gridEnabled, snapEnabled, rulerEnabled, minimapEnabled, signalSplitEnabled, onToggleSignalSplit, selectedCycle, cursorA, cursorB, onSetCursorA, onSetCursorB, onClearCursors, onSwapCursors, showSignalNames, showRoles, showAnnotations, showTransactions, showGroupBackground, signalTreeVisible, inspectorVisible, bottomVisible, bottomHeight, onSetBottomSize, arrowPickStatus, selectedSignalId, selectedInsertionSignalId, selectedGroupId, selectedAnnotation, selectedAnnotationIds, selectedCommentRow, problemsCount, diagnostics, onNavigateProblem, onRefreshChecks, onDiagnostic, viewMode, activeContext, density, workspacePreset, onDensityChange, onWorkspacePresetChange, onResetLayout, selectedTransactionId, clipboardStatus, clipboardAvailable, hasSelectedSignal, hasSelectedClipboard, hasSelectedEntity, hasDeletableSelection, canRenameSelection, canMoveUp, canMoveDown, canShowSelection, canHideSelection, onSignalCreated, onGroupCreated, onSpacerCreated, onTransactionCreated, onRange, onViewIntent, onCreateAnnotation, onArrowPick, onZoom, onFitSelection, onFitAll, onSetZoom, onNavigateBookmark, onToggleGrid, onToggleSnap, onToggleRuler, onToggleMinimap, onToggleSignalNames, onToggleRoles, onToggleAnnotations, onToggleTransactions, onToggleGroupBackground, onToggleSignalTree, onUndo, onRedo, onDelete, onNew, onOpen, onSave, onSaveAs, onRecent, onProperties, onExport, onToggleInspector, onToggleBottom, onShowProblems, onCopy, onCut, onPaste, onDuplicate, onRename, onClearSelection, onSelectAll, onMoveUp, onMoveDown, onVisibility, onOpenTimeline, onOpenProperties, onOpenBookmarks, onOpenAIAssistant, aiBridgeStatus, commands }: {
  readonly tab: string; readonly document: CanonicalDocument; readonly revision: number; readonly range: { readonly start: number; readonly end: number }; readonly history: HistoryState; readonly zoom: number; readonly gridEnabled: boolean; readonly snapEnabled: boolean; readonly rulerEnabled: boolean; readonly minimapEnabled: boolean; readonly signalSplitEnabled: boolean; readonly onToggleSignalSplit: () => void;
  // #431/#459: Cursor A/B -- source-time workspace state (never
  // Canonical/History/Dirty), same "current cycle" the status bar's own
  // "Cycle N" reads. `cursorA`/`cursorB` are undefined when unset.
  readonly selectedCycle: number; readonly cursorA: number | undefined; readonly cursorB: number | undefined; readonly onSetCursorA: () => void; readonly onSetCursorB: () => void; readonly onClearCursors: () => void; readonly onSwapCursors: () => void;
  readonly showSignalNames: boolean; readonly showRoles: boolean; readonly showAnnotations: boolean; readonly showTransactions: boolean; readonly showGroupBackground: boolean; readonly signalTreeVisible: boolean; readonly inspectorVisible: boolean; readonly bottomVisible: boolean; readonly bottomHeight: number; readonly onSetBottomSize: (size: "hidden" | "compact" | "expanded") => void; readonly arrowPickStatus: "idle" | "from" | "to"; readonly selectedSignalId: SignalId | undefined; readonly selectedInsertionSignalId: SignalId | undefined; readonly selectedGroupId: GroupId | undefined; readonly selectedAnnotation: Annotation | undefined; readonly selectedAnnotationIds: ReadonlySet<AnnotationId>; readonly selectedCommentRow: CommentRow | undefined; readonly problemsCount: number; readonly diagnostics: readonly { readonly code: string; readonly path: string; readonly message: string }[]; readonly onNavigateProblem: (path: string) => void; readonly onRefreshChecks: () => void; readonly onDiagnostic: (diagnostic: DocumentProblem | readonly DocumentProblem[] | undefined) => void; readonly viewMode: "Cycle" | "Transaction" | "Split"; readonly activeContext: ActiveContext; readonly density: DensityMode; readonly workspacePreset: WorkspacePreset; readonly onDensityChange: (density: DensityMode) => void; readonly onWorkspacePresetChange: (preset: WorkspacePreset) => void; readonly onResetLayout: () => void; readonly selectedTransactionId: TransactionId | undefined;
  readonly clipboardStatus: string; readonly clipboardAvailable: boolean; readonly hasSelectedSignal: boolean; readonly hasSelectedClipboard: boolean; readonly hasSelectedEntity: boolean; readonly hasDeletableSelection: boolean; readonly canRenameSelection: boolean; readonly canMoveUp: boolean; readonly canMoveDown: boolean; readonly canShowSelection: boolean; readonly canHideSelection: boolean;
  // Same "select the thing that was just created" contract the Left Tree's
  // own +Add button already follows: without it, Ribbon Insert leaves
  // whatever was selected before in place, so the newly inserted row isn't
  // immediately reachable for rename/edit without an extra manual click.
  readonly onSignalCreated: (signalId: SignalId) => void; readonly onGroupCreated: (groupId: GroupId) => void; readonly onSpacerCreated: (groupId: GroupId, spacerId: SpacerId) => void; readonly onTransactionCreated: (transactionId: TransactionId) => void;
  readonly onRange: (range: { start: number; end: number }) => void; readonly onViewIntent: (intent: AIViewIntent) => void; readonly onCreateAnnotation: (annotation: Annotation) => void; readonly onArrowPick: (annotationType: "arrow" | "dependency") => void; readonly onZoom: (delta: number) => void; readonly onFitSelection: () => void; readonly onFitAll: () => void; readonly onSetZoom: (zoom: number) => void; readonly onNavigateBookmark: (cycle: number, bookmarkId?: BookmarkId) => void; readonly commands: EditorSurfaceCommandController;
  readonly onToggleGrid: () => void; readonly onToggleSnap: () => void; readonly onToggleRuler: () => void; readonly onToggleMinimap: () => void; readonly onToggleSignalNames: () => void; readonly onToggleRoles: () => void; readonly onToggleAnnotations: () => void; readonly onToggleTransactions: () => void; readonly onToggleGroupBackground: () => void; readonly onToggleSignalTree: () => void; readonly onUndo: () => void; readonly onRedo: () => void; readonly onDelete: () => void; readonly onNew: () => void; readonly onOpen: () => void; readonly onSave: () => void; readonly onSaveAs: () => void; readonly onRecent: () => void; readonly onProperties: () => void; readonly onExport: () => void; readonly onToggleInspector: () => void; readonly onToggleBottom: () => void; readonly onShowProblems: () => void; readonly onCopy: () => void; readonly onCut: () => void; readonly onPaste: () => void; readonly onDuplicate: () => void; readonly onRename: () => void; readonly onClearSelection: () => void; readonly onSelectAll: () => void; readonly onMoveUp: () => void; readonly onMoveDown: () => void; readonly onVisibility: (visible: boolean) => void; readonly onOpenTimeline: () => void; readonly onOpenProperties: () => void; readonly onOpenBookmarks: () => void; readonly onOpenAIAssistant: () => void; readonly aiBridgeStatus: "disabled" | "connecting" | "connected" | "error";
}) {
  const [compactCycleCount] = useState(2);
  const hasSelectableSignals = useMemo(() => document.signals.some((signal) => signal.type !== "commentRow"), [document]);
  // #400: Pulse is no longer an independently creatable Signal type -- single/
  // finite/periodic pulses are produced through the Signal Generator instead.
  // `type: "pulse"` remains fully supported for documents that already have
  // it (schema/migration/rendering/export are all unchanged); this function
  // is the *creation* path, which simply no longer offers it.
  const insertValueSignal = (type: "binary" | "bus" | "state" | "logic" | "event") => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    const id = nextEntityId("signal", document);
    const name = type === "event" ? `${type.toUpperCase()}_${document.signals.length + 1}` : `SIGNAL_${document.signals.length + 1}`;
    const signal = type === "bus" ? valueSignal(id, name, "internal", [{ start: 0, value: "00" }], { type: "bus", width: 8, displayFormat: "hex" })
      : type === "state" ? valueSignal(id, name, "internal", [{ start: 0, value: "IDLE" }], { type: "state" })
      : type === "event" ? valueSignal(id, name, "internal", [{ start: 0, value: "NONE" }], { type: "event" })
      : valueSignal(id, name, "internal", [{ start: 0, value: 0 }], { type });
    const result = commands.createSignal(signal, target.group.id, target.index);
    if (result.ok) onSignalCreated(signalId(id));
  };
  const insertClockSignal = () => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    const id = signalId(nextEntityId("signal", document));
    const name = `CLOCK_${document.signals.length + 1}`;
    const signal: ClockSignal = { id, name, type: "clock", role: "internal", source: { instancePath: [], signalName: name }, display: { name }, generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } };
    const result = commands.createSignal(signal, target.group.id, target.index);
    if (result.ok) onSignalCreated(id);
  };
  const insertGroup = () => {
    const id = groupId(nextEntityId("group", document));
    const result = commands.createGroup({ id, name: `Group ${document.signalGroups.length + 1}`, rows: [] }, resolveGroupInsertionIndex(document, selectedInsertionSignalId, selectedGroupId));
    if (result.ok) onGroupCreated(id);
  };
  const insertCommentRow = () => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    const id = signalId(nextEntityId("commentRow", document));
    const name = `Comment ${document.signals.length + 1}`;
    const commentRow: CommentRow = { id, type: "commentRow", name, role: "internal", source: { instancePath: [], signalName: name }, display: { name }, title: name, body: "" };
    const result = commands.createCommentRow(commentRow, target.group.id, target.index);
    if (result.ok) onSignalCreated(id);
  };
  const insertSpacer = () => {
    const target = resolveInsertionTarget(document, selectedInsertionSignalId, selectedGroupId);
    if (!target) return;
    const id = spacerId(nextEntityId("spacer", document));
    const result = commands.insertSpacer({ id, height: 24 }, target.group.id, target.index);
    if (result.ok) onSpacerCreated(target.group.id, id);
  };
  const insertAnnotation = (type: AnnotationType) => {
    if (!selectedSignalId) return;
    onCreateAnnotation(createAnnotation(type, selectedSignalId, range, document));
  };
  // Same "range" annotation type/anchors as the plain Range/Bracket buttons,
  // just with a bidirectional arrowhead instead of none -- a <----> span
  // indicator, no new schema field needed (Annotation.arrowhead already
  // supports "bidirectional").
  const insertRangeArrow = () => {
    if (!selectedSignalId) return;
    onCreateAnnotation(createAnnotation("arrow", selectedSignalId, range, document, undefined, "bidirectional"));
  };
  // #406: Home Ribbon's group set now depends on ActiveContext (#404/#405)
  // rather than always showing every group regardless of Cycle/Transaction
  // ViewMode. Time/Layout (Cycle-specific row/timeline-range commands) only
  // appear for the Signal context.
  //
  // Scoped decision: the issue's own "Required behavior" table lists
  // Transaction (Create/Duplicate) as a Transaction-context-only group,
  // which would hide it while in Cycle ViewMode. That conflicts with an
  // established, already-tested product workflow -- creating a Transaction
  // from the Ribbon while still in Cycle view (transaction-export.spec.ts's
  // `createTransaction` helper and every test built on it) -- so Transaction
  // stays in the common bucket here rather than being hidden per the
  // issue's literal text. Flagging this rather than silently breaking that
  // workflow or reinterpreting the issue unilaterally either way. Delete/
  // Rename for a selected Transaction already ride on the common Edit
  // group's existing hasDeletableSelection/canRenameSelection gating (both
  // already support a selected Transaction). Phase/Lane/Linked-Signals
  // editing already has a real, always-reachable entry point independent
  // of the Ribbon (the Bottom "Transaction" tab, visible in every
  // ViewMode) -- not reimplemented as separate Ribbon buttons here to
  // avoid a second, divergent entry point to the same TransactionEditor
  // state.
  const commonRibbonGroups: readonly RibbonGroupSpec[] = [
    ...buildCommonRibbonGroups({ document, history, viewMode, activeContext, commands, clipboardStatus, clipboardAvailable, hasSelectedClipboard, hasDeletableSelection, hasSelectableSignals, gridEnabled, snapEnabled, rulerEnabled, minimapEnabled, onNew, onOpen, onSave, onSaveAs, onUndo, onRedo, onCut, onCopy, onPaste, onDelete, onDuplicate, onSelectAll, onZoom, onSetZoom, onFitAll, onFitSelection, onToggleGrid, onToggleSnap, onToggleRuler, onToggleMinimap }),
    ...buildTransactionRibbonGroups({ document, range, commands, selectedTransactionId, onTransactionCreated, viewMode, activeContext }),
  ];
  const signalRibbonGroups: readonly RibbonGroupSpec[] = buildSignalRibbonGroups({ document, range, commands, compactCycleCount, canMoveUp, canMoveDown, onMoveUp, onMoveDown });
  // Transaction group now lives in commonRibbonGroups (see the scoped-
  // decision comment above) -- no Transaction-only group exists yet, but
  // the bucket stays wired through composeRibbon so a real one (Phase/
  // Lane-specific commands, say) can be added later without re-threading
  // the ActiveContext plumbing again.
  const transactionRibbonGroups: readonly RibbonGroupSpec[] = [];
  const homeGroups: readonly RibbonGroupSpec[] = composeRibbon({ common: commonRibbonGroups, bySignal: signalRibbonGroups, byTransaction: transactionRibbonGroups }, { viewMode, activeContext }, ["file", "edit", "timeline", "view", "transaction", "transaction-group", "transaction-time", "layout", "display"]);
  // View tab visual-consistency fix: previously hand-written per-button
  // JSX with its own one-off sizing (tile-shaped toggle buttons, a fixed
  // 3-column grid, an unstyled native <select> that fell through to the
  // OS's `color-scheme: dark` default) -- none of it routed through the
  // same RibbonGroup/DsRibbonButton primitives every other tab (File/
  // Edit/Zoom/Annotation/...) already shares. Rebuilt as ordinary
  // RibbonGroupSpec groups so View gets the exact same button width/
  // icon size/caption placement as Home for free, with no second style
  // to keep in sync. Item kinds without a direct schema equivalent
  // (icon-toggle buttons, the Zoom% picker, the Workspace/Density
  // selects) use `kind: "custom"`, the same escape hatch Edit's Find &
  // Replace panel already uses -- not a new pattern.
  const viewGroups: readonly RibbonGroupSpec[] = buildViewRibbonGroups({ viewMode, zoom, selectedCycle, cursorA, cursorB, gridEnabled, snapEnabled, rulerEnabled, minimapEnabled, signalSplitEnabled, showSignalNames, showRoles, showAnnotations, showTransactions, showGroupBackground, signalTreeVisible, inspectorVisible, bottomVisible, bottomHeight, density, workspacePreset, onToggleSignalSplit, onSetBottomSize, onSetCursorA, onSetCursorB, onClearCursors, onSwapCursors, onZoom, onSetZoom, onFitAll, onFitSelection, onToggleGrid, onToggleSnap, onToggleRuler, onToggleMinimap, onToggleSignalNames, onToggleRoles, onToggleAnnotations, onToggleTransactions, onToggleGroupBackground, onToggleSignalTree, onToggleInspector, onToggleBottom, onDensityChange, onWorkspacePresetChange, onResetLayout });
  // Arrange group targets: the current multi-selection if there is one,
  // otherwise the single selected Annotation, otherwise nothing (every
  // Arrange handler stays undefined -> ArrangeGroup renders disabled).
  const arrangeTargetIds: readonly AnnotationId[] = selectedAnnotationIds.size > 0 ? [...selectedAnnotationIds] : selectedAnnotation ? [selectedAnnotation.id] : [];
  const arrangeGroup = arrangeTargetIds.length > 0 ? (document.annotationGroups ?? []).find((group) => group.annotationIds.includes(arrangeTargetIds[0]!)) : undefined;
  // #332 item D: these reasons must distinguish "nothing selected" from an
  // implemented control that is merely unavailable for the current
  // selection -- never fall back to a generic "Not yet implemented" for a
  // control that has real, wired-up behavior.
  const arrangeReasons = arrangeTargetIds.length === 0 ? { unavailableReason: "Select at least one annotation" } : {
    groupUnavailableReason: arrangeGroup ? "Selected annotations are already grouped" : arrangeTargetIds.length < 2 ? "Select at least 2 annotations" : undefined,
    ungroupUnavailableReason: arrangeGroup ? undefined : "Selected annotations are not grouped",
    alignUnavailableReason: arrangeTargetIds.length < 2 ? "Select at least 2 annotations" : undefined,
    matchSpanUnavailableReason: arrangeTargetIds.length < 2 ? "Select at least 2 annotations" : "Select at least 2 compatible range annotations",
  };
  const arrangeHandlers = arrangeTargetIds.length === 0 ? {} : {
    onBringToFront: () => commands.bringAnnotationsToFront(arrangeTargetIds),
    onSendToBack: () => commands.sendAnnotationsToBack(arrangeTargetIds),
    onRotateRight: () => commands.rotateAnnotations(arrangeTargetIds.map((annotationId) => ({ annotationId, rotation: (((document.annotations.find((item) => item.id === annotationId)?.rotation ?? 0) + 90) % 360 + 360) % 360 }))),
    onRotateLeft: () => commands.rotateAnnotations(arrangeTargetIds.map((annotationId) => ({ annotationId, rotation: (((document.annotations.find((item) => item.id === annotationId)?.rotation ?? 0) - 90) % 360 + 360) % 360 }))),
    ...(arrangeTargetIds.length >= 2 && !arrangeGroup ? { onGroup: () => commands.createAnnotationGroup({ id: nextEntityId("annotationGroup", document) as AnnotationGroupId, annotationIds: arrangeTargetIds } satisfies AnnotationGroup) } : {}),
    ...(arrangeGroup ? { onUngroup: () => commands.deleteAnnotationGroup(arrangeGroup.id) } : {}),
    // Align brings every selected Annotation's label onto the same row
    // (matches the first selected id's labelOffset.y) -- reuses the
    // existing single-annotation annotation.updateLabelOffset command,
    // just batched, rather than inventing a new command type for it.
    ...(arrangeTargetIds.length >= 2 ? { onAlign: () => {
      const targets = arrangeTargetIds.flatMap((id) => { const found = document.annotations.find((item) => item.id === id); return found ? [found] : []; });
      const reference = targets[0];
      if (targets.length < 2 || !reference) return;
      const referenceY = reference.labelOffset?.y ?? -14;
      commands.alignAnnotationLabels(targets.map((annotation) => ({ annotationId: annotation.id, x: annotation.labelOffset?.x ?? 0, y: referenceY })));
    } } : {}),
    // #378: executeBatch is atomic (one no-op command fails the WHOLE
    // batch, packages/history/src/session.ts's executeBatch) -- a mixed
    // selection (some already locked, some not) used to silently lock/
    // unlock NOTHING, since annotation.setLocked rejects a target already
    // at the requested state. Pre-filter to only the ids that actually
    // change, and disable+explain when every selected annotation is
    // already at the requested state, matching #332's disabled-reason
    // convention rather than presenting an enabled control with no effect.
    ...(arrangeTargetIds.some((id) => !(document.annotations.find((item) => item.id === id)?.locked ?? false)) ? { onLock: () => commands.setAnnotationsLocked(arrangeTargetIds.filter((id) => !(document.annotations.find((item) => item.id === id)?.locked ?? false)), true) } : { lockUnavailableReason: "Selected annotation(s) are already locked" }),
    ...(arrangeTargetIds.some((id) => document.annotations.find((item) => item.id === id)?.locked ?? false) ? { onUnlock: () => commands.setAnnotationsLocked(arrangeTargetIds.filter((id) => document.annotations.find((item) => item.id === id)?.locked ?? false), false) } : { unlockUnavailableReason: "Selected annotation(s) are already unlocked" }),
    // Same width: match every OTHER selected annotation's start-end cycle
    // span to the first selected one's. Types without start/end (arrow,
    // callout, marker, ...) are silently skipped rather than failing the
    // whole batch, since a mixed selection is common.
    ...(arrangeTargetIds.length >= 2 ? (() => {
      const targets = arrangeTargetIds.flatMap((id) => { const found = document.annotations.find((item) => item.id === id); return found ? [found] : []; });
      const reference = targets.find((item) => item.start && item.end);
      const spanCycles = reference?.start && reference.end ? reference.end.cycle - reference.start.cycle : undefined;
      const rest = spanCycles === undefined ? [] : targets.filter((item) => item.id !== reference?.id && item.start && item.end);
      return spanCycles === undefined || rest.length === 0 ? {} : { onMatchSpan: () => commands.matchAnnotationSpans(rest.map((annotation) => ({ annotationId: annotation.id, spanCycles }))) };
    })() : {}),
  };
  return <section className="ribbon" aria-label={`${tab} Ribbon`} data-testid="ribbon">
    {tab === "File" && <div className="ribbon-group file-group">
      <button type="button" className="ribbon-tool" title={NEW_DOCUMENT_POLICY_DESCRIPTION} onClick={onNew}><RibbonIcon name="i-new" /><span>New</span></button>
      <button type="button" className="ribbon-tool" onClick={onOpen}><RibbonIcon name="i-open" /><span>Open</span></button>
      <button type="button" className="ribbon-tool" onClick={onSave}><RibbonIcon name="i-save" /><span>Save</span></button>
      <button type="button" className="ribbon-tool" onClick={onSaveAs}><RibbonIcon name="i-save" /><span>Save As</span></button>
      <div className="ribbon-toggles"><button type="button" onClick={onRecent} title="Open the most recently saved document">Recent</button><button type="button" onClick={onProperties} title={`${document.document.title} · ${document.signals.length} signals`}>Properties</button><button type="button" onClick={onExport}>Export</button></div><b>File</b>
    </div>}
      {tab === "Home" && <>
      {homeGroups.map((group) => <RibbonGroup key={group.id} spec={group} available={density === "compact" ? "small" : "large"} />)}
      <div className="ribbon-major-group" data-major-group="Options" data-ribbon-home aria-label="Options commands">
        <DsRibbonGroup ariaLabel="Options" className="home-options-group" label="Options">
          <HomeOverflow history={history} hasSelectableSignals={hasSelectableSignals} hasSelectedClipboard={hasSelectedClipboard} clipboardAvailable={clipboardAvailable} hasDeletableSelection={hasDeletableSelection} canRenameSelection={canRenameSelection} canMoveUp={canMoveUp} canMoveDown={canMoveDown} canShowSelection={canShowSelection} canHideSelection={canHideSelection} onNew={onNew} onOpen={onOpen} onSave={onSave} onSaveAs={onSaveAs} onRecent={onRecent} onUndo={onUndo} onRedo={onRedo} onCopy={onCopy} onCut={onCut} onPaste={onPaste} onDuplicate={onDuplicate} onDelete={onDelete} onRename={onRename} onClearSelection={onClearSelection} onSelectAll={onSelectAll} onVisibility={onVisibility} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onZoom={onZoom} onSetZoom={onSetZoom} onFitSelection={onFitSelection} onFitAll={onFitAll} onToggleGrid={onToggleGrid} onToggleSnap={onToggleSnap} onToggleRuler={onToggleRuler} onToggleMinimap={onToggleMinimap} onProperties={onProperties} onShowProblems={onShowProblems} onExport={onExport} onOpenTimeline={onOpenTimeline} />
        </DsRibbonGroup>
      </div>
    </>}
    {tab === "Insert" && <div className="insert-ribbon insert-group" data-testid="insert-ribbon">
      <div className="ribbon-major-group insert-slot-group" data-major-group="Signals" aria-label="Signals commands"><DsRibbonGroup ariaLabel="Signals" className="insert-signals-group" density="compact-grid" label="Signals">
        {SIGNAL_TYPE_OPTIONS.flatMap(({ type }) => {
          if (type === "pulse") return [];
          const definition = signalTypeDefinition(type);
          const button = <DsRibbonButton key={type} icon={<InsertSemanticIcon kind={definition.icon} />} onClick={() => insertValueSignal(type)}>{definition.label}</DsRibbonButton>;
          return type === "binary" ? [button, <DsRibbonButton key="clock" icon={<InsertSemanticIcon kind="clock" />} onClick={insertClockSignal}>{signalTypeLabel("clock")}</DsRibbonButton>] : [button];
        })}
      </DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="Structure" aria-label="Structure commands"><DsRibbonGroup ariaLabel="Structure" className="insert-structure-group" density="compact-grid" label="Structure"><DsRibbonButton icon={<RibbonIcon name="i-group" />} onClick={insertGroup}>Group</DsRibbonButton><DsRibbonButton icon={<RibbonIcon name="i-spacing" />} onClick={insertSpacer}>Spacer</DsRibbonButton></DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="Annotation" aria-label="Annotation commands"><DsRibbonGroup ariaLabel="Annotation" className="insert-annotation-group" density="compact-grid" label="Annotation">
        <DsRibbonButton icon={<RibbonIcon name="i-comment" />} onClick={insertCommentRow}>Comment</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="marker" />} onClick={() => insertAnnotation("marker")}>Marker</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="range" />} onClick={() => insertAnnotation("range")}>Range</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="text" />} onClick={() => insertAnnotation("text")}>Text</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="dependency" />} onClick={() => insertAnnotation("dependency")}>Dependency</DsRibbonButton>
      </DsRibbonGroup></div>
      <div className="ribbon-major-group insert-slot-group" data-major-group="More" aria-label="More Insert commands"><DsRibbonGroup ariaLabel="More" className="insert-more-group" density="compact-grid" label="More">
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="measurement" />} onClick={() => insertAnnotation("measurement")}>Measurement</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="highlight" />} onClick={() => insertAnnotation("highlight")}>Highlight</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="bracket" />} onClick={() => insertAnnotation("bracket")}>Bracket</DsRibbonButton>
        <DsRibbonButton disabled={!selectedSignalId} icon={<InsertSemanticIcon kind="verticalLine" />} onClick={() => insertAnnotation("verticalLine")}>Vertical Line</DsRibbonButton>
      </DsRibbonGroup></div>
    </div>}
    {tab === "Timeline" && <TimelineToolbar document={document} range={range} history={history} onUndo={onUndo} onRedo={onRedo} onRange={onRange} commands={commands} onNavigateBookmark={onNavigateBookmark} onOpenBookmarks={onOpenBookmarks} />}
    {tab === "Annotation" && <>
      <div className="ribbon-group annotation-group"><AnnotationToolbar document={document} range={range} signalId={selectedSignalId} onCreate={onCreateAnnotation} arrowPickStatus={arrowPickStatus} onArmArrow={onArrowPick} /><b>Annotation</b></div>
      {/* Scope decision (#331): Ribbon Font intentionally edits only the
          selected Annotation, Comment Row, or multi-Annotation selection --
          it does NOT reach normal Signal labels (those already have their
          own dedicated styling route through the Signal Inspector's Label
          Style section). The title below states that scope explicitly
          rather than leaving an unstyled Signal selection's disabled Font
          group looking like an unexplained bug. */}
      <div className="ribbon-major-group" data-major-group="Font" aria-label="Font commands" title={selectedAnnotation || selectedCommentRow ? undefined : "Font applies to a selected Annotation or Comment Row (not Signal labels, which have their own styling in the Inspector)."}>
        <DsRibbonGroup ariaLabel="Font" className="annotation-font-group" label="Font">
          <FontStyleToolbar
            idPrefix="ribbon-annotation-font"
            disabled={!selectedAnnotation && !selectedCommentRow}
            style={selectedAnnotation?.style ?? selectedCommentRow?.display.style}
            onChange={(style: JsonObject) => {
              // Multi-selection Font editing: apply the same style change to
              // every selected Annotation as one atomic batch (the same
              // selectedAnnotationIds set Arrange already batches against),
              // each preserving its OWN other properties via
              // buildAnnotationStyleCommand's live per-annotation lookup --
              // not just the primary/first selected one.
              if (selectedAnnotationIds.size > 1) {
                commands.updateAnnotationStyles(document.annotations.filter((item) => selectedAnnotationIds.has(item.id)).map((item) => ({ annotationId: item.id, ...annotationPropertiesBase(item), style })));
              } else if (selectedAnnotation) commands.updateAnnotationStyle({ annotationId: selectedAnnotation.id, ...annotationPropertiesBase(selectedAnnotation), style });
              else if (selectedCommentRow) commands.updateCommentRowStyle(selectedCommentRow.id, selectedCommentRow, style);
            }}
          />
        </DsRibbonGroup>
      </div>
      <div className="ribbon-major-group" data-major-group="Shapes" aria-label="Shape commands" title={selectedSignalId ? undefined : "Select a Signal row to insert a shape/annotation there"}>
        <DsRibbonGroup ariaLabel="Shapes" className="annotation-shapes-group" label="Shapes">
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-arrow-annotation" />} onClick={() => insertAnnotation("arrow")}>Arrow</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-range-arrow" />} onClick={insertRangeArrow}>Range</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-brace" />} onClick={() => insertAnnotation("bracket")}>Brace</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-callout" />} onClick={() => insertAnnotation("callout")}>Callout</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-rectangle" />} onClick={() => insertAnnotation("rectangle")}>Rectangle</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-ellipse" />} onClick={() => insertAnnotation("ellipse")}>Ellipse</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-connector" />} onClick={() => insertAnnotation("connector")}>Connector</DsRibbonButton>
          <DsRibbonButton disabled={!selectedSignalId} icon={<RibbonIcon name="i-textbox" />} onClick={() => insertAnnotation("textbox")}>Text Box</DsRibbonButton>
        </DsRibbonGroup>
      </div>
      <div className="ribbon-major-group" data-major-group="Paragraph" aria-label="Paragraph commands" title={selectedAnnotation ? undefined : "Select an Annotation to change alignment"}>
        <DsRibbonGroup ariaLabel="Paragraph" className="annotation-paragraph-group" label="Paragraph">
          <DsRibbonButton ariaLabel="Align left" disabled={!selectedAnnotation} icon={<RibbonIcon name="i-align-left" />} onClick={() => selectedAnnotation && commands.setAnnotationAlign(selectedAnnotation.id, "left")}>Left</DsRibbonButton>
          <DsRibbonButton ariaLabel="Align center" disabled={!selectedAnnotation} icon={<RibbonIcon name="i-align-center" />} onClick={() => selectedAnnotation && commands.setAnnotationAlign(selectedAnnotation.id, "center")}>Center</DsRibbonButton>
          <DsRibbonButton ariaLabel="Align right" disabled={!selectedAnnotation} icon={<RibbonIcon name="i-align-right" />} onClick={() => selectedAnnotation && commands.setAnnotationAlign(selectedAnnotation.id, "right")}>Right</DsRibbonButton>
        </DsRibbonGroup>
      </div>
      <div className="ribbon-major-group" data-major-group="Arrange" aria-label="Arrange commands">
        <DsRibbonGroup ariaLabel="Arrange" className="annotation-arrange-group" label="Arrange">
          <ArrangeGroup {...arrangeHandlers} {...arrangeReasons} />
        </DsRibbonGroup>
      </div>
    </>}
    {tab === "View" && viewGroups.map((group) => <RibbonGroup key={group.id} spec={group} available={density === "compact" ? "small" : "large"} />)}
    {tab === "Review" && <div className="ribbon-group review-group"><ReviewWorkflow diagnostics={diagnostics} document={document} selectedSignalId={selectedSignalId} selectedGroupId={selectedGroupId} onNavigate={onNavigateProblem} onShowProblems={onShowProblems} onRefreshChecks={onRefreshChecks} /><output data-testid="review-problems-count">{problemsCount}</output><b>Review</b></div>}
    {tab === "AI" && <>
      {/* #395 PR1: the full query/preview/apply surface (AIOperationPanel)
          moved to the Bottom Panel's own "AI Assistant" tab -- same
          relocation this codebase already uses for Transaction/Bookmarks
          (see onOpenBookmarks). Ask/Edit is the one entry point; it opens
          that Bottom tab rather than duplicating the proposal/apply owner
          here. The status line is truthful about what's actually
          connected today -- there is no external Claude/Codex bridge
          implemented yet (see #395), so it never claims one. */}
      <div className="ribbon-major-group ai-group" data-major-group="Assistant" aria-label="AI Assistant commands">
        <DsRibbonGroup ariaLabel="Assistant" className="ai-assistant-group" label="Assistant">
          <DsRibbonButton ariaLabel="Ask or edit with the AI Assistant" icon={<RibbonIcon name="i-ai" />} onClick={onOpenAIAssistant} title="Open the AI Assistant in the Bottom Panel to preview, validate and apply a proposal">Ask / Edit</DsRibbonButton>
        </DsRibbonGroup>
      </div>
      <div className="ribbon-major-group" data-major-group="Provider" aria-label="AI provider status">
        <DsRibbonGroup ariaLabel="Provider" className="ai-provider-group" label="Provider">
          <output className="ai-provider-status" data-testid="ai-provider-status">Local deterministic (offline) · {aiBridgeStatus === "connected" ? "external agent connected" : aiBridgeStatus === "connecting" ? "connecting to bridge…" : aiBridgeStatus === "error" ? "bridge connection failed" : "no external agent connected"}</output>
        </DsRibbonGroup>
      </div>
    </>}
  </section>;
}
