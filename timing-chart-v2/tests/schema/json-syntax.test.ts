import { describe, expect, it } from "vitest";
import { parseDocument, scanJsonSyntax } from "@timing-chart-v2/schema";

describe("deterministic JSON syntax diagnostics", () => {
  it("rejects deeply nested JSON before migration walkers recurse", () => {
    let value: unknown = { formatVersion: 2 };
    for (let index = 0; index < 140; index += 1) value = { nested: value };
    const result = parseDocument(JSON.stringify(value));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]).toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED" });
  });
  it.each([
    ["multiline", "{\n  \"formatVersion\": 2,\n  ]", 3, 3],
    ["trailing comma", "{\"値\": [1,],\n\"formatVersion\": 2}", 1, 10],
    ["invalid escape", "{\"formatVersion\": 2, \"名前\": \"\\q\"}", 1, 30],
  ])("reports stable location for %s", (_name, source, line, column) => {
    const first = scanJsonSyntax(source);
    const second = scanJsonSyntax(source.replaceAll("\n", "\r\n"));
    expect(first).toBeDefined();
    expect(first?.code).toBe("JSON_SYNTAX");
    expect(first?.excerpt).toBeTruthy();
    expect(first?.caret).toContain("^");
    expect(first?.line).toBe(line);
    if (_name === "multiline") expect(first?.column).toBe(column);
    expect(second?.line).toBe(line);
    expect(second?.column).toBe(column);
  });

  it("does not depend on the native parser message and preserves parse failure", () => {
    const source = "{\r\n  \"formatVersion\": 2,\r\n  \"title\": \"壊れた\",\r\n}";
    const diagnostic = scanJsonSyntax(source);
    const result = parseDocument(source);
    expect(diagnostic).toMatchObject({ code: "JSON_SYNTAX", line: 4, column: 1 });
    expect(result).toMatchObject({ ok: false, kind: "syntax" });
    if (!result.ok) expect(result.problems[0]).toMatchObject({ code: "JSON_SYNTAX", line: diagnostic?.line, column: diagnostic?.column, offset: diagnostic?.offset });
  });

  it("rejects non-JSON Unicode whitespace deterministically", () => {
    const source = `{"formatVersion":\u00a02}`;
    expect(scanJsonSyntax(source)).toMatchObject({ code: "JSON_SYNTAX", line: 1, column: 18 });
    expect(parseDocument(source)).toMatchObject({ ok: false, kind: "syntax" });
  });
});
