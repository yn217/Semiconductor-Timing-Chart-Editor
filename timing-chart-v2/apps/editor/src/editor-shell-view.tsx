import type { CSSProperties, ComponentProps, ReactNode } from "react";
import { EditorRibbon, type EditorRibbonProps } from "./ribbon/editor-ribbon.js";
import { EditorWorkspaceView, type EditorWorkspaceViewModel } from "./editor-workspace-view.js";
import { EditorStatusBar } from "./minimal-cycle-view-panels.js";

export interface EditorShellViewModel {
  readonly style: CSSProperties;
  readonly density: string;
  readonly workspacePreset: string;
  readonly inspectorVisible: boolean;
  readonly bottomVisible: boolean;
  readonly viewMode: "Cycle" | "Transaction" | "Split";
  readonly rulerEnabled: boolean;
  readonly minimapEnabled: boolean;
  readonly signalTreeVisible: boolean;
  readonly showSignalNames: boolean;
  readonly showRoles: boolean;
  readonly showAnnotations: boolean;
  readonly showTransactions: boolean;
  readonly showGroupBackground: boolean;
  readonly layoutOverflow: string;
  readonly leftPaneWidth: number;
  readonly frozenPaneWidth: number;
  readonly bottomHeight: number;
  readonly inspectorWidth: number;
  readonly cycleCount: number;
  readonly signalCount: number;
  readonly transactionCount: number;
}

export interface EditorShellRibbonViewModel {
  readonly tabs: ReactNode;
  readonly main: EditorRibbonProps;
}

export type EditorShellStatusViewModel = ComponentProps<typeof EditorStatusBar>;

export interface EditorShellViewProps {
  readonly viewModel: EditorShellViewModel;
  readonly titleBar: ReactNode;
  readonly ribbon: EditorShellRibbonViewModel | ReactNode;
  readonly workspace: EditorWorkspaceViewModel | ReactNode;
  readonly dialogs: ReactNode;
  readonly status: EditorShellStatusViewModel | ReactNode;
}

/** Owns the stable outer shell contract; feature owners supply its contents. */
export function EditorShellView({
  viewModel, titleBar, ribbon, workspace, dialogs, status,
}: EditorShellViewProps) {
  const {
    style, density, workspacePreset, inspectorVisible, bottomVisible, viewMode, rulerEnabled,
    minimapEnabled, signalTreeVisible, showSignalNames, showRoles, showAnnotations,
    showTransactions, showGroupBackground, layoutOverflow, leftPaneWidth,
    frozenPaneWidth, bottomHeight, inspectorWidth, cycleCount, signalCount,
    transactionCount,
  } = viewModel;
  const ribbonContent = typeof ribbon === "object" && ribbon !== null && "main" in ribbon
    ? <>{ribbon.tabs}<EditorRibbon {...ribbon.main} /></>
    : ribbon;
  const workspaceContent = typeof workspace === "object" && workspace !== null && "view" in workspace
    ? <EditorWorkspaceView viewModel={workspace} />
    : workspace;
  const statusContent = typeof status === "object" && status !== null && "toolStatus" in status
    ? <EditorStatusBar {...status} />
    : status;
  return <main
    className="editor-shell"
    style={style}
    data-density={density}
    data-workspace-preset={workspacePreset}
    data-inspector-visible={String(inspectorVisible)}
    data-bottom-visible={String(bottomVisible)}
    data-view-mode={viewMode}
    data-ruler-enabled={String(rulerEnabled)}
    data-minimap-enabled={String(minimapEnabled)}
    data-signal-tree-visible={String(signalTreeVisible)}
    data-show-signal-names={String(showSignalNames)}
    data-show-roles={String(showRoles)}
    data-show-annotations={String(showAnnotations)}
    data-show-transactions={String(showTransactions)}
    data-show-group-background={String(showGroupBackground)}
    data-layout-overflow={layoutOverflow}
    data-left-pane-width={leftPaneWidth}
    data-frozen-pane-width={frozenPaneWidth}
    data-bottom-height={bottomHeight}
    data-inspector-width={inspectorWidth}
    data-cycle-count={cycleCount}
    data-signal-count={signalCount}
    data-transaction-count={transactionCount}
  >{titleBar}{ribbonContent}{workspaceContent}{dialogs}{statusContent}</main>;
}
