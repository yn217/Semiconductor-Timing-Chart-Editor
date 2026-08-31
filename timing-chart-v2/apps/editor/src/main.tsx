import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ProductionWaveDromAdapter, WAVEDROM_VERSION } from "@timing-chart-v2/wavedrom-adapter";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { DefaultProjectionService, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import { StableTimingChartRenderer, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import type { CanonicalDocument, ClockSignal, CommandId, GroupId, SignalId, ValueSignal } from "@timing-chart-v2/schema";
import { MinimalCycleView } from "./minimal-cycle-view.js";
import { MinimalCycleViewNextProbe } from "./minimal-cycle-view-next-probe.js";
import "./styles.css";

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

const busProbe: ValueSignal = {
  id: "sig_phase4_bus" as SignalId, name: "BUS", type: "bus", role: "internal", width: 8, displayFormat: "hex",
  source: { instancePath: [], signalName: "BUS" }, display: { name: "BUS" },
  values: [{ start: 0, value: "00" }, { start: 3, value: "A5" }],
};

function ArchitectureProbe() {
  const mount = useRef<HTMLDivElement>(null);
  const clockMount = useRef<HTMLDivElement>(null);
  const busMount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const owner = mount.current;
    const clockOwner = clockMount.current;
    const busOwner = busMount.current;
    if (!owner || !clockOwner || !busOwner) return;
    const adapter = new ProductionWaveDromAdapter();
    const waveJson = adapter.toWaveJson({ signal: probeSignal, cycleCount: 8 });
    void adapter.renderWave(probeSignal.id, waveJson, owner).then((rendered) => {
      const geometry = adapter.extractLocalGeometry(rendered);
      const read = (cycle: number, point: "cycle-start" | "cycle-center" | "transition-start" | "transition-center" | "transition-end" | "rising-edge" | "falling-edge" | "value-start") =>
        geometry.find({ signalId: probeSignal.id, cycle, point })?.point;
      const selected = {
        cycleStart: read(2, "cycle-start"),
        cycleCenter: read(2, "cycle-center"),
        transitionStart: read(2, "transition-start"),
        transitionCenter: read(2, "transition-center"),
        transitionEnd: read(2, "transition-end"),
        valueStart: read(2, "value-start"),
        rising: read(2, "rising-edge"),
        falling: read(5, "falling-edge"),
      };
      owner.setAttribute("data-local-geometry", JSON.stringify(selected));
      owner.setAttribute("data-geometry-builds", String(adapter.metrics().geometryBuilds));
      owner.setAttribute("data-geometry-matrix-reads", String(adapter.metrics().geometryMatrixReads));
    }).catch((error: unknown) => {
      owner.setAttribute("data-wave-error", error instanceof Error ? error.message : "Unknown WaveDrom render failure");
    });
    const clockJson = adapter.toWaveJson({ signal: clockProbe, cycleCount: 8 });
    void adapter.renderWave(clockProbe.id, clockJson, clockOwner).then((rendered) => {
      const geometry = adapter.extractLocalGeometry(rendered);
      clockOwner.setAttribute("data-local-geometry", JSON.stringify({
        rising: geometry.find({ signalId: clockProbe.id, cycle: 2, point: "rising-edge" })?.point,
        falling: geometry.find({ signalId: clockProbe.id, cycle: 1, point: "falling-edge" })?.point,
        cycleStart: geometry.find({ signalId: clockProbe.id, cycle: 2, point: "cycle-start" })?.point,
      }));
    }).catch((error: unknown) => clockOwner.setAttribute("data-wave-error", error instanceof Error ? error.message : "Unknown WaveDrom render failure"));
    const busJson = adapter.toWaveJson({ signal: busProbe, cycleCount: 8 });
    void adapter.renderWave(busProbe.id, busJson, busOwner).then((rendered) => {
      const geometry = adapter.extractLocalGeometry(rendered);
      busOwner.setAttribute("data-local-geometry", JSON.stringify({
        transitionStart: geometry.find({ signalId: busProbe.id, cycle: 3, point: "transition-start" })?.point,
        transitionEnd: geometry.find({ signalId: busProbe.id, cycle: 3, point: "transition-end" })?.point,
        valueStart: geometry.find({ signalId: busProbe.id, cycle: 3, point: "value-start" })?.point,
      }));
    }).catch((error: unknown) => busOwner.setAttribute("data-wave-error", error instanceof Error ? error.message : "Unknown WaveDrom render failure"));
    return () => {
      adapter.dispose(probeSignal.id);
      adapter.dispose(clockProbe.id);
      adapter.dispose(busProbe.id);
    };
  }, []);
  return <main><h1>Timing Chart Editor V2</h1><p>Phase 4 Local Geometry probe — WaveDrom {WAVEDROM_VERSION}</p><div ref={mount} data-testid="wave-mount" /><div ref={clockMount} data-testid="clock-mount" /><div ref={busMount} data-testid="bus-mount" /></main>;
}

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
  bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { roleColumnWidth: 32, signalNameWidth: 168, signalNameAlign: "left", rowHeight: 28, signalSpacing: 6, overflow: "ellipsis" },
  checkSettings: {},
};

function StableSurfaceProbe() {
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

const root = document.getElementById("root");
if (!root) throw new Error("Editor root is missing");
const probe = new URLSearchParams(window.location.search).get("probe");
const next = new URLSearchParams(window.location.search).get("implementation") === "next";
createRoot(root).render(<StrictMode>{probe === "geometry" ? <ArchitectureProbe /> : probe === "stable" ? <StableSurfaceProbe /> : next ? <MinimalCycleViewNextProbe /> : <MinimalCycleView />}</StrictMode>);
