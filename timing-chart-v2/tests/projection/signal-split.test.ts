import { describe, expect, it } from "vitest";
import { projectSignalSplitRows } from "@timing-chart-v2/projection";
import type { CanonicalDocument, GroupId, RowId, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const id = (value: string) => value as SignalId;

describe("Signal Split projection", () => {
  it("keeps canonical order while assigning Upper, Lower and Both without cloning identity", () => {
    const base = canonicalFixture();
    const document = {
      ...base,
      signals: [
        base.signals[0]!,
        { ...base.signals[1]!, id: id("sig_upper"), display: { ...base.signals[1]!.display, name: "UPPER", splitPane: "upper" as const } },
        { ...base.signals[1]!, id: id("sig_lower"), display: { ...base.signals[1]!.display, name: "LOWER", splitPane: "lower" as const } },
        { ...base.signals[1]!, id: id("sig_unassigned"), display: { ...base.signals[1]!.display, name: "UNASSIGNED" } },
      ],
      signalGroups: [{ id: "grp_split" as GroupId, name: "Split", rows: ["sig_clk", "sig_upper", "sig_lower", "sig_unassigned"] as RowId[] }],
    } as CanonicalDocument;
    const rows = projectSignalSplitRows(document);
    expect(rows).toEqual({ upper: [id("sig_clk"), id("sig_upper"), id("sig_unassigned")], lower: [id("sig_clk"), id("sig_lower"), id("sig_unassigned")], both: [id("sig_clk"), id("sig_unassigned")] });
    expect(new Set([...rows.upper, ...rows.lower])).toEqual(new Set(["sig_clk", "sig_upper", "sig_lower", "sig_unassigned"]));
    expect(rows.upper.filter((signalId) => signalId === id("sig_clk"))).toHaveLength(1);
    expect(rows.lower.filter((signalId) => signalId === id("sig_clk"))).toHaveLength(1);
  });

  it("uses canonical row membership, ignores foreign rows and de-duplicates repeated row references", () => {
    const base = canonicalFixture();
    const upper = id("sig_upper");
    const lower = id("sig_lower");
    const document = {
      ...base,
      signals: [
        { ...base.signals[1]!, id: upper, display: { ...base.signals[1]!.display, name: "UPPER", splitPane: "upper" as const } },
        { ...base.signals[1]!, id: lower, display: { ...base.signals[1]!.display, name: "LOWER", splitPane: "lower" as const } },
      ],
      signalGroups: [{ id: "grp_split" as GroupId, name: "Split", rows: [upper, upper, "sig_foreign" as RowId, lower] }],
    } as CanonicalDocument;
    expect(projectSignalSplitRows(document)).toEqual({ upper: [upper], lower: [lower], both: [] });
  });
});
