#!/usr/bin/env node
// #395 PR3: a small local Agent Bridge -- localhost-only, token-gated,
// exposing exactly the whitelisted read/view-only MCP tools this file
// implements below. No arbitrary Canonical JSON patch endpoint, no
// filesystem access, no shell execution: this process only ever relays a
// fixed set of named tool calls to a connected browser tab (which
// executes them against its own live document state) and returns
// whatever that tab reports back.
//
// Transport: a minimal HTTP JSON-RPC 2.0 surface (MCP's "Streamable
// HTTP" transport, simplified to one request per call rather than a
// persistent SSE session) for the MCP client side, plus a short-poll
// HTTP pair (/bridge/poll, /bridge/respond, /bridge/close) the browser tab
// uses to pick up pending tool calls and post results back. MCP clients and
// Editor tabs use separate bearer tokens so an MCP client cannot impersonate
// or evict an Editor session.
import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const HOST = "127.0.0.1"; // never 0.0.0.0 -- localhost-only by construction.
const PORT = Number(process.env.AI_BRIDGE_PORT ?? 4610);
const TOKEN_FROM_ENV = Boolean(process.env.AI_BRIDGE_TOKEN);
const EDITOR_TOKEN_FROM_ENV = Boolean(process.env.AI_BRIDGE_EDITOR_TOKEN);
const TOKEN = process.env.AI_BRIDGE_TOKEN ?? randomBytes(24).toString("hex");
const EDITOR_TOKEN = process.env.AI_BRIDGE_EDITOR_TOKEN ?? randomBytes(24).toString("hex");
if (TOKEN === EDITOR_TOKEN) throw new Error("AI_BRIDGE_TOKEN and AI_BRIDGE_EDITOR_TOKEN must be different credentials.");
const POLL_TIMEOUT_MS = 25_000;
const EDITOR_SESSION_TIMEOUT_MS = 15_000;
// Request endpoints (MCP calls, poll, close) carry small JSON only. The respond
// endpoint carries a full tool result, which can legitimately be large on a big
// document, so it gets its own bound. Keep RESPOND_BODY_LIMIT_BYTES equal to
// the client-side guard in apps/editor/src/ai-bridge-client.ts.
const REQUEST_BODY_LIMIT_BYTES = 65_536;
const RESPOND_BODY_LIMIT_BYTES = 4 * 1024 * 1024;
// Oversize bodies are drained (up to this ceiling) rather than destroyed, so the
// caller receives a real HTTP status and a JSON error instead of a reset socket.
const DRAIN_CEILING_BYTES = 32 * 1024 * 1024;

