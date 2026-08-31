import type { ReactNode } from "react";
import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import { DefaultScreenGeometryProjector, resolveTimeAxisGeometry, SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryMap, type Point, type SnapKind, type TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { CommandHistorySession, type HistoryState } from "@timing-chart-v2/history";
import { buildHardwareHierarchyEntries, hardwareHierarchyScopes, type DisplayTimeMapping, type HardwareHierarchyView, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import { type AnnotationOverlayPrimitive, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { scanJsonSyntax, serializeCanonicalDocument, validateCanonicalDocument, validateDocumentResourceBudget } from "@timing-chart-v2/schema";
import { documentProblemRuleDescriptor, quickValueLiteral, quickValueOptions, type Annotation, type AnnotationId, type AnnotationType, type BookmarkId, type CanonicalDocument, type ClockGenerator, type ClockSignal, type CommandId, type CommentRow, type DocumentProblem, type EdgeCounterSettings, type GroupId, type LegendEntry, type ParsedCanonicalDocument, type SemanticAnchor, type Signal, type SignalGroup, type SignalId, type SignalRole, type SpacerId, type SpacerRow, type TimeGroupId, type Transaction, type TransactionId, type ValueSignal } from "@timing-chart-v2/schema";
import { mayRouteGlobalShortcut, resolveProblemTarget, UiCommandRegistry } from "@timing-chart-v2/ui";
import { ViewMetricsOwner } from "./runtime/view-metrics.js";
import { buildViewportWindow } from "./runtime/viewport-window.js";
import { projectEdgeCounters } from "./runtime/edge-counter-projection.js";
import { normalizeSnapDistance } from "./runtime/snap-distance.js";
import { withAddedOffset, withSnapOffset } from "./runtime/anchor-offset.js";
import { preferredSnapKinds } from "./runtime/snap-policy.js";
import { referenceSvgScreenScale } from "./runtime/screen-scale.js";
import { rangeFromBoundaries } from "./runtime/range-selection.js";
import { RangeDragController, type RangeDragState } from "./runtime/range-drag.js";
import { EditorApplicationRuntime } from "./runtime/editor-application-runtime.js";
import { DsRibbonButton, DsRibbonGroup, DsRibbonSelect, DsRibbonToggle, DsRibbonToggleButton } from "./design-system.js";
import { buildCommandRejectionDiagnostics } from "./command-diagnostics.js";
import { ContextMenuSurface } from "./context-menu-surface.js";
import { TransactionLinkedSignals } from "./transaction-linked-signals.js";
import { ExportDialog } from "./export-dialog.js";
import { ReviewWorkflow } from "./review-workflow.js";
import { ProblemsPanel } from "./problems-panel.js";
import { problemMatchesFilter } from "./problem-filter.js";
import { JsonPanel } from "./json-panel.js";
import { replaceSelectedJsonObject } from "./json-selection.js";
import { selectedJsonProblem } from "./json-problems.js";
import { downloadText } from "./download-text.js";
import { nextCommandId } from "./command-id.js";
import { nextEntityId } from "./entity-id.js";
import { resolveAnchorPoint } from "./resolve-anchor-point.js";
import { createAnnotation } from "./create-annotation.js";
import { AnnotationToolbar } from "./annotation-toolbar.js";
import { renderGeometryGrid } from "./render-geometry-grid.js";
import { useInspectorAccordion } from "./inspector-accordion.js";
import { InspectorSection } from "./inspector-section.js";
import { canonicalDocumentOf, createNewDocumentFromProductTemplate, MAX_OPEN_FILE_BYTES, openFileByteBudgetProblem, parseOpenDocument, serializeSaveDocument } from "./file-document-controller.js";
import { MiniMap } from "./minimap.js";
import { parseBulkSignalDefinitions, type BulkSignalDefinition } from "./bulk-signal-parser.js";
import { defaultEventValue, EventRow, QuickValues } from "./event-table-components.js";
import { useDialogFocusLoop } from "./dialog-focus-loop.js";
import { AnnotationList } from "./annotation-list.js";
import { CommentRowEditor } from "./comment-row-editor.js";
import { LegendView } from "./legend-view.js";
import { AIOperationPanel } from "./ai-operation-panel.js";
import { RibbonIcon } from "./ribbon-icon.js";
import { InsertSemanticIcon, type InsertSemanticIconKind } from "./insert-semantic-icon.js";
import { EditorIcon, EditorIconButton, type EditorIconName } from "./editor-icon.js";
import { HardwareHierarchyBrowser } from "./hardware-hierarchy-browser.js";
import { InlineNameInput } from "./inline-name-input.js";
import { SaveAsDialog } from "./save-as-dialog.js";
import { ProblemsPanelLegacy } from "./problems-panel-legacy.js";
import { EventTable } from "./event-table.js";
import { ClockGeneratorEditor } from "./clock-generator-editor.js";
import { DocumentProperties } from "./document-properties.js";
import { TimelineToolbar, type SignalEditorProps } from "./timeline-toolbar.js";
import { LayoutInspector } from "./layout-inspector.js";
import { AnnotationEditor } from "./annotation-editor.js";
import { AdvancedJsonPanel } from "./advanced-json-panel.js";
import { SignalEditor } from "./signal-editor.js";
import { InspectorAnnotationEditor } from "./inspector-annotation-editor.js";
import { InspectorSignalRouter } from "./inspector-signal-router.js";
import { InspectorClockEditor } from "./inspector-clock-editor.js";
import { Ribbon } from "./minimal-cycle-view-ribbon.js";
import { styleNumber, styleString } from "./inspector-style.js";
import { TransactionLanes } from "./runtime/transaction-lanes.js";
import { TransactionEditor } from "./transaction-editor.js";
import { buildRuler } from "./runtime/build-ruler.js";
import { displayBoundaryForSource } from "./runtime/display-boundary.js";
import { buildSnapIndex } from "./runtime/snap-index.js";
import { annotationFields, projectAnnotationOverlays } from "./runtime/annotation-overlays.js";
import { createTimelineViewportRuntime } from "./runtime/timeline-viewport-runtime.js";


export type MinimalCycleViewPanelsProps = { readonly children?: ReactNode; readonly workspace?: ReactNode; readonly tail?: ReactNode; readonly bottom?: ReactNode; readonly inspector?: ReactNode; readonly overlays?: ReactNode; readonly fileInput?: ReactNode; readonly status?: ReactNode; };
const spacerId = (value: string) => value as SpacerId;
export function MinimalCycleViewPanels({ children, workspace, tail, bottom, inspector, overlays, fileInput, status }: MinimalCycleViewPanelsProps) { if (children !== undefined) return <>{children}</>; return <><div className="desktop-workspace">{workspace}{tail}{bottom}{inspector}</div>{overlays}{fileInput}{status}</>; }

export function ContextMenuPanel({ contextMenu, hasSelectedClipboard, clipboardAvailable, hasSelectedEntity, hasSelectedSignal, hasDeletableSelection, copySelectedSignal, cutSelectedSignal, pasteSelectedEntity, duplicateSelectedEntity, moveSelection, setSelectionVisibility, renameSelection, closeContextMenu, deleteSelection }: any) {
  return contextMenu ? <ContextMenuSurface anchor={contextMenu} target={contextMenu.target} label={contextMenu.target === "group" ? "Group context menu" : contextMenu.target === "annotation" ? "Annotation context menu" : "Signal context menu"}>
    <button type="button" role="menuitem" onClick={() => { copySelectedSignal(); closeContextMenu(); }} disabled={!hasSelectedClipboard}>Copy</button>
    <button type="button" role="menuitem" onClick={() => { cutSelectedSignal(); closeContextMenu(); }} disabled={!hasSelectedClipboard}>Cut</button>
    <button type="button" role="menuitem" onClick={() => { pasteSelectedEntity(); closeContextMenu(); }} disabled={!clipboardAvailable}>Paste</button>
    <button type="button" role="menuitem" onClick={() => { duplicateSelectedEntity(); closeContextMenu(); }} disabled={!hasSelectedClipboard}>Duplicate</button>
    <button type="button" role="menuitem" onClick={() => { moveSelection(-1); closeContextMenu(); }} disabled={!hasSelectedEntity}>Move Up</button>
    <button type="button" role="menuitem" onClick={() => { moveSelection(1); closeContextMenu(); }} disabled={!hasSelectedEntity}>Move Down</button>
    <button type="button" role="menuitem" onClick={() => { setSelectionVisibility(true); closeContextMenu(); }} disabled={!hasSelectedSignal}>Show</button>
    <button type="button" role="menuitem" onClick={() => { setSelectionVisibility(false); closeContextMenu(); }} disabled={!hasSelectedSignal}>Hide</button>
    <button type="button" role="menuitem" onClick={() => { renameSelection(); closeContextMenu(); }} disabled={!hasSelectedEntity}>Rename</button>
    <button type="button" role="menuitem" onClick={() => { deleteSelection(); closeContextMenu(); }} disabled={!hasDeletableSelection}>Delete</button>
  </ContextMenuSurface> : null;
}

export function MinimalCycleViewTitleBar({ title, dirty }: { readonly title: string; readonly dirty: boolean }) {
  return <header className="app-titlebar"><span className="appmark">∿</span><h1>{title}</h1><span className="save-state">{dirty ? "Modified" : "Saved"}</span><span className="view-title">Cycle View</span></header>;
}

export function InspectorPanel({ signal, group, annotation, transaction, collapsedGroup, onToggleGroupCollapse, registry, document, viewport, onCommand, onReveal, onCancel }: { readonly signal: Signal | undefined; readonly group: SignalGroup | undefined; readonly annotation: Annotation | undefined; readonly transaction: Transaction | undefined; readonly collapsedGroup: boolean; readonly onToggleGroupCollapse: (() => void) | undefined; readonly registry: UiCommandRegistry; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onReveal: () => void; readonly onCancel: () => void }) {
  const [name, setName] = useState(signal?.name ?? "");
  const [groupName, setGroupName] = useState(group?.name ?? "");
  const [spacingBefore, setSpacingBefore] = useState(group?.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(group?.spacingAfter ?? 0);
  const [groupShowBackground, setGroupShowBackground] = useState(group?.style?.showBackground ?? false);
  const [groupBackground, setGroupBackground] = useState(group?.style?.background ?? "#eef5fc");
  const [groupOpacity, setGroupOpacity] = useState(group?.style?.opacity ?? 1);
  const [groupBorder, setGroupBorder] = useState(group?.style?.border ?? "#d8e0e9");
  const [groupShowBorder, setGroupShowBorder] = useState(Boolean(group?.style?.border));
  const [groupExtend, setGroupExtend] = useState<"label" | "waveform" | "both">(group?.style?.extend ?? "both");
  const [groupShowHeader, setGroupShowHeader] = useState(group?.style?.showHeader ?? true);
  const [visible, setVisible] = useState(signal?.display.visible !== false);
  const [edgeCounter, setEdgeCounter] = useState<EdgeCounterSettings | undefined>(signal?.type === "clock" ? signal.edgeCounter : undefined);
  const [transactionName, setTransactionName] = useState(transaction?.name ?? "");
  const [transactionStart, setTransactionStart] = useState(transaction?.start ?? 0);
  const [transactionEnd, setTransactionEnd] = useState(transaction?.end ?? 1);
  const [transactionLane, setTransactionLane] = useState(transaction?.laneId ?? "lane_0");
  const [transactionPhases, setTransactionPhases] = useState(JSON.stringify(transaction?.phases ?? [], null, 2));
  const [transactionStatus, setTransactionStatus] = useState("");
  if (Boolean(signal)) return <InspectorSignalRouter signal={signal as Signal} document={document} viewport={viewport} onCommand={onCommand} onReveal={onReveal} onCancel={onCancel} renderClock={(props) => <InspectorClockEditor {...props} signal={props.signal as ClockSignal} />} renderValue={(props) => <InspectorValueSignalEditor {...props} signal={props.signal as ValueSignal} />} />;
  if (Boolean(annotation)) return <InspectorAnnotationEditor annotation={annotation as Annotation} document={document} viewport={viewport} onCommand={onCommand} onDelete={() => registry.execute("selection.delete")} onCancel={onCancel} />;
  if (!group && !transaction) return <LayoutInspector document={document} viewport={viewport} onCommand={onCommand} onCancel={onCancel} />;
  const spacerMoveEditor = group ? <section data-testid="spacer-reorder"><h3>Spacer Reorder</h3>{(group.spacers ?? []).map((spacer) => { const index = group.rows.indexOf(spacer.id); return <div key={spacer.id} data-spacer-reorder-id={spacer.id}><code>{spacer.id}</code><button type="button" aria-label={`Move spacer ${spacer.id} up`} disabled={index <= 0} onClick={() => onCommand({ id: nextCommandId("spacer_move_up"), type: "spacer.move", spacerId: spacer.id, targetGroupId: group.id, index: index - 1 })}>Up</button><button type="button" aria-label={`Move spacer ${spacer.id} down`} disabled={index < 0 || index >= group.rows.length - 1} onClick={() => onCommand({ id: nextCommandId("spacer_move_down"), type: "spacer.move", spacerId: spacer.id, targetGroupId: group.id, index: index + 1 })}>Down</button></div>})}</section> : null;
  const spacerEditor = group ? <section data-testid="inspector-spacers"><h3>Spacer Rows</h3><button type="button" data-testid="add-spacer" onClick={() => onCommand({ id: nextCommandId("spacer_create"), type: "spacer.create", spacer: { id: spacerId(nextEntityId("spacer", document)), height: 24 }, targetGroupId: group.id, index: group.rows.length })}>Add Spacer</button>{(group.spacers ?? []).map((spacer) => <form key={spacer.id} data-spacer-id={spacer.id} onSubmit={(event) => { event.preventDefault(); const height = Number(new FormData(event.currentTarget).get("height")); onCommand({ id: nextCommandId("spacer_update"), type: "spacer.update", spacerId: spacer.id, height }); }}><code>{spacer.id}</code><label>Height<input name="height" aria-label={`Spacer height ${spacer.id}`} type="number" min="1" step="1" defaultValue={spacer.height} /></label><button type="submit">Apply Height</button><button type="button" onClick={() => onCommand({ id: nextCommandId("spacer_delete"), type: "spacer.delete", spacerId: spacer.id })}>Delete</button></form>)}</section> : null;
  return <aside className="inspector" data-testid="inspector" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}><header><span>Inspector</span></header>{(group || transaction) && <button type="button" data-testid="cancel-inspector-draft" onClick={onCancel}>Cancel</button>}
    {!signal && !group && !annotation && !transaction && <section className="inspector-empty">No selection</section>}
    {spacerEditor}
    {spacerMoveEditor}
    {signal && <>
      <section><h3>Signal</h3><div className="property-row"><span>Type</span><b>{signal.type}</b></div><label>Name<input aria-label="Inspector signal name" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name.trim() && name.trim() !== signal.name) registry.execute("selection.rename", { name }); }} /></label><label>Role<select aria-label="Inspector signal role" value={signal.role} disabled><option>{signal.role}</option></select></label><label>Width<input value={signal.type === "bus" ? signal.width ?? "" : 1} readOnly /></label><label className="checkline">Visible<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => { setVisible(event.target.checked); registry.execute("selection.visibility", { visible: event.target.checked }); }} /></label><button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Signal</button></section>
      <section><h3>Layout</h3><div className="property-row"><span>Row height</span><span>{document.layout.rowHeight}px</span></div><div className="property-row"><span>Spacing</span><span>{document.layout.signalSpacing}px</span></div></section>
      {signal.type === "clock" && edgeCounter && <section><h3>Edge Numbers</h3><label className="checkline">Show<input aria-label="Edge Numbers show" type="checkbox" checked={edgeCounter.show} onChange={(event) => setEdgeCounter({ ...edgeCounter, show: event.target.checked })} /></label><label>Mode<select aria-label="Edge Numbers mode" value={edgeCounter.mode} onChange={(event) => setEdgeCounter({ ...edgeCounter, mode: event.target.value as EdgeCounterSettings["mode"] })}><option value="rising">Rising</option><option value="falling">Falling</option><option value="both">Both</option></select></label><label>Start number<input aria-label="Edge Numbers start" type="number" value={edgeCounter.startNumber} onChange={(event) => setEdgeCounter({ ...edgeCounter, startNumber: Number(event.target.value) })} /></label><label>Count from<select aria-label="Edge Numbers count from" value={edgeCounter.countFrom} onChange={(event) => setEdgeCounter({ ...edgeCounter, countFrom: event.target.value as EdgeCounterSettings["countFrom"] })}><option value="signal-start">Signal start</option><option value="selected-edge">Selected edge</option><option value="marker">Marker</option><option value="visible-range-start">Visible range start</option></select></label><label>Every N<input aria-label="Edge Numbers every" type="number" min="1" value={edgeCounter.labelEvery} onChange={(event) => setEdgeCounter({ ...edgeCounter, labelEvery: Number(event.target.value) })} /></label><label>Position<select aria-label="Edge Numbers position" value={edgeCounter.position} onChange={(event) => setEdgeCounter({ ...edgeCounter, position: event.target.value as EdgeCounterSettings["position"] })}><option value="above">Above</option><option value="below">Below</option></select></label><label>X offset<input aria-label="Edge Numbers X" type="number" value={edgeCounter.offset.x} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, x: Number(event.target.value) } })} /></label><label>Y offset<input aria-label="Edge Numbers Y" type="number" value={edgeCounter.offset.y} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, y: Number(event.target.value) } })} /></label><button type="button" onClick={() => onCommand({ id: nextCommandId("edge_counter"), type: "signal.updateEdgeCounter", signalId: signal.id, edgeCounter })}>Apply Edge Numbers</button></section>}
    </>}
    {group && <section><h3>Group</h3><label>Name<InlineNameInput value={group.name} ariaLabel="Inspector group name" onRename={(name) => onCommand({ id: nextCommandId("group_rename"), type: "group.rename", groupId: group.id, name })} onCommitted={setGroupName} /></label><label>Spacing Before<input aria-label="Group spacing before" type="number" min="0" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label><label>Spacing After<input aria-label="Group spacing after" type="number" min="0" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label><label className="checkline">Show Background<input aria-label="Group show background" type="checkbox" checked={groupShowBackground} onChange={(event) => setGroupShowBackground(event.target.checked)} /></label><label>Background<input aria-label="Group background" type="color" value={groupBackground} onChange={(event) => setGroupBackground(event.target.value)} /></label><label>Opacity<input aria-label="Group opacity" type="number" min="0" max="1" step="0.05" value={groupOpacity} onChange={(event) => setGroupOpacity(Number(event.target.value))} /></label><label className="checkline">Border<input aria-label="Group show border" type="checkbox" checked={groupShowBorder} onChange={(event) => setGroupShowBorder(event.target.checked)} /></label><label>Border Color<input aria-label="Group border" value={groupBorder} onChange={(event) => setGroupBorder(event.target.value)} /></label><label>Extend<select aria-label="Group extend" value={groupExtend} onChange={(event) => setGroupExtend(event.target.value as typeof groupExtend)}><option value="label">Label</option><option value="waveform">Waveform</option><option value="both">Both</option></select></label><label className="checkline">Show Header<input aria-label="Group show header" type="checkbox" checked={groupShowHeader} onChange={(event) => setGroupShowHeader(event.target.checked)} /></label><button type="button" data-testid="apply-group-properties" onClick={() => onCommand({ id: nextCommandId("group_properties"), type: "group.updateProperties", groupId: group.id, name: groupName, spacingBefore, spacingAfter, style: { showBackground: groupShowBackground, background: groupBackground, opacity: groupOpacity, extend: groupExtend, ...(groupShowBorder ? { border: groupBorder } : {}), showHeader: groupShowHeader } })}>Apply Group Properties</button><div className="property-row"><span>Rows</span><span>{group.rows.length}</span></div><label className="checkline">Collapsed<input aria-label="Inspector group collapsed" type="checkbox" checked={collapsedGroup} onChange={() => onToggleGroupCollapse?.()} /></label><small className="inspector-note">Collapse is a view-only layout preference; it does not change Canonical, History, or Dirty state.</small></section>}
    {transaction && <section><h3>Transaction</h3><label>Name<input aria-label="Transaction name" value={transactionName} onChange={(event) => setTransactionName(event.target.value)} /></label><label>Start<input aria-label="Transaction start" type="number" min="0" max={transactionEnd - 1} value={transactionStart} onChange={(event) => setTransactionStart(Number(event.target.value))} /></label><label>End<input aria-label="Transaction end" type="number" min={transactionStart + 1} max={document.timeline.cycleCount} value={transactionEnd} onChange={(event) => setTransactionEnd(Number(event.target.value))} /></label><label>Lane<input aria-label="Transaction lane" value={transactionLane} onChange={(event) => setTransactionLane(event.target.value)} /></label><label>Phases JSON<textarea aria-label="Transaction phases" rows={5} value={transactionPhases} onChange={(event) => setTransactionPhases(event.target.value)} spellCheck={false} /></label><button type="button" data-testid="apply-transaction-properties" onClick={() => { try { const phases = JSON.parse(transactionPhases) as unknown; if (!Array.isArray(phases) || phases.some((phase) => typeof phase !== "object" || phase === null || typeof (phase as { name?: unknown }).name !== "string" || !Number.isInteger((phase as { start?: unknown }).start) || !Number.isInteger((phase as { end?: unknown }).end))) throw new Error("Phases must be an array of {name,start,end} objects."); setTransactionStatus(""); onCommand({ id: nextCommandId("transaction_update"), type: "transaction.update", transactionId: transaction.id, name: transactionName, start: transactionStart, end: transactionEnd, laneId: transactionLane, phases }); } catch (error) { setTransactionStatus(error instanceof Error ? error.message : "Invalid phases JSON"); } }}>{"Apply Transaction"}</button>{transactionStatus && <output role="status">{transactionStatus}</output>}<TransactionLinkedSignals transaction={transaction} document={document} onCommand={onCommand} nextCommandId={nextCommandId} renderUnlinkButton={(label, onClick) => <EditorIconButton label={label} icon="close" onClick={onClick} />} /><button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Transaction</button></section>}
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}

