import { useEffect, useRef, useState } from "react";
import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import { CommandHistorySession } from "@timing-chart-v2/history";
import { DefaultProjectionService, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import { StableTimingChartRenderer, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import type { CanonicalDocument, ClockSignal, GroupId, SignalId, SignalRole, ValueSignal } from "@timing-chart-v2/schema";
import { ProductionWaveDromAdapter } from "@timing-chart-v2/wavedrom-adapter";

const signalId = (value: string) => value as SignalId;
const groupId = (value: string) => value as GroupId;

const clock: ClockSignal = {
  id: signalId("sig_cycle_clock"), name: "CLOCK", type: "clock", role: "input",
  source: { instancePath: ["dut"], signalName: "clock" }, display: { name: "CLOCK" },
  generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" },
  edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } },
};

function valueSignal(id: string, name: string, role: SignalRole, values: ValueSignal["values"], options: Pick<ValueSignal, "type" | "width" | "displayFormat"> = { type: "binary" }): ValueSignal {
  return {
    id: signalId(id), name, role, type: options.type,
    source: { instancePath: ["dut"], signalName: name.toLowerCase() }, display: { name }, values,
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.displayFormat === undefined ? {} : { displayFormat: options.displayFormat }),
  };
}

const signals: readonly (ClockSignal | ValueSignal)[] = [
  clock,
  valueSignal("sig_cycle_reset_n", "RESET_N", "input", [{ start: 0, value: 0 }, { start: 2, value: 1 }]),
  valueSignal("sig_cycle_request", "REQUEST", "input", [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }]),
  valueSignal("sig_cycle_ready", "READY", "output", [{ start: 0, value: 0 }, { start: 5, value: 1 }, { start: 8, value: 0 }]),
  valueSignal("sig_cycle_valid", "VALID", "output", [{ start: 0, value: 0 }, { start: 6, value: 1 }, { start: 9, value: 0 }]),
  valueSignal("sig_cycle_data", "DATA[7:0]", "input", [{ start: 0, value: "00" }, { start: 3, value: "A5" }, { start: 7, value: "5A" }], { type: "bus", width: 8, displayFormat: "hex" }),
  valueSignal("sig_cycle_result", "RESULT[7:0]", "output", [{ start: 0, value: "00" }, { start: 6, value: "A5" }, { start: 9, value: "5A" }], { type: "bus", width: 8, displayFormat: "hex" }),
  valueSignal("sig_cycle_state", "STATE", "internal", [{ start: 0, value: "IDLE" }, { start: 3, value: "WAIT" }, { start: 6, value: "DONE" }], { type: "state" }),
];

const cycleDocument: CanonicalDocument = {
  formatVersion: 2,
  document: {
    id: "minimal-cycle-view", title: "Semiconductor Timing Chart",
    header: { subtitle: "Canonical document preview", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] },
    footer: { figureNumber: "", revision: "V2", text: "" },
  },
  timeline: { start: 0, end: 24, cycleCount: 24, timeBase: "cycle", referenceClock: clock.id, edge: "rising", labelAnchors: [] },
  signalGroups: [
    { id: groupId("grp_cycle_control"), name: "Control", rows: signals.slice(0, 5).map((signal) => signal.id), spacingAfter: 8 },
    { id: groupId("grp_cycle_payload"), name: "Payload", rows: signals.slice(5).map((signal) => signal.id), spacingBefore: 4 },
  ],
  signals,
  bookmarks: [], timeGroups: [], annotations: [], transactions: [], constraints: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
  checkSettings: {},
};

