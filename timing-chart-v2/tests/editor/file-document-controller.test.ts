import { describe, expect, it } from "vitest";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { canonicalFixture } from "../fixtures/canonical.js";
import { createNewDocumentFromProductTemplate, decodeOpenDocumentBytes, parseOpenDocument, parseEditorDocument, serializeSaveDocument } from "../../apps/editor/src/file-document-controller.js";
import { EditorSessionController } from "../../apps/editor/src/runtime/editor-session-controller.js";
import { DOCUMENT_RESOURCE_BUDGET, scenarioModelFromV2, serializeScenarioDocumentModel, type CommandId, type SignalId } from "../../packages/schema/src/index.js";
import { MAX_OPEN_FILE_BYTES } from "../../apps/editor/src/file-document-controller.js";

const commandId = (id: string) => id as CommandId;

function valueChanges(count: number) {
  return Array.from({ length: count }, (_, start) => ({ id: `value_${start}`, start, value: "0" }));
}

function countJsonNodes(value: unknown): number {
  const stack = [value];
  let count = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    count += 1;
    if (Array.isArray(current)) stack.push(...current);
    else if (current !== null && typeof current === "object") stack.push(...Object.values(current));
  }
  return count;
}

function maxChangeCountFor(document: ReturnType<typeof canonicalFixture>): number {
  const empty = {
    ...document,
    signals: document.signals.map((signal) => signal.id === "sig_data" && signal.type !== "clock" ? { ...signal, values: [] } : signal),
  };
  const baseNodes = countJsonNodes(JSON.parse(JSON.stringify(empty)) as unknown);
  return Math.floor((DOCUMENT_RESOURCE_BUDGET.maxJsonNodes - baseNodes) / 4);
}

function commandGeneratedValueSession(count: number) {
  const document = canonicalFixture();
  const session = new CommandHistorySession(document);
  const extend = session.execute({ id: commandId("extend_for_capacity_test"), type: "timeline.insert", at: 8, count: count - 8 });
  if (!extend.ok) throw new Error("Could not extend the generated test document through the Timeline command.");
  const replace = session.execute({ id: commandId("replace_values_for_capacity_test"), type: "signal.replaceValues", signalId: "sig_data" as SignalId, values: valueChanges(count) });
  if (!replace.ok) throw new Error("Could not generate test value changes through the Signal command.");
  return session;
}

