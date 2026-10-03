import { describe, expect, it, vi } from "vitest";
import { createScrollOverlayRefreshOwner } from "../../apps/editor/src/runtime/scroll-overlay-refresh-owner.js";

describe("scroll overlay refresh owner", () => {
  it("discards superseded and stale-document idle continuations", async () => {
    let epoch = 4;
    const waits: Array<() => void> = [];
    const refresh = vi.fn();
    const owner = createScrollOverlayRefreshOwner({
      getDocumentEpoch: () => epoch,
      isDocumentEpochCurrent: (requested) => requested === epoch,
      isActive: () => true,
      waitForRendererIdle: () => new Promise<void>((resolve) => waits.push(resolve)),
      refresh,
    });

    owner.request();
    owner.request();
    waits[0]!();
    await Promise.resolve();
    expect(refresh).not.toHaveBeenCalled();
    waits[1]!();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledOnce();

    owner.request();
    epoch += 1;
    waits[2]!();
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
