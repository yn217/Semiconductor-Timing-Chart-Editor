import { useState } from "react";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { ValueSignal } from "@timing-chart-v2/schema";
import { parseSuppressedPeriods } from "./runtime/clock-input.js";
import { generateSignalPulseValues } from "./runtime/signal-generator.js";
import { nextCommandId } from "./command-id.js";

// #400: Signal Generator produces single/finite/periodic pulses. It is a
// pure computation (see runtime/signal-generator.ts for why), committed as
// an ordinary `values` array through the same `signal.replaceValues`
// command the Manual Event Table already uses -- Generate replaces the
// Signal's entire waveform in one atomic, undoable step, exactly like
// Import already does.
export function SignalGeneratorEditor({ signal, cycleCount, onCommand }: { readonly signal: ValueSignal; readonly cycleCount: number; readonly onCommand: (command: SemanticCommand) => CommandResult }) {
  const [start, setStart] = useState(0);
  const [initial, setInitial] = useState<0 | 1>(0);
  const [active, setActive] = useState<0 | 1>(1);
  const [widthMode, setWidthMode] = useState<"width" | "duty">("width");
  const [width, setWidth] = useState(1);
  const [duty, setDuty] = useState(0.5);
  const [period, setPeriod] = useState(4);
  const [repeatMode, setRepeatMode] = useState<"finite" | "infinite">("finite");
  const [repeatCount, setRepeatCount] = useState(1);
  const [phase, setPhase] = useState(0);
  const [suppressedPeriods, setSuppressedPeriods] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const effectiveWidth = widthMode === "duty" ? Math.min(period - 1, Math.max(1, Math.round(duty * period))) : width;
  return <div className="signal-generator">
    <div className="event-heading"><h2>Signal Generator</h2><span>Single, finite or periodic pulses -- computed once into the Signal's ordinary values</span></div>
    <form className="signal-generator-form" aria-label="Signal Generator" noValidate onSubmit={(event) => {
      event.preventDefault();
      try {
        const parsedSuppressed = parseSuppressedPeriods(suppressedPeriods);
        const values = generateSignalPulseValues({ start, initial, active, width: effectiveWidth, period, repeat: repeatMode === "infinite" ? "infinite" : repeatCount, phase, suppressedPeriods: parsedSuppressed, cycleCount });
        const result = onCommand({ id: nextCommandId("signal_generator"), type: "signal.replaceValues", signalId: signal.id, values });
        if (result.ok) { setError(""); setStatus(`Generated ${values.length} change point${values.length === 1 ? "" : "s"}.`); }
        else { setStatus(""); setError(result.problems.map((problem) => `${problem.code}: ${problem.message}`).join(" ") || "Signal Generator rejected."); }
      } catch (thrown) {
        setStatus("");
        setError(thrown instanceof Error ? thrown.message : "Invalid Signal Generator parameters.");
      }
    }}>
      <label>Start<input aria-label="Signal generator start" type="number" min="0" step="1" value={start} onChange={(event) => setStart(Number(event.target.value))} /></label>
      <label>Initial level<select aria-label="Signal generator initial level" value={initial} onChange={(event) => setInitial(Number(event.target.value) as 0 | 1)}><option value={0}>0</option><option value={1}>1</option></select></label>
      <label>Active level<select aria-label="Signal generator active level" value={active} onChange={(event) => setActive(Number(event.target.value) as 0 | 1)}><option value={0}>0</option><option value={1}>1</option></select></label>
      <label>Width or Duty<select aria-label="Signal generator width mode" value={widthMode} onChange={(event) => setWidthMode(event.target.value as typeof widthMode)}><option value="width">Width</option><option value="duty">Duty</option></select></label>
      {widthMode === "width"
        ? <label>Width<input aria-label="Signal generator width" type="number" min="1" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
        : <label>Duty<input aria-label="Signal generator duty" type="number" min="0.01" max="0.99" step="0.01" value={duty} onChange={(event) => setDuty(Number(event.target.value))} /></label>}
      <label>Period<input aria-label="Signal generator period" type="number" min="1" step="1" value={period} onChange={(event) => setPeriod(Number(event.target.value))} /></label>
      <label>Repeat<select aria-label="Signal generator repeat mode" value={repeatMode} onChange={(event) => setRepeatMode(event.target.value as typeof repeatMode)}><option value="finite">Count</option><option value="infinite">Infinite</option></select></label>
      {repeatMode === "finite" && <label>Repeat count<input aria-label="Signal generator repeat count" type="number" min="1" step="1" value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))} /></label>}
      <label>Phase<input aria-label="Signal generator phase" type="number" step="1" value={phase} onChange={(event) => setPhase(Number(event.target.value))} /></label>
      <label>Suppressed periods<input aria-label="Signal generator suppressed periods" value={suppressedPeriods} placeholder="e.g. 1, 3" onChange={(event) => setSuppressedPeriods(event.target.value)} /></label>
      {error && <output className="editor-problem" role="alert" data-testid="signal-generator-error">{error}</output>}
      {status && !error && <output data-testid="signal-generator-status">{status}</output>}
      <button type="submit" data-testid="apply-signal-generator">Generate</button>
    </form>
  </div>;
}
