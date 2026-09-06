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
  // Density fix (#402/#426 follow-up): a native <details>/<summary> still
  // reserves its own closed-state row even collapsed; a plain toggle button
  // sitting on the same line as the heading below costs nothing extra when
  // closed, and the advanced fields (Initial/Active level, Phase,
  // Suppressed periods) render only when actually opened.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const effectiveWidth = widthMode === "duty" ? Math.min(period - 1, Math.max(1, Math.round(duty * period))) : width;
  // #402: Draft->Apply -- Generate must stay disabled once the computed
  // candidate waveform is byte-for-byte identical to the Signal's current
  // `values`, so re-submitting an unchanged Draft can't manufacture an
  // empty History entry. Computed only for the enabled/indicator check;
  // Generate itself still always recomputes fresh from the live Draft on
  // submit (this comparison is never itself dispatched as a command).
  let hasChanges = true;
  try {
    const candidate = generateSignalPulseValues({ start, initial, active, width: effectiveWidth, period, repeat: repeatMode === "infinite" ? "infinite" : repeatCount, phase, suppressedPeriods: parseSuppressedPeriods(suppressedPeriods), cycleCount });
    hasChanges = JSON.stringify(candidate) !== JSON.stringify(signal.values);
  } catch { hasChanges = true; } // an invalid Draft is always "changed" -- Apply itself will report the real validation error on submit.
  return <div className="signal-generator">
    <div className="signal-generator-head">
      <h2>Generate Waveform</h2>
      <button type="button" className="signal-generator-advanced-toggle" aria-expanded={advancedOpen} data-testid="signal-generator-advanced-toggle" onClick={() => setAdvancedOpen((open) => !open)}>{advancedOpen ? "Hide advanced" : "Advanced"}</button>
    </div>
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
      {/* Bottom Panel Visual Reference pass (#402/#426), follow-up density
          fix: the 10 fields below used to stack in one flex column (~10
          full-height rows), pushing the Transitions table below the fold on
          first paint. Three changes bring this down to 2 compact rows by
          default: (1) `.signal-generator-grid label` lays each label's text
          to the *left* of its control (one line each) instead of stacked
          above it; (2) the grid packs 3 fields per row instead of 1 or 2;
          (3) only the fields a waveform *always* needs (Start, Width-or-
          Duty, Period, Repeat) stay in this always-visible grid -- Initial/
          Active level (sensible 0/1 defaults already cover the common
          pulse), Phase and Suppressed periods render in a second such grid
          only once `advancedOpen` is toggled true (button in
          `.signal-generator-head`, next to the heading). Every field is
          still reachable, just not forced open by default (progressive
          disclosure, not deleted functionality). */}
      {/* Visual Quality Closure pass (#402/#426): every label caption here
          is now wrapped in its own <span> with `flex-shrink: 0` (CSS) --
          without it, a flex row's *text node* is just as shrinkable as its
          sibling <input>/<select>, so a narrow grid column would shrink the
          nowrap caption below its own content width and clip it mid-word
          ("Width/Du…", "Repeat co…" in the reported screenshot). The input/
          select stays the flexible, `min-width: 0` side instead -- captions
          never lose characters, the *control* is what narrows. "Mode" and
          "Count" (rather than "Width/Duty" and "Repeat count") free up
          real width for that control without hiding meaning: the Mode
          select's own options already read "Width"/"Duty", and "Count" is
          read together with the "Repeat" mode select right before it. */}
      <div className="signal-generator-grid">
        <label><span>Start</span><input aria-label="Signal generator start" type="number" min="0" step="1" value={start} onChange={(event) => setStart(Number(event.target.value))} /></label>
        <label><span>Period</span><input aria-label="Signal generator period" type="number" min="1" step="1" value={period} onChange={(event) => setPeriod(Number(event.target.value))} /></label>
        <label><span>Mode</span><select aria-label="Signal generator width mode" value={widthMode} onChange={(event) => setWidthMode(event.target.value as typeof widthMode)}><option value="width">Width</option><option value="duty">Duty</option></select></label>
        {widthMode === "width"
          ? <label><span>Width</span><input aria-label="Signal generator width" type="number" min="1" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
          : <label><span>Duty</span><input aria-label="Signal generator duty" type="number" min="0.01" max="0.99" step="0.01" value={duty} onChange={(event) => setDuty(Number(event.target.value))} /></label>}
        <label><span>Repeat</span><select aria-label="Signal generator repeat mode" value={repeatMode} onChange={(event) => setRepeatMode(event.target.value as typeof repeatMode)}><option value="finite">Count</option><option value="infinite">Infinite</option></select></label>
        {repeatMode === "finite" && <label><span>Count</span><input aria-label="Signal generator repeat count" type="number" min="1" step="1" value={repeatCount} onChange={(event) => setRepeatCount(Number(event.target.value))} /></label>}
      </div>
      {advancedOpen && <div className="signal-generator-grid" data-testid="signal-generator-advanced-fields">
        <label><span>Initial</span><select aria-label="Signal generator initial level" value={initial} onChange={(event) => setInitial(Number(event.target.value) as 0 | 1)}><option value={0}>0</option><option value={1}>1</option></select></label>
        <label><span>Active</span><select aria-label="Signal generator active level" value={active} onChange={(event) => setActive(Number(event.target.value) as 0 | 1)}><option value={0}>0</option><option value={1}>1</option></select></label>
        <label><span>Phase</span><input aria-label="Signal generator phase" type="number" step="1" value={phase} onChange={(event) => setPhase(Number(event.target.value))} /></label>
        <label><span>Suppressed</span><input aria-label="Signal generator suppressed periods" value={suppressedPeriods} placeholder="e.g. 1, 3" onChange={(event) => setSuppressedPeriods(event.target.value)} /></label>
      </div>}
      <div className="signal-generator-footer">
        {error && <output className="editor-problem" role="alert" data-testid="signal-generator-error">{error}</output>}
        {status && !error && <output data-testid="signal-generator-status">{status}</output>}
        {/* Visual Quality Closure pass, Section 9: this indicator is scoped
            to the Generator's own Draft (a candidate waveform not yet
            applied) -- distinct from a Transition row's Draft and from
            Inspector's Signal Properties Draft, so its wording says which
            one it is instead of a bare, ambiguous "Unapplied changes". */}
        {hasChanges && <output className="draft-unapplied-indicator" data-testid="signal-generator-unapplied">● Generator: unapplied changes</output>}
        <button type="submit" data-testid="apply-signal-generator" disabled={!hasChanges}>Generate</button>
      </div>
    </form>
  </div>;
}
