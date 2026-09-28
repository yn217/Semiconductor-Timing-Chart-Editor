import { describe, expect, it } from "vitest";
import type { SignalId } from "@timing-chart-v2/schema";
import { buildViewportWindow } from "../../apps/editor/src/runtime/viewport-window.js";
import { mountInitialTimelineProjection, projectionForInitialWaveMount, projectViewportWindow } from "../../apps/editor/src/runtime/viewport-projection.js";
import { pinnedSignalIdsForEpoch, signalPinStateForEpoch } from "../../apps/editor/src/workspace/signal-pin-state.js";

describe("Signal pin viewport ownership", () => {
  it("retains the reference clock and multiple user pins by stable ID", () => {
    const window = buildViewportWindow({ scrollTop: 100, clientHeight: 200 }, "clock-id" as SignalId, ["signal-a", "signal-b", "clock-id"] as SignalId[]);
    expect(window.pinnedRowIds).toEqual(["clock-id", "signal-a", "signal-b"]);
    expect(window.stickyRowIds).toEqual(["signal-a", "signal-b", "clock-id"]);
  });

  it("does not carry pins across document replacement epochs", () => {
    const state = signalPinStateForEpoch(4, ["signal-a", "signal-b", "signal-a"]);
    expect(state.ids).toEqual(["signal-a", "signal-b"]);
    expect(pinnedSignalIdsForEpoch(state, 4)).toEqual(["signal-a", "signal-b"]);
    expect(pinnedSignalIdsForEpoch(state, 5)).toEqual([]);
  });

  it("reprojects when stable pin IDs change without vertical scrolling", () => {
    const signalA = "signal-a" as SignalId;
    const viewport = { scrollTop: 0, clientHeight: 600 } as HTMLElement;
    const previousWindow = buildViewportWindow(viewport, undefined, []);
    const previousProjection = { mountedSignalIds: [signalA] } as never;
    let receivedWindow: ReturnType<typeof buildViewportWindow> | undefined;
    let projected = 0;

    projectViewportWindow({
      viewport,
      referenceClock: undefined,
      stickyRowIds: [signalA],
      snapshot: {} as never,
      previous: { window: previousWindow, projection: previousProjection },
      projectionCoordinator: { project: (request) => { projected += 1; receivedWindow = request.viewport; return previousProjection; } },
      collapsedGroupIds: [],
      onProjection: (_projection, window) => { receivedWindow = window; },
    });

    expect(projected).toBe(1);
    expect(receivedWindow?.stickyRowIds).toEqual([signalA]);
    expect(receivedWindow?.pinnedRowIds).toEqual([signalA]);
  });

  it("queues only the reference waveform during a large-document bootstrap, retaining the full projection", () => {
    const clock = "clock-id" as SignalId;
    const data = "signal-a" as SignalId;
    const projection = { mountedSignalIds: [clock, data], waveSignalIds: [clock, data] } as never;
    let updateArgument: { mountedSignalIds: readonly SignalId[] } | undefined;
    const result = mountInitialTimelineProjection({
      coordinator: { mount: () => undefined },
      renderer: { update: (value) => { updateArgument = value; } },
      host: {} as HTMLElement,
      viewport: { scrollTop: 0, clientHeight: 600 } as HTMLElement,
      referenceClock: clock,
      projectionCoordinator: { project: () => projection },
      snapshot: {} as never,
      collapsedGroupIds: [],
      initialWaveSignalIds: [clock],
    });

    expect(updateArgument?.mountedSignalIds).toEqual([clock]);
    expect(result.projection.mountedSignalIds).toEqual([clock, data]);
  });

  it("keeps the full projection while limiting an Open bootstrap update to its mounted reference owner", () => {
    const clock = "clock-id" as SignalId;
    const data = "signal-a" as SignalId;
    const projection = { mountedSignalIds: [clock, data], waveSignalIds: [clock, data] } as never;
    const firstUpdate = projectionForInitialWaveMount(projection, [clock]);

    expect(firstUpdate.mountedSignalIds).toEqual([clock]);
    expect(firstUpdate.waveSignalIds).toEqual([clock, data]);
    expect(projection.mountedSignalIds).toEqual([clock, data]);
    expect(projectionForInitialWaveMount(projection, ["not-mounted" as SignalId])).toBe(projection);
    expect(projectionForInitialWaveMount(projection, undefined)).toBe(projection);
  });
});
