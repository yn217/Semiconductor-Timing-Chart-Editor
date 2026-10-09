import { describe, expect, it } from "vitest";
import { resolveEditorStartupDocument } from "../../apps/editor/src/workspace/editor-startup-document.js";
import { cycleDocument, transactionDemoDocument, v1ReferenceDocument } from "../../apps/editor/src/fixtures-cycle-reference-documents.js";

describe("editor startup document resolution", () => {
  it("normalizes every startup and New template change to a persistent stable ID", () => {
    for (const search of [undefined, "?cycle-sample", "?visual-reference"]) {
      const first = resolveEditorStartupDocument(search);
      const second = resolveEditorStartupDocument(search);
      for (const key of ["initialDocument", "productTemplate"] as const) {
        const ids = first[key].signals.flatMap((signal) => "values" in signal ? signal.values.map((change) => change.id) : []);
        expect(ids.length).toBeGreaterThan(0);
        expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
        expect(second[key]).toEqual(first[key]);
      }
    }
    expect(cycleDocument.signals.flatMap((signal) => "values" in signal ? signal.values : []).some((change) => change.id === undefined)).toBe(true);
  });
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
