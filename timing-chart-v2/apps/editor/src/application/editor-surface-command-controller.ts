import type { CommandResult, SemanticCommand } from "@timing-chart-v2/commands";
import type { Annotation, AnnotationGroup, AnnotationGroupId, AnnotationId, Bookmark, BookmarkId, CanonicalDocument, ClockGenerator, CommentRow, EdgeCounterSettings, GroupId, JsonObject, LabelAnchorId, SemanticAnchor, Signal, SignalGroup, SignalId, SpacerId, SpacerRow, TimeGroup, TimeGroupId, TimelineLabelAnchor, Transaction, TransactionGroup, TransactionId, CommandId, TransactionTimeScale, ValueSignal } from "@timing-chart-v2/schema";

type CommandOf<T extends SemanticCommand["type"]> = Extract<SemanticCommand, { readonly type: T }>;
type CommandPayload<T extends SemanticCommand["type"]> = Omit<CommandOf<T>, "id" | "type">;

export interface SignalEditorCommandActions {
  readonly updateClockGenerator: (signalId: SignalId, generator: ClockGenerator) => CommandResult;
  readonly updateEdgeCounter: (signalId: SignalId, edgeCounter: EdgeCounterSettings) => CommandResult;
  readonly replaceValues: (signalId: SignalId, values: ValueSignal["values"]) => CommandResult;
  readonly updateValue: (signalId: SignalId, start: number, value: string | number, comment?: string) => CommandResult;
  readonly replaceValue: (signalId: SignalId, fromStart: number, start: number, value: string | number, comment?: string) => CommandResult;
  readonly removeValue: (signalId: SignalId, start: number) => CommandResult;
  readonly updateCommentRow: (signalId: SignalId, payload: Omit<CommandOf<"commentRow.update">, "id" | "type" | "signalId">) => CommandResult;
}

export interface TransactionLaneCommandActions {
  readonly move: (transactionId: TransactionId, start: number) => CommandResult;
  readonly resize: (transactionId: TransactionId, edge: "start" | "end", value: number) => CommandResult;
  readonly renameTransactionGroup: (groupId: TransactionGroup["id"], name: string) => CommandResult;
  readonly deleteTransactionGroup: (groupId: TransactionGroup["id"]) => CommandResult;
}

export interface TransactionEditorCommandActions {
  readonly createTransactionFromBottom: (transaction: Transaction) => CommandResult;
  readonly duplicateTransactionById: (transactionId: TransactionId, newTransactionId: TransactionId, name: string) => CommandResult;
  readonly deleteTransaction: (transactionId: TransactionId) => CommandResult;
  readonly updateTransactionFromBottom: (payload: CommandPayload<"transaction.update">) => CommandResult;
  readonly moveTransactionToGroup: (transactionId: TransactionId, groupId?: TransactionGroup["id"]) => CommandResult;
  readonly bulkMoveTransactionsToGroup: (items: readonly { readonly transactionId: TransactionId; readonly groupId?: TransactionGroup["id"] }[]) => CommandResult;
  readonly bulkUpdateTransactions: (payloads: readonly CommandPayload<"transaction.update">[]) => CommandResult;
  readonly bulkDeleteTransactions: (transactionIds: readonly TransactionId[]) => CommandResult;
}

