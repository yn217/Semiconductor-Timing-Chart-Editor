import type { EditorSessionController } from "./editor-session-controller.js";
import type { CanonicalDocument, Signal, SignalId, SignalValueChange } from "@timing-chart-v2/schema";
import { valueSignalWaveDomain } from "@timing-chart-v2/schema";
import type { WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { type RenderedWave, type WaveDromAdapter, type WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";
import type { DisplayTimeMappingCache } from "@timing-chart-v2/projection";
import type { GeometryRegistry } from "./geometry-registry.js";

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
}>;

export function createWaveformSurfaceProvider(context: WaveformProviderContext): WaveformSurfaceProvider {
  let signalIndexDocument: CanonicalDocument | undefined;
  let signalIndexRevision = -1;
  let signalById = new Map<SignalId, Signal>();
  return {
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
        return { request, waveJson: context.adapter.toWaveJson({ signal: displaySignal, cycleCount: mapping.displayCycleCount }), semanticValues, error: undefined };
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
