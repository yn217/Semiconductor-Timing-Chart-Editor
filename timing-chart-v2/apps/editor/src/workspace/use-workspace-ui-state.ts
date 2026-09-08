import { useRef, useState } from "react";

export type DensityMode = "compact" | "comfortable";
export type WorkspacePreset = "waveform" | "edit" | "review" | "transaction";
export type TreeTypeFilter = "all" | "input" | "output" | "wire" | "comment";
export type BottomTab = "Signal" | "Annotation" | "Transaction" | "Bookmarks" | "AI" | "Problems" | "JSON";
export type ViewMode = "Cycle" | "Transaction" | "Split";

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
export function useWorkspaceUiState<SignalId, GroupId, AnnotationId, TransactionId>() {
  const [ribbonTab, setRibbonTab] = useState("Home");
  const [bottomTab, setBottomTab] = useState<BottomTab>("Signal");
  const [viewMode, setViewModeRaw] = useState<ViewMode>("Cycle");
  const [activeContext, setActiveContext] = useState<ActiveContext>("Signal");
  // #404: entering Cycle or Transaction normalizes ActiveContext to the one
  // meaningful value for that mode; entering Split preserves whatever
  // ActiveContext was already set (no natural single default there). A
  // Selection change alone must never call this -- only a real ViewMode
  // change may normalize ActiveContext.
  const setViewMode = (next: ViewMode) => { setViewModeRaw(next); setActiveContext((current) => normalizedActiveContextFor(next, current)); };
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

  const [signalTreeVisible, setSignalTreeVisible] = useState(true);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [inspectorResetToken, setInspectorResetToken] = useState(0);
  const [bottomResetToken, setBottomResetToken] = useState(0);
  const [bottomVisible, setBottomVisible] = useState(true);
  const waveformRestoreRef = useRef<{ readonly inspectorVisible: boolean; readonly bottomVisible: boolean } | undefined>(undefined);

  const [leftPaneWidth, setLeftPaneWidth] = useState(LEFT_PANE_MIN_WIDTH);
  const leftPaneResizeRef = useRef<PaneResizeGesture | undefined>(undefined);
  const [frozenPaneWidth, setFrozenPaneWidth] = useState(209);
  const frozenPaneResizeRef = useRef<PaneResizeGesture | undefined>(undefined);
  const [inspectorWidth, setInspectorWidth] = useState(297);
  const inspectorResizeRef = useRef<PaneResizeGesture | undefined>(undefined);
  const [bottomHeight, setBottomHeight] = useState(240);
  const bottomResizeRef = useRef<VerticalResizeGesture | undefined>(undefined);

  const [treeFilter, setTreeFilter] = useState("");
  const [transactionTreeFilter, setTransactionTreeFilter] = useState("");
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
  const [pinnedBottomSelection, setPinnedBottomSelection] = useState<BottomPinnedSelection<SignalId, GroupId, AnnotationId, TransactionId>>();

  return {
    ribbonTab, setRibbonTab,
    bottomTab, setBottomTab,
    viewMode, setViewMode,
    activeContext, setActiveContext,
    signalSplitEnabled, setSignalSplitEnabled,
    signalSplitRatio, setSignalSplitRatio, signalSplitResizeRef,
    density, setDensity,
    workspacePreset, setWorkspacePreset,
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
    treeFilter, setTreeFilter, transactionTreeFilter, setTransactionTreeFilter,
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
