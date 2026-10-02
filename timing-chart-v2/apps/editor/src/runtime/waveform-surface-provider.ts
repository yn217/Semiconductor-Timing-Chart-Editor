import { disposeWaveCanvas, paintWaveCanvas, isCanvasWaveRendererSelected, supportsCanvasWaveJson } from "./canvas-wave-painter.js";
import { LazyAnalyticGeometryMap } from "./lazy-analytic-geometry.js";
import { OffsetLocalGeometryMap, WAVEDROM_CYCLE_WIDTH, type LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { EditorSessionController } from "./editor-session-controller.js";
import type { CanonicalDocument, Signal, SignalId, SignalValueChange } from "@timing-chart-v2/schema";
import { valueSignalWaveDomain } from "@timing-chart-v2/schema";
import type { WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { analyticLocalGeometry, toWaveJsonWindow, type RenderedWave, type WaveDromAdapter, type WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";
import type { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import type { GeometryRegistry } from "./geometry-registry.js";
import { displayWindowForSource } from "./display-boundary.js";
import { waveOwnerPlacement } from "./wave-owner-placement.js";
import { WaveRenderScheduler } from "./wave-render-scheduler.js";
import type { OpenWaveBatchMetrics } from "./open-wave-metrics.js";
import type { TimeAxisMetrics } from "./timeline-geometry-owner.js";

function yieldToBrowserTask(): Promise<void> {
  const browserScheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof browserScheduler?.yield === "function") return browserScheduler.yield();
  if (typeof globalThis.MessageChannel === "function") {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(undefined);
    });
  }
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export type WaveformProviderContext = Readonly<{
  sessionController: Pick<EditorSessionController, "snapshot">;
  getDocumentEpoch: () => number;
  mappingCache: Pick<DisplayTimeMappingCache, "get" | "remapValueChanges">;
  adapter: WaveDromAdapter;
  geometryRegistry: GeometryRegistry;
  markOpenPhase: (phase: string, phaseTimestamp?: number) => void;
  recordOpenWaveBatch?: (metrics: OpenWaveBatchMetrics) => void;
  isPresentationReady?: () => boolean;
  onReferenceGeometryReady?: () => void | Promise<void>;
  /** True only while initial Open/New artifacts are being materialized.
   * Viewport re-windowing after readiness stays a coherent batch. */
  isPrimaryPresentationOpening?: () => boolean;
  invalidateSnapIndex: () => void;
  getSourceWindow?: (owner: HTMLElement) => Readonly<{ start: number; end: number }> | undefined;
  /** Document-wide pixels-per-display-cycle, owned by the ruler's authoritative
   * rebuild (see TimelineGeometryOwner.waveWidthPxPerDisplayCycle / build-ruler.ts).
   * A pure value read fresh on every call -- never a `--wave-width` CSS custom
   * property read back out of the DOM, which is not guaranteed to have already
   * settled to its final value at every moment a wave batch happens to run and
   * can permanently bake a stale ratio into an owner whose own window does not
   * happen to change again afterward (#614). */
  getWaveWidthPxPerDisplayCycle?: () => number | undefined;
  /** Screen-space X of display-cycle 0 (see TimelineGeometryOwner.waveOriginPx /
   * build-ruler.ts). A windowed owner's inline `left` must be computed in this
   * same coordinate system as the ruler's own ticks, not a naive
   * `rendererStart * pxPerDisplayCycle` with an implicit zero intercept, or
   * every owner ends up offset from the ruler by WaveDrom's own fixed left
   * margin (#620). */
  getWaveOriginPx?: () => number | undefined;
  getPresentationScale?: () => number;
  /** Preferred atomic presentation snapshot; captured once for every batch. */
  getTimeAxisMetrics?: () => TimeAxisMetrics;
  /** Reject async artifacts prepared against a presentation generation that is no longer current. */
  isTimeAxisMetricsCurrent?: (generation: number) => boolean;
  getViewMode?: () => "Cycle" | "Transaction" | "Split";
}>;

export function createWaveformSurfaceProvider(context: WaveformProviderContext): WaveformSurfaceProvider {
  const waveRenderScheduler = new WaveRenderScheduler();
  const canvasOwnerBySignal = new Map<SignalId, HTMLElement>();
  let signalIndexSignals: CanonicalDocument["signals"] | undefined;
  let signalById = new Map<SignalId, Signal>();
  let firstClockSignalId: SignalId | undefined;
  const signalIndexFor = (signals: CanonicalDocument["signals"]) => {
    if (signalIndexSignals !== signals) {
      const nextSignalById = new Map<SignalId, Signal>();
      let nextFirstClockSignalId: SignalId | undefined;
      for (const signal of signals) {
        nextSignalById.set(signal.id, signal);
        if (nextFirstClockSignalId === undefined && signal.type === "clock") nextFirstClockSignalId = signal.id;
      }
      signalById = nextSignalById;
      firstClockSignalId = nextFirstClockSignalId;
      signalIndexSignals = signals;
    }
    return { byId: signalById, firstClockSignalId } as const;
  };
  return {
    ...(context.getSourceWindow ? { getSourceWindow: context.getSourceWindow } : {}),
    async mountWaveBatch(requests) {
      const preparedArtifacts = new Set<RenderedWave>();
      try {
      const batchStartedAt = globalThis.performance.now();
      let batchTimeAxisMetrics: TimeAxisMetrics | undefined;
      let presentationSnapshotCaptured = false;
      const primaryOpenBatch = context.isPrimaryPresentationOpening?.() === true;
      let renderAwaitMs = 0;
      let renderCount = 0;
      let waveJsonPreparationMs = 0;
      let cooperativeYieldCount = 0;
      let cooperativeYieldWaitMs = 0;
      let deferredCount = 0;
      let requiredNowCount = 0;
      let skippedStaleBeforeRunCount = 0;
      let staleAfterRunCount = 0;
      let artifactInstallsBeforePresentationReady = 0;
      let staleProgressiveInstallPreventedCount = 0;
      const recordArtifactInstall = (): void => {
        if (primaryOpenBatch && context.isPresentationReady?.() !== true) artifactInstallsBeforePresentationReady += 1;
      };
      let reusedMarkupCount = 0;
      let markupCacheMissCount = 0;
      const stageTotals = primaryOpenBatch ? Object.create(null) as Record<string, number> : undefined;
      let duplicateOwnerRequestCount = 0;
      if (primaryOpenBatch) {
        const seenOwners = new Set<HTMLElement>();
        for (const request of requests) {
          if (seenOwners.has(request.owner)) duplicateOwnerRequestCount += 1;
          seenOwners.add(request.owner);
        }
      }
      const requestEpoch = requests[0]?.documentEpoch;
      const isCurrent = (request: { readonly documentEpoch?: number; readonly isFresh?: () => boolean }): boolean => {
        const metricsCurrent = batchTimeAxisMetrics === undefined || context.isTimeAxisMetricsCurrent?.(batchTimeAxisMetrics.generation) !== false;
        return metricsCurrent && (request.documentEpoch === undefined || context.getDocumentEpoch() === request.documentEpoch) && (request.isFresh?.() ?? true);
      };
      if (requestEpoch !== undefined && (requestEpoch !== context.getDocumentEpoch() || requests.some((request) => request.documentEpoch !== requestEpoch))) {
        if (primaryOpenBatch) context.recordOpenWaveBatch?.({
          batchWallMs: Math.max(0, globalThis.performance.now() - batchStartedAt), waveJsonPreparationMs: 0,
          renderAwaitMs: 0, renderCount: 0, cooperativeYieldCount: 0, cooperativeYieldWaitMs: 0,
          requestedCount: requests.length, requiredNowCount: 0, deferredCount: 0,
          skippedStaleBeforeRunCount: requests.length, staleAfterRunCount: 0, duplicateOwnerRequestCount,
          artifactInstallsBeforePresentationReady: 0, staleProgressiveInstallPreventedCount: 0,
          reusedMarkupCount: 0, markupCacheMissCount: 0, waveJsonBytes: 0, semanticValuesBytes: 0,
          svgMarkupBytes: 0, cacheKeySerializeMs: 0, waveDromRenderAnyMs: 0, onmlStringifyMs: 0,
          valueLabelLayoutMs: 0, markupSafetyMs: 0, templateParseMs: 0, svgSafetyDomWalkMs: 0,
          domInstallMs: 0, totalSignalWallMs: 0,
        });
        return requests.map(({ signalId }) => ({ signalId, stale: true }));
      }
      const currentSnapshot = context.sessionController.snapshot();
      const document = currentSnapshot.document;
      const signalIndex = signalIndexFor(document.signals);
      const viewMode = context.getViewMode?.();
      // Transaction mode still needs one rendered timing signal to own the
      // shared semantic geometry when a document has no explicit reference
      // clock. This mirrors resolveTimeAxisGeometry's clockless fallback:
      // prefer the first canonical clock rather than deferring every signal
      // and leaving Transaction bars without boundary X positions.
      const mapping = context.mappingCache.get(document.timeline, document.timeGroups);
      const geometrySourceCyclesByWindow = new Map<string, readonly number[]>();
      const geometrySourceCyclesForWindow = (rendererStart: number, rendererEnd: number, sourceStart: number, sourceEnd: number): readonly number[] => {
        const key = `${rendererStart}:${rendererEnd}:${sourceStart}:${sourceEnd}`;
        const cached = geometrySourceCyclesByWindow.get(key);
        if (cached) return cached;
        const sourceCycles = Object.freeze(Array.from({ length: rendererEnd - rendererStart + 1 }, (_, index) => {
          const displayCycle = rendererStart + index;
          return displayCycle === mapping.displayCycleCount ? document.timeline.cycleCount : (mapping.displayToSource(displayCycle) ?? sourceEnd);
        }));
        geometrySourceCyclesByWindow.set(key, sourceCycles);
        return sourceCycles;
      };
      let referenceGeometryReady = false;
      let geometryRegistryChanged = false;
      let waveSliceStartedAt = globalThis.performance.now();
      const referenceClockId = document.timeline.referenceClock ?? signalIndex.firstClockSignalId;
      const markReferenceClockPaintedIfCurrent = (signalId: SignalId): void => {
        if (!primaryOpenBatch || signalId !== referenceClockId) return;
        const latest = context.sessionController.snapshot();
        const latestSignalIndex = signalIndexFor(latest.document.signals);
        const currentReferenceClock = latest.document.timeline.referenceClock ?? latestSignalIndex.firstClockSignalId;
        if (currentReferenceClock === signalId) context.markOpenPhase("reference-clock-painted");
      };
      // #614: every windowed signal's renderer window must span the exact
      // same display-cycle range so their WaveDrom SVGs share one
      // units-per-cycle ratio -- every wave-owner is stretched to a shared
      // document-wide px-per-cycle (see the width pass below), so a signal
      // whose window is even one cycle narrower or wider than another's
      // renders at a visibly different scale despite covering "the same"
      // screen range. Aligning every signal's window to the *reference
      // clock's* period (previously done only when the signal being
      // rendered was itself a clock) keeps that shared ratio intact
      // regardless of which signal happens to need period-aligned WaveDrom
      // clock encoding.
      // #896: the effective reference Clock (explicit, else the first Clock) aligns every bounded window, exactly like Transaction geometry/readiness.
      const referenceClockSignal = referenceClockId === undefined ? undefined : signalIndex.byId.get(referenceClockId);
      const referenceClockPeriod = referenceClockSignal?.type === "clock" ? referenceClockSignal.generator.period : undefined;
      type PreparedItem = {
        readonly request: (typeof requests)[number];
        readonly waveJson: WaveJsonSignal | undefined;
        readonly semanticValues: readonly string[] | undefined;
        readonly error: Error | undefined;
        readonly deferred: boolean;
        readonly rendererStart: number | undefined;
        readonly rendererEnd: number | undefined;
      };
      const prepare = (request: (typeof requests)[number]): PreparedItem => {
        try {
          // Transaction mode owns the shared time geometry and Transaction
          // projection, but does not display Cycle waveforms. Keep the
          // reference clock available for geometry extraction; defer hidden
          // signal paint until Cycle/Combined becomes active.
          if (viewMode === "Transaction" && request.signalId !== referenceClockId) {
            return { request, waveJson: undefined, semanticValues: undefined, error: undefined, deferred: true, rendererStart: undefined, rendererEnd: undefined };
          }
          const signal = signalIndex.byId.get(request.signalId);
          if (!signal) return { request, waveJson: undefined, semanticValues: undefined, error: new Error(`Signal '${request.signalId}' is missing.`), deferred: false, rendererStart: undefined, rendererEnd: undefined };
          let remappedValues: readonly SignalValueChange[] | undefined;
          const displaySignal = signal.type === "commentRow" ? signal : signal.type === "clock"
            ? { ...signal, ...(signal.enable ? { enable: context.mappingCache.remapValueChanges(signal.enable, mapping) } : {}) }
            : (remappedValues = context.mappingCache.remapValueChanges(signal.values, mapping), { ...signal, values: remappedValues });
          const semanticValues = remappedValues !== undefined && signal.type !== "clock" && signal.type !== "commentRow" && valueSignalWaveDomain(signal.type) === "data" ? remappedValues.map((change: { readonly value: string | number }) => String(change.value)) : undefined;
          const source = { signal: displaySignal, cycleCount: mapping.displayCycleCount, enumDefinitions: document.enumDefinitions };
          const sourceWindow = request.sourceWindow;
          const displayWindow = sourceWindow === undefined ? undefined : displayWindowForSource(mapping, { sourceStart: sourceWindow.start, sourceEnd: sourceWindow.end }, document.timeline.cycleCount);
          const displayStart = displayWindow?.displayStart;
          const displayEnd = displayWindow?.displayEnd;
          const clockPeriod = referenceClockPeriod ?? (displaySignal.type === "clock" ? displaySignal.generator.period : undefined);
          // WaveDrom's clock encoder requires its local window to start/end on
          // period boundaries. DisplayTimeMapping can place a semantic window
          // edge between those boundaries (for example around a fold), so align
          // only the renderer window; keep `sourceWindow` as the canonical
          // semantic range used for rebasing and geometry.
          const rendererStart = displayStart === undefined || clockPeriod === undefined
            ? displayStart
            : Math.max(0, Math.floor(displayStart / clockPeriod) * clockPeriod);
          const rendererEnd = displayEnd === undefined || clockPeriod === undefined
            ? displayEnd
            : Math.min(mapping.displayCycleCount, Math.ceil(displayEnd / clockPeriod) * clockPeriod);
          const waveJson = sourceWindow === undefined || rendererStart === undefined || rendererEnd === undefined || rendererEnd <= rendererStart
            ? context.adapter.toWaveJson(source)
            : toWaveJsonWindow(source, rendererStart, rendererEnd, sourceWindow, {
              start: rendererStart === 0 ? 0 : (mapping.displayToSource(rendererStart) ?? sourceWindow.start),
              end: rendererEnd === mapping.displayCycleCount ? document.timeline.cycleCount : (mapping.displayToSource(rendererEnd) ?? sourceWindow.end),
            });
          const mappedWaveJson = sourceWindow === undefined || rendererStart === undefined || rendererEnd === undefined || rendererEnd <= rendererStart
            ? { ...waveJson, geometryCycleDomain: "display" as const }
            : { ...waveJson, geometrySourceCycles: geometrySourceCyclesForWindow(rendererStart, rendererEnd, sourceWindow.start, sourceWindow.end), geometryCycleDomain: "source" as const };
          return { request, waveJson: mappedWaveJson, semanticValues, error: undefined, deferred: false, rendererStart, rendererEnd };
        } catch (error: unknown) {
          // Projection/conversion failures belong to one Signal only. Keep
          // them as request-local errors so one malformed row cannot reject
          // the whole mount batch and blank otherwise valid waveforms.
          return { request, waveJson: undefined, semanticValues: undefined, error: error instanceof Error ? error : new Error(String(error)), deferred: false, rendererStart: undefined, rendererEnd: undefined };
        }
      };
      const prepareAndMeasure = (request: (typeof requests)[number]): PreparedItem => {
        if (!primaryOpenBatch) return prepare(request);
        const startedAt = globalThis.performance.now();
        const item = prepare(request);
        waveJsonPreparationMs += Math.max(0, globalThis.performance.now() - startedAt);
        return item;
      };
      const prepared: PreparedItem[] = [];
      const canvasPrototype = isCanvasWaveRendererSelected(document);
      const canvasRequests = new Set<(typeof requests)[number]>();
      const supportsDetachedWaveInstall = context.adapter.prepareWave !== undefined && context.adapter.installWave !== undefined;
      const referenceRequest = requests.find((request) => request.signalId === referenceClockId);
      if (referenceRequest) prepared.push(prepareAndMeasure(referenceRequest));
      // Primary ruler/grid geometry is analytic and does not depend on the
      // SVG artifact. Publish the reference map before awaiting any WaveDrom
      // render in this batch, so a slow non-reference owner cannot hold the
      // presentation-ready path behind it. SVG-comparison mode intentionally
      // keeps its render-then-extract behavior.
      const referenceItem = prepared.find((item) => item.request.signalId === referenceClockId);
      let referenceGeometrySeeded = false;
      let seededReferenceGeometry: LocalGeometryMap | undefined;
      let seededReferenceOwnerGeometry: LocalGeometryMap | undefined;
      let referenceGeometryNotified = false;
      let referenceGeometryRefresh: Promise<void> | undefined;
      if (referenceItem?.waveJson && !referenceItem.deferred && !referenceItem.error && !useDomGeometrySource() && isCurrent(referenceItem.request)) {
        const geometry = analyticLocalGeometry(referenceItem.request.signalId, referenceItem.waveJson);
        if (isCurrent(referenceItem.request)) {
          const latest = context.sessionController.snapshot();
          const latestSignalIndex = signalIndexFor(latest.document.signals);
          const stillReference = latest.document.timeline.referenceClock === referenceClockId
            || (latest.document.timeline.referenceClock === undefined && latestSignalIndex.firstClockSignalId === referenceClockId);
          const stillPresent = referenceClockId !== undefined && latestSignalIndex.byId.has(referenceClockId);
          if (stillReference && stillPresent) {
            seededReferenceOwnerGeometry = geometry;
            publishCycleBoundarySnapshotAccessor(referenceItem.request.owner, seededReferenceOwnerGeometry);
            seededReferenceGeometry = absoluteWindowGeometry(geometry, referenceItem.rendererStart);
            context.geometryRegistry.maps.set(referenceItem.request.signalId, seededReferenceGeometry);
            context.markOpenPhase("reference-geometry-ready");
            context.invalidateSnapIndex();
            const refresh = context.onReferenceGeometryReady?.();
            referenceGeometryRefresh = refresh === undefined ? undefined : Promise.resolve(refresh);
            referenceGeometrySeeded = true;
            referenceGeometryNotified = true;
          }
        }
      }
      const applyOwnerPlacement = (item: PreparedItem): void => {
        // Capture after reference geometry has synchronously refreshed the ruler,
        // then keep one immutable generation for every owner in this batch.
        if (!presentationSnapshotCaptured) {
          batchTimeAxisMetrics = context.getTimeAxisMetrics?.();
          presentationSnapshotCaptured = true;
        }
        const pxPerDisplayCycle = batchTimeAxisMetrics?.pxPerDisplayCycle ?? context.getWaveWidthPxPerDisplayCycle?.();
        const waveOriginPx = batchTimeAxisMetrics?.screenOriginX ?? context.getWaveOriginPx?.() ?? 0;
        const presentationScale = batchTimeAxisMetrics?.presentationScale ?? context.getPresentationScale?.() ?? 1;
        if (pxPerDisplayCycle !== undefined && item.rendererStart !== undefined && item.rendererEnd !== undefined && item.rendererEnd > item.rendererStart) {
          const placement = waveOwnerPlacement({ displayStart: item.rendererStart, displayEnd: item.rendererEnd, pxPerDisplayCycle, waveOriginPx, presentationScale });
          item.request.owner.style.width = `${placement.width}px`;
          item.request.owner.style.left = `${placement.left}px`;
        } else {
          item.request.owner.style.removeProperty("width");
          item.request.owner.style.removeProperty("left");
        }
      };
      const progressiveRequest = referenceRequest && isCurrent(referenceRequest)
        ? referenceRequest
        : requests.find((request) => isCurrent(request));
      let progressiveItem = prepared.find((item) => item.request === progressiveRequest);
      if (!progressiveItem && progressiveRequest) {
        progressiveItem = prepareAndMeasure(progressiveRequest);
        prepared.push(progressiveItem);
      }
      const progressivePrepared = new Map<PreparedItem["request"], Readonly<{ rendered?: RenderedWave; error?: Error; stale?: boolean }>>();
      const imageReady = new Set<Promise<void>>();
      const pendingImageDecodes = new Set<Promise<void>>();
      const readyRegistered = new Set<(typeof requests)[number]>();
      const registerVisibleWaveReady = (request: (typeof requests)[number], rendered: RenderedWave): void => {
        if (readyRegistered.has(request) || !isCurrent(request) || !request.owner.isConnected) return;
        readyRegistered.add(request);
        const markReady = (): void => {
          if (!isCurrent(request) || !request.owner.isConnected) return;
          request.owner.dataset.waveRenderer = "svg";
          request.owner.dataset.waveState = "ready";
          context.markOpenPhase("first-visible-wave-painted");
          markReferenceClockPaintedIfCurrent(request.signalId);
        };
        if (rendered.svgImageReady) imageReady.add(rendered.svgImageReady.then(markReady));
        else markReady();
      };
      // Start the first visible SVG's asynchronous resource decode before the
      // remaining owners' synchronous WaveJSON/remap preparation. The same
      // prepared node is handed to the scheduler below, so this overlaps
      // independent work without duplicating WaveDrom preparation or install.
      let progressivePreparePromise: Promise<RenderedWave | undefined> | undefined;
      let progressiveRenderStartedAt: number | undefined;
      let progressivePrepareFinishedAt: number | undefined;
      if (primaryOpenBatch && supportsDetachedWaveInstall && !canvasPrototype
        && progressiveItem?.waveJson && !progressiveItem.error && !progressiveItem.deferred
        && isCurrent(progressiveItem.request)) {
        progressiveRenderStartedAt = globalThis.performance.now();
        renderCount += 1;
        try {
          context.adapter.waveMarkupArtifactKey?.(progressiveItem.waveJson, progressiveItem.semanticValues);
          applyOwnerPlacement(progressiveItem);
          progressivePreparePromise = context.adapter.prepareWave!(
            progressiveItem.request.signalId,
            progressiveItem.waveJson,
            progressiveItem.request.owner.ownerDocument,
            progressiveItem.semanticValues,
          ).then((rendered) => {
            preparedArtifacts.add(rendered);
            progressivePrepareFinishedAt = globalThis.performance.now();
            return rendered;
          }).catch((error: unknown) => {
            progressivePrepareFinishedAt = globalThis.performance.now();
            progressivePrepared.set(progressiveItem!.request, { error: error instanceof Error ? error : new Error(String(error)) });
            return undefined;
          });
        } catch (error: unknown) {
          progressivePrepared.set(progressiveItem.request, { error: error instanceof Error ? error : new Error(String(error)) });
        }
      }
      // The callback has already synchronously refreshed ruler/grid owners.
      // Its remaining frame-bound reprojection may proceed alongside the
      // detached reference SVG preparation/decode, but must finish before we
      // prepare/publish requests that the reprojection could invalidate.
      if (progressivePreparePromise || referenceGeometryRefresh) {
        const [, preparedProgressive] = await Promise.all([
          referenceGeometryRefresh ?? Promise.resolve(),
          progressivePreparePromise ?? Promise.resolve(undefined),
        ]);
        if (progressiveRenderStartedAt !== undefined && progressivePrepareFinishedAt !== undefined) {
          renderAwaitMs += Math.max(0, progressivePrepareFinishedAt - progressiveRenderStartedAt);
        }
        if (progressiveItem && progressivePreparePromise && preparedProgressive) {
          if (!isCurrent(progressiveItem.request)) {
            context.adapter.releasePrepared?.(preparedProgressive);
            progressivePrepared.set(progressiveItem.request, { stale: true });
            staleProgressiveInstallPreventedCount += 1;
          } else {
            try {
              const installStartedAt = globalThis.performance.now();
              const installed = context.adapter.installWave!(preparedProgressive!, progressiveItem.request.owner);
              recordArtifactInstall();
              renderAwaitMs += Math.max(0, globalThis.performance.now() - installStartedAt);
              registerVisibleWaveReady(progressiveItem.request, installed);
              progressivePrepared.set(progressiveItem.request, { rendered: installed });
            } catch (error: unknown) {
              progressivePrepared.set(progressiveItem.request, { error: error instanceof Error ? error : new Error(String(error)) });
            }
          }
        }
      }
      // The reference-ready callback may reproject the just-created document
      // on the next frame, invalidating the original viewport requests. Do
      // not pay WaveJSON/remap/window preparation for those requests before
      // checking freshness; the replacement projection will request the
      // current owners itself.
      for (const request of requests) {
        if (request === referenceRequest || request === progressiveRequest) continue;
        if (!isCurrent(request)) {
          prepared.push({ request, waveJson: undefined, semanticValues: undefined, error: undefined, deferred: false, rendererStart: undefined, rendererEnd: undefined });
          continue;
        }
        prepared.push(prepareAndMeasure(request));
      }
      const orderedPrepared = referenceItem === undefined
        ? prepared
        : [referenceItem, ...prepared.filter((item) => item !== referenceItem)];
      // #614: every wave-owner is stretched to a shared, document-wide
      // px-per-cycle (waveform.css sets each owner's CSS width, its child svg
      // stretches to `width: 100%` of that with `preserveAspectRatio="none"`)
      // -- correct for a signal whose WaveJson covers the whole document, but
      // a *windowed* (bounded, #587) signal's own viewBox only covers a
      // fraction of the document, so stretching it to the full document width
      // inflates it far past its real size. Give each windowed owner its own
      // inline width instead, proportional to how much of the document its
      // window actually covers, using the ruler's pure, already-computed
      // ratio (never a `--wave-width` CSS read -- see the context field doc).
      // Non-windowed owners, or when the ratio isn't known yet, fall back to
      // the shared CSS rule (full document width) as before.
      for (const item of prepared) {
        if (item !== progressiveItem || !progressivePrepared.has(item.request)) applyOwnerPlacement(item);
      }
      const renderResults: Array<{ readonly request: (typeof requests)[number]; readonly waveJson: WaveJsonSignal | undefined; readonly semanticValues: readonly string[] | undefined; readonly error: Error | undefined; readonly rendered: RenderedWave | undefined; readonly stale?: boolean; readonly canvasPainted?: boolean; readonly installed?: boolean; readonly rendererStart?: number | undefined }> = [];
      const publishedGeometryByRequest = new Map<(typeof requests)[number], LocalGeometryMap>();
      const publishedSvgByRequest = new Map<(typeof requests)[number], SVGSVGElement>();
      for (const item of orderedPrepared) if (item.deferred) { deferredCount += 1; renderResults.push({ ...item, rendered: undefined }); }
      const runnableItems = orderedPrepared.filter((item) => {
        if (item.deferred) return false;
        if (!isCurrent(item.request)) {
          // A reference-geometry publication may invalidate this batch before
          // WaveRenderScheduler starts. Preserve its stale result, but do not
          // spend a scheduler slot/yield on work that cannot be installed.
          skippedStaleBeforeRunCount += 1;
          renderResults.push({ ...item, rendered: undefined, stale: true });
          return false;
        }
        return true;
      });
      const itemByRequest = new Map(runnableItems.map((item) => [item.request, item] as const));
      // Image-backed SVG artifacts decode asynchronously and are shared by
      // exact WaveJSON/semantic-value identity. Start one decode for every
      // distinct artifact early, before spending scheduler slices preparing
      // additional owners that can only reuse those artifacts. This keeps
      // the same complete owner work and cooperative budget while overlapping
      // independent browser decode with the remaining owner preparation.
      const seenArtifactKeys = new Set<string>();
      const progressiveSignalId = progressiveRequest?.signalId;
      const scheduled = await waveRenderScheduler.runBatch(runnableItems.map((item) => ({
        key: item.request,
        priority: (() => {
          if (item.request.signalId === referenceClockId) return 2;
          if (!primaryOpenBatch || !supportsDetachedWaveInstall || !item.waveJson) return 0;
          const artifactKey = context.adapter.waveMarkupArtifactKey?.(item.waveJson, item.semanticValues)
            ?? JSON.stringify([item.waveJson, item.semanticValues]);
          if (seenArtifactKeys.has(artifactKey)) return 0;
          seenArtifactKeys.add(artifactKey);
          return 1;
        })(),
        isCurrent: () => isCurrent(item.request),
        run: async () => {
          const early = progressivePrepared.get(item.request);
          if (early?.stale) return { ...item, rendered: undefined, stale: true };
          if (early?.error) return { ...item, rendered: undefined, error: early.error };
          if (early?.rendered) return { ...item, rendered: early.rendered, installed: true };
          if (item.error || !item.waveJson) return { ...item, rendered: undefined };
          if (canvasPrototype && supportsCanvasWaveJson(item.waveJson)) {
            const previousCanvasOwner = canvasOwnerBySignal.get(item.request.signalId);
            if (previousCanvasOwner && previousCanvasOwner !== item.request.owner) disposeWaveCanvas(previousCanvasOwner);
            canvasOwnerBySignal.set(item.request.signalId, item.request.owner);
            canvasRequests.add(item.request);
            paintWaveCanvas(item.request.owner, item.waveJson);
            const sourceCycles = item.waveJson.geometrySourceCycles ?? Array.from({ length: item.waveJson.wave.length * (item.waveJson.period ?? 1) + 1 }, (_, index) => (item.waveJson?.sourceWindow?.start ?? 0) + index);
            const canvasGeometry = new LazyAnalyticGeometryMap(item.request.signalId, item.waveJson, sourceCycles);
            publishCycleBoundarySnapshotAccessor(item.request.owner, canvasGeometry);
            context.geometryRegistry.maps.set(item.request.signalId, absoluteWindowGeometry(canvasGeometry, item.rendererStart));
            geometryRegistryChanged = true;
            context.markOpenPhase("first-visible-wave-painted");
            markReferenceClockPaintedIfCurrent(item.request.signalId);
            return { ...item, rendered: undefined, canvasPainted: true };
          }
          try {
            const previousCanvasOwner = canvasOwnerBySignal.get(item.request.signalId);
            if (previousCanvasOwner) {
              disposeWaveCanvas(previousCanvasOwner);
              canvasOwnerBySignal.delete(item.request.signalId);
            }
            const renderStartedAt = globalThis.performance.now();
            renderCount += 1;
            let rendered: RenderedWave;
            let installed = !supportsDetachedWaveInstall;
            try {
              if (supportsDetachedWaveInstall) {
                rendered = await context.adapter.prepareWave!(item.request.signalId, item.waveJson, item.request.owner.ownerDocument, item.semanticValues);
                preparedArtifacts.add(rendered);
                if (!isCurrent(item.request)) {
                  context.adapter.releasePrepared?.(rendered);
                  return { ...item, rendered: undefined, stale: true };
                }
                if (!primaryOpenBatch || item.request.signalId === progressiveSignalId) {
                  rendered = context.adapter.installWave!(rendered, item.request.owner);
                  installed = true;
                  recordArtifactInstall();
                }
              } else {
                rendered = await context.adapter.renderWave(item.request.signalId, item.waveJson, item.request.owner, item.semanticValues);
              recordArtifactInstall();
              }
            } finally {
              renderAwaitMs += Math.max(0, globalThis.performance.now() - renderStartedAt);
            }
            // The progressive reference owner is installed during its job.
            // Register its readiness immediately so the first-visible
            // milestone does not wait for unrelated owners to finish.
            if (!primaryOpenBatch || item.request.signalId === progressiveSignalId || !supportsDetachedWaveInstall) {
              registerVisibleWaveReady(item.request, rendered);
            }
            // renderWave installs the SVG into this owner before resolving.
            // Publish the first-artifact milestone here rather than after
            // every later owner in the batch has also completed.
            return { ...item, rendered, installed };
          } catch (error: unknown) {
            return { ...item, rendered: undefined, error: error instanceof Error ? error : new Error(String(error)) };
          }
        },
      })), {
        // Keep owner work in short cooperative slices during Open and later
        // viewport refills, so a scroll that mounts several uncached rows can
        // yield between completed owners and let the browser paint.
        budgetMs: 32,
        initialSliceStartedAt: waveSliceStartedAt,
        now: () => globalThis.performance.now(),
        shouldYield: () => true,
        yieldToNextTask: yieldToBrowserTask,
        onYield: (waitMs) => { cooperativeYieldCount += 1; cooperativeYieldWaitMs += waitMs; },
      });
      for (const result of scheduled) {
        const item = result.status === "stale-after-run" && result.value !== undefined
          ? result.value
          : itemByRequest.get(result.key)!;
        if (result.status === "stale-before-run") {
          skippedStaleBeforeRunCount += 1;
          renderResults.push({ ...item, rendered: undefined, stale: true });
        }
        else if (result.status === "stale-after-run") {
          if (result.value?.rendered) context.adapter.releasePrepared?.(result.value.rendered);
          const canvasOwner = canvasOwnerBySignal.get(item.request.signalId);
          if (canvasOwner === item.request.owner) {
            disposeWaveCanvas(canvasOwner);
            canvasOwnerBySignal.delete(item.request.signalId);
          }
          requiredNowCount += 1;
          staleAfterRunCount += 1;
          renderResults.push({ ...item, rendered: undefined, stale: true });
        }
        else if (result.status === "error") {
          requiredNowCount += 1;
          // Canvas rendering failures historically abort the whole batch; keep
          // that policy while WaveDrom adapter failures remain row-scoped.
          if (canvasRequests.has(item.request)) {
            for (const request of requests) {
              const canvasOwner = canvasOwnerBySignal.get(request.signalId);
              if (canvasOwner !== request.owner) continue;
              disposeWaveCanvas(canvasOwner);
              canvasOwnerBySignal.delete(request.signalId);
            }
            throw result.error;
          }
          renderResults.push({ ...item, rendered: undefined, error: result.error instanceof Error ? result.error : new Error(String(result.error)) });
        }
        else {
          const value = result.value;
          if (value.rendered && primaryOpenBatch && supportsDetachedWaveInstall && value.request.signalId !== progressiveSignalId) {
            if (!isCurrent(value.request)) {
              context.adapter.releasePrepared?.(value.rendered);
              requiredNowCount += 1;
              staleAfterRunCount += 1;
              renderResults.push({ ...value, rendered: undefined, stale: true });
              continue;
            }
            // Keep non-progressive wrappers detached until their shared SVG
            // image resource is decoded. This avoids connecting a batch of
            // image-backed SVGs while the browser is still resolving them.
            renderResults.push(value);
          } else {
            renderResults.push(value);
          }
          requiredNowCount += 1;
        }
      }
      for (const item of renderResults) {
        if (item.rendered?.svgImageReady) pendingImageDecodes.add(item.rendered.svgImageReady);
      }
      const renderedByRequest = new Map(renderResults.map((item) => [item.request, item] as const));
      const preparedByRequest = new Map(prepared.map((item) => [item.request, item] as const));
      const results = requests.map((request) => {
        const item = renderedByRequest.get(request)!;
        if (preparedByRequest.get(request)?.deferred) {
          return { signalId: request.signalId, result: { waveDromRenders: 0, localGeometryBuilds: 0 } };
        }
        if (item.stale === true || !isCurrent(item.request)) {
          const canvasOwner = canvasOwnerBySignal.get(request.signalId);
          if (canvasOwner === request.owner) {
            disposeWaveCanvas(canvasOwner);
            canvasOwnerBySignal.delete(request.signalId);
          }
          return { signalId: item.request.signalId, stale: true };
        }
        if (item.canvasPainted === true) return { signalId: item.request.signalId, result: { waveDromRenders: 0, localGeometryBuilds: 1 } };
        if (item.error || !item.rendered) return { signalId: item.request.signalId, error: item.error ?? new Error("Waveform render did not produce an SVG.") };
        const rendered = item.rendered;
        try {
          if (!isCurrent(item.request)) return { signalId: item.request.signalId, stale: true };
          // A semantic delete can occur without advancing documentEpoch. Do
          // not let an in-flight render for the removed signal repopulate the
          // geometry registry after the canonical identity disappeared.
          const latestSnapshot = context.sessionController.snapshot();
          const currentSignal = signalIndexFor(latestSnapshot.document.signals).byId.get(item.request.signalId);
          if (!currentSignal) return { signalId: item.request.signalId, stale: true };
          // Reference-clock readiness belongs to the current stable SignalId,
          // not to the document snapshot captured when this async render began.
          // A same-epoch reference-clock switch must not let the old owner
          // satisfy the readiness gate or trigger a stale refresh.
          const latestSignalIndex = signalIndexFor(latestSnapshot.document.signals);
          const currentReferenceClock = latestSnapshot.document.timeline.referenceClock ?? latestSignalIndex.firstClockSignalId;
          // Renderer-independent Local Geometry (#755): computed from the WaveJson + pinned WaveDrom layout, not by reading
          // the rendered SVG DOM (getScreenCTM / <use> walk). `?geometrySource=svg` restores DOM extraction for comparison.
          const geometry = useDomGeometrySource()
            ? context.adapter.extractLocalGeometry(rendered)
            : referenceGeometrySeeded && item.request.signalId === referenceClockId
              ? seededReferenceGeometry!
              : new LazyAnalyticGeometryMap(
                item.request.signalId,
                rendered.waveJson,
                rendered.waveJson.geometrySourceCycles
                  ?? Array.from({ length: rendered.waveJson.wave.length + 1 }, (_, index) => (rendered.waveJson.sourceWindow?.start ?? 0) + index),
              );
          if (!isCurrent(item.request)) return { signalId: item.request.signalId, stale: true };
          if (!(referenceGeometrySeeded && item.request.signalId === referenceClockId && !useDomGeometrySource())) {
            const publishedGeometry = absoluteWindowGeometry(geometry, item.rendererStart);
            context.geometryRegistry.maps.set(item.request.signalId, publishedGeometry);
            publishedGeometryByRequest.set(item.request, publishedGeometry);
            geometryRegistryChanged = true;
          }
          context.geometryRegistry.svgs.set(item.request.signalId, rendered.svg as SVGSVGElement);
          publishedSvgByRequest.set(item.request, rendered.svg as SVGSVGElement);
          const ownerGeometry = referenceGeometrySeeded && item.request.signalId === referenceClockId && !useDomGeometrySource()
            ? seededReferenceOwnerGeometry
            : geometry;
          publishCycleBoundarySnapshotAccessor(item.request.owner, ownerGeometry);
          if (item.request.signalId === currentReferenceClock) { context.markOpenPhase("reference-geometry-ready"); referenceGeometryReady = true; }
          return { signalId: item.request.signalId, result: { waveDromRenders: 1, localGeometryBuilds: 1 } };
        } catch (error: unknown) {
          context.geometryRegistry.svgs.delete(item.request.signalId);
          if (!(referenceGeometrySeeded && item.request.signalId === referenceClockId && !useDomGeometrySource())) {
            context.geometryRegistry.maps.delete(item.request.signalId);
            geometryRegistryChanged = true;
          }
          return { signalId: item.request.signalId, error };
        }
      });
      // Each result above updates the shared geometry registry synchronously.
      // Invalidate its derived indexes once after the batch instead of once per
      // owner; repeated invalidation also discarded the identical source-window
      // query while the remaining owners were still being accepted.
      if (geometryRegistryChanged) {
        context.invalidateSnapIndex();
        geometryRegistryChanged = false;
      }
      if (referenceGeometryReady && !referenceGeometryNotified) context.onReferenceGeometryReady?.();
      if (pendingImageDecodes.size > 0) {
        const imageDecodeStartedAt = globalThis.performance.now();
        await Promise.all(pendingImageDecodes);
        renderAwaitMs += Math.max(0, globalThis.performance.now() - imageDecodeStartedAt);
      }
      // Install every remaining detached owner synchronously after its
      // deduplicated resource dependencies are ready. Geometry was published
      // above from validated WaveJSON and remains available during decoding.
      // The progressive reference owner stays installed earlier for first-wave UX.
      for (let index = 0; index < renderResults.length; index += 1) {
        const item = renderResults[index]!;
        if (!item.rendered || item.installed || item.stale === true || !primaryOpenBatch || !supportsDetachedWaveInstall
          || item.request.signalId === progressiveSignalId) continue;
        if (!isCurrent(item.request)) {
          context.adapter.releasePrepared?.(item.rendered);
          if (context.geometryRegistry.svgs.get(item.request.signalId) === publishedSvgByRequest.get(item.request)) {
            context.geometryRegistry.svgs.delete(item.request.signalId);
          }
          const ownGeometry = publishedGeometryByRequest.get(item.request);
          if (ownGeometry && context.geometryRegistry.maps.get(item.request.signalId) === ownGeometry) {
            context.geometryRegistry.maps.delete(item.request.signalId);
            geometryRegistryChanged = true;
          }
          renderResults[index] = { ...item, rendered: undefined, stale: true };
          const requestIndex = requests.indexOf(item.request);
          if (requestIndex >= 0) results[requestIndex] = { signalId: item.request.signalId, stale: true };
          staleAfterRunCount += 1;
          continue;
        }
        try {
          const installStartedAt = globalThis.performance.now();
          const installed = context.adapter.installWave!(item.rendered, item.request.owner);
          recordArtifactInstall();
          renderAwaitMs += Math.max(0, globalThis.performance.now() - installStartedAt);
          renderResults[index] = { ...item, rendered: installed, installed: true };
        } catch (error: unknown) {
          if (context.geometryRegistry.svgs.get(item.request.signalId) === publishedSvgByRequest.get(item.request)) {
            context.geometryRegistry.svgs.delete(item.request.signalId);
          }
          const ownGeometry = publishedGeometryByRequest.get(item.request);
          if (ownGeometry && context.geometryRegistry.maps.get(item.request.signalId) === ownGeometry) {
            context.geometryRegistry.maps.delete(item.request.signalId);
            geometryRegistryChanged = true;
          }
          renderResults[index] = { ...item, rendered: undefined, error: error instanceof Error ? error : new Error(String(error)) };
          const requestIndex = requests.indexOf(item.request);
          if (requestIndex >= 0) results[requestIndex] = { signalId: item.request.signalId, error: error instanceof Error ? error : new Error(String(error)) };
        }
      }
      if (geometryRegistryChanged) context.invalidateSnapIndex();
      for (const item of renderResults) {
        if (!item.rendered || item.stale === true) continue;
        registerVisibleWaveReady(item.request, item.rendered);
      }
      // Geometry is derived from validated WaveJSON, not decoded image pixels.
      // Readiness callbacks still gate the batch on actual resource decode and
      // installation, but shared geometry publication remains one batch pass.
      if (imageReady.size > 0) {
        const imageReadyStartedAt = globalThis.performance.now();
        await Promise.all(imageReady);
        renderAwaitMs += Math.max(0, globalThis.performance.now() - imageReadyStartedAt);
      }
      if (primaryOpenBatch) {
        const openStageTotals = stageTotals!;
        for (const result of renderResults) {
          const rendered = result.rendered;
          if (!rendered) continue;
          if (rendered.markupCacheHit === true) reusedMarkupCount += 1;
          else if (rendered.markupCacheHit === false) markupCacheMissCount += 1;
          for (const [name, amount] of Object.entries(rendered.renderStages ?? {})) {
            openStageTotals[name] = (openStageTotals[name] ?? 0) + amount;
          }
        }
        context.recordOpenWaveBatch?.({
          batchWallMs: Math.max(0, globalThis.performance.now() - batchStartedAt),
          waveJsonPreparationMs,
          renderAwaitMs,
          renderCount,
          cooperativeYieldCount,
          cooperativeYieldWaitMs,
          requestedCount: requests.length,
          requiredNowCount,
          deferredCount,
          skippedStaleBeforeRunCount,
          staleAfterRunCount,
          artifactInstallsBeforePresentationReady,
          staleProgressiveInstallPreventedCount,
          duplicateOwnerRequestCount,
          reusedMarkupCount,
          markupCacheMissCount,
          waveJsonBytes: openStageTotals.waveJsonBytes ?? 0,
          semanticValuesBytes: openStageTotals.semanticValuesBytes ?? 0,
          svgMarkupBytes: openStageTotals.svgMarkupBytes ?? 0,
          cacheKeySerializeMs: openStageTotals.cacheKeySerializeMs ?? 0,
          waveDromRenderAnyMs: openStageTotals.waveDromRenderAnyMs ?? 0,
          onmlStringifyMs: openStageTotals.onmlStringifyMs ?? 0,
          valueLabelLayoutMs: openStageTotals.valueLabelLayoutMs ?? 0,
          markupSafetyMs: openStageTotals.markupSafetyMs ?? 0,
          templateParseMs: openStageTotals.templateParseMs ?? 0,
          svgSafetyDomWalkMs: openStageTotals.svgSafetyDomWalkMs ?? 0,
          domInstallMs: openStageTotals.domInstallMs ?? 0,
          totalSignalWallMs: openStageTotals.totalSignalWallMs ?? 0,
        });
      }
      return results;
      } finally {
        // Installation transfers each prepared artifact into an active owner;
        // releasePrepared is then a no-op. Any stale, abandoned, or exceptional
        // batch result still owned here is explicitly abandoned exactly once.
        for (const prepared of preparedArtifacts) context.adapter.releasePrepared?.(prepared);
      }
    },
    async mountWave(id, owner) {
      const item = (await this.mountWaveBatch?.([{ signalId: id, owner }]))?.[0];
      if (!item?.result) throw item?.error instanceof Error ? item.error : new Error("Waveform batch did not produce a result.");
      return item.result;
    },
    disposeWave(id) {
      const canvasOwner = canvasOwnerBySignal.get(id);
      if (canvasOwner) disposeWaveCanvas(canvasOwner);
      canvasOwnerBySignal.delete(id);
      context.adapter.dispose(id); context.geometryRegistry.remove(id); context.invalidateSnapIndex();
    },
    retainWaveArtifact(id) {
      const canvasOwner = canvasOwnerBySignal.get(id);
      if (canvasOwner) disposeWaveCanvas(canvasOwner);
      canvasOwnerBySignal.delete(id);
      context.adapter.retainArtifact?.(id); context.geometryRegistry.remove(id); context.invalidateSnapIndex();
    },
  };
}

function useDomGeometrySource(): boolean {
  try { return typeof location !== "undefined" && new URLSearchParams(location.search).get("geometrySource") === "svg"; } catch { return false; }
}

/**
 * Owner-relative geometry (first boundary at the WaveDrom margin) -> document-absolute local X. Consumers (snap index, hit-test,
 * overlays) all work in absolute X, so a window starting past cycle 0 is shifted by its display offset (100k-cycle far-window
 * selection mapped pointer X onto the window's relative X and landed hundreds of cycles away).
 */
function absoluteWindowGeometry(geometry: LocalGeometryMap, displayStart: number | undefined): LocalGeometryMap {
  return displayStart === undefined || displayStart <= 0 ? geometry : new OffsetLocalGeometryMap(geometry, displayStart * WAVEDROM_CYCLE_WIDTH);
}

/**
 * Exposes owner-relative boundary positions only when a diagnostic consumer
 * asks for specific cycles. Publishing every boundary into a DOM attribute
 * serialized the whole window on each render and made the hot path scale with
 * retained geometry size. The pull accessor keeps screen X = owner box X +
 * returned local X without eagerly enumerating the boundary map.
 */
function publishCycleBoundarySnapshotAccessor(owner: HTMLElement, geometry: LocalGeometryMap | undefined): void {
  type CycleBoundarySnapshotOwner = HTMLElement & {
    requestCycleBoundaryPositions?: (cycles: readonly number[]) => Readonly<Record<number, number>>;
  };
  const snapshotOwner = owner as CycleBoundarySnapshotOwner;
  const isDevelopmentBuild = (import.meta as ImportMeta & { readonly env?: { readonly DEV?: boolean } }).env?.DEV === true;
  if (!geometry || !isDevelopmentBuild) {
    delete snapshotOwner.requestCycleBoundaryPositions;
    return;
  }
  Object.defineProperty(snapshotOwner, "requestCycleBoundaryPositions", {
    configurable: true,
    enumerable: false,
    value: (cycles: readonly number[]) => {
      const positions: Record<number, number> = {};
      for (const cycle of cycles) {
        const boundary = geometry.find({ signalId: geometry.signalId, cycle, point: "cycle-start" });
        if (boundary) positions[cycle] = boundary.point.x;
      }
      return Object.freeze(positions);
    },
  });
}
