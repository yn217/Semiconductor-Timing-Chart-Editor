import { useRef, useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { BookmarkId, CanonicalDocument, GroupId, Signal, SignalGroup, SignalId, TimeGroup, TimeGroupId } from "@timing-chart-v2/schema";
import type { HistoryState } from "@timing-chart-v2/history";
import type { CommandResult } from "@timing-chart-v2/commands";
import { nextCommandId } from "./command-id.js";
import { nextEntityId } from "./entity-id.js";
import { EditorIconButton } from "./editor-icon.js";
import { RibbonIcon } from "./ribbon-icon.js";

export function TimelineToolbar({ document, range, onRange, onCommand, onCommandBatch, onNavigateBookmark }: { readonly document: CanonicalDocument; readonly range: { readonly start: number; readonly end: number }; readonly onRange: (range: { start: number; end: number }) => void; readonly onCommand: (command: SemanticCommand) => void; readonly onCommandBatch: (commands: readonly SemanticCommand[]) => void; readonly onNavigateBookmark: (cycle: number) => void }) {
  const [count, setCount] = useState(1);
  const [destination, setDestination] = useState(8);
  const [editingGroupId, setEditingGroupId] = useState<TimeGroupId>();
  const editingGroup = document.timeGroups.find((group) => group.id === editingGroupId);
  const [groupName, setGroupName] = useState("");
  const [groupStart, setGroupStart] = useState(0);
  const [groupEnd, setGroupEnd] = useState(1);
  const [groupComment, setGroupComment] = useState("");
  const [groupFoldLabel, setGroupFoldLabel] = useState("");
  const [groupCollapsed, setGroupCollapsed] = useState(true);
  const [editingBookmarkId, setEditingBookmarkId] = useState<BookmarkId>();
  const editingBookmark = document.bookmarks.find((bookmark) => bookmark.id === editingBookmarkId);
  const [bookmarkName, setBookmarkName] = useState("");
  const [bookmarkStart, setBookmarkStart] = useState(0);
  const [bookmarkComment, setBookmarkComment] = useState("");
  const bookmarkListRef = useRef<HTMLDivElement>(null);
  const navigateBookmark = (direction: -1 | 1) => {
    const ordered = [...document.bookmarks].sort((left, right) => left.start - right.start);
    if (ordered.length === 0) return;
    const next = direction < 0
      ? [...ordered].reverse().find((bookmark) => bookmark.start < range.start) ?? ordered.at(-1)
      : ordered.find((bookmark) => bookmark.start >= range.end) ?? ordered[0];
    if (next) onNavigateBookmark(next.start);
  };
  const applyBookmark = () => {
    if (!editingBookmark) return;
    onCommand({ id: nextCommandId("bookmark_update"), type: "bookmark.update", bookmarkId: editingBookmark.id, name: bookmarkName, start: bookmarkStart, comment: bookmarkComment });
    setEditingBookmarkId(undefined);
  };
  const applyTimeGroup = () => {
    if (!editingGroup) return;
    onCommand({ id: nextCommandId("time_group_update"), type: "timeGroup.update", timeGroupId: editingGroup.id, name: groupName, start: groupStart, end: groupEnd, comment: groupComment, presentation: { ...(editingGroup.presentation ?? {}), collapsed: groupCollapsed, foldStyle: groupCollapsed ? "axis-break" : "none", foldLabel: groupFoldLabel || groupName } });
    setEditingGroupId(undefined);
  };
  const setTimeGroupCollapsed = (group: TimeGroup, collapsed: boolean) => onCommand({ id: nextCommandId(collapsed ? "time_group_collapse" : "time_group_expand"), type: "timeGroup.updatePresentation", timeGroupId: group.id, presentation: { ...(group.presentation ?? {}), collapsed, foldStyle: collapsed ? "axis-break" : "none", foldLabel: group.presentation?.foldLabel || group.name } });
  const expandAllTimeGroups = () => onCommandBatch(document.timeGroups.filter((group) => group.presentation?.collapsed).map((group) => ({ id: nextCommandId("time_group_expand_all"), type: "timeGroup.updatePresentation" as const, timeGroupId: group.id, presentation: { ...(group.presentation ?? {}), collapsed: false, foldStyle: "none" as const, foldLabel: group.presentation?.foldLabel || group.name } })));
  const setBoundary = (key: "start" | "end", value: number) => {
    if (key === "start") onRange({ start: Math.max(0, Math.min(value, range.end - 1)), end: range.end });
    else onRange({ start: range.start, end: Math.min(document.timeline.cycleCount, Math.max(value, range.start + 1)) });
  };
  return <div className="timeline-toolbar" aria-label="Timeline Editor" data-testid="timeline-editor">
    <div className="timeline-subgroup timeline-range-group" data-timeline-group="Range" aria-label="Range commands">
      <label><span className="timeline-field-label">Start cycle</span><input aria-label="Timeline range start" type="number" min="0" max={document.timeline.cycleCount - 1} value={range.start} onChange={(event) => setBoundary("start", Number(event.target.value))} /></label>
      <label><span className="timeline-field-label">End cycle</span><input aria-label="Timeline range end" type="number" min="1" max={document.timeline.cycleCount} value={range.end} onChange={(event) => setBoundary("end", Number(event.target.value))} /></label>
      <output className="timeline-range-length" data-testid="timeline-selected-length">Length {Math.max(0, range.end - range.start)}</output>
      <b>Range</b>
    </div>
    <div className="timeline-subgroup timeline-insert-group" data-timeline-group="Insert" aria-label="Insert timeline commands">
      <label><span className="timeline-field-label">Count</span><input aria-label="Timeline insert count" type="number" min="1" step="1" value={count} onChange={(event) => setCount(Math.max(1, Number(event.target.value)))} /></label>
      <button type="button" aria-label="Add one cycle" data-testid="timeline-cycle-add" onClick={() => onCommand({ id: nextCommandId("timeline_add_one"), type: "timeline.insert", at: range.end, count: 1 })}><RibbonIcon name="i-plus" />Cycle Add</button>
      <button type="button" aria-label="Add N cycles" data-testid="timeline-cycle-add-many" onClick={() => onCommand({ id: nextCommandId("timeline_add_many"), type: "timeline.insert", at: range.end, count })}><RibbonIcon name="i-plus" />N Cycle Add</button>
      <button type="button" data-v1-label="サイクル挿入" onClick={() => onCommand({ id: nextCommandId("timeline_before"), type: "timeline.insert", at: range.start, count })}><RibbonIcon name="i-plus" />Insert before</button>
      <button type="button" data-v1-label="後に挿入" onClick={() => onCommand({ id: nextCommandId("timeline_after"), type: "timeline.insert", at: range.end, count })}><RibbonIcon name="i-plus" />Insert after</button>
      <button type="button" data-v1-label="範囲削除" onClick={() => onCommand({ id: nextCommandId("timeline_delete"), type: "timeline.delete", start: range.start, end: range.end })}><RibbonIcon name="i-delete" />Delete range</button>
      <b>Insert</b>
    </div>
    <div className="timeline-subgroup timeline-range-edit-group" data-timeline-group="Range Edit" aria-label="Range edit commands">
      <label><span className="timeline-field-label">From</span><output aria-label="Range edit from">{range.start}</output></label>
      <label><span className="timeline-field-label">To</span><input aria-label="Timeline destination" type="number" min="0" max={document.timeline.cycleCount} step="1" value={destination} onChange={(event) => setDestination(Math.max(0, Number(event.target.value)))} /></label>
      <button type="button" data-v1-label="範囲複製" onClick={() => onCommand({ id: nextCommandId("timeline_duplicate"), type: "timeline.duplicateRange", start: range.start, end: range.end, at: destination })}><RibbonIcon name="i-duplicate" />Duplicate to</button>
      <button type="button" data-v1-label="範囲移動" onClick={() => onCommand({ id: nextCommandId("timeline_move"), type: "timeline.moveRange", start: range.start, end: range.end, to: destination })}><RibbonIcon name="i-move-to" />Move to</button>
      <b>Range Edit</b>
    </div>
    <div className="timeline-subgroup timeline-bookmark-group" data-timeline-group="Bookmark" aria-label="Bookmark commands">
      <button type="button" aria-label="Previous bookmark" onClick={() => navigateBookmark(-1)} disabled={document.bookmarks.length === 0}><RibbonIcon name="i-chevron-left" />Previous</button>
      <button type="button" data-v1-label="ブックマーク" onClick={() => onCommand({ id: nextCommandId("marker"), type: "bookmark.create", bookmark: { id: nextEntityId("bookmark", document) as BookmarkId, name: `Marker ${range.start}`, start: range.start } })}><RibbonIcon name="i-bookmark" />Add marker</button>
      <button type="button" aria-label="Next bookmark" onClick={() => navigateBookmark(1)} disabled={document.bookmarks.length === 0}><RibbonIcon name="i-chevron-right" />Next</button>
      <button type="button" aria-label="List bookmarks" onClick={() => bookmarkListRef.current?.focus()}><RibbonIcon name="i-list" />List</button>
      <div className="timeline-objects" ref={bookmarkListRef} tabIndex={-1}>
      {document.bookmarks.map((bookmark) => <span className="timeline-bookmark" key={bookmark.id} data-bookmark-id={bookmark.id}><button type="button" data-testid={`bookmark-jump-${bookmark.id}`} onClick={() => onNavigateBookmark(bookmark.start)} title={`Jump to cycle ${bookmark.start}`}>◆ {bookmark.name}</button><button type="button" data-testid={`bookmark-edit-${bookmark.id}`} aria-label={`Edit ${bookmark.name}`} onClick={() => { setEditingBookmarkId(bookmark.id); setBookmarkName(bookmark.name); setBookmarkStart(bookmark.start); setBookmarkComment(bookmark.comment ?? ""); }}>Edit</button><EditorIconButton label={`Delete ${bookmark.name}`} icon="close" onClick={() => onCommand({ id: nextCommandId("marker_delete"), type: "bookmark.delete", bookmarkId: bookmark.id })} /></span>)}
      </div>
      <b>Bookmark</b>
    </div>
    <div className="timeline-subgroup timeline-fold-group" data-timeline-group="Fold / Break" aria-label="Fold and break commands">
      <div className="timeline-actions" aria-label="Time Group actions" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 2, left: 3, pointerEvents: "auto", position: "absolute", right: 3, top: 3 }}><button type="button" aria-label="Create Time Group" data-testid="time-group-create" onClick={() => onCommand({ id: nextCommandId("time_group_create"), type: "timeGroup.create", timeGroup: { id: nextEntityId("time", document) as TimeGroupId, name: `Group ${range.start}-${range.end}`, start: range.start, end: range.end, presentation: { collapsed: false, foldStyle: "none" } } })}><RibbonIcon name="i-plus" />Create</button>
      <button type="button" aria-label="Axis Break" data-v1-label="軸ブレーク" onClick={() => onCommand({ id: nextCommandId("gap"), type: "timeGroup.create", timeGroup: { id: nextEntityId("time", document) as TimeGroupId, name: `Gap ${range.start}-${range.end}`, start: range.start, end: range.end, presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "GAP" } } })}><RibbonIcon name="i-gap" />Break</button>
      <button type="button" aria-label="Expand All" data-testid="time-group-expand-all" onClick={expandAllTimeGroups} disabled={!document.timeGroups.some((group) => group.presentation?.collapsed)}><RibbonIcon name="i-expand" />Expand</button></div>
      <div className="timeline-objects timeline-time-groups" style={{ bottom: 18, height: 22, left: 3, overflow: "auto", position: "absolute", right: 3 }}>
        {document.timeGroups.map((group) => <span className="timeline-time-group" key={group.id} data-time-group-id={group.id}><button type="button" data-testid={`time-group-edit-${group.id}`} onClick={() => { setEditingGroupId(group.id); setGroupName(group.name); setGroupStart(group.start); setGroupEnd(group.end); setGroupComment(group.comment ?? ""); setGroupFoldLabel(group.presentation?.foldLabel ?? ""); setGroupCollapsed(group.presentation?.collapsed ?? false); }} title={`Edit ${group.name}`}>// {group.name}</button><button type="button" data-testid={`time-group-${group.presentation?.collapsed ? "expand" : "collapse"}-${group.id}`} aria-label={`${group.presentation?.collapsed ? "Expand" : "Collapse"} ${group.name}`} onClick={() => setTimeGroupCollapsed(group, !group.presentation?.collapsed)}>{group.presentation?.collapsed ? "Expand" : "Collapse"}</button><EditorIconButton label={`Delete ${group.name}`} icon="close" onClick={() => onCommand({ id: nextCommandId("gap_delete"), type: "timeGroup.delete", timeGroupId: group.id })} /></span>)}
      </div>
      <b>Fold / Break</b>
    </div>
    {editingGroup && <form className="time-group-editor" aria-label="Time Group Editor" data-testid="time-group-editor" onSubmit={(event) => { event.preventDefault(); }}><label>Name<input aria-label="Time Group name" value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><label>Start<input aria-label="Time Group start" type="number" min="0" max={document.timeline.cycleCount - 1} value={groupStart} onChange={(event) => setGroupStart(Number(event.target.value))} /></label><label>End<input aria-label="Time Group end" type="number" min="1" max={document.timeline.cycleCount} value={groupEnd} onChange={(event) => setGroupEnd(Number(event.target.value))} /></label><label>Comment<input aria-label="Time Group comment" value={groupComment} onChange={(event) => setGroupComment(event.target.value)} /></label><label>Fold label<input aria-label="Time Group fold label" value={groupFoldLabel} onChange={(event) => setGroupFoldLabel(event.target.value)} /></label><label className="check-label"><input aria-label="Time Group collapsed" type="checkbox" checked={groupCollapsed} onChange={(event) => setGroupCollapsed(event.target.checked)} />Collapsed</label><button type="button" data-testid="apply-time-group" onClick={applyTimeGroup}>Apply</button><button type="button" onClick={() => setEditingGroupId(undefined)}>Cancel</button></form>}
    {editingBookmark && <form className="bookmark-editor" aria-label="Bookmark Editor" data-testid="bookmark-editor" onSubmit={(event) => { event.preventDefault(); }}><label>Name<input aria-label="Bookmark name" value={bookmarkName} onChange={(event) => setBookmarkName(event.target.value)} /></label><label>Cycle<input aria-label="Bookmark cycle" type="number" min="0" max={document.timeline.cycleCount - 1} value={bookmarkStart} onChange={(event) => setBookmarkStart(Number(event.target.value))} /></label><label>Comment<input aria-label="Bookmark comment" value={bookmarkComment} onChange={(event) => setBookmarkComment(event.target.value)} /></label><button type="button" data-testid="apply-bookmark" onClick={applyBookmark}>Apply</button><button type="button" onClick={() => setEditingBookmarkId(undefined)}>Cancel</button></form>}
  </div>;
}
export interface SignalEditorProps {
  readonly signal: Signal | undefined;
  readonly cycleCount: number;
  readonly history: HistoryState;
  readonly groups: readonly SignalGroup[];
  readonly problem: string;
  readonly onCommand: (command: SemanticCommand) => CommandResult;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onVisibility: (signalId: SignalId, visible: boolean) => void;
  readonly onDelete: () => void;
  readonly onDuplicate: (signalId: SignalId) => void;
  readonly onDropToGroup: (kind: "signal" | "group", id: string, targetGroupId: GroupId) => void;
  readonly onCancel: () => void;
}
