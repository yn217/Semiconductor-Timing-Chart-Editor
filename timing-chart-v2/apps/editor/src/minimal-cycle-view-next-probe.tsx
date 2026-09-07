import { useEffect, useMemo, useRef, useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { ProductionWaveDromAdapter } from "@timing-chart-v2/wavedrom-adapter";
import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { CommandId } from "@timing-chart-v2/schema";
import { UiCommandRegistry } from "@timing-chart-v2/ui";
import { cycleDocument } from "./fixtures-cycle-reference-documents.js";
import { MinimalCycleViewNext } from "./minimal-cycle-view-next.js";
import { createMinimalCycleApplicationSession } from "./minimal-cycle-view-application.js";
import { ContextMenuPanel, InspectorPanel, MinimalCycleViewTitleBar } from "./minimal-cycle-view-panels.js";
import { MinimalCycleViewBottomEditor, MinimalCycleViewNextStatusBar, MinimalCycleViewRibbonTabs, MinimalCycleViewSignalTreeCanvas } from "./minimal-cycle-view-ui.js";

/** Phase-1 mount for the parallel replacement. It is deliberately opt-in. */
export function MinimalCycleViewNextProbe() {
  const session = useMemo(() => createMinimalCycleApplicationSession(cycleDocument), []);
  const [, refresh] = useState(0);
  const [ribbonTab, setRibbonTab] = useState("Home");
  const [viewMode, setViewMode] = useState<"Cycle" | "Transaction" | "Split">("Cycle");
  const [bottomTab, setBottomTab] = useState("Signal");
  const [zoom, setZoom] = useState(1);
  const [selectedCycle, setSelectedCycle] = useState(0);
  const [nextBottomTab, setNextBottomTab] = useState("Signal");
  const [followSelection, setFollowSelection] = useState(false);
  const [bottomPinned, setBottomPinned] = useState(false);
  const [nextSelectedSignalId, setNextSelectedSignalId] = useState<import("@timing-chart-v2/schema").SignalId>();
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceHostRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const gridLayerRef = useRef<HTMLDivElement>(null);
  const localGeometryRef = useRef<LocalGeometryMap | undefined>(undefined);
  const registry = useMemo(() => new UiCommandRegistry(), []);
  const snapshot = session.getSnapshot();
  useEffect(() => {
    const owner = surfaceHostRef.current;
    const signal = snapshot.document.signals[0];
    if (!owner || !signal) return;
    const adapter = new ProductionWaveDromAdapter();
    const waveJson = adapter.toWaveJson({ signal, cycleCount: snapshot.document.timeline.cycleCount });
    void adapter.renderWave(signal.id, waveJson, owner).then((rendered) => {
      localGeometryRef.current = adapter.extractLocalGeometry(rendered);
      owner.dataset.geometryReady = "true";
    }).catch((error: unknown) => {
      owner.dataset.waveError = error instanceof Error ? error.message : "WaveDrom render failed";
    });
    return () => adapter.dispose(signal.id);
  }, [snapshot]);
  const source = useMemo(() => ({
    snapshot,
    history: session.historyState(),
    executeSemantic: (command: SemanticCommand) => { const result = session.execute(command); refresh((value) => value + 1); return result; },
    executeSemanticBatch: (id: CommandId, commands: readonly SemanticCommand[]) => { const result = session.executeBatch(id, commands); refresh((value) => value + 1); return result; },
    undo: () => { session.undo(); refresh((value) => value + 1); },
    redo: () => { session.redo(); refresh((value) => value + 1); },
    selectedSignalId: nextSelectedSignalId,
    clearSelection: () => setNextSelectedSignalId(undefined),
    requestNewDocument: () => undefined,
    requestOpenText: (_text: string) => undefined,
    saveDocumentText: () => undefined,
    copySelection: () => undefined, cutSelection: () => undefined, pasteSelection: () => undefined,
    duplicateSelection: () => undefined, deleteSelection: () => undefined, refreshDiagnostics: () => undefined,
    timelineDocument: snapshot.document,
    viewportRef, surfaceHostRef, rulerRef, gridLayerRef,
    zoom, gridEnabled: true, snapEnabled: false, rulerEnabled: true, selectedCycle,
    changeZoom: (delta: number) => setZoom((value) => Math.max(0.25, Math.min(4, value + delta))), setZoomAbsolute: setZoom, fitAll: () => setZoom(1),
    fitSelection: () => setZoom(1.5), navigateToCycle: (cycle: number) => setSelectedCycle(Math.max(0, Math.min(snapshot.document.timeline.cycleCount - 1, cycle))),
    transactionBoundaryX: (cycle: number) => { const signal = snapshot.document.signals[0]; return signal === undefined ? undefined : localGeometryRef.current?.find({ signalId: signal.id, cycle, point: "cycle-start" })?.point.x; }, snapTransactionCycle: () => undefined,
    executeTimelineCommand: (command: SemanticCommand) => session.execute(command),
    titleBarUi: <MinimalCycleViewTitleBar title={snapshot.document.document.title} dirty={session.historyState().dirty} viewMode={viewMode} />,
    ribbonTabsUi: <MinimalCycleViewRibbonTabs ribbonTab={ribbonTab} setRibbonTab={setRibbonTab} viewMode={viewMode} setViewMode={setViewMode} bottomTab={bottomTab} setBottomTab={setBottomTab} />,
    ribbonUi: null,
    signalTreeAndCanvasUi: <MinimalCycleViewSignalTreeCanvas document={snapshot.document} selectedSignalId={nextSelectedSignalId} onSelect={setNextSelectedSignalId} surfaceHostRef={surfaceHostRef} rulerRef={rulerRef} gridLayerRef={gridLayerRef} />,
    bottomEditorUi: <MinimalCycleViewBottomEditor tab={nextBottomTab} onTabChange={setNextBottomTab} followSelection={followSelection} onFollowSelectionChange={setFollowSelection} pinned={bottomPinned} onPinnedChange={setBottomPinned} />,
    inspectorShellUi: <aside data-testid="next-inspector"><InspectorPanel signal={undefined} group={undefined} annotation={undefined} transaction={undefined} bookmark={undefined} collapsedGroup={false} onToggleGroupCollapse={undefined} registry={registry} document={snapshot.document} viewport={viewportRef} onCommand={(command) => session.execute(command)} onReveal={() => undefined} onCancel={() => undefined} onClose={() => undefined} onDeleteBookmark={() => undefined} onToggleTransactionSignal={() => undefined} /></aside>,
    dialogsUi: <ContextMenuPanel contextMenu={undefined} hasSelectedClipboard={false} clipboardAvailable={false} hasSelectedEntity={false} hasSelectedSignal={false} hasDeletableSelection={false} copySelectedSignal={() => undefined} cutSelectedSignal={() => undefined} pasteSelectedEntity={() => undefined} duplicateSelectedEntity={() => undefined} moveSelection={() => undefined} setSelectionVisibility={() => undefined} renameSelection={() => undefined} closeContextMenu={() => undefined} deleteSelection={() => undefined} />,
    statusBarUi: <MinimalCycleViewNextStatusBar document={snapshot.document} revision={snapshot.revision} history={session.historyState()} />,
  }), [snapshot, session, registry, ribbonTab, viewMode, bottomTab, zoom, selectedCycle, nextBottomTab, followSelection, bottomPinned, nextSelectedSignalId]);
  return <MinimalCycleViewNext source={source} />;
}