export interface InspectorCommandActions {
  readonly updateSignalProperties: (payload: CommandPayload<"signal.updateProperties">) => CommandResult;
  readonly renameSignal: (signalId: SignalId, name: string) => CommandResult;
  readonly convertClock: (signalId: SignalId, targetType: "binary" | "bus" | "state") => CommandResult;
  readonly setReferenceClock: (referenceClock: SignalId) => CommandResult;
  readonly setReferenceEdge: (edge: "rising" | "falling") => CommandResult;
  readonly updateBookmark: (payload: CommandPayload<"bookmark.update">) => CommandResult;
  readonly updateLayout: (layout: CanonicalDocument["layout"]) => CommandResult;
  readonly normalizeLayout: (layout: CanonicalDocument["layout"]) => CommandResult;
  readonly renameGroup: (groupId: GroupId, name: string) => CommandResult;
  readonly updateGroupProperties: (payload: CommandPayload<"group.updateProperties">) => CommandResult;
  readonly insertSpacer: (spacer: SpacerRow, targetGroupId: GroupId, index: number) => CommandResult;
  readonly moveSpacer: (spacerId: SpacerId, targetGroupId: GroupId, index: number) => CommandResult;
  readonly updateSpacer: (spacerId: SpacerId, height: number) => CommandResult;
  readonly deleteSpacer: (spacerId: SpacerId) => CommandResult;
  readonly updateTransaction: (payload: CommandPayload<"transaction.update">) => CommandResult;
  readonly updateAnnotationProperties: (payload: CommandPayload<"annotation.updateProperties">) => CommandResult;
  readonly setAnnotationAnchor: (annotationId: AnnotationId, field: "anchor" | "start" | "end" | "from" | "to", anchor: SemanticAnchor) => CommandResult;
  readonly updateAnnotationLabelOffset: (annotationId: AnnotationId, labelOffset: CommandPayload<"annotation.updateLabelOffset">["labelOffset"]) => CommandResult;
  readonly resetAnnotationOffsets: (annotationId: AnnotationId) => CommandResult;
  readonly updateAnnotationMeasurement: (payload: CommandPayload<"annotation.updateMeasurement">) => CommandResult;
  readonly updateAnnotationVerticalSpan: (payload: CommandPayload<"annotation.updateVerticalSpan">) => CommandResult;
  readonly setAnnotationPositionMode: (annotationId: AnnotationId, positionMode: "cycle-snap" | "free") => CommandResult;
}

export interface DocumentPropertiesCommandActions {
  readonly updateDocumentProperties: (document: CanonicalDocument, update: {
    readonly title: string;
    readonly header: CanonicalDocument["document"]["header"];
    readonly footer: CanonicalDocument["document"]["footer"];
    readonly legend: CanonicalDocument["legend"];
  }) => CommandResult | undefined;
}

export interface LegendCommandActions {
  readonly updateLegend: (legend: CanonicalDocument["legend"]) => CommandResult;
}

export interface RibbonCommandActions {
  readonly createSignal: (signal: Signal, targetGroupId: GroupId, index: number) => CommandResult;
  readonly createCommentRow: (commentRow: CommentRow, targetGroupId: GroupId, index: number) => CommandResult;
  readonly createGroup: (group: SignalGroup, index: number) => CommandResult;
  readonly createSpacer: (spacer: SpacerRow, targetGroupId: GroupId, index: number) => CommandResult;
  readonly createTransaction: (transaction: Transaction) => CommandResult;
  readonly duplicateTransaction: (transaction: Transaction) => CommandResult;
  readonly createTransactionGroup: (group: TransactionGroup) => CommandResult;
  readonly renameSignals: (items: readonly { readonly signalId: SignalId; readonly name: string }[]) => CommandResult;
  readonly setTransactionTimeScale: (scale: TransactionTimeScale) => CommandResult;
  readonly insertTimeline: (at: number, count: number) => CommandResult;
  readonly deleteTimeline: (start: number, end: number) => CommandResult;
  readonly duplicateTimeline: (start: number, end: number, at: number) => CommandResult;
  readonly moveTimeline: (start: number, end: number, to: number) => CommandResult;
  readonly createBookmark: (bookmark: Bookmark) => CommandResult;
  readonly createLabelAnchor: (labelAnchor: TimelineLabelAnchor) => CommandResult;
  readonly updateLabelAnchor: (labelAnchorId: LabelAnchorId, source: number, display: number) => CommandResult;
  readonly deleteLabelAnchor: (labelAnchorId: LabelAnchorId) => CommandResult;
  readonly createTimeGroup: (timeGroup: TimeGroup) => CommandResult;
  readonly updateTimeGroup: (payload: CommandPayload<"timeGroup.update">) => CommandResult;
  readonly updateTimeGroupPresentation: (timeGroupId: TimeGroupId, presentation: NonNullable<TimeGroup["presentation"]>) => CommandResult;
  readonly expandAllTimeGroups: (groups: readonly TimeGroup[]) => CommandResult;
  readonly deleteTimeGroup: (timeGroupId: TimeGroupId) => CommandResult;
  readonly setAnnotationAlign: (annotationId: AnnotationId, align: Annotation["align"]) => CommandResult;
  readonly bringAnnotationsToFront: (annotationIds: readonly AnnotationId[]) => CommandResult;
  readonly sendAnnotationsToBack: (annotationIds: readonly AnnotationId[]) => CommandResult;
  readonly rotateAnnotations: (items: readonly { readonly annotationId: AnnotationId; readonly rotation: number }[]) => CommandResult;
  readonly createAnnotationGroup: (group: AnnotationGroup) => CommandResult;
  readonly deleteAnnotationGroup: (groupId: AnnotationGroupId) => CommandResult;
  readonly alignAnnotationLabels: (items: readonly { readonly annotationId: AnnotationId; readonly y: number; readonly x: number }[]) => CommandResult;
  readonly setAnnotationsLocked: (annotationIds: readonly AnnotationId[], locked: boolean) => CommandResult;
  readonly matchAnnotationSpans: (items: readonly { readonly annotationId: AnnotationId; readonly spanCycles: number }[]) => CommandResult;
  readonly updateAnnotationStyles: (payloads: readonly CommandPayload<"annotation.updateProperties">[]) => CommandResult;
  readonly updateAnnotationStyle: (payload: CommandPayload<"annotation.updateProperties">) => CommandResult;
  readonly updateCommentRowStyle: (signalId: SignalId, commentRow: Pick<CommentRow, "title" | "body">, style: JsonObject) => CommandResult;
}

