export const BOTTOM_PANEL_MIN_HEIGHT = 180;
export const BOTTOM_PANEL_MAX_HEIGHT = 420;
export const MIN_MAIN_VIEW_HEIGHT = 180;
export const BOTTOM_RESIZE_TRACK_HEIGHT = 10;

/** Preserve a usable main workspace while letting Bottom consume remaining vertical space. */
export function maxBottomPanelHeight(workspaceHeight: number, headerHeight: number): number {
  // Keep one pixel for fractional grid rounding so the main track does not
  // fall below its advertised minimum after CSS lays out the splitter.
  const available = Math.floor(workspaceHeight - headerHeight - BOTTOM_RESIZE_TRACK_HEIGHT - MIN_MAIN_VIEW_HEIGHT - 1);
  return Math.max(BOTTOM_PANEL_MIN_HEIGHT, Math.min(BOTTOM_PANEL_MAX_HEIGHT, available));
}

export function clampBottomPanelHeight(height: number, maximum: number): number {
  return Math.max(BOTTOM_PANEL_MIN_HEIGHT, Math.min(maximum, height));
}
