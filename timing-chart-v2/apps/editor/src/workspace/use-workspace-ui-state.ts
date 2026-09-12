import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { cursorDelta, type SemanticCursorState } from "@timing-chart-v2/projection";

export type DensityMode = "compact" | "comfortable";
export type WorkspacePreset = "waveform" | "edit" | "review" | "transaction";
export type TreeTypeFilter = "all" | "input" | "output" | "wire" | "comment";
export type BottomTab = "Signal" | "Annotation" | "Transaction" | "Phases" | "Linked Signals" | "Bookmarks" | "AI" | "Problems" | "JSON";
export type ViewMode = "Cycle" | "Transaction" | "Split";
export type TransactionTreeFilterMode = "all" | "grouped" | "ungrouped" | "phases" | "linked" | "visible" | "hidden" | "no-phases";

export type SemanticCursor = number | undefined;

/** #403/#404: which pane/entity family the Ribbon and other chrome should
 * treat as "active" for contextual command surfaces -- deliberately its
 * own state, separate from `ViewMode` (Cycle/Transaction/Split are
 * *layout* modes; `Split` still needs an explicit active pane), `Selection`
 * (which entity is selected; selecting a Signal while in Transaction
 * context, e.g. via a Linked Signal jump, must not silently flip context),
 * and `WorkspacePreset` (a panel/layout preset name, not a pane identity --
 * `ViewMode=Transaction` and `WorkspacePreset="transaction"` are not the
 * same concept and must not be conflated). Pure UI/workspace state, like
 * everything else in this hook -- never persisted into the canonical
 * document, never itself a driver of Canonical/History/Dirty mutation. */
export type ActiveContext = "Signal" | "Transaction";

export function normalizedActiveContextFor(viewMode: ViewMode, current: ActiveContext): ActiveContext {
  // Cycle/Transaction each have exactly one meaningful context, so entering
  // either one normalizes to it. Split has no single natural default --
  // an explicitly-set active context (e.g. from before switching modes, or
  // set while already in Split) is preserved rather than reset.
  if (viewMode === "Cycle") return "Signal";
  if (viewMode === "Transaction") return "Transaction";
  return current;
}

export const LEFT_PANE_MIN_WIDTH = 265;
export const LEFT_PANE_MAX_WIDTH = 420;

export type PaneResizeGesture = { readonly startX: number; readonly startWidth: number };
export type VerticalResizeGesture = { readonly startY: number; readonly startHeight: number };
export type RatioResizeGesture = { readonly startY: number; readonly startRatio: number; readonly containerHeight: number };

export type BottomPinnedSelection<SignalId, GroupId, AnnotationId, TransactionId> = {
  readonly signalId?: SignalId;
  readonly groupId?: GroupId;
  readonly annotationId?: AnnotationId;
  readonly transactionId?: TransactionId;
};

/** Owns presentation-only workspace UI state: ribbon/bottom tabs, view mode,
 * density/workspace presets, pane visibility, pane/bottom sizes and their
 * resize-gesture scratch refs, and the Left Tree filter. None of this is
 * Document/Selection/Timeline canonical state -- every setter here only
 * ever affects layout/chrome, never the .tcd document or command history. */
