import { cyclesPerTc, cyclesToTc, tcFieldLabel, tcToCycles, tcUnitLabel } from "../transaction-tc.js";
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
import { documentProblemRuleDescriptor, quickValueLiteral, quickValueOptions, type Annotation, type AnnotationId, type AnnotationType, type Bookmark, type BookmarkId, type CanonicalDocument, type ClockGenerator, type ClockSignal, type CommandId, type CommentRow, type DocumentProblem, type EdgeCounterSettings, type GroupId, type LegendEntry, type ParsedCanonicalDocument, type ResetSemantics, type SemanticAnchor, type Signal, type SignalGroup, type SignalGroupStyle, type SignalId, type SignalRole, type SpacerId, type SpacerRow, type TimeGroupId, type Transaction, type TransactionGroup, type TransactionId, type ValueSignal } from "@timing-chart-v2/schema";
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
import { addPhaseToDraft, canAddPhase, clearPhaseDraft, commitPhaseRows, TransactionPhaseEditor, usePendingPhaseDraft } from "../transaction-bottom-tabs.js";
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
import { InspectorMultiSelection } from "../inspector-multi-selection.js";
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
import { SIGNAL_TYPE_OPTIONS, signalTypeLabel as sharedSignalTypeLabel } from "../runtime/signal-type-registry.js";


const spacerId = (value: string) => value as SpacerId;

function InspectorSpacerDraft({ spacer, onApply, onDelete }: { readonly spacer: SpacerRow; readonly onApply: (height: number) => void; readonly onDelete: () => void }) {
  const [draft, setDraft] = useState(String(spacer.height));
  useEffect(() => {
    setDraft(String(spacer.height));
  }, [spacer.id, spacer.height]);
  const height = Number(draft);
  const valid = draft.trim().length > 0 && Number.isFinite(height) && height > 0;
  const dirty = draft !== String(spacer.height);
  const changed = valid && height !== spacer.height;
  const error = dirty && !valid ? "Spacer height must be a finite positive number." : "";
  return <form data-spacer-id={spacer.id} onSubmit={(event) => {
    event.preventDefault();
    if (changed) onApply(height);
  }}>
    <code>{spacer.id}</code>
    <label>Height<input name="height" aria-label={`Spacer height ${spacer.id}`} aria-invalid={error ? true : undefined} type="number" min="1" step="1" value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
    {error && <span role="alert" className="editor-problem">{error}</span>}
    {changed && <span className="draft-unapplied-indicator" role="status">Unapplied changes</span>}
    <button type="submit" disabled={!changed}>Apply Height</button>
    <button type="button" onClick={() => setDraft(String(spacer.height))} disabled={!dirty}>Cancel</button>
    <button type="button" onClick={onDelete}>Delete</button>
  </form>;
}

