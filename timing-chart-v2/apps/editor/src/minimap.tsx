import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { CanonicalDocument } from "@timing-chart-v2/schema";
import { buildMiniMapOverview } from "@timing-chart-v2/projection";
import { calculateMiniMapViewportMetrics } from "./runtime/minimap-viewport.js";
import { MiniMapOverviewRows } from "./minimap-overview-rows.js";

export function pointerRatio(client: number, start: number, size: number): number {
  if (!Number.isFinite(size) || size <= 0) return 0;
  return Math.max(0, Math.min(1, (client - start) / size));
}

export function MiniMap({ document, viewport }: { readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null> }) {
  const [metrics, setMetrics] = useState({ top: 0, ratio: 1, left: 0, width: 1 });
  const dragging = useRef(false);
  const overviewBuilds = useRef(0);
  const overview = useMemo(() => { overviewBuilds.current += 1; return buildMiniMapOverview(document); }, [document]);
  const sync = () => { const element = viewport.current; if (element) setMetrics(calculateMiniMapViewportMetrics(element)); };
  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    sync();
    element.addEventListener("scroll", sync, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(sync);
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    return () => { element.removeEventListener("scroll", sync); observer?.disconnect(); };
  }, [document]);
  const documentRef = useRef<HTMLDivElement>(null);
  const pan = (clientX: number, clientY: number) => {
    const element = viewport.current;
    const minimap = documentRef.current;
    if (!element || !minimap) return;
    const bounds = minimap.getBoundingClientRect();
    const verticalRatio = pointerRatio(clientY, bounds.top, bounds.height);
    const horizontalRatio = pointerRatio(clientX, bounds.left, bounds.width);
    element.scrollTop = verticalRatio * Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollLeft = horizontalRatio * Math.max(0, element.scrollWidth - element.clientWidth);
    sync();
  };
  const indicatorWidth = Math.min(1 - metrics.left, Math.max(0.04, metrics.width));
  const indicatorHeight = Math.min(1 - metrics.top, Math.max(0.04, metrics.ratio));
  const fullViewport = metrics.ratio >= 0.999 && metrics.width >= 0.999;
  return <div ref={documentRef} className="minimap" data-testid="minimap" aria-label="MiniMap" data-overview-builds={String(overviewBuilds.current)} data-overview-signal-lookups={String(overview.signalLookups)} data-viewport-top={String(metrics.top)} data-viewport-ratio={String(metrics.ratio)} data-viewport-left={String(metrics.left)} data-viewport-width={String(metrics.width)} onPointerDown={(event) => { if (event.button !== 0) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); pan(event.clientX, event.clientY); }} onPointerMove={(event) => { if (dragging.current) pan(event.clientX, event.clientY); }} onPointerUp={(event) => { dragging.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragging.current = false; }}><div className="minimap-overview-frame"><div className="minimap-rows"><MiniMapOverviewRows overview={overview} /><i data-testid="minimap-viewport" data-viewport-full={String(fullViewport)} style={{ "--minimap-left": `${metrics.left * 100}%`, "--minimap-width": `${indicatorWidth * 100}%`, "--minimap-top": `${metrics.top * 100}%`, "--minimap-height": `${indicatorHeight * 100}%` } as CSSProperties} /></div></div></div>;
}
