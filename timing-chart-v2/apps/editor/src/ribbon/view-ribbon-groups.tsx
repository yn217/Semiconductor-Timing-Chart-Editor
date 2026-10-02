import type { RibbonGroupSpec } from "../ribbon-schema.js";
import { DsRibbonButton, DsRibbonSelect, DsRibbonToggle, DsRibbonToggleButton } from "../design-system.js";
import { RibbonIcon } from "../ribbon-icon.js";
import type { ViewMode } from "../workspace/use-workspace-ui-state.js";

export type DensityMode = "compact" | "comfortable";
export type WorkspacePreset = "waveform" | "edit" | "review" | "transaction";

export type ViewRibbonContext = Readonly<{
  viewMode: ViewMode;
  zoom: number; selectedCycle: number; cursorA: number | undefined; cursorB: number | undefined;
  gridEnabled: boolean; snapEnabled: boolean; rulerEnabled: boolean; minimapEnabled: boolean; signalSplitEnabled: boolean;
  showSignalNames: boolean; showRoles: boolean; showAnnotations: boolean; showTransactions: boolean; showGroupBackground: boolean;
  signalTreeVisible: boolean; inspectorVisible: boolean; bottomVisible: boolean; bottomHeight: number;
  density: DensityMode; workspacePreset: WorkspacePreset;
  onToggleSignalSplit: () => void; onSetBottomSize: (size: "compact" | "expanded") => void;
  onSetCursorA: () => void; onSetCursorB: () => void; onClearCursors: () => void; onSwapCursors: () => void;
  onZoom: (delta: number) => void; onSetZoom: (zoom: number) => void; onFitAll: () => void; onFitSelection: () => void;
  onToggleGrid: () => void; onToggleSnap: () => void; onToggleRuler: () => void; onToggleMinimap: () => void;
  onToggleSignalNames: () => void; onToggleRoles: () => void; onToggleAnnotations: () => void; onToggleTransactions: () => void; onToggleGroupBackground: () => void;
  onToggleSignalTree: () => void; onToggleInspector: () => void; onToggleBottom: () => void;
  onDensityChange: (density: DensityMode) => void; onWorkspacePresetChange: (preset: WorkspacePreset) => void; onResetLayout: () => void;
}>;

