import { useState } from "react";
import type { GroupId } from "@timing-chart-v2/schema";
import { ClockGeneratorEditor } from "./clock-generator-editor.js";
import { CommentRowEditor } from "./comment-row-editor.js";
import { EventTable } from "./event-table.js";
import { SignalGeneratorEditor } from "./signal-generator-editor.js";
import { nextCommandId } from "./command-id.js";
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
  return <section className="signal-editor" aria-label="Signal Editor" data-testid="signal-editor" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <div className="editor-tabbar">
      <span className="editor-tab active">Signal</span>
      <span className="editor-selection">{signal ? `${signal.display.name} · ${signal.type}` : "Select a signal to edit"}</span>
      {/* Bottom Panel Visual Reference pass (#402/#426): Undo/Redo/Cancel/
          Hide/Delete stay here rather than moving into an overflow menu --
          they are a small, established, heavily-tested header row shared
          across every Bottom tab (Annotation/Transaction/Bookmark editors
          use the identical convention), and hiding them behind a menu
          would touch that shared convention project-wide for a Signal-
          specific visual pass. Kept, just visually compact (bottom-
          editor.css). What actually moved: everything that used to sit
          *below* this row (the property form, the old fixed Group button
          list) -- see the removed `.signal-properties` form and
          `.group-drop-targets` block below. */}
      <button type="button" onClick={onUndo} disabled={!history.canUndo} data-testid="editor-undo">Undo</button>
      <button type="button" onClick={onRedo} disabled={!history.canRedo} data-testid="editor-redo">Redo</button>
      {signal && <><button type="button" data-testid="cancel-bottom-draft" onClick={onCancel}>Cancel</button><button type="button" onClick={() => onVisibility(signal.id, signal.display.visible === false)} data-testid="signal-visibility">{signal.display.visible === false ? "Show signal" : "Hide signal"}</button><button type="button" className="danger" onClick={onDelete} data-testid="signal-delete">Delete signal</button></>}
    </div>
    {/* Bottom Panel Visual Reference pass: the old fixed "Drop into group
        [Control] [Payload] [Scratch]" button row is removed -- a fixed
        column of Group buttons is exactly what the Reference layout (and
        the Issue's explicit "固定Group button列は禁止") rules out. Dragging
        an arbitrary Left Tree row onto another row already within the
        target Group still works unchanged (TreeDragInteractionOwner, Left
        Tree-internal, unrelated to this removed Bottom-only target list);
        moving the *currently selected* Signal into any Group -- including
        an empty one, which that internal drag can't reach on its own --
        is what this compact dropdown + Move covers instead. */}
    {signal && <div className="signal-context-header">
      <label>Group
        <select aria-label="Signal group" value={resolvedTargetGroupId} onChange={(event) => setTargetGroupId(event.target.value)}>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.id === currentGroup?.id ? " (current)" : ""}</option>)}
        </select>
      </label>
      <button type="button" data-testid="move-signal-to-group" disabled={!resolvedTargetGroupId || resolvedTargetGroupId === currentGroup?.id} onClick={() => onDropToGroup("signal", signal.id, resolvedTargetGroupId as GroupId)}>Move</button>
    </div>}
    {problem && <div className="editor-problem" role="alert" data-testid="editor-problem">{problem}</div>}
    {!signal ? <div className="editor-empty">Choose a row in Signal Tree or Role / Signal to open its canonical data.</div> : <>
      {signal.type === "clock" ? <ClockGeneratorEditor signal={signal} bookmarks={bookmarks} onCommand={onCommand} onDuplicate={onDuplicate} onPreview={onClockPreview} />
        : signal.type === "commentRow" ? <CommentRowEditor signal={signal} onCommand={onCommand} onCancel={onCancel} nextCommandId={nextCommandId} />
        // Bottom Panel Visual Reference pass: Generator is no longer a
        // Manual/Generator *tab* that hides the Transition editor while
        // active -- it renders alongside Add/Edit Transition and Value
        // Helper in one always-visible row (EventTable's own
        // `generatorSlot`), matching the Reference's side-by-side layout
        // instead of pushing the table down behind a mode switch. Scoped
        // to canonical type `binary` ("Signal") only, matching #400's own
        // scope; every other value-signal type keeps using the Event
        // Table alone exactly as before.
        : <EventTable signal={signal} cycleCount={cycleCount} onCommand={onCommand} generatorSlot={signal.type === "binary" ? <SignalGeneratorEditor signal={signal} cycleCount={cycleCount} onCommand={onCommand} /> : undefined} />}
    </>}
  </section>;
}
