import { describe, expect, it } from "vitest";
import { groupBackgroundColor } from "../../packages/renderer/src/group-background.js";

describe("group background opacity", () => {
  it("preserves foreground opacity by expressing Group alpha in background paint", () => {
    expect(groupBackgroundColor("#F8FAFD", 0.15)).toBe("color-mix(in srgb, #F8FAFD 15%, transparent)");
  });

  it("keeps full-opacity backgrounds unchanged", () => {
    expect(groupBackgroundColor("#123456", 1)).toBe("#123456");
    expect(groupBackgroundColor("#123456", undefined)).toBe("#123456");
  });

  it("handles zero and out-of-range defensive inputs", () => {
    expect(groupBackgroundColor("#123456", 0)).toBe("transparent");
    expect(groupBackgroundColor("#123456", -1)).toBe("transparent");
    expect(groupBackgroundColor("#123456", 2)).toBe("#123456");
    expect(groupBackgroundColor(undefined, 0.5)).toBeUndefined();
  });
});
