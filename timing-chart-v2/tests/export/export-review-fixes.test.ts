import { describe, expect, it } from "vitest";
import { buildExportScene, renderExportSvg } from "@timing-chart-v2/export";
import type { AnnotationId, CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

const DATA = "sig_data" as SignalId;

function withAnnotations(annotations: CanonicalDocument["annotations"]): CanonicalDocument {
  return { ...canonicalFixture(), annotations };
}

describe("export review fixes", () => {
  it("sizes page overlays in unscaled content units and places the footer on the page", () => {
    const document = withAnnotations([{ id: "ann_range" as AnnotationId, type: "range", label: "Window", start: { signalId: DATA, cycle: 1, point: "cycle-start" }, end: { signalId: DATA, cycle: 4, point: "cycle-start" } }]);
    const scene = buildExportScene(document, { format: "svg", scope: "document", page: { size: "A4", orientation: "landscape", margin: 20, fit: "page" } });
    expect(scene.page).toBeDefined();
    const contentHeight = scene.page!.contentHeight;
    // A4 landscape is 794 px tall; the content is scaled to fit, so its unscaled height is not the page height.
    expect(contentHeight).toBeLessThan(scene.height);
    const svg = renderExportSvg(scene);
    // Ruler gridlines, the range band and the axis chevrons all end at the content bottom (content units).
    expect(svg).toContain(`y2="${contentHeight - 24}"`);
    expect(svg).not.toContain(`y2="${scene.height - 24}"`);
    expect(svg).toMatch(/data-annotation-type="range"[^]*?<rect[^>]*height="(\d+)"/);
    expect(svg.match(/data-annotation-type="range"[^]*?<rect[^>]*height="(\d+)"/)?.[1]).toBe(String(contentHeight));
    // The footer is a page-level element: drawn outside the scaled group, inset by the margin in page units.
    expect(svg).toContain(`<text data-layout="footer" x="32" y="${scene.height - 32}"`);
  });

  it("keeps the un-paged export unchanged: overlays and footer span the content height", () => {
    const scene = buildExportScene(withAnnotations([]), { format: "svg", scope: "document" });
    const svg = renderExportSvg(scene);
    expect(scene.page).toBeUndefined();
    expect(svg).toContain(`y2="${scene.height - 24}"`);
    expect(svg).toContain(`<text data-layout="footer" x="12" y="${scene.height - 12}"`);
  });

  it("places value-center and row-center anchors at the cycle centre, like the live geometry", () => {
    const x1For = (point: "cycle-start" | "cycle-center" | "value-center" | "row-center") => {
      const scene = buildExportScene(withAnnotations([{ id: "ann_marker" as AnnotationId, type: "marker", label: "M", anchor: { signalId: DATA, cycle: 2, point } }]), { format: "svg", scope: "document" });
      return { x: scene.annotations[0]!.x1, cycleWidth: scene.ruler.cycleWidth };
    };
    const start = x1For("cycle-start");
    const center = x1For("cycle-center");
    const valueCenter = x1For("value-center");
    const rowCenter = x1For("row-center");
    expect(center.x - start.x).toBeCloseTo(start.cycleWidth / 2, 6);
    expect(valueCenter.x).toBeCloseTo(center.x, 6);
    expect(rowCenter.x).toBeCloseTo(center.x, 6);
  });
});
