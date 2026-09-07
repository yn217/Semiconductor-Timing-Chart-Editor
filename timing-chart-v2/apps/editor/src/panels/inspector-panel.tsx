import type { ReactNode } from "react";
import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { CanonicalSnapshot } from "@timing-chart-v2/core";
import { DefaultScreenGeometryProjector, resolveTimeAxisGeometry, SemanticSnapCandidateService, type ImmutableSnapIndex, type LocalGeometryMap, type Point, type SnapKind, type TimeAxisGeometry } from "@timing-chart-v2/geometry";
import { CommandHistorySession, type HistoryState } from "@timing-chart-v2/history";
import { buildHardwareHierarchyEntries, hardwareHierarchyScopes, type DisplayTimeMapping, type HardwareHierarchyView, type RenderProjection, type VirtualizationWindow } from "@timing-chart-v2/projection";
import { type AnnotationOverlayPrimitive, type WaveformSurfaceProvider } from "@timing-chart-v2/renderer";
import { scanJsonSyntax, serializeCanonicalDocument, validateCanonicalDocument, validateDocumentResourceBudget } from "@timing-chart-v2/schema";
import { documentProblemRuleDescriptor, quickValueLiteral, quickValueOptions, type Annotation, type AnnotationId, type AnnotationType, type Bookmark, type BookmarkId, type CanonicalDocument, type ClockGenerator, type ClockSignal, type CommandId, type CommentRow, type DocumentProblem, type EdgeCounterSettings, type GroupId, type LegendEntry, type ParsedCanonicalDocument, type SemanticAnchor, type Signal, type SignalGroup, type SignalGroupStyle, type SignalId, type SignalRole, type SpacerId, type SpacerRow, type TimeGroupId, type Transaction, type TransactionGroup, type TransactionId, type ValueSignal } from "@timing-chart-v2/schema";
import { mayRouteGlobalShortcut, resolveProblemTarget, UiCommandRegistry } from "@timing-chart-v2/ui";
import { ViewMetricsOwner } from "../runtime/view-metrics.js";
import { buildViewportWindow } from "../runtime/viewport-window.js";
import { projectEdgeCounters } from "../runtime/edge-counter-projection.js";
import { normalizeSnapDistance } from "../runtime/snap-distance.js";
import { withAddedOffset, withSnapOffset } from "../runtime/anchor-offset.js";
import { preferredSnapKinds } from "../runtime/snap-policy.js";
import { referenceSvgScreenScale } from "../runtime/screen-scale.js";
import { rangeFromBoundaries } from "../runtime/range-selection.js";
import { RangeDragController, type RangeDragState } from "../runtime/range-drag.js";
import { EditorApplicationRuntime } from "../runtime/editor-application-runtime.js";
import { DsRibbonButton, DsRibbonGroup, DsRibbonSelect, DsRibbonToggle, DsRibbonToggleButton } from "../design-system.js";
import { buildCommandRejectionDiagnostics } from "../command-diagnostics.js";
import { ContextMenuSurface } from "../context-menu-surface.js";
import { TransactionLinkedSignals } from "../transaction-linked-signals.js";
import { ExportDialog } from "../export-dialog.js";
import { ReviewWorkflow } from "../review-workflow.js";
import { ProblemsPanel } from "../problems-panel.js";
import { problemMatchesFilter } from "../problem-filter.js";
import { JsonPanel } from "../json-panel.js";
import { replaceSelectedJsonObject } from "../json-selection.js";
import { selectedJsonProblem } from "../json-problems.js";
import { downloadText } from "../download-text.js";
import { nextEntityId } from "../entity-id.js";
import { resolveAnchorPoint } from "../resolve-anchor-point.js";
import { createAnnotation } from "../create-annotation.js";
import { AnnotationToolbar } from "../annotation-toolbar.js";
import { renderGeometryGrid } from "../render-geometry-grid.js";
import { useInspectorAccordion } from "../inspector-accordion.js";
import { InspectorSection, InspectorFooter, PropertyToggle } from "../inspector-section.js";
import { InspectorHeaderBar, InspectorSelectionHeader } from "../inspector-selection-header.js";
import { InspectorBookmarkEditor } from "../inspector-bookmark-editor.js";
import { canonicalDocumentOf, createNewDocumentFromProductTemplate, MAX_OPEN_FILE_BYTES, openFileByteBudgetProblem, parseOpenDocument, serializeSaveDocument } from "../file-document-controller.js";
import { MiniMap } from "../minimap.js";
import { parseBulkSignalDefinitions, type BulkSignalDefinition } from "../bulk-signal-parser.js";
import { defaultEventValue, EventRow, QuickValues } from "../event-table-components.js";
import { useDialogFocusLoop } from "../dialog-focus-loop.js";
import { AnnotationList } from "../annotation-list.js";
import { CommentRowEditor } from "../comment-row-editor.js";
import { LegendView } from "../legend-view.js";
import { AIOperationPanel } from "../ai-operation-panel.js";
import { RibbonIcon } from "../ribbon-icon.js";
import { InsertSemanticIcon, type InsertSemanticIconKind } from "../insert-semantic-icon.js";
import { EditorIcon, EditorIconButton, type EditorIconName } from "../editor-icon.js";
import { HardwareHierarchyBrowser } from "../hardware-hierarchy-browser.js";
import { InlineNameInput } from "../inline-name-input.js";
import { SaveAsDialog } from "../save-as-dialog.js";
import { ProblemsPanelLegacy } from "../problems-panel-legacy.js";
import { EventTable } from "../event-table.js";
import { ClockGeneratorEditor } from "../editors/clock-generator-editor.js";
import { DocumentProperties } from "../document-properties.js";
import { TimelineToolbar, type SignalEditorProps } from "../timeline-toolbar.js";
import { LayoutInspector } from "../layout-inspector.js";
import { AnnotationEditor } from "../annotation-editor.js";
import { AdvancedJsonPanel } from "../advanced-json-panel.js";
import { SignalEditor } from "../editors/signal-editor.js";
import { InspectorAnnotationEditor } from "../inspector-annotation-editor.js";
import { InspectorSignalRouter } from "../inspector-signal-router.js";
import { InspectorClockEditor } from "../inspector-clock-editor.js";
import { Ribbon } from "../minimal-cycle-view-ribbon.js";
import { styleNumber, styleString } from "../inspector-style.js";
import { TransactionLanes } from "../runtime/transaction-lanes.js";
import { TransactionEditor } from "../transaction-editor.js";
import type { EditorSurfaceCommandController } from "../application/editor-surface-command-controller.js";
import { buildRuler } from "../runtime/build-ruler.js";
import { displayBoundaryForSource } from "../runtime/display-boundary.js";
import { buildSnapIndex } from "../runtime/snap-index.js";
import { annotationFields, projectAnnotationOverlays } from "../runtime/annotation-overlays.js";
import { createTimelineViewportRuntime } from "../runtime/timeline-viewport-runtime.js";


