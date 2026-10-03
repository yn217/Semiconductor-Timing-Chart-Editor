import { describe, expect, it, vi } from "vitest";
import { buildExportScene, DeterministicExportService, renderExportSvg } from "@timing-chart-v2/export";
import { canonicalFixture } from "../fixtures/canonical.js";

/**
 * #858 (PR #1021 independent check): the single-buffer cooperative SVG encoder must emit exactly the bytes of the synchronous renderer,
 * for ASCII, BMP (Japanese), astral (emoji) and lone-surrogate metadata, even when the 16 ms cooperative slice splits the work into many chunks.
 */
describe("cooperative SVG encoding is byte-identical to the synchronous renderer", () => {
  const titles = ["Plain ASCII title", "日本語のタイトル 半導体", "Emoji 🧭🚀 mixed 日本 text", "Lone \ud800 high and \udc00 low surrogates", "Pair 🚀 then lone \ud83d end"];
  for (const title of titles) {
    it(`title ${JSON.stringify(title)}`, async () => {
      const base = canonicalFixture();
      const document = { ...base, document: { ...base.document, title }, timeline: { ...base.timeline, end: 2048, cycleCount: 2048 }, signals: [], signalGroups: [], transactions: [], annotations: [], timeGroups: [] };
      const settings = { scope: "document" as const };
      const expectedText = renderExportSvg(buildExportScene(document, { format: "svg", ...settings }));
      const expected = new TextEncoder().encode(expectedText);
      let now = 0;
      const performanceNow = vi.spyOn(globalThis.performance, "now").mockImplementation(() => { now += 20; return now; });
      vi.stubGlobal("scheduler", { yield: vi.fn(async () => undefined) });
      try {
        const actual = await new DeterministicExportService().export({ format: "svg", snapshot: { revision: 0, document }, settings });
        expect(actual.byteLength).toBe(expected.byteLength);
        expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
      } finally { performanceNow.mockRestore(); vi.unstubAllGlobals(); }
    });
  }
});
