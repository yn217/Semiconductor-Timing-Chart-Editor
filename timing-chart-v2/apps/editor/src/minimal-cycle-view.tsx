import { useEffect, useRef, useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import { CommandHistorySession, type HistoryState } from "@timing-chart-v2/history";
import { DefaultProjectionService, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import { StableTimingChartRenderer, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import type { CanonicalDocument, ClockGenerator, ClockSignal, CommandId, GroupId, Signal, SignalId, SignalRole, ValueSignal } from "@timing-chart-v2/schema";
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
  const execute = useRef<(command: SemanticCommand) => void>(() => undefined);
  const undo = useRef<() => void>(() => undefined);
  const redo = useRef<() => void>(() => undefined);
  const [selectedId, setSelectedId] = useState<SignalId | undefined>();
  const [snapshot, setSnapshot] = useState<CanonicalSnapshot>({ revision: 0, document: cycleDocument });
  const [history, setHistory] = useState<HistoryState>({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, dirty: false });
  const [problem, setProblem] = useState("");
  const selectedSignal = snapshot.document.signals.find((signal) => signal.id === selectedId);

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
      rendererHost.dataset.historyDepth = String(session.historyState().undoDepth);
    };
    publishState();

    void renderer.whenIdle().then(() => {
      if (!rendererHost.isConnected) return;
      buildRuler(rulerElement, referenceGeometry, session.getSnapshot().document.timeline.cycleCount, clock.id);
      rendererHost.dataset.cycleViewReady = "true";
    });

    const applyResult = (result: ReturnType<CommandHistorySession["execute"]>) => {
      if (!result.ok) {
        setProblem(result.problems.map((item) => item.message).join(" "));
        return;
      }
      delete rendererHost.dataset.editorIdle;
      projection = projectionService.project({ snapshot: result.snapshot, changeSet: result.changeSet, viewport: window, previous: projection });
      renderer.update(projection);
      setSnapshot(result.snapshot);
      setHistory(session.historyState());
      setProblem("");
      publishState();
      void renderer.whenIdle().then(() => {
        if (!rendererHost.isConnected) return;
        buildRuler(rulerElement, referenceGeometry, result.snapshot.document.timeline.cycleCount, clock.id);
        rendererHost.dataset.editorIdle = "true";
      });
    };
    execute.current = (command) => applyResult(session.execute(command));
    undo.current = () => applyResult(session.undo());
    redo.current = () => applyResult(session.redo());

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
      const signal = session.getSnapshot().document.signals.find((candidate) => candidate.id === id);
      if (!signal) return;
      for (const row of rendererHost.querySelectorAll<HTMLElement>("[data-row-id], [data-signal-id]")) {
        const selected = row.dataset.rowId === id || row.dataset.signalId === id;
        row.dataset.selected = String(selected);
        row.setAttribute("aria-selected", String(selected));
      }
      rendererHost.dataset.selectedSignalId = id;
      setSelectedId(signal.id);
      publishState();
    };
    viewportElement.addEventListener("scroll", onScroll, { passive: true });
    rendererHost.addEventListener("click", onSelect);
    return () => {
      cancelAnimationFrame(frame);
      viewportElement.removeEventListener("scroll", onScroll);
      rendererHost.removeEventListener("click", onSelect);
      execute.current = () => undefined;
      undo.current = () => undefined;
      redo.current = () => undefined;
      renderer.dispose();
    };
  }, []);

  return <main className="editor-shell">
    <header className="app-header">
      <div><p className="eyebrow">TIMING CHART EDITOR V2</p><h1>Semiconductor Timing Chart</h1></div>
      <span className="view-chip">Cycle View</span>
    </header>
    <section className="cycle-panel" aria-label="Cycle View">
      <div className="column-headings" aria-hidden="true"><span>Signal tree</span><span>Role / signal</span><span>Cycle waveform</span></div>
      <div className="cycle-viewport" ref={viewport} data-testid="cycle-viewport">
        <div className="cycle-ruler" ref={ruler} data-testid="cycle-ruler" aria-label="Cycle ruler" />
        <div className="surface-host" ref={host} data-testid="cycle-surface" />
      </div>
    </section>
    <SignalEditor
      key={`${selectedSignal?.id ?? "none"}:${snapshot.revision}`}
      signal={selectedSignal}
      cycleCount={snapshot.document.timeline.cycleCount}
      history={history}
      problem={problem}
      onCommand={(command) => execute.current(command)}
      onUndo={() => undo.current()}
      onRedo={() => redo.current()}
    />
    <footer className="status-bar">
      <span>Selected: <strong data-testid="selection-status">{selectedSignal?.display.name ?? "None"}</strong></span>
      <span data-testid="revision-status">Canonical revision {snapshot.revision}</span>
      <span data-testid="history-status">History {history.undoDepth} / Redo {history.redoDepth}</span>
      <span>{history.dirty ? "Modified" : "Clean"}</span>
    </footer>
  </main>;
}

