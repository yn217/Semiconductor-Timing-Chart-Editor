import type { EditorSessionController } from "./editor-session-controller.js";
import type { CanonicalDocument, Signal, SignalId, SignalValueChange } from "@timing-chart-v2/schema";
import { valueSignalWaveDomain } from "@timing-chart-v2/schema";
import type { WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { toWaveJsonWindow, type RenderedWave, type WaveDromAdapter, type WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";
import type { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import type { GeometryRegistry } from "./geometry-registry.js";
import { displayBoundaryForSource } from "./display-boundary.js";

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
}>;

export function createWaveformSurfaceProvider(context: WaveformProviderContext): WaveformSurfaceProvider {
  let signalIndexDocument: CanonicalDocument | undefined;
  let signalIndexRevision = -1;
  let signalById = new Map<SignalId, Signal>();
  return {
    ...(context.getSourceWindow ? { getSourceWindow: context.getSourceWindow } : {}),
    async mountWaveBatch(requests) {
      const requestEpoch = requests[0]?.documentEpoch;
      const isCurrent = (request: { readonly documentEpoch?: number }): boolean => request.documentEpoch === undefined || context.getDocumentEpoch() === request.documentEpoch;
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
        const displayStart = sourceWindow === undefined ? undefined : displayBoundaryForSource(mapping, sourceWindow.start, document.timeline.cycleCount);
        const displayEnd = sourceWindow === undefined ? undefined : displayBoundaryForSource(mapping, sourceWindow.end, document.timeline.cycleCount);
        const clockPeriod = displaySignal.type === "clock" ? displaySignal.generator.period : undefined;
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
          : toWaveJsonWindow(source, rendererStart, rendererEnd, sourceWindow);
        return { request, waveJson, semanticValues, error: undefined };
      });
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
          if (item.request.signalId === document.timeline.referenceClock) context.markOpenPhase("reference-clock-painted");
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
          if (item.request.signalId === document.timeline.referenceClock) { context.markOpenPhase("reference-geometry-ready"); referenceGeometryReady = true; }
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
