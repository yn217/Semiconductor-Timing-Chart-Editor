import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { CanonicalDocument, Signal } from "@timing-chart-v2/schema";
import { buildMiniMapOverview, buildMiniMapTransactionOverview } from "@timing-chart-v2/projection";
import { calculateMiniMapViewportMetrics } from "./runtime/minimap-viewport.js";
import { MiniMapOverviewRows, MiniMapTransactionOverviewRows } from "./minimap-overview-rows.js";

type MiniMapSource = Pick<CanonicalDocument, "signalGroups" | "signals" | "timeline">;
type MiniMapOverview = ReturnType<typeof buildMiniMapOverview>;
type SignalOverviewFingerprint = Readonly<{
  id: Signal["id"];
  type: Signal["type"];
  values: readonly unknown[] | undefined;
}>;
type MiniMapOverviewCache = Readonly<{
  signalGroups: MiniMapSource["signalGroups"];
  cycleCount: number;
  signals: readonly SignalOverviewFingerprint[];
  overview: MiniMapOverview;
}>;

function overviewValues(signal: Signal): readonly unknown[] | undefined {
  return signal.type === "clock" || signal.type === "commentRow" ? undefined : signal.values;
}

function fingerprintSignals(signals: readonly Signal[]): readonly SignalOverviewFingerprint[] {
  return signals.map((signal) => ({ id: signal.id, type: signal.type, values: overviewValues(signal) }));
}

function canReuseOverview(cache: MiniMapOverviewCache, document: MiniMapSource, cycleCount: number): boolean {
  if (cache.signalGroups !== document.signalGroups || cache.cycleCount !== cycleCount || cache.signals.length !== document.signals.length) return false;
  return document.signals.every((signal, index) => {
    const previous = cache.signals[index];
    return previous?.id === signal.id && previous.type === signal.type && previous.values === overviewValues(signal);
  });
}

export function pointerRatio(client: number, start: number, size: number): number {
  if (!Number.isFinite(size) || size <= 0) return 0;
  return Math.max(0, Math.min(1, (client - start) / size));
}

export function keyboardScrollDelta(key: string, viewportSize: number): { readonly x: number; readonly y: number } | undefined {
  const step = Math.max(1, viewportSize * 0.8);
  if (key === "ArrowLeft") return { x: -step, y: 0 };
  if (key === "ArrowRight") return { x: step, y: 0 };
  if (key === "ArrowUp") return { x: 0, y: -step };
  if (key === "ArrowDown") return { x: 0, y: step };
  return undefined;
}


export function MiniMap({ document, viewport, mode = "signal" }: { readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly mode?: "signal" | "transaction" }) {
  const [metrics, setMetrics] = useState({ top: 0, ratio: 1, left: 0, width: 1 });
  const dragging = useRef(false);
  const overviewBuilds = useRef(0);
  const overviewCache = useRef<MiniMapOverviewCache | undefined>(undefined);
  const overview = useMemo(() => {
    const cycleCount = Math.max(1, document.timeline.cycleCount);
    const cached = overviewCache.current;
    if (cached && canReuseOverview(cached, document, cycleCount)) return cached.overview;
    const next = buildMiniMapOverview(document);
    overviewBuilds.current += 1;
    overviewCache.current = { signalGroups: document.signalGroups, cycleCount, signals: fingerprintSignals(document.signals), overview: next };
    return next;
  }, [document]);
  // #429/#397 Transaction Mode Product Closure P1: a genuinely separate,
  // additive overview -- built fresh each render (no cache needed; the
  // Transaction set/color churn this derives from is already exactly what
  // gates every other Transaction Mode re-render) rather than threaded
  // through the Signal overview's own cache/fingerprint machinery above,
  // which stays byte-for-byte unchanged for the (still default) Signal
  // path this preserves.
  const transactionOverview = useMemo(() => (mode === "transaction" ? buildMiniMapTransactionOverview(document) : undefined), [mode, document]);
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
  // The viewport ref is stable across Canonical commits. Re-registering the
  // scroll listener and ResizeObserver whenever an Inspector property changes
  // adds avoidable main-thread work to the commit path; viewport geometry does
  // not depend on the document object identity.
  }, [viewport]);
  const documentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const minimap = documentRef.current;
    const element = viewport.current;
    if (!minimap || !element) return undefined;
    minimap.tabIndex = 0;
    minimap.setAttribute("role", "application");
    minimap.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight Home End");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Home") { event.preventDefault(); element.scrollTo({ left: 0, top: 0 }); return; }
      if (event.key === "End") { event.preventDefault(); element.scrollTo({ left: element.scrollWidth, top: element.scrollHeight }); return; }
      const delta = keyboardScrollDelta(event.key, Math.min(element.clientWidth, element.clientHeight));
      if (!delta) return;
      event.preventDefault();
      element.scrollBy({ left: delta.x, top: delta.y });
    };
    minimap.addEventListener("keydown", onKeyDown);
    return () => minimap.removeEventListener("keydown", onKeyDown);
  }, [viewport]);
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
  return <div ref={documentRef} className="minimap" data-testid="minimap" data-minimap-mode={mode} aria-label="MiniMap" data-overview-builds={String(overviewBuilds.current)} data-overview-signal-lookups={String(overview.signalLookups)} data-viewport-top={String(metrics.top)} data-viewport-ratio={String(metrics.ratio)} data-viewport-left={String(metrics.left)} data-viewport-width={String(metrics.width)} onPointerDown={(event) => { if (event.button !== 0) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); pan(event.clientX, event.clientY); }} onPointerMove={(event) => { if (dragging.current) pan(event.clientX, event.clientY); }} onPointerUp={(event) => { dragging.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragging.current = false; }}><div className="minimap-overview-frame"><div className="minimap-rows">{transactionOverview ? <MiniMapTransactionOverviewRows overview={transactionOverview} /> : <MiniMapOverviewRows overview={overview} />}<i data-testid="minimap-viewport" data-viewport-full={String(fullViewport)} style={{ "--minimap-left": `${metrics.left * 100}%`, "--minimap-width": `${indicatorWidth * 100}%`, "--minimap-top": `${metrics.top * 100}%`, "--minimap-height": `${indicatorHeight * 100}%` } as CSSProperties} /></div></div></div>;
}
