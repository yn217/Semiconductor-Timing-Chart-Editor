import { afterEach, describe, expect, it, vi } from "vitest";
import { CursorOverlayOwner, type CursorOverlayInput } from "../../apps/editor/src/runtime/cursor-overlay-owner.js";

function element(dataset: Record<string, string> = {}) {
  const children: ReturnType<typeof element>[] = [];
  const node = {
    dataset,
    style: {} as Record<string, string>,
    hidden: false,
    scrollLeft: 0,
    clientHeight: 400,
    parentElement: null,
    children,
    ownerDocument: undefined as unknown as { createElement: (tag: string) => ReturnType<typeof element> },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    append(child: ReturnType<typeof element>) { children.push(child); child.parentElement = node; },
    remove() { const index = this.parentElement?.children.indexOf(this) ?? -1; if (index >= 0) this.parentElement!.children.splice(index, 1); },
    setAttribute: vi.fn(),
    getBoundingClientRect: () => ({ left: Number(dataset.left ?? 0), top: 0, bottom: 400 }),
    closest: () => null,
    querySelector(selector: string) {
      const match = selector.match(/data-(?:role|cursor)=['"]([^'"]+)['"]/);
      const key = selector.includes("data-role") ? "role" : "cursor";
      return children.find((child) => child.dataset[key] === match?.[1]) ?? null;
    },
    querySelectorAll: () => [] as ReturnType<typeof element>[],
  };
  node.ownerDocument = { createElement: () => element() };
  return node;
}

afterEach(() => vi.unstubAllGlobals());

describe("CursorOverlayOwner presentation refresh", () => {
  it("updates cursor IDs without reconnecting listeners or ResizeObserver", () => {
    const observerInstances: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
    class ResizeObserverStub {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor() { observerInstances.push(this); }
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const windowStub = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("window", windowStub);

    const viewport = element({ timeViewportOwner: "transaction-viewport" });
    const ruler = element();
    const ticks = [element({ cycle: "2", left: "42" }), element({ cycle: "3", left: "62" })];
    ruler.querySelectorAll = () => ticks;
    const input: CursorOverlayInput = {
      viewport: viewport as unknown as HTMLDivElement,
      ruler: ruler as unknown as HTMLDivElement,
      viewportLower: null,
      rulerLower: null,
      cursorA: 2,
      onSetCursorAtCycle: () => undefined,
      resolveCursorCycleAtClientX: () => 2,
    };
    const owner = new CursorOverlayOwner();
    const disconnect = owner.connect(input);
    const listenerAdds = viewport.addEventListener.mock.calls.length + windowStub.addEventListener.mock.calls.length;
    const line = viewport.children[0]!.children[0]!;
    expect(line.dataset.cycle).toBe("2");

    owner.updatePresentation({ ...input, cursorA: 3 });
    expect(line.dataset.cycle).toBe("3");
    owner.updatePresentation({ ...input, cursorA: 3 });
    owner.updatePresentation({ ...input, cursorA: 2 });

    expect(line.dataset.cycle).toBe("2");
    expect(viewport.addEventListener.mock.calls.length + windowStub.addEventListener.mock.calls.length).toBe(listenerAdds);
    expect(observerInstances).toHaveLength(1);
    expect(observerInstances[0]!.observe).toHaveBeenCalledTimes(1);
    disconnect();
    expect(observerInstances[0]!.disconnect).toHaveBeenCalledOnce();
  });
});
