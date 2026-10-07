import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Bottom Transaction target ownership (#1091)", () => {
  it("routes all Transaction-owned editors through the fixed/pinned Bottom target", () => {
    const source = readFileSync(new URL("../../apps/editor/src/editor-secondary-surfaces.tsx", import.meta.url), "utf8");
    for (const component of ["TransactionEditor", "TransactionPhaseSummary", "TransactionLinkedEditor"]) {
      const props = source.match(new RegExp(`<${component}\\b([\\s\\S]*?)\\/>`))?.[1];
      expect(props, component).toBeDefined();
      expect(props, component).toContain("transaction={bottom.transaction}");
      expect(props, component).not.toContain("transaction={selected.transaction}");
    }
  });
});
