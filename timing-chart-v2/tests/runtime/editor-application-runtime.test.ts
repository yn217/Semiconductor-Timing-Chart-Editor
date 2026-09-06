import { describe, expect, it } from "vitest";
import { EditorApplicationRuntime } from "../../apps/editor/src/runtime/editor-application-runtime.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("EditorApplicationRuntime current document ownership", () => {
  it("tracks the current session document across repeated replacement", () => {
    const runtime = new EditorApplicationRuntime(canonicalFixture());
    const second = { ...canonicalFixture(), document: { ...canonicalFixture().document, title: "Document B" } };
    const third = { ...canonicalFixture(), document: { ...canonicalFixture().document, title: "Document C" } };

    expect(runtime.document).toBe(runtime.session.snapshot().document);
    runtime.session.replace(second);
    expect(runtime.document).toBe(runtime.session.snapshot().document);
    expect(runtime.document.document.title).toBe("Document B");
    runtime.session.replace(third);
    expect(runtime.document).toBe(runtime.session.snapshot().document);
    expect(runtime.document.document.title).toBe("Document C");
  });
});