export function MinimalCycleView() {
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [selectedName, setSelectedName] = useState("None");

  useEffect(() => {
    const rendererHost = host.current;
    const viewportElement = viewport.current;
    const rulerElement = ruler.current;
    if (!rendererHost || !viewportElement || !rulerElement) return;

    const session = new CommandHistorySession(cycleDocument);
    const adapter = new ProductionWaveDromAdapter();
    const projectionService = new DefaultProjectionService();
    let referenceGeometry: LocalGeometryMap | undefined;
    const provider: WaveformSurfaceProvider = {
      async mountWave(id, owner) {
        const document = session.getSnapshot().document;
        const signal = document.signals.find((candidate) => candidate.id === id);
        if (!signal) throw new Error(`Signal '${id}' is missing.`);
        const rendered = await adapter.renderWave(id, adapter.toWaveJson({ signal, cycleCount: document.timeline.cycleCount }), owner);
        const geometry = adapter.extractLocalGeometry(rendered);
        if (id === document.timeline.referenceClock) referenceGeometry = geometry;
        return { waveDromRenders: 1, localGeometryBuilds: 1 };
      },
      disposeWave(id) { adapter.dispose(id); },
    };
    const renderer = new StableTimingChartRenderer(provider);
    renderer.mount(rendererHost);
    const initialSnapshot = session.getSnapshot();
    let window: VirtualizationWindow = viewportWindow(viewportElement);
    let projection: RenderProjection = projectionService.project({ snapshot: initialSnapshot, changeSet: { fullDocumentReplace: true }, viewport: window });
    renderer.update(projection);

    const publishState = () => {
      rendererHost.dataset.canonicalRevision = String(session.getSnapshot().revision);
      rendererHost.dataset.historyDepth = "0";
    };
    publishState();

    void renderer.whenIdle().then(() => {
      if (!rendererHost.isConnected) return;
      buildRuler(rulerElement, referenceGeometry, cycleDocument.timeline.cycleCount, clock.id);
      rendererHost.dataset.cycleViewReady = "true";
    });

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = viewportWindow(viewportElement);
        if (next.viewportStartY === window.viewportStartY && next.viewportEndY === window.viewportEndY) return;
        window = next;
        projection = projectionService.project({ snapshot: session.getSnapshot(), changeSet: {}, viewport: window, previous: projection });
        renderer.update(projection);
        rendererHost.dataset.viewportStartY = String(window.viewportStartY);
      });
    };
    const onSelect = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-row-id]") : null;
      const id = target?.dataset.rowId;
      if (!id || !id.startsWith("sig_")) return;
      const signal = cycleDocument.signals.find((candidate) => candidate.id === id);
      if (!signal) return;
      for (const row of rendererHost.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]")) {
        const selected = row.dataset.rowId === id || row.dataset.signalId === id;
        row.dataset.selected = String(selected);
        row.setAttribute("aria-selected", String(selected));
      }
      rendererHost.dataset.selectedSignalId = id;
      setSelectedName(signal.display.name);
      publishState();
    };
    viewportElement.addEventListener("scroll", onScroll, { passive: true });
    rendererHost.addEventListener("click", onSelect);
    return () => {
      cancelAnimationFrame(frame);
      viewportElement.removeEventListener("scroll", onScroll);
      rendererHost.removeEventListener("click", onSelect);
      renderer.dispose();
    };
  }, []);

  return <main className="editor-shell">
    <header className="app-header">
      <div><p className="eyebrow">TIMING CHART EDITOR V2</p><h1>Semiconductor Timing Chart</h1></div>
      <span className="view-chip">Cycle View</span>
    </header>
    <section className="cycle-panel" aria-label="Minimal Cycle View">
      <div className="column-headings" aria-hidden="true"><span>Signal tree</span><span>Role / signal</span><span>Cycle waveform</span></div>
      <div className="cycle-viewport" ref={viewport} data-testid="cycle-viewport">
        <div className="cycle-ruler" ref={ruler} data-testid="cycle-ruler" aria-label="Cycle ruler" />
        <div className="surface-host" ref={host} data-testid="cycle-surface" />
      </div>
    </section>
    <footer className="status-bar">
      <span>Selected: <strong data-testid="selection-status">{selectedName}</strong></span>
      <span>Canonical revision 0</span><span>Read-only cycle projection</span>
    </footer>
  </main>;
}

function viewportWindow(viewport: HTMLElement): VirtualizationWindow {
  const bodyTop = Math.max(0, viewport.scrollTop - 34);
  return {
    viewportStartY: bodyTop,
    viewportEndY: bodyTop + viewport.clientHeight,
    overscanBefore: 48,
    overscanAfter: 48,
    pinnedRowIds: [],
  };
}

function buildRuler(element: HTMLElement, geometry: LocalGeometryMap | undefined, cycles: number, referenceSignalId: SignalId): void {
  if (!geometry) {
    element.dataset.geometryError = "Reference-clock geometry unavailable";
    return;
  }
  const ticks: HTMLElement[] = [];
  let finalX = 0;
  for (let cycle = 0; cycle <= cycles; cycle += 1) {
    const point = geometry.find({ signalId: referenceSignalId, cycle, point: "cycle-start" })?.point;
    if (!point) continue;
    const tick = element.ownerDocument.createElement("span");
    tick.dataset.cycle = String(cycle);
    tick.style.left = `${point.x}px`;
    tick.textContent = String(cycle);
    ticks.push(tick);
    finalX = point.x;
  }
  element.replaceChildren(...ticks);
  element.dataset.source = "local-geometry";
  element.parentElement?.style.setProperty("--wave-width", `${Math.ceil(finalX + 24)}px`);
}
