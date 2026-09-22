import { describe, expect, it } from "vitest";
import { parseOpenDocument, serializeSaveDocument, canonicalDocumentOf } from "../../apps/editor/src/file-document-controller.js";
import { canonicalFixture } from "../fixtures/canonical.js";

// #570: Signal Split is "the same Signal list in two viewports". The legacy per-signal
// display.splitPane (upper|lower|both) is read and ignored, and never written back.
describe("legacy display.splitPane", () => {
  it("opens a document that still carries it and drops it on Save", () => {
    const source = canonicalFixture();
    const text = JSON.stringify({ ...source, signals: source.signals.map((signal, index) => ({ ...signal, display: { ...signal.display, ...(index === 0 ? { splitPane: "upper" } : { splitPane: "both" }) } })) });
    const opened = parseOpenDocument(text);
    expect(opened.ok, JSON.stringify(opened)).toBe(true);
    if (!opened.ok) return;
    const document = canonicalDocumentOf(opened.document);
    for (const signal of document.signals) expect((signal.display as Record<string, unknown>).splitPane).toBeUndefined();
    expect(serializeSaveDocument(document)).not.toContain("splitPane");
  });
});
