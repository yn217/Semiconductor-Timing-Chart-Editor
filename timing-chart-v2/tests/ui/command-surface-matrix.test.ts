import { describe, expect, it } from "vitest";
import { COMMAND_SURFACE_CONTRACTS, type CommandSurface } from "@timing-chart-v2/ui";

const surfaces: readonly CommandSurface[] = ["ribbon", "context-menu", "keyboard", "tree", "inspector", "bottom"];

describe("command surface contract", () => {
  it("declares complete, uniquely named logical commands", () => {
    const names = COMMAND_SURFACE_CONTRACTS.map((contract) => contract.logicalCommand);
    expect(new Set(names).size).toBe(names.length);
    for (const contract of COMMAND_SURFACE_CONTRACTS) {
      expect(contract.canonicalCommand.length).toBeGreaterThan(0);
      expect(contract.precondition.length).toBeGreaterThan(0);
      for (const surface of surfaces) expect(typeof contract.surfaces[surface]).toBe("boolean");
    }
  });

  it("keeps mutating contracts on one-operation history policy", () => {
    for (const contract of COMMAND_SURFACE_CONTRACTS) {
      if (contract.logicalCommand !== "Undo/Redo") expect(contract.historyUnit).toBe("one-operation");
    }
  });
});
