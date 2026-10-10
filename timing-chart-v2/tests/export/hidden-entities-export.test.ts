import { describe, expect, it } from "vitest";
import { buildExportScene } from "@timing-chart-v2/export";
import type { AnnotationId, CanonicalDocument, SignalId, TransactionId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

function documentWithHiddenEntities(): CanonicalDocument {
  const base = canonicalFixture();
  const source = base.signals.find((signal) => signal.type !== "clock")!;
  const shown = source.id;
  const hiddenSignal = "sig_hidden_copy" as SignalId;
  const hiddenCopy = { ...source, id: hiddenSignal, name: "HIDDEN", display: { ...source.display, name: "HIDDEN", visible: false }, values: "values" in source ? source.values.map((change, index) => ({ ...change, id: `value_hidden_${index}` })) : [] };
  const text = (id: string, signalId: SignalId, visible: boolean) => ({ id: id as AnnotationId, type: "text" as const, label: id, visible, color: "#123456", anchor: { cycle: 1, point: "cycle-start" as const, signalId } });
  return {
    ...base,
    signals: [...base.signals, hiddenCopy],
    signalGroups: base.signalGroups.map((group, index) => index === 0 ? { ...group, rows: [...group.rows, hiddenSignal] } : group),
    annotations: [text("ann_shown", shown, true), text("ann_hidden", shown, false), text("ann_on_hidden_row", hiddenSignal, true)],
    transactions: [
      { id: "txn_shown" as TransactionId, name: "Shown", start: 0, end: 2, laneId: "lane_0" },
      { id: "txn_hidden" as TransactionId, name: "Hidden", start: 0, end: 2, laneId: "lane_9", visible: false },
    ],
  } as CanonicalDocument;
}

describe("export follows on-screen visibility", () => {
  it("omits hidden annotations, hidden transactions (and their lanes) and annotations anchored to hidden Signal rows", () => {
    const scene = buildExportScene(documentWithHiddenEntities(), { format: "svg", scope: "document" });
    const annotationIds = scene.annotations.map((annotation) => annotation.id);
    expect(annotationIds).toContain("ann_shown");
    expect(annotationIds).not.toContain("ann_hidden");
    expect(annotationIds).not.toContain("ann_on_hidden_row");
    expect(scene.transactions.map((transaction) => transaction.id)).toEqual(["txn_shown"]);
    expect(new Set(scene.transactions.map((transaction) => transaction.laneId))).toEqual(new Set(["lane_0"]));
  });
});
