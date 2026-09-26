import { describe, expect, it, vi } from "vitest";
import { PeerMenuSurfaceCoordinator } from "../../apps/editor/src/runtime/peer-menu-surface.js";

describe("PeerMenuSurfaceCoordinator", () => {
  it("dismisses the previous peer and keeps the newly activated owner", () => {
    const coordinator = new PeerMenuSurfaceCoordinator();
    const contextMenu = {};
    const treeMenu = {};
    const dismissContext = vi.fn();

    coordinator.activate(contextMenu, dismissContext);
    coordinator.activate(treeMenu, vi.fn());

    expect(dismissContext).toHaveBeenCalledOnce();
    expect(coordinator.activeOwner()).toBe(treeMenu);
  });

  it("does not let a closing old menu release the newer menu", () => {
    const coordinator = new PeerMenuSurfaceCoordinator();
    const oldMenu = {};
    const currentMenu = {};

    coordinator.activate(oldMenu, vi.fn());
    coordinator.activate(currentMenu, vi.fn());
    coordinator.release(oldMenu);

    expect(coordinator.activeOwner()).toBe(currentMenu);
  });

  it("does not dismiss itself when the same surface refreshes its callback", () => {
    const coordinator = new PeerMenuSurfaceCoordinator();
    const owner = {};
    const dismiss = vi.fn();

    coordinator.activate(owner, dismiss);
    coordinator.activate(owner, dismiss);

    expect(dismiss).not.toHaveBeenCalled();
    expect(coordinator.activeOwner()).toBe(owner);
  });
});
