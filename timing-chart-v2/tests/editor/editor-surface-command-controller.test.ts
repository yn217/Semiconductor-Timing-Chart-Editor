import { describe, expect, it, vi } from "vitest";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import { createEditorSurfaceCommandController } from "../../apps/editor/src/application/editor-surface-command-controller.js";

describe("editor surface command controller", () => {
  it("owns clock command construction and command IDs outside the editor surface", () => {
    const execute = vi.fn(() => ({ ok: true } as never));
    const controller = createEditorSurfaceCommandController({ execute, nextCommandId: (operation) => `test_${operation}` as never });

    controller.updateClockGenerator("signal_1" as never, { kind: "periodic", period: 4, duty: 0.5, phase: 0, start: 0, repeat: "infinite" });
    controller.updateEdgeCounter("signal_1" as never, { show: true, mode: "rising", startNumber: 0, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: 0 } });
    controller.move("transaction_1" as never, 3);

    expect(execute.mock.calls.map(([command]) => command as SemanticCommand)).toEqual([
      expect.objectContaining({ id: "test_clock", type: "signal.updateClockGenerator", signalId: "signal_1" }),
      expect.objectContaining({ id: "test_edge_counter", type: "signal.updateEdgeCounter", signalId: "signal_1" }),
      expect.objectContaining({ id: "test_transaction_snap_move", type: "transaction.move", transactionId: "transaction_1", start: 3 }),
    ]);
  });
});
