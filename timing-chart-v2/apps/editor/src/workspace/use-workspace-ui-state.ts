import { useRef, useState } from "react";

export type DensityMode = "compact" | "comfortable";
export type WorkspacePreset = "waveform" | "edit" | "review" | "transaction";
export type TreeTypeFilter = "all" | "input" | "output" | "wire" | "comment";
export type BottomTab = "Signal" | "Annotation" | "Transaction" | "Problems" | "JSON";
export type ViewMode = "Cycle" | "Transaction" | "Split";

export const LEFT_PANE_MIN_WIDTH = 265;
export const LEFT_PANE_MAX_WIDTH = 420;

export type PaneResizeGesture = { readonly startX: number; readonly startWidth: number };
export type VerticalResizeGesture = { readonly startY: number; readonly startHeight: number };

/** Owns presentation-only workspace UI state: ribbon/bottom tabs, view mode,
 * density/workspace presets, pane visibility, pane/bottom sizes and their
 * resize-gesture scratch refs, and the Left Tree filter. None of this is
 * Document/Selection/Timeline canonical state -- every setter here only
 * ever affects layout/chrome, never the .tcd document or command history. */
export function useWorkspaceUiState() {
  const [ribbonTab, setRibbonTab] = useState("Home");
  const [bottomTab, setBottomTab] = useState<BottomTab>("Signal");
  const [viewMode, setViewMode] = useState<ViewMode>("Cycle");
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [workspacePreset, setWorkspacePreset] = useState<WorkspacePreset>("edit");

  const [signalTreeVisible, setSignalTreeVisible] = useState(true);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [inspectorResetToken, setInspectorResetToken] = useState(0);
  const [bottomResetToken, setBottomResetToken] = useState(0);
  const [bottomVisible, setBottomVisible] = useState(true);

  const [leftPaneWidth, setLeftPaneWidth] = useState(LEFT_PANE_MIN_WIDTH);
  const leftPaneResizeRef = useRef<PaneResizeGesture | undefined>(undefined);
  const [frozenPaneWidth, setFrozenPaneWidth] = useState(209);
  const frozenPaneResizeRef = useRef<PaneResizeGesture | undefined>(undefined);
  const [inspectorWidth, setInspectorWidth] = useState(297);
  const inspectorResizeRef = useRef<PaneResizeGesture | undefined>(undefined);
  const [bottomHeight, setBottomHeight] = useState(240);
  const bottomResizeRef = useRef<VerticalResizeGesture | undefined>(undefined);

  const [treeFilter, setTreeFilter] = useState("");
  const [treeTypeFilter, setTreeTypeFilter] = useState<TreeTypeFilter>("all");

  return {
    ribbonTab, setRibbonTab,
    bottomTab, setBottomTab,
    viewMode, setViewMode,
    density, setDensity,
    workspacePreset, setWorkspacePreset,
    signalTreeVisible, setSignalTreeVisible,
    inspectorVisible, setInspectorVisible,
    inspectorResetToken, setInspectorResetToken,
    bottomResetToken, setBottomResetToken,
    bottomVisible, setBottomVisible,
    leftPaneWidth, setLeftPaneWidth, leftPaneResizeRef,
    frozenPaneWidth, setFrozenPaneWidth, frozenPaneResizeRef,
    inspectorWidth, setInspectorWidth, inspectorResizeRef,
    bottomHeight, setBottomHeight, bottomResizeRef,
    treeFilter, setTreeFilter,
    treeTypeFilter, setTreeTypeFilter,
  } as const;
}

export type WorkspaceUiState = ReturnType<typeof useWorkspaceUiState>;
