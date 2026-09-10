import { useRef, useState } from "react";
import type { BookmarkId, CanonicalDocument, ClockGenerator, GroupId, LabelAnchorId, Signal, SignalGroup, SignalId, TimeGroup, TimeGroupId } from "@timing-chart-v2/schema";
import type { HistoryState } from "@timing-chart-v2/history";
import { nextEntityId } from "./entity-id.js";
import { findAdjacentBookmark } from "./runtime/bookmark-navigation.js";
import { EditorIconButton } from "./editor-icon.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { DsRibbonButton, DsRibbonGroup, DsRibbonNumberInput } from "./design-system.js";
import type { EditorSurfaceCommandController, SignalEditorCommandActions } from "./application/editor-surface-command-controller.js";

/** #388/#396: this file's own destination/range-edit summary + tooltip
 * helpers. `destinationSummary` covers the Duplicate/Move sentence shown
 * next to the destination field; the per-button explanations reflect the
 * actual shared #170 timeline-transform contract (packages/commands/src/
 * planner.ts's timeline.delete/duplicateRange/moveRange handlers) rather
 * than repeating the command name. #396: the single long
 * "Selected [.,.) -> Target [.,.)" line never fit this Ribbon slot's actual
 * width -- it wrapped, and the shared .ds-ribbon-number-input output's
 * tight line-height then overlapped the wrapped lines on top of each
 * other. Two short, independently labeled lines (each always shorter than
 * either half of the old single line) replace it -- see the
 * .timeline-range-edit-group / .ds-ribbon-number-input--summary rules in
 * ribbon.css for the matching layout. */
function destinationSummary(range: { readonly start: number; readonly end: number }, destination: number): readonly [selected: string, target: string] {
  const length = Math.max(0, range.end - range.start);
  return [`Selected [${range.start},${range.end})`, `Target [${destination},${destination + length})`];
}

/** Timeline renders through the exact same Ds* ribbon primitives Insert and
 * Home use (DsRibbonGroup/DsRibbonButton/DsRibbonNumberInput) instead of
 * ad-hoc per-button markup -- see apps/editor/src/styles/ribbon.css's
 * .timeline-ribbon rules for the shared layout contract this consumes.
 * Every button keeps its ORIGINAL aria-label/v1Label (used by existing e2e
 * coverage and the V1-compatibility overlay) even where its visible label
 * text is now shorter -- only the on-screen wording changed, not the
 * accessible name or the underlying SemanticCommand. */
