import { describe, expect, it, vi } from "vitest";
import { createScrollOverlayRefreshOwner } from "../../apps/editor/src/runtime/scroll-overlay-refresh-owner.js";

describe("scroll overlay refresh owner", () => {
  it("coalesces burst requests into one idle waiter and refreshes the latest viewport", async () => {
    let epoch = 4;
    const waits: Array<() => void> = [];
    const refresh = vi.fn();
    const waitForRendererIdle = vi.fn(() => new Promise<void>((resolve) => waits.push(resolve)));
    const owner = createScrollOverlayRefreshOwner({
      getDocumentEpoch: () => epoch,
      isDocumentEpochCurrent: (requested) => requested === epoch,
      isActive: () => true,
      waitForRendererIdle,
      refresh,
    });

    owner.request();
    owner.request();
    owner.request();
    expect(waitForRendererIdle).toHaveBeenCalledOnce();
    waits[0]!();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledOnce();

    owner.request();
    expect(waitForRendererIdle).toHaveBeenCalledTimes(2);
    epoch += 1;
    waits[1]!();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refreshes a request made after invalidation while the prior idle wait is pending", async () => {
    let resolveIdle!: () => void;
    const refresh = vi.fn();
    const waitForRendererIdle = vi.fn(() => new Promise<void>((resolve) => { resolveIdle = resolve; }));
    const owner = createScrollOverlayRefreshOwner({ getDocumentEpoch: () => 1, isDocumentEpochCurrent: () => true, isActive: () => true, waitForRendererIdle, refresh });
    owner.request();
    owner.invalidate();
    owner.request();
    expect(waitForRendererIdle).toHaveBeenCalledOnce();
    resolveIdle();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("invalidates pending work on owner teardown", async () => {
    let resolveIdle!: () => void;
    const refresh = vi.fn();
    const owner = createScrollOverlayRefreshOwner({ getDocumentEpoch: () => 1, isDocumentEpochCurrent: () => true, isActive: () => true, waitForRendererIdle: () => new Promise<void>((resolve) => { resolveIdle = resolve; }), refresh });
    owner.request();
    owner.invalidate();
    resolveIdle();
    await Promise.resolve();
    expect(refresh).not.toHaveBeenCalled();
  });
});
