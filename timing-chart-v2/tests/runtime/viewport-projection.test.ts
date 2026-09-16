import { describe, expect, it, vi } from "vitest";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { RenderProjection } from "@timing-chart-v2/projection";
import { projectViewportWindow } from "../../apps/editor/src/runtime/viewport-projection.js";
import { buildViewportWindow } from "../../apps/editor/src/runtime/viewport-window.js";

describe("projectViewportWindow", () => {
  it("refreshes bounded wave windows without republishing the projection on horizontal-only scroll", () => {
    const viewport = { scrollTop: 0, clientHeight: 600 } as HTMLElement;
    const projection = { mountedSignalIds: ["sig_clock"] } as unknown as RenderProjection;
    const onProjection = vi.fn();
    const onHorizontalViewportChange = vi.fn();
    const project = vi.fn();

    projectViewportWindow({
      viewport,
      referenceClock: undefined,
      snapshot: {} as CanonicalSnapshot,
      previous: { window: buildViewportWindow(viewport), projection },
      projectionCoordinator: { project },
      collapsedGroupIds: [],
      onProjection,
      onHorizontalViewportChange,
    });

    expect(onHorizontalViewportChange).toHaveBeenCalledOnce();
    expect(onProjection).not.toHaveBeenCalled();
    expect(project).not.toHaveBeenCalled();
  });

  it("still projects vertical window changes", () => {
    const viewport = { scrollTop: 0, clientHeight: 600 } as HTMLElement;
    const previousProjection = { mountedSignalIds: ["sig_clock"] } as unknown as RenderProjection;
    const nextProjection = { mountedSignalIds: ["sig_clock", "sig_data"] } as unknown as RenderProjection;
    const onProjection = vi.fn();
    const onHorizontalViewportChange = vi.fn();
    const project = vi.fn(() => nextProjection);
    viewport.scrollTop = 1_000;

    projectViewportWindow({
      viewport,
      referenceClock: undefined,
      snapshot: {} as CanonicalSnapshot,
      previous: { window: buildViewportWindow({ scrollTop: 0, clientHeight: 600 } as HTMLElement), projection: previousProjection },
      projectionCoordinator: { project },
      collapsedGroupIds: [],
      onProjection,
      onHorizontalViewportChange,
    });

    expect(project).toHaveBeenCalledOnce();
    expect(onProjection).toHaveBeenCalledWith(nextProjection, expect.objectContaining({ viewportStartY: 966 }), true);
    expect(onHorizontalViewportChange).not.toHaveBeenCalled();
  });
});
