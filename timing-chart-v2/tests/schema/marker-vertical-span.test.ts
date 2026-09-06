import { describe, expect, it } from "vitest";
import { migrateV1, resolveMarkerVerticalSpan, validateCanonicalDocument, type AnnotationId, type SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("Marker vertical span core", () => {
  it("resolves rows by stable identity and follows reordered group rows", () => {
    const base = canonicalFixture();
    const marker = { id: "marker_span" as AnnotationId, type: "marker" as const, label: "M", visible: true, anchor: { signalId: "sig_clk" as SignalId, cycle: 2, point: "cycle-start" as const }, verticalSpan: { mode: "rows" as const, startRowId: "sig_clk" as SignalId, endRowId: "sig_data" as SignalId } };
    const document = { ...base, annotations: [marker] };
    expect(validateCanonicalDocument(document)).toEqual([]);
    expect(resolveMarkerVerticalSpan(document, marker).rowIds).toEqual(["sig_clk", "sig_data"]);
    const reordered = { ...document, signalGroups: [{ ...document.signalGroups[0]!, rows: ["sig_data", "sig_clk"] }] };
    expect(resolveMarkerVerticalSpan(reordered, marker).rowIds).toEqual(["sig_data", "sig_clk"]);
    expect(marker.anchor?.cycle).toBe(2);
  });

  it("migrates legacy markers without a span as auto", () => {
    const result = migrateV1({ formatVersion: 1, document: { title: "legacy" }, cycleView: { signalGroups: [], signals: [], annotations: [{ type: "marker", text: "legacy", anchor: { cycle: 1 } }] }, timeline: { cycleCount: 4 } });
    expect(result.document.annotations[0]?.verticalSpan).toBeUndefined();
    expect(validateCanonicalDocument(result.document)).toEqual([]);
  });
});
