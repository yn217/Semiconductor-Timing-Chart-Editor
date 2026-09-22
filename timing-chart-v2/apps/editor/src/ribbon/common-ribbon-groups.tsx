import type { CanonicalDocument } from "@timing-chart-v2/schema";
import type { HistoryState } from "@timing-chart-v2/history";
import type { EditorSurfaceCommandController } from "../application/editor-surface-command-controller.js";
import type { RibbonGroupSpec } from "../ribbon-schema.js";
import { FindReplacePanel } from "../find-replace-panel.js";
import type { ActiveContext, ViewMode } from "../workspace/use-workspace-ui-state.js";

export type CommonRibbonContext = Readonly<{
  document: CanonicalDocument; history: HistoryState; viewMode: ViewMode; activeContext: ActiveContext;
  commands: EditorSurfaceCommandController; clipboardStatus: string; clipboardAvailable: boolean;
  hasSelectedClipboard: boolean; hasDeletableSelection: boolean; hasSelectableSignals: boolean;
  gridEnabled: boolean; snapEnabled: boolean; rulerEnabled: boolean; minimapEnabled: boolean;
  onNew: () => void; onOpen: () => void; onSave: () => void; onSaveAs: () => void;
  onUndo: () => void; onRedo: () => void; onCut: () => void; onCopy: () => void; onPaste: () => void; onDelete: () => void; onDuplicate: () => void; onSelectAll: () => void;
  onZoom: (delta: number) => void; onSetZoom: (zoom: number) => void; onFitAll: () => void; onFitSelection: () => void;
  onToggleGrid: () => void; onToggleSnap: () => void; onToggleRuler: () => void; onToggleMinimap: () => void;
}>;