export function InspectorValueSignalEditor({ signal, document, viewport, onCommand, onReveal, onCancel }: { readonly signal: ValueSignal; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly onCommand: (command: SemanticCommand) => CommandResult; readonly onReveal: () => void; readonly onCancel: () => void }) {
  const [name, setName] = useState(signal.display.name);
  const [role, setRole] = useState<SignalRole>(signal.role);
  const [signalType, setSignalType] = useState<ValueSignal["type"]>(signal.type);
  const [width, setWidth] = useState(signal.width ?? 1);
  const [format, setFormat] = useState<"hex" | "binary" | "symbolic">(signal.displayFormat ?? "hex");
  const [visible, setVisible] = useState(signal.display.visible !== false);
  const [spacingBefore, setSpacingBefore] = useState(signal.spacingBefore ?? 0);
  const [spacingAfter, setSpacingAfter] = useState(signal.spacingAfter ?? 0);
  const [align, setAlign] = useState<NonNullable<Signal["display"]["align"]>>(signal.display.align ?? "left");
  const [overflow, setOverflow] = useState<NonNullable<Signal["display"]["overflow"]>>(signal.display.overflow ?? "ellipsis");
  const [style, setStyle] = useState(JSON.stringify(signal.display.style ?? {}));
  const styleObject = signal.display.style ?? {};
  const [textColor, setTextColor] = useState(styleString(styleObject, "color", "#152033"));
  const [rowBackground, setRowBackground] = useState(styleString(styleObject, "background", "#ffffff"));
  const [fontFamily, setFontFamily] = useState(styleString(styleObject, "fontFamily", "Segoe UI"));
  const [fontSize, setFontSize] = useState(styleNumber(styleObject, "fontSize", 12));
  const [bold, setBold] = useState(styleObject.fontWeight === "bold");
  const [italic, setItalic] = useState(styleObject.fontStyle === "italic");
  const [underline, setUnderline] = useState(styleString(styleObject, "textDecoration", "").includes("underline"));
  const [strikethrough, setStrikethrough] = useState(styleString(styleObject, "textDecoration", "").includes("line-through"));
  const [waveformColor, setWaveformColor] = useState(styleString(styleObject, "waveformColor", "#111111"));
  const [waveformBackground, setWaveformBackground] = useState(styleString(styleObject, "waveformBackground", "#ffffff"));
  const [problem, setProblem] = useState("");
  const { state: sections, toggle } = useInspectorAccordion("value-signal", { "signal-properties": true, hierarchy: true, "label-style": false, waveform: true });
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    let parsed: Signal["display"]["style"];
    try {
      const value: unknown = JSON.parse(style || "{}");
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Style must be a JSON object.");
      parsed = value as Signal["display"]["style"];
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Style must be valid JSON.");
      return;
    }
    setProblem("");
    const parsedStyle = parsed ?? {};
    const decorations = [underline ? "underline" : "", strikethrough ? "line-through" : ""].filter(Boolean).join(" ");
    const structuredStyle = { color: typeof parsedStyle.color === "string" ? parsedStyle.color : textColor, background: typeof parsedStyle.background === "string" ? parsedStyle.background : rowBackground, fontFamily: typeof parsedStyle.fontFamily === "string" ? parsedStyle.fontFamily : fontFamily, fontSize: typeof parsedStyle.fontSize === "number" ? parsedStyle.fontSize : fontSize, fontWeight: typeof parsedStyle.fontWeight === "string" ? parsedStyle.fontWeight : (bold ? "bold" : "normal"), fontStyle: typeof parsedStyle.fontStyle === "string" ? parsedStyle.fontStyle : (italic ? "italic" : "normal"), textDecoration: typeof parsedStyle.textDecoration === "string" ? parsedStyle.textDecoration : decorations, waveformColor: typeof parsedStyle.waveformColor === "string" ? parsedStyle.waveformColor : waveformColor, waveformBackground: typeof parsedStyle.waveformBackground === "string" ? parsedStyle.waveformBackground : waveformBackground };
    onCommand({ id: nextCommandId("inspector_signal_properties"), type: "signal.updateProperties", signalId: signal.id, name, role, signalType, ...(signalType === "bus" ? { width, displayFormat: format } : {}), visible, ...(signal.spacingBefore === undefined && spacingBefore === 0 ? {} : { spacingBefore }), ...(signal.spacingAfter === undefined && spacingAfter === 0 ? {} : { spacingAfter }), displayAlign: align, displayOverflow: overflow, displayStyle: { ...parsedStyle, ...structuredStyle } });
  };
  const fullPath = [...signal.source.instancePath, signal.source.signalName].join(".") || signal.source.signalName;
  return <aside className="inspector" data-testid="inspector" data-inspector-context="signal" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}><header><span>Inspector</span><b>Signal</b></header>
    <form className="inspector-signal-properties" data-testid="inspector-signal-properties" onSubmit={apply}>
      <InspectorSection sectionId="signal-properties" title="Signal Properties" open={sections["signal-properties"] ?? true} onToggle={() => toggle("signal-properties")}>
         <label>Display Name<InlineNameInput value={signal.display.name} ariaLabel="Inspector signal name" onRename={(nextName) => onCommand({ id: nextCommandId("inspector_signal_rename"), type: "signal.rename", signalId: signal.id, name: nextName })} onCommitted={setName} /></label>
        <label>Role<select aria-label="Inspector signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
        <label>Type<select aria-label="Inspector signal type" value={signalType} onChange={(event) => setSignalType(event.target.value as ValueSignal["type"])}><option value="binary">Binary</option><option value="bus">Bus</option><option value="state">State</option><option value="logic">Logic</option><option value="event">Event</option><option value="pulse">Pulse</option></select></label>
        {signalType === "bus" && <><label>Width<input aria-label="Inspector signal width" type="number" min="1" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>Bus format<select aria-label="Inspector bus format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="hex">Hex</option><option value="binary">Binary</option><option value="symbolic">Symbol</option></select></label></>}
        <label className="checkline">Visible<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /></label>
        <label>Spacing Before<input aria-label="Inspector signal spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label>
        <label>Spacing After<input aria-label="Inspector signal spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label>
      </InspectorSection>
      <InspectorSection sectionId="hierarchy" title="Source / Hierarchy" open={sections.hierarchy ?? true} onToggle={() => toggle("hierarchy")}><div className="property-row"><span>Instance Path</span><span>{signal.source.instancePath.join(".") || "(root)"}</span></div><div className="property-row"><span>Signal Name</span><span>{signal.source.signalName}</span></div><div className="property-row"><span>Full Path</span><span title={fullPath}>{fullPath}</span></div><div className="property-row"><span>Bus Range</span><span>{signal.source.msb === undefined ? "—" : `[${signal.source.msb}:${signal.source.lsb ?? 0}]`}</span></div><button type="button" data-testid="reveal-in-hierarchy" onClick={onReveal}>Reveal in Hierarchy</button></InspectorSection>
      <InspectorSection sectionId="label-style" title="Label Style" open={sections["label-style"] ?? false} onToggle={() => toggle("label-style")}><label>Text Color<input aria-label="Inspector text color" type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label><label>Background<input aria-label="Inspector label background" type="color" value={rowBackground} onChange={(event) => setRowBackground(event.target.value)} /></label><label>Font<input aria-label="Inspector label font" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} /></label><label>Size<input aria-label="Inspector label size" type="number" min="6" max="48" step="1" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label><div className="inspector-style-checks"><label className="checkline">Bold<input aria-label="Inspector label bold" type="checkbox" checked={bold} onChange={(event) => setBold(event.target.checked)} /></label><label className="checkline">Italic<input aria-label="Inspector label italic" type="checkbox" checked={italic} onChange={(event) => setItalic(event.target.checked)} /></label><label className="checkline">Underline<input aria-label="Inspector label underline" type="checkbox" checked={underline} onChange={(event) => setUnderline(event.target.checked)} /></label><label className="checkline">Strikethrough<input aria-label="Inspector label strikethrough" type="checkbox" checked={strikethrough} onChange={(event) => setStrikethrough(event.target.checked)} /></label></div><label>Align<select aria-label="Inspector label align" value={align} onChange={(event) => setAlign(event.target.value as typeof align)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Overflow<select aria-label="Inspector label overflow" value={overflow} onChange={(event) => setOverflow(event.target.value as typeof overflow)}><option value="ellipsis">Ellipsis</option><option value="expand">Expand</option><option value="wrap">Wrap</option></select></label></InspectorSection>
      <InspectorSection sectionId="waveform" title="Waveform / Row Style" open={sections.waveform ?? true} onToggle={() => toggle("waveform")}><label>Waveform Color<input aria-label="Inspector waveform color" type="color" value={waveformColor} onChange={(event) => setWaveformColor(event.target.value)} /></label><label>Row Background<input aria-label="Inspector waveform background" type="color" value={waveformBackground} onChange={(event) => setWaveformBackground(event.target.value)} /></label><label>Advanced Style JSON<textarea aria-label="Inspector waveform row style" value={style} onChange={(event) => setStyle(event.target.value)} rows={3} /></label></InspectorSection>
      {problem && <div className="editor-problem" role="alert">{problem}</div>}
      <button type="submit" data-testid="apply-inspector-signal">Apply Signal Properties</button><button type="button" data-testid="cancel-inspector-draft" onClick={onCancel}>Cancel</button>
    </form>
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}