export function InspectorPanel({ signal, selectedSignalIds, group, annotation, transaction, bookmark, collapsedGroup, onToggleGroupCollapse, registry, document, viewport, commands, onReveal, onCancel, onClose, onDeleteBookmark, onToggleTransactionSignal, onGroupPreview, onAnnotationPreview, minimapMode = "signal" }: { readonly signal: Signal | undefined; readonly selectedSignalIds?: ReadonlySet<SignalId>; readonly group: SignalGroup | undefined; readonly annotation: Annotation | undefined; readonly transaction: Transaction | undefined; readonly bookmark: Bookmark | undefined; readonly collapsedGroup: boolean; readonly onToggleGroupCollapse: (() => void) | undefined; readonly registry: UiCommandRegistry; readonly document: Readonly<CanonicalDocument>; readonly viewport: RefObject<HTMLDivElement | null>; readonly commands: EditorSurfaceCommandController; readonly onReveal: () => void; readonly onCancel: () => void; readonly onClose: () => void; readonly onDeleteBookmark: () => void; readonly onToggleTransactionSignal: (transactionId: TransactionId, signalId: SignalId) => void; readonly onGroupPreview?: (groupId: GroupId, style: SignalGroupStyle | undefined) => void; readonly onAnnotationPreview?: (annotationId: AnnotationId, draft: { readonly label?: string; readonly color?: string; readonly opacity?: number } | undefined) => void; readonly minimapMode?: "signal" | "transaction" }) {
  if ((selectedSignalIds?.size ?? 0) > 1) return <InspectorMultiSelection count={selectedSignalIds!.size} registry={registry} document={document} viewport={viewport} onCancel={onCancel} onClose={onClose} />;
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
  const phaseDraft = usePendingPhaseDraft(transaction);
  const [transactionName, setTransactionName] = useState(transaction?.name ?? "");
  const tcPer = cyclesPerTc(document);
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
  // #454: General section's "Description/Comment" field -- Canonical
  // already carries `Transaction.description` (round-tripped through
  // Save/Open and the existing transaction.update command), it just had
  // no Inspector control to read/write it. Same full-replace-from-command
  // semantics as Color/Group above: an empty Draft clears a previously
  // committed description, it isn't "leave whatever was there".
  const [transactionDescription, setTransactionDescription] = useState(transaction?.description ?? "");
  const [transactionStatus, setTransactionStatus] = useState("");
  // Keep the draft owner mounted across unrelated commands, but refresh its
  // committed fields only when the selected Transaction itself changes. A
  // linked-signal command replaces the Transaction object while the user may
  // still be editing phases/name/group/color/description; syncing on every
  // entity-field dependency would silently discard that draft before Apply.
  const committedTransactionRef = useRef<{ id: string | undefined; name: string; start: number; end: number; lane: string; group: string; color: string; description: string }>({ id: undefined, name: "", start: 0, end: 1, lane: "lane_0", group: "", color: "", description: "" });
  useEffect(() => {
    const previous = committedTransactionRef.current;
    const sameDraft = previous.id === transaction?.id
      && transactionName === previous.name && transactionStart === previous.start && transactionEnd === previous.end
      && transactionLane === previous.lane && transactionGroupId === previous.group && transactionColor === previous.color
      && transactionDescription === previous.description;
    if (previous.id !== transaction?.id || sameDraft) {
    setTransactionName(transaction?.name ?? "");
    setTransactionStart(transaction?.start ?? 0);
    setTransactionEnd(transaction?.end ?? 1);
    setTransactionLane(transaction?.laneId ?? "lane_0");
    setTransactionGroupId(transaction?.groupId ?? "");
    setTransactionColor(transaction?.color ?? "");
    setTransactionDescription(transaction?.description ?? "");
    setTransactionStatus("");
    }
    committedTransactionRef.current = { id: transaction?.id, name: transaction?.name ?? "", start: transaction?.start ?? 0, end: transaction?.end ?? 1, lane: transaction?.laneId ?? "lane_0", group: transaction?.groupId ?? "", color: transaction?.color ?? "", description: transaction?.description ?? "" };
  }, [transaction?.id, transaction?.name, transaction?.start, transaction?.end, transaction?.laneId, transaction?.groupId, transaction?.color, transaction?.description]);
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
  if (Boolean(annotation)) return <InspectorAnnotationEditor key={(annotation as Annotation).id} annotation={annotation as Annotation} document={document} viewport={viewport} commands={commands} onDelete={() => registry.execute("selection.delete")} onCancel={onCancel} onClose={onClose} {...(onAnnotationPreview ? { onPreview: onAnnotationPreview } : {})} />;
  if (Boolean(bookmark)) return <InspectorBookmarkEditor bookmark={bookmark as Bookmark} document={document} viewport={viewport} commands={commands} onDelete={onDeleteBookmark} onCancel={onCancel} onClose={onClose} />;
  if (!group && !transaction) return <LayoutInspector document={document} viewport={viewport} commands={commands} onCancel={onCancel} onClose={onClose} minimapMode={minimapMode} />;
  const spacerMoveEditor = group ? <section data-testid="spacer-reorder"><h3>Spacer Reorder</h3>{(group.spacers ?? []).map((spacer) => { const index = group.rows.indexOf(spacer.id); return <div key={spacer.id} data-spacer-reorder-id={spacer.id}><code>{spacer.id}</code><button type="button" aria-label={`Move spacer ${spacer.id} up`} disabled={index <= 0} onClick={() => commands.moveSpacer(spacer.id, group.id, index - 1)}>Up</button><button type="button" aria-label={`Move spacer ${spacer.id} down`} disabled={index < 0 || index >= group.rows.length - 1} onClick={() => commands.moveSpacer(spacer.id, group.id, index + 1)}>Down</button></div>})}</section> : null;
  const spacerEditor = group ? <section data-testid="inspector-spacers"><h3>Spacer Rows</h3><button type="button" data-testid="add-spacer" onClick={() => commands.createSpacer({ id: spacerId(nextEntityId("spacer", document)), height: 24 }, group.id, group.rows.length)}>Add Spacer</button>{(group.spacers ?? []).map((spacer) => <InspectorSpacerDraft key={spacer.id} spacer={spacer} onApply={(height) => commands.updateSpacer(spacer.id, height)} onDelete={() => commands.deleteSpacer(spacer.id)} />)}</section> : null;
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
      <section><h3>Signal</h3><div className="property-row"><span>Type</span><b>{sharedSignalTypeLabel(signal.type)}</b></div><label>Name<input aria-label="Inspector signal name" value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name.trim() && name.trim() !== signal.name) registry.execute("selection.rename", { name }); }} /></label><label>Role<select aria-label="Inspector signal role" value={signal.role} disabled><option>{signal.role}</option></select></label><label>Width<input value={signal.type === "bus" ? signal.width ?? "" : 1} readOnly /></label><label className="checkline">Visible<input aria-label="Inspector signal visible" type="checkbox" checked={visible} onChange={(event) => { setVisible(event.target.checked); registry.execute("selection.visibility", { visible: event.target.checked }); }} /></label><button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Signal</button></section>
      <section><h3>Layout</h3><div className="property-row"><span>Row height</span><span>{document.layout.rowHeight}px</span></div><div className="property-row"><span>Spacing</span><span>{document.layout.signalSpacing}px</span></div></section>
      {signal.type === "clock" && edgeCounter && <section><h3>Edge Numbers</h3><label className="checkline">Show<input aria-label="Edge Numbers show" type="checkbox" checked={edgeCounter.show} onChange={(event) => setEdgeCounter({ ...edgeCounter, show: event.target.checked })} /></label><label>Mode<select aria-label="Edge Numbers mode" value={edgeCounter.mode} onChange={(event) => setEdgeCounter({ ...edgeCounter, mode: event.target.value as EdgeCounterSettings["mode"] })}><option value="rising">Rising</option><option value="falling">Falling</option><option value="both">Both</option></select></label><label>Start number<input aria-label="Edge Numbers start" type="number" value={edgeCounter.startNumber} onChange={(event) => setEdgeCounter({ ...edgeCounter, startNumber: Number(event.target.value) })} /></label><label>Count from<select aria-label="Edge Numbers count from" value={edgeCounter.countFrom} onChange={(event) => setEdgeCounter({ ...edgeCounter, countFrom: event.target.value as EdgeCounterSettings["countFrom"] })}><option value="signal-start">Signal start</option><option value="selected-edge">Selected edge</option><option value="marker">Marker</option><option value="visible-range-start">Visible range start</option></select></label><label>Every N<input aria-label="Edge Numbers every" type="number" min="1" value={edgeCounter.labelEvery} onChange={(event) => setEdgeCounter({ ...edgeCounter, labelEvery: Number(event.target.value) })} /></label><label>Position<select aria-label="Edge Numbers position" value={edgeCounter.position} onChange={(event) => setEdgeCounter({ ...edgeCounter, position: event.target.value as EdgeCounterSettings["position"] })}><option value="above">Above</option><option value="below">Below</option></select></label><label>X offset<input aria-label="Edge Numbers X" type="number" value={edgeCounter.offset.x} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, x: Number(event.target.value) } })} /></label><label>Y offset<input aria-label="Edge Numbers Y" type="number" value={edgeCounter.offset.y} onChange={(event) => setEdgeCounter({ ...edgeCounter, offset: { ...edgeCounter.offset, y: Number(event.target.value) } })} /></label><button type="button" onClick={() => commands.updateEdgeCounter(signal.id, edgeCounter)}>Apply Edge Numbers</button></section>}
    </>}
    {group && <>
      {/* #426 Visual Quality Closure: this branch (and Transaction's below)
          used to render its sections as direct children of `.inspector`
          with no scroll wrapper -- `.inspector`'s own `overflow: hidden`
          combined with the `.inspector > form { overflow: auto }` rule
          only ever helping variants that wrap in a top-level `<form>`
          (Signal/Annotation/Bookmark) silently clipped anything past the
          visible height here with NO way to reach it (confirmed via
          measurement: `Delete Transaction` sat ~270px below the clipped
          edge, completely unreachable). `.inspector-scroll` is the exact
          existing utility class inspector-clock-editor.tsx already
          established for this same non-`<form>`-wrapped shape -- reused
          verbatim, not a new one-off wrapper. The sticky footer stays a
          sibling AFTER it (outside the scroll), same as Clock's. */}
      <div className="inspector-scroll">
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
      </div>
      <InspectorFooter onCancel={onCancel} onApply={() => commands.updateGroupProperties({ groupId: group.id, name: groupName, spacingBefore, spacingAfter, style: { showBackground: groupShowBackground, background: groupBackground, opacity: groupOpacity, extend: groupExtend, ...(groupShowBorder ? { border: groupBorder } : {}), showHeader: groupShowHeader } })} applyDisabled={false} applyTestId="apply-group-properties" />
    </>}
    {transaction && <>
      <div className="inspector-scroll">
      <InspectorSection sectionId="general" title="General" open={transactionSections.general ?? true} onToggle={() => toggleTransactionSection("general")}>
        <div className="property-row"><span>ID</span><code title={transaction.id}>{transaction.id}</code></div>
        <label>Name<input aria-label="Transaction name" value={transactionName} onChange={(event) => setTransactionName(event.target.value)} /></label>
        <label>Group<select aria-label="Transaction group" value={transactionGroupId} onChange={(event) => setTransactionGroupId(event.target.value)}><option value="">Ungrouped</option>{document.transactionGroups?.map((groupOption) => <option key={groupOption.id} value={groupOption.id}>{groupOption.name}</option>)}</select></label>
        <label>Color<span className="inspector-field-with-help"><input aria-label="Transaction color" type="color" value={transactionColor || document.transactionGroups?.find((groupOption) => groupOption.id === (transactionGroupId || undefined))?.color || "#8895a7"} onChange={(event) => setTransactionColor(event.target.value)} />{transactionColor && <button type="button" data-testid="transaction-use-group-color" onClick={() => setTransactionColor("")}>Use Group Color</button>}</span></label>
        <label>Description<textarea aria-label="Transaction description" rows={2} value={transactionDescription} onChange={(event) => setTransactionDescription(event.target.value)} /></label>
      </InspectorSection>
      <InspectorSection sectionId="timing" title="Timing" open={transactionSections.timing ?? true} onToggle={() => toggleTransactionSection("timing")}>
        <div className="inspector-property-pair"><label>{tcFieldLabel("Start", tcPer)}<input aria-label="Transaction start" type="number" min="0" max={cyclesToTc(transactionEnd - 1, tcPer)} step={tcPer === 1 ? 1 : 1 / tcPer} value={cyclesToTc(transactionStart, tcPer)} onChange={(event) => setTransactionStart(tcToCycles(Number(event.target.value), tcPer))} /></label><label>{tcFieldLabel("End", tcPer)}<input aria-label="Transaction end" type="number" min={cyclesToTc(transactionStart + 1, tcPer)} max={cyclesToTc(document.timeline.cycleCount, tcPer)} step={tcPer === 1 ? 1 : 1 / tcPer} value={cyclesToTc(transactionEnd, tcPer)} onChange={(event) => setTransactionEnd(tcToCycles(Number(event.target.value), tcPer))} /></label></div>
        <div className="property-row"><span>Duration</span><span>{cyclesToTc(transactionEnd - transactionStart, tcPer)} {tcUnitLabel(tcPer)}{tcPer === 1 ? "" : ` (${transactionEnd - transactionStart} cycles)`}</span></div>
        {/* Transaction Mode GUI realignment: the reference shows Lane as a
            dropdown of existing lanes ("Lane 0"). laneId is a free-form
            identifier (any Lane sharing a name stacks into the same track,
            including a brand new one a user is naming for the first time),
            not a fixed enum -- a plain <select> would make picking an
            EXISTING lane easy but block creating a new one from the
            Inspector. A <datalist> keeps this the same free-text input
            (same command, same value shape) while offering every lane
            already in use as a suggestion, closest to the reference's
            "pick from existing" affordance without inventing a second Lane
            identity owner. */}
        <label>Lane<span className="inspector-field-with-help"><input aria-label="Transaction lane" list="transaction-lane-options" value={transactionLane} onChange={(event) => setTransactionLane(event.target.value)} /><datalist id="transaction-lane-options">{[...new Set(document.transactions.map((item) => item.laneId ?? "lane_0"))].sort().map((laneId) => <option key={laneId} value={laneId} />)}</datalist><span className="field-help" tabIndex={0} title="A visual/semantic grouping row -- Transactions sharing a Lane render stacked in the same track." aria-label="About Lane">ⓘ</span></span></label>
      </InspectorSection>
      <InspectorSection sectionId="phases" title="Phases" count={phaseDraft?.length ?? transaction.phases?.length ?? 0} onAdd={() => addPhaseToDraft(transaction)} addDisabled={!canAddPhase(transaction)} open={transactionSections.phases ?? true} onToggle={() => toggleTransactionSection("phases")}>
        <TransactionPhaseEditor transaction={transaction} commands={commands} compact cyclesPerTc={tcPer} parentRange={{ start: transactionStart, end: transactionEnd }} />
      </InspectorSection>
      <InspectorSection sectionId="linked-signals" title="Linked Signals" count={transaction.linkedSignals?.length ?? 0} onAdd={() => {}} open={transactionSections["linked-signals"] ?? true} onToggle={() => toggleTransactionSection("linked-signals")}>
        <TransactionLinkedSignals transaction={transaction} document={document} onToggle={(signalId) => onToggleTransactionSignal(transaction.id, signalId)} renderUnlinkButton={(label, onClick) => <EditorIconButton label={label} icon="close" onClick={onClick} />} />
      </InspectorSection>
      {transactionStatus && <output role="status">{transactionStatus}</output>}
      <section><button type="button" className="danger" onClick={() => registry.execute("selection.delete")}>Delete Transaction</button></section>
      </div>
      <InspectorFooter onCancel={() => { clearPhaseDraft(transaction.id); onCancel(); }} onApply={() => { setTransactionStatus(""); const phaseCommit = phaseDraft ? commitPhaseRows(phaseDraft, transactionStart, transactionEnd) : undefined; if (phaseCommit && "error" in phaseCommit) { setTransactionStatus(phaseCommit.error); return; } const result = commands.updateTransaction({ transactionId: transaction.id, name: transactionName, start: transactionStart, end: transactionEnd, laneId: transactionLane, ...(phaseCommit ? { phases: phaseCommit.rows } : {}), ...(transactionGroupId ? { groupId: transactionGroupId as TransactionGroup["id"] } : {}), ...(transactionColor ? { color: transactionColor } : {}), description: transactionDescription });
        // #454 Visual Quality Closure ("unclear draft state"): a rejected
        // Apply (e.g. End beyond the document's own cycle count) used to
        // fail silently -- the draft stayed on-screen looking applied
        // (Apply greyed back out from the next render's own comparison,
        // no error, no History change) with no indication anything went
        // wrong. Surface it the exact same way the Phases validation just
        // above already does -- one shared status output, not a second
        // error-reporting mechanism.
        if (!result.ok && result.reason !== "no-op") setTransactionStatus(result.problems[0]?.message ?? "Could not apply Transaction changes."); }} applyDisabled={transactionName === transaction.name && transactionStart === transaction.start && transactionEnd === transaction.end && transactionLane === (transaction.laneId ?? "lane_0") && transactionGroupId === (transaction.groupId ?? "") && transactionColor === (transaction.color ?? "") && transactionDescription === (transaction.description ?? "") && phaseDraft === undefined} applyTestId="apply-inspector-transaction" />
    </>}
    <MiniMap document={document} viewport={viewport} mode={minimapMode} />
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
  // #495 (Reset semantics GUI): `signal.updateResetSemantics` and the
  // Canonical `resetSemantics` field already existed with zero Inspector
  // entry point -- this is the same "command exists, GUI missing" pattern
  // as Edge Numbers above. Kept as its own section with its own Apply
  // (mirrors Edge Numbers' precedent) rather than folding into the big
  // Signal Properties Apply, since it is a distinct, low-frequency,
  // independently-committed semantic field, not a display/style property.
  const [resetEnabled, setResetEnabled] = useState(signal.resetSemantics !== undefined);
  const [resetPolarity, setResetPolarity] = useState<ResetSemantics["polarity"]>(signal.resetSemantics?.polarity ?? "active-low");
  const [resetSync, setResetSync] = useState<ResetSemantics["synchronization"]>(signal.resetSemantics?.synchronization ?? "asynchronous");
  const [resetAssertCycle, setResetAssertCycle] = useState(signal.resetSemantics?.assertCycle !== undefined ? String(signal.resetSemantics.assertCycle) : "");
  const [resetDeassertCycle, setResetDeassertCycle] = useState(signal.resetSemantics?.deassertCycle !== undefined ? String(signal.resetSemantics.deassertCycle) : "");
  const [resetStatus, setResetStatus] = useState("");
  const { state: sections, toggle } = useInspectorAccordion("value-signal", { "signal-properties": true, hierarchy: true, "label-style": false, waveform: true, "reset-semantics": false });
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
    setResetEnabled((current) => current === (signal.resetSemantics !== undefined) ? current : signal.resetSemantics !== undefined);
    setResetPolarity((current) => current === (signal.resetSemantics?.polarity ?? "active-low") ? current : signal.resetSemantics?.polarity ?? "active-low");
    setResetSync((current) => current === (signal.resetSemantics?.synchronization ?? "asynchronous") ? current : signal.resetSemantics?.synchronization ?? "asynchronous");
    setResetAssertCycle((current) => current === (signal.resetSemantics?.assertCycle !== undefined ? String(signal.resetSemantics.assertCycle) : "") ? current : signal.resetSemantics?.assertCycle !== undefined ? String(signal.resetSemantics.assertCycle) : "");
    setResetDeassertCycle((current) => current === (signal.resetSemantics?.deassertCycle !== undefined ? String(signal.resetSemantics.deassertCycle) : "") ? current : signal.resetSemantics?.deassertCycle !== undefined ? String(signal.resetSemantics.deassertCycle) : "");
    setResetStatus("");
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
  // #495: draft-vs-committed compare for the Reset Semantics section's own
  // Apply (same "disabled when unchanged" contract as every other Inspector
  // Apply here) -- assert/deassert are kept as text so an empty field reads
  // as "unset" rather than coercing to 0.
  const resetDraft: ResetSemantics | undefined = resetEnabled ? { polarity: resetPolarity, synchronization: resetSync, ...(resetAssertCycle.trim() === "" ? {} : { assertCycle: Number(resetAssertCycle) }), ...(resetDeassertCycle.trim() === "" ? {} : { deassertCycle: Number(resetDeassertCycle) }) } : undefined;
  const resetHasChanges = JSON.stringify(resetDraft) !== JSON.stringify(signal.resetSemantics);
  const applyReset = () => {
    const result = commands.updateResetSemantics(signal.id, resetDraft);
    // Same "don't fail silently" fix as #454's Transaction Apply: a
    // rejected command (bad polarity/sync, non-integer or negative cycle)
    // must not leave the draft looking applied with no feedback.
    if (!result.ok && result.reason !== "no-op") setResetStatus(result.problems[0]?.message ?? "Could not apply Reset semantics.");
    else setResetStatus("");
  };
  const fullPath = [...signal.source.instancePath, signal.source.signalName].join(".") || signal.source.signalName;
  const signalTypeLabel = sharedSignalTypeLabel(signal.type);
  return <aside className="inspector" data-testid="inspector" data-inspector-context="signal" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
    <InspectorHeaderBar onClose={onClose} />
    <InspectorSelectionHeader iconKind="signal" kind={`${role.charAt(0).toUpperCase() + role.slice(1)} · ${signalTypeLabel}`} title={name || signal.display.name} detail={fullPath} />
    <form className="inspector-signal-properties" data-testid="inspector-signal-properties" onSubmit={apply}>
      <InspectorSection sectionId="signal-properties" title="Signal Properties" open={sections["signal-properties"] ?? true} onToggle={() => toggle("signal-properties")}>
         <label>Display Name<InlineNameInput target={signal} value={signal.display.name} ariaLabel="Inspector signal name" onRename={(nextName) => commands.renameSignal(signal.id, nextName)} onCommitted={setName} onDraftChange={setName} /></label>
        <label>Role<select aria-label="Inspector signal role" value={role} onChange={(event) => setRole(event.target.value as SignalRole)}><option value="input">Input</option><option value="output">Output</option><option value="internal">Internal</option></select></label>
        <label>Type<select aria-label="Inspector signal type" value={signalType} onChange={(event) => setSignalType(event.target.value as ValueSignal["type"])}>{SIGNAL_TYPE_OPTIONS.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}{
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
      {/* #495: type-specific semantic section (Signal Properties before,
          Appearance/Label Style/Waveform after) -- Enabled gates the rest
          of the fields per the issue's own recommended layout, low-
          frequency so the accordion starts closed. Own Apply (type="button"
          so it never triggers this form's Signal Properties submit) keeps
          Reset semantics as one distinct commit, matching Edge Numbers'
          precedent rather than folding a rare field into the frequent one. */}
      <InspectorSection sectionId="reset-semantics" title="Reset Semantics" open={sections["reset-semantics"] ?? false} onToggle={() => toggle("reset-semantics")}>
        <PropertyToggle label="Enabled" ariaLabel="Reset semantics enabled" checked={resetEnabled} onChange={(value) => { setResetEnabled(value); setResetStatus(""); }} />
        {resetEnabled && <>
          <label>Polarity<select aria-label="Reset polarity" value={resetPolarity} onChange={(event) => { setResetPolarity(event.target.value as ResetSemantics["polarity"]); setResetStatus(""); }}><option value="active-low">Active Low</option><option value="active-high">Active High</option></select></label>
          <label>Synchronization<select aria-label="Reset synchronization" value={resetSync} onChange={(event) => { setResetSync(event.target.value as ResetSemantics["synchronization"]); setResetStatus(""); }}><option value="asynchronous">Async</option><option value="synchronous">Sync</option></select></label>
          <div className="inspector-property-pair">
            <label>Assert Cycle<input aria-label="Reset assert cycle" type="number" min="0" step="1" value={resetAssertCycle} onChange={(event) => { setResetAssertCycle(event.target.value); setResetStatus(""); }} /></label>
            <label>Deassert Cycle<input aria-label="Reset deassert cycle" type="number" min="0" step="1" value={resetDeassertCycle} onChange={(event) => { setResetDeassertCycle(event.target.value); setResetStatus(""); }} /></label>
          </div>
        </>}
        {resetStatus && <div className="editor-problem" role="alert">{resetStatus}</div>}
        <button type="button" data-testid="apply-reset-semantics" disabled={!resetHasChanges} onClick={applyReset}>Apply Reset Semantics</button>
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
