import { memo, useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { ChangeSet } from "@timing-chart-v2/commands";
import type { CanonicalDocument, SignalId } from "@timing-chart-v2/schema";
import { buildMiniMapOverview, buildMiniMapTransactionOverview, updateMiniMapOverview, updateMiniMapTransactionOverview } from "@timing-chart-v2/projection";
import { calculateMiniMapViewportMetrics } from "./runtime/minimap-viewport.js";
import { timelineScrollOwner } from "./runtime/timeline-scroll-owner.js";
import { effectiveScrollWidth } from "./runtime/timeline-horizontal-scrollbar-owner.js";
import { canRetainSignalMiniMapOverview, planSignalMiniMapOverviewUpdate } from "./runtime/minimap-overview-compatibility.js";
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


/** Collapsed TimeGroup markers depend only on the TimeGroups and cycle count;
 * memoized so scroll-driven viewport metric updates do not re-render O(TimeGroups). */
const MiniMapFoldMarkers = memo(function MiniMapFoldMarkers({ timeGroups, cycleCount }: { readonly timeGroups: CanonicalDocument["timeGroups"]; readonly cycleCount: number }) {
  return <div className="minimap-folds" aria-label="Collapsed time groups">{timeGroups.filter((group) => group.presentation?.collapsed).map((group) => <i key={group.id} data-testid={`minimap-fold-${group.id}`} title={`${group.name}: ${group.start}–${group.end}`} style={{ left: `${group.start / cycleCount * 100}%`, width: `${Math.max(0.5, (group.end - group.start) / cycleCount * 100)}%` }} />)}</div>;
});

export function MiniMap({ document, changeSet, viewport, mode = "signal" }: { readonly document: Readonly<CanonicalDocument>; readonly changeSet?: ChangeSet; readonly viewport: RefObject<HTMLDivElement | null>; readonly mode?: "signal" | "transaction" }) {
  const [metrics, setMetrics] = useState({ top: 0, ratio: 1, left: 0, width: 1 });
  const [overviewState, setOverviewState] = useState<Readonly<{
    document: Readonly<CanonicalDocument>;
    mode: "signal" | "transaction";
    overview?: MiniMapOverview;
    transactionOverview?: ReturnType<typeof buildMiniMapTransactionOverview>;
  }>>();
  const dragging = useRef(false);
  const overviewBuilds = useRef(0);
  const overviewReuseSignalComparisons = useRef(0);
  const transactionOverviewBuilds = useRef(0);
  const transactionOverviewFullBuilds = useRef(0);
  const transactionOverviewIncrementalUpdates = useRef(0);
  const overviewCache = useRef<MiniMapOverviewCache | undefined>(undefined);
  const transactionOverviewCache = useRef<TransactionOverviewCache | undefined>(undefined);
  useEffect(() => {
    let active = true;
    let pollFrame = 0;
    let scheduledIdleBuild: number | undefined;
    let scheduledTimerBuild: ReturnType<typeof globalThis.setTimeout> | undefined;
    const buildOverview = () => {
      if (!active) return;
      let overview: MiniMapOverview | undefined;
      let transactionOverview: ReturnType<typeof buildMiniMapTransactionOverview> | undefined;
      if (mode === "signal") {
        const cycleCount = Math.max(1, document.timeline.cycleCount);
        const cached = overviewCache.current;
        const updatePlan = planSignalMiniMapOverviewUpdate(cached, { signalGroups: document.signalGroups, signalCollection: document.signals, cycleCount }, changeSet);
        if (updatePlan.kind === "reuse" && cached) {
          overview = cached.overview;
        } else {
          overview = cached
            ? updateMiniMapOverview(cached.overview, document, updatePlan.kind === "incremental" ? updatePlan.changedSignalIds as readonly SignalId[] : undefined)
            : buildMiniMapOverview(document);
          overviewBuilds.current += 1;
          overviewCache.current = { signalGroups: document.signalGroups, signalCollection: document.signals, cycleCount, overview };
        }
      } else {
        const cached = transactionOverviewCache.current;
        const cycleCount = Math.max(1, document.timeline.cycleCount);
        if (cached?.transactions === document.transactions && cached.groups === document.transactionGroups && cached.cycleCount === cycleCount) transactionOverview = cached.overview;
        else {
          const incremental = cached !== undefined && cached.groups === document.transactionGroups && cached.cycleCount === cycleCount
            && changeSet !== undefined && changeSet.fullDocumentReplace !== true && changeSet.transactionGroupSemantics === undefined
            && changeSet.transactionSemantics !== undefined;
          transactionOverview = cached ? updateMiniMapTransactionOverview(cached.overview, cached.transactions, cached.groups, document, incremental ? changeSet.transactionSemantics : undefined) : buildMiniMapTransactionOverview(document);
          if (!cached) transactionOverviewFullBuilds.current += 1;
          else if (incremental) transactionOverviewIncrementalUpdates.current += 1;
          else transactionOverviewFullBuilds.current += 1;
          if (transactionOverview !== cached?.overview) transactionOverviewBuilds.current += 1;
          transactionOverviewCache.current = { transactions: document.transactions, groups: document.transactionGroups, cycleCount, overview: transactionOverview };
        }
      }
      setOverviewState({ document, mode, ...(overview ? { overview } : {}), ...(transactionOverview ? { transactionOverview } : {}) });
    };
    const scheduleOverviewBuild = () => {
      if (typeof globalThis.requestIdleCallback === "function") {
        scheduledIdleBuild = globalThis.requestIdleCallback(buildOverview, { timeout: 1000 });
      } else {
        scheduledTimerBuild = globalThis.setTimeout(buildOverview, 0);
      }
    };

    const currentViewport = viewport.current;
    const readyHost = currentViewport?.closest<HTMLElement>(".cycle-panel")?.querySelector<HTMLElement>("[data-testid='cycle-surface']");
    // Transaction overviews depend only on Canonical Transactions/Groups;
    // waiting for the Cycle WaveDrom surface can stall them indefinitely
    // while Transaction mode intentionally leaves that renderer unready.
    if (mode === "transaction" || !readyHost || readyHost.dataset.cycleViewReady === "true") scheduleOverviewBuild();
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
      if (scheduledIdleBuild !== undefined && typeof globalThis.cancelIdleCallback === "function") globalThis.cancelIdleCallback(scheduledIdleBuild);
      if (scheduledTimerBuild !== undefined) globalThis.clearTimeout(scheduledTimerBuild);
    };
  }, [document, changeSet, mode, viewport]);
  const currentOverview = overviewState?.document === document && overviewState.mode === mode ? overviewState : undefined;
  const cachedSignalOverview = mode === "signal" && canRetainSignalMiniMapOverview(
    overviewCache.current,
    { signalGroups: document.signalGroups, signalCollection: document.signals, cycleCount: Math.max(1, document.timeline.cycleCount) },
    changeSet,
  ) ? overviewCache.current?.overview : undefined;
  const overview = currentOverview?.overview ?? cachedSignalOverview;
  const transactionOverview = currentOverview?.transactionOverview;
  // #625: vertical metrics come from the shared viewport, horizontal metrics from the Timeline scroll owner (Cycle).
  const sync = () => { const element = viewport.current; if (!element) return; const owner = timelineScrollOwner(element); setMetrics(calculateMiniMapViewportMetrics({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollLeft: owner.scrollLeft, scrollWidth: effectiveScrollWidth(owner), clientWidth: owner.clientWidth })); };
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
      if (event.key === "End") { event.preventDefault(); owner.scrollTo({ left: Math.max(0, effectiveScrollWidth(owner) - owner.clientWidth) }); element.scrollTo({ top: element.scrollHeight }); return; }
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
    owner.scrollLeft = horizontalRatio * Math.max(0, effectiveScrollWidth(owner) - owner.clientWidth);
    sync();
  };
  const indicatorWidth = Math.min(1 - metrics.left, Math.max(0.04, metrics.width));
  const indicatorHeight = Math.min(1 - metrics.top, Math.max(0.04, metrics.ratio));
  const fullViewport = metrics.ratio >= 0.999 && metrics.width >= 0.999;
  return <div ref={documentRef} className="minimap" data-testid="minimap" data-minimap-mode={mode} data-time-policy="full-source-overview" data-transaction-overview-builds={String(transactionOverviewBuilds.current)} data-transaction-overview-full-builds={String(transactionOverviewFullBuilds.current)} data-transaction-overview-incremental-updates={String(transactionOverviewIncrementalUpdates.current)} data-transaction-overview-changed-id-count={String(changeSet?.transactionSemantics?.length ?? 0)} data-transaction-overview-transactions-visited={String(transactionOverview?.transactionsVisited ?? 0)} data-transaction-overview-lane-buckets-rebuilt={String(transactionOverview?.laneBucketsRebuilt ?? 0)} aria-label="MiniMap timeline navigator" aria-busy={!overview && !transactionOverview} title="Click or drag to navigate the timeline" data-overview-builds={String(overviewBuilds.current)} data-overview-signal-lookups={String(overview?.signalLookups ?? 0)} data-overview-rows-rebuilt={String(overview?.rowsRebuilt ?? 0)} data-overview-rows-reused={String(overview?.rowsReused ?? 0)} data-overview-value-changes-visited={String(overview?.valueChangesVisited ?? 0)} data-overview-reuse-signal-comparisons={String(overviewReuseSignalComparisons.current)} data-viewport-top={String(metrics.top)} data-viewport-ratio={String(metrics.ratio)} data-viewport-left={String(metrics.left)} data-viewport-width={String(metrics.width)} onPointerDown={(event) => { if (event.button !== 0) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); pan(event.clientX, event.clientY); }} onPointerMove={(event) => { if (dragging.current) pan(event.clientX, event.clientY); }} onPointerUp={(event) => { dragging.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragging.current = false; }}><div className="minimap-overview-frame"><div className="minimap-rows">{transactionOverview ? <MiniMapTransactionOverviewRows overview={transactionOverview} /> : overview ? <MiniMapOverviewRows overview={overview} /> : null}<MiniMapFoldMarkers timeGroups={document.timeGroups} cycleCount={document.timeline.cycleCount} /><i data-testid="minimap-viewport" data-viewport-full={String(fullViewport)} style={{ "--minimap-left": `${metrics.left * 100}%`, "--minimap-width": `${indicatorWidth * 100}%`, "--minimap-top": `${metrics.top * 100}%`, "--minimap-height": `${indicatorHeight * 100}%` } as CSSProperties} /></div></div></div>;
}
