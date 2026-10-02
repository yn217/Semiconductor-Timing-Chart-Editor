import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnnotationId, SemanticAnchor } from "@timing-chart-v2/schema";
import { canonicalFixture } from "../fixtures/canonical.js";
import { TransitionArrowPicker } from "../../apps/editor/src/runtime/transition-arrow-picker.js";

describe("TransitionArrowPicker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates and selects an annotation only after both snapped endpoints are picked", () => {
    class SurfaceElement {
      closest(selector: string): SurfaceElement | null {
        return selector.includes("stable-waveform-surface") ? this : null;
      }
    }
    vi.stubGlobal("Element", SurfaceElement);
    const document = canonicalFixture();
    const anchors: SemanticAnchor[] = [
      { signalId: document.signals[0]!.id, cycle: 2, point: "rising-edge" },
      { signalId: document.signals[0]!.id, cycle: 5, point: "falling-edge" },
    ];
    let snapIndex = 0;
    const execute = vi.fn(() => ({ ok: true }));
    const selectAnnotation = vi.fn();
    const setStatus = vi.fn();
    const host = {
      dataset: {} as DOMStringMap,
      querySelector: () => ({ getBoundingClientRect: () => ({ left: 10, top: 20 }) }),
    } as unknown as HTMLElement;
    const picker = new TransitionArrowPicker({
      rendererHost: host,
      geometry: {
        screenToLocal: vi.fn(() => ({ x: 40, y: 0 })),
        currentSnapIndex: () => ({ nearest: vi.fn(() => ({ anchor: anchors[snapIndex++]!, kind: "clock-edge" })) }) as never,
      } as never,
      getZoom: () => 1,
      getDocument: () => document,
      execute,
      selectAnnotation,
      publishState: vi.fn(),
      setProblem: vi.fn(),
      setStatus,
    });
    const event = { target: new SurfaceElement(), clientX: 50, clientY: 70 } as unknown as MouseEvent;

    picker.arm("dependency");
    expect(picker.handleClick(event)).toBe(true);
    expect(picker.pending).toEqual(anchors[0]);
    expect(execute).not.toHaveBeenCalled();

    expect(picker.handleClick(event)).toBe(true);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      type: "annotation.create",
      annotation: expect.objectContaining({ type: "dependency", from: anchors[0], to: anchors[1] }),
    }));
    const created = execute.mock.calls[0]![0] as Extract<Parameters<typeof execute>[0], { type: "annotation.create" }>;
    expect(selectAnnotation).toHaveBeenCalledWith(created.annotation.id as AnnotationId);
    expect(picker.pending).toBeUndefined();
    expect(setStatus).toHaveBeenLastCalledWith("idle");
    expect(host.dataset.arrowPick).toBeUndefined();
  });
});
