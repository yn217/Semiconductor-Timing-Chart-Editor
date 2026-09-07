import { describe, expect, it, vi } from "vitest";
import { createFileActionController } from "../../apps/editor/src/application/file-action-controller.js";

function controller() {
  const lifecycle = { cancelPending: vi.fn(), discardPending: vi.fn(), savePendingAndContinue: vi.fn(() => true), requestNew: vi.fn() };
  const actions = createFileActionController({ documentLifecycle: lifecycle as never, pendingFileOriginRef: { current: null }, documentTitle: "" });
  return { lifecycle, actions };
}

describe("file action controller", () => {
  it("routes pending cancel and discard without owning document replacement", () => {
    const { lifecycle, actions } = controller();

    actions.cancelPendingFileAction();
    actions.continuePendingFileAction();

    expect(lifecycle.cancelPending).toHaveBeenCalledOnce();
    expect(lifecycle.discardPending).toHaveBeenCalledOnce();
  });

  it("passes the stable default filename to the lifecycle save continuation", () => {
    const { lifecycle, actions } = controller();

    actions.saveAndContinuePendingFileAction();

    expect(lifecycle.savePendingAndContinue).toHaveBeenCalledWith("timing-chart.tcd");
  });
});
