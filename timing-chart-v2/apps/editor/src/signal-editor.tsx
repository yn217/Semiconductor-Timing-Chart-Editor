import { useState } from "react";
import type { Bookmark, GroupId, SignalRole, Signal, ValueSignal } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";
import { InlineNameInput } from "./inline-name-input.js";
import { ClockGeneratorEditor } from "./clock-generator-editor.js";
import { CommentRowEditor } from "./comment-row-editor.js";
import { EventTable } from "./event-table.js";
import { SignalGeneratorEditor } from "./signal-generator-editor.js";
import { type SignalEditorProps } from "./timeline-toolbar.js";

export function SignalEditor({ signal, cycleCount, bookmarks, history, groups, problem, onCommand, onUndo, onRedo, onVisibility, onDelete, onDuplicate, onDropToGroup, onCancel, onClockPreview }: SignalEditorProps) {
  // #402: the Signal's *current* Group, derived from the live document
  // every render (never cached) -- the single source of truth for both
  // the "current group" check-state and the safe fallback below.
  const currentGroup = signal ? groups.find((group) => group.rows.includes(signal.id)) : undefined;
  const [targetGroupId, setTargetGroupId] = useState(currentGroup?.id ?? "");
  // #402: Group candidates are derived from the live document every
  // render (never a fixed/cached array), so a Group added/renamed/removed
  // elsewhere is reflected immediately. If the previously selected target
  // Group no longer exists (deleted mid-selection) or nothing was
  // selected yet, fall back to the Signal's current Group rather than
  // holding a stale ID that could resolve to nothing (or, worse, a
  // different Group that reused the same array index).
  const resolvedTargetGroupId = groups.some((group) => group.id === targetGroupId) ? targetGroupId : (currentGroup?.id ?? "");
  const [name, setName] = useState(signal?.display.name ?? "");
  const [role, setRole] = useState<SignalRole>(signal?.role ?? "internal");
  const [signalType, setSignalType] = useState<ValueSignal["type"]>(signal?.type === "clock" || signal?.type === "commentRow" ? "binary" : signal?.type ?? "binary");
  const [width, setWidth] = useState(signal?.type === "bus" ? signal.width ?? 1 : 1);
  const [format, setFormat] = useState<"hex" | "binary" | "symbolic">(signal?.type === "bus" ? signal.displayFormat ?? "hex" : "hex");
  const [spacingBefore, setSpacingBefore] = useState(signal?.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(signal?.spacingAfter ?? 0);
  // #402: see the Apply-button comment below for why `name` is excluded.
  const hasPropertyChanges = signal !== undefined && (
    role !== signal.role
    || signalType !== (signal.type === "clock" || signal.type === "commentRow" ? "binary" : signal.type)
    || (signalType === "bus" && signal.type === "bus" && (width !== (signal.width ?? 1) || format !== (signal.displayFormat ?? "hex")))
    || spacingBefore !== (signal.spacingBefore ?? 0)
    || spacingAfter !== (signal.spacingAfter ?? 0)
  );
  // #400: Manual/Generator is a transient editor-mode choice, not a
  // persisted canonical field -- this component remounts (key includes the
  // selected signal id) whenever the selection changes, so it always
  // starts back on Manual. Scoped to canonical type `binary` ("Signal")
  // only, matching the issue's own scope; every other value-signal type
  // keeps using the Manual Event Table exactly as before.
  const [waveformSource, setWaveformSource] = useState<"manual" | "generator">("manual");
  return <section className="signal-editor" aria-label="Signal Editor" data-testid="signal-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <div className="editor-tabbar">
      <span className="editor-tab active">Signal</span>
      <span className="editor-selection">{signal ? `${signal.display.name} · ${signal.type}` : "Select a signal to edit"}</span>
      <button type="button" onClick={onUndo} disabled={!history.canUndo} data-testid="editor-undo">Undo</button>
      <button type="button" onClick={onRedo} disabled={!history.canRedo} data-testid="editor-redo">Redo</button>
      {signal && <><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button><button type="button" onClick={() => onVisibility(signal.id, signal.display.visible === false)} data-testid="signal-visibility">{signal.display.visible === false ? "Show signal" : "Hide signal"}</button><button type="button" className="danger" onClick={onDelete} data-testid="signal-delete">Delete signal</button></>}
    </div>
    {signal && <div className="group-move-picker">
      <label>Group
        <select aria-label="Signal group" value={resolvedTargetGroupId} onChange={(event) => setTargetGroupId(event.target.value)}>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.id === currentGroup?.id ? " (current)" : ""}</option>)}
        </select>
      </label>
      <button type="button" data-testid="move-signal-to-group" disabled={!resolvedTargetGroupId || resolvedTargetGroupId === currentGroup?.id} onClick={() => onDropToGroup("signal", signal.id, resolvedTargetGroupId as GroupId)}>Move</button>
    </div>}
    {/* #402: Group candidates for this dropdown come from the same live
        `groups` prop as the drag-and-drop targets just below -- both read
        the current canonical `signalGroups`, so a Group added/renamed/
        removed elsewhere is reflected in both immediately, with no second
        Group listing/derivation. The existing drop-target row (drag a Left
        Tree row onto a Group) stays as an additional, already-tested
        interaction (see tests/e2e/reorder-visibility.spec.ts's drag-drop
        coverage) -- this dropdown adds the ability to move the *currently
        selected* Signal to a Group without a drag gesture, per #402. */}
    <div className="group-drop-targets" role="list" aria-label="Signal groups">
      <span>Drop into group</span>
      {groups.map((group) => <button
        type="button"
        role="listitem"
        key={group.id}
        data-group-target={group.id}
        onDragOver={(event) => { event.preventDefault(); event.currentTarget.dataset.dropActive = "true"; }}
        onDragLeave={(event) => { delete event.currentTarget.dataset.dropActive; }}
        onDrop={(event) => {
          event.preventDefault();
          delete event.currentTarget.dataset.dropActive;
          const payload = event.dataTransfer.getData("text/plain");
          const separator = payload.indexOf(":");
          const kind = payload.slice(0, separator);
          if (separator > 0 && (kind === "signal" || kind === "group")) onDropToGroup(kind, payload.slice(separator + 1), group.id);
        }}
      >{group.name}<small>{group.rows.length}</small></button>)}
    </div>
    {problem && <div className="editor-problem" role="alert" data-testid="editor-problem">{problem}</div>}
    {!signal ? <div className="editor-empty">Choose a row in Signal Tree or Role / Signal to open its canonical data.</div> : <>
      {/* #402: Apply must stay disabled while the Draft is byte-for-byte
          identical to the committed Signal, so a no-op submit can't
          manufacture an empty History entry. `name` is deliberately
          excluded here -- the Name field's own inline-rename path
          (InlineNameInput's `onRename`) already commits immediately on
          its own gesture (blur/Enter), independent of this form's Apply;
          comparing it here would make Apply spuriously "changed" while
          the rename it's tracking has already been applied through that
          separate path. */}
      <form className="signal-properties" onSubmit={(event) => {
        event.preventDefault();
        if (!hasPropertyChanges) return;
        onCommand({ id: nextCommandId("properties"), type: "signal.updateProperties", signalId: signal.id, name, role, signalType, ...(signalType === "bus" ? { width, displayFormat: format } : {}), spacingBefore, spacingAfter });
      }}>
        <label>Name<InlineNameInput value={signal?.display.name ?? ""} ariaLabel="Signal name" onRename={(nextName) => signal ? onCommand({ id: nextCommandId("bottom_signal_rename"), type: "signal.rename", signalId: signal.id, name: nextName }) : { ok: false, reason: "no-op", problems: [] }} onCommitted={setName} onDraftChange={setName} /></label>
        <label>Role<select aria-label="Signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
        <label>Type<select aria-label="Signal type" value={signalType} onChange={(event) => setSignalType(event.target.value as ValueSignal["type"])}><option value="binary">Signal</option><option value="bus">Bus</option><option value="state">State</option><option value="logic">Level</option><option value="event">Event</option>{
          // #400: Pulse is legacy-only -- never offered as a type to switch
          // *into*, but a signal that already is Pulse must stay editable
          // (including its own Type field staying visibly "Pulse") rather
          // than silently losing its own current value from this list.
          signal?.type === "pulse" && <option value="pulse">Pulse (legacy)</option>
        }</select></label>
        {signalType === "bus" && <><label>Width<input aria-label="Signal width" type="number" min="1" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>Display<select aria-label="Bus display format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="hex">Hex</option><option value="binary">Binary</option><option value="symbolic">Symbol</option></select></label></>}
        {signal.type !== "commentRow" && <><label>Spacing Before<input aria-label="Signal spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label><label>Spacing After<input aria-label="Signal spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label></>}
        <button type="submit" data-testid="save-signal-properties" disabled={!hasPropertyChanges}>Apply properties</button>
      </form>
      {signal.type === "clock" ? <ClockGeneratorEditor signal={signal} bookmarks={bookmarks} onCommand={onCommand} onDuplicate={onDuplicate} onPreview={onClockPreview} />
        : signal.type === "commentRow" ? <CommentRowEditor signal={signal} onCommand={onCommand} onCancel={onCancel} nextCommandId={nextCommandId} />
        : signal.type === "binary" ? <>
          <div className="waveform-source-tabs" role="tablist" aria-label="Waveform source">
            <button type="button" role="tab" aria-selected={waveformSource === "manual"} data-testid="waveform-source-manual" onClick={() => setWaveformSource("manual")}>Manual</button>
            <button type="button" role="tab" aria-selected={waveformSource === "generator"} data-testid="waveform-source-generator" onClick={() => setWaveformSource("generator")}>Generator</button>
          </div>
          {waveformSource === "manual" ? <EventTable signal={signal} cycleCount={cycleCount} onCommand={onCommand} /> : <SignalGeneratorEditor signal={signal} cycleCount={cycleCount} onCommand={onCommand} />}
        </>
        : <EventTable signal={signal} cycleCount={cycleCount} onCommand={onCommand} />}
    </>}
  </section>;
}
