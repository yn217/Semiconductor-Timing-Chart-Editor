import type { ViewMode } from "./use-workspace-ui-state.js";

export type BottomTabName = "Signal" | "Annotation" | "Transaction" | "Phases" | "Linked Signals" | "Bookmarks" | "AI" | "Problems" | "JSON";

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
}>;

const COMMON_TAIL: readonly BottomTabName[] = ["Bookmarks", "AI", "Problems", "JSON"];

const COMPOSITIONS: Readonly<Record<ViewMode, ModeComposition>> = {
  Cycle: { bottomTabs: ["Signal", "Annotation", ...COMMON_TAIL], fixedLeftWidth: undefined, persistsAsDefault: true },
  Transaction: { bottomTabs: ["Transaction", "Phases", "Linked Signals", ...COMMON_TAIL], fixedLeftWidth: 246, persistsAsDefault: true },
  Split: { bottomTabs: ["Signal", "Transaction", "Annotation", ...COMMON_TAIL], fixedLeftWidth: undefined, persistsAsDefault: false },
};

export function composeMode(viewMode: ViewMode): ModeComposition { return COMPOSITIONS[viewMode]; }
