import { paintWaveCanvas, isCanvasWaveRendererSelected } from "./canvas-wave-painter.js";
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
  recordOpenWaveBatch?: (metrics: Readonly<{
    batchWallMs: number;
    renderAwaitMs: number;
    renderCount: number;
    cooperativeYieldCount: number;
    cooperativeYieldWaitMs: number;
  }>) => void;
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
  getViewMode?: () => "Cycle" | "Transaction" | "Split";
}>;

export function createWaveformSurfaceProvider(context: WaveformProviderContext): WaveformSurfaceProvider {
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
      const batchStartedAt = globalThis.performance.now();
      const primaryOpenBatch = context.isPrimaryPresentationOpening?.() === true;
      let renderAwaitMs = 0;
      let renderCount = 0;
      let cooperativeYieldCount = 0;
      let cooperativeYieldWaitMs = 0;
      const requestEpoch = requests[0]?.documentEpoch;
      const isCurrent = (request: { readonly documentEpoch?: number; readonly isFresh?: () => boolean }): boolean => (request.documentEpoch === undefined || context.getDocumentEpoch() === request.documentEpoch) && (request.isFresh?.() ?? true);
      if (requestEpoch !== undefined && (requestEpoch !== context.getDocumentEpoch() || requests.some((request) => request.documentEpoch !== requestEpoch))) return requests.map(({ signalId }) => ({ signalId, stale: true }));
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
      let referenceGeometryReady = false;
      let waveSliceStartedAt = globalThis.performance.now();
      const referenceClockId = document.timeline.referenceClock ?? signalIndex.firstClockSignalId;
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
      const referenceClockSignal = document.timeline.referenceClock === undefined ? undefined : signalIndex.byId.get(document.timeline.referenceClock);
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
              start: rendererStart === 0 ? 0 : (mapping.displayToSource[rendererStart] ?? sourceWindow.start),
              end: rendererEnd === mapping.displayCycleCount ? document.timeline.cycleCount : (mapping.displayToSource[rendererEnd] ?? sourceWindow.end),
            });
          const mappedWaveJson = sourceWindow === undefined || rendererStart === undefined || rendererEnd === undefined || rendererEnd <= rendererStart
            ? waveJson
            : { ...waveJson, geometrySourceCycles: Array.from({ length: rendererEnd - rendererStart + 1 }, (_, index) => {
              const displayCycle = rendererStart + index;
              return displayCycle === mapping.displayCycleCount ? document.timeline.cycleCount : (mapping.displayToSource[displayCycle] ?? sourceWindow.end);
            }) };
          return { request, waveJson: mappedWaveJson, semanticValues, error: undefined, deferred: false, rendererStart, rendererEnd };
        } catch (error: unknown) {
          // Projection/conversion failures belong to one Signal only. Keep
          // them as request-local errors so one malformed row cannot reject
          // the whole mount batch and blank otherwise valid waveforms.
          return { request, waveJson: undefined, semanticValues: undefined, error: error instanceof Error ? error : new Error(String(error)), deferred: false, rendererStart: undefined, rendererEnd: undefined };
        }
      };
      const prepared: PreparedItem[] = [];
      const referenceRequest = requests.find((request) => request.signalId === referenceClockId);
      if (referenceRequest) prepared.push(prepare(referenceRequest));
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
            await context.onReferenceGeometryReady?.();
            referenceGeometrySeeded = true;
            referenceGeometryNotified = true;
          }
        }
      }
      // The reference-ready callback may reproject the just-created document
      // on the next frame, invalidating the original viewport requests. Do
      // not pay WaveJSON/remap/window preparation for those requests before
      // checking freshness; the replacement projection will request the
      // current owners itself.
      for (const request of requests) {
        if (request === referenceRequest) continue;
        if (!isCurrent(request)) {
          prepared.push({ request, waveJson: undefined, semanticValues: undefined, error: undefined, deferred: false, rendererStart: undefined, rendererEnd: undefined });
          continue;
        }
        prepared.push(prepare(request));
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
      const pxPerDisplayCycle = context.getWaveWidthPxPerDisplayCycle?.();
      const waveOriginPx = context.getWaveOriginPx?.() ?? 0;
      for (const item of prepared) {
        if (pxPerDisplayCycle !== undefined && item.rendererStart !== undefined && item.rendererEnd !== undefined && item.rendererEnd > item.rendererStart) {
          const placement = waveOwnerPlacement({ displayStart: item.rendererStart, displayEnd: item.rendererEnd, pxPerDisplayCycle, waveOriginPx, presentationScale: context.getPresentationScale?.() ?? 1 });
          item.request.owner.style.width = `${placement.width}px`;
          // The shared wave-owner layer (`stable-waveform-surface`) is one
          // element as wide as the whole document (`--wave-width`), scrolled
          // natively; `place()` (stable-surface.ts) only ever sets each
          // owner's *vertical* position via translateY. A windowed owner
          // whose SVG covers a cycle range starting partway through the
          // document -- anything after the first #614 re-windowing fires --
          // was left at its default horizontal position (effectively x=0,
          // i.e. document start) with no offset for where its own window
          // actually begins, so its rendered content appeared at completely
          // the wrong horizontal position once scrolled away from cycle 0.
          // `waveOriginPx` carries the ruler's own coordinate-system origin
          // (WaveDrom's fixed left margin) so this lines up with ruler ticks
          // exactly, not just proportionally (#620).
          item.request.owner.style.left = `${placement.left}px`;
        } else {
          item.request.owner.style.removeProperty("width");
          item.request.owner.style.removeProperty("left");
        }
      }
      const canvasPrototype = isCanvasWaveRendererSelected(document);
      const renderResults: Array<{ readonly request: (typeof requests)[number]; readonly waveJson: WaveJsonSignal | undefined; readonly semanticValues: readonly string[] | undefined; readonly error: Error | undefined; readonly rendered: RenderedWave | undefined; readonly stale?: boolean; readonly canvasPainted?: boolean; readonly rendererStart?: number | undefined }> = [];
      for (const item of orderedPrepared) {
        if (item.deferred) {
          renderResults.push({ ...item, rendered: undefined });
          continue;
        }
        if (!isCurrent(item.request)) renderResults.push({ ...item, rendered: undefined, stale: true });
        else if (item.error || !item.waveJson) renderResults.push({ ...item, rendered: undefined });
        else {
          if (canvasPrototype) {
            paintWaveCanvas(item.request.owner, item.waveJson);
            const sourceCycles = item.waveJson.geometrySourceCycles ?? Array.from({ length: item.waveJson.wave.length + 1 }, (_, index) => (item.waveJson?.sourceWindow?.start ?? 0) + index);
            const canvasGeometry = new LazyAnalyticGeometryMap(item.request.signalId, item.waveJson, sourceCycles);
            publishCycleBoundarySnapshotAccessor(item.request.owner, canvasGeometry);
            context.geometryRegistry.maps.set(item.request.signalId, absoluteWindowGeometry(canvasGeometry, item.rendererStart));
            context.invalidateSnapIndex();
            context.markOpenPhase("first-visible-wave-painted");
            renderResults.push({ ...item, rendered: undefined, canvasPainted: true });
          } else {
            try {
              const renderStartedAt = globalThis.performance.now();
              renderCount += 1;
              const rendered = await context.adapter.renderWave(item.request.signalId, item.waveJson, item.request.owner, item.semanticValues);
              renderAwaitMs += Math.max(0, globalThis.performance.now() - renderStartedAt);
              renderResults.push({ ...item, rendered });
            }
            catch (error: unknown) { renderResults.push({ ...item, rendered: undefined, error: error instanceof Error ? error : new Error(String(error)) }); }
          }
        }
        if (context.isPrimaryPresentationOpening?.() === true && globalThis.performance.now() - waveSliceStartedAt >= 6) {
          const yieldStartedAt = globalThis.performance.now();
          await yieldToBrowserTask();
          cooperativeYieldCount += 1;
          cooperativeYieldWaitMs += Math.max(0, globalThis.performance.now() - yieldStartedAt);
          waveSliceStartedAt = globalThis.performance.now();
        }
      }
      const renderedByRequest = new Map(renderResults.map((item) => [item.request, item] as const));
      const preparedByRequest = new Map(prepared.map((item) => [item.request, item] as const));
      const results = requests.map((request) => {
        const item = renderedByRequest.get(request)!;
        if (preparedByRequest.get(request)?.deferred) {
          return { signalId: request.signalId, result: { waveDromRenders: 0, localGeometryBuilds: 0 } };
        }
        if (item.stale === true || !isCurrent(item.request)) return { signalId: item.request.signalId, stale: true };
        if (item.canvasPainted === true) return { signalId: item.request.signalId, result: { waveDromRenders: 0, localGeometryBuilds: 1 } };
        if (item.error || !item.rendered) return { signalId: item.request.signalId, error: item.error ?? new Error("Waveform render did not produce an SVG.") };
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
          const currentReferenceClock = latestSnapshot.document.timeline.referenceClock;
          if (item.request.signalId === currentReferenceClock) context.markOpenPhase("reference-clock-painted");
          // Renderer-independent Local Geometry (#755): computed from the WaveJson + pinned WaveDrom layout, not by reading
          // the rendered SVG DOM (getScreenCTM / <use> walk). `?geometrySource=svg` restores DOM extraction for comparison.
          const geometry = useDomGeometrySource()
            ? context.adapter.extractLocalGeometry(item.rendered)
            : referenceGeometrySeeded && item.request.signalId === referenceClockId
              ? seededReferenceGeometry!
              : analyticLocalGeometry(item.request.signalId, item.rendered.waveJson);
          if (!isCurrent(item.request)) return { signalId: item.request.signalId, stale: true };
          if (!(referenceGeometrySeeded && item.request.signalId === referenceClockId && !useDomGeometrySource())) {
            context.geometryRegistry.maps.set(item.request.signalId, absoluteWindowGeometry(geometry, item.rendererStart));
          }
          context.geometryRegistry.svgs.set(item.request.signalId, item.rendered.svg as SVGSVGElement);
          const ownerGeometry = referenceGeometrySeeded && item.request.signalId === referenceClockId && !useDomGeometrySource()
            ? seededReferenceOwnerGeometry
            : geometry;
          publishCycleBoundarySnapshotAccessor(item.request.owner, ownerGeometry);
          if (item.request.signalId === currentReferenceClock) { context.markOpenPhase("reference-geometry-ready"); referenceGeometryReady = true; }
          context.markOpenPhase("first-visible-wave-painted");
          context.invalidateSnapIndex();
          return { signalId: item.request.signalId, result: { waveDromRenders: 1, localGeometryBuilds: 1 } };
        } catch (error: unknown) {
          context.geometryRegistry.svgs.delete(item.request.signalId);
          if (!(referenceGeometrySeeded && item.request.signalId === referenceClockId && !useDomGeometrySource())) {
            context.geometryRegistry.maps.delete(item.request.signalId);
          }
          context.invalidateSnapIndex();
          return { signalId: item.request.signalId, error };
        }
      });
      if (referenceGeometryReady && !referenceGeometryNotified) context.onReferenceGeometryReady?.();
      if (primaryOpenBatch) {
        context.recordOpenWaveBatch?.({
          batchWallMs: Math.max(0, globalThis.performance.now() - batchStartedAt),
          renderAwaitMs,
          renderCount,
          cooperativeYieldCount,
          cooperativeYieldWaitMs,
        });
      }
      return results;
    },
    async mountWave(id, owner) {
      const item = (await this.mountWaveBatch?.([{ signalId: id, owner }]))?.[0];
      if (!item?.result) throw item?.error instanceof Error ? item.error : new Error("Waveform batch did not produce a result.");
      return item.result;
    },
    disposeWave(id) { context.adapter.dispose(id); context.geometryRegistry.remove(id); context.invalidateSnapIndex(); },
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
