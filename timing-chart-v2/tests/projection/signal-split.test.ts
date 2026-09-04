import { describe, expect, it } from "vitest";
import { projectSignalSplitRows, type SignalSplitAssignment } from "@timing-chart-v2/projection";
import type { SignalId } from "@timing-chart-v2/schema";

const id = (value: string) => value as SignalId;

describe("Signal Split projection", () => {
  it("keeps canonical order while assigning Upper, Lower and Both without cloning identity", () => {
    const canonical = [id("sig_a"), id("sig_clk"), id("sig_x"), id("sig_y")];
    const assignments: SignalSplitAssignment[] = [
      { signalId: id("sig_a"), pane: "upper" },
      { signalId: id("sig_clk"), pane: "both" },
      { signalId: id("sig_x"), pane: "lower" },
      { signalId: id("sig_y"), pane: "lower" },
    ];
    const rows = projectSignalSplitRows(canonical, assignments);
    expect(rows).toEqual({ upper: [id("sig_a"), id("sig_clk")], lower: [id("sig_clk"), id("sig_x"), id("sig_y")], both: [id("sig_clk")] });
    expect(new Set([...rows.upper, ...rows.lower])).toEqual(new Set(canonical));
    expect(rows.upper.filter((signalId) => signalId === id("sig_clk"))).toHaveLength(1);
    expect(rows.lower.filter((signalId) => signalId === id("sig_clk"))).toHaveLength(1);
  });

  it("defaults unassigned canonical Signals to Upper and ignores foreign or duplicate assignment records", () => {
    const canonical = [id("sig_a"), id("sig_b")];
    const rows = projectSignalSplitRows(canonical, [
      { signalId: id("sig_a"), pane: "lower" },
      { signalId: id("sig_a"), pane: "both" },
      { signalId: id("sig_foreign"), pane: "both" },
    ]);
    expect(rows).toEqual({ upper: [id("sig_b")], lower: [id("sig_a")], both: [] });
  });
});
