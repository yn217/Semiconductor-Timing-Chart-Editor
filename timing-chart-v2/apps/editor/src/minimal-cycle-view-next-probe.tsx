import { useMemo, useRef, useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { cycleDocument } from "./fixtures-cycle-reference-documents.js";
import { MinimalCycleViewNext } from "./minimal-cycle-view-next.js";

/** Phase-1 mount for the parallel replacement. It is deliberately opt-in. */
export function MinimalCycleViewNextProbe() {
  const session = useMemo(() => new CommandHistorySession(cycleDocument), []);
  const [, refresh] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceHostRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const gridLayerRef = useRef<HTMLDivElement>(null);
  const snapshot = session.getSnapshot();
  const source = useMemo(() => ({
    snapshot,
    history: session.historyState(),
    executeSemantic: (command: SemanticCommand) => { const result = session.execute(command); refresh((value) => value + 1); return result; },
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
    zoom: 1, gridEnabled: true, snapEnabled: false, rulerEnabled: true, selectedCycle: 0,
    changeZoom: () => undefined, setZoomAbsolute: () => undefined, fitAll: () => undefined,
    fitSelection: () => undefined, navigateToCycle: () => undefined,
    transactionBoundaryX: () => undefined, snapTransactionCycle: () => undefined,
    executeTimelineCommand: (command: SemanticCommand) => session.execute(command),
    titleBarUi: <header className="editor-title-bar"><strong>{snapshot.document.document.title}</strong></header>,
    ribbonTabsUi: <nav className="ribbon-tabs" aria-label="Ribbon tabs"><span>Next</span></nav>,
    ribbonUi: <div className="ribbon" data-testid="next-ribbon"><span>Parallel replacement</span></div>,
    signalTreeAndCanvasUi: <section data-testid="next-signal-tree-canvas"><div ref={surfaceHostRef} /></section>,
    bottomEditorUi: <section data-testid="next-bottom-editor" />,
    inspectorShellUi: <aside data-testid="next-inspector" />,
    dialogsUi: null,
    statusBarUi: <footer className="status-bar" data-testid="next-status">Phase 1 · parallel replacement</footer>,
  }), [snapshot, session]);
  return <MinimalCycleViewNext source={source} />;
}
