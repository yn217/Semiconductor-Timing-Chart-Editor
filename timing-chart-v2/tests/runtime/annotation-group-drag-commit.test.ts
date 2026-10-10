import { describe, expect, it, vi } from "vitest";
import { ImmutableLocalGeometryMap, ImmutableSnapIndex } from "@timing-chart-v2/geometry";
import { buildDisplayTimeMapping, type RenderProjection } from "@timing-chart-v2/projection";
import type { Annotation, AnnotationId, CanonicalDocument } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";

// The owner runs in a browser; give it the minimal DOM surface a whole-annotation drag touches.
// `domOwners` lists only the Annotations rendered in the DOM (the rest model viewport-culled members).
class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  constructor(private readonly roles: Readonly<Record<string, FakeElement | null>> = {}, private readonly domOwners: Readonly<Record<string, FakeElement>> = {}) {}
  closest(selector: string): FakeElement | null { return this.roles[selector] ?? null; }
  querySelector(selector: string): FakeElement | null {
    const match = /data-annotation-id="([^"]+)"/.exec(selector);
    return match ? this.domOwners[match[1]!] ?? null : null;
  }
  setPointerCapture(): void {}
}
(globalThis as { Element?: unknown }).Element ??= FakeElement;
const { AnnotationInteractionOwner } = await import("../../apps/editor/src/runtime/timeline-annotation-interaction-owner.js");

const OWNER_SELECTOR = "[data-role='annotation-owner'][data-annotation-id]";

/** A group of four arrows: ann_0 is the pointed-at primary, ann_1/ann_2 are off-screen (no DOM owner), ann_3 is locked
 * and on-screen. The owner's group membership is resolved from the document, as timeline-surface-interactions does. */
function setup(options: { readonly primaryLocked?: boolean } = {}) {
  const source = canonicalFixture();
  const signal = source.signals.find((item) => item.type !== "commentRow")!;
  const annotations: Annotation[] = ["ann_0", "ann_1", "ann_2", "ann_3"].map((id, index) => ({
    id: id as AnnotationId,
    type: "arrow",
    label: id,
    visible: true,
    ...(id === "ann_3" || (id === "ann_0" && options.primaryLocked) ? { locked: true } : {}),
    start: { signalId: signal.id, cycle: index, point: "row-center" as const },
    end: { signalId: signal.id, cycle: index + 1, point: "row-center" as const },
  }) as Annotation);
  const groupIds = ["ann_0", "ann_1", "ann_2", "ann_3"] as AnnotationId[];
  const document: CanonicalDocument = {
    ...source,
    annotations,
    annotationGroups: [{ id: "agrp_1" as never, name: "G", annotationIds: groupIds } as never],
  };
  const map = new ImmutableLocalGeometryMap(signal.id, Array.from({ length: 8 }, (_, cycle) => ({ cycle, point: "row-center" as const, position: { x: cycle * 10, y: 0 } })));
  const projection = { rowLayout: [{ rowId: signal.id, groupId: "grp", groupName: "G", kind: "timing", name: "S", visible: true, y: 0, height: 28 }], totalHeight: 28 } as unknown as RenderProjection;
  const mapping = buildDisplayTimeMapping(document.timeline, []);
  const timeAxisMetrics = { zoom: 1, presentationScale: 1, mapping, sourceBoundaryToContentX: (cycle: number) => cycle * 10 } as never;
  const renderer = { updateSnapGuide: vi.fn(), updateOverlays: vi.fn(), patchOverlays: vi.fn(() => 0) };
  const executeBatch = vi.fn();
  const execute = vi.fn();
  const ann0Element = new FakeElement();
  ann0Element.dataset.annotationId = "ann_0";
  const ann3Element = new FakeElement();
  ann3Element.dataset.annotationId = "ann_3";
  const rendererHost = new FakeElement({}, { ann_0: ann0Element, ann_3: ann3Element });
  const owner = new AnnotationInteractionOwner({
    rendererHost: rendererHost as never,
    renderer: renderer as never,
    timelineGeometry: { screenToLocal: (point: never) => point, timeAxisMetrics, geometryMaps: new Map([[signal.id, map]]), currentSnapIndex: () => new ImmutableSnapIndex([]) } as never,
    documentEpoch: { current: () => 1, isCurrent: () => true },
    getDocument: () => document,
    getProjection: () => projection,
    isSnapEnabled: () => false,
    execute, executeBatch,
    publishState: () => {},
    getDragTargets: (id) => {
      const group = document.annotationGroups?.find((candidate) => candidate.annotationIds.includes(id as AnnotationId));
      return new Set(group ? group.annotationIds : [id]);
    },
  });
  const target = new FakeElement({ [OWNER_SELECTOR]: ann0Element });
  const pointer = (clientX: number) => ({ button: 0, target, clientX, clientY: 0, pointerId: 1, preventDefault: () => {} }) as never;
  return {
    executeBatch, execute,
    down: () => owner.onPointerDown(pointer(0)),
    move: (x: number) => owner.onPointerMove(pointer(x)),
    up: (x: number) => owner.onPointerUp(pointer(x)),
  };
}

describe("group drag commit uses document membership, not DOM owners", () => {
  it("moves off-screen group members and skips the locked member in one batch", () => {
    const harness = setup();
    harness.down();
    harness.move(30);
    harness.up(30);
    expect(harness.execute).not.toHaveBeenCalled();
    expect(harness.executeBatch).toHaveBeenCalledTimes(1);
    const commands = harness.executeBatch.mock.calls[0]![0] as Array<{ type: string; annotationId: string; delta: { x: number; y: number } }>;
    expect(commands.map((command) => command.annotationId).sort()).toEqual(["ann_0", "ann_1", "ann_2"]);
    expect(commands.every((command) => command.type === "annotation.translateOffsets" && command.delta.x === 30 && command.delta.y === 0)).toBe(true);
  });

  it("does not start a drag when the pointed-at annotation is locked", () => {
    const harness = setup({ primaryLocked: true });
    harness.down();
    harness.move(30);
    harness.up(30);
    expect(harness.executeBatch).not.toHaveBeenCalled();
    expect(harness.execute).not.toHaveBeenCalled();
  });
});
