import { useEffect, useRef } from "react";
import { ProductionWaveDromAdapter } from "@timing-chart-v2/wavedrom-adapter";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { DefaultProjectionService, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import { StableTimingChartRenderer, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import type { CanonicalDocument, ClockSignal, CommandId, GroupId, SignalId, ValueSignal } from "@timing-chart-v2/schema";

// Phase 5 Stable Waveform Surface acceptance probe (#277). Test/dev-only
// harness code, not part of normal production bootstrap -- see main.tsx,
// which loads this module only behind an explicit `?probe=stable` query
// string, via a dynamic import so it never lands in the normal editor's
// eagerly-loaded startup chunk. It exercises the real production
// CommandHistorySession/DefaultProjectionService/StableTimingChartRenderer
// packages, never a duplicate/alternative implementation.

const probeSignal: ValueSignal = {
  id: "sig_phase3_probe" as SignalId,
  name: "PROBE",
  type: "logic",
  role: "internal",
  source: { instancePath: [], signalName: "PROBE" },
  display: { name: "PROBE" },
  values: [{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 5, value: 0 }],
};

const clockProbe: ClockSignal = {
  id: "sig_phase4_clock" as SignalId, name: "CLOCK", type: "clock", role: "input",
  source: { instancePath: [], signalName: "CLOCK" }, display: { name: "CLOCK" },
  generator: { start: 0, period: 2, duty: 0.5, phase: 0.5, initial: 0, polarity: "positive" },
  edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } },
};

const stableDocument: CanonicalDocument = {
  formatVersion: 2,
  document: {
    id: "phase5-probe", title: "Phase 5 probe",
    header: { subtitle: "", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] },
    footer: { figureNumber: "", revision: "", text: "" },
  },
  timeline: { start: 0, end: 8, cycleCount: 8, timeBase: "cycle", referenceClock: clockProbe.id, edge: "rising", labelAnchors: [] },
  signalGroups: [{ id: "grp_phase5" as GroupId, name: "Signals", rows: [clockProbe.id, probeSignal.id] }],
  signals: [clockProbe, probeSignal],
  bookmarks: [], timeGroups: [], annotations: [], annotationGroups: [], transactions: [], constraints: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: "left", rowHeight: 28, signalSpacing: 6, overflow: "ellipsis" },
  checkSettings: {},
};

export function StableSurfaceProbe() {
  const host = useRef<HTMLDivElement>(null);
  const reorder = useRef<() => void>(() => undefined);
  const toggleViewport = useRef<() => void>(() => undefined);
  useEffect(() => {
    const rendererHost = host.current;
    if (!rendererHost) return;
    const session = new CommandHistorySession(stableDocument);
    const adapter = new ProductionWaveDromAdapter();
    const projectionService = new DefaultProjectionService();
    const provider: WaveformSurfaceProvider = {
      async mountWave(signalId, owner) {
        const document = session.getSnapshot().document;
        const signal = document.signals.find((item) => item.id === signalId);
        if (!signal) throw new Error(`Signal '${signalId}' is missing.`);
        const waveJson = adapter.toWaveJson({ signal, cycleCount: document.timeline.cycleCount });
        const rendered = await adapter.renderWave(signalId, waveJson, owner);
        adapter.extractLocalGeometry(rendered);
        return { waveDromRenders: 1, localGeometryBuilds: 1 };
      },
      disposeWave(signalId) { adapter.dispose(signalId); },
    };
    const renderer = new StableTimingChartRenderer(provider);
    renderer.mount(rendererHost);
    let viewport: VirtualizationWindow = { viewportStartY: 0, viewportEndY: 500, overscanBefore: 0, overscanAfter: 0, pinnedRowIds: [] };
    let projection: RenderProjection = projectionService.project({ snapshot: session.getSnapshot(), changeSet: { fullDocumentReplace: true }, viewport });
    renderer.update(projection);
    void renderer.whenIdle().then(() => { rendererHost.dataset.phase5Ready = "true"; });
    reorder.current = () => {
      const result = session.execute({ id: "cmd_phase5_reorder" as CommandId, type: "signal.move", signalId: probeSignal.id, targetGroupId: "grp_phase5" as GroupId, index: 0 });
      if (!result.ok) {
        rendererHost.dataset.reorderError = result.problems.map((item) => item.code).join(",");
        return;
      }
      projection = projectionService.project({ snapshot: result.snapshot, changeSet: result.changeSet, viewport, previous: projection });
      renderer.update(projection);
      void renderer.whenIdle().then(() => { rendererHost.dataset.reordered = "true"; });
    };
    toggleViewport.current = () => {
      const narrow = viewport.viewportEndY > 20;
      viewport = { ...viewport, viewportEndY: narrow ? 20 : 500 };
      projection = projectionService.project({ snapshot: session.getSnapshot(), changeSet: {}, viewport, previous: projection });
      renderer.update(projection);
      rendererHost.dataset.viewport = narrow ? "narrow" : "expanded";
    };
    return () => renderer.dispose();
  }, []);
  return <main><h1>Timing Chart Editor V2</h1><p>Phase 5 Stable Waveform Surface probe</p><button type="button" data-testid="viewport" onClick={() => toggleViewport.current()}>Toggle viewport</button><button type="button" data-testid="reorder" onClick={() => reorder.current()}>Move PROBE above CLOCK</button><div ref={host} data-testid="surface-host" /></main>;
}
