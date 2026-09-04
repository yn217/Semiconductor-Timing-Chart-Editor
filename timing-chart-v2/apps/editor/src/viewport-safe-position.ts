/**
 * Shared viewport-safe popover positioning (#197). Every app-owned floating
 * menu/popover (Signal/Group/Annotation context menu, the Annotation
 * ribbon's Arrange dropdown, ...) should compute its on-screen position
 * through this one pure function instead of re-deriving its own flip/clamp
 * math, so "does this popover stay inside the viewport" has a single
 * answer everywhere it's asked.
 *
 * Algorithm (matches the issue's required behavior): prefer the anchor
 * point/corner; flip to the opposite side when the preferred placement
 * would overflow that edge AND the flipped placement actually fits; then
 * clamp to the viewport with a margin regardless (covers popovers taller/
 * wider than the viewport itself, where neither placement fully fits).
 */
export interface ViewportSafePositionAnchor {
  readonly x: number;
  readonly y: number;
}

export interface ViewportSafePositionSize {
  readonly width: number;
  readonly height: number;
}

export interface ViewportSafePositionBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ViewportSafePositionResult {
  readonly x: number;
  readonly y: number;
  readonly flippedX: boolean;
  readonly flippedY: boolean;
}

export const VIEWPORT_SAFE_POSITION_MARGIN = 8;

export function computeViewportSafePosition(
  anchor: ViewportSafePositionAnchor,
  size: ViewportSafePositionSize,
  viewport: ViewportSafePositionBounds,
  margin: number = VIEWPORT_SAFE_POSITION_MARGIN,
): ViewportSafePositionResult {
  const preferredRight = anchor.x + size.width;
  const preferredBottom = anchor.y + size.height;
  const flipX = preferredRight > viewport.right - margin && anchor.x - size.width >= viewport.left + margin;
  const flipY = preferredBottom > viewport.bottom - margin && anchor.y - size.height >= viewport.top + margin;
  const preferredX = flipX ? anchor.x - size.width : anchor.x;
  const preferredY = flipY ? anchor.y - size.height : anchor.y;
  const x = Math.max(viewport.left + margin, Math.min(preferredX, viewport.right - size.width - margin));
  const y = Math.max(viewport.top + margin, Math.min(preferredY, viewport.bottom - size.height - margin));
  return { x, y, flippedX: flipX, flippedY: flipY };
}

/** The current visual-viewport bounds (falls back to window size when the
 * visualViewport API is unavailable), as ViewportSafePositionBounds. */
export function currentViewportBounds(): ViewportSafePositionBounds {
  const viewport = globalThis.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  return { left, top, right: left + (viewport?.width ?? globalThis.innerWidth), bottom: top + (viewport?.height ?? globalThis.innerHeight) };
}