export function TimelineToolbar({ document, range, history, onUndo, onRedo, onRange, commands, onNavigateBookmark, onOpenBookmarks }: { readonly document: CanonicalDocument; readonly range: { readonly start: number; readonly end: number }; readonly history: HistoryState; readonly onUndo: () => void; readonly onRedo: () => void; readonly onRange: (range: { start: number; end: number }) => void; readonly commands: Pick<EditorSurfaceCommandController, "insertTimeline" | "deleteTimeline" | "duplicateTimeline" | "moveTimeline" | "createBookmark" | "createLabelAnchor" | "updateLabelAnchor" | "deleteLabelAnchor" | "createTimeGroup" | "updateTimeGroup" | "updateTimeGroupPresentation" | "expandAllTimeGroups" | "ungroupTimeGroup" | "deleteTimeGroup">; readonly onNavigateBookmark: (cycle: number, bookmarkId?: BookmarkId) => void; readonly onOpenBookmarks: () => void }) {
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
  // #376: a standalone Label Anchor (ruler-number restart with no owning
  // Time Group/fold) -- same list/edit/delete UI pattern as Bookmark above,
  // filtered to labelAnchors with no ownerTimeGroupId so a Time Group's own
  // fold-resume anchor never appears here and can't be edited/deleted
  // through this path (its lifecycle stays owned by the Time Group).
  const standaloneLabelAnchors = document.timeline.labelAnchors.filter((anchor) => anchor.ownerTimeGroupId === undefined);
  const [editingLabelAnchorId, setEditingLabelAnchorId] = useState<LabelAnchorId>();
  const editingLabelAnchor = standaloneLabelAnchors.find((anchor) => anchor.id === editingLabelAnchorId);
  const [labelAnchorSource, setLabelAnchorSource] = useState(0);
  const [labelAnchorDisplay, setLabelAnchorDisplay] = useState(0);
  const labelAnchorListRef = useRef<HTMLDivElement>(null);
  const applyLabelAnchor = () => {
    if (!editingLabelAnchor) return;
    commands.updateLabelAnchor(editingLabelAnchor.id, labelAnchorSource, labelAnchorDisplay);
    setEditingLabelAnchorId(undefined);
  };
  const navigateBookmark = (direction: -1 | 1) => {
    const next = findAdjacentBookmark(document.bookmarks, range, direction);
    if (next) onNavigateBookmark(next.start, next.id);
  };
  const applyTimeGroup = () => {
    if (!editingGroup) return;
    commands.updateTimeGroup({ timeGroupId: editingGroup.id, name: groupName, start: groupStart, end: groupEnd, comment: groupComment, presentation: { ...(editingGroup.presentation ?? {}), collapsed: groupCollapsed, foldStyle: groupCollapsed ? "axis-break" : "none", foldLabel: groupFoldLabel || groupName } });
    setEditingGroupId(undefined);
  };
  const timeGroupDraftChanged = editingGroup !== undefined && (
    groupName !== editingGroup.name
    || groupStart !== editingGroup.start
    || groupEnd !== editingGroup.end
    || groupComment !== (editingGroup.comment ?? "")
    || groupFoldLabel !== (editingGroup.presentation?.foldLabel ?? "")
    || groupCollapsed !== (editingGroup.presentation?.collapsed ?? false)
  );
  const setTimeGroupCollapsed = (group: TimeGroup, collapsed: boolean) => commands.updateTimeGroupPresentation(group.id, { ...(group.presentation ?? {}), collapsed, foldStyle: collapsed ? "axis-break" : "none", foldLabel: group.presentation?.foldLabel || group.name });
  const setBoundary = (key: "start" | "end", value: number) => {
    if (key === "start") onRange({ start: Math.max(0, Math.min(value, range.end - 1)), end: range.end });
    else onRange({ start: range.start, end: Math.min(document.timeline.cycleCount, Math.max(value, range.start + 1)) });
  };
  const rangeLength = Math.max(0, range.end - range.start);
  return <div className="timeline-ribbon" aria-label="Timeline Editor" data-testid="timeline-editor">
    <div className="timeline-slot-group" data-timeline-group="History" aria-label="History commands">
      {/* #388: reuses the exact same History/Undo/Redo owner as Home's
          History group -- no second Undo implementation. Every Timeline
          edit already commits as one SemanticCommand/History entry
          through that shared owner; this group only makes it reachable
          without switching back to Home while working on the Timeline
          tab. */}
      <DsRibbonGroup ariaLabel="History" className="timeline-history-group" density="compact-grid" label="History">
        <DsRibbonButton ariaLabel="Undo" icon={<RibbonIcon name="i-undo" />} disabled={!history.canUndo} onClick={onUndo} title="Undo the last completed operation">Undo</DsRibbonButton>
        <DsRibbonButton ariaLabel="Redo" icon={<RibbonIcon name="i-redo" />} disabled={!history.canRedo} onClick={onRedo} title="Redo the next undone operation">Redo</DsRibbonButton>
      </DsRibbonGroup>
    </div>
    <div className="timeline-slot-group" data-timeline-group="Range" aria-label="Range commands">
      <DsRibbonGroup ariaLabel="Range" className="timeline-range-group" density="compact-grid" label="Range">
        <DsRibbonNumberInput ariaLabel="Timeline range start" label="Start cycle" min={0} max={document.timeline.cycleCount - 1} value={range.start} onChange={(value) => setBoundary("start", value)} title={`Selected range start cycle (inclusive), 0-${document.timeline.cycleCount - 1}`} />
        <DsRibbonNumberInput ariaLabel="Timeline range end" label="End cycle" min={1} max={document.timeline.cycleCount} value={range.end} onChange={(value) => setBoundary("end", value)} title={`Selected range end cycle (exclusive), 1-${document.timeline.cycleCount}`} />
        <label className="ds-control ds-ribbon-number-input" title="Number of cycles in the selected range">
          <span className="ds-ribbon-number-input__caption">Length</span>
          <output data-testid="timeline-selected-length">Length {rangeLength}</output>
        </label>
      </DsRibbonGroup>
    </div>
    <div className="timeline-slot-group" data-timeline-group="Insert" aria-label="Insert timeline commands">
      <DsRibbonGroup ariaLabel="Insert" className="timeline-insert-group" density="compact-grid" label="Insert">
        <DsRibbonNumberInput ariaLabel="Timeline insert count" label="Count" min={1} step={1} value={count} onChange={(value) => setCount(Math.max(1, value))} title="Number of cycles used by Add N / Before / After" />
        <DsRibbonButton ariaLabel="Add one cycle" dataTestId="timeline-cycle-add" icon={<RibbonIcon name="i-plus" />} onClick={() => commands.insertTimeline(range.end, 1)} title="Insert 1 cycle after the selected range's end">Add Cycle</DsRibbonButton>
        <DsRibbonButton ariaLabel="Add N cycles" dataTestId="timeline-cycle-add-many" icon={<RibbonIcon name="i-plus" />} onClick={() => commands.insertTimeline(range.end, count)} title="Insert Count cycles after the selected range's end">Add N</DsRibbonButton>
        <DsRibbonButton ariaLabel="Insert before" icon={<RibbonIcon name="i-plus" />} onClick={() => commands.insertTimeline(range.start, count)} title="Insert Count cycles before the selected range's start" v1Label="サイクル挿入">Before</DsRibbonButton>
        <DsRibbonButton ariaLabel="Insert after" icon={<RibbonIcon name="i-plus" />} onClick={() => commands.insertTimeline(range.end, count)} title="Insert Count cycles after the selected range's end" v1Label="後に挿入">After</DsRibbonButton>
      </DsRibbonGroup>
    </div>
    <div className="timeline-slot-group" data-timeline-group="Range Edit" aria-label="Range edit commands">
      <DsRibbonGroup ariaLabel="Range Edit" className="timeline-range-edit-group" density="compact-grid" label="Range Edit">
        <DsRibbonNumberInput ariaLabel="Timeline destination" label="Destination" min={0} max={document.timeline.cycleCount} step={1} value={destination} onChange={(value) => setDestination(Math.max(0, value))} title="Start cycle used by Duplicate / Move -- has no effect on Delete" />
        <label className="ds-control ds-ribbon-number-input ds-ribbon-number-input--summary" title="What Duplicate/Move will do with the current Destination value">
          <span className="ds-ribbon-number-input__caption">Preview</span>
          <output data-testid="timeline-destination-summary">{destinationSummary(range, destination).map((line) => <span key={line}>{line}</span>)}</output>
        </label>
        <DsRibbonButton ariaLabel="Delete range" icon={<RibbonIcon name="i-delete" />} onClick={() => commands.deleteTimeline(range.start, range.end)} title={`Delete [${range.start},${range.end}). Later Signal change points, Annotation anchors, Bookmarks, Label Anchors, Time Groups and Transactions shift earlier by ${rangeLength} cycles (the shared #170 timeline-transform ripple). Destination is not used.`} v1Label="範囲削除">Delete</DsRibbonButton>
        <DsRibbonButton ariaLabel="Duplicate to" icon={<RibbonIcon name="i-duplicate" />} onClick={() => commands.duplicateTimeline(range.start, range.end, destination)} title={`Copy [${range.start},${range.end}) → [${destination},${destination + rangeLength}). The original range remains; Signal change points and Annotation anchors inside the source range are duplicated into the new location.`} v1Label="範囲複製">Duplicate</DsRibbonButton>
        <DsRibbonButton ariaLabel="Move to" icon={<RibbonIcon name="i-move-to" />} onClick={() => commands.moveTimeline(range.start, range.end, destination)} title={`Move [${range.start},${range.end}) to start at ${destination}. Destination is a POST-REMOVAL boundary (numbered as if the source range were already gone). The selected range relocates with its Signal change points and Annotation anchors intact; Bookmarks/Label Anchors/Time Groups/Transactions elsewhere ripple through the shared #170 timeline transform.`} v1Label="範囲移動">Move</DsRibbonButton>
      </DsRibbonGroup>
    </div>
    {/* #388: Bookmark stays a FIXED command surface -- Previous/Add/Next/
        Bookmarks only, never a per-Bookmark list rendered into the Ribbon
        (that used to make the Ribbon grow with document data; Bookmark
        count must never change Ribbon height/control count/layout).
        Persistent Bookmark management (create/edit/delete/list) lives in
        the dedicated Bottom "Bookmarks" panel -- see bookmark-editor.tsx. */}
    <div className="timeline-slot-group" data-timeline-group="Bookmark" aria-label="Bookmark commands">
      <DsRibbonGroup ariaLabel="Bookmark" className="timeline-bookmark-group" density="compact-grid" label="Bookmark">
        <DsRibbonButton ariaLabel="Previous bookmark" icon={<RibbonIcon name="i-chevron-left" />} disabled={document.bookmarks.length === 0} onClick={() => navigateBookmark(-1)} title="Jump to the previous Bookmark relative to the current selected range">Previous</DsRibbonButton>
        <DsRibbonButton ariaLabel="Add marker" icon={<RibbonIcon name="i-bookmark" />} onClick={() => commands.createBookmark({ id: nextEntityId("bookmark", document) as BookmarkId, name: `Marker ${range.start}`, start: range.start })} title="Add a Bookmark at the selected range's start" v1Label="ブックマーク">Add</DsRibbonButton>
        <DsRibbonButton ariaLabel="Next bookmark" icon={<RibbonIcon name="i-chevron-right" />} disabled={document.bookmarks.length === 0} onClick={() => navigateBookmark(1)} title="Jump to the next Bookmark relative to the current selected range">Next</DsRibbonButton>
        <DsRibbonButton ariaLabel="Open Bookmarks panel" dataTestId="open-bookmarks-panel" icon={<RibbonIcon name="i-list" />} onClick={onOpenBookmarks} title="Open the Bookmarks list in the Bottom Panel to create, edit or delete Bookmarks">Bookmarks</DsRibbonButton>
      </DsRibbonGroup>
    </div>
    <div className="timeline-slot-group" data-timeline-group="Label Anchor" aria-label="Label Anchor commands">
      <DsRibbonGroup ariaLabel="Label Anchor" className="timeline-label-anchor-group" density="compact-grid" label="Label Anchor">
        <DsRibbonButton ariaLabel="Add Label Anchor" dataTestId="label-anchor-create" icon={<RibbonIcon name="i-bookmark" />} onClick={() => commands.createLabelAnchor({ id: nextEntityId("labelAnchor", document) as LabelAnchorId, source: range.start, display: 0 })} title="Restart the ruler's displayed number at the selected range's start, without folding any time">Add</DsRibbonButton>
        <DsRibbonButton ariaLabel="List Label Anchors" icon={<RibbonIcon name="i-list" />} onClick={() => labelAnchorListRef.current?.focus()} title="Focus the Label Anchor list below">List</DsRibbonButton>
        <div className="timeline-objects" ref={labelAnchorListRef} tabIndex={-1}>
        {standaloneLabelAnchors.map((anchor) => <span className="timeline-label-anchor" key={anchor.id} data-label-anchor-id={anchor.id}><span data-testid={`label-anchor-summary-${anchor.id}`} title={`Source cycle ${anchor.source} displays as ${anchor.display}`}>⟲ {anchor.source}→{anchor.display}</span><button type="button" data-testid={`label-anchor-edit-${anchor.id}`} aria-label={`Edit Label Anchor at source ${anchor.source}`} onClick={() => { setEditingLabelAnchorId(anchor.id); setLabelAnchorSource(anchor.source); setLabelAnchorDisplay(anchor.display); }}>Edit</button><EditorIconButton label={`Delete Label Anchor at source ${anchor.source}`} icon="close" onClick={() => commands.deleteLabelAnchor(anchor.id)} /></span>)}
        </div>
      </DsRibbonGroup>
    </div>
    <div className="timeline-slot-group" data-timeline-group="Outline" aria-label="Outline commands">
      <DsRibbonGroup ariaLabel="Outline" className="timeline-fold-group" density="compact-grid" label="Outline">
        <DsRibbonButton ariaLabel="Create Time Group" dataTestId="time-group-create" icon={<RibbonIcon name="i-plus" />} onClick={() => commands.createTimeGroup({ id: nextEntityId("time", document) as TimeGroupId, name: `Group ${range.start}-${range.end}`, start: range.start, end: range.end, presentation: { collapsed: false, foldStyle: "none" } })} title="Create a Time Group from the selected range">Group</DsRibbonButton>
        <DsRibbonButton ariaLabel="Axis Break" icon={<RibbonIcon name="i-gap" />} onClick={() => commands.createTimeGroup({ id: nextEntityId("time", document) as TimeGroupId, name: `Gap ${range.start}-${range.end}`, start: range.start, end: range.end, presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "GAP" } })} title="Fold the selected range into a collapsed axis break" v1Label="軸ブレーク">Break</DsRibbonButton>
        <DsRibbonButton ariaLabel="Expand All" dataTestId="time-group-expand-all" icon={<RibbonIcon name="i-expand" />} disabled={!document.timeGroups.some((group) => group.presentation?.collapsed)} onClick={() => commands.expandAllTimeGroups(document.timeGroups)} title="Expand every collapsed Time Group / axis break">Expand</DsRibbonButton>
        <div className="timeline-objects timeline-time-groups">
          {document.timeGroups.map((group) => <span className="timeline-time-group" key={group.id} data-time-group-id={group.id}><button type="button" data-testid={`time-group-edit-${group.id}`} onClick={() => { setEditingGroupId(group.id); setGroupName(group.name); setGroupStart(group.start); setGroupEnd(group.end); setGroupComment(group.comment ?? ""); setGroupFoldLabel(group.presentation?.foldLabel ?? ""); setGroupCollapsed(group.presentation?.collapsed ?? false); }} title={`Edit ${group.name}`}>// {group.name}</button><button type="button" data-testid={`time-group-${group.presentation?.collapsed ? "expand" : "collapse"}-${group.id}`} aria-label={`${group.presentation?.collapsed ? "Expand" : "Collapse"} ${group.name}`} onClick={() => setTimeGroupCollapsed(group, !group.presentation?.collapsed)}>{group.presentation?.collapsed ? "Expand" : "Collapse"}</button><button type="button" data-testid={`time-group-ungroup-${group.id}`} aria-label={`Ungroup ${group.name}`} onClick={() => commands.ungroupTimeGroup(group.id)}>Ungroup</button><EditorIconButton label={`Delete ${group.name}`} icon="close" onClick={() => commands.deleteTimeGroup(group.id)} /></span>)}
        </div>
      </DsRibbonGroup>
    </div>
    {editingGroup && <form className="time-group-editor" aria-label="Time Group Editor" data-testid="time-group-editor" onSubmit={(event) => { event.preventDefault(); if (timeGroupDraftChanged) applyTimeGroup(); }}><label>Name<input aria-label="Time Group name" value={groupName} onChange={(event) => setGroupName(event.target.value)} /></label><label>Start<input aria-label="Time Group start" type="number" min="0" max={document.timeline.cycleCount - 1} value={groupStart} onChange={(event) => setGroupStart(Number(event.target.value))} /></label><label>End<input aria-label="Time Group end" type="number" min="1" max={document.timeline.cycleCount} value={groupEnd} onChange={(event) => setGroupEnd(Number(event.target.value))} /></label><label>Comment<input aria-label="Time Group comment" value={groupComment} onChange={(event) => setGroupComment(event.target.value)} /></label><label>Fold label<input aria-label="Time Group fold label" value={groupFoldLabel} onChange={(event) => setGroupFoldLabel(event.target.value)} /></label><label className="check-label"><input aria-label="Time Group collapsed" type="checkbox" checked={groupCollapsed} onChange={(event) => setGroupCollapsed(event.target.checked)} />Collapsed</label><button type="button" data-testid="apply-time-group" onClick={applyTimeGroup} disabled={!timeGroupDraftChanged}>Apply</button><button type="button" onClick={() => setEditingGroupId(undefined)}>Cancel</button></form>}
    {editingLabelAnchor && <form className="label-anchor-editor" aria-label="Label Anchor Editor" data-testid="label-anchor-editor" onSubmit={(event) => { event.preventDefault(); }}><label>Source cycle<input aria-label="Label Anchor source" type="number" min="0" max={document.timeline.cycleCount - 1} value={labelAnchorSource} onChange={(event) => setLabelAnchorSource(Number(event.target.value))} /></label><label>Display value<input aria-label="Label Anchor display" type="number" value={labelAnchorDisplay} onChange={(event) => setLabelAnchorDisplay(Number(event.target.value))} /></label><button type="button" data-testid="apply-label-anchor" onClick={applyLabelAnchor}>Apply</button><button type="button" onClick={() => setEditingLabelAnchorId(undefined)}>Cancel</button></form>}
  </div>;
}
export interface SignalEditorProps {
  readonly signal: Signal | undefined;
  readonly cycleCount: number;
  readonly bookmarks: CanonicalDocument["bookmarks"];
  readonly history: HistoryState;
  readonly groups: readonly SignalGroup[];
  readonly problem: string;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onVisibility: (signalId: SignalId, visible: boolean) => void;
  readonly onDelete: () => void;
  readonly onDuplicate: (signalId: SignalId) => void;
  readonly onDropToGroup: (kind: "signal" | "group", id: string, targetGroupId: GroupId) => void;
  readonly onCancel: () => void;
  readonly onClockPreview: (draft: ClockGenerator | undefined) => void;
  readonly clockCommands: Pick<SignalEditorCommandActions, "updateClockGenerator" | "updateEdgeCounter">;
  readonly signalCommands: SignalEditorCommandActions;
}
