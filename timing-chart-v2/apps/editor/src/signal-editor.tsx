import { useState } from "react";
import type { Bookmark, SignalRole, Signal, ValueSignal } from "@timing-chart-v2/schema";
import { nextCommandId } from "./command-id.js";
import { InlineNameInput } from "./inline-name-input.js";
import { ClockGeneratorEditor } from "./clock-generator-editor.js";
import { CommentRowEditor } from "./comment-row-editor.js";
import { EventTable } from "./event-table.js";
import { type SignalEditorProps } from "./timeline-toolbar.js";

export function SignalEditor({ signal, cycleCount, bookmarks, history, groups, problem, onCommand, onUndo, onRedo, onVisibility, onDelete, onDuplicate, onDropToGroup, onCancel, onClockPreview }: SignalEditorProps) {
  const [name, setName] = useState(signal?.display.name ?? "");
  const [role, setRole] = useState<SignalRole>(signal?.role ?? "internal");
  const [signalType, setSignalType] = useState<ValueSignal["type"]>(signal?.type === "clock" || signal?.type === "commentRow" ? "binary" : signal?.type ?? "binary");
  const [width, setWidth] = useState(signal?.type === "bus" ? signal.width ?? 1 : 1);
  const [format, setFormat] = useState<"hex" | "binary" | "symbolic">(signal?.type === "bus" ? signal.displayFormat ?? "hex" : "hex");
  const [spacingBefore, setSpacingBefore] = useState(signal?.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(signal?.spacingAfter ?? 0);
  return <section className="signal-editor" aria-label="Signal Editor" data-testid="signal-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <div className="editor-tabbar">
      <span className="editor-tab active">Signal</span>
      <span className="editor-selection">{signal ? `${signal.display.name} · ${signal.type}` : "Select a signal to edit"}</span>
      <button type="button" onClick={onUndo} disabled={!history.canUndo} data-testid="editor-undo">Undo</button>
      <button type="button" onClick={onRedo} disabled={!history.canRedo} data-testid="editor-redo">Redo</button>
      {signal && <><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button><button type="button" onClick={() => onVisibility(signal.id, signal.display.visible === false)} data-testid="signal-visibility">{signal.display.visible === false ? "Show signal" : "Hide signal"}</button><button type="button" className="danger" onClick={onDelete} data-testid="signal-delete">Delete signal</button></>}
    </div>
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
      <form className="signal-properties" onSubmit={(event) => {
        event.preventDefault();
        onCommand({ id: nextCommandId("properties"), type: "signal.updateProperties", signalId: signal.id, name, role, signalType, ...(signalType === "bus" ? { width, displayFormat: format } : {}), spacingBefore, spacingAfter });
      }}>
        <label>Name<InlineNameInput value={signal?.display.name ?? ""} ariaLabel="Signal name" onRename={(nextName) => signal ? onCommand({ id: nextCommandId("bottom_signal_rename"), type: "signal.rename", signalId: signal.id, name: nextName }) : { ok: false, reason: "no-op", problems: [] }} onCommitted={setName} onDraftChange={setName} /></label>
        <label>Role<select aria-label="Signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
        <label>Type<select aria-label="Signal type" value={signalType} onChange={(event) => setSignalType(event.target.value as ValueSignal["type"])}><option value="binary">Binary</option><option value="bus">Bus</option><option value="state">State</option><option value="logic">Logic</option><option value="event">Event</option><option value="pulse">Pulse</option></select></label>
        {signalType === "bus" && <><label>Width<input aria-label="Signal width" type="number" min="1" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>Display<select aria-label="Bus display format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="hex">Hex</option><option value="binary">Binary</option><option value="symbolic">Symbol</option></select></label></>}
        {signal.type !== "commentRow" && <><label>Spacing Before<input aria-label="Signal spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label><label>Spacing After<input aria-label="Signal spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label></>}
        <button type="submit" data-testid="save-signal-properties">Apply properties</button>
      </form>
      {signal.type === "clock" ? <ClockGeneratorEditor signal={signal} bookmarks={bookmarks} onCommand={onCommand} onDuplicate={onDuplicate} onPreview={onClockPreview} /> : signal.type === "commentRow" ? <CommentRowEditor signal={signal} onCommand={onCommand} onCancel={onCancel} nextCommandId={nextCommandId} /> : <EventTable signal={signal} cycleCount={cycleCount} onCommand={onCommand} />}
    </>}
  </section>;
}
