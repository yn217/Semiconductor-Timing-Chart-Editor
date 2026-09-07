import { useEffect, useRef, useState } from "react";
import type { Bookmark, ClockGenerator, ClockSignal, EdgeCounterSettings, SignalId } from "@timing-chart-v2/schema";
import { parseSuppressedPeriods } from "../runtime/clock-input.js";
import { serializeClockSettings } from "../runtime/clock-settings.js";
import { RibbonIcon } from "../ribbon-icon.js";
import type { SignalEditorCommandActions } from "../application/editor-surface-command-controller.js";

export function ClockGeneratorEditor({ signal, bookmarks, commands, onDuplicate, onPreview }: { readonly signal: ClockSignal; readonly bookmarks: readonly Bookmark[]; readonly commands: Pick<SignalEditorCommandActions, "updateClockGenerator" | "updateEdgeCounter">; readonly onDuplicate: (signalId: SignalId) => void; readonly onPreview: (draft: ClockGenerator | undefined) => void }) {
  const [generator, setGenerator] = useState<ClockGenerator>(signal.generator);
  const [edgeCounter, setEdgeCounter] = useState<EdgeCounterSettings>(signal.edgeCounter);
  const [suppressedPeriods, setSuppressedPeriods] = useState((signal.generator.suppressedPeriods ?? []).join(", "));
  const [generatorError, setGeneratorError] = useState("");
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setGenerator(signal.generator);
    setEdgeCounter(signal.edgeCounter);
    setSuppressedPeriods((signal.generator.suppressedPeriods ?? []).join(", "));
    setGeneratorError("");
  }, [signal.id, signal.generator, signal.edgeCounter]);
  // Preview reflects the CURRENT draft generator on the real, selected Clock
  // row's waveform via a pure DOM-only path (see refreshClockPreview in
  // runtime/presentation-preview.ts) -- Canonical/History/Dirty stay
  // untouched; nothing here calls onCommand. Toggling Preview off, editing a
  // different Signal (this component remounts on signal.id, see the parent's
  // `key`), or any canonical revision change (Apply/Undo/Redo/Open/New --
  // same remount mechanism) always reverts to the real canonical waveform.
  useEffect(() => {
    onPreview(preview ? generator : undefined);
    return () => onPreview(undefined);
  }, [preview, generator, onPreview]);
  const number = (key: "start" | "period" | "duty" | "phase", value: string) => setGenerator({ ...generator, [key]: Number(value) });
  const exportSettings = () => { const blob = new Blob([serializeClockSettings(signal.id, signal.name, generator, edgeCounter)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${signal.name || signal.id}-clock.json`; anchor.click(); URL.revokeObjectURL(url); };
  const importSettings = (file: File) => { const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)) as { generator?: ClockGenerator; edgeCounter?: EdgeCounterSettings }; if (parsed.generator) setGenerator(parsed.generator); if (parsed.edgeCounter) setEdgeCounter(parsed.edgeCounter); } catch { /* Invalid imports remain transient and do not enter the command path. */ } }; reader.readAsText(file); };
  const setCountFrom = (countFrom: EdgeCounterSettings["countFrom"]) => setEdgeCounter((current) => {
    const anchorId = countFrom === "marker" ? current.anchorId ?? bookmarks[0]?.id : current.anchorId;
    if (anchorId === undefined) {
      const { anchorId: _anchorId, ...withoutAnchor } = current;
      return { ...withoutAnchor, countFrom };
    }
    return { ...current, countFrom, anchorId };
  });
  const setAnchorId = (anchorId: string | undefined) => setEdgeCounter((current) => {
    if (anchorId === undefined) {
      const { anchorId: _previousAnchorId, ...withoutAnchor } = current;
      return withoutAnchor;
    }
    return { ...current, anchorId };
  });
  // #426: neither form here had any Draft/dirty gating at all -- both
  // Apply buttons were always enabled regardless of whether the draft
  // actually differed from the committed Signal, and neither showed the
  // "unapplied changes" indicator every other Bottom editor's own Draft
  // now shows. Generator and Edge Counter stay two independent Applies
  // (they commit two different SemanticCommand types onto one Signal,
  // not one shared Draft), so each gets its own dirty check rather than
  // a single combined one. The generator comparison mirrors the exact
  // normalization the submit handler below performs (parsed suppressed
  // periods, `suppressedPeriods` present only when non-empty) so the
  // button disables precisely when Apply would be a no-op.
  const normalizedDraftGenerator = (() => {
    try {
      const parsedSuppressedPeriods = parseSuppressedPeriods(suppressedPeriods);
      const { suppressedPeriods: _previousSuppressedPeriods, ...generatorWithoutSuppression } = generator;
      return parsedSuppressedPeriods.length === 0 ? generatorWithoutSuppression : { ...generatorWithoutSuppression, suppressedPeriods: parsedSuppressedPeriods };
      // An unparseable "Suppressed periods" draft is, definitionally, not
      // equal to whatever is committed -- fall through to `null`, which
      // JSON.stringify never equals the committed generator's JSON, so
      // Apply stays enabled and clicking it surfaces the same parse error
      // via the existing try/catch in the submit handler below.
    } catch { return null; }
  })();
  const generatorChanged = JSON.stringify(normalizedDraftGenerator) !== JSON.stringify(signal.generator);
  const edgeCounterChanged = JSON.stringify(edgeCounter) !== JSON.stringify(signal.edgeCounter);
  return <div className="clock-editor">
    <div className="event-toolbar" role="toolbar" aria-label="Clock context commands" data-testid="clock-context-toolbar">
      <span className="clock-context-label">Signal: {signal.display.name}    Type: Clock</span>
      <button type="button" className="bottom-action" onClick={() => setPresetsOpen((current) => !current)} aria-pressed={presetsOpen} data-testid="clock-presets"><RibbonIcon name="i-settings" /><span>Presets</span></button>
      <button type="button" className="bottom-action" onClick={() => onDuplicate(signal.id)} data-testid="clock-duplicate"><RibbonIcon name="i-duplicate" /><span>Duplicate</span></button>
      <button type="button" className="bottom-action" onClick={() => fileInput.current?.click()} data-testid="clock-import"><RibbonIcon name="i-import" /><span>Import...</span></button>
      <button type="button" className="bottom-action" onClick={exportSettings} data-testid="clock-export"><RibbonIcon name="i-export" /><span>Export...</span></button>
      <button type="button" className="bottom-action" onClick={() => setPreview((current) => !current)} aria-pressed={preview} data-testid="clock-preview"><RibbonIcon name="i-preview" /><span>Preview</span></button>
      <input ref={fileInput} hidden type="file" accept="application/json,.json" aria-label="Import clock settings" onChange={(event) => { const file = event.target.files?.[0]; if (file) importSettings(file); event.currentTarget.value = ""; }} />
      {presetsOpen && <div className="event-presets" role="group" aria-label="Clock presets"><button type="button" onClick={() => setGenerator({ ...generator, duty: 0.5 })}>50% duty</button><button type="button" onClick={() => setGenerator({ ...generator, duty: 0.25 })}>25% duty</button></div>}
      {preview && <output className="event-preview" data-testid="clock-preview-status">Preview only · canonical data unchanged</output>}
    </div>
    <form className="clock-generator" aria-label="Clock Generator" noValidate onSubmit={(event) => {
      event.preventDefault();
      try {
        const parsedSuppressedPeriods = parseSuppressedPeriods(suppressedPeriods);
        const { suppressedPeriods: _previousSuppressedPeriods, ...generatorWithoutSuppression } = generator;
        const nextGenerator: ClockGenerator = parsedSuppressedPeriods.length === 0 ? generatorWithoutSuppression : { ...generatorWithoutSuppression, suppressedPeriods: parsedSuppressedPeriods };
        const result = commands.updateClockGenerator(signal.id, nextGenerator);
        if (result.ok) setGeneratorError("");
        else setGeneratorError(result.problems.map((problem) => `${problem.code}: ${problem.message}`).join(" ") || "Clock Generator update rejected.");
      } catch (error) {
        setGeneratorError(error instanceof Error ? error.message : "Invalid suppressed periods.");
      }
    }}>
      <h2>Clock Generator</h2>
      <label>Start<input aria-label="Clock start" type="number" min="0" step="1" value={generator.start} onChange={(event) => number("start", event.target.value)} /></label>
      <label>Period<input aria-label="Clock period" type="number" min="1" step="1" value={generator.period} onChange={(event) => number("period", event.target.value)} /></label>
      <label>Duty<input aria-label="Clock duty" type="number" min="0.01" max="1" step="0.01" value={generator.duty} onChange={(event) => number("duty", event.target.value)} /></label>
      <label>Phase<input aria-label="Clock phase" type="number" step="0.5" value={generator.phase} onChange={(event) => number("phase", event.target.value)} /></label>
      <label>Initial<select aria-label="Clock initial" value={generator.initial} onChange={(event) => setGenerator({ ...generator, initial: Number(event.target.value) as 0 | 1 })}><option value="0">0</option><option value="1">1</option></select></label>
      <label>Polarity<select aria-label="Clock polarity" value={generator.polarity} onChange={(event) => setGenerator({ ...generator, polarity: event.target.value as ClockGenerator["polarity"] })}><option value="positive">Positive</option><option value="negative">Negative</option></select></label>
      <label>Suppressed periods<input aria-label="Clock suppressed periods" value={suppressedPeriods} placeholder="e.g. 1, 3" onChange={(event) => setSuppressedPeriods(event.target.value)} /></label>
      {generatorError && <output className="editor-problem" role="alert" data-testid="clock-generator-error">{generatorError}</output>}
      {generatorChanged && <output className="draft-unapplied-indicator" data-testid="clock-generator-unapplied">● Unapplied changes</output>}
      <button type="submit" data-testid="apply-clock-generator" disabled={!generatorChanged}>Apply generator</button>
    </form>
    <form className="clock-edge-counter" aria-label="Clock Edge Counter" onSubmit={(event) => {
      event.preventDefault();
      commands.updateEdgeCounter(signal.id, edgeCounter);
    }}>
      <h2>Edge Counter</h2>
      <label className="check-label">Show<input aria-label="Clock edge counter show" type="checkbox" checked={edgeCounter.show} onChange={(event) => setEdgeCounter({ ...edgeCounter, show: event.target.checked })} /></label>
      <label>Mode<select aria-label="Clock edge counter mode" value={edgeCounter.mode} onChange={(event) => setEdgeCounter({ ...edgeCounter, mode: event.target.value as EdgeCounterSettings["mode"] })}><option value="rising">Rising</option><option value="falling">Falling</option><option value="both">Both</option></select></label>
      <label>Start Number<input aria-label="Clock edge counter start" type="number" value={edgeCounter.startNumber} onChange={(event) => setEdgeCounter({ ...edgeCounter, startNumber: Number(event.target.value) })} /></label>
      <label>Count From<select aria-label="Clock edge counter count from" value={edgeCounter.countFrom} onChange={(event) => setCountFrom(event.target.value as EdgeCounterSettings["countFrom"])}><option value="signal-start">Signal start</option><option value="selected-edge">Selected edge</option><option value="marker" disabled={bookmarks.length === 0}>Marker</option><option value="visible-range-start">Visible range start</option></select></label>
      {edgeCounter.countFrom === "marker" && <label>Marker<select aria-label="Clock edge counter marker" value={edgeCounter.anchorId ?? ""} onChange={(event) => setAnchorId(event.target.value || undefined)} disabled={bookmarks.length === 0}><option value="">Select Bookmark</option>{bookmarks.map((bookmark) => <option key={bookmark.id} value={bookmark.id}>{bookmark.name} · cycle {bookmark.start}</option>)}</select></label>}
      <label>Every N<input aria-label="Clock edge counter every" type="number" min="1" value={edgeCounter.labelEvery} onChange={(event) => setEdgeCounter({ ...edgeCounter, labelEvery: Number(event.target.value) })} /></label>
      <label>Position<select aria-label="Clock edge counter position" value={edgeCounter.position} onChange={(event) => setEdgeCounter({ ...edgeCounter, position: event.target.value as EdgeCounterSettings["position"] })}><option value="above">Above</option><option value="below">Below</option></select></label>
      <label>X Offset<input aria-label="Clock edge counter X offset" type="number" value={edgeCounter.offset.x} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, x: Number(event.target.value) } })} /></label>
      <label>Y Offset<input aria-label="Clock edge counter Y offset" type="number" value={edgeCounter.offset.y} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, y: Number(event.target.value) } })} /></label>
      {edgeCounterChanged && <output className="draft-unapplied-indicator" data-testid="clock-edge-counter-unapplied">● Unapplied changes</output>}
      <button type="submit" data-testid="apply-clock-edge-counter" disabled={!edgeCounterChanged}>Apply edge counter</button>
    </form>
  </div>;
}
