import { describe, expect, it } from "vitest";
import { isStableId, opaqueDerivedId } from "@timing-chart-v2/schema";

describe("opaque stable ID allocation", () => {
  it("is deterministic, collision-safe, and does not expose its seed", () => {
    const seed = "source-signal|duplicate-command";
    const first = opaqueDerivedId(seed, new Set());
    const repeated = opaqueDerivedId(seed, new Set());
    const collisionFree = opaqueDerivedId(seed, new Set([first]));

    expect(first).toBe(repeated);
    expect(first).not.toBe(collisionFree);
    expect(isStableId(first)).toBe(true);
    expect(first).not.toContain("source-signal");
    expect(first).not.toContain("duplicate-command");
  });
});
