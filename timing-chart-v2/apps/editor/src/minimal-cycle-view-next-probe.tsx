import { useMemo, useRef, useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CommandId } from "@timing-chart-v2/schema";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { UiCommandRegistry } from "@timing-chart-v2/ui";
import { cycleDocument } from "./fixtures-cycle-reference-documents.js";
import { MinimalCycleViewNext } from "./minimal-cycle-view-next.js";
import { ContextMenuPanel, InspectorPanel, MinimalCycleViewTitleBar } from "./minimal-cycle-view-panels.js";
import { MinimalCycleViewBottomEditor, MinimalCycleViewRibbonTabs, MinimalCycleViewSignalTreeCanvas } from "./minimal-cycle-view-ui.js";

/** Phase-1 mount for the parallel replacement. It is deliberately opt-in. */
export function MinimalCycleViewNextProbe() {
  const session = useMemo(() => new CommandHistorySession(cycleDocument), []);
  const [, refresh] = useState(0);
  const [ribbonTab, setRibbonTab] = useState("Home");
  const [viewMode, setViewMode] = useState("Cycle");
  const [bottomTab, setBottomTab] = useState("Signal");
  const [zoom, setZoom] = useState(1);
  const [selectedCycle, setSelectedCycle] = useState(0);
  const [nextBottomTab, setNextBottomTab] = useState("Signal");
  const [followSelection, setFollowSelection] = useState(false);
  const [bottomPinned, setBottomPinned] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceHostRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const gridLayerRef = useRef<HTMLDivElement>(null);
  const registry = useMemo(() => new UiCommandRegistry(), []);
  const snapshot = session.getSnapshot();
  const source = useMemo(() => ({
    snapshot,
    history: session.historyState(),
    executeSemantic: (command: SemanticCommand) => { const result = session.execute(command); refresh((value) => value + 1); return result; },
    executeSemanticBatch: (id: CommandId, commands: readonly SemanticCommand[]) => { const result = session.executeBatch(id, commands); refresh((value) => value + 1); return result; },
    undo: () => { session.undo(); refresh((value) => value + 1); },
    redo: () => { session.redo(); refresh((value) => value + 1); },
    clearSelection: () => undefined,
    requestNewDocument: () => undefined,
    requestOpenText: (_text: string) => undefined,
    saveDocumentText: () => undefined,
    copySelection: () => undefined, cutSelection: () => undefined, pasteSelection: () => undefined,
    duplicateSelection: () => undefined, deleteSelection: () => undefined, refreshDiagnostics: () => undefined,
    timelineDocument: snapshot.document,
    viewportRef, surfaceHostRef, rulerRef, gridLayerRef,
    zoom, gridEnabled: true, snapEnabled: false, rulerEnabled: true, selectedCycle,
    changeZoom: (delta: number) => setZoom((value) => Math.max(0.25, Math.min(4, value + delta))), setZoomAbsolute: setZoom, fitAll: () => setZoom(1),
    fitSelection: () => setZoom(1.5), navigateToCycle: setSelectedCycle,
    transactionBoundaryX: () => undefined, snapTransactionCycle: () => undefined,
    executeTimelineCommand: (command: SemanticCommand) => session.execute(command),
    titleBarUi: <MinimalCycleViewTitleBar title={snapshot.document.document.title} dirty={session.historyState().dirty} />,
    ribbonTabsUi: <MinimalCycleViewRibbonTabs ribbonTab={ribbonTab} setRibbonTab={setRibbonTab} viewMode={viewMode} setViewMode={setViewMode} bottomTab={bottomTab} setBottomTab={setBottomTab} />,
    ribbonUi: <div className="ribbon" data-testid="next-ribbon"><span>Parallel replacement</span></div>,
    signalTreeAndCanvasUi: <MinimalCycleViewSignalTreeCanvas document={snapshot.document} onSelect={() => undefined} surfaceHostRef={surfaceHostRef} />,
    bottomEditorUi: <MinimalCycleViewBottomEditor tab={nextBottomTab} onTabChange={setNextBottomTab} followSelection={followSelection} onFollowSelectionChange={setFollowSelection} pinned={bottomPinned} onPinnedChange={setBottomPinned} />,
    inspectorShellUi: <aside data-testid="next-inspector"><InspectorPanel signal={undefined} group={undefined} annotation={undefined} transaction={undefined} collapsedGroup={false} onToggleGroupCollapse={undefined} registry={registry} document={snapshot.document} viewport={viewportRef} onCommand={(command) => session.execute(command)} onReveal={() => undefined} onCancel={() => undefined} /></aside>,
    dialogsUi: <ContextMenuPanel contextMenu={undefined} hasSelectedClipboard={false} clipboardAvailable={false} hasSelectedEntity={false} hasSelectedSignal={false} hasDeletableSelection={false} copySelectedSignal={() => undefined} cutSelectedSignal={() => undefined} pasteSelectedEntity={() => undefined} duplicateSelectedEntity={() => undefined} moveSelection={() => undefined} setSelectionVisibility={() => undefined} renameSelection={() => undefined} closeContextMenu={() => undefined} deleteSelection={() => undefined} />,
    statusBarUi: <footer className="status-bar" data-testid="next-status">Phase 1 · parallel replacement</footer>,
  }), [snapshot, session, registry, ribbonTab, viewMode, bottomTab, zoom, selectedCycle, nextBottomTab, followSelection, bottomPinned]);
  return <MinimalCycleViewNext source={source} />;
}
