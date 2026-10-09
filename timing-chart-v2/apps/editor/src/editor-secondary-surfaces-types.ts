import type { Dispatch, KeyboardEvent, MutableRefObject, ReactNode, RefObject, SetStateAction } from "react";
import type { ChangeSet, CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { HistoryState } from "@timing-chart-v2/history";
import type { Annotation, AnnotationId, Bookmark, CanonicalDocument, CommandId, DocumentProblem, GroupId, ScenarioDocumentModel, ScenarioId, Signal, SignalGroup, SignalGroupStyle, SignalId, Transaction, TransactionGroup, TransactionId } from "@timing-chart-v2/schema";
import type { UiCommandRegistry } from "@timing-chart-v2/ui";
import type { EditorApplicationOwner } from "./application/use-editor-application-owner.js";
import type { EditorActions } from "./application/use-editor-actions.js";
import type { ClipboardActions } from "./application/clipboard-actions.js";
import type { TransactionTreeFilterMode, ActiveContext, BottomTab, TreeTypeFilter, ViewMode } from "./workspace/use-workspace-ui-state.js";
import type { EditorSurfaceCommandController } from "./application/editor-surface-command-controller.js";
import type { ContextMenuState } from "./workspace/use-dialog-menu-state.js";
import type { AIBridgeStatus } from "./ai-bridge-client.js";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Ref<T> = RefObject<T | null>;

export interface EditorSecondarySurfacesInput {
  readonly scenario: Readonly<{ model: ScenarioDocumentModel | undefined; activeScenarioId: ScenarioId | undefined; generateHandshakeScenarios: (scenarioId: ScenarioId, selectedKeys: readonly string[]) => readonly ScenarioId[] }>;
  readonly setBottomVisible: (visible: boolean) => void;
  readonly document: CanonicalDocument;
  readonly changeSet: ChangeSet;
  readonly validationDiagnostics: readonly DocumentProblem[];
  readonly validationPending: boolean;
  readonly documentEpoch: number;
  readonly revision: number;
  readonly transactionPresentationRevision: number;
  readonly history: HistoryState;
  readonly problem: string;
  readonly diagnostics: readonly DocumentProblem[];
  readonly refs: {
    readonly host: Ref<HTMLDivElement>;
    readonly viewport: Ref<HTMLDivElement>;
    readonly groupStylePreviewRef: MutableRefObject<(groupId: GroupId, style: SignalGroupStyle | undefined) => void>;
    readonly menuOriginRef: MutableRefObject<HTMLElement | null>;
    readonly transactionBoundaryX: MutableRefObject<(cycle: number) => number | undefined>;
    readonly transactionSourceWindow: MutableRefObject<(viewport: HTMLElement) => Readonly<{ start: number; end: number }> | undefined>;
    readonly snapTransactionCycle: MutableRefObject<(clientX: number, surfaceLeft?: number, horizontalScroll?: number) => number | undefined>;
  };
  readonly command: {
    readonly registry: MutableRefObject<UiCommandRegistry>;
    readonly execute: (command: SemanticCommand) => CommandResult;
    readonly undo: () => CommandResult;
    readonly redo: () => CommandResult;
    readonly executeBatch: (id: CommandId, commands: readonly SemanticCommand[]) => CommandResult;
    readonly nextCommandId: (operation: string) => CommandId;
  };
  readonly selected: {
    readonly signal: Signal | undefined;
    readonly signalIds: ReadonlySet<SignalId>;
    readonly group: SignalGroup | undefined;
    readonly annotation: Annotation | undefined;
    readonly transaction: Transaction | undefined;
    readonly transactionIds: ReadonlySet<TransactionId>;
    readonly bookmark: Bookmark | undefined;
    readonly transactionId: TransactionId | undefined;
    readonly legendSelected: boolean;
  };
  readonly bottom: {
    readonly signal: Signal | undefined;
    readonly group: SignalGroup | undefined;
    readonly annotation: Annotation | undefined;
    readonly transaction: Transaction | undefined;
    readonly bookmark: Bookmark | undefined;
  };
  readonly timeline: {
    readonly range: Readonly<{ start: number; end: number }>;
    readonly selectedCycle: number;
    readonly collapsedGroupIds: ReadonlySet<GroupId>;
    readonly setCollapsedGroups: (next: ReadonlySet<GroupId>) => void;
    readonly toggleCollapsedGroup: (id: GroupId) => void;
  };
  readonly workspace: {
    readonly viewMode: ViewMode;
    readonly setViewMode: (mode: ViewMode) => void;
    readonly activeContext: ActiveContext;
    readonly focusLinkedSignals: boolean;
    readonly setFocusLinkedSignals: (value: boolean) => void;
    readonly bottomTabs: readonly BottomTab[];
    readonly bottomTab: BottomTab;
    readonly setBottomTab: (tab: BottomTab) => void;
    readonly selectBottomTab: (tab: BottomTab) => void;
    readonly onBottomTabKeyDown: (event: KeyboardEvent<HTMLButtonElement>, tab: BottomTab) => void;
    readonly followSelection: boolean;
    readonly setFollowSelection: (value: boolean) => void;
    readonly bottomPinned: boolean;
    readonly toggleBottomPin: () => void;
    readonly treeFilter: string;
    readonly setTreeFilter: (value: string) => void;
    readonly treeTypeFilter: TreeTypeFilter;
    readonly setTreeTypeFilter: (value: TreeTypeFilter) => void;
    readonly transactionTreeFilter: string;
    readonly setTransactionTreeFilter: (value: string) => void;
    readonly transactionTreeFilterMode: TransactionTreeFilterMode;
    readonly setTransactionTreeFilterMode: (value: TransactionTreeFilterMode) => void;
    readonly cyclesPerTc: number;
    readonly setCyclesPerTc: (value: number) => void;
    readonly setRibbonTab: (tab: string) => void;
  };
  readonly dialog: {
    readonly treeAddMenuOpen: boolean;
    readonly setTreeAddMenuOpen: Setter<boolean>;
    readonly treeMoreMenuOpen: boolean;
    readonly setTreeMoreMenuOpen: Setter<boolean>;
    readonly bulkRegistrationText: string;
    readonly setBulkRegistrationText: (value: string) => void;
    readonly bulkRegistrationGroupId: GroupId | undefined;
    readonly setBulkRegistrationGroupId: (value: GroupId | undefined) => void;
    readonly bulkRegistrationStatus: string;
    readonly setBulkRegistrationStatus: (value: string) => void;
    readonly setBulkRegistrationVisible: (value: boolean) => void;
    readonly setHierarchyVisible: (value: boolean) => void;
    readonly contextMenu: ContextMenuState | undefined;
    readonly setContextMenu: (value: ContextMenuState | undefined) => void;
    readonly closeTreeAddMenu: () => void;
    readonly closeTreeMoreMenu: () => void;
    readonly bottomResetToken: number;
    readonly setBottomResetToken: Setter<number>;
    readonly inspectorResetToken: number;
    readonly setInspectorResetToken: Setter<number>;
    readonly setInspectorVisible: (value: boolean) => void;
  };
  readonly annotationTargetSignalId: SignalId | undefined;
  readonly referenceClockName: string | undefined;
  readonly zoom: number;
  readonly editActions: ClipboardActions;
  readonly actions: EditorActions;
  readonly setRuntimeDiagnostics: EditorApplicationOwner["setRuntimeDiagnostics"];
  readonly navigateProblem: (path: string, problem?: DocumentProblem) => void;
  readonly ai: { readonly getZoom: () => number; readonly fitAll: () => void; readonly fitSelection: () => void; readonly fitSourceRange: (startCycle: number, endCycle: number) => boolean };
}

export interface EditorSecondarySurfacesOutput {
  readonly surfaceCommands: EditorSurfaceCommandController;
  readonly workspaceHeader: ReactNode;
  readonly workspaceSignalHeader?: ReactNode;
  readonly workspaceTransactionTree: ReactNode;
  readonly workspaceViewportContent: ReactNode;
  readonly workspaceViewportLegend: ReactNode;
  readonly workspaceLeftRail: ReactNode;
  readonly workspaceBottom: ReactNode;
  readonly workspaceInspector: ReactNode;
  readonly aiBridgeStatus: AIBridgeStatus;
}