// #395 item 4 (MCP Tool Surface): the exact whitelist. Nothing outside
// this list can ever be invoked, regardless of what a client sends --
// tools/call rejects any name not in this map before it is ever queued
// for the browser.
const READ_TOOLS = new Set(["get_document_summary", "get_view_context", "get_selection", "get_viewport_snapshot", "get_signals", "get_signal", "get_signal_groups", "get_transactions", "get_transaction", "get_transaction_groups", "get_transaction_phases", "get_linked_signals", "get_annotations", "get_bookmarks", "get_time_groups", "get_problems"]);
const VIEW_ONLY_TOOLS = new Set(["fit_all", "fit_selection", "set_selection", "reveal_entity", "switch_mode", "open_panel", "set_visible_time_range"]);
// #395 PR4: propose_edit is the one tool that reaches into document-changing
// territory, but it still only ever builds a Preview (identical to the user
// typing the same query and clicking Preview themselves) -- it never
// validates or applies on its own. There is deliberately no bridge-side
// "apply" tool for a document-changing proposal at all: a human must open
// the AI Assistant panel and manually Validate + Apply it.
const PROPOSAL_TOOLS = new Set(["propose_edit", "propose_create_signal", "propose_rename_signal", "propose_update_signal", "propose_move_signal", "propose_insert_cycles", "propose_delete_cycles", "propose_move_range", "propose_duplicate_range", "propose_create_signal_group", "propose_rename_signal_group", "propose_move_signal_group", "propose_delete_signal_group", "propose_create_transaction_group", "propose_rename_transaction_group", "propose_delete_transaction_group", "propose_create_time_group", "propose_update_time_group", "propose_delete_time_group", "propose_create_transaction", "propose_update_transaction", "propose_move_transaction", "propose_resize_transaction", "propose_delete_transaction", "propose_create_bookmark", "propose_move_bookmark", "propose_update_bookmark", "propose_delete_bookmark", "propose_create_annotation", "propose_update_annotation", "propose_delete_annotation", "propose_add_phase", "propose_update_phase", "propose_delete_phase", "propose_link_signal", "propose_unlink_signal"]);
const BATCHABLE_PROPOSAL_TOOLS = ["propose_create_signal", "propose_rename_signal", "propose_update_signal", "propose_move_signal", "propose_insert_cycles", "propose_delete_cycles", "propose_move_range", "propose_duplicate_range", "propose_create_signal_group", "propose_rename_signal_group", "propose_move_signal_group", "propose_delete_signal_group", "propose_create_transaction_group", "propose_rename_transaction_group", "propose_delete_transaction_group", "propose_create_time_group", "propose_update_time_group", "propose_delete_time_group", "propose_create_transaction", "propose_update_transaction", "propose_move_transaction", "propose_resize_transaction", "propose_delete_transaction", "propose_create_bookmark", "propose_move_bookmark", "propose_update_bookmark", "propose_delete_bookmark", "propose_create_annotation", "propose_update_annotation", "propose_delete_annotation", "propose_add_phase", "propose_update_phase", "propose_delete_phase", "propose_link_signal", "propose_unlink_signal"];
PROPOSAL_TOOLS.add("submit_proposal");
const sessionInput = { type: "string", minLength: 1, maxLength: 128, description: "Explicit live Editor session id returned by list_editor_sessions." };
const sessionSchema = { type: "object", properties: { editorSessionId: sessionInput }, required: ["editorSessionId"], additionalProperties: false };
const TOOL_CATALOG = [
  { name: "list_editor_sessions", description: "List live Editor tabs by session id, document title, mode, revision and entity counts. Select one session id and pass it to every other tool; no document content is returned here.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_document_summary", description: "Read-only summary of the explicitly targeted Editor document (title, signal/annotation/transaction counts, source-cycle timeline length, and the optional document physical timebase with reference frequency and display unit). Never mutates anything.", inputSchema: sessionSchema },
  { name: "get_view_context", description: "Read-only view state for the explicitly targeted Editor session (mode, source-cycle range, zoom and stable current selection).", inputSchema: sessionSchema },
  { name: "get_selection", description: "Read-only current selection for the explicitly targeted Editor session (selected Signal/Group/Annotation/Transaction id, if any). Never mutates anything.", inputSchema: sessionSchema },
  { name: "set_selection", description: "View-only: select a current document entity by stable ID in the explicitly targeted Editor session. Does not change Canonical/History/Dirty state.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, entityType: { type: "string", enum: ["signal", "group", "transaction", "annotation", "bookmark"] }, entityId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "entityType", "entityId"], additionalProperties: false } },
  { name: "reveal_entity", description: "View-only: navigate the explicitly targeted Editor session to a canonical entity by stable ID and scroll its visible presentation into view. Does not change Canonical/History/Dirty state.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, entityType: { type: "string", enum: ["signal", "group", "transaction", "annotation", "bookmark"] }, entityId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "entityType", "entityId"], additionalProperties: false } },
  { name: "get_viewport_snapshot", description: "Read-only structured Element Map for the explicitly targeted Editor session: every signal's stable id, name, role, type, group and visibility, plus current selection, zoom and cycle count. Does not include a raw pixel image. Never mutates anything.", inputSchema: sessionSchema },
  { name: "get_signals", description: "Read-only list of canonical Signals with stable IDs and semantic fields; optional groupId, visible and type filters.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, groupId: { type: "string" }, visible: { type: "boolean" }, type: { type: "string" } }, required: ["editorSessionId"], additionalProperties: false } },
  { name: "get_signal", description: "Read-only canonical Signal details selected by stable signalId.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, signalId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "signalId"], additionalProperties: false } },
  { name: "get_signal_groups", description: "Read-only canonical Signal Groups and their ordered stable row IDs.", inputSchema: sessionSchema },
  { name: "get_transactions", description: "Read-only list of canonical Transactions (stable id, name, group id, lane id, source-cycle start/end, color, description, linked signal ids, phase count) plus every Transaction Group; optionally filter by groupId, laneId, or intersecting source-cycle visibleRange.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, groupId: { type: "string", minLength: 1 }, laneId: { type: "string", minLength: 1 }, visibleRange: { type: "object", properties: { start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 1 } }, required: ["start", "end"], additionalProperties: false } }, required: ["editorSessionId"], additionalProperties: false } },
  { name: "get_transaction", description: "Read-only canonical Transaction details selected by stable transactionId.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "transactionId"], additionalProperties: false } },
  { name: "get_transaction_groups", description: "Read-only canonical Transaction Groups with stable IDs and semantic colors.", inputSchema: sessionSchema },
  { name: "get_transaction_phases", description: "Read-only ordered phase names and source-cycle boundaries for a Transaction identified by stable transactionId.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "transactionId"], additionalProperties: false } },
  { name: "get_linked_signals", description: "Read-only Signal details linked to a Transaction identified by stable transactionId.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "transactionId"], additionalProperties: false } },
  { name: "get_annotations", description: "Read-only list of canonical Annotations with stable identity, semantic anchors in signal IDs/source cycles, and type-specific semantic options (Measurement profile/kind, Ghost Trace source/offset, opacity, etc.), never pixels; optionally filter by type and source-cycle visibleRange.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, type: { type: "string" }, visibleRange: { type: "object", properties: { start: { type: "number" }, end: { type: "number" } }, required: ["start", "end"], additionalProperties: false } }, required: ["editorSessionId"], additionalProperties: false } },
  { name: "get_bookmarks", description: "Read-only list of every canonical Bookmark (stable id, name, source cycle, comment).", inputSchema: sessionSchema },
  { name: "get_time_groups", description: "Read-only list of canonical Time Groups and source-cycle boundaries.", inputSchema: sessionSchema },
  { name: "get_problems", description: "Read-only canonical-document validation problems, using the same validator as the Editor's Problems panel.", inputSchema: sessionSchema },
  { name: "propose_rename_signal", description: "Propose renaming the Signal identified by stable signalId. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, signalId: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 } }, required: ["editorSessionId", "signalId", "name"], additionalProperties: false } },
  { name: "propose_update_signal", description: "Propose changing a Signal's role, visibility, and/or its complete displayStyle JSON object by stable signalId. Uses signal.updateProperties and creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, signalId: { type: "string", minLength: 1 }, role: { type: "string", enum: ["input", "output", "internal"] }, visible: { type: "boolean" }, displayStyle: { type: "object", description: "Complete JSON object stored as Signal display.style; this is a typed property, not a document JSON patch." } }, required: ["editorSessionId", "signalId"], anyOf: [{ required: ["role"] }, { required: ["visible"] }, { required: ["displayStyle"] }], additionalProperties: false } },
  { name: "propose_move_signal", description: "Propose moving a Signal by stable signalId to a Group by stable targetGroupId, optionally at a zero-based row index. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, signalId: { type: "string", minLength: 1 }, targetGroupId: { type: "string", minLength: 1 }, index: { type: "integer", minimum: 0 } }, required: ["editorSessionId", "signalId", "targetGroupId"], additionalProperties: false } },
  { name: "propose_insert_cycles", description: "Propose inserting a positive count of source cycles at an integer cycle boundary. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, at: { type: "integer", minimum: 0 }, count: { type: "integer", minimum: 1 } }, required: ["editorSessionId", "at", "count"], additionalProperties: false } },
  { name: "propose_delete_cycles", description: "Propose deleting the half-open source-cycle range [start, end). Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 1 } }, required: ["editorSessionId", "start", "end"], additionalProperties: false } },
  { name: "propose_move_range", description: "Propose moving the half-open source-cycle range [start, end) to source cycle boundary to. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 1 }, to: { type: "integer", minimum: 0 } }, required: ["editorSessionId", "start", "end", "to"], additionalProperties: false } },
  { name: "propose_duplicate_range", description: "Propose duplicating the half-open source-cycle range [start, end) at source-cycle boundary at. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 1 }, at: { type: "integer", minimum: 0 } }, required: ["editorSessionId", "start", "end", "at"], additionalProperties: false } },
  { name: "propose_create_signal_group", description: "Propose creating an empty Signal Group with the supplied name. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, name: { type: "string", minLength: 1 } }, required: ["editorSessionId", "name"], additionalProperties: false } },
  { name: "propose_rename_signal_group", description: "Propose renaming the Signal Group identified by stable groupId. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, groupId: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 } }, required: ["editorSessionId", "groupId", "name"], additionalProperties: false } },
  { name: "propose_move_signal_group", description: "Propose moving a Signal Group by stable groupId to a zero-based position in the post-removal group list. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, groupId: { type: "string", minLength: 1 }, index: { type: "integer", minimum: 0 } }, required: ["editorSessionId", "groupId", "index"], additionalProperties: false } },
  { name: "propose_delete_signal_group", description: "Propose deleting an empty Signal Group by stable groupId. Non-empty groups cannot be deleted; creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, groupId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "groupId"], additionalProperties: false } },
  { name: "propose_create_transaction", description: "Propose creating a Transaction at canonical source-cycle startCycle/endCycle boundaries, optionally with Phases (also source-cycle startCycle/endCycle), linked Signals, a Group, Lane, color, and description. Related commands are reviewed and applied as one atomic proposal. A human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, name: { type: "string", minLength: 1 }, startCycle: { type: "integer", minimum: 0 }, endCycle: { type: "integer", minimum: 1 }, groupId: { type: "string" }, laneId: { type: "string" }, color: { type: "string" }, description: { type: "string" }, phases: { type: "array", items: { type: "object", properties: { name: { type: "string", minLength: 1 }, startCycle: { type: "integer", minimum: 0 }, endCycle: { type: "integer", minimum: 1 } }, required: ["name", "startCycle", "endCycle"], additionalProperties: false } }, linkedSignalIds: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true } }, required: ["editorSessionId", "name", "startCycle", "endCycle"], additionalProperties: false } },
  { name: "propose_update_transaction", description: "Propose updating selected Transaction properties and/or source-cycle start/end by stable transactionId. Omitted fields are preserved; creates a Preview only.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, startCycle: { type: "integer", minimum: 0 }, endCycle: { type: "integer", minimum: 1 }, laneId: { type: "string", minLength: 1 }, groupId: { type: "string", minLength: 1 }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, description: { type: "string" } }, required: ["editorSessionId", "transactionId"], anyOf: [{ required: ["name"] }, { required: ["startCycle"] }, { required: ["endCycle"] }, { required: ["laneId"] }, { required: ["groupId"] }, { required: ["color"] }, { required: ["description"] }], additionalProperties: false } },
  { name: "propose_move_transaction", description: "Propose moving a stable Transaction ID to a canonical source-cycle startCycle while preserving its duration. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 }, startCycle: { type: "integer", minimum: 0 } }, required: ["editorSessionId", "transactionId", "startCycle"], additionalProperties: false } },
  { name: "propose_resize_transaction", description: "Propose resizing a stable Transaction ID's start or end boundary at canonical source cycle `cycle`. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 }, edge: { type: "string", enum: ["start", "end"] }, cycle: { type: "integer", minimum: 0 } }, required: ["editorSessionId", "transactionId", "edge", "cycle"], additionalProperties: false } },
  { name: "propose_delete_transaction", description: "Propose deleting the Transaction identified by stable transactionId. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "transactionId"], additionalProperties: false } },
  { name: "propose_add_phase", description: "Propose adding a named Phase to a Transaction using source-cycle boundaries and stable transactionId; optional phaseId lets subsequent batch operations target the created Phase.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 }, phaseId: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, startCycle: { type: "integer", minimum: 0 }, endCycle: { type: "integer", minimum: 1 } }, required: ["editorSessionId", "transactionId", "name", "startCycle", "endCycle"], additionalProperties: false } },
  { name: "propose_update_phase", description: "Propose replacing the Phase identified by stable phaseId in a Transaction using source-cycle boundaries.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 }, phaseId: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, startCycle: { type: "integer", minimum: 0 }, endCycle: { type: "integer", minimum: 1 } }, required: ["editorSessionId", "transactionId", "phaseId", "name", "startCycle", "endCycle"], additionalProperties: false } },
  { name: "propose_delete_phase", description: "Propose deleting the Phase identified by stable phaseId from the Transaction identified by stable transactionId.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 }, phaseId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "transactionId", "phaseId"], additionalProperties: false } },
  { name: "propose_link_signal", description: "Propose linking an existing stable Signal ID to a Transaction.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 }, signalId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "transactionId", "signalId"], additionalProperties: false } },
  { name: "propose_unlink_signal", description: "Propose unlinking a stable Signal ID from a Transaction.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, transactionId: { type: "string", minLength: 1 }, signalId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "transactionId", "signalId"], additionalProperties: false } },
  { name: "propose_create_bookmark", description: "Propose creating a Bookmark at a source cycle, optionally with a name and comment. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, name: { type: "string", minLength: 1 }, cycle: { type: "integer", minimum: 0 }, comment: { type: "string" } }, required: ["editorSessionId", "name", "cycle"], additionalProperties: false } },
  { name: "propose_move_bookmark", description: "Propose moving the Bookmark identified by stable bookmarkId to a source cycle. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, bookmarkId: { type: "string", minLength: 1 }, cycle: { type: "integer", minimum: 0 } }, required: ["editorSessionId", "bookmarkId", "cycle"], additionalProperties: false } },
  { name: "propose_update_bookmark", description: "Propose changing a Bookmark name, source cycle, and/or comment by stable bookmarkId. Omitted fields are preserved; creates a Preview only.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, bookmarkId: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, cycle: { type: "integer", minimum: 0 }, comment: { type: "string" } }, required: ["editorSessionId", "bookmarkId"], anyOf: [{ required: ["name"] }, { required: ["cycle"] }, { required: ["comment"] }], additionalProperties: false } },
  { name: "propose_delete_bookmark", description: "Propose deleting the Bookmark identified by stable bookmarkId. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, bookmarkId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "bookmarkId"], additionalProperties: false } },
  { name: "propose_create_annotation", description: "Propose creating a semantic Annotation using a stable signalId and canonical source-cycle range [start,end). Measurement options select standard/custom profiles and threshold/ratio anchors; custom endpoints are fractions in [0,1]. Ghost Trace options identify its stable sourceSignalId, cycle offset, and opacity. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, type: { type: "string", enum: ["text", "callout", "verticalLine", "range", "bracket", "highlight", "marker", "measurement", "arrow", "dependency", "timingRegion", "ghostTrace", "rectangle", "ellipse", "connector", "textbox"] }, signalId: { type: "string", minLength: 1 }, start: { type: "integer", minimum: 0 }, end: { type: "integer", minimum: 1 }, label: { type: "string" }, measurement: { type: "object", properties: { profile: { type: "string", enum: ["cycle", "30-70", "10-90", "20-80", "50%", "custom"] }, anchorKind: { type: "string", enum: ["threshold", "ratio"] }, startValue: { type: "number", minimum: 0, maximum: 1 }, endValue: { type: "number", minimum: 0, maximum: 1 } }, required: ["profile"], additionalProperties: false }, ghostTrace: { type: "object", properties: { sourceSignalId: { type: "string", minLength: 1 }, traceOffsetCycles: { type: "number" }, opacity: { type: "number", minimum: 0, maximum: 1 } }, additionalProperties: false } }, required: ["editorSessionId", "type", "signalId", "start", "end"], additionalProperties: false } },
  { name: "propose_update_annotation", description: "Propose changing an Annotation by stable annotationId. Semantic position edits target an existing anchorField (anchor/start/end/from/to) and use canonical source cycles, stable signal IDs, and semantic anchor points. Measurement edits use the same profile and normalized threshold/ratio options as creation. Ghost Trace supports sourceSignalId/traceOffsetCycles; Ghost Trace and Timing Region support opacity. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, annotationId: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, visible: { type: "boolean" }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, sourceSignalId: { type: "string", minLength: 1 }, traceOffsetCycles: { type: "number" }, opacity: { type: "number", minimum: 0, maximum: 1 }, anchorField: { type: "string", enum: ["anchor", "start", "end", "from", "to"] }, anchorCycle: { type: "integer", minimum: 0 }, anchorSignalId: { type: "string", minLength: 1 }, anchorPoint: { type: "string", enum: ["cycle-start", "cycle-center", "cycle-end", "transition-start", "transition-center", "transition-end", "rising-edge", "falling-edge", "value-start", "value-center", "row-center"] }, measurement: { type: "object", properties: { profile: { type: "string", enum: ["cycle", "30-70", "10-90", "20-80", "50%", "custom"] }, anchorKind: { type: "string", enum: ["threshold", "ratio"] }, startValue: { type: "number", minimum: 0, maximum: 1 }, endValue: { type: "number", minimum: 0, maximum: 1 } }, required: ["profile"], additionalProperties: false } }, required: ["editorSessionId", "annotationId"], anyOf: [{ required: ["label"] }, { required: ["visible"] }, { required: ["color"] }, { required: ["sourceSignalId"] }, { required: ["traceOffsetCycles"] }, { required: ["opacity"] }, { required: ["anchorCycle"] }, { required: ["anchorSignalId"] }, { required: ["anchorPoint"] }, { required: ["measurement"] }], additionalProperties: false } },
  { name: "propose_delete_annotation", description: "Propose deleting the Annotation identified by stable annotationId. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, annotationId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "annotationId"], additionalProperties: false } },
  { name: "fit_all", description: "View-only: fit the complete timeline in the explicitly targeted Editor session. Canonical/History/Dirty delta is always 0.", inputSchema: sessionSchema },
  { name: "fit_selection", description: "View-only: fit the currently selected source-time range in the explicitly targeted Editor session. Canonical/History/Dirty delta is always 0.", inputSchema: sessionSchema },
  { name: "switch_mode", description: "View-only: switch the explicitly targeted Editor session between Cycle, Transaction, and Combined modes. Canonical/History/Dirty delta is always 0.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, mode: { type: "string", enum: ["Cycle", "Transaction", "Combined"] } }, required: ["editorSessionId", "mode"], additionalProperties: false } },
  { name: "open_panel", description: "View-only: show the Inspector or Bottom panel in the explicitly targeted Editor session. Canonical/History/Dirty delta is always 0.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, panel: { type: "string", enum: ["inspector", "bottom"] } }, required: ["editorSessionId", "panel"], additionalProperties: false } },
  { name: "set_visible_time_range", description: "View-only: fit the source-cycle interval [startCycle,endCycle) using the shared timeline geometry/navigation owner. Canonical/History/Dirty delta is always 0.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, startCycle: { type: "integer", minimum: 0 }, endCycle: { type: "integer", minimum: 1 } }, required: ["editorSessionId", "startCycle", "endCycle"], additionalProperties: false } },
  { name: "propose_edit", description: "Submit a document-changing edit request to the explicitly targeted Editor session as a Preview only -- it is never auto-validated or auto-applied. A human must open the AI Assistant panel and manually Validate + Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, query: { type: "string", minLength: 1 } }, required: ["editorSessionId", "query"], additionalProperties: false } },
  { name: "submit_proposal", description: "Submit an ordered batch of typed SemanticCommand proposal operations as one Preview. baseRevision must equal the current Editor revision. Every operation is validated together; no document change occurs until a human validates and applies the complete batch.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, baseRevision: { type: "integer", minimum: 0 }, operations: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", properties: { tool: { type: "string", enum: BATCHABLE_PROPOSAL_TOOLS }, arguments: { type: "object", additionalProperties: true } }, required: ["tool", "arguments"], additionalProperties: false } } }, required: ["editorSessionId", "baseRevision", "operations"], additionalProperties: false } },
  { name: "propose_create_signal", description: "Propose creating a typed Signal in the Signal Group identified by stable groupId. initialValue is validated against the Signal type. Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, name: { type: "string", minLength: 1 }, type: { type: "string", enum: ["binary", "logic", "bus", "state", "event", "pulse"] }, role: { type: "string", enum: ["input", "output", "internal"] }, groupId: { type: "string", minLength: 1 }, width: { type: "integer", minimum: 1 }, initialValue: { type: ["string", "number"] } }, required: ["editorSessionId", "name", "type", "role", "groupId"], additionalProperties: false } },
  { name: "propose_create_transaction_group", description: "Propose a Transaction Group with a stable ID and optional semantic color. Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, name: { type: "string", minLength: 1 }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" } }, required: ["editorSessionId", "name"], additionalProperties: false } },
  { name: "propose_rename_transaction_group", description: "Propose renaming a Transaction Group identified by stable groupId. Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, groupId: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 } }, required: ["editorSessionId", "groupId", "name"], additionalProperties: false } },
  { name: "propose_delete_transaction_group", description: "Propose deleting a Transaction Group by stable groupId. Transactions in it will be ungrouped; the Preview reports the affected count.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, groupId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "groupId"], additionalProperties: false } },
  { name: "propose_create_time_group", description: "Propose creating a Time Group over canonical/source cycle boundaries [startCycle,endCycle). Creates a Preview only; a human must Validate and Apply it.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, name: { type: "string", minLength: 1 }, startCycle: { type: "integer", minimum: 0 }, endCycle: { type: "integer", minimum: 1 }, category: { type: "string" }, comment: { type: "string" } }, required: ["editorSessionId", "name", "startCycle", "endCycle"], additionalProperties: false } },
  { name: "propose_update_time_group", description: "Propose updating a Time Group by stable timeGroupId. startCycle/endCycle are canonical/source cycle boundaries; omitted fields are preserved. Creates a Preview only.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, timeGroupId: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 }, startCycle: { type: "integer", minimum: 0 }, endCycle: { type: "integer", minimum: 1 }, category: { type: "string" }, comment: { type: "string" } }, required: ["editorSessionId", "timeGroupId"], anyOf: [{ required: ["name"] }, { required: ["startCycle"] }, { required: ["endCycle"] }, { required: ["category"] }, { required: ["comment"] }], additionalProperties: false } },
  { name: "propose_delete_time_group", description: "Propose deleting the Time Group identified by stable timeGroupId. Existing SemanticCommand behavior promotes child groups and removes owned resume anchors; creates a Preview only.", inputSchema: { type: "object", properties: { editorSessionId: sessionInput, timeGroupId: { type: "string", minLength: 1 } }, required: ["editorSessionId", "timeGroupId"], additionalProperties: false } },
];

function timingSafeTokenEquals(candidate, expected = TOKEN) {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice("Bearer ".length);
  return undefined;
}

// Polling remains immediate, but calls are bound to an explicit Editor
// session. A shared token authorizes transport only; it never identifies
// which document is allowed to receive a call.
const editorSessions = new Map();
const sessionByTab = new Map();
/** Not-yet-dispatched calls, in arrival order, each bound to editorSessionId. */
const queuedCalls = [];
/** Dispatched to a poller, awaiting /bridge/respond, keyed by requestId. */
const inFlightCalls = new Map();
// #778 Phase 1: the Editor's own poll/respond traffic must never be mistaken for a real external MCP client.
// Only a request that actually lands on the `/mcp` JSON-RPC endpoint (the one path a real Claude Code / Codex /
// generic MCP client speaks) counts as "an external client is here" -- the Editor tab talking to /bridge/poll
// and /bridge/respond is this same local process's own transport, not a second party. `initialize` alone marks
// a client as seen (a real client must call it before anything else per the MCP handshake); tools/call also
// refreshes it so an idle-but-still-open client session doesn't look disconnected between calls.
let lastExternalClientSeenAt = 0;
// A client that hasn't spoken in this long is presumed gone rather than left "connected" forever after one
// handshake -- long enough to comfortably cover normal think-time between tool calls, short enough that a
// closed client session doesn't keep showing as connected indefinitely.
const EXTERNAL_CLIENT_TIMEOUT_MS = 120_000;
function markExternalClientSeen() { lastExternalClientSeenAt = Date.now(); }
function isExternalClientConnected() { return lastExternalClientSeenAt > 0 && Date.now() - lastExternalClientSeenAt < EXTERNAL_CLIENT_TIMEOUT_MS; }

function removeEverywhere(requestId) {
  const index = queuedCalls.findIndex((call) => call.requestId === requestId);
  if (index >= 0) queuedCalls.splice(index, 1);
  inFlightCalls.delete(requestId);
}

function staleSessionError(editorSessionId) {
  return new Error(`Editor session '${editorSessionId}' is stale or unavailable. Call list_editor_sessions and target a live editorSessionId; requests are never redirected to another tab.`);
}

function rejectSessionCalls(editorSessionId) {
  for (let index = queuedCalls.length - 1; index >= 0; index -= 1) {
    const call = queuedCalls[index];
    if (call.editorSessionId !== editorSessionId) continue;
    queuedCalls.splice(index, 1);
    clearTimeout(call.timeout);
    call.reject(staleSessionError(editorSessionId));
  }
  for (const [requestId, call] of inFlightCalls) {
    if (call.editorSessionId !== editorSessionId) continue;
    inFlightCalls.delete(requestId);
    clearTimeout(call.timeout);
    call.reject(staleSessionError(editorSessionId));
  }
}

function removeEditorSession(editorSessionId) {
  const session = editorSessions.get(editorSessionId);
  if (!session) return false;
  editorSessions.delete(editorSessionId);
  if (sessionByTab.get(session.tabId) === editorSessionId) sessionByTab.delete(session.tabId);
  rejectSessionCalls(editorSessionId);
  return true;
}

function pruneStaleSessions(now = Date.now()) {
  for (const [editorSessionId, session] of editorSessions) {
    if (now - session.lastSeenAt > EDITOR_SESSION_TIMEOUT_MS) removeEditorSession(editorSessionId);
  }
}

function registerEditorSession(body) {
  pruneStaleSessions();
  const { tabId, editorSessionId, documentId, documentTitle } = body ?? {};
  if (![tabId, editorSessionId, documentId].every((value) => typeof value === "string" && value.length > 0 && value.length <= 128)) {
    throw new Error("Editor poll requires tabId, editorSessionId, and documentId strings (1..128 characters). ");
  }
  if (typeof documentTitle !== "string" || documentTitle.length > 256) throw new Error("Editor poll requires a documentTitle string up to 256 characters.");
  const previousSessionId = sessionByTab.get(tabId);
  const existing = editorSessions.get(editorSessionId);
  if (existing && (existing.tabId !== tabId || existing.documentId !== documentId)) {
    throw staleSessionError(editorSessionId);
  }
  if (previousSessionId && previousSessionId !== editorSessionId) removeEditorSession(previousSessionId);
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const session = existing ?? { tabId, editorSessionId, documentId, createdAt: Date.now() };
  session.documentTitle = documentTitle;
  session.mode = ["Cycle", "Transaction", "Combined"].includes(body.mode) ? body.mode : "Unknown";
  session.revision = count(body.revision);
  session.cycleCount = count(body.cycleCount);
  session.signalCount = count(body.signalCount);
  session.transactionCount = count(body.transactionCount);
  session.annotationCount = count(body.annotationCount);
  session.bookmarkCount = count(body.bookmarkCount);
  session.lastSeenAt = Date.now();
  editorSessions.set(editorSessionId, session);
  sessionByTab.set(tabId, editorSessionId);
  return session;
}

function listEditorSessions() {
  pruneStaleSessions();
  return [...editorSessions.values()].map(({ editorSessionId, documentId, documentTitle, mode, revision, cycleCount, signalCount, transactionCount, annotationCount, bookmarkCount, createdAt, lastSeenAt }) => ({ editorSessionId, documentId, documentTitle, mode, revision, cycleCount, signalCount, transactionCount, annotationCount, bookmarkCount, createdAt, lastSeenAt }));
}

function queueToolCall(editorSessionId, tool, args) {
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    const timeout = setTimeout(() => {
      removeEverywhere(requestId);
      reject(new Error(`Timed out waiting for Editor session '${editorSessionId}' to respond. The target may be inactive; requests are never redirected to another tab.`));
    }, POLL_TIMEOUT_MS);
    queuedCalls.push({ requestId, editorSessionId, tool, args: args ?? {}, resolve, reject, timeout });
  });
}

/** A tool call that the Editor executed but could not report as a result (rejected proposal, oversize result). */
class ToolExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

/** Oversize request body; `head` keeps the first bytes so a respond can still be matched to its call. */
class BodyTooLargeError extends Error {
  constructor(limitBytes, head) {
    super(`Request body exceeds the ${limitBytes}-byte limit for this endpoint.`);
    this.name = "BodyTooLargeError";
    this.head = head;
  }
}

function readJsonBody(req, limitBytes = REQUEST_BODY_LIMIT_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let overflowed = false;
    let head = "";
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > DRAIN_CEILING_BYTES) { req.destroy(); reject(new BodyTooLargeError(limitBytes, head)); return; }
      if (overflowed) return;
      if (size > limitBytes) {
        overflowed = true;
        head = Buffer.concat([...chunks, chunk]).subarray(0, 4096).toString("utf-8");
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (overflowed) { reject(new BodyTooLargeError(limitBytes, head)); return; }
      if (chunks.length === 0) { resolve(undefined); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); } catch { reject(new Error("Invalid JSON body.")); }
    });
    req.on("error", reject);
  });
}

function bodyErrorStatus(error) {
  return error instanceof BodyTooLargeError ? 413 : 400;
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

async function handleMcp(res, body) {
  const { id, method, params } = body ?? {};
  const reply = (result) => sendJson(res, 200, { jsonrpc: "2.0", id: id ?? null, result });
  const replyError = (code, message) => sendJson(res, 200, { jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (method === "initialize") { markExternalClientSeen(); reply({ protocolVersion: "2024-11-05", serverInfo: { name: "timing-chart-v2-ai-bridge", version: "0.0.1" }, capabilities: { tools: {} } }); return; }
  if (method === "tools/list") { reply({ tools: TOOL_CATALOG }); return; }
  if (method === "tools/call") {
    const name = params?.name;
    if (name === "list_editor_sessions") { markExternalClientSeen(); reply({ content: [{ type: "text", text: JSON.stringify(listEditorSessions()) }], isError: false }); return; }
    if (typeof name !== "string" || !(READ_TOOLS.has(name) || VIEW_ONLY_TOOLS.has(name) || PROPOSAL_TOOLS.has(name))) { replyError(-32601, `Unknown or unauthorized tool '${name}'. Only list_editor_sessions, ${[...READ_TOOLS, ...VIEW_ONLY_TOOLS, ...PROPOSAL_TOOLS].join(", ")} are exposed.`); return; }
    const args = params?.arguments;
    const editorSessionId = args?.editorSessionId;
    if (typeof editorSessionId !== "string" || editorSessionId.length === 0) { replyError(-32602, `Tool '${name}' requires an explicit editorSessionId from list_editor_sessions.`); return; }
    pruneStaleSessions();
    if (!editorSessions.has(editorSessionId)) { replyError(-32004, staleSessionError(editorSessionId).message); return; }
    if (name === "submit_proposal") {
      const operations = args?.operations;
      if (!Number.isSafeInteger(args?.baseRevision) || args.baseRevision < 0) { replyError(-32602, "submit_proposal requires a non-negative integer baseRevision."); return; }
      if (args.baseRevision !== editorSessions.get(editorSessionId)?.revision) { replyError(-32009, "Stale baseRevision. Read the current Editor session and regenerate the complete proposal."); return; }
      if (!Array.isArray(operations) || operations.length < 1 || operations.length > 50) { replyError(-32602, "submit_proposal requires between 1 and 50 typed operations."); return; }
      const invalid = operations.findIndex((operation) => !operation || typeof operation !== "object" || !BATCHABLE_PROPOSAL_TOOLS.includes(operation.tool) || !operation.arguments || typeof operation.arguments !== "object" || Array.isArray(operation.arguments));
      if (invalid >= 0) { replyError(-32602, `operations[${invalid}] must use an allowlisted typed proposal tool and arguments object.`); return; }
    }
    markExternalClientSeen();
    try {
      const { editorSessionId: _targetSessionId, ...toolArgs } = args;
      const result = await queueToolCall(editorSessionId, name, toolArgs);
      reply({ content: [{ type: "text", text: JSON.stringify(result) }], isError: false });
    } catch (error) {
      // A rejection the Editor reported (e.g. a proposal that failed scope or
      // validation) is a tool-level failure: deliver it as a result with
      // isError set, so MCP clients surface it instead of treating it as success.
      if (error instanceof ToolExecutionError) { reply({ content: [{ type: "text", text: error.message }], isError: true }); return; }
      replyError(error instanceof Error && error.message.startsWith("Editor session '") ? -32004 : -32000, error instanceof Error ? error.message : "Tool call failed.");
    }
    return;
  }
  replyError(-32601, `Unknown method '${method}'.`);
}

// The Editor tab (served from Vite's own localhost:<dev-port> origin) is
// cross-origin from this bridge, so the browser sends a CORS preflight
// before every request. `*` is safe to allow here specifically because
// this process never trusts origin/referer for authorization -- every
// real request still needs the bearer token below, which a page on an
// unrelated origin has no way to know; CORS only ever gates the
// *transport*, not the actual authorization decision.
/** An oversize respond still settles its pending MCP call with a clear error, so the caller does not wait out the poll timeout. */
function failOversizeRespond(head) {
  const requestId = /"requestId"\s*:\s*"([^"\\]{1,128})"/.exec(head)?.[1];
  const editorSessionId = /"editorSessionId"\s*:\s*"([^"\\]{1,128})"/.exec(head)?.[1];
  const call = requestId ? inFlightCalls.get(requestId) : undefined;
  if (!call || call.editorSessionId !== editorSessionId) return;
  removeEverywhere(requestId);
  clearTimeout(call.timeout);
  call.reject(new ToolExecutionError(`The Editor's result exceeded the ${RESPOND_BODY_LIMIT_BYTES}-byte bridge limit. Narrow the request (for example with visibleRange or groupId filters) and retry.`));
}

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
}

const server = createServer(async (req, res) => {
  applyCors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const expectedToken = url.pathname === "/mcp" ? TOKEN : ["/bridge/poll", "/bridge/respond", "/bridge/close"].includes(url.pathname) ? EDITOR_TOKEN : undefined;
  if (!expectedToken || !timingSafeTokenEquals(bearerToken(req), expectedToken)) { sendJson(res, 401, { error: "Missing or invalid bridge token for this endpoint." }); return; }

  if (req.method === "POST" && url.pathname === "/mcp") {
    let body;
    try { body = await readJsonBody(req); } catch (error) { sendJson(res, bodyErrorStatus(error), { error: error instanceof Error ? error.message : "Bad request." }); return; }
    await handleMcp(res, body);
    return;
  }

  if (req.method === "POST" && url.pathname === "/bridge/poll") {
    let body;
    try { body = await readJsonBody(req); } catch (error) { sendJson(res, bodyErrorStatus(error), { error: error instanceof Error ? error.message : "Bad request." }); return; }
    let session;
    try { session = registerEditorSession(body); } catch (error) { sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid Editor session." }); return; }
    const nextIndex = queuedCalls.findIndex((call) => call.editorSessionId === session.editorSessionId);
    const next = nextIndex >= 0 ? queuedCalls.splice(nextIndex, 1)[0] : undefined;
    if (next) {
      inFlightCalls.set(next.requestId, next);
      sendJson(res, 200, { requestId: next.requestId, editorSessionId: session.editorSessionId, tool: next.tool, arguments: next.args, externalClientConnected: isExternalClientConnected() });
      return;
    }
    sendJson(res, 200, { requestId: null, editorSessionId: session.editorSessionId, externalClientConnected: isExternalClientConnected() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/bridge/close") {
    let body;
    try { body = await readJsonBody(req); } catch (error) { sendJson(res, bodyErrorStatus(error), { error: error instanceof Error ? error.message : "Bad request." }); return; }
    const session = typeof body?.editorSessionId === "string" ? editorSessions.get(body.editorSessionId) : undefined;
    if (session && session.tabId !== body.tabId) { sendJson(res, 403, { error: "Editor session does not belong to this tabId." }); return; }
    const closed = session ? removeEditorSession(session.editorSessionId) : false;
    sendJson(res, 200, { closed });
    return;
  }

  if (req.method === "POST" && url.pathname === "/bridge/respond") {
    let body;
    try { body = await readJsonBody(req, RESPOND_BODY_LIMIT_BYTES); } catch (error) {
      if (error instanceof BodyTooLargeError) failOversizeRespond(error.head);
      sendJson(res, bodyErrorStatus(error), { error: error instanceof Error ? error.message : "Bad request." });
      return;
    }
    pruneStaleSessions();
    const call = typeof body?.requestId === "string" ? inFlightCalls.get(body.requestId) : undefined;
    if (!call) { sendJson(res, 404, { error: "Unknown or already-resolved requestId." }); return; }
    if (body.editorSessionId !== call.editorSessionId) { sendJson(res, 403, { error: "Response editorSessionId does not match the targeted request." }); return; }
    if (!editorSessions.has(call.editorSessionId)) { removeEverywhere(call.requestId); clearTimeout(call.timeout); call.reject(staleSessionError(call.editorSessionId)); sendJson(res, 410, { error: "Target Editor session is stale." }); return; }
    removeEverywhere(body.requestId);
    clearTimeout(call.timeout);
    if (body.error) call.reject(new ToolExecutionError(String(body.error)));
    else call.resolve(body.result);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
});

const sessionSweep = setInterval(pruneStaleSessions, 1_000);
sessionSweep.unref();

server.listen(PORT, HOST, () => {
  const address = server.address();
  const listeningPort = typeof address === "object" && address ? address.port : PORT;
  // eslint-disable-next-line no-console
  console.log(`[ai-bridge] listening on http://${HOST}:${listeningPort} (localhost-only)`);
  // A token supplied through the environment is already known to the person
  // who set it, so only a freshly generated token is echoed to stdout.
  console.log(`[ai-bridge] MCP client token: ${TOKEN_FROM_ENV ? "(set by AI_BRIDGE_TOKEN; not echoed)" : TOKEN}`);
  console.log(`[ai-bridge] Editor transport token: ${EDITOR_TOKEN_FROM_ENV ? "(set by AI_BRIDGE_EDITOR_TOKEN; not echoed)" : EDITOR_TOKEN}`);
  console.log("[ai-bridge] Use the MCP client token only in your MCP client; paste the Editor transport token into AI Settings.");
});

export { HOST, PORT, TOKEN, EDITOR_TOKEN, server };
