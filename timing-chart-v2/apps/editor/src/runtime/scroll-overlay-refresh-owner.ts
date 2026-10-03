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
  return {
    request: () => {
      const requestGeneration = ++generation;
      const requestEpoch = input.getDocumentEpoch();
      void input.waitForRendererIdle().then(() => {
        if (requestGeneration !== generation || !input.isActive() || !input.isDocumentEpochCurrent(requestEpoch)) return;
        input.refresh();
      });
    },
    invalidate: () => { generation += 1; },
  };
}