const spacerId = (value: string) => value as SpacerId;

export function InspectorPanel({ signal, group, annotation, transaction, bookmark, collapsedGroup, onToggleGroupCollapse, registry, document, viewport, commands, onReveal, onCancel, onClose, onDeleteBookmark, onToggleTransactionSignal, onGroupPreview }: { readonly signal: Signal | undefined; readonly group: SignalGroup | undefined; readonly annotation: Annotation | undefined; readonly transaction: Transaction | undefined; readonly bookmark: Bookmark | undefined; readonly collapsedGroup: boolean; readonly onToggleGroupCollapse: (() => void) | undefined; readonly registry: UiCommandRegistry; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly commands: EditorSurfaceCommandController; readonly onReveal: () => void; readonly onCancel: () => void; readonly onClose: () => void; readonly onDeleteBookmark: () => void; readonly onToggleTransactionSignal: (transactionId: TransactionId, signalId: SignalId) => void; readonly onGroupPreview?: (groupId: GroupId, style: SignalGroupStyle | undefined) => void }) {
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
  // #454: Group and Color had no Inspector entry point at all -- the
  // canonical model (#430/#450) and the Bottom list/Lane workspace
  // (#452/#453) already read/write both via the shared
  // `transaction.update`/`transaction.moveToGroup` commands; this only
  // adds the missing GUI surface, same commands, same Draft->Apply gate
  // as every other Inspector field on this Transaction.
  const [transactionGroupId, setTransactionGroupId] = useState(transaction?.groupId ?? "");
  // Empty string = "no override, inherit the Group's color" (the reference's
  // "Use Group Color" option) -- `transaction.update` fully replaces color
  // from whatever the command provides (nothing committed stays committed),
  // so leaving this empty on Apply is what actually clears a previous
  // override back to inherited, not merely "didn't touch the field".
  const [transactionColor, setTransactionColor] = useState(transaction?.color ?? "");
  // #393 item C: phaseRows (a structured Name/Start/End table) is the one
  // real source of truth for Apply Transaction below -- the Advanced/JSON
  // textarea is a secondary INPUT method that, via its own separate "Apply
  // from JSON" action, only rewrites phaseRows; it never submits a command
  // of its own. That keeps exactly one mutation path (satisfying the
  // Inspector/Bottom convergence requirement) while still letting raw JSON
  // remain available for advanced/technical editing.
  const [phaseRows, setPhaseRows] = useState<{ name: string; start: number; end: number }[]>(() => (transaction?.phases ?? []).map((phase) => ({ ...phase })));
  const [transactionPhases, setTransactionPhases] = useState(JSON.stringify(transaction?.phases ?? [], null, 2));
  const [transactionStatus, setTransactionStatus] = useState("");
  const previewGroupStyle = (overrides: Partial<SignalGroupStyle> & { readonly showBorder?: boolean } = {}) => {
    if (!group) return;
    const showBorder = overrides.showBorder ?? groupShowBorder;
    const next: SignalGroupStyle = {
      showBackground: overrides.showBackground ?? groupShowBackground,
      background: overrides.background ?? groupBackground,
      opacity: overrides.opacity ?? groupOpacity,
      extend: overrides.extend ?? groupExtend,
      showHeader: overrides.showHeader ?? groupShowHeader,
      ...(showBorder ? { border: overrides.border ?? groupBorder } : {}),
    };
    onGroupPreview?.(group.id, next);
  };
  if (Boolean(signal)) return <InspectorSignalRouter signal={signal as Signal} document={document} viewport={viewport} commands={commands} onReveal={onReveal} onCancel={onCancel} onClose={onClose} renderClock={(props) => <InspectorClockEditor {...props} signal={props.signal as ClockSignal} commands={commands} />} renderValue={(props) => <InspectorValueSignalEditor {...props} signal={props.signal as ValueSignal} commands={commands} />} />;
  if (Boolean(annotation)) return <InspectorAnnotationEditor annotation={annotation as Annotation} document={document} viewport={viewport} commands={commands} onDelete={() => registry.execute("selection.delete")} onCancel={onCancel} onClose={onClose} />;
  if (Boolean(bookmark)) return <InspectorBookmarkEditor bookmark={bookmark as Bookmark} document={document} viewport={viewport} commands={commands} onDelete={onDeleteBookmark} onCancel={onCancel} onClose={onClose} />;
  if (!group && !transaction) return <LayoutInspector document={document} viewport={viewport} commands={commands} onCancel={onCancel} onClose={onClose} />;
  const spacerMoveEditor = group ? <section data-testid="spacer-reorder"><h3>Spacer Reorder</h3>{(group.spacers ?? []).map((spacer) => { const index = group.rows.indexOf(spacer.id); return <div key={spacer.id} data-spacer-reorder-id={spacer.id}><code>{spacer.id}</code><button type="button" aria-label={`Move spacer ${spacer.id} up`} disabled={index <= 0} onClick={() => commands.moveSpacer(spacer.id, group.id, index - 1)}>Up</button><button type="button" aria-label={`Move spacer ${spacer.id} down`} disabled={index < 0 || index >= group.rows.length - 1} onClick={() => commands.moveSpacer(spacer.id, group.id, index + 1)}>Down</button></div>})}</section> : null;
  const spacerEditor = group ? <section data-testid="inspector-spacers"><h3>Spacer Rows</h3><button type="button" data-testid="add-spacer" onClick={() => commands.createSpacer({ id: spacerId(nextEntityId("spacer", document)), height: 24 }, group.id, group.rows.length)}>Add Spacer</button>{(group.spacers ?? []).map((spacer) => <form key={spacer.id} data-spacer-id={spacer.id} onSubmit={(event) => { event.preventDefault(); const height = Number(new FormData(event.currentTarget).get("height")); commands.updateSpacer(spacer.id, height); }}><code>{spacer.id}</code><label>Height<input name="height" aria-label={`Spacer height ${spacer.id}`} type="number" min="1" step="1" defaultValue={spacer.height} /></label><button type="submit">Apply Height</button><button type="button" onClick={() => commands.deleteSpacer(spacer.id)}>Delete</button></form>)}</section> : null;
  const { state: groupSections, toggle: toggleGroupSection } = useInspectorAccordion("group", { general: true, layout: true, appearance: true });
  const { state: transactionSections, toggle: toggleTransactionSection } = useInspectorAccordion("transaction", { general: true, timing: true, phases: true, "linked-signals": true });
  return <aside className="inspector" data-testid="inspector" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <InspectorHeaderBar onClose={onClose} />
    {group && <InspectorSelectionHeader kind="Group" title={group.name} detail={`${group.rows.length} row${group.rows.length === 1 ? "" : "s"}`} />}
    {transaction && <InspectorSelectionHeader kind="Transaction" title="Transaction" detail={`Cycle ${transaction.start}–${transaction.end} · ${transaction.laneId}`} />}
    {!signal && !group && !annotation && !transaction && <section className="inspector-empty">No selection</section>}
    {spacerEditor}
    {spacerMoveEditor}
    {signal && <>
      <section><h3>Signal</h3><div className="property-row"><span>Type</span><b>{signal.type}</b></div><label>Name<input aria-label="Inspector signal name" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name.trim() && name.trim() !== signal.name) registry.execute("selection.rename", { name }); }} /></label><label>Role<select aria-label="Inspector signal role" value={signal.role} disabled><option>{signal.role}</option></select></label><label>Width<input value={signal.type === "bus" ? signal.width ?? "" : 1} readOnly /></label><label className="checkline">Visible<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => { setVisible(event.target.checked); registry.execute("selection.visibility", { visible: event.target.checked }); }} /></label><button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Signal</button></section>
      <section><h3>Layout</h3><div className="property-row"><span>Row height</span><span>{document.layout.rowHeight}px</span></div><div className="property-row"><span>Spacing</span><span>{document.layout.signalSpacing}px</span></div></section>
      {signal.type === "clock" && edgeCounter && <section><h3>Edge Numbers</h3><label className="checkline">Show<input aria-label="Edge Numbers show" type="checkbox" checked={edgeCounter.show} onChange={(event) => setEdgeCounter({ ...edgeCounter, show: event.target.checked })} /></label><label>Mode<select aria-label="Edge Numbers mode" value={edgeCounter.mode} onChange={(event) => setEdgeCounter({ ...edgeCounter, mode: event.target.value as EdgeCounterSettings["mode"] })}><option value="rising">Rising</option><option value="falling">Falling</option><option value="both">Both</option></select></label><label>Start number<input aria-label="Edge Numbers start" type="number" value={edgeCounter.startNumber} onChange={(event) => setEdgeCounter({ ...edgeCounter, startNumber: Number(event.target.value) })} /></label><label>Count from<select aria-label="Edge Numbers count from" value={edgeCounter.countFrom} onChange={(event) => setEdgeCounter({ ...edgeCounter, countFrom: event.target.value as EdgeCounterSettings["countFrom"] })}><option value="signal-start">Signal start</option><option value="selected-edge">Selected edge</option><option value="marker">Marker</option><option value="visible-range-start">Visible range start</option></select></label><label>Every N<input aria-label="Edge Numbers every" type="number" min="1" value={edgeCounter.labelEvery} onChange={(event) => setEdgeCounter({ ...edgeCounter, labelEvery: Number(event.target.value) })} /></label><label>Position<select aria-label="Edge Numbers position" value={edgeCounter.position} onChange={(event) => setEdgeCounter({ ...edgeCounter, position: event.target.value as EdgeCounterSettings["position"] })}><option value="above">Above</option><option value="below">Below</option></select></label><label>X offset<input aria-label="Edge Numbers X" type="number" value={edgeCounter.offset.x} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, x: Number(event.target.value) } })} /></label><label>Y offset<input aria-label="Edge Numbers Y" type="number" value={edgeCounter.offset.y} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, y: Number(event.target.value) } })} /></label><button type="button" onClick={() => commands.updateEdgeCounter(signal.id, edgeCounter)}>Apply Edge Numbers</button></section>}
    </>}
    {group && <>
      <InspectorSection sectionId="general" title="General" open={groupSections.general ?? true} onToggle={() => toggleGroupSection("general")}><label>Name<InlineNameInput target={group} value={group.name} ariaLabel="Inspector group name" onRename={(name) => commands.renameGroup(group.id, name)} onCommitted={setGroupName} onDraftChange={setGroupName} /></label></InspectorSection>
      <InspectorSection sectionId="layout" title="Layout" open={groupSections.layout ?? true} onToggle={() => toggleGroupSection("layout")}>
        <div className="inspector-property-pair"><label>Spacing Before<input aria-label="Group spacing before" type="number" min="0" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label><label>Spacing After<input aria-label="Group spacing after" type="number" min="0" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label></div>
        <div className="property-row"><span>Rows</span><span>{group.rows.length}</span></div>
        <PropertyToggle label="Collapsed" ariaLabel="Inspector group collapsed" checked={collapsedGroup} onChange={() => onToggleGroupCollapse?.()} />
        <small className="inspector-note">Collapse is a view-only layout preference; it does not change Canonical, History, or Dirty state.</small>
      </InspectorSection>
      <InspectorSection sectionId="appearance" title="Appearance" open={groupSections.appearance ?? true} onToggle={() => toggleGroupSection("appearance")}>
        <PropertyToggle label="Show Background" ariaLabel="Group show background" checked={groupShowBackground} onChange={(value) => { setGroupShowBackground(value); previewGroupStyle({ showBackground: value }); }} /><label>Background<input aria-label="Group background" type="color" value={groupBackground} onChange={(event) => { const value = event.target.value; setGroupBackground(value); previewGroupStyle({ background: value }); }} /></label><label>Opacity<input aria-label="Group opacity" type="number" min="0" max="1" step="0.05" value={groupOpacity} onChange={(event) => { const value = Number(event.target.value); setGroupOpacity(value); previewGroupStyle({ opacity: value }); }} /></label><PropertyToggle label="Border" ariaLabel="Group show border" checked={groupShowBorder} onChange={(value) => { setGroupShowBorder(value); previewGroupStyle({ showBorder: value }); }} /><label>Border Color<input aria-label="Group border" value={groupBorder} onChange={(event) => { const value = event.target.value; setGroupBorder(value); previewGroupStyle({ border: value }); }} /></label><label>Extend<select aria-label="Group extend" value={groupExtend} onChange={(event) => { const value = event.target.value as typeof groupExtend; setGroupExtend(value); previewGroupStyle({ extend: value }); }}><option value="label">Label</option><option value="waveform">Waveform</option><option value="both">Both</option></select></label><PropertyToggle label="Show Header" ariaLabel="Group show header" checked={groupShowHeader} onChange={(value) => { setGroupShowHeader(value); previewGroupStyle({ showHeader: value }); }} />
      </InspectorSection>
      <InspectorFooter onCancel={onCancel} onApply={() => commands.updateGroupProperties({ groupId: group.id, name: groupName, spacingBefore, spacingAfter, style: { showBackground: groupShowBackground, background: groupBackground, opacity: groupOpacity, extend: groupExtend, ...(groupShowBorder ? { border: groupBorder } : {}), showHeader: groupShowHeader } })} applyDisabled={false} applyTestId="apply-group-properties" />
    </>}
    {transaction && <>
      <InspectorSection sectionId="general" title="General" open={transactionSections.general ?? true} onToggle={() => toggleTransactionSection("general")}>
        <div className="property-row"><span>ID</span><code title={transaction.id}>{transaction.id}</code></div>
        <label>Name<input aria-label="Transaction name" value={transactionName} onChange={(event) => setTransactionName(event.target.value)} /></label>
        <label>Group<select aria-label="Transaction group" value={transactionGroupId} onChange={(event) => setTransactionGroupId(event.target.value)}><option value="">Ungrouped</option>{document.transactionGroups?.map((groupOption) => <option key={groupOption.id} value={groupOption.id}>{groupOption.name}</option>)}</select></label>
        <label>Color<span className="inspector-field-with-help"><input aria-label="Transaction color" type="color" value={transactionColor || document.transactionGroups?.find((groupOption) => groupOption.id === (transactionGroupId || undefined))?.color || "#8895a7"} onChange={(event) => setTransactionColor(event.target.value)} />{transactionColor && <button type="button" data-testid="transaction-use-group-color" onClick={() => setTransactionColor("")}>Use Group Color</button>}</span></label>
      </InspectorSection>
      <InspectorSection sectionId="timing" title="Timing" open={transactionSections.timing ?? true} onToggle={() => toggleTransactionSection("timing")}>
        <div className="inspector-property-pair"><label>Start<input aria-label="Transaction start" type="number" min="0" max={transactionEnd - 1} value={transactionStart} onChange={(event) => setTransactionStart(Number(event.target.value))} /></label><label>End<input aria-label="Transaction end" type="number" min={transactionStart + 1} max={document.timeline.cycleCount} value={transactionEnd} onChange={(event) => setTransactionEnd(Number(event.target.value))} /></label></div>
        <div className="property-row"><span>Duration</span><span>{transactionEnd - transactionStart} cycles</span></div>
        <label>Lane<span className="inspector-field-with-help"><input aria-label="Transaction lane" value={transactionLane} onChange={(event) => setTransactionLane(event.target.value)} /><span className="field-help" tabIndex={0} title="A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track." aria-label="About Lane">ⓘ</span></span></label>
      </InspectorSection>
      <InspectorSection sectionId="phases" title="Phases" count={phaseRows.length} onAdd={() => setPhaseRows((rows) => { const last = rows.at(-1); const start = last ? last.end : transactionStart; return [...rows, { name: `Phase ${rows.length + 1}`, start, end: Math.min(start + 1, transactionEnd) }]; })} open={transactionSections.phases ?? true} onToggle={() => toggleTransactionSection("phases")}>
        <div className="transaction-phase-editor" data-testid="transaction-phase-editor"><div className="transaction-phase-table">{phaseRows.length > 0 && <div className="transaction-phase-row transaction-phase-row-header" aria-hidden="true"><span>Phase</span><span>Start</span><span>End</span><span /></div>}{phaseRows.map((phase, index) => <div className="transaction-phase-row" key={index} data-phase-index={index}><input aria-label={`Phase ${index + 1} name`} value={phase.name} onChange={(event) => setPhaseRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} /><input aria-label={`Phase ${index + 1} start`} type="number" value={phase.start} onChange={(event) => setPhaseRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, start: Number(event.target.value) } : row))} /><input aria-label={`Phase ${index + 1} end`} type="number" value={phase.end} onChange={(event) => setPhaseRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, end: Number(event.target.value) } : row))} /><button type="button" aria-label={`Delete phase ${index + 1}`} onClick={() => setPhaseRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>×</button></div>)}{phaseRows.length === 0 && <span className="inspector-note">No phases -- the whole Start..End span is one unnamed phase.</span>}</div><button type="button" data-testid="add-transaction-phase" onClick={() => setPhaseRows((rows) => { const last = rows.at(-1); const start = last ? last.end : transactionStart; return [...rows, { name: `Phase ${rows.length + 1}`, start, end: Math.min(start + 1, transactionEnd) }]; })}>Add Phase</button><details className="transaction-phase-advanced"><summary>Advanced: edit as JSON</summary><label>Phases JSON<textarea aria-label="Transaction phases" rows={5} value={transactionPhases} onChange={(event) => setTransactionPhases(event.target.value)} spellCheck={false} /></label><button type="button" data-testid="apply-phases-json" onClick={() => { try { const phases = JSON.parse(transactionPhases) as unknown; if (!Array.isArray(phases) || phases.some((phase) => typeof phase !== "object" || phase === null || typeof (phase as { name?: unknown }).name !== "string" || !Number.isInteger((phase as { start?: unknown }).start) || !Number.isInteger((phase as { end?: unknown }).end))) throw new Error("Phases must be an array of {name,start,end} objects."); setPhaseRows(phases as typeof phaseRows); setTransactionStatus(""); } catch (error) { setTransactionStatus(error instanceof Error ? error.message : "Invalid phases JSON"); } }}>Apply JSON to table</button></details></div>
      </InspectorSection>
      <InspectorSection sectionId="linked-signals" title="Linked Signals" count={transaction.linkedSignals?.length ?? 0} onAdd={() => {}} open={transactionSections["linked-signals"] ?? true} onToggle={() => toggleTransactionSection("linked-signals")}>
        <TransactionLinkedSignals transaction={transaction} document={document} onToggle={(signalId) => onToggleTransactionSignal(transaction.id, signalId)} renderUnlinkButton={(label, onClick) => <EditorIconButton label={label} icon="close" onClick={onClick} />} />
      </InspectorSection>
      {transactionStatus && <output role="status">{transactionStatus}</output>}
      <section><button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Transaction</button></section>
      <InspectorFooter onCancel={onCancel} onApply={() => { const phases = phaseRows.map((phase) => ({ ...phase, name: phase.name.trim() })); if (phases.some((phase) => !phase.name || !Number.isInteger(phase.start) || !Number.isInteger(phase.end) || phase.start < transactionStart || phase.start >= phase.end || phase.end > transactionEnd)) { setTransactionStatus("Phases must be named integer-cycle half-open subranges within Start..End."); return; } setTransactionStatus(""); commands.updateTransaction({ transactionId: transaction.id, name: transactionName, start: transactionStart, end: transactionEnd, laneId: transactionLane, phases, ...(transactionGroupId ? { groupId: transactionGroupId as TransactionGroup["id"] } : {}), ...(transactionColor ? { color: transactionColor } : {}) }); }} applyDisabled={transactionName === transaction.name && transactionStart === transaction.start && transactionEnd === transaction.end && transactionLane === (transaction.laneId ?? "lane_0") && transactionGroupId === (transaction.groupId ?? "") && transactionColor === (transaction.color ?? "") && JSON.stringify(phaseRows) === JSON.stringify(transaction.phases ?? [])} applyTestId="apply-inspector-transaction" />
    </>}
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}

