import type { Dispatch, KeyboardEvent, MouseEvent, MutableRefObject, ReactNode, RefObject, SetStateAction } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { HistoryState } from "@timing-chart-v2/history";
import type { Annotation, AnnotationId, Bookmark, CanonicalDocument, CommandId, DocumentProblem, GroupId, Signal, SignalGroup, SignalId, Transaction, TransactionId } from "@timing-chart-v2/schema";
import type { UiCommandRegistry } from "@timing-chart-v2/ui";
import type { EditorApplicationOwner } from "./application/use-editor-application-owner.js";
import type { EditorActions } from "./application/use-editor-actions.js";
import type { ClipboardActions } from "./application/clipboard-actions.js";
import { useEditorAiAssistantModel } from "./application/use-editor-ai-assistant-model.js";
import { AnnotationEditor } from "./annotation-editor.js";
import { AnnotationList } from "./annotation-list.js";
import { AIOperationPanel } from "./ai-operation-panel.js";
import { AdvancedJsonPanel } from "./advanced-json-panel.js";
import { BookmarkEditor } from "./bookmark-editor.js";
import { BottomEditorPanel } from "./minimal-cycle-view-panels.js";
import { SignalEditor } from "./editors/signal-editor.js";
import { SignalTreeColumnHeader } from "./minimal-cycle-view-panels.js";
import { TransactionEditor } from "./transaction-editor.js";
import { TransactionLanes } from "./runtime/transaction-lanes.js";
import { InspectorPanel } from "./panels/inspector-panel.js";
import { LegendView } from "./legend-view.js";
import { ProblemsPanel } from "./problems-panel.js";
import { useWorkspaceUiState, type BottomTab, type TreeTypeFilter, type ViewMode } from "./workspace/use-workspace-ui-state.js";
import { createEditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import { refreshAnnotationPreview, refreshClockPreview, refreshGroupStylePreview } from "./runtime/presentation-preview.js";
import type { ContextMenuState } from "./workspace/use-dialog-menu-state.js";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Ref<T> = RefObject<T | null>;

export interface EditorSecondarySurfacesInput {
  readonly document: CanonicalDocument;
  readonly revision: number;
  readonly history: HistoryState;
  readonly problem: string;
  readonly diagnostics: readonly DocumentProblem[];
  readonly refs: {
    readonly host: Ref<HTMLDivElement>;
    readonly viewport: Ref<HTMLDivElement>;
    readonly menuOriginRef: MutableRefObject<HTMLElement | null>;
    readonly transactionBoundaryX: MutableRefObject<(cycle: number) => number | undefined>;
    readonly snapTransactionCycle: MutableRefObject<(clientX: number) => number | undefined>;
  };
  readonly command: {
    readonly registry: MutableRefObject<UiCommandRegistry>;
    readonly execute: (command: SemanticCommand) => CommandResult;
    readonly undo: () => CommandResult;
    readonly redo: () => CommandResult;
    readonly executeBatch: (id: CommandId, commands: readonly SemanticCommand[]) => CommandResult;
    readonly nextCommandId: (operation: string) => CommandId;
  };
  readonly selected: {
    readonly signal: Signal | undefined;
    readonly group: SignalGroup | undefined;
    readonly annotation: Annotation | undefined;
    readonly transaction: Transaction | undefined;
    readonly bookmark: Bookmark | undefined;
    readonly transactionId: TransactionId | undefined;
  };
  readonly bottom: {
    readonly signal: Signal | undefined;
    readonly group: SignalGroup | undefined;
    readonly annotation: Annotation | undefined;
    readonly transaction: Transaction | undefined;
  };
  readonly timeline: {
    readonly range: Readonly<{ start: number; end: number }>;
    readonly collapsedGroupIds: ReadonlySet<GroupId>;
    readonly setCollapsedGroups: (next: ReadonlySet<GroupId>) => void;
    readonly toggleCollapsedGroup: (id: GroupId) => void;
  };
  readonly workspace: {
    readonly viewMode: ViewMode;
    readonly bottomTabs: readonly BottomTab[];
    readonly bottomTab: BottomTab;
    readonly setBottomTab: (tab: BottomTab) => void;
    readonly selectBottomTab: (tab: BottomTab) => void;
    readonly onBottomTabKeyDown: (event: KeyboardEvent<HTMLButtonElement>, tab: BottomTab) => void;
    readonly followSelection: boolean;
    readonly setFollowSelection: (value: boolean) => void;
    readonly bottomPinned: boolean;
    readonly toggleBottomPin: () => void;
    readonly treeFilter: string;
    readonly setTreeFilter: (value: string) => void;
    readonly treeTypeFilter: TreeTypeFilter;
    readonly setTreeTypeFilter: (value: TreeTypeFilter) => void;
    readonly transactionTreeFilter: string;
    readonly setTransactionTreeFilter: (value: string) => void;
    readonly setRibbonTab: (tab: string) => void;
  };
  readonly dialog: {
    readonly treeAddMenuOpen: boolean;
    readonly setTreeAddMenuOpen: Setter<boolean>;
    readonly treeMoreMenuOpen: boolean;
    readonly setTreeMoreMenuOpen: Setter<boolean>;
    readonly bulkRegistrationText: string;
    readonly setBulkRegistrationText: (value: string) => void;
    readonly bulkRegistrationGroupId: GroupId | undefined;
    readonly setBulkRegistrationGroupId: (value: GroupId | undefined) => void;
    readonly bulkRegistrationStatus: string;
    readonly setBulkRegistrationStatus: (value: string) => void;
    readonly setBulkRegistrationVisible: (value: boolean) => void;
    readonly setHierarchyVisible: (value: boolean) => void;
    readonly contextMenu: ContextMenuState | undefined;
    readonly setContextMenu: (value: ContextMenuState | undefined) => void;
    readonly closeTreeAddMenu: () => void;
    readonly closeTreeMoreMenu: () => void;
    readonly bottomResetToken: number;
    readonly setBottomResetToken: Setter<number>;
    readonly inspectorResetToken: number;
    readonly setInspectorResetToken: Setter<number>;
    readonly setInspectorVisible: (value: boolean) => void;
  };
  readonly annotationTargetSignalId: SignalId | undefined;
  readonly referenceClockName: string | undefined;
  readonly zoom: number;
  readonly editActions: ClipboardActions;
  readonly actions: EditorActions;
  readonly setRuntimeDiagnostics: EditorApplicationOwner["setRuntimeDiagnostics"];
  readonly navigateProblem: (path: string) => void;
  readonly ai: { readonly getZoom: () => number; readonly fitAll: () => void };
}

export interface EditorSecondarySurfacesOutput {
  readonly surfaceCommands: ReturnType<typeof createEditorSurfaceCommandController>;
  readonly workspaceHeader: ReactNode;
  readonly workspaceViewportContent: ReactNode;
  readonly workspaceViewportLegend: ReactNode;
  readonly workspaceBottom: ReactNode;
  readonly workspaceInspector: ReactNode;
  readonly aiBridgeStatus: "disabled" | "connecting" | "connected" | "error";
}

export function useEditorSecondarySurfaces(input: EditorSecondarySurfacesInput): EditorSecondarySurfacesOutput {
  const execute = input.command.execute;
  const surfaceCommands = createEditorSurfaceCommandController(input.command);
  const undo = input.command.undo;
  const redo = input.command.redo;
  const { selected, bottom, workspace, dialog, refs } = input;
  const { aiBridgeStatus, ...aiAssistantPanel } = useEditorAiAssistantModel({
    document: input.document,
    revision: input.revision,
    selectedSignalId: input.annotationTargetSignalId,
    selectedGroupId: selected.group?.id,
    selectedAnnotationId: selected.annotation?.id,
    selectedTransactionId: selected.transactionId,
    range: input.timeline.range,
    onCommand: execute,
    onCommandBatch: (commands) => input.command.executeBatch(input.command.nextCommandId("ribbon_annotation_arrange"), commands),
    getZoom: input.ai.getZoom,
    onFitAll: input.ai.fitAll,
    onOpenTimeline: () => workspace.setRibbonTab("Timeline"),
    setRuntimeDiagnostics: input.setRuntimeDiagnostics,
  });
  const openTransactionContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    refs.menuOriginRef.current = event.currentTarget;
    dialog.setContextMenu({ x: event.clientX, y: event.clientY, target: "transaction" });
  };
  const signalEditor = <SignalEditor
    key={`${bottom.signal?.id ?? "none"}:${input.revision}:${dialog.bottomResetToken}`}
    signal={bottom.signal}
    cycleCount={input.document.timeline.cycleCount}
    bookmarks={input.document.bookmarks}
    history={input.history}
    groups={input.document.signalGroups}
    problem={input.problem}
    onUndo={undo}
    onRedo={redo}
    onVisibility={input.editActions.setSignalVisibility}
    onDelete={input.actions.deleteBottomSignal}
    onDuplicate={(signalId) => {
      const source = input.document.signals.find((item) => item.id === signalId);
      const group = source === undefined ? undefined : input.document.signalGroups.find((candidate) => candidate.rows.includes(signalId));
      if (source && group) input.actions.createCopiedSignals([{ signal: source, groupId: group.id, index: group.rows.indexOf(signalId) }], "duplicate", "source-group");
    }}
    onCancel={() => dialog.setBottomResetToken((value) => value + 1)}
    onDropToGroup={input.actions.moveTreeItemToGroup}
    onClockPreview={(draft) => { const currentHost = refs.host.current; if (currentHost && bottom.signal?.type === "clock") refreshClockPreview(currentHost, bottom.signal, draft, input.document.timeline.cycleCount); }}
    clockCommands={surfaceCommands}
    signalCommands={surfaceCommands}
  />;
  const annotationEditor = bottom.annotation ? <AnnotationEditor
    key={`${bottom.annotation.id}:${input.revision}:${dialog.bottomResetToken}`}
    annotation={bottom.annotation}
    annotations={input.document.annotations}
    document={input.document}
    history={input.history}
    problem={input.problem}
    onSelect={input.actions.selectAnnotation}
    onCreate={input.actions.createSelectedAnnotationForType}
    onDuplicate={input.actions.duplicateAnnotation}
    commands={surfaceCommands}
    onReplaceDocument={input.actions.replaceDocument}
    onUndo={undo}
    onRedo={redo}
    onDelete={input.actions.deleteBottomAnnotation}
    onCancel={() => dialog.setBottomResetToken((value) => value + 1)}
    onPreview={(draft) => refreshAnnotationPreview(refs.host.current!, bottom.annotation!.id, draft, { label: bottom.annotation!.label, color: bottom.annotation!.color, opacity: bottom.annotation!.opacity })}
  /> : <><AnnotationList annotations={input.document.annotations} selectedId={undefined} onSelect={input.actions.selectAnnotation} commands={surfaceCommands} /><div className="empty-editor">Select or create an Annotation.</div></>;
  const transactionEditor = <TransactionEditor
    key={`${bottom.transaction?.id ?? "none"}:${input.revision}:${dialog.bottomResetToken}`}
    transaction={bottom.transaction}
    document={input.document}
    history={input.history}
    onSelect={input.actions.selectTransaction}
    commands={surfaceCommands}
    onUndo={undo}
    onRedo={redo}
    onDelete={input.actions.deleteBottomTransaction}
    onCancel={() => dialog.setBottomResetToken((value) => value + 1)}
  />;
  const bookmarkEditor = <BookmarkEditor
    key={`${selected.bookmark?.id ?? "none"}:${input.revision}:${dialog.bottomResetToken}`}
    bookmark={selected.bookmark}
    document={input.document}
    history={input.history}
    range={input.timeline.range}
    onSelect={input.actions.selectBookmark}
    onReveal={input.actions.revealBookmark}
    onNavigateBookmark={input.actions.navigateToBookmark}
    commands={surfaceCommands}
    onUndo={undo}
    onRedo={redo}
    onDelete={input.actions.deleteBottomBookmark}
    onCancel={() => dialog.setBottomResetToken((value) => value + 1)}
  />;
  const workspaceHeader = <SignalTreeColumnHeader
    treeTypeFilter={workspace.treeTypeFilter}
    onTreeTypeFilterChange={(value) => workspace.setTreeTypeFilter(value as TreeTypeFilter)}
    treeFilter={workspace.treeFilter}
    onTreeFilterChange={workspace.setTreeFilter}
    onClearTreeFilter={() => workspace.setTreeFilter("")}
    addMenuOpen={dialog.treeAddMenuOpen}
    onToggleAddMenu={(origin) => { refs.menuOriginRef.current = origin; dialog.setTreeAddMenuOpen((value) => !value); }}
    moreMenuOpen={dialog.treeMoreMenuOpen}
    onToggleMoreMenu={(origin) => { refs.menuOriginRef.current = origin; dialog.setTreeMoreMenuOpen((value) => !value); }}
    onAddEntity={input.actions.addTreeEntity}
    onCloseAddMenu={dialog.closeTreeAddMenu}
    onOpenBulkRegistration={() => { dialog.setBulkRegistrationGroupId(input.document.signalGroups.at(-1)?.id); dialog.setBulkRegistrationVisible(true); }}
    onCollapseAllGroups={() => input.timeline.setCollapsedGroups(new Set(input.document.signalGroups.map((group) => group.id)))}
    onExpandAllGroups={() => input.timeline.setCollapsedGroups(new Set())}
    onOpenHierarchy={() => dialog.setHierarchyVisible(true)}
    onCloseMoreMenu={dialog.closeTreeMoreMenu}
    timeScaleLabel={workspace.viewMode === "Transaction"
      ? (input.document.transactionTimeScale
        ? `Time Scale: 1 TC = ${input.document.transactionTimeScale.clockCyclesPerTransactionCycle} Cycle${input.document.transactionTimeScale.clockCyclesPerTransactionCycle === 1 ? "" : "s"}`
        : "Time Scale: 1 TC = 1 Cycle")
      : input.document.timeline.referenceClock ? `Time Scale: Cycle    Reference: ${input.referenceClockName ?? input.document.timeline.referenceClock}` : "Time Scale: Cycle    Axis: Time"}
    transactionMode={workspace.viewMode === "Transaction" ? { filter: workspace.transactionTreeFilter, onFilterChange: workspace.setTransactionTreeFilter, onAdd: input.actions.createTransaction, onAddGroup: input.actions.createTransactionGroup } : undefined}
  />;
  const workspaceViewportContent = workspace.viewMode !== "Cycle" && <TransactionLanes document={input.document} zoom={input.zoom} selectedId={selected.transactionId} filter={workspace.viewMode === "Transaction" ? workspace.transactionTreeFilter : ""} getBoundaryX={(cycle) => refs.transactionBoundaryX.current(cycle)} onSelect={input.actions.selectTransaction} onSnap={(clientX) => refs.snapTransactionCycle.current(clientX)} commands={surfaceCommands} onContextMenu={openTransactionContextMenu} />;
  const workspaceViewportLegend = <LegendView document={input.document} commands={surfaceCommands} />;
  const workspaceBottom = <BottomEditorPanel
    tabs={workspace.bottomTabs}
    activeTab={workspace.bottomTab}
    onSelectTab={workspace.selectBottomTab}
    onTabKeyDown={workspace.onBottomTabKeyDown}
    followSelection={workspace.followSelection}
    onFollowSelectionChange={workspace.setFollowSelection}
    pinned={workspace.bottomPinned}
    onTogglePinned={workspace.toggleBottomPin}
    summary={<div className="left-panel-tail"><span data-testid="left-tree-signal-count">{input.document.signals.length} signals</span>{selected.signal && <span className="scope-breadcrumb" data-testid="scope-breadcrumb">Scope: {selected.signal.source.instancePath.length ? selected.signal.source.instancePath.join(" / ") : "(root)"}</span>}</div>}
    content={workspace.bottomTab === "Signal" ? signalEditor : workspace.bottomTab === "Annotation" ? annotationEditor : workspace.bottomTab === "Transaction" ? transactionEditor : workspace.bottomTab === "Bookmarks" ? bookmarkEditor : workspace.bottomTab === "AI" ? <AIOperationPanel {...aiAssistantPanel} /> : workspace.bottomTab === "Problems" ? <ProblemsPanel diagnostics={input.diagnostics} onNavigate={input.navigateProblem} /> : <AdvancedJsonPanel document={input.document} selectedSignal={bottom.signal} selectedGroup={bottom.group} selectedAnnotation={bottom.annotation} selectedTransaction={bottom.transaction} onReplaceDocument={input.actions.replaceDocument} onDiagnostic={(next) => { const nextDiagnostics = next === undefined ? [] : Array.isArray(next) ? next : [next]; input.setRuntimeDiagnostics((current) => [...current.filter((item) => !item.detail?.startsWith("advanced-json:")), ...nextDiagnostics]); }} />}
  />;
  const workspaceInspector = <InspectorPanel key={`${selected.signal?.id ?? selected.group?.id ?? selected.annotation?.id ?? selected.transaction?.id ?? selected.bookmark?.id ?? "none"}:${input.revision}:${dialog.inspectorResetToken}`} signal={selected.signal} group={selected.group} annotation={selected.annotation} transaction={selected.transaction} bookmark={selected.bookmark} collapsedGroup={selected.group !== undefined && input.timeline.collapsedGroupIds.has(selected.group.id)} onToggleGroupCollapse={selected.group === undefined ? undefined : () => input.timeline.toggleCollapsedGroup(selected.group!.id)} registry={input.command.registry.current} document={input.document} viewport={refs.viewport} commands={surfaceCommands} onReveal={input.actions.revealSelectedInHierarchy} onCancel={() => { if (selected.group) refreshGroupStylePreview(refs.host.current!, selected.group.id, selected.group.style); dialog.setInspectorResetToken((value) => value + 1); }} onClose={() => dialog.setInspectorVisible(false)} onDeleteBookmark={input.actions.deleteBottomBookmark} onToggleTransactionSignal={input.actions.toggleTransactionSignal} onGroupPreview={(groupId, style) => refreshGroupStylePreview(refs.host.current!, groupId, style ?? input.document.signalGroups.find((group) => group.id === groupId)?.style)} />;
  return { surfaceCommands, workspaceHeader, workspaceViewportContent, workspaceViewportLegend, workspaceBottom, workspaceInspector, aiBridgeStatus };
}
