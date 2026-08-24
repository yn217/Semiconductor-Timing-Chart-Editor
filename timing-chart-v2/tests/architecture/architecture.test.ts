import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("Phase 0 architecture declarations", () => {
  it("assigns each state key to exactly one authoritative owner", () => {
    const owners = JSON.parse(readFileSync(resolve(root, "architecture/state-ownership.json"), "utf8")) as Array<{ key: string }>;
    expect(new Set(owners.map(({ key }) => key)).size).toBe(owners.length);
  });

  it("keeps every non-persistent state out of save and undo", () => {
    const owners = JSON.parse(readFileSync(resolve(root, "architecture/state-ownership.json"), "utf8")) as Array<{ class: string; saved: boolean; undoable: boolean }>;
    expect(owners.filter((state) => state.class !== "persistent" && (state.saved || state.undoable))).toEqual([]);
  });

  it("pins WaveDrom at the adapter boundary", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "packages/wavedrom-adapter/package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(manifest.dependencies.wavedrom).toBe("3.6.2");
  });
});
