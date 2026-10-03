import { describe, expect, it, vi } from "vitest";
import { ImmutableLocalGeometryMap, ImmutableSnapIndex } from "@timing-chart-v2/geometry";
import { buildDisplayTimeMapping, type RenderProjection } from "@timing-chart-v2/projection";
import type { Annotation, CanonicalDocument } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

// The owner runs in a browser; give it the minimal DOM surface it touches.
class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  constructor(private readonly roles: Readonly<Record<string, FakeElement | null>> = {}) {}
  closest(selector: string): FakeElement | null { return this.roles[selector] ?? null; }
  querySelector(): null { return null; }
  setPointerCapture(): void {}
}
(globalThis as { Element?: unknown }).Element ??= FakeElement;
const { AnnotationInteractionOwner } = await import("../../apps/editor/src/runtime/timeline-annotation-interaction-owner.js");

type Primitive = { readonly id: string; readonly anchors: readonly { readonly field: string; readonly x: number }[]; readonly measurementLane?: number };

function setup(count: number, draggedType: Annotation["type"] = "arrow") {
  const source = canonicalFixture();
  const signal = source.signals.find((item) => item.type !== "commentRow")!;
  const annotations: Annotation[] = Array.from({ length: count }, (_, index) => ({
    id: `ann_${index}` as never,
    type: index === 0 ? draggedType : "arrow",
    label: `A${index}`,
    visible: true,
    start: { signalId: signal.id, cycle: index % 64, point: "row-center" as const },
    end: { signalId: signal.id, cycle: (index % 64) + 1, point: "row-center" as const },
  }) as Annotation);
  const document: CanonicalDocument = { ...source, annotations };
  const map = new ImmutableLocalGeometryMap(signal.id, Array.from({ length: 66 }, (_, cycle) => ({ cycle, point: "row-center" as const, position: { x: cycle * 10, y: 0 } })));
  const projection = { rowLayout: [{ rowId: signal.id, groupId: "grp", groupName: "G", kind: "timing", name: "S", visible: true, y: 0, height: 28 }], totalHeight: 28 } as unknown as RenderProjection;
  const mapping = buildDisplayTimeMapping(document.timeline, []);
  const timeAxisMetrics = { zoom: 1, presentationScale: 1, mapping, sourceBoundaryToContentX: (cycle: number) => cycle * 10 } as never;
  let primitivesHandedToRenderer = 0;
  let lastPrimitives: readonly Primitive[] = [];
  const record = (primitives: readonly Primitive[]) => { primitivesHandedToRenderer += primitives.length; lastPrimitives = primitives; };
  const renderer = { updateSnapGuide: vi.fn(), updateOverlays: vi.fn(record), patchOverlays: vi.fn(record) };
  const execute = vi.fn();
  const executeBatch = vi.fn();
  const owner = new AnnotationInteractionOwner({
    rendererHost: new FakeElement() as never,
    renderer: renderer as never,
    timelineGeometry: { screenToLocal: (point: never) => point, timeAxisMetrics, geometryMaps: new Map([[signal.id, map]]), currentSnapIndex: () => new ImmutableSnapIndex([]) } as never,
    documentEpoch: { current: () => 1, isCurrent: () => true },
    getDocument: () => document,
    getProjection: () => projection,
    isSnapEnabled: () => false,
    execute, executeBatch,
    publishState: () => {},
    getDragTargets: (id) => new Set([id]),
  });
  const ownerElement = new FakeElement();
  ownerElement.dataset.annotationId = "ann_0";
  const handle = new FakeElement();
  handle.dataset.annotationField = "end";
  const target = new FakeElement({ "[data-role='annotation-owner'][data-annotation-id]": ownerElement, "[data-role='annotation-handle'][data-annotation-field]": handle });
  const pointer = (clientX: number) => ({ button: 0, target, clientX, clientY: 0, pointerId: 1, preventDefault: () => {} }) as never;
  return {
    document, renderer, execute,
    down: () => owner.onPointerDown(pointer(0)),
    move: (x: number) => owner.onPointerMove(pointer(x)),
    up: (x: number) => owner.onPointerUp(pointer(x)),
    cancel: () => owner.cancel(),
    counts: () => ({ primitivesHandedToRenderer, lastPrimitives }),
    reset: () => { primitivesHandedToRenderer = 0; },
  };
}

describe("annotation endpoint drag Preview cost (#175, 20k Annotations)", () => {
  it("hands the renderer O(dragged) primitives per pointermove regardless of Annotation count", () => {
    const perMove: Record<number, number> = {};
    const ms: Record<number, number> = {};
    for (const count of [2_000, 10_000, 20_000]) {
      const harness = setup(count);
      harness.down();
      harness.move(1); // warm-up
      harness.reset();
      const startedAt = performance.now();
      for (let step = 2; step < 22; step += 1) harness.move(step);
      ms[count] = (performance.now() - startedAt) / 20;
      perMove[count] = harness.counts().primitivesHandedToRenderer / 20;
      harness.cancel();
    }
    console.info(`[annotation-drag-preview] primitives/move ${JSON.stringify(perMove)} ms/move ${JSON.stringify(Object.fromEntries(Object.entries(ms).map(([key, value]) => [key, Number(value.toFixed(3))])))}`);
    expect(perMove[2_000]).toBeLessThanOrEqual(1);
    expect(perMove[20_000]).toBe(perMove[2_000]);
  });

  it("previews the dragged endpoint, stays view-only, and commits one setAnchor on pointerup", () => {
    const harness = setup(2_000);
    const before = harness.document;
    harness.down();
    harness.move(20);
    const preview = harness.counts().lastPrimitives.find((item) => item.id === "ann_0");
    expect(preview?.anchors.find((anchor) => anchor.field === "end")?.x).toBe(30);
    expect(preview?.anchors.find((anchor) => anchor.field === "start")?.x).toBe(0);
    expect(harness.document).toBe(before);
    expect(harness.execute).not.toHaveBeenCalled();
    harness.up(20);
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(harness.execute.mock.calls[0]![0]).toMatchObject({ type: "annotation.setAnchor", annotationId: "ann_0", field: "end" });
  });

  it("cancel restores the committed geometry of the dragged Annotation", () => {
    const harness = setup(2_000);
    harness.down();
    harness.move(20);
    harness.cancel();
    const restored = harness.counts().lastPrimitives.find((item) => item.id === "ann_0");
    expect(restored?.anchors.find((anchor) => anchor.field === "end")?.x).toBe(10);
  });

  it("previews a Measurement endpoint (lane pool = document Measurements)", () => {
    const harness = setup(300, "measurement");
    harness.down();
    harness.move(20);
    const preview = harness.counts().lastPrimitives.find((item) => item.id === "ann_0");
    expect(preview?.anchors.find((anchor) => anchor.field === "end")?.x).toBe(30);
  });
});
