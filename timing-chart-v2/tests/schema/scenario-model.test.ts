import { describe, expect, it } from "vitest";
import { scenarioModelFromV2, projectScenarioAsV2, updateScenarioModelFromV2Projection, validateScenarioDocumentModel, renameScenario, deleteScenario, duplicateScenario, listHandshakeMissingCaseSuggestions, createScenariosFromHandshakeSuggestions } from "../../packages/schema/src/scenario-model.js";
import { compareScenarioSignalStreams } from "../../packages/schema/src/scenario-comparison.js";
import { canonicalReferences, type CanonicalReferenceKind } from "../../packages/schema/src/reference-registry.js";
import { canonicalEntityInventory } from "../../packages/schema/src/canonical-inventory.js";
import { validateCanonicalDocument } from "../../packages/schema/src/validation.js";
import { parseDocument, parseScenarioDocumentModel, serializeScenarioDocumentModel } from "../../packages/schema/src/serialization.js";
import { canonicalFixture } from "../fixtures/canonical.js";

const SCENARIO_COPY_REFERENCE_OWNERSHIP = {
  "signal.enum": { owner: "shared", target: "shared" },
  "timeline.referenceClock": { owner: "shared", target: "shared" },
  "timeGroup.parent": { owner: "scenario", target: "scenario" },
  "signal.edgeCounter.marker": { owner: "shared", target: "scenario" },
  "annotation.anchor": { owner: "scenario", target: "shared" },
  "annotation.ghostTraceSource": { owner: "scenario", target: "shared" },
  "annotation.markerSpanStart": { owner: "scenario", target: "shared" },
  "annotation.markerSpanEnd": { owner: "scenario", target: "shared" },
  "transaction.linkedSignal": { owner: "scenario", target: "shared" },
  "transaction.group": { owner: "scenario", target: "scenario" },
  "annotationGroup.member": { owner: "scenario", target: "scenario" },
  "timeGroup.resumeLabelAnchor": { owner: "scenario", target: "scenario" },
  "constraint.handshakeRequest": { owner: "scenario", target: "shared" },
  "constraint.handshakeAcknowledge": { owner: "scenario", target: "shared" },
  "constraint.handshakeStableSignal": { owner: "scenario", target: "shared" },
  "constraint.latencyRangeRequest": { owner: "scenario", target: "shared" },
  "constraint.latencyRangeAcknowledge": { owner: "scenario", target: "shared" },
  "constraint.latencyTrigger": { owner: "scenario", target: "shared" },
  "constraint.latencyResponse": { owner: "scenario", target: "shared" },
  "labelAnchor.ownerTimeGroup": { owner: "scenario", target: "scenario" },
  "signalGroup.row": { owner: "shared", target: "shared" },
  "spacer.ownerGroup": { owner: "shared", target: "shared" },
} as const satisfies Readonly<Record<CanonicalReferenceKind, Readonly<{ owner: "shared" | "scenario"; target: "shared" | "scenario" }>>>;

