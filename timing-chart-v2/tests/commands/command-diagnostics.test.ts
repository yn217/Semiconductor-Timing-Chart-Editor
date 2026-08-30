import { describe, expect, it } from "vitest";
import { buildCommandRejectionDiagnostics } from "../../apps/editor/src/command-diagnostics.js";

describe("command rejection diagnostics", () => {
  it("retains batch identity and every original problem without inventing a target", () => {
    const diagnostics = buildCommandRejectionDiagnostics({
      result: {
        ok: false,
        reason: "invalid",
        problems: [
          { code: "FIRST", path: "$.first", message: "first problem" },
          { code: "SECOND", path: "$.second", message: "second problem" },
        ],
      },
      operation: "batch:cmd_batch_rejected",
      commandId: "cmd_batch_rejected",
    });

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map(({ code, path, message }) => ({ code, path, message }))).toEqual([
      { code: "FIRST", path: "$.first", message: "[batch:cmd_batch_rejected rejected (invalid)] first problem" },
      { code: "SECOND", path: "$.second", message: "[batch:cmd_batch_rejected rejected (invalid)] second problem" },
    ]);
    expect(diagnostics.every((item) => item.commandId === "cmd_batch_rejected")).toBe(true);
    expect(diagnostics.every((item) => item.objectId === undefined && item.objectType === undefined)).toBe(true);
  });
});
