export type ScrollOverlayRefreshOwner = Readonly<{ request: () => void; invalidate: () => void }>;

/** Coalesces stale scroll-overlay continuations without coupling them to the large surface controller. */
export function createScrollOverlayRefreshOwner(input: {
  readonly getDocumentEpoch: () => number;
  readonly isDocumentEpochCurrent: (epoch: number) => boolean;
  readonly isActive: () => boolean;
  readonly waitForRendererIdle: () => Promise<unknown>;
  readonly refresh: () => void;
}): ScrollOverlayRefreshOwner {
  let generation = 0;
  let pending = false;
  let latestRequestGeneration = 0;
  let latestRequestEpoch = 0;
  return {
    request: () => {
      latestRequestGeneration = ++generation;
      latestRequestEpoch = input.getDocumentEpoch();
      // Scroll projection can publish once per frame while a Wave batch is
      // still pending. Keep only the latest viewport request and share one
      // renderer-idle continuation instead of queuing stale waiters that will
      // all wake and discard themselves when that batch completes.
      if (pending) return;
      pending = true;
      void input.waitForRendererIdle().then(() => {
        pending = false;
        if (latestRequestGeneration !== generation || !input.isActive() || !input.isDocumentEpochCurrent(latestRequestEpoch)) return;
        input.refresh();
      }, () => {
        pending = false;
      });
    },
    invalidate: () => { generation += 1; },
  };
}
