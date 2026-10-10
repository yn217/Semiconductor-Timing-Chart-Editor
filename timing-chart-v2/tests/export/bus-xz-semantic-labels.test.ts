import { describe, expect, it } from "vitest";
import { buildExportScene, renderExportSvg, type ExportSettings } from "@timing-chart-v2/export";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const DATA = "sig_data" as SignalId;

function busWithLogicChanges(): CanonicalDocument {
  const fixture = canonicalFixture();
  return {
    ...fixture,
    signals: fixture.signals.map((signal) => signal.id === DATA
      ? { ...signal, displayFormat: undefined, values: [{ start: 0, value: "AA" }, { start: 2, value: "x" }, { start: 4, value: "BB" }] }
      : signal),
  } as CanonicalDocument;
}

function decodeXml(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Each bus value label is `<text ...><tspan>visible</tspan>...<title>semantic</title></text>`. */
function valueLabelPairs(svg: string): Array<{ visible: string; semantic: string }> {
  const pattern = /<text\b[^>]*>\s*<tspan>([^<]*)<\/tspan>(?:(?!<\/text>)[\s\S])*?<title>([^<]*)<\/title>/g;
  return Array.from(svg.matchAll(pattern), (match) => ({ visible: decodeXml(match[1]!), semantic: decodeXml(match[2]!) }));
}

const SCOPES: ReadonlyArray<[string, ExportSettings]> = [
  ["document scope", { scope: "document" }],
  ["selected-range scope", { scope: "selected-range", range: { start: 0, end: 8 } }],
];

describe("bus X/Z semantic labels in export", () => {
  for (const [name, settings] of SCOPES) {
    it(`pairs each bus value label with its own semantic value (${name})`, () => {
      const scene = buildExportScene(busWithLogicChanges(), { format: "svg", ...settings });
      const pairs = valueLabelPairs(renderExportSvg(scene));
      expect(pairs.map((pair) => pair.visible)).toEqual(["AA", "BB"]);
      for (const pair of pairs) expect(pair.semantic).toBe(pair.visible);
    });
  }
});
