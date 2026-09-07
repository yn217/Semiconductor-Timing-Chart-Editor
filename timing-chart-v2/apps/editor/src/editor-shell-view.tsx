import type { CSSProperties, ReactNode } from "react";

export interface EditorShellViewProps {
  readonly style: CSSProperties;
  readonly density: string;
  readonly workspacePreset: string;
  readonly inspectorVisible: boolean;
  readonly bottomVisible: boolean;
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
  readonly titleBar: ReactNode;
  readonly ribbon: ReactNode;
  readonly children: ReactNode;
}

/** Owns the stable outer shell contract; feature owners supply its contents. */
export function EditorShellView({
  style, density, workspacePreset, inspectorVisible, bottomVisible, rulerEnabled,
  minimapEnabled, signalTreeVisible, showSignalNames, showRoles, showAnnotations,
  showTransactions, showGroupBackground, layoutOverflow, leftPaneWidth,
  frozenPaneWidth, bottomHeight, inspectorWidth, cycleCount, signalCount,
  transactionCount, titleBar, ribbon, children,
}: EditorShellViewProps) {
  return <main
    className="editor-shell"
    style={style}
    data-density={density}
    data-workspace-preset={workspacePreset}
    data-inspector-visible={String(inspectorVisible)}
    data-bottom-visible={String(bottomVisible)}
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
  >{titleBar}{ribbon}{children}</main>;
}
