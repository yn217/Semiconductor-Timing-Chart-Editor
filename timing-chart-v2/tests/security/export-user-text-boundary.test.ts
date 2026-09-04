import { describe, expect, it } from "vitest";
import { buildExportScene, renderExportSvg } from "@timing-chart-v2/export";
import { renderWaveJsonMarkup } from "@timing-chart-v2/wavedrom-adapter";
import { canonicalFixture } from "../fixtures/canonical.js";

const hostile = `<script>alert(1)</script> <image href="javascript:alert(1)"> <text onclick="alert(1)">x</text>`;

describe("user text export trust boundary", () => {
  it("serializes document text as inert SVG text and escapes active-looking content", () => {
    const source = canonicalFixture();
    const document = {
      ...source,
      document: {
        ...source.document,
        title: hostile,
        header: { ...source.document.header, description: hostile },
        footer: { ...source.document.footer, text: hostile },
      },
      signals: source.signals.map((signal, index) => index === 0
        ? { ...signal, display: { ...signal.display, name: hostile }, source: { ...signal.source, signalName: hostile } }
        : signal),
      annotations: source.annotations.map((annotation) => ({ ...annotation, label: hostile })),
      transactions: source.transactions.map((transaction) => ({ ...transaction, name: hostile })),
    };

    const svg = renderExportSvg(buildExportScene(document, { format: "svg", scope: "document" }));

    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(svg).toContain("&lt;image href=&quot;javascript:alert(1)&quot;&gt;");
    expect(svg).not.toMatch(/<script\b|<image\b|<text[^>]*\bon[a-z][\\w:-]*\\s*=/i);
    expect(svg).not.toMatch(/(?:href|xlink:href)=\"\s*javascript:/i);
  });

  it("rejects hostile WaveJSON before executable markup can be materialized", () => {
    expect(() => renderWaveJsonMarkup({ wave: "=", data: [hostile] })).toThrowError(expect.objectContaining({ code: "UNSAFE_WAVEDROM_SVG" }));
  });
});
