import { useTransactionDisclosure } from "./workspace/use-transaction-disclosure.js";
import type { AIBridgeStatus, AIBridgeViewOperation } from "./ai-bridge-client.js";
import { useCallback, useEffect } from "react";
import type {
  Dispatch,
  KeyboardEvent,
  MouseEvent,
  MutableRefObject,
  ReactNode,
  RefObject,
  SetStateAction,
} from "react";
import type { ChangeSet, CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
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
  SignalGroupStyle,
  SignalId,
  Transaction,
  TransactionGroup,
  TransactionId,
} from "@timing-chart-v2/schema";
import { nextEntityId } from "./entity-id.js";
import type { UiCommandRegistry } from "@timing-chart-v2/ui";
import type { EditorApplicationOwner } from "./application/use-editor-application-owner.js";
import type { EditorActions } from "./application/use-editor-actions.js";
import type { ClipboardActions } from "./application/clipboard-actions.js";
import type { TransactionTreeFilterMode } from "./workspace/use-workspace-ui-state.js";
import { useEditorAiAssistantModel } from "./application/use-editor-ai-assistant-model.js";
import { AnnotationCollectionPanel } from "./annotation-collection-panel.js";
import { AIOperationPanel } from "./ai-operation-panel.js";
import { AdvancedJsonPanel } from "./advanced-json-panel.js";
import { BookmarkEditor, clearAllBookmarkDrafts } from "./bookmark-editor.js";
import { BottomEditorPanel } from "./minimal-cycle-view-panels.js";
import { SignalEditor } from "./editors/signal-editor.js";
import { SignalTreeColumnHeader } from "./minimal-cycle-view-panels.js";
import { TransactionEditor } from "./transaction-editor.js";
import { TransactionLanes } from "./runtime/transaction-lanes.js";
import { TransactionTree } from "./transaction-tree.js";
import {
  TransactionLinkedSummary,
  TransactionPhaseSummary,
  clearAllPhaseDrafts,
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
import { cycleUnitWord } from "./transaction-tc.js";
import { withStaleImportDiagnostic } from "./application/stale-import-diagnostics.js";
import { SignalTreeFooter } from "./signal-tree-footer.js";
import type { EditorSecondarySurfacesInput, EditorSecondarySurfacesOutput } from "./editor-secondary-surfaces-types.js";

export function useEditorSecondarySurfaces(
  input: EditorSecondarySurfacesInput,
): EditorSecondarySurfacesOutput {
  const execute = input.command.execute;
  const surfaceCommands = createEditorSurfaceCommandController(input.command);
  const reportStaleImport = (domain: "annotation" | "event", message: string) => input.setRuntimeDiagnostics((current) => withStaleImportDiagnostic(current, domain, message));
  const undo = input.command.undo;
  const redo = input.command.redo;
  const { selected, bottom, workspace, dialog, refs } = input;
  // Inspector is a projection of the visible workspace context, not a second
  // selection owner. Preserve stable selections across mode switches, but do
  // not keep editing a hidden-mode entity until the user returns to it.
  const inspectorContext: ActiveContext = workspace.viewMode === "Split"
    ? workspace.activeContext
    : workspace.viewMode === "Transaction"
      ? "Transaction"
      : "Signal";
  const inspectorLegendSelected = workspace.viewMode !== "Transaction" && selected.legendSelected;
  const inspectorSignal = !inspectorLegendSelected && inspectorContext === "Signal" ? selected.signal : undefined;
  const inspectorSignalIds = !inspectorLegendSelected && inspectorContext === "Signal" ? selected.signalIds : new Set<SignalId>();
  const inspectorGroup = !inspectorLegendSelected && inspectorContext === "Signal" ? selected.group : undefined;
  const inspectorAnnotation = !inspectorLegendSelected && inspectorContext === "Signal" ? selected.annotation : undefined;
  const inspectorTransaction = !inspectorLegendSelected && inspectorContext === "Transaction" ? selected.transaction : undefined;
  // Bookmarks live on the Cycle/Signal timeline domain: like Signal/Annotation they must not stay an implicit Inspector target while the
  // visible workspace is the Transaction domain (stale Bookmark + Delete in Transaction mode, #440). Selection itself is preserved.
  const inspectorBookmark = inspectorLegendSelected || inspectorContext !== "Signal" ? undefined : selected.bookmark;
  const inspectorSelectionKey = inspectorSignalIds.size > 1
    ? `multi:${inspectorSignalIds.size}`
    : inspectorLegendSelected ? "legend" : inspectorSignal?.id ?? inspectorGroup?.id ?? inspectorAnnotation?.id ?? inspectorTransaction?.id ?? inspectorBookmark?.id ?? "none";
  const { aiBridgeStatus, ...aiAssistantPanel } = useEditorAiAssistantModel({
    scenarioModel: input.scenario.model,
    activeScenarioId: input.scenario.activeScenarioId,
    onGenerateHandshakeScenarios: input.scenario.generateHandshakeScenarios,
    document: input.document,
    validationDiagnostics: input.validationDiagnostics,
    documentEpoch: input.documentEpoch,
    revision: input.revision,
    mode: workspace.viewMode === "Split" ? "Combined" : workspace.viewMode,
    selectedSignalId: input.annotationTargetSignalId,
    selectedGroupId: selected.group?.id,
    selectedAnnotationId: selected.annotation?.id,
    selectedTransactionId: selected.transactionId,
    range: input.timeline.range,
    onCommand: execute,
    onCommandBatch: (commands) =>
      input.command.executeBatch(
        input.command.nextCommandId("ai_batch_apply"),
        commands,
      ),
    getZoom: input.ai.getZoom,
    onFitAll: input.ai.fitAll,
    onFitSelection: input.ai.fitSelection,
    onSetSelection: input.actions.selectAIEntity,
    onRevealEntity: input.actions.revealAIEntity,
    onOpenTimeline: () => workspace.setRibbonTab("Timeline"),
    onViewOperation: (operation: AIBridgeViewOperation, args: Readonly<Record<string, unknown>>) => {
      if (operation === "switch_mode") {
        const mode = args.mode === "Combined" ? "Split" : args.mode;
        workspace.setViewMode(mode as ViewMode);
      } else if (operation === "open_panel") {
        if (args.panel === "inspector") dialog.setInspectorVisible(true);
        else input.setBottomVisible(true);
      } else {
        if (!input.ai.fitSourceRange(args.startCycle as number, args.endCycle as number)) throw new Error("The requested source-cycle range could not be resolved by the shared timeline geometry owner.");
      }
    },
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
      documentEpoch={input.documentEpoch}
      revision={input.revision}
      onImportDiagnostic={(message) => reportStaleImport("event", message)}
      cycleCount={input.document.timeline.cycleCount}
      bookmarks={input.document.bookmarks}
      enumDefinitions={input.document.enumDefinitions}
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
    />
  );
  const annotationEditor = <AnnotationCollectionPanel
    annotations={input.document.annotations}
    selectedId={bottom.annotation?.id}
    document={input.document}
    documentEpoch={input.documentEpoch}
    revision={input.revision}
    onSelect={input.actions.selectAnnotation}
    onCreate={input.actions.createSelectedAnnotationForType}
    onDuplicate={input.actions.duplicateAnnotation}
    onDelete={input.actions.deleteBottomAnnotation}
    commands={surfaceCommands}
    onImportDiagnostic={(message) => reportStaleImport("annotation", message)}
  />;
  const transactionEditor = (
    <TransactionEditor
      key={`${input.documentEpoch}:${dialog.bottomResetToken}`}
      transaction={bottom.transaction}
      selectedTransactionIds={selected.transactionIds}
      document={input.document}
      cyclesPerTc={workspace.cyclesPerTc}
      history={input.history}
      onSelect={input.actions.selectTransaction}
      onSelectTransactions={input.actions.selectTransactions}
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
      key={`${input.documentEpoch}:${bottom.bookmark?.id ?? "none"}:${dialog.bottomResetToken}`}
      bookmark={bottom.bookmark}
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
      selectedSignalCount={input.selected.signalIds.size}
      signalGroups={input.document.signalGroups}
      onCreateGroupFromSelection={input.actions.createGroupFromSignalSelection}
      onMoveSelectedSignalsToGroup={input.actions.moveSelectedSignalsToGroup}
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
              const perTc = workspace.cyclesPerTc;
              return `Time Scale: Transaction Cycle (TC)    Reference: System Clock (1 TC = ${perTc} ${cycleUnitWord(perTc)})`;
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
              onAdd: () => input.actions.createTransaction(),
              onAddGroup: input.actions.createTransactionGroup,
              onExpandAll: () => disclosure.expandAll(),
              onCollapseAll: () => disclosure.collapseAll(),
              onShowAll: () => setAllTransactionVisibility(true),
              onHideAll: () => setAllTransactionVisibility(false),
              timeScale: {
                cyclesPerTc: workspace.cyclesPerTc,
                onChange: workspace.setCyclesPerTc,
              },
            }
          : undefined
      }
    />
  );
  // #429/#397 P0-2: Transaction Mode's "Transactions | Signals" tabs are
  // sidebar browse tabs. The center remains the Transaction timeline in both
  // states; only the left rail content changes.
  const transactionBoundaryX = useCallback(
    (cycle: number) => refs.transactionBoundaryX.current(cycle),
    [refs.transactionBoundaryX],
  );
  const transactionVisibleSourceWindow = useCallback(
    (viewport: HTMLElement) => refs.transactionSourceWindow.current(viewport),
    [refs.transactionSourceWindow],
  );
  // #759: one Group disclosure owner for the Left Tree and the center Group headers.
  const disclosure = useTransactionDisclosure(input.document, input.documentEpoch);
  // #748/#774: Tree menu Show All / Hide All -- explicit target IDs (one History unit), never Selection: routing bulk visibility
  // through a temporary Selection used to silently replace the user's real selection, changing the scope of their next Delete/Group/Color.
  const setAllTransactionVisibility = (visible: boolean) => {
    input.actions.setTransactionsVisibility(input.document.transactions.map((transaction) => transaction.id), visible);
  };
  // #763: unapplied Phase drafts belong to one document; a replacement (New/Open) drops them all so an identical ID in the next document cannot inherit one.
  useEffect(() => { clearAllPhaseDrafts(); clearAllBookmarkDrafts(); }, [input.documentEpoch]);
  const workspaceViewportContent = workspace.viewMode !== "Cycle" ? (
    <TransactionLanes
        disclosure={disclosure}
        document={input.document}
        documentEpoch={input.documentEpoch}
        viewMode={workspace.viewMode}
        presentationRevision={input.transactionPresentationRevision}
        zoom={input.zoom}
        selectedId={selected.transactionId}
        selectedIds={selected.transactionIds}
        selectedPhaseId={input.selected.transactionPhaseId}
        {...(selected.bookmark?.id === undefined ? {} : { selectedBookmarkId: selected.bookmark.id })}
        filter={
          workspace.viewMode === "Transaction"
            ? workspace.transactionTreeFilter
            : ""
        }
        getBoundaryX={transactionBoundaryX}
        getVisibleSourceWindow={transactionVisibleSourceWindow}
        onSelect={input.actions.selectTransaction}
        onSelectPhase={input.actions.selectTransactionPhase}
        onSnap={(clientX, surfaceLeft, horizontalScroll) =>
          refs.snapTransactionCycle.current(clientX, surfaceLeft, horizontalScroll)
        }
        commands={surfaceCommands}
        onContextMenu={openTransactionContextMenu}
        bookmarks={input.document.bookmarks}
        onNavigateBookmark={input.actions.navigateToBookmark}
      />
  ) : null;
  const workspaceViewportLegend = (
    <LegendView document={input.document} commands={surfaceCommands} selected={selected.legendSelected} onSelect={input.actions.selectLegend} />
  );
  const workspaceTransactionTree =
    // Combined ("Split") reuses the exact same production Transaction Tree
    // component as standalone Transaction Mode -- see #598-adjacent mockup
    // review: the left column becomes Transaction Tree (upper) stacked over
    // the Cycle Signal Tree (lower), never a second tree implementation.
    (workspace.viewMode === "Transaction" || workspace.viewMode === "Split") ? (
      <TransactionTree
        disclosure={disclosure}
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
        onMoveToNewGroup={(transactionId) => {
          const order = input.document.transactionGroups?.length ?? 0;
          surfaceCommands.moveTransactionToNewGroup(transactionId, { id: nextEntityId("transactionGroup", input.document) as TransactionGroup["id"], name: `Group ${order + 1}`, order });
        }}
        onContextMenu={openTransactionContextMenu}
        onCreateTransaction={() => input.actions.createTransaction()}
        onCreateTransactionInGroup={input.actions.createTransaction}
        onClearSelection={input.actions.clearSelection}
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
          // #774: explicit target IDs, never a temporary Selection -- the user's real selection (and the scope of their next bulk
          // command) must not silently become "every Transaction in this Group".
          const ids = input.document.transactions.filter((transaction) => transaction.groupId === groupId).map((transaction) => transaction.id);
          input.actions.setTransactionsVisibility(ids, visible);
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
  const workspaceLeftRail = <SignalTreeFooter signalCount={input.document.signals.length} selectedSignal={selected.signal} />;
  const activeBottomContent = workspace.bottomTab === "Signal" ? (
    signalEditor
  ) : workspace.bottomTab === "Annotation" ? (
    annotationEditor
  ) : workspace.bottomTab === "Transaction" ? (
    transactionEditor
  ) : workspace.bottomTab === "Phases" ? (
    <TransactionPhaseSummary transaction={selected.transaction} transactions={input.document.transactions ?? []} commands={surfaceCommands} cyclesPerTc={workspace.cyclesPerTc} />
  ) : workspace.bottomTab === "Linked Signals" ? (
    <TransactionLinkedSummary transaction={selected.transaction} document={input.document} />
  ) : workspace.bottomTab === "Bookmarks" ? (
    bookmarkEditor
  ) : workspace.bottomTab === "Problems" ? (
    <ProblemsPanel diagnostics={input.diagnostics} pending={input.validationPending} onNavigate={input.navigateProblem} />
  ) : workspace.bottomTab === "JSON" ? (
    <AdvancedJsonPanel
      document={input.document}
      selectedSignal={bottom.signal}
      selectedGroup={bottom.group}
      selectedAnnotation={bottom.annotation}
      selectedTransaction={bottom.transaction}
      onReplaceDocument={input.actions.replaceDocument}
      onDiagnostic={(next) => {
        const nextDiagnostics = next === undefined ? [] : Array.isArray(next) ? next : [next];
        input.setRuntimeDiagnostics((current) => [
          ...current.filter((item) => !item.detail?.startsWith("advanced-json:")),
          ...nextDiagnostics,
        ]);
      }}
    />
  ) : null;
  const workspaceBottom = (
    <BottomEditorPanel
      tabs={workspace.bottomTabs}
      activeTab={workspace.bottomTab}
      onSelectTab={workspace.selectBottomTab}
      onTabKeyDown={workspace.onBottomTabKeyDown}
      followSelection={workspace.followSelection}
      onFollowSelectionChange={workspace.setFollowSelection}
      pinned={workspace.bottomPinned}
      onTogglePinned={workspace.toggleBottomPin}
      targetLabel={bottom.bookmark ? `Bookmark ${bottom.bookmark.name}` : bottom.transaction ? `Transaction ${bottom.transaction.name}` : bottom.annotation ? `Annotation ${bottom.annotation.label || bottom.annotation.type}` : bottom.signal ? `Signal ${bottom.signal.display.name}` : bottom.group ? `Group ${bottom.group.name}` : undefined}
      {...(workspace.bottomTab === "Annotation" ? { contentClassName: "bottom-content-annotation" } : {})}
      content={
        <>
          {/* Keep the AI Bridge session and an external proposal alive while
              another Bottom tab is active. The session belongs to this
              Editor tab/document, not to the visibility of its panel. */}
          <div className="bottom-ai-panel-host" hidden={workspace.bottomTab !== "AI"}>
            <AIOperationPanel {...aiAssistantPanel} />
          </div>
          {activeBottomContent}
        </>
      }
    />
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
      selectedCycle={input.timeline.selectedCycle}
      selectedSignalIds={inspectorSignalIds}
      group={inspectorGroup}
      annotation={inspectorAnnotation}
      transaction={inspectorTransaction}
      focusLinkedSignals={workspace.focusLinkedSignals}
      onFocusLinkedSignalsChange={workspace.setFocusLinkedSignals}
      legendSelected={inspectorLegendSelected}
      bookmark={inspectorBookmark}
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
      changeSet={input.changeSet}
      cyclesPerTc={workspace.cyclesPerTc}
      viewport={refs.viewport}
      commands={surfaceCommands}
      onReveal={input.actions.revealSelectedInHierarchy}
      onCancel={() => {
        if (inspectorGroup) {
          refs.groupStylePreviewRef.current(inspectorGroup.id, undefined);
          refreshGroupStylePreview(
            refs.host.current!,
            inspectorGroup.id,
            inspectorGroup.style,
            false,
          );
        }
        dialog.setInspectorResetToken((value) => value + 1);
      }}
      onClose={() => dialog.setInspectorVisible(false)}
      onDeleteBookmark={input.actions.deleteBottomBookmark}
      onToggleTransactionSignal={input.actions.toggleTransactionSignal}
      onGroupPreview={(groupId, style) => {
        refs.groupStylePreviewRef.current(groupId, style);
        refreshGroupStylePreview(refs.host.current!, groupId, style);
      }}
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
    workspaceLeftRail,
    workspaceBottom,
    workspaceInspector,
    aiBridgeStatus,
  };
}
