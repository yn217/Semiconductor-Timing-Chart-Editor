import { describe, expect, it } from "vitest";
import { UiCommandRegistry } from "@timing-chart-v2/ui";

describe("UI command registry", () => {
  it("routes every invocation through the same registered handler", () => {
    const registry = new UiCommandRegistry();
    const payloads: string[] = [];
    const unregister = registry.register<string>("selection.delete", (payload) => payloads.push(payload));
    for (const route of ["ribbon", "keyboard", "context-menu", "inspector"]) registry.execute("selection.delete", route);
    expect(payloads).toEqual(["ribbon", "keyboard", "context-menu", "inspector"]);
    unregister();
    expect(registry.canExecute("selection.delete")).toBe(false);
  });
});
