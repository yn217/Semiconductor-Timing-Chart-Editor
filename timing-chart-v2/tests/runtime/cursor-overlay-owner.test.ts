import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CursorOverlayOwner, type CursorOverlayPresentation } from "../../apps/editor/src/runtime/cursor-overlay-owner.js";

// Minimal fake DOM that counts the operations the #175 drag-latency guard cares
// about: element creations, selector lookups, layout reads, and whether a
// layout read happens after a style write within the same refresh (thrash).
type Log = { creations: number; queries: number; rects: number; writes: number; readAfterWrite: number };

class FakeElement {
  children: FakeElement[] = [];
  parentNode: FakeElement | null = null;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  hidden = false;
  className = "";
  clientHeight = 300;
  rect = { left: 0, top: 0, bottom: 300, right: 800 };
  style: Record<string, string>;
  constructor(readonly log: Log, readonly ownerDocument: { createElement(tag: string): FakeElement }) {
    this.style = new Proxy({} as Record<string, string>, { set: (target, key, value) => { log.writes += 1; target[key as string] = value; return true; } });
  }
  get parentElement(): FakeElement | null { return this.parentNode; }
  get isConnected(): boolean { let node: FakeElement | null = this; while (node.parentNode) node = node.parentNode; return node.dataset.root === "true"; }
  append(child: FakeElement): void { child.remove(); child.parentNode = this; this.children.push(child); }
  remove(): void { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter((item) => item !== this); this.parentNode = null; }
  setAttribute(name: string, value: string): void { this.attributes[name] = value; }
  addEventListener(): void {}
  removeEventListener(): void {}
  #matches(selector: string): boolean {
    if (selector.startsWith(".")) return this.className === selector.slice(1);
    const match = /^\[data-(role|cursor)='([^']+)'\]$/.exec(selector);
    return match ? this.dataset[match[1]!] === match[2] : false;
  }
  #walk(selector: string): FakeElement | null {
    for (const child of this.children) { if (child.#matches(selector)) return child; const nested = child.#walk(selector); if (nested) return nested; }
    return null;
  }
  querySelector(selector: string): FakeElement | null { this.log.queries += 1; return this.#walk(selector); }
  closest(selector: string): FakeElement | null { this.log.queries += 1; let node: FakeElement | null = this; while (node && !node.#matches(selector)) node = node.parentNode; return node; }
  getBoundingClientRect() { this.log.rects += 1; if (this.log.writes > 0) this.log.readAfterWrite += 1; return this.rect; }
}

function setup() {
  const log: Log = { creations: 0, queries: 0, rects: 0, writes: 0, readAfterWrite: 0 };
  const doc = { createElement: (): FakeElement => { log.creations += 1; return new FakeElement(log, doc); } };
  const make = (className = "") => { const element = new FakeElement(log, doc); element.className = className; return element; };
  const root = make(); root.dataset.root = "true";
  const panes = [0, 1].map(() => {
    const container = make(); const panel = make("cycle-panel"); const splitter = make("bottom-resize-track");
    splitter.rect = { left: 0, top: 200, bottom: 206, right: 800 };
    const viewport = make(); const ruler = make();
    root.append(container); container.append(panel); container.append(splitter); panel.append(viewport); panel.append(ruler);
    return { viewport, ruler };
  });
  let cursorA = 10; let cursorB: number | undefined = 20;
  const resolveX = (cycle: number, viewport: HTMLDivElement, ruler: HTMLDivElement) => {
    const r = ruler.getBoundingClientRect(); const v = viewport.getBoundingClientRect();
    return r.left - v.left + cycle * 4;
  };
  const presentation = (): CursorOverlayPresentation => ({ cursorA, cursorB, resolveCursorCycleAtClientX: undefined, resolveCursorViewportXForCycle: resolveX, onSetCursorAtCycle: undefined });
  const owner = new CursorOverlayOwner();
  const el = (item: FakeElement) => item as unknown as HTMLDivElement;
  owner.connect({ viewport: el(panes[0]!.viewport), ruler: el(panes[0]!.ruler), viewportLower: el(panes[1]!.viewport), rulerLower: el(panes[1]!.ruler), getPresentation: presentation });
  return { log, panes, owner, setCursor: (a: number, b?: number) => { cursorA = a; cursorB = b; } };
}

describe("CursorOverlayOwner refresh cost (#175)", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps per-frame drag refresh to cached elements, bounded reads, and no read-after-write", () => {
    const { log, panes, owner, setCursor } = setup();
    expect(log.creations).toBe(6); // overlay + line A + line B per pane
    for (const { viewport } of panes) {
      const overlay = viewport.children.find((child) => child.dataset.role === "cursor-overlay")!;
      expect(overlay.children.map((line) => line.dataset.cursor)).toEqual(["a", "b"]);
      const a = overlay.children[0]!;
      expect(a.style.left).toBe("40px");
      expect(a.style.height).toBe("250px"); // splitter at 200 inside viewport -> 200, clamped to 250
      expect(a.style.pointerEvents).toBe("auto");
      expect(overlay.style.pointerEvents).toBe("none");
    }
    const queriesAfterFirst = log.queries;
    for (let frame = 1; frame <= 60; frame += 1) {
      setCursor(10 + frame, 20);
      log.rects = 0; log.writes = 0; log.readAfterWrite = 0;
      owner.refresh();
      expect(log.readAfterWrite).toBe(0);
      expect(log.rects).toBeLessThanOrEqual(12); // 2 panes x (viewport + splitter + 2 cursors x 2 resolver reads)
      expect(owner.metrics().lastRefreshOwnLayoutReads).toBe(4);
    }
    expect(log.creations).toBe(6);
    expect(log.queries).toBe(queriesAfterFirst);
    expect(owner.metrics().elementCreations).toBe(6);
    expect(panes[0]!.viewport.children[0]!.children[0]!.style.left).toBe(`${(10 + 60) * 4}px`);
  });

  it("removes an unset cursor and reuses the cached line when it returns", () => {
    const { log, panes, owner, setCursor } = setup();
    setCursor(5, undefined);
    owner.refresh();
    const overlay = panes[1]!.viewport.children[0]!;
    expect(overlay.children.map((line) => line.dataset.cursor)).toEqual(["a"]);
    setCursor(5, 7);
    owner.refresh();
    expect(overlay.children.map((line) => line.dataset.cursor)).toEqual(["a", "b"]);
    expect(log.creations).toBe(6);
  });
});
