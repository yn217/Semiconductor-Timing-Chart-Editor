import { describe, expect, it, vi } from "vitest";
import { disposeWaveCanvas, paintWaveCanvas, refreshWaveCanvasViewport, supportsCanvasWaveJson } from "../../apps/editor/src/runtime/canvas-wave-painter.js";

describe("Canvas WaveJSON capability fallback", () => {
  it("accepts only the cycle-aligned subset represented by the painter", () => {
    expect(supportsCanvasWaveJson({ wave: "0p1n.x" })).toBe(true);
    expect(supportsCanvasWaveJson({ wave: "01", period: 4 })).toBe(false);
    expect(supportsCanvasWaveJson({ wave: "01", phase: 0.5 })).toBe(false);
    expect(supportsCanvasWaveJson({ wave: "0|1" })).toBe(false);
    expect(supportsCanvasWaveJson({ wave: "01", geometrySourceCycles: [10, 11, 13] })).toBe(false);
    expect(supportsCanvasWaveJson({ wave: "01", geometrySourceCycles: [10, 11] })).toBe(false);
    expect(supportsCanvasWaveJson({ wave: "dU" })).toBe(false);
    expect(supportsCanvasWaveJson({ wave: "=", data: ["BUS"] })).toBe(false);
    expect(supportsCanvasWaveJson({ wave: "0p", clock: { expanded: true, polarity: "positive", initial: 0 } })).toBe(false);
  });

  it("uses the owner Signal's waveform color for Canvas stroke and labels", () => {
    const context = {
      save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), translate: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      rect: vi.fn(), clip: vi.fn(), closePath: vi.fn(), fillText: vi.fn(), stroke: vi.fn(),
      strokeStyle: "", fillStyle: "", lineWidth: 0, font: "", textBaseline: "", textAlign: "",
    };
    const canvas = {
      setAttribute: vi.fn(), width: 0, height: 0,
      style: { cssText: "", width: "", left: "" },
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;
    let styleListener: EventListener = () => undefined;
    const owner = {
      dataset: { waveformStyleColor: "#ff0000" },
      ownerDocument: { createElement: vi.fn(() => canvas) },
      replaceChildren: vi.fn(),
      closest: vi.fn(() => null),
      addEventListener: vi.fn((_name, listener) => { styleListener = listener; }),
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 30 }),
    } as unknown as HTMLElement;

    paintWaveCanvas(owner, { wave: "01" });

    expect(context.strokeStyle).toBe("#ff0000");
    expect(context.fillStyle).toBe("#ff0000");
    owner.dataset.waveformStyleColor = "#00aa00";
    styleListener(new Event("waveform-style-change"));
    expect(context.strokeStyle).toBe("#00aa00");
    disposeWaveCanvas(owner);
    expect(owner.removeEventListener).toHaveBeenCalledWith("wave-canvas-restyle", expect.any(Function));
  });

  it("shares scroll listeners across owners, ignores vertical-only scroll, and repaints after mode changes", () => {
    const cycleListeners = new Map<string, EventListener>();
    const timelineListeners = new Map<string, EventListener>();
    const cycleViewport = {
      scrollLeft: 0,
      getBoundingClientRect: () => ({ left: 0, right: 400, top: 0, bottom: 300 }),
      addEventListener: vi.fn((name: string, listener: EventListener) => cycleListeners.set(name, listener)),
      removeEventListener: vi.fn((name: string) => cycleListeners.delete(name)),
    } as unknown as HTMLElement;
    const timelineViewport = {
      scrollLeft: 0,
      getBoundingClientRect: () => ({ left: 0, right: 400, top: 0, bottom: 300 }),
      addEventListener: vi.fn((name: string, listener: EventListener) => timelineListeners.set(name, listener)),
      removeEventListener: vi.fn((name: string) => timelineListeners.delete(name)),
    } as unknown as HTMLElement;
    let widthAssignments = 0;
    let heightAssignments = 0;
    const makeOwner = () => {
      let canvasWidth = 0;
      let canvasHeight = 0;
      const context = {
        save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), translate: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
        rect: vi.fn(), clip: vi.fn(), closePath: vi.fn(), fillText: vi.fn(), stroke: vi.fn(),
        strokeStyle: "", fillStyle: "", lineWidth: 0, font: "", textBaseline: "", textAlign: "",
      };
      const canvas = {
        setAttribute: vi.fn(),
        get width() { return canvasWidth; }, set width(value: number) { widthAssignments += 1; canvasWidth = value; },
        get height() { return canvasHeight; }, set height(value: number) { heightAssignments += 1; canvasHeight = value; },
        style: { cssText: "", width: "", left: "" },
        getContext: vi.fn(() => context),
      } as unknown as HTMLCanvasElement;
      const owner = {
        dataset: {}, isConnected: true,
        ownerDocument: { createElement: vi.fn(() => canvas) },
        replaceChildren: vi.fn(), contains: () => true,
        addEventListener: vi.fn(), removeEventListener: vi.fn(),
        closest: (selector: string) => selector === ".cycle-viewport" ? cycleViewport : selector === "[data-role='timeline-viewport']" ? timelineViewport : null,
        getBoundingClientRect: () => {
          const offset = cycleViewport.scrollLeft + timelineViewport.scrollLeft;
          return { left: -offset, right: 600 - offset, top: 0, bottom: 30 };
        },
      } as unknown as HTMLElement;
      return { owner, context };
    };
    const first = makeOwner();
    const second = makeOwner();
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const wave = { wave: "01".repeat(40) };
    paintWaveCanvas(first.owner, wave);
    paintWaveCanvas(second.owner, wave);
    paintWaveCanvas(first.owner, wave);

    expect(cycleViewport.addEventListener).toHaveBeenCalledTimes(1);
    expect(timelineViewport.addEventListener).toHaveBeenCalledTimes(1);
    expect(widthAssignments).toBe(2);
    expect(heightAssignments).toBe(2);
    const onScroll = cycleListeners.get("scroll")!;
    onScroll({ currentTarget: cycleViewport } as unknown as Event);
    expect(requestFrame).not.toHaveBeenCalled();
    (cycleViewport as unknown as { scrollLeft: number }).scrollLeft = 600;
    onScroll({ currentTarget: cycleViewport } as unknown as Event);
    expect(requestFrame).toHaveBeenCalledOnce();
    frames[0]!(0);
    expect(first.context.clearRect).toHaveBeenCalledTimes(2);
    expect(second.context.clearRect).toHaveBeenCalledTimes(2);

    (timelineViewport as unknown as { scrollLeft: number }).scrollLeft = 240;
    timelineListeners.get("scroll")!({ currentTarget: timelineViewport } as unknown as Event);
    expect(requestFrame).toHaveBeenCalledTimes(2);
    frames[1]!(0);
    expect(first.context.clearRect).toHaveBeenCalledTimes(3);
    expect(second.context.clearRect).toHaveBeenCalledTimes(3);

    refreshWaveCanvasViewport(first.owner);
    refreshWaveCanvasViewport(second.owner);
    expect(cycleViewport.addEventListener).toHaveBeenCalledTimes(1);
    expect(timelineViewport.addEventListener).toHaveBeenCalledTimes(1);

    disposeWaveCanvas(first.owner);
    expect(cycleViewport.removeEventListener).not.toHaveBeenCalled();
    disposeWaveCanvas(second.owner);
    expect(cycleViewport.removeEventListener).toHaveBeenCalledOnce();
    expect(timelineViewport.removeEventListener).toHaveBeenCalledOnce();
    expect(first.owner.dataset.waveState).toBeUndefined();
  });
});
