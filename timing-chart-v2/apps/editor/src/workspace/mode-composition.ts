import type { ViewMode } from "./use-workspace-ui-state.js";

export type BottomTabName = "Signal" | "Annotation" | "Transaction" | "Phases" | "Linked Signals" | "Bookmarks" | "Simulation" | "AI" | "Problems" | "JSON";

/**
 * Per-mode composition contract (#615): everything a ViewMode decides about the workspace chrome, in one
 * place. Cycle/Transaction/Split roots read only their own entry; shared views take these values as props.
 */
export type ModeComposition = Readonly<{
  bottomTabs: readonly BottomTabName[];
  /** Fixed left-pane width in px, or undefined to use the user-resizable width. */
  fixedLeftWidth: number | undefined;
  /** Whether the choice is remembered as the default mode across reloads. */
  persistsAsDefault: boolean;
  /** Which tree fills the left rail. */
  leftRail: "signals" | "transactions";
  /** Where the mode header renders: inside the cycle panel (Cycle) or above it. */
  headerPlacement: "panel" | "above";
  /** Whether the Signal/Group left-pane resize handle exists. */
  hasLeftPaneResizer: boolean;
  /** Whether the Cycle-only frozen-pane splitter exists. */
  hasFrozenPaneResizer: boolean;
}>;

const COMMON_TAIL: readonly BottomTabName[] = ["Bookmarks", "Simulation", "AI", "Problems", "JSON"];

const COMPOSITIONS: Readonly<Record<ViewMode, ModeComposition>> = {
  Cycle: { bottomTabs: ["Signal", "Annotation", ...COMMON_TAIL], fixedLeftWidth: undefined, persistsAsDefault: true, leftRail: "signals", headerPlacement: "panel", hasLeftPaneResizer: true, hasFrozenPaneResizer: true },
  Transaction: { bottomTabs: ["Transaction", "Phases", "Linked Signals", ...COMMON_TAIL], fixedLeftWidth: 246, persistsAsDefault: true, leftRail: "transactions", headerPlacement: "above", hasLeftPaneResizer: false, hasFrozenPaneResizer: false },
  Split: { bottomTabs: ["Signal", "Transaction", "Phases", "Linked Signals", "Annotation", ...COMMON_TAIL], fixedLeftWidth: undefined, persistsAsDefault: false, leftRail: "transactions", headerPlacement: "above", hasLeftPaneResizer: true, hasFrozenPaneResizer: false },
};

export function composeMode(viewMode: ViewMode): ModeComposition { return COMPOSITIONS[viewMode]; }
