import { useRef, useState } from "react";
import type { SemanticCommand } from "@timing-chart-v2/commands";
import type { BookmarkId, CanonicalDocument, GroupId, Signal, SignalGroup, SignalId, TimeGroup, TimeGroupId } from "@timing-chart-v2/schema";
import type { HistoryState } from "@timing-chart-v2/history";
import type { CommandResult } from "@timing-chart-v2/commands";
import { nextCommandId } from "./command-id.js";
import { nextEntityId } from "./entity-id.js";
import { EditorIconButton } from "./editor-icon.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { DsRibbonButton, DsRibbonGroup, DsRibbonNumberInput } from "./design-system.js";

/** Timeline renders through the exact same Ds* ribbon primitives Insert and
 * Home use (DsRibbonGroup/DsRibbonButton/DsRibbonNumberInput) instead of
 * ad-hoc per-button markup -- see apps/editor/src/styles/ribbon.css's
 * .timeline-ribbon rules for the shared layout contract this consumes.
 * Every button keeps its ORIGINAL aria-label/v1Label (used by existing e2e
 * coverage and the V1-compatibility overlay) even where its visible label
 * text is now shorter -- only the on-screen wording changed, not the
 * accessible name or the underlying SemanticCommand. */
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
  const rangeLength = Math.max(0, range.end - range.start);
  return <div className="timeline-ribbon" aria-label="Timeline Editor" data-testid="timeline-editor">
    <div className="timeline-slot-group" data-timeline-group="Range" aria-label="Range commands">
      <DsRibbonGroup ariaLabel="Range" className="timeline-range-group" label="Range">
        <DsRibbonNumberInput ariaLabel="Timeline range start" label="Start cycle" min={0} max={document.timeline.cycleCount - 1} value={range.start} onChange={(value) => setBoundary("start", value)} title={`Selected range start cycle (inclusive), 0-${document.timeline.cycleCount - 1}`} />
        <DsRibbonNumberInput ariaLabel="Timeline range end" label="End cycle" min={1} max={document.timeline.cycleCount} value={range.end} onChange={(value) => setBoundary("end", value)} title={`Selected range end cycle (exclusive), 1-${document.timeline.cycleCount}`} />
        <label className="ds-control ds-ribbon-number-input" title="Number of cycles in the selected range">
          <span className="ds-ribbon-number-input__caption">Length</span>
          <output data-testid="timeline-selected-length">Length {rangeLength}</output>
        </label>
      </DsRibbonGroup>
    </div>
    <div className="timeline-slot-group" data-timeline-group="Insert" aria-label="Insert timeline commands">
      <DsRibbonGroup ariaLabel="Insert" className="timeline-insert-group" label="Insert">
        <DsRibbonNumberInput ariaLabel="Timeline insert count" label="Count" min={1} step={1} value={count} onChange={(value) => setCount(Math.max(1, value))} title="Number of cycles used by Add N / Before / After" />
        <DsRibbonButton ariaLabel="Add one cycle" dataTestId="timeline-cycle-add" icon={<RibbonIcon name="i-plus" />} onClick={() => onCommand({ id: nextCommandId("timeline_add_one"), type: "timeline.insert", at: range.end, count: 1 })} title="Insert 1 cycle after the selected range's end">Add Cycle</DsRibbonButton>
        <DsRibbonButton ariaLabel="Add N cycles" dataTestId="timeline-cycle-add-many" icon={<RibbonIcon name="i-plus" />} onClick={() => onCommand({ id: nextCommandId("timeline_add_many"), type: "timeline.insert", at: range.end, count })} title="Insert Count cycles after the selected range's end">Add N</DsRibbonButton>
        <DsRibbonButton ariaLabel="Insert before" icon={<RibbonIcon name="i-plus" />} onClick={() => onCommand({ id: nextCommandId("timeline_before"), type: "timeline.insert", at: range.start, count })} title="Insert Count cycles before the selected range's start" v1Label="サイクル挿入">Before</DsRibbonButton>
        <DsRibbonButton ariaLabel="Insert after" icon={<RibbonIcon name="i-plus" />} onClick={() => onCommand({ id: nextCommandId("timeline_after"), type: "timeline.insert", at: range.end, count })} title="Insert Count cycles after the selected range's end" v1Label="後に挿入">After</DsRibbonButton>
      </DsRibbonGroup>
    </div>
    <div className="timeline-slot-group" data-timeline-group="Range Edit" aria-label="Range edit commands">
      <DsRibbonGroup ariaLabel="Range Edit" className="timeline-range-edit-group" label="Range Edit">
        <DsRibbonNumberInput ariaLabel="Timeline destination" label="To" min={0} max={document.timeline.cycleCount} step={1} value={destination} onChange={(value) => setDestination(Math.max(0, value))} title="Destination cycle used by Duplicate / Move" />
        <DsRibbonButton ariaLabel="Delete range" icon={<RibbonIcon name="i-delete" />} onClick={() => onCommand({ id: nextCommandId("timeline_delete"), type: "timeline.delete", start: range.start, end: range.end })} title="Delete the selected range" v1Label="範囲削除">Delete</DsRibbonButton>
        <DsRibbonButton ariaLabel="Duplicate to" icon={<RibbonIcon name="i-duplicate" />} onClick={() => onCommand({ id: nextCommandId("timeline_duplicate"), type: "timeline.duplicateRange", start: range.start, end: range.end, at: destination })} title="Duplicate the selected range starting at To" v1Label="範囲複製">Duplicate</DsRibbonButton>
        <DsRibbonButton ariaLabel="Move to" icon={<RibbonIcon name="i-move-to" />} onClick={() => onCommand({ id: nextCommandId("timeline_move"), type: "timeline.moveRange", start: range.start, end: range.end, to: destination })} title="Move the selected range to start at To" v1Label="範囲移動">Move</DsRibbonButton>
      </DsRibbonGroup>
    </div>
    <div className="timeline-slot-group" data-timeline-group="Bookmark" aria-label="Bookmark commands">
      <DsRibbonGroup ariaLabel="Bookmark" className="timeline-bookmark-group" label="Bookmark">
        <DsRibbonButton ariaLabel="Previous bookmark" icon={<RibbonIcon name="i-chevron-left" />} disabled={document.bookmarks.length === 0} onClick={() => navigateBookmark(-1)} title="Jump to the previous Bookmark">Previous</DsRibbonButton>
        <DsRibbonButton ariaLabel="Add marker" icon={<RibbonIcon name="i-bookmark" />} onClick={() => onCommand({ id: nextCommandId("marker"), type: "bookmark.create", bookmark: { id: nextEntityId("bookmark", document) as BookmarkId, name: `Marker ${range.start}`, start: range.start } })} title="Add a Bookmark at the selected range's start" v1Label="ブックマーク">Add</DsRibbonButton>
        <DsRibbonButton ariaLabel="Next bookmark" icon={<RibbonIcon name="i-chevron-right" />} disabled={document.bookmarks.length === 0} onClick={() => navigateBookmark(1)} title="Jump to the next Bookmark">Next</DsRibbonButton>
        <DsRibbonButton ariaLabel="List bookmarks" icon={<RibbonIcon name="i-list" />} onClick={() => bookmarkListRef.current?.focus()} title="Focus the Bookmark list below">List</DsRibbonButton>
        <div className="timeline-objects" ref={bookmarkListRef} tabIndex={-1}>
        {document.bookmarks.map((bookmark) => <span className="timeline-bookmark" key={bookmark.id} data-bookmark-id={bookmark.id}><button type="button" data-testid={`bookmark-jump-${bookmark.id}`} onClick={() => onNavigateBookmark(bookmark.start)} title={`Jump to cycle ${bookmark.start}`}>◆ {bookmark.name}</button><button type="button" data-testid={`bookmark-edit-${bookmark.id}`} aria-label={`Edit ${bookmark.name}`} onClick={() => { setEditingBookmarkId(bookmark.id); setBookmarkName(bookmark.name); setBookmarkStart(bookmark.start); setBookmarkComment(bookmark.comment ?? ""); }}>Edit</button><EditorIconButton label={`Delete ${bookmark.name}`} icon="close" onClick={() => onCommand({ id: nextCommandId("marker_delete"), type: "bookmark.delete", bookmarkId: bookmark.id })} /></span>)}
        </div>
      </DsRibbonGroup>
    </div>
    <div className="timeline-slot-group" data-timeline-group="Fold / Break" aria-label="Fold and break commands">
      <DsRibbonGroup ariaLabel="Fold / Break" className="timeline-fold-group" label="Fold / Break">
        <DsRibbonButton ariaLabel="Create Time Group" dataTestId="time-group-create" icon={<RibbonIcon name="i-plus" />} onClick={() => onCommand({ id: nextCommandId("time_group_create"), type: "timeGroup.create", timeGroup: { id: nextEntityId("time", document) as TimeGroupId, name: `Group ${range.start}-${range.end}`, start: range.start, end: range.end, presentation: { collapsed: false, foldStyle: "none" } } })} title="Create a Time Group from the selected range">Create</DsRibbonButton>
        <DsRibbonButton ariaLabel="Axis Break" icon={<RibbonIcon name="i-gap" />} onClick={() => onCommand({ id: nextCommandId("gap"), type: "timeGroup.create", timeGroup: { id: nextEntityId("time", document) as TimeGroupId, name: `Gap ${range.start}-${range.end}`, start: range.start, end: range.end, presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "GAP" } } })} title="Fold the selected range into a collapsed axis break" v1Label="軸ブレーク">Break</DsRibbonButton>
        <DsRibbonButton ariaLabel="Expand All" dataTestId="time-group-expand-all" icon={<RibbonIcon name="i-expand" />} disabled={!document.timeGroups.some((group) => group.presentation?.collapsed)} onClick={expandAllTimeGroups} title="Expand every collapsed Time Group / axis break">Expand</DsRibbonButton>
        <div className="timeline-objects timeline-time-groups">
          {document.timeGroups.map((group) => <span className="timeline-time-group" key={group.id} data-time-group-id={group.id}><button type="button" data-testid={`time-group-edit-${group.id}`} onClick={() => { setEditingGroupId(group.id); setGroupName(group.name); setGroupStart(group.start); setGroupEnd(group.end); setGroupComment(group.comment ?? ""); setGroupFoldLabel(group.presentation?.foldLabel ?? ""); setGroupCollapsed(group.presentation?.collapsed ?? false); }} title={`Edit ${group.name}`}>// {group.name}</button><button type="button" data-testid={`time-group-${group.presentation?.collapsed ? "expand" : "collapse"}-${group.id}`} aria-label={`${group.presentation?.collapsed ? "Expand" : "Collapse"} ${group.name}`} onClick={() => setTimeGroupCollapsed(group, !group.presentation?.collapsed)}>{group.presentation?.collapsed ? "Expand" : "Collapse"}</button><EditorIconButton label={`Delete ${group.name}`} icon="close" onClick={() => onCommand({ id: nextCommandId("gap_delete"), type: "timeGroup.delete", timeGroupId: group.id })} /></span>)}
        </div>
      </DsRibbonGroup>
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
