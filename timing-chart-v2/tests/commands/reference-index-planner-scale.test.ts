import { describe, expect, it } from "vitest";
import { getCanonicalReferenceMetrics, referencesToTargets, resetCanonicalReferenceMetrics, type Annotation, type CanonicalDocument, type CommandId, type Signal, type SignalId, type TransactionId } from "@timing-chart-v2/schema";
import { getCommandPlannerMetrics, planCommand, resetCommandPlannerMetrics } from "@timing-chart-v2/commands";
import { canonicalFixture } from "../fixtures/canonical.js";

function largeReferenceDocument(): CanonicalDocument {
  const base = canonicalFixture();
  const clock = base.signals.find((signal) => signal.type === "clock")!;
  const value = base.signals.find((signal) => signal.type !== "clock" && signal.type !== "commentRow")!;
  const signalIds = Array.from({ length: 10_000 }, (_, index) => `sig_scale_${index}` as SignalId);
  const signals: Signal[] = signalIds.map((id, index) => index === 0
    ? { ...clock, id }
    : { ...value, id, name: `Signal ${index}`, source: { ...value.source, signalName: `Signal ${index}` }, display: { ...value.display, name: `Signal ${index}` } });
  const annotations: Annotation[] = Array.from({ length: 20_000 }, (_, index) => ({
    id: `ann_scale_${index}` as Annotation["id"],
    type: "text",
    label: `Annotation ${index}`,
    visible: true,
    anchor: { signalId: signalIds[index % signalIds.length]!, cycle: 1, point: "value-start" },
  }));
  const transactions = Array.from({ length: 10_000 }, (_, index) => ({
    id: `txn_scale_${index}` as TransactionId,
    name: `Transaction ${index}`,
    start: 1,
    end: 2,
    linkedSignals: [signalIds[index]!],
  }));
  const primaryGroup = base.signalGroups[0]!;
  return {
    ...base,
    signals,
    annotations,
    transactions,
    signalGroups: [{ ...primaryGroup, rows: signalIds }],
    timeline: { ...base.timeline, referenceClock: signalIds[0]! },
  };
}

describe("indexed reference planning at scale", () => {
  it("plans a near-top row move with one multi-target reference query", () => {
    const document = largeReferenceDocument();
    resetCanonicalReferenceMetrics();
    const oneSignalReferences = referencesToTargets(document, "signal", ["sig_scale_1234"]);
    const firstLookupMetrics = getCanonicalReferenceMetrics();
    expect(oneSignalReferences).toHaveLength(4);
    expect(firstLookupMetrics).toMatchObject({ indexBuilds: 1, canonicalReferenceScans: 1, targetQueries: 1, affectedSignalCount: 1, referencesVisited: 4 });
    expect(firstLookupMetrics.referencesVisited).toBeLessThan(firstLookupMetrics.canonicalReferencesEnumerated / 1_000);

    resetCanonicalReferenceMetrics();
    resetCommandPlannerMetrics();
    const result = planCommand(document, {
      id: "perf_cmd_move_many_rows" as CommandId,
      type: "signal.move",
      signalId: document.signals.at(-1)!.id,
      targetGroupId: document.signalGroups[0]!.id,
      index: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet.geometryScreenY).toHaveLength(9_999);
      expect(result.changeSet.annotationPosition).toHaveLength(19_998);
      expect(result.changeSet.annotationPosition?.[0]).toBe("ann_scale_1");
    }
    expect(getCanonicalReferenceMetrics()).toMatchObject({
      indexBuilds: 0,
      canonicalReferenceScans: 0,
      targetQueries: 1,
      affectedSignalCount: 9_999,
    });
    expect(getCanonicalReferenceMetrics().referencesVisited).toBeGreaterThan(30_000);
    expect(getCanonicalReferenceMetrics().referencesVisited).toBeLessThan(firstLookupMetrics.canonicalReferencesEnumerated);
    expect(getCommandPlannerMetrics().calls).toBe(1);
    expect(getCommandPlannerMetrics().plannerDurationMs).toBeGreaterThanOrEqual(0);

    resetCanonicalReferenceMetrics();
    resetCommandPlannerMetrics();
    const visibility = planCommand(document, { id: "perf_cmd_visibility" as CommandId, type: "signal.setVisibility", signalId: "sig_scale_1" as SignalId, visible: false });
    expect(visibility.ok).toBe(true);
    expect(getCanonicalReferenceMetrics()).toMatchObject({ targetQueries: 1, affectedSignalCount: 9_999 });
    expect(getCommandPlannerMetrics().calls).toBe(1);

    resetCanonicalReferenceMetrics();
    resetCommandPlannerMetrics();
    const layout = planCommand(document, { id: "perf_cmd_group_layout" as CommandId, type: "group.updateLayout", groupId: document.signalGroups[0]!.id, spacingBefore: 4, spacingAfter: 8 });
    expect(layout.ok).toBe(true);
    expect(getCanonicalReferenceMetrics()).toMatchObject({ targetQueries: 1, affectedSignalCount: 10_000 });
    expect(getCommandPlannerMetrics().calls).toBe(1);

    resetCanonicalReferenceMetrics();
    resetCommandPlannerMetrics();
    const isolatedEdit = planCommand(document, { id: "perf_cmd_single_edit" as CommandId, type: "signal.updateValue", signalId: "sig_scale_1234" as SignalId, start: 0, value: "01" });
    expect(isolatedEdit.ok).toBe(true);
    expect(getCanonicalReferenceMetrics()).toMatchObject({ targetQueries: 1, affectedSignalCount: 1, referencesVisited: 4 });
    expect(getCommandPlannerMetrics().calls).toBe(1);
  });
});
