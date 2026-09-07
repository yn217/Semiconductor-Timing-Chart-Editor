import { describe, expect, it } from "vitest";
import { createEditorExportController } from "../../apps/editor/src/application/editor-export-controller.js";
import { canonicalFixture } from "../fixtures/canonical.js";

describe("editor export controller", () => {
  it("routes canonical export requests through the deterministic export service", async () => {
    const controller = createEditorExportController();
    const snapshot = { revision: 7, document: canonicalFixture() };

    const bytes = await controller.export({
      format: "svg",
      snapshot,
      settings: { scope: "document" },
    });

    const svg = new TextDecoder().decode(bytes);
    expect(svg).toContain('data-wave-engine="wavedrom-3.6.2"');
    expect(svg).toContain('data-signal-id="sig_clk"');
  });
});
