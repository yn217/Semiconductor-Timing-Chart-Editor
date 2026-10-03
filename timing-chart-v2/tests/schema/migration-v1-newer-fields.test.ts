import { describe, expect, it } from "vitest";
import { parseDocument } from "../../packages/schema/src/serialization.js";

// A formatVersion:1 file that already carries newer (v2-era) fields must not silently lose them on Open.
function richV1(): Record<string, unknown> {
  return {
    formatVersion: 1,
    document: { id: "doc", title: "Rich" },
    timeline: { cycleCount: 10 },
    enumDefinitions: [{ id: "enum_state", name: "State", entries: [{ value: 0, label: "IDLE" }, { value: 1, label: "BUSY" }] }],
    signals: [
      { id: "sig_clk", name: "CLK", type: "clock", role: "input", generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" } },
      { id: "sig_rst", name: "RST", type: "binary", role: "input", values: [{ start: 0, value: 0 }], resetSemantics: { polarity: "active-low", synchronization: "asynchronous", assertCycle: 0, deassertCycle: 2 } },
      { id: "sig_st", name: "ST", type: "bus", role: "internal", width: 1, values: [{ start: 0, value: 0 }], enumId: "enum_state" },
    ],
    signalGroups: [{ id: "group_a", name: "A", rows: ["sig_clk", "sig_rst", "sig_st"] }],
    annotations: [
      { id: "ann_text", type: "text", label: "t", visible: true, anchor: { signalId: "sig_clk", cycle: 1, point: "cycle-start" }, align: "right", locked: true, rotation: 30 },
      { id: "ann_ghost", type: "ghostTrace", label: "g", visible: true, start: { signalId: "sig_rst", cycle: 1, point: "cycle-start" }, end: { signalId: "sig_rst", cycle: 3, point: "cycle-start" }, sourceSignalId: "sig_rst", traceOffsetCycles: 2, opacity: 0.4 },
      { id: "ann_meas", type: "measurement", label: "m", visible: true, start: { signalId: "sig_rst", cycle: 1, point: "transition-start", threshold: 0.3, transition: { kind: "threshold", value: 0.3 } }, end: { signalId: "sig_rst", cycle: 2, point: "transition-end", threshold: 0.7, transition: { kind: "threshold", value: 0.7 } }, measurement: { profile: "30-70", anchorKind: "threshold" }, measurementLayout: { startMarker: "arrow", endMarker: "none", arrowLayout: "inward", extensionLines: "start", lane: 1 } },
    ],
    annotationGroups: [{ id: "agroup_1", name: "G", annotationIds: ["ann_text", "ann_ghost"] }],
    legend: { show: true, orientation: "horizontal", usedRolesOnly: false, position: { x: 0, y: 0 }, items: [{ id: "legend_in", role: "input", label: "Inputs", visible: true, order: 0 }] },
    transactions: [{ id: "txn_1", name: "T1", start: 0, end: 2, visible: false }],
  };
}

describe("v1 Open preserves newer fields already present in the file", () => {
  it("passes v2-era fields through migration and validation", () => {
    const result = parseDocument(JSON.stringify(richV1()));
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    const doc = result.document as unknown as Record<string, any>;
    const src = richV1() as Record<string, any>;
    expect(doc.enumDefinitions).toEqual(src.enumDefinitions);
    expect(doc.annotationGroups).toEqual(src.annotationGroups);
    expect(doc.legend.items).toEqual(src.legend.items);
    expect(doc.signals[1].resetSemantics).toEqual(src.signals[1].resetSemantics);
    expect(doc.signals[2].enumId).toBe("enum_state");
    expect(doc.transactions[0].visible).toBe(false);
    expect(doc.annotations[0]).toMatchObject({ align: "right", locked: true, rotation: 30 });
    expect(doc.annotations[1]).toMatchObject({ sourceSignalId: "sig_rst", traceOffsetCycles: 2, opacity: 0.4 });
    expect(doc.annotations[1].style?.opacity).toBeUndefined();
    expect(doc.annotations[2].measurement).toEqual(src.annotations[2].measurement);
    expect(doc.annotations[2].measurementLayout).toEqual(src.annotations[2].measurementLayout);
    expect(doc.annotations[2].start).toMatchObject({ threshold: 0.3, transition: { kind: "threshold", value: 0.3 } });
    expect(doc.annotations[2].end).toMatchObject({ threshold: 0.7, transition: { kind: "threshold", value: 0.7 } });
  });

  it("still rejects invalid passed-through values through the normal v2 validation", () => {
    const src = richV1();
    (src.transactions as any[])[0].visible = "nope";
    (src.signals as any[])[2].enumId = "enum_missing";
    const result = parseDocument(JSON.stringify(src));
    // Non-boolean visible is not carried; a dangling enumId is caught by canonical validation.
    if (result.ok) expect((result.document.transactions[0] as any).visible).toBeUndefined();
    else expect(result.problems.length).toBeGreaterThan(0);
  });
});