describe("Scenario canonical model adapter", () => {
  it("remaps scenario-owned Phase and Signal value IDs across repeated copies and preserves them through Save/Open", () => {
    const base = canonicalFixture();
    const model = scenarioModelFromV2({ ...base, transactions: [
      { id: "tx_first" as never, name: "First", start: 0, end: 8, phases: [
        { id: "phase_address" as never, name: "Address", start: 0, end: 2 },
        { id: "phase_data" as never, name: "Data", start: 2, end: 8 },
      ] },
      { id: "tx_second" as never, name: "Second", start: 0, end: 8, phases: [
        { id: "phase_response" as never, name: "Response", start: 0, end: 8 },
      ] },
    ] });
    const source = model.scenarios[0]!;
    const sourceBytes = JSON.stringify(source);
    const once = duplicateScenario(model, source.id);
    const twice = duplicateScenario(once, source.id);
    const ids = twice.scenarios.flatMap((scenario) => scenario.transactions.flatMap((tx) => tx.phases!.map((phase) => phase.id)));
    expect(new Set(ids).size).toBe(9);
    expect(JSON.stringify(twice.scenarios[0])).toBe(sourceBytes);
    const sourceValueIds = Object.values(source.signalStates).flatMap((state) => !state ? [] : (state.kind === "clock" ? state.enable ?? [] : state.values).flatMap(({ id }) => id === undefined ? [] : [id]));
    const copiedValueIds = twice.scenarios.slice(1).flatMap((scenario) => Object.values(scenario.signalStates).flatMap((state) => !state ? [] : (state.kind === "clock" ? state.enable ?? [] : state.values).flatMap(({ id }) => id === undefined ? [] : [id])));
    expect(new Set([...sourceValueIds, ...copiedValueIds]).size).toBe(sourceValueIds.length + copiedValueIds.length);
    for (const copy of twice.scenarios.slice(1)) {
      expect(copy.transactions.map((tx) => tx.phases!.map(({ id: _id, ...phase }) => phase))).toEqual(source.transactions.map((tx) => tx.phases!.map(({ id: _id, ...phase }) => phase)));
      expect(Object.keys(copy.signalStates)).toEqual(Object.keys(source.signalStates));
      for (const [signalId, state] of Object.entries(source.signalStates)) {
        const copiedState = copy.signalStates[signalId as keyof typeof copy.signalStates];
        const copiedChanges = copiedState ? (copiedState.kind === "clock" ? copiedState.enable ?? [] : copiedState.values) : [];
        const sourceChanges = state ? (state.kind === "clock" ? state.enable ?? [] : state.values) : [];
        expect(copiedChanges.map(({ id: _id, ...change }) => change)).toEqual(sourceChanges.map(({ id: _id, ...change }) => change));
      }
    }
    expect(validateScenarioDocumentModel(twice)).toEqual([]);
    expect(parseScenarioDocumentModel(serializeScenarioDocumentModel(twice))).toEqual({ ok: true, model: twice, validated: true });
    const copy = once.scenarios[1]!;
    const malformed = { ...once, scenarios: [source, { ...copy, transactions: copy.transactions.map((tx, index) => index ? tx : { ...tx, phases: tx.phases!.map((phase, index) => index ? phase : { ...phase, id: source.transactions[0]!.phases![0]!.id }) }) }] };
    expect(validateScenarioDocumentModel(malformed)).toContainEqual(expect.objectContaining({ code: "DUPLICATE_ID", entityId: "phase_address", path: "$.scenarios[1].transactions[0].phases[0].id" }));
    expect(parseScenarioDocumentModel(JSON.stringify(malformed))).toMatchObject({ ok: false, kind: "validation" });
  });
  it("moves v2 timing ownership into one Scenario and projects the exact v2 semantics back", () => {
    const source = canonicalFixture();
    const model = scenarioModelFromV2(source);
    const scenario = model.scenarios[0]!;

    expect(model.formatVersion).toBe(3);
    expect(model.scenarios).toHaveLength(1);
    expect(scenario.name).toBe("Scenario 1");
    expect(model.signalDefinitions).toHaveLength(source.signals.length);
    expect(model.signalDefinitions.find((signal) => signal.id === "sig_data")).not.toHaveProperty("values");
    expect(scenario.signalStates.sig_data).toMatchObject({ kind: "values", values: source.signals[1]!.type === "bus" ? source.signals[1]!.values : [] });
    expect(scenario).toHaveProperty("transactions", source.transactions);
    expect(model).not.toHaveProperty("transactions");
    expect(model).not.toHaveProperty("timeline");

    const projected = projectScenarioAsV2(model, scenario.id);
    expect(projected).toEqual(source);
    expect(validateCanonicalDocument(projected)).toEqual([]);
  });

  it("keeps Document physical timebase and optional semantic collections lossless", () => {
    const source = canonicalFixture();
    const document = {
      ...source,
      timeline: { ...source.timeline, physicalTimebase: { referenceFrequencyHz: 125_000_000, unit: "ns" as const } },
      enumDefinitions: [{ id: "enum_state", name: "State", entries: [{ value: 0, label: "IDLE" }] }],
      transactionGroups: [{ id: "txg_main" as const, name: "Main", order: 0 }],
      transactionTimeScale: { clockCyclesPerTransactionCycle: 10, majorInterval: 2, minorInterval: 1 },
    };
    const migrated = scenarioModelFromV2(document);
    expect(migrated.physicalTimebase).toEqual(document.timeline.physicalTimebase);
    expect(projectScenarioAsV2(migrated, migrated.scenarios[0]!.id)).toEqual(document);
  });

  it("rejects a Scenario projection when a shared timing Signal has no Scenario state", () => {
    const model = scenarioModelFromV2(canonicalFixture());
    const scenario = model.scenarios[0]!;
    const malformed = {
      ...model,
      scenarios: [{ ...scenario, signalStates: { sig_clk: scenario.signalStates.sig_clk } }],
    };
    expect(() => projectScenarioAsV2(malformed, scenario.id)).toThrow("missing value state for 'sig_data'");
  });

  it("validates every scenario against shared signal definitions and the canonical contract", () => {
    const model = scenarioModelFromV2(canonicalFixture());
    expect(validateScenarioDocumentModel(model)).toEqual([]);

    const scenario = model.scenarios[0]!;
    const missing = { ...model, scenarios: [{ ...scenario, signalStates: { sig_clk: scenario.signalStates.sig_clk } }] };
    expect(validateScenarioDocumentModel(missing)).toContainEqual(expect.objectContaining({ code: "MISSING_SCENARIO_SIGNAL_STATE", path: "$.scenarios[0].signalStates.sig_data" }));

    const extra = { ...model, scenarios: [{ ...scenario, signalStates: { ...scenario.signalStates, orphan_signal: { kind: "values", values: [] } } }] };
    expect(validateScenarioDocumentModel(extra)).toContainEqual(expect.objectContaining({ code: "UNKNOWN_SCENARIO_SIGNAL_STATE", path: "$.scenarios[0].signalStates.orphan_signal" }));

    const duplicateTruth = { ...model, signalDefinitions: model.signalDefinitions.map((signal) => signal.id === "sig_data" ? { ...signal, values: [{ id: "duplicate_value", start: 0, value: 0 }] } : signal) };
    expect(validateScenarioDocumentModel(duplicateTruth)).toContainEqual(expect.objectContaining({ code: "SCENARIO_MODEL_UNKNOWN_FIELD", path: "$.signalDefinitions[1].values" }));
  });

  it("rejects duplicate scenario-owned stable IDs across scenarios", () => {
    const model = scenarioModelFromV2(canonicalFixture());
    const first = { ...model.scenarios[0]!, bookmarks: [{ id: "bookmark_shared", name: "Mark", start: 0 }] };
    const second = { ...first, id: "scenario_second" as typeof first.id, name: "Scenario 2" };
    const duplicateAcrossScenarios = { ...model, scenarios: [first, second] };
    expect(validateScenarioDocumentModel(duplicateAcrossScenarios)).toContainEqual(expect.objectContaining({ code: "DUPLICATE_ID", entityId: "bookmark_shared" }));
  });

  it("round-trips the opt-in v3 JSON boundary without changing the v2 parser contract", () => {
    const model = scenarioModelFromV2(canonicalFixture());
    const saved = serializeScenarioDocumentModel(model);
    expect(parseScenarioDocumentModel(saved)).toEqual({ ok: true, model, validated: true });
    expect(parseScenarioDocumentModel("{" )).toMatchObject({ ok: false, kind: "syntax" });
    expect(parseScenarioDocumentModel(JSON.stringify({ ...model, hiddenPayload: true }))).toMatchObject({ ok: false, kind: "validation", problems: [expect.objectContaining({ code: "SCENARIO_MODEL_UNKNOWN_FIELD" })] });
    expect(parseDocument(saved)).toMatchObject({ ok: false, kind: "unsupported-version", sourceFormatVersion: 3 });
  });

  it("reconciles one v2 command projection without overwriting another scenario's value stream", () => {
    const initial = scenarioModelFromV2(canonicalFixture());
    const first = initial.scenarios[0]!;
    const second = {
      ...first,
      id: "scenario_alt" as typeof first.id,
      name: "Alternate",
      signalStates: {
        ...first.signalStates,
        sig_data: { kind: "values" as const, values: [{ start: 0, value: "00" }, { start: 2, value: "22" }] },
      },
    };
    const model = { ...initial, scenarios: [first, second] };
    const base = projectScenarioAsV2(model, first.id);
    const projection = {
      ...base,
      timeline: { ...base.timeline, physicalTimebase: { referenceFrequencyHz: 100_000_000, unit: "ns" as const } },
      signals: base.signals.map((signal) => signal.id === "sig_data"
        ? { ...signal, name: "RENAMED", values: [{ start: 0, value: "00" }, { start: 6, value: "B6" }] }
        : signal),
    };

    const next = updateScenarioModelFromV2Projection(model, first.id, projection);
    expect(next.signalDefinitions.find((signal) => signal.id === "sig_data")?.name).toBe("RENAMED");
    expect(next.scenarios[0]?.signalStates.sig_data).toMatchObject({ kind: "values", values: [{ start: 0, value: "00" }, { start: 6, value: "B6" }] });
    expect(next.scenarios[1]?.signalStates.sig_data).toMatchObject({ kind: "values", values: [{ start: 0, value: "00" }, { start: 2, value: "22" }] });
    expect(projectScenarioAsV2(next, second.id).signals.find((signal) => signal.id === "sig_data")?.name).toBe("RENAMED");
    expect(next.physicalTimebase).toEqual({ referenceFrequencyHz: 100_000_000, unit: "ns" });
    expect(validateScenarioDocumentModel(next)).toEqual([]);
  });

  it("gives a Signal added in one Scenario its own Transition IDs in every other Scenario", () => {
    const initial = scenarioModelFromV2(canonicalFixture());
    const model = duplicateScenario(initial, initial.scenarios[0]!.id);
    const [first, copy] = model.scenarios;
    const base = projectScenarioAsV2(model, first!.id);
    const added = { id: "sig_added", name: "added", display: { name: "added" }, type: "bus", role: "internal", width: 8, source: { instancePath: ["dut"], signalName: "added" }, values: [{ id: "added_value_0", start: 0, value: "00" }] } as unknown as (typeof base.signals)[number];
    let next: ReturnType<typeof updateScenarioModelFromV2Projection>;
    try { next = updateScenarioModelFromV2Projection(model, first!.id, { ...base, signals: [...base.signals, added], signalGroups: base.signalGroups.map((group, index) => index === 0 ? { ...group, rows: [...group.rows, "sig_added"] } : group) }); } catch (e) { throw new Error(JSON.stringify((e as { problems?: unknown }).problems)); }
    expect(validateScenarioDocumentModel(next)).toEqual([]);
    const ids = next.scenarios.map((scenario) => (scenario.signalStates["sig_added" as keyof typeof scenario.signalStates] as { values: { id?: string }[] }).values[0]!.id);
    expect(ids[0]).toBe("added_value_0");
    expect(ids[1]).not.toBe(ids[0]);
    expect(copy!.id).not.toBe(first!.id);
  });

  it("renames and deletes Scenarios by stable ID while preserving the final Scenario", () => {
    const initial = scenarioModelFromV2(canonicalFixture());
    const first = initial.scenarios[0]!;
    const second = { ...first, id: "scenario_alt" as typeof first.id, name: "Alternate" };
    const model = { ...initial, scenarios: [first, second] };

    const renamed = renameScenario(model, second.id, "Stress");
    expect(renamed.scenarios.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: first.id, name: first.name },
      { id: second.id, name: "Stress" },
    ]);
    expect(renamed.scenarios[1]).toEqual({ ...second, name: "Stress" });
    expect(deleteScenario(renamed, first.id).scenarios).toEqual([{ ...second, name: "Stress" }]);
    expect(() => renameScenario(model, second.id, "  ")).toThrow("non-empty");
    expect(() => deleteScenario(initial, first.id)).toThrow("final Scenario");
    expect(validateScenarioDocumentModel(deleteScenario(renamed, first.id))).toEqual([]);
  });

  it("duplicates Scenario-owned identities and rewrites only their internal references", () => {
    const base = scenarioModelFromV2(canonicalFixture());
    const baseScenario = base.scenarios[0]!;
    const clockState = baseScenario.signalStates.sig_clk;
    if (clockState?.kind !== "clock") throw new Error("Fixture must provide Clock Scenario state.");
    const source = {
      ...baseScenario,
      timeline: { ...base.scenarios[0]!.timeline, labelAnchors: [{ id: "anchor_resume" as never, source: 8, display: 2, ownerTimeGroupId: "time_group_parent" as never }] },
      bookmarks: [{ id: "bookmark_one" as never, name: "One", start: 2 }],
      signalStates: {
        ...baseScenario.signalStates,
        sig_clk: {
          ...clockState,
          edgeCounter: { ...clockState.edgeCounter, countFrom: "marker" as const, anchorId: "bookmark_one" },
        },
      },
      timeGroups: [
        { id: "time_group_parent" as never, name: "Parent", start: 2, end: 8, presentation: { collapsed: true, foldStyle: "axis-break" as const, resumeLabelAnchorId: "anchor_resume" as never } },
        { id: "time_group_child" as never, parentId: "time_group_parent" as never, name: "Child", start: 3, end: 5 },
      ],
      annotations: [{ id: "annotation_one" as never, type: "measurement" as const, label: "M", visible: true, sourceSignalId: "sig_data" as never, start: { signalId: "sig_data" as never, cycle: 3, point: "transition-start" as const }, end: { signalId: "sig_data" as never, cycle: 5, point: "transition-end" as const } }],
      annotationGroups: [{ id: "annotation_group_one" as never, name: "Measurements", annotationIds: ["annotation_one" as never] }],
      transactionGroups: [{ id: "transaction_group_one" as never, name: "Bus", order: 0 }],
      transactions: [{ id: "transaction_one" as never, name: "Read", start: 2, end: 5, groupId: "transaction_group_one" as never, linkedSignals: ["sig_data" as never] }],
      constraints: [{ id: "constraint_one" as never, type: "latency", data: { signalId: "sig_data" } }],
    };
    const model = { ...base, scenarios: [source] };
    const duplicated = duplicateScenario(model, source.id, "Stress");
    const copy = duplicated.scenarios[1]!;

    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe("Stress");
    expect(copy.bookmarks[0]?.id).not.toBe(source.bookmarks[0]?.id);
    expect(copy.timeGroups[1]?.parentId).toBe(copy.timeGroups[0]?.id);
    expect(copy.timeline.labelAnchors[0]?.ownerTimeGroupId).toBe(copy.timeGroups[0]?.id);
    expect(copy.timeGroups[0]?.presentation?.resumeLabelAnchorId).toBe(copy.timeline.labelAnchors[0]?.id);
    expect(copy.annotationGroups[0]?.annotationIds[0]).toBe(copy.annotations[0]?.id);
    expect(copy.transactions[0]?.groupId).toBe(copy.transactionGroups?.[0]?.id);
    expect(copy.transactions[0]?.linkedSignals).toEqual(["sig_data"]);
    expect(copy.annotations[0]?.sourceSignalId).toBe("sig_data");
    expect(copy.constraints[0]?.data).toEqual({ signalId: "sig_data" });
    expect(validateScenarioDocumentModel(duplicated)).toEqual([]);

    const sourceProjection = projectScenarioAsV2(model, source.id);
    const copyProjection = projectScenarioAsV2(duplicated, copy.id);
    const sourceEntities = canonicalEntityInventory(sourceProjection);
    const copiedEntities = canonicalEntityInventory(copyProjection);
    const copiedIdsBySourcePath = new Map(
      sourceEntities.map((entity) => {
        const copied = copiedEntities.find((candidate) => candidate.kind === entity.kind && candidate.path === entity.path);
        if (!copied) throw new Error(`Scenario copy omitted ${entity.kind} at ${entity.path}.`);
        return [entity.id, copied.id] as const;
      }),
    );
    const mappedScenarioId = (id: string, kind: CanonicalReferenceKind): string => {
      const copiedId = copiedIdsBySourcePath.get(id);
      if (copiedId === undefined) throw new Error(`${kind} should point to a Scenario-owned stable ID '${id}'.`);
      return copiedId;
    };
    const expectedReferences = canonicalReferences(sourceProjection).map((reference) => {
      const ownership = SCENARIO_COPY_REFERENCE_OWNERSHIP[reference.kind];
      return {
        ...reference,
        ownerId: ownership.owner === "scenario" ? mappedScenarioId(reference.ownerId, reference.kind) : reference.ownerId,
        targetId: ownership.target === "scenario" ? mappedScenarioId(reference.targetId, reference.kind) : reference.targetId,
      };
    });
    expect(canonicalReferences(copyProjection)).toEqual(expectedReferences);
    expect(canonicalReferences(copyProjection)).toContainEqual(expect.objectContaining({
      kind: "signal.edgeCounter.marker",
      targetId: copy.bookmarks[0]?.id,
      path: "$.signals[0].edgeCounter.anchorId",
    }));
  });

  it("reports changed source-cycle ranges by shared Signal ID without scanning cycle extent", () => {
    const base = scenarioModelFromV2(canonicalFixture());
    const first = base.scenarios[0]!;
    const second = {
      ...first,
      id: "scenario_compare" as typeof first.id,
      name: "Compare",
      signalStates: { ...first.signalStates, sig_data: { kind: "values" as const, values: [{ start: 0, value: "00" }, { start: 2, value: "11" }, { start: 6, value: "A5" }] } },
    };
    const model = { ...base, scenarios: [first, second] };
    expect(compareScenarioSignalStreams(model, first.id, second.id)).toEqual([{ signalId: "sig_data", ranges: [{ start: 2, end: 6 }] }]);
    expect(compareScenarioSignalStreams(model, first.id, first.id)).toEqual([]);
  });

  it("compares duplicated Clock semantics without nested identity noise and preserves marker meaning", () => {
    const sourceDocument = canonicalFixture();
    const sourceClock = sourceDocument.signals.find((signal) => signal.type === "clock");
    if (sourceClock?.type !== "clock") throw new Error("Fixture must contain a Clock Signal.");
    const markerId = "bookmark_clock_origin" as never;
    const clock = {
      ...sourceClock,
      enable: [
        { id: "clock_enable_on", start: 1, value: 1 },
        { id: "clock_enable_off", start: 5, value: 0 },
      ],
      edgeCounter: { ...sourceClock.edgeCounter, show: true, countFrom: "marker" as const, anchorId: markerId },
    };
    const model = scenarioModelFromV2({
      ...sourceDocument,
      bookmarks: [{ id: markerId, name: "Clock origin", start: 3 }],
      signals: sourceDocument.signals.map((signal) => signal.id === clock.id ? clock : signal),
    });
    const original = model.scenarios[0]!;
    const duplicatedModel = duplicateScenario(model, original.id);
    const duplicate = duplicatedModel.scenarios[1]!;
    const originalClock = original.signalStates[clock.id];
    const duplicateClock = duplicate.signalStates[clock.id];
    if (originalClock?.kind !== "clock" || duplicateClock?.kind !== "clock") throw new Error("Clock state must be present in both Scenarios.");

    expect(duplicateClock.enable?.map(({ id }) => id)).not.toEqual(originalClock.enable?.map(({ id }) => id));
    expect(duplicateClock.edgeCounter.anchorId).not.toBe(originalClock.edgeCounter.anchorId);
    expect(duplicate.bookmarks[0]?.id).toBe(duplicateClock.edgeCounter.anchorId);
    expect(compareScenarioSignalStreams(duplicatedModel, original.id, duplicate.id)).toEqual([]);
    const parsed = parseScenarioDocumentModel(serializeScenarioDocumentModel(duplicatedModel));
    expect(parsed).toMatchObject({ ok: true, model: duplicatedModel, validated: true });
    if (!parsed.ok) throw new Error("Duplicated Scenario document must round-trip.");
    expect(compareScenarioSignalStreams(parsed.model, original.id, duplicate.id)).toEqual([]);

    const changedEnable = {
      ...duplicate,
      signalStates: {
        ...duplicate.signalStates,
        [clock.id]: { ...duplicateClock, enable: duplicateClock.enable!.map((change, index) => index === 0 ? { ...change, value: 0 } : change) },
      },
    };
    expect(compareScenarioSignalStreams({ ...duplicatedModel, scenarios: [original, changedEnable] }, original.id, duplicate.id)).toEqual([
      { signalId: clock.id, ranges: [{ start: 1, end: 5 }] },
    ]);

    const changedBookmark = { ...duplicate, bookmarks: duplicate.bookmarks.map((bookmark) => ({ ...bookmark, start: bookmark.start + 1 })) };
    expect(compareScenarioSignalStreams({ ...duplicatedModel, scenarios: [original, changedBookmark] }, original.id, duplicate.id)).toEqual([
      { signalId: clock.id, ranges: [{ start: 0, end: 8 }] },
    ]);

    const changedEdgeCounter = {
      ...duplicate,
      signalStates: {
        ...duplicate.signalStates,
        [clock.id]: { ...duplicateClock, edgeCounter: { ...duplicateClock.edgeCounter, startNumber: duplicateClock.edgeCounter.startNumber + 1 } },
      },
    };
    expect(compareScenarioSignalStreams({ ...duplicatedModel, scenarios: [original, changedEdgeCounter] }, original.id, duplicate.id)).toEqual([
      { signalId: clock.id, ranges: [{ start: 0, end: 8 }] },
    ]);

    const changedGenerator = {
      ...duplicate,
      signalStates: {
        ...duplicate.signalStates,
        [clock.id]: { ...duplicateClock, generator: { ...duplicateClock.generator, period: duplicateClock.generator.period + 1 } },
      },
    };
    expect(compareScenarioSignalStreams({ ...duplicatedModel, scenarios: [original, changedGenerator] }, original.id, duplicate.id)).toEqual([
      { signalId: clock.id, ranges: [{ start: 0, end: 8 }] },
    ]);
  });

  it("generates only explicitly selected Handshake cases from constraint-owned stable IDs", () => {
    const source = canonicalFixture();
    const template = source.signals[1]!;
    if (template.type !== "bus") throw new Error("fixture DATA must be a bus");
    const { width: _width, displayFormat: _displayFormat, ...binaryTemplate } = template;
    const request = { ...binaryTemplate, id: "sig_req" as typeof template.id, name: "REQ", type: "binary" as const, values: [{ start: 0, value: 0 }, { start: 3, value: 1 }] };
    const acknowledge = { ...binaryTemplate, id: "sig_ack" as typeof template.id, name: "ACK", type: "binary" as const, values: [{ start: 0, value: 0 }] };
    const payload = { ...template, id: "sig_payload" as typeof template.id, name: "PAYLOAD", values: [{ start: 0, value: "00" }, { start: 5, value: "01" }] };
    const handshake = { id: "constraint_handshake" as never, type: "handshake", data: { requestSignalId: request.id, acknowledgeSignalId: acknowledge.id, requestPolarity: "active-low", acknowledgePolarity: "active-low", stableSignalIds: [payload.id] } };
    const v2 = { ...source, timeline: { ...source.timeline, end: 12, cycleCount: 12 }, signals: [source.signals[0]!, request, acknowledge, payload], signalGroups: [{ ...source.signalGroups[0]!, rows: [source.signals[0]!.id, request.id, acknowledge.id, payload.id] }], constraints: [handshake] };
    const model = scenarioModelFromV2({ ...v2, transactions: [{ id: "tx_handshake" as never, name: "Transfer", start: 0, end: 8, phases: [{ id: "phase_handshake" as never, name: "Data", start: 0, end: 8 }] }] });
    const sourceScenario = model.scenarios[0]!;
    const suggestions = listHandshakeMissingCaseSuggestions(model, sourceScenario.id);
    expect(suggestions.map((item) => item.kind)).toEqual(["ack-before-request", "request-before-ack", "same-cycle", "backpressure", "consecutive-transfer", "stable-data-while-stalled"]);

    const selected = suggestions.find((item) => item.kind === "same-cycle")!;
    const stableCase = suggestions.find((item) => item.kind === "stable-data-while-stalled")!;
    const result = createScenariosFromHandshakeSuggestions(model, sourceScenario.id, [selected.key, stableCase.key]);
    expect(model.scenarios).toHaveLength(1);
    expect(result.document.scenarios).toHaveLength(3);
    expect(result.createdScenarioIds).toHaveLength(2);
    expect(result.document.scenarios[1]?.constraints[0]?.id).not.toBe(sourceScenario.constraints[0]?.id);
    const generated = result.document.scenarios[1]!;
    const stableGenerated = result.document.scenarios[2]!;
    expect(generated.transactions[0]!.phases![0]!.id).not.toBe("phase_handshake");
    expect(sourceScenario.transactions[0]!.phases![0]!.id).toBe("phase_handshake");
    const reqValues = generated.signalStates[request.id]!;
    const ackValues = generated.signalStates[acknowledge.id]!;
    expect(reqValues.kind).toBe("values");
    expect(ackValues.kind).toBe("values");
    if (reqValues.kind !== "values" || ackValues.kind !== "values") throw new Error("Generated Handshake Signals must use value state.");
    expect(reqValues.values).toEqual(expect.arrayContaining([expect.objectContaining({ start: 0, value: 0 }), expect.objectContaining({ start: 1, value: 1 })]));
    expect(ackValues.values).toEqual(expect.arrayContaining([expect.objectContaining({ start: 0, value: 0 }), expect.objectContaining({ start: 1, value: 1 })]));
    const originalEvents = duplicateScenario(model, sourceScenario.id).scenarios[1]!;
    const retainedRequest = (generated.signalStates[request.id] as Extract<typeof reqValues, { kind: "values" }>).values.find((change) => change.start === 3);
    const retainedRequestBeforeGeneration = (originalEvents.signalStates[request.id] as Extract<typeof reqValues, { kind: "values" }>).values.find((change) => change.start === 3);
    expect(retainedRequest?.id).toBe(retainedRequestBeforeGeneration?.id);
    const stablePayload = stableGenerated.signalStates[payload.id];
    expect(stablePayload?.kind).toBe("values");
    if (stablePayload?.kind !== "values") throw new Error("Generated stable-data Signal must use value state.");
    expect(stablePayload.values).toEqual(expect.arrayContaining([expect.objectContaining({ start: 0, value: "00" })]));
    const generatedEvents = [
      ...reqValues.values.filter((change) => change.start === 0 || change.start === 1),
      ...ackValues.values.filter((change) => change.start === 0 || change.start === 1),
      ...stablePayload.values.filter((change) => change.start === 0),
    ];
    expect(generatedEvents.every((change) => typeof change.id === "string" && change.id.length > 0)).toBe(true);
    const allChanges = result.document.scenarios.flatMap((scenario) => Object.values(scenario.signalStates).flatMap((state) => !state ? [] : state.kind === "clock" ? state.enable ?? [] : state.values));
    const allChangeIds = allChanges.flatMap((change) => typeof change.id === "string" ? [change.id] : []);
    expect(new Set(allChangeIds).size).toBe(allChangeIds.length);
    const repeatedGeneration = createScenariosFromHandshakeSuggestions(result.document, sourceScenario.id, [selected.key]);
    const repeatedIds = repeatedGeneration.document.scenarios.flatMap((scenario) => Object.values(scenario.signalStates).flatMap((state) => !state ? [] : (state.kind === "clock" ? state.enable ?? [] : state.values).flatMap((change) => change.id ? [change.id] : [])));
    expect(new Set(repeatedIds).size).toBe(repeatedIds.length);
    const reopened = parseScenarioDocumentModel(serializeScenarioDocumentModel(result.document));
    expect(reopened).toMatchObject({ ok: true, model: result.document, validated: true });
    expect(validateScenarioDocumentModel(result.document)).toEqual([]);
    expect(() => createScenariosFromHandshakeSuggestions(model, sourceScenario.id, ["unknown"])).toThrow("Unknown or unsupported");

    const logicRequest = { ...request, type: "logic" as const };
    const reset = { ...binaryTemplate, id: "sig_reset" as typeof template.id, name: "RESET", type: "binary" as const, values: [{ start: 0, value: 0 }] };
    const extendedHandshake = { ...handshake, data: { ...handshake.data, resetSignalId: reset.id, resetPolarity: "active-low" } };
    const extendedV2 = { ...v2, signals: [source.signals[0]!, logicRequest, acknowledge, payload, reset], signalGroups: [{ ...source.signalGroups[0]!, rows: [source.signals[0]!.id, logicRequest.id, acknowledge.id, payload.id, reset.id] }], constraints: [extendedHandshake] };
    const extendedModel = scenarioModelFromV2(extendedV2);
    const extendedScenario = extendedModel.scenarios[0]!;
    const extendedSuggestions = listHandshakeMissingCaseSuggestions(extendedModel, extendedScenario.id);
    expect(extendedSuggestions.map((item) => item.kind)).toContain("reset-during-transaction");
    expect(extendedSuggestions.map((item) => item.kind)).toContain("x-propagation");
    const extendedGenerated = createScenariosFromHandshakeSuggestions(extendedModel, extendedScenario.id, ["handshake:constraint_handshake:x-propagation", "handshake:constraint_handshake:reset-during-transaction"]);
    const xScenario = extendedGenerated.document.scenarios[1]!;
    const resetScenario = extendedGenerated.document.scenarios[2]!;
    const generatedX = xScenario.signalStates[logicRequest.id];
    const generatedReset = resetScenario.signalStates[reset.id];
    expect(generatedX?.kind).toBe("values");
    expect(generatedReset?.kind).toBe("values");
    if (generatedX?.kind !== "values" || generatedReset?.kind !== "values") throw new Error("Generated X/reset Signals must use value state.");
    expect(generatedX.values).toEqual(expect.arrayContaining([expect.objectContaining({ start: 1, value: "X", id: expect.any(String) })]));
    expect(generatedReset.values).toEqual(expect.arrayContaining([expect.objectContaining({ start: 2, value: 0, id: expect.any(String) }), expect.objectContaining({ start: 3, value: 1, id: expect.any(String) })]));
    const extendedChangeIds = extendedGenerated.document.scenarios.flatMap((scenario) => Object.values(scenario.signalStates).flatMap((state) => !state ? [] : (state.kind === "clock" ? state.enable ?? [] : state.values).flatMap((change) => change.id ? [change.id] : [])));
    expect(new Set(extendedChangeIds).size).toBe(extendedChangeIds.length);
    expect(validateScenarioDocumentModel(extendedGenerated.document)).toEqual([]);
  });
});
