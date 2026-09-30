import { describe, expect, it } from "vitest";
import { canonicalEntityIds } from "@timing-chart-v2/schema";
import { createEntityIdAllocator } from "../../apps/editor/src/entity-id.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("batch Entity ID allocation", () => {
  it("reuses one Canonical inventory and reserves every ID within the allocation operation", () => {
    const document = canonicalFixture();
    const canonicalIds = canonicalEntityIds(document);
    const allocate = createEntityIdAllocator(document);
    const ids = Array.from({ length: 2_000 }, (_, index) => allocate(index % 2 === 0 ? "signal" : "transaction"));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => canonicalIds.has(id))).toBe(false);
    expect(ids.filter((id) => id.startsWith("signal_phase9_")).length).toBe(1_000);
    expect(ids.filter((id) => id.startsWith("transaction_phase9_")).length).toBe(1_000);
  });
});
