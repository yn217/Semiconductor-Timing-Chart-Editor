import { describe, expect, it, vi } from "vitest";
import type { WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { releaseWaveOwnerForCacheEviction } from "@timing-chart-v2/renderer";

describe("wave owner cache eviction", () => {
  it("retains a reusable bounded artifact instead of disposing it", () => {
    const retainWaveArtifact = vi.fn();
    const disposeWave = vi.fn();
    const provider: WaveformSurfaceProvider = {
      mountWave: async () => ({ waveDromRenders: 0, localGeometryBuilds: 0 }),
      retainWaveArtifact,
      disposeWave,
    };

    releaseWaveOwnerForCacheEviction(provider, "sig_evicted" as never);

    expect(retainWaveArtifact).toHaveBeenCalledExactlyOnceWith("sig_evicted");
    expect(disposeWave).not.toHaveBeenCalled();
  });

  it("disposes normally when a provider has no reusable-artifact hook", () => {
    const disposeWave = vi.fn();
    const provider: WaveformSurfaceProvider = {
      mountWave: async () => ({ waveDromRenders: 0, localGeometryBuilds: 0 }),
      disposeWave,
    };

    releaseWaveOwnerForCacheEviction(provider, "sig_evicted" as never);

    expect(disposeWave).toHaveBeenCalledExactlyOnceWith("sig_evicted");
  });
});
