import { describe, expect, it } from "vitest";
import { canonicalFixture } from "../fixtures/canonical.js";
import { createNewDocumentFromProductTemplate, decodeOpenDocumentBytes, parseOpenDocument, parseEditorDocument, serializeSaveDocument } from "../../apps/editor/src/file-document-controller.js";
import { DOCUMENT_RESOURCE_BUDGET, scenarioModelFromV2, serializeScenarioDocumentModel } from "../../packages/schema/src/index.js";
import { MAX_OPEN_FILE_BYTES } from "../../apps/editor/src/file-document-controller.js";

function largeValueDocument() {
  const document = canonicalFixture();
  const values = Array.from({ length: 90_000 }, (_, start) => ({ start, value: "0" }));
  return {
    ...document,
    timeline: { ...document.timeline, end: 90_000, cycleCount: 90_000 },
    signals: document.signals.map((signal) => signal.id === "sig_data" && signal.type !== "clock" ? { ...signal, values } : signal),
  };
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
    const canonical = largeValueDocument();
    const canonicalText = JSON.stringify(canonical);
    expect(new TextEncoder().encode(canonicalText).byteLength).toBeLessThan(DOCUMENT_RESOURCE_BUDGET.openFileBytes);
    expect(parseOpenDocument(canonicalText)).toMatchObject({ ok: false, kind: "validation", problems: [expect.objectContaining({ detail: expect.stringContaining("metric=jsonNodes") })] });
    expect(() => serializeSaveDocument(canonical)).toThrow(expect.objectContaining({
      problems: expect.arrayContaining([expect.objectContaining({ detail: expect.stringContaining("metric=jsonNodes") })]),
    }));

    const scenario = scenarioModelFromV2(canonical);
    const scenarioText = JSON.stringify(scenario);
    expect(new TextEncoder().encode(scenarioText).byteLength).toBeLessThan(DOCUMENT_RESOURCE_BUDGET.openFileBytes);
    expect(parseEditorDocument(scenarioText)).toMatchObject({ ok: false, kind: "validation", problems: [expect.objectContaining({ detail: expect.stringContaining("metric=jsonNodes") })] });
    expect(() => serializeScenarioDocumentModel(scenario)).toThrow(expect.objectContaining({
      problems: expect.arrayContaining([expect.objectContaining({ detail: expect.stringContaining("metric=jsonNodes") })]),
    }));
  });

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
