import { describe, expect, it } from "vitest";
import { DocumentEpoch } from "../../apps/editor/src/runtime/document-epoch.js";

describe("DocumentEpoch", () => {
  it("changes only at an explicit document-generation boundary", () => {
    const epoch = new DocumentEpoch();
    const initial = epoch.current();
    expect(epoch.isCurrent(initial)).toBe(true);
    expect(epoch.advance()).toBe(initial + 1);
    expect(epoch.isCurrent(initial)).toBe(false);
    expect(epoch.isCurrent(initial + 1)).toBe(true);
  });
});
