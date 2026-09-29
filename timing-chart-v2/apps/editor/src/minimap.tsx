import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { CanonicalDocument, Signal, Transaction } from "@timing-chart-v2/schema";
import { buildMiniMapOverview, buildMiniMapTransactionOverview, updateMiniMapOverview, updateMiniMapTransactionOverview } from "@timing-chart-v2/projection";
import { calculateMiniMapViewportMetrics } from "./runtime/minimap-viewport.js";
import { timelineScrollOwner } from "./runtime/timeline-scroll-owner.js";
import { MiniMapOverviewRows, MiniMapTransactionOverviewRows } from "./minimap-overview-rows.js";

type MiniMapSource = Pick<CanonicalDocument, "signalGroups" | "signals" | "timeline">;
type MiniMapOverview = ReturnType<typeof buildMiniMapOverview>;
type MiniMapOverviewCache = Readonly<{
  signalGroups: MiniMapSource["signalGroups"];
  signalCollection: MiniMapSource["signals"];
  cycleCount: number;
  overview: MiniMapOverview;
}>;
type TransactionOverviewCache = Readonly<{ transactions: CanonicalDocument["transactions"]; groups: CanonicalDocument["transactionGroups"]; cycleCount: number; overview: ReturnType<typeof buildMiniMapTransactionOverview> }>;

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