/** View-tab Ribbon groups (#615): Show, Panels, Guides, Zoom, Cursor, Workspace, Layout. */
export function buildViewRibbonGroups(context: ViewRibbonContext): readonly RibbonGroupSpec[] {
  const { viewMode, zoom, selectedCycle, cursorA, cursorB, gridEnabled, snapEnabled, rulerEnabled, minimapEnabled, signalSplitEnabled, showSignalNames, showRoles, showAnnotations, showTransactions, showGroupBackground, signalTreeVisible, inspectorVisible, bottomVisible, bottomHeight, density, workspacePreset, onToggleSignalSplit, onSetBottomSize, onSetCursorA, onSetCursorB, onClearCursors, onSwapCursors, onZoom, onSetZoom, onFitAll, onFitSelection, onToggleGrid, onToggleSnap, onToggleRuler, onToggleMinimap, onToggleSignalNames, onToggleRoles, onToggleAnnotations, onToggleTransactions, onToggleGroupBackground, onToggleSignalTree, onToggleInspector, onToggleBottom, onDensityChange, onWorkspacePresetChange, onResetLayout } = context;
  return [
    {
      id: "view-show", majorGroup: "Show", caption: "Show", items: [
        { kind: "custom", id: "show-labels", render: () => <div key="show-labels" className="view-display-subgroup" data-display-kind="labels" aria-label="Labels and structure"><span>Labels / Structure</span><DsRibbonToggle dataTestId="view-show-signal-names" checked={showSignalNames} label="Signal Names" onChange={onToggleSignalNames} /><DsRibbonToggle dataTestId="view-show-roles" checked={showRoles} label="Roles" onChange={onToggleRoles} /><DsRibbonToggle dataTestId="view-show-group-background" checked={showGroupBackground} label="Group Background" onChange={onToggleGroupBackground} /></div> },
        { kind: "custom", id: "show-overlays", render: () => <div key="show-overlays" className="view-display-subgroup" data-display-kind="overlays" aria-label="Overlays"><span>Overlays</span><DsRibbonToggle dataTestId="view-show-annotations" checked={showAnnotations} label="Annotations" onChange={onToggleAnnotations} /><DsRibbonToggle dataTestId="view-show-transactions" checked={showTransactions} label="Transactions" onChange={onToggleTransactions} /></div> },
      ],
    },
    {
      id: "view-panels", majorGroup: "Panels", caption: "Panels", items: [
        { kind: "custom", id: "panel-inspector", render: () => <DsRibbonToggleButton key="panel-inspector" ariaLabel="Inspector" checked={inspectorVisible} icon={<RibbonIcon name="i-panel-right" />} onClick={onToggleInspector}>Inspector</DsRibbonToggleButton> },
        { kind: "custom", id: "panel-bottom", render: () => <DsRibbonToggleButton key="panel-bottom" ariaLabel="Bottom Editor" checked={bottomVisible} icon={<RibbonIcon name="i-panel-bottom" />} onClick={onToggleBottom}><span>Bottom</span><span>Editor</span></DsRibbonToggleButton> },
        // #431 P0-1: Bottom Panel Hidden/Compact/Expanded -- Hidden stays
        // the existing "Bottom Editor" toggle above (unchanged behavior,
        // unchanged tests); these two presets cover the other half without
        // a new state owner (both call the *same* setBottomHeight the drag
        // handle already uses, just at its own documented min/max -- see
        // bottom-resizer's aria-valuemin/max). Selecting either preset
        // also shows the panel if it was hidden (one click from Hidden
        // straight to a usable size); each button reads "selected" only
        // when the panel is visible AND already exactly at that height,
        // not merely "closest to" (a manual drag in between shows neither
        // as selected, which is correct -- it's neither preset anymore).
        { kind: "custom", id: "bottom-size-compact", render: () => <DsRibbonToggleButton key="bottom-size-compact" dataTestId="view-panel-bottom-compact" ariaLabel="Bottom Compact" checked={bottomVisible && bottomHeight === 180} icon={<RibbonIcon name="i-panel-bottom-compact" />} onClick={() => onSetBottomSize("compact")}>Compact</DsRibbonToggleButton> },
        { kind: "custom", id: "bottom-size-expanded", render: () => <DsRibbonToggleButton key="bottom-size-expanded" dataTestId="view-panel-bottom-expanded" ariaLabel="Bottom Expanded" checked={bottomVisible && bottomHeight === 420} icon={<RibbonIcon name="i-panel-bottom-expanded" />} onClick={() => onSetBottomSize("expanded")}>Expanded</DsRibbonToggleButton> },
        { kind: "custom", id: "panel-tree", render: () => <DsRibbonToggleButton key="panel-tree" dataTestId="view-panel-tree" ariaLabel="Signal Tree" checked={signalTreeVisible} icon={<RibbonIcon name="i-panel-left" />} onClick={onToggleSignalTree}>Signal Tree</DsRibbonToggleButton> },
        { kind: "custom", id: "panel-minimap", render: () => <DsRibbonToggleButton key="panel-minimap" dataTestId="view-panel-minimap" ariaLabel="MiniMap" checked={minimapEnabled} icon={<RibbonIcon name="i-minimap" />} onClick={onToggleMinimap}>MiniMap</DsRibbonToggleButton> },
        // Named "Signal Split" (not just "Split") specifically to stay
        // distinct from the unrelated Cycle/Transaction/Split ViewMode tab
        // group -- this toggles two independent-scroll viewports over the
        // *same* Cycle signal list, not a different view mode.
        ...(viewMode === "Cycle" ? [{ kind: "custom", id: "panel-signal-split", render: () => <DsRibbonToggleButton key="panel-signal-split" dataTestId="view-panel-signal-split" ariaLabel="Signal Split" title="Show two vertically independent views of the same Cycle signal list." checked={signalSplitEnabled} icon={<RibbonIcon name="i-group" />} onClick={onToggleSignalSplit}><span>Signal</span><span>Split</span></DsRibbonToggleButton> }] as const : []),
      ],
    },
    {
      id: "view-guides", majorGroup: "Guides", caption: "Guides", items: [
        { kind: "toggle", id: "grid", label: "Grid", testId: "grid-toggle", checked: gridEnabled, onChange: onToggleGrid },
        { kind: "toggle", id: "snap", label: "Snap", testId: "snap-toggle", checked: snapEnabled, onChange: onToggleSnap },
        { kind: "toggle", id: "ruler", label: "Ruler", testId: "ruler-toggle", checked: rulerEnabled, onChange: onToggleRuler },
      ],
    },
    {
      id: "view-zoom", majorGroup: "Zoom", caption: "Zoom", items: [
        { kind: "button", id: "zoom-out", icon: "i-zoom-out", label: "Zoom Out", v1Label: "ズーム−", onClick: () => onZoom(-0.25) },
        { kind: "custom", id: "zoom-preset", render: () => <span key="zoom-preset" className="view-zoom-preset"><DsRibbonSelect ariaLabel="Zoom preset" value={String(Math.round(zoom * 100))} onChange={(event) => onSetZoom(Number(event.target.value) / 100)}><option value="50">50%</option><option value="100">100%</option><option value="150">150%</option><option value="200">200%</option><option value="400">400%</option><option value="800">800%</option></DsRibbonSelect><output className="visually-hidden" data-testid="zoom-status" aria-label="Current zoom">{Math.round(zoom * 100)}%</output></span> },
        { kind: "button", id: "zoom-in", icon: "i-zoom-in", label: "Zoom In", v1Label: "ズーム＋", onClick: () => onZoom(0.25) },
        { kind: "custom", id: "fit-actions", render: () => <div key="fit-actions" aria-label="Fit commands" style={{ display: "flex", gap: "5px" }}><DsRibbonButton icon={<RibbonIcon name="i-fit" />} v1Label="全体表示" onClick={onFitAll}>Fit All</DsRibbonButton><DsRibbonButton icon={<RibbonIcon name="i-select-fit" />} onClick={onFitSelection}>Fit Selection</DsRibbonButton></div> },
      ],
    },
    {
      // #431/#459: Cursor A/B had a fully-built view-only state API
      // (use-workspace-ui-state.ts) with zero GUI anywhere. Set A/Set B
      // stamp the *currently selected cycle* (same value the status bar's
      // "Cycle N" already shows) onto that cursor; Clear/Swap act on both.
      // View-only: no Canonical/History/Dirty involvement, same as every
      // other control in this group.
      id: "view-cursor", majorGroup: "Cursor", caption: "Cursor", items: [
        { kind: "custom", id: "cursor-set-a", render: () => <DsRibbonButton key="cursor-set-a" dataTestId="cursor-set-a" ariaLabel="Set Cursor A" title={`Set Cursor A to the current cycle (${selectedCycle})`} icon={<RibbonIcon name="i-ruler" />} onClick={onSetCursorA}><span>Set</span><span>A</span></DsRibbonButton> },
        { kind: "custom", id: "cursor-set-b", render: () => <DsRibbonButton key="cursor-set-b" dataTestId="cursor-set-b" ariaLabel="Set Cursor B" title={`Set Cursor B to the current cycle (${selectedCycle})`} icon={<RibbonIcon name="i-ruler" />} onClick={onSetCursorB}><span>Set</span><span>B</span></DsRibbonButton> },
        { kind: "custom", id: "cursor-swap", render: () => <DsRibbonButton key="cursor-swap" dataTestId="cursor-swap" ariaLabel="Swap Cursor A and B" icon={<RibbonIcon name="i-rotate-right" />} disabled={cursorA === undefined && cursorB === undefined} onClick={onSwapCursors}>Swap</DsRibbonButton> },
        { kind: "custom", id: "cursor-clear", render: () => <DsRibbonButton key="cursor-clear" dataTestId="cursor-clear" ariaLabel="Clear Cursors" icon={<RibbonIcon name="i-clear-format" />} disabled={cursorA === undefined && cursorB === undefined} onClick={onClearCursors}>Clear</DsRibbonButton> },
      ],
    },
    {
      id: "view-workspace", majorGroup: "Workspace", caption: "Workspace", items: [
        { kind: "custom", id: "workspace-preset", render: () => <label key="workspace-preset" className="view-workspace-field">Workspace<DsRibbonSelect ariaLabel="Workspace preset" value={workspacePreset} onChange={(event) => onWorkspacePresetChange(event.target.value as WorkspacePreset)}><option value="edit">Edit</option><option value="waveform">Waveform Focus</option><option value="review">Review</option><option value="transaction">Transaction</option></DsRibbonSelect></label> },
        { kind: "custom", id: "workspace-density", render: () => <label key="workspace-density" className="view-workspace-field">Density<DsRibbonSelect ariaLabel="UI density" value={density} onChange={(event) => onDensityChange(event.target.value as DensityMode)}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></DsRibbonSelect></label> },
      ],
    },
    {
      id: "view-layout", majorGroup: "Layout", caption: "Layout", items: [
        { kind: "button", id: "reset-layout", icon: "i-settings", label: "Reset Layout", onClick: onResetLayout },
        // Accessible name stays the fixed "Focus Waveform" regardless of
        // toggled state (only the visible label flips to "Restore
        // Panels") -- a stable name for this one control across both
        // states, same as the pre-migration button's own hardcoded
        // ariaLabel.
        { kind: "button", id: "focus-waveform", icon: "i-preview", label: workspacePreset === "waveform" ? "Restore Panels" : "Focus Waveform", ariaLabel: "Focus Waveform", onClick: () => onWorkspacePresetChange(workspacePreset === "waveform" ? "edit" : "waveform") },
      ],
    },
  ];
}