/** Home Ribbon groups shared by every mode (#615): File, Edit, Zoom, Display. */
export function buildCommonRibbonGroups(context: CommonRibbonContext): readonly RibbonGroupSpec[] {
  const { document, history, viewMode, activeContext, commands, clipboardStatus, clipboardAvailable, hasSelectedClipboard, hasDeletableSelection, hasSelectableSignals, gridEnabled, snapEnabled, rulerEnabled, minimapEnabled, onNew, onOpen, onSave, onSaveAs, onUndo, onRedo, onCut, onCopy, onPaste, onDelete, onDuplicate, onSelectAll, onZoom, onSetZoom, onFitAll, onFitSelection, onToggleGrid, onToggleSnap, onToggleRuler, onToggleMinimap } = context;
  return [
    {
      id: "file", majorGroup: "File", caption: "File", items: [
        { kind: "button", id: "new", icon: "i-new", label: "New", v1Label: "新規", onClick: onNew },
        { kind: "button", id: "open", icon: "i-open", label: "Open", v1Label: "開く", onClick: onOpen },
        { kind: "button", id: "save", icon: "i-save", label: "Save", v1Label: "保存", onClick: onSave },
        { kind: "button", id: "save-as", icon: "i-save", label: "Save As", v1Label: "名前を付けて保存", onClick: onSaveAs },
      ],
    },
    {
      id: "edit", majorGroup: "Edit", caption: "Edit", items: [
        { kind: "button", id: "undo", icon: "i-undo", label: "Undo", v1Label: "元に戻す", onClick: onUndo, disabled: !history.canUndo },
        { kind: "button", id: "redo", icon: "i-redo", label: "Redo", v1Label: "やり直し", onClick: onRedo, disabled: !history.canRedo },
        // hasSelectedClipboard (not hasSelectedSignal): the actual cut()
        // handler supports Signal/Group/Spacer/Transaction/Annotation, and
        // Context Menu's Cut already gates on hasSelectedClipboard -- this
        // button previously used the narrower hasSelectedSignal, disabling
        // Cut for a selected Annotation/Group/Transaction even though the
        // command router fully supports it (#195).
        { kind: "button", id: "cut", icon: "i-cut", label: "Cut", v1Label: "切取", onClick: onCut, disabled: !hasSelectedClipboard },
        { kind: "button", id: "copy", icon: "i-copy", label: "Copy", v1Label: "コピー", onClick: onCopy, disabled: !hasSelectedClipboard, title: "Copy is view-only" },
        { kind: "button", id: "paste", icon: "i-paste", label: "Paste", v1Label: "貼付", onClick: onPaste, disabled: !clipboardAvailable, title: clipboardStatus },
        { kind: "button", id: "delete", icon: "i-delete", label: "Delete", v1Label: "削除", onClick: onDelete, disabled: !hasDeletableSelection },
        // #439: "wide" -- "Duplicate" is one word that doesn't fit the
        // default Home button width without breaking mid-word.
        { kind: "button", id: "duplicate", icon: "i-duplicate", label: "Duplicate", v1Label: "複製", size: "wide", onClick: onDuplicate, disabled: !hasSelectedClipboard },
        // #439: "Select All Signals" wrapped to 3 stacked one-word lines at
        // the standard 44px Home button width (Select / All / Signals) --
        // over the issue's own 2-line limit. Shortened to the 2-word "Select
        // All" (wraps cleanly to 2 lines, matching "Fit Selection"'s shape);
        // the full meaning stays on the accessible name/tooltip.
        { kind: "button", id: "select-all", icon: "i-select-all", label: "Select All", ariaLabel: "Select All Signals", title: "Select All Signals", onClick: onSelectAll, disabled: !hasSelectableSignals },
        { kind: "custom", id: "find-replace", render: () => <FindReplacePanel key="find-replace" document={document} mode={viewMode === "Transaction" || (viewMode === "Split" && activeContext === "Transaction") ? "transactions" : "signals"} onRenameSignals={commands.renameSignals} onRenameTransactions={commands.renameTransactions} /> },
        { kind: "custom", id: "clipboard-status", render: () => <small key="clipboard-status" data-testid="clipboard-status">{clipboardStatus}</small> },
      ],
    },
    {
      // #437 command ownership matrix: Zoom In/Out/100%/Fit All/Fit
      // Selection are DUPLICATED between Home and View by explicit design,
      // not oversight -- View/Panels is the conceptual "Workspace display"
      // owner (visibility/zoom/layout settings live there), Home keeps a
      // quick-access copy so zooming/fitting doesn't force a tab switch
      // mid-edit (the same "frequent command stays on Home" reasoning
      // Edit/Cut/Copy/Paste already follow). Both routes bind the exact
      // same onZoom/onSetZoom/onFitAll/onFitSelection callbacks and the
      // same `zoom` value -- one state owner, never a second Zoom/Fit
      // implementation to drift out of sync. Removing either route
      // entirely is a product decision (which tab loses a control users
      // already rely on) out of this pass's scope -- see #437.
      id: "view", majorGroup: "Zoom", caption: "Zoom", items: [
        { kind: "button", id: "zoom-out", icon: "i-zoom-out", label: "Zoom Out", v1Label: "ズーム−", onClick: () => onZoom(-0.25) },
        { kind: "button", id: "zoom-reset", icon: "i-zoom-reset", label: "100%", ariaLabel: "Reset zoom to 100%", onClick: () => onSetZoom(1) },
        { kind: "button", id: "zoom-in", icon: "i-zoom-in", label: "Zoom In", v1Label: "ズーム＋", onClick: () => onZoom(0.25) },
        { kind: "button", id: "fit-all", icon: "i-fit", label: "Fit All", v1Label: "全体表示", onClick: onFitAll },
        // #439: "wide" -- "Selection" doesn't fit the default Home button
        // width without breaking mid-word.
        { kind: "button", id: "fit-selection", icon: "i-select-fit", label: "Fit Selection", size: "wide", onClick: onFitSelection },
      ],
    },
    {
      // #437: Grid/Snap/Ruler/MiniMap are ALSO duplicated on View's own
      // Guides/Panels groups (minimal-cycle-view-ribbon.tsx's `viewGroups`
      // below) -- same reasoning as the Zoom group above, and the same
      // guarantee: `checked`/`onChange` here are the identical
      // gridEnabled/snapEnabled/rulerEnabled/minimapEnabled props and
      // onToggle* callbacks View's own toggles use, so a stale
      // checked-here-unchecked-there state can't happen by construction.
      id: "display", majorGroup: "Display", caption: "Display", items: [
        { kind: "toggle", id: "grid", label: "Grid", testId: "home-grid-toggle", checked: gridEnabled, onChange: onToggleGrid },
        { kind: "toggle", id: "minimap", label: "MiniMap", testId: "home-minimap-toggle", checked: minimapEnabled, onChange: onToggleMinimap },
        { kind: "toggle", id: "snap", label: "Snap", testId: "home-snap-toggle", checked: snapEnabled, onChange: onToggleSnap },
        { kind: "toggle", id: "ruler", label: "Ruler", testId: "home-ruler-toggle", checked: rulerEnabled, onChange: onToggleRuler },
      ],
    },
  ];
}