export function MiniMap({ document, viewport, mode = "signal", signalHint, transactionHint }: { readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly mode?: "signal" | "transaction"; readonly signalHint?: Signal; readonly transactionHint?: Transaction }) {
  const [metrics, setMetrics] = useState({ top: 0, ratio: 1, left: 0, width: 1 });
  const [overviewState, setOverviewState] = useState<Readonly<{
    document: Readonly<CanonicalDocument>;
    mode: "signal" | "transaction";
    overview?: MiniMapOverview;
    transactionOverview?: ReturnType<typeof buildMiniMapTransactionOverview>;
  }>>();
  const dragging = useRef(false);
  const overviewBuilds = useRef(0);
  const transactionOverviewBuilds = useRef(0);
  const transactionOverviewFullBuilds = useRef(0);
  const transactionOverviewIncrementalUpdates = useRef(0);
  const minimapRowsRebuilt = useRef(0);
  const minimapValueChangesVisited = useRef(0);
  const transactionLaneBucketsRebuilt = useRef(0);
  const transactionRowsVisited = useRef(0);
  const minimapUpdateDurationMs = useRef(0);
  const overviewCache = useRef<MiniMapOverviewCache | undefined>(undefined);
  const transactionOverviewCache = useRef<TransactionOverviewCache | undefined>(undefined);
  useEffect(() => {
    let active = true;
    let pollFrame = 0;
    let scheduledBuild: number | undefined;
    let scheduledBuildKind: "idle" | "timer" | undefined;
    const buildOverview = () => {
      if (!active) return;
      const startedAt = globalThis.performance.now();
      let overview: MiniMapOverview | undefined;
      let transactionOverview: ReturnType<typeof buildMiniMapTransactionOverview> | undefined;
      if (mode === "signal") {
        const cycleCount = Math.max(1, document.timeline.cycleCount);
        const cached = overviewCache.current;
        if (cached && cached.signalGroups === document.signalGroups && cached.cycleCount === cycleCount && cached.signalCollection === document.signals) {
          overview = cached.overview;
        } else {
          overview = cached
            ? updateMiniMapOverview(cached.overview, cached.signalCollection, cached.signalGroups, document, signalHint ? [signalHint] : undefined)
            : buildMiniMapOverview(document);
          if (overview !== cached?.overview) {
            overviewBuilds.current += 1;
            minimapRowsRebuilt.current += overview.rowsRebuilt;
            minimapValueChangesVisited.current += overview.valueChangesVisited;
          }
          overviewCache.current = { signalGroups: document.signalGroups, signalCollection: document.signals, cycleCount, overview };
        }
      } else {
        // Keep the Transaction overview's sorted/bucketed model alive across
        // unrelated Canonical replacements, but never build it in React render.
        const cached = transactionOverviewCache.current;
        const cycleCount = Math.max(1, document.timeline.cycleCount);
        if (cached?.transactions === document.transactions && cached.groups === document.transactionGroups && cached.cycleCount === cycleCount) transactionOverview = cached.overview;
        else {
          transactionOverview = cached ? updateMiniMapTransactionOverview(cached.overview, cached.transactions, cached.groups, document, transactionHint ? [transactionHint] : undefined) : buildMiniMapTransactionOverview(document);
          if (!cached) {
            transactionOverviewFullBuilds.current += 1;
            transactionOverviewBuilds.current += 1;
            transactionRowsVisited.current += document.transactions.length;
            transactionLaneBucketsRebuilt.current += transactionOverview.laneBucketsRebuilt;
          } else {
            transactionRowsVisited.current += transactionHint ? 1 : document.transactions.length;
            if (transactionOverview !== cached.overview) {
              if (transactionOverview.updateKind === "incremental") transactionOverviewIncrementalUpdates.current += 1;
              else transactionOverviewFullBuilds.current += 1;
              transactionOverviewBuilds.current += 1;
              transactionLaneBucketsRebuilt.current += transactionOverview.laneBucketsRebuilt;
            }
          }
          transactionOverviewCache.current = { transactions: document.transactions, groups: document.transactionGroups, cycleCount, overview: transactionOverview };
        }
      }
      minimapUpdateDurationMs.current += Math.max(0, globalThis.performance.now() - startedAt);
      setOverviewState({ document, mode, ...(overview ? { overview } : {}), ...(transactionOverview ? { transactionOverview } : {}) });
    };
    const scheduleOverviewBuild = () => {
      if (typeof globalThis.requestIdleCallback === "function") {
        scheduledBuildKind = "idle";
        scheduledBuild = globalThis.requestIdleCallback(buildOverview, { timeout: 1000 });
      } else {
        scheduledBuildKind = "timer";
        scheduledBuild = globalThis.setTimeout(buildOverview, 0);
      }
    };

    const currentViewport = viewport.current;
    const readyHost = currentViewport?.closest<HTMLElement>(".cycle-panel")?.querySelector<HTMLElement>("[data-testid='cycle-surface']");
    if (!readyHost || readyHost.dataset.cycleViewReady === "true") scheduleOverviewBuild();
    else {
      // Wait for the surface ready flag with a bounded frame poll (no DOM observers for render synchronization).
      let frames = 0;
      const waitForReady = () => {
        pollFrame = 0;
        if (!active) return;
        if (readyHost.dataset.cycleViewReady === "true" || (frames += 1) > 600) { scheduleOverviewBuild(); return; }
        pollFrame = globalThis.requestAnimationFrame(waitForReady);
      };
      pollFrame = globalThis.requestAnimationFrame(waitForReady);
    }
    return () => {
      active = false;
      if (pollFrame !== 0) globalThis.cancelAnimationFrame(pollFrame);
      if (scheduledBuild === undefined) return;
      if (scheduledBuildKind === "idle" && typeof globalThis.cancelIdleCallback === "function") globalThis.cancelIdleCallback(scheduledBuild);
      else if (scheduledBuildKind === "timer") globalThis.clearTimeout(scheduledBuild);
    };
  }, [document, mode, viewport]);
  const currentOverview = overviewState?.document === document && overviewState.mode === mode ? overviewState : undefined;
  const overview = currentOverview?.overview;
  const transactionOverview = currentOverview?.transactionOverview;
  // #625: vertical metrics come from the shared viewport, horizontal metrics from the Timeline scroll owner (Cycle).
  const sync = () => { const element = viewport.current; if (!element) return; const owner = timelineScrollOwner(element); setMetrics(calculateMiniMapViewportMetrics({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollLeft: owner.scrollLeft, scrollWidth: owner.scrollWidth, clientWidth: owner.clientWidth })); };
  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    sync();
    element.addEventListener("scroll", sync, { passive: true, capture: true });
    element.addEventListener("timeline-viewport-resize", sync);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(sync);
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    return () => { element.removeEventListener("scroll", sync, true); element.removeEventListener("timeline-viewport-resize", sync); observer?.disconnect(); };
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
      const owner = timelineScrollOwner(element);
      if (event.key === "Home") { event.preventDefault(); owner.scrollTo({ left: 0 }); element.scrollTo({ top: 0 }); return; }
      if (event.key === "End") { event.preventDefault(); owner.scrollTo({ left: owner.scrollWidth }); element.scrollTo({ top: element.scrollHeight }); return; }
      const delta = keyboardScrollDelta(event.key, Math.min(owner.clientWidth, element.clientHeight));
      if (!delta) return;
      event.preventDefault();
      owner.scrollBy({ left: delta.x });
      element.scrollBy({ top: delta.y });
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
    const owner = timelineScrollOwner(element);
    owner.scrollLeft = horizontalRatio * Math.max(0, owner.scrollWidth - owner.clientWidth);
    sync();
  };
  const indicatorWidth = Math.min(1 - metrics.left, Math.max(0.04, metrics.width));
  const indicatorHeight = Math.min(1 - metrics.top, Math.max(0.04, metrics.ratio));
  const fullViewport = metrics.ratio >= 0.999 && metrics.width >= 0.999;
  return <div ref={documentRef} className="minimap" data-testid="minimap" data-minimap-mode={mode} data-time-policy="full-source-overview" data-transaction-overview-builds={String(transactionOverviewBuilds.current)} data-transaction-overview-full-builds={String(transactionOverviewFullBuilds.current)} data-transaction-overview-incremental-updates={String(transactionOverviewIncrementalUpdates.current)} data-transaction-rows-visited={String(transactionRowsVisited.current)} data-transaction-lane-buckets-rebuilt={String(transactionLaneBucketsRebuilt.current)} data-minimap-update-duration-ms={String(minimapUpdateDurationMs.current)} aria-label="MiniMap timeline navigator" aria-busy={!currentOverview} title="Click or drag to navigate the timeline" data-overview-builds={String(overviewBuilds.current)} data-overview-signal-lookups={String(overview?.signalLookups ?? 0)} data-overview-rows-rebuilt={String(minimapRowsRebuilt.current)} data-overview-value-changes-visited={String(minimapValueChangesVisited.current)} data-viewport-top={String(metrics.top)} data-viewport-ratio={String(metrics.ratio)} data-viewport-left={String(metrics.left)} data-viewport-width={String(metrics.width)} onPointerDown={(event) => { if (event.button !== 0) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); pan(event.clientX, event.clientY); }} onPointerMove={(event) => { if (dragging.current) pan(event.clientX, event.clientY); }} onPointerUp={(event) => { dragging.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragging.current = false; }}><div className="minimap-overview-frame"><div className="minimap-rows">{transactionOverview ? <MiniMapTransactionOverviewRows overview={transactionOverview} /> : overview ? <MiniMapOverviewRows overview={overview} /> : null}<div className="minimap-folds" aria-label="Collapsed time groups">{document.timeGroups.filter((group) => group.presentation?.collapsed).map((group) => <i key={group.id} data-testid={`minimap-fold-${group.id}`} title={`${group.name}: ${group.start}–${group.end}`} style={{ left: `${group.start / document.timeline.cycleCount * 100}%`, width: `${Math.max(0.5, (group.end - group.start) / document.timeline.cycleCount * 100)}%` }} />)}</div><i data-testid="minimap-viewport" data-viewport-full={String(fullViewport)} style={{ "--minimap-left": `${metrics.left * 100}%`, "--minimap-width": `${indicatorWidth * 100}%`, "--minimap-top": `${metrics.top * 100}%`, "--minimap-height": `${indicatorHeight * 100}%` } as CSSProperties} /></div></div></div>;
}
