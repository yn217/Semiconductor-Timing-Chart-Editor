function nextBrowserFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => resolve());
    else globalThis.setTimeout(resolve, 0);
  });
}

export function scheduleInitialTimelineRefresh(renderer: { whenIdle: () => Promise<unknown> }, host: HTMLElement, refresh: { readonly ruler: () => void; readonly range: () => void; readonly playhead: () => void; readonly grid: () => void; readonly zoom: () => void; readonly overlays: () => void; readonly collectErrors: () => void; readonly publish: () => void; readonly transactionPresentation?: () => void; }, lifecycle: { readonly isCurrent: () => boolean } = { isCurrent: () => true }): void {
  void renderer.whenIdle().then(() => {
    if (!host.isConnected || !lifecycle.isCurrent()) return;
    return nextBrowserFrame().then(() => {
      if (!host.isConnected || !lifecycle.isCurrent()) return;
      refresh.ruler();
      return nextBrowserFrame();
    }).then(() => {
      if (!host.isConnected || !lifecycle.isCurrent()) return;
      refresh.ruler();
      refresh.range();
      refresh.playhead();
      refresh.grid();
      refresh.zoom();
      refresh.overlays();
      refresh.transactionPresentation?.();
      refresh.collectErrors();
      refresh.publish();
      host.dataset.cycleViewReady = "true";
    });
  });
}
