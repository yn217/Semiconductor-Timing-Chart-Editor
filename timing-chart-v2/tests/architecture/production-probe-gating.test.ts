import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(import.meta.dirname, "../..");

describe("development-only production probes", () => {
  it("guards every probe import behind Vite's dev flag", () => {
    const entry = readFileSync(resolve(workspace, "apps/editor/src/main.tsx"), "utf8");
    const guardedProbeImports = [...entry.matchAll(/if \(import\.meta\.env\.DEV && probe === "([^"]+)"\) \{\s*void import\("\.\/probes\/([^\"]+)"\)/g)];

    expect(guardedProbeImports.map((match) => match[1])).toEqual(["geometry", "geometry-equivalence", "stable"]);
    expect(guardedProbeImports).toHaveLength(3);
    expect(entry.match(/import\("\.\/probes\//g)).toHaveLength(3);
  });
});
