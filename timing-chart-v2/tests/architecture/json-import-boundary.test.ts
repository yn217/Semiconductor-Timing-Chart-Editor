import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("user-controlled JSON import boundary", () => {
  it("does not combine FileReader with a direct JSON.parse in editor components", () => {
    const root = join(process.cwd(), "apps", "editor", "src");
    const bypasses = sourceFiles(root).filter((path) => {
      const source = readFileSync(path, "utf8");
      return source.includes("FileReader") && source.includes("JSON.parse");
    });
    expect(bypasses).toEqual([]);
  });
});