export function InspectorValueSignalEditor({ signal, document, viewport, commands, onReveal, onCancel, onClose }: { readonly signal: ValueSignal; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly commands: EditorSurfaceCommandController; readonly onReveal: () => void; readonly onCancel: () => void; readonly onClose: () => void }) {
  const [name, setName] = useState(signal.display.name);
  const [role, setRole] = useState<SignalRole>(signal.role);
  const [signalType, setSignalType] = useState<ValueSignal["type"]>(signal.type);
  const [width, setWidth] = useState(signal.width ?? 1);
  const [format, setFormat] = useState<NonNullable<ValueSignal["displayFormat"]>>(signal.displayFormat ?? "hex");
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
  useEffect(() => {
    const nextStyle = signal.display.style ?? {};
    const nextStyleJson = JSON.stringify(nextStyle);
    setName((current) => current === signal.display.name ? current : signal.display.name);
    setRole((current) => current === signal.role ? current : signal.role);
    setSignalType((current) => current === signal.type ? current : signal.type);
    setWidth((current) => current === (signal.width ?? 1) ? current : signal.width ?? 1);
    setFormat((current) => current === (signal.displayFormat ?? "hex") ? current : signal.displayFormat ?? "hex");
    setVisible((current) => current === (signal.display.visible !== false) ? current : signal.display.visible !== false);
    setSpacingBefore((current) => current === (signal.spacingBefore ?? 0) ? current : signal.spacingBefore ?? 0);
    setSpacingAfter((current) => current === (signal.spacingAfter ?? 0) ? current : signal.spacingAfter ?? 0);
    setAlign((current) => current === (signal.display.align ?? "left") ? current : signal.display.align ?? "left");
    setOverflow((current) => current === (signal.display.overflow ?? "ellipsis") ? current : signal.display.overflow ?? "ellipsis");
    setStyle((current) => current === nextStyleJson ? current : nextStyleJson);
    setTextColor((current) => current === styleString(nextStyle, "color", "#152033") ? current : styleString(nextStyle, "color", "#152033"));
    setRowBackground((current) => current === styleString(nextStyle, "background", "#ffffff") ? current : styleString(nextStyle, "background", "#ffffff"));
    setFontFamily((current) => current === styleString(nextStyle, "fontFamily", "Segoe UI") ? current : styleString(nextStyle, "fontFamily", "Segoe UI"));
    setFontSize((current) => current === styleNumber(nextStyle, "fontSize", 12) ? current : styleNumber(nextStyle, "fontSize", 12));
    setBold((current) => current === (nextStyle.fontWeight === "bold") ? current : nextStyle.fontWeight === "bold");
    setItalic((current) => current === (nextStyle.fontStyle === "italic") ? current : nextStyle.fontStyle === "italic");
    setUnderline((current) => current === styleString(nextStyle, "textDecoration", "").includes("underline") ? current : styleString(nextStyle, "textDecoration", "").includes("underline"));
    setStrikethrough((current) => current === styleString(nextStyle, "textDecoration", "").includes("line-through") ? current : styleString(nextStyle, "textDecoration", "").includes("line-through"));
    setWaveformColor((current) => current === styleString(nextStyle, "waveformColor", "#111111") ? current : styleString(nextStyle, "waveformColor", "#111111"));
    setWaveformBackground((current) => current === styleString(nextStyle, "waveformBackground", "#ffffff") ? current : styleString(nextStyle, "waveformBackground", "#ffffff"));
    setProblem("");
  }, [signal]);
  // #402/#426 (Bottom Panel Visual Reference pass): Inspector is now the
  // sole owner of these lightweight Signal properties (Bottom's own
  // duplicate Name/Role/Type/Spacing form + "Apply properties" button was
  // removed from signal-editor.tsx) -- Apply must therefore carry the same
  // Draft/Apply disabled-when-unchanged contract Bottom's form used to
  // have, so a no-op submit here can't manufacture an empty History
  // entry either. `name` is excluded for the same reason Bottom's version
  // excluded it: InlineNameInput's own onRename already commits
  // immediately on its own gesture. The style-object comparison mirrors
  // `apply`'s own structured-style computation below (kept as a plain
  // JSON-text compare here -- an equivalent-but-differently-formatted
  // Draft only means Apply stays spuriously enabled, never that a real
  // change goes undetected).
  const originalStyleForCompare = signal.display.style ?? {};
  // Section 4/9 (Reference v2): a real per-field count, not just a
  // boolean -- drives the sticky footer's "● N changes" indicator. Kept
  // as one array so hasChanges (the gate) and changeCount (the label)
  // can never silently drift out of sync with each other.
  const changedFields = [
    role !== signal.role,
    signalType !== signal.type,
    signalType === "bus" && width !== (signal.width ?? 1),
    signalType === "bus" && format !== (signal.displayFormat ?? "hex"),
    visible !== (signal.display.visible !== false),
    spacingBefore !== (signal.spacingBefore ?? 0),
    spacingAfter !== (signal.spacingAfter ?? 0),
    align !== (signal.display.align ?? "left"),
    overflow !== (signal.display.overflow ?? "ellipsis"),
    style !== JSON.stringify(originalStyleForCompare),
    textColor !== styleString(originalStyleForCompare, "color", "#152033"),
    rowBackground !== styleString(originalStyleForCompare, "background", "#ffffff"),
    fontFamily !== styleString(originalStyleForCompare, "fontFamily", "Segoe UI"),
    fontSize !== styleNumber(originalStyleForCompare, "fontSize", 12),
    bold !== (originalStyleForCompare.fontWeight === "bold"),
    italic !== (originalStyleForCompare.fontStyle === "italic"),
    underline !== styleString(originalStyleForCompare, "textDecoration", "").includes("underline"),
    strikethrough !== styleString(originalStyleForCompare, "textDecoration", "").includes("line-through"),
    waveformColor !== styleString(originalStyleForCompare, "waveformColor", "#111111"),
    waveformBackground !== styleString(originalStyleForCompare, "waveformBackground", "#ffffff"),
  ];
  const changeCount = changedFields.filter(Boolean).length;
  const hasChanges = changeCount > 0;
  const apply = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!hasChanges) return;
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
    // #473: `style`/`parsedStyle` is no longer user-editable raw JSON -- it's
    // just a passive mirror of the already-committed signal style (kept only
    // so unknown/legacy keys survive Apply, see the comment on the removed
    // textarea above). It must therefore never shadow a live structured-field
    // edit: once any Apply has ever set e.g. `color`, `parsedStyle.color`
    // would be a string forever, permanently overriding every subsequent
    // `textColor` edit if it were preferred here (this was the #473 NO_OP
    // regression). The structured fields (current control state) always win;
    // `parsedStyle` only fills in for keys these controls don't cover.
    const structuredStyle = { color: textColor, background: rowBackground, fontFamily, fontSize, fontWeight: bold ? "bold" : "normal", fontStyle: italic ? "italic" : "normal", textDecoration: decorations, waveformColor, waveformBackground };
    const originalStyle = signal.display.style ?? {};
    const styleDraftChanged = JSON.stringify(parsedStyle) !== JSON.stringify(originalStyle)
      || textColor !== styleString(originalStyle, "color", "#152033")
      || rowBackground !== styleString(originalStyle, "background", "#ffffff")
      || fontFamily !== styleString(originalStyle, "fontFamily", "Segoe UI")
      || fontSize !== styleNumber(originalStyle, "fontSize", 12)
      || bold !== (originalStyle.fontWeight === "bold")
      || italic !== (originalStyle.fontStyle === "italic")
      || underline !== styleString(originalStyle, "textDecoration", "").includes("underline")
      || strikethrough !== styleString(originalStyle, "textDecoration", "").includes("line-through")
      || waveformColor !== styleString(originalStyle, "waveformColor", "#111111")
      || waveformBackground !== styleString(originalStyle, "waveformBackground", "#ffffff");
     commands.updateSignalProperties({ signalId: signal.id, name, role, signalType, ...(signalType === "bus" ? { width, displayFormat: format } : {}), visible, ...(signal.spacingBefore === undefined && spacingBefore === 0 ? {} : { spacingBefore }), ...(signal.spacingAfter === undefined && spacingAfter === 0 ? {} : { spacingAfter }), displayAlign: align, displayOverflow: overflow, ...(styleDraftChanged ? { displayStyle: { ...parsedStyle, ...structuredStyle } } : {}) });
  };
  const fullPath = [...signal.source.instancePath, signal.source.signalName].join(".") || signal.source.signalName;
  const signalTypeLabel = signal.type === "binary" ? "Signal" : signal.type === "bus" ? "Bus" : signal.type === "logic" ? "Level" : signal.type === "pulse" ? "Pulse" : signal.type.charAt(0).toUpperCase() + signal.type.slice(1);
  return <aside className="inspector" data-testid="inspector" data-inspector-context="signal" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <InspectorHeaderBar onClose={onClose} />
    <InspectorSelectionHeader iconKind="signal" kind={`${role.charAt(0).toUpperCase() + role.slice(1)} · ${signalTypeLabel}`} title={name || signal.display.name} detail={fullPath} />
    <form className="inspector-signal-properties" data-testid="inspector-signal-properties" onSubmit={apply}>
      <InspectorSection sectionId="signal-properties" title="Signal Properties" open={sections["signal-properties"] ?? true} onToggle={() => toggle("signal-properties")}>
         <label>Display Name<InlineNameInput target={signal} value={signal.display.name} ariaLabel="Inspector signal name" onRename={(nextName) => commands.renameSignal(signal.id, nextName)} onCommitted={setName} onDraftChange={setName} /></label>
        <label>Role<select aria-label="Inspector signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
        <label>Type<select aria-label="Inspector signal type" value={signalType} onChange={(event) => setSignalType(event.target.value as ValueSignal["type"])}><option value="binary">Signal</option><option value="bus">Bus</option><option value="state">State</option><option value="logic">Level</option><option value="event">Event</option>{
          // #400: Pulse is legacy-only -- never offered as a type to switch
          // *into*, but a signal that already is Pulse must stay editable
          // (including its own Type field staying visibly "Pulse") rather
          // than silently losing its own current value from this list.
          signal.type === "pulse" && <option value="pulse">Pulse (legacy)</option>
        }</select></label>
        {signalType === "bus" && <><label>Width<input aria-label="Inspector signal width" type="number" min="1" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>Bus format<select aria-label="Inspector bus format" value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="hex">Hex</option><option value="binary">Binary</option><option value="decimal">Decimal</option><option value="signed">Signed</option><option value="unsigned">Unsigned</option><option value="symbolic">Symbol</option></select></label></>}
        <PropertyToggle label="Visible" ariaLabel="Inspector signal visible" checked={visible} onChange={setVisible} />
        <label>Spacing Before<input aria-label="Inspector signal spacing before" type="number" min="0" step="1" value={spacingBefore} onChange={(event) => setSpacingBefore(Number(event.target.value))} /></label>
        <label>Spacing After<input aria-label="Inspector signal spacing after" type="number" min="0" step="1" value={spacingAfter} onChange={(event) => setSpacingAfter(Number(event.target.value))} /></label>
      </InspectorSection>
      {/* #470: "Source / Hierarchy" (Instance Path / Signal Name / Full Path /
          Bus Range / Reveal in Hierarchy) is hidden from the normal Inspector
          -- there is no RTL/hierarchy import workflow yet, so the section
          only advertised an editable-looking feature users can't actually
          configure. The underlying `signal.source` metadata is untouched in
          Canonical/schema/persistence; only this read-only display and its
          Reveal button are removed from the production UI. Restore/rework
          through a dedicated Issue once a real import workflow exists. */}
      <InspectorSection sectionId="label-style" title="Label Style" open={sections["label-style"] ?? false} onToggle={() => toggle("label-style")}><label>Text Color<input aria-label="Inspector text color" type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label><label>Background<input aria-label="Inspector label background" type="color" value={rowBackground} onChange={(event) => setRowBackground(event.target.value)} /></label><label>Font<input aria-label="Inspector label font" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} /></label><label>Size<input aria-label="Inspector label size" type="number" min="6" max="48" step="1" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label><div className="inspector-style-checks"><PropertyToggle label="Bold" ariaLabel="Inspector label bold" checked={bold} onChange={setBold} /><PropertyToggle label="Italic" ariaLabel="Inspector label italic" checked={italic} onChange={setItalic} /><PropertyToggle label="Underline" ariaLabel="Inspector label underline" checked={underline} onChange={setUnderline} /><PropertyToggle label="Strikethrough" ariaLabel="Inspector label strikethrough" checked={strikethrough} onChange={setStrikethrough} /></div><label>Align<select aria-label="Inspector label align" value={align} onChange={(event) => setAlign(event.target.value as typeof align)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Overflow<select aria-label="Inspector label overflow" value={overflow} onChange={(event) => setOverflow(event.target.value as typeof overflow)}><option value="ellipsis">Ellipsis</option><option value="expand">Expand</option><option value="wrap">Wrap</option></select></label></InspectorSection>
      {/* #473: the raw "Advanced Style JSON" textarea is removed from
          normal Inspector use -- every style property it could set is
          already reachable through this section's own structured
          controls (or Label Style's, above). `style`/`setStyle` stay as
          local state (still round-tripped through `apply()`'s merge
          below) purely so a document that already has extra/legacy
          style keys on this Signal keeps them intact through Apply --
          removing the UI must not silently drop data, only the raw-JSON
          editing affordance itself. */}
      <InspectorSection sectionId="waveform" title="Waveform / Row Style" open={sections.waveform ?? true} onToggle={() => toggle("waveform")}><label>Waveform Color<input aria-label="Inspector waveform color" type="color" value={waveformColor} onChange={(event) => setWaveformColor(event.target.value)} /></label><label>Row Background<input aria-label="Inspector waveform background" type="color" value={waveformBackground} onChange={(event) => setWaveformBackground(event.target.value)} /></label></InspectorSection>
      {problem && <div className="editor-problem" role="alert">{problem}</div>}
      {/* Kept as its own hidden `<output>` (not just InspectorFooter's
          generic counter) so the established
          `data-testid="inspector-signal-unapplied"` contract every prior
          test/spec keys off keeps working unchanged. */}
      {hasChanges && <output className="draft-unapplied-indicator" data-testid="inspector-signal-unapplied" hidden>● Signal properties: unapplied changes</output>}
      <InspectorFooter changeCount={changeCount} onCancel={onCancel} onApply={apply} applyDisabled={!hasChanges} applyTestId="apply-inspector-signal" />
    </form>
    <MiniMap document={document} viewport={viewport} />
  </aside>;
}