export function useWorkspaceUiState<SignalId, GroupId, AnnotationId, TransactionId>(input: { readonly documentEpoch?: number; readonly cycleCount?: number; readonly initialViewMode?: ViewMode } = {}) {
  const [ribbonTab, setRibbonTab] = useState("Home");
  const [bottomTab, setBottomTab] = useState<BottomTab>(input.initialViewMode === "Transaction" ? "Transaction" : "Signal");
  const lastBottomTabByModeRef = useRef<{ Cycle: BottomTab; Transaction: BottomTab }>({ Cycle: "Signal", Transaction: "Transaction" });
  const followSelectionByModeRef = useRef<{ Cycle: boolean; Transaction: boolean }>({ Cycle: true, Transaction: true });
  const bottomPinnedByModeRef = useRef<{ Cycle: boolean; Transaction: boolean }>({ Cycle: false, Transaction: false });
  const [viewMode, setViewModeRaw] = useState<ViewMode>(input.initialViewMode ?? "Cycle");
  const [activeContext, setActiveContext] = useState<ActiveContext>(normalizedActiveContextFor(input.initialViewMode ?? "Cycle", "Signal"));
  // #404: entering Cycle or Transaction normalizes ActiveContext to the one
  // meaningful value for that mode; entering Split preserves whatever
  // ActiveContext was already set (no natural single default there). A
  // Selection change alone must never call this -- only a real ViewMode
  // change may normalize ActiveContext.
  const setViewMode = (next: ViewMode) => {
    if (viewMode === "Cycle" || viewMode === "Transaction") {
      followSelectionByModeRef.current[viewMode] = followSelectionRef.current;
      bottomPinnedByModeRef.current[viewMode] = bottomPinnedRef.current;
    }
    setViewModeRaw(next);
    setActiveContext((current) => normalizedActiveContextFor(next, current));
    if (next !== "Split") {
      setActivePaneRaw(next === "Transaction" ? "transaction" : "signal");
      setFollowSelection(followSelectionByModeRef.current[next]);
      setBottomPinned(bottomPinnedByModeRef.current[next]);
      setBottomTab((current) => {
        const transactionTabs: readonly BottomTab[] = ["Transaction", "Phases", "Linked Signals", "Bookmarks", "AI", "Problems", "JSON"];
        const cycleTabs: readonly BottomTab[] = ["Signal", "Annotation", "Bookmarks", "AI", "Problems", "JSON"];
        const currentTabs = viewMode === "Transaction" ? transactionTabs : cycleTabs;
        if (viewMode === "Cycle" || viewMode === "Transaction") {
          if (currentTabs.includes(current)) lastBottomTabByModeRef.current[viewMode] = current;
        }
        const valid = next === "Transaction" ? transactionTabs : cycleTabs;
        const remembered = lastBottomTabByModeRef.current[next];
        return valid.includes(remembered) ? remembered : valid[0]!;
      });
    }
  };
  // #407: Split's own pane-level counterpart to #404's ActiveContext --
  // "existing Split layout, minimal change" scope (Non-goals explicitly
  // exclude the horizontal side-by-side layout and the final Ribbon wiring
  // -- those are #408/#409). `activePane` tracks which of the two existing
  // Split regions (the Signal waveform surface, or `.transaction-lanes`
  // stacked above it) the user last interacted with; `setActivePane` is the
  // *only* place allowed to also normalize `activeContext` while in Split,
  // mirroring #404's own "only a real mode/pane change may normalize
  // ActiveContext" rule -- a Selection change (e.g. a Linked Signal jump)
  // must never call this. Pure view-only UI state, like everything else
  // here: never Canonical, never History/Dirty.
  const [activePane, setActivePaneRaw] = useState<"signal" | "transaction">("signal");
  const setActivePane = (pane: "signal" | "transaction") => { setActivePaneRaw(pane); if (viewMode === "Split") setActiveContext(pane === "transaction" ? "Transaction" : "Signal"); };
  // Signal Split View (#200): an independent Upper/Lower dual-pane layout
  // for Cycle mode -- unrelated to `viewMode`'s pre-existing "Split" value
  // (which only stacks Transaction lanes above the single Cycle surface).
  // Pure UI/workspace state, not persisted into the canonical document.
  const [signalSplitEnabled, setSignalSplitEnabled] = useState(false);
  // Signal Split View (#200): the Upper/Lower height split ratio (Upper's
  // share, 0.15-0.85). Pure UI state, like signalSplitEnabled above --
  // dragging or resetting it never touches the canonical document/history.
  const [signalSplitRatio, setSignalSplitRatio] = useState(0.5);
  const signalSplitResizeRef = useRef<RatioResizeGesture | undefined>(undefined);
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [workspacePreset, setWorkspacePreset] = useState<WorkspacePreset>("edit");
  // #459: Cursor A/B are source-time workspace state. They are deliberately
  // independent of Canonical/Selection/History and therefore never enter
  // document save/open payloads or semantic commands.
  const [cursorA, setCursorA] = useState<SemanticCursor>();
  const [cursorB, setCursorB] = useState<SemanticCursor>();
  const previousDocumentEpochRef = useRef(input.documentEpoch);
  useEffect(() => {
    if (previousDocumentEpochRef.current === input.documentEpoch) return;
    previousDocumentEpochRef.current = input.documentEpoch;
    setCursorA(undefined);
    setCursorB(undefined);
    // Signal Split is workspace chrome, not document content. Preserve the
    // user's active two-pane presentation across Save/Open replacement; the
    // new document is reprojected into the existing pane layout.
  }, [input.documentEpoch]);
  const cursorState: SemanticCursorState = { ...(cursorA === undefined ? {} : { a: cursorA }), ...(cursorB === undefined ? {} : { b: cursorB }) };
  const setCursor = (which: "a" | "b", sourceTime: number | undefined) => {
    if (sourceTime !== undefined && !Number.isFinite(sourceTime)) return;
    const maximum = input.cycleCount === undefined ? Number.POSITIVE_INFINITY : Math.max(0, input.cycleCount - 1);
    const bounded = sourceTime === undefined ? undefined : Math.max(0, Math.min(maximum, sourceTime));
    if (which === "a") setCursorA(bounded); else setCursorB(bounded);
  };
  const clearCursor = (which: "a" | "b") => setCursor(which, undefined);
  const moveCursor = (which: "a" | "b", deltaCycles: number) => {
    if (!Number.isFinite(deltaCycles)) return;
    const current = which === "a" ? cursorA : cursorB;
    if (current === undefined) return;
    const maximum = input.cycleCount === undefined ? Number.POSITIVE_INFINITY : Math.max(0, input.cycleCount - 1);
    setCursor(which, Math.max(0, Math.min(maximum, current + deltaCycles)));
  };
  const swapCursors = () => { setCursorA(cursorB); setCursorB(cursorA); };

  const [signalTreeVisible, setSignalTreeVisible] = useState(true);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [inspectorResetToken, setInspectorResetToken] = useState(0);
  const [bottomResetToken, setBottomResetToken] = useState(0);
  const [bottomVisible, setBottomVisible] = useState(true);
  const panelVisibilityByModeRef = useRef<{ Cycle: { inspector: boolean; bottom: boolean }; Transaction: { inspector: boolean; bottom: boolean } }>({
    Cycle: { inspector: true, bottom: true }, Transaction: { inspector: true, bottom: true },
  });
  const previousVisibilityModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    if (viewMode === "Split") return;
    if (previousVisibilityModeRef.current !== viewMode) {
      previousVisibilityModeRef.current = viewMode;
      const next = panelVisibilityByModeRef.current[viewMode];
      setInspectorVisible(next.inspector);
      setBottomVisible(next.bottom);
      return;
    }
    panelVisibilityByModeRef.current[viewMode] = { inspector: inspectorVisible, bottom: bottomVisible };
  }, [bottomVisible, inspectorVisible, viewMode]);
  const waveformRestoreRef = useRef<{ readonly inspectorVisible: boolean; readonly bottomVisible: boolean; readonly preset: Exclude<WorkspacePreset, "waveform"> } | undefined>(undefined);

  const [leftPaneWidth, setLeftPaneWidth] = useState(LEFT_PANE_MIN_WIDTH);
  const leftPaneResizeRef = useRef<PaneResizeGesture | undefined>(undefined);
  const [frozenPaneWidth, setFrozenPaneWidth] = useState(209);
  const frozenPaneResizeRef = useRef<PaneResizeGesture | undefined>(undefined);
  const [inspectorWidth, setInspectorWidth] = useState(297);
  const inspectorResizeRef = useRef<PaneResizeGesture | undefined>(undefined);
  const [bottomHeight, setBottomHeight] = useState(240);
  const bottomResizeRef = useRef<VerticalResizeGesture | undefined>(undefined);
  // #563: pane dimensions are presentation state too. Keep independent
  // snapshots so switching Cycle/Transaction does not leak a compact
  // Transaction layout into Cycle (or a wide Cycle layout into Transaction).
  const paneDimensionsByModeRef = useRef<Record<"Cycle" | "Transaction", { left: number; frozen: number; inspector: number; bottom: number }>>({
    Cycle: { left: LEFT_PANE_MIN_WIDTH, frozen: 209, inspector: 297, bottom: 240 },
    Transaction: { left: LEFT_PANE_MIN_WIDTH, frozen: 209, inspector: 297, bottom: 240 },
  });
  const previousPaneModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    if (viewMode === "Split") return;
    if (previousPaneModeRef.current !== viewMode) {
      previousPaneModeRef.current = viewMode;
      const next = paneDimensionsByModeRef.current[viewMode];
      setLeftPaneWidth(next.left);
      setFrozenPaneWidth(next.frozen);
      setInspectorWidth(next.inspector);
      setBottomHeight(next.bottom);
      return;
    }
    paneDimensionsByModeRef.current[viewMode] = { left: leftPaneWidth, frozen: frozenPaneWidth, inspector: inspectorWidth, bottom: bottomHeight };
  }, [bottomHeight, frozenPaneWidth, inspectorWidth, leftPaneWidth, viewMode]);

  const [treeFilter, setTreeFilter] = useState("");
  const [transactionTreeFilter, setTransactionTreeFilter] = useState("");
  const [transactionTreeFilterMode, setTransactionTreeFilterMode] = useState<TransactionTreeFilterMode>("all");
  const [treeTypeFilter, setTreeTypeFilter] = useState<TreeTypeFilter>("all");
  // #429/#397 Transaction Mode Product Closure P0-2: which tree the Left
  // panel shows while `viewMode === "Transaction"` -- "transactions" (the
  // existing Group/Lane Transaction tree) or "signals" (the same Signal
  // Tree Cycle Mode already renders, made visible/selectable here too so a
  // user can browse/select Signals -- e.g. to link to a Transaction --
  // without leaving Transaction Mode). Pure view-only UI state, same shape
  // as `treeTypeFilter`/`viewMode` above: never touches Canonical, never a
  // second selection owner (a Signal picked here is the exact same
  // selection Cycle Mode's own tree would produce).
  const [transactionTreeTab, setTransactionTreeTab] = useState<"transactions" | "signals">("transactions");

  const [followSelection, setFollowSelection] = useState(true);
  const followSelectionRef = useRef(true);
  followSelectionRef.current = followSelection;
  const [bottomPinned, setBottomPinned] = useState(false);
  const bottomPinnedRef = useRef(false);
  bottomPinnedRef.current = bottomPinned;
  const pinnedBottomSelectionByModeRef = useRef<{ Cycle: BottomPinnedSelection<SignalId, GroupId, AnnotationId, TransactionId> | undefined; Transaction: BottomPinnedSelection<SignalId, GroupId, AnnotationId, TransactionId> | undefined }>({ Cycle: undefined, Transaction: undefined });
  const [pinnedBottomSelection, setPinnedBottomSelectionState] = useState<BottomPinnedSelection<SignalId, GroupId, AnnotationId, TransactionId> | undefined>();
  const setPinnedBottomSelection = useCallback((value: SetStateAction<BottomPinnedSelection<SignalId, GroupId, AnnotationId, TransactionId> | undefined>) => {
    const next = typeof value === "function" ? value(pinnedBottomSelection) : value;
    if (viewMode === "Cycle" || viewMode === "Transaction") pinnedBottomSelectionByModeRef.current[viewMode] = next;
    setPinnedBottomSelectionState(next);
  }, [pinnedBottomSelection, viewMode]);
  const previousPinnedModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    if (viewMode === "Split" || previousPinnedModeRef.current === viewMode) return;
    previousPinnedModeRef.current = viewMode;
    setPinnedBottomSelectionState(pinnedBottomSelectionByModeRef.current[viewMode]);
  }, [viewMode]);

  return {
    ribbonTab, setRibbonTab,
    bottomTab, setBottomTab,
    viewMode, setViewMode,
    activeContext, setActiveContext,
    activePane, setActivePane,
    signalSplitEnabled, setSignalSplitEnabled,
    signalSplitRatio, setSignalSplitRatio, signalSplitResizeRef,
    density, setDensity,
    workspacePreset, setWorkspacePreset,
    cursorA, cursorB, cursorState, cursorDelta: cursorDelta(cursorState),
    setCursor, clearCursor, moveCursor, swapCursors,
    waveformRestoreRef,
    signalTreeVisible, setSignalTreeVisible,
    inspectorVisible, setInspectorVisible,
    inspectorResetToken, setInspectorResetToken,
    bottomResetToken, setBottomResetToken,
    bottomVisible, setBottomVisible,
    leftPaneWidth, setLeftPaneWidth, leftPaneResizeRef,
    frozenPaneWidth, setFrozenPaneWidth, frozenPaneResizeRef,
    inspectorWidth, setInspectorWidth, inspectorResizeRef,
    bottomHeight, setBottomHeight, bottomResizeRef,
    treeFilter, setTreeFilter, transactionTreeFilter, setTransactionTreeFilter, transactionTreeFilterMode, setTransactionTreeFilterMode,
    treeTypeFilter, setTreeTypeFilter,
    transactionTreeTab, setTransactionTreeTab,
    followSelection, setFollowSelection, followSelectionRef,
    bottomPinned, setBottomPinned, bottomPinnedRef,
    pinnedBottomSelection, setPinnedBottomSelection,
  } as const;
}

export type WorkspaceUiState<SignalId, GroupId, AnnotationId, TransactionId> = ReturnType<
  typeof useWorkspaceUiState<SignalId, GroupId, AnnotationId, TransactionId>
>;