describe("file document controller boundaries", () => {
  it("creates a new document without mutating the base document", () => {
    const base = canonicalFixture();
    const next = createNewDocumentFromProductTemplate(base, "document_new" );
    expect(next.document.id).toBe("document_new");
    expect(next.document.title).toBe("Untitled Timing Chart");
    expect(next.annotations).toEqual([]);
    expect(next.bookmarks).toEqual([]);
    expect(next.timeGroups).toEqual([]);
    expect(next.transactions).toEqual([]);
    expect(next.signals).toEqual(base.signals);
    expect(next.signalGroups).toEqual(base.signalGroups);
    expect(next.timeline).toEqual(base.timeline);
    expect(next.layout).toEqual(base.layout);
    expect(next.document.header).toEqual(base.document.header);
    expect(next.document.footer).toEqual(base.document.footer);
    expect(base.document.id).not.toBe(next.document.id);
    expect(next.document.title).not.toBe(base.document.title);
    expect(base.annotations.length).toBeGreaterThanOrEqual(0);
  });

  it("serializes the supplied canonical document through the save boundary", () => {
    const document = canonicalFixture();
    const text = serializeSaveDocument(document);
    expect(JSON.parse(text)).toEqual(document);
  });

  it("rejects Canonical and Scenario saves that the current Open complexity gate cannot reopen", () => {
    const session = commandGeneratedValueSession(90_000);
    const canonical = session.getSnapshot().document;
    const canonicalText = JSON.stringify(canonical);
    expect(new TextEncoder().encode(canonicalText).byteLength).toBeLessThan(DOCUMENT_RESOURCE_BUDGET.openFileBytes);
    expect(parseOpenDocument(canonicalText)).toMatchObject({ ok: false, kind: "validation", problems: [expect.objectContaining({ detail: expect.stringContaining("metric=jsonNodes") })] });
    const beforeSave = session.historyState();
    expect(() => serializeSaveDocument(canonical)).toThrow(expect.objectContaining({
      problems: expect.arrayContaining([expect.objectContaining({ detail: expect.stringContaining("metric=jsonNodes") })]),
    }));
    expect(session.getSnapshot().document).toBe(canonical);
    expect(session.historyState()).toEqual(beforeSave);

    const scenario = scenarioModelFromV2(canonical);
    const scenarioText = JSON.stringify(scenario);
    expect(new TextEncoder().encode(scenarioText).byteLength).toBeLessThan(DOCUMENT_RESOURCE_BUDGET.openFileBytes);
    expect(parseEditorDocument(scenarioText)).toMatchObject({ ok: false, kind: "validation", problems: [expect.objectContaining({ detail: expect.stringContaining("metric=jsonNodes") })] });
    expect(() => serializeScenarioDocumentModel(scenario)).toThrow(expect.objectContaining({
      problems: expect.arrayContaining([expect.objectContaining({ detail: expect.stringContaining("metric=jsonNodes") })]),
    }));
  });

  it("round-trips the largest JSON-node-bounded Canonical and Scenario value streams", () => {
    const canonicalCount = maxChangeCountFor(canonicalFixture());
    const canonicalSession = commandGeneratedValueSession(canonicalCount);
    const canonicalDocument = canonicalSession.getSnapshot().document;
    const canonicalController = new EditorSessionController(canonicalDocument);
    const canonicalText = canonicalController.serializeCurrentDocument();
    expect(new TextEncoder().encode(canonicalText).byteLength).toBeLessThanOrEqual(MAX_OPEN_FILE_BYTES);
    canonicalController.replace(createNewDocumentFromProductTemplate(canonicalDocument, "capacity_roundtrip_new"));
    const reopenedCanonical = parseOpenDocument(canonicalText);
    if (!reopenedCanonical.ok) throw new Error("Largest supported Canonical save did not reopen.");
    canonicalController.replace(reopenedCanonical.document);
    expect(canonicalController.snapshot().document).toEqual(canonicalDocument);

    const source = canonicalFixture();
    const emptyCanonical = {
      ...source,
      timeline: { ...source.timeline, end: canonicalCount, cycleCount: canonicalCount },
      signals: source.signals.map((signal) => signal.id === "sig_data" && signal.type !== "clock" ? { ...signal, values: [{ id: "value_0", start: 0, value: "0" }] } : signal),
    };
    const emptyScenario = scenarioModelFromV2(emptyCanonical);
    const scenarioState = emptyScenario.scenarios[0]!.signalStates.sig_data;
    if (!scenarioState || scenarioState.kind !== "values") throw new Error("Expected Scenario value state.");
    const scenarioBaseNodes = countJsonNodes(JSON.parse(JSON.stringify(emptyScenario)) as unknown);
    const scenarioCount = Math.floor((DOCUMENT_RESOURCE_BUDGET.maxJsonNodes - scenarioBaseNodes) / 4) + 1;
    const scenario = {
      ...emptyScenario,
      scenarios: [{
        ...emptyScenario.scenarios[0]!,
        signalStates: {
          ...emptyScenario.scenarios[0]!.signalStates,
          sig_data: { ...scenarioState, values: valueChanges(scenarioCount) },
        },
      }],
    };
    const scenarioController = new EditorSessionController(canonicalFixture());
    scenarioController.replaceScenarioModel(scenario);
    const scenarioText = scenarioController.serializeCurrentDocument();
    expect(new TextEncoder().encode(scenarioText).byteLength).toBeLessThanOrEqual(MAX_OPEN_FILE_BYTES);
    scenarioController.replace(createNewDocumentFromProductTemplate(canonicalFixture(), "scenario_capacity_new"));
    const reopenedScenario = parseEditorDocument(scenarioText);
    expect(reopenedScenario).toMatchObject({ ok: true, kind: "scenario" });
    if (!reopenedScenario.ok || reopenedScenario.kind !== "scenario") throw new Error("Largest supported Scenario save did not reopen.");
    scenarioController.replaceScenarioModel(reopenedScenario.model);
    expect(reopenedScenario.model).toEqual(scenario);
    expect(scenarioController.scenarioModel()).toEqual(scenario);
  }, 20_000);

  it("rejects Save before producing bytes larger than the File > Open byte limit", () => {
    const document = canonicalFixture();
    const oversized = { ...document, document: { ...document.document, title: "x".repeat(MAX_OPEN_FILE_BYTES) } };
    expect(() => serializeSaveDocument(oversized)).toThrow(expect.objectContaining({
      problems: expect.arrayContaining([expect.objectContaining({
        code: "OPEN_FILE_TOO_LARGE",
        detail: expect.stringContaining(`limit=${MAX_OPEN_FILE_BYTES}`),
      })]),
    }));
  });

  it("routes UTF-8 bytes through the same Open parser as text, including a BOM", () => {
    const text = JSON.stringify(canonicalFixture());
    const bytes = new TextEncoder().encode(`\uFEFF${text}`);
    const openedFromBytes = parseOpenDocument(decodeOpenDocumentBytes(bytes));
    const openedFromText = parseOpenDocument(text);
    expect(openedFromBytes).toEqual(openedFromText);
    expect(openedFromBytes.ok).toBe(true);
  });

  it("opens Scenario v3 through the editor boundary without projecting away Scenarios", () => {
    const model = scenarioModelFromV2(canonicalFixture());
    const second = { ...model.scenarios[0]!, id: "scenario_alt" as typeof model.scenarios[number]["id"], name: "Alternate" };
    const text = serializeScenarioDocumentModel({ ...model, scenarios: [...model.scenarios, second] });
    const parsed = parseEditorDocument(text);
    expect(parsed).toMatchObject({ ok: true, kind: "scenario" });
    if (parsed.ok && parsed.kind === "scenario") expect(parsed.model.scenarios).toHaveLength(2);
    expect(parseOpenDocument(text)).toMatchObject({ ok: false, kind: "unsupported-version", sourceFormatVersion: 3 });
  });
});
