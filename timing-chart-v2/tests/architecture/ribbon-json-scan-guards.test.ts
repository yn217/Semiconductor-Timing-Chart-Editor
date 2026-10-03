import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../..");
const source = (file: string) => readFileSync(resolve(workspace, file), "utf8");

// #175 perf review: guards for 61ea6318 so the per-render scans don't regress.
describe("ribbon / advanced JSON scan guards", () => {
  it("Ribbon Arrange resolves annotations via one memoized id index, never document.annotations.find per target", () => {
    const text = source("apps/editor/src/minimal-cycle-view-ribbon.tsx");
    expect(text).toMatch(/const annotationById = useMemo\(\(\) => new Map\(document\.annotations\.map\(.*\), \[document\.annotations\]\);/);
    expect(text).not.toMatch(/document\.annotations\.find\(/);
    expect(text).not.toMatch(/document\.annotations\.some\(/);  });

  it("Advanced JSON only serializes the whole document for the document scope", () => {
    const text = source("apps/editor/src/advanced-json-panel.tsx");
    expect(text).not.toMatch(/useMemo\(\(\) => serializeCanonicalDocument\(document\), \[document\]\)/);
    expect(text).toMatch(/useMemo\(\(\) => scope === "document" \? serializeCanonicalDocument\(document\) : "", \[document, scope\]\)/);
    // The only other call is the explicit switch into document scope.
    expect(text.match(/serializeCanonicalDocument\(document\)/g)?.length).toBe(2);
    expect(text).toMatch(/nextScope === "selected" \? selectedText : serializeCanonicalDocument\(document\)/);
  });
});
