import { describe, expect, it } from "vitest";
import { resolveEditorStartupDocument } from "../../apps/editor/src/workspace/editor-startup-document.js";
import { cycleDocument, transactionDemoDocument, v1ReferenceDocument } from "../../apps/editor/src/fixtures-cycle-reference-documents.js";

describe("editor startup document resolution", () => {
  it("keeps visual-reference entry Cycle-oriented", () => {
    expect(resolveEditorStartupDocument("?visual-reference")).toMatchObject({
      visualReference: true,
      initialDocument: v1ReferenceDocument,
      productTemplate: cycleDocument,
      initialViewMode: "Cycle",
    });
  });

  it("selects the plain Cycle sample for the explicit sample entry", () => {
    expect(resolveEditorStartupDocument("?cycle-sample")).toMatchObject({
      visualReference: false,
      initialDocument: cycleDocument,
      productTemplate: cycleDocument,
      initialViewMode: "Transaction",
    });
  });

  it("uses the populated Transaction demo by default", () => {
    expect(resolveEditorStartupDocument(undefined)).toMatchObject({
      visualReference: false,
      initialDocument: transactionDemoDocument,
      productTemplate: cycleDocument,
      initialViewMode: "Transaction",
    });
  });
});
