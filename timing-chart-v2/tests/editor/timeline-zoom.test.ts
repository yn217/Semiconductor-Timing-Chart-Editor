import { describe, expect, it } from "vitest";
import { applyTimelineZoom, type TimelineZoomSurfaceContext } from "../../apps/editor/src/runtime/use-editor-runtime-bridge.js";

function styleProbe() {
  let origin = "";
  let originWrites = 0;
  const style = {
    get transformOrigin() { return origin; },
    set transformOrigin(value: string) { originWrites += 1; origin = value; },
    scale: "",
    setProperty: () => undefined,
  } as unknown as CSSStyleDeclaration;
  return { style, get originWrites() { return originWrites; } };
}

function elementWithStyle(style: CSSStyleDeclaration): HTMLElement {
  return { style, dataset: {}, querySelector: () => null } as unknown as HTMLElement;
}

describe("applyTimelineZoom", () => {
  it("initializes transform origins once while updating view-only scale each time", () => {
    const scalable = styleProbe();
    const ruler = styleProbe();
    const viewport = elementWithStyle(styleProbe().style);
    const chart = elementWithStyle(styleProbe().style);
    let hostQueries = 0;
    const host = { ...elementWithStyle(styleProbe().style), querySelector: () => { hostQueries += 1; return chart; } } as unknown as HTMLElement;
    const context = {
      rendererHost: host,
      timingSurface: chart,
      viewport,
      ruler: elementWithStyle(ruler.style),
      scalable: [elementWithStyle(scalable.style)],
      leftPaneWidth: 0,
      frozenPaneWidth: 0,
      inspectorWidth: 0,
      viewportWidth: 800,
      timelineOffset: 0,
      onPresentationScale: () => undefined,
      onSyncFrozenColumns: () => undefined,
      onZoom: () => undefined,
    } satisfies TimelineZoomSurfaceContext;

    expect(applyTimelineZoom(1.1, context)).toBe(1.1);
    expect(applyTimelineZoom(1.2, context)).toBe(1.2);
    expect(scalable.originWrites).toBe(1);
    expect(ruler.originWrites).toBe(1);
    expect(scalable.style.scale).toBe("1.2 1");
    expect(hostQueries).toBe(0);
  });
});