export interface EditorSurfaceCommandController extends SignalEditorCommandActions, TransactionLaneCommandActions, TransactionEditorCommandActions, InspectorCommandActions, DocumentPropertiesCommandActions, LegendCommandActions, RibbonCommandActions {}

export function createEditorSurfaceCommandController(input: {
  readonly execute: (command: SemanticCommand) => CommandResult;
  readonly executeBatch: (id: CommandId, commands: readonly SemanticCommand[]) => CommandResult;
  readonly nextCommandId: (operation: string) => CommandId;
}): EditorSurfaceCommandController {
  const dispatch = <T extends SemanticCommand["type"]>(operation: string, command: Omit<CommandOf<T>, "id">): CommandResult => input.execute({ id: input.nextCommandId(operation), ...command } as SemanticCommand);
  const dispatchBatch = <T extends SemanticCommand["type"]>(operation: string, commands: readonly Omit<CommandOf<T>, "id">[], batchOperation = "ribbon_annotation_arrange"): CommandResult => input.executeBatch(input.nextCommandId(batchOperation), commands.map((command) => ({ id: input.nextCommandId(operation), ...command } as SemanticCommand)));
  const updateDocumentProperties: DocumentPropertiesCommandActions["updateDocumentProperties"] = (document, update) => {
    const commands: SemanticCommand[] = [];
    const nextDocument = { ...document.document, title: update.title, header: update.header, footer: update.footer };
    if (JSON.stringify(document.document) !== JSON.stringify(nextDocument)) {
      commands.push({ id: input.nextCommandId("document_metadata"), type: "document.updateMetadata", title: update.title, header: update.header, footer: update.footer });
    }
    if (JSON.stringify(document.legend) !== JSON.stringify(update.legend)) {
      commands.push({ id: input.nextCommandId("legend_update"), type: "legend.update", legend: update.legend });
    }
    return commands.length === 0 ? undefined : input.executeBatch(input.nextCommandId("document_properties"), commands);
  };
  return {
    updateClockGenerator: (signalId, generator) => dispatch<"signal.updateClockGenerator">("clock", { type: "signal.updateClockGenerator", signalId, generator }),
    updateEdgeCounter: (signalId, edgeCounter) => dispatch<"signal.updateEdgeCounter">("edge_counter", { type: "signal.updateEdgeCounter", signalId, edgeCounter }),
    replaceValues: (signalId, values) => dispatch<"signal.replaceValues">("replace_values", { type: "signal.replaceValues", signalId, values }),
    updateValue: (signalId, start, value, comment) => dispatch<"signal.updateValue">("add_value", { type: "signal.updateValue", signalId, start, value, ...(comment === undefined || comment === "" ? {} : { comment }) }),
    replaceValue: (signalId, fromStart, start, value, comment) => dispatch<"signal.replaceValue">("replace_value", { type: "signal.replaceValue", signalId, fromStart, start, value, ...(comment === undefined || comment === "" ? {} : { comment }) }),
    removeValue: (signalId, start) => dispatch<"signal.removeValue">("remove_value", { type: "signal.removeValue", signalId, start }),
    updateCommentRow: (signalId, payload) => dispatch<"commentRow.update">("comment_row_update", { type: "commentRow.update", signalId, ...payload }),
    move: (transactionId, start) => dispatch<"transaction.move">("transaction_snap_move", { type: "transaction.move", transactionId, start }),
    resize: (transactionId, edge, value) => dispatch<"transaction.resize">("transaction_snap_resize", { type: "transaction.resize", transactionId, edge, value }),
    renameTransactionGroup: (groupId, name) => dispatch<"transactionGroup.rename">("transaction_group_rename", { type: "transactionGroup.rename", groupId, name }),
    deleteTransactionGroup: (groupId) => dispatch<"transactionGroup.delete">("transaction_group_delete", { type: "transactionGroup.delete", groupId }),
    createTransactionFromBottom: (transaction) => dispatch<"transaction.create">("transaction_create", { type: "transaction.create", transaction }),
    duplicateTransactionById: (transactionId, newTransactionId, name) => dispatch<"transaction.duplicate">("bottom_transaction_duplicate", { type: "transaction.duplicate", transactionId, newTransactionId, name }),
    deleteTransaction: (transactionId) => dispatch<"transaction.delete">("bottom_transaction_delete", { type: "transaction.delete", transactionId }),
    updateTransactionFromBottom: (payload) => dispatch<"transaction.update">("bottom_transaction_update", { type: "transaction.update", ...payload }),
    moveTransactionToGroup: (transactionId, groupId) => dispatch<"transaction.moveToGroup">("bottom_transaction_group", { type: "transaction.moveToGroup", transactionId, ...(groupId === undefined ? {} : { groupId }) }),
    bulkMoveTransactionsToGroup: (items) => dispatchBatch<"transaction.moveToGroup">("bottom_transaction_bulk_group", items.map(({ transactionId, groupId }) => ({ type: "transaction.moveToGroup", transactionId, ...(groupId === undefined ? {} : { groupId }) })), "bottom_transaction_bulk"),
    bulkUpdateTransactions: (payloads) => dispatchBatch<"transaction.update">("bottom_transaction_bulk_color", payloads.map((payload) => ({ type: "transaction.update", ...payload })), "bottom_transaction_bulk"),
    bulkDeleteTransactions: (transactionIds) => dispatchBatch<"transaction.delete">("bottom_transaction_bulk_delete", transactionIds.map((transactionId) => ({ type: "transaction.delete", transactionId })), "bottom_transaction_bulk"),
    updateSignalProperties: (payload) => dispatch<"signal.updateProperties">("inspector_signal_properties", { type: "signal.updateProperties", ...payload }),
    renameSignal: (signalId, name) => dispatch<"signal.rename">("inspector_signal_rename", { type: "signal.rename", signalId, name }),
    convertClock: (signalId, targetType) => dispatch<"signal.convertClock">("convert_clock", { type: "signal.convertClock", signalId, targetType }),
    setReferenceClock: (referenceClock) => dispatch<"timeline.setReferenceClock">("set_reference_clock", { type: "timeline.setReferenceClock", referenceClock }),
    setReferenceEdge: (edge) => dispatch<"timeline.setReferenceEdge">("set_reference_edge", { type: "timeline.setReferenceEdge", edge }),
    updateBookmark: (payload) => dispatch<"bookmark.update">("inspector_bookmark_update", { type: "bookmark.update", ...payload }),
    updateLayout: (layout) => dispatch<"document.updateLayout">("layout_properties", { type: "document.updateLayout", layout }),
    normalizeLayout: (layout) => dispatch<"document.updateLayout">("home_auto_layout", { type: "document.updateLayout", layout }),
    renameGroup: (groupId, name) => dispatch<"group.rename">("group_rename", { type: "group.rename", groupId, name }),
    updateGroupProperties: (payload) => dispatch<"group.updateProperties">("group_properties", { type: "group.updateProperties", ...payload }),
    createSpacer: (spacer, targetGroupId, index) => dispatch<"spacer.create">("spacer_create", { type: "spacer.create", spacer, targetGroupId, index }),
    createTransaction: (transaction) => dispatch<"transaction.create">("home_transaction_create", { type: "transaction.create", transaction }),
    duplicateTransaction: (transaction) => dispatch<"transaction.create">("home_transaction_duplicate", { type: "transaction.create", transaction }),
    createTransactionGroup: (group) => dispatch<"transactionGroup.create">("home_transaction_group_create", { type: "transactionGroup.create", group }),
    renameSignals: (items) => dispatchBatch<"signal.rename">("find_replace_rename", items.map(({ signalId, name }) => ({ type: "signal.rename", signalId, name }))),
    setTransactionTimeScale: (scale) => dispatch<"transaction.setTimeScale">("transaction_time_scale_set", { type: "transaction.setTimeScale", scale }),
    moveSpacer: (spacerId, targetGroupId, index) => dispatch<"spacer.move">("spacer_move", { type: "spacer.move", spacerId, targetGroupId, index }),
    updateSpacer: (spacerId, height) => dispatch<"spacer.update">("spacer_update", { type: "spacer.update", spacerId, height }),
    deleteSpacer: (spacerId) => dispatch<"spacer.delete">("spacer_delete", { type: "spacer.delete", spacerId }),
    updateTransaction: (payload) => dispatch<"transaction.update">("transaction_update", { type: "transaction.update", ...payload }),
    updateAnnotationProperties: (payload) => dispatch<"annotation.updateProperties">("inspector_annotation_properties", { type: "annotation.updateProperties", ...payload }),
    setAnnotationAnchor: (annotationId, field, anchor) => dispatch<"annotation.setAnchor">("inspector_annotation_anchor", { type: "annotation.setAnchor", annotationId, field, anchor }),
    updateAnnotationLabelOffset: (annotationId, labelOffset) => dispatch<"annotation.updateLabelOffset">("annotation_label_offset", { type: "annotation.updateLabelOffset", annotationId, labelOffset }),
    resetAnnotationOffsets: (annotationId) => dispatch<"annotation.resetOffsets">("annotation_reset_offsets", { type: "annotation.resetOffsets", annotationId }),
    updateAnnotationMeasurement: (payload) => dispatch<"annotation.updateMeasurement">("annotation_measurement", { type: "annotation.updateMeasurement", ...payload }),
    updateAnnotationVerticalSpan: (payload) => dispatch<"annotation.updateVerticalSpan">("annotation_vertical_span", { type: "annotation.updateVerticalSpan", ...payload }),
    setAnnotationPositionMode: (annotationId, positionMode) => dispatch<"annotation.setPositionMode">("annotation_position_mode", { type: "annotation.setPositionMode", annotationId, positionMode }),
    updateDocumentProperties,
    updateLegend: (legend) => dispatch<"legend.update">("legend_update", { type: "legend.update", legend }),
    createSignal: (signal, targetGroupId, index) => dispatch<"signal.create">("insert_signal", { type: "signal.create", signal, targetGroupId, index }),
    createCommentRow: (commentRow, targetGroupId, index) => dispatch<"commentRow.create">("insert_comment_row", { type: "commentRow.create", commentRow, targetGroupId, index }),
    createGroup: (group, index) => dispatch<"group.create">("insert_group", { type: "group.create", group, index }),
    insertSpacer: (spacer, targetGroupId, index) => dispatch<"spacer.create">("insert_spacer", { type: "spacer.create", spacer, targetGroupId, index }),
    insertTimeline: (at, count) => dispatch<"timeline.insert">(count === 1 ? "timeline_insert_one" : "timeline_insert_many", { type: "timeline.insert", at, count }),
    deleteTimeline: (start, end) => dispatch<"timeline.delete">(end - start === 1 ? "timeline_delete_one" : "timeline_delete_many", { type: "timeline.delete", start, end }),
    duplicateTimeline: (start, end, at) => dispatch<"timeline.duplicateRange">("timeline_duplicate", { type: "timeline.duplicateRange", start, end, at }),
    moveTimeline: (start, end, to) => dispatch<"timeline.moveRange">("timeline_move", { type: "timeline.moveRange", start, end, to }),
    createBookmark: (bookmark) => dispatch<"bookmark.create">("marker", { type: "bookmark.create", bookmark }),
    createLabelAnchor: (labelAnchor) => dispatch<"labelAnchor.create">("label_anchor_create", { type: "labelAnchor.create", labelAnchor }),
    updateLabelAnchor: (labelAnchorId, source, display) => dispatch<"labelAnchor.update">("label_anchor_update", { type: "labelAnchor.update", labelAnchorId, source, display }),
    deleteLabelAnchor: (labelAnchorId) => dispatch<"labelAnchor.delete">("label_anchor_delete", { type: "labelAnchor.delete", labelAnchorId }),
    createTimeGroup: (timeGroup) => dispatch<"timeGroup.create">("home_time_group", { type: "timeGroup.create", timeGroup }),
    updateTimeGroup: (payload) => dispatch<"timeGroup.update">("time_group_update", { type: "timeGroup.update", ...payload }),
    updateTimeGroupPresentation: (timeGroupId, presentation) => dispatch<"timeGroup.updatePresentation">(presentation.collapsed ? "time_group_collapse" : "time_group_expand", { type: "timeGroup.updatePresentation", timeGroupId, presentation }),
    expandAllTimeGroups: (groups) => dispatchBatch<"timeGroup.updatePresentation">("time_group_expand_all", groups.filter((group) => group.presentation?.collapsed).map((group) => ({ type: "timeGroup.updatePresentation", timeGroupId: group.id, presentation: { ...(group.presentation ?? {}), collapsed: false, foldStyle: "none" as const, foldLabel: group.presentation?.foldLabel || group.name } })), "time_group_expand_all"),
    deleteTimeGroup: (timeGroupId) => dispatch<"timeGroup.delete">("gap_delete", { type: "timeGroup.delete", timeGroupId }),
    setAnnotationAlign: (annotationId, align) => dispatch<"annotation.setAlign">("annotation_align", { type: "annotation.setAlign", annotationId, align }),
    bringAnnotationsToFront: (annotationIds) => dispatchBatch<"annotation.bringToFront">("annotation_bring_front", annotationIds.map((annotationId) => ({ type: "annotation.bringToFront", annotationId }))),
    sendAnnotationsToBack: (annotationIds) => dispatchBatch<"annotation.sendToBack">("annotation_send_back", annotationIds.map((annotationId) => ({ type: "annotation.sendToBack", annotationId }))),
    rotateAnnotations: (items) => dispatchBatch<"annotation.setRotation">("annotation_rotate", items.map(({ annotationId, rotation }) => ({ type: "annotation.setRotation", annotationId, rotation }))),
    createAnnotationGroup: (group) => dispatch<"annotationGroup.create">("annotation_group_create", { type: "annotationGroup.create", group }),
    deleteAnnotationGroup: (groupId) => dispatch<"annotationGroup.delete">("annotation_group_delete", { type: "annotationGroup.delete", groupId }),
    alignAnnotationLabels: (items) => dispatchBatch<"annotation.updateLabelOffset">("annotation_align", items.map(({ annotationId, x, y }) => ({ type: "annotation.updateLabelOffset", annotationId, labelOffset: { x, y } }))),
    setAnnotationsLocked: (annotationIds, locked) => dispatchBatch<"annotation.setLocked">(locked ? "annotation_lock" : "annotation_unlock", annotationIds.map((annotationId) => ({ type: "annotation.setLocked", annotationId, locked }))),
    matchAnnotationSpans: (items) => dispatchBatch<"annotation.matchSpan">("annotation_match_span", items.map(({ annotationId, spanCycles }) => ({ type: "annotation.matchSpan", annotationId, spanCycles }))),
    updateAnnotationStyles: (payloads) => dispatchBatch<"annotation.updateProperties">("ribbon_annotation_font_multi", payloads.map((payload) => ({ type: "annotation.updateProperties", ...payload }))),
    updateAnnotationStyle: (payload) => dispatch<"annotation.updateProperties">("ribbon_annotation_font", { type: "annotation.updateProperties", ...payload }),
    updateCommentRowStyle: (signalId, commentRow, style) => dispatch<"commentRow.update">("ribbon_comment_row_font", { type: "commentRow.update", signalId, ...commentRow, displayStyle: style }),
  };
}
