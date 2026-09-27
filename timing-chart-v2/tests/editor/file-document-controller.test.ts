import { describe, expect, it } from "vitest";
import { canonicalFixture } from "../fixtures/canonical.js";
import { createNewDocumentFromProductTemplate, decodeOpenDocumentBytes, parseOpenDocument, serializeSaveDocument } from "../../apps/editor/src/file-document-controller.js";

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

  it("routes UTF-8 bytes through the same Open parser as text, including a BOM", () => {
    const text = JSON.stringify(canonicalFixture());
    const bytes = new TextEncoder().encode(`\uFEFF${text}`);
    const openedFromBytes = parseOpenDocument(decodeOpenDocumentBytes(bytes));
    const openedFromText = parseOpenDocument(text);
    expect(openedFromBytes).toEqual(openedFromText);
    expect(openedFromBytes.ok).toBe(true);
  });
});
