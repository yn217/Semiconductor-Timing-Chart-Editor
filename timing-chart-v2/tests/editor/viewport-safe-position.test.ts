import { describe, expect, it } from "vitest";
import { computeViewportSafePosition, VIEWPORT_SAFE_POSITION_MARGIN } from "../../apps/editor/src/viewport-safe-position.js";

const viewport = { left: 0, top: 0, right: 1000, bottom: 800 };

describe("viewport-safe popover positioning (#197)", () => {
  it("keeps the preferred anchor position when the popup fully fits", () => {
    const result = computeViewportSafePosition({ x: 100, y: 100 }, { width: 150, height: 200 }, viewport);
    expect(result).toEqual({ x: 100, y: 100, flippedX: false, flippedY: false });
  });

  it("flips left when the preferred right edge would overflow and the flip fits", () => {
    const result = computeViewportSafePosition({ x: 900, y: 100 }, { width: 150, height: 200 }, viewport);
    expect(result.flippedX).toBe(true);
    expect(result.x).toBe(900 - 150);
    expect(result.x + 150).toBeLessThanOrEqual(viewport.right - VIEWPORT_SAFE_POSITION_MARGIN);
  });

  it("flips up when the preferred bottom edge would overflow and the flip fits", () => {
    const result = computeViewportSafePosition({ x: 100, y: 750 }, { width: 150, height: 200 }, viewport);
    expect(result.flippedY).toBe(true);
    expect(result.y).toBe(750 - 200);
    expect(result.y + 200).toBeLessThanOrEqual(viewport.bottom - VIEWPORT_SAFE_POSITION_MARGIN);
  });

  it("clamps to the margin instead of flipping when the flip would also overflow (top-left corner)", () => {
    const result = computeViewportSafePosition({ x: 5, y: 5 }, { width: 150, height: 200 }, viewport);
    expect(result.flippedX).toBe(false);
    expect(result.flippedY).toBe(false);
    expect(result.x).toBe(VIEWPORT_SAFE_POSITION_MARGIN);
    expect(result.y).toBe(VIEWPORT_SAFE_POSITION_MARGIN);
  });

  it("clamps a popup at the exact bottom-right corner to stay fully inside the viewport", () => {
    const result = computeViewportSafePosition({ x: 999, y: 799 }, { width: 150, height: 200 }, viewport);
    expect(result.x + 150).toBeLessThanOrEqual(viewport.right - VIEWPORT_SAFE_POSITION_MARGIN + 0.001);
    expect(result.y + 200).toBeLessThanOrEqual(viewport.bottom - VIEWPORT_SAFE_POSITION_MARGIN + 0.001);
    expect(result.x).toBeGreaterThanOrEqual(viewport.left);
    expect(result.y).toBeGreaterThanOrEqual(viewport.top);
  });

  it("clamps rather than produces a negative position when the popup is larger than the viewport", () => {
    const result = computeViewportSafePosition({ x: 500, y: 400 }, { width: 1200, height: 900 }, viewport);
    expect(result.x).toBeGreaterThanOrEqual(viewport.left);
    expect(result.y).toBeGreaterThanOrEqual(viewport.top);
  });

  it("respects a custom margin", () => {
    const result = computeViewportSafePosition({ x: 5, y: 5 }, { width: 50, height: 50 }, viewport, 20);
    expect(result.x).toBe(20);
    expect(result.y).toBe(20);
  });
});
