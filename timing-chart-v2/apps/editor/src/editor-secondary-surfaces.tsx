import { useCallback } from "react";
import { createPortal } from "react-dom";
import type {
  Dispatch,
  KeyboardEvent,
  MouseEvent,
  MutableRefObject,
  ReactNode,
  RefObject,
  SetStateAction,
} from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { HistoryState } from "@timing-chart-v2/history";
import type {
  Annotation,
  AnnotationId,
  Bookmark,
  CanonicalDocument,
  CommandId,
  DocumentProblem,
  GroupId,
  Signal,
  SignalGroup,
  SignalId,
  Transaction,
  TransactionId,
} from "@timing-chart-v2/schema";
import type { UiCommandRegistry } from "@timing-chart-v2/ui";
import type { EditorApplicationOwner } from "./application/use-editor-application-owner.js";
import type { EditorActions } from "./application/use-editor-actions.js";
import type { PendingSelectionChange, SelectionChangeGuard } from "./application/use-selection-owner.js";
import type { ClipboardActions } from "./application/clipboard-actions.js";
import type { TransactionTreeFilterMode } from "./workspace/use-workspace-ui-state.js";
import { useEditorAiAssistantModel } from "./application/use-editor-ai-assistant-model.js";
import { AnnotationCollectionPanel } from "./annotation-collection-panel.js";
import { AIOperationPanel } from "./ai-operation-panel.js";
import { AdvancedJsonPanel } from "./advanced-json-panel.js";
import { BookmarkEditor } from "./bookmark-editor.js";
import { BottomEditorPanel } from "./minimal-cycle-view-panels.js";
import { SignalEditor } from "./editors/signal-editor.js";
import { SignalTreeColumnHeader } from "./minimal-cycle-view-panels.js";
import { TransactionEditor } from "./transaction-editor.js";
import { TransactionLanes } from "./runtime/transaction-lanes.js";
import { TransactionSignalTree } from "./transaction-signal-tree.js";
import { TransactionTree } from "./transaction-tree.js";
import {
  TransactionLinkedSummary,
  TransactionPhaseSummary,
} from "./transaction-bottom-tabs.js";
import { InspectorPanel } from "./panels/inspector-panel.js";
import { LegendView } from "./legend-view.js";
import { ProblemsPanel } from "./problems-panel.js";
import {
  type ActiveContext,
  useWorkspaceUiState,
  type BottomTab,
  type TreeTypeFilter,
  type ViewMode,
} from "./workspace/use-workspace-ui-state.js";
import { createEditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import {
  refreshAnnotationPreview,
  refreshClockPreview,
  refreshGroupStylePreview,
} from "./runtime/presentation-preview.js";
import type { ContextMenuState } from "./workspace/use-dialog-menu-state.js";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Ref<T> = RefObject<T | null>;

export interface EditorSecondarySurfacesInput {
  readonly document: CanonicalDocument;
  readonly documentEpoch: number;
  readonly revision: number;
  readonly transactionPresentationRevision: number;
  readonly history: HistoryState;
  readonly problem: string;
  readonly registerSelectionChangeGuard: (guard: SelectionChangeGuard) => () => void;
  readonly pendingSelectionChange: PendingSelectionChange | undefined;
  readonly confirmPendingSelectionChange: () => void;
  readonly cancelPendingSelectionChange: () => void;
  readonly diagnostics: readonly DocumentProblem[];
  readonly refs: {
    readonly host: Ref<HTMLDivElement>;
    readonly viewport: Ref<HTMLDivElement>;
    readonly menuOriginRef: MutableRefObject<HTMLElement | null>;
    readonly transactionBoundaryX: MutableRefObject<
      (cycle: number) => number | undefined
    >;
    readonly snapTransactionCycle: MutableRefObject<
      (clientX: number, surfaceLeft?: number) => number | undefined
    >;
  };
  readonly command: {
    readonly registry: MutableRefObject<UiCommandRegistry>;
    readonly execute: (command: SemanticCommand) => CommandResult;
    readonly undo: () => CommandResult;
    readonly redo: () => CommandResult;
    readonly executeBatch: (
      id: CommandId,
      commands: readonly SemanticCommand[],
    ) => CommandResult;
    readonly nextCommandId: (operation: string) => CommandId;
  };
  readonly selected: {
    readonly signal: Signal | undefined;
    readonly signalIds: ReadonlySet<SignalId>;
    readonly group: SignalGroup | undefined;
    readonly annotation: Annotation | undefined;
    readonly transaction: Transaction | undefined;
    readonly transactionIds: ReadonlySet<TransactionId>;
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
    readonly activeContext: ActiveContext;
    readonly bottomTabs: readonly BottomTab[];
    readonly bottomTab: BottomTab;
    readonly setBottomTab: (tab: BottomTab) => void;
    readonly selectBottomTab: (tab: BottomTab) => void;
    readonly onBottomTabKeyDown: (
      event: KeyboardEvent<HTMLButtonElement>,
      tab: BottomTab,
    ) => void;
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
    readonly transactionTreeFilterMode: TransactionTreeFilterMode;
    readonly setTransactionTreeFilterMode: (
      value: TransactionTreeFilterMode,
    ) => void;
    readonly transactionTreeTab: "transactions" | "signals";
    readonly setTransactionTreeTab: (tab: "transactions" | "signals") => void;
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
  readonly surfaceCommands: ReturnType<
    typeof createEditorSurfaceCommandController
  >;
  readonly workspaceHeader: ReactNode;
  readonly workspaceTransactionTree: ReactNode;
  readonly workspaceViewportContent: ReactNode;
  readonly workspaceViewportLegend: ReactNode;
  readonly workspaceBottom: ReactNode;
  readonly workspaceInspector: ReactNode;
  readonly aiBridgeStatus: "disabled" | "connecting" | "connected" | "error";
}

export function useEditorSecondarySurfaces(
  input: EditorSecondarySurfacesInput,
): EditorSecondarySurfacesOutput {
  const execute = input.command.execute;
  const surfaceCommands = createEditorSurfaceCommandController(input.command);
  const undo = input.command.undo;
  const redo = input.command.redo;
  const { selected, bottom, workspace, dialog, refs } = input;
  // Inspector is a projection of the visible workspace context, not a second
  // selection owner. Preserve stable selections across mode switches, but do
  // not keep editing a hidden-mode entity until the user returns to it.
  const inspectorContext: ActiveContext = workspace.viewMode === "Split"
    ? workspace.activeContext
    : workspace.viewMode === "Transaction" && workspace.transactionTreeTab === "transactions"
      ? "Transaction"
      : "Signal";
  const inspectorSignal = inspectorContext === "Signal" ? selected.signal : undefined;
  const inspectorSignalIds = inspectorContext === "Signal" ? selected.signalIds : new Set<SignalId>();
  const inspectorGroup = inspectorContext === "Signal" ? selected.group : undefined;
  const inspectorAnnotation = inspectorContext === "Signal" ? selected.annotation : undefined;
  const inspectorTransaction = inspectorContext === "Transaction" ? selected.transaction : undefined;
  const inspectorSelectionKey = inspectorSignalIds.size > 1
    ? `multi:${inspectorSignalIds.size}`
    : inspectorSignal?.id ?? inspectorGroup?.id ?? inspectorAnnotation?.id ?? inspectorTransaction?.id ?? selected.bookmark?.id ?? "none";
  const { aiBridgeStatus, ...aiAssistantPanel } = useEditorAiAssistantModel({
    document: input.document,
    documentEpoch: input.documentEpoch,
    revision: input.revision,
    selectedSignalId: input.annotationTargetSignalId,
    selectedGroupId: selected.group?.id,
    selectedAnnotationId: selected.annotation?.id,
    selectedTransactionId: selected.transactionId,
    range: input.timeline.range,
    onCommand: execute,
    onCommandBatch: (commands) =>
      input.command.executeBatch(
        input.command.nextCommandId("ribbon_annotation_arrange"),
        commands,
      ),
    getZoom: input.ai.getZoom,
    onFitAll: input.ai.fitAll,
    onOpenTimeline: () => workspace.setRibbonTab("Timeline"),
    setRuntimeDiagnostics: input.setRuntimeDiagnostics,
  });
  const openTransactionContextMenu = (
    event: MouseEvent<HTMLButtonElement>,
    transactionId?: TransactionId,
  ) => {
    if (transactionId !== undefined)
      input.actions.selectTransaction(transactionId);
    refs.menuOriginRef.current = event.currentTarget;
    dialog.setContextMenu({
      x: event.clientX,
      y: event.clientY,
      target: "transaction",
    });
  };
  const signalEditor = (
    <SignalEditor
      key={`${input.documentEpoch}:${bottom.signal?.id ?? "none"}:${dialog.bottomResetToken}`}
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
        const source = input.document.signals.find(
          (item) => item.id === signalId,
        );
        const group =
          source === undefined
            ? undefined
            : input.document.signalGroups.find((candidate) =>
                candidate.rows.includes(signalId),
              );
        if (source && group)
          input.actions.createCopiedSignals(
            [
              {
                signal: source,
                groupId: group.id,
                index: group.rows.indexOf(signalId),
              },
            ],
            "duplicate",
            "source-group",
          );
      }}
      onCancel={() => dialog.setBottomResetToken((value) => value + 1)}
      onDropToGroup={input.actions.moveTreeItemToGroup}
      onClockPreview={(draft) => {
        const currentHost = refs.host.current;
        if (currentHost && bottom.signal?.type === "clock")
          refreshClockPreview(
            currentHost,
            bottom.signal,
            draft,
            input.document.timeline.cycleCount,
          );
      }}
      clockCommands={surfaceCommands}
      signalCommands={surfaceCommands}
      registerSelectionChangeGuard={input.registerSelectionChangeGuard}
      selectionFollowsBottom={input.workspace.followSelection && !input.workspace.bottomPinned}
    />
  );
  const annotationEditor = <AnnotationCollectionPanel
    annotations={input.document.annotations}
    selectedId={bottom.annotation?.id}
    document={input.document}
    onSelect={input.actions.selectAnnotation}
    onCreate={input.actions.createSelectedAnnotationForType}
    onDuplicate={input.actions.duplicateAnnotation}
    onDelete={input.actions.deleteBottomAnnotation}
    commands={surfaceCommands}
    onReplaceDocument={input.actions.replaceDocument}
  />;
  const transactionEditor = (
    <TransactionEditor
      key={`${input.documentEpoch}:${bottom.transaction?.id ?? "none"}:${dialog.bottomResetToken}`}
      transaction={bottom.transaction}
      selectedTransactionIds={selected.transactionIds}
      document={input.document}
      history={input.history}
      onSelect={input.actions.selectTransaction}
      commands={surfaceCommands}
      onUndo={undo}
      onRedo={redo}
      onDelete={input.actions.deleteBottomTransaction}
      onCancel={() => dialog.setBottomResetToken((value) => value + 1)}
      onToggleTransactionSignal={input.actions.toggleTransactionSignal}
    />
  );
  const bookmarkEditor = (
    <BookmarkEditor
      key={`${input.documentEpoch}:${selected.bookmark?.id ?? "none"}:${dialog.bottomResetToken}`}
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
    />
  );
  const workspaceHeader = (
    <SignalTreeColumnHeader
      treeTypeFilter={workspace.treeTypeFilter}
      onTreeTypeFilterChange={(value) =>
        workspace.setTreeTypeFilter(value as TreeTypeFilter)
      }
      treeFilter={workspace.treeFilter}
      onTreeFilterChange={workspace.setTreeFilter}
      onClearTreeFilter={() => workspace.setTreeFilter("")}
      addMenuOpen={dialog.treeAddMenuOpen}
      onToggleAddMenu={(origin) => {
        refs.menuOriginRef.current = origin;
        dialog.setTreeAddMenuOpen((value) => !value);
      }}
      moreMenuOpen={dialog.treeMoreMenuOpen}
      onToggleMoreMenu={(origin) => {
        refs.menuOriginRef.current = origin;
        dialog.setTreeMoreMenuOpen((value) => !value);
      }}
      onAddEntity={input.actions.addTreeEntity}
      onCloseAddMenu={dialog.closeTreeAddMenu}
      onOpenBulkRegistration={() => {
        dialog.setBulkRegistrationGroupId(
          input.document.signalGroups.at(-1)?.id,
        );
        dialog.setBulkRegistrationVisible(true);
      }}
      onCollapseAllGroups={() =>
        input.timeline.setCollapsedGroups(
          new Set(input.document.signalGroups.map((group) => group.id)),
        )
      }
      onExpandAllGroups={() => input.timeline.setCollapsedGroups(new Set())}
      onOpenHierarchy={() => dialog.setHierarchyVisible(true)}
      onCloseMoreMenu={dialog.closeTreeMoreMenu}
      timeScaleLabel={
        workspace.viewMode === "Transaction"
          ? (() => {
              // Transaction Mode GUI realignment: the reference mockup's own
              // Time Scale readout is "TRANSACTION CYCLE (TC) | REFERENCE:
              // SYSTEM CLOCK (1 TC = N cycles)" -- same underlying
              // `document.transactionTimeScale` data this already read, just a
              // clearer two-part label (what TC means, then what it maps to in
              // real clock cycles) instead of the terser "1 TC = N Cycles".
              const perTc =
                input.document.transactionTimeScale
                  ?.clockCyclesPerTransactionCycle ?? 1;
              return `Time Scale: Transaction Cycle (TC)    Reference: System Clock (1 TC = ${perTc} Cycle${perTc === 1 ? "" : "s"})`;
            })()
          : input.document.timeline.referenceClock
            ? `Time Scale: Cycle    Reference: ${input.referenceClockName ?? input.document.timeline.referenceClock}`
            : "Time Scale: Cycle    Axis: Time"
      }
      transactionMode={
        workspace.viewMode === "Transaction"
          ? {
              filter: workspace.transactionTreeFilter,
              onFilterChange: workspace.setTransactionTreeFilter,
              filterMode: workspace.transactionTreeFilterMode,
              onFilterModeChange: workspace.setTransactionTreeFilterMode,
              onAdd: input.actions.createTransaction,
              onAddGroup: input.actions.createTransactionGroup,
              tab: workspace.transactionTreeTab,
              onTabChange: workspace.setTransactionTreeTab,
            }
          : undefined
      }
    />
  );
  // #429/#397 P0-2: Transaction Mode's "Transactions | Signals" tabs -- the
  // Signals tab swaps in a real, separate Signal browse/select list (never
  // a fork of the Cycle Mode tree's own rendering, never a second selection
  // owner -- see TransactionSignalTree's own doc comment) in place of
  // TransactionLanes, at the exact same DOM slot.
  const transactionBoundaryX = useCallback(
    (cycle: number) => refs.transactionBoundaryX.current(cycle),
    [refs.transactionBoundaryX],
  );
  const workspaceViewportContent =
    workspace.viewMode !== "Cycle" &&
    (workspace.viewMode === "Transaction" &&
    workspace.transactionTreeTab === "signals" ? (
      <TransactionSignalTree
        document={input.document}
        selectedSignalId={selected.signal?.id}
        onSelectSignal={input.actions.selectHierarchySignal}
      />
    ) : (
      <TransactionLanes
        document={input.document}
        documentEpoch={input.documentEpoch}
        viewMode={workspace.viewMode}
        presentationRevision={input.transactionPresentationRevision}
        zoom={input.zoom}
        selectedId={selected.transactionId}
        selectedIds={selected.transactionIds}
        filter={
          workspace.viewMode === "Transaction"
            ? workspace.transactionTreeFilter
            : ""
        }
        getBoundaryX={transactionBoundaryX}
        onSelect={input.actions.selectTransaction}
        onSnap={(clientX, surfaceLeft) =>
          refs.snapTransactionCycle.current(clientX, surfaceLeft)
        }
        commands={surfaceCommands}
        onContextMenu={openTransactionContextMenu}
        bookmarks={input.document.bookmarks}
        onNavigateBookmark={input.actions.navigateToBookmark}
      />
    ));
  const workspaceViewportLegend = (
    <LegendView document={input.document} commands={surfaceCommands} />
  );
  const workspaceTransactionTree =
    // Combined ("Split") reuses the exact same production Transaction Tree
    // component as standalone Transaction Mode -- see #598-adjacent mockup
    // review: the left column becomes Transaction Tree (upper) stacked over
    // the Cycle Signal Tree (lower), never a second tree implementation.
    (workspace.viewMode === "Transaction" || workspace.viewMode === "Split") ? (
      <TransactionTree
        document={input.document}
        documentEpoch={input.documentEpoch}
        filter={workspace.transactionTreeFilter}
        filterMode={workspace.transactionTreeFilterMode}
        selectedIds={selected.transactionIds}
        {...(selected.transactionId === undefined
          ? {}
          : { selectedId: selected.transactionId })}
        onSelect={input.actions.selectTransaction}
        onDelete={() =>
          input.command.registry.current.execute("selection.delete")
        }
        onRenameGroup={input.actions.renameTransactionGroup}
        onMoveToGroup={(transactionId, groupId) => {
          surfaceCommands.moveTransactionToGroup(transactionId, groupId);
        }}
        onContextMenu={openTransactionContextMenu}
        onCreateTransaction={input.actions.createTransaction}
        onFocusTransaction={(transactionId) =>
          refs.viewport.current
            ?.querySelector<HTMLElement>(
              `[data-transaction-id="${CSS.escape(transactionId)}"]`,
            )
            ?.scrollIntoView({ block: "nearest", inline: "center" })
        }
        onSetVisibility={(transactionId, visible) => {
          input.actions.selectTransaction(transactionId);
          input.actions.setSelectionVisibility(visible);
        }}
        onSetGroupVisibility={(groupId, visible) => {
          const items = input.document.transactions.filter((transaction) => transaction.groupId === groupId);
          if (items.length === 0) return;
          input.actions.selectTransaction(items[0]!.id);
          items.slice(1).forEach((transaction) => input.actions.selectTransaction(transaction.id, true));
          input.actions.setSelectionVisibility(visible);
        }}
        onDeleteGroup={(groupId) => {
          surfaceCommands.deleteTransactionGroup(groupId);
        }}
        onDuplicateTransaction={(transactionId) => {
          input.actions.selectTransaction(transactionId);
          input.actions.duplicateSelectedEntity();
        }}
        onRenameTransaction={(transactionId, name) => surfaceCommands.renameTransactions([{ transactionId, name }])}
      />
    ) : null;
  const workspaceBottom = (
    <>
    <BottomEditorPanel
      tabs={workspace.bottomTabs}
      activeTab={workspace.bottomTab}
      onSelectTab={workspace.selectBottomTab}
      onTabKeyDown={workspace.onBottomTabKeyDown}
      followSelection={workspace.followSelection}
      onFollowSelectionChange={workspace.setFollowSelection}
      pinned={workspace.bottomPinned}
      onTogglePinned={workspace.toggleBottomPin}
      {...(workspace.bottomTab === "Annotation" ? { contentClassName: "bottom-content-annotation" } : {})}
      summary={
        <div className="left-panel-tail">
          <span data-testid="left-tree-signal-count">
            {input.document.signals.length} signals
          </span>
          {selected.signal && (
            <span className="scope-breadcrumb" data-testid="scope-breadcrumb">
              Scope:{" "}
              {selected.signal.source.instancePath.length
                ? selected.signal.source.instancePath.join(" / ")
                : "(root)"}
            </span>
          )}
        </div>
      }
      content={
        workspace.bottomTab === "Signal" ? (
          signalEditor
        ) : workspace.bottomTab === "Annotation" ? (
          annotationEditor
        ) : workspace.bottomTab === "Transaction" ? (
          transactionEditor
        ) : workspace.bottomTab === "Phases" ? (
          <TransactionPhaseSummary transaction={selected.transaction} />
        ) : workspace.bottomTab === "Linked Signals" ? (
          <TransactionLinkedSummary
            transaction={selected.transaction}
            document={input.document}
          />
        ) : workspace.bottomTab === "Bookmarks" ? (
          bookmarkEditor
        ) : workspace.bottomTab === "AI" ? (
          <AIOperationPanel {...aiAssistantPanel} />
        ) : workspace.bottomTab === "Problems" ? (
          <ProblemsPanel
            diagnostics={input.diagnostics}
            onNavigate={input.navigateProblem}
          />
        ) : (
          <AdvancedJsonPanel
            document={input.document}
            selectedSignal={bottom.signal}
            selectedGroup={bottom.group}
            selectedAnnotation={bottom.annotation}
            selectedTransaction={bottom.transaction}
            onReplaceDocument={input.actions.replaceDocument}
            onDiagnostic={(next) => {
              const nextDiagnostics =
                next === undefined ? [] : Array.isArray(next) ? next : [next];
              input.setRuntimeDiagnostics((current) => [
                ...current.filter(
                  (item) => !item.detail?.startsWith("advanced-json:"),
                ),
                ...nextDiagnostics,
              ]);
            }}
          />
        )
      }
    />
    {input.pendingSelectionChange && typeof window !== "undefined" && createPortal(
      <div className="modal-backdrop" data-testid="selection-change-confirmation">
        <section
          className="document-properties"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="selection-change-confirmation-title"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              input.cancelPendingSelectionChange();
            }
          }}
        >
          <header><h2 id="selection-change-confirmation-title">Unapplied Transition Edit</h2></header>
          <p>{input.pendingSelectionChange.message}</p>
          <footer>
            <button type="button" autoFocus onClick={input.cancelPendingSelectionChange}>Keep editing</button>
            <button type="button" data-testid="selection-change-discard" onClick={input.confirmPendingSelectionChange}>Discard and switch</button>
          </footer>
        </section>
      </div>,
      window.document.body,
    )}
    </>
  );
  const previewAnnotationDraft = useCallback((annotationId: AnnotationId, draft: { readonly label?: string; readonly color?: string; readonly opacity?: number } | undefined) => {
    const annotation = input.document.annotations.find((item) => item.id === annotationId);
    if (!annotation) return;
    refreshAnnotationPreview(refs.host.current!, annotationId, draft, { label: annotation.label, color: annotation.color, opacity: annotation.opacity });
  }, [input.document.annotations, refs.host]);
  const workspaceInspector = (
    <InspectorPanel
      key={`${input.documentEpoch}:${inspectorSelectionKey}:${dialog.inspectorResetToken}`}
      signal={inspectorSignal}
      selectedSignalIds={inspectorSignalIds}
      group={inspectorGroup}
      annotation={inspectorAnnotation}
      transaction={inspectorTransaction}
      bookmark={selected.bookmark}
      collapsedGroup={
        inspectorGroup !== undefined &&
        input.timeline.collapsedGroupIds.has(inspectorGroup.id)
      }
      onToggleGroupCollapse={
        inspectorGroup === undefined
          ? undefined
          : () => input.timeline.toggleCollapsedGroup(inspectorGroup.id)
      }
      registry={input.command.registry.current}
      document={input.document}
      viewport={refs.viewport}
      commands={surfaceCommands}
      onReveal={input.actions.revealSelectedInHierarchy}
      onCancel={() => {
        if (inspectorGroup)
          refreshGroupStylePreview(
            refs.host.current!,
            inspectorGroup.id,
            inspectorGroup.style,
          );
        dialog.setInspectorResetToken((value) => value + 1);
      }}
      onClose={() => dialog.setInspectorVisible(false)}
      onDeleteBookmark={input.actions.deleteBottomBookmark}
      onToggleTransactionSignal={input.actions.toggleTransactionSignal}
      onGroupPreview={(groupId, style) =>
        refreshGroupStylePreview(
          refs.host.current!,
          groupId,
          style ??
            input.document.signalGroups.find((group) => group.id === groupId)
              ?.style,
        )
      }
      onAnnotationPreview={previewAnnotationDraft}
      minimapMode={inspectorContext === "Transaction" ? "transaction" : "signal"}
    />
  );
  return {
    surfaceCommands,
    workspaceHeader,
    workspaceTransactionTree,
    workspaceViewportContent,
    workspaceViewportLegend,
    workspaceBottom,
    workspaceInspector,
    aiBridgeStatus,
  };
}
