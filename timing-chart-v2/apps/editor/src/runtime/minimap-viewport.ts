export interface MiniMapViewportMetrics {
  readonly top: number;
  readonly ratio: number;
  readonly left: number;
  readonly width: number;
}

export function calculateMiniMapViewportMetrics(input: { readonly scrollTop: number; readonly scrollHeight: number; readonly clientHeight: number; readonly scrollLeft: number; readonly scrollWidth: number; readonly clientWidth: number }): MiniMapViewportMetrics {
  const scrollable = Math.max(1, input.scrollHeight);
  const maxScrollTop = Math.max(1, scrollable - input.clientHeight);
  const ratio = Math.min(1, input.clientHeight / scrollable);
  const horizontalScrollable = Math.max(1, input.scrollWidth);
  const maxScrollLeft = Math.max(1, horizontalScrollable - input.clientWidth);
  const width = Math.min(1, input.clientWidth / horizontalScrollable);
  return { top: Math.min(1 - ratio, input.scrollTop / maxScrollTop), ratio, left: Math.min(1 - width, input.scrollLeft / maxScrollLeft), width };
}