interface SignalEditorProps {
  readonly signal: Signal | undefined;
  readonly cycleCount: number;
  readonly history: HistoryState;
  readonly problem: string;
  readonly onCommand: (command: SemanticCommand) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}

function SignalEditor({ signal, cycleCount, history, problem, onCommand, onUndo, onRedo }: SignalEditorProps) {
  const [name, setName] = useState(signal?.display.name ?? "");
  const [role, setRole] = useState<SignalRole>(signal?.role ?? "internal");
  const [format, setFormat] = useState<"hex" | "binary" | "symbolic">(signal?.type === "bus" ? signal.displayFormat ?? "hex" : "hex");
  return <section className="signal-editor" aria-label="Signal Editor" data-testid="signal-editor">
    <div className="editor-tabbar">
      <button type="button" className="editor-tab active">Signal</button>
      <span className="editor-selection">{signal ? `${signal.display.name} · ${signal.type}` : "Select a signal to edit"}</span>
      <button type="button" onClick={onUndo} disabled={!history.canUndo} data-testid="editor-undo">Undo</button>
      <button type="button" onClick={onRedo} disabled={!history.canRedo} data-testid="editor-redo">Redo</button>
    </div>
    {problem && <div className="editor-problem" role="alert" data-testid="editor-problem">{problem}</div>}
    {!signal ? <div className="editor-empty">Choose a row in Signal Tree or Role / Signal to open its canonical data.</div> : <>
      <form className="signal-properties" onSubmit={(event) => {
        event.preventDefault();
        onCommand({ id: nextCommandId("properties"), type: "signal.updateProperties", signalId: signal.id, name, role, ...(signal.type === "bus" ? { displayFormat: format } : {}) });
      }}>
        <label>Name<input aria-label="Signal name" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Role<select aria-label="Signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
        {signal.type === "bus" && <label>Display<select aria-label="Bus display format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="hex">Hex</option><option value="binary">Binary</option><option value="symbolic">Symbol</option></select></label>}
        <button type="submit" data-testid="save-signal-properties">Apply properties</button>
      </form>
      {signal.type === "clock" ? <ClockGeneratorEditor signal={signal} onCommand={onCommand} /> : signal.type === "commentRow" ? <div className="editor-empty">Comment rows are edited in a later context editor.</div> : <EventTable signal={signal} cycleCount={cycleCount} onCommand={onCommand} />}
    </>}
  </section>;
}

function ClockGeneratorEditor({ signal, onCommand }: { readonly signal: ClockSignal; readonly onCommand: (command: SemanticCommand) => void }) {
  const [generator, setGenerator] = useState<ClockGenerator>(signal.generator);
  const number = (key: "start" | "period" | "duty" | "phase", value: string) => setGenerator({ ...generator, [key]: Number(value) });
  return <form className="clock-generator" aria-label="Clock Generator" onSubmit={(event) => {
    event.preventDefault();
    onCommand({ id: nextCommandId("clock"), type: "signal.updateClockGenerator", signalId: signal.id, generator });
  }}>
    <h2>Clock Generator</h2>
    <label>Start<input aria-label="Clock start" type="number" min="0" step="1" value={generator.start} onChange={(event) => number("start", event.target.value)} /></label>
    <label>Period<input aria-label="Clock period" type="number" min="1" step="1" value={generator.period} onChange={(event) => number("period", event.target.value)} /></label>
    <label title="Pinned WaveDrom supports 50% duty only">Duty<input aria-label="Clock duty" type="number" value={generator.duty} disabled /></label>
    <label>Phase<input aria-label="Clock phase" type="number" step="0.5" value={generator.phase} onChange={(event) => number("phase", event.target.value)} /></label>
    <label>Initial<select aria-label="Clock initial" value={generator.initial} onChange={(event) => setGenerator({ ...generator, initial: Number(event.target.value) as 0 | 1 })}><option value="0">0</option><option value="1">1</option></select></label>
    <label>Polarity<select aria-label="Clock polarity" value={generator.polarity} onChange={(event) => setGenerator({ ...generator, polarity: event.target.value as ClockGenerator["polarity"] })}><option value="positive">Positive</option><option value="negative">Negative</option></select></label>
    <button type="submit" data-testid="apply-clock-generator">Apply generator</button>
  </form>;
}

function EventTable({ signal, cycleCount, onCommand }: { readonly signal: ValueSignal; readonly cycleCount: number; readonly onCommand: (command: SemanticCommand) => void }) {
  const [start, setStart] = useState(0);
  const [value, setValue] = useState(quickValue(signal));
  return <div className="event-editor">
    <div className="event-heading"><h2>Event Table</h2><span>End and duration are derived</span></div>
    <div className="event-table" role="table" aria-label="Signal events">
      <div className="event-row event-columns" role="row"><span>Start</span><span>Value</span><span>End</span><span>Duration</span><span>Comment</span><span>Actions</span></div>
      {signal.values.map((change, index) => <EventRow key={change.start} signal={signal} change={change} end={signal.values[index + 1]?.start ?? cycleCount} onCommand={onCommand} />)}
    </div>
    <form className="event-add" onSubmit={(event) => {
      event.preventDefault();
      onCommand({ id: nextCommandId("add_value"), type: "signal.updateValue", signalId: signal.id, start, value });
    }}>
      <label>Start<input aria-label="New event start" type="number" min="0" max={cycleCount - 1} step="1" value={start} onChange={(event) => setStart(Number(event.target.value))} /></label>
      <label>Value<input aria-label="New event value" value={value} onChange={(event) => setValue(event.target.value)} /></label>
      <QuickValues signal={signal} setValue={setValue} />
      <button type="submit" data-testid="add-signal-event">Add / replace event</button>
    </form>
  </div>;
}

function EventRow({ signal, change, end, onCommand }: { readonly signal: ValueSignal; readonly change: ValueSignal["values"][number]; readonly end: number; readonly onCommand: (command: SemanticCommand) => void }) {
  const [start, setStart] = useState(change.start);
  const [value, setValue] = useState(String(change.value));
  const [comment, setComment] = useState(change.comment ?? "");
  return <form className="event-row" role="row" onSubmit={(event) => {
    event.preventDefault();
    onCommand({ id: nextCommandId("replace_value"), type: "signal.replaceValue", signalId: signal.id, fromStart: change.start, start, value, ...(comment ? { comment } : {}) });
  }}>
    <input aria-label={`Start ${change.start}`} type="number" min="0" step="1" value={start} onChange={(event) => setStart(Number(event.target.value))} />
    <input aria-label={`Value ${change.start}`} value={value} onChange={(event) => setValue(event.target.value)} />
    <output>{end}</output><output>{end - change.start}</output>
    <input aria-label={`Comment ${change.start}`} value={comment} onChange={(event) => setComment(event.target.value)} />
    <span className="event-actions"><button type="submit">Save</button><button type="button" onClick={() => onCommand({ id: nextCommandId("remove_value"), type: "signal.removeValue", signalId: signal.id, start: change.start })}>Remove</button></span>
  </form>;
}

function QuickValues({ signal, setValue }: { readonly signal: ValueSignal; readonly setValue: (value: string) => void }) {
  const values = signal.type === "binary" || signal.type === "logic" ? ["0", "1", "X", "Z"] : signal.type === "bus" ? ["Hex", "Binary", "Symbol", "X", "Z"] : ["IDLE", "ACTIVE", "X", "Z"];
  return <div className="quick-values" role="group" aria-label="Quick values">{values.map((item) => <button type="button" key={item} onClick={() => setValue(item === "Hex" ? "00" : item === "Binary" ? "00000000" : item === "Symbol" ? "VALUE" : item)}>{item}</button>)}</div>;
}

function quickValue(signal: ValueSignal): string {
  if (signal.type === "bus") return signal.displayFormat === "binary" ? "00000000" : "00";
  if (signal.type === "state") return "IDLE";
  return "0";
}

let commandSequence = 0;
function nextCommandId(scope: string): CommandId {
  commandSequence += 1;
  return `cmd_phase7_${scope}_${commandSequence}` as CommandId;
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
