import { describe, expect, it } from "vitest";
import { deriveTimingDiagnostics, deriveTimingDiagnosticsIfInputsChanged, TIMING_DIAGNOSTIC_RULES } from "@timing-chart-v2/core";
import { parseDocument, serializeValidatedCanonicalDocument, type CanonicalDocument, type Constraint, type SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

function withSignals(document: CanonicalDocument, signals: CanonicalDocument["signals"], constraints: readonly Constraint[] = document.constraints): CanonicalDocument {
  return {
    ...document,
    signals,
    constraints,
    signalGroups: document.signalGroups.map((group) => ({ ...group, rows: signals.map((signal) => signal.id) })),
    timeline: { ...document.timeline, referenceClock: signals.find((signal) => signal.type === "clock")?.id },
  };
}

describe("derived timing diagnostics", () => {
  it("recomputes unknown-value diagnostics only for Signals whose semantic inputs changed", () => {
    const source = canonicalFixture();
    let unchangedValueVisits = 0;
    const unchangedValues = new Proxy([{ start: 0, value: "01" }], {
      get(target, property, receiver) {
        if (property === Symbol.iterator || property === "forEach" || (typeof property === "string" && /^\\d+$/.test(property))) unchangedValueVisits += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const unchangedSignal = { ...source.signals[1]!, id: "sig_data_2" as SignalId, name: "DATA2", values: unchangedValues };
    const previous = withSignals(source, [source.signals[0]!, source.signals[1]!, unchangedSignal]);
    const previousDiagnostics = deriveTimingDiagnostics(previous);
    unchangedValueVisits = 0;
    const next = withSignals(previous, [source.signals[0]!, { ...source.signals[1]!, values: [{ start: 0, value: "X" }] }, unchangedSignal]);

    const incremental = deriveTimingDiagnosticsIfInputsChanged(previous, next, previousDiagnostics);
    expect(unchangedValueVisits).toBe(0);
    expect(incremental.recomputed).toBe(true);
    expect(incremental.diagnostics).toEqual(deriveTimingDiagnostics(next));
    expect(incremental.diagnostics.find((diagnostic) => diagnostic.entityId === source.signals[1]!.id)).toMatchObject({ code: "UNKNOWN_SIGNAL_VALUE", path: "$.signals[1].values[0].value" });
  });

  it("re-evaluates only protocol constraints that depend on changed Signals", () => {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    const requestChanged = { ...template, id: "sig_req_changed" as SignalId, name: "REQ_CHANGED", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
    const acknowledgeChanged = { ...template, id: "sig_ack_changed" as SignalId, name: "ACK_CHANGED", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 5, value: 1 }] };
    const changedPayload = { ...template, id: "sig_data_changed" as SignalId, values: [{ start: 0, value: "00" }, { start: 3, value: "01" }] };
    const requestShared = { ...template, id: "sig_req_shared" as SignalId, name: "REQ_SHARED", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
    const acknowledgeShared = { ...template, id: "sig_ack_shared" as SignalId, name: "ACK_SHARED", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 5, value: 1 }] };
    const requestUnchanged = { ...template, id: "sig_req_unchanged" as SignalId, name: "REQ_UNCHANGED", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
    const acknowledgeUnchangedBase = { ...template, id: "sig_ack_unchanged" as SignalId, name: "ACK_UNCHANGED", type: "binary" as const, values: [{ start: 0, value: 0 }] };
    let unrelatedValueReads = 0;
    const unrelatedValues = new Proxy([{ start: 0, value: 0 }], {
      get(target, property, receiver) {
        if (property === Symbol.iterator || property === "forEach" || (typeof property === "string" && /^\\d+$/.test(property))) unrelatedValueReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const acknowledgeUnchanged = { ...acknowledgeUnchangedBase, values: unrelatedValues };
    const unchangedPayload = { ...template, id: "sig_data_unchanged" as SignalId, values: [{ start: 0, value: "00" }, { start: 3, value: "01" }] };
    const changedConstraint: Constraint = { id: "constraint_changed", type: "handshake", data: { requestSignalId: requestChanged.id, acknowledgeSignalId: acknowledgeChanged.id, stableSignalIds: [changedPayload.id] } };
    const sharedConstraint: Constraint = { id: "constraint_changed_shared", type: "handshake", data: { requestSignalId: requestShared.id, acknowledgeSignalId: acknowledgeShared.id, stableSignalIds: [changedPayload.id] } };
    const latencyRangeConstraint: Constraint = { id: "constraint_latency_range_changed", type: "latency-range", data: { requestSignalId: requestChanged.id, acknowledgeSignalId: acknowledgeChanged.id, minCycles: 1, maxCycles: 3 } };
    const latencyConstraint: Constraint = { id: "constraint_latency_changed", type: "latency", data: { triggerSignalId: requestChanged.id, triggerEdge: "rising", responseSignalId: acknowledgeChanged.id, responseEdge: "rising", minCycles: 1, maxCycles: 3 } };
    const unchangedConstraint: Constraint = { id: "constraint_unchanged", type: "handshake", data: { requestSignalId: requestUnchanged.id, acknowledgeSignalId: acknowledgeUnchanged.id, stableSignalIds: [unchangedPayload.id] } };
    const constraints = [changedConstraint, sharedConstraint, latencyRangeConstraint, latencyConstraint, unchangedConstraint];
    const initial = withSignals(source, [source.signals[0]!, requestChanged, acknowledgeChanged, changedPayload, requestShared, acknowledgeShared, requestUnchanged, acknowledgeUnchanged, unchangedPayload], constraints);
    const previous = { ...initial, checkSettings: { ...initial.checkSettings, enabledCategories: ["protocol", "stability"] as const } };
    const previousDiagnostics = deriveTimingDiagnostics(previous);
    expect(previousDiagnostics.some((item) => item.code === "HANDSHAKE_NO_ACK" && item.objectId === unchangedConstraint.id)).toBe(true);
    unrelatedValueReads = 0;

    const next = withSignals(previous, [previous.signals[0]!, { ...requestChanged, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }] }, acknowledgeChanged, changedPayload, requestShared, acknowledgeShared, requestUnchanged, acknowledgeUnchanged, unchangedPayload], constraints);
    const incremental = deriveTimingDiagnosticsIfInputsChanged(previous, next, previousDiagnostics);
    expect(unrelatedValueReads).toBe(0);
    expect(incremental.diagnostics).toEqual(deriveTimingDiagnostics(next));
    expect(incremental.diagnostics.filter((item) => item.code === "HANDSHAKE_DATA_UNSTABLE" && item.entityId === changedPayload.id)).toHaveLength(1);
  });

  it("builds the previous Signal ID/index map once during incremental diagnostics", () => {
    const previous = canonicalFixture();
    const previousDiagnostics = deriveTimingDiagnostics(previous);
    let previousMapPasses = 0;
    const previousSignals = new Proxy(previous.signals, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (property !== "map") return value;
        return (...args: unknown[]) => {
          previousMapPasses += 1;
          return Reflect.apply(value as (...items: unknown[]) => unknown, target, args);
        };
      },
    });
    const next = { ...previous, signals: previous.signals.map((signal) => signal.id === previous.signals[1]!.id ? { ...signal, name: "RENAMED" } : signal) };

    const incremental = deriveTimingDiagnosticsIfInputsChanged({ ...previous, signals: previousSignals }, next, previousDiagnostics);

    expect(incremental.diagnostics).toEqual(deriveTimingDiagnostics(next));
    expect(previousMapPasses).toBe(1);
  });

  it("reevaluates only changed non-Handshake constraints when Signals and settings are shared", () => {
    const source = canonicalFixture();
    const first: Constraint = { id: "constraint_incremental_first", type: "latency", data: {} };
    const unchanged: Constraint = { id: "constraint_incremental_unchanged", type: "latency", data: {} };
    const previous = { ...source, constraints: [first, unchanged] };
    const previousDiagnostics = deriveTimingDiagnostics(previous);
    const changedFirst: Constraint = { ...first, data: { triggerSignalId: "missing" } };
    const expected = { ...previous, constraints: [changedFirst, unchanged] };
    const expectedDiagnostics = deriveTimingDiagnostics(expected);
    Object.defineProperty(unchanged, "data", { get() { throw new Error("unchanged constraint must not be reevaluated"); } });

    const incremental = deriveTimingDiagnosticsIfInputsChanged(previous, expected, previousDiagnostics);

    expect(incremental.recomputed).toBe(true);
    expect(incremental.diagnostics).toEqual(expectedDiagnostics);
  });

  it("reuses Signal indexes across constraint edits and rebuilds them for a new Signal collection", () => {
    const source = canonicalFixture();
    let signalCollectionPasses = 0;
    const signals = new Proxy(source.signals, {
      get(target, property, receiver) {
        if (property === "forEach") return (callback: Parameters<typeof target.forEach>[0], thisArg?: unknown) => {
          signalCollectionPasses += 1;
          return target.forEach(callback, thisArg);
        };
        return Reflect.get(target, property, receiver);
      },
    });
    const initialConstraint: Constraint = { id: "constraint_index_cache", type: "latency", data: {} };
    const previous = { ...source, signals, constraints: [initialConstraint] };
    const previousDiagnostics = deriveTimingDiagnostics(previous);
    signalCollectionPasses = 0;

    const firstConstraint: Constraint = { ...initialConstraint, data: { triggerSignalId: "missing_first" } };
    const firstDocument = { ...previous, constraints: [firstConstraint] };
    const first = deriveTimingDiagnosticsIfInputsChanged(previous, firstDocument, previousDiagnostics);
    const passesAfterFirstEdit = signalCollectionPasses;
    const secondConstraint: Constraint = { ...firstConstraint, data: { triggerSignalId: "missing_second" } };
    const secondDocument = { ...firstDocument, constraints: [secondConstraint] };
    const second = deriveTimingDiagnosticsIfInputsChanged(firstDocument, secondDocument, first.diagnostics);

    expect(signalCollectionPasses).toBe(passesAfterFirstEdit);
    expect(first.diagnostics).toEqual(deriveTimingDiagnostics(firstDocument));
    expect(second.diagnostics).toEqual(deriveTimingDiagnostics(secondDocument));

    let replacementCollectionPasses = 0;
    const replacementSignals = new Proxy([...signals], {
      get(target, property, receiver) {
        if (property === "forEach") return (callback: Parameters<typeof target.forEach>[0], thisArg?: unknown) => {
          replacementCollectionPasses += 1;
          return target.forEach(callback, thisArg);
        };
        return Reflect.get(target, property, receiver);
      },
    });
    const replacementDocument = { ...secondDocument, signals: replacementSignals };
    const replacementConstraint: Constraint = { ...secondConstraint, data: { triggerSignalId: "missing_replacement" } };
    const replacementNext = { ...replacementDocument, constraints: [replacementConstraint] };
    const replacement = deriveTimingDiagnosticsIfInputsChanged(secondDocument, replacementNext, second.diagnostics);
    expect(replacement.diagnostics).toEqual(deriveTimingDiagnostics(replacementNext));
    const passesAfterCollectionReplacement = replacementCollectionPasses;
    const finalConstraint: Constraint = { ...replacementConstraint, data: { triggerSignalId: "missing_final" } };
    const finalDocument = { ...replacementNext, constraints: [finalConstraint] };
    const final = deriveTimingDiagnosticsIfInputsChanged(replacementNext, finalDocument, replacement.diagnostics);
    expect(replacementCollectionPasses).toBe(passesAfterCollectionReplacement);
    expect(final.diagnostics).toEqual(deriveTimingDiagnostics(finalDocument));
  });

  it("evaluates an added constraint only and rebases retained diagnostic paths after insertion", () => {
    const source = canonicalFixture();
    const retained: Constraint = { id: "constraint_structure_retained", type: "latency", data: {} };
    const previous = { ...source, constraints: [retained] };
    const previousDiagnostics = deriveTimingDiagnostics(previous);
    const added: Constraint = { id: "constraint_structure_added", type: "latency", data: { triggerSignalId: "missing" } };
    const next = { ...previous, constraints: [added, retained] };
    const expected = deriveTimingDiagnostics(next);
    Object.defineProperty(retained, "data", { get() { throw new Error("unchanged constraint must not be reevaluated after insertion"); } });

    const incremental = deriveTimingDiagnosticsIfInputsChanged(previous, next, previousDiagnostics);

    expect(incremental.diagnostics).toEqual(expected);
    expect(incremental.diagnostics.find((item) => item.objectId === added.id)).toMatchObject({ path: "$.constraints[0].data" });
  });

  it("removes deleted constraint findings and rebases retained paths without reevaluating unchanged constraints", () => {
    const source = canonicalFixture();
    const removed: Constraint = { id: "constraint_structure_removed", type: "latency", data: { triggerSignalId: "missing_removed" } };
    const retained: Constraint = { id: "constraint_structure_after_remove", type: "latency", data: { triggerSignalId: "missing_retained" } };
    const previous = { ...source, constraints: [removed, retained] };
    const previousDiagnostics = deriveTimingDiagnostics(previous);
    const next = { ...previous, constraints: [retained] };
    const expected = deriveTimingDiagnostics(next);
    Object.defineProperty(retained, "data", { get() { throw new Error("unchanged constraint must not be reevaluated after deletion"); } });

    const incremental = deriveTimingDiagnosticsIfInputsChanged(previous, next, previousDiagnostics);

    expect(incremental.diagnostics).toEqual(expected);
    expect(incremental.diagnostics.some((item) => item.objectId === removed.id)).toBe(false);
    expect(incremental.diagnostics.find((item) => item.objectId === retained.id)).toMatchObject({ path: "$.constraints[0].data" });
  });

  it("updates changed Handshakes and only refreshes peers sharing affected stable Signals", () => {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    const requestA = { ...template, id: "sig_edit_req_a" as SignalId, name: "REQ_A", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
    const ackA = { ...template, id: "sig_edit_ack_a" as SignalId, name: "ACK_A", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 8, value: 1 }] };
    const requestB = { ...template, id: "sig_edit_req_b" as SignalId, name: "REQ_B", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 3, value: 1 }] };
    const ackB = { ...template, id: "sig_edit_ack_b" as SignalId, name: "ACK_B", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 9, value: 1 }] };
    const payloadA = { ...template, id: "sig_edit_payload_a" as SignalId, values: [{ start: 0, value: "00" }, { start: 4, value: "01" }] };
    const payloadB = { ...template, id: "sig_edit_payload_b" as SignalId, values: [{ start: 0, value: "00" }, { start: 5, value: "01" }] };
    const unrelatedRequestBase = { ...template, id: "sig_edit_req_unrelated" as SignalId, name: "REQ_UNRELATED", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
    let unrelatedRequestReads = 0;
    const unrelatedRequest = { ...unrelatedRequestBase, values: new Proxy(unrelatedRequestBase.values, {
      get(target, property, receiver) {
        if (property === Symbol.iterator || property === "forEach" || (typeof property === "string" && /^\\d+$/.test(property))) unrelatedRequestReads += 1;
        return Reflect.get(target, property, receiver);
      },
    }) };
    const unrelatedAck = { ...ackA, id: "sig_edit_ack_unrelated" as SignalId };
    const changed: Constraint = { id: "constraint_edit_changed", type: "handshake", data: { requestSignalId: requestA.id, acknowledgeSignalId: ackA.id, stableSignalIds: [payloadA.id] } };
    const shared: Constraint = { id: "constraint_edit_shared", type: "handshake", data: { requestSignalId: requestB.id, acknowledgeSignalId: ackB.id, stableSignalIds: [payloadA.id] } };
    const invalidShared: Constraint = { id: "constraint_edit_invalid_shared", type: "handshake", data: { requestSignalId: requestB.id, acknowledgeSignalId: "missing_ack", stableSignalIds: [payloadA.id] } };
    const unrelated: Constraint = { id: "constraint_edit_unrelated", type: "handshake", data: { requestSignalId: unrelatedRequest.id, acknowledgeSignalId: unrelatedAck.id, stableSignalIds: [] } };
    const signals = [source.signals[0]!, requestA, ackA, requestB, ackB, payloadA, payloadB, unrelatedRequest, unrelatedAck];

    for (const categories of [["protocol", "stability"], ["stability"], ["protocol"]] as const) {
      const baseDocument = withSignals(source, signals, [changed, invalidShared, shared, unrelated]);
      const previous = { ...baseDocument, checkSettings: { ...baseDocument.checkSettings, enabledCategories: categories } };
      const previousDiagnostics = deriveTimingDiagnostics(previous);
      const nextChanged: Constraint = { ...changed, data: { ...changed.data, stableSignalIds: [payloadB.id] } };
      const next = { ...previous, constraints: [nextChanged, invalidShared, shared, unrelated] };
      unrelatedRequestReads = 0;

      const incremental = deriveTimingDiagnosticsIfInputsChanged(previous, next, previousDiagnostics);
      expect(unrelatedRequestReads).toBe(0);
      expect(incremental.diagnostics).toEqual(deriveTimingDiagnostics(next));
      expect(incremental.diagnostics).toContainEqual(expect.objectContaining({ code: "HANDSHAKE_CONSTRAINT_INVALID", objectId: invalidShared.id, path: "$.constraints[1].data.acknowledgeSignalId" }));
      if (categories.includes("stability")) {
        expect(incremental.diagnostics.filter((item) => item.code === "HANDSHAKE_DATA_UNSTABLE").map((item) => item.entityId).sort()).toEqual([payloadA.id, payloadB.id].sort());
      } else {
        expect(incremental.diagnostics.some((item) => item.category === "stability")).toBe(false);
      }
    }
  });

  it("reuses derived Problems for unrelated immutable edits and invalidates every diagnostic input", () => {
    const source = canonicalFixture();
    const current = withSignals(source, [source.signals[0]!, { ...source.signals[1]!, values: [{ start: 1, value: "X" }] }]);
    const currentDiagnostics = deriveTimingDiagnostics(current);
    const unrelatedEdit = { ...current, transactions: [...current.transactions] };
    const reused = deriveTimingDiagnosticsIfInputsChanged(current, unrelatedEdit, currentDiagnostics);
    expect(reused).toEqual({ diagnostics: currentDiagnostics, recomputed: false });

    const changedSignalName = { ...current, signals: current.signals.map((signal) => signal.id === current.signals[1]!.id ? { ...signal, name: "RENAMED" } : signal) };
    expect(deriveTimingDiagnosticsIfInputsChanged(current, changedSignalName, currentDiagnostics).recomputed).toBe(true);
    const displayOnlySignalEdit = { ...current, signals: current.signals.map((signal) => signal.id === current.signals[1]!.id ? { ...signal, display: { ...signal.display, visible: false } } : signal) };
    const displayOnly = deriveTimingDiagnosticsIfInputsChanged(current, displayOnlySignalEdit, currentDiagnostics, { timingDiagnosticsUnchanged: true });
    expect(displayOnly).toEqual({ diagnostics: currentDiagnostics, recomputed: false });

    const nonIterableSignals = new Proxy(displayOnlySignalEdit.signals, {
      get(target, property, receiver) {
        if (property === Symbol.iterator || ["forEach", "map", "find", "findIndex", "filter", "some", "indexOf"].includes(String(property))) {
          throw new Error(`unexpected full Signal scan through ${String(property)}`);
        }
        return Reflect.get(target, property, receiver);
      },
    });
    expect(deriveTimingDiagnosticsIfInputsChanged(current, { ...displayOnlySignalEdit, signals: nonIterableSignals }, currentDiagnostics, { timingDiagnosticsUnchanged: true }).recomputed).toBe(false);
    const changedConstraints = { ...current, constraints: [...current.constraints] };
    expect(deriveTimingDiagnosticsIfInputsChanged(current, changedConstraints, currentDiagnostics).recomputed).toBe(true);
    const changedSettings = { ...current, checkSettings: { enabledCategories: ["protocol"] as const } };
    const settingsResult = deriveTimingDiagnosticsIfInputsChanged(current, changedSettings, currentDiagnostics);
    expect(settingsResult.recomputed).toBe(false);
    expect(settingsResult.diagnostics).toEqual(deriveTimingDiagnostics(changedSettings));
  });

  it("changes enabled diagnostic categories without reevaluating retained or disabled rule domains", () => {
    const source = canonicalFixture();
    const constraint: Constraint = { id: "constraint_category_cache", type: "latency", data: { triggerSignalId: "missing_trigger" } };
    const previous = { ...source, constraints: [constraint], checkSettings: { enabledCategories: ["unknown-value"] as const } };
    const previousDiagnostics = deriveTimingDiagnostics(previous);
    const enabledProtocol = { ...previous, checkSettings: { enabledCategories: ["unknown-value", "protocol"] as const } };
    const enabled = deriveTimingDiagnosticsIfInputsChanged(previous, enabledProtocol, previousDiagnostics);
    expect(enabled.recomputed).toBe(true);
    expect(enabled.diagnostics).toEqual(deriveTimingDiagnostics(enabledProtocol));
    expect(enabled.diagnostics).toContainEqual(expect.objectContaining({ code: "LATENCY_CONSTRAINT_INVALID", objectId: constraint.id }));

    let signalCollectionReads = 0;
    const guardedSignals = new Proxy(enabledProtocol.signals, {
      get(target, property, receiver) {
        if ([Symbol.iterator, "map", "forEach", "filter", "find", "some"].includes(property as never)) {
          signalCollectionReads += 1;
          throw new Error(`disabled category removal scanned Signals via ${String(property)}`);
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const withoutProtocol = { ...enabledProtocol, signals: guardedSignals, checkSettings: { enabledCategories: ["unknown-value"] as const } };
    const disabled = deriveTimingDiagnosticsIfInputsChanged(
      { ...enabledProtocol, signals: guardedSignals },
      withoutProtocol,
      enabled.diagnostics,
    );
    expect(signalCollectionReads).toBe(0);
    expect(disabled.recomputed).toBe(false);
    expect(disabled.diagnostics).toEqual(deriveTimingDiagnostics(enabledProtocol, { enabledCategories: ["unknown-value"] }));
  });

  it("evaluates through a shared rule registry with stable semantic keys", () => {
    expect(TIMING_DIAGNOSTIC_RULES.map((rule) => rule.id)).toEqual(["timing.unknown-value", "timing.handshake", "timing.latency-range", "timing.latency"]);
    const source = canonicalFixture();
    const signal = { ...source.signals[1]!, values: [{ start: 1, value: "X" }] };
    const diagnostic = deriveTimingDiagnostics(withSignals(source, [source.signals[0]!, signal]))[0]!;
    expect(diagnostic.ruleId).toBe("timing.unknown-value");
    expect(diagnostic.stableKey).toContain(diagnostic.path);
  });

  it("does not evaluate disabled diagnostic categories", () => {
    const source = canonicalFixture();
    let constraintTypeReads = 0;
    const constraint = Object.defineProperty({}, "type", {
      get() {
        constraintTypeReads += 1;
        throw new Error("disabled protocol diagnostics must not inspect constraints");
      },
    }) as Constraint;

    expect(deriveTimingDiagnostics({ ...source, constraints: [constraint] }, { enabledCategories: ["unknown-value"] })).toEqual([]);
    expect(constraintTypeReads).toBe(0);
  });

  it("builds one reusable Signal ID/index context per full diagnostic pass", () => {
    const document = canonicalFixture();
    const expected = deriveTimingDiagnostics(document);
    let signalCollectionPasses = 0;
    const signals = new Proxy(document.signals, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (property !== "forEach" && property !== "map") return value;
        return (...args: unknown[]) => {
          signalCollectionPasses += 1;
          return Reflect.apply(value as (...items: unknown[]) => unknown, target, args);
        };
      },
    });

    expect(deriveTimingDiagnostics({ ...document, signals })).toEqual(expected);
    // One pass builds O(1) lookup indexes shared by protocol rules; one pass
    // evaluates per-Signal unknown-value diagnostics. Rules must not rebuild
    // their own copies of the same whole-document indexes.
    expect(signalCollectionPasses).toBe(2);
  });

  it("reports explicit and implicit unknown values without changing the canonical validator contract", () => {
    const source = canonicalFixture();
    const data = source.signals[1]!;
    if (data.type !== "bus") throw new Error("fixture DATA must be a bus");
    const document = withSignals(source, [source.signals[0]!, { ...data, values: [{ start: 2, value: "0xX1" }, { start: 4, value: "A5" }] }]);
    const diagnostics = deriveTimingDiagnostics(document);
    expect(diagnostics.map((item) => item.code)).toEqual(["UNINITIALIZED_SIGNAL_VALUE", "UNKNOWN_SIGNAL_VALUE"]);
    expect(diagnostics[1]).toMatchObject({ path: "$.signals[1].values[0].value", objectId: data.id, severity: "warning", source: "validation", stage: "validate" });
    expect(diagnostics[0]?.path).toBe("$.signals[1].values[0].start");
  });

  it("detects a missing acknowledge and data changes before acknowledge", () => {
    const source = canonicalFixture();
    const request = { ...source.signals[1]!, id: "sig_req" as SignalId, name: "REQ", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
    const acknowledge = { ...source.signals[1]!, id: "sig_ack" as SignalId, name: "ACK", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 5, value: 1 }] };
    const payload = { ...source.signals[1]!, id: "sig_payload" as SignalId, name: "PAYLOAD", values: [{ start: 0, value: "00" }, { start: 3, value: "01" }] };
    const constraint: Constraint = { id: "constraint_handshake", type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, stableSignalIds: [payload.id] } };
    const document = withSignals(source, [source.signals[0]!, request, acknowledge, payload], [constraint]);
    const diagnostics = deriveTimingDiagnostics(document);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: "HANDSHAKE_DATA_UNSTABLE", path: "$.signals[3].values[1].start", objectId: payload.id });
    expect(deriveTimingDiagnostics({ ...document, signals: document.signals.map((signal) => signal.id === acknowledge.id ? { ...signal, values: [{ start: 0, value: 0 }] } : signal) })).toEqual(expect.arrayContaining([expect.objectContaining({ code: "HANDSHAKE_NO_ACK", objectId: constraint.id })]));
  });

  it("evaluates Handshake protocol and stability categories independently in full and incremental paths", () => {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    const request = { ...template, id: "sig_req_stability" as SignalId, name: "REQ", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
    const acknowledge = { ...template, id: "sig_ack_stability" as SignalId, name: "ACK", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 5, value: 1 }] };
    const requestWithoutAck = { ...template, id: "sig_req_no_ack" as SignalId, name: "REQ_NO_ACK", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 6, value: 1 }] };
    const payload = { ...template, id: "sig_payload_stability" as SignalId, name: "PAYLOAD", values: [{ start: 0, value: "00" }] };
    const stableConstraint: Constraint = { id: "constraint_stability", type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, stableSignalIds: [payload.id] } };
    const missingAckConstraint: Constraint = { id: "constraint_no_ack", type: "handshake", data: { requestSignalId: requestWithoutAck.id, acknowledgeSignalId: acknowledge.id } };
    const baseDocument = withSignals(source, [source.signals[0]!, request, acknowledge, requestWithoutAck, payload], [stableConstraint, missingAckConstraint]);
    const base = { ...baseDocument, checkSettings: { ...baseDocument.checkSettings, enabledCategories: ["stability"] as const } };

    const stabilityOnly = deriveTimingDiagnostics(base, { enabledCategories: ["stability"] });
    expect(stabilityOnly).toEqual([]);
    const changedPayload = { ...payload, values: [{ start: 0, value: "00" }, { start: 3, value: "01" }] };
    const next = withSignals(base, [base.signals[0]!, request, acknowledge, requestWithoutAck, changedPayload], [stableConstraint, missingAckConstraint]);
    const incremental = deriveTimingDiagnosticsIfInputsChanged(base, next, stabilityOnly);
    expect(incremental.recomputed).toBe(true);
    expect(incremental.diagnostics).toEqual(deriveTimingDiagnostics(next));
    expect(incremental.diagnostics).toMatchObject([{ code: "HANDSHAKE_DATA_UNSTABLE", category: "stability", entityId: payload.id }]);
    expect(incremental.diagnostics.some((item) => item.category === "protocol")).toBe(false);

    const protocolOnly = deriveTimingDiagnostics(next, { enabledCategories: ["protocol"] });
    expect(protocolOnly.some((item) => item.code === "HANDSHAKE_NO_ACK" && item.objectId === missingAckConstraint.id)).toBe(true);
    expect(protocolOnly.some((item) => item.category === "stability")).toBe(false);

    const both = deriveTimingDiagnostics(next, { enabledCategories: ["protocol", "stability"] });
    expect(both.some((item) => item.code === "HANDSHAKE_NO_ACK" && item.objectId === missingAckConstraint.id)).toBe(true);
    expect(both.some((item) => item.code === "HANDSHAKE_DATA_UNSTABLE" && item.entityId === payload.id)).toBe(true);

    for (const categories of [["stability"], ["protocol"], ["protocol", "stability"]] as const) {
      const configuredBase = { ...baseDocument, checkSettings: { ...baseDocument.checkSettings, enabledCategories: categories } };
      const configuredNext = withSignals(configuredBase, [configuredBase.signals[0]!, request, acknowledge, requestWithoutAck, changedPayload], [stableConstraint, missingAckConstraint]);
      const previousFindings = deriveTimingDiagnostics(configuredBase);
      const incrementalFindings = deriveTimingDiagnosticsIfInputsChanged(configuredBase, configuredNext, previousFindings).diagnostics;
      expect(incrementalFindings).toEqual(deriveTimingDiagnostics(configuredNext));
    }
  });

  it("uses indexed acknowledge and stable-change windows without changing overlapping-request findings", () => {
    const source = canonicalFixture();
    const request = { ...source.signals[1]!, id: "sig_req_overlap" as SignalId, name: "REQ", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 4, value: 0 }, { start: 6, value: 1 }] };
    const acknowledge = { ...source.signals[1]!, id: "sig_ack_overlap" as SignalId, name: "ACK", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 10, value: 1 }] };
    const payload = { ...source.signals[1]!, id: "sig_payload_overlap" as SignalId, name: "PAYLOAD", values: [{ start: 0, value: "00" }, { start: 3, value: "01" }, { start: 5, value: "10" }, { start: 7, value: "11" }, { start: 11, value: "00" }] };
    const constraint: Constraint = { id: "constraint_handshake_overlap", type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, stableSignalIds: [payload.id] } };
    const document = withSignals(source, [source.signals[0]!, request, acknowledge, payload], [constraint]);
    const findings = deriveTimingDiagnostics(document).filter((item) => item.code === "HANDSHAKE_DATA_UNSTABLE");
    expect(findings).toHaveLength(4);
    expect(findings.map((item) => item.path)).toEqual([
      "$.signals[3].values[1].start",
      "$.signals[3].values[2].start",
      "$.signals[3].values[3].start",
      "$.signals[3].values[3].start",
    ]);
  });

  it("checks rising-edge latency ranges and diagnoses invalid references or bounds", () => {
    const source = canonicalFixture();
    const request = { ...source.signals[1]!, id: "sig_req" as SignalId, name: "REQ", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 7, value: 0 }, { start: 9, value: 1 }] };
    const acknowledge = { ...source.signals[1]!, id: "sig_ack" as SignalId, name: "ACK", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 4, value: 1 }, { start: 6, value: 0 }, { start: 11, value: 1 }] };
    const valid: Constraint = { id: "constraint_latency", type: "latency-range", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, minCycles: 1, maxCycles: 3 } };
    const document = withSignals(source, [source.signals[0]!, request, acknowledge], [valid]);
    expect(deriveTimingDiagnostics(document, { enabledCategories: ["protocol"] })).toEqual([]);

    const lowerBoundaryAck = { ...acknowledge, values: [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 6, value: 0 }, { start: 12, value: 1 }] };
    expect(deriveTimingDiagnostics(withSignals(document, [source.signals[0]!, request, lowerBoundaryAck], [valid]), { enabledCategories: ["protocol"] })).toEqual([]);

    const earlyThenValidAck = { ...acknowledge, values: [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 4, value: 0 }, { start: 5, value: 1 }] };
    const oneRequest = { ...request, values: [{ start: 0, value: 0 }, { start: 2, value: 1 }] };
    const minTwo: Constraint = { ...valid, data: { ...valid.data, minCycles: 2 } };
    expect(deriveTimingDiagnostics(withSignals(document, [source.signals[0]!, oneRequest, earlyThenValidAck], [minTwo]), { enabledCategories: ["protocol"] })).toEqual([]);
    const onlyEarlyAck = { ...acknowledge, values: [{ start: 0, value: 0 }, { start: 3, value: 1 }] };
    expect(deriveTimingDiagnostics(withSignals(document, [source.signals[0]!, oneRequest, onlyEarlyAck], [minTwo]), { enabledCategories: ["protocol"] })).toMatchObject([
      { code: "LATENCY_RANGE_VIOLATION", sourceCycle: 2, message: expect.stringContaining("first later edge is 1 cycles after the request") },
    ]);

    const lateAck = { ...acknowledge, values: [{ start: 0, value: 0 }, { start: 6, value: 1 }] };
    const lateDocument = withSignals(document, [source.signals[0]!, request, lateAck], [valid]);
    expect(deriveTimingDiagnostics(lateDocument, { enabledCategories: ["protocol"] })).toMatchObject([
      { code: "LATENCY_RANGE_VIOLATION", objectId: valid.id, path: "$.constraints[0].data.acknowledgeSignalId", sourceCycle: 2, ruleId: "timing.latency-range" },
      { code: "LATENCY_RANGE_VIOLATION", objectId: valid.id, path: "$.constraints[0].data.acknowledgeSignalId", sourceCycle: 9, ruleId: "timing.latency-range" },
    ]);
    const lateFindings = deriveTimingDiagnostics(lateDocument, { enabledCategories: ["protocol"] });
    expect(lateFindings[0]?.stableKey).not.toBe(lateFindings[1]?.stableKey);
    expect(deriveTimingDiagnostics(lateDocument, { enabledCategories: ["protocol"] })).toEqual(lateFindings);
    expect(deriveTimingDiagnostics(lateDocument, { enabledCategories: ["stability"] })).toEqual([]);

    const invalid: Constraint = { ...valid, data: { ...valid.data, maxCycles: 0, acknowledgeSignalId: "missing" } };
    expect(deriveTimingDiagnostics(withSignals(document, [source.signals[0]!, request], [invalid]), { enabledCategories: ["protocol"] })).toMatchObject([
      { code: "LATENCY_RANGE_CONSTRAINT_INVALID", path: "$.constraints[0].data", objectId: invalid.id },
    ]);
    const invalidRef: Constraint = { ...valid, data: { ...valid.data, acknowledgeSignalId: "missing" } };
    expect(deriveTimingDiagnostics(withSignals(document, [source.signals[0]!, request], [invalidRef]), { enabledCategories: ["protocol"] })).toMatchObject([
      { code: "LATENCY_RANGE_CONSTRAINT_INVALID", path: "$.constraints[0].data.acknowledgeSignalId", objectId: invalidRef.id },
    ]);
    const clockRef: Constraint = { ...valid, data: { ...valid.data, acknowledgeSignalId: source.signals[0]!.id } };
    expect(deriveTimingDiagnostics(withSignals(document, [source.signals[0]!, request], [clockRef]), { enabledCategories: ["protocol"] })).toMatchObject([
      { code: "LATENCY_RANGE_CONSTRAINT_INVALID", path: "$.constraints[0].data.acknowledgeSignalId", objectId: clockRef.id },
    ]);
    const busRef: Constraint = { ...valid, data: { ...valid.data, acknowledgeSignalId: source.signals[1]!.id } };
    expect(deriveTimingDiagnostics(withSignals(document, [source.signals[0]!, request, source.signals[1]!], [busRef]), { enabledCategories: ["protocol"] })).toMatchObject([
      { code: "LATENCY_RANGE_CONSTRAINT_INVALID", path: "$.constraints[0].data.acknowledgeSignalId", objectId: busRef.id },
    ]);
  });

  it("evaluates deterministic latency assertions and preserves them through Save/Open", () => {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    const request = { ...template, id: "sig_latency_req" as SignalId, name: "REQ", values: [{ start: 0, value: "0" }, { start: 2, value: "1" }] };
    const acknowledge = { ...template, id: "sig_latency_ack" as SignalId, name: "ACK", values: [{ start: 0, value: "0" }, { start: 4, value: "1" }] };
    const constraint: Constraint = { id: "constraint_latency" as never, type: "latency", data: { triggerSignalId: request.id, triggerEdge: "rising", responseSignalId: acknowledge.id, responseEdge: "rising", minCycles: 1, maxCycles: 3 } };
    const document = withSignals(source, [source.signals[0]!, request, acknowledge], [constraint]);
    expect(deriveTimingDiagnostics(document).filter((item) => item.ruleId === "timing.latency")).toEqual([]);
    expect(deriveTimingDiagnostics(document, { enabledCategories: ["unknown-value"] }).some((item) => item.ruleId === "timing.latency")).toBe(false);
    const saved = serializeValidatedCanonicalDocument(document);
    const reopened = parseDocument(saved);
    expect(reopened.ok, JSON.stringify(reopened)).toBe(true);
    if (reopened.ok) {
      expect(reopened.document.constraints).toEqual([constraint]);
      expect(deriveTimingDiagnostics(reopened.document)).toEqual(deriveTimingDiagnostics(document));
    }

    const lateAck = { ...acknowledge, values: [{ start: 0, value: "0" }, { start: 6, value: "1" }] };
    expect(deriveTimingDiagnostics(withSignals(source, [source.signals[0]!, request, lateAck], [constraint])).filter((item) => item.ruleId === "timing.latency")).toMatchObject([
      { code: "LATENCY_OUT_OF_RANGE", objectId: constraint.id, entityId: lateAck.id, value: 4, expected: "1..3 cycles" },
    ]);

    const noAck = { ...acknowledge, values: [{ start: 0, value: "0" }] };
    expect(deriveTimingDiagnostics(withSignals(source, [source.signals[0]!, request, noAck], [constraint])).filter((item) => item.ruleId === "timing.latency")).toMatchObject([
      { code: "LATENCY_RESPONSE_MISSING", objectId: constraint.id, entityId: noAck.id, expected: "1..3 cycles" },
    ]);

    const invalid = { ...constraint, data: { ...constraint.data, maxCycles: 0 } };
    expect(deriveTimingDiagnostics(withSignals(source, [source.signals[0]!, request, acknowledge], [invalid])).filter((item) => item.ruleId === "timing.latency")).toMatchObject([
      { code: "LATENCY_CONSTRAINT_INVALID", objectId: invalid.id },
    ]);
  });

  it("resolves latency diagnostic Signal paths from the shared ID index", () => {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    const request = { ...template, id: "sig_latency_index_req" as SignalId, name: "REQ", values: [{ start: 0, value: "0" }, { start: 2, value: "1" }] };
    const acknowledge = { ...template, id: "sig_latency_index_ack" as SignalId, name: "ACK", values: [{ start: 0, value: "0" }] };
    const constraint: Constraint = { id: "constraint_latency_index" as never, type: "latency", data: { triggerSignalId: request.id, triggerEdge: "rising", responseSignalId: acknowledge.id, responseEdge: "rising", minCycles: 1, maxCycles: 3 } };
    const signals = [source.signals[0]!, request, acknowledge] as CanonicalDocument["signals"] & { indexOf: never };
    Object.defineProperty(signals, "indexOf", { value: () => { throw new Error("latency diagnostics must not linearly search Signals"); } });

    const diagnostics = deriveTimingDiagnostics(withSignals(source, signals, [constraint]), { enabledCategories: ["protocol"] });
    expect(diagnostics).toMatchObject([
      { code: "LATENCY_RESPONSE_MISSING", path: "$.signals[2]", entityId: acknowledge.id, objectId: constraint.id },
    ]);
  });

  it("is deterministic and honors category selection", () => {
    const source = canonicalFixture();
    const signal = { ...source.signals[1]!, values: [{ start: 1, value: "X" }] };
    const document = withSignals(source, [source.signals[0]!, signal]);
    const reversed = { ...document, signals: [...document.signals].reverse() };
    expect(deriveTimingDiagnostics(document)).toEqual(deriveTimingDiagnostics(document));
    expect(deriveTimingDiagnostics(document, { enabledCategories: ["protocol"] })).toEqual([]);
    expect(deriveTimingDiagnostics(reversed, { enabledCategories: ["unknown-value"] }).map((item) => item.code)).toEqual(["UNINITIALIZED_SIGNAL_VALUE", "UNKNOWN_SIGNAL_VALUE"]);
  });
});
