import type { EditorSessionController } from "./editor-session-controller.js";
import type { CanonicalDocument, Signal, SignalId, SignalValueChange } from "@timing-chart-v2/schema";
import { valueSignalWaveDomain } from "@timing-chart-v2/schema";
import type { WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { toWaveJsonWindow, type RenderedWave, type WaveDromAdapter, type WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";
import type { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import type { GeometryRegistry } from "./geometry-registry.js";
import { displayWindowForSource } from "./display-boundary.js";

function nextBrowserFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => resolve());
    else globalThis.setTimeout(resolve, 0);
  });
}

export type WaveformProviderContext = Readonly<{
  sessionController: Pick<EditorSessionController, "snapshot">;
  getDocumentEpoch: () => number;
  mappingCache: Pick<DisplayTimeMappingCache, "get" | "remapValueChanges">;
  adapter: WaveDromAdapter;
  geometryRegistry: GeometryRegistry;
  markOpenPhase: (phase: string, phaseTimestamp?: number) => void;
  onReferenceGeometryReady?: () => void;
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
}>;

export function createWaveformSurfaceProvider(context: WaveformProviderContext): WaveformSurfaceProvider {
  let signalIndexDocument: CanonicalDocument | undefined;
  let signalIndexRevision = -1;
  let signalById = new Map<SignalId, Signal>();
  return {
    ...(context.getSourceWindow ? { getSourceWindow: context.getSourceWindow } : {}),
    async mountWaveBatch(requests) {
      const requestEpoch = requests[0]?.documentEpoch;
      const isCurrent = (request: { readonly documentEpoch?: number; readonly isFresh?: () => boolean }): boolean => (request.documentEpoch === undefined || context.getDocumentEpoch() === request.documentEpoch) && (request.isFresh?.() ?? true);
      if (requestEpoch !== undefined && (requestEpoch !== context.getDocumentEpoch() || requests.some((request) => request.documentEpoch !== requestEpoch))) return requests.map(({ signalId }) => ({ signalId, stale: true }));
      const currentSnapshot = context.sessionController.snapshot();
      const document = currentSnapshot.document;
      const mapping = context.mappingCache.get(document.timeline, document.timeGroups);
      const yieldBetweenOwners = document.signals.length * mapping.displayCycleCount >= 250_000;
      let referenceGeometryReady = false;
      if (signalIndexDocument !== document || signalIndexRevision !== currentSnapshot.revision) {
        signalById = new Map(document.signals.map((signal) => [signal.id, signal]));
        signalIndexDocument = document;
        signalIndexRevision = currentSnapshot.revision;
      }
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
      const referenceClockSignal = document.timeline.referenceClock === undefined ? undefined : signalById.get(document.timeline.referenceClock);
      const referenceClockPeriod = referenceClockSignal?.type === "clock" ? referenceClockSignal.generator.period : undefined;
      const prepared = requests.map((request) => {
        const signal = signalById.get(request.signalId);
        if (!signal) return { request, waveJson: undefined, semanticValues: undefined, error: new Error(`Signal '${request.signalId}' is missing.`) };
        let remappedValues: readonly SignalValueChange[] | undefined;
        const displaySignal = signal.type === "commentRow" ? signal : signal.type === "clock"
          ? { ...signal, ...(signal.enable ? { enable: context.mappingCache.remapValueChanges(signal.enable, mapping) } : {}) }
          : (remappedValues = context.mappingCache.remapValueChanges(signal.values, mapping), { ...signal, values: remappedValues });
        const semanticValues = remappedValues !== undefined && signal.type !== "clock" && signal.type !== "commentRow" && valueSignalWaveDomain(signal.type) === "data" ? remappedValues.map((change: { readonly value: string | number }) => String(change.value)) : undefined;
        const source = { signal: displaySignal, cycleCount: mapping.displayCycleCount };
        const sourceWindow = request.sourceWindow;
        const displayWindow = sourceWindow === undefined ? undefined : displayWindowForSource(mapping, { sourceStart: sourceWindow.start, sourceEnd: sourceWindow.end }, document.timeline.cycleCount);
        const displayStart = displayWindow?.displayStart;
        const displayEnd = displayWindow?.displayEnd;
        const clockPeriod = referenceClockPeriod ?? (displaySignal.type === "clock" ? displaySignal.generator.period : undefined);
        // WaveDrom's clock encoder requires its local window to start/end on
        // period boundaries.  DisplayTimeMapping can place a semantic window
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
        return { request, waveJson: mappedWaveJson, semanticValues, error: undefined, rendererStart, rendererEnd };
      });
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
      for (const item of prepared) {
        if (pxPerDisplayCycle !== undefined && item.rendererStart !== undefined && item.rendererEnd !== undefined && item.rendererEnd > item.rendererStart) {
          item.request.owner.style.width = `${(item.rendererEnd - item.rendererStart) * pxPerDisplayCycle}px`;
        } else {
          item.request.owner.style.removeProperty("width");
        }
      }
      const renderResults: Array<{ readonly request: (typeof requests)[number]; readonly waveJson: WaveJsonSignal | undefined; readonly semanticValues: readonly string[] | undefined; readonly error: Error | undefined; readonly rendered: RenderedWave | undefined; readonly stale?: boolean }> = [];
      for (const item of prepared) {
        if (!isCurrent(item.request)) renderResults.push({ ...item, rendered: undefined, stale: true });
        else if (item.error || !item.waveJson) renderResults.push({ ...item, rendered: undefined });
        else {
          try { renderResults.push({ ...item, rendered: await context.adapter.renderWave(item.request.signalId, item.waveJson, item.request.owner, item.semanticValues) }); }
          catch (error: unknown) { renderResults.push({ ...item, rendered: undefined, error: error instanceof Error ? error : new Error(String(error)) }); }
        }
        if (yieldBetweenOwners) await nextBrowserFrame();
      }
      const results = renderResults.map((item) => {
        if (item.stale === true || !isCurrent(item.request)) return { signalId: item.request.signalId, stale: true };
        if (item.error || !item.rendered) return { signalId: item.request.signalId, error: item.error ?? new Error("Waveform render did not produce an SVG.") };
        try {
          if (!isCurrent(item.request)) return { signalId: item.request.signalId, stale: true };
          // A semantic delete can occur without advancing documentEpoch. Do
          // not let an in-flight render for the removed signal repopulate the
          // geometry registry after the canonical identity disappeared.
          const latestSnapshot = context.sessionController.snapshot();
          const currentSignal = latestSnapshot.document.signals.find((signal) => signal.id === item.request.signalId);
          if (!currentSignal) return { signalId: item.request.signalId, stale: true };
          // Reference-clock readiness belongs to the current stable SignalId,
          // not to the document snapshot captured when this async render began.
          // A same-epoch reference-clock switch must not let the old owner
          // satisfy the readiness gate or trigger a stale refresh.
          const currentReferenceClock = latestSnapshot.document.timeline.referenceClock;
          if (item.request.signalId === currentReferenceClock) context.markOpenPhase("reference-clock-painted");
          const geometry = context.adapter.extractLocalGeometry(item.rendered);
          if (!isCurrent(item.request)) return { signalId: item.request.signalId, stale: true };
          context.geometryRegistry.maps.set(item.request.signalId, geometry);
          context.geometryRegistry.svgs.set(item.request.signalId, item.rendered.svg as SVGSVGElement);
          const boundaryGeometry = geometry.cycleBoundaryEntries?.();
          if (boundaryGeometry && boundaryGeometry.length > 0) {
            item.request.owner.dataset.cycleBoundaryGeometry = JSON.stringify(Object.fromEntries(boundaryGeometry.map((entry) => [entry.cycle, entry.position.x])));
          } else {
            delete item.request.owner.dataset.cycleBoundaryGeometry;
          }
          if (item.request.signalId === currentReferenceClock) { context.markOpenPhase("reference-geometry-ready"); referenceGeometryReady = true; }
          context.markOpenPhase("first-visible-wave-painted");
          context.invalidateSnapIndex();
          return { signalId: item.request.signalId, result: { waveDromRenders: 1, localGeometryBuilds: 1 } };
        } catch (error: unknown) {
          context.geometryRegistry.remove(item.request.signalId);
          context.invalidateSnapIndex();
          return { signalId: item.request.signalId, error };
        }
      });
      if (referenceGeometryReady) context.onReferenceGeometryReady?.();
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
